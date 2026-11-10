import { describe, expect, it } from "vitest";
import { calcAmount } from "./pricing";
import type { OrderStatus } from "./status";
import { averageWaitSeconds, computeSummary, secondsPerOrder } from "./summary";
import type { DaySettings, Order, OrderItem } from "./types";

let seq = 0;
function order(status: OrderStatus, items: OrderItem[], opts: Partial<Order> = {}): Order {
  seq++;
  const totalQty = items.reduce((a, i) => a + i.qty, 0);
  const amount = calcAmount(totalQty);
  return {
    id: seq,
    businessDay: "2026-11-21",
    number: seq,
    status,
    totalQty,
    amount,
    tendered: amount,
    changeDue: 0,
    createdAt: "2026-11-21T03:00:00.000Z",
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    items,
    ...opts,
  };
}

function settings(patch: Partial<DaySettings> = {}): DaySettings {
  const capacity = { momo: null, kawa: null, negima: null, tsukune: null, bonjiri: null };
  return { businessDay: "2026-11-21", capacity, soldout: [], cashFloat: 0, targetQty: 300, ...patch };
}

const momoTare = (qty: number): OrderItem => ({ item: "momo", seasoning: "tare", qty });

describe("computeSummary", () => {
  const orders = [
    order("waiting", [momoTare(2), { item: "kawa", seasoning: "shio", qty: 1 }]), // 3本 300円
    order("ready", [{ item: "negima", seasoning: "shio", qty: 1 }]), // 1本 100円
    order("served", [momoTare(4)], { servedAt: "2026-11-21T03:05:00.000Z" }), // 4本 400円
    order("cancelled", [{ item: "bonjiri", seasoning: "tare", qty: 5 }]), // 除外（返金済み）
    order("waiting", [momoTare(1)]), // 1本 100円
  ];
  const cap = settings().capacity;
  const s = computeSummary(orders, settings({ cashFloat: 20000, capacity: { ...cap, momo: 10, kawa: 1 } }));

  it("cancelled を除いた販売本数（SKU別・串別・味付け別・全体）と売上", () => {
    expect(s.soldTotal).toBe(9);
    expect(s.soldBySku["momo:tare"]).toBe(7);
    expect(s.soldBySku["bonjiri:tare"]).toBe(0);
    expect(s.soldByItem).toEqual({ momo: 7, kawa: 1, negima: 1, tsukune: 0, bonjiri: 0 });
    expect(s.soldBySeasoning).toEqual({ tare: 7, shio: 2 });
    expect(s.revenue).toBe(900);
  });

  it("レジ内現金の理論値 = 釣り銭準備金 + 売上（取り消しは含まない）", () => {
    expect(s.cashFloat).toBe(20000);
    expect(s.expectedCash).toBe(20900);
  });

  it("焼くべき本数は waiting のみ", () => {
    expect(s.toGrillBySku["momo:tare"]).toBe(3);
    expect(s.toGrillBySku["kawa:shio"]).toBe(1);
    expect(s.toGrillTotal).toBe(4);
    expect(s.waitingCount).toBe(2);
    expect(s.readyCount).toBe(1);
  });

  it("残り販売可能数 = 串の上限 − たれ・塩合計の販売本数。上限なしなら null、0以下は両方の味が売り切れ", () => {
    expect(s.remainingByItem.momo).toBe(3);
    expect(s.remainingByItem.kawa).toBe(0);
    expect(s.remainingByItem.negima).toBeNull();
    expect(s.soldOut).toEqual(["kawa:tare", "kawa:shio"]);
  });

  it("たれ・塩のどちらが売れても同じ上限から減る", () => {
    const t = computeSummary(
      [order("waiting", [momoTare(3), { item: "momo", seasoning: "shio", qty: 2 }])],
      settings({ capacity: { ...cap, momo: 5 } }),
    );
    expect(t.remainingByItem.momo).toBe(0);
    expect(t.soldOut).toEqual(["momo:tare", "momo:shio"]);
  });

  it("手動の売り切れも soldOut に入る（メニュー順）", () => {
    const t = computeSummary(orders, settings({ soldout: ["tsukune:shio", "momo:shio"] }));
    expect(t.soldOut).toEqual(["momo:shio", "tsukune:shio"]);
  });

  it("注文がなければすべて0", () => {
    const t = computeSummary([], settings({ cashFloat: 5000 }));
    expect(t).toMatchObject({ soldTotal: 0, revenue: 0, expectedCash: 5000, toGrillTotal: 0, avgWaitSeconds: null });
  });
});

describe("averageWaitSeconds", () => {
  it("served が無ければ null", () => {
    expect(averageWaitSeconds([order("waiting", [momoTare(1)])])).toBeNull();
  });

  it("直近10件の served の平均（served_at が新しい順）", () => {
    const base = Date.parse("2026-11-21T03:00:00.000Z");
    const orders: Order[] = [];
    // 古い5件は待ち時間 1000秒、新しい10件は 60〜600秒
    for (let i = 0; i < 5; i++) {
      orders.push(
        order("served", [momoTare(1)], {
          createdAt: new Date(base + i * 1000).toISOString(),
          servedAt: new Date(base + i * 1000 + 1000_000).toISOString(),
        }),
      );
    }
    for (let i = 1; i <= 10; i++) {
      const created = base + 2_000_000 + i * 1000;
      orders.push(
        order("served", [momoTare(1)], {
          createdAt: new Date(created).toISOString(),
          servedAt: new Date(created + i * 60_000).toISOString(),
        }),
      );
    }
    orders.push(order("ready", [momoTare(1)]));
    expect(averageWaitSeconds(orders)).toBe(330);
  });
});

describe("secondsPerOrder", () => {
  const at = (min: number) => new Date(Date.parse("2026-11-21T03:00:00.000Z") + min * 60_000).toISOString();

  it("完成が3件未満なら null", () => {
    expect(secondsPerOrder([order("ready", [momoTare(1)], { readyAt: at(0) })])).toBeNull();
  });

  it("直近10件の完成の間隔の平均（取り消し・焼き待ちは数えない）", () => {
    const orders: Order[] = [];
    // 古い完成（-30分）は直近10件から外れる。1〜10分に1件ずつ完成 → 1件あたり60秒
    orders.push(order("served", [momoTare(1)], { readyAt: at(-30), servedAt: at(-29) }));
    for (let m = 1; m <= 10; m++) {
      orders.push(order(m % 2 ? "served" : "ready", [momoTare(1)], { readyAt: at(m) }));
    }
    orders.push(order("waiting", [momoTare(1)]));
    orders.push(order("cancelled", [momoTare(1)]));
    expect(secondsPerOrder(orders)).toBe(60);
  });
});
