// The beasts of the isles, sculpted like the rest of the bestiary (see
// beasts.js): a giant frog, a spotted jungle cat, a reef shark lunging out of
// the water, a naga coiled on its serpent tail with a spear, and a temple's
// stone guardian with jade burning in its eyes. Models face +z, feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL } from './builder.js';
import { tube, lathe, sheet, ball, tint, blend, deep } from './sculpt.js';

const BONE = 0xf0e6cc, GOLD = 0xe2b24a;

function builders() {
  const B = new GeoBuilder(), G = new GeoBuilder();
  B.detail = new GeoBuilder();
  return { B, G };
}
function metal(B, fn) {
  const a = B.count, d = B.detail.count;
  fn();
  (B.metal ||= []).push([a, B.count]);
  (B.detail.metal ||= []).push([d, B.detail.count]);
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// a bright animal eye with a pupil (round, or a slit) and a catch-light
function eye(B, p, r, iris = 0xf0c030, slit = false, look = [0, 0, 1]) {
  ball(B, 0x1a1210, p[0], p[1], p[2], r * 1.12, r * 1.05, r * 0.85);
  const f = [p[0] + look[0] * r * 0.3, p[1] + look[1] * r * 0.3, p[2] + look[2] * r * 0.3];
  ball(B, iris, f[0], f[1], f[2], r * 0.92, r * 0.9, r * 0.7);
  const q = [p[0] + look[0] * r * 0.62, p[1] + look[1] * r * 0.62, p[2] + look[2] * r * 0.62];
  ball(B, 0x0e0a08, q[0], q[1], q[2], slit ? r * 0.16 : r * 0.42, slit ? r * 0.7 : r * 0.42, r * 0.3);
  ball(B, 0xffffff, q[0] - r * 0.25, q[1] + r * 0.3, q[2] + r * 0.12, r * 0.22, r * 0.22, r * 0.14);
}

// ---------------------------------------------------------------- frog
// Squat on folded legs, a wide flat head with a long smile, great golden
// eyes on top, a pale throat and a speckled, warty back.
export function frog(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x5aa83a;
  const belly = spec.belly ?? 0xe8d870;
  const spots = spec.spots ?? deep(c, 0.45);
  const hi = tint(blend(c, 0xf8f0a0, 0.25), 1.15), lo = deep(c, 0.6);
  // body: a plump teardrop, high at the shoulders and sloping to the rump
  tube(B, [[0, 0.15, -0.2], [0, 0.2, -0.06], [0, 0.23, 0.08], [0, 0.22, 0.17]], [0.13, 0.2, 0.2, 0.15], [lo, c, hi], { segs: 14, steps: 12, up: [0, 1, 0], sq: 0.72 });
  ball(B, belly, 0, 0.13, 0.08, 0.17, 0.09, 0.17);
  // the head: broad and flat, its lips meeting in a long dark smile
  const h = [0, 0.25, 0.2];
  ball(B, c, h[0], h[1], h[2], 0.19, 0.1, 0.14);
  ball(B, hi, h[0], h[1] + 0.03, h[2] + 0.02, 0.14, 0.06, 0.11);
  ball(B, blend(belly, c, 0.2), h[0], h[1] - 0.06, h[2] + 0.02, 0.17, 0.06, 0.12);
  const lip = [];
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + (k / 8) * Math.PI; lip.push([Math.sin(a) * 0.18, h[1] - 0.025 + Math.abs(Math.sin(a)) * 0.01, h[2] + Math.cos(a) * 0.13 + 0.005]); }
  tube(B, lip, 0.008, 0x2a1a14, { segs: 4, steps: 16, outline: true });
  // a pink tongue-tip just showing
  ball(B, 0xe87a8a, 0, h[1] - 0.03, h[2] + 0.13, 0.03, 0.012, 0.02);
  for (const s of [-1, 1]) ball(B, 0x1a140e, s * 0.03, h[1] + 0.03, h[2] + 0.13, 0.008);
  // throat sac
  ball(B, tint(belly, 1.05), 0, h[1] - 0.09, h[2] + 0.01, 0.09, 0.05, 0.08);
  // eyes like lamps
  for (const s of [-1, 1]) {
    ball(B, c, s * 0.1, h[1] + 0.07, h[2] - 0.01, 0.06, 0.055, 0.06);
    eye(B, [s * 0.105, h[1] + 0.095, h[2] + 0.01], 0.045, spec.eyes ?? 0xe0a828, false, [s * 0.3, 0.2, 0.93]);
  }
  // spots and warts across the back
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.4, d = 0.06 + (k % 3) * 0.04;
    const z = -0.04 + Math.cos(a) * d * 1.3, x = Math.sin(a) * d * 1.1;
    ball(B, k % 3 ? spots : deep(spots, 0.8), x, 0.3 - Math.abs(x) * 0.35 - Math.max(0, -z) * 0.25, z, 0.035 + (k % 2) * 0.012, 0.012, 0.03);
  }
  // hind legs folded at the sides, long webbed feet splayed out
  for (const s of [-1, 1]) {
    ball(B, c, s * 0.17, 0.12, -0.1, 0.1, 0.09, 0.14);
    tube(B, [[s * 0.2, 0.08, -0.04], [s * 0.24, 0.05, 0.08], [s * 0.22, 0.03, 0.0]], [0.05, 0.04, 0.03], [c, lo], { segs: 8 });
    const f = [s * 0.24, 0.015, 0.02];
    for (let t = -1; t <= 1; t++) {
      const tip = add(f, [s * (0.05 + t * 0.015), 0, 0.09 + t * 0.03]);
      tube(B, [f, tip], [0.015, 0.009], lo, { segs: 4 });
      ball(B, belly, ...tip, 0.014);
    }
    sheet(B, (u, v) => lerp3(lerp3(f, add(f, [s * 0.035, 0.002, 0.06]), u), lerp3(f, add(f, [s * 0.065, 0.002, 0.12]), u), v), deep(c, 0.7), { nu: 1, nv: 1, thick: 0.004 });
    // front legs: short, under the chest, fingers spread
    const sh = [s * 0.11, 0.14, 0.15], hand = [s * 0.14, 0.015, 0.22];
    tube(B, [sh, [s * 0.14, 0.07, 0.2], hand], [0.035, 0.025, 0.02], [c, lo], { segs: 7 });
    for (let t = -1; t <= 1; t++) {
      const tip = add(hand, [s * t * 0.02 + s * 0.01, 0, 0.04]);
      tube(B, [hand, tip], [0.01, 0.007], lo, { segs: 4 });
      ball(B, belly, ...tip, 0.012);
    }
  }
  void G;
  return { B, G, height: 0.42 };
}

// ---------------------------------------------------------------- jungle cat
// A spotted cat on the prowl: long and low, shoulders up, head forward and
// turned to the viewer, the long tail curling up at the tip.
export function cat(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0xd89a3a;
  const dark = spec.spots ?? 0x3a2414;
  const pale = spec.belly ?? blend(c, 0xfff4e0, 0.6);
  const hi = tint(blend(c, 0xfff0c8, 0.2), 1.1), lo = deep(c, 0.65);
  const by = 0.27, zf = 0.24, zb = -0.26;
  tube(B, [[0, by - 0.02, zb], [0, by - 0.04, zb * 0.3], [0, by - 0.03, zf * 0.4], [0, by + 0.01, zf]], [0.085, 0.08, 0.085, 0.09], [lo, c, hi], { sq: 1.08, up: [0, 1, 0], segs: 12, steps: 12 });
  ball(B, pale, 0, by - 0.08, 0.02, 0.07, 0.04, 0.2);
  // legs: shoulders and haunches rolling under the skin, big soft paws
  for (const s of [-1, 1]) {
    ball(B, c, s * 0.07, by - 0.0, zf - 0.03, 0.07, 0.09, 0.08);
    tube(B, [[s * 0.08, by - 0.04, zf - 0.03], [s * 0.09, by * 0.45, zf + 0.0], [s * 0.095, 0.03, zf + 0.03]], [0.042, 0.032, 0.028], [c, deep(c, 0.85)], { segs: 8 });
    ball(B, pale, s * 0.095, 0.022, zf + 0.05, 0.034, 0.024, 0.042);
    ball(B, c, s * 0.07, by - 0.01, zb + 0.06, 0.08, 0.1, 0.1);
    tube(B, [[s * 0.075, by - 0.05, zb + 0.06], [s * 0.085, by * 0.55, zb + 0.13], [s * 0.085, by * 0.22, zb + 0.02], [s * 0.09, 0.03, zb + 0.05]], [0.05, 0.034, 0.026, 0.026], [c, deep(c, 0.85)], { segs: 8 });
    ball(B, pale, s * 0.09, 0.022, zb + 0.08, 0.034, 0.024, 0.04);
  }
  // rosettes: dark rings of spots over the flanks and back
  const rosette = (p, r) => {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      ball(B, dark, p[0] + Math.cos(a) * r * 0.2, p[1] + Math.sin(a) * r * 0.18, p[2] + Math.sin(a) * r * 0.1, r * 0.12, r * 0.1, r * 0.12);
    }
  };
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const z = zb + 0.06 + i * 0.08;
    rosette([s * 0.08, by + 0.01 - (i % 2) * 0.03, z], 0.18);
  }
  for (let i = 0; i < 4; i++) ball(B, dark, 0, by + 0.075, zb + 0.1 + i * 0.1, 0.022, 0.012, 0.03);
  // neck and head
  const hc = [0, by + 0.12, zf + 0.1];
  tube(B, [[0, by + 0.01, zf - 0.04], [0, by + 0.07, zf + 0.05], hc], [0.08, 0.07, 0.06], [c, hi], { segs: 10, up: [0, 1, 0] });
  ball(B, c, hc[0], hc[1], hc[2], 0.085, 0.078, 0.08);
  ball(B, hi, hc[0], hc[1] + 0.03, hc[2] + 0.01, 0.065, 0.045, 0.06);
  // muzzle: white whisker pads, a pink nose, the chin
  const mz = add(hc, [0, -0.03, 0.07]);
  for (const s of [-1, 1]) ball(B, pale, mz[0] + s * 0.022, mz[1], mz[2], 0.03, 0.026, 0.028);
  ball(B, pale, mz[0], mz[1] - 0.025, mz[2] - 0.01, 0.028, 0.02, 0.025);
  ball(B, 0xc87a7a, mz[0], mz[1] + 0.018, mz[2] + 0.024, 0.014, 0.01, 0.01);
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) tube(B, [add(mz, [s * 0.03, 0.002 - k * 0.008, 0.015]), add(mz, [s * 0.1, 0.01 - k * 0.02, 0.02])], [0.003, 0.001], 0xf0ece0, { segs: 3 });
  // eyes: amber, slit-pupilled, with dark tear-lines
  for (const s of [-1, 1]) {
    eye(B, add(hc, [s * 0.035, 0.02, 0.066]), 0.018, spec.eyes ?? 0xe8b830, true, [s * 0.15, 0.1, 0.98]);
    tube(B, [add(hc, [s * 0.04, 0.0, 0.07]), add(hc, [s * 0.035, -0.035, 0.078])], [0.005, 0.003], dark, { segs: 3 });
  }
  // ears: small and round, dark-backed
  for (const s of [-1, 1]) {
    const e0 = add(hc, [s * 0.05, 0.06, -0.02]);
    tube(B, [e0, add(e0, [s * 0.015, 0.035, 0]), add(e0, [s * 0.02, 0.055, -0.005])], [0.03, 0.026, 0.004], [c, dark], { sq: 0.4, segs: 7, up: [0, 0, 1] });
    ball(B, 0xf0d8c8, e0[0] + s * 0.004, e0[1] + 0.025, e0[2] + 0.008, 0.012, 0.016, 0.004);
  }
  // spots across the brow
  for (let k = 0; k < 4; k++) ball(B, dark, (k - 1.5) * 0.02, hc[1] + 0.06, hc[2] + 0.025, 0.008, 0.008, 0.006);
  // the tail: low from the rump, sweeping out and up to a dark-ringed tip
  const tp = [[0, by - 0.02, zb - 0.02], [0.05, by - 0.08, zb - 0.14], [0.14, by - 0.1, zb - 0.22], [0.24, by - 0.02, zb - 0.22], [0.28, by + 0.08, zb - 0.16]];
  tube(B, tp, [0.034, 0.03, 0.026, 0.024, 0.02], (t) => (t > 0.55 && Math.floor(t * 12) % 2 ? dark : c), { segs: 7, steps: 18 });
  void G;
  return { B, G, height: 0.5 };
}

// ---------------------------------------------------------------- reef shark
// Bursting from a ring of foam: a grey back and fin arching out of the sea,
// the head thrown up with its jaws wide, the tail flukes behind.
export function shark(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x6a7e8e;
  const belly = spec.belly ?? 0xeef0ea;
  const hi = tint(blend(c, 0xd8e8f0, 0.2), 1.15), lo = deep(c, 0.6);
  const sea = spec.water ?? 0x3cb0c0, foam = 0xeaf8f8;
  lathe(B, [[0.002, 0.024], [0.48, 0.016], [0.62, 0.008], [0.68, 0.0]], [deep(sea, 0.85), sea, tint(sea, 1.15)], { segs: 26, sq: 0.8 });
  for (const [r0, w] of [[0.3, 0.025], [0.5, 0.02]]) lathe(B, [[r0, 0.016], [r0 + w, 0.028], [r0 + w * 2, 0.014]], [tint(sea, 1.35), blend(sea, foam, 0.6)], { segs: 26, sq: 0.8 });
  // the body rises out of the water at the back and arches up to the head
  const spine = [[0, -0.05, -0.42], [0, 0.12, -0.26], [0, 0.28, -0.04], [0, 0.42, 0.14], [0, 0.52, 0.24]];
  tube(B, spine, [0.07, 0.12, 0.15, 0.13, 0.1], [lo, c, hi], { segs: 12, steps: 18, up: [1, 0, 0], sq: 1.15 });
  // the pale belly along the front of the arch
  tube(B, spine.slice(1).map((p) => [p[0], p[1] - 0.04, p[2] + 0.07]), [0.09, 0.11, 0.1, 0.07], belly, { segs: 10, steps: 14, up: [1, 0, 0], sq: 1.1 });
  // ring of foam where it breaks the surface
  lathe(B, [[0.13, 0.01, 0.13, -0.36], [0.2, 0.04, 0.2, -0.36], [0.27, 0.01, 0.26, -0.36]], [foam, tint(foam, 1.02)], { segs: 16 });
  // dorsal fin
  const df = [0, 0.37, -0.1];
  sheet(B, (u, v) => [0, df[1] + v * (0.2 - u * 0.04) + u * 0.0, df[2] - u * 0.16 - v * v * 0.14 + v * u * 0.06], [hi, deep(c, 0.8)], { nu: 3, nv: 4, thick: 0.02 });
  // pectoral fins, swept back
  for (const s of [-1, 1]) {
    sheet(B, (u, v) => [s * (0.1 + u * 0.18), 0.32 - u * 0.1 + v * 0.02, 0.1 - u * 0.12 - v * 0.08], [c, deep(c, 0.75)], { nu: 3, nv: 2, thick: 0.014, flipN: s < 0 });
    // gill slits
    for (let k = 0; k < 3; k++) tube(B, [[s * 0.115, 0.38 + k * 0.012, 0.16 - k * 0.03], [s * 0.12, 0.44 + k * 0.012, 0.15 - k * 0.03]], 0.006, deep(c, 0.4), { segs: 3 });
  }
  // the head: snout up, jaws gaping, rows of teeth, a little black eye
  const h = [0, 0.56, 0.27];
  tube(B, [add(h, [0, -0.04, -0.04]), add(h, [0, 0.03, 0.08]), add(h, [0, 0.07, 0.16])], [0.1, 0.075, 0.03], [c, hi], { segs: 10, up: [1, 0, 0], sq: 1.3 });
  tube(B, [add(h, [0, -0.1, -0.02]), add(h, [0, -0.14, 0.08]), add(h, [0, -0.16, 0.13])], [0.085, 0.06, 0.025], [belly, tint(belly, 0.95)], { segs: 9, up: [1, 0, 0], sq: 1.25 });
  ball(B, 0x6a1a20, h[0], h[1] - 0.05, h[2] + 0.05, 0.065, 0.05, 0.06);
  for (let k = 0; k < 6; k++) {
    const a = -1.2 + (k / 5) * 2.4;
    const ux = Math.sin(a) * 0.06, uz = Math.cos(a) * 0.05;
    tube(B, [add(h, [ux, -0.008, 0.06 + uz]), add(h, [ux * 0.95, -0.04, 0.065 + uz])], [0.01, 0.001], BONE, { segs: 4, outline: true });
    tube(B, [add(h, [ux * 0.9, -0.1, 0.06 + uz * 0.9]), add(h, [ux * 0.9, -0.07, 0.065 + uz * 0.9])], [0.009, 0.001], BONE, { segs: 4, outline: true });
  }
  for (const s of [-1, 1]) {
    ball(B, 0x0a0a0c, h[0] + s * 0.07, h[1] + 0.02, h[2] + 0.04, 0.018, 0.018, 0.012);
    ball(B, 0xffffff, h[0] + s * 0.074, h[1] + 0.028, h[2] + 0.05, 0.005);
  }
  // the tail flukes flicking up from the water behind
  const t0 = [0, 0.02, -0.5];
  sheet(B, (u, v) => [0, t0[1] + (v - 0.4) * 0.34 * (1 - u * 0.4) + u * 0.04, t0[2] - u * 0.14 - Math.abs(v - 0.5) * 0.14], [c, deep(c, 0.7)], { nu: 2, nv: 4, thick: 0.016 });
  lathe(B, [[0.07, 0.008, 0.07, -0.5], [0.11, 0.026, 0.11, -0.5], [0.15, 0.008, 0.15, -0.5]], foam, { segs: 12 });
  void G;
  return { B, G, height: 0.75, ao: 0.22 };
}

// ---------------------------------------------------------------- naga
// Coils of a great serpent heaped on the ground, rising into the body of a
// warrior: a scaled torso in a collar of gold, a cobra's hood behind the
// head, burning eyes, a spear planted in one hand and the other clawed.
export function naga(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x2a8a7a;
  const belly = spec.belly ?? 0xe8d890;
  const sk = spec.skin ?? blend(c, 0x9ad8c0, 0.35);
  const hi = tint(blend(c, 0xd0f0c0, 0.25), 1.15), lo = deep(c, 0.6);
  const gold = spec.crown ?? GOLD;
  // coils: a spiral from the tail tip round the back to the rising front
  const pts = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const a = Math.PI * 0.35 + t * Math.PI * 2.1;
    const R = 0.36 - t * 0.2;
    pts.push([Math.cos(a) * R, 0.06 + t * 0.05, -0.05 + Math.sin(a) * R * 0.85]);
  }
  // then up into the waist
  pts.push([0.03, 0.2, 0.06], [0.0, 0.36, 0.06], [0, 0.5, 0.03]);
  const n = pts.length;
  tube(B, pts, (t) => 0.018 + 0.11 * Math.min(1, t * 1.25), (t) => (Math.floor(t * 40) % 2 ? c : deep(c, 0.85)), { segs: 11, steps: 54 });
  // the pale ribbed belly up the front of the rising body
  tube(B, pts.slice(n - 4).map((p) => [p[0], p[1], p[2] + 0.07]), [0.07, 0.085, 0.085, 0.07], belly, { segs: 9, steps: 12 });
  for (let k = 0; k < 4; k++) tube(B, [[-0.07, 0.2 + k * 0.08, 0.15 - k * 0.005], [0.07, 0.2 + k * 0.08, 0.15 - k * 0.005]], 0.006, deep(belly, 0.75), { segs: 4 });
  // scale bands down the back of the coils
  for (let k = 2; k < 14; k += 2) ball(B, hi, pts[k][0], pts[k][1] + 0.06 + (k / 14) * 0.04, pts[k][2], 0.03, 0.012, 0.03);
  // the torso
  const wy = 0.52, sy = 0.86;
  lathe(B, [[0.11, wy - 0.04, 0.09], [0.12, wy + 0.06, 0.1], [0.15, wy + 0.2, 0.11, 0.01], [0.18, sy - 0.04, 0.11, 0.01], [0.13, sy + 0.02, 0.08], [0.05, sy + 0.05, 0.05]], [lo, sk, tint(sk, 1.08)], { segs: 16 });
  ball(B, blend(belly, sk, 0.4), 0, wy + 0.18, 0.06, 0.1, 0.13, 0.06);
  // a gold collar and a belt of plates
  metal(B, () => lathe(B, [[0.16, sy - 0.04, 0.12], [0.2, sy, 0.15], [0.1, sy + 0.04, 0.09]], [deep(gold, 0.8), gold], { segs: 16 }));
  for (let k = -2; k <= 2; k++) metal(B, () => ball(B, k % 2 ? 0x40c0a0 : gold, k * 0.05, sy - 0.03 - Math.abs(k) * 0.008, 0.13 - Math.abs(k) * 0.02, 0.022, 0.03, 0.012));
  metal(B, () => lathe(B, [[0.125, wy + 0.0, 0.105], [0.13, wy + 0.04, 0.11], [0.125, wy + 0.08, 0.105]], [deep(gold, 0.7), gold], { segs: 16 }));
  // arms: the right holds the spear upright, the left claws at the air
  const shR = [0.19, sy - 0.04, 0.0], shL = [-0.19, sy - 0.04, 0.0];
  const RH = [0.25, wy + 0.08, 0.1], LH = [-0.26, sy + 0.04, 0.16];
  for (const [sh, E, H] of [[shR, [0.25, sy - 0.18, 0.02], RH], [shL, [-0.3, sy - 0.12, 0.08], LH]]) {
    ball(B, sk, ...sh, 0.07, 0.065, 0.065);
    tube(B, [sh, E, H], [0.058, 0.05, 0.042], [sk, deep(sk, 0.85)], { segs: 9 });
    metal(B, () => tube(B, [lerp3(E, H, 0.4), lerp3(E, H, 0.75)], [0.047, 0.05], [deep(gold, 0.8), gold], { segs: 9 }));
  }
  ball(B, sk, ...RH, 0.045, 0.05, 0.048);
  ball(B, sk, ...LH, 0.04, 0.035, 0.04);
  for (let k = -1; k <= 1; k++) tube(B, [add(LH, [k * 0.02, 0.01, 0.02]), add(LH, [k * 0.03, 0.06, 0.05])], [0.012, 0.003], BONE, { segs: 4, outline: true });
  // the spear
  const base = [RH[0] + 0.01, 0.02, RH[2] + 0.02], tip = [RH[0] - 0.01, 1.42, RH[2] - 0.02];
  tube(B, [base, tip], [0.018, 0.02], [0x5a3a22, 0x7a5432], { segs: 7 });
  metal(B, () => tube(B, [tip, add(tip, [0, 0.07, 0]), add(tip, [0, 0.17, 0]), add(tip, [0, 0.23, 0])], [0.03, 0.045, 0.024, 0.001], [gold, tint(gold, 1.15)], { sq: 0.25, segs: 4, flat: true, cap: false, up: [1, 0, 0] }));
  for (const s of [-1, 1]) tube(B, [add(tip, [0, -0.02, 0]), add(tip, [s * 0.04, -0.09, 0.0])], [0.008, 0.002], 0xc03a2a, { segs: 3 });
  // the head, the hood behind it, and a gold circlet
  const h = [0, sy + 0.16, 0.04];
  tube(B, [[0, sy, 0.0], [0, h[1] - 0.06, h[2]]], 0.055, [sk, sk], { segs: 9 });
  sheet(B, (u, v) => {
    const a = (u - 0.5) * 2.6;
    const R = 0.1 + Math.sin(v * Math.PI * 0.8) * 0.14;
    return [Math.sin(a) * R, h[1] - 0.12 + v * 0.26, h[2] - 0.06 - Math.cos(a) * R * 0.45 + v * 0.02];
  }, [c, hi, deep(c, 0.7)], { nu: 8, nv: 4, thick: 0.018, back: blend(belly, c, 0.3), backShade: 1 });
  // the eye-markings on the inside of the hood
  for (const s of [-1, 1]) ball(B, belly, s * 0.12, h[1] + 0.02, h[2] - 0.06, 0.03, 0.04, 0.008);
  ball(B, sk, h[0], h[1], h[2], 0.085, 0.09, 0.085);
  tube(B, [add(h, [0, -0.02, 0.03]), add(h, [0, -0.05, 0.11])], [0.06, 0.035], [sk, tint(sk, 1.05)], { segs: 9, sq: 0.8, up: [0, 1, 0] });
  ball(B, deep(sk, 0.6), h[0], h[1] - 0.065, h[2] + 0.1, 0.03, 0.006, 0.012);
  tube(B, [add(h, [0, -0.07, 0.11]), add(h, [0, -0.09, 0.15]), add(h, [0.008, -0.1, 0.17])], [0.004, 0.003, 0.001], 0xd0303a, { segs: 3 });
  for (const s of [-1, 1]) {
    ball(B, 0x140c08, h[0] + s * 0.04, h[1] + 0.015, h[2] + 0.07, 0.022, 0.016, 0.012);
    G.shape(TPL.sphere, spec.eyes ?? 0xffc830, { x: h[0] + s * 0.042, y: h[1] + 0.016, z: h[2] + 0.08, sx: 0.03, sy: 0.018, sz: 0.012 });
  }
  metal(B, () => lathe(B, [[0.088, h[1] + 0.035, 0.09], [0.092, h[1] + 0.06, 0.094]], gold, { segs: 14 }));
  for (let k = -1; k <= 1; k++) metal(B, () => tube(B, [[k * 0.04, h[1] + 0.055, h[2] + 0.075 - Math.abs(k) * 0.02], [k * 0.05, h[1] + 0.12 - Math.abs(k) * 0.03, h[2] + 0.06 - Math.abs(k) * 0.02]], [0.016, 0.002], gold, { segs: 4 }));
  G.shape(TPL.sphere, 0x60ffd0, { x: 0, y: h[1] + 0.06, z: h[2] + 0.09, s: 0.022 });
  return { B, G, height: 1.4, head: [h[0], h[1], h[2], 0.1], top: h[1] + 0.14 };
}

// ---------------------------------------------------------------- stone guardian
// A temple statue come alive: a squat warrior of carved blocks in a plumed
// headdress, a god's mask for a face with jade burning in the eyes, a stone
// club set with obsidian teeth, moss in its joints and light in its cracks.
export function guardian(spec) {
  const { B, G } = builders();
  const st = spec.color ?? 0xa8a088;
  const jade = spec.glow ?? 0x60ffb0;
  const hi = tint(st, 1.12), lo = deep(st, 0.72), moss = 0x5a8a34;
  const box = (col, x, y, z, sx, sy, sz, o = {}) => B.shape(TPL.box, col, { x, y, z, sx, sy, sz, ...o });
  // feet and legs: thick columns
  for (const s of [-1, 1]) {
    box(lo, s * 0.12, 0, 0.03, 0.15, 0.06, 0.2);
    box(st, s * 0.12, 0.05, 0.0, 0.13, 0.28, 0.14, { grad: 0.3 });
    box(hi, s * 0.12, 0.24, 0.005, 0.15, 0.04, 0.15);
  }
  // hips and a hanging loin-panel carved with a glyph
  box(lo, 0, 0.32, 0, 0.36, 0.1, 0.2);
  box(st, 0, 0.14, 0.1, 0.16, 0.2, 0.03);
  box(deep(st, 0.6), 0, 0.2, 0.116, 0.06, 0.06, 0.005);
  // torso: a broad block, wider at the shoulders, a carved breastplate
  B.shape(TPL.trap, st, { x: 0, y: 0.78, z: 0, sx: 0.44, sy: 0.4, sz: 0.21, rx: Math.PI });
  box(lo, 0, 0.36, 0, 0.3, 0.06, 0.19);
  box(hi, 0, 0.56, 0.1, 0.28, 0.14, 0.025);
  box(lo, 0, 0.6, 0.115, 0.1, 0.06, 0.008);
  // cracks glowing with jade
  G.box(jade, { x: 0.05, y: 0.5, z: 0.101, sx: 0.012, sy: 0.12, sz: 0.004, rz: 0.4 });
  G.box(jade, { x: -0.08, y: 0.68, z: 0.101, sx: 0.07, sy: 0.01, sz: 0.004, rz: -0.2 });
  // shoulders and arms of stacked blocks, great square fists
  for (const s of [-1, 1]) {
    box(hi, s * 0.24, 0.7, 0, 0.14, 0.11, 0.17);
    B.shape(TPL.hemi, moss, { x: s * 0.24, y: 0.805, z: 0, sx: 0.12, sy: 0.03, sz: 0.13 });
    const raise = s > 0;
    if (raise) {
      // the club arm lifted, ready to come down
      box(st, 0.28, 0.6, 0.08, 0.1, 0.13, 0.11, { rx: -0.6 });
      box(st, 0.29, 0.62, 0.2, 0.1, 0.12, 0.1, { rx: -1.4 });
      B.shape(TPL.dodec, lo, { x: 0.29, y: 0.66, z: 0.3, sx: 0.12, sy: 0.12, sz: 0.12, flat: true });
      // the club: a flat paddle edged with black glass
      const m = new THREE.Matrix4().makeRotationX(-0.3).setPosition(0.29, 0.66, 0.3);
      B.shape(TPL.box, 0x6a5038, { matrix: m, x: 0, y: 0, z: 0, sx: 0.035, sy: 0.22, sz: 0.035 });
      B.shape(TPL.box, 0x8a6a48, { matrix: m, x: 0, y: 0.22, z: 0, sx: 0.04, sy: 0.38, sz: 0.11 });
      for (let k = 0; k < 5; k++) for (const e of [-1, 1]) B.shape(TPL.cone4, 0x1a1820, { matrix: m, x: 0, y: 0.26 + k * 0.07, z: e * 0.06, sx: 0.025, sy: 0.05, sz: 0.025, rx: e * Math.PI / 2, flat: true });
    } else {
      box(st, -0.27, 0.5, 0.01, 0.1, 0.18, 0.11);
      box(st, -0.28, 0.33, 0.03, 0.09, 0.17, 0.1);
      B.shape(TPL.dodec, lo, { x: -0.28, y: 0.29, z: 0.04, sx: 0.13, sy: 0.12, sz: 0.13, flat: true });
      G.box(jade, { x: -0.28, y: 0.48, z: 0.065, sx: 0.06, sy: 0.008, sz: 0.004 });
    }
  }
  // the mask: a broad block face, heavy brow, eyes of jade fire, ear-spools
  const hy = 0.8;
  box(lo, 0, hy - 0.02, 0, 0.12, 0.05, 0.12);
  box(st, 0, hy + 0.02, 0.0, 0.26, 0.22, 0.22, { grad: 0.2 });
  box(hi, 0, hy + 0.18, 0.1, 0.28, 0.05, 0.05);
  for (const s of [-1, 1]) {
    box(0x141210, s * 0.065, hy + 0.13, 0.11, 0.07, 0.035, 0.01);
    G.box(jade, { x: s * 0.065, y: hy + 0.145, z: 0.116, sx: 0.06, sy: 0.022, sz: 0.004 });
    B.shape(TPL.cyl12, hi, { x: s * 0.15, y: hy + 0.11, z: 0.03, sx: 0.08, sy: 0.03, sz: 0.08, rz: Math.PI / 2 });
  }
  B.shape(TPL.trap, hi, { x: 0, y: hy + 0.06, z: 0.11, sx: 0.06, sy: 0.07, sz: 0.04 });
  box(0x141210, 0, hy + 0.04, 0.111, 0.12, 0.022, 0.004);
  for (let k = -2; k <= 2; k++) box(0xe8e0c8, k * 0.022, hy + 0.04, 0.113, 0.01, 0.016, 0.004);
  // headdress: a band of carved feathers fanning up behind
  box(hi, 0, hy + 0.24, 0.0, 0.3, 0.05, 0.24);
  for (let k = -3; k <= 3; k++) {
    const a = k * 0.22;
    B.shape(TPL.box, k % 2 ? st : hi, { x: Math.sin(a) * 0.14, y: hy + 0.28, z: -0.04 - Math.cos(a) * 0.03, sx: 0.06, sy: 0.24 - Math.abs(k) * 0.02, sz: 0.03, rz: -a });
  }
  G.box(jade, { x: 0, y: hy + 0.255, z: 0.121, sx: 0.04, sy: 0.03, sz: 0.004 });
  B.shape(TPL.hemi, moss, { x: 0.05, y: hy + 0.265, z: 0.02, sx: 0.12, sy: 0.03, sz: 0.1 });
  // moss and vines in the joints
  for (const [x, y, z] of [[-0.12, 0.29, 0.07], [0.1, 0.33, 0.08], [0.16, 0.42, 0.1]]) ball(B, moss, x, y, z, 0.035, 0.018, 0.02);
  tube(B, [[-0.18, 0.78, 0.09], [-0.1, 0.62, 0.11], [-0.14, 0.45, 0.11], [-0.1, 0.32, 0.12]], 0.008, 0x3a6a26, { segs: 4 });
  // shade the stone: lit tops, darker flanks and undersides
  const N = B.nor, C = B.col;
  for (let i = 0; i < C.length; i += 3) {
    const k = 0.66 + 0.42 * Math.max(0, N[i + 1]) + 0.1 * Math.max(0, N[i + 2]);
    C[i] *= k; C[i + 1] *= k; C[i + 2] *= k;
  }
  return { B, G, height: 1.38, head: [0, hy + 0.1, 0.0, 0.13], top: hy + 0.42 };
}

export const ISLE_BEASTS = { frog, cat, shark, naga, guardian };
