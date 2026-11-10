import type { Order } from "./types";

/** 焼き場で「待ち10分以上」として強調する経過時間 */
export const LATE_MS = 10 * 60 * 1000;
/** 焼き場の「直近の完成」、渡し場の「受け渡し済み（直近）」の件数 */
export const RECENT_UNDO = 3;

const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

/** 焼き場：調理待ちを古い順（注文時刻、同時なら番号順） */
export function grillQueue(orders: readonly Order[]): Order[] {
  return orders
    .filter((o) => o.status === "waiting")
    .sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.number - b.number);
}

/** 焼き場：直近で完成にした注文（まだ渡していないもの）を新しい順に。ここから「戻す」で調理待ちへ */
export function recentReady(orders: readonly Order[], n = RECENT_UNDO): Order[] {
  return orders
    .filter((o) => o.status === "ready")
    .sort((a, b) => time(b.readyAt) - time(a.readyAt))
    .slice(0, n);
}

/** 渡し場：呼び出し中を完成した順（早く完成したものが上） */
export function handoffQueue(orders: readonly Order[]): Order[] {
  return orders
    .filter((o) => o.status === "ready")
    .sort((a, b) => time(a.readyAt) - time(b.readyAt) || a.number - b.number);
}

/** 渡し場：このあと来る番号（調理待ちを古い順） */
export function upcomingNumbers(orders: readonly Order[]): number[] {
  return grillQueue(orders).map((o) => o.number);
}

/** 渡し場：直近で渡した注文を新しい順に。ここから「戻す」で呼び出し中へ */
export function recentServed(orders: readonly Order[], n = RECENT_UNDO): Order[] {
  return orders
    .filter((o) => o.status === "served")
    .sort((a, b) => time(b.servedAt) - time(a.servedAt))
    .slice(0, n);
}

export function isLate(order: Order, now: number): boolean {
  return now - time(order.createdAt) >= LATE_MS;
}

/** 焼き場のヘッダー用：待ち件数と、いちばん長く待っている注文の経過分 */
export function waitStats(orders: readonly Order[], now: number): { count: number; longestMin: number } {
  const queue = grillQueue(orders);
  const oldest = queue[0];
  return { count: queue.length, longestMin: oldest ? Math.max(0, Math.floor((now - time(oldest.createdAt)) / 60000)) : 0 };
}
