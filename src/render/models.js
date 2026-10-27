// Procedural low-poly models for characters, monsters and objects.
// Each model is built into one lit + one glow geometry (cached by spec).
// Models face +Z (towards the camera) with their feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL, shade } from './builder.js';

const cache = new Map();

export const RACE_LOOKS = {
  human: { scale: 1, width: 1, skin: 0xe8b890, hair: 0x5a3a20, legH: 0.3 },
  dwarf: { scale: 0.8, width: 1.3, skin: 0xe0a880, hair: 0x8a4a20, legH: 0.22, beard: true },
  elf: { scale: 1.08, width: 0.86, skin: 0xf0d0b0, hair: 0xe8d890, legH: 0.33, ears: true, longHair: true },
  hobbit: { scale: 0.68, width: 1.05, skin: 0xe8b890, hair: 0x6a4020, legH: 0.24 },
  orc: { scale: 1.05, width: 1.25, skin: 0x5f7f3a, hair: 0x1a1a1a, legH: 0.28, tusks: true },
  goblin: { scale: 0.72, width: 1.0, skin: 0x8a9a3a, hair: 0x2a2a1a, legH: 0.26, bigEars: true },
  troll: { scale: 1.6, width: 1.45, skin: 0x6a7a6a, hair: 0x3a3a2a, legH: 0.28, tusks: true },
  skeleton: { scale: 1, width: 0.8, skin: 0xe8e0c8, hair: null, legH: 0.3, bones: true },
};

function humanoid(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const race = RACE_LOOKS[spec.race] || RACE_LOOKS.human;
  const W = (spec.width ?? 1) * race.width;
  const skin = spec.skin ?? race.skin;
  const hair = spec.hair ?? race.hair;
  const body = spec.body ?? 0x7a2a2a;
  const legs = spec.legs ?? shade(body, 0.6);
  const legH = race.legH;
  const bones = race.bones;
  const limbW = bones ? 0.06 : 0.11;
  const metal = spec.armor === 'plate' ? 0xc8ccd4 : spec.armor === 'chain' ? 0x9a9ea6 : null;
  const torsoY = legH;
  const torsoH = 0.32;
  const headY = torsoY + torsoH + 0.13;

  // legs & boots
  if (!spec.robe) {
    for (const s of [-1, 1]) {
      B.box(legs, { x: s * 0.075 * W, y: 0.06, z: 0, sx: limbW, sy: legH - 0.04, sz: limbW + 0.02 });
      B.box(bones ? skin : 0x3a2818, { x: s * 0.075 * W, y: 0, z: 0.015, sx: limbW + 0.02, sy: 0.08, sz: limbW + 0.06 });
    }
  }
  // torso / robe
  if (spec.robe) {
    B.shape(TPL.taper8, body, { y: 0, sx: 0.46 * W, sy: torsoY + torsoH, sz: 0.36, grad: 0.25 });
    if (spec.trim) B.shape(TPL.cyl8, spec.trim, { y: 0, sx: 0.47 * W, sy: 0.04, sz: 0.37 });
  } else if (bones) {
    B.box(skin, { y: torsoY, sx: 0.06, sy: torsoH, sz: 0.06 });
    for (let i = 0; i < 3; i++) B.box(skin, { y: torsoY + 0.08 + i * 0.08, sx: 0.26, sy: 0.03, sz: 0.14 });
  } else {
    B.box(body, { y: torsoY, sx: 0.34 * W, sy: torsoH, sz: 0.22, grad: 0.2 });
    if (spec.trim) B.box(spec.trim, { y: torsoY + torsoH - 0.05, z: 0.005, sx: 0.35 * W, sy: 0.04, sz: 0.225 });
  }
  if (metal) {
    B.box(metal, { y: torsoY + 0.1, z: 0.005, sx: 0.36 * W, sy: torsoH - 0.08, sz: 0.235, grad: 0.15 });
    for (const s of [-1, 1]) B.shape(TPL.hemi, metal, { x: s * 0.2 * W, y: torsoY + torsoH - 0.06, sx: 0.17, sy: 0.12, sz: 0.2 });
  }
  if (!bones) B.box(0x4a3020, { y: torsoY + 0.02, z: 0.003, sx: 0.35 * W, sy: 0.04, sz: 0.23 });
  // cape
  if (spec.cape) B.box(spec.cape, { y: 0.1, z: -0.13, sx: 0.36 * W, sy: torsoY + torsoH - 0.12, sz: 0.03, rx: 0.12, grad: 0.3 });
  // arms
  const armX = 0.17 * W + 0.05;
  for (const s of [-1, 1]) {
    const sleeve = metal && spec.armor === 'plate' ? metal : body;
    B.box(bones ? skin : sleeve, { x: s * armX, y: torsoY + 0.05, z: 0.01, sx: bones ? 0.05 : 0.09, sy: torsoH - 0.04, sz: bones ? 0.05 : 0.1, rz: s * 0.08 });
    B.box(skin, { x: s * (armX + 0.01), y: torsoY - 0.01, z: 0.02, sx: 0.08, sy: 0.07, sz: 0.08 });
  }
  // head
  B.shape(TPL.ico1, skin, { y: headY, sx: 0.27, sy: 0.27, sz: 0.25 });
  // eyes
  if (spec.eyes) {
    for (const s of [-1, 1]) G.box(spec.eyes, { x: s * 0.05, y: headY + 0.01, z: 0.115, sx: 0.04, sy: 0.035, sz: 0.02 });
  } else {
    for (const s of [-1, 1]) B.box(bones ? 0x1a1410 : 0x1a1a22, { x: s * 0.05, y: headY + 0.01, z: 0.112, sx: bones ? 0.05 : 0.03, sy: bones ? 0.05 : 0.035, sz: 0.02 });
  }
  if (race.tusks) for (const s of [-1, 1]) B.shape(TPL.cone4, 0xf0e8d0, { x: s * 0.05, y: headY - 0.08, z: 0.11, sx: 0.025, sy: 0.06, sz: 0.025 });
  if (race.ears) for (const s of [-1, 1]) B.shape(TPL.cone4, skin, { x: s * 0.13, y: headY + 0.02, z: 0, sx: 0.04, sy: 0.12, sz: 0.04, rz: -s * 1.0 });
  if (race.bigEars) for (const s of [-1, 1]) B.shape(TPL.cone4, skin, { x: s * 0.16, y: headY + 0.02, z: 0, sx: 0.07, sy: 0.18, sz: 0.04, rz: -s * 1.3 });
  // hair
  const hat = spec.hat || 'none';
  if (hair != null && spec.hairStyle !== 'bald' && hat !== 'hood' && hat !== 'helm' && hat !== 'hornhelm') {
    B.shape(TPL.hemi, hair, { y: headY + 0.015, sx: 0.29, sy: 0.17, sz: 0.27, rx: -0.15 });
    if (race.longHair || spec.hairStyle === 'long') B.box(hair, { y: headY - 0.2, z: -0.07, sx: 0.26, sy: 0.3, sz: 0.1 });
  }
  // beard
  const beard = spec.beard ?? (race.beard ? hair : null);
  if (beard != null && beard !== false) {
    const big = race.beard ? 1.5 : 1;
    B.shape(TPL.cone6, beard, { y: headY - 0.03, z: 0.08, sx: 0.2 * big * 0.8, sy: 0.18 * big, sz: 0.12, rx: Math.PI + 0.15 });
  }
  // hats
  const hc = spec.hatColor ?? 0x4a4a8a;
  const top = headY + 0.12;
  if (hat === 'wizard') {
    B.shape(TPL.cyl12, hc, { y: headY + 0.07, sx: 0.48, sy: 0.025, sz: 0.48 });
    B.shape(TPL.cone8, hc, { y: headY + 0.09, z: -0.02, sx: 0.25, sy: 0.38, sz: 0.25, rx: -0.18, grad: 0.2 });
  } else if (hat === 'helm' || hat === 'hornhelm') {
    const m = spec.hatColor ?? 0xa8acb4;
    B.shape(TPL.hemi, m, { y: headY + 0.0, sx: 0.31, sy: 0.22, sz: 0.29 });
    B.shape(TPL.cyl8, shade(m, 0.85), { y: headY - 0.005, sx: 0.31, sy: 0.04, sz: 0.29 });
    B.box(shade(m, 0.85), { y: headY - 0.07, z: 0.135, sx: 0.03, sy: 0.09, sz: 0.02 });
    if (hat === 'hornhelm') for (const s of [-1, 1]) B.shape(TPL.cone5, 0xf0e8d0, { x: s * 0.15, y: headY + 0.06, sx: 0.06, sy: 0.17, sz: 0.06, rz: -s * 0.7 });
    if (spec.plume) B.box(spec.plume, { y: top + 0.05, z: -0.03, sx: 0.04, sy: 0.12, sz: 0.2 });
  } else if (hat === 'hood') {
    B.shape(TPL.hemi, hc, { y: headY - 0.02, sx: 0.33, sy: 0.24, sz: 0.31, rx: -0.2 });
    B.shape(TPL.cone6, hc, { y: headY + 0.06, z: -0.07, sx: 0.2, sy: 0.16, sz: 0.2, rx: -0.6 });
    B.box(hc, { y: headY - 0.16, z: -0.06, sx: 0.3, sy: 0.12, sz: 0.18 });
  } else if (hat === 'crown' || hat === 'circlet') {
    const gold = 0xe8c040;
    B.shape(TPL.cyl8, gold, { y: headY + 0.06, sx: 0.29, sy: hat === 'crown' ? 0.06 : 0.025, sz: 0.27 });
    if (hat === 'crown') for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.shape(TPL.cone4, gold, { x: Math.sin(a) * 0.13, y: headY + 0.12, z: Math.cos(a) * 0.12, sx: 0.04, sy: 0.06, sz: 0.04 });
    }
    if (hat === 'circlet') G.box(0x80e0ff, { y: headY + 0.065, z: 0.13, sx: 0.035, sy: 0.035, sz: 0.01 });
  } else if (hat === 'cap') {
    B.shape(TPL.cyl8, hc, { y: headY + 0.07, sx: 0.3, sy: 0.07, sz: 0.3, rz: 0.15 });
    B.box(0xf0e8d0, { x: 0.12, y: headY + 0.12, z: -0.04, sx: 0.02, sy: 0.16, sz: 0.05, rz: -0.5 });
  }

  // weapon (right hand = +x side)
  const hx = armX + 0.01, hy = torsoY + 0.02;
  const steel = 0xd0d4dc;
  const wpn = spec.weapon || 'none';
  const wcol = spec.weaponColor;
  if (wpn === 'sword' || wpn === 'greatsword') {
    const L = wpn === 'greatsword' ? 0.55 : 0.4;
    B.box(wcol ?? steel, { x: hx, y: hy + 0.06, z: 0.08, sx: 0.04, sy: L, sz: 0.015, rx: 0.5 });
    B.box(0xc8a040, { x: hx, y: hy + 0.03, z: 0.05, sx: 0.12, sy: 0.025, sz: 0.03, rx: 0.5 });
    if (spec.weaponGlow) G.box(spec.weaponGlow, { x: hx, y: hy + 0.07, z: 0.09, sx: 0.05, sy: L * 0.95, sz: 0.02, rx: 0.5 });
  } else if (wpn === 'dagger') {
    B.box(wcol ?? steel, { x: hx, y: hy + 0.03, z: 0.06, sx: 0.035, sy: 0.18, sz: 0.012, rx: 0.6 });
    B.box(0x6a4a2a, { x: hx, y: hy, z: 0.03, sx: 0.07, sy: 0.02, sz: 0.03, rx: 0.6 });
  } else if (wpn === 'axe') {
    B.box(0x6a4a2a, { x: hx, y: hy - 0.08, z: 0.05, sx: 0.035, sy: 0.5, sz: 0.035, rx: 0.35 });
    B.box(wcol ?? steel, { x: hx, y: hy + 0.28, z: 0.2, sx: 0.025, sy: 0.15, sz: 0.16, rx: 0.35 });
  } else if (wpn === 'hammer' || wpn === 'mace') {
    B.box(0x6a4a2a, { x: hx, y: hy - 0.06, z: 0.04, sx: 0.035, sy: 0.42, sz: 0.035, rx: 0.35 });
    if (wpn === 'hammer') B.box(wcol ?? 0x8a8e96, { x: hx, y: hy + 0.26, z: 0.15, sx: 0.1, sy: 0.1, sz: 0.18, rx: 0.35 });
    else B.shape(TPL.ico0, wcol ?? 0x8a8e96, { x: hx, y: hy + 0.3, z: 0.15, s: 0.13 });
  } else if (wpn === 'club') {
    B.shape(TPL.taper6, wcol ?? 0x7a5a36, { x: hx, y: hy - 0.05, z: 0.05, sx: 0.12, sy: 0.55, sz: 0.12, rx: Math.PI + 0.4 });
  } else if (wpn === 'staff') {
    B.shape(TPL.cyl6, wcol ?? 0x7a5a36, { x: hx + 0.02, y: 0.02, z: 0.06, sx: 0.04, sy: headY + 0.32, sz: 0.04 });
    G.shape(TPL.ico0, spec.weaponGlow ?? 0x80c0ff, { x: hx + 0.02, y: headY + 0.36, z: 0.06, s: 0.1 });
  } else if (wpn === 'spear') {
    B.shape(TPL.cyl6, 0x7a5a36, { x: hx + 0.02, y: 0.0, z: 0.06, sx: 0.03, sy: headY + 0.35, sz: 0.03 });
    B.shape(TPL.cone4, wcol ?? steel, { x: hx + 0.02, y: headY + 0.35, z: 0.06, sx: 0.05, sy: 0.14, sz: 0.05 });
  } else if (wpn === 'bow') {
    // bow held in the left hand
    const bx = -(armX + 0.02), by = torsoY + 0.12, bz = 0.1;
    const wood = wcol ?? 0x8a5a2a;
    B.box(wood, { x: bx, y: by, z: bz, sx: 0.03, sy: 0.2, sz: 0.03 });
    B.box(wood, { x: bx, y: by + 0.17, z: bz - 0.04, sx: 0.03, sy: 0.18, sz: 0.03, rx: -0.5 });
    B.box(wood, { x: bx, y: by - 0.15, z: bz - 0.04, sx: 0.03, sy: 0.18, sz: 0.03, rx: 0.5 });
    B.box(0xf0f0f0, { x: bx, y: by - 0.13, z: bz - 0.1, sx: 0.006, sy: 0.46, sz: 0.006 });
    // quiver
    B.shape(TPL.cyl6, 0x6a4022, { x: 0.08, y: torsoY + 0.05, z: -0.14, sx: 0.08, sy: 0.32, sz: 0.08, rz: 0.4 });
  }
  if (spec.shield != null && spec.shield !== false && wpn !== 'bow') {
    const sx = -(armX + 0.05);
    B.shape(TPL.cyl12, spec.shield, { x: sx, y: torsoY + 0.15, z: 0.04, sx: 0.28, sy: 0.04, sz: 0.28, rz: Math.PI / 2, ry: -0.5 });
    B.shape(TPL.cyl8, 0xd0b040, { x: sx - 0.015, y: torsoY + 0.15, z: 0.04, sx: 0.08, sy: 0.05, sz: 0.08, rz: Math.PI / 2, ry: -0.5 });
  }
  return { B, G, height: headY + 0.25 };
}

function quadruped(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x7a7068;
  const dark = shade(c, 0.75);
  const L = spec.long ?? 0.55;
  const legH = spec.legH ?? 0.2;
  B.box(c, { y: legH, sx: 0.24, sy: 0.2, sz: L, grad: 0.25 });
  // head
  B.box(c, { y: legH + 0.08, z: L / 2 + 0.08, sx: 0.2, sy: 0.18, sz: 0.18 });
  B.box(dark, { y: legH + 0.08, z: L / 2 + 0.2, sx: 0.11, sy: 0.09, sz: 0.12 });
  B.box(0x1a1a1a, { y: legH + 0.13, z: L / 2 + 0.265, sx: 0.04, sy: 0.03, sz: 0.01 });
  for (const s of [-1, 1]) {
    B.shape(TPL.cone4, spec.earColor ?? dark, { x: s * 0.07, y: legH + 0.25, z: L / 2 + 0.06, sx: 0.06, sy: 0.08, sz: 0.04 });
    if (spec.eyes) G.box(spec.eyes, { x: s * 0.06, y: legH + 0.17, z: L / 2 + 0.17, sx: 0.035, sy: 0.025, sz: 0.01 });
    else B.box(0x101010, { x: s * 0.06, y: legH + 0.17, z: L / 2 + 0.17, sx: 0.03, sy: 0.025, sz: 0.01 });
  }
  // legs
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    B.box(dark, { x: sx * 0.08, y: 0, z: sz * (L / 2 - 0.07), sx: 0.07, sy: legH + 0.02, sz: 0.07 });
  }
  // tail
  if (spec.tail === 'long') B.box(spec.tailColor ?? 0xd09090, { y: legH + 0.06, z: -L / 2 - 0.2, sx: 0.025, sy: 0.025, sz: 0.4, rx: 0.2 });
  else B.box(c, { y: legH + 0.1, z: -L / 2 - 0.1, sx: 0.07, sy: 0.07, sz: 0.22, rx: -0.5 });
  if (spec.spikes) for (let i = 0; i < 4; i++) B.shape(TPL.cone4, 0x2a2420, { y: legH + 0.19, z: L / 2 - 0.1 - i * 0.13, sx: 0.06, sy: 0.1, sz: 0.06 });
  return { B, G, height: legH + 0.35 };
}

function spider(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x3a3030;
  B.shape(TPL.ico1, c, { y: 0.24, z: -0.16, sx: 0.42, sy: 0.34, sz: 0.48, grad: 0.3 });
  B.shape(TPL.ico1, shade(c, 1.2), { y: 0.2, z: 0.14, s: 0.24 });
  if (spec.mark) B.box(spec.mark, { y: 0.41, z: -0.18, sx: 0.12, sy: 0.02, sz: 0.16 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.2 - i * 0.12;
      B.box(shade(c, 0.9), { x: s * 0.2, y: 0.24, z, sx: 0.26, sy: 0.03, sz: 0.03, rz: s * -0.5, ry: s * (i - 1.5) * 0.25 });
      B.box(shade(c, 0.9), { x: s * 0.36, y: 0.02, z: z - s * 0.0, sx: 0.03, sy: 0.26, sz: 0.03, rz: s * -0.25 });
    }
    G.box(spec.eyes ?? 0xff3030, { x: s * 0.05, y: 0.25, z: 0.255, sx: 0.035, sy: 0.035, sz: 0.01 });
  }
  return { B, G, height: 0.45 };
}

function wraith(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x2a2630;
  B.shape(TPL.taper8, c, { y: 0.12, sx: 0.48, sy: 0.6, sz: 0.4, grad: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    B.shape(TPL.cone4, shade(c, 0.8), { x: Math.sin(a) * 0.18, y: 0.02, z: Math.cos(a) * 0.14, sx: 0.1, sy: 0.15, sz: 0.1, rx: Math.PI });
  }
  B.shape(TPL.hemi, c, { y: 0.72, sx: 0.34, sy: 0.3, sz: 0.32, rx: -0.15 });
  B.shape(TPL.cone6, c, { y: 0.84, z: -0.08, sx: 0.22, sy: 0.22, sz: 0.22, rx: -0.6 });
  B.box(0x050508, { y: 0.66, z: 0.11, sx: 0.2, sy: 0.16, sz: 0.04 });
  for (const s of [-1, 1]) {
    G.box(spec.eyes ?? 0x70ff90, { x: s * 0.05, y: 0.73, z: 0.135, sx: 0.04, sy: 0.03, sz: 0.01 });
    B.box(c, { x: s * 0.24, y: 0.36, z: 0.06, sx: 0.09, sy: 0.32, sz: 0.1, rz: s * 0.3, rx: -0.4 });
  }
  if (spec.hat === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.shape(TPL.cone4, 0x6a6a72, { x: Math.sin(a) * 0.13, y: 0.88, z: Math.cos(a) * 0.12, sx: 0.05, sy: 0.12, sz: 0.05 });
    }
  }
  if (spec.weapon === 'sword') {
    B.box(0x2a2a30, { x: 0.3, y: 0.3, z: 0.2, sx: 0.05, sy: 0.55, sz: 0.02, rx: 0.5 });
    G.box(spec.weaponGlow ?? 0x60ff80, { x: 0.3, y: 0.32, z: 0.22, sx: 0.025, sy: 0.5, sz: 0.025, rx: 0.5 });
  }
  return { B, G, height: 0.95, float: true };
}

function bat(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x3a2a2a;
  B.shape(TPL.ico0, c, { y: 0.0, s: 0.18 });
  B.box(c, { y: 0.07, z: 0.04, sx: 0.12, sy: 0.1, sz: 0.1 });
  for (const s of [-1, 1]) {
    B.box(shade(c, 0.8), { x: s * 0.2, y: 0.02, sx: 0.32, sy: 0.015, sz: 0.2, rz: s * 0.35 });
    B.shape(TPL.cone4, c, { x: s * 0.04, y: 0.12, z: 0.04, sx: 0.04, sy: 0.07, sz: 0.04 });
    G.box(0xff4040, { x: s * 0.03, y: 0.08, z: 0.095, sx: 0.025, sy: 0.02, sz: 0.01 });
  }
  return { B, G, height: 0.3, float: true, hover: 0.45 };
}

function serpent(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x2a7a6a;
  for (let i = 0; i < 4; i++) {
    const z = -0.42 + i * 0.22;
    B.shape(TPL.torus, i % 2 ? c : shade(c, 0.9), { y: 0.0, z, sx: 0.32, sy: 0.32, sz: 0.5, ry: Math.PI / 2 });
  }
  B.box(c, { y: 0.32, z: 0.38, sx: 0.18, sy: 0.14, sz: 0.26, rx: -0.3 });
  B.box(shade(c, 1.2), { y: 0.42, z: 0.32, sx: 0.04, sy: 0.12, sz: 0.2 });
  for (const s of [-1, 1]) G.box(0xffe040, { x: s * 0.07, y: 0.4, z: 0.48, sx: 0.03, sy: 0.03, sz: 0.01 });
  return { B, G, height: 0.5 };
}

function dragon(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0xa83a2a;
  const belly = spec.belly ?? 0xe0b060;
  B.shape(TPL.ico1, c, { y: 0.32, sx: 0.5, sy: 0.4, sz: 0.75, grad: 0.3 });
  B.shape(TPL.ico1, belly, { y: 0.24, z: 0.05, sx: 0.36, sy: 0.24, sz: 0.55 });
  // neck & head
  B.box(c, { y: 0.45, z: 0.38, sx: 0.16, sy: 0.16, sz: 0.3, rx: -0.7 });
  B.box(c, { y: 0.66, z: 0.56, sx: 0.22, sy: 0.17, sz: 0.3 });
  B.box(shade(c, 0.8), { y: 0.62, z: 0.74, sx: 0.15, sy: 0.08, sz: 0.12 });
  for (const s of [-1, 1]) {
    B.shape(TPL.cone4, 0xf0e8d0, { x: s * 0.08, y: 0.8, z: 0.48, sx: 0.04, sy: 0.16, sz: 0.04, rx: -0.6 });
    G.box(0xffe040, { x: s * 0.08, y: 0.72, z: 0.7, sx: 0.035, sy: 0.03, sz: 0.01 });
    // wings
    B.shape(TPL.prism, shade(c, 0.85), { x: s * 0.42, y: 0.5, z: -0.05, sx: 0.65, sy: 0.35, sz: 0.04, rz: s * 0.5, rx: Math.PI / 2 });
    // legs
    B.box(shade(c, 0.8), { x: s * 0.2, y: 0, z: 0.2, sx: 0.1, sy: 0.22, sz: 0.1 });
    B.box(shade(c, 0.8), { x: s * 0.2, y: 0, z: -0.2, sx: 0.12, sy: 0.24, sz: 0.12 });
  }
  for (let i = 0; i < 4; i++) B.shape(TPL.cone4, shade(c, 0.7), { y: 0.62 - i * 0.02, z: 0.2 - i * 0.18, sx: 0.06, sy: 0.12, sz: 0.06 });
  B.shape(TPL.cone6, c, { y: 0.24, z: -0.5, sx: 0.18, sy: 0.6, sz: 0.18, rx: -Math.PI / 2 - 0.3 });
  return { B, G, height: 0.9 };
}

function blob(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x4a6a3a;
  B.shape(TPL.hemi, c, { y: 0, sx: 0.7, sy: 0.5, sz: 0.62, grad: 0.4 });
  B.shape(TPL.ico0, shade(c, 1.15), { y: 0.3, z: 0.05, sx: 0.4, sy: 0.25, sz: 0.4 });
  for (const s of [-1, 1]) G.box(spec.eyes ?? 0xffe060, { x: s * 0.1, y: 0.3, z: 0.29, sx: 0.06, sy: 0.05, sz: 0.01 });
  for (let i = 0; i < 4; i++) B.box(shade(c, 0.8), { x: (i - 1.5) * 0.14, y: 0.02, z: 0.28, sx: 0.04, sy: 0.15, sz: 0.04, rz: (i - 1.5) * 0.3 });
  return { B, G, height: 0.55 };
}

function ent(spec) {
  // walking tree-man (for forest guardians)
  const B = new GeoBuilder(), G = new GeoBuilder();
  const bark = spec.color ?? 0x6a4a2b;
  B.shape(TPL.taper6, bark, { y: 0, sx: 0.36, sy: 0.85, sz: 0.32, grad: 0.3 });
  for (const s of [-1, 1]) B.box(bark, { x: s * 0.2, y: 0.4, z: 0.04, sx: 0.08, sy: 0.42, sz: 0.08, rz: s * 0.5 });
  B.shape(TPL.ico0, 0x4c9634, { y: 0.95, s: 0.6, grad: 0.3 });
  for (const s of [-1, 1]) G.box(0xffe080, { x: s * 0.06, y: 0.68, z: 0.15, sx: 0.04, sy: 0.03, sz: 0.01 });
  return { B, G, height: 1.2 };
}

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
  B.box(hull, { y: -0.12, sx: 0.5, sy: 0.26, sz: 0.9, grad: 0.3 });
  B.shape(TPL.cone4, hull, { y: 0.01, z: 0.5, sx: 0.5, sy: 0.32, sz: 0.25, rx: Math.PI / 2, ry: Math.PI / 4 });
  B.box(0xa87a4a, { y: 0.14, sx: 0.44, sy: 0.02, sz: 0.86 });
  B.box(hull, { y: 0.14, z: -0.38, sx: 0.48, sy: 0.16, sz: 0.16 });
  B.shape(TPL.cyl6, 0x5a3a20, { y: 0.14, sx: 0.05, sy: 0.85, sz: 0.05 });
  B.box(spec.sail ?? 0xf0ead8, { y: 0.4, z: 0.02, sx: 0.62, sy: 0.42, sz: 0.03, grad: 0.15 });
  B.box(0x5a3a20, { y: 0.82, z: 0.02, sx: 0.66, sy: 0.03, sz: 0.03 });
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
  const B = new GeoBuilder(), G = new GeoBuilder();
  G.shape(TPL.cone4, spec.color ?? 0xffd040, { y: 0.35, sx: 0.22, sy: 0.3, sz: 0.22, rx: Math.PI });
  B.shape(TPL.cyl12, spec.color ?? 0xffd040, { y: 0, sx: 0.7, sy: 0.02, sz: 0.7 });
  return { B, G, height: 0.6, noLean: true };
}

const BUILDERS = { humanoid, quadruped, spider, wraith, bat, serpent, dragon, blob, ent, chest, ship, waygate, sign, campfire, marker };

export function buildModelGeometry(spec) {
  const key = JSON.stringify(spec);
  let entry = cache.get(key);
  if (entry) return entry;
  const fn = BUILDERS[spec.kind] || humanoid;
  const res = fn(spec);
  const s = spec.scale ?? (spec.kind === 'humanoid' ? (RACE_LOOKS[spec.race] || RACE_LOOKS.human).scale : 1);
  const lit = res.B.count ? res.B.build() : null;
  const glow = res.G.count ? res.G.build() : null;
  if (s !== 1) {
    lit && lit.scale(s, s, s);
    glow && glow.scale(s, s, s);
  }
  entry = { lit, glow, height: res.height * s, float: !!res.float, hover: res.hover || 0, noLean: !!res.noLean, boat: !!res.boat };
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
  }
  if (g.glow) group.add(new THREE.Mesh(g.glow, materials.entityGlow));
  group.userData.info = g;
  return group;
}

export const MODEL_KINDS = Object.keys(BUILDERS);
