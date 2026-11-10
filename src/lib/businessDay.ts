/** 日本時間（UTC+9、夏時間なし）の日付 YYYY-MM-DD を営業日とする */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function businessDayOf(date: Date = new Date()): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 形式で、実在する日付か */
export function isBusinessDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 津田沼祭の営業日（1日目・2日目） */
export const EVENT_DAYS = ["2026-11-21", "2026-11-22"] as const;

/** 画面に出す営業日の名前。祭りの日なら「1日目」、それ以外は「11/10」 */
export function dayLabel(day: string): string {
  const i = (EVENT_DAYS as readonly string[]).indexOf(day);
  if (i >= 0) return `${i + 1}日目`;
  const [, m, d] = day.split("-").map(Number);
  return `${m}/${d}`;
}
