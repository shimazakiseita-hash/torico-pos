import { describe, expect, it } from "vitest";
import { ordersToCsv } from "./csv";
import type { Order } from "./types";

const order: Order = {
  id: 1,
  businessDay: "2026-11-21",
  number: 7,
  status: "served",
  totalQty: 4,
  amount: 400,
  tendered: 1000,
  changeDue: 600,
  createdAt: "2026-11-21T03:00:00.000Z",
  readyAt: "2026-11-21T03:05:00.000Z",
  servedAt: "2026-11-21T03:06:00.000Z",
  cancelledAt: null,
  items: [
    { item: "momo", seasoning: "tare", qty: 3 },
    { item: "bonjiri", seasoning: "shio", qty: 1 },
  ],
};

describe("ordersToCsv", () => {
  const csv = ordersToCsv([order]);
  const lines = csv.slice(1).trimEnd().split("\r\n");

  it("BOM付き・ヘッダー行つき", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe(
      "営業日,番号,状態,もも たれ,もも 塩,かわ たれ,かわ 塩,ねぎま たれ,ねぎま 塩,つくね たれ,つくね 塩,ぼんじり たれ,ぼんじり 塩,本数,金額,預かり,お釣り,注文時刻,完成時刻,受け渡し時刻,取り消し時刻",
    );
  });

  it("1行＝1注文でSKU別本数・預かり・お釣りを列に持つ", () => {
    const cols = lines[1].split(",");
    expect(cols.slice(0, 3)).toEqual(["2026-11-21", "7", "受け渡し済み"]);
    expect(cols.slice(3, 13)).toEqual(["3", "0", "0", "0", "0", "0", "0", "0", "0", "1"]);
    expect(cols.slice(13, 17)).toEqual(["4", "400", "1000", "600"]);
    expect(cols[17]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(cols[20]).toBe("");
  });
});
