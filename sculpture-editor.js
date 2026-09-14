(function(root){
  'use strict';
  function create(api){
    const jobs=new Map(),canvases=new WeakMap(),lastContext=new Map(),sourceIdentities=new WeakMap(),sourceContents=new Map();
    let sourceSequence=0;
    function sourceIdentity(data){
      if(sourceIdentities.has(data))return sourceIdentities.get(data);
      // Loading an unrelated UI font fires document.fonts.loadingdone too.
      // Compare the actual contours, not the global invalidation generation.
      // Exact strings (not a lossy hash) avoid retaining a stale glyph on collision.
      const content=JSON.stringify(data.rings);let key=sourceContents.get(content);
      if(!key)key='solid-source-'+(++sourceSequence);
      sourceContents.delete(content);sourceContents.set(content,key);
      while(sourceContents.size>96)sourceContents.delete(sourceContents.keys().next().value);
      sourceIdentities.set(data,key);return key;
    }
    function job(kind,live){
      const key=kind+(live?':preview':':output');
      if(!jobs.has(key)){
        let presented=null;
        jobs.set(key,root.TypeDeformerSculptureJobs.create({onChange(state){
          if(live){api.status(kind,state);if(state.completed&&state.completed!==presented){presented=state.completed;api.redraw();}}
        }}));
      }
      return jobs.get(key);
    }
    function singular(m){const a=m.a*m.a+m.b*m.b,b=m.c*m.c+m.d*m.d,c=m.a*m.c+m.b*m.d;return Math.sqrt((a+b+Math.sqrt((a-b)**2+4*c*c))/2);}
    function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
    function settings(g,kind){
      const p=api.params(),s=g.surface||{},value=key=>s[key]??p[key],strength=api.strength(g,kind);
      if(kind==='scrollType')return {mode:value('scrollMode'),curl:value('scrollCurl')*strength,taper:value('scrollTaper'),
        gauge:value('scrollThickness'),yaw:value('scrollYaw'),tilt:value('scrollTilt'),motion:api.moving()?value('scrollMotion'):0,
        metal:value('scrollMetal'),roughness:value('scrollRoughness'),finish:value('scrollFinish'),
        ink:rgb(p.scrollColor),backInk:rgb(p.scrollBackColor),edgeInk:rgb(p.scrollEdgeColor)};
      if(kind==='anamorphicType')return {yaw:value('anamorphicYaw'),tilt:value('anamorphicTilt'),depth:value('anamorphicDepth'),
        motion:api.moving()?value('anamorphicMotion'):0,metal:value('anamorphicMetal'),roughness:value('anamorphicRoughness'),
        unlit:value('anamorphicFinish')==='silhouette',finish:value('anamorphicFinish')==='studio'?'studio':'classic',ink:rgb(p.anamorphicColor)};
      throw Error('Unknown solid Operator');
    }
    function request(kind,glyphs,scale,L,fm,live,submit=true){
      if(live&&submit)lastContext.set(kind,{scale,L,fm});
      const ctx=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas')).getContext('2d'),unique=new Map(),placements=[];
      const p=api.params(),phase=api.moving()?api.phase():0;
      for(const g of glyphs){
        if(api.strength(g,kind)<=.002||!String(g.ch||'').trim()||(g.opacity!=null&&g.opacity<=.002))continue;
        const data=api.source(g.ch,g),bb=api.bounds(data.rings),cx=(bb.x0+bb.x1)/2,cy=(bb.y0+bb.y1)/2;
        if(!Number.isFinite(cx)||!Number.isFinite(cy))continue;
        api.frame(ctx,g,1,{dx:0,dy:0,s:1},fm,data);const matrix=ctx.getTransform();
        const density=singular(matrix)*scale*L.s;
        if(!(density>0))continue;
        const profile=g.surface||{},axis=kind==='scrollType'?(profile.scrollAxis??p.scrollAxis):0,s=settings(g,kind),sourceKey=sourceIdentity(data);
        let partnerKey='',partnerRings;
        if(kind==='anamorphicType'){
          const partner=api.source(p.anamorphicPartner,g),pb=api.bounds(partner.rings),height=pb.y1-pb.y0;
          if(!(height>0))throw Error('相手文字の輪郭がありません。別の文字かフォントを選んでください。');
          const ratio=(bb.y1-bb.y0)/height,px=(pb.x0+pb.x1)/2,py=(pb.y0+pb.y1)/2;
          partnerKey=JSON.stringify([sourceIdentity(partner),ratio]);
          partnerRings=partner.rings.map(r=>({points:r.points.map(v=>({x:(v.x-px)*ratio,y:(v.y-py)*ratio}))}));
        }
        const geometryKey=JSON.stringify([sourceKey,partnerKey,kind,axis,s,phase]),key=JSON.stringify([geometryKey,density]);
        if(!unique.has(key))unique.set(key,{kind:kind==='scrollType'?'scroll':'anamorphic',key,geometryKey,sourceKey,partnerKey,partnerRings,axis,settings:s,phase,density,
          rings:data.rings.map(r=>({points:r.points.map(v=>({x:v.x-cx,y:v.y-cy}))}))});
        placements.push({key,geometryKey,sourceKey,g,data,cx,cy,matrix});
      }
      const requests=[...unique.values()],key=JSON.stringify(requests.map(r=>r.key)),controller=job(kind,live);
      if(!requests.length){if(submit)controller.dispose();return {controller,placements,key};}
      if(submit)controller.request(key,requests);return {controller,placements,key};
    }
    function images(completed){
      if(!completed)return new Map();if(canvases.has(completed))return canvases.get(completed);
      const map=new Map();
      for(const result of completed.results){
        const canvas=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));canvas.width=Math.max(1,result.width||1);canvas.height=Math.max(1,result.height||1);
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('立体字形の描画メモリが不足しています。');
        for(const tile of result.tiles)ctx.putImageData(new ImageData(tile.pixels,tile.width,tile.height),tile.x,tile.y);
        map.set(result.key,{...result,canvas});
      }
      canvases.set(completed,map);return map;
    }
    function draw(kind,ctx,glyphs,scale,L,fm,live,previewOnly=false){
      previewOnly=previewOnly&&!live;
      const state=request(kind,glyphs,scale,L,fm,live||previewOnly,!previewOnly);if(!state.placements.length)return;
      const status=state.controller.inspect();if(!live&&!previewOnly)state.controller.assert(state.key);
      const frames=images(status.completed);
      for(const placement of state.placements){
        const frame=frames.get(placement.key)||((live||previewOnly)?[...frames.values()].find(f=>previewOnly?f.geometryKey===placement.geometryKey:f.sourceKey===placement.sourceKey):null),g=placement.g;
        if(!frame&&previewOnly){const e=Error('表示する立体字形の完成を待っています。');e.code='SCULPTURE_PENDING';throw e;}
        if(!frame){if(live)api.native(ctx,g,scale,L,fm,api.strength(g,kind),api.params()[kind==='scrollType'?'scrollColor':'anamorphicColor']);continue;}
        ctx.save();api.frame(ctx,g,scale,L,fm,placement.data);ctx.translate(placement.cx,placement.cy);
        ctx.globalAlpha=api.strength(g,kind)*(g.opacity==null?1:g.opacity);
        ctx.drawImage(frame.canvas,frame.bounds.x,frame.bounds.y,frame.bounds.w,frame.bounds.h);ctx.restore();
      }
    }
    return {draw,
      prepareScene(glyphs,scale,L,fm){
        let ready=true;
        for(const kind of ['scrollType','anamorphicType']){
          if(!glyphs.some(g=>api.strength(g,kind)>.002))continue;
          const state=request(kind,glyphs,scale,L,fm,true),status=state.controller.inspect();
          if(state.placements.length&&(status.completedKey!==state.key||status.paused||status.error))ready=false;
        }
        return ready;
      },
      waiting(){return [...jobs.entries()].some(([key,j])=>key.endsWith(':preview')&&(j.inspect().pending||j.inspect().paused||j.inspect().error));},
      assertScene(kind,glyphs,fm){
        const context=lastContext.get(kind)||{scale:1,L:{s:1,dx:0,dy:0},fm};
        const state=request(kind,glyphs,context.scale,context.L,fm,true,false),status=state.controller.inspect();
        // A panel resize may request a sharper preview of the identical solid.
        // Capturing its editable state does not require that new pixel density.
        const frames=images(status.completed);
        if(state.placements.every(p=>[...frames.values()].some(f=>f.geometryKey===p.geometryKey)))return;
        request(kind,glyphs,context.scale,context.L,fm,true);state.controller.assert(state.key);
      },
      bounds(kind,glyphs,b){
        const context=lastContext.get(kind)||{scale:1,L:{s:1,dx:0,dy:0},fm:api.fontMetrics()};
        const state=request(kind,glyphs,context.scale,context.L,context.fm,true,false),frames=images(state.controller.inspect().completed);
        let x0=b.x,y0=b.y,x1=b.x+b.w,y1=b.y+b.h;
        for(const placement of state.placements){const frame=frames.get(placement.key)||[...frames.values()].find(f=>f.geometryKey===placement.geometryKey);if(!frame)continue;
          const r=frame.bounds,m=placement.matrix;
          for(const x of [r.x+placement.cx,r.x+r.w+placement.cx])for(const y of [r.y+placement.cy,r.y+r.h+placement.cy]){
            const px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;x0=Math.min(x0,px-2);x1=Math.max(x1,px+2);y0=Math.min(y0,py-2);y1=Math.max(y1,py+2);
          }
        }return {x:x0,y:y0,w:x1-x0,h:y1-y0};
      },
      pause(kind,value){job(kind,true).pause(value)},retry(kind){job(kind,true).retry()},
      inspect(kind){return job(kind,true).inspect()},
      clearInactive(glyphs){for(const kind of ['scrollType','anamorphicType'])if(!glyphs.some(g=>api.strength(g,kind)>.002)){job(kind,true).dispose();job(kind,false).dispose();api.status(kind,{pending:false});}},
      dispose(){for(const j of jobs.values())j.dispose();jobs.clear();}
    };
  }
  root.TypeDeformerSculptureEditor={create};
})(globalThis);
