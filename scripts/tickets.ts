/**
 * 整理券（番号ごとのQRコードつき）の印刷用ページを作る。
 * 使い方: npm run tickets -- <日: 1|2> [最初の番号=1] [最後の番号=500]
 * 出力: print/tickets-day1.html / print/tickets-day2.html（ブラウザで開いて A4・倍率100%・背景のグラフィックありで印刷するか PDF に保存し、点線で切る）
 */
import { mkdir, writeFile } from "node:fs/promises";
import QRCode from "qrcode";
import { EVENT_DAYS } from "../src/lib/businessDay";

try {
  process.loadEnvFile(".env.public");
} catch {
  // 環境変数で直接渡してもよい
}

const day = Number(process.argv[2]);
if (day !== 1 && day !== 2) {
  console.error("日は1か2を指定してください（使い方：npm run tickets -- <日: 1|2> [最初の番号=1] [最後の番号=500]）");
  process.exit(1);
}
const date = EVENT_DAYS[day - 1];
const d = new Date(`${date}T00:00:00Z`);
const dateLabel = `${day}日目 ${d.getUTCMonth() + 1}/${d.getUTCDate()}（${"日月火水木金土"[d.getUTCDay()]}）`;
const from = Number(process.argv[3] ?? 1);
const to = Number(process.argv[4] ?? 500);
const base = process.env.PUBLIC_STATUS_URL?.replace(/\/$/, "");

if (!base) {
  console.error(".env.public に PUBLIC_STATUS_URL を設定してください");
  process.exit(1);
}
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
  console.error("番号の範囲が不正です（例：npm run tickets -- 1 1 500）");
  process.exit(1);
}

function qr(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2a1f5c" } });
}

async function main() {
  const tickets: string[] = [];
  for (let n = from; n <= to; n++) {
    tickets.push(`<div class="ticket">
    <div class="head"><img src="../public/brand/logo.jpg" alt=""><span>整理券<small>${dateLabel}</small></span></div>
    <div class="num" data-digits="${String(n).length}">${n}</div>
    <div class="qr">${await qr(`${base}/?n=${n}&d=${date}`)}</div>
    <p>QRコードを読むと、できあがりがスマホでわかります <b>♥</b></p>
  </div>`);
  }

  const html = `<!doctype html>
  <html lang="ja">
  <head>
  <meta charset="utf-8">
  <title>整理券（${dateLabel}・${from}〜${to}）</title>
  <link rel="stylesheet" href="../node_modules/@fontsource/zen-maru-gothic/700.css">
  <link rel="stylesheet" href="../node_modules/@fontsource/zen-maru-gothic/900.css">
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; color: #4a3f8c; font-family: "Zen Maru Gothic", sans-serif; font-weight: 700; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); }
    .ticket { height: 45mm; display: grid; grid-template-columns: 1fr 27mm; grid-template-rows: auto 1fr auto; align-items: center; gap: 0.5mm 3mm; padding: 3mm 4mm;
      border: 0.3mm dashed ${day === 1 ? "#f4b0d5" : "#80f7fd"}; break-inside: avoid; }
    .head { display: flex; align-items: center; gap: 1.5mm; font-size: 3.6mm; }
    .head small { display: block; font-size: 2.7mm; white-space: nowrap; }
    .head img { width: 8mm; height: 8mm; object-fit: contain; }
    .num { font-size: 18mm; font-weight: 900; line-height: 1; color: ${day === 1 ? "#c5589d" : "#2b8fb3"}; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
    .num[data-digits="3"] { font-size: 15mm; }
    .qr { grid-column: 2; grid-row: 1 / 3; }
    .qr svg { display: block; width: 27mm; height: 27mm; }
    .ticket p { grid-column: 1 / -1; margin: 0; font-size: 2.7mm; line-height: 1.3; }
    .ticket p b { color: #ed6fb6; }
  </style>
  </head>
  <body>
  <section class="sheet">
  ${tickets.join("\n")}
  </section>
  </body>
  </html>
  `;

  await mkdir("print", { recursive: true });
  const output = `print/tickets-day${day}.html`;
  await writeFile(output, html);
  console.log(`${output} を作りました（整理券 ${to - from + 1}枚、URL: ${base}/?n=番号&d=${date}）`);
}

main();
