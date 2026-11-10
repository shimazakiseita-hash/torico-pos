import { describe, expect, it } from "vitest";
import { lookupNumber, toPublicStatus } from "./publicStatus";
import { publicStatusSchema } from "./schemas";
import type { Order } from "./types";
import type { OrderStatus } from "./status";

function order(number: number, status: OrderStatus, readyAt: string | null = null): Order {
  return {
    id: number,
    businessDay: "2026-11-21",
    number,
    status,
    totalQty: 1,
    amount: 100,
    tendered: 100,
    changeDue: 0,
    createdAt: "2026-10-01T03:00:00.000Z",
    readyAt,
    servedAt: null,
    cancelledAt: null,
    items: [{ item: "momo", seasoning: "tare", qty: 1 }],
  };
}

describe("toPublicStatus", () => {
  it("呼び出し中は新しく呼んだ順、焼き待ちは番号順で、それ以外は含めない", () => {
    const s = toPublicStatus([
      order(5, "waiting"),
      order(1, "ready", "2026-10-01T03:05:00.000Z"),
      order(2, "ready", "2026-10-01T03:07:00.000Z"),
      order(3, "served"),
      order(4, "cancelled"),
      order(6, "waiting"),
      order(7, "waiting"),
    ], { avgWaitSeconds: 300, secondsPerOrder: 90 });
    expect(s).toEqual({ ready: [2, 1], waiting: [5, 6, 7], avgWaitSeconds: 300, secondsPerOrder: 90 });
  });

  it("番号以外の情報（金額・注文内容）は含めない", () => {
    expect(Object.keys(toPublicStatus([order(1, "waiting")], { avgWaitSeconds: null, secondsPerOrder: null }))).toEqual([
      "ready",
      "waiting",
      "avgWaitSeconds",
      "secondsPerOrder",
    ]);
  });
});

describe("lookupNumber", () => {
  const s = { ready: [3], waiting: [4, 6, 9], avgWaitSeconds: null, secondsPerOrder: 120 };

  it("呼び出し中の番号", () => {
    expect(lookupNumber(s, 3)).toEqual({ state: "ready" });
  });

  it("焼き待ちなら、自分より小さい焼き待ち番号の数が前の件数。目安は（前の件数＋自分）× ペース", () => {
    expect(lookupNumber(s, 4)).toEqual({ state: "waiting", ahead: 0, etaSeconds: 120 });
    expect(lookupNumber(s, 9)).toEqual({ state: "waiting", ahead: 2, etaSeconds: 360 });
  });

  it("ペースがまだ分からなければ目安は null", () => {
    expect(lookupNumber({ ...s, secondsPerOrder: null }, 6)).toEqual({ state: "waiting", ahead: 1, etaSeconds: null });
  });

  it("どちらにもない番号（受け渡し済み・取り消し・番号違い）", () => {
    expect(lookupNumber(s, 1)).toEqual({ state: "notFound" });
  });
});

describe("publicStatusSchema", () => {
  it("番号の配列だけを受け付ける", () => {
    expect(publicStatusSchema.safeParse({ ready: [1], waiting: [2, 3], avgWaitSeconds: 240, secondsPerOrder: 60 }).success).toBe(true);
    expect(publicStatusSchema.safeParse({ ready: [], waiting: [], avgWaitSeconds: null, secondsPerOrder: null }).success).toBe(true);
    expect(publicStatusSchema.safeParse({ ready: [0], waiting: [], avgWaitSeconds: null, secondsPerOrder: null }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ready: ["1"], waiting: [], avgWaitSeconds: null, secondsPerOrder: null }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ready: [], waiting: [], avgWaitSeconds: -1, secondsPerOrder: null }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ready: [] }).success).toBe(false);
  });

  it("完成のペースがないデータ（古い送信側）は null として受け付ける", () => {
    expect(publicStatusSchema.parse({ ready: [], waiting: [1], avgWaitSeconds: null })).toEqual({
      ready: [],
      waiting: [1],
      avgWaitSeconds: null,
      secondsPerOrder: null,
    });
  });
});
