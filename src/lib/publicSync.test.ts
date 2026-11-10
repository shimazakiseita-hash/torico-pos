import { describe, expect, it } from "vitest";
import { EMPTY_SYNC_STATE, recordSync, syncHealth } from "./publicSync";

const t0 = new Date("2026-11-21T03:00:00.000Z");
const after = (sec: number) => t0.getTime() + sec * 1000;

describe("公開ページへの送信状況", () => {
  it("一度も知らせがなければ never", () => {
    expect(syncHealth(EMPTY_SYNC_STATE, after(0))).toEqual({ state: "never" });
  });

  it("成功から60秒未満は ok、60秒以上は stale", () => {
    const s = recordSync(EMPTY_SYNC_STATE, { ok: true }, t0);
    expect(syncHealth(s, after(59))).toEqual({ state: "ok", lastSuccessAt: t0.toISOString(), ageSeconds: 59 });
    expect(syncHealth(s, after(60))).toMatchObject({ state: "stale", ageSeconds: 60, error: null });
  });

  it("失敗しても最後に成功した時刻は残り、エラーを出す。成功したらエラーは消える", () => {
    const ok = recordSync(EMPTY_SYNC_STATE, { ok: true }, t0);
    const ng = recordSync(ok, { ok: false, error: "fetch failed" }, new Date(after(70)));
    expect(syncHealth(ng, after(70))).toEqual({ state: "stale", lastSuccessAt: t0.toISOString(), ageSeconds: 70, error: "fetch failed" });
    const back = recordSync(ng, { ok: true }, new Date(after(80)));
    expect(syncHealth(back, after(80))).toMatchObject({ state: "ok", ageSeconds: 0 });
  });

  it("一度も成功していない失敗は stale（最終更新なし）", () => {
    const ng = recordSync(EMPTY_SYNC_STATE, { ok: false }, t0);
    expect(syncHealth(ng, after(1))).toEqual({ state: "stale", lastSuccessAt: null, ageSeconds: null, error: "送信に失敗しました" });
  });
});
