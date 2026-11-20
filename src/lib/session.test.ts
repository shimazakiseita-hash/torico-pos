import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, createSession, verifySession } from "./session";

const SECRET = "test-secret-0123456789";
const ID = "0123456789abcdef";
const T0 = 1_790_000_000_000;

describe("createSession / verifySession", () => {
  it("サーバーが発行した合言葉は通り、開始時刻と番号が取り出せる", async () => {
    const token = await createSession(SECRET, T0, ID);
    expect(await verifySession(SECRET, token, T0 + 60_000)).toEqual({ ok: true, id: ID, startedAt: T0 });
  });

  it("開始時刻を書き換えると通らない（長く遊んだことにはできない）", async () => {
    const token = await createSession(SECRET, T0, ID);
    const forged = token.replace(`.${T0}.`, `.${T0 - 30 * 60_000}.`);
    expect(await verifySession(SECRET, forged, T0)).toEqual({ ok: false, reason: "invalid" });
  });

  it("別の鍵で作った合言葉や、でたらめな文字列は通らない", async () => {
    expect((await verifySession(SECRET, await createSession("other-secret", T0, ID), T0)).ok).toBe(false);
    expect((await verifySession(SECRET, "abc", T0)).ok).toBe(false);
  });

  it("期限（30分）を過ぎると通らない", async () => {
    const token = await createSession(SECRET, T0, ID);
    expect((await verifySession(SECRET, token, T0 + SESSION_TTL_MS - 1)).ok).toBe(true);
    expect(await verifySession(SECRET, token, T0 + SESSION_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
  });
});
