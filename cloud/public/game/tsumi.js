// つみつみ串：左右にゆれる具をタップで落として、串にまっすぐ刺していく。3回はずすと終わり
//   1本ごとに「お題」（ねぎま・つくねだけ など）。お題どおりに つめば ボーナス。いらない具は「パス」（1本に2回まで）
//   とくべつな具：金のもも（どのお題にも合う・+50）・こげ（刺さると お題ボーナスなし）・こおり（しばらく ゆれが ゆっくり）
//   5本ごとに ジャンボ串（8個・ボーナス2倍）。5本ごとに ゆれ方が かわる
//   ストック：いまの具を1つ とっておける（もう一度おすと入れかえ。1個につき1回）
//   焼き加減タイム：1本できたら焼く。メーターが「こんがり」のときにタップで ボーナス
//   ショップの強化（up）：パス+1・ハート+1・ゆっくりスタート
//
// 点数（src/lib/ranking.ts の MAX_POINTS_PER_SECOND.tsumi の根拠）
//   1個：ぴったり 20＋連続ぴったり 5×最大5 ／ まんなか寄り 10 ／ はし 5、金のもも ＋50 → 1個あたり最大 95
//   1本：できた 30、お題 80、焼き加減 パーフェクト 60（ジャンボは どれも2倍）→ 1個あたり最大 (60+160+120)/8 ≒ 43
//   いちばん短い落下 約0.45秒＋次が出るまで0.25秒 → 1個に最低0.7秒 → 最大 (95+43)/0.7 ≒ 197点/秒（上限は余裕をみて240）

import { COLORS, FONT, Popups, W, drawHearts, drawHud, drawMascot, drawSpace, star, view } from "./common.js";

export const META = {
  id: "tsumi",
  title: "つみつみ串",
  howto: "ゆれる具を タップで落として、串に まっすぐ さそう。「お題」どおりに つむと ボーナス！ いらない具は パス、あとで使う具は ストック。できたら こんがり焼こう",
  pointRate: 0.12,
};

const STICK_X = W / 2;
const BASE_Y = 590; // いちばん下の具の下端
const PIECE_H = 34;
const SMALL_H = 26; // ジャンボ串のときの具の高さ
const SWING_Y = 150;
const GRAVITY = 2400;
const PASSES = 2;
const KINDS = {
  momo: { name: "もも", fill: "#c8763f", edge: "#8a4a1d", text: "#fff" },
  negi: { name: "ねぎ", fill: "#a4dd7c", edge: "#5a9a3a", text: "#2f5a1d" },
  tsukune: { name: "つくね", fill: "#5a2a12", edge: "#2a1206", text: "#fff" },
  kawa: { name: "かわ", fill: "#f2d3a6", edge: "#c49a62", text: "#7a5222" },
  gold: { name: "金のもも", fill: "#ffd84a", edge: "#e0a400", text: "#7a5600" },
  burnt: { name: "こげ", fill: "#2b2223", edge: "#000", text: "#bbb" },
  ice: { name: "こおり", fill: "#dff6fb", edge: "#80f7fd", text: "#2b8fb3" },
};
const NORMAL = ["momo", "negi", "tsukune", "kawa"];

/** お題：ok(kinds) が true なら達成（金のももは どの具の代わりにもなる） */
const RECIPES = [
  { name: "なんでもOK", ok: () => true, hint: "どの具でも" },
  { name: "ねぎま", ok: (k) => alternates(k, "momo", "negi"), hint: "もも・ねぎを こうごに" },
  { name: "つくねだけ", ok: (k) => k.every((x) => x === "tsukune"), hint: "ぜんぶ つくね" },
  { name: "ももだけ", ok: (k) => k.every((x) => x === "momo"), hint: "ぜんぶ もも" },
  { name: "3しゅるい", ok: (k) => new Set(k).size >= 3, hint: "3しゅるい いじょう" },
  { name: "かわ はさみ", ok: (k) => k[0] === "kawa" && k[k.length - 1] === "kawa", hint: "いちばん下と上が かわ" },
];

/** 金のもも（wild）を当てはめても条件に合うか */
function alternates(k, a, b) {
  return k.every((x, i) => x === (i % 2 ? b : a)) || k.every((x, i) => x === (i % 2 ? a : b));
}
function recipeOk(recipe, kinds) {
  // 金のももは、条件に合うどれかの具として数える（ためしに入れてみる）
  const golds = kinds.map((k, i) => (k === "gold" ? i : -1)).filter((i) => i >= 0);
  if (!golds.length) return recipe.ok(kinds);
  return NORMAL.some((a) => NORMAL.some((b) => recipe.ok(kinds.map((k, i) => (k === "gold" ? (golds.indexOf(i) % 2 ? b : a) : k)))));
}

/** ゆれ方（5本ごとに かわる） */
const PATTERNS = [
  { name: "ゆらゆら", fn: (p) => Math.sin(p) },
  { name: "ぎゅんぎゅん", fn: (p) => Math.sin(p * 1.35) },
  { name: "ジグザグ", fn: (p) => (2 / Math.PI) * Math.asin(Math.sin(p)) },
  { name: "きまぐれ", fn: (p) => Math.sin(p) * 0.7 + Math.sin(p * 2.3) * 0.3 },
];

/** 焼き加減メーター：0（なま）→ 1（こげ）。この間で止めると こんがり */
const GOOD = [0.55, 0.8];
const PERFECT = [0.64, 0.71];

export function createGame({ costume, up = {} }) {
  const pop = new Popups();
  const maxPasses = PASSES + (up.tsumiPass ?? 0);
  const maxLives = 3 + (up.tsumiLife ?? 0);
  const state = {
    score: 0,
    lives: maxLives,
    combo: 0,
    skewers: 0,
    placed: [], // { kind, off, w }
    recipe: RECIPES[0],
    perSkewer: 5,
    passes: maxPasses,
    stock: null, // とっておいた具
    swapped: false, // いまの具で ストックを使ったか
    grill: null, // 焼き加減タイム：{ v（0〜1）, speed, done }
    current: null, // ゆれている具
    falling: null, // 落ちている具
    dropped: [], // はずれて落ちていく具・パスした具
    next: "momo",
    wait: 0.4,
    finishing: 0,
    ice: up.tsumiSlow ? 5 : 0, // こおり：のこり何個ぶん ゆっくりにするか（ゆっくりスタートの強化は さいしょの5こ）
    over: false,
    t: 0,
    shake: 0,
    banner: { text: "", age: 9 },
  };

  const jumbo = () => state.perSkewer > 5;
  const pieceH = () => (jumbo() ? SMALL_H : PIECE_H);
  const pattern = () => PATTERNS[Math.floor(state.skewers / 5) % PATTERNS.length];

  function banner(text) {
    state.banner = { text, age: 0 };
  }

  function randomKind() {
    const r = Math.random();
    if (r < 0.05) return "gold";
    if (r < 0.12 && state.skewers >= 1) return "burnt";
    if (r < 0.16) return "ice";
    // お題に合う具は少し出やすい
    const rc = state.recipe.name;
    if (Math.random() < 0.35) {
      if (rc === "ねぎま") return Math.random() < 0.5 ? "momo" : "negi";
      if (rc === "つくねだけ") return "tsukune";
      if (rc === "ももだけ") return "momo";
      if (rc === "かわ はさみ") return "kawa";
    }
    return NORMAL[Math.floor(Math.random() * NORMAL.length)];
  }

  function newSkewer() {
    const n = state.skewers;
    state.perSkewer = n > 0 && (n + 1) % 5 === 0 ? 8 : 5;
    // はじめの1本は「なんでもOK」、そのあとは ランダム
    state.recipe = n === 0 ? RECIPES[0] : RECIPES[1 + Math.floor(Math.random() * (RECIPES.length - 1))];
    state.passes = maxPasses;
    if (n > 0 && n % 5 === 0) banner(`ゆれ方：${pattern().name}`);
    else if (jumbo()) banner("ジャンボ串！ 8こ つもう");
  }

  function width() {
    return Math.max(36, 72 - state.skewers * 2.5);
  }

  function spawn() {
    const n = state.skewers * 5 + state.placed.length;
    state.current = {
      kind: state.next,
      phase: Math.random() * Math.PI * 2,
      speed: Math.min(6.4, 2.2 + n * 0.08) * (state.ice > 0 ? 0.5 : 1),
      w: width(),
      x: STICK_X,
    };
    if (state.ice > 0) state.ice--;
    state.swapped = false;
    state.next = randomKind();
  }

  function landY(index) {
    return BASE_Y - index * pieceH() - pieceH() / 2;
  }

  function finishSkewer() {
    const kinds = state.placed.map((p) => p.kind);
    const times = jumbo() ? 2 : 1;
    let bonus = 30 * times;
    let label = jumbo() ? "ジャンボ串 できた！" : "1本できた！";
    if (!kinds.includes("burnt") && recipeOk(state.recipe, kinds)) {
      bonus += 80 * times;
      label = `お題「${state.recipe.name}」クリア！ +${bonus}`;
    } else if (kinds.includes("burnt")) {
      label = "こげが まざった…";
    }
    state.score += bonus;
    pop.add(label, W / 2, 300, COLORS.cyan, 24);
    // つぎは 焼き加減タイム（だんだん 速く焼ける）
    state.grill = { v: 0, speed: Math.min(1.1, 0.55 + state.skewers * 0.04), done: false, wait: 0.5 };
  }

  /** 焼き加減タイムで タップした（または こげるまで待った） */
  function grillStop() {
    const g = state.grill;
    if (!g || g.done) return;
    g.done = true;
    const times = jumbo() ? 2 : 1;
    if (g.v >= PERFECT[0] && g.v <= PERFECT[1]) {
      state.score += 60 * times;
      pop.add(`こんがり パーフェクト！ +${60 * times}`, W / 2, 250, COLORS.beak, 26);
    } else if (g.v >= GOOD[0] && g.v <= GOOD[1]) {
      state.score += 30 * times;
      pop.add(`こんがり！ +${30 * times}`, W / 2, 250, COLORS.beak, 24);
    } else {
      pop.add(g.v < GOOD[0] ? "なまやけ…" : "こげちゃった…", W / 2, 250, "#fff", 22);
    }
    state.skewers++;
    state.finishing = 0.9;
  }

  /** ストック：とっておく／入れかえる */
  function toggleStock() {
    const c = state.current;
    if (!c || state.swapped) return;
    if (state.stock === null) {
      state.stock = c.kind;
      state.current = null;
      state.wait = 0.2;
    } else {
      [c.kind, state.stock] = [state.stock, c.kind];
      state.swapped = true;
    }
  }

  function land(f) {
    const off = f.x - STICK_X;
    const a = Math.abs(off);
    if (a > f.w / 2 - 4) {
      // 串に刺さらない
      state.dropped.push({ ...f, vx: off > 0 ? 120 : -120, vr: off > 0 ? 6 : -6, r: 0, vy: 0 });
      if (f.kind === "burnt") {
        // こげは 落としても だいじょうぶ
        pop.add("こげを よけた！", W / 2, 260, "#fff", 22);
      } else {
        state.lives--;
        state.combo = 0;
        state.shake = 0.3;
        pop.add(state.lives > 0 ? "おっと！" : "おしまい", W / 2, 260, COLORS.danger, 30);
        if (state.lives <= 0) state.over = true;
      }
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
    if (f.kind === "gold") {
      gain += 50;
      pop.add("金のもも！ +50", STICK_X, f.y - 60, COLORS.beak, 22);
    }
    if (f.kind === "ice") {
      state.ice = 3;
      pop.add("こおり：ゆっくりに", STICK_X, f.y - 60, COLORS.cyan, 20);
    }
    state.score += gain;
    state.placed.push({ kind: f.kind, off, w: f.w });
    if (state.placed.length >= state.perSkewer) finishSkewer();
    state.wait = 0.25;
  }

  function pass() {
    if (!state.current || state.passes <= 0) return;
    const c = state.current;
    state.dropped.push({ ...c, y: SWING_Y, vx: 0, vy: -500, vr: 4, r: 0 });
    state.current = null;
    state.passes--;
    state.wait = 0.2;
  }

  newSkewer();

  return {
    state, // 動作確認用（?debug=1 のとき window.__game から見る）
    get score() {
      return state.score;
    },
    get over() {
      return state.over;
    },
    pointer(type, x, y) {
      if (type !== "down" || state.over) return;
      if (state.grill && !state.grill.done) {
        if (state.grill.wait <= 0) grillStop();
        return;
      }
      if (!state.current || state.falling || state.finishing > 0) return;
      // 右下の「パス」「ストック」ボタン
      if (x > 270 && y > BASE_Y - 10 && y < BASE_Y + 50) return pass();
      if (x > 270 && y > BASE_Y - 66 && y < BASE_Y - 14) return toggleStock();
      const c = state.current;
      state.falling = { kind: c.kind, x: c.x, y: SWING_Y, vy: 0, w: c.w };
      state.current = null;
    },
    update(dt) {
      state.t += dt;
      state.shake = Math.max(0, state.shake - dt);
      state.banner.age += dt;
      pop.update(dt);
      for (const d of state.dropped) {
        d.vy += GRAVITY * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        d.r += d.vr * dt;
      }
      state.dropped = state.dropped.filter((d) => d.y < view.y1 + 60);
      if (state.over) return;

      if (state.grill && !state.grill.done) {
        const g = state.grill;
        if (g.wait > 0) g.wait -= dt;
        else {
          g.v += g.speed * dt;
          if (g.v >= 1) {
            g.v = 1;
            grillStop();
          }
        }
        return;
      }
      if (state.finishing > 0) {
        state.finishing -= dt;
        if (state.finishing <= 0) {
          state.placed = [];
          state.grill = null;
          newSkewer();
        }
        return;
      }
      if (state.current) {
        const c = state.current;
        c.phase += c.speed * dt;
        c.x = STICK_X + pattern().fn(c.phase) * (W / 2 - c.w / 2 - 14);
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
      const ph = pieceH();

      // 串（1本できたら横にはける）
      const slide = state.finishing > 0 ? (1 - state.finishing / 0.7) * -(W * 0.8) : 0;
      ctx.save();
      ctx.translate(slide, 0);
      ctx.strokeStyle = "#e9c48a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(STICK_X, BASE_Y + 40);
      ctx.lineTo(STICK_X, BASE_Y - state.perSkewer * ph - 26);
      ctx.stroke();
      // 焼き加減タイムでは、具が だんだん焼き色に
      const burn = state.grill ? Math.min(0.7, state.grill.v * 0.75) : 0;
      state.placed.forEach((p, i) => drawPiece(ctx, STICK_X + p.off, landY(i), p.w, p.kind, 1, ph, burn));
      ctx.restore();
      if (state.grill && !state.grill.done) drawFlames(ctx, state.t);

      // 皿
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(STICK_X, BASE_Y + 44, 110, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      if (state.current) drawPiece(ctx, state.current.x, SWING_Y, state.current.w, state.current.kind, 1, ph);
      if (state.falling) drawPiece(ctx, state.falling.x, state.falling.y, state.falling.w, state.falling.kind, 1, ph);
      for (const d of state.dropped) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.r);
        drawPiece(ctx, 0, 0, d.w, d.kind, 1, ph);
        ctx.restore();
      }
      ctx.restore();

      // ガイド：狙う位置
      ctx.strokeStyle = "rgba(128,247,253,0.35)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(STICK_X, SWING_Y + 24);
      ctx.lineTo(STICK_X, BASE_Y - state.perSkewer * ph - 30);
      ctx.stroke();
      ctx.setLineDash([]);

      // お題の札
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.roundRect(14, 76, W - 28, 44, 14);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `900 16px ${FONT}`;
      ctx.fillStyle = COLORS.magenta;
      ctx.fillText(`お題「${state.recipe.name}」`, 26, 98);
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = "right";
      ctx.fillText(`${state.recipe.hint}・${state.placed.length}/${state.perSkewer}こ`, W - 26, 98);

      // つぎの具
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("つぎ", 14, 196);
      drawPiece(ctx, 74, 196, 44, state.next, 0.7, PIECE_H);
      ctx.fillText(KINDS[state.next].name, 98, 196);
      if (state.ice > 0) {
        ctx.fillStyle = COLORS.cyan;
        ctx.fillText(`ゆっくり あと${state.ice}こ`, 14, 222);
      }

      // ストック（とっておいた具を中に出す）
      ctx.fillStyle = state.current && !state.swapped ? "#fff" : "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.roundRect(276, BASE_Y - 62, 72, 48, 14);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = `900 11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("ストック", 312, BASE_Y - 52);
      if (state.stock) drawPiece(ctx, 312, BASE_Y - 32, 44, state.stock, 0.55, PIECE_H);
      else {
        ctx.font = `700 11px ${FONT}`;
        ctx.fillText("とっておく", 312, BASE_Y - 30);
      }

      // パス
      ctx.fillStyle = state.passes > 0 && state.current ? "#fff" : "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.roundRect(276, BASE_Y - 4, 72, 44, 14);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.font = `900 16px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`パス ${state.passes}`, 312, BASE_Y + 18);

      drawMascot(ctx, 52, BASE_Y - 20, 30, costume, { t: state.t, tilt: Math.sin(state.t * 2) * 0.1 });

      pop.draw(ctx);
      drawHud(ctx, `${state.score.toLocaleString()}点`, `${state.skewers}本`);
      drawHearts(ctx, state.lives, maxLives);
      if (state.grill) drawGrillMeter(ctx, state.grill);
      if (state.combo >= 2) {
        ctx.font = `900 16px ${FONT}`;
        ctx.fillStyle = COLORS.beak;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`ぴったり れんぞく ${state.combo}`, 14, 50);
      }
      if (state.banner.age < 2) {
        ctx.globalAlpha = Math.min(1, (2 - state.banner.age) * 2);
        ctx.fillStyle = "rgba(42,31,92,0.7)";
        ctx.fillRect(view.x0, 250, view.x1 - view.x0, 50);
        ctx.font = `900 22px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(state.banner.text, W / 2, 275, W - 20);
        ctx.globalAlpha = 1;
      }
    },
  };
}

/** 焼き加減メーター */
function drawGrillMeter(ctx, g) {
  const x = 40;
  const y = 330;
  const w = W - 80;
  ctx.fillStyle = "rgba(42,31,92,0.85)";
  ctx.beginPath();
  ctx.roundRect(x - 14, y - 46, w + 28, 92, 18);
  ctx.fill();
  ctx.font = `900 18px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(g.done ? "やけた！" : g.wait > 0 ? "焼き加減タイム！" : "こんがりで タップ！", W / 2, y - 26);
  // なま → こんがり → こげ
  const seg = [
    [0, GOOD[0], "#f6e2c4"],
    [GOOD[0], GOOD[1], "#d98a3a"],
    [GOOD[1], 1, "#3b2a22"],
  ];
  for (const [a, b, c] of seg) {
    ctx.fillStyle = c;
    ctx.fillRect(x + w * a, y - 4, w * (b - a), 22);
  }
  ctx.fillStyle = COLORS.beak;
  ctx.fillRect(x + w * PERFECT[0], y - 4, w * (PERFECT[1] - PERFECT[0]), 22);
  ctx.font = `700 11px ${FONT}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText("なま", x + (w * GOOD[0]) / 2, y + 7);
  ctx.fillText("こんがり", x + w * ((PERFECT[0] + PERFECT[1]) / 2), y + 7);
  ctx.fillStyle = "#fff";
  ctx.fillText("こげ", x + w * ((GOOD[1] + 1) / 2), y + 7);
  // 針
  const nx = x + w * g.v;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = COLORS.space900;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx, y - 8);
  ctx.lineTo(nx - 8, y - 18);
  ctx.lineTo(nx + 8, y - 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(nx - 1.5, y - 6, 3, 28);
}

/** 焼き台の火 */
function drawFlames(ctx, t) {
  for (let i = 0; i < 7; i++) {
    const x = STICK_X - 66 + i * 22;
    const h = 22 + Math.sin(t * 12 + i * 1.7) * 8;
    const g = ctx.createLinearGradient(x, BASE_Y + 34, x, BASE_Y + 34 - h);
    g.addColorStop(0, "rgba(229,90,34,0.9)");
    g.addColorStop(1, "rgba(237,210,99,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 9, BASE_Y + 34);
    ctx.quadraticCurveTo(x, BASE_Y + 34 - h * 1.4, x + 9, BASE_Y + 34);
    ctx.fill();
  }
}

function drawPiece(ctx, x, y, w, kind, scale = 1, h = PIECE_H, burn = 0) {
  const k = KINDS[kind];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = k.fill;
  ctx.strokeStyle = k.edge;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (kind === "negi") {
    ctx.roundRect(-w / 2, -h / 2 + 3, w, h - 6, 10);
  } else if (kind === "tsukune") {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (kind === "ice") {
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  } else {
    ctx.roundRect(-w / 2, -h / 2, w, h, 14);
  }
  ctx.fill();
  ctx.stroke();
  if (burn > 0) {
    ctx.fillStyle = `rgba(90,40,10,${burn})`;
    ctx.fill();
  }
  // てり
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.18, -h * 0.18, w * 0.18, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "gold") {
    ctx.fillStyle = "#fff";
    star(ctx, w / 2 - 6, -h / 2 + 2, 6, 2.5);
    ctx.fill();
  }
  if (scale === 1 && w >= 44 && h >= PIECE_H) {
    ctx.font = `900 12px ${FONT}`;
    ctx.fillStyle = k.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(k.name, 0, 1);
  }
  ctx.restore();
}
