import { describe, expect, it } from "vitest";
import { isToday, lookupNumber, toPublicStatus, type PublicStatus } from "./publicStatus";
import { publicStatusSchema } from "./schemas";
import type { Order } from "./types";
import type { OrderStatus } from "./status";

function order(number: number, status: OrderStatus, readyAt: string | null = null, businessDay = "2026-11-21"): Order {
  return {
    id: number,
    businessDay,
    number,
    status,
    totalQty: 1,
    amount: 100,
    tendered: 100,
    changeDue: 0,
    createdAt: "2026-11-21T03:00:00.000Z",
    readyAt,
    servedAt: null,
    cancelledAt: null,
    items: [{ item: "momo", seasoning: "tare", qty: 1 }],
  };
}

const pace = { businessDay: "2026-11-21", avgWaitSeconds: 300, secondsPerOrder: 90 };

describe("toPublicStatus", () => {
  it("呼び出し中は新しく呼んだ順、焼き待ち・お渡し済みは番号順。取り消しは含めない", () => {
    const s = toPublicStatus(
      [
        order(5, "waiting"),
        order(1, "ready", "2026-11-21T03:05:00.000Z"),
        order(2, "ready", "2026-11-21T03:07:00.000Z"),
        order(8, "served"),
        order(3, "served"),
        order(4, "cancelled"),
        order(7, "waiting"),
        order(6, "waiting"),
      ],
      pace,
    );
    expect(s).toEqual({
      businessDay: "2026-11-21",
      ready: [2, 1],
      waiting: [5, 6, 7],
      served: [3, 8],
      avgWaitSeconds: 300,
      secondsPerOrder: 90,
    });
  });

  it("今日の営業日の番号だけを送る", () => {
    const s = toPublicStatus([order(1, "waiting", null, "2026-11-21"), order(2, "waiting", null, "2026-11-20")], pace);
    expect(s.waiting).toEqual([1]);
  });

  it("番号・状態・待ち時間以外（金額・注文内容）は含めない", () => {
    expect(Object.keys(toPublicStatus([order(1, "waiting")], pace)).sort()).toEqual(
      ["avgWaitSeconds", "businessDay", "ready", "secondsPerOrder", "served", "waiting"].sort(),
    );
    expect(JSON.stringify(toPublicStatus([order(1, "waiting")], pace))).not.toMatch(/momo|amount|tendered|100/);
  });
});

describe("isToday", () => {
  it("日本時間の日付で比べる", () => {
    expect(isToday({ businessDay: "2026-11-21" }, new Date("2026-11-20T15:00:00.000Z"))).toBe(true); // 21日 0:00
    expect(isToday({ businessDay: "2026-11-21" }, new Date("2026-11-21T15:00:00.000Z"))).toBe(false); // 22日 0:00
  });
});

describe("lookupNumber", () => {
  const s: PublicStatus = { businessDay: "2026-11-21", ready: [3], waiting: [4, 6, 9], served: [1, 2], avgWaitSeconds: null, secondsPerOrder: 120 };

  it("呼び出し中の番号", () => {
    expect(lookupNumber(s, 3)).toEqual({ state: "ready" });
  });

  it("焼き待ちなら、自分より小さい焼き待ち番号の数が前の組数。目安は（前の組数＋1）× ペース", () => {
    expect(lookupNumber(s, 4)).toEqual({ state: "waiting", ahead: 0, etaSeconds: 120 });
    expect(lookupNumber(s, 9)).toEqual({ state: "waiting", ahead: 2, etaSeconds: 360 });
  });

  it("ペースがまだ分からなければ目安は null", () => {
    expect(lookupNumber({ ...s, secondsPerOrder: null }, 6)).toEqual({ state: "waiting", ahead: 1, etaSeconds: null });
  });

  it("お渡し済みと、使われていない番号（取り消し・未発行）を分ける", () => {
    expect(lookupNumber(s, 2)).toEqual({ state: "served" });
    expect(lookupNumber(s, 5)).toEqual({ state: "notFound" });
    expect(lookupNumber(s, 50)).toEqual({ state: "notFound" });
  });
});

describe("publicStatusSchema", () => {
  const ok = { businessDay: "2026-11-21", ready: [1], waiting: [2, 3], served: [], avgWaitSeconds: 240, secondsPerOrder: 60 };

  it("営業日と番号の配列だけを受け付ける", () => {
    expect(publicStatusSchema.safeParse(ok).success).toBe(true);
    expect(publicStatusSchema.safeParse({ ...ok, ready: [0] }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ...ok, ready: ["1"] }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ...ok, avgWaitSeconds: -1 }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ...ok, businessDay: "11/21" }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ready: [] }).success).toBe(false);
  });

  it("余計な項目（金額など）は保存しない", () => {
    expect(publicStatusSchema.parse({ ...ok, amount: 500 })).toEqual(ok);
  });
});
