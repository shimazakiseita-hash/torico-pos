/**
 * 整理券（番号ごとのQRコードつき）と、屋台に貼るポスターの印刷用ページを作る。
 * 使い方: npm run tickets -- [最初の番号=1] [最後の番号=300]
 * 出力: print/tickets.html（ブラウザで開いて A4・倍率100%・背景のグラフィックありで印刷するか PDF に保存し、点線で切る）
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
    <div class="head"><img src="../public/brand/logo.jpg" alt=""><span>整理券</span></div>
    <div class="num" data-digits="${String(n).length}">${n}</div>
    <div class="qr">${await qr(`${base}/?n=${n}`)}</div>
    <p>QRコードを読むと、できあがりがスマホでわかります <b>♥</b></p>
  </div>`);
  }

  const html = `<!doctype html>
  <html lang="ja">
  <head>
  <meta charset="utf-8">
  <title>整理券とポスター（${from}〜${to}）</title>
  <link rel="stylesheet" href="../node_modules/@fontsource/zen-maru-gothic/700.css">
  <link rel="stylesheet" href="../node_modules/@fontsource/zen-maru-gothic/900.css">
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; color: #4a3f8c; font-family: "Zen Maru Gothic", sans-serif; font-weight: 700; }
    .poster { height: 277mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7mm; padding: 12mm; border-radius: 10mm; text-align: center; color: #fff; break-after: page;
      background: linear-gradient(160deg, #544591, #3d2f7d 55%, #2a1f5c); }
    .poster .logo { width: 70mm; padding: 2mm; border-radius: 7mm; background: #fff; }
    .poster .logo img { display: block; width: 100%; }
    .poster h1 { margin: 0; font-size: 13mm; font-weight: 900; }
    .poster .big-qr { width: 105mm; padding: 6mm; border-radius: 7mm; background: #fff; }
    .poster .big-qr svg { display: block; width: 100%; height: auto; }
    .poster p { margin: 0; font-size: 6mm; }
    .poster .url { font-size: 4.5mm; color: #80f7fd; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); }
    .ticket { height: 45mm; display: grid; grid-template-columns: 1fr 27mm; grid-template-rows: auto 1fr auto; align-items: center; gap: 0.5mm 3mm; padding: 3mm 4mm;
      border: 0.3mm dashed #f4b0d5; break-inside: avoid; }
    .head { display: flex; align-items: center; gap: 1.5mm; font-size: 3.6mm; }
    .head img { width: 8mm; height: 8mm; object-fit: contain; }
    .num { font-size: 18mm; font-weight: 900; line-height: 1; color: #c5589d; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
    .num[data-digits="3"] { font-size: 15mm; }
    .qr { grid-column: 2; grid-row: 1 / 3; }
    .qr svg { display: block; width: 27mm; height: 27mm; }
    .ticket p { grid-column: 1 / -1; margin: 0; font-size: 2.7mm; line-height: 1.3; }
    .ticket p b { color: #ed6fb6; }
  </style>
  </head>
  <body>
  <section class="poster">
    <div class="logo"><img src="../public/brand/logo.jpg" alt="やきとり TORI♡CO"></div>
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
  console.log(`print/tickets.html を作りました（ポスター1枚＋整理券 ${to - from + 1}枚、URL: ${base}/?n=番号）`);
}

main();
