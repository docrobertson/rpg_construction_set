// Roofs for settlement buildings: gabled and hipped roofs laid in courses
// (clay tile, slate, thatch, shingle, stone slab), with eaves that overhang the
// walls, ridge caps, gable ends, chimneys and flat battlemented keep tops.
// Everything is merged into the caller's geometry builder; the builder's
// current tag marks the parts that fade away when the party goes inside.
import * as THREE from 'three';
import { TPL } from './builder.js';
import { hash2 } from '../core/rng.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _p = new THREE.Vector3();

export function col(hex, k = 1) {
  _c.setHex(hex);
  return new THREE.Color(Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k));
}
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add3 = (a, n, d) => [a[0] + n[0] * d, a[1] + n[1] * d, a[2] + n[2] * d];
// Painted light: slopes turned to the sun (west-south-west, high) are a touch
// warmer and brighter, the far slopes and hips cooler, so a roof's planes
// read apart even under the soft sky fill.
const SUN = new THREE.Vector3(-0.52, 0.74, 0.42).normalize();
function facing(N) { const d = N[0] * SUN.x + N[1] * SUN.y + N[2] * SUN.z; return 0.74 + 0.4 * Math.max(0, d); }
// Weathering: broad soft patches of lighter and darker tiles across a roof
// (value noise at about two tiles' scale), so a big roof is never one flat
// colour from afar.
function weather(x, z) {
  const fx = x * 0.55, fz = z * 0.55;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  const h = (a, b) => hash2(a, b, 4177);
  const v = (h(ix, iz) * (1 - tx) + h(ix + 1, iz) * tx) * (1 - tz) + (h(ix, iz + 1) * (1 - tx) + h(ix + 1, iz + 1) * tx) * tz;
  return 0.88 + 0.22 * v;
}

// A box from point a to point b with a w (sideways) x h (up) cross-section.
// `up` picks which way the section's height points.
export function beam(B, a, b, w, h, color, up = [0, 1, 0]) {
  _x.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _x.length();
  if (len < 1e-4) return;
  _x.divideScalar(len);
  _y.set(up[0], up[1], up[2]);
  if (Math.abs(_x.dot(_y)) > 0.95) _y.set(1, 0, 0);
  _y.addScaledVector(_x, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2).addScaledVector(_y, -h / 2);
  _m.setPosition(_p);
  _m.multiply(new THREE.Matrix4().makeScale(len, h, w));
  B.shape(TPL.box, color, { matrix: _m.clone() });
}

// Roof looks. pitch: rise per unit of half-span; course/colw: size of one
// tile; lip: how far each course stands proud of the one above; thick: eave
// thickness; jag: organic wobble (thatch); hip: hipped rather than gabled.
export const ROOFS = {
  tile: { colors: [0xb85a30, 0xc06436, 0xb0522e], course: 0.24, colw: 0.26, lip: 0.035, thick: 0.07, pitch: 0.95, ridge: 'round', rnd: 0.07, stagger: false, grooves: true },
  redtile: { colors: [0xa83c2a, 0xb0422e, 0x9e3826], course: 0.24, colw: 0.26, lip: 0.035, thick: 0.07, pitch: 0.95, ridge: 'round', rnd: 0.07, grooves: true },
  slate: { colors: [0x56606e, 0x5a6472, 0x525c6a], course: 0.21, colw: 0.42, lip: 0.035, thick: 0.06, pitch: 1.0, ridge: 'lead', rnd: 0.05, stagger: true },
  bluslate: { colors: [0x4c5c78, 0x50607c, 0x485872], course: 0.21, colw: 0.42, lip: 0.035, thick: 0.06, pitch: 1.1, ridge: 'lead', rnd: 0.05, stagger: true },
  thatch: { colors: [0xb48c4c, 0xa88044, 0xbc9656, 0xa47a40], course: 0.27, colw: 0.7, lip: 0.06, thick: 0.2, pitch: 1.05, ridge: 'thatch', rnd: 0.05, hip: true, hipK: 0.6, thatch: true, ridgeColor: 0x9a7a40 },
  shingle: { colors: [0x8a5a3a, 0x7e5234, 0x946240], course: 0.2, colw: 0.3, lip: 0.03, thick: 0.06, pitch: 1.0, ridge: 'board', rnd: 0.14, stagger: true },
  elven: { colors: [0x3f8a78, 0x4a9a84, 0x367a6c], course: 0.2, colw: 0.26, lip: 0.03, thick: 0.05, pitch: 1.35, ridge: 'gold', rnd: 0.06, stagger: true, curl: 0.85, scallop: true, fascia: 0xd8b860 },
  stone: { colors: [0x84807c, 0x8e8a84, 0x7a7672], course: 0.36, colw: 0.55, lip: 0.05, thick: 0.12, pitch: 0.5, ridge: 'stone', rnd: 0.18, stagger: true, hip: true, hipK: 0.7 },
};

// One sloping face laid in courses. e0-e1 is the eave edge, t0-t1 the top
// edge (equal points make a hip triangle). The face's outward normal is
// cross(e1 - e0, t0 - e0).
function slope(B, e0, e1, t0, t1, S, seed, curlFn) {
  if (S.thatch) return thatchSlope(B, e0, e1, t0, t1, S, seed);
  const n = v3(e1).sub(v3(e0)).cross(v3(t0).sub(v3(e0))).normalize();
  const N = [n.x, n.y, n.z];
  const fk = facing(N);
  const span = Math.hypot(t0[0] - e0[0], t0[1] - e0[1], t0[2] - e0[2]);
  const rows = Math.max(2, Math.round(span / S.course));
  const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]);
  const cols = S.grooves || S.stagger ? Math.max(1, Math.round(len / S.colw)) : Math.max(1, Math.round(len / S.colw));
  const P = (u, v) => {
    const p = lerp3(lerp3(e0, e1, u), lerp3(t0, t1, u), v);
    if (curlFn) p[1] += curlFn(u, v);
    if (S.jag) {
      const j = (hash2(Math.round(p[0] * 7), Math.round(p[2] * 7) + Math.round(p[1] * 11), seed) - 0.5) * S.jag * (1 - v * 0.6);
      p[0] += N[0] * j; p[1] += N[1] * j; p[2] += N[2] * j;
    }
    return p;
  };
  for (let r = 0; r < rows; r++) {
    const v0 = r / rows, v1 = (r + 1) / rows;
    const shift = S.stagger && r % 2 ? 0.5 / cols : 0;
    // courses near the eave sit in a little shadow, the ridge catches light
    const tone = (0.86 + 0.18 * v0) * fk;
    for (let c = -1; c < cols; c++) {
      let u0 = c / cols + shift, u1 = (c + 1) / cols + shift;
      if (u1 <= 0 || u0 >= 1) continue;
      u0 = Math.max(0, u0); u1 = Math.min(1, u1);
      if (u1 - u0 < 0.002) continue;
      const rr = hash2(r * 31 + c * 7, seed, 4100);
      const base = S.colors[Math.floor(rr * S.colors.length) % S.colors.length];
      const pm = P((u0 + u1) / 2, (v0 + v1) / 2);
      const k = tone * weather(pm[0], pm[2]) * (1 - S.rnd / 2 + S.rnd * hash2(c * 13 + r, r * 5 + seed, 4101));
      // each course's foot catches the light, its head lies in the shadow of
      // the course above: read from afar as crisp horizontal bands
      const cTop = col(base, k * 0.8), cBot = col(base, k * 1.1);
      const a = P(u0, v0), b = P(u1, v0), cc = P(u1, v1), d = P(u0, v1);
      // the lower edge of each course stands proud of the slope
      const lipD = S.lip * (S.scallop ? 0.7 + 0.6 * Math.sin(((u0 + u1) / 2) * cols * Math.PI) ** 2 : 1);
      const a2 = add3(a, N, lipD), b2 = add3(b, N, lipD);
      // overlap the course below slightly so no gaps show between them
      const dn = [(a[0] - d[0]) * 0.12, (a[1] - d[1]) * 0.12, (a[2] - d[2]) * 0.12];
      const a3 = [a2[0] + dn[0], a2[1] + dn[1], a2[2] + dn[2]], b3 = [b2[0] + dn[0], b2[1] + dn[1], b2[2] + dn[2]];
      if (S.grooves) {
        // clay tiles: each one a shallow barrel, a ridge down its middle
        const um = (u0 + u1) / 2;
        const m0 = add3(P(um, v0), N, lipD * 1.5), m1 = add3(P(um, v1), N, S.lip * 0.4);
        const mBot = [m0[0] + dn[0], m0[1] + dn[1], m0[2] + dn[2]];
        const hi = col(base, k * 1.12);
        B.quadC(a3, mBot, m1, d, cBot, hi, hi, cTop);
        B.quadC(mBot, b3, cc, m1, hi, cBot, cTop, hi);
        const lip = col(base, k * 0.55);
        B.quadC(a, b, b3, a3, lip, lip, lip, lip);
      } else {
        B.quadC(a3, b3, cc, d, cBot, cBot, cTop, cTop);
        const lip = col(base, k * 0.5);
        B.quadC(a, b, b3, a3, lip, lip, lip, lip);
      }
    }
  }
  // the eave's edge: a fascia facing outwards and down
  const e0b = add3(e0, [0, -1, 0], S.thick), e1b = add3(e1, [0, -1, 0], S.thick);
  const fasc = col(S.fascia ?? S.colors[0], 0.55);
  let ea = e0, eb = e1;
  if (curlFn) { ea = P(0, 0); eb = P(1, 0); }
  B.quadC(add3(ea, [0, -1, 0], S.thick), add3(eb, [0, -1, 0], S.thick), add3(eb, N, S.lip), add3(ea, N, S.lip), fasc, fasc, col(S.colors[0], 0.7), col(S.colors[0], 0.7));
  void e0b; void e1b;
}

// Thatch: one smooth sheet laid in thick courses, its straw streaked along
// the fall line, each course's butt ends standing proud in a darker band, a
// ragged eave and the odd mossy patch. Smooth (not faceted) so the light reads
// as one soft surface rather than a quilt of tiles.
function thatchSlope(B, e0, e1, t0, t1, S, seed) {
  const n = v3(e1).sub(v3(e0)).cross(v3(t0).sub(v3(e0))).normalize();
  const N = [n.x, n.y, n.z];
  const span = Math.hypot(t0[0] - e0[0], t0[1] - e0[1], t0[2] - e0[2]);
  const rows = Math.max(2, Math.round(span / S.course));
  const len = Math.max(Math.hypot(e1[0] - e0[0], e1[1] - e0[1], e1[2] - e0[2]), 0.01);
  const cols = Math.max(2, Math.round(len / 0.3));
  const P = (u, v) => lerp3(lerp3(e0, e1, u), lerp3(t0, t1, u), v);
  const cs = S.colors;
  const fk = facing(N);
  // straw colour at a point: streaks along the fall line, moss in patches
  const straw = (u, r, k) => {
    const wx = lerp3(e0, e1, u);
    const ui = Math.round(u * cols);
    const streak = 0.84 + 0.26 * hash2(ui * 3 + seed, r >> 1, 4120);
    const base = cs[(ui + r) % cs.length];
    const moss = Math.max(0, hash2(Math.floor(wx[0] * 0.9) + seed, Math.floor(wx[2] * 0.9) + r * 0.5, 4121) - 0.78) * 2.2;
    const c = col(base, streak * k * fk);
    if (moss > 0) c.lerp(col(0x6e7a3e, k * 0.95), Math.min(0.55, moss));
    return c;
  };
  for (let r = 0; r < rows; r++) {
    const v0 = r / rows, v1 = (r + 1) / rows;
    const lip = S.lip * (r === 0 ? 1.6 : 1);
    // the course below's top hides under this one's butt ends
    const dn = [(e0[0] - t0[0]) / rows * 0.18, (e0[1] - t0[1]) / rows * 0.18, (e0[2] - t0[2]) / rows * 0.18];
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols;
      const a = P(u0, v0), b = P(u1, v0), cc = P(u1, v1), d = P(u0, v1);
      // ragged butt ends: each bundle hangs a little lower or higher
      const rag0 = r === 0 ? (hash2(c + seed, 7, 4122) - 0.5) * 0.07 : 0;
      const rag1 = r === 0 ? (hash2(c + 1 + seed, 7, 4122) - 0.5) * 0.07 : 0;
      const a2 = add3(add3(a, N, lip), dn, 1 + rag0 * 8), b2 = add3(add3(b, N, lip), dn, 1 + rag1 * 8);
      const lo0 = straw(u0, r, 1.08), lo1 = straw(u1, r, 1.08);
      const hi0 = straw(u0, r, 0.8), hi1 = straw(u1, r, 0.8);
      B.quadC(a2, b2, cc, d, lo0, lo1, hi1, hi0);
      const butt0 = straw(u0, r, 0.58), butt1 = straw(u1, r, 0.58);
      B.quadC(add3(a, dn, 1), add3(b, dn, 1), b2, a2, butt0.clone().multiplyScalar(0.8), butt1.clone().multiplyScalar(0.8), butt1, butt0);
    }
  }
  // the thick rounded eave
  const fasc = col(cs[0], 0.5), fasc2 = col(cs[0], 0.72);
  const dn = [(e0[0] - t0[0]) / rows * 0.18, (e0[1] - t0[1]) / rows * 0.18, (e0[2] - t0[2]) / rows * 0.18];
  const ea = add3(e0, dn, 1), eb = add3(e1, dn, 1);
  B.quadC(add3(ea, [0, -1, 0], S.thick), add3(eb, [0, -1, 0], S.thick), add3(eb, N, S.lip * 1.6), add3(ea, N, S.lip * 1.6), fasc, fasc, fasc2, fasc2);
}

// A gabled or hipped roof over a rectangle.
//   box: the walls' outer faces {x0, z0, x1, z1}; y: wall top; S: look;
//   o: { over (eave overhang), along ('x'|'z' ridge direction), hip, gable(face, a, b, apex) }
// Returns { ridgeY, heightAt(px, pz) }.
export function roofRect(B, box, y, S, o = {}) {
  const over = o.over ?? 0.24;
  const along = o.along || ((box.x1 - box.x0) >= (box.z1 - box.z0) ? 'x' : 'z');
  // work in (a: along the ridge, b: across it) space, then map back
  const A0 = along === 'x' ? box.x0 : box.z0, A1 = along === 'x' ? box.x1 : box.z1;
  const B0 = along === 'x' ? box.z0 : box.x0, B1 = along === 'x' ? box.z1 : box.x1;
  const half = (B1 - B0) / 2;
  const rise = Math.min(o.maxRise ?? 1.75, Math.max(0.45, half * S.pitch * (o.pitchK ?? 1)));
  const k = rise / half;
  const ridgeY = y + rise;
  const bc = (B0 + B1) / 2;
  const hip = o.hip ?? !!S.hip;
  const len = A1 - A0;
  // hips are steeper than the long slopes, so square cottages keep a ridge
  const hipIn = hip ? Math.min(len / 2, half * (S.hipK ?? 1)) : 0;
  const eaveY = y - over * k;
  const W = (a, b, yy) => (along === 'x' ? [a, yy, b] : [b, yy, a]);
  const seed = Math.floor(box.x0 * 13 + box.z0 * 7);
  const curlFn = S.curl && !o.noCurl ? (u, v) => S.curl * Math.pow(Math.abs(u - 0.5) * 2, 3) * Math.pow(1 - v, 2) : null;
  // ridge end points
  const ra = A0 + hipIn - (hip ? 0 : over), rb = A1 - hipIn + (hip ? 0 : over);
  const ea0 = A0 - over, ea1 = A1 + over;
  const eb0 = B0 - over, eb1 = B1 + over;
  // the two long slopes (orientation: normal points away from the ridge)
  const flip = along === 'x' ? 1 : -1;
  const longSlope = (bEdge, sign) => {
    const e0 = W(ea0, bEdge, eaveY), e1 = W(ea1, bEdge, eaveY);
    const t0 = W(ra, bc, ridgeY), t1 = W(rb, bc, ridgeY);
    if (sign * flip > 0) slope(B, e0, e1, t0, t1, S, seed + (sign > 0 ? 1 : 2), curlFn);
    else slope(B, e1, e0, t1, t0, S, seed + (sign > 0 ? 1 : 2), curlFn);
  };
  longSlope(eb1, 1);
  longSlope(eb0, -1);
  if (hip) {
    // the end slopes are triangles (or a pyramid's faces)
    const endSlope = (aEdge, rp, sign) => {
      const e0 = W(aEdge, eb0, eaveY), e1 = W(aEdge, eb1, eaveY), t = W(rp, bc, ridgeY);
      if (sign * flip > 0) slope(B, e0, e1, t, t, S, seed + 3, null);
      else slope(B, e1, e0, t, t, S, seed + 4, null);
    };
    endSlope(ea0, ra, 1);
    endSlope(ea1, rb, -1);
    // hip caps
    const capC = col(S.ridgeColor ?? S.colors[0], 0.8);
    for (const [ae, rp] of [[ea0, ra], [ea1, rb]]) for (const be of [eb0, eb1]) {
      beam(B, W(ae, be, eaveY + 0.03), W(rp, bc, ridgeY + 0.03), 0.07, 0.06, capC);
    }
  } else if (o.gable) {
    // gable ends: the triangle of wall under each end of the ridge
    o.gable(W(A0, B0, y), W(A0, B1, y), W(A0, bc, ridgeY - 0.04), along === 'x' ? [-1, 0, 0] : [0, 0, -1]);
    o.gable(W(A1, B1, y), W(A1, B0, y), W(A1, bc, ridgeY - 0.04), along === 'x' ? [1, 0, 0] : [0, 0, 1]);
    // barge boards along the sloping edges
    const bargeC = col(S.barge ?? 0x5a3a22, 1);
    for (const ae of [ea0, ea1]) for (const be of [eb0, eb1]) {
      beam(B, W(ae, be, eaveY - 0.02), W(ae, bc, ridgeY + 0.02), 0.05, 0.1, bargeC, along === 'x' ? [0, 1, 0] : [0, 1, 0]);
    }
  }
  // the ridge
  if (rb > ra + 0.01 || !hip) ridgeCap(B, W(ra, bc, ridgeY), W(rb, bc, ridgeY), S);
  if (S.ridge === 'gold' || S.finials) {
    for (const ap of [ra, rb]) {
      const p = W(ap, bc, ridgeY);
      B.shape(TPL.cone8, S.finial ?? 0xe0c060, { x: p[0], y: p[1] + 0.02, z: p[2], sx: 0.09, sy: 0.42, sz: 0.09 });
      B.shape(TPL.ball, S.finial ?? 0xe0c060, { x: p[0], y: p[1] + 0.12, z: p[2], s: 0.1 });
    }
  }
  // a plain stand-in that casts the roof's shadow (see houses.js)
  if (o.shadow) {
    const Sb = o.shadow, sc = S.colors[0], dy = -0.04;
    Sb.quad(W(ea0, eb1, eaveY + dy), W(ea1, eb1, eaveY + dy), W(rb, bc, ridgeY + dy), W(ra, bc, ridgeY + dy), sc);
    Sb.quad(W(ea1, eb0, eaveY + dy), W(ea0, eb0, eaveY + dy), W(ra, bc, ridgeY + dy), W(rb, bc, ridgeY + dy), sc);
    if (hip) {
      Sb.tri(W(ea0, eb0, eaveY + dy), W(ea0, eb1, eaveY + dy), W(ra, bc, ridgeY + dy), sc);
      Sb.tri(W(ea1, eb1, eaveY + dy), W(ea1, eb0, eaveY + dy), W(rb, bc, ridgeY + dy), sc);
    } else {
      Sb.tri(W(A0, B0, y), W(A0, B1, y), W(A0, bc, ridgeY - 0.05), sc);
      Sb.tri(W(A1, B1, y), W(A1, B0, y), W(A1, bc, ridgeY - 0.05), sc);
    }
  }
  const aMid = (A0 + A1) / 2, ridgeHalf = Math.max(0, (A1 - A0) / 2 - hipIn);
  return {
    ridgeY, rise, along, eaveY,
    eave: { x0: box.x0 - over, z0: box.z0 - over, x1: box.x1 + over, z1: box.z1 + over },
    heightAt(px, pz) {
      const a = along === 'x' ? px : pz, b = along === 'x' ? pz : px;
      let h = ridgeY - k * Math.abs(b - bc);
      if (hip) h = Math.min(h, ridgeY - k * Math.max(0, Math.abs(a - aMid) - ridgeHalf));
      return h;
    },
  };
}

function ridgeCap(B, a, b, S) {
  const c = S.ridgeColor ?? S.colors[0];
  switch (S.ridge) {
    case 'thatch':
      // a thick rolled ridge bound with darker withies
      beam(B, a, b, 0.24, 0.16, col(c, 0.95));
      beam(B, add3(a, [0, 1, 0], 0.08), add3(b, [0, 1, 0], 0.08), 0.16, 0.06, col(c, 1.08));
      {
        const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.3));
        for (let i = 0; i <= n; i++) {
          const p = lerp3(a, b, i / n);
          const dir = Math.abs(b[0] - a[0]) > Math.abs(b[2] - a[2]) ? [0, 0, 1] : [1, 0, 0];
          beam(B, add3(add3(p, dir, -0.16), [0, 1, 0], -0.04), add3(add3(p, dir, 0.16), [0, 1, 0], -0.04), 0.03, 0.04, col(0x7a5a2a, 1));
        }
      }
      break;
    case 'round':
      beam(B, add3(a, [0, 1, 0], 0.02), add3(b, [0, 1, 0], 0.02), 0.13, 0.08, col(c, 0.8));
      break;
    case 'lead':
      beam(B, add3(a, [0, 1, 0], 0.02), add3(b, [0, 1, 0], 0.02), 0.09, 0.05, col(0x3a4048, 1));
      break;
    case 'gold':
      beam(B, add3(a, [0, 1, 0], 0.02), add3(b, [0, 1, 0], 0.02), 0.07, 0.05, col(0xd8b050, 1));
      break;
    case 'stone':
      beam(B, add3(a, [0, 1, 0], 0.04), add3(b, [0, 1, 0], 0.04), 0.2, 0.1, col(c, 0.9));
      break;
    default:
      beam(B, add3(a, [0, 1, 0], 0.02), add3(b, [0, 1, 0], 0.02), 0.1, 0.06, col(0x5a3a22, 1));
  }
}

// A chimney stack rising from inside the walls through the roof.
export function chimney(B, x, z, y0, top, stone = 0x8a8278) {
  const sc = col(stone, 1);
  B.box(sc, { x, y: y0, z, sx: 0.3, sy: top - y0, sz: 0.3, grad: 0.15 });
  // brick courses on the visible faces
  for (let yy = y0 + 0.15; yy < top - 0.08; yy += 0.13) B.box(col(stone, 0.8), { x, y: yy, z, sx: 0.31, sy: 0.018, sz: 0.31 });
  B.box(col(stone, 1.15), { x, y: top, z, sx: 0.38, sy: 0.06, sz: 0.38 });
  B.box(col(0x201a16, 1), { x, y: top + 0.055, z, sx: 0.2, sy: 0.01, sz: 0.2 });
  for (const [dx, dz] of [[-0.07, 0], [0.07, 0]]) B.shape(TPL.cyl6, col(0xa0582e, 1), { x: x + dx, y: top + 0.05, z: z + dz, sx: 0.08, sy: 0.12, sz: 0.08 });
}

// A great hall or keep: a battlemented parapet round the wall top, a steep
// slate roof standing inside it and a turret with a conical cap on each
// corner. Returns the inner roof (its heightAt) for chimneys.
export function keepTop(B, box, y, stone, roofS, shadow) {
  const { x0, z0, x1, z1 } = box;
  const sc = col(stone, 1);
  // the wall walk: flagstones between parapet and roof
  B.box(col(stone, 0.72), { x: (x0 + x1) / 2, y: y - 0.04, z: (z0 + z1) / 2, sx: x1 - x0, sy: 0.06, sz: z1 - z0 });
  // parapet and merlons all round
  const t = 0.18, ph = 0.24;
  const runs = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [ax, az, bx, bz] of runs) {
    beam(B, [ax, y + ph, az], [bx, y + ph, bz], t, ph + 0.04, sc);
    // a string course of corbels under the parapet
    beam(B, [ax, y - 0.02, az], [bx, y - 0.02, bz], t + 0.08, 0.07, col(stone, 0.86));
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 0.36));
    for (let i = 0; i <= n; i += 2) {
      const u = i / n;
      const px = ax + (bx - ax) * u, pz = az + (bz - az) * u;
      B.box(col(stone, 1.06), { x: px, y: y + ph, z: pz, sx: 0.22, sy: 0.19, sz: 0.22 });
    }
  }
  // the roof inside the parapet
  const inset = 0.42;
  const R = roofRect(B, { x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset }, y + 0.05, roofS, { hip: true, over: 0.1, maxRise: 2.9, pitchK: 0.9, shadow });
  // a slender fleche on the ridge, gilded, with a pennant
  {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ry = R.ridgeY - 0.1;
    B.shape(TPL.cyl8, col(stone, 1.05), { x: cx, y: ry, z: cz, sx: 0.5, sy: 0.55, sz: 0.5 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.box(col(0x2a2a30, 1), { x: cx + Math.cos(a) * 0.24, y: ry + 0.2, z: cz + Math.sin(a) * 0.24, sx: 0.06, sy: 0.24, sz: 0.06, ry: -a });
    }
    B.shape(TPL.cone8, col(roofS.colors[0], 1.05), { x: cx, y: ry + 0.52, z: cz, sx: 0.62, sy: 1.5, sz: 0.62, grad: 0.3 });
    B.shape(TPL.cyl6, col(0x3a3430, 1), { x: cx, y: ry + 1.9, z: cz, sx: 0.03, sy: 0.6, sz: 0.03 });
    B.shape(TPL.ball, col(0xe0c050, 1), { x: cx, y: ry + 2.02, z: cz, s: 0.1 });
    B.box(col(0xb83a3a, 1), { x: cx + 0.2, y: ry + 2.24, z: cz, sx: 0.4, sy: 0.16, sz: 0.02 });
  }
  // corner turrets
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    B.shape(TPL.cyl8, sc, { x: px, y: y - 1.2, z: pz, sx: 0.7, sy: 1.75, sz: 0.7, grad: 0.25 });
    B.shape(TPL.cyl8, col(stone, 1.1), { x: px, y: y + 0.52, z: pz, sx: 0.82, sy: 0.1, sz: 0.82 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B.box(col(stone, 1.08), { x: px + Math.cos(a) * 0.36, y: y + 0.6, z: pz + Math.sin(a) * 0.36, sx: 0.12, sy: 0.12, sz: 0.12, ry: -a });
    }
    B.shape(TPL.cone8, col(roofS.colors[0], 1), { x: px, y: y + 0.6, z: pz, sx: 0.78, sy: 1.15, sz: 0.78, grad: 0.3 });
    B.shape(TPL.ball, col(0xe0c050, 1), { x: px, y: y + 1.74, z: pz, s: 0.07 });
    if (shadow) shadow.shape(TPL.cyl8, 0x808080, { x: px, y: y - 1.2, z: pz, sx: 0.7, sy: 2.9, sz: 0.7 });
  }
  return R;
}

// Dwarven halls under the mountain need no rain roof: a heavy stepped stone
// cap (two courses of great slabs, each set back from the one below) with a
// bronze-edged rim, glowing rune lines, brazier bowls at the corners and a
// rune stone on top, chunky and readable from above even in the dark halls.
// Returns heightAt for chimneys.
export function stepRoof(B, box, y, stone, glowTag) {
  const { x0, z0, x1, z1 } = box;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  const o = 0.16;
  // the slabs are a warmer, lighter stone than the walls, so the cap stands
  // out from the street in lamplight
  const cap = warmStone(stone);
  const bronze = 0xc8903e;
  const tag = B.tag;
  const glow = (fn) => { if (glowTag != null) B.tag = glowTag; fn(); B.tag = tag; };
  // the cornice: a bold overhanging band of dressed stone
  B.box(col(stone, 0.78), { x: cx, y: y - 0.06, z: cz, sx: w + o * 2, sy: 0.12, sz: d + o * 2 });
  B.box(col(cap, 0.95), { x: cx, y: y + 0.06, z: cz, sx: w + o * 2 + 0.04, sy: 0.16, sz: d + o * 2 + 0.04 });
  B.box(col(bronze, 1), { x: cx, y: y + 0.2, z: cz, sx: w + o * 2 + 0.05, sy: 0.045, sz: d + o * 2 + 0.05 });
  // first step: great slabs, each its own shade, dark joints between
  const s1 = 0.4;
  slabs(B, cx, cz, w - s1, d - s1, y + 0.22, 0.3, cap, Math.floor(x0 * 7 + z0 * 13));
  // a rune line round the first step, glowing
  glow(() => {
    for (const [ax, az, bx, bz] of [[x0 + s1 / 2, z1 - s1 / 2, x1 - s1 / 2, z1 - s1 / 2], [x0 + s1 / 2, z0 + s1 / 2, x1 - s1 / 2, z0 + s1 / 2]]) {
      B.box(col(0x60d8ff, 1), { x: (ax + bx) / 2, y: y + 0.33, z: az + (az > cz ? 0.006 : -0.006), sx: bx - ax - 0.4, sy: 0.035, sz: 0.012 });
    }
  });
  // second step
  const s2 = Math.min(w, d) * 0.45;
  if (w - s2 > 0.6 && d - s2 > 0.6) {
    slabs(B, cx, cz, w - s2, d - s2, y + 0.52, 0.26, tint(cap, 1.06), Math.floor(x1 * 5 + z1 * 3), 0.62);
    B.box(col(bronze, 0.95), { x: cx, y: y + 0.78, z: cz, sx: w - s2 + 0.06, sy: 0.04, sz: d - s2 + 0.06 });
  }
  // brazier bowls on the corners of the cap, coals aglow
  for (const [px, pz] of [[x0 - 0.02, z0 - 0.02], [x1 + 0.02, z0 - 0.02], [x0 - 0.02, z1 + 0.02], [x1 + 0.02, z1 + 0.02]]) {
    B.box(col(cap, 0.82), { x: px, y: y + 0.2, z: pz, sx: 0.34, sy: 0.22, sz: 0.34 });
    B.shape(TPL.cyl8, col(0x3a3430, 1), { x: px, y: y + 0.42, z: pz, sx: 0.08, sy: 0.12, sz: 0.08 });
    B.shape(TPL.cyl8, col(bronze, 0.9), { x: px, y: y + 0.52, z: pz, sx: 0.3, sy: 0.1, sz: 0.3, grad: 0.4 });
    glow(() => {
      B.shape(TPL.cyl8, col(0xff9a40, 1), { x: px, y: y + 0.6, z: pz, sx: 0.22, sy: 0.03, sz: 0.22 });
      B.shape(TPL.cone5, col(0xffc060, 1), { x: px, y: y + 0.62, z: pz, sx: 0.12, sy: 0.18, sz: 0.12 });
    });
  }
  // the rune stone, glowing
  B.box(col(cap, 0.85), { x: cx, y: y + 0.84, z: cz, sx: 0.56, sy: 0.18, sz: 0.56 });
  B.box(col(bronze, 1), { x: cx, y: y + 1.0, z: cz, sx: 0.4, sy: 0.03, sz: 0.4 });
  glow(() => B.box(col(0x60d8ff, 1), { x: cx, y: y + 1.02, z: cz, sx: 0.24, sy: 0.05, sz: 0.24 }));
  return { ridgeY: y + 1.0, rise: 1.0, eaveY: y - 0.06, eave: { x0: x0 - o, z0: z0 - o, x1: x1 + o, z1: z1 + o }, heightAt: () => y + 0.55 };
}

// a slab course: dark bedding, then a grid of slabs each a slightly different shade
function slabs(B, cx, cz, w, d, y, h, stone, seed, size = 0.95) {
  B.box(col(stone, 0.32), { x: cx, y, z: cz, sx: w, sy: h - 0.03, sz: d });
  const nx = Math.max(1, Math.round(w / size)), nz = Math.max(1, Math.round(d / size));
  const sw = w / nx, sd = d / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = 0.74 + 0.4 * hash2(seed + i * 3, j * 5 - seed, 4711);
    B.box(col(stone, k), { x: cx - w / 2 + sw * (i + 0.5), y: y + 0.01, z: cz - d / 2 + sd * (j + 0.5), sx: sw - 0.08, sy: h - 0.01, sz: sd - 0.08 });
  }
}

const _w = new THREE.Color();
function warmStone(hex) { _w.setHex(hex).lerp(new THREE.Color(0xaaa49c), 0.5); return Math.min(0xffffff, _w.getHex()); }
function tint(hex, k) { _w.setHex(hex).multiplyScalar(k); _w.r = Math.min(1, _w.r); _w.g = Math.min(1, _w.g); _w.b = Math.min(1, _w.b); return _w.getHex(); }
