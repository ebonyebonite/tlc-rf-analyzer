// Image processing for TLC plates.
// Coordinates are continuous image coordinates: pixel (x, y) covers [x, x+1) × [y, y+1),
// so its centre is (x + 0.5, y + 0.5).

// ---------- loading ----------

export async function fileToCanvas(file, maxSide = 3200) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try { src = await loadImg(url); } finally { URL.revokeObjectURL(url); }
  }
  return toCanvas(src, maxSide);
}

export async function dataUrlToCanvas(url) {
  return toCanvas(await loadImg(url), Infinity);
}

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('decode failed'));
    im.src = url;
  });
}

function toCanvas(src, maxSide) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error('empty image');
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  return c;
}

// ---------- perspective ----------

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('singular');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Homography mapping from[i] → to[i] (4 point pairs). */
export function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...solve(A, b), 1];
}

/** Rectifies quad (TL, TR, BR, BL in source) into a W×H canvas. */
export function warp(srcData, quad, W, H) {
  const Hm = homography([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], quad);
  const sw = srcData.width, sh = srcData.height, sd = srcData.data;
  const out = new ImageData(W, H), od = out.data;
  let o = 0;
  for (let v = 0; v < H; v++) {
    const Y = v + 0.5;
    for (let u = 0; u < W; u++) {
      const X = u + 0.5;
      const w = Hm[6] * X + Hm[7] * Y + Hm[8];
      let x = (Hm[0] * X + Hm[1] * Y + Hm[2]) / w - 0.5;
      let y = (Hm[3] * X + Hm[4] * Y + Hm[5]) / w - 0.5;
      if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1;
      if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1;
      const x0 = x | 0, y0 = y | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0, y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
        const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
        od[o + c] = top * (1 - fy) + bot * fy;
      }
      od[o + 3] = 255;
      o += 4;
    }
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

// ---------- plate detection ----------

/** Finds the plate as the largest saturated (or bright) region. Returns [TL, TR, BR, BL] or null. */
export function detectPlate(canvas) {
  const s = Math.min(1, 400 / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * s)), h = Math.max(1, Math.round(canvas.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const n = w * h, chroma = new Float32Array(n), val = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    chroma[i] = (mx - mn) / 255;
    val[i] = mx / 255;
  }
  for (const score of [chroma, val]) {
    const q = plateFromScore(score, w, h);
    if (q) return q.map(p => ({ x: p.x / s, y: p.y / s }));
  }
  return null;
}

function otsu(values) {
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.min(255, Math.max(0, Math.round(v * 255)))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = 0, thr = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  return (thr + 0.5) / 255;
}

function plateFromScore(score, w, h) {
  const n = w * h, t = otsu(score);
  const m = new Uint8Array(n);
  let cnt = 0;
  for (let i = 0; i < n; i++) if (score[i] > t) { m[i] = 1; cnt++; }
  if (cnt < n * 0.01 || cnt > n * 0.9) return null;

  // Label on a dilated mask so thin pencil lines don't split the plate.
  const dm = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) dm[ny * w + nx] = 1;
    }
  }
  const lab = new Int32Array(n);
  let cur = 0, best = 0, bestN = 0;
  for (let i0 = 0; i0 < n; i0++) {
    if (!dm[i0] || lab[i0]) continue;
    cur++;
    let count = 0;
    const stack = [i0];
    lab[i0] = cur;
    while (stack.length) {
      const i = stack.pop();
      if (m[i]) count++;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && dm[i - 1] && !lab[i - 1]) { lab[i - 1] = cur; stack.push(i - 1); }
      if (x < w - 1 && dm[i + 1] && !lab[i + 1]) { lab[i + 1] = cur; stack.push(i + 1); }
      if (y > 0 && dm[i - w] && !lab[i - w]) { lab[i - w] = cur; stack.push(i - w); }
      if (y < h - 1 && dm[i + w] && !lab[i + w]) { lab[i + w] = cur; stack.push(i + w); }
    }
    if (count > bestN) { bestN = count; best = cur; }
  }
  if (bestN < n * 0.005) return null;

  // Hysteresis: extend the plate into weaker pixels connected to it (dim corners, glare).
  let bgSum = 0, bgN = 0;
  for (let i = 0; i < n; i++) if (!m[i]) { bgSum += score[i]; bgN++; }
  const weakT = bgSum / bgN + 0.35 * (t - bgSum / bgN);
  const plate = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (m[i] && lab[i] === best) { plate[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !plate[j] && score[j] > weakT) { plate[j] = 1; stack.push(j); }
    }
  }

  // Outline points: left/right extremes of each row (pixel corners).
  const pts = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) {
      if (plate[y * w + x]) { if (l < 0) l = x; r = x; }
    }
    if (l >= 0) pts.push({ x: l, y }, { x: l, y: y + 1 }, { x: r + 1, y }, { x: r + 1, y: y + 1 });
  }
  const hull = convexHull(pts);
  if (hull.length < 4) return null;
  const quad = maxAreaQuad(hull);
  if (polyArea(quad) < bestN * 0.6) return null;
  return orderCorners(quad);
}

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    a += q.x * r.y - r.x * q.y;
  }
  return Math.abs(a) / 2;
}

/** Largest quadrilateral with vertices on the hull: brute force on a subsample, then per-corner refinement. */
function maxAreaQuad(h) {
  const n = h.length, m = Math.min(n, 40);
  const sub = Array.from({ length: m }, (_, k) => Math.floor(k * n / m));
  const area = idx => polyArea(idx.map(i => h[i]));
  let best = null, bestA = -1;
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) for (let k = j + 1; k < m; k++) for (let l = k + 1; l < m; l++) {
    const idx = [sub[i], sub[j], sub[k], sub[l]], a = area(idx);
    if (a > bestA) { bestA = a; best = idx; }
  }
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (let p = 0; p < 4; p++) {
      const lo = best[(p + 3) % 4], hi = best[(p + 1) % 4];
      for (let c = (lo + 1) % n; c !== hi; c = (c + 1) % n) {
        const idx = [...best];
        idx[p] = c;
        const a = area(idx);
        if (a > bestA + 1e-9) { bestA = a; best = idx; changed = true; }
      }
    }
    if (!changed) break;
  }
  return best.map(i => h[i]);
}

function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const s = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let k = 0;
  for (let i = 1; i < 4; i++) if (s[i].x + s[i].y < s[k].x + s[k].y) k = i;
  return [0, 1, 2, 3].map(i => s[(i + k) % 4]);
}

// ---------- colour ----------

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const labF = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** CIELAB (D65) for every pixel, packed [L, a, b, L, a, b, …]. */
export function toLab(imgData) {
  const d = imgData.data, n = imgData.width * imgData.height, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = LIN[d[i * 4]], g = LIN[d[i * 4 + 1]], b = LIN[d[i * 4 + 2]];
    const fx = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const fy = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    out[i * 3] = 116 * fy - 16;
    out[i * 3 + 1] = 500 * (fx - fy);
    out[i * 3 + 2] = 200 * (fy - fz);
  }
  return out;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = Float32Array.from(arr).sort();
  return s[s.length >> 1];
}

/** Smooth background estimate: block medians, 3×3 median over blocks, bilinear upsampling. */
export function backgroundLab(lab, W, H) {
  const bs = Math.max(6, Math.round(Math.min(W, H) / 5));
  const gx = Math.max(1, Math.round(W / bs)), gy = Math.max(1, Math.round(H / bs));
  const grid = new Float32Array(gx * gy * 3);
  const tmp = [[], [], []];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const x0 = Math.floor(i * W / gx), x1 = Math.floor((i + 1) * W / gx);
    const y0 = Math.floor(j * H / gy), y1 = Math.floor((j + 1) * H / gy);
    const step = Math.max(1, Math.floor(Math.sqrt((x1 - x0) * (y1 - y0) / 1500)));
    tmp.forEach(a => (a.length = 0));
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const k = (y * W + x) * 3;
      tmp[0].push(lab[k]); tmp[1].push(lab[k + 1]); tmp[2].push(lab[k + 2]);
    }
    for (let c = 0; c < 3; c++) grid[(j * gx + i) * 3 + c] = median(tmp[c]);
  }
  const g2 = new Float32Array(grid.length);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) for (let c = 0; c < 3; c++) {
    const nb = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < gx && b < gy) nb.push(grid[(b * gx + a) * 3 + c]);
    }
    g2[(j * gx + i) * 3 + c] = median(nb);
  }
  const bg = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(gy - 1, Math.max(0, (y + 0.5) * gy / H - 0.5));
    const j0 = Math.floor(fy), j1 = Math.min(gy - 1, j0 + 1), ty = fy - j0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(gx - 1, Math.max(0, (x + 0.5) * gx / W - 0.5));
      const i0 = Math.floor(fx), i1 = Math.min(gx - 1, i0 + 1), tx = fx - i0;
      for (let c = 0; c < 3; c++) {
        const a = g2[(j0 * gx + i0) * 3 + c], b = g2[(j0 * gx + i1) * 3 + c];
        const e = g2[(j1 * gx + i0) * 3 + c], f = g2[(j1 * gx + i1) * 3 + c];
        bg[(y * W + x) * 3 + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (e * (1 - tx) + f * tx) * ty;
      }
    }
  }
  return bg;
}

/**
 * Spot signal (≥ 0) per pixel.
 * delta: ΔE76 from local background; dark: L* drop; hue: projection on the reference colour direction.
 */
export function computeSignal(lab, bg, W, H, mode, ref) {
  const n = W * H, S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const dL = lab[k] - bg[k], da = lab[k + 1] - bg[k + 1], db = lab[k + 2] - bg[k + 2];
    let v;
    if (mode === 'dark') v = -dL;
    else if (mode === 'hue') v = dL * ref[0] + da * ref[1] + db * ref[2];
    else v = Math.sqrt(dL * dL + da * da + db * db);
    S[i] = v > 0 ? v : 0;
  }
  return boxBlur(S, W, H, Math.max(1, Math.round(Math.min(W, H) / 250)));
}

function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  const pre = new Float64Array(Math.max(W, H) + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + src[row + x];
    for (let x = 0; x < W; x++) {
      const a = Math.max(0, x - r), b = Math.min(W - 1, x + r);
      tmp[row + x] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) pre[y + 1] = pre[y] + tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      const a = Math.max(0, y - r), b = Math.min(H - 1, y + r);
      out[y * W + x] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
  }
  return out;
}

/** Robust level of the background signal. */
export function noiseLevel(S) {
  const n = S.length, step = Math.max(1, Math.floor(n / 60000));
  const arr = [];
  for (let i = 0; i < n; i += step) arr.push(S[i]);
  const med = median(arr);
  const sigma = Math.max(0.25, 1.4826 * median(arr.map(v => Math.abs(v - med))));
  let max = 0;
  for (let i = 0; i < n; i++) if (S[i] > max) max = S[i];
  return { med, sigma, hi: Math.max(med + 6 * sigma, max * 0.9) };
}

// ---------- spots ----------

/**
 * Grows a spot from the strongest pixel near (sx, sy): 8-connected pixels with
 * signal ≥ max(floor, thrFrac × peak). Optional x-range limits the lane.
 */
export function growRegion(S, W, H, sx, sy, o) {
  const xMin = o.xMin ?? 0, xMax = o.xMax ?? W - 1;
  const cx = Math.floor(sx), cy = Math.floor(sy), R = o.searchR;
  let peak = -Infinity, px = -1, py = -1;
  for (let dy = -R; dy <= R; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= H) continue;
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = cx + dx;
      if (x < xMin || x > xMax) continue;
      const v = S[y * W + x];
      if (v > peak && (!o.valid || o.valid(x, y))) { peak = v; px = x; py = y; }
    }
  }
  if (px < 0 || peak <= o.floor) return { error: 'none' };
  const T = Math.max(o.floor, peak * o.thrFrac);
  const seen = new Uint8Array(W * H);
  const stack = [py * W + px], pix = [];
  seen[py * W + px] = 1;
  while (stack.length) {
    const i = stack.pop();
    pix.push(i);
    if (pix.length > o.maxArea) return { error: 'large' };
    const x = i % W, y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((!dx && !dy) || nx < xMin || nx > xMax) continue;
        const j = ny * W + nx;
        if (!seen[j] && S[j] >= T && (!o.valid || o.valid(nx, ny))) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  return { reg: regionStats(S, W, pix, peak, px, py, T) };
}

function regionStats(S, W, pix, peak, px, py, T) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, sw = 0, swx = 0, swy = 0, sx = 0, sy = 0;
  for (const i of pix) {
    const x = i % W, y = (i - x) / W, w = S[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    sw += w; swx += w * (x + 0.5); swy += w * (y + 0.5);
    sx += x + 0.5; sy += y + 0.5;
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, mask = new Uint8Array(bw * bh);
  for (const i of pix) {
    const x = i % W, y = (i - x) / W;
    mask[(y - y0) * bw + (x - x0)] = 1;
  }
  const n = pix.length;
  return { bx: x0, by: y0, bw, bh, mask, area: n, wcx: swx / sw, wcy: swy / sw, gcx: sx / n, gcy: sy / n, px, py, peak, T };
}

/** Peaks of connected areas above T inside an x-band (used to seed automatic detection). */
export function findSeeds(S, W, H, { xMin, xMax, T, minArea, valid }) {
  const seen = new Uint8Array(W * H), out = [];
  const ok = (x, y) => !valid || valid(x, y);
  for (let y = 0; y < H; y++) for (let x = xMin; x <= xMax; x++) {
    const i0 = y * W + x;
    if (seen[i0] || S[i0] < T || !ok(x, y)) continue;
    seen[i0] = 1;
    const stack = [i0];
    let n = 0, pk = -1, pi = i0;
    while (stack.length) {
      const i = stack.pop();
      n++;
      if (S[i] > pk) { pk = S[i]; pi = i; }
      const cx = i % W, cy = (i - cx) / W;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < xMin || nx > xMax) continue;
          const j = ny * W + nx;
          if (!seen[j] && S[j] >= T && ok(nx, ny)) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    if (n >= minArea) out.push({ x: (pi % W) + 0.5, y: Math.floor(pi / W) + 0.5, peak: pk, area: n });
  }
  return out.sort((a, b) => b.peak - a.peak);
}

function gauss1d(a, s) {
  const r = Math.ceil(s * 3), k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * s * s)); k.push(v); sum += v; }
  const n = a.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += a[Math.min(n - 1, Math.max(0, i + j))] * k[j + r];
    out[i] = acc / sum;
  }
  return out;
}

/** Lane centres (x) from the column profile of the signal between rows y0..y1. */
export function detectLanes(S, W, H, y0, y1, floor) {
  const prof = new Float32Array(W);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = 0; x < W; x++) {
      const v = S[y * W + x] - floor;
      if (v > 0) prof[x] += v;
    }
  }
  const sm = gauss1d(prof, Math.max(1.5, W / 80));
  const edge = Math.max(1, Math.round(W * 0.04));
  let max = 0;
  for (let x = edge; x < W - edge; x++) max = Math.max(max, sm[x]);
  if (max <= 0) return [];
  const cand = [];
  for (let x = edge; x < W - edge; x++) {
    if (sm[x] >= 0.12 * max && sm[x] >= sm[x - 1] && sm[x] > sm[x + 1]) cand.push(x);
  }
  cand.sort((a, b) => sm[b] - sm[a]);
  const minSep = Math.max(4, W / 20), acc = [];
  const valley = (i, j) => {
    if (i > j) [i, j] = [j, i];
    let m = Infinity;
    for (let k = i; k <= j; k++) m = Math.min(m, sm[k]);
    return m;
  };
  for (const c of cand) {
    if (acc.every(a => Math.abs(a - c) >= minSep && valley(a, c) <= 0.9 * Math.min(sm[a], sm[c]))) acc.push(c);
  }
  return acc.sort((a, b) => a - b).map(x => x + 0.5);
}

function rowMedianL(lab, W, y, xa, xb) {
  const arr = new Float32Array(xb - xa);
  for (let x = xa; x < xb; x++) arr[x - xa] = lab[(y * W + x) * 3];
  arr.sort();
  return arr[arr.length >> 1];
}

/** Pencil lines: rows whose median lightness dips below the surrounding rows. */
export function detectLines(lab, W, H) {
  const xa = Math.floor(W * 0.1), xb = Math.max(xa + 1, Math.ceil(W * 0.9));
  const prof = new Float32Array(H);
  for (let y = 0; y < H; y++) prof[y] = rowMedianL(lab, W, y, xa, xb);
  const win = Math.max(4, Math.round(H / 25));
  const dip = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    const seg = prof.slice(Math.max(0, y - win), Math.min(H, y + win + 1)).sort();
    dip[y] = seg[seg.length >> 1] - prof[y];
  }
  const noise = 1.4826 * median(Array.from(dip, Math.abs)) + 0.15;
  const lo = Math.max(1, Math.round(H * 0.03)), hi = Math.min(H - 2, Math.round(H * 0.97));
  const peaks = [];
  for (let y = lo; y <= hi; y++) {
    if (dip[y] > 3 * noise && dip[y] >= dip[y - 1] && dip[y] >= dip[y + 1]) peaks.push({ y, v: dip[y] });
  }
  const best = arr => arr.reduce((m, p) => (!m || p.v > m.v ? p : m), null);
  const o = best(peaks.filter(p => p.y > H * 0.5));
  const f = best(peaks.filter(p => p.y < (o ? o.y : H) - H * 0.2));

  const line = y0 => {
    const r = Math.max(3, Math.round(H * 0.025));
    const side = (fa, fb) => {
      const a = Math.floor(W * fa), b = Math.max(a + 1, Math.ceil(W * fb));
      let by = y0, bv = Infinity;
      for (let y = Math.max(0, y0 - r); y <= Math.min(H - 1, y0 + r); y++) {
        const v = rowMedianL(lab, W, y, a, b);
        if (v < bv) { bv = v; by = y; }
      }
      return { x: (a + b) / 2, y: by + 0.5 };
    };
    const L = side(0.06, 0.35), R = side(0.65, 0.94);
    const k = (R.y - L.y) / (R.x - L.x);
    const at = x => ({ x, y: L.y + k * (x - L.x) });
    return { a: at(W * 0.03), b: at(W * 0.97) };
  };
  return { origin: o ? line(o.y) : null, front: f ? line(f.y) : null };
}

// ---------- visualisation ----------

const RAMP = [[0, [60, 0, 120]], [0.5, [230, 40, 120]], [1, [255, 235, 60]]];

export function signalMap(S, W, H, lo, hi) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(W, H), d = id.data;
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < W * H; i++) {
    const t = (S[i] - lo) / span;
    if (t <= 0) continue;
    const u = Math.min(1, t);
    const [a, b] = u < 0.5 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
    const f = (u - a[0]) / (b[0] - a[0]);
    for (let c2 = 0; c2 < 3; c2++) d[i * 4 + c2] = a[1][c2] + (b[1][c2] - a[1][c2]) * f;
    d[i * 4 + 3] = 90 + 165 * u;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
