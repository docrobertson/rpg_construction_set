// Procedural low-poly models for characters, monsters and objects.
// Each model is built into one lit + one glow geometry (cached by spec).
// Models face +Z (towards the camera) with their feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL, shade } from './builder.js';
import { humanoid as figure, RACE_LOOKS, HAIR_STYLES } from './figures.js';
import { WHITE_UV, METAL_UV, SKIN_UV } from './faces.js';
import { quadruped, spider, wraith, bat, serpent, dragon, blob, ent } from './beasts.js';
import { ISLE_BEASTS } from './isleBeasts.js';
import { tube, lathe, sheet, ball, extrude, mat, tint, deep } from './sculpt.js';
import { CONTAINER_BUILDERS } from './containers.js';
import { LANDMARK_BUILDERS } from './landmarks.js';
import { PUZZLE_BUILDERS } from './puzzles.js'; // (puzzles) levers, plates, gates, runes…

const cache = new Map();
// camera distance beyond which figures lose their ink outline
export const OUTLINE_FAR = 30;

export { RACE_LOOKS, HAIR_STYLES };

// --- objects ---
// Points of interest are small painted dioramas: chunky stone, wood and
// iron, with a glow that says "come and look" from across the map.
function builders() {
  const B = new GeoBuilder(), G = new GeoBuilder();
  B.detail = new GeoBuilder();
  return { B, G };
}
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const STONE = 0xb4ac9c, MOSS = 0x6a9a3a, WOODC = 0x8a5a30, IRONC = 0x5a5e66, GOLDC = 0xe2b24a;

// a few rough stones scattered round a base
function pebbles(B, n, r, col, seed = 1) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const d = r * (0.9 + 0.2 * Math.sin(k * 7.1 + seed));
    B.shape(TPL.dodec, k % 2 ? col : deep(col, 0.85), { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, sx: 0.07 + (k % 3) * 0.015, sy: 0.05, sz: 0.06, ry: k, flat: true });
  }
}

function chest(spec) {
  const { B, G } = builders();
  const wood = spec.color ?? 0x8a5a2a;
  const band = spec.band ?? (spec.color === 0x7a3a22 ? IRONC : GOLDC);
  const w = 0.25, d = 0.17, h = 0.2;
  // the box: planks with dark seams, a darker base
  B.box(deep(wood, 0.8), { y: 0, sx: w * 2, sy: 0.03, sz: d * 2 + 0.01 });
  B.box(wood, { y: 0.02, sx: w * 2, sy: h - 0.02, sz: d * 2, grad: 0.25 });
  for (const y of [0.075, 0.135]) B.detail.box(deep(wood, 0.55), { y, z: d + 0.001, sx: w * 2 - 0.02, sy: 0.006, sz: 0.004 });
  // a barrel lid
  const lid = mat(0, h, 0, 0, 0, Math.PI / 2);
  lathe(B, [[d * 1.02, -w], [d * 1.04, -w + 0.01], [d * 1.04, w - 0.01], [d * 1.02, w]], [tint(wood, 1.1), wood], { segs: 14, matrix: lid, sq: 0.7 });
  // bands, corner guards and a lock plate
  for (const x of [-w * 0.62, w * 0.62]) {
    B.box(band, { x, y: 0.0, sx: 0.035, sy: h + 0.005, sz: d * 2 + 0.012 });
    lathe(B, [[d * 1.07, -0.018], [d * 1.08, 0.018]], band, { segs: 14, matrix: new THREE.Matrix4().multiplyMatrices(mat(x, h, 0, 0, 0, Math.PI / 2), new THREE.Matrix4()), sq: 0.7 });
  }
  B.box(band, { y: 0.1, z: d + 0.006, sx: 0.07, sy: 0.09, sz: 0.012 });
  ball(B, 0x2a1a10, 0, 0.13, d + 0.014, 0.012, 0.016, 0.006);
  for (const x of [-1, 1]) for (const z of [-1, 1]) ball(B, tint(band, 1.1), x * (w - 0.006), 0.012, z * (d - 0.004), 0.018);
  if (spec.color === 0x7a3a22) {
    // the mimic: a fringe of teeth under the lid and a lolling tongue
    for (let k = -4; k <= 4; k++) tube(B, [[k * 0.05, h - 0.005, d + 0.004], [k * 0.05, h - 0.045, d + 0.006]], [0.014, 0.001], 0xfff4dc, { segs: 4, outline: true });
    tube(B, [[0.02, h - 0.02, d], [0.04, h - 0.09, d + 0.06], [0.0, 0.02, d + 0.1]], [0.04, 0.035, 0.02], [0xc04a5a, 0xe07080], { sq: 0.4, segs: 8, up: [0, 0, 1] });
  } else {
    // a gleam of gold under the lid
    G.shape(TPL.ico0, 0xffe080, { x: 0, y: h + d * 0.95, z: 0.05, s: 0.05 });
  }
  return { B, G, height: h + d + 0.05, noLean: true };
}

function ship(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const hull = spec.color ?? 0x6a4022;
  B.shape(TPL.hemi, hull, { y: 0.15, sx: 0.56, sy: 0.32, sz: 1.1, rx: Math.PI, grad: 0.35 });
  B.shape(TPL.cyl16, shade(hull, 1.15), { y: 0.13, sx: 0.56, sy: 0.04, sz: 1.1 });
  B.shape(TPL.cyl16, 0xa87a4a, { y: 0.14, sx: 0.48, sy: 0.02, sz: 1.0 });
  B.shape(TPL.cone8, hull, { y: 0.1, z: 0.5, sx: 0.08, sy: 0.32, sz: 0.08, rx: Math.PI / 2 - 0.3 });
  B.box(hull, { y: 0.14, z: -0.38, sx: 0.4, sy: 0.14, sz: 0.2 });
  B.shape(TPL.cyl8, 0x5a3a20, { y: 0.14, sx: 0.05, sy: 0.85, sz: 0.05 });
  B.shape(TPL.hemi, spec.sail ?? 0xf0ead8, { y: 0.6, z: 0.03, sx: 0.64, sy: 0.12, sz: 0.44, rx: Math.PI / 2, grad: 0.15 });
  B.shape(TPL.capsule, 0x5a3a20, { x: 0.35, y: 0.83, z: 0.02, sx: 0.04, sy: 0.7, sz: 0.04, rz: Math.PI / 2 });
  B.box(spec.flag ?? 0xc03030, { x: 0.06, y: 0.92, sx: 0.12, sy: 0.07, sz: 0.01 });
  return { B, G, height: 1.0, noLean: true, boat: true, ao: false };
}

function waygate(spec) {
  const { B, G } = builders();
  const stone = 0xb0aa9c;
  const glow = spec.glow ?? 0x80b0ff;
  lathe(B, [[0.46, 0.0], [0.46, 0.05], [0.42, 0.07]], [deep(stone, 0.7), stone], { segs: 14, sq: 0.6 });
  for (const s of [-1, 1]) {
    tube(B, [[s * 0.34, 0.03, 0], [s * 0.35, 0.5, 0], [s * 0.33, 0.86, 0]], [0.085, 0.075, 0.07], [deep(stone, 0.75), stone], { segs: 6, sq: 0.9 });
    G.box(glow, { x: s * 0.34, y: 0.3, z: 0.07, sx: 0.035, sy: 0.32, sz: 0.01 });
  }
  tube(B, [[-0.45, 0.88, 0], [0, 0.93, 0], [0.45, 0.88, 0]], [0.08, 0.09, 0.08], [stone, tint(stone, 1.1), stone], { segs: 6, sq: 0.8 });
  G.shape(TPL.torus, glow, { y: 0.45, sx: 0.72, sy: 0.82, sz: 0.4 });
  return { B, G, height: 1.0, noLean: true };
}

// a signpost at a crossroads: two arrow boards pointing different ways
function sign(spec) {
  const { B, G } = builders();
  const wood = spec.color ?? 0x9a6a3a;
  tube(B, [[0, 0, 0], [0.005, 0.62, 0]], [0.032, 0.028], [deep(WOODC, 0.7), WOODC], { segs: 7 });
  ball(B, deep(WOODC, 0.8), 0, 0.63, 0, 0.036, 0.02, 0.036);
  const arrow = [[-0.17, -0.045], [0.12, -0.045], [0.17, 0], [0.12, 0.045], [-0.17, 0.045]];
  extrude(B, 'signArrow', arrow, [deep(wood, 0.8), tint(wood, 1.1)], { depth: 0.018, bevel: 0.006, matrix: mat(0.11, 0.52, 0.03, 0, 0.35, 0.05), gradY: [-0.045, 0.045], rim: 0.75 });
  extrude(B, 'signArrow', arrow, [deep(wood, 0.8), tint(wood, 1.05)], { depth: 0.018, bevel: 0.006, matrix: mat(-0.1, 0.4, 0.03, 0, Math.PI - 0.4, -0.04), gradY: [-0.045, 0.045], rim: 0.75 });
  // painted letters (dark strokes)
  for (const [x, y, ry] of [[0.08, 0.52, 0.35], [-0.08, 0.4, -0.4]]) for (let k = 0; k < 3; k++) B.detail.box(0x3a2614, { x: x + (k - 1) * 0.05 * Math.cos(ry), y: y - 0.006, z: 0.045 + (k - 1) * 0.05 * Math.sin(-ry), sx: 0.03, sy: 0.012, sz: 0.004, ry });
  pebbles(B, 4, 0.08, 0x8a8478);
  return { B, G, height: 0.68, noLean: true };
}

function campfire() {
  const { B, G } = builders();
  // a ring of soot-stained stones
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    B.shape(TPL.dodec, i % 2 ? 0x8a8478 : 0x76716a, { x: Math.cos(a) * 0.2, y: 0, z: Math.sin(a) * 0.2, sx: 0.11, sy: 0.08, sz: 0.09, ry: i, grad: 0.4, flat: true });
  }
  lathe(B, [[0.002, 0.004], [0.17, 0.006]], 0x2a1e18, { segs: 12 });
  // crossed logs, charred at the ends
  for (const [a, y] of [[0.4, 0.035], [-0.7, 0.05], [1.6, 0.065]]) {
    const dx = Math.cos(a) * 0.17, dz = Math.sin(a) * 0.17;
    tube(B, [[-dx, y - 0.02, -dz], [dx, y + 0.02, dz]], 0.03, [0x2a1a10, 0x7a4a24, 0x2a1a10], { segs: 7 });
  }
  // embers and layered flames
  for (let k = 0; k < 5; k++) G.shape(TPL.ico0, k % 2 ? 0xff7020 : 0xffb040, { x: Math.cos(k * 1.7) * 0.08, y: 0.03, z: Math.sin(k * 1.7) * 0.08, s: 0.04 });
  G.shape(TPL.cone5, 0xff5a10, { y: 0.03, sx: 0.22, sy: 0.38, sz: 0.22 });
  G.shape(TPL.cone5, 0xff9a20, { y: 0.04, sx: 0.15, sy: 0.3, sz: 0.15, ry: 0.6 });
  G.shape(TPL.cone5, 0xffe070, { y: 0.05, sx: 0.08, sy: 0.2, sz: 0.08, ry: 0.3 });
  // a log seat and a little pot on a tripod
  tube(B, [[-0.3, 0.05, -0.18], [-0.12, 0.05, -0.34]], 0.05, [0x6a4224, 0x8a5a30], { segs: 8 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    tube(B, [[Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [0, 0.42, 0]], [0.012, 0.01], 0x5a3a20, { segs: 5, outline: true });
  }
  tube(B, [[0, 0.42, 0], [0, 0.32, 0]], 0.003, 0x3a3a3a, { segs: 3, cap: false });
  lathe(B, [[0.002, 0.24], [0.06, 0.25], [0.07, 0.28], [0.055, 0.32]], [0x2a2a2e, 0x4a4a52], { segs: 10 });
  return { B, G, height: 0.45, noLean: true };
}

// A wayside shrine: a stepped stone dais, an altar carved with glowing
// runes, a brazier of holy fire and offerings of flowers and candles.
function shrine(spec) {
  const { B, G } = builders();
  const glow = spec.glow ?? 0xffd870;
  const st = spec.color ?? 0xc4bcac;
  lathe(B, [[0.44, 0.0], [0.44, 0.06], [0.4, 0.07], [0.34, 0.07], [0.34, 0.12], [0.3, 0.13]], [deep(st, 0.7), st, tint(st, 1.08)], { segs: 8, rot: Math.PI / 8, keepSegs: true });
  // the altar: a bevelled block, wider at the top
  lathe(B, [[0.16, 0.13], [0.15, 0.2], [0.15, 0.38], [0.19, 0.4], [0.19, 0.45], [0.16, 0.46]], [deep(st, 0.8), st], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true });
  // carved runes on the front
  for (let k = 0; k < 3; k++) G.box(glow, { x: (k - 1) * 0.06, y: 0.24 + (k % 2) * 0.04, z: 0.108, sx: 0.025, sy: 0.07, sz: 0.008, rz: (k - 1) * 0.4 });
  // a bowl of holy fire on top
  lathe(B, [[0.04, 0.46], [0.1, 0.48], [0.13, 0.54], [0.12, 0.56]], [0x8a6a3a, GOLDC], { segs: 12 });
  G.shape(TPL.cone5, glow, { y: 0.52, sx: 0.16, sy: 0.3, sz: 0.16 });
  G.shape(TPL.cone5, 0xffffff, { y: 0.53, sx: 0.07, sy: 0.18, sz: 0.07, ry: 0.5 });
  G.shape(TPL.ico1, glow, { y: 0.98, s: 0.12 });
  // two slim standing stones framing it, capped in gold
  for (const s of [-1, 1]) {
    lathe(B, [[0.07, 0.06], [0.064, 0.4], [0.056, 0.5], [0.08, 0.52], [0.08, 0.56], [0.058, 0.57]].map(([r, y]) => [r, y, r, -0.12]), [deep(st, 0.75), st, tint(st, 1.1)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, dx: () => s * 0.32 });
    MT(B, () => ball(B, GOLDC, s * 0.32, 0.6, -0.12, 0.045));
    G.shape(TPL.ico0, glow, { x: s * 0.32, y: 0.68, z: -0.12, s: 0.07 });
  }
  // flowers and candles left by pilgrims
  for (const [x, z, c] of [[-0.24, 0.24, 0xf0d040], [-0.18, 0.3, 0xe86a8a], [0.22, 0.26, 0xf4f0ff], [0.27, 0.18, 0xe86a8a]]) {
    tube(B, [[x, 0.06, z], [x, 0.12, z]], 0.008, 0x4a8a2a, { segs: 4, outline: true });
    ball(B, c, x, 0.13, z, 0.03);
  }
  for (const [x, z] of [[-0.1, 0.25], [0.1, 0.27]]) {
    tube(B, [[x, 0.13, z], [x, 0.19, z]], 0.016, 0xf4ecd8, { segs: 6 });
    G.shape(TPL.ico0, 0xffd060, { x, y: 0.21, z, s: 0.03 });
  }
  pebbles(B, 5, 0.46, 0x8a8478, 0.5);
  return { B, G, height: 1.05, noLean: true };
}

// A lore stone: a tall leaning menhir carved with glowing runes, moss on
// its shoulders and stones round its foot.
function lorestone(spec) {
  const { B, G } = builders();
  const st = spec.color ?? 0x9a9aa4;
  const glow = spec.glow ?? 0x8af0ff;
  const m = mat(0, 0, 0, -0.08, 0.3, 0.06);
  lathe(B, [[0.17, 0.0, 0.11], [0.19, 0.12, 0.12], [0.17, 0.45, 0.11], [0.15, 0.7, 0.1], [0.1, 0.84, 0.08], [0.02, 0.9, 0.03]], [deep(st, 0.65), st, tint(st, 1.12)], { segs: 7, matrix: m, keepSegs: true });
  // moss on the top and at the foot
  ball(B, MOSS, -0.05, 0.78, -0.02, 0.1, 0.06, 0.08, { matrix: m });
  ball(B, deep(MOSS, 0.85), 0.08, 0.05, 0.08, 0.12, 0.05, 0.08);
  // runes down the face
  const runes = [[0, 0.62, 0.3], [-0.04, 0.52, -0.5], [0.03, 0.42, 0.9], [-0.02, 0.32, -0.2], [0.02, 0.22, 0.6]];
  for (const [x, y, rz] of runes) {
    G.shape(TPL.box, glow, { matrix: new THREE.Matrix4().multiplyMatrices(m, mat(x, y, 0.118, 0, 0, rz, [0.018, 0.07, 0.008])) });
    G.shape(TPL.box, glow, { matrix: new THREE.Matrix4().multiplyMatrices(m, mat(x + 0.02, y + 0.02, 0.118, 0, 0, rz + 1.2, [0.014, 0.04, 0.008])) });
  }
  pebbles(B, 6, 0.26, 0x8a8478, 1.3);
  return { B, G, height: 0.95, noLean: true };
}

// A wishing well: a round stone wall, dark water, posts, a little shingled
// roof, a crank and a bucket on its rope.
function well(spec) {
  const { B, G } = builders();
  const st = spec.color ?? 0xb0a898;
  // wall: outside, rim and inside in one lathe
  lathe(B, [[0.3, 0.0], [0.31, 0.12], [0.3, 0.22], [0.32, 0.24], [0.32, 0.28], [0.25, 0.29], [0.23, 0.27], [0.22, 0.1]], [deep(st, 0.65), st, tint(st, 1.1), deep(st, 0.5)], { segs: 14 });
  // stone courses
  for (const y of [0.075, 0.15]) lathe(B.detail, [[0.312, y - 0.005], [0.315, y], [0.312, y + 0.005]], deep(st, 0.55), { segs: 14 });
  lathe(B, [[0.002, 0.16], [0.225, 0.16]], 0x24506e, { segs: 14 });
  G.shape(TPL.ico0, 0x9ad8ff, { x: 0.06, y: 0.165, z: 0.04, sx: 0.06, sy: 0.006, sz: 0.04 });
  // posts and roof
  for (const s of [-1, 1]) tube(B, [[s * 0.27, 0.22, 0], [s * 0.27, 0.72, 0]], 0.03, [deep(WOODC, 0.8), WOODC], { segs: 6 });
  tube(B, [[-0.33, 0.6, 0], [0.36, 0.6, 0]], 0.022, WOODC, { segs: 6 });
  tube(B, [[0.36, 0.6, 0], [0.4, 0.6, 0.02], [0.4, 0.52, 0.06]], 0.012, IRONC, { segs: 5, outline: true });
  // a narrow ridge roof high above, leaving the water open to the sky (and
  // to the camera)
  const roof = 0x9a4a30;
  for (const s of [-1, 1]) sheet(B, (u, v) => [(u - 0.5) * 0.72, 0.88 - v * 0.15, s * (0.01 + v * 0.13)], [tint(roof, 1.1), deep(roof, 0.75)], { nu: 3, nv: 1, thick: 0.02, flipN: s < 0, back: deep(roof, 0.5) });
  tube(B, [[-0.37, 0.885, 0], [0.37, 0.885, 0]], 0.02, deep(roof, 0.7), { segs: 6 });
  for (const s of [-1, 1]) tube(B, [[s * 0.27, 0.7, 0], [s * 0.27, 0.88, 0]], 0.022, WOODC, { segs: 6 });
  // the bucket on its rope
  tube(B, [[0.0, 0.6, 0], [0.0, 0.42, 0]], 0.004, 0xd8c890, { segs: 3, cap: false });
  lathe(B, [[0.002, 0.33], [0.05, 0.33], [0.06, 0.4], [0.055, 0.41]], [deep(WOODC, 0.8), WOODC], { segs: 10 });
  lathe(B.detail, [[0.059, 0.36], [0.061, 0.37]], IRONC, { segs: 10 });
  // a few coins glinting on the rim for the wishes
  for (const [x, z] of [[0.18, 0.18], [-0.2, 0.15]]) MT(B, () => ball(B, GOLDC, x, 0.29, z, 0.02, 0.006, 0.02));
  pebbles(B, 5, 0.38, 0x8a8478, 2.1);
  return { B, G, height: 0.98, noLean: true };
}

// A hunters' lodge: a cabin of notched logs, its gable end to the road with a
// stag's antlers over the door, a mossy shingle roof, smoke from a stone
// chimney, a lamp in the window, a hide stretched to dry and firewood.
function lodge(spec) {
  const { B, G } = builders();
  const log = spec.color ?? 0x8a5c34, roof = spec.roof ?? 0x8a6c4a;
  const stone = 0xa29c90, bone = 0xf2e8d0;
  const W = 0.3, D = 0.32, top = 0.4, ridge = 0.8;
  // a fieldstone footing and the solid core of the walls
  B.box(deep(stone, 0.8), { y: 0, sx: W * 2 + 0.08, sy: 0.05, sz: D * 2 + 0.08, grad: 0.3 });
  B.box(deep(log, 0.7), { y: 0.04, sx: W * 2 - 0.04, sy: top - 0.04, sz: D * 2 - 0.04 });
  // notched logs: the side courses cross the end courses at the corners
  for (let k = 0; k < 5; k++) {
    const y = 0.075 + k * 0.07;
    const c = k % 2 ? log : tint(log, 1.1);
    for (const x of [-W, W]) tube(B, [[x, y, -D - 0.05], [x, y, D + 0.05]], 0.036, [deep(c, 0.8), c, deep(c, 0.8)], { segs: 6 });
    for (const z of [-D, D]) tube(B, [[-W - 0.05, y + 0.035, z], [W + 0.05, y + 0.035, z]], 0.034, [deep(c, 0.85), c, deep(c, 0.85)], { segs: 6 });
  }
  // the gable ends: boards up to the ridge, the front one paler
  for (const z of [-D, D]) {
    const c = z > 0 ? tint(log, 1.12) : deep(log, 0.85);
    const a = [-W - 0.02, top + 0.02, z], b = [W + 0.02, top + 0.02, z], m = [0, ridge - 0.02, z];
    B.tri(a, b, m, c); B.tri(a, m, b, c);
    if (z > 0) for (const x of [-0.16, 0, 0.16]) B.detail.box(deep(log, 0.6), { x, y: top + 0.02, z: z + 0.004, sx: 0.008, sy: (ridge - top) * (1 - Math.abs(x) / W) - 0.04, sz: 0.004 });
  }
  // the roof: two shingled slopes running back from the gable, a deep overhang
  for (const s of [-1, 1]) {
    sheet(B, (u, v) => [s * (0.01 + v * (W + 0.14)), ridge - v * (ridge - top + 0.06), (u - 0.5) * (D * 2 + 0.22)], [tint(roof, 1.18), deep(roof, 0.82)], { nu: 4, nv: 3, thick: 0.035, flipN: s < 0, back: deep(roof, 0.45) });
    for (const v of [0.28, 0.52, 0.76]) B.detail.box(deep(roof, 0.55), { x: s * (0.01 + v * (W + 0.14)), y: ridge - v * (ridge - top + 0.06) + 0.02, z: 0, sx: 0.012, sy: 0.008, sz: D * 2 + 0.22 });
  }
  tube(B, [[0, ridge + 0.01, -D - 0.12], [0, ridge + 0.01, D + 0.12]], 0.03, deep(roof, 0.6), { segs: 6 });
  ball(B, deep(MOSS, 0.8), 0.14, ridge - 0.17, -0.12, 0.08, 0.03, 0.1);
  // chimney and its smoke
  B.box(stone, { x: -0.2, y: 0.36, z: -0.16, sx: 0.12, sy: 0.6, sz: 0.12, grad: 0.3 });
  B.box(deep(stone, 0.7), { x: -0.2, y: 0.95, z: -0.16, sx: 0.15, sy: 0.03, sz: 0.15 });
  for (const [x, y, r] of [[-0.2, 1.04, 0.05], [-0.16, 1.12, 0.065], [-0.09, 1.2, 0.075]]) ball(B, 0xe4e2dc, x, y, -0.16, r, r * 0.8, r);
  // the door and its frame, a stag's antlers on the gable above
  const F = D + 0.04;
  B.box(0x3a2614, { x: -0.07, y: 0.05, z: F - 0.01, sx: 0.15, sy: 0.27, sz: 0.02 });
  for (const x of [-0.155, 0.015]) B.box(deep(log, 0.55), { x, y: 0.05, z: F, sx: 0.026, sy: 0.29, sz: 0.026 });
  B.box(deep(log, 0.55), { x: -0.07, y: 0.32, z: F, sx: 0.21, sy: 0.026, sz: 0.026 });
  ball(B, 0xc8a050, -0.03, 0.18, F + 0.005, 0.013);
  const hy = 0.5;
  ball(B, 0x6a4a30, 0, hy, F, 0.045, 0.04, 0.025);
  ball(B, 0x8a6a48, 0, hy - 0.02, F + 0.03, 0.03, 0.04, 0.03);
  for (const sd of [-1, 1]) {
    const x0 = sd * 0.03;
    tube(B, [[x0, hy + 0.02, F + 0.01], [x0 + sd * 0.1, hy + 0.07, F + 0.03], [x0 + sd * 0.16, hy + 0.17, F + 0.02]], [0.014, 0.01, 0.005], bone, { segs: 5, outline: true });
    tube(B, [[x0 + sd * 0.08, hy + 0.06, F + 0.03], [x0 + sd * 0.07, hy + 0.13, F + 0.04]], [0.008, 0.004], bone, { segs: 4, outline: true });
    tube(B, [[x0 + sd * 0.13, hy + 0.12, F + 0.025], [x0 + sd * 0.19, hy + 0.14, F + 0.03]], [0.007, 0.003], bone, { segs: 4, outline: true });
  }
  // a lamp-lit window with green shutters
  G.box(0xffc060, { x: 0.15, y: 0.17, z: F - 0.005, sx: 0.09, sy: 0.09, sz: 0.01 });
  B.box(deep(log, 0.5), { x: 0.15, y: 0.21, z: F, sx: 0.09, sy: 0.012, sz: 0.008 });
  for (const sd of [-1, 1]) B.box(0x4a7a3a, { x: 0.15 + sd * 0.065, y: 0.16, z: F, sx: 0.04, sy: 0.11, sz: 0.012 });
  // a deer hide stretched on a frame beside the cabin
  for (const x of [0.42, 0.62]) tube(B, [[x, 0, 0.2], [x, 0.42, 0.2]], 0.014, WOODC, { segs: 5, outline: true });
  tube(B, [[0.4, 0.38, 0.2], [0.64, 0.38, 0.2]], 0.012, WOODC, { segs: 5, outline: true });
  sheet(B, (u, v) => [0.44 + u * 0.16, 0.36 - v * 0.25, 0.205 + Math.sin(u * 3.1) * 0.015], [0xd0a070, 0xa8784a], { nu: 3, nv: 3, thick: 0.01, back: 0x7a5232 });
  // firewood stacked against the side, and a chopping block with its axe
  for (let k = 0; k < 5; k++) {
    const y = 0.035 + Math.floor(k / 3) * 0.06, x = -0.48 + (k % 3) * 0.06 + (k >= 3 ? 0.03 : 0);
    tube(B, [[x, y, -0.2], [x, y, 0.14]], 0.03, [0xd8aa70, 0x8a5a30, 0xd8aa70], { segs: 6 });
  }
  lathe(B, [[0.06, 0, 0.06, 0.48], [0.06, 0.08, 0.06, 0.48], [0.055, 0.09, 0.055, 0.48]], [0x6a4224, 0xd8aa70], { segs: 8, dx: () => -0.34 });
  tube(B, [[-0.34, 0.09, 0.48], [-0.31, 0.25, 0.48]], 0.011, WOODC, { segs: 4, outline: true });
  B.box(IRONC, { x: -0.345, y: 0.075, z: 0.48, sx: 0.07, sy: 0.04, sz: 0.012 });
  pebbles(B, 5, 0.52, 0x8a8478, 0.7);
  return { B, G, height: 1.1, noLean: true };
}

// Move a built figure into a diorama: scale it about its feet and set it down
// at (x, z), turned by ry
function setFigure(res, s, x, z, ry = 0) {
  const c = Math.cos(ry), sn = Math.sin(ry);
  for (const P of [res.B, res.B.detail, res.F, res.G].filter(Boolean)) {
    const p = P.pos, n = P.nor;
    for (let i = 0; i < p.length; i += 3) {
      const px = p[i] * s, pz = p[i + 2] * s;
      p[i] = x + px * c + pz * sn; p[i + 1] *= s; p[i + 2] = z - px * sn + pz * c;
      if (ry) { const nx = n[i], nz = n[i + 2]; n[i] = nx * c + nz * sn; n[i + 2] = -nx * sn + nz * c; }
    }
  }
  return res;
}

// a hen: plump body, comb and tail, pecking or looking about
function hen(B, x, z, ry, col = 0xf2ece0) {
  const m = mat(x, 0, z, 0, ry, 0);
  ball(B, col, 0, 0.055, 0, 0.04, 0.035, 0.05, { matrix: m });
  ball(B, col, 0, 0.09, 0.04, 0.022, 0.024, 0.022, { matrix: m });
  ball(B, 0xd02a1a, 0, 0.115, 0.04, 0.008, 0.012, 0.014, { matrix: m });
  B.shape(TPL.cone4, 0xe8a830, { matrix: m, y: 0.09, z: 0.065, sx: 0.012, sy: 0.02, sz: 0.012, rx: Math.PI / 2 });
  B.shape(TPL.cone4, deep(col, 0.8), { matrix: m, y: 0.07, z: -0.05, sx: 0.04, sy: 0.05, sz: 0.02, rx: -0.6 });
  for (const s of [-1, 1]) B.box(0xe8a830, { matrix: m, x: s * 0.014, y: 0, sx: 0.006, sy: 0.03, sz: 0.006 });
}

// a dairy cow: piebald, horned, a bell at her neck
function cow(B, x, z, ry) {
  const m = mat(x, 0, z, 0, ry, 0);
  const hide = 0xf2ece2, patch = 0x2a2422;
  ball(B, hide, 0, 0.17, 0, 0.075, 0.07, 0.15, { matrix: m });
  for (const [px, py, pz, r] of [[0.06, 0.19, 0.03, 0.04], [-0.05, 0.2, -0.07, 0.05], [0.02, 0.23, -0.02, 0.035]]) ball(B, patch, px, py, pz, r * 0.9, r * 0.8, r, { matrix: m });
  for (const [lx, lz] of [[-0.045, 0.1], [0.045, 0.1], [-0.045, -0.1], [0.045, -0.1]]) tube(B, [[0, 0, 0], [0, 0.14, 0]].map(([a, b, c2]) => { const v = new THREE.Vector3(lx + a, b, lz + c2).applyMatrix4(m); return [v.x, v.y, v.z]; }), [0.018, 0.022], [0x3a302a, hide], { segs: 5 });
  ball(B, hide, 0, 0.22, 0.17, 0.045, 0.045, 0.055, { matrix: m });
  ball(B, 0xe8b0a0, 0, 0.2, 0.22, 0.03, 0.025, 0.02, { matrix: m });
  ball(B, patch, 0, 0.255, 0.16, 0.035, 0.015, 0.03, { matrix: m });
  for (const s of [-1, 1]) {
    B.shape(TPL.cone4, 0xf0e4c0, { matrix: m, x: s * 0.04, y: 0.26, z: 0.15, sx: 0.012, sy: 0.05, sz: 0.012, rz: -s * 0.9 });
    ball(B, 0x2a2422, s * 0.05, 0.235, 0.15, 0.02, 0.01, 0.012, { matrix: m });
  }
  MT(B, () => ball(B, GOLDC, 0, 0.16, 0.16, 0.014, 0.014, 0.014, { matrix: m }));
  tube(B, [[0, 0.19, -0.15], [0, 0.12, -0.18], [0, 0.06, -0.17]].map(([a, b, c2]) => { const v = new THREE.Vector3(a, b, c2).applyMatrix4(m); return [v.x, v.y, v.z]; }), [0.008, 0.006], hide, { segs: 4, outline: true });
}

// A homestead: a whitewashed, half-timbered cottage under a deep thatch with
// smoke from its chimney, a fenced kitchen-garden of cabbages and beans, a
// haystack, a well, a cow and hens in the yard, and the farmer (spec.keeper)
// standing at his gate.
function farmstead(spec) {
  const keeper = spec.keeper || { kind: 'humanoid', race: 'hobbit', body: 0x7a8a3a, hair: 0x8a5a2a };
  const res = setFigure(figure({ ...keeper, kind: 'humanoid' }, TPL), (RACE_LOOKS[keeper.race] || RACE_LOOKS.human).scale, -0.1, 0.28, 0.15);
  const B = res.B, G = res.G;
  const wall = 0xeee4cc, beam = 0x5a3a22, thatch = spec.roof ?? 0xcfa24c, stone = 0xa29c90;
  // the yard: trodden earth and a few flagstones to the door
  // (flat ground goes in the detail layer, which carries no ink outline)
  lathe(B.detail, [[0.002, 0.004], [0.66, 0.006], [0.7, 0.0]], [0xb8a470, 0xa8946a], { segs: 20, sq: 0.66 });
  for (let k = 0; k < 3; k++) B.detail.shape(TPL.cyl6, 0xb0a890, { x: -0.22 + k * 0.03, y: 0.004, z: -0.08 + k * 0.1, sx: 0.08, sy: 0.012, sz: 0.06, ry: k });
  // the cottage, long side to the yard
  const cx = -0.28, cz = -0.4, W = 0.34, D = 0.17, eave = 0.42, ridge = 0.78;
  B.box(deep(stone, 0.8), { x: cx, y: 0, z: cz, sx: W * 2 + 0.04, sy: 0.05, sz: D * 2 + 0.04 });
  B.box(wall, { x: cx, y: 0.04, z: cz, sx: W * 2, sy: eave - 0.04, sz: D * 2, grad: 0.15 });
  // half-timbering: posts, a rail and braces on the front
  const F = cz + D + 0.005;
  for (const x of [-W, -W * 0.36, W * 0.36, W]) B.detail.box(beam, { x: cx + x, y: 0.05, z: F, sx: 0.028, sy: eave - 0.05, sz: 0.01 });
  B.detail.box(beam, { x: cx, y: eave * 0.58, z: F, sx: W * 2, sy: 0.024, sz: 0.01 });
  B.detail.box(beam, { x: cx, y: eave - 0.03, z: F, sx: W * 2, sy: 0.026, sz: 0.01 });
  // a deep thatch with a rounded ridge, overhanging all round
  // (the thatch bellies out a little, and is combed into darker courses)
  const run = ridge - eave + 0.05, out = D + 0.07;
  for (const s of [-1, 1]) {
    sheet(B, (u, v) => [cx + (u - 0.5) * (W * 2 + 0.12), ridge - v * run + Math.sin(v * Math.PI) * 0.025, cz + s * (0.01 + v * out + Math.sin(v * Math.PI) * 0.02)], [tint(thatch, 1.15), thatch, deep(thatch, 0.7)], { nu: 4, nv: 4, thick: 0.06, flipN: s > 0, back: deep(thatch, 0.5) });
    for (const v of [0.22, 0.44, 0.66, 0.88]) B.detail.box(deep(thatch, 0.6), { x: cx, y: ridge - v * run + Math.sin(v * Math.PI) * 0.025 + 0.035, z: cz + s * (0.01 + v * out + Math.sin(v * Math.PI) * 0.02 + 0.012), sx: W * 2 + 0.1, sy: 0.012, sz: 0.012 });
  }
  for (const x of [-W, W]) {
    const a = [cx + x, eave - 0.01, cz - D], b = [cx + x, eave - 0.01, cz + D], m = [cx + x, ridge - 0.04, cz];
    B.tri(a, b, m, wall); B.tri(a, m, b, wall);
  }
  tube(B, [[cx - W - 0.08, ridge + 0.02, cz], [cx + W + 0.08, ridge + 0.02, cz]], 0.05, [deep(thatch, 0.85), tint(thatch, 1.05), deep(thatch, 0.85)], { segs: 7 });
  // the chimney through the thatch at the gable end, and its smoke
  const chx = cx - W + 0.09, chz = cz - 0.06;
  B.box(stone, { x: chx, y: 0.4, z: chz, sx: 0.11, sy: 0.56, sz: 0.11, grad: 0.3 });
  B.box(deep(stone, 0.7), { x: chx, y: 0.96, z: chz, sx: 0.13, sy: 0.035, sz: 0.13 });
  for (const [x, y, r] of [[0, 1.05, 0.05], [0.05, 1.14, 0.065], [0.12, 1.23, 0.075], [0.21, 1.3, 0.065]]) ball(B, 0xe6e4de, chx + x, y, chz, r, r * 0.8, r);
  // a round green door, lit windows with flower boxes
  B.box(0x3a6a3a, { x: cx + 0.04, y: 0.05, z: F, sx: 0.11, sy: 0.2, sz: 0.012 });
  ball(B, 0x3a6a3a, cx + 0.04, 0.25, F, 0.055, 0.035, 0.006);
  ball(B, 0xe0b040, cx + 0.075, 0.14, F + 0.006, 0.009);
  for (const x of [-0.19, 0.22]) {
    G.box(0xffd070, { x: cx + x, y: 0.16, z: F, sx: 0.09, sy: 0.08, sz: 0.008 });
    B.detail.box(beam, { x: cx + x, y: 0.2, z: F + 0.004, sx: 0.009, sy: 0.08, sz: 0.004 });
    B.box(0x7a4a26, { x: cx + x, y: 0.12, z: F + 0.016, sx: 0.11, sy: 0.028, sz: 0.032 });
    for (let k = 0; k < 3; k++) ball(B, [0xe86a8a, 0xf0d040, 0xf4f0ff][k], cx + x - 0.03 + k * 0.03, 0.155, F + 0.022, 0.016);
  }
  // the kitchen-garden: rows of cabbages and beans behind a picket fence
  const gx = 0.4, gz = -0.38, GW = 0.2, GD = 0.16;
  for (let row = 0; row < 3; row++) {
    const z = gz - GD + 0.05 + row * 0.11;
    B.detail.box(0x5e4426, { x: gx, y: 0, z, sx: GW * 2 - 0.04, sy: 0.02, sz: 0.06 });
    for (let i = 0; i < 4; i++) {
      const x = gx - GW + 0.05 + i * 0.1;
      if (row === 1) { tube(B, [[x, 0, z], [x, 0.16, z]], 0.006, 0x6a5a3a, { segs: 3 }); ball(B, 0x4a8a2a, x, 0.1, z, 0.03, 0.055, 0.03); }
      else ball(B, i % 2 ? 0x6aaa44 : 0x5a9a3a, x, 0.03, z, 0.036, 0.032, 0.036);
    }
  }
  const picket = (x, z) => B.box(0xd8ccb0, { x, y: 0, z, sx: 0.016, sy: 0.12, sz: 0.016 });
  for (let i = 0; i <= 8; i++) { picket(gx - GW + i * (GW / 4), gz + GD); picket(gx - GW + i * (GW / 4), gz - GD); }
  for (let i = 1; i < 6; i++) { picket(gx + GW, gz - GD + i * (GD / 3)); picket(gx - GW, gz - GD + i * (GD / 3)); }
  for (const z of [gz + GD, gz - GD]) B.box(0xc8bca0, { x: gx, y: 0.07, z, sx: GW * 2, sy: 0.016, sz: 0.012 });
  for (const x of [gx + GW, gx - GW]) B.box(0xc8bca0, { x, y: 0.07, z: gz, sx: 0.012, sy: 0.016, sz: GD * 2 });
  // a haystack at the yard's edge, a pitchfork stuck in it
  const hx = 0.56, hz = 0.14;
  const hay = (prof) => prof.map(([r, y]) => [r, y, r * 0.9, hz]);
  lathe(B, hay([[0.002, 0], [0.14, 0.01], [0.15, 0.09], [0.12, 0.18], [0.07, 0.25], [0.02, 0.28]]), [deep(0xd8b050, 0.75), 0xd8b050, tint(0xd8b050, 1.1)], { segs: 12, dx: () => hx });
  for (const y of [0.07, 0.16]) lathe(B.detail, hay([[0.152 - y * 0.2, y], [0.155 - y * 0.2, y + 0.01]]), deep(0xd8b050, 0.65), { segs: 12, dx: () => hx });
  tube(B, [[hx + 0.07, 0.08, hz + 0.03], [hx + 0.13, 0.34, hz + 0.05]], 0.008, WOODC, { segs: 4, outline: true });
  // the well
  const wx = -0.62, wz = 0.12;
  lathe(B, [[0.08, 0], [0.085, 0.1], [0.07, 0.11], [0.06, 0.06]].map(([r, y]) => [r, y, r, wz]), [deep(STONE, 0.7), STONE], { segs: 10, dx: () => wx });
  lathe(B, [[0.002, 0.06, 0.002, wz], [0.062, 0.06, 0.062, wz]], 0x24506e, { segs: 10, dx: () => wx });
  for (const s of [-1, 1]) tube(B, [[wx + s * 0.075, 0.1, wz], [wx + s * 0.075, 0.28, wz]], 0.011, WOODC, { segs: 4, outline: true });
  B.shape(TPL.prism, 0x8a4a2a, { x: wx, y: 0.28, z: wz, sx: 0.22, sy: 0.08, sz: 0.15 });
  // a trough and the cow drinking at it, hens about the farmer's feet
  B.box(0x6a4a2a, { x: 0.1, y: 0, z: 0.02, sx: 0.06, sy: 0.05, sz: 0.2 });
  B.box(0x3a7ab0, { x: 0.1, y: 0.045, z: 0.02, sx: 0.045, sy: 0.006, sz: 0.18 });
  cow(B, 0.32, 0.0, -Math.PI / 2);
  hen(B, 0.06, 0.38, 0.6);
  hen(B, -0.36, 0.3, -0.9, 0xb8642a);
  hen(B, 0.24, 0.3, 2.2);
  pebbles(B, 4, 0.7, 0x8a8478, 0.4);
  return { B, G, F: res.F, height: 1.1, noLean: true };
}

// A fighting pit: a sunken ring of red sand inside a timber wall, the crowd
// packed on the benches behind, banners and torches, a gate with its spikes.
function arena(spec) {
  const { B, G } = builders();
  const wood = 0x7a5232, sand = spec.color ?? 0xc8925a, flag = spec.flag ?? 0xb02a2a;
  const R = 0.46, S = 0.72;
  lathe(B.detail, [[0.002, 0.05], [R - 0.02, 0.05], [R, 0.03]], [deep(sand, 0.85), sand], { segs: 20, sq: S });
  // bloodstains and a rake left in the sand
  for (const [x, z, r] of [[0.08, 0.02, 0.05], [-0.12, -0.08, 0.035]]) B.detail.shape(TPL.cyl12, 0x8a3a24, { x, y: 0.048, z, sx: r * 2, sy: 0.01, sz: r * 1.4 });
  // the wall: a ring of stout posts with planking between, low at the front
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R * S;
    const front = Math.cos(a) > 0.35;
    const hgt = front ? 0.1 : 0.2;
    tube(B, [[x, -0.02, z], [x, hgt + 0.04, z]], 0.026, [deep(wood, 0.7), wood], { segs: 5 });
    const a2 = ((i + 1) / N) * Math.PI * 2, x2 = Math.sin(a2) * R, z2 = Math.cos(a2) * R * S;
    if (!(front && Math.abs(Math.sin(a)) < 0.18)) B.box(i % 2 ? wood : tint(wood, 1.1), { x: (x + x2) / 2, y: 0, z: (z + z2) / 2, sx: Math.hypot(x2 - x, z2 - z) + 0.01, sy: hgt, sz: 0.03, ry: Math.atan2(-(z2 - z), x2 - x) });
  }
  // the benches: tiers stepping up behind the back half, crowded with folk
  const crowd = [0x8a2a2a, 0x2a4a7a, 0x6a7a3a, 0x7a5a2a, 0x5a3a6a, 0xd8c8a0, 0x3a6a6a];
  for (let tier = 0; tier < 3; tier++) {
    const rr = R + 0.07 + tier * 0.08, y = 0.06 + tier * 0.08;
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.62 + (i / 13) * Math.PI * 0.76, x = Math.sin(a) * rr, z = Math.cos(a) * rr * S;
      const ry = Math.atan2(-Math.cos(a) * S, Math.sin(a)) + Math.PI / 2;
      B.box(tier % 2 ? 0x8a6a42 : 0x9a7a4a, { x, y: 0, z, sx: 0.11, sy: y, sz: 0.07, ry });
      if ((i + tier) % 3 !== 2) {
        const c = crowd[(i * 3 + tier * 5) % crowd.length];
        ball(B, c, x, y + 0.04, z, 0.025, 0.035, 0.022);
        ball(B, 0xe8c09a, x, y + 0.085, z, 0.018);
      }
    }
  }
  // the gate at the front: two posts with a lintel and a skull
  for (const s of [-1, 1]) tube(B, [[s * 0.08, -0.02, R * S], [s * 0.08, 0.3, R * S]], 0.03, [deep(wood, 0.7), wood], { segs: 5 });
  B.box(deep(wood, 0.8), { x: 0, y: 0.28, z: R * S, sx: 0.24, sy: 0.04, sz: 0.04 });
  ball(B, 0xf2e8d0, 0, 0.34, R * S + 0.01, 0.03, 0.032, 0.026);
  for (const s of [-1, 1]) ball(B, 0x1a1410, s * 0.011, 0.343, R * S + 0.035, 0.008);
  // banner poles and torches round the back
  for (const [a, c] of [[Math.PI * 0.7, flag], [Math.PI, 0xe0b040], [Math.PI * 1.3, flag]]) {
    const x = Math.sin(a) * (R + 0.3), z = Math.cos(a) * (R + 0.3) * S;
    tube(B, [[x, 0, z], [x, 0.62, z]], 0.012, 0x3a2a1a, { segs: 4, outline: true });
    sheet(B, (u, v) => [x + 0.01 + u * 0.13, 0.6 - v * 0.17, z + Math.sin(u * 3) * 0.012], [c, deep(c, 0.7)], { nu: 3, nv: 2, thick: 0.008 });
  }
  for (const a of [Math.PI * 0.55, Math.PI * 1.45]) {
    const x = Math.sin(a) * (R + 0.05), z = Math.cos(a) * (R + 0.05) * S;
    tube(B, [[x, 0, z], [x, 0.32, z]], 0.012, 0x3a2a1a, { segs: 4, outline: true });
    G.shape(TPL.cone5, 0xff8a20, { x, y: 0.32, z, sx: 0.05, sy: 0.1, sz: 0.05 });
    G.shape(TPL.ico0, 0xffd060, { x, y: 0.35, z, s: 0.03 });
  }
  // the champion's weapons racked by the gate
  tube(B, [[0.24, 0, 0.3], [0.27, 0.3, 0.32]], 0.008, 0x6a4a2a, { segs: 3, outline: true });
  B.shape(TPL.cone4, 0xc8ccd4, { x: 0.275, y: 0.3, z: 0.32, sx: 0.03, sy: 0.08, sz: 0.012 });
  return { B, G, height: 0.7, noLean: true };
}

// A fortune-teller's caravan: a painted wagon under a barrel roof, a striped
// awning over a little table and her crystal ball, a lantern and a pony.
function caravan(spec) {
  const { B, G } = builders();
  const body = spec.color ?? 0x2a6a5a, trim = 0xe0b040, roof = spec.roof ?? 0x7a2a4a;
  const L = 0.5, Wd = 0.17, y0 = 0.14, h = 0.24;
  // the wagon body, its ends painted with stars
  B.box(deep(body, 0.85), { x: -0.08, y: y0, z: -0.12, sx: L, sy: h, sz: Wd * 2, grad: 0.2 });
  for (const z of [-0.12 + Wd + 0.003, -0.12 - Wd - 0.003]) {
    B.detail.box(trim, { x: -0.08, y: y0 + h - 0.02, z, sx: L, sy: 0.015, sz: 0.004 });
    B.detail.box(trim, { x: -0.08, y: y0 + 0.01, z, sx: L, sy: 0.015, sz: 0.004 });
  }
  G.box(0xfff0a0, { x: -0.2, y: y0 + 0.13, z: -0.12 + Wd + 0.005, sx: 0.07, sy: 0.07, sz: 0.004 });
  for (const [x, y] of [[0.02, 0.2], [0.1, 0.12], [-0.04, 0.08]]) G.shape(TPL.ico0, 0xffe080, { x: x - 0.08, y: y0 + y, z: -0.12 + Wd + 0.006, s: 0.02 });
  // the barrel roof, overhanging
  sheet(B, (u, v) => [-0.08 + (u - 0.5) * (L + 0.08), y0 + h + Math.sin(v * Math.PI) * 0.12, -0.12 + (v - 0.5) * (Wd * 2 + 0.06)], [tint(roof, 1.1), deep(roof, 0.75), tint(roof, 1.1)], { nu: 2, nv: 6, thick: 0.02, back: deep(roof, 0.5) });
  // a stove-pipe and its smoke
  tube(B, [[-0.24, y0 + h + 0.1, -0.12], [-0.24, y0 + h + 0.22, -0.12]], 0.012, 0x2a2a2a, { segs: 5 });
  for (const [dy, r] of [[0.27, 0.025], [0.33, 0.035]]) ball(B, 0xe6e4de, -0.24 + dy * 0.2, y0 + h + dy, -0.12, r);
  // wheels with spokes, the shafts resting on the ground
  for (const [x, rad] of [[-0.24, 0.1], [0.08, 0.08]]) for (const s of [-1, 1]) {
    const z = -0.12 + s * (Wd + 0.02);
    B.shape(TPL.torus, trim, { x, y: rad, z, sx: rad * 2.3, sy: rad * 2.3, sz: 0.25 });
    for (let k = 0; k < 4; k++) B.box(deep(trim, 0.8), { x, y: rad, z, sx: 0.008, sy: rad * 1.9, sz: 0.008, rz: (k / 4) * Math.PI });
    ball(B, 0x3a2a1a, x, rad, z, 0.016);
  }
  for (const s of [-1, 1]) tube(B, [[0.17, y0, -0.12 + s * 0.1], [0.42, 0.02, -0.12 + s * 0.12]], 0.01, WOODC, { segs: 4, outline: true });
  // steps up to the door at the back
  for (let k = 0; k < 2; k++) B.box(WOODC, { x: -0.36 - k * 0.04, y: k === 0 ? 0.09 : 0.03, z: -0.12, sx: 0.06, sy: 0.02, sz: 0.12 });
  // the striped awning, the table and her crystal ball
  for (let k = 0; k < 5; k++) sheet(B, (u, v) => [-0.28 + (k + u) * 0.09, y0 + h - 0.02 - v * 0.1, -0.12 + Wd + v * 0.24], k % 2 ? [0xf0e6d0, 0xd8ccb0] : [0x7a2a5a, 0x5a1a40], { nu: 1, nv: 2, thick: 0.008 });
  for (const x of [-0.28, 0.17]) tube(B, [[x, 0, -0.12 + Wd + 0.24], [x, y0 + h - 0.12, -0.12 + Wd + 0.24]], 0.007, WOODC, { segs: 3, outline: true });
  lathe(B, [[0.012, 0], [0.012, 0.1], [0.07, 0.11], [0.07, 0.125]], [WOODC, 0x5a1a40], { segs: 10, dx: () => -0.05, sq: 1 });
  G.shape(TPL.ico1, 0xa0c8ff, { x: -0.05, y: 0.17, z: 0.0, s: 0.09 });
  // gold stars painted on the roof, catching the eye from far off
  for (const [u, v] of [[0.2, 0.3], [0.45, 0.6], [0.7, 0.35], [0.85, 0.7], [0.3, 0.8]]) G.shape(TPL.ico0, 0xffe080, { x: -0.08 + (u - 0.5) * (L + 0.04), y: y0 + h + Math.sin(v * Math.PI) * 0.12 + 0.012, z: -0.12 + (v - 0.5) * (Wd * 2 + 0.04), s: 0.025 });
  G.shape(TPL.ico0, 0xffffff, { x: -0.06, y: 0.18, z: 0.03, s: 0.02 });
  // a hanging lantern
  tube(B, [[0.15, y0 + h - 0.1, 0.1], [0.15, y0 + h - 0.16, 0.1]], 0.003, 0x2a2a2a, { segs: 3, cap: false });
  G.shape(TPL.ico0, 0xffb050, { x: 0.15, y: y0 + h - 0.19, z: 0.1, s: 0.04 });
  // her pony, grazing
  const pc = 0x8a6a4a;
  ball(B, pc, 0.42, 0.17, -0.38, 0.12, 0.06, 0.055);
  for (const [lx, lz] of [[0.34, -0.36], [0.34, -0.41], [0.5, -0.36], [0.5, -0.41]]) tube(B, [[lx, 0, lz], [lx, 0.14, lz]], [0.012, 0.016], [0x3a2a1a, pc], { segs: 4 });
  tube(B, [[0.52, 0.19, -0.38], [0.58, 0.12, -0.38], [0.6, 0.04, -0.37]], [0.03, 0.026, 0.022], pc, { segs: 5 });
  tube(B, [[0.5, 0.22, -0.38], [0.56, 0.16, -0.38]], 0.012, 0x3a2a1a, { segs: 4 });
  tube(B, [[0.3, 0.18, -0.38], [0.27, 0.08, -0.38]], [0.014, 0.006], 0x3a2a1a, { segs: 4 });
  pebbles(B, 4, 0.5, 0x8a8478, 1.1);
  return { B, G, height: 0.7, noLean: true };
}

// A fairy ring: red-capped toadstools in a circle of greener grass, and
// motes of light dancing above it
function fairyring(spec) {
  const { B, G } = builders();
  const glow = spec.glow ?? 0xc0ffd8;
  lathe(B.detail, [[0.002, 0.004], [0.4, 0.006], [0.44, 0.0]], [0x4a8a34, 0x3a7a2a], { segs: 20 });
  lathe(B.detail, [[0.002, 0.008], [0.24, 0.008]], 0x5a9a3a, { segs: 16 });
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.2, d = 0.34 + 0.03 * Math.sin(i * 5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const s = 0.7 + 0.5 * ((i * 7) % 5) / 5;
    tube(B, [[x, 0, z], [x, 0.07 * s, z]], [0.016 * s, 0.012 * s], [0xd8ccb0, 0xf4ecdc], { segs: 5 });
    lathe(B, [[0.002, 0.07 * s], [0.045 * s, 0.072 * s], [0.04 * s, 0.09 * s], [0.002, 0.11 * s]].map(([r, y]) => [r, y, r, z]), [0xc02a1a, 0xe03a24], { segs: 9, dx: () => x });
    for (let k = 0; k < 3; k++) ball(B.detail, 0xfff4e0, x + Math.cos(k * 2.1 + i) * 0.022 * s, 0.098 * s, z + Math.sin(k * 2.1 + i) * 0.022 * s, 0.007 * s, 0.004, 0.007 * s);
  }
  // a mossy stone at the back of the ring
  ball(B, 0x8a8a7a, -0.05, 0.05, -0.18, 0.07, 0.06, 0.05, { grad: 0.3 });
  ball(B, MOSS, -0.05, 0.1, -0.18, 0.06, 0.02, 0.045);
  // the dancing lights
  const motes = [[0, 0.3, 0], [0.12, 0.42, 0.08], [-0.14, 0.36, 0.06], [0.06, 0.55, -0.1], [-0.08, 0.5, -0.04], [0.2, 0.26, -0.14], [-0.22, 0.22, 0.12]];
  motes.forEach(([x, y, z], i) => G.shape(TPL.ico1, [glow, 0xffc0f0, 0xa0d0ff][i % 3], { x, y, z, s: 0.05 + (i % 3) * 0.015 }));
  G.shape(TPL.ico1, glow, { y: 0.02, sx: 0.2, sy: 0.01, sz: 0.2 });
  return { B, G, height: 0.6, noLean: true };
}

// A lighthouse on its rocks: a white tower banded red, the lamp room glowing
// under a red cap, and the keeper's cottage at its foot
function lighthouse(spec) {
  const { B, G } = builders();
  const band = spec.color ?? 0xb83a2a, white = 0xf2eee4;
  for (const [x, z, s] of [[-0.2, 0.14, 0.16], [0.24, 0.16, 0.13], [0.1, -0.22, 0.14], [-0.26, -0.12, 0.12]]) ball(B, 0x8a8478, x, 0.04, z, s, s * 0.6, s * 0.8, { grad: 0.4 });
  // the tower: a lathe banded white and red
  const prof = [[0.2, 0], [0.19, 0.12], [0.17, 0.32], [0.15, 0.52], [0.13, 0.72], [0.12, 0.86]];
  for (let k = 0; k < prof.length - 1; k++) lathe(B, [prof[k], prof[k + 1]], k % 2 ? band : white, { segs: 14 });
  // gallery, lamp room, cap and vane
  lathe(B, [[0.17, 0.86], [0.18, 0.88], [0.16, 0.9]], 0x3a3a3a, { segs: 14 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; tube(B, [[Math.cos(a) * 0.17, 0.89, Math.sin(a) * 0.17], [Math.cos(a) * 0.17, 0.95, Math.sin(a) * 0.17]], 0.005, 0x2a2a2a, { segs: 3, outline: true }); }
  lathe(B, [[0.17, 0.95], [0.172, 0.955]], 0x2a2a2a, { segs: 14 });
  G.shape(TPL.cyl12, 0xfff0b0, { y: 0.9, sx: 0.17, sy: 0.12, sz: 0.17 });
  G.shape(TPL.ico1, 0xffffff, { y: 0.96, s: 0.09 });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; tube(B, [[Math.cos(a) * 0.09, 0.9, Math.sin(a) * 0.09], [Math.cos(a) * 0.09, 1.02, Math.sin(a) * 0.09]], 0.006, 0x2a2a2a, { segs: 3 }); }
  lathe(B, [[0.13, 1.02], [0.12, 1.04], [0.002, 1.16]], [deep(band, 0.8), band], { segs: 14 });
  ball(B, GOLDC, 0, 1.18, 0, 0.02);
  // a door and slit windows, the keeper's cottage leaning on the tower
  B.box(0x3a2a1a, { y: 0.02, z: 0.19, sx: 0.07, sy: 0.12, sz: 0.01 });
  for (const y of [0.4, 0.62]) G.box(0xffd070, { y, z: 0.15 - (y - 0.4) * 0.1, sx: 0.025, sy: 0.05, sz: 0.01 });
  B.box(white, { x: 0.27, y: 0, z: 0.0, sx: 0.22, sy: 0.16, sz: 0.2, grad: 0.15 });
  B.shape(TPL.prism, 0x56606e, { x: 0.27, y: 0.16, z: 0.0, sx: 0.26, sy: 0.12, sz: 0.24, ry: Math.PI / 2 });
  G.box(0xffd070, { x: 0.27, y: 0.07, z: 0.105, sx: 0.05, sy: 0.04, sz: 0.008 });
  return { B, G, height: 1.2, noLean: true };
}

// A giant crab: a broad knobbly shell, eyes on stalks, six jointed legs and
// two great pincers raised towards the viewer.
function crab(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0xc8542c, belly = spec.mark ?? 0xf2c890;
  const hi = tint(c, 1.18), lo = deep(c, 0.6);
  // the shell: wide and low, a paler underside, knobs along the rim
  ball(B, belly, 0, 0.2, 0, 0.36, 0.08, 0.27);
  ball(B, c, 0, 0.25, -0.01, 0.38, 0.13, 0.29, { grad: 0.4 });
  ball(B, hi, 0, 0.33, -0.03, 0.22, 0.06, 0.16);
  for (let k = -3; k <= 3; k++) ball(B, k % 2 ? hi : lo, k * 0.1, 0.27 + (3 - Math.abs(k)) * 0.008, 0.25 - Math.abs(k) * 0.025, 0.035, 0.025, 0.03);
  // legs: three a side, bent at the knee, pointed feet
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = -0.14 + i * 0.1, x0 = sd * 0.3;
    const knee = [sd * (0.5 + i * 0.02), 0.32, z - 0.03 + i * 0.02], foot = [sd * (0.62 + i * 0.03), 0, z - 0.06 + i * 0.05];
    tube(B, [[x0, 0.22, z], knee], [0.04, 0.032], [lo, c], { segs: 6 });
    tube(B, [knee, foot], [0.032, 0.006], [c, lo], { segs: 6 });
  }
  // the pincers: an arm up and forward, a fat claw with a hooked finger
  for (const sd of [-1, 1]) {
    const sh = [sd * 0.24, 0.24, 0.18], el = [sd * 0.36, 0.36, 0.34], wr = [sd * 0.22, 0.46, 0.46];
    tube(B, [sh, el], [0.05, 0.045], [lo, c], { segs: 7 });
    tube(B, [el, wr], [0.045, 0.05], [c, hi], { segs: 7 });
    ball(B, c, wr[0], wr[1] + 0.02, wr[2] + 0.06, 0.09, 0.075, 0.12, { grad: 0.3 });
    tube(B, [[wr[0] - sd * 0.02, wr[1] + 0.06, wr[2] + 0.12], [wr[0] - sd * 0.04, wr[1] + 0.1, wr[2] + 0.22], [wr[0] - sd * 0.08, wr[1] + 0.06, wr[2] + 0.28]], [0.04, 0.03, 0.008], [c, deep(c, 0.4)], { segs: 6 });
    tube(B, [[wr[0] + sd * 0.01, wr[1] - 0.02, wr[2] + 0.14], [wr[0] - sd * 0.02, wr[1] - 0.03, wr[2] + 0.22], [wr[0] - sd * 0.06, wr[1] + 0.01, wr[2] + 0.26]], [0.03, 0.02, 0.006], [c, deep(c, 0.4)], { segs: 6 });
  }
  // eyes on stalks, and a little frothing mouth
  for (const sd of [-1, 1]) {
    tube(B, [[sd * 0.06, 0.3, 0.2], [sd * 0.08, 0.42, 0.24]], 0.016, c, { segs: 5, outline: true });
    ball(B, 0x14100e, sd * 0.08, 0.44, 0.245, 0.03, 0.032, 0.028);
    ball(B, 0xffffff, sd * 0.08 - 0.008, 0.455, 0.268, 0.009);
    if (spec.eyes != null && spec.eyes !== 0x101010) G.shape(TPL.ico0, spec.eyes, { x: sd * 0.08, y: 0.44, z: 0.27, s: 0.02 });
  }
  for (let k = 0; k < 3; k++) ball(B, 0xf4f4ee, (k - 1) * 0.03, 0.25, 0.27, 0.016);
  return { B, G, height: 0.62 };
}

// record metal so the shader paints a glint on it (as figures do)
function MT(B, fn) {
  const a = B.count, d = B.detail ? B.detail.count : 0;
  fn();
  (B.metal ||= []).push([a, B.count]);
  if (B.detail) (B.detail.metal ||= []).push([d, B.detail.count]);
}

function marker(spec) {
  // a banner on a pole, used by the editor for start / arrival points and hidden passages
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0xffd040;
  B.shape(TPL.cyl12, shade(c, 0.6), { y: 0, sx: 0.5, sy: 0.03, sz: 0.5 });
  B.shape(TPL.cyl6, 0x5a3a20, { y: 0, sx: 0.04, sy: 0.75, sz: 0.04 });
  const A = [0.02, 0.74, 0], Bp = [0.02, 0.46, 0], C = [0.34, 0.6, 0.02];
  G.tri(A, Bp, C, c);
  G.tri(A, C, Bp, shade(c, 0.8));
  G.shape(TPL.ico0, c, { y: 0.78, s: 0.07 });
  return { B, G, height: 0.8 };
}

const humanoid = (spec) => figure(spec, TPL);

const BUILDERS = { humanoid, quadruped, spider, wraith, bat, serpent, dragon, blob, ent, chest, ship, waygate, sign, campfire, marker, shrine, lorestone, well, lodge, crab, farmstead, arena, caravan, fairyring, lighthouse,
  ...CONTAINER_BUILDERS, ...LANDMARK_BUILDERS,
  ...PUZZLE_BUILDERS, ...ISLE_BEASTS };

// The outline shell needs one normal per corner, or blocky parts split open
// at their edges: average the normals of every vertex sharing a position.
function outlineGeometry(geo) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array;
  const acc = new Map();
  const key = (i) => `${Math.round(P[i] * 2000)},${Math.round(P[i + 1] * 2000)},${Math.round(P[i + 2] * 2000)}`;
  for (let i = 0; i < P.length; i += 3) {
    const k = key(i);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = [0, 0, 0]));
    a[0] += N[i]; a[1] += N[i + 1]; a[2] += N[i + 2];
  }
  const out = new Float32Array(N.length);
  for (let i = 0; i < P.length; i += 3) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i] = a[0] / l; out[i + 1] = a[1] / l; out[i + 2] = a[2] / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position);
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  // the outline takes a dark shade of whatever it surrounds
  if (geo.attributes.color) g.setAttribute('color', geo.attributes.color);
  g.computeBoundingSphere();
  return g;
}

// Painted-miniature grounding: parts near the feet are a little darker.
function groundShade(B, height) {
  const P = B.pos, C = B.col;
  const h = Math.max(0.2, height * 0.3);
  for (let i = 0; i < P.length; i += 3) {
    const t = Math.min(1, Math.max(0, P[i + 1] / h));
    const k = 0.72 + 0.28 * t * t * (3 - 2 * t);
    C[i] *= k; C[i + 1] *= k; C[i + 2] *= k;
  }
}

// Painted recesses: a wash settles under brims and beards, in armpits and
// between folds. Each vertex peeks a little way out along its normal through
// a coarse voxel grid of the figure; nearby parts darken it. Skin gets a
// gentler wash so faces stay fresh.
function occlusion(B, strength) {
  const parts = [B, B.detail].filter((p) => p && p.count);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of parts) {
    const P = p.pos;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i];
      if (P[i + 1] < y0) y0 = P[i + 1]; if (P[i + 1] > y1) y1 = P[i + 1];
      if (P[i + 2] < z0) z0 = P[i + 2]; if (P[i + 2] > z1) z1 = P[i + 2];
    }
  }
  if (!isFinite(x0)) return;
  const h = Math.max(0.008, Math.max(x1 - x0, y1 - y0, z1 - z0) / 80);
  const pad = 4;
  const gx = Math.ceil((x1 - x0) / h) + pad * 2, gy = Math.ceil((y1 - y0) / h) + pad * 2, gz = Math.ceil((z1 - z0) / h) + pad * 2;
  const grid = new Uint8Array(gx * gy * gz);
  const idx = (x, y, z) => {
    const ix = Math.floor((x - x0) / h) + pad, iy = Math.floor((y - y0) / h) + pad, iz = Math.floor((z - z0) / h) + pad;
    if (ix < 0 || iy < 0 || iz < 0 || ix >= gx || iy >= gy || iz >= gz) return -1;
    return (iz * gy + iy) * gx + ix;
  };
  // only the body fills the grid: hairline details cast no shade
  const P = B.pos;
  for (let t = 0; t < P.length; t += 9) {
    const ax = P[t], ay = P[t + 1], az = P[t + 2], bx = P[t + 3], by = P[t + 4], bz = P[t + 5], cx = P[t + 6], cy = P[t + 7], cz = P[t + 8];
    const len = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
    const n = Math.min(20, Math.max(1, Math.ceil(len / (h * 0.8))));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      const k = idx(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
      if (k >= 0) grid[k] = 1;
    }
  }
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), nn = new THREE.Vector3();
  const ring = [];
  for (let r = 0; r < 6; r++) ring.push([Math.cos((r / 6) * Math.PI * 2) * 0.64, Math.sin((r / 6) * Math.PI * 2) * 0.64]);
  const ao = (px, py, pz, nx, ny, nz) => {
    nn.set(nx, ny, nz);
    t1.set(Math.abs(nx) < 0.8 ? 1 : 0, Math.abs(nx) < 0.8 ? 0 : 1, 0).cross(nn).normalize();
    t2.crossVectors(nn, t1);
    let hit = 0, tot = 0;
    for (const [ca, sa] of ring) {
      const dx = nx * 0.77 + t1.x * ca + t2.x * sa, dy = ny * 0.77 + t1.y * ca + t2.y * sa, dz = nz * 0.77 + t1.z * ca + t2.z * sa;
      for (const d of [2.2, 3.6, 5.5]) {
        const k = idx(px + dx * d * h, py + dy * d * h, pz + dz * d * h);
        tot += 1 / d;
        if (k >= 0 && grid[k]) hit += 1 / d;
      }
    }
    for (const d of [2.0, 3.5, 6]) {
      const k = idx(px + nx * d * h, py + ny * d * h, pz + nz * d * h);
      tot += 1.5 / d;
      if (k >= 0 && grid[k]) hit += 1.5 / d;
    }
    return Math.min(1, (hit / tot) * 1.6);
  };
  for (const p of parts) {
    const Q = p.pos, N = p.nor, C = p.col;
    const soft = new Uint8Array(p.count);
    for (const [a, b] of p.skin || []) soft.fill(1, a, b);
    const memo = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(Q[i * 3] * 4000)},${Math.round(Q[i * 3 + 1] * 4000)},${Math.round(Q[i * 3 + 2] * 4000)},${Math.round(N[i * 3] * 8)},${Math.round(N[i * 3 + 1] * 8)},${Math.round(N[i * 3 + 2] * 8)}`;
      let o = memo.get(key);
      if (o == null) memo.set(key, (o = ao(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2])));
      const k = 1 - strength * (soft[i] ? 0.45 : 1) * o;
      C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k;
    }
  }
}

// lit geometry: the body plus its painted face decals, with uvs into the
// face atlas (everything that isn't a decal samples the atlas' white cell)
function litGeometry(B, F) {
  const parts = [B, B.detail, F].filter((p) => p && p.count);
  const total = parts.reduce((t, p) => t + p.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.pos, o * 3); nor.set(p.nor, o * 3); col.set(p.col, o * 3);
    if (p.uv) uv.set(p.uv, o * 2);
    else for (let i = 0; i < p.count; i++) { uv[(o + i) * 2] = WHITE_UV[0]; uv[(o + i) * 2 + 1] = WHITE_UV[1]; }
    for (const [a, b] of p.metal || []) for (let i = a; i < b; i++) { uv[(o + i) * 2] = METAL_UV[0]; uv[(o + i) * 2 + 1] = METAL_UV[1]; }
    for (const [a, b] of p.skin || []) for (let i = a; i < b; i++) { uv[(o + i) * 2] = SKIN_UV[0]; uv[(o + i) * 2 + 1] = SKIN_UV[1]; }
    o += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function buildModelGeometry(spec) {
  const key = JSON.stringify(spec);
  let entry = cache.get(key);
  if (entry) return entry;
  const fn = BUILDERS[spec.kind] || humanoid;
  const res = fn(spec);
  const s = spec.scale ?? (spec.kind === 'humanoid' || !spec.kind ? (RACE_LOOKS[spec.race] || RACE_LOOKS.human).scale : 1);
  if (res.B.detail && res.ao !== false) occlusion(res.B, res.ao ?? 0.38);
  if (!res.float && !res.noLean) { groundShade(res.B, res.height); if (res.B.detail) groundShade(res.B.detail, res.height); }
  const lit = res.B.count ? litGeometry(res.B, res.F) : null;
  const shell = res.B.count ? outlineGeometry(res.B.build()) : null;
  const glow = res.G.count ? res.G.build() : null;
  if (s !== 1) {
    lit && lit.scale(s, s, s);
    shell && shell.scale(s, s, s);
    glow && glow.scale(s, s, s);
  }
  entry = { lit, glow, shell, height: res.height * s, float: !!res.float, hover: res.hover || 0, noLean: !!res.noLean, boat: !!res.boat, head: res.head ? res.head.map((v) => v * s) : null, top: res.top != null ? res.top * s : null };
  cache.set(key, entry);
  return entry;
}

export function makeModel(spec, materials) {
  const g = buildModelGeometry(spec);
  const group = new THREE.Group();
  if (g.lit) {
    const m = new THREE.Mesh(g.lit, materials.entity);
    m.castShadow = true;
    group.add(m);
    if (materials.outline) {
      // the ink outline is about as costly as the figure itself: it is
      // dropped when the camera is far away and the figures are small
      const o = new THREE.Mesh(g.shell, materials.outline);
      o.userData.outline = true;
      const lod = new THREE.LOD();
      lod.addLevel(o, 0);
      lod.addLevel(new THREE.Object3D(), OUTLINE_FAR);
      lod.userData.outline = true;
      group.add(lod);
    }
  }
  if (g.glow) group.add(new THREE.Mesh(g.glow, materials.entityGlow));
  group.userData.info = g;
  return group;
}

export const MODEL_KINDS = Object.keys(BUILDERS);
