/**
 * 当日用：本番サーバー・お客さん向けページへの送信・自動バックアップを1コマンドで動かす。
 * 使い方: npm run event（Ctrl+C で最後のバックアップを取ってから全部止まる）
 * 落ちたものは自動で再起動する。バックアップは BACKUP_INTERVAL_MIN 分ごと（既定10分）に backups/ へ
 * npm run practice（--practice）は練習モード：毎回まっさらな data/practice.db を使い、送信とバックアップはしない
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { getServerInfo } from "../src/lib/serverInfo";
import { defaultBackupOptions, takeBackup } from "./lib/backup";

const PORT = 3000;
const LOCAL = `http://localhost:${PORT}`;
const BACKUP_MIN = Number(process.env.BACKUP_INTERVAL_MIN ?? 10);
const PRACTICE = process.argv.includes("--practice");
const PRACTICE_DB = path.join(process.cwd(), "data", "practice.db");
const NEXT_BIN = require.resolve("next/dist/bin/next");

let stopping = false;

function log(message: string) {
  console.log(`${new Date().toLocaleTimeString("ja-JP")} ${message}`);
}

/** 子プロセスを動かし続ける。落ちたら少し待って再起動（すぐ落ち続けるときは間隔を延ばす） */
function supervise(label: string, args: string[]) {
  let child: ChildProcess | undefined;
  let delay = 2000;

  const start = () => {
    const startedAt = Date.now();
    // Ctrl+C を子に直接届かせない（最後のバックアップを取ってから止めるため）
    child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    for (const stream of [child.stdout!, child.stderr!]) {
      readline.createInterface({ input: stream }).on("line", (line) => line.trim() && console.log(`  [${label}] ${line}`));
    }
    child.on("exit", (code, signal) => {
      if (stopping) return;
      if (Date.now() - startedAt > 60000) delay = 2000;
      log(`⚠ ${label}が止まりました（${signal ?? `終了コード ${code}`}）。${delay / 1000}秒後に再起動します`);
      setTimeout(start, delay);
      delay = Math.min(delay * 2, 30000);
    });
  };

  start();
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

/** ソース（src/, public/, 設定）がビルドより新しければ true。ビルドし忘れて古い版で開店しないように */
function buildIsStale(): boolean {
  const built = fs.statSync(".next/BUILD_ID", { throwIfNoEntry: false })?.mtimeMs;
  if (built === undefined) return true;
  const newest = (p: string): number => {
    const st = fs.statSync(p, { throwIfNoEntry: false });
    if (!st) return 0;
    if (!st.isDirectory()) return st.mtimeMs;
    return Math.max(0, ...fs.readdirSync(p).map((name) => newest(path.join(p, name))));
  };
  return ["src", "public", "next.config.ts", "package.json"].some((p) => newest(p) > built);
}

async function responds(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

async function backup() {
  const r = await takeBackup(defaultBackupOptions());
  if (r.csv || r.db) log(`バックアップを保存しました（注文 ${r.orders ?? "?"}件）`);
  for (const e of r.errors) log(`⚠ バックアップ失敗 ${e}`);
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    console.error(`Node.js ${process.versions.node} では動きません（22以上が必要）。nvm use 24 を実行してから、もう一度どうぞ`);
    process.exit(1);
  }
  if (await responds(`${LOCAL}/api/server-info`)) {
    console.error(`すでにポート${PORT}でサーバーが動いています。先にそちらを止めてください`);
    process.exit(1);
  }
  if (buildIsStale()) {
    log("本番ビルドがないか古いので作り直します（1分ほどかかります）");
    if (spawnSync(process.execPath, [NEXT_BIN, "build"], { stdio: "inherit" }).status !== 0) process.exit(1);
  }

  if (PRACTICE) {
    // 子プロセス（サーバー）にも引き継がれる
    process.env.TORICO_DB_PATH = PRACTICE_DB;
    process.env.TORICO_PRACTICE = "1";
    for (const f of [PRACTICE_DB, `${PRACTICE_DB}-wal`, `${PRACTICE_DB}-shm`]) fs.rmSync(f, { force: true });
    log("練習モードで起動します（まっさらな練習用DB。本番のデータ・お客さん向けページ・バックアップには影響しません）");
  }

  const server = supervise("サーバー", [NEXT_BIN, "start", "-H", "0.0.0.0", "-p", String(PORT)]);
  for (let i = 0; i < 120 && !(await responds(`${LOCAL}/api/server-info`)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }

  const { urls } = getServerInfo(PORT);
  console.log("");
  if (urls.length === 0) {
    log("⚠ LANのIPアドレスが見つかりません。Wi-Fi（TORICO-POS）が動いていないと、他の端末からは開けません");
  }
  for (const base of [LOCAL, ...urls]) {
    console.log(`  ${base}  → /register（受付） /grill（焼き場） /handoff（渡し場） /display（呼び出し） /admin（管理）`);
  }
  console.log("");

  const syncOn = !PRACTICE && (fs.existsSync(".env.public") || !!process.env.PUBLIC_STATUS_URL);
  // tsx の CLI は子プロセスをもう1つ作るので、強制終了で取り残されないよう同じプロセスで読み込む
  const sync = syncOn ? supervise("送信", ["--import", "tsx", "scripts/public-sync.ts"]) : undefined;
  if (!syncOn && !PRACTICE) log("お客さん向けページへの送信はオフです（.env.public がありません）");

  if (!PRACTICE) log(`バックアップは${BACKUP_MIN}分ごとに ${defaultBackupOptions().dir} へ保存します`);
  if (!PRACTICE) await backup();
  const timer = PRACTICE ? undefined : setInterval(backup, BACKUP_MIN * 60 * 1000);
  log("起動しました。止めるときは Ctrl+C");

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    if (PRACTICE) {
      log("止めています…");
    } else {
      log("止めています…最後のバックアップを取ります");
      await backup();
    }
    await Promise.all([sync?.stop(), server.stop()]);
    log("すべて止めました");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);
}

main();
