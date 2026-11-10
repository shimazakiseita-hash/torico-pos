/**
 * お客さん向けページ（Cloudflare）へ、今日の呼び出し状況（番号・状態と待ち時間の目安だけ）を送り続ける。
 * 送れたかどうかはサーバーPCの /api/public-sync に知らせ、管理画面に出す。
 * 使い方: npm run public-sync（.env.public に PUBLIC_STATUS_URL と PUBLIC_STATUS_TOKEN を書いておく）
 * 止まっても・失敗しても受付・焼き場・渡し場には影響しない
 */
import { toPublicStatus } from "../src/lib/publicStatus";
import type { Summary } from "../src/lib/summary";
import type { Order } from "../src/lib/types";

const POLL_MS = 3000;
const HEARTBEAT_MS = 15000; // 変化がなくても送る間隔（ページの「最終更新」を新しく保つ）
const TIMEOUT_MS = 5000;

try {
  process.loadEnvFile(".env.public");
} catch {
  // 環境変数で直接渡してもよい
}

const target = process.env.PUBLIC_STATUS_URL?.replace(/\/$/, "");
const token = process.env.PUBLIC_STATUS_TOKEN;
const local = process.env.LOCAL_URL ?? "http://localhost:3000";

if (!target || !token) {
  console.error(".env.public に PUBLIC_STATUS_URL と PUBLIC_STATUS_TOKEN を設定してください");
  process.exit(1);
}

let lastSent = "";
let lastSentAt = 0;
let failing = false;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${local}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`サーバーPCのAPI ${path}: ${res.status}`);
  return (await res.json()) as T;
}

async function tick() {
  const [orders, summary] = await Promise.all([
    getJson<Order[]>("/api/orders?status=waiting,ready,served"),
    getJson<Summary>("/api/summary"),
  ]);
  const body = JSON.stringify(toPublicStatus(orders, summary));
  if (body === lastSent && Date.now() - lastSentAt < HEARTBEAT_MS) return;

  const put = await fetch(`${target}/api/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!put.ok) throw new Error(`公開ページ: ${put.status} ${await put.text()}`);
  lastSent = body;
  lastSentAt = Date.now();
}

/** 管理画面に出すので、よくある失敗は日本語にする */
function describe(e: Error): string {
  if (e.name === "TimeoutError") return "応答がありません（タイムアウト）";
  if (e.message === "fetch failed") return "接続できません（インターネットか公開ページにつながりません）";
  return e.message;
}

/** 送信結果をサーバーPCに知らせる（サーバーPCが止まっていても気にしない） */
async function report(ok: boolean, error?: string) {
  try {
    await fetch(`${local}/api/public-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error === undefined ? { ok } : { ok, error: error.slice(0, 300) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // 管理画面の表示が古くなるだけ
  }
}

async function loop() {
  try {
    await tick();
    if (failing) console.log(`${new Date().toLocaleTimeString()} 送信が復旧しました`);
    failing = false;
    await report(true);
  } catch (e) {
    const message = describe(e as Error);
    // 失敗が続いても1回だけ表示する
    if (!failing) console.error(`${new Date().toLocaleTimeString()} 送信に失敗（再試行し続けます）: ${message}`);
    failing = true;
    await report(false, message);
  }
  setTimeout(loop, POLL_MS);
}

console.log(`${local} の呼び出し状況を ${target} へ送ります（Ctrl+C で停止）`);
loop();
