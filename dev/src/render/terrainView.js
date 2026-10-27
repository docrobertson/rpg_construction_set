// Chunked terrain renderer. The ground is one continuous, smoothly shaded
// heightfield (a vertex every half tile), so hills roll, mountains rise out of
// the land and shores slope gently under the water. Walls are blocks standing
// on that ground. Each 16x16 chunk is three merged meshes: lit land + props,
// animated water, and unlit glow (lava, fire, windows).
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { DECOR } from './decor.js';
import { TERRAIN, T, terrain } from '../data/terrain.js';
import { hash2 } from '../core/rng.js';
import { fbm } from '../core/noise.js';

export const CHUNK = 16;
export const WATER_Y = -0.12;

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
  return !t.water && !t.wall && t.key !== 'lava' && (t.group === 'world' || t.key === 'garden' || t.key === 'crops' || t.key === 'tree' || t.key === 'fence');
}

// height of the ground itself (walls stand on it; water fills above it)
const GROUND = {
  ocean: -0.62, shallows: -0.36, bridge: -0.36, pit_water: -0.42,
  hills: 0.24, mountains: 0.4, peaks: 0.52, cave: 0.14, dwarfgate: 0.34,
  swamp: -0.08, sand: -0.04, desert: 0.0, chasm: -1.2, void: -1.6, lava: -0.06,
};
export function groundOf(t) {
  if (t.key in GROUND) return GROUND[t.key];
  if (t.wall) return 0;
  return t.h;
}
// how bumpy natural ground is
const ROUGH = { hills: 0.1, mountains: 0.16, peaks: 0.18, desert: 0.07, snow: 0.05, ash: 0.05, swamp: 0.02, ocean: 0.1, shallows: 0.04 };
function roughOf(t) {
  if (t.key in ROUGH) return ROUGH[t.key];
  return isBlendable(t) ? 0.035 : 0;
}

const DEEP = lin(0x16467e), SHALLOW = lin(0x3fa2c4), FOAM = [0.86, 0.93, 0.95];
const DARK_DEEP = lin(0x0c1c2c), DARK_SHALLOW = lin(0x24506a);

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
    this.GW = map.w * 2 + 1;
    this.GH = map.h * 2 + 1;
    this.grid = new Float32Array(this.GW * this.GH);
    this._computeGrid(0, 0, map.w - 1, map.h - 1);
    this.chunks = new Array(this.cw * this.ch).fill(null).map(() => ({ meshes: [] }));
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.buildChunk(cx, cy);
    this._buildSkirt();
    this.dirty.clear();
  }

  // ---- heightfield
  _vertexHeight(i, j) {
    const ti = (i - 1) / 2, tj = (j - 1) / 2;
    const tiles = [];
    const oi = i & 1, oj = j & 1;
    if (oi && oj) tiles.push([ti, tj]);
    else if (oi) tiles.push([ti, j / 2 - 1], [ti, j / 2]);
    else if (oj) tiles.push([i / 2 - 1, tj], [i / 2, tj]);
    else tiles.push([i / 2 - 1, j / 2 - 1], [i / 2, j / 2 - 1], [i / 2 - 1, j / 2], [i / 2, j / 2]);
    let h = 0, r = 0;
    for (const [x, y] of tiles) {
      const t = this.tileAt(x, y);
      h += groundOf(t);
      r += roughOf(t);
    }
    h /= tiles.length;
    r /= tiles.length;
    if (r) h += (fbm(i * 0.45 + 3.1, j * 0.45 - 1.7, 17, 3) - 0.5) * 2 * r;
    return h;
  }

  _computeGrid(x0, y0, x1, y1) {
    const i0 = Math.max(0, x0 * 2 - 1), i1 = Math.min(this.GW - 1, x1 * 2 + 3);
    const j0 = Math.max(0, y0 * 2 - 1), j1 = Math.min(this.GH - 1, y1 * 2 + 3);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grid[j * this.GW + i] = this._vertexHeight(i, j);
  }

  gh(i, j) {
    i = i < 0 ? 0 : i >= this.GW ? this.GW - 1 : i;
    j = j < 0 ? 0 : j >= this.GH ? this.GH - 1 : j;
    return this.grid[j * this.GW + i];
  }

  // ground height at the centre of a tile
  groundAt(x, y) {
    if (!this.map || x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return 0;
    return this.gh(x * 2 + 1, y * 2 + 1);
  }

  // bilinear ground height at any world position
  heightAtPoint(px, pz) {
    const fi = px * 2, fj = pz * 2;
    const i = Math.floor(fi), j = Math.floor(fj);
    const u = fi - i, v = fj - j;
    const a = this.gh(i, j), b = this.gh(i + 1, j), c = this.gh(i, j + 1), d = this.gh(i + 1, j + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  _normal(i, j) {
    const dx = this.gh(i + 1, j) - this.gh(i - 1, j);
    const dz = this.gh(i, j + 1) - this.gh(i, j - 1);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }

  // A frame of 'fill' terrain around the map so the world doesn't end in a void
  _buildSkirt() {
    const map = this.map;
    const ft = terrain(T[map.fill] ?? T.ocean);
    const pad = 120;
    const y = ft.water ? WATER_Y - 0.004 : ft.wall ? ft.h : groundOf(ft);
    const c = ft.water ? DEEP : lin(ft.wall ? ft.top : ft.top);
    const dk = map.type === 'arena' ? 0.5 : ft.wall ? 0.7 : 0.92;
    const far = map.type === 'arena' ? 0.35 : ft.wall ? 0.55 : 0.72;
    const kin = [c[0] * dk, c[1] * dk, c[2] * dk], kout = [c[0] * far, c[1] * far, c[2] * far];
    const B = new GeoBuilder();
    const W = map.w, H = map.h;
    // a frame that darkens away from the map: inner ring at the map edge, outer ring at `pad`
    const inner = [[0, 0], [W, 0], [W, H], [0, H]];
    const outer = [[-pad, -pad], [W + pad, -pad], [W + pad, H + pad], [-pad, H + pad]];
    const put = (p, k) => B.vert(p[0], y, p[1], 0, 1, 0, k[0], k[1], k[2]);
    for (let i = 0; i < 4; i++) {
      const a = inner[i], b = inner[(i + 1) % 4], c2 = outer[(i + 1) % 4], d = outer[i];
      put(a, kin); put(c2, kout); put(d, kout);
      put(a, kin); put(b, kin); put(c2, kout);
    }
    this.skirt = new THREE.Mesh(B.build(), ft.water ? this.mats.water : this.mats.land);
    this.skirt.receiveShadow = true;
    this.group.add(this.skirt);
  }

  markDirty(x0, y0, x1, y1) {
    if (!this.map) return;
    const a0 = Math.max(0, Math.min(x0, x1)), b0 = Math.min(this.map.w - 1, Math.max(x0, x1));
    const c0 = Math.max(0, Math.min(y0, y1)), d0 = Math.min(this.map.h - 1, Math.max(y0, y1));
    this._computeGrid(a0, c0, b0, d0);
    const a = Math.max(0, Math.floor((a0 - 1) / CHUNK));
    const b = Math.min(this.cw - 1, Math.floor((b0 + 1) / CHUNK));
    const c = Math.max(0, Math.floor((c0 - 1) / CHUNK));
    const d = Math.min(this.ch - 1, Math.floor((d0 + 1) / CHUNK));
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) this.dirty.add(cy * this.cw + cx);
  }

  markAllDirty() {
    if (this.map) this._computeGrid(0, 0, this.map.w - 1, this.map.h - 1);
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
    if (isBlendable(t)) k *= 0.86 + 0.28 * fbm(x * 0.13, y * 0.13, 5, 3);
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

  // emit the 2x2 sub-quads of a tile; col(i,j) gives each grid vertex colour
  _emitTile(target, x, y, col, heightFn) {
    const i0 = x * 2, j0 = y * 2;
    const V = (di, dj) => {
      const i = i0 + di, j = j0 + dj;
      const h = heightFn ? heightFn(i, j) : this.gh(i, j);
      const n = heightFn ? [0, 1, 0] : this._normal(i, j);
      const c = col(di, dj);
      return [i / 2, h, j / 2, n, c];
    };
    const put = (v) => target.vert(v[0], v[1], v[2], v[3][0], v[3][1], v[3][2], v[4][0], v[4][1], v[4][2]);
    for (let qj = 0; qj < 2; qj++) for (let qi = 0; qi < 2; qi++) {
      const a = V(qi, qj + 1), b = V(qi + 1, qj + 1), c = V(qi + 1, qj), d = V(qi, qj);
      // split along the shorter diagonal-ish: keep a consistent pattern that follows the centre
      put(a); put(b); put(c);
      put(a); put(c); put(d);
    }
  }

  _buildTile(B, W, G, x, y) {
    const t = this.tileAt(x, y);
    const nb = (dx, dy) => this.tileAt(x + dx, y + dy);
    const center = this.gh(x * 2 + 1, y * 2 + 1);

    // --- the ground surface
    if (t.water) {
      const bed = lin(0x6a6040);
      this._emitTile(B, x, y, () => bed);
    } else {
      const self = this._tileRGB(x, y, t);
      const target = t.key === 'lava' ? G : B;
      let col;
      if (isBlendable(t)) {
        const ok = (n) => isBlendable(n) || n.water;
        const tc = (dx, dy) => {
          const n = nb(dx, dy);
          if (!ok(n)) return null;
          return n.water ? lin(0xc8b98a) : this._tileRGB(x + dx, y + dy, n);
        };
        const avg = (...cs) => {
          let r = 0, g = 0, b = 0, k = 0;
          for (const c of cs) if (c) { r += c[0]; g += c[1]; b += c[2]; k++; }
          return [r / k, g / k, b / k];
        };
        const n = tc(0, -1), s = tc(0, 1), e = tc(1, 0), w = tc(-1, 0);
        const table = [
          [avg(self, n, w, tc(-1, -1)), avg(self, n), avg(self, n, e, tc(1, -1))],
          [avg(self, w), self, avg(self, e)],
          [avg(self, s, w, tc(-1, 1)), avg(self, s), avg(self, s, e, tc(1, 1))],
        ];
        // steep or high ground weathers to rock, low wet ground darkens
        col = (di, dj) => {
          const c = table[dj][di];
          const n2 = this._normal(x * 2 + di, y * 2 + dj);
          const steep = Math.max(0, 0.93 - n2[1]) * 3;
          const k = 1 - Math.min(0.35, steep * 0.5);
          return [c[0] * k + 0.18 * steep * 0.3, c[1] * k + 0.16 * steep * 0.3, c[2] * k + 0.14 * steep * 0.3];
        };
      } else {
        const LAVA = [lin(0xff5a14), lin(0xffa424), lin(0xd8380e), lin(0xff7a18)];
        const q = t.key === 'lava'
          ? (k) => LAVA[Math.floor(hash2(x * 2 + k, y * 3 - k, 13) * 4)]
          : (k) => { const f = 0.94 + 0.12 * hash2(x * 2 + k, y * 3 - k, 91); return [self[0] * f, self[1] * f, self[2] * f]; };
        const quarter = [q(1), q(2), q(3), q(4)];
        // crisp tiles keep a single colour per quarter, so emit quarter by quarter
        const i0 = x * 2, j0 = y * 2;
        for (let qj = 0; qj < 2; qj++) for (let qi = 0; qi < 2; qi++) {
          const c = quarter[qj * 2 + qi];
          const P = (di, dj) => {
            const i = i0 + qi + di, j = j0 + qj + dj;
            const n = this._normal(i, j);
            return [i / 2, this.gh(i, j), j / 2, n];
          };
          const a = P(0, 1), b = P(1, 1), cc = P(1, 0), d = P(0, 0);
          for (const v of [a, b, cc, a, cc, d]) target.vert(v[0], v[1], v[2], v[3][0], v[3][1], v[3][2], c[0], c[1], c[2]);
        }
        col = null;
      }
      if (col) this._emitTile(target, x, y, col);
    }

    // --- water surface over this tile wherever the ground dips below it
    let wet = t.water;
    if (!wet) {
      for (let dj = 0; dj <= 2 && !wet; dj++) for (let di = 0; di <= 2; di++) if (this.gh(x * 2 + di, y * 2 + dj) < WATER_Y + 0.02) { wet = true; break; }
    }
    if (wet) {
      const dark = this.map.lighting === 'dark' || t.key === 'pit_water';
      const deep = dark ? DARK_DEEP : DEEP, shallow = dark ? DARK_SHALLOW : SHALLOW;
      this._emitTile(W, x, y, (di, dj) => {
        const i = x * 2 + di, j = y * 2 + dj;
        const depth = WATER_Y - this.gh(i, j);
        // colour by a blurred depth so shallows fade smoothly into the deep
        let sum = 0;
        for (let v = -2; v <= 2; v += 2) for (let u = -2; u <= 2; u += 2) sum += this.gh(i + u, j + v);
        const soft = WATER_Y - (sum / 9 + this.gh(i, j)) / 2;
        const k = Math.max(0, Math.min(1, soft / 0.42));
        let c = [shallow[0] + (deep[0] - shallow[0]) * k, shallow[1] + (deep[1] - shallow[1]) * k, shallow[2] + (deep[2] - shallow[2]) * k];
        if (!dark && depth < 0.07) {
          const f = Math.max(0, Math.min(1, 1 - depth / 0.07)) * 0.75;
          c = [c[0] + (FOAM[0] - c[0]) * f, c[1] + (FOAM[1] - c[1]) * f, c[2] + (FOAM[2] - c[2]) * f];
        }
        return c;
      }, () => WATER_Y);
    }

    // --- walls stand on the ground as blocks
    let top = center;
    if (t.wall) {
      top = center + t.h;
      const self = this._tileRGB(x, y, t);
      const sideC = lin(t.side);
      const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
      const base = Math.min(this.gh(x * 2, y * 2), this.gh(x * 2 + 2, y * 2), this.gh(x * 2, y * 2 + 2), this.gh(x * 2 + 2, y * 2 + 2), center) - 0.06;
      B.quad([X0, top, Z1], [X1, top, Z1], [X1, top, Z0], [X0, top, Z0], 0xffffff);
      // recolour the top we just pushed
      for (let k = B.col.length - 18; k < B.col.length; k += 3) { B.col[k] = self[0]; B.col[k + 1] = self[1]; B.col[k + 2] = self[2]; }
      const sides = [[0, 1, [X0, Z1], [X1, Z1]], [0, -1, [X1, Z0], [X0, Z0]], [1, 0, [X1, Z1], [X1, Z0]], [-1, 0, [X0, Z0], [X0, Z1]]];
      for (const [dx, dy, a, b] of sides) {
        const n = nb(dx, dy);
        if (n.wall && n.h >= t.h - 0.01) continue;
        const lo = [sideC[0] * 0.55, sideC[1] * 0.55, sideC[2] * 0.55];
        const hi = sideC;
        const pa = [a[0], base, a[1]], pb = [b[0], base, b[1]], pc = [b[0], top, b[1]], pd = [a[0], top, a[1]];
        B.quadC(pa, pb, pc, pd, new THREE.Color(lo[0], lo[1], lo[2]), new THREE.Color(lo[0], lo[1], lo[2]), new THREE.Color(hi[0], hi[1], hi[2]), new THREE.Color(hi[0], hi[1], hi[2]));
      }
    }

    if (t.deco && DECOR[t.deco]) {
      const ctx = {
        B, W, G, x, z: y, cx: x + 0.5, cz: y + 0.5,
        y: t.water ? WATER_Y : top,
        g: center,
        gy: (px, pz) => this.heightAtPoint(px, pz),
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
