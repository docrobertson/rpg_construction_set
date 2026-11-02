// Hanging shop signs: a painted board on a wrought-iron bracket, with a bold
// emblem on both faces so a shop reads from the street at a glance.
import * as THREE from 'three';
import { TPL } from './builder.js';
import { beam } from './roofs.js';

// which emblem a keeper's building shows
export const SIGN_FOR = {
  weapons: 'sword', armor: 'shield', bowyer: 'bow', provisions: 'bread', reagents: 'potion',
  inn: 'bed', tavern: 'tankard', healer: 'holy', sage: 'book', lord: 'crown', merchant: 'coins',
};
const BOARD = { sword: 0x2a3a5a, shield: 0x5a2a2a, bow: 0x2a4a2a, bread: 0x5a3a1a, potion: 0x3a2a5a, bed: 0x2a3a5a, tankard: 0x5a3a1a, holy: 0xe8e0c8, book: 0x4a2a2a, crown: 0x4a1a4a, coins: 0x2a4a3a };

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();

// A sign whose board faces +z, hanging under an arm that runs from `wall`
// (where it meets the building) to `tip`. Both are [x, y, z].
export function hangingSign(B, kind, wall, tip, s = 1) {
  const iron = 0x2a2624;
  beam(B, wall, tip, 0.035, 0.035, iron);
  // a little scrolled brace under the arm
  beam(B, [wall[0], wall[1] - 0.14, wall[2]], [(wall[0] + tip[0]) / 2, wall[1], (wall[2] + tip[2]) / 2], 0.025, 0.025, iron);
  const cx = (wall[0] + tip[0]) / 2 + (tip[0] - wall[0]) * 0.18, cz = (wall[2] + tip[2]) / 2 + (tip[2] - wall[2]) * 0.18;
  const top = wall[1] - 0.04;
  for (const dx of [-0.13, 0.13]) beam(B, [cx + dx * s, wall[1], cz], [cx + dx * s, top - 0.04, cz], 0.012, 0.012, iron);
  board(B, kind, cx, top - 0.04 - 0.17 * s, cz, s, 0);
}

// A board fixed flat to a wall facing +z (or rotated by ry)
export function wallSign(B, kind, x, y, z, s = 1, ry = 0) { board(B, kind, x, y, z, s, ry); }

function board(B, kind, x, y, z, s, ry) {
  const bc = BOARD[kind] ?? 0x3a2a1a;
  const W = 0.4 * s, H = 0.32 * s, D = 0.04 * s;
  _m.makeRotationY(ry).setPosition(x, y, z);
  const put = (tpl, color, o) => B.shape(tpl, color, { ...o, matrix: _m });
  put(TPL.box, 0x6a4424, { y: -H / 2 - 0.02 * s, sx: W + 0.05 * s, sy: H + 0.05 * s, sz: D });
  put(TPL.box, bc, { y: -H / 2, sx: W, sy: H, sz: D + 0.012 * s });
  // emblem on the front and, turned round, on the back
  for (const side of [1, -1]) {
    _r.makeRotationY(side > 0 ? 0 : Math.PI).premultiply(_m);
    const z0 = (D / 2 + 0.008 * s);
    emblem(B, kind, s, z0, _r);
  }
}

function emblem(B, kind, s, z0, M) {
  const put = (tpl, color, o) => B.shape(tpl, color, { ...o, x: (o.x ?? 0) * s, y: (o.y ?? 0) * s, z: z0 + (o.z ?? 0) * s, sx: (o.sx ?? 1) * s, sy: (o.sy ?? 1) * s, sz: (o.sz ?? 1) * s, matrix: M });
  const gold = 0xe8c050, steel = 0xd8dce4, wood = 0x8a5a2a;
  switch (kind) {
    case 'sword':
      put(TPL.box, steel, { x: 0.0, y: -0.27, sx: 0.045, sy: 0.2, sz: 0.02 });
      put(TPL.cone4, steel, { x: 0.0, y: -0.07, sx: 0.045, sy: 0.05, sz: 0.02 });
      put(TPL.box, gold, { x: 0, y: -0.29, sx: 0.16, sy: 0.03, sz: 0.03 });
      put(TPL.box, 0x6a3a1a, { x: 0, y: -0.34, sx: 0.035, sy: 0.05, sz: 0.03 });
      put(TPL.ball, gold, { x: 0, y: -0.345, sx: 0.045, sy: 0.045, sz: 0.03 });
      break;
    case 'shield':
      put(TPL.ball, 0x3a6ab8, { x: 0, y: -0.17, sx: 0.24, sy: 0.24, sz: 0.03 });
      put(TPL.cone4, 0x3a6ab8, { x: 0, y: -0.31, sx: 0.2, sy: 0.12, sz: 0.03, rz: Math.PI, ry: Math.PI / 4 });
      put(TPL.box, gold, { x: 0, y: -0.27, sx: 0.035, sy: 0.2, sz: 0.035 });
      put(TPL.box, gold, { x: 0, y: -0.19, sx: 0.17, sy: 0.035, sz: 0.035 });
      break;
    case 'bow':
      put(TPL.smile, wood, { x: -0.03, y: -0.17, sx: 0.32, sy: 0.32, sz: 0.25, rz: -Math.PI / 2 });
      put(TPL.box, 0xf0e8d0, { x: 0.05, y: -0.33, sx: 0.008, sy: 0.32, sz: 0.01 });
      put(TPL.box, 0xe8e0d0, { x: 0.0, y: -0.17, sx: 0.22, sy: 0.012, sz: 0.012 });
      put(TPL.cone4, steel, { x: -0.13, y: -0.17, sx: 0.04, sy: 0.04, sz: 0.02, rz: Math.PI / 2 });
      break;
    case 'potion':
      put(TPL.ball, 0x9a40d0, { x: 0, y: -0.2, sx: 0.17, sy: 0.17, sz: 0.06 });
      put(TPL.ball, 0xd8a0ff, { x: -0.03, y: -0.17, sx: 0.05, sy: 0.05, sz: 0.04, z: 0.02 });
      put(TPL.cyl8, 0xc8d8e0, { x: 0, y: -0.12, sx: 0.05, sy: 0.07, sz: 0.04 });
      put(TPL.cyl8, 0x8a5a2a, { x: 0, y: -0.06, sx: 0.06, sy: 0.03, sz: 0.05 });
      break;
    case 'bread':
      put(TPL.ball, 0xd89a48, { x: 0, y: -0.17, sx: 0.28, sy: 0.14, sz: 0.06 });
      for (const dx of [-0.07, 0, 0.07]) put(TPL.box, 0xf0d090, { x: dx, y: -0.135, sx: 0.015, sy: 0.07, sz: 0.02, rz: 0.5, z: 0.02 });
      put(TPL.box, 0xe0b040, { x: 0, y: -0.28, sx: 0.2, sy: 0.02, sz: 0.02 });
      break;
    case 'tankard':
      put(TPL.cyl8, 0xb0a890, { x: -0.02, y: -0.28, sx: 0.14, sy: 0.18, sz: 0.05 });
      for (const yy of [-0.25, -0.15]) put(TPL.cyl8, 0x5a4a3a, { x: -0.02, y: yy, sx: 0.145, sy: 0.015, sz: 0.055 });
      put(TPL.ball, 0xfaf4e0, { x: -0.02, y: -0.1, sx: 0.17, sy: 0.07, sz: 0.06 });
      put(TPL.torus, 0xb0a890, { x: 0.07, y: -0.19, sx: 0.12, sy: 0.12, sz: 0.25 });
      break;
    case 'bed':
      put(TPL.box, 0x8a5a2a, { x: 0, y: -0.28, sx: 0.28, sy: 0.08, sz: 0.03 });
      put(TPL.box, 0xc03a3a, { x: 0.03, y: -0.22, sx: 0.2, sy: 0.05, sz: 0.035 });
      put(TPL.box, 0xf4f0e8, { x: -0.1, y: -0.22, sx: 0.07, sy: 0.05, sz: 0.035 });
      put(TPL.box, 0x8a5a2a, { x: -0.14, y: -0.26, sx: 0.03, sy: 0.14, sz: 0.03 });
      put(TPL.ball, 0xf0e070, { x: 0.1, y: -0.07, sx: 0.06, sy: 0.06, sz: 0.02 });
      break;
    case 'holy':
      put(TPL.torus, gold, { x: 0, y: -0.15, sx: 0.2, sy: 0.2, sz: 0.25 });
      put(TPL.box, gold, { x: 0, y: -0.3, sx: 0.04, sy: 0.26, sz: 0.03 });
      put(TPL.box, gold, { x: 0, y: -0.19, sx: 0.2, sy: 0.04, sz: 0.03 });
      break;
    case 'book':
      put(TPL.box, 0xf4ecd8, { x: -0.065, y: -0.23, sx: 0.12, sy: 0.15, sz: 0.02, rz: 0.08 });
      put(TPL.box, 0xf4ecd8, { x: 0.065, y: -0.23, sx: 0.12, sy: 0.15, sz: 0.02, rz: -0.08 });
      put(TPL.box, 0x8a2a2a, { x: 0, y: -0.245, sx: 0.28, sy: 0.17, sz: 0.01, z: -0.01 });
      for (const yy of [-0.2, -0.17, -0.14]) for (const dx of [-0.065, 0.065]) put(TPL.box, 0x6a6a7a, { x: dx, y: yy, sx: 0.08, sy: 0.008, sz: 0.01, z: 0.012 });
      break;
    case 'crown':
      put(TPL.box, gold, { x: 0, y: -0.26, sx: 0.24, sy: 0.08, sz: 0.03 });
      for (const dx of [-0.1, 0, 0.1]) put(TPL.cone4, gold, { x: dx, y: -0.18, sx: 0.06, sy: dx ? 0.08 : 0.11, sz: 0.03 });
      put(TPL.ball, 0xd02a3a, { x: 0, y: -0.22, sx: 0.04, sy: 0.04, sz: 0.03, z: 0.015 });
      break;
    case 'coins':
      for (let i = 0; i < 4; i++) put(TPL.cyl8, gold, { x: -0.05 + (i % 2) * 0.01, y: -0.33 + i * 0.035, sx: 0.12, sy: 0.03, sz: 0.04, rx: 0 });
      put(TPL.cyl12, gold, { x: 0.07, y: -0.2, sx: 0.13, sy: 0.13, sz: 0.03, rx: Math.PI / 2 });
      break;
  }
}
