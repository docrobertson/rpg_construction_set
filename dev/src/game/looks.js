// Random appearances for heroes: who they are (face, skin, hair, beard) and
// what they wear (outfit, hat and cape colours). Stored in a hero's `look`,
// which overrides the race's and class's defaults.

export const SKINS = {
  human: [0xf6d2b4, 0xf0c4a0, 0xe2aa84, 0xc88c64, 0x9c6a46, 0x74502f],
  dwarf: [0xeeb892, 0xe2a27c, 0xca8c66, 0xa87150],
  elf: [0xfae6d2, 0xf6dcc4, 0xecc9a8, 0xd6ae8a],
};

export const HAIRS = {
  human: [0x1e1a18, 0x3a2618, 0x5a3a20, 0x7a4a24, 0x9a4a22, 0xd8b868, 0xa8a8a8, 0xb84a1e],
  dwarf: [0x9a4a22, 0xb85a28, 0x5a3a20, 0x1e1a18, 0x9a9a9a, 0xe8e8e8, 0xc8a050],
  elf: [0xeedc98, 0xe2e2ea, 0x1e1a18, 0xc8a060, 0xb06a30, 0x6a4a30],
};

export const OUTFITS = [0x8a2a2a, 0x2a4a8a, 0x3a5a2a, 0x6a3a7a, 0x7a5a2a, 0x2a6a6a, 0x55555c, 0x8a5a3a, 0xa8742a, 0x3a3a4a, 0xe0d8c0];

export const STYLE_NAMES = { short: 'Short', long: 'Long', ponytail: 'Ponytail', braids: 'Braids', topknot: 'Topknot', bald: 'Bald' };

// faces: 'bold' (strong brows, a square jaw) or 'fair' (softer, with lashes)
export const FACE_NAMES = { bold: 'Bold', fair: 'Fair' };

const STYLES = {
  human: [['short', 4], ['long', 2], ['ponytail', 2], ['braids', 1], ['topknot', 1], ['bald', 1]],
  dwarf: [['short', 3], ['braids', 2], ['bald', 2], ['topknot', 1], ['ponytail', 1]],
  elf: [['long', 4], ['ponytail', 2], ['braids', 2], ['short', 1]],
};

const kind = (raceLook) => (SKINS[raceLook] ? raceLook : 'human');

function weighted(rng, pairs) {
  let t = 0;
  for (const [, w] of pairs) t += w;
  let r = rng.next() * t;
  for (const [v, w] of pairs) { r -= w; if (r < 0) return v; }
  return pairs[0][0];
}

// skin, hair and beard for someone of this race
export function randomPerson(raceLook, rng) {
  const k = kind(raceLook);
  const hair = rng.pick(HAIRS[k]);
  const face = rng.chance(0.5) ? 'fair' : 'bold';
  const look = { face, skin: rng.pick(SKINS[k]), hair, hairStyle: weighted(rng, STYLES[k]) };
  if (face === 'fair' && look.hairStyle === 'bald') look.hairStyle = 'long';
  if (k === 'human' && face === 'bold' && rng.chance(0.4)) look.beard = hair;
  if (k === 'dwarf' && face === 'fair' && rng.chance(0.4)) look.beard = false;
  return look;
}

// outfit colours suited to a class: often its own colours, sometimes others
export function randomOutfit(cls, rng) {
  const base = cls?.look || {};
  const look = {};
  if (rng.chance(0.55)) look.body = rng.pick(OUTFITS.filter((c) => c !== base.body));
  if (['hood', 'wizard', 'cap'].includes(base.hat)) look.hatColor = look.body && rng.chance(0.6) ? look.body : rng.pick(OUTFITS);
  if (base.cape != null) look.cape = rng.pick(OUTFITS);
  return look;
}
