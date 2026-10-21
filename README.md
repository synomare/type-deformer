# type deformer — 文字変形機

> Limited Preview — ブラウザで制作する文字変形エディタです。検索エンジン向けの`noindex`はアクセス制限ではありません。

Type Deformerは、文字を字形・文字間の関係・線の流れ・印刷面・版面・立体構造として作り変えます。116 Operatorと436 Presetを収録し、制作目的や見本画像から選べます。

この作業ツリーの`0.3.0-preview.1`構造修正はローカル未公開です。下記の現行仕様と、公開済み版の状態は区別してください。

## 3分で始める

1. `01 TEXT`で文字を入力し、書体と組み方向を選びます。
2. `02 EFFECT`の`探す / Discover`からOperatorを選び、`Apply`します。Presetは`436 Presets / 画像から選ぶ`を初めて開いた時に読み込まれます。
3. `05 EXPORT`のPreflightを確認し、PNGまたはSVGを書き出します。動く作品はComposeを適用してからWebM/MP4を選びます。

## 作品を保存・復旧する

`Save project`は編集可能なProject JSONを保存します。現行のProject schemaはv93で、文書ID・編集世代、原文範囲に対応する文字状態、フォント依存情報を保持します。v92以前のファイルは互換読込の対象です。schema番号はアプリのリリース番号ではありません。

自動保存はIndexedDBのタブ別作業コピーへ書き込みます。起動時は文字だけで再開し、元の書式・効果を含む作品は先に復旧コピーへ保存します。別Projectを開く前の作品も退避し、Projectメニューの`保存した作品・復旧コピー`からJSON保存または再読込できます。ブラウザのサイトデータを消去すると保存も失われるため、重要な作品はProjectファイルを別に保管してください。

終了時に保存待ちだったデータは、次回起動時に復旧コピーと元の作業コピーへ照合します。通常の保存完了で、それより新しい終了時データを消さないように、文書・編集世代・内容の一致を確認します。

Importしたフォントは内容のSHA-256で識別します。同じ内容なら名前や更新日時が変わっても同じ書体として扱います。フォントデータはProjectやShare URLに含まれないため、再起動後は再Importしてください。旧形式の書体参照や別の内容への変更は明示的な再リンクが必要です。FavoriteとRecentはブラウザのlocalStorageに保存し、ProjectやShareには入りません。

## 対応環境と出力

中心となる対応環境はDesktop Chrome／Edgeです。Safari／Firefox／スマートフォンはbest effortです。画面幅の模擬検査やWebKitの一部試験は実iPhoneでの確認と区別しています。動画出力はWebCodecs対応のChrome／Edgeを使用します。

SVGは既定で画像を内包し、指定した出力密度の見た目を保持します。`文字SVG`では同じフォントが必要で、効果は画像を含みます。編集情報の埋め込みは選択式です。詳しくは[既知制約](KNOWN_LIMITATIONS.md)と[検証範囲](docs/verification-scope.md)を参照してください。

## 開発と検証

Node.js 24を基準にしています。依存関係の導入は`npm ci`、ローカル起動は`node scripts/serve-static.mjs`です。

- `npm test`: 数値・状態・描画・生成物の回帰検査。
- `npm run test:contracts`: Project、フォント識別、Operator定義、文字配置の境界を検査。
- `npm run test:e2e`: 設定されたPlaywrightブラウザで操作・保存・フォント・出力を検査。実行するブラウザは[設定](playwright.config.js)を参照してください。
- `npm run check:release:local`: 実行時依存、配布文書のローカルリンク、必要ファイルの存在を検査。
- `npm run check:release`: 同じ検査に加え、配布に必要なファイルがすべてGit追跡済みか確認。新規ファイルを未追跡のまま残した作業中は失敗します。

コマンドの掲載は合格の記録ではありません。変更ごとの実行環境と結果を分けて記録してください。内部構造は[現行アーキテクチャ](docs/current-architecture.md)、描画と出力は[Runtime pipeline](docs/runtime-pipeline.md)、Operatorの定義と数値条件は[Operator contracts](docs/operator-contracts.md)、計算の最適化は[Operator performance](docs/operator-performance.md)にあります。

実行時ソースを編集した後は`npm run build:runtime`でWorkerとBuildInfoを再生成します。BuildInfoは改行を正規化したソースのhashから描画実装を識別し、ProjectとShareへその識別子を保存します。書体やブラウザを固定するものではありません。

アプリの配布版は[package.json](package.json)と[release manifest](release-manifest.json)で管理します。[Changelog](CHANGELOG.md)は未公開変更と公開済み更新を区別し、[開発履歴アーカイブ](docs/development-history.md)には従来READMEの記録を残しています。

## 権利・通信

利用者が入力・読み込み・生成・書き出した内容について、Type Deformerは権利を主張しません。入力文、フォント、画像その他の素材の利用条件は利用者が確認してください。コードと素材の条件は[LICENSE](LICENSE)、[素材ライセンス表](ASSETS_LICENSE.md)、[第三者通知](THIRD_PARTY_NOTICES.md)を参照してください。

Google Fontsへ接続します。入力文やImportしたフォントを送信する機能、Analytics、フィードバック送信機能はありません。通信と保存の説明は[Privacy](PRIVACY.md)を参照してください。
