import { describe, expect, it, vi, afterEach } from "vitest";
import { createSession, SESSION_TTL_MS } from "./session";
import { runFlightBot } from "../../scripts/flight-simulate.mjs";
import { flightScoreFromStats } from "./ranking";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const { default: worker } = await vi.importActual<{
  default: { fetch: (request: Request, env: unknown) => Promise<Response> };
}>("../../cloud/src/index");

const stats = { passed: 40, skewer: 20, gold: 4, ufo: 8, meteor: 10, bossHit: 30, bossBomb: 0,
  bosses: [{ lap: 0, defeated: true }] };
const secret = "shot-secret";
const now = 1_790_000_000_000;
const submit = vi.fn(async () => ({ ok: true, rank: 1, allRank: 1, top: [] }));
const env = { SESSION_SECRET: secret, STATUS: { idFromName: () => "main", get: () => ({ submit }) } };

async function request(body: object) {
  return worker.fetch(new Request("http://localhost/api/ranking", { method: "POST", body: JSON.stringify(body) }), env);
}
async function body(age = 90_000) {
  return { game: "flight", player: "abcdef123456", name: "とりこ", stats, score: flightScoreFromStats(stats),
    session: await createSession(secret, now - age, "0123456789abcdef") };
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("フライト登録API", () => {
  it("正規の点数と内訳を登録し、セッションIDを保存側に渡す", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const res = await request(await body());
    expect(res.status).toBe(200);
    expect(submit).toHaveBeenCalledWith("flight", expect.objectContaining({ score: flightScoreFromStats(stats) }), "local", "0123456789abcdef");
  });
  it("待っただけの巨大な点数・偽の内訳・点数不一致は保存しない", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const original = await body(25 * 60_000);
    for (const invalid of [
      { ...original, score: 1000000 },
      { ...original, stats: { ...stats, passed: 2200 }, score: flightScoreFromStats({ ...stats, passed: 2200 }) },
      { ...original, stats: { ...stats, passed: 400, gold: 350 }, score: flightScoreFromStats({ ...stats, passed: 400, gold: 350 }) },
      { ...original, score: original.score + 1 },
    ]) expect((await request(invalid)).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });
  it("古いページには再読み込みを案内する", async () => {
    const old = { ...await body(), stats: undefined };
    const res = await request(old);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ページを よみこみなおして もういちど あそんでね" });
    expect(submit).not.toHaveBeenCalled();
  });
  it("30分超の期限切れメッセージを維持する", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const res = await request(await body(SESSION_TTL_MS + 1));
    expect(await res.json()).toEqual({ error: "じかんが たちすぎたよ。もういっかい あそんでね" });
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("実ゲームの自動操縦", () => {
  it("通常・強化最大の各50回で毎フレームの点数と内訳と時間上限が一致する", () => {
    for (let seed = 1; seed <= 50; seed++) {
      runFlightBot({ seed });
      runFlightBot({ seed, up: { flightShield: 1, flightGun: 2, flightLuck: 2 } });
    }
  });
  it("強化最大で30分、異なるフレーム間隔でも誤って弾かない（衝突無敵）", () => {
    for (const dt of [1 / 20, 1 / 60, 1 / 120]) {
      const result = runFlightBot({ dt, endurance: true, up: { flightShield: 1, flightGun: 2, flightLuck: 2 } });
      expect(result.seconds).toBeCloseTo(1800, 1);
      expect(result.stats.bosses.length).toBeGreaterThan(10);
    }
  }, 20000);
});
