// Decoration builders: chunky low-poly props placed on top of terrain tiles.
// Each builder receives a context:
//   B (lit props geometry: an AuxBuilder whose aux channel drives wind sway),
//   G (glow geometry), W (water geometry),
//   x, z (tile corner in world space), cx, cz (tile centre), y (surface height:
//   wall top, water level or ground), g (ground at the centre), gy(px, pz) ground
//   height anywhere,
//   t (terrain def), r(k) deterministic random, nb(dx,dy) neighbour terrain def,
//   map (the map being drawn), outside (scenery beyond the map's edge),
//   dark (an unlit map), light(px, pz, radius, colour, strength) adds a light
//   pool, torch (this wall carries a torch on its south face)
import * as THREE from 'three';
import { GeoBuilder, TPL, shade } from './builder.js';
import { T, TERRAIN } from '../data/terrain.js';
import { hash2 } from '../core/rng.js';
import { TOWN_DECOR } from './townDecor.js';

// GeoBuilder with one extra float per vertex ('aux'): how far a vertex sways
// in the wind for props, closeness to the shore for water.
export class AuxBuilder extends GeoBuilder {
  constructor() {
    super();
    this.aux = [];
    this.auxAt = null;
  }

  _pad(a) {
    const n = this.pos.length / 3;
    const f = this.auxAt;
    for (let i = this.aux.length; i < n; i++) {
      if (a !== undefined) this.aux.push(a);
      else this.aux.push(f ? f(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]) : 0);
    }
  }

  tri(a, b, c, color, ka, kb, kc) { super.tri(a, b, c, color, ka, kb, kc); this._pad(); }
  triC(a, b, c, ca, cb, cc) { super.triC(a, b, c, ca, cb, cc); this._pad(); }
  vert(x, y, z, nx, ny, nz, r, g, b, a) { super.vert(x, y, z, nx, ny, nz, r, g, b); this._pad(a); }
  shape(tpl, color, o) { super.shape(tpl, color, o); this._pad(); }
  append(other) { super.append(other); this._pad(); }

  build() {
    this._pad();
    const g = super.build();
    g.setAttribute('aux', new THREE.Float32BufferAttribute(this.aux, 1));
    return g;
  }
}

// sway grows with height above a plant's foot
function sway(B, y0, k) {
  if (B.aux) B.auxAt = (px, py) => Math.max(0, py - y0) * k;
}
function still(B) { if (B.aux) B.auxAt = null; }

// Painterly shading baked into vertex colours: parts facing the sun warm and
// brighten, the undersides cool and darken (foliage reads as soft volumes).
function paint(B, start, lo = 0.6, hi = 1.22, warm = 0.3) {
  const N = B.nor, C = B.col;
  for (let i = start; i < C.length; i += 3) {
    const sun = Math.max(0, Math.min(1, 0.45 + N[i + 1] * 0.45 - N[i] * 0.22 + N[i + 2] * 0.18));
    const k = lo + (hi - lo) * sun;
    C[i] *= k * (1 + warm * (sun - 0.45));
    C[i + 1] *= k * (1 + warm * 0.3 * (sun - 0.45));
    C[i + 2] *= k * (1 - warm * (sun - 0.45) * 1.3);
  }
}

const _rc = new THREE.Color();
const rgb = (hex) => _rc.setHex(hex).clone();
const lerpC = (a, b, t) => rgb(a).lerp(rgb(b), Math.max(0, Math.min(1, t)));

const OAKS = [0x4f9a34, 0x5aa83a, 0x438c30, 0x67ad3c, 0x3f8432];
const AUTUMN = [0xc8902c, 0xb8642a, 0xd0a83a];
const PINES = [0x245c3a, 0x1f5234, 0x2c6a40, 0x28603c];
const ROCKS = [0x8a8278, 0x7d756b, 0x958d82, 0x847a6c];
const TRUNK = 0x6b4a2b;

// Broadleaf tree: a stout trunk under a cluster of soft canopy balls.
// About 1.1 * s tall.
export function tree(B, x, y, z, s, r, palette = OAKS) {
  s *= 0.82;
  sway(B, y + 0.2 * s, 0.45);
  B.shape(TPL.taper8, TRUNK, { x, y: y - 0.04, z, sx: 0.15 * s, sy: 0.58 * s, sz: 0.15 * s, grad: 0.45 });
  B.shape(TPL.cone6, shade(TRUNK, 0.85), { x, y: y - 0.03, z, sx: 0.24 * s, sy: 0.14 * s, sz: 0.24 * s });
  const g = palette[Math.floor(r * palette.length) % palette.length];
  const start = B.col.length;
  B.shape(TPL.ico1, g, { x, y: y + 0.72 * s, z, sx: 0.66 * s, sy: 0.52 * s, sz: 0.66 * s, ry: r * 6 });
  for (let i = 0; i < (B.cheap ? 2 : 3); i++) {
    const a = r * 9 + i * 2.1;
    B.shape(TPL.blob, shade(g, 0.95 + 0.1 * i), { x: x + Math.cos(a) * 0.24 * s, y: y + 0.62 * s, z: z + Math.sin(a) * 0.24 * s, sx: 0.4 * s, sy: 0.34 * s, sz: 0.4 * s, ry: a });
  }
  B.shape(B.cheap ? TPL.blob : TPL.ico1, shade(g, 1.1), { x: x - 0.04 * s, y: y + 0.96 * s, z: z + 0.03 * s, sx: 0.42 * s, sy: 0.34 * s, sz: 0.42 * s, ry: r * 4 });
  paint(B, start);
  still(B);
}

function birch(B, x, y, z, s, r) {
  s *= 0.85;
  sway(B, y + 0.2 * s, 0.6);
  B.shape(TPL.cyl6, 0xe8e4d8, { x, y: y - 0.03, z, sx: 0.08 * s, sy: 0.75 * s, sz: 0.08 * s, grad: 0.25 });
  for (let i = 0; i < 3; i++) B.box(0x3a3632, { x, y: y + (0.15 + i * 0.2) * s, z: z + 0.035 * s, sx: 0.05 * s, sy: 0.02 * s, sz: 0.02 * s });
  const g = [0x8cc04a, 0x9ac850, 0x7ab040][Math.floor(r * 3)];
  const start = B.col.length;
  B.shape(TPL.blob, g, { x, y: y + 0.78 * s, z, sx: 0.36 * s, sy: 0.5 * s, sz: 0.36 * s, ry: r * 5 });
  B.shape(TPL.blob, shade(g, 1.08), { x: x + 0.08 * s, y: y + 1.02 * s, z: z - 0.02 * s, sx: 0.26 * s, sy: 0.34 * s, sz: 0.26 * s, ry: r * 3 });
  B.shape(TPL.blob, shade(g, 0.94), { x: x - 0.1 * s, y: y + 0.62 * s, z: z + 0.04 * s, sx: 0.24 * s, sy: 0.26 * s, sz: 0.24 * s });
  paint(B, start);
  still(B);
}

// Conifer: stacked drooping tiers. About 1.25 * s tall.
export function pine(B, x, y, z, s, r, snowy = false) {
  s *= 0.9;
  sway(B, y + 0.2 * s, 0.35);
  B.shape(TPL.taper8, 0x5a3e24, { x, y: y - 0.03, z, sx: 0.1 * s, sy: 0.32 * s, sz: 0.1 * s });
  const c = PINES[Math.floor(r * PINES.length) % PINES.length];
  const ry = r * 5;
  const start = B.col.length;
  const tiers = [[0.2, 0.62, 0.42], [0.45, 0.5, 0.38], [0.68, 0.38, 0.34], [0.88, 0.24, 0.34]];
  tiers.forEach(([ty, rad, h], i) => {
    B.shape(TPL.cone8, shade(c, 0.9 + i * 0.07), { x, y: y + ty * s, z, sx: rad * s, sy: h * s, sz: rad * s, ry: ry + i * 0.4 });
  });
  paint(B, start, 0.55, 1.25, 0.25);
  if (snowy) {
    for (let i = 1; i < 4; i++) {
      const [ty, rad, h] = tiers[i];
      B.shape(TPL.cone8, 0xeef3f8, { x, y: y + (ty + h * 0.45) * s, z, sx: rad * 0.55 * s, sy: h * 0.56 * s, sz: rad * 0.55 * s, ry: ry + i * 0.4 });
    }
  }
  still(B);
}

function deadTree(B, x, y, z, s, r, color = 0x5a4a3a) {
  sway(B, y + 0.3 * s, 0.15);
  B.shape(TPL.taper6, color, { x, y: y - 0.03, z, sx: 0.12 * s, sy: 0.8 * s, sz: 0.12 * s, rz: (r - 0.5) * 0.2, grad: 0.4 });
  for (let i = 0; i < 3; i++) {
    const a = r * 7 + i * 2.3;
    B.shape(TPL.taper6, shade(color, 1.1), { x: x + Math.cos(a) * 0.06 * s, y: y + (0.42 + i * 0.12) * s, z: z + Math.sin(a) * 0.06 * s, sx: 0.05 * s, sy: 0.32 * s, sz: 0.05 * s, rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9 });
  }
  still(B);
}

function rock(B, x, y, z, s, r, color, mossy = false) {
  const start = B.col.length;
  B.shape(TPL.dodec, color ?? ROCKS[Math.floor(r * 4) % 4], { x, y: y + 0.1 * s, z, sx: 0.36 * s, sy: 0.26 * s, sz: 0.3 * s, ry: r * 7, rx: r * 0.4, flat: true });
  // lit tops, shaded flanks; moss collects on top
  const N = B.nor, C = B.col;
  for (let i = start; i < C.length; i += 3) {
    const up = N[i + 1];
    const k = 0.62 + 0.5 * Math.max(0, up) - N[i] * 0.12;
    C[i] *= k; C[i + 1] *= k; C[i + 2] *= k * 1.03;
    if (mossy && up > 0.7) { C[i] *= 0.62; C[i + 1] *= 0.95; C[i + 2] *= 0.5; }
  }
}

function grassTuft(B, x, y, z, s, r, color) {
  const g = color ?? (r < 0.5 ? 0x5f9a3e : 0x76ac44);
  sway(B, y, 1.6);
  for (let i = 0; i < 5; i++) {
    const a = r * 6 + i * 1.3;
    const lean = 0.25 + 0.2 * ((i * 7 + r * 10) % 1);
    B.shape(TPL.cone4, shade(g, 0.78 + i * 0.08), { x: x + Math.cos(a) * 0.03 * s, y: y - 0.01, z: z + Math.sin(a) * 0.03 * s, sx: 0.04 * s, sy: (0.12 + 0.05 * (i % 3)) * s, sz: 0.025 * s, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, ry: a, grad: 0.55 });
  }
  still(B);
}

function bush(B, x, y, z, s, r, color = 0x4f8a34) {
  sway(B, y, 0.5);
  const start = B.col.length;
  B.shape(TPL.ico1, color, { x, y: y + 0.08 * s, z, sx: 0.28 * s, sy: 0.22 * s, sz: 0.28 * s, ry: r * 6 });
  B.shape(TPL.blob, shade(color, 1.1), { x: x + 0.08 * s, y: y + 0.13 * s, z: z - 0.04 * s, sx: 0.18 * s, sy: 0.16 * s, sz: 0.18 * s });
  B.shape(TPL.blob, shade(color, 0.95), { x: x - 0.09 * s, y: y + 0.07 * s, z: z + 0.05 * s, sx: 0.16 * s, sy: 0.13 * s, sz: 0.16 * s });
  paint(B, start);
  if (r < 0.35) for (let i = 0; i < 3; i++) B.shape(TPL.blob, [0xd83a3a, 0xf0e070, 0xf4f0ff][Math.floor(r * 9) % 3], { x: x + Math.cos(i * 2.1 + r) * 0.12 * s, y: y + 0.17 * s, z: z + Math.sin(i * 2.1 + r) * 0.12 * s, s: 0.035 * s });
  still(B);
}

function flowerPatch(B, x, y, z, s, r, cols) {
  sway(B, y, 2);
  for (let i = 0; i < 5; i++) {
    const a = r * 7 + i * 1.26, d = 0.05 + 0.06 * ((i * 3 + r * 7) % 1);
    const px = x + Math.cos(a) * d * s, pz = z + Math.sin(a) * d * s;
    const hgt = (0.08 + 0.03 * (i % 2)) * s;
    B.shape(TPL.cone4, 0x4f8a34, { x: px, y: y - 0.01, z: pz, sx: 0.03 * s, sy: hgt, sz: 0.02 * s, ry: a });
    B.shape(TPL.blob, cols[(i + Math.floor(r * 5)) % cols.length], { x: px, y: y + hgt, z: pz, sx: 0.06 * s, sy: 0.035 * s, sz: 0.06 * s, ry: a });
  }
  still(B);
}

function reedClump(B, x, y, z, s, r) {
  sway(B, y, 1.4);
  for (let i = 0; i < 6; i++) {
    const a = r * 5 + i * 1.05;
    const h = (0.2 + 0.12 * ((i * 5 + r * 9) % 1)) * s;
    const px = x + Math.cos(a) * 0.05 * s, pz = z + Math.sin(a) * 0.05 * s;
    B.shape(TPL.cone4, i % 3 ? 0x7a8a3a : 0x9a8a48, { x: px, y: y - 0.02, z: pz, sx: 0.025 * s, sy: h, sz: 0.025 * s, rx: Math.sin(a) * 0.18, rz: -Math.cos(a) * 0.18 });
    if (i % 2 === 0) B.shape(TPL.cyl6, 0x5a3a20, { x: px + Math.cos(a) * 0.18 * h, y: y + h * 0.82, z: pz + Math.sin(a) * 0.18 * h, sx: 0.03 * s, sy: 0.08 * s, sz: 0.03 * s, rx: Math.sin(a) * 0.18, rz: -Math.cos(a) * 0.18 });
  }
  still(B);
}

// A jagged faceted peak: rings of jittered points narrowing to a crooked
// apex, coloured from dark rock at the foot to pale stone and snow up top.
function crag(B, x, y, z, rad, hgt, r, snowLine = 2, gy = null, rockA = 0x5f564c, rockB = 0xa39a8c, foot = null) {
  const sides = 8;
  const rings = [[1, 0], [0.66, 0.3], [0.38, 0.62], [0.15, 0.86]];
  const rot = r * 6.28;
  const ax = x + (hash2(r * 99, 1, 3) - 0.5) * rad * 0.35, az = z + (hash2(r * 99, 2, 3) - 0.5) * rad * 0.35;
  const pts = rings.map(([f, hf], k) => {
    const row = [];
    for (let s = 0; s < sides; s++) {
      const a = rot + (s / sides) * Math.PI * 2 + (hash2(s, k, r * 1000) - 0.5) * 0.5;
      // alternate spurs and gullies give the flanks ridges
      const rr = rad * f * (s % 2 ? 0.68 : 1.08) * (0.8 + 0.4 * hash2(s * 3, k * 7, r * 1000 + 5));
      const cx = x + (ax - x) * hf, cz = z + (az - z) * hf;
      const px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
      let py = y + hgt * hf * (0.9 + 0.2 * hash2(s, k * 5, r * 1000 + 9));
      if (k === 0) py = gy ? gy(px, pz) - 0.06 : y - 0.04;
      row.push([px, py, pz]);
    }
    return row;
  });
  const apex = [ax, y + hgt, az];
  const col = (p) => {
    const h = (p[1] - y) / hgt;
    const snow = h > snowLine + (hash2(Math.round(p[0] * 9), Math.round(p[2] * 9), 4) - 0.5) * 0.18;
    if (snow) return rgb(h > snowLine + 0.12 ? 0xf4f8fc : 0xdfe8f0);
    if (foot && h < 0.16) return lerpC(foot, rockA, h / 0.16);
    return lerpC(rockA, rockB, Math.min(1, h * 1.15));
  };
  for (let k = 0; k < rings.length - 1; k++) {
    const A = pts[k], Bn = pts[k + 1];
    for (let s = 0; s < sides; s++) {
      const a = A[s], b = A[(s + 1) % sides], c = Bn[(s + 1) % sides], d = Bn[s];
      B.triC(a, c, b, col(a), col(c), col(b));
      B.triC(a, d, c, col(a), col(d), col(c));
    }
  }
  const L = pts[rings.length - 1];
  for (let s = 0; s < sides; s++) {
    const a = L[s], b = L[(s + 1) % sides];
    B.triC(a, apex, b, col(a), col(apex), col(b));
  }
}

function fire(G, x, y, z, s = 1) {
  G.shape(TPL.cone5, 0xff6a10, { x, y, z, sx: 0.16 * s, sy: 0.26 * s, sz: 0.16 * s });
  G.shape(TPL.cone5, 0xffc030, { x, y, z, sx: 0.09 * s, sy: 0.18 * s, sz: 0.09 * s, ry: 0.6 });
}

export const DECOR = {
  // --- the wild ---
  tufts(c) {
    const { B, cx, cz, r } = c;
    // a clump or two of long grass, the odd bush or stone: sparse, never speckle
    if (r(1) < 0.28) {
      const px = cx + (r(2) - 0.5) * 0.7, pz = cz + (r(3) - 0.5) * 0.7;
      grassTuft(B, px, c.gy(px, pz), pz, 1.1 + r(4) * 0.5, r(5));
    }
    if (r(6) < 0.1) {
      const px = cx + (r(7) - 0.5) * 0.6, pz = cz + (r(8) - 0.5) * 0.6;
      grassTuft(B, px, c.gy(px, pz), pz, 0.8 + r(9) * 0.4, r(10), 0x86b04c);
    }
    if (r(11) < 0.06) {
      const px = cx + (r(12) - 0.5) * 0.5, pz = cz + (r(13) - 0.5) * 0.5;
      bush(B, px, c.gy(px, pz), pz, 1.1, r(14));
    } else if (r(15) < 0.04) {
      const px = cx + (r(16) - 0.5) * 0.5, pz = cz + (r(17) - 0.5) * 0.5;
      rock(B, px, c.gy(px, pz) - 0.03, pz, 0.6, r(18), null, true);
    }
  },
  flowers(c) {
    const { B, cx, cz, r } = c;
    const sets = [[0xf5d840, 0xfff2a0], [0xe86a8a, 0xf4f0e8], [0xa080f0, 0xf4f0e8], [0xf08a40, 0xf5d840], [0xf4f0ff, 0xb0d0ff]];
    const cols = sets[Math.floor(r(2) * sets.length)];
    if (r(0) < 0.32) {
      const px = cx + (r(3) - 0.5) * 0.6, pz = cz + (r(4) - 0.5) * 0.6;
      flowerPatch(B, px, c.gy(px, pz), pz, 1.1 + r(5) * 0.4, r(6), cols);
    }
    if (r(7) < 0.25) {
      const px = cx + (r(8) - 0.5) * 0.7, pz = cz + (r(9) - 0.5) * 0.7;
      grassTuft(B, px, c.gy(px, pz), pz, 1.1, r(10), 0x8ab44c);
    }
  },
  trees(c) {
    const { B, cx, cz, r, outside } = c;
    const n = 2 + (r(1) < 0.45 ? 1 : 0);
    const spots = [[-0.22, -0.2], [0.22, -0.12], [-0.08, 0.22], [0.26, 0.26]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[(i + Math.floor(r(2) * 4)) % 4];
      const px = cx + ox + (r(10 + i) - 0.5) * 0.14, pz = cz + oz + (r(20 + i) - 0.5) * 0.14;
      const py = c.gy(px, pz), s = 1.1 + r(30 + i) * 0.45;
      const kind = r(40 + i);
      if (kind < 0.12) birch(B, px, py, pz, s * 0.95, r(50 + i));
      else tree(B, px, py, pz, s, r(50 + i), kind > 0.93 && !outside ? AUTUMN : OAKS);
    }
    if (r(5) < 0.5) {
      const px = cx + (r(6) - 0.5) * 0.7, pz = cz + (r(7) - 0.5) * 0.7;
      bush(B, px, c.gy(px, pz), pz, 0.9, r(8), 0x3f7a2c);
    }
  },
  pines(c) {
    const { B, cx, cz, r, map } = c;
    const snowy = map && c.nbCount((t) => t.key === 'snow' || t.key === 'peaks') > 1;
    const n = 3 + (r(1) < 0.5 ? 1 : 0);
    const spots = [[-0.24, -0.22], [0.22, -0.2], [-0.2, 0.2], [0.24, 0.22], [0, 0]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[(i + Math.floor(r(2) * 5)) % 5];
      const px = cx + ox + (r(10 + i) - 0.5) * 0.1, pz = cz + oz + (r(20 + i) - 0.5) * 0.1;
      pine(B, px, c.gy(px, pz), pz, 1.0 + r(30 + i) * 0.5, r(40 + i), snowy);
    }
  },
  hill(c) {
    // the ground itself rolls; crown it with long grass, stones and the odd tree
    const { B, cx, cz, r } = c;
    const at = (k, s = 0.7) => { const px = cx + (r(k) - 0.5) * s, pz = cz + (r(k + 1) - 0.5) * s; return [px, c.gy(px, pz), pz]; };
    if (r(1) < 0.6) { const [px, py, pz] = at(2); grassTuft(B, px, py, pz, 1.3, r(4), 0x8a9a48); }
    if (r(5) < 0.3) { const [px, py, pz] = at(6); bush(B, px, py, pz, 1, r(8), 0x6f8a3a); }
    if (r(9) < 0.2) { const [px, py, pz] = at(10, 0.5); rock(B, px, py - 0.04, pz, 0.8 + r(11) * 0.5, r(12), null, true); }
    if (r(13) < 0.12) { const [px, py, pz] = at(14, 0.4); tree(B, px, py, pz, 0.9, r(16)); }
  },
  mountain(c) { mountainDeco(c, false); },
  peak(c) { mountainDeco(c, true); },
  reeds(c) {
    const { B, cx, cz, r } = c;
    // dark pools among tussocks
    if (r(1) < 0.55) {
      const px = cx + (r(2) - 0.5) * 0.4, pz = cz + (r(3) - 0.5) * 0.4, s = 0.16 + r(4) * 0.12;
      const py = c.gy(px, pz) + 0.012;
      B.shape(TPL.cyl8, 0x3a4a2a, { x: px, y: py - 0.006, z: pz, sx: s * 2.3, sy: 0.006, sz: s * 1.9, ry: r(5) });
      B.shape(TPL.cyl8, 0x1a2620, { x: px, y: py - 0.002, z: pz, sx: s * 2, sy: 0.006, sz: s * 1.6, ry: r(5) });
    }
    const n = 1 + Math.floor(r(6) * 3);
    for (let i = 0; i < n; i++) {
      const px = cx - 0.35 + r(10 + i) * 0.7, pz = cz - 0.35 + r(20 + i) * 0.7;
      reedClump(B, px, c.gy(px, pz), pz, 1 + r(30 + i) * 0.5, r(40 + i));
    }
    if (r(7) < 0.15) {
      const px = cx + (r(8) - 0.5) * 0.4, pz = cz + (r(9) - 0.5) * 0.4;
      deadTree(B, px, c.gy(px, pz), pz, 1.1, r(11), 0x4a4434);
    }
  },
  pebbles(c) {
    const { B, cx, cz, r } = c;
    // sand: a few shells of stone, the odd tuft of beach grass
    if (r(1) < 0.12) {
      const px = cx + (r(2) - 0.5) * 0.6, pz = cz + (r(3) - 0.5) * 0.6;
      rock(B, px, c.gy(px, pz) - 0.04, pz, 0.45 + r(4) * 0.3, r(5), 0xc8b490);
    }
    if (r(6) < 0.12) {
      const px = cx + (r(7) - 0.5) * 0.6, pz = cz + (r(8) - 0.5) * 0.6;
      grassTuft(B, px, c.gy(px, pz), pz, 1, r(9), 0x9aa858);
    }
  },
  dunes(c) {
    const { B, cx, cz, r } = c;
    if (r(1) < 0.05) {
      const px = cx + (r(2) - 0.5) * 0.4, pz = cz + (r(3) - 0.5) * 0.4, py = c.gy(px, pz);
      // a lonely cactus
      sway(B, py, 0.1);
      B.shape(TPL.capsule, 0x5a8a3a, { x: px, y: py - 0.02, z: pz, sx: 0.09, sy: 0.4, sz: 0.09 });
      B.shape(TPL.capsule, 0x5a8a3a, { x: px + 0.07, y: py + 0.14, z: pz, sx: 0.06, sy: 0.16, sz: 0.06 });
      B.shape(TPL.capsule, 0x5a8a3a, { x: px - 0.06, y: py + 0.2, z: pz, sx: 0.06, sy: 0.12, sz: 0.06 });
      still(B);
    } else if (r(4) < 0.06) {
      const px = cx + (r(5) - 0.5) * 0.5, pz = cz + (r(6) - 0.5) * 0.5;
      rock(B, px, c.gy(px, pz) - 0.05, pz, 0.8, r(7), 0xb08a5a);
    }
  },
  snowdrift(c) {
    const { B, cx, cz, r } = c;
    if (r(1) < 0.08) {
      const px = cx + (r(2) - 0.5) * 0.5, pz = cz + (r(3) - 0.5) * 0.5;
      pine(B, px, c.gy(px, pz), pz, 0.9, r(4), true);
    } else if (r(5) < 0.1) {
      const px = cx + (r(6) - 0.5) * 0.5, pz = cz + (r(7) - 0.5) * 0.5;
      rock(B, px, c.gy(px, pz) - 0.05, pz, 0.6, r(8), 0x8a9098);
    }
  },
  road(c) {
    const { B, cx, cz, r } = c;
    // worn path: a few flat stones pressed into the dirt
    for (let i = 0; i < 2; i++) {
      if (r(1 + i) > 0.35) continue;
      const px = cx + (r(10 + i) - 0.5) * 0.5, pz = cz + (r(20 + i) - 0.5) * 0.5;
      B.shape(TPL.cyl6, 0x9a8a6a, { x: px, y: c.gy(px, pz) - 0.012, z: pz, sx: 0.12, sy: 0.025, sz: 0.09, ry: r(30 + i) * 3 });
    }
  },
  bridge(c) {
    const { B, cx, cz, nb } = c;
    const landEW = !nb(-1, 0).water || !nb(1, 0).water || nb(-1, 0).key === 'bridge' || nb(1, 0).key === 'bridge';
    const landNS = !nb(0, -1).water || !nb(0, 1).water || nb(0, -1).key === 'bridge' || nb(0, 1).key === 'bridge';
    const ew = landEW && !(landNS && !landEW);
    const deckY = -0.02;
    for (let i = 0; i < 5; i++) {
      const off = -0.4 + i * 0.2;
      B.box(i % 2 ? 0x9a7448 : 0x8a663e, ew ? { x: cx + off, y: deckY, z: cz, sx: 0.19, sy: 0.07, sz: 0.86 } : { x: cx, y: deckY, z: cz + off, sx: 0.86, sy: 0.07, sz: 0.19 });
    }
    for (const side of [-1, 1]) {
      const o = ew ? { x: cx, y: deckY + 0.16, z: cz + side * 0.4, sx: 1.0, sy: 0.05, sz: 0.06 } : { x: cx + side * 0.4, y: deckY + 0.16, z: cz, sx: 0.06, sy: 0.05, sz: 1.0 };
      B.box(0x5a3e24, o);
      for (const p of [-0.4, 0.4]) {
        B.box(0x5a3e24, ew ? { x: cx + p, y: deckY - 0.3, z: cz + side * 0.4, sx: 0.07, sy: 0.52, sz: 0.07 } : { x: cx + side * 0.4, y: deckY - 0.3, z: cz + p, sx: 0.07, sy: 0.52, sz: 0.07 });
      }
    }
  },
  lava(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.4) rock(B, cx + (r(2) - 0.5) * 0.6, y - 0.06, cz + (r(3) - 0.5) * 0.6, 0.7, r(4), 0x2a2220);
  },
  ashrocks(c) {
    const { B, G, cx, cz, r } = c;
    if (r(1) < 0.4) {
      const px = cx + (r(2) - 0.5) * 0.5, pz = cz + (r(3) - 0.5) * 0.5;
      crag(B, px, c.gy(px, pz), pz, 0.14, 0.25 + r(4) * 0.3, r(5), 2, c.gy, 0x24201e, 0x4a4240);
    }
    if (r(7) < 0.2) {
      const px = cx + (r(8) - 0.5) * 0.6, pz = cz + (r(9) - 0.5) * 0.6;
      let a = r(10) * 6.28, qx = px, qz = pz;
      for (let i = 0; i < 3; i++) {
        const len = 0.09 + r(20 + i) * 0.07;
        const nx = qx + Math.cos(a) * len, nz = qz + Math.sin(a) * len;
        G.box(i ? 0xff6a18 : 0xff9a30, { x: (qx + nx) / 2, y: c.gy(qx, qz) + 0.006, z: (qz + nz) / 2, sx: len + 0.01, sy: 0.01, sz: 0.018, ry: -a });
        qx = nx; qz = nz; a += (r(30 + i) - 0.5) * 1.8;
      }
    }
    if (r(11) < 0.06) deadTree(B, cx, c.gy(cx, cz), cz, 1, r(12), 0x2a2420);
  },

  // --- world-map sites: little dioramas ---
  town(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    B.shape(TPL.cyl12, 0xa49c8c, { x: cx, y: y - 0.02, z: cz, sx: 0.98, sy: 0.04, sz: 0.98 });
    const wall = 0xc4bcaa;
    // ring wall with a gate to the south
    wallRun(B, cx - 0.42, cz - 0.42, cx + 0.42, cz - 0.42, y, 0.16, wall);
    wallRun(B, cx - 0.42, cz - 0.42, cx - 0.42, cz + 0.42, y, 0.16, wall);
    wallRun(B, cx + 0.42, cz - 0.42, cx + 0.42, cz + 0.42, y, 0.16, wall);
    wallRun(B, cx - 0.42, cz + 0.42, cx - 0.1, cz + 0.42, y, 0.16, wall);
    wallRun(B, cx + 0.1, cz + 0.42, cx + 0.42, cz + 0.42, y, 0.16, wall);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) miniTower(B, G, cx + dx * 0.42, y, cz + dz * 0.42, 0.075, 0.3, wall, 0xb8402c);
    for (const dx of [-0.11, 0.11]) miniTower(B, G, cx + dx, y, cz + 0.42, 0.06, 0.26, wall, 0xb8402c);
    const roofs = [0xc0482e, 0xa83a2a, 0x4a6aa0, 0xc0602e, 0x7a4a8a];
    const spots = [[-0.22, -0.2, 0.2, 0], [0.04, -0.24, 0.18, 1.57], [0.24, -0.04, 0.18, 0], [-0.24, 0.12, 0.18, 1.57], [0.2, 0.2, 0.16, 0.3], [-0.04, 0.22, 0.14, 0]];
    spots.forEach(([dx, dz, s, ry], i) => cottage(B, G, cx + dx, y, cz + dz, s, s * 0.85, s * 0.8, 0xeee2c8, roofs[(i + Math.floor(r(1) * 5)) % 5], ry + (r(10 + i) - 0.5) * 0.3));
    // the temple spire
    B.box(0xe0d6c0, { x: cx + 0.02, y, z: cz - 0.02, sx: 0.13, sy: 0.5, sz: 0.13 });
    B.shape(TPL.cone4, 0x3a5a9a, { x: cx + 0.02, y: y + 0.5, z: cz - 0.02, sx: 0.2, sy: 0.3, sz: 0.2, ry: Math.PI / 4, flat: true });
    B.shape(TPL.ball, 0xf0c040, { x: cx + 0.02, y: y + 0.82, z: cz - 0.02, s: 0.04 });
    G.box(0xffd890, { x: cx + 0.02, y: y + 0.32, z: cz + 0.046, sx: 0.04, sy: 0.07, sz: 0.01 });
    banner(B, cx - 0.42, y + 0.42, cz + 0.42, 0xc03030, 0.8);
  },
  village(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    const thatch = 0xd8aa48;
    B.shape(TPL.cyl12, 0x9a8a5a, { x: cx, y: y - 0.025, z: cz, sx: 0.9, sy: 0.04, sz: 0.86 });
    cottage(B, G, cx - 0.2, y, cz - 0.14, 0.34, 0.26, 0.22, 0xe8d8b4, thatch, 0.3, true);
    cottage(B, G, cx + 0.24, y, cz + 0.02, 0.28, 0.24, 0.2, 0xdcc8a2, shade(thatch, 0.9), -0.4, true);
    cottage(B, G, cx - 0.08, y, cz + 0.26, 0.26, 0.22, 0.19, 0xe8d8b4, shade(thatch, 1.05), 0.1, true);
    // a strip of grain
    for (let i = 0; i < 3; i++) B.box(i % 2 ? 0xe0c050 : 0xc8a840, { x: cx + 0.26, y: y - 0.01, z: cz - 0.32 + i * 0.07, sx: 0.32, sy: 0.07, sz: 0.05 });
    for (let i = 0; i < 7; i++) B.box(0x6b4a2b, { x: cx - 0.46 + i * 0.15, y, z: cz + 0.47, sx: 0.025, sy: 0.12, sz: 0.025 });
    B.box(0x7a5a36, { x: cx - 0.01, y: y + 0.08, z: cz + 0.47, sx: 0.92, sy: 0.02, sz: 0.02 });
    // the well
    B.shape(TPL.cyl8, 0x9a948a, { x: cx + 0.16, y, z: cz + 0.3, sx: 0.12, sy: 0.08, sz: 0.12 });
    B.shape(TPL.cone4, 0x8a5a2a, { x: cx + 0.16, y: y + 0.16, z: cz + 0.3, sx: 0.15, sy: 0.08, sz: 0.15, ry: Math.PI / 4 });
    tree(B, cx + 0.38, y, cz - 0.38, 0.6, r(4));
  },
  castle(c) {
    const { B, G, cx, cz } = c;
    const y = c.g;
    const stone = 0xc8c2b2, roof = 0x3d5a9a;
    B.shape(TPL.cyl12, 0x8a8478, { x: cx, y: y - 0.02, z: cz, sx: 1.0, sy: 0.06, sz: 1.0 });
    // curtain walls with crenellations
    wallRun(B, cx - 0.36, cz - 0.36, cx + 0.36, cz - 0.36, y, 0.28, stone, 0.08);
    wallRun(B, cx - 0.36, cz - 0.36, cx - 0.36, cz + 0.36, y, 0.28, stone, 0.08);
    wallRun(B, cx + 0.36, cz - 0.36, cx + 0.36, cz + 0.36, y, 0.28, stone, 0.08);
    wallRun(B, cx - 0.36, cz + 0.36, cx - 0.09, cz + 0.36, y, 0.28, stone, 0.08);
    wallRun(B, cx + 0.09, cz + 0.36, cx + 0.36, cz + 0.36, y, 0.28, stone, 0.08);
    // gatehouse
    B.box(stone, { x: cx, y, z: cz + 0.36, sx: 0.2, sy: 0.34, sz: 0.12 });
    B.box(0x3a2a1a, { x: cx, y, z: cz + 0.425, sx: 0.09, sy: 0.18, sz: 0.01 });
    crenels(B, cx - 0.1, cz + 0.36, cx + 0.1, cz + 0.36, y + 0.34, stone, 0.12);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) miniTower(B, G, cx + dx * 0.37, y, cz + dz * 0.37, 0.1, 0.46, stone, roof);
    // the keep
    B.box(stone, { x: cx, y, z: cz - 0.08, sx: 0.34, sy: 0.6, sz: 0.3, grad: 0.15 });
    crenels(B, cx - 0.17, cz + 0.07, cx + 0.17, cz + 0.07, y + 0.6, stone, 0.3);
    miniTower(B, G, cx + 0.12, y + 0.3, cz - 0.16, 0.08, 0.5, stone, roof);
    for (const dx of [-0.08, 0.06]) G.box(0xffe090, { x: cx + dx, y: y + 0.4, z: cz + 0.072, sx: 0.04, sy: 0.07, sz: 0.01 });
    banner(B, cx + 0.12, y + 1.02, cz - 0.16, 0xd03030, 1);
  },
  cave(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    crag(B, cx, y, cz - 0.12, 0.62, 0.8, r(1), 0.85, c.gy, 0x5a5248, 0x9a9282);
    crag(B, cx - 0.32, y, cz - 0.24, 0.36, 0.5, r(2), 2, c.gy, 0x5a5248, 0x8a8274);
    crag(B, cx + 0.34, y, cz - 0.1, 0.3, 0.38, r(3), 2, c.gy, 0x5a5248, 0x8a8274);
    // the dark mouth, propped with timbers
    B.shape(TPL.hemi, 0x0c0a08, { x: cx, y: y + 0.02, z: cz + 0.24, sx: 0.32, sy: 0.3, sz: 0.52, rx: -Math.PI / 2 + 0.2 });
    B.box(0x6a4a2a, { x: cx - 0.17, y, z: cz + 0.3, sx: 0.05, sy: 0.3, sz: 0.05 });
    B.box(0x6a4a2a, { x: cx + 0.17, y, z: cz + 0.3, sx: 0.05, sy: 0.3, sz: 0.05 });
    B.box(0x5a3a22, { x: cx, y: y + 0.3, z: cz + 0.3, sx: 0.44, sy: 0.05, sz: 0.06 });
    for (const dx of [-0.24, 0.24]) {
      B.box(0x3a2a1a, { x: cx + dx, y, z: cz + 0.36, sx: 0.025, sy: 0.18, sz: 0.025 });
      G.shape(TPL.cone5, 0xffa030, { x: cx + dx, y: y + 0.18, z: cz + 0.36, sx: 0.05, sy: 0.08, sz: 0.05 });
    }
    rock(B, cx + 0.3, c.gy(cx + 0.3, cz + 0.32), cz + 0.32, 0.6, r(5), null, true);
    c.light(cx, cz + 0.6, 2.2, 0xffa040, 0.7);
  },
  tower(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    rock(B, cx - 0.22, y - 0.04, cz + 0.2, 0.9, r(1), null, true);
    rock(B, cx + 0.26, y - 0.04, cz + 0.1, 0.7, r(2), null, true);
    B.shape(TPL.cyl8, 0x8a8478, { x: cx, y: y - 0.02, z: cz, sx: 0.5, sy: 0.12, sz: 0.5 });
    B.shape(TPL.taper8, 0xb0aa9c, { x: cx, y: y + 0.1, z: cz, sx: 0.36, sy: 0.95, sz: 0.36, grad: 0.25 });
    B.shape(TPL.cyl8, 0xc0baac, { x: cx, y: y + 1.0, z: cz, sx: 0.38, sy: 0.08, sz: 0.38 });
    B.shape(TPL.cone8, 0x5a3a9a, { x: cx, y: y + 1.08, z: cz, sx: 0.46, sy: 0.5, sz: 0.46, grad: 0.3 });
    B.shape(TPL.ball, 0xf0c040, { x: cx, y: y + 1.6, z: cz, s: 0.05 });
    for (const [hy, a] of [[0.4, 0.3], [0.7, -0.4], [0.9, 0.1]]) G.box(0xd0b0ff, { x: cx + Math.sin(a) * 0.16, y: y + hy, z: cz + Math.cos(a) * 0.16, sx: 0.04, sy: 0.08, sz: 0.01, ry: a });
    G.box(0xffe090, { x: cx, y: y + 0.1, z: cz + 0.19, sx: 0.08, sy: 0.14, sz: 0.01 });
    G.shape(TPL.ico0, 0xc0a0ff, { x: cx + 0.3, y: y + 1.2, z: cz, s: 0.06 });
    G.shape(TPL.ico0, 0xa0e0ff, { x: cx - 0.28, y: y + 0.95, z: cz - 0.1, s: 0.05 });
    c.light(cx, cz + 0.3, 2, 0xb090ff, 0.6);
  },
  ruins(c) {
    const { B, cx, cz, r } = c;
    const stone = 0xc0b8a8;
    const y = c.g;
    B.shape(TPL.cyl12, 0x9a948a, { x: cx, y: y - 0.03, z: cz - 0.04, sx: 0.92, sy: 0.06, sz: 0.74 });
    B.shape(TPL.cyl12, 0xa8a296, { x: cx, y: y, z: cz - 0.12, sx: 0.76, sy: 0.05, sz: 0.4 });
    // a broken colonnade
    for (let i = 0; i < 5; i++) {
      const px = cx - 0.36 + i * 0.18, pz = cz - 0.2;
      const h = [0.78, 0.22, 0.62, 0.14, 0.7][(i + Math.floor(r(1) * 5)) % 5];
      B.shape(TPL.cyl8, stone, { x: px, y, z: pz, sx: 0.1, sy: h, sz: 0.1, grad: 0.3 });
      if (h > 0.5) B.box(shade(stone, 1.05), { x: px, y: y + h, z: pz, sx: 0.14, sy: 0.05, sz: 0.14 });
    }
    B.box(stone, { x: cx - 0.27, y: y + 0.82, z: cz - 0.2, sx: 0.3, sy: 0.07, sz: 0.12, rz: 0.05 });
    sway(B, y, 0.6);
    for (let i = 0; i < 3; i++) B.shape(TPL.blob, 0x4f8a34, { x: cx - 0.36 + i * 0.36, y: y + 0.18 + i * 0.12, z: cz - 0.15, sx: 0.09, sy: 0.16, sz: 0.06 });
    still(B);
    // tumbled drums and a slab
    B.shape(TPL.cyl8, shade(stone, 0.9), { x: cx + 0.15, y: y + 0.04, z: cz + 0.12, sx: 0.08, sy: 0.22, sz: 0.08, rz: Math.PI / 2, ry: r(2) * 3 });
    B.box(shade(stone, 0.85), { x: cx - 0.18, y: y - 0.01, z: cz + 0.18, sx: 0.26, sy: 0.05, sz: 0.16, ry: r(3) });
    bush(B, cx + 0.3, y, cz + 0.28, 0.8, r(4), 0x4f7a34);
    grassTuft(B, cx - 0.32, y, cz + 0.02, 1.2, r(5));
  },
  fortress(c) {
    const { B, G, cx, cz } = c;
    const dark = 0x3a3436, roof = 0x201c1e;
    const y = c.g;
    B.shape(TPL.cyl12, 0x2a2426, { x: cx, y: y - 0.02, z: cz, sx: 1.0, sy: 0.05, sz: 1.0 });
    wallRun(B, cx - 0.36, cz - 0.36, cx + 0.36, cz - 0.36, y, 0.26, dark, 0.08);
    wallRun(B, cx - 0.36, cz - 0.36, cx - 0.36, cz + 0.36, y, 0.26, dark, 0.08);
    wallRun(B, cx + 0.36, cz - 0.36, cx + 0.36, cz + 0.36, y, 0.26, dark, 0.08);
    wallRun(B, cx - 0.36, cz + 0.36, cx + 0.36, cz + 0.36, y, 0.26, dark, 0.08);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      B.shape(TPL.taper6, dark, { x: cx + dx * 0.36, y, z: cz + dz * 0.36, sx: 0.18, sy: 0.5, sz: 0.18, grad: 0.3 });
      B.shape(TPL.cone4, roof, { x: cx + dx * 0.36, y: y + 0.5, z: cz + dz * 0.36, sx: 0.16, sy: 0.4, sz: 0.16, flat: true });
    }
    B.shape(TPL.taper6, dark, { x: cx, y, z: cz - 0.06, sx: 0.4, sy: 0.85, sz: 0.36, grad: 0.35 });
    for (const dx of [-0.13, 0.13]) B.shape(TPL.cone4, roof, { x: cx + dx, y: y + 0.82, z: cz - 0.06, sx: 0.12, sy: 0.36, sz: 0.12, flat: true });
    B.shape(TPL.cone4, roof, { x: cx, y: y + 0.85, z: cz - 0.06, sx: 0.22, sy: 0.6, sz: 0.22, flat: true });
    G.box(0xff3010, { x: cx, y: y + 0.55, z: cz + 0.115, sx: 0.07, sy: 0.12, sz: 0.01 });
    G.box(0xff5020, { x: cx, y, z: cz + 0.37, sx: 0.12, sy: 0.14, sz: 0.012 });
    for (const dx of [-0.24, 0.24]) G.box(0xff4010, { x: cx + dx, y: y - 0.01, z: cz + 0.46, sx: 0.22, sy: 0.02, sz: 0.05 });
    c.light(cx, cz + 0.5, 2.4, 0xff4018, 0.9);
  },
  elfhall(c) {
    const { B, G, cx, cz } = c;
    const y = c.g;
    // a great silver-barked tree crowned in pale gold, a hall in its arms
    const tx = cx - 0.04, tz = cz - 0.1;
    sway(B, y + 0.8, 0.08);
    B.shape(TPL.taper8, 0xd8d0c0, { x: tx, y: y - 0.04, z: tz, sx: 0.3, sy: 1.25, sz: 0.3, grad: 0.35 });
    for (let i = 0; i < 5; i++) B.shape(TPL.cone6, 0xc8beac, { x: tx + Math.cos(i * 1.26) * 0.15, y: y - 0.03, z: tz + Math.sin(i * 1.26) * 0.15, sx: 0.14, sy: 0.24, sz: 0.14 });
    for (const a of [0.6, 2.4, 4.2]) B.shape(TPL.taper6, 0xd0c8b8, { x: tx + Math.cos(a) * 0.14, y: y + 0.95, z: tz + Math.sin(a) * 0.14, sx: 0.08, sy: 0.42, sz: 0.08, rz: Math.cos(a) * 0.7, rx: -Math.sin(a) * 0.7 });
    const start = B.col.length;
    B.shape(TPL.ico1, 0xa8c468, { x: tx, y: y + 1.45, z: tz, sx: 1.05, sy: 0.6, sz: 0.95 });
    B.shape(TPL.ico1, 0xc4d47c, { x: tx + 0.2, y: y + 1.65, z: tz + 0.04, sx: 0.6, sy: 0.42, sz: 0.56 });
    B.shape(TPL.blob, 0x94b458, { x: tx - 0.32, y: y + 1.38, z: tz + 0.08, sx: 0.5, sy: 0.38, sz: 0.5 });
    paint(B, start, 0.7, 1.2, 0.35);
    still(B);
    // a ring-platform around the trunk and the white pavilion at its foot
    B.shape(TPL.cyl12, 0xf0e8d4, { x: tx, y: y + 0.7, z: tz, sx: 0.62, sy: 0.05, sz: 0.62 });
    for (let i = 0; i < 6; i++) B.shape(TPL.cyl6, 0xf4eedc, { x: tx + Math.cos(i * 1.05) * 0.29, y: y + 0.75, z: tz + Math.sin(i * 1.05) * 0.29, sx: 0.025, sy: 0.12, sz: 0.025 });
    B.shape(TPL.cyl8, 0xf4eedc, { x: cx + 0.26, y, z: cz + 0.24, sx: 0.3, sy: 0.18, sz: 0.3 });
    B.shape(TPL.hemi, 0xe8f0dc, { x: cx + 0.26, y: y + 0.18, z: cz + 0.24, sx: 0.32, sy: 0.28, sz: 0.32 });
    B.shape(TPL.cone8, 0xe0c060, { x: cx + 0.26, y: y + 0.32, z: cz + 0.24, sx: 0.04, sy: 0.16, sz: 0.04 });
    G.box(0xfff0b0, { x: cx + 0.26, y, z: cz + 0.392, sx: 0.07, sy: 0.12, sz: 0.01 });
    for (const [dx, dy, dz] of [[-0.36, 0.95, 0.12], [0.3, 1.1, -0.28], [-0.12, 0.6, 0.3], [0.38, 0.8, 0.0], [0.05, 1.2, 0.38]]) G.shape(TPL.ico0, 0xf0fff0, { x: cx + dx, y: y + dy, z: cz + dz, s: 0.05 });
    c.light(cx, cz + 0.2, 2.6, 0xd0ffc0, 0.6);
  },
  dwarfgate(c) {
    mountainDeco(c, false, 0.9);
    const { B, G, cx, cz } = c;
    const y = c.gy(cx, cz + 0.42);
    const stone = 0x9a9284;
    // a great carved gate: pillars, a lintel with runes, steps and braziers
    B.box(shade(stone, 0.9), { x: cx, y: y - 0.06, z: cz + 0.36, sx: 0.78, sy: 0.7, sz: 0.2 });
    B.box(0x161210, { x: cx, y: y - 0.02, z: cz + 0.462, sx: 0.32, sy: 0.42, sz: 0.01 });
    B.shape(TPL.hemi, 0x161210, { x: cx, y: y + 0.4, z: cz + 0.462, sx: 0.32, sy: 0.16, sz: 0.01 });
    for (const dx of [-0.29, 0.29]) {
      B.box(shade(stone, 1.12), { x: cx + dx, y: y - 0.06, z: cz + 0.48, sx: 0.11, sy: 0.7, sz: 0.08 });
      B.box(shade(stone, 1.2), { x: cx + dx, y: y + 0.64, z: cz + 0.48, sx: 0.15, sy: 0.05, sz: 0.11 });
    }
    B.box(shade(stone, 1.18), { x: cx, y: y + 0.62, z: cz + 0.44, sx: 0.9, sy: 0.09, sz: 0.2 });
    B.shape(TPL.prism, shade(stone, 1.1), { x: cx, y: y + 0.71, z: cz + 0.44, sx: 0.5, sy: 0.12, sz: 0.16 });
    for (let i = 0; i < 2; i++) B.box(shade(stone, 1 - i * 0.06), { x: cx, y: y - 0.06 - i * 0.03, z: cz + 0.58 + i * 0.1, sx: 0.5 + i * 0.1, sy: 0.07, sz: 0.12 });
    G.box(0x60e0ff, { x: cx, y: y + 0.64, z: cz + 0.546, sx: 0.06, sy: 0.05, sz: 0.01 });
    for (const dx of [-0.29, 0.29]) G.box(0x60e0ff, { x: cx + dx, y: y + 0.18, z: cz + 0.525, sx: 0.03, sy: 0.24, sz: 0.01 });
    for (const dx of [-0.46, 0.46]) {
      B.shape(TPL.cyl6, 0x3a3430, { x: cx + dx, y: y - 0.04, z: cz + 0.58, sx: 0.05, sy: 0.22, sz: 0.05 });
      B.shape(TPL.taper6, 0x4a4440, { x: cx + dx, y: y + 0.22, z: cz + 0.58, sx: 0.14, sy: 0.06, sz: 0.14, rx: Math.PI });
      G.shape(TPL.cone5, 0xff8a20, { x: cx + dx, y: y + 0.2, z: cz + 0.58, sx: 0.1, sy: 0.16, sz: 0.1 });
    }
    c.light(cx, cz + 0.8, 2.2, 0xffa050, 0.7);
  },

  // --- settlements (streets, walls, furniture: see townDecor.js) ---
  bigtree(c) {
    const { B, cx, cz, y, r } = c;
    tree(B, cx + (r(1) - 0.5) * 0.1, y, cz + (r(2) - 0.5) * 0.1, 1.85, r(3));
  },
  stairsdown(c) {
    const { B, cx, cz, y } = c;
    B.box(0x0a0908, { x: cx, y: y - 0.01, z: cz, sx: 0.8, sy: 0.02, sz: 0.8 });
    for (let i = 0; i < 4; i++) B.box(shade(0x6b655c, 1 - i * 0.18), { x: cx, y: y - 0.01, z: cz + 0.3 - i * 0.18, sx: 0.7, sy: 0.025, sz: 0.16 });
    B.box(0x4a453f, { x: cx - 0.42, y, z: cz, sx: 0.08, sy: 0.12, sz: 0.85 });
    B.box(0x4a453f, { x: cx + 0.42, y, z: cz, sx: 0.08, sy: 0.12, sz: 0.85 });
  },
  stairsup(c) {
    const { B, cx, cz, y } = c;
    for (let i = 0; i < 4; i++) B.box(shade(0x9a948a, 1 - i * 0.05), { x: cx, y, z: cz + 0.3 - i * 0.2, sx: 0.75, sy: 0.08 + i * 0.09, sz: 0.2 });
    B.box(0x6a645c, { x: cx - 0.42, y, z: cz - 0.05, sx: 0.08, sy: 0.45, sz: 0.85 });
    B.box(0x6a645c, { x: cx + 0.42, y, z: cz - 0.05, sx: 0.08, sy: 0.45, sz: 0.85 });
  },
  brazier(c) {
    const { B, G, cx, cz, y } = c;
    B.shape(TPL.cyl6, 0x2a2624, { x: cx, y, z: cz, sx: 0.06, sy: 0.32, sz: 0.06 });
    B.shape(TPL.taper6, 0x3a3430, { x: cx, y: y + 0.3, z: cz, sx: 0.3, sy: 0.1, sz: 0.3, rx: Math.PI });
    B.shape(TPL.cyl6, 0x2a2624, { x: cx, y, z: cz, sx: 0.3, sy: 0.04, sz: 0.3 });
    fire(G, cx, y + 0.36, cz, 1.2);
  },

  // --- dungeon ---
  cavefloor(c) {
    const { B, G, cx, cz, r, nbCount } = c;
    const walls = nbCount((t) => t.wall);
    if (r(1) < 0.22) {
      const px = cx + (r(2) - 0.5) * 0.6, pz = cz + (r(3) - 0.5) * 0.6;
      rock(B, px, c.gy(px, pz) - 0.04, pz, 0.35 + r(4) * 0.3, r(5), 0x5a524a);
    }
    if (walls >= 2 && r(6) < 0.18) {
      const px = cx + (r(7) - 0.5) * 0.5, pz = cz + (r(8) - 0.5) * 0.5;
      crag(B, px, c.gy(px, pz), pz, 0.09, 0.28 + r(9) * 0.25, r(10), 2, c.gy, 0x3e3630, 0x6a6058);
    }
    if (r(15) < 0.035) {
      // glowing toadstools
      const px = cx + (r(16) - 0.5) * 0.5, pz = cz + (r(17) - 0.5) * 0.5, py = c.gy(px, pz);
      for (let i = 0; i < 3; i++) {
        const ox = px + Math.cos(i * 2.1 + r(18) * 3) * 0.06, oz = pz + Math.sin(i * 2.1 + r(18) * 3) * 0.06;
        B.shape(TPL.cyl6, 0xd8d0c0, { x: ox, y: py - 0.01, z: oz, sx: 0.02, sy: 0.06 + i * 0.02, sz: 0.02 });
        G.shape(TPL.hemi, 0x60f0c0, { x: ox, y: py + 0.05 + i * 0.02, z: oz, sx: 0.07, sy: 0.05, sz: 0.07 });
      }
      c.light(px, pz, 1.6, 0x40e0b0, 0.6);
    }
  },
  rockwall(c) {
    const { B, G, cx, cz, r, torch } = c;
    if (torch) wallTorch(c);
    else if (r(3) < 0.05 && c.nb(0, 1).walk && !c.nb(0, 1).wall) {
      // a seam of glowing crystal in the rock face
      const px = cx + (r(4) - 0.5) * 0.4;
      for (let i = 0; i < 3; i++) G.shape(TPL.cone4, [0x9a70ff, 0x60c0ff][i % 2], { x: px + (i - 1) * 0.07, y: c.g + 0.25 + i * 0.06, z: cz + 0.55, sx: 0.05, sy: 0.16, sz: 0.05, rx: 0.9, rz: (i - 1) * 0.4 });
      c.light(px, cz + 0.9, 1.8, 0x8070ff, 0.6);
    }
    void B;
  },
  dwall(c) {
    const { B, cx, cz, r, torch, nb } = c;
    if (torch) wallTorch(c);
    else if (r(5) < 0.07 && nb(0, 1).walk && !nb(0, 1).wall) {
      // a tattered banner hung on the face
      const y = c.g;
      B.box(0x3a3430, { x: cx, y: y + 0.66, z: cz + 0.53, sx: 0.32, sy: 0.025, sz: 0.025 });
      B.box([0x7a2028, 0x283a6a, 0x2a4a2a][Math.floor(r(6) * 3)], { x: cx, y: y + 0.24, z: cz + 0.53, sx: 0.24, sy: 0.42, sz: 0.012 });
      B.box(0xc0a040, { x: cx, y: y + 0.42, z: cz + 0.538, sx: 0.08, sy: 0.08, sz: 0.008, rz: Math.PI / 4 });
    }
  },
  dflags(c) {
    const { B, x, z, r, t } = c;
    // dressed flagstones laid with dark seams; the odd one cracked or sunk
    for (let qj = 0; qj < 2; qj++) for (let qi = 0; qi < 2; qi++) {
      const k = qj * 2 + qi;
      if (r(60 + k) < 0.05) continue;
      const px = x + 0.25 + qi * 0.5 + (r(10 + k) - 0.5) * 0.03, pz = z + 0.25 + qj * 0.5 + (r(20 + k) - 0.5) * 0.03;
      const col = shade(t.top, 1.05 + r(30 + k) * 0.32);
      const sunk = r(40 + k) < 0.1 ? -0.012 : 0;
      B.box(col, { x: px, y: c.gy(px, pz) - 0.012 + sunk, z: pz, sx: 0.45 + (r(50 + k) - 0.5) * 0.04, sy: 0.03, sz: 0.45, ry: (r(70 + k) - 0.5) * 0.06 });
    }
  },
  rubble(c) {
    const { B, cx, cz, r } = c;
    for (let i = 0; i < 4; i++) {
      const px = cx + (r(10 + i) - 0.5) * 0.6, pz = cz + (r(20 + i) - 0.5) * 0.6;
      rock(B, px, c.gy(px, pz) - 0.03, pz, 0.45 + r(30 + i) * 0.5, r(40 + i), 0x6a6058);
    }
  },
  web(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    for (let i = 0; i < 4; i++) B.box(0xe8e8e8, { x: cx, y: y + 0.3, z: cz, sx: 1.0, sy: 0.008, sz: 0.008, ry: i * 0.8 + r(1), rz: 0.15 });
    B.shape(TPL.torus, 0xd8d8d8, { x: cx, y: y + 0.3, z: cz, sx: 0.8, sy: 0.8, sz: 0.2, rx: -1.3 });
    B.shape(TPL.torus, 0xd0d0d0, { x: cx, y: y + 0.3, z: cz, sx: 0.45, sy: 0.45, sz: 0.2, rx: -1.3 });
  },
  bones(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    for (let i = 0; i < 5; i++) B.shape(TPL.capsule, 0xe8e0c8, { x: cx + (r(10 + i) - 0.5) * 0.6, y: y + 0.01, z: cz + (r(20 + i) - 0.5) * 0.6, sx: 0.035, sy: 0.22, sz: 0.035, rz: Math.PI / 2, ry: r(30 + i) * 3 });
    // a skull
    B.shape(TPL.ball, 0xf0e8d0, { x: cx, y: y + 0.07, z: cz, sx: 0.13, sy: 0.12, sz: 0.14 });
    B.box(0x2a2420, { x: cx - 0.03, y: y + 0.07, z: cz + 0.066, sx: 0.03, sy: 0.03, sz: 0.01 });
    B.box(0x2a2420, { x: cx + 0.03, y: y + 0.07, z: cz + 0.066, sx: 0.03, sy: 0.03, sz: 0.01 });
  },
  crystal(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    rock(B, cx, y - 0.06, cz, 1.0, r(1), 0x4a433d);
    const cols = [0x9a60ff, 0x60c0ff, 0xc080ff];
    for (let i = 0; i < 5; i++) {
      const a = r(2) * 6 + i * 1.26, d = i ? 0.16 : 0;
      G.shape(TPL.cone4, cols[i % 3], { x: cx + Math.cos(a) * d, y: y - 0.02, z: cz + Math.sin(a) * d, sx: 0.13, sy: (i ? 0.3 : 0.6) + r(30 + i) * 0.25, sz: 0.13, rx: Math.sin(a) * 0.35 * (i ? 1 : 0), rz: -Math.cos(a) * 0.35 * (i ? 1 : 0), flat: true });
    }
  },
};

Object.assign(DECOR, TOWN_DECOR);

// A mountain tile: one great faceted peak with lesser ones at its shoulders.
// Ranges grow taller where mountains crowd together.
function mountainDeco(c, snowy, scale = 1) {
  const { B, cx, cz, r, nbCount } = c;
  const around = nbCount((t) => t.key === 'mountains' || t.key === 'peaks' || t.key === 'dwarfgate');
  const big = (0.85 + around * 0.035) * scale;
  const y = c.g;
  const rockA = snowy ? 0x3a3c46 : 0x3e362c, rockB = snowy ? 0x6c707e : 0x7c7262;
  const foot = around < 8 ? (snowy ? 0x6a6e78 : 0x5a6436) : null;
  const px = cx + (r(3) - 0.5) * 0.2, pz = cz + (r(4) - 0.5) * 0.2;
  // lone peaks stay modest; ranges tower
  const hgt = (snowy ? 1.6 : 1.15) * big * (0.8 + r(2) * 0.4) * Math.min(1, 0.62 + around * 0.07);
  crag(B, px, y, pz, 0.7 * big, hgt, r(5), snowy ? 0.5 : (hgt > 1.2 ? 0.84 : 2), c.gy, rockA, rockB, foot);
  if (r(6) < 0.55) {
    const a = r(7) * 6.28;
    const sx = cx + Math.cos(a) * 0.34, sz = cz + Math.sin(a) * 0.3;
    crag(B, sx, c.gy(sx, sz), sz, 0.4 * big, hgt * (0.4 + r(9) * 0.2), r(11), snowy ? 0.5 : 2, c.gy, rockA, rockB, foot);
  }
  if (!snowy && r(13) < 0.35) {
    const a = r(14) * 6.28, sx = cx + Math.cos(a) * 0.42, sz = cz + Math.sin(a) * 0.42;
    pine(B, sx, c.gy(sx, sz), sz, 0.8, r(16));
  }
}

// --- little buildings for the world-map sites
function rotXZ(dx, dz, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [dx * c + dz * s, -dx * s + dz * c];
}

function cottage(B, G, x, y, z, w, d, h, wallC, roofC, ry = 0, thatch = false) {
  B.box(wallC, { x, y, z, sx: w, sy: h, sz: d, ry, grad: 0.18 });
  B.shape(TPL.prism, roofC, { x, y: y + h, z, sx: w + 0.05, sy: h * (thatch ? 0.95 : 0.8), sz: d + 0.07, ry, grad: 0.3 });
  const [ddx, ddz] = rotXZ(-w * 0.15, d / 2 + 0.004, ry);
  B.box(0x5a3a22, { x: x + ddx, y, z: z + ddz, sx: w * 0.22, sy: h * 0.62, sz: 0.012, ry });
  const [wdx, wdz] = rotXZ(w * 0.24, d / 2 + 0.006, ry);
  G.box(0xffd890, { x: x + wdx, y: y + h * 0.4, z: z + wdz, sx: w * 0.16, sy: h * 0.22, sz: 0.01, ry });
  if (!thatch) {
    const [cdx, cdz] = rotXZ(w * 0.3, -d * 0.12, ry);
    B.box(0x8a7a6a, { x: x + cdx, y: y + h, z: z + cdz, sx: 0.035, sy: h * 0.75, sz: 0.035, ry });
  }
}

function miniTower(B, G, x, y, z, rad, h, stone, roof) {
  B.shape(TPL.cyl8, stone, { x, y, z, sx: rad * 2, sy: h, sz: rad * 2, grad: 0.25 });
  B.shape(TPL.cyl8, shade(stone, 1.08), { x, y: y + h - 0.02, z, sx: rad * 2.3, sy: 0.05, sz: rad * 2.3 });
  B.shape(TPL.cone8, roof, { x, y: y + h + 0.03, z, sx: rad * 2.6, sy: rad * 2.8, sz: rad * 2.6, grad: 0.25 });
  if (G) G.box(0xffe090, { x, y: y + h * 0.6, z: z + rad * 0.98, sx: rad * 0.45, sy: rad * 0.7, sz: 0.01 });
}

function crenels(B, x0, z0, x1, z1, y, color, step = 0.08) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(L / step));
  const a = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i += 2) {
    const t = i / n;
    B.box(color, { x: x0 + (x1 - x0) * t, y, z: z0 + (z1 - z0) * t, sx: step * 0.8, sy: 0.04, sz: 0.05, ry: a });
  }
}

function wallRun(B, x0, z0, x1, z1, y, h, color, th = 0.06) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const a = Math.atan2(-(z1 - z0), x1 - x0);
  B.box(color, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, sx: L + th, sy: h, sz: th, ry: a, grad: 0.25 });
  crenels(B, x0, z0, x1, z1, y + h, color, 0.07);
}

function banner(B, x, y, z, color, s = 1) {
  B.shape(TPL.cyl6, 0x3a3028, { x, y, z, sx: 0.018 * s, sy: 0.32 * s, sz: 0.018 * s });
  sway(B, y + 0.2 * s, 0.6);
  B.box(color, { x: x + 0.08 * s, y: y + 0.22 * s, z, sx: 0.15 * s, sy: 0.09 * s, sz: 0.012 * s });
  still(B);
}

// --- dungeon lights
// A torch in an iron bracket on the south (camera-facing) side of a wall
function wallTorch(c) {
  const { B, G, cx, cz } = c;
  const y = c.g, fz = cz + 0.5 + (c.t.key === 'cave_wall' ? 0.09 : 0);
  B.box(0x2a2624, { x: cx, y: y + 0.42, z: fz + 0.03, sx: 0.05, sy: 0.12, sz: 0.06 });
  B.shape(TPL.cyl6, 0x5a3a22, { x: cx, y: y + 0.44, z: fz + 0.08, sx: 0.035, sy: 0.2, sz: 0.035, rx: 0.35 });
  B.shape(TPL.cyl6, 0x3a2a1a, { x: cx, y: y + 0.6, z: fz + 0.14, sx: 0.06, sy: 0.04, sz: 0.06, rx: 0.35 });
  G.shape(TPL.ico0, 0xff5a10, { x: cx, y: y + 0.67, z: fz + 0.15, sx: 0.13, sy: 0.1, sz: 0.13 });
  G.shape(TPL.cone5, 0xff8a20, { x: cx, y: y + 0.62, z: fz + 0.15, sx: 0.15, sy: 0.3, sz: 0.15 });
  G.shape(TPL.cone5, 0xffe070, { x: cx, y: y + 0.63, z: fz + 0.16, sx: 0.08, sy: 0.2, sz: 0.08, ry: 0.6 });
  c.light(cx, fz + 0.7, 4.2, 0xffa048, 1.1);
}

// Which dark-map walls carry a torch: a lit face towards an open floor, spread out
export function wallTorchAt(map, x, y) {
  if (!map || map.lighting !== 'dark' || x < 0 || y < 0 || x >= map.w || y + 1 >= map.h) return false;
  const at = (xx, yy) => TERRAIN[map.tiles[yy * map.w + xx]];
  const t = at(x, y);
  if (!t || !(t.key === 'dungeon_wall' || t.key === 'cave_wall')) return false;
  const s = at(x, y + 1);
  if (!s || s.wall || !s.walk) return false;
  const p = t.key === 'cave_wall' ? 0.1 : 0.2;
  if (hash2(x, y, 5150) > p) return false;
  // keep neighbours apart
  for (let dx = 1; dx <= 2; dx++) if (x - dx >= 0 && hash2(x - dx, y, 5150) <= p && at(x - dx, y)?.wall && at(x - dx, y + 1)?.walk) return false;
  return true;
}

export { T };
