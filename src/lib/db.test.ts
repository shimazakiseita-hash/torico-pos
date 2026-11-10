import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrder, getDaySettings, listOrders, openDb, putDaySettings, updateStatus, type DB } from "./db";
import { DomainError } from "./errors";

const DAY1 = new Date("2026-11-21T01:00:00.000Z"); // 11/21 10:00 JST
const DAY1_LATE = new Date("2026-11-21T14:59:00.000Z"); // 11/21 23:59 JST
const DAY2 = new Date("2026-11-21T15:00:00.000Z"); // 11/22 0:00 JST

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});

function expectDomainError(fn: () => unknown, code: DomainError["code"]) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error("例外が発生しませんでした");
}

const one = [{ item: "momo", seasoning: "tare", qty: 1 }] as const;

describe("createOrder", () => {
  it("金額・お釣りを計算し、同じSKUをまとめてメニュー順に保存する", () => {
    const r = createOrder(
      db,
      [
        { item: "kawa", seasoning: "shio", qty: 1 },
        { item: "momo", seasoning: "tare", qty: 2 },
        { item: "kawa", seasoning: "shio", qty: 1 },
        { item: "momo", seasoning: "shio", qty: 1 },
      ],
      1000,
      DAY1,
    );
    expect(r).toMatchObject({ businessDay: "2026-11-21", number: 1, amount: 500, tendered: 1000, changeDue: 500 });
    const [o] = listOrders(db, "2026-11-21");
    expect(o).toMatchObject({ status: "waiting", totalQty: 5, amount: 500, tendered: 1000, changeDue: 500 });
    expect(o.items).toEqual([
      { item: "momo", seasoning: "tare", qty: 2 },
      { item: "momo", seasoning: "shio", qty: 1 },
      { item: "kawa", seasoning: "shio", qty: 2 },
    ]);
  });

  it("預かりが足りなければ INVALID_INPUT で、番号も消費しない", () => {
    expectDomainError(() => createOrder(db, [{ item: "negima", seasoning: "tare", qty: 5 }], 400, DAY1), "INVALID_INPUT");
    expect(createOrder(db, one, 100, DAY1).number).toBe(1);
  });

  it("本数が 0 や 51 以上なら INVALID_INPUT", () => {
    expectDomainError(() => createOrder(db, [], 0, DAY1), "INVALID_INPUT");
    expectDomainError(() => createOrder(db, [{ item: "momo", seasoning: "tare", qty: 51 }], 10000, DAY1), "INVALID_INPUT");
    expect(createOrder(db, [{ item: "momo", seasoning: "tare", qty: 50 }], 5000, DAY1).amount).toBe(5000);
  });

  it("呼び出し番号は1からの連番で重複しない（取り消し後も続きから）", () => {
    const numbers: number[] = [];
    for (let i = 0; i < 50; i++) {
      const r = createOrder(db, one, 100, DAY1);
      numbers.push(r.number);
      if (i % 7 === 0) updateStatus(db, r.id, "cancelled");
    }
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("営業日（JSTの日付）が変わると番号は1から振り直す", () => {
    expect(createOrder(db, one, 100, DAY1).number).toBe(1);
    expect(createOrder(db, one, 100, DAY1_LATE).number).toBe(2);
    const d2 = createOrder(db, one, 100, DAY2);
    expect(d2).toMatchObject({ businessDay: "2026-11-22", number: 1 });
    expect(createOrder(db, one, 100, DAY2).number).toBe(2);
    expect(listOrders(db, "2026-11-21").map((o) => o.number)).toEqual([1, 2]);
    expect(listOrders(db, "2026-11-22").map((o) => o.number)).toEqual([1, 2]);
    expect(listOrders(db, null)).toHaveLength(4);
  });
});

describe("createOrder（別プロセスから同時に注文）", () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("4プロセス×25件を同時に作っても、番号は1〜100で重複も欠番もない", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "torico-test-"));
    const file = path.join(dir, "test.db");
    openDb(file).close();
    const worker = path.join(import.meta.dirname, "testing", "orderWorker.ts");
    const startAt = Date.now() + 3000;
    const run = () =>
      new Promise<number[]>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", worker, file, "25", String(startAt), DAY1.toISOString()]);
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(out) as number[]) : reject(new Error(err))));
      });
    const results = await Promise.all([run(), run(), run(), run()]);
    const all = results.flat().sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));

    const check = openDb(file);
    expect(listOrders(check, "2026-11-21").map((o) => o.number)).toEqual(all);
    check.close();
  }, 30000);
});

describe("updateStatus", () => {
  it("waiting → ready → served → ready → waiting とタイムスタンプ", () => {
    const { id } = createOrder(db, one, 100, DAY1);
    const t1 = new Date("2026-11-21T03:01:00.000Z");
    const t2 = new Date("2026-11-21T03:02:00.000Z");

    let o = updateStatus(db, id, "ready", t1);
    expect(o).toMatchObject({ status: "ready", readyAt: t1.toISOString(), servedAt: null });
    o = updateStatus(db, id, "served", t2);
    expect(o).toMatchObject({ status: "served", readyAt: t1.toISOString(), servedAt: t2.toISOString() });
    o = updateStatus(db, id, "ready");
    expect(o).toMatchObject({ status: "ready", readyAt: t1.toISOString(), servedAt: null });
    o = updateStatus(db, id, "waiting");
    expect(o).toMatchObject({ status: "waiting", readyAt: null });
  });

  it("不正な遷移は INVALID_TRANSITION、存在しない注文は NOT_FOUND", () => {
    const { id } = createOrder(db, one, 100, DAY1);
    expectDomainError(() => updateStatus(db, id, "served"), "INVALID_TRANSITION");
    updateStatus(db, id, "cancelled");
    expectDomainError(() => updateStatus(db, id, "waiting"), "INVALID_TRANSITION");
    expectDomainError(() => updateStatus(db, 999, "ready"), "NOT_FOUND");
  });
});

describe("listOrders", () => {
  it("営業日と状態で絞り込める", () => {
    const a = createOrder(db, one, 100, DAY1);
    createOrder(db, [{ item: "tsukune", seasoning: "shio", qty: 2 }], 200, DAY1);
    createOrder(db, one, 100, DAY2);
    updateStatus(db, a.id, "ready");
    expect(listOrders(db, "2026-11-21", ["ready"]).map((o) => o.number)).toEqual([1]);
    expect(listOrders(db, "2026-11-21", ["waiting", "ready"]).map((o) => o.number)).toEqual([1, 2]);
    expect(listOrders(db, "2026-11-21", ["waiting"])[0].items).toEqual([{ item: "tsukune", seasoning: "shio", qty: 2 }]);
    expect(listOrders(db, "2026-11-22", ["waiting"]).map((o) => o.businessDay)).toEqual(["2026-11-22"]);
    expect(listOrders(db, "2026-11-23")).toEqual([]);
  });
});

describe("day_settings", () => {
  it("初期値：仕込み数なし（上限なし）・売り切れなし・準備金0円", () => {
    const s = getDaySettings(db, "2026-11-21");
    expect(Object.values(s.capacity).every((v) => v === null)).toBe(true);
    expect(s).toMatchObject({ businessDay: "2026-11-21", soldout: [], cashFloat: 0 });
  });

  it("営業日ごとに保存され、capacity は SKU ごとに上書き・null で解除", () => {
    putDaySettings(db, "2026-11-21", { capacity: { "momo:tare": 60, "kawa:shio": 40 }, cashFloat: 30000, soldout: ["kawa:shio"] });
    const s = putDaySettings(db, "2026-11-21", { capacity: { "kawa:shio": null, "bonjiri:tare": 20 } });
    expect(s.capacity["momo:tare"]).toBe(60);
    expect(s.capacity["kawa:shio"]).toBeNull();
    expect(s.capacity["bonjiri:tare"]).toBe(20);
    expect(s).toMatchObject({ cashFloat: 30000, soldout: ["kawa:shio"] });

    const other = getDaySettings(db, "2026-11-22");
    expect(other.capacity["momo:tare"]).toBeNull();
    expect(other.cashFloat).toBe(0);
  });
});
