// とりこショット：串のパチンコで材料の砦をくずす TORI♡CO オリジナルゲーム。
// 得点上限（src/lib/ranking.ts）：各面は材料最大16個・UFO最大4体。
// 最大 16×10+4×100+300+2×200 = 1260点（最低1発必要）。
// 最初の1秒は発射・ダメージなし、発射後最低1.5秒でクリア確定 → 最短2.5秒。
// 1260/2.5 = 504点/秒、上限650は1.28倍以上。次面までさらに2秒待つ。
// 途中の材料・UFO得点も開始1秒以降、最大560点なので650点/秒以内。
// 固定刻みのゲーム時間だけ進める。休止・遅い端末で実時間より速くならない。
import { COLORS, FONT, W, drawHud, drawMascot, drawSpace, view } from "./common.js";

export const META = {
  id: "shot", title: "とりこショット",
  howto: "とりこを 引っぱって はなすと とんでいくよ。砦を くずして はらぺこUFOの 手下を ぜんぶ たおそう！ 1ステージ 3発まで",
  pointRate: 0.15,
};
const STEP = 1 / 60;
const FLOOR = 590;
const SLING = { x: 62, y: 510 };
const TYPES = {
  negima: { hp: 24, density: 0.002, color: "#d79b58" },
  tsukune: { hp: 12, density: 0.001, color: "#a55a32" },
  coal: { hp: 65, density: 0.004, color: "#403c48" },
  mesh: { hp: 10, density: 0.0007, color: "#b8c6d4" },
  ufo: { hp: 13, density: 0.001, color: "#bba1d3" },
};
// [種類, 中心x, 中心y, 幅（円は半径）, 高さ]。地面に接して安定する手作り6面。
const STAGES = [
  [["negima",250,575,80,30],["ufo",250,547,13]],
  [["negima",225,555,18,70],["negima",295,555,18,70],["mesh",260,515,100,10],["ufo",239,497,13],["ufo",281,497,13]],
  [["coal",248,575,30,30],["tsukune",292,575,15],["negima",270,553,100,14],["negima",240,521,16,50],["negima",300,521,16,50],["mesh",270,491,100,10],["ufo",250,473,13],["ufo",290,473,13]],
  [["negima",210,555,18,70],["negima",280,555,18,70],["mesh",245,515,100,10],["tsukune",220,496,14],["coal",272,497,26,26],["negima",245,477,96,14],["ufo",225,457,13],["ufo",268,457,13],["ufo",325,577,13]],
  [["coal",225,575,30,30],["coal",300,575,30,30],["negima",262,553,110,14],["negima",220,516,16,60],["negima",302,516,16,60],["mesh",261,481,110,10],["ufo",235,463,13],["ufo",286,463,13],["tsukune",261,462,14],["mesh",261,443,100,10],["ufo",261,425,13]],
  [["coal",205,575,30,30],["coal",305,575,30,30],["negima",255,553,134,14],["ufo",255,533,13],["negima",205,516,18,60],["negima",305,516,18,60],["mesh",255,481,134,10],["ufo",225,463,13],["ufo",285,463,13],["tsukune",255,462,14],["negima",255,441,100,14],["ufo",255,421,13]],
];

export function createGame({ costume }) {
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = window.Matter;
  const engine = Engine.create({ enableSleeping: true });
  const state = { score: 0, over: false, t: 0, stageIndex: 0, ammo: 3, age: 0,
    flying: false, shotAge: 0, quiet: 0, clearWait: 0, pieces: [], bird: null,
    drag: null, particles: [], banner: { text: "", age: 0 } };
  let accumulator = 0;
  const pending = new Map();
  function startStage() {
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    pending.clear();
    Object.assign(state, { age: 0, ammo: 3, flying: false, shotAge: 0, quiet: 0,
      clearWait: 0, pieces: [], bird: null, drag: null });
    // 地面は画面より広い。画面外の動的ボディは下の固定境界で回収。
    Composite.add(engine.world, Bodies.rectangle(180, FLOOR + 30, 2400, 60, { isStatic: true, friction: 0.7 }));
    const lap = Math.floor(state.stageIndex / STAGES.length);
    for (const [kind, x, y, w, h] of STAGES[state.stageIndex % STAGES.length]) {
      const spec = TYPES[kind];
      const opts = { density: spec.density, friction: kind === "tsukune" ? 0.12 : 0.6, restitution: 0.06, frictionAir: 0.006 };
      const body = h ? Bodies.rectangle(x, y, w, h, opts) : Bodies.circle(x, y, w, opts);
      body.plugin.shot = { kind, w, h, hp: spec.hp * (kind === "ufo" ? 1 + lap * 0.15 : 1) };
      state.pieces.push(body);
      Composite.add(engine.world, body);
    }
    state.banner = { text: `${lap ? `${lap + 1}しゅうめ ` : ""}ステージ${state.stageIndex % 6 + 1}`, age: 0 };
  }
  // collisionStart は速度解決より前。相対速度と換算質量で衝撃を見積もる。
  Events.on(engine, "collisionStart", ({ pairs }) => {
    if (state.age < 1 || !state.flying || state.clearWait > 0) return;
    for (const { bodyA: a, bodyB: b } of pairs) {
      const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (speed < 2.4) continue;
      const mass = a.isStatic ? b.mass : b.isStatic ? a.mass : a.mass * b.mass / (a.mass + b.mass);
      const damage = speed * speed * Math.max(0.3, mass) * 0.7;
      for (const body of [a, b]) if (body.plugin.shot) pending.set(body, (pending.get(body) || 0) + damage);
    }
  });
  function destroy(body) {
    const data = body.plugin.shot;
    if (!state.pieces.includes(body)) return;
    state.score += data.kind === "ufo" ? 100 : 10;
    state.pieces = state.pieces.filter((p) => p !== body);
    Composite.remove(engine.world, body);
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
    for (const body of [...state.pieces]) {
      const { x, y } = body.position;
      if (state.age >= 1 && state.flying && (body.plugin.shot.hp <= 0 || x < -60 || x > W + 60 || y > 700)) destroy(body);
    }
    if (!state.flying) return;
    state.shotAge += STEP;
    const moving = [...state.pieces, state.bird].filter(Boolean).some((b) => !b.isSleeping && (b.speed > 0.22 || b.angularSpeed > 0.025) && b.position.y < 700 && b.position.x > -60 && b.position.x < W + 60);
    state.quiet = moving ? 0 : state.quiet + STEP;
    if (state.shotAge < 1.5) return;
    if (!state.pieces.some((b) => b.plugin.shot.kind === "ufo")) {
      state.score += 300 + state.ammo * 200;
      state.clearWait = 2; state.drag = null;
      state.banner = { text: `クリア！ +${300 + state.ammo * 200}`, age: 0 };
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
      if (state.over || state.flying || state.clearWait > 0 || state.age < 1) return;
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
      ctx.fillStyle = "#443354"; ctx.fillRect(view.x0, FLOOR, view.x1 - view.x0, Math.max(0, view.y1 - FLOOR));
      ctx.fillStyle = "#a9d190"; ctx.fillRect(view.x0, FLOOR, view.x1 - view.x0, 5);
      for (const b of state.pieces) drawPiece(ctx, b);
      const dx = state.drag?.dx || 0, dy = state.drag?.dy || 0;
      const bx = SLING.x + dx * 0.3, by = SLING.y + dy * 0.3;
      ctx.lineCap = "round";
      for (const x of [46, 78]) {
        ctx.strokeStyle = "#eac189"; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x, 583); ctx.lineTo(x, 494); ctx.stroke();
        ctx.strokeStyle = "#db80b6"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 504); ctx.lineTo(bx, by); ctx.stroke();
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
      drawHud(ctx, `${state.score.toLocaleString()}点`, `ステージ${state.stageIndex % 6 + 1}`);
      ctx.font = `700 17px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = "#fff";
      ctx.fillText(`のこり弾 ${state.ammo} / 3`, 14, 52);
      ctx.font = `700 15px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText(state.flying ? "とりこ がんばれ！" : state.clearWait ? "つぎの砦へ！" : "どこでも 引っぱって はなそう", W / 2, 620);
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
  const { kind, w, h } = body.plugin.shot;
  ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
  ctx.fillStyle = TYPES[kind].color; ctx.strokeStyle = "#382b41"; ctx.lineWidth = 1.5;
  if (kind === "ufo") {
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
    } else if (kind === "mesh") {
      ctx.strokeStyle = "#566679"; ctx.lineWidth = 1;
      for (let x = -w / 2 + 5; x < w / 2; x += 7) { ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x + 4, h / 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    } else {
      ctx.strokeStyle = "#77717c"; ctx.beginPath(); ctx.moveTo(-w / 3, -h / 3); ctx.lineTo(0, 0); ctx.lineTo(-4, h / 3); ctx.moveTo(0, 0); ctx.lineTo(w / 3, -h / 5); ctx.stroke();
    }
  }
  ctx.restore();
}
