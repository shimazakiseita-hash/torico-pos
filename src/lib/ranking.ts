/** お客さん向けミニゲームのランキング（今日・歴代） */

export const NAME_MAX = 10;
export const RANKING_SIZE = 10;
/** 表示やスタッフの削除に使う、プレイヤーIDの先頭の文字数（IDそのものは出さず、他人の記録を書き換えられないようにする） */
export const TAG_LENGTH = 6;
/** 同じ回線からの登録は、10分に60回まで */
export const SUBMIT_LIMIT = 60;
export const SUBMIT_WINDOW_MS = 10 * 60 * 1000;

/** player はスマホごとに自動で作るID（整理券がなくても登録できる） */
export type RankingEntry = { player: string; name: string; score: number; at: string };

export function playerTag(player: string): string {
  return player.slice(0, TAG_LENGTH);
}

/** 表示名に使わせない言葉（ひらがな・小文字にそろえてから部分一致で見る）。「かす」（かすみ など）のように普通の名前に含まれる語は入れない。最後の砦はスタッフの削除 */
const NG_WORDS = [
  "死ね", "殺す", "殺せ", "馬鹿", "阿呆", "糞",
  "しね", "ころす", "ころせ", "きもい", "うざい", "くず", "ばか", "あほ", "ちんこ", "ちんぽ", "まんこ",
  "うんこ", "せっくす", "えっち", "おっぱい", "れいぷ", "ぶす", "でぶ", "がいじ", "きちがい", "ふぁっく",
  "fuck", "shit", "sex", "porn", "dick", "pussy", "bitch", "nigger",
];

function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 全角英数を半角に、空白をまとめ、制御文字を除く。1〜10文字でなければ null */
export function normalizeName(raw: string): string | null {
  const name = raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX ? name : null;
}

export function containsNgWord(name: string): boolean {
  const key = toHiragana(name.normalize("NFKC").toLowerCase()).replace(/[\s\p{P}\p{S}ー]/gu, "");
  return NG_WORDS.some((w) => key.includes(w));
}

/** ミニゲーム（cloud/public/game/）。ランキングはゲームごとに分ける */
export const GAME_IDS = ["flight"] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_NAMES: Record<GameId, string> = {
  flight: "とりこフライト",
};

/** 実ゲームのボット1,000回で最大46.46点/秒（開始10秒以降）。50×1.5＋100点で余裕を持たせる。
 * 再計測: Node 24で node scripts/flight-simulate.mjs（強化最大・衝突無敵の30分走行も検証）。 */
export const MAX_POINTS_PER_SECOND: Record<GameId, number> = {
  flight: 50,
};

/** 開始から seconds 秒で取りうる点数の上限（測定値を切り上げて1.5倍＋100点の余裕） */
export function maxPlausibleScore(game: GameId, seconds: number): number {
  return Math.round(Math.max(0, seconds) * MAX_POINTS_PER_SECOND[game] * 1.5 + 100);
}

/** 遊んだ時間（サーバーが測ったもの）に対してありえない点数を弾く */
export function isPlausibleScore(game: GameId, score: number, playMs: number): boolean {
  return score >= 0 && playMs >= 0 && score <= maxPlausibleScore(game, playMs / 1000);
}

export type FlightStats = {
  passed: number;
  skewer: number;
  gold: number;
  ufo: number;
  meteor: number;
  bossHit: number;
  bossBomb: number;
  bosses: { lap: number; defeated: boolean }[];
};

export function flightScoreFromStats(stats: FlightStats): number {
  return stats.passed * 10 + stats.skewer * 30 + stats.gold * 100 + stats.ufo * 20
    + stats.meteor * 10 + stats.bossHit * 2 + stats.bossBomb * 10
    + stats.bosses.reduce((sum, b) => sum + (b.defeated ? 150 + 50 * b.lap : 0), 0);
}

export function isPlausibleFlightStats(stats: FlightStats, playMs: number): boolean {
  if (!Number.isFinite(playMs) || playMs < 0) return false;
  const seconds = playMs / 1000;
  // 間隔210px・最高270px/秒。アイテム取得は通過判定より先なので1本分を許す。
  if (stats.passed > seconds * 270 / 210 + 2 || stats.skewer + stats.gold > stats.passed + 1) return false;
  // 金は最大0.05×1.6、UFOは最大0.55。先行出現分と、平均＋8σ＋10の余裕を持たせる。
  const luckyMax = (n: number, p: number) => n * p + 8 * Math.sqrt(n * p * (1 - p)) + 10;
  if (stats.gold > luckyMax(stats.passed + 1, 0.08)
    || stats.ufo > Math.min(stats.passed + 4, luckyMax(stats.passed + 4, 0.55))) return false;
  // 40本ごとにボス。戦闘中の終了も記録し、爆弾の最後の一撃による最大4HPの超過を許す。
  if (stats.bosses.length > Math.floor(stats.passed / 40)) return false;
  if (stats.bosses.some((b, i) => b.lap !== i)) return false;
  const hp = stats.bosses.reduce((sum, b) => sum + 30 + 12 * b.lap + 4, 0);
  if (stats.bossHit + stats.bossBomb * 5 > hp) return false;
  // 小いん石は最短0.66秒、岩ボスは35秒間に最短1.1秒ごと3個。各戦に初回分も加える。
  const rockBosses = stats.bosses.filter((b) => b.lap % 3 === 1).length;
  if (stats.meteor > seconds / (1.1 * 0.6) + 2 + rockBosses * (Math.ceil(35 / 1.1) + 1) * 3) return false;
  return true;
}

/** プレイヤーごとに1件。点数が上がったときだけ記録を更新し、名前はいつでも最新にする */
export function upsertBest(entries: readonly RankingEntry[], entry: RankingEntry): RankingEntry[] {
  const current = entries.find((e) => e.player === entry.player);
  const others = entries.filter((e) => e.player !== entry.player);
  if (!current || entry.score > current.score) return [...others, entry];
  return [...others, { ...current, name: entry.name }];
}

/** 点数の高い順（同点なら先に出した人が上） */
export function sortRanking(entries: readonly RankingEntry[]): RankingEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || Date.parse(a.at) - Date.parse(b.at));
}

/** 日本時間の日付（ランキングは日ごとに分ける） */
export function jstDateKey(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 連続登録の確認：直近の登録時刻（ms）から、今回登録してよいかと、残す時刻を返す */
export function allowSubmission(times: readonly number[], now: number): { ok: boolean; times: number[] } {
  const recent = times.filter((t) => now - t < SUBMIT_WINDOW_MS);
  if (recent.length >= SUBMIT_LIMIT) return { ok: false, times: recent };
  return { ok: true, times: [...recent, now] };
}

/** 日ごとのランキングを古い順に重ねて、歴代（プレイヤーごとの最高点。名前は最後に使ったもの）を作る */
export function mergeBoards(boards: readonly (readonly RankingEntry[])[]): RankingEntry[] {
  return boards.reduce<RankingEntry[]>(
    (all, board) => [...board].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).reduce(upsertBest, all),
    [],
  );
}
