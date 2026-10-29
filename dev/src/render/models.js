// Procedural low-poly models for characters, monsters and objects.
// Each model is built into one lit + one glow geometry (cached by spec).
// Models face +Z (towards the camera) with their feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL, shade } from './builder.js';
import { humanoid as figure, RACE_LOOKS, HAIR_STYLES } from './figures.js';
import { WHITE_UV, METAL_UV } from './faces.js';
import { quadruped, spider, wraith, bat, serpent, dragon, blob, ent } from './beasts.js';

const cache = new Map();

export { RACE_LOOKS, HAIR_STYLES };

// --- objects ---
function chest(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const wood = spec.color ?? 0x8a5a2a;
  B.box(wood, { y: 0, sx: 0.46, sy: 0.24, sz: 0.32, grad: 0.2 });
  B.shape(TPL.cyl8, shade(wood, 1.1), { y: 0.24, sx: 0.46, sy: 0.3, sz: 0.24, rz: Math.PI / 2, s: 1 });
  B.box(0xd0a040, { y: 0, z: 0, sx: 0.48, sy: 0.04, sz: 0.34 });
  B.box(0xd0a040, { y: 0.12, z: 0.165, sx: 0.07, sy: 0.12, sz: 0.02 });
  for (const s of [-1, 1]) B.box(0xd0a040, { x: s * 0.2, y: 0, sx: 0.04, sy: 0.38, sz: 0.34 });
  return { B, G, height: 0.4, noLean: true };
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
  return { B, G, height: 1.0, noLean: true, boat: true };
}

function waygate(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const stone = 0xb0aa9c;
  B.shape(TPL.cyl12, 0x8a8478, { y: 0, sx: 0.9, sy: 0.05, sz: 0.9 });
  for (const s of [-1, 1]) {
    B.box(stone, { x: s * 0.34, y: 0, sx: 0.14, sy: 0.9, sz: 0.14 });
    G.box(spec.glow ?? 0x80b0ff, { x: s * 0.34, y: 0.3, z: 0.075, sx: 0.04, sy: 0.3, sz: 0.01 });
  }
  B.box(stone, { y: 0.88, sx: 0.88, sy: 0.14, sz: 0.18 });
  G.shape(TPL.torus, spec.glow ?? 0x80b0ff, { y: 0.45, sx: 0.75, sy: 0.85, sz: 0.4 });
  return { B, G, height: 1.0, noLean: true };
}

function sign(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  B.box(0x6a4a2a, { y: 0, sx: 0.05, sy: 0.45, sz: 0.05 });
  B.box(spec.color ?? 0x9a6a3a, { y: 0.3, z: 0.03, sx: 0.36, sy: 0.18, sz: 0.03 });
  B.box(0x3a2a1a, { y: 0.37, z: 0.05, sx: 0.24, sy: 0.02, sz: 0.01 });
  B.box(0x3a2a1a, { y: 0.33, z: 0.05, sx: 0.2, sy: 0.02, sz: 0.01 });
  return { B, G, height: 0.5, noLean: true };
}

function campfire() {
  const B = new GeoBuilder(), G = new GeoBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    B.shape(TPL.dodec, 0x7a7268, { x: Math.cos(a) * 0.2, y: 0, z: Math.sin(a) * 0.2, s: 0.09 });
  }
  B.box(0x5a3a20, { y: 0.02, sx: 0.3, sy: 0.04, sz: 0.05, ry: 0.5 });
  B.box(0x5a3a20, { y: 0.02, sx: 0.3, sy: 0.04, sz: 0.05, ry: -0.6 });
  G.shape(TPL.cone5, 0xff6a10, { y: 0.03, sx: 0.2, sy: 0.32, sz: 0.2 });
  G.shape(TPL.cone5, 0xffd040, { y: 0.03, sx: 0.11, sy: 0.2, sz: 0.11, ry: 0.5 });
  return { B, G, height: 0.4, noLean: true };
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

const BUILDERS = { humanoid, quadruped, spider, wraith, bat, serpent, dragon, blob, ent, chest, ship, waygate, sign, campfire, marker };

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
  if (!res.float && !res.noLean) { groundShade(res.B, res.height); if (res.B.detail) groundShade(res.B.detail, res.height); }
  const lit = res.B.count ? litGeometry(res.B, res.F) : null;
  const shell = res.B.count ? outlineGeometry(res.B.build()) : null;
  const glow = res.G.count ? res.G.build() : null;
  if (s !== 1) {
    lit && lit.scale(s, s, s);
    shell && shell.scale(s, s, s);
    glow && glow.scale(s, s, s);
  }
  entry = { lit, glow, shell, height: res.height * s, float: !!res.float, hover: res.hover || 0, noLean: !!res.noLean, boat: !!res.boat, head: res.head ? res.head.map((v) => v * s) : null };
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
      const o = new THREE.Mesh(g.shell, materials.outline);
      o.userData.outline = true;
      group.add(o);
    }
  }
  if (g.glow) group.add(new THREE.Mesh(g.glow, materials.entityGlow));
  group.userData.info = g;
  return group;
}

export const MODEL_KINDS = Object.keys(BUILDERS);
