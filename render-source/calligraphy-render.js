// Canonical calligraphy-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      function renderCalligraphicStressLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var expansionAggregate = surfaceAggregate(glyphs, 'calligraphicStress', 'calligraphyExpansion', params.calligraphyExpansion);
        if (!expansionAggregate.weight) return;
        var tool = surfaceChoice(glyphs, 'calligraphicStress', 'calligraphyTool', params.calligraphyTool, BATCH_PARAM_OPTIONS.calligraphyTool);
        if (tool === 'legacy') tool = surfaceChoice(glyphs, 'calligraphicStress', 'calligraphyLegacyTool',
          params.calligraphyLegacyTool, BATCH_PARAM_OPTIONS.calligraphyLegacyTool);
        var expansion = expansionAggregate.value * pixelScale * L.s;
        var contrast = surfaceAggregate(glyphs, 'calligraphicStress', 'calligraphyContrast', params.calligraphyContrast).value;
        var angle = surfaceAggregate(glyphs, 'calligraphicStress', 'calligraphyAngle', params.calligraphyAngle).value * Math.PI / 180;
        var pulse = surfaceAggregate(glyphs, 'calligraphicStress', 'calligraphyPulse', params.calligraphyPulse).value;
        var wetness = surfaceAggregate(glyphs, 'calligraphicStress', 'calligraphyWetness', params.calligraphyWetness).value;
        var mask = buildSurfaceMask(glyphs, 'calligraphicStress', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'calligraphicStress', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('calligraphic-stress-v26', width, height, true);
        var output = work.ctx.createImageData(width, height);
        var scale = Math.max(1, params.fontSize * pixelScale * L.s);
        var cosA = Math.cos(angle), sinA = Math.sin(angle);
        var contrastReach = scale * contrast * (tool === 'brush' ? 0.105 : 0.135);
        var pulseReach = scale * pulse * (tool === 'brush' ? 0.085 : 0.045);
        var softness = 0.8 + wetness * 2.6;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var pad = Math.max(8, Math.abs(expansion) + contrastReach + pulseReach + softness * 3);
        var minX = Math.max(0, Math.floor(field.bounds[0] - pad));
        var maxX = Math.min(width - 1, Math.ceil(field.bounds[2] + pad));
        var minY = Math.max(0, Math.floor(field.bounds[1] - pad));
        var maxY = Math.min(height - 1, Math.ceil(field.bounds[3] + pad));
        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5;
        var centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var index = y * width + x;
          var signed = surfaceSignedDistanceValue(field, index);
          if (signed + pad < 0) continue;
          var normal = surfaceFieldNormal(field, width, height, x, y);
          var alongNormal = Math.abs(normal.x * cosA + normal.y * sinA);
          var acrossNormal = Math.abs(-normal.x * sinA + normal.y * cosA);
          var directional;
          if (tool === 'brush') {
            directional = contrastReach * (0.18 + Math.pow(alongNormal, 0.72) * 0.82);
          } else if (tool === 'split') {
            directional = contrastReach * (Math.max(alongNormal, acrossNormal * 0.36) - 0.34);
          } else if (tool === 'chisel') {
            directional = contrastReach * ((normal.x * cosA + normal.y * sinA) * 0.72 + alongNormal * 0.38 - 0.18);
          } else {
            directional = contrastReach * (alongNormal * 1.18 + acrossNormal * 0.22 - 0.52);
          }
          var along = ((x - centerX) * cosA + (y - centerY) * sinA) / scale;
          var pressureWave = Math.sin(along * Math.PI * (1.5 + pulse * 1.35) + phase);
          if (tool === 'brush') pressureWave = Math.sin(along * Math.PI * (0.72 + pulse * 0.54) + phase) * 0.72
            + Math.sin(along * Math.PI * (2.1 + pulse) - phase) * 0.28;
          var threshold = expansion + directional + pulseReach * pressureWave;
          var coverage = surfaceSmoothCoverage(signed + threshold, softness);
          if (tool === 'split' && coverage > 0.002 && field.inside[index]) {
            var across = (-(x - centerX) * sinA + (y - centerY) * cosA) / Math.max(4, scale * 0.42);
            var splitSignal = Math.abs(Math.sin(across * Math.PI));
            if (splitSignal < 0.08 + pulse * 0.012 && field.distance[index] > 1.2) {
              coverage *= Math.max(0, splitSignal / Math.max(0.01, 0.08 + pulse * 0.012));
            }
          }
          if (coverage <= 0.002) continue;
          output.data[index * 4] = output.data[index * 4 + 1] = output.data[index * 4 + 2] = 255;
          output.data[index * 4 + 3] = Math.round(255 * coverage * expansionAggregate.strength);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var signed = RC.signed(field,width,height,x,y);
          if (signed + pad < 0) return;
          var normal = RC.normal(field,width,height,x,y);
          var alongNormal = Math.abs(normal.x * cosA + normal.y * sinA);
          var acrossNormal = Math.abs(-normal.x * sinA + normal.y * cosA);
          var directional;
          if (tool === 'brush') {
            directional = contrastReach * (0.18 + Math.pow(alongNormal, 0.72) * 0.82);
          } else if (tool === 'split') {
            directional = contrastReach * (Math.max(alongNormal, acrossNormal * 0.36) - 0.34);
          } else if (tool === 'chisel') {
            directional = contrastReach * ((normal.x * cosA + normal.y * sinA) * 0.72 + alongNormal * 0.38 - 0.18);
          } else {
            directional = contrastReach * (alongNormal * 1.18 + acrossNormal * 0.22 - 0.52);
          }
          var along = ((x - centerX) * cosA + (y - centerY) * sinA) / scale;
          var pressureWave = Math.sin(along * Math.PI * (1.5 + pulse * 1.35) + phase);
          if (tool === 'brush') pressureWave = Math.sin(along * Math.PI * (0.72 + pulse * 0.54) + phase) * 0.72
            + Math.sin(along * Math.PI * (2.1 + pulse) - phase) * 0.28;
          var threshold = expansion + directional + pulseReach * pressureWave;
          var coverage = surfaceSmoothCoverage(signed + threshold, softness);
          if (tool === 'split' && coverage > 0.002 && (RC.sample(field.inside,width,height,x,y)>=.5)) {
            var across = (-(x - centerX) * sinA + (y - centerY) * cosA) / Math.max(4, scale * 0.42);
            var splitSignal = Math.abs(Math.sin(across * Math.PI));
            if (splitSignal < 0.08 + pulse * 0.012 && RC.sample(field.distance,width,height,x,y) > 1.2) {
              coverage *= Math.max(0, splitSignal / Math.max(0.01, 0.08 + pulse * 0.012));
            }
          }
          if (coverage <= 0.002) return;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * coverage * expansionAggregate.strength);

        });}
        work.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('calligraphicStress'), 1, 'calligraphic-stress-v26-color');
      }

      var CalligraphyField = (function () {
      // Half-alpha contours are supplied by the editor. This module never changes
      // them: only the nib orientation is regularized over contour arclength.
      function createCalligraphyContourQuery(contours, normalReach = 4) {
        if (!Number.isFinite(normalReach) || normalReach < 0) throw new RangeError('Invalid normal reach');
        const edges = [];
        for (const ring of contours) {
          const points = ring.points, arc = [0];
          if (!points || points.length < 3) continue;
          for (const p of points) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Invalid contour point');
          for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            arc.push(arc[arc.length - 1] + Math.hypot(b.x - a.x, b.y - a.y));
          }
          const total = arc[arc.length - 1]; if (total < 1e-8) continue;
          function at(s) {
            s = ((s % total) + total) % total;
            let lo = 0, hi = points.length;
            while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
            const a = points[lo], b = points[(lo + 1) % points.length];
            const t = (s - arc[lo]) / Math.max(1e-12, arc[lo + 1] - arc[lo]);
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          }
          const reach = Math.min(Math.max(1e-6, normalReach), total / 8);
          const normals = points.map((p, i) => {
            const a = at(arc[i] - reach), b = at(arc[i] + reach);
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            // In the y-down contour compiler ink is on the right, including holes.
            return length > 1e-12 ? { x: (b.y - a.y) / length, y: -(b.x - a.x) / length } : { x: 0, y: 0 };
          });
          for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
            if (len2 < 1e-16) continue;
            edges.push({ id: edges.length, x: a.x, y: a.y, dx, dy, len2, n0: normals[i], n1: normals[(i + 1) % points.length],
              minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) });
          }
        }
        function tree(items) {
          if (!items.length) return null;
          const node = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
          for (const e of items) { node.minX = Math.min(node.minX, e.minX); node.minY = Math.min(node.minY, e.minY); node.maxX = Math.max(node.maxX, e.maxX); node.maxY = Math.max(node.maxY, e.maxY); }
          if (items.length <= 8) { node.edges = items; return node; }
          const axis = node.maxX - node.minX >= node.maxY - node.minY ? 'X' : 'Y';
          items.sort((a, b) => a['min' + axis] + a['max' + axis] - b['min' + axis] - b['max' + axis] || a.id - b.id);
          const mid = items.length >> 1; node.left = tree(items.slice(0, mid)); node.right = tree(items.slice(mid)); return node;
        }
        const root = tree(edges);
        function box(node, x, y) {
          const dx = Math.max(node.minX - x, 0, x - node.maxX), dy = Math.max(node.minY - y, 0, y - node.maxY); return dx * dx + dy * dy;
        }
        return { bounds: root && [root.minX, root.minY, root.maxX, root.maxY], edgeCount: edges.length,
          createChordQuery(ux, uy) {
            const length = Math.hypot(ux, uy);
            if (!Number.isFinite(length) || length === 0) throw new RangeError('Invalid chord direction');
            ux /= length; uy /= length;
            // Project the existing full-resolution segments once per writing angle.
            // An ink chord is one nonzero-winding interval, never a bridge over a
            // counter or an unrelated component. This is not recovered pen ductus.
            function project(node) {
              if (!node) return null;
              if (node.edges) {
                const items = node.edges.map(e => ({u:e.x*ux+e.y*uy, v:-e.x*uy+e.y*ux,
                  du:e.dx*ux+e.dy*uy, dv:-e.dx*uy+e.dy*ux}));
                let min = Infinity, max = -Infinity;
                for (const e of items) { min=Math.min(min,e.v,e.v+e.dv); max=Math.max(max,e.v,e.v+e.dv); }
                return {min,max,items};
              }
              const left=project(node.left),right=project(node.right);
              return {min:Math.min(left.min,right.min),max:Math.max(left.max,right.max),left,right};
            }
            const projected=project(root),hits=[];
            return (x,y,out={}) => {
              if (!Number.isFinite(x)||!Number.isFinite(y)) throw new TypeError('Invalid chord point');
              const u=x*ux+y*uy,v=-x*uy+y*ux;
              hits.length=0; out.before=out.after=0; out.inside=false;
              function visit(node) {
                if (!node || v<node.min || v>=node.max) return;
                if (!node.items) { visit(node.left); visit(node.right); return; }
                for (const e of node.items) {
                  const end=e.v+e.dv;
                  if (!((e.v<=v&&v<end)||(end<=v&&v<e.v))) continue;
                  hits.push({u:e.u+(v-e.v)*e.du/e.dv,delta:e.dv>0?1:-1});
                }
              }
              visit(projected); hits.sort((a,b)=>a.u-b.u);
              let winding=0,start=0;
              for (let i=0;i<hits.length;) {
                const at=hits[i].u,previous=winding;
                // Shared vertices/tangencies change winding together. Tolerance only
                // covers floating arithmetic at coincident crossings, not geometry.
                const epsilon=32*Number.EPSILON*Math.max(1,Math.abs(at));
                do { winding+=hits[i++].delta; } while(i<hits.length&&Math.abs(hits[i].u-at)<=epsilon);
                if (!previous&&winding) start=at;
                if (previous&&!winding && start<=u&&u<at) {
                  out.before=u-start; out.after=at-u; out.inside=true; return out;
                }
              }
              return out;
            };
          },
          contains(x, y) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Invalid query point');
            let winding = 0;
            function visit(node) {
              if (!node || y < node.minY || y >= node.maxY || node.maxX <= x) return;
              if (!node.edges) { visit(node.left); visit(node.right); return; }
              for (const edge of node.edges) {
                const endY = edge.y + edge.dy;
                if (!((edge.y <= y && y < endY) || (endY <= y && y < edge.y))) continue;
                if (edge.x + (y - edge.y) * edge.dx / edge.dy > x) winding += edge.dy > 0 ? 1 : -1;
              }
            }
            visit(root); return winding !== 0;
          },
          query(x, y, out = {}) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Invalid query point');
            let best = Infinity, edge = null, fraction = 0;
            function visit(node) {
              if (!node || box(node, x, y) > best) return;
              if (node.edges) {
                for (const e of node.edges) {
                  const t = Math.max(0, Math.min(1, ((x - e.x) * e.dx + (y - e.y) * e.dy) / e.len2));
                  const dx = x - e.x - t * e.dx, dy = y - e.y - t * e.dy, d = dx * dx + dy * dy;
                  if (d < best || (d === best && (!edge || e.id < edge.id))) { best = d; edge = e; fraction = t; }
                }
              } else if (box(node.left, x, y) <= box(node.right, x, y)) { visit(node.left); visit(node.right); }
              else { visit(node.right); visit(node.left); }
            }
            visit(root); out.distance = Math.sqrt(best);
            const nx = edge ? edge.n0.x * (1 - fraction) + edge.n1.x * fraction : 0;
            const ny = edge ? edge.n0.y * (1 - fraction) + edge.n1.y * fraction : 0;
            const length = Math.hypot(nx, ny);
            out.nx = length > 1e-12 ? nx / length : edge ? edge.dy / Math.sqrt(edge.len2) : 0;
            out.ny = length > 1e-12 ? ny / length : edge ? -edge.dx / Math.sqrt(edge.len2) : 0;
            return out;
          }
        };
      }

      function buildCalligraphyContourField(contours, data, width, height, normalReach, padding) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) throw new RangeError('Invalid field dimensions');
        if (!Number.isFinite(padding) || padding < 0) throw new RangeError('Invalid field padding');
        const query = createCalligraphyContourQuery(contours, normalReach), count = width * height;
        const inside = new Uint8Array(count), distance = new Float32Array(count), nx = new Float32Array(count), ny = new Float32Array(count);
        // Preserve the existing signed-distance reader's +.5 convention. Values
        // outside the evaluated body+effect region are explicitly far outside.
        distance.fill(1e9);
        if (query.bounds) {
          const [x0, y0, x1, y1] = query.bounds, sample = {};
          const minX = Math.max(0, Math.floor(x0 - padding)), maxX = Math.min(width - 1, Math.ceil(x1 + padding));
          const minY = Math.max(0, Math.floor(y0 - padding)), maxY = Math.min(height - 1, Math.ceil(y1 + padding));
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const i = y * width + x; inside[i] = data[i * 4 + 3] > 127.5 ? 1 : 0;
            query.query(x + .5, y + .5, sample); distance[i] = sample.distance - .5; nx[i] = sample.nx; ny[i] = sample.ny;
          }
        }
        return { inside, distance, nx, ny, bounds: query.bounds };
      }

      function normalizeCalligraphyBodySettings(input = {}) {
        const number = (key, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(input[key]) ? input[key] : fallback));
        return { tool: ['broad', 'brush', 'split', 'chisel'].includes(input.tool) ? input.tool : 'broad',
          expansion: number('expansion', 0, -120, 260), contrast: number('contrast', .4, 0, 4),
          angle: number('angle', 32, -180, 180), pulse: number('pulse', .2, 0, 4), wetness: number('wetness', .2, 0, 1),
          fontSize: number('fontSize', 192, .001, 1e6) };
      }

      function prepareCalligraphyBody(contours, metrics = {}) {
        const query = createCalligraphyContourQuery(contours, 4), b = query.bounds;
        const value = (key, fallback) => Number.isFinite(metrics[key]) ? metrics[key] : fallback;
        return { query, bounds: b,
          centerX: value('centerX', b ? (b[0] + b[2]) / 2 : 0), centerY: value('centerY', b ? (b[1] + b[3]) / 2 : 0),
          halfW: Math.max(5, value('halfW', b ? (b[2] - b[0]) * .62 : 5)),
          halfH: Math.max(5, value('halfH', b ? (b[3] - b[1]) * .62 : 5)) };
      }

      function createCalligraphyBodySampler(body, input, phase = 0, antiAlias = 0) {
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

      function calligraphyInverseMatrix(matrix) {
        const {a,b,c,d,e,f}=matrix;
        if(![a,b,c,d,e,f].every(Number.isFinite))throw new RangeError('Calligraphy contains a non-finite transform');
        const determinant=a*d-b*c;if(determinant===0)return null;
        const result={a:d/determinant,b:-b/determinant,c:-c/determinant,d:a/determinant,e:(c*f-d*e)/determinant,f:(b*e-a*f)/determinant};
        if(!Object.values(result).every(Number.isFinite))throw new RangeError('Calligraphy transform exceeds numeric precision');
        return result;
      }

      function rasterCalligraphyBody(body, settings, phase, matrix, width, height, output, alpha = 1) {
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
      return { createCalligraphyContourQuery, buildCalligraphyContourField, normalizeCalligraphyBodySettings, prepareCalligraphyBody, createCalligraphyBodySampler, calligraphyInverseMatrix, rasterCalligraphyBody };
      })();

      var calligraphyGlyphCache = new Map();

      var calligraphyCachePoints = 0;

      var calligraphyFontRevision = 0;

      function calligraphyGlyphSettings(g) {
        var profile = g.surface || {};
        function number(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
        var tool = BATCH_PARAM_OPTIONS.calligraphyTool.indexOf(profile.calligraphyTool) >= 0 ? profile.calligraphyTool : params.calligraphyTool;
        return { tool: tool, expansion: number('calligraphyExpansion'), contrast: number('calligraphyContrast'),
          angle: number('calligraphyAngle'), pulse: number('calligraphyPulse'), wetness: number('calligraphyWetness'), fontSize: params.fontSize };
      }

      function calligraphyGlyphData(ch, g) {
        if (!String(ch || '').trim()) return null;
        var spec = g && g.fontAxes ? glyphFontSpec(g,768) : null, font = spec ? spec.font : params.fontWeight + ' 768px ' + params.fontFamily;
        var key = calligraphyFontRevision + ':' + (spec ? spec.key : font) + '\u0000' + ch;
        if (calligraphyGlyphCache.has(key)) {
          var cached = calligraphyGlyphCache.get(key);
          calligraphyGlyphCache.delete(key); calligraphyGlyphCache.set(key, cached); return cached;
        }
        var canvas = createRenderCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = font;
        var measure = ctx.measureText(ch), unit = 4;
        var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
        var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
        var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
        var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
        var width = left + right, height = ascent + descent;
        if (!Number.isFinite(width + height) || width > 4096 || height > 4096) throw new RangeError('Calligraphic Stress: 字形の高精度ソースが4096px上限を超えています。');
        canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
        ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
        var source = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        var count = 0;
        var contours = source.map(function (ring) {
          count += ring.points.length;
          return { points: ring.points.map(function (p) { return { x: (p.x - left) / unit, y: (p.y - ascent) / unit }; }) };
        });
        ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
        var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
          ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
        var result = { body: CalligraphyField.prepareCalligraphyBody(contours), advance: measure.width / unit,
          middleOffset: middleOffset, pointCount: count };
        // Bound retained source geometry, never the active text or Compose copies.
        // One oversized source is rendered uncached; no contour is resampled/dropped.
        if (count <= 262144) {
          while (calligraphyGlyphCache.size && (calligraphyGlyphCache.size >= 96 || calligraphyCachePoints + count > 262144)) {
            var oldest = calligraphyGlyphCache.keys().next().value;
            calligraphyCachePoints -= calligraphyGlyphCache.get(oldest).pointCount; calligraphyGlyphCache.delete(oldest);
          }
          calligraphyGlyphCache.set(key, result); calligraphyCachePoints += count;
        }
        return result;
      }

      function calligraphyEffectPad(glyphs) {
        if (surfaceOutputOpacity('calligraphicStress') <= .002) return 0;
        var extra = 0;
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i];
          if (surfaceGlyphStrength(g, 'calligraphicStress') <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
          var settings = calligraphyGlyphSettings(g); if (settings.tool === 'legacy') continue;
          settings = CalligraphyField.normalizeCalligraphyBodySettings(settings);
          var reach = Math.abs(settings.expansion) + settings.fontSize *
            (settings.contrast * (settings.tool === 'brush' ? .075 : .105) + settings.pulse * (settings.tool === 'brush' ? .052 : .032))
            + (.65 + settings.wetness * 3.1) * 3 + 7;
          var kx = Math.tan((g.skewX || 0) * Math.PI / 180), ky = Math.tan((g.skewY || 0) * Math.PI / 180);
          // Frobenius norm bounds every orientation, including negative scales.
          var stretch = Math.hypot(g.scaleX, ky * g.scaleX, kx * g.scaleY, g.scaleY);
          extra = Math.max(extra, reach * Math.SQRT2 * stretch + 4);
        }
        return extra;
      }

      function renderCalligraphicStress(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var hasModern = glyphs.some(function (g) {
          return surfaceGlyphStrength(g, 'calligraphicStress') > .002 && (g.opacity == null || g.opacity > .002)
            && String(g.ch || '').trim() && calligraphyGlyphSettings(g).tool !== 'legacy';
        });
        // Preserve the old renderer byte-for-byte for a wholly legacy scene.
        if (!hasModern) { renderCalligraphicStressLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase); return; }
        if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'calligraphicStress', width, height, pixelScale, L, fm), 'calligraphicStress', true);
        var work = surfaceScratch('calligraphic-stress-local-body', width, height, true);
        var output = work.ctx.createImageData(width, height), dirty = false, outputCalls = [];
        var phase = compositionState.enabled ? compositionState.phase : 0;
        function flush() {
          if (!dirty) return;
          work.ctx.putImageData(output, 0, 0);
          if(globalThis.TypeDeformerRenderContext)globalThis.TypeDeformerRenderContext.present(work.canvas,function(ctx,factor,presentation){
            var w=ctx.canvas.width,h=ctx.canvas.height,image=ctx.createImageData(w,h);
            outputCalls.forEach(function(call){var m=call.matrix,matrix={a:m.a*factor,b:m.b*factor,c:m.c*factor,d:m.d*factor,e:(m.e-presentation.originX)*factor,f:(m.f-presentation.originY)*factor};CalligraphyField.rasterCalligraphyBody(call.body,call.settings,phase,matrix,w,h,image.data,call.alpha);});
            ctx.resetTransform();ctx.putImageData(image,0,0);
          });
          outputCalls.length=0;
          paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('calligraphicStress'), 1, 'calligraphic-stress-local-color');
          output.data.fill(0); dirty = false;
        }
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i], strength = surfaceGlyphStrength(g, 'calligraphicStress');
          if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
          var settings = calligraphyGlyphSettings(g);
          if (settings.tool === 'legacy') {
            flush(); var legacy = [g];
            while (i + 1 < glyphs.length && calligraphyGlyphSettings(glyphs[i + 1]).tool === 'legacy') legacy.push(glyphs[++i]);
            renderCalligraphicStressLegacy(targetCtx, legacy, width, height, pixelScale, L, fm, false); continue;
          }
          var data = calligraphyGlyphData(g.ch,g); if (!data || !data.body.bounds) continue;
          work.ctx.save(); var matrix;
          try { spectralGlyphFrame(work.ctx, g, pixelScale, L, fm, data); matrix = work.ctx.getTransform(); }
          finally { work.ctx.restore(); }
          var result = CalligraphyField.rasterCalligraphyBody(data.body, settings, phase, matrix, width, height, output.data,
            strength * (g.opacity == null ? 1 : g.opacity));
          outputCalls.push({body:data.body,settings:settings,matrix:matrix,alpha:strength*(g.opacity==null?1:g.opacity)});
          dirty = dirty || result.pixels > 0;
        }
        flush();
      }
