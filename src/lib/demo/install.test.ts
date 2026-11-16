import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { respond } from "./install";
import { readState } from "./storage";
import { STORAGE_KEY } from "./constants";

let saved: string | null;
beforeEach(() => {
  saved = null;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === STORAGE_KEY ? saved : null,
    setItem: (_key: string, value: string) => { saved = value; },
  });
});
afterEach(() => vi.unstubAllGlobals());
const request = (path: string, method = "GET", body?: unknown) => respond(new Request(`https://practice.example/api/${path}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
}));

it("注文・状態・集計・CSVを保存済みの状態から返す", async () => {
  const created = await request("orders", "POST", { items: [{ item: "momo", seasoning: "tare", qty: 2 }], tendered: 500 });
  expect(created.status).toBe(201);
  const order = await created.json();
  expect(order).toMatchObject({ number: 1, amount: 200, changeDue: 300 });
  expect((await request(`orders/${order.id}`, "PATCH", { status: "served" })).status).toBe(409);
  expect((await request(`orders/${order.id}`, "PATCH", { status: "ready" })).status).toBe(200);
  expect(await (await request("orders?status=ready")).json()).toHaveLength(1);
  expect((await request("summary")).status).toBe(200);
  expect((await request("summary?day=total")).status).toBe(200);
  const csv = await request("export.csv?day=all");
  expect(csv.headers.get("content-disposition")).toMatch(/^attachment; filename="torico-orders-all-\d{12}\.csv"$/);
  expect(await csv.text()).toContain("もも");
  expect(await (await request("server-info")).json()).toEqual({ ips: [], port: 0, urls: [], practice: true });
  expect(await (await request("public-sync")).json()).toEqual({ state: "never" });
});

it("壊れた保存内容を空として扱い、別タブの変更を次回読み出す", async () => {
  saved = "{";
  expect(readState().orders).toEqual([]);
  saved = '{"orders":[{}],"settings":{}}';
  expect(readState().orders).toEqual([]);
  await request("settings?day=2026-11-21", "PUT", { cashFloat: 3000 });
  expect((await (await request("settings?day=2026-11-21")).json()).cashFloat).toBe(3000);
  saved = null;
  expect((await (await request("settings?day=2026-11-21")).json()).cashFloat).toBe(0);
});

it("本番と同じ入力エラーを返す", async () => {
  for (const path of ["orders?day=all", "settings?day=2026-02-30", "summary?day=no", "orders?status=no"]) {
    const response = await request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
  expect((await request("orders", "POST", {})).status).toBe(400);
  expect((await request("orders/0", "PATCH", { status: "ready" })).status).toBe(404);
});
