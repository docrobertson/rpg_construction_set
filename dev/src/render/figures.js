// Heroic, hand-painted figures: chunky Warcraft-style proportions (about
// four heads tall, broad shoulders, big hands, boots and weapons), sculpted
// from smooth tubes, lathes and shells, with painted faces. Everything a
// figure wears is merged into one geometry (plus a glow layer and a face
// decal layer), so a hero is still a couple of draw calls.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { tube, lathe, sheet, ball, extrude, mat, along, tint, blend, deep } from './sculpt.js';
import { sculptHead, headSurf, setHeadTilt, FACE_ROWS, BROWS } from './faces.js';

// Body plans per race. Lengths are before the race's overall `scale`.
//  leg: ankle to hip, torso: hip to shoulder, sw/hw: shoulder/hip half-width,
//  headR: head radius, limb: limb thickness, hunch: head pushed forward
export const RACE_LOOKS = {
  human: { scale: 1, skin: 0xf0c4a0, hair: 0x5a3a20, leg: 0.35, torso: 0.25, sw: 0.165, hw: 0.072, headR: 0.128, limb: 1, shape: 'hero' },
  dwarf: { scale: 0.8, skin: 0xeab48e, hair: 0x9a4a22, leg: 0.21, torso: 0.25, sw: 0.195, hw: 0.088, headR: 0.138, limb: 1.32, shape: 'dwarf', beard: true, belly: 0.035 },
  elf: { scale: 1.04, skin: 0xf6dcc4, hair: 0xeedc98, leg: 0.39, torso: 0.25, sw: 0.148, hw: 0.066, headR: 0.122, limb: 0.86, shape: 'elf', ears: 'elf', longHair: true },
  hobbit: { scale: 0.72, skin: 0xf0c4a0, hair: 0x6a4020, leg: 0.22, torso: 0.22, sw: 0.14, hw: 0.075, headR: 0.14, limb: 0.98, shape: 'hero', belly: 0.04, bareFeet: true, curly: true },
  orc: { scale: 1.08, skin: 0x6f8f42, hair: 0x1a1a1a, leg: 0.31, torso: 0.28, sw: 0.215, hw: 0.085, headR: 0.118, limb: 1.42, shape: 'orc', tusks: true, ears: 'orc', hunch: 0.05, mohawk: true },
  goblin: { scale: 0.74, skin: 0x9aaa44, hair: 0x2a2a1a, leg: 0.23, torso: 0.2, sw: 0.12, hw: 0.062, headR: 0.155, limb: 0.78, shape: 'goblin', ears: 'goblin', nose: 'goblin', hunch: 0.04 },
  troll: { scale: 1.32, skin: 0x7a8a76, hair: 0x3a3a2a, leg: 0.36, torso: 0.3, sw: 0.185, hw: 0.08, headR: 0.102, limb: 1.18, shape: 'troll', tusks: true, ears: 'troll', nose: 'troll', hunch: 0.08, mohawk: true, longArms: true },
  skeleton: { scale: 1, skin: 0xece4cc, hair: null, leg: 0.35, torso: 0.25, sw: 0.15, hw: 0.068, headR: 0.118, limb: 0.55, shape: 'skull', bones: true },
};

export const HAIR_STYLES = ['short', 'long', 'ponytail', 'braids', 'topknot', 'bald'];

const STEEL = 0xc9d0da, IRON = 0x8a9098, GOLD = 0xe2b24a, LEATHER = 0x7a4e2c, DARKLEATHER = 0x4e321e, WOOD = 0x8a5a30, BONE = 0xf0e6cc;

// a stable little hash of a look, for choices it doesn't spell out
function hashLook(spec) {
  const s = `${spec.skin}|${spec.hair}|${spec.body}|${spec.race}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Record a run of metal geometry: its uvs are pointed at the atlas' metal
// cell, which the entity shader gives a painted highlight.
function MT(B, fn, on = true) {
  const a = B.count, d = B.detail ? B.detail.count : 0;
  fn();
  if (!on) return;
  (B.metal ||= []).push([a, B.count]);
  if (B.detail) (B.detail.metal ||= []).push([d, B.detail.count]);
}

// ---------------------------------------------------------------- shells
// A thick shell over part of the head (hair, helms, hoods, beards): it
// follows the head surface `lift` above it, between th = thA(ph) .. thB(ph),
// with a lip down to the skin along its open edges.
function shell(B, hd, o) {
  const nu = o.nu ?? 22, nv = o.nv ?? 9;
  const full = o.ph0 == null;
  const ph0 = o.ph0 ?? -Math.PI, ph1 = o.ph1 ?? Math.PI;
  const grid = [];
  const c = new THREE.Color();
  const pt = (u, v) => {
    const ph = ph0 + (ph1 - ph0) * u;
    const ta = o.thA ? o.thA(ph) : 0, tb = o.thB(ph);
    const th = ta + (tb - ta) * v;
    const s = headSurf(hd.shape, th, ph);
    const L = typeof o.lift === 'function' ? o.lift(u, v, ph, th) : o.lift;
    const off = o.offset ? o.offset(u, v, ph, th) : [0, 0, 0];
    return {
      p: [hd.x + (s.p[0] + s.n[0] * L + off[0]) * hd.r, hd.y + (s.p[1] + s.n[1] * L + off[1]) * hd.r, hd.z + (s.p[2] + s.n[2] * L + off[2]) * hd.r],
      skin: [hd.x + s.p[0] * hd.r, hd.y + s.p[1] * hd.r, hd.z + s.p[2] * hd.r],
      n: s.n, th, ph,
    };
  };
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) row.push(pt(i / nu, j / nv));
    grid.push(row);
  }
  const col = (u, v) => {
    const h = typeof o.col === 'function' ? o.col(u, v) : o.col;
    c.setHex(h);
    return c;
  };
  const put = (P, n, cc) => { B.pos.push(P[0], P[1], P[2]); B.nor.push(n[0], n[1], n[2]); B.col.push(cc.r, cc.g, cc.b); };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = grid[j][i], b = grid[j][i + 1], d = grid[j + 1][i], e = grid[j + 1][i + 1];
    const ca = col(i / nu, j / nv).clone(), cb = col((i + 1) / nu, j / nv).clone(), cd = col(i / nu, (j + 1) / nv).clone(), ce = col((i + 1) / nu, (j + 1) / nv).clone();
    // orientation: th grows downward, ph grows to +x at the front
    put(a.p, a.n, ca); put(d.p, d.n, cd); put(e.p, e.n, ce);
    put(a.p, a.n, ca); put(e.p, e.n, ce); put(b.p, b.n, cb);
  }
  // lips along open edges
  const lip = (A, Bp, inA, inB, cc) => {
    // outward direction: from the interior neighbour to the edge
    const na = norm([A.p[0] - inA.p[0], A.p[1] - inA.p[1], A.p[2] - inA.p[2]]);
    const nb = norm([Bp.p[0] - inB.p[0], Bp.p[1] - inB.p[1], Bp.p[2] - inB.p[2]]);
    const ca = cc.clone().multiplyScalar(o.lipShade ?? 0.8);
    // wind so that the face points along the outward direction
    const e1 = sub(Bp.p, A.p), e2 = sub(A.skin, A.p);
    const f = cross(e1, e2);
    if (dot(f, na) > 0) { put(A.p, na, cc); put(Bp.p, nb, cc); put(Bp.skin, nb, ca); put(A.p, na, cc); put(Bp.skin, nb, ca); put(A.skin, na, ca); }
    else { put(A.p, na, cc); put(Bp.skin, nb, ca); put(Bp.p, nb, cc); put(A.p, na, cc); put(A.skin, na, ca); put(Bp.skin, nb, ca); }
  };
  for (let i = 0; i < nu; i++) {
    if (o.thA) lip(grid[0][i], grid[0][i + 1], grid[1][i], grid[1][i + 1], col(i / nu, 0));
    lip(grid[nv][i], grid[nv][i + 1], grid[nv - 1][i], grid[nv - 1][i + 1], col(i / nu, 1));
  }
  if (!full) for (let j = 0; j < nv; j++) {
    lip(grid[j][0], grid[j + 1][0], grid[j][1], grid[j + 1][1], col(0, j / nv));
    lip(grid[j][nu], grid[j + 1][nu], grid[j][nu - 1], grid[j + 1][nu - 1], col(1, j / nv));
  }
  return grid;
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// a point on/above the head given angles (th from the crown, ph from the front)
function onHead(hd, th, ph, lift = 0) {
  const s = headSurf(hd.shape, th, ph);
  return [hd.x + (s.p[0] + s.n[0] * lift) * hd.r, hd.y + (s.p[1] + s.n[1] * lift) * hd.r, hd.z + (s.p[2] + s.n[2] * lift) * hd.r];
}

// hairline as th for a given ph: front, side and back heights (as cos th)
function hairline(front, side, back) {
  return (ph) => {
    const a = Math.abs(((ph + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI); // 0 front .. PI back
    const y = a < Math.PI / 2 ? front + (side - front) * Math.sin(a) ** 1.5 : side + (back - side) * (1 - Math.cos(a - Math.PI / 2)) ** 1;
    return Math.acos(Math.max(-0.99, Math.min(0.99, y)));
  };
}

// ---------------------------------------------------------------- hair
function hairShade(hair) {
  // painted hair: deep at the roots and edges, a band of sheen on the crown
  const lo = deep(hair, 0.62), hi = tint(blend(hair, 0xfff4dc, 0.18), 1.12);
  return (u, v) => {
    const base = v < 0.35 ? blend(hair, hi, Math.sin((v / 0.35) * Math.PI) * 0.8) : blend(hair, lo, (v - 0.35) / 0.65 * 0.75);
    const strand = Math.sin(u * Math.PI * 2 * 11) * 0.5 + 0.5;
    return blend(base, strand > 0.5 ? hi : lo, Math.abs(strand - 0.5) * 0.35 * Math.min(1, v * 3));
  };
}

function buildHair(B, hd, style, hair, race, opts) {
  if (style === 'bald' || hair == null) return;
  const shade = hairShade(hair);
  const lo = deep(hair, 0.66), hi = tint(blend(hair, 0xfff4dc, 0.15), 1.1);
  const r = hd.r;
  const covered = opts.covered;
  if (!covered && style !== 'mohawk') {
    const line = style === 'short' || style === 'topknot' ? hairline(0.52, 0.05, -0.5) : hairline(0.5, -0.15, -0.65);
    shell(B, hd, { thB: line, lift: (u, v) => 0.1 + 0.05 * Math.sin(v * Math.PI), col: shade, nu: 24, nv: 8 });
    // fringe: three chunky locks sweeping across the brow
    if (!race.curly) {
      const sweep = opts.fair ? -1 : 1;
      for (let k = 0; k < 3; k++) {
        const ph0 = sweep * (-0.55 + k * 0.42), ph1 = ph0 + sweep * 0.5;
        const pts = [onHead(hd, 0.35, ph0 * 0.6, 0.16), onHead(hd, 0.85, ph0 * 0.8 + ph1 * 0.2, 0.15), onHead(hd, 1.08 + (k === 1 ? 0.06 : 0), ph1, 0.09)];
        tube(B, pts, [0.2 * r, 0.17 * r, 0.04 * r], [hi, hair], { sq: 0.55, segs: 8, up: [1, 0, 0] });
      }
    } else {
      // curls: little balls all over
      for (let k = 0; k < 14; k++) {
        const th = 0.25 + (k % 3) * 0.38, ph = (k / 14) * Math.PI * 2 + (k % 2) * 0.3;
        const p = onHead(hd, th, ph, 0.14);
        ball(B, k % 2 ? hair : hi, p[0], p[1], p[2], 0.2 * r);
      }
    }
    // side locks in front of the ears for long hair
    if (style === 'long' || style === 'braids') {
      for (const s of [-1, 1]) {
        const a = onHead(hd, 1.2, s * 1.2, 0.12), b = onHead(hd, 1.85, s * 1.3, 0.12);
        tube(B, [a, b, add(b, [s * 0.02 * r, -0.4 * r, 0.05 * r])], [0.2 * r, 0.18 * r, 0.06 * r], [hair, lo], { sq: 0.6, segs: 8 });
      }
    }
  }
  const back = (y) => onHead(hd, 1.9, Math.PI, 0.1).map((v, i) => (i === 1 ? hd.y + y * r : v));
  if (style === 'long') {
    // a mane of three broad locks falling down the back, fanning out a little
    for (let k = -1; k <= 1; k++) {
      const ph = Math.PI + k * 0.7;
      const a = onHead(hd, 1.25, ph, 0.12), b = onHead(hd, 2.25, ph, 0.2);
      const c = [hd.x + Math.sin(ph) * r * (1.05 + Math.abs(k) * 0.08), hd.y - 1.9 * r, hd.z + Math.cos(ph) * r * 0.75 - 0.06 * r];
      tube(B, [a, b, c], [0.5 * r, 0.46 * r, 0.12 * r], [hair, lo], { sq: 0.55, segs: 8, up: [1, 0, 0] });
    }
  } else if (style === 'ponytail') {
    const a = onHead(hd, 1.55, Math.PI, 0.18);
    ball(B, opts.tie ?? 0x7a3a2a, a[0], a[1], a[2], 0.17 * r);
    tube(B, [a, add(a, [0, 0.05 * r, -0.4 * r]), add(a, [0.05 * r, -0.8 * r, -0.5 * r]), add(a, [0.12 * r, -1.6 * r, -0.35 * r])], [0.24 * r, 0.3 * r, 0.22 * r, 0.05 * r], [hair, lo], { segs: 9 });
  } else if (style === 'braids') {
    for (const s of [-1, 1]) {
      const a = onHead(hd, 1.75, s * 1.95, 0.1);
      const pts = [a, add(a, [s * 0.1 * r, -0.6 * r, 0.3 * r]), add(a, [s * 0.05 * r, -1.5 * r, 0.55 * r])];
      tube(B, pts, (t) => (0.13 + 0.05 * Math.abs(Math.sin(t * Math.PI * 6))) * r * (1 - t * 0.35), [hair, lo], { segs: 8, steps: 24 });
      const e = pts[2];
      MT(B, () => ball(B, GOLD, e[0], e[1] - 0.02 * r, e[2], 0.11 * r));
    }
  } else if (style === 'topknot') {
    const a = onHead(hd, 0.2, Math.PI, 0.1);
    ball(B, hair, a[0], a[1] + 0.12 * r, a[2], 0.28 * r);
    lathe(B, [[0.18 * r, a[1] - 0.02 * r, 0.18 * r, a[2]], [0.2 * r, a[1] + 0.05 * r, 0.2 * r, a[2]]], opts.tie ?? GOLD, { dx: () => a[0] });
  } else if (style === 'mohawk') {
    const pts = [onHead(hd, 0.75, 0, 0.2), onHead(hd, 0.1, 0, 0.42), onHead(hd, 0.9, Math.PI, 0.45), onHead(hd, 1.6, Math.PI, 0.3), back(-1.4)];
    tube(B, pts, [0.06 * r, 0.1 * r, 0.11 * r, 0.08 * r, 0.03 * r], [hi, hair, lo], { sq: 3.2, segs: 10, up: [1, 0, 0] });
  }
}

function buildBeard(B, hd, beard, big, race) {
  const r = hd.r;
  const lo = deep(beard, 0.68), hi = tint(blend(beard, 0xfff4dc, 0.12), 1.08);
  // jaw cover from sideburn to sideburn, below the cheekbones
  shell(B, hd, {
    ph0: -1.75, ph1: 1.75,
    thA: (ph) => (Math.abs(ph) > 1.25 ? 1.5 : 1.5 + (1.25 - Math.abs(ph)) * 0.4 * (big ? 0.95 : 1)),
    thB: () => Math.PI * 0.97,
    lift: (u, v) => (big ? 0.16 : 0.09) + (big ? 0.12 : 0.04) * Math.sin(v * Math.PI) * Math.sin(u * Math.PI),
    col: (u, v) => blend(beard, lo, v * 0.5), nu: 16, nv: 6,
  });
  // moustache: two swooping locks under the nose
  for (const s of [-1, 1]) {
    const a = onHead(hd, 1.92, s * 0.05, 0.22), b = onHead(hd, 2.06, s * 0.42, 0.2);
    const c = add(b, [s * 0.1 * r, -0.28 * r, 0.06 * r]);
    tube(B, [a, b, c], [0.13 * r, 0.12 * r, 0.04 * r], [hi, beard], { segs: 8 });
  }
  if (big) {
    // the great dwarven beard: a mass down the chest, forking into braids
    const chin = onHead(hd, 2.55, 0, 0.2);
    const pts = [chin, add(chin, [0, -0.55 * r, 0.12 * r]), add(chin, [0, -1.25 * r, 0.1 * r])];
    tube(B, pts, [0.62 * r, 0.6 * r, 0.32 * r], [beard, lo], { sq: 0.55, segs: 12, up: [1, 0, 0] });
    for (const s of [-1, 1]) {
      const a = add(pts[2], [s * 0.2 * r, 0.1 * r, 0]);
      const e = add(a, [s * 0.08 * r, -0.65 * r, 0.04 * r]);
      tube(B, [a, lerp3(a, e, 0.5), e], (t) => (0.16 + 0.04 * Math.abs(Math.sin(t * Math.PI * 4))) * r * (1 - t * 0.3), [beard, lo], { segs: 8, steps: 14 });
      lathe(B, [[0.12 * r, e[1] - 0.06 * r, 0.12 * r, e[2]], [0.13 * r, e[1] + 0.06 * r, 0.13 * r, e[2]]], GOLD, { dx: () => e[0], segs: 10 });
    }
  } else {
    const chin = onHead(hd, 2.7, 0, 0.12);
    tube(B, [chin, add(chin, [0, -0.3 * r, 0.06 * r])], [0.3 * r, 0.12 * r], [beard, lo], { sq: 0.6, segs: 10, up: [1, 0, 0] });
  }
}

// ---------------------------------------------------------------- headgear
function buildHeadgear(B, G, hd, spec, TPL) {
  const hat = spec.hat || 'none';
  const r = hd.r;
  const trim = spec.trim ?? GOLD;
  if (hat === 'wizard') {
    const hc = spec.hatColor ?? 0x3a3a8a;
    const lo = deep(hc, 0.6);
    const by = hd.y + 0.66 * r;
    // a wide brim, tipped back to show the face, and a tall crooked crown
    const tip = mat(hd.x, by, hd.z - 0.1 * r, -0.3, 0, 0);
    lathe(B, [[0.05, -0.02], [1.75 * r, -0.08 * r], [1.85 * r, -0.03 * r], [1.3 * r, 0.06 * r], [0.9 * r, 0.14 * r]], [lo, hc], { segs: 20, sq: 0.95, matrix: tip });
    const base = [hd.x, by + 0.1 * r, hd.z - 0.12 * r];
    const pts = [base, add(base, [0, 1.1 * r, -0.3 * r]), add(base, [0.08 * r, 2.0 * r, -0.65 * r]), add(base, [0.45 * r, 2.4 * r, -1.05 * r])];
    tube(B, pts, [0.92 * r, 0.62 * r, 0.32 * r, 0.04 * r], [hc, tint(hc, 1.25)], { segs: 14, cap0: false, steps: 16 });
    lathe(B, [[0.93 * r, 0.06 * r], [0.96 * r, 0.16 * r], [0.9 * r, 0.26 * r]], spec.hatBand ?? trim, { segs: 18, matrix: tip });
    const st = add(base, [0.35 * r, 0.25 * r, 0.82 * r]);
    G.shape(TPL.ico0, 0xfff0a0, { x: st[0], y: st[1], z: st[2], s: 0.16 * r });
    return { top: pts[3][1] };
  }
  if (hat === 'helm' || hat === 'hornhelm') {
    const m = spec.hatColor ?? (hat === 'hornhelm' ? 0x5a5a62 : STEEL);
    const hi = tint(m, 1.18), lo = deep(m, 0.62);
    const dwarfish = spec.race === 'dwarf';
    // dome down to the brow, with cheek guards that frame the face
    const line = (ph) => {
      const a = Math.abs(ph);
      if (a < 0.62) return Math.acos(0.36);
      if (a < 1.25) return Math.acos(0.36) + (a - 0.62) / 0.63 * 1.05;
      return Math.acos(-0.62);
    };
    MT(B, () => shell(B, hd, { thB: line, lift: (u, v) => 0.17 + 0.03 * (1 - v), col: (u, v) => blend(hi, lo, v * 0.8), nu: 26, nv: 8, lipShade: 0.7 }));
    // a brow band in trim and a nose guard
    const band = [];
    for (let k = 0; k <= 16; k++) {
      const ph = -0.75 + (k / 16) * 1.5;
      band.push(onHead(hd, Math.acos(0.36) - 0.02, ph, 0.22));
    }
    MT(B, () => tube(B, band, 0.075 * r, spec.helmTrim ?? (spec.plume ? trim : tint(m, 0.85)), { segs: 6, steps: 20 }));
    const n0 = onHead(hd, Math.acos(0.36), 0, 0.22), n1 = onHead(hd, 1.95, 0, 0.32);
    MT(B, () => tube(B, [n0, lerp3(n0, n1, 0.5), n1], [0.09 * r, 0.08 * r, 0.06 * r], [hi, m], { sq: 0.45, segs: 6, up: [1, 0, 0] }));
    // a crest ridge along the top
    const ridge = [onHead(hd, 1.05, 0, 0.2), onHead(hd, 0.35, 0, 0.24), onHead(hd, 0.4, Math.PI, 0.24), onHead(hd, 1.2, Math.PI, 0.2)];
    MT(B, () => tube(B, ridge, 0.045 * r, [hi, m], { sq: 2.2, segs: 6, up: [1, 0, 0] }));
    if (hat === 'hornhelm' || (dwarfish && spec.horns)) {
      for (const s of [-1, 1]) {
        const a = onHead(hd, 1.0, s * 1.45, 0.15);
        tube(B, [a, add(a, [s * 0.55 * r, 0.2 * r, 0]), add(a, [s * 0.9 * r, 0.8 * r, -0.1 * r]), add(a, [s * 0.78 * r, 1.35 * r, -0.2 * r])], [0.28 * r, 0.22 * r, 0.13 * r, 0.02 * r], [blend(BONE, 0x8a7a5a, 0.3), BONE, 0xfff8e8], { segs: 9, cap0: false });
      }
    }
    if (spec.plume != null) {
      // a tall horsehair crest from brow to nape, the paladin's mark
      const top = [onHead(hd, 0.75, 0, 0.42), onHead(hd, 0.05, 0, 0.75), onHead(hd, 0.7, Math.PI, 0.75), onHead(hd, 1.35, Math.PI, 0.5), add(onHead(hd, 1.6, Math.PI, 0.5), [0, -0.8 * r, -0.5 * r])];
      tube(B, top, [0.05 * r, 0.11 * r, 0.11 * r, 0.08 * r, 0.02 * r], [tint(spec.plume, 1.2), spec.plume, deep(spec.plume, 0.6)], { sq: 3.0, segs: 10, steps: 20, up: [1, 0, 0] });
    }
    return { top: hd.y + 1.3 * r };
  }
  if (hat === 'hood') {
    const hc = spec.hatColor ?? 0x3a4a2a;
    const hi = tint(hc, 1.15), lo = deep(hc, 0.55);
    // a deep cowl: down to the brow at the front, to the shoulders elsewhere
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const face = (ph) => Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
    const line = (ph) => 1.05 + 1.7 * sm(0.5, 1.05, face(ph));
    shell(B, hd, {
      thB: line,
      lift: (u, v, ph) => 0.26 + 0.12 * Math.sin(v * Math.PI) + 0.05 * (1 - sm(0.4, 1.3, face(ph))),
      offset: (u, v, ph) => [0, 0, 0.16 * (1 - sm(0.3, 1.4, face(ph)))],
      col: (u, v) => blend(hi, lo, Math.min(1, v * 0.75)), nu: 30, nv: 10, lipShade: 0.4,
    });
    // a soft roll of cloth framing the face
    const rim = [];
    for (let k = 0; k <= 16; k++) {
      const ph = -1.08 + (k / 16) * 2.16;
      const th = line(ph) - 0.05;
      const p = onHead(hd, th, ph, 0.33);
      p[2] += 0.16 * hd.r * (1 - sm(0.3, 1.4, face(ph)));
      rim.push(p);
    }
    tube(B, rim, 0.11 * r, [tint(hc, 1.08), hi, tint(hc, 1.08)], { segs: 7, steps: 26 });
    // the point of the hood hanging down the back
    const a = onHead(hd, 0.9, Math.PI, 0.33);
    tube(B, [a, add(a, [0, 0.02 * r, -0.4 * r]), add(a, [0, -0.55 * r, -0.62 * r])], [0.42 * r, 0.3 * r, 0.04 * r], [hc, lo], { segs: 10 });
    return { top: hd.y + 1.32 * r, hood: true };
  }
  if (hat === 'crown' || hat === 'circlet') {
    const gold = spec.hatColor ?? GOLD;
    const y0 = hd.y + 0.42 * r;
    const R = 1.0 * r;
    MT(B, () => lathe(B, [[R * 0.98, y0], [R * 1.03, y0 + 0.08 * r], [R * 1.02, y0 + (hat === 'crown' ? 0.32 : 0.16) * r], [R * 0.96, y0 + (hat === 'crown' ? 0.36 : 0.2) * r]], [deep(gold, 0.7), tint(gold, 1.15)], { segs: 20, sq: 0.95 }));
    if (hat === 'crown') {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const p = [hd.x + Math.sin(a) * R, y0 + 0.3 * r, hd.z + Math.cos(a) * R * 0.95];
        tube(B, [p, add(p, [Math.sin(a) * 0.06 * r, 0.42 * r, Math.cos(a) * 0.06 * r])], [0.14 * r, 0.02 * r], [gold, tint(gold, 1.2)], { segs: 5, cap1: false });
        ball(B, tint(gold, 1.2), p[0] + Math.sin(a) * 0.08 * r, p[1] + 0.46 * r, p[2] + Math.cos(a) * 0.08 * r, 0.06 * r);
      }
      G.shape(TPL.ico0, 0xff4060, { x: hd.x, y: y0 + 0.18 * r, z: hd.z + R * 1.0, s: 0.18 * r });
    } else {
      G.shape(TPL.ico0, 0x80e0ff, { x: hd.x, y: y0 + 0.1 * r, z: hd.z + R * 1.0, s: 0.18 * r });
    }
    return { top: y0 + 0.6 * r };
  }
  if (hat === 'cap') {
    const hc = spec.hatColor ?? 0x6a2a5a;
    // a jaunty beret with a long plume
    const c = onHead(hd, 0.35, -0.6, 0.15);
    ball(B, hc, c[0], c[1] + 0.05 * r, c[2], 1.15 * r, 0.42 * r, 1.05 * r, { rz: 0.25, rx: -0.15 });
    lathe(B, [[0.92 * r, hd.y + 0.55 * r, 0.92 * r, 0.1 * r], [0.97 * r, hd.y + 0.66 * r, 0.97 * r, 0.1 * r], [0.9 * r, hd.y + 0.76 * r, 0.9 * r, 0.1 * r]], deep(hc, 0.7), { segs: 18 });
    const f0 = onHead(hd, 0.75, 1.2, 0.3);
    const feather = spec.feather ?? 0xf4f0e0;
    tube(B, [f0, add(f0, [0.25 * r, 0.65 * r, -0.3 * r]), add(f0, [0.4 * r, 1.3 * r, -0.9 * r]), add(f0, [0.35 * r, 1.45 * r, -1.6 * r])], [0.06 * r, 0.24 * r, 0.2 * r, 0.03 * r], [feather, tint(feather, 1.05), blend(feather, 0xd04040, 0.5)], { sq: 0.25, segs: 8, steps: 18, up: [1, 0, 0.4] });
    return { top: hd.y + 1.6 * r };
  }
  if (hat === 'mitre') {
    const hc = spec.hatColor ?? 0xf0ead8;
    const p = [[0.95 * r, hd.y + 0.35 * r], [1.0 * r, hd.y + 0.7 * r], [0.85 * r, hd.y + 1.3 * r], [0.35 * r, hd.y + 1.75 * r], [0.02, hd.y + 1.85 * r]];
    lathe(B, p.map(([a, y]) => [a, y, a * 0.7]), [hc, tint(hc, 1.05)], { segs: 16 });
    lathe(B, [[1.02 * r, hd.y + 0.35 * r, 0.78 * r], [1.04 * r, hd.y + 0.55 * r, 0.8 * r]], trim, { segs: 16 });
    return { top: hd.y + 1.85 * r };
  }
  return { top: hd.y + 1.05 * r };
}

// ---------------------------------------------------------------- weapons
// Built along +y from the grip centre (origin = the fist), in matrix M.
function weapon(B, G, kind, M, spec, size = 1) {
  const steel = spec.weaponColor ?? STEEL;
  const glow = spec.weaponGlow;
  const hilt = spec.hilt ?? GOLD;
  const grip = DARKLEATHER;
  const S = size;
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M).toArray();
  const T = (pts, rr, col, o = {}) => tube(B, pts.map((p) => at(...p)), rr, col, o);
  const X = new THREE.Vector3(1, 0, 0).transformDirection(M).toArray();
  if (kind === 'sword' || kind === 'greatsword' || kind === 'dagger') {
    const L = (kind === 'greatsword' ? 0.66 : kind === 'dagger' ? 0.2 : 0.46) * S;
    const W = (kind === 'greatsword' ? 0.085 : kind === 'dagger' ? 0.05 : 0.07) * S;
    const g0 = kind === 'dagger' ? 0.05 : 0.07;
    T([[0, -g0, 0], [0, g0 * 0.9, 0]], 0.022 * S, grip, { segs: 6 });
    MT(B, () => ball(B, hilt, ...at(0, -g0 - 0.02 * S, 0), 0.032 * S));
    // crossguard with flared ends
    MT(B, () => T([[-W * 1.1, g0 + 0.026, 0], [0, g0 + 0.01, 0], [W * 1.1, g0 + 0.026, 0]], [0.024 * S, 0.02 * S, 0.024 * S], [hilt, tint(hilt, 1.2), hilt], { segs: 6 }));
    // blade: diamond section, wide then tapering to a point
    const b0 = g0 + 0.025;
    const bl = [[0, b0, 0], [0, b0 + L * 0.5, 0], [0, b0 + L * 0.86, 0], [0, b0 + L, 0]];
    MT(B, () => T(bl, [W * 0.5, W * 0.47, W * 0.4, 0.002], glow != null ? [tint(steel, 1.0), blend(steel, glow, 0.35)] : [tint(steel, 0.92), tint(steel, 1.12)], { sq: 0.22, segs: 4, flat: true, cap: false, up: X }));
    // fuller groove
    T([[0, b0 + 0.02, 0], [0, b0 + L * 0.7, 0]], [W * 0.1, W * 0.06], tint(steel, 0.7), { sq: 1.2, segs: 4 });
    if (glow != null) {
      G.shape(GTPL.taper, glow, { matrix: new THREE.Matrix4().multiplyMatrices(M, mat(0, b0 + L * 0.02, 0, 0, 0, 0, [W * 1.1, L * 0.95, W * 0.35])) });
    }
    return;
  }
  if (kind === 'axe') {
    T([[0, -0.16 * S, 0], [0, 0.42 * S, 0]], [0.022 * S, 0.024 * S], [deep(WOOD, 0.8), WOOD], { segs: 7 });
    for (const y of [-0.05, 0.05]) T([[0, y * S, 0], [0, y * S + 0.03, 0]], 0.028 * S, grip, { segs: 7 });
    // crescent blade
    const head = [[0.02, 0.33], [0.1, 0.27], [0.2, 0.22], [0.25, 0.3], [0.27, 0.4], [0.25, 0.5], [0.2, 0.57], [0.1, 0.5], [0.02, 0.46]].map(([x, y]) => [x * S, y * S]);
    MT(B, () => extrude(B, 'axe' + S, head, [deep(steel, 0.75), steel], { depth: 0.02 * S, bevel: 0.012 * S, matrix: M, gradY: [0.25 * S, 0.5 * S], rim: 1.18 }));
    // back spike
    T([[0, 0.4 * S, 0], [-0.12 * S, 0.43 * S, 0]], [0.035 * S, 0.004], steel, { segs: 6, sq: 0.5, up: new THREE.Vector3(0, 0, 1).transformDirection(M).toArray() });
    MT(B, () => ball(B, IRON, ...at(0, 0.44 * S, 0), 0.035 * S));
    if (glow != null) G.shape(GTPL.taper, glow, { matrix: new THREE.Matrix4().multiplyMatrices(M, mat(0.16 * S, 0.24 * S, 0, 0, 0, 0, [0.16 * S, 0.3 * S, 0.03 * S])) });
    return;
  }
  if (kind === 'hammer' || kind === 'mace' || kind === 'club') {
    if (kind === 'club') {
      T([[0, -0.08 * S, 0], [0, 0.2 * S, 0.01], [0.01, 0.46 * S, 0.0]], [0.035 * S, 0.06 * S, 0.1 * S], [deep(WOOD, 0.7), blend(WOOD, 0x6a5a40, 0.4)], { segs: 9 });
      for (let k = 0; k < 5; k++) {
        const a = k * 2.4;
        T([[Math.sin(a) * 0.07 * S, (0.28 + k * 0.035) * S, Math.cos(a) * 0.07 * S], [Math.sin(a) * 0.12 * S, (0.3 + k * 0.035) * S, Math.cos(a) * 0.12 * S]], [0.025 * S, 0.003], BONE, { segs: 5 });
      }
      return;
    }
    T([[0, -0.14 * S, 0], [0, 0.36 * S, 0]], 0.022 * S, [deep(WOOD, 0.8), WOOD], { segs: 7 });
    T([[0, -0.12 * S, 0], [0, 0.0, 0]], 0.027 * S, grip, { segs: 7 });
    MT(B, () => ball(B, hilt, ...at(0, -0.15 * S, 0), 0.03 * S));
    const m = spec.weaponColor ?? IRON;
    if (kind === 'hammer') {
      // a dwarven warhammer: a big bevelled block with banded faces
      const hm = new THREE.Matrix4().multiplyMatrices(M, mat(0, 0.36 * S, 0, 0, 0, Math.PI / 2));
      MT(B, () => lathe(B, [[0.002, -0.115 * S], [0.05 * S, -0.115 * S], [0.068 * S, -0.1 * S], [0.068 * S, -0.03 * S], [0.06 * S, -0.02 * S], [0.06 * S, 0.02 * S], [0.068 * S, 0.03 * S], [0.068 * S, 0.1 * S], [0.05 * S, 0.115 * S], [0.002, 0.115 * S]], [tint(m, 1.2), tint(m, 0.95), tint(m, 1.2)], { segs: 4, keepSegs: true, matrix: hm, rot: Math.PI / 4, flat: true }));
      MT(B, () => lathe(B, [[0.072 * S, -0.075 * S], [0.072 * S, -0.045 * S]], GOLD, { segs: 4, keepSegs: true, matrix: hm, rot: Math.PI / 4, flat: true }));
      MT(B, () => lathe(B, [[0.072 * S, 0.045 * S], [0.072 * S, 0.075 * S]], GOLD, { segs: 4, keepSegs: true, matrix: hm, rot: Math.PI / 4, flat: true }));
      MT(B, () => T([[0, 0.42 * S, 0], [0, 0.5 * S, 0]], [0.03 * S, 0.002], tint(m, 1.2), { segs: 4 }));
      if (spec.runes != null) for (const s of [-1, 1]) G.shape(GTPL.box, spec.runes, { matrix: new THREE.Matrix4().multiplyMatrices(M, mat(0, 0.33 * S, s * 0.07 * S, 0, 0, 0, [0.035 * S, 0.06 * S, 0.006])) });
    } else {
      // flanged mace
      MT(B, () => ball(B, m, ...at(0, 0.38 * S, 0), 0.07 * S));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        MT(B, () => T([[Math.sin(a) * 0.04 * S, 0.3 * S, Math.cos(a) * 0.04 * S], [Math.sin(a) * 0.1 * S, 0.37 * S, Math.cos(a) * 0.1 * S], [Math.sin(a) * 0.04 * S, 0.47 * S, Math.cos(a) * 0.04 * S]], [0.01, 0.03 * S, 0.01], [tint(m, 1.2), m], { sq: 0.3, segs: 4, up: [Math.cos(a), 0, -Math.sin(a)] }));
      }
      MT(B, () => ball(B, tint(m, 1.2), ...at(0, 0.49 * S, 0), 0.025 * S));
    }
    if (glow != null) G.shape(GTPL.ball, glow, { matrix: new THREE.Matrix4().multiplyMatrices(M, mat(0, 0.38 * S, 0, 0, 0, 0, 0.13 * S)) });
    return;
  }
}

// templates for glow bits (unit, centred at the base)
const GTPL = {};

// ---------------------------------------------------------------- humanoid
export function humanoid(spec, TPL) {
  GTPL.taper ||= TPL.cone4; GTPL.box ||= TPL.box; GTPL.ball ||= TPL.sphere;
  const B = new GeoBuilder(), G = new GeoBuilder(), F = new GeoBuilder();
  F.uv = [];
  B.detail = new GeoBuilder();
  const race = RACE_LOOKS[spec.race] || RACE_LOOKS.human;
  const hsh = hashLook(spec);
  const bones = !!race.bones;
  const fair = spec.face ? spec.face === 'fair' : (!race.tusks && !bones && spec.race !== 'goblin' && hsh > 0.55 && spec.beard == null && !race.beard);
  const skin = spec.eyes != null && !race.bones ? blend(spec.skin ?? race.skin, 0x2a2a3a, 0.55) : spec.skin ?? race.skin;
  const hair = spec.hair ?? race.hair;
  const body = spec.body ?? 0x7a2a2a;
  const robe = !!spec.robe;
  const armour = spec.armor || null;
  const plate = armour === 'plate', chain = armour === 'chain', leatherA = armour === 'leather';
  const metal = plate ? STEEL : IRON;
  const trim = spec.trim ?? (plate ? GOLD : null);
  const limb = race.limb * (fair ? 0.9 : 1) * (spec.width ?? 1);
  const W = (spec.width ?? 1) * (fair ? 0.92 : 1);
  const sw = race.sw * W * (plate ? 1.04 : 1), hw = race.hw * (spec.width ?? 1) * (fair ? 1.04 : 1);
  const hunch = race.hunch || 0;
  const legs = spec.legs ?? (robe ? deep(body, 0.5) : blend(deep(body, 0.45), 0x4a3a2a, 0.5));
  const bootC = spec.boots ?? (plate ? metal : leatherA || !armour ? LEATHER : DARKLEATHER);
  const ankleY = 0.07, hipY = ankleY + race.leg, shY = hipY + race.torso;
  const shirt = bones ? skin : chain ? 0x9aa0a8 : body;
  const sleeve = bones ? skin : plate ? metal : chain ? 0x9aa0a8 : body;
  const tabard = spec.tabard ?? (plate || chain ? (spec.cape ?? body) : null);
  const bodyHi = tint(body, 1.12), bodyLo = deep(body, 0.62);

  // ---- legs and boots
  const knee = (s) => [s * (hw + 0.006), ankleY + race.leg * 0.5, 0.02];
  const legPts = (s) => [[s * hw, hipY + 0.02, 0], knee(s), [s * (hw + 0.012), ankleY + 0.01, 0]];
  for (const s of [-1, 1]) {
    const P = legPts(s);
    if (bones) {
      tube(B, P, 0.022, BONE, { segs: 6 });
      ball(B, BONE, ...P[1], 0.035);
    } else if (!robe || spec.race === 'goblin') {
      tube(B, P, [0.07 * limb, 0.064 * limb, 0.05 * limb, 0.05 * limb, 0.042 * limb], [deep(legs, 0.8), legs], { segs: 10 });
    }
    // boots: a sturdy shaft with a turned-down cuff, and a big rounded foot
    const fx = s * (hw + 0.016);
    if (race.bareFeet) {
      ball(B, skin, fx, 0.035, 0.04, 0.055 * limb, 0.04, 0.09 * limb);
      ball(B, hair ?? 0x6a4020, fx, 0.06, 0.03, 0.045 * limb, 0.03, 0.06 * limb);
    } else if (bones) {
      ball(B, BONE, fx, 0.025, 0.04, 0.035, 0.025, 0.07);
    } else if (robe) {
      // just the toes of the shoes peep out from under a robe
      ball(B, bootC, fx, 0.04, 0.07, 0.055 * limb, 0.045, 0.085 * limb, { grad: 0.3 });
      ball(B, deep(bootC, 0.45), fx, 0.012, 0.07, 0.058 * limb, 0.014, 0.088 * limb);
    } else {
      const bh = 0.06 + race.leg * 0.34;
      const shaftTop = lerp3(P[2], P[1], (bh - ankleY) / (P[1][1] - ankleY));
      tube(B, [[fx, 0.05, 0.0], shaftTop], [0.05 * limb, 0.056 * limb], [deep(bootC, 0.7), bootC], { segs: 10, cap1: false });
      if (!plate) tube(B, [add(shaftTop, [0, -0.02, 0]), add(shaftTop, [0, 0.012, 0.004])], [0.064 * limb, 0.07 * limb], tint(bootC, 1.15), { segs: 10 });
      else MT(B, () => ball(B, tint(metal, 1.1), ...add(P[1], [0, 0, 0.035]), 0.05 * limb, 0.05 * limb, 0.04 * limb));
      ball(B, bootC, fx, 0.045, 0.05, 0.06 * limb, 0.05, 0.105 * limb, { grad: 0.45 });
      ball(B, deep(bootC, 0.45), fx, 0.012, 0.045, 0.062 * limb, 0.016, 0.1 * limb);
    }
  }

  // ---- torso
  const chestZ = plate ? 0.018 : 0.01;
  const bellyK = race.belly || 0;
  if (bones) {
    // spine, ribs, pelvis
    tube(B, [[0, hipY, -0.03], [0, hipY + 0.12, -0.05], [0, shY + 0.02, -0.03]], 0.022, BONE, { segs: 6 });
    for (let k = 0; k < 4; k++) {
      const y = shY - 0.04 - k * 0.045, R = sw * (0.82 - k * 0.07);
      const pts = [];
      for (let a = -2.6; a <= 2.6; a += 0.4) pts.push([Math.sin(a) * R, y - Math.abs(a) * 0.006, Math.cos(a) * R * 0.62 - 0.03]);
      tube(B, pts, 0.014, BONE, { segs: 5, steps: 20 });
    }
    tube(B, [[0, shY - 0.02, 0.06], [0, shY - 0.15, 0.055]], 0.016, BONE, { segs: 5 });
    ball(B, BONE, 0, hipY + 0.01, -0.01, hw + 0.03, 0.045, 0.06);
    tube(B, [[-sw, shY - 0.01, -0.02], [0, shY + 0.01, 0.02], [sw, shY - 0.01, -0.02]], 0.017, BONE, { segs: 5 });
    // a rotten loincloth and belt
    lathe(B, [[hw + 0.04, hipY + 0.03], [hw + 0.045, hipY - 0.12, null]], [0x4a3a2a, 0x3a2e22], { segs: 10, sq: 0.8 });
  } else {
    const wr = (fair ? 0.86 : 1);
    const prof = [
      [hw + 0.03, hipY - 0.04, 0.075],
      [hw + 0.045, hipY + 0.03, 0.085],
      [(hw + 0.03) * wr + bellyK * 0.4, hipY + 0.09, 0.078 + bellyK, bellyK * 0.5],
      [sw * (fair ? 0.86 : 0.95) + bellyK * 0.3, hipY + race.torso * 0.6, 0.1 + bellyK * 0.4, chestZ],
      [sw * 1.0, shY - 0.035, 0.095, chestZ * 0.6],
      [sw * 0.8, shY + 0.01, 0.075],
      [0.05, shY + 0.04, 0.045],
    ].map(([a, y, b, dz = 0]) => [a, y, b, dz + hunch * Math.max(0, (y - hipY) / race.torso) * 0.6]);
    const torsoCol = plate ? [deep(metal, 0.7), metal, tint(metal, 1.2)] : chain ? [deep(shirt, 0.7), shirt] : leatherA ? [deep(LEATHER, 0.7), LEATHER, tint(LEATHER, 1.1)] : [bodyLo, body, bodyHi];
    MT(B, () => lathe(B, prof, torsoCol, { segs: 16 }), plate || chain);
    if (bellyK) ball(B, leatherA ? LEATHER : body, 0, hipY + 0.1, 0.035 + bellyK, sw * 0.62, 0.1, 0.07);
    // chest plate details: a raised breastplate with a central ridge
    if (plate) {
      MT(B, () => ball(B, tint(metal, 1.12), 0, hipY + race.torso * 0.62, 0.035 + hunch * 0.4, sw * 0.78, race.torso * 0.36, 0.08));
      if (trim != null) lathe(B, [[sw * 0.73, shY + 0.0, 0.074], [sw * 0.7, shY + 0.02, 0.07]], trim, { segs: 16 });
    }
    if (leatherA) {
      // laced front
      for (let k = 0; k < 3; k++) tube(B, [[-0.03, hipY + 0.1 + k * 0.045, 0.098], [0.03, hipY + 0.12 + k * 0.045, 0.098]], 0.006, 0xd8c8a0, { segs: 4 });
    }
    if (!plate && !chain && !leatherA && !robe) {
      // a tunic's V-neck in a lighter undershirt
      ball(B, blend(body, 0xf0e4c8, 0.55), 0, shY - 0.025, 0.06 + hunch * 0.5, 0.045, 0.035, 0.02);
    }
    if (tabard != null) {
      // tabard over mail/plate: front and back panels down to the knees
      for (const zs of [1, -1]) {
        sheet(B, (u, v) => {
          const x = (u - 0.5) * (sw * 1.0 - v * 0.03);
          const y = shY - 0.02 - v * (race.torso + race.leg * 0.45);
          const z = zs * (0.1 + (v < 0.55 ? Math.sin((v / 0.55) * Math.PI * 0.5) * 0.015 : 0.015 + (v - 0.55) * 0.1)) + hunch * (1 - v) * 0.5;
          return [x, y, z];
        }, [tint(tabard, 1.1), tabard, deep(tabard, 0.7)], { nu: 3, nv: 8, thick: 0.01, flipN: zs > 0 });
      }
      if (trim != null) for (const zs of [1, -1]) tube(B, [[-sw * 0.5, hipY - race.leg * 0.45 + 0.01, zs * 0.155], [sw * 0.5, hipY - race.leg * 0.45 + 0.01, zs * 0.155]], 0.009, trim, { segs: 5 });
    }
  }

  // ---- skirts and robes
  if (robe) {
    // a full robe: bell from the waist to the ground, with a trimmed hem
    const flare = 1 + (spec.race === 'dwarf' ? 0.1 : 0);
    const rp = [[hw + 0.05, hipY + 0.1, 0.085], [hw + 0.065, hipY - 0.02, 0.095], [(hw + 0.09) * flare, hipY * 0.45, 0.115], [(hw + 0.13) * flare, 0.03, 0.14], [(hw + 0.12) * flare, 0.0, 0.13]];
    lathe(B, rp, [bodyLo, body, bodyHi].reverse(), { segs: 18, colAt: (t) => blend(bodyLo, body, Math.min(1, t * 1.6)) });
    if (trim != null) {
      lathe(B, [[(hw + 0.133) * flare, 0.0, 0.143], [(hw + 0.133) * flare, 0.04, 0.143], [(hw + 0.125) * flare, 0.05, 0.137]], trim, { segs: 18 });
      // a trimmed front panel
      sheet(B, (u, v) => {
        const y = hipY + 0.08 - v * (hipY + 0.06);
        const rz = 0.087 + (0.145 - 0.087) * Math.min(1, v * 1.1);
        return [(u - 0.5) * 0.06 * (1 + v * 0.8), y, rz + 0.004];
      }, trim, { nu: 1, nv: 5, thick: 0.006, flipN: true });
    }
  } else if (!bones) {
    // a short skirt or tunic flaps over the thighs
    const sk = plate ? [tint(metal, 1.1), deep(metal, 0.7)] : chain ? [0x9aa0a8, 0x70767e] : [body, deep(body, 0.7)];
    const len = race.leg * (plate || chain ? 0.36 : 0.27);
    MT(B, () => lathe(B, [[hw + 0.05, hipY + 0.06, 0.088], [hw + 0.06, hipY - 0.02, 0.095], [hw + 0.085, hipY - len, 0.112]], sk, { segs: 16 }), plate || chain);
    // a hem band: the trim colour, or a lighter, warmer shade of the cloth
    const hem = trim ?? (plate || chain ? null : tint(blend(body, 0xf0d890, 0.3), 1.12));
    if (hem != null && !tabard) MT(B, () => lathe(B, [[hw + 0.087, hipY - len - 0.002, 0.114], [hw + 0.085, hipY - len + 0.022, 0.113]], hem, { segs: 16 }), trim != null && trim === GOLD);
  }
  // belt with a buckle
  if (!bones) {
    const by = hipY + 0.05, br = (fair ? 0.86 : 1) * (hw + 0.04) + bellyK * 0.4;
    lathe(B, [[br + 0.006, by - 0.022, 0.088 + bellyK + 0.004, bellyK * 0.5], [br + 0.01, by, 0.092 + bellyK + 0.004, bellyK * 0.5], [br + 0.006, by + 0.022, 0.088 + bellyK + 0.004, bellyK * 0.5]], spec.sash ?? (robe ? (trim ?? DARKLEATHER) : DARKLEATHER), { segs: 16 });
    MT(B, () => ball(B, GOLD, 0, by, 0.098 + bellyK * 1.5 + hunch * 0.2, 0.028, 0.024, 0.012));
    // a pouch at the hip
    if (!robe) ball(B, LEATHER, -(br + 0.0), by - 0.04, 0.04, 0.025, 0.035, 0.03);
  }

  // ---- arms
  const wpn = spec.weapon || 'none';
  const ranged = spec.ranged || null;
  const longArm = race.longArms ? 0.05 : 0;
  const S = (s) => [s * sw, shY - 0.025, hunch * 0.6];
  let RH, LH, RE, LE;
  const planted = wpn === 'staff' || wpn === 'spear';
  // right (weapon) hand
  if (planted) { RE = [sw + 0.05, shY - 0.13, 0.0 + hunch * 0.5]; RH = [sw + 0.075, hipY + 0.11, 0.06]; }
  else if (wpn === 'bow' || wpn === 'crossbow') { RE = [sw + 0.04, shY - 0.15, -0.03]; RH = [sw + 0.02, hipY + 0.04 - longArm, 0.07]; }
  else { RE = [sw + 0.05, shY - 0.15 - longArm * 0.5, -0.04 + hunch * 0.5]; RH = [sw + 0.035, hipY + 0.03 - longArm, 0.1 + hunch * 0.6]; }
  // left hand: shield arm, bow arm or relaxed
  const hasShield = spec.shield != null && spec.shield !== false && wpn !== 'bow' && wpn !== 'crossbow';
  if (wpn === 'bow') { LE = [-(sw + 0.08), shY - 0.11, 0.03]; LH = [-(sw + 0.13), hipY + 0.12, 0.1]; }
  else if (hasShield) { LE = [-(sw + 0.05), shY - 0.15, -0.02 + hunch * 0.5]; LH = [-(sw + 0.02), hipY + 0.07, 0.11 + hunch * 0.5]; }
  else { LE = [-(sw + 0.045), shY - 0.15 - longArm * 0.5, -0.025 + hunch * 0.5]; LH = [-(sw + 0.06), hipY - 0.0 - longArm, 0.04 + hunch * 0.5]; }
  const sleeveR = bones ? 0.02 : 0.058 * limb;
  for (const [s, E, H] of [[1, RE, RH], [-1, LE, LH]]) {
    const sh = S(s);
    if (bones) {
      tube(B, [sh, E, H], 0.018, BONE, { segs: 6 });
      ball(B, BONE, ...E, 0.028);
      ball(B, BONE, ...sh, 0.04);
    } else {
      // deltoid, upper arm and forearm in one smooth sweep
      ball(B, sleeve, sh[0] + s * 0.004, sh[1] + 0.004, sh[2], sleeveR * 1.2, sleeveR * 1.12, sleeveR * 1.15);
      const wideSleeve = robe && !plate;
      tube(B, [sh, E, lerp3(E, H, 0.78)], wideSleeve ? [sleeveR, sleeveR * 1.0, sleeveR * 1.25, sleeveR * 1.5] : [sleeveR, sleeveR * 0.9, sleeveR * 0.85, sleeveR * 0.75], wideSleeve ? [body, tint(body, 0.9)] : [sleeve, plate ? tint(metal, 1.1) : deep(sleeve, 0.85)], { segs: 10, cap1: !wideSleeve });
      if (wideSleeve) {
        // the bell of the sleeve, dark inside, trimmed at the cuff
        tube(B, [lerp3(E, H, 0.7), lerp3(E, H, 0.79)], [sleeveR * 1.42, sleeveR * 1.55], trim ?? tint(body, 1.15), { segs: 10, cap0: false });
        ball(B, deep(body, 0.35), ...lerp3(E, H, 0.8), sleeveR * 1.3, sleeveR * 1.3, sleeveR * 1.3);
      }
      // bracers / gauntlets with a flared cuff
      const gaunt = plate || spec.pauldrons === 'plate';
      const brC = gaunt ? (plate ? metal : STEEL) : leatherA || chain || spec.pauldrons ? LEATHER : null;
      if (brC != null && !wideSleeve) {
        MT(B, () => tube(B, [lerp3(E, H, 0.25), lerp3(E, H, 0.8)], [sleeveR * 0.95, sleeveR * 1.05], [deep(brC, 0.8), brC], { segs: 10 }), gaunt);
        MT(B, () => tube(B, [lerp3(E, H, 0.72), lerp3(E, H, 0.86)], [sleeveR * 1.15, sleeveR * 1.32], tint(brC, 1.12), { segs: 10, cap1: false }), gaunt);
      }
      // a big fist (gloved for armoured folk)
      const fist = gaunt ? metal : (leatherA || chain) && !robe ? DARKLEATHER : skin;
      const hr = 0.043 * Math.max(0.9, limb);
      MT(B, () => ball(B, fist, H[0], H[1], H[2], hr * 1.0, hr * 1.12, hr * 1.1), gaunt);
      MT(B, () => ball(B, fist, H[0] - s * hr * 0.3, H[1] + hr * 0.25, H[2] + hr * 0.55, hr * 0.42), gaunt);
    }
  }

  // ---- pauldrons
  const pd = spec.pauldrons ?? (plate ? 'plate' : chain ? 'leather' : leatherA ? 'leather' : race.tusks && !bones ? 'spiked' : null);
  if (pd && !bones && !(robe && !plate && !spec.pauldrons)) {
    for (const s of [-1, 1]) {
      const sh = S(s);
      const big = pd === 'plate' ? 1.0 : pd === 'spiked' ? 0.9 : 0.85;
      const pc = pd === 'plate' ? (plate ? metal : STEEL) : pd === 'spiked' ? 0x5a4a3a : LEATHER;
      const R = 0.1 * big * Math.max(1, limb * 0.9);
      const c = [sh[0] + s * 0.02, sh[1] + 0.025, sh[2]];
      // a domed shell with a rolled, trimmed lip, and a second lame below it
      const isPlate = pd === 'plate';
      const lip = isPlate && trim != null ? trim : pd === 'spiked' ? IRON : tint(pc, 0.8);
      const dome = (m, k, col) => {
        MT(B, () => lathe(B, [[0.002, R * 0.78 * k], [R * 0.55 * k, R * 0.72 * k], [R * 0.88 * k, R * 0.45 * k], [R * 1.02 * k, R * 0.08 * k], [R * 1.02 * k, -R * 0.06 * k]], [tint(col, 0.85), tint(col, 1.15)], { segs: 14, sq: 1.08, matrix: m }), isPlate);
        MT(B, () => lathe(B, [[R * 1.0 * k, -R * 0.1 * k], [R * 1.1 * k, -R * 0.03 * k], [R * 1.08 * k, R * 0.08 * k], [R * 0.98 * k, R * 0.12 * k]], lip, { segs: 14, sq: 1.08, matrix: m }), isPlate || pd === 'spiked');
      };
      dome(mat(c[0] + s * R * 0.32, c[1] - R * 0.42, c[2], 0, 0, -s * 0.95), 0.8, deep(pc, 0.9));
      dome(mat(c[0], c[1] - R * 0.1, c[2], 0, 0, -s * 0.5), 1, pc);
      if (pd === 'spiked') {
        for (let k = -1; k <= 1; k++) tube(B, [[c[0] + s * R * 0.25, c[1] + R * 0.45, c[2] + k * R * 0.5], [c[0] + s * R * 0.8, c[1] + R * 1.3, c[2] + k * R * 0.65]], [R * 0.2, 0.002], BONE, { segs: 6 });
      }
    }
  }

  // ---- neck and head
  const headR = race.headR * (fair ? 0.97 : 1);
  setHeadTilt(bones ? 0.05 : 0.2);
  const hd = { x: 0, y: shY + 0.03 + headR * 1.12 - hunch * 0.5, z: hunch * 1.6 + 0.005, r: headR, shape: race.shape };
  if (!bones && race.shape === 'hero') hd.shape = fair ? 'fair' : (spec.pauldrons || plate) ? 'strong' : 'hero';
  if (race.shape === 'elf') hd.shape = 'elf';
  if (!bones) tube(B, [[0, shY - 0.02, hunch * 0.6], [0, hd.y - headR * 0.6, hd.z - 0.01]], 0.045 * Math.max(0.85, limb * 0.9), [deep(skin, 0.8), skin], { segs: 10 });
  else tube(B, [[0, shY, -0.02], [0, hd.y - headR * 0.7, hd.z - 0.02]], 0.016, BONE, { segs: 5 });
  // face paint choice
  const elfish = spec.race === 'elf';
  const row = bones ? null : race.shape === 'orc' ? FACE_ROWS.orc : race.shape === 'goblin' ? FACE_ROWS.goblin : race.shape === 'troll' ? FACE_ROWS.troll
    : elfish ? (fair ? FACE_ROWS.elfFair : FACE_ROWS.elf) : fair ? FACE_ROWS.fair : FACE_ROWS.bold;
  const irisPool = elfish ? [1, 2, 5, 3] : [0, 0, 1, 2, 3, 4];
  const iris = spec.iris ?? irisPool[Math.floor(hashLook({ ...spec, race: 'x' + spec.race }) * irisPool.length)];
  const browName = race.shape === 'orc' || race.shape === 'goblin' || race.shape === 'troll' ? 'angry' : spec.race === 'dwarf' ? 'bushy' : elfish ? (fair ? 'fair' : 'elf') : fair ? 'fair' : 'bold';
  const browCol = row == null ? null : race.tusks || race.shape === 'goblin' ? deep(skin, 0.35) : hair != null ? deep(hair, (hair & 0xff) > 0xa0 ? 0.7 : 0.8) : 0x3a2a1a;
  sculptHead(B, spec.eyes != null && !bones ? null : F, {
    x: hd.x, y: hd.y, z: hd.z, r: headR, skin: bones ? BONE : skin, shape: hd.shape,
    row, iris, brow: row == null ? null : BROWS[browName], browColor: browCol,
    blush: bones || race.tusks || spec.eyes != null || race.shape === 'goblin' ? 0 : fair ? 0.32 : 0.2,
  });
  const r = headR;
  // nose, ears, tusks
  if (bones) {
    for (const s of [-1, 1]) {
      const e = onHead(hd, 1.55, s * 0.36, -0.02);
      ball(B, 0x1a1210, e[0], e[1], e[2], 0.2 * r, 0.22 * r, 0.12 * r);
      G.shape(TPL.sphere, spec.eyes ?? 0xff5030, { x: e[0], y: e[1], z: e[2] + 0.02 * r, s: 0.16 * r });
    }
    const n = onHead(hd, 1.95, 0, 0);
    ball(B, 0x2a1e18, n[0], n[1], n[2], 0.08 * r, 0.1 * r, 0.06 * r);
    for (let k = -2; k <= 2; k++) {
      const t = onHead(hd, 2.3, k * 0.13, 0.0);
      ball(B, 0xfff8e4, t[0], t[1], t[2], 0.065 * r, 0.09 * r, 0.05 * r);
    }
  } else {
    if (spec.eyes != null) {
      // glowing eyes in place of painted ones (undead, the possessed)
      for (const s of [-1, 1]) {
        const e = onHead(hd, 1.57, s * 0.4, 0.04);
        ball(B, 0x140c10, e[0], e[1], e[2], 0.18 * r, 0.12 * r, 0.1 * r);
        G.shape(TPL.sphere, spec.eyes, { x: e[0], y: e[1], z: e[2] + 0.03 * r, sx: 0.3 * r, sy: 0.2 * r, sz: 0.14 * r });
      }
    }
    const nose = race.nose;
    if (nose === 'goblin') {
      const a = onHead(hd, 1.75, 0, 0.0);
      tube(B, [a, add(a, [0, -0.1 * r, 0.45 * r]), add(a, [0, -0.3 * r, 0.75 * r])], [0.2 * r, 0.14 * r, 0.04 * r], [skin, tint(skin, 1.05)], { segs: 8 });
    } else if (nose === 'troll') {
      const a = onHead(hd, 1.7, 0, 0.0);
      tube(B, [a, add(a, [0, -0.2 * r, 0.45 * r]), add(a, [0, -0.55 * r, 0.6 * r])], [0.22 * r, 0.2 * r, 0.14 * r], [skin, deep(skin, 0.9)], { segs: 8 });
    } else if (race.shape === 'orc') {
      const a = onHead(hd, 1.82, 0, -0.02);
      ball(B, deep(skin, 0.9), a[0], a[1], a[2] + 0.05 * r, 0.24 * r, 0.14 * r, 0.14 * r);
    } else {
      // a small, soft button nose
      const a = onHead(hd, 1.8, 0, -0.06);
      ball(B, tint(skin, 1.02), a[0], a[1], a[2] + 0.04 * r, (fair ? 0.1 : 0.12) * r, (fair ? 0.09 : 0.11) * r, 0.1 * r);
    }
    const ears = race.ears || 'human';
    for (const s of [-1, 1]) {
      const e = onHead(hd, 1.62, s * 1.52, -0.05);
      if (ears === 'elf') {
        tube(B, [e, add(e, [s * 0.35 * r, 0.25 * r, -0.12 * r]), add(e, [s * 0.85 * r, 0.62 * r, -0.3 * r])], [0.2 * r, 0.14 * r, 0.015 * r], [skin, tint(skin, 0.95)], { sq: 0.4, segs: 8, up: [0, 1, 0] });
      } else if (ears === 'goblin') {
        tube(B, [e, add(e, [s * 0.6 * r, 0.12 * r, -0.12 * r]), add(e, [s * 1.35 * r, 0.32 * r, -0.2 * r])], [0.3 * r, 0.32 * r, 0.02 * r], [skin, blend(skin, 0xd08080, 0.25)], { sq: 0.3, segs: 8, up: [0, 1, 0] });
      } else if (ears === 'orc' || ears === 'troll') {
        const L = ears === 'troll' ? 1.0 : 0.45;
        tube(B, [e, add(e, [s * 0.3 * L * r, 0.12 * r, -0.12 * r]), add(e, [s * 0.75 * L * r, (ears === 'troll' ? -0.05 : 0.3) * r, -0.28 * r])], [0.2 * r, 0.16 * r, 0.02 * r], skin, { sq: 0.4, segs: 8, up: [0, 1, 0] });
      } else {
        ball(B, tint(skin, 0.95), e[0] + s * 0.04 * r, e[1], e[2], 0.12 * r, 0.2 * r, 0.12 * r);
      }
    }
    if (race.tusks) {
      for (const s of [-1, 1]) {
        const t = onHead(hd, 2.35, s * 0.32, 0.02);
        tube(B, [t, add(t, [s * 0.05 * r, 0.25 * r, 0.12 * r]), add(t, [s * 0.02 * r, 0.42 * r, 0.06 * r])], [0.1 * r, 0.08 * r, 0.015 * r], [0xe8dcbc, 0xfff8e8], { segs: 7, cap0: false });
      }
    }
  }

  // ---- hair, beard, headgear
  const hat = spec.hat || 'none';
  const style = spec.hairStyle || (race.mohawk ? 'mohawk' : race.longHair ? 'long' : race.curly ? 'short' : hsh < 0.18 ? 'long' : hsh > 0.82 ? 'ponytail' : 'short');
  const covered = hat === 'hood' || hat === 'helm' || hat === 'hornhelm' || hat === 'mitre';
  if (!bones) {
    const hstyle = covered && (style === 'mohawk' || style === 'topknot' || style === 'ponytail') ? 'short' : style;
    if (!(covered && hat !== 'helm' && hat !== 'hornhelm')) buildHair(B, hd, hstyle, hair, race, { covered, fair });
    else if (hat === 'hood' && (style === 'long' || style === 'braids')) {
      // long hair spilling out of the hood
      for (const s of [-1, 1]) {
        const a = onHead(hd, 1.5, s * 1.0, 0.18);
        tube(B, [a, add(a, [s * 0.05 * r, -0.6 * r, 0.12 * r]), add(a, [s * 0.04 * r, -1.2 * r, 0.12 * r])], [0.22 * r, 0.2 * r, 0.06 * r], [hair, deep(hair, 0.66)], { sq: 0.6, segs: 8 });
      }
    }
    const beard = spec.beard === true ? hair : spec.beard ?? (race.beard ? hair : null);
    if (beard != null && beard !== false) buildBeard(B, hd, beard, !!race.beard, race);
  }
  const hg = buildHeadgear(B, G, hd, spec, TPL);

  // ---- cape (and the cleric's mantle)
  if (spec.cape != null && !bones) {
    const cc = spec.cape;
    const top = shY + 0.015, bot = robe ? 0.04 : 0.1;
    const bz = 0.125 + hunch * 0.6;
    // draped over the shoulders, wrapping round the back, falling in folds
    sheet(B, (u, v) => {
      const a = (u - 0.5) * 2;
      const wv = sw * (1.0 + v * 0.5);
      const fold = Math.sin(u * Math.PI * 6) * 0.014 * v;
      const z = -(0.035 + (bz - 0.035) * (1 - a * a)) - v * (robe ? 0.1 : 0.075) + fold + hunch * (1 - v) * 0.6;
      return [a * wv, top - v * (top - bot) - (1 - a * a) * 0.012, z];
    }, [tint(cc, 1.08), cc, deep(cc, 0.62)], { nu: 12, nv: 7, thick: 0.014, back: deep(cc, 0.7) });
    // a collar and clasps
    tube(B, [[-sw * 0.92, top + 0.005, -0.04 + hunch * 0.6], [0, top + 0.03, -0.12 + hunch * 0.6], [sw * 0.92, top + 0.005, -0.04 + hunch * 0.6]], 0.03, [cc, tint(cc, 1.1), cc], { segs: 7 });
    if (!pd) for (const s of [-1, 1]) MT(B, () => ball(B, GOLD, s * sw * 0.7, top, 0.06 + hunch * 0.6, 0.022));
  }
  if (spec.scarf != null && !bones) {
    lathe(B, [[0.07, shY - 0.0, 0.07, 0.01 + hunch * 0.6], [0.085, shY + 0.03, 0.085, 0.01 + hunch * 0.6], [0.07, shY + 0.06, 0.07, 0.012 + hunch * 0.6]], [spec.scarf, tint(spec.scarf, 1.15)], { segs: 12 });
    tube(B, [[-0.05, shY + 0.02, 0.07], [-0.07, shY - 0.06, 0.1], [-0.06, shY - 0.13, 0.11]], [0.03, 0.026, 0.018], [spec.scarf, deep(spec.scarf, 0.7)], { sq: 0.4, segs: 6, up: [1, 0, 0] });
  }
  if (spec.mantle != null && !bones) {
    lathe(B, [[0.05, shY + 0.05, 0.05], [sw * 0.8, shY + 0.01, 0.12], [sw * 1.2, shY - 0.06, 0.15], [sw * 1.22, shY - 0.09, 0.155]], [tint(spec.mantle, 1.1), spec.mantle], { segs: 18 });
  }

  // ---- weapons, shield and things carried on the back
  const inHand = (H, rx, rz, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(...H), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const big = race.tusks ? 1.15 : spec.race === 'goblin' ? 0.85 : spec.race === 'dwarf' ? 1.15 : 1.08;
  if (['sword', 'greatsword', 'dagger', 'axe', 'hammer', 'mace', 'club'].includes(wpn)) {
    const tilt = wpn === 'greatsword' ? -0.35 : wpn === 'club' ? -0.1 : -0.3;
    weapon(B, G, wpn, inHand(RH, tilt, -0.42), spec, big * (wpn === 'club' ? 1.25 : 1));
  } else if (planted) {
    const top = Math.max(hg.top + 0.05, hd.y + headR * 1.6);
    const base = [RH[0] + 0.03, 0.0, RH[2] + 0.01];
    const tip = [RH[0] + 0.005, top, RH[2] - 0.01];
    if (wpn === 'staff') {
      // a gnarled staff ending in a crook that cradles a glowing orb
      tube(B, [base, lerp3(base, tip, 0.35), lerp3(base, tip, 0.7), tip], [0.022, 0.024, 0.026, 0.032], [deep(spec.weaponColor ?? WOOD, 0.7), spec.weaponColor ?? WOOD], { segs: 7 });
      const crook = [tip, add(tip, [0.04, 0.07, 0]), add(tip, [0.0, 0.14, 0]), add(tip, [-0.045, 0.1, 0])];
      tube(B, crook, [0.032, 0.026, 0.02, 0.012], spec.weaponColor ?? WOOD, { segs: 7 });
      G.shape(TPL.ico1, spec.weaponGlow ?? 0x8ad0ff, { x: tip[0], y: tip[1] + 0.065, z: tip[2], s: 0.085 });
      G.shape(TPL.ico1, 0xffffff, { x: tip[0] - 0.012, y: tip[1] + 0.078, z: tip[2] + 0.02, s: 0.03 });
    } else {
      tube(B, [base, tip], [0.018, 0.02], [deep(WOOD, 0.8), WOOD], { segs: 7 });
      // leaf blade and a pennant
      const bl = [tip, add(tip, [0, 0.07, 0]), add(tip, [0, 0.16, 0]), add(tip, [0, 0.21, 0])];
      MT(B, () => tube(B, bl, [0.03, 0.04, 0.022, 0.001], [STEEL, tint(STEEL, 1.15)], { sq: 0.25, segs: 4, flat: true, cap: false, up: [1, 0, 0] }));
      MT(B, () => lathe(B, [[0.026, tip[1] - 0.04], [0.03, tip[1] + 0.005]], GOLD, { dx: () => tip[0], segs: 8 }));
      const pc = spec.pennant ?? spec.shield ?? 0xb03030;
      sheet(B, (u, v) => [tip[0] + 0.01 + u * 0.16, tip[1] - 0.05 - v * 0.08 + u * 0.02 - u * v * 0.03, tip[2] - 0.005 + Math.sin(u * 4) * 0.012], [pc, deep(pc, 0.7)], { nu: 4, nv: 1, thick: 0.006 });
    }
  } else if (wpn === 'bow') {
    bow(B, inHand(LH, -0.25, 0.12, 1.25), spec.weaponColor ?? 0xa0703a, 0.42);
  } else if (wpn === 'crossbow') {
    crossbow(B, inHand([RH[0] - 0.06, RH[1] + 0.03, RH[2] + 0.05], -0.15, 0), spec.weaponColor ?? 0x7a5030);
  } else if (wpn === 'sling') {
    tube(B, [RH, add(RH, [0.01, -0.08, 0.01]), add(RH, [0.0, -0.16, 0.02])], 0.006, 0x8a6a42, { segs: 4 });
    ball(B, 0x8a6a42, ...add(RH, [0, -0.17, 0.02]), 0.025);
  }
  if (spec.offhand === 'dagger' && !hasShield && wpn !== 'bow') weapon(B, G, 'dagger', inHand(LH, -0.3, 0.42), spec, big);
  if (hasShield) shield(B, G, spec, [LH[0] - 0.05, LH[1] + 0.05, LH[2] + 0.06], big);
  // quiver for archers; a bow, crossbow or sling carried as a second weapon
  const archer = wpn === 'bow' || wpn === 'crossbow' || ranged === 'bow' || ranged === 'crossbow';
  if (archer && !bones) {
    const q0 = [sw * 0.55, hipY + 0.06, -0.12 - hunch * 0.2], q1 = [-sw * 0.35, shY + 0.07, -0.13 + hunch * 0.3];
    tube(B, [q0, q1], [0.045, 0.052], [deep(LEATHER, 0.7), LEATHER], { segs: 9, cap1: false });
    lathe(B, [[0.054, -0.02], [0.054, 0.02]], GOLD, { matrix: along(q1, add(q1, [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]])), segs: 9 });
    for (let k = 0; k < 4; k++) {
      const off = [(k - 1.5) * 0.016, 0, (k % 2) * 0.016];
      const a = add(q1, off), b = add(a, [(q1[0] - q0[0]) * 0.22, (q1[1] - q0[1]) * 0.22, (q1[2] - q0[2]) * 0.22]);
      tube(B, [a, b], [0.016, 0.004], k % 2 ? 0xf0e8d8 : 0xc03a2a, { sq: 0.3, segs: 4 });
    }
  }
  if (ranged && ranged !== wpn && !bones) {
    if (ranged === 'bow') bow(B, mat(-0.01, hipY + race.torso * 0.5, -0.14 - hunch * 0.2, 0, 0, -0.75), spec.weaponColor ?? 0xa0703a, 0.3);
    else if (ranged === 'crossbow') crossbow(B, mat(0.0, hipY + race.torso * 0.55, -0.15, Math.PI / 2, 0, 0.7), 0x7a5030);
    else if (ranged === 'sling') ball(B, 0x8a6a42, -(hw + 0.07), hipY + 0.02, 0.06, 0.03, 0.035, 0.025);
  }
  if (spec.back === 'lute' && !bones) {
    const m = mat(0.02, hipY + race.torso * 0.45, -0.15 - hunch * 0.3, 0, 0, 0.6);
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).toArray();
    ball(B, 0xb07a3a, ...at(0, 0, 0), 0.085, 0.11, 0.04, { matrix: null, rz: 0.6 });
    ball(B, 0x3a2414, ...at(0, 0.02, -0.03), 0.025, 0.025, 0.01);
    tube(B, [at(0, 0.08, -0.01), at(0, 0.3, -0.01)], 0.016, 0x6a4020, { segs: 6 });
    tube(B, [at(0, 0.3, -0.01), at(0, 0.36, -0.03)], [0.022, 0.02], 0x5a3418, { segs: 6, sq: 0.5 });
  }

  setHeadTilt(0);
  const height = Math.max(hg.top, hd.y + headR * 1.1);
  return { B, G, F, height, head: [hd.x, hd.y, hd.z, headR] };
}

// a recurve bow, upright in matrix M (grip at the origin)
function bow(B, M, wood, H) {
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M).toArray();
  for (const s of [1, -1]) {
    const pts = [[0, 0, 0], [0, s * H * 0.4, -0.035], [0, s * H * 0.85, -0.085], [0, s * H, -0.06]].map((p) => at(...p));
    tube(B, pts, [0.028, 0.024, 0.017, 0.01], [deep(wood, 0.8), tint(wood, 1.15)], { segs: 6, sq: 0.75 });
    MT(B, () => ball(B, GOLD, ...at(0, s * H, -0.06), 0.016));
  }
  tube(B, [at(0, -0.04, 0.003), at(0, 0.04, 0.003)], 0.025, DARKLEATHER, { segs: 6 });
  tube(B, [at(0, H * 0.98, -0.065), at(0, -H * 0.98, -0.065)], 0.004, 0xf0ead8, { segs: 3, steps: 2, cap: false });
}

function crossbow(B, M, wood) {
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M).toArray();
  tube(B, [at(0, 0, -0.08), at(0, 0, 0.24)], [0.032, 0.026], [deep(wood, 0.8), wood], { segs: 6, sq: 0.7 });
  tube(B, [at(-0.17, 0, 0.17), at(0, 0.01, 0.21), at(0.17, 0, 0.17)], [0.012, 0.02, 0.012], [IRON, STEEL, IRON], { segs: 6 });
  tube(B, [at(-0.17, 0, 0.17), at(0, 0.02, 0.04), at(0.17, 0, 0.17)], 0.0035, 0xf0ead8, { segs: 3, steps: 2, cap: false });
}

// shield on the left forearm, facing forward and a little outward
function shield(B, G, spec, c, big) {
  const col = spec.shield;
  const kind = spec.shieldShape ?? (spec.armor === 'plate' ? 'kite' : 'round');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, -0.5, 0, 'YXZ')), new THREE.Vector3(big, big, big));
  const rimC = spec.armor === 'plate' || kind === 'kite' ? GOLD : IRON;
  if (kind === 'kite') {
    const outline = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); outline.push([Math.cos(a) * 0.15, 0.08 + Math.sin(a) * 0.06]); }
    outline.push([-0.15, 0.0], [-0.12, -0.12], [-0.05, -0.22], [0, -0.26], [0.05, -0.22], [0.12, -0.12], [0.15, 0.0]);
    const ol = outline.map(([x, y]) => [x, y]).reverse();
    MT(B, () => extrude(B, 'kiteRim', ol.map(([x, y]) => [x * 1.08, y * 1.06]), rimC, { depth: 0.02, bevel: 0.01, matrix: m }));
    extrude(B, 'kite', ol, [deep(col, 0.75), tint(col, 1.08)], { depth: 0.03, bevel: 0.012, matrix: new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, 0.012)), gradY: [-0.26, 0.14] });
    // emblem: a gold sun-cross
    const em = spec.emblem ?? spec.tabard ?? spec.cape ?? GOLD;
    extrude(B, 'cross', [[-0.022, -0.15], [0.022, -0.15], [0.022, 0.04], [0.08, 0.04], [0.08, 0.085], [0.022, 0.085], [0.022, 0.13], [-0.022, 0.13], [-0.022, 0.085], [-0.08, 0.085], [-0.08, 0.04], [-0.022, 0.04]], em === col ? GOLD : em, { depth: 0.01, bevel: 0.006, matrix: new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, 0.035)) });
    return;
  }
  // round shield: planks, an iron rim and a big boss
  const lm = new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, 0, Math.PI / 2, 0, 0));
  lathe(B, [[0.002, -0.012], [0.17, -0.004], [0.175, 0.012], [0.12, 0.03], [0.002, 0.036]], [deep(col, 0.78), tint(col, 1.08)], { segs: 20, matrix: lm });
  MT(B, () => lathe(B, [[0.165, -0.014], [0.19, -0.004], [0.19, 0.014], [0.165, 0.024]], [rimC, tint(rimC, 1.2)], { segs: 20, matrix: lm }));
  MT(B, () => ball(B, spec.runes != null ? GOLD : tint(IRON, 1.25), ...new THREE.Vector3(0, 0, 0.035).applyMatrix4(m).toArray(), 0.05 * big, 0.05 * big, 0.03 * big, { matrix: null }));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    MT(B, () => ball(B, IRON, ...new THREE.Vector3(Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0.02).applyMatrix4(m).toArray(), 0.012 * big));
  }
  if (spec.runes != null) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      G.shape(GTPL.box, spec.runes, { matrix: new THREE.Matrix4().multiplyMatrices(m, mat(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.035, 0, 0, a, [0.04, 0.012, 0.006])) });
    }
  }
}
