import { SKUS, skuKey, SEASONING_IDS, type ItemId, type SkuCounts, type SkuKey } from "./menu";
import { MAX_ORDER_QTY, MAX_TENDERED, calcAmount } from "./pricing";
import { sum } from "./summary";
import type { OrderItem } from "./types";

/** 預かり金額のワンタップボタン（円） */
export const TENDER_PRESETS = [1000, 5000, 10000] as const;

/** 預かり金額の指定。exact は「ちょうど」（合計が変わっても追従する） */
export type Tender = { kind: "exact" } | { kind: "amount"; value: number } | null;

export function tenderedOf(tender: Tender, amount: number): number | null {
  if (tender === null) return null;
  return tender.kind === "exact" ? amount : tender.value;
}

export type Checkout =
  | { state: "empty" } // 何も選んでいない
  | { state: "needTender"; amount: number } // 預かり金額が未入力
  | { state: "short"; amount: number; tendered: number; short: number } // 足りない
  | { state: "ok"; amount: number; tendered: number; change: number };

/** 会計確定できるか。ok のときだけ確定ボタンを押せる */
export function checkout(cart: SkuCounts, tender: Tender): Checkout {
  const totalQty = sum(cart);
  if (totalQty === 0) return { state: "empty" };
  const amount = calcAmount(totalQty);
  const tendered = tenderedOf(tender, amount);
  if (tendered === null) return { state: "needTender", amount };
  if (tendered < amount) return { state: "short", amount, tendered, short: amount - tendered };
  return { state: "ok", amount, tendered, change: tendered - amount };
}

/** カートを注文の items にする（0本は除く、メニュー順） */
export function cartItems(cart: SkuCounts): OrderItem[] {
  return SKUS.filter((s) => cart[s.key] > 0).map((s) => ({ item: s.item, seasoning: s.seasoning, qty: cart[s.key] }));
}

export type SkuAvailability = {
  /** 串の残り（たれ・塩の合計）からカートの分を引いたもの。上限なしなら null */
  remaining: number | null;
  /** 売り切れ（サーバーの集計で残り0以下、または手動の売り切れ） */
  soldOut: boolean;
  /** あと1本足せるか（売り切れ・残りをカートで使い切った・1注文の上限なら false） */
  canAdd: boolean;
};

export function availability(
  cart: SkuCounts,
  remainingByItem: Partial<Record<ItemId, number | null>>,
  soldOut: readonly SkuKey[],
): Record<SkuKey, SkuAvailability> {
  const full = sum(cart) >= MAX_ORDER_QTY;
  return Object.fromEntries(
    SKUS.map(({ key, item }) => {
      const base = remainingByItem[item] ?? null;
      const inCart = SEASONING_IDS.reduce((n, s) => n + cart[skuKey(item, s)], 0);
      const remaining = base === null ? null : base - inCart;
      const out = soldOut.includes(key);
      return [key, { remaining, soldOut: out, canAdd: !out && !full && (remaining === null || remaining > 0) }];
    }),
  ) as Record<SkuKey, SkuAvailability>;
}

/** テンキーの入力（数字の文字列）に1キー加える。上限を超える入力は受け付けない */
export function pressKey(current: string, key: string): string {
  if (key === "clear") return "";
  if (key === "back") return current.slice(0, -1);
  if (!/^\d+$/.test(key)) return current;
  const next = (current + key).replace(/^0+(?=\d)/, "");
  return Number(next) > MAX_TENDERED ? current : next;
}
