// とりこショット：20の砦を順にクリアして★を集めるステージ制ゲーム。
import { COLORS, FONT, Popups, W, STAGE_COUNT, drawHud, drawMascot, drawSkewer, star, view } from "./common.js";

export { STAGE_COUNT } from "./common.js";

export const META = {
  id: "shot", mode: "map", title: "とりこショット",
  howto: "とりこを 引っぱって はなすと とぶよ。砦を くずして UFOの 手下を ぜんぶ たおせば クリア！とんでいる とちゅうで タップすると えらんだ わざが つかえるよ！",
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
  boss: { hp: 380, density: 0.001, color: "#763c9c" },
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
  { structure: 3, ufo: 0.6 },
  { structure: 4, ufo: 1 },
  { structure: 5, ufo: 2.25 },
  { structure: 3, ufo: 0.8 },
  { structure: 2, ufo: 0.6 },
  { structure: 0.7, ufo: 0.6 },
  { structure: 4, ufo: 1 },
  { structure: 1, ufo: 0.6 },
  { structure: 0.1, ufo: 0.05 },
  { structure: 3, ufo: 3 },
  { structure: 4, ufo: 2.5 },
  { structure: 1, ufo: 0.2, boss: 1 },
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
  // 双塔：高さの違う屋根を崩す。
  [["coal",165,535,20,110],["negima",235,535,20,110],["mesh",200,472,90,16],["ufo",200,536,18],["ember",200,572,36,36],["coal",275,505,20,170],["negima",345,505,20,170],["mesh",310,412,90,16],["ufo",310,536,18],["ember",310,572,36,36]],
  // 三段の宙砦：上下に狙いを切り替える。
  [["grill",205,578,90,16],["coal",170,525,20,90],["negima",240,525,20,90],["mesh",205,472,90,16],["ufo",205,516,18],["ember",205,552,36,36],["grill",310,488,90,16],["coal",275,435,20,90],["negima",345,435,20,90],["mesh",310,382,90,16],["ufo",310,426,18],["ember",310,462,36,36],["grill",230,330,100,16]],
  // 火種の回廊：長い連鎖で両端を崩す。
  [["coal",165,535,20,110],["coal",345,535,20,110],["mesh",255,472,200,16],["ufo",215,536,18],["ufo",295,536,18],["ember",215,572,36,36],["ember",255,572,36,36],["ember",295,572,36,36]],
  // 坂のつくね：留め具を抜いて下の砦へ。
  [["coal",165,545,20,90],["negima",235,545,20,90],["mesh",200,492,90,16],["ufo",200,536,18],["ember",200,572,36,36],["coal",265,545,20,90],["negima",335,545,20,90],["mesh",300,492,90,16],["ufo",300,536,18],["ember",300,572,36,36],["grill",185,390,130,16,0.12],["negima",183,369.7,18,24,0.12],["tsukune",152.5,355.1,23]],
  // 炭の箱：厚い屋根と横の入口。
  [["coal",140,535,20,110],["negima",230,535,20,110],["coal",185,472,110,16],["ufo",185,536,18],["ember",185,572,36,36],["coal",265,545,20,90],["negima",335,545,20,90],["coal",300,492,90,16],["ufo",300,536,18],["ember",300,572,36,36]],
  // 三方向の守り：分身で広く攻める。
  [["coal",135,545,20,90],["negima",195,545,20,90],["mesh",165,492,80,16],["ember",165,572,36,36],["coal",275,545,20,90],["negima",335,545,20,90],["mesh",305,492,80,16],["ufo",305,536,18],["ember",305,572,36,36],["grill",235,470,110,16],["coal",190,417,20,90],["negima",280,417,20,90],["mesh",235,364,110,16],["ufo",235,408,18],["ember",235,444,36,36]],
  // 二重屋根：重い落下で支えを崩す。
  [["coal",145,525,20,130],["negima",225,525,20,130],["coal",185,452,100,16],["ufo",185,536,18],["ember",185,572,36,36],["coal",255,525,20,130],["negima",335,525,20,130],["coal",295,452,100,16],["ufo",295,536,18],["ember",295,572,36,36],["coal",185,436,100,16],["coal",295,436,100,16]],
  // 奥の砦：前壁を加速で突破する。
  [["coal",165,535,20,110],["negima",245,535,20,110],["coal",205,472,100,16],["ufo",205,536,18],["ember",205,572,36,36],["grill",290,408,110,16],["coal",245,355,20,90],["negima",335,355,20,90],["mesh",290,302,110,16],["ufo",290,346,18],["ember",290,382,36,36],["coal",125,515,28,150]],
  // 三本の細塔：高さを変えた串と網を順に倒す。
  [["coal",126.0,538.0,16,104],["negima",174.0,538.0,16,104],["mesh",150,478,64,16],["ufo",150,536,16],["ember",150,572,32,36],["coal",206.0,524.0,16,132],["negima",254.0,524.0,16,132],["mesh",230,450,64,16],["ufo",230,536,16],["ember",230,572,32,36],["coal",286.0,546.0,16,88],["negima",334.0,546.0,16,88],["mesh",310,494,64,16],["ufo",310,536,16],["ember",310,572,32,36]],
  // 二段の火砦：下の火種から上の囲いへ連鎖。
  [["coal",151.0,545.0,16,90],["negima",231.0,545.0,16,90],["mesh",191,492,96,16],["ufo",191,536,16],["ember",191,572,32,36],["grill",292,448,100,16],["coal",252.0,395.0,16,90],["negima",332.0,395.0,16,90],["mesh",292,342,96,16],["ufo",292,386,16],["ember",292,422,32,36]],
  // 焼き台のはざま：二つの固定網の間へ撃ち込む。
  [["coal",138.0,545.0,16,90],["negima",222.0,545.0,16,90],["mesh",180,492,100,16],["ufo",180,536,16],["ember",180,572,32,36],["grill",290,438,108,16],["grill",290,318,108,16],["coal",247,382,18,96],["negima",333,382,18,96],["ufo",290,392,18],["ember",290,420,36,20]],
  // 親玉と二つの小砦。
  [["boss",275,420,34],["coal",190,550,16,80],["negima",250,550,16,80],["mesh",220,502,76,16],["ufo",220,572,18],["ember",220,536,28,36],["grill",320,570,70,16],["ufo",320,544,18]],
];

export const SKILLS = [
  { id: "boom", name: "どかーん", color: "#ffbf69", stage: -1 },
  { id: "dash", name: "ぎゅーん", color: "#79e2ee", stage: 1 },
  { id: "drop", name: "ずしーん", color: "#c5afff", stage: 3 },
  { id: "split", name: "ぶんしん", color: "#ffabd4", stage: 5 },
];
// とりこの丸い顔とくちばしを組み合わせた、技ごとの小さな紋章。
export function drawSkillIcon(ctx, id, x, y, size = 24) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const face = (x, y, r) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + r + 3, y + 2); ctx.lineTo(x + r - 1, y + 3); ctx.stroke();
  };
  if (id === "boom") {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, r = i % 2 ? 5 : 11;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
  } else if (id === "dash") {
    face(2, -1, 6);
    for (const y of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(-7, y - 1); ctx.stroke(); }
  } else if (id === "drop") {
    face(0, -6, 5);
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 10); ctx.moveTo(-4, 6); ctx.lineTo(0, 10); ctx.lineTo(4, 6); ctx.moveTo(-9, 11); ctx.lineTo(9, 11); ctx.stroke();
  } else {
    face(-7, 4, 4); face(0, -5, 4); face(7, 4, 4);
  }
  ctx.restore();
}
// モジュール内で保持し、次のステージでも選択を引き継ぐ。
let selectedSkill = "boom";
export function createGame({ costume, stage = 0, skills = ["boom"], endingOnly = false }) {
  const { Engine, Bodies, Body, Composite, Events, Sleeping } = window.Matter;
  const available = SKILLS.filter((skill) => skill.id === "boom" || skills.includes(skill.id));
  const skillButtons = available.map((skill, i) => ({ ...skill, x: W / 2 + (i - (available.length - 1) / 2) * 65, y: 612 }));
  if (!available.some((skill) => skill.id === selectedSkill)) selectedSkill = "boom";
  const pop = new Popups();
  const engine = Engine.create({ enableSleeping: true });
  const state = { over: false, result: null, t: 0, stageIndex: endingOnly ? STAGE_COUNT - 1 : Number.isInteger(stage) && stage >= 0 && stage < STAGE_COUNT ? stage : 0, ammo: 3, age: 0,
    skill: selectedSkill, birds: [], trails: [], flying: false, shotAge: 0, quiet: 0, clearWait: 0, pieces: [], bird: null,
    drag: null, particles: [], rings: [], dizzy: [], shake: 0, burstUsed: false, banner: { text: "", age: 0 } };
  const background = festivalBackground(state.stageIndex);
  let accumulator = 0;
  let idle = 0;
  let touched = false;
  const pending = new Map();
  function startStage() {
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    pending.clear();
    Object.assign(state, { age: 0, ammo: state.stageIndex === STAGE_COUNT - 1 ? 5 : 3, bossPhase: 0, bossDefeat: 0, flying: false, shotAge: 0, quiet: 0,
      birds: [], trails: [], clearWait: 0, pieces: [], bird: null, drag: null, rings: [], dizzy: [], shake: 0, burstUsed: false, particles: [] });
    pop.items = [];
    // 地面は画面より広い。画面外の動的ボディは下の固定境界で回収。
    Composite.add(engine.world, Bodies.rectangle(180, FLOOR + 30, 2400, 60, { isStatic: true, friction: 0.7 }));
    for (const [kind, x, y, w, h, angle = 0] of STAGES[state.stageIndex]) {
      const spec = TYPES[kind];
      const durability = STAGE_DURABILITY[state.stageIndex];
      const hp = spec.hp * (durability[kind] ?? durability.structure);
      const opts = { isStatic: kind === "grill" || kind === "boss", angle, density: spec.density, friction: kind === "tsukune" ? 0.12 : 0.9, frictionStatic: 5, restitution: 0.06, frictionAir: 0.006 };
      // 手下は底を平らにして、わずかな傾きで勝手に転がるのを防ぐ。
      const body = (kind === "ufo" || kind === "boss") ? Bodies.rectangle(x, y, w * 2, w * 2, { ...opts, chamfer: { radius: 7 } }) : h ? Bodies.rectangle(x, y, w, h, opts) : Bodies.circle(x, y, w, opts);
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
      for (const bird of state.birds) {
        if (bird.plugin.drop && (a === bird || b === bird)) {
          state.shake = Math.max(state.shake, 0.12);
          bird.plugin.drop = false;
        }
      }
      const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (speed < 3.1) continue;
      if (speed > 6) state.shake = Math.max(state.shake, 0.18);
      const mass = a.isStatic ? b.mass : b.isStatic ? a.mass : a.mass * b.mass / (a.mass + b.mass);
      // 加速・落下は貫通の運動量を増やし、接触ダメージの急増は抑える。
      const skillImpact = [a, b].some((body) => body.plugin.dash || body.plugin.heavy) ? 0.15 : 1;
      const damage = speed * speed * Math.max(0.3, mass) * 0.7 * skillImpact;
      for (const body of [a, b]) if (body.plugin.shot && (!body.isStatic || body.plugin.shot.kind === "boss")) pending.set(body, (pending.get(body) || 0) + damage);
    }
  });
  function explode(x, y) {
    state.shake = 0.3;
    state.rings.push({ x, y, age: 0 });
    pop.add("どかーん！", x, y - 30, COLORS.beak, 23);
    for (const body of state.pieces) {
      if (body.isStatic && body.plugin.shot.kind !== "boss") continue;
      const dx = body.position.x - x, dy = body.position.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 52) continue;
      const k = 1 - distance / 62;
      if (body.plugin.shot.kind !== "boss") {
        Sleeping.set(body, false);
        Body.setVelocity(body, { x: body.velocity.x + dx / (distance || 1) * 5.5 * k,
          y: body.velocity.y + dy / (distance || 1) * 5.5 * k - 2 * k });
      }
      body.plugin.shot.hp -= 26 * k;
    }
  }
  function activateSkill() {
    const bird = state.bird;
    if (!bird || state.burstUsed) return;
    state.burstUsed = true;
    const skill = available.find((s) => s.id === state.skill) || available[0];
    const { x, y } = bird.position;
    const { x: vx, y: vy } = bird.velocity;
    selectedSkill = skill.id;
    if (skill.id === "boom") {
      explode(x, y);
      Composite.remove(engine.world, bird);
      state.birds = []; state.bird = null;
      return;
    }
    pop.add(`${skill.name}！`, x, y - 30, skill.color, 23);
    if (skill.id === "dash") {
      const speed = Math.hypot(vx, vy);
      const boost = Math.max(8, speed * 1.8) / (speed || 1);
      Body.setDensity(bird, 0.02);
      Body.setVelocity(bird, { x: speed ? vx * boost : 8, y: vy * boost });
      bird.plugin.dash = true;
      bird.plugin.trailUntil = state.shotAge + 0.4;
    } else if (skill.id === "drop") {
      Body.setDensity(bird, 0.02);
      Body.setVelocity(bird, { x: 0, y: Math.max(10, Math.abs(vy)) });
      bird.plugin.drop = true;
      bird.plugin.heavy = true;
    } else {
      Body.scale(bird, 0.75, 0.75);
      // 羽どうしは衝突させず、砦には3羽とも当たる。
      const group = Body.nextGroup(true);
      bird.collisionFilter.group = group;
      for (const angle of [-Math.PI / 15, Math.PI / 15]) {
        const clone = Bodies.circle(x, y, 12, { density: 0.008, restitution: 0.25, friction: 0.6, collisionFilter: { group } });
        Body.setVelocity(clone, { x: vx * Math.cos(angle) - vy * Math.sin(angle), y: vx * Math.sin(angle) + vy * Math.cos(angle) });
        state.birds.push(clone);
        Composite.add(engine.world, clone);
      }
    }
  }
  function destroy(body) {
    const data = body.plugin.shot;
    if ((body.isStatic && data.kind !== "boss") || !state.pieces.includes(body)) return;
    if (data.kind === "boss") {
      state.bossDefeat = 1; state.shake = 1;
      for (let i = 0; i < 4; i++) state.rings.push({ x: body.position.x + (i - 1.5) * 14, y: body.position.y, age: -i * 0.14 });
      for (let i = 0; i < 65; i++) state.particles.push({ x: body.position.x, y: body.position.y, vx: (Math.random() - 0.5) * 340, vy: -80 - Math.random() * 250, life: 1, color: i % 2 ? "#edd263" : "#b76bdd" });
    }
    if (data.kind === "ufo") state.dizzy.push({ x: body.position.x, y: body.position.y, age: 0 });
    state.pieces = state.pieces.filter((p) => p !== body);
    Composite.remove(engine.world, body);
    if (data.kind === "ember") explode(body.position.x, body.position.y);
    for (const piece of state.pieces) Sleeping.set(piece, false);
    for (const bird of state.birds) Sleeping.set(bird, false);
    for (let i = 0; i < 7; i++) state.particles.push({ x: body.position.x, y: body.position.y,
      vx: (Math.random() - 0.5) * 110, vy: -40 - Math.random() * 100, life: 0.65, color: TYPES[data.kind].color });
  }
  function pull(x, y) {
    const dx = x - state.drag.x, dy = y - state.drag.y;
    const factor = Math.min(1, MAX_PULL / (Math.hypot(dx, dy) || 1));
    state.drag.dx = dx * factor; state.drag.dy = dy * factor;
  }
  // 演出の時計だけを進め、物理・材料・通常のエフェクトは凍結する。
  const heat = document.createElement("canvas");
  heat.width = heat.height = 160;
  const heatCtx = heat.getContext("2d");
  function startEnding() {
    if (state.over || state.ending || state.stageIndex !== STAGE_COUNT - 1) return;
    if (!endingOnly) state.result = { cleared: true, stars: Math.min(3, state.ammo + 1), stage: state.stageIndex };
    state.drag = null;
    state.clearWait = 0;
    state.ending = { age: 0 };
  }
  function drawEnding(ctx) {
    const t = state.ending.age;
    const { x0, y0, x1, y1 } = view;
    const w = x1 - x0, h = y1 - y0;
    const climb = Math.min(1, t / 1.1);
    const speed = t < 3.6 ? Math.min(1, t * 2) : Math.max(0, 1 - (t - 3.6) * 2);
    ctx.fillStyle = "#101326"; ctx.fillRect(x0, y0, w, h);
    // 既存の背景キャッシュをそのまま下へ流す（表示範囲は変えない）。
    ctx.save(); ctx.translate(0, climb * (h + 120)); background(ctx, state.t); ctx.restore();
    // 移動と逆向き（左下）へ流れる、短い光跡と遠い星。
    for (let i = 0; i < 22; i++) {
      const px = x0 + ((i * 97.31 - t * 65 * speed) % w + w) % w;
      const py = y0 + ((i * 53.79 + t * 540) % h);
      ctx.fillStyle = "#dfe8ff88";
      ctx.beginPath(); ctx.arc(px, py, .7, 0, Math.PI * 2); ctx.fill();
      if (i >= 14 || speed <= 0) continue;
      const dx = -3 * speed, dy = 15 * speed;
      const light = ctx.createLinearGradient(px, py, px - dx, py - dy);
      light.addColorStop(0, "#eff6ffbb"); light.addColorStop(1, "#dfe8ff00");
      ctx.strokeStyle = light; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - dx, py - dy); ctx.stroke();
    }
    const x = SLING.x + (W * .57 - SLING.x) * (1 - (1 - climb) ** 3);
    const y = SLING.y + (y0 + h * .31 - SLING.y) * (1 - (1 - climb) ** 3);
    ctx.save();
    if (t > 1 && t < 3.6) ctx.translate(Math.sin(t * 91) * 2, Math.cos(t * 79) * 2);
    if (t < 3.6) {
      // 最大84粒（煙16・炎54・火の粉14）。演出時計から求め、停止中は動かない。
      const intensity = Math.min(1, Math.max(0, (t - .7) / .8));
      for (let i = 0; i < 16; i++) {
        const life = (t * .55 + i * .137) % 1;
        const px = x - 20 - life * 65 + Math.sin(i * 2.4) * (10 + life * 22);
        const py = y + 35 + life * 125;
        const r = 9 + life * 26;
        const smoke = ctx.createRadialGradient(px, py, 0, px, py, r);
        smoke.addColorStop(0, `rgba(139,142,155,${intensity * (1 - life) * .22})`);
        smoke.addColorStop(1, "rgba(100,104,120,0)");
        ctx.fillStyle = smoke; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 91);
      glow.addColorStop(0, `rgba(255,190,66,${intensity * .27})`);
      glow.addColorStop(.5, `rgba(255,83,16,${intensity * .16})`);
      glow.addColorStop(1, "rgba(255,48,0,0)");
      ctx.fillStyle = glow; ctx.fillRect(x - 91, y - 91, 182, 182);
      for (let i = 0; i < 54; i++) {
        const life = (t * 1.35 + i * .137) % 1;
        const spread = Math.sin(i * 2.399) * (12 + life * 17);
        const px = x - 9 - life * 50 + spread;
        const py = y + 22 + life * 105 + Math.cos(i * 2.399) * 12;
        const r = 5 + life * 17;
        const fire = ctx.createRadialGradient(px, py, 0, px, py, r);
        fire.addColorStop(0, `rgba(255,${Math.round(245 - life * 145)},${Math.round(205 * (1 - life))},${intensity * (1 - life) * .8})`);
        fire.addColorStop(.25, `rgba(255,${Math.round(210 - life * 130)},20,${intensity * (1 - life) * .65})`);
        fire.addColorStop(.55, `rgba(255,65,5,${intensity * (1 - life) * .4})`);
        fire.addColorStop(1, "rgba(220,20,0,0)");
        ctx.fillStyle = fire; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 14; i++) {
        const life = (t * .9 + i * .173) % 1;
        ctx.globalAlpha = intensity * Math.sin(life * Math.PI);
        ctx.fillStyle = i % 2 ? "#fff9ce" : "#ffbd49";
        ctx.beginPath(); ctx.arc(x - life * 83 + Math.sin(i * 7) * 40, y + 30 + life * 155, 1 + (1 - life), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // source-atop により体ときせかえの輪郭だけを赤〜オレンジに染める。
      heatCtx.clearRect(0, 0, 160, 160);
      drawMascot(heatCtx, 80, 80, 34, costume, { t, tilt: .4 });
      heatCtx.globalCompositeOperation = "source-atop";
      const char = Math.min(1, Math.max(0, (t - 2.55) / .95));
      heatCtx.fillStyle = `rgba(${Math.round(255 - char * 168)},${Math.round(115 - char * 72)},${Math.round(20 - char * 3)},${Math.min(.82, Math.max(0, t - .8) * .3)})`;
      heatCtx.fillRect(0, 0, 160, 160);
      heatCtx.globalCompositeOperation = "source-over";
      ctx.drawImage(heat, x - 80, y - 80);
      if (t > .8) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(-1.05);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "#ffbf7066"; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, 47, -.95, .95); ctx.stroke();
        ctx.strokeStyle = "#fff9e8"; ctx.lineWidth = 2; ctx.stroke();
        ctx.globalCompositeOperation = "source-over"; ctx.restore();
      }
    } else {
      const fall = Math.min(1, (t - 3.6) / 1.4);
      const bounce = Math.sin(Math.min(1, (t - 3.6) / .65) * Math.PI) * 18 * Math.exp(-(t - 3.6) * 2);
      const sx = x + (W / 2 - x) * fall, sy = y + (y0 + h * .5 - y) * fall - bounce;
      for (let i = 0; i < 20; i++) {
        const phase = (t * .6 + i * .173) % 1;
        ctx.globalAlpha = Math.sin(phase * Math.PI);
        ctx.fillStyle = "#ffeaa0";
        star(ctx, sx + Math.cos(i * 2.4) * (65 + phase * 65), sy + Math.sin(i * 2.4) * (40 + phase * 65), 3 + phase * 4, 1.5); ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawSkewer(ctx, sx, sy, Math.PI * 2 * (1 - (1 - fall) ** 2) - .25, ["tare", "negi", "tare", "negi"], 2.8);
      ctx.strokeStyle = "#fff3df88"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let j = 0; j < 18; j++) { const px = sx - 35 + i * 30 + Math.sin(t * 3 + j * .3 + i) * 5, py = sy - 25 - j * 3; if (!j) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke();
      }
      const burst = (t - 3.6) / .4;
      if (burst < 1) {
        for (let i = 0; i < 16; i++) {
          const angle = i * 2.399;
          ctx.globalAlpha = 1 - burst;
          ctx.fillStyle = i % 3 ? "#ffc56e" : "#a45b32";
          ctx.save(); ctx.translate(x + Math.cos(angle) * (25 + burst * 110), y + Math.sin(angle) * (25 + burst * 110) + burst * burst * 35);
          ctx.rotate(angle + burst * 5); ctx.fillRect(-2, -2, 3 + (1 - burst) * 2, 3); ctx.restore();
        }
        ctx.globalAlpha = 1 - burst; ctx.strokeStyle = "#fff5d7"; ctx.lineWidth = 8 * (1 - burst);
        ctx.beginPath(); ctx.arc(x, y, 25 + burst * 135, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.globalAlpha = Math.max(0, 1 - burst * 2); ctx.fillRect(x0, y0, w, h);
      }
    }
    ctx.restore();
  }
  function drawTouch(ctx, x, y, phase) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 1.6);
    ctx.fillStyle = "#fff4d7"; ctx.strokeStyle = "#302340"; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(3, 15); ctx.lineTo(3, 2);
    ctx.quadraticCurveTo(6, -2, 9, 2);
    ctx.lineTo(9, 10); ctx.lineTo(16, 13);
    ctx.quadraticCurveTo(20, 15, 17, 23);
    ctx.lineTo(8, 23); ctx.lineTo(0, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff4d7"; ctx.lineWidth = 2;
    ctx.globalAlpha *= 1 - phase;
    ctx.beginPath(); ctx.arc(6, 1, 8 + phase * 12, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawTutorial(ctx) {
    if (state.clearWait || state.bossDefeat || state.over) return;
    ctx.save();
    if (!state.flying && !state.drag && state.ammo > 0 &&
        (state.stageIndex === 0 ? state.ammo === 3 && !touched : idle >= 6)) {
      const phase = (state.stageIndex === 0 ? state.t : idle - 6) % 2;
      if (phase < 1.5) {
        const pull = Math.min(1, phase / 1.2);
        const dx = -32 * pull, dy = 30 * pull;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = "#fff4d7"; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(SLING.x, SLING.y); ctx.lineTo(SLING.x + dx, SLING.y + dy); ctx.stroke();
        ctx.setLineDash([]);
        let x = SLING.x, y = SLING.y, vx = -dx * SHOT_SPEED, vy = -dy * SHOT_SPEED;
        ctx.fillStyle = "#fff4d7";
        for (let i = 0; i < 24; i++) {
          vx *= 0.99; vy = vy * 0.99 + engine.gravity.y * engine.gravity.scale * (STEP * 1000) ** 2;
          x += vx; y += vy;
          if (i % 4 === 0 && i < pull * 24) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
        }
        drawTouch(ctx, SLING.x + dx, SLING.y + dy, phase / 1.5);
      }
    } else if (state.stageIndex < 2 && state.flying && state.bird && !state.burstUsed) {
      const phase = state.shotAge % 1;
      const x = Math.max(view.x0 + 30, Math.min(view.x1 - 30, state.bird.position.x + 24));
      const y = Math.max(view.y0 + 90, Math.min(FLOOR - 30, state.bird.position.y + 28));
      ctx.globalAlpha = 0.45 + Math.sin(phase * Math.PI) * 0.4;
      drawTouch(ctx, x, y, phase);
    }
    ctx.restore();
  }
  function tick() {
    if (state.ending) { state.ending.age += STEP; if (state.ending.age >= 6) state.over = true; return; }
    if (!state.flying && !state.drag) idle += STEP;
    state.t += STEP; state.age += STEP; state.banner.age += STEP;
    pop.update(STEP);
    state.shake = Math.max(0, state.shake - STEP);
    for (const trail of state.trails) trail.life -= STEP;
    state.trails = state.trails.filter((trail) => trail.life > 0);
    for (const bird of state.birds) if (bird.plugin.dash && bird.speed > 2 && state.shotAge < bird.plugin.trailUntil) {
      state.trails.push({ x: bird.position.x, y: bird.position.y, life: 0.16 });
    }
    for (const effect of [...state.rings, ...state.dizzy]) effect.age += STEP;
    state.rings = state.rings.filter((e) => e.age < 0.45);
    state.dizzy = state.dizzy.filter((e) => e.age < 0.8);
    for (const p of state.particles) { p.life -= STEP; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 220 * STEP; }
    state.particles = state.particles.filter((p) => p.life > 0);
    if (state.clearWait > 0) {
      state.clearWait -= STEP;
      if (state.clearWait <= 0) {
        for (const bird of state.birds) Composite.remove(engine.world, bird);
        state.birds = []; state.bird = null; state.flying = false;
        state.over = true;
      }
      return;
    }
    state.bossDefeat = Math.max(0, state.bossDefeat - STEP);
    const boss = state.pieces.find((b) => b.plugin.shot.kind === "boss");
    if (boss) {
      const data = boss.plugin.shot, angry = data.hp < data.maxHp / 2;
      data.rage = Math.min(1, (data.rage || 0) + (angry ? STEP * 2 : 0));
      state.bossPhase += STEP * (0.7 + data.rage * 0.8);
      const next = { x: 275 + Math.sin(state.bossPhase) * (15 + data.rage * 10), y: 415 + Math.sin(state.bossPhase * 2) * (30 + data.rage * 10) };
      const velocity = { x: next.x - boss.position.x, y: next.y - boss.position.y };
      Body.setPosition(boss, next); Body.setVelocity(boss, velocity);
      data.flash = Math.max(0, (data.flash || 0) - STEP);
      data.previousHp ??= data.hp;
    }
    Engine.update(engine, STEP * 1000);
    for (const [body, damage] of pending) body.plugin.shot.hp -= damage;
    if (boss && boss.plugin.shot.hp < boss.plugin.shot.previousHp) boss.plugin.shot.flash = 0.18;
    if (boss) boss.plugin.shot.previousHp = boss.plugin.shot.hp;
    pending.clear();
    // 連鎖は各物を一度だけ除去。後ろから前への連鎖も同じ刻みで解決する。
    let removed;
    do {
      removed = false;
      for (const body of [...state.pieces]) {
        const { x, y } = body.position;
        if ((!body.isStatic || body.plugin.shot.kind === "boss") && state.age >= 1 && state.flying && (body.plugin.shot.hp <= 0 || x < -60 || x > W + 60 || y > 700)) { destroy(body); removed = true; }
      }
    } while (removed);
    if (!state.flying) return;
    state.shotAge += STEP;
    const moving = [...state.pieces, ...state.birds].some((b) => !b.isStatic && !b.isSleeping && (b.speed > 0.22 || b.angularSpeed > 0.025) && b.position.y < 700 && b.position.x > -60 && b.position.x < W + 60);
    state.quiet = moving ? 0 : state.quiet + STEP;
    if (state.shotAge < 1.5) return;
    if (!state.pieces.some((b) => (b.plugin.shot.kind === "ufo" || b.plugin.shot.kind === "boss"))) {
      state.result = { cleared: true, stars: Math.min(3, state.ammo + 1), stage: state.stageIndex };
      if (state.stageIndex === STAGE_COUNT - 1) { if (state.bossDefeat <= 0) startEnding(); return; }
      state.clearWait = 1.2; state.drag = null;
      state.banner = { text: "★".repeat(state.ammo + 1) + "☆".repeat(2 - state.ammo), age: 0 };
    } else if (state.quiet >= 0.45 || state.shotAge >= 7) {
      for (const bird of state.birds) Composite.remove(engine.world, bird);
      state.birds = [];
      state.bird = null; state.flying = false;
      if (state.ammo === 0) {
        state.result = { cleared: false, stars: 0, stage: state.stageIndex };
        state.over = true;
      }
    }
  }
  if (endingOnly) startEnding();
  else startStage();
  return {
    state, endingOnly,
    ...(new URLSearchParams(location.search).has("debug") ? { debugEnding: startEnding } : {}),
    get result() { return state.result; }, get over() { return state.over; },
    get ending() { return !!state.ending; },
    get shots() { return (state.stageIndex === STAGE_COUNT - 1 ? 5 : 3) - state.ammo; },
    pointer(type, x, y) {
      if (type === "cancel") { state.drag = null; idle = 0; return; }
      if (type === "down" || type === "move" || type === "up") idle = 0;
      if (state.ending && !state.over) { if (type === "down") state.over = true; return; }
      if (state.over || state.bossDefeat > 0 || state.clearWait > 0 || state.age < 1) return;
      if (state.flying) {
        if (type === "down") activateSkill();
        return;
      }
      if (type === "cancel") { state.drag = null; return; }
      if (type === "down") {
        const button = skillButtons.find((b) => Math.hypot(x - b.x, y - b.y) <= 20);
        if (button) { state.skill = selectedSkill = button.id; state.drag = null; return; }
      }
      if (type === "down") { touched = true; state.drag = { x, y, dx: 0, dy: 0 }; }
      if (!state.drag) return;
      if (type === "move") pull(x, y);
      if (type === "up") {
        pull(x, y);
        const { dx, dy } = state.drag;
        state.drag = null;
        if (Math.hypot(dx, dy) < 4) return;
        state.bird = Bodies.circle(SLING.x, SLING.y, 16, { density: 0.008, restitution: 0.25, friction: 0.6 });
        Body.setVelocity(state.bird, { x: -dx * SHOT_SPEED, y: -dy * SHOT_SPEED });
        state.birds = [state.bird];
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
      if (state.ending) { drawEnding(ctx); return; }
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
      for (const trail of state.trails) {
        ctx.globalAlpha = trail.life * 2;
        drawMascot(ctx, trail.x, trail.y, 18, costume);
      }
      ctx.globalAlpha = 1;
      for (const bird of state.birds) drawMascot(ctx, bird.position.x, bird.position.y, bird.circleRadius * 1.25, costume, { t: state.t, tilt: bird.angle });
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
        if (e.age < 0) continue;
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
      drawTutorial(ctx);
      pop.draw(ctx);
      ctx.restore();
      drawHud(ctx, `${state.stageIndex + 1} / ${STAGE_COUNT}`, "");
      ctx.font = `700 17px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = "#fff";
      for (let i = 0; i < state.ammo; i++) {
        const x = 24 + i * 27;
        ctx.fillStyle = "#fff0cf"; ctx.beginPath(); ctx.arc(x, 59, 10, 0, Math.PI * 2); ctx.fill();
        drawMascot(ctx, x, 59, 8, costume);
      }
      ctx.font = `700 15px ${FONT}`; ctx.textAlign = "center";
      const skillName = (available.find((s) => s.id === state.skill) || available[0]).name;
      for (const button of skillButtons) {
        ctx.save();
        const chosen = button.id === state.skill;
        ctx.globalAlpha = state.flying ? 0.6 : 1;
        ctx.shadowColor = button.color; ctx.shadowBlur = chosen ? 14 : 0;
        ctx.fillStyle = chosen ? button.color : "#302b48";
        ctx.strokeStyle = chosen ? "#fff7da" : button.color; ctx.lineWidth = chosen ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(button.x, button.y, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = chosen ? "#302340" : button.color;
        ctx.font = `900 23px ${FONT}`; ctx.textBaseline = "middle";
        ctx.strokeStyle = ctx.fillStyle;
        drawSkillIcon(ctx, button.id, button.x, button.y, 22);
        ctx.fillStyle = "#fff4e2"; ctx.font = `700 8px ${FONT}`; ctx.textBaseline = "bottom";
        ctx.fillText(button.name, button.x, button.y + 28);
        ctx.restore();
      }
      ctx.fillText(state.flying ? state.burstUsed ? `${skillName}！` : `タップで ${skillName}！` : state.clearWait ? "クリア！" : "どこでも 引っぱって はなそう", W / 2, 118);
      const boss = state.pieces.find((b) => b.plugin.shot.kind === "boss");
      if (boss) {
        const data = boss.plugin.shot;
        ctx.fillStyle = "#24142f"; ctx.fillRect(64, 203, 232, 12);
        ctx.fillStyle = data.flash > 0 ? "#fff" : data.hp < data.maxHp / 2 ? "#e55373" : "#b077e4";
        ctx.fillRect(66, 205, 228 * Math.max(0, data.hp / data.maxHp), 8);
        ctx.strokeStyle = "#edc77f"; ctx.lineWidth = 1.5; ctx.strokeRect(64, 203, 232, 12);
      }
      if (state.banner.age < 2) {
        ctx.globalAlpha = Math.min(1, (2 - state.banner.age) * 2);
        ctx.fillStyle = state.stageIndex === STAGE_COUNT - 1 ? "rgba(101,24,71,0.9)" : "rgba(42,31,92,0.8)"; ctx.fillRect(view.x0, 137, view.x1 - view.x0, 50);
        ctx.fillStyle = "#fff"; ctx.font = `900 36px ${FONT}`; ctx.textBaseline = "middle";
        ctx.fillText(state.banner.text, W / 2 + (state.stageIndex === STAGE_COUNT - 1 ? Math.sin(state.t * 36) * 2 : 0), 162, W - 20); ctx.globalAlpha = 1;
      }
    },
  };
}

function drawPiece(ctx, body) {
  const { kind, w, h, hp, maxHp } = body.plugin.shot;
  ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
  ctx.fillStyle = TYPES[kind].color; ctx.strokeStyle = "#382b41"; ctx.lineWidth = 1.5;
  if (kind === "boss") {
    const flash = body.plugin.shot.flash || 0;
    if (flash > 0) ctx.translate(Math.sin(flash * 160) * 3, 0);
    ctx.scale(w / 24, w / 24);
    ctx.fillStyle = flash > 0 ? "#fff" : hp < maxHp / 2 ? "#ba385f" : TYPES.boss.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 23, 19, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 12, 28, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#edd263";
    ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(-17, -29); ctx.lineTo(-6, -23); ctx.lineTo(0, -34); ctx.lineTo(7, -23); ctx.lineTo(17, -29); ctx.lineTo(13, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff1cd"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-5, -1); ctx.moveTo(5, -1); ctx.lineTo(14, -5); ctx.stroke();
    for (const x of [-17, 0, 17]) { ctx.beginPath(); ctx.arc(x, 13, 2, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === "ufo") {
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
  if (kind !== "ufo" && kind !== "boss" && hp < maxHp / 2) {
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
      // 最初の8面の色を保ち、追加の砦は同じ深夜の空にする。
      const originalNightSpan = 7;
      const night = Math.min(stage / originalNightSpan, 1);
      const sky = c.createLinearGradient(0, y0, 0, FLOOR);
      sky.addColorStop(0, stage === STAGE_COUNT - 1 ? "#180d23" : `hsl(${235 - night * 8} 38% ${23 - night * 14}%)`);
      sky.addColorStop(0.65, stage === STAGE_COUNT - 1 ? "#301329" : `hsl(${270 - night * 20} 25% ${29 - night * 13}%)`);
      sky.addColorStop(1, stage === STAGE_COUNT - 1 ? "#581e35" : `hsl(${335 - night * 65} 28% ${35 - night * 17}%)`);
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
