import { t, initLang, getLang, setLang, applyI18n } from './i18n.js';
import * as IP from './imgproc.js';
import { Viewer } from './viewer.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STEPS = ['import', 'warp', 'scale', 'lines', 'spots', 'results'];
const LANE_COLORS = ['#ff2e88', '#2979ff', '#ff9100', '#00e5ff', '#d500f9', '#ffea00', '#ff3d00', '#ffffff'];
const COL = { origin: '#ff8f00', front: '#2196f3', frontEdge: '#ff2e88', scale: '#ffd600', manual: '#ffffff' };
const FONT = 'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif';

const S = {
  step: 'import', fileName: '', sample: '',
  src: null, srcData: null, quad: null, plate: { w: '', h: '' },
  warped: null, W: 0, H: 0, warpKey: null, wData: null, lab: null, bg: null,
  sig: null, noise: null, sigKey: null, sigMap: null,
  scale: { mode: 'none', a: null, b: null, mm: 10 },
  origin: null, front: null, lanes: [], spots: [], manual: [],
  params: {
    signal: 'delta', ref: null, refColor: null, thr: 0.5, sens: 6, weighted: true,
    inLane: true, laneWAuto: true, laneW: 40, minArea: 40, exclOrigin: true, showMap: false,
  },
  tool: 'add', sel: null,
};

let uid = 1;
const nid = () => uid++;
let viewer;
let undoStack = [];
let laneRects = [];

// ---------- geometry ----------

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const vdot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = a => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampPt = (p, w, h) => ({ x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) });
const mid = l => ({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 });
const cl = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

function segDist(p, a, b) {
  const ab = sub(b, a), tt = clamp(vdot(sub(p, a), ab) / (vdot(ab, ab) || 1), 0, 1);
  return dist(p, add(a, mul(ab, tt)));
}
const scr = (v, p) => v.toScreen(p.x, p.y);
const scrDist = (v, a, b) => dist(scr(v, a), scr(v, b));
const scrSegDist = (v, p, l) => segDist(scr(v, p), scr(v, l.a), scr(v, l.b));
const hitR = e => (e && e.pointerType === 'touch' ? 24 : 12);

/** Distances measured perpendicular to the origin line, towards the solvent front. */
function measure(pt) {
  const o = S.origin, f = S.front;
  if (!o || !f) return null;
  const d = norm(sub(o.b, o.a));
  let n = { x: -d.y, y: d.x };
  if (vdot(sub(mid(f), o.a), n) < 0) n = mul(n, -1);
  const O = add(o.a, mul(d, vdot(sub(pt, o.a), d)));
  const ds = vdot(sub(pt, o.a), n);
  const e = sub(f.b, f.a), den = cross(n, e);
  if (Math.abs(den) < 1e-9) return null;
  const df = cross(sub(f.a, O), e) / den;
  if (!(df > 0)) return null;
  return { ds, df, rf: ds / df, O, F: add(O, mul(n, df)) };
}

const plateOK = () => +S.plate.w > 0 && +S.plate.h > 0;

function pxPerMM() {
  if (S.scale.mode === 'plate' && plateOK() && S.warped) return S.W / +S.plate.w;
  if (S.scale.mode === 'line' && S.scale.a && +S.scale.mm > 0) return dist(S.scale.a, S.scale.b) / +S.scale.mm || null;
  return null;
}
const unit = () => (pxPerMM() ? 'mm' : 'px');
const toUnit = px => { const k = pxPerMM(); return k ? px / k : px; };
const fmtNum = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fmtLen = px => `${fmtNum(toUnit(px), pxPerMM() ? 2 : 1)} ${unit()}`;
const fmtRf = v => (Number.isFinite(v) ? v.toFixed(2) : '—');

// ---------- undo ----------

function snap() {
  return {
    quad: cl(S.quad), origin: cl(S.origin), front: cl(S.front),
    scale: cl(S.scale), lanes: cl(S.lanes), manual: cl(S.manual),
    spots: S.spots.map(s => ({ ...s })), sel: S.sel,
  };
}
function pushUndo(s = snap()) {
  undoStack.push(s);
  if (undoStack.length > 80) undoStack.shift();
  updateUndoBtn();
}
function undo() {
  const s = undoStack.pop();
  if (!s) return;
  Object.assign(S, s);
  if (S.sel && !findSel()) S.sel = null;
  refresh();
}
function updateUndoBtn() { $('#btnUndo').disabled = !undoStack.length; }

// ---------- source & warp ----------

function resetAnalysis() {
  Object.assign(S, {
    quad: null, warped: null, warpKey: null, wData: null, lab: null, bg: null,
    sig: null, noise: null, sigKey: null, sigMap: null,
    scale: { mode: plateOK() ? 'plate' : S.scale.mode === 'plate' ? 'none' : S.scale.mode, a: null, b: null, mm: S.scale.mm },
    origin: null, front: null, lanes: [], spots: [], manual: [], sel: null,
  });
  undoStack = [];
  updateUndoBtn();
}

function setSource(canvas, name) {
  resetAnalysis();
  S.src = canvas;
  S.fileName = name || '';
  S.sample = '';
  S.srcData = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

async function openImage(file) {
  if (!file) return;
  if (/\.json$/i.test(file.name) || file.type === 'application/json') return openSession(file);
  try {
    busy(true);
    setSource(await IP.fileToCanvas(file), file.name);
    autoQuad();
    goStep('warp');
  } catch (err) {
    console.error(err);
    toast(t('loadFailed'));
  } finally {
    busy(false);
  }
}

function fullQuad(inset = 0) {
  const w = S.src.width, h = S.src.height, ix = w * inset, iy = h * inset;
  return [{ x: ix, y: iy }, { x: w - ix, y: iy }, { x: w - ix, y: h - iy }, { x: ix, y: h - iy }];
}

/** Long side vertical, so development runs up the screen. */
function portrait(q) {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return w > h ? [q[1], q[2], q[3], q[0]] : q;
}

function autoQuad() {
  const q = IP.detectPlate(S.src);
  if (q) S.quad = portrait(q);
  else { S.quad = fullQuad(0.1); toast(t('plateNotFound')); }
}

function warpSize() {
  const q = S.quad;
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  let h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  if (plateOK()) h = w * +S.plate.h / +S.plate.w;
  const m = Math.max(w, h);
  const s = m < 700 ? 700 / m : m > 1800 ? 1800 / m : 1;
  return { W: Math.max(8, Math.round(w * s)), H: Math.max(8, Math.round(h * s)) };
}

function ensureWarp() {
  if (!S.src || !S.quad) return;
  const key = JSON.stringify([S.quad, plateOK() ? S.plate : null]);
  if (S.warped && S.warpKey === key) return;
  const { W, H } = warpSize();
  const prev = S.warped ? { W: S.W, H: S.H } : null;
  S.warped = IP.warp(S.srcData, S.quad, W, H);
  S.W = W; S.H = H; S.warpKey = key;
  S.wData = S.warped.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
  S.lab = IP.toLab(S.wData);
  S.bg = IP.backgroundLab(S.lab, W, H);
  S.sig = null; S.sigKey = null; S.sigMap = null;
  if (prev) {
    const fx = W / prev.W, fy = H / prev.H;
    const sp = p => p && { x: p.x * fx, y: p.y * fy };
    const sl = l => l && { a: sp(l.a), b: sp(l.b) };
    S.origin = sl(S.origin); S.front = sl(S.front);
    S.scale.a = sp(S.scale.a); S.scale.b = sp(S.scale.b);
    S.manual = S.manual.map(m => ({ ...m, a: sp(m.a), b: sp(m.b) }));
    S.lanes = S.lanes.map(l => ({ ...l, x: l.x * fx }));
    if (S.spots.length) { S.spots = []; S.sel = null; toast(t('rewarpCleared')); }
  }
  if (!S.origin || !S.front) autoLines(true);
  if (!S.scale.a) { S.scale.a = { x: W * 0.25, y: H * 0.5 }; S.scale.b = { x: W * 0.75, y: H * 0.5 }; }
}

function ensureSignal() {
  ensureWarp();
  if (!S.lab) return;
  const p = S.params;
  const mode = p.signal === 'hue' && !p.ref ? 'delta' : p.signal;
  const key = mode + (mode === 'hue' ? p.ref.join(',') : '');
  if (S.sig && S.sigKey === key) return;
  S.sig = IP.computeSignal(S.lab, S.bg, S.W, S.H, mode, p.ref);
  S.noise = IP.noiseLevel(S.sig);
  S.sigKey = key; S.sigMap = null;
}
const floorT = () => S.noise.med + 3 * S.noise.sigma;
const sensK = () => 2 + (10 - S.params.sens) * 1.5;

function sigMapCanvas() {
  if (!S.sigMap) S.sigMap = IP.signalMap(S.sig, S.W, S.H, floorT(), S.noise.hi);
  return S.sigMap;
}

// ---------- lines ----------

function defaultLine(fy) { return { a: { x: S.W * 0.03, y: S.H * fy }, b: { x: S.W * 0.97, y: S.H * fy } }; }

function autoLines(silent) {
  const r = IP.detectLines(S.lab, S.W, S.H);
  if (!silent) pushUndo();
  S.origin = r.origin || defaultLine(0.88);
  S.front = r.front || defaultLine(0.08);
  if (!silent && (!r.origin || !r.front)) toast(t('linesNotFound'));
}

// ---------- lanes & spots ----------

function laneHW() {
  if (!S.params.laneWAuto) return S.params.laneW / 2;
  const xs = S.lanes.map(l => l.x).sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < xs.length; i++) g = Math.min(g, xs[i] - xs[i - 1]);
  return Number.isFinite(g) ? Math.max(3, Math.min(g * 0.5, S.W * 0.2)) : S.W * 0.09;
}
const laneById = id => S.lanes.find(l => l.id === id);
const sortedLanes = () => [...S.lanes].sort((a, b) => a.x - b.x);
const laneColor = lane => (lane ? LANE_COLORS[lane.ci % LANE_COLORS.length] : '#ffffff');

function nearestLane(x) {
  const hw = laneHW();
  let best = null, bd = Infinity;
  for (const l of S.lanes) { const d = Math.abs(l.x - x); if (d < bd) { bd = d; best = l; } }
  return bd <= hw ? best : null;
}

function createLane(x) {
  const names = new Set(S.lanes.map(l => l.name));
  let k = S.lanes.length + 1;
  while (names.has('L' + k)) k++;
  const ci = S.lanes.reduce((m, l) => Math.max(m, l.ci + 1), 0);
  const lane = { id: nid(), name: 'L' + k, x, ci };
  S.lanes.push(lane);
  return lane;
}

function growSpot(seed, laneId, auto) {
  ensureSignal();
  const lane = laneById(laneId);
  const o = {
    thrFrac: S.params.thr, floor: floorT(),
    searchR: Math.max(3, Math.round(Math.min(S.W, S.H) * 0.03)),
    maxArea: Math.round(S.W * S.H * 0.25),
    valid: auto ? autoValid() : null,
  };
  if (S.params.inLane && lane) {
    const hw = laneHW();
    o.xMin = Math.max(0, Math.floor(lane.x - hw));
    o.xMax = Math.min(S.W - 1, Math.ceil(lane.x + hw) - 1);
  }
  return IP.growRegion(S.sig, S.W, S.H, seed.x, seed.y, o);
}

function inReg(reg, x, y) {
  if (!reg) return false;
  const i = Math.floor(x) - reg.bx, j = Math.floor(y) - reg.by;
  return i >= 0 && j >= 0 && i < reg.bw && j < reg.bh && !!reg.mask[j * reg.bw + i];
}
const spotAt = p => S.spots.find(s => inReg(s.reg, p.x, p.y));

function centroid(sp) {
  if (sp.manual) return sp.manual;
  const r = sp.reg;
  return S.params.weighted ? { x: r.wcx, y: r.wcy } : { x: r.gcx, y: r.gcy };
}

function addSpotAt(p) {
  ensureSignal();
  const before = snap();
  let lane = nearestLane(p.x), created = false;
  if (!lane) { lane = createLane(p.x); created = true; }
  let r = growSpot(p, lane.id);
  if (r.reg && created) {
    lane.x = r.reg.wcx;
    const r2 = growSpot({ x: r.reg.px + 0.5, y: r.reg.py + 0.5 }, lane.id);
    if (r2.reg) r = r2;
  }
  const dup = r.reg && S.spots.find(s => s.reg.px === r.reg.px && s.reg.py === r.reg.py);
  if (!r.reg || dup) {
    if (created) S.lanes = S.lanes.filter(l => l !== lane);
    if (dup) { S.sel = { type: 'spot', id: dup.id }; refresh(); }
    else toast(t(r.error === 'large' ? 'regionTooLarge' : 'spotNotFound'));
    return;
  }
  pushUndo(before);
  const sp = { id: nid(), lane: lane.id, seed: { x: r.reg.px + 0.5, y: r.reg.py + 0.5 }, src: 'click', reg: r.reg, manual: null };
  S.spots.push(sp);
  S.sel = { type: 'spot', id: sp.id };
  if (created && S.params.inLane && S.params.laneWAuto && S.lanes.length > 1) regrowAll();
  else refresh();
}

function regrowAll() {
  if (!S.spots.length) { refresh(); return; }
  ensureSignal();
  S.spots = S.spots.map(sp => {
    const r = growSpot(sp.seed, sp.lane, sp.src === 'auto');
    return r.reg ? { ...sp, reg: r.reg } : sp;
  });
  refresh();
}

function addLaneAt(x) {
  pushUndo();
  createLane(x);
  reassignSpots();
  regrowAll();
}

function reassignSpots() {
  for (const sp of S.spots) {
    const c = centroid(sp);
    const lane = nearestLane(c.x) || createLane(c.x);
    sp.lane = lane.id;
  }
}

function autoLanes(silent) {
  ensureSignal();
  const ys = [S.origin.a.y, S.origin.b.y, S.front.a.y, S.front.b.y];
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys) + S.H * 0.02);
  const xs = IP.detectLanes(S.sig, S.W, S.H, y0, y1, floorT());
  if (!xs.length) { if (!silent) toast(t('lanesNone')); return false; }
  if (!silent) pushUndo();
  S.lanes = xs.map((x, i) => ({ id: nid(), name: 'L' + (i + 1), x, ci: i }));
  reassignSpots();
  if (!silent) toast(t('lanesFound', { n: xs.length }));
  regrowAll();
  return true;
}

function autoValid() {
  const lo = S.params.exclOrigin ? 0.06 : 0.005;
  return (x, y) => { const m = measure({ x: x + 0.5, y: y + 0.5 }); return !!m && m.rf > lo && m.rf < 0.97; };
}

function autoSpots(silent) {
  if (!S.origin || !S.front) { toast(t('needLines')); return; }
  ensureSignal();
  const before = snap();
  if (!S.lanes.length && !autoLanes(true)) { toast(t('lanesNone')); return; }
  const hw = laneHW(), valid = autoValid();
  const T = S.noise.med + sensK() * S.noise.sigma;
  S.spots = S.spots.filter(s => s.src !== 'auto');
  let n = 0;
  for (const lane of S.lanes) {
    const xMin = Math.max(0, Math.floor(lane.x - hw)), xMax = Math.min(S.W - 1, Math.ceil(lane.x + hw) - 1);
    const seeds = IP.findSeeds(S.sig, S.W, S.H, { xMin, xMax, T, minArea: S.params.minArea, valid });
    for (const sd of seeds) {
      if (S.spots.some(s => s.lane === lane.id && inReg(s.reg, sd.x, sd.y))) continue;
      const r = growSpot(sd, lane.id, true);
      if (!r.reg || S.spots.some(s => s.reg.px === r.reg.px && s.reg.py === r.reg.py)) continue;
      S.spots.push({ id: nid(), lane: lane.id, seed: { x: r.reg.px + 0.5, y: r.reg.py + 0.5 }, src: 'auto', reg: r.reg, manual: null });
      n++;
    }
  }
  if (!silent) { pushUndo(before); toast(t('spotsFound', { n })); }
  if (S.sel && !findSel()) S.sel = null;
  refresh();
}

function findSel() {
  if (!S.sel) return null;
  return S.sel.type === 'spot' ? S.spots.find(s => s.id === S.sel.id) : S.manual.find(m => m.id === S.sel.id);
}

function deleteSelected() {
  const it = findSel();
  if (!it) return;
  pushUndo();
  if (S.sel.type === 'spot') S.spots = S.spots.filter(s => s !== it);
  else {
    S.manual = S.manual.filter(m => m !== it);
    if (it.ref && S.manual.length) S.manual[0].ref = true;
  }
  S.sel = null;
  refresh();
}

function pickRef(p) {
  ensureSignal();
  const W = S.W, H = S.H, r = 2;
  const acc = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let n = 0;
  for (let y = Math.floor(p.y) - r; y <= Math.floor(p.y) + r; y++) for (let x = Math.floor(p.x) - r; x <= Math.floor(p.x) + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    for (let c = 0; c < 3; c++) {
      acc[c] += S.lab[i * 3 + c] - S.bg[i * 3 + c];
      acc[3 + c] += S.wData.data[i * 4 + c];
    }
    n++;
  }
  if (!n) return;
  const d = acc.slice(0, 3).map(v => v / n), len = Math.hypot(...d);
  if (len < 3) { toast(t('refWeak')); return; }
  const rgb = acc.slice(3, 6).map(v => Math.round(v / n));
  Object.assign(S.params, { ref: d.map(v => v / len), refColor: `rgb(${rgb.join(',')})`, signal: 'hue' });
  S.tool = 'add';
  ensureSignal();
  updateOverlay();
  regrowAll();
}

/** Spots with label, centroid and Rf, ordered by lane then distance from the origin. */
function spotInfos() {
  const lanes = sortedLanes(), order = new Map(lanes.map((l, i) => [l.id, i]));
  const items = S.spots.map(sp => {
    const c = centroid(sp), m = measure(c);
    const r = sp.reg;
    let rfTop = null, rfBot = null;
    if (m && r) {
      const a = measure({ x: c.x, y: r.by }), b = measure({ x: c.x, y: r.by + r.bh });
      if (a && b) { rfTop = Math.max(a.rf, b.rf); rfBot = Math.min(a.rf, b.rf); }
    }
    return { sp, c, m, lane: laneById(sp.lane), rfTop, rfBot };
  });
  items.sort((a, b) => (order.get(a.sp.lane) ?? 999) - (order.get(b.sp.lane) ?? 999) || (a.m?.ds ?? -a.c.y) - (b.m?.ds ?? -b.c.y));
  const count = new Map();
  for (const it of items) {
    const k = (count.get(it.sp.lane) || 0) + 1;
    count.set(it.sp.lane, k);
    it.idx = k;
    it.label = `${it.lane?.name ?? '—'}-${k}`;
    it.color = laneColor(it.lane);
    it.side = lanes.length > 1 && (order.get(it.sp.lane) ?? 0) < lanes.length / 2 ? 'left' : 'right';
  }
  return items;
}

function manualInfos() {
  const ref = S.manual.find(m => m.ref);
  const refLen = ref ? dist(ref.a, ref.b) : null;
  return S.manual.map((m, i) => ({ m, i: i + 1, len: dist(m.a, m.b), ratio: refLen ? dist(m.a, m.b) / refLen : null }));
}

// ---------- drawing ----------

function drawSeg(ctx, v, a, b, color, w = 2, dash) {
  const A = scr(v, a), B = scr(v, b), fs = v.fs || 1;
  ctx.save();
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash.map(x => x * fs));
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = (w + 2.5) * fs; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w * fs; ctx.stroke();
  ctx.restore();
}

function drawHandle(ctx, v, p, color, r = 7) {
  const P = scr(v, p), fs = v.fs || 1;
  ctx.beginPath(); ctx.arc(P.x, P.y, r * fs, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2 * fs; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.lineWidth = 1 * fs; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.beginPath(); ctx.arc(P.x, P.y, (r + 1.5) * fs, 0, Math.PI * 2); ctx.stroke();
}

function drawTag(ctx, v, x, y, text, color, align = 'left', base = 'middle') {
  const fs = v.fs || 1;
  ctx.save();
  ctx.font = `600 ${12 * fs}px ${FONT}`;
  const w = ctx.measureText(text).width + 10 * fs, h = 18 * fs;
  let rx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  let ry = base === 'middle' ? y - h / 2 : base === 'bottom' ? y - h : y;
  ctx.fillStyle = 'rgba(12,16,14,.78)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(rx, ry, w, h, 5 * fs) : ctx.rect(rx, ry, w, h);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, rx + 5 * fs, ry + h / 2 + 0.5);
  ctx.restore();
  return { x: rx, y: ry, w, h };
}

function drawCross(ctx, v, p, color, sel) {
  const P = scr(v, p), fs = v.fs || 1, r = (sel ? 9 : 7) * fs;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [c, w] of [['rgba(0,0,0,.7)', 4], [color, 2]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w * fs;
    ctx.beginPath();
    ctx.moveTo(P.x - r, P.y); ctx.lineTo(P.x + r, P.y);
    ctx.moveTo(P.x, P.y - r); ctx.lineTo(P.x, P.y + r);
    ctx.stroke();
  }
  if (sel) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * fs;
    ctx.beginPath(); ctx.arc(P.x, P.y, r + 5 * fs, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function tintFor(reg, color) {
  reg._tint ??= {};
  if (reg._tint[color]) return reg._tint[color];
  const { bw, bh, mask } = reg;
  const c = document.createElement('canvas');
  c.width = bw; c.height = bh;
  const ctx = c.getContext('2d'), id = ctx.createImageData(bw, bh);
  const [r, g, b] = hexRgb(color);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const k = y * bw + x;
    if (!mask[k]) continue;
    const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1 || !mask[k - 1] || !mask[k + 1] || !mask[k - bw] || !mask[k + bw];
    id.data.set([r, g, b, edge ? 235 : 70], k * 4);
  }
  ctx.putImageData(id, 0, 0);
  return (reg._tint[color] = c);
}

function drawWarp(ctx, v) {
  if (!S.quad) return;
  const P = S.quad.map(p => scr(v, p));
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fill('evenodd');
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    const color = i === 0 ? COL.frontEdge : i === 2 ? COL.origin : '#ffffff';
    drawSeg(ctx, v, S.quad[i], S.quad[(i + 1) % 4], color, i % 2 ? 1.5 : 3);
  }
  if (!v.isLoupe) {
    const c = S.quad.reduce((s, p) => add(s, mul(p, 0.25)), { x: 0, y: 0 });
    for (const [i, text, color] of [[0, t('frontSide'), COL.frontEdge], [2, t('originSide'), COL.origin]]) {
      const m = mul(add(S.quad[i], S.quad[(i + 1) % 4]), 0.5);
      const M = scr(v, m), C = scr(v, c), dir = norm(sub(M, C));
      drawTag(ctx, v, M.x + dir.x * 22, M.y + dir.y * 22, text, color, 'center');
    }
  }
  S.quad.forEach((p, i) => drawHandle(ctx, v, p, i < 2 ? COL.frontEdge : COL.origin, 8));
}

function drawLinesStep(ctx, v) {
  for (const [key, color, name] of [['origin', COL.origin, 'originLine'], ['front', COL.front, 'frontLine']]) {
    const l = S[key];
    if (!l) continue;
    drawSeg(ctx, v, l.a, l.b, color, 2.5);
    drawHandle(ctx, v, l.a, color);
    drawHandle(ctx, v, l.b, color);
    if (!v.isLoupe) {
      const A = scr(v, l.a);
      drawTag(ctx, v, A.x + 12, A.y + (key === 'front' ? -16 : 16), t(name), color, 'left');
    }
  }
  const m = S.origin && S.front && measure(mid(S.origin));
  if (m && !v.isLoupe) {
    drawSeg(ctx, v, m.O, m.F, '#fff', 1.5, [5, 4]);
    const P = scr(v, mul(add(m.O, m.F), 0.5));
    drawTag(ctx, v, P.x + 8, P.y, fmtLen(m.df), '#fff');
  }
}

function drawScale(ctx, v) {
  if (S.scale.mode !== 'line' || !S.scale.a) return;
  const { a, b } = S.scale;
  drawSeg(ctx, v, a, b, COL.scale, 2.5);
  const d = norm(sub(scr(v, b), scr(v, a))), n = { x: -d.y, y: d.x };
  for (const p of [a, b]) {
    const P = scr(v, p);
    ctx.save(); ctx.strokeStyle = COL.scale; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(P.x - n.x * 10, P.y - n.y * 10); ctx.lineTo(P.x + n.x * 10, P.y + n.y * 10); ctx.stroke();
    ctx.restore();
    drawHandle(ctx, v, p, COL.scale, 6);
  }
  if (!v.isLoupe) {
    const M = scr(v, mul(add(a, b), 0.5));
    drawTag(ctx, v, M.x - n.x * 18, M.y - n.y * 18, `${S.scale.mm || '?'} mm`, COL.scale, 'center');
  }
}

function drawAnalysis(ctx, v, interactive) {
  const fs = v.fs || 1;
  if (S.origin) drawSeg(ctx, v, S.origin.a, S.origin.b, COL.origin, 1.5);
  if (S.front) drawSeg(ctx, v, S.front.a, S.front.b, COL.front, 1.5);
  if (interactive && v === viewer) laneRects = [];
  if (S.lanes.length && S.origin && S.front) {
    const ys = [S.origin.a.y, S.origin.b.y, S.front.a.y, S.front.b.y];
    const yTop = Math.min(...ys), yBot = Math.max(...ys);
    const hw = laneHW();
    for (const lane of S.lanes) {
      const color = laneColor(lane);
      const A = v.toScreen(lane.x - hw, yTop), B = v.toScreen(lane.x + hw, yBot);
      ctx.save();
      ctx.globalAlpha = 0.09; ctx.fillStyle = color;
      ctx.fillRect(A.x, A.y, B.x - A.x, B.y - A.y);
      ctx.globalAlpha = 0.55; ctx.strokeStyle = color; ctx.lineWidth = 1 * fs;
      ctx.setLineDash([4 * fs, 4 * fs]);
      ctx.strokeRect(A.x, A.y, B.x - A.x, B.y - A.y);
      ctx.restore();
      if (!v.isLoupe) {
        const C = v.toScreen(lane.x, yTop);
        const rect = drawTag(ctx, v, C.x, C.y - 6 * fs, lane.name, color, 'center', 'bottom');
        if (interactive && v === viewer) laneRects.push({ id: lane.id, ...rect });
      }
    }
  }
  const infos = spotInfos();
  for (const it of infos) {
    const r = it.sp.reg;
    if (r) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(v.ox, v.oy);
      ctx.scale(v.scale, v.scale);
      ctx.drawImage(tintFor(r, it.color), r.bx, r.by);
      ctx.restore();
    }
  }
  const sel = S.sel?.type === 'spot' ? S.sel.id : null;
  for (const it of infos) {
    const isSel = interactive && it.sp.id === sel;
    if (isSel && it.m) drawSeg(ctx, v, it.m.O, it.c, '#fff', 1.2, [4, 3]);
    drawCross(ctx, v, it.c, it.color, isSel);
    if (!v.isLoupe) {
      const P = scr(v, it.c), off = 12 * fs;
      const text = `${it.label}  ${fmtRf(it.m?.rf)}`;
      drawTag(ctx, v, P.x + (it.side === 'left' ? -off : off), P.y, text, it.color, it.side === 'left' ? 'right' : 'left');
    }
  }
  for (const mi of manualInfos()) {
    const { m } = mi, isSel = interactive && S.sel?.type === 'manual' && S.sel.id === m.id;
    drawSeg(ctx, v, m.a, m.b, isSel ? '#ffe066' : COL.manual, 2);
    if (interactive) { drawHandle(ctx, v, m.a, '#fff', 4.5); drawHandle(ctx, v, m.b, '#fff', 4.5); }
    if (!v.isLoupe) {
      const P = scr(v, m.b);
      const text = `#${mi.i}${m.ref ? ' ★' : ''} ${fmtLen(mi.len)}${!m.ref && mi.ratio != null ? ` (${fmtRf(mi.ratio)})` : ''}`;
      drawTag(ctx, v, P.x + 8 * fs, P.y, text, '#fff');
    }
  }
}

// ---------- step handlers ----------

function pointDrag(get, set, after) {
  return {
    start: () => pushUndo(),
    loupe: get,
    off: null,
    move(q) { this.off ??= sub(get(), q); set(add(q, this.off)); },
    up() { after?.(); },
  };
}

function lineHit(v, p, e, keys) {
  const r = hitR(e);
  for (const key of keys) for (const end of ['a', 'b']) {
    if (S[key] && scrDist(v, S[key][end], p) <= r) return { key, end };
  }
  for (const key of keys) if (S[key] && scrSegDist(v, p, S[key]) <= r * 0.8) return { key };
  return null;
}

const handlers = {
  import: { draw() {}, pointerDown: () => null },

  warp: {
    draw: drawWarp,
    hit(p, v, e) {
      let bi = -1, bd = Infinity;
      (S.quad || []).forEach((q, i) => { const d = scrDist(v, q, p); if (d < bd) { bd = d; bi = i; } });
      return bd <= hitR(e) ? bi : -1;
    },
    cursor(p, v) { return this.hit(p, v) >= 0 ? 'move' : ''; },
    pointerDown(p, e, v) {
      const i = this.hit(p, v, e);
      if (i < 0) return null;
      return pointDrag(() => S.quad[i], q => { S.quad[i] = clampPt(q, S.src.width, S.src.height); }, schedulePreview);
    },
  },

  scale: {
    draw: drawScale,
    cursor(p, v) { return S.scale.mode === 'line' && ['a', 'b'].some(k => scrDist(v, S.scale[k], p) <= 12) ? 'move' : ''; },
    pointerDown(p, e, v) {
      if (S.scale.mode !== 'line') return null;
      for (const k of ['a', 'b']) {
        if (scrDist(v, S.scale[k], p) <= hitR(e)) return pointDrag(() => S.scale[k], q => { S.scale[k] = clampPt(q, S.W, S.H); }, renderPane);
      }
      if (scrSegDist(v, p, S.scale) <= hitR(e) * 0.8) return lineMove(() => S.scale, l => { S.scale.a = l.a; S.scale.b = l.b; }, p, renderPane);
      return null;
    },
  },

  lines: {
    draw: drawLinesStep,
    cursor(p, v) { return lineHit(v, p, null, ['origin', 'front']) ? 'move' : ''; },
    pointerDown(p, e, v) {
      const h = lineHit(v, p, e, ['origin', 'front']);
      if (!h) return null;
      if (h.end) return pointDrag(() => S[h.key][h.end], q => { S[h.key][h.end] = clampPt(q, S.W, S.H); }, renderPane);
      return lineMove(() => S[h.key], l => { S[h.key] = l; }, p, renderPane);
    },
  },

  spots: {
    draw: (ctx, v) => drawAnalysis(ctx, v, true),
    cursor(p, v) {
      if (S.tool === 'add' || S.tool === 'pick') return 'crosshair';
      if (S.tool === 'lane') return 'copy';
      if (S.tool === 'measure') return 'crosshair';
      if (S.tool === 'select' && (spotHandleAt(p, v, null) || laneAt(p, v) || spotAt(p))) return 'pointer';
      return '';
    },
    pointerDown(p, e, v) {
      const tool = S.tool;
      if (tool === 'pan') return null;
      if (tool === 'pick') return { tap: q => pickRef(q) };
      if (tool === 'lane') return { tap: q => addLaneAt(q.x) };
      if (tool === 'select' || tool === 'measure') {
        for (const m of S.manual) for (const end of ['a', 'b']) {
          if (scrDist(v, m[end], p) <= hitR(e)) {
            S.sel = { type: 'manual', id: m.id };
            return pointDrag(() => m[end], q => { m[end] = clampPt(q, S.W, S.H); }, refresh);
          }
        }
      }
      if (tool === 'measure') {
        const m = { id: nid(), a: clampPt(p, S.W, S.H), b: clampPt(p, S.W, S.H), ref: !S.manual.some(x => x.ref) };
        return {
          loupe: () => m.b,
          start() { pushUndo(); S.manual.push(m); },
          move(q) { m.b = clampPt(q, S.W, S.H); },
          up() {
            if (scrDist(viewer, m.a, m.b) < 4) S.manual = S.manual.filter(x => x !== m);
            else S.sel = { type: 'manual', id: m.id };
            refresh();
          },
        };
      }
      if (tool === 'select') {
        const lane = laneAt(p, v);
        if (lane) {
          return {
            start: () => pushUndo(),
            off: null,
            move(q) { this.off ??= lane.x - q.x; lane.x = clamp(q.x + this.off, 0, S.W); },
            up: () => regrowAll(),
          };
        }
        const sp = spotHandleAt(p, v, e);
        if (sp) {
          return {
            tap: () => { S.sel = { type: 'spot', id: sp.id }; refresh(); },
            start() { pushUndo(); S.sel = { type: 'spot', id: sp.id }; },
            loupe: () => centroid(sp),
            off: null,
            move(q) { this.off ??= sub(centroid(sp), q); sp.manual = clampPt(add(q, this.off), S.W, S.H); },
            up: () => refresh(),
          };
        }
        const inside = spotAt(p);
        if (inside) return { tap: () => { S.sel = { type: 'spot', id: inside.id }; refresh(); } };
        const ml = S.manual.find(m => scrSegDist(v, p, m) <= hitR(e) * 0.8);
        if (ml) return { tap: () => { S.sel = { type: 'manual', id: ml.id }; refresh(); } };
        return { tap: () => { S.sel = null; refresh(); } };
      }
      // add
      return {
        tap: q => {
          const hit = spotAt(q);
          if (hit) { S.sel = { type: 'spot', id: hit.id }; refresh(); }
          else addSpotAt(q);
        },
      };
    },
  },

  results: { draw: (ctx, v) => drawAnalysis(ctx, v, false), pointerDown: () => null },
};

function lineMove(get, set, p0, after) {
  let a0, b0;
  return {
    start() { pushUndo(); const l = get(); a0 = { ...l.a }; b0 = { ...l.b }; },
    move(q) { const d = sub(q, p0); set({ a: add(a0, d), b: add(b0, d) }); },
    up() { after?.(); },
  };
}

function spotHandleAt(p, v, e) {
  const r = hitR(e);
  let best = null, bd = Infinity;
  for (const sp of S.spots) { const d = scrDist(v, centroid(sp), p); if (d < bd) { bd = d; best = sp; } }
  return bd <= r ? best : null;
}

function laneAt(p, v) {
  const P = scr(v, p);
  const hit = laneRects.find(r => P.x >= r.x - 4 && P.x <= r.x + r.w + 4 && P.y >= r.y - 4 && P.y <= r.y + r.h + 4);
  return hit ? laneById(hit.id) : null;
}

// ---------- step navigation ----------

function goStep(step) {
  if (step !== 'import' && !S.src) return;
  try {
    if (step !== 'import' && step !== 'warp') ensureWarp();
    if (step === 'spots' || step === 'results') ensureSignal();
  } catch (err) {
    console.error(err);
    toast(t('warpFailed'));
    step = 'warp';
  }
  const prevImg = viewer.img;
  S.step = step;
  $$('#steps button').forEach(b => {
    const i = STEPS.indexOf(b.dataset.step);
    b.classList.toggle('active', b.dataset.step === step);
    b.classList.toggle('done', i < STEPS.indexOf(step));
    b.disabled = b.dataset.step !== 'import' && !S.src;
  });
  $$('.pane').forEach(p => { p.hidden = p.dataset.pane !== step; });
  $('#panel').dataset.step = step;
  viewer.handler = handlers[step];
  const base = step === 'import' || step === 'warp' ? S.src : S.warped;
  viewer.setImage(base, prevImg === base);
  updateOverlay();
  renderPane();
  updateNav();
  $('#emptyState').hidden = !!S.src;
  $('.pane-scroll').scrollTop = 0;
}

function updateNav() {
  const i = STEPS.indexOf(S.step);
  $('#btnPrev').disabled = i === 0;
  $('#btnNext').hidden = i === STEPS.length - 1;
  $('#btnNext').disabled = !S.src;
  $('#btnNext').textContent = S.step === 'scale' && S.scale.mode === 'none' ? t('skip') : t('next');
}

function updateOverlay() {
  viewer.overlay = S.step === 'spots' && S.params.showMap && S.sig ? sigMapCanvas() : null;
  viewer.requestRender();
}

function updateHint() {
  const key = S.step === 'spots' ? 'hintTool_' + S.tool : 'hint_' + S.step;
  const text = S.src ? t(key) : '';
  $('#hint').textContent = text === key ? '' : text;
  $('#hint').hidden = !$('#hint').textContent;
}

function refresh() {
  renderPane();
  updateUndoBtn();
  viewer.requestRender();
}

// ---------- panel rendering ----------

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function setVal(el, v) { if (el && document.activeElement !== el) el.value = v; }

function renderPane() {
  updateHint();
  updateNav();
  const st = S.step;
  if (st === 'import') {
    $('#importInfo').textContent = S.src ? t('loadedInfo', { name: S.fileName || '—', w: S.src.width, h: S.src.height }) : '';
  } else if (st === 'warp') {
    setVal($('#plateW'), S.plate.w);
    setVal($('#plateH'), S.plate.h);
    schedulePreview();
  } else if (st === 'scale') {
    $$('input[name=scaleMode]').forEach(r => { r.checked = r.value === S.scale.mode; });
    $('#scaleLineBox').hidden = S.scale.mode !== 'line';
    setVal($('#scaleMM'), S.scale.mm);
    const k = pxPerMM();
    $('#scaleInfo').textContent = S.scale.mode === 'plate' && !plateOK() ? t('scalePlateMissing')
      : k ? t('scaleResult', { v: k.toFixed(2) }) : t('scaleNoneInfo');
  } else if (st === 'lines') {
    const m = S.origin && S.front ? measure(mid(S.origin)) : null;
    $('#linesInfo').textContent = m ? t('distOF', { v: fmtLen(m.df) }) : '';
  } else if (st === 'spots') {
    renderSpotsPane();
  } else if (st === 'results') {
    renderResults();
  }
}

function renderSpotsPane() {
  const p = S.params;
  $$('#tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === S.tool));
  $('#btnPickRef').classList.toggle('active', S.tool === 'pick');
  setVal($('#sigMode'), p.signal);
  $('#refSwatch').style.background = p.refColor || 'transparent';
  $('#refSwatch').classList.toggle('empty', !p.refColor);
  setVal($('#thr'), p.thr);
  $('#thrOut').textContent = `${Math.round(p.thr * 100)}%`;
  setVal($('#sens'), p.sens);
  $('#sensOut').textContent = p.sens;
  $$('#centroidSeg button').forEach(b => b.classList.toggle('active', (b.dataset.c === 'w') === p.weighted));
  $('#inLane').checked = p.inLane;
  $('#laneWAuto').checked = p.laneWAuto;
  const lw = Math.round(laneHW() * 2);
  $('#laneW').max = Math.max(20, Math.round(S.W / 2));
  $('#laneW').disabled = p.laneWAuto;
  setVal($('#laneW'), p.laneWAuto ? lw : p.laneW);
  $('#laneWOut').textContent = `${lw} px`;
  setVal($('#minArea'), p.minArea);
  $('#exclOrigin').checked = p.exclOrigin;
  $('#showMap').checked = p.showMap;

  const ul = $('#laneList');
  const lanes = sortedLanes();
  const counts = new Map();
  S.spots.forEach(s => counts.set(s.lane, (counts.get(s.lane) || 0) + 1));
  ul.innerHTML = lanes.length ? lanes.map(l => `
    <li data-id="${l.id}">
      <i class="dot" style="background:${laneColor(l)}"></i>
      <input class="lane-name" value="${esc(l.name)}" aria-label="${esc(t('laneName'))}">
      <span class="muted">${t('nSpots', { n: counts.get(l.id) || 0 })}</span>
      <button class="icon-btn small" data-del-lane="${l.id}" title="${esc(t('deleteLane'))}" aria-label="${esc(t('deleteLane'))}">×</button>
    </li>`).join('') : `<li class="muted">${t('noLanes')}</li>`;

  const box = $('#selBox');
  const it = findSel();
  if (!it) { box.hidden = true; return; }
  box.hidden = false;
  if (S.sel.type === 'spot') {
    const info = spotInfos().find(x => x.sp === it);
    box.innerHTML = `
      <div class="sel-title"><i class="dot" style="background:${info.color}"></i><b>${esc(info.label)}</b>
        <span>Rf = <b>${fmtRf(info.m?.rf)}</b></span></div>
      <div class="muted small">${t('distSpot')}: ${info.m ? fmtLen(info.m.ds) : '—'} / ${t('distFront')}: ${info.m ? fmtLen(info.m.df) : '—'}
        · ${t('area')}: ${it.reg.area} px${it.manual ? ' · ' + t('manualPos') : ''}</div>
      <div class="btn-row">
        ${it.manual ? `<button class="btn small" id="btnAutoPos">${t('resetCentroid')}</button>` : ''}
        <button class="btn small danger" id="btnDelSel">${t('deleteSpot')}</button>
      </div>`;
  } else {
    const mi = manualInfos().find(x => x.m === it);
    box.innerHTML = `
      <div class="sel-title"><b>#${mi.i}${it.ref ? ' ★' : ''}</b><span>${fmtLen(mi.len)}</span>
        ${!it.ref && mi.ratio != null ? `<span>${t('colRatio')} = <b>${fmtRf(mi.ratio)}</b></span>` : ''}</div>
      <div class="btn-row">
        ${it.ref ? '' : `<button class="btn small" id="btnMakeRef">${t('makeRef')}</button>`}
        <button class="btn small danger" id="btnDelSel">${t('delete')}</button>
      </div>`;
  }
}

function renderResults() {
  setVal($('#sampleName'), S.sample);
  const infos = spotInfos(), u = unit();
  const tb = $('#resTable');
  if (!infos.length) {
    tb.innerHTML = '';
    $('#resInfo').textContent = t('noSpots');
  } else {
    $('#resInfo').textContent = !S.origin || !S.front ? t('needLines') : pxPerMM() ? '' : t('pxNote');
    tb.innerHTML = `<thead><tr>
        <th>${t('colSpot')}</th><th>Rf</th><th>${t('colDs')}<small> (${u})</small></th>
        <th>${t('colDf')}<small> (${u})</small></th><th>${t('colRange')}</th><th></th></tr></thead>
      <tbody>${infos.map(it => `<tr data-id="${it.sp.id}" class="${S.sel?.id === it.sp.id ? 'sel' : ''}">
        <td><i class="dot" style="background:${it.color}"></i>${esc(it.label)}${it.sp.manual ? ' <span class="muted">*</span>' : ''}</td>
        <td class="num"><b>${fmtRf(it.m?.rf)}</b></td>
        <td class="num">${it.m ? fmtNum(toUnit(it.m.ds), u === 'mm' ? 2 : 1) : '—'}</td>
        <td class="num">${it.m ? fmtNum(toUnit(it.m.df), u === 'mm' ? 2 : 1) : '—'}</td>
        <td class="num muted">${it.rfBot != null ? `${fmtRf(it.rfBot)}–${fmtRf(it.rfTop)}` : '—'}</td>
        <td><button class="icon-btn small" data-del-spot="${it.sp.id}" aria-label="${esc(t('deleteSpot'))}" title="${esc(t('deleteSpot'))}">×</button></td>
      </tr>`).join('')}</tbody>`;
  }
  const mans = manualInfos();
  $('#manualBox').hidden = !mans.length;
  $('#manTable').innerHTML = mans.length ? `<thead><tr><th>#</th><th>${t('reference')}</th><th>${t('colLen')}<small> (${u})</small></th><th>${t('colRatio')}</th><th></th></tr></thead>
    <tbody>${mans.map(mi => `<tr>
      <td>#${mi.i}</td>
      <td><input type="radio" name="manRef" data-ref="${mi.m.id}" ${mi.m.ref ? 'checked' : ''} aria-label="${esc(t('reference'))} #${mi.i}"></td>
      <td class="num">${fmtNum(toUnit(mi.len), u === 'mm' ? 2 : 1)}</td>
      <td class="num"><b>${mi.m.ref ? '1' : fmtRf(mi.ratio)}</b></td>
      <td><button class="icon-btn small" data-del-man="${mi.m.id}" aria-label="${esc(t('delete'))}">×</button></td>
    </tr>`).join('')}</tbody>` : '';
}

// ---------- warp preview ----------

let previewQueued = false;
function schedulePreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    if (S.step !== 'warp' || !S.quad) return;
    const cv = $('#warpPreview');
    const { W, H } = warpSize();
    const k = Math.min(1, 260 / H, 300 / W);
    const w = Math.max(4, Math.round(W * k)), h = Math.max(4, Math.round(H * k));
    try {
      const img = IP.warp(S.srcData, S.quad, w, h);
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0);
    } catch { /* degenerate quad while dragging */ }
  });
}

// ---------- export ----------

function baseName() {
  const s = (S.sample || S.fileName.replace(/\.[^.]+$/, '') || 'tlc').trim();
  return s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'tlc';
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function csvText() {
  const k = pxPerMM(), r4 = v => (Number.isFinite(v) ? +v.toFixed(4) : '');
  const r2 = v => (Number.isFinite(v) ? +v.toFixed(2) : '');
  const rows = [['sample', 'file', 'lane', 'spot', 'Rf', 'Rf_bottom', 'Rf_top', 'd_spot_px', 'd_front_px', 'd_spot_mm', 'd_front_mm', 'x_px', 'y_px', 'area_px', 'centroid', 'method']];
  for (const it of spotInfos()) {
    rows.push([
      S.sample, S.fileName, it.lane?.name ?? '', it.label, r4(it.m?.rf), r4(it.rfBot), r4(it.rfTop),
      r2(it.m?.ds), r2(it.m?.df), k && it.m ? r2(it.m.ds / k) : '', k && it.m ? r2(it.m.df / k) : '',
      r2(it.c.x), r2(it.c.y), it.sp.reg?.area ?? '',
      it.sp.manual ? 'manual' : S.params.weighted ? 'weighted' : 'geometric', it.sp.src,
    ]);
  }
  const mans = manualInfos();
  if (mans.length) {
    rows.push([]);
    rows.push(['manual', 'reference', 'length_px', 'length_mm', 'ratio']);
    for (const mi of mans) rows.push([`#${mi.i}`, mi.m.ref ? 'yes' : '', r2(mi.len), k ? r2(mi.len / k) : '', r4(mi.ratio)]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function tsvText() {
  const u = unit(), d = u === 'mm' ? 2 : 1;
  const rows = [[t('colLane'), t('colSpot'), 'Rf', `${t('colDs')} (${u})`, `${t('colDf')} (${u})`, t('colRange')]];
  for (const it of spotInfos()) {
    rows.push([it.lane?.name ?? '', it.label, fmtRf(it.m?.rf), it.m ? fmtNum(toUnit(it.m.ds), d) : '', it.m ? fmtNum(toUnit(it.m.df), d) : '',
      it.rfBot != null ? `${fmtRf(it.rfBot)}-${fmtRf(it.rfTop)}` : '']);
  }
  const mans = manualInfos();
  if (mans.length) {
    rows.push([]);
    rows.push(['#', t('reference'), `${t('colLen')} (${u})`, t('colRatio')]);
    for (const mi of mans) rows.push([`#${mi.i}`, mi.m.ref ? '★' : '', fmtNum(toUnit(mi.len), d), mi.m.ref ? '1' : fmtRf(mi.ratio)]);
  }
  return rows.map(r => r.join('\t')).join('\n');
}

async function copyTable() {
  const text = tsvText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(t('copied'));
}

function exportPng() {
  ensureSignal();
  const k = clamp(1400 / Math.max(S.W, S.H), 1, 4);
  const iw = Math.round(S.W * k), ih = Math.round(S.H * k), fs = Math.max(1, ih / 900);
  const infos = spotInfos(), mans = manualInfos();
  const lh = 22 * fs, legendW = Math.round(320 * fs);
  const lines = [];
  lines.push({ text: S.sample || S.fileName || 'TLC', bold: true, size: 16 });
  lines.push({ text: new Date().toLocaleString(getLang() === 'ja' ? 'ja-JP' : 'en-US'), muted: true });
  const kmm = pxPerMM();
  lines.push({ text: kmm ? t('scaleResult', { v: kmm.toFixed(2) }) + ' (' + t('analysisPx') + ')' : t('pxNote'), muted: true });
  lines.push({ text: '' });
  for (const it of infos) lines.push({ text: `${it.label}   Rf ${fmtRf(it.m?.rf)}   ${it.m ? fmtLen(it.m.ds) : ''}`, color: it.color, swatch: true });
  if (infos.length) {
    const m0 = infos.find(x => x.m)?.m;
    if (m0) lines.push({ text: `${t('colDf')}: ${fmtLen(m0.df)}`, muted: true });
  }
  if (mans.length) {
    lines.push({ text: '' });
    lines.push({ text: t('manualTitle'), bold: true });
    for (const mi of mans) lines.push({ text: `#${mi.i}${mi.m.ref ? ' ★' : ''}  ${fmtLen(mi.len)}${mi.m.ref ? '' : `  ${t('colRatio')} ${fmtRf(mi.ratio)}`}` });
  }
  const h = Math.max(ih, Math.round(lines.length * lh + 40 * fs));
  const c = document.createElement('canvas');
  c.width = iw + legendW; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, iw, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(S.warped, 0, 0, iw, ih);
  const v = { scale: k, ox: 0, oy: 0, fs, toScreen(x, y) { return { x: x * k, y: y * k }; } };
  drawAnalysis(ctx, v, false);
  let y = 28 * fs;
  const x0 = iw + 20 * fs;
  for (const ln of lines) {
    ctx.font = `${ln.bold ? 700 : 400} ${(ln.size || 13) * fs}px ${FONT}`;
    ctx.fillStyle = ln.muted ? '#666' : '#111';
    ctx.textBaseline = 'middle';
    let tx = x0;
    if (ln.swatch) {
      ctx.fillStyle = ln.color;
      ctx.fillRect(x0, y - 6 * fs, 12 * fs, 12 * fs);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      ctx.strokeRect(x0, y - 6 * fs, 12 * fs, 12 * fs);
      ctx.fillStyle = '#111';
      tx += 20 * fs;
    }
    ctx.fillText(ln.text, tx, y);
    y += lh;
  }
  c.toBlob(b => { download(b, `${baseName()}_rf.png`); toast(t('saved')); }, 'image/png');
}

function exportCsv() {
  download(new Blob(['﻿' + csvText()], { type: 'text/csv;charset=utf-8' }), `${baseName()}_rf.csv`);
  toast(t('saved'));
}

function saveSession() {
  const o = {
    app: 'tlc-rf-analyzer', version: 1, savedAt: new Date().toISOString(),
    fileName: S.fileName, sample: S.sample,
    image: S.src.toDataURL('image/jpeg', 0.95),
    quad: S.quad, plate: S.plate, scale: S.scale, origin: S.origin, front: S.front,
    lanes: S.lanes, manual: S.manual,
    spots: S.spots.map(s => ({ id: s.id, lane: s.lane, seed: s.seed, src: s.src, manual: s.manual })),
    params: S.params,
  };
  download(new Blob([JSON.stringify(o)], { type: 'application/json' }), `${baseName()}.tlc.json`);
  toast(t('saved'));
}

async function openSession(file) {
  try {
    busy(true);
    const o = JSON.parse(await file.text());
    if (o.app !== 'tlc-rf-analyzer' || !o.image) throw new Error('not a session');
    const canvas = await IP.dataUrlToCanvas(o.image);
    if (o.plate) S.plate = o.plate;
    setSource(canvas, o.fileName);
    Object.assign(S, {
      sample: o.sample || '', quad: o.quad, scale: { ...S.scale, ...o.scale },
      origin: o.origin, front: o.front, lanes: o.lanes || [], manual: o.manual || [],
    });
    Object.assign(S.params, o.params || {});
    const ids = [...S.lanes, ...S.manual, ...(o.spots || [])].map(x => x.id || 0);
    uid = Math.max(uid, ...ids) + 1;
    ensureWarp();
    ensureSignal();
    S.spots = (o.spots || []).map(s => {
      const r = growSpot(s.seed, s.lane, s.src === 'auto');
      return r.reg ? { ...s, reg: r.reg } : null;
    }).filter(Boolean);
    goStep('results');
  } catch (err) {
    console.error(err);
    toast(t('sessionFailed'));
  } finally {
    busy(false);
  }
}

// ---------- misc UI ----------

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function busy(on) { document.body.classList.toggle('busy', on); }

function setTool(tool) {
  S.tool = tool;
  renderSpotsPane();
  updateHint();
  viewer.requestRender();
}

function bind() {
  $$('#steps button').forEach(b => b.addEventListener('click', () => goStep(b.dataset.step)));
  $('#btnPrev').addEventListener('click', () => goStep(STEPS[Math.max(0, STEPS.indexOf(S.step) - 1)]));
  $('#btnNext').addEventListener('click', () => goStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(S.step) + 1)]));
  $('#btnUndo').addEventListener('click', undo);
  $('#btnLang').addEventListener('click', () => { setLang(getLang() === 'ja' ? 'en' : 'ja'); renderPane(); viewer.requestRender(); });
  $('#btnHelp').addEventListener('click', () => $('#helpDlg').showModal());
  $('#btnHelpClose').addEventListener('click', () => $('#helpDlg').close());
  $('#zoomIn').addEventListener('click', () => viewer.zoomCenter(1.25));
  $('#zoomOut').addEventListener('click', () => viewer.zoomCenter(0.8));
  $('#zoomFit').addEventListener('click', () => viewer.fit());

  // import
  $$('[data-file]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.file).click()));
  for (const id of ['fileImg', 'fileCam', 'fileSession']) {
    $('#' + id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openImage(f); });
  }
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) openImage(f);
  });
  addEventListener('paste', e => {
    if (e.target.matches?.('input, textarea')) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) openImage(new File([item.getAsFile()], 'clipboard.png', { type: item.type }));
  });

  // warp
  $('#btnAutoQuad').addEventListener('click', () => { pushUndo(); autoQuad(); schedulePreview(); viewer.requestRender(); });
  $('#btnRotate').addEventListener('click', () => { pushUndo(); S.quad = [S.quad[1], S.quad[2], S.quad[3], S.quad[0]]; schedulePreview(); viewer.requestRender(); });
  $('#btnFullQuad').addEventListener('click', () => { pushUndo(); S.quad = portrait(fullQuad(0)); schedulePreview(); viewer.requestRender(); });
  for (const [id, k] of [['plateW', 'w'], ['plateH', 'h']]) {
    $('#' + id).addEventListener('input', e => {
      S.plate[k] = e.target.value;
      if (plateOK() && S.scale.mode === 'none') S.scale.mode = 'plate';
      if (!plateOK() && S.scale.mode === 'plate') S.scale.mode = 'none';
      schedulePreview();
    });
  }

  // scale
  $$('input[name=scaleMode]').forEach(r => r.addEventListener('change', () => { S.scale.mode = r.value; renderPane(); viewer.requestRender(); }));
  $('#scaleMM').addEventListener('input', e => { S.scale.mm = e.target.value; renderPane(); viewer.requestRender(); });

  // lines
  $('#btnAutoLines').addEventListener('click', () => { autoLines(false); refresh(); });

  // spots
  $$('#tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#btnPickRef').addEventListener('click', () => setTool(S.tool === 'pick' ? 'add' : 'pick'));
  $('#btnAutoLanes').addEventListener('click', () => autoLanes(false));
  $('#btnAutoSpots').addEventListener('click', () => autoSpots(false));
  $('#btnClearSpots').addEventListener('click', () => {
    if (!S.spots.length && !S.lanes.length) return;
    pushUndo();
    S.spots = []; S.lanes = []; S.sel = null;
    refresh();
  });
  $('#sigMode').addEventListener('change', e => {
    S.params.signal = e.target.value;
    if (S.params.signal === 'hue' && !S.params.ref) { toast(t('pickRefFirst')); setTool('pick'); }
    ensureSignal(); updateOverlay(); regrowAll();
  });
  let regrowQueued = false;
  const queueRegrow = () => {
    if (regrowQueued) return;
    regrowQueued = true;
    requestAnimationFrame(() => { regrowQueued = false; regrowAll(); });
  };
  const hasAuto = () => S.spots.some(s => s.src === 'auto');
  $('#thr').addEventListener('input', e => { S.params.thr = +e.target.value; queueRegrow(); });
  $('#sens').addEventListener('input', e => { S.params.sens = +e.target.value; $('#sensOut').textContent = S.params.sens; });
  $('#sens').addEventListener('change', () => { if (hasAuto()) autoSpots(true); });
  $$('#centroidSeg button').forEach(b => b.addEventListener('click', () => { S.params.weighted = b.dataset.c === 'w'; refresh(); }));
  $('#inLane').addEventListener('change', e => { S.params.inLane = e.target.checked; regrowAll(); });
  $('#laneWAuto').addEventListener('change', e => {
    S.params.laneWAuto = e.target.checked;
    if (!e.target.checked) S.params.laneW = Math.round(laneHW() * 2) || S.params.laneW;
    regrowAll();
  });
  $('#laneW').addEventListener('input', e => { S.params.laneW = +e.target.value; queueRegrow(); });
  $('#minArea').addEventListener('change', e => { S.params.minArea = Math.max(1, +e.target.value || 1); if (hasAuto()) autoSpots(true); });
  $('#exclOrigin').addEventListener('change', e => { S.params.exclOrigin = e.target.checked; if (hasAuto()) autoSpots(true); });
  $('#showMap').addEventListener('change', e => { S.params.showMap = e.target.checked; ensureSignal(); updateOverlay(); });
  $('#laneList').addEventListener('input', e => {
    const li = e.target.closest('li[data-id]');
    if (!li || !e.target.classList.contains('lane-name')) return;
    const lane = laneById(+li.dataset.id);
    if (lane) { lane.name = e.target.value; viewer.requestRender(); }
  });
  $('#laneList').addEventListener('click', e => {
    const id = +e.target.closest('[data-del-lane]')?.dataset.delLane;
    if (!id) return;
    pushUndo();
    S.lanes = S.lanes.filter(l => l.id !== id);
    S.spots = S.spots.filter(s => s.lane !== id);
    if (S.sel && !findSel()) S.sel = null;
    regrowAll();
  });
  $('#selBox').addEventListener('click', e => {
    const it = findSel();
    if (!it) return;
    if (e.target.id === 'btnDelSel') deleteSelected();
    if (e.target.id === 'btnAutoPos') { pushUndo(); it.manual = null; refresh(); }
    if (e.target.id === 'btnMakeRef') { pushUndo(); S.manual.forEach(m => { m.ref = m === it; }); refresh(); }
  });

  // results
  $('#sampleName').addEventListener('input', e => { S.sample = e.target.value; });
  $('#resTable').addEventListener('click', e => {
    const del = e.target.closest('[data-del-spot]');
    if (del) { S.sel = { type: 'spot', id: +del.dataset.delSpot }; deleteSelected(); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) { S.sel = { type: 'spot', id: +tr.dataset.id }; refresh(); }
  });
  $('#manTable').addEventListener('click', e => {
    const del = e.target.closest('[data-del-man]');
    if (del) { S.sel = { type: 'manual', id: +del.dataset.delMan }; deleteSelected(); }
  });
  $('#manTable').addEventListener('change', e => {
    const id = +e.target.dataset.ref;
    if (!id) return;
    pushUndo();
    S.manual.forEach(m => { m.ref = m.id === id; });
    refresh();
  });
  $('#btnCsv').addEventListener('click', exportCsv);
  $('#btnPng').addEventListener('click', exportPng);
  $('#btnCopy').addEventListener('click', copyTable);
  $('#btnSave').addEventListener('click', saveSession);

  addEventListener('keydown', e => {
    if (e.target.matches?.('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.step === 'spots' && S.sel) { e.preventDefault(); deleteSelected(); }
    if (e.key === 'Escape' && S.sel) { S.sel = null; refresh(); }
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey) viewer.fit();
  });
}

async function loadFromQuery() {
  const q = new URLSearchParams(location.search), url = q.get('img');
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    await openImage(new File([blob], url.split('/').pop() || 'image', { type: blob.type }));
    if (q.has('auto')) { goStep('spots'); autoSpots(true); }
    if (STEPS.includes(q.get('step'))) goStep(q.get('step'));
  } catch (err) {
    console.error(err);
    toast(t('loadFailed'));
  }
}

function init() {
  initLang();
  applyI18n();
  viewer = new Viewer($('#view'));
  bind();
  goStep('import');
  loadFromQuery();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local) window.__tlc = { S, IP, goStep, autoSpots, autoLanes, addSpotAt, spotInfos, exportPng, csvText, viewer: () => viewer };
  if ('serviceWorker' in navigator && (!local || location.search.includes('sw=1'))) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
  }
}

init();
