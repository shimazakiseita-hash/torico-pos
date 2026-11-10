import { describe, expect, it } from "vitest";
import { grillQueue, handoffQueue, isLate, recentReady, recentServed, upcomingNumbers, waitStats } from "./queues";
import type { OrderStatus } from "./status";
import type { Order } from "./types";

const at = (min: number) => new Date(Date.parse("2026-11-21T01:00:00.000Z") + min * 60_000).toISOString();

function order(number: number, status: OrderStatus, created: number, opts: { ready?: number; served?: number } = {}): Order {
  return {
    id: number,
    businessDay: "2026-11-21",
    number,
    status,
    totalQty: 1,
    amount: 100,
    tendered: 100,
    changeDue: 0,
    createdAt: at(created),
    readyAt: opts.ready === undefined ? null : at(opts.ready),
    servedAt: opts.served === undefined ? null : at(opts.served),
    cancelledAt: null,
    items: [{ item: "momo", seasoning: "tare", qty: 1 }],
  };
}

const orders = [
  order(1, "served", 0, { ready: 5, served: 6 }),
  order(2, "served", 1, { ready: 7, served: 9 }),
  order(3, "ready", 2, { ready: 10 }),
  order(4, "ready", 3, { ready: 8 }),
  order(5, "waiting", 4),
  order(6, "cancelled", 5),
  order(8, "waiting", 6),
  order(7, "waiting", 6),
  order(9, "served", 2, { ready: 4, served: 11 }),
  order(10, "served", 3, { ready: 4, served: 3 }),
];

describe("焼き場", () => {
  it("調理待ちを古い順（同時刻なら番号順）。取り消しは出さない", () => {
    expect(grillQueue(orders).map((o) => o.number)).toEqual([5, 7, 8]);
  });

  it("直近の完成は呼び出し中だけ、新しい順に3件まで", () => {
    expect(recentReady(orders).map((o) => o.number)).toEqual([3, 4]);
  });

  it("待ち10分以上の判定と、ヘッダーの件数・最長分", () => {
    const now = Date.parse(at(14));
    expect(isLate(orders[4], now)).toBe(true); // 4分に注文 → 10分
    expect(isLate(orders[6], now)).toBe(false); // 6分に注文 → 8分
    expect(waitStats(orders, now)).toEqual({ count: 3, longestMin: 10 });
    expect(waitStats([], now)).toEqual({ count: 0, longestMin: 0 });
  });
});

describe("渡し場", () => {
  it("呼び出し中を完成した順（早く完成したものが上）", () => {
    expect(handoffQueue(orders).map((o) => o.number)).toEqual([4, 3]);
  });

  it("このあと来る番号は調理待ちを古い順", () => {
    expect(upcomingNumbers(orders)).toEqual([5, 7, 8]);
  });

  it("受け渡し済みは渡した時刻が新しい順に3件まで", () => {
    expect(recentServed(orders).map((o) => o.number)).toEqual([9, 2, 1]);
  });
});
