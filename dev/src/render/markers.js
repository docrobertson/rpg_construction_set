// Things drawn over the map for exploring: the marks above people's heads
// (quests, shops, inns...), the dotted path to where the pointer is, and the
// glow round whatever the pointer is over.
import * as THREE from 'three';

// small glyphs on a 24×24 grid, in currentColor
const G = {
  coin: '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.6v10.8M14.8 8.6c-.9-.9-4.9-1.2-5.3.9-.5 2.6 5.8 1.6 5.4 4.4-.3 2.1-4.6 1.9-5.6.7" fill="none" stroke="#2a1a08" stroke-width="1.7" stroke-linecap="round"/>',
  bag: '<path d="M8.4 3.2h7.2l-1.8 3.4c3.9 1.6 6.4 5.6 6.4 9.4 0 3.4-2.6 5-8.2 5S3.8 19.4 3.8 16c0-3.8 2.5-7.8 6.4-9.4z"/><path d="M9 6.8h6" stroke="#2a1a08" stroke-width="1.5"/><circle cx="12" cy="14.6" r="2.4" fill="#2a1a08"/>',
  bed: '<path d="M2.5 6v13M2.5 15.5h19V19M2.5 12.5h19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="4" y="8.6" width="5.4" height="3.6" rx="1.6"/><path d="M10.6 9.2h8.6a2.3 2.3 0 012.3 2.3v1H10.6z"/>',
  cross: '<path d="M9.6 2.8h4.8v6.8h6.8v4.8h-6.8v6.8H9.6v-6.8H2.8V9.6h6.8z"/>',
  sword: '<path d="M20.6 2.4l1 1-10.5 11.3-2.4-2.4z"/><path d="M5.2 12.6l1.5-1.5 6.2 6.2-1.5 1.5-1.8-1.8-3.1 3.1a1.5 1.5 0 01-2.1-2.1l3.1-3.1z"/>',
  banner: '<path d="M5 2.5V22" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6 3.5h13l-3 4.2 3 4.2H6z"/>',
};

// chunky quest marks, inked so they read at any size
const BANG = '<path d="M7.6 2.6h8.8l-1.9 18.2H9.5z" stroke-linejoin="round"/><circle cx="12" cy="26.6" r="3.5"/>';
const ASK = '<path d="M6.2 10.4a5.8 5.8 0 1 1 8.6 5c-1.9 1.1-2.8 2.2-2.8 4.6v.9" fill="none" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round" class="mk-line"/><circle cx="12" cy="27" r="3.2"/>';

const KINDS = {
  quest: { mark: BANG, cls: 'quest', title: 'Has a task for you' },
  turnin: { mark: ASK, cls: 'turnin', title: 'About your quest' },
  progress: { mark: ASK, cls: 'progress', title: 'Awaits news of your quest' },
  shop: { icon: 'coin', cls: 'svc shop', title: 'Merchant' },
  merchant: { icon: 'bag', cls: 'svc shop', title: 'Travelling merchant' },
  inn: { icon: 'bed', cls: 'svc inn', title: 'Innkeeper' },
  healer: { icon: 'cross', cls: 'svc healer', title: 'Healer' },
  trainer: { icon: 'sword', cls: 'svc trainer', title: 'Trainer' },
  recruit: { icon: 'banner', cls: 'svc recruit', title: 'Might join you' },
};

export function markerGlyph(kind) {
  const k = KINDS[kind];
  if (!k) return '';
  if (k.mark) {
    // drawn twice: a dark ink line under the gold
    const ink = k.mark.replace(/<path /g, '<path stroke="#241400" ').replace(/<circle /g, '<circle stroke="#241400" ');
    const under = ink.replace(/stroke-width="4.8"/, 'stroke-width="8.4"');
    return `<svg class="mk-q" viewBox="0 0 24 32" aria-hidden="true"><g fill="#241400" stroke="#241400" stroke-width="3.4">${under}</g><g fill="currentColor" stroke="currentColor" stroke-width="0">${k.mark.replace('class="mk-line"', 'stroke="currentColor"')}</g></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${G[k.icon]}</svg>`;
}

// ------------------------------------------------------------ head marks
export class HeadMarkers {
  constructor(view) {
    this.view = view;
    this.marks = new Map(); // entity id -> { kind, el }
  }

  // always: show it even when the person is out of sight (indoors, say)
  set(id, kind, always = false) {
    const cur = this.marks.get(id);
    if (!kind || !KINDS[kind]) { if (cur) { cur.el.remove(); this.marks.delete(id); } return; }
    if (cur && cur.kind === kind) { cur.always = always; return; }
    if (cur) cur.el.remove();
    const k = KINDS[kind];
    const el = document.createElement('div');
    el.className = 'emark ' + k.cls;
    el.dataset.kind = kind;
    el.dataset.id = id;
    el.innerHTML = `<div class="em-bob" style="animation-delay:${(-Math.random() * 1.8).toFixed(2)}s">${markerGlyph(kind)}</div>`;
    el.style.display = 'none';
    this.view.floatLayer.appendChild(el);
    this.marks.set(id, { kind, el, shown: false, always });
  }

  // keep only these ids
  retain(ids) {
    for (const id of [...this.marks.keys()]) if (!ids.has(id)) this.set(id, null);
  }

  clear() { for (const id of [...this.marks.keys()]) this.set(id, null); }

  update() {
    if (!this.marks.size) return;
    const v = this.view;
    const far = v.rig.dist;
    const W = v._w || 1, H = v._h || 1;
    for (const [id, m] of this.marks) {
      const e = v.entities.get(id);
      if (!e) { m.el.remove(); this.marks.delete(id); continue; }
      // far out, only quest marks stay
      let show = (e.root.visible || m.always) && (far < 26 || !m.kind.match(/shop|merchant|inn|healer|trainer|recruit/)) && far < 48;
      let p = null;
      if (show) {
        const r = e.root.position;
        p = v.worldToScreen(r.x, r.y + e.info.height * e.scale + 0.14, r.z);
        if (p.behind || p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) show = false;
      }
      if (show !== m.shown) { m.el.style.display = show ? '' : 'none'; m.shown = show; }
      if (show) {
        const k = far > 18 ? Math.max(0.6, 18 / far) : 1;
        m.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
      }
    }
  }
}

// ------------------------------------------------------------ path preview
export class PathPreview {
  constructor(view) {
    this.view = view;
    const geo = new THREE.CircleGeometry(0.075, 12);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    this.dots = new THREE.InstancedMesh(geo, this.mat, 96);
    this.dots.count = 0;
    this.dots.renderOrder = 19;
    this.dots.frustumCulled = false;
    const rg = new THREE.RingGeometry(0.2, 0.29, 28);
    rg.rotateX(-Math.PI / 2);
    this.end = new THREE.Mesh(rg, this.mat);
    this.end.renderOrder = 19;
    this.end.visible = false;
    this.group = new THREE.Group();
    this.group.add(this.dots, this.end);
    view.overlayGroup.add(this.group);
    this._m = new THREE.Matrix4();
    this.key = '';
  }

  // points: [{x, y}] tiles from the first step to the last
  set(points, color = 0xffe9a0, opts = {}) {
    const key = points && points.length ? color + ':' + points.map((p) => p.x + ',' + p.y).join(';') + (opts.noEnd ? '!' : '') : '';
    if (key === this.key) return;
    this.key = key;
    this.mat.color.setHex(color);
    if (!points || !points.length) { this.dots.count = 0; this.end.visible = false; return; }
    const v = this.view;
    const from = opts.from;
    const pts = from ? [from, ...points] : points;
    let n = 0;
    // two dots per step, along the middle of the squares
    for (let i = 1; i < pts.length && n < 94; i++) {
      const a = pts[i - 1], b = pts[i];
      for (const k of [0.5, 1]) {
        if (i === pts.length - 1 && k === 1 && !opts.noEnd) continue;
        const x = a.x + 0.5 + (b.x - a.x) * k, z = a.y + 0.5 + (b.y - a.y) * k;
        this._m.makeTranslation(x, v.surfaceAt(x, z) + 0.05, z);
        this.dots.setMatrixAt(n++, this._m);
      }
    }
    if (!from && pts.length === 1) {
      this._m.makeTranslation(pts[0].x + 0.5, v.surfaceAt(pts[0].x + 0.5, pts[0].y + 0.5) + 0.05, pts[0].y + 0.5);
      if (opts.noEnd) this.dots.setMatrixAt(n++, this._m);
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    const last = pts[pts.length - 1];
    this.end.visible = !opts.noEnd;
    this.end.position.set(last.x + 0.5, v.surfaceAt(last.x + 0.5, last.y + 0.5) + 0.05, last.y + 0.5);
  }

  clear() { this.set(null); }
}

// ------------------------------------------------------------ hover glow
// A coloured ink line round the figure and a pulsing ring at its feet.
export class HoverGlow {
  constructor(view) {
    this.view = view;
    this.id = null;
    this.swapped = [];
    this.inkMat = new THREE.MeshBasicMaterial({ color: 0xffd860, side: THREE.BackSide, fog: false });
    this.inkMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.024;');
    };
    const rg = new THREE.RingGeometry(0.36, 0.45, 40);
    rg.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.85, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.renderOrder = 18;
    this.ring.visible = false;
    view.overlayGroup.add(this.ring);
  }

  set(id, color = 0xffd860) {
    const v = this.view;
    if (id === this.id && (id == null || this.color === color)) return;
    this._restore();
    this.id = id;
    this.color = color;
    const e = id != null ? v.entities.get(id) : null;
    if (!e) { this.id = null; this.ring.visible = false; return; }
    this.inkMat.color.setHex(color);
    this.ringMat.color.setHex(color);
    e.model.traverse((o) => {
      if (o.isMesh && (o.userData.outline || o.parent?.userData?.outline)) {
        this.swapped.push([o, o.material]);
        o.material = this.inkMat;
      }
    });
    this.ring.visible = true;
  }

  _restore() {
    for (const [o, m] of this.swapped) o.material = m;
    this.swapped = [];
  }

  update() {
    if (this.id == null) return;
    const e = this.view.entities.get(this.id);
    if (!e || !e.root.visible) { this.swapped = []; this.id = null; this.ring.visible = false; return; }
    const p = e.root.position;
    const s = (e.info.group || e.info.boat ? 1.3 : Math.max(0.8, e.scale)) * (1 + Math.sin(this.view.time * 5) * 0.06);
    this.ring.position.set(p.x, p.y + 0.06, p.z);
    this.ring.scale.set(s, 1, s);
  }
}
