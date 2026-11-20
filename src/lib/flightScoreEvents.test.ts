import { describe, expect, it } from "vitest";
import { createGame } from "../../cloud/public/game/flight.js";
import { flightScoreFromStats } from "./ranking";

function fixture(kind?: string) {
  const game = createGame({ costume: "default" });
  Object.assign(game.state, { flying: true, safe: 1, y: 300, cols: kind ? [{
    x: 100, center: 300, g: 196, amp: 0, phase: 0, seed: 0, scored: false,
    item: { kind, dy: 0, got: false },
  }] : [] });
  return game;
}
function addBoss(game: ReturnType<typeof createGame>, lap = 0) {
  Object.assign(game.state, { stageIndex: lap * 4, boss: {
    type: "ufo", name: "test", x: 250, y: 300, hp: 1, max: 30 + lap * 12, time: 35,
    fire: 2, phase: 0, leaving: 0, hit: 0, charge: 0, nextCharge: 5,
  } });
  Object.assign(game.state.stats, { bosses: [{ lap, defeated: false }] });
}
function expectScore(game: ReturnType<typeof createGame>, score: number) {
  expect(game.score).toBe(score);
  expect(flightScoreFromStats(game.state.stats)).toBe(score);
}

describe("flight.jsの全加点経路", () => {
  it("串・金の串を取った直後と柱の通過後も内訳が一致する", () => {
    for (const [kind, points] of [["skewer", 30], ["gold", 100]] as const) {
      const game = fixture(kind);
      game.update(0);
      expectScore(game, points);
      Object.assign(game.state.cols[0], { x: 50 });
      game.update(0);
      expect(game.state.stats.passed).toBe(1);
      expectScore(game, points + 10);
    }
  });
  it("爆弾は生きたUFO・いん石とボスだけを数え、撃破ボーナスを含む", () => {
    const game = fixture("bomb");
    addBoss(game);
    Object.assign(game.state, {
      ufos: [{ x: 200, y: 100, hp: 1, phase: 0, fire: 1 }, { x: 500, y: 100, hp: 1, phase: 0, fire: 1 }],
      meteors: [{ x: 200, y: 100, hp: 1, vx: 0, vy: 0, rot: 0 }, { x: 200, y: 100, hp: 0, vx: 0, vy: 0, rot: 0 }],
    });
    game.update(0);
    expect(game.state.stats).toMatchObject({ ufo: 1, meteor: 1, bossBomb: 1, bosses: [{ lap: 0, defeated: true }] });
    expectScore(game, 20 + 10 + 10 + 150);
  });
  it("ビームのUFO・いん石への命中を数える", () => {
    const game = fixture();
    Object.assign(game.state, {
      shots: [{ x: 200, y: 100 }, { x: 250, y: 100 }],
      ufos: [{ x: 200, y: 100, hp: 1, phase: 0, fire: 1 }],
      meteors: [{ x: 250, y: 100, hp: 1, vx: 0, vy: 0, rot: 0 }],
    });
    game.update(0);
    expect(game.state.stats).toMatchObject({ ufo: 1, meteor: 1 });
    expectScore(game, 30);
  });
  it("ボスへの命中と周回別の撃破ボーナスを数える", () => {
    for (const lap of [0, 1, 2, 20]) {
      const game = fixture();
      addBoss(game, lap);
      Object.assign(game.state, { shots: [{ x: 250, y: 300 }] });
      game.update(0);
      expect(game.state.stats).toMatchObject({ bossHit: 1, bosses: [{ lap, defeated: true }] });
      expectScore(game, 2 + 150 + 50 * lap);
    }
  });
  it("40本目で戦闘中のボスを記録し、時間切れにはボーナスを付けない", () => {
    const game = fixture("shield");
    Object.assign(game.state, { passed: 39, sinceStage: 9, stageIndex: 3 });
    Object.assign(game.state.cols[0], { x: 50 });
    game.update(0);
    expect(game.state.stats.bosses).toEqual([{ lap: 0, defeated: false }]);
    Object.assign(game.state.boss ?? {}, { time: 0 });
    game.update(0);
    expectScore(game, 10);
    expect(game.state.boss).toMatchObject({ leaving: 1.2 });
    expect(game.state.stats.bosses).toEqual([{ lap: 0, defeated: false }]);
  });
});
