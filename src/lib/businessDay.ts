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
