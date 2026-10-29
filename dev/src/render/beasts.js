// The bestiary, sculpted in the same hand-painted style as the heroes:
// smooth swept bodies, chunky readable silhouettes, glowing eyes for the
// wicked and bright painted eyes for mere animals. Models face +z, feet at
// y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL } from './builder.js';
import { tube, lathe, sheet, ball, mat, tint, blend, deep } from './sculpt.js';

const BONE = 0xf0e6cc, CLAW = 0x3a3028, IRON = 0x6a6e78, GOLD = 0xe2b24a;

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

// An animal's eye: dark and glossy with a catch-light, or a glowing ember.
function eye(B, G, p, r, glow) {
  if (glow != null) {
    ball(B, 0x1a1012, p[0], p[1], p[2], r * 1.25, r * 1.1, r * 0.8);
    G.shape(TPL.sphere, glow, { x: p[0], y: p[1], z: p[2] + r * 0.35, sx: r * 1.8, sy: r * 1.5, sz: r * 1.0 });
    return;
  }
  ball(B, 0xfff4e0, p[0], p[1], p[2], r * 1.15, r * 1.05, r * 0.8);
  ball(B, 0x1e140e, p[0], p[1] - r * 0.05, p[2] + r * 0.35, r * 0.75, r * 0.8, r * 0.55);
  ball(B, 0xffffff, p[0] - r * 0.25, p[1] + r * 0.3, p[2] + r * 0.8, r * 0.28, r * 0.28, r * 0.2);
}

// ---------------------------------------------------------------- four legs
export function quadruped(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x7a7068;
  const rat = spec.tail === 'long';
  const L = spec.long ?? 0.55;
  const lh = spec.legH ?? (rat ? 0.12 : 0.2);
  const hi = tint(blend(c, 0xfff0d8, 0.25), 1.1), lo = deep(c, 0.6);
  const belly = spec.belly ?? blend(c, 0xf4e8d0, 0.55);
  const by = lh + 0.13; // spine height
  const zf = L / 2, zb = -L / 2;
  // body: haunch to chest along a gently arched spine, deeper at the chest
  tube(B, [[0, by + 0.0, zb + 0.04], [0, by + 0.03, zb * 0.3], [0, by + 0.05, zf * 0.45], [0, by + 0.04, zf - 0.02]], rat ? [0.1, 0.12, 0.11, 0.09] : [0.1, 0.1, 0.13, 0.12], [lo, c, hi], { sq: 0.82, up: [0, 1, 0], segs: 12 });
  ball(B, belly, 0, by - 0.05, zf * 0.3, rat ? 0.08 : 0.085, 0.07, L * 0.32);
  // legs: straight fronts, digitigrade hinds with a strong haunch
  const legR = rat ? 0.032 : 0.04;
  for (const s of [-1, 1]) {
    const fx = s * (rat ? 0.07 : 0.075);
    const fl = [[fx, by - 0.02, zf - 0.08], [fx * 1.08, lh * 0.5, zf - 0.05], [fx, 0.035, zf - 0.03]];
    tube(B, fl, [legR * 1.3, legR, legR * 0.85], [c, deep(c, 0.75)], { segs: 8 });
    ball(B, rat ? 0xe8a8a0 : deep(c, 0.7), fx, 0.025, zf - 0.015, legR * 1.1, legR * 0.7, legR * 1.4);
    const hx = s * (rat ? 0.075 : 0.08);
    ball(B, c, hx, by - 0.01, zb + 0.1, rat ? 0.07 : 0.075, rat ? 0.08 : 0.09, rat ? 0.09 : 0.1);
    const hl = [[hx, by - 0.03, zb + 0.1], [hx * 1.05, lh * 0.75, zb + 0.15], [hx, lh * 0.32, zb + 0.03], [hx, 0.035, zb + 0.06]];
    tube(B, hl, [legR * 1.5, legR * 1.1, legR * 0.85, legR * 0.85], [c, deep(c, 0.75)], { segs: 8 });
    ball(B, rat ? 0xe8a8a0 : deep(c, 0.7), hx, 0.025, zb + 0.08, legR * 1.1, legR * 0.7, legR * 1.4);
  }
  // neck and head
  const hc = [0, by + (rat ? 0.06 : 0.14), zf + (rat ? 0.06 : 0.08)];
  tube(B, [[0, by + 0.03, zf - 0.06], lerp3([0, by + 0.03, zf - 0.06], hc, 0.6), hc], [0.1, 0.085, 0.07], [c, hi], { segs: 10, up: [0, 1, 0], sq: 0.9 });
  ball(B, c, hc[0], hc[1], hc[2], 0.09, 0.085, 0.095);
  // muzzle with a dark nose, and a jaw
  const sn = [hc, add(hc, [0, -0.02, 0.1]), add(hc, [0, -0.035, rat ? 0.17 : 0.18])];
  tube(B, sn, [0.07, 0.05, 0.025], [c, belly], { segs: 9, up: [0, 1, 0], sq: 1.1 });
  ball(B, rat ? 0xe89090 : 0x1a1414, sn[2][0], sn[2][1] + 0.005, sn[2][2] + 0.012, 0.022, 0.017, 0.016);
  if (!rat) tube(B, [add(hc, [0, -0.05, 0.03]), add(hc, [0, -0.065, 0.13])], [0.045, 0.02], belly, { segs: 7 });
  if (spec.spikes) {
    // a warg's snarl: fangs and a lolling jaw
    for (const s of [-1, 1]) tube(B, [add(hc, [s * 0.025, -0.05, 0.14]), add(hc, [s * 0.026, -0.09, 0.145])], [0.012, 0.001], BONE, { segs: 5, outline: true });
  }
  if (rat) for (const s of [-1, 1]) tube(B, [add(hc, [s * 0.008, -0.06, 0.155]), add(hc, [s * 0.008, -0.085, 0.15])], [0.008, 0.006], 0xfff8e0, { segs: 4 });
  // eyes and ears
  for (const s of [-1, 1]) {
    eye(B, G, add(hc, [s * 0.045, 0.03, 0.07]), rat ? 0.017 : 0.019, spec.eyes);
    if (rat) {
      ball(B, c, hc[0] + s * 0.06, hc[1] + 0.07, hc[2] - 0.02, 0.05, 0.05, 0.015, { rz: -s * 0.3 });
      ball(B, 0xe8a0a0, hc[0] + s * 0.06, hc[1] + 0.07, hc[2] - 0.01, 0.036, 0.036, 0.01, { rz: -s * 0.3 });
    } else {
      const e0 = add(hc, [s * 0.04, 0.05, -0.02]);
      tube(B, [e0, add(e0, [s * 0.025, 0.06, -0.01]), add(e0, [s * 0.03, 0.11, -0.03])], [0.035, 0.025, 0.003], [spec.earColor ?? c, deep(c, 0.7)], { sq: 0.45, segs: 7, up: [1, 0, 0] });
    }
  }
  if (rat) {
    // whiskers
    for (const s of [-1, 1]) for (const k of [-1, 1]) tube(B, [add(sn[2], [s * 0.02, 0, -0.02]), add(sn[2], [s * 0.09, 0.01 * k, -0.04])], 0.002, 0x2a2420, { segs: 3, cap: false });
  } else {
    // a ruff of fur around the neck
    for (let k = 0; k < 7; k++) {
      const a = -1.5 + (k / 6) * 3;
      const p = [Math.sin(a) * 0.095, by + 0.07 + Math.cos(a) * 0.05, zf - 0.02];
      tube(B, [p, add(p, [Math.sin(a) * 0.04, 0.01, -0.08])], [0.04, 0.004], [c, tint(c, 1.15)], { segs: 6 });
    }
  }
  // tail
  if (rat) tube(B, [[0, by - 0.02, zb + 0.02], [0.04, by - 0.06, zb - 0.12], [-0.03, 0.04, zb - 0.28], [0.06, 0.02, zb - 0.42]], [0.022, 0.016, 0.01, 0.004], [spec.tailColor ?? 0xd8a098, tint(spec.tailColor ?? 0xd8a098, 1.1)], { segs: 6 });
  else tube(B, [[0, by + 0.01, zb + 0.03], [0.01, by - 0.01, zb - 0.08], [0.04, by - 0.08, zb - 0.18], [0.06, by - 0.17, zb - 0.22]], [0.03, 0.055, 0.05, 0.01], [c, c, hi], { segs: 9 });
  if (spec.spikes) {
    // hackles: dark spikes of fur along the back
    for (let i = 0; i < 6; i++) {
      const z = zf - 0.02 - i * (L / 6);
      const y = by + 0.1 + (i < 2 ? 0.02 : 0) - i * 0.006;
      tube(B, [[0, y - 0.04, z], [0, y + 0.07 - i * 0.008, z - 0.07]], [0.04, 0.003], [deep(c, 0.7), 0x1a1614], { sq: 0.5, segs: 6, up: [0, 0, 1] });
    }
  }
  return { B, G, height: by + (rat ? 0.15 : 0.26) };
}

// ---------------------------------------------------------------- spider
export function spider(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x3a3030;
  const hi = tint(blend(c, 0x8a6a5a, 0.3), 1.3), lo = deep(c, 0.6);
  // big round abdomen with a marking, smaller head-chest
  ball(B, c, 0, 0.3, -0.22, 0.25, 0.22, 0.3, { grad: 0.35 });
  ball(B, hi, 0, 0.38, -0.12, 0.12, 0.08, 0.1);
  if (spec.mark != null) {
    ball(B, spec.mark, 0, 0.5, -0.24, 0.07, 0.02, 0.06, { rx: -0.2 });
    ball(B, spec.mark, 0, 0.47, -0.36, 0.08, 0.02, 0.07, { rx: -0.6 });
    ball(B, spec.mark, 0, 0.51, -0.3, 0.03, 0.015, 0.05, { rx: -0.4 });
  }
  ball(B, c, 0, 0.22, 0.08, 0.15, 0.11, 0.16, { grad: 0.3 });
  ball(B, lo, 0, 0.17, 0.02, 0.1, 0.06, 0.12);
  // eight legs: up to a high knee, then down to the ground
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = 0.75 - i * 0.5; // fan from front to back
      const root = [s * 0.11, 0.22, 0.12 - i * 0.06];
      const dir = [Math.cos(a) * s, 0, Math.sin(a)];
      const knee = [root[0] + dir[0] * 0.22, 0.46 - i * 0.02, root[2] + dir[2] * 0.22];
      const foot = [root[0] + dir[0] * 0.48, 0.0, root[2] + dir[2] * 0.48];
      tube(B, [root, lerp3(root, knee, 0.55), knee, lerp3(knee, foot, 0.5), foot], [0.035, 0.032, 0.028, 0.02, 0.008], [c, hi, c, lo, CLAW], { segs: 7 });
      ball(B, hi, knee[0], knee[1], knee[2], 0.034);
    }
    // fangs
    tube(B, [[s * 0.04, 0.17, 0.2], [s * 0.05, 0.11, 0.24], [s * 0.025, 0.06, 0.22]], [0.025, 0.018, 0.003], [lo, BONE], { segs: 6 });
  }
  // a cluster of glinting eyes
  const eyes = spec.eyes ?? 0xff3030;
  for (const [x, y, z, r] of [[0.045, 0.28, 0.22, 0.03], [-0.045, 0.28, 0.22, 0.03], [0.09, 0.27, 0.18, 0.02], [-0.09, 0.27, 0.18, 0.02], [0.025, 0.32, 0.19, 0.018], [-0.025, 0.32, 0.19, 0.018]]) {
    ball(B, 0x0e0a0a, x, y, z, r * 1.2);
    G.shape(TPL.sphere, eyes, { x, y, z: z + r * 0.4, s: r * 1.7 });
  }
  return { B, G, height: 0.55 };
}

// ---------------------------------------------------------------- bat
export function bat(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x3a2a2a;
  const fur = tint(blend(c, 0x8a6a4a, 0.3), 1.2), wing = blend(deep(c, 0.8), 0x7a4a4a, 0.25);
  ball(B, fur, 0, 0.0, 0, 0.1, 0.12, 0.09, { grad: 0.3 });
  ball(B, c, 0, 0.12, 0.03, 0.08, 0.075, 0.075);
  tube(B, [[0, 0.11, 0.08], [0, 0.1, 0.14]], [0.04, 0.02], c, { segs: 7 });
  ball(B, 0xd07070, 0, 0.105, 0.145, 0.015, 0.012, 0.01);
  for (const s of [-1, 1]) {
    // big ears
    tube(B, [[s * 0.04, 0.17, 0.02], [s * 0.08, 0.26, 0.0], [s * 0.1, 0.32, -0.02]], [0.04, 0.03, 0.003], [c, blend(c, 0xd08080, 0.4)], { sq: 0.35, segs: 7, up: [0, 1, 0] });
    eye(B, G, [s * 0.035, 0.14, 0.085], 0.016, spec.eyes ?? 0xff4040);
    tube(B, [[s * 0.018, 0.085, 0.13], [s * 0.016, 0.06, 0.13]], [0.007, 0.001], 0xfff8e8, { segs: 4 });
    // wings: a scalloped membrane between finger bones, raised in a V
    const sh = [s * 0.07, 0.04, 0.0], el = [s * 0.28, 0.14, 0.05], wr = [s * 0.48, 0.17, 0.0];
    const tips = [[s * 0.68, 0.1, -0.12], [s * 0.6, 0.05, -0.27], [s * 0.4, 0.03, -0.31], [s * 0.2, 0.01, -0.24]];
    const lead = (u) => (u < 0.5 ? lerp3(sh, el, u * 2) : lerp3(el, wr, (u - 0.5) * 2));
    const trail = (u) => {
      const f = u * 4;
      const pts = [[s * 0.07, -0.02, -0.1], tips[3], tips[2], tips[1], tips[0]];
      const j = Math.min(3, Math.floor(f)), t = f - j;
      const p = lerp3(pts[j], pts[j + 1], t);
      // scallop: pull the membrane in between the fingers
      return lerp3(p, lead(u), Math.sin(t * Math.PI) * 0.18);
    };
    sheet(B, (u, v) => lerp3(lead(u), trail(u), v), [wing, deep(wing, 0.7)], { nu: 12, nv: 3, thick: 0.008, flipN: s > 0 });
    tube(B, [sh, el, wr], [0.022, 0.018, 0.014], c, { segs: 6 });
    for (const t of tips) tube(B, [wr, t], [0.01, 0.003], c, { segs: 4, outline: true });
  }
  return { B, G, height: 0.36, float: true, hover: 0.45 };
}

// ---------------------------------------------------------------- slime / bog lurker
export function blob(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x4a6a3a;
  const hi = tint(blend(c, 0xd8f0a0, 0.35), 1.2), lo = deep(c, 0.55);
  // a slumped mound with a glistening top
  lathe(B, [[0.002, 0.0], [0.34, 0.0], [0.37, 0.04], [0.35, 0.12], [0.3, 0.24], [0.22, 0.34], [0.12, 0.41], [0.002, 0.43]], [lo, c, hi], { segs: 18, sq: 0.9 });
  ball(B, hi, -0.08, 0.36, 0.06, 0.1, 0.05, 0.08);
  // drips and lumps around the base
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    ball(B, k % 2 ? c : lo, Math.sin(a) * 0.34, 0.04, Math.cos(a) * 0.3, 0.08, 0.05, 0.08);
  }
  // a wide mouth full of crooked teeth
  ball(B, 0x2a1210, 0, 0.17, 0.27, 0.17, 0.07, 0.07);
  for (let k = -3; k <= 3; k++) {
    tube(B, [[k * 0.042, 0.215 - Math.abs(k) * 0.006, 0.31], [k * 0.044, 0.17 - Math.abs(k) * 0.004, 0.325]], [0.016, 0.002], BONE, { segs: 5 });
  }
  // two eyes on stalks
  for (const s of [-1, 1]) {
    const base = [s * 0.1, 0.36, 0.14], top = [s * 0.15, 0.5, 0.2];
    tube(B, [base, lerp3(base, top, 0.5), top], [0.04, 0.03, 0.03], [c, hi], { segs: 8 });
    ball(B, 0xfff0c0, top[0], top[1] + 0.03, top[2], 0.055);
    if (spec.eyes != null) G.shape(TPL.sphere, spec.eyes, { x: top[0], y: top[1] + 0.035, z: top[2] + 0.04, s: 0.05 });
    else ball(B, 0x1a1008, top[0], top[1] + 0.035, top[2] + 0.04, 0.026, 0.03, 0.02);
  }
  // reeds and a cattail growing out of the muck
  for (const [x, z, h, k] of [[0.12, -0.12, 0.38, 0.3], [-0.16, -0.06, 0.3, -0.4], [0.02, -0.2, 0.46, 0.1]]) {
    const p0 = [x, 0.28, z];
    tube(B, [p0, [x + k * 0.05, 0.28 + h * 0.6, z - 0.02], [x + k * 0.12, 0.28 + h, z - 0.06]], [0.014, 0.01, 0.002], [0x5a7a2a, 0x9ab04a], { segs: 5, outline: true });
  }
  tube(B, [[0.02, 0.6, -0.2], [0.03, 0.72, -0.22]], 0.028, 0x6a3a1a, { segs: 7 });
  return { B, G, height: 0.62 };
}

// ---------------------------------------------------------------- wraith
export function wraith(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x2a2630;
  const hi = tint(blend(c, 0x8090a0, 0.25), 1.35), lo = deep(c, 0.5);
  const glow = spec.eyes ?? 0x70ff90;
  // tattered robe, widest at the hem, floating clear of the ground
  lathe(B, [[0.24, 0.12, 0.2], [0.22, 0.25, 0.18], [0.16, 0.5, 0.13], [0.17, 0.68, 0.13], [0.12, 0.76, 0.1], [0.04, 0.8, 0.04]], [lo, c, hi], { segs: 16 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const p = [Math.sin(a) * 0.2, 0.17, Math.cos(a) * 0.17];
    tube(B, [p, add(p, [Math.sin(a) * 0.04, -0.12 - (k % 3) * 0.04, Math.cos(a) * 0.03])], [0.06, 0.003], [c, lo], { sq: 0.5, segs: 6, up: [Math.cos(a), 0, -Math.sin(a)] });
  }
  // wisps of ghost-light at the hem
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    G.shape(TPL.sphere, blend(glow, 0x000000, 0.45), { x: Math.sin(a) * 0.16, y: 0.08, z: Math.cos(a) * 0.13, s: 0.05 });
  }
  // shoulders and hood around a void with burning eyes
  for (const s of [-1, 1]) ball(B, c, s * 0.15, 0.7, 0.0, 0.1, 0.08, 0.1);
  lathe(B, [[0.12, 0.72, 0.13, 0.02], [0.17, 0.82, 0.17, 0.0], [0.16, 0.95, 0.16, -0.02], [0.08, 1.05, 0.09, -0.06], [0.01, 1.1, 0.01, -0.1]], [c, hi], { segs: 14 });
  tube(B, [[0, 1.06, -0.07], [0, 1.1, -0.18], [0, 1.0, -0.26]], [0.06, 0.04, 0.005], c, { segs: 8 });
  ball(B, 0x050508, 0, 0.88, 0.1, 0.12, 0.12, 0.08);
  for (const s of [-1, 1]) G.shape(TPL.sphere, glow, { x: s * 0.045, y: 0.9, z: 0.17, sx: 0.05, sy: 0.03, sz: 0.02 });
  // bony hands reaching from the sleeves
  for (const s of [-1, 1]) {
    const sh = [s * 0.17, 0.68, 0.02], el = [s * 0.25, 0.52, 0.1], hd = [s * 0.22, 0.48, 0.24];
    tube(B, [sh, el, hd], [0.07, 0.07, 0.08], [c, hi], { segs: 10, cap1: false });
    for (let k = -1; k <= 1; k++) tube(B, [add(hd, [0, 0, 0.02]), add(hd, [k * 0.025, -0.03, 0.09]), add(hd, [k * 0.03, -0.07, 0.1])], [0.01, 0.008, 0.002], BONE, { segs: 4, outline: true });
  }
  if (spec.hat === 'crown') {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const p = [Math.sin(a) * 0.15, 1.02, Math.cos(a) * 0.15 - 0.03];
      metal(B, () => tube(B, [p, add(p, [Math.sin(a) * 0.03, 0.14 + (k % 2) * 0.06, Math.cos(a) * 0.03])], [0.03, 0.003], [IRON, tint(IRON, 1.4)], { segs: 5 }));
    }
    metal(B, () => lathe(B, [[0.165, 0.98], [0.17, 1.04]], IRON, { segs: 14, sq: 0.95, dx: () => 0 }));
    // great spiked pauldrons
    for (const s of [-1, 1]) {
      metal(B, () => ball(B, IRON, s * 0.19, 0.74, 0.0, 0.12, 0.08, 0.12, { rz: -s * 0.4 }));
      metal(B, () => tube(B, [[s * 0.22, 0.79, 0], [s * 0.3, 0.92, -0.02]], [0.04, 0.003], tint(IRON, 1.3), { segs: 6 }));
    }
  }
  if (spec.weapon === 'sword') {
    const m = new THREE.Matrix4().multiplyMatrices(mat(0.24, 0.47, 0.25, -0.3, 0, -0.4), new THREE.Matrix4());
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).toArray();
    const X = new THREE.Vector3(1, 0, 0).transformDirection(m).toArray();
    tube(B, [at(0, -0.08, 0), at(0, 0.07, 0)], 0.02, 0x2a1a14, { segs: 6 });
    metal(B, () => tube(B, [at(-0.08, 0.08, 0), at(0, 0.07, 0), at(0.08, 0.08, 0)], [0.02, 0.016, 0.02], IRON, { segs: 5 }));
    metal(B, () => tube(B, [at(0, 0.09, 0), at(0, 0.4, 0), at(0, 0.66, 0)], [0.04, 0.035, 0.002], [0x3a3a44, 0x5a5a68], { sq: 0.22, segs: 4, flat: true, cap: false, up: X }));
    G.shape(TPL.cone4, spec.weaponGlow ?? glow, { matrix: new THREE.Matrix4().multiplyMatrices(m, mat(0, 0.1, 0, 0, 0, 0, [0.03, 0.55, 0.03])) });
  }
  return { B, G, height: spec.hat === 'crown' ? 1.2 : 1.1, float: true };
}

// ---------------------------------------------------------------- sea serpent
export function serpent(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0x2a7a6a;
  const hi = tint(blend(c, 0xd8f0c0, 0.3), 1.2), lo = deep(c, 0.6);
  const belly = spec.belly ?? blend(c, 0xf0e0a0, 0.55);
  // coils on the ground, rearing up into a long neck
  const path = [[0.05, 0.06, -0.5], [0.3, 0.07, -0.35], [0.28, 0.08, -0.05], [0.0, 0.1, 0.05], [-0.25, 0.1, -0.1], [-0.22, 0.14, -0.35], [-0.02, 0.3, -0.25], [0.02, 0.55, -0.05], [0.0, 0.66, 0.15]];
  tube(B, path, (t) => 0.025 + 0.09 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) - 0.02 * Math.max(0, t - 0.75) * 4, [lo, c, c, hi], { segs: 12, steps: 48, up: [0, 1, 0], sq: 1.0 });
  // pale belly scales along the rising neck
  tube(B, [[-0.02, 0.3, -0.2], [0.02, 0.52, 0.0], [0.0, 0.6, 0.13]], [0.06, 0.06, 0.05], belly, { segs: 8 });
  // a fin crest down the neck
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const p = lerp3([0.0, 0.72, 0.08], [-0.05, 0.3, -0.36], t);
    tube(B, [add(p, [0, -0.04, 0.02]), add(p, [0, 0.07 - t * 0.02, -0.06])], [0.035, 0.003], [deep(c, 0.8), hi], { sq: 0.35, segs: 6, up: [0, 0, 1] });
  }
  // head: a long skull with a heavy jaw and frills
  const h = [0.0, 0.7, 0.2];
  ball(B, c, h[0], h[1], h[2], 0.11, 0.09, 0.13);
  tube(B, [h, add(h, [0, -0.02, 0.18])], [0.08, 0.05], [c, hi], { segs: 10, up: [0, 1, 0], sq: 1.2 });
  tube(B, [add(h, [0, -0.06, 0.02]), add(h, [0, -0.08, 0.17])], [0.06, 0.035], belly, { segs: 8 });
  for (const s of [-1, 1]) {
    G.shape(TPL.sphere, spec.eyes ?? 0xffe040, { x: s * 0.07, y: h[1] + 0.04, z: h[2] + 0.07, sx: 0.045, sy: 0.035, sz: 0.03 });
    ball(B, 0x1a1210, s * 0.07, h[1] + 0.04, h[2] + 0.06, 0.04, 0.032, 0.025);
    sheet(B, (u, v) => [s * (0.08 + u * 0.14), h[1] + 0.02 + v * 0.12 - u * 0.05, h[2] - 0.05 - u * 0.06 + v * 0.02], [hi, deep(c, 0.8)], { nu: 3, nv: 2, thick: 0.008, flipN: s < 0 });
    tube(B, [add(h, [s * 0.03, -0.05, 0.16]), add(h, [s * 0.03, -0.09, 0.16])], [0.012, 0.001], BONE, { segs: 4, outline: true });
  }
  return { B, G, height: 0.85 };
}

// ---------------------------------------------------------------- dragon
export function dragon(spec) {
  const { B, G } = builders();
  const c = spec.color ?? 0xa83a2a;
  const belly = spec.belly ?? 0xe8c070;
  const hi = tint(blend(c, 0xffe0b0, 0.2), 1.2), lo = deep(c, 0.55);
  const membrane = blend(c, belly, 0.35);
  // spine from the tail tip to the skull
  const spine = [[0.18, 0.06, -1.0], [0.22, 0.1, -0.75], [0.08, 0.22, -0.45], [0, 0.38, -0.18], [0, 0.44, 0.12], [0, 0.52, 0.28], [0, 0.72, 0.36], [0, 0.86, 0.44]];
  tube(B, spine, [0.015, 0.05, 0.11, 0.21, 0.22, 0.14, 0.1, 0.09], [lo, c, c, hi], { segs: 14, steps: 40, up: [0, 1, 0], sq: 1.05 });
  // belly plates
  tube(B, [[0, 0.3, -0.3], [0, 0.32, -0.05], [0, 0.4, 0.2], [0, 0.6, 0.38], [0, 0.78, 0.47]], [0.12, 0.17, 0.15, 0.08, 0.06], belly, { segs: 10, up: [0, 1, 0], sq: 1.0 });
  // back spines
  for (let i = 0; i < 9; i++) {
    const p = i < 3 ? lerp3([0, 0.86, 0.38], [0, 0.66, 0.3], i / 3) : lerp3([0, 0.62, 0.18], [0.1, 0.24, -0.6], (i - 3) / 6);
    const sz = i < 3 ? 0.07 : 0.11 - (i - 3) * 0.012;
    tube(B, [add(p, [0, -0.02, 0.03]), add(p, [0, sz, -sz * 0.6])], [sz * 0.5, 0.003], [deep(c, 0.7), BONE], { sq: 0.4, segs: 6, up: [0, 0, 1] });
  }
  // head: skull, snout, jaw, horns and burning eyes
  const h = [0, 0.92, 0.5];
  ball(B, c, h[0], h[1], h[2], 0.12, 0.1, 0.13);
  tube(B, [add(h, [0, 0, 0.05]), add(h, [0, -0.03, 0.24])], [0.09, 0.06], [c, hi], { segs: 10, up: [0, 1, 0], sq: 1.25 });
  tube(B, [add(h, [0, -0.07, 0.02]), add(h, [0, -0.11, 0.2])], [0.07, 0.04], belly, { segs: 8, up: [0, 1, 0], sq: 1.3 });
  for (const s of [-1, 1]) {
    tube(B, [add(h, [s * 0.07, 0.06, -0.04]), add(h, [s * 0.12, 0.12, -0.15]), add(h, [s * 0.13, 0.22, -0.28])], [0.035, 0.025, 0.004], [blend(BONE, 0x6a5a40, 0.3), BONE], { segs: 7 });
    tube(B, [add(h, [s * 0.1, -0.02, -0.04]), add(h, [s * 0.17, -0.02, -0.1])], [0.025, 0.003], BONE, { segs: 5 });
    ball(B, 0x1a1210, s * 0.075, h[1] + 0.04, h[2] + 0.1, 0.035, 0.026, 0.025);
    G.shape(TPL.sphere, spec.eyes ?? 0xffd030, { x: s * 0.078, y: h[1] + 0.045, z: h[2] + 0.115, sx: 0.045, sy: 0.03, sz: 0.025 });
    tube(B, [add(h, [s * 0.03, -0.06, 0.22]), add(h, [s * 0.03, -0.1, 0.22])], [0.012, 0.001], BONE, { segs: 4, outline: true });
    ball(B, 0x2a1210, s * 0.025, h[1] - 0.005, h[2] + 0.27, 0.012, 0.01, 0.01);
  }
  // four legs with claws
  for (const s of [-1, 1]) {
    for (const [z, k] of [[0.18, 1], [-0.22, 1.2]]) {
      const top = [s * 0.18, 0.4, z], knee = [s * 0.26, 0.22, z + (k > 1 ? -0.06 : 0.04)], foot = [s * 0.24, 0.04, z + 0.06];
      ball(B, c, top[0], top[1], top[2], 0.11 * k, 0.12 * k, 0.13 * k);
      tube(B, [top, knee, foot], [0.08 * k, 0.06 * k, 0.05 * k], [c, lo], { segs: 9 });
      ball(B, lo, foot[0], 0.035, foot[2] + 0.02, 0.07 * k, 0.04, 0.08 * k);
      for (let t = -1; t <= 1; t++) tube(B, [[foot[0] + t * 0.035, 0.04, foot[2] + 0.07 * k], [foot[0] + t * 0.045, 0.01, foot[2] + 0.13 * k]], [0.018, 0.002], BONE, { segs: 5 });
    }
    // wings: arm bones from the shoulder, a membrane with a scalloped edge
    const sh = [s * 0.14, 0.58, 0.15], el = [s * 0.48, 0.9, 0.1], wr = [s * 0.8, 0.98, -0.08];
    const fingers = [[s * 1.15, 0.8, -0.4], [s * 0.98, 0.7, -0.68], [s * 0.66, 0.62, -0.78], [s * 0.34, 0.56, -0.6]];
    const root = [s * 0.12, 0.52, -0.3];
    const lead = (u) => (u < 0.5 ? lerp3(sh, el, u * 2) : lerp3(el, wr, (u - 0.5) * 2));
    const edge = [root, fingers[3], fingers[2], fingers[1], fingers[0]];
    const trail = (u) => {
      const f = u * 4, j = Math.min(3, Math.floor(f)), t = f - j;
      return lerp3(lerp3(edge[j], edge[j + 1], t), lead(u), Math.sin(t * Math.PI) * 0.2);
    };
    sheet(B, (u, v) => {
      const p = lerp3(lead(u), trail(u), v);
      return [p[0], p[1] - Math.sin(v * Math.PI) * 0.05, p[2]];
    }, [membrane, deep(membrane, 0.65)], { nu: 14, nv: 4, thick: 0.012, flipN: s > 0, back: deep(c, 0.8) });
    tube(B, [sh, el, wr], [0.05, 0.04, 0.03], [c, hi], { segs: 8 });
    ball(B, BONE, ...add(wr, [0, 0.03, 0.01]), 0.03);
    for (const f of fingers) tube(B, [wr, lerp3(wr, f, 0.5), f], [0.022, 0.016, 0.006], c, { segs: 6 });
  }
  return { B, G, height: 1.15 };
}

// ---------------------------------------------------------------- tree guardian
export function ent(spec) {
  const { B, G } = builders();
  const bark = spec.color ?? 0x6a4a2b;
  const hi = tint(bark, 1.25), lo = deep(bark, 0.6);
  lathe(B, [[0.2, 0.0, 0.18], [0.16, 0.12], [0.15, 0.5], [0.17, 0.75], [0.12, 0.92]], [lo, bark, hi], { segs: 12 });
  // roots
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    tube(B, [[Math.sin(a) * 0.12, 0.16, Math.cos(a) * 0.1], [Math.sin(a) * 0.26, 0.04, Math.cos(a) * 0.22], [Math.sin(a) * 0.32, 0.0, Math.cos(a) * 0.28]], [0.06, 0.04, 0.01], [bark, lo], { segs: 7 });
  }
  // branch arms with twiggy fingers
  for (const s of [-1, 1]) {
    const a = [s * 0.13, 0.7, 0.02], b = [s * 0.32, 0.6, 0.1], c = [s * 0.36, 0.4, 0.18];
    tube(B, [a, b, c], [0.06, 0.045, 0.03], [bark, hi], { segs: 8 });
    for (let k = -1; k <= 1; k++) tube(B, [c, add(c, [s * 0.02 + k * 0.03, -0.1, 0.04 + k * 0.02])], [0.018, 0.003], bark, { segs: 5 });
  }
  // a face in the bark
  for (const s of [-1, 1]) {
    ball(B, 0x1a120a, s * 0.06, 0.66, 0.15, 0.035, 0.03, 0.02);
    G.shape(TPL.sphere, spec.eyes ?? 0xffe080, { x: s * 0.06, y: 0.66, z: 0.162, s: 0.035 });
  }
  ball(B, 0x2a1a10, 0, 0.55, 0.16, 0.05, 0.025, 0.02);
  tube(B, [[0, 0.62, 0.17], [0, 0.6, 0.22]], [0.03, 0.01], hi, { segs: 6 });
  // a great crown of leaves
  const greens = [0x4c9634, 0x5aa339, 0x3f8030, 0x6ab840];
  const blobs = [[0, 1.05, 0, 0.32], [0.2, 0.98, 0.05, 0.22], [-0.2, 0.97, 0.04, 0.22], [0.05, 1.22, -0.05, 0.22], [0, 0.95, -0.18, 0.24], [-0.08, 1.12, 0.14, 0.18], [0.14, 1.15, 0.12, 0.16]];
  blobs.forEach(([x, y, z, r], i) => B.shape(TPL.ico1, greens[i % 4], { x, y, z, s: r * 2, grad: 0.3 }));
  for (const [x, y, z] of [[0.12, 1.24, 0.12], [-0.18, 1.08, 0.2], [0.24, 1.05, 0.16]]) ball(B, 0xf0a0c0, x, y, z, 0.03);
  return { B, G, height: 1.4 };
}
