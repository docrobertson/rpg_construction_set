// The waterfront: piers on their posts, a ship's hull taking shape on the
// slipway, a treadwheel crane, cargo on the quay, nets drying, and the gulls
// that come with all of it. Builders take the usual DECOR context (decor.js).
import * as THREE from 'three';
import { TPL, shade } from './builder.js';
import { tube } from './sculpt.js';

const WOOD = 0x7a4a26, WOOD_D = 0x5a3418, WOOD_L = 0xa8784a, TAR = 0x3a2a1e, IRON = 0x34302e, ROPE = 0xc8b088;
const DECK_Y = 0.05;

// a placing function in a frame turned by `a` about (x, z), lifted to y
export function framed(B, x, y, z, a) {
  const M = new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z);
  const put = (tpl, color, o = {}) => B.shape(tpl, color, { ...o, matrix: M });
  // a point in the frame, for swept tubes
  put.p = (lx, ly, lz) => [x + lx * Math.cos(a) + lz * Math.sin(a), y + ly, z - lx * Math.sin(a) + lz * Math.cos(a)];
  return put;
}

// the side of a square that looks out over open water (south first: the camera's side)
export function seaward(nb) {
  for (const [dx, dz] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
    const n = nb(dx, dz);
    if (n && n.water && !n.deck) return [dx, dz];
  }
  return null;
}
export const facing = ([dx, dz]) => Math.atan2(dx, dz);

function sway(B, y0, k) { if (B.aux) B.auxAt = (px, py) => Math.max(0, py - y0) * k; }
function still(B) { if (B.aux) B.auxAt = null; }

// A herring gull, perched or on the wing (its wingtips shiver in the wind)
export function gull(B, x, y, z, s = 1, ry = 0, flying = false) {
  const put = framed(B, x, y, z, ry);
  put(TPL.capsule, 0xf4f2ec, { y: 0.05 * s, sx: 0.07 * s, sy: 0.07 * s, sz: 0.14 * s, rx: Math.PI / 2 });
  put(TPL.ball, 0xfaf8f2, { y: 0.1 * s, z: 0.07 * s, s: 0.065 * s });
  put(TPL.cone4, 0xe8b830, { y: 0.095 * s, z: 0.11 * s, sx: 0.02 * s, sy: 0.05 * s, sz: 0.02 * s, rx: Math.PI / 2 });
  put(TPL.box, 0x3a3a3a, { y: 0.06 * s, z: -0.09 * s, sx: 0.06 * s, sy: 0.015 * s, sz: 0.05 * s });
  if (flying) {
    sway(B, y + 0.04 * s, 0.9);
    for (const sd of [-1, 1]) {
      put(TPL.box, 0xb8bcc4, { x: sd * 0.09 * s, y: 0.08 * s, sx: 0.16 * s, sy: 0.012 * s, sz: 0.07 * s, rz: sd * 0.35 });
      put(TPL.box, 0x2a2a2e, { x: sd * 0.2 * s, y: 0.13 * s, sx: 0.07 * s, sy: 0.01 * s, sz: 0.05 * s, rz: sd * 0.5 });
    }
    still(B);
  } else {
    for (const sd of [-1, 1]) put(TPL.box, 0xa8acb4, { x: sd * 0.045 * s, y: 0.06 * s, z: -0.02 * s, sx: 0.025 * s, sy: 0.05 * s, sz: 0.15 * s });
    for (const sd of [-1, 1]) put(TPL.box, 0xe8a040, { x: sd * 0.02 * s, y: -0.01 * s, sx: 0.01 * s, sy: 0.04 * s, sz: 0.01 * s });
  }
}

// A hull on the stocks: keel, curved ribs, a few strakes planked on. Built
// along +z (the bow) from the frame's origin; len is stem to stern.
export function hullFrame(B, put, len, beam, depth, planked = 0.5) {
  const ribs = 7;
  put(TPL.box, TAR, { y: 0, sx: 0.05, sy: 0.05, sz: len });
  // stem and sternpost rising at either end
  tube(B, [put.p(0, 0, len / 2), put.p(0, depth * 0.6, len / 2 + 0.06), put.p(0, depth * 1.15, len / 2 + 0.08)], 0.025, WOOD_D, { segs: 5 });
  tube(B, [put.p(0, 0, -len / 2), put.p(0, depth * 1.05, -len / 2 - 0.03)], 0.025, WOOD_D, { segs: 5 });
  const width = (t) => beam * Math.sin(Math.PI * (0.12 + 0.76 * t));
  for (let i = 0; i < ribs; i++) {
    const t = (i + 0.5) / ribs, z = -len / 2 + t * len, w = width(t);
    tube(B, [put.p(-w, depth, z), put.p(-w * 0.92, depth * 0.45, z), put.p(0, 0.02, z), put.p(w * 0.92, depth * 0.45, z), put.p(w, depth, z)], 0.016, WOOD_L, { segs: 5 });
  }
  // strakes: the lower ones planked all along, the upper ones only partly
  for (let k = 0; k < 4; k++) {
    const h = depth * (0.12 + k * 0.26);
    const share = k / 4 < planked ? 1 : 0.45;
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let j = 0; j <= 6; j++) {
        const t = 0.04 + (j / 6) * 0.92 * (sd > 0 ? 1 : share);
        const w = width(t) * (0.55 + 0.45 * Math.sqrt(h / depth));
        pts.push(put.p(sd * w, h, -len / 2 + t * len));
      }
      tube(B, pts, [0.028, 0.028], k % 2 ? 0x8a5a30 : 0x9a6a3a, { segs: 4, sq: 0.6 });
    }
  }
}

export const HARBOUR_DECOR = {
  // planks on posts over the water, laid across the way the pier runs
  pier(c) {
    const { B, cx, cz, nb, r } = c;
    const join = (dx, dz) => { const n = nb(dx, dz); return n.deck || (n.walk && !n.water); };
    const ew = (join(-1, 0) || join(1, 0)) && !(nb(0, -1).deck || nb(0, 1).deck);
    for (let i = 0; i < 6; i++) {
      const off = -0.417 + i * 0.167;
      const col = [0x9a7448, 0x8a663e, 0xa07a4c][i % 3];
      B.box(col, ew ? { x: cx + off, y: DECK_Y - 0.06, z: cz, sx: 0.155, sy: 0.06, sz: 1.0 } : { x: cx, y: DECK_Y - 0.06, z: cz + off, sx: 1.0, sy: 0.06, sz: 0.155 });
    }
    // stringers beneath, posts down into the water on the open sides
    for (const s of [-0.3, 0.3]) B.box(WOOD_D, ew ? { x: cx, y: DECK_Y - 0.13, z: cz + s, sx: 1.0, sy: 0.07, sz: 0.06 } : { x: cx + s, y: DECK_Y - 0.13, z: cz, sx: 0.06, sy: 0.07, sz: 1.0 });
    const open = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dz]) => { const n = nb(dx, dz); return n.water && !n.deck; });
    for (const [dx, dz] of open) {
      for (const s of [-0.38, 0.38]) {
        const px = cx + (dx ? dx * 0.44 : s), pz = cz + (dz ? dz * 0.44 : s);
        B.shape(TPL.cyl8, shade(WOOD_D, 0.9), { x: px, y: -0.55, z: pz, sx: 0.09, sy: 0.75, sz: 0.09, grad: 0.5 });
        B.shape(TPL.cyl8, WOOD, { x: px, y: 0.19, z: pz, sx: 0.1, sy: 0.02, sz: 0.1 });
      }
    }
    const side = open[Math.floor(r(1) * open.length)];
    if (side && r(2) < 0.35) {
      // an iron bollard with a hawser coiled round it
      const px = cx + side[0] * 0.3, pz = cz + side[1] * 0.3;
      B.shape(TPL.cyl8, IRON, { x: px, y: DECK_Y, z: pz, sx: 0.1, sy: 0.13, sz: 0.1 });
      B.shape(TPL.cyl8, IRON, { x: px, y: DECK_Y + 0.12, z: pz, sx: 0.14, sy: 0.03, sz: 0.14 });
      B.shape(TPL.torus, ROPE, { x: px, y: DECK_Y + 0.05, z: pz, sx: 0.22, sy: 0.22, sz: 0.4, rx: Math.PI / 2 });
    } else if (side && r(3) < 0.3) {
      gull(B, cx + side[0] * 0.44 + (side[0] ? 0 : 0.38), 0.21, cz + side[1] * 0.44 + (side[1] ? 0 : 0.38), 1.1, r(4) * 6);
    }
  },
  // a ship taking shape on a timber ramp that runs down into the water
  slipway(c) {
    const { B, cx, cz, r, nb } = c;
    const y = c.g;
    const sea = seaward(nb) || [0, 1];
    const a = facing(sea);
    const put = framed(B, cx, y, cz, a);
    // the ramp: two greased ways and cross-sleepers, sloping to the sea
    for (const s of [-0.22, 0.22]) put(TPL.box, WOOD_D, { x: s, y: -0.06, sx: 0.08, sy: 0.07, sz: 1.08, rx: 0.12 });
    for (let i = 0; i < 5; i++) put(TPL.box, WOOD, { y: -0.03 - i * 0.025, z: -0.42 + i * 0.21, sx: 0.66, sy: 0.04, sz: 0.08 });
    // the cradle and the hull upon it, bow to the water
    const hp = framed(B, cx, y + 0.12, cz, a);
    hullFrame(B, hp, 1.12, 0.32, 0.42, r(1) < 0.5 ? 0.5 : 0.75);
    for (const z of [-0.3, 0.1]) put(TPL.box, WOOD_D, { y: 0.02, z, sx: 0.4, sy: 0.1, sz: 0.06 });
    // shores propping the sides, a ladder, a tar pot
    for (const sd of [-1, 1]) for (const z of [-0.25, 0.2]) tube(B, [put.p(sd * 0.52, 0, z), put.p(sd * 0.3, 0.42, z)], 0.02, WOOD_L, { segs: 4 });
    tube(B, [put.p(0.42, 0, -0.42), put.p(0.3, 0.6, -0.4)], 0.014, WOOD_D, { segs: 4 });
    tube(B, [put.p(0.5, 0, -0.38), put.p(0.38, 0.6, -0.36)], 0.014, WOOD_D, { segs: 4 });
    for (let k = 1; k < 5; k++) tube(B, [put.p(0.42 - k * 0.024, k * 0.12, -0.42 + k * 0.004), put.p(0.5 - k * 0.024, k * 0.12, -0.38 + k * 0.004)], 0.008, WOOD_D, { segs: 3 });
    put(TPL.cyl8, IRON, { x: -0.44, y: 0, z: -0.4, sx: 0.12, sy: 0.12, sz: 0.12 });
    put(TPL.cyl8, 0x141010, { x: -0.44, y: 0.12, z: -0.4, sx: 0.1, sy: 0.005, sz: 0.1 });
  },
  // a treadwheel crane: a mast and jib swung out over the water, a load on its rope
  crane(c) {
    const { B, cx, cz, r, nb } = c;
    const y = c.g;
    const sea = seaward(nb) || [0, 1];
    const put = framed(B, cx, y, cz, facing(sea) + (r(1) - 0.5) * 0.5);
    put(TPL.box, WOOD_D, { y: 0, sx: 0.6, sy: 0.08, sz: 0.6 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tube(B, [put.p(dx * 0.26, 0.06, dz * 0.26), put.p(0, 0.62, 0)], 0.02, WOOD, { segs: 4 });
    put(TPL.cyl8, WOOD, { y: 0, sx: 0.12, sy: 1.5, sz: 0.12, grad: 0.3 });
    // the jib: a long arm from high on the mast, out over the water
    const top = put.p(0, 1.42, 0), tip = put.p(0, 1.2, 0.95);
    tube(B, [put.p(0, 1.0, -0.05), tip], 0.04, WOOD_L, { segs: 5 });
    tube(B, [top, tip], 0.018, WOOD_D, { segs: 4 });
    tube(B, [put.p(0, 1.42, 0), put.p(0, 1.05, -0.35)], 0.012, ROPE, { segs: 3 });
    put(TPL.box, IRON, { y: 1.02, z: -0.36, sx: 0.12, sy: 0.1, sz: 0.1 });
    // the treadwheel the men walk to haul
    put(TPL.torus, WOOD, { x: -0.2, y: 0.36, sx: 0.08, sy: 0.75, sz: 0.75, ry: Math.PI / 2 });
    put(TPL.torus, WOOD, { x: 0.2, y: 0.36, sx: 0.08, sy: 0.75, sz: 0.75, ry: Math.PI / 2 });
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      put(TPL.box, WOOD_L, { x: 0, y: 0.36 + Math.sin(t) * 0.29, z: Math.cos(t) * 0.29, sx: 0.4, sy: 0.03, sz: 0.05, rx: -t });
    }
    // the rope down from the tip and a netted bundle of cargo on its hook
    tube(B, [tip, put.p(0, 0.62, 0.95)], 0.008, ROPE, { segs: 3, cap: false });
    put(TPL.ico1, 0xb89a6a, { y: 0.42, z: 0.95, sx: 0.22, sy: 0.22, sz: 0.2 });
    for (let k = 0; k < 3; k++) put(TPL.torus, 0x7a6448, { y: 0.52 - k * 0.07, z: 0.95, sx: 0.25 - k * 0.02, sy: 0.25 - k * 0.02, sz: 0.3, rx: Math.PI / 2 });
    if (r(2) < 0.6) gull(B, tip[0], tip[1] + 0.02, tip[2], 1.1, r(3) * 6);
  },
  // crates, barrels and sacks waiting on the quay
  cargo(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    const crate = (x, yy, z, s, ry, col) => {
      B.box(col, { x, y: yy, z, sx: s, sy: s, sz: s, ry, grad: 0.15 });
      for (const k of [0.04, s - 0.04]) B.box(shade(col, 0.6), { x, y: yy + k - 0.02, z, sx: s + 0.01, sy: 0.035, sz: s + 0.01, ry });
      B.box(shade(col, 0.6), { x, y: yy + s / 2 - 0.02, z, sx: s * 1.05, sy: 0.035, sz: s + 0.01, ry: ry + 0.78 });
    };
    crate(cx - 0.2, y, cz - 0.14, 0.34, r(1) * 0.4, 0xa87a48);
    crate(cx + 0.16, y, cz - 0.2, 0.3, r(2) * 0.4, 0x96693c);
    if (r(3) < 0.7) crate(cx - 0.16, y + 0.34, cz - 0.12, 0.26, r(4) * 0.6, 0xb4864f);
    for (const [dx, dz] of [[0.24, 0.18], [0.02, 0.26]]) {
      B.shape(TPL.cyl8, 0x8a5a2a, { x: cx + dx, y, z: cz + dz, sx: 0.24, sy: 0.32, sz: 0.24 });
      for (const hy of [0.05, 0.26]) B.shape(TPL.cyl8, IRON, { x: cx + dx, y: y + hy, z: cz + dz, sx: 0.252, sy: 0.025, sz: 0.252 });
    }
    // grain sacks slumped against the stack
    for (let i = 0; i < 2; i++) B.shape(TPL.capsule, 0xd8c08a, { x: cx - 0.3 + i * 0.14, y: y + 0.08, z: cz + 0.22, sx: 0.16, sy: 0.2, sz: 0.14, rz: (i - 0.5) * 0.5 });
    if (r(5) < 0.45) gull(B, cx - 0.2, y + 0.34 + (r(3) < 0.7 ? 0.26 : 0), cz - 0.14, 1.1, r(6) * 6);
  },
  // nets drying on a rack, coils of rope and a stack of lobster pots
  nets(c) {
    const { B, cx, cz, r } = c;
    const y = c.g;
    const a = (r(1) - 0.5) * 0.4;
    const put = framed(B, cx, y, cz - 0.15, a);
    for (const s of [-0.38, 0.38]) put(TPL.cyl6, WOOD_D, { x: s, y: 0, sx: 0.05, sy: 0.72, sz: 0.05 });
    put(TPL.cyl6, WOOD, { y: 0.7, sx: 0.04, sy: 0.84, sz: 0.04, rz: Math.PI / 2 });
    // the net: a sagging dark mesh, floats along its top edge
    sway(B, y + 0.68, -0.25);
    for (let k = 0; k < 6; k++) put(TPL.box, 0x4a5a5a, { x: -0.32 + k * 0.128, y: 0.22, sx: 0.012, sy: 0.48, sz: 0.012 });
    for (let k = 0; k < 5; k++) put(TPL.box, 0x4a5a5a, { y: 0.26 + k * 0.1 - Math.abs(k - 2) * 0.01, sx: 0.66, sy: 0.012, sz: 0.012 });
    for (let k = 0; k < 4; k++) put(TPL.ball, 0xe0a030, { x: -0.27 + k * 0.18, y: 0.66, z: 0.02, s: 0.045 });
    still(B);
    // rope coils on the ground, and pots
    for (const [dx, dz, s] of [[-0.24, 0.32, 1], [0.04, 0.36, 0.8]]) {
      for (let k = 0; k < 3; k++) B.shape(TPL.torus, shade(ROPE, 1 - k * 0.08), { x: cx + dx, y: y + 0.015 + k * 0.025, z: cz + dz, sx: 0.32 * s, sy: 0.32 * s, sz: 0.5, rx: Math.PI / 2 });
    }
    for (let k = 0; k < 3; k++) {
      const px = cx + 0.3, pz = cz + 0.24 - (k === 2 ? 0.1 : 0), py = y + (k === 2 ? 0.17 : 0);
      B.shape(TPL.cyl8, 0x8a6a40, { x: px + (k === 1 ? -0.04 : 0), y: py, z: pz + (k === 1 ? 0.18 : 0), sx: 0.18, sy: 0.17, sz: 0.18 });
      B.shape(TPL.hemi, 0x6a4a2a, { x: px + (k === 1 ? -0.04 : 0), y: py + 0.16, z: pz + (k === 1 ? 0.18 : 0), sx: 0.18, sy: 0.1, sz: 0.18 });
    }
    if (r(2) < 0.35) gull(B, cx - 0.38, y + 0.73, cz - 0.15, 1.1, r(3) * 6);
  },
};
