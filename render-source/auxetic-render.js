// Canonical auxetic-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var AuxeticType = (function () {
      // Original source-material dissection and alternating rigid-panel deployment.
      // No font, paper implementation, external mesh or solver is included.
      function normalizeAuxeticSettings(input = {}) {
        const normalized = (() => {
        const n = (key, fallback, min, max) => Math.max(min,Math.min(max,Number.isFinite(input[key])?input[key]:fallback));
        return { opening:n('opening',28,0,90), module:n('module',24,6,96), aspect:n('aspect',1,.25,4),
          axis:n('axis',0,-180,180), ligament:n('ligament',.65,0,1), motion:n('motion',.65,0,1) };
      })();
        return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('auxetic',input,normalized) : normalized;
      }

      const AUXETIC_TYPE_STARTS = Object.freeze({
        aperture:Object.freeze({opening:28,module:24,aspect:1,axis:0,ligament:.75,motion:.65}),
        lancet:Object.freeze({opening:43,module:26,aspect:3.4,axis:28,ligament:.8,motion:.55}),
        cipher:Object.freeze({opening:78,module:38,aspect:.65,axis:-20,ligament:.5,motion:.8})
      });

      function auxeticArea(points) {
        let area=0;
        for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
        return area/2;
      }

      function boundsOf(points) {
        const b=[Infinity,Infinity,-Infinity,-Infinity];
        for(const p of points){b[0]=Math.min(b[0],p.x);b[1]=Math.min(b[1],p.y);b[2]=Math.max(b[2],p.x);b[3]=Math.max(b[3],p.y);}
        return b;
      }

      function prepareAuxeticGlyph(contours) {
        const rings=[];
        for(const contour of contours){
          if(!contour.points||contour.points.length<3)continue;
          const points=contour.points.map(p=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new TypeError('Invalid Auxetic source point');return{x:p.x,y:p.y};});
          const area=auxeticArea(points);if(!Number.isFinite(area))throw new RangeError('Auxetic source exceeds numeric precision');if(Math.abs(area)<1e-12)continue;
          rings.push({points,area,bounds:boundsOf(points)});
        }
        if(!rings.length)return{rings,bounds:null,center:{x:0,y:0},pointCount:0};
        if(rings.reduce((sum,r)=>sum+r.area,0)<=0)throw new RangeError('Auxetic source requires positive outer winding and negative counters');
        const bounds=boundsOf(rings.flatMap(r=>r.points));
        return{rings,bounds,center:{x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2},pointCount:rings.reduce((sum,r)=>sum+r.points.length,0)};
      }

      // Oriented half-plane clipping. Concave pieces may have coincident boundary
      // walks; nonzero winding, not even-odd or ring-by-ring positive filling, is
      // required to cancel those walks and subtract clipped counter material.
      function clipAuxeticRing(points, bounds) {
        let result=points.map(p=>({x:p.x,y:p.y}));
        for(const [axis,limit,sign] of [['x',bounds[0],1],['x',bounds[2],-1],['y',bounds[1],1],['y',bounds[3],-1]]){
          const input=result;result=[];if(!input.length)break;
          let a=input[input.length-1],insideA=sign*(a[axis]-limit)>=0;
          for(const b of input){
            const insideB=sign*(b[axis]-limit)>=0;
            if(insideA!==insideB){const t=(limit-a[axis])/(b[axis]-a[axis]);const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};p[axis]=limit;result.push(p);}
            if(insideB)result.push({x:b.x,y:b.y});a=b;insideA=insideB;
          }
        }
        // Remove only exactly repeated vertices; retain every actual source segment.
        result=result.filter((p,i)=>!i||p.x!==result[i-1].x||p.y!==result[i-1].y);
        if(result.length>1&&result[0].x===result.at(-1).x&&result[0].y===result.at(-1).y)result.pop();
        return result.length>=3?result:[];
      }

      // Intersections with a cut face, using all oriented rings together. A hole
      // is never a positive cut interval. Coordinates are in the fixed cut frame.
      function auxeticCutIntervals(rings,axis,value,lo,hi) {
        const across=axis==='x'?'y':'x',events=[];
        for(const ring of rings)for(let i=0;i<ring.points.length;i++){
          const a=ring.points[i],b=ring.points[(i+1)%ring.points.length];
          if(!((a[axis]<=value&&value<b[axis])||(b[axis]<=value&&value<a[axis])))continue;
          const t=(value-a[axis])/(b[axis]-a[axis]);
          events.push({at:a[across]+(b[across]-a[across])*t,delta:b[axis]>a[axis]?1:-1});
        }
        events.sort((a,b)=>a.at-b.at);const intervals=[];let winding=0,previous=null;
        for(let i=0;i<events.length;){
          const at=events[i].at;
          if(winding&&previous!==null){const a=Math.max(lo,previous),b=Math.min(hi,at);if(b>a+1e-9)intervals.push([a,b]);}
          let delta=0;while(i<events.length&&Math.abs(events[i].at-at)<1e-10)delta+=events[i++].delta;
          winding+=delta;previous=at;
        }
        return intervals;
      }

      function compileAuxeticGlyph(glyph,input={},budget={}) {
        const settings=normalizeAuxeticSettings(input),radians=settings.axis*Math.PI/180,ca=Math.cos(radians),sa=Math.sin(radians);
        const px=settings.module*Math.sqrt(settings.aspect),py=settings.module/Math.sqrt(settings.aspect);
        const result={glyph,settings,px,py,ca,sa,panels:[],joints:[],pointCount:0};if(!glyph.bounds)return result;
        const rings=glyph.rings.map(r=>{const points=r.points.map(p=>{const x=p.x-glyph.center.x,y=p.y-glyph.center.y;return{x:ca*x+sa*y,y:-sa*x+ca*y};});return{points,bounds:boundsOf(points)};});
        const b=boundsOf(rings.flatMap(r=>r.points)),i0=Math.floor(b[0]/px),i1=Math.ceil(b[2]/px)-1,j0=Math.floor(b[1]/py),j1=Math.ceil(b[3]/py)-1;
        const maxCells=budget.maxCells??8192,maxPoints=budget.maxPoints??262144;
        if(!Number.isInteger(maxCells)||maxCells<1||!Number.isInteger(maxPoints)||maxPoints<1)throw new RangeError('Invalid Auxetic geometry budget');
        if((i1-i0+1)*(j1-j0+1)>maxCells)throw new RangeError('Auxetic cell budget exceeded');
        for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
          const bounds=[i*px,j*py,(i+1)*px,(j+1)*py],pieces=[];
          for(const ring of rings){
            if(ring.bounds[0]>=bounds[2]||ring.bounds[2]<=bounds[0]||ring.bounds[1]>=bounds[3]||ring.bounds[3]<=bounds[1])continue;
            const points=clipAuxeticRing(ring.points,bounds),area=auxeticArea(points);
            if(Math.abs(area)<1e-12)continue;
            result.pointCount+=points.length;if(result.pointCount>maxPoints)throw new RangeError('Auxetic point budget exceeded');
            pieces.push({points,area});
          }
          // A counter-only interior cell has exactly cancelling oriented material.
          // Retain nonzero material, including disconnected fragments of one cell.
          const area=pieces.reduce((sum,r)=>sum+r.area,0);
          if(area>1e-10)result.panels.push({i,j,x:(i+.5)*px,y:(j+.5)*py,pieces,area});
        }
        const panelAt=new Map(result.panels.map(p=>[p.i+':'+p.j,p]));
        for(const panel of result.panels)for(const axis of ['x','y']){
          const neighbour=panelAt.get((panel.i+(axis==='x'?1:0))+':'+(panel.j+(axis==='y'?1:0)));if(!neighbour)continue;
          const value=axis==='x'?(panel.i+1)*px:(panel.j+1)*py,lo=axis==='x'?panel.j*py:panel.i*px,hi=lo+(axis==='x'?py:px);
          // Require real ink on both sides of the cut, not a tangent boundary.
          const epsilon=Math.min(px,py)*1e-8;
          const left=auxeticCutIntervals(rings,axis,value-epsilon,lo,hi),right=auxeticCutIntervals(rings,axis,value+epsilon,lo,hi);
          for(const a of left)for(const b of right){
            const low=Math.max(a[0],b[0]),high=Math.min(a[1],b[1]);
            if(high-low>1e-8)result.joints.push({a:panel,b:neighbour,axis,value,lo:low,hi:high});
          }
        }
        return result;
      }

      function auxeticDeployment(compiled,opening,phase=0,motion=0) {
        if(!Number.isFinite(opening)||!Number.isFinite(motion))throw new TypeError('Invalid Auxetic deployment');
        const loop=Number.isFinite(phase)?((phase%1)+1)%1:0;
        const angle=Math.max(0,Math.min(90,opening))*(1-Math.max(0,Math.min(1,motion))*(1-Math.cos(loop*Math.PI*2))/2)*Math.PI/180;
        const c=Math.cos(angle),s=Math.sin(angle),{px,py}=compiled;
        return{angle,c,s,stepX:px*c+py*s,stepY:py*c+px*s};
      }

      function auxeticPanelMatrix(compiled,panel,deployment) {
        const {ca,sa,px,py,glyph}=compiled,{c,s,stepX,stepY}=deployment;
        const sn=((panel.i+panel.j)&1)?-s:s;
        const a=ca*c-sa*sn,b=sa*c+ca*sn,cc=-ca*sn-sa*c,d=-sa*sn+ca*c;
        const x=panel.x*stepX/px,y=panel.y*stepY/py;
        return{a,b,c:cc,d,e:glyph.center.x+ca*x-sa*y-a*panel.x-cc*panel.y,
          f:glyph.center.y+sa*x+ca*y-b*panel.x-d*panel.y};
      }

      function pointSegmentDistance(point,a,b) {
        const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
        const t=d2?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/d2)):0;
        return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
      }

      function ligamentRing(joint,ma,mb,amount,tolerance) {
        const mid=(joint.lo+joint.hi)/2,width=(joint.hi-joint.lo)*amount/2;
        const source=joint.axis==='x'?{x:joint.value,y:mid}:{x:mid,y:joint.value};
        const point=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
        const a=point(ma,source),b=point(mb,source),distance=Math.hypot(b.x-a.x,b.y-a.y);
        if(distance<1e-9||width<1e-9)return null;
        const nx=joint.axis==='x'?1:0,ny=1-nx,orientation=joint.axis==='x'?1:-1;
        const na={x:ma.a*nx+ma.c*ny,y:ma.b*nx+ma.d*ny},nb={x:mb.a*nx+mb.c*ny,y:mb.b*nx+mb.d*ny};
        const handle=distance*.42,p1={x:a.x+na.x*handle,y:a.y+na.y*handle},p2={x:b.x-nb.x*handle,y:b.y-nb.y*handle};
        function boundary(t,side) {
          const u=1-t;
          const p={x:u*u*u*a.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*b.y};
          const dx=3*u*u*(p1.x-a.x)+6*u*t*(p2.x-p1.x)+3*t*t*(b.x-p2.x),dy=3*u*u*(p1.y-a.y)+6*u*t*(p2.y-p1.y)+3*t*t*(b.y-p2.y);
          const length=Math.hypot(dx,dy),taper=.28+.72*Math.pow(Math.abs(2*t-1),1.25);
          const ox=side*orientation*(-dy)/Math.max(1e-12,length)*width*taper,oy=side*orientation*dx/Math.max(1e-12,length)*width*taper;
          return{x:p.x+ox,y:p.y+oy};
        }
        let subdivisions=0,maxErrorEstimate=0;
        function flatten(side) {
          const points=[boundary(0,side)];
          function segment(t0,q0,t1,q1,depth) {
            const span=t1-t0,tests=[t0+span*.25,t0+span*.5,t0+span*.75].map(t=>boundary(t,side));
            const error=Math.max(...tests.map(q=>pointSegmentDistance(q,q0,q1)));
            if(error>tolerance){
              if(depth>=24||subdivisions>=8192)throw new RangeError('Auxetic ligament precision budget exceeded');
              const tm=(t0+t1)/2,qm=tests[1];subdivisions++;
              segment(t0,q0,tm,qm,depth+1);segment(tm,qm,t1,q1,depth+1);
            }else{points.push(q1);maxErrorEstimate=Math.max(maxErrorEstimate,error);}
          }
          segment(0,points[0],1,boundary(1,side),0);return points;
        }
        const left=flatten(1),right=flatten(-1);
        const points=left.concat(right.reverse());if(auxeticArea(points)<0)points.reverse();
        return {points,area:auxeticArea(points),panel:null,ligament:true,subdivisions,maxErrorEstimate};
      }

      function renderAuxeticGlyph(compiled,input={},phase=0,options={}) {
        const settings=normalizeAuxeticSettings({...compiled.settings,...input});
        const maxPoints=options.maxPoints??524288,tolerance=options.tolerance??.08;
        if(!Number.isInteger(maxPoints)||maxPoints<1||!Number.isFinite(tolerance)||tolerance<=0)throw new RangeError('Invalid Auxetic output budget');
        if(settings.module!==compiled.settings.module||settings.aspect!==compiled.settings.aspect||settings.axis!==compiled.settings.axis)throw new Error('Auxetic cut layout requires recompilation');
        const deployment=auxeticDeployment(compiled,settings.opening,phase,settings.motion);
        if(!compiled.glyph.bounds)return{rings:[],bounds:null,panels:0,deployment};
        // Identity returns original rings once, avoiding artificial raster cut seams.
        if(deployment.angle===0){
          if(compiled.glyph.pointCount>maxPoints)throw new RangeError('Auxetic output point budget exceeded');
          return{rings:compiled.glyph.rings.map(r=>({points:r.points.map(p=>({...p})),area:r.area,panel:null})),bounds:compiled.glyph.bounds.slice(),panels:compiled.panels.length,deployment};
        }
        const rings=[],matrices=new Map(compiled.panels.map(panel=>[panel,auxeticPanelMatrix(compiled,panel,deployment)]));
        for(const panel of compiled.panels){const m=matrices.get(panel);
          for(const piece of panel.pieces)rings.push({panel:[panel.i,panel.j],area:piece.area,points:piece.points.map(p=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}))});
        }
        let pointCount=rings.reduce((sum,r)=>sum+r.points.length,0);
        if(pointCount>maxPoints)throw new RangeError('Auxetic output point budget exceeded');
        if(settings.ligament>0)for(const joint of compiled.joints){
          const ring=ligamentRing(joint,matrices.get(joint.a),matrices.get(joint.b),settings.ligament,tolerance);
          if(ring){pointCount+=ring.points.length;if(pointCount>maxPoints)throw new RangeError('Auxetic output point budget exceeded');rings.push(ring);}
        }
        return{rings,bounds:rings.length?boundsOf(rings.flatMap(r=>r.points)):null,panels:compiled.panels.length,deployment};
      }

      // Maximum singular value maps local approximation error to physical pixels,
      // including output scale, rotation, mirror and skew.
      function auxeticPixelTolerance(matrix,pixelError=.2) {
        const {a,b,c,d}=matrix;
        if(![a,b,c,d,pixelError].every(Number.isFinite)||pixelError<=0)throw new TypeError('Invalid Auxetic output transform');
        const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c),Math.abs(d));if(scale===0)return 10;
        const an=a/scale,bn=b/scale,cn=c/scale,dn=d/scale;
        const aa=an*an+bn*bn,cc=cn*cn+dn*dn,ac=an*cn+bn*dn;
        const sigma=scale*Math.sqrt((aa+cc+Math.hypot(aa-cc,2*ac))/2);
        const tolerance=sigma>0?pixelError/sigma:10;
        if(tolerance<.00001)throw new RangeError('Output scale exceeds Auxetic precision budget');
        return Math.min(10,tolerance);
      }

      // Active prepared layouts only. Repeated copies share one entry; when the
      // explicit point budget is exceeded, no active glyph is silently evicted.
      function createAuxeticSourcePool(options={}) {
        const limit=options.pointLimit??262144;
        if(!Number.isInteger(limit)||limit<1)throw new RangeError('Invalid Auxetic source budget');
        let entries=new Map(),points=0,paused=false;
        function sync(requests){
          const next=new Map();
          for(const request of requests)if(!next.has(request.key))next.set(request.key,entries.get(request.key)||{request,data:null,error:''});
          entries=next;points=[...entries.values()].reduce((sum,entry)=>sum+(entry.data?.pointCount||0),0);
        }
        function advance(){
          if(paused)return false;const entry=[...entries.values()].find(e=>!e.data&&!e.error);if(!entry)return false;
          try{
            const data=entry.request.load(Math.max(0,limit-points));
            if(!Number.isInteger(data.pointCount)||data.pointCount<0)throw new Error('Invalid Auxetic glyph source');
            if(points+data.pointCount>limit)throw new RangeError('Auxetic source budget exceeded');
            entry.data=data;points+=data.pointCount;
          }catch(error){entry.error=error.message||String(error);}return true;
        }
        function retry(){for(const entry of entries.values())entry.error='';paused=false;}
        function state(){const all=[...entries.values()],ready=all.filter(e=>e.data).length;
          return{total:all.length,ready,pending:all.some(e=>!e.data&&!e.error),paused,points,error:all.find(e=>e.error)?.error||'',limit};}
        function inspect(key){const entry=entries.get(key);return{status:!entry?'missing':entry.data?'ready':entry.error?'error':'pending',error:entry?.error||''};}
        return{sync,advance,retry,state,inspect,read:key=>entries.get(key)?.data||null,setPaused:value=>{paused=!!value;},reset:()=>{entries.clear();points=0;paused=false;}};
      }
      return { AUXETIC_TYPE_STARTS, normalizeAuxeticSettings, auxeticArea, prepareAuxeticGlyph, clipAuxeticRing, auxeticCutIntervals, compileAuxeticGlyph, auxeticDeployment, auxeticPanelMatrix, renderAuxeticGlyph, auxeticPixelTolerance, createAuxeticSourcePool };
      })();

      var auxeticPool = AuxeticType.createAuxeticSourcePool({ pointLimit: 262144 });

      var auxeticFontRevision = 0;

      var auxeticTimer = null;

      var auxeticRenderError = '';

      function auxeticGlyphSettings(g) {
        var profile = g.surface || {};
        function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
        return AuxeticType.normalizeAuxeticSettings({ opening: value('auxeticOpening'), module: value('auxeticModule'),
          aspect: value('auxeticAspect'), axis: value('auxeticAxis'), ligament: value('auxeticLigament'), motion: value('auxeticMotion') });
      }

      function auxeticIsNative(settings) { return settings.opening === 0; }

      function auxeticIsNativeAtPhase(settings, phase) {
        if (auxeticIsNative(settings)) return true;
        var loop = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
        return settings.motion === 1 && Math.abs(loop - .5) < 1e-12;
      }

      function auxeticSourceKey(ch, settings, g) {
        return auxeticFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,768).key : params.fontWeight + ' 768px ' + params.fontFamily) + '\u0000' + ch
          + '\u0000' + settings.module + ':' + settings.aspect + ':' + settings.axis;
      }

      function auxeticGlyphData(ch, fontSpec, settings, available) {
        var canvas = createRenderCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
        var font = fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,768).font : fontSpec.font; ctx.font = font;
        var measure = ctx.measureText(ch), unit = 4;
        var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
        var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
        var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
        var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
        var width = left + right, height = ascent + descent;
        if (width > 4096 || height > 4096) throw new RangeError('この字形はAuxetic Typeの4096pxソース上限を超えています。');
        canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
        ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
        var traced = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        var contours = traced.map(function (contour) { return { points: contour.points.map(function (point) {
          return { x: (point.x - left) / unit, y: (point.y - ascent) / unit };
        }) }; });
        var glyph = AuxeticType.prepareAuxeticGlyph(contours);
        var compiled = AuxeticType.compileAuxeticGlyph(glyph, settings);
        var pointCount = glyph.pointCount + compiled.pointCount;
        if (pointCount > available) throw new RangeError('Auxetic Typeの字形メモリ上限に達しました。適用する文字種を減らしてください。');
        ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
        var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
          ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
        return { compiled: compiled, pointCount: pointCount, advance: measure.width / unit, middleOffset: middleOffset,
          ascent: Math.max(1, measure.actualBoundingBoxAscent || 768) / unit, descent: Math.max(0, measure.actualBoundingBoxDescent || 0) / unit };
      }

      function auxeticRequests(glyphs) {
        var requests = new Map(), font = params.fontWeight + ' 768px ' + params.fontFamily;
        if (surfaceOutputOpacity('auxeticType') <= .002) return [];
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i]; if (surfaceGlyphStrength(g, 'auxeticType') <= .002 || !String(g.ch || '').trim()) continue;
          var settings = auxeticGlyphSettings(g); if (auxeticIsNative(settings)) continue;
          var key = auxeticSourceKey(g.ch, settings, g);
          if (!requests.has(key)) requests.set(key, { key: key,
            load: auxeticGlyphData.bind(null, g.ch, { key: key, font: font, glyph: g.fontAxes ? g : null }, settings) });
        }
        return Array.from(requests.values());
      }

      function auxeticPrepare(glyphs) {
        if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
        var requests = auxeticRequests(glyphs); auxeticPool.sync(requests);
        if (!requests.length) {
          auxeticRenderError = ''; auxeticPool.setPaused(false);
          if (auxeticTimer !== null) cancelAnimationFrame(auxeticTimer); auxeticTimer = null;
        }
        auxeticScheduleWork();
      }

      function auxeticAssertReady(glyphs) {
        if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
        var requests = auxeticRequests(glyphs);
        for (var i = 0; i < requests.length; i++) {
          var state = auxeticPool.inspect(requests[i].key); if (state.status === 'ready') continue;
          var failure = new Error(state.error || 'Auxetic Typeの切断字形を準備中です。キャンバスの準備完了を確認してください。');
          failure.code = state.status === 'error' ? 'AUXETIC_ERROR' : 'AUXETIC_PENDING'; throw failure;
        }
      }

      function auxeticEffectPad(glyphs) {
        var extra = 0, extents = new Map(); if (surfaceOutputOpacity('auxeticType') <= .002) return 0;
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i]; if (surfaceGlyphStrength(g, 'auxeticType') <= .002 || !String(g.ch || '').trim()) continue;
          var settings = auxeticGlyphSettings(g); if (auxeticIsNative(settings)) continue;
          var key = auxeticSourceKey(g.ch, settings, g), data = auxeticPool.read(key); if (!data) continue;
          var phase = compositionState.enabled ? compositionState.phase : 0, extentKey = key + ':' + settings.opening + ':' + settings.ligament + ':' + settings.motion + ':' + phase;
          var extent = extents.get(extentKey);
          if (extent == null) {
            try {
              var shape = AuxeticType.renderAuxeticGlyph(data.compiled, settings, phase, { tolerance: .08, maxPoints: 524288 });
              extent = 0;
              for (var r = 0; r < shape.rings.length; r++) for (var p = 0; p < shape.rings[r].points.length; p++) {
                var point = shape.rings[r].points[p];
                extent = Math.max(extent, -point.x, point.x - data.advance, -point.y - data.ascent, point.y - data.descent);
              }
            } catch (error) { auxeticRenderError = error.message || String(error); auxeticUpdateStatus(); continue; }
            extents.set(extentKey, extent);
          }
          var stretch = Math.max(Math.abs(g.scaleX || 1), Math.abs(g.scaleY || 1));
          var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
          extra = Math.max(extra, (extent + .2) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
        }
        return extra;
      }

      function auxeticTraceRings(path, rings) {
        for (var r = 0; r < rings.length; r++) {
          var points = rings[r].points; if (!points.length) continue;
          path.moveTo(points[0].x, points[0].y);
          for (var p = 1; p < points.length; p++) path.lineTo(points[p].x, points[p].y); path.closePath();
        }
      }

      function renderAuxeticTypeDirect(targetCtx, glyphs, pixelScale, L, fm, livePreview) {
        var ctx = targetCtx, color = surfaceEffectColor('auxeticType'); auxeticRenderError = '';
        if (surfaceOutputOpacity('auxeticType') <= .002) return;
        var phase = compositionState.enabled ? compositionState.phase : 0, groups = new Map(), items = [];
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i], strength = surfaceGlyphStrength(g, 'auxeticType');
          if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
          var settings = auxeticGlyphSettings(g), sourceKey = auxeticSourceKey(g.ch, settings, g), data = auxeticPool.read(sourceKey);
          var item = { glyph: g, strength: strength, data: data, group: null, error: null, native: auxeticIsNativeAtPhase(settings, phase) }; items.push(item);
          if (item.native) continue;
          if (!data) {
            var state = auxeticPool.inspect(sourceKey); item.error = new Error(state.error || 'Auxetic Typeの切断字形を準備中です。');
            item.error.code = state.error ? 'AUXETIC_ERROR' : 'AUXETIC_PENDING'; if (!livePreview) throw item.error; continue;
          }
          ctx.save();
          try {
            spectralGlyphFrame(ctx, g, pixelScale, L, fm, data);
            var tolerance = AuxeticType.auxeticPixelTolerance(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.physical(ctx.canvas).getContext('2d').getTransform():ctx.getTransform(), .2);
            var groupKey = JSON.stringify([sourceKey, settings]), group = groups.get(groupKey);
            if (!group) { group = { data: data, settings: settings, tolerance: tolerance, remaining: 0, generated: false, shape: null, path: null, error: null }; groups.set(groupKey, group); }
            group.tolerance = Math.min(group.tolerance, tolerance); group.remaining++; item.group = group;
          } catch (error) { item.error = error; if (!livePreview) throw error; }
          finally { ctx.restore(); }
        }
        for (var j = 0; j < items.length; j++) {
          var entry = items[j], group = entry.group, glyph = entry.glyph;
          if (group && !group.generated) {
            group.generated = true;
            try {
              group.shape = AuxeticType.renderAuxeticGlyph(group.data.compiled, group.settings, phase, { tolerance: group.tolerance, maxPoints: 524288 });
              if (typeof Path2D === 'function') { group.path = new Path2D(); auxeticTraceRings(group.path, group.shape.rings); group.shape = null; }
            } catch (error) { group.error = error; }
          }
          var error = entry.error || (group && group.error); if (error && !livePreview) throw error;
          if (error && error.code !== 'AUXETIC_PENDING' && !auxeticRenderError) auxeticRenderError = error.message || String(error);
          if (entry.native || !group || error) drawSurfaceGlyph(ctx, glyph, pixelScale, L, fm, entry.strength, color);
          else {
            ctx.save();
            try {
              spectralGlyphFrame(ctx, glyph, pixelScale, L, fm, entry.data);
              ctx.globalAlpha = entry.strength * (glyph.opacity == null ? 1 : glyph.opacity); ctx.fillStyle = color;
              if (group.path) ctx.fill(group.path); else { ctx.beginPath(); auxeticTraceRings(ctx, group.shape.rings); ctx.fill(); }
            } finally { ctx.restore(); }
          }
          if (group && --group.remaining === 0) { group.path = null; group.shape = null; }
        }
        auxeticUpdateStatus();
      }
