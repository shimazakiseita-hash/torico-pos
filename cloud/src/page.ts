/** お客さんのスマホで開くページ（10秒ごとに更新。画像とフォントは cloud/public から配る） */

const FONT = `"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", Meiryo, system-ui, sans-serif`;

export const PAGE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2a1f5c">
<title>呼び出し状況｜やきとり TORI♡CO</title>
<link rel="icon" href="/brand/mascot.webp">
<style>
  @font-face { font-family: "Zen Maru Gothic"; font-weight: 700; font-display: swap; src: url("/fonts/zen-maru-gothic-700.woff2") format("woff2"); }
  :root {
    --space-900: #2a1f5c; --space-700: #3d2f7d; --space-500: #544591; --ink: #4a3f8c;
    --lav-500: #9374ab; --lav-300: #c9b3e6; --lav-100: #f1eafa;
    --pink-400: #e57bab; --magenta: #c5589d; --pink-200: #f4b0d5; --pink-100: #fde8f3;
    --cyan: #80f7fd; --ok: #2fa56b; --danger: #d93a5b;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { -webkit-text-size-adjust: 100%; background: var(--space-900); }
  html:has(body.done) { background: #1d6b45; }
  body {
    margin: 0; min-height: 100dvh; color: #fff; font-family: ${FONT}; font-weight: 700; font-variant-numeric: tabular-nums;
    background:
      radial-gradient(2px 2px at 12% 18%, #fff8, transparent 60%), radial-gradient(2px 2px at 78% 9%, #fff8, transparent 60%),
      radial-gradient(1.5px 1.5px at 40% 62%, #fff7, transparent 60%), radial-gradient(2px 2px at 88% 48%, #fff7, transparent 60%),
      radial-gradient(1.5px 1.5px at 20% 86%, #fff6, transparent 60%), radial-gradient(1.5px 1.5px at 62% 30%, #fff6, transparent 60%),
      radial-gradient(30rem 18rem at 85% 100%, #ed82a755, transparent 70%),
      linear-gradient(160deg, var(--space-500), var(--space-700) 55%, var(--space-900));
  }
  /* できあがったら画面全体の色を変えて気づけるようにする */
  body.done { background: linear-gradient(180deg, #5fd39b, var(--ok) 55%, #1d6b45); }
  main { max-width: 26rem; margin: 0 auto; padding: 1rem 1rem calc(2rem + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 0.875rem; text-align: center; }
  .logo { display: block; width: clamp(6rem, 30vw, 9.5rem); margin: 0 auto; padding: 0.25rem; border-radius: 20px; background: #fff; }
  .logo img { display: block; width: 100%; height: auto; border-radius: 16px; }
  .card { padding: 1rem 1rem 1.125rem; border-radius: 28px; background: #fff; color: var(--ink); box-shadow: 0 6px 0 rgb(0 0 0 / 0.15); }
  label, .my-label { display: block; margin: 0 0 0.5rem; font-size: 1rem; }
  .row { display: flex; gap: 0.5rem; }
  input { flex: 1; min-width: 0; height: 3.75rem; padding: 0 1rem; border: 3px solid var(--lav-300); border-radius: 18px; font: inherit; font-size: 2rem; font-weight: 900; color: var(--ink); text-align: center; }
  input:focus { outline: 3px solid var(--pink-400); outline-offset: 1px; }
  button { font: inherit; cursor: pointer; touch-action: manipulation; }
  .primary { min-width: 5.5rem; border: 0; border-radius: 18px; background: linear-gradient(180deg, var(--pink-400), var(--magenta)); box-shadow: 0 5px 0 #8c2f6e; color: #fff; font-size: 1.375rem; font-weight: 900; }
  .primary:active { transform: translateY(4px); box-shadow: 0 1px 0 #8c2f6e; }
  .hint { margin: 0.75rem 0 0; font-size: 0.875rem; color: var(--lav-500); }
  .my-label { margin: 0; }
  .my-number {
    margin: 0; font-size: clamp(4rem, 22vw, 6rem); font-weight: 900; line-height: 1.05; letter-spacing: -0.02em;
    background: linear-gradient(180deg, var(--pink-400), var(--magenta)); -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .state { margin: 0.5rem 0; padding: 0.5rem; border-radius: 999px; background: linear-gradient(180deg, var(--pink-400), var(--magenta)); color: #fff; font-size: clamp(1.125rem, 5.8vw, 1.625rem); white-space: nowrap; font-weight: 900; }
  .state.done { background: linear-gradient(180deg, #48c58a, var(--ok)); }
  /* 灰色のラベルは長い文（別の日の整理券など）もあるので折り返してよい */
  .state.plain { background: var(--lav-100); color: var(--ink); font-size: clamp(1rem, 5vw, 1.375rem); white-space: normal; }
  .detail { margin: 0; font-size: clamp(0.8125rem, 3.8vw, 0.95rem); }
  .link { display: block; min-height: 2.75rem; margin: 0.5rem auto 0; padding: 0 1rem; border: 0; background: none; color: var(--lav-500); text-decoration: underline; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
  .stat { padding: 0.625rem; border-radius: 18px; background: rgb(255 255 255 / 0.15); }
  .stat p { margin: 0; font-size: 0.875rem; }
  .stat b { display: block; font-size: 2.125rem; font-weight: 900; line-height: 1.3; color: var(--cyan); }
  #stale { margin: 0; padding: 0.75rem 1rem; border-radius: 18px; background: var(--danger); }
  .list { padding: 0.875rem; border-radius: 28px; background: rgb(255 255 255 / 0.12); }
  .list h2 { margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 900; }
  .nums { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
  .nums li { min-width: 3.25rem; padding: 0.125rem 0.625rem; border-radius: 12px; background: #fff; color: var(--ink); font-size: 1.625rem; font-weight: 900; }
  .ready li { background: linear-gradient(180deg, var(--pink-400), var(--magenta)); box-shadow: 0 4px 0 #8c2f6e; color: #fff; font-size: 2rem; }
  .nums li.me { outline: 4px solid var(--cyan); outline-offset: 2px; }
  .empty { margin: 0; opacity: 0.75; }
  .game { display: block; min-height: 3.75rem; padding: 1rem; border-radius: 18px; background: var(--cyan); box-shadow: 0 5px 0 #3bb9c2; color: var(--space-900); font-size: 1.375rem; font-weight: 900; text-decoration: none; }
  .game:active { transform: translateY(4px); box-shadow: 0 1px 0 #3bb9c2; }
  .mascot { display: block; width: 7rem; height: auto; margin: 0.25rem auto 0; filter: drop-shadow(0 4px 0 rgb(0 0 0 / 0.2)); }
  #updated { margin: 0; font-size: 0.8125rem; opacity: 0.85; }
  .closed h2 { margin: 0 0 0.5rem; font-size: 1.5rem; }
  .closed p { margin: 0; }
  .closed p + p { margin-top: 0.75rem; }
</style>
</head>
<body>
<main>
  <span class="logo"><img src="/brand/logo.webp" alt="やきとり TORI♡CO" width="480" height="477"></span>

  <section id="closed" class="card closed" hidden>
    <h2>ありがとうございました！</h2>
    <p>本日の営業は終了しました。<br>ご来店ありがとうございました ♥</p>
    <p>ミニゲームは これからも あそべます</p>
  </section>

  <section id="mine" class="card" aria-label="あなたの番号">
    <form id="form">
      <label for="n">整理券の番号を入れてください</label>
      <div class="row">
        <input id="n" name="n" type="number" inputmode="numeric" min="1" max="9999" placeholder="例：12" autocomplete="off">
        <button class="primary" type="submit">見る</button>
      </div>
      <p class="hint">整理券のQRコードを読み取ると、自動で入ります</p>
    </form>
    <div id="mine-view" hidden aria-live="polite">
      <p class="my-label">あなたの番号</p>
      <p id="my-number" class="my-number"></p>
      <p id="my-state" class="state plain"></p>
      <p id="my-detail" class="detail"></p>
      <button id="change" class="link" type="button">番号を変える</button>
    </div>
  </section>

  <div id="stats" class="stats" hidden>
    <div class="stat"><p>前に待っている組数</p><b id="ahead"></b></div>
    <div class="stat"><p>待ち時間のめやす</p><b id="eta"></b></div>
  </div>

  <a class="game" href="/game/">▶ 待っている間にミニゲーム</a>

  <p id="stale" hidden>最新の状況を取得できていません。店頭の画面をご確認ください</p>

  <section id="ready-sec" class="list" aria-labelledby="ready-h">
    <h2 id="ready-h">お呼び出し中</h2>
    <ul id="ready" class="nums ready" aria-live="polite"></ul>
    <p id="ready-empty" class="empty" hidden>いまはありません</p>
  </section>

  <section id="baking-sec" class="list" aria-labelledby="baking-h">
    <h2 id="baking-h">ただいま焼いています<span id="baking-count"></span></h2>
    <ul id="waiting" class="nums"></ul>
    <p id="waiting-empty" class="empty" hidden>いまはありません</p>
  </section>

  <img class="mascot" src="/brand/mascot.webp" alt="" width="300" height="286">
  <p id="updated"></p>
</main>
<script>
(function () {
  var POLL_MS = 10000;
  var STALE_MS = 60000;
  var KEY = "torico-number";
  var DAY_KEY = "torico-number-day";
  var BASE_TITLE = document.title;

  var input = document.getElementById("n");
  var form = document.getElementById("form");
  var view = document.getElementById("mine-view");
  var updatedAt = null;
  var hasStatus = false;
  var hasFetched = false;
  var failed = false;
  var refreshId = 0;
  var myNumber = null;
  var myDay = null;
  var lastState = null;
  var closed = false;

  function $(id) { return document.getElementById(id); }
  function store(value) {
    try { if (value === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, value); } catch (e) {}
  }
  function recall(key) {
    try { return localStorage.getItem(key || KEY); } catch (e) { return null; }
  }

  function setNumber(raw, day) {
    var n = parseInt(raw, 10);
    myNumber = n >= 1 && n <= 9999 ? n : null;
    myDay = myNumber && /^\\d{4}-\\d{2}-\\d{2}$/.test(day) ? day : null;
    try { if (myDay) localStorage.setItem(DAY_KEY, myDay); else localStorage.removeItem(DAY_KEY); } catch (e) {}
    lastState = null;
    store(myNumber ? String(myNumber) : null);
    var url = new URL(location.href);
    if (myNumber) url.searchParams.set("n", String(myNumber)); else url.searchParams.delete("n");
    if (myDay) url.searchParams.set("d", myDay); else url.searchParams.delete("d");
    history.replaceState(null, "", url);
    form.hidden = !!myNumber;
    view.hidden = !myNumber;
    input.value = "";
  }

  var TEXT = {
    otherDay: ["state plain", "この整理券は {日付}のものです", "今日の整理券の番号を入れてください"],
    ready: ["state done", "できあがりました！", "整理券を持ってお渡し口へどうぞ ♥"],
    waiting: ["state", "ただいま焼いています", "できあがったらこの画面が変わります"],
    served: ["state plain", "お渡し済み", "ご来店ありがとうございました ♥"],
    notFound: ["state plain", "この番号は使われていません", "整理券の番号をご確認ください"],
    none: ["state plain", "準備中です", "受付が始まると、ここに状況が出ます"],
    offline: ["state plain", "つながりません", "電波のよいところで、しばらくお待ちください（自動でやり直します）"],
    unknown: ["state plain", "状況を確認できません", "店頭の呼び出し画面をご確認ください"]
  };

  /** 今日（日本時間）の日付 YYYY-MM-DD */
  function today() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function isOtherDay() {
    return myDay && myDay !== today();
  }

  function formatDay(day) {
    var d = new Date(day + "T00:00:00Z");
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "（" + "日月火水木金土"[d.getUTCDay()] + "）";
  }

  function renderMine(lookup) {
    var s = myNumber && isOtherDay() ? "otherDay" : myNumber && lookup ? lookup.state : null;
    var done = s === "ready" && !closed;
    document.body.classList.toggle("done", done);
    $("stats").hidden = s !== "waiting" || closed;
    document.title = done ? "【できあがりました！】" + BASE_TITLE : BASE_TITLE;
    if (!myNumber) return;

    $("my-number").textContent = String(myNumber);
    // 更新が止まっている間に発行された番号を「使われていません」と言わないように
    var stale = updatedAt !== null && Date.now() - updatedAt >= STALE_MS;
    var t = TEXT[failed && !hasFetched ? "offline" : s === "notFound" && stale ? "unknown" : s || (hasStatus ? "notFound" : "none")];
    $("my-state").className = t[0];
    $("my-state").textContent = s === "otherDay" ? t[1].replace("{日付}", formatDay(myDay)) : t[1];
    $("my-detail").textContent = t[2];
    if (s === "waiting") {
      $("ahead").textContent = lookup.ahead + "組";
      $("eta").textContent = lookup.etaSeconds === null ? "—" : "約" + Math.max(1, Math.ceil(lookup.etaSeconds / 60)) + "分";
    }
    // 見ている間にできあがったら、震えて知らせる（対応している端末だけ）
    if (done && lastState === "waiting" && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    if (s) lastState = s;
  }

  function renderList(id, numbers) {
    var ul = $(id);
    ul.textContent = "";
    numbers.forEach(function (n) {
      var li = document.createElement("li");
      li.textContent = String(n);
      if (n === myNumber && !isOtherDay()) li.className = "me";
      ul.appendChild(li);
    });
    $(id + "-empty").hidden = numbers.length > 0;
  }

  function renderUpdated() {
    var el = $("updated");
    if (!updatedAt) { el.textContent = failed ? "通信できませんでした（自動でやり直します）" : "この画面は自動で更新されます"; $("stale").hidden = true; return; }
    var sec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    el.textContent = "最終更新：" + (sec < 60 ? sec + "秒前" : Math.floor(sec / 60) + "分前") + "（この画面は自動で更新されます）";
    $("stale").hidden = closed || Date.now() - updatedAt < STALE_MS;
  }

  /* 営業終了：番号まわりを隠して、お礼の表示に */
  function applyConfig(config) {
    closed = !!(config && config.closed);
    $("closed").hidden = !closed;
    ["mine", "ready-sec", "baking-sec", "updated"].forEach(function (id) { $(id).hidden = closed; });
    if (closed) { $("stale").hidden = true; $("stats").hidden = true; }
  }

  function refresh() {
    var id = ++refreshId;
    var number = myNumber;
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    function isCurrent() { return id === refreshId && number === myNumber; }
    fetch("/api/status" + (number ? "?n=" + number : ""), { cache: "no-store", signal: controller.signal })
      .then(function (res) { if (!res.ok) throw new Error("通信できませんでした"); return res.json(); })
      .then(function (data) {
        if (!isCurrent()) return;
        hasFetched = true;
        failed = false;
        var s = data.status;
        hasStatus = !!s;
        updatedAt = s ? Date.parse(s.updatedAt) : null;
        applyConfig(data.config);
        renderList("ready", s ? s.ready : []);
        renderList("waiting", s ? s.waiting : []);
        $("baking-count").textContent = s && s.waiting.length ? "（" + s.waiting.length + "組）" : "";
        renderMine(data.lookup);
        renderUpdated();
      })
      .catch(function () {
        if (!isCurrent()) return;
        failed = true;
        if (!hasFetched) renderMine(null);
        renderUpdated();
      })
      .finally(function () { clearTimeout(timeout); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    // 手で入れた番号は今日の整理券として覚える（次の日に別の人の番号と取り違えないように）
    setNumber(input.value, today());
    refresh();
  });
  $("change").addEventListener("click", function () {
    setNumber(null);
    input.focus();
    refresh();
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

  var params = new URLSearchParams(location.search);
  if (params.has("n")) setNumber(params.get("n"), params.get("d"));
  else setNumber(recall(), recall(DAY_KEY));
  renderMine(null);
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  setInterval(renderUpdated, 1000);
})();
</script>
</body>
</html>
`;
