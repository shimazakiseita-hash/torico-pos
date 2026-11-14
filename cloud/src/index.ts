/**
 * お客さん向け呼び出し状況ページ（Cloudflare Workers）。
 * サーバーPCの public-sync が今日の番号と状態だけを PUT し、お客さんのスマホが GET で読む。
 * ミニゲーム（cloud/public/game/、静的ファイル）のランキング（ゲームごとに今日・歴代）と、営業終了の表示の設定もここに置く
 */
import { DurableObject } from "cloudflare:workers";
import { isToday, lookupNumber, type PublicStatus } from "../../src/lib/publicStatus";
import {
  GAME_IDS,
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
  type GameId,
  type RankingEntry,
} from "../../src/lib/ranking";
import { gameIdSchema, publicStatusSchema, rankingSubmitSchema, siteConfigSchema } from "../../src/lib/schemas";
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

/** 保存のキー：ranking:<ゲーム>:2026-11-21（日ごと）と ranking:<ゲーム>:all（歴代） */
const dayKey = (game: GameId, date: string) => `ranking:${game}:${date}`;
const allKey = (game: GameId) => `ranking:${game}:all`;

function toRows(entries: readonly RankingEntry[]): RankingRow[] {
  return sortRanking(entries).map((e, i) => ({ rank: i + 1, name: e.name, tag: playerTag(e.player), score: e.score }));
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

  private async day(game: GameId, date: string): Promise<RankingEntry[]> {
    return (await this.ctx.storage.get<RankingEntry[]>(dayKey(game, date))) ?? [];
  }

  /** 歴代。まだなければ、これまでの日ごとのランキングから作る */
  private async allTime(game: GameId): Promise<RankingEntry[]> {
    const saved = await this.ctx.storage.get<RankingEntry[]>(allKey(game));
    if (saved) return saved;
    const days = await this.ctx.storage.list<RankingEntry[]>({ prefix: `ranking:${game}:2` });
    const merged = mergeBoards([...days.keys()].sort().map((k) => days.get(k) ?? []));
    await this.ctx.storage.put(allKey(game), merged);
    return merged;
  }

  private async entries(game: GameId, board: BoardName | string): Promise<RankingEntry[]> {
    if (board === "all") return this.allTime(game);
    return this.day(game, board === "today" ? jstDateKey() : board);
  }

  async ranking(game: GameId, board: BoardName): Promise<RankingRow[]> {
    return toRows(await this.entries(game, board)).slice(0, RANKING_SIZE);
  }

  /** スタッフ用：全員分（board のほか、YYYY-MM-DD でその日も見られる） */
  async rows(game: GameId, board: BoardName | string): Promise<RankingRow[]> {
    return toRows(await this.entries(game, board));
  }

  /** 今日 と 歴代 の両方に記録する。合言葉は1回きり（使った番号は期限まで覚えておく） */
  async submit(game: GameId, entry: RankingEntry, ip: string, sessionId: string): Promise<SubmitResult> {
    const now = Date.now();
    const allowed = allowSubmission(this.submissions.get(ip) ?? [], now);
    this.submissions.set(ip, allowed.times);
    if (!allowed.ok) return { ok: false, error: "すこし じかんを おいてから のせてね" };
    if (await this.ctx.storage.get(`used:${sessionId}`)) return { ok: false, error: "この かいの きろくは もう のせたよ" };
    await this.ctx.storage.put(`used:${sessionId}`, now + SESSION_TTL_MS);
    await this.pruneUsed(now);
    return this.record(game, entry);
  }

  /** スタッフ用：記録を手で載せる（古いページで遊んで登録できなかった人など）。tag を渡すと、そのIDの人の記録にする */
  async add(game: GameId, name: string, score: number, tag: string | null): Promise<SubmitResult> {
    const found = tag ? (await this.allTime(game)).find((e) => playerTag(e.player) === tag) : undefined;
    if (tag && !found) return { ok: false, error: `ID ${tag} の人が見つかりません` };
    const player = found?.player ?? [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
    return this.record(game, { player, name, score, at: new Date().toISOString() });
  }

  private async record(game: GameId, entry: RankingEntry): Promise<SubmitResult> {
    const date = jstDateKey(new Date(entry.at));
    const today = upsertBest(await this.day(game, date), entry);
    const all = upsertBest(await this.allTime(game), entry);
    await this.ctx.storage.put({ [dayKey(game, date)]: today, [allKey(game)]: all });
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
    for (const game of GAME_IDS) await this.allTime(game);
    const boards = await this.ctx.storage.list<RankingEntry[]>({ prefix: "ranking:" });
    let removed = 0;
    const updates: Record<string, RankingEntry[]> = {};
    for (const [key, board] of boards) {
      const next = board.filter((e) => playerTag(e.player) !== tag);
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
        // 前の営業日の状況は返さない（番号は毎日1からなので、今日の整理券と混ざる）
        const saved = await store.read();
        const status = saved && isToday(saved) ? saved : null;
        const n = Number(url.searchParams.get("n"));
        const lookup = status && Number.isInteger(n) && n >= 1 ? lookupNumber(status, n) : null;
        const publicStatus = status ? Object.fromEntries(Object.entries(status).filter(([key]) => key !== "served")) : null;
        return json({ status: publicStatus, lookup, config: await store.config() });
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
      const body = (await readJson(request)) as { game?: unknown; name?: unknown; score?: unknown; tag?: unknown } | undefined;
      const game = gameIdSchema.safeParse(body?.game);
      if (!game.success) return json({ error: `game を指定してください（${GAME_IDS.join("・")}）` }, 400);
      const name = typeof body?.name === "string" ? normalizeName(body.name) : null;
      const score = body?.score;
      const tag = typeof body?.tag === "string" && /^[a-z0-9]{1,12}$/.test(body.tag) ? body.tag : null;
      if (!name || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100000) return json({ error: "名前（1〜10文字）と点数を指定してください" }, 400);
      const result = await store.add(game.data, name, score, tag);
      return result.ok ? json(result) : json({ error: result.error }, 400);
    }

    if (url.pathname === "/api/ranking") {
      if (request.method === "GET") {
        const game = gameIdSchema.safeParse(url.searchParams.get("game"));
        if (!game.success) return json({ error: `game を指定してください（${GAME_IDS.join("・")}）` }, 400);
        const param = url.searchParams.get("board") ?? "today";
        // スタッフ用（?all=1 は認証つき）：全員分を見る。board=YYYY-MM-DD でその日も
        if (url.searchParams.has("all")) {
          if (!authorized(request, env.PUSH_TOKEN)) return json({ error: "認証に失敗しました" }, 401);
          if (!/^(today|all|\d{4}-\d{2}-\d{2})$/.test(param)) return json({ error: "board が不正です" }, 400);
          return json({ rows: await store.rows(game.data, param) });
        }
        const board: BoardName = param === "all" ? "all" : "today";
        return json({ game: game.data, board, top: await store.ranking(game.data, board) });
      }
      if (request.method === "POST") {
        // お客さん（子どもも）に見せるメッセージなので、ひらがなでやさしく
        const parsed = rankingSubmitSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ error: "形式が不正です" }, 400);
        const { game, player, score } = parsed.data;
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
        if (!isPlausibleScore(game, score, playMs)) return json({ error: "きろくを たしかめられなかったよ" }, 400);
        const ip = request.headers.get("CF-Connecting-IP") ?? "local";
        const result = await store.submit(game, { player, name, score, at: new Date(now).toISOString() }, ip, session.id);
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
