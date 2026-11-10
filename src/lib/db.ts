import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { businessDayOf } from "./businessDay";
import { DomainError } from "./errors";
import { DEFAULT_CAPACITY, DEFAULT_TARGET_QTY, ITEM_IDS, SEASONING_IDS, SKU_KEYS, SKUS, skuKey, type ItemId, type SkuKey } from "./menu";
import { normalizeItems } from "./order";
import { calcAmount, calcChange } from "./pricing";
import { STATUS_LABELS, canTransition, type OrderStatus } from "./status";
import type { CreatedOrder, DaySettings, Order, OrderItem } from "./types";

export type DB = Database.Database;

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "torico.db");

const sqlList = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(",");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_day TEXT NOT NULL,
  number       INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('waiting','ready','served','cancelled')),
  total_qty    INTEGER NOT NULL,
  amount       INTEGER NOT NULL,
  tendered     INTEGER NOT NULL,
  change_due   INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  ready_at     TEXT,
  served_at    TEXT,
  cancelled_at TEXT,
  UNIQUE (business_day, number)
);
CREATE TABLE IF NOT EXISTS order_items (
  order_id  INTEGER NOT NULL REFERENCES orders(id),
  item      TEXT NOT NULL CHECK (item IN (${sqlList(ITEM_IDS)})),
  seasoning TEXT NOT NULL CHECK (seasoning IN (${sqlList(SEASONING_IDS)})),
  qty       INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, item, seasoning)
);
CREATE TABLE IF NOT EXISTS day_settings (
  business_day TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (business_day, key)
);
CREATE INDEX IF NOT EXISTS idx_orders_day_status ON orders(business_day, status);
`;

/** DBを開いてスキーマを用意する。テストでは ':memory:' を渡す */
export function openDb(file: string = DEFAULT_DB_PATH): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

// 開発時のホットリロードで接続が増えないよう globalThis に保持する
const globalForDb = globalThis as unknown as { toricoDb?: DB };

export function getDb(): DB {
  globalForDb.toricoDb ??= openDb(process.env.TORICO_DB_PATH ?? DEFAULT_DB_PATH);
  return globalForDb.toricoDb;
}

type OrderRow = {
  id: number;
  business_day: string;
  number: number;
  status: OrderStatus;
  total_qty: number;
  amount: number;
  tendered: number;
  change_due: number;
  created_at: string;
  ready_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
};

type ItemRow = OrderItem & { order_id: number };

function toOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    businessDay: row.business_day,
    number: row.number,
    status: row.status,
    totalQty: row.total_qty,
    amount: row.amount,
    tendered: row.tendered,
    changeDue: row.change_due,
    createdAt: row.created_at,
    readyAt: row.ready_at,
    servedAt: row.served_at,
    cancelledAt: row.cancelled_at,
    items,
  };
}

const SKU_ORDER = new Map<SkuKey, number>(SKUS.map((s, i) => [s.key, i]));
const bySkuOrder = (a: OrderItem, b: OrderItem) =>
  SKU_ORDER.get(skuKey(a.item, a.seasoning))! - SKU_ORDER.get(skuKey(b.item, b.seasoning))!;

/** 注文を作る。金額とお釣りはここで計算し直す。番号は営業日ごとの連番 */
export function createOrder(db: DB, rawItems: readonly OrderItem[], tendered: number, now: Date = new Date()): CreatedOrder {
  const { items, totalQty } = normalizeItems(rawItems);
  const amount = calcAmount(totalQty);
  const changeDue = calcChange(amount, tendered);
  const businessDay = businessDayOf(now);

  const tx = db.transaction((): CreatedOrder => {
    const { next } = db
      .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM orders WHERE business_day = ?")
      .get(businessDay) as { next: number };
    const result = db
      .prepare(
        `INSERT INTO orders (business_day, number, status, total_qty, amount, tendered, change_due, created_at)
         VALUES (?, ?, 'waiting', ?, ?, ?, ?, ?)`,
      )
      .run(businessDay, next, totalQty, amount, tendered, changeDue, now.toISOString());
    const id = Number(result.lastInsertRowid);
    const insertItem = db.prepare("INSERT INTO order_items (order_id, item, seasoning, qty) VALUES (?, ?, ?, ?)");
    for (const i of items) insertItem.run(id, i.item, i.seasoning, i.qty);
    return { id, businessDay, number: next, amount, tendered, changeDue };
  });
  return tx.immediate();
}

/** 指定した営業日の注文（day が null なら全営業日）。番号順 */
export function listOrders(db: DB, day: string | null, statuses?: readonly OrderStatus[]): Order[] {
  const conds: string[] = [];
  const params: string[] = [];
  if (day !== null) {
    conds.push("business_day = ?");
    params.push(day);
  }
  if (statuses && statuses.length > 0) {
    conds.push(`status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY business_day, number`).all(...params) as OrderRow[];
  if (rows.length === 0) return [];

  const itemRows = db
    .prepare(`SELECT order_id, item, seasoning, qty FROM order_items WHERE order_id IN (SELECT id FROM orders ${where})`)
    .all(...params) as ItemRow[];
  const itemsById = new Map<number, OrderItem[]>();
  for (const r of itemRows) {
    const list = itemsById.get(r.order_id) ?? [];
    list.push({ item: r.item, seasoning: r.seasoning, qty: r.qty });
    itemsById.set(r.order_id, list);
  }
  return rows.map((row) => toOrder(row, (itemsById.get(row.id) ?? []).sort(bySkuOrder)));
}

export function getOrder(db: DB, id: number): Order | null {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  if (!row) return null;
  const items = db.prepare("SELECT item, seasoning, qty FROM order_items WHERE order_id = ?").all(id) as OrderItem[];
  return toOrder(row, items.sort(bySkuOrder));
}

/** 状態に応じて更新するタイムスタンプ列。戻す操作では該当列を消す */
const TIMESTAMP_UPDATES: Record<OrderStatus, string> = {
  waiting: "ready_at = NULL",
  ready: "ready_at = @now",
  served: "served_at = @now",
  cancelled: "cancelled_at = @now",
};

export function updateStatus(db: DB, id: number, to: OrderStatus, now: Date = new Date()): Order {
  const tx = db.transaction((): Order => {
    const row = db.prepare("SELECT status, number FROM orders WHERE id = ?").get(id) as
      | { status: OrderStatus; number: number }
      | undefined;
    if (!row) throw new DomainError("NOT_FOUND", "注文が見つかりません");
    if (!canTransition(row.status, to)) {
      throw new DomainError(
        "INVALID_TRANSITION",
        `${row.number}番は「${STATUS_LABELS[row.status]}」のため「${STATUS_LABELS[to]}」にできません`,
      );
    }
    // ready → waiting、served → ready の「戻す」では served_at/ready_at を消す
    const stamp = row.status === "served" && to === "ready" ? "served_at = NULL" : TIMESTAMP_UPDATES[to];
    db.prepare(`UPDATE orders SET status = @to, ${stamp} WHERE id = @id`).run({ id, to, now: now.toISOString() });
    return getOrder(db, id)!;
  });
  return tx.immediate();
}

export type DaySettingsPatch = {
  capacity?: Partial<Record<ItemId, number | null>>;
  soldout?: SkuKey[];
  cashFloat?: number;
  targetQty?: number;
};

/** 営業日の設定。未設定の項目は初期値（上限は DEFAULT_CAPACITY、売り切れなし、準備金0円） */
export function getDaySettings(db: DB, day: string): DaySettings {
  const rows = db.prepare("SELECT key, value FROM day_settings WHERE business_day = ?").all(day) as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  const capacity: Record<ItemId, number | null> = { ...DEFAULT_CAPACITY };
  const saved = (map.get("capacity") ?? {}) as Partial<Record<string, number | null>>;
  for (const k of ITEM_IDS) if (typeof saved[k] === "number" || saved[k] === null) capacity[k] = saved[k];
  const soldout = ((map.get("soldout") ?? []) as string[]).filter((k): k is SkuKey => SKU_KEYS.includes(k as SkuKey));
  return {
    businessDay: day,
    capacity,
    soldout,
    cashFloat: (map.get("cash_float") as number | undefined) ?? 0,
    targetQty: (map.get("target_qty") as number | undefined) ?? DEFAULT_TARGET_QTY,
  };
}

/** 渡された項目だけ更新する。capacity は串ごとに上書き（null で上限なし） */
export function putDaySettings(db: DB, day: string, patch: DaySettingsPatch): DaySettings {
  const upsert = db.prepare(
    `INSERT INTO day_settings (business_day, key, value) VALUES (?, ?, ?)
     ON CONFLICT(business_day, key) DO UPDATE SET value = excluded.value`,
  );
  db.transaction(() => {
    if (patch.capacity !== undefined) {
      const capacity = { ...getDaySettings(db, day).capacity, ...patch.capacity };
      upsert.run(day, "capacity", JSON.stringify(capacity));
    }
    if (patch.soldout !== undefined) {
      const soldout = SKU_KEYS.filter((k) => patch.soldout!.includes(k));
      upsert.run(day, "soldout", JSON.stringify(soldout));
    }
    if (patch.cashFloat !== undefined) upsert.run(day, "cash_float", JSON.stringify(patch.cashFloat));
    if (patch.targetQty !== undefined) upsert.run(day, "target_qty", JSON.stringify(patch.targetQty));
  }).immediate();
  return getDaySettings(db, day);
}
