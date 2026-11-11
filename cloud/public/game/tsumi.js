// つみつみ串：左右にゆれる具をタップで落として、串にまっすぐ刺していく。5個で1本。3回はずすと終わり
//
// 点数（src/lib/ranking.ts の MAX_POINTS_PER_SECOND.tsumi の根拠）
//   1個：ぴったり 20＋連続ぴったり 5×最大5 ／ まんなか寄り 10 ／ はし 5 → 1個あたり最大 45
//   1本できた：30、全部同じ具 50、ねぎま（もも・ねぎ交互）80 → 1個あたり最大 (30+80)/5 = 22
//   いちばん短い落下（5個目）が約0.49秒＋次が出るまで0.25秒 → 1個に最低0.74秒 → 最大 (45+22)/0.74 ≒ 91点/秒（上限は余裕をみて140）

import { COLORS, FONT, H, Popups, W, drawHearts, drawHud, drawMascot, drawSpace } from "./common.js";

export const META = {
  id: "tsumi",
  title: "つみつみ串",
  howto: "ゆれる具を タップで落として、串に まっすぐ さそう。5個で1本！ もも・ねぎを こうごに つむと「ねぎま」ボーナス",
  pointRate: 0.5, // やきとりポイント＝点数×これ
};

const STICK_X = W / 2;
const BASE_Y = 590; // いちばん下の具の下端
const PIECE_H = 34;
const SWING_Y = 150;
const PER_SKEWER = 5;
const GRAVITY = 2400;
const KINDS = {
  momo: { name: "もも", fill: "#c8763f", edge: "#8a4a1d", text: "#fff" },
  negi: { name: "ねぎ", fill: "#a4dd7c", edge: "#5a9a3a", text: "#2f5a1d" },
  tsukune: { name: "つくね", fill: "#7a3f1c", edge: "#4a230b", text: "#fff" },
};
const KIND_IDS = Object.keys(KINDS);

export function createGame({ costume }) {
  const pop = new Popups();
  const state = {
    score: 0,
    lives: 3,
    combo: 0,
    skewers: 0,
    placed: [], // { kind, off }
    current: null, // ゆれている具
    falling: null, // 落ちている具
    dropped: [], // はずれて落ちていく具
    next: randomKind(),
    wait: 0.4, // 次の具が出るまでの時間
    finishing: 0, // 1本できたときの、串が横にはけるアニメ
    over: false,
    t: 0,
    shake: 0,
  };

  function randomKind() {
    return KIND_IDS[Math.floor(Math.random() * KIND_IDS.length)];
  }

  function width() {
    return Math.max(36, 72 - state.skewers * 3);
  }

  function spawn() {
    const n = state.skewers * PER_SKEWER + state.placed.length;
    state.current = {
      kind: state.next,
      phase: Math.random() * Math.PI * 2,
      speed: Math.min(6.2, 2.2 + n * 0.09),
      // 本数が進むと、ゆれ方が不規則になる
      wobble: state.skewers >= 3 ? 0.35 : 0,
      w: width(),
      x: STICK_X,
    };
    state.next = randomKind();
  }

  function landY(index) {
    return BASE_Y - index * PIECE_H - PIECE_H / 2;
  }

  function finishSkewer() {
    const kinds = state.placed.map((p) => p.kind);
    let bonus = 30;
    let label = "1本できた！";
    const negima = kinds.every((k, i) => k === (i % 2 ? kinds[1] : kinds[0])) && new Set(kinds).size === 2 && kinds.includes("momo") && kinds.includes("negi");
    if (negima) {
      bonus += 80;
      label = "ねぎま！ +110";
    } else if (new Set(kinds).size === 1) {
      bonus += 50;
      label = `ぜんぶ${KINDS[kinds[0]].name}！ +80`;
    }
    state.score += bonus;
    state.skewers++;
    pop.add(label, W / 2, 300, COLORS.cyan, 28);
    state.finishing = 0.7;
  }

  function land(f) {
    const off = f.x - STICK_X;
    const a = Math.abs(off);
    if (a > f.w / 2 - 4) {
      // 串に刺さらない
      state.dropped.push({ ...f, vx: off > 0 ? 120 : -120, vr: off > 0 ? 6 : -6, r: 0 });
      state.lives--;
      state.combo = 0;
      state.shake = 0.3;
      pop.add(state.lives > 0 ? "おっと！" : "おしまい", W / 2, 260, COLORS.danger, 30);
      if (state.lives <= 0) state.over = true;
      state.wait = 0.35;
      return;
    }
    let gain;
    if (a <= 5) {
      gain = 20 + 5 * Math.min(state.combo, 5);
      state.combo++;
      pop.add(state.combo > 1 ? `ぴったり×${state.combo}` : "ぴったり！", STICK_X, f.y - 36, COLORS.beak, 24);
    } else if (a <= f.w * 0.25) {
      gain = 10;
      state.combo = 0;
      pop.add("+10", STICK_X, f.y - 30, "#fff", 20);
    } else {
      gain = 5;
      state.combo = 0;
      pop.add("ぎりぎり +5", STICK_X, f.y - 30, "#fff", 18);
    }
    state.score += gain;
    state.placed.push({ kind: f.kind, off, w: f.w });
    if (state.placed.length >= PER_SKEWER) finishSkewer();
    state.wait = 0.25;
  }

  return {
    state, // 動作確認用（?debug=1 のとき window.__game から見る）
    get score() {
      return state.score;
    },
    get over() {
      return state.over;
    },
    pointer(type) {
      if (type !== "down" || state.over || !state.current || state.falling || state.finishing > 0) return;
      const c = state.current;
      state.falling = { kind: c.kind, x: c.x, y: SWING_Y, vy: 0, w: c.w };
      state.current = null;
    },
    update(dt) {
      state.t += dt;
      state.shake = Math.max(0, state.shake - dt);
      pop.update(dt);
      for (const d of state.dropped) {
        d.vy += GRAVITY * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        d.r += d.vr * dt;
      }
      state.dropped = state.dropped.filter((d) => d.y < H + 60);
      if (state.over) return;

      if (state.finishing > 0) {
        state.finishing -= dt;
        if (state.finishing <= 0) state.placed = [];
        return;
      }
      if (state.current) {
        const c = state.current;
        c.phase += c.speed * dt * (1 + c.wobble * Math.sin(state.t * 3.1));
        c.x = STICK_X + Math.sin(c.phase) * (W / 2 - c.w / 2 - 14);
      } else if (state.falling) {
        const f = state.falling;
        f.vy += GRAVITY * dt;
        f.y += f.vy * dt;
        const target = landY(state.placed.length);
        if (f.y >= target) {
          f.y = target;
          state.falling = null;
          land(f);
        }
      } else {
        state.wait -= dt;
        if (state.wait <= 0) spawn();
      }
    },
    draw(ctx) {
      drawSpace(ctx, state.t);
      ctx.save();
      if (state.shake > 0) ctx.translate(Math.sin(state.t * 80) * 4, 0);

      // 串（1本できたら横にはける）
      const slide = state.finishing > 0 ? (1 - state.finishing / 0.7) * -(W * 0.8) : 0;
      ctx.save();
      ctx.translate(slide, 0);
      ctx.strokeStyle = "#e9c48a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(STICK_X, BASE_Y + 40);
      ctx.lineTo(STICK_X, BASE_Y - PER_SKEWER * PIECE_H - 26);
      ctx.stroke();
      state.placed.forEach((p, i) => drawPiece(ctx, STICK_X + p.off, landY(i), p.w, p.kind));
      ctx.restore();

      // 皿
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(STICK_X, BASE_Y + 44, 110, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      if (state.current) drawPiece(ctx, state.current.x, SWING_Y, state.current.w, state.current.kind);
      if (state.falling) drawPiece(ctx, state.falling.x, state.falling.y, state.falling.w, state.falling.kind);
      for (const d of state.dropped) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.r);
        drawPiece(ctx, 0, 0, d.w, d.kind);
        ctx.restore();
      }
      ctx.restore();

      // ガイド：狙う位置
      ctx.strokeStyle = "rgba(128,247,253,0.35)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(STICK_X, SWING_Y + 24);
      ctx.lineTo(STICK_X, BASE_Y - PER_SKEWER * PIECE_H - 30);
      ctx.stroke();
      ctx.setLineDash([]);

      // つぎの具と、応援するマスコット
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("つぎ", 14, 92);
      drawPiece(ctx, 74, 92, 44, state.next, 0.7);
      ctx.fillText(KINDS[state.next].name, 98, 92);
      drawMascot(ctx, 52, BASE_Y - 20, 30, costume, { t: state.t, tilt: Math.sin(state.t * 2) * 0.1 });

      pop.draw(ctx);
      drawHud(ctx, `${state.score}点`, `${state.skewers}本`);
      drawHearts(ctx, state.lives, 3);
      if (state.combo >= 2) {
        ctx.font = `900 16px ${FONT}`;
        ctx.fillStyle = COLORS.beak;
        ctx.textAlign = "left";
        ctx.fillText(`ぴったり れんぞく ${state.combo}`, 14, 50);
      }
    },
  };
}

function drawPiece(ctx, x, y, w, kind, scale = 1) {
  const k = KINDS[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = k.fill;
  ctx.strokeStyle = k.edge;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (kind === "negi") {
    ctx.roundRect(-w / 2, -PIECE_H / 2 + 3, w, PIECE_H - 6, 10);
  } else if (kind === "tsukune") {
    ctx.ellipse(0, 0, w / 2, PIECE_H / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(-w / 2, -PIECE_H / 2, w, PIECE_H, 14);
  }
  ctx.fill();
  ctx.stroke();
  // てり
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.18, -PIECE_H * 0.18, w * 0.18, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  if (scale === 1 && w >= 44) {
    ctx.font = `900 12px ${FONT}`;
    ctx.fillStyle = k.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(k.name, 0, 1);
  }
  ctx.restore();
}
