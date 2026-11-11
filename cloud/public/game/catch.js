// 流れ星キャッチ：60秒のあいだ、流れ星のように降ってくる串を、マスコットを左右に動かして受け止める
//   上に「お客さんの注文」が出る。注文どおりの串を集めると ボーナス。注文は だんだん大きくなる
//   アイテム：マグネット（串が寄ってくる）・ビッグ（受け止める幅が広がる）・スロー（ゆっくり降る）・時計（+5秒）
//   15秒ごとに イベント（流星群タイム・いん石あめ・金の串ラッシュ）。最後の10秒は フィーバー（点数2倍）
//
// 点数（src/lib/ranking.ts の MAX_POINTS_PER_SECOND.catch の根拠）
//   串 10・金の串 50 に、コンボ倍率（10個ごとに+1、最大×5）と フィーバー×2 をかける
//   注文を そろえた 50＋20×本数（最大7本で190）× フィーバー2。注文は1本ずつ集めるので 1秒に3本まで
//   降る数は最大で1秒に6個（流星群タイム）→ 串だけで 6×10×5×2 = 600、金がまざると もっと上がるが 金は5%
//   注文は最短 約2.3秒に1回（7本）→ 380×… の上乗せは 1秒あたり 約170
//   （上限は余裕をみて800）

import { COLORS, FONT, H, Popups, W, drawHud, drawMascot, drawSkewer, drawSpace, drawTrail, heart, view } from "./common.js";

export const META = {
  id: "catch",
  title: "流れ星キャッチ",
  howto: "ゆびで マスコットを うごかして、ふってくる 串を キャッチ！ 上の「注文」どおりに あつめると ボーナス。こげた串と いん石は よけてね",
  pointRate: 0.05,
};

const TIME = 60;
const MASCOT_Y = 560;
const MASCOT_R = 30;
const POWER_SECONDS = 6;
const FEVER_AT = 10; // のこり何秒から フィーバー

/** 降ってくる串の種類（注文に出るもの） */
const KINDS = {
  tare: { name: "たれ", pieces: ["tare", "tare", "tare"] },
  shio: { name: "塩", pieces: ["shio", "shio", "shio"] },
  negima: { name: "ねぎま", pieces: ["tare", "negi", "tare"] },
  tsukune: { name: "つくね", pieces: ["tsukune", "tsukune", "tsukune"] },
};
const KIND_IDS = Object.keys(KINDS);

const POWERS = {
  magnet: { name: "マグネット", color: "#ff8fd0" },
  big: { name: "ビッグ", color: COLORS.cyan },
  slow: { name: "スロー", color: COLORS.beak },
};

const EVENTS = [
  { id: "shower", name: "流星群タイム！ 串がいっぱい" },
  { id: "rocks", name: "いん石あめ！ 気をつけて" },
  { id: "gold", name: "金の串ラッシュ！" },
];

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
    order: null,
    orders: 0, // そろえた注文の数
    powers: { magnet: 0, big: 0, slow: 0 },
    event: null, // { id, name, left }
    nextEvent: 15,
    banner: { text: "", age: 9 },
    over: false,
    t: 0,
    hurt: 0,
    flash: 0,
  };

  const mult = () => Math.min(5, 1 + Math.floor(state.combo / 10));
  const fever = () => (state.left <= FEVER_AT ? 2 : 1);
  const reach = () => MASCOT_R + 18 + (state.powers.big > 0 ? 22 : 0);

  function banner(text) {
    state.banner = { text, age: 0 };
  }

  function newOrder() {
    // 注文は少しずつ大きく（2本 → 7本）。種類も増える
    const size = Math.min(7, 2 + Math.floor(state.orders / 2));
    const kinds = KIND_IDS.slice(0, Math.min(KIND_IDS.length, 2 + Math.floor(state.orders / 2)));
    const need = {};
    for (let i = 0; i < size; i++) {
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      need[k] = (need[k] ?? 0) + 1;
    }
    state.order = { need, got: {}, size };
  }

  function orderWants(kind) {
    const o = state.order;
    return o && (o.need[kind] ?? 0) > (o.got[kind] ?? 0);
  }

  function spawn() {
    const p = Math.min(1, state.elapsed / TIME);
    const ev = state.event?.id;
    const r = Math.random();
    const bad = ev === "rocks" ? 0.4 : 0.1 + 0.15 * p;
    const gold = ev === "gold" ? 0.35 : 0.05;
    let kind;
    if (r < gold) kind = "gold";
    else if (r < gold + 0.03) kind = "clock";
    else if (r < gold + 0.07) kind = ["magnet", "big", "slow"][Math.floor(Math.random() * 3)];
    else if (r < gold + 0.07 + bad) kind = Math.random() < 0.5 ? "burnt" : "meteor";
    else {
      // 注文に入っている串は 少し出やすい
      const wanted = KIND_IDS.filter(orderWants);
      kind = wanted.length && Math.random() < 0.45 ? wanted[Math.floor(Math.random() * wanted.length)] : KIND_IDS[Math.floor(Math.random() * KIND_IDS.length)];
    }
    const x = 30 + Math.random() * (W - 60);
    const vy = 170 + 180 * p + Math.random() * 40;
    state.items.push({ kind, x, y: -30, vx: (Math.random() - 0.5) * 90, vy, rot: Math.random() * Math.PI });
  }

  const isBad = (k) => k === "burnt" || k === "meteor";
  const isSkewer = (k) => k in KINDS || k === "gold";

  function caught(it) {
    const y = MASCOT_Y - 60;
    if (isBad(it.kind)) {
      state.left = Math.max(0, state.left - 3);
      state.combo = 0;
      state.hurt = 0.5;
      pop.add(it.kind === "meteor" ? "いん石！ -3秒" : "あちっ！ -3秒", it.x, y, COLORS.danger, 22);
      return;
    }
    if (it.kind === "clock") {
      state.left += 5;
      pop.add("+5秒", it.x, y, COLORS.cyan, 24);
      return;
    }
    if (it.kind in POWERS) {
      state.powers[it.kind] = POWER_SECONDS;
      pop.add(`${POWERS[it.kind].name}！`, it.x, y, POWERS[it.kind].color, 24);
      return;
    }
    state.combo++;
    state.best = Math.max(state.best, state.combo);
    const m = mult();
    const gain = (it.kind === "gold" ? 50 : 10) * m * fever();
    state.score += gain;
    pop.add(`+${gain}`, it.x, y + 4, it.kind === "gold" ? COLORS.beak : "#fff", it.kind === "gold" ? 26 : 20);
    if (state.combo % 10 === 0 && m < 5) pop.add(`×${m + 1}！`, W / 2, 300, COLORS.cyan, 34);

    // 注文
    if (orderWants(it.kind)) {
      const o = state.order;
      o.got[it.kind] = (o.got[it.kind] ?? 0) + 1;
      if (KIND_IDS.every((k) => (o.got[k] ?? 0) >= (o.need[k] ?? 0))) {
        const bonus = (50 + 20 * o.size) * fever();
        state.score += bonus;
        state.orders++;
        state.flash = 0.4;
        pop.add(`注文 そろった！ +${bonus}`, W / 2, 200, COLORS.beak, 26);
        newOrder();
      }
    }
  }

  newOrder();

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
      state.banner.age += dt;
      state.hurt = Math.max(0, state.hurt - dt);
      state.flash = Math.max(0, state.flash - dt);
      if (state.over) return;
      const wasFever = fever() > 1;
      state.elapsed += dt;
      state.left -= dt;
      if (!wasFever && fever() > 1) banner("フィーバー！ 点数 2ばい");
      if (state.left <= 0) {
        state.left = 0;
        state.over = true;
        pop.add("おしまい！", W / 2, 300, "#fff", 36);
        return;
      }
      for (const k of Object.keys(state.powers)) state.powers[k] = Math.max(0, state.powers[k] - dt);

      // イベント（15秒ごと、5秒間。フィーバー中はやらない）
      if (state.event) {
        state.event.left -= dt;
        if (state.event.left <= 0) state.event = null;
      } else if (state.elapsed >= state.nextEvent && state.left > FEVER_AT + 5) {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        state.event = { ...ev, left: 5 };
        state.nextEvent = state.elapsed + 15;
        banner(ev.name);
      }

      // マスコットは指に追いつくように動く
      state.x += (state.target - state.x) * Math.min(1, dt * 14);

      state.spawn -= dt;
      if (state.spawn <= 0) {
        spawn();
        const p = Math.min(1, state.elapsed / TIME);
        state.spawn = (0.8 - 0.47 * p) * (state.event?.id === "shower" ? 0.5 : 1); // 1秒に1.25個 → 3個（流星群は2倍）
      }
      const slow = state.powers.slow > 0 ? 0.5 : 1;
      for (const it of state.items) {
        // マグネット：近くの よいものが 寄ってくる
        if (state.powers.magnet > 0 && !isBad(it.kind) && it.y > 200) {
          it.x += (state.x - it.x) * Math.min(1, dt * 4);
        }
        it.x += it.vx * dt * slow;
        it.y += it.vy * dt * slow;
        it.rot += dt * 2;
        if (it.x < 20 || it.x > W - 20) it.vx = -it.vx;
        if (!it.done && Math.hypot(it.x - state.x, it.y - MASCOT_Y) < reach()) {
          it.done = true;
          caught(it);
        } else if (!it.done && it.y > H + 30) {
          it.done = true;
          // 串を取りこぼすとコンボが切れる
          if (isSkewer(it.kind)) state.combo = 0;
        }
      }
      state.items = state.items.filter((it) => !it.done);
    },
    draw(ctx) {
      drawSpace(ctx, state.t);
      if (fever() > 1) {
        ctx.fillStyle = `rgba(237,111,182,${0.12 + 0.06 * Math.sin(state.t * 8)})`;
        ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      }
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(237,210,99,${state.flash * 0.5})`;
        ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
      }
      for (const it of state.items) {
        const trail = it.kind === "meteor" ? "rgba(255,140,80,0.6)" : it.kind === "gold" ? "rgba(255,216,74,0.7)" : it.kind in POWERS ? POWERS[it.kind].color : "rgba(255,255,255,0.5)";
        drawTrail(ctx, it.x, it.y, it.vx, it.vy, trail, 70);
        if (it.kind === "meteor") drawMeteor(ctx, it.x, it.y, it.rot);
        else if (it.kind === "clock") drawClock(ctx, it.x, it.y);
        else if (it.kind in POWERS) drawPower(ctx, it.kind, it.x, it.y, state.t);
        else {
          const pieces = it.kind === "gold" ? ["gold", "gold", "gold"] : it.kind === "burnt" ? ["burnt", "burnt", "burnt"] : KINDS[it.kind].pieces;
          // 注文に入っている串は光らせる
          if (orderWants(it.kind)) {
            ctx.fillStyle = "rgba(237,210,99,0.3)";
            ctx.beginPath();
            ctx.arc(it.x, it.y, 26, 0, Math.PI * 2);
            ctx.fill();
          }
          drawSkewer(ctx, it.x, it.y, Math.atan2(it.vy, it.vx) - Math.PI, pieces, 0.9);
        }
      }
      // 地面のかわりの光の帯
      ctx.fillStyle = "rgba(128,247,253,0.12)";
      ctx.fillRect(view.x0, MASCOT_Y + MASCOT_R + 8, view.x1 - view.x0, 6);
      // ビッグ・マグネットの効果
      if (state.powers.big > 0 || state.powers.magnet > 0) {
        ctx.strokeStyle = state.powers.magnet > 0 ? "rgba(255,143,208,0.5)" : "rgba(128,247,253,0.5)";
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(state.x, MASCOT_Y, reach(), Math.PI, 0);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      if (state.hurt > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(state.t * 40);
      drawMascot(ctx, state.x, MASCOT_Y, MASCOT_R * (state.powers.big > 0 ? 1.25 : 1), costume, { t: state.t, tilt: (state.target - state.x) * 0.004 });
      ctx.restore();

      drawOrder(ctx, state.order, state.orders);
      pop.draw(ctx);
      drawHud(ctx, `${state.score.toLocaleString()}点`, `のこり ${Math.ceil(state.left)}秒`);
      ctx.font = `900 16px ${FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = mult() > 1 ? COLORS.beak : "rgba(255,255,255,0.8)";
      ctx.fillText(`コンボ ${state.combo}　×${mult()}${fever() > 1 ? "　フィーバー×2" : ""}`, 14, 46);
      // 使っているアイテムの残り
      let px = 14;
      for (const [k, v] of Object.entries(state.powers)) {
        if (v <= 0) continue;
        ctx.fillStyle = POWERS[k].color;
        ctx.beginPath();
        ctx.roundRect(px, MASCOT_Y + 50, 96 * (v / POWER_SECONDS), 14, 7);
        ctx.fill();
        ctx.font = `900 11px ${FONT}`;
        ctx.fillStyle = COLORS.space900;
        ctx.fillText(POWERS[k].name, px + 6, MASCOT_Y + 51);
        px += 104;
      }
      if (state.banner.age < 2) {
        ctx.globalAlpha = Math.min(1, (2 - state.banner.age) * 2);
        ctx.fillStyle = "rgba(42,31,92,0.7)";
        ctx.fillRect(view.x0, 330, view.x1 - view.x0, 50);
        ctx.font = `900 22px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(state.banner.text, W / 2, 355, W - 20);
        ctx.globalAlpha = 1;
      }
      if (state.t < 2.5 && !state.over) {
        ctx.font = `900 20px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#fff";
        ctx.fillText("← ゆびで うごかす →", W / 2, MASCOT_Y + 70);
      }
    },
  };
}

/** 上のほうに出す注文の札 */
function drawOrder(ctx, order, done) {
  if (!order) return;
  const x = 14;
  const y = 74;
  const w = W - 28;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, 52, 14);
  ctx.fill();
  ctx.font = `900 13px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`注文 ${done + 1}`, x + 10, y + 14);
  let cx = x + 10;
  for (const k of KIND_IDS) {
    const need = order.need[k] ?? 0;
    if (!need) continue;
    const got = Math.min(need, order.got[k] ?? 0);
    const label = `${KINDS[k].name} ${got}/${need}`;
    ctx.font = `900 15px ${FONT}`;
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = got >= need ? COLORS.ok : k === "shio" ? COLORS.shioBg : COLORS.tareBg;
    ctx.beginPath();
    ctx.roundRect(cx, y + 24, tw, 22, 11);
    ctx.fill();
    ctx.fillStyle = got >= need ? "#fff" : k === "shio" ? COLORS.shio : COLORS.tare;
    ctx.fillText(label, cx + 8, y + 35.5);
    cx += tw + 6;
  }
}

function drawPower(ctx, kind, x, y, t) {
  const c = POWERS[kind].color;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = c;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 15 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.space900;
  ctx.strokeStyle = COLORS.space900;
  ctx.lineWidth = 3;
  if (kind === "magnet") {
    ctx.beginPath();
    ctx.arc(0, 1, 7, Math.PI, 0, true);
    ctx.stroke();
  } else if (kind === "big") {
    heart(ctx, 0, 3, 16);
    ctx.fill();
  } else {
    ctx.font = `900 13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ゆ", 0, 1);
  }
  ctx.restore();
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
