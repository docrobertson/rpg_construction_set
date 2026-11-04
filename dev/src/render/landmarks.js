// Landmarks of the countryside: a windmill and a watermill, beehives and an
// orchard, a shepherd's fold, a ring of standing stones, a watchtower, a
// wayside chapel and its graveyard, a gibbet, woodcutters and quarrymen at
// work, an old king's statue, dragon bones and a wreck on the strand — and
// the ruins of several (spec.ruined), and a farm the raiders have burned.
// The same painted-toy style as the points of interest in models.js: chunky
// stone, wood and thatch with ink outlines, warm light in the windows. Each
// is built to stand on about one square (towns draw them so); the world map
// draws them larger (LANDMARK_WORLD_SCALE). A mill's sails and wheel are
// models of their own that the view turns (SPINNERS).
import * as THREE from 'three';
import { GeoBuilder, TPL } from './builder.js';
import { humanoid, RACE_LOOKS } from './figures.js';
import { tube, lathe, sheet, ball, mat, tint, deep, blend } from './sculpt.js';

const STONE = 0xb4ac9c, MOSS = 0x6a9a3a, WOOD = 0x8a5a30, DARKWOOD = 0x5a3a22, IRON = 0x4a4c52, GOLD = 0xe2b24a;
const THATCH = 0xcfa24c, EARTH = [0xb8a470, 0xa8946a], SOOT = 0x3a3430, BONE = 0xece0c4;

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

// a few rough stones scattered round a base
function pebbles(B, n, r, col = 0x8a8478, seed = 1) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const d = r * (0.9 + 0.2 * Math.sin(k * 7.1 + seed));
    B.shape(TPL.dodec, k % 2 ? col : deep(col, 0.85), { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, sx: 0.07 + (k % 3) * 0.015, sy: 0.05, sz: 0.06, ry: k, flat: true });
  }
}

// trodden ground under a place: a ragged patch, paler in the middle (flat,
// so it goes in the detail layer, which carries no ink outline)
function yard(B, r, cols = EARTH, sq = 1, x = 0, z = 0, seed = 1) {
  const N = 26, c0 = new THREE.Color(cols[0]), c1 = new THREE.Color(cols[1]);
  const rim = (k) => {
    const a = (k / N) * Math.PI * 2;
    const f = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 7 + seed * 2.3);
    return [x + Math.cos(a) * r * f, 0.003, z + Math.sin(a) * r * f * sq];
  };
  for (let k = 0; k < N; k++) B.detail.triC([x, 0.007, z], rim(k + 1), rim(k), c0, c1, c1);
}

// a heap of fallen stones
function rubble(B, x, z, r, n, col = STONE, seed = 1) {
  for (let k = 0; k < n; k++) {
    const a = k * 2.399 + seed, d = r * Math.sqrt((k + 0.5) / n);
    const s = 0.05 + ((k * 7 + seed * 3) % 5) * 0.012;
    B.shape(k % 3 ? TPL.box : TPL.dodec, k % 2 ? col : deep(col, 0.8), { x: x + Math.cos(a) * d, y: k % 3 ? 0 : s * 0.3, z: z + Math.sin(a) * d, sx: s * 1.3, sy: s * (k % 3 ? 0.8 : 1), sz: s, ry: k * 1.3, rx: (k % 2) * 0.2, flat: true });
  }
}

// curling smoke from a chimney, a fire or a smouldering ruin
function smoke(B, x, y, z, k = 1, col = 0xe6e4de) {
  for (const [dx, dy, r] of [[0, 0, 0.045], [0.04, 0.08, 0.06], [0.1, 0.16, 0.07], [0.18, 0.23, 0.06]]) ball(B, col, x + dx * k, y + dy * k, z, r * k, r * k * 0.8, r * k);
}

// ivy or moss clinging to a wall: a cluster of green lumps
function ivy(B, x, y, z, r, seed = 1) {
  for (let k = 0; k < 4; k++) {
    const a = k * 2.1 + seed;
    ball(B, k % 2 ? MOSS : deep(MOSS, 0.85), x + Math.cos(a) * r * 0.6, y + Math.sin(a * 1.3) * r * 0.8, z, r * 0.55, r * 0.55, r * 0.3);
  }
}

// a crow, perched or pecking
function crow(B, x, y, z, ry = 0) {
  const m = mat(x, y, z, 0, ry, 0);
  ball(B, 0x1e1c22, 0, 0.035, 0, 0.026, 0.024, 0.04, { matrix: m });
  ball(B, 0x1e1c22, 0, 0.062, 0.03, 0.018, 0.018, 0.018, { matrix: m });
  B.detail.shape(TPL.cone4, 0x3a3a3a, { matrix: m, y: 0.06, z: 0.044, sx: 0.01, sy: 0.026, sz: 0.01, rx: Math.PI / 2 });
  B.detail.shape(TPL.cone4, 0x1e1c22, { matrix: m, y: 0.04, z: -0.035, sx: 0.03, sy: 0.04, sz: 0.012, rx: -1.9 });
}

// Move a built figure into a diorama: scale it about its feet and set it down
// at (x, z), turned by ry
function place(res, s, x, z, ry = 0) {
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

// The folk who keep the places (their faces go on the event's card too)
export const LANDMARK_KEEPERS = {
  windmill: { race: 'human', body: 0xe4dccb, legs: 0x8a7a64, hat: 'cap', hatColor: 0xd8cfbc, beard: 0xd8d2c4, face: 'bold' },
  apiary: { race: 'human', body: 0xd8c89a, legs: 0x6a5a40, hat: 'hood', hatColor: 0xf2eee2, hair: 0x8a5a2a },
  sheepfold: { race: 'human', body: 0x6a6a3a, legs: 0x5a4a32, hat: 'hood', hatColor: 0x7a5a32, beard: 0x8a8a84, weapon: 'staff' },
  woodcamp: { race: 'human', body: 0x8a2a1e, legs: 0x4a3a2a, hat: 'cap', hatColor: 0x4a6a3a, beard: 0x6a3a1a },
};

// A keeper standing at the door: the diorama is built on the figure's own
// builders (as the farmstead's farmer is). Folk are drawn small beside their
// buildings, so they are no bigger than the company on the world map.
function withKeeper(look, x, z, ry = 0, k = 0.56) {
  if (!look) return builders();
  const res = humanoid({ ...look, kind: 'humanoid' }, TPL);
  place(res, (RACE_LOOKS[look.race] || RACE_LOOKS.human).scale * k, x, z, ry);
  if (!res.B.detail) res.B.detail = new GeoBuilder();
  return res;
}

// Apply a matrix to some triangles of a builder (by the index of each one's
// first coordinate; all of them if no list): used to stand a statue on its
// plinth and to topple it
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
function transformTris(P, m, list = null) {
  _nm.getNormalMatrix(m);
  const p = P.pos, n = P.nor;
  const tris = list || Array.from({ length: p.length / 9 }, (_, k) => k * 9);
  for (const t of tris) {
    for (let i = t; i < t + 9; i += 3) {
      _v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m);
      p[i] = _v.x; p[i + 1] = _v.y; p[i + 2] = _v.z;
      _n.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(_nm).normalize();
      n[i] = _n.x; n[i + 1] = _n.y; n[i + 2] = _n.z;
    }
  }
}

// ---------------------------------------------------------------- the mills
// A tower mill: a whitewashed tower tapering up to a boat-shaped cap, a
// gallery round its middle, sacks of flour and a spare millstone at the door.
// Its sails are a model of their own, turned slowly by the view (SPINNERS).
// Ruined: a gutted, soot-blackened stump, its sails broken on the ground.
const MILL_TOP = 1.16, MILL_HUB = [0, MILL_TOP + 0.1, 0.34];
function windmill(spec) {
  const ruined = !!spec.ruined;
  const { B, G, F } = ruined ? builders() : withKeeper(spec.keeper || LANDMARK_KEEPERS.windmill, 0.27, 0.36, -0.35);
  const wall = spec.color ?? 0xece4d2, stone = 0xa29c90, cap = spec.roof ?? 0x8a3a2a;
  const R = (y) => 0.32 - y * 0.09;
  yard(B, 0.6, ruined ? [0x8a8268, 0x7a7258] : EARTH);
  lathe(B, [[0.36, 0], [0.36, 0.05], [0.33, 0.07]], [deep(stone, 0.7), stone], { segs: 12 });
  const top = ruined ? 0.34 : MILL_TOP;
  lathe(B, [[R(0.05), 0.05], [R(0.3), 0.3], [R(0.6), 0.6], [R(top), top]].filter(([, y]) => y <= top), ruined ? [deep(wall, 0.75), blend(wall, SOOT, 0.25), blend(wall, SOOT, 0.75)] : [deep(wall, 0.82), wall, tint(wall, 1.04)], { segs: 12 });
  // courses of stone showing through the whitewash
  for (const y of [0.18, 0.42]) if (y < top) lathe(B.detail, [[R(y) + 0.003, y - 0.005], [R(y) + 0.006, y], [R(y) + 0.003, y + 0.005]], deep(wall, 0.72), { segs: 12 });
  // the door, a step and the windows up the tower
  const zf = (y) => R(y) + 0.004;
  B.box(0x4a3020, { y: 0.06, z: zf(0.15) - 0.012, sx: 0.12, sy: 0.18, sz: 0.03 });
  ball(B, 0x4a3020, 0, 0.24, zf(0.24) - 0.012, 0.06, 0.04, 0.015);
  for (const x of [-0.07, 0.07]) B.box(deep(stone, 0.85), { x, y: 0.06, z: zf(0.15), sx: 0.025, sy: 0.2, sz: 0.03 });
  B.box(stone, { y: 0.0, z: zf(0.05) + 0.04, sx: 0.18, sy: 0.06, sz: 0.08 });
  for (const [x, y] of [[0, 0.46], [0.07, 0.86]]) {
    const z = zf(y);
    if (ruined && y > top) continue;
    if (ruined) B.box(0x1a1410, { x, y, z: z - 0.006, sx: 0.06, sy: 0.08, sz: 0.012 });
    else G.box(0xffd070, { x, y, z: z - 0.004, sx: 0.055, sy: 0.075, sz: 0.01 });
    B.box(deep(stone, 0.8), { x, y: y - 0.012, z, sx: 0.08, sy: 0.016, sz: 0.03 });
  }
  if (!ruined) {
    // the gallery: a wooden stage on brackets, posts and a rail
    const gy = 0.62, gr = R(gy) + 0.075;
    lathe(B, [[R(gy) + 0.002, gy - 0.02], [gr, gy], [gr, gy + 0.022], [R(gy) + 0.002, gy + 0.024]], [deep(WOOD, 0.75), WOOD], { segs: 12 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      tube(B, [[Math.cos(a) * (gr - 0.01), gy + 0.02, Math.sin(a) * (gr - 0.01)], [Math.cos(a) * (gr - 0.01), gy + 0.1, Math.sin(a) * (gr - 0.01)]], 0.007, DARKWOOD, { segs: 3 });
    }
    lathe(B, [[gr - 0.012, gy + 0.095], [gr - 0.006, gy + 0.1], [gr - 0.012, gy + 0.106]], DARKWOOD, { segs: 16 });
    // the cap: tarred boards, a gold finial, and the windshaft out to the hub
    lathe(B, [[R(top) + 0.03, top - 0.01], [R(top) + 0.045, top + 0.03], [R(top) + 0.01, top + 0.14], [0.14, top + 0.24], [0.05, top + 0.3], [0.002, top + 0.31]], [deep(cap, 0.75), cap, tint(cap, 1.15)], { segs: 12, sq: 1.15 });
    for (const v of [0.05, 0.11]) lathe(B.detail, [[R(top) + 0.042 - v * 0.2, top + v], [R(top) + 0.046 - v * 0.2, top + v + 0.006]], deep(cap, 0.55), { segs: 12, sq: 1.15 });
    MT(B, () => ball(B, GOLD, 0, top + 0.33, 0, 0.03));
    tube(B, [[0, MILL_HUB[1], 0.1], [0, MILL_HUB[1], MILL_HUB[2] - 0.02]], 0.04, [DARKWOOD, WOOD], { segs: 8 });
    // the fantail at the back keeps her to the wind
    tube(B, [[0, top + 0.08, -0.2], [0, top + 0.06, -0.34]], 0.012, DARKWOOD, { segs: 4, outline: true });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B.box(0xe8e0cc, { x: Math.cos(a) * 0.05, y: top + 0.06 + Math.sin(a) * 0.05, z: -0.34, sx: 0.03, sy: 0.06, sz: 0.008, rz: a + Math.PI / 2 });
    }
    // a spare millstone against the wall, sacks of flour by the door
    lathe(B, [[0.002, -0.022], [0.11, -0.022], [0.11, 0.022], [0.002, 0.022]], [0x8a8478, 0xa29c90], { segs: 14, matrix: mat(-0.31, 0.11, 0.16, Math.PI / 2 - 0.28, 0.75, 0) });
    B.detail.shape(TPL.cyl8, 0x3a3430, { matrix: mat(-0.31, 0.11, 0.16, Math.PI / 2 - 0.28, 0.75, 0), y: 0.022, sx: 0.04, sy: 0.003, sz: 0.04 });
    for (const [x, z, ry] of [[0.33, 0.1, 0.3], [0.38, -0.04, -0.4], [0.16, 0.36, 1.1]]) sack(B, x, z, ry);
    // a hen pecking about the yard
    hen(B, -0.14, 0.4, 2.5);
    hen(B, -0.3, 0.32, -1.2, 0xb8642a);
  } else {
    // above that, the wall stands in broken staves, high at the back and
    // low at the front, scorched where the fire came out at the top
    const hs = [0.36, 0.28, 0.12, 0.06, 0.1, 0.2, 0.34, 0.44, 0.5, 0.46, 0.52, 0.42];
    hs.forEach((h, k) => {
      const a = (k / hs.length) * Math.PI * 2 + Math.PI * 0.2, r = R(top + h / 2) - 0.025;
      const col = blend(wall, SOOT, Math.min(0.85, 0.15 + h * 1.4));
      B.box(k % 2 ? col : tint(col, 0.94), { x: Math.cos(a) * r, y: top - 0.01, z: Math.sin(a) * r, sx: 2 * Math.PI * r / hs.length + 0.012, sy: h, sz: 0.06, ry: -a + Math.PI / 2, grad: -0.25 });
    });
    lathe(B, [[R(top) - 0.05, top], [R(top) - 0.05, 0.1]], 0x1e1a18, { segs: 12 });
    lathe(B, [[0.002, 0.1], [R(top) - 0.05, 0.1]], 0x2a2420, { segs: 12 });
    // the gallery's charred beams still jut from the wall
    for (const a of [3.6, 4.4, 5.3]) tube(B, [[Math.cos(a) * 0.2, top + 0.3, Math.sin(a) * 0.2], [Math.cos(a) * 0.34, top + 0.27, Math.sin(a) * 0.34]], 0.016, SOOT, { segs: 4, outline: true });
    // the windshaft stub, sails broken: one on the ground, one leant on the wall
    brokenSail(B, [0.42, 0.02, 0.08], [-0.05, 0.03, 0.5], 1);
    brokenSail(B, [0.34, 0.0, -0.18], [0.16, 0.52, -0.06], -1);
    rubble(B, -0.3, 0.2, 0.14, 7, blend(wall, 0x8a8478, 0.5), 2);
    ivy(B, -0.22, 0.2, 0.2, 0.07, 1);
    ivy(B, 0.2, 0.3, -0.18, 0.06, 3);
    crow(B, -0.24, top + 0.43, -0.1, 0.8);
  }
  pebbles(B, 5, 0.55, 0x8a8478, 0.9);
  return { B, G, F, height: ruined ? 0.9 : MILL_HUB[1] + 0.55, noLean: true };
}

// a fallen sail: the stock, its lattice and rags of canvas
function brokenSail(B, a, b, side) {
  tube(B, [a, b], [0.02, 0.014], [SOOT, DARKWOOD], { segs: 6 });
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d);
  const u = d.map((v) => v / L);
  // a sideways direction across the sail, roughly level
  const p = [-u[2] * side, 0, u[0] * side];
  const pl = Math.hypot(...p) || 1;
  for (let k = 1; k < 5; k++) {
    const t = k / 5, o = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
    tube(B, [o, [o[0] + p[0] / pl * 0.13, o[1] + 0.01, o[2] + p[2] / pl * 0.13]], 0.007, DARKWOOD, { segs: 3, outline: true });
  }
  sheet(B, (s, v) => {
    const t = 0.2 + s * 0.45;
    return [a[0] + d[0] * t + p[0] / pl * 0.12 * v, a[1] + d[1] * t + 0.012 + Math.sin(s * 9) * 0.01 * v, a[2] + d[2] * t + p[2] / pl * 0.12 * v];
  }, [0xcfc4a8, 0xa89c80], { nu: 3, nv: 1, thick: 0.006, back: 0x8a7e64 });
}

function sack(B, x, z, ry = 0, col = 0xe8dcc0) {
  const m = mat(x, 0, z, 0, ry, 0);
  ball(B, col, 0, 0.065, 0, 0.06, 0.066, 0.05, { matrix: m, grad: 0.2 });
  ball(B, deep(col, 0.85), 0, 0.13, 0, 0.026, 0.02, 0.022, { matrix: m });
  B.detail.box(0xb09a70, { matrix: m, y: 0.118, sx: 0.05, sy: 0.008, sz: 0.044 });
}

function hen(B, x, z, ry, col = 0xf2ece0) {
  const m = mat(x, 0, z, 0, ry, 0);
  ball(B, col, 0, 0.055, 0, 0.04, 0.035, 0.05, { matrix: m });
  ball(B, col, 0, 0.09, 0.04, 0.022, 0.024, 0.022, { matrix: m });
  ball(B, 0xd02a1a, 0, 0.115, 0.04, 0.008, 0.012, 0.014, { matrix: m });
  B.shape(TPL.cone4, 0xe8a830, { matrix: m, y: 0.09, z: 0.065, sx: 0.012, sy: 0.02, sz: 0.012, rx: Math.PI / 2 });
  B.shape(TPL.cone4, deep(col, 0.8), { matrix: m, y: 0.07, z: -0.05, sx: 0.04, sy: 0.05, sz: 0.02, rx: -0.6 });
}

// The windmill's sails: four lattice frames with canvas spread on them,
// centred on the hub (the view turns them about z)
function millsails(spec) {
  const { B, G } = builders();
  const cloth = spec.color ?? 0xf2e8d0;
  ball(B, DARKWOOD, 0, 0, 0.02, 0.055, 0.055, 0.045);
  MT(B, () => ball(B, IRON, 0, 0, 0.06, 0.025));
  const L = 0.6;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.3;
    const d = [Math.cos(a), Math.sin(a)], p = [-Math.sin(a), Math.cos(a)];
    const at = (r, w, z = 0) => [d[0] * r + p[0] * w, d[1] * r + p[1] * w, z];
    tube(B, [at(0, 0, 0.02), at(L, 0, 0.02)], [0.024, 0.015], [DARKWOOD, WOOD], { segs: 6 });
    // the canvas, on one side of the stock, set back a touch
    const r0 = 0.12, r1 = L - 0.03, w0 = 0.015, w1 = 0.16;
    sheet(B, (u, v) => at(r0 + u * (r1 - r0), w0 + v * (w1 - w0), -0.005 - v * 0.02), [tint(cloth, 1.04), deep(cloth, 0.86)], { nu: 3, nv: 1, thick: 0.008, back: deep(cloth, 0.7) });
    // the lattice: an outer rail and cross bars
    tube(B, [at(r0 - 0.02, w1 + 0.006, -0.02), at(r1 + 0.02, w1 + 0.006, -0.02)], 0.01, WOOD, { segs: 4, outline: true });
    for (let i = 0; i <= 5; i++) {
      const r = r0 + (i / 5) * (r1 - r0);
      tube(B.detail, [at(r, -0.03, 0.008), at(r, w1 + 0.01, -0.016)], 0.006, deep(WOOD, 0.8), { segs: 3, cap: false });
    }
  }
  return { B, G, height: L, noLean: true, ao: 0.2 };
}

// A watermill: a stone mill-house under red tiles behind its leat, the
// great wheel turning in the stream at its door (a model of its own:
// SPINNERS), white water about its paddles, a plank bridge to the door.
const WHEEL = [0.17, 0.27, 0.15];
function watermill(spec) {
  const { B, G } = builders();
  const stone = spec.color ?? 0xb0a892, wall = 0xeee4cc, roof = spec.roof ?? 0xa8553a;
  yard(B, 0.52, EARTH, 0.7, -0.08, -0.26, 2);
  const cx = -0.06, cz = -0.27, W = 0.3, D = 0.17, eave = 0.46, ridge = 0.74;
  B.box(deep(stone, 0.8), { x: cx, y: 0, z: cz, sx: W * 2 + 0.04, sy: 0.04, sz: D * 2 + 0.04 });
  B.box(stone, { x: cx, y: 0.03, z: cz, sx: W * 2, sy: 0.2, sz: D * 2, grad: 0.3 });
  B.box(wall, { x: cx, y: 0.22, z: cz, sx: W * 2 - 0.01, sy: eave - 0.22, sz: D * 2 - 0.01, grad: 0.1 });
  const F = cz + D + 0.004;
  // rough stones in the lower wall, timbers above
  for (let k = 0; k < 8; k++) B.detail.box(deep(stone, 0.75), { x: cx - W + 0.05 + k * 0.072, y: 0.07 + (k % 2) * 0.07, z: F - 0.002, sx: 0.05, sy: 0.03, sz: 0.004 });
  for (const x of [-W, -W * 0.3, W * 0.3, W]) B.detail.box(DARKWOOD, { x: cx + x, y: 0.22, z: F, sx: 0.022, sy: eave - 0.22, sz: 0.008 });
  B.detail.box(DARKWOOD, { x: cx, y: 0.215, z: F, sx: W * 2, sy: 0.02, sz: 0.008 });
  // the roof: tiles in courses, gable ends, a stone chimney and its smoke
  const run = ridge - eave + 0.04, out = D + 0.07;
  for (const s of [-1, 1]) {
    sheet(B, (u, v) => [cx + (u - 0.5) * (W * 2 + 0.1), ridge - v * run, cz + s * (0.01 + v * out)], [tint(roof, 1.12), roof, deep(roof, 0.75)], { nu: 3, nv: 3, thick: 0.035, flipN: s > 0, back: deep(roof, 0.5) });
    for (const v of [0.25, 0.5, 0.75]) B.detail.box(deep(roof, 0.6), { x: cx, y: ridge - v * run + 0.022, z: cz + s * (0.01 + v * out + 0.008), sx: W * 2 + 0.08, sy: 0.01, sz: 0.012 });
  }
  for (const x of [-W, W]) {
    const a = [cx + x, eave - 0.01, cz - D], b = [cx + x, eave - 0.01, cz + D], m = [cx + x, ridge - 0.03, cz];
    B.tri(a, b, m, wall); B.tri(a, m, b, wall);
  }
  tube(B, [[cx - W - 0.06, ridge + 0.01, cz], [cx + W + 0.06, ridge + 0.01, cz]], 0.028, deep(roof, 0.65), { segs: 6 });
  B.box(stone, { x: cx - W + 0.08, y: 0.5, z: cz - 0.06, sx: 0.1, sy: 0.38, sz: 0.1, grad: 0.3 });
  smoke(B, cx - W + 0.08, 0.95, cz - 0.06, 0.9);
  // the door and lit windows
  const dx = -0.22;
  B.box(0x4a3020, { x: dx, y: 0.03, z: F, sx: 0.11, sy: 0.2, sz: 0.014 });
  for (const x of [-0.04, 0.17]) G.box(0xffd070, { x: cx + x + 0.04, y: 0.3, z: F, sx: 0.07, sy: 0.07, sz: 0.008 });
  // the leat: the stream in a stone channel, running past the door
  const z0 = 0.05, z1 = 0.25, zc = (z0 + z1) / 2;
  B.detail.box(0x2e6a8e, { x: 0, y: -0.012, z: zc, sx: 1.3, sy: 0.02, sz: z1 - z0 });
  for (const z of [z0 - 0.02, z1 + 0.02]) B.box(deep(stone, 0.92), { x: 0, y: -0.012, z, sx: 1.3, sy: 0.045, sz: 0.045, grad: 0.3 });
  for (const [x, r] of [[-0.45, 0.04], [-0.2, 0.03], [0.48, 0.035]]) G.shape(TPL.ico0, 0xb8e4ff, { x, y: 0.01, z: zc + (x > 0 ? 0.03 : -0.02), sx: r * 1.8, sy: 0.005, sz: r * 0.8 });
  // white water churned up about the paddles
  for (const [x, y, z, r] of [[WHEEL[0] - 0.12, 0.02, zc, 0.04], [WHEEL[0] + 0.14, 0.02, zc + 0.02, 0.05], [WHEEL[0] + 0.24, 0.012, zc - 0.03, 0.03], [WHEEL[0] - 0.03, 0.03, z1 - 0.01, 0.03]]) G.shape(TPL.ico1, 0xeefaff, { x, y, z, sx: r * 1.4, sy: r * 0.5, sz: r });
  // a plank bridge to the door
  B.box(0x9a7a4a, { x: dx, y: 0.0, z: zc, sx: 0.13, sy: 0.035, sz: z1 - z0 + 0.12 });
  for (const s of [-1, 1]) B.detail.box(deep(WOOD, 0.7), { x: dx + s * 0.03, y: 0.034, z: zc, sx: 0.006, sy: 0.003, sz: z1 - z0 + 0.1 });
  // the wheel's axle back into the wall
  tube(B, [[WHEEL[0], WHEEL[1], WHEEL[2] - 0.05], [WHEEL[0], WHEEL[1], F - 0.01]], 0.026, IRON, { segs: 6 });
  // sacks waiting on the near bank
  for (const [x, z, ry] of [[-0.42, 0.36, 0.4], [-0.32, 0.42, -0.5], [-0.12, 0.38, 1.2]]) sack(B, x, z, ry);
  pebbles(B, 4, 0.56, 0x8a8478, 0.2);
  return { B, G, height: 0.9, noLean: true };
}

// The watermill's wheel: two rims, spokes and a ring of paddles, centred on
// the axle (the view turns it about z, so it faces the road)
function millwheel(spec) {
  const { B, G } = builders();
  const wood = spec.color ?? 0x7a5232;
  const R = 0.28, hw = 0.055;
  const axis = mat(0, 0, 0, Math.PI / 2, 0, 0);
  for (const z of [-hw, hw]) {
    lathe(B, [[R - 0.035, z - 0.012], [R, z - 0.012], [R, z + 0.012], [R - 0.035, z + 0.012], [R - 0.035, z - 0.012]].map(([r, y]) => [r, -y]), [deep(wood, 0.8), wood], { segs: 18, matrix: axis, keepSegs: true });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.26;
      tube(B, [[0, 0, z], [Math.cos(a) * (R - 0.02), Math.sin(a) * (R - 0.02), z]], 0.012, deep(wood, 0.85), { segs: 4, outline: true });
    }
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    B.box(k % 2 ? wood : tint(wood, 1.12), { x: Math.cos(a) * (R - 0.085), y: Math.sin(a) * (R - 0.085), sx: 0.018, sy: 0.085, sz: hw * 2 + 0.03, rz: a - Math.PI / 2 });
  }
  lathe(B, [[0.002, -0.075], [0.05, -0.075], [0.05, 0.075], [0.002, 0.075]], [IRON, 0x6a6e76], { segs: 10, matrix: axis });
  return { B, G, height: R * 2, noLean: true, ao: 0.2 };
}

// ---------------------------------------------------------------- the farm
// Beehives: straw skeps on a bench and on posts, lavender and marigolds, a
// pot of honey, bees in the air, and the bee-wife in her veil.
function apiary(spec) {
  const { B, G, F } = withKeeper(spec.keeper || LANDMARK_KEEPERS.apiary, -0.24, 0.26, 0.5);
  const straw = spec.color ?? 0xd8b060;
  // the bench and its skeps
  B.box(WOOD, { x: 0.08, y: 0.12, z: -0.18, sx: 0.62, sy: 0.035, sz: 0.16 });
  for (const x of [-0.18, 0.34]) B.box(DARKWOOD, { x, y: 0, z: -0.18, sx: 0.05, sy: 0.12, sz: 0.12 });
  for (const x of [-0.12, 0.09, 0.3]) skep(B, G, x, 0.155, -0.18, 1.2, straw);
  // two more on posts at the side, under little thatched hoods
  for (const [x, z] of [[0.42, 0.14], [-0.44, -0.12]]) {
    tube(B, [[x, 0, z], [x, 0.16, z]], 0.02, DARKWOOD, { segs: 5 });
    B.box(WOOD, { x, y: 0.15, z, sx: 0.16, sy: 0.025, sz: 0.16 });
    skep(B, G, x, 0.175, z, 1.1, tint(straw, 1.06));
  }
  // flowers for the bees: lavender rows and marigolds
  for (let k = 0; k < 9; k++) {
    const x = -0.05 + (k % 5) * 0.1, z = 0.16 + Math.floor(k / 5) * 0.12 + (k % 2) * 0.02;
    B.shape(TPL.ico1, 0x5a8a3a, { x, y: 0.04, z, sx: 0.08, sy: 0.07, sz: 0.07 });
    for (let j = 0; j < 3; j++) B.detail.shape(TPL.ico0, k % 3 === 2 ? 0xf0a030 : 0x9a7ad8, { x: x + (j - 1) * 0.022, y: 0.085 + (j % 2) * 0.012, z, sx: 0.03, sy: 0.045, sz: 0.03 });
  }
  // a crock of honey and a jar on a stump
  lathe(B, [[0.06, 0], [0.06, 0.1], [0.055, 0.105]], [0x6a4224, 0xd8aa70], { segs: 9, matrix: mat(-0.42, 0, 0.3) });
  lathe(B, [[0.002, 0.1], [0.035, 0.1], [0.04, 0.13], [0.03, 0.16], [0.032, 0.17], [0.002, 0.172]], [0xb8642a, 0xd8803a], { segs: 9, matrix: mat(-0.42, 0, 0.3) });
  G.shape(TPL.ico0, 0xffb830, { x: -0.4, y: 0.12, z: 0.33, s: 0.02 });
  // a wattle fence behind
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * 1.15 + (k / 7) * Math.PI * 0.7, x = Math.cos(a) * 0.56, z = Math.sin(a) * 0.5;
    tube(B, [[x, 0, z], [x, 0.16, z]], 0.012, DARKWOOD, { segs: 4, outline: true });
  }
  for (const y of [0.05, 0.1, 0.14]) {
    const pts = [];
    for (let k = 0; k < 8; k++) { const a = Math.PI * 1.15 + (k / 7) * Math.PI * 0.7; pts.push([Math.cos(a) * 0.56, y + (k % 2) * 0.01, Math.sin(a) * 0.5]); }
    tube(B, pts, 0.012, [0x9a7a4a, 0x7a5a32], { segs: 4, steps: 16 });
  }
  pebbles(B, 3, 0.58, 0x8a8478, 2.2);
  return { B, G, F, height: 0.55, noLean: true };
}

// a straw skep, its coils banded, a dark doorway, bees about it
function skep(B, G, x, y, z, s = 1, straw = 0xd8b060) {
  const prof = [[0.002, 0], [0.085, 0], [0.095, 0.04], [0.088, 0.1], [0.064, 0.15], [0.03, 0.18], [0.002, 0.188]].map(([r, h]) => [r * s, y + h * s]);
  lathe(B, prof, [deep(straw, 0.8), straw, tint(straw, 1.12)], { segs: 10, matrix: mat(x, 0, z) });
  for (const h of [0.035, 0.075, 0.115, 0.15]) {
    const r = (h < 0.1 ? 0.094 : h < 0.13 ? 0.078 : 0.058) * s;
    lathe(B.detail, [[r, y + (h - 0.004) * s], [r + 0.004, y + h * s], [r, y + (h + 0.004) * s]], deep(straw, 0.62), { segs: 10, matrix: mat(x, 0, z) });
  }
  B.detail.box(0x2a1a10, { x, y: y + 0.005, z: z + 0.086 * s, sx: 0.04 * s, sy: 0.025 * s, sz: 0.01 });
  for (let k = 0; k < 3; k++) G.shape(TPL.ico0, 0xffd030, { x: x + Math.cos(k * 2.3 + x * 9) * 0.1, y: y + 0.12 + k * 0.05, z: z + 0.08 + Math.sin(k * 2.3) * 0.06, s: 0.018 });
}

// An orchard: apple trees in staggered rows, a ladder against one, a basket
// of picked fruit and windfalls in the grass
function orchard(spec) {
  const { B, G } = builders();
  const fruit = spec.color ?? 0xd8302a;
  const trees = [[-0.36, -0.34], [0.04, -0.4], [0.42, -0.3], [-0.2, 0.02], [0.24, 0.02], [-0.42, 0.34], [0.38, 0.36]];
  trees.forEach(([x, z], i) => fruitTree(B, x, z, 0.95 + ((i * 7) % 4) * 0.06, i, fruit));
  // a ladder leant into the middle tree, a basket below
  const l0 = [-0.06, 0, 0.12], l1 = [-0.16, 0.36, 0.05];
  for (const s of [-1, 1]) tube(B, [[l0[0] + s * 0.035, l0[1], l0[2]], [l1[0] + s * 0.035, l1[1], l1[2]]], 0.01, WOOD, { segs: 4, outline: true });
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    tube(B.detail, [[l0[0] - 0.035 + (l1[0] - l0[0]) * t, l0[1] + (l1[1] - l0[1]) * t, l0[2] + (l1[2] - l0[2]) * t], [l0[0] + 0.035 + (l1[0] - l0[0]) * t, l0[1] + (l1[1] - l0[1]) * t, l0[2] + (l1[2] - l0[2]) * t]], 0.006, WOOD, { segs: 3 });
  }
  lathe(B, [[0.002, 0], [0.05, 0.0], [0.065, 0.06], [0.07, 0.065], [0.06, 0.06]], [0x8a6a3a, 0xb8925a], { segs: 10, matrix: mat(0.06, 0, 0.24) });
  for (let k = 0; k < 5; k++) ball(B, fruit, 0.06 + Math.cos(k * 1.3) * 0.03, 0.065 + (k % 2) * 0.012, 0.24 + Math.sin(k * 1.3) * 0.03, 0.022);
  for (const [x, z] of [[0.16, 0.14], [-0.3, 0.16], [0.3, -0.16]]) ball(B, fruit, x, 0.014, z, 0.018);
  pebbles(B, 3, 0.62, 0x8a8478, 1.7);
  return { B, G, height: 0.6, noLean: true };
}

// an apple tree: a short trunk, a lumpy crown and fruit on its sunny side
function fruitTree(B, x, z, s, seed, fruit) {
  tube(B, [[x, 0, z], [x + 0.01 * s, 0.14 * s, z], [x - 0.015 * s, 0.24 * s, z + 0.01]], [0.03 * s, 0.022 * s], [0x5a3a22, 0x7a5232], { segs: 6 });
  const greens = [0x5a9a34, 0x4a8a2e, 0x6aaa3c];
  const c = [x, 0.31 * s, z];
  const lumps = [[0, 0, 0, 0.13], [0.075, -0.04, 0.03, 0.09], [-0.075, -0.035, -0.02, 0.09], [0.0, 0.05, -0.04, 0.085]];
  lumps.forEach(([lx, ly, lz, r], i) => ball(B, greens[(i + seed) % 3], c[0] + lx * s, c[1] + ly * s, c[2] + lz * s, r * s, r * s * 0.85, r * s, { grad: 0.35 }));
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI * 0.95 + ((k * 0.61 + seed * 0.37) % 1) * Math.PI * 1.9, e = 0.1 + ((k * 0.43 + seed * 0.21) % 1) * 0.8;
    const n = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
    if (n[2] < -0.3) n[2] = -n[2];
    ball(B, fruit, c[0] + n[0] * 0.128 * s, c[1] + n[1] * 0.11 * s, c[2] + n[2] * 0.128 * s, 0.02 * s);
  }
}

// A shepherd's fold: a round stone bothy under a turf roof, a pen of wattle
// hurdles with the flock in it, the shepherd with his crook and his dog.
function sheepfold(spec) {
  const { B, G, F } = withKeeper(spec.keeper || LANDMARK_KEEPERS.sheepfold, 0.08, 0.3, -0.3);
  const stone = spec.color ?? 0xa8a090;
  // the bothy, back left
  const bx = -0.3, bz = -0.26;
  lathe(B, [[0.17, 0], [0.17, 0.2], [0.165, 0.22]], [deep(stone, 0.7), stone], { segs: 10, matrix: mat(bx, 0, bz), flat: true });
  for (let k = 0; k < 10; k++) { const a = k * 0.7; B.detail.box(deep(stone, 0.7), { x: bx + Math.cos(a) * 0.171, y: 0.05 + (k % 3) * 0.05, z: bz + Math.sin(a) * 0.171, sx: 0.05, sy: 0.025, sz: 0.01, ry: -a + Math.PI / 2 }); }
  lathe(B, [[0.2, 0.19], [0.19, 0.24], [0.12, 0.33], [0.04, 0.38], [0.002, 0.385]], [0x6a7a3a, 0x7a9a44, 0x8aaa4a], { segs: 10, matrix: mat(bx, 0, bz) });
  B.box(0x3a2614, { x: bx + 0.03, y: 0.0, z: bz + 0.16, sx: 0.08, sy: 0.15, sz: 0.03, ry: -0.2 });
  smoke(B, bx - 0.04, 0.42, bz - 0.04, 0.7);
  // the fold: hurdles round a pen on the right
  const px = 0.24, pz = -0.06, PW = 0.26, PD = 0.24;
  const hurdle = (x0, z0, x1, z1) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.1));
    for (let k = 0; k <= n; k++) tube(B, [[x0 + (x1 - x0) * k / n, 0, z0 + (z1 - z0) * k / n], [x0 + (x1 - x0) * k / n, 0.13, z0 + (z1 - z0) * k / n]], 0.01, DARKWOOD, { segs: 3, outline: true });
    for (const y of [0.04, 0.08, 0.12]) tube(B, [[x0, y, z0], [x1, y, z1]], 0.01, [0xa07c4a, 0x8a6a3a], { segs: 4 });
  };
  hurdle(px - PW, pz - PD, px + PW, pz - PD);
  hurdle(px + PW, pz - PD, px + PW, pz + PD);
  hurdle(px - PW, pz + PD, px + 0.02, pz + PD);
  hurdle(px - PW, pz - PD, px - PW, pz + PD);
  // the flock: some in the pen, two out grazing
  for (const [x, z, ry, c] of [[0.16, -0.14, 0.4, 0xf2eee4], [0.34, -0.12, -1.2, 0xe8e2d4], [0.26, 0.06, 2.6, 0xf4f0e8], [0.38, 0.1, -2.2, 0x3a3430], [-0.12, 0.36, 1.1, 0xf2eee4], [0.36, 0.38, -0.6, 0xece6d8]]) sheep(B, x, z, ry, c);
  // the dog, sitting by his master
  dog(B, -0.06, 0.38, 0.4);
  pebbles(B, 4, 0.6, 0x8a8478, 0.6);
  return { B, G, F, height: 0.55, noLean: true };
}

function sheep(B, x, z, ry, wool = 0xf2eee4, face = 0x2a2422) {
  const m = mat(x, 0, z, 0, ry, 0);
  const at = (px, py, pz) => { const v = new THREE.Vector3(px, py, pz).applyMatrix4(m); return [v.x, v.y, v.z]; };
  for (const [lx, lz] of [[-0.03, 0.05], [0.03, 0.05], [-0.03, -0.05], [0.03, -0.05]]) tube(B, [at(lx, 0, lz), at(lx, 0.07, lz)], 0.011, face, { segs: 4, outline: true });
  // a woolly body: a fleece of lumps (faceted, so it reads as curls)
  B.shape(TPL.ico1, wool, { matrix: m, y: 0.11, sx: 0.15, sy: 0.12, sz: 0.19 });
  for (const [px, py, pz] of [[0.025, 0.15, 0.04], [-0.025, 0.155, -0.04]]) B.shape(TPL.ico1, tint(wool, 1.05), { matrix: m, x: px, y: py, z: pz, s: 0.08 });
  ball(B, face, 0, 0.12, 0.1, 0.028, 0.032, 0.036, { matrix: m });
  for (const sd of [-1, 1]) ball(B, face, sd * 0.032, 0.135, 0.09, 0.018, 0.008, 0.01, { matrix: m });
  B.shape(TPL.ico1, wool, { matrix: m, y: 0.152, z: 0.088, sx: 0.05, sy: 0.032, sz: 0.046 });
}

function dog(B, x, z, ry) {
  const m = mat(x, 0, z, 0, ry, 0);
  const coat = 0x2a2422, white = 0xf2ece0;
  ball(B, coat, 0, 0.07, -0.02, 0.04, 0.05, 0.055, { matrix: m });
  ball(B, white, 0, 0.08, 0.025, 0.03, 0.04, 0.02, { matrix: m });
  ball(B, coat, 0, 0.13, 0.03, 0.032, 0.03, 0.034, { matrix: m });
  ball(B, white, 0, 0.12, 0.06, 0.016, 0.014, 0.022, { matrix: m });
  for (const s of [-1, 1]) B.shape(TPL.cone4, coat, { matrix: m, x: s * 0.02, y: 0.15, z: 0.02, sx: 0.016, sy: 0.03, sz: 0.012 });
  B.shape(TPL.cone4, coat, { matrix: m, y: 0.03, z: -0.07, sx: 0.02, sy: 0.07, sz: 0.02, rx: -1.3 });
}

// A farm the raiders burned: scorched walls round a gutted cottage, the
// chimney still standing, roof beams fallen in, embers and smoke, a broken
// cart and a toppled fence.
function burntfarm(spec) {
  const { B, G } = builders();
  const wall = blend(0xc8beac, SOOT, 0.6), stone = 0x7e786e;
  yard(B, 0.68, [0x5a5248, 0x6a6252], 0.95);
  for (const [x, z, r] of [[-0.1, -0.2, 0.3], [0.3, 0.2, 0.14]]) B.detail.shape(TPL.cyl12, 0x2a2622, { x, y: 0.006, z, sx: r * 2, sy: 0.006, sz: r * 1.5 });
  const cx = -0.12, cz = -0.28, W = 0.33, D = 0.17;
  B.box(deep(stone, 0.8), { x: cx, y: 0, z: cz, sx: W * 2 + 0.04, sy: 0.04, sz: D * 2 + 0.04 });
  // the walls, broken off at different heights, blackened above
  const seg = (x0, z0, x1, z1, hs) => {
    const n = hs.length;
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n;
      const x = x0 + (x1 - x0) * (a + b) / 2, z = z0 + (z1 - z0) * (a + b) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0) / n + 0.005;
      B.box(blend(wall, SOOT, Math.min(0.8, hs[k] * 1.6)), { x, y: 0.03, z, sx: Math.abs(x1 - x0) > 0.01 ? len : 0.05, sy: hs[k], sz: Math.abs(z1 - z0) > 0.01 ? len : 0.05, grad: -0.3 });
    }
  };
  seg(cx - W, cz + D, cx + W, cz + D, [0.3, 0.22, 0.08, 0.05, 0.16, 0.26]);
  seg(cx - W, cz - D, cx + W, cz - D, [0.38, 0.34, 0.3, 0.22, 0.3, 0.36]);
  seg(cx - W, cz - D, cx - W, cz + D, [0.36, 0.32, 0.3]);
  seg(cx + W, cz - D, cx + W, cz + D, [0.3, 0.2, 0.14]);
  // a doorway and a window, soot licking up from them
  B.box(0x1a1614, { x: cx - 0.12, y: 0.04, z: cz + D + 0.022, sx: 0.1, sy: 0.18, sz: 0.008 });
  for (const [x, y] of [[cx - 0.12, 0.24], [cx + 0.22, 0.12]]) B.detail.shape(TPL.cone4, SOOT, { x, y, z: cz + D + 0.026, sx: 0.09, sy: 0.12, sz: 0.004, ry: Math.PI / 4 });
  // the chimney, whole, at the gable
  const chx = cx - W + 0.08;
  B.box(stone, { x: chx, y: 0.03, z: cz - 0.04, sx: 0.12, sy: 0.82, sz: 0.12, grad: 0.4 });
  B.box(deep(stone, 0.7), { x: chx, y: 0.84, z: cz - 0.04, sx: 0.14, sy: 0.035, sz: 0.14 });
  // fallen roof beams, charred, and a heap of burnt thatch
  for (const [a, b] of [[[cx - 0.2, 0.36, cz - 0.1], [cx + 0.25, 0.02, cz + 0.12]], [[cx + 0.3, 0.28, cz - 0.12], [cx - 0.05, 0.02, cz + 0.02]], [[cx - 0.28, 0.32, cz + 0.1], [cx + 0.1, 0.36, cz - 0.12]]]) tube(B, [a, b], 0.026, [0x1e1a18, 0x3a2e24, 0x1e1a18], { segs: 6 });
  ball(B, 0x4a3e30, cx + 0.05, 0.03, cz, 0.2, 0.06, 0.12, { grad: 0.4 });
  for (let k = 0; k < 5; k++) G.shape(TPL.ico0, k % 2 ? 0xff6a20 : 0xffa040, { x: cx + Math.cos(k * 1.9) * 0.14, y: 0.06, z: cz + Math.sin(k * 1.9) * 0.08, s: 0.03 });
  smoke(B, cx + 0.08, 0.42, cz - 0.02, 1.2, 0x8a8682);
  // the broken cart on its side, a fence knocked flat
  const m = mat(0.34, 0.12, 0.2, 0, -0.5, 1.25);
  B.box(0x5a4030, { matrix: m, sx: 0.32, sy: 0.03, sz: 0.2 });
  for (const s of [-1, 1]) B.box(0x4a3424, { matrix: m, y: 0.03, z: s * 0.1, sx: 0.32, sy: 0.07, sz: 0.02 });
  lathe(B, [[0.08, -0.012], [0.085, 0], [0.08, 0.012], [0.06, 0.012], [0.06, -0.012], [0.08, -0.012]], 0x3a2a1e, { segs: 12, matrix: mat(0.46, 0.09, 0.36, Math.PI / 2, 0, 0.2), keepSegs: true });
  for (let k = 0; k < 5; k++) {
    const x = -0.5 + k * 0.12;
    tube(B, [[x, 0, 0.42], [x + 0.04, 0.12 - (k % 2) * 0.07, 0.44 + (k % 2) * 0.04]], 0.016, 0x3a2e24, { segs: 4, outline: true });
  }
  tube(B, [[-0.52, 0.03, 0.46], [-0.02, 0.02, 0.5]], 0.012, 0x4a3a2a, { segs: 4 });
  crow(B, chx, 0.875, cz - 0.04, 1.2);
  crow(B, 0.08, 0.0, 0.3, -2.2);
  pebbles(B, 5, 0.62, 0x6a645c, 0.3);
  return { B, G, height: 0.9, noLean: true };
}

// ---------------------------------------------------------------- stones and holy places
// A ring of standing stones about a flat altar-stone, two of them bridged
// by a lintel at the back; runes glow faintly on the altar. Ruined: stones
// fallen and broken, the lintel down, moss over everything, no light.
function stonecircle(spec) {
  const { B, G } = builders();
  const ruined = !!spec.ruined;
  const st = spec.color ?? 0x9a9aa0, glow = spec.glow ?? 0x8af0ff;
  const N = 9, R = 0.44;
  const stoneAt = (a, h, w, lean, broken) => {
    const x = Math.cos(a) * R, z = Math.sin(a) * R * 0.92;
    const m = mat(x, 0, z, lean * Math.sin(a), -a + Math.PI / 2, lean * Math.cos(a));
    const prof = broken
      ? [[w, 0, w * 0.7], [w * 1.04, h * 0.5, w * 0.72], [w * 0.9, h, w * 0.64]]
      : [[w, 0, w * 0.7], [w * 1.04, h * 0.35, w * 0.72], [w * 0.92, h * 0.85, w * 0.64], [w * 0.5, h, w * 0.4]];
    lathe(B, prof, [deep(st, 0.62), st, tint(st, 1.1)], { segs: 5, matrix: m, flat: true, keepSegs: true, rot: 0.4 });
    if (h > 0.2) ball(B, MOSS, 0, h * 0.95, 0, w * 0.6, 0.02, w * 0.5, { matrix: m });
    return { x, z, h };
  };
  const heights = [0.4, 0.34, 0.38, 0.46, 0.5, 0.5, 0.46, 0.36, 0.4];
  const stones = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    const fallen = ruined && (i === 1 || i === 6 || i === 8);
    const broken = ruined && (i === 3 || i === 7);
    if (fallen) {
      // lying in the grass where it fell, outwards
      const x = Math.cos(a) * (R + 0.08), z = Math.sin(a) * (R + 0.08) * 0.92;
      B.box(st, { x, y: 0, z, sx: 0.11, sy: 0.07, sz: heights[i] * 0.9, ry: -a + Math.PI / 2 + Math.PI / 2, grad: 0.4 });
      ball(B, MOSS, x, 0.07, z, 0.06, 0.015, 0.08);
      stones.push(null);
      continue;
    }
    stones.push(stoneAt(a, broken ? heights[i] * 0.45 : heights[i], 0.075, ruined ? 0.12 * ((i % 3) - 1) : 0.04 * ((i % 3) - 1), broken));
  }
  // the lintel across the two tallest, at the back
  const [s4, s5] = [stones[4], stones[5]];
  if (!ruined && s4 && s5) {
    const y = Math.min(s4.h, s5.h) - 0.01;
    const dx = s5.x - s4.x, dz = s5.z - s4.z;
    B.box(tint(st, 1.05), { x: (s4.x + s5.x) / 2, y, z: (s4.z + s5.z) / 2, sx: Math.hypot(dx, dz) + 0.16, sy: 0.07, sz: 0.1, ry: -Math.atan2(dz, dx), grad: 0.4 });
  } else if (ruined) {
    B.box(st, { x: 0.05, y: 0, z: -0.52, sx: 0.36, sy: 0.07, sz: 0.1, ry: 0.25, rz: 0.08, grad: 0.4 });
  }
  // the altar-stone in the middle
  B.box(deep(st, 0.9), { x: 0, y: 0, z: 0.02, sx: 0.26, sy: ruined ? 0.06 : 0.09, sz: 0.16, ry: 0.15, grad: 0.4, rz: ruined ? 0.12 : 0 });
  if (!ruined) {
    for (let k = 0; k < 4; k++) G.box(glow, { x: -0.08 + k * 0.055, y: 0.092, z: 0.02 + (k % 2) * 0.03, sx: 0.02, sy: 0.004, sz: 0.05, ry: 0.15 + k * 0.6 });
    G.shape(TPL.ico1, glow, { y: 0.2, s: 0.05 });
    for (const [x, z] of [[0.12, 0.18], [-0.16, 0.14]]) G.shape(TPL.ico0, 0xffe0a0, { x, y: 0.03, z, s: 0.025 });
  } else {
    ivy(B, 0.08, 0.06, 0.1, 0.05, 2);
    rubble(B, 0.28, 0.3, 0.07, 4, st, 3);
  }
  pebbles(B, 5, 0.58, 0x8a8478, 2.7);
  return { B, G, height: 0.55, noLean: true };
}

// A wayside chapel: grey stone under a slate roof, its gable to the road with
// an arched door, a rose window lit within, a bell in the bell-cote and a
// cross on the far gable, two graves by the path. Ruined: roofless, its walls
// broken, a fallen beam, and a cold light in the nave.
function chapel(spec) {
  const { B, G } = builders();
  const ruined = !!spec.ruined;
  const st = spec.color ?? 0xc8c0b0, roof = spec.roof ?? 0x6a7486, glow = spec.glow ?? (ruined ? 0x9af0d0 : 0xffc860);
  const W = 0.2, D = 0.32, cz = -0.08;
  const F = cz + D;
  yard(B, 0.1, [0xb8ae94, 0xa89e86], 2.2, 0, F + 0.18, 3);
  if (!ruined) {
    // the nave, behind its tower
    const nz = -0.16, ND = 0.24, eave = 0.34, ridge = 0.56;
    B.box(deep(st, 0.75), { y: 0, z: nz, sx: W * 2 + 0.05, sy: 0.04, sz: ND * 2 + 0.05 });
    B.box(st, { y: 0.03, z: nz, sx: W * 2, sy: eave - 0.03, sz: ND * 2, grad: 0.2 });
    for (const s of [-1, 1]) for (const z of [nz - 0.14, nz + 0.08]) B.box(deep(st, 0.9), { x: s * (W + 0.025), y: 0.03, z, sx: 0.05, sy: 0.26, sz: 0.07, grad: 0.3 });
    // tall lit windows down the sides
    for (const s of [-1, 1]) for (const z of [nz - 0.03, nz + 0.17]) {
      G.box(glow, { x: s * (W + 0.003), y: 0.15, z, sx: 0.006, sy: 0.13, sz: 0.045 });
      ball(G, glow, s * (W + 0.003), 0.28, z, 0.004, 0.025, 0.0225);
    }
    // the slate roof, ridge along the nave
    const run = ridge - eave + 0.04, out = W + 0.06;
    for (const s of [-1, 1]) {
      sheet(B, (u, v) => [s * (0.01 + v * out), ridge - v * run, nz + (u - 0.5) * (ND * 2 + 0.08)], [tint(roof, 1.18), deep(roof, 0.85)], { nu: 3, nv: 3, thick: 0.03, flipN: s < 0, back: deep(roof, 0.5) });
      for (const v of [0.3, 0.6, 0.9]) B.detail.box(deep(roof, 0.62), { x: s * (0.01 + v * out + 0.006), y: ridge - v * run + 0.018, z: nz, sx: 0.012, sy: 0.008, sz: ND * 2 + 0.06 });
    }
    tube(B, [[0, ridge + 0.01, nz - ND - 0.04], [0, ridge + 0.01, nz + ND + 0.04]], 0.022, deep(roof, 0.6), { segs: 6 });
    const a0 = [-W - 0.005, eave - 0.01, nz - ND], b0 = [W + 0.005, eave - 0.01, nz - ND], m0 = [0, ridge - 0.02, nz - ND];
    B.tri(a0, b0, m0, st); B.tri(a0, m0, b0, st);
    // a stone cross on the far gable
    B.box(st, { y: ridge - 0.02, z: nz - ND, sx: 0.025, sy: 0.14, sz: 0.025 });
    B.box(st, { y: ridge + 0.06, z: nz - ND, sx: 0.08, sy: 0.022, sz: 0.022 });
    // the tower at the front: belfry, a slate spire and a gold cross
    const tz = nz + ND + 0.05, TW = 0.12, th = 0.84;
    B.box(deep(st, 0.75), { y: 0, z: tz, sx: TW * 2 + 0.04, sy: 0.04, sz: TW * 2 + 0.04 });
    B.box(tint(st, 1.03), { y: 0.03, z: tz, sx: TW * 2, sy: th - 0.03, sz: TW * 2, grad: 0.25 });
    B.box(deep(st, 0.85), { y: th - 0.02, z: tz, sx: TW * 2 + 0.03, sy: 0.035, sz: TW * 2 + 0.03 });
    for (const [x, z, ry] of [[0, tz + TW + 0.002, 0], [TW + 0.002, tz, Math.PI / 2], [-TW - 0.002, tz, Math.PI / 2]]) {
      B.box(0x2a2420, { x, y: th - 0.2, z, sx: 0.07, sy: 0.12, sz: 0.01, ry });
      ball(B.detail, 0x2a2420, x, th - 0.08, z, 0.035, 0.03, 0.006, { ry });
    }
    MT(B, () => lathe(B, [[0.002, th - 0.1], [0.016, th - 0.11], [0.026, th - 0.15], [0.034, th - 0.18]], [GOLD, tint(GOLD, 1.15)], { segs: 10, matrix: mat(0, 0, tz + TW - 0.02) }));
    B.shape(TPL.cone4, roof, { y: th + 0.015, z: tz, sx: (TW + 0.03) * 2 * 1.414, sy: 0.46, sz: (TW + 0.03) * 2 * 1.414, ry: Math.PI / 4, flat: true });
    MT(B, () => {
      B.box(GOLD, { y: th + 0.45, z: tz, sx: 0.018, sy: 0.13, sz: 0.018 });
      B.box(GOLD, { y: th + 0.53, z: tz, sx: 0.075, sy: 0.018, sz: 0.018 });
    });
    // the door at the tower's foot, a round window over it, a lantern
    const TF = tz + TW + 0.004;
    B.box(0x5a3a20, { y: 0.03, z: TF, sx: 0.1, sy: 0.16, sz: 0.012 });
    ball(B, 0x5a3a20, 0, 0.19, TF, 0.05, 0.045, 0.006);
    for (const sd of [-1, 1]) B.box(deep(st, 0.8), { x: sd * 0.063, y: 0.03, z: TF + 0.004, sx: 0.024, sy: 0.17, sz: 0.02 });
    tube(B, [[-0.063, 0.19, TF + 0.008], [0, 0.255, TF + 0.008], [0.063, 0.19, TF + 0.008]], 0.013, deep(st, 0.8), { segs: 5 });
    B.box(deep(st, 0.75), { y: 0.0, z: TF + 0.04, sx: 0.16, sy: 0.03, sz: 0.06 });
    G.shape(TPL.cyl12, glow, { y: 0.4, z: TF - 0.002, sx: 0.08, sy: 0.01, sz: 0.08, rx: Math.PI / 2 });
    for (let k = 0; k < 4; k++) B.detail.box(deep(st, 0.6), { y: 0.396, z: TF + 0.006, sx: 0.08, sy: 0.006, sz: 0.004, rz: (k / 4) * Math.PI });
    tube(B, [[0.17, 0, TF + 0.08], [0.17, 0.24, TF + 0.08]], 0.01, IRON, { segs: 4, outline: true });
    G.shape(TPL.ico0, 0xffc060, { x: 0.17, y: 0.26, z: TF + 0.08, s: 0.04 });
  } else {
    B.box(deep(st, 0.75), { y: 0, z: cz, sx: W * 2 + 0.05, sy: 0.04, sz: D * 2 + 0.05 });
    // broken walls: the front gable with its empty door, stumps of the rest
    const wall = (x0, z0, x1, z1, hs, col = st) => {
      const n = hs.length;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, len = Math.hypot(x1 - x0, z1 - z0) / n + 0.004;
        const along = Math.abs(x1 - x0) > 0.01;
        B.box(k % 2 ? col : tint(col, 0.94), { x: x0 + (x1 - x0) * t, y: 0.03, z: z0 + (z1 - z0) * t, sx: along ? len : 0.05, sy: hs[k], sz: along ? 0.05 : len, grad: 0.35 });
      }
    };
    wall(-W, cz - D, -W, cz + D, [0.36, 0.3, 0.22, 0.12, 0.08, 0.2]);
    wall(W, cz - D, W, cz + D, [0.2, 0.1, 0.06, 0.18, 0.3, 0.38]);
    // the east gable still stands to its peak, its tall window empty
    const bz = cz - D;
    for (const sd of [-1, 1]) B.box(sd < 0 ? st : tint(st, 0.94), { x: sd * 0.12, y: 0.03, z: bz, sx: 0.16, sy: sd < 0 ? 0.52 : 0.4, sz: 0.05, grad: 0.35 });
    B.box(st, { y: 0.03, z: bz, sx: 0.08, sy: 0.1, sz: 0.05, grad: 0.35 });
    B.box(st, { x: -0.02, y: 0.42, z: bz, sx: 0.12, sy: 0.18, sz: 0.05 });
    for (const zz of [bz + 0.026, bz - 0.026]) {
      const a = [-W, 0.55, zz], b = [0.04, 0.55, zz], m = [-0.02, 0.72, zz];
      if (zz > bz) B.tri(a, b, m, st); else B.tri(a, m, b, st);
    }
    B.box(0x2a2622, { y: 0.13, z: bz + 0.027, sx: 0.06, sy: 0.28, sz: 0.004 });
    // the front: piers each side of the doorway and a broken arch over it
    for (const s of [-1, 1]) B.box(st, { x: s * 0.13, y: 0.03, z: F, sx: 0.12, sy: s < 0 ? 0.56 : 0.42, sz: 0.05, grad: 0.3 });
    B.tri([-W, 0.58, F + 0.026], [-0.07, 0.58, F + 0.026], [-0.07, 0.66, F + 0.026], st);
    B.tri([-W, 0.58, F - 0.026], [-0.07, 0.66, F - 0.026], [-0.07, 0.58, F - 0.026], st);
    B.box(st, { x: -0.04, y: 0.25, z: F, sx: 0.08, sy: 0.05, sz: 0.05, rz: -0.3 });
    // a fallen beam, rubble in the nave, ivy, the ghost-light and its stone
    tube(B, [[-W + 0.02, 0.3, cz - 0.15], [W - 0.04, 0.02, cz + 0.1]], 0.02, [0x3a2e24, 0x5a4434], { segs: 6 });
    rubble(B, 0.06, cz - 0.05, 0.14, 8, st, 4);
    rubble(B, 0.3, F + 0.06, 0.08, 4, st, 1);
    ivy(B, -0.13, 0.4, F + 0.03, 0.06, 0);
    ivy(B, W + 0.03, 0.15, cz - 0.2, 0.06, 2);
    lathe(B, [[0.06, 0, 0.035], [0.06, 0.2, 0.035], [0.035, 0.24, 0.025]], [deep(0x9a9aa4, 0.7), 0x9a9aa4], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, matrix: mat(-0.06, 0, cz - 0.18) });
    for (let k = 0; k < 3; k++) G.box(glow, { x: -0.06 + (k - 1) * 0.022, y: 0.1 + (k % 2) * 0.04, z: cz - 0.18 + 0.037, sx: 0.01, sy: 0.05, sz: 0.004, rz: (k - 1) * 0.5 });
    G.shape(TPL.ico1, glow, { x: 0.02, y: 0.34, z: cz - 0.08, sx: 0.07, sy: 0.12, sz: 0.07 });
    G.shape(TPL.ico0, tint(glow, 1.2), { x: 0.06, y: 0.44, z: cz - 0.06, s: 0.035 });
    crow(B, -0.13, 0.59, F, 0.4);
  }
  // two graves by the path
  for (const [x, z, lean] of [[-0.36, F - 0.05, 0.1], [0.36, F - 0.12, ruined ? -0.3 : -0.08]]) headstone(B, x, z, 0, lean, ruined ? 0x8a8a84 : 0xa8a49a);
  pebbles(B, 4, 0.58, 0x8a8478, 1.2);
  return { B, G, height: ruined ? 0.7 : 1.4, noLean: true };
}

// a headstone, round-topped or a cross, on its mound
function headstone(B, x, z, ry = 0, lean = 0, col = 0xa8a49a, cross = false) {
  const m = mat(x, 0, z, lean, ry, lean * 0.4);
  if (cross) {
    B.box(col, { matrix: m, sx: 0.025, sy: 0.16, sz: 0.025, grad: 0.4 });
    B.box(col, { matrix: m, y: 0.1, sx: 0.08, sy: 0.022, sz: 0.022 });
  } else {
    B.box(col, { matrix: m, sx: 0.08, sy: 0.1, sz: 0.025, grad: 0.4 });
    B.shape(TPL.cyl12, col, { matrix: m, y: 0.1, z: -0.0125, sx: 0.08, sy: 0.025, sz: 0.08, rx: Math.PI / 2 });
    B.detail.box(deep(col, 0.6), { matrix: m, y: 0.07, z: 0.0135, sx: 0.04, sy: 0.006, sz: 0.003 });
    B.detail.box(deep(col, 0.6), { matrix: m, y: 0.05, z: 0.0135, sx: 0.03, sy: 0.006, sz: 0.003 });
  }
  ball(B.detail, 0x6a8a3a, x, 0.0, z + 0.07, 0.04, 0.02, 0.06, { ry });
}

// An old graveyard: a dry-stone wall with a lych-gate, rows of headstones
// (some leaning), a crypt at the back, a dead tree with a crow, and pale
// lights drifting between the graves.
function graveyard(spec) {
  const { B, G } = builders();
  const st = spec.color ?? 0xa8a49a, glow = spec.glow ?? 0xb0ffd0;
  // the wall round three sides and the front, a gap for the gate
  const R = 0.56;
  const wallRun = (x0, z0, x1, z1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.14));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      B.box(k % 2 ? st : deep(st, 0.92), { x: x0 + (x1 - x0) * t, y: 0, z: z0 + (z1 - z0) * t, sx: Math.abs(x1 - x0) > 0.01 ? Math.hypot(x1 - x0, z1 - z0) / n + 0.01 : 0.07, sy: 0.1 + (k % 3) * 0.012, sz: Math.abs(z1 - z0) > 0.01 ? Math.hypot(x1 - x0, z1 - z0) / n + 0.01 : 0.07, grad: 0.4 });
    }
  };
  wallRun(-R, -R * 0.8, R, -R * 0.8);
  wallRun(-R, -R * 0.8, -R, R * 0.8);
  wallRun(R, -R * 0.8, R, R * 0.8);
  wallRun(-R, R * 0.8, -0.12, R * 0.8);
  wallRun(0.12, R * 0.8, R, R * 0.8);
  // the lych-gate: two posts under a small shingled roof
  for (const s of [-1, 1]) tube(B, [[s * 0.11, 0, R * 0.8], [s * 0.11, 0.24, R * 0.8]], 0.018, DARKWOOD, { segs: 5 });
  B.shape(TPL.prism, 0x6a5040, { y: 0.23, z: R * 0.8, sx: 0.32, sy: 0.1, sz: 0.14 });
  // the crypt at the back: columns, a pediment, a dark door
  const cz = -0.32;
  B.box(deep(st, 0.85), { y: 0, z: cz, sx: 0.34, sy: 0.04, sz: 0.22 });
  B.box(st, { y: 0.04, z: cz - 0.02, sx: 0.28, sy: 0.24, sz: 0.18, grad: 0.3 });
  B.shape(TPL.prism, tint(st, 1.05), { y: 0.28, z: cz - 0.02, sx: 0.34, sy: 0.1, sz: 0.24, ry: 0 });
  B.box(0x1e1a18, { y: 0.04, z: cz + 0.072, sx: 0.09, sy: 0.15, sz: 0.01 });
  for (const s of [-1, 1]) tube(B, [[s * 0.1, 0.04, cz + 0.09], [s * 0.1, 0.28, cz + 0.09]], 0.018, tint(st, 1.08), { segs: 6 });
  B.box(deep(st, 0.85), { y: 0.27, z: cz + 0.09, sx: 0.28, sy: 0.025, sz: 0.04 });
  // rows of headstones
  const graves = [[-0.36, -0.06, 0.1, false], [-0.18, -0.04, -0.15, true], [0.2, -0.02, 0.05, false], [0.38, -0.08, 0.25, false], [-0.38, 0.22, -0.2, false], [-0.2, 0.26, 0.05, false], [0.22, 0.24, -0.1, true], [0.4, 0.2, 0.2, false]];
  graves.forEach(([x, z, lean, cross], i) => headstone(B, x, z, (i % 3 - 1) * 0.15, lean, i % 2 ? st : tint(st, 0.92), cross));
  // a dead tree in the corner, a crow on its bough
  const tx = 0.4, tz = -0.32;
  tube(B, [[tx, 0, tz], [tx - 0.02, 0.2, tz], [tx + 0.02, 0.38, tz + 0.01]], [0.035, 0.025, 0.012], [0x4a3e34, 0x5a4e42], { segs: 6 });
  tube(B, [[tx - 0.02, 0.22, tz], [tx - 0.16, 0.34, tz + 0.02], [tx - 0.22, 0.42, tz + 0.03]], [0.018, 0.01, 0.004], 0x5a4e42, { segs: 5, outline: true });
  tube(B, [[tx + 0.0, 0.28, tz], [tx + 0.12, 0.38, tz - 0.02], [tx + 0.13, 0.46, tz - 0.02]], [0.015, 0.008, 0.004], 0x5a4e42, { segs: 5, outline: true });
  crow(B, tx - 0.15, 0.335, tz + 0.02, 0.6);
  // will-o'-the-wisps
  for (const [x, y, z, s] of [[-0.1, 0.18, 0.12, 0.04], [0.28, 0.26, 0.08, 0.03], [-0.3, 0.3, -0.18, 0.035]]) {
    G.shape(TPL.ico1, glow, { x, y, z, s });
    G.shape(TPL.ico0, glow, { x: x + 0.03, y: y - 0.05, z, s: s * 0.5 });
  }
  return { B, G, height: 0.5, noLean: true };
}

// A gibbet on a mound at the crossroads: a gallows-post and arm, an iron
// cage swinging from its chain with a few bones inside, a notice nailed to
// the post and crows waiting.
function gibbet(spec) {
  const { B, G } = builders();
  const wood = spec.color ?? 0x5a4434;
  lathe(B, [[0.002, 0.06], [0.24, 0.05], [0.36, 0.02], [0.42, 0.0]], [0x7a8a48, 0x6a7a40], { segs: 16, sq: 0.9 });
  tube(B, [[-0.08, 0.04, -0.04], [-0.08, 0.92, -0.04]], 0.035, [deep(wood, 0.8), wood], { segs: 6 });
  tube(B, [[-0.12, 0.88, -0.04], [0.3, 0.88, -0.04]], 0.028, wood, { segs: 6 });
  tube(B, [[-0.08, 0.62, -0.04], [0.08, 0.86, -0.04]], 0.018, deep(wood, 0.85), { segs: 5 });
  // the chain and the cage
  const cx = 0.24, cy = 0.36, cr = 0.09, ch = 0.3;
  tube(B, [[cx, 0.86, -0.04], [cx, cy + ch + 0.02, -0.04]], 0.006, IRON, { segs: 3, outline: true });
  MT(B, () => {
    for (const y of [cy, cy + ch * 0.5, cy + ch]) lathe(B, [[cr, y - 0.008], [cr + 0.008, y], [cr, y + 0.008]], IRON, { segs: 10, matrix: mat(cx, 0, -0.04) });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      tube(B, [[cx + Math.cos(a) * cr, cy - 0.01, -0.04 + Math.sin(a) * cr], [cx + Math.cos(a) * cr, cy + ch, -0.04 + Math.sin(a) * cr], [cx + Math.cos(a) * cr * 0.3, cy + ch + 0.06, -0.04 + Math.sin(a) * cr * 0.3]], 0.006, IRON, { segs: 3, outline: true });
    }
  });
  lathe(B, [[0.002, cy - 0.01], [cr, cy - 0.01]], 0x3a3a3e, { segs: 10, matrix: mat(cx, 0, -0.04) });
  // what is left of the last tenant
  ball(B, BONE, cx, cy + 0.2, -0.04, 0.035, 0.04, 0.035);
  for (const s of [-1, 1]) ball(B.detail, 0x1a1410, cx + s * 0.012, cy + 0.205, -0.008, 0.008);
  tube(B, [[cx - 0.03, cy + 0.02, -0.06], [cx + 0.04, cy + 0.1, -0.02]], 0.008, BONE, { segs: 4, outline: true });
  tube(B, [[cx + 0.03, cy + 0.02, -0.08], [cx - 0.03, cy + 0.14, -0.04]], 0.008, BONE, { segs: 4, outline: true });
  // a notice on the post, a ladder, crows
  B.box(0xe8dcb8, { x: -0.08, y: 0.42, z: -0.004, sx: 0.12, sy: 0.14, sz: 0.008, rz: 0.06 });
  for (let k = 0; k < 4; k++) B.detail.box(0x3a2a1a, { x: -0.08, y: 0.5 - k * 0.025, z: 0.002, sx: 0.08 - (k % 2) * 0.02, sy: 0.006, sz: 0.003, rz: 0.06 });
  crow(B, 0.12, 0.905, -0.04, 1.2);
  crow(B, cx, cy + ch + 0.07, -0.04, -0.6);
  crow(B, 0.2, 0.05, 0.22, 2.4);
  for (const s of [-1, 1]) tube(B, [[-0.24 + s * 0.035, 0.03, 0.12], [-0.12 + s * 0.035, 0.6, -0.02]], 0.009, WOOD, { segs: 4, outline: true });
  for (let k = 1; k < 6; k++) { const t = k / 6; tube(B.detail, [[-0.275 + 0.12 * t, 0.03 + 0.57 * t, 0.12 - 0.14 * t], [-0.205 + 0.12 * t, 0.03 + 0.57 * t, 0.12 - 0.14 * t]], 0.006, WOOD, { segs: 3 }); }
  pebbles(B, 5, 0.4, 0x8a8478, 0.4);
  return { B, G, height: 0.98, noLean: true };
}

// ---------------------------------------------------------------- at work
// Woodcutters' camp: a lean-to of poles and bark, logs stacked high, an axe
// in the chopping stump, a saw-horse, and the charcoal clamp smoking away.
function woodcamp(spec) {
  const { B, G, F } = withKeeper(spec.keeper || LANDMARK_KEEPERS.woodcamp, 0.26, 0.24, -0.9);
  const wood = spec.color ?? 0x8a5a30, bark = 0x5a3e26, cut = 0xe0b878;
  yard(B, 0.64, [0x8a7a50, 0x7a6a46], 0.95);
  // wood chips about the stump
  for (let k = 0; k < 10; k++) B.detail.box(cut, { x: -0.12 + Math.cos(k * 2.3) * 0.12, y: 0.005, z: 0.18 + Math.sin(k * 2.3) * 0.08, sx: 0.025, sy: 0.006, sz: 0.012, ry: k });
  // the lean-to
  const lx = -0.3, lz = -0.3;
  for (const s of [-1, 1]) tube(B, [[lx + s * 0.18, 0, lz + 0.1], [lx + s * 0.18, 0.32, lz + 0.1]], 0.016, bark, { segs: 5 });
  sheet(B, (u, v) => [lx + (u - 0.5) * 0.44, 0.34 - v * 0.32, lz + 0.12 - v * 0.26], [0x7a5a3a, 0x5a4028], { nu: 3, nv: 2, thick: 0.02, back: 0x3a2818 });
  for (let k = 0; k < 4; k++) B.detail.box(0x4a3020, { x: lx - 0.16 + k * 0.11, y: 0.2, z: lz - 0.01, sx: 0.01, sy: 0.006, sz: 0.3, rx: 0.9 });
  ball(B, 0x6a7a4a, lx - 0.04, 0.03, lz - 0.02, 0.1, 0.03, 0.06);
  // the log pile: three courses, pale cut ends towards the road
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
    const z = -0.42 + k * 0.07 + row * 0.035, y = 0.035 + row * 0.06;
    tube(B, [[0.06, y, z], [0.46, y, z]], 0.033, [cut, bark, bark, cut], { segs: 7 });
  }
  // the chopping stump and its axe, a split log
  lathe(B, [[0.065, 0, 0.06], [0.06, 0.1, 0.055], [0.055, 0.11, 0.05]], [bark, cut], { segs: 9, matrix: mat(-0.12, 0, 0.18) });
  tube(B, [[-0.12, 0.11, 0.18], [-0.06, 0.28, 0.2]], 0.01, wood, { segs: 4, outline: true });
  MT(B, () => B.box(0x9aa0a8, { x: -0.125, y: 0.09, z: 0.18, sx: 0.07, sy: 0.04, sz: 0.012, rz: 0.35 }));
  for (const s of [-1, 1]) tube(B, [[-0.03 + s * 0.02, 0.025, 0.24], [0.07 + s * 0.02, 0.03, 0.28]], 0.022, [cut, bark], { segs: 5, sq: 0.6 });
  // the saw-horse with a log on it
  for (const z of [0.0, 0.2]) for (const s of [-1, 1]) tube(B, [[0.38 + s * 0.06, 0, z + 0.04], [0.38, 0.14, z + 0.04]], 0.01, wood, { segs: 4, outline: true });
  tube(B, [[0.38, 0.17, -0.08], [0.38, 0.17, 0.34]], 0.04, [cut, bark, bark, cut], { segs: 7 });
  // the charcoal clamp: a mound of turf, smoke curling from its top
  lathe(B, [[0.002, 0.2], [0.06, 0.19], [0.13, 0.13], [0.17, 0.05], [0.18, 0.0]], [0x3a3228, 0x5a4a34, 0x6a5a3a], { segs: 12, matrix: mat(-0.4, 0, 0.18) });
  for (let k = 0; k < 4; k++) G.shape(TPL.ico0, 0xff7a24, { x: -0.4 + Math.cos(k * 1.7) * 0.14, y: 0.04, z: 0.18 + Math.sin(k * 1.7) * 0.12 + 0.02, s: 0.02 });
  for (const [dx, y, r] of [[0, 0.24, 0.045], [0.02, 0.33, 0.055], [0.05, 0.43, 0.06], [0.09, 0.54, 0.05]]) ball(B, 0xc8c2ba, -0.4 + dx, y, 0.16, r, r * 0.85, r);
  pebbles(B, 4, 0.6, 0x8a8478, 1.9);
  return { B, G, F, height: 0.6, noLean: true };
}

// A quarry: a terraced face of cut rock, blocks stacked ready, a wooden
// crane with a block on its rope, a cart and picks.
function quarry(spec) {
  const { B, G } = builders();
  const rock = spec.color ?? 0xb0a898, dust = [0xc8bca2, 0xb8ac92];
  yard(B, 0.5, dust, 0.9, 0, 0.04, 4);
  // the face: three steps of cut stone in an arc round the back, the
  // highest at the back, pale where it is freshly cut
  for (let tier = 0; tier < 2; tier++) {
    const r = 0.36 + tier * 0.12, h = 0.16 + tier * 0.18;
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 1.2 + (k / 5) * Math.PI * 0.6;
      const x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r * 0.8 - 0.04;
      B.box(k % 2 ? rock : tint(rock, 0.9 + tier * 0.05), { x, y: 0, z, sx: 0.21, sy: h + ((k * 3 + tier) % 4) * 0.02, sz: 0.13, ry: -a + Math.PI / 2, grad: 0.5 });
    }
  }
  // grass and bushes along the lip of the face
  for (const [x, z] of [[-0.36, -0.44], [-0.12, -0.52], [0.16, -0.52], [0.38, -0.44]]) ball(B, 0x6a9a3a, x, 0.38, z, 0.09, 0.03, 0.06);
  // cut blocks stacked ready
  for (const [x, y, z, ry] of [[0.3, 0, 0.18, 0.1], [0.42, 0, 0.12, -0.2], [0.35, 0.09, 0.15, 0.3], [-0.36, 0, 0.26, 0.6]]) B.box(tint(rock, 1.06), { x, y, z, sx: 0.12, sy: 0.09, sz: 0.09, ry, grad: 0.3 });
  // the crane: an A-frame with its jib, a rope and a block
  const cx = -0.18, cz = 0.0;
  for (const s of [-1, 1]) tube(B, [[cx + s * 0.1, 0, cz - 0.06], [cx, 0.56, cz]], 0.016, WOOD, { segs: 5 });
  tube(B, [[cx, 0, cz + 0.12], [cx, 0.56, cz]], 0.014, WOOD, { segs: 5 });
  tube(B, [[cx, 0.54, cz], [cx + 0.3, 0.6, cz + 0.14]], 0.014, DARKWOOD, { segs: 5 });
  tube(B, [[cx + 0.3, 0.6, cz + 0.14], [cx + 0.3, 0.2, cz + 0.14]], 0.004, 0xd8c890, { segs: 3, cap: false });
  B.box(tint(rock, 1.06), { x: cx + 0.3, y: 0.1, z: cz + 0.14, sx: 0.1, sy: 0.08, sz: 0.08 });
  lathe(B, [[0.04, -0.03], [0.045, 0], [0.04, 0.03], [0.002, 0.03]], DARKWOOD, { segs: 8, matrix: mat(cx, 0.12, cz + 0.12, Math.PI / 2, 0, 0) });
  // a cart of rubble and a pick leant on it
  B.box(0x7a5232, { x: 0.12, y: 0.06, z: 0.34, sx: 0.2, sy: 0.07, sz: 0.13 });
  for (const s of [-1, 1]) lathe(B, [[0.05, -0.01], [0.055, 0], [0.05, 0.01], [0.002, 0.01]], 0x4a3424, { segs: 10, matrix: mat(0.12 + s * 0.06, 0.05, 0.415, Math.PI / 2, 0, 0) });
  rubble(B, 0.12, 0.34, 0.06, 4, rock, 3);
  for (let k = 0; k < 4; k++) B.shape(TPL.dodec, rock, { x: 0.08 + k * 0.03, y: 0.13, z: 0.33 + (k % 2) * 0.03, s: 0.05, flat: true });
  tube(B, [[0.26, 0, 0.38], [0.22, 0.2, 0.34]], 0.008, WOOD, { segs: 4, outline: true });
  MT(B, () => B.shape(TPL.cone4, 0x8a8e96, { x: 0.22, y: 0.2, z: 0.34, sx: 0.016, sy: 0.12, sz: 0.016, rz: Math.PI / 2 + 0.2 }));
  rubble(B, -0.42, 0.06, 0.12, 6, rock, 5);
  return { B, G, height: 0.65, noLean: true };
}

// ---------------------------------------------------------------- relics
// A statue of an old king on his plinth: a figure carved in weathered stone
// (a hero's figure, its paint turned to stone and moss). Ruined: toppled,
// broken at the shins, lying in the grass beside the plinth.
function statue(spec) {
  const ruined = !!spec.ruined;
  const look = spec.figure || { race: 'human', armor: 'plate', hat: 'crown', weapon: 'sword', cape: 0x5a3a2a, beard: 0x3a2a20, face: 'bold' };
  const res = humanoid({ ...look, kind: 'humanoid' }, TPL);
  const B = res.B;
  if (!B.detail) B.detail = new GeoBuilder();
  const stone = spec.color ?? 0xb8b2a6, plinthH = 0.26, s = 0.82;
  // the figure becomes stone: its colours by brightness into greys, moss on
  // the parts that face the sky
  const lo = new THREE.Color(deep(stone, 0.55)), hi = new THREE.Color(tint(stone, 1.12)), moss = new THREE.Color(0x6a8a3a);
  for (const P of [B, B.detail]) {
    const C = P.col, N = P.nor;
    for (let i = 0; i < C.length; i += 3) {
      const l = Math.min(1, Math.pow(0.2126 * C[i] + 0.7152 * C[i + 1] + 0.0722 * C[i + 2], 0.45) * 1.1);
      let r = lo.r + (hi.r - lo.r) * l, g = lo.g + (hi.g - lo.g) * l, b = lo.b + (hi.b - lo.b) * l;
      if (N[i + 1] > 0.8 && (i * 7) % 5 < 2) { r = r * 0.5 + moss.r * 0.5; g = g * 0.5 + moss.g * 0.5; b = b * 0.5 + moss.b * 0.5; }
      C[i] = r; C[i + 1] = g; C[i + 2] = b;
    }
    P.metal = null; P.skin = null;
  }
  res.F = null; res.G = new GeoBuilder();
  // (a toppled king's plinth stands back and to the left, so he falls across
  // the middle of his square)
  const px = ruined ? -0.24 : 0, pz = ruined ? -0.12 : 0;
  place(res, s, px, pz - 0.02, 0);
  // stand it on its plinth
  const lift = mat(0, plinthH, 0);
  transformTris(B, lift);
  transformTris(B.detail, lift);
  const G = res.G;
  if (ruined) {
    // broken at the shins: the rest topples into the grass, turned a little
    // towards the road
    const cut = plinthH + 0.16 * s;
    // (laid on his back: his height runs along x, his face to the sky)
    const onBack = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    const fall = new THREE.Matrix4().makeTranslation(px + 0.1, 0.0, pz + 0.16)
      .multiply(new THREE.Matrix4().makeRotationY(-0.32))
      .multiply(onBack)
      .multiply(new THREE.Matrix4().makeTranslation(-px, -cut, -pz));
    const lists = [B, B.detail].map((P) => {
      const out = [];
      for (let t = 0; t < P.pos.length; t += 9) if ((P.pos[t + 1] + P.pos[t + 4] + P.pos[t + 7]) / 3 > cut) out.push(t);
      transformTris(P, fall, out);
      return out;
    });
    // rest it on the ground
    let minY = Infinity;
    [B, B.detail].forEach((P, k) => { for (const t of lists[k]) for (let i = t + 1; i < t + 9; i += 3) minY = Math.min(minY, P.pos[i]); });
    const drop = mat(0, 0.004 - minY, 0);
    [B, B.detail].forEach((P, k) => transformTris(P, drop, lists[k]));
  }
  // the plinth: stepped, inscribed, cracked and mossy when ruined
  lathe(B, [[0.3, 0], [0.3, 0.05], [0.25, 0.06], [0.22, 0.06], [0.22, plinthH - 0.03], [0.25, plinthH - 0.02], [0.25, plinthH]], [deep(stone, 0.7), stone, tint(stone, 1.06)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true, sq: 0.85, matrix: mat(px, 0, pz) });
  for (let k = 0; k < 4; k++) B.detail.box(deep(stone, 0.55), { x: px + (k - 1.5) * 0.06, y: 0.14 + (k % 2) * 0.012, z: pz + 0.22 * 0.85 + 0.003, sx: 0.04, sy: 0.012, sz: 0.004 });
  if (ruined) {
    B.detail.box(0x3a3632, { x: px - 0.1, y: 0.1, z: pz + 0.188, sx: 0.006, sy: 0.12, sz: 0.004, rz: 0.4 });
    ivy(B, px - 0.18, 0.12, pz + 0.16, 0.06, 1);
    rubble(B, -0.4, 0.3, 0.1, 5, stone, 2);
    rubble(B, 0.42, -0.2, 0.07, 3, stone, 4);
  } else {
    for (const [x, z, c] of [[-0.14, 0.24, 0xf0d040], [0.12, 0.26, 0xe86a8a]]) ball(B, c, x, 0.03, z, 0.025);
  }
  pebbles(B, 5, 0.42, 0x8a8478, 0.8);
  return { B, G, height: ruined ? 0.5 : plinthH + (res.height || 0.95) * s, noLean: true };
}

// The bones of a dragon, long dead: a horned skull, a spine curving away
// through the grass, ribs arching out of the ground, a wing's finger-bones
// raised like the mast of a wreck.
function dragonbones(spec) {
  const { B, G } = builders();
  const bone = spec.color ?? BONE, dark = deep(bone, 0.6);
  yard(B, 0.66, [0x9a9468, 0x8a8458], 0.85);
  // the spine: a curve of knuckled vertebrae, half sunk
  const spine = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    spine.push([-0.42 + t * 0.92, 0.04 + Math.sin(t * Math.PI) * 0.03 - t * 0.02, 0.18 - Math.sin(t * 3.2) * 0.22]);
  }
  tube(B, spine, (t) => 0.035 * (1 - t * 0.6), [dark, bone], { segs: 6, steps: 24 });
  spine.forEach(([x, y, z], k) => { if (k % 2 === 0) ball(B, bone, x, y + 0.02, z, 0.03 * (1 - k / 24), 0.028, 0.03 * (1 - k / 24)); });
  // the ribs, arching up in pairs and shrinking toward the tail
  for (let k = 1; k < 7; k++) {
    const [x, y, z] = spine[k + 1];
    const h = 0.32 - k * 0.035, w = 0.2 - k * 0.018;
    for (const s of [-1, 1]) tube(B, [[x, y, z], [x + 0.02, y + h * 0.7, z + s * w * 0.8], [x + 0.06, y + h * 0.75, z + s * w * 1.05], [x + 0.08, 0.0, z + s * w * 1.1]], [0.022, 0.017, 0.012, 0.009], [bone, tint(bone, 1.05), dark], { segs: 5, outline: true });
  }
  // the skull: long jaws, horns swept back, hollow eyes
  const hx = -0.5, hz = 0.24;
  const hm = mat(hx, 0.05, hz, 0, 0.6, -0.15);
  ball(B, bone, 0, 0.06, 0, 0.1, 0.075, 0.09, { matrix: hm, grad: 0.3 });
  ball(B, bone, -0.13, 0.04, 0.0, 0.11, 0.045, 0.06, { matrix: hm });
  ball(B, dark, -0.12, 0.0, 0.0, 0.1, 0.025, 0.05, { matrix: hm });
  for (const s of [-1, 1]) {
    ball(B.detail, 0x1a1410, -0.02, 0.09, s * 0.055, 0.03, 0.022, 0.016, { matrix: hm });
    const p0 = new THREE.Vector3(0.06, 0.12, s * 0.05).applyMatrix4(hm), p1 = new THREE.Vector3(0.18, 0.22, s * 0.1).applyMatrix4(hm), p2 = new THREE.Vector3(0.28, 0.24, s * 0.14).applyMatrix4(hm);
    tube(B, [[p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], [p2.x, p2.y, p2.z]], [0.026, 0.014, 0.004], [bone, dark], { segs: 5, outline: true });
  }
  for (let k = 0; k < 5; k++) {
    const p = new THREE.Vector3(-0.2 + k * 0.035, 0.0, 0.04).applyMatrix4(hm);
    B.shape(TPL.cone4, 0xf8f0dc, { x: p.x, y: p.y + 0.02, z: p.z, sx: 0.014, sy: 0.04, sz: 0.014 });
  }
  // a wing: the long arm-bone raised, finger-bones splayed, a rag of membrane
  const sh = spine[4], el = [sh[0] + 0.12, 0.36, sh[2] - 0.2], wr = [sh[0] + 0.02, 0.6, sh[2] - 0.32];
  tube(B, [[sh[0], sh[1], sh[2]], el], [0.03, 0.022], [bone, tint(bone, 1.05)], { segs: 6 });
  tube(B, [el, wr], [0.022, 0.016], [bone, tint(bone, 1.05)], { segs: 6 });
  for (const [dx, dy, dz] of [[-0.24, -0.04, -0.06], [-0.14, -0.16, -0.08], [0.0, -0.2, -0.1]]) tube(B, [wr, [wr[0] + dx, wr[1] + dy, wr[2] + dz]], [0.012, 0.004], [bone, dark], { segs: 4, outline: true });
  sheet(B, (u, v) => [wr[0] - 0.24 * u + v * 0.06, wr[1] - 0.04 - u * 0.12 - v * 0.2, wr[2] - 0.06 - v * 0.04], [0x6a4a3a, 0x4a3428], { nu: 2, nv: 2, thick: 0.006, back: 0x3a2820 });
  // grass grown up through it, and a crow on the skull
  for (const [x, z] of [[-0.1, 0.36], [0.22, -0.02], [0.4, 0.3]]) ball(B, 0x7a9a44, x, 0.02, z, 0.06, 0.03, 0.05);
  crow(B, hx + 0.02, 0.15, hz - 0.02, 1.4);
  pebbles(B, 4, 0.62, 0x8a8478, 2.4);
  return { B, G, height: 0.65, noLean: true };
}

// A wreck on the strand: a ship's hull heeled over in the sand, her bow
// broken away to its bare ribs, the mast snapped and a rag of sail, barrels
// and a chest washed up beside her.
function wreck(spec) {
  const { B, G } = builders();
  const hull = spec.color ?? 0x6a4a2e, sail = 0xd8ccb0, inside = 0x8a6a42;
  // she lies heeled over on her side, half sunk in the sand, bow to the right
  const m = mat(-0.02, 0.06, -0.04, 0, -1.25, 0.62);
  const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(m); return [v.x, v.y, v.z]; };
  const L = 0.5, Wd = 0.2, Dp = 0.2;
  const width = (u) => Wd * Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.5) * (u > 0.5 ? 1 : 0.75 + 0.25 * Math.sin(u * Math.PI));
  const depth = (u) => Dp * (0.7 + 0.3 * Math.sin(u * Math.PI));
  const hullAt = (u, v) => { const ph = v * Math.PI; return P(Math.cos(ph) * width(u), -Math.sin(ph) * depth(u), (u - 0.5) * 2 * L); };
  // the planked part (stern to midships); the bow is broken away to its ribs
  const U = 0.62;
  sheet(B, (u, v) => hullAt(u * U, v), [tint(hull, 1.12), hull, deep(hull, 0.75)], { nu: 5, nv: 5, thick: 0.02, back: inside });
  for (const v of [0.18, 0.36, 0.64, 0.82]) {
    const pts = [];
    for (let k = 0; k <= 5; k++) pts.push(hullAt((k / 5) * U, v));
    tube(B.detail, pts, 0.005, deep(hull, 0.55), { segs: 3, cap: false });
  }
  // the gunwale along both sides, the ribs of the broken bow, the keel
  for (const v of [0, 1]) { const pts = []; for (let k = 0; k <= 8; k++) pts.push(hullAt((k / 8) * 0.96 + 0.02, v)); tube(B, pts, 0.016, deep(hull, 0.85), { segs: 5 }); }
  for (let k = 0; k < 4; k++) {
    const u = U + 0.04 + k * 0.08, pts = [];
    for (let j = 0; j <= 6; j++) pts.push(hullAt(u, j / 6));
    tube(B, pts, 0.014, [deep(hull, 0.8), tint(hull, 1.05)], { segs: 5, outline: true });
  }
  { const pts = []; for (let k = 0; k <= 8; k++) pts.push(hullAt(k / 8 * 0.98, 0.5)); tube(B, pts, 0.02, deep(hull, 0.7), { segs: 5 }); }
  // the stump of her mast, and the rest of it lying across the sand with a
  // rag of sail
  const mb = P(0, -0.02, -0.05), mt = P(0, 0.3, -0.05);
  tube(B, [mb, mt], 0.028, [0x5a3a20, 0x6a4a2a], { segs: 6 });
  tube(B, [[0.18, 0.025, 0.42], [0.56, 0.03, 0.16]], 0.026, 0x5a3a20, { segs: 6 });
  sheet(B, (u, v) => [0.22 + u * 0.28, 0.032 + Math.sin(u * 6) * 0.012 + v * 0.008, 0.4 - u * 0.2 + v * 0.16 + Math.sin(v * 3) * 0.02], [sail, deep(sail, 0.8)], { nu: 3, nv: 2, thick: 0.006, back: deep(sail, 0.6) });
  // barrels, a chest washed up, weed and shells
  for (const [x, z, ry, lie] of [[-0.44, 0.28, 0.3, false], [-0.3, 0.42, 1.2, true]]) {
    const bm = lie ? mat(x, 0.055, z, Math.PI / 2, ry, 0) : mat(x, 0, z, 0, ry, 0);
    lathe(B, [[0.05, lie ? -0.07 : 0], [0.06, lie ? 0 : 0.07], [0.05, lie ? 0.07 : 0.14]], [0x8a5a30, 0xa87040], { segs: 9, matrix: bm });
    for (const y of lie ? [-0.04, 0.04] : [0.03, 0.11]) lathe(B.detail, [[0.058, y - 0.006], [0.061, y], [0.058, y + 0.006]], IRON, { segs: 9, matrix: bm });
  }
  B.box(0x6a4a2a, { x: 0.02, y: 0, z: 0.42, sx: 0.14, sy: 0.08, sz: 0.1, ry: -0.3 });
  MT(B, () => B.box(GOLD, { x: 0.02, y: 0.03, z: 0.42, sx: 0.15, sy: 0.015, sz: 0.11, ry: -0.3 }));
  G.shape(TPL.ico0, 0xffe080, { x: 0.02, y: 0.1, z: 0.44, s: 0.03 });
  for (const [x, z] of [[0.3, 0.44], [-0.52, 0.04], [0.46, -0.24]]) ball(B, 0x4a6a3a, x, 0.01, z, 0.06, 0.012, 0.03, { ry: x * 4 });
  for (const [x, z] of [[-0.12, 0.5], [0.16, 0.54]]) ball(B, 0xf4e0d0, x, 0.01, z, 0.016, 0.01, 0.016);
  crow(B, mt[0], mt[1] + 0.01, mt[2], 0.8);
  return { B, G, height: 0.6, noLean: true };
}

// ---------------------------------------------------------------- watchtower
// A watchtower of grey stone, square and battlemented, a beacon burning in
// its iron basket on top, a banner, a stout door up a few steps. Ruined:
// broken off two-thirds up, a breach in its side, rubble about its foot.
function watchtower(spec) {
  const { B, G } = builders();
  const ruined = !!spec.ruined;
  const st = spec.color ?? 0xb0aa9c, flag = spec.flag ?? 0xb02a2a;
  const top = ruined ? 0.68 : 1.0, w0 = 0.22, w1 = 0.19;
  const sq = (h) => w0 + (w1 - w0) * (h / 1.0);
  lathe(B, [[w0 + 0.04, 0, w0 + 0.04], [w0 + 0.04, 0.05, w0 + 0.04], [w0, 0.06, w0], [sq(top), top, sq(top)]].map(([a, y, b]) => [a * 1.414, y, b * 1.414]), [deep(st, 0.7), st, tint(st, ruined ? 0.85 : 1.06)], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true });
  // stone courses and quoins
  for (let k = 1; k < (ruined ? 5 : 8); k++) {
    const y = k * 0.12, r = sq(y) + 0.003;
    for (const s of [-1, 1]) B.detail.box(deep(st, 0.72), { x: s * (r - 0.02), y, z: r, sx: 0.05, sy: 0.04, sz: 0.004 });
    B.detail.box(deep(st, 0.78), { y: y + 0.05, z: r, sx: r * 1.6, sy: 0.005, sz: 0.004 });
  }
  // the door up its steps, arrow slits
  const zf = (y) => sq(y) + 0.004;
  B.box(0x4a3020, { y: 0.14, z: zf(0.2), sx: 0.1, sy: 0.17, sz: 0.012 });
  ball(B, 0x4a3020, 0, 0.31, zf(0.3), 0.05, 0.045, 0.006);
  for (let k = 0; k < 3; k++) B.box(deep(st, 0.9 - k * 0.04), { y: 0, z: zf(0) + 0.05 + k * 0.05, sx: 0.16, sy: 0.14 - k * 0.045, sz: 0.06 });
  for (const [x, y] of [[0, 0.55], [0.08, 0.78], [-0.1, 0.42]]) if (y < top - 0.08) B.box(0x1a1614, { x, y, z: zf(y) - 0.002, sx: 0.022, sy: 0.08, sz: 0.008 });
  if (!ruined) {
    // the parapet, jutting on corbels, and its merlons
    const pw = w1 + 0.04;
    lathe(B, [[w1, top - 0.06, w1], [pw, top - 0.02, pw], [pw, top + 0.08, pw]].map(([a, y, b]) => [a * 1.414, y, b * 1.414]), [deep(st, 0.8), st], { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true });
    lathe(B, [[pw - 0.03, top + 0.08], [pw - 0.03, top + 0.03]].map(([a, y]) => [a * 1.414, y, a * 1.414]), deep(st, 0.6), { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true });
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      B.box(tint(st, 1.05), { x: s * (pw - 0.025), y: top + 0.08, z: k * (pw - 0.07), sx: 0.05, sy: 0.08, sz: 0.07 });
      B.box(tint(st, 1.05), { x: k * (pw - 0.07), y: top + 0.08, z: s * (pw - 0.025), sx: 0.07, sy: 0.08, sz: 0.05 });
    }
    // the beacon: an iron basket on a post, burning
    tube(B, [[0, top + 0.03, 0], [0, top + 0.22, 0]], 0.014, IRON, { segs: 4 });
    lathe(B, [[0.02, top + 0.2], [0.08, top + 0.24], [0.1, top + 0.3]], IRON, { segs: 8 });
    G.shape(TPL.cone5, 0xff7a20, { y: top + 0.26, sx: 0.16, sy: 0.24, sz: 0.16 });
    G.shape(TPL.cone5, 0xffd060, { y: top + 0.27, sx: 0.08, sy: 0.16, sz: 0.08, ry: 0.5 });
    // the banner on a pole at the corner
    tube(B, [[-pw + 0.03, top + 0.08, -pw + 0.03], [-pw + 0.03, top + 0.42, -pw + 0.03]], 0.008, 0x3a2a1a, { segs: 3, outline: true });
    sheet(B, (u, v) => [-pw + 0.04 + u * 0.16, top + 0.4 - v * 0.11, -pw + 0.03 + Math.sin(u * 3) * 0.015], [flag, deep(flag, 0.7)], { nu: 3, nv: 2, thick: 0.008 });
    // a lit window under the parapet
    G.box(0xffc060, { x: -0.06, y: top - 0.2, z: zf(top - 0.2) - 0.002, sx: 0.035, sy: 0.07, sz: 0.008 });
  } else {
    // jagged broken top, a breach and its rubble, ivy
    const rr = sq(top);
    for (const [x, z, h] of [[-rr + 0.04, rr - 0.04, 0.16], [rr - 0.06, rr - 0.03, 0.06], [-rr + 0.03, -rr + 0.05, 0.22], [rr - 0.04, -rr + 0.04, 0.1], [0, -rr + 0.03, 0.12], [-rr + 0.03, 0, 0.12]]) B.box(tint(st, 0.86), { x, y: top - 0.01, z, sx: 0.09, sy: h, sz: 0.09, grad: -0.3 });
    lathe(B, [[(rr - 0.04) * 1.414, top], [(rr - 0.04) * 1.414, top - 0.1]].map(([a, y]) => [a, y, a]), 0x2a2622, { segs: 4, rot: Math.PI / 4, keepSegs: true, flat: true });
    B.box(0x221e1c, { x: rr + 0.004, y: 0.42, z: 0.02, sx: 0.01, sy: 0.18, sz: 0.12 });
    rubble(B, 0.36, 0.08, 0.14, 8, st, 1);
    rubble(B, -0.3, 0.3, 0.08, 4, st, 6);
    ivy(B, -0.1, 0.3, zf(0.3) + 0.01, 0.08, 1);
    ivy(B, rr + 0.01, 0.55, -0.08, 0.06, 4);
    crow(B, -rr + 0.04, top + 0.15, rr - 0.04, 0.5);
  }
  pebbles(B, 5, 0.42, 0x8a8478, 1.6);
  return { B, G, height: ruined ? top + 0.15 : top + 0.42, noLean: true };
}

export const LANDMARK_BUILDERS = { windmill, millsails, watermill, millwheel, apiary, orchard, sheepfold, burntfarm, stonecircle, chapel, graveyard, gibbet, woodcamp, quarry, statue, dragonbones, wreck, watchtower };

// How much larger the world map draws them (a square there is a league)
export const LANDMARK_WORLD_SCALE = {
  windmill: 1.5, watermill: 1.45, apiary: 1.35, orchard: 1.4, sheepfold: 1.4, burntfarm: 1.4, stonecircle: 1.35, chapel: 1.35,
  graveyard: 1.35, gibbet: 1.4, woodcamp: 1.35, quarry: 1.45, statue: 1.45, dragonbones: 1.45, wreck: 1.45, watchtower: 1.4,
};

// The parts that turn: a model of their own set on the landmark at `at`
// (in the landmark's own units), spun about `axis` at `speed` (radians a
// second). null for a ruin, whose sails turn no more.
export const SPINNERS = {
  windmill: (spec) => (spec.ruined ? null : { look: { kind: 'millsails', color: spec.sails }, at: MILL_HUB, axis: 'z', speed: 0.45 }),
  watermill: () => ({ look: { kind: 'millwheel' }, at: WHEEL, axis: 'z', speed: 0.7 }),
};
