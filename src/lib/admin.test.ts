import { describe, expect, it } from "vitest";
import { TOTAL, cashDifference, dayTabs, parseCount, totalSettings } from "./admin";
import { DEFAULT_CAPACITY } from "./menu";
import type { DaySettings } from "./types";

describe("dayTabs", () => {
  it("祭りの日は 1日目・2日目・合計", () => {
    expect(dayTabs("2026-11-22")).toEqual([
      { key: "2026-11-21", label: "1日目" },
      { key: "2026-11-22", label: "2日目" },
      { key: TOTAL, label: "合計" },
    ]);
  });

  it("それ以外の日（準備・練習）は先頭に今日", () => {
    expect(dayTabs("2026-11-18")[0]).toEqual({ key: "2026-11-18", label: "今日 11/18" });
    expect(dayTabs("2026-11-18")).toHaveLength(4);
  });
});

describe("totalSettings", () => {
  const day = (d: string, cashFloat: number): DaySettings => ({
    businessDay: d,
    capacity: { ...DEFAULT_CAPACITY },
    soldout: ["momo:tare"],
    cashFloat,
    targetQty: 1500,
  });

  it("準備金と目標は2日分を足し、上限と売り切れは持たない", () => {
    const t = totalSettings([day("2026-11-21", 30000), day("2026-11-22", 20000)]);
    expect(t).toMatchObject({ businessDay: TOTAL, soldout: [], cashFloat: 50000, targetQty: 3000 });
    expect(Object.values(t.capacity).every((v) => v === null)).toBe(true);
  });
});

describe("cashDifference", () => {
  it("実際 − 理論値", () => {
    expect(cashDifference(35000, 35000)).toEqual({ diff: 0, label: "ぴったり" });
    expect(cashDifference(35000, 36000)).toEqual({ diff: 1000, label: "1,000円 多い" });
    expect(cashDifference(35000, 34900)).toEqual({ diff: -100, label: "100円 足りない" });
  });
});

describe("parseCount", () => {
  it("空は null、数字以外や上限超えは undefined", () => {
    expect(parseCount(" 250 ")).toBe(250);
    expect(parseCount("")).toBeNull();
    expect(parseCount("-1")).toBeUndefined();
    expect(parseCount("1.5")).toBeUndefined();
    expect(parseCount("100000", 99999)).toBeUndefined();
  });
});
