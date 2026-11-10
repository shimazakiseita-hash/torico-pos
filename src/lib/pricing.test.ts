import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { calcAmount, calcChange } from "./pricing";

describe("calcAmount", () => {
  it.each([
    [1, 100],
    [3, 300],
    [5, 500],
    [50, 5000],
  ])("%i本 → %i円", (qty, amount) => {
    expect(calcAmount(qty)).toBe(amount);
  });

  it("不正な本数は例外", () => {
    expect(() => calcAmount(-1)).toThrow();
    expect(() => calcAmount(1.5)).toThrow();
  });
});

describe("calcChange", () => {
  it.each([
    [500, 500, 0],
    [500, 1000, 500],
    [1300, 5000, 3700],
    [200, 10000, 9800],
    [300, 350, 50],
  ])("合計%i円・預かり%i円 → お釣り%i円", (amount, tendered, change) => {
    expect(calcChange(amount, tendered)).toBe(change);
  });

  it("預かりが足りない・不正なら INVALID_INPUT", () => {
    for (const tendered of [400, -100, 1000.5, 100001]) {
      expect(() => calcChange(500, tendered)).toThrow(DomainError);
    }
  });
});
