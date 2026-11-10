export const ITEM_IDS = ["momo", "kawa", "negima", "tsukune", "bonjiri"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const SEASONING_IDS = ["tare", "shio"] as const;
export type SeasoningId = (typeof SEASONING_IDS)[number];

export type Item = { id: ItemId; name: string };

export type Seasoning = {
  id: SeasoningId;
  name: string;
  /** 塗りつぶし用・文字用・枠線用（Tailwind クラス） */
  bg: string;
  text: string;
  border: string;
};

export const ITEMS: readonly Item[] = [
  { id: "momo", name: "もも" },
  { id: "kawa", name: "かわ" },
  { id: "negima", name: "ねぎま" },
  { id: "tsukune", name: "つくね" },
  { id: "bonjiri", name: "ぼんじり" },
];

export const SEASONINGS: readonly Seasoning[] = [
  { id: "tare", name: "たれ", bg: "bg-tare-bg", text: "text-tare", border: "border-tare" },
  { id: "shio", name: "塩", bg: "bg-shio-bg", text: "text-shio", border: "border-shio" },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<ItemId, Item>;
export const SEASONING_BY_ID = Object.fromEntries(SEASONINGS.map((s) => [s.id, s])) as Record<SeasoningId, Seasoning>;

/** SKU＝串と味付けの組。キーは "momo:tare" の形（day_settings の soldout と同じ） */
export type SkuKey = `${ItemId}:${SeasoningId}`;
export type Sku = { key: SkuKey; item: ItemId; seasoning: SeasoningId };

export function skuKey(item: ItemId, seasoning: SeasoningId): SkuKey {
  return `${item}:${seasoning}`;
}

/** 表示順：もも→ぼんじり、各串の中で たれ→塩 */
export const SKUS: readonly Sku[] = ITEM_IDS.flatMap((item) =>
  SEASONING_IDS.map((seasoning) => ({ key: skuKey(item, seasoning), item, seasoning })),
);

export const SKU_KEYS = SKUS.map((s) => s.key) as [SkuKey, ...SkuKey[]];

export function skuName(item: ItemId, seasoning: SeasoningId): string {
  return `${ITEM_BY_ID[item].name} ${SEASONING_BY_ID[seasoning].name}`;
}

export type SkuCounts = Record<SkuKey, number>;

export function emptySkuCounts(): SkuCounts {
  return Object.fromEntries(SKU_KEYS.map((k) => [k, 0])) as SkuCounts;
}

/** 1本の値段（円）。全品同じ */
export const UNIT_PRICE = 100;

/** 1日の販売上限（本、たれ・塩の合計）。営業日ごとに変更可 */
export const DEFAULT_CAPACITY: Record<ItemId, number> = { momo: 500, kawa: 250, negima: 250, tsukune: 250, bonjiri: 250 };

/** 管理画面の進捗バーの目標本数（営業日ごとに変更可。初期値は上限の合計） */
export const DEFAULT_TARGET_QTY = Object.values(DEFAULT_CAPACITY).reduce((a, b) => a + b, 0);
