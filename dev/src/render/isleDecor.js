// The isles: jungle, palm groves on the sand, mangroves wading in the
// shallows, coral reefs, and the ruins of an older people — cracked paving,
// carved temple walls, idols and sacred pools — plus the world-map temple
// and the battlefields fought among them. Builders take the usual DECOR
// context (see decor.js); this module has no imports from decor.js, so the
// two can be loaded in either order.
import * as THREE from 'three';
import { TPL, shade } from './builder.js';
import { hash2 } from '../core/rng.js';

const WATER_Y = -0.12, POOL_Y = 0.02; // (terrainView's water levels)

function sway(B, y0, k) { if (B.aux) B.auxAt = (px, py) => Math.max(0, py - y0) * k; }
function still(B) { if (B.aux) B.auxAt = null; }
// hanging things swing at the foot, not where they are tied on
function swayDown(B, yTop, k) { if (B.aux) B.auxAt = (px, py) => Math.max(0, yTop - py) * k; }
// A light swept tube for trunks and roots: rings of `sides` round the
// polyline through pts (radius per point, colour per ring from col(t)), no
// end caps. Far cheaper to build than sculpt's tube, for scenery by the
// thousand; vertices pass through vert() so they take the sway.
const _sc = new THREE.Color();
function sweep(B, pts, radii, col, sides = 5) {
  const n = pts.length;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let l = Math.hypot(...T) || 1; T = T.map((v) => v / l);
    const ref = Math.abs(T[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let N = [T[1] * ref[2] - T[2] * ref[1], T[2] * ref[0] - T[0] * ref[2], T[0] * ref[1] - T[1] * ref[0]];
    l = Math.hypot(...N) || 1; N = N.map((v) => v / l);
    const Bn = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
    const r = radii[i] ?? radii[radii.length - 1];
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = N[0] * ca + Bn[0] * sa, ny = N[1] * ca + Bn[1] * sa, nz = N[2] * ca + Bn[2] * sa;
      ring.push([pts[i][0] + nx * r, pts[i][1] + ny * r, pts[i][2] + nz * r, nx, ny, nz]);
    }
    _sc.setHex(typeof col === 'function' ? col(i / (n - 1)) : col);
    rings.push([ring, _sc.r, _sc.g, _sc.b]);
  }
  const put = (v, c) => B.vert(v[0], v[1], v[2], v[3], v[4], v[5], c[1], c[2], c[3]);
  for (let i = 0; i < n - 1; i++) {
    const A = rings[i], C = rings[i + 1];
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      put(A[0][k], A); put(A[0][k2], A); put(C[0][k2], C);
      put(A[0][k], A); put(C[0][k2], C); put(C[0][k], C);
    }
  }
}

// sun-warmed tops, cool undersides, as decor.js paints its foliage
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
// stone: lit tops, shaded flanks, moss on what faces the sky
function stoneShade(B, start, moss = 0) {
  const N = B.nor, C = B.col;
  for (let i = start; i < C.length; i += 3) {
    const up = N[i + 1];
    const k = 0.62 + 0.5 * Math.max(0, up) - N[i] * 0.12 + Math.max(0, N[i + 2]) * 0.06;
    C[i] *= k; C[i + 1] *= k; C[i + 2] *= k * 1.02;
    if (moss && up > 0.65) { C[i] *= 1 - 0.45 * moss; C[i + 1] *= 1 + 0.05 * moss; C[i + 2] *= 1 - 0.55 * moss; }
  }
}

// double-sided triangle (thin leaves are seen from both sides)
function tri2(B, a, b, c, col, ka = 1, kb = 1, kc = 1) {
  B.tri(a, b, c, col, ka, kb, kc);
  B.tri(a, c, b, col, ka * 0.72, kc * 0.72, kb * 0.72);
}

// ---------------------------------------------------------------- foliage
const JUNGLE = [0x1f5a2c, 0x266630, 0x1c5228, 0x2c6e30, 0x235e34];
const CANOPY_TOP = [0x3f8634, 0x4a8e36, 0x357a32, 0x55963a];
const FROND = 0x56a238, FROND_TIP = 0x9ac850, DRY = 0xb89a52;

// A feathery frond (palm, fern): a spine arching out and down along angle a,
// with pairs of sawtooth leaflets drooping from it.
function frond(B, x, y, z, a, len, lift, droop, w, col = FROND, tip = FROND_TIP, n = 5, elev = 0) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = -sa, pz = ca; // across the frond
  const at = (t) => [x + ca * len * t, y + len * (lift * t - droop * t * t) + elev * t, z + sa * len * t];
  const tc = (t) => (t < 0.5 ? col : shade(col, 1 + (t - 0.5) * 0.25));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
    const s0 = at(t0), s1 = at(t1), m = at(tm);
    const ww = w * Math.sin(Math.PI * (0.12 + tm * 0.8)) * len;
    for (const sd of [-1, 1]) {
      const L = [m[0] + px * sd * ww + ca * ww * 0.35, m[1] - ww * 0.45, m[2] + pz * sd * ww + sa * ww * 0.35];
      tri2(B, s0, s1, L, k === n - 1 ? tip : tc(tm), 1, 1.05, 0.85);
    }
  }
}

// A broad paddle leaf (banana, elephant's ear): a curved blade folded along
// its midrib, rising from (x, y, z) towards angle a.
function broadLeaf(B, x, y, z, a, len, w, rise, col) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = -sa, pz = ca;
  const mid = (t) => [x + ca * len * t, y + len * (rise * t - (rise + 0.25) * t * t * 0.9), z + sa * len * t];
  const pts = [0, 0.45, 1].map(mid);
  const ww = w * len;
  const edge = (t, sd) => { const p = mid(t); return [p[0] + px * sd * ww, p[1] - ww * 0.3, p[2] + pz * sd * ww]; };
  for (const sd of [-1, 1]) {
    const e = edge(0.42, sd);
    tri2(B, pts[0], pts[1], e, shade(col, 0.9), 0.85, 1, 0.95);
    tri2(B, pts[1], pts[2], e, col, 1, 1.15, 0.95);
  }
}

// A small fern: fronds fanned out in a ring
function fern(B, x, y, z, s, r, col = 0x3f8a2e) {
  sway(B, y, 1.2);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = r * 6.28 + (i / n) * Math.PI * 2;
    frond(B, x, y + 0.01, z, a, (0.2 + 0.05 * ((i * 7 + r * 9) % 1)) * s, 0.9, 1.25, 0.32, col, shade(col, 1.3), 4);
  }
  still(B);
}

// A clump of broad leaves on short stems, the odd one bright and new
function leafClump(B, x, y, z, s, r, col = 0x3a8a30) {
  sway(B, y, 0.9);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = r * 6.28 + (i / n) * Math.PI * 2 + (i % 2) * 0.3;
    broadLeaf(B, x, y, z, a, (0.2 + 0.06 * (i % 3)) * s, 0.36, 1.1, i === 1 ? shade(col, 1.25) : shade(col, 0.95 + 0.06 * i));
  }
  still(B);
}

// Heliconia, orchid or bromeliad: a splash of colour on the forest floor
const BLOOMS = [[0xe8402a, 0xf0c030], [0xf06a9a, 0xfff0f4], [0xf0a030, 0xe84a2a], [0xc860d8, 0xf8e8ff]];
function bloom(B, x, y, z, s, r) {
  const [a, b] = BLOOMS[Math.floor(r * BLOOMS.length) % BLOOMS.length];
  sway(B, y, 1.4);
  B.shape(TPL.cone4, 0x3a7a2c, { x, y: y - 0.01, z, sx: 0.025 * s, sy: 0.2 * s, sz: 0.025 * s });
  for (let i = 0; i < 4; i++) {
    const t = i / 3, ang = r * 6 + i * 1.7;
    // bracts climbing the stem, zig-zag
    B.shape(TPL.cone4, i % 2 ? a : shade(a, 1.1), { x: x + Math.cos(ang) * 0.025 * s, y: y + (0.08 + t * 0.11) * s, z: z + Math.sin(ang) * 0.025 * s, sx: 0.035 * s, sy: 0.07 * s, sz: 0.02 * s, rz: Math.cos(ang) * 1.1, rx: -Math.sin(ang) * 1.1, ry: ang });
  }
  B.shape(TPL.blob, b, { x, y: y + 0.22 * s, z, s: 0.03 * s });
  still(B);
}

// A rainforest giant: a tall pale trunk on buttress roots under a crown of
// flat leafy tiers (an umbrella, not a ball), big leaves jagging its rim,
// lianas hanging from its boughs; now and then dotted with blossom.
// About 1.5 * s tall.
const BLOSSOM = [0xe0507a, 0xf08a3a, 0xf4d040, 0xc85ad0];
function rainTree(B, x, y, z, s, r, opt = {}) {
  const bark = [0x9a8a6c, 0x8a7c62, 0xa89a7c][Math.floor(r * 3) % 3];
  sway(B, y + 0.3 * s, 0.2);
  const trunkH = (opt.tall ?? 0.95) * s;
  B.shape(TPL.taper6, bark, { x, y: y - 0.04, z, sx: 0.12 * s, sy: trunkH, sz: 0.12 * s, grad: 0.55 });
  // buttress fins flaring out at the foot
  for (let i = 0; i < 3; i++) {
    const a = r * 9 + i * 2.1;
    B.shape(TPL.cone4, shade(bark, 0.85), { x: x + Math.cos(a) * 0.06 * s, y: y - 0.03, z: z + Math.sin(a) * 0.06 * s, sx: 0.2 * s, sy: 0.26 * s, sz: 0.04 * s, ry: -a });
  }
  // boughs reaching out to carry the tiers
  const ba = r * 5;
  for (let i = 0; i < 2; i++) {
    const a = ba + i * 2.9;
    B.shape(TPL.taper6, shade(bark, 0.92), { x: x + Math.cos(a) * 0.07 * s, y: y + trunkH * (0.62 + i * 0.12), z: z + Math.sin(a) * 0.07 * s, sx: 0.045 * s, sy: 0.3 * s, sz: 0.045 * s, rz: -Math.cos(a) * 1.0, rx: Math.sin(a) * 1.0 });
  }
  const g = JUNGLE[Math.floor(r * JUNGLE.length) % JUNGLE.length];
  const start = B.col.length;
  const cy = y + trunkH + 0.04 * s;
  // tiers: a broad dark lower shelf, smaller brighter pads riding above
  const pads = B.cheap ? 3 : 4;
  for (let i = 0; i < pads; i++) {
    const a = r * 11 + i * 2.4, d = i ? 0.24 * s : 0;
    const w = (i ? 0.42 : 0.74) * s;
    const col = i ? CANOPY_TOP[(i + Math.floor(r * 5)) % CANOPY_TOP.length] : g;
    B.shape(i ? TPL.blob : TPL.ico1, shade(col, i ? 0.92 : 1), { x: x + Math.cos(a) * d, y: cy - (i ? 0.02 + 0.05 * (i % 2) : 0.14) * s, z: z + Math.sin(a) * d * 0.9, sx: w, sy: w * (i ? 0.42 : 0.38), sz: w * 0.92, ry: a });
  }
  paint(B, start, 0.5, 1.3, 0.36);
  // big leaves bristling out of the rim, so the crown reads ragged and lush
  if (!B.cheap) {
    sway(B, cy - 0.2 * s, 0.6);
    for (let i = 0; i < 6; i++) {
      const a = r * 7 + (i / 6) * Math.PI * 2;
      const lx = x + Math.cos(a) * 0.3 * s, lz = z + Math.sin(a) * 0.28 * s;
      broadLeaf(B, lx, cy - 0.08 * s, lz, a, 0.24 * s, 0.32, 0.2, i % 2 ? 0x3a8432 : 0x2e7430);
    }
  }
  // blossom scattered over the top of a flowering tree
  if (opt.flower !== false && (opt.flower || r > 0.9)) {
    const bc = BLOSSOM[Math.floor(r * 37) % BLOSSOM.length];
    for (let i = 0; i < 7; i++) {
      const a = r * 13 + i * 0.9, d = (0.08 + (i % 3) * 0.1) * s;
      B.shape(TPL.blob, i % 3 ? bc : shade(bc, 1.15), { x: x + Math.cos(a) * d, y: cy + (0.06 + (i % 2) * 0.03) * s, z: z + Math.sin(a) * d, s: 0.07 * s });
    }
  }
  still(B);
  // lianas falling from the crown's rim, each with a few leaves
  if (!B.cheap && opt.vines !== false) {
    const nv = opt.vines ?? 2;
    for (let i = 0; i < nv; i++) {
      const a = r * 17 + i * 2.6 + 0.6;
      const vx = x + Math.cos(a) * 0.34 * s, vz = z + Math.abs(Math.sin(a)) * 0.28 * s;
      const len = (0.35 + hash2(i, r * 100, 7) * 0.35) * s;
      swayDown(B, cy - 0.18 * s, 0.7);
      B.box(0x2c5a22, { x: vx, y: cy - 0.18 * s - len, z: vz, sx: 0.014 * s, sy: len, sz: 0.014 * s });
      for (let k = 0; k < 2; k++) B.shape(TPL.cone4, k ? 0x4a8a30 : 0x3a7a2a, { x: vx, y: cy - 0.18 * s - len * (0.35 + k * 0.45), z: vz + 0.012, sx: 0.05 * s, sy: 0.07 * s, sz: 0.015 * s, rz: k ? 2.4 : -2.4 });
      still(B);
    }
  }
}

// A tree fern: a shaggy dark trunk under a shuttlecock of long lacy fronds
function treeFern(B, x, y, z, s, r) {
  sway(B, y + 0.1 * s, 0.3);
  const H = (0.55 + 0.2 * r) * s;
  B.shape(TPL.cyl6, 0x4a3a28, { x, y: y - 0.03, z, sx: 0.07 * s, sy: H, sz: 0.07 * s, grad: 0.4 });
  for (let i = 0; i < 3; i++) B.shape(TPL.cyl6, 0x5a4630, { x, y: y + H * (0.3 + i * 0.25), z, sx: 0.085 * s, sy: 0.04 * s, sz: 0.085 * s, ry: i });
  sway(B, y + H - 0.05 * s, 0.9);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = r * 6.28 + (i / n) * Math.PI * 2;
    frond(B, x, y + H, z, a, 0.42 * s, 0.75, 1.05, 0.26, i % 2 ? 0x4a9a34 : 0x3e8a2e, 0x7ab84a, 5);
  }
  // a young frond still curled like a crozier
  B.shape(TPL.torus, 0x6aa840, { x, y: y + H + 0.08 * s, z, sx: 0.08 * s, sy: 0.08 * s, sz: 0.15 * s, ry: r * 3 });
  still(B);
}

// A wild banana: a few great paddle leaves, torn along their edges
function banana(B, x, y, z, s, r) {
  sway(B, y + 0.05 * s, 0.7);
  B.shape(TPL.taper6, 0x6a8a3a, { x, y: y - 0.02, z, sx: 0.06 * s, sy: 0.32 * s, sz: 0.06 * s });
  for (let i = 0; i < 5; i++) {
    const a = r * 6.28 + i * 1.3;
    broadLeaf(B, x, y + (0.26 + (i % 2) * 0.05) * s, z, a, 0.36 * s, 0.24, 0.8, i % 2 ? 0x5aa63a : 0x4a9a36);
  }
  if (r > 0.7) B.shape(TPL.cone6, 0x9a2a48, { x: x + 0.04 * s, y: y + 0.2 * s, z: z + 0.05 * s, sx: 0.06 * s, sy: 0.1 * s, sz: 0.06 * s, rx: Math.PI * 0.9 });
  still(B);
}

// A coconut palm, its trunk leaning (towards the sea, if it can see it) and
// curving back up to a crown of arching fronds, with nuts under the crown.
// About 1.25 * s tall.
function palm(B, x, y, z, s, r, lean = null) {
  const la = lean ?? r * 6.28;
  const lk = (0.22 + 0.2 * hash2(r * 1000, 3, 5)) * s;
  const H = (1.05 + 0.25 * hash2(r * 1000, 4, 5)) * s;
  const lx = Math.cos(la), lz = Math.sin(la);
  sway(B, y + 0.1 * s, 0.3);
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const bend = lk * (1.6 * t - 0.75 * t * t); // out, then back up
    pts.push([x + lx * bend, y - 0.03 + H * t, z + lz * bend]);
  }
  const ring = (t) => (Math.floor(t * 11) % 2 ? 0x8a6c48 : 0x74583a);
  sweep(B, pts, [0.06 * s, 0.05 * s, 0.045 * s, 0.042 * s, 0.04 * s], ring, 6);
  const tp = pts[4];
  // a scruffy collar where the fronds spring from
  B.shape(TPL.cone6, 0x6a5232, { x: tp[0], y: tp[1] - 0.06 * s, z: tp[2], sx: 0.11 * s, sy: 0.1 * s, sz: 0.11 * s });
  // coconuts
  for (let i = 0; i < 3; i++) {
    const a = r * 7 + i * 2.1;
    B.shape(TPL.blob, i === 1 ? 0x7a8a3a : 0x5a4428, { x: tp[0] + Math.cos(a) * 0.05 * s, y: tp[1] - 0.06 * s, z: tp[2] + Math.sin(a) * 0.05 * s, s: 0.065 * s });
  }
  // fronds: a crown arching out and drooping, a couple of dead ones hanging
  sway(B, tp[1] - 0.1 * s, 0.9);
  const n = B.cheap ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const a = r * 3.1 + (i / n) * Math.PI * 2 + (hash2(i, r * 977, 1) - 0.5) * 0.4;
    const len = (0.5 + 0.12 * hash2(i, r * 977, 2)) * s;
    frond(B, tp[0], tp[1] + 0.01 * s, tp[2], a, len, 0.75, 1.35 + 0.3 * hash2(i, r * 977, 3), 0.2, i % 3 ? FROND : shade(FROND, 0.9), FROND_TIP, B.cheap ? 4 : 6);
  }
  // a young frond spearing up from the heart
  frond(B, tp[0], tp[1] + 0.02 * s, tp[2], la + 2, 0.32 * s, 2.2, 1.2, 0.22, 0x5aa236, 0x8ac04a, 3);
  if (!B.cheap) for (let i = 0; i < 2; i++) frond(B, tp[0], tp[1] - 0.04 * s, tp[2], la + 1.4 + i * 2.6, 0.36 * s, -0.6, 0.6, 0.2, DRY, shade(DRY, 0.8), 3);
  still(B);
  return tp;
}

// sea-ward neighbour (for palms to lean towards), or null
function seaSide(nb) {
  for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const n = nb(dx, dz);
    if (n && n.water && !n.deck) return Math.atan2(dz, dx);
  }
  return null;
}

function pebble(B, x, y, z, s, r, col) {
  const start = B.col.length;
  B.shape(TPL.dodec, col, { x, y: y + 0.03 * s, z, sx: 0.12 * s, sy: 0.08 * s, sz: 0.1 * s, ry: r * 7, flat: true });
  stoneShade(B, start);
}

// ---------------------------------------------------------------- reef life
const CORAL = [0xf07a6a, 0xf0a040, 0xc070d8, 0xf4d070, 0xe85a8a, 0x60d0b8];
function coralHead(B, W, x, z, s, r) {
  const y = WATER_Y;
  const kind = Math.floor(r * 4);
  const col = CORAL[Math.floor(r * 97) % CORAL.length];
  // flecks of foam where the swell breaks on it
  for (let i = 0; i < 4; i++) {
    const a = r * 9 + i * 1.6;
    W.shape(TPL.cyl6, 0xe4f6f2, { x: x + Math.cos(a) * 0.11 * s, y: y + 0.004, z: z + Math.sin(a) * 0.09 * s, sx: 0.07 * s, sy: 0.003, sz: 0.04 * s, ry: -a });
  }
  const start = B.col.length;
  if (kind === 0) {
    // brain coral: a ribbed dome just breaking the surface
    B.shape(TPL.ico1, shade(col, 0.9), { x, y: y - 0.06, z, sx: 0.22 * s, sy: 0.16 * s, sz: 0.2 * s, ry: r * 3 });
    for (let i = 0; i < 3; i++) B.box(shade(col, 0.68), { x, y: y + 0.01 + i * 0.008, z: z + (i - 1) * 0.05 * s, sx: (0.2 - Math.abs(i - 1) * 0.06) * s, sy: 0.02, sz: 0.014, ry: r * 3 });
  } else if (kind === 1) {
    // staghorn: forked branches reaching up out of the water
    for (let i = 0; i < 5; i++) {
      const a = r * 9 + i * 1.3, d = i ? 0.06 * s : 0;
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
      B.shape(TPL.taper6, col, { x: bx, y: y - 0.06, z: bz, sx: 0.035 * s, sy: (0.14 + 0.05 * (i % 3)) * s, sz: 0.035 * s, rz: Math.cos(a) * 0.4 * (i ? 1 : 0), rx: -Math.sin(a) * 0.4 * (i ? 1 : 0) });
      B.shape(TPL.blob, shade(col, 1.25), { x: bx + Math.cos(a) * 0.045 * s * (i ? 1 : 0), y: y + (0.08 + 0.05 * (i % 3)) * s - 0.06, z: bz + Math.sin(a) * 0.045 * s * (i ? 1 : 0), s: 0.035 * s });
    }
  } else if (kind === 2) {
    // a sea fan standing edge-on to the swell, and a sponge or two
    B.shape(TPL.cyl12, 0xb060c8, { x, y: y - 0.04, z: z - 0.02, sx: 0.2 * s, sy: 0.2 * s, sz: 0.014, rx: Math.PI / 2, ry: r * 0.6 });
    for (let i = 0; i < 2; i++) B.shape(TPL.cyl6, i ? 0xf0c040 : 0xf08040, { x: x + (i - 0.5) * 0.1 * s, y: y - 0.05, z: z + 0.05 * s, sx: 0.045 * s, sy: (0.1 + i * 0.04) * s, sz: 0.045 * s });
  } else {
    // a rock crusted with coral, a starfish sunning on it
    B.shape(TPL.dodec, 0x9a8e7a, { x, y: y - 0.06, z, sx: 0.26 * s, sy: 0.14 * s, sz: 0.22 * s, ry: r * 7, flat: true });
    for (let i = 0; i < 3; i++) B.shape(TPL.blob, CORAL[(i + Math.floor(r * 9)) % CORAL.length], { x: x + Math.cos(i * 2.1 + r) * 0.08 * s, y: y + 0.02, z: z + Math.sin(i * 2.1 + r) * 0.07 * s, s: 0.05 * s });
    for (let i = 0; i < 5; i++) {
      const a = r * 4 + (i / 5) * Math.PI * 2;
      B.box(0xf0703a, { x: x + Math.cos(a) * 0.03 * s, y: y + 0.045, z: z + Math.sin(a) * 0.03 * s, sx: 0.06 * s, sy: 0.012, sz: 0.018 * s, ry: -a });
    }
  }
  stoneShade(B, start);
}

// a sea turtle paddling over the reef
function turtle(B, W, x, z, a, s = 1) {
  const y = WATER_Y;
  const ca = Math.cos(a), sa = Math.sin(a);
  const at = (f, sd) => [x + ca * f + -sa * sd, z + sa * f + ca * sd];
  W.shape(TPL.cyl8, 0xc8eee8, { x, y: y + 0.003, z, sx: 0.3 * s, sy: 0.003, sz: 0.3 * s });
  B.shape(TPL.hemi, 0x5a6a3a, { x, y: y - 0.02, z, sx: 0.2 * s, sy: 0.1 * s, sz: 0.16 * s, ry: -a });
  B.shape(TPL.hemi, 0x7a8a4a, { x, y: y + 0.0, z, sx: 0.12 * s, sy: 0.06 * s, sz: 0.1 * s, ry: -a });
  const [hx, hz] = at(0.13 * s, 0);
  B.shape(TPL.blob, 0x8a9a5a, { x: hx, y: y + 0.01, z: hz, s: 0.06 * s });
  for (const f of [0.05, -0.07]) for (const sd of [-1, 1]) {
    const [fx, fz] = at(f * s, sd * 0.11 * s);
    B.box(0x7a8a4a, { x: fx, y: y + 0.0, z: fz, sx: 0.08 * s, sy: 0.012, sz: 0.035 * s, ry: -a + sd * (f > 0 ? 0.6 : -0.4) });
  }
}

// ---------------------------------------------------------------- stone
const PAVE = 0x9c9682;
// colour of the old stone: weathered warm grey, darker in the deep places
const stoneOf = (c, base = PAVE) => (c.dark ? shade(base, 0.82) : base);

// a fallen or standing column drum, fluted and mossy
function drum(B, x, y, z, s, r, lying, col) {
  const start = B.col.length;
  if (lying) {
    B.shape(TPL.cyl12, col, { x, y: y + 0.11 * s, z, sx: 0.24 * s, sy: 0.42 * s, sz: 0.24 * s, rz: Math.PI / 2, ry: r * 3, grad: 0.15 });
  } else {
    B.box(shade(col, 0.85), { x, y: y - 0.02, z, sx: 0.36 * s, sy: 0.08 * s, sz: 0.36 * s });
    B.shape(TPL.cyl12, col, { x, y: y + 0.05 * s, z, sx: 0.26 * s, sy: (0.25 + r * 0.25) * s, sz: 0.26 * s, grad: 0.3 });
  }
  stoneShade(B, start, 0.8);
}

// moss on a slab: a few soft green pads
function moss(B, x, y, z, s, r) {
  for (let i = 0; i < 2; i++) {
    const a = r * 7 + i * 2.6;
    B.shape(TPL.cyl8, i ? 0x5a8a34 : 0x4a7a2c, { x: x + Math.cos(a) * 0.05 * s, y, z: z + Math.sin(a) * 0.05 * s, sx: (0.12 - i * 0.03) * s, sy: 0.012, sz: (0.09 - i * 0.02) * s, ry: a });
  }
}

// creeping vine: a winding stem over the ground with leaves along it
function creeper(B, x, y, z, len, a, r, gy) {
  let px = x, pz = z, ang = a;
  for (let i = 0; i < 4; i++) {
    const nx = px + Math.cos(ang) * len / 4, nz = pz + Math.sin(ang) * len / 4;
    const yy = (gy ? Math.max(gy(px, pz), gy(nx, nz)) : y) + 0.012;
    B.box(0x3a6a26, { x: (px + nx) / 2, y: yy, z: (pz + nz) / 2, sx: len / 4 + 0.01, sy: 0.012, sz: 0.014, ry: -ang });
    B.shape(TPL.cone4, i % 2 ? 0x4a8a30 : 0x5a9a36, { x: nx, y: yy, z: nz, sx: 0.05, sy: 0.016, sz: 0.035, ry: -ang + (i % 2 ? 0.8 : -0.8) });
    px = nx; pz = nz; ang += (hash2(i, r * 100, 3) - 0.5) * 1.6;
  }
}

// A torch in a carved stone serpent's jaws, on a temple wall's south face
function sconce(c, fz) {
  const { B, G, cx } = c;
  const y = c.g;
  const st = shade(stoneOf(c, 0xa8a088), 1.05);
  B.box(st, { x: cx, y: y + 0.38, z: fz + 0.03, sx: 0.14, sy: 0.1, sz: 0.07 });
  B.shape(TPL.cone4, st, { x: cx, y: y + 0.44, z: fz + 0.08, sx: 0.12, sy: 0.12, sz: 0.1, rx: Math.PI / 2, ry: Math.PI / 4 });
  B.shape(TPL.cyl8, 0x3a3028, { x: cx, y: y + 0.5, z: fz + 0.12, sx: 0.1, sy: 0.05, sz: 0.1 });
  G.shape(TPL.ico0, 0xff6a14, { x: cx, y: y + 0.6, z: fz + 0.12, sx: 0.13, sy: 0.1, sz: 0.13 });
  G.shape(TPL.cone5, 0xff9a28, { x: cx, y: y + 0.54, z: fz + 0.12, sx: 0.15, sy: 0.3, sz: 0.15 });
  G.shape(TPL.cone5, 0xffe478, { x: cx, y: y + 0.55, z: fz + 0.13, sx: 0.08, sy: 0.2, sz: 0.08, ry: 0.6 });
  c.light(cx, fz + 0.7, 4.2, 0xffa048, 1.1);
}

// A great carved face on a wall's south side: a god's mask with heavy brows,
// hollow eyes, a broad nose and a grim mouth, ear-spools and a headdress
function reliefFace(B, G, cx, y, fz, st, dark, r) {
  const start = B.col.length;
  const hi = shade(st, 1.1), lo = shade(st, 0.7), hole = 0x1a1612;
  const f = fz + 0.01;
  // the panel it is cut from
  B.box(shade(st, 0.92), { x: cx, y: y + 0.12, z: f, sx: 0.78, sy: 0.6, sz: 0.04 });
  // headdress: a band of blocky feathers
  for (let i = -2; i <= 2; i++) B.box(i % 2 ? hi : shade(st, 1.0), { x: cx + i * 0.13, y: y + 0.63, z: f + 0.03, sx: 0.11, sy: 0.12 + (2 - Math.abs(i)) * 0.03, sz: 0.05 });
  B.box(hi, { x: cx, y: y + 0.58, z: f + 0.04, sx: 0.66, sy: 0.05, sz: 0.06 });
  // brow, eyes, nose, mouth
  B.box(hi, { x: cx, y: y + 0.5, z: f + 0.05, sx: 0.56, sy: 0.06, sz: 0.07 });
  for (const s of [-1, 1]) {
    B.box(hole, { x: cx + s * 0.13, y: y + 0.43, z: f + 0.035, sx: 0.14, sy: 0.07, sz: 0.02 });
    B.box(lo, { x: cx + s * 0.13, y: y + 0.47, z: f + 0.05, sx: 0.16, sy: 0.025, sz: 0.04 });
    if (dark) G.box(0x60ffb0, { x: cx + s * 0.13, y: y + 0.43, z: f + 0.047, sx: 0.05, sy: 0.03, sz: 0.008 });
    // ear-spools
    B.shape(TPL.cyl12, hi, { x: cx + s * 0.33, y: y + 0.38, z: f + 0.04, sx: 0.12, sy: 0.04, sz: 0.12, rx: Math.PI / 2 });
    B.shape(TPL.cyl8, lo, { x: cx + s * 0.33, y: y + 0.38, z: f + 0.06, sx: 0.05, sy: 0.02, sz: 0.05, rx: Math.PI / 2 });
  }
  B.shape(TPL.trap, hi, { x: cx, y: y + 0.27, z: f + 0.06, sx: 0.12, sy: 0.15, sz: 0.06 });
  B.box(lo, { x: cx, y: y + 0.27, z: f + 0.09, sx: 0.14, sy: 0.035, sz: 0.03 });
  B.box(hole, { x: cx, y: y + 0.17, z: f + 0.03, sx: 0.3, sy: 0.05, sz: 0.02 });
  B.box(hi, { x: cx, y: y + 0.2, z: f + 0.05, sx: 0.34, sy: 0.025, sz: 0.04 });
  B.box(hi, { x: cx, y: y + 0.135, z: f + 0.05, sx: 0.3, sy: 0.025, sz: 0.04 });
  for (let i = -2; i <= 2; i++) B.box(0xe8e0c8, { x: cx + i * 0.05, y: y + 0.17, z: f + 0.045, sx: 0.02, sy: 0.035, sz: 0.01 });
  stoneShade(B, start, 0.6);
  void r;
}

// glyph frieze: a row of square carved cartouches
function frieze(B, cx, y, fz, st) {
  const start = B.col.length;
  for (let i = -1; i <= 1; i++) {
    const x = cx + i * 0.3;
    B.box(shade(st, 1.06), { x, y, z: fz + 0.015, sx: 0.24, sy: 0.22, sz: 0.03 });
    B.box(shade(st, 0.72), { x, y: y + 0.05, z: fz + 0.03, sx: 0.16, sy: 0.12, sz: 0.01 });
    // a spiral-ish glyph: a ring and a dot
    B.shape(TPL.torus, shade(st, 1.15), { x, y: y + 0.11, z: fz + 0.035, sx: 0.12, sy: 0.12, sz: 0.1 });
    B.shape(TPL.blob, shade(st, 1.15), { x, y: y + 0.11, z: fz + 0.035, s: 0.035 });
  }
  stoneShade(B, start, 0.3);
}

// ---------------------------------------------------------------- the wall itself
// Carved temple masonry: courses of big chamfered ashlar blocks, each face
// weathered (pale above, damp and darker below), mortar gaps in shadow, a
// mossy capstone on top. Called by the terrain view in place of a plain block.
const _c = new THREE.Color();
const col3 = (hex, k) => { _c.setHex(hex); return new THREE.Color(Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)); };
export function templeWall(P, x, y, t, base, top, nb, dark) {
  const sideC = dark ? shade(t.side, 0.86) : t.side;
  const topC = t.top;
  const open = (dx, dy) => { const n = nb(dx, dy); return !(n.wall && n.h >= t.h - 0.01); };
  const X0 = x, X1 = x + 1, Z0 = y, Z1 = y + 1;
  // the top: a mossy slab
  const tk = 0.9 + 0.2 * hash2(x, y, 31);
  const tc = col3(topC, tk), tc2 = col3(topC, tk * 0.86);
  P.quadC([X0, top, Z1], [X1, top, Z1], [X1, top, Z0], [X0, top, Z0], tc, tc2, tc, tc2);
  const sides = [[0, 1, [X0, Z1], [X1, Z1]], [0, -1, [X1, Z0], [X0, Z0]], [1, 0, [X1, Z1], [X1, Z0]], [-1, 0, [X0, Z0], [X0, Z1]]];
  const H = top - base;
  const courses = Math.max(2, Math.round(H / 0.29));
  const ch = H / courses;
  for (const [dx, dy, a, b] of sides) {
    if (!open(dx, dy)) continue;
    // the capstone's lip overhangs this side
    P.box(col3(topC, 1.08 * tk), { x: (a[0] + b[0]) / 2 + dx * 0.02, y: top - 0.055, z: (a[1] + b[1]) / 2 + dy * 0.02, sx: dx ? 0.06 : 1.02, sy: 0.07, sz: dy ? 0.06 : 1.02 });
    const mortar = col3(sideC, 0.3);
    P.quadC([a[0], base, a[1]], [b[0], base, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], mortar, mortar, mortar, mortar);
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const at = (u, h, out) => [a[0] + ex * u + dx * out, h, a[1] + ez * u + dy * out];
    for (let c = 0; c < courses; c++) {
      const y0 = base + c * ch, y1 = y0 + ch - 0.055 * (c === courses - 1 ? 1 : 0);
      let u = -((c % 2) * 0.5 + hash2(x * 3 + c, y * 5 + dx * 7 + dy * 11, 71) * 0.2);
      let k = 0;
      while (u < 1) {
        const w = 0.55 + hash2(x * 13 + c * 7 + k, y * 17 + dx + dy * 3, 72) * 0.4;
        const u0 = Math.max(0, u) + 0.016, u1 = Math.min(1, u + w) - 0.016;
        if (u1 - u0 > 0.05) {
          const rr = hash2(x * 31 + c * 5 + k * 3, y * 29 + dx * 2 + dy * 5, 73);
          const out = 0.02 + rr * 0.02, bev = 0.022;
          const lift = 0.7 + 0.45 * ((y0 + ch / 2 - base) / H);
          const kf = (0.8 + rr * 0.3) * lift;
          // a block greened with moss along its top when the jungle is near
          const mossy = rr > 0.62;
          const face = col3(sideC, kf), faceLo = col3(mossy ? 0x6a7a4a : sideC, kf * 0.78);
          const g0 = y0 + 0.016, g1 = y1 - 0.016;
          P.quadC(at(u0 + bev, g0 + bev, out), at(u1 - bev, g0 + bev, out), at(u1 - bev, g1 - bev, out), at(u0 + bev, g1 - bev, out), faceLo, faceLo, face, face);
          // chamfers: lit top, shaded bottom and sides
          const capC = mossy ? col3(0x5a7a34, kf * 1.05) : col3(sideC, kf * 1.22);
          P.quadC(at(u0 + bev, g1 - bev, out), at(u1 - bev, g1 - bev, out), at(u1, g1, out - bev), at(u0, g1, out - bev), capC, capC, capC, capC);
          const botC = col3(sideC, kf * 0.55);
          P.quadC(at(u0, g0, out - bev), at(u1, g0, out - bev), at(u1 - bev, g0 + bev, out), at(u0 + bev, g0 + bev, out), botC, botC, botC, botC);
          const sC = col3(sideC, kf * 0.72);
          P.quadC(at(u0, g0, out - bev), at(u0 + bev, g0 + bev, out), at(u0 + bev, g1 - bev, out), at(u0, g1, out - bev), sC, sC, sC, sC);
          P.quadC(at(u1 - bev, g0 + bev, out), at(u1, g0, out - bev), at(u1, g1, out - bev), at(u1 - bev, g1 - bev, out), sC, sC, sC, sC);
        }
        u += w;
        k++;
      }
    }
  }
}

// What the battlefield's surroundings are made of, for the isle arenas
// (terrainView's _surround hands over: o = { x, y, d, near, south, r, r2, tk, fill, tall })
export const ISLE_SURROUND = {
  jungle(o) {
    const { near, south, d, r, r2, tk, fill } = o;
    if (south && d <= 2) return r2 < 0.35 ? tk('vines') : fill;
    if (r < 0.35 + near * 0.18) return tk(r2 < 0.12 ? 'palms' : 'jungle');
    return r2 < 0.5 ? tk('vines') : fill;
  },
  beach(o) {
    const { y, d, near, south, r, r2, tk, fill } = o;
    // the sea along the far side, palms down the flanks, the jungle behind
    if (y < 0) return d >= 3 ? tk('ocean') : d === 2 ? tk(r2 < 0.5 ? 'reef' : 'shallows') : tk('shallows');
    if (south) return d > 3 && r < 0.4 ? tk('jungle') : r2 < 0.25 ? tk('palms') : fill;
    if (near >= 1 && r < 0.2 + near * 0.15) return tk(near >= 3 ? 'jungle' : 'palms');
    return fill;
  },
  temple(o) {
    const { near, south, d, r, r2, tk, fill, tall } = o;
    if (south && d <= 2) return r2 < 0.3 ? tk('vines') : fill;
    if (tall(0.18 + near * 0.06) && near >= 1 && near <= 3) return tk(r2 < 0.5 ? 'temple_wall' : 'idol');
    if (near >= 2 && r < 0.3 + near * 0.15) return tk('jungle');
    return r2 < 0.45 ? tk('vines') : fill;
  },
};

// ---------------------------------------------------------------- the decor
export const ISLE_DECOR = {
  jungle(c) {
    const { B, cx, cz, r, outside } = c;
    // a rainforest giant (or two) at the back of the square; in front of it
    // a tree fern, a wild banana or a palm; and the undergrowth thick below:
    // ferns, broad leaves, the odd bright bloom
    const two = !c.thin && r(1) < 0.35;
    const spots = [[-0.18, -0.2], [0.2, -0.14]];
    for (let i = 0; i < (two ? 2 : 1); i++) {
      const [ox, oz] = two ? spots[i] : [(r(2) - 0.5) * 0.3, -0.12];
      const px = cx + ox + (r(10 + i) - 0.5) * 0.1, pz = cz + oz + (r(20 + i) - 0.5) * 0.1;
      rainTree(B, px, c.gy(px, pz), pz, (two ? 1.0 : 1.15) + r(30 + i) * 0.4, r(40 + i), { vines: outside ? 0 : i === 0 ? 2 : 1, tall: 0.85 + r(45 + i) * 0.35 });
    }
    if (outside) return;
    const k = r(3);
    const fx = cx + (r(4) - 0.5) * 0.5, fz = cz + 0.18 + r(5) * 0.18, fy = c.gy(fx, fz);
    if (c.thin) {
      // (beside a point of interest: only low growth in front)
    } else if (k < 0.3) treeFern(B, fx, fy, fz, 1 + r(6) * 0.3, r(7));
    else if (k < 0.55) banana(B, fx, fy, fz, 1 + r(6) * 0.3, r(7));
    else if (k < 0.68) palm(B, fx, fy, fz, 0.9 + r(6) * 0.3, r(7));
    else leafClump(B, fx, fy, fz, 1.2 + r(6) * 0.5, r(8), r(8) < 0.5 ? 0x3a8a30 : 0x2e7a2c);
    if (r(9) < 0.55) {
      const px = cx + (r(11) - 0.5) * 0.7, pz = cz + (r(12) - 0.5) * 0.6;
      fern(B, px, c.gy(px, pz), pz, 1 + r(13) * 0.4, r(14));
    }
    if (r(15) < 0.1) {
      const px = cx + (r(16) - 0.5) * 0.6, pz = cz + 0.15 + r(17) * 0.25;
      bloom(B, px, c.gy(px, pz), pz, 1.1, r(18));
    }
  },
  palms(c) {
    const { B, cx, cz, r, nb, outside } = c;
    const lean = seaSide(nb);
    const n = c.thin ? 1 : (r(1) < 0.45 ? 2 : 1);
    const spots = [[-0.18, -0.15], [0.2, 0.05], [0.0, 0.2]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[(i + Math.floor(r(2) * 3)) % 3];
      const px = cx + ox + (r(10 + i) - 0.5) * 0.15, pz = cz + oz + (r(20 + i) - 0.5) * 0.12;
      const a = lean != null ? lean + (r(25 + i) - 0.5) * 1.2 : r(26 + i) * 6.28;
      palm(B, px, c.gy(px, pz), pz, 0.95 + r(30 + i) * 0.35, r(40 + i), a);
    }
    if (outside) return;
    // beach clutter: a fallen nut or two, a pale stone, a tuft of dune grass
    if (r(5) < 0.3) {
      const px = cx + (r(6) - 0.5) * 0.6, pz = cz + (r(7) - 0.5) * 0.5, py = c.gy(px, pz);
      B.shape(TPL.blob, 0x5a4428, { x: px, y: py + 0.03, z: pz, s: 0.07 });
      B.shape(TPL.blob, 0x6a8a3a, { x: px + 0.07, y: py + 0.03, z: pz + 0.02, s: 0.065 });
    }
    if (r(8) < 0.2) {
      const px = cx + (r(9) - 0.5) * 0.7, pz = cz + (r(11) - 0.5) * 0.6;
      pebble(B, px, c.gy(px, pz) - 0.02, pz, 1 + r(12), r(13), 0xd8ccb0);
    }
    if (r(14) < 0.35) {
      const px = cx + (r(15) - 0.5) * 0.7, pz = cz + (r(16) - 0.5) * 0.6, py = c.gy(px, pz);
      sway(B, py, 1.5);
      for (let i = 0; i < 5; i++) {
        const a = r(17) * 6 + i * 1.3;
        B.shape(TPL.cone4, i % 2 ? 0x9aa850 : 0x7a9a40, { x: px, y: py - 0.01, z: pz, sx: 0.025, sy: 0.16 + 0.04 * (i % 3), sz: 0.02, rx: Math.sin(a) * 0.45, rz: -Math.cos(a) * 0.45, ry: a });
      }
      still(B);
    }
  },
  palmtree(c) {
    const { B, cx, cz, r, nb } = c;
    const y = c.g;
    const lean = seaSide(nb);
    const arena = c.map?.type === 'arena' && !c.outside;
    palm(B, cx + (r(1) - 0.5) * 0.1, y, cz + (r(2) - 0.5) * 0.1, arena ? 1.3 : 1.45, r(3), lean ?? r(4) * 6.28);
    // a little mound of sand and fallen nuts round the foot
    B.shape(TPL.cyl12, 0xd8c48a, { x: cx, y: y - 0.04, z: cz, sx: 0.5, sy: 0.05, sz: 0.46 });
    B.shape(TPL.blob, 0x5a4428, { x: cx + 0.16, y: y + 0.04, z: cz + 0.12, s: 0.08 });
  },
  jungletree(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    // (battle) the crown rides higher and lighter so fighters beside it stay in view
    const arena = c.map?.type === 'arena' && !c.outside;
    rainTree(B, cx + (r(1) - 0.5) * 0.1, y, cz + (r(2) - 0.5) * 0.1, arena ? 1.35 : 1.6, r(3), { tall: arena ? 1.05 : 0.95, vines: arena ? 1 : 3 });
    if (!arena) leafClump(B, cx + 0.22, y, cz + 0.24, 1.2, r(4));
    fern(B, cx - 0.25, y, cz + 0.2, 1.1, r(5));
  },
  vines(c) {
    const { B, cx, cz, r } = c;
    // ground smothered in growth: broad leaves, ferns, creepers, a rotting log
    if (r(1) < 0.55) {
      const px = cx + (r(2) - 0.5) * 0.6, pz = cz + (r(3) - 0.5) * 0.6;
      leafClump(B, px, c.gy(px, pz), pz, 0.9 + r(4) * 0.5, r(5), r(6) < 0.5 ? 0x3e8a30 : 0x4a9234);
    }
    if (r(7) < 0.45) {
      const px = cx + (r(8) - 0.5) * 0.7, pz = cz + (r(9) - 0.5) * 0.6;
      fern(B, px, c.gy(px, pz), pz, 0.9 + r(11) * 0.4, r(12), 0x4a8e30);
    }
    if (r(13) < 0.5) creeper(B, cx + (r(14) - 0.5) * 0.4, 0, cz + (r(15) - 0.5) * 0.4, 0.5, r(16) * 6.28, r(17), c.gy);
    if (r(18) < 0.1) bloom(B, cx + (r(19) - 0.5) * 0.5, c.gy(cx, cz), cz + (r(21) - 0.5) * 0.5, 1, r(22));
    else if (r(23) < 0.06 && !c.thin) {
      // a fallen trunk furred with moss
      const px = cx + (r(24) - 0.5) * 0.3, pz = cz + (r(25) - 0.5) * 0.3, a = r(26) * 3;
      const start = B.col.length;
      B.shape(TPL.cyl8, 0x6a5a40, { x: px, y: c.gy(px, pz) + 0.05, z: pz, sx: 0.12, sy: 0.6, sz: 0.12, rz: Math.PI / 2, ry: a, grad: 0.2 });
      stoneShade(B, start, 1);
      fern(B, px, c.gy(px, pz) + 0.08, pz, 0.6, r(27));
    }
  },
  mangrove(c) {
    const { B, cx, cz, r, outside } = c;
    // trees standing on arching prop roots in the shallows, crowns low and
    // glossy, breathing-roots poking up from the water about them
    const n = c.thin ? 1 : (r(1) < 0.55 ? 2 : 1);
    const spots = [[-0.18, -0.16], [0.2, 0.08], [-0.05, 0.2]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[(i + Math.floor(r(2) * 3)) % 3];
      const px = cx + ox + (r(10 + i) - 0.5) * 0.1, pz = cz + oz + (r(20 + i) - 0.5) * 0.1;
      const s = 0.9 + r(30 + i) * 0.35;
      const rk = r(40 + i);
      const y0 = WATER_Y - 0.06;
      const rootTop = y0 + 0.32 * s;
      sway(B, rootTop, 0.12);
      for (let k = 0; k < (B.cheap ? 3 : 5); k++) {
        const a = rk * 6.28 + (k / 5) * Math.PI * 2 + (hash2(k, rk * 99, 1) - 0.5) * 0.5;
        const R = (0.2 + 0.08 * hash2(k, rk * 99, 2)) * s;
        const ca = Math.cos(a), sa = Math.sin(a);
        const arc = [];
        for (let j = 0; j <= 4; j++) {
          const u = j / 4;
          // out from the trunk, arching over and plunging into the water
          arc.push([px + ca * R * u, rootTop + 0.06 * s * Math.sin(u * Math.PI * 0.8) - (rootTop - y0) * u * u, pz + sa * R * u]);
        }
        sweep(B, arc, [0.022 * s, 0.02 * s, 0.017 * s, 0.015 * s, 0.014 * s], (u) => (u < 0.5 ? 0x7a6a52 : 0x5e4e3a), 4);
      }
      B.shape(TPL.taper6, 0x6a5a44, { x: px, y: rootTop - 0.02, z: pz, sx: 0.07 * s, sy: 0.24 * s, sz: 0.07 * s });
      const start = B.col.length;
      const cyy = rootTop + 0.2 * s;
      const g = [0x2f6a30, 0x2a6230, 0x387434][Math.floor(rk * 3) % 3];
      B.shape(TPL.ico1, g, { x: px, y: cyy, z: pz, sx: 0.56 * s, sy: 0.3 * s, sz: 0.5 * s, ry: rk * 4 });
      for (let k = 0; k < 2; k++) {
        const a = rk * 9 + k * 2.6;
        B.shape(TPL.blob, shade(g, 1.05 + k * 0.08), { x: px + Math.cos(a) * 0.2 * s, y: cyy + 0.04 * s, z: pz + Math.sin(a) * 0.18 * s, sx: 0.3 * s, sy: 0.2 * s, sz: 0.3 * s, ry: a });
      }
      paint(B, start, 0.55, 1.3, 0.3);
      still(B);
      // breathing roots
      if (!outside) for (let k = 0; k < 4; k++) {
        const a = rk * 13 + k * 1.7, d = (0.3 + 0.1 * k) * s;
        B.shape(TPL.cone4, 0x6a5a40, { x: px + Math.cos(a) * d, y: WATER_Y - 0.05, z: pz + Math.sin(a) * d * 0.8, sx: 0.025, sy: 0.12, sz: 0.025 });
      }
    }
  },
  reef(c) {
    const { B, W, cx, cz, r, outside } = c;
    // coral beds seen through the clear water: clusters of soft blotches,
    // rose, ochre, violet and deep teal, as if just under the surface
    const BEDS = [0x3a9a94, 0x7aa08c, 0x8a8aa8, 0x2e8a8c, 0x9a9878];
    for (let i = 0; i < 3; i++) {
      const bx = cx + (r(1 + i) - 0.5) * 0.7, bz = cz + (r(10 + i) - 0.5) * 0.7;
      const col = BEDS[Math.floor(r(20 + i) * BEDS.length)];
      for (let k = 0; k < 4; k++) {
        const a = r(30 + i) * 6 + k * 1.7, d = k ? 0.06 + 0.05 * (k % 2) : 0;
        W.shape(TPL.cyl6, shade(col, 0.92 + 0.08 * k), { x: bx + Math.cos(a) * d, y: WATER_Y + 0.002 + k * 0.0004, z: bz + Math.sin(a) * d, sx: 0.09 + r(40 + i + k) * 0.08, sy: 0.003, sz: 0.08 + r(50 + i + k) * 0.07, ry: a });
      }
    }
    if (outside) return;
    const n = r(60) < 0.45 ? 1 : r(61) < 0.6 ? 2 : 0;
    for (let i = 0; i < n; i++) {
      const px = cx + (r(62 + i) - 0.5) * 0.7, pz = cz + (r(66 + i) - 0.5) * 0.7;
      coralHead(B, W, px, pz, 0.8 + r(70 + i) * 0.4, r(75 + i));
    }
    if (r(80) < 0.035) turtle(B, W, cx + (r(81) - 0.5) * 0.4, cz + (r(82) - 0.5) * 0.4, r(83) * 6.28, 1);
  },
  ruinsfloor(c) {
    const { B, x, z, r, t, nbCount } = c;
    const st = stoneOf(c, t.top);
    const wild = c.map?.type !== 'dungeon';
    // great slabs laid long ago, heaved and cracked by roots; one has gone,
    // and the earth and weeds show through
    const start = B.col.length;
    const gone = r(1) < 0.14 ? Math.floor(r(2) * 4) : -1;
    for (let qj = 0; qj < 2; qj++) for (let qi = 0; qi < 2; qi++) {
      const k = qj * 2 + qi;
      const px = x + 0.25 + qi * 0.5 + (r(10 + k) - 0.5) * 0.03, pz = z + 0.25 + qj * 0.5 + (r(20 + k) - 0.5) * 0.03;
      const py = c.gy(px, pz);
      if (k === gone) {
        B.shape(TPL.cyl8, 0x4a3e2c, { x: px, y: py - 0.005, z: pz, sx: 0.36, sy: 0.01, sz: 0.36 });
        if (wild || r(5) < 0.5) {
          sway(B, py, 1.5);
          for (let i = 0; i < 4; i++) {
            const a = r(6) * 6 + i * 1.6;
            B.shape(TPL.cone4, i % 2 ? 0x6a9a3a : 0x4a8a30, { x: px, y: py, z: pz, sx: 0.03, sy: 0.12 + 0.04 * (i % 2), sz: 0.02, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, ry: a });
          }
          still(B);
        }
        continue;
      }
      const col = shade(st, 0.92 + r(30 + k) * 0.25);
      const heave = r(40 + k) < 0.12;
      B.box(col, { x: px, y: py - 0.015 + (heave ? 0.012 : 0), z: pz, sx: 0.46 + (r(50 + k) - 0.5) * 0.03, sy: 0.035, sz: 0.46, ry: (r(70 + k) - 0.5) * 0.05, rx: heave ? 0.08 : 0, rz: heave ? -0.05 : 0 });
      if (r(80 + k) < 0.35) B.box(shade(st, 0.55), { x: px + (r(85 + k) - 0.5) * 0.2, y: py + 0.021, z: pz, sx: 0.012, sy: 0.004, sz: 0.3, ry: (r(88 + k) - 0.5) * 1.2 });
      if (r(90 + k) < (wild ? 0.4 : 0.25)) moss(B, px + (r(92 + k) - 0.5) * 0.25, py + 0.02, pz + (r(94 + k) - 0.5) * 0.25, 1, r(96 + k));
    }
    stoneShade(B, start, 0);
    // creepers across it; now and then a column drum or a carved slab
    if (r(100) < (wild ? 0.35 : 0.18)) creeper(B, x + 0.2 + r(101) * 0.6, 0, z + 0.2 + r(102) * 0.6, 0.55, r(103) * 6.28, r(104), c.gy);
    const crowded = nbCount((n) => n.wall || !n.walk) >= 3;
    if (!c.thin && !crowded && c.map?.type !== 'arena') {
      if (r(110) < 0.035) drum(B, x + 0.5, c.gy(x + 0.5, z + 0.5), z + 0.5, 1, r(111), r(112) < 0.6, shade(st, 1.05));
      else if (r(113) < 0.02) {
        // a carved glyph set in the floor, a ring round a sun
        const px = x + 0.5, pz = z + 0.5, py = c.gy(px, pz) + 0.022;
        B.shape(TPL.torus, shade(st, 0.7), { x: px, y: py, z: pz, sx: 0.5, sy: 0.5, sz: 0.1, rx: Math.PI / 2 });
        for (let i = 0; i < 8; i++) B.box(shade(st, 0.7), { x: px + Math.cos(i * 0.785) * 0.12, y: py, z: pz + Math.sin(i * 0.785) * 0.12, sx: 0.06, sy: 0.005, sz: 0.015, ry: -i * 0.785 });
      }
    }
  },
  templewall(c) {
    const { B, G, cx, cz, r, nb, torch } = c;
    const t = c.t;
    // (the solid mass of a temple's rock needs no dressing)
    if (!c.outside && ![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dz]) => !nb(dx, dz).wall)) return;
    const st = c.dark ? shade(t.side, 0.95) : shade(t.side, 1.04);
    const southOpen = nb(0, 1).walk && !nb(0, 1).wall;
    const fz = cz + 0.5 + 0.035;
    const y = c.g;
    if (torch && southOpen) sconce(c, fz);
    else if (southOpen && r(1) < 0.2) reliefFace(B, G, cx, y, fz, st, c.dark, r(2));
    else if (southOpen && r(3) < 0.18) frieze(B, cx, y + 0.3, fz, st);
    // a curtain of vines falling over the south face
    if (southOpen && r(5) < 0.4) {
      const top = y + t.h;
      const n = 3 + Math.floor(r(6) * 3);
      for (let i = 0; i < n; i++) {
        const vx = cx - 0.4 + r(10 + i) * 0.8, len = 0.18 + r(20 + i) * 0.45;
        swayDown(B, top, 0.6);
        B.box(0x2e5e24, { x: vx, y: top - len, z: fz + 0.03, sx: 0.016, sy: len + 0.02, sz: 0.012 });
        for (let k = 0; k < 3; k++) B.shape(TPL.cone4, k % 2 ? 0x4a8a30 : 0x3a7a2a, { x: vx + (k % 2 ? 0.02 : -0.02), y: top - len * (0.2 + k * 0.33), z: fz + 0.04, sx: 0.06, sy: 0.07, sz: 0.012, rz: k % 2 ? 2.3 : -2.3 });
        still(B);
      }
    }
    // moss spilling over the capstone; a fern or sapling rooted on top
    const top = y + t.h;
    if (r(30) < (c.dark ? 0.2 : 0.4)) {
      const mc = c.dark ? 0x2e4a24 : 0x4a7230;
      for (let i = 0; i < 2; i++) B.shape(TPL.cyl6, i ? shade(mc, 1.12) : mc, { x: cx + (r(31 + i) - 0.5) * 0.5, y: top - 0.005, z: cz + (r(33 + i) - 0.5) * 0.5, sx: 0.22 + r(35 + i) * 0.16, sy: 0.02, sz: 0.18 + r(37) * 0.12, ry: r(38 + i) * 3 });
    }
    if (r(36) < 0.25 && !c.dark) fern(B, cx + (r(37) - 0.5) * 0.4, top, cz + (r(38) - 0.5) * 0.4, 1, r(39));
    else if (r(36) < 0.12) fern(B, cx + (r(37) - 0.5) * 0.4, top, cz + (r(38) - 0.5) * 0.4, 0.9, r(39), 0x3a6a2a);
  },
  idol(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    const st = stoneOf(c, 0xaca48c);
    const start = B.col.length;
    // a squat plinth and a great stone head in a flat-topped helmet: hooded
    // eyes, a broad flat nose, heavy downturned lips — the old gods' watchers
    B.box(shade(st, 0.78), { x: cx, y: y - 0.02, z: cz, sx: 0.8, sy: 0.1, sz: 0.76 });
    B.box(shade(st, 0.88), { x: cx, y: y + 0.08, z: cz, sx: 0.64, sy: 0.1, sz: 0.62 });
    const hy = y + 0.18, fz = cz + 0.25;
    B.shape(TPL.ico1, st, { x: cx, y: hy + 0.34, z: cz, sx: 0.56, sy: 0.66, sz: 0.52 });
    // the helmet: a band and a flat crown
    B.shape(TPL.cyl12, shade(st, 1.06), { x: cx, y: hy + 0.5, z: cz - 0.01, sx: 0.6, sy: 0.18, sz: 0.56 });
    B.box(shade(st, 1.12), { x: cx, y: hy + 0.52, z: cz + 0.24, sx: 0.5, sy: 0.08, sz: 0.06 });
    for (let k = -2; k <= 2; k++) B.box(shade(st, 0.8), { x: cx + k * 0.09, y: hy + 0.545, z: cz + 0.275, sx: 0.04, sy: 0.04, sz: 0.01 });
    for (const s of [-1, 1]) {
      // brow ridge, the hooded eye and its slit
      B.shape(TPL.capsule, shade(st, 1.0), { x: cx + s * 0.12, y: hy + 0.43, z: fz - 0.01, sx: 0.15, sy: 0.05, sz: 0.06 });
      B.box(0x16120e, { x: cx + s * 0.12, y: hy + 0.38, z: fz - 0.0, sx: 0.12, sy: 0.03, sz: 0.012 });
      B.box(shade(st, 0.7), { x: cx + s * 0.12, y: hy + 0.36, z: fz - 0.005, sx: 0.12, sy: 0.015, sz: 0.012 });
      if (c.dark) G.box(0x6affb8, { x: cx + s * 0.12, y: hy + 0.38, z: fz + 0.008, sx: 0.07, sy: 0.02, sz: 0.004 });
      // ear-spools
      B.shape(TPL.cyl12, shade(st, 1.08), { x: cx + s * 0.29, y: hy + 0.3, z: cz + 0.04, sx: 0.12, sy: 0.04, sz: 0.12, rz: Math.PI / 2 });
    }
    B.shape(TPL.trap, shade(st, 1.08), { x: cx, y: hy + 0.22, z: fz - 0.01, sx: 0.18, sy: 0.14, sz: 0.09 });
    for (const s of [-1, 1]) B.box(0x2a241e, { x: cx + s * 0.05, y: hy + 0.225, z: fz + 0.035, sx: 0.035, sy: 0.02, sz: 0.01 });
    B.shape(TPL.capsule, shade(st, 0.95), { x: cx, y: hy + 0.14, z: fz - 0.01, sx: 0.26, sy: 0.06, sz: 0.08 });
    B.box(0x1e1a16, { x: cx, y: hy + 0.135, z: fz + 0.03, sx: 0.2, sy: 0.016, sz: 0.01 });
    stoneShade(B, start, 0.25);
    if (c.dark) c.light(cx, cz + 0.6, 1.8, 0x50e0a0, 0.45);
    // creepers and moss claiming it
    if (!c.dark || r(1) < 0.5) creeper(B, cx - 0.3, y + 0.08, cz + 0.3, 0.6, -0.3, r(2), null);
    B.shape(TPL.cyl6, 0x4a7230, { x: cx + 0.08, y: hy + 0.59, z: cz - 0.05, sx: 0.3, sy: 0.02, sz: 0.22, ry: r(5) });
    if (r(3) < 0.5) fern(B, cx + 0.3, y + 0.08, cz + 0.28, 0.8, r(4));
  },
  lilypool(c) {
    const { B, W, G, cx, cz, r, nb } = c;
    const y = POOL_Y;
    // a stone kerb where the basin meets the floor
    const st = stoneOf(c, 0xa8a088);
    const start = B.col.length;
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const n = nb(dx, dz);
      if (n.water || n.wall) continue;
      B.box(shade(st, 0.95 + r(dx * 3 + dz + 5) * 0.15), { x: cx + dx * 0.45, y: -0.32, z: cz + dz * 0.45, sx: dx ? 0.12 : 1.02, sy: 0.37, sz: dz ? 0.12 : 1.02 });
    }
    stoneShade(B, start, 0.5);
    // lily pads, each with its notch, and a lotus or two in flower
    for (let i = 0; i < 5; i++) {
      if (r(10 + i) < 0.25) continue;
      const px = cx + (r(20 + i) - 0.5) * 0.7, pz = cz + (r(30 + i) - 0.5) * 0.7, s = 0.09 + r(40 + i) * 0.06;
      W.shape(TPL.cyl8, i % 2 ? 0x3a7a34 : 0x4a8a3a, { x: px, y: y + 0.004, z: pz, sx: s * 2, sy: 0.004, sz: s * 2, ry: r(50 + i) * 6 });
      W.shape(TPL.cone4, 0x1e4a40, { x: px + s * 0.6, y: y + 0.005, z: pz, sx: s * 0.9, sy: 0.003, sz: s * 0.25, rz: Math.PI / 2, ry: r(50 + i) * 6 });
    }
    for (let i = 0; i < (r(60) < 0.6 ? 1 : 2); i++) {
      const px = cx + (r(61 + i) - 0.5) * 0.5, pz = cz + (r(63 + i) - 0.5) * 0.5;
      W.shape(TPL.cyl8, 0x4a8a3a, { x: px, y: y + 0.004, z: pz, sx: 0.22, sy: 0.004, sz: 0.22 });
      for (let k = 0; k < 6; k++) {
        const a = k * 1.047 + r(65) * 2;
        B.shape(TPL.cone4, k % 2 ? 0xf8c8d8 : 0xf0a0bc, { x: px + Math.cos(a) * 0.025, y: y + 0.005, z: pz + Math.sin(a) * 0.025, sx: 0.04, sy: 0.08, sz: 0.025, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6, ry: -a });
      }
      B.shape(TPL.blob, 0xf8e070, { x: px, y: y + 0.03, z: pz, s: 0.03 });
    }
    // in the dark, a few jade motes drifting over the water
    if (c.dark && r(70) < 0.6) {
      for (let i = 0; i < 3; i++) G.shape(TPL.sphereLo, 0x7affc8, { x: cx + (r(71 + i) - 0.5) * 0.6, y: y + 0.12 + r(74 + i) * 0.2, z: cz + (r(77 + i) - 0.5) * 0.6, s: 0.025 });
      c.light(cx, cz, 1.6, 0x40d0a0, 0.4);
    }
  },
  obsidian(c) {
    const { B, G, cx, cz, r } = c;
    // black volcanic glass: sharp shards and flat plates catching the light
    // in sheens of violet and green
    const shard = (px, pz, h, w, k) => {
      const start = B.col.length;
      const py = c.gy(px, pz);
      B.shape(TPL.cone4, 0x1e1a24, { x: px, y: py - 0.03, z: pz, sx: w, sy: h, sz: w * 0.7, ry: r(k) * 3, rz: (r(k + 1) - 0.5) * 0.4, rx: (r(k + 2) - 0.5) * 0.3, flat: true });
      const N = B.nor, C = B.col;
      for (let i = start; i < C.length; i += 3) {
        const gl = Math.max(0, N[i + 2] * 0.6 + N[i + 1] * 0.5 - N[i] * 0.3);
        C[i] += gl * 0.16; C[i + 1] += gl * 0.12; C[i + 2] += gl * 0.26;
      }
    };
    if (r(1) < 0.55) shard(cx + (r(2) - 0.5) * 0.5, cz + (r(3) - 0.5) * 0.4, 0.22 + r(4) * 0.3, 0.12 + r(5) * 0.06, 6);
    if (r(9) < 0.4) shard(cx + (r(10) - 0.5) * 0.6, cz + (r(11) - 0.5) * 0.6, 0.12 + r(12) * 0.14, 0.08, 13);
    if (r(16) < 0.5) {
      const px = cx + (r(17) - 0.5) * 0.5, pz = cz + (r(18) - 0.5) * 0.5;
      B.shape(TPL.cyl6, 0x2a2434, { x: px, y: c.gy(px, pz) - 0.01, z: pz, sx: 0.3, sy: 0.02, sz: 0.22, ry: r(19) * 3 });
    }
    if (r(20) < 0.1) {
      // a vent glowing in a crack
      const px = cx + (r(21) - 0.5) * 0.4, pz = cz + (r(22) - 0.5) * 0.4;
      G.box(0xff6a20, { x: px, y: c.gy(px, pz) + 0.006, z: pz, sx: 0.22, sy: 0.01, sz: 0.02, ry: r(23) * 3 });
      c.light(px, pz, 1.2, 0xff6020, 0.5);
    }
  },
  // A stepped pyramid in a clearing of the jungle: tiers greened with moss,
  // a steep stair up the front, a shrine on top between burning braziers.
  templesite(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.g;
    const st = 0xb0a68a;
    const start = B.col.length;
    B.shape(TPL.cyl12, 0x8a8468, { x: cx, y: y - 0.03, z: cz, sx: 0.98, sy: 0.05, sz: 0.94 });
    const tiers = [[0.74, 0.1], [0.6, 0.09], [0.46, 0.09], [0.33, 0.08]];
    let h = y;
    tiers.forEach(([w, th], i) => {
      B.box(shade(st, 0.92 + i * 0.04), { x: cx, y: h, z: cz - 0.06, sx: w, sy: th, sz: w * 0.92 });
      // moss along each terrace
      B.box(0x5a8a36, { x: cx + (r(i) - 0.5) * 0.1, y: h + th - 0.004, z: cz - 0.06 + w * 0.44, sx: w * (0.5 + r(i + 4) * 0.4), sy: 0.012, sz: 0.04 });
      h += th;
    });
    // the stair
    for (let i = 0; i < 7; i++) B.box(shade(st, 1.08 - i * 0.02), { x: cx, y: y + i * 0.052, z: cz + 0.36 - i * 0.05, sx: 0.16, sy: 0.052, sz: 0.06 });
    for (const s of [-1, 1]) B.shape(TPL.wedge, shade(st, 0.85), { x: cx + s * 0.1, y, z: cz + 0.2, sx: 0.04, sy: 0.36, sz: 0.36, ry: Math.PI });
    // the shrine and its roof-comb
    B.box(shade(st, 1.05), { x: cx, y: h, z: cz - 0.08, sx: 0.24, sy: 0.14, sz: 0.2 });
    B.box(shade(st, 1.12), { x: cx, y: h + 0.14, z: cz - 0.08, sx: 0.28, sy: 0.04, sz: 0.24 });
    B.box(shade(st, 1.0), { x: cx, y: h + 0.18, z: cz - 0.12, sx: 0.18, sy: 0.12, sz: 0.04 });
    B.box(0x1a1410, { x: cx, y: h, z: cz + 0.021, sx: 0.08, sy: 0.1, sz: 0.01 });
    stoneShade(B, start, 0.5);
    G.box(0x60ffb0, { x: cx, y: h + 0.02, z: cz + 0.025, sx: 0.05, sy: 0.05, sz: 0.004 });
    for (const s of [-1, 1]) {
      B.shape(TPL.cyl6, 0x3a3028, { x: cx + s * 0.15, y: h, z: cz + 0.06, sx: 0.035, sy: 0.07, sz: 0.035 });
      G.shape(TPL.cone5, 0xff8a20, { x: cx + s * 0.15, y: h + 0.07, z: cz + 0.06, sx: 0.06, sy: 0.1, sz: 0.06 });
      G.shape(TPL.cone5, 0xffd060, { x: cx + s * 0.15, y: h + 0.07, z: cz + 0.065, sx: 0.03, sy: 0.07, sz: 0.03 });
    }
    c.light(cx, cz + 0.4, 2.2, 0xffa048, 0.8);
    // the jungle crowding in at the back corners, a palm at the side
    rainTree(B, cx - 0.42, y, cz - 0.4, 0.62, r(10), { vines: 0 });
    rainTree(B, cx + 0.44, y, cz - 0.36, 0.55, r(11), { vines: 0 });
    palm(B, cx + 0.42, y, cz + 0.3, 0.55, r(12), -0.6);
    fern(B, cx - 0.38, y, cz + 0.32, 0.8, r(13));
  },
};

// Battle obstacles: a lone square of temple wall stands in the fight as a
// broken carved pillar, a stele or a toppled idol's head, wound with vines.
export const ISLE_ARENA_PROPS = {
  temple_wall(c) {
    const { B, G, cx, cz, r } = c;
    const y = c.gy(cx, cz);
    const st = c.dark ? 0xa69c84 : 0xb0a68e;
    const k = r(1);
    const start = B.col.length;
    if (k < 0.45) {
      // a square pillar banded with glyphs, its top broken away
      const h = 0.75 + r(2) * 0.5;
      B.box(shade(st, 0.8), { x: cx, y: y - 0.03, z: cz, sx: 0.72, sy: 0.14, sz: 0.72 });
      B.box(st, { x: cx, y: y + 0.1, z: cz, sx: 0.5, sy: h, sz: 0.5 });
      for (const band of [0.3, 0.3 + h * 0.5]) B.box(shade(st, 1.1), { x: cx, y: y + band, z: cz, sx: 0.54, sy: 0.08, sz: 0.54 });
      for (let i = -1; i <= 1; i++) B.box(shade(st, 0.7), { x: cx + i * 0.14, y: y + 0.5, z: cz + 0.252, sx: 0.08, sy: 0.08, sz: 0.01 });
      B.shape(TPL.cone4, shade(st, 0.95), { x: cx, y: y + 0.1 + h, z: cz, sx: 0.5, sy: 0.16, sz: 0.5, ry: Math.PI / 4, rz: 0.3 });
    } else if (k < 0.75) {
      // a carved stele: a tall slab with a figure in relief
      B.box(shade(st, 0.8), { x: cx, y: y - 0.03, z: cz, sx: 0.66, sy: 0.12, sz: 0.4 });
      B.box(st, { x: cx, y: y + 0.08, z: cz, sx: 0.5, sy: 1.15, sz: 0.2 });
      B.shape(TPL.cyl12, st, { x: cx, y: y + 1.12, z: cz, sx: 0.5, sy: 0.2, sz: 0.25, rx: Math.PI / 2 });
      B.box(shade(st, 0.72), { x: cx, y: y + 0.3, z: cz + 0.1, sx: 0.36, sy: 0.72, sz: 0.01 });
      B.shape(TPL.ball, shade(st, 1.08), { x: cx, y: y + 0.86, z: cz + 0.11, sx: 0.16, sy: 0.18, sz: 0.06 });
      B.box(shade(st, 1.08), { x: cx, y: y + 0.42, z: cz + 0.11, sx: 0.16, sy: 0.34, sz: 0.04 });
      for (const s of [-1, 1]) B.box(shade(st, 1.08), { x: cx + s * 0.11, y: y + 0.62, z: cz + 0.11, sx: 0.05, sy: 0.18, sz: 0.04, rz: s * 0.5 });
    } else {
      // a toppled idol's head, half sunk, staring at the sky
      B.shape(TPL.ball, st, { x: cx, y: y + 0.22, z: cz, sx: 0.66, sy: 0.6, sz: 0.62, rx: -0.9 });
      B.shape(TPL.hemi, shade(st, 1.08), { x: cx, y: y + 0.2, z: cz - 0.16, sx: 0.7, sy: 0.3, sz: 0.62, rx: -2.2 });
      for (const s of [-1, 1]) B.box(0x1c1814, { x: cx + s * 0.12, y: y + 0.45, z: cz + 0.16, sx: 0.1, sy: 0.02, sz: 0.06, rx: -0.9 });
      B.shape(TPL.trap, shade(st, 1.05), { x: cx, y: y + 0.44, z: cz + 0.24, sx: 0.16, sy: 0.1, sz: 0.1, rx: -0.9 });
      if (c.dark) for (const s of [-1, 1]) G.box(0x6affb8, { x: cx + s * 0.12, y: y + 0.46, z: cz + 0.17, sx: 0.06, sy: 0.012, sz: 0.04, rx: -0.9 });
    }
    stoneShade(B, start, 0.8);
    creeper(B, cx - 0.32, y, cz + 0.32, 0.6, -0.5, r(5), c.gy);
    if (r(6) < 0.6) fern(B, cx + 0.3, y, cz + 0.3, 0.9, r(7));
  },
};
