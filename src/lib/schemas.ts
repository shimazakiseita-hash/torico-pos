import { z } from "zod";
import { isBusinessDay } from "./businessDay";
import { ITEM_IDS, SEASONING_IDS, SKU_KEYS } from "./menu";
import { MAX_ORDER_QTY, MAX_TENDERED } from "./pricing";
import { ORDER_STATUSES } from "./status";

z.config(z.locales.ja());

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        item: z.enum(ITEM_IDS),
        seasoning: z.enum(SEASONING_IDS),
        qty: z.number().int().min(1).max(MAX_ORDER_QTY),
      }),
    )
    .min(1)
    .max(SKU_KEYS.length * 2),
  tendered: z.number().int().min(0).max(MAX_TENDERED),
});

/** 営業日 YYYY-MM-DD */
export const businessDaySchema = z.string().refine(isBusinessDay, "日付は YYYY-MM-DD で指定してください");

export const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const statusListSchema = z.array(z.enum(ORDER_STATUSES));

export const putSettingsSchema = z.object({
  capacity: z.partialRecord(z.enum(SKU_KEYS), z.number().int().min(0).max(99999).nullable()).optional(),
  soldout: z.array(z.enum(SKU_KEYS)).max(SKU_KEYS.length).optional(),
  cashFloat: z.number().int().min(0).max(MAX_TENDERED * 10).optional(),
  targetQty: z.number().int().min(1).max(99999).optional(),
});

const orderNumbersSchema = z.array(z.number().int().min(1)).max(1000);

export const publicStatusSchema = z.object({
  ready: orderNumbersSchema,
  waiting: orderNumbersSchema,
  avgWaitSeconds: z.number().int().min(0).max(86400).nullable(),
  // 古い public-sync（目安を送らない）からでも受け付ける
  secondsPerOrder: z.number().int().min(0).max(86400).nullable().default(null),
});

export const rankingSubmitSchema = z.object({
  player: z.string().regex(/^[a-z0-9]{8,32}$/), // スマホごとのID
  name: z.string().max(40), // 長さの本当の上限は normalizeName（10文字）で見る
  score: z.number().int().min(0).max(100000),
  session: z.string().max(200), // ゲーム開始時にサーバーが発行する、その場かぎりの合言葉（遊んだ時間はサーバーが測る）
});

/** お客さん向けページの設定：営業終了の表示 */
export const siteConfigSchema = z.object({
  closed: z.boolean(),
});
