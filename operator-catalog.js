(function(root){
  'use strict';
  const registry=root.TypeDeformerOperatorRegistry;
  if(!registry)throw new Error('Load operator-registry.js before operator-catalog.js');
  const groups={
    '字形そのもの':['confuse','stretch','rotate','skew','mirror','axisField','calligraphicStress','asemicDuctus','spectralType','differentialType','conformalType','auxeticType','marblingType','counterformEngine','terminalExcess','ligatureBody','fiberBody','glyphMutation','livingTextField','innerEruption','structuralCollision','peelWeave','voidPressure','pressureStroke','sinewTorque','chimeraGraft','contextualFit','scrollType','anamorphicType','boneScaffold','naveCutter','cloisterFold','texturaMatrix','voidPortal','monolithCast','cellFracture'],
    '文字間':['contextualFit','ligatureBody','ligatureCrypt','morphProcession','webbing','ribbonEcho','recursiveShrine','suspendedSyntax','recursiveGraft','structuralCollision','peelWeave','voidPressure'],
    '線・有機':['plotterTrace','webbing','blobTrack','softBlob','etchantBloom','sigilForge','thornCrown','cipherLiturgy','roseEngine','hatchEngrave','contourEtch','fiberBody','livingTextField','innerEruption','recursiveGraft'],
    '素材':['chromeReliquary','moireChoir','prismSacrament','monolithCast','rasterPress','copyDecay','risoSeparation','misregistration','dataMosh','slitSweep','glyphMutation','structuralCollision','peelWeave','voidPressure'],
    '版面':['baselineShift','counterspaceFlow','concordanceField','paragraphCurrent','readingField','gutterFugue','caesuraField'],
    '模様と張力': ['ornamentReserve','tensionMembrane'],
    '波と成長': ['diffractiveGlyph','dendriteCast'],
    '秩序と物質': ['quasicrystalBody','nematicFilm'],
    '双曲の地図': ['hyperbolicAtlas'],
    '荷重の鋳型': ['loadpathFoundry'],
    '固有模様の釉薬': ['nodalGlaze'],
    '相分離の合金': ['spinodalAlloy'],
    '密度から鋳直す': ['densityRecast'],
    '円軌道の織機': ['hopfLoom'],
    '面を保つ折り': ['miuraVault'],
    '字形の流体浴': ['vortexBath'],
    '変成する立体': ['kreslingShell','growthBuckle','inversionBody'],
    '重力と多重像': ['gravityLens'],
    '粘性糸と堆積': ['liquidRope'],
    '結晶の面と字身': ['wulffBody'],
    '曲線の反発と容器': ['repulsiveCurves'],
    '文字間の質量輸送': ['wassersteinLetters'],
    '異形の書体': ['nibRecast','anatomyWarp'],
    '絡みと曲面': ['linkedTwist','enneperBody'],
    '場と分岐で変形': ['beltramiFlow','riemannRamification'],
    '過剰な字形': ['rationalCusp','bladeBody','blackBastion','inktrapAbyss','strangulation','gillArray','screwExtrusion','harmonicCage'],
    '力を映すガラス': ['stressGlass'],
    '場の素材': ['tensorFiligree','chromaticSwarm','gyroidSculpture','causticGlass'],
    '文字の条件':['rubyUsurper','punctuationLoom','counterpage','rendererDebt','ligatureContagion','strokeCommons']
  };
  const basic=['stretch','rotate','skew','baselineShift','mirror','confuse'];
  const featured=registry.specs.filter(s=>s.capabilities.featured).map(s=>s.id);
  const intents=[
    {id:'shape',label:'字形を作り変える'},
    {id:'relation',label:'文字同士を関係づける'},
    {id:'flow',label:'線・流れを生む'},
    {id:'material',label:'素材・印刷感を加える'},
    {id:'layout',label:'版面を動かす'},
    {id:'structure',label:'立体・構造へ展開する'}
  ];
  const intentGroups={
    shape:['字形そのもの','異形の書体','過剰な字形','文字の条件'],
    relation:['文字間','文字間の質量輸送'],
    flow:['線・有機','波と成長','場と分岐で変形','字形の流体浴'],
    material:['素材','秩序と物質','固有模様の釉薬','相分離の合金','場の素材'],
    layout:['版面'],
    structure:['模様と張力','双曲の地図','荷重の鋳型','密度から鋳直す','円軌道の織機','面を保つ折り','変成する立体','重力と多重像','粘性糸と堆積','結晶の面と字身','曲線の反発と容器','絡みと曲面','力を映すガラス']
  };
  const surfaceIds=registry.surfaceIds;
  const metadata=registry.metadata;
  function intentIds(id){return metadata[id]?metadata[id].intents.slice():[];}
  function purposes(id){return Object.keys(groups).filter(k=>groups[k].includes(id));}
  function order(ids){return [...basic.filter(id=>ids.includes(id)),...ids.filter(id=>!basic.includes(id))];}
  root.TypeDeformerCatalog={groups,basic,featured,intents,intentGroups,surfaceIds,metadata,purposes,intentIds,order};
})(typeof globalThis!=='undefined'?globalThis:this);
