import { EVENT_DAYS, dayLabel } from "./businessDay";
import { ITEM_IDS, type ItemId } from "./menu";
import type { DaySettings } from "./types";

/** 管理画面の「合計」（2日間）を表すキー。API の day=total と同じ */
export const TOTAL = "total";

export type DayTab = { key: string; label: string };

/** 営業日の切り替え。祭りの日以外（準備・練習）は先頭に「今日」を出す */
export function dayTabs(today: string): DayTab[] {
  const events = EVENT_DAYS.map((d) => ({ key: d, label: dayLabel(d) }));
  const extra = (EVENT_DAYS as readonly string[]).includes(today) ? [] : [{ key: today, label: `今日 ${dayLabel(today)}` }];
  return [...extra, ...events, { key: TOTAL, label: "合計" }];
}

/** 2日間合計の集計に使う設定（上限・売り切れはなし、準備金と目標は足す） */
export function totalSettings(days: readonly DaySettings[]): DaySettings {
  return {
    businessDay: TOTAL,
    capacity: Object.fromEntries(ITEM_IDS.map((id) => [id, null])) as Record<ItemId, number | null>,
    soldout: [],
    cashFloat: days.reduce((a, d) => a + d.cashFloat, 0),
    targetQty: days.reduce((a, d) => a + d.targetQty, 0),
  };
}

/** レジ締めの差額（実際 − 理論値）。プラスは多い、マイナスは足りない */
export function cashDifference(expected: number, counted: number): { diff: number; label: string } {
  const diff = counted - expected;
  if (diff === 0) return { diff, label: "ぴったり" };
  return { diff, label: diff > 0 ? `${diff.toLocaleString()}円 多い` : `${(-diff).toLocaleString()}円 足りない` };
}

/** 金額・本数の入力欄の文字列を数にする。空なら null、数でなければ undefined */
export function parseCount(text: string, max = 9_999_999): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n <= max ? n : undefined;
}
