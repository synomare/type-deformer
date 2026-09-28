// Scalar reference from the pre-optimization implementation (2026-09-28).
// Intentionally independent of the optimized kernels.
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
 function sinkhorn(a,b,epsilon,metric,maxIter,tolerance){var A=a.points||a,B=b.points||b,n=A.length,m=B.length,K=new Float64Array(n*m),u=new Float64Array(n).fill(1),v=new Float64Array(m).fill(1),error=Infinity,iterations=0;maxIter=maxIter||1800;tolerance=tolerance||1e-7;
  for(var i=0;i<n;i++)for(var j=0;j<m;j++){var dx=A[i].x-B[j].x,dy=A[i].y-B[j].y;K[i*m+j]=Math.exp(-(metric*dx*dx+dy*dy/metric)/epsilon);}
  for(var it=0;it<maxIter;it++){for(var i=0;i<n;i++){var sum=0;for(var j=0;j<m;j++)sum+=K[i*m+j]*v[j];u[i]=A[i].m/Math.max(1e-300,sum);}var sums=new Float64Array(m);for(var i=0;i<n;i++)for(var j=0;j<m;j++)sums[j]+=K[i*m+j]*u[i];for(var j=0;j<m;j++)v[j]=B[j].m/Math.max(1e-300,sums[j]);iterations=it+1;
   if(it%10===9){error=0;for(var i=0;i<n;i++){var sum=0;for(var j=0;j<m;j++)sum+=K[i*m+j]*v[j];error+=Math.abs(u[i]*sum-A[i].m);}if(error<tolerance)break;}
  }
  var plan=new Float64Array(n*m),row=new Float64Array(n),col=new Float64Array(m),total=0,cost=0;for(var i=0;i<n;i++)for(var j=0;j<m;j++){var k=i*m+j,p=u[i]*K[k]*v[j];if(!Number.isFinite(p))throw Error('Transport did not remain finite');plan[k]=p;row[i]+=p;col[j]+=p;total+=p;var dx=A[i].x-B[j].x,dy=A[i].y-B[j].y;cost+=p*(metric*dx*dx+dy*dy/metric);}
  var rowError=row.reduce(function(s,x,i){return s+Math.abs(x-A[i].m);},0),columnError=col.reduce(function(s,x,j){return s+Math.abs(x-B[j].m);},0);return {a:A,b:B,plan:plan,total:total,cost:cost,rowError:rowError,columnError:columnError,iterations:iterations,epsilon:epsilon,metric:metric};
 }
 function splat(r,n,x,y,m){var u=clamp(x*n-.5,0,n-1.000001),v=clamp(y*n-.5,0,n-1.000001),i=Math.floor(u),j=Math.floor(v),fx=u-i,fy=v-j;r[j*n+i]+=m*(1-fx)*(1-fy);r[j*n+i+1]+=m*fx*(1-fy);r[(j+1)*n+i]+=m*(1-fx)*fy;r[(j+1)*n+i+1]+=m*fx*fy;}
 function interpolate(q,t,n){var r=new Float64Array(n*n),m=q.b.length;for(var i=0;i<q.a.length;i++)for(var j=0;j<m;j++){var p=q.plan[i*m+j];if(!p)continue;splat(r,n,(1-t)*q.a[i].x+t*q.b[j].x,(1-t)*q.a[i].y+t*q.b[j].y,p);}return r;}
 function blur(src,n,passes){for(var it=0;it<passes;it++){var tmp=new Float64Array(src.length),out=new Float64Array(src.length);for(var y=0;y<n;y++)for(var x=0;x<n;x++)tmp[y*n+x]=.5*src[y*n+x]+.25*(src[y*n+Math.max(0,x-1)]+src[y*n+Math.min(n-1,x+1)]);for(var y=0;y<n;y++)for(var x=0;x<n;x++)out[y*n+x]=.5*tmp[y*n+x]+.25*(tmp[Math.max(0,y-1)*n+x]+tmp[Math.min(n-1,y+1)*n+x]);src=out;}return src;}

 // Three reflected fractional box filters approximate a Gaussian in linear
 // time. Fractional outer taps keep the width continuous as Transfer changes.
 // Symmetric extension retains numerical mass, including border cells.
 function smooth(src,n,sigma){
  var variance=sigma*sigma/3,radius=Math.floor((Math.sqrt(12*variance+1)-1)/2),base=radius*2+1,fraction=(variance*base-radius*(radius+1)*base/3)/(2*((radius+1)*(radius+1)-variance)),w=base+2*fraction;
  function mirror(i){return i<0?-i-1:i>=n?2*n-i-1:i;}
  for(var pass=0;pass<3;pass++){
   var tmp=new Float64Array(src.length),out=new Float64Array(src.length);
   for(var y=0;y<n;y++){var sum=0;for(var k=-radius;k<=radius;k++)sum+=src[y*n+mirror(k)];for(var x=0;x<n;x++){tmp[y*n+x]=(sum+fraction*(src[y*n+mirror(x-radius-1)]+src[y*n+mirror(x+radius+1)]))/w;sum+=src[y*n+mirror(x+radius+1)]-src[y*n+mirror(x-radius)];}}
   for(var x=0;x<n;x++){var sum=0;for(var k=-radius;k<=radius;k++)sum+=tmp[mirror(k)*n+x];for(var y=0;y<n;y++){out[y*n+x]=(sum+fraction*(tmp[mirror(y-radius-1)*n+x]+tmp[mirror(y+radius+1)*n+x]))/w;sum+=tmp[mirror(y+radius+1)*n+x]-tmp[mirror(y-radius)*n+x];}}src=out;
  }return src;
 }
 function contours(f,n,level){var segments=[];function edge(x,y,a,b,c,d){var v=[a,b,c,d],p=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],es=[];for(var k=0;k<4;k++){var j=(k+1)%4;if((v[k]>=level)!==(v[j]>=level)){var t=(level-v[k])/(v[j]-v[k]);es.push({e:k,p:[(p[k][0]+t*(p[j][0]-p[k][0])+.5)/n,(p[k][1]+t*(p[j][1]-p[k][1])+.5)/n]});}}if(es.length===2)segments.push([es[0].p,es[1].p]);else if(es.length===4){var join=(a-level)*(c-level)>=(b-level)*(d-level);if(join){segments.push([es[0].p,es[1].p],[es[2].p,es[3].p]);}else segments.push([es[0].p,es[3].p],[es[1].p,es[2].p]);}}
  function at(x,y){return x<0||y<0||x>=n||y>=n?0:f[y*n+x];}for(var y=-1;y<n;y++)for(var x=-1;x<n;x++)edge(x,y,at(x,y),at(x+1,y),at(x+1,y+1),at(x,y+1));return segments;
 }

export {sinkhorn,interpolate,smooth,contours};
