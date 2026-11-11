/**
 * ミニゲームのランキングを見る・消す（スタッフ用。.env.public の URL と合言葉を使う）。
 * ゲーム：tsumi（つみつみ串）・catch（流れ星キャッチ）・flight（とりこフライト）
 * 使い方: npm run ranking -- catch（今日） / npm run ranking -- catch all（歴代） / npm run ranking -- catch 2026-11-21（その日）
 *         npm run ranking -- remove a1b2c3（そのIDの記録を、すべてのゲームの今日・歴代・過去の日から消す）
 *         npm run ranking -- add catch 名前 4520 [a1b2c3]（記録を手で載せる。IDを付けると、その人の記録にする）
 */
import { GAME_IDS, GAME_NAMES, type GameId } from "../src/lib/ranking";

type Row = { rank: number; name: string; tag: string; score: number };

const LABELS: Record<string, string> = { today: "今日", all: "歴代" };

try {
  process.loadEnvFile(".env.public");
} catch {
  // 環境変数で直接渡してもよい
}

const base = process.env.PUBLIC_STATUS_URL?.replace(/\/$/, "");
const token = process.env.PUBLIC_STATUS_TOKEN;
const headers = { Authorization: `Bearer ${token}` };

const isGame = (v: string | undefined): v is GameId => (GAME_IDS as readonly string[]).includes(v ?? "");
const gameHelp = GAME_IDS.map((g) => `${g}（${GAME_NAMES[g]}）`).join("・");

async function main() {
  if (!base || !token) {
    console.error(".env.public に PUBLIC_STATUS_URL と PUBLIC_STATUS_TOKEN を設定してください");
    process.exit(1);
  }
  const [command, ...rest] = process.argv.slice(2);

  if (command === "add") {
    const [game, name, score, tag] = rest;
    if (!isGame(game) || !name || !/^\d+$/.test(score ?? "")) {
      console.error(`ゲーム・名前・点数を指定してください（例：npm run ranking -- add catch とりこ 4520 a1b2c3。IDはなくてもよい）\nゲーム：${gameHelp}`);
      process.exit(1);
    }
    const res = await fetch(`${base}/api/ranking/add`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ game, name, score: Number(score), tag }),
    });
    const body = (await res.json()) as { rank?: number; allRank?: number; error?: string };
    console.log(body.error ?? `${GAME_NAMES[game]}に ${name} さんの ${score}点 を載せました（今日 ${body.rank}位 ／ 歴代 ${body.allRank}位）`);
    return;
  }

  if (command === "remove") {
    const [tag] = rest;
    if (!tag || !/^[a-z0-9]{1,12}$/.test(tag)) {
      console.error("消す記録のIDを指定してください（一覧の「ID」の列。例：npm run ranking -- remove a1b2c3）");
      process.exit(1);
    }
    const res = await fetch(`${base}/api/ranking?tag=${tag}`, { method: "DELETE", headers });
    const body = (await res.json()) as { removed?: number; error?: string };
    console.log(body.error ?? (body.removed ? `ID ${tag} の記録を消しました（${body.removed}件）` : `ID ${tag} の記録はありません`));
    return;
  }

  if (!isGame(command)) {
    console.error(`ゲームを指定してください（例：npm run ranking -- catch all）\nゲーム：${gameHelp}`);
    process.exit(1);
  }
  const board = rest[0] ?? "today";
  if (!/^(today|all|\d{4}-\d{2}-\d{2})$/.test(board)) {
    console.error("today・all か、日付（例：2026-11-21）を指定してください");
    process.exit(1);
  }
  const res = await fetch(`${base}/api/ranking?all=1&game=${command}&board=${board}`, { headers });
  const body = (await res.json()) as { rows?: Row[]; error?: string };
  if (!body.rows) {
    console.error(body.error ?? `取得できませんでした（${res.status}）`);
    process.exit(1);
  }
  console.log(`【${GAME_NAMES[command]}・${LABELS[board] ?? board}】`);
  if (body.rows.length === 0) console.log("記録はまだありません");
  for (const r of body.rows) console.log(`${String(r.rank).padStart(3)}位  ${String(r.score).padStart(5)}点  ID ${r.tag}  ${r.name}`);
}

main();
