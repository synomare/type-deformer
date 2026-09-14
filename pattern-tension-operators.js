(function (root) {
  'use strict';
  // Independent implementations from mathematical descriptions; see
  // pattern-tension-research.md for sources, approximations and visual evidence.
  var schemas = {
    ornamentReserve: {
      label: 'Ornament Reserve', short: 'orv', color: '#584224',
      description: '接続した曲線の場を字形の周囲に編み、描かれない文字を浮かび上がらせます。',
      options: { reserveMode: ['ribbon', 'lace', 'circuit'] },
      limits: { reserveCell: [8, 40], reserveReach: [8, 90], reserveWeight: [0.25, 2.4], reserveClearance: [0, 8], reserveDisorder: [0, 1] },
      defaults: { reserveMode: 'ribbon', reserveCell: 13, reserveReach: 32, reserveWeight: 0.95, reserveClearance: 0.8, reserveDisorder: 0.72 },
      labels: { reserveMode: 'Weave / 編み方', reserveCell: 'Scale / 模様の大きさ', reserveReach: 'Field / 周囲への広がり', reserveWeight: 'Thread / 線の太さ', reserveClearance: 'Reserve / 文字との余白', reserveDisorder: 'Order / 接続の変奏' }
    },
    tensionMembrane: {
      label: 'Tension Membrane', short: 'tmv', color: '#873d49',
      description: '文字を一枚の薄膜として切り出し、支持点と荷重からたわみ・皺・ねじれを計算します。',
      options: { membraneMode: ['canopy', 'drape', 'twist'] },
      limits: { membraneLoad: [0, 2], membraneSlack: [0, 0.6], membraneSoftness: [0, 1], membraneBias: [-1, 1], membraneView: [-65, 65] },
      defaults: { membraneMode: 'canopy', membraneLoad: 1.3, membraneSlack: 0.38, membraneSoftness: 0.35, membraneBias: 0.25, membraneView: -24 },
      labels: { membraneMode: 'Supports / 支え方', membraneLoad: 'Load / 荷重', membraneSlack: 'Slack / 膜の余り', membraneSoftness: 'Softness / 柔らかさ', membraneBias: 'Balance / 支持の偏り', membraneView: 'View / 見る角度' }
    }
  };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function random(seed) { var n=seed>>>0;return function(){n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;}; }
  function canvas(w,h){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=w;c.height=h;c.getContext('2d',{willReadFrequently:true});return c;}
  function mix(a,b,t){return a.map(function(v,i){return v+(b[i]-v)*t;});}
  function css(a){return 'rgb('+a.map(Math.round).join(',')+')';}
  function alphaAt(s,x,y){var ix=clamp(Math.round(x),0,s.w-1),iy=clamp(Math.round(y),0,s.h-1);return s.alpha[iy*s.w+ix];}
  function bounds(s){var b=[s.w,s.h,-1,-1];for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>.1){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b[2]<0?null:b;}
  function outsideDistance(s){var d=new Float32Array(s.w*s.h),q=Math.SQRT2;for(var i=0;i<d.length;i++)d[i]=s.alpha[i]>.4?0:1e6;
    for(var y=1;y<s.h-1;y++)for(var x=1;x<s.w-1;x++){var i=y*s.w+x;d[i]=Math.min(d[i],d[i-1]+1,d[i-s.w]+1,d[i-s.w-1]+q,d[i-s.w+1]+q);}
    for(var y=s.h-2;y>0;y--)for(var x=s.w-2;x>0;x--){var i=y*s.w+x;d[i]=Math.min(d[i],d[i+1]+1,d[i+s.w]+1,d[i+s.w-1]+q,d[i+s.w+1]+q);}return d;
  }

  // Every port has one tile-local partner and at most one adjacent-tile partner.
  // Following this degree-two graph assigns an entire strand one identity.
  function truchetGraph(cols,rows,orientations){
    var edges=[],portEdge=new Int32Array(cols*rows*4);portEdge.fill(-1);
    for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
      var cell=y*cols+x,pairs=orientations[cell]===0?[[0,3],[1,2]]:[[0,1],[2,3]];
      pairs.forEach(function(pair){var edge={x:x,y:y,ports:pair,cell:cell,id:edges.length};portEdge[cell*4+pair[0]]=edge.id;portEdge[cell*4+pair[1]]=edge.id;edges.push(edge);});
    }
    function neighbor(e,port){var x=e.x,y=e.y;if(port===0)y--;if(port===1)x++;if(port===2)y++;if(port===3)x--;if(x<0||y<0||x>=cols||y>=rows)return -1;return portEdge[(y*cols+x)*4+(port+2)%4];}
    var seen=new Uint8Array(edges.length),paths=[];
    // Begin at exposed grid ports before closed loops, so no open strand is split.
    var starts=[];edges.forEach(function(e){e.ports.forEach(function(p){if(neighbor(e,p)<0)starts.push([e.id,p]);});});edges.forEach(function(e){starts.push([e.id,e.ports[0]]);});
    starts.forEach(function(start){if(seen[start[0]])return;var sequence=[],id=start[0],entry=start[1];while(id>=0&&!seen[id]){var e=edges[id];seen[id]=1;var exit=e.ports[0]===entry?e.ports[1]:e.ports[0];sequence.push({edge:e,entry:entry,exit:exit});id=neighbor(e,exit);entry=(exit+2)%4;}paths.push({segments:sequence,closed:id===start[0]});});
    return {edges:edges,paths:paths,neighbor:neighbor};
  }
  var ports=[[.5,0],[1,.5],[.5,1],[0,.5]];
  function arcPoints(edge,entry,exit,cell,ox,oy,mode){
    var a=ports[entry],b=ports[exit],cx=(a[0]===0||b[0]===0)?0:1,cy=(a[1]===0||b[1]===0)?0:1;
    var begin=Math.atan2(a[1]-cy,a[0]-cx),end=Math.atan2(b[1]-cy,b[0]-cx),delta=end-begin;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;
    var pts=[];for(var j=0;j<=10;j++){var t=j/10,x=cx+Math.cos(begin+delta*t)*.5,y=cy+Math.sin(begin+delta*t)*.5;
      if(mode==='circuit'){var bend=[cx===0?.24:.76,cy===0?.24:.76],u=1-t;x=u*u*a[0]+2*u*t*bend[0]+t*t*b[0];y=u*u*a[1]+2*u*t*bend[1]+t*t*b[1];}
      pts.push([ox+(edge.x+x)*cell,oy+(edge.y+y)*cell]);}return pts;
  }
  function ornament(s,p,color,accent,seed){
    var out=canvas(s.w,s.h),ctx=out.getContext('2d'),b=bounds(s);if(!b)return out;
    var d=outsideDistance(s),sc=s.scale,cell=p.reserveCell*sc,reach=p.reserveReach*sc,margin=reach+cell,ox=Math.floor((b[0]-margin)/cell)*cell,oy=Math.floor((b[1]-margin)/cell)*cell;
    var cols=Math.ceil((b[2]+margin-ox)/cell),rows=Math.ceil((b[3]+margin-oy)/cell),rng=random(seed),orientations=[];
    function cost(x,y,o){var c=0,pairs=o===0?[[0,3],[1,2]]:[[0,1],[2,3]];pairs.forEach(function(pair){arcPoints({x:x,y:y},pair[0],pair[1],cell,ox,oy,'ribbon').forEach(function(pt){var distance=d[clamp(Math.round(pt[1]),0,s.h-1)*s.w+clamp(Math.round(pt[0]),0,s.w-1)];if(distance<p.reserveClearance*sc+sc)c+=1;});});return c;}
    for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
      var a=cost(x,y,0),bCost=cost(x,y,1),ordered=(x+y)%2,choice=rng()<p.reserveDisorder?(rng()<.5?0:1):ordered;
      if(Math.abs(a-bCost)>3)choice=a<bCost?0:1;orientations.push(choice);
    }
    var graph=truchetGraph(cols,rows,orientations);ctx.lineCap='round';ctx.lineJoin='round';
    graph.paths.forEach(function(path,index){var pts=[];path.segments.forEach(function(segment,j){var v=arcPoints(segment.edge,segment.entry,segment.exit,cell,ox,oy,p.reserveMode);pts=pts.concat(j?v.slice(1):v);});
      if(pts.length<2)return;var palette=mix(color,accent,(index*7%13)/13*.65),lanes=p.reserveMode==='lace'?5:3;
      for(var lane=0;lane<lanes;lane++){var offset=(lane-(lanes-1)/2)*sc*p.reserveWeight*2.25;ctx.beginPath();
        pts.forEach(function(pt,i){var prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy)||1,x=pt[0]-dy/length*offset,y=pt[1]+dx/length*offset;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
        if(path.closed)ctx.closePath();ctx.strokeStyle=css(lane===1?mix(palette,[215,170,67],.55):palette);ctx.lineWidth=sc*p.reserveWeight*(p.reserveMode==='circuit'?1.5:p.reserveMode==='lace'?.45:.8);ctx.stroke();
      }
    });
    // A true unpainted reserve. This only masks this operator's local tile.
    var R=root.TypeDeformerRenderContext,mask=R?R.withContext(null,function(){return canvas(s.w,s.h);}):canvas(s.w,s.h),mc=mask.getContext('2d'),im=mc.createImageData(s.w,s.h),clear=p.reserveClearance*sc;
    for(var i=0;i<d.length;i++){var inner=clamp((d[i]-clear)/sc,0,1),outer=clamp((reach-d[i])/(sc*3),0,1);im.data[i*4+3]=255*inner*outer;}
    mc.putImageData(im,0,0);var analysis=R?R.analysis(out).getContext('2d'):ctx;analysis.globalCompositeOperation='destination-in';analysis.drawImage(mask,0,0);analysis.globalCompositeOperation='source-over';
    if(R){R.applyAlpha(out,function(x,y){var v=R.sample(d,s.w,s.h,x-.5,y-.5);return clamp((v-clear)/sc,0,1)*clamp((reach-v)/(sc*3),0,1);});R.release(mask);}return out;
  }

  // Clip each grid triangle at alpha=0.5, sharing edge-intersection vertices.
  // This preserves disconnected marks and counters rather than filling a hull.
  function meshFromMask(s,spacing){
    var b=bounds(s);if(!b)return {nodes:[],triangles:[],edges:[],boundary:[],components:[]};
    var step=spacing*s.scale,lookup=new Map(),nodes=[],triangles=[];
    function vertex(x,y){var key=Math.round(x*10000)+','+Math.round(y*10000),id=lookup.get(key);if(id!=null)return id;id=nodes.length;lookup.set(key,id);nodes.push({x:x/s.scale,y:y/s.scale,z:0,ox:x/s.scale,oy:y/s.scale,px:x/s.scale,py:y/s.scale,pz:0,w:1});return id;}
    function clip(tri){var input=tri.map(function(v){return [v[0],v[1],alphaAt(s,v[0],v[1])];}),poly=[];
      for(var j=0;j<3;j++){var a=input[j],c=input[(j+1)%3],ia=a[2]>=.5,ic=c[2]>=.5;if(ia)poly.push(a);if(ia!==ic){var t=(.5-a[2])/(c[2]-a[2]);poly.push([a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,.5]);}}
      if(poly.length<3)return;var v=poly.map(function(pt){return vertex(pt[0],pt[1]);});for(var j=1;j<v.length-1;j++){var a=nodes[v[0]],c=nodes[v[j]],d=nodes[v[j+1]];if(Math.abs((c.ox-a.ox)*(d.oy-a.oy)-(d.ox-a.ox)*(c.oy-a.oy))>1e-5)triangles.push([v[0],v[j],v[j+1]]);}
    }
    for(var y=Math.floor((b[1]-step)/step)*step;y<=b[3];y+=step)for(var x=Math.floor((b[0]-step)/step)*step;x<=b[2];x+=step){clip([[x,y],[x+step,y],[x+step,y+step]]);clip([[x,y],[x+step,y+step],[x,y+step]]);}
    var edgeMap=new Map(),edges=[],boundary=[],adj=nodes.map(function(){return [];});
    triangles.forEach(function(tri){for(var k=0;k<3;k++){var a=tri[k],b=tri[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),edge=edgeMap.get(key);if(edge){edge.faces++;edge.opposite.push(tri[(k+2)%3]);}else{edge={a:a,b:b,rest:Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y),lambda:0,faces:1,opposite:[tri[(k+2)%3]],bend:false};edgeMap.set(key,edge);edges.push(edge);adj[a].push(b);adj[b].push(a);}}});
    var bends=[];edges.forEach(function(e){if(e.faces===1){boundary.push([e.a,e.b]);nodes[e.a].boundary=true;nodes[e.b].boundary=true;}else if(e.opposite.length===2){var a=e.opposite[0],b=e.opposite[1];bends.push({a:a,b:b,rest:Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y),lambda:0,bend:true});}});
    var visited=new Uint8Array(nodes.length),components=[];nodes.forEach(function(n,id){if(visited[id])return;var q=[id],component=[];visited[id]=1;while(q.length){var i=q.pop();component.push(i);adj[i].forEach(function(j){if(!visited[j]){visited[j]=1;q.push(j);}});}components.push(component);});
    return {nodes:nodes,triangles:triangles,edges:edges.concat(bends),boundary:boundary,components:components};
  }
  // Macklin et al. XPBD, Eq.18: cumulative multiplier within each timestep.
  function solveDistance(nodes,e,alphaTilde){var a=nodes[e.a],b=nodes[e.b],dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z,length=Math.hypot(dx,dy,dz);if(length<1e-9||a.w+b.w===0)return 0;
    var delta=(-(length-e.rest)-alphaTilde*e.lambda)/(a.w+b.w+alphaTilde);e.lambda+=delta;var inv=delta/length;
    a.x+=a.w*dx*inv;a.y+=a.w*dy*inv;a.z+=a.w*dz*inv;b.x-=b.w*dx*inv;b.y-=b.w*dy*inv;b.z-=b.w*dz*inv;return delta;
  }
  function simulate(mesh,p,seed){
    var nodes=mesh.nodes;if(!nodes.length)return mesh;var rng=random(seed),bias=p.membraneBias,slack=p.membraneSlack;
    mesh.components.forEach(function(component){var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;component.forEach(function(i){var n=nodes[i];minX=Math.min(minX,n.ox);maxX=Math.max(maxX,n.ox);minY=Math.min(minY,n.oy);maxY=Math.max(maxY,n.oy);});var cx=(minX+maxX)/2,cy=(minY+maxY)/2,span=Math.max(1,maxY-minY),width=Math.max(1,maxX-minX);
      component.forEach(function(i){var n=nodes[i],v=(n.oy-minY)/span,u=(n.ox-cx)/width;n.z=(rng()-.5)*.02*p.membraneLoad;n.pz=n.z;
        var pin=p.membraneMode==='canopy'?n.boundary&&(Math.abs(u)>.43||v<.055||v>.945):p.membraneMode==='drape'?n.boundary&&v<.13:n.boundary&&(v<.07||v>.93);
        if(pin){n.w=0;n.x=cx+(n.ox-cx)*(1-slack*.52);n.y=cy+(n.oy-cy)*(1-slack*.12);if(p.membraneMode==='twist'){var angle=(v-.5)*(1.1+bias*.6)*p.membraneLoad;n.x=cx+(n.x-cx)*Math.cos(angle);n.z=(n.ox-cx)*Math.sin(angle);}else{n.z=bias*u*span*.18*p.membraneLoad;n.y+=bias*u*width*.06*p.membraneLoad;}n.px=n.x;n.py=n.y;n.pz=n.z;}
      });
      // A disconnected dot or punctuation mark always keeps at least one support.
      if(!component.some(function(i){return nodes[i].w===0;})){nodes[component[0]].w=0;}
    });
    var dt=1/30,stretch=Math.pow(10,-7+p.membraneSoftness*3.5)/(dt*dt),bend=(.0006+p.membraneSoftness*.04)/(dt*dt);
    for(var t=0;t<90;t++){
      nodes.forEach(function(n){if(!n.w)return;var x=n.x,y=n.y,z=n.z;n.x+=(n.x-n.px)*.88;n.y+=(n.y-n.py)*.88+(p.membraneMode==='drape'?100:10)*p.membraneLoad*dt*dt;n.z+=(n.z-n.pz)*.88+(p.membraneMode==='canopy'?260:p.membraneMode==='drape'?100:65)*p.membraneLoad*dt*dt;n.px=x;n.py=y;n.pz=z;});
      mesh.edges.forEach(function(e){e.lambda=0;});for(var pass=0;pass<5;pass++)mesh.edges.forEach(function(e){solveDistance(nodes,e,e.bend?bend:stretch);});
    }return mesh;
  }
  function membrane(s,p,color,accent,seed){
    var out=canvas(s.w,s.h),ctx=out.getContext('2d'),mesh=simulate(meshFromMask(s,3.2),p,seed),nodes=mesh.nodes;if(!nodes.length)return out;
    var normals=nodes.map(function(){return [0,0,0];}),strain=new Float32Array(nodes.length),counts=new Uint16Array(nodes.length);
    mesh.triangles.forEach(function(t){var a=nodes[t[0]],b=nodes[t[1]],c=nodes[t[2]],ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z,n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];t.forEach(function(i){normals[i][0]+=n[0];normals[i][1]+=n[1];normals[i][2]+=n[2];});});
    mesh.edges.forEach(function(e){if(e.bend)return;var a=nodes[e.a],b=nodes[e.b],v=Math.abs(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)/Math.max(.01,e.rest)-1);strain[e.a]+=v;strain[e.b]+=v;counts[e.a]++;counts[e.b]++;});
    var view=p.membraneView*Math.PI/180,co=Math.cos(view),si=Math.sin(view),cx=s.w/s.scale/2,sc=s.scale;
    var projected=nodes.map(function(n,i){var normal=normals[i],length=Math.hypot.apply(Math,normal)||1;normal=normal.map(function(v){return v/length;});var nx=normal[0]*co+normal[2]*si,nz=normal[2]*co-normal[0]*si;return {x:(cx+(n.x-cx)*co+n.z*si)*sc,y:(n.y-n.z*.28)*sc,z:n.z*co-(n.x-cx)*si,nx:nx,ny:normal[1],nz:nz,u:n.ox,v:n.oy,strain:strain[i]/Math.max(1,counts[i])};});
    var im=ctx.createImageData(s.w,s.h),depth=new Float32Array(s.w*s.h);depth.fill(-Infinity);
    mesh.triangles.forEach(function(t){var a=projected[t[0]],b=projected[t[1]],c=projected[t[2]],den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<.0001)return;
      var minX=clamp(Math.floor(Math.min(a.x,b.x,c.x)),0,s.w-1),maxX=clamp(Math.ceil(Math.max(a.x,b.x,c.x)),0,s.w-1),minY=clamp(Math.floor(Math.min(a.y,b.y,c.y)),0,s.h-1),maxY=clamp(Math.ceil(Math.max(a.y,b.y,c.y)),0,s.h-1);
      for(var y=minY;y<=maxY;y++)for(var x=minX;x<=maxX;x++){
        var u=((b.y-c.y)*(x+.5-c.x)+(c.x-b.x)*(y+.5-c.y))/den,v=((c.y-a.y)*(x+.5-c.x)+(a.x-c.x)*(y+.5-c.y))/den,w=1-u-v;if(u<-.00001||v<-.00001||w<-.00001)continue;var i=y*s.w+x,z=u*a.z+v*b.z+w*c.z;if(z<depth[i])continue;depth[i]=z;
        var nx=u*a.nx+v*b.nx+w*c.nx,ny=u*a.ny+v*b.ny+w*c.ny,nz=u*a.nz+v*b.nz+w*c.nz,length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
        var light=Math.max(0,-nx*.45-ny*.55+nz*.7),sheen=Math.pow(Math.max(0,-nx*.25-ny*.15+nz*.95),18),strainValue=u*a.strain+v*b.strain+w*c.strain;
        var ink=mix(color,accent,clamp(strainValue*5,0,.75)),uvX=u*a.u+v*b.u+w*c.u,uvY=u*a.v+v*b.v+w*c.v,grain=(Math.sin(uvX*5.4)*Math.sin(uvY*5.2))*.025;
        var tone=.38+light*.68+grain,highlight=clamp(sheen*.38,0,.5),at=i*4;for(var k=0;k<3;k++)im.data[at+k]=clamp(ink[k]*tone*(1-highlight)+[249,235,211][k]*highlight,0,255);im.data[at+3]=255;
      }
    });ctx.putImageData(im,0,0);
    // The hem observes the same depth buffer as the membrane, so a folded
    // back edge cannot draw through a front face.
    var hem=mix(color,[247,223,176],.55);mesh.boundary.forEach(function(e){var a=projected[e[0]],b=projected[e[1]],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)*1.5));for(var n=0;n<=steps;n++){var t=n/steps,x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t),z=a.z+(b.z-a.z)*t;if(x<0||y<0||x>=s.w||y>=s.h)continue;var i=y*s.w+x;if(z<depth[i]-.35)continue;for(var k=0;k<3;k++)im.data[i*4+k]=hem[k];im.data[i*4+3]=255;}});ctx.putImageData(im,0,0);if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,faces=mesh.triangles.map(function(t){return {v:t.map(function(i){return projected[i];})};});RC.shadedMesh(out,faces,function(t,u,v,w,rgba){var a=t.v[0],b=t.v[1],c=t.v[2],nx=u*a.nx+v*b.nx+w*c.nx,ny=u*a.ny+v*b.ny+w*c.ny,nz=u*a.nz+v*b.nz+w*c.nz,length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;if(nz<0){nx=-nx;ny=-ny;nz=-nz;}var light=Math.max(0,-nx*.45-ny*.55+nz*.7),sheen=Math.pow(Math.max(0,-nx*.25-ny*.15+nz*.95),18),strainValue=u*a.strain+v*b.strain+w*c.strain,ink=mix(color,accent,clamp(strainValue*5,0,.75)),uvX=u*a.u+v*b.u+w*c.u,uvY=u*a.v+v*b.v+w*c.v,grain=Math.sin(uvX*5.4)*Math.sin(uvY*5.2)*.025,tone=.38+light*.68+grain,highlight=clamp(sheen*.38,0,.5);for(var k=0;k<3;k++)rgba[k]=clamp(ink[k]*tone*(1-highlight)+[249,235,211][k]*highlight,0,255);rgba[3]=255;},{afterTile:function(target,tile,m){var f=m.factor;mesh.boundary.forEach(function(e){var a=projected[e[0]],b=projected[e[1]],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)*f*1.5));for(var n=0;n<=steps;n++){var t=n/steps,px=(a.x+(b.x-a.x)*t-m.originX)*f-tile.x,py=(a.y+(b.y-a.y)*t-m.originY)*f-tile.y,z=a.z+(b.z-a.z)*t,r=Math.max(.5,f*.5);for(var y=Math.max(0,Math.floor(py-r));y<=Math.min(target.h-1,Math.ceil(py+r));y++)for(var x=Math.max(0,Math.floor(px-r));x<=Math.min(target.w-1,Math.ceil(px+r));x++){if(Math.hypot(x+.5-px,y+.5-py)>r)continue;var i=y*target.w+x;if(z<target.depth[i]-.35)continue;for(var k=0;k<3;k++)target.pixels[i*4+k]=hem[k];target.pixels[i*4+3]=255;}}});}});}return out;
  }
  root.TypeDeformerPatternTension={schemas:schemas,ids:Object.keys(schemas),renderers:{ornamentReserve:ornament,tensionMembrane:membrane},effectPad:function(){return 148;},internals:{truchetGraph:truchetGraph,arcPoints:arcPoints,meshFromMask:meshFromMask,solveDistance:solveDistance,simulate:simulate,outsideDistance:outsideDistance}};
})(typeof globalThis!=='undefined'?globalThis:this);
