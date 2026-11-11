# 本番ネットワークとサーバーの準備（Ubuntu 26.04）

スマホのテザリングを使わず、**サーバーPC自身がWi-Fiの親機（アクセスポイント）になる**。
他の3台のPCと責任者のスマホは、そのWi-Fiにつないでブラウザで開くだけ。注文・会計にインターネットは不要。

**ただし、整理券のQRから開くお客さん用ページ（spec 8.6）を使うには、サーバーPCだけインターネットに出られる必要がある**（「6. インターネット接続」）。

```
[サーバーPC = 受付PC]  Ubuntu 26.04 / Node.js / SQLite / Wi-Fi親機 (10.42.0.1)
      │  Wi-Fi「TORICO-POS」
      ├─ 焼き場PC            → http://10.42.0.1:3000/grill
      ├─ 渡し場PC（店員用）   → http://10.42.0.1:3000/handoff
      ├─ 渡し場PC（お客さん用）→ http://10.42.0.1:3000/display
      └─ 責任者スマホ（任意） → http://10.42.0.1:3000/admin
```

サーバーPCは受付PCを兼ねる想定（一番人がついていて、止まったら最初に気づける）。
別のPCをサーバーにしてもよい。その場合もアドレスは同じ。

> このファイルのコマンドは開発機（WSL）では実行しない。**本番のUbuntu機でのみ**実行する。
> Ubuntu 26.04 でコマンドや設定画面が違っていた場合は、実機の挙動を優先してこのファイルを直すこと。

## 1. 事前確認：Wi-Fiが親機になれるか

```bash
nmcli device status                                  # Wi-Fiのデバイス名を確認（例: wlp2s0）
iw list | grep -A 12 "Supported interface modes"     # 一覧に「* AP」があればOK
```
`* AP` が無い場合は「4. 代替案」へ。

## 2. アクセスポイントを作る（1回だけ）

```bash
sudo nmcli device wifi hotspot ifname <Wi-Fiデバイス名> con-name torico-ap ssid TORICO-POS password "<8文字以上>"
sudo nmcli connection modify torico-ap connection.autoconnect yes connection.autoconnect-priority 100
sudo nmcli connection modify torico-ap 802-11-wireless.band bg 802-11-wireless.channel 1
```
- サーバーPCのアドレスは既定で **`10.42.0.1`** に固定される（接続した端末にはIPが自動で配られる）
- 確認：`nmcli connection show torico-ap | grep ipv4.addresses` または `ip addr`
- 5GHzに対応していれば `band a` のほうが混雑に強い（全端末が5GHz対応の場合のみ）。当日つながりにくければチャンネルを 1 / 6 / 11 で変える
- 親機になっている間、そのPCは他のWi-Fiにはつなげない（開発時は `nmcli connection down torico-ap` で止める）
- 止める／始める：`nmcli connection down torico-ap` / `nmcli connection up torico-ap`
- GUIでも可：設定 → Wi-Fi → 「Wi-Fiアクセスポイントをオンにする」

ファイアウォール（ufwを有効にしている場合のみ）：
```bash
sudo ufw allow 3000/tcp
```

## 3. サーバーを自動起動にする

```bash
# Node.js は開発機と同じメジャーバージョンを入れる（.nvmrc 参照）
git clone <リポジトリ> ~/torico-pos && cd ~/torico-pos
npm ci            # node_modules はコピーせず、必ず本番機で入れ直す（better-sqlite3 がネイティブモジュールのため）
npm run build
sudo cp deploy/torico-pos.service /etc/systemd/system/   # User と WorkingDirectory を自分の環境に書き換えてから
sudo systemctl daemon-reload
sudo systemctl enable --now torico-pos
systemctl status torico-pos        # 動作確認
journalctl -u torico-pos -f        # ログ
```
これでPCの電源を入れるだけで、Wi-Fi親機とアプリ（`npm run event`：サーバー・お客さん向けページへの送信・10分ごとのバックアップ）が立ち上がる。落ちても自動で再起動する。
お客さん向けページへの送信には、リポジトリ直下に `.env.public` が要る（開発機からUSBメモリでコピーする。Git には入れない）。

## 4. スリープさせない（重要）

営業中にサーバーPCがスリープすると全端末が止まる。

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
# ふたを閉じても止まらないようにする
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```
- 設定 → 電源 で「画面のブランク：しない」「自動サスペンド：オフ」
- 他の3台も、画面が消えない・スリープしない設定にする
- サーバーPCは必ずACアダプターにつなぐ
- 祭りが終わったら `sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target` で戻す

## 5. 代替案（内蔵Wi-Fiが親機になれない／電波が不安定なとき）

| 案 | 内容 | 向き不向き |
|---|---|---|
| A. 小型Wi-Fiルーター | インターネットにつながない状態で電源だけ入れ、全端末をつなぐ。サーバーPCのIPはルーターのDHCP固定割当で固定する | 一番安定。機材が1つ増える |
| B. 有線LAN | スイッチングハブとLANケーブルで4台をつなぐ。サーバーPCに固定IP（例 `192.168.50.1/24`）、他は `192.168.50.x` | 電波の混雑に無関係。配線が必要 |
| C. スマホのテザリング | スマホのテザリングに全端末をつなぐ | 最終手段として手順を残す |

学園祭の会場は2.4GHzが非常に混雑する。**前日までに実際の出店場所で4台つないで試す**こと。
不安定なら、動かない2台（焼き場・お客さん用表示）だけ有線にする、という組み合わせもできる。

## 6. インターネット接続（整理券QRのお客さん用ページのためだけに使う）

お客さんのスマホは店のWi-Fiにはつながない（モバイル回線でインターネット上の公開ページを見る）。
そのため、サーバーPCが番号の状態を公開ページへ送れるよう、**サーバーPCにだけ**インターネットへの出口を用意する。
内蔵Wi-Fiは親機として使っているので、出口は別の経路にする。

| 案 | 内容 | 向き不向き |
|---|---|---|
| ア. スマホのUSBテザリング | スマホをUSBケーブルでサーバーPCにつなぎ、USBテザリングをON。Ubuntuは自動で有線接続として認識する | 追加機材なし。スマホは充電されながら置きっぱなしでよい。店内LANはスマホに依存しないので、スマホが外れても注文・会計は止まらない |
| イ. USB Wi-Fiアダプター | サーバーPCに挿し、学内Wi-Fiやモバイルルーターにつなぐ | スマホ不要。アダプターがUbuntuで動くか、学内Wi-Fiが屋外の出店場所まで届くかを事前確認 |
| ウ. モバイルWi-Fiルーター | ルーターを店内LANの親機としても使う（2〜3 のアクセスポイント設定は不要。5 の案Aと同じ構成でインターネット付き） | 一番単純。ルーターを借りられる場合 |

- 店内LANはサーバーPCが持つので、**インターネットが切れても営業は続けられる**（お客さんのスマホページの更新だけ止まる）
- 確認：`ping -c 3 1.1.1.1`、管理画面の「公開ページの最終更新時刻」
- データ量はごく小さい（数秒おきに番号の一覧を送るだけ）

## 7. 開発（WSL）と本番（Ubuntu）の違い

- 開発中は WSL 上で `npm run dev`、同じPCのブラウザで `http://localhost:3000` を開けば足りる
- 複数端末での確認は本番のUbuntu機で行う（WSLは外からつなぐのに追加設定が必要なので、やらない）
- コードは git で本番機に渡す。`data/`（DB）と `node_modules/` は渡さない
- 日付の扱いは `TZ=Asia/Tokyo` 前提。systemd のユニットで環境変数を指定済み
