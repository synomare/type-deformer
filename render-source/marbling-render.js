// Canonical marbling-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var MarblingType = (function () {
      // Lexical intrinsic bindings avoid repeated global-proxy lookups in hot interval arithmetic.
      var Math = globalThis.Math, Number = globalThis.Number, Object = globalThis.Object, Array = globalThis.Array;
      var performance = globalThis.performance;
      var modules = [];
      modules[0] = (function () {
      // Trial: integrate actual signed ink in the two anatomy sites' Voronoi cells.
      // Moments are measured around the tool site (not just its empty counter).
      function clipCell(points, site, other) {
        const nx = other.x - site.x, ny = other.y - site.y;
        if (nx === 0 && ny === 0) return points;
        const mx = site.x + nx / 2, my = site.y + ny / 2;
        const distance = p => (p.x - mx) * nx + (p.y - my) * ny;
        const out = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length], da = distance(a), db = distance(b);
          if (da <= 0) out.push(a);
          if ((da <= 0) !== (db <= 0)) {
            const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          }
        }
        return out;
      }

      function marblingInkSupport(rings, anchors) {
        if (!Array.isArray(rings) || !Array.isArray(anchors) || anchors.length !== 2) throw new TypeError('Expected rings and two sites');
        return Object.freeze(anchors.map((site, index) => {
          let area = 0, x = 0, y = 0, xx = 0, xy = 0, yy = 0;
          for (const ring of rings) {
            const points = clipCell(ring.points, site, anchors[1 - index]);
            for (let i = 0; i < points.length; i++) {
              const a = points[i], b = points[(i + 1) % points.length];
              const ax = a.x - site.x, ay = a.y - site.y, bx = b.x - site.x, by = b.y - site.y;
              const cross = ax * by - bx * ay;
              area += cross / 2; x += (ax + bx) * cross / 6; y += (ay + by) * cross / 6;
              xx += (ax * ax + ax * bx + bx * bx) * cross / 12;
              xy += (2 * ax * ay + ax * by + bx * ay + 2 * bx * by) * cross / 24;
              yy += (ay * ay + ay * by + by * by) * cross / 12;
            }
          }
          if (Math.abs(area) < 1e-10) return Object.freeze({ ...site, area: 0, radius: 1, stretch: 1, angle: 0, covariance: Object.freeze([0, 0, 0]), centroid: Object.freeze({ ...site }) });
          const momentXX = Math.max(0, xx / area), momentYY = Math.max(0, yy / area), momentXY = xy / area;
          const trace = momentXX + momentYY, split = Math.hypot(momentXX - momentYY, 2 * momentXY);
          const major = Math.max(0, (trace + split) / 2), minor = Math.max(0, (trace - split) / 2);
          const regularizer = Math.max(1e-8, trace * .08), a = major + regularizer, b = minor + regularizer;
          return Object.freeze({ ...site, area: Math.abs(area), radius: 2.4 * Math.pow(a * b, .25),
            stretch: Math.pow(a / b, .25), angle: split > trace * 1e-10 ? Math.atan2(2 * momentXY, momentXX - momentYY) / 2 : 0,
            covariance: Object.freeze([momentXX, momentXY, momentYY]), centroid: Object.freeze({ x: site.x + x / area, y: site.y + y / area }) });
        }));
      }
      return {marblingInkSupport};
      })();
      modules[1] = (function () {
      // Original, stateless glyph-material advection prototype. This is NOT a fluid
      // solver, a tracing of a reference font, or an editor-registered operator yet.
      // Elementary shears and radius-dependent twists have explicit inverses and
      // determinant one. Their composition preserves the continuous ink domain.
      // A polygonal approximation is a separate, tolerance-bounded representation.
      const { marblingInkSupport } = modules[0];
      const TAU = Math.PI * 2;
      const finite = (v, d, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;

      const MARBLING_MODES = Object.freeze(['rake', 'eddy', 'plume']);
      const MARBLING_PRESETS = Object.freeze({
        rake: Object.freeze({ mode: 'rake', amount: .65, pitch: 76, focus: .55, circulation: .9, angle: -18, motion: .55 }),
        eddy: Object.freeze({ mode: 'eddy', amount: .5, pitch: 118, focus: .35, circulation: 2.1, angle: -20, motion: .55 }),
        plume: Object.freeze({ mode: 'plume', amount: .75, pitch: 98, focus: .7, circulation: 1.8, angle: -12, motion: .55 }),
      });

      function normalizeMarblingSettings(input = {}) {
        const normalized = (() => {
        return Object.freeze({
          mode: MARBLING_MODES.includes(input.mode) ? input.mode : 'rake',
          amount: finite(input.amount, .65, 0, 4),
          pitch: finite(input.pitch, 76, 12, 180),
          focus: finite(input.focus, .55, 0, 1),
          circulation: finite(input.circulation, .9, -4, 4),
          angle: finite(input.angle, -18, -180, 180),
          motion: finite(input.motion, 0, 0, 1),
        });
      })();
        return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('marbling',input,normalized) : normalized;
      }

      function marblingSignedArea(points) {
        if (!points.length) return 0;
        const origin = points[0]; let sum = 0;
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          sum += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
        }
        return sum / 2;
      }

      function moments(points) {
        if (points.length < 3) return { area: 0, x: 0, y: 0 };
        const origin = points[0]; let twiceArea = 0, x = 0, y = 0;
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          const ax = a.x - origin.x, ay = a.y - origin.y, bx = b.x - origin.x, by = b.y - origin.y;
          const cross = ax * by - bx * ay;
          twiceArea += cross; x += (ax + bx) * cross; y += (ay + by) * cross;
        }
        return Math.abs(twiceArea) < 1e-12 ? { area: 0, x: origin.x, y: origin.y }
          : { area: twiceArea / 2, x: origin.x + x / (3 * twiceArea), y: origin.y + y / (3 * twiceArea) };
      }

      // Signed polygon moments after clipping to a half-plane recover actual ink
      // mass above/below the glyph centre, including counter subtraction. No random
      // glyph hash or ornamental points substitute for the source anatomy.
      function halfPlane(points, axisY, sign) {
        const out = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          const insideA = sign * (a.y - axisY) >= 0, insideB = sign * (b.y - axisY) >= 0;
          if (insideA) out.push(a);
          if (insideA !== insideB) {
            const t = (axisY - a.y) / (b.y - a.y);
            out.push({ x: a.x + (b.x - a.x) * t, y: axisY });
          }
        }
        return out;
      }

      function anatomyAnchors(rings, cx, cy) {
        const dominant = rings.reduce((best, ring) => Math.abs(ring.area) > Math.abs(best?.area || 0) ? ring : best, null);
        const orientation = Math.sign(dominant?.area || 1);
        const holes = rings.filter(ring => ring.area * orientation < -1e-6)
          .map(ring => moments(ring.points)).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
        const halves = [-1, 1].map(sign => {
          let area = 0, x = 0, y = 0;
          for (const ring of rings) {
            const part = moments(halfPlane(ring.points, cy, sign));
            area += part.area; x += (part.x - cx) * part.area; y += (part.y - cy) * part.area;
          }
          return Math.abs(area) > 1e-8 ? { x: cx + x / area, y: cy + y / area } : { x: cx, y: cy };
        });
        let anchors;
        if (holes.length >= 2) anchors = holes.slice(0, 2);
        else if (holes.length === 1) {
          const hole = holes[0];
          const other = halves.reduce((a, b) => Math.hypot(a.x - hole.x, a.y - hole.y) > Math.hypot(b.x - hole.x, b.y - hole.y) ? a : b);
          anchors = [hole, other];
        } else anchors = halves;
        return Object.freeze(anchors.sort((a, b) => a.y - b.y || a.x - b.x).map(p => Object.freeze({ x: p.x, y: p.y })));
      }

      function prepareMarblingGlyph(contours) {
        if (!Array.isArray(contours)) throw new TypeError('Marbling: contours must be an array');
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
        const rings = contours.map(contour => {
          if (!Array.isArray(contour?.points) || contour.points.length < 3) throw new TypeError('Marbling: each ring needs at least three points');
          const points = contour.points.map(point => {
            if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new TypeError('Marbling: non-finite source coordinate');
            if (++count > 131072) throw new RangeError('Marbling: source point budget exceeded');
            minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
            return Object.freeze({ x: point.x, y: point.y });
          });
          return Object.freeze({ points: Object.freeze(points), area: marblingSignedArea(points) });
        });
        const cx = count ? minX + (maxX - minX) / 2 : 0;
        const cy = count ? minY + (maxY - minY) / 2 : 0;
        if (![cx, cy, maxX - minX, maxY - minY].every(Number.isFinite) && count) throw new RangeError('Marbling: source extent overflow');
        const anchors = anatomyAnchors(rings, cx, cy);
        return Object.freeze({ rings: Object.freeze(rings), cx, cy,
          anchors, eddySites: marblingInkSupport(rings, anchors),
          width: count ? maxX - minX : 0, height: count ? maxY - minY : 0, pointCount: count });
      }

      // Small outward allowance mitigates double precision rounding; these are
      // numerical interval estimates, not a machine-checked exact-arithmetic proof.
      const outward = (lo, hi) => {
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-Infinity, Infinity];
        const pad = (1 + Math.max(Math.abs(lo), Math.abs(hi))) * Number.EPSILON * 8;
        return [lo - pad, hi + pad];
      };
      const iadd = (a, b) => outward(a[0] + b[0], a[1] + b[1]);
      const ineg = a => [-a[1], -a[0]];
      const iscale = (a, s) => s === 0 ? [0, 0] : s > 0 ? outward(a[0] * s, a[1] * s) : outward(a[1] * s, a[0] * s);
      function imul(a, b) {
        const aa = a[0] * b[0], ab = a[0] * b[1], ba = a[1] * b[0], bb = a[1] * b[1];
        if (Number.isNaN(aa) || Number.isNaN(ab) || Number.isNaN(ba) || Number.isNaN(bb)) return [-Infinity, Infinity];
        return outward(Math.min(aa, ab, ba, bb), Math.max(aa, ab, ba, bb));
      }
      function isquare(a) {
        return outward(a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(a[0] ** 2, a[1] ** 2), Math.max(a[0] ** 2, a[1] ** 2));
      }
      function isin(a) {
        if (!a.every(Number.isFinite) || a[1] - a[0] >= TAU) return [-1, 1];
        let lo = Math.min(Math.sin(a[0]), Math.sin(a[1])), hi = Math.max(Math.sin(a[0]), Math.sin(a[1]));
        const first = Math.ceil((a[0] - Math.PI / 2) / Math.PI);
        const last = Math.floor((a[1] - Math.PI / 2) / Math.PI);
        for (let k = first; k <= last; k++) if (k % 2 === 0) hi = 1; else lo = -1;
        return outward(lo, hi);
      }
      const icos = a => isin(iadd(a, [Math.PI / 2, Math.PI / 2]));
      const iexp = a => outward(Math.exp(a[0]), Math.exp(a[1]));
      const imax = a => Math.max(Math.abs(a[0]), Math.abs(a[1]));
      const jet = (a, b) => ({ v: [Math.min(a, b), Math.max(a, b)], d: [b - a, b - a], dd: [0, 0] });
      const add = (a, b) => ({ v: iadd(a.v, b.v), d: iadd(a.d, b.d), dd: iadd(a.dd, b.dd) });
      const scale = (a, s) => ({ v: iscale(a.v, s), d: iscale(a.d, s), dd: iscale(a.dd, s) });
      // Constant translation needs no temporary constant jet. Keep even the +0
      // operations and outward allowances, so every interval endpoint is unchanged.
      const shift = (a, b) => ({
        v: outward(a.v[0] + b, a.v[1] + b),
        d: outward(a.d[0] + 0, a.d[1] + 0),
        dd: outward(a.dd[0] + 0, a.dd[1] + 0),
      });
      function multiply(a, b) {
        return { v: imul(a.v, b.v), d: iadd(imul(a.d, b.v), imul(a.v, b.d)),
          dd: iadd(iadd(imul(a.dd, b.v), iscale(imul(a.d, b.d), 2)), imul(a.v, b.dd)) };
      }
      function square(a) {
        return { v: isquare(a.v), d: iscale(imul(a.v, a.d), 2), dd: iscale(iadd(isquare(a.d), imul(a.v, a.dd)), 2) };
      }
      function unary(a, v, derivative, second) {
        return { v, d: imul(derivative, a.d), dd: iadd(imul(second, isquare(a.d)), imul(derivative, a.dd)) };
      }
      function sinCos(a) {
        const s = isin(a.v), c = icos(a.v);
        return { sin: unary(a, s, c, ineg(s)), cos: unary(a, c, ineg(s), ineg(c)) };
      }
      const exp = a => { const value = iexp(a.v); return unary(a, value, value, value); };

      function shear(cx, cy, angle, amplitude, pitch, focus, phase) {
        const co = Math.cos(angle), si = Math.sin(angle), frequency = TAU / pitch;
        const k = focus * 5;
        // Normalise peak displacement, so Focus narrows the flow instead of merely
        // making every deformation disappear as its envelope becomes narrower.
        const z = k ? 2 * k / (1 + Math.sqrt(1 + 4 * k * k)) : 0;
        const gain = 1 / (Math.sqrt(1 - z * z) * Math.exp(k * (z - 1)));
        function apply(point, sign = 1) {
          const y = -(point.x - cx) * si + (point.y - cy) * co;
          const t = y * frequency + phase;
          const d = sign * amplitude * gain * Math.sin(t) * Math.exp(k * (Math.cos(t) - 1));
          return { x: point.x + co * d, y: point.y + si * d };
        }
        function bound(point) {
          const y = add(scale(shift(point.x, -cx), -si), scale(shift(point.y, -cy), co));
          const t = shift(scale(y, frequency), phase);
          const trig = sinCos(t);
          const displacement = scale(multiply(trig.sin, exp(scale(shift(trig.cos, -1), k))), amplitude * gain);
          return { x: add(point.x, scale(displacement, co)), y: add(point.y, scale(displacement, si)) };
        }
        function boxDerivative(box) {
          const x = iadd(box[0], [-cx, -cx]), y = iadd(box[1], [-cy, -cy]);
          const t = iadd(iscale(iadd(iscale(x, -si), iscale(y, co)), frequency), [phase, phase]);
          const sine = isin(t), cosine = icos(t), envelope = iexp(iscale(iadd(cosine, [-1, -1]), k));
          const displacement = iscale(imul(sine, envelope), amplitude * gain);
          const slope = iscale(imul(envelope, iadd(cosine, iscale(isquare(sine), -k))), amplitude * gain * frequency);
          const slopeBound = imax(slope);
          return { norm: (Math.hypot(2, slopeBound) + slopeBound) / 2,
            box: [iadd(box[0], iscale(displacement, co)), iadd(box[1], iscale(displacement, si))],
            matrix: [iadd([1, 1], iscale(slope, -co * si)), iscale(slope, -si * si),
              iscale(slope, co * co), iadd([1, 1], iscale(slope, si * co))] };
        }
        return { apply, bound, boxDerivative, kind: 'shear', amplitude, pitch };
      }

      function twist(cx, cy, radius, strength) {
        const falloff = -.5 / (radius * radius);
        function apply(point, sign = 1) {
          const x = point.x - cx, y = point.y - cy;
          const angle = sign * strength * Math.exp((x * x + y * y) * falloff);
          const co = Math.cos(angle), si = Math.sin(angle);
          return { x: cx + x * co - y * si, y: cy + x * si + y * co };
        }
        function bound(point) {
          const x = shift(point.x, -cx), y = shift(point.y, -cy);
          const angle = scale(exp(scale(add(square(x), square(y)), falloff)), strength);
          const trig = sinCos(angle), co = trig.cos, si = trig.sin;
          return { x: shift(add(multiply(x, co), scale(multiply(y, si), -1)), cx),
            y: shift(add(multiply(x, si), multiply(y, co)), cy) };
        }
        function boxDerivative(box) {
          const x = iadd(box[0], [-cx, -cx]), y = iadd(box[1], [-cy, -cy]);
          const radius2 = iadd(isquare(x), isquare(y));
          const angle = iscale(iexp(iscale(radius2, falloff)), strength);
          const co = icos(angle), si = isin(angle);
          const tx = iadd(imul(x, co), ineg(imul(y, si))), ty = iadd(imul(x, si), imul(y, co));
          const gx = iscale(imul(x, angle), 2 * falloff), gy = iscale(imul(y, angle), 2 * falloff);
          // In polar coordinates this derivative is a shear of r*phi'(r), between
          // orthogonal frames. q*exp(-q/2) peaks at q=2; retain this independent cap
          // when the rectangular interval Jacobian becomes excessively wide.
          const q0 = Math.max(0, radius2[0] / (radius * radius)), q1 = Math.max(0, radius2[1] / (radius * radius));
          const profile = q => Number.isFinite(q) ? q * Math.exp(-q / 2) : 0;
          const shearBound = Math.abs(strength) * Math.max(profile(q0), profile(q1), q0 <= 2 && q1 >= 2 ? 2 / Math.E : 0) * (1 + 32 * Number.EPSILON);
          return { norm: (Math.hypot(2, shearBound) + shearBound) / 2,
            box: [iadd(tx, [cx, cx]), iadd(ty, [cy, cy])],
            matrix: [iadd(co, ineg(imul(ty, gx))), iadd(si, imul(tx, gx)),
              ineg(iadd(si, imul(ty, gy))), iadd(co, imul(tx, gy))] };
        }
        return { apply, bound, boxDerivative, kind: 'twist', radius, strength };
      }

      // Conjugate a circular twist by an invertible area-neutral local frame. This
      // remains a planar bijection with an explicit inverse and determinant one;
      // anisotropy is in the field, not an extra scale applied to the final glyph.
      function ellipticTwist(cx, cy, radius, strength, angle, stretch) {
        const co = Math.cos(angle), si = Math.sin(angle), q = stretch;
        const m = [co * q, si * q, -si / q, co / q];
        const inv = [co / q, -si * q, si / q, co * q];
        const circular = twist(0, 0, radius, strength);
        const linear = (matrix, x, y) => [matrix[0] * x + matrix[2] * y, matrix[1] * x + matrix[3] * y];
        const range = (matrix, box) => [iadd(iscale(box[0], matrix[0]), iscale(box[1], matrix[2])),
          iadd(iscale(box[0], matrix[1]), iscale(box[1], matrix[3]))];
        const jets = (matrix, point) => ({ x: add(scale(point.x, matrix[0]), scale(point.y, matrix[2])),
          y: add(scale(point.x, matrix[1]), scale(point.y, matrix[3])) });
        function apply(point, sign = 1) {
          const [x, y] = linear(inv, point.x - cx, point.y - cy);
          const moved = circular.apply({ x, y }, sign), [dx, dy] = linear(m, moved.x, moved.y);
          return { x: cx + dx, y: cy + dy };
        }
        function bound(point) {
          const local = jets(inv, { x: shift(point.x, -cx), y: shift(point.y, -cy) });
          const mapped = jets(m, circular.bound(local));
          return { x: shift(mapped.x, cx), y: shift(mapped.y, cy) };
        }
        function boxDerivative(box) {
          const localBox = range(inv, [iadd(box[0], [-cx, -cx]), iadd(box[1], [-cy, -cy])]);
          const local = circular.boxDerivative(localBox), j = local.matrix;
          const right = [iadd(iscale(j[0], inv[0]), iscale(j[2], inv[1])),
            iadd(iscale(j[1], inv[0]), iscale(j[3], inv[1])),
            iadd(iscale(j[0], inv[2]), iscale(j[2], inv[3])),
            iadd(iscale(j[1], inv[2]), iscale(j[3], inv[3]))];
          const matrix = [iadd(iscale(right[0], m[0]), iscale(right[1], m[2])),
            iadd(iscale(right[0], m[1]), iscale(right[1], m[3])),
            iadd(iscale(right[2], m[0]), iscale(right[3], m[2])),
            iadd(iscale(right[2], m[1]), iscale(right[3], m[3]))];
          const output = range(m, local.box);
          return { norm: local.norm * Math.max(q, 1 / q) ** 2, matrix,
            box: [iadd(output[0], [cx, cx]), iadd(output[1], [cy, cy])] };
        }
        return { apply, bound, boxDerivative, kind: 'elliptic-twist' };
      }

      function createMarblingMap(glyph, input, phase = 0) {
        const settings = normalizeMarblingSettings(input);
        const phase01 = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
        const time = phase01 * TAU, wave = Math.sin(time), breath = 1 - settings.motion * .22 * (1 - Math.cos(time));
        const angle = settings.angle * Math.PI / 180 + settings.motion * .25 * wave;
        const amount = settings.amount * breath;
        const pitch = settings.pitch, focus = settings.focus, circulation = settings.circulation;
        const amplitude = amount * pitch * .52, offset = settings.motion * wave * .9;
        const { cx, cy } = glyph;
        const operations = [];
        // Later tools act at transported anatomy sites. Eddy's footprint measures
        // surrounding ink, not just a possibly tiny empty counter; Plume retains
        // its original circular field and stage sequence.
        const anatomyAt = index => {
          let point = glyph.anchors[index];
          for (const operation of operations) point = operation.apply(point);
          return [point.x, point.y];
        };
        if (settings.amount !== 0 && glyph.rings.length) {
          if (settings.mode === 'rake') {
            operations.push(shear(cx, cy, angle, amplitude, pitch, focus, offset));
            operations.push(shear(cx, cy, angle + Math.PI / 2, amplitude * .22 * circulation, pitch * 1.7, focus * .3, 1.1 - offset));
            operations.push(shear(cx, cy, angle, -amplitude * .38, pitch * 1.12, focus, 1.7 + offset));
          } else if (settings.mode === 'eddy') {
            // Split the first tool around the second: a single final full vortex
            // otherwise overwhelms the two source sites with one common envelope.
            // Total signed strengths are unchanged. Each revisit follows its source
            // anchor through ALL previous tools; it is not a frozen canvas centre.
            for (const [i, fraction] of [[0, .5], [1, 1], [0, .5]]) {
              const site = glyph.eddySites[i], centre = anatomyAt(i);
              operations.push(ellipticTwist(...centre, site.radius * pitch / 118 * (1 - focus * .45),
                amount * circulation * (i ? -2 : 2.5) * fraction, site.angle + angle, site.stretch));
            }
            operations.push(shear(cx, cy, angle, amplitude * .18, pitch * 1.8, focus * .25, offset));
          } else {
            operations.push(shear(cx, cy, angle + Math.PI / 2, amplitude * 1.1, pitch, focus, .6 + offset));
            operations.push(twist(...anatomyAt(0), pitch * .68, amount * circulation * 1.4));
            operations.push(shear(cx, cy, angle, -amplitude * .8, pitch * 1.45, focus * .55, .8 - offset));
            operations.push(twist(...anatomyAt(1), pitch * .4, -amount * circulation * .7));
          }
        }
        function map(point) {
          let result = { x: point.x, y: point.y };
          for (const operation of operations) result = operation.apply(result);
          return result;
        }
        function inverse(point) {
          let result = { x: point.x, y: point.y };
          for (let i = operations.length - 1; i >= 0; i--) result = operations[i].apply(result, -1);
          return result;
        }
        function chordErrorBound(a, b) {
          if (!operations.length || a.x === b.x && a.y === b.y) return 0;
          // Local t always ranges 0..1 on THIS source segment. Composition of second
          // derivative interval jets bounds its mapped chord deviation by M / 8.
          let point = { x: jet(a.x - cx, b.x - cx), y: jet(a.y - cy, b.y - cy) };
          point = { x: shift(point.x, cx), y: shift(point.y, cy) };
          for (const operation of operations) point = operation.bound(point);
          return Math.hypot(imax(point.x.dd), imax(point.y.dd)) / 8;
        }
        function derivativeBoundForBox(box) {
          if (!operations.length) return 1;
          let range = [[box[0], box[2]], [box[1], box[3]]];
          let jacobian = [[1, 1], [0, 0], [0, 0], [1, 1]];
          let normProduct = 1;
          for (const operation of operations) {
            const local = operation.boxDerivative(range), m = local.matrix, j = jacobian;
            normProduct *= local.norm;
            jacobian = [iadd(imul(m[0], j[0]), imul(m[2], j[1])),
              iadd(imul(m[1], j[0]), imul(m[3], j[1])),
              iadd(imul(m[0], j[2]), imul(m[2], j[3])),
              iadd(imul(m[1], j[2]), imul(m[3], j[3]))];
            range = local.box;
          }
          // |Jv| <= abs(J) abs(v): the spectral norm of the entrywise upper
          // magnitudes bounds EVERY derivative in the propagated source box.
          const [a, b, c, d] = jacobian.map(imax), magnitude = Math.max(a, b, c, d);
          if (!Number.isFinite(magnitude)) return normProduct;
          if (magnitude === 0) return 0;
          const aa = (a / magnitude) ** 2 + (b / magnitude) ** 2;
          const cc = (c / magnitude) ** 2 + (d / magnitude) ** 2;
          const ac = (a / magnitude) * (c / magnitude) + (b / magnitude) * (d / magnitude);
          return Math.min(normProduct, magnitude * Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2));
        }
        return Object.freeze({ map, inverse, chordErrorBound, derivativeBoundForBox, settings,
          identity: operations.length === 0, operations: operations.map(({ kind }) => kind), phase: phase01 });
      }

      function deformMarblingGlyph(glyph, input, phase = 0, options = {}) {
        const transform = createMarblingMap(glyph, input, phase);
        const tolerance = finite(options.tolerance, .08, .00001, 10);
        const maxPoints = Math.floor(finite(options.maxPoints, 131072, 3, 1000000));
        const maxDepth = Math.floor(finite(options.maxDepth, 22, 0, 28));
        let pointCount = 0, subdivisions = 0, maxErrorBound = 0;
        const fail = () => { throw new RangeError('Marbling geometry budget exceeded; no truncated output returned'); };
        const rings = glyph.rings.map(ring => {
          const points = [], material = [];
          function edge(a, b, mappedA, u0, u1, depth) {
            const error = transform.chordErrorBound(a, b);
            if (!(error <= tolerance)) {
              if (depth >= maxDepth || pointCount >= maxPoints) fail();
              const mid = { x: a.x + (b.x - a.x) / 2, y: a.y + (b.y - a.y) / 2 }, um = (u0 + u1) / 2;
              subdivisions++;
              edge(a, mid, mappedA, u0, um, depth + 1);
              edge(mid, b, transform.map(mid), um, u1, depth + 1);
            } else {
              if (++pointCount > maxPoints) fail();
              if (!Number.isFinite(mappedA.x) || !Number.isFinite(mappedA.y)) throw new RangeError('Marbling: non-finite transformed geometry');
              points.push(mappedA); material.push(u0); maxErrorBound = Math.max(maxErrorBound, error);
            }
          }
          for (let i = 0; i < ring.points.length; i++) {
            const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
            edge(a, b, transform.map(a), i, i + 1, 0);
          }
          return { points, material, area: marblingSignedArea(points), sourceArea: ring.area };
        });
        return { rings, pointCount, subdivisions, maxErrorBound, tolerance, identity: transform.identity };
      }
      return {MARBLING_MODES,MARBLING_PRESETS,normalizeMarblingSettings,marblingSignedArea,prepareMarblingGlyph,createMarblingMap,deformMarblingGlyph};
      })();
      modules[2] = (function () {
      const { createMarblingMap } = modules[1];

      // Retains every original point. Nodes only APPROXIMATE an arc when the source
      // error transported through the current map, plus its chord curvature, fits
      // the requested destination error. No fixed thinning or smoothing of the font.
      // The same source hierarchy as synchronous compilation, suspended within a
      // node's point scan (not merely between whole glyphs). The glyph must already
      // be an immutable prepareMarblingGlyph result; capture/ink analysis is separate.
      function createMarblingCompileTask(glyph) {
        if (!glyph?.rings || !Object.isFrozen(glyph)) throw new TypeError('An immutable prepared Marbling glyph is required');
        const progress = { nodeCount: 0, visitedPoints: 0, workCount: 0 };
        let source = glyph, state = 'working', result = null, error = null;
        let trees = [], roots = [], stack = [], ringIndex = 0, rootIndex = 0;
        function push(start, end) {
          const points = source.rings[ringIndex].points, n = points.length;
          const a = points[start % n], b = points[end % n], dx = b.x - a.x, dy = b.y - a.y;
          stack.push({ start, end, a, b, dx, dy, length2: dx * dx + dy * dy, index: start,
            box: [Infinity, Infinity, -Infinity, -Infinity], error2: 0, stage: 0, left: null, right: null });
        }
        function nextRoot() {
          if (ringIndex >= source.rings.length) {
            result = Object.freeze({ glyph: source, trees: Object.freeze(trees), nodeCount: progress.nodeCount });
            source = null; state = 'complete'; trees = []; return;
          }
          const count = source.rings[ringIndex].points.length, divisions = Math.min(4, count);
          push(Math.floor(rootIndex * count / divisions), Math.floor((rootIndex + 1) * count / divisions));
        }
        function release() { source = null; trees = []; roots = []; stack = []; }
        nextRoot();
        return Object.freeze({
          get status() { return state; }, get result() { return result; }, get error() { return error; },
          get progress() { return { ...progress, state }; },
          cancel(reason = abortError()) {
            if (state !== 'working') return false;
            release(); state = 'cancelled'; error = reason; return true;
          },
          step({ maxWork = 2048, maxMs = 4, now = () => performance.now() } = {}) {
            if (state !== 'working') return state;
            const budget = Math.floor(limit(maxWork, 2048, 1, 1e7)), duration = limit(maxMs, Infinity, 0, 60000);
            const started = Number.isFinite(duration) ? now() : 0;
            try {
              let work = 0;
              while (state === 'working' && work < budget) {
                const node = stack[stack.length - 1];
                if (node.stage === 0) {
                  const points = source.rings[ringIndex].points, count = points.length;
                  const visits = Math.min(budget - work, node.end - node.index + 1,
                    Number.isFinite(duration) ? duration === 0 ? 1 : 32 - work % 32 : Infinity);
                  const { a, dx, dy, length2, box } = node;
                  let error2 = node.error2;
                  for (let i = 0; i < visits; i++) {
                    const p = points[node.index++ % count];
                    box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y);
                    box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y);
                    const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
                    error2 = Math.max(error2, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
                  }
                  node.error2 = error2; work += visits; progress.workCount += visits; progress.visitedPoints += visits;
                  if (node.index > node.end) { node.stage = 1; progress.nodeCount++; }
                  // At most 32 visits between clock checks. This is cooperative work,
                  // not a hard wall-time deadline or a guarantee about GC pauses.
                  if (Number.isFinite(duration) && (duration === 0 || work % 32 === 0) && now() - started >= duration) break;
                } else if (node.stage === 1 && node.end - node.start > 1) {
                  node.stage = 2; push(node.start, Math.floor((node.start + node.end) / 2));
                } else if (node.stage === 2) {
                  node.stage = 3; push(Math.floor((node.start + node.end) / 2), node.end);
                } else {
                  const data = Object.freeze({ start: node.start, end: node.end, a: node.a, b: node.b,
                    box: Object.freeze(node.box), sourceError: Math.sqrt(node.error2), left: node.left, right: node.right });
                  stack.pop();
                  const parent = stack[stack.length - 1];
                  if (parent) { if (parent.stage === 2) parent.left = data; else parent.right = data; }
                  else {
                    roots.push(data); rootIndex++;
                    if (rootIndex === Math.min(4, source.rings[ringIndex].points.length)) {
                      trees.push(Object.freeze(roots)); roots = []; rootIndex = 0; ringIndex++;
                    }
                    nextRoot();
                  }
                }
              }
            } catch (failure) { release(); state = 'error'; error = failure; throw failure; }
            return state;
          },
        });
      }

      function compileMarblingGlyph(glyph) {
        // Keep the original synchronous fast path for callers that intentionally
        // perform offline work. The resumable path is independently parity-tested.
        let nodeCount = 0;
        const trees = glyph.rings.map(ring => {
          const source = ring.points, count = source.length;
          function build(start, end) {
            const a = source[start % count], b = source[end % count];
            const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
            const box = [Infinity, Infinity, -Infinity, -Infinity];
            let error2 = 0;
            for (let i = start; i <= end; i++) {
              const p = source[i % count];
              box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y);
              box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y);
              const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
              error2 = Math.max(error2, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
            }
            const middle = Math.floor((start + end) / 2); nodeCount++;
            return Object.freeze({ start, end, a, b, box: Object.freeze(box), sourceError: Math.sqrt(error2),
              left: end - start > 1 ? build(start, middle) : null, right: end - start > 1 ? build(middle, end) : null });
          }
          const roots = [], divisions = Math.min(4, count);
          for (let i = 0; i < divisions; i++) roots.push(build(Math.floor(i * count / divisions), Math.floor((i + 1) * count / divisions)));
          return Object.freeze(roots);
        });
        return Object.freeze({ glyph, trees: Object.freeze(trees), nodeCount });
      }

      const limit = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
      const abortError = () => Object.assign(new Error('Marbling computation cancelled'), { name: 'AbortError' });

      function createMarblingLodTask(compiled, settings, phase = 0, options = {}) {
        const tolerance = limit(options.tolerance, .08, .00001, 10);
        const maxPoints = Math.floor(limit(options.maxPoints, 262144, 3, 1000000));
        const maxDepth = Math.floor(limit(options.maxDepth, 22, 0, 28));
        let source = compiled, transform = createMarblingMap(compiled.glyph, settings, phase);
        let state = 'working', result = null, error = null, ringIndex = 0;
        let points = [], spans = [], rings = [], stack = [], origin = null, previous = null, twiceArea = 0;
        let pointCount = 0, visitedNodes = 0, mappedPoints = 0, maxErrorBound = 0, workCount = 0;
        const identity = transform.identity;
        function pushRing() {
          if (ringIndex >= source.glyph.rings.length) {
            result = Object.freeze({ rings: Object.freeze(rings), pointCount, visitedNodes, mappedPoints, maxErrorBound, tolerance, identity });
            state = 'complete'; source = null; transform = null; stack = [];
            return;
          }
          if (identity) {
            const ring = source.glyph.rings[ringIndex];
            for (let i = ring.points.length - 1; i >= 0; i--) stack.push({ native: true, a: ring.points[i], start: i, end: i + 1 });
          } else for (let i = source.trees[ringIndex].length - 1; i >= 0; i--) stack.push(source.trees[ringIndex][i]);
        }
        function release() {
          source = null; transform = null; points = []; spans = []; rings = []; stack = []; origin = null; previous = null;
        }
        function fail(message) { throw new RangeError(`Marbling ${message}; no truncated output returned`); }
        function emit(a, start, end, bound) {
          if (++pointCount > maxPoints) fail('geometry budget exceeded');
          mappedPoints++;
          const point = Object.freeze(transform.map(a));
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) fail('non-finite transformed geometry');
          if (!origin) origin = point;
          if (previous) twiceArea += (previous.x - origin.x) * (point.y - origin.y) - (point.x - origin.x) * (previous.y - origin.y);
          previous = point;
          points.push(point); spans.push(Object.freeze([start, end])); maxErrorBound = Math.max(maxErrorBound, bound);
        }
        function advance(node) {
          visitedNodes++;
          if (node.native) { emit(node.a, node.start, node.end, 0); return; }
          if (node.left) {
            const sourceBound = node.sourceError === 0 ? 0 : node.sourceError * transform.derivativeBoundForBox(node.box);
            // If the original arc alone cannot fit, do not spend a Hessian pass
            // testing its chord. Descend without compromising the source error.
            if (sourceBound <= tolerance) {
              const bound = sourceBound + transform.chordErrorBound(node.a, node.b);
              if (bound <= tolerance) { emit(node.a, node.start, node.end, bound); return; }
            }
            stack.push(node.right, node.left);
            return;
          }
          const bound = transform.chordErrorBound(node.a, node.b);
          if (bound <= tolerance) { emit(node.a, node.start, node.end, bound); return; }
          const depth = node.depth || 0;
          if (depth >= maxDepth || pointCount >= maxPoints) fail('geometry budget exceeded');
          const middle = { x: node.a.x + (node.b.x - node.a.x) / 2, y: node.a.y + (node.b.y - node.a.y) / 2 };
          const u = (node.start + node.end) / 2;
          stack.push({ a: middle, b: node.b, start: u, end: node.end, depth: depth + 1 },
            { a: node.a, b: middle, start: node.start, end: u, depth: depth + 1 });
        }
        pushRing();
        return Object.freeze({
          get status() { return state; },
          get error() { return error; },
          get result() { return result; },
          get progress() { return { state, pointCount, visitedNodes, workCount, ringIndex, pendingNodes: stack.length }; },
          cancel(reason = abortError()) {
            if (state !== 'working') return false;
            error = reason; state = 'cancelled'; release(); return true;
          },
          step({ maxWork = 128, maxMs = Infinity, now = () => performance.now() } = {}) {
            if (state !== 'working') return state;
            const budget = Math.floor(limit(maxWork, 128, 1, 1e7));
            const duration = limit(maxMs, Infinity, 0, 60000), started = now();
            try {
              for (let work = 0; work < budget && state === 'working'; work++) {
                const node = stack.pop(); workCount++; advance(node);
                if (!stack.length) {
                  rings.push(Object.freeze({ points: Object.freeze(points), spans: Object.freeze(spans),
                    sourceArea: source.glyph.rings[ringIndex].area, area: twiceArea / 2 }));
                  points = []; spans = []; origin = null; previous = null; twiceArea = 0; ringIndex++; pushRing();
                }
                if (now() - started >= duration) break;
              }
            } catch (failure) { error = failure; state = 'error'; release(); throw failure; }
            return state;
          },
        });
      }

      function renderMarblingLod(compiled, settings, phase = 0, options = {}) {
        const task = createMarblingLodTask(compiled, settings, phase, options);
        while (task.status === 'working') task.step({ maxWork: 65536 });
        return task.result;
      }

      // Genuine task yielding, not a Promise.resolve microtask loop. The scheduler
      // API is optional; a timer works on runtimes/Safari without scheduler.yield.
      function yieldMarblingWork() {
        return globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
      }

      async function runMarblingLodTask(task, { signal, yieldWork = yieldMarblingWork, maxWork = 96, maxMs = 4 } = {}) {
        let rejectAbort;
        const aborted = new Promise((_, reject) => { rejectAbort = reject; });
        // A rejection may occur before the first yield; attach a handler immediately.
        aborted.catch(() => {});
        const onAbort = () => { const reason = signal.reason === undefined ? abortError() : signal.reason; task.cancel(reason); rejectAbort(reason); };
        if (signal?.aborted) { task.cancel(signal.reason); throw signal.reason; }
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          while (task.status === 'working') {
            task.step({ maxWork, maxMs });
            if (task.status === 'working') await Promise.race([Promise.resolve().then(yieldWork), aborted]);
          }
          if (signal?.aborted) throw signal.reason;
          if (task.status !== 'complete') throw task.error;
          return task.result;
        } catch (failure) { task.cancel(failure); throw failure; }
        finally { signal?.removeEventListener('abort', onAbort); }
      }

      function marblingPixelTolerance(matrix, pixelError = .2) {
        const { a, b, c, d } = matrix;
        if (![a, b, c, d, pixelError].every(Number.isFinite) || pixelError <= 0) throw new TypeError('Invalid Marbling output transform');
        const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
        if (scale === 0) return 10;
        const an = a / scale, bn = b / scale, cn = c / scale, dn = d / scale;
        const aa = an * an + bn * bn, cc = cn * cn + dn * dn, ac = an * cn + bn * dn;
        const sigma = scale * Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2);
        const tolerance = pixelError / sigma;
        if (tolerance < .00001) throw new RangeError('Output scale exceeds Marbling precision budget');
        return Math.min(10, tolerance);
      }
      return {createMarblingCompileTask,compileMarblingGlyph,createMarblingLodTask,renderMarblingLod,yieldMarblingWork,runMarblingLodTask,marblingPixelTolerance};
      })();
      modules[3] = (function () {
      const { createMarblingCompileTask } = modules[2];

      // Active source leases. A key identifies font + grapheme + capture contract;
      // revision identifies immutable source content. Colours, poses, effect values,
      // animation time and destination precision do not belong in this key.
      // load receives the remaining source-point allowance and must synchronously
      // return a prepareMarblingGlyph result. Capture/ink analysis is NOT time-sliced.
      function createMarblingSourcePool({ pointLimit = 262144, nodeLimit = 524288,
        taskFactory = createMarblingCompileTask } = {}) {
        for (const n of [pointLimit, nodeLimit]) if (!Number.isInteger(n) || n < 1) throw new RangeError('Invalid Marbling source limit');
        let entries = new Map(), paused = false, cursor = 0, loads = 0, builds = 0;
        function descriptor(request, requireLoad = true) {
          if (typeof request?.key !== 'string' || !request.key || typeof request.revision !== 'string' || !request.revision ||
            requireLoad && typeof request.load !== 'function') throw new TypeError('Marbling source needs a key, revision and loader');
          return { id: JSON.stringify([request.key, request.revision]), key: request.key, revision: request.revision, load: request.load };
        }
        function usage() {
          let points = 0, nodes = 0;
          for (const entry of entries.values()) { points += entry.points; nodes += entry.nodes; }
          return { points, nodes };
        }
        function retire(entry) {
          entry.task?.cancel(); entry.task = null; entry.data = null; entry.load = null;
          entry.points = 0; entry.nodes = 0; entry.error = null;
        }
        function ticket(entry) {
          const live = () => entries.get(entry.id) === entry;
          return Object.freeze({
            get status() { return !live() ? 'missing' : entry.data ? 'ready' : entry.error ? 'error' : 'pending'; },
            get result() { return live() ? entry.data : null; },
            get error() { return live() ? entry.error : null; },
          });
        }
        function sync(requests) {
          // A bad edit must not evict the last valid source set. Loader closures are
          // captured once per revision, not replaced by per-frame mutable settings.
          const descriptions = requests.map(r => descriptor(r)), next = new Map();
          for (const d of descriptions) if (!next.has(d.id)) next.set(d.id, entries.get(d.id) ||
            { ...d, data: null, task: null, error: null, points: 0, nodes: 0 });
          for (const [id, entry] of entries) if (!next.has(id)) retire(entry);
          entries = next;
          return descriptions.map(d => ticket(entries.get(d.id)));
        }
        function advance(options = {}) {
          if (paused) return false;
          const pending = [...entries.values()].filter(e => !e.data && !e.error);
          if (!pending.length) return false;
          const entry = pending[cursor++ % pending.length];
          try {
            if (!entry.task) {
              const used = usage();
              loads++;
              const glyph = entry.load({ maxPoints: pointLimit - used.points });
              if (!Object.isFrozen(glyph) || !Array.isArray(glyph?.rings) || !Object.isFrozen(glyph.rings) ||
                !Number.isInteger(glyph.pointCount) || glyph.pointCount < 0) throw new TypeError('Invalid immutable Marbling source');
              let points = 0, nodes = 0;
              for (const ring of glyph.rings) {
                if (!Object.isFrozen(ring) || !Array.isArray(ring.points) || !Object.isFrozen(ring.points) || ring.points.length < 3)
                  throw new TypeError('Invalid immutable Marbling source ring');
                points += ring.points.length;
                nodes += 2 * ring.points.length - Math.min(4, ring.points.length);
              }
              if (points !== glyph.pointCount) throw new TypeError('Invalid Marbling source point count');
              if (used.points + points > pointLimit || used.nodes + nodes > nodeLimit) throw new RangeError('Marbling active source budget exceeded');
              // Reserve the full hierarchy before any partial allocation. Active
              // glyphs are never evicted to silently lower quality or make room.
              entry.points = points; entry.nodes = nodes;
              entry.task = taskFactory(glyph); builds++;
            } else entry.task.step(options);
            if (entry.task.status === 'complete') {
              if (entry.task.result.nodeCount !== entry.nodes) throw new Error('Marbling source hierarchy count mismatch');
              entry.data = entry.task.result; entry.task = null; entry.load = null;
            } else if (entry.task.status !== 'working') throw entry.task.error || new Error('Marbling source compilation failed');
          } catch (failure) {
            entry.task?.cancel(failure); entry.task = null; entry.data = null;
            entry.points = 0; entry.nodes = 0; entry.error = failure;
          }
          return true;
        }
        function state() {
          const all = [...entries.values()];
          return { total: all.length, ready: all.filter(e => e.data).length, pending: all.some(e => !e.data && !e.error),
            errors: all.filter(e => e.error).length, paused, loads, builds, usage: usage(), pointLimit, nodeLimit };
        }
        return Object.freeze({ sync, advance, state,
          // Read-only export/preflight inspection cannot prune the live working set.
          peek(request) { const { id } = descriptor(request, false); return entries.has(id) ? ticket(entries.get(id)) : null; },
          retry() { for (const e of entries.values()) e.error = null; paused = false; },
          setPaused(value) { paused = !!value; },
          reset() { for (const e of entries.values()) retire(e); entries.clear(); paused = false; cursor = 0; },
        });
      }
      return {createMarblingSourcePool};
      })();
      return Object.assign({}, ...modules);
      })();

      var marblingPool = MarblingType.createMarblingSourcePool();

      var marblingFontRevision = 0;

      var marblingTimer = null;

      var marblingRenderError = '';

      var marblingCache = new Map();

      var marblingCachePoints = 0;

      function marblingClearGeometry() { marblingCache.clear(); marblingCachePoints = 0; }

      function marblingPhase(phase) {
        var value = Number.isFinite(phase) ? phase : compositionState.enabled ? compositionState.phase : 0;
        return ((value % 1) + 1) % 1;
      }

      function marblingGlyphSettings(g) {
        var profile = g.surface || {}, settings = {};
        ['amount', 'pitch', 'focus', 'circulation', 'angle', 'motion'].forEach(function (field) {
          var key = 'marbling' + field[0].toUpperCase() + field.slice(1);
          settings[field] = Number.isFinite(profile[key]) ? profile[key] : params[key];
        });
        settings.mode = MarblingType.MARBLING_MODES.indexOf(profile.marblingMode) >= 0 ? profile.marblingMode : params.marblingMode;
        return MarblingType.normalizeMarblingSettings(settings);
      }

      function marblingSource(ch, g) {
        var spec = g && g.fontAxes ? glyphFontSpec(g,768) : null, font = params.fontWeight + ' 768px ' + params.fontFamily;
        return { key: (spec ? spec.key : font) + '\u0000' + ch, revision: String(marblingFontRevision),
          load: marblingGlyphData.bind(null, ch, { font: font, glyph: g && g.fontAxes ? g : null }) };
      }

      function marblingGlyphData(ch, fontSpec, allowance) {
        var canvas = createRenderCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Marbling Typeの字形Canvasを作成できません。');
        var font = fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,768).font : fontSpec.font;
        try {
          ctx.font = font; var measure = ctx.measureText(ch), unit = 4;
          var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
          var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
          var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
          var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
          if (left + right > 4096 || ascent + descent > 4096) throw new RangeError('Marbling Typeの字形ソースは4096pxが上限です。');
          canvas.width = Math.max(8, left + right); canvas.height = Math.max(8, ascent + descent);
          ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
          var traced = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          var count = 0, contours = traced.map(function (ring) {
            count += ring.points.length;
            return { points: ring.points.map(function (p) { return { x: (p.x - left) / unit, y: (p.y - ascent) / unit }; }) };
          });
          if (count > allowance.maxPoints) throw new RangeError('Marbling Typeの字形メモリ上限です。適用する文字種を減らしてください。');
          ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
          var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
            ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
          return Object.freeze(Object.assign({}, MarblingType.prepareMarblingGlyph(contours), {
            nativeMetrics: Object.freeze({ advance: measure.width / unit, middleOffset: middleOffset,
              ascent: Math.max(1, measure.actualBoundingBoxAscent || 768) / unit,
              descent: Math.max(0, measure.actualBoundingBoxDescent || 0) / unit })
          }));
        } finally { canvas.width = 0; canvas.height = 0; }
      }

      function marblingRequests(glyphs) {
        var requests = new Map(); if (surfaceOutputOpacity('marblingType') <= .002) return [];
        glyphs.forEach(function (g) {
          if (surfaceGlyphStrength(g, 'marblingType') <= .002 || !String(g.ch || '').trim() || g.opacity === 0 || marblingGlyphSettings(g).amount === 0) return;
          var request = marblingSource(g.ch,g); if (!requests.has(request.key)) requests.set(request.key, request);
        });
        return Array.from(requests.values());
      }

      function marblingPrepare(glyphs) {
        if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
        var requests = marblingRequests(glyphs); marblingPool.sync(requests);
        var active = new Set(requests.map(function (r) { return r.key; }));
        marblingCache.forEach(function (entry, key) {
          if (!active.has(entry.sourceKey)) { marblingCachePoints -= entry.shape.pointCount; marblingCache.delete(key); }
        });
        if (!requests.length) {
          marblingRenderError = ''; marblingClearGeometry(); marblingPool.setPaused(false);
          if (marblingTimer !== null) cancelAnimationFrame(marblingTimer); marblingTimer = null;
        }
        marblingScheduleWork();
      }

      function marblingAssertReady(glyphs) {
        if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
        marblingRequests(glyphs).forEach(function (request) {
          var ticket = marblingPool.peek(request); if (ticket && ticket.status === 'ready') return;
          var error = new Error(ticket && ticket.error ? ticket.error.message : 'Marbling Typeの字形を準備中です。キャンバスの準備完了を待ってください。');
          error.code = ticket && ticket.status === 'error' ? 'MARBLING_ERROR' : 'MARBLING_PENDING'; throw error;
        });
      }

      function marblingShape(compiled, settings, phase, tolerance, sourceKey) {
        // Keep destination LODs independent: a high-resolution export must not
        // replace the preview's tessellation and change its paused pixels.
        var key = JSON.stringify([marblingFontRevision, sourceKey, settings, settings.motion ? marblingPhase(phase) : 0, tolerance]);
        var cached = marblingCache.get(key);
        if (cached && cached.compiled === compiled && cached.shape.tolerance <= tolerance) {
          marblingCache.delete(key); marblingCache.set(key, cached); return cached.shape;
        }
        var shape = MarblingType.renderMarblingLod(compiled, settings, phase, { tolerance: tolerance, maxPoints: 262144 });
        if (cached) { marblingCachePoints -= cached.shape.pointCount; marblingCache.delete(key); }
        while (marblingCache.size && marblingCachePoints + shape.pointCount > 262144) {
          var oldest = marblingCache.keys().next().value; marblingCachePoints -= marblingCache.get(oldest).shape.pointCount; marblingCache.delete(oldest);
        }
        marblingCache.set(key, { compiled: compiled, shape: shape, sourceKey: sourceKey }); marblingCachePoints += shape.pointCount;
        return shape;
      }

      function marblingEffectPad(glyphs, phase) {
        var extra = 0; if (surfaceOutputOpacity('marblingType') <= .002) return 0;
        glyphs.forEach(function (g) {
          // Strength first: normalising settings for every unaffected glyph made
          // export preflight scale with document length even with Marbling off.
          if (surfaceGlyphStrength(g, 'marblingType') <= .002 || !String(g.ch || '').trim() || g.opacity === 0) return;
          var settings = marblingGlyphSettings(g); if (settings.amount === 0) return;
          var request = marblingSource(g.ch,g), ticket = marblingPool.peek(request); if (!ticket || ticket.status !== 'ready') return;
          try {
            var compiled = ticket.result, fm = compiled.glyph.nativeMetrics;
            var shape = marblingShape(compiled, settings, marblingPhase(phase), .08, request.key), extent = 0;
            shape.rings.forEach(function (ring) { ring.points.forEach(function (p) {
              extent = Math.max(extent, -p.x, p.x - fm.advance, -p.y - fm.ascent, p.y - fm.descent);
            }); });
            var stretch = Math.max(Math.abs(g.scaleX == null ? 1 : g.scaleX), Math.abs(g.scaleY == null ? 1 : g.scaleY));
            var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
            extra = Math.max(extra, (extent + .08) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
          } catch (error) { marblingRenderError = error.message; marblingUpdateStatus(); }
        });
        return extra;
      }

      function marblingTraceRings(ctx, rings) {
        rings.forEach(function (ring) {
          var points = ring.points; if (!points.length) return;
          ctx.moveTo(points[0].x, points[0].y);
          for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath();
        });
      }

      function renderMarblingTypeDirect(ctx, glyphs, pixelScale, L, fm, livePreview) {
        if (surfaceOutputOpacity('marblingType') <= .002) return;
        var color = surfaceEffectColor('marblingType'), phase = marblingPhase(), groups = new Map(), items = [], usedPoints = 0;
        marblingRenderError = '';
        glyphs.forEach(function (g) {
          var strength = surfaceGlyphStrength(g, 'marblingType');
          if (strength <= .002 || !String(g.ch || '').trim() || g.opacity === 0) return;
          var settings = marblingGlyphSettings(g), entry = { g: g, strength: strength, native: settings.amount === 0, group: null, error: null };
          items.push(entry); if (entry.native) return;
          var source = marblingSource(g.ch,g), ticket = marblingPool.peek(source);
          if (!ticket || ticket.status !== 'ready') {
            entry.error = Object.assign(new Error(ticket && ticket.error ? ticket.error.message : 'Marbling Typeの字形を準備中です。'),
              { code: ticket && ticket.status === 'error' ? 'MARBLING_ERROR' : 'MARBLING_PENDING' });
            if (!livePreview) throw entry.error; return;
          }
          ctx.save();
          try {
            spectralGlyphFrame(ctx, g, pixelScale, L, fm, ticket.result.glyph.nativeMetrics);
            var tolerance = MarblingType.marblingPixelTolerance(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.physical(ctx.canvas).getContext('2d').getTransform():ctx.getTransform(), .2), key = JSON.stringify([source.key, settings]);
            var group = groups.get(key);
            if (!group) { group = { compiled: ticket.result, sourceKey: source.key, settings: settings, tolerance: tolerance, generated: false, shape: null, error: null, remaining: 0 }; groups.set(key, group); }
            group.tolerance = Math.min(group.tolerance, tolerance); group.remaining++; entry.group = group;
          } catch (error) { entry.error = error; if (!livePreview) throw error; }
          finally { ctx.restore(); }
        });
        items.forEach(function (entry) {
          var group = entry.group;
          if (group && !group.generated) {
            group.generated = true;
            try {
              group.shape = marblingShape(group.compiled, group.settings, phase, group.tolerance, group.sourceKey);
              usedPoints += group.shape.pointCount;
              if (usedPoints > 262144) throw new RangeError('Marbling Typeの1フレームの輪郭上限です。文字種・設定の種類を減らしてください。');
              if (typeof Path2D === 'function') { group.path = new Path2D(); marblingTraceRings(group.path, group.shape.rings); }
            } catch (error) { group.shape = null; group.error = error; }
          }
          var error = entry.error || (group && group.error); if (error && !livePreview) throw error;
          if (error && error.code !== 'MARBLING_PENDING' && !marblingRenderError) marblingRenderError = error.message;
          if (entry.native || !group || error) drawSurfaceGlyph(ctx, entry.g, pixelScale, L, fm, entry.strength, color);
          else {
            ctx.save();
            try {
              spectralGlyphFrame(ctx, entry.g, pixelScale, L, fm, group.compiled.glyph.nativeMetrics);
              ctx.globalAlpha = entry.strength * (entry.g.opacity == null ? 1 : entry.g.opacity); ctx.fillStyle = color;
              if (group.path) ctx.fill(group.path); else { ctx.beginPath(); marblingTraceRings(ctx, group.shape.rings); ctx.fill(); }
            } finally { ctx.restore(); }
          }
          if (group && --group.remaining === 0) { group.shape = null; group.path = null; }
        });
        marblingUpdateStatus();
      }
