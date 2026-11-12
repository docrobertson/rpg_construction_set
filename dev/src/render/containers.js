// Containers: the other things treasure is found in (see data/containers.js
// for their names and words). Each is a little diorama about a square across,
// like the chest: chunky wood, stone and iron, painted like the land, and a glint
// of gold that says "something here" from across the map.
// Models face +Z (towards the camera) with their feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL } from './builder.js';
import { tube, lathe, sheet, ball, extrude, mat, tint, deep } from './sculpt.js';

const GOLDC = 0xe2b24a, IRONC = 0x5a5e66, WOODC = 0x8a5a30, STONE = 0xb4ac9c, MOSS = 0x6a9a3a, BONE = 0xeee4cc, GLINT = 0xffe080;

function kit() {
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
const _p = new THREE.Vector3();
// points carried through a matrix (for tubes, which take no matrix)
const xf = (m, pts) => pts.map(([x, y, z]) => { _p.set(x, y, z).applyMatrix4(m); return [_p.x, _p.y, _p.z]; });
// a few rough stones scattered round a base
function pebbles(B, n, r, col, seed = 1) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const d = r * (0.9 + 0.2 * Math.sin(k * 7.1 + seed));
    B.shape(TPL.dodec, k % 2 ? col : deep(col, 0.85), { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, sx: 0.06 + (k % 3) * 0.015, sy: 0.045, sz: 0.05, ry: k, flat: true });
  }
}
// a little spill of coins with a sparkle over it
function coins(B, G, x, y, z, n = 5, spread = 0.05, seed = 1) {
  MT(B, () => {
    for (let k = 0; k < n; k++) {
      const a = k * 2.4 + seed, d = spread * Math.sqrt((k + 0.5) / n);
      ball(B, k % 3 ? GOLDC : tint(GOLDC, 1.15), x + Math.cos(a) * d, y + 0.005 + (k % 2) * 0.006, z + Math.sin(a) * d, 0.021, 0.006, 0.021, { rx: 0.2 * Math.sin(k), rz: 0.2 * Math.cos(k) });
    }
  });
  G.shape(TPL.ico0, GLINT, { x, y: y + 0.03, z, s: 0.045 });
}
// tufts of grass at a foot
function tufts(B, pts, col = 0x5a8a34) {
  for (const [x, z, s = 1] of pts) for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + x * 9;
    tube(B, [[x, 0, z], [x + Math.cos(a) * 0.025 * s, 0.05 * s, z + Math.sin(a) * 0.025 * s]], [0.008, 0.002], col, { segs: 3, outline: true });
  }
}

// ---------------------------------------------------------------- an overturned cart
// The cart lies on its side in the ditch, its bed open to the road, one wheel
// up in the air and the other smashed; sacks have spilled out of it.
function cart(spec) {
  const { B, G } = kit();
  const wood = spec.color ?? 0xa8783e, dark = deep(wood, 0.6), inside = deep(wood, 0.72);
  const L = 0.26, H = 0.28, D = 0.17; // half its length, its bed's width (now its height), its depth
  // tipped over, leaning a little towards the road
  const m = mat(-0.07, 0, -0.06, 0.2, 0.14, 0);
  const box = (col, o) => B.box(col, { ...o, matrix: m });
  // the floor, now its back, and the side boards top and bottom
  box(inside, { x: 0, y: 0, z: -D / 2, sx: L * 2, sy: H, sz: 0.035 });
  for (const y of [0.07, 0.14, 0.21]) B.detail.box(deep(wood, 0.45), { x: 0, y, z: -D / 2 + 0.019, sx: L * 2 - 0.02, sy: 0.006, sz: 0.004, matrix: m });
  box(wood, { x: 0, y: H - 0.035, z: 0, sx: L * 2 + 0.02, sy: 0.035, sz: D, grad: 0.2 });
  for (const z of [-0.03, 0.03]) B.detail.box(deep(wood, 0.5), { x: 0, y: H + 0.001, z, sx: L * 2, sy: 0.004, sz: 0.005, matrix: m });
  box(dark, { x: 0, y: 0, z: 0, sx: L * 2 + 0.02, sy: 0.035, sz: D });
  for (const x of [-L, L]) box(tint(wood, 0.92), { x, y: 0, z: 0, sx: 0.035, sy: H, sz: D });
  // the rail along the open edge, and corner irons
  box(tint(wood, 1.12), { x: 0, y: H - 0.01, z: D / 2 - 0.012, sx: L * 2 + 0.06, sy: 0.03, sz: 0.03 });
  for (const x of [-L, L]) MT(B, () => box(IRONC, { x, y: H - 0.045, z: D / 2 - 0.006, sx: 0.045, sy: 0.055, sz: 0.035 }));
  // the axle out of its back, the top wheel turned to the sky: a rim with
  // an iron tyre, six spokes and a hub
  const wc = [-0.03, H + 0.06, -D / 2 - 0.05];
  tube(B, xf(m, [[wc[0], 0.08, wc[2]], [wc[0], wc[1] + 0.03, wc[2]]]), 0.02, IRONC, { segs: 6 });
  const wm = mul(m, mat(wc[0], wc[1], wc[2], Math.PI / 2, 0, 0));
  B.shape(TPL.torus, tint(wood, 1.12), { sx: 0.46, sy: 0.46, sz: 0.32, matrix: wm });
  MT(B, () => B.shape(TPL.torus, IRONC, { sx: 0.53, sy: 0.53, sz: 0.14, matrix: wm }));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + 0.3; tube(B, xf(wm, [[Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0], [-Math.cos(a) * 0.16, -Math.sin(a) * 0.16, 0]]), 0.013, deep(wood, 0.8), { segs: 5, outline: true }); }
  lathe(B, [[0.045, -0.03], [0.05, 0.0], [0.045, 0.03]], [deep(wood, 0.7), wood], { segs: 9, matrix: mul(wm, mat(0, 0, 0, Math.PI / 2, 0, 0)) });
  // the other wheel, smashed: a broken rim and spokes in the grass
  const arc = [];
  for (let k = 0; k <= 6; k++) { const a = 2.2 + (k / 6) * 2.0; arc.push([0.24 + Math.cos(a) * 0.17, 0.02, 0.17 + Math.sin(a) * 0.17 * 0.8]); }
  tube(B, arc, 0.024, tint(wood, 1.05), { segs: 5, sq: 0.7 });
  for (const [x, z, a] of [[0.33, 0.24, 0.6], [0.12, 0.3, -1.1]]) tube(B, [[x - Math.sin(a) * 0.08, 0.012, z - Math.cos(a) * 0.08], [x + Math.sin(a) * 0.08, 0.012, z + Math.cos(a) * 0.08]], 0.012, deep(wood, 0.8), { segs: 4, outline: true });
  // the shafts: one along the ground, one snapped and pointing at the sky
  tube(B, [xf(m, [[L, 0.04, -D / 2]])[0], [0.42, 0.025, -0.1], [0.56, 0.02, -0.02]], 0.02, wood, { segs: 6 });
  const up = xf(m, [[L, H - 0.05, -D / 2]])[0];
  tube(B, [up, [0.36, 0.42, -0.14], [0.44, 0.55, -0.12]], [0.022, 0.018], wood, { segs: 6, cap1: false });
  for (let k = 0; k < 3; k++) tube(B.detail, [[0.44, 0.55, -0.12], [0.445 + (k - 1) * 0.012, 0.585 + k * 0.006, -0.12 + (k - 1) * 0.01]], [0.009, 0.001], tint(wood, 1.3), { segs: 3 });
  // sacks: one still lashed in the bed, two spilled on the road, one split
  const sackC = 0xd8b880;
  ball(B, sackC, -0.16, 0.1, -0.04, 0.1, 0.085, 0.07, { grad: 0.3, matrix: m });
  sack(B, -0.12, 0.17, 0.5, 0.95, sackC);
  sack(B, 0.06, 0.16, -0.4, 0.8, tint(sackC, 0.92), true);
  // apples and a jar of honey rolled out, and the gleam of coin
  for (const [x, z] of [[-0.26, 0.24], [-0.02, 0.3], [0.17, 0.3], [0.04, 0.34]]) ball(B, 0xd0342a, x, 0.025, z, 0.027);
  lathe(B, [[0.03, 0], [0.035, 0.05], [0.025, 0.07], [0.028, 0.08]], [0xd8a030, 0xf0c050], { segs: 8, matrix: mat(-0.32, 0.035, 0.12, 0, 0, Math.PI / 2 - 0.2) });
  coins(B, G, 0.1, 0.02, 0.27, 4, 0.04, 2);
  tufts(B, [[-0.38, 0.06], [0.48, -0.18], [-0.32, -0.22, 1.2]]);
  return { B, G, height: 0.6, noLean: true };
}

// a grain sack lying on its side: a lumpy body, its neck tied with cord (split:
// slit open, its grain run out)
function sack(B, x, z, ry, s, col, split = false) {
  const m = mat(x, 0, z, 0, ry, 0);
  ball(B, col, 0, 0.065 * s, 0, 0.1 * s, 0.07 * s, 0.075 * s, { matrix: m, grad: 0.3 });
  ball(B, deep(col, 0.9), 0.07 * s, 0.07 * s, 0, 0.05 * s, 0.05 * s, 0.05 * s, { matrix: m });
  tube(B, [[0.1 * s, 0.07 * s, 0], [0.15 * s, 0.075 * s, 0]], [0.026 * s, 0.02 * s, 0.03 * s], col, { segs: 6, matrix: m });
  lathe(B.detail, [[0.024 * s, -0.008 * s], [0.026 * s, 0], [0.024 * s, 0.008 * s]], 0x7a5a30, { segs: 8, matrix: mul(m, mat(0.13 * s, 0.073 * s, 0, 0, 0, Math.PI / 2)) });
  ball(B, tint(col, 1.05), 0.17 * s, 0.075 * s, 0, 0.02 * s, 0.035 * s, 0.035 * s, { matrix: m });
  if (split) {
    // a slit in its side, and grain run out of it
    B.detail.box(0x3a2a18, { x: -0.02 * s, y: 0.1 * s, z: 0.07 * s, sx: 0.07 * s, sy: 0.012, sz: 0.008, matrix: m });
    for (let k = 0; k < 7; k++) ball(B.detail, 0xe8d090, -0.02 * s + Math.cos(k * 2.3) * 0.04 * s, 0.008, 0.11 * s + Math.abs(Math.sin(k * 1.7)) * 0.05 * s, 0.018 * s, 0.008, 0.018 * s, { matrix: m });
  }
}

// ---------------------------------------------------------------- a loose flagstone
// A patch of old paving with one slab heaved up on its far edge like a
// trapdoor, a dark hole beneath it with gold glinting in it, and the bar that
// prised it up dropped in the grass.
function flagstone(spec) {
  const { B, G } = kit();
  const st = spec.color ?? 0xb2aa98;
  // the slabs round about, uneven, set a little proud of the ground
  const slabs = [[-0.2, -0.14, 0.2, 0.18, 0.1], [0.12, -0.18, 0.2, 0.14, -0.06], [0.24, 0.06, 0.12, 0.2, 0.08], [-0.24, 0.1, 0.13, 0.18, -0.1], [-0.06, 0.24, 0.2, 0.08, 0.04], [0.16, 0.25, 0.12, 0.08, -0.05]];
  slabs.forEach(([x, z, sx, sz, ry], i) => B.box(i % 2 ? st : deep(st, 0.9), { x, y: 0, z, sx, sy: 0.035, sz, ry, grad: 0.4 }));
  // the hole: a dark pit framed by the slabs' edges, gold in its bottom
  B.detail.box(0x1a1410, { x: 0, y: 0.002, z: 0.03, sx: 0.24, sy: 0.012, sz: 0.2 });
  B.detail.box(0x2a2018, { x: 0, y: 0.002, z: -0.075, sx: 0.24, sy: 0.03, sz: 0.012 });
  coins(B, G, -0.03, 0.012, 0.05, 5, 0.06, 0.7);
  ball(B, 0x7a4a2a, 0.06, 0.03, 0.02, 0.04, 0.03, 0.035); // a leather purse
  ball(B.detail, 0x5a3420, 0.06, 0.058, 0.02, 0.012);
  // the slab itself, heaved up on its far edge like a trapdoor and leaning
  // back, its earthy underside to the viewer
  const hinge = mat(0.01, 0.03, -0.075, -1.78, 0.1, 0);
  B.box(deep(st, 0.92), { x: 0, y: 0, z: 0.11, sx: 0.25, sy: 0.045, sz: 0.22, matrix: hinge, grad: 0.3 });
  for (const [x, z, w] of [[-0.05, 0.06, 0.1], [0.04, 0.12, 0.14], [-0.02, 0.18, 0.08]]) B.detail.box(0x5a4a38, { x, y: -0.004, z, sx: w, sy: 0.004, sz: 0.012, matrix: hinge });
  ball(B, MOSS, -0.08, 0.04, 0.2, 0.04, 0.012, 0.03, { matrix: hinge });
  // the bar that prised it up, dropped in the grass
  MT(B, () => tube(B, [[0.1, 0.012, 0.2], [0.3, 0.012, 0.13]], 0.013, IRONC, { segs: 5, outline: true }));
  pebbles(B, 4, 0.36, 0x8a8478, 0.4);
  return { B, G, height: 0.3, noLean: true };
}

// ---------------------------------------------------------------- a loose stone in a wall
// A stub of old drystone wall; one stone has been worked out of its face and
// lies at its foot, and something glints in the hole it left.
function wallstone(spec) {
  const { B, G } = kit();
  const st = spec.color ?? 0xb0a898;
  const W = 0.3, Dp = 0.1, top = [0.36, 0.42, 0.4, 0.3, 0.34, 0.26]; // the broken top
  // the core of the wall, then courses of stones on its face and top
  B.box(deep(st, 0.55), { x: 0, y: 0, z: 0, sx: W * 2, sy: 0.24, sz: Dp * 2 - 0.02 });
  const courses = [0, 0.075, 0.15, 0.225, 0.3];
  courses.forEach((y, row) => {
    let x = -W + (row % 2 ? 0.05 : 0);
    let k = 0;
    while (x < W - 0.02) {
      const w = 0.09 + ((row * 7 + k * 3) % 4) * 0.025;
      const x1 = Math.min(W, x + w);
      const cx = (x + x1) / 2, idx = Math.min(top.length - 1, Math.floor(((cx + W) / (W * 2)) * top.length));
      if (y + 0.06 <= top[idx]) {
        const hole = row === 2 && cx > -0.12 && cx < 0.02;
        const c = [st, tint(st, 1.07), deep(st, 0.88), tint(st, 0.95)][(row + k) % 4];
        if (!hole) B.shape(TPL.box, c, { x: cx, y: y + 0.004, z: 0.006, sx: x1 - x - 0.012, sy: 0.068, sz: Dp * 2 + 0.01, flat: true, grad: 0.2 });
        else {
          // the hole: dark, coins at its lip
          B.detail.box(0x16120e, { x: cx, y: y + 0.004, z: Dp - 0.01, sx: x1 - x - 0.01, sy: 0.068, sz: 0.012 });
          coins(B, G, cx, y + 0.004, Dp + 0.01, 3, 0.022, 1.5);
        }
      }
      x = x1;
      k++;
    }
  });
  // rounded capstones on what is left of the top, moss on them
  for (let i = 0; i < top.length; i++) {
    const x = -W + (i + 0.5) * (W * 2 / top.length);
    B.shape(TPL.dodec, i % 2 ? st : tint(st, 1.08), { x, y: top[i] - 0.03, z: 0, sx: 0.1, sy: 0.06, sz: Dp * 2, ry: i, flat: true });
    if (i % 2 === 0) ball(B, MOSS, x + 0.01, top[i] + 0.015, 0.02, 0.05, 0.016, 0.06);
  }
  // the stone that came out, lying in the grass
  B.shape(TPL.box, tint(st, 1.1), { x: -0.02, y: 0, z: 0.22, sx: 0.12, sy: 0.07, sz: 0.1, ry: 0.5, rz: 0.2, flat: true, grad: 0.3 });
  tufts(B, [[-0.26, 0.14], [0.28, 0.14, 1.2], [0.12, 0.2]]);
  pebbles(B, 3, 0.36, 0x8a8478, 2.2);
  return { B, G, height: 0.45, noLean: true };
}

// ---------------------------------------------------------------- barrels
// a barrel standing (or lying along x when `lie` is a matrix)
function barrel(B, r, h, wood, matrix, open = false) {
  const prof = [[r * 0.84, 0], [r * 0.95, h * 0.2], [r, h * 0.5], [r * 0.95, h * 0.8], [r * 0.84, h]];
  lathe(B, prof, [deep(wood, 0.8), wood, tint(wood, 1.08), wood], { segs: 12, matrix });
  // staves: dark seams down the side facing the viewer
  for (let k = -2; k <= 2; k++) {
    const a = k * 0.45;
    B.detail.box(deep(wood, 0.5), { x: Math.sin(a) * r * 1.0, y: h * 0.12, z: Math.cos(a) * r * 1.0, sx: 0.004, sy: h * 0.76, sz: 0.004, ry: a, matrix });
  }
  for (const y of [h * 0.13, h * 0.87]) MT(B, () => lathe(B, [[r * 0.9 + 0.006, y - 0.014], [r * 0.92 + 0.008, y], [r * 0.9 + 0.006, y + 0.014]], IRONC, { segs: 12, matrix }));
  for (const y of [h * 0.36, h * 0.64]) MT(B, () => lathe(B.detail, [[r * 0.99 + 0.002, y - 0.01], [r + 0.004, y], [r * 0.99 + 0.002, y + 0.01]], IRONC, { segs: 12, matrix }));
  lathe(B, [[0.002, h - 0.012], [r * 0.82, h - 0.008]], open ? 0x1e1610 : tint(wood, 1.12), { segs: 12, matrix });
}
function barrels(spec) {
  const { B, G } = kit();
  const wood = spec.color ?? 0x9a6a38;
  barrel(B, 0.12, 0.34, wood, mat(-0.13, 0, -0.08, 0, 0.3, 0), true);
  barrel(B, 0.11, 0.31, tint(wood, 0.92), mat(0.14, 0, -0.13, 0, -0.5, 0));
  // one on its side in front, its lid off, coins run out of it
  barrel(B, 0.1, 0.28, tint(wood, 1.05), mat(0.16, 0.1, 0.12, 0, 0.35, Math.PI / 2), true);
  coins(B, G, -0.06, 0.0, 0.2, 5, 0.07, 0.3);
  coins(B, G, -0.13, 0.33, -0.08, 4, 0.05, 1.1);
  // the lid, leaning against the open barrel
  lathe(B, [[0.002, 0], [0.095, 0.002], [0.095, 0.02], [0.002, 0.022]], [tint(wood, 1.1), deep(wood, 0.8)], { segs: 12, matrix: mat(-0.3, 0.1, 0.0, 0.2, 0, 1.3) });
  tufts(B, [[0.3, 0.02], [-0.3, -0.14]]);
  return { B, G, height: 0.45, noLean: true };
}

// ---------------------------------------------------------------- crates
// a crate: boards with a frame of battens and a brace across its face
function crate(B, x, y, z, s, wood, ry = 0, mark = null) {
  const m = mat(x, y, z, 0, ry, 0);
  const b = deep(wood, 0.72);
  B.box(wood, { y: 0, sx: s, sy: s, sz: s, matrix: m, grad: 0.15 });
  for (const zz of [s / 2 + 0.005, -s / 2 - 0.005]) {
    for (const yy of [0, s - 0.03]) B.box(b, { y: yy, z: zz, sx: s + 0.01, sy: 0.03, sz: 0.012, matrix: m });
    for (const xx of [-s / 2 + 0.015, s / 2 - 0.015]) B.box(b, { x: xx, y: 0, z: zz, sx: 0.03, sy: s, sz: 0.012, matrix: m });
    B.box(b, { y: s / 2 - 0.015, z: zz, sx: s * 1.18, sy: 0.026, sz: 0.01, rz: Math.PI / 4, matrix: m });
  }
  for (const xx of [s / 2 + 0.005, -s / 2 - 0.005]) for (const yy of [0, s - 0.03]) B.box(b, { x: xx, y: yy, sx: 0.012, sy: 0.03, sz: s, matrix: m });
  for (let k = 1; k < 4; k++) B.detail.box(deep(wood, 0.6), { x: -s / 2 + (k / 4) * s, y: s + 0.001, sx: 0.004, sy: 0.003, sz: s - 0.02, matrix: m });
  if (mark != null) B.detail.box(mark, { x: s * 0.22, y: s * 0.3, z: s / 2 + 0.013, sx: s * 0.18, sy: s * 0.18, sz: 0.003, rz: Math.PI / 4, matrix: m });
}
function crates(spec) {
  const { B, G } = kit();
  const wood = spec.color ?? 0xb8864a;
  crate(B, -0.13, 0, -0.1, 0.24, wood, 0.08, 0x8a2a1a);
  crate(B, 0.14, 0, -0.12, 0.22, tint(wood, 0.9), -0.12);
  crate(B, -0.02, 0.24, -0.11, 0.2, tint(wood, 1.06), 0.3, 0x2a3a6a);
  // a small one in front, its lid prised off and straw spilling out
  const s = 0.16, m = mat(0.16, 0, 0.17, 0, -0.35, 0);
  B.box(wood, { y: 0, sx: s, sy: s * 0.8, sz: s, matrix: m });
  for (const zz of [s / 2 + 0.005, -s / 2 - 0.005]) B.box(deep(wood, 0.72), { y: s * 0.8 - 0.024, z: zz, sx: s + 0.01, sy: 0.024, sz: 0.01, matrix: m });
  B.detail.box(0x2a1e14, { y: s * 0.8 - 0.004, sx: s - 0.02, sy: 0.006, sz: s - 0.02, matrix: m });
  for (let k = 0; k < 6; k++) ball(B, k % 2 ? 0xe8cc70 : 0xd8b858, Math.cos(k * 1.9) * 0.05, s * 0.8 + 0.01, Math.sin(k * 1.9) * 0.05, 0.035, 0.015, 0.025, { matrix: m, ry: k });
  coins(B, G, 0.16, s * 0.8 + 0.01, 0.17, 3, 0.03, 0.9);
  B.box(tint(wood, 1.05), { x: -0.12, y: 0.0, z: 0.2, sx: 0.18, sy: 0.02, sz: 0.17, ry: 0.5, rz: 0.12 }); // the lid
  MT(B, () => tube(B, [[-0.2, 0.03, 0.26], [-0.03, 0.05, 0.25]], 0.01, IRONC, { segs: 4, outline: true })); // the crowbar
  return { B, G, height: 0.5, noLean: true };
}

// ---------------------------------------------------------------- sacks
function sacks(spec) {
  const { B, G } = kit();
  const col = spec.color ?? 0xc89e64;
  // two standing at the back, slumped against each other
  for (const [x, z, s, lean, c] of [[-0.12, -0.1, 1.0, 0.2, col], [0.11, -0.12, 0.92, -0.25, tint(col, 0.9)]]) {
    const m = mat(x, 0, z, 0, 0, lean);
    lathe(B, [[0.09 * s, 0], [0.12 * s, 0.05 * s], [0.125 * s, 0.13 * s], [0.1 * s, 0.2 * s], [0.05 * s, 0.24 * s], [0.03 * s, 0.25 * s]], [deep(c, 0.85), c, tint(c, 1.06)], { segs: 10, sq: 0.85, matrix: m });
    lathe(B.detail, [[0.034 * s, 0.245 * s], [0.04 * s, 0.25 * s], [0.034 * s, 0.258 * s]], 0x7a5a30, { segs: 8, matrix: m });
    ball(B, tint(c, 1.05), 0, 0.28 * s, 0, 0.04 * s, 0.035 * s, 0.035 * s, { matrix: m });
    // a stencilled mark
    B.detail.box(c === col ? 0x8a3a2a : 0x3a4a6a, { y: 0.1 * s, z: 0.108 * s, sx: 0.05, sy: 0.05, sz: 0.004, rz: Math.PI / 4, matrix: m });
  }
  // two lying in front, one split open with grain and coin run out of it
  sack(B, -0.08, 0.13, 0.3, 1.05, tint(col, 1.05));
  sack(B, 0.16, 0.12, -0.9, 0.85, deep(col, 0.92), true);
  coins(B, G, 0.08, 0.0, 0.26, 4, 0.04, 0.4);
  // a mouse!
  ball(B, 0x8a8078, -0.27, 0.02, 0.08, 0.025, 0.018, 0.03);
  tube(B.detail, [[-0.27, 0.015, 0.05], [-0.29, 0.01, 0.0]], 0.003, 0xc89080, { segs: 3 });
  for (const s of [-1, 1]) ball(B.detail, 0xd8a0a0, -0.27 + s * 0.012, 0.04, 0.095, 0.009);
  return { B, G, height: 0.4, noLean: true };
}

// ---------------------------------------------------------------- clay urns
// an urn: foot, belly, shoulder, neck and lip, with painted bands
function urn(B, prof, col, band, matrix, handles = 0) {
  lathe(B, prof, [deep(col, 0.75), col, tint(col, 1.1), col], { segs: 12, matrix });
  for (const t of [0.42, 0.62]) {
    const i = Math.min(prof.length - 2, Math.floor(t * (prof.length - 1)));
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    const y = y0 + (y1 - y0) * 0.5, r = (r0 + r1) / 2;
    lathe(B.detail, [[r + 0.001, y - 0.01], [r + 0.004, y], [r + 0.001, y + 0.01]], band, { segs: 12, matrix });
  }
  if (handles) {
    const top = prof[prof.length - 2][1], neck = prof[prof.length - 2][0];
    for (const s of [-1, 1]) tube(B, xf(matrix, [[s * neck, top - 0.01, 0], [s * (neck + 0.05), top - 0.01, 0], [s * (neck + 0.045), top - 0.08, 0], [s * (neck + 0.02), top - 0.1, 0]]), 0.012, col, { segs: 5, outline: true });
  }
}
function urns(spec) {
  const { B, G } = kit();
  const col = spec.color ?? 0xc0683a, band = 0x2a1a14;
  // a tall amphora, a squat jar with its lid, and one broken
  urn(B, [[0.04, 0], [0.07, 0.03], [0.12, 0.12], [0.13, 0.2], [0.1, 0.3], [0.05, 0.36], [0.045, 0.42], [0.06, 0.44]], col, band, mat(-0.12, 0, -0.08, 0, 0.3, 0), 2);
  urn(B, [[0.06, 0], [0.1, 0.04], [0.12, 0.1], [0.1, 0.17], [0.07, 0.19], [0.075, 0.21]], tint(col, 1.08), band, mat(0.14, 0, -0.1, 0, 0, 0));
  lathe(B, [[0.08, 0.21], [0.07, 0.235], [0.02, 0.25], [0.025, 0.27], [0.002, 0.275]], [deep(col, 0.85), col], { segs: 10, dx: () => 0.14, matrix: mat(0, 0, -0.1) });
  // the broken one: its bottom half standing, shards about, coins spilled
  lathe(B, [[0.05, 0], [0.09, 0.04], [0.105, 0.09], [0.1, 0.1]], [deep(col, 0.75), col], { segs: 10, matrix: mat(0.04, 0, 0.15) });
  lathe(B.detail, [[0.002, 0.08], [0.095, 0.085]], 0x2a1a12, { segs: 10, matrix: mat(0.04, 0, 0.15) });
  for (const [x, z, a, s] of [[-0.12, 0.2, 0.4, 1], [0.2, 0.16, -0.8, 0.8], [-0.04, 0.3, 1.9, 0.7]]) {
    sheet(B, (u, v) => [(u - 0.5) * 0.08 * s, 0.015 + Math.sin(u * Math.PI) * 0.02, (v - 0.5) * 0.06 * s], [col, deep(col, 0.8)], { nu: 2, nv: 1, thick: 0.01, matrix: mat(x, 0, z, 0, a, 0), back: deep(col, 0.6) });
  }
  coins(B, G, 0.0, 0.0, 0.25, 5, 0.06, 0.2);
  coins(B, G, 0.04, 0.085, 0.15, 3, 0.03, 1.4);
  return { B, G, height: 0.5, noLean: true };
}

// ---------------------------------------------------------------- a stone sarcophagus
// A stone coffin on a plinth, a knight carved on its lid; the lid has been
// pushed askew and something gleams in the gap.
function sarcophagus(spec) {
  const { B, G } = kit();
  const st = spec.color ?? 0xb8b0a0;
  B.box(deep(st, 0.7), { y: 0, sx: 0.74, sy: 0.05, sz: 0.4, grad: 0.3 });
  B.box(st, { y: 0.05, sx: 0.64, sy: 0.2, sz: 0.3, grad: 0.25 });
  // carved panels along the front
  for (const x of [-0.2, 0, 0.2]) {
    B.detail.box(deep(st, 0.72), { x, y: 0.085, z: 0.151, sx: 0.16, sy: 0.12, sz: 0.004 });
    B.detail.box(tint(st, 1.08), { x, y: 0.1, z: 0.154, sx: 0.1, sy: 0.08, sz: 0.004 });
  }
  // the dark gap, and the glint in it
  B.detail.box(0x161210, { x: -0.04, y: 0.246, z: -0.02, sx: 0.54, sy: 0.006, sz: 0.24 });
  coins(B, G, -0.23, 0.25, -0.07, 4, 0.04, 0.5);
  // the lid, slid aside, the carved knight on it
  const lid = mat(0.12, 0.25, 0.08, 0, -0.2, 0);
  B.box(tint(st, 1.04), { y: 0, sx: 0.66, sy: 0.05, sz: 0.32, matrix: lid, grad: 0.2 });
  B.box(st, { y: 0.05, sx: 0.6, sy: 0.02, sz: 0.27, matrix: lid });
  const fig = tint(st, 1.12);
  ball(B, fig, 0.22, 0.1, 0, 0.05, 0.035, 0.045, { matrix: lid }); // head on its pillow
  B.box(deep(st, 0.95), { x: 0.24, y: 0.07, sx: 0.08, sy: 0.02, sz: 0.12, matrix: lid });
  ball(B, fig, 0.02, 0.09, 0, 0.17, 0.03, 0.08, { matrix: lid }); // body
  B.box(fig, { x: 0.02, y: 0.09, sx: 0.04, sy: 0.04, sz: 0.04, ry: Math.PI / 4, matrix: lid }); // folded hands
  tube(B, [[0.06, 0.105, 0], [-0.18, 0.105, 0]], 0.012, fig, { segs: 5, matrix: lid }); // the sword on his breast
  B.box(fig, { x: 0.07, y: 0.1, sx: 0.012, sy: 0.016, sz: 0.07, matrix: lid });
  for (const s of [-1, 1]) ball(B, fig, -0.2, 0.08, s * 0.035, 0.03, 0.03, 0.025, { matrix: lid }); // feet
  pebbles(B, 4, 0.42, deep(st, 0.75), 0.3);
  return { B, G, height: 0.45, noLean: true };
}

// ---------------------------------------------------------------- a wooden coffin
const COFFIN = [[-0.3, -0.065], [0.1, -0.12], [0.3, -0.085], [0.3, 0.085], [0.1, 0.12], [-0.3, 0.065]];
const COFFIN_IN = COFFIN.map(([x, y]) => [x * 0.86 + 0.01, y * 0.72]);
// flat on the ground: the outline in the x/z plane, its depth upwards
const flat = (x, y, z, ry, h) => mul(mat(x, y + h / 2, z, 0, ry, 0), mat(0, 0, 0, -Math.PI / 2, 0, 0));
function coffin(spec) {
  const { B, G } = kit();
  const wood = spec.color ?? 0x6a4228;
  const ry = 0.12;
  extrude(B, 'coffinBody', COFFIN, [deep(wood, 0.75), wood], { depth: 0.14, bevel: 0.008, matrix: flat(0, 0, 0, ry, 0.15), rim: 0.8 });
  extrude(B.detail, 'coffinInside', COFFIN_IN, 0x1a120c, { depth: 0.004, bevel: 0, matrix: flat(0, 0.15, 0, ry, 0.004) });
  coins(B, G, -0.04, 0.156, 0.06, 3, 0.025, 0.3);
  ball(B, BONE, 0.17, 0.17, 0.05, 0.035, 0.03, 0.035); // a skull peeping out
  for (const s of [-1, 1]) ball(B.detail, 0x2a221a, 0.18 + s * 0.012, 0.175, 0.08, 0.008);
  // the lid, prised up and lying askew across it
  const lm = mul(mat(-0.02, 0.17, -0.07, 0.0, ry + 0.22, -0.05), mat(0, 0, 0, -Math.PI / 2 + 0.08, 0, 0));
  extrude(B, 'coffinLid', COFFIN, [wood, tint(wood, 1.15)], { depth: 0.035, bevel: 0.008, matrix: lm, rim: 0.75 });
  MT(B, () => { for (const [x, y] of [[-0.18, 0], [0.04, 0.0], [0.2, 0]]) ball(B.detail, GOLDC, x, y, 0.024, 0.01, 0.01, 0.006, { matrix: lm }); });
  MT(B, () => B.box(GOLDC, { x: 0.12, y: -0.03, z: 0.022, sx: 0.08, sy: 0.06, sz: 0.006, matrix: lm })); // a name-plate
  // brass handles on its side
  for (const x of [-0.14, 0.08]) MT(B, () => tube(B, xf(mat(0, 0, 0, 0, ry, 0), [[x - 0.03, 0.08, 0.1], [x, 0.06, 0.13], [x + 0.03, 0.08, 0.1]]), 0.008, GOLDC, { segs: 4, outline: true }));
  // the spade that dug it up
  MT(B, () => B.box(IRONC, { x: 0.36, y: 0.02, z: 0.16, sx: 0.08, sy: 0.012, sz: 0.1, ry: 0.4, rz: 0.15 }));
  tube(B, [[0.33, 0.035, 0.12], [0.2, 0.06, -0.12]], 0.012, WOODC, { segs: 5, outline: true });
  pebbles(B, 4, 0.38, 0x7a6a5a, 1.7);
  return { B, G, height: 0.3, noLean: true };
}

// ---------------------------------------------------------------- an iron strongbox
function strongbox(spec) {
  const { B, G } = kit();
  const iron = spec.color ?? 0x4e535e, brass = 0xc89a40;
  const W = 0.19, D = 0.13, H = 0.17;
  MT(B, () => {
    B.box(deep(iron, 0.8), { y: 0, sx: W * 2, sy: H, sz: D * 2, grad: 0.3 });
    B.box(tint(iron, 1.15), { y: H, sx: W * 2 + 0.02, sy: 0.05, sz: D * 2 + 0.02, grad: 0.2 });
    // straps over the lid and down the front, studded with rivets
    for (const x of [-W * 0.6, W * 0.6]) {
      B.box(deep(iron, 0.6), { x, y: 0.0, z: D + 0.003, sx: 0.04, sy: H + 0.05, sz: 0.01 });
      B.box(deep(iron, 0.6), { x, y: H + 0.05, sx: 0.04, sy: 0.008, sz: D * 2 + 0.03 });
      for (let k = 0; k < 4; k++) ball(B.detail, tint(iron, 1.5), x, 0.025 + k * 0.05, D + 0.01, 0.008);
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) B.box(deep(iron, 0.6), { x: x * (W - 0.015), y: 0, z: z * (D - 0.015), sx: 0.04, sy: H, sz: 0.04 });
  });
  // the hasp and a great brass padlock
  MT(B, () => {
    B.box(brass, { y: H - 0.02, z: D + 0.006, sx: 0.04, sy: 0.07, sz: 0.012 });
    B.shape(TPL.torus, brass, { y: H - 0.06, z: D + 0.03, sx: 0.07, sy: 0.08, sz: 0.25 });
    B.box(brass, { y: H - 0.16, z: D + 0.03, sx: 0.08, sy: 0.075, sz: 0.035 });
  });
  B.detail.box(0x1a1410, { y: H - 0.14, z: D + 0.048, sx: 0.012, sy: 0.03, sz: 0.003 });
  // it sits on two planks, a coin or two dropped beside it
  for (const z of [-0.08, 0.08]) B.box(WOODC, { y: 0, z, sx: 0.5, sy: 0.02, sz: 0.07 });
  coins(B, G, 0.24, 0.02, 0.14, 3, 0.03, 0.8);
  G.shape(TPL.ico0, GLINT, { x: -0.05, y: H + 0.07, z: 0.05, s: 0.04 });
  return { B, G, height: 0.3, noLean: true };
}

// ---------------------------------------------------------------- a hollow log
// A fallen tree, hollow at one end, mossy and grown with toadstools; a bundle
// glints inside.
function hollowlog(spec) {
  const { B, G } = kit();
  const bark = spec.color ?? 0x6a4a2e, pale = 0xd8b884;
  const a = [-0.26, 0.12, 0.12], b = [0.3, 0.11, -0.1];
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  tube(B, [a, [0.02, 0.125, 0.02], b], [0.12, 0.125, 0.11], [deep(bark, 0.8), bark, deep(bark, 0.85)], { segs: 11, cap: false });
  // bark ridges
  for (let k = 0; k < 5; k++) {
    const t = 0.1 + k * 0.18, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    B.detail.box(deep(bark, 0.55), { x: p[0], y: p[1] + 0.06, z: p[2] + 0.1, sx: 0.006, sy: 0.07, sz: 0.006, ry: 0.4 });
  }
  // the ends: the hollow one facing the road, the other sawn
  const face = (p, d, hollow) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
    lathe(B, [[0.12, -0.004], [0.122, 0.0], hollow ? [0.08, 0.004] : [0.002, 0.004]], hollow ? [bark, pale] : [bark, pale], { segs: 11, matrix: m });
    if (hollow) lathe(B.detail, [[0.002, -0.01], [0.082, -0.002]], 0x140e0a, { segs: 11, matrix: m });
    else for (const r of [0.04, 0.08]) lathe(B.detail, [[r - 0.004, 0.0045], [r, 0.005], [r + 0.004, 0.0045]], deep(pale, 0.8), { segs: 11, matrix: m });
  };
  face(a, dir.clone().negate(), true);
  face(b, dir, false);
  // a bundle wedged in the hollow, coins dropped at its mouth
  ball(B, 0x8a6a40, a[0] - dir.x * 0.01, 0.08, a[2] - dir.z * 0.01, 0.05, 0.04, 0.05);
  coins(B, G, a[0] - 0.05, 0, a[2] + 0.1, 4, 0.04, 2.5);
  G.shape(TPL.ico0, GLINT, { x: a[0] + 0.0, y: 0.12, z: a[2] + 0.01, s: 0.045 });
  // a broken branch, moss and toadstools
  tube(B, [[0.1, 0.2, -0.02], [0.14, 0.32, 0.0], [0.2, 0.38, -0.03]], [0.03, 0.012], bark, { segs: 6 });
  ball(B, MOSS, 0.0, 0.23, 0.0, 0.12, 0.03, 0.08);
  ball(B, deep(MOSS, 0.85), 0.2, 0.2, -0.08, 0.07, 0.025, 0.06);
  for (const [x, z, s] of [[-0.1, 0.12, 1], [-0.04, 0.14, 0.7], [0.24, 0.05, 0.85]]) {
    const y = 0.17;
    tube(B, [[x, y, z], [x, y + 0.05 * s, z + 0.01]], 0.01 * s, 0xf0e4cc, { segs: 4, outline: true });
    lathe(B, [[0.002, y + 0.045 * s], [0.035 * s, y + 0.05 * s], [0.03 * s, y + 0.065 * s], [0.002, y + 0.075 * s]].map(([r, yy]) => [r, yy, r, z]), [0xb8301c, 0xe04a2a], { segs: 8, dx: () => x });
  }
  tufts(B, [[-0.36, -0.04], [0.38, 0.06], [0.0, 0.26]], 0x4a7a2a);
  return { B, G, height: 0.42, noLean: true };
}

// ---------------------------------------------------------------- a great nest
// A great nest of sticks on a broken stump: eggs, a feather, and something
// bright the bird has stolen.
function nest(spec) {
  const { B, G } = kit();
  const bark = 0x6a4a2e, twig = spec.color ?? 0x8a6a42;
  // the stump, its roots gripping the ground
  lathe(B, [[0.16, 0], [0.14, 0.05], [0.12, 0.18], [0.125, 0.2]], [deep(bark, 0.75), bark], { segs: 10 });
  lathe(B.detail, [[0.002, 0.2], [0.124, 0.2]], 0xd8b884, { segs: 10 });
  for (let k = 0; k < 5; k++) {
    const an = k * 1.26 + 0.3;
    tube(B, [[Math.cos(an) * 0.1, 0.06, Math.sin(an) * 0.1], [Math.cos(an) * 0.2, 0.02, Math.sin(an) * 0.2], [Math.cos(an + 0.2) * 0.27, 0, Math.sin(an + 0.2) * 0.27]], [0.035, 0.015], [bark, deep(bark, 0.8)], { segs: 6 });
  }
  // the nest: a ring of sticks, woven round and round
  const R = 0.19, y0 = 0.2;
  lathe(B, [[0.08, y0], [0.17, y0 + 0.03], [0.21, y0 + 0.08], [0.19, y0 + 0.12], [0.14, y0 + 0.1], [0.09, y0 + 0.05]], [deep(twig, 0.7), twig, tint(twig, 1.15), deep(twig, 0.6)], { segs: 14 });
  for (let k = 0; k < 16; k++) {
    const an = (k / 16) * Math.PI * 2, sp = 0.7 + (k % 3) * 0.15;
    const y = y0 + 0.05 + (k % 4) * 0.018;
    const pts = [0, 0.5, 1].map((t) => { const q = an + (t - 0.5) * sp; const r = R + 0.01 + Math.sin(t * Math.PI) * 0.012 * (k % 2 ? 1 : -1); return [Math.cos(q) * r, y + (t - 0.5) * 0.03 * (k % 2 ? 1 : -1), Math.sin(q) * r]; });
    tube(B, pts, 0.012, [twig, tint(twig, 1.25), deep(twig, 0.7)][k % 3], { segs: 4, outline: true });
  }
  for (let k = 0; k < 4; k++) { const an = k * 1.7 + 0.4; tube(B, [[Math.cos(an) * 0.18, y0 + 0.08, Math.sin(an) * 0.18], [Math.cos(an) * 0.3, y0 + 0.12 + (k % 2) * 0.04, Math.sin(an) * 0.3]], [0.01, 0.004], tint(twig, 1.1), { segs: 4, outline: true }); }
  lathe(B.detail, [[0.002, y0 + 0.07], [0.15, y0 + 0.075]], 0x4a3420, { segs: 12 });
  // three speckled eggs, a feather, and a stolen gold ring
  for (const [x, z, r] of [[-0.05, -0.02, 0.4], [0.03, -0.05, -0.5], [0.0, 0.04, 1.2]]) {
    ball(B, 0xcfe4e0, x, y0 + 0.1, z, 0.04, 0.03, 0.05, { ry: r });
    ball(B.detail, 0x7a8a7a, x + 0.012, y0 + 0.125, z + 0.012, 0.007);
  }
  MT(B, () => B.shape(TPL.torus, GOLDC, { x: 0.07, y: y0 + 0.08, z: 0.06, sx: 0.07, sy: 0.07, sz: 0.4, rx: 1.2 }));
  G.shape(TPL.ico0, GLINT, { x: 0.07, y: y0 + 0.11, z: 0.06, s: 0.05 });
  sheet(B, (u, v) => [-0.14 + u * 0.16, y0 + 0.14 + Math.sin(u * 3) * 0.02, 0.1 + (v - 0.5) * 0.04 * (1 - u * 0.6)], [0xf4f0e8, 0x9a9aa8], { nu: 3, nv: 1, thick: 0.006 });
  return { B, G, height: 0.45, noLean: true };
}

// ---------------------------------------------------------------- a fallen adventurer
// A skeleton lying on the rags of its cloak, its head against a rock, helm
// and sword beside it and its satchel spilling gold. (Lying along the row:
// legs stretched towards the camera would read as a figure standing up.)
function remains(spec) {
  const { B, G } = kit();
  const cloak = spec.color ?? 0x4a6a3a;
  // a rock at its head, moss on it
  B.shape(TPL.dodec, 0x9a9488, { x: -0.3, y: 0.05, z: -0.16, sx: 0.26, sy: 0.24, sz: 0.2, ry: 0.4, flat: true, grad: 0.4 });
  B.shape(TPL.dodec, 0xa8a296, { x: 0.3, y: 0.02, z: -0.2, sx: 0.14, sy: 0.1, sz: 0.12, ry: 1.1, flat: true });
  ball(B, MOSS, -0.32, 0.16, -0.17, 0.08, 0.022, 0.06);
  // it lies on its back on the rags of its cloak, its head against the rock
  sheet(B.detail, (u, v) => [-0.3 + u * 0.56, 0.008 + Math.sin(u * 11 + v * 3) * 0.004, -0.13 + v * 0.24 + Math.sin(u * 7) * 0.02], [tint(cloak, 1.08), deep(cloak, 0.75)], { nu: 6, nv: 2, thick: 0.006, back: deep(cloak, 0.5) });
  const bone = (pts, r = 0.017) => tube(B, pts, [r, r * 0.8, r], BONE, { segs: 6, outline: true });
  const knob = (x, y, z, r = 0.021) => ball(B, BONE, x, y, z, r);
  // spine, ribs and pelvis
  bone([[-0.17, 0.05, -0.01], [-0.06, 0.035, 0.0], [0.02, 0.03, 0.0]], 0.015);
  for (let k = 0; k < 4; k++) {
    const x = -0.15 + k * 0.035, w = 0.07 - Math.abs(k - 1.2) * 0.008;
    for (const s of [-1, 1]) bone([[x, 0.05, 0], [x + 0.01, 0.08, s * w * 0.6], [x + 0.02, 0.04, s * w]], 0.01);
  }
  ball(B, BONE, 0.04, 0.035, 0.0, 0.045, 0.03, 0.07);
  // legs, one knee drawn up
  bone([[0.06, 0.03, -0.04], [0.17, 0.03, -0.06]]); knob(0.17, 0.03, -0.06);
  bone([[0.17, 0.03, -0.06], [0.29, 0.02, -0.06]], 0.015);
  ball(B, BONE, 0.31, 0.015, -0.06, 0.035, 0.016, 0.022);
  bone([[0.06, 0.03, 0.04], [0.14, 0.1, 0.07]]); knob(0.14, 0.1, 0.07);
  bone([[0.14, 0.1, 0.07], [0.23, 0.02, 0.09]], 0.015);
  ball(B, BONE, 0.25, 0.015, 0.09, 0.035, 0.016, 0.022);
  // arms: one across its chest, one flung out towards the satchel
  bone([[-0.15, 0.05, -0.07], [-0.07, 0.07, -0.07], [-0.07, 0.09, 0.0]], 0.013);
  bone([[-0.15, 0.05, 0.07], [-0.09, 0.03, 0.15], [-0.01, 0.02, 0.2]], 0.013);
  ball(B, BONE, 0.01, 0.015, 0.21, 0.025, 0.012, 0.025);
  // the skull, rolled to look at the road
  const sk = mat(-0.23, 0.07, 0.0, -0.9, 0.35, 0.0);
  ball(B, BONE, 0, 0, 0, 0.07, 0.07, 0.075, { matrix: sk });
  ball(B, BONE, 0, -0.05, 0.035, 0.04, 0.024, 0.04, { matrix: sk });
  for (const s of [-1, 1]) ball(B.detail, 0x1a1410, s * 0.026, 0.004, 0.066, 0.019, 0.021, 0.01, { matrix: sk });
  ball(B.detail, 0x1a1410, 0, -0.026, 0.072, 0.009, 0.011, 0.006, { matrix: sk });
  // a dented helm by its head, its sword in the grass beside it
  MT(B, () => {
    lathe(B, [[0.002, 0.12], [0.05, 0.11], [0.075, 0.07], [0.08, 0.03], [0.095, 0.025], [0.09, 0.015]], [tint(IRONC, 1.35), IRONC], { segs: 10, matrix: mat(-0.36, 0.0, 0.14, 0.3, 0, -1.2) });
    B.box(0xc8ccd4, { x: 0.06, y: 0.012, z: -0.22, sx: 0.36, sy: 0.012, sz: 0.035, ry: 0.12 });
    B.box(GOLDC, { x: -0.14, y: 0.012, z: -0.2, sx: 0.02, sy: 0.02, sz: 0.11, ry: 0.12 });
  });
  tube(B, [[-0.15, 0.02, -0.2], [-0.22, 0.02, -0.19]], 0.014, 0x4a2a1a, { segs: 5 });
  // the satchel, its flap thrown back and gold spilling from it
  const sm = mat(0.14, 0, 0.24, 0, -0.3, 0);
  B.box(0x8a5a32, { y: 0, sx: 0.14, sy: 0.09, sz: 0.07, matrix: sm, grad: 0.3 });
  sheet(B, (u, v) => [(u - 0.5) * 0.14, 0.09 + Math.sin(v * 1.5) * 0.02, -0.035 - v * 0.07], [0xa06a3a, 0x7a4a26], { nu: 2, nv: 2, thick: 0.01, matrix: sm });
  MT(B, () => B.box(GOLDC, { y: 0.06, z: 0.036, sx: 0.025, sy: 0.02, sz: 0.006, matrix: sm }));
  coins(B, G, 0.04, 0.0, 0.3, 5, 0.05, 1.7);
  G.shape(TPL.ico0, GLINT, { x: 0.14, y: 0.11, z: 0.24, s: 0.045 });
  tufts(B, [[0.36, 0.14], [-0.38, 0.2]]);
  return { B, G, height: 0.3, noLean: true };
}

// ---------------------------------------------------------------- a cairn
// A heap of grey stones, a white one on top; one stone at its foot pulled
// away, gold showing beneath.
function cairn(spec) {
  const { B, G } = kit();
  const st = spec.color ?? 0xb8b2a4;
  lathe(B, [[0.22, 0], [0.18, 0.12], [0.11, 0.27], [0.04, 0.38]], [deep(st, 0.4), deep(st, 0.6)], { segs: 9 });
  const rings = [[0.2, 0.0, 9, 0.13], [0.15, 0.1, 7, 0.115], [0.1, 0.2, 6, 0.1], [0.05, 0.29, 4, 0.085]];
  rings.forEach(([r, y, n, s], ri) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ri * 0.7;
      if (ri === 0 && k === 2) continue; // the one pulled away
      const c = [st, tint(st, 1.14), deep(st, 0.8), tint(st, 0.94), 0xc8b8a0][(k + ri * 2) % 5];
      B.shape(TPL.dodec, c, { x: Math.cos(a) * r, y: y + (k % 2) * 0.01, z: Math.sin(a) * r * 0.9, sx: s * 1.1, sy: s * 0.75, sz: s * 0.95, ry: k + ri, flat: true });
    }
  });
  B.shape(TPL.dodec, 0xf6f4ee, { x: 0, y: 0.39, z: 0, sx: 0.11, sy: 0.1, sz: 0.1, ry: 0.4, flat: true });
  // the gap at its foot and the stone that came out of it
  const a = (2 / 9) * Math.PI * 2;
  B.detail.box(0x16120e, { x: Math.cos(a) * 0.2, y: 0.005, z: Math.sin(a) * 0.19 + 0.02, sx: 0.1, sy: 0.07, sz: 0.02, ry: -a + Math.PI / 2 });
  coins(B, G, Math.cos(a) * 0.24, 0, Math.sin(a) * 0.22 + 0.05, 4, 0.035, 0.6);
  B.shape(TPL.dodec, tint(st, 1.05), { x: Math.cos(a) * 0.3 - 0.1, y: 0, z: Math.sin(a) * 0.3 + 0.08, sx: 0.12, sy: 0.08, sz: 0.1, ry: 2, flat: true });
  // lichen
  for (const [x, y, z] of [[-0.12, 0.12, 0.1], [0.08, 0.22, 0.06]]) ball(B.detail, 0xc8c870, x, y, z, 0.03, 0.01, 0.02);
  tufts(B, [[-0.26, 0.1], [0.27, -0.06], [0.18, 0.22]]);
  return { B, G, height: 0.45, noLean: true };
}

// ---------------------------------------------------------------- a bookcase
// A tall bookcase with a drawer at its foot pulled open, gold in it, and a
// candle burning on top.
const BOOKS = [0x8a2a24, 0x2a4a7a, 0x3a6a3a, 0x7a5a2a, 0x5a2a5a, 0x2a2a2a, 0xa8742a, 0x6a1a1a, 0x24505a];
function bookcase(spec) {
  const { B, G } = kit();
  const wood = spec.color ?? 0x6a4226;
  const W = 0.25, D = 0.09, H = 0.7, z0 = -0.05;
  B.box(deep(wood, 0.55), { y: 0, z: z0 - D + 0.01, sx: W * 2, sy: H, sz: 0.02 });
  for (const x of [-W, W]) B.box(wood, { x, y: 0, z: z0, sx: 0.035, sy: H, sz: D * 2, grad: 0.2 });
  B.box(tint(wood, 1.1), { y: H, z: z0 + 0.005, sx: W * 2 + 0.06, sy: 0.035, sz: D * 2 + 0.03 });
  B.box(deep(wood, 0.8), { y: 0, z: z0, sx: W * 2, sy: 0.1, sz: D * 2 });
  const shelves = [0.1, 0.3, 0.5];
  for (const y of shelves) B.box(tint(wood, 1.05), { y, z: z0, sx: W * 2, sy: 0.02, sz: D * 2 });
  // books, of every size and colour, a few leaning
  shelves.forEach((y, si) => {
    let x = -W + 0.03, k = si * 3;
    while (x < W - 0.05) {
      const w = 0.025 + ((k * 5) % 3) * 0.008, hgt = 0.11 + ((k * 7) % 4) * 0.018;
      const lean = (k % 7 === 3) ? 0.3 : 0;
      if (si === 1 && k % 9 === 4) { x += 0.05; k++; continue; } // a gap, one book lying flat
      B.box(BOOKS[k % BOOKS.length], { x: x + w / 2 + (lean ? 0.02 : 0), y: y + 0.02, z: z0 + 0.01, sx: w, sy: hgt, sz: D * 1.6, rz: -lean, grad: 0.15 });
      B.detail.box(GOLDC, { x: x + w / 2 + (lean ? 0.02 : 0), y: y + 0.02 + hgt * 0.7, z: z0 + 0.01 + D * 0.8 + 0.002, sx: w * 0.8, sy: 0.008, sz: 0.003, rz: -lean });
      x += w + 0.004 + (lean ? 0.03 : 0);
      k++;
    }
  });
  B.box(BOOKS[1], { x: 0.0, y: 0.32, z: z0 + 0.01, sx: 0.12, sy: 0.025, sz: D * 1.5, ry: 0.1 });
  // the drawer at its foot, pulled out, gold inside
  B.box(tint(wood, 1.12), { y: 0.015, z: z0 + D + 0.08, sx: W * 1.6, sy: 0.07, sz: 0.02 });
  B.box(wood, { y: 0.015, z: z0 + D + 0.02, sx: W * 1.6, sy: 0.05, sz: 0.12 });
  B.detail.box(0x1e140c, { y: 0.066, z: z0 + D + 0.02, sx: W * 1.6 - 0.02, sy: 0.002, sz: 0.1 });
  MT(B, () => ball(B, GOLDC, 0, 0.05, z0 + D + 0.095, 0.014));
  coins(B, G, 0.03, 0.06, z0 + D + 0.03, 4, 0.04, 0.8);
  // a candle on top
  tube(B, [[-0.17, H + 0.035, z0], [-0.17, H + 0.11, z0]], 0.018, 0xf4ecd8, { segs: 6 });
  lathe(B, [[0.04, H + 0.035], [0.045, H + 0.045], [0.02, H + 0.05]], GOLDC, { segs: 8, dx: () => -0.17, matrix: mat(0, 0, z0) });
  G.shape(TPL.cone5, 0xffc050, { x: -0.17, y: H + 0.11, z: z0, sx: 0.035, sy: 0.07, sz: 0.035 });
  return { B, G, height: H + 0.15, noLean: true };
}

// ---------------------------------------------------------------- a dwarven rune-chest
// Grey stone banded with bronze, a knotwork ring for a lock and runes glowing
// along its face: dwarf-work, made to outlast the mountain.
function runechest(spec) {
  const { B, G } = kit();
  const st = spec.color ?? 0x8a909a, bronze = 0xc8903a, glow = spec.glow ?? 0x80e0ff;
  const W = 0.24, D = 0.16, H = 0.2;
  B.box(deep(st, 0.65), { y: 0, sx: W * 2 + 0.06, sy: 0.04, sz: D * 2 + 0.06 });
  B.box(st, { y: 0.04, sx: W * 2, sy: H, sz: D * 2, grad: 0.3 });
  // the lid: a stepped slab with a ridge
  B.box(tint(st, 1.08), { y: 0.04 + H, sx: W * 2 + 0.03, sy: 0.05, sz: D * 2 + 0.03, grad: 0.2 });
  B.shape(TPL.trap, tint(st, 1.15), { y: 0.09 + H, sx: W * 1.6, sy: 0.05, sz: D * 1.4 });
  // bronze corners and bands
  MT(B, () => {
    for (const x of [-1, 1]) for (const z of [-1, 1]) B.box(bronze, { x: x * (W - 0.01), y: 0.04, z: z * (D - 0.01), sx: 0.045, sy: H + 0.06, sz: 0.045 });
    B.box(bronze, { y: 0.04 + H + 0.05, sx: W * 2 + 0.035, sy: 0.012, sz: D * 2 + 0.035 });
    B.shape(TPL.torus, tint(bronze, 1.15), { y: 0.13, z: D + 0.01, sx: 0.1, sy: 0.1, sz: 0.4 });
    ball(B, tint(bronze, 1.2), 0, 0.15, D + 0.012, 0.022, 0.022, 0.012);
  });
  // runes: angular strokes either side of the ring and along the lid
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const x = s * (0.09 + k * 0.04);
    G.box(glow, { x, y: 0.09, z: D + 0.003, sx: 0.008, sy: 0.08, sz: 0.004 });
    G.box(glow, { x: x + s * 0.008, y: 0.11 + (k % 2) * 0.03, z: D + 0.003, sx: 0.025, sy: 0.007, sz: 0.004, rz: s * 0.6 });
  }
  for (let k = -2; k <= 2; k++) G.box(glow, { x: k * 0.07, y: 0.04 + H + 0.03, z: D + 0.016, sx: 0.03, sy: 0.006, sz: 0.004, rz: (k % 2) * 0.7 });
  G.shape(TPL.ico0, glow, { y: 0.15, z: D + 0.02, s: 0.04 });
  // a ring of runes cut in the lid, for whoever looks down on it
  G.shape(TPL.torus, glow, { y: 0.345, sx: 0.22, sy: 0.22, sz: 0.06, rx: Math.PI / 2 });
  for (let k = 0; k < 4; k++) G.box(glow, { x: Math.cos(k * Math.PI / 2 + 0.785) * 0.055, y: 0.343, z: Math.sin(k * Math.PI / 2 + 0.785) * 0.055, sx: 0.04, sy: 0.004, sz: 0.008, ry: -(k * Math.PI / 2 + 0.785) });
  pebbles(B, 4, 0.36, 0x7a7e86, 0.9);
  return { B, G, height: 0.4, noLean: true };
}

// ---------------------------------------------------------------- a sea chest in the sand
// A brass-bound sea chest half sunk in a drift of sand, a starfish and shells
// about it and a frayed rope trailing away.
function seachest(spec) {
  const { B, G } = kit();
  const wood = spec.color ?? 0x5e4432, brass = 0xc89a40, sand = 0xe2cc94;
  // the chest, tipped and sunk, then the sand drifted up round it
  const m = mat(0.0, -0.03, -0.02, -0.12, 0.25, 0.22);
  const W = 0.22, D = 0.14, H = 0.16;
  B.box(wood, { y: 0, sx: W * 2, sy: H, sz: D * 2, matrix: m, grad: 0.25 });
  lathe(B, [[D * 1.0, -W], [D * 1.03, -W + 0.01], [D * 1.03, W - 0.01], [D, W]], [tint(wood, 1.12), wood], { segs: 12, sq: 0.6, matrix: mul(m, mat(0, H, 0, 0, 0, Math.PI / 2)) });
  MT(B, () => {
    for (const x of [-W * 0.65, W * 0.65]) {
      B.box(brass, { x, y: 0, sx: 0.03, sy: H + 0.004, sz: D * 2 + 0.01, matrix: m });
      lathe(B, [[D * 1.06, -0.016], [D * 1.07, 0.016]], brass, { segs: 12, sq: 0.6, matrix: mul(m, mat(x, H, 0, 0, 0, Math.PI / 2)) });
    }
    B.box(brass, { y: H - 0.06, z: D + 0.005, sx: 0.06, sy: 0.07, sz: 0.012, matrix: m });
  });
  lathe(B.detail, [[0.002, 0.05], [0.24, 0.045], [0.4, 0.0]], [tint(sand, 1.05), sand], { segs: 16, sq: 0.8 });
  for (const [x, z, s] of [[-0.22, 0.12, 1], [0.22, 0.14, 0.9], [0.0, 0.2, 0.8], [0.26, -0.08, 0.8], [-0.26, -0.1, 0.9]]) ball(B, tint(sand, x > 0 ? 0.95 : 1.04), x, 0.0, z, 0.1 * s, 0.05 * s, 0.08 * s, { grad: 0.3 });
  // a starfish, shells, and the rope
  const sf = mat(-0.2, 0.03, 0.22, 0, 0.4, 0);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; tube(B, xf(sf, [[0, 0, 0], [Math.cos(a) * 0.055, -0.006, Math.sin(a) * 0.055]]), [0.016, 0.004], [0xe86a3a, 0xf08a5a], { segs: 4, outline: true }); }
  for (const [x, z, c] of [[0.18, 0.24, 0xf4d8d0], [0.27, 0.12, 0xf8f0e0]]) lathe(B, [[0.002, 0], [0.03, 0.006], [0.002, 0.03]].map(([r, y]) => [r, y + 0.02, r * 0.8, z]), c, { segs: 7, dx: () => x });
  tube(B, [[0.18, 0.08, 0.05], [0.3, 0.03, 0.14], [0.36, 0.02, 0.0], [0.42, 0.02, -0.12]], 0.012, 0xc8a870, { segs: 5, outline: true });
  for (const [x, z] of [[-0.3, -0.02], [0.3, 0.04]]) tube(B, [[x, 0.02, z], [x + 0.02, 0.08, z + 0.01], [x - 0.01, 0.12, z]], [0.012, 0.004], 0x4a7a3a, { segs: 4, outline: true });
  coins(B, G, 0.08, 0.04, 0.18, 4, 0.04, 1.2);
  G.shape(TPL.ico0, GLINT, { x: 0.0, y: 0.26, z: 0.02, s: 0.05 });
  return { B, G, height: 0.35, noLean: true };
}

// ---------------------------------------------------------------- a reliquary on an altar
// A stone altar under a fringed cloth, and on it a little golden casket shaped
// like a chapel, set with gems, a candle either side.
function reliquary(spec) {
  const { B, G } = kit();
  const st = 0xc4bcac, cloth = spec.color ?? 0x7a2a4a;
  B.box(deep(st, 0.7), { y: 0, sx: 0.5, sy: 0.04, sz: 0.34 });
  B.box(st, { y: 0.04, sx: 0.4, sy: 0.22, sz: 0.26, grad: 0.3 });
  B.box(tint(st, 1.08), { y: 0.26, sx: 0.48, sy: 0.04, sz: 0.32 });
  // the altar cloth, hanging down the front
  sheet(B, (u, v) => [(u - 0.5) * 0.24, 0.3 - v * 0.16, 0.162 + v * 0.004], [cloth, deep(cloth, 0.75)], { nu: 2, nv: 2, thick: 0.008 });
  B.box(cloth, { y: 0.3, sx: 0.24, sy: 0.006, sz: 0.3 });
  for (let k = 0; k < 5; k++) B.detail.box(GOLDC, { x: -0.1 + k * 0.05, y: 0.13, z: 0.168, sx: 0.012, sy: 0.02, sz: 0.004 });
  // the casket: a little golden chapel with a steep roof
  MT(B, () => {
    B.box(GOLDC, { y: 0.306, sx: 0.22, sy: 0.02, sz: 0.14 });
    B.box(tint(GOLDC, 1.05), { y: 0.326, sx: 0.19, sy: 0.1, sz: 0.11, grad: 0.2 });
    B.shape(TPL.prism, tint(GOLDC, 1.12), { y: 0.426, sx: 0.21, sy: 0.09, sz: 0.13 });
    ball(B, GOLDC, 0, 0.53, 0, 0.022);
    for (const x of [-0.1, 0.1]) ball(B, GOLDC, x, 0.43, 0.06, 0.016);
  });
  for (const [x, c] of [[-0.05, 0xe03040], [0, 0x3080ff], [0.05, 0x30c060]]) G.shape(TPL.ico0, c, { x, y: 0.38, z: 0.058, s: 0.03 });
  G.shape(TPL.ico1, 0xfff0b0, { y: 0.56, s: 0.05 });
  // candles at the corners
  for (const x of [-0.19, 0.19]) {
    tube(B, [[x, 0.3, -0.06], [x, 0.38, -0.06]], 0.016, 0xf4ecd8, { segs: 6 });
    G.shape(TPL.cone5, 0xffc050, { x, y: 0.38, z: -0.06, sx: 0.03, sy: 0.06, sz: 0.03 });
  }
  pebbles(B, 4, 0.34, deep(st, 0.7), 1.1);
  return { B, G, height: 0.62, noLean: true };
}

export const CONTAINER_BUILDERS = { cart, flagstone, wallstone, barrels, crates, sacks, urns, sarcophagus, coffin, strongbox, hollowlog, nest, remains, cairn, bookcase, runechest, seachest, reliquary };
