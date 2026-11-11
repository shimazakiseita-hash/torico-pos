// ミニゲームの画面の切り替え（えらぶ → あそぶ → 結果・ランキング）と、ガチャ・ショップ・きせかえ

import { COSTUMES, H, W, drawMascot, mascotReady, view, fetchRanking, loadSave, startSession, submitScore, writeSave } from "./common.js";
import { GACHA_COST, GACHA_REFUND, UPGRADES, buy, level, nextCost, pull } from "./shop.js";
import * as flight from "./flight.js";
import * as tsumi from "./tsumi.js";

/** ゲームの一覧（並び順のまま表示） */
const GAMES = [tsumi, flight];

const save = loadSave();
const $ = (id) => document.getElementById(id);
let current = null; // 遊んでいるゲームのモジュール
let session = null;
let started = false; // スタートを押したか（ひとやすみから戻るときは合言葉を取り直さない）
let lastScore = 0;
let board = "today";

// ── 画面の切り替え ──
function show(view) {
  for (const id of ["hub", "dress", "gacha", "shop", "play", "result"]) $(id).hidden = id !== view;
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
    li.innerHTML = `<h2></h2><p class="best"></p><button class="btn pink" type="button">あそぶ</button><p></p>`;
    li.querySelector("h2").textContent = g.META.title;
    li.querySelector(".best").textContent = best ? `じこベスト ${best.toLocaleString()}点` : "まだ あそんでいない";
    li.querySelector("p:last-child").textContent = g.META.howto;
    li.querySelector("button").addEventListener("click", () => openGame(g));
    list.appendChild(li);
  }
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
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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

function openGame(g) {
  current = g;
  game = g.createGame({ costume: save.costume, up: save.upgrades });
  started = false;
  if (new URLSearchParams(location.search).has("debug")) window.__game = game;
  $("ready-title").textContent = g.META.title;
  $("ready-howto").textContent = g.META.howto;
  $("ready").hidden = false;
  show("play");
  fit();
}

$("start").addEventListener("click", () => {
  $("ready").hidden = true;
  if (!started) {
    started = true;
    session = null;
    startSession().then((s) => (session = s)); // ランキング用。つながらなくても遊べる
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
    setTimeout(() => finish(game.score), 900);
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
});

// ── 自分の番号（呼び出し状況のページで入れた整理券の番号）を見張り、できあがったらゲームを止めて知らせる ──
const NUMBER_KEY = "torico-number";
const WATCH_MS = 5000;

function myNumber() {
  try {
    const n = parseInt(localStorage.getItem(NUMBER_KEY) ?? "", 10);
    return n >= 1 && n <= 9999 ? n : null;
  } catch {
    return null;
  }
}

function renderOrder(n, lookup) {
  const box = $("my-order");
  const state = lookup?.state;
  box.hidden = !n || !(state === "waiting" || state === "ready");
  if (box.hidden) return;
  box.href = `/?n=${n}`;
  box.classList.toggle("done", state === "ready");
  $("my-order-number").textContent = String(n);
  $("my-order-state").textContent = state === "ready" ? "できあがりました！ お渡し口へ" : `ただいま焼いています（前に ${lookup.ahead}組）`;
}

function callReady(n) {
  const key = `torico-called-${n}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // 覚えられなくても知らせる
  }
  pause();
  $("call-number").textContent = String(n);
  $("call").hidden = false;
  $("call").querySelector("a").href = `/?n=${n}`;
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

async function watchOrder() {
  const n = myNumber();
  if (!n) return renderOrder(null);
  try {
    const res = await fetch(`/api/status?n=${n}`, { cache: "no-store" });
    const data = await res.json();
    renderOrder(n, data.lookup);
    if (data.lookup?.state === "ready") callReady(n);
  } catch {
    // つながらないときは次の回に
  }
}
setInterval(watchOrder, WATCH_MS);
watchOrder();

$("call-close").addEventListener("click", () => {
  $("call").hidden = true;
});

// ── 結果 ──
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

async function loadRanking(highlight) {
  for (const b of document.querySelectorAll("[data-board]")) b.setAttribute("aria-selected", String(b.dataset.board === board));
  const ol = $("ranking");
  ol.textContent = "";
  try {
    const top = await fetchRanking(current.META.id, board);
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
    ol.innerHTML = `<li class="small"></li>`;
    ol.firstChild.textContent = e.message;
  }
}

for (const b of document.querySelectorAll("[data-board]")) {
  b.addEventListener("click", () => {
    board = b.dataset.board;
    loadRanking();
  });
}

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
