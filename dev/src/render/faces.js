// Faces: painted eyes, brows and mouths on a small canvas atlas, applied as
// decals that hug a sculpted head. The decal geometry samples the same
// surface function as the head itself, so the paint sits snugly on the skin.
// Texture cells are transparent around the features (the material uses
// alpha-to-coverage), and every other vertex of a model samples the plain
// white cell in the top-left corner.
import * as THREE from 'three';

const N = 8, S = 128; // 8 x 8 cells of 128 px
// unit face rect painted into each cell (head radius = 1, eyes on y = 0)
const FX0 = -0.85, FX1 = 0.85, FY0 = -1.05, FY1 = 0.65;

export const WHITE_UV = [0.5 / N, 1 - 0.5 / N];
// a second white cell in the top-right corner marks metal (the shader adds
// a crisp highlight wherever uvs fall in it)
export const METAL_UV = [1 - 0.5 / N, 1 - 0.5 / N];

export const IRIS = { brown: 0, blue: 1, green: 2, grey: 3, amber: 4, violet: 5 };
const IRIS_COLS = ['#6b4126', '#3f7ec4', '#4c8f3c', '#7d8c98', '#b8801e', '#7a4ab4'];

// rows of the atlas
export const FACE_ROWS = { bold: 1, fair: 2, elf: 3, elfFair: 4, orc: 5, goblin: 6, troll: 7 };
export const BROWS = { soft: 1, bold: 2, angry: 3, elf: 4, bushy: 5, fair: 6 };

let atlas = null;

export function faceAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N * S;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  g.fillRect((N - 1) * S, 0, S, S);
  for (const [name, col] of Object.entries(BROWS)) cell(g, 0, col, (c) => drawBrows(c, name));
  for (const [style, row] of Object.entries(FACE_ROWS)) {
    for (let i = 0; i < IRIS_COLS.length; i++) cell(g, row, i, (c) => drawFace(c, style, i));
  }
  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}

// paint one cell in unit face coordinates (y up)
function cell(g, row, col, fn) {
  g.save();
  g.beginPath();
  g.rect(col * S + 2, row * S + 2, S - 4, S - 4);
  g.clip();
  const k = S / (FX1 - FX0);
  g.setTransform(k, 0, 0, -k, col * S - FX0 * k, row * S + FY1 * k);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  fn(g);
  g.restore();
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// almond-shaped eye opening: inner corner, outer corner, lid heights
function almond(g, ex, ey, s, w, top, bot, lift) {
  const ix = ex - s * w, ox = ex + s * w;
  g.beginPath();
  g.moveTo(ix, ey);
  g.bezierCurveTo(ix + s * w * 0.35, ey + top, ox - s * w * 0.45, ey + top + lift * 0.6, ox, ey + lift);
  g.bezierCurveTo(ox - s * w * 0.4, ey - bot + lift * 0.3, ix + s * w * 0.4, ey - bot, ix, ey);
  g.closePath();
}

function eye(g, ex, ey, s, o) {
  const { w, top, bot, lift = 0, iris, irisR, sclera = '#f7f2ea', lid = '#2a1a12', lidW = 0.05, slit = false, lashes = false } = o;
  almond(g, ex, ey, s, w, top, bot, lift);
  g.fillStyle = sclera;
  g.fill();
  // iris + pupil, clipped by the lids
  g.save();
  almond(g, ex, ey, s, w, top, bot, lift);
  g.clip();
  const cx = ex - s * w * 0.08, cy = ey + top * 0.12;
  const gr = g.createRadialGradient(cx, cy + irisR * 0.3, irisR * 0.1, cx, cy, irisR);
  gr.addColorStop(0, shadeHex(iris, 1.45));
  gr.addColorStop(0.65, iris);
  gr.addColorStop(1, shadeHex(iris, 0.45));
  g.fillStyle = gr;
  g.beginPath(); g.arc(cx, cy, irisR, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#140c0a';
  g.beginPath();
  if (slit) g.ellipse(cx, cy, irisR * 0.18, irisR * 0.8, 0, 0, Math.PI * 2);
  else g.arc(cx, cy, irisR * 0.46, 0, Math.PI * 2);
  g.fill();
  // shadow of the upper lid on the eyeball
  g.fillStyle = 'rgba(60,30,20,0.16)';
  g.beginPath(); g.ellipse(ex, ey + top * 1.05, w * 1.2, top * 0.45, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  // catch-lights (the light comes from the upper left)
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(cx - irisR * 0.38, cy + irisR * 0.38, irisR * 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + irisR * 0.4, cy - irisR * 0.42, irisR * 0.13, 0, Math.PI * 2); g.fill();
  // upper lid line, heavier towards the outer corner
  const ix = ex - s * w, ox = ex + s * w;
  g.strokeStyle = lid;
  g.lineWidth = lidW;
  g.beginPath();
  g.moveTo(ix - s * 0.01, ey - 0.005);
  g.bezierCurveTo(ix + s * w * 0.35, ey + top + 0.01, ox - s * w * 0.45, ey + top + lift * 0.6 + 0.01, ox + s * 0.02, ey + lift - 0.005);
  g.stroke();
  g.lineWidth = lidW * 1.5;
  g.beginPath();
  g.moveTo(ex + s * w * 0.35, ey + top * 0.92 + lift * 0.5);
  g.quadraticCurveTo(ox - s * w * 0.05, ey + top * 0.6 + lift, ox + s * (lashes ? 0.08 : 0.025), ey + lift + (lashes ? 0.05 : 0));
  g.stroke();
  if (lashes) {
    g.lineWidth = 0.03;
    for (let i = 0; i < 2; i++) {
      const bx = ox - s * w * (0.12 + i * 0.28), by = ey + top * (0.85 + i * 0.1) + lift * 0.8;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + s * 0.06, by + 0.06); g.stroke();
    }
  }
  // a hint of the lower lid at the outer half
  g.lineWidth = lidW * 0.45;
  g.strokeStyle = 'rgba(70,35,25,0.75)';
  g.beginPath();
  g.moveTo(ox - s * w * 0.1, ey + lift * 0.4 - bot * 0.55);
  g.quadraticCurveTo(ex + s * w * 0.2, ey - bot * 1.05, ex - s * w * 0.15, ey - bot * 0.95);
  g.stroke();
}

function drawFace(g, style, ic) {
  const iris = IRIS_COLS[ic];
  const fair = style === 'fair' || style === 'elfFair';
  const elf = style === 'elf' || style === 'elfFair';
  for (const s of [-1, 1]) {
    const ex = s * 0.37, ey = -0.04;
    if (style === 'orc') {
      eye(g, ex, ey - 0.02, s, { w: 0.15, top: 0.07, bot: 0.06, lift: 0.06, iris: ['#d02818', '#e0a020', '#d02818', '#e0a020', '#d02818', '#e0a020'][ic], irisR: 0.075, sclera: '#efe2b0', lidW: 0.07, lid: '#1a120c' });
    } else if (style === 'goblin') {
      eye(g, ex * 1.05, ey, s, { w: 0.2, top: 0.17, bot: 0.15, lift: 0.04, iris: ['#f0c820', '#e04020', '#f0c820', '#a0e030', '#f0c820', '#e04020'][ic], irisR: 0.15, sclera: '#fff8d8', slit: true, lidW: 0.05, lid: '#1a140a' });
    } else if (style === 'troll') {
      eye(g, ex, ey, s, { w: 0.14, top: 0.08, bot: 0.06, lift: 0.07, iris: ['#e03020', '#e0a020', '#e03020', '#e0a020', '#e03020', '#e0a020'][ic], irisR: 0.07, sclera: '#f2e8c0', lidW: 0.06, lid: '#1a140c' });
    } else if (elf) {
      eye(g, ex, ey + 0.01, s, { w: 0.22, top: fair ? 0.19 : 0.16, bot: 0.13, lift: 0.07, iris, irisR: 0.135, lashes: fair, lidW: fair ? 0.06 : 0.052 });
    } else {
      eye(g, ex, ey, s, { w: 0.21, top: fair ? 0.2 : 0.17, bot: 0.14, lift: fair ? 0.03 : 0.015, iris, irisR: 0.14, lashes: fair, lidW: fair ? 0.06 : 0.052 });
    }
  }
  // mouths
  g.lineCap = 'round';
  if (style === 'goblin') {
    g.fillStyle = '#3a1410';
    g.beginPath(); g.moveTo(-0.34, -0.42); g.quadraticCurveTo(0, -0.78, 0.34, -0.42); g.quadraticCurveTo(0, -0.55, -0.34, -0.42); g.fill();
    g.fillStyle = '#f4ecd0';
    for (const x of [-0.18, -0.06, 0.06, 0.18]) { g.beginPath(); g.moveTo(x - 0.045, -0.475 - Math.abs(x) * 0.1 + 0.02); g.lineTo(x + 0.045, -0.475 - Math.abs(x) * 0.1 + 0.02); g.lineTo(x, -0.56 + Math.abs(x) * 0.25); g.fill(); }
  } else if (style === 'orc' || style === 'troll') {
    g.strokeStyle = '#2a120c';
    g.lineWidth = 0.05;
    g.beginPath(); g.moveTo(-0.24, -0.5); g.quadraticCurveTo(0, -0.43, 0.24, -0.5); g.stroke();
  } else if (fair) {
    // soft lips: a rosy lower lip under a fine mouth line
    g.save();
    g.translate(0, 0.06);
    g.fillStyle = '#d0706a';
    g.beginPath(); g.moveTo(-0.16, -0.5); g.quadraticCurveTo(0, -0.66, 0.16, -0.5); g.quadraticCurveTo(0, -0.53, -0.16, -0.5); g.fill();
    g.fillStyle = '#bc5c56';
    g.beginPath(); g.moveTo(-0.16, -0.5); g.quadraticCurveTo(-0.07, -0.43, 0, -0.47); g.quadraticCurveTo(0.07, -0.43, 0.16, -0.5); g.quadraticCurveTo(0, -0.52, -0.16, -0.5); g.fill();
    g.strokeStyle = '#5a2420';
    g.lineWidth = 0.03;
    g.beginPath(); g.moveTo(-0.17, -0.492); g.quadraticCurveTo(0, -0.535, 0.17, -0.492); g.stroke();
    g.fillStyle = '#f4b4ac';
    g.beginPath(); g.ellipse(0.035, -0.57, 0.045, 0.016, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  } else {
    // a confident half-smile
    g.strokeStyle = '#5a261c';
    g.lineWidth = 0.042;
    g.beginPath(); g.moveTo(-0.18, -0.42); g.quadraticCurveTo(0.0, -0.52, 0.2, -0.4); g.stroke();
    g.strokeStyle = 'rgba(90,38,28,0.7)';
    g.lineWidth = 0.026;
    g.beginPath(); g.moveTo(-0.07, -0.55); g.quadraticCurveTo(0, -0.57, 0.07, -0.55); g.stroke();
  }
}

// brows are painted white and tinted by the decal's vertex colour (the hair)
function drawBrows(g, name) {
  g.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    const ex = s * 0.37;
    const P = {
      soft: { y: 0.27, w: 0.2, th: 0.075, arch: 0.07, tilt: 0.0 },
      bold: { y: 0.25, w: 0.21, th: 0.105, arch: 0.04, tilt: -0.05 },
      angry: { y: 0.24, w: 0.21, th: 0.11, arch: 0.0, tilt: -0.14 },
      elf: { y: 0.29, w: 0.22, th: 0.06, arch: 0.05, tilt: 0.1 },
      bushy: { y: 0.25, w: 0.23, th: 0.15, arch: 0.05, tilt: -0.06 },
      fair: { y: 0.3, w: 0.2, th: 0.05, arch: 0.08, tilt: 0.03 },
    }[name];
    const ix = ex - s * P.w, ox = ex + s * P.w;
    P.y -= 0.02;
    const iy = P.y - P.tilt, oy = P.y + P.tilt * 0.6;
    g.beginPath();
    g.moveTo(ix, iy - P.th * 0.5);
    g.quadraticCurveTo(ex, P.y + P.arch * 2 - P.th * 0.3, ox, oy - P.th * 0.1);
    g.quadraticCurveTo(ex, P.y + P.arch * 2 + P.th * 0.9, ix, iy + P.th * 0.5);
    g.closePath();
    g.fill();
  }
}

// ---------- the head ----------
// A deformed sphere: narrower, longer jaw; a flatter face; optional brow
// ridge. `sh` tunes it per race and per face.
function headPoint(th, ph, sh) {
  const sx = Math.sin(th) * Math.sin(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.cos(ph);
  let x = sx * sh.w, y = sy, z = sz * sh.d;
  if (sy < 0) {
    const lo = -sy;
    x *= 1 - sh.taper * lo * lo;
    y *= 1 + sh.jawLen * lo;
    // chin and jaw come forward a little
    if (sz > 0) z += sh.chin * lo * lo * sz * sz;
    if (sh.jaw) x *= 1 + sh.jaw * Math.max(0, lo - 0.2) * Math.max(0, 1 - lo) * 2;
  } else {
    // a fuller, rounder cranium
    y *= sh.crown;
  }
  if (sz > 0 && sh.ridge) {
    const b = Math.exp(-(((sy - 0.22) / 0.12) ** 2)) * sz ** 3;
    z += sh.ridge * b;
  }
  // face plane: flatten the front slightly so the painted features don't
  // wrap too far round the sides
  if (sz > 0) z -= sh.flat * sz ** 6;
  return [x, y, z];
}

const SHAPES = {
  hero: { w: 0.92, d: 0.94, taper: 0.36, jawLen: 0.06, chin: 0.06, crown: 1.03, ridge: 0.0, flat: 0.06, jaw: 0.04 },
  strong: { w: 0.93, d: 0.95, taper: 0.22, jawLen: 0.12, chin: 0.1, crown: 1.0, ridge: 0.02, flat: 0.06, jaw: 0.2 },
  fair: { w: 0.9, d: 0.93, taper: 0.46, jawLen: 0.02, chin: 0.05, crown: 1.05, ridge: 0.0, flat: 0.05, jaw: 0.02 },
  elf: { w: 0.88, d: 0.93, taper: 0.52, jawLen: 0.1, chin: 0.07, crown: 1.04, ridge: 0.0, flat: 0.05, jaw: 0.0 },
  dwarf: { w: 0.96, d: 0.96, taper: 0.2, jawLen: 0.08, chin: 0.04, crown: 0.98, ridge: 0.05, flat: 0.06, jaw: 0.15 },
  orc: { w: 0.98, d: 0.95, taper: 0.05, jawLen: 0.26, chin: 0.18, crown: 0.86, ridge: 0.14, flat: 0.04, jaw: 0.35 },
  goblin: { w: 0.98, d: 0.9, taper: 0.55, jawLen: 0.06, chin: 0.05, crown: 1.05, ridge: 0.04, flat: 0.04, jaw: 0.0 },
  troll: { w: 0.86, d: 0.95, taper: 0.2, jawLen: 0.32, chin: 0.2, crown: 0.9, ridge: 0.12, flat: 0.03, jaw: 0.2 },
  skull: { w: 0.86, d: 0.95, taper: 0.45, jawLen: 0.12, chin: 0.08, crown: 1.06, ridge: 0.06, flat: 0.05, jaw: 0.0 },
};

// Heads tip back a little (chin up) so faces present to the high game camera.
let TILT = 0, cT = 1, sT = 0;
export function setHeadTilt(t) { TILT = t; cT = Math.cos(t); sT = Math.sin(t); }
const rot = (v) => [v[0], v[1] * cT + v[2] * sT, -v[1] * sT + v[2] * cT];

// position + normal on the head surface (unit radius)
function surf(th, ph, sh) {
  const r = surf0(th, ph, sh);
  return TILT ? { p: rot(r.p), n: rot(r.n) } : r;
}
function surf0(th, ph, sh) {
  const p = headPoint(th, ph, sh);
  const e = 1e-3;
  const a = headPoint(th + e, ph, sh), b = headPoint(th - e, ph, sh);
  const c = headPoint(th, ph + e, sh), d = headPoint(th, ph - e, sh);
  const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let l = Math.hypot(...n);
  if (l < 1e-9) n = [0, Math.sign(Math.cos(th)) || 1, 0], l = 1;
  n = n.map((x) => x / l);
  // make it point outward
  if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = n.map((x) => -x);
  return { p, n };
}

export function headSurf(shapeName, th, ph) {
  return surf(Math.min(Math.PI - 1e-3, Math.max(1e-3, th)), ph, SHAPES[shapeName] || SHAPES.hero);
}

// find the front surface point under unit-face (x, y)
const frontCache = new Map();
export function facePoint(shapeName, x, y) {
  const sh = SHAPES[shapeName] || SHAPES.hero;
  const ck = shapeName + TILT;
  let grid = frontCache.get(ck);
  if (!grid) {
    grid = [];
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
      const th = 0.05 + (i / 60) * (Math.PI - 0.1), ph = -1.5 + (j / 60) * 3;
      grid.push([th, ph, ...surf(th, ph, sh).p]);
    }
    frontCache.set(ck, grid);
  }
  let best = null, bd = Infinity;
  for (const g of grid) {
    if (g[4] < 0) continue;
    const d = (g[2] - x) ** 2 + (g[3] - y) ** 2;
    if (d < bd) { bd = d; best = g; }
  }
  // refine a little by local search
  let [th, ph] = best;
  let step = 0.03;
  for (let k = 0; k < 24; k++) {
    let moved = false;
    for (const [a, b] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const p = surf(th + a, ph + b, sh).p;
      const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
      if (d < bd) { bd = d; th += a; ph += b; moved = true; }
    }
    if (!moved) step /= 2;
  }
  return surf(th, ph, sh);
}

// Build the head into B (and its painted face into F, with uvs).
// o: { x, y, z, r, skin, shape, row, iris, brow, browColor, faceShade }
export function sculptHead(B, F, o) {
  const sh = SHAPES[o.shape] || SHAPES.hero;
  const r = o.r;
  const sk = new THREE.Color(o.skin);
  const blush = new THREE.Color(0xe86a5a);
  const tmp = new THREE.Color();
  const put = (Bd, s, col, uv) => {
    Bd.pos.push(o.x + s.p[0] * r, o.y + s.p[1] * r, o.z + s.p[2] * r);
    Bd.nor.push(s.n[0], s.n[1], s.n[2]);
    Bd.col.push(col.r, col.g, col.b);
    if (uv) Bd.uv.push(uv[0], uv[1]);
  };
  // skin: a little warmer and darker under the jaw and at the back
  const nth = 12, nph = 18;
  const grid = [];
  for (let i = 0; i <= nth; i++) {
    const row = [];
    for (let j = 0; j <= nph; j++) {
      const th = (i / nth) * Math.PI, ph = (j / nph) * Math.PI * 2;
      const s = surf(Math.min(Math.PI - 1e-3, Math.max(1e-3, th)), ph, sh);
      const k = 0.86 + 0.14 * Math.min(1, Math.max(0, (s.p[1] + 0.9) / 1.3));
      const c = sk.clone().multiplyScalar(k);
      if (o.blush && s.p[2] > 0) {
        const q = surf0(Math.min(Math.PI - 1e-3, Math.max(1e-3, th)), ph, sh).p;
        const b = Math.exp(-(((Math.abs(q[0]) - 0.44) ** 2) / 0.02 + ((q[1] + 0.25) ** 2) / 0.02));
        c.lerp(blush, b * o.blush);
      }
      row.push({ s, c });
    }
    grid.push(row);
  }
  for (let i = 0; i < nth; i++) for (let j = 0; j < nph; j++) {
    const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
    put(B, a.s, a.c); put(B, b.s, b.c); put(B, c.s, c.c);
    put(B, a.s, a.c); put(B, c.s, c.c); put(B, d.s, d.c);
  }
  // decals
  const decal = (cellRow, cellCol, rect, lift, colour) => {
    if (!F) return;
    F.uv ||= [];
    const col = tmp.setHex(colour).clone();
    const ni = 18, nj = 22;
    const pts = [];
    for (let i = 0; i <= ni; i++) {
      const rowp = [];
      for (let j = 0; j <= nj; j++) {
        const th = 0.12 * Math.PI + (i / ni) * 0.8 * Math.PI, ph = -1.35 + (j / nj) * 2.7;
        const s = surf(th, ph, sh);
        const p = surf0(th, ph, sh).p; // paint is mapped before the head tips back
        const inside = p[2] > 0 && p[0] >= rect[0] && p[0] <= rect[1] && p[1] >= rect[2] && p[1] <= rect[3];
        const u = (cellCol + (p[0] - FX0) / (FX1 - FX0)) / N;
        const v = 1 - (cellRow + (FY1 - p[1]) / (FY1 - FY0)) / N;
        rowp.push({ s: { p: [s.p[0] + s.n[0] * lift, s.p[1] + s.n[1] * lift, s.p[2] + s.n[2] * lift], n: s.n }, inside, uv: [u, v] });
      }
      pts.push(rowp);
    }
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const a = pts[i][j], b = pts[i + 1][j], c = pts[i + 1][j + 1], d = pts[i][j + 1];
      if (!(a.inside && b.inside && c.inside && d.inside)) continue;
      put(F, a.s, col, a.uv); put(F, b.s, col, b.uv); put(F, c.s, col, c.uv);
      put(F, a.s, col, a.uv); put(F, c.s, col, c.uv); put(F, d.s, col, d.uv);
    }
  };
  if (o.row != null) decal(o.row, o.iris ?? 0, [FX0 + 0.02, FX1 - 0.02, FY0 + 0.02, 0.2], 0.012, 0xffffff);
  if (o.brow != null) decal(0, o.brow, [FX0 + 0.02, FX1 - 0.02, 0.12, FY1 - 0.02], 0.02, o.browColor ?? 0x3a2414);
  return {
    // world position of a point on the face, given unit-face x, y (+ lift)
    at: (x, y, lift = 0) => {
      const s = facePoint(o.shape, x, y);
      return [o.x + (s.p[0] + s.n[0] * lift) * r, o.y + (s.p[1] + s.n[1] * lift) * r, o.z + (s.p[2] + s.n[2] * lift) * r];
    },
    shape: sh,
  };
}
