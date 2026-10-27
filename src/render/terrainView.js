// Chunked terrain renderer: each 16x16 chunk is three merged meshes
// (lit land+props, animated water, unlit glow).
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { DECOR } from './decor.js';
import { TERRAIN, T, terrain } from '../data/terrain.js';
import { hash2 } from '../core/rng.js';
import { fbm } from '../core/noise.js';

export const CHUNK = 16;
export const WATER_Y = -0.12;
const WATER_BED = -0.45;

const _col = new THREE.Color();
const linCache = new Map();
function lin(hex) {
  let c = linCache.get(hex);
  if (!c) {
    _col.setHex(hex);
    c = [_col.r, _col.g, _col.b];
    linCache.set(hex, c);
  }
  return c;
}

function isBlendable(t) {
  return !t.water && !t.wall && (t.group === 'world' || t.key === 'garden' || t.key === 'crops' || t.key === 'tree' || t.key === 'fence');
}

export class TerrainView {
  constructor(scene, materials) {
    this.scene = scene;
    this.mats = materials;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.chunks = [];
    this.map = null;
    this.dirty = new Set();
    this.skirt = null;
  }

  dispose() {
    for (const ch of this.chunks) this._disposeChunk(ch);
    this.chunks = [];
    if (this.skirt) {
      this.group.remove(this.skirt);
      this.skirt.geometry.dispose();
      this.skirt = null;
    }
  }

  _disposeChunk(ch) {
    if (!ch) return;
    for (const m of ch.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    ch.meshes = [];
  }

  setMap(map) {
    this.dispose();
    this.map = map;
    this.cw = Math.ceil(map.w / CHUNK);
    this.ch = Math.ceil(map.h / CHUNK);
    this.chunks = new Array(this.cw * this.ch).fill(null).map(() => ({ meshes: [] }));
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.buildChunk(cx, cy);
    this._buildSkirt();
    this.dirty.clear();
  }

  // A frame of 'fill' terrain around the map so the world doesn't end in a void
  _buildSkirt() {
    const map = this.map;
    const ft = terrain(T[map.fill] ?? T.ocean);
    const pad = 120;
    const y = ft.water ? WATER_Y - 0.004 : ft.h;
    const c = lin(ft.top);
    const dk = map.type === 'arena' ? 0.55 : 0.92;
    const k = [c[0] * dk, c[1] * dk, c[2] * dk];
    const B = new GeoBuilder();
    const W = map.w, H = map.h;
    const rect = (x0, z0, x1, z1) => pushQuad(B, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], k, k, k, k);
    rect(-pad, -pad, W + pad, 0);
    rect(-pad, H, W + pad, H + pad);
    rect(-pad, 0, 0, H);
    rect(W, 0, W + pad, H);
    this.skirt = new THREE.Mesh(B.build(), ft.water ? this.mats.water : this.mats.land);
    this.skirt.receiveShadow = true;
    this.group.add(this.skirt);
  }

  markDirty(x0, y0, x1, y1) {
    if (!this.map) return;
    const a = Math.max(0, Math.floor((Math.min(x0, x1) - 1) / CHUNK));
    const b = Math.min(this.cw - 1, Math.floor((Math.max(x0, x1) + 1) / CHUNK));
    const c = Math.max(0, Math.floor((Math.min(y0, y1) - 1) / CHUNK));
    const d = Math.min(this.ch - 1, Math.floor((Math.max(y0, y1) + 1) / CHUNK));
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) this.dirty.add(cy * this.cw + cx);
  }

  markAllDirty() {
    for (let i = 0; i < this.chunks.length; i++) this.dirty.add(i);
  }

  update() {
    if (!this.dirty.size) return;
    for (const i of this.dirty) this.buildChunk(i % this.cw, Math.floor(i / this.cw));
    this.dirty.clear();
  }

  tileAt(x, y) {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return TERRAIN[T[m.fill] ?? T.ocean];
    return TERRAIN[m.tiles[y * m.w + x]] || TERRAIN[T.grass];
  }

  _tileRGB(x, y, t) {
    const c = lin(t.top);
    let k = 0.93 + 0.12 * hash2(x, y, 77);
    if (isBlendable(t) || t.water) k *= 0.86 + 0.28 * fbm(x * 0.13, y * 0.13, 5, 3);
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  buildChunk(cx, cy) {
    const idx = cy * this.cw + cx;
    const old = this.chunks[idx];
    this._disposeChunk(old);
    const B = new GeoBuilder(), W = new GeoBuilder(), G = new GeoBuilder();
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const x1 = Math.min(this.map.w, x0 + CHUNK), y1 = Math.min(this.map.h, y0 + CHUNK);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this._buildTile(B, W, G, x, y);
    const meshes = [];
    if (B.count) {
      const m = new THREE.Mesh(B.build(), this.mats.land);
      m.castShadow = true;
      m.receiveShadow = true;
      meshes.push(m);
    }
    if (W.count) {
      const m = new THREE.Mesh(W.build(), this.mats.water);
      m.receiveShadow = true;
      meshes.push(m);
    }
    if (G.count) meshes.push(new THREE.Mesh(G.build(), this.mats.glow));
    for (const m of meshes) {
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    this.chunks[idx] = { meshes };
  }

  _buildTile(B, W, G, x, y) {
    const t = this.tileAt(x, y);
    const nb = (dx, dy) => this.tileAt(x + dx, y + dy);
    const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1, XM = x + 0.5, ZM = y + 0.5;

    if (t.water) {
      // water surface (2x2 with shore foam)
      const foam = [0.75, 0.85, 0.9];
      const land = (dx, dy) => !nb(dx, dy).water;
      const wcol = (dx, dy) => { const n = nb(dx, dy); return n.water ? this._tileRGB(x + dx, y + dy, n) : null; };
      const avgF = (isFoam, ...cs) => {
        let r = 0, g = 0, b = 0, n = 0;
        for (const c of cs) if (c) { r += c[0]; g += c[1]; b += c[2]; n++; }
        r /= n; g /= n; b /= n;
        return isFoam ? [r * 0.4 + foam[0] * 0.6, g * 0.4 + foam[1] * 0.6, b * 0.4 + foam[2] * 0.6] : [r, g, b];
      };
      const self = this._tileRGB(x, y, t);
      const n_ = wcol(0, -1), s_ = wcol(0, 1), e_ = wcol(1, 0), w_ = wcol(-1, 0);
      const cornerLand = (sx, sy) => land(sx, 0) || land(0, sy) || land(sx, sy);
      const yW = WATER_Y;
      const cC = self;
      const cN = avgF(land(0, -1), self, n_), cS = avgF(land(0, 1), self, s_), cE = avgF(land(1, 0), self, e_), cWc = avgF(land(-1, 0), self, w_);
      const cNW = avgF(cornerLand(-1, -1), self, n_, w_, wcol(-1, -1)), cNE = avgF(cornerLand(1, -1), self, n_, e_, wcol(1, -1));
      const cSE = avgF(cornerLand(1, 1), self, s_, e_, wcol(1, 1)), cSW = avgF(cornerLand(-1, 1), self, s_, w_, wcol(-1, 1));
      const P = (px, pz) => [px, yW, pz];
      pushQuad(W, P(X0, ZM), P(XM, ZM), P(XM, Z0), P(X0, Z0), cWc, cC, cN, cNW);
      pushQuad(W, P(XM, ZM), P(X1, ZM), P(X1, Z0), P(XM, Z0), cC, cE, cNE, cN);
      pushQuad(W, P(X0, Z1), P(XM, Z1), P(XM, ZM), P(X0, ZM), cSW, cS, cC, cWc);
      pushQuad(W, P(XM, Z1), P(X1, Z1), P(X1, ZM), P(XM, ZM), cS, cSE, cE, cC);
    } else {
      const h = t.h;
      const target = t.key === 'lava' ? G : B;
      const self = this._tileRGB(x, y, t);
      let cN, cS, cE, cWc, cNW, cNE, cSE, cSW;
      if (isBlendable(t)) {
        const ok = (n) => isBlendable(n) && Math.abs(n.h - h) < 0.05;
        const col = (dx, dy) => { const n = nb(dx, dy); return ok(n) ? this._tileRGB(x + dx, y + dy, n) : null; };
        const avg = (...cs) => {
          let r = 0, g = 0, b = 0, n = 0;
          for (const c of cs) if (c) { r += c[0]; g += c[1]; b += c[2]; n++; }
          return [r / n, g / n, b / n];
        };
        const n = col(0, -1), s = col(0, 1), e = col(1, 0), w = col(-1, 0);
        const nw = col(-1, -1), ne = col(1, -1), se = col(1, 1), sw = col(-1, 1);
        cN = avg(self, n); cS = avg(self, s); cE = avg(self, e); cWc = avg(self, w);
        cNW = avg(self, n, w, nw); cNE = avg(self, n, e, ne); cSE = avg(self, s, e, se); cSW = avg(self, s, w, sw);
      } else {
        // crisp tiles; each quarter jittered slightly (flagstones, cobbles)
        const j = (k) => { const f = 0.94 + 0.12 * hash2(x * 2 + k, y * 3 - k, 91); return [self[0] * f, self[1] * f, self[2] * f]; };
        const q = [j(1), j(2), j(3), j(4)];
        cN = cS = cE = cWc = cNW = cNE = cSE = cSW = null;
        const P = (px, pz) => [px, h, pz];
        pushQuad(target, P(X0, ZM), P(XM, ZM), P(XM, Z0), P(X0, Z0), q[0], q[0], q[0], q[0]);
        pushQuad(target, P(XM, ZM), P(X1, ZM), P(X1, Z0), P(XM, Z0), q[1], q[1], q[1], q[1]);
        pushQuad(target, P(X0, Z1), P(XM, Z1), P(XM, ZM), P(X0, ZM), q[2], q[2], q[2], q[2]);
        pushQuad(target, P(XM, Z1), P(X1, Z1), P(X1, ZM), P(XM, ZM), q[3], q[3], q[3], q[3]);
      }
      if (cN) {
        const P = (px, pz) => [px, h, pz];
        pushQuad(target, P(X0, ZM), P(XM, ZM), P(XM, Z0), P(X0, Z0), cWc, self, cN, cNW);
        pushQuad(target, P(XM, ZM), P(X1, ZM), P(X1, Z0), P(XM, Z0), self, cE, cNE, cN);
        pushQuad(target, P(X0, Z1), P(XM, Z1), P(XM, ZM), P(X0, ZM), cSW, cS, self, cWc);
        pushQuad(target, P(XM, Z1), P(X1, Z1), P(X1, ZM), P(XM, ZM), cS, cSE, cE, self);
      }
      // sides
      const sideC = lin(t.side);
      const sideTop = [sideC[0], sideC[1], sideC[2]];
      const sideBot = [sideC[0] * 0.55, sideC[1] * 0.55, sideC[2] * 0.55];
      const lip = isBlendable(t) && !t.wall ? [self[0] * 0.85, self[1] * 0.85, self[2] * 0.85] : sideTop;
      const sides = [
        [0, 1, [X0, Z1], [X1, Z1]], // south face (towards camera)
        [0, -1, [X1, Z0], [X0, Z0]],
        [1, 0, [X1, Z1], [X1, Z0]],
        [-1, 0, [X0, Z0], [X0, Z1]],
      ];
      for (const [dx, dy, a, b] of sides) {
        const n = nb(dx, dy);
        const nh = n.water ? WATER_BED : n.h;
        if (nh >= h - 0.001) continue;
        const lipH = Math.max(nh, h - 0.035);
        if (lip !== sideTop && lipH > nh) {
          pushQuad(B, [a[0], lipH, a[1]], [b[0], lipH, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], lip, lip, lip, lip);
          pushQuad(B, [a[0], nh, a[1]], [b[0], nh, b[1]], [b[0], lipH, b[1]], [a[0], lipH, a[1]], sideBot, sideBot, sideTop, sideTop);
        } else {
          pushQuad(B, [a[0], nh, a[1]], [b[0], nh, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], sideBot, sideBot, sideTop, sideTop);
        }
      }
    }

    if (t.deco && DECOR[t.deco]) {
      const ctx = {
        B, W, G, x, z: y, cx: x + 0.5, cz: y + 0.5,
        y: t.water ? WATER_Y : t.h,
        t, map: this.map, nb,
        r: (k) => hash2(x * 7 + k * 13, y * 11 - k * 5, 4242),
        nbCount: (fn) => {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && fn(nb(dx, dy))) n++;
          return n;
        },
      };
      DECOR[t.deco](ctx);
    }
  }
}

function pushQuad(B, a, b, c, d, ca, cb, cc, cd) {
  const P = B.pos, C = B.col;
  P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  C.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  P.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  C.push(ca[0], ca[1], ca[2], cc[0], cc[1], cc[2], cd[0], cd[1], cd[2]);
}
