import { businessDayOf } from "../businessDay";
import { DomainError } from "../errors";
import { DEFAULT_CAPACITY, DEFAULT_TARGET_QTY, SKU_KEYS, type ItemId, type SkuKey } from "../menu";
import { normalizeItems } from "../order";
import { calcAmount, calcChange } from "../pricing";
import { canTransition, STATUS_LABELS, type OrderStatus } from "../status";
import type { CreatedOrder, DaySettings, Order, OrderItem } from "../types";

export type DemoState = { orders: Order[]; settings: Record<string, DaySettings> };
export type SettingsPatch = { capacity?: Partial<Record<ItemId, number | null>>; soldout?: SkuKey[]; cashFloat?: number; targetQty?: number };
export const emptyState = (): DemoState => ({ orders: [], settings: {} });

export function createOrder(state: DemoState, rawItems: readonly OrderItem[], tendered: number, now: Date = new Date()): { state: DemoState; value: CreatedOrder } {
  const { items, totalQty } = normalizeItems(rawItems);
  const amount = calcAmount(totalQty);
  const changeDue = calcChange(amount, tendered);
  const businessDay = businessDayOf(now);
  const id = Math.max(0, ...state.orders.map((o) => o.id)) + 1;
  const number = Math.max(0, ...state.orders.filter((o) => o.businessDay === businessDay).map((o) => o.number)) + 1;
  const value = { id, businessDay, number, amount, tendered, changeDue };
  const order: Order = { ...value, items, totalQty, status: "waiting", createdAt: now.toISOString(), readyAt: null, servedAt: null, cancelledAt: null };
  return { state: { ...state, orders: [...state.orders, order] }, value };
}

export function listOrders(state: DemoState, day: string | null, statuses?: readonly OrderStatus[]): Order[] {
  return structuredClone(state.orders.filter((o) => (day === null || o.businessDay === day) && (!statuses?.length || statuses.includes(o.status)))
    .sort((a, b) => a.businessDay.localeCompare(b.businessDay) || a.number - b.number));
}

export function updateStatus(state: DemoState, id: number, to: OrderStatus, now: Date = new Date()): { state: DemoState; value: Order } {
  const order = state.orders.find((o) => o.id === id);
  if (!order) throw new DomainError("NOT_FOUND", "注文が見つかりません");
  if (!canTransition(order.status, to)) throw new DomainError("INVALID_TRANSITION", `${order.number}番は「${STATUS_LABELS[order.status]}」のため「${STATUS_LABELS[to]}」にできません`);
  const value = structuredClone(order);
  value.status = to;
  if (to === "waiting") value.readyAt = null;
  if (to === "ready") {
    if (order.status === "served") value.servedAt = null;
    else value.readyAt = now.toISOString();
  }
  if (to === "served") value.servedAt = now.toISOString();
  if (to === "cancelled") value.cancelledAt = now.toISOString();
  return { state: { ...state, orders: state.orders.map((o) => o.id === id ? value : o) }, value };
}

export function getDaySettings(state: DemoState, day: string): DaySettings {
  return structuredClone(state.settings[day] ?? { businessDay: day, capacity: { ...DEFAULT_CAPACITY }, soldout: [], cashFloat: 0, targetQty: DEFAULT_TARGET_QTY });
}

export function putDaySettings(state: DemoState, day: string, patch: SettingsPatch): { state: DemoState; value: DaySettings } {
  const previous = getDaySettings(state, day);
  const value: DaySettings = { ...previous, ...patch, capacity: { ...previous.capacity, ...patch.capacity }, soldout: patch.soldout === undefined ? previous.soldout : SKU_KEYS.filter((k) => patch.soldout!.includes(k)) };
  return { state: { ...state, settings: { ...state.settings, [day]: value } }, value };
}
