import { createCalligraphyContourQuery } from './core.mjs';

export function normalizeCalligraphyBodySettings(input = {}) {
  const number = (key, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(input[key]) ? input[key] : fallback));
  return { tool: ['broad', 'brush', 'split', 'chisel'].includes(input.tool) ? input.tool : 'broad',
    expansion: number('expansion', 0, -120, 260), contrast: number('contrast', .4, 0, 4),
    angle: number('angle', 32, -180, 180), pulse: number('pulse', .2, 0, 4), wetness: number('wetness', .2, 0, 1),
    fontSize: number('fontSize', 192, .001, 1e6) };
}

export function prepareCalligraphyBody(contours, metrics = {}) {
  const query = createCalligraphyContourQuery(contours, 4), b = query.bounds;
  const value = (key, fallback) => Number.isFinite(metrics[key]) ? metrics[key] : fallback;
  return { query, bounds: b,
    centerX: value('centerX', b ? (b[0] + b[2]) / 2 : 0), centerY: value('centerY', b ? (b[1] + b[3]) / 2 : 0),
    halfW: Math.max(5, value('halfW', b ? (b[2] - b[0]) * .62 : 5)),
    halfH: Math.max(5, value('halfH', b ? (b[3] - b[1]) * .62 : 5)) };
}

export function createCalligraphyBodySampler(body, input, phase = 0, antiAlias = 0) {
  const settings = normalizeCalligraphyBodySettings(input), {tool,contrast,pulse,wetness} = settings;
  const angle = settings.angle * Math.PI / 180, cosA = Math.cos(angle), sinA = Math.sin(angle);
  const expansion = settings.expansion * 192 / settings.fontSize;
  const contrastReach = 192 * contrast * (tool === 'brush' ? .075 : .105);
  const pulseReach = 192 * pulse * (tool === 'brush' ? .052 : .032);
  const softness = Math.max((.65 + wetness * 3.1) * 192 / settings.fontSize, antiAlias);
  const t = Number.isFinite(phase) ? (((phase % 1) + 1) % 1) * Math.PI * 2 : 0;
  const pad = Math.max(7 * 192 / settings.fontSize, Math.abs(expansion) + contrastReach + pulseReach + softness * 3);
  const bounds = body.bounds && [body.bounds[0]-pad,body.bounds[1]-pad,body.bounds[2]+pad,body.bounds[3]+pad];
  const point = {}, interval = {};
  const chord = tool === 'split' ? body.query.createChordQuery(cosA, sinA) : null;
  const smooth = value => { const z=Math.max(0,Math.min(1,value)); return z*z*(3-2*z); };
  return { settings, pad, bounds, sample(x,y) {
    if (!bounds || x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) return 0;
    body.query.query(x,y,point); const inside = body.query.contains(x,y), signed = (inside ? 1 : -1) * point.distance;
    if (signed + pad < 0) return 0;
    const dx=x-body.centerX,dy=y-body.centerY;
    const localAlong=(dx*cosA+dy*sinA)/Math.max(8,body.halfW+body.halfH);
    const normalAlong=point.nx*cosA+point.ny*sinA, normalAcross=-point.nx*sinA+point.ny*cosA;
    const supportAlong=Math.abs(normalAlong),supportAcross=Math.abs(normalAcross);
    const pressureWave=Math.sin(localAlong*Math.PI*(2.2+pulse*.72)+t);
    let stress;
    if(tool==='brush') {
      const envelope=.2+.8*Math.pow(Math.max(0,Math.sin((localAlong+.58)*Math.PI)),.72);
      const breath=Math.sin(localAlong*Math.PI*(3.4+pulse)-t)*.22;
      stress=contrastReach*((.28+supportAlong*.72)*envelope-.31)+pulseReach*(pressureWave*.58+breath);
    } else if(tool==='split') stress=contrastReach*(supportAlong*.92+supportAcross*.2-.43)+pulseReach*pressureWave*.38;
    else if(tool==='chisel') stress=contrastReach*(normalAlong*.58+supportAlong*.42+supportAcross*.12-.28)+pulseReach*pressureWave*.22;
    else stress=contrastReach*(supportAlong*1.06+supportAcross*.17-.47)+pulseReach*pressureWave*.26;
    const normalized=Math.max(0,Math.min(1,.5+(signed+expansion+stress)/Math.max(.001,softness*2)));
    let coverage=normalized*normalized*(3-2*normalized);
    if(tool==='split'&&coverage>.002&&inside) {
      const slitWidth=Math.max(.55*192/settings.fontSize,192*(.005+contrast*.0065));
      const center=Math.sin(localAlong*Math.PI*(1.3+pulse*.3)+t)*slitWidth*(.35+wetness*.45);
      // Do not cut the native contour OR the formed body's soft alpha fringe.
      // Skip the interval search entirely where shoulders already exclude it.
      const shoulder=Math.min(point.distance,signed+expansion+stress-softness);
      if(shoulder>.5+slitWidth*1.35) {
        const shoulders=smooth((shoulder-.5-slitWidth*1.35)/Math.max(.001,softness*2));
        chord(x,y,interval);
        if(interval.inside) {
          const across=(interval.before-interval.after)*.5-center;
          const opening=smooth(.5+(slitWidth-Math.abs(across))/Math.max(.001,softness*2));
          coverage*=1-.96*opening*shoulders;
        }
      }
    }
    return coverage;
  }};
}

export function calligraphyInverseMatrix(matrix) {
  const {a,b,c,d,e,f}=matrix;
  if(![a,b,c,d,e,f].every(Number.isFinite))throw new RangeError('Calligraphy contains a non-finite transform');
  const determinant=a*d-b*c;if(determinant===0)return null;
  const result={a:d/determinant,b:-b/determinant,c:-c/determinant,d:a/determinant,e:(c*f-d*e)/determinant,f:(b*e-a*f)/determinant};
  if(!Object.values(result).every(Number.isFinite))throw new RangeError('Calligraphy transform exceeds numeric precision');
  return result;
}

export function rasterCalligraphyBody(body, settings, phase, matrix, width, height, output, alpha = 1) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||output.length!==width*height*4)throw new RangeError('Invalid Calligraphy target');
  if(!Number.isFinite(alpha))throw new TypeError('Invalid Calligraphy alpha');
  alpha=Math.max(0,Math.min(1,alpha));if(!alpha||!body.bounds)return {pixels:0};
  const inverse=calligraphyInverseMatrix(matrix);if(!inverse)return {pixels:0};
  // Only the pixel reconstruction fringe depends on the output transform.
  // All nib/pressure/split geometry lives in the source glyph's own frame.
  const inverseNorm=Math.hypot(inverse.a,inverse.b,inverse.c,inverse.d);
  const sampler=createCalligraphyBodySampler(body,settings,phase,.5*inverseNorm);
  const b=sampler.bounds, corners=[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]];
  const xs=corners.map(([x,y])=>matrix.a*x+matrix.c*y+matrix.e),ys=corners.map(([x,y])=>matrix.b*x+matrix.d*y+matrix.f);
  if(!xs.concat(ys).every(Number.isFinite))throw new RangeError('Calligraphy extent exceeds numeric precision');
  const x0=Math.max(0,Math.floor(Math.min(...xs))),x1=Math.min(width-1,Math.ceil(Math.max(...xs)));
  const y0=Math.max(0,Math.floor(Math.min(...ys))),y1=Math.min(height-1,Math.ceil(Math.max(...ys)));
  let pixels=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const px=x+.5,py=y+.5;
    const coverage=sampler.sample(inverse.a*px+inverse.c*py+inverse.e,inverse.b*px+inverse.d*py+inverse.f)*alpha;
    if(coverage<=.002)continue;
    const i=(y*width+x)*4;
    output[i]=output[i+1]=output[i+2]=255;
    output[i+3]=Math.round(255*(coverage+(output[i+3]/255)*(1-coverage)));pixels++;
  }
  return {pixels};
}
