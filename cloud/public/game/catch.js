// 流れ星キャッチ：60秒のあいだ、流れ星のように降ってくる串を、マスコットを左右に動かして受け止める
//
// 点数（src/lib/ranking.ts の MAX_POINTS_PER_SECOND.catch の根拠）
//   串 10点・金の串 50点 に、コンボ倍率（10個ごとに +1、最大×5）をかける。焦げ・隕石は 3秒へってコンボが切れる
//   降ってくる数は最大で1秒に3個、そのうち よいもの（串・金・時計）は多くて85%、金は全体の5%
//   → 1秒あたり最大 3 ×（0.8×10 ＋ 0.05×50）× 5 ≒ 158点（上限は余裕をみて200）

import { COLORS, FONT, H, Popups, W, drawHud, drawMascot, drawSkewer, drawSpace, drawTrail, view } from "./common.js";

export const META = {
  id: "catch",
  title: "流れ星キャッチ",
  howto: "ゆびで マスコットを 左右に うごかして、ふってくる 串を キャッチ！ 10こ れんぞくで 点数アップ。こげた串と いん石は よけてね",
  pointRate: 0.12,
};

const TIME = 60;
const MASCOT_Y = 560;
const MASCOT_R = 30;

export function createGame({ costume }) {
  const pop = new Popups();
  const state = {
    score: 0,
    left: TIME,
    elapsed: 0,
    combo: 0,
    best: 0,
    x: W / 2,
    target: W / 2,
    items: [],
    spawn: 0.6,
    over: false,
    t: 0,
    hurt: 0,
  };

  const mult = () => Math.min(5, 1 + Math.floor(state.combo / 10));

  function spawn() {
    const p = Math.min(1, state.elapsed / TIME);
    const r = Math.random();
    const bad = 0.12 + 0.15 * p;
    let kind;
    if (r < 0.05) kind = "gold";
    else if (r < 0.08) kind = "clock";
    else if (r < 0.08 + bad) kind = Math.random() < 0.5 ? "burnt" : "meteor";
    else kind = Math.random() < 0.5 ? "tare" : "shio";
    const x = 30 + Math.random() * (W - 60);
    const vy = 170 + 180 * p + Math.random() * 40;
    state.items.push({ kind, x, y: -30, vx: (Math.random() - 0.5) * 90, vy, rot: Math.random() * Math.PI });
  }

  function good(kind) {
    return kind === "tare" || kind === "shio" || kind === "gold" || kind === "clock";
  }

  function caught(it) {
    if (!good(it.kind)) {
      state.left = Math.max(0, state.left - 3);
      state.combo = 0;
      state.hurt = 0.5;
      pop.add(it.kind === "meteor" ? "いん石！ -3秒" : "あちっ！ -3秒", it.x, MASCOT_Y - 60, COLORS.danger, 22);
      return;
    }
    state.combo++;
    state.best = Math.max(state.best, state.combo);
    if (it.kind === "clock") {
      state.left += 5;
      pop.add("+5秒", it.x, MASCOT_Y - 60, COLORS.cyan, 24);
      return;
    }
    const m = mult();
    const gain = (it.kind === "gold" ? 50 : 10) * m;
    state.score += gain;
    pop.add(`+${gain}`, it.x, MASCOT_Y - 56, it.kind === "gold" ? COLORS.beak : "#fff", it.kind === "gold" ? 26 : 20);
    if (state.combo % 10 === 0 && m < 5) pop.add(`×${m + 1}！`, W / 2, 260, COLORS.cyan, 34);
  }

  return {
    state,
    get score() {
      return state.score;
    },
    get over() {
      return state.over;
    },
    pointer(type, x) {
      if (type === "down" || type === "move") state.target = Math.max(MASCOT_R, Math.min(W - MASCOT_R, x));
    },
    update(dt) {
      state.t += dt;
      pop.update(dt);
      state.hurt = Math.max(0, state.hurt - dt);
      if (state.over) return;
      state.elapsed += dt;
      state.left -= dt;
      if (state.left <= 0) {
        state.left = 0;
        state.over = true;
        pop.add("おしまい！", W / 2, 300, "#fff", 36);
        return;
      }
      // マスコットは指に追いつくように動く（速すぎず、遅すぎず）
      state.x += (state.target - state.x) * Math.min(1, dt * 14);

      state.spawn -= dt;
      if (state.spawn <= 0) {
        spawn();
        const p = Math.min(1, state.elapsed / TIME);
        state.spawn = 0.8 - 0.47 * p; // 1秒に1.25個 → 3個
      }
      for (const it of state.items) {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += dt * 2;
        if (it.x < 20 || it.x > W - 20) it.vx = -it.vx;
        if (!it.done && Math.hypot(it.x - state.x, it.y - MASCOT_Y) < MASCOT_R + 18) {
          it.done = true;
          caught(it);
        } else if (!it.done && it.y > H + 30) {
          it.done = true;
          // よいものを取りこぼすとコンボが切れる
          if (good(it.kind) && it.kind !== "clock") state.combo = 0;
        }
      }
      state.items = state.items.filter((it) => !it.done);
    },
    draw(ctx) {
      drawSpace(ctx, state.t);
      for (const it of state.items) {
        drawTrail(ctx, it.x, it.y, it.vx, it.vy, it.kind === "meteor" ? "rgba(255,140,80,0.6)" : it.kind === "gold" ? "rgba(255,216,74,0.7)" : "rgba(255,255,255,0.5)", 70);
        if (it.kind === "meteor") drawMeteor(ctx, it.x, it.y, it.rot);
        else if (it.kind === "clock") drawClock(ctx, it.x, it.y);
        else drawSkewer(ctx, it.x, it.y, Math.atan2(it.vy, it.vx) - Math.PI, it.kind === "gold" ? ["gold", "gold", "gold"] : it.kind === "burnt" ? ["burnt", "burnt", "burnt"] : [it.kind, it.kind === "tare" ? "negi" : it.kind, it.kind], 0.9);
      }
      // 地面のかわりの光の帯
      ctx.fillStyle = "rgba(128,247,253,0.12)";
      ctx.fillRect(view.x0, MASCOT_Y + MASCOT_R + 8, view.x1 - view.x0, 6);
      ctx.save();
      if (state.hurt > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(state.t * 40);
      drawMascot(ctx, state.x, MASCOT_Y, MASCOT_R, costume, { t: state.t, tilt: (state.target - state.x) * 0.004 });
      ctx.restore();
      pop.draw(ctx);
      drawHud(ctx, `${state.score.toLocaleString()}点`, `のこり ${Math.ceil(state.left)}秒`);
      ctx.font = `900 18px ${FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = mult() > 1 ? COLORS.beak : "rgba(255,255,255,0.8)";
      ctx.fillText(`コンボ ${state.combo}　×${mult()}`, 14, 46);
      if (state.t < 2.5 && !state.over) {
        ctx.font = `900 20px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText("← ゆびで うごかす →", W / 2, MASCOT_Y + 50);
      }
    },
  };
}

function drawMeteor(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#6d6577";
  ctx.strokeStyle = "#3b3445";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 15 + (i % 2 ? 3 : -1);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#4f4759";
  ctx.beginPath();
  ctx.arc(-4, -3, 4, 0, Math.PI * 2);
  ctx.arc(5, 5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClock(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -8);
  ctx.moveTo(0, 0);
  ctx.lineTo(6, 3);
  ctx.stroke();
  ctx.restore();
}
