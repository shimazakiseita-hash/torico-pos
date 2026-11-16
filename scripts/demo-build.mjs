import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".demo-build");
// 静的書き出しでも .next に書くため、通常ビルドから作業場所を分ける。
rmSync(work, { recursive: true, force: true });
mkdirSync(work);
for (const entry of ["src", "public", "package.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"]) {
  cpSync(path.join(root, entry), path.join(work, entry), { recursive: true });
}
symlinkSync(path.join(root, "node_modules"), path.join(work, "node_modules"), "dir");
const config = JSON.parse(readFileSync(path.join(work, "tsconfig.json"), "utf8"));
config.exclude.push("src/app/api");
writeFileSync(path.join(work, "tsconfig.json"), JSON.stringify(config, null, 2) + "\n");
const result = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"], {
  cwd: work,
  env: { ...process.env, TORICO_DEMO_ROOT: root, TORICO_DEMO: "1", NEXT_PUBLIC_TORICO_DEMO: "1" },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
rmSync(path.join(root, "demo-out"), { recursive: true, force: true });
cpSync(path.join(work, "demo-out"), path.join(root, "demo-out"), { recursive: true });
