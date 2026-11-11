// ミニゲームの共通部品：画面の大きさ、宇宙の背景、マスコット（きせかえ）、焼き鳥の絵、記録の保存、ランキングの通信

/** ゲームの論理サイズ（縦長）。実際の画面には拡大・縮小して描く */
export const W = 360;
export const H = 640;

/** 実際に見えている範囲（論理座標）。縦長のスマホでは上下が 0〜H より広くなる。app.js が画面に合わせて書きかえる */
export const view = { x0: 0, y0: 0, x1: W, y1: H };

export const COLORS = {
  space900: "#2a1f5c",
  space700: "#3d2f7d",
  space500: "#544591",
  ink: "#4a3f8c",
  pink400: "#e57bab",
  magenta: "#c5589d",
  pink200: "#f4b0d5",
  cyan: "#80f7fd",
  comb: "#e55a22",
  beak: "#edd263",
  tare: "#b4541c",
  tareBg: "#ffe3c7",
  shio: "#2b8fb3",
  shioBg: "#dff6fb",
  danger: "#d93a5b",
  ok: "#2fa56b",
};

export const FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';

// ── 宇宙の背景（星はまたたき、ゆっくり流れる） ──
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 97.3) % W,
  y: (i * 211.7) % H,
  r: 0.6 + ((i * 7) % 10) / 8,
  p: (i * 1.7) % (Math.PI * 2),
  v: 4 + ((i * 13) % 10),
}));

export function drawSpace(ctx, t, scroll = 0) {
  const { x0, y0, x1, y1 } = view;
  const vw = x1 - x0;
  const vh = y1 - y0;
  const g = ctx.createLinearGradient(x0, y0, x0 + vw * 0.4, y1);
  g.addColorStop(0, COLORS.space500);
  g.addColorStop(0.55, COLORS.space700);
  g.addColorStop(1, COLORS.space900);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, vw, vh);
  const glow = ctx.createRadialGradient(x0 + vw * 0.85, y1, 0, x0 + vw * 0.85, y1, 300);
  glow.addColorStop(0, "rgba(237,130,167,0.33)");
  glow.addColorStop(1, "rgba(237,130,167,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x0, y0, vw, vh);
  for (const s of STARS) {
    const a = 0.45 + 0.4 * Math.sin(t * 2 + s.p);
    const x = x0 + ((((s.x / W) * vw - scroll * s.v * 0.1) % vw) + vw) % vw;
    const y = y0 + (((s.y / H) * vh + t * s.v) % vh);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── マスコット（背景を抜いた画像。素材は切り抜きと縮小のみ） ──
const mascotImg = new Image();
/** マスコットの画像が読めたら解決する（一覧やきせかえの絵を描き直すため） */
export const mascotReady = new Promise((resolve) => {
  mascotImg.onload = resolve;
  mascotImg.onerror = resolve;
});
mascotImg.src = "/brand/mascot.webp";

/** きせかえ。points は「やきとりポイント」の累計で、これを超えると使えるようになる */
export const COSTUMES = [
  { id: "none", name: "そのまま", points: 0 },
  { id: "hachimaki", name: "ねじりはちまき", points: 300 },
  { id: "star", name: "星のヘアピン", points: 800 },
  { id: "ribbon", name: "ハートのリボン", points: 1500 },
  { id: "wizard", name: "まほうつかい", points: 2500 },
  { id: "crown", name: "王かん", points: 4000 },
  { id: "halo", name: "天使のわっか", points: 6000 },
  { id: "helmet", name: "うちゅうヘルメット", points: 9000 },
  { id: "rainbow", name: "にじいろオーラ", points: 13000 },
];

export function drawMascot(ctx, x, y, r, costume = "none", opts = {}) {
  const { tilt = 0, t = 0 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  if (costume === "rainbow") {
    // 色が変わる、ふんわりした光（輪郭は付けない）
    const hue = (t * 120) % 360;
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.5);
    g.addColorStop(0, `hsla(${hue},90%,70%,0.6)`);
    g.addColorStop(1, `hsla(${(hue + 60) % 360},90%,70%,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
  }
  if (costume === "halo") {
    ctx.strokeStyle = COLORS.beak;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.38, r * 0.55, r * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // とりは丸で囲まず、そのまま描く（背景を抜いた画像。幅は半径の約2.3倍）
  if (mascotImg.complete && mascotImg.naturalWidth) {
    const s = (r * 2.3) / mascotImg.naturalWidth;
    const w = mascotImg.naturalWidth * s;
    const h = mascotImg.naturalHeight * s;
    ctx.drawImage(mascotImg, -w / 2, -h / 2 - r * 0.08, w, h);
  }
  drawAccessory(ctx, r, costume);
  ctx.restore();
}

function star(ctx, cx, cy, outer, inner, n = 5) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rr = i % 2 ? inner : outer;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function heart(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.3, cx - s * 0.35, cy - s * 0.95, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.35, cy - s * 0.95, cx + s * 0.9, cy - s * 0.3, cx, cy + s * 0.35);
  ctx.closePath();
}
export { heart, star };

function drawAccessory(ctx, r, id) {
  ctx.lineJoin = "round";
  switch (id) {
    case "hachimaki": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = COLORS.danger;
      ctx.lineWidth = r * 0.06;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.62, r * 0.82, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.danger;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(i * r * 0.22, -r * 0.62, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(r * 0.75, -r * 0.62);
      ctx.lineTo(r * 1.15, -r * 0.85);
      ctx.lineTo(r * 1.05, -r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "star":
      ctx.fillStyle = COLORS.beak;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = r * 0.06;
      star(ctx, r * 0.55, -r * 0.7, r * 0.32, r * 0.14);
      ctx.fill();
      ctx.stroke();
      break;
    case "ribbon":
      ctx.fillStyle = COLORS.pink400;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = r * 0.05;
      heart(ctx, -r * 0.32, -r * 0.92, r * 0.42);
      ctx.fill();
      ctx.stroke();
      heart(ctx, r * 0.32, -r * 0.92, r * 0.42);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.9, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "wizard": {
      ctx.fillStyle = COLORS.space700;
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.62);
      ctx.quadraticCurveTo(-r * 0.1, -r * 1.2, r * 0.25, -r * 1.85);
      ctx.quadraticCurveTo(r * 0.3, -r * 1.2, r * 0.75, -r * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.beak;
      star(ctx, -r * 0.05, -r * 1.0, r * 0.16, r * 0.07);
      ctx.fill();
      star(ctx, r * 0.25, -r * 1.35, r * 0.1, r * 0.045);
      ctx.fill();
      break;
    }
    case "crown":
      ctx.fillStyle = COLORS.beak;
      ctx.strokeStyle = COLORS.comb;
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, -r * 0.7);
      ctx.lineTo(-r * 0.62, -r * 1.25);
      ctx.lineTo(-r * 0.28, -r * 0.95);
      ctx.lineTo(0, -r * 1.38);
      ctx.lineTo(r * 0.28, -r * 0.95);
      ctx.lineTo(r * 0.62, -r * 1.25);
      ctx.lineTo(r * 0.55, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.pink400;
      ctx.beginPath();
      ctx.arc(0, -r * 0.88, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "helmet": {
      const g = ctx.createRadialGradient(-r * 0.4, -r * 0.5, r * 0.1, 0, 0, r * 1.35);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.5, "rgba(128,247,253,0.15)");
      g.addColorStop(1, "rgba(128,247,253,0.35)");
      ctx.fillStyle = g;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.arc(0, -r * 0.05, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.pink400;
      heart(ctx, 0, -r * 1.45, r * 0.32);
      ctx.fill();
      break;
    }
    case "rainbow":
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 3; i++) {
        star(ctx, Math.cos(i * 2.1) * r * 1.15, Math.sin(i * 2.1) * r * 1.15, r * 0.14, r * 0.06);
        ctx.fill();
      }
      break;
  }
}

// ── 焼き鳥の串（流れ星やアイテムに使う） ──
const PIECES = {
  tare: { fill: "#b4541c", edge: "#7d3510" },
  shio: { fill: "#f6e2c4", edge: "#c9a77a" },
  negi: { fill: "#8fcf6a", edge: "#4f9a35" },
  tsukune: { fill: "#8a4a22", edge: "#5a2c10" },
  gold: { fill: "#ffd84a", edge: "#e0a400" },
  burnt: { fill: "#2b2223", edge: "#000" },
};

/** 串：x, y は真ん中、angle は向き（ラジアン）、kinds は具の種類（手元から先へ） */
export function drawSkewer(ctx, x, y, angle, kinds, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  const n = kinds.length;
  const len = n * 16 + 26;
  ctx.strokeStyle = "#e9c48a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const c = PIECES[kinds[i]] ?? PIECES.tare;
    const px = -len / 2 + 18 + i * 16;
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(px, 0, 8, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (kinds[0] === "gold") {
    ctx.fillStyle = "#fff";
    star(ctx, len / 2 - 2, -10, 5, 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 流れ星の尾 */
export function drawTrail(ctx, x, y, dx, dy, color = "rgba(255,255,255,0.5)", length = 60) {
  const d = Math.hypot(dx, dy) || 1;
  const g = ctx.createLinearGradient(x, y, x - (dx / d) * length, y - (dy / d) * length);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - (dx / d) * length, y - (dy / d) * length);
  ctx.stroke();
}

/** 浮かんで消える文字（「ぴったり！」「+50」など） */
export class Popups {
  constructor() {
    this.items = [];
  }
  add(text, x, y, color = "#fff", size = 22) {
    this.items.push({ text, x, y, color, size, age: 0 });
  }
  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.y -= 40 * dt;
    }
    this.items = this.items.filter((p) => p.age < 0.9);
  }
  draw(ctx) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.items) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / 0.9);
      ctx.font = `900 ${p.size}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = COLORS.space900;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}

/** 上の帯：点数・残り時間など */
export function drawHud(ctx, left, right) {
  ctx.font = `900 22px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.space900;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.strokeText(left, 14, 14);
  ctx.fillText(left, 14, 14);
  ctx.textAlign = "right";
  ctx.strokeText(right, W - 14, 14);
  ctx.fillText(right, W - 14, 14);
}

export function drawHearts(ctx, lives, max, x = W - 14, y = 52) {
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < lives ? COLORS.pink400 : "rgba(255,255,255,0.25)";
    heart(ctx, x - (max - 1 - i) * 26 - 10, y + 8, 18);
    ctx.fill();
  }
}

// ── このスマホに保存する記録（ベスト・やきとりポイント・きせかえ・名前） ──
const KEY = "torico-game";

export function loadSave() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    data = {};
  }
  if (typeof data.player !== "string" || !/^[a-z0-9]{8,32}$/.test(data.player)) {
    data.player = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return {
    player: data.player,
    name: typeof data.name === "string" ? data.name : "",
    points: Number.isInteger(data.points) && data.points >= 0 ? data.points : 0,
    costume: typeof data.costume === "string" ? data.costume : "none",
    best: typeof data.best === "object" && data.best ? data.best : {},
    plays: Number.isInteger(data.plays) ? data.plays : 0,
  };
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // 保存できなくても遊べる（このときは閉じると記録が消える）
  }
}

export function unlockedCostumes(points) {
  return COSTUMES.filter((c) => points >= c.points);
}

// ── ランキング（Worker の /api/play・/api/ranking） ──
export async function startSession() {
  try {
    const res = await fetch("/api/play", { method: "POST" });
    if (!res.ok) return null;
    return (await res.json()).session ?? null;
  } catch {
    return null;
  }
}

export async function fetchRanking(game, board) {
  const res = await fetch(`/api/ranking?game=${game}&board=${board}`, { cache: "no-store" });
  if (!res.ok) throw new Error("ランキングを読みこめませんでした");
  return (await res.json()).top ?? [];
}

export async function submitScore(body) {
  const res = await fetch("/api/ranking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error ?? "のせられませんでした");
  return data;
}
