# Known limitations — 0.2.0-preview.1

- 動作保証は現行Desktop Chrome／Edgeです。Safari／Firefox／スマートフォンはbest effortです。
- 動画出力はWebCodecs対応のChrome／Edge専用です。codec、解像度、端末の実装によってMP4またはWebMを生成できない場合があります。失敗時に形式は自動変更しません。
- 390px／320pxはレイアウト崩れと横overflowを検査しますが、スマートフォンを正式対応環境とはしません。
- SVGで`SVG内Raster`と表示されるOperatorは、効果部分を埋め込み画像として保持します。編集先にも同じフォントがない場合、text要素の見た目が変わります。
- Google Fontsを外部から読み込みます。オフライン、通信制限、配信側障害では代替フォントになり、見た目や改行が変わる場合があります。
- Camera入力はHTTPSまたはlocalhostと利用者の許可が必要です。Camera映像は端末内で処理します。
- Autosaveは同じブラウザの保存領域に依存します。重要な作品はProjectファイルも保存してください。
- `noindex`は検索エンジンへの指示であり、URLを知る人の閲覧や共有を防ぐアクセス制御ではありません。
