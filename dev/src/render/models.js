// Procedural low-poly models for characters, monsters and objects.
// Each model is built into one lit + one glow geometry (cached by spec).
// Models face +Z (towards the camera) with their feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL, shade } from './builder.js';
import { humanoid as figure, RACE_LOOKS, HAIR_STYLES } from './figures.js';
import { WHITE_UV, METAL_UV, SKIN_UV } from './faces.js';
import { quadruped, spider, wraith, bat, serpent, dragon, blob, ent } from './beasts.js';
import { tube, lathe, sheet, ball, extrude, mat, tint, deep } from './sculpt.js';

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

const BUILDERS = { humanoid, quadruped, spider, wraith, bat, serpent, dragon, blob, ent, chest, ship, waygate, sign, campfire, marker, shrine, lorestone, well };

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
