import { DomainError } from "./errors";
import { SKUS, emptySkuCounts, skuKey } from "./menu";
import { MAX_ORDER_QTY, MIN_ORDER_QTY } from "./pricing";
import type { OrderItem } from "./types";

/** 同じSKUをまとめ、0本の行を除き、メニュー順に並べる。総本数が範囲外なら INVALID_INPUT */
export function normalizeItems(items: readonly OrderItem[]): { items: OrderItem[]; totalQty: number } {
  const counts = emptySkuCounts();
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 0) {
      throw new DomainError("INVALID_INPUT", "本数が不正です");
    }
    counts[skuKey(i.item, i.seasoning)] += i.qty;
  }
  const merged = SKUS.filter((s) => counts[s.key] > 0).map((s) => ({ item: s.item, seasoning: s.seasoning, qty: counts[s.key] }));
  const totalQty = merged.reduce((acc, i) => acc + i.qty, 0);
  if (totalQty < MIN_ORDER_QTY || totalQty > MAX_ORDER_QTY) {
    throw new DomainError("INVALID_INPUT", `1注文の本数は${MIN_ORDER_QTY}〜${MAX_ORDER_QTY}本です`);
  }
  return { items: merged, totalQty };
}
