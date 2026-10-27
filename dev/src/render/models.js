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

// Bow held upright in the left hand (or slung across the back)
function bowShape(B, x, y, z, wood, o = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), new THREE.Vector3(1, 1, 1));
  const H = o.h ?? 0.26;
  B.shape(TPL.capsule, wood, { y: -0.05, sx: 0.03, sy: 0.12, sz: 0.035, matrix: m });
  B.shape(TPL.capsule, wood, { y: 0.05, z: 0, sx: 0.025, sy: H, sz: 0.025, rx: -0.45, matrix: m });
  B.shape(TPL.capsule, wood, { y: -0.05, z: 0, sx: 0.025, sy: H, sz: 0.025, rx: Math.PI + 0.45, matrix: m });
  const tipZ = -Math.sin(0.45) * H, tipY = Math.cos(0.45) * H;
  B.shape(TPL.cyl6, 0xf4f0e0, { y: -0.05 - tipY, z: tipZ, sx: 0.008, sy: tipY * 2 + 0.1, sz: 0.008, matrix: m });
}

function crossbowShape(B, x, y, z, wood, o = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), new THREE.Vector3(1, 1, 1));
  B.box(wood, { y: 0, z: 0, sx: 0.05, sy: 0.05, sz: 0.34, matrix: m });
  B.shape(TPL.capsule, 0x6a6e76, { x: 0.18, y: 0.025, z: 0.13, sx: 0.03, sy: 0.36, sz: 0.03, rz: Math.PI / 2, matrix: m });
}

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
  const limbW = bones ? 0.055 : 0.11;
  const metal = spec.armor === 'plate' ? 0xc8ccd4 : spec.armor === 'chain' ? 0x9a9ea6 : null;
  const leather = spec.armor === 'leather' ? 0x6a4a2a : null;
  const boot = bones ? skin : 0x3e2a1a;
  const torsoY = legH;
  const torsoH = 0.32;
  const headY = torsoY + torsoH + 0.14;

  // legs & boots
  if (!spec.robe) {
    for (const s of [-1, 1]) {
      const lx = s * 0.075 * W;
      B.shape(TPL.thigh, legs, { x: lx, y: 0.07, sx: limbW, sy: legH - 0.03, sz: limbW + 0.01 });
      B.shape(TPL.capsule, boot, { x: lx, y: 0, z: 0.02, sx: limbW + 0.03, sy: 0.1, sz: limbW + 0.08, grad: 0.3 });
      if (!bones) B.shape(TPL.cyl12, shade(boot, 1.2), { x: lx, y: 0.09, sx: limbW + 0.035, sy: 0.025, sz: limbW + 0.035 });
    }
  }
  // torso / robe
  const chestTop = torsoY + torsoH;
  if (spec.robe) {
    B.shape(TPL.limb, body, { y: 0, sx: 0.46 * W, sy: torsoY + 0.02, sz: 0.36, grad: 0.3 });
    B.shape(TPL.torso, body, { y: torsoY, sx: 0.36 * W, sy: torsoH - 0.03, sz: 0.25, grad: 0.15 });
    B.shape(TPL.ball, body, { y: chestTop - 0.035, sx: 0.37 * W, sy: 0.11, sz: 0.25 });
    if (spec.trim) {
      B.shape(TPL.cyl16, spec.trim, { y: 0, sx: 0.47 * W, sy: 0.035, sz: 0.37 });
      B.box(spec.trim, { y: 0.02, z: 0.16, sx: 0.06, sy: torsoY + torsoH - 0.06, sz: 0.04, rx: 0.06 });
    }
  } else if (bones) {
    B.shape(TPL.cyl8, skin, { y: torsoY - 0.04, sx: 0.06, sy: torsoH + 0.04, sz: 0.06 });
    B.shape(TPL.ball, skin, { y: torsoY - 0.02, sx: 0.2, sy: 0.08, sz: 0.12 });
    for (let i = 0; i < 3; i++) B.shape(TPL.ball, skin, { y: torsoY + 0.1 + i * 0.07, sx: 0.26 - i * 0.02, sy: 0.035, sz: 0.15 });
  } else {
    // tunic skirt, chest and rounded shoulders
    B.shape(TPL.limb, shade(body, 0.92), { y: torsoY - 0.09, sx: 0.33 * W, sy: 0.14, sz: 0.23, grad: 0.25 });
    B.shape(TPL.torso, body, { y: torsoY, sx: 0.34 * W, sy: torsoH - 0.03, sz: 0.23, grad: 0.18 });
    B.shape(TPL.ball, body, { y: chestTop - 0.035, sx: 0.35 * W, sy: 0.1, sz: 0.23 });
    if (spec.trim) B.shape(TPL.cyl16, spec.trim, { y: chestTop - 0.07, sx: 0.355 * W, sy: 0.035, sz: 0.235 });
  }
  if (metal) {
    B.shape(TPL.torso, metal, { y: torsoY + 0.06, sx: 0.36 * W, sy: torsoH - 0.1, sz: 0.25, grad: 0.15 });
    B.shape(TPL.ball, shade(metal, 1.08), { y: chestTop - 0.04, sx: 0.37 * W, sy: 0.1, sz: 0.25 });
    for (const s of [-1, 1]) B.shape(TPL.dome, shade(metal, 1.05), { x: s * 0.19 * W, y: chestTop - 0.075, sx: 0.18, sy: 0.12, sz: 0.2, rz: -s * 0.25 });
  } else if (leather) {
    B.shape(TPL.torso, leather, { y: torsoY + 0.07, sx: 0.355 * W, sy: torsoH - 0.13, sz: 0.24, grad: 0.15 });
  }
  if (!bones) {
    B.shape(TPL.cyl16, 0x4a3020, { y: torsoY + 0.0, sx: 0.35 * W, sy: 0.045, sz: 0.24 });
    B.box(0xd8b048, { y: torsoY + 0.0, z: 0.12, sx: 0.05, sy: 0.045, sz: 0.02 });
  }
  // cape
  if (spec.cape) B.shape(TPL.taper12, spec.cape, { y: 0.06, z: -0.13, sx: 0.4 * W, sy: torsoY + torsoH - 0.06, sz: 0.06, rx: 0.12, grad: 0.35 });
  // arms
  const armX = 0.17 * W + 0.055;
  for (const s of [-1, 1]) {
    const sleeve = metal && spec.armor === 'plate' ? metal : body;
    if (bones) B.shape(TPL.cyl6, skin, { x: s * armX, y: torsoY + 0.02, sx: 0.045, sy: torsoH - 0.04, sz: 0.045, rz: s * 0.1 });
    else {
      B.shape(TPL.thigh, sleeve, { x: s * armX, y: torsoY + 0.03, z: 0.01, sx: 0.095, sy: torsoH - 0.05, sz: 0.1, rz: s * 0.1 });
      B.shape(TPL.ball, sleeve, { x: s * (armX - 0.02), y: chestTop - 0.05, sx: 0.12, sy: 0.11, sz: 0.12 });
    }
    B.shape(TPL.ball, skin, { x: s * (armX + 0.005), y: torsoY + 0.0, z: 0.02, s: 0.085 });
  }
  // neck & head
  B.shape(TPL.cyl8, skin, { y: chestTop - 0.02, sx: 0.09, sy: 0.08, sz: 0.09 });
  B.shape(TPL.ball, skin, { y: headY, sx: 0.26, sy: 0.27, sz: 0.25 });
  if (!bones) B.shape(TPL.ball, shade(skin, 0.95), { y: headY - 0.015, z: 0.12, sx: 0.045, sy: 0.05, sz: 0.04 });
  // eyes
  if (spec.eyes) {
    for (const s of [-1, 1]) G.shape(TPL.ball, spec.eyes, { x: s * 0.05, y: headY + 0.02, z: 0.11, sx: 0.045, sy: 0.035, sz: 0.03 });
  } else {
    for (const s of [-1, 1]) B.shape(TPL.ball, bones ? 0x1a1410 : 0x1a1a22, { x: s * 0.05, y: headY + 0.02, z: 0.108, sx: bones ? 0.055 : 0.032, sy: bones ? 0.055 : 0.038, sz: 0.03 });
  }
  if (race.tusks) for (const s of [-1, 1]) B.shape(TPL.cone8, 0xf0e8d0, { x: s * 0.05, y: headY - 0.08, z: 0.1, sx: 0.025, sy: 0.06, sz: 0.025 });
  if (race.ears) for (const s of [-1, 1]) B.shape(TPL.cone8, skin, { x: s * 0.12, y: headY + 0.02, z: 0, sx: 0.04, sy: 0.12, sz: 0.035, rz: -s * 1.0 });
  if (race.bigEars) for (const s of [-1, 1]) B.shape(TPL.cone8, skin, { x: s * 0.15, y: headY + 0.02, z: 0, sx: 0.07, sy: 0.18, sz: 0.035, rz: -s * 1.3 });
  // hair
  const hat = spec.hat || 'none';
  if (hair != null && spec.hairStyle !== 'bald' && hat !== 'hood' && hat !== 'helm' && hat !== 'hornhelm') {
    B.shape(TPL.dome, hair, { y: headY + 0.0, z: -0.01, sx: 0.285, sy: 0.17, sz: 0.27, rx: -0.3 });
    if (race.longHair || spec.hairStyle === 'long') B.shape(TPL.capsule, hair, { y: headY - 0.24, z: -0.075, sx: 0.25, sy: 0.3, sz: 0.1 });
  }
  // beard
  const beard = spec.beard ?? (race.beard ? hair : null);
  if (beard != null && beard !== false) {
    const big = race.beard ? 1.5 : 1;
    B.shape(TPL.ball, beard, { y: headY - 0.06, z: 0.07, sx: 0.2 * big * 0.8, sy: 0.12, sz: 0.13 });
    B.shape(TPL.cone8, beard, { y: headY - 0.07, z: 0.085, sx: 0.17 * big * 0.8, sy: 0.15 * big, sz: 0.1, rx: Math.PI + 0.2 });
  }
  // hats
  const hc = spec.hatColor ?? 0x4a4a8a;
  const top = headY + 0.12;
  if (hat === 'wizard') {
    B.shape(TPL.cyl16, hc, { y: headY + 0.07, sx: 0.5, sy: 0.02, sz: 0.5 });
    B.shape(TPL.cone12, hc, { y: headY + 0.085, z: -0.02, sx: 0.26, sy: 0.4, sz: 0.26, rx: -0.2, grad: 0.25 });
    B.shape(TPL.cyl16, shade(hc, 1.3), { y: headY + 0.085, sx: 0.27, sy: 0.03, sz: 0.27 });
  } else if (hat === 'helm' || hat === 'hornhelm') {
    const m = spec.hatColor ?? 0xa8acb4;
    B.shape(TPL.dome, m, { y: headY + 0.03, z: -0.01, sx: 0.31, sy: 0.17, sz: 0.29, rx: -0.15 });
    B.shape(TPL.cyl16, shade(m, 0.85), { y: headY + 0.025, z: -0.01, sx: 0.315, sy: 0.04, sz: 0.295, rx: -0.15 });
    B.box(shade(m, 0.85), { y: headY - 0.03, z: 0.145, sx: 0.03, sy: 0.08, sz: 0.02 });
    if (hat === 'hornhelm') for (const s of [-1, 1]) B.shape(TPL.cone8, 0xf0e8d0, { x: s * 0.15, y: headY + 0.05, sx: 0.06, sy: 0.18, sz: 0.06, rz: -s * 0.7 });
    if (spec.plume) B.shape(TPL.capsule, spec.plume, { y: top + 0.02, z: -0.04, sx: 0.045, sy: 0.12, sz: 0.22, rx: -0.3 });
  } else if (hat === 'hood') {
    B.shape(TPL.dome, hc, { y: headY - 0.03, z: -0.02, sx: 0.33, sy: 0.24, sz: 0.31, rx: -0.45 });
    B.shape(TPL.cone8, hc, { y: headY + 0.05, z: -0.08, sx: 0.2, sy: 0.16, sz: 0.2, rx: -0.7 });
    B.shape(TPL.taper12, hc, { y: headY - 0.2, z: -0.04, sx: 0.32, sy: 0.14, sz: 0.24 });
  } else if (hat === 'crown' || hat === 'circlet') {
    const gold = 0xe8c040;
    B.shape(TPL.cyl16, gold, { y: headY + 0.06, sx: 0.29, sy: hat === 'crown' ? 0.06 : 0.025, sz: 0.27 });
    if (hat === 'crown') for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.shape(TPL.cone4, gold, { x: Math.sin(a) * 0.13, y: headY + 0.12, z: Math.cos(a) * 0.12, sx: 0.04, sy: 0.06, sz: 0.04 });
    }
    if (hat === 'circlet') G.shape(TPL.ball, 0x80e0ff, { y: headY + 0.065, z: 0.13, s: 0.035 });
  } else if (hat === 'cap') {
    B.shape(TPL.dome, hc, { y: headY + 0.05, sx: 0.3, sy: 0.12, sz: 0.3, rz: 0.15 });
    B.shape(TPL.capsule, 0xf0e8d0, { x: 0.12, y: headY + 0.1, z: -0.04, sx: 0.025, sy: 0.18, sz: 0.06, rz: -0.5 });
  }

  // weapon (right hand = +x side)
  const hx = armX + 0.01, hy = torsoY + 0.0;
  const steel = 0xd0d4dc;
  const wpn = spec.weapon || 'none';
  const wcol = spec.weaponColor;
  const grip = (len = 0.12) => B.shape(TPL.cyl8, 0x5a3a20, { x: hx, y: hy - len / 2, z: 0.03, sx: 0.03, sy: len, sz: 0.03, rx: 0.5 });
  if (wpn === 'sword' || wpn === 'greatsword') {
    const L = wpn === 'greatsword' ? 0.58 : 0.42;
    grip(0.1);
    B.shape(TPL.ball, 0xc8a040, { x: hx, y: hy - 0.06, z: 0.0, s: 0.04 });
    B.shape(TPL.capsule, 0xc8a040, { x: hx, y: hy + 0.03, z: 0.05, sx: 0.14, sy: 0.03, sz: 0.035, rx: 0.5 });
    B.shape(TPL.taper6, wcol ?? steel, { x: hx, y: hy + 0.05, z: 0.065, sx: 0.05, sy: L, sz: 0.016, rx: 0.5, flat: true });
    if (spec.weaponGlow) G.shape(TPL.taper6, spec.weaponGlow, { x: hx, y: hy + 0.06, z: 0.07, sx: 0.06, sy: L * 0.95, sz: 0.024, rx: 0.5 });
  } else if (wpn === 'dagger') {
    grip(0.07);
    B.shape(TPL.cone4, wcol ?? steel, { x: hx, y: hy + 0.02, z: 0.05, sx: 0.04, sy: 0.18, sz: 0.012, rx: 0.6, flat: true });
  } else if (wpn === 'axe') {
    B.shape(TPL.cyl8, 0x6a4a2a, { x: hx, y: hy - 0.1, z: 0.0, sx: 0.035, sy: 0.55, sz: 0.035, rx: 0.35 });
    B.shape(TPL.dome, wcol ?? steel, { x: hx, y: hy + 0.32, z: 0.15, sx: 0.03, sy: 0.12, sz: 0.2, rx: 0.35 + Math.PI / 2, flat: true });
  } else if (wpn === 'hammer' || wpn === 'mace') {
    B.shape(TPL.cyl8, 0x6a4a2a, { x: hx, y: hy - 0.08, z: 0.0, sx: 0.035, sy: 0.45, sz: 0.035, rx: 0.35 });
    if (wpn === 'hammer') B.shape(TPL.cyl8, wcol ?? 0x8a8e96, { x: hx, y: hy + 0.28, z: 0.06, sx: 0.11, sy: 0.2, sz: 0.11, rx: 0.35 + Math.PI / 2 });
    else B.shape(TPL.dodec, wcol ?? 0x8a8e96, { x: hx, y: hy + 0.32, z: 0.13, s: 0.14 });
  } else if (wpn === 'club') {
    B.shape(TPL.limb, wcol ?? 0x7a5a36, { x: hx, y: hy - 0.08, z: 0.0, sx: 0.12, sy: 0.6, sz: 0.12, rx: 0.4, grad: 0.3 });
  } else if (wpn === 'staff') {
    B.shape(TPL.cyl8, wcol ?? 0x7a5a36, { x: hx + 0.02, y: 0.02, z: 0.06, sx: 0.04, sy: headY + 0.32, sz: 0.04 });
    B.shape(TPL.ball, 0x6a4a2a, { x: hx + 0.02, y: headY + 0.33, z: 0.06, s: 0.07 });
    G.shape(TPL.ico1, spec.weaponGlow ?? 0x80c0ff, { x: hx + 0.02, y: headY + 0.4, z: 0.06, s: 0.1 });
  } else if (wpn === 'spear') {
    B.shape(TPL.cyl8, 0x7a5a36, { x: hx + 0.02, y: 0.0, z: 0.06, sx: 0.03, sy: headY + 0.35, sz: 0.03 });
    B.shape(TPL.cone8, wcol ?? steel, { x: hx + 0.02, y: headY + 0.35, z: 0.06, sx: 0.06, sy: 0.16, sz: 0.06 });
  } else if (wpn === 'bow') {
    bowShape(B, -(armX + 0.02), torsoY + 0.12, 0.1, wcol ?? 0x8a5a2a);
  } else if (wpn === 'crossbow') {
    crossbowShape(B, hx - 0.06, torsoY + 0.1, 0.16, wcol ?? 0x7a5030, { rx: -0.2 });
  } else if (wpn === 'sling') {
    B.shape(TPL.cyl6, 0x8a6a42, { x: hx, y: hy - 0.18, z: 0.03, sx: 0.012, sy: 0.18, sz: 0.012 });
    B.shape(TPL.ball, 0x8a6a42, { x: hx, y: hy - 0.19, z: 0.03, s: 0.05 });
  }
  // ranged weapon carried on the back, and a quiver for bows
  const rng = spec.ranged || (wpn === 'bow' ? 'bow' : wpn === 'crossbow' ? 'crossbow' : null);
  if (rng === 'bow' || rng === 'crossbow') {
    B.shape(TPL.cyl8, 0x6a4022, { x: 0.08, y: torsoY + 0.06, z: -0.15, sx: 0.08, sy: 0.3, sz: 0.08, rz: 0.4 });
    for (let i = 0; i < 3; i++) B.shape(TPL.cone4, i === 1 ? 0xe8e0d0 : 0xa83a2a, { x: 0.15 + i * 0.02, y: torsoY + 0.32, z: -0.15 + (i - 1) * 0.02, sx: 0.03, sy: 0.06, sz: 0.01, rz: 0.4 });
  }
  if (spec.ranged && spec.ranged !== wpn) {
    if (spec.ranged === 'bow') bowShape(B, -0.02, torsoY + 0.2, -0.16, wcol ?? 0x8a5a2a, { rz: -0.9, h: 0.24 });
    else if (spec.ranged === 'crossbow') crossbowShape(B, 0, torsoY + 0.22, -0.16, 0x7a5030, { rx: Math.PI / 2, rz: 0.6 });
    else if (spec.ranged === 'sling') B.shape(TPL.ball, 0x8a6a42, { x: -0.17 * W, y: torsoY - 0.02, z: 0.06, sx: 0.08, sy: 0.07, sz: 0.06 });
  }
  if (spec.shield != null && spec.shield !== false && wpn !== 'bow' && wpn !== 'crossbow') {
    const sx = -(armX + 0.05);
    B.shape(TPL.cyl16, spec.shield, { x: sx, y: torsoY + 0.15, z: 0.04, sx: 0.3, sy: 0.04, sz: 0.3, rz: Math.PI / 2, ry: -0.5 });
    B.shape(TPL.cyl16, shade(spec.shield, 0.7), { x: sx + 0.003, y: torsoY + 0.15, z: 0.04, sx: 0.31, sy: 0.03, sz: 0.31, rz: Math.PI / 2, ry: -0.5 });
    B.shape(TPL.dome, 0xd0b040, { x: sx - 0.02, y: torsoY + 0.15, z: 0.05, sx: 0.08, sy: 0.04, sz: 0.08, rz: Math.PI / 2, ry: -0.5 });
  }
  return { B, G, height: headY + 0.25 };
}

function quadruped(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x7a7068;
  const dark = shade(c, 0.75);
  const light = shade(c, 1.15);
  const L = spec.long ?? 0.55;
  const legH = spec.legH ?? 0.2;
  const hz = L / 2 + 0.1, hy = legH + 0.17;
  // body: chest, haunch and belly
  B.shape(TPL.ball, c, { y: legH + 0.11, z: 0.06, sx: 0.27, sy: 0.25, sz: L * 0.75, grad: 0.3 });
  B.shape(TPL.ball, c, { y: legH + 0.12, z: L * 0.22, sx: 0.29, sy: 0.27, sz: 0.3, grad: 0.3 });
  B.shape(TPL.ball, shade(c, 0.92), { y: legH + 0.1, z: -L * 0.25, sx: 0.26, sy: 0.23, sz: 0.28, grad: 0.3 });
  // neck & head
  B.shape(TPL.capsule, c, { y: legH + 0.08, z: L / 2 - 0.02, sx: 0.15, sy: 0.22, sz: 0.15, rx: 0.8 });
  B.shape(TPL.ball, c, { y: hy, z: hz, sx: 0.2, sy: 0.18, sz: 0.2 });
  B.shape(TPL.taper12, light, { y: hy - 0.04, z: hz + 0.05, sx: 0.11, sy: 0.16, sz: 0.1, rx: Math.PI / 2, grad: 0.2 });
  B.shape(TPL.ball, 0x1a1a1a, { y: hy - 0.01, z: hz + 0.21, sx: 0.045, sy: 0.035, sz: 0.03 });
  for (const s of [-1, 1]) {
    B.shape(TPL.cone8, spec.earColor ?? dark, { x: s * 0.065, y: hy + 0.06, z: hz - 0.03, sx: 0.06, sy: 0.1, sz: 0.04, rz: -s * 0.2 });
    if (spec.eyes) G.shape(TPL.ball, spec.eyes, { x: s * 0.055, y: hy + 0.03, z: hz + 0.085, sx: 0.04, sy: 0.03, sz: 0.02 });
    else B.shape(TPL.ball, 0x101010, { x: s * 0.055, y: hy + 0.03, z: hz + 0.085, sx: 0.035, sy: 0.03, sz: 0.02 });
  }
  // legs
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    B.shape(TPL.thigh, dark, { x: sx * 0.08, y: 0.02, z: sz * (L / 2 - 0.08), sx: 0.075, sy: legH + 0.06, sz: 0.085 });
    B.shape(TPL.ball, shade(dark, 0.8), { x: sx * 0.08, y: 0.02, z: sz * (L / 2 - 0.08) + 0.015, sx: 0.07, sy: 0.04, sz: 0.09 });
  }
  // tail
  if (spec.tail === 'long') B.shape(TPL.cone8, spec.tailColor ?? 0xd09090, { y: legH + 0.1, z: -L / 2 - 0.04, sx: 0.035, sy: 0.45, sz: 0.035, rx: -Math.PI / 2 + 0.25 });
  else B.shape(TPL.capsule, c, { y: legH + 0.14, z: -L / 2 + 0.02, sx: 0.08, sy: 0.26, sz: 0.08, rx: -2.2 });
  if (spec.spikes) for (let i = 0; i < 4; i++) B.shape(TPL.cone8, 0x2a2420, { y: legH + 0.2, z: L / 2 - 0.12 - i * 0.13, sx: 0.06, sy: 0.11, sz: 0.06, rx: -0.3 });
  return { B, G, height: legH + 0.35 };
}

function spider(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x3a3030;
  B.shape(TPL.ico1, c, { y: 0.24, z: -0.16, sx: 0.42, sy: 0.34, sz: 0.48, grad: 0.3 });
  B.shape(TPL.ico1, shade(c, 1.2), { y: 0.2, z: 0.14, s: 0.24 });
  if (spec.mark) B.shape(TPL.ball, spec.mark, { y: 0.4, z: -0.2, sx: 0.14, sy: 0.04, sz: 0.2 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.2 - i * 0.12;
      B.shape(TPL.capsule, shade(c, 0.9), { x: s * 0.06, y: 0.22, z, sx: 0.04, sy: 0.3, sz: 0.04, rz: -s * 1.1, ry: s * (i - 1.5) * 0.25 });
      B.shape(TPL.capsule, shade(c, 0.8), { x: s * 0.33, y: 0.0, z, sx: 0.035, sy: 0.34, sz: 0.035, rz: s * 0.35 });
    }
    G.shape(TPL.ball, spec.eyes ?? 0xff3030, { x: s * 0.05, y: 0.25, z: 0.245, s: 0.04 });
    B.shape(TPL.cone8, 0x1a1414, { x: s * 0.04, y: 0.12, z: 0.24, sx: 0.03, sy: 0.08, sz: 0.03, rx: Math.PI });
  }
  return { B, G, height: 0.45 };
}

function wraith(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x2a2630;
  B.shape(TPL.taper12, c, { y: 0.12, sx: 0.48, sy: 0.6, sz: 0.4, grad: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    B.shape(TPL.cone4, shade(c, 0.8), { x: Math.sin(a) * 0.18, y: 0.02, z: Math.cos(a) * 0.14, sx: 0.1, sy: 0.15, sz: 0.1, rx: Math.PI });
  }
  B.shape(TPL.hemi, c, { y: 0.72, sx: 0.34, sy: 0.3, sz: 0.32, rx: -0.15 });
  B.shape(TPL.cone6, c, { y: 0.84, z: -0.08, sx: 0.22, sy: 0.22, sz: 0.22, rx: -0.6 });
  B.shape(TPL.ball, 0x050508, { y: 0.69, z: 0.1, sx: 0.22, sy: 0.2, sz: 0.06 });
  for (const s of [-1, 1]) {
    G.box(spec.eyes ?? 0x70ff90, { x: s * 0.05, y: 0.73, z: 0.135, sx: 0.04, sy: 0.03, sz: 0.01 });
    B.shape(TPL.thigh, c, { x: s * 0.24, y: 0.36, z: 0.06, sx: 0.1, sy: 0.32, sz: 0.11, rz: s * 0.3, rx: -0.4 });
    B.shape(TPL.ball, shade(c, 0.6), { x: s * 0.31, y: 0.36, z: 0.18, s: 0.07 });
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
  B.shape(TPL.ball, c, { y: 0.0, sx: 0.16, sy: 0.18, sz: 0.15 });
  B.shape(TPL.ball, c, { y: 0.09, z: 0.04, s: 0.12 });
  for (const s of [-1, 1]) {
    const w = shade(c, 0.8);
    B.tri([s * 0.05, 0.04, 0.02], [s * 0.36, 0.14, -0.02], [s * 0.3, -0.02, -0.08], w);
    B.tri([s * 0.05, 0.04, 0.02], [s * 0.3, -0.02, -0.08], [s * 0.36, 0.14, -0.02], w);
    B.tri([s * 0.05, 0.04, 0.02], [s * 0.3, -0.02, -0.08], [s * 0.12, -0.04, -0.06], w);
    B.tri([s * 0.05, 0.04, 0.02], [s * 0.12, -0.04, -0.06], [s * 0.3, -0.02, -0.08], w);
    B.shape(TPL.cone8, c, { x: s * 0.04, y: 0.13, z: 0.04, sx: 0.04, sy: 0.08, sz: 0.04 });
    G.shape(TPL.ball, 0xff4040, { x: s * 0.03, y: 0.1, z: 0.095, s: 0.025 });
  }
  return { B, G, height: 0.3, float: true, hover: 0.45 };
}

function serpent(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x2a7a6a;
  for (let i = 0; i < 4; i++) {
    const z = -0.42 + i * 0.22;
    B.shape(TPL.torus, i % 2 ? c : shade(c, 0.9), { y: 0.0, z, sx: 0.32, sy: 0.32, sz: 0.6, ry: Math.PI / 2 });
  }
  B.shape(TPL.capsule, c, { y: 0.0, z: 0.34, sx: 0.16, sy: 0.4, sz: 0.16, rx: -0.25 });
  B.shape(TPL.ball, c, { y: 0.4, z: 0.45, sx: 0.2, sy: 0.14, sz: 0.3 });
  B.shape(TPL.cone8, shade(c, 1.25), { y: 0.42, z: 0.28, sx: 0.04, sy: 0.16, sz: 0.2, rx: -0.6 });
  for (const s of [-1, 1]) G.shape(TPL.ball, 0xffe040, { x: s * 0.07, y: 0.44, z: 0.56, s: 0.035 });
  return { B, G, height: 0.5 };
}

function dragon(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0xa83a2a;
  const belly = spec.belly ?? 0xe0b060;
  B.shape(TPL.ball, c, { y: 0.32, sx: 0.5, sy: 0.4, sz: 0.75, grad: 0.3 });
  B.shape(TPL.ball, belly, { y: 0.25, z: 0.05, sx: 0.38, sy: 0.26, sz: 0.6 });
  // neck & head
  B.shape(TPL.capsule, c, { y: 0.3, z: 0.3, sx: 0.17, sy: 0.42, sz: 0.17, rx: 0.75 });
  B.shape(TPL.ball, c, { y: 0.66, z: 0.58, sx: 0.24, sy: 0.18, sz: 0.3 });
  B.shape(TPL.taper12, shade(c, 0.85), { y: 0.62, z: 0.62, sx: 0.16, sy: 0.18, sz: 0.1, rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    B.shape(TPL.cone4, 0xf0e8d0, { x: s * 0.08, y: 0.8, z: 0.48, sx: 0.04, sy: 0.16, sz: 0.04, rx: -0.6 });
    G.shape(TPL.ball, 0xffe040, { x: s * 0.08, y: 0.71, z: 0.69, sx: 0.04, sy: 0.03, sz: 0.03 });
    // wings
    B.shape(TPL.prism, shade(c, 0.85), { x: s * 0.42, y: 0.5, z: -0.05, sx: 0.65, sy: 0.35, sz: 0.04, rz: s * 0.5, rx: Math.PI / 2 });
    // legs
    B.shape(TPL.thigh, shade(c, 0.8), { x: s * 0.2, y: 0, z: 0.2, sx: 0.11, sy: 0.24, sz: 0.11 });
    B.shape(TPL.thigh, shade(c, 0.8), { x: s * 0.2, y: 0, z: -0.2, sx: 0.14, sy: 0.27, sz: 0.14 });
    for (const zz of [0.22, -0.18]) B.shape(TPL.ball, shade(c, 0.7), { x: s * 0.2, y: 0.01, z: zz, sx: 0.12, sy: 0.05, sz: 0.14 });
  }
  for (let i = 0; i < 4; i++) B.shape(TPL.cone4, shade(c, 0.7), { y: 0.62 - i * 0.02, z: 0.2 - i * 0.18, sx: 0.06, sy: 0.12, sz: 0.06 });
  B.shape(TPL.cone12, c, { y: 0.24, z: -0.5, sx: 0.18, sy: 0.6, sz: 0.18, rx: -Math.PI / 2 - 0.3 });
  return { B, G, height: 0.9 };
}

function blob(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const c = spec.color ?? 0x4a6a3a;
  B.shape(TPL.hemi, c, { y: 0, sx: 0.7, sy: 0.5, sz: 0.62, grad: 0.4 });
  B.shape(TPL.ico1, shade(c, 1.15), { y: 0.3, z: 0.05, sx: 0.4, sy: 0.25, sz: 0.4 });
  for (const s of [-1, 1]) G.shape(TPL.ball, spec.eyes ?? 0xffe060, { x: s * 0.1, y: 0.3, z: 0.27, sx: 0.07, sy: 0.06, sz: 0.04 });
  for (let i = 0; i < 4; i++) B.shape(TPL.cone8, shade(c, 0.8), { x: (i - 1.5) * 0.14, y: 0.02, z: 0.28, sx: 0.04, sy: 0.18, sz: 0.04, rz: (i - 1.5) * 0.3 });
  return { B, G, height: 0.55 };
}

function ent(spec) {
  // walking tree-man (for forest guardians)
  const B = new GeoBuilder(), G = new GeoBuilder();
  const bark = spec.color ?? 0x6a4a2b;
  B.shape(TPL.taper8, bark, { y: 0, sx: 0.36, sy: 0.85, sz: 0.32, grad: 0.3 });
  for (const s of [-1, 1]) B.shape(TPL.thigh, bark, { x: s * 0.2, y: 0.4, z: 0.04, sx: 0.09, sy: 0.42, sz: 0.09, rz: s * 0.5 });
  B.shape(TPL.ico1, 0x4c9634, { y: 0.95, s: 0.6, grad: 0.3 });
  B.shape(TPL.ico1, 0x5aa339, { x: 0.12, y: 1.12, z: 0.04, s: 0.36, grad: 0.3 });
  for (const s of [-1, 1]) G.shape(TPL.ball, 0xffe080, { x: s * 0.06, y: 0.68, z: 0.15, s: 0.035 });
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
