// とりこフライト：タップで はばたいて、いん石の すきまを ぬける。串を あつめて、ぶつかったら おしまい
//
// 点数（src/lib/ranking.ts の MAX_POINTS_PER_SECOND.flight の根拠）
//   すきまを1つぬける 10点、串 30点（1つのすきまに多くて1本）、10こごとに 50点
//   すきまの間隔 210px、速さは最大 260px/秒 → 1つに最低0.81秒 → 最大 (10+30+5)/0.81 ≒ 56点/秒（上限は余裕をみて60）

import { COLORS, FONT, H, Popups, W, drawHud, drawMascot, drawSkewer, drawSpace, view } from "./common.js";

export const META = {
  id: "flight",
  title: "とりこフライト",
  howto: "タップで はばたいて、いん石の すきまを ぬけよう。串も あつめてね。ぶつかったら おしまい！",
  pointRate: 0.4,
};

const X = 100;
const R = 20; // 当たり判定（絵は少し大きい）
const GRAVITY = 1500;
const FLAP = -430;
const COL_W = 58;
const SPACING = 210;
const FLOOR = H - 24;

export function createGame({ costume }) {
  const pop = new Popups();
  const state = {
    score: 0,
    y: H * 0.42,
    vy: 0,
    flying: false, // 最初のタップまでは浮いて待つ
    cols: [],
    passed: 0,
    speed: 150,
    nextIn: 1.1,
    over: false,
    t: 0,
    scroll: 0,
    flap: 0,
  };

  function gap() {
    return Math.max(132, 196 - state.passed * 2.5);
  }

  function addColumn() {
    const g = gap();
    const top = 90 + Math.random() * (FLOOR - 90 - g - 60);
    state.cols.push({ x: W + COL_W, top, bottom: top + g, scored: false, skewer: Math.random() < 0.6 ? { y: top + g * (0.3 + Math.random() * 0.4), got: false } : null, seed: Math.random() * 10 });
  }

  function crash() {
    state.over = true;
    pop.add("ごつん！", X, state.y - 40, COLORS.danger, 30);
  }

  return {
    state,
    get score() {
      return state.score;
    },
    get over() {
      return state.over;
    },
    pointer(type) {
      if (type !== "down" || state.over) return;
      state.flying = true;
      state.vy = FLAP;
      state.flap = 0.18;
    },
    update(dt) {
      state.t += dt;
      pop.update(dt);
      state.flap = Math.max(0, state.flap - dt);
      if (state.over) {
        // ぶつかったあとは落ちていく
        state.vy += GRAVITY * dt;
        state.y = Math.min(FLOOR, state.y + state.vy * dt);
        return;
      }
      if (!state.flying) {
        state.y = H * 0.42 + Math.sin(state.t * 3) * 8;
        return;
      }
      state.vy = Math.min(700, state.vy + GRAVITY * dt);
      state.y += state.vy * dt;
      if (state.y < R) {
        state.y = R;
        state.vy = 0;
      }
      if (state.y > FLOOR - R) {
        state.y = FLOOR - R;
        crash();
        return;
      }

      state.speed = Math.min(260, 150 + state.passed * 2);
      const dx = state.speed * dt;
      state.scroll += dx;
      state.nextIn -= dx / SPACING;
      if (state.nextIn <= 0) {
        addColumn();
        state.nextIn += 1;
      }
      for (const c of state.cols) {
        c.x -= dx;
        // すきまの外の いん石（上の柱・下の柱）に当たったか
        if (hits(X, state.y, R, c.x - COL_W / 2, -1e4, c.x + COL_W / 2, c.top) || hits(X, state.y, R, c.x - COL_W / 2, c.bottom, c.x + COL_W / 2, 1e4)) {
          crash();
          return;
        }
        if (c.skewer && !c.skewer.got && Math.hypot(X - c.x, state.y - c.skewer.y) < R + 16) {
          c.skewer.got = true;
          state.score += 30;
          pop.add("+30", c.x, c.skewer.y - 24, COLORS.beak, 22);
        }
        if (!c.scored && c.x + COL_W / 2 < X - R) {
          c.scored = true;
          state.passed++;
          state.score += 10;
          if (state.passed % 10 === 0) {
            state.score += 50;
            pop.add(`${state.passed}こ とっぱ！ +50`, W / 2, 140, COLORS.cyan, 26);
          }
        }
      }
      state.cols = state.cols.filter((c) => c.x > -COL_W);
    },
    draw(ctx) {
      drawSpace(ctx, state.t, state.scroll);
      for (const c of state.cols) {
        drawRocks(ctx, c.x, view.y0 - 10, c.top, c.seed);
        drawRocks(ctx, c.x, c.bottom, view.y1 + 10, c.seed + 3);
        if (c.skewer && !c.skewer.got) drawSkewer(ctx, c.x, c.skewer.y + Math.sin(state.t * 4 + c.seed) * 4, -Math.PI / 2, ["tare", "negi", "tare"], 0.85);
      }
      // 地面（光の帯）
      ctx.fillStyle = "rgba(128,247,253,0.18)";
      ctx.fillRect(view.x0, FLOOR, view.x1 - view.x0, 4);
      const tilt = state.flying ? Math.max(-0.5, Math.min(0.9, state.vy / 700)) : 0;
      drawMascot(ctx, X, state.y, R + 4, costume, { t: state.t, tilt });
      // はばたいた瞬間の羽の光
      if (state.flap > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${state.flap * 4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(X - 6, state.y + 4, R + 12, Math.PI * 0.6, Math.PI * 1.1);
        ctx.stroke();
      }
      pop.draw(ctx);
      drawHud(ctx, `${state.score.toLocaleString()}点`, `${state.passed}こ`);
      if (!state.flying && !state.over) {
        ctx.font = `900 24px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = COLORS.space900;
        ctx.fillStyle = "#fff";
        ctx.strokeText("タップで はばたく", W / 2, H * 0.62);
        ctx.fillText("タップで はばたく", W / 2, H * 0.62);
      }
    },
  };
}

/** 円（cx, cy, r）と長方形（x0, y0, x1, y1）が重なっているか */
function hits(cx, cy, r, x0, y0, x1, y1) {
  const nx = Math.max(x0, Math.min(cx, x1));
  const ny = Math.max(y0, Math.min(cy, y1));
  return Math.hypot(cx - nx, cy - ny) < r;
}

/** いん石を積んだ柱（x は中心、y0〜y1 の範囲） */
function drawRocks(ctx, x, y0, y1, seed) {
  if (y1 - y0 < 4) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - COL_W / 2 - 6, y0, COL_W + 12, y1 - y0);
  ctx.clip();
  const g = ctx.createLinearGradient(x - COL_W / 2, 0, x + COL_W / 2, 0);
  g.addColorStop(0, "#5d5470");
  g.addColorStop(1, "#7c7290");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#3b3445";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - COL_W / 2, y0, COL_W, y1 - y0, 14);
  ctx.fill();
  ctx.stroke();
  // くぼみ
  ctx.fillStyle = "rgba(42,31,92,0.35)";
  for (let yy = y0 + 18; yy < y1 - 8; yy += 34) {
    const k = Math.sin(yy * 0.13 + seed) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x - 12 + k * 24, yy, 5 + k * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // すきま側のふち（光る）
  ctx.strokeStyle = "rgba(255,140,80,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (y0 < 0) {
    ctx.moveTo(x - COL_W / 2 + 4, y1);
    ctx.lineTo(x + COL_W / 2 - 4, y1);
  } else {
    ctx.moveTo(x - COL_W / 2 + 4, y0);
    ctx.lineTo(x + COL_W / 2 - 4, y0);
  }
  ctx.stroke();
}
