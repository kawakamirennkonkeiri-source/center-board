# センター電子黒板（GitHub Pages で一元管理）

センターの電子黒板・配置図・資材管理アプリを **GitHub Pages** で配信し、
各PCは「ローカルのHTMLファイル」ではなく **URLをブックマーク**して開く。
直したいときは、このリポジトリを1回コミット＆プッシュすれば **全PCは再読込するだけ**で最新になる。

## 公開URL（GitHub Pages 有効化後）

| 画面 | URL |
|---|---|
| 電子黒板（メイン） | `https://kawakamiclaud.github.io/center-board/` |
| 配置図ツール（単独） | `https://kawakamiclaud.github.io/center-board/haichi.html` |
| 資材管理アプリ | `https://kawakamiclaud.github.io/center-board/shizai.html` |

※ `kawakamiclaud` は実際のGitHubアカウント名／リポジトリ名に置き換え。

## 中身

- `index.html` … 電子黒板（メイン画面）。元ファイル＝`../電子黒板イメージ.html`
- `haichi.html` … 配置図デジタル配置ツール。元ファイル＝`../センター配置図_デジタル配置ツール.html`
- `shizai.html` … 資材管理アプリ。元ファイル＝`../資材管理アプリ.html`
- `gas/` … バックエンド（Google Apps Script）の**バックアップ**。GAS本体はApps Scriptエディタ側で編集・再デプロイする（Pagesでは動かない）。

## 直し方（更新フロー）

1. このフォルダの `index.html` などを編集（元ファイルを直したらここへコピーし直す）
2. `git add -A && git commit -m "説明" && git push`
3. 各PCは電子黒板を**再読込（F5）**するだけで最新になる

## ⚠ 大事な設定：Slack Webhook は GitHub に載せない

ヘルプ要請の送信先（Slack Incoming Webhook URL）は、**HTMLには書かず GAS 側で保持**する。
公開リポジトリでも漏れないようにするため。設定は1回だけ：

1. Apps Script を開く →「プロジェクトの設定 ⚙」→「スクリプト プロパティ」
2. プロパティを追加：**キー `HELP_WEBHOOK`** ／ **値 `https://hooks.slack.com/services/XXX/YYY/ZZZ`**
3. 保存 → `センター連携.gs` を**新バージョンで再デプロイ**
4. エディタで `testSendHelp` を▶実行し、Slackにテスト投稿が届けばOK

電子黒板の「ヘルプ要請」ボタンは `?type=sendHelp` で GAS を呼び、GASがこのWebhookへ投稿する。

## ⚠ このリポジトリに入れてはいけないもの

Excel（シフト・発注書・棚卸）など**個人情報・社内データは絶対に置かない**（公開されるため）。
front-end の HTML と GAS のコードだけを置く。`.gitignore` で `*.xlsx` 等は除外済み。
