import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

const file = process.env.TORICO_DB_PATH ?? path.join(process.cwd(), "data", "torico.db");
const targets = [file, `${file}-wal`, `${file}-shm`].filter((f) => fs.existsSync(f));

async function main() {
  if (targets.length === 0) {
    console.log(`DBファイルはありません（${file}）。次回起動時に新しく作られます。`);
    return;
  }
  console.log("次のファイルを削除します（すべての注文と設定が消えます）：");
  for (const t of targets) console.log(`  ${t}`);

  if (!process.argv.includes("--yes")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("本当に削除しますか？ yes と入力してください: ");
    rl.close();
    if (answer.trim() !== "yes") {
      console.log("中止しました。");
      return;
    }
  }
  for (const t of targets) fs.rmSync(t);
  console.log("削除しました。サーバーを起動中なら再起動してください。");
}

main();
