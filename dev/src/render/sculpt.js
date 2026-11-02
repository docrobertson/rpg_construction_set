// Sculpting helpers for the figures: smooth swept tubes (limbs, tails, horns,
// hair locks, blades), lathes with oval sections (torsos, robes, helms, boots),
// thick curved sheets (capes, wings) and bevelled extrusions (shields, axe
// heads). Everything is written straight into a GeoBuilder as vertex-coloured
// triangles, so a whole character still becomes a single draw call.
import * as THREE from 'three';
import { TPL } from './builder.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

// linear-space rgb for a hex colour
function rgb(hex, out = [0, 0, 0]) {
  _c.setHex(hex);
  out[0] = _c.r; out[1] = _c.g; out[2] = _c.b;
  return out;
}

// Colour along a part: a hex, a [from, to] gradient, a list of stops, or a
// function of t (0..1 along the part) returning a hex.
function colourAt(col, t, out) {
  if (typeof col === 'number') return rgb(col, out);
  if (typeof col === 'function') return rgb(col(t), out);
  if (col.length === 2) {
    _c.setHex(col[0]); _c2.setHex(col[1]);
    _c.lerp(_c2, t);
  } else {
    const f = Math.min(col.length - 1.0001, Math.max(0, t * (col.length - 1)));
    const i = Math.floor(f);
    _c.setHex(col[i]); _c2.setHex(col[i + 1]);
    _c.lerp(_c2, f - i);
  }
  out[0] = _c.r; out[1] = _c.g; out[2] = _c.b;
  return out;
}

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]));
}

// Rotation that turns +y into the direction a→b, placed at a.
const _Y = new THREE.Vector3(0, 1, 0);
export function along(a, b, roll = 0) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(_Y, roll));
  return new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1));
}

// ---- core: a sequence of rings, each { p, N, Bn, T, rx, ry, t, tilt } ----
// rings are joined into a smooth skin; normals lean along T by `tilt` so that
// tapering parts shade correctly.
function skin(B, rings, col, o = {}) {
  // fewer sides for thin parts: they are only a few pixels wide in play
  let rmax = 0;
  for (const r of rings) rmax = Math.max(rmax, r.rx, r.ry);
  const auto = rmax >= 0.07 ? 11 : rmax >= 0.045 ? 8 : rmax >= 0.025 ? 7 : rmax >= 0.012 ? 5 : 4;
  const segs = o.keepSegs ? o.segs : Math.min(o.segs ?? 10, auto);
  // hairline parts skip the outline (it would swamp them)
  if (rmax < 0.012 && B.detail && !o.outline) B = B.detail;
  const m = o.matrix || null;
  if (m) _nm.getNormalMatrix(m);
  const rot = o.rot ?? 0;
  const P = [], Nn = [], C = [];
  const cc = [0, 0, 0];
  for (const r of rings) {
    const pr = [], nr = [];
    colourAt(col, r.t, cc);
    const ck = r.k ?? 1;
    C.push([cc[0] * ck, cc[1] * ck, cc[2] * ck]);
    const ct = Math.cos(r.tilt || 0), st = Math.sin(r.tilt || 0);
    for (let j = 0; j <= segs; j++) {
      const a = rot + (j / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = r.p[0] + r.N[0] * ca * r.rx + r.Bn[0] * sa * r.ry;
      const py = r.p[1] + r.N[1] * ca * r.rx + r.Bn[1] * sa * r.ry;
      const pz = r.p[2] + r.N[2] * ca * r.rx + r.Bn[2] * sa * r.ry;
      // normal of an ellipse: (cos a * ry, sin a * rx)
      let nx = r.N[0] * ca * r.ry + r.Bn[0] * sa * r.rx;
      let ny = r.N[1] * ca * r.ry + r.Bn[1] * sa * r.rx;
      let nz = r.N[2] * ca * r.ry + r.Bn[2] * sa * r.rx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx = (nx / l) * ct + r.T[0] * st; ny = (ny / l) * ct + r.T[1] * st; nz = (nz / l) * ct + r.T[2] * st;
      _v.set(px, py, pz); _n.set(nx, ny, nz);
      if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm); }
      _n.normalize();
      pr.push([_v.x, _v.y, _v.z]); nr.push([_n.x, _n.y, _n.z]);
    }
    P.push(pr); Nn.push(nr);
  }
  const flat = !!o.flat;
  const put = (i, j) => {
    const p = P[i][j], n = Nn[i][j], c = C[i];
    B.pos.push(p[0], p[1], p[2]);
    if (!flat) B.nor.push(n[0], n[1], n[2]);
    B.col.push(c[0], c[1], c[2]);
  };
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      // winding: make the face normal agree with the smooth normal
      const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      let vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) < 1e-9) { vx = c[0] - a[0]; vy = c[1] - a[1]; vz = c[2] - a[2]; }
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const nn = Nn[i][j];
      const flip = fx * nn[0] + fy * nn[1] + fz * nn[2] < 0;
      const start = B.pos.length;
      if (!flip) { put(i, j); put(i + 1, j); put(i + 1, j + 1); put(i, j); put(i + 1, j + 1); put(i, j + 1); }
      else { put(i, j); put(i + 1, j + 1); put(i + 1, j); put(i, j); put(i, j + 1); put(i + 1, j + 1); }
      if (flat) faceNormals(B, start);
    }
  }
}

function faceNormals(B, start) {
  const Q = B.pos;
  for (let i = start; i < Q.length; i += 9) {
    const ax = Q[i + 3] - Q[i], ay = Q[i + 4] - Q[i + 1], az = Q[i + 5] - Q[i + 2];
    const bx = Q[i + 6] - Q[i], by = Q[i + 7] - Q[i + 1], bz = Q[i + 8] - Q[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    B.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
}

function radiusAt(radii, t) {
  if (typeof radii === 'number') return radii;
  if (typeof radii === 'function') return radii(t);
  const f = Math.min(radii.length - 1.0001, Math.max(0, t * (radii.length - 1)));
  const i = Math.floor(f);
  return radii[i] + (radii[i + 1] - radii[i]) * (f - i);
}

// Add rounded end caps: extra rings shrinking to a point beyond each end.
function addCaps(rings, o, steps = 2) {
  const capped = [];
  const mk = (r, dir, k) => {
    const out = [];
    for (let s = steps; s >= 1; s--) {
      const a = (s / steps) * Math.PI / 2;
      const len = (o.capLen ?? 1) * Math.sin(a);
      out.push({ ...r, p: [r.p[0] + r.T[0] * dir * len * r.rx, r.p[1] + r.T[1] * dir * len * r.rx, r.p[2] + r.T[2] * dir * len * r.rx],
        rx: r.rx * Math.cos(a) + (s === steps ? 1e-4 : 0), ry: r.ry * Math.cos(a) + (s === steps ? 1e-4 : 0), tilt: dir * a, t: k });
    }
    return out;
  };
  const c0 = o.cap0 ?? o.cap ?? true, c1 = o.cap1 ?? o.cap ?? true;
  if (c0) capped.push(...mk(rings[0], -1, rings[0].t));
  capped.push(...rings);
  if (c1) capped.push(...mk(rings[rings.length - 1], 1, rings[rings.length - 1].t).reverse());
  return capped;
}

// Swept tube through control points (Catmull-Rom), radius per point/function,
// oval sections via `sq` (or [rx scale, ry scale]); rounded ends by default.
export function tube(B, pts, radii, col, o = {}) {
  const V = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = V.length === 2 ? new THREE.LineCurve3(V[0], V[1]) : new THREE.CatmullRomCurve3(V, false, 'centripetal');
  const n = o.steps ?? Math.max(3, (pts.length - 1) * 3);
  const frames = curve.computeFrenetFrames(n, false);
  // Prefer a stable "up" so that oval sections face the same way along the tube
  const up = o.up ? new THREE.Vector3(...o.up).normalize() : null;
  const rings = [];
  const sq = o.sq ?? 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const T = frames.tangents[i].clone();
    let N, Bn;
    if (up) {
      Bn = new THREE.Vector3().crossVectors(T, up);
      if (Bn.lengthSq() < 1e-6) Bn = frames.binormals[i].clone();
      Bn.normalize();
      N = new THREE.Vector3().crossVectors(Bn, T).normalize();
    } else { N = frames.normals[i]; Bn = frames.binormals[i]; }
    const r = radiusAt(radii, t);
    rings.push({ p: [p.x, p.y, p.z], T: [T.x, T.y, T.z], N: [N.x, N.y, N.z], Bn: [Bn.x, Bn.y, Bn.z], rx: r, ry: r * sq, t, k: o.shadeAt ? o.shadeAt(t) : 1 });
  }
  // normal tilt from the change of radius along the length
  const len = curve.getLength();
  for (let i = 0; i < rings.length; i++) {
    const a = rings[Math.max(0, i - 1)], b = rings[Math.min(rings.length - 1, i + 1)];
    const ds = len * (b.t - a.t) || 1;
    rings[i].tilt = Math.atan2(-(b.rx - a.rx), ds);
  }
  skin(B, o.cap === false && o.cap0 == null && o.cap1 == null ? rings : addCaps(rings, o), col, o);
}

// Lathe: profile of [radius, y] (or [rx, y, rz, dz]) around the y axis.
// Section ovals come from rz (or o.sq), dz shifts a ring forward (+z).
export function lathe(B, prof, col, o = {}) {
  const rings = [];
  const ys = prof.map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let i = 0; i < prof.length; i++) {
    const [rx, y, rz0, dz = 0] = prof[i];
    const rz = rz0 ?? rx * (o.sq ?? 1);
    rings.push({ p: [o.dx ? o.dx(i) : 0, y, dz], T: [0, 1, 0], N: [1, 0, 0], Bn: [0, 0, -1], rx: Math.max(rx, 1e-4), ry: Math.max(rz, 1e-4), t: (y - y0) / ((y1 - y0) || 1), k: 1 });
  }
  for (let i = 0; i < rings.length; i++) {
    const a = rings[Math.max(0, i - 1)], b = rings[Math.min(rings.length - 1, i + 1)];
    // outward normal of the profile curve, whichever way the profile runs
    const dy = b.p[1] - a.p[1], sg = dy < 0 ? -1 : 1;
    rings[i].tilt = Math.atan2(-(b.rx - a.rx) * sg, Math.abs(dy));
  }
  if (o.tilts) o.tilts(rings);
  skin(B, rings, o.colAt ? o.colAt : col, o);
}

// Thick curved sheet: f(u, v) -> [x, y, z] over u,v in 0..1, given thickness
// (towards -normal). Colour runs along v. Used for capes, wings, tabards.
export function sheet(B, f, col, o = {}) {
  const nu = o.nu ?? 6, nv = o.nv ?? 6, th = o.thick ?? 0.015;
  const P = [], N = [];
  const e = 1e-3;
  for (let j = 0; j <= nv; j++) {
    const pr = [], nr = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = f(u, v);
      const pu = f(Math.min(1, u + e), v), pu0 = f(Math.max(0, u - e), v);
      const pv = f(u, Math.min(1, v + e)), pv0 = f(u, Math.max(0, v - e));
      const du = [pu[0] - pu0[0], pu[1] - pu0[1], pu[2] - pu0[2]];
      const dv = [pv[0] - pv0[0], pv[1] - pv0[1], pv[2] - pv0[2]];
      let nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      if (o.flipN) { nx = -nx; ny = -ny; nz = -nz; }
      pr.push(p); nr.push([nx / l, ny / l, nz / l]);
    }
    P.push(pr); N.push(nr);
  }
  const m = o.matrix || null;
  if (m) _nm.getNormalMatrix(m);
  const cc = [0, 0, 0], cb = [0, 0, 0];
  const backCol = o.back ?? null;
  const push = (p, n, c) => {
    _v.set(p[0], p[1], p[2]); _n.set(n[0], n[1], n[2]);
    if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
    B.pos.push(_v.x, _v.y, _v.z); B.nor.push(_n.x, _n.y, _n.z); B.col.push(c[0], c[1], c[2]);
  };
  const off = (p, n, s) => [p[0] - n[0] * th * s, p[1] - n[1] * th * s, p[2] - n[2] * th * s];
  const neg = (n) => [-n[0], -n[1], -n[2]];
  const vert = (j, i, side) => {
    const p = P[j][i], n = N[j][i];
    colourAt(col, j / nv, cc);
    if (side > 0) return [p, n, cc.slice()];
    colourAt(backCol ?? col, j / nv, cb);
    const k = o.backShade ?? 0.8;
    return [off(p, n, 1), neg(n), [cb[0] * k, cb[1] * k, cb[2] * k]];
  };
  const quad = (a, b, c, d) => { push(...a); push(...b); push(...c); push(...a); push(...c); push(...d); };
  const fl = !!o.flipN;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    // front (normal side), then back; flipped normals flip the winding too
    const a = vert(j, i, 1), b = vert(j, i + 1, 1), c = vert(j + 1, i + 1, 1), d = vert(j + 1, i, 1);
    const a2 = vert(j, i, -1), b2 = vert(j, i + 1, -1), c2 = vert(j + 1, i + 1, -1), d2 = vert(j + 1, i, -1);
    if (!fl) { quad(a, b, c, d); quad(a2, d2, c2, b2); } else { quad(a, d, c, b); quad(a2, b2, c2, d2); }
  }
  // edges, so the inverted-hull outline has something to grip; `inner` is a
  // neighbouring point inside the sheet, so the strip can face away from it
  const edge = (a0, a1, inner) => {
    const [pa, na, ca] = a0, [pb, nb, cbb] = a1;
    const sa = off(pa, na, 1), sb = off(pb, nb, 1);
    const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
    let out = [mid[0] - inner[0], mid[1] - inner[1], mid[2] - inner[2]];
    // keep it in the sheet's plane
    const dn = out[0] * na[0] + out[1] * na[1] + out[2] * na[2];
    out = [out[0] - na[0] * dn, out[1] - na[1] * dn, out[2] - na[2] * dn];
    const l = Math.hypot(...out) || 1;
    const en = [out[0] / l, out[1] / l, out[2] / l];
    const e1 = [sa[0] - pa[0], sa[1] - pa[1], sa[2] - pa[2]], e2 = [sb[0] - pa[0], sb[1] - pa[1], sb[2] - pa[2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (f[0] * en[0] + f[1] * en[1] + f[2] * en[2] >= 0) quad([pa, en, ca], [sa, en, ca], [sb, en, cbb], [pb, en, cbb]);
    else quad([pa, en, ca], [pb, en, cbb], [sb, en, cbb], [sa, en, ca]);
  };
  for (let i = 0; i < nu; i++) {
    edge(vert(0, i, 1), vert(0, i + 1, 1), P[1][i]);
    edge(vert(nv, i, 1), vert(nv, i + 1, 1), P[nv - 1][i]);
  }
  for (let j = 0; j < nv; j++) {
    edge(vert(j, 0, 1), vert(j + 1, 0, 1), P[j][1]);
    edge(vert(j, nu, 1), vert(j + 1, nu, 1), P[j][nu - 1]);
  }
}

// Ellipsoid (smooth sphere template) centred at x,y,z with radii rx,ry,rz.
export function ball(B, col, x, y, z, rx, ry = rx, rz = rx, o = {}) {
  const m = Math.max(rx, ry, rz);
  // studs, rivets, buttons and noses are too small for an outline
  if (m < 0.022 && B.detail && !o.outline) B = B.detail;
  B.shape(m >= 0.075 ? TPL.sphere : m >= 0.035 ? TPL.ball : TPL.sphereLo, col, { x, y, z, sx: rx * 2, sy: ry * 2, sz: rz * 2, rx: o.rx, ry: o.ry, rz: o.rz, matrix: o.matrix, grad: o.grad });
}

// Bevelled extrusion of a 2D outline (in x/y), centred on z; cached.
const extCache = new Map();
export function extrude(B, key, outline, col, o = {}) {
  let g = extCache.get(key);
  if (!g) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const depth = o.depth ?? 0.02, bv = o.bevel ?? 0.008;
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * (o.bevelSize ?? 0.8), bevelSegments: o.bevelSegments ?? 2, curveSegments: 6 });
    geo.translate(0, 0, -depth / 2);
    g = geo.index ? geo.toNonIndexed() : geo;
    if (o.smooth) { g.deleteAttribute('normal'); g = smoothNormals(g, o.smooth); }
    extCache.set(key, g);
  }
  const P = g.attributes.position.array, N = g.attributes.normal.array;
  const m = o.matrix || new THREE.Matrix4();
  _nm.getNormalMatrix(m);
  const cc = [0, 0, 0];
  const yr = o.gradY ? [o.gradY[0], o.gradY[1]] : null;
  for (let i = 0; i < P.length; i += 3) {
    _v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m);
    _n.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(_nm).normalize();
    B.pos.push(_v.x, _v.y, _v.z); B.nor.push(_n.x, _n.y, _n.z);
    colourAt(col, yr ? Math.min(1, Math.max(0, (P[i + 1] - yr[0]) / (yr[1] - yr[0]))) : 0.5, cc);
    // the bevelled rim reads a touch darker than the face
    const k = o.rim && Math.abs(N[i + 2]) < 0.9 ? o.rim : 1;
    B.col.push(cc[0] * k, cc[1] * k, cc[2] * k);
  }
}

// average normals of coincident corners that bend less than `angle` (radians)
function smoothNormals(g, angle) {
  g.computeVertexNormals();
  const P = g.attributes.position.array, N = g.attributes.normal.array;
  const map = new Map();
  const key = (i) => `${Math.round(P[i] * 1e4)},${Math.round(P[i + 1] * 1e4)},${Math.round(P[i + 2] * 1e4)}`;
  for (let i = 0; i < P.length; i += 3) {
    const k = key(i);
    (map.get(k) || map.set(k, []).get(k)).push(i);
  }
  const out = new Float32Array(N.length);
  const cos = Math.cos(angle);
  for (let i = 0; i < P.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (const j of map.get(key(i))) {
      if (N[i] * N[j] + N[i + 1] * N[j + 1] + N[i + 2] * N[j + 2] >= cos) { x += N[j]; y += N[j + 1]; z += N[j + 2]; }
    }
    const l = Math.hypot(x, y, z) || 1;
    out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

// colour utilities (hex in, hex out)
export function tint(hex, k) {
  _c.setHex(hex);
  return _c.setRGB(Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)).getHex();
}
export function blend(a, b, t) {
  _c.setHex(a); _c2.setHex(b);
  return _c.lerp(_c2, t).getHex();
}
// hue-preserving richer shade for shadows: darker and a little more saturated
export function deep(hex, k = 0.6) {
  _c.setHex(hex);
  const hsl = {};
  _c.getHSL(hsl);
  return _c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l * k).getHex();
}
