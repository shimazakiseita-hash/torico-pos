/**
 * お客さん向け呼び出し状況ページ（Cloudflare Workers）。
 * サーバーPCの public-sync が番号だけを PUT し、お客さんのスマホが GET で読む。
 * ミニゲームのランキング（今日・歴代）と、営業終了の表示の設定もここに置く
 */
import { DurableObject } from "cloudflare:workers";
import { lookupNumber, type PublicStatus } from "../../src/lib/publicStatus";
import {
  RANKING_SIZE,
  allowSubmission,
  containsNgWord,
  isPlausibleScore,
  jstDateKey,
  mergeBoards,
  normalizeName,
  playerTag,
  sortRanking,
  upsertBest,
  type RankingEntry,
} from "../../src/lib/ranking";
import { publicStatusSchema, rankingSubmitSchema, siteConfigSchema } from "../../src/lib/schemas";
import { SESSION_TTL_MS, createSession, verifySession } from "../../src/lib/session";
import { PAGE_HTML } from "./page";

type Env = {
  STATUS: DurableObjectNamespace<StatusStore>;
  PUSH_TOKEN?: string;
  SESSION_SECRET?: string; // ミニゲームの「その場かぎりの合言葉」にしるしをつける鍵（wrangler secret put SESSION_SECRET）
};

type StoredStatus = PublicStatus & { updatedAt: string };

export type RankingRow = { rank: number; name: string; tag: string; score: number };
export type SubmitResult =
  | { ok: true; rank: number; allRank: number; top: RankingRow[] }
  | { ok: false; error: string };
export type SiteConfig = { closed: boolean };
/** today：今日（日ごと）、all：歴代（これまでの最高点） */
export type BoardName = "today" | "all";

const DAY_PREFIX = "ranking:2"; // ranking:2026-11-21 のような日ごとのキー
const ALL_KEY = "ranking:all";

function toRows(entries: readonly RankingEntry[]): RankingRow[] {
  return sortRanking(entries).map((e, i) => ({ rank: i + 1, name: e.name, tag: tagOf(e), score: e.score }));
}

/** 番号で登録していたころの記録（player がない）も表示・削除できるように */
function tagOf(e: RankingEntry): string {
  return e.player ? playerTag(e.player) : `n${(e as { number?: number }).number ?? ""}`;
}

/** 最新の呼び出し状況・ランキング・ページの設定を持つ */
export class StatusStore extends DurableObject<Env> {
  /** 回線ごとの最近の登録時刻（連続登録を止めるため。消えても困らないのでメモリだけ） */
  private submissions = new Map<string, number[]>();

  async read(): Promise<StoredStatus | null> {
    return (await this.ctx.storage.get<StoredStatus>("status")) ?? null;
  }

  async write(status: PublicStatus): Promise<void> {
    await this.ctx.storage.put("status", { ...status, updatedAt: new Date().toISOString() });
  }

  async config(): Promise<SiteConfig> {
    return (await this.ctx.storage.get<SiteConfig>("config")) ?? { closed: false };
  }

  async setConfig(config: SiteConfig): Promise<void> {
    await this.ctx.storage.put("config", config);
  }

  private async day(date: string): Promise<RankingEntry[]> {
    return (await this.ctx.storage.get<RankingEntry[]>(`ranking:${date}`)) ?? [];
  }

  /** 歴代。まだなければ、これまでの日ごとのランキングから作る */
  private async allTime(): Promise<RankingEntry[]> {
    const saved = await this.ctx.storage.get<RankingEntry[]>(ALL_KEY);
    if (saved) return saved;
    const days = await this.ctx.storage.list<RankingEntry[]>({ prefix: DAY_PREFIX });
    const merged = mergeBoards([...days.keys()].sort().map((k) => days.get(k) ?? []));
    await this.ctx.storage.put(ALL_KEY, merged);
    return merged;
  }

  private async entries(board: BoardName | string): Promise<RankingEntry[]> {
    if (board === "all") return this.allTime();
    return this.day(board === "today" ? jstDateKey() : board);
  }

  async ranking(board: BoardName): Promise<RankingRow[]> {
    return toRows(await this.entries(board)).slice(0, RANKING_SIZE);
  }

  /** スタッフ用：全員分（board のほか、YYYY-MM-DD でその日も見られる） */
  async rows(board: BoardName | string): Promise<RankingRow[]> {
    return toRows(await this.entries(board));
  }

  /** 今日 と 歴代 の両方に記録する。合言葉は1回きり（使った番号は期限まで覚えておく） */
  async submit(entry: RankingEntry, ip: string, sessionId: string): Promise<SubmitResult> {
    const now = Date.now();
    const allowed = allowSubmission(this.submissions.get(ip) ?? [], now);
    this.submissions.set(ip, allowed.times);
    if (!allowed.ok) return { ok: false, error: "すこし じかんを おいてから のせてね" };
    if (await this.ctx.storage.get(`used:${sessionId}`)) return { ok: false, error: "この かいの きろくは もう のせたよ" };
    await this.ctx.storage.put(`used:${sessionId}`, now + SESSION_TTL_MS);
    await this.pruneUsed(now);
    return this.record(entry);
  }

  /** スタッフ用：記録を手で載せる（古いページで遊んで登録できなかった人など）。tag を渡すと、そのIDの人の記録にする */
  async add(name: string, score: number, tag: string | null): Promise<SubmitResult> {
    const found = tag ? (await this.allTime()).find((e) => e.player && tagOf(e) === tag) : undefined;
    if (tag && !found) return { ok: false, error: `ID ${tag} の人が見つかりません` };
    const player = found?.player ?? [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return this.record({ player, name, score, at: new Date().toISOString() });
  }

  private async record(entry: RankingEntry): Promise<SubmitResult> {
    const date = jstDateKey(new Date(entry.at));
    const today = upsertBest(await this.day(date), entry);
    const all = upsertBest(await this.allTime(), entry);
    await this.ctx.storage.put({ [`ranking:${date}`]: today, [ALL_KEY]: all });
    const rows = toRows(today);
    const rankOf = (list: RankingRow[]) => list.find((r) => r.tag === playerTag(entry.player))!.rank;
    return { ok: true, rank: rankOf(rows), allRank: rankOf(toRows(all)), top: rows.slice(0, RANKING_SIZE) };
  }

  /** 期限の過ぎた「使った合言葉」の番号を忘れる */
  private async pruneUsed(now: number): Promise<void> {
    const used = await this.ctx.storage.list<number>({ prefix: "used:", limit: 200 });
    const expired = [...used].filter(([, until]) => until < now).map(([key]) => key);
    if (expired.length) await this.ctx.storage.delete(expired);
  }

  /** 不適切な名前などは、今日・歴代・過去の日のどこからでも消す。消した記録の数を返す */
  async remove(tag: string): Promise<number> {
    await this.allTime();
    const boards = await this.ctx.storage.list<RankingEntry[]>({ prefix: "ranking:" });
    let removed = 0;
    const updates: Record<string, RankingEntry[]> = {};
    for (const [key, board] of boards) {
      const next = board.filter((e) => tagOf(e) !== tag);
      if (next.length < board.length) {
        removed += board.length - next.length;
        updates[key] = next;
      }
    }
    if (removed) await this.ctx.storage.put(updates);
    return removed;
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

function authorized(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  const given = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const store = env.STATUS.get(env.STATUS.idFromName("main"));

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(PAGE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
    }

    if (url.pathname === "/api/status") {
      if (request.method === "GET") {
        const status = await store.read();
        const n = Number(url.searchParams.get("n"));
        const lookup = status && Number.isInteger(n) && n >= 1 ? lookupNumber(status, n) : null;
        return json({ status, lookup, config: await store.config() });
      }
      if (request.method === "PUT") {
        if (!authorized(request, env.PUSH_TOKEN)) return json({ error: "認証に失敗しました" }, 401);
        const parsed = publicStatusSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ error: "形式が不正です" }, 400);
        await store.write(parsed.data);
        return new Response(null, { status: 204 });
      }
      return json({ error: "許可されていないメソッドです" }, 405);
    }

    if (url.pathname === "/api/config") {
      if (request.method === "GET") return json(await store.config());
      if (request.method === "PUT") {
        if (!authorized(request, env.PUSH_TOKEN)) return json({ error: "認証に失敗しました" }, 401);
        const parsed = siteConfigSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ error: "形式が不正です" }, 400);
        await store.setConfig(parsed.data);
        return json(parsed.data);
      }
      return json({ error: "許可されていないメソッドです" }, 405);
    }

    // ミニゲームの開始：その場かぎりの合言葉を発行する（開始時刻はサーバーの時計）
    if (url.pathname === "/api/play" && request.method === "POST") {
      if (!env.SESSION_SECRET) return json({ error: "準備中です" }, 503);
      const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
      return json({ session: await createSession(env.SESSION_SECRET, Date.now(), id) });
    }

    // スタッフ用：記録を手で載せる
    if (url.pathname === "/api/ranking/add" && request.method === "POST") {
      if (!authorized(request, env.PUSH_TOKEN)) return json({ error: "認証に失敗しました" }, 401);
      const body = (await readJson(request)) as { name?: unknown; score?: unknown; tag?: unknown } | undefined;
      const name = typeof body?.name === "string" ? normalizeName(body.name) : null;
      const score = body?.score;
      const tag = typeof body?.tag === "string" && /^[a-z0-9]{1,12}$/.test(body.tag) ? body.tag : null;
      if (!name || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100000) return json({ error: "名前（1〜10文字）と点数を指定してください" }, 400);
      const result = await store.add(name, score, tag);
      return result.ok ? json(result) : json({ error: result.error }, 400);
    }

    if (url.pathname === "/api/ranking") {
      if (request.method === "GET") {
        const param = url.searchParams.get("board") ?? "today";
        // スタッフ用（?all=1 は認証つき）：全員分を見る。board=YYYY-MM-DD でその日も
        if (url.searchParams.has("all")) {
          if (!authorized(request, env.PUSH_TOKEN)) return json({ error: "認証に失敗しました" }, 401);
          if (!/^(today|all|\d{4}-\d{2}-\d{2})$/.test(param)) return json({ error: "board が不正です" }, 400);
          return json({ rows: await store.rows(param) });
        }
        const board: BoardName = param === "all" ? "all" : "today";
        return json({ board, top: await store.ranking(board) });
      }
      if (request.method === "POST") {
        // お客さん（子どもも）に見せるメッセージなので、ひらがなでやさしく
        const parsed = rankingSubmitSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ error: "形式が不正です" }, 400);
        const { player, score } = parsed.data;
        const name = normalizeName(parsed.data.name);
        if (!name) return json({ error: "なまえは 1〜10もじに してね" }, 400);
        if (containsNgWord(name)) return json({ error: "その なまえは つかえないよ。べつの なまえに してね" }, 400);
        // 遊んだ時間は、合言葉に入っている開始時刻（サーバーの時計）から測る
        const now = Date.now();
        const session = env.SESSION_SECRET ? await verifySession(env.SESSION_SECRET, parsed.data.session, now) : null;
        if (!session || !session.ok) {
          const expired = session && !session.ok && session.reason === "expired";
          return json({ error: expired ? "じかんが たちすぎたよ。もういっかい あそんでね" : "きろくを たしかめられなかったよ" }, 400);
        }
        const playMs = now - session.startedAt;
        if (!isPlausibleScore(score, playMs)) return json({ error: "きろくを たしかめられなかったよ" }, 400);
        const ip = request.headers.get("CF-Connecting-IP") ?? "local";
        const result = await store.submit({ player, name, score, at: new Date(now).toISOString() }, ip, session.id);
        return result.ok ? json(result) : json({ error: result.error }, 400);
      }
      if (request.method === "DELETE") {
        if (!authorized(request, env.PUSH_TOKEN)) return json({ error: "認証に失敗しました" }, 401);
        const tag = url.searchParams.get("tag") ?? "";
        if (!/^[a-z0-9]{1,12}$/.test(tag)) return json({ error: "tag を指定してください" }, 400);
        return json({ removed: await store.remove(tag) });
      }
      return json({ error: "許可されていないメソッドです" }, 405);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
