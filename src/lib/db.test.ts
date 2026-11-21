import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNumbering, skipNumber, undoSkip, renumberOrder, createOrder, getDaySettings, listOrders, openDb, putDaySettings, updateStatus, type DB } from "./db";
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

  it("その営業日の値段の決め方で金額を計算する（品目をまたいで総本数で数える）", () => {
    putDaySettings(db, "2026-11-21", { priceMode: "three" });
    const r = createOrder(db, [{ item: "momo", seasoning: "tare", qty: 2 }, { item: "kawa", seasoning: "shio", qty: 2 }], 500, DAY1, "three");
    expect(r).toMatchObject({ amount: 200, changeDue: 300 });
    expect(createOrder(db, one, 100, DAY2).amount).toBe(100); // 2日目は1本100円のまま
  });

  it("受付が表示していた値段と今の値段が違えば 409 で、注文も番号も作らない", () => {
    putDaySettings(db, "2026-11-21", { priceMode: "two" });
    expectDomainError(() => createOrder(db, [{ item: "momo", seasoning: "tare", qty: 2 }], 200, DAY1, "single"), "INVALID_TRANSITION");
    expect(listOrders(db, "2026-11-21")).toHaveLength(0);
    expect(createOrder(db, [{ item: "momo", seasoning: "tare", qty: 2 }], 100, DAY1, "two")).toMatchObject({ number: 1, amount: 100 });
  });

  it("預かりが値段の切り替え後の金額に足りなければ INVALID_INPUT", () => {
    putDaySettings(db, "2026-11-21", { priceMode: "two" });
    expectDomainError(() => createOrder(db, [{ item: "momo", seasoning: "tare", qty: 3 }], 100, DAY1, "two"), "INVALID_INPUT");
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
  it("初期値：上限は もも500・ほか250（たれ・塩の合計）、目標はその合計、売り切れなし・準備金0円", () => {
    const s = getDaySettings(db, "2026-11-21");
    expect(s.capacity).toEqual({ momo: 500, kawa: 250, negima: 250, tsukune: 250, bonjiri: 250 });
    expect(s).toMatchObject({ businessDay: "2026-11-21", soldout: [], cashFloat: 0, targetQty: 1500, priceMode: "single" });
  });

  it("値段の決め方は営業日ごとに保存される", () => {
    expect(putDaySettings(db, "2026-11-22", { priceMode: "three" }).priceMode).toBe("three");
    expect(putDaySettings(db, "2026-11-22", { cashFloat: 1000 }).priceMode).toBe("three");
    expect(getDaySettings(db, "2026-11-21").priceMode).toBe("single");
  });

  it("営業日ごとに保存され、capacity は串ごとに上書き・null で上限なし", () => {
    putDaySettings(db, "2026-11-21", { capacity: { momo: 60, kawa: 40 }, cashFloat: 30000, soldout: ["kawa:shio"] });
    const s = putDaySettings(db, "2026-11-21", { capacity: { kawa: null, bonjiri: 20 } });
    expect(s.capacity).toEqual({ momo: 60, kawa: null, negima: 250, tsukune: 250, bonjiri: 20 });
    expect(s).toMatchObject({ cashFloat: 30000, soldout: ["kawa:shio"] });

    const other = getDaySettings(db, "2026-11-22");
    expect(other.capacity.momo).toBe(500);
    expect(other.cashFloat).toBe(0);
  });
});

describe("整理券の番号", () => {
  it("連続で飛ばした番号は注文にせず、次の採番に反映する", () => {
    expect(getNumbering(db, "2026-11-21")).toEqual({ businessDay: "2026-11-21", next: 1, skipped: [], canUndo: false });
    expect(skipNumber(db, DAY1)).toMatchObject({ next: 2, skipped: [1], canUndo: true });
    expect(skipNumber(db, DAY1)).toMatchObject({ next: 3, skipped: [1, 2] });
    expect(listOrders(db, "2026-11-21")).toEqual([]);
    expect(createOrder(db, one, 100, DAY1).number).toBe(3);
    expect(getNumbering(db, "2026-11-21")).toMatchObject({ next: 4, canUndo: false });
  });
  it("最大の飛ばした番号から戻せるが、注文後には戻せない", () => {
    expectDomainError(() => undoSkip(db, DAY1), "INVALID_TRANSITION");
    skipNumber(db, DAY1);
    skipNumber(db, DAY1);
    expect(undoSkip(db, DAY1)).toMatchObject({ next: 2, skipped: [1], canUndo: true });
    expect(undoSkip(db, DAY1)).toMatchObject({ next: 1, skipped: [], canUndo: false });
    skipNumber(db, DAY1);
    createOrder(db, one, 100, DAY1);
    expectDomainError(() => undoSkip(db, DAY1), "INVALID_TRANSITION");
  });
  it("再発行は元番号を記録し、会計と状態を保ったまま何度でもできる", () => {
    const original = createOrder(db, one, 1000, DAY1);
    createOrder(db, one, 100, DAY1);
    skipNumber(db, DAY1);
    const changed = renumberOrder(db, original.id, DAY1);
    expect(changed).toMatchObject({ ...original, number: 4, status: "waiting" });
    expect(getNumbering(db, "2026-11-21")).toMatchObject({ next: 5, skipped: [3, 1], canUndo: false });
    updateStatus(db, original.id, "ready", DAY1);
    expect(renumberOrder(db, original.id, DAY1)).toMatchObject({ number: 5, status: "ready", readyAt: DAY1.toISOString(), changeDue: 900 });
    expect(getNumbering(db, "2026-11-21").skipped).toEqual([3, 1, 4]);
    expect(listOrders(db, "2026-11-21").map((o) => o.number)).toEqual([2, 5]);
  });
  it("受け渡し済み・取り消し・別の日・存在しない注文は再発行できない", () => {
    const served = createOrder(db, one, 100, DAY1);
    updateStatus(db, served.id, "ready", DAY1);
    updateStatus(db, served.id, "served", DAY1);
    const cancelled = createOrder(db, one, 100, DAY1);
    updateStatus(db, cancelled.id, "cancelled", DAY1);
    const waiting = createOrder(db, one, 100, DAY1);
    const before = getNumbering(db, "2026-11-21");
    expectDomainError(() => renumberOrder(db, served.id, DAY1), "INVALID_TRANSITION");
    expectDomainError(() => renumberOrder(db, cancelled.id, DAY1), "INVALID_TRANSITION");
    expectDomainError(() => renumberOrder(db, waiting.id, DAY2), "INVALID_TRANSITION");
    expectDomainError(() => renumberOrder(db, 999, DAY1), "NOT_FOUND");
    expect(getNumbering(db, "2026-11-21")).toEqual(before);
  });
  it("JSTの日付が変わると飛ばした番号は持ち越さない", () => {
    skipNumber(db, DAY1_LATE);
    expect(getNumbering(db, "2026-11-22")).toMatchObject({ next: 1, skipped: [], canUndo: false });
    expectDomainError(() => undoSkip(db, DAY2), "INVALID_TRANSITION");
    expect(createOrder(db, one, 100, DAY2).number).toBe(1);
    expect(getNumbering(db, "2026-11-21").skipped).toEqual([1]);
  });
});
