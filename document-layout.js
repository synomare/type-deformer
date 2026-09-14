(function(root){
  'use strict';
  const clamp=(v,a,b,d)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):d;
  const number=(key,v,a,b,d)=>root.TypeDeformerParameters?root.TypeDeformerParameters.normalize('textObjects.'+key,v,d,a,b):clamp(v,a,b,d);
  function objects(raw,text){
    if(!raw)return [];
    let list=typeof raw==='string'?JSON.parse(raw):raw;
    if(!Array.isArray(list)||list.length>32)throw new Error('テキストオブジェクトは32個までです。');
    let last=0;const ids=new Set();
    return list.map((o,i)=>{
      if(!o||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(o.id)||ids.has(o.id))throw new Error('テキストオブジェクトのIDが不正です。');
      ids.add(o.id);
      if(!Number.isInteger(o.start)||!Number.isInteger(o.end)||o.start<last||o.end<o.start||o.end>text.length||text.slice(last,o.start).trim())throw new Error('テキストオブジェクトの原文範囲が一致しません。');
      if(o.start>0&&!/[\r\n]/.test(text[o.start-1])||o.end<text.length&&!/[\r\n]/.test(text[o.end]))throw new Error('テキストオブジェクトの境界は改行位置にしてください。');
      last=o.end;if(i===list.length-1&&text.slice(last).trim())throw new Error('オブジェクトに含まれない原文があります。');
      return {id:o.id,label:String(o.label||'Text '+(i+1)).slice(0,80),start:o.start,end:o.end,
        x:number('x',o.x,-100000,100000,0),y:number('y',o.y,-100000,100000,0),scale:number('scale',o.scale,.08,4,1),measure:number('measure',o.measure,0,100,0),ink:/^#[0-9a-f]{6}$/i.test(o.ink)?o.ink:''};
    });
  }
  function compose(list){
    let text='';const records=[];
    for(const item of list){if(records.length)text+='\n\n';const start=text.length;text+=String(item.text||'');records.push({...item,start,end:text.length});delete records.at(-1).text;}
    if(text.length>500000)throw new Error('原文は50万文字までです。');
    return {text,objects:objects(records,text)};
  }
  function exclusions(y,h,width,shapes,margin){
    const cuts=[];
    for(const s of shapes){
      const cy=s.y,rx=Math.max(0,s.w/2)+margin,ry=Math.max(0,s.h/2)+margin;
      if(!(rx>0&&ry>0)||y+h<=cy-ry||y>=cy+ry)continue;
      let a=s.x-rx,b=s.x+rx;
      if(s.kind==='ellipse'){
        const dy=cy<y?y-cy:cy>y+h?cy-y-h:0;
        const half=rx*Math.sqrt(Math.max(0,1-dy*dy/(ry*ry)));a=s.x-half;b=s.x+half;
      }else if(s.kind==='river'){
        // Conservative continuous sweep across the whole line band. Include
        // sine extrema, not just its endpoints: no hidden crossings at peaks.
        const samples=[Math.max(y,cy-ry),Math.min(y+h,cy+ry)];
        const period=Math.max(1,s.h),amp=s.w*.65,phase=s.phase||0;
        for(let k=-4;k<8;k++){const z=cy+period*((.25+k*.5)-phase);if(z>samples[0]&&z<samples[1])samples.push(z);}
        const xs=samples.map(z=>s.x+Math.sin(((z-cy)/period+phase)*Math.PI*2)*amp);
        a=Math.min(...xs)-rx*.35;b=Math.max(...xs)+rx*.35;
      }
      a=Math.max(0,a);b=Math.min(width,b);if(b>a)cuts.push([a,b]);
    }
    cuts.sort((a,b)=>a[0]-b[0]);let cursor=0;const free=[];
    for(const [a,b] of cuts){if(a>cursor)free.push([cursor,a]);cursor=Math.max(cursor,b);}
    if(cursor<width)free.push([cursor,width]);return free;
  }
  function wordGroups(tokens){
    const result=[];let word=null;
    for(const t of tokens){
      if(t.break||t.space){result.push([t]);word=null;continue;}
      const latin=/^[\p{Script=Latin}\p{N}'’\-]+$/u.test(t.text);
      const closing=/^[、。，．.,！？!?;:）〕〉》」』】»”’]/u.test(t.text);
      const opening=word&&/[（〔〈《「『【«“‘]$/u.test(word.at(-1).text);
      if(word&&(latin&&word.latin||closing||opening)){word.push(t);word.latin=latin;}
      else{word=[t];word.latin=latin;result.push(word);}
    }
    return result;
  }
  function reflow(tokens,settings){
    const width=Math.max(1,settings.width),line=Math.max(1,settings.line),gap=Math.max(0,settings.gap||0),shapes=settings.shapes||[];
    let y=0,slot=0,x=0,row=0,oversized=0;const positions=[],rows=[];
    const h=Math.max(1,settings.height||line);let free=exclusions(y,h,width,shapes,settings.margin||0);
    function nextRow(extra=0){y+=line+extra;row++;slot=0;free=exclusions(y,h,width,shapes,settings.margin||0);x=free[0]?.[0]||0;if(row>100000)throw new Error('組版の行数上限を超えました。空白領域を小さくしてください。');}
    x=free[0]?.[0]||0;
    for(const group of wordGroups(tokens)){
      const head=group[0];if(head.break){nextRow(gap);continue;}
      if(head.space){if(free[slot]&&x>free[slot][0])x=Math.min(free[slot][1],x+head.width);continue;}
      const groupWidth=group.reduce((sum,t)=>sum+t.width,0),tooWide=groupWidth>width+.01;
      const chunks=tooWide?group.map(t=>[t]):[group];if(tooWide)oversized++;
      for(const chunk of chunks){
        const w=chunk.reduce((sum,t)=>sum+t.width,0);let attempts=0;
        while(!free[slot]||x+w>free[slot][1]+.01){
          if(w>width&&free.length===1&&free[0][0]===0&&free[0][1]===width){x=0;break;}
          if(slot+1<free.length){slot++;x=free[slot][0];}else nextRow();
          if(++attempts>100000)throw new Error('文字を配置できません。行長か空白の大きさを変更してください。');
        }
        for(const t of chunk){positions.push({start:t.start,x,y,row,width:t.width});x+=t.width;}
        if(!rows[row])rows[row]={y,start:positions.length-chunk.length};rows[row].end=positions.length;
      }
    }
    return {positions,rows:rows.filter(Boolean),height:y+h,oversized};
  }
  function occurrences(text,terms){
    const found=[],seen=new Set();
    for(const term of [...new Set(terms)].filter(Boolean).slice(0,16)){
      if(term.length>256)continue;let from=0;
      while(from<=text.length-term.length){const start=text.indexOf(term,from);if(start<0)break;const key=start+':'+term.length;if(!seen.has(key)){seen.add(key);found.push({term,start,end:start+term.length});}from=start+Math.max(1,term.length);if(found.length>20000)throw new Error('一致数が2万件を超えました。検索語句を絞ってください。');}
    }
    return found.sort((a,b)=>a.start-b.start||b.end-a.end);
  }
  function concordance(items,matches,settings){
    if(!items.length)return {positions:[],matched:0,spanning:0};
    const rows=new Map(),matched=new Set(),rowFor=new Map(),sorted=[...items].sort((a,b)=>a.start-b.start);let spanning=0,matchCount=0,min=Infinity,max=-Infinity;
    for(const m of items){const key=(m.object||'main')+':'+m.line+':'+Math.round(m.y*4);if(!rows.has(key))rows.set(key,{items:[],anchors:[],regions:[],y:m.y,key});rows.get(key).items.push(m);rowFor.set(m.start,key);min=Math.min(min,m.x);max=Math.max(max,m.x+m.w);}
    for(const match of matches){
      let lo=0,hi=sorted.length;while(lo<hi){const mid=(lo+hi)>>>1;if(sorted[mid].end<=match.start)lo=mid+1;else hi=mid;}
      if(!sorted[lo]||sorted[lo].start>=match.end)continue;
      const first=rows.get(rowFor.get(sorted[lo].start));let a=Infinity,b=-Infinity,spans=false;
      const fragments=new Map();
      for(let i=lo;i<sorted.length&&sorted[i].start<match.end;i++){const m=sorted[i],key=rowFor.get(m.start);matched.add(m.start);const region=fragments.get(key)||[Infinity,-Infinity];region[0]=Math.min(region[0],m.x);region[1]=Math.max(region[1],m.x+m.w);fragments.set(key,region);if(key!==first.key){spans=true;continue;}a=Math.min(a,m.x);b=Math.max(b,m.x+m.w);}
      for(const [key,region] of fragments)rows.get(key).regions.push(region);
      if(spans)spanning++;first.anchors.push((a+b)/2);matchCount++;
    }
    const positions=[];let number=0;
    const objectGaps=new Map();
    for(const row of rows.values()){
      const object=row.items[0].object||'main';let gap=objectGaps.get(object)||0;
      const regions=[];for(const r of row.regions.sort((a,b)=>a[0]-b[0])){const last=regions.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else regions.push([...r]);}
      const expansion=(settings.emphasis-1)*settings.amount;
      function expanded(x){let delta=0;for(const [a,b] of regions){if(x<=a)break;delta+=Math.max(0,Math.min(x,b)-a)*expansion;}return x+delta;}
      const count=row.anchors.length,anchor=count?row.anchors.reduce((a,b)=>a+expanded(b),0)/count:0;
      let target=settings.direction==='left'?min:settings.direction==='right'?max:min+(max-min)*settings.axis;
      if(settings.direction==='alternate')target=min+(max-min)*(number%2?.78:.22);
      const dx=count?(target-anchor)*settings.amount:0;if(count){number++;gap+=settings.spacing*.5;}
      for(const m of row.items){const scale=matched.has(m.start)?1+expansion:1;positions.push({start:m.start,dx:dx+expanded(m.x+m.w/2)-(m.x+m.w/2),dy:gap,scale,matched:matched.has(m.start)});}
      if(count)gap+=settings.spacing*.5;objectGaps.set(object,gap);
    }
    return {positions,matched:matchCount,spanning};
  }
  root.TypeDeformerDocument={objects,compose,exclusions,reflow,occurrences,concordance};
})(typeof globalThis!=='undefined'?globalThis:this);
