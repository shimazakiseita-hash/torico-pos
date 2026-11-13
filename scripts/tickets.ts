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
const shortDateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${"日月火水木金土"[d.getUTCDay()]}）`;
const dateLabel = `${day}日目 ${shortDateLabel}`;
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
    <div class="pillar"><span>${day}日目</span><small>${shortDateLabel}</small></div>
    <div class="main">
      <div class="top"><img src="../public/brand/logo.jpg" alt=""><div><b>やきとり TORI♡CO</b><small>寮友会執行役員会</small></div></div>
      <div class="row"><div class="num" data-digits="${String(n).length}">${n}</div><div class="qr">${await qr(`${base}/?n=${n}&d=${date}`)}</div></div>
      <p class="msg">QRを読むと できあがりがスマホでわかります。待っている間は ミニゲームで遊べます</p>
    </div>
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
    .ticket { height: 45mm; display: flex; background: #fff; overflow: hidden; position: relative;
      --m: ${day === 1 ? "#c5589d" : "#2b8fb3"}; --l: ${day === 1 ? "#f4b0d5" : "#80f7fd"};
      border: 0.3mm dashed var(--l); break-inside: avoid; }
    .pillar { width: 8mm; flex-shrink: 0; background: var(--m); color: #fff; writing-mode: vertical-rl; display: flex; align-items: center; justify-content: center; gap: 1mm; font-size: 3.6mm; letter-spacing: 0.1em; }
    .pillar small { font-size: 2.5mm; }
    .main { flex: 1; min-width: 0; padding: 1.5mm 2.5mm; display: flex; flex-direction: column; }
    .top { display: flex; align-items: center; gap: 1.5mm; }
    .top img { width: 7mm; height: 7mm; object-fit: contain; }
    .top b { display: block; font-size: 3.2mm; }
    .top small { display: block; font-size: 2.2mm; color: #9374ab; }
    .row { display: flex; align-items: center; justify-content: space-between; flex: 1; }
    .num { font-size: 17mm; font-weight: 900; color: var(--m); line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .num[data-digits="3"] { font-size: 15mm; }
    .qr { width: 21mm; height: 21mm; flex-shrink: 0; }
    .qr svg { display: block; width: 100%; height: 100%; }
    .msg { margin: 0; font-size: 2.3mm; line-height: 1.35; }
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
