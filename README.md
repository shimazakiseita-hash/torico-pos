# taiyaki-pos

寮祭のたい焼き屋台で使う注文管理アプリ。レジで会計して呼び出し番号を発行し、
キッチンで焼き上がりを管理、客席側の画面とスマホで番号を呼び出す。
Next.js + SQLite で、スマホのテザリングによるローカルネットワーク内で動く。

## 画面

| パス | 用途 |
| --- | --- |
| `/register` | レジ（注文入力・番号発行） |
| `/kitchen` | キッチン（焼き待ち → 完成） |
| `/display` | 呼び出し番号の表示 |
| `/admin` | 集計・設定・CSV出力 |

`cloud/` はお客さん向け呼び出し状況ページ（Cloudflare Workers）。

## 動かし方

Node.js 22 以上が必要。`better-sqlite3` のビルドに `build-essential` と `python3` を使う。

```bash
npm install
npm run dev    # http://<PCのIP>:3000
npm test
```

## ドキュメント

- [docs/spec.md](docs/spec.md) — 仕様
- [docs/design.md](docs/design.md) — デザイン
- [docs/event-day.md](docs/event-day.md) — 当日の運用手順

## ライセンス

ソースコードは [MIT License](LICENSE)。

ただし `public/brand/` と `cloud/public/brand/` のロゴ・キャラクター画像はMITの対象外で、
権利者の許可なく利用できない。`cloud/public/fonts/` のフォントは各OFLファイルに従う。
