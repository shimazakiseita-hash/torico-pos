// とりこショット：8つの砦を順にクリアして★を集めるステージ制ゲーム。
import { COLORS, FONT, Popups, W, drawHud, drawMascot, view } from "./common.js";

export const META = {
  id: "shot", mode: "map", title: "とりこショット",
  howto: "とりこを 引っぱって はなすと とぶよ。砦を くずして UFOの 手下を ぜんぶ たおせば クリア！とんでいる とちゅうで タップすると どかーん！",
};
const STEP = 1 / 60;
// 半分の距離で従来と同じ最大速度・見た目の引き幅にする。
const MAX_PULL = 45;
const SHOT_SPEED = 0.3;
const PULL_DISPLAY = 0.6;
const FLOOR = 590;
const SLING = { x: 48, y: 475 };
const TYPES = {
  negima: { hp: 24, density: 0.002, color: "#d79b58" },
  tsukune: { hp: 12, density: 0.001, color: "#a55a32" },
  coal: { hp: 65, density: 0.004, color: "#403c48" },
  mesh: { hp: 10, density: 0.0007, color: "#b8c6d4" },
  ember: { hp: 12, density: 0.002, color: "#ef6241" },
  grill: { hp: Infinity, density: 0.002, color: "#8999ae" },
  ufo: { hp: 28, density: 0.001, color: "#bba1d3" },
};

// 配置と重さを保ち、1〜3面は耐久値を下げて練習しやすくする。
// 7面は囲いを固くしつつ手下を弱め、上下を連鎖で倒す1発を残す。
const STAGE_DURABILITY = [
  { structure: 0.75, ufo: 0.5 },
  { structure: 1.4, ufo: 0.8 },
  { structure: 1.2, ufo: 0.9 },
  { structure: 5, ufo: 1.2 },
  { structure: 2, ufo: 1.2 },
  { structure: 4, ufo: 0.7 },
  { structure: 4, ufo: 0.3 },
  { structure: 2, coal: 4, mesh: 1, ufo: 0.6 },
];

// [種類, 中心x, 中心y, 幅（円は半径）, 高さ, 角度]。焼き台は固定物。
const STAGES = [
  // 低い砦：左の串を抜き、焼き網と手下の台座を崩す。
  [["negima",190,528,20,124],["coal",310,528,20,124],["mesh",250,458,140,16],["negima",250,570,70,40],["ufo",250,532,18]],
  // 高い塔：中段の焼き網を狙い、二重の屋根を落とす。
  [["coal",220,530,22,120],["coal",300,530,22,120],["mesh",260,462,102,16],["ufo",260,572,18],["coal",220,433,22,42],["coal",300,433,22,42],["negima",260,404,102,16]],
  // 宙の焼き台：左の壁を抜くか、上から屋根へ。
  [["grill",265,465,150,16],["negima",210,417,22,80],["coal",320,417,22,80],["mesh",265,369,132,16],["ufo",265,439,18]],
  // ひの炭：壁際の火種から屋根下へ連鎖。
  [["coal",200,550,30,80],["coal",320,550,24,80],["negima",260,502,144,16],["ember",229,572,32,36],["ember",261,572,32,36],["ufo",295,574,16]],
  // 坂のつくね：坂の留め具を外して、下の砦へ転がす。
  [["grill",215,410,130,16,0.12],["negima",213,389.7,18,24,0.12],["tsukune",182.5,375.1,23],["coal",230,550,24,80],["coal",326,550,24,80],["mesh",278,502,120,16],["ufo",278,572,18],["ember",250,480,28,28]],
  // 固い守り：左下の火種と串の仕切りが入口。
  [["coal",210,535,36,110],["coal",320,535,28,110],["coal",265,472,138,16],["negima",262,572,18,36],["ember",240,572,18,36],["ufo",285,572,18]],
  // 高低二か所：二つの囲い。上の火種と下の台座を狙う。
  [["grill",264,390,146,16],["negima",205,354,20,56],["coal",323,354,20,56],["mesh",264,318,138,16],["ufo",285,292,18],["ember",240,364,36,36],["negima",233,555,100,70],["ufo",233,502,18],["coal",205,284,20,52],["coal",323,284,20,52],["negima",264,250,138,16],["coal",173,534,20,112],["coal",293,534,20,112],["mesh",233,470,140,16]],
  // 全部入り：前壁、宙の焼き網、上下の火種。右の支えを下段と共有。
  [["coal",206,550,32,80],["coal",314,550,32,80],["mesh",260,502,140,16],["ufo",260,536,18],["ember",260,572,36,36],["grill",220,416,100,16],["negima",235,355,40,74],["coal",317,355,24,74],["mesh",276,310,82,16],["ufo",280,338,18],["ember",280,374,36,36],["coal",317,451,24,86],["mesh",280,400,120,16],["coal",155,520,24,140]],
];

export function createGame({ costume, stage = 0 }) {
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = window.Matter;
  const pop = new Popups();
  const engine = Engine.create({ enableSleeping: true });
  const state = { over: false, result: null, t: 0, stageIndex: Number.isInteger(stage) && stage >= 0 && stage < 8 ? stage : 0, ammo: 3, age: 0,
    flying: false, shotAge: 0, quiet: 0, clearWait: 0, pieces: [], bird: null,
    drag: null, particles: [], rings: [], dizzy: [], shake: 0, burstUsed: false, banner: { text: "", age: 0 } };
  const background = festivalBackground(state.stageIndex);
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
    for (const [kind, x, y, w, h, angle = 0] of STAGES[state.stageIndex]) {
      const spec = TYPES[kind];
      const durability = STAGE_DURABILITY[state.stageIndex];
      const hp = spec.hp * (durability[kind] ?? durability.structure);
      const opts = { isStatic: kind === "grill", angle, density: spec.density, friction: kind === "tsukune" ? 0.12 : 0.9, frictionStatic: 5, restitution: 0.06, frictionAir: 0.006 };
      // 手下は底を平らにして、わずかな傾きで勝手に転がるのを防ぐ。
      const body = kind === "ufo" ? Bodies.rectangle(x, y, w * 2, w * 2, { ...opts, chamfer: { radius: 7 } }) : h ? Bodies.rectangle(x, y, w, h, opts) : Bodies.circle(x, y, w, opts);
      body.plugin.shot = { kind, w, h, maxHp: hp, hp };
      state.pieces.push(body);
      Composite.add(engine.world, body);
    }
    state.banner = { text: `${state.stageIndex + 1}`, age: 0 };
  }
  // collisionStart は速度解決より前。相対速度と換算質量で衝撃を見積もる。
  Events.on(engine, "collisionStart", ({ pairs }) => {
    if (state.age < 1 || !state.flying || state.clearWait > 0) return;
    for (const { bodyA: a, bodyB: b } of pairs) {
      const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (speed < 3.1) continue;
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
      if (distance > 52) continue;
      const k = 1 - distance / 62;
      Sleeping.set(body, false);
      Body.setVelocity(body, { x: body.velocity.x + dx / (distance || 1) * 5.5 * k,
        y: body.velocity.y + dy / (distance || 1) * 5.5 * k - 2 * k });
      body.plugin.shot.hp -= 26 * k;
    }
  }
  function destroy(body) {
    const data = body.plugin.shot;
    if (body.isStatic || !state.pieces.includes(body)) return;
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
    const factor = Math.min(1, MAX_PULL / (Math.hypot(dx, dy) || 1));
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
      if (state.clearWait <= 0) state.over = true;
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
      state.result = { cleared: true, stars: state.ammo + 1, stage: state.stageIndex };
      state.clearWait = 1.2; state.drag = null;
      state.banner = { text: "★".repeat(state.ammo + 1) + "☆".repeat(2 - state.ammo), age: 0 };
    } else if (state.quiet >= 0.45 || state.shotAge >= 7) {
      if (state.bird) Composite.remove(engine.world, state.bird);
      state.bird = null; state.flying = false;
      if (state.ammo === 0) {
        state.result = { cleared: false, stars: 0, stage: state.stageIndex };
        state.over = true;
      }
    }
  }
  startStage();
  return {
    state,
    get result() { return state.result; }, get over() { return state.over; },
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
        if (Math.hypot(dx, dy) < 4) return;
        state.bird = Bodies.circle(SLING.x, SLING.y, 16, { density: 0.008, restitution: 0.25, friction: 0.6 });
        Body.setVelocity(state.bird, { x: -dx * SHOT_SPEED, y: -dy * SHOT_SPEED });
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
      background(ctx, state.t);
      ctx.save();
      if (state.shake > 0) ctx.translate(Math.sin(state.t * 91) * 3, Math.cos(state.t * 79) * 2);
      for (const b of state.pieces) drawPiece(ctx, b);
      const dx = state.drag?.dx || 0, dy = state.drag?.dy || 0;
      const bx = SLING.x + dx * PULL_DISPLAY, by = SLING.y + dy * PULL_DISPLAY;
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
        let x = SLING.x, y = SLING.y, vx = -dx * SHOT_SPEED, vy = -dy * SHOT_SPEED;
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
      drawHud(ctx, `${state.stageIndex + 1} / 8`, "");
      ctx.font = `700 17px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = "#fff";
      for (let i = 0; i < state.ammo; i++) {
        const x = 24 + i * 27;
        ctx.fillStyle = "#fff0cf"; ctx.beginPath(); ctx.arc(x, 59, 10, 0, Math.PI * 2); ctx.fill();
        drawMascot(ctx, x, 59, 8, costume);
      }
      ctx.font = `700 15px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText(state.flying ? state.burstUsed ? "どかーん！" : "タップで どかーん！" : state.clearWait ? "クリア！" : "どこでも 引っぱって はなそう", W / 2, 620);
      if (state.banner.age < 2) {
        ctx.globalAlpha = Math.min(1, (2 - state.banner.age) * 2);
        ctx.fillStyle = "rgba(42,31,92,0.8)"; ctx.fillRect(view.x0, 137, view.x1 - view.x0, 50);
        ctx.fillStyle = "#fff"; ctx.font = `900 36px ${FONT}`; ctx.textBaseline = "middle";
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

// 静止した縁日は表示範囲が変わったときだけ描き直し、煙だけを動かす。
function festivalBackground(stage) {
  let cache, bounds = "";
  return (ctx, t) => {
    const { x0, y0, x1, y1 } = view;
    const width = x1 - x0, height = y1 - y0;
    const key = [x0, y0, x1, y1].join();
    if (key !== bounds) {
      bounds = key;
      cache = document.createElement("canvas");
      cache.width = Math.ceil(width); cache.height = Math.ceil(height);
      const c = cache.getContext("2d");
      c.translate(-x0, -y0);
      const night = stage / 7;
      const sky = c.createLinearGradient(0, y0, 0, FLOOR);
      sky.addColorStop(0, `hsl(${235 - night * 8} 38% ${23 - night * 14}%)`);
      sky.addColorStop(0.65, `hsl(${270 - night * 20} 25% ${29 - night * 13}%)`);
      sky.addColorStop(1, `hsl(${335 - night * 65} 28% ${35 - night * 17}%)`);
      c.fillStyle = sky; c.fillRect(x0, y0, width, height);
      for (let i = 0; i < 65; i++) {
        const x = x0 + ((i * 97.31) % width), y = y0 + ((i * 53.79) % Math.max(1, 410 - y0));
        c.fillStyle = `rgba(245,228,204,${0.22 + (i % 4) * 0.1})`;
        c.beginPath(); c.arc(x, y, i % 7 === 0 ? 1.3 : .7, 0, Math.PI * 2); c.fill();
      }
      const mx = x0 + width * .76, my = y0 + (FLOOR - y0) * .22;
      const glow = c.createRadialGradient(mx, my, 10, mx, my, 66);
      glow.addColorStop(0, "#ead9b41f"); glow.addColorStop(1, "#ead9b400");
      c.fillStyle = glow; c.fillRect(mx - 66, my - 66, 132, 132);
      c.fillStyle = "#d9ceac"; c.beginPath(); c.arc(mx, my, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#bdbaa333";
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(mx - 12 + i * 7, my + Math.sin(i * 3) * 12, 3 + i % 3, 0, Math.PI * 2); c.fill(); }
      for (let layer = 0; layer < 2; layer++) {
        c.fillStyle = layer ? "#20283b" : "#303048";
        c.beginPath(); c.moveTo(x0, FLOOR);
        for (let x = x0; x <= x1 + 20; x += 20) c.lineTo(x, 395 + layer * 52 + Math.sin(x * .017 + layer * 2) * 32 + Math.cos(x * .037) * 15);
        c.lineTo(x1, FLOOR); c.closePath(); c.fill();
      }
      for (let x = Math.floor(x0 / 84) * 84; x < x1; x += 84) {
        const roof = 496 + Math.sin(x) * 9;
        c.fillStyle = "#1d2534"; c.fillRect(x + 6, roof, 69, FLOOR - roof);
        c.fillStyle = "#393044"; c.beginPath(); c.moveTo(x, roof); c.lineTo(x + 13, roof - 20); c.lineTo(x + 68, roof - 20); c.lineTo(x + 81, roof); c.closePath(); c.fill();
        c.fillStyle = "#785143"; c.fillRect(x + 13, roof + 12, 55, 28);
        c.fillStyle = "#302c38"; c.fillRect(x + 10, roof + 38, 61, 6);
        for (let j = 0; j < 3; j++) {
          const lx = x + 18 + j * 23;
          const lamp = c.createRadialGradient(lx, roof + 6, 0, lx, roof + 6, 19);
          lamp.addColorStop(0, "#d7875c40"); lamp.addColorStop(1, "#d7875c00");
          c.fillStyle = lamp; c.fillRect(lx - 19, roof - 13, 38, 38);
          c.fillStyle = j % 2 ? "#ac666b" : "#b86c52";
          c.beginPath(); c.ellipse(lx, roof + 5, 4, 6, 0, 0, Math.PI * 2); c.fill();
        }
      }
      c.fillStyle = "#38302e"; c.fillRect(x0, FLOOR, width, Math.max(0, y1 - FLOOR));
      c.fillStyle = "#536044"; c.beginPath(); c.moveTo(x0, FLOOR + 5);
      for (let x = x0; x <= x1 + 5; x += 5) { c.lineTo(x, FLOOR - 2 - (Math.sin(x * 7) + 1) * 3); c.lineTo(x + 2, FLOOR + 3); }
      c.lineTo(x1, FLOOR + 8); c.lineTo(x0, FLOOR + 8); c.fill();
      c.fillStyle = "#89745a55";
      for (let i = 0; i < width * Math.max(0, y1 - FLOOR) / 200; i++) {
        const x = x0 + (i * 61.7) % width, y = FLOOR + 12 + (i * 37.3) % Math.max(1, y1 - FLOOR - 12);
        c.beginPath(); c.ellipse(x, y, 1.6, .8, i, 0, Math.PI * 2); c.fill();
      }
    }
    ctx.save(); ctx.drawImage(cache, x0, y0, width, height);
    ctx.strokeStyle = "#c1b6ba16"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (let x = Math.floor(x0 / 84) * 84 + 40; x < x1; x += 84) {
      ctx.beginPath();
      for (let j = 0; j < 18; j++) {
        const y = 477 - j * 4;
        const sx = x + Math.sin(t * .8 + j * .35 + x) * (3 + j * .5);
        if (!j) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  };
}
