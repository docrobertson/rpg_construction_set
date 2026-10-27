// GeoBuilder: accumulates non-indexed, vertex-coloured triangles so that whole
// chunks of terrain (or a whole character model) become one draw call.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Template from a three.js geometry. `normals`: 'geo' keeps the geometry's own
// normals (smooth for spheres/cylinders), 'sphere' uses the direction from the
// centre (smooth blobs from very few faces), 'flat' computes faceted normals.
function templ(geo, yBase = true, normals = 'geo') {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeBoundingBox();
  const cy = (g.boundingBox.min.y + g.boundingBox.max.y) / 2;
  if (normals === 'sphere') {
    const P = g.attributes.position.array;
    const N = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) {
      _v.set(P[i], P[i + 1] - cy, P[i + 2]).normalize();
      N[i] = _v.x; N[i + 1] = _v.y; N[i + 2] = _v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  } else if (normals === 'flat' || !g.attributes.normal) {
    g.deleteAttribute('normal');
    g.computeVertexNormals();
  }
  if (yBase) g.translate(0, -g.boundingBox.min.y, 0);
  g.computeBoundingBox();
  return {
    pos: new Float32Array(g.attributes.position.array),
    nor: new Float32Array(g.attributes.normal.array),
    minY: g.boundingBox.min.y, maxY: g.boundingBox.max.y,
  };
}

function rawTempl(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return templ(g, false, 'flat');
}

// Template shapes: unit-sized, base at y=0 (except balls/icosahedra: centred)
export const TPL = {
  box: templ(new THREE.BoxGeometry(1, 1, 1)),
  cyl6: templ(new THREE.CylinderGeometry(0.5, 0.5, 1, 6)),
  cyl8: templ(new THREE.CylinderGeometry(0.5, 0.5, 1, 8)),
  cyl12: templ(new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
  cyl16: templ(new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
  cone4: templ(new THREE.ConeGeometry(0.5, 1, 4), true, 'flat'),
  cone5: templ(new THREE.ConeGeometry(0.5, 1, 5), true, 'flat'),
  cone6: templ(new THREE.ConeGeometry(0.5, 1, 6)),
  cone8: templ(new THREE.ConeGeometry(0.5, 1, 8)),
  cone12: templ(new THREE.ConeGeometry(0.5, 1, 12)),
  taper6: templ(new THREE.CylinderGeometry(0.35, 0.5, 1, 6)),
  taper8: templ(new THREE.CylinderGeometry(0.3, 0.5, 1, 8)),
  taper12: templ(new THREE.CylinderGeometry(0.36, 0.5, 1, 12)),
  limb: templ(new THREE.CylinderGeometry(0.42, 0.5, 1, 10)),
  thigh: templ(new THREE.CylinderGeometry(0.5, 0.38, 1, 10)),
  torso: templ(new THREE.CylinderGeometry(0.5, 0.4, 1, 14)),
  capsule: templ(new THREE.CapsuleGeometry(0.5, 1, 4, 10).scale(1, 0.5, 1)),
  ico0: templ(new THREE.IcosahedronGeometry(0.5, 0), false, 'flat'),
  blob: templ(new THREE.IcosahedronGeometry(0.5, 0), false, 'sphere'),
  ico1: templ(new THREE.IcosahedronGeometry(0.5, 1), false, 'sphere'),
  ball: templ(new THREE.SphereGeometry(0.5, 12, 8), false),
  dodec: templ(new THREE.DodecahedronGeometry(0.5, 0), false, 'flat'),
  hemi: templ(new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2)),
  dome: templ(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1)),
  torus: templ(new THREE.TorusGeometry(0.4, 0.1, 6, 16), false),
  prism: rawTempl((() => {
    // triangular prism (roof): base 1x1 at y=0, ridge along X at y=1
    const p = [];
    const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
    const E = [-0.5, 1, 0], F = [0.5, 1, 0];
    const tri = (a, b, c) => p.push(...a, ...b, ...c);
    tri(D, C, F); tri(D, F, E); // front slope
    tri(B, A, E); tri(B, E, F); // back slope
    tri(A, D, E); // left gable
    tri(C, B, F); // right gable
    tri(A, B, C); tri(A, C, D); // bottom
    return p;
  })()),
  wedge: rawTempl((() => {
    // ramp: low at +z, high at -z
    const p = [];
    const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
    const E = [-0.5, 1, -0.5], F = [0.5, 1, -0.5];
    const tri = (a, b, c) => p.push(...a, ...b, ...c);
    tri(D, C, F); tri(D, F, E);
    tri(B, A, E); tri(B, E, F);
    tri(A, D, E); tri(C, B, F);
    tri(A, B, C); tri(A, C, D);
    return p;
  })()),
};

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }

  get count() { return this.pos.length / 3; }

  _pushColor(color, k = 1) {
    if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
    this.col.push(_c.r * k, _c.g * k, _c.b * k);
  }

  _faceNormal(a, b, c) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b).normalize();
    for (let i = 0; i < 3; i++) this.nor.push(_n.x, _n.y, _n.z);
  }

  tri(a, b, c, color, ka = 1, kb = 1, kc = 1) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this._faceNormal(a, b, c);
    this._pushColor(color, ka); this._pushColor(color, kb); this._pushColor(color, kc);
  }

  // per-vertex colours (THREE.Color or hex)
  triC(a, b, c, ca, cb, cc) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this._faceNormal(a, b, c);
    this._pushColor(ca); this._pushColor(cb); this._pushColor(cc);
  }

  // quad a-b-c-d counter-clockwise when viewed from the front
  quad(a, b, c, d, color, ka = 1, kb = 1, kc = 1, kd = 1) {
    this.tri(a, b, c, color, ka, kb, kc);
    this.tri(a, c, d, color, ka, kc, kd);
  }

  quadC(a, b, c, d, ca, cb, cc, cd) {
    this.triC(a, b, c, ca, cb, cc);
    this.triC(a, c, d, ca, cc, cd);
  }

  // Raw vertex with explicit normal and linear-space rgb
  vert(x, y, z, nx, ny, nz, r, g, b) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(r, g, b);
  }

  // Add a template shape. opts: x,y,z position; sx,sy,sz scale; rx,ry,rz rotation;
  // grad (bottom darkening); flat (faceted normals)
  shape(tpl, color, o = {}) {
    _p.set(o.x || 0, o.y || 0, o.z || 0);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    const s = o.s ?? 1;
    _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
    _m.compose(_p, _q, _s);
    if (o.matrix) _m.premultiply(o.matrix);
    _nm.getNormalMatrix(_m);
    if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
    const r = _c.r, g = _c.g, b = _c.b;
    const grad = o.grad ?? 0;
    const span = tpl.maxY - tpl.minY || 1;
    const P = tpl.pos, N = tpl.nor;
    const start = this.pos.length;
    for (let i = 0; i < P.length; i += 3) {
      _v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(_m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (!o.flat) {
        _n.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(_nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      }
      const k = grad ? 1 - grad + grad * ((P[i + 1] - tpl.minY) / span) : 1;
      this.col.push(r * k, g * k, b * k);
    }
    if (o.flat) {
      const Q = this.pos;
      for (let i = start; i < Q.length; i += 9) {
        this._faceNormal([Q[i], Q[i + 1], Q[i + 2]], [Q[i + 3], Q[i + 4], Q[i + 5]], [Q[i + 6], Q[i + 7], Q[i + 8]]);
      }
    }
  }

  box(color, o) { this.shape(TPL.box, color, o); }

  append(other) {
    for (let i = 0; i < other.pos.length; i++) this.pos.push(other.pos[i]);
    for (let i = 0; i < other.nor.length; i++) this.nor.push(other.nor[i]);
    for (let i = 0; i < other.col.length; i++) this.col.push(other.col[i]);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// colour helpers
export function shade(hex, k) {
  _c.setHex(hex);
  _c.r = Math.min(1, _c.r * k); _c.g = Math.min(1, _c.g * k); _c.b = Math.min(1, _c.b * k);
  return _c.getHex();
}

export function mix(hexA, hexB, t) {
  const a = new THREE.Color(hexA), b = new THREE.Color(hexB);
  return a.lerp(b, t).getHex();
}
