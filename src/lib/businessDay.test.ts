import { describe, expect, it } from "vitest";
import { businessDayOf, isBusinessDay } from "./businessDay";

describe("businessDayOf", () => {
  it.each([
    ["2026-11-20T15:00:00.000Z", "2026-11-21"], // 11/21 0:00 JST
    ["2026-11-21T14:59:59.999Z", "2026-11-21"], // 11/21 23:59 JST
    ["2026-11-21T15:00:00.000Z", "2026-11-22"], // 11/22 0:00 JST
    ["2026-11-21T00:30:00.000Z", "2026-11-21"], // 11/21 9:30 JST（UTCではまだ前日ではない）
    ["2026-11-20T23:00:00.000Z", "2026-11-21"], // 11/21 8:00 JST（UTCでは前日）
    ["2026-12-31T15:00:00.000Z", "2027-01-01"], // 年またぎ
  ])("%s → %s", (iso, day) => {
    expect(businessDayOf(new Date(iso))).toBe(day);
  });
});

describe("isBusinessDay", () => {
  it("YYYY-MM-DD の実在する日付だけ", () => {
    expect(isBusinessDay("2026-11-21")).toBe(true);
    expect(isBusinessDay("2026-02-29")).toBe(false);
    expect(isBusinessDay("2026-11-1")).toBe(false);
    expect(isBusinessDay("all")).toBe(false);
  });
});
