// Settlement decorations: streets, gardens, town walls and gates, street
// furniture (lamps, stalls, wells, carts, hay) and the furniture inside
// buildings, made to read well from the 52-degree street camera.
// Builders receive the same context as every DECOR builder (see decor.js).
// Furniture turns its back to the nearest wall.
import * as THREE from 'three';
import { TPL, shade } from './builder.js';
import { hash2 } from '../core/rng.js';

const closed = (t) => !!t && (t.wall || t.door);
const _M = new THREE.Matrix4();

// which way the nearest wall lies (north first: furniture likes to face the camera)
function backTo(c) {
  for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) if (closed(c.nb(dx, dz))) return [dx, dz];
  return [0, -1];
}
const angleFor = ([dx, dz]) => Math.atan2(-dx, -dz);

// a placing function in a frame turned by `a` about the tile centre
function frame(c, a, y = c.y, B = c.B) {
  const M = new THREE.Matrix4().makeRotationY(a).setPosition(c.cx, y, c.cz);
  return (tpl, color, o = {}) => B.shape(tpl, color, { ...o, matrix: M });
}

function sway(B, y0, k) { if (B.aux) B.auxAt = (px, py) => Math.max(0, py - y0) * k; }
function still(B) { if (B.aux) B.auxAt = null; }

// the keeper whose shop this furniture is in (cached per map)
const roleCache = new WeakMap();
function shopRoleNear(map, x, y) {
  if (!map?.entities) return null;
  let m = roleCache.get(map);
  if (!m) { m = new Map(); roleCache.set(map, m); }
  const k = y * 4096 + x;
  if (m.has(k)) return m.get(k);
  let best = null, bd = 6;
  for (const e of map.entities) {
    if (e.type !== 'npc' || !e.shop && !['healer', 'inn', 'tavern', 'lord', 'sage'].includes(e.role)) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d < bd) { bd = d; best = e.role; }
  }
  m.set(k, best);
  return best;
}

const WOOD = 0x7a4a26, WOOD_D = 0x5a3418, WOOD_L = 0xa8784a, IRON = 0x34302e, GOLD = 0xe0b84a;

// ---------------------------------------------------------------- goods
function goods(put, role, r, x, z, y) {
  switch (role) {
    case 'weapons': case 'bowyer':
      put(TPL.box, 0xd0d4dc, { x: x - 0.05, y: y + 0.01, z, sx: 0.36, sy: 0.02, sz: 0.04, ry: 0.3 });
      put(TPL.box, GOLD, { x: x + 0.12, y: y + 0.01, z: z + 0.05, sx: 0.03, sy: 0.03, sz: 0.12, ry: 0.3 });
      put(TPL.box, 0x6a3a1a, { x: x + 0.18, y: y + 0.01, z: z + 0.07, sx: 0.08, sy: 0.03, sz: 0.03, ry: 0.3 });
      if (r > 0.5) put(TPL.hemi, 0xb8bcc4, { x: x + 0.2, y, z: z - 0.08, sx: 0.16, sy: 0.12, sz: 0.16 });
      break;
    case 'armor':
      put(TPL.hemi, 0xb0b4bc, { x: x - 0.12, y, z, sx: 0.18, sy: 0.15, sz: 0.18 });
      put(TPL.box, 0x2a2a2a, { x: x - 0.12, y: y + 0.04, z: z + 0.085, sx: 0.12, sy: 0.02, sz: 0.01 });
      put(TPL.ball, 0x3a6ab8, { x: x + 0.15, y: y + 0.03, z, sx: 0.24, sy: 0.05, sz: 0.28 });
      put(TPL.ball, GOLD, { x: x + 0.15, y: y + 0.06, z, sx: 0.06, sy: 0.03, sz: 0.06 });
      break;
    case 'reagents': case 'healer':
      for (let i = 0; i < 4; i++) {
        const px = x - 0.2 + i * 0.13, c = [0xc040e0, 0x40c070, 0xe04040, 0x4080e0][(i + Math.floor(r * 4)) % 4];
        put(TPL.ball, c, { x: px, y: y + 0.05, z: z + (i % 2) * 0.06, s: 0.09 });
        put(TPL.cyl6, 0xd8e0e0, { x: px, y: y + 0.09, z: z + (i % 2) * 0.06, sx: 0.03, sy: 0.05, sz: 0.03 });
      }
      put(TPL.blob, 0x5a8a3a, { x: x + 0.24, y: y + 0.03, z: z - 0.08, sx: 0.12, sy: 0.06, sz: 0.08 });
      break;
    case 'provisions': case 'merchant':
      put(TPL.ball, 0xd89a48, { x: x - 0.15, y: y + 0.04, z, sx: 0.2, sy: 0.1, sz: 0.11 });
      put(TPL.cyl12, 0xe8c050, { x: x + 0.08, y, z: z + 0.02, sx: 0.18, sy: 0.08, sz: 0.18 });
      for (let i = 0; i < 3; i++) put(TPL.ball, i % 2 ? 0xd83a2a : 0x8ac03a, { x: x + 0.24 + (i - 1) * 0.05, y: y + 0.035, z: z - 0.08 + (i % 2) * 0.05, s: 0.065 });
      break;
    case 'inn': case 'tavern':
      tankard(put, x - 0.1, y, z);
      tankard(put, x + 0.12, y, z + 0.05);
      break;
    default:
      put(TPL.cyl8, 0xc8a878, { x: x - 0.1, y, z, sx: 0.12, sy: 0.14, sz: 0.12 });
      put(TPL.cyl8, 0x8a5a2a, { x: x - 0.1, y: y + 0.14, z, sx: 0.13, sy: 0.03, sz: 0.13 });
      put(TPL.box, 0x6a7ab0, { x: x + 0.14, y, z, sx: 0.16, sy: 0.08, sz: 0.12, ry: r });
  }
}
function tankard(put, x, y, z) {
  put(TPL.cyl8, 0xa8a090, { x, y, z, sx: 0.07, sy: 0.09, sz: 0.07 });
  put(TPL.ball, 0xfaf4e0, { x, y: y + 0.09, z, sx: 0.075, sy: 0.04, sz: 0.075 });
  put(TPL.box, 0xa8a090, { x: x + 0.045, y: y + 0.02, z, sx: 0.02, sy: 0.05, sz: 0.02 });
}
function candle(put, glow, x, y, z, h = 0.1) {
  put(TPL.cyl6, 0xf4f0e0, { x, y, z, sx: 0.035, sy: h, sz: 0.035 });
  glow(TPL.cone4, 0xffd060, { x, y: y + h, z, sx: 0.03, sy: 0.06, sz: 0.03 });
  glow(TPL.ball, 0xffa030, { x, y: y + h + 0.015, z, s: 0.025 });
}

// ---------------------------------------------------------------- builders
export const TOWN_DECOR = {
  // --- streets and ground ---
  cobble(c) {
    const { B, x, z, y, r } = c;
    // rounded setts in staggered rows of uneven size: each a pillow of four
    // triangles, lighter in the middle, so the street reads as cobbles
    const rows = r(1) < 0.5 ? 3 : 4;
    for (let row = 0; row < rows; row++) {
      const n = 2 + Math.floor(r(2 + row) * 2.2);
      const off = r(6 + row) * 0.6 / n;
      const v0 = row / rows + 0.02 + (row ? (r(30 + row) - 0.5) * 0.04 : 0), v1 = (row + 1) / rows - 0.02;
      for (let i = -1; i < n; i++) {
        let u0 = (i + off) / n + 0.018, u1 = (i + 1 + off) / n - 0.018;
        if (u1 <= 0.01 || u0 >= 0.99) continue;
        u0 = Math.max(0.02, u0); u1 = Math.min(0.98, u1);
        if (u1 - u0 < 0.07) continue;
        const k = r(row * 5 + i + 10);
        const base = [0x9a948a, 0xa49c90, 0x8e887e, 0xa8a094, 0x968a7c, 0xa09484][Math.floor(k * 6)];
        const lo = rgb(shade(base, 0.8)), hi = rgb(shade(base, 1.1 + k * 0.1));
        const h0 = y + 0.006, h1 = y + 0.026 + k * 0.008;
        const a = [x + u0, h0, z + v1], b = [x + u1, h0, z + v1], cc = [x + u1, h0, z + v0], d = [x + u0, h0, z + v0];
        const m = [x + (u0 + u1) / 2 + (r(50 + i) - 0.5) * 0.03, h1, z + (v0 + v1) / 2];
        B.triC(a, b, m, lo, lo, hi);
        B.triC(b, cc, m, lo, lo, hi);
        B.triC(cc, d, m, lo, lo, hi);
        B.triC(d, a, m, lo, lo, hi);
      }
    }
  },
  planks(c) {
    const { B, x, z, y, r } = c;
    // boards with dark seams, staggered ends and the odd knot
    for (let i = 0; i < 4; i++) {
      const px = x + 0.125 + i * 0.25;
      const k = r(i + 3);
      B.box(shade(0x9b6a3c, 0.92 + k * 0.18), { x: px, y: y - 0.004, z: z + 0.5, sx: 0.235, sy: 0.008, sz: 1.0 });
      const seam = 0.2 + r(i + 9) * 0.6;
      B.box(0x5a3a20, { x: px, y: y + 0.003, z: z + seam, sx: 0.235, sy: 0.004, sz: 0.014 });
      if (k > 0.75) B.box(0x6a4426, { x: px + 0.04, y: y + 0.003, z: z + r(i + 20), sx: 0.035, sy: 0.004, sz: 0.025 });
    }
    for (let i = 1; i < 4; i++) B.box(0x4a2e18, { x: x + i * 0.25, y: y + 0.002, z: z + 0.5, sx: 0.012, sy: 0.004, sz: 1.0 });
  },
  flags(c) {
    const { B, x, z, y, r, t } = c;
    // flagstones of mixed sizes
    const cells = r(1) < 0.5 ? [[0, 0, 0.55, 0.5], [0.55, 0, 0.45, 0.5], [0, 0.5, 0.4, 0.5], [0.4, 0.5, 0.6, 0.5]] : [[0, 0, 0.45, 0.6], [0.45, 0, 0.55, 0.6], [0, 0.6, 0.6, 0.4], [0.6, 0.6, 0.4, 0.4]];
    cells.forEach(([u, v, w, d], i) => {
      const col = shade(t.top, 0.92 + r(10 + i) * 0.2);
      B.box(col, { x: x + u + w / 2, y: y - 0.008, z: z + v + d / 2, sx: w - 0.03, sy: 0.014, sz: d - 0.03 });
    });
  },
  carpet(c) {
    const { B, cx, cz, y, nb } = c;
    const gold = 0xd8b048, deep = 0x6a1420, mid = 0xa82a36;
    const same = (dx, dz) => nb(dx, dz).key === 'carpet';
    // border, a patterned field, tassels at the open ends
    B.box(mid, { x: cx, y: y - 0.001, z: cz, sx: 1, sy: 0.012, sz: 1 });
    const edges = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dz] of edges) {
      if (same(dx, dz)) continue;
      const o = dx ? { x: cx + dx * 0.4, z: cz, sx: 0.16, sz: 1 } : { x: cx, z: cz + dz * 0.4, sx: 1, sz: 0.16 };
      B.box(deep, { ...o, y: y + 0.004, sy: 0.012 });
      const g = dx ? { x: cx + dx * 0.31, z: cz, sx: 0.03, sz: 1 } : { x: cx, z: cz + dz * 0.31, sx: 1, sz: 0.03 };
      B.box(gold, { ...g, y: y + 0.006, sy: 0.012 });
      // tassels where the runner ends
      if ((dz && !same(1, 0) && !same(-1, 0)) || (dx && !same(0, 1) && !same(0, -1))) {
        for (let i = 0; i < 6; i++) {
          const s = -0.42 + i * 0.168;
          B.box(gold, dx ? { x: cx + dx * 0.53, y: y + 0.002, z: cz + s, sx: 0.07, sy: 0.008, sz: 0.025 } : { x: cx + s, y: y + 0.002, z: cz + dz * 0.53, sx: 0.025, sy: 0.008, sz: 0.07 });
        }
      }
    }
    B.box(gold, { x: cx, y: y + 0.006, z: cz, sx: 0.26, sy: 0.012, sz: 0.26, ry: Math.PI / 4 });
    B.box(deep, { x: cx, y: y + 0.009, z: cz, sx: 0.15, sy: 0.012, sz: 0.15, ry: Math.PI / 4 });
  },
  garden(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    // a bed of dark soil edged with stones, full of flowers or vegetables
    B.box(0x4a3424, { x: cx, y: y - 0.01, z: cz, sx: 0.84, sy: 0.04, sz: 0.84 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = cx + Math.cos(a) * 0.42 * (Math.abs(Math.cos(a)) > 0.7 ? 1 : 1.12), pz = cz + Math.sin(a) * 0.42;
      B.shape(TPL.blob, 0x9a948a, { x: px, y: y + 0.02, z: pz, sx: 0.14, sy: 0.07, sz: 0.12 });
    }
    sway(B, y, 1.2);
    if (r(1) < 0.55) {
      const sets = [[0xf05a6a, 0xf8e070], [0xa070f0, 0xf4f0ff], [0xf0a030, 0xf05030], [0xff8ab0, 0xffffff]];
      const cols = sets[Math.floor(r(2) * sets.length)];
      for (let i = 0; i < 9; i++) {
        const px = cx - 0.26 + (i % 3) * 0.26 + (r(10 + i) - 0.5) * 0.08, pz = cz - 0.26 + Math.floor(i / 3) * 0.26 + (r(20 + i) - 0.5) * 0.08;
        B.shape(TPL.blob, 0x4a8a30, { x: px, y: y + 0.07, z: pz, sx: 0.17, sy: 0.12, sz: 0.17 });
        B.shape(TPL.blob, cols[i % 2], { x: px, y: y + 0.15, z: pz, s: 0.08 });
        B.shape(TPL.blob, cols[(i + 1) % 2], { x: px + 0.05, y: y + 0.13, z: pz + 0.04, s: 0.06 });
      }
    } else {
      // cabbages and leeks
      for (let i = 0; i < 6; i++) {
        const px = cx - 0.24 + (i % 3) * 0.24, pz = cz - 0.16 + Math.floor(i / 3) * 0.32;
        if (r(3) < 0.5) B.shape(TPL.ico1, 0x7ab04a, { x: px, y: y + 0.08, z: pz, sx: 0.17, sy: 0.14, sz: 0.17 });
        else for (let k = 0; k < 3; k++) B.shape(TPL.cone4, 0x5a9a3a, { x: px + (k - 1) * 0.04, y: y + 0.02, z: pz, sx: 0.04, sy: 0.22, sz: 0.04, rz: (k - 1) * 0.25 });
      }
    }
    still(B);
  },
  crops(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    const wheat = r(1) < 0.6;
    // furrows, and rows of golden wheat or green beans
    for (let row = 0; row < 3; row++) {
      const pz = cz - 0.33 + row * 0.33;
      B.box(0x5a3e22, { x: cx, y: y - 0.01, z: pz, sx: 1.0, sy: 0.05, sz: 0.2 });
      sway(B, y, wheat ? 1.6 : 0.8);
      for (let i = 0; i < 5; i++) {
        const px = cx - 0.4 + i * 0.2 + (r(10 + row * 5 + i) - 0.5) * 0.05;
        if (wheat) {
          const h = 0.3 + r(30 + row * 5 + i) * 0.08;
          B.shape(TPL.cone4, 0xc8a840, { x: px, y: y + 0.02, z: pz, sx: 0.09, sy: h, sz: 0.07, ry: i });
          B.shape(TPL.capsule, 0xe8c858, { x: px, y: y + h * 0.75, z: pz, sx: 0.06, sy: 0.12, sz: 0.06 });
        } else {
          B.shape(TPL.ico1, shade(0x5a9a3a, 0.9 + r(40 + i) * 0.2), { x: px, y: y + 0.1, z: pz, sx: 0.16, sy: 0.18, sz: 0.14 });
        }
      }
      still(B);
    }
  },
  fence(c) {
    const { B, cx, cz, y, nb } = c;
    const wood = 0x8a6a42, dark = 0x6a4a2a;
    const join = (t) => t && (t.wall || t.door || t.key === 'fence' || t.key === 'palisade');
    B.box(dark, { x: cx, y, z: cz, sx: 0.08, sy: 0.42, sz: 0.08 });
    B.shape(TPL.cone4, dark, { x: cx, y: y + 0.42, z: cz, sx: 0.1, sy: 0.06, sz: 0.1, ry: Math.PI / 4 });
    let any = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!join(nb(dx, dz))) continue;
      any = true;
      const o = dx ? { x: cx + dx * 0.25, z: cz, sx: 0.5, sz: 0.035 } : { x: cx, z: cz + dz * 0.25, sx: 0.035, sz: 0.5 };
      B.box(wood, { ...o, y: y + 0.12, sy: 0.05 });
      B.box(wood, { ...o, y: y + 0.28, sy: 0.05 });
      // pickets
      for (const s of [0.12, 0.3]) {
        const p = dx ? { x: cx + dx * s, z: cz } : { x: cx, z: cz + dz * s };
        B.box(shade(wood, 1.1), { ...p, y, sx: dx ? 0.05 : 0.03, sy: 0.36, sz: dx ? 0.03 : 0.05 });
      }
    }
    if (!any) B.box(wood, { x: cx, y: y + 0.2, z: cz, sx: 0.9, sy: 0.05, sz: 0.035 });
  },
  palisade(c) {
    const { B, cx, cz, y, r, nb } = c;
    // a row of sharpened logs lashed together, with a walkway behind
    const alongX = nb(1, 0).key === 'palisade' || nb(-1, 0).key === 'palisade' || !(nb(0, 1).key === 'palisade' || nb(0, -1).key === 'palisade');
    for (let i = 0; i < 4; i++) {
      const s = -0.375 + i * 0.25;
      const px = cx + (alongX ? s : 0), pz = cz + (alongX ? 0 : s);
      const hh = 0.82 + r(10 + i) * 0.14;
      B.shape(TPL.cyl8, i % 2 ? 0x7a5a36 : 0x6a4a2a, { x: px, y: y - 0.02, z: pz, sx: 0.25, sy: hh, sz: 0.25, grad: 0.35 });
      B.shape(TPL.cone8, 0x9a7a52, { x: px, y: y + hh - 0.02, z: pz, sx: 0.25, sy: 0.2, sz: 0.25 });
    }
    for (const hy of [0.25, 0.6]) B.box(0x4a3420, alongX ? { x: cx, y: y + hy, z: cz + 0.13, sx: 1.0, sy: 0.05, sz: 0.03 } : { x: cx + 0.13, y: y + hy, z: cz, sx: 0.03, sy: 0.05, sz: 1.0 });
  },
  stonewall(c) { townWall(c); },
  timberwall(c) { timber(c, false); },
  window(c) { timber(c, true); },
  door(c) { doorDeco(c, false); },
  lockeddoor(c) { doorDeco(c, true); },

  // --- in the plaza ---
  fountain(c) {
    const { B, W, G, cx, cz, y } = c;
    const st = 0xc8c0b0;
    // an eight-sided basin with a rim, a column and an upper bowl spilling over
    B.shape(TPL.cyl8, shade(st, 0.85), { x: cx, y: y - 0.02, z: cz, sx: 1.04, sy: 0.08, sz: 1.04, ry: Math.PI / 8 });
    B.shape(TPL.cyl8, st, { x: cx, y: y + 0.04, z: cz, sx: 0.98, sy: 0.24, sz: 0.98, ry: Math.PI / 8, grad: 0.2 });
    B.shape(TPL.cyl8, shade(st, 1.12), { x: cx, y: y + 0.27, z: cz, sx: 1.02, sy: 0.04, sz: 1.02, ry: Math.PI / 8 });
    W.shape(TPL.cyl8, 0x3a90c0, { x: cx, y: y + 0.06, z: cz, sx: 0.86, sy: 0.17, sz: 0.86, ry: Math.PI / 8 });
    B.shape(TPL.taper8, st, { x: cx, y: y + 0.2, z: cz, sx: 0.16, sy: 0.4, sz: 0.16 });
    B.shape(TPL.hemi, shade(st, 1.05), { x: cx, y: y + 0.66, z: cz, sx: 0.44, sy: -0.14, sz: 0.44 });
    B.shape(TPL.cyl8, shade(st, 1.08), { x: cx, y: y + 0.58, z: cz, sx: 0.46, sy: 0.05, sz: 0.46 });
    W.shape(TPL.cyl8, 0x5ab0d8, { x: cx, y: y + 0.59, z: cz, sx: 0.38, sy: 0.04, sz: 0.38 });
    B.shape(TPL.ball, shade(st, 1.1), { x: cx, y: y + 0.7, z: cz, s: 0.1 });
    // the spray and streams falling into the basin
    G.shape(TPL.cone6, 0xbfe8ff, { x: cx, y: y + 0.66, z: cz, sx: 0.06, sy: 0.2, sz: 0.06 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      G.box(0x9ad8f8, { x: cx + Math.cos(a) * 0.23, y: y + 0.3, z: cz + Math.sin(a) * 0.23, sx: 0.03, sy: 0.3, sz: 0.03 });
    }
  },
  statue(c) {
    const { B, cx, cz, y } = c;
    const st = 0xcfc8b8;
    // a hero on a stepped plinth, sword raised
    B.box(shade(st, 0.8), { x: cx, y, z: cz, sx: 0.72, sy: 0.12, sz: 0.72 });
    B.box(shade(st, 0.9), { x: cx, y: y + 0.12, z: cz, sx: 0.54, sy: 0.3, sz: 0.54 });
    B.box(shade(st, 1.0), { x: cx, y: y + 0.42, z: cz, sx: 0.6, sy: 0.05, sz: 0.6 });
    B.box(GOLD, { x: cx, y: y + 0.2, z: cz + 0.275, sx: 0.3, sy: 0.08, sz: 0.01 });
    const s = y + 0.47;
    B.shape(TPL.taper6, st, { x: cx, y: s, z: cz, sx: 0.26, sy: 0.36, sz: 0.2 });
    B.shape(TPL.taper6, st, { x: cx, y: s + 0.36, z: cz, sx: 0.22, sy: -0.2, sz: 0.18 });
    B.box(st, { x: cx, y: s + 0.36, z: cz, sx: 0.3, sy: 0.18, sz: 0.18 });
    B.shape(TPL.ball, st, { x: cx, y: s + 0.62, z: cz, s: 0.15 });
    B.box(st, { x: cx + 0.17, y: s + 0.42, z: cz, sx: 0.06, sy: 0.24, sz: 0.06, rz: -0.25 });
    B.box(shade(st, 1.08), { x: cx + 0.24, y: s + 0.62, z: cz, sx: 0.04, sy: 0.42, sz: 0.02 });
    B.box(st, { x: cx - 0.16, y: s + 0.25, z: cz + 0.05, sx: 0.06, sy: 0.24, sz: 0.06, rz: 0.2 });
    B.shape(TPL.ball, shade(st, 0.95), { x: cx - 0.2, y: s + 0.24, z: cz + 0.08, sx: 0.04, sy: 0.22, sz: 0.2 });
  },
  well(c) {
    const { B, cx, cz, y } = c;
    const st = 0xa8a096;
    // round stone well under a little shingled roof, bucket on its rope
    B.shape(TPL.cyl12, st, { x: cx, y: y - 0.02, z: cz, sx: 0.66, sy: 0.34, sz: 0.66, grad: 0.25 });
    B.shape(TPL.cyl12, shade(st, 1.15), { x: cx, y: y + 0.32, z: cz, sx: 0.7, sy: 0.05, sz: 0.7 });
    B.shape(TPL.cyl12, 0x18303a, { x: cx, y: y + 0.33, z: cz, sx: 0.5, sy: 0.03, sz: 0.5 });
    for (const s of [-1, 1]) B.box(WOOD_D, { x: cx + s * 0.3, y: y + 0.3, z: cz, sx: 0.06, sy: 0.62, sz: 0.06 });
    B.shape(TPL.cyl6, WOOD, { x: cx, y: y + 0.76, z: cz, sx: 0.06, sy: 0.6, sz: 0.06, rz: Math.PI / 2 });
    B.shape(TPL.prism, 0x8a4a2a, { x: cx, y: y + 0.88, z: cz, sx: 0.84, sy: 0.3, sz: 0.62, grad: 0.3 });
    B.box(0x6a6058, { x: cx + 0.05, y: y + 0.44, z: cz, sx: 0.01, sy: 0.32, sz: 0.01 });
    B.shape(TPL.taper8, 0x7a5a36, { x: cx + 0.05, y: y + 0.36, z: cz, sx: 0.13, sy: -0.12, sz: 0.13 });
  },
  stall(c) {
    const { B, cx, cz, y, r } = c;
    // a market stall: striped awning on four posts over a laden table
    const stripes = [[0xc83a3a, 0xf4ecd8], [0x3a6ab8, 0xf4ecd8], [0x3a8a4a, 0xf0e0b0], [0xd8a030, 0x8a3a2a]][Math.floor(r(1) * 4)];
    for (const [dx, dz] of [[-0.42, -0.38], [0.42, -0.38], [-0.42, 0.3], [0.42, 0.3]]) B.box(WOOD_D, { x: cx + dx, y, z: cz + dz, sx: 0.05, sy: dz < 0 ? 0.95 : 0.78, sz: 0.05 });
    for (let i = 0; i < 6; i++) {
      const px = cx - 0.45 + i * 0.18 + 0.09;
      B.box(stripes[i % 2], { x: px, y: y + 0.78, z: cz - 0.05, sx: 0.18, sy: 0.025, sz: 0.88, rx: -0.3 });
    }
    // scalloped valance
    for (let i = 0; i < 6; i++) B.shape(TPL.hemi, stripes[(i + 1) % 2], { x: cx - 0.45 + i * 0.18 + 0.09, y: y + 0.72, z: cz + 0.38, sx: 0.18, sy: -0.08, sz: 0.03 });
    B.box(WOOD, { x: cx, y: y + 0.3, z: cz + 0.05, sx: 0.92, sy: 0.05, sz: 0.5 });
    B.box(WOOD_D, { x: cx, y, z: cz + 0.05, sx: 0.86, sy: 0.3, sz: 0.44 });
    const put = (tpl, color, o) => B.shape(tpl, color, o);
    const kind = Math.floor(r(2) * 4);
    for (let i = 0; i < 3; i++) {
      const px = cx - 0.28 + i * 0.28, py = y + 0.35, pz = cz + 0.05;
      if (kind === 0) for (let k = 0; k < 4; k++) put(TPL.ball, [0xd83a2a, 0xe8c040, 0x8ac03a, 0xe07a2a][(i + k) % 4], { x: px + (k % 2 - 0.5) * 0.08, y: py + 0.04 + Math.floor(k / 2) * 0.05, z: pz + (k % 2) * 0.06, s: 0.09 });
      else if (kind === 1) put(TPL.cyl8, [0xc04a8a, 0x4a8ac0, 0xe0c060][i], { x: px, y: py + 0.05, z: pz, sx: 0.1, sy: 0.24, sz: 0.1, rz: Math.PI / 2 });
      else if (kind === 2) { put(TPL.cyl8, 0xb06a3a, { x: px, y: py, z: pz, sx: 0.14, sy: 0.12, sz: 0.14 }); put(TPL.ball, 0xb06a3a, { x: px, y: py + 0.12, z: pz, sx: 0.12, sy: 0.06, sz: 0.12 }); }
      else { put(TPL.cyl12, 0xe8c050, { x: px, y: py, z: pz, sx: 0.18, sy: 0.08, sz: 0.18 }); put(TPL.ball, 0xd89a48, { x: px, y: py + 0.1, z: pz, sx: 0.16, sy: 0.08, sz: 0.1 }); }
    }
    // a basket and a crate beside it
    B.shape(TPL.taper8, 0xb08a50, { x: cx + 0.36, y, z: cz + 0.42, sx: 0.2, sy: -0.16, sz: 0.2 });
    B.box(0xa07a48, { x: cx - 0.36, y, z: cz + 0.42, sx: 0.2, sy: 0.16, sz: 0.2, ry: 0.3 });
  },
  lamppost(c) {
    const { B, G, cx, cz, y } = c;
    // a wrought-iron post with a lantern that lights the street at night
    B.shape(TPL.cyl8, IRON, { x: cx, y, z: cz, sx: 0.16, sy: 0.08, sz: 0.16 });
    B.shape(TPL.cyl6, IRON, { x: cx, y, z: cz, sx: 0.06, sy: 1.2, sz: 0.06 });
    B.box(IRON, { x: cx + 0.1, y: y + 1.12, z: cz, sx: 0.22, sy: 0.03, sz: 0.03 });
    B.shape(TPL.cone4, IRON, { x: cx + 0.2, y: y + 1.13, z: cz, sx: 0.18, sy: 0.1, sz: 0.18, ry: Math.PI / 4 });
    G.box(0xffd070, { x: cx + 0.2, y: y + 0.96, z: cz, sx: 0.11, sy: 0.15, sz: 0.11 });
    B.box(IRON, { x: cx + 0.2, y: y + 0.94, z: cz, sx: 0.13, sy: 0.02, sz: 0.13 });
    c.light(cx + 0.2, cz + 0.2, 2.6, 0xffb860, 0.8);
  },
  cart(c) {
    const { B, cx, cz, y, r } = c;
    const a = r(1) * 0.6 - 0.3;
    const put = frame(c, a, y);
    // a two-wheeled handcart, loaded
    put(TPL.box, WOOD, { y: 0.3, sx: 0.5, sy: 0.06, sz: 0.74 });
    for (const s of [-1, 1]) {
      put(TPL.box, WOOD_L, { x: s * 0.24, y: 0.36, sx: 0.04, sy: 0.16, sz: 0.74 });
      put(TPL.cyl12, WOOD_D, { x: s * 0.3, y: 0.0, z: 0.05, sx: 0.06, sy: 0.5, sz: 0.5, rz: Math.PI / 2, ry: 0 });
      put(TPL.box, WOOD_L, { x: s * 0.16, y: 0.26, z: 0.56, sx: 0.04, sy: 0.04, sz: 0.5, rx: -0.35 });
    }
    put(TPL.box, WOOD_L, { y: 0.36, z: -0.37, sx: 0.5, sy: 0.16, sz: 0.04 });
    if (r(2) < 0.5) for (let i = 0; i < 3; i++) put(TPL.capsule, 0xc8a870, { x: (i - 1) * 0.14, y: 0.36, z: -0.1 + (i % 2) * 0.2, sx: 0.16, sy: 0.24, sz: 0.16 });
    else { put(TPL.ico1, 0xd8b050, { y: 0.4, sx: 0.46, sy: 0.3, sz: 0.66 }); }
  },
  hay(c) {
    const { B, cx, cz, y, r } = c;
    // a domed haystack with a thatched cap, two round bales and a pitchfork
    const hx = cx - 0.12 + r(5) * 0.08, hz = cz - 0.12;
    B.shape(TPL.dome, 0xc8a04a, { x: hx, y: y - 0.02, z: hz, sx: 0.72, sy: 0.42, sz: 0.66, grad: 0.35 });
    // bands of combed straw round the stack
    for (const [k, yy, s] of [[0.98, 0.16, 0.73], [1.1, 0.34, 0.62], [0.95, 0.5, 0.45]]) {
      B.shape(TPL.cyl12, shade(0xc8a04a, k), { x: hx, y: y + yy, z: hz, sx: s, sy: 0.05, sz: s * 0.92 });
    }
    B.shape(TPL.cone8, 0xa8843a, { x: hx, y: y + 0.6, z: hz, sx: 0.32, sy: 0.3, sz: 0.3 });
    B.shape(TPL.cyl6, WOOD_D, { x: hx, y: y + 0.82, z: hz, sx: 0.03, sy: 0.16, sz: 0.03 });
    // round bales lying on their sides, ends spiralled darker. A cylinder
    // stands on its base, so a lying one is placed from its end.
    const lying = (color, x, yy, z, len, d, ry) => {
      const ax = -Math.cos(ry), az = Math.sin(ry);
      B.shape(TPL.cyl12, color, { x: x - ax * len / 2, y: yy, z: z - az * len / 2, sx: d, sy: len, sz: d, rz: Math.PI / 2, ry });
      return [ax, az];
    };
    for (const [dx, dz, ry] of [[0.32, 0.26, 0.3 + r(1) * 0.4], [-0.3, 0.34, -0.2 - r(2) * 0.4]]) {
      const bx = cx + dx, bz = cz + dz, by = y + 0.16;
      const [ax, az] = lying(0xd2ac56, bx, by, bz, 0.3, 0.32, ry);
      for (const e of [-1, 1]) {
        lying(0xb08a3c, bx + ax * e * 0.152, by, bz + az * e * 0.152, 0.006, 0.27, ry);
        lying(0x94702e, bx + ax * e * 0.156, by, bz + az * e * 0.156, 0.006, 0.12, ry);
      }
      lying(0x8a6a30, bx, by, bz, 0.025, 0.335, ry);
    }
    // a few loose wisps and the fork
    for (let i = 0; i < 4; i++) B.box(0xd8b45c, { x: cx - 0.4 + r(10 + i) * 0.8, y: y + 0.01, z: cz + 0.1 + r(20 + i) * 0.3, sx: 0.12, sy: 0.015, sz: 0.02, ry: r(30 + i) * 3 });
    B.box(WOOD_L, { x: hx + 0.36, y, z: hz + 0.05, sx: 0.03, sy: 0.75, sz: 0.03, rz: 0.35 });
    B.box(IRON, { x: hx + 0.5, y: y + 0.66, z: hz + 0.05, sx: 0.12, sy: 0.02, sz: 0.02, rz: 0.35 });
  },

  // --- furniture ---
  counter(c) {
    const { B, cx, cz, y, r, nb, map, x, z } = c;
    const alongX = nb(-1, 0).key === 'counter' || nb(1, 0).key === 'counter' || !(nb(0, -1).key === 'counter' || nb(0, 1).key === 'counter');
    const put = frame(c, alongX ? 0 : Math.PI / 2);
    const H = 0.42;
    put(TPL.box, WOOD_D, { y: 0, sx: 1.0, sy: H, sz: 0.46 });
    // panelled front and back
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) put(TPL.box, WOOD, { x: -0.25 + i * 0.5, y: 0.07, z: s * 0.235, sx: 0.4, sy: H - 0.14, sz: 0.012 });
    put(TPL.box, WOOD_L, { y: H, sx: 1.02, sy: 0.04, sz: 0.54 });
    const role = shopRoleNear(map, x, z);
    if (r(1) < 0.75) goods(put, role, r(2), (r(3) - 0.5) * 0.3, 0.02, H + 0.04);
  },
  table(c) {
    const { B, G, cx, cz, y, r } = c;
    const put = frame(c, 0);
    const glow = frame(c, 0, y, G);
    const H = 0.36;
    put(TPL.box, WOOD_L, { y: H, sx: 0.8, sy: 0.05, sz: 0.62 });
    for (let i = 0; i < 3; i++) put(TPL.box, shade(WOOD_L, 0.88), { y: H + 0.051, z: -0.2 + i * 0.2, sx: 0.8, sy: 0.003, sz: 0.012 });
    for (const [dx, dz] of [[-0.34, -0.25], [0.34, -0.25], [-0.34, 0.25], [0.34, 0.25]]) put(TPL.box, WOOD_D, { x: dx, y: 0, z: dz, sx: 0.06, sy: H, sz: 0.06 });
    // benches either side
    for (const s of [-1, 1]) {
      put(TPL.box, WOOD, { y: 0.2, z: s * 0.45, sx: 0.74, sy: 0.04, sz: 0.16 });
      for (const dx of [-0.3, 0.3]) put(TPL.box, WOOD_D, { x: dx, y: 0, z: s * 0.45, sx: 0.05, sy: 0.2, sz: 0.12 });
    }
    // tankards, a plate of supper and a candle
    tankard(put, -0.22, H + 0.05, -0.12);
    if (r(1) < 0.6) tankard(put, 0.18, H + 0.05, 0.14);
    put(TPL.cyl12, 0xf0ece0, { x: 0.02, y: H + 0.05, z: -0.05, sx: 0.2, sy: 0.015, sz: 0.2 });
    if (r(2) < 0.5) put(TPL.ball, 0xc88a48, { x: 0.02, y: H + 0.08, z: -0.05, sx: 0.12, sy: 0.06, sz: 0.09 });
    else put(TPL.ball, 0xe8c050, { x: 0.02, y: H + 0.07, z: -0.05, sx: 0.1, sy: 0.05, sz: 0.1 });
    candle(put, glow, 0.25, H + 0.05, -0.18, 0.12);
    c.light(cx, cz, 1.2, 0xffb050, 0.35);
  },
  bed(c) {
    const { B, cx, cz, y, r } = c;
    const a = angleFor(backTo(c));
    const put = frame(c, a);
    const quilts = [[0xb8423a, 0xe8c070], [0x3a5aa8, 0xe8e0c8], [0x3a8a4a, 0xe0d0a0], [0x8a4a8a, 0xf0d8e0]];
    const [q1, q2] = quilts[Math.floor(r(1) * quilts.length)];
    // frame with posts, mattress, a patchwork quilt, pillow and headboard
    put(TPL.box, WOOD, { y: 0, z: 0.02, sx: 0.66, sy: 0.18, sz: 0.92 });
    put(TPL.box, 0xf4efe2, { y: 0.18, z: 0.02, sx: 0.62, sy: 0.06, sz: 0.88 });
    for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
      put(TPL.box, (i + k) % 2 ? q1 : q2, { x: -0.155 + k * 0.31, y: 0.235, z: 0.09 + (i - 1) * 0.21, sx: 0.32, sy: 0.04, sz: 0.215 });
    }
    put(TPL.box, shade(q1, 0.8), { y: 0.2, z: 0.4, sx: 0.66, sy: 0.07, sz: 0.1 });
    put(TPL.capsule, 0xfaf6ee, { y: 0.24, z: -0.3, sx: 0.44, sy: 0.12, sz: 0.18, rz: Math.PI / 2, ry: 0 });
    put(TPL.box, WOOD_D, { y: 0, z: -0.44, sx: 0.7, sy: 0.52, sz: 0.06 });
    put(TPL.box, WOOD, { y: 0.52, z: -0.44, sx: 0.74, sy: 0.05, sz: 0.08 });
    for (const s of [-1, 1]) put(TPL.ball, WOOD_L, { x: s * 0.34, y: 0.58, z: -0.44, s: 0.07 });
    put(TPL.box, WOOD_D, { y: 0, z: 0.47, sx: 0.7, sy: 0.26, sz: 0.05 });
  },
  hearth(c) {
    const { B, G, cx, cz, y } = c;
    const back = backTo(c);
    const a = angleFor(back);
    const put = frame(c, a);
    const glow = frame(c, a, y, G);
    const st = 0x9a9086;
    // a stone fireplace against the wall: breast up to the beams, a mantel,
    // a crackling fire on its logs, and a pot on the hearthstone
    put(TPL.box, shade(st, 0.95), { y: 0, z: -0.2, sx: 0.94, sy: 0.62, sz: 0.5, grad: 0.15 });
    put(TPL.box, 0x1a120e, { y: 0.04, z: 0.04, sx: 0.5, sy: 0.38, sz: 0.04 });
    put(TPL.box, WOOD_D, { y: 0.6, z: 0.02, sx: 1.0, sy: 0.07, sz: 0.14 });
    put(TPL.trap, shade(st, 1.0), { y: 0.66, z: -0.24, sx: 0.84, sy: 0.38, sz: 0.4 });
    for (let i = 0; i < 4; i++) put(TPL.box, shade(st, 0.78), { y: 0.1 + i * 0.13, z: 0.051, sx: 0.95, sy: 0.012, sz: 0.01 });
    put(TPL.box, shade(st, 1.1), { y: 0, z: 0.22, sx: 0.8, sy: 0.04, sz: 0.34 });
    // logs and flames
    put(TPL.cyl6, 0x5a3418, { x: -0.06, y: 0.07, z: 0.0, sx: 0.08, sy: 0.4, sz: 0.08, rz: Math.PI / 2, ry: 0.3 });
    put(TPL.cyl6, 0x4a2a14, { x: 0.06, y: 0.08, z: 0.02, sx: 0.08, sy: 0.38, sz: 0.08, rz: Math.PI / 2, ry: -0.3 });
    glow(TPL.cone5, 0xff6a10, { y: 0.08, z: 0.0, sx: 0.32, sy: 0.3, sz: 0.2 });
    glow(TPL.cone5, 0xffc030, { y: 0.08, z: 0.02, sx: 0.18, sy: 0.22, sz: 0.12, ry: 0.6 });
    glow(TPL.box, 0xff8a20, { y: 0.05, z: 0.0, sx: 0.4, sy: 0.02, sz: 0.2 });
    // mantel things
    put(TPL.cyl8, 0xc8a878, { x: -0.3, y: 0.67, z: 0.02, sx: 0.08, sy: 0.12, sz: 0.08 });
    put(TPL.cyl8, 0x6a8a9a, { x: 0.3, y: 0.67, z: 0.02, sx: 0.07, sy: 0.1, sz: 0.07 });
    put(TPL.hemi, 0x2a2624, { x: 0.36, y: 0.12, z: 0.26, sx: 0.2, sy: -0.15, sz: 0.2 });
    put(TPL.cyl8, 0x2a2624, { x: 0.36, y: 0.11, z: 0.26, sx: 0.21, sy: 0.02, sz: 0.21 });
    void B; void cx; void cz;
  },
  shelf(c) {
    const { r } = c;
    const a = angleFor(backTo(c));
    const put = frame(c, a);
    const H = 0.98;
    const books = [0x9a2a2a, 0x2a4a9a, 0x2a7a3a, 0xa87a2a, 0x6a2a7a, 0x2a6a7a, 0xc8b070, 0x7a3a1a];
    // a tall case of shelves, crammed with books
    put(TPL.box, WOOD_D, { y: 0, z: -0.3, sx: 0.92, sy: H, sz: 0.06 });
    for (const s of [-1, 1]) put(TPL.box, WOOD, { x: s * 0.44, y: 0, z: -0.16, sx: 0.05, sy: H, sz: 0.32 });
    for (let k = 0; k < 4; k++) put(TPL.box, WOOD, { y: k * 0.31, z: -0.16, sx: 0.92, sy: 0.04, sz: 0.32 });
    put(TPL.box, WOOD_L, { y: H, z: -0.15, sx: 0.98, sy: 0.05, sz: 0.36 });
    for (let row = 0; row < 3; row++) {
      let u = -0.39;
      let i = 0;
      while (u < 0.37) {
        const k = r(10 + row * 12 + i);
        const bw = 0.045 + k * 0.035;
        if (k < 0.1) { u += 0.08; i++; continue; }
        const hgt = 0.16 + r(40 + row * 12 + i) * 0.08;
        const lean = k > 0.9 ? 0.25 : 0;
        put(TPL.box, books[Math.floor(r(70 + row * 12 + i) * books.length)], { x: u + bw / 2, y: 0.04 + row * 0.31, z: -0.15, sx: bw - 0.006, sy: hgt, sz: 0.22, rz: lean });
        if (k > 0.5) put(TPL.box, GOLD, { x: u + bw / 2, y: 0.04 + row * 0.31 + hgt * 0.7, z: -0.039, sx: bw - 0.01, sy: 0.015, sz: 0.004 });
        u += bw;
        i++;
      }
    }
    // a candle and a skull on top, for the scholarly
    if (r(1) < 0.5) put(TPL.ball, 0xf0e8d0, { x: 0.25, y: H + 0.1, z: -0.15, sx: 0.12, sy: 0.11, sz: 0.13 });
    put(TPL.cyl8, 0xc8a878, { x: -0.22, y: H + 0.05, z: -0.15, sx: 0.1, sy: 0.12, sz: 0.1 });
  },
  anvil(c) {
    const { G, r } = c;
    const a = r(1) * 0.6 - 0.3;
    const put = frame(c, a);
    const glow = frame(c, a, c.y, G);
    const iron = 0x3e3c42;
    // an anvil on its stump, horn and all; a hot bar on the face, sparks
    put(TPL.cyl8, 0x7a5030, { y: 0, sx: 0.36, sy: 0.24, sz: 0.36 });
    put(TPL.cyl8, 0x5a3a20, { y: 0.24, sx: 0.37, sy: 0.015, sz: 0.37 });
    put(TPL.trap, iron, { y: 0.24, sx: 0.3, sy: 0.08, sz: 0.2 });
    put(TPL.box, iron, { y: 0.32, sx: 0.14, sy: 0.08, sz: 0.12 });
    put(TPL.box, shade(iron, 1.3), { y: 0.4, sx: 0.36, sy: 0.08, sz: 0.16 });
    put(TPL.cone8, shade(iron, 1.2), { x: 0.22, y: 0.44, sx: 0.08, sy: 0.18, sz: 0.08, rz: -Math.PI / 2 });
    glow(TPL.box, 0xff7020, { x: -0.04, y: 0.485, sx: 0.2, sy: 0.025, sz: 0.04 });
    glow(TPL.box, 0xffd060, { x: -0.04, y: 0.49, sx: 0.12, sy: 0.026, sz: 0.03 });
    for (let i = 0; i < 6; i++) {
      const sa = r(10 + i) * Math.PI * 2, sd = 0.06 + r(20 + i) * 0.16;
      glow(TPL.box, i % 2 ? 0xffe080 : 0xffa030, { x: -0.04 + Math.cos(sa) * sd, y: 0.52 + r(30 + i) * 0.22, z: Math.sin(sa) * sd, s: 0.022 });
    }
    // hammer and tongs
    put(TPL.box, 0x6a4424, { x: 0.05, y: 0.25, z: 0.2, sx: 0.04, sy: 0.04, sz: 0.24, ry: 0.4 });
    put(TPL.box, iron, { x: 0.0, y: 0.24, z: 0.31, sx: 0.12, sy: 0.07, sz: 0.06, ry: 0.4 });
    c.light(c.cx, c.cz, 1.6, 0xff8030, 0.5);
  },
  barrels(c) {
    const { B, cx, cz, y, r } = c;
    const spots = [[-0.2, -0.16], [0.2, -0.18], [-0.04, 0.2]];
    const barrel = (x, z, s, lid) => {
      B.shape(TPL.cyl8, 0x8a5a2a, { x, y, z, sx: 0.32 * s, sy: 0.42 * s, sz: 0.32 * s });
      B.shape(TPL.cyl8, 0x9a6a36, { x, y: y + 0.1 * s, z, sx: 0.345 * s, sy: 0.22 * s, sz: 0.345 * s });
      for (const hy of [0.05, 0.36]) B.shape(TPL.cyl8, 0x34302c, { x, y: y + hy * s, z, sx: 0.335 * s, sy: 0.03, sz: 0.335 * s });
      B.shape(TPL.cyl8, lid ? 0xa87a48 : 0x6a4222, { x, y: y + 0.42 * s, z, sx: 0.28 * s, sy: 0.012, sz: 0.28 * s });
    };
    barrel(cx + spots[0][0], cz + spots[0][1], 1, true);
    barrel(cx + spots[1][0], cz + spots[1][1], 0.92, r(5) < 0.5);
    if (r(1) < 0.5) {
      // a crate, lid nailed down
      const ry = r(2) * 0.6;
      B.box(0xa07a48, { x: cx + spots[2][0], y, z: cz + spots[2][1], sx: 0.32, sy: 0.3, sz: 0.32, ry, grad: 0.15 });
      B.box(0x7a5a32, { x: cx + spots[2][0], y: y + 0.3, z: cz + spots[2][1], sx: 0.33, sy: 0.02, sz: 0.06, ry });
      B.box(0x7a5a32, { x: cx + spots[2][0], y: y + 0.14, z: cz + spots[2][1], sx: 0.335, sy: 0.04, sz: 0.335, ry: ry });
    } else {
      B.shape(TPL.cyl8, 0x8a5a2a, { x: cx + spots[2][0], y: y + 0.17, z: cz + spots[2][1], sx: 0.3, sy: 0.38, sz: 0.3, rz: Math.PI / 2, ry: r(3) * 2 });
    }
  },
  throne(c) {
    const { cx, cz, y } = c;
    const a = angleFor(backTo(c));
    const put = frame(c, a);
    const gold = 0xe0b440, red = 0xa01e2e;
    // on a stepped dais: a tall gilded throne with a crimson back and cushion
    put(TPL.box, 0x9a9488, { y: 0, sx: 1.0, sy: 0.08, sz: 1.0 });
    put(TPL.box, 0xb0aa9c, { y: 0.08, z: -0.08, sx: 0.8, sy: 0.08, sz: 0.76 });
    put(TPL.box, gold, { y: 0.16, z: -0.08, sx: 0.56, sy: 0.24, sz: 0.48 });
    put(TPL.box, red, { y: 0.4, z: -0.04, sx: 0.46, sy: 0.07, sz: 0.4 });
    put(TPL.box, gold, { y: 0.16, z: -0.34, sx: 0.58, sy: 0.98, sz: 0.1 });
    put(TPL.box, red, { y: 0.44, z: -0.285, sx: 0.4, sy: 0.6, sz: 0.02 });
    for (const s of [-1, 1]) {
      put(TPL.box, gold, { x: s * 0.27, y: 0.4, z: -0.08, sx: 0.07, sy: 0.18, sz: 0.46 });
      put(TPL.ball, gold, { x: s * 0.27, y: 0.6, z: 0.15, s: 0.08 });
      put(TPL.cone4, gold, { x: s * 0.25, y: 1.14, z: -0.34, sx: 0.08, sy: 0.16, sz: 0.08 });
    }
    put(TPL.cone4, gold, { y: 1.14, z: -0.34, sx: 0.14, sy: 0.26, sz: 0.1 });
    put(TPL.ball, 0x3a8ae0, { y: 0.98, z: -0.28, s: 0.08 });
    void cx; void cz;
  },
  altar(c) {
    const { G } = c;
    const a = angleFor(backTo(c));
    const put = frame(c, a);
    const glow = frame(c, a, c.y, G);
    // white stone, a gold-edged cloth, candles, an open book, a sun on a stand
    put(TPL.box, 0xe6e0d0, { y: 0, sx: 0.86, sy: 0.42, sz: 0.48, grad: 0.15 });
    put(TPL.box, 0xf2eee2, { y: 0.42, sx: 0.92, sy: 0.04, sz: 0.52 });
    put(TPL.box, 0xc8beb0, { y: 0.1, z: 0.241, sx: 0.5, sy: 0.22, sz: 0.01 });
    put(TPL.box, 0x2e4c9a, { y: 0.22, z: 0.0, sx: 0.4, sy: 0.25, sz: 0.535 });
    put(TPL.box, GOLD, { y: 0.22, z: 0.0, sx: 0.42, sy: 0.02, sz: 0.54 });
    put(TPL.box, 0xf4ecd8, { x: 0.02, y: 0.46, z: 0.04, sx: 0.22, sy: 0.02, sz: 0.16, rz: 0.05 });
    for (const s of [-1, 1]) candle(put, glow, s * 0.36, 0.46, -0.1, 0.22);
    candle(put, glow, -0.26, 0.46, 0.12, 0.12);
    put(TPL.box, GOLD, { y: 0.46, z: -0.18, sx: 0.03, sy: 0.3, sz: 0.03 });
    put(TPL.torus, GOLD, { y: 0.88, z: -0.18, sx: 0.32, sy: 0.32, sz: 0.4 });
    put(TPL.ball, 0xfff0a0, { y: 0.88, z: -0.18, sx: 0.12, sy: 0.12, sz: 0.05 });
  },
};

// ---------------------------------------------------------------- town walls
// Dressed stone with a walkway and battlements; corners become round towers
// and the ends either side of a gate square gate towers with an arch between.
function townWall(c) {
  const { B, cx, cz, y, t, map, nb, x, z } = c;
  if (!map || map.type === 'dungeon' || t.key !== 'wall_stone') {
    if (c.r(1) < 0.4) B.box(shade(t.top, 0.9), { x: cx + (c.r(2) - 0.5) * 0.5, y, z: cz + (c.r(3) - 0.5) * 0.5, sx: 0.3, sy: 0.04, sz: 0.25 });
    return;
  }
  const g = c.g;
  const isW = (dx, dz) => nb(dx, dz).key === 'wall_stone';
  const st = t.side, top = t.top;
  const solid = (dx, dz) => nb(dx, dz).wall;
  const n = isW(0, -1), s = isW(0, 1), e = isW(1, 0), w = isW(-1, 0);
  // block courses on the open faces
  const faces = [[0, 1, [x, z + 1], [x + 1, z + 1]], [0, -1, [x + 1, z], [x, z]], [1, 0, [x + 1, z + 1], [x + 1, z]], [-1, 0, [x, z], [x, z + 1]]];
  for (const [dx, dz, a, b] of faces) {
    if (solid(dx, dz)) continue;
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y0 = g + (r / rows) * (y - g) + 0.01, y1 = g + ((r + 1) / rows) * (y - g) - 0.01;
      let u = -((r % 2) * 0.25 + hash2(x + r, z * 3 + dx * 7 + dz * 11, 61) * 0.12);
      let k = 0;
      while (u < 1) {
        const bw = 0.3 + hash2(x * 13 + r * 7 + k, z * 17 + dx + dz * 3, 62) * 0.2;
        const u0 = Math.max(0, u) + 0.012, u1 = Math.min(1, u + bw) - 0.012;
        if (u1 - u0 > 0.05) {
          const rr = hash2(x * 31 + r * 5 + k * 3, z * 29 + dx * 2 + dz * 5, 63);
          const out = 0.012 + rr * 0.014;
          const col = shade(st, (0.86 + rr * 0.28) * (0.85 + 0.3 * (r / rows)));
          const P = (u, h, o) => [a[0] + ex * u + dx * o, h, a[1] + ez * u + dz * o];
          B.quad(P(u0, y0, out), P(u1, y0, out), P(u1, y1, out), P(u0, y1, out), col);
          B.quad(P(u0, y1, out), P(u1, y1, out), P(u1, y1, 0), P(u0, y1, 0), shade(col, 1.15));
        }
        u += bw;
        k++;
      }
    }
  }
  const corner = (n || s) && (e || w) && !(n && s) && !(e && w);
  // a gate: the wall stops at a walkable square with wall beyond it
  const gateDir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => {
    if (!nb(dx, dz).walk || nb(dx, dz).wall) return false;
    return isW(-dx, -dz);
  });
  if (corner) {
    // a round corner tower with a slate cone
    B.shape(TPL.cyl12, shade(st, 1.02), { x: cx, y: g - 0.04, z: cz, sx: 1.25, sy: y - g + 0.5, sz: 1.25, grad: 0.3 });
    B.shape(TPL.cyl12, shade(top, 1.08), { x: cx, y: y + 0.42, z: cz, sx: 1.38, sy: 0.1, sz: 1.38 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.box(shade(top, 1.05), { x: cx + Math.cos(a) * 0.6, y: y + 0.52, z: cz + Math.sin(a) * 0.6, sx: 0.2, sy: 0.18, sz: 0.2, ry: -a });
    }
    B.shape(TPL.cone12, 0x4a5a7a, { x: cx, y: y + 0.6, z: cz, sx: 1.1, sy: 0.95, sz: 1.1, grad: 0.3 });
    banner(B, cx, y + 1.5, cz, 0xb83030);
    return;
  }
  if (gateDir) {
    // a square gate tower, taller than the wall, with an arch to its twin
    const [dx, dz] = gateDir;
    B.box(shade(st, 1.05), { x: cx, y: g - 0.04, z: cz, sx: 1.14, sy: y - g + 0.7, sz: 1.14, grad: 0.25 });
    B.box(shade(top, 1.08), { x: cx, y: y + 0.66, z: cz, sx: 1.26, sy: 0.08, sz: 1.26 });
    for (const [mx, mz] of [[-0.5, -0.5], [0, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [-0.5, 0.5], [0, 0.5], [0.5, 0.5]]) B.box(shade(top, 1.05), { x: cx + mx, y: y + 0.74, z: cz + mz, sx: 0.22, sy: 0.18, sz: 0.22 });
    B.box(0x1a1612, { x: cx - dz * 0.3, y: y + 0.2, z: cz + dx * 0.3 + 0.575, sx: 0.12, sy: 0.22, sz: 0.01 });
    // span the opening if the far tower is within a few squares
    for (let k = 2; k <= 5; k++) {
      const tt = nb(dx * k, dz * k);
      if (tt.key !== 'wall_stone') continue;
      const ax = cx + dx * 0.55, az = cz + dz * 0.55, bx = cx + dx * (k - 0.55), bz = cz + dz * (k - 0.55);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, span = Math.hypot(bx - ax, bz - az);
      const ry = dx ? 0 : Math.PI / 2;
      B.box(shade(st, 1.0), { x: mx, y: y + 0.28, z: mz, sx: span, sy: 0.4, sz: 0.5, ry });
      B.box(shade(top, 1.08), { x: mx, y: y + 0.66, z: mz, sx: span, sy: 0.06, sz: 0.6, ry });
      for (let i = 0; i < Math.round(span / 0.36); i += 2) {
        const u = -span / 2 + 0.18 + i * 0.36;
        B.box(shade(top, 1.05), { x: mx + (dx ? u : 0), y: y + 0.72, z: mz + (dz ? u : 0) + (dx ? 0.26 : 0), sx: 0.2, sy: 0.16, sz: 0.1 });
      }
      // the underside of the arch: dark voussoir ring
      B.box(shade(st, 0.7), { x: mx, y: y + 0.24, z: mz, sx: span, sy: 0.05, sz: 0.5, ry });
      banner(B, mx + (dx ? 0 : 0.0), y + 0.12, mz + (dx ? 0.27 : 0), 0xc03030, true);
      break;
    }
    return;
  }
  // the wall-walk and battlements along the outer edges
  B.box(shade(top, 0.92), { x: cx, y: y - 0.005, z: cz, sx: 1.0, sy: 0.01, sz: 1.0 });
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (solid(dx, dz)) continue;
    for (let i = 0; i < 3; i++) {
      const u = -0.33 + i * 0.33;
      const px = cx + (dx ? dx * 0.4 : u), pz = cz + (dz ? dz * 0.4 : u);
      if (i % 2 === 0) B.box(shade(top, 1.06), { x: px, y, z: pz, sx: dx ? 0.2 : 0.22, sy: 0.2, sz: dz ? 0.2 : 0.22 });
    }
    B.box(shade(top, 1.0), dx ? { x: cx + dx * 0.4, y, z: cz, sx: 0.2, sy: 0.07, sz: 1.0 } : { x: cx, y, z: cz + dz * 0.4, sx: 1.0, sy: 0.07, sz: 0.2 });
  }
}

function banner(B, x, y, z, color, hang = false) {
  if (hang) {
    // a long banner hanging from the arch
    sway(B, y, 0.4);
    B.box(color, { x, y: y - 0.36, z, sx: 0.26, sy: 0.4, sz: 0.02 });
    B.box(GOLD, { x, y: y - 0.2, z: z + 0.012, sx: 0.08, sy: 0.08, sz: 0.01, rz: Math.PI / 4 });
    still(B);
    return;
  }
  B.shape(TPL.cyl6, 0x3a3028, { x, y: y - 0.3, z, sx: 0.03, sy: 0.65, sz: 0.03 });
  sway(B, y, 0.7);
  B.box(color, { x: x + 0.15, y: y + 0.14, z, sx: 0.28, sy: 0.16, sz: 0.015 });
  still(B);
}

// ---------------------------------------------------------------- loose walls
// Timber walls and doors that are not part of a found building (half-built
// rooms in the editor, garden walls) keep a simple framed look.
function timber(c, windowed) {
  const { B, G, cx, cz, g, nb, t } = c;
  const beam = 0x4a2e1c;
  const hgt = t.h;
  for (const [dx, dz] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) B.box(beam, { x: cx + dx, y: g, z: cz + dz, sx: 0.07, sy: hgt + 0.01, sz: 0.07 });
  const exposed = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dz]) => !nb(dx, dz).wall);
  for (const [dx, dz] of exposed) {
    const o = dx ? { x: cx + dx * 0.505, z: cz, sx: 0.02, sz: 1.0 } : { x: cx, z: cz + dz * 0.505, sx: 1.0, sz: 0.02 };
    B.box(beam, { ...o, y: g + hgt - 0.06, sy: 0.06 });
    B.box(beam, { ...o, y: g + 0.02, sy: 0.05 });
    if (windowed) {
      const w = dx ? { x: cx + dx * 0.51, z: cz, sx: 0.015, sz: 0.4 } : { x: cx, z: cz + dz * 0.51, sx: 0.4, sz: 0.015 };
      G.box(0xffe8a0, { ...w, y: g + 0.2, sy: 0.2 });
    }
  }
}

function doorDeco(c, locked) {
  const { B, cx, cz, y, nb } = c;
  const wallEW = (nb(-1, 0).wall || nb(-1, 0).door) && (nb(1, 0).wall || nb(1, 0).door);
  const wallNS = (nb(0, -1).wall || nb(0, -1).door) && (nb(0, 1).wall || nb(0, 1).door);
  const ew = wallEW || !wallNS;
  const frame = 0x4a2e1c, panel = locked ? 0x6a3a1a : 0x8a5a2a;
  const H = 0.62;
  const o = (a, b) => (ew ? a : b);
  B.box(frame, o({ x: cx - 0.44, y, z: cz, sx: 0.12, sy: H, sz: 0.2 }, { x: cx, y, z: cz - 0.44, sx: 0.2, sy: H, sz: 0.12 }));
  B.box(frame, o({ x: cx + 0.44, y, z: cz, sx: 0.12, sy: H, sz: 0.2 }, { x: cx, y, z: cz + 0.44, sx: 0.2, sy: H, sz: 0.12 }));
  B.box(frame, o({ x: cx, y: y + H - 0.08, z: cz, sx: 1.0, sy: 0.1, sz: 0.2 }, { x: cx, y: y + H - 0.08, z: cz, sx: 0.2, sy: 0.1, sz: 1.0 }));
  if (locked) {
    B.box(panel, o({ x: cx, y, z: cz, sx: 0.78, sy: H - 0.08, sz: 0.08 }, { x: cx, y, z: cz, sx: 0.08, sy: H - 0.08, sz: 0.78 }));
    for (const hy of [0.12, 0.4]) B.box(IRON, o({ x: cx, y: y + hy, z: cz, sx: 0.8, sy: 0.04, sz: 0.1 }, { x: cx, y: y + hy, z: cz, sx: 0.1, sy: 0.04, sz: 0.8 }));
    B.box(0xe0b040, o({ x: cx + 0.25, y: y + 0.26, z: cz + 0.05, sx: 0.06, sy: 0.08, sz: 0.04 }, { x: cx + 0.05, y: y + 0.26, z: cz + 0.25, sx: 0.04, sy: 0.08, sz: 0.06 }));
  } else {
    B.box(panel, o({ x: cx - 0.36, y, z: cz - 0.2, sx: 0.06, sy: H - 0.1, sz: 0.38, ry: 0.2 }, { x: cx - 0.2, y, z: cz - 0.36, sx: 0.38, sy: H - 0.1, sz: 0.06, ry: 0.2 }));
  }
}

const _rc = new THREE.Color();
function rgb(hex) { return _rc.setHex(hex).clone(); }
void _M;
