# torico-pos

[![継続的インテグレーション](https://github.com/shimazakiseita-hash/torico-pos/actions/workflows/ci.yml/badge.svg)](https://github.com/shimazakiseita-hash/torico-pos/actions/workflows/ci.yml)

津田沼祭（2026年11月21日・22日）の焼き鳥屋台「やきとり TORI♡CO」（寮友会執行役員会）で使う注文・会計アプリ。
受付で現金会計をして呼び出し番号を発行し、焼き場で「完成」、渡し場で「渡した」を押す。

注文・会計はインターネットなしで動く。サーバーPC（Ubuntu）が Wi-Fi の親機になり、ほかの端末はブラウザでつなぐ。
整理券のQRから開くお客さん用ページ（`cloud/`、Cloudflare Workers）だけがインターネットを使う。

## 画面

| パス | 用途 |
| --- | --- |
| `/register` | 受付（注文入力・現金会計・番号発行） |
| `/grill` | 焼き場（注文順のカード → 完成） |
| `/handoff` | 渡し場・店員用（呼び出し中 → 渡した） |
| `/display` | 渡し場・お客さん用（呼び出し番号の表示） |
| `/admin` | 管理（集計・レジ締め・仕込み数・CSV） |

## メニュー

串5種（もも・かわ・ねぎま・つくね・ぼんじり）× 味付け2種（たれ・塩）、すべて1本100円。定義は [src/lib/menu.ts](src/lib/menu.ts)。

## 動かし方

Node.js 24（`.nvmrc`）。`better-sqlite3` のビルドに `build-essential` と `python3` を使う。

```bash
nvm use
npm install
npm run dev     # http://localhost:3000
npm test
```

当日は `npm run event`（本番サーバー・お客さん用ページへの送信・自動バックアップをまとめて起動）。
DB は `data/torico.db`。呼び出し番号は営業日（日本時間の日付）ごとに1から振り直す。

## お客さん用ページ（整理券のQR）

Cloudflare Workers の `torico-status`（[cloud/](cloud/)）。保存先は Worker に付属する Durable Objects。
サーバーPCの `npm run public-sync`（`npm run event` に含まれる）が、今日の番号・状態・待ち時間の目安だけを数秒おきに送る。
送れているかどうかは管理画面の「公開ページ」に出る（60秒以上送れていなければ赤）。

```bash
cd cloud
npm install
npx wrangler whoami                 # 責任者のアカウントか確認
npx wrangler secret put PUSH_TOKEN  # サーバーPCからの送信の合言葉（長いランダムな文字列）
npx wrangler secret put SESSION_SECRET
npm run deploy                      # name が torico-status であることを確認してから
```

サーバーPCのリポジトリ直下に `.env.public` を置く（コミットしない）。

```
PUBLIC_STATUS_URL=https://torico-status.<サブドメイン>.workers.dev
PUBLIC_STATUS_TOKEN=<PUSH_TOKEN と同じ値>
```

お客さん用ページでは、ミニゲーム「つみつみ串」「とりこフライト」（`cloud/public/game/`）を遊べる。
やきとりポイントでガチャ（きせかえ）とショップ（強化）を利用でき、自分の番号ができあがるとゲームを止めて知らせる。
ランキングの確認・削除は `npm run ranking -- flight`（ゲーム名は tsumi・flight）。

整理券は `npm run tickets -- 1 1 500` と `npm run tickets -- 2 1 500` で `print/tickets-day1.html`・`print/tickets-day2.html` を作り、ブラウザで A4・倍率100%・背景のグラフィックありで印刷する（日を指定し、番号を省略すると1〜500番）。1日目はピンク、2日目は水色で、日付も表示する。

## ドキュメント

- [docs/spec.md](docs/spec.md) — 仕様
- [docs/design.md](docs/design.md) — デザイン指針（完成イメージ：[docs/mock/mock.png](docs/mock/mock.png)）
- [docs/tasks.md](docs/tasks.md) — 実装タスク
- [docs/network.md](docs/network.md) — 本番サーバーとネットワークの準備
- [docs/event-day.md](docs/event-day.md) — 当日の運用手順

## ライセンス

ソースコードは [MIT License](LICENSE)。

ただし次のものは MIT の対象外で、権利者の許可なく利用できない。

- `public/brand/`・`cloud/public/brand/`・`src/app/icon.png` のロゴ・キャラクター画像
- `docs/mock/` の画像

`cloud/public/fonts/` のフォントは、それぞれの OFL ファイルに従う。
