/**
 * お客さん向けページを営業終了の表示にする・戻す（スタッフ用。.env.public の URL と合言葉を使う）。
 * 使い方: npm run closing（いまの設定を見る）
 *         npm run closing -- on（営業終了にする。今日と歴代のランキングを backups/ に保存）
 *         npm run closing -- off（番号の表示に戻す）
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { businessDayOf } from "../src/lib/businessDay";

type Config = { closed: boolean };

try {
  process.loadEnvFile(".env.public");
} catch {
  // 環境変数で直接渡してもよい
}

const base = process.env.PUBLIC_STATUS_URL?.replace(/\/$/, "");
const token = process.env.PUBLIC_STATUS_TOKEN;
const auth = { Authorization: `Bearer ${token}` };

async function getConfig(): Promise<Config> {
  return (await (await fetch(`${base}/api/config`)).json()) as Config;
}

async function putConfig(config: Config): Promise<void> {
  const res = await fetch(`${base}/api/config`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`設定を変えられませんでした（${res.status} ${await res.text()}）`);
}

/** 念のため、ランキングをこのPCにも残す */
async function saveRanking(board: string, file: string): Promise<number> {
  const res = await fetch(`${base}/api/ranking?all=1&board=${board}`, { headers: auth });
  const body = (await res.json()) as { rows?: unknown[]; error?: string };
  if (!body.rows) throw new Error(body.error ?? `ランキングを取得できませんでした（${res.status}）`);
  const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), JSON.stringify(body.rows, null, 2) + "\n");
  return body.rows.length;
}

async function main() {
  if (!base || !token) {
    console.error(".env.public に PUBLIC_STATUS_URL と PUBLIC_STATUS_TOKEN を設定してください");
    process.exit(1);
  }
  const [command] = process.argv.slice(2);

  if (command === "on") {
    const day = businessDayOf();
    const today = await saveRanking(day, `ranking-${day}.json`);
    const all = await saveRanking("all", `ranking-all-${day}.json`);
    await putConfig({ closed: true });
    console.log("営業終了の表示にしました");
    console.log(`ランキングを backups/ に保存しました（今日 ${today}件・歴代 ${all}件）`);
    return;
  }
  if (command === "off") {
    await putConfig({ closed: false });
    console.log("番号の表示に戻しました");
    return;
  }
  const current = await getConfig();
  console.log(`いまの設定：${current.closed ? "営業終了の表示" : "番号の表示"}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
