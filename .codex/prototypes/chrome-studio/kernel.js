// Authored height-field/environment experiment. Not a full physical BRDF.
// No environment photos, reference artwork, external code or fonts included.
      function chromeStudioBlur(values, width, height, radius) {
        var temp = new Float32Array(values.length), result = new Float32Array(values.length), n = radius * 2 + 1;
        for (var y = 0; y < height; y++) {
          var sum = 0, row = y * width;
          for (var k = -radius; k <= radius; k++) sum += values[row + Math.max(0, Math.min(width - 1, k))];
          for (var x = 0; x < width; x++) {
            temp[row + x] = sum / n;
            sum += values[row + Math.min(width - 1, x + radius + 1)] - values[row + Math.max(0, x - radius)];
          }
        }
        for (var x = 0; x < width; x++) {
          var sum = 0;
          for (var k = -radius; k <= radius; k++) sum += temp[Math.max(0, Math.min(height - 1, k)) * width + x];
          for (var y = 0; y < height; y++) {
            result[y * width + x] = sum / n;
            sum += temp[Math.min(height - 1, y + radius + 1) * width + x] - temp[Math.max(0, y - radius) * width + x];
          }
        }
        return result;
      }

      function chromeStudioEnvironment(bands, roughness, voltage, phase) {
        var width = 256, height = 128, data = new Float32Array(width * height * 3);
        var softness = 0.045 + roughness * roughness * 0.38;
        var acid = Math.max(0, Math.min(1, voltage / 6));
        function panel(distance, extent) {
          var t = Math.max(0, Math.min(1, (extent + softness - distance) / (2 * softness)));
          return t * t * (3 - 2 * t);
        }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var u = x / width * Math.PI * 2 - Math.PI, v = (y / (height - 1) - 0.5) * Math.PI;
          // A large white softbox, a dark floor and narrow reflected strips.
          // Their unequal scales create a readable body, shadow and highlight.
          var horizon = 0.012 + 0.045 * Math.max(0, Math.sin(v + 0.6));
          var main = panel(Math.abs(u + 0.5), 0.46) * panel(Math.abs(v + 0.3), 0.68)
            * (3 + 6 * Math.exp(-((u + 0.45) * (u + 0.45) * 4 + v * v * 1.4)));
          var side = panel(Math.abs(u - 1.12), 0.28) * panel(Math.abs(v - 0.2), 0.88) * 2.8;
          var strip = Math.pow(Math.max(0, Math.cos(u * bands + v * 0.38 + Math.sin(phase) * 0.6)), 12 - roughness * 9)
            * panel(Math.abs(v - 0.32), 0.43) * 1.8;
          var offset = (y * width + x) * 3;
          for (var ch = 0; ch < 3; ch++) {
            var color = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(u * 2.1 + v * 3.4 + ch * Math.PI * 2 / 3 + Math.sin(phase) * 0.85));
            data[offset + ch] = horizon * (1 + ch * 0.1) + main * (1 - acid * 0.65 + acid * color * 0.65)
              + side * (1 - acid * 0.86 + acid * color * 0.86) + strip * (1 - acid * 0.4 + acid * color * 0.4);
          }
        }
        return { width: width, height: height, data: data };
      }

      function chromeStudioRelief(field, width, height, bevel) {
        // Screened Poisson relaxation, with a zero-height silhouette boundary.
        // Unlike nearest-edge normals, the interior has no Voronoi crease at
        // the medial axis: adjoining strokes form one continuous metal skin.
        var a = new Float32Array(width * height), active = [[], []];
        var lambda = 4 / (bevel * bevel), load = 4 / bevel;
        for (var i = 0; i < a.length; i++) if (field.inside[i]) {
          a[i] = bevel * (1 - Math.exp(-field.distance[i] / bevel));
          active[((i % width) + Math.floor(i / width)) % 2].push(i);
        }
        for (var iteration = 0; iteration < Math.min(160, Math.max(24, Math.ceil(bevel * 6))); iteration++) {
          for (var parity = 0; parity < 2; parity++) for (var n = 0; n < active[parity].length; n++) {
            var i = active[parity][n], x = i % width;
            var target = ((x ? a[i - 1] : 0) + (x + 1 < width ? a[i + 1] : 0)
              + (i >= width ? a[i - width] : 0) + (i + width < a.length ? a[i + width] : 0) + load) / (4 + lambda);
            a[i] = Math.max(0, a[i] + 1.55 * (target - a[i]));
          }
        }
        return a;
      }

      function chromeStudioPlate(shape, weighted, width, height, settings) {
        var field = surfaceBoundaryDistance(shape, width, height), result = new Uint8ClampedArray(width * height * 4);
        if (!field.bounds) return result;
        var bevel = Math.max(0.5, settings.bevel), phase = settings.phase, warp = settings.warp;
        var heights = chromeStudioRelief(field, width, height, bevel);
        var span = Math.max(1, field.bounds[2] - field.bounds[0], field.bounds[3] - field.bounds[1]);
        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5, centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var i = y * width + x;
          if (!field.inside[i]) continue;
          var d = Math.max(0, field.distance[i]), u = (x - centerX) / span, v = (y - centerY) / span;
          var body = heights[i];
          var wave = Math.sin(u * 14 + Math.sin(phase) * 0.9) * Math.cos(v * 11 + Math.cos(phase) * 0.7)
            + 0.36 * Math.sin((u + v) * 24 - Math.sin(phase) * 0.6);
          heights[i] = body * (1 + warp * 0.24 * wave);
        }
        heights = chromeStudioBlur(heights, width, height, Math.max(1, Math.min(8, Math.round(bevel * 0.13))));
        var env = chromeStudioEnvironment(settings.bands, settings.roughness, settings.voltage, phase);
        var angle = settings.angle + Math.sin(phase) * 0.38, cos = Math.cos(angle), sin = Math.sin(angle);
        var exposure = 0.6 + settings.contrast * 0.64;
        var tint = settings.color.map(function (v) { return 0.38 + 0.62 * Math.pow(v / 255, 2.2); });
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var i = y * width + x, offset = i * 4;
          if (!weighted[offset + 3]) continue;
          var dx = (heights[y * width + Math.min(width - 1, x + 1)] - heights[y * width + Math.max(0, x - 1)]) * 0.5;
          var dy = (heights[Math.min(height - 1, y + 1) * width + x] - heights[Math.max(0, y - 1) * width + x]) * 0.5;
          var inv = 1 / Math.sqrt(1 + dx * dx + dy * dy), nx = -dx * inv, ny = -dy * inv, nz = inv;
          var rx = 2 * nx * nz, ry = 2 * ny * nz, rz = 2 * nz * nz - 1;
          var ru = rx * cos - ry * sin, rv = rx * sin + ry * cos;
          var eu = ((Math.atan2(ru, rz) / (Math.PI * 2) + 0.5) * env.width + env.width) % env.width;
          var ev = (Math.asin(Math.max(-1, Math.min(1, rv))) / Math.PI + 0.5) * (env.height - 1);
          var x0 = Math.floor(eu), y0 = Math.floor(ev), fx = eu - x0, fy = ev - y0;
          for (var ch = 0; ch < 3; ch++) {
            var a = env.data[(y0 * env.width + x0) * 3 + ch];
            var b = env.data[(y0 * env.width + (x0 + 1) % env.width) * 3 + ch];
            var c = env.data[(Math.min(env.height - 1, y0 + 1) * env.width + x0) * 3 + ch];
            var d = env.data[(Math.min(env.height - 1, y0 + 1) * env.width + (x0 + 1) % env.width) * 3 + ch];
            var light = ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
            var fresnel = tint[ch] + (1 - tint[ch]) * Math.pow(1 - nz, 5);
            var energy = Math.max(0, light * fresnel * exposure);
            result[offset + ch] = Math.round(255 * Math.pow(energy / (1 + energy), 1 / 2.2));
          }
          result[offset + 3] = weighted[offset + 3];
        }
        return result;
      }
