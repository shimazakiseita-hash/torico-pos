import { describe, expect, it } from "vitest";
import {
  SUBMIT_LIMIT,
  SUBMIT_WINDOW_MS,
  allowSubmission,
  containsNgWord,
  isPlausibleScore,
  jstDateKey,
  maxPlausibleScore,
  mergeBoards,
  normalizeName,
  playerTag,
  sortRanking,
  upsertBest,
  type RankingEntry,
} from "./ranking";
import { rankingSubmitSchema, siteConfigSchema } from "./schemas";

const entry = (player: string, score: number, name = `${player}さん`, at = "2026-11-21T03:00:00.000Z"): RankingEntry => ({
  player,
  name,
  score,
  at,
});

describe("normalizeName", () => {
  it("全角英数を半角に、前後の空白を除き、空白をまとめる", () => {
    expect(normalizeName("  ＴＡＩ　ｙａｋｉ  ")).toBe("TAI yaki");
  });

  it("1〜10文字だけ受け付ける（絵文字も1文字）", () => {
    expect(normalizeName("やきとりだいすきくん")).toBe("やきとりだいすきくん");
    expect(normalizeName("やきとりだいすきくんだ")).toBeNull();
    expect(normalizeName("🐟🐟")).toBe("🐟🐟");
    expect(normalizeName("   ")).toBeNull();
  });
});

describe("containsNgWord", () => {
  it("カタカナ・全角・記号はさみでも見つける", () => {
    expect(containsNgWord("シネ")).toBe(true);
    expect(containsNgWord("ｆｕｃｋ")).toBe(true);
    expect(containsNgWord("ば.か")).toBe(true);
  });

  it("ふつうの名前は通す", () => {
    expect(containsNgWord("やきとり名人")).toBe(false);
    expect(containsNgWord("Seita")).toBe(false);
    expect(containsNgWord("カステラ大好き")).toBe(false);
    expect(containsNgWord("skill")).toBe(false);
  });
});

describe("maxPlausibleScore / isPlausibleScore", () => {
  it("遊んだ時間に比例して上限が上がる（ゲームごとに傾きが違う）", () => {
    expect(maxPlausibleScore("tsumi", 0)).toBe(100);
    expect(maxPlausibleScore("catch", 60)).toBe(60 * 800 * 1.5 + 100);
    expect(maxPlausibleScore("tsumi", 60)).toBeLessThan(maxPlausibleScore("catch", 60));
  });

  it("時間に見合わない点数・マイナスの点数は通らない", () => {
    expect(isPlausibleScore("catch", 5000, 60_000)).toBe(true);
    expect(isPlausibleScore("flight", 10000, 30_000)).toBe(false);
    expect(isPlausibleScore("tsumi", 1200, 3_000)).toBe(false);
    expect(isPlausibleScore("tsumi", -1, 30_000)).toBe(false);
  });
});

describe("upsertBest / sortRanking", () => {
  it("プレイヤーごとに最高点だけ残し、名前は最新にする", () => {
    let board = upsertBest([], entry("aaaa1111", 20, "あ"));
    board = upsertBest(board, entry("aaaa1111", 10, "い"));
    expect(board).toEqual([entry("aaaa1111", 20, "い")]);
    board = upsertBest(board, entry("aaaa1111", 30, "う", "2026-11-21T04:00:00.000Z"));
    expect(board).toEqual([entry("aaaa1111", 30, "う", "2026-11-21T04:00:00.000Z")]);
    expect(upsertBest(board, entry("bbbb2222", 5))).toHaveLength(2);
  });

  it("点数の高い順、同点なら先に出した人が上", () => {
    const board = [entry("p1", 10, "a", "2026-11-21T03:02:00.000Z"), entry("p2", 30), entry("p3", 10, "c", "2026-11-21T03:01:00.000Z")];
    expect(sortRanking(board).map((e) => e.player)).toEqual(["p2", "p3", "p1"]);
  });

  it("表示用のIDは先頭6文字だけ", () => {
    expect(playerTag("abcdef123456")).toBe("abcdef");
  });
});

describe("jstDateKey", () => {
  it("日本時間で日付が変わる", () => {
    expect(jstDateKey(new Date("2026-11-21T14:59:00.000Z"))).toBe("2026-11-21");
    expect(jstDateKey(new Date("2026-11-21T15:00:00.000Z"))).toBe("2026-11-22");
  });
});

describe("rankingSubmitSchema", () => {
  it("ゲーム・プレイヤーID・名前・点数・合言葉を受け付ける（遊んだ時間は受け取らない）", () => {
    const ok = { game: "catch", player: "a1b2c3d4e5f6", name: "とりこ", score: 5, session: "0123456789abcdef.1790000000000.sig" };
    expect(rankingSubmitSchema.safeParse(ok).success).toBe(true);
    expect(rankingSubmitSchema.safeParse({ ...ok, game: "puzzle" }).success).toBe(false);
    expect(rankingSubmitSchema.safeParse({ ...ok, player: "short" }).success).toBe(false);
    expect(rankingSubmitSchema.safeParse({ ...ok, player: "ABCDEF123456" }).success).toBe(false);
    expect(rankingSubmitSchema.safeParse({ ...ok, name: "x".repeat(41) }).success).toBe(false);
    expect(rankingSubmitSchema.safeParse({ game: "catch", player: "a1b2c3d4e5f6", name: "とりこ", score: 5, playMs: 20000 }).success).toBe(false);
  });
});

describe("allowSubmission", () => {
  it("10分に20回までは通し、それを超えると断る。古い登録は数えない", () => {
    const now = 1_000_000_000;
    const full = Array.from({ length: SUBMIT_LIMIT }, (_, i) => now - i * 1000);
    expect(allowSubmission(full.slice(1), now).ok).toBe(true);
    expect(allowSubmission(full, now).ok).toBe(false);
    const old = full.map((t) => t - SUBMIT_WINDOW_MS);
    const r = allowSubmission(old, now);
    expect(r).toEqual({ ok: true, times: [now] });
  });
});

describe("mergeBoards", () => {
  it("日ごとのランキングを重ねて、プレイヤーごとの最高点（名前は最後に使ったもの）にする", () => {
    const day1 = [entry("aaaa1111", 149, "とりこ", "2026-11-21T05:00:00.000Z"), entry("bbbb2222", 30, "たろう", "2026-11-21T06:00:00.000Z")];
    const day2 = [entry("aaaa1111", 80, "とりこ2", "2026-11-22T05:00:00.000Z"), entry("cccc3333", 60, "はなこ", "2026-11-22T06:00:00.000Z")];
    const all = mergeBoards([day1, day2]);
    expect(all).toHaveLength(3);
    expect(all.find((e) => e.player === "aaaa1111")).toEqual({ player: "aaaa1111", name: "とりこ2", score: 149, at: "2026-11-21T05:00:00.000Z" });
    expect(sortRanking(all).map((e) => e.score)).toEqual([149, 60, 30]);
  });
});

describe("siteConfigSchema", () => {
  it("営業終了のオン／オフ", () => {
    expect(siteConfigSchema.safeParse({ closed: true }).success).toBe(true);
    expect(siteConfigSchema.safeParse({ closed: false }).success).toBe(true);
    expect(siteConfigSchema.safeParse({ closed: "yes" }).success).toBe(false);
  });
});

