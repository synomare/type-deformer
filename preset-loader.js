(function(root){
  'use strict';
  var sources=[
    'assets/presets/atlas-v66.js','assets/presets/atlas-v81.js','assets/presets/atlas-v82.js',
    'assets/presets/atlas-v83.js','assets/presets/atlas-v84.js','assets/presets/atlas-v85.js',
    'assets/presets/atlas-overdrive-240.js','assets/presets/atlas-v86.js','assets/presets/atlas-v87.js',
    'assets/presets/atlas-v88.js','assets/presets/atlas-v89.js','assets/presets/atlas-v90.js',
    'assets/presets/atlas-v91.js','preset-library.js'
  ];
  var pending=null;
  function inject(src,documentRef){
    return new Promise(function(resolve,reject){
      var script=documentRef.createElement('script');script.src=src;script.async=false;
      script.onload=function(){resolve(src);};
      script.onerror=function(){script.remove();reject(new Error(src+' を読み込めませんでした。'));};
      (documentRef.head||documentRef.documentElement).appendChild(script);
    });
  }
  function load(options){
    if(root.TypeDeformerPresets)return Promise.resolve(root.TypeDeformerPresets);
    if(pending)return pending;
    options=options||{};var documentRef=options.document||root.document;
    if(!documentRef&&!options.loadScript)return Promise.reject(new Error('Preset Libraryにはdocumentが必要です。'));
    var loadScript=options.loadScript||function(src){return inject(src,documentRef);};
    pending=sources.reduce(function(chain,src){return chain.then(function(){return loadScript(src);});},Promise.resolve())
      .then(function(){if(!root.TypeDeformerPresets)throw new Error('Preset Libraryを初期化できませんでした。');return root.TypeDeformerPresets;})
      .catch(function(error){pending=null;throw error;});
    return pending;
  }
  root.TypeDeformerPresetLoader={sources:sources.slice(),total:436,load:load};
})(typeof globalThis!=='undefined'?globalThis:this);
