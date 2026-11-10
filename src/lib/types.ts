import type { ItemId, SeasoningId, SkuKey } from "./menu";
import type { OrderStatus } from "./status";

export type OrderItem = { item: ItemId; seasoning: SeasoningId; qty: number };

export type Order = {
  id: number;
  businessDay: string;
  number: number;
  status: OrderStatus;
  totalQty: number;
  amount: number;
  tendered: number;
  changeDue: number;
  createdAt: string;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
};

/** 営業日ごとの設定。capacity が null の SKU は上限なし */
export type DaySettings = {
  businessDay: string;
  capacity: Record<SkuKey, number | null>;
  soldout: SkuKey[];
  cashFloat: number;
  targetQty: number;
};

export type CreatedOrder = {
  id: number;
  businessDay: string;
  number: number;
  amount: number;
  tendered: number;
  changeDue: number;
};
