import { describe, expect, it } from "vitest";
import { emptySkuCounts, type SkuCounts } from "./menu";
import { availability, cartItems, checkout, pressKey, tenderedOf } from "./register";

function cart(patch: Partial<SkuCounts>): SkuCounts {
  return { ...emptySkuCounts(), ...patch };
}

describe("checkout", () => {
  const five = cart({ "momo:tare": 2, "kawa:shio": 3 });

  it("5本・1,000円預かり → お釣り500円で確定できる", () => {
    expect(checkout(five, { kind: "amount", value: 1000 })).toEqual({ state: "ok", amount: 500, tendered: 1000, change: 500 });
  });

  it("ちょうどは合計に追従する", () => {
    expect(checkout(five, { kind: "exact" })).toEqual({ state: "ok", amount: 500, tendered: 500, change: 0 });
    expect(checkout(cart({ "momo:tare": 7 }), { kind: "exact" })).toMatchObject({ state: "ok", amount: 700, change: 0 });
  });

  it("預かり不足・未入力・空では確定できない", () => {
    expect(checkout(five, { kind: "amount", value: 400 })).toEqual({ state: "short", amount: 500, tendered: 400, short: 100 });
    expect(checkout(five, null)).toEqual({ state: "needTender", amount: 500 });
    expect(checkout(emptySkuCounts(), { kind: "amount", value: 1000 })).toEqual({ state: "empty" });
  });

  it("tenderedOf", () => {
    expect(tenderedOf(null, 500)).toBeNull();
    expect(tenderedOf({ kind: "exact" }, 500)).toBe(500);
    expect(tenderedOf({ kind: "amount", value: 5000 }, 500)).toBe(5000);
  });
});

describe("cartItems", () => {
  it("0本を除いてメニュー順", () => {
    expect(cartItems(cart({ "bonjiri:shio": 1, "momo:tare": 2 }))).toEqual([
      { item: "momo", seasoning: "tare", qty: 2 },
      { item: "bonjiri", seasoning: "shio", qty: 1 },
    ]);
  });
});

describe("availability", () => {
  it("串の残りからカートの分（たれ・塩の合計）を引く。使い切ったら足せないが、売り切れ表示にはしない", () => {
    const a = availability(cart({ "momo:tare": 1, "momo:shio": 1 }), { momo: 3, kawa: 2 }, []);
    expect(a["momo:tare"]).toEqual({ remaining: 1, soldOut: false, canAdd: true });
    expect(a["momo:shio"]).toEqual({ remaining: 1, soldOut: false, canAdd: true });
    const b = availability(cart({ "momo:tare": 2, "momo:shio": 1 }), { momo: 3 }, []);
    expect(b["momo:shio"]).toEqual({ remaining: 0, soldOut: false, canAdd: false });
    expect(b["kawa:tare"].canAdd).toBe(true);
  });

  it("仕込み数が未設定なら残りは null で、いくらでも足せる", () => {
    expect(availability(emptySkuCounts(), {}, [])["negima:shio"]).toEqual({ remaining: null, soldOut: false, canAdd: true });
  });

  it("売り切れ（サーバーの集計）は足せない", () => {
    expect(availability(emptySkuCounts(), { tsukune: 0 }, ["tsukune:shio"])["tsukune:shio"]).toEqual({
      remaining: 0,
      soldOut: true,
      canAdd: false,
    });
  });

  it("1注文の上限（50本）に達したらどれも足せない", () => {
    const a = availability(cart({ "momo:tare": 50 }), {}, []);
    expect(Object.values(a).every((s) => !s.canAdd)).toBe(true);
  });
});

describe("pressKey", () => {
  it("数字を足す・消す・クリア", () => {
    let v = "";
    for (const k of ["1", "5", "0", "0"]) v = pressKey(v, k);
    expect(v).toBe("1500");
    expect(pressKey(v, "back")).toBe("150");
    expect(pressKey(v, "00")).toBe("1500"); // 150,000円は上限超えなので入らない
    expect(pressKey(v, "clear")).toBe("");
  });

  it("先頭の0は消し、上限（100,000円）を超える入力は受け付けない", () => {
    expect(pressKey("0", "5")).toBe("5");
    expect(pressKey("", "00")).toBe("0");
    expect(pressKey("10000", "0")).toBe("100000");
    expect(pressKey("10000", "00")).toBe("10000");
  });
});
