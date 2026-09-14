/* Latest-request worker for glyph solids. Finish one in-flight image while
 * retaining only the newest queued request; continuous motion cannot starve
 * completion. Pause/cancel terminates computation immediately.
 * A completed frame is never replaced with a partial scene or an error bitmap.
 */
(function (root) {
  'use strict';
  function installWorker(createEngine) {
    const engine = createEngine(), sources = new Map();
    let wanted = null, busy = false;
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    function source(request) {
      const key = request.sourceKey + ':' + (request.partnerKey || '') + ':' + request.kind + ':' + (request.axis || 0);
      if (sources.has(key)) { const value = sources.get(key); sources.delete(key); sources.set(key,value); return value; }
      let value;
      if(request.kind==='scroll')value=engine.scroll.prepareScrollSource(request.rings,{axis:request.axis||0});
      else {
        const a=engine.anamorphic.prepareAnamorphicProfile(request.rings),b=engine.anamorphic.prepareAnamorphicProfile(request.partnerRings);
        // Reuse identical position+normal vertices without simplifying either
        // contour. This makes native 768px profiles practical within the same
        // retained-source byte budget; triangle work remains explicitly bounded.
        try { value=engine.surface.buildAnamorphicSurface(a,b,{indexed:true,maxTriangles:500000}); }
        catch(error){if(/budget exceeded/.test(error.message))throw new RangeError('この二文字の立体は計算量の上限です。より簡潔な相手文字かフォントを選んでください。');throw error;}
        value.compatibility=engine.anamorphic.anamorphicCompatibility(a,b);
      }
      sources.set(key,value);
      // Limit retained geometry by bytes as well as slots. Plain point/ring
      // objects are conservatively charged too; no implicit quality reduction.
      function bytes(v) { if(ArrayBuffer.isView(v))return v.byteLength;if(Array.isArray(v))return v.reduce((s,x)=>s+bytes(x),24);if(v&&typeof v==='object')return Object.values(v).reduce((s,x)=>s+bytes(x),64);return 8; }
      while(sources.size>4 || [...sources.values()].reduce((n,v)=>n+bytes(v),0)>48*1024*1024) { const oldest=sources.keys().next().value;sources.delete(oldest); }
      return value;
    }
    async function render(request, id, progress) {
      if (!['scroll','anamorphic'].includes(request.kind) || !Number.isFinite(request.phase)) throw new Error('Invalid sculpture request');
      const prepared=source(request), mesh=request.kind==='scroll' ? engine.scroll.buildScrollSurface(prepared,request.settings,request.phase) : prepared;
      const p={...request.settings,...(request.kind==='scroll'?engine.scroll.scrollSettings(request.settings):engine.anamorphic.anamorphicSettings(request.settings))};
      if(request.kind==='anamorphic'){p.yaw+=45*p.motion*Math.cos(request.phase*Math.PI*2);p.motion=0;}
      const view=engine.anamorphic.anamorphicView({...p,motion:0,depth:request.kind==='scroll'?1:p.depth},request.phase);
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      for(let i=0;i<mesh.positions.length;i+=3){
        const v=[mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]*(request.kind==='scroll'?1:p.depth)];
        const x=v.reduce((s,n,k)=>s+n*view.right[k],0), y=v.reduce((s,n,k)=>s+n*view.down[k],0);
        x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      }
      if(!mesh.triangleCount)return {key:request.key,geometryKey:request.geometryKey,sourceKey:request.sourceKey,compatibility:mesh.compatibility,tiles:[],bounds:{x:0,y:0,w:0,h:0},density:request.density};
      const density=request.density;
      if(!Number.isFinite(density)||density<=0)throw new Error('Invalid sculpture resolution');
      // Integer aligned tile coordinates preserve the exact sample lattice.
      const left=Math.floor(x0*density)-2,top=Math.floor(y0*density)-2;
      const width=Math.ceil(x1*density)+2-left,height=Math.ceil(y1*density)+2-top;
      if(width>8192||height>8192||width*height>16777216)throw new RangeError('立体字形の出力サイズが上限を超えました。出力倍率を下げてください。');
      const tiles=[],tileSize=384,total=Math.ceil(width/tileSize)*Math.ceil(height/tileSize);
      for(let y=0;y<height;y+=tileSize)for(let x=0;x<width;x+=tileSize){
        if(!wanted||wanted.id!==id)return null;
        const w=Math.min(tileSize,width-x),h=Math.min(tileSize,height-y);
        const frame={width:w,height:h,scale:density,centerX:(left+x+w/2)/density,centerY:(top+y+h/2)/density,samples:2,phase:request.phase};
        const output=request.kind==='scroll' ? engine.scroll.renderScrollSurface(mesh,p,frame) : engine.surface.renderAnamorphicSurface(mesh,{...p,motion:0},frame);
        tiles.push({x,y,width:w,height:h,pixels:output.pixels});progress(tiles.length/total);
        await pause();
      }
      return {key:request.key,geometryKey:request.geometryKey,sourceKey:request.sourceKey,compatibility:mesh.compatibility,tiles,width,height,bounds:{x:left/density,y:top/density,w:width/density,h:height/density},density,triangles:mesh.triangleCount};
    }
    async function work() {
      if(busy)return;busy=true;
      try { while(wanted){
        const job=wanted,results=[];
        try {
          if(!Array.isArray(job.requests)||job.requests.length>48)throw new RangeError('立体字形は48種類以内です。異なる文字または個別設定を減らしてください。');
          for(let i=0;i<job.requests.length;i++){
            const result=await render(job.requests[i],job.id,part=>self.postMessage({id:job.id,type:'progress',value:(i+part)/job.requests.length}));
            if(!result||wanted?.id!==job.id)break;results.push(result);
            if(results.reduce((n,r)=>n+(r.width||0)*(r.height||0),0)>16777216)throw new RangeError('立体字形全体の描画メモリ上限です。文字数または出力倍率を下げてください。');
          }
          if(wanted?.id===job.id){
            const transfers=results.flatMap(r=>r.tiles.map(t=>t.pixels.buffer));
            self.postMessage({id:job.id,type:'complete',results},transfers);wanted=null;
          }
        } catch(error) {
          if(wanted?.id===job.id){self.postMessage({id:job.id,type:'error',message:error.message||String(error)});wanted=null;}
        }
      } } finally {busy=false;}
    }
    self.onmessage=event=>{wanted=event.data;work();};
  }
  function create(options={}) {
    if(root.TypeDeformerRenderJobs)return createShared(options);
    let worker=null,url=null,id=0,desired=null,active=null,completed=null,error=null,paused=false,pending=false,progress=0;
    const changed=()=>options.onChange?.(inspect());
    function inspect(){return {desiredKey:desired?.key,completedKey:completed?.key,pending,paused,progress,error,completed};}
    function stop(){worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;}
    function start(){
      if(paused||!desired||pending)return;
      try{
        if(!worker){
          const source='('+installWorker.toString()+')('+root.TypeDeformerSculpture.createEngine.toString()+');';
          url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);
          worker.onmessage=event=>{
            const m=event.data;if(m.id!==id)return;
            if(m.type==='progress')progress=m.value;
            if(m.type==='error'){error=active.key===desired?.key?m.message:null;pending=false;}
            if(m.type==='complete'){completed={key:active.key,results:m.results};pending=false;progress=1;error=null;}
            changed();
            if((m.type==='complete'||m.type==='error')&&desired&&desired.key!==active.key)start();
          };
          worker.onerror=event=>{error=event.message||'字形の計算を開始できませんでした。';pending=false;stop();changed();};
        }
        pending=true;progress=0;error=null;active=desired;worker.postMessage({id:++id,requests:active.requests});changed();
      }catch(e){error=e.message;pending=false;stop();changed();}
    }
    return {inspect,request(key,requests){if(desired?.key===key)return inspect();desired={key,requests};start();return inspect();},
      pause(value=true){paused=!!value;if(paused){id++;pending=false;stop();changed();}else start();},
      retry(){error=null;start();},
      cancel(){id++;stop();desired=null;pending=false;progress=0;error=null;changed();},
      dispose(){id++;stop();desired=null;completed=null;pending=false;},
      assert(key){if(error)throw Error(error);if(paused)throw Error('字形の計算を停止中です。再開してから保存してください。');
        if(completed?.key!==key){const e=Error('立体字形を計算中です。最後に完成した形を表示しています。');e.code='SCULPTURE_PENDING';throw e;}return completed;}
    };
  }
  function createShared(options) {
    let desired=null,completed=null,paused=false,progress=0,url=null;
    const changed=()=>options.onChange?.(inspect());
    function workerFactory(){
      if(url)URL.revokeObjectURL(url);
      const source='('+installWorker.toString()+')('+root.TypeDeformerSculpture.createEngine.toString()+');';
      url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));return new Worker(url);
    }
    const queue=root.TypeDeformerRenderJobs.create({workerFactory,
      encode:job=>({id:job.id,requests:job.payload}),
      decode:m=>m.type==='complete'?{id:m.id,type:'result',result:{results:m.results}}:m,
      onProgress:value=>{progress=value;changed();},
      onState:state=>{if(state.ready){completed={key:state.key,results:state.result.results};progress=1;}changed();}
    });
    function inspect(){const state=queue.status(desired?.key);return {desiredKey:desired?.key,completedKey:completed?.key,pending:!paused&&state.busy,paused,progress,error:state.error,completed};}
    function start(){if(desired&&!paused){progress=0;queue.request(desired.key,desired.requests);}changed();}
    function stop(){queue.cancel();if(url)URL.revokeObjectURL(url);url=null;}
    return {inspect,request(key,requests){if(desired?.key===key)return inspect();desired={key,requests};start();return inspect();},
      pause(value=true){paused=!!value;if(paused)stop();else start();changed();},
      retry(){stop();start();},cancel(){desired=null;progress=0;stop();changed();},
      dispose(){queue.dispose();if(url)URL.revokeObjectURL(url);url=null;desired=completed=null;},
      assert(key){const state=inspect();if(state.error)throw Error(state.error);if(paused)throw Error('字形の計算を停止中です。再開してから保存してください。');
        if(completed?.key!==key){const e=Error('立体字形を計算中です。最後に完成した形を表示しています。');e.code='SCULPTURE_PENDING';throw e;}return completed;}
    };
  }
  root.TypeDeformerSculptureJobs={create,installWorker};
})(typeof globalThis!=='undefined'?globalThis:this);
