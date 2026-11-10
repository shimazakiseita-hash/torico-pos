# START HERE — taiyaki-pos を torico-pos に改修する

このキットは、寮祭の `taiyaki-pos` を津田沼祭の「やきとり TORI♡CO」用に作り替えるための指示書一式。

## 中身
```
CLAUDE.md                    Claude Code への指示（既存の CLAUDE.md を置き換える）
docs/spec.md                 仕様書（寮祭からの差分つき）
docs/design.md               デザイン指針（配色・フォント・素材の使い方）
docs/mock/index.html         4画面のモック（mock.png は同じものの画像）
docs/design-reference/       広報物の縮小版（メニュー表・ポスター・のぼり）
docs/tasks.md                実装タスク（フェーズ0〜7）
docs/network.md              本番 Ubuntu 26.04 の準備（Wi-Fi親機・自動起動・スリープ無効）
docs/event-day.md            当日の運用手順
deploy/torico-pos.service    systemd ユニット
public/brand/                ロゴとマスコット
```

## 手順（WSL）
```bash
# 1. 寮祭のリポジトリを複製する（履歴は残してよい）
cp -r ~/taiyaki-pos ~/torico-pos && cd ~/torico-pos
rm -rf node_modules .next data/*.db*

# 2. このキットを上書きで展開する（CLAUDE.md と docs/ が置き換わる）
unzip -o ~/torico-pos-kit.zip -d /tmp && cp -r /tmp/torico-pos-kit/. .

# 3. 依存を入れ直して Claude Code を起動
npm install && claude
```

## Claude Code への最初の指示
> CLAUDE.md と docs/ を読んで、docs/tasks.md のフェーズ0を実行して。コードはまだ変更しないで、既存の構成との食い違いと作業計画を報告して。

報告を確認したら「フェーズ1を進めて」と、1フェーズずつ進める。

## 決めておくこと（未確定のまま仮置きした点）
1. **仕込み本数**：SKUごと・日ごと。未入力なら「上限なし」で動く（管理画面から当日でも入力可）
2. **釣り銭準備金**：日ごとの金額（管理画面で入力）
3. **サーバーにするPC**：受付PCを想定。そのPCのWi-Fiが親機になれるか `docs/network.md` 1 で確認
4. **透過PNGのロゴ・マスコット**：広報委員会からもらえれば、宇宙背景に直接置ける
5. **ミニゲームの内容**：寮祭のものを着せ替えるだけか、新しくするか
6. **サーバーPCのインターネット接続**：整理券QRのお客さん用ページに必要。USBテザリング／USB Wi-Fiアダプター／モバイルルーターのどれにするか（`docs/network.md` 6）
7. **公開ページのURL** と **整理券の枚数**：URLは `https://torico-status.tsudanumasai.workers.dev/?n=<番号>`。先に Cloudflare ダッシュボードの Workers & Pages でサブドメインを `tsudanumasai` に変更する（取れなければ `tsudanumasai2026`）。確定しないと整理券を印刷できない
