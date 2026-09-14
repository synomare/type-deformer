# Privacy

Type Deformerの編集、描画、Project、Preset適用、画像・動画書き出しはブラウザ内で実行されます。Analytics、行動計測、フィードバック送信フォームはありません。

## ブラウザに保存するもの

- Autosave、User Presetなど既存の制作データ
- Favoriteと明示的に選択した直近12 Operator（`typeDeformer.discovery.v1`）

Favorite／RecentはProject、Share URL、Autosaveへ含めません。保存値が壊れている、未知IDを含む、またはlocalStorageを利用できない場合は安全に破棄し、制作機能を継続します。ブラウザのサイトデータを消去すると、これらも失われます。

## 外部通信

Preview版は画面用書体をGoogle Fonts（`fonts.googleapis.com`、`fonts.gstatic.com`）から取得します。この際、一般的なHTTPリクエスト情報がGoogleへ送信されます。Preset、Mediabunny、Operator画像は同じ配信元から取得します。

Cameraを開始した場合、許可された映像は端末内の検出にだけ使い、Type Deformerから外部へ送信しません。入力文、Project、書き出し結果もType Deformerから外部へ送信しません。Share URLを利用者自身が共有した場合は、そのURLを受け取った人が内容を復元できます。
