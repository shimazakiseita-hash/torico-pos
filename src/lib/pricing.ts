import { DomainError } from "./errors";
import { DEFAULT_PRICE_MODE, PRICE_MODE_INFO, UNIT_PRICE, type PriceMode } from "./menu";

export const MIN_ORDER_QTY = 1;
export const MAX_ORDER_QTY = 50;

/** 預かり金額の上限（打ち間違い防止） */
export const MAX_TENDERED = 100000;

/** 合計金額（円）。品目に関係なく総本数で数え、まとめた組 × 単価 ＋ あまり × 単価 */
export function calcAmount(totalQty: number, mode: PriceMode = DEFAULT_PRICE_MODE): number {
  if (!Number.isInteger(totalQty) || totalQty < 0) {
    throw new RangeError(`本数が不正です: ${totalQty}`);
  }
  const { bundle } = PRICE_MODE_INFO[mode];
  return (Math.floor(totalQty / bundle) + (totalQty % bundle)) * UNIT_PRICE;
}

/** お釣り（円）。預かりが足りなければ INVALID_INPUT */
export function calcChange(amount: number, tendered: number): number {
  if (!Number.isInteger(tendered) || tendered < 0 || tendered > MAX_TENDERED) {
    throw new DomainError("INVALID_INPUT", "お預かり金額が不正です");
  }
  if (tendered < amount) {
    throw new DomainError("INVALID_INPUT", `お預かり金額が足りません（合計 ${amount}円）`);
  }
  return tendered - amount;
}
