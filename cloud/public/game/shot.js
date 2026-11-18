// とりこショット：串のパチンコで材料の砦をくずす TORI♡CO オリジナルゲーム。
// 得点上限（src/lib/ranking.ts）：固定の焼き台は得点なし。
// 8面の最大は普通の材料7個×10＋ひの炭2個×30＋UFO2体×100 = 330点。
// クリア300＋残り弾最大2×200を加えて1030点（最低1発必要）。
// 開始1秒＋発射後最低1.5秒 = 最短2.5秒、1030/2.5 = 412点/秒。
// 途中得点も開始1秒以降で最大330点。上限500は412の1.21倍以上。
// 次面まではさらに2秒待つ。周回しても個数・得点は変わらない。
// 固定刻みのゲーム時間だけ進める。休止・遅い端末で実時間より速くならない。
import { COLORS, FONT, Popups, W, drawHud, drawMascot, drawSpace, view } from "./common.js";

export const META = {
  id: "shot", title: "とりこショット",
  howto: "とりこを 引っぱって はなすと とんでいくよ。砦を くずして はらぺこUFOの 手下を ぜんぶ たおそう！ 1ステージ 3発まで。とんでいる とちゅうで タップすると どかーん！",
  pointRate: 0.15,
};
const STEP = 1 / 60;
const FLOOR = 590;
const SLING = { x: 48, y: 475 };
const TYPES = {
  negima: { hp: 24, density: 0.002, color: "#d79b58" },
  tsukune: { hp: 12, density: 0.001, color: "#a55a32" },
  coal: { hp: 65, density: 0.004, color: "#403c48" },
  mesh: { hp: 10, density: 0.0007, color: "#b8c6d4" },
  ember: { hp: 18, density: 0.002, color: "#ef6241" },
  grill: { hp: Infinity, density: 0.002, color: "#8999ae" },
  ufo: { hp: 13, density: 0.001, color: "#bba1d3" },
};
// [種類, 中心x, 中心y, 幅（円は半径）, 高さ, 角度]。焼き台は得点なしの固定物。
const STAGES = [
  [["negima",190,535,90,110],["ufo",190,462,18]],
  [["negima",225,530,26,120],["negima",295,530,26,120],["mesh",260,462,110,16],["ufo",240,436,18],["ufo",283,436,18]],
  [["grill",260,410,145,16],["negima",260,382,100,40],["ufo",240,344,18],["ufo",285,344,18]],
  [["ember",200,572,36,36],["ember",248,572,36,36],["ember",296,572,36,36],["mesh",248,546,140,16],["ufo",218,520,18],["ufo",280,520,18]],
  [["grill",220,410,130,16,0.12],["negima",218,389.7,18,24,0.12],["tsukune",187.5,375.1,23],["ufo",287,572,18],["ember",242,572,36,36]],
  [["coal",210,535,40,110],["coal",320,535,24,110],["coal",265,468,150,24],["ember",250,572,36,36],["ufo",290,572,18]],
  [["grill",264,390,146,16],["ufo",285,364,18],["ember",240,364,36,36],["negima",233,555,100,70],["ufo",233,502,18]],
  [["coal",206,550,32,80],["coal",304,550,32,80],["mesh",255,502,140,16],["ufo",276,476,18],["ember",229,476,36,36],["grill",265,400,146,16],["negima",225,362,24,60],["negima",304,362,24,60],["mesh",265,324,124,16],["ufo",286,298,18],["ember",240,298,36,36],["tsukune",265,370,22]],
];

export function createGame({ costume }) {
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = window.Matter;
  const pop = new Popups();
  const engine = Engine.create({ enableSleeping: true });
  const state = { score: 0, over: false, t: 0, stageIndex: 0, ammo: 3, age: 0,
    flying: false, shotAge: 0, quiet: 0, clearWait: 0, pieces: [], bird: null,
    drag: null, particles: [], rings: [], dizzy: [], shake: 0, burstUsed: false, banner: { text: "", age: 0 } };
  let accumulator = 0;
  const pending = new Map();
  function startStage() {
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    pending.clear();
    Object.assign(state, { age: 0, ammo: 3, flying: false, shotAge: 0, quiet: 0,
      clearWait: 0, pieces: [], bird: null, drag: null, rings: [], dizzy: [], shake: 0, burstUsed: false, particles: [] });
    pop.items = [];
    // 地面は画面より広い。画面外の動的ボディは下の固定境界で回収。
    Composite.add(engine.world, Bodies.rectangle(180, FLOOR + 30, 2400, 60, { isStatic: true, friction: 0.7 }));
    const lap = Math.floor(state.stageIndex / STAGES.length);
    for (const [kind, x, y, w, h, angle = 0] of STAGES[state.stageIndex % STAGES.length]) {
      const spec = TYPES[kind];
      const opts = { isStatic: kind === "grill", angle, density: spec.density, friction: kind === "tsukune" ? 0.12 : 0.9, frictionStatic: 5, restitution: 0.06, frictionAir: 0.006 };
      // 手下は底を平らにして、わずかな傾きで勝手に転がるのを防ぐ。
      const body = kind === "ufo" ? Bodies.rectangle(x, y, w * 2, w * 2, { ...opts, chamfer: { radius: 7 } }) : h ? Bodies.rectangle(x, y, w, h, opts) : Bodies.circle(x, y, w, opts);
      body.plugin.shot = { kind, w, h, maxHp: spec.hp * (kind === "ufo" ? 1 + lap * 0.15 : 1), hp: spec.hp * (kind === "ufo" ? 1 + lap * 0.15 : 1) };
      state.pieces.push(body);
      Composite.add(engine.world, body);
    }
    state.banner = { text: `${lap ? `${lap + 1}しゅうめ ` : ""}ステージ${state.stageIndex % STAGES.length + 1}`, age: 0 };
  }
  // collisionStart は速度解決より前。相対速度と換算質量で衝撃を見積もる。
  Events.on(engine, "collisionStart", ({ pairs }) => {
    if (state.age < 1 || !state.flying || state.clearWait > 0) return;
    for (const { bodyA: a, bodyB: b } of pairs) {
      const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (speed < 2.4) continue;
      if (speed > 6) state.shake = Math.max(state.shake, 0.18);
      const mass = a.isStatic ? b.mass : b.isStatic ? a.mass : a.mass * b.mass / (a.mass + b.mass);
      const damage = speed * speed * Math.max(0.3, mass) * 0.7;
      for (const body of [a, b]) if (body.plugin.shot && !body.isStatic) pending.set(body, (pending.get(body) || 0) + damage);
    }
  });
  function explode(x, y) {
    state.shake = 0.3;
    state.rings.push({ x, y, age: 0 });
    pop.add("どかーん！", x, y - 30, COLORS.beak, 23);
    for (const body of state.pieces) {
      if (body.isStatic) continue;
      const dx = body.position.x - x, dy = body.position.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 78) continue;
      const k = 1 - distance / 90;
      Sleeping.set(body, false);
      Body.setVelocity(body, { x: body.velocity.x + dx / (distance || 1) * 9 * k,
        y: body.velocity.y + dy / (distance || 1) * 9 * k - 2 * k });
      body.plugin.shot.hp -= 65 * k;
    }
  }
  function destroy(body) {
    const data = body.plugin.shot;
    if (body.isStatic || !state.pieces.includes(body)) return;
    const points = data.kind === "ufo" ? 100 : data.kind === "ember" ? 30 : 10;
    state.score += points;
    pop.add(`+${points}`, body.position.x, body.position.y - 20, points === 100 ? COLORS.cyan : COLORS.beak, 22);
    if (data.kind === "ufo") state.dizzy.push({ x: body.position.x, y: body.position.y, age: 0 });
    state.pieces = state.pieces.filter((p) => p !== body);
    Composite.remove(engine.world, body);
    if (data.kind === "ember") explode(body.position.x, body.position.y);
    for (const piece of state.pieces) Sleeping.set(piece, false);
    if (state.bird) Sleeping.set(state.bird, false);
    for (let i = 0; i < 7; i++) state.particles.push({ x: body.position.x, y: body.position.y,
      vx: (Math.random() - 0.5) * 110, vy: -40 - Math.random() * 100, life: 0.65, color: TYPES[data.kind].color });
  }
  function pull(x, y) {
    const dx = x - state.drag.x, dy = y - state.drag.y;
    const factor = Math.min(1, 90 / (Math.hypot(dx, dy) || 1));
    state.drag.dx = dx * factor; state.drag.dy = dy * factor;
  }
  function tick() {
    state.t += STEP; state.age += STEP; state.banner.age += STEP;
    pop.update(STEP);
    state.shake = Math.max(0, state.shake - STEP);
    for (const effect of [...state.rings, ...state.dizzy]) effect.age += STEP;
    state.rings = state.rings.filter((e) => e.age < 0.45);
    state.dizzy = state.dizzy.filter((e) => e.age < 0.8);
    for (const p of state.particles) { p.life -= STEP; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 220 * STEP; }
    state.particles = state.particles.filter((p) => p.life > 0);
    if (state.clearWait > 0) {
      state.clearWait -= STEP;
      if (state.clearWait <= 0) { state.stageIndex++; startStage(); }
      return;
    }
    Engine.update(engine, STEP * 1000);
    for (const [body, damage] of pending) body.plugin.shot.hp -= damage;
    pending.clear();
    // 連鎖は各物を一度だけ除去。後ろから前への連鎖も同じ刻みで解決する。
    let removed;
    do {
      removed = false;
      for (const body of [...state.pieces]) {
        const { x, y } = body.position;
        if (!body.isStatic && state.age >= 1 && state.flying && (body.plugin.shot.hp <= 0 || x < -60 || x > W + 60 || y > 700)) { destroy(body); removed = true; }
      }
    } while (removed);
    if (!state.flying) return;
    state.shotAge += STEP;
    const moving = [...state.pieces, state.bird].filter(Boolean).some((b) => !b.isSleeping && (b.speed > 0.22 || b.angularSpeed > 0.025) && b.position.y < 700 && b.position.x > -60 && b.position.x < W + 60);
    state.quiet = moving ? 0 : state.quiet + STEP;
    if (state.shotAge < 1.5) return;
    if (!state.pieces.some((b) => b.plugin.shot.kind === "ufo")) {
      state.score += 300 + state.ammo * 200;
      state.clearWait = 2; state.drag = null;
      state.banner = { text: `クリア！ ${"★".repeat(state.ammo + 1)} +${300 + state.ammo * 200}`, age: 0 };
    } else if (state.quiet >= 0.45 || state.shotAge >= 7) {
      if (state.bird) Composite.remove(engine.world, state.bird);
      state.bird = null; state.flying = false;
      if (state.ammo === 0) state.over = true;
    }
  }
  startStage();
  return {
    state,
    get score() { return state.score; }, get over() { return state.over; },
    pointer(type, x, y) {
      if (state.over || state.clearWait > 0 || state.age < 1) return;
      if (state.flying) {
        if (type === "down" && state.bird && !state.burstUsed) {
          state.burstUsed = true;
          explode(state.bird.position.x, state.bird.position.y);
          Composite.remove(engine.world, state.bird);
          state.bird = null;
        }
        return;
      }
      if (type === "cancel") { state.drag = null; return; }
      if (type === "down") state.drag = { x, y, dx: 0, dy: 0 };
      if (!state.drag) return;
      if (type === "move") pull(x, y);
      if (type === "up") {
        pull(x, y);
        const { dx, dy } = state.drag;
        state.drag = null;
        if (Math.hypot(dx, dy) < 6) return;
        state.bird = Bodies.circle(SLING.x, SLING.y, 16, { density: 0.008, restitution: 0.25, friction: 0.6 });
        Body.setVelocity(state.bird, { x: -dx * 0.15, y: -dy * 0.15 });
        Composite.add(engine.world, state.bird);
        state.burstUsed = false;
        state.ammo--; state.flying = true; state.shotAge = 0; state.quiet = 0;
      }
    },
    update(dt) {
      if (state.over) return;
      accumulator = Math.min(accumulator + Math.max(0, dt), STEP * 3);
      for (let i = 0; i < 3 && accumulator >= STEP; i++) { accumulator -= STEP; tick(); if (state.over) break; }
    },
    draw(ctx) {
      drawSpace(ctx, state.t);
      ctx.save();
      if (state.shake > 0) ctx.translate(Math.sin(state.t * 91) * 3, Math.cos(state.t * 79) * 2);
      ctx.fillStyle = "#443354"; ctx.fillRect(view.x0, FLOOR, view.x1 - view.x0, Math.max(0, view.y1 - FLOOR));
      ctx.fillStyle = "#a9d190"; ctx.fillRect(view.x0, FLOOR, view.x1 - view.x0, 5);
      for (const b of state.pieces) drawPiece(ctx, b);
      const dx = state.drag?.dx || 0, dy = state.drag?.dy || 0;
      const bx = SLING.x + dx * 0.3, by = SLING.y + dy * 0.3;
      ctx.lineCap = "round";
      for (const x of [32, 64]) {
        ctx.strokeStyle = "#eac189"; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x, 583); ctx.lineTo(x, 459); ctx.stroke();
        ctx.strokeStyle = "#db80b6"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 469); ctx.lineTo(bx, by); ctx.stroke();
      }
      if (!state.flying && !state.clearWait) drawMascot(ctx, bx, by, 20, costume, { t: state.t });
      if (state.bird) drawMascot(ctx, state.bird.position.x, state.bird.position.y, 20, costume, { t: state.t, tilt: state.bird.angle });
      if (state.drag) {
        // 最初の約0.4秒だけ。実際と同じ重力・空気抵抗の簡易予測。
        let x = SLING.x, y = SLING.y, vx = -dx * 0.15, vy = -dy * 0.15;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        for (let i = 0; i < 24; i++) {
          vx *= 0.99; vy = vy * 0.99 + engine.gravity.y * engine.gravity.scale * (STEP * 1000) ** 2;
          x += vx; y += vy;
          if (i % 4 === 0) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      for (const p of state.particles) { ctx.globalAlpha = p.life / 0.65; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;
      for (const e of state.rings) {
        ctx.globalAlpha = 1 - e.age / 0.45;
        ctx.strokeStyle = COLORS.beak; ctx.lineWidth = 6 * ctx.globalAlpha;
        ctx.beginPath(); ctx.arc(e.x, e.y, 78 * e.age / 0.45, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const e of state.dizzy) {
        ctx.save(); ctx.translate(e.x, e.y - e.age * 25); ctx.rotate(e.age * 5);
        ctx.globalAlpha = 1 - e.age / 0.8;
        drawPiece(ctx, { position: { x: 0, y: 0 }, angle: 0, plugin: { shot: { kind: "ufo", w: 18 } } });
        ctx.strokeStyle = "#382b41"; ctx.lineWidth = 1.5;
        for (const x of [-6, 6]) { ctx.beginPath(); for (let a = 0; a < 12; a += 0.25) ctx.lineTo(x + Math.cos(a) * a / 4, -3 + Math.sin(a) * a / 4); ctx.stroke(); }
        ctx.restore();
      }
      pop.draw(ctx);
      ctx.restore();
      drawHud(ctx, `${state.score.toLocaleString()}点`, `ステージ${state.stageIndex % STAGES.length + 1}`);
      ctx.font = `700 17px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = "#fff";
      ctx.fillText(`のこり弾 ${state.ammo} / 3`, 14, 52);
      ctx.font = `700 15px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText(state.flying ? state.burstUsed ? "どかーん！" : "タップで どかーん！" : state.clearWait ? "つぎの砦へ！" : "どこでも 引っぱって はなそう", W / 2, 620);
      if (state.banner.age < 2) {
        ctx.globalAlpha = Math.min(1, (2 - state.banner.age) * 2);
        ctx.fillStyle = "rgba(42,31,92,0.8)"; ctx.fillRect(view.x0, 137, view.x1 - view.x0, 50);
        ctx.fillStyle = "#fff"; ctx.font = `900 23px ${FONT}`; ctx.textBaseline = "middle";
        ctx.fillText(state.banner.text, W / 2, 162, W - 20); ctx.globalAlpha = 1;
      }
    },
  };
}

function drawPiece(ctx, body) {
  const { kind, w, h, hp, maxHp } = body.plugin.shot;
  ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
  ctx.fillStyle = TYPES[kind].color; ctx.strokeStyle = "#382b41"; ctx.lineWidth = 1.5;
  if (kind === "ufo") {
    ctx.scale(w / 13, w / 13);
    ctx.fillStyle = COLORS.cyan; ctx.beginPath(); ctx.ellipse(0, -1, 8, 8, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = TYPES.ufo.color; ctx.beginPath(); ctx.ellipse(0, 6, 15, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.beak;
    for (const x of [-9, 0, 9]) { ctx.beginPath(); ctx.arc(x, 6, 1.8, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === "tsukune") {
    ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#62331d"; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(5, -6); ctx.moveTo(-4, 5); ctx.lineTo(7, 3); ctx.stroke();
  } else {
    ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
    if (kind === "negima") {
      ctx.strokeStyle = "#edc78f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w / 2 - 4, 0); ctx.lineTo(w / 2 + 4, 0); ctx.stroke();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? "#a6cf7a" : "#c67a43"; ctx.fillRect(-w / 2 + i * w / 5 + 2, -h / 2 + 2, w / 5 - 4, h - 4); }
    } else if (kind === "mesh" || kind === "grill") {
      ctx.strokeStyle = "#566679"; ctx.lineWidth = 1;
      for (let x = -w / 2 + 5; x < w / 2; x += 7) { ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x + 4, h / 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    } else if (kind === "ember") {
      ctx.shadowColor = "#ff5d32"; ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffb55a"; ctx.fillRect(-w / 3, -h / 3, w / 3, h / 2);
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = "#77717c"; ctx.beginPath(); ctx.moveTo(-w / 3, -h / 3); ctx.lineTo(0, 0); ctx.lineTo(-4, h / 3); ctx.moveTo(0, 0); ctx.lineTo(w / 3, -h / 5); ctx.stroke();
    }
  }
  if (kind !== "ufo" && hp < maxHp / 2) {
    ctx.strokeStyle = "#382b41"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w / 3, -5); ctx.lineTo(0, 2); ctx.lineTo(-3, 8); ctx.lineTo(w / 3, 12); ctx.stroke();
  }
  ctx.restore();
}
