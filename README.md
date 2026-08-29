# type deformer — 文字変形機

テキストを入力し、なぞる・固定する・ドラッグするの3つのモードで文字を変形してグラフィックを作るエディタ。PNG / SVG 書き出し、アートボード指定、プロジェクト保存に対応。

## Workflow usability

制作工程は **Text → Effect → Apply → Compose → Export** の一方向で、デスクトップとモバイルの現在地を共通保存します。モバイルで選んだ工程からデスクトップへ戻った場合も、選択表示と実際のパネルが一致します。Applyの冒頭では **選択Effect → 対象**、作用中の文字数、**Quick apply** をまとめて表示し、最初の画面から対象全体への適用・残りへの適用・解除を切り替えられます。解除時に視覚イージングの残像が消えるまでは **解除中…** と区別し、ボタンは次に実行される永続操作を表示します。GridがOFFのときにArrangeを選ぶとGrid設定へ移動し、ONにしたあとは同じ操作からArrangeへ入れます。設定シートは開いた工程名へフォーカスし、閉じると元の工程ボタンへ戻ります。モバイルのシート上部にある **Find** から全工程のパラメータを検索でき、結果を選ぶと該当工程・Operator・詳細欄を開いて値へ移動します。検索条件があるときのEscapeは条件だけを解除し、空の状態でもう一度押すとシートを閉じます。Composeは **Engine → Grid → Build / Apply → Perform** の順に並び、適用後は演奏コントロールへ直接移動できます。視差軽減時はUI内の自動スクロールも即時移動へ切り替わります。

Effectの **Browse / 一覧** は40種類をカテゴリと短い説明付きで比較でき、名前・カテゴリ・特徴から検索できます。検索またはカテゴリ絞り込み中のEscapeは条件を解除し、もう一度押すと一覧を閉じます。選択したEffectは通常のセレクトと同期し、自動保存・再読み込み後にも維持されます。Stretch X / Yは−2〜8の符号付き範囲になり、負側の連続圧縮から正側の極端な伸長まで同じ操作で扱えます。

FORMの **Rotate / Skew / Baseline Shift / Mirror** は、全字へ同じ値を掛けるだけでなく、元文字の行内位置・word・Unicodeから決定的なcadenceを作ります。RotateはUniform／Alternating／Wave／Unicode、Skewは反対方向と位相差を持つshear field、BaselineはWave／Zigzag／Unicode path、Mirrorは全字／交互／block／word／Unicode grammarを選べます。角度±720°、shear±85°、baseline±12em、1行16 cycleまで振れ、文字種Batch、Undo、自動保存、Project、Share、Look、PNG／SVGと同じ状態を共有します。v20以前のProjectは従来の一様変形として開きます。

Data Moshは選択中でも、文字へ未適用または解除済みなら完全な恒等変換を返します。未適用の破断Seedが原文表示や通常のPreview / PNG / SVGへ反転・ずれを混入させることはありません。

Cloister Foldも、Operatorを選んだだけでは描画されません。文字ごとの適用強度とFold量を独立して保持するため、未適用・Undo・解除・再読み込み後の原文やPreview / PNG / SVGへ折り面が混入せず、適用した文字にだけ効果が現れます。

Applyの **Active / 作用中** はEffectの登録総数ではなく、実際に作品へ作用しているEffectとCompositionだけを件数表示します。モバイルのExportは最初に **Quick export / すぐ書出** を表示し、現在のフレーム、PNG倍率、背景、書き出し範囲を一行で確認してPreview / PNG / SVGへ進めます。**Deformed only** に対象がない場合は書き出し操作を無効化して次の行動を示します。Previewは端末向けに解像度を抑えつつ、実際に保存されるフル解像度も併記し、PNG本番出力の寸法は変更しません。

Undo / Redoは実行できる履歴がある場合だけ有効になり、文字への適用だけでなく通常パラメータ、色、Surface Mixer、Grid、Composition設定も作品状態として復元します。Ctrl/⌘+Z、Ctrl+Y、Ctrl/⌘+Shift+Zにも対応し、文字入力欄だけはOS／ブラウザの通常履歴を維持します。モバイルの各±操作はSizeなどの表示名で読み上げられ、最小／最大値では進めない側が無効になります。各RESETも対象パラメータ名を読み上げます。モバイルのProjectメニューは最初の操作へフォーカスし、外側タップまたはEscapeで閉じます。Previewは明示的なClose操作、Escape、背景タップに対応し、閉じると起点の操作へ戻ります。Composeの末尾からExportへそのまま進めます。

iPhone幅では、チェックボックスと開閉見出しを最小44pxの操作領域に統一しています。Application helpは開くと実際のLens／Edit説明を表示し、checkbox／selectの変更もUndo / Redoと自動保存へ入ります。320×568のような短い画面では、常設の5工程ドックを移動手段として使い、Nextボタンは通常フローへ戻して設定やRESETを覆いません。未変更の行は非表示RESET用の余白を取らず、狭幅でも主要項目を自然に並べます。

Composeはクリーン起動直後を0 changedとして開始し、Engineごとの短い説明と未適用Draftの再読み込み保持を備えます。モバイルの全パネルbutton／checkbox／Disclosure／RESETは44×44px以上です。ProjectのShareはメニューを閉じずにCopied!／失敗を表示し、Motion videoのCancelは進捗を0へ戻します。

ExportはPNG／SVG／View shot／Copy PNGの生成中・完了・失敗と実寸をデスクトップ／モバイル両方へ表示し、Project JSON保存もメニューを閉じずにサイズと保存経路を通知します。

Project JSON読込はファイル選択・読込中・成功・キャンセル・形式エラーを同じProjectメニュー内で通知します。成功／失敗後もメニューとLoad操作のfocusを保ち、壊れたJSONや別形式のファイルでblocking alertへ移動しません。

Copy source／Copy display／Share URLで端末のClipboard APIが拒否された場合は、内容を失わずにアプリ内の手動コピーシートを開きます。16pxの選択済みテキスト欄、Retry copy、Select all、Closeを備え、背景タップまたはEscapeで閉じると起点の操作へfocusが戻ります。Preview、PNG、SVG、View shot、Design Space Sheet、Project読込の失敗も各工程のlive statusへ集約し、アプリ内から`alert()`／`confirm()`／`prompt()`を呼ばない契約を静的検証します。

New projectはブラウザのconfirmへ移動せず、Projectメニュー内で8秒間だけ有効な二段階確認を行います。最初の操作では作品を変更せず、外側タップ・Escape・メニューを閉じる操作・時間切れで解除されます。確認後は作品と復旧用を含む自動保存を消去して再読込し、同じメニューを開いたまま完了結果とNew操作へfocusを戻します。保存済みPresetなど作品外の制作資産は保持します。

EffectのPresetは、一覧で選んでから明示的にApplyするため、選択内容を確認して同じPresetを何度でも再適用できます。名前入力、Save／Update、保存済みPresetの選択削除、適用・保存・削除結果はすべてEffectパネル内にあり、ブラウザのprompt／alertへ移動しません。削除は同じボタンをもう一度押す二段階確認です。Preset適用はUndo／Redoと自動保存へ接続されます。

## Unbounded canvas

右側の制作領域は、出力サイズから独立した無制限のワールドです。**View**を有効にするとマウス／指のドラッグで境界なく移動でき、ホイール／ピンチまたは±ボタンで5–3200%まで拡縮できます。テキスト、Effect、Compose、ComposeのLogical viewportを変更してもカメラ位置と倍率は変わりません。**View shot**だけが現在見えているカメラ範囲を保存し、通常のPNG / SVG / 固定サイズ動画はExportの**Output frame**を使います。

## Generative surface operators

- **Kinetic Trace** — 文字輪郭を一続きの角張った描画経路へ変換し、実線の筆跡と破線のペン移動を分離します。Route density、Pen lifts、Temporal driftを広く振ることで、端正な一筆描画から画面を横断する走査軌跡まで作れます。
- **Field Webbing** — 適用された別々の文字間へ重力を持つカテナリー状の繊維を張ります。Field reachとGravity sagによって、直線的な接続から垂れ下がる空間骨格まで変化します。
- **Physarum Blob** — 複数文字を栄養核にした半透明膜と輸送管へ、文字から最大2400px離れて拡散する胞子場を重ねます。Mass、Spore reach、Spore fieldで、疎な微粒子から多孔質の島と画面を覆う薄いコロニー面まで変化します。カメラ入力の **Blob Track** とは別機能です。
- **Etchant Bloom** — 字形マスクを化学反応の種・栄養場・境界条件にし、spots、labyrinth、coral状の面を生成します。Morphology、Reaction scale、Growth time、Etch / bloom、最大640pxのChemical spillで、孔食した薄い線から文字外へ増殖するacid fieldまで連続変化します。Physarumの粒子／輸送管、Contourの等距離線とは異なる反応拡散です。
- **Sigil Forge** — 適用された文字群の中心関係を共有軸、左右対称の枝、菱形ノード、フィニアルへ再構成し、一文字でも複数文字でも一つの紋章を作ります。Field Webbingの近接ネットワークとは別の幾何学的な集団印章です。
- **Thorn Crown** — 実際の字形マスクから外向き法線を推定し、最大360pxの曲がる鉤、葉状槍先、芽を持つ枝、三叉フィニアルを輪郭外へ混在させます。同じ矢印先端の反復ではなく、各輪郭点が異なる装飾文法を持ちます。
- **Cipher Liturgy** — 元文字のUnicode、10／16／8／2進表記、文字順、文字種、行列座標、checksumを、字面内部の微細な碑文と5系統の外部注釈へ変換します。ソース文字を置換せず、導出可能なデータ層を重ねます。
- **Bone Scaffold** — 字形内部を縦横に走査し、各strokeの最深部を脊柱・分岐・関節へ接続してmask内にrib graphを組みます。格子点が細い字形の稜線を外して全消失していた問題を避けるfallbackを持ちます。
- **Rose Engine** — 適用文字群を最大32枚の尖頭petal、8層のtracery、source-anchor ribで一枚のrose windowへ変換します。中心はoculus、foil、compass、spiral knot、mini rosetteの5文法からソースとSeedに応じて生成されます。
- **Chrome Reliquary** — 字形距離と法線へ指定光源を当て、最大24本の黒／白反射帯、bevel、airbrush、押し出し影、cyan／magenta／limeの分光rimを生成します。ReflectとMercury Warpを上げると通常金属から高彩度のacid chromeまで連続変化します。
- **Ligature Crypt** — 適用文字を原文順にだけ接続し、ソース順に上下へ編み替わる曲面arcade、二重rail、疎な尖頭counter、縫合線、組紐状terminal knotで一語を建築化します。Field Webbingの距離優先・細線networkとは異なる順序依存のword-formです。
- **Moiré Choir** — 二つの線周波数と角度をdetuneし、字形の内外距離で位相を曲げます。最大1200px外側まで干渉節と消失帯を広げ、Hatchの平行線やContourの等距離線とは異なる光学場を作ります。
- **Nave Cutter** — 効果字面をsolid massへ変えてから最大24列の尖頭archを引き算し、mask内へbuttressを戻します。BoneやRoseの加算線ではなく、負の空間を主役にした建築処理です。
- **Cloister Fold** — 一枚の字面を最大32枚の連続planeへ分け、共有軸に沿う交互の圧縮、ずれ、shear、明暗とcreaseで折り畳みます。Ribbon Echoの複製断面やCell Fractureの独立破片ではないcoherent surfaceです。
- **Prism Sacrament** — 字形の距離場からfacet化したレンズ法線を作り、二色の分散像、内部ハイライト、最大640pxのcaustic fieldを生成します。Risoの固定版ずれやData MoshのRGB破断とは異なる透明体処理です。
- **Textura Matrix** — 字形ごとの連続alpha runを、太いstem、菱形cap、中央split、斜めjoin、spurへ再構成します。日本語・Latin・記号を元マスクの比率から処理し、RasterのセルやHatchの細線とは別のbroad-nib architectureを作ります。
- **Void Portal** — 字形に実在するcounterと内部の深い空白を検出し、最大1600px先まで続く遠近トンネルへ投影します。Nave Cutterの既成archではなく、文字固有の負の空間が入口になります。
- **Recursive Shrine** — 字面を最大24回再帰的に縮尺・回転・周回させ、UnionとXORの混合で重なりの偶奇を空洞化します。Ribbon Echoの時間断面ではない論理合成です。
- **Morph Procession** — 隣接文字のsigned-distance fieldを補間し、文字間へ最大24段階の中間字形を生成します。Ligature Cryptの接続線とは異なり、形そのものが連続変形します。
- **Chimera Graft** — 原文順で隣接する文字をdonor／hostとして、実際の字形断片を太い接続組織で移植し、Assimilationと切開Seamを持つ混成silhouetteへ変えます。単独文字では自己移植し、Thornの外周装飾やMorphの中間字形とは異なるPosthumanな字形関係を作ります。
- **Monolith Cast** — 字形距離場を侵食から最大360pxの膨張まで鋳造し、水平courseの量塊、最大±480pxの断層ずれ、実counterの掘り戻し、型枠溝とporeを生成します。Rasterの点網、Cellの破片、Data Moshの信号破壊とは異なる露出構築です。
- **Raster Press** — 字面を回転可能な網点／角形セルへ変換。セル寸法、Dot gain、版ノイズを広く振り、精密な新聞網点から潰れた印刷片まで作れます。
- **Hatch Engrave** — 平行線と交差線で文字を彫版化。線間、切削角、繊維のうねり、線幅だけで方向性のある陰影を作ります。
- **Contour Etch** — 字形から距離場を計算し、文字の内外へ等高線を成長させます。Band、標高間隔、線幅、地形driftでtopographicな線層を作ります。
- **Pressure Stroke** — 字形の距離場へ方向性のある圧力を与え、局所的な太細・侵食・膨張に、始筆／終筆Taper、Dry brush、完全ループするBreathを統合します。Weightを負側へ振れば内部侵食、正側へ振れば大胆な質量化ができ、同じ方向場のbone／flesh／sinewとして編集できます。
- **Sinew Torque** — 字形を一枚の弾性膜として逆写像し、最大±640pxのPull、±540°のTorque、Tension、中央の収縮／膨張、Body axisで連続した置換輪郭を作ります。Cloister Foldの面分割、Cell Fractureの破片、Ribbon Echoの複製を使わず、極端値でも一続きの身体として変形します。
- **Cell Fracture** — 文字を不規則な三角セルへ分割し、字画から外へ散乱・回転・離隔させます。網点や線網ではない面の破断です。
- **Ribbon Echo** — 文字を時間方向へ多数の断面として押し出し、奥行、段数、捻り、減衰で帯状の残響と空間ボリュームを作ります。
- **Copy Decay** — 複写世代、露光、走査ドラムの引きずり、輪郭摩耗、トナー拡散、紙粉を組み合わせ、単色の複写像として字面を劣化させます。
- **Riso Separation** — 字形を内容の異なる二つのspot-ink版へ分け、版の重なりを第三の色として生成します。版バランス、overprint、registration、ink roughnessを独立制御できます。
- **Slit Sweep** — 縦／横の空間スリットごとに異なる時刻の字形を蓄積し、連続した時間の引き延ばしを作ります。Data Moshのブロック破断とは異なる時間走査です。

31個のSurface Operatorすべてに、本文の **Text ink** と独立した **Effect ink** を用意しています。Riso SeparationとPrism Sacramentは二つのEffect inkを持ちます。**Text under effect** は0–100%の連続値で、Full 100% / Ghost 22% / Hide 0%の即時プリセットも利用できます。新規状態は本文100%から始まるため、効果を選んだだけで文字が勝手に薄くなりません。細線網、連続面、反応拡散、弾性輪郭、紋章、輪郭棘、コード碑文、内部骨格、放射tracery、金属面、順序依存band、光学干渉、建築的な空洞、連続面の折り、透明体屈折、broad-nib再構成、counter portal、再帰的parity、中間字形、異物移植、露出量塊、網点、彫版線、等高線、破片、奥行、複写像、二色版、時間走査へ生成原理を分け、微細な状態から画面全体を横断する破壊的な極端値まで調整できます。

選択中のSurface Operatorには **Surface Mixer** が表示され、Text ink / Effect inkに加えて **TEXT（文字）** と **FX（効果）** の透明度を別々に調整できます。両方に0–100%スライダーと大きな即時プリセットがあり、FXを0%へ下げてもTEXTの設定値は変わりません。効果ごとのNormal / Multiply / Screen / Overlay / Difference / Add、Back / Frontの描画順も直接調整できます。出力値は31効果で独立し、旧ProjectのKeep / Ghost / Hideは100% / 22% / 0%へ移行されます。

Export内の **Design Space Sheet** は、選択中のSurface Operatorで特徴を決める二つの主軸を6 / 9 / 12案へ展開します。比較PNG、ラベルとSeed付き校正、選択案のTargetへの採用に対応し、単発のランダム生成ではなく比較しながら詰められます。

Apply内の **Look Memory** は、本文、文字ごとのOperator適用、色、全パラメータ、Surface順序、Composition、出力条件を4つのTakeへ記憶します。各Takeは作品プレビュー付きでRecallでき、A / Bは全画面のドラッグ可能なワイプで比較できます。OverwriteとClearはブラウザの確認ダイアログへ移らず、同じカード内で8秒以内に同じ操作を二度押す方式です。Escape、Look Memoryを閉じる操作、または外側の操作で安全に解除され、Capture / Recall / Clear後は対象枠の操作へフォーカスが戻ります。Recall前の状態へ戻す一段のReturnも持ち、Project JSON、自動保存、Share URLへ同梱されます。

Composeの **Type Matrix** は、文章の順序、文字頻度、文字種、字面幅をレイアウト信号へ変換します。Editorial hierarchy / Modular index / Perimeter / Tension fieldを切り替え、段組、セルスパン、見出し強調、中央のVoid、蛇行・縦方向の読み順、最大8倍の階層、180°回転、1.5セルの位置破断、完全ループする再配置を一つの構成系として扱います。4プリセットは同じフィルターの強弱ではなく、編集組版、索引、周縁組版、運動場という別々の出力原理を持ちます。

Composeの **Path Loom** は、文字列を一枚の波形へ貼るのではなく、測定した文字幅を持つ複数ストランドへ組版します。Ribbon / Orbit / Spiral / Hand-drawn path、最大12本の経路、8コピー、順方向／交互／鏡像／文字分配、Natural / Fit / Stretch、衝突圧、接線／法線、反転、Type rail、整数サイクル移動を組み合わせられます。アートボード上を指やマウスで一筆描きした経路は96点以下へ簡略化され、スムージング後も元データをProject JSON、自動保存、Share URL、Look Memory、SVGメタデータへ保存します。Scale 0.03–12、Weave −4–4、Normal push −3–3、0.25–16 turnsまで振れるため、端正なパス組版から画面を覆う破壊的なコイルまで同じ仕組みで作れます。

Composeの **Glyph Vessel** は、入力文字・単語・句を、別の字形、Capsule、Diamond、またはローカル画像の濃度マスクへ詰め直します。Tight / Flow / Edge / Densityは、階層的packing、読み順の流れ、輪郭への吸着、画像濃度による大きさという別々の構成原理です。穴と反転、Threshold、Gamma、Edge pull、最大1600個、Scale 0.02–8、負のGap、96回のRelaxation、180°回転、Still / Breathe / Circulate / Rupture、本文と独立した3色を組み合わせられます。画像は64×64の濃度場へ端末内だけで縮小し、Project、Share、Look、SVGへ保存します。

Composeの **Glyph Signal Router** は、8つの生成エンジンすべてに共通する文字単位の変調層です。Source order / Instance order / Unicode hash / Character frequency / Character class / Ink width / X・Y / Radius / Pointer distanceを、Ramp / Sine / Triangle / Steps / Pulse / Loop noiseで整形し、X・Y移動、回転、全体・縦横スケール、Skew、Opacity gate、独立色へ3系統まで直列に配線できます。Depth ±4は画板幅の移動、720°回転、1/16〜16倍まで到達し、整数Loop cyclesはPhase 0と1が一致する完全ループを保ちます。Type Wave / Script Split / Pointer Lens / Loop Pulse / Entropy Ruptureは開始点であり、個々の配線へ分解して編集できます。

文字データは変更せず、Lens / Edit / Type Batch、Composition、PNG / SVG / 動画の共通ワークフローで利用できます。SVGでは生成描画レイヤーを埋め込みPNGとして保持し、元の文字要素、FORM cadence、各Surface Effectの色・元文字濃度・Opacity・Blend・描画順・パラメータとLook Memoryの索引をversion 21メタデータに残します。Glyph Signal Router、Type Matrix、Path Loom、Glyph Vesselを含むComposition v10の状態はProject JSON、自動保存、Share URL、Look Memory、SVGメタデータへ共通保存されます。

Morphogenetic Body Fieldsの追加調査では、[Karl SimsのReaction-Diffusion Tutorial](https://karlsims.com/rd.html)と[Karsten Schmidt / Type and Form](https://opus.lib.uts.edu.au/bitstream/10453/19970/1/Graphic-Material-Roomsheet.pdf)を化学面と字形境界、[Japanese Calligraphy using Deformable Contours](https://www.ijcai.org/Proceedings/97-2/Papers/038.pdf)を大域／局所の輪郭力学、[Every Stitch Holds a Story](https://gradshow.artcenter.edu/project/soojung-lee/every-stitch-holds-a-story)と[MAX](https://yuinchien.com/p/max)を物質的な引張と独立軸の比較に限定しました。[Nabla Type](https://github.com/aykoooo/nabla-type-poc)は用途近接例ですがCC BY-NC-SAのためコードを参照・転用せず、独自のCPU fieldとして実装しています。[Gravity Type](https://gravitytype.com/)の物理演算案はComposeとの責務重複、状態依存、モバイル負荷のため今回は採用していません。

Generative Body–Energy–Relationの追加調査では、[David Rudnick / Tomb Series](https://www.itsnicethat.com/articles/david-rudnick-tomb-series-graphic-design-161118)と[New Myths](https://tasteland.com/video/david-rudnick-new-myths/)を有限の視覚文法とsource-derived code、[RIBA / Brutalism](https://www.architecture.com/explore-architecture/brutalism)を量塊と露出構築、[AIGA / Acid Graphics](https://eyeondesign.aiga.org/the-second-coming-of-acid-graphics/)を反規範の境界、[The Metの日本の書](https://www.metmuseum.org/essays/brush-writing-in-the-arts-of-japan)と[中国書法](https://www.metmuseum.org/essays/chinese-calligraphy)を形態・精神・呼吸・乾湿、[Jacob Wamberg](https://pure.au.dk/portal/en/publications/trafficking-the-body-prolegomena-to-a-posthumanist-theory-of-orna/)と[Rosi Braidotti](https://rosibraidotti.com/publications/posthuman-critical-theory/)を装飾の侵入と関係的Posthumanの理論境界に限定しました。書体、glyph、symbol、ornament、画像、配色、shader、code、preset、固有UIや生成結果は転用せず、source mask、方向場、隣接文字のdonor断片から独立実装しています。

Digital Gothic Operatorの継続調査では、[MEK.txt](https://www.mek.gallery/)を品質anchor、[StrokeStyles](https://doi.org/10.1145/3505246)を内部topology、[Gothic Diffusion](https://www.sabrigokmen.com/work/gothic-diffusion)を放射建築、[Fort Foundry](https://beta.fortfoundry.com/fonts)を立体書体とmaterialの分離、[Hiroshi Imaeda / PENETRATE](https://www.slanted.de/experimental-typography-by-hiroshi-imaeda-penetrate/)を日本語圏のstructure/collapse比較に限定しました。作品、書体、記号、配色、shader、固有UIやコードは転用せず、距離場・文字中心・光源から独立に生成しています。

Word-Bound Optical Architectureの追加調査では、[Contrasta](https://www.lettercollective.com/portfolio/typefaces/contrasta)を隣接文字の文脈接続、[Optica](https://tipodeletra.com/product/optica/)を光学干渉、[Duomo Module-Type Generator](https://zeke.studio/gentype/)と[Cathedrals](https://www.mickwillemsen.com/cathedrals)を建築的な開口、[第三回「文字とクラブ」](https://shunsukekudo.com/projects/letters-and-nightclub-vol3/)を日本語と電子的リズムの品質比較に限定しました。書体、OpenType規則、線パターン、module、作品、UI、配色やコードは転用せず、原文順・距離位相・subtractive maskから独立に生成しています。

Hard-Surface Riteの追加調査では、[Future Typo 3](https://jantomas.com/future-typo-3/)と[Layered Logic](https://jantomas.com/layered-logic/)を一枚の字面と共有軸を持つplane構造、[Jumyoung Lee Tools](https://jumyounglee.com/tools)、[Codropsのrefraction研究](https://tympanus.net/codrops/2025/03/13/warping-3d-text-inside-a-glass-torus/)、[SILKSEA Refraction](https://silkseaai.com/work/refraction/)を透明体の制御軸、[Elegy](https://www.glennr.design/project/elegy)、[Postgothic](https://2021.typemedia.org/sander.html)、[Redletter](https://www.skywhite.design/redletter)、[Metamor Bit](https://masahiro-naruse.com/case-study/metamor-bit)をbroad-nib modularityと多言語の品質境界に限定しました。書体、glyph、3D model、shader、module、作品、UI、配色やコードは転用せず、affine plane strip、alpha-normal field、source-mask runから独立に生成しています。

Null-Space Logicの追加調査では、[Void](https://www.mishaivanov.com/void)と[Paper.js CompoundPath](https://paperjs.org/reference/compoundpath/)をcounter hierarchy、[Layered Logic](https://jantomas.com/layered-logic/)と[W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/)を再帰的parity、[Space Type Generator](https://spacetypegenerator.com/)と[metamorphosis](https://github.com/danburzo/metamorphosis)を形状補間の比較に限定しました。作品、glyph、UI、コードは転用せず、flood-fill、Canvas XOR、独自signed-distance tileから実装しています。

表現原理の調査先: [Pintr](https://javier.xyz/pintr)、[Throwie](https://throwie.app/)、[blobSketch](https://cpreid2.github.io/blobSketch/)、[Type Tools](https://www.type-tools.com/)、[Space Type Generator](https://spacetypegenerator.com/)、[Void](https://www.mishaivanov.com/void)、[ATOM Type Lab](https://atomtypelab.com/about)、[Amorpher](https://amorpher.com/)、[Glyph Drawing Club](https://blog.glyphdrawing.club/about/)、[Halftone Tools](https://halftone.tools/)、[Spectrolite](https://spectrolite.app/)、[Spot Color Separation](https://hafaio.github.io/color-separation/)、[TopoLines](https://www.topolines.app/)、[GD Studio](https://www.synendo.com/gdstudio/)、[SlitScanner](https://www.slitscanner.app/)、[Instant Risograph](https://instantrisograph.com/)、[Font Gauntlet](https://www.fontgauntlet.com/)、[Metaflop](https://www.metaflop.com/)、[Generative Design Primer: Solvers](https://www.generativedesign.org/02-deeper-dive/02-01_algorithms/02-01-04_solvers)、[Fair Copy](https://teiteitei.com/playground/050-fair-copy/)、[Experiments in Electrostatics](https://whitney.org/exhibitions/experiments-in-electrostatics)、[Google Fonts: Parametric fonts](https://googlefonts.github.io/how2avar2/docs/parametric-fonts/)、[WebSVG Voronoi](https://github.com/WebSVG/voronoi)、[Physarum transport networks](https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks)、[TouchDesigner Physarum](https://derivative.ca/community-post/asset/physarum-transport-network-clean-tox/65070)、[SMA Config](https://frond-studio.com/projects/sma-config)、[Cavalry Composition](https://cavalry.studio/docs/nodes/shapes/composition)、[Cavalry Presets](https://cavalry.studio/docs/user-interface/general/presets/)、[Cavalry Dynamic Rendering](https://cavalry.studio/docs/user-interface/menus/window-menu/render-manager/dynamic-rendering/)、[Cinema 4D Take Manager](https://help.maxon.net/c4d/2025/en-us/Content/html/54507.html)、[DaVinci Resolve Colorist Guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Colorist-Guide.pdf)、[After Effects Essential Properties](https://helpx.adobe.com/ie/after-effects/desktop/motion-graphics/essential-properties/essential-properties.html)、[Resolume Layers](https://www.resolume.com/support/en/layers)、[Resolume Blend Modes](https://resolume.com/support/en/7.22.5/blend-modes)、[TouchDesigner Composite TOP](https://docs.derivative.ca/Composite_TOP)、[TouchDesigner Layer Mix TOP](https://derivative.ca/UserGuide/Layer_Mix_TOP)。コード、画像、書体、固有UIは転用せず、挙動と制作モデルの原理だけを独自実装しています。

Type Matrixの組版・配置調査先: [Cavalry Duplicator](https://cavalry.studio/docs/nodes/shapes/duplicator/)、[Cavalry Distribution Types](https://cavalry.studio/docs/nodes/general/distribution-types/)、[Cavalry String Array](https://cavalry.studio/docs/nodes/utilities/string-array/)、[Houdini Copy to Points](https://www.sidefx.com/docs/houdini/copy/copytopoints.html)、[Houdini Scatter and Align](https://www.sidefx.com/docs/houdini/nodes/sop/scatteralign.html)、[TouchDesigner Layout TOP](https://docs.derivative.ca/Layout_TOP)、[TouchDesigner Replicator COMP](https://docs.derivative.ca/Replicator_COMP)、[Blender Instance on Points](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances/instance_on_points.html)、[InDesign Layout Grid](https://helpx.adobe.com/jp/indesign/using/layout-grids.html)、[InDesign Text Composition](https://helpx.adobe.com/jp/indesign/using/text-composition.html)、[InDesign Flex Layout](https://helpx.adobe.com/in/indesign/using/flex-layout.html)、[Figma Auto Layout](https://help.figma.com/hc/en-us/articles/360040451373-Explore-auto-layout-properties)、[Affinity Constraints](https://s3-eu-west-1.amazonaws.com/affinity-docs/help/designer/English.lproj/pages/DesignAids/constraints.html)、[Studio Feixen Fonts Editor](https://fonts.studiofeixen.ch/editor/)、[Tweeq](https://junkato.jp/tweeq/)。各資料は配置文法と操作原理の比較だけに使い、UI、コード、プリセット、画像、書体は転用していません。

Glyph Signal Routerの変調・セレクタ調査先: [After Effects text animators and selectors](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html)、[After Effects variable font axes](https://helpx.adobe.com/after-effects/using/working-with-variable-font-axes.html)、[Cavalry Text Shape](https://cavalry.studio/docs/nodes/shapes/text-shape/)、[Coldtype](https://coldtype.goodhertz.com/introduction.html)、[A Type of Image Tool](https://tdc.org/winner/a-type-of-image-tool/)、[ADC Brand Identity Tool](https://www.cleverfranke.com/project/adc-brand-identity/toolkit/design-support-&-art-direction)、[Jumyoung Lee — Tools](https://jumyounglee.com/tools)。複数セレクタ、文字単位の属性、テキスト信号から構成への変換、制約付きバリエーション生成という原理だけを採用し、各製品のUI・コード・プリセットは転用していません。

Foundational FORM cadenceの追加調査では、[After Effects text animators](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html)を「変形値と文字ごとのselectorの分離」、[Cavalry Range Falloff](https://cavalry.studio/docs/nodes/utilities/range-falloff/)をindex範囲とgraph、[Coldtype Text](https://coldtype.goodhertz.com/tutorials/text.html)を編集可能なglyph-wise data、[TextAlive](https://staff.aist.go.jp/jun.kato/TextAlive/)を日本語を含むkinetic typography制作環境の比較に限定しました。UI、式、sample、project、code、書体、画像は転用せず、source order／line position／word／Unicodeから独自の決定的fieldを生成しています。

Path Loomの経路組版・編集調査先: [Illustrator — Create type on a path](https://helpx.adobe.com/illustrator/using/creating-type-path.html)、[Illustrator on iPad — Create text designs along a path](https://helpx.adobe.com/illustrator/ipad/add-and-edit-text/create-text-designs-ipad.html)、[InDesign — Edit text on a path](https://helpx.adobe.com/indesign/desktop/add-and-manage-text/type-on-a-path/edit-text-on-path.html)、[Cavalry Text Shape](https://cavalry.studio/docs/nodes/shapes/text-shape/)、[Cavalry Editable Shapes](https://cavalry.studio/docs/nodes/shapes/)、[Cavalry Path Distribution](https://cavalry.studio/docs/nodes/general/distribution-types/path-distribution/)、[Cavalry Travel Deformer](https://cavalry.studio/docs/nodes/behaviours/travel-deformer/)、[Cavalry Pathfinder](https://cavalry.studio/docs/nodes/behaviours/pathfinder/)、[Houdini Copy to Curves](https://www.sidefx.com/docs/houdini/nodes/sop/copytocurves.html)、[Blender Text Properties](https://docs.blender.org/manual/en/latest/modeling/texts/properties.html)、[Blender Curve Modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/curve.html)、[SVG 2 textPath](https://www.w3.org/TR/SVG2/text.html)、[Paper.js PathItem](https://paperjs.org/reference/pathitem/)、[TouchDesigner Geo Text COMP](https://docs.derivative.ca/Experimental%3AGeo_Text_COMP)、[Zebra — Draw with Text](https://zebra.tg/draw-text/)。パス上の開始位置・反転・接線、編集可能な線、曲線上の分布、移動、手描き点の簡略化という原理を比較し、複線化・文字幅衝突・極端値・保存契約はType Deformer向けに独自設計しています。

Glyph Vesselのpacking・mask調査先: [A Type of Image](https://fabianstenzel.com/atypeofimage/)、[TextShape](https://textshape.app/)、[Adobe text inside shapes](https://helpx.adobe.com/nz/photoshop/desktop/text-typography/text-on-paths-shapes/add-text-along-paths-or-inside-shapes.html)、[Charming Pretext](https://charmingjs.org/pretext)、[p5.Font](https://beta.p5js.org/reference/p5/p5.font/)、[d3-force collide](https://d3js.org/d3-force/collide)、[Packery](https://packery.metafizzy.co/)、[Matter.js Bodies](https://brm.io/matter-js/docs/classes/Bodies.html)、[Houdini Scatter and Align](https://www.sidefx.com/docs/houdini/nodes/sop/scatteralign.html)、[Houdini UV Layout](https://www.sidefx.com/docs/houdini/nodes/sop/uvlayout.html)、[Blender Distribute Points in Volume](https://docs.blender.org/manual/en/3.6/modeling/geometry_nodes/point/distribute_points_in_volume.html)、[Blender Instance on Points](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances/instance_on_points.html)、[CSS Masking Level 1](https://www.w3.org/TR/css-masking-1/)、[Paper.js CompoundPath](https://paperjs.org/reference/compoundpath/)。画像／文字の関係、collision、密度場、穴を持つmask、source-linked instanceという原理だけを比較し、外部コード、UI、画像、書体、presetは転用していません。

https://synomare.github.io/type-deformer/
