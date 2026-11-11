// やきとりポイントの使いみち：ショップ（ゲームの強化）と ガチャ（きせかえ）
// ポイントはゲームで ためて、ここで つかう（記録はこのスマホだけ。お金はかからない）

import { COSTUMES } from "./common.js";

export const GACHA_COST = 100;
/** かぶったときに もどるポイント */
export const GACHA_REFUND = 30;
/** レアの出やすさ（★1 70%・★2 25%・★3 5%） */
const RARITY_WEIGHTS = [
  [1, 0.7],
  [2, 0.25],
  [3, 0.05],
];

/** 強化：costs は レベルごとの値段（長さ＝最大レベル） */
export const UPGRADES = [
  { id: "flightShield", game: "flight", name: "スタートバリア", desc: "バリアを もって スタート", costs: [250] },
  { id: "flightGun", game: "flight", name: "たれビーム 長もち", desc: "たれビームが 2秒ずつ 長くなる", costs: [150, 300] },
  { id: "flightLuck", game: "flight", name: "アイテム運", desc: "アイテムが 出やすくなる", costs: [200, 400] },
  { id: "tsumiPass", game: "tsumi", name: "パス +1", desc: "1本ごとの パスが ふえる", costs: [150, 300] },
  { id: "tsumiLife", game: "tsumi", name: "ハート +1", desc: "はずしても いい回数が ふえる", costs: [400] },
  { id: "tsumiSlow", game: "tsumi", name: "ゆっくりスタート", desc: "さいしょの 5こが ゆっくり ゆれる", costs: [150] },
];

export function level(save, id) {
  return save.upgrades[id] ?? 0;
}

/** 次のレベルの値段。最大なら null */
export function nextCost(save, id) {
  const u = UPGRADES.find((x) => x.id === id);
  return u.costs[level(save, id)] ?? null;
}

export function buy(save, id) {
  const cost = nextCost(save, id);
  if (cost === null || save.points < cost) return false;
  save.points -= cost;
  save.upgrades[id] = level(save, id) + 1;
  return true;
}

/** ガチャを1回まわす。rng は 0〜1 を返す関数 */
export function pull(save, rng = Math.random) {
  if (save.points < GACHA_COST) return null;
  save.points -= GACHA_COST;
  const r = rng();
  let acc = 0;
  let rarity = 1;
  for (const [k, w] of RARITY_WEIGHTS) {
    acc += w;
    if (r < acc) {
      rarity = k;
      break;
    }
  }
  const pool = COSTUMES.filter((c) => c.rarity === rarity);
  const costume = pool[Math.floor(rng() * pool.length) % pool.length];
  const dup = save.owned.includes(costume.id);
  if (dup) save.points += GACHA_REFUND;
  else save.owned.push(costume.id);
  return { costume, dup };
}
