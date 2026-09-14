(function(root){
  'use strict';
  var KEY='typeDeformer.discovery.v1',MAX_RECENT=12;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function normalize(value,valid){
    value=value&&typeof value==='object'?value:{};
    var favorites=Array.isArray(value.favorites)?value.favorites:[];
    var recent=Array.isArray(value.recent)?value.recent:[];
    function clean(items,limit){
      var seen=new Set(),out=[];
      for(var i=0;i<items.length;i++){
        var id=String(items[i]||'');
        if(!id||seen.has(id)||(valid&& !valid.has(id)))continue;
        seen.add(id);out.push(id);if(limit&&out.length>=limit)break;
      }
      return out;
    }
    return {version:1,favorites:clean(favorites),recent:clean(recent,MAX_RECENT)};
  }
  function create(ids,storage){
    var valid=new Set(ids||[]),target=storage===undefined?root.localStorage:storage,state=normalize(null,valid),persistent=true;
    try{var raw=target&&target.getItem(KEY);if(raw)state=normalize(JSON.parse(raw),valid);}catch(error){persistent=false;}
    function save(){
      try{if(target)target.setItem(KEY,JSON.stringify(state));else persistent=false;}
      catch(error){persistent=false;}
      return persistent;
    }
    return {
      key:KEY,
      snapshot:function(){return copy(state);},
      persistent:function(){return persistent;},
      isFavorite:function(id){return state.favorites.indexOf(id)!==-1;},
      toggleFavorite:function(id){
        if(!valid.has(id))return this.snapshot();
        var index=state.favorites.indexOf(id);
        if(index===-1)state.favorites.push(id);else state.favorites.splice(index,1);
        save();return this.snapshot();
      },
      recordRecent:function(id){
        if(!valid.has(id))return this.snapshot();
        state.recent=state.recent.filter(function(item){return item!==id;});
        state.recent.unshift(id);state.recent=state.recent.slice(0,MAX_RECENT);
        save();return this.snapshot();
      }
    };
  }
  root.TypeDeformerDiscoveryStore={key:KEY,maxRecent:MAX_RECENT,normalize:normalize,create:create};
})(typeof globalThis!=='undefined'?globalThis:this);
