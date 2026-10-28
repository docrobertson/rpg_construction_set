// Procedural low-poly models for characters, monsters and objects.
// Each model is built into one lit + one glow geometry (cached by spec).
// Models face +Z (towards the camera) with their feet at y = 0.
import * as THREE from 'three';
import { GeoBuilder, TPL, shade } from './builder.js';

const cache = new Map();

// Proportions per race, toy-figure style: everyone shares the same blocky
// body plan; races differ in leg length, build, and their ears, beards and tusks.
export const RACE_LOOKS = {
  human: { scale: 1, width: 1, skin: 0xf0c4a0, hair: 0x5a3a20, legH: 0.3 },
  dwarf: { scale: 0.92, width: 1.1, skin: 0xeab48e, hair: 0x9a4a22, legH: 0.18, beard: true },
  elf: { scale: 1.02, width: 0.96, skin: 0xf6dcc4, hair: 0xeedc98, legH: 0.33, ears: true, longHair: true },
  hobbit: { scale: 0.82, width: 1, skin: 0xf0c4a0, hair: 0x6a4020, legH: 0.2 },
  orc: { scale: 1.06, width: 1.12, skin: 0x6f8f42, hair: 0x1a1a1a, legH: 0.3, tusks: true },
  goblin: { scale: 0.78, width: 1, skin: 0x9aaa44, hair: 0x2a2a1a, legH: 0.2, bigEars: true, nose: true },
  troll: { scale: 1.5, width: 1.22, skin: 0x7a8a76, hair: 0x3a3a2a, legH: 0.3, tusks: true },
  skeleton: { scale: 1, width: 0.95, skin: 0xece4cc, hair: null, legH: 0.3, bones: true },
};

export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bald'];

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

// A toy figure: cylinder head with a stud and a smile, trapezoid torso,
// block hips and legs, and C-shaped hands that grip weapons. Proportions are
// borrowed from building-block figures, so everyone reads as cute and chunky.
function humanoid(spec) {
  const B = new GeoBuilder(), G = new GeoBuilder();
  const race = RACE_LOOKS[spec.race] || RACE_LOOKS.human;
  const W = (spec.width ?? 1) * race.width;
  const skin = spec.skin ?? race.skin;
  const hair = spec.hair ?? race.hair;
  const body = spec.body ?? 0x7a2a2a;
  const legs = spec.legs ?? shade(body, 0.55);
  const bones = race.bones;
  const robe = !!spec.robe;
  const plate = spec.armor === 'plate';
  const metal = plate ? 0xc4c9d2 : spec.armor === 'chain' ? 0x8f949c : null;
  const leather = spec.armor === 'leather' ? 0x6e4a2c : null;
  const hat = spec.hat || 'none';
  const style = spec.hairStyle || (race.longHair ? 'long' : 'short');
  const ink = 0x1e1612;

  const legH = race.legH, hipH = 0.07, torsoH = 0.28;
  const torsoY = legH + hipH, torsoTop = torsoY + torsoH;
  const headR = 0.115, headH = 0.23;
  const hb = torsoTop + 0.025; // bottom of the head
  const faceZ = headR - 0.004;
  const legC = bones ? skin : plate ? shade(metal, 0.92) : legs;
  const shirt = bones ? skin : metal && spec.armor === 'chain' ? metal : body;

  // ---- legs, hips (or a long skirt)
  if (robe) {
    B.shape(TPL.trap, body, { y: 0, sx: 0.46 * W, sy: torsoY, sz: 0.24, grad: 0.3 });
    if (spec.trim) B.shape(TPL.trap, spec.trim, { y: 0, sx: 0.465 * W, sy: 0.035, sz: 0.245 });
  } else {
    for (const s of [-1, 1]) {
      const lx = s * 0.08 * W;
      if (bones) B.shape(TPL.cyl8, skin, { x: lx, y: 0.05, sx: 0.05, sy: legH - 0.04, sz: 0.05 });
      else B.box(legC, { x: lx, y: 0.05, sx: 0.15 * W, sy: legH - 0.05, sz: 0.15 });
      B.box(bones ? skin : shade(legC, 0.85), { x: lx, y: 0, z: 0.02, sx: 0.15 * W, sy: 0.06, sz: 0.19 });
    }
    B.box(bones ? skin : legC, { y: legH, sx: 0.33 * W, sy: hipH, sz: 0.16 });
  }

  // ---- torso
  if (bones) {
    B.shape(TPL.trap, skin, { y: torsoY, sx: 0.3 * W, sy: torsoH, sz: 0.14 });
    for (let i = 0; i < 3; i++) B.box(ink, { y: torsoY + 0.06 + i * 0.07, z: 0.072, sx: 0.2 * W, sy: 0.022, sz: 0.01 });
  } else {
    B.shape(TPL.trap, shirt, { y: torsoY, sx: 0.34 * W, sy: torsoH, sz: 0.16, grad: 0.12 });
    if (leather) B.shape(TPL.trap, leather, { y: torsoY + 0.02, sx: 0.35 * W, sy: torsoH - 0.06, sz: 0.172 });
    if (plate) {
      B.shape(TPL.trap, metal, { y: torsoY + 0.015, sx: 0.355 * W, sy: torsoH - 0.03, sz: 0.18, grad: 0.1 });
      B.box(shade(metal, 0.85), { y: torsoY + 0.12, z: 0.091, sx: 0.025, sy: 0.12, sz: 0.01 });
    }
    // printed details: a belt, and a stripe of trim down the front
    if (!robe && !plate) B.box(0x3e2818, { y: torsoY, z: 0, sx: 0.342 * W, sy: 0.032, sz: 0.165 });
    if (!robe && !plate) B.box(0xd8b048, { y: torsoY + 0.004, z: 0.083, sx: 0.04, sy: 0.026, sz: 0.008 });
    if (spec.trim) B.box(spec.trim, { y: torsoY + 0.03, z: 0.081 + (leather ? 0.007 : 0), sx: 0.05, sy: torsoH - 0.03, sz: 0.01 });
  }
  // cape: a flat panel hanging from the shoulders
  if (spec.cape) {
    B.shape(TPL.trap, spec.cape, { y: robe ? 0.03 : 0.06, z: -0.095, sx: 0.4 * W, sy: torsoTop - (robe ? 0.03 : 0.06) - 0.02, sz: 0.025, rx: 0.07, grad: 0.35 });
  }

  // ---- arms and hands
  const shX = 0.15 * W, shY = torsoTop - 0.045;
  const hx = 0.2 * W, hy = torsoY + 0.02, hz = 0.06;
  for (const s of [-1, 1]) {
    const sleeve = plate ? metal : shirt;
    B.shape(TPL.ball, sleeve, { x: s * shX, y: shY, s: bones ? 0.06 : 0.1 });
    const dx = s * hx - s * shX, dy = shY - (hy + 0.04), dz = -hz;
    const len = Math.hypot(dx, dy, dz);
    B.shape(bones ? TPL.cyl6 : TPL.limb, sleeve, { x: s * hx, y: hy + 0.03, z: hz, sx: bones ? 0.035 : 0.085, sy: len, sz: bones ? 0.035 : 0.085, rz: Math.atan2(dx, dy), rx: Math.atan2(dz, dy) });
    if (plate) B.shape(TPL.dome, shade(metal, 1.05), { x: s * (shX + 0.01), y: shY - 0.02, sx: 0.13, sy: 0.07, sz: 0.17, rz: -s * 0.4 });
    B.shape(TPL.toyHand, plate ? metal : skin, { x: s * hx, y: hy, z: hz, s: 0.085 });
  }

  // ---- head
  B.shape(TPL.cyl12, skin, { y: torsoTop - 0.005, sx: 0.1, sy: 0.04, sz: 0.1 });
  B.shape(TPL.toyHead, skin, { y: hb, sx: 2 * headR, sy: headH, sz: 2 * headR });
  B.shape(TPL.cyl16, skin, { y: hb + headH, sx: 0.13, sy: 0.035, sz: 0.13 });
  const eyeY = hb + 0.125;
  if (bones) {
    for (const s of [-1, 1]) (spec.eyes ? G : B).shape(TPL.ball, spec.eyes ?? ink, { x: s * 0.045, y: eyeY, z: faceZ, sx: 0.06, sy: 0.065, sz: 0.03 });
    B.shape(TPL.ball, ink, { y: hb + 0.08, z: faceZ, sx: 0.025, sy: 0.03, sz: 0.02 });
    for (let i = -2; i <= 2; i++) B.box(ink, { x: i * 0.022, y: hb + 0.03, z: faceZ - 0.002, sx: 0.008, sy: 0.03, sz: 0.012 });
  } else {
    for (const s of [-1, 1]) {
      if (spec.eyes) G.shape(TPL.ball, spec.eyes, { x: s * 0.043, y: eyeY, z: faceZ, sx: 0.038, sy: 0.038, sz: 0.02 });
      else {
        B.shape(TPL.ball, ink, { x: s * 0.043, y: eyeY, z: faceZ, sx: 0.028, sy: 0.042, sz: 0.02 });
        B.shape(TPL.ball, 0xffffff, { x: s * 0.043 + 0.006, y: eyeY + 0.011, z: faceZ + 0.009, s: 0.01 });
      }
      const browC = race.tusks || race.bigEars ? ink : shade(hair ?? 0x3a2a1a, 0.8);
      B.box(browC, { x: s * 0.044, y: eyeY + 0.042, z: faceZ - 0.006, sx: 0.045, sy: 0.011, sz: 0.012, rz: s * (race.tusks || race.bigEars ? 0.4 : -0.1) });
    }
    // a smile (orcs and goblins scowl)
    const mk = 0.075;
    const angry = race.tusks || race.bigEars;
    B.shape(TPL.smile, ink, { y: hb + 0.065 + (angry ? -0.04 : 0.37 * mk), z: faceZ - 0.002, s: mk, rz: angry ? Math.PI : 0 });
    if (race.tusks) for (const s of [-1, 1]) B.shape(TPL.cone8, 0xf4ecd8, { x: s * 0.04, y: hb + 0.035, z: faceZ, sx: 0.025, sy: 0.055, sz: 0.025 });
    if (race.nose) B.shape(TPL.cone8, shade(skin, 0.9), { y: hb + 0.095, z: faceZ, sx: 0.04, sy: 0.1, sz: 0.04, rx: Math.PI / 2 + 0.2 });
  }
  if (race.ears) for (const s of [-1, 1]) B.shape(TPL.cone8, skin, { x: s * (headR - 0.01), y: hb + 0.13, sx: 0.05, sy: 0.15, sz: 0.03, rz: -s * 1.2 });
  if (race.bigEars) for (const s of [-1, 1]) B.shape(TPL.cone8, skin, { x: s * (headR - 0.01), y: hb + 0.13, sx: 0.08, sy: 0.22, sz: 0.03, rz: -s * 1.35 });

  // ---- hair pieces
  const covered = hat === 'hood' || hat === 'helm' || hat === 'hornhelm';
  if (hair != null && !bones && style !== 'bald' && !covered) {
    const r2 = 2 * (headR + 0.018);
    B.shape(TPL.dome, hair, { y: hb + 0.16, z: -0.008, sx: r2, sy: 0.12, sz: r2, rx: -0.14, grad: 0.15 });
    B.shape(TPL.cyl16, hair, { y: hb + 0.13, z: -0.03, sx: r2, sy: 0.045, sz: r2 - 0.05 });
    const back = style === 'long' ? 0.36 : 0.2;
    B.shape(TPL.ball, hair, { y: hb + 0.21 - back / 2, z: -0.06, sx: r2 + (style === 'long' ? 0.03 : 0), sy: back, sz: 0.13 });
    if (style === 'ponytail') {
      B.shape(TPL.ball, hair, { y: hb + 0.2, z: -headR - 0.02, s: 0.08 });
      B.shape(TPL.capsule, hair, { y: hb - 0.06, z: -headR - 0.035, sx: 0.065, sy: 0.24, sz: 0.065, rx: 0.12 });
    }
  }
  // ---- beard
  const beard = spec.beard ?? (race.beard ? hair : null);
  if (beard != null && beard !== false && !bones) {
    const big = race.beard ? 1.3 : 0.9;
    B.shape(TPL.ball, beard, { y: hb + 0.05, z: faceZ - 0.035, sx: 0.21, sy: 0.11 * big, sz: 0.1 });
    B.shape(TPL.cone8, beard, { y: hb + 0.04, z: faceZ - 0.02, sx: 0.18 * big, sy: 0.17 * big, sz: 0.09, rx: Math.PI - 0.2 });
    B.box(shade(beard, 1.1), { y: hb + 0.068, z: faceZ + 0.008, sx: 0.12, sy: 0.026, sz: 0.026 });
  }

  // ---- headgear
  const hc = spec.hatColor ?? 0x4a4a8a;
  if (hat === 'wizard') {
    B.shape(TPL.cyl16, hc, { y: hb + 0.2, sx: 0.4, sy: 0.022, sz: 0.4 });
    B.shape(TPL.cone12, hc, { y: hb + 0.21, z: -0.01, sx: 0.25, sy: 0.36, sz: 0.25, rx: -0.12, grad: 0.15 });
    B.shape(TPL.cyl16, shade(hc, 1.45), { y: hb + 0.215, sx: 0.252, sy: 0.035, sz: 0.252 });
  } else if (hat === 'helm' || hat === 'hornhelm') {
    const m = spec.hatColor ?? 0xb0b6c0;
    const rr = 2 * (headR + 0.022);
    B.shape(TPL.cyl16, m, { y: hb + 0.13, sx: rr, sy: 0.085, sz: rr });
    B.shape(TPL.dome, m, { y: hb + 0.21, sx: rr, sy: 0.1, sz: rr, grad: 0.12 });
    B.box(shade(m, 0.85), { y: hb + 0.075, z: headR + 0.016, sx: 0.026, sy: 0.08, sz: 0.022 });
    for (const s of [-1, 1]) B.box(shade(m, 0.9), { x: s * (headR + 0.008), y: hb + 0.06, sx: 0.03, sy: 0.08, sz: 0.13 });
    if (hat === 'hornhelm') for (const s of [-1, 1]) {
      B.shape(TPL.cone8, 0xf0e6d0, { x: s * (headR + 0.02), y: hb + 0.22, sx: 0.07, sy: 0.15, sz: 0.07, rz: -s * 1.0 });
      B.shape(TPL.cone8, 0xf0e6d0, { x: s * (headR + 0.13), y: hb + 0.28, sx: 0.042, sy: 0.1, sz: 0.042, rz: -s * 0.25 });
    }
    if (spec.plume) B.shape(TPL.capsule, spec.plume, { y: hb + 0.3, z: -0.03, sx: 0.045, sy: 0.2, sz: 0.08, rx: -1.1 });
  } else if (hat === 'hood') {
    // a cowl: crown, sides and back, open at the front so the face shows
    const rr = 2 * (headR + 0.03);
    B.shape(TPL.dome, hc, { y: hb + 0.16, z: -0.012, sx: rr, sy: 0.15, sz: rr, rx: -0.18, grad: 0.15 });
    for (const s of [-1, 1]) B.shape(TPL.capsule, hc, { x: s * (headR + 0.012), y: hb - 0.01, z: -0.02, sx: 0.05, sy: 0.24, sz: 0.2 });
    B.shape(TPL.ball, hc, { y: hb + 0.11, z: -0.07, sx: rr, sy: 0.26, sz: 0.13 });
    B.shape(TPL.cone8, hc, { y: hb + 0.22, z: -headR - 0.01, sx: 0.12, sy: 0.12, sz: 0.12, rx: -2.1 });
    B.shape(TPL.trap, shade(hc, 0.92), { y: torsoTop - 0.05, sx: 0.4 * W, sy: 0.07, sz: 0.2 });
  } else if (hat === 'crown' || hat === 'circlet') {
    const gold = 0xe8c040;
    const rr = 2 * (headR + 0.012);
    B.shape(TPL.cyl16, gold, { y: hb + 0.19, sx: rr, sy: hat === 'crown' ? 0.06 : 0.025, sz: rr });
    if (hat === 'crown') for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.shape(TPL.cone4, gold, { x: Math.sin(a) * headR, y: hb + 0.25, z: Math.cos(a) * headR, sx: 0.045, sy: 0.07, sz: 0.045 });
    }
    if (hat === 'circlet') G.shape(TPL.ball, 0x80e0ff, { y: hb + 0.2, z: headR + 0.012, s: 0.03 });
  } else if (hat === 'cap') {
    B.shape(TPL.ball, hc, { x: 0.015, y: hb + 0.24, sx: 0.29, sy: 0.08, sz: 0.28, rz: 0.15 });
    B.shape(TPL.capsule, 0xf0e8d0, { x: 0.11, y: hb + 0.24, z: -0.05, sx: 0.022, sy: 0.18, sz: 0.05, rz: -0.6 });
  }

  // ---- weapons (right hand = +x side), gripped in the C of the hand
  const wx = hx, wy = hy, wz = hz;
  const steel = 0xd8dce4;
  const wpn = spec.weapon || 'none';
  const wcol = spec.weaponColor;
  if (wpn === 'sword' || wpn === 'greatsword') {
    const L = wpn === 'greatsword' ? 0.52 : 0.38;
    B.shape(TPL.cyl8, 0x5a3a20, { x: wx, y: wy - 0.06, z: wz, sx: 0.03, sy: 0.11, sz: 0.03 });
    B.shape(TPL.ball, 0xc8a040, { x: wx, y: wy - 0.065, z: wz, s: 0.04 });
    B.box(0xc8a040, { x: wx, y: wy + 0.045, z: wz, sx: 0.035, sy: 0.025, sz: 0.14 });
    B.shape(TPL.taper6, wcol ?? steel, { x: wx, y: wy + 0.07, z: wz, sx: 0.018, sy: L, sz: 0.06, flat: true });
    if (spec.weaponGlow) G.shape(TPL.taper6, spec.weaponGlow, { x: wx, y: wy + 0.08, z: wz, sx: 0.026, sy: L * 0.95, sz: 0.07 });
  } else if (wpn === 'dagger') {
    B.shape(TPL.cyl8, 0x5a3a20, { x: wx, y: wy - 0.04, z: wz, sx: 0.028, sy: 0.08, sz: 0.028 });
    B.shape(TPL.cone4, wcol ?? steel, { x: wx, y: wy + 0.04, z: wz, sx: 0.014, sy: 0.17, sz: 0.045, flat: true });
    if (spec.weaponGlow) G.shape(TPL.cone4, spec.weaponGlow, { x: wx, y: wy + 0.05, z: wz, sx: 0.02, sy: 0.15, sz: 0.05 });
  } else if (wpn === 'axe') {
    B.shape(TPL.cyl8, 0x6a4a2a, { x: wx, y: wy - 0.12, z: wz, sx: 0.035, sy: 0.55, sz: 0.035 });
    B.shape(TPL.dome, wcol ?? steel, { x: wx, y: wy + 0.36, z: wz + 0.01, sx: 0.03, sy: 0.11, sz: 0.2, rx: Math.PI / 2, flat: true });
  } else if (wpn === 'hammer' || wpn === 'mace') {
    B.shape(TPL.cyl8, 0x6a4a2a, { x: wx, y: wy - 0.1, z: wz, sx: 0.035, sy: 0.45, sz: 0.035 });
    if (wpn === 'hammer') B.box(wcol ?? 0x8a8e96, { x: wx, y: wy + 0.3, z: wz, sx: 0.11, sy: 0.1, sz: 0.2 });
    else B.shape(TPL.dodec, wcol ?? 0x8a8e96, { x: wx, y: wy + 0.36, z: wz, s: 0.14 });
  } else if (wpn === 'club') {
    B.shape(TPL.limb, wcol ?? 0x7a5a36, { x: wx, y: wy - 0.08, z: wz, sx: 0.12, sy: 0.55, sz: 0.12, rx: Math.PI, grad: 0.3 });
    B.shape(TPL.limb, wcol ?? 0x7a5a36, { x: wx, y: wy - 0.08, z: wz, sx: 0.12, sy: 0.02, sz: 0.12 });
  } else if (wpn === 'staff') {
    B.shape(TPL.cyl8, wcol ?? 0x7a5a36, { x: wx, y: 0.02, z: wz, sx: 0.04, sy: hb + headH + 0.18, sz: 0.04 });
    G.shape(TPL.ico1, spec.weaponGlow ?? 0x80c0ff, { x: wx, y: hb + headH + 0.24, z: wz, s: 0.1 });
  } else if (wpn === 'spear') {
    B.shape(TPL.cyl8, 0x7a5a36, { x: wx, y: 0.0, z: wz, sx: 0.03, sy: hb + headH + 0.12, sz: 0.03 });
    B.shape(TPL.cone8, wcol ?? steel, { x: wx, y: hb + headH + 0.12, z: wz, sx: 0.06, sy: 0.15, sz: 0.06 });
  } else if (wpn === 'bow') {
    bowShape(B, -hx, hy + 0.08, hz + 0.02, wcol ?? 0x8a5a2a);
  } else if (wpn === 'crossbow') {
    crossbowShape(B, wx - 0.08, hy + 0.08, wz + 0.08, wcol ?? 0x7a5030, { rx: -0.2 });
  } else if (wpn === 'sling') {
    B.shape(TPL.cyl6, 0x8a6a42, { x: wx, y: wy - 0.18, z: wz, sx: 0.012, sy: 0.18, sz: 0.012 });
    B.shape(TPL.ball, 0x8a6a42, { x: wx, y: wy - 0.19, z: wz, s: 0.05 });
  }
  // a quiver for archers, and a ranged weapon slung across the back
  const rng = spec.ranged || (wpn === 'bow' ? 'bow' : wpn === 'crossbow' ? 'crossbow' : null);
  if (rng === 'bow' || rng === 'crossbow') {
    B.shape(TPL.cyl8, 0x6a4022, { x: 0.08, y: torsoY + 0.04, z: -0.12, sx: 0.08, sy: 0.28, sz: 0.08, rz: 0.4 });
    for (let i = 0; i < 3; i++) B.shape(TPL.cone4, i === 1 ? 0xe8e0d0 : 0xa83a2a, { x: 0.15 + i * 0.02, y: torsoY + 0.29, z: -0.12 + (i - 1) * 0.02, sx: 0.035, sy: 0.07, sz: 0.012, rz: 0.4 });
  }
  if (spec.ranged && spec.ranged !== wpn) {
    if (spec.ranged === 'bow') bowShape(B, -0.02, torsoY + 0.17, -0.13, wcol ?? 0x8a5a2a, { rz: -0.9, h: 0.22 });
    else if (spec.ranged === 'crossbow') crossbowShape(B, 0, torsoY + 0.18, -0.13, 0x7a5030, { rx: Math.PI / 2, rz: 0.6 });
    else if (spec.ranged === 'sling') B.shape(TPL.ball, 0x8a6a42, { x: -0.17 * W, y: torsoY + 0.0, z: 0.09, sx: 0.07, sy: 0.06, sz: 0.05 });
  }
  if (spec.shield != null && spec.shield !== false && wpn !== 'bow' && wpn !== 'crossbow') {
    const o = { x: -(hx + 0.035), y: hy + 0.1, z: hz, rz: Math.PI / 2, ry: -0.35 };
    B.shape(TPL.cyl16, spec.shield, { ...o, sx: 0.3, sy: 0.04, sz: 0.3 });
    B.shape(TPL.cyl16, shade(spec.shield, 0.62), { ...o, x: o.x + 0.004, sx: 0.315, sy: 0.03, sz: 0.315 });
    B.shape(TPL.dome, 0xd0b040, { ...o, x: o.x - 0.02, sx: 0.08, sy: 0.04, sz: 0.08 });
  }
  return { B, G, height: hb + headH + 0.12 };
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
  g.boundingSphere = geo.boundingSphere;
  return g;
}

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
  entry = { lit, glow, shell: lit ? outlineGeometry(lit) : null, height: res.height * s, float: !!res.float, hover: res.hover || 0, noLean: !!res.noLean, boat: !!res.boat };
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
