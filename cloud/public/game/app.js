// ミニゲームの画面の切り替え（えらぶ → あそぶ → 結果・ランキング）と、ガチャ・ショップ・きせかえ

import { COSTUMES, H, W, drawMascot, mascotReady, view, fetchRanking, loadSave, startSession, submitScore, writeSave } from "./common.js";
import { GACHA_COST, GACHA_REFUND, UPGRADES, buy, level, nextCost, pull } from "./shop.js";
import * as flight from "./flight.js";
import * as shot from "./shot.js";

/** ゲームの一覧（並び順のまま表示） */
const GAMES = [flight, shot];

const RANKED_GAMES = GAMES.filter((g) => g.META.mode !== "map");
let shotStage = 0;
const save = loadSave();
const $ = (id) => document.getElementById(id);
let current = null; // 遊んでいるゲームのモジュール
let session = null;
let started = false; // スタートを押したか（ひとやすみから戻るときは合言葉を取り直さない）
let lastScore = 0;
let board = "today";
let rankGame = GAMES[0];
let rankBoard = "today";
const rankingRequests = new WeakMap();

// ── 画面の切り替え ──
function show(view) {
  for (const id of ["hub", "dress", "gacha", "shop", "play", "result", "rank", "shot-map", "shot-result"]) $(id).hidden = id !== view;
  if (view === "shot-map") renderShotMap();
  if (view === "hub") renderHub();
  if (view === "dress") renderDress();
  if (view === "gacha") renderGacha(true);
  if (view === "shop") renderShop();
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) {
    stopLoop();
    show(go.dataset.go);
  }
});

function paintMascot(canvas, costume) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const size = canvas.clientWidth || 80;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  drawMascot(ctx, size / 2, size * 0.56, size * 0.3, costume, { t: performance.now() / 1000 });
}

const stars = (n) => "★".repeat(n);

function renderHub() {
  $("points").textContent = `${save.points.toLocaleString()} pt`;
  $("owned-count").textContent = `きせかえ ${save.owned.length - 1} / ${COSTUMES.length - 1}${save.points >= GACHA_COST ? "・ガチャが まわせるよ！" : ""}`;
  paintMascot($("me"), save.costume);
  const list = $("games");
  list.textContent = "";
  for (const g of GAMES) {
    const li = document.createElement("li");
    li.className = "game";
    const best = save.best[g.META.id];
    li.innerHTML = `<h2></h2><p class="best"></p><button class="btn pink" type="button">あそぶ</button><button class="rank-link" type="button">ランキング</button><p></p>`;
    li.querySelector("h2").textContent = g.META.title;
    li.querySelector(".best").textContent = g.META.mode === "map" ? `★ ${shotTotal()} / ${shot.STAGE_COUNT * 3}` : best ? `じこベスト ${best.toLocaleString()}点` : "まだ あそんでいない";
    li.querySelector("p:last-child").textContent = g.META.howto;
    li.querySelector("button").addEventListener("click", () => g.META.mode === "map" ? show("shot-map") : openGame(g));
    if (g.META.mode === "map") li.querySelector(".rank-link").remove();
    else li.querySelector(".rank-link").addEventListener("click", () => openRanking(g));
    list.appendChild(li);
  }
}

const shotSkills = () => shot.SKILLS.filter((skill) => skill.stage < 0 || save.shot.stars[skill.stage] > 0).map((skill) => skill.id);
const shotTotal = () => save.shot.stars.reduce((sum, n) => sum + n, 0);
const shotStars = (n) => "★".repeat(n) + "☆".repeat(3 - n);
function renderShotMap() {
  $("shot-total").textContent = `★ ${shotTotal()} / ${shot.STAGE_COUNT * 3}`;
  $("shot-stages").textContent = "";
  const firstUncleared = save.shot.stars.findIndex((n) => n === 0);
  const originalPositions = [20, 48, 78, 70, 40, 18, 46, 78, 70, 40, 18, 32, 64, 78, 48, 20];
  const continuation = [32, 64, 78, 48, 20, 32, 64, 78];
  const positions = Array.from({ length: shot.STAGE_COUNT }, (_, i) =>
    originalPositions[i] ?? continuation[(i - originalPositions.length) % continuation.length]);
  const points = positions.map((x, stage) => ({ x, y: 48 + stage * 76 }));
  const goal = { x: 48, y: points.at(-1).y + 90 };
  const routePoints = [...points, goal];
  const height = goal.y + 70;
  $("shot-stages").style.height = `${height}px`;
  // 固定ピクセル間隔の景色を、ルートの長さに合わせて必要な分だけ置く。
  const landscapes = document.createDocumentFragment();
  for (let y = 0; y < height + 180; y += 640) {
    const landscape = $("shot-landscape-template").content.firstElementChild.cloneNode(true);
    landscape.style.top = `${y}px`;
    landscapes.appendChild(landscape);
  }
  $("shot-landscapes").replaceChildren(landscapes);
  const route = document.querySelector(".shot-route > svg");
  route.setAttribute("viewBox", `0 0 100 ${height}`);
  route.querySelector("path").setAttribute("d", routePoints.map((p, i) => i ? `C${routePoints[i - 1].x} ${p.y - 38} ${p.x} ${p.y - 38} ${p.x} ${p.y}` : `M${p.x} ${p.y}`).join(" "));
  save.shot.stars.forEach((stars, stage) => {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = save.shot.stars[stage] === 0 && firstUncleared !== -1 && stage > firstUncleared;
    button.className = stars ? "cleared" : button.disabled ? "locked" : "next";
    button.style.setProperty("--stage-x", `${points[stage].x}%`);
    button.style.setProperty("--stage-y", `${points[stage].y}px`);
    button.innerHTML = `<b>${stage + 1}</b><span>${shotStars(stars)}</span>${button.disabled ? '<i aria-hidden="true">🔒</i>' : ''}`;
    if (stage === shot.STAGE_COUNT - 1) {
      button.classList.add("shot-boss");
      button.insertAdjacentHTML("afterbegin", '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M18 15 14 3 26 9 32 0 38 9 50 3 46 15" fill="#edd263" stroke="#382b41"/><ellipse cx="32" cy="23" rx="21" ry="13" fill="#9654b5"/><ellipse cx="32" cy="30" rx="29" ry="8" fill="#763c9c" stroke="#edc77f"/><path d="m20 18 8 4m8 0 8-4" stroke="#fff0cf" stroke-width="3"/></svg>');
    }
    button.setAttribute("aria-label", `${stage + 1} ${shotStars(stars)}${button.disabled ? " 🔒" : ""}`);
    if (!stars && !button.disabled) button.setAttribute("aria-current", "step");
    button.addEventListener("click", () => openGame(shot, stage));
    $("shot-stages").appendChild(button);
  });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "shot-goal";
  button.disabled = save.shot.stars[shot.STAGE_COUNT - 1] === 0;
  button.setAttribute("aria-label", "エンディングを見る");
  button.style.setProperty("--stage-x", `${goal.x}%`);
  button.style.setProperty("--stage-y", `${goal.y}px`);
  button.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-38 32 32)" stroke-linecap="round"><path d="M7 30h50" stroke="#e9c48a" stroke-width="3"/><g stroke-width="1.5"><ellipse cx="19" cy="30" rx="8" ry="9.5" fill="#b4541c" stroke="#7d3510"/><ellipse cx="33" cy="30" rx="6" ry="9" fill="#8fcf6a" stroke="#4f9a35"/><ellipse cx="47" cy="30" rx="8" ry="9.5" fill="#b4541c" stroke="#7d3510"/></g></g><path d="M47 47v10l9-5z" fill="#fff0c8"/></svg>`;
  button.addEventListener("click", () => openGame(shot, shot.STAGE_COUNT - 1, true));
  $("shot-stages").appendChild(button);
  requestAnimationFrame(() => {
    $("shot-stages").children[firstUncleared < 0 ? shot.STAGE_COUNT - 1 : firstUncleared]?.scrollIntoView({ block: "center" });
  });
}

function renderDress() {
  $("dress-points").textContent = `やきとりポイント ${save.points.toLocaleString()} pt`;
  const list = $("costumes");
  list.textContent = "";
  for (const c of COSTUMES) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    const open = save.owned.includes(c.id);
    b.disabled = !open;
    b.setAttribute("aria-pressed", String(save.costume === c.id));
    const cv = document.createElement("canvas");
    const label = document.createElement("span");
    label.innerHTML = `<span class="stars"></span><br><span class="nm"></span>`;
    label.querySelector(".stars").textContent = stars(c.rarity);
    label.querySelector(".nm").textContent = open ? c.name : "？？？";
    b.append(cv, label);
    b.addEventListener("click", () => {
      save.costume = c.id;
      writeSave(save);
      renderDress();
    });
    li.appendChild(b);
    list.appendChild(li);
    // まだ持っていない きせかえは、そのままの とりを うすく見せる
    requestAnimationFrame(() => paintMascot(cv, open ? c.id : "none"));
  }
}

// ── ガチャ ──
let pulling = false;
function renderGacha(reset) {
  $("gacha").querySelector(".gacha-points").textContent = `やきとりポイント ${save.points.toLocaleString()} pt`;
  $("pull").disabled = pulling || save.points < GACHA_COST;
  $("pull").textContent = save.points < GACHA_COST ? `ポイントが たりないよ（${GACHA_COST} pt）` : `ガチャを まわす（${GACHA_COST} pt）`;
  if (reset) {
    $("capsule").hidden = false;
    $("capsule").className = "capsule";
    $("gacha-prize").hidden = true;
    $("gacha-result").textContent = `1かい ${GACHA_COST} pt。なにが でるかな？`;
  }
}

$("pull").addEventListener("click", () => {
  if (pulling) return;
  const got = pull(save);
  if (!got) return;
  writeSave(save);
  pulling = true;
  const cap = $("capsule");
  cap.hidden = false;
  $("gacha-prize").hidden = true;
  cap.className = `capsule r${got.costume.rarity}`;
  void cap.offsetWidth; // アニメーションを最初から
  cap.classList.add("shake");
  $("gacha-result").textContent = "ころころ…";
  renderGacha(false);
  setTimeout(() => {
    cap.hidden = true;
    const cv = $("gacha-prize");
    cv.hidden = false;
    paintMascot(cv, got.costume.id);
    const el = $("gacha-result");
    el.innerHTML = `<span class="stars"></span><br><b></b><br><span class="note"></span>`;
    el.querySelector(".stars").textContent = stars(got.costume.rarity);
    el.querySelector("b").textContent = got.costume.name;
    el.querySelector(".note").textContent = got.dup ? `もっていたので ${GACHA_REFUND} pt もどったよ` : "あたらしい きせかえ！ きせかえから つけられるよ";
    if (!got.dup) {
      save.costume = got.costume.id;
      writeSave(save);
    }
    pulling = false;
    renderGacha(false);
  }, 1200);
});

// ── ショップ ──
function renderShop() {
  $("shop").querySelector(".shop-points").textContent = `やきとりポイント ${save.points.toLocaleString()} pt`;
  const list = $("upgrades");
  list.textContent = "";
  for (const u of UPGRADES) {
    const lv = level(save, u.id);
    const cost = nextCost(save, u.id);
    const li = document.createElement("li");
    li.innerHTML = `<h3><span class="nm"></span> <span class="lv"></span><br><span class="game-name"></span></h3><p></p><button class="btn pink" type="button"></button>`;
    li.querySelector(".nm").textContent = u.name;
    li.querySelector(".lv").textContent = u.costs.length > 1 ? `Lv${lv}/${u.costs.length}` : lv ? "✔" : "";
    li.querySelector(".game-name").textContent = GAMES.find((g) => g.META.id === u.game)?.META.title ?? "";
    li.querySelector("p").textContent = u.desc;
    const b = li.querySelector("button");
    b.textContent = cost === null ? "さいだい" : `${cost} pt`;
    b.disabled = cost === null || save.points < cost;
    b.addEventListener("click", () => {
      if (buy(save, u.id)) {
        writeSave(save);
        renderShop();
      }
    });
    list.appendChild(li);
  }
}

// ── あそぶ ──
const canvas = $("stage");
const ctx = canvas.getContext("2d");
let game = null;
let raf = 0;
let last = 0;
let scale = 1;

let offX = 0;
let offY = 0;

/** キャンバスは画面いっぱい。ゲームの 360×640 は収まる大きさで真ん中に置き、まわりは背景だけ見える */
function fit() {
  const play = $("play");
  if (play.hidden) return;
  const vw = play.clientWidth;
  const vh = play.clientHeight - (parseFloat(getComputedStyle(play).paddingBottom) || 0);
  scale = Math.min(vw / W, vh / H);
  offX = (vw - W * scale) / 2;
  offY = (vh - H * scale) / 2;
  Object.assign(view, { x0: -offX / scale, y0: -offY / scale, x1: W + offX / scale, y1: H + offY / scale });
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
  if (game) game.draw(ctx);
}
window.addEventListener("resize", fit);

function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left - offX) / scale, (e.clientY - r.top - offY) / scale];
}
for (const [ev, type] of [["pointerdown", "down"], ["pointermove", "move"], ["pointerup", "up"], ["pointercancel", "up"]]) {
  canvas.addEventListener(ev, (e) => {
    if (!game || !raf) return;
    e.preventDefault();
    if (type === "down") canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = toGame(e);
    game.pointer(type, x, y);
  });
}

function openGame(g, stage = shotStage, endingOnly = false) {
  stopLoop();
  if (g.META.mode === "map") shotStage = stage;
  current = g;
  game = g.createGame({ costume: save.costume, up: save.upgrades, stage, skills: shotSkills(), endingOnly });
  started = endingOnly;
  if (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("debug")) window.__game = game;
  $("ready-title").textContent = g.META.title;
  $("ready-howto").textContent = g.META.howto;
  $("ready").hidden = endingOnly;
  show("play");
  fit();
  if (endingOnly) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
}

$("start").addEventListener("click", () => {
  $("ready").hidden = true;
  if (!started) {
    started = true;
    session = null;
    if (current.META.mode !== "map") startSession().then((s) => (session = s)); // ランキング用。つながらなくても遊べる
  }
  last = performance.now();
  raf = requestAnimationFrame(loop);
});

function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw(ctx);
  if (game.over) {
    stopLoop();
    // 終わった画面を少し見せてから結果へ
    if (current.META.mode === "map") finishShot();
    else setTimeout(() => finish(game.score), 900);
    return;
  }
  raf = requestAnimationFrame(loop);
}

/** 遊んでいる途中で止めて、「つづきから」の案内を出す */
function pause() {
  if (!raf) return;
  stopLoop();
  $("ready-title").textContent = "ひとやすみ";
  $("ready-howto").textContent = "つづきから あそべるよ";
  $("ready").hidden = false;
}

// 別のアプリに切り替えたら止め、戻ったら続きから
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
  else watchOrder();
});

// ── 自分の番号（呼び出し状況のページで入れた整理券の番号）を見張り、できあがったらゲームを止めて知らせる ──
const NUMBER_KEY = "torico-number";
const WATCH_MS = 10000;
const called = new Set();

function myNumber() {
  try {
    const day = localStorage.getItem("torico-number-day");
    if (day && day !== new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)) return null;
    const n = parseInt(localStorage.getItem(NUMBER_KEY) ?? "", 10);
    return n >= 1 && n <= 9999 ? n : null;
  } catch {
    return null;
  }
}

/** 呼び出し状況のページへのリンク（整理券の日付も付けて、前の日の券と取り違えないようにする） */
function statusLink(n) {
  let day = null;
  try {
    day = localStorage.getItem("torico-number-day");
  } catch {
    // 日付なしで開く
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? `/?n=${n}&d=${day}` : `/?n=${n}`;
}

function renderOrder(n, lookup) {
  const box = $("my-order");
  const state = lookup?.state;
  box.hidden = !n || !(state === "waiting" || state === "ready");
  if (box.hidden) return;
  box.href = statusLink(n);
  box.classList.toggle("done", state === "ready");
  $("my-order-number").textContent = String(n);
  $("my-order-state").textContent = state === "ready" ? "できあがりました！ お渡し口へ" : `ただいま焼いています（前に ${lookup.ahead}組）`;
}

function callReady(n) {
  const day = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const key = `torico-called-${day}-${n}`;
  if (called.has(key)) return;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // 保存できないときも、この画面で知らせた番号を覚える
  }
  called.add(key);
  pause();
  $("call-number").textContent = String(n);
  $("call").hidden = false;
  $("call").querySelector("a").href = statusLink(n);
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

async function watchOrder() {
  if (document.hidden) return;
  const n = myNumber();
  if (!n) return renderOrder(null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/status?n=${n}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return;
    const data = await res.json();
    if (data.config?.closed === true || !data.status || !(Date.now() - Date.parse(data.status.updatedAt) < 60000)) return renderOrder(null);
    renderOrder(n, data.lookup);
    if (data.lookup?.state === "ready") callReady(n);
  } catch {
    // つながらないときは次の回に
  } finally {
    clearTimeout(timeout);
  }
}
setInterval(watchOrder, WATCH_MS);
watchOrder();

$("call-close").addEventListener("click", () => {
  $("call").hidden = true;
});

// ── 結果 ──
function finishShot() {
  if (game.endingOnly) {
    show("shot-map");
    return;
  }
  const { cleared, stars, stage } = game.result;
  const before = shotSkills();
  const gained = Math.max(0, stars - save.shot.stars[stage]) * 20;
  save.shot.stars[stage] = Math.max(stars, save.shot.stars[stage]);
  save.points += gained;
  save.plays++;
  writeSave(save);
  const outcome = $("shot-outcome");
  outcome.replaceChildren();
  if (cleared && stage === shot.STAGE_COUNT - 1) {
    const title = document.createElement("span");
    title.textContent = "ぜんぶクリア！";
    title.style.cssText = "display:block;font-size:clamp(24px,8vw,36px);white-space:nowrap";
    const rating = document.createElement("span");
    rating.textContent = shotStars(stars);
    rating.style.cssText = "display:block;font-size:56px;line-height:1.3";
    outcome.append(title, rating);
  } else outcome.textContent = cleared ? shotStars(stars) : "☆☆☆";
  $("shot-outcome").classList.toggle("failed", !cleared);
  $("shot-points").textContent = gained ? `+${gained}pt` : "";
  const unlocked = shot.SKILLS.filter((skill) => !before.includes(skill.id) && shotSkills().includes(skill.id));
  $("shot-unlock").hidden = unlocked.length === 0;
  $("shot-unlock-skills").replaceChildren();
  for (const skill of unlocked) {
    const badge = document.createElement("span");
    const icon = document.createElement("canvas");
    icon.width = icon.height = 64;
    icon.setAttribute("aria-hidden", "true");
    const ctx = icon.getContext("2d");
    ctx.fillStyle = ctx.strokeStyle = "#603d65";
    shot.drawSkillIcon(ctx, skill.id, 32, 32, 48);
    badge.append(icon, document.createTextNode(skill.name));
    $("shot-unlock-skills").appendChild(badge);
  }
  $("shot-next").hidden = !cleared || stage === shot.STAGE_COUNT - 1;
  show("shot-result");
}
$("shot-next").addEventListener("click", () => openGame(shot, shotStage + 1));
$("shot-again").addEventListener("click", () => openGame(shot, shotStage));

function finish(score) {
  lastScore = score;
  const id = current.META.id;
  const prevBest = save.best[id] ?? 0;
  const gained = Math.max(1, Math.round(score * current.META.pointRate));
  save.points += gained;
  save.plays++;
  if (score > prevBest) save.best[id] = score;
  writeSave(save);

  $("result-game").textContent = current.META.title;
  $("result-score").textContent = `${score.toLocaleString()}点`;
  $("result-best").textContent = score > prevBest && prevBest > 0 ? "じこベスト こうしん！" : `じこベスト ${Math.max(prevBest, score).toLocaleString()}点`;
  $("result-points").textContent = `やきとりポイント +${gained.toLocaleString()} pt（ぜんぶで ${save.points.toLocaleString()} pt）`;
  $("result-unlock").hidden = save.points < GACHA_COST;
  $("result-unlock").textContent = "ガチャが まわせるよ！ ゲームをえらぶ から どうぞ";
  $("name").value = save.name;
  $("submit-msg").textContent = score === 0 ? "0点は のせられないよ" : "";
  $("submit-form").querySelector("button").disabled = score === 0;
  board = "today";
  show("result");
  loadRanking();
}

function loadRanking(highlight) {
  for (const b of $("result").querySelectorAll("[data-board]")) b.setAttribute("aria-selected", String(b.dataset.board === board));
  return renderRanking($("ranking"), current, board, highlight);
}

async function renderRanking(ol, game, board, highlight) {
  const request = (rankingRequests.get(ol) ?? 0) + 1;
  rankingRequests.set(ol, request);
  ol.textContent = "";
  try {
    const top = await fetchRanking(game.META.id, board);
    if (rankingRequests.get(ol) !== request) return;
    if (top.length === 0) {
      ol.innerHTML = `<li class="small">まだ だれも のっていないよ</li>`;
      return;
    }
    const myTag = save.player.slice(0, 6);
    for (const r of top) {
      const li = document.createElement("li");
      if (r.tag === myTag || r.tag === highlight) li.className = "me";
      li.innerHTML = `<span class="rank"></span><span class="nm"></span><span class="sc"></span>`;
      li.querySelector(".rank").textContent = `${r.rank}位`;
      li.querySelector(".nm").textContent = r.name;
      li.querySelector(".sc").textContent = `${r.score.toLocaleString()}点`;
      ol.appendChild(li);
    }
  } catch (e) {
    if (rankingRequests.get(ol) !== request) return;
    ol.innerHTML = `<li class="small"></li>`;
    ol.firstChild.textContent = e.message;
  }
}

for (const b of $("result").querySelectorAll("[data-board]")) {
  b.addEventListener("click", () => {
    board = b.dataset.board;
    loadRanking();
  });
}

function openRanking(g) {
  rankGame = g;
  rankBoard = "today";
  show("rank");
  loadRankScreen();
}

function loadRankScreen() {
  for (const b of $("rank").querySelectorAll("[data-game]")) b.setAttribute("aria-selected", String(b.dataset.game === rankGame.META.id));
  for (const b of $("rank").querySelectorAll("[data-board]")) b.setAttribute("aria-selected", String(b.dataset.board === rankBoard));
  return renderRanking($("rank-ranking"), rankGame, rankBoard);
}

for (const g of RANKED_GAMES) {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("role", "tab");
  b.dataset.game = g.META.id;
  b.textContent = g.META.title;
  b.addEventListener("click", () => {
    rankGame = g;
    loadRankScreen();
  });
  $("rank-games").appendChild(b);
}
for (const b of $("rank").querySelectorAll("[data-board]")) {
  b.addEventListener("click", () => {
    rankBoard = b.dataset.board;
    loadRankScreen();
  });
}
$("rank-play").addEventListener("click", () => openGame(rankGame));

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  const name = $("name").value.trim();
  if (!name) {
    $("submit-msg").textContent = "なまえを いれてね";
    return;
  }
  if (!session) {
    $("submit-msg").textContent = "つうしんが できなかったので のせられないよ。もういちど あそんでね";
    return;
  }
  btn.disabled = true;
  try {
    const r = await submitScore({ game: current.META.id, player: save.player, name, score: lastScore, session });
    save.name = name;
    writeSave(save);
    $("submit-msg").textContent = `のせたよ！ 今日 ${r.rank}位・歴代 ${r.allRank}位`;
    session = null;
    loadRanking();
  } catch (err) {
    $("submit-msg").textContent = err.message;
    btn.disabled = false;
  }
});

$("again").addEventListener("click", () => openGame(current));

show("hub");
mascotReady.then(() => {
  if (!$("hub").hidden) renderHub();
  if (!$("dress").hidden) renderDress();
});
