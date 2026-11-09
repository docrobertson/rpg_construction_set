// Puzzle pieces, in the painted-toy style of the points of interest: a lever
// in its stone housing, a pressure plate, a big mossy boulder, gates (a
// portcullis, iron bars, a stone slab), a great carved face and a sphinx
// that ask riddles, rune tiles with eight glyphs, a brazier, and the marker
// the editor shows for an invisible trigger. Each model stands on one square.
//
// The moving part of a lever, a plate or a gate is a little model of its own
// (spec.part), hung on the base and tweened, so a portcullis rises and a lever
// swings rather than snapping from one look to another (showPuzzle /
// animatePuzzle). A brazier's flames turn slowly (the view's spinners), so the
// faceted fire shimmers. Built without a part, each draws whole.
import * as THREE from 'three';
import { GeoBuilder, TPL } from './builder.js';
import { tube, lathe, ball, mat, tint, deep, blend } from './sculpt.js';
import { makeModel } from './models.js';
import { BattleFx } from './fx.js';
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';

const STONE = 0xb4ac9c, DSTONE = 0x8a8478, MOSS = 0x6a9a3a, IRON = 0x4a4c52, WOOD = 0x8a5a30, GOLD = 0xe2b24a, BRONZE = 0xb8803a;
const EMBER = 0xff7020;

function builders() {
  const B = new GeoBuilder(), G = new GeoBuilder();
  B.detail = new GeoBuilder();
  return { B, G };
}
// record metal so the shader paints a glint on it
function MT(B, fn) {
  const a = B.count, d = B.detail ? B.detail.count : 0;
  fn();
  (B.metal ||= []).push([a, B.count]);
  if (B.detail) (B.detail.metal ||= []).push([d, B.detail.count]);
}
const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
const ID = new THREE.Matrix4();

function pebbles(B, n, r, col = DSTONE, seed = 1) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const d = r * (0.9 + 0.2 * Math.sin(k * 7.1 + seed));
    B.shape(TPL.dodec, k % 2 ? col : deep(col, 0.85), { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, sx: 0.07 + (k % 3) * 0.015, sy: 0.05, sz: 0.06, ry: k, flat: true });
  }
}

// a flat stroke on a surface (glyph lines, cracks): a thin box from a to b in
// the x/z plane at height y
function stroke(B, col, a, b, y, w = 0.03, h = 0.012, m = ID) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  B.shape(TPL.box, col, { matrix: m, x: (a[0] + b[0]) / 2, y, z: (a[1] + b[1]) / 2, sx: len + w * 0.6, sy: h, sz: w, ry: -Math.atan2(dz, dx) });
}
function polyline(B, col, pts, y, w, h, m, closed = false) {
  for (let i = 0; i < pts.length - 1; i++) stroke(B, col, pts[i], pts[i + 1], y, w, h, m);
  if (closed) stroke(B, col, pts[pts.length - 1], pts[0], y, w, h, m);
}
const arc = (cx, cz, r, a0, a1, n = 8, sx = 1) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r * sx, cz + Math.sin(a) * r]; });

// ------------------------------------------------------------ lever
// A stone housing with an iron face plate; the handle swings forward (on)
// or stands back (off) on its pivot.
const LEVER_PIVOT = [0, 0.46, 0.02];
const leverAngle = (on) => (on ? 1.0 : -0.62);
function leverHandle(B, m) {
  MT(B, () => {
    tube(B, [[0, 0, 0], [0, 0.36, 0]], [0.026, 0.022], [deep(IRON, 0.8), IRON], { segs: 7, matrix: m });
    ball(B, tint(IRON, 1.2), 0, 0, 0, 0.048, 0.048, 0.048, { matrix: m });
  });
  // a leather-wrapped grip and a red-painted knob
  tube(B, [[0, 0.24, 0], [0, 0.36, 0]], 0.036, [0x5a3a22, 0x7a5032], { segs: 7, matrix: m });
  for (const y of [0.26, 0.3, 0.34]) tube(B.detail, [[0, y, 0], [0, y + 0.008, 0]], 0.038, 0x3a2414, { segs: 7, matrix: m, cap: false });
  ball(B, 0xd0442c, 0, 0.41, 0, 0.068, 0.062, 0.068, { matrix: m });
  ball(B.detail, 0xffc0b0, -0.022, 0.435, 0.04, 0.016, 0.012, 0.012, { matrix: m });
}
function lever(spec) {
  const { B, G } = builders();
  if (spec.part === 'handle') { leverHandle(B, ID); return { B, G, height: 0.48, noLean: true }; }
  const st = spec.color ?? STONE;
  // the housing: a squat dressed block on a footing
  lathe(B, [[0.34, 0], [0.34, 0.05], [0.29, 0.065], [0.26, 0.35], [0.3, 0.37], [0.3, 0.43], [0.25, 0.44]], [deep(st, 0.7), st, tint(st, 1.1)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, sq: 0.8 });
  // mortar lines, and moss on its shoulders
  for (const y of [0.15, 0.26]) B.detail.box(deep(st, 0.55), { y, z: 0.15, sx: 0.36, sy: 0.008, sz: 0.004 });
  B.detail.box(deep(st, 0.55), { x: 0.05, y: 0.15, z: 0.15, sx: 0.008, sy: 0.11, sz: 0.004 });
  ball(B, MOSS, -0.17, 0.43, -0.1, 0.08, 0.025, 0.07);
  ball(B, deep(MOSS, 0.8), 0.2, 0.05, 0.14, 0.07, 0.035, 0.06);
  // the iron face plate with its slot, riveted
  MT(B, () => {
    B.box(IRON, { y: 0.17, z: 0.155, sx: 0.24, sy: 0.24, sz: 0.022 });
    for (const [x, y] of [[-0.095, 0.19], [0.095, 0.19], [-0.095, 0.39], [0.095, 0.39]]) ball(B, tint(IRON, 1.3), x, y, 0.17, 0.014);
  });
  B.box(0x1a1614, { y: 0.22, z: 0.168, sx: 0.05, sy: 0.15, sz: 0.006 });
  // the cheeks the handle swings between, and their axle
  MT(B, () => {
    for (const s of [-1, 1]) B.box(deep(IRON, 0.85), { x: s * 0.065, y: 0.4, z: 0.02, sx: 0.035, sy: 0.11, sz: 0.12 });
    tube(B, [[-0.09, LEVER_PIVOT[1], LEVER_PIVOT[2]], [0.09, LEVER_PIVOT[1], LEVER_PIVOT[2]]], 0.02, tint(IRON, 1.15), { segs: 8 });
  });
  // painted marks: down is "on"
  B.detail.box(0xd8b048, { x: -0.135, y: 0.4, z: 0.15, sx: 0.05, sy: 0.014, sz: 0.004, rz: 0.4 });
  B.detail.box(0xd8b048, { x: 0.135, y: 0.4, z: 0.15, sx: 0.05, sy: 0.014, sz: 0.004, rz: -0.4 });
  // a chain running back into the floor (to whatever it works)
  for (let k = 0; k < 5; k++) MT(B, () => B.shape(TPL.torus, deep(IRON, 0.9), { x: 0, y: 0.05 + k * 0.05, z: -0.2 - k * 0.012, s: 0.055, ry: k % 2 ? Math.PI / 2 : 0 }));
  if (!spec.part) leverHandle(B, mul(mat(...LEVER_PIVOT), mat(0, 0, 0, leverAngle(spec.on))));
  pebbles(B, 4, 0.36, DSTONE, 0.4);
  return { B, G, height: 0.75, noLean: true };
}

// ------------------------------------------------------------ pressure plate
// A sandstone flag set in a frame of darker stones, a bronze ring inlaid in
// it and a footprint carved in the middle: plainly something to stand on.
const PLATE_DOWN = -0.04;
function plateStone(B, G, m, down) {
  const st = 0xcbb68c;
  lathe(B, [[0.42, -0.03], [0.42, 0.035], [0.4, 0.055], [0.002, 0.055]], [deep(st, 0.7), st, tint(st, 1.08)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, matrix: m });
  MT(B, () => {
    B.shape(TPL.torus, BRONZE, { matrix: m, y: 0.056, s: 0.5, sz: 0.5, sy: 0.5, rx: Math.PI / 2 });
    for (const [x, z] of [[-0.23, -0.23], [0.23, -0.23], [-0.23, 0.23], [0.23, 0.23]]) ball(B.detail, tint(BRONZE, 1.15), x, 0.057, z, 0.02, 0.01, 0.02, { matrix: m });
  });
  // a bare footprint: sole, heel and five toes
  const foot = (x, z, f) => {
    ball(B.detail, deep(st, 0.45), x, 0.056, z, 0.04, 0.004, 0.07, { matrix: m });
    ball(B.detail, deep(st, 0.45), x + f * 0.005, 0.056, z + 0.075, 0.032, 0.004, 0.03, { matrix: m });
    for (let k = 0; k < 5; k++) ball(B.detail, deep(st, 0.45), x - f * 0.03 + f * k * 0.016, 0.056, z - 0.085 + Math.abs(k - 1) * 0.006, 0.009 - k * 0.0008, 0.004, 0.011, { matrix: m });
  };
  foot(-0.045, 0.01, 1);
  foot(0.05, -0.02, -1);
  B.detail.box(deep(st, 0.6), { matrix: m, x: 0.12, y: 0.055, z: 0.16, sx: 0.09, sy: 0.003, sz: 0.006, ry: 0.6 });
  if (down) polyline(G, 0xffc860, arc(0, 0, 0.2, 0, Math.PI * 2, 20), 0.06, 0.016, 0.006, m);
}
function plate(spec) {
  const { B, G } = builders();
  if (spec.part === 'stone') { plateStone(B, G, ID, spec.down); return { B, G, height: 0.1, noLean: true, ao: false }; }
  // a frame of darker stones the flag rocks in, and the dark gap round it
  const fr = 0x8e8678;
  for (let k = 0; k < 4; k++) {
    const m = mat(0, 0, 0, 0, (k * Math.PI) / 2, 0);
    B.shape(TPL.box, k % 2 ? fr : deep(fr, 0.92), { matrix: m, z: 0.34, sx: 0.76, sy: 0.026, sz: 0.07, flat: true });
    B.shape(TPL.dodec, deep(fr, 0.85), { matrix: m, x: 0.34, y: 0.01, z: 0.34, s: 0.08, flat: true });
  }
  B.detail.box(0x1e1a16, { y: 0.004, sx: 0.66, sy: 0.006, sz: 0.66 });
  if (!spec.part) plateStone(B, G, mat(0, spec.down ? PLATE_DOWN : 0, 0), spec.down);
  return { B, G, height: 0.1, noLean: true, ao: false };
}

// ------------------------------------------------------------ boulder
// Big, round and heavy, with moss on its crown and lichen in its pits.
function boulder(spec) {
  const { B, G } = builders();
  const k = spec.seed ?? 0;
  const st = spec.color ?? blend(0xa29c90, 0x948e80, (k % 3) / 3);
  const R = 0.38, cy = R * 0.92;
  // a round core, its silhouette broken by a few big flat-faced lumps
  B.shape(TPL.sphere, st, { y: cy, sx: R * 2, sy: R * 1.86, sz: R * 2, ry: k, grad: 0.35 });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + k * 0.7, el = -0.5 + ((i * 0.37 + k * 0.13) % 1) * 1.3;
    const r = R * (0.5 + 0.1 * Math.sin(i * 3.1 + k));
    const d = R * 0.62;
    B.shape(TPL.dodec, i % 3 ? st : tint(st, 1.07), { x: Math.cos(a) * Math.cos(el) * d, y: cy + Math.sin(el) * d * 0.95, z: Math.sin(a) * Math.cos(el) * d, s: r * 1.25, ry: i * 1.3, rx: i * 0.7, flat: true });
  }
  // moss on its crown, creeping down the back
  ball(B, MOSS, -0.04, cy + R * 0.8, -0.06, R * 0.58, R * 0.24, R * 0.5);
  ball(B, tint(MOSS, 1.12), -0.16, cy + R * 0.62, 0.05, R * 0.3, R * 0.16, R * 0.28);
  ball(B, deep(MOSS, 0.85), 0.12, cy + R * 0.5, -0.22, R * 0.36, R * 0.22, R * 0.28);
  // lichen spots and a crack across its face
  for (const [x, y, z] of [[0.22, cy - 0.02, 0.27], [-0.27, cy + 0.06, 0.2], [0.08, cy - 0.17, 0.34]]) ball(B.detail, 0xdad296, x, y, z, 0.035, 0.03, 0.012);
  polyline(B.detail, deep(st, 0.42), [[-0.08, 0], [0.0, 0.07], [-0.03, 0.14], [0.06, 0.22]], 0, 0.014, 0.014, mat(0.02, cy - 0.16, R * 0.97, -Math.PI / 2 + 0.2));
  pebbles(B, 4, R * 1.2, DSTONE, k);
  return { B, G, height: R * 1.9, noLean: true, ao: 0.3 };
}

// ------------------------------------------------------------ gates
// A stone frame (two pillars and a lintel) round a portcullis, iron bars or
// a stone slab. A portcullis hangs from the lintel and draws up into it (its
// part shrinks upward); bars and slabs sink into the floor.
const GATE_TOP = 0.98;
function gateFrame(B, G, style) {
  const st = style === 'stone' ? 0xa8a090 : STONE;
  for (const s of [-1, 1]) {
    lathe(B, [[0.1, 0], [0.1, 0.06], [0.085, 0.07], [0.08, 0.9], [0.095, 0.92], [0.095, 0.97]], [deep(st, 0.65), st, tint(st, 1.08)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, dx: () => s * 0.45, sq: 1.2 });
    for (const y of [0.25, 0.5, 0.75]) B.detail.box(deep(st, 0.55), { x: s * 0.45, y, z: 0.098, sx: 0.16, sy: 0.008, sz: 0.004 });
    ball(B, MOSS, s * 0.47, 0.06, 0.08, 0.06, 0.03, 0.05);
  }
  // the lintel, with a keystone and (for a slab) a carved sun
  B.box(deep(st, 0.9), { y: GATE_TOP, sx: 1.08, sy: 0.16, sz: 0.24, grad: 0.3 });
  B.box(tint(st, 1.1), { y: GATE_TOP + 0.02, z: 0.0, sx: 0.16, sy: 0.18, sz: 0.27 });
  B.detail.box(deep(st, 0.5), { y: GATE_TOP + 0.075, z: 0.122, sx: 0.9, sy: 0.006, sz: 0.004 });
  if (style === 'portcullis') {
    // the slot it draws up into, and its chains
    B.box(0x1a1614, { y: GATE_TOP - 0.004, sx: 0.82, sy: 0.01, sz: 0.06 });
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) MT(B, () => B.shape(TPL.torus, IRON, { x: s * 0.3, y: GATE_TOP + 0.18 + k * 0.04, z: -0.03, s: 0.045, ry: k ? Math.PI / 2 : 0 }));
  }
  if (style === 'stone') {
    // the groove the slab sinks into
    B.box(0x1a1614, { y: 0.004, sx: 0.8, sy: 0.006, sz: 0.1 });
  }
  pebbles(B, 3, 0.55, DSTONE, 0.2);
}
function gateLeaf(B, G, style, m) {
  if (style === 'portcullis') {
    // hung from the top: bars hang down from y = 0 to -0.86
    MT(B, () => {
      for (let i = 0; i < 6; i++) {
        const x = -0.33 + i * 0.132;
        tube(B, [[x, 0, 0], [x, -0.8, 0]], 0.022, [IRON, deep(IRON, 0.8)], { segs: 6, matrix: m, cap: false });
        B.shape(TPL.cone4, deep(IRON, 0.75), { matrix: m, x, y: -0.86, sx: 0.04, sy: 0.08, sz: 0.04, rx: Math.PI });
      }
      for (const y of [-0.1, -0.38, -0.66]) B.shape(TPL.box, tint(IRON, 1.05), { matrix: m, y: y - 0.02, sx: 0.76, sy: 0.04, sz: 0.035 });
      for (let i = 0; i < 6; i++) for (const y of [-0.1, -0.38, -0.66]) ball(B.detail, tint(IRON, 1.4), -0.33 + i * 0.132, y, 0.02, 0.012, 0.012, 0.008, { matrix: m });
    });
  } else if (style === 'bars') {
    // thick bars set in a stone sill, rising from the floor
    MT(B, () => {
      for (let i = 0; i < 5; i++) {
        const x = -0.3 + i * 0.15;
        tube(B, [[x, 0, 0], [x, 0.86, 0]], 0.028, [deep(IRON, 0.7), tint(IRON, 1.1)], { segs: 7, matrix: m });
        ball(B, GOLD, x, 0.88, 0, 0.034, 0.03, 0.034, { matrix: m });
      }
      B.shape(TPL.box, IRON, { matrix: m, y: 0.5, sx: 0.72, sy: 0.04, sz: 0.04 });
      B.shape(TPL.box, IRON, { matrix: m, y: 0.16, sx: 0.72, sy: 0.04, sz: 0.04 });
    });
  } else {
    // a dressed slab, a carved eye in a ring on its face
    const st = 0x9a9284;
    B.shape(TPL.box, st, { matrix: m, sx: 0.78, sy: 0.88, sz: 0.14, grad: 0.35 });
    B.shape(TPL.box, tint(st, 1.08), { matrix: m, y: 0.86, sx: 0.8, sy: 0.04, sz: 0.16 });
    const face = mul(m, mat(0, 0.47, 0.072, Math.PI / 2));
    polyline(B.detail, deep(st, 0.45), arc(0, 0, 0.2, 0, Math.PI * 2, 18), 0, 0.025, 0.006, face);
    polyline(B.detail, deep(st, 0.45), [...arc(0, 0.12, 0.17, -Math.PI * 0.82, -Math.PI * 0.18, 6), ...arc(0, -0.12, 0.17, Math.PI * 0.18, Math.PI * 0.82, 6)], 0, 0.02, 0.006, face);
    G.shape(TPL.sphereLo, 0x9af0ff, { matrix: mul(m, mat(0, 0.47, 0.075)), sx: 0.06, sy: 0.06, sz: 0.02 });
    for (const y of [0.22, 0.72]) B.detail.shape(TPL.box, deep(st, 0.6), { matrix: m, y, z: 0.071, sx: 0.7, sy: 0.006, sz: 0.004 });
    ball(B, MOSS, -0.3, 0.05, 0.07, 0.08, 0.04, 0.03, { matrix: m });
  }
}
// how far the moving part goes: portcullis shrinks up, the others sink
export const GATE_OPEN = { portcullis: { sy: 0.1 }, bars: { y: -0.95 }, stone: { y: -0.95 } };
function gate(spec) {
  const { B, G } = builders();
  const style = GATE_OPEN[spec.style] ? spec.style : 'portcullis';
  if (spec.part === 'leaf') { gateLeaf(B, G, style, ID); return { B, G, height: 0.9, noLean: true }; }
  gateFrame(B, G, style);
  if (!spec.part) {
    const o = spec.open ? GATE_OPEN[style] : {};
    if (style === 'portcullis') gateLeaf(B, G, style, mat(0, GATE_TOP, 0, 0, 0, 0, [1, o.sy ?? 1, 1]));
    else if (!spec.open) gateLeaf(B, G, style, ID);
  }
  return { B, G, height: 1.15, noLean: true };
}

// ------------------------------------------------------------ riddles
// A great stone face set in a slab of wall, its eyes glowing (gold once
// answered); a sphinx couched on a plinth; a carved door.
function stoneFace(B, G, m, glow, st) {
  const M = (x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) => mul(m, mat(x, y, z, rx, ry, rz, sc));
  const hi = tint(st, 1.1), lo = deep(st, 0.82), dark = 0x1e1814;
  // the head in deep relief, a circlet across the brow
  ball(B, st, 0, 0.36, 0, 0.29, 0.37, 0.12, { matrix: m });
  tube(B, [[-0.27, 0.6, 0.04], [0, 0.63, 0.1], [0.27, 0.6, 0.04]], 0.035, lo, { segs: 6, matrix: m });
  G.shape(TPL.ico0, glow, { matrix: M(0, 0.63, 0.135), s: 0.05 });
  // a heavy brow over glowing eyes
  tube(B, [[-0.24, 0.49, 0.08], [-0.1, 0.5, 0.13], [0, 0.48, 0.14], [0.1, 0.5, 0.13], [0.24, 0.49, 0.08]], [0.03, 0.045, 0.04, 0.045, 0.03], hi, { segs: 6, matrix: m });
  for (const sd of [-1, 1]) {
    ball(B, dark, sd * 0.11, 0.42, 0.1, 0.07, 0.045, 0.035, { matrix: m });
    G.shape(TPL.sphere, glow, { matrix: M(sd * 0.11, 0.42, 0.125), sx: 0.1, sy: 0.055, sz: 0.03 });
    G.shape(TPL.sphereLo, 0xffffff, { matrix: M(sd * 0.11, 0.425, 0.14), sx: 0.035, sy: 0.022, sz: 0.01 });
    // cheeks and ears
    ball(B, st, sd * 0.16, 0.29, 0.08, 0.085, 0.075, 0.06, { matrix: m });
    ball(B, lo, sd * 0.3, 0.4, 0.0, 0.045, 0.1, 0.05, { matrix: m });
    // a curling moustache
    tube(B, [[sd * 0.02, 0.235, 0.15], [sd * 0.12, 0.215, 0.13], [sd * 0.2, 0.16, 0.09], [sd * 0.19, 0.11, 0.08]], [0.03, 0.034, 0.024, 0.014], hi, { segs: 6, matrix: m });
  }
  // a broad nose
  B.shape(TPL.cone4, st, { matrix: M(0, 0.25, 0.1, 0.12), sx: 0.11, sy: 0.2, sz: 0.09 });
  ball(B, hi, 0, 0.265, 0.155, 0.055, 0.045, 0.045, { matrix: m });
  for (const sd of [-1, 1]) ball(B.detail, dark, sd * 0.03, 0.245, 0.17, 0.014, 0.01, 0.01, { matrix: m });
  // the mouth, round and open: it speaks
  ball(B, lo, 0, 0.165, 0.12, 0.075, 0.05, 0.03, { matrix: m });
  ball(B, dark, 0, 0.168, 0.14, 0.05, 0.032, 0.02, { matrix: m });
  // a great rounded beard, combed in waves
  ball(B, st, 0, 0.06, 0.06, 0.24, 0.13, 0.09, { matrix: m });
  for (let i = 0; i < 5; i++) {
    const x = -0.14 + i * 0.07;
    polyline(B.detail, lo, [[x, 0.13], [x + 0.015, 0.09], [x - 0.01, 0.05], [x + 0.008, 0.0]], 0, 0.012, 0.012, M(0, 0, 0.145 - Math.abs(x) * 0.25, -Math.PI / 2));
  }
  // a crack across one cheek
  polyline(B.detail, deep(st, 0.4), [[0.2, 0.0], [0.23, 0.07], [0.2, 0.14], [0.25, 0.22]], 0, 0.012, 0.012, M(0, 0.2, 0.105, -Math.PI / 2));
}
function riddleFace(B, G, spec) {
  const st = spec.color ?? 0xb0a694;
  const glow = spec.solved ? 0xffe070 : 0xff8a30;
  // the slab of wall the face is cut in, set against the back of its square,
  // with a carved border and a crown of masonry
  const z0 = -0.34;
  B.box(deep(st, 0.8), { z: z0, sx: 1.0, sy: 1.08, sz: 0.24, grad: 0.35 });
  B.box(deep(st, 0.7), { y: 1.06, z: z0, sx: 1.06, sy: 0.08, sz: 0.28 });
  for (const sd of [-1, 1]) B.box(deep(st, 0.9), { x: sd * 0.44, z: z0 + 0.03, sx: 0.12, sy: 1.06, sz: 0.24 });
  for (const y of [0.32, 0.7]) for (const sd of [-1, 1]) B.detail.box(deep(st, 0.5), { x: sd * 0.44, y, z: z0 + 0.151, sx: 0.12, sy: 0.008, sz: 0.004 });
  // the face, tipped up a little towards those who stand before it
  stoneFace(B, G, mat(0, 0.18, z0 + 0.13, -0.28, 0, 0, 1.25), glow, st);
  ball(B, MOSS, -0.42, 1.1, z0 + 0.05, 0.12, 0.04, 0.1);
  ball(B, deep(MOSS, 0.85), 0.44, 0.05, z0 + 0.16, 0.1, 0.05, 0.06);
  ball(B, tint(MOSS, 1.1), 0.36, 0.86, z0 + 0.15, 0.06, 0.08, 0.03);
  // offerings at its foot: a candle stub and a bowl
  tube(B, [[0.3, 0, 0.05], [0.3, 0.08, 0.05]], 0.022, 0xf0e6d0, { segs: 6 });
  G.shape(TPL.ico0, 0xffd060, { x: 0.3, y: 0.1, z: 0.05, s: 0.035 });
  lathe(B, [[0.002, 0], [0.06, 0.01], [0.075, 0.045]], [deep(BRONZE, 0.7), BRONZE], { segs: 10, dx: () => -0.3, matrix: mat(0, 0, 0.05) });
  pebbles(B, 3, 0.42, DSTONE, 2);
}
function sphinx(B, G, spec) {
  const st = spec.color ?? 0xd8c090;
  const glow = spec.solved ? 0xffd860 : 0x80e0ff;
  // a plinth with a band of carving
  B.box(deep(0xb8a888, 0.85), { z: -0.05, sx: 0.66, sy: 0.16, sz: 0.86, grad: 0.3 });
  B.detail.box(deep(0xb8a888, 0.55), { y: 0.08, z: 0.38, sx: 0.6, sy: 0.01, sz: 0.004 });
  const y0 = 0.16;
  // couched body and haunches, forepaws out front
  tube(B, [[0, y0 + 0.13, -0.3], [0, y0 + 0.14, -0.05], [0, y0 + 0.17, 0.12]], [0.15, 0.16, 0.14], [deep(st, 0.85), st], { segs: 10, sq: 0.85 });
  for (const s of [-1, 1]) {
    ball(B, st, s * 0.12, y0 + 0.1, -0.26, 0.09, 0.1, 0.13);
    tube(B, [[s * 0.1, y0 + 0.05, 0.08], [s * 0.1, y0 + 0.04, 0.32]], [0.05, 0.045], st, { segs: 7 });
    ball(B, tint(st, 1.05), s * 0.1, y0 + 0.035, 0.34, 0.05, 0.035, 0.05);
  }
  tube(B, [[0.12, y0 + 0.06, -0.38], [0.22, y0 + 0.03, -0.3], [0.24, y0 + 0.02, -0.1]], [0.025, 0.02, 0.015], st, { segs: 6 });
  // the head in its striped headcloth
  const hy = y0 + 0.42, hz = 0.16;
  ball(B, tint(st, 1.05), 0, hy, hz, 0.1, 0.12, 0.1);
  ball(B, deep(st, 0.9), 0, hy - 0.08, hz + 0.05, 0.06, 0.04, 0.05);
  B.shape(TPL.cone4, tint(st, 1.1), { x: 0, y: hy - 0.04, z: hz + 0.09, sx: 0.04, sy: 0.07, sz: 0.04, rx: -0.3 });
  for (const s of [-1, 1]) {
    ball(B, 0x1a1412, s * 0.04, hy + 0.02, hz + 0.085, 0.022, 0.014, 0.012);
    G.shape(TPL.sphereLo, glow, { x: s * 0.04, y: hy + 0.02, z: hz + 0.095, sx: 0.03, sy: 0.018, sz: 0.01 });
    // lappets of the headcloth down to the chest
    tube(B, [[s * 0.1, hy + 0.04, hz - 0.02], [s * 0.13, hy - 0.08, hz + 0.0], [s * 0.11, hy - 0.2, hz + 0.02]], [0.05, 0.055, 0.04], (t) => (Math.floor(t * 6) % 2 ? 0x2a5aa0 : GOLD), { segs: 6, sq: 0.5 });
  }
  lathe(B, [[0.12, hy - 0.02], [0.13, hy + 0.08], [0.1, hy + 0.15], [0.02, hy + 0.17]], (t) => (Math.floor(t * 5) % 2 ? 0x2a5aa0 : GOLD), { segs: 10, sq: 0.9, matrix: mat(0, 0, hz - 0.075) }); // (set back: the face looks out of it)
  ball(B, GOLD, 0, hy + 0.15, hz + 0.02, 0.028);
  // a beard plaited and capped in gold
  tube(B, [[0, hy - 0.12, hz + 0.07], [0, hy - 0.22, hz + 0.08]], [0.022, 0.018], [st, GOLD], { segs: 6 });
  pebbles(B, 3, 0.48, DSTONE, 1.3);
}
function riddleDoor(B, G, spec) {
  const st = spec.color ?? 0x9a9284;
  const glow = spec.solved ? 0xffd860 : 0xb080ff;
  const z0 = -0.3;
  for (const s of [-1, 1]) B.box(deep(st, 0.8), { x: s * 0.44, z: z0, sx: 0.14, sy: 1.0, sz: 0.3, grad: 0.3 });
  B.box(deep(st, 0.75), { y: 0.96, z: z0, sx: 1.04, sy: 0.14, sz: 0.32 });
  // the door: two leaves of dressed stone, a face in a ring across the seam
  B.box(st, { z: z0 + 0.04, sx: 0.74, sy: 0.96, sz: 0.12, grad: 0.35 });
  B.detail.box(0x1a1614, { z: z0 + 0.101, sx: 0.008, sy: 0.92, sz: 0.004 });
  const face = mat(0, 0.5, z0 + 0.105, Math.PI / 2);
  polyline(B.detail, deep(st, 0.45), arc(0, 0, 0.22, 0, Math.PI * 2, 18), 0, 0.03, 0.006, face);
  for (const s of [-1, 1]) G.shape(TPL.sphereLo, glow, { x: s * 0.07, y: 0.56, z: z0 + 0.105, sx: 0.05, sy: 0.03, sz: 0.012 });
  ball(B, deep(st, 0.8), 0, 0.42, z0 + 0.11, 0.08, 0.03, 0.02);
  for (const x of [-0.25, 0.25]) for (const y of [0.18, 0.82]) ball(B.detail, BRONZE, x, y, z0 + 0.103, 0.025, 0.025, 0.01);
  pebbles(B, 3, 0.45, DSTONE, 0.6);
}
function riddle(spec) {
  const { B, G } = builders();
  const look = spec.look || 'face';
  if (look === 'sphinx') sphinx(B, G, spec);
  else if (look === 'door') riddleDoor(B, G, spec);
  else riddleFace(B, G, spec);
  return { B, G, height: look === 'sphinx' ? 0.8 : 1.1, noLean: true };
}

// ------------------------------------------------------------ runes
// A flagstone with a glyph cut deep in it, dim until stepped on; each glyph
// burns in its own colour when lit.
export const GLYPH_COLORS = { sun: 0xffc840, moon: 0xb8d4ff, star: 0xe8d0ff, wave: 0x60e8ff, flame: 0xff8a30, leaf: 0x80f070, eye: 0xd080ff, crown: 0xffe070 };
function glyphStrokes(g) {
  const r = 0.2;
  switch (g) {
    case 'sun': {
      const out = [arc(0, 0, r * 0.45, 0, Math.PI * 2, 12)];
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; out.push([[Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66], [Math.cos(a) * r, Math.sin(a) * r]]); }
      return out;
    }
    case 'moon': return [[...arc(0, 0, r, Math.PI * 0.55, Math.PI * 1.45, 10), ...arc(r * 0.42, 0, r * 0.8, Math.PI * 1.36, Math.PI * 0.64, 10)]];
    case 'star': return [Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.42 : r; return [Math.cos(a) * rr, Math.sin(a) * rr]; })];
    case 'wave': return [-0.1, 0, 0.1].map((z) => Array.from({ length: 9 }, (_, i) => [-r + (i * r * 2) / 8, z + Math.sin(i * 0.9) * 0.04]));
    case 'flame': return [[[0, -r], [r * 0.45, -r * 0.1], [r * 0.5, r * 0.4], [0, r], [-r * 0.5, r * 0.4], [-r * 0.45, -r * 0.1], [0, -r]], [[0, -r * 0.1], [r * 0.2, r * 0.35], [0, r * 0.6], [-r * 0.2, r * 0.35], [0, -r * 0.1]]];
    case 'leaf': {
      const out = [[...arc(0, r * 0.62, r * 1.18, -Math.PI * 0.82, -Math.PI * 0.18, 8)], [...arc(0, -r * 0.62, r * 1.18, Math.PI * 0.18, Math.PI * 0.82, 8)], [[-r, 0], [r, 0]]];
      for (const x of [-0.08, 0, 0.08]) out.push([[x, 0], [x + 0.06, -0.07]], [[x, 0], [x + 0.06, 0.07]]);
      return out;
    }
    case 'eye': return [[...arc(0, r * 0.7, r * 1.1, -Math.PI * 0.78, -Math.PI * 0.22, 8)], [...arc(0, -r * 0.7, r * 1.1, Math.PI * 0.22, Math.PI * 0.78, 8)], arc(0, 0, r * 0.28, 0, Math.PI * 2, 10)];
    case 'crown': default: return [[[-r, r * 0.6], [-r, -r * 0.4], [-r * 0.5, r * 0.1], [0, -r * 0.7], [r * 0.5, r * 0.1], [r, -r * 0.4], [r, r * 0.6], [-r, r * 0.6]], [[-r, r * 0.3], [r, r * 0.3]]];
  }
}
function rune(spec) {
  const { B, G } = builders();
  const g = spec.glyph || 'sun';
  const col = GLYPH_COLORS[g] || 0x8af0ff;
  const st = 0x8e8678;
  lathe(B, [[0.32, -0.02], [0.32, 0.025], [0.3, 0.04], [0.002, 0.04]], [deep(st, 0.7), st, tint(st, 1.06)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, sq: 1 });
  // a ring cut round the glyph, and the glyph itself
  const strokes = glyphStrokes(g);
  const fl = mat(0, 0, 0, 0, 0, 0);
  polyline(B.detail, deep(st, 0.5), arc(0, 0, 0.27, 0, Math.PI * 2, 20), 0.041, 0.016, 0.003, fl);
  for (const s of strokes) polyline(B.detail, 0x1e1a18, s, 0.041, 0.036, 0.003, fl);
  if (spec.lit) {
    for (const s of strokes) polyline(G, col, s, 0.045, 0.026, 0.004, fl);
    polyline(G, blend(col, 0xffffff, 0.2), arc(0, 0, 0.27, 0, Math.PI * 2, 20), 0.043, 0.01, 0.003, fl);
    G.shape(TPL.sphereLo, blend(col, 0x000000, 0.55), { y: 0.03, sx: 0.5, sy: 0.02, sz: 0.5 });
  } else {
    // a faint ember of light in the cut: it is not dead, only sleeping
    for (const s of strokes) polyline(G, blend(col, 0x000000, 0.82), s, 0.043, 0.014, 0.003, fl);
  }
  // corner chips and a sprig of moss in a crack
  ball(B.detail, deep(MOSS, 0.9), -0.24, 0.041, 0.26, 0.04, 0.008, 0.02);
  return { B, G, height: 0.06, noLean: true, ao: false };
}

// ------------------------------------------------------------ brazier
// An iron bowl on three legs, full of coals: cold and grey, or burning.
function brazierFlame(G) {
  // tongues of flame round a hot core, leaning out a little (they turn
  // slowly as a part of their own, so the faceted fire seems to dance)
  G.shape(TPL.cone5, 0xff4a10, { y: 0.0, sx: 0.3, sy: 0.4, sz: 0.3 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    G.shape(TPL.cone4, k % 2 ? 0xff7a18 : 0xffa030, { x: Math.cos(a) * 0.1, y: 0.0, z: Math.sin(a) * 0.1, sx: 0.1, sy: 0.3 + (k % 3) * 0.08, sz: 0.1, ry: k, rz: Math.cos(a) * -0.25, rx: Math.sin(a) * 0.25 });
  }
  G.shape(TPL.cone5, 0xffb030, { y: 0.01, sx: 0.18, sy: 0.5, sz: 0.18, ry: 0.6 });
  G.shape(TPL.cone5, 0xfff0a0, { y: 0.02, sx: 0.09, sy: 0.3, sz: 0.09, ry: 0.3 });
  for (let k = 0; k < 3; k++) G.shape(TPL.ico0, 0xffd060, { x: Math.cos(k * 2.3) * 0.12, y: 0.5 + k * 0.08, z: Math.sin(k * 2.3) * 0.12, s: 0.03 });
}
export const BRAZIER_BOWL = 0.5;
function brazier(spec) {
  const { B, G } = builders();
  if (spec.part === 'flame') { brazierFlame(G); return { B, G, height: 0.45, noLean: true }; }
  const y = BRAZIER_BOWL;
  // a round stone footing and three curling iron legs
  lathe(B, [[0.2, 0], [0.21, 0.04], [0.18, 0.06], [0.14, 0.07]], [deep(STONE, 0.7), STONE], { segs: 8, rot: Math.PI / 8, keepSegs: true, flat: true });
  MT(B, () => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5, c = Math.cos(a), s = Math.sin(a);
      tube(B, [[c * 0.17, 0.06, s * 0.17], [c * 0.2, 0.18, s * 0.2], [c * 0.11, 0.32, s * 0.11], [c * 0.15, y - 0.04, s * 0.15]], [0.026, 0.02, 0.018, 0.022], [deep(IRON, 0.7), IRON], { segs: 6 });
      ball(B, tint(IRON, 1.2), c * 0.2, 0.18, s * 0.2, 0.03);
    }
    tube(B, [[0, 0.07, 0], [0, y - 0.06, 0]], [0.04, 0.03], IRON, { segs: 8 });
    // the bowl, with a rim and little ring handles
    lathe(B, [[0.04, y - 0.08], [0.17, y - 0.04], [0.23, y + 0.04], [0.25, y + 0.08], [0.23, y + 0.09], [0.2, y + 0.04]], [deep(IRON, 0.8), IRON, tint(IRON, 1.25), deep(IRON, 0.6)], { segs: 12 });
    for (const s of [-1, 1]) B.shape(TPL.torus, tint(IRON, 1.1), { x: s * 0.26, y: y + 0.03, s: 0.07, ry: Math.PI / 2 });
  });
  // the coals: glowing red when lit, grey ash and charred sticks when cold
  if (spec.lit) {
    for (let k = 0; k < 8; k++) { const a = k * 2.4, d = 0.05 + (k % 3) * 0.04; G.shape(TPL.ico0, k % 2 ? 0xff5010 : 0xffa030, { x: Math.cos(a) * d, y: y + 0.06, z: Math.sin(a) * d, s: 0.06 }); }
    if (!spec.part) brazierFlame(withY(G, y + 0.06));
  } else {
    for (let k = 0; k < 9; k++) { const a = k * 2.4, d = 0.04 + (k % 3) * 0.05; B.shape(TPL.dodec, k % 3 ? 0x4a4440 : 0x7a746c, { x: Math.cos(a) * d, y: y + 0.06, z: Math.sin(a) * d, s: 0.06, ry: k, flat: true }); }
    for (const a of [0.3, 1.9]) tube(B, [[Math.cos(a) * -0.12, y + 0.08, Math.sin(a) * -0.12], [Math.cos(a) * 0.12, y + 0.11, Math.sin(a) * 0.12]], 0.02, [0x1a1210, 0x3a2418, 0x1a1210], { segs: 6 });
  }
  pebbles(B, 4, 0.26, DSTONE, 0.9);
  return { B, G, height: 0.9, noLean: true };
}
// a GeoBuilder whose shapes all land y higher (for the flame sat in a bowl)
function withY(G, dy) {
  return { shape: (tpl, col, o) => G.shape(tpl, col, { ...o, y: (o.y || 0) + dy }) };
}

// ------------------------------------------------------------ trigger (editor only)
// A hidden trigger as the editor shows it: a ring of sigils on the floor and
// a floating violet gem.
function trigger(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0xc070ff;
  polyline(G, c, arc(0, 0, 0.32, 0, Math.PI * 2, 20), 0.02, 0.03, 0.006, ID);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; stroke(G, c, [Math.cos(a) * 0.22, Math.sin(a) * 0.22], [Math.cos(a) * 0.3, Math.sin(a) * 0.3], 0.02, 0.025, 0.006); }
  tube(B, [[0, 0, 0], [0, 0.5, 0]], 0.012, 0x5a3a70, { segs: 5 });
  G.shape(TPL.ico0, c, { y: 0.56, sx: 0.12, sy: 0.18, sz: 0.12 });
  G.shape(TPL.ico0, 0xffffff, { y: 0.58, s: 0.05 });
  return { B, G, height: 0.7, noLean: true };
}

export const PUZZLE_BUILDERS = { pz_lever: lever, pz_plate: plate, pz_boulder: boulder, pz_gate: gate, pz_riddle: riddle, pz_rune: rune, pz_brazier: brazier, pz_trigger: trigger };

// ------------------------------------------------------------ on the map
const wallAt = (map, x, y) => !!map && inBounds(map, x, y) && !terrain(getTile(map, x, y)).walk;
const openAt = (map, x, y) => !!map && inBounds(map, x, y) && terrain(getTile(map, x, y)).walk;

// Which way a piece faces: a gate spans its passage, a face or a lever
// stands with its back to the wall, looking out over the floor.
export function puzzleFacing(map, e) {
  if (!map) return [0, 1];
  const { x, y } = e;
  if (e.type === 'gate') {
    // walls east and west: it spans the passage across x (faces south);
    // walls north and south: turned to span it across y
    const ew = wallAt(map, x - 1, y) || wallAt(map, x + 1, y), ns = wallAt(map, x, y - 1) || wallAt(map, x, y + 1);
    return ns && !ew ? [1, 0] : [0, 1];
  }
  if (e.type === 'riddle' || e.type === 'lever') {
    if (e.facing) return { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[e.facing] || [0, 1];
    // back to a wall, facing the open floor; south first (the camera's side)
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (wallAt(map, x - dx, y - dy) && openAt(map, x + dx, y + dy)) return [dx, dy];
  }
  return [0, 1];
}

// the moving part of a piece: { look, at, pose(spec) → { rx?, y?, sy? } }
function partOf(look) {
  switch (look.kind) {
    case 'pz_lever': return { look: { kind: 'pz_lever', part: 'handle' }, at: LEVER_PIVOT, pose: (s) => ({ rx: leverAngle(s.on) }) };
    case 'pz_plate': return { look: { kind: 'pz_plate', part: 'stone', down: !!look.down }, at: [0, 0, 0], pose: (s) => ({ y: s.down ? PLATE_DOWN : 0 }) };
    case 'pz_gate': {
      const style = GATE_OPEN[look.style] ? look.style : 'portcullis';
      return { look: { kind: 'pz_gate', part: 'leaf', style }, at: [0, style === 'portcullis' ? GATE_TOP : 0, 0], pose: (s) => (s.open ? GATE_OPEN[style] : {}) };
    }
    case 'pz_brazier': return look.lit ? { look: { kind: 'pz_brazier', part: 'flame' }, at: [0, BRAZIER_BOWL + 0.06, 0], spin: 1.3 } : null;
    default: return null;
  }
}
function setPose(obj, p) {
  obj.rotation.x = p.rx ?? 0;
  obj.position.y = obj.userData.y0 + (p.y ?? 0);
  obj.scale.y = p.sy ?? 1;
}

// Put a puzzle piece on the map (replacing what stood for it before)
export function showPuzzle(view, e, look, opts = {}) {
  const part = partOf(look);
  const base = part ? { ...look, part: 'base' } : look;
  const ve = view.addEntity(e.id, base, e.x, e.y, { facing: puzzleFacing(view.map, e), poi: true, ring: opts.ring ?? null, idle: true });
  // flat pieces lie on the floor: no shadow blob under them
  if (['pz_plate', 'pz_rune', 'pz_trigger', 'pz_gate'].includes(look.kind)) for (const c of ve.root.children) if (c.geometry?.type === 'CircleGeometry') c.visible = false;
  if (part) {
    const pm = makeModel(part.look, view.mats);
    pm.position.set(...part.at);
    pm.userData.y0 = part.at[1];
    if (part.pose) setPose(pm, part.pose(look));
    ve.model.add(pm);
    ve.pzPart = pm;
    if (part.spin) ve.spin = { part: pm, axis: 'y', speed: part.spin };
  }
  ve.pzLook = look;
  return ve;
}

// Show a piece's new state: a lever swings, a plate sinks, a gate grinds
// open, a boulder rolls; anything else is redrawn. Resolves when done.
export function animatePuzzle(view, e, look, how, opt = {}) {
  const ve = view.entities.get(e.id);
  if (!ve) { showPuzzle(view, e, look); return Promise.resolve(); }
  if (how === 'roll') return rollBoulder(view, ve, e, opt.dx || 0, opt.dy || 0);
  const part = ve.pzPart && partOf(look);
  const same = part && ve.pzLook && ve.pzLook.kind === look.kind && (look.kind !== 'pz_gate' || ve.pzLook.style === look.style) && look.kind !== 'pz_brazier';
  if (!how || !same) { showPuzzle(view, e, look); return Promise.resolve(); }
  const pm = ve.pzPart;
  const from = { rx: pm.rotation.x, y: pm.position.y - pm.userData.y0, sy: pm.scale.y };
  const to = { rx: 0, y: 0, sy: 1, ...part.pose(look) };
  const d = (look.kind === 'pz_gate' ? 0.9 : look.kind === 'pz_plate' ? 0.14 : 0.32) / (view.timeScale || 1);
  ve.pzLook = look;
  return new Promise((res) => view.tween(d, (k) => {
    // a lever slams home; a gate grinds with a little judder
    const s = look.kind === 'pz_lever' ? 1 - Math.pow(1 - k, 3) : k * k * (3 - 2 * k);
    const jit = look.kind === 'pz_gate' && k < 0.95 ? Math.sin(k * 60) * 0.006 : 0;
    setPose(pm, { rx: from.rx + (to.rx - from.rx) * s, y: from.y + (to.y - from.y) * s + jit, sy: from.sy + (to.sy - from.sy) * s });
  }, () => {
    setPose(pm, to);
    // a plate's glow ring when held down
    if (look.kind === 'pz_plate') showPuzzle(view, e, look);
    res();
  }));
}

// a boulder rolls a square: the figure slides while the rock turns right
// over about its middle (a whole turn, so it ends as it began)
const BOULDER_CY = 0.38 * 0.92;
function rollBoulder(view, ve, e, dx, dy) {
  const d = 0.38 / (view.timeScale || 1);
  const m = ve.model, c = BOULDER_CY;
  const p = view.moveEntity(e.id, e.x, e.y, d, 0);
  // (the move turns a figure to face its way: a rock does not turn)
  ve.faceTarget = ve.faceG.rotation.y;
  view.tween(d, (k) => {
    const a = (k * k * (3 - 2 * k)) * Math.PI * 2;
    if (dx) { const t = -dx * a; m.rotation.set(0, 0, t); m.position.set(c * Math.sin(t), c - c * Math.cos(t), 0); }
    else { const t = dy * a; m.rotation.set(t, 0, 0); m.position.set(0, c - c * Math.cos(t), -c * Math.sin(t)); }
  }, () => { m.rotation.set(0, 0, 0); m.position.set(0, 0, 0); });
  return p;
}

// The light of burning braziers, added to the map's light texture (in the
// dark it lights their room; the shader flickers it)
const FIRE_LIGHT = (() => { const c = new THREE.Color(0xffa050); return [c.r, c.g, c.b]; })();
export function setPuzzleLights(view, list) {
  const tv = view.terrain;
  if (!tv) return;
  const had = (tv.puzzleLights || []).length;
  tv.puzzleLights = list.map(([x, z]) => [x, z, 4.2, FIRE_LIGHT, 1]);
  if (had || list.length) tv._buildLightTex?.();
}

// ------------------------------------------------------------ effects
// the little shows a puzzle puts on, built on the battle effects
export function puzzleFx(view) { return new PuzzleFx(view); }
class PuzzleFx extends BattleFx {
  // a gate grinds: dust from the sill, grit falling from the lintel
  grind(x, y, open) {
    this.particles(this.pos(x, y, 0.1), { tex: 'puff', color: 0xc8b898, count: 10, size: 0.5, speed: 0.9, up: 0.5, gravity: 0.3, life: 1.2, additive: false, opacity: 0.7, spread: 0.7, grow: 1.4 });
    if (open) this.particles(this.pos(x, y, 1.0), { tex: 'glow', color: 0xd8c8a0, count: 8, size: 0.06, speed: 0.3, up: 0.1, gravity: -3, life: 0.9, spread: 0.6 });
    this.view.shake?.(0.05, 0.4);
  }
  // a plate goes down: a ring of dust and a warm pulse
  clunk(x, y) {
    this.ring(x, y, 0xffd070, 0.2, 0.6, 0.4, 0.8);
    this.particles(this.pos(x, y, 0.05), { tex: 'puff', color: 0xb8a888, count: 6, size: 0.3, speed: 0.8, up: 0.2, gravity: 0.2, life: 0.6, additive: false, opacity: 0.6 });
  }
  dust(x, y) { this.particles(this.pos(x, y, 0.1), { tex: 'puff', color: 0xb8a888, count: 9, size: 0.45, speed: 0.7, up: 0.3, gravity: 0.2, life: 0.9, additive: false, opacity: 0.65, spread: 0.6, grow: 1.2 }); }
  spark(x, y) { this.particles(this.pos(x, y, 0.45), { tex: 'star', color: 0xffd080, count: 6, size: 0.12, speed: 1.2, up: 1, gravity: -5, life: 0.4 }); }
  // a rune chimes: a ring and a column of its light (n: how far along, 8 = all done)
  chime(x, y, n = 1, big = false) {
    const col = n >= 8 ? 0xfff0a0 : [0x80e8ff, 0x90d8ff, 0xa8c8ff, 0xc0b8ff, 0xd8a8ff, 0xffa8e8, 0xffc8a0, 0xffe890][Math.max(0, n - 1) % 8];
    this.ring(x, y, col, 0.15, big ? 0.9 : 0.55, big ? 0.7 : 0.5, 0.9);
    this.pop(this.pos(x, y, 0.3), 'glow', col, 0.3, big ? 1.6 : 1.0, big ? 0.6 : 0.4);
    this.particles(this.pos(x, y, 0.1), { tex: 'star', color: col, count: big ? 12 : 6, size: 0.1, speed: 0.4, up: 1.6, gravity: 0.5, life: 0.9 });
  }
  fizzle(x, y) {
    this.ring(x, y, 0xff4030, 0.4, 0.15, 0.4, 0.9);
    this.particles(this.pos(x, y, 0.1), { tex: 'puff', color: 0x6a5a5a, count: 5, size: 0.3, speed: 0.3, up: 0.6, gravity: 0.3, life: 0.8, additive: false, opacity: 0.6 });
  }
  ignite(x, y) {
    this.pop(this.pos(x, y, BRAZIER_BOWL + 0.15), 'glow', 0xff9030, 0.4, 1.8, 0.5);
    this.particles(this.pos(x, y, BRAZIER_BOWL + 0.1), { tex: 'glow', color: EMBER, count: 14, size: 0.08, speed: 0.6, up: 2.2, gravity: 0.4, life: 1.0 });
  }
  // a tile rises into place (a bridge plank, a step): dust or spray
  rise(x, y, color) {
    this.particles(this.pos(x, y, 0.0), { tex: 'puff', color, count: 7, size: 0.4, speed: 0.6, up: 0.9, gravity: 0.6, life: 0.8, additive: false, opacity: 0.7, spread: 0.8, grow: 1 });
    this.ring(x, y, color, 0.2, 0.7, 0.5, 0.6);
  }
}

if (typeof window !== 'undefined') window.__pzRender = { showPuzzle, animatePuzzle };
