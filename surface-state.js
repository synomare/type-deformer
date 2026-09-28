(function(root){
  'use strict';
  // Preserve the complete renderer contract, but share identical immutable
  // profiles within one source snapshot. Never cache across document revisions.
  function snapshot(profile,strengths,extra,cache,build){
    var entries=cache.get(profile);
    if(!entries){entries=new Map();cache.set(profile,entries);}
    var key=JSON.stringify([strengths,extra]),known=entries.get(key);
    if(known)return known;
    var result=build();
    Object.freeze(result);entries.set(key,result);return result;
  }
  // Structured clone preserves shared table entries. Frame identity and IPC
  // contain each parameter profile once, instead of once per glyph.
  function pack(glyphs,defaults){
    var surfaces=[],indices=new Map();
    var packed=glyphs.map(function(g){
      var copy=Object.assign({},g),surface=g.surface;
      if(!surface){copy.surface=null;return copy;}
      var index=indices.get(surface);
      if(index===undefined){
        index=surfaces.length;indices.set(surface,index);var values={};
        for(var key in surface)if(surface[key]!==defaults[key])values[key]=surface[key];
        surfaces.push(values);
      }
      delete copy.surface;copy.surfaceIndex=index;return copy;
    });
    return {glyphs:packed,surfaces:surfaces};
  }
  function unpack(glyphs,surfaces,defaults){
    var profiles=(surfaces||[]).map(function(values){return Object.assign(Object.create(defaults),values);});
    for(var glyph of glyphs){
      if(glyph.surfaceIndex!=null){
        if(!Number.isInteger(glyph.surfaceIndex)||!profiles[glyph.surfaceIndex])throw new Error('Invalid Surface profile reference');
        glyph.surface=profiles[glyph.surfaceIndex];delete glyph.surfaceIndex;
      }else if(glyph.surface)glyph.surface=Object.assign(Object.create(defaults),glyph.surface);
    }
    return glyphs;
  }
  root.TypeDeformerSurfaceState={snapshot:snapshot,pack:pack,unpack:unpack};
})(typeof globalThis!=='undefined'?globalThis:this);
