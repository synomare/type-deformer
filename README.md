# type deformer — 文字変形機

> `0.2.0-preview.1` Limited Preview — 検索結果への掲載を止めた、動作確認中の公開候補です。

Type Deformerは、文字を単なるテキストではなく、字形・文字間の関係・線の流れ・印刷面・版面・立体構造として作り変えるブラウザエディタです。116 Operatorと436 Presetを収録し、すべてを一覧できるほか、制作目的から厳選入口を選べます。

## 3分で始める

1. `01 TEXT`で文字を入力し、書体と組み方向を選びます。
2. `02 EFFECT`の`探す / Discover`から目的またはOperatorを選び、`Apply`します。Presetは`436 Presets / 画像から選ぶ`を初めて開いた時に読み込まれます。
3. `05 EXPORT`のPreflightを確認し、PNGまたはSVGを書き出します。動く作品はComposeを適用してからWebM/MP4を選びます。

## 対応環境

動作保証は現行Desktop Chrome／Edgeです。Safari／Firefox／スマートフォンはbest effortで、既知制約があります。動画はWebCodecsを利用するため、現行Chrome／Edgeが必要です。詳細は[既知制約](KNOWN_LIMITATIONS.md)を参照してください。

## 保存と共有

Project、Autosave、Share URL、User Presetは既存v92形式を維持します。FavoriteとRecentだけはこのブラウザのlocalStorageへ保存され、ProjectやShareには入りません。重要な作品はProjectファイルも保存してください。

## 権利・通信・Preview上の注意

利用者が入力・読み込み・生成・書き出した内容について、Type Deformerは権利を主張しません。入力文、フォント、画像その他の素材を利用する権利は利用者が確認してください。コードと素材では条件が異なります。詳しくは[LICENSE](LICENSE)、[素材ライセンス表](ASSETS_LICENSE.md)、[第三者通知](THIRD_PARTY_NOTICES.md)、[Privacy](PRIVACY.md)を参照してください。PreviewではGoogle Fontsへ接続しますが、Analyticsやフィードバック送信機能はありません。

## 開発記録

### Wasserstein Letters — words and contour quality / v91 local

**116 Operator・436 Presets・50系統**。Partnerは1〜32文字、Unitで「一文字ずつ／文字列全体」を選択。単語どうし・文字数違い・日本語縦組みに対応し、全体では先頭の対象文字の書体・設定を使う。既存4設定のPNGは不変。複数文字のUndo・保存復元・SVG・390px・全体テストを確認。同じ433–436の4設定を品質改良。字形を閉曲線として描き直し、移動の各段階の輪郭を重ねたTracksへ更新。512角の再構成・連続幅フィルター・端点の表示補正を追加。13数学・結線、関連55件、26描画条件、保存・Undo／Redo・Share・PNG/SVG、390px・縦組み、旧10作品PNG不変、全体テストを確認。数値質量と黒面積は別。静止画向け・SVGは画像内包。未公開。[研究・改善前後・検証](wasserstein-letters-research.md#品質改善2026-09-09第2パス)。以下は追加時点の履歴。

### Repulsive Curves — 1 operator / v90 local

**115 Operator・432 Presets・49系統**。Effect → **432 Presets / 画像から選ぶ → 新作4案**。字形の輪郭を閉曲線にし、接線方向の反発・長さ・容器の奥行きから立体的なたわみを求める。429–432の4設定、8軸、12 PNG＋Project、初期曲線と生成後を回転して比較できる画面。数式・結線10テスト、関連54件、21描画条件、初期配置104条件、保存・Undo／Redo・Share・PNG/SVG、390pxと縦組み、旧10作品PNG不変、全体テスト・validatorを確認。独自の数値近似で、位相保存・厳密な非交差は保証しない。細い画は分かれる場合がある。静止画向け、SVGは画像内包。未公開。[研究・生成規則・検証](repulsive-curves-research.md)。以下は追加時点の履歴。

### Wulff Body — 1 operator / v89 local

**114 Operator・428 Presets・48系統**。Effect → **428 Presets / 画像から選ぶ → 新作4案**。結晶の面方位ごとの表面エネルギーから一粒の形を作り、体積を揃えた粒で文字を組む。面比率・板と針・粒間隔・向き・視点など8軸、425–428の4設定、12 PNG＋Project、一粒と文字を同時に変えられる比較画面。数学・結線7テスト、29描画条件、保存・Undo／Redo・Share・PNG/SVG、390px、縦組み、旧12作品PNG不変、全体テスト・validatorを確認。有限面方向の幾何モデルで、粒配置と板／針は独自拡張。接触や成長は解かない。静止画向け、SVGは画像内包。未公開。[研究・生成規則・検証](wulff-body-research.md)。以下は追加時点の履歴。

### Liquid Rope — 1 operator / v88 local

**113 Operator・424 Presets・47系統**。Effect → **424 Presets / 画像から選ぶ → 新作4案**。粘性糸の接地点モデルを文字へ沿わせ、巻き重なり、交互ループ、同じ速度での加速／減速の形の違いをつくる。5つまみ＋履歴、421–424の4設定、12 PNG＋Project、速度を変えられる比較画面。数学・結線6テスト、25描画条件、保存・Undo／Redo・Share・PNG/SVG、390px、縦組み、旧11作品PNG不変、全体テストと最終UIの対象チェックを確認。平面の幾何モデルで、糸同士の接触や上下関係は解かない。静止画向け、SVGの効果は画像内包。未公開。[研究・生成規則・検証](liquid-rope-research.md)。以下は追加時点の履歴。

### Gravity Lens — 1 operator / v87 local

**112 Operator・420 Presets・46系統**。Effect → **420 Presets / 画像から選ぶ → 新作4案**。重力レンズの逆光線写像で、文字を環・反転した対・四方の像・連星の結び目へ変える。8つまみ＋単独／連星、417–420の4設定、本体から12 PNGとProject、ドラッグできる実験欄を追加。数学・結線7グループ、31描画条件、通常UI・保存・Undo／Redo・独立したShare復元・出力、390px、縦組み、旧24作品のPNG不変、全体テスト＋最終UI調整後の対象テストを確認。薄いレンズと点質量の近似、文字ごとに独立適用。静止画向け、SVGの効果は画像内包。未公開。[研究・生成規則・検証](gravity-lens-research.md)。以下は追加時点の履歴。

### Metamorphic Body — 3 operators / v86 local

**111 Operator・416 Presets・45系統**。Effect → **416 Presets / 画像から選ぶ → 新作6案**。Kresling Shellは高さと回転が連動する折り筒、Growth Buckleは字画の成長差による座屈、Inversion Bodyは厚みと空洞をまとめた球面反転。411–416の6設定、実描画18 PNGとProject JSON、つまみを動かせる比較ページを追加。数学6グループ・80描画条件、通常UI・保存・Undo／Redo・出力・独立した保存状態からのShare復元、390px・縦組み混在、旧16作品のPNG不変、全体npm testを確認。物理再現ではなく造形のための幾何／離散近似、静止画向け、SVG効果部は画像内包。未公開。[研究・生成規則・検証](metamorphic-body-research.md)。以下は各追加時点の履歴です。

### OVERDRIVE — 240 new combinations / v85 local

**108 Operator・410 Presets・44系統**。Effect → **410 Presets / 画像から選ぶ → 新作240案**。2026-09-09に171–410の240案を追加しました。今回の24系統は金属、刃、渦、分岐、連環、曲面、堡塁、鰓、偏光、液晶、結晶、多孔体、折板、軌道、霜、合金、釉薬、荷重、流体、二色刷り、架空筆記、共鳴、異形ペン、字画の変異。各案は異なる3 Operatorの組み合わせで、旧170案との組み合わせ集合も重複しません。

41種類の既存Operatorを使用し、主役と補助の形・密度・濃度・層順を設定。新作240枚のネイティブPNGと600×370 JPEGを用意し、全件の再構成Projectと描画設定を照合しました。個別の造形は今回の提案で、ユーザーの確定した好みではありません。印章系24案は実描画比較後、背面・濃度・到達範囲を調整しました。

新作240／厳選122（旧74＋新48）／全410、名前・Operator検索、系統絞り込みから選べます。「いまの文字に適用」は原文・書体・版面を保ち、「見本を再現」は構図も呼び出します。既存170 Project fingerprintは全件不変。Project形式はv85を維持し、Operatorの生成原理は変更していません。

検証：専用 npm run test:presets 13グループ、全体 npm test、静的検査（2205 IDs／1335参照／0 warnings）を通過。Chrome／Playwright 1280×900・390×844で新作240入口、検索・絞り込み・空状態復帰、選択時の不変、日本語への適用、見本再現、Undo／Redo、保存reload、通常PNG、末尾410の選択・適用・Undo・44pxボタン・Escapeを確認。223の通常PNGは見本と全画素一致。console／page error・warningは0。実iPhone Safari・公開環境・長時間演奏は未検証。未commit・未push・未公開。

再生成仕様・証拠：2026-09-09/type-deformer taskの work/specs.mjs、build.mjs、render.mjs、verify.mjs。画像・JSON・検索可能な一覧：同taskの outputs/overdrive-240/index.html。以下は各追加時点の履歴です。


### Letterform Body — 2 operators / v85 local

108 Operator・170 Presets。Effect → **170 Presets / 画像から選ぶ → 新作6案**。Nib Recastは骨格を異形のペンで引き直し、Anatomy Warpは字画と穴の並びを保って比重と反りを変えます。特殊な書体のような6設定を追加。数学8グループ・55描画条件、通常UI・保存・Undo／Redo・出力・Share復元、390px・縦組み混在、旧8作品のPNG不変、全体npm testを確認。既存の書体へ適用する静止画用変形、SVG効果部は画像内包。未公開。[研究・生成規則・検証](letterform-body-research.md)。以下は履歴です。

### Folded Body — 2 operators / v84 local

106 Operator・164 Presets。Effect → **164 Presets / 画像から選ぶ → 新作6案**。Linked Twistは二つの渦で字画と穴を巻き込み、Enneper Bodyは文字を極小曲面へ写して折り重ねます。数学8グループ・52描画条件、通常UI・保存・Undo／Redo・出力・Share復元、390px・縦組み混在、旧8作品のPNG不変、全体npm testを確認。静止画向け、SVG効果部は画像内包。未公開。[研究・生成規則・検証](folded-body-research.md)。以下は履歴です。

### Ramified Body — 2 operators / v83 local

104 Operator・158 Presets。Effect → **158 Presets / 画像から選ぶ → 新作6案**。Beltrami Flowは局所の異方性から字画と穴を巻き替え、Riemann Ramificationは多項式の全逆像から新しい接続と負形を作ります。以前の8種を維持。数学9グループ、55描画条件、6見本の通常UI・保存・Undo／Redo・出力・Share復元、390px、前版8種のPNG不変、全体npm testを確認。静止画向け、SVG効果部は画像内包。未公開。[研究・実装・検証](ramified-body-research.md)。以下は履歴です。

### Excess Body — 8 operators / v82 local

画像比較した8案を本体に追加し、102 Operator・152 Presetsになりました。Effect → **152 Presets / 画像から選ぶ → 新作8案**。多極尖頭、刃の身体、黒い堡塁、深淵のインクトラップ、絞扼、鰓の列、螺旋押出し、調和ケージを、原文へ適用または見本再現できます。8種のUI・保存・Undo/Redo・SVG、代表Share/PNGと390px、171描画条件、既存6作品の画素不変、全体npm testを確認。旧プリセットは維持。静止画向けでSVG効果部は画像内包。ローカルのみ・未公開。[生成規則・検証・近似](excess-body-research.md)。以下は先行版の記録です。

テキストを入力し、なぞる・固定する・ドラッグするの3つのモードで文字を変形してグラフィックを作るエディタ。PNG / SVG 書き出し、アートボード指定、プロジェクト保存に対応。

## Workflow usability

### Stress Glass — new Operator / v81 local

全94 Operator。02 EFFECT → STRESS GLASS / 力を映すガラス。文字の有限要素応力を偏光色へ変換します。Bridge / Cantilever / Shear、Force / Retardance / Direction / Analyzer / Bevel。支点・力・字形から模様を算出し、細かすぎる縞を画素内で平均します。

Batch、Surface Mixer、Project／Share／Look v81、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chrome、極値24条件・小文字24条件のalpha一致と応力残差、先行18種の画素一致を確認。表示用の正規化と2D線形弾性を使用し、実ガラスの測定ではありません。未commit・未push・未公開。[研究と検証](stress-glass-research.md)。以下は履歴です。

### Vortex Bath — new Operator / v80 local

全93 Operator。02 EFFECT → VORTEX BATH / 字形の流体浴。字形を染料とし、自己移流・Fourier粘性・発散除去で進む流れへ放ちます。Stir / Lift / Shear。Time / Force / Eddy / Viscosity / Relief。

Batch、Surface Mixer、Project／Share／Look v80、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存画素復元・全数値・出力・320/390px、極値24条件と小文字24条件を確認。流速の発散と染料の質量誤差を区別し、周期境界と有限gridの近似を記録。Time0／Force0は元alphaに完全一致。静止画向け、SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](vortex-bath-research.md)。以下は履歴です。

### Miura Vault — new Operator / v79 local

全92 Operator。02 EFFECT → MIURA VAULT / 面を保つ折り。平行四辺形の辺長・面積を保つミウラ折りで、文字を折板・透かし骨組み・積層体へ変えます。Sheet / Fretwork / Layers。Fold / Cell / Angle / Gauge / Spin。

Batch、Surface Mixer、Project／Share／Look v79、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存画素復元・全数値・出力・320/390px、極値24条件と小文字24条件を確認。厚み・切り抜き・層の間隔は独自の描画構成であり、厚紙の製造や接合した構造材の解析ではありません。SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](miura-vault-research.md)。以下は履歴です。

### Hopf Loom — new Operator / v78 local

全91 Operator。02 EFFECT → HOPF LOOM / 円軌道の織機。字形を4次元の球面上の円軌道へ持ち上げ、投影した殻・薄板・繊維の身体へ展開します。Shell / Lamina / Fibers。Orbit / Chart / Gauge / Yaw / Tilt。

Batch、Surface Mixer、Project／Share／Look v78、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存画素復元・全数値・出力・320/390px、極値24条件と小文字24条件を確認。幾何学的なsweepであり物理材料の変形ではありません。開いた円弧に閉じた輪の絡み数を適用しません。SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](hopf-loom-research.md)。以下は履歴です。

### Density Recast — new Operator / v77 local

全90 Operator。02 EFFECT → DENSITY RECAST / 密度から鋳直す。文字を正の密度分布として読み、円盤・環・曲がった帯へ、縦横二段階で座標を移し替えます。Channel / Disk / Annulus。Transfer / Air / Width / Drift / Relief。

Batch、Surface Mixer、Project／Share／Look v77、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存画素復元・全数値・出力・320/390px、極値24条件と小文字24条件を確認。有限メッシュ上の座標写像は可逆ですが、可視面積の保存や微細な隙間の保持を保証するものではありません。SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](density-recast-research.md)。以下は履歴です。

### Spinodal Alloy — new Operator / v76 local

全89 Operator。02 EFFECT → SPINODAL ALLOY / 相分離の合金。文字の中で二つの相を分離させ、丸い空洞・輪郭に沿う被膜・横へ伸びる組織を作ります。Duplex / Wetting / Drawn。Mixture / Anneal / Grain / Relief / Dealloy。

Batch、Surface Mixer、Project／Share／Look v76、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存画素復元・全数値・出力・320/390px、極値24条件と小文字12条件を確認。計算は各字形成分の材料量を維持します。SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](spinodal-alloy-research.md)。以下は履歴です。

### Nodal Glaze — new Operator / v75 local

全88 Operator。02 EFFECT → NODAL GLAZE / 固有模様の釉薬。文字の固有モードを解き、元の輪郭と透明度を保ったまま、波の起伏と象嵌を描きます。Free / Clamped / Elastic、Mode / Coupling / Contours / Relief / Inlay。

Batch、Surface Mixer、Project／Share／Look v75、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存画素復元・全数値・出力・320/390px、36条件のalpha完全保持、固有模様cacheの退避・再構築を確認。SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](nodal-glaze-research.md)。以下は履歴です。

### Loadpath Foundry — new Operator / v74 local

全87 Operator。02 EFFECT → LOADPATH FOUNDRY / 荷重の鋳型。文字の外周を残し、支点と荷重から内部の材料配置を計算します。Bridge / Cantilever / Shear。Interior / Ligament / Evolution / Force / Relief。

Batch、Surface Mixer、Project／Share／Look v74、Undo、PNG／SVG、実描画カタログへ接続。全体npm test、実Chromeの保存復元・全数値・出力・320/390px、極値24条件の計算を確認。初回の一語計算は数秒を要する静止画向け。SVGは画像内包、実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](loadpath-foundry-research.md)。以下は履歴です。

### Hyperbolic Atlas — new Operator / v73 local

全86 Operator。02 EFFECT → HYPERBOLIC ATLAS / 双曲地図。字形を双曲平面の多角形へ置き、鏡映によって円の縁ほど密になる文字の地図を描きます。Pentagon {5,4} / Square {4,6} / Triangle {3,8}。Radius / Motif / Journey / Orbit / Edges。

Batch、Surface Mixer、Project／Share／Look v73、Undo、PNG／SVG、実描画カタログへ接続。全体npm test・実Chromeの復元／全数値／出力／320・390pxを確認。有限解像度の静止造形で、SVG効果はラスター内包。実iPhone・長時間VJは未検証。未commit・未push・未公開。[研究と検証](hyperbolic-atlas-research.md)。以下は履歴です。

### Order & Matter — 2 new Operators / v72 local

全85 Operator。02 EFFECT → ORDER & MATTER / 秩序と物質。

- **Quasicrystal Body**：多重格子から平らな菱形を連結し、字形の結晶を切り出します。Pentagrid / Octagrid / Heptagrid。
- **Nematic Film**：字形の境界に液晶の向きを沿わせ、偏光による暗い筋と色を描きます。Crossed / Compensated / Parallel。

各5数値＋3方式、文字種別Batch、Surface Mixer、Project／Share／Look v72、Undo、PNG／SVG、実描画カタログに接続。全体npm testと実Chromeの復元・全数値・出力・320/390px表示を確認。有限の静止造形モデルで、SVGの効果部分はラスター内包。実iPhoneと長時間VJは未検証。未commit・未push・未公開。[研究と検証](order-matter-research.md)。以下は履歴です。

### Wave & Growth — 2 new Operators / v71 local

全83 Operator。02 EFFECT → WAVE & GROWTH / 波と成長。

- **Diffractive Glyph**：字形を透過した複素光波をFFTで伝播し、干渉縞と波長差を描きます。Relief / Aperture / Grating。
- **Dendrite Cast**：細線化した字画の芯へ粒子が歩いて付着し、枝の質量から幹と先端を描きます。Coral / Frost / Copper。

各5数値＋3方式、文字種別Batch、Surface Mixer、Project／Share／Look v71、Undo、PNG／SVG、実描画カタログへ接続。全体npm testと実Chromeの復元・出力・全数値・320/390px表示を確認。回折の初回計算は最大約1.6秒の静止造形向け。SVGのFXはラスター内包、実iPhoneと長時間VJは未検証。未commit・未push・未公開。[研究と近似・検証](wave-growth-research.md)。以下は履歴です。

### Pattern & Tension — 2 new Operators / v70 local

全81 Operator。02 EFFECTの「PATTERN & TENSION / 模様と張力」から選べます。

- **Ornament Reserve**：連続するTruchet曲線を字の周囲へ編み、文字を空白として浮かべます。Ribbon / Lace / Circuit。
- **Tension Membrane**：実字形を切り出した三角形メッシュをXPBDの距離制約でたわませます。Canopy / Drape / Twist。

各5数値＋3方式。文字種別Batch、Surface Mixer、Project／Share／Look v70、Undo、PNG／SVG、実描画カタログへ接続。全体npm testと実Chromeの保存復元・出力・320/390px表示を確認しました。太い大きな文字から試すと違いが見えます。膜は静止造形用の近似で、強い折れでは面が交差する場合があります。SVGのFXは画像内包。実iPhoneと長時間VJは未検証。ローカルのみ、未commit・未push・未公開。[研究・実装・検証](pattern-tension-research.md)。以下は各版の履歴です。

### Field Materials — 4 new Operators / v69 local

全79 Operator。`02 EFFECT → FIELD MATERIALS / 場からつくる字身`、またはBrowseの「場の素材」から選べます。

- **Tensor Filigree**：字画の方向場から、旋回・分岐して見える細線の組織を作ります。Contour / Vortex / Braid。
- **Chromatic Swarm**：重心ボロノイ配置の小さな記号を色版で重ね、字の密度を再構成します。Rosette / Orbit / Cross。
- **Gyroid Sculpture**：三次元の多孔体を字形で切り出し、孔の奥壁と縁の厚みを描きます。Gyroid / Diamond / Primitive。
- **Caustic Glass**：文字の隆起をレンズにし、屈折した光の集積と色分離を作ります。Lens / Fluted / Ripple。

太め・大きめの文字で内部の造形がよく見えます。24項目の設定、文字別適用、独立したTEXT/FX、Project/Share/Look v69、Undo、実描画の作例一覧、PNG/SVGに対応。SVGのFXは画像内包です。精細な静止画向けで、Gyroidの初回計算は重くなります。[研究・実装・検証の詳細](field-material-research.md)を参照。ローカルのみ、未commit・未push・未公開。以下は既存版の実装履歴です。

### Conditions of Type — 6 new Operators / v68 local

全75 Operator。本文と注釈、対括弧、裏面、描画順、接触、字画配分を扱う6種類を追加しました。Project／Share／Look／SVGはv68。Target、Batch、Surface Mixer、文字別設定、Undo、Look記憶、PNG／SVGへ接続しています。ローカル実装で、未commit・未push・未公開です。

- **Ruby Usurper**：`親=読み/二段目|親=読み`で明示した対応から、注釈が主版面を占める階層を作ります。横・縦の注釈衝突を避け、本文の前に文字を追加しても親を再検索します。不一致はパネルへ表示し、読みを生成しません。対応がない場合は本文を保持します。
- **Punctuation Loom**：実際の対括弧と入れ子に所属する本文を帯として張り、句読点の重さで局所位置を変えます。未対応の括弧は明示モードでのみ独立支点にし、対を捏造しません。
- **Counterpage**：字の穴・字間から独立した後面本文を見せます。改行を保って折り返し、`---`だけの行で面を区切れます。区切りなしの文章は面へ順番に分割し、模様として反復しません。
- **Renderer Debt**：実字形の輪郭を反復し、曲がり角で蓄積した変位と仮想ヘッドの速度・遅延・残留インクを次の線／字へ渡します。行末整定1で履歴をリセット。物理プリンタの再現ではなく、決定的な描画モデルです。
- **Ligature Contagion**：始点の二股・カール・共通の穴を、接触距離と世代に応じて隣字へ継承。離れた文字と行境界で伝播を止め、継承率0の字に変異を描きません。
- **Stroke Commons**：実字画のalpha面積を測り、供出側の連続した字画断片を受取側へ接合してから再配分します。各字の所有レイヤーを重ねる前のalpha和が予算で、重なりは各所有者へ計上。8bit alphaの丸め誤差は一字につき1/255 pixel以下。断片はラスタ領域の切り出しで、意味的な部首・筆画の解析ではありません。

実Chromeで6種類の5段階・3方式、JSONの画素復元、Share、Undo／Look、PNG／SVG、縦組み、390px幅での表示を確認しました。SVGのFXは画像を内包します。実機iPhone Safari、長時間負荷、印刷の物理再現は未検証。詳しい根拠は[Conditions検証記録](.codex/web-design/qa/conditions-v68-final.md)を参照してください。以下のv66以前の記述は各実装時点の履歴です。

### Structural material operators — v81 local, Suspended Syntax taste-aware rebuild

Fiber Body、Glyph Mutation、Suspended Syntax、Living Text Field、Inner Eruption、Recursive Graft、Structural Collision、Peel Weave、Void Pressureの9種を収録。Suspended Syntaxは、外付けの支持物と素材装飾を重ねる第1品質パスを退け、文字そのものへ荷重線を通す造形へ再構成しました。Catenary Cutは最深荷重点へ向けて字身を落とし、Gantry Foldは曲げモーメントに沿う連続折線で文字列を切り、Spatial Mobileは全文字を三深度の画面外へ続く経路へ配置します。平面、切断、空隙、配置を同じ作用から生成し、色は荷重焦点へ限定しています。Operator一覧の小作例も実描画から更新しています。

安定ID、3つのmode値、4つの数値キーとv81形式は維持し、旧Projectを読み込めます。ただし表示は新rendererへ移行するため旧画素とは一致しません。実Chromeで全数値軸、Project／Shareの914,050画素完全一致、Undo／Look、Batch、PNG／SVG、日本語と混在文字の縦組み、48px、390px／320pxを確認。低強度の連続フェード、他効果の余白からの構図独立、全合法極値のcanonical raster内収容も確認し、static validatorと全体`npm test`も合格しました。詳しい変更、参照、検証、未確認の造形採用は[Suspended Syntax品質改善記録](.codex/web-design/qa/suspended-syntax-quality-2026-09-08.md)、v68時点の9種全体は[旧品質改善記録](.codex/web-design/qa/structural-rich-pass.md)を参照してください。ローカルのみ、未公開です。

### Combination presets — 144 looks / v81 local

**Effect → 144 Presets / 画像から選ぶ**から、16系統・144案を呼び出せます。2026-09-08に新作24案を追加しました。最初に新作24案を表示し、厳選48案／全144案、名前・エフェクト検索、系統の絞り込みで選べます。従来のPresetメニュー、基本4種と個人保存も使えます。

- 新作は光学×線、多孔体×骨組み、折り×変形、模様×細密の4系統・各6案。共通の元字形から独立して描かれる各効果に、面／輪郭／字間／背面の役割を割り当てています。
- **いまの文字に適用**：全文のエフェクト、配色、Mixerの順序と濃度、固定した瞬間を切り替えます。原文・書体／可変軸・文字サイズ・版面・独立テキスト・出力設定は保持します。個別の効果指定を置き換え、Composeは停止します。
- **見本を再現**：見本の文字・書体・1200×740の構図もまとめて呼び出します。元の作品はUndoで戻せます。Look A–Dは保持します。
- 選択だけでは作品は変わりません。適用はUndo／Redoと自動保存に接続します。組み込み144案はアプリに同梱し、ブラウザーの個人Preset保存容量を使いません。

既存120案のv66 Project fingerprintは全件維持。新24案はv81 Projectとして全件実描画・設定照合しました。新旧すべてで組み合わせ集合は重複しません。専用 `npm run test:presets` は8グループ、全体 `npm test` も通過。ローカルChromeの1280×900／390×844で新作入口、検索と絞り込み、選択だけでは不変、日本語原文・書体の保持、適用・見本再現、Undo／Redo、保存再読込、末尾カード・Escapeの焦点復帰、代表139の通常PNG出力を検証しました。実iPhone Safariと公開環境は未検証。未commit・未push・未公開です。

### Glyph exploration — 6 new Operators / v66 local

Operatorは60件。字形を動かして探し、良い瞬間を編集可能なLookへ残し、静止画へ取り出す計画をローカルへ統合しました。既存の5工程、Target／Batch、Surface Mixer、Look A–Dは継続。Project／Share／SVGはv66で、旧Projectは新Operator未適用・探索OFF・単一テキストとして読み込みます。公開・commit・pushはしていません。

- **Contextual Fit**：隣字の実輪郭と白い通路に応答する字身。圧力・通路・追従と、counter保護、左右／隣接行、基線固定。単独・離れた字は変形しません。周囲を含め96字までの短語／見出し向け。
- **Scroll Type**：穴を持つ薄板のVolute／Roll／Reverse。巻き量・軸・厚み、独立した表／裏／切り口の色、視角・材質・往復する巻き。計算中は最後の完成形を保ち、停止・再開・失敗・再試行を表示します。
- **Anamorphic Type**：原字と指定した一文字の交差立体。正面／側面／斜め、奥行き、傾き、陰影／鏡面／単色。上下に字画がない帯が噛み合わない組合せは輪郭保持率と理由を表示し、穴を勝手に埋めません。
- **Axis Field**：読み込んだ可変フォントの実軸を、文字順・波・鏡像・段階へ割り当てます。軸名と最小／既定／最大をフォントから取得し、幅・太さなどを実際の字形へ反映。指定軸を持たないフォントには仮のスライダーを出しません。
- **Counterspace Flow**：楕円・矩形・蛇行する空白を置き、その両側へ本文を再組版。位置・大きさ・白い通路・本文密度と、追加固定した最大7つの空白を調整します。原文順を保持します。
- **Concordance Field**：明示した語句の完全一致を支点に、行の寄せ・間隔・強調を組みます。同じ行の複数一致も扱い、強調した語が隣の文字に食い込まないよう字幅を確保します。意味推定はしません。

**Text → ＋テキストを追加**で見出し・本文・注記を独立編集。最大32オブジェクトで、位置・大きさ・色・行長を個別設定できます（書体は共通）。組版2件は対象文字を含むオブジェクト全体へ作用し、横組み／Grid OFF専用。16,000字形まで。ページ配置もオブジェクトごとで、異なる原文のページを誤って一つの見開きとして扱わないよう空き面を保持します。

**Effect → Operator一覧**には5用途と実描画の小作例を追加。基本変形は先頭から選べます。キャンバスの「文字の効果」から文字を選ぶと、適用中のOperatorを確認してその設定へ直接移動できます。**Compose**には瞬間保存、最大2数値軸の往復探索、停止／細かい前後移動、6／9／12案の同じ乱数・画角での比較をまとめました。探索は一時値で、「採用」だけが作品へ反映され、Undo 1回で戻せます。

Scroll／Anamorphicはworkerで処理し、完成前の字身と新しいComposeの配置を混ぜずシーン単位で表示。PNG／SVGは独立した描画画面へ固定状態を渡し、指定解像度で立体を描き直します（プレビュー画像の拡大ではありません）。SVGは立体FXをPNGとして内包し、立体のベクター／3Dモデル出力ではありません。取消中も元作品を保ちます。動画収録はこの2件では未対応と明示しています。48種類以内の字形／個別設定、1描画16,777,216px、輪郭・三角形・メモリの上限を超えた場合はエラー表示し、黙って解像度を落としません。

同用途の旧OperatorではSpectral Typeの出力先描画、Cloister FoldのFold=0前後の連続性、Monolith Castの小数Fault、Morph Processionの可変フォント輪郭、Paragraph Current／Reading Fieldの本文サイズへの応答を改善。その他の既存Surfaceの内部1440px上限は別課題として残します。

可変軸はTTF／OTF／WOFFの実メタデータを使用。WOFF2の軸解析は未対応と表示し、通常のフォントとしては使用可能です。フォントファイルはProject／Shareへ埋め込みません。再起動後は同じファイルを読み込んでください。可変字形を含むSVGは出力解像度のPNGを内包し、可変軸を持つ編集可能なベクターではありません。

検証は[実装・検証記録](.codex/web-design/qa/glyph-exploration-v66.md)を参照。保存された値・実描画の変化・復元・書き出しを別々に確認し、desktop1440×900／mobile390×844で操作と遷移を検査しています。実iPhone Safari・一定FPS・長時間負荷・公開環境は別の未検証項目です。Relational Surface Suite／Local Image Bankは保留を維持します。

### Explore — 動かして、形を見つける / v65 local

以下はv65第一段階の履歴です。Composeの先頭に「この瞬間を残す」と、元作品を変更しない探索パネルを追加しました。この時点では54件で、上記6件の本体追加は後続v66で行いました。

- **時間**はComposeをApplyして、開始・終了位相を指定します。**パラメーター**は適用済みの単一Operatorから数値軸を最大2本選び、開始・終了値と片道の秒数を設定します。往復探索、一時停止、0.01刻みの前後移動に対応。重い処理では最後の完成形を表示し、停止後に計算途中のフレームへ進めません。
- **一覧で比較**は6／9／12候補（既定9）。元作品と同じSeed、現在の画角、書体で生成します。全周の時間比較は重複する終端を省きます。拡大して確認し、明示的な「採用」だけで設定を確定。採用はUndo 1回で戻せます。
- **この瞬間を残す**は設定、実際に表示した位相・強度、乱数、フォント参照をLook A–Dへ保存します。空き枠または探索設定で選んだ枠へ保存。上書きは10秒以内の二度押しで確認します。保存・採用後は編集と既存PNG／SVG出力へ進めます。
- Differential／Marbling／Conformal／Auxeticの準備は独立した非表示ドキュメントで一候補ずつ行います。進行・失敗・取消を表示し、取消時に描画用ドキュメントを解放。worker化や一定FPSの保証ではありません。モバイルでは探索・停止・保存をシート上部へ固定します。
- 文法・版面で働かない軸は理由付きで除外。文字種Targetと詳細Batchを引き継ぎ、交差した詳細設定が範囲外へ作用する場合、原文の部分範囲を選択中、または軸に原文の個別値がある場合は探索を休止します。

Project／Share／Look／SVGはv65。旧Projectは探索OFF・固定Momentなしで読み込みます。読込フォントは比較器へ渡しますが、フォントファイル自体はProject／Shareへ埋め込みません。再起動後は同じフォントを再読込してください。`fontAxes`は将来用の保存欄のみで、Axis Fieldや可変軸の描画対応ではありません。

探索は4,096インスタンスまで。Data Mosh／Blob Trackの履歴・外部入力の厳密復元は未対応と明示します。比較PNGは画面解像度の確認用で、大判作品は候補採用後の通常出力を使います。既存Surfaceの内部1440px制限は未変更、SVGのFXは画像を含むため完全なベクトル出力ではありません。Marblingの解像度別輪郭cacheを分離し、高解像度書出し後に停止previewが微妙に変わる不具合も修正しました。

探索専用8グループと全体`npm test`で検査。ローカルChromeのdesktop／390×844 touch emulation、時間・数値比較、保存・採用・Undo・復元、file://＋読込フォントを確認。4 OperatorでPNGとSVGを描いた画素も一致しました。詳細は[検証記録](.codex/web-design/qa/exploration-v65.md)。実iPhone Safari・長時間負荷・公開環境は未確認。未commit・未push・未公開です。

### Bone Scaffold — Lamellar section / v64 local

Bone Scaffoldへ第六方式 **Lamellar section / 層板断面** を追加しました。格子状の梁ではなく、管腔を囲む不均一な層板・骨単位の境界・細い連絡管を持つ連続した字身として描きます。文字の局所的な厚さと方向から配置を決め、空洞は背景色ではなく透過で削ります。細い字画や句読点には連続した外皮を残します。新規作品の初期方式はLamellar、既存のTrabecular／Adaptive／Spine／Rib cage／Trussは保持しています。

既存の6数値軸を使用します。**Marrow**は空洞、**Spacing**は骨単位の間隔、**Connectivity**は細部、**Weight**は外皮と層の厚さ、**Node / osteon**は管腔と小孔の大きさ、**Warp**は方向性と層の不規則さを変えます。TEXT／FXの色・透明度はMixerで独立です。旧Projectの明示設定は変えず、方式が欠けたv22〜v63はTrabecular、v21以前はAdaptiveへ戻します。現行Project／Share／Look／SVGはv64、Operator総数は54のままです。

[骨の多階層の孔と境界を観察した研究](https://www.nature.com/articles/s41598-017-03548-5)と[Leeds大学の組織学教材](https://histology.leeds.ac.uk/home/bone/bone_types/)から構造の階層を参照しました。解剖学・力学シミュレーションではなく、外部画像やコードを組み込まないグラフィック文法です。

`npm run test:bone`で7グループを検査。旧5方式×欧文・日本語・小字・極端値の25条件は変更前とPNG一致。ローカルChromiumの1440×960／390×844 touch emulationで、選択→適用→旧方式→復帰→Marrow変更、カメラ不変、横overflowなし、console errorなしを確認。実Project JSON往復でも原文・適用状態・正規化後の設定・描画が一致しました。実iPhone Safari・長文性能・長時間Compose・公開環境は未確認です。ローカルのみ、未commit・未push・未公開。

### Caesura Field — clause lattice / v63 local

全体で54番目となるFORM Operatorとして、句読点を文章全体の構図を切り替える節点として扱う **Caesura Field** を追加しました。原文順を保持したまま、同じ段落の明示的な句読点から節を組み、折返し後の実測行ごとに変形を安定させます。Paragraph Currentの連続波、Reading Fieldの可読領域、Gutter Fugueの見開き対位とは異なる、句読点で区切った節単位の版面設計です。

- **Breath apertures / 呼吸孔** は句読点の前後へ空隙と穏やかな高低差を作り、**Sentence terraces / 文の段丘** は節の長短を段差・幅・傾斜へ変換し、**Terminal hinges / 終止の蝶番** は終止符へ近づくほど節を旋回させます。三方式は同じ強さでも異なるtransform signatureを持ちます。
- 句読点の空隙、節の高低、長短の階層、節の回転、終止からの作用幅を広く操作できます。強度0、または空隙・高低・階層・回転の4軸を0にすると原配置と一致します。節は原文段落／ページ断片ごとに組み、単語間の空白では分断しません。非適用文字も節の構造の計測に含め、変形自体は適用文字だけに作用します。原文の範囲だけへ設定を書き分けるSource parameter、文字種Batch、手動強度、固定、Compose、Project／Share／Look／SVGにも接続しています。
- 英文のピリオド、連続する`!?`・`……`・`...`、閉じ括弧を扱い、小数点・桁区切り・時刻・語中の点は文の終端と区別します。[UAX #29](https://www.unicode.org/reports/tr29/#Sentence_Boundaries)の句点の曖昧さを参考にした、このエディタ専用の明示的な区切り規則です。略語辞書や意味解析、UAX #29完全準拠の文分割ではありません。折返し行とプロポーショナル字幅は実測の読方向・距離を使います。
- Unicodeの改行クラスは[UAX #14](https://www.unicode.org/reports/tr14/)、日本語の句読点・禁則と版面要件は[W3C JLREQ](https://www.w3.org/TR/jlreq/)、段落全体を関係として組む原則は[Knuth & Plass](https://gwern.net/doc/design/typography/tex/1981-knuth.pdf)、動的な文字空間の先例は[MIT Visible Language Workshop archive](https://www.media.mit.edu/groups/vlw/publications.html)を参照しました。外部の字形、作品画像、レイアウト、コード、数値レシピ、UIは転用していません。

専用検査は `npm run test:caesura`（12グループ）。日本語／英語／縦組み、句読点の文脈、三文法、原文順、固定・snapshot・hit test・Compose・Project／Share、3千／1万／5万字のモデル上の有限性を確認します。固定A/Bと逆B/Aは `node scripts/render-caesura-field.mjs` で再生成できます。句読点の字間だけを空ける案と比較し、節の高低と向きにも作用する案を採用しました。強い設定や狭い行間では節が重なり得ます。Caesura追加時の形式はv63（現行はv64）。ローカルChromiumでdesktop／390px touch emulationの入力・選択・適用・三文法・縦組み・カメラ不変・UI収まりを確認。desktopの実Project JSON保存→別文章へ変更→読込→再保存でも、原文・6設定・131文字の適用状態・変形値が一致しました。実iPhone Safari・ブラウザでの長文性能は未確認です。ローカルのみ・未commit・未push・未公開です。

### Ligature Body — Compound Counterbody / v62 local

Ligature Bodyへ **Compound counterbody** を追加し、新規作品の初期文法にしました。従来4文法が接続点ごとの一本橋へ収束しやすかったのに対し、同一行・同一語の隣接字から上下二つの実輪郭anchorを取り、太さの異なる二本のbody、くびれた共有stem、成分境界のcaret slit、語を貫く負形counterを一体として構成します。接合位置は語ごとの波とSeedで上下へ移るため、長い語でも同じ結び目の機械的反復になりません。

- 旧Contextual interlock／Shared stem anatomy／Over/under counter weave／Capillary meltは実rendererを`renderLigatureBodyV29`へ隔離し、direct/wrapperのpixel一致で保持します。v29–v61の項目欠落Project／full Batch profileはInterlockへ戻り、明示保存された文法は変更しません。
- Fusion、Reach、Body band、Counter channel、signed Tensionの既存5軸だけを使います。Reach 0は元字形bodyへ完全に戻り、空白・改行・非適用文字はhard stop、極端値も最大96 pairで停止します。TEXT／FXの色・透明度、Blend、前後順、無制限キャンバスのカメラは従来どおり独立です。
- [OpenType GSUB](https://learn.microsoft.com/en-us/typography/opentype/spec/gsub)の「複数字形を一つのligature glyphへ置換する」構造、[OpenType GDEF](https://learn.microsoft.com/en-us/typography/opentype/spec/gdef)のcomponent間caret、[TypothequeのCalcula解説](https://www.typotheque.com/articles/calcula)の「隣字に応じた形態変更と参照点による組合せ」を原理の比較に限定しました。字形、font、作品画像、生成規則、code、数値recipe、UI、presetは転用していません。

固定maskのLatin serif／日本語／小字／極端値でA/Bと逆B/Aを生成し、専用検査は `npm run test:ligature`、比較再現は `node scripts/render-ligature-counterbody.mjs`。900×380の独立FX極端値は最終2回17.4–17.7msでしたが、browser FPS、長文Compose、export、実iPhoneの保証ではありません。ローカルのみで、未commit・未push・未公開です。

### Prism Sacrament — Birefringent Field / v61 local

Prism Sacramentへ **Birefringent field** を追加し、新規作品の初期光学体にしました。現行の一つの中心からfacet線を放射する構成ではなく、字画厚を光学的な厚さ、局所Voronoi領域を結晶軸として扱い、ordinary／extraordinaryの二方向サンプル、波長別の位相色、実輪郭法線から外へ伸びる二色causticを同じgeometryから生成します。欧文・日本語・小字でも字形を失わず、Cut crystalより局所的で、Chromeの金属反射やRisoの固定版ずれとも役割が重なりません。

- 旧Legacy lens／Cut crystal／Fresnel shrine／Spectral flare／Lenticular bodyのrendererは正規化後source hashと5方式のdirect/wrapper pixel一致で保持します。v23–v60の項目欠落ProjectはCut crystal、v22以前は従来どおりLegacy lensへ戻ります。
- Refraction、Iridescence、Dispersion、Facets、Caustic、Bloom、二つのEffect inkをそのまま使い、追加操作を増やしていません。Composeは位相0/1が完全一致し、停止時はphaseに依存しません。
- 複屈折で直交する二光線に位相差が生まれ、厚さと波長により干渉色が変わる原理は[MIT OpenCourseWareの複屈折講義](https://ocw.mit.edu/courses/6-007-electromagnetic-energy-from-motors-to-lasers-spring-2011/6ab79e08d3e7349c31837e76bb23166d_MIT6_007S11_lec25.pdf)と[University of Colorado Boulderの偏光実演](https://physicslabs.colorado.edu/demos/optics/polarization/birefringence/polarized-images/)で確認しました。causticを「透明・鏡面体を経て集光した光」として輪郭起点にする判断は[Henrik Wann Jensenのcaustics資料](https://graphics.stanford.edu/~henrik/images/caustics.html)を参照しました。外部の画像、作品、shader、code、数値preset、UI、fontは転用していません。

固定maskのLatin serif／日本語／小字／極端値でA/Bと逆B/Aをnative Canvasから生成し、専用検査は `npm run test:prism`、比較再現は `node scripts/render-prism-birefringence.mjs`。700×420の独立FX強設定は約833msでhard guard内ですが、これはbrowser FPS、Compose全体、export、実iPhoneの保証ではありません。ローカルのみで、未commit・未push・未公開です。

### Textura Matrix — Medial Ductus / v60 local

Textura Matrixへ6番目の文法 **Medial ductus** を追加しました。従来方式が字形を等間隔の縦runへ還元して強い反復リズムを作るのに対し、Ductusは実際のalpha bodyを細線化して文字固有の中心経路と局所画幅を得ます。その経路を固定角のbroad nibで掃くため、Latinの曲線・カウンター、日本語の横画／縦画／払い、小サイズの語形が同じstem列へ均質化されません。

- 既存のLegacy stems／Textura quadrata／Broken fraktur／Bastarda cursive／Liturgical latticeは変更せず、4資料×5文法のv59 pixel hashを固定しています。新規作品の初期値もTextura quadrataのままで、Ductusは明示的に選ぶ追加文法です。
- **Stem pitch** はペン幅の上限と抑揚周期、**Nib angle** は固定ペン先方向、**Nib weight** は局所画幅、**Stem split** は字画内の切れ、**Spur** は実terminalの延長、**Writing rhythm** は閉じた時間的な幅変化になります。句読点など一画素へ収束する孤立成分も専用のnib markとして残します。
- 斜め画素が直角cornerを偽の分岐へ変える経路を除き、B&Oの試作では分岐nodeを429から9へ削減しました。解析は最長辺360px・589,824セル以下で停止し、同一字面の骨格を再利用します。isolated native Canvasでは初回prepareが約114ms、同じ字面のphase再描画が6.6〜8.4msでしたが、実ブラウザFPS、長文、Compose、iPhoneの性能値ではありません。
- [Crafts Study Centre / VADSのcalligraphy解説](https://www.vads.ac.uk/digital/collection/CSC/custom/calligraphy)からbroad-edged nibの角度と字形が一体である原則を、[British LibraryのMacclesfield Alphabet Book目録](https://searcharchives.bl.uk/catalog/032-000179016)からTexturaにも複数の書字・装飾体系が共存する前提を参照しました。外部の字形、図版、フォント、コード、数値レシピ、UIは転用していません。

検査は `npm run test:textura`。実レンダラのLatin serif／極太sans／日本語／52px／句読点、角度・幅・split・位相、極端値、source不変、色とalphaの独立、旧5文法20出力のpixel hashを確認します。統合後の固定AB／逆BAは `node scripts/render-textura-ductus.mjs`、採用前の試作比較は `node .codex/prototypes/textura-ductus/proof.mjs` で再生成できます。どちらもnative Canvasの固定maskであり、実UI・書き出し・iPhone・production parityは未確認、未公開です。

### Gutter Fugue — facing-page counterpoint / v59 local

v59で53番目のOperatorとして、左右ページを別々の容器ではなく一つの見開きとして測る **Gutter Fugue** を追加しました。相手ページの行量・余白・行順位へ応答し、横組みでは行端をノドへ近づけ／退かせ、縦組みでは列の横順を保ったまま列長と開始位置を変えます。Paragraph Currentの段落内流動やReading Fieldの読点的な焦点圧縮とは異なる、見開き間の対位法です。

- Spreadsでのみ作動し、Pages／Continuous／Gridでは設定と適用状態を保持したまま休止します。カメラ、ズーム、ページ寸法、原文順序、文字色は変更しません。
- **ノドへの張力／左右の応答／ノドの余白** を主操作に絞り、**声部の周期／開始声部／本文の安定** は詳細内に収めました。張力0は完全な原配置です。
- Bilateral Counterweight、Gutter Fugue、Temporal Canonの3方向を同一資料でAB／逆BA比較し、見開き固有の応答が最も明確だったGutter Fugueだけを採用しました。初稿で衝突した縦組みは、列の横移動を抑えて列長・開始位置の応答へ変更しています。
- [W3C JLReq](https://www.w3.org/TR/jlreq/?lang=en)の縦横組と版面の原則、[W3C Latin pagination requirements](https://www.w3.org/TR/dpub-latinreq/)の改ページ構造、[CMU Kinetic Typography Engine](https://www.cs.cmu.edu/~johnny/academic/KT_Engine_UIST2002.pdf)の時間的タイポグラフィ、[Cassowary](https://constraints.cs.washington.edu/solvers/cassowary-tr.html)の制約関係から構造原則だけを参照しています。作品、画像、フォント、コード、数値レシピ、固有UIは転用していません。

検査は `npm run test:fugue`。日本語・英語・縦組み・小サイズ・疎な末尾ページ・3千／1万／5万字をsynthetic geometryとnative Canvasで確認し、固定AB／逆BAの再生成は `node .codex/prototypes/folio-counterpoint/proof.mjs` です。実ブラウザ、実DOM組版、実Compose再生、iPhone Safari、production parityは未確認で、ローカルのみです。

### Raster Press — Gravure wells / v58 local

Raster Pressに **Gravure wells / 深さを持つ凹版セル** を追加しました。一つの回転版格子へ、薄い外壁、透明なmoat、濃度と画線深度で大きさが変わるインク溜まりを刻みます。単に丸網点を増減するAdaptive AMではなく、字形の縁では浅い空洞、太い画線の内部では深く充填されたセルとして読み分けられます。

- 新規作品の初期値はGravure wells。既存のLegacy dots／Adaptive AM／Stochastic FM／Line screen／Mezzotintは描画を変更せず保持しています。
- Screen cell、Dot gain、Screen angle、Press noise、Tone modulationの既存レンジで、格子寸法、インク充填、版の向き、欠落、セル壁・版圧の偏りを独立して操作します。セル生成は最大12,000、候補走査は48,000で停止します。
- Caesura追加時の形式はv63（現行はv64）。Raster Pressの導入境界はv58のままで、v24–v57の項目欠落Projectは従来のAdaptiveへ、v23以前はLegacyへ戻し、明示保存された方式はそのまま保持します。Surface MixerのTEXT 12%、FX色・FX透明度・TEXT透明度も独立です。
- [Library of Congressのrotogravure解説](https://www.loc.gov/static/collections/world-war-i-rotogravures/articles-and-essays/the-rotogravure-process/)から、凹部セルがインクを保持して階調を作るという原則だけを参照。外部の版、画像、網点、コード、数値レシピ、UI、フォント、素材は転用していません。

固定maskのLatin serif／極太sans／日本語／52pxでAdaptiveとのAB・逆BA・位相列をnative Canvasから生成し、旧4方式16出力のv57 pixel hash完全一致、位相0/1、極端値、source不変、hard budgetを検査します。比較再現は `node scripts/render-raster-gravure.mjs current output-directory`、検査は `npm run test:raster`。実ブラウザ、実Compose再生、iPhone Safari、production parityは未確認で、ローカルのみです。

### Contour Etch — Hachure relief / v57 local

Contour Etchに **Hachure relief** を追加しました。字形の内外を一つの符号付き標高場として扱い、細い中間曲線、5本ごとの太い主曲線、勾配方向へ向く短いhachure、実際に閉じたcounterだけに入る内向きの低地線を同じ地形から生成します。従来の均一な輪郭増殖やHatch Engraveの素材線とは異なり、文字そのものが印刷版状の起伏になります。

- 新規作品の初期値はHachure relief。Surface Mixerの **TEXT 22%** で起伏を見せます。FX色・FX透明度・TEXT透明度は引き続き独立です。
- Legacy rings／Continuous isobars／Index contours／Cut terraces／Watershed fieldは保持。v56以前のProject・Look・Batchは保存済み設定を優先し、項目が欠けた部分Projectでも従来のIndex／Keepへ戻します。
- Relief、Bands、Spacing、Stroke、Driftの既存レンジをそのまま使い、極端値でも描画領域を画面端へ漏らしたり、無制限キャンバスのカメラをfit・recenterしたりしません。Composeの位相0と1は完全一致します。
- [USGSの標高図式](https://www.usgs.gov/ngp-standards-and-specifications/us-topo-cartographic-specifications-elevation)から主曲線と中間曲線の階層、[swisstopoの地形表現解説](https://www.swisstopo.admin.ch/en/depicting-switzerlands-terrain)からhachureを線による地形表現として扱う原則だけを参照。地図、図版、コード、数値レシピ、UI、フォント、素材は転用していません。

固定maskのLatin serif／極太sans／日本語／52pxでIndexとのAB・逆BAと位相列をnative Canvasから生成し、旧5方式のpixel hash不変、counter方向、hard budget、極端値、source不変を検査します。比較再現は `node scripts/render-contour-relief.mjs current output-directory`、検査は `npm run test:contour`。実ブラウザ／実Compose再生／iPhoneは未確認、未公開です。

### Chrome Reliquary — Studio mirror / v56 local

Chrome Reliquaryの **Material model** に、従来の **Acid bands** と独立した **Studio mirror** を追加しました。Studioは文字マスクを連続した高さ場へ解き、表面法線で手続き的なsoftbox・暗い床・細い反射帯を読むため、太い字では丸い鏡面と深い黒い反射が前面に出ます。外部画像、HDRI、参照作品、追加フォントは含みません。

- **Mirror softness** はStudioだけに作用。Voltage／Bevel／Light／Bands／Contrast／Mercury warpも同じパネルから広い範囲で操作できます。
- 従来Acidは虹色の線密度と強いacid感に優れ、小サイズでも輪郭を保ちやすいため、初期設定のまま残しています。Studioは全面置換ではなく、太い見出し・静止画向けの別素材です。
- Apply量、Batch、原文編集、Undo／Redo、Project、Share、Look、Surface MixerのTEXT／FX色・透明度、PNG／SVGへ接続。旧v55 Projectに新設定がない場合はAcid／softness 0.12で復元します。
- StudioはCPU上で連続面を反復計算する高品質モードです。native Canvasの760×460固定マスク5条件（旧方式＋Studio、AB／BA PNG生成込み）は合計8.6秒。ブラウザFPS、Compose再生性能、実iPhone操作を示す値ではありません。

7軸・空字形・穴・alpha・Batch・共有Mixer・PNG／SVG・保存経路を検証。比較証拠は `C:\Users\soran\AppData\Local\Temp\type-deformer-chrome-studio-20260905\final`、再現は `node .codex/prototypes/chrome-studio/render.mjs output-directory`、検査は `npm run test:chrome`。実ブラウザ／iPhoneは未確認、未公開です。

### ページ／見開きだけを書き出す / v56 local

Export → **出力する範囲** で、作品全体／本文ページ／本文見開きを選べます。番号を直接指定するほか、前後移動と原文カーソル位置からの取得に対応します。これは無制限キャンバスや画面カメラを変える機能ではなく、Pages／Spreadsで生成した本文版面を最終出力だけで切り取る機能です。

- 文字と全Surface FXを先に作品全体で計算し、最後にページ／見開きの本文フレームで切るため、字間・ページ間の関係効果を個別ページ用に再計算しません。固定Output frameではFit／Anchor／Marginを適用後、その窓の外へFXを漏らしません。
- Compose／Grid／連続配置、空ページ、範囲外番号、IME変換中、組版反映待ちは明示して停止し、作品全体へ勝手に戻しません。Preview／Proof／Videoはそれぞれ既存の範囲指定を維持します。
- SVGはclipPathを使いますが、切り取り外の原文要素もファイル内に保持します。配布データから範囲外文字を除外したい用途では、切り取られたPNGを使用してください。
- Undo／Redo、Project、Share、Look、PNG／SVG metadataへ接続。旧v55データは作品全体／1へ復元します。

横組み／縦組み、左右の読順、奇数最終見開き、Auto／固定Output frame、3千／1万／5万字、1万字の部分Apply・編集・保存復元をnative Canvas＋模擬組版で検証。実ブラウザのCSS組版、保存UI、実iPhoneは未確認です。再現は `node scripts/render-export-regions.mjs output-directory`、検査は `npm run test:output`。

### Hatch Engrave — 字形に沿う銅版線 / v55 local

Hatch Engrave → Cut grammar → **Copperplate** を追加しました。外形・穴をもとに彫り線が回り込み、線の太細と方向で字面の立体感を作ります。放射するBurinや均一な網掛けとは異なる方式です。従来の9方式・初期設定Tonal・各パラメータ範囲は維持しています。

- **Fiber warp**：0で平行線、上げると外形と穴に沿って曲がります。**Cut angle** はその流れの方向。
- **Plate depth／Cut width**：太細の差／彫りの幅。圧力は隣の線を一度に飲み込まず、間隔内で徐々に太るため、強設定でも細い余白が残りやすくなります。極端な幅ではベタに近づきます。
- **Line spacing**：線の間隔。小字は1〜3px、大きい字は初期値5pxから。小字の5px設定は従来Tonalより薄くなるので、可読性優先ならTonalも使い分けてください。
- 線だけを見たい場合はSurface Mixerの**TEXT**を下げます。文字とFXの色・透明度は独立し、切替時に勝手に変更しません。

弱い適用量は字形解析を変えずインク量へ作用。Batch／原文編集／Undo／Project／Share／Look／PNG／SVGへ接続。SVGのFXは埋込PNGであり、ベクトル彫線ではありません。既存の共通Surface解像度上限（長辺1440px・240万画素、最大密度1.5）を使うため、大判・長文一括出力の微細線再現には制限が残ります。

6条件の同一入力native AB／逆BA、実関数・模擬DOMで保存復元、共通Mixer・PNG／SVG描画一致を検証。実ブラウザ／iPhone・実Compose操作は未確認。`npm run test:hatch`、比較再現は `node scripts/render-hatch-copper.mjs saved-before.html output-directory`。

### Reading Field — ページ／見開きの可読域 / v54 local

「領域の基準」に **ページごと／見開きごと** を追加。Text → Typography → Page layoutでPages／Spreadsを選び、Reading Fieldの基準を選択してApplyします。基準を選ぶだけでは作用対象は変わりません。

- ページ：余白を含む本文領域が基準。見開き：左右2ページと間隔を一つの領域として扱い、各見開きで同じ比率の可読域を繰り返します。最終組が片ページでも基準幅を保ちます。
- 中心を片側へ寄せると、一方を読める大きさに残して対向ページを圧縮できます。横組みの左右位置は「中心 / 行方向」、縦組みは「中心 / 行束方向」。0.5は中央です。
- 連続配置やGridでは必要な基準を作れないため休止を表示し、設定・適用情報は保持。Lockした字は固定済みの変形を保ちます。従来の段落／文章全体は変更していません。
- 原文範囲の上書き・Batch・Undo／Redo・Project／Share／Look／SVG metadataに接続。原文や色、カメラ、出力のクリップ設定は変更しません。

同条件native比較、3千／1万／5万字の実関数試験、1万字の部分Apply・編集・保存復元・PNG／SVGを検証。組版・UI境界は模擬で、実ブラウザ／iPhoneは未確認。比較の再現：`node scripts/render-reading-spreads.mjs saved-before.html output-directory`。

### 段落の余白 — v53 local

Text → Typographyの **段落の余白** で、原文の改行で区切られた段落間を0〜12emで調整できます。行送りとは独立した全体設定です。0で追加余白なし、従来値は0.55em。横組みは上下、縦組みは左右へ作用し、ページ先頭へ前段落の余白を持ち越しません。空行と原文は保持します。

Gridでは一時無効、解除時に元の値を使います。Undo／Redo・Project／Share／Lookへ接続し、旧Projectは0.55emで復元。文字サイズ・カメラ・FXは変更しません。余白で作品が大きくなりPNGの上限を超えた場合は明示的に出力倍率またはOutput frameを設定してください。自動縮小はしません。

検証は実関数＋模擬UI・native描画／模擬組版。3千／1万／5万字の配置、1万字の編集・適用・保存復元・0.5x PNG／SVG出力を確認。実ブラウザのCSS組版とiPhoneは未確認。比較の再現：`node scripts/render-paragraph-spacing.mjs saved-before.html output-directory`。

### Riso Separation — 画線の濃淡分版 / v52 local

Risoの「分版の方式」から **Tonal masters / 画線の濃淡分版** を選べます。文字の画線・穴・局所的な太さを読み取り、縁から内部へ異なる濃淡を持つ二枚の版を作ります。ベタ面、縁取り、均一網点など従来の五方式と初期設定は維持しています。

- **濃淡の深さ 0〜160px**：0は均一な混色、それ以上は縁から内側へ濃淡が移る距離。細い画線は自身の太さに合わせます。
- **網点の間隔 1〜48px**：滑らかな濃淡から粗い網点まで。細字は1〜3px、版ズレ0〜2pxから。太い文字では大きな網点と強い重ね刷りを試せます。
- 二枚の網点角度・欠けを独立させ、濃い部分は点がつながるようにしています。新方式の印圧は網点の太り方へ作用します。弱く適用しても字形の解析は変えず、インク量だけを減らします。
- 色・TEXT／FX透明度はSurface Mixerで独立。新しい二つの調整はTonal選択中だけ表示し、切替・Undo・Project／Share／Lookで設定を保持します。

参照：[Duplikatの分版・重ね刷り・濃度説明](https://www.duplikat.co.uk/riso-print-guide)、[Explorisoの色分解](https://en.exploriso.info/exploriso/colour/separations/)。印刷原理を独自の字形演算へ翻訳した表現用機能であり、実機の色校正や入稿用分版出力ではありません。参考画像・フォント・素材の再配布なし。

検証は実関数＋native Canvas／模擬UI。実ブラウザ・iPhone操作、実Compose／書き出しUIは未確認。比較の再現：`node scripts/render-riso-masters.mjs saved-before.html output-directory`。

### ページ境界の段落保護 — v51 local

Text → Typography → Page layoutの **段落の行保護** で、改ページの両側に残す行数を指定できます。新規は2行、最大6行。1にすると従来どおり空きへ詰めます。原文の改行で区切られた段落に対し、実際に折り返された行を数えます。空行は数えません。

- 文章全体の分割を計画するため、例えば9行を4行容量のページへ配置する際、3行保護なら「4・4・1」ではなく「3・3・3」にできます。横／縦・ページ列／見開き列に対応。
- 短い段落は可能なら一緒に次ページへ。保護条件を優先し、その中でページ数を抑えます。余白やページ数は変わり得ますが、文字サイズ・原文・効果・カメラは勝手に変更しません。版面が小さすぎる場合は条件を緩め、その分割数を表示します。
- Project／Share／Look／Undo／SVGメタデータへ接続。v50以前のProjectは保護なしで復元し、旧版と同じ境界を保持します。任意で2行以上に変更してください。
- Lookの正規化で新しい保存版番号が28へ切り下げられる問題も修正。元の対応版番号を保持し、不正／未来版を拒否します。過去にすでに28として保存し直されたLookの本来の版番号を推測・自動修復するものではありません。

参照：[W3C CSS Fragmentationのorphans／widows](https://www.w3.org/TR/css-break-3/#widows-orphans)。両側の行数と、収まらない場合の条件緩和を独自のCanvas配置へ翻訳しています。CSSプロパティによる印刷組版や規格全体への準拠ではありません。

検証は実関数＋模擬組版／UIとnative描画。横／縦の散文、9行の比較で全字形を表示し、OFFは旧mapperと一致。1万字の範囲Apply・編集・Undo・保存復元・PNG／SVG一致を確認。実ブラウザ・iPhoneは未確認。再現：`scripts/render-page-breaks.mjs saved-before.html output-directory`。

### 任意のページ／見開き配置 — v50 local

Text → Typography → **Page layout**で「連続」「ページ列」「見開き列」を選べます。Wrapで行長、本文の奥行で横書きの高さ／縦書きの幅、間隔で左右と次の組の距離を調整します。Wrapが0のときはページ配置だけ32emを使用し、連続へ戻すと従来の改行のみへ戻ります。

- 行を途中で分断せず配置し、見開きは2ページずつ下へ続きます。左右の読順はAuto（横書きは左→右、縦書きは右→左）または明示指定。画面を切り取る枠や自動ズームは追加しません。Grid中は一時無効で設定を保持します。
- ページ配置中は、原文のカーソル／選択部分が属するページと見開きを表示します。原文の下の **この位置のページ／見開きを対象に** で、番号を調べずAPPLYへ進めます。文字を選択していれば、その選択を含む版面全体を取得します。文字の選択範囲だけに適用したい場合は、従来の「選択範囲を対象に」を使います。
- キャンバスで選んだ文字からはPage layout内の **キャンバスで選んだ文字から取得** を使用。Composeの複製先ではなく元の文字の版面です。番号指定も残しています。取得はその時点の**原文範囲**を対象にするだけで、効果やカメラは変更しません。再組版後の同じページ番号へ自動追従する恒久page IDではありません。
- 原文順と表示順が異なり、一ページの文字が原文中で飛び飛びになる場合も、間にある別ページの文字を含めません。範囲はセッション内で保持し、編集／Undoで追跡。範囲の抜粋と「原文へ戻る」は最初の区間を示します。IME中・配置反映待ち・空段落／空白だけの選択では取得を止め、空の本文に以前のページ情報を残しません。
- Current／段落単位のReadingは、ページをまたぐ段落を版面内の断片ごとに扱います。ReadingのDocument指定は全体を対象にします。ページの配置を解除しても適用済みの効果を消しません。
- 旧Projectは連続配置を維持。新しい配置はUndo／Project／Shareに保存。PNG／SVGは全体で1作品の出力です。個別ページ書出、製本の表紙／左右ページ番号、禁則・孤立行・ルビを含む本格的な自動組版は今回の追加範囲ではありません。

設計参照：[W3C JLReqの基本版面の設計要素](https://www.w3.org/TR/jlreq/#elements_of_kihonhanmen)。版面の行長・組方向・行間を分ける考え方を利用し、完全準拠を意味しません。`npm run test:pages`と本文編集テストで、3千／1万／5万字の配置、1万字のtextarea選択→見開き取得→Apply→編集→保存復元→native PNG／SVG一致、RTLの飛び飛び範囲・Unicode・空段落を検証。DOM／イベント／組版は模擬環境で、実ブラウザのCSS組版・操作・実iPhoneは未確認。比較図の再現は `scripts/render-page-layout.mjs`（native font測定＋模擬折返し、実画面ではありません）。以下は各版で追加した機能の記録です。

### 起動・更新と自動保存

更新後は文字だけを復元し、エフェクト・Compose・書式設定は初期状態に戻します。前回のエフェクト付き作品はProjectの「前回の作品をJSON保存」から描画せず退避できます。編集後の更新・移動ではブラウザ標準の警告を要求しますが、モバイルでは必ず表示されるとは限りません。重要な作品は更新前にSave projectで保存してください。

編集の作業予算はPC 256 MiB／モバイル128 MiB、高品質確認・書き出しは768 MiBです。編集Workerが8秒を超えると停止し、設定は保持します。「描画を停止／再開」で手動操作もできます。

以下は自動保存の失敗・再試行の扱いです。

- Projectに、未保存／保存済み／最新保存の失敗／バックアップだけの未更新を表示します。警告はタイマーで消えず、閉じたメニューやモバイルのProjectボタンにも注意表示が残ります。失敗時は**自動保存を再試行**、または既存の**Save project**でJSONへ退避できます。JSONの保存要求を自動保存の成功とは扱いません。
- 最新保存が失敗した場合、保存済みの主データとバックアップを変更しません。最新保存だけ成功した場合は、バックアップ更新を区別し、再試行用の直前データをセッション内に保持します。空き容量を作るための自動削除はしません。
- 自動再試行は失敗が続くと最大2分まで間隔を空けます。手動再試行は待ち時間を飛ばせます。IME・入力・再生中の保存延期は維持します。
- 起動時に保存元を復元できない場合は、自動上書きを停止して表示します。バックアップから表示できても、元の保存データを勝手に置き換えません。この保護停止は自動解除せず、現在の作品はProject JSONで退避してください。

`npm run test:autosave`と本文編集テストで、容量／アクセス／シリアライズ失敗、バックアップ、復元、再試行、3千／1万／5万字の状態保持を検証。保存先・DOM・イベントは模擬環境です。実ブラウザのquota／保存寿命、実iPhone操作、複数タブの同時更新は未検証。ブラウザ保存は長期保管や別端末の保存の代わりにはなりません。例外処理の根拠：[WHATWG Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)。

### 長文の保存・出力 — v49 local fixes

- **出力サイズを確認**：Exportで、実際のPNG寸法、SVGに画像のFXが含まれるか、アプリの画像上限、出力枠での切れを事前確認できます。設定やキャンバス倍率は変更しません。これは寸法検査で、描画・端末での保存成功の保証ではありません。
- 左／上Anchorが中央になる不具合を修正。9方向とも指定どおり配置します。Fit OFFで出力枠外にはみ出す部分は、引き続き意図的に切れます。
- 非常に長い作品でもPreviewだけは5%未満に縮小可能。最終PNGの倍率は勝手に下げず、上限超過を明示します。SVGのSurface FXも画像なので、Canvas確保に失敗したままFX抜きで成功扱いにしません。文字だけのベクターSVGにはこの画像上限を適用しません。
- 不正な画像寸法とIME変換中の書き出しを止めます。Projectのデータ形式はv49のままです。

`npm run test:output`、本文編集テスト内のProject実ハンドラー→native PNG／SVG往復を追加。1万字のCurrent／Reading、1,252字形への範囲適用、離れた2箇所の編集、保存復元前後のPNG完全一致とSVG全9,633字形を確認。native Yu Minchoを使用し、フォントは配布していません。DOM／組版／FileReader輸送／入力の描画待ちを模擬した試験であり、実ブラウザ・iPhone・OSへの保存確認は残っています。画像比較の再現は `scripts/render-output-check.mjs`。

### 原文の範囲ごとのパラメータ — v49 local

Paragraph Current／Reading Fieldに **設定の書き込み先** を追加しました。Textで原文の範囲／段落を選び、Applyで文字種を絞り、Effectで「原文の対象だけ」に切り替えると、その対象だけの曲がり・密度・可読域などを調整できます。効果の適用／解除は別操作です。

- 変更した項目だけを原文の各字形へ保存。共有設定の変更は、範囲で上書きしていない項目に反映されます。混在する値は「複数値」と表示します。
- 固定中・範囲外の文字は変更しません。対象削除／未選択／IME中は共有設定へ切り替えて書き込まず、操作を止めます。
- 「このOperatorの範囲設定を解除」で共有値の継承へ戻せます。他Operatorの範囲設定や効果の適用は残します。原文編集・Undo／Redo・Project・Share・Lookの状態経路へ接続しています。
- 対応はこの2つの長文Operatorのみ。領域全体をまとめて計算するSurface FXに、独立した範囲パラメータを導入したものではありません。新しく挿入した文字は共有設定から開始します。

再現比較：`scripts/render-source-parameters.mjs`。実関数／模擬DOM／native描画の検証であり、実ブラウザ・実iPhone・ファイル入出力handlerを含む全操作の確認は残っています。

### Copy Decay — Successive Transfer / v48 local

Copy Decayに **累積複写** を追加し、新規開始値にしました。直前の複写結果を次の原稿として1〜48回処理するため、摩耗・欠損・トナーの潰れが蓄積します。既存9モードの描画と旧Projectの方式は維持します。

- 世代数→Exposure（＋で濃く）→Erosion（痩せる）／Toner（潰れる）の順で調整。搬送・蛇行・汚れは詳細欄へ整理。
- 搬送量は48世代あたりの基準移動量。強い摩耗では消失、強いトナーでは文字や穴が潰れます。原文は削除しません。
- Surface MixerのTEXTを0にすると複写だけを確認できます。文字とFXの色・透明度は独立し、弱い適用強度が現像処理中に消えないよう密度と適用量を分離しました。
- 全解像度の有効範囲を処理します。高世代・大きい画像は重く、リアルタイム性能やiPhone対応を保証するものではありません。

再現：`scripts/render-copy-transfer.mjs`、検査：`npm run test:copy`。実関数・native Canvasでの比較であり、実ブラウザ／保存・出力handler／iPhoneは未確認、未公開です。

### Ribbon Echo — Glyph Lamina / v47 local

Ribbon Echoの新規開始値を **Glyph lamina / 文字の薄板** に更新。文字から独立した中央の帯を足すのではなく、画線・穴・字間を含む字面そのものを湾曲・捩り、面の向きと奥行きから陰影を作ります。従来のHelix／Prism／Fan／Braid／Legacyはそのまま選択でき、v46以前の保存は元のモードで復元します。

- **Drive**：面の巻き。**Reach**：上下のうねり。**Twist**：端から端の捩れ。
- **面の細かさ**：4〜99面。低い値は折板のような粗い面、高い値は滑らかな構成。既存モードでは従来どおり断面数です。
- **Back-face fade**：背面の薄さ。最前面の薄板を表示する方式で、多層の内部透過を再現するものではありません。
- Surface Mixerで文字／FXの色・透明度を独立操作。TEXTを0にすると薄板だけになります。複数行は一枚の面として作用し、強設定では重なり・圧縮が起きます。

透明な字間や穴を背景色で塗らず、局所depthと元のalphaで処理します。7組のnative描画で比較、実関数8groupと全`npm test`が合格。実ブラウザ／Mixer全工程／保存・出力handler／実iPhoneは未確認・未公開。採用根拠は `.codex/web-design/ribbon-lamina-20260904.md`、全52件の用途別一次棚卸しは `.codex/web-design/operator-role-audit-20260904.md`。

### Reading Field — v46 local

FORMに **Reading Field / 可読域と密度** を追加。原寸で残す領域の周囲を、文字サイズと配置の両方から連続的に圧縮／拡張します。Paragraph Currentの流路とは異なる、読む部分と細密な文字層を一つの文章から作るOperatorです。原文・色・透明度・カメラを変更せず、表示を切る枠も作りません。

Textの **行長 / Wrap** で文章を折り返し、Applyで対象を選んで試してください。基本操作は **領域の基準**（段落ごと／文章全体）、**周囲の圧縮**（0で無変形、負で拡張）、**読む幅／高さ** の4つ。「位置と変形の調整」から中心・移行のなだらかさ・文字サイズの追従を調整できます。追従0では配置のみを動かすため、強い圧縮で文字が重なります。

領域は元の組版上の比率です。特定の語句への固定や意味の推測はしません。文字の箱全体が領域内にあれば原寸を保持。部分適用・異なる設定・他の変形を重ねた場合の非重複は保証しません。横／縦組み、手動強度、固定、原文範囲、Undo、Batch、Project／Share、snapshot、Composeの元文字変換へ接続しています。Compose後の配置からの再計算や独自の時間進行、ページ／見開き構造は未実装です。旧保存では新Operatorは未適用。ThornのLegacy移行境界はv45のままです。

`npm run test:reading` の11group、本文編集39group、全`npm test`が合格。1万字の部分適用・編集・Undo・JSON状態復元を模擬DOMで、9条件の描画と復元前後のsnapshot一致をnative Canvasで確認しました。拡大／回転した文字の端が選択判定から外れる不具合も修正。実ブラウザ操作・保存handlerを通る実ファイル往復・実iPhoneは未確認、未公開。再現方法と用途別比較は `.codex/web-design/reading-field-20260904.md`。

### Thorn Crown — Rooted / v45 local

Thorn Crownに **Rooted / 輪郭から成長** を追加。画線に根元を埋め込み、一本の曲線に沿って連続して細くなる棘を形成します。Lancetは一枚の刃、Hookは返る鉤、Vineは交互の側枝、Tridentは途中で三方向へ分岐する形です。付け足しの矢尻や角張った接合部を使いません。

- **字間の保護**：近くの文字・穴へ向かう根を避けます。0で交差を許可。曲がった先端までの完全な衝突回避ではありません。
- **Needle weight**：長さに埋もれず太さへ作用。薄い画線では根元の太さを抑えます。**Root armor**は根元の張りと内部の彫り筋、**Branching**はRootedのVine／Hookの側枝です。
- 文字とFXの色・透明度は引き続きMixerで独立。彫り筋は背景色で塗らず、各棘の内部だけを透明に抜きます。強度を下げても棘の長さと出力余白を保ち、インクを薄くします。
- v44以前のProjectは **Legacy / 以前の装飾** で復元。切替は任意です。新規はRooted。パラメータは既存Batch／履歴／保存経路とsnapshotへ接続しています。

根の数には密度依存の上限があります（現行範囲で最大140）。長文全字への装飾や、移動中の根の恒久追跡は保証しません。8組のnative Canvas変更前後と12groupの実関数検証を用意。ブラウザ操作、Mixer全工程、実ファイル入出力、iPhoneは未確認・未公開です。採否と再現範囲は `.codex/web-design/thorn-rooted-20260904.md`。

### Paragraph Current — v44 local

FORMに **Paragraph Current / 段落の流路** を追加しました。文字の輪郭や色を塗り替えず、原文の段落ごとに、実際に組まれた行の束を共通の流路へ配置します。Inflection（うねり）／Crest（隆起）、曲がり、行束の開閉、中心位置、作用幅、傾き追従を独立に調整できます。

Textの **行長 / Wrap** を32em程度にすると、長い段落を折り返して試せます。0は従来の原文改行のみ。横組み／縦組み共通で、Gridでは無効。配置の幅だけを変え、キャンバス・カメラ・FXの表示範囲は制限しません。Applyの原文範囲／段落と文字種を組み合わせて適用でき、手動強度、固定、Undo、Project／Shareの状態、Composeの元文字変換、通常の描画snapshotへ接続しています。v43以前の保存は新Operator未適用・Wrap 0として開く加算的な変更です。

行束の開閉0で行間を維持し、正で開き、負で密集します。一様に適用した行の中心順は反転しませんが、強い設定・部分適用・異なる文字種設定では文字や隣接段落が重なり得ます。独自の時間進行やページ／見開き構造はまだなく、Composeが元の変換を引き継ぎます。Wordモードは語の途中を分割しません。日本語禁則・高度な欧文組版への準拠は保証しません。

`npm run test:paragraph` は実関数11group（模擬DOM）：行と段落、横／縦対応、極値、固定style保持、遠方のhit test、snapshot／Compose変換、Project／Share強度、3千／1万／5万glyph・51状態の計算を検証。本文編集試験にも1万字の新Operator部分適用・離れた編集・Undo／Redo・Project JSON復元を追加。Native Canvasの7出力を実際に確認していますが、組版座標はfixtureであり、ブラウザーの折返し・保存handler・実iPhoneの確認ではありません。性能測定も実DOMのfpsとは分けています。

実出力の比較・一次資料・再現方法は `.codex/web-design/paragraph-current-20260904.md` に記録しています。ローカル実装で、公開はしていません。

### 原文の範囲・段落を一括適用 — local

Textの原文を選び、**選択範囲を対象に** または **この段落を対象に** でApplyへ進めます。カーソルだけでも、その改行区切りの段落を選べます。Applyでは **一括適用の範囲 → 範囲内の文字種 → 対象の確認 → 適用／解除** の順に絞り込みます。選択だけでは効果は変わりません。結合文字・連結書体は字形単位で適用し、固定文字と範囲外は変更しません。

本文編集時は既存の文字対応に沿って範囲を追跡し、対象文字がすべて失われた場合は適用を停止します。原文Undo／Redoでは範囲も復元します。対象範囲はsession内の選択状態で、Projectの新規／読込では全文へ戻ります。適用済み効果は既存Project形式で保持します。この範囲は一括適用・解除用で、Lensや文字種別パラメータの上書き範囲は変えません。表示上の折返し行・ページ選択と恒久的な原文IDは未実装で、反復文字の編集追跡は既存LCSの対応規則に依存します。

実関数・模擬DOMで、入力直後の適用、範囲と文字種の交差、CRLF／絵文字／連結書体、削除・Undo／Redo、1万字の部分適用とProject JSON状態復元を検証しています。ブラウザーの描画・実イベント・ファイル保存と実iPhoneは未確認です。

制作工程は **Text → Effect → Apply → Compose → Export** の一方向で、デスクトップとモバイルの現在地を共通保存します。モバイルで選んだ工程からデスクトップへ戻った場合も、選択表示と実際のパネルが一致します。Applyの冒頭では **選択Effect → 対象**、作用中の文字数、**Quick apply** をまとめて表示し、最初の画面から対象全体への適用・残りへの適用・解除を切り替えられます。解除時に視覚イージングの残像が消えるまでは **解除中…** と区別し、ボタンは次に実行される永続操作を表示します。GridがOFFのときにArrangeを選ぶとGrid設定へ移動し、ONにしたあとは同じ操作からArrangeへ入れます。設定シートは開いた工程名へフォーカスし、閉じると元の工程ボタンへ戻ります。モバイルのシート上部にある **Find** から全工程のパラメータを検索でき、結果を選ぶと該当工程・Operator・詳細欄を開いて値へ移動します。検索条件があるときのEscapeは条件だけを解除し、空の状態でもう一度押すとシートを閉じます。Composeは **Engine → Grid → Build / Apply → Perform** の順に並び、適用後は演奏コントロールへ直接移動できます。視差軽減時はUI内の自動スクロールも即時移動へ切り替わります。

Effectの **Browse / 一覧** は51種類をカテゴリと短い説明付きで比較でき、名前・カテゴリ・特徴から検索できます。検索またはカテゴリ絞り込み中のEscapeは条件を解除し、もう一度押すと一覧を閉じます。選択したEffectは通常のセレクトと同期し、Project保存・読込で維持されます。タブ更新時は初期状態に戻ります。Stretch X / Yは−2〜8の符号付き範囲になり、負側の連続圧縮から正側の極端な伸長まで同じ操作で扱えます。

FORMの **Rotate / Skew / Baseline Shift / Mirror** は、全字へ同じ値を掛けるだけでなく、元文字の行内位置・word・Unicodeから決定的なcadenceを作ります。RotateはUniform／Alternating／Wave／Unicode、Skewは反対方向と位相差を持つshear field、BaselineはWave／Zigzag／Unicode path、Mirrorは全字／交互／block／word／Unicode grammarを選べます。角度±720°、shear±85°、baseline±12em、1行16 cycleまで振れ、文字種Batch、Undo、自動保存、Project、Share、Look、PNG／SVGと同じ状態を共有します。v20以前のProjectは従来の一様変形として開きます。

Data Moshは選択中でも、文字へ未適用または解除済みなら完全な恒等変換を返します。未適用の破断Seedが原文表示や通常のPreview / PNG / SVGへ反転・ずれを混入させることはありません。

Cloister Foldも、Operatorを選んだだけでは描画されません。文字ごとの適用強度とFold量を独立して保持するため、未適用・Undo・解除・再読み込み後の原文やPreview / PNG / SVGへ折り面が混入せず、適用した文字にだけ効果が現れます。

Applyの **Active / 作用中** はEffectの登録総数ではなく、実際に作品へ作用しているEffectとCompositionだけを件数表示します。モバイルのExportは最初に **Quick export / すぐ書出** を表示し、現在のフレーム、PNG倍率、背景、書き出し範囲を一行で確認してPreview / PNG / SVGへ進めます。**Deformed only** に対象がない場合は書き出し操作を無効化して次の行動を示します。Previewは端末向けに解像度を抑えつつ、実際に保存されるフル解像度も併記し、PNG本番出力の寸法は変更しません。

Undo / Redoは実行できる履歴がある場合だけ有効になり、文字への適用だけでなく通常パラメータ、色、Surface Mixer、Grid、Composition設定も作品状態として復元します。Ctrl/⌘+Z、Ctrl+Y、Ctrl/⌘+Shift+Zにも対応し、原文入力も作品と共通のsession履歴へ統合しています。IME変換中は確定を待ち、ほかの検索・数値入力欄は通常の入力履歴を維持します。モバイルの各±操作はSizeなどの表示名で読み上げられ、最小／最大値では進めない側が無効になります。各RESETも対象パラメータ名を読み上げます。モバイルのProjectメニューは最初の操作へフォーカスし、外側タップまたはEscapeで閉じます。Previewは明示的なClose操作、Escape、背景タップに対応し、閉じると起点の操作へ戻ります。Composeの末尾からExportへそのまま進めます。

iPhone幅では、チェックボックスと開閉見出しを最小44pxの操作領域に統一しています。Application helpは開くと実際のLens／Edit説明を表示し、checkbox／selectの変更もUndo / Redoと自動保存へ入ります。320×568のような短い画面では、常設の5工程ドックを移動手段として使い、Nextボタンは通常フローへ戻して設定やRESETを覆いません。未変更の行は非表示RESET用の余白を取らず、狭幅でも主要項目を自然に並べます。

Composeはクリーン起動直後を0 changedとして開始し、Engineごとの短い説明と未適用DraftのProject保存・読込を備えます。タブ更新時はComposeを解除します。モバイルの全パネルbutton／checkbox／Disclosure／RESETは44×44px以上です。ProjectのShareはメニューを閉じずにCopied!／失敗を表示し、Motion videoのCancelは進捗を0へ戻します。

ExportはPNG／SVG／View shot／Copy PNGの生成中・完了・失敗と実寸をデスクトップ／モバイル両方へ表示し、Project JSON保存もメニューを閉じずにサイズと保存経路を通知します。

Project JSON読込はファイル選択・読込中・成功・キャンセル・形式エラーを同じProjectメニュー内で通知します。成功／失敗後もメニューとLoad操作のfocusを保ち、壊れたJSONや別形式のファイルでblocking alertへ移動しません。

Copy source／Copy display／Share URLで端末のClipboard APIが拒否された場合は、内容を失わずにアプリ内の手動コピーシートを開きます。16pxの選択済みテキスト欄、Retry copy、Select all、Closeを備え、背景タップまたはEscapeで閉じると起点の操作へfocusが戻ります。Preview、PNG、SVG、View shot、Design Space Sheet、Project読込の失敗も各工程のlive statusへ集約し、アプリ内から`alert()`／`confirm()`／`prompt()`を呼ばない契約を静的検証します。

New projectはブラウザのconfirmへ移動せず、Projectメニュー内で8秒間だけ有効な二段階確認を行います。最初の操作では作品を変更せず、外側タップ・Escape・メニューを閉じる操作・時間切れで解除されます。確認後は作品と復旧用を含む自動保存を消去して再読込し、同じメニューを開いたまま完了結果とNew操作へfocusを戻します。保存済みPresetなど作品外の制作資産は保持します。

EffectのPresetは、一覧で選んでから明示的にApplyするため、選択内容を確認して同じPresetを何度でも再適用できます。名前入力、Save／Update、保存済みPresetの選択削除、適用・保存・削除結果はすべてEffectパネル内にあり、ブラウザのprompt／alertへ移動しません。削除は同じボタンをもう一度押す二段階確認です。Preset適用はUndo／Redoと自動保存へ接続されます。

## Unbounded canvas

右側の制作領域は、出力サイズから独立した無制限のワールドです。**View**を有効にするとマウス／指のドラッグで境界なく移動でき、ホイール／ピンチまたは±ボタンで5–3200%まで拡縮できます。テキスト、Effect、Compose、ComposeのLogical viewportを変更してもカメラ位置と倍率は変わりません。**View shot**だけが現在見えているカメラ範囲を保存し、通常のPNG / SVG / 固定サイズ動画はExportの**Output frame**を使います。

## Glyph Body operators

**Marbling Type** をローカル本体の **Effect → Glyph Body** に追加しました（v43、50 Effects / 44 Surface / 13 Glyph Body）。Rake／Eddy／Plumeの3開始設定と6軸で、墨と穴を一緒に櫛目・双渦・羽毛状へ流します。Amount 0は元文字。Batch、Mixer、保存系、Compose時刻、PNG／SVG／video共通描画と準備状況へ接続しています。[実装・検証と制限](.codex/prototypes/marbling-type/README.md)に詳細を記録。実ブラウザ操作・download・実iPhoneは未確認で、未公開です。最終形の生成は同期式のため、密な字・強設定・多数文字で再生が遅くなる可能性があります。Design Space Sheetは未対応。

### Counterform Engine — v42 / local integration

Counterform Engineを、画面全体のmaskへ小さな切れ目を足す処理から、文字ごとの負形トポロジーを再構築するGlyph Bodyへ更新しました。**Chamber / 開口室、Stencil / 構造切断、Reservoir / 墨溜まり、Canal / 芯線**の4ボタンは別Effectではなく、違う生成則をすぐ比較する開始設定です。

- `Reciprocal chamber`はcounterの体積と輪郭を変え、指定角度へ一つのflared mouthを開きます。最短方向へ勝手に反転せず、細い外周には最低肉厚を残します。
- `Load-bearing stencil`はcounterから紙面へ1–4本の直線的な切断を通します。従来のように白い穴へ黒線を置く疑似bridgeではありません。
- `Intersection reservoir`はcounter境界から太い交差部へ2–7本の先細りreservoirを刻みます。`Medial canal`はcounterの有無に依存せず、黒い画線の芯を二重線と周期的なvalveへ変えます。
- 閉じたcounterがないSなどでは、外へ開きつつ複数方向を画線に囲まれた湾だけを候補室にします。Batchは各文字の文法・圧力・幅・方向・深さを独立評価し、重なった字やComposeコピーで平均化しません。
- 768px emの字形maskから構築し、source／解析field／出力maskを別の上限付きLRUへ保持します。Pressure／Bridge／Trapを0にするとnative字形へ戻り、font再読込時は全cacheを破棄します。live previewの一字失敗は原字を残し、PNG／SVGなど非live出力では黙って代替しません。
- v41以前のProject／Batchはhidden `*V29` grammarへ移し、当時のwhole-scene rendererを保持します。現行Project／Share／SVG schemaはv43です。

同じ8実字形、同じ既定値、固定fitで現行v29・v42・列順反転・極端値を比較した検証条件と再現手順は[offline QA note](.codex/prototypes/counterform-engine/README.md#offline-evidence)にあります。生成画像は配布物に含めずリポジトリ外へ保存しています。参考にしたのは[MuirMcNeil Triode](https://muirmcneil.com/project/triode-type-system/)のform/counterformの相互性、[U_Type](https://muirmcneil.com/project/u_type/)の構造的な開口、[Glyphs Handbook](https://handbook.glyphsapp.com/editing-paths/)の局所的な輪郭接続です。字形、grid、asset、codeは転用していません。**実ブラウザ操作、native download、実iPhone Safari、公開版は未確認です。**

### Auxetic Type — v41 / local integration

字形の実輪郭を回転格子で切り分け、各断片を剛体パネルとして開閉し、元の画線が切断面の両側へ連続していた区間だけを、しなるligamentで再接続する新しいGlyph Body Operatorです。上から模様を足さず、文字のmaterial adjacencyとnegative spaceそのものを変えます。Aperture／Lancet／Cipherは別Operatorではなく、同じ構築系を探る3つの開始設定です。

- Opening `0–90°`、Module `6–96`、Aspect `.25–4`、Axis `±180°`、Ligament `0–1`、Motion `0–1`。Opening 0はnative fontへ戻り、Compose phase 0と1は同形、Motion 0は位相非依存です。
- 768px emで字形を取得し、実際の表示／書き出し変換から0.2物理pxを字形ローカル許容値へ逆算して、ligament両側を適応分割します。これは取得済みpolylineに対するsampled criterionで、元fontのBezier輪郭や全曲線に対する形式的誤差保証ではありません。
- 同じfont・字・Module／Aspect／Axisの切断配置を共有し、Composeの同一出力設定は最大拡大コピーに必要な精度で一つのPath2Dへまとめます。描画順と各文字の透明度は保持し、300コピー／3設定のVM検査では3形状だけを生成します。
- Surface MixerのTEXT／FX、色、blend、order、Batch、Undo、autosave、Project／Share／Look／SVG（現行schema v43）、font再読込、準備状況、一時停止／再開、失敗時の再準備、strict export guardへ接続しています。無効化・空文字・FX 0%では不要な準備を破棄します。
- 262,144 source点、524,288 output点、4096px source canvas、ligamentごと8192 subdivisionを越える場合は、文字や精度を黙って落とさず明示的に停止します。

5実字形×3開始設定×17位相の255状態、A/B比較、数値・VM・全回帰テストの詳細は[Auxetic Type technical note](.codex/prototypes/auxetic-type/README.md)。現在はローカル統合済みですが、実ブラウザ画面、native PNG／SVG download、実iPhone Safari、公開版は未確認です。

### Calligraphic Stress — contour quality

Calligraphic Stressも輪郭方向・文字ローカル座標の品質パスを反映しています。輪郭の連続した長さから筆先方向を求め、文字ごとに造形してから回転・傾斜・鏡像・縦組みの位置へ配置します。Broad／Brush／Split／Chiselと値域を維持し、Batch設定の平均化と重なり時の最近接文字への所有割当を除きました。Composeの透明度は最終inkだけに適用します。[比較・検証範囲](.codex/prototypes/calligraphic-field/README.md)。実ブラウザ／実iPhone／大規模Composeの性能は未検証です。

### Conformal Type — v40 / local integration

文字とcounterの全輪郭を一つの複素写像へ通し、字形自体を収束・螺旋化・放射する新しいGlyph Body Operatorです。Effect → Conformal Type → Applyで使用します。Lens／Coil／Flareは別エフェクトではなく、同じ高精度写像を探る3つの開始設定です。

- Field `0–0.94`、Power `−3–4`、Spiral `−4–4`、Axis `±180°`、Compose orbit `0–1`。Field 0とPower 1 / Spiral 0はnative fontへ戻ります。
- 768px emで輪郭を取得し、表示・PNG・SVGの実変換行列から、取得済み輪郭に対する物理0.2pxの近似許容誤差を逆算して直接描画します。元フォントのベクトル輪郭との誤差保証ではありません。既存Surface共通の最大1440px rasterを経由しません。
- 全counter／離れた点を同じ座標場で変形し、nonzero windingで重なりを保持します。強いPower／Spiralの自己重なりは表現範囲として許容し、途中で形を切り捨てません。
- 同じfont字形は共有し、準備を1字形ずつ分割。262,144 source点、1出力131,072点、4096px source canvasを越えた場合は解像度を黙って下げず、明示的に停止します。
- Composeの同じ字形・設定はフレーム内で輪郭とベクトルpathを共有します。最大拡大コピーに必要な精度を採り、各コピーの描画順・透明度は維持します。書き出しの準備確認では編集画面の字形を破棄せず、解除・空テキスト・FX 0%で不要な準備を停止します。失敗時は「再準備」から再試行できます。
- TEXT／FX、色、blend、order、Batch、Undo、autosave、Project／Share／Look／SVG v40へ統合。Compose phase 0と1は同じ形へ閉じ、適用や値変更で無制限キャンバスのカメラを動かしません。

実装と数値検証の詳細は[Conformal Type technical note](.codex/prototypes/conformal-type/README.md)。現在のQAはunit／VM mock／offline実字形に限られ、実ブラウザ操作、native download、実iPhone Safari、公開版は未確認です。

### Differential Type — v39 / local integration

文字の実輪郭が伸び、曲げ抵抗・近接反発・面積復元によって襞や迷路へ変わる、新しいGlyph Body Operatorです。Effect → Differential Type → Applyで使用します。最初は1–3文字、Rooted（原字保持）／Labyrinth（迷路）／Frond（葉状）の開始設定から試してください。

- 成長量0–5、襞の間隔、原字への拘束、曲げ抵抗、成長の偏り、面積目標比、Composeの成長／巻き戻し量。0では元のフォント描画へ戻ります。
- 成長中の点と輪郭線の接触を検出し、細い隙間を突き抜ける動きを局所調整します。再生履歴も接触・軌跡誤差に応じて細分化し、粗い設定で途中の形が交差する現象を抑えます。密度や成長量の範囲は維持。全フォント・全条件での非交差保証ではありません。
- 高い曲げ抵抗では数値更新の幅を調整し、細かな往復振動を抑制。通常の開始設定は維持しますが、従来の不安定な高Bending値では同じ設定でも形が変わります。
- 同じ字形・設定は計算と履歴を共有。初回は4msを目標に分割計算し、未計算部分は元文字で表示します。画面上部に進捗と一時停止／再開を表示。設定変更時に古い計算を外し、font load完了時には輪郭を再取得します。
- 成長量を下げる操作やCompose再生は履歴を再利用します。色・TEXT／FX透明度・blend・orderはSurface Mixerから独立調整。Batch／Undo／autosave／Project／Share／Look／SVGのv39メタデータへ接続済みです。
- 履歴が64 MiBに達すると計算を停止し、追加容量は明示操作で許可します。これは総メモリ上限ではありません。文字を黙って落としたり解像度を下げたりして合わせる方式ではありません。
- 成長計算が未完了ならPNG／SVG／Copy／映像出力は止めます。「準備できました」の後に再度出力してください。SVGの生成bodyは既存仕様と同じ埋め込みPNGであり、font／Bezier輪郭の書き出しではありません。成長を含むDesign Space Sheetは現在未対応と表示します。

`npm test`では、埋込みsource一致、計算の決定性、連続接触・狭い輪郭の回帰・補間サンプル、共有・取消・停止／再開・メモリ停止・native zero・Compose loop・Mixer・書き出しguardを検査。**ブラウザ画面操作、native出力ファイル、iPhone実機は未確認・未公開**です。極端値での輪郭交差や穴の包含は一般保証ではありません。

研究の出発点は[Nervous System / Floraform](https://n-e-r-v-o-u-s.com/blog/?p=6721)の場所ごとの成長と曲げの競合、[Anders Hoff / differential-line](https://github.com/inconvergent/differential-line)の連結輪郭の成長です。画像・font・外部実装を取り込まず独立実装しています。

### Spectral Type — v38 / local

文字の実輪郭を閉じた周期曲線として分析・再合成する新規Operatorです。描画線や装飾を上から重ねるのではなく、フォントの字形本体を変えます。**Liquid / 融解、Fluted / 脈動、Phase / 捻転**の3形態と、対象Profileだけを変更する3つの開始プリセットを用意しました。

- 変形量0–4、輪郭精度2–48、共鳴数2–24、位相−180–180°、穴の保持0–1、Compose motion 0–2。0変形はnative字形へ正確に戻します。
- 穴・独立した点・複数componentを保持し、反転／斜体／縦組み／Grid／Compose／exportの座標系を共有。輪郭生成はカメラや他の文字との重なりに依存しません。
- 輪郭は192pxの文字maskの濃淡から、画素間の半値境界を補間して抽出します。穴の保持を最大にしても、画素の四角い縁をそのまま拡大しません。フォントの元Bezier曲線を取得する方式ではなく、同じ設定でも旧二値解析より輪郭・太さ・波の位置が変わります。
- Flutedは部品の輪郭長に応じて襞の数を配分し、穴を除いた画線量から深さを決めます。細い画線・点・句読点をすべて同じ波数で刻まず、大きな輪郭との強弱を作ります。変形量0–4の幅は維持し、Liquid / Phaseの生成則は変えていません。
- Text / FX、色、Blend、描画順、Batch、Undo、自動保存、Project / Share / Look / SVG v38に統合。旧Projectでは新Operatorは未適用のままです。SVG内の生成レイヤーは既存仕様どおり埋め込みPNGであり、輪郭fontの書き出しではありません。
- 同字形の輪郭解析と再合成結果を再利用し、cacheは96字形・49,152標本、各字形4variantまで。文字を途中から非表示にする負荷対策はしていません。

参考：[Wasem / YerlyのFourier型字形研究](https://arxiv.org/abs/2409.11958)。閉輪郭を周期信号として設計する原理の比較に限定し、同論文固有の定幅三角形変換、作品、書体、コードは使用していません。新規外部asset／依存ライブラリはありません。

検証：`npm test`で輪郭の位相、穴と離れた点、細線と入れ子の画線量、3形態、ループ継ぎ目、極端値、8座標条件、rendererとpresetの統合を確認。初回6字形に加え、B / a / & / S / 永 / 書 / 鬱 / gの8字形を実フォントからoffline描画してFlutedを比較しました。**実アプリのブラウザ操作、PNG/SVGダウンロード、実iPhone Safari、公開版の確認は未実施**です。既存のlocalhostブラウザ安全制限を別経路で回避していません。

輪郭品質パスでは、3×3画素の全512パターンを独立した連結成分の判定と照合し、濃淡の半値境界・座標の半画素ずれも検査。5倍拡大で穴の輪郭を比較し、8字形×3形態を現行ソースから再描画しました。自己交差による細片や、変形後の外輪郭と穴の衝突は別の課題として残っています。補間原理は[D3 contours](https://d3js.org/d3-contour/contour)と[scikit-image find_contours](https://scikit-image.org/docs/stable/api/skimage.measure.html#skimage.measure.find_contours)を参照し、コードは独自実装です。

### 共通動作とその他のOperator

上から装飾を重ねるのではなく、原字の黒い輪郭・白いカウンター・terminal・文字間の接続を最終的な一色の字形へ再構成する13種類の **GLYPH BODY / 字形本体** Operatorを備えます。適用時はTEXTを0%へ切り替えて置換bodyだけを見せますが、Surface Mixerから元文字を0–100%で戻せます。上記Auxetic Type／Conformal Type／Differential Type／Spectral Typeと以下の5つに加え、Pressure Stroke、Sinew Torque、Chimera Graftも置換bodyとして動作します。

- **Calligraphic Stress** — 各glyphの局所座標で筆記具断面を評価し、Broad nib sweep / Pressure brush ductus / Split nib incision / Chisel edgeを別のbody生成則として再構成します。単なるoutline strokeではなく、方向依存のnib support、pressure envelope、乾湿、split incisionが太細と内部切開を決めます。
- **Counterform Engine** — 文字ごとのcounterと外側の紙を分離し、Reciprocal chamber / Load-bearing stencil / Intersection reservoir / Medial canalを別のbody生成則として扱います。閉じた穴がない字では囲まれた外部湾を補助counterにし、開口室、1–4本の構造切断、交差部へ刺さる墨溜まり、画線芯の二重canalへ分岐します。
- **Terminal Excess** — 文字内部の骨格から画線の端とその接線方向を推定し、Bracketed wedge serif / Calligraphic trumpet / Teardrop terminal / Chisel bladeを少数の端部へ融合します。Oのような端のない閉じた輪には突起を作りません。Selectionは検出した端部から付ける数、Biasは横／縦方向の優先度を調整します。既存の先端4形状・値域・Legacyは維持しています。2026-09-04の変更はローカル反映・オフライン検証までで、実Compose／ブラウザ／実iPhoneの検証は未完了です。
- **Ligature Body** — Compound counterbodyでは同一行・同一語の隣接字から上下二つの実輪郭anchorを取り、二本の可変幅body、共有stem、component caret、語を貫く負形counterへ再構成します。旧Contextual interlock / Shared stem anatomy / Over/under counter weave / Capillary meltも互換文法として保持します。
- **Asemic Ductus** — 各文字の実maskからmedial ridgeとcounter chamberを抽出し、原文順・字面比率・Seedを持つ少数の書字anchorへ圧縮します。Continuous current / Counter chamber hand / Incised shorthand / Polyphonic ductusは、単なる線種変更ではなく、連続筆記、counterを跨がない室内筆記、切刻された短形、複声のbodyという異なる書記体系へ字形そのものを再構築します。Memory `0–1`、Gestures `2–16`、Weight `0.4–64px`、Flow `−4–4`、Contrast `0–6`、Flourish `0–480px`、Counter fidelity `0–1.5`まで振れ、Compose phase 0と1は同じ筆記状態へ閉じます。

設計調査では、[Google Fontsのparametric fonts](https://googlefonts.github.io/how2avar2/docs/parametric-fonts/)を黒／白形状の独立軸、[FontForgeのExpand Stroke](https://fontforge.org/docs/techref/stroke.html)を筆記具断面、[GlyphsのCorner Components](https://glyphsapp.com/learn/reusing-shapes-corner-components)をterminalの接続規則、[Typotheque Calcula](https://www.typotheque.com/articles/calcula)を文脈依存のinterlock、[OpenType GPOS](https://learn.microsoft.com/en-us/typography/opentype/spec/gpos)／[GDEF](https://learn.microsoft.com/en-us/typography/opentype/spec/gdef)／[GSUB](https://learn.microsoft.com/en-us/typography/opentype/otspec182/gsub)をentry／exit、component、caretの構造、[Adobe CJKのKazuraki解説](https://ccjktype.fonts.adobe.com/wp-content/uploads/2017/09/iuc33-lunde-s3t2.pdf)を比例和文と書字リズムの比較に限定しました。書体、glyph、OpenType規則、輪郭、UI、preset、作品画像、コードや既存algorithmは転用せず、現行の文字mask、距離場、原文順、Seedから独立実装しています。

## Generative surface operators

- **Kinetic Trace** — glyph alphaを輪郭回路へ変換し、Contour circuit / Reading-order relay / Serpentine carriage / Machine duetで経路の組み方そのものを切り替えます。実線のpen-down、破線のpen-up、lift記号、現在の描画head、薄い全経路、濃度の異なる時間履歴を別レイヤーとして描くため、静止時はplotter score、Compose時は描画機械の演奏になります。Density `0.02–4`、Pen lifts `0–1`、Machine drift `0–500px`、Route search `1–256`、Pen width `0.1–40px`まで振れ、旧来の角張った最近傍経路はLegacyとして保持します。
- **Field Webbing** — 文字輪郭のanchorと自由junctionを力密度緩和し、Force-density net / Radial loom / Braided truss / Cell membraneを切り替えます。Field reach、Gravity sag、Topologyによって、均衡する索網、中心織機、交差truss、薄い張力cellへ分岐し、従来のカテナリーはLegacyとして保持します。
- **Physarum Blob** — 複数文字を栄養核にした半透明膜と輸送管へ、文字から最大2400px離れて拡散する胞子場を重ねます。Mass、Spore reach、Spore fieldで、疎な微粒子から多孔質の島と画面を覆う薄いコロニー面まで変化します。カメラ入力の **Blob Track** とは別機能です。
- **Etchant Bloom** — 字形マスクを有限振幅の化学seed・栄養場・境界条件にしたbounded Gray–Scott fieldです。Labyrinth front / Mitosis cells / Coral invasion / Crystalline etchでseedと反応係数を分け、平滑な外光ではなく複数濃度のisocontour、反応cell、孔、侵入frontを残します。Morphology、Reaction scale、Growth time、Etch / bloom、最大640pxのChemical spillを持ち、従来の連続面はLegacyとして保持します。
- **Sigil Forge** — 入力字形を最大24個のaffine componentとして選び直し、太い共有bodyへ圧着します。Cartoucheは字形を周縁と中央核へ組み込む閉鎖印面、Countersealは中央へ圧縮した二重rail、Radialは多弁rosetteと回転component、Branchは幹・分岐・字形terminalを作ります。Counter cutsは潰れた内部へ紙色の彫り溝を再挿入し、旧node graphはLegacyとして保持します。
- **Thorn Crown** — 実際の字形境界の少数nodeへ幅広い基部を融合し、Lancetはkeelを持つ一枚の槍板、Hookは連続して反るprickleと返し、Vineは節・側枝・芽、Tridentは一つの基幹から分岐する三叉として成長します。先端へ同じ矢印を貼る方式ではなく、根元・軸・分岐・terminalの比率そのものが4系統で変わります。
- **Cipher Liturgy** — 元文字のUnicode、10／16／8／2進表記、文字順、文字種、行列座標、checksumを、字面内部のmicro inscription、語単位のframe、行単位のindex rail、選択的calloutへ階層化します。Unicode／Machine／Ledger／Ritualはtokenだけでなく、property tab／bit bus／folio rule／sealというmacro構造まで変わります。
- **Bone Scaffold** — 新規既定のTrabecular load fieldは、元字形を少しだけ拡張したperiosteal envelope、連続cortical shell、lamellar band、荷重方向へ偏るplate／rod trabecula、紙色のmarrow canal、同心lamellaとcanaliculiを持つosteon bossへ階層化します。Spacing `2–96px`、Porosity `0–6`、Connectivity `0–8`、Cortical weight `0.2–32px`、Osteon `0–64px`、Anisotropy `0–8`まで振れます。Spine／Rib Cage／Truss／Adaptiveはv35以前の保存作品を同じ見た目で開くため残し、すべての構築線を実際の字形counterを保った局所maskへclipします。
- **Rose Engine** — plate traceryとbar traceryを別構築則として扱い、太い下部構造、紙色のcut channel、鋭いEffect railを三層で描きます。尖頭cusp、archivolt、boss、source由来の副oculusを共有しながら、中心はOculusの厚いplate eye、Foilのlobed bar、Compass star、spiral Knot、mini Rosetteへ明確に分岐します。
- **Chrome Reliquary** — 字形距離、法線、light方向、接線方向から、黒いhorizon band、広いenvironment reflection、anisotropic glint、coat highlight、bevel、押し出し影を分離生成します。分光rimは補助層へ抑え、ReflectとMercury Warpを上げると文字面内部から通常金属〜液体acid chromeまで連続変化します。Compose中の反射は二軸の閉軌道で動き、各層の流れを分けながらループ境界の色・coat位置の飛びを抑えます。静止時・phase 0の描画と全パラメータ範囲は維持。`npm run test:chrome`は実rendererの境界近傍・全軸端点・静止互換・旧挙動のnegative controlを検証します（実ブラウザ／native出力／iPhoneは別途確認が必要）。
- **Ligature Crypt** — 元文字の輪郭全体をEffect inkの一語の字身へ置換し、同じ行・同じ語に属する原文順の隣接文字だけを融合します。Mortise fusionは両字へ食い込む共有字身・socket・key・counter、Textura counter braidは二本の角張ったstrapとover／underの紙色gap、Cut-edge sutureは実際に切り欠いた字端・eyelet・縫合線を生成し、3文法が別のsilhouetteとnegative spaceを持ちます。Legacy ribbonだけは旧描画を正確に保持します。新規状態の本文は12%で、Surface Mixerから0–100%へ変更できます。
- **Moiré Choir** — 各文字を波源へ変え、Nodal choirでは文字間の経路差から整数波長の腹と半波長の消失帯を形成します。Wavefront wellsは三つの円形波、Angular causticsは角度場、Woven beat latticeは近接周波数の乗算による織り目を使うため、5文法が同じ縞の向き違いにはなりません。Carrier pitch `2–240px`、Beat detune `−1.5–1.5`、Field reach `0–1800px`まで破壊的に広げられ、単独文字には仮想波源を補って場を成立させます。旧Projectの描画は`Legacy carriers · Nodal contrast 0`として保持します。
- **Nave Cutter** — 行ごとの字面をわずかに膨張したmasonryへ変え、尖頭開口を実際に透明へ抜き、bay、束ね柱、四層rib、boss、flyerを一つの荷重系へ組みます。Ribbedはquadripartite、Fanはspringerから展開する曲率群、Loopはlierne結節、Clerestoryはarcade／triforium／lancetの三層となり、旧来の三角形反復やBone／Roseの放射線とは別の負の建築断面です。旧ProjectのArcadeは`Legacy arcade · Rib 0`として明示的に保持します。
- **Cloister Fold** — 元字面を共有頂点のpiecewise-affine折面へ実際に写像します。Miuraは斜交するquadrilateral mesh、Accordionは全文字を横断する幅広いhinge、Diamondは共有cornerを持つ局所pyramid、Fanは中心・内周・外周を結ぶ放射pleatになり、輪郭、面法線の7段照明、二重のmountain／valley rail、投影影が同じgeometryから変化します。Legacy stripsだけは旧描画を保持し、新規状態の本文は14%でSurface Mixerから戻せます。
- **Prism Sacrament** — Birefringentは字画厚と局所結晶軸からordinary／extraordinaryの二重像、波長別位相色、輪郭法線起点の二色causticを一つの光学体として生成します。Cut Crystal / Fresnel / Spectral / Lenticular / Legacyも保持し、Chromeの金属反射やRisoの固定版ずれとは分離しています。
- **Textura Matrix** — Textura / Fraktur / Bastarda / Latticeは字形ごとの連続alpha runを反復stem、菱形cap、broken shoulder、cursive tailへ再記述します。Medial Ductusは実alpha bodyの中心経路と局所画幅を追う固定角broad nibで、曲線、counter、日本語の筆画、孤立markを保った別の字身へ変えます。
- **Void Portal** — 全文の複写ではなく、各glyphに実在するcounterを連結成分として分離し、counterを持たない字では深いstroke内部だけを局所chamberへ変換します。Counter archivoltは同一方向へ連なる局所extrusion、Carceri wellは方向を分岐させた不整合な井戸とcross-brace、Event horizonは回転・湾曲しながら収束する空間として、入口・側壁・奥壁・rail・最大32本のribを同じ局所topologyから構築します。Portal depthは0–1600px、Projection angleは±180°、Portal mouthは0–1、Perspectiveは−2–2まで振れ、Nave Cutterの既成archや旧来の全文コピーとは異なる文字固有の負空間になります。Legacy phrase copiesは旧Project互換のためだけに保持します。
- **Recursive Shrine** — 新規状態では全文フレーズの複写を行わず、各文字をsource-derivedなcompound glyphへ再構築します。Nested reliquaryは継承する正負の字身と紙色aperture、Tracery treeは親子railを持つ分岐、Cantor cloisterは段階的なbay、Mandorla vaultは文字固有の尖頭frameを生成します。Generations、Inheritance、Branch turn、Local reach、Aperture parityを極端値まで振っても有限node budget内で構造が保たれ、旧Project向けのLegacy orbit / XORだけは従来の全文再帰を正確に保持します。
- **Morph Procession** — 隣接文字をcentroid・occupied extents・principal directionの共通feature frameへ正規化し、signed-distance fieldを文字間で補間します。Feature corridorは輪郭標本と3本の対応rail、Counter braidは正負二重輪郭の交差、Scale cascadeは成長する変形標本、Melt membraneは連続bodyとcounter channelを生成します。端点を字面内部からfacing edgeへ移したため、同じ小文字コピーを元文字上へ重ねる旧描画ではなく、空白そのものが最大24段階の変形経路になります。Legacy SDF chainも旧Project用に保持します。
- **Chimera Graft** — 同じ行で隣接する文字をdonor／hostとし、Donor transplant / Vascular anastomosis / Mosaic body / Symbiotic unionを切り替えます。断片移植、管腔を持つ再接続路、縫合patch、共生lobesが別々の接合文法となり、単独文字では自己移植します。Thornの外周装飾やMorphの中間字形、Sinewの応力変形とは異なるPosthumanなunionです。
- **Monolith Cast** — 各glyphを独立した鋳造bodyとして走査し、Legacy wall / Cast strata / Ashlar blocks / Counter vault / Stereotomyの5構築文法へ変換します。Stereotomyは実counterを圧縮vault、字身を噛み合うvoussoirと曲線courseへ再構成し、Massを侵食−120pxから破壊的膨張360px、Faultを±480pxまで振っても、既定値では文字固有の輪郭と空洞を保持します。Rasterの点網、Cellの破片、Data Moshの信号破壊とは異なるglyph-localな量塊構築です。
- **Raster Press** — Gravure wells / Adaptive AM / Stochastic FM / Line screen / Mezzotintを独立したscreen grammarとして切り替えます。Gravureは外壁・空隙・インク溜まりを持つ回転凹版セル、Adaptiveは可変径網点、Stochasticは非周期粒子、Lineは帯、Mezzotintは短い刻みとして別の版面構造を作ります。セル寸法、Dot gain、角度、版ノイズ、Tone modulationで精密な網点から粗い印刷面まで調整できます。
- **Hatch Engrave** — 字面内部の境界深度をtoneとして読み、Tonal / Cross-cut / Burin / Woodcutを別々のstroke textureで刻みます。Plate depthが交差familyと深部線を増やし、細い線刻、放射状の鑿跡、太い木口の断線を一つの平行線filterへ潰しません。v30のBurinは始終端をhairlineへ戻すswelling cutとなり、紙色の浅いplate reliefと外周biteが溝を可視化します。
- **Contour Etch** — 字形を標高源へ変換し、Continuous Isobars / Index Contours / Cut Terraces / Watershedを切り替えます。等高線の太さ階層、補助線、段丘面、等高線を横断する排水線を別文法として生成します。
- **Pressure Stroke** — Gesture body / Bristle fan / Ink pooling / Flying whiteを別の筆体系として切り替えます。筆圧と速度は字身幅、曲がる毛束は分岐、滞留は墨溜まり、低含墨量は飛白へ変換されます。Weightを負側へ振れば内部侵食、正側へ振れば大胆な質量化ができ、Taper、Dry brush、Breathも字身そのものへ作用します。2026-09-04の局所品質パスでは、矩形noiseの段差を連続した筆圧・毛束fieldへ置換し、位相の直前／直後で横曲げが飛ぶ問題を周期driverへ変更しました。全値域とLegacy massは維持し、modernの見た目は意図して変わります。52px／192pxのoffline比較と`npm run test:pressure`で検証していますが、実UI・native出力・実iPhoneは未確認です。
- **Sinew Torque** — 同じ行の文字を細いfasciaで一つの組織系へ接続してから、Axial torsion / Fascicle field / Belly compression / Opposed braidの逆写像で置換します。線維のpennation、拮抗方向、長軸aponeurosisも輪郭と同じ応力場へ従います。最大±640pxのPull、±540°のTorque、Tension、中央圧、Body axisを持ち、従来の膜変形はLegacyとして保持します。
- **Cell Fracture** — Impact / Fault / Crystal / Spallの破断topologyを切り替えます。Impactは文字の実ink上へ衝撃点を置く放射sectorと分岐亀裂、Faultは複数文字を横断する三本のせん断帯、Crystalは三方向の劈開格子と欠落facet、Spallは中心pitから広がる同心剥離とradial crackです。Energyは亀裂分岐・伝播距離・破片移動を同時に押し広げます。
- **Ribbon Echo** — 字形を最大96個の順序付き横断面へ切り、断面間へ連続面を張ります。Solid section prismは文字のsidewall・front/back cap・断面rib、Sectioned helixは表裏の陰影と中央channelを持つ一枚の捻れ帯、Hinged fanは共通pivotから開く紙葉、Over-under braidは二本の幅あるlaneと交差部のpaper gapを生成します。全文字の透明copyを並べる旧方式はLegacyとして保持します。
- **Copy Decay** — Generational loss / Scan banding / Drum ghosting / Residual tonerを独立した複写機故障として切り替えます。露光、ドラム移動、摩耗、トナー、紙粉、Machine instabilityが各故障で別の役割を持ちます。v30では低濃度のドラム反復、scan scar、清掃しきれないtoner cloudを二値化後にも残し、本文の黒へ埋没しない複写故障になりました。
- **Riso Separation** — Organic master / Area selection / Key & fill / Dual halftoneで内容の異なる二つのspot-ink masterを作り、spread / choke、drum pressure、registration、overprintから第三色を生成します。
- **Misregistration** — Legacy flat passes / Paper stretch / Slur / Doubling / Trap & chokeを別々の印刷故障として扱います。二つの版色、版移動、24のink zone、紙伸び、方向スラー、spread / chokeが独立し、均一な二色影から場所ごとに見当が崩れる印刷面まで連続します。
- **Data Mosh** — Delta prediction loss / Motion-vector swarm / Entropy cascade / Keyframe collapseを切り替え、共有motion vector、macroblock、参照frameの残留、channel bleed、欠落行を時間的に保持します。文字ごとのランダムな横伸長ではなく、壊れた参照関係そのものを生成します。
- **Blob Track** — カメラ入力からstable ID、centroid、area、velocity、orientation、lost / revive、軌跡を追跡し、Velocity flow / Oriented contours / Relation mesh / Diagnosticへ変換します。カメラOFFでも適用文字群から検査可能なdemo fieldを作り、meshは局所衛星点と文字間bridgeを別階層で結びます。
- **Slit Sweep** — 有限のFrame cacheを空間スリットから参照します。Interpolated waveは隣接時刻を補間、Indexed slabsは離散frameとaperture gap、Counter-time foldは逆向きの時間面とpaper slit、Recursive time wellは縮小・回転・orbitする遅延像を再帰化します。Compose位相もposition→time写像そのものを変え、Data Moshのcodec block破壊とは分離します。

Kinetic Trace v34の設計調査では、[AxiDraw CLI](https://axidraw.com/doc/cli_api/)／[Python API](https://axidraw.com/doc/py_api/)をpen-down距離、pen-up移動、順序保持／最適化の区別、[TouchDesigner Trace SOP](https://docs.derivative.ca/Trace_SOP)をalpha閾値からの輪郭抽出とresample、[TouchDesigner Trail SOP](https://docs.derivative.ca/Trail_SOP)と[SideFX Trail SOP](https://www.sidefx.com/docs/houdini/nodes/sop/trail.html)を時間履歴のgeometry化、[W3C SVG Paths](https://www.w3.org/TR/SVG/paths.html)／[SVG Strokes](https://www.w3.org/TR/svg-strokes/)を経路長とstroke progression、[Sougwen Chung — Drawing Operations](https://sougwen.com/work/mimicry-drawing-operations)を人と機械が応答する描画の比較に限定しました。外部のplot、drawing、robot path、font、作品画像、code、algorithm、preset、UI、paletteや数値は転用せず、現行glyph mask、原文順、Seed、Surface Mixer、Compose phaseから独立実装しています。Flow field tracerとengraving scanはField Webbing／Physarum／Raster／Hatchとの重複を避けるため採用していません。

Monolith Cast v35の設計調査では、[RIBA Brutalism](https://www.riba.org/explore/riba-collections/architectural-styles/brutalism-movement/)を露出構造と型枠痕、[ETH BRG — Rethinking structural masonry](https://brg.ethz.ch/publications/39)と[Striatus](https://brg.ethz.ch/research/prototypes/744)を離散block・圧縮流・interlocking bond、[ETH DBT — Tectonics of Concrete Printed Architecture](https://dbt.arch.ethz.ch/research-stream/tectonics-of-concrete-printed-architecture/)を積層と可変porosity、[Pritzker — Tadao Ando](https://www.pritzkerprize.com/laureates/1995)を精密鋳造と表面／構造の一体性の比較に限定しました。外部の建築形、石組み、図、式、寸法、施工法、写真、作品、font、glyph、algorithm、code、UI、preset、paletteや数値は転用せず、現行glyph mask、実counter、Seed、Surface Mixer、Compose phaseから独立実装しています。表面textureだけを主役にする方向と、碑文reliefへ寄せる方向は既存Material／Contour系との重複を避けるため採用していません。

Bone Scaffold v36の調査では、[Histology Guideのosteon／ground bone](https://histologyguide.com/slideview/MHS-233-ground-bone/05-slide-1.html)をcortical shell・同心lamella・Haversian canal・canaliculi、[trabecular plate／rodとanisotropyの研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC4545095/)を荷重方向へ偏る多孔質構造、[Smithsonianの骨内循環比較](https://repository.si.edu/bitstream/handle/10088/23604/SMC_72_Foote_1921_10_1-20.pdf)をbranching／plexiformの差、[Biodiversity Heritage LibraryのKunstformen der Natur](https://www.biodiversitylibrary.org/page/33543600)を自然構造の密度階層、[V&A Gothic](https://www.vam.ac.uk/collections/gothic)と[British Museum Waddesdon Bequest](https://www.britishmuseum.org/collection/galleries/waddesdon-bequest)を外殻・支持体・細部が一体化した装飾密度の比較に限定しました。顕微鏡画像、図版、骨形、建築、聖遺物、装飾、写真、文章、数式、測定法、font、glyph、algorithm、code、UI、preset、paletteや数値は転用せず、現行glyph mask、Seed、Batch、Surface Mixer、Compose phaseから独立実装しています。

Asemic Ductus v37の調査では、[Asemica](https://asemi.ca/)と[Tim Gaze / ASEMIC](https://www.asemic.net/)を読解以前の書字密度、[Emma Piercy](https://emmapiercy.com/)を破棄された文字断片の再編、[ZIN NAGAO](https://zinnagao.com/)を複数scriptの対位法、[Adobe Kazuraki](https://ccjktype.fonts.adobe.com/2009/05/kazuraki_1.html)を比例和文のductus、[StrokeStyles](https://doc.gold.ac.uk/autograff/post/papers/strokestyles_2022/)をmedial-axisに沿う書字構造、[FontForge Expand Stroke](https://fontforge.org/docs/techref/stroke.html)をnib sweep、[Google Fonts Parametric Fonts](https://googlefonts.github.io/how2avar2/docs/parametric-fonts/)を独立glyph軸、[Coldtype](https://coldtype.goodhertz.com/tutorials/text.html)をglyph単位の構造化運動、[Dainippon Type Organization](https://dainippon.type.org/classic/home.html)を文字の再構成、[W3C SVG Strokes](https://www.w3.org/TR/svg-strokes/)をpath progression、[OpenType glyf](https://learn.microsoft.com/en-us/typography/opentype/spec/glyf)を輪郭componentの比較に限定しました。作品画像、書体、glyph、script、筆跡、文章、配色、code、algorithm、数式、preset、UIや数値は転用せず、現行glyph mask、実counter、距離場、Seed、Batch、Surface Mixer、Compose phaseから独立実装しています。

44個のSurface Operatorすべてに、本文の **Text ink** と独立した **Effect ink** を用意しています。Riso Separation、Prism Sacrament、Misregistration、Data Moshは二つのEffect inkを持ちます。**Text under effect** は0–100%の連続値で、Full 100% / Ghost 22% / Hide 0%の即時プリセットも利用できます。置換字形である13種類のGlyph Body Operator（Calligraphic Stress、Counterform Engine、Terminal Excess、Ligature Body、Pressure Stroke、Sinew Torque、Chimera Graft、Asemic Ductus、Spectral Type、Differential Type、Conformal Type、Auxetic Type、Marbling Type）は本文0%から始まります。v30の新規Raster / Hatch / Copyはscreen、溝、複写残像が最初から判読できるよう本文12% / 45% / 72%、Heraldic Structure品質パスのThorn / Bone / Roseは装飾骨格との前後関係が読める72% / 6% / 82%、v31のMorph Processionは34%、Cell Fractureは18%、Sigil Forgeは鍛造bodyを主役にする14%、Ribbon Echoは断面面を主役にする28%、Slit Sweepは時間断面を主役にする26%、Ligature Cryptは12%、Cloister Foldは14%、Recursive Shrine v32はcompound glyphを主役にする16%、Void Portal v33は入口と奥行を本文から分離して読むため18%で始まりますが、いずれもSurface Mixerから0–100%へ変更できます。その他は本文100%を維持します。輪郭stress、counter、terminal、文脈合字、筆圧body、細線網、連続面、反応拡散、弾性輪郭、切断展開、紋章、輪郭棘、コード碑文、内部骨格、放射tracery、金属面、順序依存band、光学干渉、建築的な空洞、連続面の折り、透明体屈折、broad-nib再構成、counter portal、再帰的parity、中間字形、異物移植、書字体系合成、露出量塊、網点、彫版線、等高線、破片、奥行、複写像、二色版、版ズレ、codec破壊、追跡場、時間走査へ生成原理を分け、微細な状態から画面全体を横断する破壊的な極端値まで調整できます。

選択中のSurface Operatorには **Surface Mixer** が表示され、Text ink / Effect inkに加えて **TEXT（文字）** と **FX（効果）** の透明度を別々に調整できます。両方に0–100%スライダーと大きな即時プリセットがあり、FXを0%へ下げてもTEXTの設定値は変わりません。効果ごとのNormal / Multiply / Screen / Overlay / Difference / Add、Back / Frontの描画順も直接調整できます。出力値は40効果で独立し、旧ProjectのKeep / Ghost / Hideは100% / 22% / 0%へ移行されます。

Export内の **Design Space Sheet** は、選択中のSurface Operatorで特徴を決める二つの主軸を6 / 9 / 12案へ展開します。比較PNG、ラベルとSeed付き校正、選択案のTargetへの採用に対応し、単発のランダム生成ではなく比較しながら詰められます。

Apply内の **Look Memory** は、本文、文字ごとのOperator適用、色、全パラメータ、Surface順序、Composition、出力条件を4つのTakeへ記憶します。各Takeは作品プレビュー付きでRecallでき、A / Bは全画面のドラッグ可能なワイプで比較できます。OverwriteとClearはブラウザの確認ダイアログへ移らず、同じカード内で8秒以内に同じ操作を二度押す方式です。Escape、Look Memoryを閉じる操作、または外側の操作で安全に解除され、Capture / Recall / Clear後は対象枠の操作へフォーカスが戻ります。Recall前の状態へ戻す一段のReturnも持ち、Project JSON、自動保存、Share URLへ同梱されます。

Composeの **Type Matrix** は、文章の順序、文字頻度、文字種、字面幅をレイアウト信号へ変換します。Editorial hierarchy / Modular index / Perimeter / Tension fieldを切り替え、段組、セルスパン、見出し強調、中央のVoid、蛇行・縦方向の読み順、最大8倍の階層、180°回転、1.5セルの位置破断、完全ループする再配置を一つの構成系として扱います。4プリセットは同じフィルターの強弱ではなく、編集組版、索引、周縁組版、運動場という別々の出力原理を持ちます。

Composeの **Path Loom** は、文字列を一枚の波形へ貼るのではなく、測定した文字幅を持つ複数ストランドへ組版します。Ribbon / Orbit / Spiral / Hand-drawn path、最大12本の経路、8コピー、順方向／交互／鏡像／文字分配、Natural / Fit / Stretch、衝突圧、接線／法線、反転、Type rail、整数サイクル移動を組み合わせられます。アートボード上を指やマウスで一筆描きした経路は96点以下へ簡略化され、スムージング後も元データをProject JSON、自動保存、Share URL、Look Memory、SVGメタデータへ保存します。Scale 0.03–12、Weave −4–4、Normal push −3–3、0.25–16 turnsまで振れるため、端正なパス組版から画面を覆う破壊的なコイルまで同じ仕組みで作れます。

Composeの **Glyph Vessel** は、入力文字・単語・句を、別の字形、Capsule、Diamond、またはローカル画像の濃度マスクへ詰め直します。Tight / Flow / Edge / Densityは、階層的packing、読み順の流れ、輪郭への吸着、画像濃度による大きさという別々の構成原理です。穴と反転、Threshold、Gamma、Edge pull、最大1600個、Scale 0.02–8、負のGap、96回のRelaxation、180°回転、Still / Breathe / Circulate / Rupture、本文と独立した3色を組み合わせられます。画像は64×64の濃度場へ端末内だけで縮小し、Project、Share、Look、SVGへ保存します。

Composeの **Glyph Signal Router** は、8つの生成エンジンすべてに共通する文字単位の変調層です。Source order / Instance order / Unicode hash / Character frequency / Character class / Ink width / X・Y / Radius / Pointer distanceを、Ramp / Sine / Triangle / Steps / Pulse / Loop noiseで整形し、X・Y移動、回転、全体・縦横スケール、Skew、Opacity gate、独立色へ3系統まで直列に配線できます。Depth ±4は画板幅の移動、720°回転、1/16〜16倍まで到達し、整数Loop cyclesはPhase 0と1が一致する完全ループを保ちます。Type Wave / Script Split / Pointer Lens / Loop Pulse / Entropy Ruptureは開始点であり、個々の配線へ分解して編集できます。

文字データは変更せず、Lens / Edit / Type Batch、Composition、PNG / SVG / 動画の共通ワークフローで利用できます。SVGでは生成描画レイヤーを埋め込みPNGとして保持し、元の文字要素、FORM cadence、既存Operatorの構造文法、各Surface Effectの色・元文字濃度・Opacity・Blend・描画順・パラメータとLook Memoryの索引をversion 38メタデータに残します。Glyph Signal Router、Type Matrix、Path Loom、Glyph Vesselを含むComposition v10の状態はProject JSON、自動保存、Share URL、Look Memory、SVGメタデータへ共通保存されます。Asemic Ductusはv37で追加される加算的なOperatorで、旧Projectは未適用のまま開き、既存Operatorの見た目を変更しません。v35以前のProjectが保存していたBone ScaffoldのAdaptive／Spine／Rib Cage／Trussはglobalと全Batch profileを自動でTrabecularへ置換せず、そのまま旧構築で開きます。新規ProjectまたはBone systemでTrabecularを明示的に選んだ時だけv36 rendererを使います。v34以前のProjectで`monolithGrammar`を持たないMonolith Castはglobalと全Batch profileを`Legacy wall`へ移し、保存済みのphrase-wide castを維持します。Cast strata／Ashlar blocks／Counter vault／Stereotomyを選び直した時だけ、glyph-local bodyと実counterを使うv35 rendererへ移行します。v33以前のProjectで`traceGrammar`を持たないKinetic Traceはglobalと全Batch profileを`Legacy angular route`へ移し、保存済みの最近傍polylineとCompose graphを維持します。Contour circuit／Reading-order relay／Serpentine carriage／Machine duetを選び直した時だけ、輪郭回路とpen timelineを使うv34 rendererへ移行します。v32以前のProjectで`voidArchitecture`を持たないVoid Portalはglobalと全Batch profileを`Legacy phrase copies`へ移し、保存済みの全文投影を維持します。Counter archivolt／Carceri well／Event horizonを選び直した時だけ、各文字のcounter／chamberを使うv33 rendererへ移行します。v31以前のProjectはRecursive Shrineを`Legacy orbit / XOR`へ移し、保存済みの全文再帰を維持します。表示されるv32 structureを選び直した時だけ各文字のcompound-glyph rendererへ移行します。v30以前のProjectはMorph Processionを`Legacy SDF chain`へ移して既存の重なり方を維持し、表示されるv31 choreographyを選び直した時だけfeature-compatible rendererへ移行します。v29以前のProjectはRaster / Hatch / Copyを隠し`Classic v29`文法へ、Pressureを`Legacy mass`へ移して保存時の見た目を維持します。表示されるv30文法を選び直すと新しいmaterial-transfer rendererへ移行できます。v28以前のProjectはCalligraphic Stress / Counterform Engine / Terminal Excess / Ligature Bodyを`Legacy v26`へ移し、globalと各Batch profileに元のsub-modeを隠し保持して旧rendererの見た目を再現します。v27以前のProjectはField Webbing / Etchant Bloom / Sinew Torque / Chimera Graftをそれぞれ従来のカテナリー／連続反応面／弾性膜／突起移植rendererへ移行し、既存の見た目を保持します。v26以前のProjectはBlob Track / Misregistration / Data Moshを従来のglyph-localなLegacy rendererへ移行し、v25以前のProjectは新しいGlyph Body Operatorを未適用・本文非破壊の状態で補います。v24以前のSigil / Contour / Riso / Copy / Slitも各Legacy rendererへ移行して従来の生成器を保持します。

Morphogenetic Body Fieldsの追加調査では、[Karl SimsのReaction-Diffusion Tutorial](https://karlsims.com/rd.html)と[Karsten Schmidt / Type and Form](https://opus.lib.uts.edu.au/bitstream/10453/19970/1/Graphic-Material-Roomsheet.pdf)を化学面と字形境界、[Japanese Calligraphy using Deformable Contours](https://www.ijcai.org/Proceedings/97-2/Papers/038.pdf)を大域／局所の輪郭力学、[Every Stitch Holds a Story](https://gradshow.artcenter.edu/project/soojung-lee/every-stitch-holds-a-story)と[MAX](https://yuinchien.com/p/max)を物質的な引張と独立軸の比較に限定しました。[Nabla Type](https://github.com/aykoooo/nabla-type-poc)は用途近接例ですがCC BY-NC-SAのためコードを参照・転用せず、独自のCPU fieldとして実装しています。[Gravity Type](https://gravitytype.com/)の物理演算案はComposeとの責務重複、状態依存、モバイル負荷のため今回は採用していません。

Generative Body–Energy–Relationの追加調査では、[David Rudnick / Tomb Series](https://www.itsnicethat.com/articles/david-rudnick-tomb-series-graphic-design-161118)と[New Myths](https://tasteland.com/video/david-rudnick-new-myths/)を有限の視覚文法とsource-derived code、[RIBA / Brutalism](https://www.architecture.com/explore-architecture/brutalism)を量塊と露出構築、[AIGA / Acid Graphics](https://eyeondesign.aiga.org/the-second-coming-of-acid-graphics/)を反規範の境界、[The Metの日本の書](https://www.metmuseum.org/essays/brush-writing-in-the-arts-of-japan)と[中国書法](https://www.metmuseum.org/essays/chinese-calligraphy)を形態・精神・呼吸・乾湿、[Jacob Wamberg](https://pure.au.dk/portal/en/publications/trafficking-the-body-prolegomena-to-a-posthumanist-theory-of-orna/)と[Rosi Braidotti](https://rosibraidotti.com/publications/posthuman-critical-theory/)を装飾の侵入と関係的Posthumanの理論境界に限定しました。書体、glyph、symbol、ornament、画像、配色、shader、code、preset、固有UIや生成結果は転用せず、source mask、方向場、隣接文字のdonor断片から独立実装しています。

Digital Gothic Operatorの継続調査では、[MEK.txt](https://www.mek.gallery/)を品質anchor、[StrokeStyles](https://doi.org/10.1145/3505246)を内部topology、[Gothic Diffusion](https://www.sabrigokmen.com/work/gothic-diffusion)を放射建築、[Fort Foundry](https://beta.fortfoundry.com/fonts)を立体書体とmaterialの分離、[Hiroshi Imaeda / PENETRATE](https://www.slanted.de/experimental-typography-by-hiroshi-imaeda-penetrate/)を日本語圏のstructure/collapse比較に限定しました。作品、書体、記号、配色、shader、固有UIやコードは転用せず、距離場・文字中心・光源から独立に生成しています。

Word-Bound Optical Architectureの追加調査では、[Contrasta](https://www.lettercollective.com/portfolio/typefaces/contrasta)を隣接文字の文脈接続、[Optica](https://tipodeletra.com/product/optica/)を光学干渉、[Duomo Module-Type Generator](https://zeke.studio/gentype/)と[Cathedrals](https://www.mickwillemsen.com/cathedrals)を建築的な開口、[第三回「文字とクラブ」](https://shunsukekudo.com/projects/letters-and-nightclub-vol3/)を日本語と電子的リズムの品質比較に限定しました。書体、OpenType規則、線パターン、module、作品、UI、配色やコードは転用せず、原文順・距離位相・subtractive maskから独立に生成しています。

Hard-Surface Riteの再設計では、[MIT Image Sampling and Aliasing](https://visionbook.mit.edu/sampling_and_aliasing.html)と[Opticaのlocal-frequency研究](https://opg.optica.org/ao/abstract.cfm?uri=ao-53-35-8197)を局所周期・方向・moire節、[UPCTのeight-loop ribbed vault](https://repositorio.upct.es/entities/publication/cb2c3f3d-9a3e-48d7-84f9-d8eabc2c09a2)と[Cologne Cathedral rib vault](https://www.jstage.jst.go.jp/article/aija/74/636/74_636_471/_article/-char/en)をbay・rib・bossの軸状構成、[Programming Curvature using Origami Tessellations](https://arxiv.org/abs/1812.08922)を連続するmountain–valley sheet、[Adobe Researchのdynamic refractive objects](https://research.adobe.com/publication/interactive-relighting-of-dynamic-refractive-objects/)と[UCSD Interactive Rendering of Caustics](https://graphics.ucsd.edu/~henrik/papers/interactive_caustics/)を透明体と投影光、[Typotheque Blackletter](https://www.typotheque.com/fonts/blackletter)を45°broad-nib grammarの根拠に限定しました。書体、図版、建築形状、shader、algorithm、UI、配色、preset、作品やコードは転用せず、文字中心、source mask、距離場、alpha runから独立実装しています。

Cloister Foldの品質再設計では、[Tomohiro TachiのFreeform Variations of Origami](https://origami.c.u-tokyo.ac.jp/~tachi/cg/TachiFreeformOrigami2010.pdf)を一枚のdevelopable sheetと共有facet、[Rigid-Foldable Quadrilateral Mesh Origami](https://origami.c.u-tokyo.ac.jp/~tachi/cg/RigidFoldableQuadMeshOrigami_tachi_IASS2009.pdf)をdegree-four vertexと交互のmountain／valley、[Amanda GhassaeiのOrigami Simulator](https://amandaghassaei.com/)を途中状態でも接続が崩れないinteractive fold、[Matt Shlianのpaper sculpture](https://www.mattshlian.com/2024)をfacet密度とmacro silhouette、[Plainworks Origami Font](https://alexanderglante.com/works/071-plainworks-origami-font/)と[Fold Font](https://www.behance.net/gallery/6775557/Fold-Font-animated-typeface)をLatin／CJKの可読性境界に限定しました。折線pattern、paper model、書体、glyph、作品画像、solver、数式、algorithm、UI、code、生成結果は転用せず、現行maskのsource triangleを独自のdestination triangleへ写像しています。

Null-Space Logicの追加調査では、[Void](https://www.mishaivanov.com/void)と[Paper.js CompoundPath](https://paperjs.org/reference/compoundpath/)をcounter hierarchy、[Layered Logic](https://jantomas.com/layered-logic/)と[W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/)を再帰的parity、[Space Type Generator](https://spacetypegenerator.com/)と[metamorphosis](https://github.com/danburzo/metamorphosis)を形状補間の比較に限定しました。作品、glyph、UI、コードは転用せず、flood-fill、Canvas XOR、独自signed-distance tileから実装しています。

Adaptive Material Grammarsの追加調査では、[Adobe Bitmap / Halftone Screen](https://helpx.adobe.com/ph_fil/photoshop/desktop/adjust-color/color-modes/convert-an-image-to-bitmap-mode.html)と[Adobe InDesign halftone frequency](https://helpx.adobe.com/indesign/desktop/print/ink-and-color-management/specify-halftone-frequency-and-resolution.html)をfrequency・angle・mark shapeの独立性、[Weighted Linde-Buzo-Gray Stippling](https://graphics.uni-konstanz.de/publikationen/Deussen2017LindeBuzoGray/index.html)と[Floating Points](https://graphics.uni-konstanz.de/publikationen/Deussen2000FloatingPointsMethod/index.html)をtoneに応答する点分布、[Real-Time Hatching](https://collaborate.princeton.edu/en/publications/real-time-hatching/)と[Computer-Generated Pen-and-Ink Illustration](https://www.cs.ucdavis.edu/~ma/SIGGRAPH02/course23/notes/papers/Winkenbach.pdf)をscale間で破綻しないstroke texture、[Artist-Driven Fracturing of Polyhedral Surface Meshes](https://digitalcommons.calpoly.edu/theses/1302/)と[WebSVG Voronoi](https://github.com/WebSVG/voronoi)を明示的なfracture map、[Space Type Generator](https://spacetypegenerator.com/)を時間・空間軌道の比較に限定しました。論文の式、既存algorithm、font、画像、UI、preset、配色、コードや生成結果は転用せず、現行glyph mask、境界距離、Seed、Canvas clipだけで独自実装しています。

Five Process Grammarsの追加調査では、[USGS Topographic Map Symbols](https://pubs.usgs.gov/gip/TopographicMapSymbols/topomapsymbols.pdf)を等高線・index contour・補助線、[RISO MH User's Guide](https://www.riso.com/download/manual/mh/UsersGuide_RISO%20MH_ENG.pdf)をmaster-makingと二本のdrum、[Adobe trapping](https://helpx.adobe.com/uk/illustrator/using/trapping.html)をspread / choke / overprint、[Xerox xerography history](https://www.xerox.com/da-dk/innovation/indsigt/chester-carlson-xerography)と[Electrophotographic printer artifacts](https://pubmed.ncbi.nlm.nih.gov/21078570/)を帯、jitter、ghost、残留toner、[RIT slit-scan study](https://repository.rit.edu/article/214/)を空間位置ごとの時間露光、[NetworkX drawing reference](https://networkx.org/documentation/stable/reference/drawing.html)と[Algorithmic Botany](https://algorithmicbotany.org/papers/)をgraph topologyと分岐productionの区別に限定しました。図版、式、既存algorithm、UI、preset、配色、コード、生成結果は転用せず、現行glyph mask、距離場、source node、Seed、Canvasだけで独自実装しています。

Tracking / Press / Codec Failureの追加調査では、[TouchDesigner Blob Track TOP](https://docs.derivative.ca/Blob_Track_TOP)のID・座標・size、[Blob Track CHOP](https://docs.derivative.ca/Blob_Track_CHOP)のconstant-velocity predictionとocclusion、[OpenCV contour moments](https://docs.opencv.org/4.x/dd/d49/tutorial_py_contour_features.html)のcentroid・orientation、[OpenCV optical flow](https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html)の速度場を追跡契約へ限定しました。[W3C WebCodecs](https://www.w3.org/TR/webcodecs/)と[FFmpeg motion-vector extraction example](https://www.ffmpeg.org/doxygen/8.0/extract__mvs_8c_source.html)はkey / delta依存、参照frame、motion vectorの区別、[Heidelberg Automatic Paper Stretch Compensation](https://www.heidelberg.com/global/media/es/global_media/products___prinect/prinect_2017/PI_2017_Automatic_Paper_Stretch_Compensation_EN.pdf)とAdobe trappingは場所ごとのregister、spread / chokeの区別に限定しました。各製品の映像、パラメータ、UI、コード、presetや作品を転用せず、単一HTMLのCPU描画、iPhone操作、PNG / SVG / Project互換を保つ独自Surface rendererとして実装しています。完全な動画codec再符号化やGPU optical flowは、この構成の保存・端末性能契約を壊すため採用していません。

Organic Field & Anatomy v28の追加調査では、[SchekのForce Density Method](https://www.sciencedirect.com/science/article/pii/0045782574900450/pdf)をbranch-node networkの均衡、[Block Research Groupのform finding overview](https://block.arch.ethz.ch/brg/files/2012-ijss-veenendaal-block_1380094819.pdf)を張力網の比較、[PearsonのGray–Scott pattern study](https://arxiv.org/abs/patt-sol/9304003)と[MITのGray–Scott model](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/)を有限振幅seedから生じるspot／division／labyrinth／coral regime、[Variable gearing in pennate muscles](https://pmc.ncbi.nlm.nih.gov/articles/PMC2234215/)をfascicle角とpennation、[muscle fascicle streamline reconstruction](https://www.sciencedirect.com/science/article/pii/S0022519315003136)を不均一な線維束、[A Developmental Framework for Graft Formation](https://pmc.ncbi.nlm.nih.gov/articles/PMC4798781/)と[植物graft再接続研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC5878008/)を切断面・callus・vascular reconnection、[OpenVDB CSG examples](https://www.openvdb.org/documentation/doxygen/codeExamples.html)をunion／intersection／differenceの比較に限定しました。論文の式、図版、標本画像、既存simulation、shader、UI、preset、配色、コードは転用せず、現行glyph maskとSeedから独立実装しています。

表現原理の調査先: [Pintr](https://javier.xyz/pintr)、[Throwie](https://throwie.app/)、[blobSketch](https://cpreid2.github.io/blobSketch/)、[Type Tools](https://www.type-tools.com/)、[Space Type Generator](https://spacetypegenerator.com/)、[Void](https://www.mishaivanov.com/void)、[ATOM Type Lab](https://atomtypelab.com/about)、[Amorpher](https://amorpher.com/)、[Glyph Drawing Club](https://blog.glyphdrawing.club/about/)、[Halftone Tools](https://halftone.tools/)、[Spectrolite](https://spectrolite.app/)、[Spot Color Separation](https://hafaio.github.io/color-separation/)、[TopoLines](https://www.topolines.app/)、[GD Studio](https://www.synendo.com/gdstudio/)、[SlitScanner](https://www.slitscanner.app/)、[Instant Risograph](https://instantrisograph.com/)、[Font Gauntlet](https://www.fontgauntlet.com/)、[Metaflop](https://www.metaflop.com/)、[Generative Design Primer: Solvers](https://www.generativedesign.org/02-deeper-dive/02-01_algorithms/02-01-04_solvers)、[Fair Copy](https://teiteitei.com/playground/050-fair-copy/)、[Experiments in Electrostatics](https://whitney.org/exhibitions/experiments-in-electrostatics)、[Google Fonts: Parametric fonts](https://googlefonts.github.io/how2avar2/docs/parametric-fonts/)、[WebSVG Voronoi](https://github.com/WebSVG/voronoi)、[Physarum transport networks](https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks)、[TouchDesigner Physarum](https://derivative.ca/community-post/asset/physarum-transport-network-clean-tox/65070)、[SMA Config](https://frond-studio.com/projects/sma-config)、[Cavalry Composition](https://cavalry.studio/docs/nodes/shapes/composition)、[Cavalry Presets](https://cavalry.studio/docs/user-interface/general/presets/)、[Cavalry Dynamic Rendering](https://cavalry.studio/docs/user-interface/menus/window-menu/render-manager/dynamic-rendering/)、[Cinema 4D Take Manager](https://help.maxon.net/c4d/2025/en-us/Content/html/54507.html)、[DaVinci Resolve Colorist Guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Colorist-Guide.pdf)、[After Effects Essential Properties](https://helpx.adobe.com/ie/after-effects/desktop/motion-graphics/essential-properties/essential-properties.html)、[Resolume Layers](https://www.resolume.com/support/en/layers)、[Resolume Blend Modes](https://resolume.com/support/en/7.22.5/blend-modes)、[TouchDesigner Composite TOP](https://docs.derivative.ca/Composite_TOP)、[TouchDesigner Layer Mix TOP](https://derivative.ca/UserGuide/Layer_Mix_TOP)。コード、画像、書体、固有UIは転用せず、挙動と制作モデルの原理だけを独自実装しています。

Type Matrixの組版・配置調査先: [Cavalry Duplicator](https://cavalry.studio/docs/nodes/shapes/duplicator/)、[Cavalry Distribution Types](https://cavalry.studio/docs/nodes/general/distribution-types/)、[Cavalry String Array](https://cavalry.studio/docs/nodes/utilities/string-array/)、[Houdini Copy to Points](https://www.sidefx.com/docs/houdini/copy/copytopoints.html)、[Houdini Scatter and Align](https://www.sidefx.com/docs/houdini/nodes/sop/scatteralign.html)、[TouchDesigner Layout TOP](https://docs.derivative.ca/Layout_TOP)、[TouchDesigner Replicator COMP](https://docs.derivative.ca/Replicator_COMP)、[Blender Instance on Points](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances/instance_on_points.html)、[InDesign Layout Grid](https://helpx.adobe.com/jp/indesign/using/layout-grids.html)、[InDesign Text Composition](https://helpx.adobe.com/jp/indesign/using/text-composition.html)、[InDesign Flex Layout](https://helpx.adobe.com/in/indesign/using/flex-layout.html)、[Figma Auto Layout](https://help.figma.com/hc/en-us/articles/360040451373-Explore-auto-layout-properties)、[Affinity Constraints](https://s3-eu-west-1.amazonaws.com/affinity-docs/help/designer/English.lproj/pages/DesignAids/constraints.html)、[Studio Feixen Fonts Editor](https://fonts.studiofeixen.ch/editor/)、[Tweeq](https://junkato.jp/tweeq/)。各資料は配置文法と操作原理の比較だけに使い、UI、コード、プリセット、画像、書体は転用していません。

Glyph Signal Routerの変調・セレクタ調査先: [After Effects text animators and selectors](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html)、[After Effects variable font axes](https://helpx.adobe.com/after-effects/using/working-with-variable-font-axes.html)、[Cavalry Text Shape](https://cavalry.studio/docs/nodes/shapes/text-shape/)、[Coldtype](https://coldtype.goodhertz.com/introduction.html)、[A Type of Image Tool](https://tdc.org/winner/a-type-of-image-tool/)、[ADC Brand Identity Tool](https://www.cleverfranke.com/project/adc-brand-identity/toolkit/design-support-&-art-direction)、[Jumyoung Lee — Tools](https://jumyounglee.com/tools)。複数セレクタ、文字単位の属性、テキスト信号から構成への変換、制約付きバリエーション生成という原理だけを採用し、各製品のUI・コード・プリセットは転用していません。

Foundational FORM cadenceの追加調査では、[After Effects text animators](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html)を「変形値と文字ごとのselectorの分離」、[Cavalry Range Falloff](https://cavalry.studio/docs/nodes/utilities/range-falloff/)をindex範囲とgraph、[Coldtype Text](https://coldtype.goodhertz.com/tutorials/text.html)を編集可能なglyph-wise data、[TextAlive](https://staff.aist.go.jp/jun.kato/TextAlive/)を日本語を含むkinetic typography制作環境の比較に限定しました。UI、式、sample、project、code、書体、画像は転用せず、source order／line position／word／Unicodeから独自の決定的fieldを生成しています。

Path Loomの経路組版・編集調査先: [Illustrator — Create type on a path](https://helpx.adobe.com/illustrator/using/creating-type-path.html)、[Illustrator on iPad — Create text designs along a path](https://helpx.adobe.com/illustrator/ipad/add-and-edit-text/create-text-designs-ipad.html)、[InDesign — Edit text on a path](https://helpx.adobe.com/indesign/desktop/add-and-manage-text/type-on-a-path/edit-text-on-path.html)、[Cavalry Text Shape](https://cavalry.studio/docs/nodes/shapes/text-shape/)、[Cavalry Editable Shapes](https://cavalry.studio/docs/nodes/shapes/)、[Cavalry Path Distribution](https://cavalry.studio/docs/nodes/general/distribution-types/path-distribution/)、[Cavalry Travel Deformer](https://cavalry.studio/docs/nodes/behaviours/travel-deformer/)、[Cavalry Pathfinder](https://cavalry.studio/docs/nodes/behaviours/pathfinder/)、[Houdini Copy to Curves](https://www.sidefx.com/docs/houdini/nodes/sop/copytocurves.html)、[Blender Text Properties](https://docs.blender.org/manual/en/latest/modeling/texts/properties.html)、[Blender Curve Modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/curve.html)、[SVG 2 textPath](https://www.w3.org/TR/SVG2/text.html)、[Paper.js PathItem](https://paperjs.org/reference/pathitem/)、[TouchDesigner Geo Text COMP](https://docs.derivative.ca/Experimental%3AGeo_Text_COMP)、[Zebra — Draw with Text](https://zebra.tg/draw-text/)。パス上の開始位置・反転・接線、編集可能な線、曲線上の分布、移動、手描き点の簡略化という原理を比較し、複線化・文字幅衝突・極端値・保存契約はType Deformer向けに独自設計しています。

Glyph Vesselのpacking・mask調査先: [A Type of Image](https://fabianstenzel.com/atypeofimage/)、[TextShape](https://textshape.app/)、[Adobe text inside shapes](https://helpx.adobe.com/nz/photoshop/desktop/text-typography/text-on-paths-shapes/add-text-along-paths-or-inside-shapes.html)、[Charming Pretext](https://charmingjs.org/pretext)、[p5.Font](https://beta.p5js.org/reference/p5/p5.font/)、[d3-force collide](https://d3js.org/d3-force/collide)、[Packery](https://packery.metafizzy.co/)、[Matter.js Bodies](https://brm.io/matter-js/docs/classes/Bodies.html)、[Houdini Scatter and Align](https://www.sidefx.com/docs/houdini/nodes/sop/scatteralign.html)、[Houdini UV Layout](https://www.sidefx.com/docs/houdini/nodes/sop/uvlayout.html)、[Blender Distribute Points in Volume](https://docs.blender.org/manual/en/3.6/modeling/geometry_nodes/point/distribute_points_in_volume.html)、[Blender Instance on Points](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances/instance_on_points.html)、[CSS Masking Level 1](https://www.w3.org/TR/css-masking-1/)、[Paper.js CompoundPath](https://paperjs.org/reference/compoundpath/)。画像／文字の関係、collision、密度場、穴を持つmask、source-linked instanceという原理だけを比較し、外部コード、UI、画像、書体、presetは転用していません。

Cell Fracture v31の再設計では、[NIST Fractography of Ceramics and Glasses, 3rd edition](https://www.nist.gov/publications/nist-recommended-practice-guide-fractography-ceramics-and-glasses-3rd-edition)を破断起点・伝播方向・分岐の区別、[NASA NTRS / Impact Processes in the Solar System](https://ntrs.nasa.gov/citations/20040034012)を衝撃時の放射破断・圧縮後の同心破断・near-surface spallの区別、[NIST / Crack Path in a Homogeneous Crystalline Material](https://www.ctcms.nist.gov/~robb/stability/section3_5.html)と[University of Minnesota / The anisotropic nature of local crack stability in BCC crystals](https://experts.umn.edu/en/publications/the-anisotropic-nature-of-local-crack-stability-in-bcc-crystals/)を許容劈開面と異方性の比較に限定しました。論文・ガイドの式、図版、試料、計測値、既存simulation、algorithm、code、UIや生成結果は転用せず、現行glyph mask、source order、Seed、Canvas clipから独立実装しています。

Sigil Forge v31の再設計では、[Microsoft OpenType `glyf` table](https://learn.microsoft.com/en-us/typography/opentype/spec/glyf)をordered component、point／offset alignment、affine transform、overlapを持つcompound glyphの構造確認、[The Met / Design for Three Jeweled Monograms](https://www.metmuseum.org/art/collection/search/715427)を文字同士の重なりと前景／後景の関係、[The Met / Seal Matrix and Impression](https://www.metmuseum.org/art/collection/search/468569)をmatrixとimpression、正形と負形の対として扱う確認に限定しました。仕様例、作品図版、monogram、seal、glyph outline、component coordinates、font、algorithm、code、UI、preset、paletteや生成結果は転用せず、現在入力された字形、source order、Seed、既存Canvas変換から独立実装しています。

Slit Sweep v31の再設計では、[TouchDesigner Cache TOP](https://docs.derivative.ca/Cache_TOP)と[Cache Select TOP](https://docs.derivative.ca/Cache_Select_TOP)を有限frame cache・現在を0とするindex・過去frameのrandom access・補間の確認、[Adobe After Effects Time Displacement](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/time-effects.html)を空間mapから異なる時刻を選択する原理、[Douglas Trumbull / The Slit-Scan Process, American Cinematographer, October 1969](https://cdn.theasc.com/AMERICAN_CINEMATOGRAPHER_VOL.50_1969_10.pdf)を移動するslitと被写体／cameraが一つのframeへ時間を空間蓄積する原理の確認に限定しました。資料の画像、映像、図、装置、画面、preset、shader、algorithm、code、UI、paletteや生成結果は転用せず、現在のglyph mask、Compose phase、既存Canvas変換から独立実装しています。

Ribbon Echo v31の再設計では、[SideFX Houdini Sweep SOP](https://www.sidefx.com/docs/houdini/nodes/sop/sweep.html)をbackboneへcross-sectionを配置し、方向・scale・twistを変えながらsurfaceへskinする構造、[SideFX Houdini Skin SOP](https://www.sidefx.com/docs/houdini/nodes/sop/skin.html)を順序付きcross-section間へruled surfaceを張る原理、[SideFX Houdini Carve SOP](https://www.sidefx.com/docs/houdini/nodes/sop/carve.html)をsurfaceからU/V方向のslice・cut・cross-sectionを抽出する区別の確認に限定しました。資料のgeometry、node network、画面、example、preset、algorithm、code、UI、数値や生成結果は転用せず、現在のglyph mask、source order、Compose phase、既存Canvas変換から独立実装しています。

Recursive Shrine v32の再設計では、[Eurographics / Generative Parametric Design of Gothic Window Tracery](https://diglib.eg.org/items/607768b5-11b0-4e72-9869-5d5df169f3f1)を少数の構築則から接続されたtraceryを発達させるshape／style分離、[Algorithmic Botany publications](https://algorithmicbotany.org/papers/)を有限の生成文法と世代、[W3C Fill and Stroke](https://www.w3.org/TR/fill-stroke-3/)と[W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/)を輪郭と正負の重なり、[The Met / Design for a Monumental Sacrament House](https://www.metmuseum.org/art/collection/search/860992)を建築・彫刻・容器が一体化した垂直構成、[Tanihata Art Kumiko](https://kumikowoodworking.com/products/category/art-kumiko/)を細部接合の密度比較に限定しました。外部の図版、窓形、作品、組子pattern、glyph、書体、生成式、algorithm、code、UI、数値、paletteや生成結果は転用せず、現在入力された各字形のmask、source order、Seed、既存Canvas変換から独立実装しています。

Void Portal v33の再設計では、[Microsoft OpenType / TrueType fundamentals](https://learn.microsoft.com/en-us/typography/opentype/otspec190/ttch01)を複数contourと正負空間の構造、[W3C SVG masking](https://www.w3.org/TR/SVG11/masking.html)をglyph内部のclip／mask、[SideFX Houdini PolyExtrude](https://www.sidefx.com/docs/houdini/nodes/sop/polyextrude.html)を連結成分ごとのdistance／inset／twist／division、[The Met / Piranesi, The Round Tower, Carceri](https://www.metmuseum.org/art/collection/search/337725)を低い視点、巨大な尺度、矛盾する空間と暗い奥行の比較に限定しました。外部のfont、glyph outline、作品画像、版画、geometry、node network、数値、algorithm、code、UI、preset、paletteや生成結果は転用せず、入力文字ごとのbounded mask、counter connected component、深部stroke、Seed、既存Canvas変換から独立実装しています。

https://synomare.github.io/type-deformer/
