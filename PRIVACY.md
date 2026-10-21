# Privacy

Type Deformerの編集、描画、Project、Preset適用、画像・動画書き出しはブラウザ内で実行されます。Analytics、行動計測、フィードバック送信フォームはありません。

## ブラウザに保存するもの

- IndexedDBの作業コピー（原文、書式、効果、Compose、Look等のProject情報と直前の保存世代）
- 起動時の完全な原本、別Projectへ切り替える前の原本などの復旧コピー。切替前の記録にはUndo／Redo履歴を含む場合があります
- タブの作業先を示すsessionStorage、終了前の未完了保存を保持するlocalStorageの一時journal
- User Presetや従来形式のAutosave等のlocalStorageデータ
- Favoriteと明示的に選択した直近12 Operator（`typeDeformer.discovery.v1`）

Favorite／RecentはProject、Share URL、Autosaveへ含めません。Favorite／Recentの保存値が壊れている、未知IDを含む、またはlocalStorageを利用できない場合は、その探索履歴を利用せず制作機能を継続します。作品保存の失敗は別の状態として通知し、作品データを同じ扱いで破棄しません。

復旧コピーと旧Autosaveは通常の保存で自動削除しません。終了前journalはIndexedDBの復旧コピーへ保存できた後に削除します。サイトデータを消去すると、作業コピー・復旧コピーを含むブラウザ内の記録が失われます。外部へダウンロードしたProjectファイルは別に残ります。

フォントの実データは選択したタブのメモリに保持し、Project、Share URL、IndexedDBの作品へ同梱しません。Projectのfont manifestには使用するfamily名、内容hash、face番号と、Import時のファイル名・サイズ・更新日時等の情報を含む場合があります。元ファイルの内容を埋め込まないことと、ファイル名等を一切記録しないことは異なります。

## 保存ファイルと共有

Project JSONとShare URLは編集用の状態を保持します。画面外の原文、Lookの内容、フォント依存情報も含まれ得ます。共有先はその状態を読めるため、現在表示されている文字だけを渡すものではありません。

SVGは既定で画像を内包し、編集情報の埋め込みは無効です。`SVGに編集情報を含める`を有効にすると、原文やLook等の状態を追加します。`文字SVG`は文字要素を含み、クリップ外の文字も残り得ます。書き出したSVGからGoogle Fontsを読み込むCSS importは追加しません。フォントなしで見た目を保持する必要がある場合は、画像内包SVGまたはPNGを使用してください。

## 外部通信

Preview版は画面用書体をGoogle Fonts（`fonts.googleapis.com`、`fonts.gstatic.com`）から取得します。この際、一般的なHTTPリクエスト情報がGoogleへ送信されます。Preset、Mediabunny、Operator画像は同じ配信元から取得します。

Cameraを開始した場合、許可された映像は端末内の検出にだけ使い、Type Deformerから外部へ送信しません。入力文、Project、書き出し結果もType Deformerから外部へ送信しません。Share URLを利用者自身が共有した場合は、そのURLを受け取った人が内容を復元できます。
