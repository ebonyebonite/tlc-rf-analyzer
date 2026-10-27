// Zoomable canvas. The active handler supplies draw(ctx, view) and pointerDown(imagePoint, event, view).
// pointerDown returns a drag object { start?, move?, up?, tap?, loupe? } or null (= pan).
// A drag without move() turns into a pan once the pointer moves, so "tap tools" still allow one-finger panning.

const isTyping = e => e.target?.matches?.('input, textarea, select, [contenteditable]');

export class Viewer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = null;
    this.overlay = null;
    this.handler = null;
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.cssW = 0; this.cssH = 0; this.dpr = 1;
    this.pointers = new Map();
    this.mode = null; this.drag = null; this.loupe = null;
    this.space = false; this.needFit = true; this.queued = false;

    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e, false));
    canvas.addEventListener('pointercancel', e => this.up(e, true));
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => {
      if (e.code === 'Space' && !isTyping(e)) { this.space = true; e.preventDefault(); }
    });
    addEventListener('keyup', e => { if (e.code === 'Space') this.space = false; });
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = r.width; this.cssH = r.height;
    this.c.width = Math.max(1, Math.round(r.width * this.dpr));
    this.c.height = Math.max(1, Math.round(r.height * this.dpr));
    if (this.needFit) this.fit();
    this.render();
  }

  setImage(img, keepView) {
    this.img = img;
    if (!keepView || !img) this.fit();
    this.requestRender();
  }

  fit() {
    if (!this.img || !this.cssW || !this.cssH) { this.needFit = true; return; }
    this.needFit = false;
    const pad = 24, iw = this.img.width, ih = this.img.height;
    this.scale = Math.min((this.cssW - 2 * pad) / iw, (this.cssH - 2 * pad) / ih);
    if (!(this.scale > 0)) this.scale = 1;
    this.ox = (this.cssW - iw * this.scale) / 2;
    this.oy = (this.cssH - ih * this.scale) / 2;
    this.requestRender();
  }

  zoomAt(sx, sy, f) {
    const ns = Math.min(64, Math.max(0.02, this.scale * f)), k = ns / this.scale;
    this.ox = sx - (sx - this.ox) * k;
    this.oy = sy - (sy - this.oy) * k;
    this.scale = ns;
    this.requestRender();
  }

  zoomCenter(f) { this.zoomAt(this.cssW / 2, this.cssH / 2, f); }

  toScreen(x, y) { return { x: x * this.scale + this.ox, y: y * this.scale + this.oy }; }

  toImage(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }

  pos(e) {
    const r = this.c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e) {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    try { this.c.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size >= 2) {
      if (this.drag && this.moved) this.drag.up?.(this.toImage(p.x, p.y), e);
      this.drag = null; this.loupe = null;
      const [a, b] = [...this.pointers.values()];
      this.mode = 'pinch';
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: this.scale, ox: this.ox, oy: this.oy };
      this.requestRender();
      return;
    }
    this.start = p; this.last = p; this.moved = false; this.drag = null;
    const panButton = e.button === 1 || e.button === 2 || this.space;
    if (!panButton && this.img && this.handler?.pointerDown) {
      this.drag = this.handler.pointerDown(this.toImage(p.x, p.y), e, this) || null;
    }
    this.mode = this.drag ? 'drag' : 'pan';
  }

  move(e) {
    const p = this.pos(e);
    if (!this.pointers.has(e.pointerId)) {
      if (this.img && this.handler?.cursor) this.c.style.cursor = this.handler.cursor(this.toImage(p.x, p.y), this) || '';
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.mode === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()], P = this.pinch;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ns = Math.min(64, Math.max(0.02, P.s * d / P.d));
      const ix = (P.mx - P.ox) / P.s, iy = (P.my - P.oy) / P.s;
      this.scale = ns; this.ox = mx - ix * ns; this.oy = my - iy * ns;
      this.requestRender();
      return;
    }
    if (!this.moved) {
      const tol = e.pointerType === 'mouse' ? 3 : 8;
      if (Math.hypot(p.x - this.start.x, p.y - this.start.y) < tol) return;
      this.moved = true;
      if (this.mode === 'drag') {
        if (!this.drag.move) { this.mode = 'pan'; this.drag = null; this.last = this.start; }
        else this.drag.start?.();
      }
    }
    if (this.mode === 'pan') {
      this.ox += p.x - this.last.x; this.oy += p.y - this.last.y;
      this.last = p;
      this.c.style.cursor = 'grabbing';
      this.requestRender();
      return;
    }
    if (this.mode === 'drag') {
      this.drag.move(this.toImage(p.x, p.y), e);
      if (this.drag.loupe) {
        const ip = typeof this.drag.loupe === 'function' ? this.drag.loupe() : this.toImage(p.x, p.y);
        this.loupe = { ip, sx: p.x, sy: p.y };
      }
      this.requestRender();
    }
  }

  up(e, cancel) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pos(e);
    this.pointers.delete(e.pointerId);
    if (this.mode === 'pinch') {
      if (this.pointers.size === 1) { this.mode = 'pan'; this.last = [...this.pointers.values()][0]; this.moved = true; }
      else if (!this.pointers.size) this.mode = null;
      return;
    }
    if (this.mode === 'drag' && this.drag) {
      const ip = this.toImage(p.x, p.y);
      if (!this.moved) { if (!cancel) this.drag.tap?.(ip, e); }
      else this.drag.up?.(ip, e);
    }
    this.mode = null; this.drag = null; this.loupe = null;
    this.c.style.cursor = '';
    this.requestRender();
  }

  wheel(e) {
    e.preventDefault();
    if (!this.img) return;
    const p = this.pos(e);
    const k = e.deltaMode === 1 ? 0.05 : 0.0015;
    this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * k));
  }

  requestRender() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.render(); });
  }

  render() {
    const ctx = this.ctx, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    if (!this.img) return;
    ctx.setTransform(d * this.scale, 0, 0, d * this.scale, d * this.ox, d * this.oy);
    ctx.imageSmoothingEnabled = this.scale < 2.5;
    ctx.drawImage(this.img, 0, 0);
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0, this.img.width, this.img.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.handler?.draw?.(ctx, this);
    if (this.loupe) this.drawLoupe(ctx);
  }

  drawLoupe(ctx) {
    const R = 72, pad = 12, d = this.dpr;
    const m = Math.max(this.scale * 3, 4);
    const { ip, sx, sy } = this.loupe;
    let cx = pad + R;
    const cy = pad + R;
    if (sx < 2 * R + 3 * pad && sy < 2 * R + 3 * pad) cx = this.cssW - pad - R;
    const v = {
      scale: m, ox: cx - ip.x * m, oy: cy - ip.y * m, isLoupe: true,
      toScreen(x, y) { return { x: x * this.scale + this.ox, y: y * this.scale + this.oy }; },
    };
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.clip();
    ctx.setTransform(d * m, 0, 0, d * m, d * v.ox, d * v.oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.img, 0, 0);
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0, this.img.width, this.img.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.handler?.draw?.(ctx, v);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
  }
}
