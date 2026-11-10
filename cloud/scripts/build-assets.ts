/**
 * お客さん向けページの画像とフォントを作る（モバイル回線向けに軽くする）。
 * 使い方: cd cloud && npm run assets（文言やロゴを変えたら実行し、cloud/public をコミットする）
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import subsetFont from "subset-font";

// Zen Maru Gothic（OFL）。ページに書いてある文字だけを残す
const FONT_BASE = "https://github.com/google/fonts/raw/main/ofl/zenmarugothic";
const WEIGHTS = [
  ["ZenMaruGothic-Bold.ttf", "zen-maru-gothic-700.woff2"],
  ["ZenMaruGothic-Black.ttf", "zen-maru-gothic-900.woff2"],
] as const;
const TEXT_SOURCES = ["../src/page.ts", "../src/index.ts"];
const out = new URL("../public/", import.meta.url);

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(new URL("brand/", out), { recursive: true });
await mkdir(new URL("fonts/", out), { recursive: true });

// 画面幅の2倍まであれば十分なので縮めて WebP にする（元は public/brand の白背景JPG）
for (const [name, width] of [["logo", 480], ["mascot", 240]] as const) {
  const src = new URL(`../../public/brand/${name}.jpg`, import.meta.url);
  const file = new URL(`brand/${name}.webp`, out);
  await sharp(src.pathname).resize({ width }).webp({ quality: 82 }).toFile(file.pathname);
  console.log(`brand/${name}.webp`);
}

const sources = await Promise.all(TEXT_SOURCES.map((f) => readFile(new URL(f, import.meta.url), "utf8")));
const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
const text = [...new Set([...ascii, ..."♡♥", ...sources.join("").replace(/[\x00-\x7f\s]/g, "")])].join("");
for (const [ttf, woff2] of WEIGHTS) {
  const font = await subsetFont(await download(`${FONT_BASE}/${ttf}`), text, { targetFormat: "woff2" });
  await writeFile(new URL(`fonts/${woff2}`, out), font);
  console.log(`fonts/${woff2}（${text.length}文字, ${Math.round(font.length / 1024)}KB）`);
}
await writeFile(new URL("fonts/OFL-zenmarugothic.txt", out), await download(`${FONT_BASE}/OFL.txt`));
