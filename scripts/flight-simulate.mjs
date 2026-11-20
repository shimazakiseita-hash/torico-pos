import { pathToFileURL } from "node:url";
import { createGame } from "../cloud/public/game/flight.js";
import { flightScoreFromStats, isPlausibleFlightStats, isPlausibleScore } from "../src/lib/ranking.ts";

export function steerFlight(game) {
  const s = game.state;
  const speed = s.boss ? 120 : Math.min(270, 150 + s.passed * 1.6);
  const c = s.cols.find((c) => c.x > 50);
  let target = 280;
  if (c) {
    const ahead = Math.max(0, (c.x - 100) / speed);
    const mid = c.center + Math.sin((s.t + ahead) * 1.6 + c.phase) * c.amp;
    target = mid + (c.item && !c.item.got ? c.item.dy * 0.8 : 0);
    // 柱の手前ではアイテムを狙い、通過中は現在のすきまから外れない。
    if (c.x < 155) {
      const now = c.center + Math.sin(s.t * 1.6 + c.phase) * c.amp;
      target = Math.max(now - c.g / 2 + 42, Math.min(now + c.g / 2 - 26, target));
    }
  } else if (s.boss && !s.boss.leaving) {
    const b = s.boss;
    const travel = Math.max(0, (b.x - 120) / 520);
    const lap = Math.floor(s.stageIndex / 4);
    target = b.type === "ufo" ? 368 + Math.sin(b.phase + travel * (1.3 + lap * 0.2)) * 178
      : b.type === "hole" ? 368 + Math.sin((b.phase + travel) * 0.6) * 89
      : 368 + Math.sin((b.phase + travel) * 0.9) * 178 * 0.65;
  }
  for (const b of [...s.beams, ...s.meteors, ...s.ufos]) {
    if (b.x > 70 && b.x < 160 && Math.abs(b.y - target) < 45) target = b.y > s.y ? b.y - 65 : b.y + 65;
  }
  target = Math.max(95, Math.min(530, target));
  if (!s.flying || (s.vy > -30 && s.y > target + 24)) game.pointer("down");
}

export function runFlightBot({ seed = 1, seconds = 1800, up = {}, endurance = false, factory = createGame, check = true, dt = 1 / 60 } = {}) {
  const random = Math.random;
  let n = seed >>> 0;
  Math.random = () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
  try {
    const game = factory({ costume: "default", up });
    let maxRate = 0;
    let frames = 0;
    for (; frames < seconds / dt && !game.over; frames++) {
      // 長時間の検証だけ衝突無敵にする。生成・移動・加点・操作は本物のまま。
      if (endurance) game.state.safe = 1;
      steerFlight(game);
      game.update(dt);
      const s = game.state;
      if (check && (flightScoreFromStats(s.stats) !== game.score
        || !isPlausibleFlightStats(s.stats, s.t * 1000)
        || !isPlausibleScore("flight", game.score, s.t * 1000))) {
        throw new Error(JSON.stringify({ seed, endurance, time: s.t, score: game.score, stats: s.stats }));
      }
      if (s.t >= 10) maxRate = Math.max(maxRate, game.score / s.t);
    }
    return { seed, seconds: game.state.t, score: game.score, maxRate, over: game.over, stats: game.state.stats, frames };
  } finally {
    Math.random = random;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [name, up, endurance, runs, seconds] of [
    ["通常", {}, false, 500, 1800],
    ["強化最大", { flightShield: 1, flightGun: 2, flightLuck: 2 }, false, 500, 1800],
    ["長時間・強化最大・衝突無敵", { flightShield: 1, flightGun: 2, flightLuck: 2 }, true, 20, 1800],
  ]) {
    const results = Array.from({ length: runs }, (_, i) => runFlightBot({ seed: i + 1, up, endurance, seconds }));
    console.log(JSON.stringify({ name, runs, maxRate: Math.max(...results.map((r) => r.maxRate)),
      longestSeconds: Math.max(...results.map((r) => r.seconds)), maxScore: Math.max(...results.map((r) => r.score)),
      completed: results.filter((r) => !r.over).length, rejected: 0 }));
  }
}
