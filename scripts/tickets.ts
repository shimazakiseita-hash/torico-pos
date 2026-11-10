/**
 * 整理券（番号ごとのQRコードつき）と、屋台に貼るポスターの印刷用ページを作る。
 * 使い方: npm run tickets -- [最初の番号=1] [最後の番号=300]
 * 出力: print/tickets.html（ブラウザで開いて A4 で印刷し、点線で切る）
 */
import { mkdir, writeFile } from "node:fs/promises";
import QRCode from "qrcode";

try {
  process.loadEnvFile(".env.public");
} catch {
  // 環境変数で直接渡してもよい
}

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 300);
const base = process.env.PUBLIC_STATUS_URL?.replace(/\/$/, "");

if (!base) {
  console.error(".env.public に PUBLIC_STATUS_URL を設定してください");
  process.exit(1);
}
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
  console.error("番号の範囲が不正です（例：npm run tickets -- 1 300）");
  process.exit(1);
}

function qr(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2a1f5c" } });
}

async function main() {
  const tickets: string[] = [];
  for (let n = from; n <= to; n++) {
    tickets.push(`<div class="ticket">
    <div class="num"><small>整理券</small>${n}</div>
    <div class="qr">${await qr(`${base}/?n=${n}`)}</div>
    <p>QRコードで、できあがりがスマホでわかります</p>
  </div>`);
  }

  const html = `<!doctype html>
  <html lang="ja">
  <head>
  <meta charset="utf-8">
  <title>整理券とポスター（${from}〜${to}）</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1a1a1a; font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif; }
    .poster { height: 277mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8mm; text-align: center; break-after: page; }
    .poster img { width: 70mm; }
    .poster h1 { margin: 0; font-size: 15mm; color: #4a3f8c; }
    .poster .big-qr { width: 110mm; }
    .poster p { margin: 0; font-size: 7mm; font-weight: 700; }
    .poster .url { font-size: 4.5mm; font-weight: 400; color: #4a4a4a; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); }
    .ticket { height: 45mm; display: grid; grid-template-columns: 1fr 28mm; grid-template-rows: 1fr auto; align-items: center; gap: 1mm 2mm; padding: 3mm 4mm; border: 0.3mm dashed #f4b0d5; break-inside: avoid; }
    .num { font-size: 17mm; font-weight: 900; line-height: 1; color: #c5589d; font-variant-numeric: tabular-nums; }
    .num small { display: block; margin-bottom: 1mm; font-size: 3.5mm; font-weight: 700; color: #4a3f8c; }
    .qr svg { display: block; width: 28mm; height: 28mm; }
    .ticket p { grid-column: 1 / -1; margin: 0; font-size: 2.8mm; line-height: 1.3; }
  </style>
  </head>
  <body>
  <section class="poster">
    <img src="../public/brand/logo.jpg" alt="やきとり TORI♡CO">
    <h1>呼び出し状況</h1>
    <div class="big-qr">${await qr(`${base}/`)}</div>
    <p>スマホで読み取ると、できあがった番号がわかります</p>
    <p class="url">${base}/</p>
  </section>
  <section class="sheet">
  ${tickets.join("\n")}
  </section>
  </body>
  </html>
  `;

  await mkdir("print", { recursive: true });
  await writeFile("print/tickets.html", html);
  console.log(`print/tickets.html を作りました（ポスター1枚＋整理券 ${to - from + 1}枚）`);
}

main();
