/** お客さんのスマホで開くページ（5秒ごとに更新。画像とフォントは cloud/public から配る） */

const FONT = `"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", Meiryo, system-ui, sans-serif`;

export const PAGE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2a1f5c">
<title>呼び出し状況｜やきとり TORI♡CO</title>
<style>
  @font-face { font-family: "Zen Maru Gothic"; font-weight: 700; font-display: swap; src: url("/fonts/zen-maru-gothic-700.woff2") format("woff2"); }
  @font-face { font-family: "Zen Maru Gothic"; font-weight: 900; font-display: swap; src: url("/fonts/zen-maru-gothic-900.woff2") format("woff2"); }
  :root {
    --space-900: #2a1f5c; --space-700: #3d2f7d; --space-500: #544591; --ink: #4a3f8c;
    --lav-300: #c9b3e6; --lav-100: #f1eafa; --pink-400: #e57bab; --magenta: #c5589d; --pink-100: #fde8f3;
    --cyan: #80f7fd; --ok: #2fa56b; --danger: #d93a5b;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    margin: 0; min-height: 100dvh; color: #fff; font-family: ${FONT}; font-weight: 700; font-variant-numeric: tabular-nums;
    background: linear-gradient(180deg, var(--space-500), var(--space-700) 45%, var(--space-900)) fixed;
    transition: background 0.6s;
  }
  body.done { background: linear-gradient(180deg, #4cc38a, var(--ok) 50%, #1d6b45) fixed; }
  main { max-width: 30rem; margin: 0 auto; padding: 1rem 1rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
  header { text-align: center; }
  .logo { display: inline-block; width: 9rem; padding: 0.5rem; border-radius: 28px; background: #fff; }
  .logo img { display: block; width: 100%; height: auto; }
  h1 { margin: 0.5rem 0 0; font-size: 1.25rem; font-weight: 900; }
  .card { padding: 1.25rem; border-radius: 28px; background: #fff; color: var(--ink); text-align: center; }
  label { display: block; margin-bottom: 0.5rem; font-weight: 900; }
  .row { display: flex; gap: 0.5rem; }
  input { flex: 1; min-width: 0; height: 3.5rem; padding: 0 1rem; border: 3px solid var(--lav-300); border-radius: 18px; font: inherit; font-size: 1.75rem; color: var(--ink); text-align: center; }
  button { font: inherit; cursor: pointer; }
  .primary { min-width: 5.5rem; border: 0; border-radius: 18px; background: linear-gradient(180deg, var(--pink-400), var(--magenta)); box-shadow: 0 5px 0 #8f3a72; color: #fff; font-size: 1.25rem; font-weight: 900; }
  .primary:active { transform: translateY(3px); box-shadow: 0 2px 0 #8f3a72; }
  .hint { margin: 0.75rem 0 0; font-size: 0.9rem; }
  .my-label { margin: 0; font-size: 0.95rem; }
  .my-number { margin: 0; font-size: 5rem; font-weight: 900; line-height: 1.1; color: var(--magenta); }
  .state { display: inline-block; margin: 0.25rem 0 0; padding: 0.4rem 1.25rem; border-radius: 999px; background: var(--magenta); color: #fff; font-size: 1.2rem; font-weight: 900; }
  .state.done { background: var(--ok); }
  .state.plain { background: var(--lav-100); color: var(--ink); }
  .detail { margin: 0.5rem 0 0; font-size: 0.9rem; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .stat { padding: 0.75rem; border-radius: 18px; background: rgb(255 255 255 / 0.15); text-align: center; }
  .stat p { margin: 0; font-size: 0.85rem; }
  .stat b { display: block; font-size: 1.6rem; font-weight: 900; }
  .link { display: block; margin: 1rem auto 0; border: 0; background: none; color: var(--ink); text-decoration: underline; }
  #stale { margin: 0; padding: 0.75rem 1rem; border-radius: 18px; background: var(--danger); text-align: center; }
  section h2 { margin: 0 0 0.5rem; font-size: 1.1rem; font-weight: 900; text-align: center; }
  .nums { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
  .nums li { min-width: 3.25rem; padding: 0.35rem 0.6rem; border-radius: 14px; background: #fff; color: var(--ink); font-size: 1.5rem; font-weight: 900; text-align: center; }
  .ready li { background: linear-gradient(180deg, var(--pink-400), var(--magenta)); color: #fff; font-size: 2rem; }
  .nums li.me { outline: 4px solid var(--cyan); }
  .empty { margin: 0; text-align: center; opacity: 0.75; }
  #updated { margin: 0; font-size: 0.85rem; text-align: center; opacity: 0.8; }
</style>
</head>
<body>
<main>
  <header>
    <span class="logo"><img src="/brand/logo.webp" alt="やきとり TORI♡CO" width="480" height="477"></span>
    <h1>呼び出し状況</h1>
  </header>

  <section id="closed" class="card" hidden>
    <h2>ありがとうございました！</h2>
    <p>本日の営業は終了しました。<br>ご来店ありがとうございました。</p>
  </section>

  <section id="mine" class="card" aria-label="あなたの番号">
    <form id="form">
      <label for="n">整理券の番号</label>
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

  <p id="stale" hidden>最新の状況を取得できていません。店頭の画面をご確認ください</p>

  <section id="ready-sec" aria-labelledby="ready-h">
    <h2 id="ready-h">お呼び出し中</h2>
    <ul id="ready" class="nums ready" aria-live="polite"></ul>
    <p id="ready-empty" class="empty" hidden>いまはありません</p>
  </section>

  <section id="baking-sec" aria-labelledby="baking-h">
    <h2 id="baking-h">ただいま焼いています<span id="baking-count"></span></h2>
    <ul id="waiting" class="nums"></ul>
    <p id="waiting-empty" class="empty" hidden>いまはありません</p>
  </section>

  <p id="updated"></p>
</main>
<script>
(function () {
  var POLL_MS = 5000;
  var STALE_MS = 60000;
  var KEY = "torico-number";
  var BASE_TITLE = document.title;

  var input = document.getElementById("n");
  var form = document.getElementById("form");
  var view = document.getElementById("mine-view");
  var updatedAt = null;
  var myNumber = null;
  var lastState = null;
  var closed = false;

  function $(id) { return document.getElementById(id); }
  function store(value) {
    try { if (value === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, value); } catch (e) {}
  }
  function recall() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function setNumber(raw) {
    var n = parseInt(raw, 10);
    myNumber = n >= 1 && n <= 9999 ? n : null;
    lastState = null;
    store(myNumber ? String(myNumber) : null);
    var url = new URL(location.href);
    if (myNumber) url.searchParams.set("n", String(myNumber)); else url.searchParams.delete("n");
    history.replaceState(null, "", url);
    form.hidden = !!myNumber;
    view.hidden = !myNumber;
    input.value = "";
  }

  function renderMine(lookup) {
    var s = myNumber && lookup ? lookup.state : null;
    var done = s === "ready";
    document.body.classList.toggle("done", done);
    $("stats").hidden = s !== "waiting" || closed;
    document.title = done ? "【できあがりました！】" + BASE_TITLE : BASE_TITLE;
    if (!myNumber) return;

    $("my-number").textContent = String(myNumber);
    var state = $("my-state"), detail = $("my-detail");
    if (done) {
      state.className = "state done";
      state.textContent = "できあがりました！";
      detail.textContent = "整理券を持ってお渡し口へどうぞ";
    } else if (s === "waiting") {
      state.className = "state";
      state.textContent = "ただいま焼いています";
      detail.textContent = "できあがったらこの画面が変わります";
      $("ahead").textContent = lookup.ahead + "組";
      $("eta").textContent = lookup.etaSeconds === null ? "—" : "約" + Math.max(1, Math.ceil(lookup.etaSeconds / 60)) + "分";
    } else if (s === "notFound") {
      state.className = "state plain";
      state.textContent = "呼び出し中・調理中にありません";
      detail.textContent = "お渡し済みか、番号をご確認ください";
    } else {
      state.className = "state plain";
      state.textContent = "準備中です";
      detail.textContent = "";
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
      if (n === myNumber) li.className = "me";
      ul.appendChild(li);
    });
    $(id + "-empty").hidden = numbers.length > 0;
  }

  function renderUpdated() {
    var el = $("updated");
    if (!updatedAt) { el.textContent = "準備中です"; $("stale").hidden = true; return; }
    var sec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    el.textContent = "最終更新：" + (sec < 60 ? sec + "秒前" : Math.floor(sec / 60) + "分前") + "（自動で更新されます）";
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
    fetch("/api/status" + (myNumber ? "?n=" + myNumber : ""), { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var s = data.status;
        updatedAt = s ? Date.parse(s.updatedAt) : null;
        applyConfig(data.config);
        renderList("ready", s ? s.ready : []);
        renderList("waiting", s ? s.waiting : []);
        $("baking-count").textContent = s && s.waiting.length ? "（" + s.waiting.length + "組）" : "";
        renderMine(data.lookup);
        renderUpdated();
      })
      .catch(renderUpdated);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    setNumber(input.value);
    refresh();
  });
  $("change").addEventListener("click", function () {
    setNumber(null);
    input.focus();
    refresh();
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

  setNumber(new URLSearchParams(location.search).get("n") || recall());
  refresh();
  setInterval(refresh, POLL_MS);
  setInterval(renderUpdated, 1000);
})();
</script>
</body>
</html>
`;
