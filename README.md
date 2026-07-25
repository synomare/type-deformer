# type deformer — 文字変形機

テキストを入力し、なぞる・固定する・ドラッグするの3つのモードで文字を変形してグラフィックを作るエディタ。PNG / SVG 書き出し、アートボード指定、プロジェクト保存に対応。

https://synomare.github.io/type-deformer/

## 概要

type deformer はブラウザだけで完結するテキスト変形エディタです。入力した文字列の1文字ずつを「グリフ」として扱い、以下の3つの操作モードで変形します。

- **なぞる（Lens Gesture）** — ポインタの軌跡に沿って近接する文字が引き寄せられ、離れると徐々に元へ戻る
- **固定する（Grid / Arrange）** — グリッドに文字を流し込み、ドラッグで位置を入れ替えたり固定したりする
- **ドラッグする** — 個々の文字やグループを直接ドラッグして配置・変形する

Stretch / Radial / Rotate / Skew / Mirror / Misregister / Confuse など複数の変形オペレータを重ねがけでき、Composition FX（背景の生成レイヤー）や動画（WebM/MP4ベータ）出力も備えます。書き出しは PNG・SVG・動画に対応し、アートボードサイズの指定（Auto / カスタム / SNS向けプリセットなど）、Fit のON/OFFも可能です。作品は数秒ごとにブラウザの localStorage へ自動保存され（直前の正常な保存も復旧用に保持）、Share URL ボタンで作品全体をURLに埋め込んで共有できます。

## ファイル構成

- `index.html` — アプリ本体。UI・変形ロジック・書き出し処理すべてを含む単一ファイルのフロントエンドアプリ（依存ライブラリなし、ビルド不要）。
- `confuse-dictionary.js` — Confuse オペレータ（文字を似た別の文字へ置き換える操作）が使う、Unicode の各種データ（confusables, Unihan, IVD など）由来の生成データ。`index.html` から `<script>` で読み込まれ、`window.TYPE_DEFORMER_CONFUSE_DICTIONARY` を提供します。サイズが大きいため通常は編集せず、`tools/` のスクリプトで再生成します。
- `tools/build-confuse-dictionary.mjs` — `confuse-dictionary.js` を Unicode の一次データから再構築するビルドスクリプト。
- `LICENSE` — 本リポジトリのライセンス（MIT）。

## ローカルでの動かし方

ビルド不要の単一 HTML ファイルなので、`index.html` をブラウザで直接開くだけで動作します。

```sh
open index.html          # macOS
xdg-open index.html      # Linux
```

一部のブラウザは `file://` での実行時にクリップボードや一部APIを制限することがあるため、うまく動かない場合は簡易サーバー経由での起動を試してください。

```sh
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

`confuse-dictionary.js` は `index.html` と同じディレクトリに置く必要があります。存在しない場合、Confuse オペレータは埋め込みの Core 辞書のみで動作するフォールバックになります。

## Confuse オペレータと辞書プロファイル

Confuse オペレータは、文字を見た目や由来が近い別の文字に確率的に置き換える変形です。強度（深さ）と辞書プロファイルを設定で選べます。

- **core** — HTML内に埋め込まれた小さな辞書のみを使用（全角/上付き・Cyrillic/Greek の紛らわしい文字など）。`confuse-dictionary.js` が無くても動作します。
- **unicode**（既定） — Core に加え、`confuse-dictionary.js` の skeleton（UTS #39 confusable skeleton）、Unihan の visual / compatibility / equivalent ideograph / variant、IVD の日本語コレクション（Adobe-Japan1 / Hanyo-Denshi / Moji_Joho）を利用
- **deep** — unicode に加え、Unihan の semantic variant と IVD のその他コレクション（ivsOther）も候補に含める
- **hanmax** — deep に加え、部首・画数（kRSUnicode / kTotalStrokes）が近い漢字を広く候補にする、最も網羅的なプロファイル。日本語ソース（kIRG_JSource）を持つ文字を優先しつつ、近傍の総画数までフォールバック探索する

## 辞書の再生成手順

`confuse-dictionary.js` は手で編集するファイルではなく、Unicode の公開データから `tools/build-confuse-dictionary.mjs` で生成します。Unicode のメジャーバージョンや IVD レジストリが更新されたら、以下で再生成してください。

```sh
node tools/build-confuse-dictionary.mjs
# 出力先を変える場合
node tools/build-confuse-dictionary.mjs --out /path/to/confuse-dictionary.js
```

- Node.js 18 以上、追加パッケージのインストールは不要（fetch / zlib / fs の組み込み機能のみ）
- ダウンロードしたソースファイルは `tools/.cache/` にキャッシュされ、2回目以降は再ダウンロードしません（`.gitignore` 済み）
- 出力は決定論的です。オブジェクトのキーや配列の要素はすべてソートされ、同じ入力データからは常に同一バイト列が生成されます
- プロキシ環境で Node の組み込み `fetch` がプロキシを自動認識しない場合は `NODE_USE_ENV_PROXY=1`（Node 22.21 以降）を付けて実行してください

詳細は `tools/README.md` を参照してください。

## ライセンス

- 本体（`index.html` および本リポジトリのコード）: MIT License（`LICENSE` 参照）
- `confuse-dictionary.js`: Unicode, Inc. が公開するデータ（Unicode Security Mechanisms の confusables、Unihan、UCD、IVD の各データ）から生成されており、[Unicode License v3](https://www.unicode.org/license.txt) の条件に従います。再配布・改変する場合はそちらのライセンス条項を確認してください。
