import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type BackupOptions = {
  baseUrl: string; // 起動中のサーバー（CSV を取る）
  dbPath: string;
  dir: string;
};

export type BackupResult = { csv?: string; db?: string; orders?: number; errors: string[] };

/** ファイル名用の日時（ローカル時刻）：20261002-153000 */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 全営業日の注文のCSV（サーバーから）とDBのコピーを保存する。片方が失敗してももう片方は保存する */
export async function takeBackup({ baseUrl, dbPath, dir }: BackupOptions): Promise<BackupResult> {
  fs.mkdirSync(dir, { recursive: true });
  const name = `torico-${stamp()}`;
  const result: BackupResult = { errors: [] };

  try {
    const res = await fetch(`${baseUrl}/api/export.csv?day=all`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // text() だと Excel 用の BOM が落ちるので、届いたバイト列のまま保存する
    const bytes = Buffer.from(await res.arrayBuffer());
    result.csv = path.join(dir, `${name}.csv`);
    fs.writeFileSync(result.csv, bytes);
    result.orders = bytes.toString("utf8").trim().split("\n").length - 1;
  } catch (e) {
    result.errors.push(`CSV: ${(e as Error).message}`);
  }

  try {
    if (!fs.existsSync(dbPath)) throw new Error(`${dbPath} がありません`);
    // 書き込み中でも安全にコピーできる SQLite のオンラインバックアップを使う
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      result.db = path.join(dir, `${name}.db`);
      await db.backup(result.db);
    } finally {
      db.close();
    }
  } catch (e) {
    result.db = undefined;
    result.errors.push(`DB: ${(e as Error).message}`);
  }

  return result;
}

export function defaultBackupOptions(): BackupOptions {
  return {
    baseUrl: process.env.LOCAL_URL ?? "http://localhost:3000",
    dbPath: process.env.TORICO_DB_PATH ?? path.join(process.cwd(), "data", "torico.db"),
    dir: process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups"),
  };
}
