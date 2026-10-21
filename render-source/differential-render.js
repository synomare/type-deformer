// Canonical differential-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var DifferentialGrowth = (function () {
      // EXPERIMENTAL: offline research only; not registered in the editor.
      // Original code. No reference source, font, image or third-party dependency is included.
      function resample(points, spacing) {
        const lengths=[0]; let total=0;
        points.forEach((p,i)=>{const q=points[(i+1)%points.length]; total+=Math.hypot(p.x-q.x,p.y-q.y); lengths.push(total);});
        const n=Math.max(12,Math.ceil(total/spacing)); let k=0;
        return Array.from({length:n},(_,i)=>{const d=total*i/n; while(k+1<points.length&&lengths[k+1]<d)k++; const a=points[k],b=points[(k+1)%points.length],t=(d-lengths[k])/(lengths[k+1]-lengths[k]||1);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};});
      }


      // Original continuous vertex/edge contact constraint; no third-party code.
      // Coordinates and clearance are in the 192px glyph frame. This is a tolerant
      // floating-point solver, not exact predicates or a repair of invalid input.
      function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

      function vertexEdgeHit(p, a, b) {
        const ex = b.x - a.x, ey = b.y - a.y, rx = p.x - a.x, ry = p.y - a.y;
        const evx = b.mx - a.mx, evy = b.my - a.my, rvx = p.mx - a.mx, rvy = p.my - a.my;
        const c = cross(ex, ey, rx, ry);
        const d = cross(ex, ey, rvx, rvy) + cross(evx, evy, rx, ry), e = cross(evx, evy, rvx, rvy);
        const mid = c + d * .5, end = c + d + e;
        const tolerance = 1e-11 * (1 + Math.abs(c) + Math.abs(d) + Math.abs(e));
        // Bernstein control values bound the orientation polynomial over the step.
        if (c > tolerance && mid > tolerance && end > tolerance
          || c < -tolerance && mid < -tolerance && end < -tolerance) return null;
        const roots = [];
        if (Math.abs(e) < tolerance) {
          if (Math.abs(d) > tolerance) roots.push(-c / d);
        } else {
          const discriminant = d * d - 4 * e * c;
          if (discriminant >= 0) {
            const sq = Math.sqrt(discriminant), q = -.5 * (d + (d >= 0 ? sq : -sq));
            roots.push(q / e);
            if (q) roots.push(c / q);
          }
        }
        roots.sort((x, y) => x - y);
        for (const time of roots) {
          if (time < 1e-8 || time > 1) continue;
          const dx = ex + evx * time, dy = ey + evy * time;
          const px = rx + rvx * time, py = ry + rvy * time, dd = dx * dx + dy * dy;
          if (dd < 1e-16) continue;
          const u = (px * dx + py * dy) / dd;
          if (u < -1e-8 || u > 1 + 1e-8) continue;
          // Ignore opening/grazing roots. Persistent collinearity and initial contact
          // are outside this test; a closing hit is separated before it is committed.
          const side = c >= 0 ? 1 : -1;
          if ((d + 2 * e * time) * side >= -tolerance) continue;
          const length = Math.sqrt(dd);
          return { p, a, b, time, u: Math.max(0, Math.min(1, u)), nx: -dy / length * side, ny: dx / length * side };
        }
        return null;
      }

      function createContactGuard(cellSize) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Expected positive contact cell size');
        const edgePool = [], rows = new Map(), rowPool = [], bucketPool = [];
        let contacts = 0, stops = 0;
        function* grid(rings, yielding = true) {
          rows.clear(); let edgeCount = 0, rowCount = 0, bucketCount = 0;
          for (const ring of rings) for (let i = 0; i < ring.points.length; i++) {
            const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
            const edge = edgePool[edgeCount] || (edgePool[edgeCount] = {}); edgeCount++;
            edge.a = a; edge.b = b;
            edge.minX = Math.min(a.x, a.x + a.mx, b.x, b.x + b.mx);
            edge.maxX = Math.max(a.x, a.x + a.mx, b.x, b.x + b.mx);
            edge.minY = Math.min(a.y, a.y + a.my, b.y, b.y + b.my);
            edge.maxY = Math.max(a.y, a.y + a.my, b.y, b.y + b.my);
            edge.cx = Math.floor(edge.minX / cellSize); edge.cy = Math.floor(edge.minY / cellSize);
            for (let y = edge.cy; y <= Math.floor(edge.maxY / cellSize); y++) {
              let row = rows.get(y);
              if (!row) { row = rowPool[rowCount] || (rowPool[rowCount] = new Map()); rowCount++; row.clear(); rows.set(y, row); }
              for (let x = edge.cx; x <= Math.floor(edge.maxX / cellSize); x++) {
                let bucket = row.get(x);
                if (!bucket) { bucket = bucketPool[bucketCount] || (bucketPool[bucketCount] = []); bucketCount++; bucket.length = 0; row.set(x, bucket); }
                bucket.push(edge);
              }
            }
            if (yielding && edgeCount % 128 === 0) yield;
          }
        }
        function hit(a, b) {
          if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) return null;
          if (a.minX > b.maxX || a.maxX < b.minX || a.minY > b.maxY || a.maxY < b.minY) return null;
          let earliest = null;
          let candidate = vertexEdgeHit(a.a, b.a, b.b);
          if (candidate) earliest = candidate;
          candidate = vertexEdgeHit(a.b, b.a, b.b);
          if (candidate && (!earliest || candidate.time < earliest.time)) earliest = candidate;
          candidate = vertexEdgeHit(b.a, a.a, a.b);
          if (candidate && (!earliest || candidate.time < earliest.time)) earliest = candidate;
          candidate = vertexEdgeHit(b.b, a.a, a.b);
          if (candidate && (!earliest || candidate.time < earliest.time)) earliest = candidate;
          return earliest;
        }
        return {
          // A read-only test for a proposed history chord. Ordinary floating-point
          // tolerances and the same valid-input limitations as the growth guard.
          intersects(rings) {
            for (const pause of grid(rings, false)) { /* drain the read-only broad phase */ }
            for (const [cy, row] of rows) for (const [cx, bucket] of row)
              for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
                const a = bucket[i], b = bucket[j];
                if (cx === Math.max(a.cx, b.cx) && cy === Math.max(a.cy, b.cy) && hit(a, b)) return true;
              }
            return false;
          },
          *constrain(rings) {
            for (let pass = 0; pass < 12; pass++) {
              yield* grid(rings);
              let found = 0, visited = 0;
              for (const [cy, row] of rows) for (const [cx, bucket] of row)
                for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
                  const a = bucket[i], b = bucket[j];
                  // Visit a pair in its first common grid cell, once per pass.
                  if (cx !== Math.max(a.cx, b.cx) || cy !== Math.max(a.cy, b.cy)) continue;
                  const collision = hit(a, b);
                  if (collision) {
                    found++; contacts++;
                    const { p, a, b, u, nx, ny } = collision;
                    if (pass >= 8) { p.mx = p.my = a.mx = a.my = b.mx = b.my = 0; }
                    else {
                      const signed = (p.x + p.mx - a.x - a.mx - u * (b.x + b.mx - a.x - a.mx)) * nx
                        + (p.y + p.my - a.y - a.my - u * (b.y + b.my - a.y - a.my)) * ny;
                      // Distribute the normal correction; retain tangential motion.
                      const impulse = Math.max(0, (.0125 - signed) / (1 + (1 - u) * (1 - u) + u * u));
                      p.mx += nx * impulse; p.my += ny * impulse;
                      a.mx -= nx * impulse * (1 - u); a.my -= ny * impulse * (1 - u);
                      b.mx -= nx * impulse * u; b.my -= ny * impulse * u;
                    }
                  }
                  if (++visited % 256 === 0) yield;
                }
              if (!found) return;
              yield;
            }
            // Conservative last resort: reject this positional step, not the whole
            // trajectory. Observable stats let regressions detect repeated stalling.
            for (const ring of rings) for (const p of ring.points) p.mx = p.my = 0;
            stops++;
          },
          get stats() { return { contacts, stops }; },
          dispose() { edgePool.length = 0; rows.clear(); rowPool.length = 0; bucketPool.length = 0; }
        };
      }

      // Original contact-aware temporal sampling. Growth positions are never edited.
      // Preserves the existing ~.2px trajectory fidelity in the 192px glyph frame,
      // while retaining extra computed steps when a straight playback chord crosses.

      function growthMaterialPoint(data, u, cursor) {
        while (cursor.i + 3 < data.length && data[cursor.i + 3] <= u) cursor.i += 3;
        const k = cursor.i, next = (k + 3) % data.length, nextU = next === 0 ? 1 : data[next];
        const w = (u - data[k]) / Math.max(Number.EPSILON, nextU - data[k]);
        cursor.x = data[k + 1] + (data[next + 1] - data[k + 1]) * w;
        cursor.y = data[k + 2] + (data[next + 2] - data[k + 2]) * w;
      }

      function createHistoryRefiner(radius, { tolerance = .2 } = {}) {
        if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError('Expected finite temporal tolerance');
        const guard = createContactGuard(radius), scratch = [];
        let tests = 0, contactSplits = 0, errorSplits = 0;
        function motion(from, to) {
          scratch.length = to.rings.length;
          for (let ri = 0; ri < to.rings.length; ri++) {
            const data = to.rings[ri].data, previous = from.rings[ri].data, cursor = { i: 0 };
            const ring = scratch[ri] || (scratch[ri] = { points: [] }); ring.points.length = data.length / 3;
            for (let i = 0; i < data.length; i += 3) {
              growthMaterialPoint(previous, data[i], cursor);
              const p = ring.points[i / 3] || (ring.points[i / 3] = {});
              p.x = cursor.x; p.y = cursor.y; p.mx = data[i + 1] - p.x; p.my = data[i + 2] - p.y;
            }
          }
          return scratch;
        }
        function errorSquared(frame, from, to) {
          const t = (frame.step - from.step) / (to.step - from.step); let maximum = 0;
          for (let ri = 0; ri < to.rings.length; ri++) {
            const data = to.rings[ri].data, a = from.rings[ri].data, b = frame.rings[ri].data;
            const ca = { i: 0 }, cb = { i: 0 };
            for (let i = 0; i < data.length; i += 3) {
              growthMaterialPoint(a, data[i], ca); growthMaterialPoint(b, data[i], cb);
              const dx = ca.x + (data[i + 1] - ca.x) * t - cb.x;
              const dy = ca.y + (data[i + 2] - ca.y) * t - cb.y;
              maximum = Math.max(maximum, dx * dx + dy * dy);
            }
          }
          return maximum;
        }
        return {
          // Input is every computed step in one short interval, with ordered material
          // coordinates and stable ring identity. Return original frames, not morphs.
          select(frames) {
            const retained = [];
            function span(lo, hi) {
              if (hi - lo <= 1) { retained.push(frames[hi]); return; }
              const from = frames[lo], to = frames[hi]; let maximum = 0, split = (lo + hi) >> 1;
              for (let i = lo + 1; i < hi; i++) {
                const error = errorSquared(frames[i], from, to);
                if (error > maximum) { maximum = error; split = i; }
              }
              if (maximum > tolerance * tolerance) { errorSplits++; span(lo, split); span(split, hi); return; }
              tests++;
              if (guard.intersects(motion(from, to))) {
                contactSplits++; split = (lo + hi) >> 1; span(lo, split); span(split, hi); return;
              }
              retained.push(to);
            }
            if (frames.length > 1) span(0, frames.length - 1);
            return retained;
          },
          get stats() { return { tests, contactSplits, errorSplits }; },
          dispose() { guard.dispose(); scratch.length = 0; }
        };
      }

      function createGrowthHistory(radius) {
        const refiner = createHistoryRefiner(radius), frames = [], recent = [], free = [], owned = [];
        let bytes = 0, disposed = false;
        function retain(frame) {
          // Retained frames own exact-sized buffers; scratch capacity is never hidden
          // in a retained subarray or recycled beneath an existing playback sample.
          const saved = { step: frame.step, rings: frame.rings.map(r => {
            const data = new Float64Array(r.data); bytes += data.byteLength;
            return { area: r.area, data };
          }) };
          frames.push(saved);
        }
        return {
          frames,
          capture(rings, step) {
            if (disposed) throw new Error('Growth history capture is disposed');
            const frame = free.pop() || { step: 0, rings: [], buffers: [] };
            if (!owned.includes(frame)) owned.push(frame);
            frame.step = step; frame.rings.length = rings.length;
            for (let ri = 0; ri < rings.length; ri++) {
              const r = rings[ri], size = r.points.length * 3;
              let buffer = frame.buffers[ri];
              if (!buffer || buffer.length < size) buffer = frame.buffers[ri] = new Float64Array(Math.max(24, 2 ** Math.ceil(Math.log2(size))));
              const data = buffer.subarray(0, size);
              for (let i = 0; i < r.points.length; i++) {
                const p = r.points[i]; data[i * 3] = p.u; data[i * 3 + 1] = p.x; data[i * 3 + 2] = p.y;
              }
              frame.rings[ri] = { area: r.area, data };
            }
            if (!frames.length) { retain(frame); free.push(frame); recent.push(frames[0]); }
            else recent.push(frame);
          },
          commit() {
            if (recent.length <= 1) return;
            for (const frame of refiner.select(recent)) retain(frame);
            for (let i = 1; i < recent.length; i++) free.push(recent[i]);
            recent.length = 0; recent.push(frames[frames.length - 1]);
          },
          get pendingSteps() { return Math.max(0, recent.length - 1); },
          get bytes() { return bytes; },
          get captureBytes() { return owned.reduce((n, f) => n + f.buffers.reduce((n, b) => n + b.byteLength, 0), 0); },
          get stats() { return refiner.stats; },
          disposeScratch() { refiner.dispose(); recent.length = 0; free.length = 0; owned.length = 0; disposed = true; }
        };
      }

      // Original incremental growth runtime, embedded in the v39 editor.
      // solver.mjs is retained as the independent, pre-optimization geometry oracle.

      function normalizeGrowthSettings(settings = {}) {
        const normalized = (() => {
        const ranges = { age: [0, 5, 1], grain: [2.5, 12, 4], tension: [.18, 1.2, .8],
          memory: [0, .05, .007], patch: [0, 1, .8], areaGain: [.5, 2, 1.1], seed: [-2147483648, 2147483647, 31] };
        const result = {};
        for (const [key, [lo, hi, fallback]] of Object.entries(ranges)) {
          result[key] = Number.isFinite(settings[key]) ? Math.max(lo, Math.min(hi, settings[key])) : fallback;
        }
        return result;
      })();
        return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('differential',settings,normalized) : normalized;
      }

      function createGrowthJob(contours, settings = {}, options = {}) {
        const s = normalizeGrowthSettings(settings);
        if (!Array.isArray(contours)) throw new TypeError('Expected contour array');
        for (const c of contours) {
          if (!Number.isFinite(c.area) || !Array.isArray(c.points) || c.points.length < 3
            || c.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
            throw new TypeError('Expected finite closed contours');
          }
        }
        const rand = (x, y) => {
          const v = Math.sin(x * 127.1 + y * 311.7 + s.seed * 91.37) * 43758.5453123;
          return v - Math.floor(v);
        };
        function noise(x, y) {
          const ix = Math.floor(x), iy = Math.floor(y); let u = x - ix, v = y - iy;
          u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
          return (rand(ix, iy) * (1 - u) + rand(ix + 1, iy) * u) * (1 - v)
            + (rand(ix, iy + 1) * (1 - u) + rand(ix + 1, iy + 1) * u) * v;
        }
        function node(x, y, ax, ay, rest, u) {
          // Anchors never move: their seeded nutrient value need only be computed once.
          const nutrient = (1 - s.patch) + s.patch * (.2 + 1.8 * noise(ax / 28, ay / 28));
          return { x, y, ax, ay, rest, u, growth: 1 + .0018 * nutrient,
            ri: 0, i: 0, dx: 0, dy: 0, mx: 0, my: 0, bucket: null };
        }
        const rings = contours.map(c => {
          const sampled = resample(c.points, s.grain * .8);
          return { area: c.area, points: sampled.map((p, i) => node(p.x, p.y, p.x, p.y, 0, i / sampled.length)) };
        });
        for (const r of rings) r.points.forEach((p, i) => {
          const q = r.points[(i + 1) % r.points.length]; p.rest = Math.hypot(p.x - q.x, p.y - q.y);
        });
        const totalSteps = rings.length ? Math.round(s.age * 960) : 0, initialPoints = rings.reduce((n, r) => n + r.points.length, 0);
        const pointBudget = Math.max(4096, initialPoints), radius = s.grain * 2.5, radiusSquared = radius * radius;
        const contactGuard = createContactGuard(radius);
        // Linearized fourth-difference bending has spectral radius 16*tension;
        // neighboring .6 springs add at most 2.4 and the anchor adds memory.
        // Keep h*lambda below 2 with headroom, avoiding a hidden period-two mode at
        // high bending. This is not a stability proof for the nonlinear contact field.
        const integrationStep = Math.min(.11, 1.8 / (16 * s.tension + 2.4 + s.memory));
        let livePoints = initialPoints, maxPoints = initialPoints, completedSteps = 0, budgetReached = false;
        let status = totalSteps && rings.length ? 'pending' : 'complete';
        const historyEvery = Number.isFinite(options.historyEvery) ? Math.max(1, Math.round(options.historyEvery)) : 12;
        const recorder = options.history !== false ? createGrowthHistory(radius) : null;
        const history = recorder ? recorder.frames : [];
        // Reused numeric rows, buckets and ordered neighbor lists. No packed-key aliases.
        const grid = new Map(), bucketPool = [], rowPool = [], all = [];
        function releaseScratch() {
          contactGuard.dispose();
          recorder?.disposeScratch();
          for (const r of rings) for (const p of r.points) p.bucket = null;
          grid.clear(); bucketPool.length = 0; rowPool.length = 0; all.length = 0;
        }
        function record() {
          recorder?.commit();
        }
        recorder?.capture(rings, 0);
        if (!totalSteps) releaseScratch();
        function* simulate() {
          for (let step = 0; step < totalSteps && status !== 'cancelled'; step++) {
            grid.clear(); all.length = 0; let rowCount = 0, bucketCount = 0;
            for (let ri = 0; ri < rings.length; ri++) {
              const ps = rings[ri].points;
              for (let i = 0; i < ps.length; i++) {
                const p = ps[i]; p.ri = ri; p.i = i; p.dx = 0; p.dy = 0; all.push(p);
                const cx = Math.floor(p.x / radius), cy = Math.floor(p.y / radius);
                let row = grid.get(cy);
                if (!row) { row = rowPool[rowCount] || (rowPool[rowCount] = new Map()); rowCount++; row.clear(); grid.set(cy, row); }
                let bucket = row.get(cx);
                if (!bucket) {
                  bucket = bucketPool[bucketCount] || (bucketPool[bucketCount] = { x: 0, y: 0, points: [], neighbors: [] });
                  bucketCount++; bucket.x = cx; bucket.y = cy; bucket.points.length = 0; bucket.neighbors.length = 0; row.set(cx, bucket);
                }
                bucket.points.push(p); p.bucket = bucket;
              }
            }
            for (let i = 0; i < bucketCount; i++) {
              const bucket = bucketPool[i];
              for (let oy = -1; oy <= 1; oy++) {
                const row = grid.get(bucket.y + oy); if (!row) continue;
                for (let ox = -1; ox <= 1; ox++) {
                  const neighbor = row.get(bucket.x + ox); if (neighbor) bucket.neighbors.push(neighbor.points);
                }
              }
            }
            yield;
            for (const r of rings) {
              const ps = r.points, n = ps.length; let area = 0, perimeter = 0;
              for (let j = 0; j < n; j++) {
                const a = ps[j], b = ps[(j + 1) % n];
                area += a.x * b.y - b.x * a.y; perimeter += Math.hypot(a.x - b.x, a.y - b.y);
              }
              const pressure = Math.max(-.5, Math.min(.5, (r.area * s.areaGain - area * .5) / Math.max(1, perimeter) * .09));
              for (let i = 0; i < n; i++) {
                const p = ps[i], q = ps[(i + 1) % n], a = ps[(i + n - 1) % n], aa = ps[(i + n - 2) % n], qq = ps[(i + 2) % n];
                p.rest = Math.min(s.grain * 1.5, p.rest * p.growth);
                const vx = q.x - p.x, vy = q.y - p.y, d = Math.max(.0001, Math.hypot(vx, vy)), force = (d - p.rest) * .6;
                p.dx += vx / d * force; p.dy += vy / d * force; q.dx -= vx / d * force; q.dy -= vy / d * force;
                const tx = q.x - a.x, ty = q.y - a.y, td = Math.max(.001, Math.hypot(tx, ty));
                p.dx += (-aa.x + 4 * a.x - 6 * p.x + 4 * q.x - qq.x) * s.tension + (p.ax - p.x) * s.memory + ty / td * pressure;
                p.dy += (-aa.y + 4 * a.y - 6 * p.y + 4 * q.y - qq.y) * s.tension + (p.ay - p.y) * s.memory - tx / td * pressure;
                for (const neighbors of p.bucket.neighbors) for (let bi = 0; bi < neighbors.length; bi++) {
                  const b = neighbors[bi];
                  if (b === p || b.ri === p.ri && (Math.abs(b.i - i) <= 3 || Math.abs(b.i - i) >= n - 3)) continue;
                  const bx = p.x - b.x, by = p.y - b.y;
                  if (bx * bx + by * by >= radiusSquared) continue;
                  const bd = Math.hypot(bx, by);
                  if (bd < radius && bd > 1e-5) {
                    const repel = (1 - bd / radius) ** 2 * .8; p.dx += bx / bd * repel; p.dy += by / bd * repel;
                  }
                }
                if (i % 32 === 31) yield;
              }
            }
            // Point repulsion alone misses an edge slipping between its neighbors.
            // Constrain proposed displacements before publishing any positions.
            for (const p of all) {
              const limit = Math.min(integrationStep, s.grain * .15 / Math.max(.0001, Math.hypot(p.dx, p.dy)));
              p.mx = p.dx * limit; p.my = p.dy * limit;
            }
            yield* contactGuard.constrain(rings);
            // Publish a whole step, never half-updated positions.
            for (const p of all) { p.x += p.mx; p.y += p.my; }
            if (step % 12 === 11) for (const r of rings) {
              const next = [];
              for (let i = 0; i < r.points.length; i++) {
                const p = r.points[i], q = r.points[(i + 1) % r.points.length]; next.push(p);
                if (Math.hypot(p.x - q.x, p.y - q.y) > s.grain * 1.25 && livePoints < pointBudget) {
                  p.rest *= .5; livePoints++;
                  next.push(node((p.x + q.x) / 2, (p.y + q.y) / 2, (p.ax + q.ax) / 2, (p.ay + q.ay) / 2, p.rest,
                    (p.u + (i + 1 === r.points.length ? 1 : q.u)) / 2));
                }
              }
              r.points = next;
            }
            maxPoints = Math.max(maxPoints, livePoints); budgetReached = budgetReached || livePoints === pointBudget;
            completedSteps = step + 1;
            recorder?.capture(rings, completedSteps);
            // Initial font corners relax much faster than mature growth. Preserve
            // that short transient densely instead of inflating the entire history.
            if (completedSteps <= 48 && completedSteps % 4 === 0 || completedSteps % historyEvery === 0
              || completedSteps === totalSteps || recorder?.pendingSteps >= 12) record();
            if (completedSteps === totalSteps) { status = 'complete'; releaseScratch(); }
            yield;
          }
        }
        const iterator = simulate();
        function snapshot() {
          return { rings: rings.map(r => ({ area: r.area, points: r.points.map(p => ({ x: p.x, y: p.y, u: p.u })) })),
            steps: completedSteps, totalSteps, initialPoints, maxPoints, pointBudget, budgetReached,
            contact: contactGuard.stats, history: recorder?.stats || null, settings: { ...s }, status };
        }
        const job = {
          get status() { return status; }, get completedSteps() { return completedSteps; }, get totalSteps() { return totalSteps; },
          get progress() { return totalSteps ? completedSteps / totalSteps : 1; },
          get historyBytes() { return recorder?.bytes || 0; }, get historyFrames() { return history.length; },
          get historyCaptureBytes() { return recorder?.captureBytes || 0; },
          advance({ budgetMs = 4, maxSteps = Infinity, now = () => performance.now(), signal } = {}) {
            if (signal?.aborted) job.cancel();
            budgetMs = budgetMs === Infinity ? Infinity : Number.isFinite(budgetMs) ? Math.max(0, budgetMs) : 4;
            maxSteps = Number.isFinite(maxSteps) ? Math.floor(maxSteps) : Infinity;
            if (status === 'complete' || status === 'cancelled' || budgetMs <= 0 || maxSteps <= 0) return job;
            const start = now(), target = Math.min(totalSteps, completedSteps + maxSteps); status = 'running';
            while (completedSteps < target) {
              if (signal?.aborted) { job.cancel(); break; }
              if (now() - start >= budgetMs) break;
              if (iterator.next().done) { status = 'complete'; break; }
            }
            if (status === 'running') status = 'paused';
            return job;
          },
          cancel() { if (status !== 'complete') { status = 'cancelled'; iterator.return(); releaseScratch(); } return job; },
          snapshot,
          checkpoint() { record(); return job; },
          sample(age) { return sampleGrowthHistory(history, Number.isFinite(age) ? Math.max(0, age) * 960 : 0); }
        };
        return job;
      }

      function sampleGrowthHistory(history, step) {
        if (!history.length) return [];
        let lo = 0, hi = history.length - 1;
        if (step <= history[lo].step) hi = lo;
        else if (step >= history[hi].step) lo = hi;
        else {
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (history[mid].step <= step) lo = mid; else hi = mid; }
          if (step === history[lo].step) hi = lo;
        }
        const from = history[lo], to = history[hi];
        const t = from === to ? 0 : (step - from.step) / (to.step - from.step);
        return to.rings.map((ring, ri) => {
          const a = from.rings[ri].data, b = ring.data, points = []; let k = 0;
          for (let j = 0; j < b.length; j += 3) {
            const u = b[j]; while (k + 3 < a.length && a[k + 3] <= u) k += 3;
            const next = (k + 3) % a.length, nextU = next === 0 ? 1 : a[next];
            const w = (u - a[k]) / Math.max(Number.EPSILON, nextU - a[k]);
            const x = a[k + 1] + (a[next + 1] - a[k + 1]) * w, y = a[k + 2] + (a[next + 2] - a[k + 2]) * w;
            points.push({ x: x + (b[j + 1] - x) * t, y: y + (b[j + 2] - y) * t, u });
          }
          return { area: ring.area, points };
        });
      }

      function growthLoopAge(phase, age, depth = 1) {
        const p = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
        return Math.max(0, Math.min(5, Number.isFinite(age) ? age : 0))
          * (1 - Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0)) * (1 - Math.cos(p * Math.PI * 2)) / 2);
      }

      function grow(contours, settings = {}) {
        const job = createGrowthJob(contours, settings, { history: false });
        job.advance({ budgetMs: Infinity });
        return job.snapshot();
      }

      // Yield a task, not only a microtask. A UI adapter may inject its own scheduler.
      async function runGrowthJob(job, { budgetMs = 4, signal, onProgress, yieldTask } = {}) {
        const pause = yieldTask || (() => globalThis.scheduler?.yield ? globalThis.scheduler.yield()
          : new Promise(resolve => setTimeout(resolve, 0)));
        try {
          while (job.status !== 'complete' && job.status !== 'cancelled') {
            job.advance({ budgetMs: Number.isFinite(budgetMs) ? Math.max(.1, Math.min(12, budgetMs)) : 4, signal });
            if (signal?.aborted) job.cancel();
            if (job.status === 'cancelled') break;
            onProgress?.(job);
            if (job.status !== 'complete') await pause();
          }
        } catch (error) { job.cancel(); throw error; }
        return job;
      }

      // Shared, caller-owned leases. The v39 editor owns scheduling. No timers or DOM.

      function createGrowthPool({ idleEntries = 8, idleHistoryBytes = 16 * 1024 * 1024, historyEvery = 12 } = {}) {
        idleEntries = Number.isFinite(idleEntries) ? Math.max(0, Math.floor(idleEntries)) : 8;
        idleHistoryBytes = Number.isFinite(idleHistoryBytes) ? Math.max(0, idleHistoryBytes) : 16 * 1024 * 1024;
        historyEvery = Number.isFinite(historyEvery) ? Math.max(1, Math.floor(historyEvery)) : 12;
        const entries = new Map();
        let disposed = false, sequence = 0, cursor = 0;
        const clampAge = age => Number.isFinite(age) ? Math.max(0, Math.min(5, age)) : 0;
        const requiredStep = age => Math.min(4800, Math.ceil(clampAge(age) * 960 / historyEvery) * historyEvery);
        function trim() {
          const idle = [...entries.values()].filter(entry => !entry.leases.size).sort((a, b) => a.used - b.used);
          let bytes = idle.reduce((n, entry) => n + entry.job.historyBytes, 0);
          while (idle.length > idleEntries || bytes > idleHistoryBytes) {
            const entry = idle.shift(); if (!entry) break;
            bytes -= entry.job.historyBytes; entry.job.cancel(); entries.delete(entry.key);
          }
        }
        return {
          acquire(sourceKey, contours, settings = {}) {
            if (disposed) throw new Error('Growth pool is disposed');
            if (typeof sourceKey !== 'string' || !sourceKey) throw new TypeError('A stable font/mask/glyph identity is required');
            const normalized = normalizeGrowthSettings(settings), requestedAge = normalized.age;
            // The complete trajectory is independent of current age. Work only as far
            // as requested, on canonical history boundaries, so access order cannot
            // introduce arbitrary checkpoints that change subsequent interpolation.
            normalized.age = 5;
            const key = JSON.stringify([sourceKey, normalized]);
            let entry = entries.get(key);
            if (!entry) {
              entry = { key, job: createGrowthJob(contours, normalized, { historyEvery }), leases: new Map(), used: ++sequence };
              entries.set(key, entry);
            }
            const token = Symbol(), request = { age: requestedAge }; let released = false;
            entry.leases.set(token, request); entry.used = ++sequence;
            function assertLive() { if (released || disposed) throw new Error('Growth lease is released'); }
            return {
              request(age) { assertLive(); request.age = clampAge(age); entry.used = ++sequence; return this; },
              get state() {
                if (released || disposed) return { status: 'released', progress: 0 };
                const target = requiredStep(request.age), available = entry.job.completedSteps;
                const ready = !target || entry.job.status === 'complete' || available >= target;
                return { status: ready ? 'ready' : 'pending', age: request.age, availableAge: available / 960,
                  progress: target ? Math.min(1, available / target) : 1 };
              },
              sample(age = request.age) {
                assertLive();
                // Playback reads an earlier point without lowering the preparation
                // target. A complete Compose loop must be prepared before recording.
                age = clampAge(age);
                return this.state.status === 'ready' && age <= request.age ? entry.job.sample(age) : null;
              },
              release() {
                if (released) return;
                released = true; entry.leases.delete(token); entry.used = ++sequence; trim();
              }
            };
          },
          advance({ budgetMs = 4, now = () => performance.now() } = {}) {
            if (disposed) return this;
            budgetMs = Number.isFinite(budgetMs) ? Math.max(0, Math.min(12, budgetMs)) : 4;
            const start = now();
            const pending = [...entries.values()].filter(entry => entry.leases.size && entry.job.status !== 'complete'
              && [...entry.leases.values()].some(request => requiredStep(request.age) > entry.job.completedSteps));
            // One shared time budget, not four milliseconds multiplied by glyph count.
            for (let visited = 0; visited < pending.length; visited++) {
              const remaining = budgetMs - (now() - start); if (remaining <= 0) break;
              const entry = pending[cursor % pending.length]; cursor++;
              const target = Math.max(...[...entry.leases.values()].map(request => requiredStep(request.age)));
              entry.job.advance({ budgetMs: remaining, maxSteps: target - entry.job.completedSteps, now });
            }
            trim(); return this;
          },
          get stats() {
            const values = [...entries.values()];
            return { entries: values.length, activeEntries: values.filter(entry => entry.leases.size).length,
              leases: values.reduce((n, entry) => n + entry.leases.size, 0),
              historyBytes: values.reduce((n, entry) => n + entry.job.historyBytes, 0),
              idleHistoryBytes: values.filter(entry => !entry.leases.size).reduce((n, entry) => n + entry.job.historyBytes, 0),
              completedSteps: values.reduce((n, entry) => n + entry.job.completedSteps, 0), disposed };
          },
          dispose() {
            for (const entry of entries.values()) entry.job.cancel();
            entries.clear(); disposed = true;
          }
        };
      }

      // Editor preparation state. No DOM and no scheduler: the host owns one rAF.

      function growthRequestKey(sourceKey, settings) {
        return JSON.stringify([sourceKey, { ...normalizeGrowthSettings(settings), age: 5 }]);
      }

      function createGrowthController({ historyLimit = 64 * 1024 * 1024, now = () => performance.now() } = {}) {
        let pool = createGrowthPool({ idleEntries: 4, idleHistoryBytes: 8 * 1024 * 1024 });
        let records = new Map(), paused = false, memoryPaused = false, error = '', disposed = false;
        let limit = historyLimit;
        function state() {
          const values = [...records.values()];
          const ready = values.filter(r => r.lease && r.lease.state.status === 'ready').length;
          const progress = values.length ? values.reduce((n, r) => n + (r.lease ? r.lease.state.progress : 0), 0) / values.length : 1;
          return { total: values.length, ready, progress, pending: ready < values.length,
            paused, memoryPaused, error, historyBytes: pool.stats.historyBytes, historyLimit: limit, disposed };
        }
        return {
          sync(requests) {
            if (disposed) throw new Error('Growth controller is disposed');
            const desired = new Map();
            for (const request of requests) {
              const settings = normalizeGrowthSettings(request.settings);
              if (!settings.age) continue;
              const key = growthRequestKey(request.sourceKey, settings), previous = desired.get(key);
              if (!previous || previous.settings.age < settings.age) desired.set(key, { ...request, settings });
            }
            let changed = records.size !== desired.size;
            for (const [key, record] of records) if (!desired.has(key)) {
              if (record.lease) record.lease.release(); records.delete(key); changed = true;
            }
            for (const [key, request] of desired) {
              const record = records.get(key);
              if (record) {
                if (record.settings.age !== request.settings.age) changed = true;
                record.settings = request.settings;
                if (record.lease) record.lease.request(request.settings.age);
              } else { records.set(key, { ...request, lease: null, data: null }); changed = true; }
            }
            if (changed) error = '';
            if (!records.size) { paused = false; memoryPaused = false; limit = historyLimit; }
            if (memoryPaused && pool.stats.historyBytes < limit) memoryPaused = false;
            if (!this.state.pending) memoryPaused = false;
            return this.state;
          },
          advance(budgetMs = 4) {
            if (disposed || paused || error) return this.state;
            if (pool.stats.historyBytes >= limit) { memoryPaused = true; return this.state; }
            if (memoryPaused) return this.state;
            const start = now();
            try {
              // At most one mask/resample initialization per task. Repeated instances
              // use one record. No mask extraction happens inside the per-glyph draw.
              for (const record of records.values()) if (!record.lease) {
                record.data = record.load();
                if (!record.data || !record.data.contours.length) throw new Error('この字形の輪郭を取得できません。フォントを変更してください。');
                record.lease = pool.acquire(record.sourceKey, record.data.contours, record.settings);
                break;
              }
              pool.advance({ budgetMs: Math.max(0, budgetMs - (now() - start)), now });
            } catch (failure) { error = failure.message || '輪郭の計算に失敗しました。'; }
            if (pool.stats.historyBytes >= limit && this.state.pending) memoryPaused = true;
            return this.state;
          },
          read(sourceKey, settings, age = settings.age) {
            const record = records.get(growthRequestKey(sourceKey, settings));
            if (!record || !record.lease || record.lease.state.status !== 'ready') return null;
            const rings = record.lease.sample(age);
            return rings ? { data: record.data, rings } : null;
          },
          isReady(sourceKey, settings) {
            if (settings.age <= 0) return true;
            const record = records.get(growthRequestKey(sourceKey, settings));
            return !!(record && record.settings.age >= settings.age && record.lease && record.lease.state.status === 'ready');
          },
          setPaused(value) { paused = !!value; return this.state; },
          allowMoreMemory() { limit = Math.max(limit * 2, pool.stats.historyBytes + historyLimit); memoryPaused = false; return this.state; },
          get state() { return state(); },
          reset() {
            pool.dispose(); records.clear(); pool = createGrowthPool({ idleEntries: 4, idleHistoryBytes: 8 * 1024 * 1024 });
            paused = memoryPaused = false; error = ''; limit = historyLimit;
          },
          dispose() { pool.dispose(); records.clear(); disposed = true; }
        };
      }
      return { normalizeGrowthSettings, createGrowthJob, sampleGrowthHistory, growthLoopAge, createGrowthPool, growthRequestKey, createGrowthController };
      })();

      var differentialController = DifferentialGrowth.createGrowthController();

      var differentialFontRevision = 0;

      var differentialMaskCache = new Map();

      var differentialMaskPoints = 0;

      function differentialGlyphSettings(g) {
        var profile = g.surface || {};
        function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
        return DifferentialGrowth.normalizeGrowthSettings({ age: value('differentialAge'), grain: value('differentialGrain'),
          tension: value('differentialTension'), memory: value('differentialMemory'), patch: value('differentialPatch'),
          areaGain: value('differentialArea'), seed: ((params.seed * 131 + (String(g.ch).codePointAt(0) || 0)) | 0) });
      }

      function differentialSourceKey(ch, g) {
        return differentialFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,192).key : params.fontWeight + ' 192px ' + params.fontFamily) + '\u0000' + ch;
      }

      function differentialGlyphData(ch, fontSpec) {
        var key = fontSpec ? fontSpec.key : differentialSourceKey(ch);
        if (differentialMaskCache.has(key)) return differentialMaskCache.get(key);
        var canvas = createRenderCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
        var font = fontSpec && fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,192).font : fontSpec ? fontSpec.font : params.fontWeight + ' 192px ' + params.fontFamily;
        ctx.font = font;
        var measure = ctx.measureText(ch); ctx.textBaseline = 'middle';
        var middle = ctx.measureText(ch);
        var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
          ? measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent : 192 * .35;
        var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 4;
        var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 192)) + 4;
        canvas.width = Math.max(8, Math.min(4096, left + Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 4));
        canvas.height = ascent + Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 4;
        ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
        var contours = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        var count = 0;
        contours = contours.map(function (contour) {
          count += contour.points.length;
          return { area: contour.area, points: contour.points.map(function (p) { return { x: p.x - left, y: p.y - ascent }; }) };
        });
        var result = { contours: contours, advance: measure.width, middleOffset: middleOffset, ascent: ascent - 4,
          descent: Math.max(0, measure.actualBoundingBoxDescent || 0), pointCount: count };
        while (differentialMaskCache.size && (differentialMaskCache.size >= 32 || differentialMaskPoints + count > 65536)) {
          var oldest = differentialMaskCache.keys().next().value;
          differentialMaskPoints -= differentialMaskCache.get(oldest).pointCount; differentialMaskCache.delete(oldest);
        }
        if (count <= 65536) { differentialMaskCache.set(key, result); differentialMaskPoints += count; }
        return result;
      }

      function differentialRequests(glyphs) {
        var requests = new Map();
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i];
          // Invisible Compose instances still prepare their complete trajectory, so
          // a later frame cannot start a new simulation halfway through recording.
          if (surfaceGlyphStrength(g, 'differentialType') <= .002 || !String(g.ch || '').trim()) continue;
          var settings = differentialGlyphSettings(g); if (settings.age <= 0) continue;
          var sourceKey = differentialSourceKey(g.ch,g), key = DifferentialGrowth.growthRequestKey(sourceKey, settings);
          var previous = requests.get(key);
          if (!previous || previous.settings.age < settings.age) requests.set(key, {
            sourceKey: sourceKey, settings: settings, load: differentialGlyphData.bind(null, g.ch,
              { key: sourceKey, font: params.fontWeight + ' 192px ' + params.fontFamily, glyph: g.fontAxes ? g : null })
          });
        }
        return Array.from(requests.values());
      }

      function differentialPrepare(glyphs) {
        if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
        differentialController.sync(differentialRequests(glyphs)); differentialScheduleWork();
      }

      function differentialAssertReady(glyphs) {
        if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
        var requests = differentialRequests(glyphs);
        for (var i = 0; i < requests.length; i++) if (!differentialController.isReady(requests[i].sourceKey, requests[i].settings)) {
          var failure = new Error('Differential Typeの成長計算が未完了です。キャンバスの「準備できました」を確認して、もう一度書き出してください。');
          failure.code = 'GROWTH_PENDING'; throw failure;
        }
      }

      function differentialShape(g, settings) {
        var profile = g.surface || {}, depth = Number.isFinite(profile.differentialMotion) ? profile.differentialMotion : params.differentialMotion;
        var age = compositionState.enabled ? DifferentialGrowth.growthLoopAge(compositionState.phase, settings.age, depth) : settings.age;
        if (age <= .00001) return null;
        return differentialController.read(differentialSourceKey(g.ch,g), settings, age);
      }

      function differentialEffectPad(glyphs) {
        var extra = 0, extents = new Map();
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i]; if (surfaceGlyphStrength(g, 'differentialType') <= .002 || !String(g.ch || '').trim()) continue;
          var settings = differentialGlyphSettings(g), key = JSON.stringify([differentialSourceKey(g.ch,g), settings, g.surface && g.surface.differentialMotion]);
          if (!extents.has(key)) {
            var shape = differentialShape(g, settings), extent = -1;
            if (shape) {
              var d = shape.data; extent = 0;
              for (var r = 0; r < shape.rings.length; r++) for (var p = 0; p < shape.rings[r].points.length; p++) {
                var point = shape.rings[r].points[p];
                extent = Math.max(extent, -point.x, point.x - d.advance, -point.y - d.ascent, point.y - d.descent);
              }
            }
            extents.set(key, extent);
          }
          var extent = extents.get(key); if (extent < 0) continue;
          var stretch = Math.max(Math.abs(g.scaleX || 1), Math.abs(g.scaleY || 1));
          var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
          extra = Math.max(extra, (extent + 8) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
        }
        return extra;
      }

      function renderDifferentialType(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'differentialType', width, height, pixelScale, L, fm), 'differentialType', true);
        var work = surfaceScratch('differential-type-v39-body', width, height, false), ctx = work.ctx;
        var color = surfaceEffectColor('differentialType'), samples = new Map();
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i], strength = surfaceGlyphStrength(g, 'differentialType');
          if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
          var settings = differentialGlyphSettings(g), key = JSON.stringify([differentialSourceKey(g.ch,g), settings, g.surface && g.surface.differentialMotion]);
          if (!samples.has(key)) samples.set(key, differentialShape(g, settings));
          var shape = samples.get(key);
          // Age zero retains native hinting/baseline. Pending preview is explicitly
          // native; strict render entry points reject it before drawing/exporting.
          if (!shape) { drawSurfaceGlyph(ctx, g, pixelScale, L, fm, strength, color); continue; }
          ctx.save(); spectralGlyphFrame(ctx, g, pixelScale, L, fm, shape.data);
          ctx.globalAlpha = strength * (g.opacity == null ? 1 : g.opacity); ctx.fillStyle = color;
          function trace(ring) {
            var points = ring.points; ctx.moveTo(points[0].x, points[0].y);
            for (var p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y); ctx.closePath();
          }
          ctx.beginPath(); shape.rings.forEach(function (ring) { if (ring.area > 0) trace(ring); });
          ctx.clip(); ctx.beginPath(); shape.rings.forEach(trace); ctx.fill('evenodd'); ctx.restore();
        }
        targetCtx.save(); targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height); targetCtx.restore();
      }
