import { businessDayOf } from "./businessDay";
import type { Summary } from "./summary";
import type { Order } from "./types";

/** お客さん向けに公開する呼び出し状況（今日の番号と待ち時間の目安だけ。金額・注文内容は含めない） */
export type PublicStatus = {
  businessDay: string; // 営業日（YYYY-MM-DD）。公開ページは今日の分だけ使う
  ready: number[]; // 新しく呼んだ順
  waiting: number[]; // 番号の小さい順（＝注文の古い順）
  served: number[]; // 番号の小さい順
  avgWaitSeconds: number | null; // 直近の注文から受け取りまでの平均（秒）
  secondsPerOrder: number | null; // 完成のペース（1件あたり秒）
};

export type NumberLookup =
  | { state: "ready" }
  | { state: "waiting"; ahead: number; etaSeconds: number | null }
  | { state: "served" }
  | { state: "notFound" }; // 取り消し・未発行

const numbersOf = (orders: readonly Order[], status: Order["status"]) =>
  orders
    .filter((o) => o.status === status)
    .map((o) => o.number)
    .sort((a, b) => a - b);

export function toPublicStatus(
  orders: readonly Order[],
  { businessDay, avgWaitSeconds, secondsPerOrder }: Pick<Summary, "businessDay" | "avgWaitSeconds" | "secondsPerOrder">,
): PublicStatus {
  const today = orders.filter((o) => o.businessDay === businessDay);
  const ready = today
    .filter((o) => o.status === "ready")
    .sort((a, b) => Date.parse(b.readyAt ?? "") - Date.parse(a.readyAt ?? ""))
    .map((o) => o.number);
  return {
    businessDay,
    ready,
    waiting: numbersOf(today, "waiting"),
    served: numbersOf(today, "served"),
    avgWaitSeconds,
    secondsPerOrder,
  };
}

/** 保存されている状況が今日の営業日のものか（前日の番号を今日の整理券に見せない） */
export function isToday(status: Pick<PublicStatus, "businessDay">, now: Date = new Date()): boolean {
  return status.businessDay === businessDayOf(now);
}

/** 番号の状態と、焼き待ちなら前に何件あるか・できあがりまでの目安（（前の件数＋1）× 完成のペース） */
export function lookupNumber(status: PublicStatus, n: number): NumberLookup {
  if (status.ready.includes(n)) return { state: "ready" };
  if (status.waiting.includes(n)) {
    const ahead = status.waiting.filter((w) => w < n).length;
    const etaSeconds = status.secondsPerOrder === null ? null : (ahead + 1) * status.secondsPerOrder;
    return { state: "waiting", ahead, etaSeconds };
  }
  if (status.served.includes(n)) return { state: "served" };
  return { state: "notFound" };
}
