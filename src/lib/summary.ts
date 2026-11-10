import { ITEMS, SEASONINGS, SKU_KEYS, emptySkuCounts, skuKey, type ItemId, type SeasoningId, type SkuCounts, type SkuKey } from "./menu";
import type { DaySettings, Order, OrderItem } from "./types";

const AVG_WAIT_SAMPLE = 10;
const PACE_SAMPLE = 10;
const PACE_MIN_SAMPLES = 3;

export type Summary = {
  businessDay: string;
  /** 販売本数（cancelled 以外） */
  soldTotal: number;
  soldBySku: SkuCounts;
  soldByItem: Record<ItemId, number>;
  soldBySeasoning: Record<SeasoningId, number>;
  /** 売上（円、cancelled 以外） */
  revenue: number;
  /** 釣り銭準備金と、レジ内現金の理論値（準備金＋売上） */
  cashFloat: number;
  expectedCash: number;
  /** 焼くべき本数（waiting の本数） */
  toGrillTotal: number;
  toGrillBySku: SkuCounts;
  /** 残り販売可能数（仕込み数 − 販売本数）。仕込み数が未設定なら null */
  remainingBySku: Record<SkuKey, number | null>;
  /** 受付で押せないSKU（残り0以下、または手動の売り切れ） */
  soldOut: SkuKey[];
  waitingCount: number;
  readyCount: number;
  /** 直近10件の served の平均待ち時間（秒）。served が無ければ null */
  avgWaitSeconds: number | null;
  /** 完成のペース（1件あたり秒）。お客さん向けの待ち時間のめやすに使う。完成が3件未満なら null */
  secondsPerOrder: number | null;
  targetQty: number;
};

function addItems(counts: SkuCounts, items: readonly OrderItem[]): void {
  for (const i of items) counts[skuKey(i.item, i.seasoning)] += i.qty;
}

/** 注文群のSKU別本数 */
export function countBySku(orders: readonly Order[]): SkuCounts {
  const counts = emptySkuCounts();
  for (const o of orders) addItems(counts, o.items);
  return counts;
}

export function sum(counts: SkuCounts): number {
  return SKU_KEYS.reduce((acc, k) => acc + counts[k], 0);
}

export function byItem(counts: SkuCounts): Record<ItemId, number> {
  return Object.fromEntries(ITEMS.map((i) => [i.id, SEASONINGS.reduce((a, s) => a + counts[skuKey(i.id, s.id)], 0)])) as Record<
    ItemId,
    number
  >;
}

export function bySeasoning(counts: SkuCounts): Record<SeasoningId, number> {
  return Object.fromEntries(SEASONINGS.map((s) => [s.id, ITEMS.reduce((a, i) => a + counts[skuKey(i.id, s.id)], 0)])) as Record<
    SeasoningId,
    number
  >;
}

/** 1営業日分の注文と設定から集計する */
export function computeSummary(orders: readonly Order[], settings: DaySettings): Summary {
  const sold = countBySku(orders.filter((o) => o.status !== "cancelled"));
  const toGrill = countBySku(orders.filter((o) => o.status === "waiting"));
  let revenue = 0;
  let waitingCount = 0;
  let readyCount = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    revenue += o.amount;
    if (o.status === "waiting") waitingCount++;
    else if (o.status === "ready") readyCount++;
  }

  const remainingBySku = Object.fromEntries(
    SKU_KEYS.map((k) => {
      const cap = settings.capacity[k];
      return [k, cap === null ? null : cap - sold[k]];
    }),
  ) as Record<SkuKey, number | null>;
  const soldOut = SKU_KEYS.filter((k) => settings.soldout.includes(k) || (remainingBySku[k] !== null && remainingBySku[k] <= 0));

  return {
    businessDay: settings.businessDay,
    soldTotal: sum(sold),
    soldBySku: sold,
    soldByItem: byItem(sold),
    soldBySeasoning: bySeasoning(sold),
    revenue,
    cashFloat: settings.cashFloat,
    expectedCash: settings.cashFloat + revenue,
    toGrillTotal: sum(toGrill),
    toGrillBySku: toGrill,
    remainingBySku,
    soldOut,
    waitingCount,
    readyCount,
    avgWaitSeconds: averageWaitSeconds(orders),
    secondsPerOrder: secondsPerOrder(orders),
    targetQty: settings.targetQty,
  };
}

export function averageWaitSeconds(orders: readonly Order[], sample = AVG_WAIT_SAMPLE): number | null {
  const recent = orders
    .filter((o): o is Order & { servedAt: string } => o.status === "served" && o.servedAt !== null)
    .sort((a, b) => Date.parse(b.servedAt) - Date.parse(a.servedAt))
    .slice(0, sample);
  if (recent.length === 0) return null;
  const total = recent.reduce((acc, o) => acc + (Date.parse(o.servedAt) - Date.parse(o.createdAt)), 0);
  return Math.round(total / recent.length / 1000);
}

/** 直近10件の完成（ready_at）の間隔の平均（秒）。まとめて焼いて一度に完成する分もならして扱う */
export function secondsPerOrder(orders: readonly Order[], sample = PACE_SAMPLE): number | null {
  const times = orders
    .filter((o) => (o.status === "ready" || o.status === "served") && o.readyAt !== null)
    .map((o) => Date.parse(o.readyAt!))
    .sort((a, b) => b - a)
    .slice(0, sample);
  if (times.length < PACE_MIN_SAMPLES) return null;
  return Math.round((times[0] - times[times.length - 1]) / (times.length - 1) / 1000);
}
