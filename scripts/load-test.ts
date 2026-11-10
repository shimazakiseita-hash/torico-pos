/**
 * 負荷確認：注文を連続で作成し、応答時間を表示する。
 * 使い方: npm run load-test -- [件数=100] [URL=http://localhost:3000]
 * ※ DB に注文が残るので、終わったら npm run db:reset すること
 */
import { SKUS, UNIT_PRICE } from "../src/lib/menu";

const count = Number(process.argv[2] ?? 100);
const base = process.argv[3] ?? "http://localhost:3000";

async function main() {
  const times: number[] = [];
  const numbers: number[] = [];
  let failed = 0;
  const started = Date.now();
  for (let i = 0; i < count; i++) {
    const { item, seasoning } = SKUS[i % SKUS.length];
    const t = performance.now();
    const res = await fetch(`${base}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ item, seasoning, qty: 1 }], tendered: UNIT_PRICE }),
    });
    times.push(performance.now() - t);
    if (res.ok) numbers.push(((await res.json()) as { number: number }).number);
    else {
      failed++;
      console.log(`失敗 ${res.status}: ${await res.text()}`);
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
  const unique = new Set(numbers).size === numbers.length;
  console.log(`${count}件 / ${((Date.now() - started) / 1000).toFixed(1)}秒 / 失敗 ${failed}件`);
  console.log(`応答時間 ms: 中央値 ${pct(0.5)} / 95% ${pct(0.95)} / 最大 ${pct(1)}`);
  console.log(`呼び出し番号の重複: ${unique ? "なし" : "あり！"}`);

  const t = performance.now();
  await fetch(`${base}/api/orders`);
  await fetch(`${base}/api/summary`);
  console.log(`一覧＋集計の取得: ${(performance.now() - t).toFixed(1)}ms`);
}

main();
