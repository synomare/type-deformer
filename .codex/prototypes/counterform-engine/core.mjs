/*
 * Counterform Engine v42 prototype
 *
 * The input is one high-resolution glyph alpha mask. All construction happens
 * in that glyph-local frame: counters are labelled independently from exterior
 * paper, open bays are recovered as fallback chambers, and each grammar uses a
 * different material operation. There are no DOM, Canvas or camera inputs.
 */

export const COUNTERFORM_GRAMMARS = Object.freeze(['aperture', 'stencil', 'trap', 'channel']);

const TAU = Math.PI * 2;
const INF = 1e9;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function normalizeCounterformSettings(input = {}) {
  const grammar = COUNTERFORM_GRAMMARS.includes(input.grammar) ? input.grammar : 'aperture';
  return Object.freeze({
    grammar,
    pressure: finite(Number(input.pressure)),
    bridge: Math.max(0, finite(Number(input.bridge))),
    aperture: clamp(finite(Number(input.aperture), 0.35), 0, 1),
    angle: finite(Number(input.angle)) * Math.PI / 180,
    trap: Math.max(0, finite(Number(input.trap))),
    seed: Math.trunc(finite(Number(input.seed)))
  });
}

export function isCounterformNative(input = {}) {
  const settings = normalizeCounterformSettings(input);
  return Math.abs(settings.pressure) < 1e-6 && settings.bridge < 1e-6 && settings.trap < 1e-6;
}

function assertDimensions(width, height, length) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Counterform Engine: invalid source dimensions');
  }
  if (width > 4096 || height > 4096 || width * height > 8_388_608) {
    throw new RangeError('Counterform Engine: source exceeds the bounded glyph raster');
  }
  if (length !== width * height && length !== width * height * 4) {
    throw new RangeError('Counterform Engine: alpha source length does not match its dimensions');
  }
}

function alphaPlane(source, width, height) {
  assertDimensions(width, height, source.length);
  const count = width * height;
  const alpha = new Uint8ClampedArray(count);
  if (source.length === count) alpha.set(source);
  else for (let i = 0; i < count; i++) alpha[i] = source[i * 4 + 3];
  return alpha;
}

function boundsOf(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : [minX, minY, maxX, maxY];
}

export function counterformDistanceFromSeeds(seeds, width, height) {
  assertDimensions(width, height, seeds.length);
  const count = width * height;
  const distance = new Float32Array(count);
  for (let i = 0; i < count; i++) distance[i] = seeds[i] ? 0 : INF;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    let d = distance[i];
    if (x) d = Math.min(d, distance[i - 1] + 1);
    if (y) d = Math.min(d, distance[i - width] + 1);
    if (x && y) d = Math.min(d, distance[i - width - 1] + diagonal);
    if (x + 1 < width && y) d = Math.min(d, distance[i - width + 1] + diagonal);
    distance[i] = d;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    let d = distance[i];
    if (x + 1 < width) d = Math.min(d, distance[i + 1] + 1);
    if (y + 1 < height) d = Math.min(d, distance[i + width] + 1);
    if (x + 1 < width && y + 1 < height) d = Math.min(d, distance[i + width + 1] + diagonal);
    if (x && y + 1 < height) d = Math.min(d, distance[i + width - 1] + diagonal);
    distance[i] = d;
  }
  return distance;
}

function labelVoids(inside, distanceToInk, width, height) {
  const count = width * height;
  const outside = new Uint8Array(count);
  const counter = new Uint8Array(count);
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  function enqueue(index) {
    if (index < 0 || index >= count || inside[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail++] = index;
  }
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y + 1 < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);
    if (x) enqueue(current - 1);
    if (x + 1 < width) enqueue(current + 1);
    if (y) enqueue(current - width);
    if (y + 1 < height) enqueue(current + width);
  }
  for (let i = 0; i < count; i++) if (!inside[i] && !outside[i]) counter[i] = 1;

  const components = [];
  for (let start = 0; start < count; start++) {
    if (!counter[start] || visited[start]) continue;
    head = 0;
    tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let size = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let radius = 0;
    while (head < tail) {
      const cell = queue[head++];
      const x = cell % width;
      const y = Math.floor(cell / width);
      size++;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      radius = Math.max(radius, distanceToInk[cell]);
      const neighbours = [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
        y ? cell - width : -1, y + 1 < height ? cell + width : -1];
      for (const next of neighbours) if (next >= 0 && counter[next] && !visited[next]) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (size >= 4) components.push({
      x: sumX / size,
      y: sumY / size,
      size,
      minX,
      minY,
      maxX,
      maxY,
      radius: Math.max(1, radius),
      closed: true
    });
  }
  components.sort((a, b) => b.size - a.size);
  if (components.length > 64) components.length = 64;
  return { outside, counter, components };
}

function rayHitsInk(inside, width, height, x, y, dx, dy, reach) {
  for (let step = 1; step <= reach; step += 1.25) {
    const px = Math.round(x + dx * step);
    const py = Math.round(y + dy * step);
    if (px < 0 || px >= width || py < 0 || py >= height) return false;
    if (inside[py * width + px]) return true;
  }
  return false;
}

function recoverOpenChambers(inside, outside, distanceToInk, bounds, width, height) {
  if (!bounds) return [];
  const [minX, minY, maxX, maxY] = bounds;
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;
  const minSpan = Math.max(1, Math.min(spanX, spanY));
  const step = Math.max(2, Math.round(minSpan / 72));
  const minimumRadius = Math.max(2.25, minSpan * 0.022);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]];
  const candidates = [];
  for (let y = minY + step; y <= maxY - step; y += step) for (let x = minX + step; x <= maxX - step; x += step) {
    const index = y * width + x;
    if (!outside[index]) continue;
    const radius = distanceToInk[index];
    if (radius < minimumRadius || radius >= INF * 0.5) continue;
    let localMaximum = true;
    for (let oy = -step; oy <= step && localMaximum; oy += step) for (let ox = -step; ox <= step; ox += step) {
      if (!ox && !oy) continue;
      const nx = clamp(x + ox, 0, width - 1);
      const ny = clamp(y + oy, 0, height - 1);
      if (distanceToInk[ny * width + nx] > radius + 0.01) { localMaximum = false; break; }
    }
    if (!localMaximum) continue;
    const reach = Math.max(8, radius * 3.4);
    const hits = directions.map(([dx, dy]) => rayHitsInk(inside, width, height, x, y, dx, dy, reach));
    const hitCount = hits.reduce((sum, hit) => sum + Number(hit), 0);
    const opposing = Number(hits[0] && hits[1]) + Number(hits[2] && hits[3])
      + Number(hits[4] && hits[7]) + Number(hits[5] && hits[6]);
    if (hitCount < 3 || !opposing) continue;
    const edgeInset = Math.min(x - minX, maxX - x, y - minY, maxY - y);
    const enclosure = hitCount + opposing * 1.5 + Math.min(2, edgeInset / Math.max(1, radius));
    candidates.push({ x, y, radius, score: radius * enclosure, closed: false });
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.some(other => Math.hypot(candidate.x - other.x, candidate.y - other.y)
      < Math.max(candidate.radius, other.radius) * 1.65)) continue;
    const reach = candidate.radius * 1.25;
    chosen.push({
      ...candidate,
      size: Math.PI * candidate.radius * candidate.radius,
      minX: Math.max(minX, candidate.x - reach),
      minY: Math.max(minY, candidate.y - reach),
      maxX: Math.min(maxX, candidate.x + reach),
      maxY: Math.min(maxY, candidate.y + reach)
    });
    if (chosen.length >= 6) break;
  }
  return chosen;
}

function medialRidges(inside, distanceToVoid, bounds, width, height) {
  const ridge = new Uint8Array(width * height);
  if (!bounds) return ridge;
  const [minX, minY, maxX, maxY] = bounds;
  for (let y = Math.max(1, minY); y <= Math.min(height - 2, maxY); y++) {
    for (let x = Math.max(1, minX); x <= Math.min(width - 2, maxX); x++) {
      const i = y * width + x;
      const depth = distanceToVoid[i];
      if (!inside[i] || depth < 2) continue;
      const horizontal = depth >= distanceToVoid[i - 1] && depth >= distanceToVoid[i + 1]
        && (depth > distanceToVoid[i - 1] || depth > distanceToVoid[i + 1]);
      const vertical = depth >= distanceToVoid[i - width] && depth >= distanceToVoid[i + width]
        && (depth > distanceToVoid[i - width] || depth > distanceToVoid[i + width]);
      const diagonalA = depth >= distanceToVoid[i - width - 1] && depth >= distanceToVoid[i + width + 1];
      const diagonalB = depth >= distanceToVoid[i - width + 1] && depth >= distanceToVoid[i + width - 1];
      if ((horizontal || vertical) && (diagonalA || diagonalB)) ridge[i] = 1;
    }
  }
  return ridge;
}

export function prepareCounterformBody(source, width, height, options = {}) {
  const alpha = alphaPlane(source, width, height);
  const threshold = clamp(finite(Number(options.threshold), 127.5), 1, 254);
  const inside = new Uint8Array(width * height);
  const voidSeeds = new Uint8Array(width * height);
  for (let i = 0; i < inside.length; i++) {
    inside[i] = alpha[i] > threshold ? 1 : 0;
    voidSeeds[i] = inside[i] ? 0 : 1;
  }
  const bounds = boundsOf(inside, width, height);
  const distanceToInk = counterformDistanceFromSeeds(inside, width, height);
  const distanceToVoid = counterformDistanceFromSeeds(voidSeeds, width, height);
  const topology = labelVoids(inside, distanceToInk, width, height);
  const exteriorDistance = counterformDistanceFromSeeds(topology.outside, width, height);
  const counterDistance = topology.components.length
    ? counterformDistanceFromSeeds(topology.counter, width, height)
    : new Float32Array(width * height).fill(INF);
  const openChambers = recoverOpenChambers(inside, topology.outside, distanceToInk, bounds, width, height);
  const ridge = medialRidges(inside, distanceToVoid, bounds, width, height);
  const ridgeDistance = counterformDistanceFromSeeds(ridge, width, height);
  return Object.freeze({
    width,
    height,
    alpha,
    inside,
    bounds,
    distanceToInk,
    distanceToVoid,
    exteriorDistance,
    counterDistance,
    ridge,
    ridgeDistance,
    topology,
    openChambers
  });
}

function raySegment(body, component, angle) {
  const { inside, width, height } = body;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const limit = Math.hypot(width, height) * 0.48;
  let entered = false;
  let entry = null;
  let last = null;
  for (let step = 0; step <= limit; step += 0.75) {
    const x = Math.round(component.x + dx * step);
    const y = Math.round(component.y + dy * step);
    if (x < 0 || x >= width || y < 0 || y >= height) {
      if (entered) return { entry, exit: last || { x, y }, dx, dy, length: step };
      return null;
    }
    const ink = !!inside[y * width + x];
    if (ink && !entered) {
      entered = true;
      entry = { x, y, step };
    }
    if (entered && !ink) return { entry, exit: { x, y, step }, dx, dy, length: step };
    if (entered) last = { x, y, step };
  }
  return null;
}

function bestExit(body, component, angle) {
  const forward = raySegment(body, component, angle);
  const reverse = raySegment(body, component, angle + Math.PI);
  // Angle is an authored direction, not a hint to be silently flipped toward
  // the shortest wall. Only fall back to the opposite ray when the requested
  // ray never reaches a usable body segment.
  return forward || reverse;
}

function componentWall(body, component) {
  const spans = [];
  for (let i = 0; i < 16; i++) {
    const segment = raySegment(body, component, i * TAU / 16);
    if (segment) spans.push(Math.max(1, segment.exit.step - segment.entry.step));
  }
  if (!spans.length) return Math.max(2, Math.min(component.maxX - component.minX, component.maxY - component.minY) * 0.2);
  spans.sort((a, b) => a - b);
  return spans[Math.floor((spans.length - 1) * 0.45)];
}

function paintTaper(mask, width, height, from, to, startHalf, endHalf, curvature = 0, value = 1) {
  if (mask.presentationTapers) mask.presentationTapers.push({ from, to, startHalf, endHalf, curvature, value });
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const sx = -uy;
  const sy = ux;
  const reach = Math.max(startHalf, endHalf) + Math.abs(curvature) + 2;
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - reach));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + reach));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - reach));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + reach));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const rx = x + 0.5 - from.x;
    const ry = y + 0.5 - from.y;
    const projection = rx * ux + ry * uy;
    if (projection < 0 || projection > length) continue;
    const t = projection / length;
    const eased = t * t * (3 - 2 * t);
    const half = startHalf + (endHalf - startHalf) * eased;
    const bend = Math.sin(t * Math.PI) * curvature;
    const side = rx * sx + ry * sy - bend;
    if (Math.abs(side) <= half) mask[y * width + x] = value;
  }
}

function carveAperture(body, output, components, settings) {
  const { width, height, counterDistance } = body;
  for (let c = 0; c < components.length; c++) {
    const component = components[c];
    const spanX = Math.max(2, component.maxX - component.minX + 1);
    const spanY = Math.max(2, component.maxY - component.minY + 1);
    const span = Math.max(spanX, spanY);
    const wall = componentWall(body, component);
    const chamberGrowRaw = Math.max(0, settings.pressure) * (0.42 + settings.aperture * 0.25)
      + Math.min(spanX, spanY) * settings.aperture * 0.12
      + settings.bridge * (0.08 + settings.aperture * 0.08);
    const chamberGrow = Math.min(chamberGrowRaw, wall * (0.22 + settings.aperture * 0.42));
    if (output.presentationChambers) output.presentationChambers.push({ component, c, chamberGrow });
    if (chamberGrow > 0.25) {
      const pad = Math.ceil(chamberGrow * 1.35 + component.radius * 0.12);
      const minX = Math.max(0, Math.floor(component.minX - pad));
      const maxX = Math.min(width - 1, Math.ceil(component.maxX + pad));
      const minY = Math.max(0, Math.floor(component.minY - pad));
      const maxY = Math.min(height - 1, Math.ceil(component.maxY + pad));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const index = y * width + x;
        if (!output[index]) continue;
        const theta = Math.atan2(y - component.y, x - component.x);
        const reciprocal = 0.72 + 0.22 * Math.abs(Math.cos(theta - settings.angle))
          + 0.1 * Math.sin(theta * 3 + settings.angle + c * 0.73);
        let distance;
        if (component.closed) distance = counterDistance[index];
        else distance = Math.max(0, Math.hypot(x - component.x, y - component.y) - component.radius);
        const reciprocalLimit = 0.52 + settings.aperture * 0.4;
        if (distance <= chamberGrow * reciprocal
          && distance < body.exteriorDistance[index] * reciprocalLimit) output[index] = 0;
      }
    }
    const exit = bestExit(body, component, settings.angle + c * 0.17);
    if (!exit || settings.bridge <= 0.1) continue;
    const throat = Math.max(0.7, settings.bridge * (0.055 + settings.aperture * 0.085));
    const mouth = Math.min(wall * (0.52 + settings.aperture * 0.25), Math.max(throat * 1.7,
      settings.bridge * (0.24 + settings.aperture * 0.56),
      span * settings.aperture * 0.065));
    paintTaper(output, width, height,
      { x: component.x, y: component.y },
      { x: exit.exit.x + exit.dx * 2, y: exit.exit.y + exit.dy * 2 },
      throat, mouth, Math.sin(settings.angle + c * 1.31) * mouth * settings.aperture * 0.28, 0);
  }
}

function carveStencil(body, output, components, settings) {
  const count = 1 + Math.min(3, Math.floor(settings.aperture * 3.999));
  const directions = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
  for (let c = 0; c < components.length; c++) {
    const component = components[c];
    const span = Math.max(3, component.maxX - component.minX + 1, component.maxY - component.minY + 1);
    const half = Math.max(0.7, Math.min(span * 0.16,
      settings.bridge * (0.12 + settings.aperture * 0.22)));
    for (let slot = 0; slot < count; slot++) {
      const segment = raySegment(body, component, settings.angle + directions[slot]);
      if (!segment || settings.bridge <= 0.1) continue;
      paintTaper(output, body.width, body.height,
        { x: segment.entry.x - segment.dx * 1.5, y: segment.entry.y - segment.dy * 1.5 },
        { x: segment.exit.x + segment.dx * 2.5, y: segment.exit.y + segment.dy * 2.5 },
        half, half * (0.9 + settings.aperture * 0.18), 0, 0);
    }
  }
}

function carveTraps(body, output, components, settings) {
  const count = 2 + Math.min(5, Math.round(settings.aperture * 5));
  for (let c = 0; c < components.length; c++) {
    const component = components[c];
    const span = Math.max(3, component.maxX - component.minX + 1, component.maxY - component.minY + 1);
    for (let n = 0; n < count; n++) {
      const angle = settings.angle + n * TAU / count + c * 0.11;
      const segment = raySegment(body, component, angle);
      if (!segment || settings.trap <= 0.1) continue;
      const available = Math.max(1, segment.exit.step - segment.entry.step);
      const depth = Math.max(0.8, Math.min(available * 0.88,
        settings.trap * (0.64 + settings.aperture * 1.02), span * (0.16 + settings.aperture * 0.24)));
      const rootHalf = Math.max(0.7, Math.min(span * 0.13,
        settings.bridge * 0.14 + settings.trap * (0.085 + settings.aperture * 0.06)));
      paintTaper(output, body.width, body.height,
        { x: segment.entry.x - segment.dx, y: segment.entry.y - segment.dy },
        { x: segment.entry.x + segment.dx * depth, y: segment.entry.y + segment.dy * depth },
        rootHalf, Math.max(0.15, rootHalf * 0.08), 0, 0);
    }
  }
}

function carveChannels(body, output, settings) {
  const { width, height, bounds, ridgeDistance, distanceToVoid } = body;
  if (!bounds || settings.bridge <= 0.1) return;
  const [minX, minY, maxX, maxY] = bounds;
  const baseWidth = Math.max(0.7, settings.bridge * (0.1 + settings.aperture * 0.18));
  const period = Math.max(10, settings.bridge * (1.1 + settings.aperture * 1.4));
  const cos = Math.cos(settings.angle);
  const sin = Math.sin(settings.angle);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const index = y * width + x;
    if (!output[index]) continue;
    const depth = distanceToVoid[index];
    const localWidth = Math.min(baseWidth * (0.82 + Math.min(1.5, depth / Math.max(1, baseWidth * 2)) * 0.22),
      depth * (0.3 + settings.aperture * 0.18));
    if (localWidth < 0.55 || ridgeDistance[index] > localWidth || depth <= localWidth * 1.12) continue;
    const coordinate = x * cos + y * sin + settings.seed * 0.618;
    const phase = ((coordinate / period) % 1 + 1) % 1;
    const valve = 0.055 + (1 - settings.aperture) * 0.06;
    if (phase < valve || phase > 1 - valve) continue;
    output[index] = 0;
  }
}

function applyPressure(body, output, settings) {
  if (settings.pressure > 0 && body.topology.components.length) {
    const grow = settings.pressure * (0.3 + settings.aperture * 0.24);
    const wallRatio = 0.4 + settings.aperture * 0.26;
    for (let i = 0; i < output.length; i++) {
      if (output[i] && body.counterDistance[i] <= grow
        && body.counterDistance[i] < body.exteriorDistance[i] * wallRatio) output[i] = 0;
    }
  } else if (settings.pressure < 0 && body.topology.components.length) {
    const fill = -settings.pressure * (0.48 + (1 - settings.aperture) * 0.24);
    for (let i = 0; i < output.length; i++) {
      if (!output[i] && body.topology.counter[i] && body.distanceToInk[i] <= fill) output[i] = 1;
    }
  }
}

export function renderCounterformBody(body, input = {}) {
  if (!body || !body.inside || !body.topology) throw new TypeError('Counterform Engine: prepared body required');
  const settings = normalizeCounterformSettings(input);
  const output = body.inside.slice();
  output.presentationTapers = [];
  output.presentationChambers = [];
  if (!body.bounds || isCounterformNative(settings)) {
    return { mask: output, settings, metrics: counterformMaskMetrics(output, body.width, body.height) };
  }
  applyPressure(body, output, settings);
  const components = body.topology.components.length ? body.topology.components
    : body.openChambers.slice(0, 1 + Math.min(2, Math.round(settings.aperture * 2)));
  if (settings.grammar === 'aperture') carveAperture(body, output, components, settings);
  else if (settings.grammar === 'stencil') carveStencil(body, output, components, settings);
  else if (settings.grammar === 'trap') carveTraps(body, output, components, settings);
  else carveChannels(body, output, settings);
  return {
    mask: output,
    settings,
    metrics: {
      ...counterformMaskMetrics(output, body.width, body.height),
      counters: body.topology.components.length,
      openChambers: body.openChambers.length,
      grammar: settings.grammar
    }
  };
}

// A single-glyph reconstruction of the shipped v29 modern renderer. It exists
// only for like-for-like offline comparisons and is not used by the editor.
export function renderCounterformV29Reference(body, input = {}) {
  const settings = normalizeCounterformSettings(input);
  const output = body.inside.slice();
  if (!body.bounds) return { mask: output, settings };
  const morph = Math.abs(settings.pressure) * (0.28 + settings.aperture * 0.32);
  if (settings.pressure > 0 && body.topology.components.length) {
    for (let i = 0; i < output.length; i++) if (output[i] && body.counterDistance[i] <= morph) output[i] = 0;
  } else if (settings.pressure < 0) {
    for (let i = 0; i < output.length; i++) if (!output[i] && body.topology.counter[i] && body.distanceToInk[i] <= morph) output[i] = 1;
  }
  const components = body.topology.components;
  if (settings.grammar === 'channel') {
    const width = Math.max(0.35, settings.bridge * (0.045 + settings.aperture * 0.16));
    for (let i = 0; i < output.length; i++) {
      if (output[i] && body.ridgeDistance[i] <= width && body.distanceToVoid[i] > width * 1.32) output[i] = 0;
    }
  } else for (const component of components) {
    const spanX = Math.max(3, component.maxX - component.minX);
    const spanY = Math.max(3, component.maxY - component.minY);
    const span = Math.max(spanX, spanY);
    if (settings.grammar === 'stencil' && settings.bridge > 0.2) {
      const length = Math.min(span * 0.62, Math.hypot(spanX, spanY) * 0.54);
      const dx = Math.cos(settings.angle) * length;
      const dy = Math.sin(settings.angle) * length;
      const half = Math.max(0.4, Math.min(span * 0.21, settings.bridge * (0.21 + settings.aperture * 0.36)));
      paintTaper(output, body.width, body.height,
        { x: component.x - dx, y: component.y - dy }, { x: component.x + dx, y: component.y + dy },
        half, half, 0, 1);
    } else if (settings.grammar === 'aperture') {
      const exit = bestExit(body, component, settings.angle);
      if (!exit) continue;
      const throat = Math.max(0.8, settings.bridge * (0.08 + settings.aperture * 0.16));
      const mouth = Math.max(throat * 1.3, settings.bridge * (0.34 + settings.aperture * 0.9), span * settings.aperture * 0.14);
      paintTaper(output, body.width, body.height, component, exit.exit, throat, mouth, 0, 0);
    } else if (settings.grammar === 'trap' && settings.trap > 0.2) {
      for (const angle of [settings.angle, settings.angle + Math.PI]) {
        const segment = raySegment(body, component, angle);
        if (!segment) continue;
        const spanLength = Math.min(settings.trap, Math.max(1, segment.exit.step - segment.entry.step));
        const half = Math.max(0.8, Math.min(span * 0.28, settings.bridge * 0.36 + settings.trap * 0.1));
        paintTaper(output, body.width, body.height, segment.entry,
          { x: segment.entry.x + segment.dx * spanLength, y: segment.entry.y + segment.dy * spanLength },
          half, 0.2, 0, 0);
      }
    }
  }
  return { mask: output, settings, metrics: counterformMaskMetrics(output, body.width, body.height) };
}

export function counterformMaskMetrics(mask, width, height) {
  assertDimensions(width, height, mask.length);
  let ink = 0;
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let components = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) ink++;
    if (!mask[i] || visited[i]) continue;
    components++;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    while (head < tail) {
      const cell = queue[head++];
      const x = cell % width;
      const y = Math.floor(cell / width);
      const neighbours = [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
        y ? cell - width : -1, y + 1 < height ? cell + width : -1];
      for (const next of neighbours) if (next >= 0 && mask[next] && !visited[next]) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return { ink, inkRatio: ink / Math.max(1, mask.length), components, bounds: boundsOf(mask, width, height) };
}

export function counterformMaskDistance(a, b) {
  if (!a || !b || a.length !== b.length) throw new RangeError('Counterform Engine: incomparable masks');
  let union = 0;
  let difference = 0;
  let intersection = 0;
  for (let i = 0; i < a.length; i++) {
    const av = !!a[i];
    const bv = !!b[i];
    if (av || bv) union++;
    if (av && bv) intersection++;
    if (av !== bv) difference++;
  }
  return { difference, union, intersection, normalized: difference / Math.max(1, union), iou: intersection / Math.max(1, union) };
}

export function counterformMaskToRgba(mask, width, height) {
  assertDimensions(width, height, mask.length);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

export function traceCounterformMask(mask, width, height) {
  assertDimensions(width, height, mask.length);
  const stride = width + 2;
  const vertices = new Map();
  const outgoing = new Map();
  const segments = [];
  function value(x, y) {
    return x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];
  }
  function crossing(x, y, vertical) {
    const key = ((y + 1) * stride + x + 1) * 2 + (vertical ? 1 : 0);
    if (!vertices.has(key)) vertices.set(key, {
      x: x + 0.5 + (vertical ? 0 : 0.5),
      y: y + 0.5 + (vertical ? 0.5 : 0)
    });
    return key;
  }
  function segment(start, end) {
    outgoing.set(start, segments.length);
    segments.push({ start, end });
  }
  for (let y = -1; y < height; y++) for (let x = -1; x < width; x++) {
    const a = value(x, y);
    const b = value(x + 1, y);
    const c = value(x + 1, y + 1);
    const d = value(x, y + 1);
    const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (!code || code === 15) continue;
    const values = [a, b, c, d];
    const cross = [-1, -1, -1, -1];
    let enter = -1;
    let leave = -1;
    let count = 0;
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      if (!!values[side] === !!values[next]) continue;
      if (side === 0) cross[side] = crossing(x, y, false);
      else if (side === 1) cross[side] = crossing(x + 1, y, true);
      else if (side === 2) cross[side] = crossing(x, y + 1, false);
      else cross[side] = crossing(x, y, true);
      if (values[side]) leave = cross[side];
      else enter = cross[side];
      count++;
    }
    if (count === 2) segment(leave, enter);
    else if (count === 4) for (let corner = 0; corner < 4; corner++) {
      if (values[corner]) segment(cross[corner], cross[(corner + 3) % 4]);
    }
  }
  const visited = new Uint8Array(segments.length);
  const contours = [];
  for (let first = 0; first < segments.length; first++) {
    if (visited[first]) continue;
    let index = first;
    const points = [];
    let area = 0;
    let closed = false;
    const origin = segments[first].start;
    while (index !== undefined && !visited[index]) {
      const edge = segments[index];
      const from = vertices.get(edge.start);
      const to = vertices.get(edge.end);
      visited[index] = 1;
      points.push(from);
      area += from.x * to.y - to.x * from.y;
      if (edge.end === origin) { closed = true; break; }
      index = outgoing.get(edge.end);
    }
    if (closed && points.length >= 3 && Math.abs(area) > 1e-6) contours.push({ points, area: area * 0.5 });
  }
  return contours;
}
