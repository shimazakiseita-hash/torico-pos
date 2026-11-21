import { z } from "zod";
import { businessDaySchema, createOrderSchema, putSettingsSchema } from "../schemas";
import { DomainError } from "../errors";
import { DEFAULT_PRICE_MODE, ITEM_IDS, PRICE_MODES } from "../menu";
import { ORDER_STATUSES } from "../status";
import { emptyState, type DemoState } from "./store";

import { STORAGE_KEY } from "./constants";
const orderSchema = createOrderSchema.extend({
  id: z.number().int().positive(), businessDay: businessDaySchema, number: z.number().int().positive(),
  status: z.enum(ORDER_STATUSES), totalQty: z.number().int().positive(), amount: z.number().int().nonnegative(),
  changeDue: z.number().int().nonnegative(), createdAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(), servedAt: z.iso.datetime().nullable(), cancelledAt: z.iso.datetime().nullable(),
});
const stateSchema = z.object({ skipped: z.record(businessDaySchema, z.array(z.number().int().positive())).default({}), orders: z.array(orderSchema), settings: z.record(businessDaySchema, putSettingsSchema.required().extend({ businessDay: businessDaySchema, capacity: z.record(z.enum(ITEM_IDS), z.number().int().nonnegative().nullable()), priceMode: z.enum(PRICE_MODES).default(DEFAULT_PRICE_MODE) })) });

export function readState(): DemoState {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
    if (parsed.success) return parsed.data as DemoState;
  } catch {}
  return emptyState();
}

export function writeState(state: DemoState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できないのに成功と返すと、注文が消えたり番号が重なったりする
    throw new DomainError("INVALID_INPUT", "このスマホに保存できませんでした。プライベートブラウズをやめるか、「練習データを消す」を押してください");
  }
}
