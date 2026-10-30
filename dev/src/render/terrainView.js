// Chunked terrain renderer. The ground is one continuous, smoothly shaded
// heightfield (a vertex every half tile), so hills roll, mountains rise out of
// the land and shores slope gently under the water. Walls are blocks standing
// on that ground. Each 16x16 chunk is up to four merged meshes: the painted
// ground, props (walls, plants, buildings: they sway and cut away around the
// party), animated water and unlit glow (lava, fire, windows).
// A margin of made-up land beyond the map's edge frames every map as a little
// diorama (woods around a town, rock around a cave, a ring of trees around a
// battlefield). Light-giving tiles feed a light texture for warm pools at night
// and underground.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { DECOR, ARENA_PROPS, AuxBuilder, wallTorchAt } from './decor.js';
import { shared } from './materials.js';
import { TERRAIN, T, terrain } from '../data/terrain.js';
import { hash2 } from '../core/rng.js';
import { fbm } from '../core/noise.js';

export const CHUNK = 16;
export const WATER_Y = -0.12;
export const LAVA_Y = -0.07;

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
const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// soft ground that blends into its neighbours
const SOFT = new Set(['garden', 'crops', 'tree', 'fence', 'cave_floor', 'rubble', 'web', 'bones', 'crystal']);
function isBlendable(t) {
  if (t.water || t.wall || t.key === 'lava' || t.key === 'chasm' || t.key === 'void') return false;
  return t.group === 'world' || SOFT.has(t.key);
}
const isPit = (t) => t.key === 'chasm' || t.key === 'void';

// how much larger than its square each world-map site is drawn
const SITE_SCALE = { town: 1.7, castle: 1.75, village: 1.55, fortress: 1.6, tower: 1.3, elfhall: 1.3, ruins: 1.35, cave: 1.25 };
// small scenery cleared from the squares round a site, so nothing grows through its walls
const CLUTTER = new Set(['trees', 'pines', 'tufts', 'flowers', 'hill', 'reeds', 'pebbles', 'dunes', 'snowdrift', 'ashrocks']);

// height of the ground itself (walls stand on it; water fills above it)
const GROUND = {
  ocean: -0.72, shallows: -0.36, bridge: -0.38, pit_water: -0.44,
  hills: 0.3, mountains: 0.62, peaks: 0.8, cave: 0.24, dwarfgate: 0.5,
  swamp: -0.08, sand: -0.03, desert: 0.02, chasm: 0, void: 0, lava: -0.34,
};
export function groundOf(t) {
  if (t.key in GROUND) return GROUND[t.key];
  if (t.wall) return 0;
  return t.h;
}
// how bumpy natural ground is
const ROUGH = { hills: 0.1, mountains: 0.2, peaks: 0.24, desert: 0.05, snow: 0.05, ash: 0.05, swamp: 0.02, ocean: 0.1, shallows: 0.04, cave_floor: 0.03, rubble: 0.05 };
function roughOf(t) {
  if (t.key in ROUGH) return ROUGH[t.key];
  return isBlendable(t) ? 0.03 : 0;
}
// a tile's own crown: hills and mountains bulge in the middle
const CROWN = { hills: 0.1, mountains: 0.22, peaks: 0.3, cave: 0.08, dwarfgate: 0.1 };

const DEEP = lin(0x0f4d7a), SHALLOW = lin(0x2fa6b8), SHORE = lin(0x6cc8c0);
const DARK_DEEP = lin(0x081620), DARK_SHALLOW = lin(0x1c4656);
const WET_SAND = lin(0xb9a878);

// light-giving tiles: colour and reach
const LIGHTS = {
  lava: [0xff6a1a, 3.2, 0.9], brazier: [0xffa050, 4.5, 1], hearth: [0xff9848, 3.5, 0.9],
  altar: [0xffe0a0, 2.8, 0.7], crystal: [0x9a70ff, 3, 0.8],
};

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
    this.M = 0;
    this.lightTex = null;
    // settlement buildings draw their own walls: owned[tile] marks them, and
    // groundSubst(x, y) says what ground shows round their feet
    this.owned = null;
    this.groundSubst = null;
    this.extraLights = [];
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
    ch.lights = [];
  }

  setMap(map) {
    this.dispose();
    this.map = map;
    this.style = inferStyle(map);
    // arenas get a deep frame of scenery, other maps a thin one
    this.M = map.type === 'arena' ? 8 : 3;
    const M = this.M;
    this.TW = map.w + 2 * M;
    this.TH = map.h + 2 * M;
    this.cw = Math.ceil(this.TW / CHUNK);
    this.ch = Math.ceil(this.TH / CHUNK);
    this.GW = this.TW * 2 + 1;
    this.GH = this.TH * 2 + 1;
    this.grid = new Float32Array(this.GW * this.GH);
    this._computeGrid(-M, -M, map.w - 1 + M, map.h - 1 + M);
    this.chunks = new Array(this.cw * this.ch).fill(null).map(() => ({ meshes: [], lights: [] }));
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.buildChunk(cx, cy);
    this._buildSkirt();
    this._buildLightTex();
    this.dirty.clear();
  }

  // ---- heightfield (grid index i <-> world x = i / 2 - M)
  _vertexHeight(i, j) {
    const M = this.M;
    const oi = i & 1, oj = j & 1;
    const xs = oi ? [(i - 1) / 2 - M] : [i / 2 - 1 - M, i / 2 - M];
    const ys = oj ? [(j - 1) / 2 - M] : [j / 2 - 1 - M, j / 2 - M];
    let h = 0, r = 0, n = 0;
    for (const y of ys) for (const x of xs) {
      const t = this.tileAt(x, y);
      h += groundOf(t);
      r += roughOf(t);
      n++;
    }
    h /= n;
    r /= n;
    if (oi && oj) {
      const t = this.tileAt(xs[0], ys[0]);
      if (CROWN[t.key]) h += CROWN[t.key];
    }
    if (r) h += (fbm(i * 0.45 + 3.1, j * 0.45 - 1.7, 17, 3) - 0.5) * 2 * r;
    // dunes: long wind-blown ridges
    if (xs.every((x) => ys.every((y) => this.tileAt(x, y).key === 'desert'))) {
      const w = i * 0.42 + j * 0.2 + fbm(i * 0.1, j * 0.1, 5, 2) * 5;
      h += Math.pow(Math.abs(Math.sin(w)), 3) * 0.12;
    }
    return h;
  }

  _computeGrid(x0, y0, x1, y1) {
    const M = this.M;
    const i0 = Math.max(0, (x0 + M) * 2 - 1), i1 = Math.min(this.GW - 1, (x1 + M) * 2 + 3);
    const j0 = Math.max(0, (y0 + M) * 2 - 1), j1 = Math.min(this.GH - 1, (y1 + M) * 2 + 3);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grid[j * this.GW + i] = this._vertexHeight(i, j);
  }

  gh(i, j) {
    i = i < 0 ? 0 : i >= this.GW ? this.GW - 1 : i;
    j = j < 0 ? 0 : j >= this.GH ? this.GH - 1 : j;
    return this.grid[j * this.GW + i];
  }

  // grid index of a tile's top-left corner
  _gi(x) { return (x + this.M) * 2; }

  // ground height at the centre of a tile
  groundAt(x, y) {
    const M = this.M;
    if (!this.map || x < -M || y < -M || x >= this.map.w + M || y >= this.map.h + M) return 0;
    return this.gh(this._gi(x) + 1, this._gi(y) + 1);
  }

  // bilinear ground height at any world position
  heightAtPoint(px, pz) {
    const fi = (px + this.M) * 2, fj = (pz + this.M) * 2;
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

  // A frame of 'fill' terrain beyond the margin so the world fades into haze
  _buildSkirt() {
    const map = this.map, M = this.M;
    const ft = terrain(T[map.fill] ?? T.ocean);
    const pad = 160;
    const y = ft.water ? WATER_Y - 0.004 : ft.wall ? ft.h : groundOf(ft);
    const c = ft.water ? DEEP : lin(ft.top);
    const dk = ft.wall ? 0.5 : 0.85;
    const kin = scale3(c, dk), kout = scale3(c, dk * 0.8);
    const B = ft.water ? new AuxBuilder() : new GeoBuilder();
    const x0 = -M, z0 = -M, x1 = map.w + M, z1 = map.h + M;
    const inner = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const outer = [[x0 - pad, z0 - pad], [x1 + pad, z0 - pad], [x1 + pad, z1 + pad], [x0 - pad, z1 + pad]];
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
    const M = this.M;
    const a0 = Math.max(-M, Math.min(x0, x1)), b0 = Math.min(this.map.w - 1 + M, Math.max(x0, x1));
    const c0 = Math.max(-M, Math.min(y0, y1)), d0 = Math.min(this.map.h - 1 + M, Math.max(y0, y1));
    this._computeGrid(a0, c0, b0, d0);
    const a = Math.max(0, Math.floor((a0 + M - 1) / CHUNK));
    const b = Math.min(this.cw - 1, Math.floor((b0 + M + 1) / CHUNK));
    const c = Math.max(0, Math.floor((c0 + M - 1) / CHUNK));
    const d = Math.min(this.ch - 1, Math.floor((d0 + M + 1) / CHUNK));
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) this.dirty.add(cy * this.cw + cx);
  }

  markAllDirty() {
    if (this.map) this._computeGrid(-this.M, -this.M, this.map.w - 1 + this.M, this.map.h - 1 + this.M);
    for (let i = 0; i < this.chunks.length; i++) this.dirty.add(i);
  }

  update() {
    if (!this.dirty.size) return;
    for (const i of this.dirty) this.buildChunk(i % this.cw, Math.floor(i / this.cw));
    this.dirty.clear();
    this._buildLightTex();
  }

  tileAt(x, y) {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return this._surround(x, y);
    return TERRAIN[m.tiles[y * m.w + x]] || TERRAIN[T.grass];
  }

  _nearLava(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.tileAt(x + dx, y + dy).key === 'lava') return true;
    return false;
  }

  inMap(x, y) { return x >= 0 && y >= 0 && x < this.map.w && y < this.map.h; }

  _own(x, y) { return !!this.owned && this.inMap(x, y) && this.owned[y * this.map.w + x] > 0; }

  // Made-up scenery beyond the map's edge
  _surround(x, y) {
    const m = this.map;
    const fill = TERRAIN[T[m.fill] ?? T.ocean];
    const dx = x < 0 ? -x : x >= m.w ? x - m.w + 1 : 0;
    const dy = y < 0 ? -y : y >= m.h ? y - m.h + 1 : 0;
    const d = Math.max(dx, dy);
    // keep the camera's side (south) low so nothing tall hides the near rows
    const south = y >= m.h;
    const r = hash2(x, y, 4411), r2 = hash2(x, y, 977);
    const tk = (k) => TERRAIN[T[k]];
    const tall = (p) => !south && r < p;
    const near = south ? Math.max(0, d - 3) : d;
    switch (this.style) {
      case 'forest':
        if (r < 0.2 + near * 0.12 && (!south || d > 2)) return tk(r2 < 0.35 ? 'pines' : 'forest');
        return r2 < 0.4 ? tk('meadow') : fill;
      case 'grass': case 'bridge': case 'town-out':
        if (near >= 2 && r < 0.12 + near * 0.12) return tk(r2 < 0.3 ? 'pines' : 'forest');
        if (near >= 3 && r2 < 0.1) return tk('hills');
        return r2 < 0.3 ? tk('meadow') : fill;
      case 'ruins':
        if (near >= 2 && r < 0.1 + near * 0.1) return tk('forest');
        if (d === 1 && r2 < 0.12 && !south) return tk('rubble');
        return r2 < 0.35 ? tk('meadow') : fill;
      case 'hills':
        if (tall(0.1 + near * 0.12) && near >= 2) return tk('mountains');
        return r2 < 0.5 ? tk('hills') : fill;
      case 'snow':
        if (tall(0.08 + near * 0.1) && near >= 2) return tk(r2 < 0.5 ? 'peaks' : 'pines');
        return fill;
      case 'desert':
        if (tall(0.04 + near * 0.05) && near >= 3) return tk('mountains');
        return r2 < 0.5 ? tk('desert') : fill;
      case 'swamp':
        if (r < 0.2) return tk('shallows');
        if (near >= 2 && r2 < 0.2 + near * 0.05) return tk('forest');
        return fill;
      case 'ash':
        if (r < 0.1) return tk('lava');
        if (tall(0.08 + near * 0.08) && near >= 2) return tk('mountains');
        return fill;
      case 'cave':
        if (south && d <= 2) return r < 0.25 ? tk('rubble') : fill;
        return near >= 1 && r < 0.45 + near * 0.25 ? tk('cave_wall') : (r2 < 0.2 ? tk('rubble') : fill);
      case 'indoor':
        if (south && d <= 2) return fill;
        return tk('dungeon_wall');
      case 'town':
        if (near >= 2 && r < 0.15 + near * 0.1) return tk('forest');
        return r2 < 0.12 ? tk('barrel') : fill;
      case 'water':
        return fill;
      default:
        return fill;
    }
  }

  _tileRGB(x, y, t) {
    const c = lin(t.top);
    const k = isBlendable(t) ? 0.94 + 0.12 * fbm(x * 0.19, y * 0.19, 5, 2) : 1;
    return scale3(c, k);
  }

  // darken ground where it meets the foot of a wall
  _ao(i, j) {
    const M = this.M;
    const xs = (i & 1) ? [(i - 1) / 2 - M] : [i / 2 - 1 - M, i / 2 - M];
    const ys = (j & 1) ? [(j - 1) / 2 - M] : [j / 2 - 1 - M, j / 2 - M];
    let w = 0;
    for (const y of ys) for (const x of xs) { const t = this.tileAt(x, y); if (t.wall && !this._own(x, y)) w++; }
    return w ? 0.62 : 1;
  }

  buildChunk(cx, cy) {
    const idx = cy * this.cw + cx;
    this._disposeChunk(this.chunks[idx]);
    const ground = new GeoBuilder(), P = new AuxBuilder(), W = new AuxBuilder(), G = new GeoBuilder(), Lv = new GeoBuilder();
    const lights = [];
    const M = this.M;
    const x0 = cx * CHUNK - M, y0 = cy * CHUNK - M;
    const x1 = Math.min(this.map.w + M, x0 + CHUNK), y1 = Math.min(this.map.h + M, y0 + CHUNK);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this._buildTile(ground, P, W, G, x, y, lights, Lv);
    const meshes = [];
    if (ground.count) {
      const m = new THREE.Mesh(ground.build(), this.mats.land);
      m.castShadow = true;
      m.receiveShadow = true;
      meshes.push(m);
    }
    if (P.count) {
      const m = new THREE.Mesh(P.build(), this.mats.props);
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
    if (Lv.count) meshes.push(new THREE.Mesh(Lv.build(), this.mats.lava));
    for (const m of meshes) {
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    this.chunks[idx] = { meshes, lights };
  }

  // Light texture: two texels per tile over the map and its margin
  _buildLightTex() {
    const M = this.M, TW = this.TW, TH = this.TH, R = 2;
    const w = TW * R, h = TH * R;
    const acc = new Float32Array(w * h * 3);
    let any = false;
    for (const L of [...this.chunks.flatMap((ch) => ch.lights || []), ...(this.extraLights || [])]) {
      any = true;
      const [px, pz, rad, c, s] = L;
      const gx = (px + M) * R, gz = (pz + M) * R, gr = rad * R;
      const xa = Math.max(0, Math.floor(gx - gr)), xb = Math.min(w - 1, Math.ceil(gx + gr));
      const za = Math.max(0, Math.floor(gz - gr)), zb = Math.min(h - 1, Math.ceil(gz + gr));
      for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) {
        const d = Math.hypot(x + 0.5 - gx, z + 0.5 - gz) / gr;
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d) * s;
        const o = (z * w + x) * 3;
        acc[o] += c[0] * f; acc[o + 1] += c[1] * f; acc[o + 2] += c[2] * f;
      }
    }
    const data = new Uint8Array(w * h * 4);
    if (any) for (let i = 0, j = 0; i < acc.length; i += 3, j += 4) {
      data[j] = Math.min(255, acc[i] * 255);
      data[j + 1] = Math.min(255, acc[i + 1] * 255);
      data[j + 2] = Math.min(255, acc[i + 2] * 255);
      data[j + 3] = 255;
    }
    if (this.lightTex) this.lightTex.dispose();
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.lightTex = tex;
    shared.uLightTex.value = tex;
    shared.uLightRect.value.set(-M, -M, TW, TH);
  }

  // emit the 2x2 sub-quads of a tile; col(di,dj) gives each grid vertex colour
  _emitTile(target, x, y, col, heightFn, auxFn) {
    const i0 = this._gi(x), j0 = this._gi(y);
    const V = (di, dj) => {
      const i = i0 + di, j = j0 + dj;
      const h = heightFn ? heightFn(i, j) : this.gh(i, j);
      const n = heightFn ? [0, 1, 0] : this._normal(i, j);
      const c = col(di, dj);
      return [(i / 2) - this.M, h, (j / 2) - this.M, n, c, auxFn ? auxFn(i, j) : 0];
    };
    const verts = [];
    for (let dj = 0; dj <= 2; dj++) for (let di = 0; di <= 2; di++) verts.push(V(di, dj));
    const at = (di, dj) => verts[dj * 3 + di];
    const put = (v) => target.vert(v[0], v[1], v[2], v[3][0], v[3][1], v[3][2], v[4][0], v[4][1], v[4][2], v[5]);
    for (let qj = 0; qj < 2; qj++) for (let qi = 0; qi < 2; qi++) {
      const a = at(qi, qj + 1), b = at(qi + 1, qj + 1), c = at(qi + 1, qj), d = at(qi, qj);
      // split each quad towards the tile centre so mounds stay round
      if ((qi + qj) % 2 === 0) { put(a); put(b); put(c); put(a); put(c); put(d); } else { put(a); put(b); put(d); put(b); put(c); put(d); }
    }
  }

  _buildTile(ground, P, W, G, x, y, lights, Lv) {
    const own = this._own(x, y);
    const t0 = this.tileAt(x, y);
    // under a building's own wall (or a street prop), show the ground beside it
    const sub = this.groundSubst && this.inMap(x, y) ? this.groundSubst(x, y) : null;
    const outside = !this.inMap(x, y);
    // (battle) a lone rock or wall square stands on the arena floor as a prop
    const prop = !sub && !outside && this.map.type === 'arena' && t0.wall ? ARENA_PROPS[t0.key] : null;
    const t = sub || (prop ? terrain(T[this.map.fill] ?? T.grass) : t0);
    const nb = (dx, dy) => this.tileAt(x + dx, y + dy);
    const i0 = this._gi(x), j0 = this._gi(y);
    const center = this.gh(i0 + 1, j0 + 1);
    const dark = this.map.lighting === 'dark';

    // --- the ground surface
    if (isPit(t)) {
      this._pit(ground, x, y, t, nb);
    } else if (t.water) {
      const bed = lin(dark ? 0x2a2620 : 0x7a6a48);
      this._emitTile(ground, x, y, () => bed);
    } else {
      const self = this._tileRGB(x, y, t);
      let col;
      if (isBlendable(t)) {
        const ok = (n) => isBlendable(n) || n.water;
        const wet = t.group === 'dungeon' ? scale3(self, 0.7) : WET_SAND;
        const tc = (dx, dy) => {
          const n = nb(dx, dy);
          if (!ok(n)) return null;
          return n.water ? wet : this._tileRGB(x + dx, y + dy, n);
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
        col = (di, dj) => scale3(table[dj][di], this._ao(i0 + di, j0 + dj));
        this._emitTile(ground, x, y, col);
      } else if (t.key === 'lava') {
        // the scorched bed of the pool; the molten surface is laid over it below
        const bed = lin(0x2a1a14);
        this._emitTile(ground, x, y, () => bed);
      } else {
        // crisp tiles (floors, cobbles) keep their edges; slight per-quarter tint
        const q = (k) => scale3(self, 0.95 + 0.08 * hash2(x * 2 + k, y * 3 - k, 91));
        const quarter = [q(1), q(2), q(3), q(4)];
        for (let qj = 0; qj < 2; qj++) for (let qi = 0; qi < 2; qi++) {
          const c = quarter[qj * 2 + qi];
          const Pt = (di, dj) => {
            const i = i0 + qi + di, j = j0 + qj + dj;
            const n = this._normal(i, j);
            const k = this._ao(i, j);
            return [i / 2 - this.M, this.gh(i, j), j / 2 - this.M, n, k];
          };
          const a = Pt(0, 1), b = Pt(1, 1), cc = Pt(1, 0), d = Pt(0, 0);
          for (const v of [a, b, cc, a, cc, d]) ground.vert(v[0], v[1], v[2], v[3][0], v[3][1], v[3][2], c[0] * v[4], c[1] * v[4], c[2] * v[4]);
        }
      }
    }

    // --- water surface over this tile wherever the ground dips below it
    let wet = t.water;
    if (!wet && !isPit(t)) {
      for (let dj = 0; dj <= 2 && !wet; dj++) for (let di = 0; di <= 2; di++) if (this.gh(i0 + di, j0 + dj) < WATER_Y + 0.02) { wet = true; break; }
    }
    if (wet) {
      const darkW = dark || t.key === 'pit_water';
      const deep = darkW ? DARK_DEEP : DEEP, shallow = darkW ? DARK_SHALLOW : SHALLOW;
      const softDepth = (i, j) => {
        let sum = 0;
        for (let v = -2; v <= 2; v += 2) for (let u = -2; u <= 2; u += 2) sum += this.gh(i + u, j + v);
        return WATER_Y - (sum / 9 + this.gh(i, j)) / 2;
      };
      this._emitTile(W, x, y, (di, dj) => {
        const k = Math.max(0, Math.min(1, softDepth(i0 + di, j0 + dj) / 0.5));
        const c = k < 0.3 && !darkW ? mix3(SHORE, shallow, k / 0.3) : mix3(shallow, deep, Math.min(1, (k - 0.3) / 0.7 + (darkW ? 0.3 : 0)));
        return c;
      }, () => WATER_Y, (i, j) => Math.max(0, Math.min(1, 1 - (WATER_Y - this.gh(i, j)) / 0.2)));
    }

    // --- molten surface: fills the lava basin and laps at its banks
    if (!t.water && !t.wall && (t.key === 'lava' || this._nearLava(x, y))) {
      let hot = false;
      for (let dj = 0; dj <= 2 && !hot; dj++) for (let di = 0; di <= 2; di++) if (this.gh(i0 + di, j0 + dj) < LAVA_Y + 0.02) { hot = true; break; }
      if (hot) {
        const LAVA = [lin(0xff5a14), lin(0xffa424), lin(0xd8380e), lin(0xff7a18)];
        this._emitTile(Lv, x, y, (di, dj) => LAVA[Math.floor(hash2(i0 + di, j0 + dj, 13) * 4)], () => LAVA_Y);
      }
    }

    // --- walls stand on the ground as blocks
    if (own) return;
    let top = center;
    if (t.wall) {
      top = center + t.h;
      const base = Math.min(this.gh(i0, j0), this.gh(i0 + 2, j0), this.gh(i0, j0 + 2), this.gh(i0 + 2, j0 + 2), center) - 0.06;
      if (t.key === 'cave_wall') this._rockWall(P, x, y, t, base, top, nb);
      else if (t.key === 'dungeon_wall') this._masonry(P, x, y, t, base, top, nb);
      else this._block(P, x, y, t, base, top, nb);
    }

    if (t.light && LIGHTS[t.key]) {
      const [c, r, s] = LIGHTS[t.key];
      lights.push([x + 0.5, y + 0.5, r, lin(c), s]);
    }

    // world-map sites are drawn larger than their square so a town reads as a
    // place beside the company; the land round them is cleared to make room
    const world = this.map.type === 'world';
    const site = world && SITE_SCALE[t0.deco];
    if (world && !site && CLUTTER.has(t0.deco) && this._nearSite(x, y)) return;
    const deco = prop || (t0.deco && DECOR[t0.deco]);
    if (deco) {
      const marks = site ? [P.pos.length, G.pos.length, W.pos.length, lights.length] : null;
      const ctx = {
        B: P, W, G, x, z: y, cx: x + 0.5, cz: y + 0.5,
        y: t.water ? WATER_Y : top,
        g: center,
        gy: (px, pz) => this.heightAtPoint(px, pz),
        t: t0, map: this.map, nb, outside, dark,
        r: (k) => hash2(x * 7 + k * 13, y * 11 - k * 5, 4242),
        nbCount: (fn) => {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && fn(nb(dx, dy))) n++;
          return n;
        },
        light: (px, pz, rad, color, s = 1) => lights.push([px, pz, rad, lin(color), s]),
        torch: !outside && wallTorchAt(this.map, x, y),
      };
      P.auxAt = null;
      // scenery beyond the edge is seen from afar: lighter trees
      P.cheap = outside;
      deco(ctx);
      P.auxAt = null;
      if (site) {
        const cx = x + 0.5, cz = y + 0.5;
        for (const [B, from] of [[P, marks[0]], [G, marks[1]], [W, marks[2]]]) {
          const p = B.pos;
          for (let i = from; i < p.length; i += 3) {
            p[i] = cx + (p[i] - cx) * site;
            p[i + 1] = center + (p[i + 1] - center) * site;
            p[i + 2] = cz + (p[i + 2] - cz) * site;
          }
        }
        for (let i = marks[3]; i < lights.length; i++) {
          const L = lights[i];
          L[0] = cx + (L[0] - cx) * site; L[1] = cz + (L[1] - cz) * site; L[2] *= site;
        }
      }
    }
  }

  // is a (scaled-up) world-map site on one of the eight squares around?
  _nearSite(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && SITE_SCALE[this.tileAt(x + dx, y + dy).deco] > 1.2) return true;
    }
    return false;
  }

  // plain block (town walls keep their own style)
  _block(P, x, y, t, base, top, nb) {
    const self = this._tileRGB(x, y, t);
    const sideC = lin(t.side);
    const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
    P.quadC([X0, top, Z1], [X1, top, Z1], [X1, top, Z0], [X0, top, Z0], c3(self), c3(self), c3(self), c3(self));
    const sides = [[0, 1, [X0, Z1], [X1, Z1]], [0, -1, [X1, Z0], [X0, Z0]], [1, 0, [X1, Z1], [X1, Z0]], [-1, 0, [X0, Z0], [X0, Z1]]];
    for (const [dx, dy, a, b] of sides) {
      const n = nb(dx, dy);
      if (n.wall && n.h >= t.h - 0.01) continue;
      const lo = c3(scale3(sideC, 0.55)), hi = c3(sideC);
      P.quadC([a[0], base, a[1]], [b[0], base, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], lo, lo, hi, hi);
    }
  }

  // Dressed stone: courses of blocks with dark mortar, a capstone rim on top
  _masonry(P, x, y, t, base, top, nb) {
    const sideC = lin(t.side), topC = lin(t.top);
    const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
    const open = (dx, dy) => { const n = nb(dx, dy); return !(n.wall && n.h >= t.h - 0.01); };
    // top: dark slab, lighter rim along the open edges
    const tc = scale3(topC, 0.9 + 0.15 * hash2(x, y, 3));
    P.quadC([X0, top, Z1], [X1, top, Z1], [X1, top, Z0], [X0, top, Z0], c3(tc), c3(tc), c3(tc), c3(tc));
    const rim = c3(scale3(sideC, 1.25)), rw = 0.07;
    if (open(0, 1)) P.box(rim, { x: x + 0.5, y: top - 0.02, z: Z1 - rw / 2 + 0.01, sx: 1.0, sy: 0.05, sz: rw });
    if (open(0, -1)) P.box(rim, { x: x + 0.5, y: top - 0.02, z: Z0 + rw / 2 - 0.01, sx: 1.0, sy: 0.05, sz: rw });
    if (open(1, 0)) P.box(rim, { x: X1 - rw / 2 + 0.01, y: top - 0.02, z: y + 0.5, sx: rw, sy: 0.05, sz: 1.0 });
    if (open(-1, 0)) P.box(rim, { x: X0 + rw / 2 - 0.01, y: top - 0.02, z: y + 0.5, sx: rw, sy: 0.05, sz: 1.0 });
    const sides = [[0, 1, [X0, Z1], [X1, Z1]], [0, -1, [X1, Z0], [X0, Z0]], [1, 0, [X1, Z1], [X1, Z0]], [-1, 0, [X0, Z0], [X0, Z1]]];
    const H = top - base;
    const courses = Math.max(2, Math.round(H / 0.17));
    const ch = H / courses;
    for (const [dx, dy, a, b] of sides) {
      if (!open(dx, dy)) continue;
      const mortar = c3(scale3(sideC, 0.32));
      P.quadC([a[0], base, a[1]], [b[0], base, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], mortar, mortar, mortar, mortar);
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const at = (u, h, out) => [a[0] + ex * u + dx * out, h, a[1] + ez * u + dy * out];
      for (let c = 0; c < courses; c++) {
        const y0 = base + c * ch, y1 = y0 + ch;
        const lift = 0.55 + 0.5 * ((y0 + ch / 2 - base) / H);
        let u = -((c % 2) * 0.27 + hash2(x * 3 + c, y * 5 + dx * 7 + dy * 11, 61) * 0.15);
        let k = 0;
        while (u < 1) {
          const w = 0.34 + hash2(x * 13 + c * 7 + k, y * 17 + dx + dy * 3, 62) * 0.22;
          const u0 = Math.max(0, u) + 0.014, u1 = Math.min(1, u + w) - 0.014;
          if (u1 - u0 > 0.04) {
            const rr = hash2(x * 31 + c * 5 + k * 3, y * 29 + dx * 2 + dy * 5, 63);
            const out = 0.012 + rr * 0.018;
            const col = c3(scale3(sideC, (0.78 + rr * 0.35) * lift));
            const capC = c3(scale3(sideC, (0.95 + rr * 0.35) * lift * 1.25));
            const g0 = y0 + 0.014, g1 = y1 - 0.014;
            P.quadC(at(u0, g0, out), at(u1, g0, out), at(u1, g1, out), at(u0, g1, out), col, col, col, col);
            // the block's upper lip catches the light
            P.quadC(at(u0, g1, out), at(u1, g1, out), at(u1, g1, 0), at(u0, g1, 0), capC, capC, capC, capC);
          }
          u += w;
          k++;
        }
      }
    }
  }

  // Raw rock: faceted, jittered faces that interlock across tiles
  _rockWall(P, x, y, t, base, top, nb) {
    const sideC = lin(t.side), topC = lin(t.top);
    const open = (dx, dy) => { const n = nb(dx, dy); return !(n.wall && n.h >= t.h - 0.01); };
    const q = (v) => Math.round(v * 6);
    const jit = (px, pz, k) => hash2(q(px) * 3 + k, q(pz) * 5 - k, 707) - 0.5;
    const topH = (px, pz) => top + jit(px, pz, 1) * 0.2 + (fbm(px * 0.7, pz * 0.7, 9, 2) - 0.5) * 0.3;
    const J = (px, py, pz, isTop) => {
      const edge = isTop ? 0 : 1;
      return [px + jit(px, pz + py * 3, 2) * 0.12 * edge, py, pz + jit(px + py * 3, pz, 3) * 0.12 * edge];
    };
    const S = 3;
    // top surface: a lumpy dark crown
    const tv = [];
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const px = x + i / S, pz = y + j / S;
      tv.push([px, topH(px, pz), pz]);
    }
    const tcol = (p) => c3(scale3(topC, 0.75 + 0.5 * (hash2(q(p[0]), q(p[2]), 11)) + (p[1] - top) * 1.2));
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = tv[(j + 1) * (S + 1) + i], b = tv[(j + 1) * (S + 1) + i + 1], c = tv[j * (S + 1) + i + 1], d = tv[j * (S + 1) + i];
      P.triC(a, b, c, tcol(a), tcol(b), tcol(c));
      P.triC(a, c, d, tcol(a), tcol(c), tcol(d));
    }
    const sides = [[0, 1, [x, y + 1], [x + 1, y + 1]], [0, -1, [x + 1, y], [x, y]], [1, 0, [x + 1, y + 1], [x + 1, y]], [-1, 0, [x, y], [x, y + 1]]];
    const R = 4;
    for (const [dx, dy, a, b] of sides) {
      if (!open(dx, dy)) continue;
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const grid = [];
      for (let r = 0; r <= R; r++) for (let i = 0; i <= S; i++) {
        const px = a[0] + ex * (i / S), pz = a[1] + ez * (i / S);
        const th = topH(px, pz);
        const py = base + (th - base) * (r / R);
        const p = r === R ? [px, th, pz] : J(px, py, pz, r === 0);
        // bulge outwards a little in the middle rows
        if (r > 0 && r < R) { const bulge = 0.05 + 0.05 * jit(px, pz + py, 4); p[0] += dx * bulge; p[2] += dy * bulge; }
        const hk = r / R;
        const strata = 0.9 + 0.12 * Math.sin(py * 21 + jit(px, pz, 5) * 3);
        const k = (0.5 + 0.65 * hk) * strata * (0.85 + 0.3 * (jit(px, pz + py * 2, 6) + 0.5));
        grid.push([p, c3(scale3(sideC, k))]);
      }
      for (let r = 0; r < R; r++) for (let i = 0; i < S; i++) {
        const A = grid[r * (S + 1) + i], B = grid[r * (S + 1) + i + 1], C = grid[(r + 1) * (S + 1) + i + 1], D = grid[(r + 1) * (S + 1) + i];
        P.triC(A[0], B[0], C[0], A[1], B[1], C[1]);
        P.triC(A[0], C[0], D[0], A[1], C[1], D[1]);
      }
    }
  }

  // Chasms drop away with sheer rock sides into darkness
  _pit(ground, x, y, t, nb) {
    const i0 = this._gi(x), j0 = this._gi(y);
    const floor = t.key === 'void' ? -2.4 : -2.0;
    const fc = t.key === 'void' ? [0, 0, 0] : scale3(lin(0x0b0a0a), 0.6);
    const c = c3(fc);
    ground.quadC([x, floor, y + 1], [x + 1, floor, y + 1], [x + 1, floor, y], [x, floor, y], c, c, c, c);
    const rock = lin(0x4a4038);
    const sides = [[0, 1, [0, 2], [2, 2]], [0, -1, [2, 0], [0, 0]], [1, 0, [2, 2], [2, 0]], [-1, 0, [0, 0], [0, 2]]];
    for (const [dx, dy, a, b] of sides) {
      if (isPit(nb(dx, dy))) continue;
      // two half-tile segments following the rim
      const pts = [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
      for (let s = 0; s < 2; s++) {
        const p = pts[s], q = pts[s + 1];
        const pa = [p[0] / 2 + x, this.gh(i0 + p[0], j0 + p[1]), p[1] / 2 + y];
        const pb = [q[0] / 2 + x, this.gh(i0 + q[0], j0 + q[1]), q[1] / 2 + y];
        const top = c3(scale3(rock, 0.9)), mid = c3(scale3(rock, 0.35)), bot = c3([0, 0, 0]);
        const midY = -0.5;
        // faces look into the pit
        ground.quadC([pb[0], midY, pb[2]], [pa[0], midY, pa[2]], pa, pb, mid, mid, top, top);
        ground.quadC([pb[0], floor, pb[2]], [pa[0], floor, pa[2]], [pa[0], midY, pa[2]], [pb[0], midY, pb[2]], bot, bot, mid, mid);
      }
    }
  }
}

const _c3 = new THREE.Color();
function c3(rgb) { return _c3.setRGB(rgb[0], rgb[1], rgb[2]).clone(); }

// Which kind of battlefield an arena is, from what it is made of
function inferStyle(map) {
  if (map.type === 'world') return 'world';
  if (map.type === 'dungeon') return 'dungeon';
  if (map.type !== 'arena') return map.fill === 'grass' ? 'town-out' : 'plain';
  const count = (key) => { let n = 0; const id = T[key]; for (const v of map.tiles) if (v === id) n++; return n; };
  switch (map.fill) {
    case 'grass':
      if (count('tree') >= 6) return 'forest';
      if (count('wall_stone') || count('rubble')) return 'ruins';
      if (count('shallows')) return 'bridge';
      return 'grass';
    case 'hills': return 'hills';
    case 'swamp': return 'swamp';
    case 'sand': return 'desert';
    case 'snow': return 'snow';
    case 'ocean': return 'water';
    case 'cobble': return 'town';
    case 'floor_stone': return 'indoor';
    case 'cave_floor': return 'cave';
    case 'ash': return 'ash';
    default: return 'grass';
  }
}
