// Decoration builders: chunky low-poly props placed on top of terrain tiles.
// Each builder receives a context:
//   B (lit geometry), G (glow geometry), W (water geometry),
//   x, z (tile corner in world space), cx, cz (tile centre), y (surface height),
//   t (terrain def), r(k) deterministic random, nb(dx,dy) neighbour terrain def,
//   map (the map being drawn)
import { TPL, shade } from './builder.js';
import { T } from '../data/terrain.js';

const GREENS = [0x3f8a2e, 0x4c9634, 0x356f27, 0x5aa339, 0x6a9a2c];
const PINES = [0x2b5e2e, 0x24522a, 0x356b33, 0x2f6438];
const ROCKS = [0x8a8278, 0x7d756b, 0x958d82, 0x847a6c];
const ROOFS = [0xa83a2a, 0x9a4a2a, 0x4a5a78, 0x7a3a5a, 0x3a6a4a];
const TRUNK = 0x6b4a2b;

export function tree(B, x, y, z, s, r, palette = GREENS) {
  B.shape(TPL.cyl6, TRUNK, { x, y, z, sx: 0.09 * s, sy: 0.32 * s, sz: 0.09 * s, grad: 0.3 });
  const g = palette[Math.floor(r * palette.length) % palette.length];
  B.shape(TPL.ico0, g, { x, y: y + 0.42 * s, z, s: 0.5 * s, ry: r * 6, grad: 0.35 });
  B.shape(TPL.ico0, shade(g, 1.12), { x: x + 0.07 * s, y: y + 0.6 * s, z: z + 0.03 * s, s: 0.34 * s, ry: r * 9, grad: 0.3 });
}

export function pine(B, x, y, z, s, r, snowy = false) {
  B.shape(TPL.cyl6, 0x5a3e24, { x, y, z, sx: 0.07 * s, sy: 0.22 * s, sz: 0.07 * s });
  const c = PINES[Math.floor(r * PINES.length) % PINES.length];
  const ry = r * 5;
  B.shape(TPL.cone6, c, { x, y: y + 0.14 * s, z, sx: 0.46 * s, sy: 0.4 * s, sz: 0.46 * s, ry, grad: 0.4 });
  B.shape(TPL.cone6, shade(c, 1.08), { x, y: y + 0.34 * s, z, sx: 0.36 * s, sy: 0.36 * s, sz: 0.36 * s, ry: ry + 0.5, grad: 0.4 });
  B.shape(TPL.cone6, snowy ? 0xeef3f6 : shade(c, 1.16), { x, y: y + 0.54 * s, z, sx: 0.24 * s, sy: 0.32 * s, sz: 0.24 * s, ry, grad: 0.3 });
}

function rock(B, x, y, z, s, r, color) {
  B.shape(TPL.dodec, color ?? ROCKS[Math.floor(r * 4) % 4], { x, y: y + 0.12 * s, z, sx: 0.32 * s, sy: 0.24 * s, sz: 0.28 * s, ry: r * 7, rx: r * 0.4, grad: 0.3 });
}

function house(B, x, y, z, w, d, hgt, roof, wall = 0xe8dcc0, ry = 0) {
  const o = { ry };
  B.box(wall, { x, y, z, sx: w, sy: hgt, sz: d, ...o, grad: 0.2 });
  // beams
  B.box(0x5a3a22, { x, y: y + hgt - 0.02, z, sx: w + 0.02, sy: 0.03, sz: d + 0.02, ...o });
  B.shape(TPL.prism, roof, { x, y: y + hgt, z, sx: w + 0.08, sy: hgt * 0.75, sz: d + 0.08, ...o, grad: 0.25 });
}

function flag(B, x, y, z, color, s = 1) {
  B.box(0x3a3028, { x, y, z, sx: 0.02 * s, sy: 0.4 * s, sz: 0.02 * s });
  B.box(color, { x: x + 0.07 * s, y: y + 0.3 * s, z, sx: 0.13 * s, sy: 0.08 * s, sz: 0.01 * s });
}

function tower(B, x, y, z, rad, hgt, stone, roof, G, glowColor) {
  B.shape(TPL.cyl8, stone, { x, y, z, sx: rad * 2, sy: hgt, sz: rad * 2, grad: 0.25 });
  B.shape(TPL.cone8, roof, { x, y: y + hgt, z, sx: rad * 2.5, sy: rad * 2.6, sz: rad * 2.5, grad: 0.2 });
  if (G && glowColor) G.box(glowColor, { x, y: y + hgt * 0.7, z: z + rad * 0.95, sx: rad * 0.5, sy: rad * 0.7, sz: 0.02 });
}

function mound(B, x, y, z, sx, sy, sz, color, r) {
  B.shape(TPL.hemi, color, { x, y, z, sx, sy, sz, ry: r * 6, grad: 0.25 });
}

function fire(G, x, y, z, s = 1) {
  G.shape(TPL.cone5, 0xff6a10, { x, y, z, sx: 0.16 * s, sy: 0.26 * s, sz: 0.16 * s });
  G.shape(TPL.cone5, 0xffc030, { x, y, z, sx: 0.09 * s, sy: 0.18 * s, sz: 0.09 * s, ry: 0.6 });
}

function isWallish(t) { return t && (t.wall || t.door || t.key === 'fence' || t.key === 'palisade'); }

export const DECOR = {
  tufts(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.35) {
      const n = 2 + Math.floor(r(2) * 3);
      for (let i = 0; i < n; i++) {
        const px = cx - 0.35 + r(10 + i) * 0.7, pz = cz - 0.35 + r(20 + i) * 0.7;
        B.shape(TPL.cone4, 0x5f9a3e, { x: px, y, z: pz, sx: 0.05, sy: 0.08 + r(30 + i) * 0.06, sz: 0.05, ry: r(40 + i) * 3 });
      }
    }
    if (r(3) < 0.08) B.shape(TPL.ico0, 0x4f8a34, { x: cx + (r(4) - 0.5) * 0.6, y: y + 0.05, z: cz + (r(5) - 0.5) * 0.6, s: 0.18, grad: 0.3 });
    if (r(6) < 0.04) rock(B, cx + (r(7) - 0.5) * 0.5, y, cz + (r(8) - 0.5) * 0.5, 0.4, r(9));
  },
  flowers(c) {
    const { B, cx, cz, y, r } = c;
    const cols = [0xf5e050, 0xe87070, 0xf4f0e8, 0xb080f0, 0xf0a040];
    if (r(0) < 0.35) return;
    const n = 2 + Math.floor(r(1) * 3);
    const col = cols[Math.floor(r(2) * cols.length)];
    for (let i = 0; i < n; i++) {
      const px = cx - 0.4 + r(10 + i) * 0.8, pz = cz - 0.4 + r(20 + i) * 0.8;
      B.box(0x4f8a34, { x: px, y, z: pz, sx: 0.012, sy: 0.05, sz: 0.012 });
      B.box(i % 3 === 2 ? cols[Math.floor(r(30 + i) * cols.length)] : col, { x: px, y: y + 0.05, z: pz, sx: 0.035, sy: 0.02, sz: 0.035, ry: r(40 + i) });
    }
  },
  trees(c) {
    const { B, cx, cz, y, r } = c;
    const n = 2 + Math.floor(r(1) * 2);
    const spots = [[-0.22, -0.2], [0.22, -0.15], [-0.05, 0.22], [0.25, 0.25]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[(i + Math.floor(r(2) * 4)) % 4];
      tree(B, cx + ox + (r(10 + i) - 0.5) * 0.12, y, cz + oz + (r(20 + i) - 0.5) * 0.12, 0.85 + r(30 + i) * 0.4, r(40 + i));
    }
  },
  pines(c) {
    const { B, cx, cz, y, r, map } = c;
    const snowy = map && map.type === 'world' && c.nbCount((t) => t.key === 'snow' || t.key === 'peaks') > 1;
    const n = 3 + Math.floor(r(1) * 2);
    const spots = [[-0.24, -0.22], [0.22, -0.2], [-0.2, 0.2], [0.24, 0.22], [0, 0]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = spots[(i + Math.floor(r(2) * 5)) % 5];
      pine(B, cx + ox + (r(10 + i) - 0.5) * 0.1, y, cz + oz + (r(20 + i) - 0.5) * 0.1, 0.8 + r(30 + i) * 0.45, r(40 + i), snowy);
    }
  },
  hill(c) {
    const { B, cx, cz, y, r, t } = c;
    mound(B, cx + (r(1) - 0.5) * 0.15, y, cz + (r(2) - 0.5) * 0.15, 0.95, 0.26 + r(3) * 0.12, 0.85, shade(t.top, 1.02), r(4));
    if (r(5) < 0.5) mound(B, cx + (r(6) - 0.5) * 0.5, y, cz + (r(7) - 0.5) * 0.5, 0.5, 0.16, 0.5, shade(t.top, 0.92), r(8));
    if (r(9) < 0.25) rock(B, cx + (r(10) - 0.5) * 0.5, y + 0.05, cz + (r(11) - 0.5) * 0.5, 0.5, r(12));
  },
  mountain(c) { mountainDeco(c, false); },
  peak(c) { mountainDeco(c, true); },
  reeds(c) {
    const { B, W, cx, cz, y, r } = c;
    // dark pools
    if (r(1) < 0.7) {
      const px = cx + (r(2) - 0.5) * 0.4, pz = cz + (r(3) - 0.5) * 0.4, s = 0.18 + r(4) * 0.15;
      W.quad([px - s, y + 0.012, pz + s], [px + s, y + 0.012, pz + s], [px + s, y + 0.012, pz - s], [px - s, y + 0.012, pz - s], 0x2a3a2a);
    }
    const n = 3 + Math.floor(r(5) * 5);
    for (let i = 0; i < n; i++) {
      const px = cx - 0.4 + r(10 + i) * 0.8, pz = cz - 0.4 + r(20 + i) * 0.8;
      B.box(i % 3 ? 0x6a7a3a : 0x8a7a40, { x: px, y, z: pz, sx: 0.02, sy: 0.14 + r(30 + i) * 0.12, sz: 0.02, rz: (r(40 + i) - 0.5) * 0.4 });
    }
    if (r(6) < 0.12) {
      // dead tree
      B.shape(TPL.cyl6, 0x4a3a2a, { x: cx, y, z: cz, sx: 0.07, sy: 0.45, sz: 0.07, rz: 0.1 });
      B.box(0x4a3a2a, { x: cx + 0.08, y: y + 0.32, z: cz, sx: 0.2, sy: 0.03, sz: 0.03, rz: 0.6 });
    }
  },
  pebbles(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.3) for (let i = 0; i < 3; i++) B.shape(TPL.dodec, 0xb8a67a, { x: cx + (r(10 + i) - 0.5) * 0.8, y: y + 0.01, z: cz + (r(20 + i) - 0.5) * 0.8, s: 0.05 + r(30 + i) * 0.04 });
    if (r(2) < 0.05) B.shape(TPL.cyl6, 0x5a8a3a, { x: cx, y, z: cz, sx: 0.06, sy: 0.25, sz: 0.06 }); // cactus-ish shrub
  },
  dunes(c) {
    const { B, cx, cz, y, r, t } = c;
    mound(B, cx + (r(1) - 0.5) * 0.3, y, cz + (r(2) - 0.5) * 0.3, 0.9, 0.08 + r(3) * 0.06, 0.45, shade(t.top, 1.04), 0);
    if (r(4) < 0.06) rock(B, cx, y, cz, 0.6, r(5), 0xb09060);
  },
  snowdrift(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.5) mound(B, cx + (r(2) - 0.5) * 0.4, y, cz + (r(3) - 0.5) * 0.4, 0.5 + r(4) * 0.3, 0.07, 0.4, 0xf6f9fb, r(5));
    if (r(6) < 0.06) pine(B, cx, y, cz, 0.8, r(7), true);
  },
  road(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.3) B.shape(TPL.dodec, 0x8a7a5a, { x: cx + (r(2) - 0.5) * 0.8, y, z: cz + (r(3) - 0.5) * 0.8, s: 0.05 });
  },
  bridge(c) {
    const { B, cx, cz, nb } = c;
    const landEW = !nb(-1, 0).water || !nb(1, 0).water || nb(-1, 0).key === 'bridge' || nb(1, 0).key === 'bridge';
    const landNS = !nb(0, -1).water || !nb(0, 1).water || nb(0, -1).key === 'bridge' || nb(0, 1).key === 'bridge';
    const ew = landEW && !(landNS && !landEW);
    const ry = ew ? 0 : Math.PI / 2;
    const deckY = -0.02;
    for (let i = 0; i < 5; i++) {
      const off = -0.4 + i * 0.2;
      B.box(i % 2 ? 0x8a6a42 : 0x7a5a36, ew ? { x: cx + off, y: deckY, z: cz, sx: 0.19, sy: 0.06, sz: 0.8 } : { x: cx, y: deckY, z: cz + off, sx: 0.8, sy: 0.06, sz: 0.19 });
    }
    for (const side of [-1, 1]) {
      const o = ew ? { x: cx, y: deckY + 0.14, z: cz + side * 0.38, sx: 1.0, sy: 0.04, sz: 0.05 } : { x: cx + side * 0.38, y: deckY + 0.14, z: cz, sx: 0.05, sy: 0.04, sz: 1.0 };
      B.box(0x5a3e24, o);
      for (const p of [-0.4, 0.4]) {
        B.box(0x5a3e24, ew ? { x: cx + p, y: deckY - 0.2, z: cz + side * 0.38, sx: 0.06, sy: 0.38, sz: 0.06 } : { x: cx + side * 0.38, y: deckY - 0.2, z: cz + p, sx: 0.06, sy: 0.38, sz: 0.06 });
      }
    }
    void ry;
  },
  lava(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.4) rock(B, cx + (r(2) - 0.5) * 0.6, y - 0.05, cz + (r(3) - 0.5) * 0.6, 0.5, r(4), 0x2a2220);
  },
  ashrocks(c) {
    const { B, G, cx, cz, y, r } = c;
    if (r(1) < 0.4) {
      const px = cx + (r(2) - 0.5) * 0.5, pz = cz + (r(3) - 0.5) * 0.5;
      B.shape(TPL.cone4, 0x2e2826, { x: px, y, z: pz, sx: 0.18, sy: 0.25 + r(4) * 0.3, sz: 0.18, ry: r(5) * 3, rz: (r(6) - 0.5) * 0.3 });
    }
    if (r(7) < 0.15) G.box(0xff5010, { x: cx + (r(8) - 0.5) * 0.6, y: y + 0.005, z: cz + (r(9) - 0.5) * 0.6, sx: 0.3, sy: 0.01, sz: 0.04, ry: r(10) * 3 });
    if (r(11) < 0.06) {
      B.shape(TPL.cyl6, 0x2a2420, { x: cx, y, z: cz, sx: 0.06, sy: 0.5, sz: 0.06, rz: 0.15 });
      B.box(0x2a2420, { x: cx - 0.06, y: y + 0.35, z: cz, sx: 0.2, sy: 0.03, sz: 0.03, rz: -0.7 });
    }
  },
  town(c) {
    const { B, cx, cz, y, r } = c;
    // little walled town
    const wall = 0xb0aa9c;
    B.box(wall, { x: cx, y, z: cz - 0.42, sx: 0.9, sy: 0.12, sz: 0.06 });
    B.box(wall, { x: cx - 0.45, y, z: cz, sx: 0.06, sy: 0.12, sz: 0.9 });
    B.box(wall, { x: cx + 0.45, y, z: cz, sx: 0.06, sy: 0.12, sz: 0.9 });
    B.box(wall, { x: cx - 0.3, y, z: cz + 0.43, sx: 0.32, sy: 0.12, sz: 0.06 });
    B.box(wall, { x: cx + 0.3, y, z: cz + 0.43, sx: 0.32, sy: 0.12, sz: 0.06 });
    house(B, cx - 0.2, y, cz - 0.18, 0.26, 0.22, 0.17, ROOFS[Math.floor(r(1) * 5)]);
    house(B, cx + 0.2, y, cz - 0.15, 0.24, 0.2, 0.15, ROOFS[Math.floor(r(2) * 5)], 0xe8dcc0, Math.PI / 2);
    house(B, cx + 0.18, y, cz + 0.2, 0.22, 0.2, 0.14, ROOFS[Math.floor(r(3) * 5)]);
    house(B, cx - 0.2, y, cz + 0.18, 0.2, 0.18, 0.13, ROOFS[Math.floor(r(4) * 5)], 0xe8dcc0, Math.PI / 2);
    B.shape(TPL.cyl6, 0xd8ccb0, { x: cx, y, z: cz, sx: 0.1, sy: 0.38, sz: 0.1 });
    B.shape(TPL.cone6, 0x4a5a78, { x: cx, y: y + 0.38, z: cz, sx: 0.14, sy: 0.18, sz: 0.14 });
  },
  village(c) {
    const { B, cx, cz, y } = c;
    house(B, cx - 0.18, y, cz - 0.12, 0.26, 0.22, 0.14, 0xc8a24a, 0xd8c8a6, 0.3);
    house(B, cx + 0.22, y, cz + 0.05, 0.22, 0.2, 0.13, 0xb8923a, 0xd8c8a6, -0.4);
    house(B, cx - 0.05, y, cz + 0.27, 0.2, 0.18, 0.12, 0xc8a24a, 0xd8c8a6, 0.1);
    for (let i = 0; i < 6; i++) B.box(0x6b4a2b, { x: cx - 0.45 + i * 0.18, y, z: cz + 0.45, sx: 0.025, sy: 0.08, sz: 0.025 });
    B.box(0x6b4a2b, { x: cx, y: y + 0.06, z: cz + 0.45, sx: 0.92, sy: 0.015, sz: 0.015 });
    tree(B, cx + 0.32, y, cz - 0.32, 0.55, 0.3);
  },
  castle(c) {
    const { B, G, cx, cz, y } = c;
    const stone = 0xb8b2a4, roof = 0x3d5a8a;
    // curtain walls
    B.box(stone, { x: cx, y, z: cz - 0.36, sx: 0.72, sy: 0.24, sz: 0.1, grad: 0.2 });
    B.box(stone, { x: cx, y, z: cz + 0.36, sx: 0.72, sy: 0.24, sz: 0.1, grad: 0.2 });
    B.box(stone, { x: cx - 0.36, y, z: cz, sx: 0.1, sy: 0.24, sz: 0.72, grad: 0.2 });
    B.box(stone, { x: cx + 0.36, y, z: cz, sx: 0.1, sy: 0.24, sz: 0.72, grad: 0.2 });
    B.box(0x3a2a1a, { x: cx, y, z: cz + 0.415, sx: 0.14, sy: 0.16, sz: 0.02 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower(B, cx + dx * 0.38, y, cz + dz * 0.38, 0.09, 0.36, stone, roof);
    // keep
    B.box(stone, { x: cx, y, z: cz - 0.05, sx: 0.36, sy: 0.48, sz: 0.32, grad: 0.2 });
    B.shape(TPL.cone4, roof, { x: cx, y: y + 0.48, z: cz - 0.05, sx: 0.5, sy: 0.24, sz: 0.45, ry: Math.PI / 4 });
    G.box(0xffe090, { x: cx, y: y + 0.32, z: cz + 0.112, sx: 0.06, sy: 0.08, sz: 0.01 });
    flag(B, cx, y + 0.68, cz - 0.05, 0xc03030, 0.8);
  },
  cave(c) {
    const { B, cx, cz, y, r, t } = c;
    mound(B, cx, y, cz - 0.08, 1.0, 0.42, 0.85, 0x7d7468, r(1));
    mound(B, cx - 0.25, y, cz - 0.2, 0.5, 0.3, 0.5, 0x8a8278, r(2));
    B.box(0x0a0806, { x: cx, y, z: cz + 0.3, sx: 0.32, sy: 0.24, sz: 0.06 });
    B.box(0x5f574d, { x: cx, y: y + 0.24, z: cz + 0.31, sx: 0.4, sy: 0.06, sz: 0.08 });
    B.box(0x5f574d, { x: cx - 0.19, y, z: cz + 0.31, sx: 0.06, sy: 0.26, sz: 0.08 });
    B.box(0x5f574d, { x: cx + 0.19, y, z: cz + 0.31, sx: 0.06, sy: 0.26, sz: 0.08 });
    void t;
  },
  tower(c) {
    const { B, G, cx, cz, y } = c;
    B.shape(TPL.cyl8, 0x9a948a, { x: cx, y, z: cz, sx: 0.5, sy: 0.12, sz: 0.5 });
    tower(B, cx, y + 0.1, cz, 0.17, 0.85, 0xa8a296, 0x5a3a8a, G, 0xc0a0ff);
    G.box(0xffe090, { x: cx + 0.17, y: y + 0.55, z: cz, sx: 0.02, sy: 0.08, sz: 0.05 });
  },
  ruins(c) {
    const { B, cx, cz, y, r } = c;
    const stone = 0xa8a296;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + r(1);
      B.shape(TPL.cyl6, stone, { x: cx + Math.cos(a) * 0.3, y, z: cz + Math.sin(a) * 0.3, sx: 0.1, sy: 0.12 + r(10 + i) * 0.4, sz: 0.1, grad: 0.2 });
    }
    B.box(stone, { x: cx, y, z: cz - 0.2, sx: 0.5, sy: 0.14, sz: 0.08, ry: r(2) * 0.3 });
    B.box(0x8a8278, { x: cx + 0.1, y, z: cz + 0.15, sx: 0.2, sy: 0.05, sz: 0.12, ry: r(3) });
  },
  fortress(c) {
    const { B, G, cx, cz, y } = c;
    const dark = 0x3a3436;
    B.box(dark, { x: cx, y, z: cz, sx: 0.8, sy: 0.22, sz: 0.8, grad: 0.3 });
    B.box(dark, { x: cx, y, z: cz - 0.05, sx: 0.4, sy: 0.7, sz: 0.35, grad: 0.3 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      B.shape(TPL.cyl6, dark, { x: cx + dx * 0.36, y, z: cz + dz * 0.36, sx: 0.16, sy: 0.45, sz: 0.16 });
      B.shape(TPL.cone4, 0x24201f, { x: cx + dx * 0.36, y: y + 0.45, z: cz + dz * 0.36, sx: 0.18, sy: 0.32, sz: 0.18 });
    }
    B.shape(TPL.cone4, 0x24201f, { x: cx, y: y + 0.7, z: cz - 0.05, sx: 0.3, sy: 0.45, sz: 0.3 });
    G.box(0xff3010, { x: cx, y: y + 0.5, z: cz + 0.126, sx: 0.08, sy: 0.1, sz: 0.01 });
    G.box(0xff3010, { x: cx, y: y + 0.08, z: cz + 0.405, sx: 0.16, sy: 0.12, sz: 0.01 });
  },
  elfhall(c) {
    const { B, G, cx, cz, y } = c;
    B.shape(TPL.cyl8, 0x8a7a68, { x: cx, y, z: cz - 0.1, sx: 0.22, sy: 0.6, sz: 0.22, grad: 0.3 });
    B.shape(TPL.ico1, 0x6aa060, { x: cx, y: y + 0.7, z: cz - 0.1, sx: 0.95, sy: 0.55, sz: 0.85, grad: 0.35 });
    B.shape(TPL.ico1, 0x8ac080, { x: cx + 0.1, y: y + 0.86, z: cz - 0.05, s: 0.5, grad: 0.3 });
    B.shape(TPL.cyl8, 0xf0ead8, { x: cx + 0.18, y, z: cz + 0.22, sx: 0.26, sy: 0.14, sz: 0.26 });
    B.shape(TPL.hemi, 0xd8d0b0, { x: cx + 0.18, y: y + 0.14, z: cz + 0.22, s: 0.26 });
    G.shape(TPL.ico0, 0xe0fff0, { x: cx - 0.2, y: y + 0.35, z: cz + 0.1, s: 0.05 });
    G.shape(TPL.ico0, 0xe0fff0, { x: cx + 0.28, y: y + 0.5, z: cz - 0.2, s: 0.05 });
  },
  dwarfgate(c) {
    mountainDeco(c, false, 0.75);
    const { B, G, cx, cz, y } = c;
    B.box(0x8a8478, { x: cx, y, z: cz + 0.36, sx: 0.5, sy: 0.4, sz: 0.1 });
    B.box(0x161210, { x: cx, y, z: cz + 0.41, sx: 0.24, sy: 0.28, sz: 0.02 });
    B.box(0x9a948a, { x: cx, y: y + 0.4, z: cz + 0.38, sx: 0.6, sy: 0.06, sz: 0.12 });
    G.box(0x60e0ff, { x: cx, y: y + 0.32, z: cz + 0.415, sx: 0.04, sy: 0.04, sz: 0.01 });
    G.box(0x60e0ff, { x: cx - 0.18, y: y + 0.2, z: cz + 0.415, sx: 0.03, sy: 0.1, sz: 0.01 });
    G.box(0x60e0ff, { x: cx + 0.18, y: y + 0.2, z: cz + 0.415, sx: 0.03, sy: 0.1, sz: 0.01 });
  },

  // --- settlements ---
  cobble(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.25) B.box(0x7a746a, { x: cx + (r(2) - 0.5) * 0.7, y, z: cz + (r(3) - 0.5) * 0.7, sx: 0.12, sy: 0.012, sz: 0.1, ry: r(4) });
  },
  planks(c) {
    const { B, x, z, y, r } = c;
    for (let i = 1; i < 4; i++) B.box(0x7a5030, { x: x + i * 0.25, y, z: z + 0.5, sx: 0.012, sy: 0.006, sz: 1.0 });
    void r;
  },
  flags(c) {
    const { B, x, z, y } = c;
    B.box(shade(c.t.top, 0.8), { x: x + 0.5, y, z: z + 0.5, sx: 1.0, sy: 0.005, sz: 0.012 });
    B.box(shade(c.t.top, 0.8), { x: x + 0.5, y, z: z + 0.5, sx: 0.012, sy: 0.005, sz: 1.0 });
  },
  carpet(c) {
    const { B, cx, cz, y, nb } = c;
    const gold = 0xd0a040;
    if (nb(-1, 0).key !== 'carpet') B.box(gold, { x: cx - 0.42, y, z: cz, sx: 0.05, sy: 0.006, sz: 1 });
    if (nb(1, 0).key !== 'carpet') B.box(gold, { x: cx + 0.42, y, z: cz, sx: 0.05, sy: 0.006, sz: 1 });
    if (nb(0, -1).key !== 'carpet') B.box(gold, { x: cx, y, z: cz - 0.42, sx: 1, sy: 0.006, sz: 0.05 });
    if (nb(0, 1).key !== 'carpet') B.box(gold, { x: cx, y, z: cz + 0.42, sx: 1, sy: 0.006, sz: 0.05 });
  },
  stonewall(c) {
    const { B, cx, cz, y, r, t, map } = c;
    if (t.key === 'wall_stone' && map && map.type !== 'dungeon') {
      const top = shade(t.top, 1.05);
      for (const [dx, dz] of [[-0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3]]) {
        B.box(top, { x: cx + dx, y, z: cz + dz, sx: 0.28, sy: 0.12, sz: 0.28 });
      }
    } else if (r(1) < 0.4) {
      B.box(shade(t.top, 0.9), { x: cx + (r(2) - 0.5) * 0.5, y, z: cz + (r(3) - 0.5) * 0.5, sx: 0.3, sy: 0.04, sz: 0.25 });
    }
  },
  timberwall(c) { timber(c, false); },
  window(c) { timber(c, true); },
  door(c) { doorDeco(c, false); },
  lockeddoor(c) { doorDeco(c, true); },
  counter(c) {
    const { B, cx, cz, y, r, nb } = c;
    const alongX = nb(-1, 0).key === 'counter' || nb(1, 0).key === 'counter' || !(nb(0, -1).key === 'counter' || nb(0, 1).key === 'counter');
    B.box(0x7a4e2a, alongX ? { x: cx, y, z: cz, sx: 1.0, sy: 0.3, sz: 0.5 } : { x: cx, y, z: cz, sx: 0.5, sy: 0.3, sz: 1.0 });
    B.box(0xa87a4a, alongX ? { x: cx, y: y + 0.3, z: cz, sx: 1.02, sy: 0.04, sz: 0.56 } : { x: cx, y: y + 0.3, z: cz, sx: 0.56, sy: 0.04, sz: 1.02 });
    const goods = [0xc0c0c8, 0xd0a040, 0x8a3020, 0x406090];
    if (r(1) < 0.6) B.box(goods[Math.floor(r(2) * 4)], { x: cx + (r(3) - 0.5) * 0.4, y: y + 0.34, z: cz, sx: 0.12, sy: 0.08, sz: 0.1 });
    if (r(4) < 0.4) B.shape(TPL.cyl6, 0xe0d8c0, { x: cx + (r(5) - 0.5) * 0.4, y: y + 0.34, z: cz + 0.05, sx: 0.07, sy: 0.08, sz: 0.07 });
  },
  table(c) {
    const { B, G, cx, cz, y, r } = c;
    B.box(0x8a5a32, { x: cx, y: y + 0.26, z: cz, sx: 0.74, sy: 0.05, sz: 0.6 });
    for (const [dx, dz] of [[-0.32, -0.25], [0.32, -0.25], [-0.32, 0.25], [0.32, 0.25]]) B.box(0x6a4022, { x: cx + dx, y, z: cz + dz, sx: 0.05, sy: 0.26, sz: 0.05 });
    if (r(1) < 0.6) B.shape(TPL.cyl6, 0xb0b0b8, { x: cx - 0.12, y: y + 0.31, z: cz, sx: 0.07, sy: 0.08, sz: 0.07 });
    if (r(2) < 0.5) {
      B.shape(TPL.cyl6, 0xf0f0e0, { x: cx + 0.15, y: y + 0.31, z: cz - 0.08, sx: 0.04, sy: 0.08, sz: 0.04 });
      G.shape(TPL.cone4, 0xffc040, { x: cx + 0.15, y: y + 0.39, z: cz - 0.08, sx: 0.03, sy: 0.05, sz: 0.03 });
    }
    // stools
    B.shape(TPL.cyl6, 0x6a4022, { x: cx, y, z: cz + 0.42, sx: 0.16, sy: 0.16, sz: 0.16 });
  },
  bed(c) {
    const { B, cx, cz, y, r } = c;
    const blankets = [0xa83a3a, 0x3a5aa8, 0x3a8a4a, 0x8a6a3a];
    B.box(0x6a4022, { x: cx, y, z: cz, sx: 0.55, sy: 0.16, sz: 0.85 });
    B.box(blankets[Math.floor(r(1) * 4)], { x: cx, y: y + 0.16, z: cz + 0.08, sx: 0.57, sy: 0.07, sz: 0.62 });
    B.box(0xf0ece0, { x: cx, y: y + 0.16, z: cz - 0.28, sx: 0.42, sy: 0.08, sz: 0.18 });
    B.box(0x5a3418, { x: cx, y, z: cz - 0.42, sx: 0.58, sy: 0.38, sz: 0.06 });
  },
  hearth(c) {
    const { B, G, cx, cz, y } = c;
    B.box(0x8a8478, { x: cx, y, z: cz - 0.15, sx: 0.85, sy: 0.55, sz: 0.55, grad: 0.2 });
    B.box(0x1a1410, { x: cx, y, z: cz + 0.1, sx: 0.4, sy: 0.3, sz: 0.08 });
    fire(G, cx, y, cz + 0.16, 0.9);
    B.box(0x7a7468, { x: cx, y: y + 0.55, z: cz - 0.2, sx: 0.3, sy: 0.25, sz: 0.3 });
  },
  fountain(c) {
    const { B, W, G, cx, cz, y } = c;
    B.shape(TPL.cyl12, 0xb0aa9c, { x: cx, y, z: cz, sx: 0.9, sy: 0.18, sz: 0.9 });
    W.shape(TPL.cyl12, 0x4aa0d0, { x: cx, y: y + 0.02, z: cz, sx: 0.78, sy: 0.15, sz: 0.78 });
    B.shape(TPL.cyl6, 0xb0aa9c, { x: cx, y, z: cz, sx: 0.12, sy: 0.42, sz: 0.12 });
    B.shape(TPL.cyl8, 0xb0aa9c, { x: cx, y: y + 0.42, z: cz, sx: 0.32, sy: 0.06, sz: 0.32 });
    G.shape(TPL.cone6, 0xa0e0ff, { x: cx, y: y + 0.45, z: cz, sx: 0.08, sy: 0.12, sz: 0.08 });
  },
  statue(c) {
    const { B, cx, cz, y } = c;
    const st = 0xc8c2b4;
    B.box(0x9a948a, { x: cx, y, z: cz, sx: 0.5, sy: 0.25, sz: 0.5 });
    B.shape(TPL.taper6, st, { x: cx, y: y + 0.25, z: cz, sx: 0.24, sy: 0.4, sz: 0.2 });
    B.shape(TPL.ico0, st, { x: cx, y: y + 0.72, z: cz, s: 0.15 });
    B.box(st, { x: cx + 0.14, y: y + 0.55, z: cz, sx: 0.04, sy: 0.4, sz: 0.04, rz: -0.2 });
  },
  garden(c) {
    DECOR.flowers(c);
    const { B, cx, cz, y, r } = c;
    if (r(50) < 0.4) B.shape(TPL.ico0, 0x3f7a30, { x: cx + (r(51) - 0.5) * 0.5, y: y + 0.08, z: cz + (r(52) - 0.5) * 0.5, sx: 0.3, sy: 0.22, sz: 0.3 });
  },
  bigtree(c) {
    const { B, cx, cz, y, r } = c;
    tree(B, cx + (r(1) - 0.5) * 0.1, y, cz + (r(2) - 0.5) * 0.1, 1.85, r(3));
  },
  shelf(c) {
    const { B, cx, cz, y, r } = c;
    B.box(0x5a3418, { x: cx, y, z: cz - 0.25, sx: 0.9, sy: 0.75, sz: 0.3 });
    const books = [0x8a2020, 0x204a8a, 0x2a6a2a, 0x8a6a20, 0x5a2a6a];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      if (r(10 + row * 6 + i) < 0.2) continue;
      B.box(books[Math.floor(r(40 + row * 6 + i) * 5)], { x: cx - 0.36 + i * 0.14, y: y + 0.07 + row * 0.23, z: cz - 0.09, sx: 0.1, sy: 0.17, sz: 0.04 });
    }
  },
  anvil(c) {
    const { B, G, cx, cz, y } = c;
    B.shape(TPL.cyl8, 0x6a4a2a, { x: cx, y, z: cz, sx: 0.3, sy: 0.18, sz: 0.3 });
    B.box(0x3a3a40, { x: cx, y: y + 0.18, z: cz, sx: 0.16, sy: 0.1, sz: 0.12 });
    B.box(0x45454c, { x: cx, y: y + 0.28, z: cz, sx: 0.4, sy: 0.08, sz: 0.16 });
    G.box(0xff7020, { x: cx + 0.12, y: y + 0.36, z: cz, sx: 0.1, sy: 0.02, sz: 0.04 });
  },
  barrels(c) {
    const { B, cx, cz, y, r } = c;
    const spots = [[-0.2, -0.15], [0.18, -0.18], [-0.05, 0.2]];
    for (let i = 0; i < 3; i++) {
      if (i === 2 && r(1) < 0.5) {
        B.box(0x9a7a4a, { x: cx + spots[i][0], y, z: cz + spots[i][1], s: 0.3, ry: r(2) });
        continue;
      }
      B.shape(TPL.cyl8, 0x8a5a2a, { x: cx + spots[i][0], y, z: cz + spots[i][1], sx: 0.3, sy: 0.38, sz: 0.3 });
      B.shape(TPL.cyl8, 0x3a3a3a, { x: cx + spots[i][0], y: y + 0.08, z: cz + spots[i][1], sx: 0.31, sy: 0.03, sz: 0.31 });
      B.shape(TPL.cyl8, 0x3a3a3a, { x: cx + spots[i][0], y: y + 0.28, z: cz + spots[i][1], sx: 0.31, sy: 0.03, sz: 0.31 });
    }
  },
  throne(c) {
    const { B, cx, cz, y } = c;
    const gold = 0xd8b048;
    B.box(0x9a948a, { x: cx, y, z: cz, sx: 0.8, sy: 0.1, sz: 0.8 });
    B.box(gold, { x: cx, y: y + 0.1, z: cz, sx: 0.5, sy: 0.2, sz: 0.45 });
    B.box(0xa82a3a, { x: cx, y: y + 0.3, z: cz + 0.02, sx: 0.42, sy: 0.04, sz: 0.38 });
    B.box(gold, { x: cx, y: y + 0.1, z: cz - 0.22, sx: 0.5, sy: 0.75, sz: 0.08 });
    B.shape(TPL.cone4, gold, { x: cx - 0.2, y: y + 0.85, z: cz - 0.22, s: 0.08 });
    B.shape(TPL.cone4, gold, { x: cx + 0.2, y: y + 0.85, z: cz - 0.22, s: 0.08 });
    B.shape(TPL.cone4, gold, { x: cx, y: y + 0.85, z: cz - 0.22, s: 0.12 });
  },
  altar(c) {
    const { B, G, cx, cz, y } = c;
    B.box(0xe0dccf, { x: cx, y, z: cz, sx: 0.75, sy: 0.36, sz: 0.45, grad: 0.15 });
    B.box(0x3a5aa8, { x: cx, y: y + 0.36, z: cz, sx: 0.5, sy: 0.01, sz: 0.47 });
    for (const dx of [-0.28, 0.28]) {
      B.shape(TPL.cyl6, 0xf8f4e8, { x: cx + dx, y: y + 0.36, z: cz, sx: 0.05, sy: 0.12, sz: 0.05 });
      G.shape(TPL.cone4, 0xffd060, { x: cx + dx, y: y + 0.48, z: cz, sx: 0.04, sy: 0.07, sz: 0.04 });
    }
  },
  stairsdown(c) {
    const { B, cx, cz, y } = c;
    B.box(0x0a0908, { x: cx, y: y - 0.01, z: cz, sx: 0.8, sy: 0.02, sz: 0.8 });
    for (let i = 0; i < 4; i++) B.box(shade(0x6b655c, 1 - i * 0.18), { x: cx, y: y - 0.01, z: cz + 0.3 - i * 0.18, sx: 0.7, sy: 0.025, sz: 0.16 });
    B.box(0x4a453f, { x: cx - 0.42, y, z: cz, sx: 0.08, sy: 0.12, sz: 0.85 });
    B.box(0x4a453f, { x: cx + 0.42, y, z: cz, sx: 0.08, sy: 0.12, sz: 0.85 });
  },
  stairsup(c) {
    const { B, cx, cz, y } = c;
    for (let i = 0; i < 4; i++) B.box(shade(0x9a948a, 1 - i * 0.05), { x: cx, y, z: cz + 0.3 - i * 0.2, sx: 0.75, sy: 0.08 + i * 0.09, sz: 0.2 });
    B.box(0x6a645c, { x: cx - 0.42, y, z: cz - 0.05, sx: 0.08, sy: 0.45, sz: 0.85 });
    B.box(0x6a645c, { x: cx + 0.42, y, z: cz - 0.05, sx: 0.08, sy: 0.45, sz: 0.85 });
  },
  brazier(c) {
    const { B, G, cx, cz, y } = c;
    B.shape(TPL.cyl6, 0x2a2624, { x: cx, y, z: cz, sx: 0.06, sy: 0.32, sz: 0.06 });
    B.shape(TPL.taper6, 0x3a3430, { x: cx, y: y + 0.3, z: cz, sx: 0.3, sy: 0.1, sz: 0.3, rx: Math.PI });
    B.shape(TPL.cyl6, 0x2a2624, { x: cx, y, z: cz, sx: 0.3, sy: 0.04, sz: 0.3 });
    fire(G, cx, y + 0.36, cz, 1.2);
  },
  crops(c) {
    const { B, cx, cz, y, r } = c;
    const col = r(1) < 0.5 ? 0xd0b040 : 0x5a9a3a;
    for (let row = 0; row < 3; row++) {
      B.box(0x5a4022, { x: cx, y, z: cz - 0.3 + row * 0.3, sx: 0.9, sy: 0.03, sz: 0.12 });
      for (let i = 0; i < 4; i++) B.shape(TPL.cone4, col, { x: cx - 0.33 + i * 0.22, y: y + 0.02, z: cz - 0.3 + row * 0.3, sx: 0.09, sy: 0.16 + r(10 + row * 4 + i) * 0.06, sz: 0.09 });
    }
  },
  fence(c) {
    const { B, cx, cz, y, nb } = c;
    const wood = 0x7a5a36;
    B.box(wood, { x: cx, y, z: cz, sx: 0.06, sy: 0.3, sz: 0.06 });
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let any = false;
    for (const [dx, dz] of dirs) {
      if (!isWallish(nb(dx, dz))) continue;
      any = true;
      const o = dx ? { x: cx + dx * 0.25, z: cz, sx: 0.5, sz: 0.03 } : { x: cx, z: cz + dz * 0.25, sx: 0.03, sz: 0.5 };
      B.box(wood, { ...o, y: y + 0.12, sy: 0.04 });
      B.box(wood, { ...o, y: y + 0.24, sy: 0.04 });
    }
    if (!any) B.box(wood, { x: cx, y: y + 0.18, z: cz, sx: 0.9, sy: 0.04, sz: 0.03 });
  },
  palisade(c) {
    const { B, cx, cz, y, r } = c;
    for (let i = 0; i < 4; i++) {
      const px = cx + (i % 2 ? 0.22 : -0.22), pz = cz + (i < 2 ? -0.22 : 0.22);
      const hh = 0.55 + r(10 + i) * 0.12;
      B.shape(TPL.cyl6, i % 2 ? 0x7a5a36 : 0x6a4a2a, { x: px, y, z: pz, sx: 0.32, sy: hh, sz: 0.32, grad: 0.3 });
      B.shape(TPL.cone6, 0x8a6a42, { x: px, y: y + hh, z: pz, sx: 0.32, sy: 0.14, sz: 0.32 });
    }
  },

  // --- dungeon ---
  cavefloor(c) {
    const { B, cx, cz, y, r } = c;
    if (r(1) < 0.2) rock(B, cx + (r(2) - 0.5) * 0.6, y - 0.03, cz + (r(3) - 0.5) * 0.6, 0.35, r(4), 0x4a433d);
  },
  rockwall(c) {
    const { B, cx, cz, y, r } = c;
    if (r(5) < 0.5) B.shape(TPL.dodec, 0x443c35, { x: cx + (r(1) - 0.5) * 0.3, y: y - 0.12, z: cz + (r(2) - 0.5) * 0.3, sx: 0.8, sy: 0.25 + r(3) * 0.25, sz: 0.8, ry: r(4) * 6, grad: 0.3 });
  },
  rubble(c) {
    const { B, cx, cz, y, r } = c;
    for (let i = 0; i < 4; i++) rock(B, cx + (r(10 + i) - 0.5) * 0.6, y - 0.02, cz + (r(20 + i) - 0.5) * 0.6, 0.45 + r(30 + i) * 0.4, r(40 + i), 0x6a6058);
  },
  web(c) {
    const { B, cx, cz, y, r } = c;
    for (let i = 0; i < 4; i++) B.box(0xe8e8e8, { x: cx, y: y + 0.25, z: cz, sx: 1.0, sy: 0.008, sz: 0.008, ry: i * 0.8 + r(1), rz: 0.15 });
    B.shape(TPL.torus, 0xd8d8d8, { x: cx, y: y + 0.25, z: cz, sx: 0.8, sy: 0.8, sz: 0.2, rx: -1.3 });
  },
  bones(c) {
    const { B, cx, cz, y, r } = c;
    for (let i = 0; i < 4; i++) B.box(0xe8e0c8, { x: cx + (r(10 + i) - 0.5) * 0.6, y, z: cz + (r(20 + i) - 0.5) * 0.6, sx: 0.2, sy: 0.03, sz: 0.03, ry: r(30 + i) * 3 });
    B.shape(TPL.ico0, 0xf0e8d0, { x: cx, y: y + 0.05, z: cz, s: 0.12 });
  },
  crystal(c) {
    const { G, cx, cz, y, r } = c;
    const cols = [0x9a60ff, 0x60c0ff, 0xc080ff];
    for (let i = 0; i < 4; i++) {
      G.shape(TPL.cone4, cols[i % 3], { x: cx + (r(10 + i) - 0.5) * 0.5, y, z: cz + (r(20 + i) - 0.5) * 0.5, sx: 0.12, sy: 0.35 + r(30 + i) * 0.35, sz: 0.12, rx: (r(40 + i) - 0.5) * 0.6, rz: (r(50 + i) - 0.5) * 0.6 });
    }
  },
};

function mountainDeco(c, snowy, scale = 1) {
  const { B, cx, cz, y, r, nbCount } = c;
  const around = nbCount((t) => t.key === 'mountains' || t.key === 'peaks');
  const big = (0.7 + around * 0.07) * scale;
  const base = ROCKS[Math.floor(r(1) * 4) % 4];
  const hgt = (0.65 + r(2) * 0.35) * big * (snowy ? 1.3 : 1);
  const px = cx + (r(3) - 0.5) * 0.15, pz = cz + (r(4) - 0.5) * 0.15;
  const ry = r(5) * 6;
  B.shape(TPL.cone5, base, { x: px, y: y - 0.02, z: pz, sx: 1.05 * big, sy: hgt, sz: 0.95 * big, ry, grad: 0.4 });
  if (snowy || hgt > 0.85) {
    const f = snowy ? 0.45 : 0.3;
    B.shape(TPL.cone5, 0xf2f5f8, { x: px, y: y - 0.02 + hgt * (1 - f), z: pz, sx: 1.05 * big * f * 1.06, sy: hgt * f * 1.01, sz: 0.95 * big * f * 1.06, ry });
  }
  if (r(6) < 0.7) {
    const sx = cx + (r(7) - 0.5) * 0.6, sz = cz + 0.15 + r(8) * 0.25;
    const h2 = hgt * (0.45 + r(9) * 0.25);
    B.shape(TPL.cone5, shade(base, 0.92), { x: sx, y: y - 0.02, z: sz, sx: 0.6 * big, sy: h2, sz: 0.55 * big, ry: ry + 1, grad: 0.4 });
    if (snowy) B.shape(TPL.cone5, 0xf2f5f8, { x: sx, y: y - 0.02 + h2 * 0.6, z: sz, sx: 0.6 * big * 0.42, sy: h2 * 0.41, sz: 0.55 * big * 0.42, ry: ry + 1 });
  }
}

function timber(c, windowed) {
  const { B, G, cx, cz, y, nb, t } = c;
  const beam = 0x5a3a22;
  const hgt = t.h;
  // corner posts and top band
  for (const [dx, dz] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) {
    B.box(beam, { x: cx + dx, y: 0, z: cz + dz, sx: 0.07, sy: hgt + 0.01, sz: 0.07 });
  }
  const exposed = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dz]) => { const n = nb(dx, dz); return !(n.wall); });
  for (const [dx, dz] of exposed) {
    const o = dx ? { x: cx + dx * 0.505, z: cz, sx: 0.02, sz: 1.0 } : { x: cx, z: cz + dz * 0.505, sx: 1.0, sz: 0.02 };
    B.box(beam, { ...o, y: hgt - 0.06, sy: 0.06 });
    B.box(beam, { ...o, y: 0.02, sy: 0.05 });
    if (windowed) {
      const w = dx ? { x: cx + dx * 0.51, z: cz, sx: 0.015, sz: 0.4 } : { x: cx, z: cz + dz * 0.51, sx: 0.4, sz: 0.015 };
      G.box(0xffe8a0, { ...w, y: 0.2, sy: 0.2 });
      const f = dx ? { x: cx + dx * 0.515, z: cz, sx: 0.02, sz: 0.04 } : { x: cx, z: cz + dz * 0.515, sx: 0.04, sz: 0.02 };
      B.box(beam, { ...f, y: 0.2, sy: 0.2 });
    }
  }
  void y;
}

function doorDeco(c, locked) {
  const { B, cx, cz, y, nb } = c;
  const wallEW = (nb(-1, 0).wall || nb(-1, 0).door) && (nb(1, 0).wall || nb(1, 0).door);
  const wallNS = (nb(0, -1).wall || nb(0, -1).door) && (nb(0, 1).wall || nb(0, 1).door);
  const ew = wallEW || !wallNS; // door sits in an east-west running wall
  const frame = 0x5a3a22, panel = locked ? 0x6a3a1a : 0x8a5a2a;
  const H = 0.55;
  if (ew) {
    B.box(frame, { x: cx - 0.44, y, z: cz, sx: 0.12, sy: H, sz: 0.2 });
    B.box(frame, { x: cx + 0.44, y, z: cz, sx: 0.12, sy: H, sz: 0.2 });
    B.box(frame, { x: cx, y: y + H - 0.08, z: cz, sx: 1.0, sy: 0.1, sz: 0.2 });
    if (locked) {
      B.box(panel, { x: cx, y, z: cz, sx: 0.78, sy: H - 0.08, sz: 0.08 });
      B.box(0x2a2a2a, { x: cx, y: y + 0.12, z: cz, sx: 0.8, sy: 0.04, sz: 0.1 });
      B.box(0x2a2a2a, { x: cx, y: y + 0.36, z: cz, sx: 0.8, sy: 0.04, sz: 0.1 });
      B.box(0xe0b040, { x: cx + 0.25, y: y + 0.24, z: cz + 0.05, sx: 0.06, sy: 0.08, sz: 0.04 });
    } else {
      B.box(panel, { x: cx - 0.36, y, z: cz - 0.2, sx: 0.06, sy: H - 0.1, sz: 0.38, ry: 0.2 });
    }
  } else {
    B.box(frame, { x: cx, y, z: cz - 0.44, sx: 0.2, sy: H, sz: 0.12 });
    B.box(frame, { x: cx, y, z: cz + 0.44, sx: 0.2, sy: H, sz: 0.12 });
    B.box(frame, { x: cx, y: y + H - 0.08, z: cz, sx: 0.2, sy: 0.1, sz: 1.0 });
    if (locked) {
      B.box(panel, { x: cx, y, z: cz, sx: 0.08, sy: H - 0.08, sz: 0.78 });
      B.box(0x2a2a2a, { x: cx, y: y + 0.12, z: cz, sx: 0.1, sy: 0.04, sz: 0.8 });
      B.box(0x2a2a2a, { x: cx, y: y + 0.36, z: cz, sx: 0.1, sy: 0.04, sz: 0.8 });
      B.box(0xe0b040, { x: cx + 0.05, y: y + 0.24, z: cz + 0.25, sx: 0.04, sy: 0.08, sz: 0.06 });
    } else {
      B.box(panel, { x: cx - 0.2, y, z: cz - 0.36, sx: 0.38, sy: H - 0.1, sz: 0.06, ry: 0.2 });
    }
  }
}

export { T };
