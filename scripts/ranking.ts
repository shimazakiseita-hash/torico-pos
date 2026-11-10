/**
 * ミニゲームのランキングを見る・消す（スタッフ用。.env.public の URL と合言葉を使う）。
 * 使い方: npm run ranking（今日） / npm run ranking -- all（歴代）
 *         npm run ranking -- 2026-11-21（その日） / npm run ranking -- remove a1b2c3（そのIDの記録を、今日・歴代・過去の日すべてから消す）
 *         npm run ranking -- add 名前 4520 [a1b2c3]（記録を手で載せる。IDを付けると、その人の記録にする）
 */
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

async function main() {
  if (!base || !token) {
    console.error(".env.public に PUBLIC_STATUS_URL と PUBLIC_STATUS_TOKEN を設定してください");
    process.exit(1);
  }
  const [command, arg, ...rest] = process.argv.slice(2);

  if (command === "add") {
    const [score, tag] = rest;
    if (!arg || !/^\d+$/.test(score ?? "")) {
      console.error("名前と点数を指定してください（例：npm run ranking -- add とりこ 4520 a1b2c3。IDはなくてもよい）");
      process.exit(1);
    }
    const res = await fetch(`${base}/api/ranking/add`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: arg, score: Number(score), tag }),
    });
    const body = (await res.json()) as { rank?: number; allRank?: number; error?: string };
    console.log(body.error ?? `${arg} さんの ${score}点 を載せました（今日 ${body.rank}位 ／ 歴代 ${body.allRank}位）`);
    return;
  }

  if (command === "remove") {
    if (!arg || !/^[a-z0-9]{1,12}$/.test(arg)) {
      console.error("消す記録のIDを指定してください（一覧の「ID」の列。例：npm run ranking -- remove a1b2c3）");
      process.exit(1);
    }
    const res = await fetch(`${base}/api/ranking?tag=${arg}`, { method: "DELETE", headers });
    const body = (await res.json()) as { removed?: number; error?: string };
    console.log(body.error ?? (body.removed ? `ID ${arg} の記録を消しました（${body.removed}件）` : `ID ${arg} の記録はありません`));
    return;
  }

  const board = command ?? "today";
  if (!/^(today|all|\d{4}-\d{2}-\d{2})$/.test(board)) {
    console.error("today・all か、日付（例：2026-11-21）を指定してください");
    process.exit(1);
  }
  const res = await fetch(`${base}/api/ranking?all=1&board=${board}`, { headers });
  const body = (await res.json()) as { rows?: Row[]; error?: string };
  if (!body.rows) {
    console.error(body.error ?? `取得できませんでした（${res.status}）`);
    process.exit(1);
  }
  console.log(`【${LABELS[board] ?? board}】`);
  if (body.rows.length === 0) console.log("記録はまだありません");
  for (const r of body.rows) console.log(`${String(r.rank).padStart(3)}位  ${String(r.score).padStart(4)}点  ID ${r.tag}  ${r.name}`);
}

main();
