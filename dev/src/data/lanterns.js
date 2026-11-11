// The second built-in adventure: "The Lanterns of the Glass Sea". One hero,
// washed ashore alone, gathers a company across two lands — the temperate
// kingdom of Merrow and the jungle isle of Ixara across the Glass Sea — to
// find who is putting out the great sea-lanterns, and why. Built with the
// same stamps, plans and generators the Construction Set uses, like sample.js.
//
// Some of what it uses is newer than the engine it was first written for:
// the isle's terrain and monsters, the 'temple' dungeon style, puzzle
// entities, companions' banter and leaving, and the mystery. They are written
// here as plain data; where the engine does not know them yet, TT() and MON()
// fall back to what it has, so the adventure builds and plays either way.
import { newGame } from './schema.js';
import { createMap, setTile, getTile, inBounds } from '../world/map.js';
import { STAMPS, PATHS, line4, placeFeature, nameNpcs, npcLook, uniqueTownsfolk, DUNGEON_STYLES } from '../world/generate.js';
import { defaultPlan } from '../world/places.js';
import { T, terrain, FEATURE_KINDS } from './terrain.js';
import { fbm } from '../core/noise.js';
import { RNG, hash2 } from '../core/rng.js';
import { uid, deterministicIds } from '../core/util.js';
import { eventFromTemplate, arenaBouts } from '../game/events.js';
import { buryable, pacesText, addCrab } from '../game/treasure.js';
import { sowFields } from '../world/countryside.js';

export const LANTERNS_ID = 'sample_lanterns_of_the_glass_sea';
export const LANTERNS_TITLE = 'The Lanterns of the Glass Sea';

// a terrain key, or the nearest the engine has (the isle's own come later)
const TT = (k, fb) => T[k] ?? T[fb];
const kw = (key, text, extra = {}) => ({ key, text, ...extra });
const talk = (npc) => ({ type: 'talk', npc });
const flagGoal = (flags) => ({ type: 'flag', flags });
const leave = (label = 'Walk on') => ({ label, leave: true });

export function buildLanternsGame() {
  return deterministicIds(build);
}

const WW = 176, WH = 160;

function build() {
  const game = newGame({ blank: true, w: WW, h: WH });
  game.id = LANTERNS_ID;
  game.meta = {
    ...game.meta,
    title: LANTERNS_TITLE,
    author: 'The Realms Construction Set',
    description: 'Washed ashore alone from a wreck, gather a company, unmask whoever is putting out the great sea-lanterns of Merrow — and cross the Glass Sea to the jungle isle of Ixara, where the Drowned Queen waits.',
    intro: 'For three hundred years the great lanterns of Merrow have burned along the Glass Sea, the still, bright water between the kingdom and the jungle isle of Ixara. Sailors bless them. Their light holds back the Mist — the cold grey fog that rolls out of the drowned ruins of the isle, where things walk that ought to be lying still.\n\nNow the lanterns are going dark, one by one. In the Mist, ships vanish.\n\nThree nights ago yours was one of them. The Cormorant was a day out of Saltcombe when the light on Gannet Rock went out. You remember the grey closing in, a voice singing under the water, the crack of the keel on the rocks.\n\nYou wake on a cold strand with the gulls crying over you. Of all the Cormorant\'s company, only you are left. Up the beach, a thread of smoke rises from a fishing village...',
    victoryText: 'Nhalia, last queen of drowned Ixara, sinks into the deep with a sound like the tide going out for ever. The Mist thins, and tatters, and is gone; for the first time in a month the Glass Sea shines like its name.\n\nOne by one the lanterns of Merrow are lit again — Gannet Rock, the Midway Light, and all the rest — and the ships come home. Aurelian Vane stands trial before Magistrate Thorne and asks for no mercy; Wren keeps the Guild\'s lamps now, and on moonless nights she rows out alone, to leave a candle on the water for Liesl.\n\nAt Pebblewick, Old Nan sets a candle in her window for the Cormorant\'s dead. She sets another for you.',
  };
  const S = game.settings;
  Object.assign(S, {
    startHeroes: 1, // (one hero, washed ashore alone: the company is found on the way)
    gentleStart: 5, // (the first wandering bands come sized for a lone hero and a small company)
    maxParty: 6,
    startGold: 50, // (market) a castaway's purse: a draught or a buckler, now that gear is dear
    startFood: 40,
    startItems: [{ id: 'healing_draught', n: 2 }, { id: 'torch', n: 1 }, { id: 'moonpetal', n: 2 }, { id: 'ember_salt', n: 2 }, { id: 'silverleaf', n: 2 }, { id: 'bitterwort', n: 1 }],
    victory: { type: 'kill', target: 'drowned_queen' },
  });
  addCrab(game);
  // a monster the engine may not have yet, or the nearest it does
  const MON = (id, fb) => (game.monsters.some((m) => m.id === id) ? id : fb);
  defineItems(game);
  defineFoes(game, MON);

  const w = game.maps[0];
  w.name = 'The Glass Sea Lands';
  w.tiles.fill(T.ocean);
  paintWorld(w);
  w.encounterRate = 0.8;

  const P = placePlaces(game, w, MON);
  layRoads(w, P);
  // (remember the names the generator gave, to tell the story folk from the crowd)
  const madeUp = new Map();
  for (const m of game.maps) for (const e of m.entities) if (e.type === 'npc') madeUp.set(e, e.name);
  dressPebblewick(game, P.pebblewick);
  dressThornby(game, P.thornby);
  dressSaltcombe(game, P.saltcombe);
  dressHighcrown(game, P.highcrown);
  dressLandfall(game, P.landfall);
  dressTzalKa(game, P.tzalka, MON);
  stockShops(game);
  uniqueTownsfolk(game, (e) => !madeUp.has(e) || madeUp.get(e) !== e.name, 11);

  buildDungeons(game, w, P, MON);
  placeWild(game, w, P, MON);
  game.quests = buildQuests(game, P);
  game.story = buildChapters(game);
  game.mysteries = buildMysteries();
  companions(game, P);
  uncast(game);
  addCountryside(game, w, P);
  tropicalUndergrowth(w);

  S.start = { map: w.id, ...nearestWhere(w, P.pebblewickAt.x + 2, P.pebblewickAt.y + 3, (t) => t.key === 'sand' || t.key === 'grass' || t.key === 'meadow') };
  return game;
}

// ------------------------------------------------------------ things
function defineItems(game) {
  game.items.push(
    // the story's own
    { id: 'nan_letter', name: 'Nan\'s Letter', type: 'quest', unique: true, price: 0, desc: 'A letter to the Harbour Magistrate of Saltcombe in Old Nan Penhallow\'s careful capitals, sealed with candle-wax and a thumbprint.' },
    { id: 'queens_warrant', name: 'The Queen\'s Warrant', type: 'quest', unique: true, price: 0, desc: 'A royal warrant under Queen Rosamund\'s great seal: it gives the Harbour Magistrate power over any guild, master or member, in the matter of the lanterns.' },
    { id: 'tide_stone', name: 'The Tide Stone', type: 'quest', unique: true, price: 0, desc: 'A disc of green stone carved with a spiral of waves. Held, it pulls at your hand the way the moon pulls at the sea.' },
    { id: 'sun_key', name: 'Sun-Key of Ixara', type: 'quest', unique: true, price: 0, desc: 'A golden sun the size of a palm, its rays worn smooth by old hands. It wakes the waygates of the Ixarans.' },
    { id: 'liesl_locket', name: 'Liesl\'s Locket', type: 'quest', unique: true, price: 0, desc: 'A child\'s silver locket, green with the sea. Inside: a curl of fair hair, and the words "Liesl Vane — Papa\'s little lamp".' },
    { id: 'eggs_tzal', name: 'Clutch of Speckled Eggs', type: 'quest', unique: true, price: 0, desc: 'Five leathery eggs, warm and speckled green and gold, wrapped in leaves. Something inside one taps back.' },
    { id: 'elowen_journal', name: 'Elowen\'s Journal', type: 'quest', unique: true, price: 0, desc: 'A scholar\'s journal, damp and much-annotated: rubbings of glyphs, word-lists of the lizardfolk tongue, and a great many exclamation marks.' },
    { id: 'wreckers_ledger', name: 'The Wreckers\' Ledger', type: 'quest', unique: true, price: 0, desc: 'Gaff Hollis\'s accounts: what washed up, when, and who paid for what. The nights the lights went out are marked in red.' },
    // arms, armour and charms worth the finding
    { id: 'kestrel_bow', magical: true, glow: 0xffc070, name: 'Red Jory\'s Kestrel', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 2, range: 8, price: 260, model: 'bow', unique: true, desc: 'A recurved bow of horn and yew, fletched with kestrel feathers. Its string sings.' },
    { id: 'wreckers_hook', name: 'Wrecker\'s Gaff', type: 'weapon', wkind: 'spear', dmg: '1d8+2', hit: 1, range: 1, price: 180, model: 'spear', unique: true, desc: 'Gaff Hollis\'s boat-hook, sharpened to a wicked point. It has dragged more than cargo out of the surf.' },
    { id: 'aldhelm_mace', magical: true, glow: 0xfff0b0, name: 'Mace of St Aldhelm', type: 'weapon', wkind: 'blunt', dmg: '1d8+3', hit: 2, range: 1, price: 340, model: 'mace', unique: true, desc: 'The old abbot\'s mace, its head a bronze sunburst. The dead do not like it at all.' },
    { id: 'sunsteel_spear', magical: true, glow: 0xffd040, name: 'Sunsteel Spear', type: 'weapon', wkind: 'spear', dmg: '1d10+3', hit: 3, range: 1, price: 460, model: 'spear', unique: true, desc: 'An Ixaran spear of gold-bright metal that never tarnished in a thousand years under the jungle.' },
    { id: 'emberheart', magical: true, glow: 0xff6020, name: 'Emberheart', type: 'weapon', wkind: 'greatblade', dmg: '2d6+4', hit: 3, range: 1, price: 620, model: 'sword', unique: true, desc: 'A greatsword forged in the throat of Mount Ashkar. The blade is always warm, and glows like a coal when it is angry.' },
    { id: 'coral_mail', magical: true, glow: 0x80f0e0, name: 'Coral-plate Mail', type: 'armor', weight: 'chain', ac: 7, price: 520, unique: true, desc: 'Scales of living coral set on a coat of sea-silk: as light as leather, as hard as mail.' },
    { id: 'saltwake_leathers', name: 'Saltwake Leathers', type: 'armor', weight: 'leather', ac: 4, price: 170, unique: true, desc: 'A smuggler\'s oiled leathers, salt-stiff and full of hidden pockets.' },
    { id: 'tmap_cormorant', name: 'The Cormorant\'s Manifest', type: 'map', treasure: 'tr_cormorant', price: 40, desc: 'A page of the Cormorant\'s manifest, water-stained. The purser has scrawled on the back: "Strongbox went over at the Head. Washed up by the old wreck, I\'d wager."' },
    { id: 'tmap_skerry', name: 'Chart of Gull Skerry', type: 'map', treasure: 'tr_skerry', price: 150, desc: 'A smuggler\'s chart of the northern Glass Sea, the shoals in red. A lonely rock is marked with a gull and an X: "Old Corrigan\'s Rainy Day".' },
  );
  const C = (o) => ({ type: 'charm', rarity: 'uncommon', ...o });
  game.items.push(
    C({ id: 'keepers_lantern', name: 'Keeper\'s Lantern', kind: 'lantern', icon: 'lantern', tint: 0xffd070, level: 1, price: 90, unique: true,
      desc: 'Tobias Penhallow\'s own storm-lantern, its glass clouded with salt. It never goes out, whatever the wind does.', effects: [{ type: 'sight', light: 3 }, { type: 'resist', status: 'afraid', chance: 0.5 }] }),
    C({ id: 'mistglass_pendant', name: 'Mist-glass Pendant', kind: 'amulet', icon: 'amulet', tint: 0xc0e0f0, level: 4, price: 260, rarity: 'rare', unique: true,
      desc: 'A bead of grey glass blown in a lantern-flame. Hold it to your eye and the Mist goes thin.', effects: [{ type: 'resist', status: 'asleep', chance: 1 }, { type: 'resist', status: 'afraid', chance: 1 }, { type: 'resist', status: 'slowed', chance: 0.5 }] }),
    C({ id: 'hatchling_tooth', name: 'Hatchling\'s Egg-tooth', kind: 'token', icon: 'stone', tint: 0xd8e8a0, level: 3, price: 120, unique: true,
      desc: 'The tiny horn a lizardfolk hatchling cracks its shell with, strung on grass. To the folk of Tzal-Ka it means: this one is family.', effects: [{ type: 'bonus', stat: 'init', power: 3 }, { type: 'bonus', stat: 'ac', power: 1 }] }),
    C({ id: 'guild_badge', name: 'Lanternwright\'s Badge', kind: 'brooch', icon: 'brooch', tint: 0xe8b848, level: 2, price: 140, unique: true,
      desc: 'A brass lantern with a key in its flame: the badge of a master of the Lanternwrights\' Guild.', effects: [{ type: 'sight', light: 2 }, { type: 'bonus', stat: 'ac', power: 1 }] }),
  );
}

// Named foes: each a unique boss, never met at random. (base: the monster
// copied; look: used only when the base is a stand-in for one the engine
// does not have yet)
function defineFoes(game, MON) {
  const monster = (id) => game.monsters.find((m) => m.id === id);
  const named = (base, want, def, look) => {
    const b = monster(base);
    const m = { ...JSON.parse(JSON.stringify(b)), ...def, boss: true, habitat: [] };
    if (look && base !== want) m.look = look;
    game.monsters.push(m);
    return m;
  };
  // shore crabs: the first thing a lone hero fights (not a boss: they roam the strand)
  game.monsters.push({ ...JSON.parse(JSON.stringify(monster('giant_crab'))), id: 'shore_crab', name: 'Shore Crab', plural: 'Shore Crabs', level: 1, hp: '2d6+2', ac: 13, hit: 2, dmg: '1d4+1', xp: 6, gold: '1d4',
    habitat: ['desert'], group: [1, 2], look: { kind: 'crab', color: 0xd06a3a, mark: 0xf2d0a0, scale: 0.7 }, desc: 'A crab the size of a shield, with a temper to match.' });
  named('giant_crab', 'giant_crab', { id: 'old_snapper', name: 'Old Snapper', plural: 'Old Snappers', level: 2, hp: '5d8+4', ac: 14, hit: 4, dmg: '1d8+1', xp: 50, gold: '3d6', group: [1, 1],
    escort: [{ id: 'shore_crab', min: 1, max: 1 }], look: { kind: 'crab', color: 0x9a3a22, mark: 0xe8c890, scale: 1.25 }, desc: 'The terror of Pebblewick\'s nets: a crab as old as the harbour wall, barnacled like a rock.' });
  named('goblin', 'goblin', { id: 'grubnose', name: 'Grubnose the Goblin-King', plural: 'Grubnoses', level: 3, hp: '6d8+8', ac: 14, hit: 5, dmg: '1d8+2', xp: 90, gold: '4d10', group: [1, 1], ai: 'brute', fleeAt: 0,
    escort: [{ id: 'goblin', min: 2, max: 3 }, { id: 'goblin_shaman', min: 1, max: 1 }], abilities: ['war_cry'],
    phaseAt: 0.5, phaseAdds: [{ id: 'goblin', min: 2, max: 2 }], phaseText: '"MINE! ALL MINE!" Grubnose bangs his pot-lid crown, and more goblins pour out of the burrows!',
    look: { kind: 'humanoid', race: 'goblin', body: 0x6a3a1a, hat: 'crown', crownColor: 0xb0a060, weapon: 'club', cape: 0x8a6a2a, scale: 1.2 }, desc: 'A goblin with a crown made from a stolen saucepan, and a very great opinion of himself.' });
  named('bandit', 'bandit', { id: 'gaff_hollis', name: 'Gaff Hollis', plural: 'Gaff Hollises', level: 4, hp: '10d8+12', ac: 14, hit: 7, dmg: '1d8+4', xp: 130, gold: '6d10', group: [1, 1], ai: 'brute', fleeAt: 0,
    escort: [{ id: 'bandit', min: 2, max: 2 }], abilities: ['war_cry'],
    phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: 'bandit', min: 1, max: 2 }], phaseText: '"Wreckers! To me!" Gaff roars, and more of his crew come splashing out of the dark.',
    look: { kind: 'humanoid', race: 'human', body: 0x2a3a3a, hat: 'cap', hatColor: 0x1a2424, cape: 0x3a4a3a, weapon: 'spear', beard: 0x6a5a40, face: 'bold', scale: 1.15 }, desc: 'The wrecker-chief of the south cliffs, who lights false lanterns to lure ships onto the rocks.' });
  named('bandit', 'bandit', { id: 'red_jory', name: 'Red Jory', plural: 'Red Jorys', level: 5, hp: '11d8+14', ac: 15, hit: 8, dmg: '1d10+3', range: 6, xp: 180, gold: '8d10', group: [1, 1], ai: 'archer', fleeAt: 0,
    escort: [{ id: 'bandit', min: 2, max: 3 }, { id: 'warg', min: 1, max: 1 }], abilities: ['war_cry'],
    phaseAt: 0.5, phaseEnrage: true, phaseText: 'Red Jory laughs, nocks two arrows at once, and his band takes heart!',
    look: { kind: 'humanoid', race: 'human', body: 0x8a2a1a, hat: 'hood', hatColor: 0x7a1a12, cape: 0x6a1a12, weapon: 'bow', face: 'bold', hair: 0xb8401a, scale: 1.1 }, desc: 'The bandit-lord of the Kestrel Pass: a red beard, a red hood, and the best bow in Merrow.' });
  named('barrow_wight', 'barrow_wight', { id: 'abbot_morcant', name: 'Abbot Morcant', plural: 'Abbot Morcants', level: 5, hp: '13d8+16', ac: 15, hit: 8, dmg: '1d10+4', xp: 200, gold: '5d10', group: [1, 1], ai: 'boss', castChance: 0.35,
    escort: [{ id: 'skeleton', min: 2, max: 2 }], speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: 'skeleton', min: 2, max: 2 }],
    phaseText: 'The dead abbot lifts his crozier, and the brothers of Mistwatch rise from their niches to sing his last office!',
    look: { kind: 'wraith', color: 0x2e3438, eyes: 0xa0e0ff, hat: 'hood', weapon: 'staff', weaponGlow: 0xa0e0ff, scale: 1.4 }, desc: 'The last abbot of Mistwatch, who made a bargain with the Mist and keeps it still.' });
  named('sea_serpent', 'sea_serpent', { id: 'glass_wyrm', name: 'The Glass Wyrm', plural: 'Glass Wyrms', level: 6, hp: '18d8+24', hit: 9, dmg: '2d8+4', xp: 260, gold: '10d10', group: [1, 1], abilities: ['tidal_surge', 'tail_sweep'],
    speed: 2, phaseAt: 0.4, phaseEnrage: true, phaseText: 'The Glass Wyrm rears out of the sea, pale as frost, and the water boils about it!',
    look: { kind: 'serpent', color: 0xb8d8e0, scale: 1.8 }, desc: 'A sea-serpent the colour of the Glass Sea itself, nearly invisible until it strikes.' });
  named(MON('naga', 'dark_sorcerer'), 'naga', { id: 'serpent_priest', name: 'Ssessath the Serpent Priest', plural: 'Serpent Priests', level: 7, hp: '15d8+20', ac: 15, hit: 9, dmg: '1d10+5', xp: 320, gold: '8d10', group: [1, 1], ai: 'boss', castChance: 0.4,
    escort: [{ id: MON('stone_guardian', 'skeleton'), min: 1, max: 2 }], speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: MON('lizardfolk', 'orc'), min: 2, max: 2 }],
    phaseText: 'The Serpent Priest hisses a hymn to the Drowned Queen, and her faithful come slithering from the dark pools!' },
  { kind: 'humanoid', race: 'goblin', skin: 0x3a7a5a, body: 0x1a4a3a, robe: true, hat: 'hood', hatColor: 0x1a3a2a, weapon: 'staff', weaponGlow: 0x60ffc0, eyes: 0xffe040, scale: 1.3 });
  named('drake', 'drake', { id: 'cinderwing', name: 'Cinderwing', plural: 'Cinderwings', level: 8, hp: '20d8+24', xp: 400, gold: '14d10', group: [1, 1], ai: 'boss',
    speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseText: 'Cinderwing shrieks and beats her wings, and the whole Vault fills with sparks!',
    look: { kind: 'dragon', color: 0x3a2a2a, belly: 0xff7030, scale: 1.0 }, desc: 'A young drake of Mount Ashkar, black as cinders, who has made the old Vault her nest.' });
  const hag = MON('sea_hag', MON('naga', 'dark_sorcerer'));
  named(hag, 'sea_hag', { id: 'drowned_queen', name: 'Nhalia the Drowned Queen', plural: 'Drowned Queens', level: 9, hp: '30d8+40', ac: 17, hit: 11, dmg: '2d8+6', xp: 900, gold: '30d10', group: [1, 1], ai: 'boss', castChance: 0.4,
    undead: true, sleepImmune: true, escort: [{ id: MON('mist_wraith', 'barrow_wight'), min: 2, max: 2 }],
    speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: MON('mist_wraith', 'barrow_wight'), min: 2, max: 2 }],
    phaseText: '"Come to me, my drowned!" Nhalia\'s song rises to a scream — and the Mist pours in through every crack, full of reaching hands!',
    desc: 'The last queen of Ixara, drowned with her city a thousand years ago. She has never stopped wanting it back.' },
  { kind: 'wraith', color: 0x1e3a44, eyes: 0x60ffe0, hat: 'crown', crownColor: 0x60c0a0, weapon: 'staff', weaponGlow: 0x60ffe0, scale: 1.6 });
  // the Drowned Queen is the sea-hag of all sea-hags: crowned, taller, glowing
  const q = monster('drowned_queen');
  if (q.look?.race === 'hag') Object.assign(q.look, { scale: 1.5, hat: 'crown', crownColor: 0x7ae0c0, body: 0x1e3a44, robe: true, weaponGlow: 0x60ffe0, eyes: 0x60ffe0 });
  // Each a real fight for the company a player has by then, tuned against
  // tests/adventure2_sim.mjs (winnable, not trivial: see its table).
  // (tactics pass: heroes now have heroic health, mail that soaks, a last
  // stand and gentler criticals taken, and goblins strike softer, so the
  // early bosses and two later ones hit a little harder to stay a real fight)
  const tune = {
    old_snapper: { hp: '7d8+8', hit: 5, dmg: '1d10+3' },
    grubnose: { hp: '7d8+10', hit: 6, dmg: '1d8+3', escort: [{ id: 'goblin', min: 2, max: 2 }, { id: 'goblin_shaman', min: 0, max: 1 }] },
    gaff_hollis: { hp: '18d8+24', ac: 15, hit: 8, dmg: '1d12+5', escort: [{ id: 'bandit', min: 4, max: 4 }], phaseAdds: [{ id: 'bandit', min: 2, max: 2 }] },
    red_jory: { hp: '22d8+32', ac: 16, hit: 10, dmg: '1d12+6', escort: [{ id: 'bandit', min: 3, max: 3 }, { id: 'warg', min: 2, max: 2 }] },
    abbot_morcant: { hp: '18d8+24', ac: 16, hit: 9, dmg: '1d12+5', escort: [{ id: 'skeleton', min: 3, max: 3 }], phaseAdds: [{ id: 'skeleton', min: 3, max: 3 }] },
    serpent_priest: { hp: '36d8+54', ac: 17, hit: 13, dmg: '2d10+7', escort: [{ id: MON('stone_guardian', 'skeleton'), min: 2, max: 2 }, { id: MON('lizard_shaman', 'goblin_shaman'), min: 2, max: 2 }], phaseAdds: [{ id: MON('lizardfolk', 'orc'), min: 4, max: 4 }] },
    cinderwing: { hp: '48d8+70', ac: 18, hit: 13, dmg: '3d8+9', escort: [{ id: 'drake', min: 2, max: 2 }] },
    drowned_queen: { hp: '60d8+90', ac: 18, hit: 13, dmg: '2d10+9', escort: [{ id: MON('mist_wraith', 'barrow_wight'), min: 4, max: 4 }, { id: MON('naga', 'skeleton'), min: 1, max: 1 }, { id: MON('sea_hag', 'dark_sorcerer'), min: 1, max: 1 }], phaseAdds: [{ id: MON('mist_wraith', 'barrow_wight'), min: 3, max: 3 }] },
  };
  for (const [id, t] of Object.entries(tune)) Object.assign(monster(id), t);
}

// ------------------------------------------------------------ the land
// Two great lands and their islets, shaped by soft ellipses roughened with
// noise, then painted country by country with the editor's own brushes.
// Ixara's open ground is jungle undergrowth, not an English meadow: plain grass
// there read as flat bright clearings in the jungle. Most of it becomes ferny
// undergrowth ('vines'), leaving a few true glades where the noise is low.
// (Walkable either way, so no road or puzzle changes.)
function tropicalUndergrowth(w) {
  for (let y = 0; y < w.h; y++) for (let x = 98; x < w.w; x++) {
    const i = y * w.w + x, k = terrain(w.tiles[i]).key;
    if (k !== 'grass' && k !== 'meadow') continue;
    const glade = fbm(x * 0.11, y * 0.11, 91, 2);
    if (k === 'grass' ? glade > 0.32 : glade > 0.5) w.tiles[i] = T.vines ?? w.tiles[i];
  }
}

function paintWorld(w) {
  const elev = new Float32Array(w.w * w.h).fill(-1);
  // [cx, cy, rx, ry]: the bones of each land
  const MERROW = [[40, 30, 26, 20], [26, 50, 20, 16], [56, 44, 18, 14], [34, 70, 26, 18], [44, 96, 32, 20], [60, 108, 16, 12],
    [28, 122, 22, 16], [50, 136, 18, 10], [14, 140, 8, 9], [8, 147, 5, 3], [62, 18, 10, 8], [20, 14, 9, 7]];
  const IXARA = [[128, 34, 26, 20], [148, 40, 18, 22], [140, 74, 28, 20], [116, 62, 12, 16], [104, 56, 5, 3.5], [132, 104, 30, 18],
    [124, 126, 22, 12], [150, 122, 12, 9], [160, 92, 10, 14], [112, 92, 10, 10]];
  // bays and sounds bitten out of the land
  const BAYS = [[80, 100, 9, 6], [74, 70, 6, 8], [6, 92, 7, 9], [8, 30, 5, 7], [56, 124, 6, 4], [42, 150, 6, 3],
    [104, 112, 6, 7], [146, 98, 4, 5], [168, 66, 6, 9], [118, 14, 6, 4], [140, 140, 8, 4], [100, 80, 4, 6]];
  const ISLETS = [[90, 62, 3.2, 2.6], [94, 66, 2.2, 2], [87, 67, 1.8, 1.6], [90, 26, 3, 2.4], [161, 142, 5.5, 4.5], [70, 152, 2.6, 2],
    [100, 140, 2.4, 2], [84, 120, 1.8, 1.6], [168, 20, 2.4, 2]];
  const blob = (list, x, y) => {
    let e = -1;
    for (const [cx, cy, rx, ry] of list) e = Math.max(e, 1 - Math.hypot((x - cx) / rx, (y - cy) / ry));
    return e;
  };
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    // (warped, so the coasts wander into capes and coves)
    const wx = x + (fbm(x * 0.05, y * 0.05, 61, 3) - 0.5) * 16, wy = y + (fbm(x * 0.05, y * 0.05, 62, 3) - 0.5) * 16;
    const n = (fbm(x * 0.06, y * 0.06, 71, 4) - 0.5) * 0.7 + (fbm(x * 0.18, y * 0.18, 72, 2) - 0.5) * 0.22;
    let e = Math.max(blob(MERROW, wx, wy), blob(IXARA, wx, wy)) + n;
    e = Math.min(e, -blob(BAYS, wx, wy) * 1.4 + 0.25 + n);
    const s = blob(ISLETS, x, y) + n * 0.35;
    elev[y * w.w + x] = Math.max(e, s);
  }
  // the Glass Sea between the lands stays open water, and the world's rim too
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    let e = elev[y * w.w + x];
    const mid = 89 + (fbm(x * 0.03, y * 0.05, 63, 2) - 0.5) * 10;
    if (Math.abs(x - mid) < 8 && blob(ISLETS, x, y) < 0) e = Math.min(e, -0.2 - (8 - Math.abs(x - mid)) * 0.02);
    if (x < 3 || y < 3 || x >= w.w - 3 || y >= w.h - 3) e = Math.min(e, -0.3);
    elev[y * w.w + x] = e;
    w.tiles[y * w.w + x] = e > 0.07 ? T.grass : e > 0 ? T.sand : e > -0.12 ? T.shallows : T.ocean;
  }
  // (a lone square of land or water in the other is noise, not a feature)
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) {
    const wet = (xx, yy) => terrain(getTile(w, xx, yy)).water;
    const me = wet(x, y);
    const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => wet(x + dx, y + dy) === me).length;
    if (same === 0) setTile(w, x, y, me ? T.sand : T.shallows);
  }
  const tile = (x, y, k) => setTile(w, x, y, typeof k === 'number' ? k : T[k]);
  const land = (x, y) => inBounds(w, x, y) && !terrain(getTile(w, x, y)).water;
  const stamp = (k, x, y, r, seed) => STAMPS[k].apply(w, x, y, r, seed);
  const path = (k, pts, width = 1, seed = 1) => {
    const all = [];
    for (let i = 1; i < pts.length; i++) all.push(...line4(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    return PATHS[k].apply(w, all, width, seed);
  };
  // stepping stones on the river square nearest (x, y) that has dry land on
  // two opposite sides, so the ford really does cross
  const ford = (x, y) => {
    for (let r = 0; r <= 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const fx = x + dx, fy = y + dy;
      if (!inBounds(w, fx, fy) || terrain(getTile(w, fx, fy)).key !== 'shallows') continue;
      if ((land(fx, fy - 1) && land(fx, fy + 1)) || (land(fx - 1, fy) && land(fx + 1, fy))) { tile(fx, fy, 'ford'); return { x: fx, y: fy }; }
    }
    return null;
  };
  // fill a noisy region with a terrain picked per square
  const region = (cx, cy, r, seed, pick, rough = 0.35) => {
    for (let y = Math.floor(cy - r * 1.5); y <= cy + r * 1.5; y++) for (let x = Math.floor(cx - r * 1.5); x <= cx + r * 1.5; x++) {
      if (!land(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy) / r + (fbm(x * 0.2, y * 0.2, seed, 3) - 0.5) * 2 * rough;
      if (d >= 1) continue;
      const cur = terrain(getTile(w, x, y)).key;
      if (cur === 'sand' && d > 0.7) continue; // (beaches stay beaches)
      const k = pick(x, y, d, cur);
      if (k != null) tile(x, y, k);
    }
  };

  // ---------------------------------------------------------- Merrow, the mainland
  // meadows and grass everywhere first
  for (let y = 0; y < w.h; y++) for (let x = 0; x < 80; x++) {
    if (getTile(w, x, y) !== T.grass) continue;
    if (fbm(x * 0.09, y * 0.09, 81, 3) > 0.56) tile(x, y, 'meadow');
  }
  // the Greyspine: a wall of mountains across the kingdom, broken only at the Kestrel Pass
  path('ridge', [[8, 56], [18, 53], [28, 54], [36, 52]], 2, 5);
  path('ridge', [[46, 51], [54, 49], [62, 50], [70, 47], [76, 44]], 2, 6);
  stamp('mountains', 24, 52, 4, 7);
  stamp('mountains', 60, 48, 4, 8);
  stamp('hills', 41, 55, 5, 9);
  stamp('hills', 41, 47, 4, 10);
  // the north: the Queen's Chase, the royal farms round Highcrown, the cold hills
  stamp('pines', 22, 26, 9, 11);
  stamp('forest', 30, 18, 6, 12);
  stamp('forest', 58, 26, 7, 13);
  stamp('meadow', 42, 32, 8, 14);
  stamp('hills', 54, 14, 6, 15);
  stamp('snow', 58, 12, 4, 16);
  stamp('hills', 16, 40, 5, 17);
  // Mistwatch Moor: heather hills, peat bog and a cold mere, south of the mountains
  region(24, 72, 13, 18, (x, y, d) => (d < 0.75 && fbm(x * 0.3, y * 0.3, 19) > 0.62 ? 'swamp' : hash2(x, y, 20) < 0.68 ? 'hills' : 'meadow'));
  stamp('lake', 30, 78, 3, 21);
  // Hollin Wood, west of Thornby
  stamp('pines', 26, 100, 7, 22);
  stamp('forest', 32, 106, 6, 23);
  stamp('forest', 60, 76, 5, 24);
  // the Wend valley: farmland round Thornby
  stamp('meadow', 48, 94, 7, 25);
  stamp('clear', 46, 96, 4, 26);
  // the south: Pebblewick's downs, Gannet Head, the cliffs of the Wreckers' coast
  stamp('hills', 40, 130, 6, 27);
  stamp('hills', 52, 142, 5, 28);
  stamp('forest', 30, 120, 4, 29);
  stamp('meadow', 22, 128, 5, 30);
  stamp('hills', 10, 143, 3, 31);
  // woods, downs and meres between, so no stretch of the kingdom is empty grass
  stamp('forest', 12, 110, 5, 32);
  stamp('pines', 16, 96, 4, 33);
  stamp('forest', 54, 120, 4, 34);
  stamp('forest', 34, 40, 4, 35);
  stamp('forest', 66, 34, 4, 36);
  stamp('hills', 64, 62, 4, 37);
  stamp('hills', 14, 122, 4, 38);
  stamp('forest', 66, 112, 3, 39);
  stamp('lake', 46, 113, 2, 40);
  stamp('lake', 24, 34, 2, 41);
  // copses and knolls scattered over the open farmland, as real country has
  for (let y = 0; y < w.h; y++) for (let x = 0; x < 80; x++) {
    const k = getTile(w, x, y);
    if (k !== T.grass && k !== T.meadow) continue;
    const c = fbm(x * 0.32, y * 0.32, 83, 2), kn = fbm(x * 0.27, y * 0.27, 84, 2);
    if (c > 0.74) tile(x, y, hash2(x, y, 85) < 0.25 ? 'pines' : 'forest');
    else if (kn > 0.76) tile(x, y, 'hills');
  }
  // the Pebble Brook, down from the downs to the sea west of the village
  // (all the way to the shore: it used to stop short in the fields)
  path('river', [[38, 112], [32, 118], [26, 124], [18, 126], [10, 127], [6, 128], [2, 128]], 1);
  // stepping stones where the shepherds' path crosses north of the village,
  // and again upstream by the downs, so nobody walks round by the road
  ford(14, 126);
  ford(28, 121);
  // the river Wend, out of the Greyspine to the sea at Saltcombe
  path('river', [[52, 55], [51, 62], [53, 70], [52, 78], [55, 86], [60, 92], [66, 96], [72, 99], [80, 101]], 1);
  path('river', [[32, 76], [36, 84], [42, 90], [48, 92], [55, 87]], 1);

  // ---------------------------------------------------------- Ixara, the jungle isle
  const JUNGLE = TT('jungle', 'forest'), PALMS = TT('palms', 'sand'), MANGROVE = TT('mangrove', 'swamp');
  const VINES = TT('vines', 'meadow'), RUINS = TT('ruins_floor', 'ruins'), OBSIDIAN = TT('obsidian', 'ash');
  // (deep jungle in the noise's high ground, overgrown glades about it, open
  // grass and meadow in the clearings: never one green from coast to coast)
  const coastOf = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(w, x + dx, y + dy) && terrain(getTile(w, x + dx, y + dy)).water && Math.abs(dx) + Math.abs(dy) <= r) return true; return false; };
  for (let y = 0; y < w.h; y++) for (let x = 97; x < w.w; x++) {
    const k = getTile(w, x, y);
    const n = fbm(x * 0.08, y * 0.08, 91, 3), m = fbm(x * 0.2, y * 0.2, 89, 2);
    if (k === T.grass) {
      // the beaches are fringed with palms a square or two inland
      if (coastOf(x, y, 2) && hash2(x, y, 93) < 0.7) tile(x, y, PALMS);
      else tile(x, y, n > 0.53 ? JUNGLE : n > 0.46 ? (m > 0.5 ? JUNGLE : VINES) : n > 0.4 ? VINES : m > 0.55 ? 'meadow' : 'grass');
    } else if (k === T.sand && hash2(x, y, 92) < 0.75) tile(x, y, PALMS);
  }
  // little ruined plazas of the sun-priests here and there in the jungle
  for (const [rx, ry, s] of [[118, 44, 2], [126, 100, 2], [150, 80, 2], [112, 118, 1], [140, 108, 2], [124, 30, 2]]) {
    region(rx, ry, s + 1, 110 + rx, (x, y, d) => (d < 0.6 ? RUINS : hash2(x, y, 111) < 0.5 ? VINES : null), 0.2);
  }
  // a second river, out of the spine to the south coast
  path('river', [[142, 74], [146, 84], [144, 94], [148, 104], [152, 112]], 1);
  // Mount Ashkar, the smoking mountain, in the north-east
  region(150, 30, 11, 93, (x, y, d) => (d < 0.22 ? 'lava' : d < 0.42 ? OBSIDIAN : d < 0.7 ? (hash2(x, y, 94) < 0.5 ? 'mountains' : 'peaks') : 'hills'), 0.25);
  path('ridge', [[132, 22], [140, 26], [146, 30]], 1, 95);
  path('ridge', [[156, 40], [160, 50], [158, 60]], 1, 96);
  region(150, 44, 5, 97, (x, y, d, cur) => (cur === 'mountains' || cur === 'peaks' ? null : OBSIDIAN));
  // old lava, still glowing in its runnels down the black flank
  for (const [x0, y0, x1, y1] of [[149, 37, 147, 45], [153, 38, 156, 46], [151, 39, 151, 48]]) {
    for (const [x, y] of line4(x0, y0, x1, y1)) if (getTile(w, x, y) === OBSIDIAN && hash2(x, y, 112) < 0.8) tile(x, y, 'lava');
  }
  // the spine of the isle, and the old ruins in the jungle
  path('ridge', [[124, 64], [132, 70], [140, 72]], 1, 98);
  region(138, 56, 6, 99, (x, y, d) => (hash2(x, y, 100) < 0.55 ? RUINS : VINES));
  region(103, 56, 3, 101, () => RUINS);
  // the mangrove coast and the fens of the south
  region(124, 128, 9, 102, (x, y, d, cur) => (cur === 'sand' ? null : hash2(x, y, 103) < 0.6 ? MANGROVE : 'swamp'));
  region(148, 112, 6, 104, (x, y, d) => (hash2(x, y, 105) < 0.5 ? 'swamp' : MANGROVE));
  // the jungle river, from the spine to the western beach at Landfall
  path('river', [[132, 74], [126, 82], [118, 88], [110, 92], [101, 94]], 1);
  // reefs off the south-east, where the Drowned Queen's palace stands
  const REEF = TT('reef', 'shallows');
  for (let y = 116; y < w.h - 3; y++) for (let x = 140; x < w.w - 3; x++) {
    if (getTile(w, x, y) === T.ocean && hash2(x, y, 106) < 0.35 && fbm(x * 0.2, y * 0.2, 107) > 0.5) tile(x, y, REEF);
  }
  // coral in the warm shallows all round the isle, mangroves on its southern shore
  // (the sea's shallows, not a river's)
  const nearOcean = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (getTile(w, x + dx, y + dy) === T.ocean) return true; return false; };
  for (let y = 3; y < w.h - 3; y++) for (let x = 100; x < w.w - 3; x++) {
    const k = getTile(w, x, y);
    if (k === T.shallows && fbm(x * 0.25, y * 0.25, 108) > 0.52 && nearOcean(x, y)) tile(x, y, REEF);
    else if (y > 104 && (k === T.grass || k === PALMS || k === VINES || k === T.sand) && coastOf(x, y, 1) && hash2(x, y, 109) < 0.55) tile(x, y, MANGROVE);
  }
}

// ------------------------------------------------------------ places
// The towns, villages and castle are built from plans (so the Places step can
// rebuild them); the dungeons are placed here and dressed in buildDungeons.
function placePlaces(game, w, MON) {
  const P = {};
  const coastal = (t, x, y) => !t.water && !t.feature && t.walk && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(w, x + dx, y + dy) && terrain(getTile(w, x + dx, y + dy)).key === 'ocean');
  const inland = (t) => t.walk && !t.water && !t.feature;
  const at = (x, y, pred = inland) => nearestWhereXY(w, x, y, pred);
  const plan = (kind, over) => {
    const base = defaultPlan(kind);
    return { ...base, ...over, buildings: { ...base.buildings, ...(over.buildings || {}) } };
  };
  const town = (key, kind, x, y, name, seed, over, pred) => {
    const p = at(x, y, pred);
    P[key + 'At'] = p;
    P[key] = placeFeature(game, w, p.x, p.y, kind, name, seed, plan(kind, { seed, ...over }));
    return P[key];
  };
  const none = { inn: 0, tavern: 0, healer: 0, weapons: 0, armor: 0, bowyer: 0, provisions: 0, reagents: 0, merchant: 0, sage: 0, lord: 0, shipwright: 0 };
  // --- Merrow
  town('pebblewick', 'village', 22, 133, 'Pebblewick', 301, { size: 'small', buildings: { ...none, inn: 1, tavern: 1, healer: 1, provisions: 1 }, homes: 5, folk: 4, guards: 0, walls: 'hedge', gates: ['n', 's', 'e', 'w'] });
  town('thornby', 'village', 46, 93, 'Thornby', 302, { buildings: { ...none, inn: 1, healer: 1, provisions: 1, weapons: 1 }, homes: 6, folk: 4, guards: 2, walls: 'palisade', gates: ['n', 's', 'e', 'w'] });
  town('saltcombe', 'town', 73, 96, 'Saltcombe', 303, { size: 'large', buildings: { ...none, inn: 1, tavern: 2, healer: 1, weapons: 1, armor: 1, provisions: 1, reagents: 1, merchant: 1, sage: 1, lord: 1, shipwright: 1 }, homes: 7, folk: 6, guards: 4, walls: 'stone', gates: ['n', 's', 'w'] }, coastal);
  town('highcrown', 'castle', 40, 29, 'Highcrown', 304, { buildings: { ...none, lord: 1, sage: 1, healer: 1, weapons: 1, armor: 1, inn: 1 }, homes: 3, folk: 4, guards: 6, walls: 'stone', gates: ['s'] });
  // --- Ixara
  town('landfall', 'village', 102, 96, 'Landfall', 305, { size: 'small', buildings: { ...none, inn: 1, provisions: 1, healer: 1, merchant: 1 }, homes: 3, folk: 4, guards: 2, walls: 'hedge', gates: ['n', 's', 'e', 'w'] }, coastal);
  town('tzalka', 'village', 128, 86, 'Tzal-Ka', 306, { buildings: { ...none, provisions: 1, healer: 1, reagents: 1, weapons: 1 }, homes: 6, folk: 6, guards: 2, walls: 'palisade', gates: ['n', 's', 'e', 'w'] });
  // --- the dungeons' doors (built in buildDungeons)
  const temple = DUNGEON_STYLES.temple ? 'temple' : 'crypt';
  const templeKind = FEATURE_KINDS.temple ? 'temple' : 'cave';
  const dungeon = (key, kind, x, y, name, seed, plan, pred) => {
    const p = at(x, y, pred);
    P[key + 'At'] = p;
    P[key] = placeFeature(game, w, p.x, p.y, kind, name, seed, { kind, ...plan, seed });
    return P[key];
  };
  dungeon('gannet', 'tower', 7, 146, 'Gannet Rock Light', 401, { style: 'crypt', size: 'small', rooms: 5, monsters: ['giant_rat', 'bat_swarm', 'shore_crab'], counts: { giant_rat: '1-2', bat_swarm: '1', shore_crab: '1' }, boss: 'old_snapper', treasure: { gold: 40, items: [{ id: 'healing_draught', n: 1 }] }, chests: 1, wonders: 1 }, coastal);
  dungeon('warren', 'cave', 25, 101, 'The Hollin Warren', 402, { style: 'cave', size: 'small', rooms: 7, monsters: ['goblin', 'giant_rat', 'goblin_shaman'], counts: { goblin: '2-3', giant_rat: '2-3', goblin_shaman: '1' }, boss: 'grubnose', treasure: { gold: 90, items: [{ id: 'healing_draught', n: 2 }] }, chests: 2, wonders: 1 });
  dungeon('wreckers', 'seacave', 47, 147, 'The Wreckers\' Hole', 403, { style: 'seacave', size: 'small', rooms: 7, monsters: ['bandit', 'giant_rat'], counts: { bandit: '2-3', giant_rat: '2-3' }, boss: 'gaff_hollis', treasure: { gold: 160, items: [{ id: 'wreckers_hook', n: 1 }, { id: 'saltwake_leathers', n: 1 }, { id: 'healing_draught', n: 2 }] }, chests: 2, wonders: 1 }, coastal);
  dungeon('abbey', 'tower', 19, 70, 'Mistwatch Abbey', 404, { style: 'crypt', size: 'medium', rooms: 8, monsters: ['skeleton', 'bat_swarm', 'giant_rat'], counts: { skeleton: '2-3', bat_swarm: '2-3', giant_rat: '2-3' }, boss: null, treasure: { gold: 120, items: [{ id: 'healing_draught', n: 2 }] }, chests: 2, wonders: 2 });
  dungeon('midway', 'tower', 90, 62, 'The Midway Light', 405, { style: 'crypt', size: 'small', rooms: 6, monsters: [MON('mist_wraith', 'barrow_wight'), 'skeleton'], counts: { [MON('mist_wraith', 'barrow_wight')]: '2', skeleton: '3-4' }, boss: null, treasure: { gold: 200, items: [{ id: 'greater_draught', n: 2 }] }, chests: 1, wonders: 1 });
  dungeon('temple', templeKind, 138, 54, 'Sunken Temple of the Sun', 406, { style: temple, size: 'large', rooms: 10, monsters: [MON('lizardfolk', 'orc'), MON('stone_guardian', 'troll'), MON('lizard_shaman', 'goblin_shaman'), MON('giant_frog', 'bog_lurker')], counts: { [MON('lizardfolk', 'orc')]: '3-4', [MON('stone_guardian', 'troll')]: '1-2', [MON('lizard_shaman', 'goblin_shaman')]: '1-2', [MON('giant_frog', 'bog_lurker')]: '3-4' }, boss: null, treasure: { gold: 300, items: [{ id: 'greater_draught', n: 2 }] }, chests: 3, wonders: 2 });
  dungeon('ember', 'cave', 147, 40, 'The Ember Vault', 407, { style: 'cave', size: 'medium', rooms: 8, monsters: [MON('lizardfolk', 'orc'), 'drake', MON('jungle_cat', 'warg')], counts: { [MON('lizardfolk', 'orc')]: '2-3', drake: '1', [MON('jungle_cat', 'warg')]: '2' }, boss: 'cinderwing', treasure: { gold: 500, items: [{ id: 'emberheart', n: 1 }, { id: 'phoenix_feather', n: 1 }] }, chests: 2, wonders: 1 });
  dungeon('palace', templeKind, 161, 142, 'The Drowned Palace', 408, { style: temple, size: 'large', rooms: 11, monsters: [MON('mist_wraith', 'barrow_wight'), MON('sea_hag', 'dark_sorcerer'), MON('naga', 'skeleton'), 'skeleton'], counts: { [MON('mist_wraith', 'barrow_wight')]: '2', [MON('sea_hag', 'dark_sorcerer')]: '1', [MON('naga', 'skeleton')]: '1-2', skeleton: '2-3' }, boss: 'drowned_queen', treasure: { gold: 1000, items: [{ id: 'greater_draught', n: 3 }] }, chests: 3, wonders: 2 });
  return P;
}

// Roads between the places, found the way a surveyor would: along the easy
// ground, round the mountains, bridging rivers but never the sea.
function layRoads(w, P) {
  const cost = (x, y) => {
    const t = terrain(getTile(w, x, y));
    if (t.feature) return Infinity;
    if (t.key === 'road' || t.key === 'bridge') return 0.4;
    if (t.key === 'ocean' || t.key === 'mountains' || t.key === 'peaks' || t.key === 'lava') return Infinity;
    if (t.water) return 9; // (a river: a bridge)
    const k = t.key;
    const base = k === 'grass' || k === 'meadow' ? 1 : k === 'sand' ? 2.2 : k === 'hills' ? 2.6 : k === 'swamp' ? 4 : t.sight ? 2.4 : 1.6;
    return base * (0.85 + hash2(x, y, 5) * 0.3);
  };
  const route = (a, b) => {
    const N = w.w * w.h, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const start = a.y * w.w + a.x, goal = b.y * w.w + b.x;
    dist[start] = 0;
    // (a simple binary heap)
    const heap = [[0, start]];
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, i] = pop();
      if (i === goal) break;
      if (d > dist[i]) continue;
      const x = i % w.w, y = (i - x) / w.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(w, nx, ny)) continue;
        const j = ny * w.w + nx;
        const c = j === goal ? 1 : cost(nx, ny);
        if (!Number.isFinite(c) || d + c >= dist[j]) continue;
        dist[j] = d + c; prev[j] = i;
        push([d + c, j]);
      }
    }
    const pts = [];
    for (let i = prev[goal]; i >= 0 && i !== start; i = prev[i]) pts.push([i % w.w, Math.floor(i / w.w)]);
    PATHS.road.apply(w, pts.reverse(), 1, 7);
    return pts;
  };
  const p = (k) => P[k + 'At'];
  // Merrow: the coast road, the King's road north through the pass, the moor road, and lanes
  route(p('pebblewick'), p('thornby'));
  route(p('thornby'), p('saltcombe'));
  route(p('thornby'), { x: 41, y: 66 });
  route({ x: 41, y: 66 }, p('highcrown'));
  route({ x: 41, y: 66 }, p('abbey'));
  route(p('pebblewick'), p('gannet'));
  route(p('thornby'), p('warren'));
  route(p('saltcombe'), p('wreckers'));
  // Ixara: the old Ixaran road, from the beach to the village and on to the temple
  route(p('landfall'), p('tzalka'));
  route(p('tzalka'), p('temple'));
}

// ------------------------------------------------------------ helpers
function nearestWalkable(map, x, y) {
  return nearestWhere(map, x, y, (t) => t.walk && !t.feature && !t.water);
}

function nearestWhere(map, x, y, pred) {
  return nearestWhereXY(map, x, y, (t) => pred(t));
}

// nearest square (x, y outwards) whose terrain passes pred(t, x, y), with nothing on it
function nearestWhereXY(map, x, y, pred) {
  for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    if (pred(terrain(getTile(map, nx, ny)), nx, ny) && !map.entities.some((e) => e.x === nx && e.y === ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

function freeSpot(map, x, y) {
  for (let r = 0; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const t = terrain(getTile(map, nx, ny));
    if (t.walk && !t.door && !t.water && !['stairs_up', 'stairs_down'].includes(t.key) && !map.entities.some((e) => e.x === nx && e.y === ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

const byRole = (map, role) => map.entities.filter((e) => e.type === 'npc' && e.role === role);

function addNpc(map, x, y, props) {
  const rng = new RNG(x * 31 + y);
  const p = freeSpot(map, x, y);
  const npc = {
    id: uid('npc'), type: 'npc', x: p.x, y: p.y, role: 'villager', wander: 2, keywords: [],
    look: npcLook(props.race || 'human', rng, props.lookExtra || {}),
    ...props,
  };
  delete npc.lookExtra;
  map.entities.push(npc);
  return npc;
}

function npcById(game, id) {
  for (const m of game.maps) for (const e of m.entities) if (e.id === id) return e;
  return null;
}
// the first person of a role in a place, given a name and words of their own
function cast(map, role, props, look = null) {
  const e = byRole(map, role).find((x) => !x._cast);
  if (!e) return null;
  Object.assign(e, props, { _cast: true });
  if (look) Object.assign(e.look, look);
  return e;
}
// townsfolk who still have only the words they were made with get a line of
// their own (a job, a word worth asking about), in turn from a list
function chatter(map, lines) {
  let i = 0;
  for (const e of map.entities) {
    if (e.type !== 'npc' || (e.role !== 'villager' && e.role !== 'guard') || e.keywords?.length || !lines.length) continue;
    const [job, key, text] = lines[i++ % lines.length];
    e.job = job;
    e.keywords = [kw(key, text)];
  }
}
// (the marker only steers cast(); it is not kept)
function uncast(game) { for (const m of game.maps) for (const e of m.entities) delete e._cast; }

// The shanty that gives away the order of Gannet Rock's braziers
const SHANTY = '"Oh, FIRST light the gannet that flies at the fore, / then wake up the morning that shines on the shore, / then light for the lost ones, whose masts are all gone, / and LAST for the drowned men — and so the lamp\'s on!"';

// ------------------------------------------------------------ Pebblewick
// The start: a fishing village on the south-west coast, safe and kind.
function dressPebblewick(game, map) {
  map.name = 'Pebblewick';
  cast(map, 'inn', { name: 'Mother Brennock', desc: 'a broad, floury woman with a ladle in her apron', greeting: 'Saints, look at the state of you! Sit, sit — there\'s soup.', job: 'I keep the Net and Anchor. A ROOM and a bowl of soup, and you\'ll be a new soul.' }, { face: 'fair', hairStyle: 'braids', hair: 0x8a5a3a, body: 0x8a5a3a });
  cast(map, 'tavern', {
    name: 'Hob Tullow', desc: 'a one-eyed old sailor behind the bar, humming', greeting: 'A drink for the Cormorant\'s ghost? Ha — you\'re no ghost. More\'s the wonder.',
    job: 'I pour the ale and sing the old SHANTIES, and hear the RUMOURS.',
    keywords: [
      kw('SHANTIES|SHANTY|SONG|SING', `Every lamp-keeper's child learns "Gannet Rock" before they can walk. Goes like this: ${SHANTY} It's how the keepers taught their young 'uns the order to light the lamp-fires. Old Tobias would skin me if he heard me sing it flat.`),
      kw('GANNET', 'Gannet Rock light, on the Head south-west of here. Went dark three nights back — the night your ship went down. Tobias is up there still, and he\'s not come down.'),
    ],
  }, { face: 'bold', hairStyle: 'bald', beard: 0xd8d4cc, body: 0x3a4a5a });
  cast(map, 'healer', { name: 'Sister Maren', desc: 'a young healer in sea-grey, salt in her hair', greeting: 'You\'re the one they pulled off the strand! Let me look at you.' }, { face: 'fair', hairStyle: 'long', hair: 0xd8b860 });
  cast(map, 'provisions', { name: 'Dilly Pask', desc: 'a sharp little woman among barrels of salt fish', greeting: 'Salt fish, hard bread, rope and lamp-oil. Nothing fancy, everything honest.', job: 'I keep the village store. BUY what you need — I\'ll not cheat a castaway.' });
  const elder = addNpc(map, Math.floor(map.w / 2) - 2, Math.floor(map.h / 2) - 1, {
    id: 'npc_nan', name: 'Old Nan Penhallow', race: 'human', wander: 0, desc: 'the white-haired elder of Pebblewick, wrapped in a fisherman\'s jersey',
    lookExtra: { face: 'fair', hairStyle: 'long', hair: 0xf0f0ea, body: 0x3a4a6a, robe: true, trim: 0xc8b890 },
    greeting: 'So the sea gave one back. Sit down by me, love, before you fall down.',
    job: 'I\'m the eldest in Pebblewick, so I\'m the one they ask. My son Tobias keeps the LIGHT on Gannet Rock.',
    keywords: [
      kw('LIGHT|GANNET', 'Gannet Rock. It went dark the night your ship was lost, and my Tobias is up there and hasn\'t come down. Climb up and find him for me — the path runs south-west from the village, out along the Head.', { cond: { type: 'noflag', value: 'lantern_gannet' }, elseText: 'Burning bright again, thanks to you. I can sleep with my curtains open.' }),
      kw('LANTERNS|LANTERN', 'There\'s a chain of them, all along the coast and out across the Glass Sea, three hundred years old. The Lanternwrights\' GUILD in Saltcombe keeps them. Lately they go out, one by one, and the MIST comes in after.'),
      kw('MIST', 'Cold and grey, and it comes in off the Glass Sea where the lights have died. They say there are voices in it. They say the drowned walk in it. I say keep your door shut and your lamp lit.'),
      kw('GUILD', 'The Lanternwrights. Master Vane runs it — a good man, Aurelian Vane. Lost his own little girl to the sea, years back, and never got over it. He\'ll want to know what\'s happening to his lights.'),
      kw('CORMORANT|SHIP|WRECK', 'Your ship lies broken on the rocks under Gannet Head. The sea takes, and sometimes it gives a little back. Anything of hers that washed up will be on the strand by the old wreck.'),
      kw('KIT', 'My granddaughter. Wild as a gull and twice as loud. She wants to go up the Rock after her da, and I\'ve said no. I\'ll not lose them both.'),
      kw('SALTCOMBE', 'The great port, up the coast road east past Thornby. The Harbour MAGISTRATE sits there, and the Guild. If anyone can get to the bottom of this, it\'s them.'),
      kw('MAGISTRATE', 'Eleanor Thorne. Hard as a ship\'s nail and honest as the tide. She\'ll listen to you, if you go to her with a letter from me.'),
    ],
  });
  addNpc(map, elder.x + 4, elder.y + 2, {
    id: 'npc_kit', name: 'Kit Penhallow', race: 'human', wander: 2, desc: 'a fierce fisher-girl with a harpoon and a sling, and her grandmother\'s eyes',
    lookExtra: { face: 'fair', hairStyle: 'ponytail', hair: 0xb06a30, body: 0x3a6a7a, legs: 0x5a4a3a, weapon: 'spear' },
    greeting: 'You came out of the sea alive? Then you\'re lucky. I could use some of that.',
    job: 'I fish, I mend nets, and I go out of my mind waiting. My DA is up on Gannet Rock, and Gran won\'t let me go.',
    keywords: [
      kw('DA|TOBIAS|FATHER', 'He keeps the light. He\'d never let it go out, not him — something\'s wrong up there. Bring him home and I\'ll follow you anywhere. Promise.', { cond: { type: 'questdone', value: 'q_tobias' }, elseText: 'He keeps the light. He\'d never let it go out, not him — something\'s wrong up there. Bring him home and I\'ll follow you anywhere. Promise.' }),
      kw('SHANTY|GANNET', `Da taught me before I could walk: ${SHANTY} The gannet, the morning, the lost and the drowned — that's the order the lamp-fires go.`),
    ],
  });
  addNpc(map, elder.x - 6, elder.y + 6, {
    id: 'npc_ezra', name: 'Ezra Quill', race: 'human', wander: 1, desc: 'an old fisherman mending a net with an enormous hole in it',
    lookExtra: { face: 'bold', hairStyle: 'bald', beard: 0x9a9a9a, body: 0x5a5a3a, hat: 'hood', hatColor: 0x4a4a3a },
    greeting: 'Look at this. LOOK at it. That\'s the third net this month.',
    job: 'I fish. Or I did, till OLD SNAPPER started on my nets.',
    keywords: [
      kw('OLD SNAPPER|SNAPPER|CRAB', 'The biggest crab on this coast, old as the harbour wall and twice as hard. Lives in the cellars under Gannet Rock and comes down to the strand at night to cut my nets.'),
      kw('NETS', 'Kill that crab and I\'ll give you the best thing I ever pulled out of the sea. I mean it.'),
    ],
  });
  const folk = byRole(map, 'villager');
  const say = [
    { name: 'Wenna', desc: 'a fisherwife gutting mackerel', greeting: 'Mind the guts.', job: 'Gutting, salting, smoking. Same as every day.', keywords: [kw('MIST', 'Came right up to the harbour wall the night the Rock went dark. I heard my mam calling me from inside it. My mam\'s been dead ten years.')] },
    { name: 'Jago', desc: 'a boy throwing stones at gulls', greeting: 'Are you a ghost? You look like a ghost.', job: 'I\'m going to be a lamp-keeper like Tobias. He lets me trim the WICKS.', keywords: [kw('WICKS', 'Tobias says the oil\'s been bad lately. Smoky. He sent word to the Guild about it, but nobody came.')] },
    { name: 'Morwenna', desc: 'a weather-beaten woman coiling rope', greeting: 'Fair winds, stranger.', job: 'I sail the coast road to SALTCOMBE with fish and come back with gossip.', keywords: [kw('SALTCOMBE', 'Busy as a beehive and twice as stingy. The Magistrate\'s fair, though, and the Guild\'s Master Vane gives pennies to the harbour children.')] },
    { name: 'Gwilym', desc: 'a broad fisherman with a broken oar', greeting: 'Hm.', job: 'Fishing. When the crab lets me.', rumour: 'Kit Penhallow\'s been sharpening that harpoon of hers every night since the Rock went dark.' },
  ];
  folk.forEach((e, i) => { if (say[i]) Object.assign(e, say[i]); });
  chatter(map, [
    ['I salt the fish and mend the sails. The LIGHT\'s been dark three nights, and the boats stay in.', 'LIGHT', 'Gannet Rock. Tobias would never let it go dark, not him. Something\'s wrong up there.'],
    ['I keep goats on the downs above the village. They don\'t like the MIST either.', 'MIST', 'It came right up to the harbour wall the night your ship went down. The goats wouldn\'t come out of the byre for two days.'],
    ['I carve floats and sell them to the boats. When there are boats.', 'CRABS', 'The strand\'s crawling with crabs since the light went out. Little ones bite. Big ones bite harder.'],
    ['Net-maker. Ezra\'s my best customer, thanks to that CRAB.', 'CRAB', 'Old Snapper. Lives under the Rock. Eats nets. Ezra\'s been trying to kill him for twenty years.'],
  ]);
  nameNpcs(map, game, 21);
}

// ------------------------------------------------------------ the shops
// (market) Each shop of the Glass Sea keeps a line of trade. Merrow's
// villages sell the humble tiers (village stores, a farm barrow, militia
// arms); Saltcombe, the great port, its boarding arms, mail and a chandlery;
// Highcrown the Queen's armoury and plate, the only great swords in the land.
// Ixara is far over the sea: the camp's stores are dear, and the lizardfolk
// sell their own spears, cures and jungle herbs. (theme: what a shop sells,
// or with a list of wares, what it is called and its markup.)
const LANTERNS_THEMES = [
  { id: 'farm_barrow', name: 'Farm Barrow', kind: 'provisions', desc: 'apples, cheese, honey and a remedy or two, cheap', priceMod: 0.9, items: ['rations', 'larks_honey', 'healing_draught', 'antidote', 'torch'], styles: ['village'] },
  { id: 'colony_stores', name: 'Colony Stores', kind: 'provisions', desc: 'whatever the last ship brought, at an isle\'s price', priceMod: 1.3,
    items: ['rations', 'torch', 'healing_draught', 'greater_draught', 'antidote', 'mana_tonic'], coast: true },
  { id: 'finds_oddments', name: 'Finds & Oddments', kind: 'mixed', desc: 'what the jungle gives up, and what the last ship left behind', priceMod: 1.3,
    items: ['healing_draught', 'antidote', 'scroll_seeing', 'lizardhide', 'coral_charm', 'worry_stone', 'lucky_acorn'] },
  { id: 'jungle_arms', name: 'Jungle Arms', kind: 'weapons', desc: 'obsidian spears, machetes and blowpipe-slings of the isle', priceMod: 1.2, items: ['dagger', 'sling', 'short_bow', 'spear', 'hookblade'] },
  { id: 'isle_larder', name: 'Isle Larder', kind: 'provisions', desc: 'fruit, smoked fish and swamp-cures', priceMod: 1.1, items: ['rations', 'torch', 'antidote', 'healing_draught', 'greater_draught'] },
  { id: 'jungle_simples', name: 'Jungle Simples', kind: 'reagents', desc: 'roots, spores and venoms from the deep jungle', priceMod: 1.1, items: ['bitterwort', 'puffcap', 'nightshade', 'wyrmroot', 'spidersilk', 'silverdust'] },
];
const LANTERNS_SHOPS = {
  Pebblewick: { provisions: { theme: 'village_stores' } },
  Thornby: { weapons: { theme: 'militia_arms' }, provisions: { theme: 'farm_barrow' } },
  Saltcombe: {
    weapons: { theme: 'boarding_arms' }, armor: { theme: 'mail_shields' }, provisions: { theme: 'chandlery' }, reagents: { theme: 'herbs_simples' },
    merchant: { theme: 'oddments', stock: ['tmap_skerry', 'healing_draught', 'antidote', 'torch', 'selkie_shell', 'gull_feather', 'copper_bangle'] },
  },
  Highcrown: {
    weapons: { theme: 'castle_armoury', stock: ['long_sword', 'long_bow', 'warhammer', 'crossbow', 'battle_axe', 'great_sword'] }, armor: { theme: 'plate_steel', priceMod: 1 }, // (the Queen's own armourer asks no more than plate is worth)
    sage: { theme: 'scriptorium', stock: ['scroll_seeing', 'scroll_acid_arrow', 'scroll_phantasm', 'scroll_vampiric'] },
  },
  Landfall: { provisions: { theme: 'colony_stores' }, merchant: { theme: 'finds_oddments' } },
  'Tzal-Ka': { weapons: { theme: 'jungle_arms' }, provisions: { theme: 'isle_larder' }, reagents: { theme: 'jungle_simples' } },
};
function stockShops(game) {
  for (const t of LANTERNS_THEMES) if (!game.shopThemes.some((x) => x.id === t.id)) game.shopThemes.push(JSON.parse(JSON.stringify(t)));
  for (const [place, shops] of Object.entries(LANTERNS_SHOPS)) {
    const map = game.maps.find((m) => m.name === place);
    for (const [role, set] of Object.entries(shops)) {
      const e = map?.entities.find((x) => x.type === 'npc' && x.shop && x.role === role);
      if (!e) continue;
      e.shop.theme = set.theme;
      e.shop.stock = set.stock ? [...set.stock] : [];
      if (set.priceMod != null) e.shop.priceMod = set.priceMod; else delete e.shop.priceMod;
    }
  }
}

// ------------------------------------------------------------ Thornby
// The farming village in the Wend valley, plagued by goblins out of Hollin Wood.
function dressThornby(game, map) {
  map.name = 'Thornby';
  cast(map, 'inn', { name: 'Goodwife Ashe', desc: 'a cheerful innkeeper with apple-red cheeks', greeting: 'Welcome to the Wheatsheaf! Mind the dog, he\'s friendlier than he looks.' });
  cast(map, 'healer', { name: 'Brother Edwy', desc: 'a plump, gentle monk', greeting: 'Peace be with you. And with your feet, by the look of them.' });
  cast(map, 'weapons', { name: 'Hamm the Smith', desc: 'a smith with forearms like hams', greeting: 'Need an edge? I\'ve edges.', job: 'Plough-shares mostly. Swords when the goblins come. Ask to BUY.' }, { face: 'bold', hairStyle: 'bald', beard: 0x3a2618 });
  cast(map, 'provisions', { name: 'Tansy Meadows', desc: 'a farm-girl selling apples and cheese from a barrow', greeting: 'Apples! Cheese! Bread still warm!' });
  addNpc(map, Math.floor(map.w / 2), Math.floor(map.h / 2) - 3, {
    id: 'npc_reeve', name: 'Reeve Haskett', race: 'human', wander: 1, desc: 'the reeve of Thornby, a worried man with a ledger',
    lookExtra: { face: 'bold', hair: 0x7a4a24, beard: 0x7a4a24, body: 0x5a6a3a, hat: 'cap', hatColor: 0x4a3a2a },
    greeting: 'Travellers! You\'ve not come about the tithe, I hope? No? Then you\'re welcome.',
    job: 'I keep the village\'s accounts, and lately its GOBLINS.',
    keywords: [
      kw('GOBLINS', 'Out of Hollin Wood, west of here, from a warren under the hill. They take a pig a night and laugh about it. Their king — GRUBNOSE, he calls himself — wears a saucepan on his head.', { cond: { type: 'noquest', value: 'q_warren' }, elseText: 'The warren\'s under the hill in Hollin Wood, west along the lane.' }),
      kw('GRUBNOSE', 'Grubnose the Goblin-King. I\'ve hired a dwarf to deal with him — THRAIN — but he says he\'ll not go into a goblin-hole alone, and I can\'t say I blame him.'),
      kw('ROAD|NORTH', 'North of the village, the King\'s road climbs to the Kestrel Pass and Highcrown beyond. West of it the moor, and the old ABBEY. East, the river runs down to Saltcombe.'),
      kw('ABBEY', 'Mistwatch Abbey, out on the moor. Empty these forty years — bar old Brother CADOC, who won\'t leave it. Folk hear bells out there at night. There are no bells.'),
      kw('CADOC', 'He comes to market once a month and preaches. Says the Mist is a judgement on us, and the lanterns go out because we\'ve earned the dark. Cheerful soul.'),
    ],
  });
  addNpc(map, Math.floor(map.w / 2) + 4, Math.floor(map.h / 2) + 2, {
    id: 'npc_thrain', name: 'Thrain Copperkettle', race: 'dwarf', wander: 1, desc: 'a stout dwarf mercenary eating a pie with tremendous concentration',
    lookExtra: { face: 'bold', hairStyle: 'braids', hair: 0xc0602a, beard: 0xc0602a, body: 0x6a4a2a, armor: 'chain', hat: 'helm', weapon: 'axe' },
    greeting: 'Mmf. If you\'re here for the pie, it\'s mine.',
    job: 'Sword for hire. Or axe, rather. The reeve pays me in pies to see off his GOBLINS. So far I have eaten the pies.',
    keywords: [
      kw('GOBLINS|WARREN', 'There\'s forty of them down that hole if there\'s one, and I\'ve only the one axe. Go in with me — clear out the warren, sort out this Grubnose — and I\'m yours. I\'ll want feeding, mind.', { cond: { type: 'questdone', value: 'q_warren' }, elseText: 'Forty goblins and one dwarf: bad sums. Clear out the warren with me and I\'ll JOIN you, gladly.' }),
      kw('BOATS|SEA', 'I don\'t do boats. Dwarves sink. It\'s a well-known fact.'),
      kw('PIE|PIES', 'Goodwife Ashe makes a pork-and-apple pie that would make a mountain weep. I\'ve had eleven. I\'ll have twelve.'),
    ],
  });
  const folk = byRole(map, 'villager');
  const say = [
    { name: 'Old Hester', desc: 'an old woman shelling peas', greeting: 'Sit down, you make the place look untidy.', job: 'Peas. Gossip. In that order.', keywords: [kw('GOSSIP', 'The Guild\'s cart came through last month, full of lamp-oil for the lights. Only the driver went WEST to the moor road, not east to the coast. Now why would lamp-oil want to go to an empty abbey?')] },
    { name: 'Piers', desc: 'a farmhand with a pitchfork', greeting: 'Seen a pig? Big one, with a black ear?', job: 'Pigs. Fewer every night, thanks to them goblins.' },
    { name: 'Rosie', desc: 'a little girl with a wooden sword', greeting: 'I\'m going to fight the goblin-king!', job: 'I\'m a knight. Mam says I\'m a nuisance.' },
  ];
  folk.forEach((e, i) => { if (say[i]) Object.assign(e, say[i]); });
  chatter(map, [
    ['I plough the Reeve\'s fields. Fewer pigs to feed every week, mind — the GOBLINS see to that.', 'GOBLINS', 'Out of Hollin Wood, west. They come by night with sacks. The dwarf at the Wheatsheaf says he\'ll deal with them. He says it with his mouth full.'],
    ['I keep the bees and the beer. THORNBY ale is the best in Merrow.', 'THORNBY', 'Two hundred souls, one mill, one smith and a great many pigs. Fewer pigs lately.'],
    ['Drover. I take the cattle up the King\'s road to HIGHCROWN.', 'HIGHCROWN', 'The Queen\'s castle, north over the Kestrel Pass. Red Jory\'s bandits rob every drove that crosses. I\'ve started walking very fast.'],
    ['I mill the flour. The ABBEY bells kept me awake last night, and there are no bells.', 'ABBEY', 'Mistwatch, out on the moor west of the King\'s road. Brother Cadoc sits at the gate and shouts at sheep.'],
    ['Guard of Thornby. Mostly I count pigs.', 'PIGS', 'Forty-one. Forty. Thirty-nine. You see the trouble.'],
    ['I mend the palisade. GRUBNOSE\'s goblins chew it.', 'GRUBNOSE', 'He wears a saucepan for a crown. Stole it off my wife. She wants it back.'],
  ]);
  nameNpcs(map, game, 22);
}

// ------------------------------------------------------------ Saltcombe
// The great port: the Harbour Court, the Lanternwrights' Guild, the quays, the gaol.
function dressSaltcombe(game, map) {
  map.name = 'Saltcombe';
  cast(map, 'lord', {
    id: 'npc_thorne', name: 'Magistrate Thorne', desc: 'Eleanor Thorne, Harbour Magistrate of Saltcombe, in a black gown and silver chain',
    greeting: 'This is the Harbour Court. State your business, and state it plainly.',
    job: 'I hear the cases of the port, and I hang the wreckers. Lately I am asked about the LANTERNS more than anything.',
    keywords: [
      kw('LANTERNS|LIGHTS', 'Four lights out in a month, and every one with a ship lost beneath it. That is not chance. Someone is putting them out — someone who knows how. Find me proof, and bring me a NAME, and I will ACCUSE them before this court.'),
      kw('WARRANT|GUILD', 'The Lanternwrights\' Guild holds a royal charter. No magistrate may touch a guild master without the Queen\'s WARRANT. Get it from Queen Rosamund at Highcrown, over the Kestrel Pass, and I will hang whoever you name — guild or no guild.', { cond: { type: 'item', value: 'queens_warrant' }, elseText: 'No magistrate may touch a guild master without the Queen\'s WARRANT. Get it from Queen Rosamund at Highcrown, north over the Kestrel Pass.' , text: 'You have the Queen\'s seal. Then the Guild answers to me now. Bring me proof — and a NAME.' }),
      kw('SUSPECTS|NAME', 'Who could put out a lantern? The Guild, who keep them. Harbourmaster GRELL, who takes money to look the other way. The smuggler MAGS Corrigan, who sits in my gaol and swears she is innocent, as they all do. And that madman CADOC on the moor, who preaches that the dark is a judgement. Find me PROOF.'),
      kw('PROOF|CLUES', 'Gather what you find — the journal keeps it, under Mysteries. When you have enough, come to me and say ACCUSE.'),
      kw('GRELL', 'A rogue, and a drunkard, and he knows every boat in this harbour. If he is guilty of anything, it will be in his books.'),
      kw('MAGS', 'Mags Corrigan, of the Black Gull. Caught with a hold full of brandy the night the Saltcombe light flickered. She says the WRECKERS of the south cliffs are the ones to blame.'),
      kw('WRECKERS', 'Gaff Hollis and his crew hang false lights on the south cliffs to lure ships onto the rocks. They have a hole down there by the sea. I have hanged two of them; Gaff I have never caught.'),
    ],
  }, { face: 'fair', hairStyle: 'braids', hair: 0x2a2018, body: 0x1a1a24, robe: true, trim: 0xc8c8d0, hat: 'none', cape: 0x2a2a3a });
  const sage = cast(map, 'sage', {
    id: 'npc_vane', name: 'Master Aurelian Vane', need: '!vane_unmasked', // (gone once unmasked: an NPC `need` is asked of the engine)
    desc: 'the Master of the Lanternwrights\' Guild, grey and kindly, with ink on his fingers',
    shop: { kind: 'mixed', stock: ['torch', 'glowworm_jar', 'votive_candle', 'mana_tonic', 'scroll_seeing'], priceMod: 1 },
    greeting: 'Come in, come in. You\'re the castaway from the Cormorant! I am so very sorry. So very sorry.',
    job: 'I am Master of the Lanternwrights\' Guild. We build the LANTERNS, and we keep them lit. Or we did. Lamps and oil to BUY, if you need them.',
    keywords: [
      kw('LANTERNS', 'The Mist takes them, I think. The salt, the damp — they are old, so old. We do what we can.' ),
      kw('OIL', 'Our oil is pressed and sealed in the Guild\'s own stores, here in Saltcombe. It is the best on the coast. If there is bad oil at Gannet Rock, it did not come from us.'),
      kw('LIESL|DAUGHTER', 'My Liesl. She fell from the Midway Light ten years ago, when she was seven. The sea never gave her back.' ),
      kw('WREN', 'My niece. My brother\'s girl. The cleverest lanternwright the Guild has had in a hundred years. Take her with you — she knows the lights better than anyone. I would feel... better, knowing where she was.'),
      kw('LAUNCH|BOAT', 'The Guild\'s launch takes oil out to the lights on the islets. Why do you ask?'),
    ],
  }, { face: 'bold', hair: 0xc8c8c0, beard: 0xc8c8c0, hairStyle: 'short', body: 0x5a4a2a, robe: true, trim: 0xe8b848, hat: 'none' });
  const gx = sage ? sage.x : 20, gy = sage ? sage.y : 20;
  // the Master's desk, locked: his tide-tables are the last of the clues
  map.entities.push({ id: 'chest_vane_desk', type: 'chest', ...freeSpot(map, gx - 1, gy - 1), name: 'Master Vane\'s Desk', look: { kind: 'bookcase' }, locked: true, flag: 'clue_tides', gold: '20', items: [{ id: 'guild_badge', n: 1 }] });
  addNpc(map, gx + 1, gy + 1, {
    id: 'npc_wren', name: 'Wren Vane', race: 'human', wander: 1, desc: 'a quick, bright young lanternwright with soot on her nose and a satchel of tools',
    lookExtra: { face: 'fair', hairStyle: 'ponytail', hair: 0xe0c070, body: 0x8a5a2a, legs: 0x4a3a2a, hat: 'cap', hatColor: 0x6a4a2a, weapon: 'hammer' },
    greeting: 'Oh! You\'re the one from the wreck! Uncle said you\'d come. I\'ve been hoping you would!',
    job: 'Lanternwright, journeyman — I make the lamps and the clockwork that turns them. Uncle says I\'m to help you find out what\'s happening to the LIGHTS. If you\'ll have me, I\'ll JOIN you.',
    keywords: [
      kw('LIGHTS|LANTERNS', 'Somebody\'s putting them out. Not the Mist — the Mist can\'t snuff a lantern-flame, that\'s the whole point of them. Somebody with HANDS.'),
      kw('UNCLE', 'He\'s been so tired lately. He doesn\'t sleep. He just sits in his STUDY with the door locked, writing. I worry.'),
      kw('STUDY', 'It\'s at the back of the Guild hall. He keeps it locked. I\'m not allowed in.'),
      kw('LIESL', 'My cousin. I was only little when she fell. Uncle never talks about her. ...Can we talk about something else?'),
    ],
  });
  addNpc(map, gx - 2, gy + 2, {
    id: 'npc_pip', name: 'Pip', race: 'hobbit', wander: 2, desc: 'a guild apprentice, very small, very sooty and very nervous',
    lookExtra: { face: 'bold', hair: 0x6a4020, body: 0x6a5a3a, legs: 0x5a4a2a },
    greeting: 'I didn\'t touch it! Whatever it is. Oh — you\'re not the Master.',
    job: 'Apprentice lanternwright. I fetch, I carry, I scrub the soot off things. And I see things, sometimes. In the night. When I\'m meant to be asleep.',
    keywords: [
      kw('NIGHT|SEE|THINGS', 'I shouldn\'t say. ...Only — the LAUNCH. The Guild\'s boat. Someone takes it out on moonless nights. Alone, no lantern on it.'),
      kw('LAUNCH|BOAT', 'I sleep in the boathouse loft. I hear the oars. And in the morning the launch is back and wet and the oil-casks in it are lighter, and the same night a lantern goes out. Every time. ...Please don\'t tell the Master I told you. He\'s ever so kind to me.', { action: { type: 'set_flag', value: 'clue_pip' } }),
    ],
  });
  cast(map, 'shipwright', {
    id: 'npc_brenna', name: 'Master Brenna Cole', desc: 'a shipwright with a pencil behind her ear and tar to the elbows',
    greeting: 'Mind the shavings. You after a SHIP?',
    job: 'I build ships, as my mother did. Finest hulls on the Glass Sea. Ask about the SHIP on my slipway.',
    ship: { name: 'Sea Lantern', price: 450, pitch: 'The Sea Lantern: forty feet of oak, copper-bottomed against the reefs of Ixara, with a lamp at her prow that would shame a lighthouse. She\'ll carry you anywhere on the Glass Sea.', soldText: 'The Sea Lantern\'s yours — she\'s moored off the harbour wall. Bring her back with all her planks.' },
    keywords: [kw('IXARA|ISLE', 'The jungle isle across the Glass Sea. There\'s a camp of scholars and treasure-hunters at LANDFALL, on the western beach. Steer for the river-mouth. Mind the reefs to the south-east — nothing comes back from there.')],
  }, { face: 'fair', hairStyle: 'ponytail', hair: 0x9a4a22 });
  cast(map, 'inn', { name: 'Tomas Penrose', desc: 'a long, thin innkeeper with a long, thin smile', greeting: 'Welcome to the Lamplighter\'s Rest. Clean sheets and no questions.' });
  cast(map, 'tavern', {
    name: 'Salty Meg', desc: 'the landlady of the Drowned Anchor, tattooed to the shoulder', greeting: 'Sit down, drink up, and don\'t start nothing.', job: 'I keep the Drowned Anchor. Ale, rum and RUMOURS — and GRELL, most nights, whether I want him or not.',
    keywords: [kw('GRELL', 'Odo Grell, the harbourmaster. Drinks here every night till he falls over, and I put him out with the cat. Every night this month, yes — even the nights the lights went out. Snoring under that table while the Rock went dark.')],
  });
  cast(map, 'tavern', { name: 'Fen Darrow', desc: 'a quiet barkeep of the Salt Cellar, polishing a glass that is already clean', greeting: 'What\'ll it be?', job: 'I pour, I listen, I forget. Mostly. Ask for RUMOURS.' });
  cast(map, 'healer', { name: 'Mother Agathe', desc: 'the old healer of the harbour chapel', greeting: 'Peace, child. The sea is cruel, but the saints are kind.' });
  cast(map, 'weapons', { name: 'Garrow', desc: 'a scarred old marine turned weaponsmith', greeting: 'Cutlasses, boarding-axes, crossbows. Ask to BUY.' });
  cast(map, 'armor', { name: 'Isolde Fenn', desc: 'an armourer hammering a breastplate', greeting: 'If it\'s not dented, it\'s not been worn properly.' });
  cast(map, 'reagents', { name: 'Old Myrtle', desc: 'a herb-woman among bunches of drying weed', greeting: 'Sea-holly, samphire, moonpetal and salt. Ask to BUY.' });
  cast(map, 'merchant', { name: 'Hassan Varo', desc: 'a far-travelled trader in a sea-green coat', greeting: 'Goods of every shore, friend! Some of them even legal.', job: 'I trade up and down the Glass Sea. Since the lights went out, no one sails to IXARA — so I\'ve charts I can\'t use. Ask to BUY.', keywords: [kw('IXARA', 'The jade isle. Lizardfolk, ruins, a mountain that smokes. And the reefs in the south-east — the sailors call them the Queen\'s Teeth, and say there\'s a palace under the water there.')] });
  // (Hassan's charts and charms, and every shop's wares: stockShops)
  // the harbourmaster, on the quays by day, and his books in his office
  const grell = addNpc(map, Math.floor(map.w / 2) + 6, Math.floor(map.h / 2) + 4, {
    id: 'npc_grell', name: 'Harbourmaster Grell', race: 'human', wander: 3, desc: 'Odo Grell, the harbourmaster, red-nosed and suspicious, with a ledger under his arm',
    lookExtra: { face: 'bold', hair: 0x5a3a20, beard: 0x5a3a20, body: 0x2a3a5a, hat: 'cap', hatColor: 0x1a2a4a, cape: 0x2a3a5a },
    greeting: 'What d\'you want? Mooring fees are posted. I don\'t haggle.',
    job: 'I\'m the harbourmaster. Every boat in, every boat out, I know about it. And it\'s none of your BUSINESS.',
    keywords: [
      kw('BUSINESS|BRIBES|SMUGGLERS', 'Now see here! A man takes a little gift now and then for a quiet berth — that\'s the custom of the port! It\'s not a crime. Much.'),
      kw('LANTERNS|LIGHTS', 'Nothing to do with me! I was in the Anchor — ask anyone. Ask Meg. I was under the table, I was. I\'m always under the table.'),
      kw('LAUNCH', 'The Guild launch? Comes and goes. Guild business. The Master\'s got his own key to the boom; doesn\'t need my say-so.'),
    ],
  });
  map.entities.push({ id: 'chest_grell_books', type: 'chest', ...freeSpot(map, grell.x - 3, grell.y - 3), name: 'Harbourmaster\'s Desk', look: { kind: 'bookcase' }, locked: true, flag: 'clue_grell', gold: '35', items: [] });
  // the gaol, and the smuggler captain in it
  const guard = byRole(map, 'guard')[0];
  addNpc(map, (guard?.x ?? 10) + 2, (guard?.y ?? 10) + 1, {
    id: 'npc_mags', name: 'Mags Corrigan', race: 'human', wander: 0, desc: 'a lean, sun-browned smuggler captain in irons, looking thoroughly bored',
    lookExtra: { face: 'fair', hairStyle: 'short', hair: 0x1e1a18, body: 0x2a2a34, cape: 0x6a1a1a, hat: 'cap', hatColor: 0x1a1a22 },
    greeting: 'Come to gawp at the wicked smuggler? Go on, then. I\'ll do a little dance if you pay.',
    job: 'I captain the Black Gull. Well — I did, till Thorne locked me up for the LANTERNS. Which I didn\'t do.',
    keywords: [
      kw('LANTERNS|INNOCENT', 'Dark water\'s bad for trade, love. I run brandy, not wrecks. It\'s GAFF Hollis\'s lot who want ships on the rocks — and they\'ll have it all written down. Gaff keeps accounts like a bishop.'),
      kw('GAFF|WRECKERS', 'Down the coast south of here, there\'s a cave under the cliffs — the Wreckers\' Hole. Bring the magistrate Gaff\'s LEDGER and I walk free. And I don\'t forget a favour.'),
      kw('LEDGER', 'Every wreck, every cask, every coin. Gaff can\'t help himself.', { cond: { type: 'item', value: 'wreckers_ledger' }, text: 'That\'s it! That\'s Gaff\'s ledger! Take it to Thorne — no, wait, give it here, I\'ll wave it at the guards myself. ...There. Read that, you lumps!' , action: { type: 'take_item', value: 'wreckers_ledger' }, elseText: 'Every wreck, every cask, every coin. Gaff can\'t help himself. Bring it here.' }),
      kw('GULL|SHIP|BLACK GULL', 'The Black Gull. Fastest sloop on the Glass Sea. Get me out of here, and she\'s yours to sail — for one crown, for luck. Never take a ship for nothing.'),
    ],
  });
  const folk = byRole(map, 'villager');
  const say = [
    { name: 'Corwen', desc: 'a dockhand rolling a barrel', greeting: 'Out the way!', job: 'Barrels in, barrels out.', keywords: [kw('GUILD', 'The Guild stores? Big locked shed by the boathouse. Only the Master and the girl have keys.')] },
    { name: 'Annis', desc: 'a fishwife with a voice like a gull', greeting: 'HERRING! Fresh HERRING!', job: 'HERRING!' },
    { name: 'Lowen', desc: 'a sailor with nowhere to sail', greeting: 'No berths. No ships. No lights.', job: 'Sailor, between ships. No captain\'ll cross the Glass Sea now, not with the Midway LIGHT out.', keywords: [kw('LIGHT|MIDWAY', 'The Midway Light, on the Teeth, halfway to Ixara. Went out a fortnight back. Since then, the Mist sits on the water out there like a lid.')] },
    { name: 'Senara', desc: 'a priestess of the sea-saints selling candles', greeting: 'A candle for the drowned?', job: 'I light candles for the lost. Business is good, saints forgive me.' },
    { name: 'Davey', desc: 'a harbour urchin', greeting: 'Got a penny?', job: 'I watch the boats. Master Vane gives us pennies. He\'s nice. He looks sad, though.' },
  ];
  folk.forEach((e, i) => { if (say[i]) Object.assign(e, say[i]); });
  chatter(map, [
    ['Watchman of the Harbour Court. Keep the PEACE, or keep out.', 'PEACE', 'Magistrate Thorne hangs wreckers and fines drunks. Don\'t be either.'],
    ['I caulk hulls at Master Cole\'s yard. Best SHIPS on the Glass Sea.', 'SHIPS', 'Master Cole has the Sea Lantern on her slipway, finished and copper-bottomed. Four hundred and fifty gold. Worth every crown.'],
    ['Docker. Barrels in, barrels out, curses all day.', 'GUILD', 'The Guild launch goes out to the lights with oil. Goes out at night, too, lately. Funny time to deliver oil.'],
    ['I sell eels. Jellied, smoked or angry.', 'MIST', 'Can\'t see the Midway Light any more from the mole. Just a grey wall out there on the water, sitting still as a cat.'],
  ]);
  nameNpcs(map, game, 23);
}

// ------------------------------------------------------------ Highcrown
function dressHighcrown(game, map) {
  map.name = 'Highcrown';
  cast(map, 'lord', {
    id: 'npc_rosamund', name: 'Queen Rosamund', desc: 'Rosamund of Merrow, young, tired and very sharp',
    greeting: 'You have come over the pass. That alone tells me you are worth hearing.',
    job: 'I am Queen of Merrow, and my kingdom is going dark at the edges. Tell me of the LANTERNS. I will HEAL any wounds you bring me.',
    keywords: [
      kw('LANTERNS', 'Magistrate Thorne writes that someone puts them out by design. If she needs my WARRANT to reach into the Guild, she shall have it.'),
      kw('WARRANT', 'Take it. Whoever is doing this, guild-master or beggar, they answer to the Harbour Court now.', { cond: { type: 'quest', value: 'q_main' }, elseText: 'Bring me word from the Harbour Magistrate first.' }),
      kw('IXARA', 'My grandmother\'s grandmother made peace with the lizardfolk of Ixara. Few remember it. If you go there, speak to the ELDER of Tzal-Ka; they keep long memories.'),
      kw('GARRICK', 'Sir Garrick Oakes. My best knight, and my most exhausting. He has been begging for something to do.'),
      kw('JORY|BANDITS', 'Red Jory holds the Kestrel Pass and robs my subjects in my name. Captain Garrick will tell you more.'),
    ],
  }, { face: 'fair', hairStyle: 'long', hair: 0xd8b860, body: 0x4a2a6a, robe: true, trim: 0xe8c040, hat: 'crown' });
  cast(map, 'sage', { name: 'Archivist Fenwick', desc: 'the royal archivist, a dusty man in dusty spectacles', greeting: 'Shh! Oh — visitors. Do mind the scrolls.', job: 'I keep the archives of Merrow, and sell a few SCROLLS to fund the candles.', shop: { kind: 'scrolls', stock: ['scroll_acid_arrow', 'scroll_phantasm', 'scroll_seeing'], priceMod: 1 },
    keywords: [
      kw('IXARA', 'The old Ixarans built the first lanterns — their WAYGATES and lanterns, both. Their empire sank in a night, a thousand years ago, and their last queen with it. Nhalia, the chronicles call her. The Drowned Queen.'),
      kw('WAYGATES', 'Stone arches that go from one place to another without the between. There is one in the grounds of Mistwatch Abbey; the monks built their abbey round it. It has not opened in living memory. It wants a SUN-KEY, the old books say.'),
      kw('NHALIA|QUEEN|DROWNED', 'The chronicles say she would not let her city drown alone — that she sang to the sea and the sea answered, and took everyone. The lizardfolk still will not speak her name.'),
    ] });
  cast(map, 'healer', { name: 'Mother Ysbel', desc: 'the castle\'s healer', greeting: 'Sit. Bleed quietly. I\'ll be with you in a moment.' });
  cast(map, 'weapons', { name: 'Sergeant Tull', desc: 'the castle armsmaster', greeting: 'Royal steel. Ask to BUY.' });
  cast(map, 'armor', { name: 'Gerda Strake', desc: 'the castle armourer', greeting: 'Plate, mail, shields. Ask to BUY.' });
  cast(map, 'inn', { name: 'Old Barnabas', desc: 'keeper of the Crown and Kestrel', greeting: 'Beds, baths and beef!' });
  const gw = map.entry || { x: 18, y: 34 };
  addNpc(map, gw.x + 2, gw.y - 4, {
    id: 'npc_garrick', name: 'Sir Garrick Oakes', race: 'human', wander: 1, desc: 'a tall knight in polished plate, with a magnificent moustache',
    lookExtra: { face: 'bold', hair: 0x8a6a3a, beard: 0x8a6a3a, hairStyle: 'short', body: 0x2a4a8a, armor: 'plate', hat: 'helm', weapon: 'sword', shield: 0x2a4a8a, cape: 0xd0a040 },
    greeting: 'Hail, travellers! Sir Garrick Oakes, Knight of the Lantern, at your service. Mostly at the Queen\'s, but some left over for you.',
    job: 'I captain the Queen\'s Watch, and lately I watch it rain. The Queen will not let me hunt RED JORY alone. Most unfair.',
    keywords: [
      kw('RED JORY|JORY', 'The bandit-lord of the Kestrel Pass. Robs every cart that crosses and laughs about it. Break his band, and I shall ride with you to the ends of the earth — or at least the end of the kingdom. Queen\'s orders, more or less.', { cond: { type: 'questdone', value: 'q_jory' }, elseText: 'Red Jory holds the pass with a score of bandits and a tame warg. Break his band and I\'ll JOIN you — and not before, the Queen says.' }),
      kw('LANTERN|KNIGHT', 'The Knights of the Lantern were sworn to guard the lights, long ago. Now there is only me. It is a very small order. We meet in my head.'),
    ],
  });
  for (const g of byRole(map, 'guard')) { g.job = 'I serve the Queen.'; g.keywords = [kw('QUEEN', 'Her Majesty holds court in the great hall at the north of the keep.')]; }
  for (const v of byRole(map, 'villager')) v.rumour = 'They say Red Jory\'s men camp on the south side of the Kestrel Pass, by the old watchtower.';
  nameNpcs(map, game, 24);
}

// ------------------------------------------------------------ Landfall
// The explorers' camp on Ixara's western beach.
function dressLandfall(game, map) {
  map.name = 'Landfall';
  cast(map, 'inn', { name: 'Captain Orla Hask', desc: 'the hard-bitten leader of the camp, a cutlass at her hip', greeting: 'Another boat! I thought nobody crossed any more. Welcome to Landfall — mind the crabs.', job: 'I run this camp: scholars, treasure-hunters and fools. A hammock and hot stew, if you want a ROOM.' }, { face: 'fair', hairStyle: 'short', hair: 0x2a2018, hat: 'cap', hatColor: 0x2a3a2a });
  cast(map, 'healer', { name: 'Brother Tam', desc: 'a missionary with a sunburnt nose', greeting: 'Blessings! And fever-bark. Mostly fever-bark.' });
  cast(map, 'provisions', { name: 'Quartermaster Jenna', desc: 'a quartermaster counting crates', greeting: 'Supplies are short, so prices are long.' });
  cast(map, 'merchant', { id: 'npc_sinbad', name: 'Old Sinbad', desc: 'a treasure-hunter with one boot and one sandal', greeting: 'Gold? Idols? Maps? I\'ve got them. Some of them are even real.' });
  const camp = addNpc(map, Math.floor(map.w / 2) + 3, Math.floor(map.h / 2) - 2, {
    id: 'npc_elowen', name: 'Elowen Starling', race: 'elf', wander: 1, desc: 'an elven scholar in a crumpled linen coat, sitting on a trunk of books and scowling at the jungle',
    lookExtra: { face: 'fair', hairStyle: 'long', hair: 0xe2e2ea, body: 0xd8c8a0, robe: true, trim: 0x6a8a3a, hat: 'none', weapon: 'staff' },
    greeting: 'If you have come to tell me the jungle is dangerous, I am aware. I have the bites to prove it.',
    job: 'I am a scholar of old IXARA — its glyphs, its tongue, its sunken temples. Or I was, until a jungle cat ran off with my JOURNAL.',
    keywords: [
      kw('JOURNAL', 'Twenty years of glyph-rubbings and a word-list of the lizardfolk tongue! A great spotted cat took it — the whole satchel — into the jungle north of camp, towards the old Lantern on the cape. Bring it back, and I will translate anything you like. I may even come with you.', { cond: { type: 'questdone', value: 'q_notes' }, elseText: 'A great spotted cat took it — satchel and all — into the jungle north of camp, towards the old Lantern on the west cape. Bring it back and I will JOIN you.' }),
      kw('IXARA', 'An empire of sun-priests and lantern-builders who sank in one night, a thousand years ago. The lizardfolk were their gardeners, their scribes, their friends. They remember.'),
      kw('RHYME|TONGUE', 'The lizardfolk sing to their hatchlings in the old Ixaran tongue. Most of them no longer know what the words mean. I do.', { cond: { type: 'flag', value: 'heard_rhyme' }, text: 'You heard the hatchlings\' rhyme? "Little egg, what wakes you? The WAVE that rocks you, the MOON that watches, the STAR that names you, the SUN that warms you, and last the FLAME that cracks the shell." Five glyphs, in that order. It is a door-song! The temple doors were opened with it.', elseText: 'The lizardfolk sing to their hatchlings in the old Ixaran tongue. If you hear one of their nursery-rhymes, bring it to me.' }),
      kw('TEMPLE', 'The Sunken Temple of the Sun lies north-east of Tzal-Ka, by the lake in the ruins. Its doors are said to answer to a song.'),
    ],
  });
  void camp;
  const folk = byRole(map, 'villager');
  const say = [
    { name: 'Ned Pocket', desc: 'a treasure-hunter with a fever', greeting: 'Don\'t... drink the green water.', job: 'Treasure. Found a fever instead.', keywords: [kw('LANTERN', 'There\'s an old lantern-tower on the west cape, north of here. Ancient. Ixaran. Something big and spotted lives in the ruins now.')] },
    { name: 'Dr. Prudence Mallow', desc: 'a naturalist pinning a beetle to a board', greeting: 'Don\'t move! ...Oh, it\'s flown.', job: 'Natural philosopher. I came for the frogs. The frogs came for me.', keywords: [kw('FROGS', 'Giant frogs in the fens to the south, by the mangroves. They steal anything round and shiny. Eggs, especially.')] },
    { name: 'Kester', desc: 'a deckhand from the last ship to make it across', greeting: 'You came through the Mist? Brave or mad.', job: 'Waiting for a ship home. There won\'t be one.' },
  ];
  folk.forEach((e, i) => { if (say[i]) Object.assign(e, say[i]); });
  chatter(map, [
    ['Explorer. I came for gold and found MOSQUITOES.', 'MOSQUITOES', 'They\'re the size of sparrows. The sparrows are the size of hawks. Don\'t ask about the hawks.'],
    ['I keep the camp\'s watch-fire. The MIST comes up the beach at night.', 'MIST', 'It stops at the firelight. It doesn\'t like the light. Nothing on this isle likes the light, except the lizards.'],
    ['Camp guard. Nothing gets past me. Except crabs.', 'TZAL-KA', 'The lizardfolk village is east along the old road. Friendly, if you\'re polite. Bow. Bow lower than that.'],
  ]);
  nameNpcs(map, game, 25);
}

// ------------------------------------------------------------ Tzal-Ka
// The lizardfolk village: friendly, wary, and very old in its memories.
function dressTzalKa(game, map, MON) {
  map.name = 'Tzal-Ka';
  // lizardfolk look as the engine draws them, or green-scaled folk until it can
  const base = game.monsters.find((m) => m.id === MON('lizardfolk', '__none'))?.look;
  const liz = (extra = {}) => (base ? { ...JSON.parse(JSON.stringify(base)), weapon: undefined, shield: undefined, pennant: undefined, pose: undefined, ...extra } : { kind: 'humanoid', race: 'goblin', skin: 0x4a8a5a, hair: 0x2a4a2a, body: 0x6a5a2a, ...extra });
  for (const e of map.entities) if (e.type === 'npc') { e.look = liz({ body: e.look.body }); e.lizard = true; }
  // the village stands in the jungle: its open ground is overgrown
  const VINES = TT('vines', 'meadow');
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === T.grass && hash2(i % map.w, Math.floor(i / map.w), 130) < 0.7) map.tiles[i] = VINES;
  cast(map, 'healer', { name: 'Ssi\'leth the Shaman', desc: 'a lizardfolk shaman hung with shells and feathers', greeting: 'Sss. Warm-blood. You are hurt? Sit by the fire-stones.' });
  cast(map, 'provisions', { name: 'Kesh', desc: 'a lizardfolk trader with baskets of fruit and smoked fish', greeting: 'Fruit! Fish! Good trade for warm-bloods.' });
  cast(map, 'reagents', { name: 'Old Ussk', desc: 'an ancient lizardfolk herbalist', greeting: 'Roots and leaves. The jungle gives. You BUY.' });
  cast(map, 'weapons', { name: 'Zhaar', desc: 'a lizardfolk spear-maker', greeting: 'Spears. Good spears. Obsidian points.' });
  addNpc(map, Math.floor(map.w / 2), Math.floor(map.h / 2) - 4, {
    id: 'npc_ssura', name: 'Elder Ssura', race: 'human', wander: 0, desc: 'the eldest of Tzal-Ka, her scales gone silver with age, leaning on a staff of carved bone',
    lookExtra: liz({ robe: true, body: 0x5a7a4a, trim: 0xd0b040, weapon: 'staff' }),
    greeting: 'Sss... warm-bloods from the east. It is long since your kind came as friends. Do you come as friends?',
    job: 'I am Elder of Tzal-Ka. I remember. That is the work of elders: to remember what the young forget. Ask me of the QUEEN.',
    keywords: [
      kw('QUEEN|NHALIA', 'Do not say her name loud. The Drowned Queen. She sank with her city, a thousand winters gone, and she has never stopped singing to the sea. The lanterns of the old ones held her back. Now the lanterns die, and she rises. She sits in her PALACE on the reef, and the Mist is her breath.'),
      kw('PALACE', 'On the reef to the south-east, beyond the mangroves. Only at the lowest tide is there a way across — and the lowest tide comes only to the TIDE STONE.'),
      kw('TIDE STONE|STONE', 'The sun-priests made it. It pulls the sea back like a blanket. It lies in the heart of the Sunken TEMPLE, north of here, where the Serpent Priest guards it for her.'),
      kw('TEMPLE', 'Its door answers to a song. Our hatchlings sing it still, without knowing. Ask the HATCH-MOTHER, if she will trust you.'),
      kw('WARM-BLOOD|LANTERNMAN|VANE', 'A warm-blood came, with a lantern-badge. Many moons. He went to the reef in a little boat and spoke to the water. The water answered.'),
    ],
  });
  addNpc(map, Math.floor(map.w / 2) - 6, Math.floor(map.h / 2) + 3, {
    id: 'npc_ithiss', name: 'Hatch-mother Ithiss', race: 'human', wander: 0, desc: 'a broad lizardfolk matron by the warm sand of the hatchery',
    lookExtra: liz({ body: 0x8a6a3a }),
    greeting: 'Hsss! Not near the nests! ...Oh. Warm-bloods. Then not near the nests, PLEASE.',
    job: 'I keep the hatchery. Every egg of Tzal-Ka passes through my hands. But the EGGS...',
    keywords: [
      kw('EGGS', 'Stolen! A whole clutch, three nights gone — frogs, great frogs from the south fens, by the mangroves. They take what is round and warm. Bring back my clutch, and I will sing you the hatchlings\' RHYME myself.', { cond: { type: 'questdone', value: 'q_eggs' }, elseText: 'Five eggs, speckled green and gold. The frogs of the south fens took them. Bring them home.' }),
      kw('RHYME|SONG', 'Every hatchling hears it, the first night: "Little egg, what wakes you? The WAVE that rocks you, the MOON that watches, the STAR that names you, the SUN that warms you, and last the FLAME that cracks the shell." We sing it in the old tongue. The scholar at the beach camp will tell you more.', { cond: { type: 'questdone', value: 'q_eggs' }, elseText: 'The hatchlings\' rhyme is for family. Bring home my eggs, and you are family.', action: { type: 'set_flag', value: 'heard_rhyme' } }),
    ],
  });
  const folk = byRole(map, 'villager');
  const say = [
    { name: 'Tisk', desc: 'a lizardfolk hatchling chasing a beetle', greeting: 'Warm-blood! You have FUR on your HEAD!', job: 'I am a hunter! Of beetles.', keywords: [kw('RHYME|SONG', 'I\'m not ALLOWED to tell warm-bloods the egg-song. Hatch-mother says. ...It has a wave in it. That\'s all. I didn\'t tell you.')] },
    { name: 'Varsh', desc: 'a lizardfolk warrior with an obsidian spear', greeting: 'Hsss. Watch your step, warm-blood.', job: 'I guard. The jungle is not safe since the Mist. The Queen\'s FAITHFUL walk it.', keywords: [kw('FAITHFUL', 'Our own, gone bad. They hear her singing and go to the water. Some come back with dead eyes, and serve the Serpent Priest in the temple.')] },
    { name: 'Oshra', desc: 'a lizardfolk weaver at her loom', greeting: 'Sss. A good day for weaving.', job: 'I weave. The patterns are older than the village.' },
  ];
  folk.forEach((e, i) => { if (say[i]) Object.assign(e, say[i]); });
  chatter(map, [
    ['I fish the river with a spear. Sss. The FAITHFUL fish the dark pools.', 'FAITHFUL', 'Our own, gone to the Queen. They hear her singing in their sleep and walk into the water. They come back with dead eyes.'],
    ['I weave the hatchery baskets. The EGGS were taken. A whole clutch.', 'EGGS', 'Frogs, from the south fens. Great frogs. The Hatch-mother has not slept since.'],
    ['I keep the gate. Warm-bloods bow, then pass.', 'BOW', 'Lower. Lower. ...Good. Pass.'],
    ['I carve the totems. The old ones carved LANTERNS on every post.', 'LANTERNS', 'The sun-priests made the lanterns. We kept them for them. Then the warm-bloods came and kept them instead. Now nobody keeps them.'],
    ['Hunter. The jungle CATS are bold this year.', 'CATS', 'Spotted ones. They steal from the beach camp. Old Spots, the warm-bloods call the biggest. He has a scholar\'s bag in his den, at the Old Lantern.'],
    ['I tend the fire-stones. The TEMPLE is closed to us since the Serpent Priest came.', 'TEMPLE', 'North, by the lake in the ruins. A door that sings. The priest is one of the Queen\'s — a great snake with a man\'s voice.'],
  ]);
  nameNpcs(map, game, 26);
  for (const e of map.entities) delete e.lizard;
}
// ------------------------------------------------------------ dungeons
// Each dungeon is generated from its plan, then given a hand-drawn heart:
// a block of rooms drawn in text, stitched on above the generated halls and
// tunnelled to them. Legend: '#' wall, '.' floor, '~' dark pool, 'A' an
// altar (the cold great lamp); any other letter is floor, its squares
// returned by letter for the things placed there.
function stitchNorth(map, rows, to, opt = {}) {
  const wall = T[opt.wall || 'dungeon_wall'], floor = T[opt.floor || 'dungeon_floor'];
  const bw = rows[0].length, bh = rows.length;
  const W = Math.max(map.w, bw + 4), H = map.h + bh;
  const tiles = new Uint8Array(W * H).fill(wall);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) tiles[(y + bh) * W + x] = map.tiles[y * map.w + x];
  // the block sits over its tunnel's target, as near as the map allows
  const eCol = rows[bh - 1].indexOf('E');
  const ox = Math.max(1, Math.min(W - bw - 1, to.x - eCol));
  const marks = {};
  const DECOR = { '~': T.pit_water, A: T.altar, '%': T.rubble };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ' ') return;
    const i = y * W + ox + x;
    tiles[i] = ch === '#' ? wall : DECOR[ch] ?? floor;
    if (ch !== '#' && ch !== '.') (marks[ch] ||= []).push({ x: ox + x, y });
  }));
  map.tiles = tiles; map.w = W; map.h = H;
  for (const e of map.entities) e.y += bh;
  if (map.entry) map.entry.y += bh;
  // a tunnel from the block's door down to the target and across to it
  const E = marks.E[0];
  const tx = to.x, ty = to.y + bh;
  const dig = (x, y) => { const i = y * W + x; if (terrain(tiles[i]).wall) tiles[i] = floor; };
  const y0 = Math.max(E.y + 2, bh + 1);
  for (let y = E.y + 1; y <= y0; y++) dig(E.x, y);
  for (const [x, y] of line4(E.x, y0, tx, y0)) dig(x, y);
  for (const [x, y] of line4(tx, y0, tx, ty)) dig(x, y);
  return marks;
}

function buildDungeons(game, w, P, MON) {
  const temple = DUNGEON_STYLES.temple ? 'temple' : 'crypt';
  const TW = temple === 'temple' ? TT('temple_wall', 'dungeon_wall') : T.dungeon_wall;
  const TF = temple === 'temple' ? TT('ruins_floor', 'dungeon_floor') : T.dungeon_floor;
  const put = (map, e) => { map.entities.push(e); return e; };
  const ev = (map, id, tpl, at, extra) => put(map, { ...eventFromTemplate(tpl), id, x: at.x, y: at.y, ...extra });
  const hoard = (map) => {
    const boss = map.entities.find((e) => e.type === 'monster' && e.boss);
    const chests = map.entities.filter((e) => e.type === 'chest');
    return (boss && chests.find((c) => Math.abs(c.x - boss.x) + Math.abs(c.y - boss.y) <= 3)) || chests.sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0))[0];
  };
  const keyOf = (k) => terrain(k).key;
  const setLevel = (map, level, encounters) => { map.level = level; map.encounters = encounters; };

  // ---------------------------------------------------------- Gannet Rock Light
  // The keeper's tower on the Head: cellars full of crabs and rats, Old
  // Snapper in the deepest, and above them the lamp-room with its four
  // braziers, lit in the order the shanty gives.
  {
    const map = P.gannet;
    setLevel(map, 1, ['giant_rat', 'bat_swarm', 'shore_crab']);
    const h = hoard(map);
    const m = stitchNorth(map, [
      '###############',
      '####.......####',
      '###....d....###',
      '##...........##',
      '##.m...A...g.##',
      '##...........##',
      '###....s....###',
      '####.c...k.####',
      '######...######',
      '#######E#######',
    ], h, { wall: 'dungeon_wall', floor: 'floor_stone' });
    const B = (id, at, name, glyph, order, text) => put(map, { id, type: 'brazier', x: at.x, y: at.y, name, lit: false, group: 'lantern_gannet', order, glyph, cost: {}, text, doneText: 'The fourth fire roars up — and from the four, the great lamp of Gannet Rock takes light.' });
    // (no torch is wanted: the keeper's tinder-box hangs by the stair, and a lone castaway must not be stuck for one)
    B('gannet_br_gannet', m.g[0], 'Brazier of the Gannet', 'gannet', 1, 'An iron brazier, its bowl wrought with a diving gannet, wings folded.');
    B('gannet_br_dawn', m.s[0], 'Brazier of the Morning', 'sun', 2, 'An iron brazier, wrought with a rising sun.');
    B('gannet_br_gone', m.m[0], 'Brazier of the Lost', 'mast', 3, 'An iron brazier, wrought with a broken mast and a torn sail.');
    B('gannet_br_drowned', m.d[0], 'Brazier of the Drowned', 'eye', 4, 'An iron brazier, wrought with a closed eye weeping a single drop.');
    // (Puzzles: brazier `group`/`order` asked for — lit out of turn, the group's fires gutter out)
    put(map, { id: 'gannet_lamp', type: 'trigger', x: m.A[0].x, y: m.A[0].y + 1, need: 'lantern_gannet', tiles: [{ x: m.A[0].x, y: m.A[0].y, t: 'brazier' }], once: true,
      text: 'The four fires roar up, and the great lamp of Gannet Rock catches with a sound like a sail filling. Light floods out over the sea — and down on the water the Mist shrinks back, hissing.' });
    put(map, { id: 'chest_gannet_oil', type: 'chest', x: m.c[0].x, y: m.c[0].y, name: 'Lamp-oil Casks', look: { kind: 'barrels' }, flag: 'clue_oil', gold: '0', items: [{ id: 'torch', n: 2 }] });
    ev(map, 'ev_gannet_log', 'lore', m.k[0], { name: 'The Keeper\'s Log',
      text: 'Tobias Penhallow\'s log-book lies open on the stair. The last entries: "Oil smoky again. Sent word to the Guild." — "New casks from Saltcombe by the Guild launch. Master Vane brought them himself, kind man." — "Lamp sputtering. Oil is half SEA-WATER. Every cask!" — "Something on the stair. Crabs? Not crabs."',
      choices: [{ label: 'Read the log', text: 'You copy the last entries into your journal. Guild oil, brought by the Guild\'s own launch — and watered with brine.', effects: { lore: true, xp: 10, flag: 'clue_oil' } }, leave('Leave it')] });
    addNpc(map, m.k[0].x + 1, m.k[0].y - 2, {
      id: 'npc_tobias', name: 'Tobias Penhallow', race: 'human', wander: 0, desc: 'the keeper of Gannet Rock, grey with exhaustion, a bloody bandage round his leg',
      lookExtra: { face: 'bold', hair: 0x8a5a2a, beard: 0x8a5a2a, body: 0x2a3a5a, hat: 'cap', hatColor: 0x1a2a3a },
      greeting: 'Who\'s that? Not one of them crabs, are you? ...A castaway! Then the Cormorant — oh, saints. I\'m sorry. I\'m so sorry.',
      job: 'I keep the LIGHT. Kept. The oil went bad, the lamp went out, and the crabs came up the stair. I\'ve been holed up here three days.',
      keywords: [
        kw('LIGHT|LAMP', `Light the four braziers in the shanty's order and the great lamp catches from them. You know the shanty? Every child in Pebblewick does: ${SHANTY}`, { cond: { type: 'noflag', value: 'lantern_gannet' }, elseText: 'Burning again. Look at her! Thank you. Thank you.' }),
        kw('OIL', 'Guild oil, from Saltcombe. Half of it SEA-WATER. Somebody watered it — and it came on the Guild launch, sealed with the Guild seal. You tell the Magistrate that.'),
        kw('KIT|NAN|HOME', 'Tell them I\'m alive. Tell Kit to stop sharpening that harpoon. ...No, don\'t. She\'ll want to come. Let her come.'),
      ],
    });
  }

  // ---------------------------------------------------------- the Hollin Warren
  setLevel(P.warren, 2, ['goblin', 'giant_rat', 'goblin_shaman']);
  {
    const map = P.warren, h = hoard(map);
    if (h) Object.assign(h, { name: 'Grubnose\'s Treasure-heap', look: { kind: 'sacks' }, items: [...h.items, { id: 'copper_bangle', n: 1 }] });
    const e0 = map.entry;
    ev(map, 'ev_warren_sign', 'lore', freeSpot(map, e0.x + 2, e0.y - 1), { name: 'Goblin Scrawl', text: 'Scratched on the rock in charcoal, in letters a child would be ashamed of: "GRUBNOSE KING. KING OF PIGS. KING OF EVRYTHING. KEEP OWT."' });
  }

  // ---------------------------------------------------------- the Wreckers' Hole
  // Gaff Hollis's sea-cave, and behind a flood-gate his strongroom: two
  // plates must both be pressed to raise it — two heroes, or a boulder.
  {
    const map = P.wreckers;
    setLevel(map, 3, ['bandit', 'giant_rat', 'bat_swarm']);
    const h = hoard(map);
    const m = stitchNorth(map, [
      '#############',
      '####.....####',
      '####..L..####',
      '####.....####',
      '######X######',
      '#...........#',
      '#.a.......b.#',
      '#.....o.....#',
      '#...........#',
      '######E######',
    ], h, { wall: 'cave_wall', floor: 'cave_floor' });
    put(map, { id: 'wh_plate_a', type: 'plate', x: m.a[0].x, y: m.a[0].y, name: 'Pressure Plate', text: 'A square of iron set in the rock, worn bright by boots.' });
    put(map, { id: 'wh_plate_b', type: 'plate', x: m.b[0].x, y: m.b[0].y, name: 'Pressure Plate', text: 'A square of iron set in the rock, worn bright by boots.' });
    put(map, { id: 'wh_boulder', type: 'boulder', x: m.o[0].x, y: m.o[0].y, group: 'wh_boulders', name: 'Ballast Stone', text: 'A great round ballast-stone off some wreck. It would roll, with a shove.' });
    put(map, { id: 'wh_gate', type: 'gate', x: m.X[0].x, y: m.X[0].y, need: 'wh_plate_a,wh_plate_b', stayOpen: true, style: 'portcullis', name: 'Flood-gate', openText: 'Chains clank in the rock, and the flood-gate hauls itself up, streaming — and jams there, open.',
      closedText: 'An iron flood-gate, chained shut. Two iron plates in the floor are worn bright, one on either side of the cave — the wreckers must stand on both to raise it. (Two of you could. Or one, and something heavy.)' });
    put(map, { id: 'chest_ledger', type: 'chest', x: m.L[0].x, y: m.L[0].y, name: 'Gaff\'s Strongbox', look: { kind: 'strongbox' }, flag: 'clue_ledger', gold: '60', items: [{ id: 'wreckers_ledger', n: 1 }] });
    if (h) Object.assign(h, { name: 'Wreckers\' Plunder', look: { kind: 'crates' } });
    ev(map, 'ev_wreckers_tally', 'lore', freeSpot(map, map.entry.x + 1, map.entry.y - 1), { name: 'Wreckers\' Tally',
      text: 'Chalked on the wet rock: "No false lights on moonless nights — the GUILD BOAT is out and we want no witnesses. Gaff\'s orders." Someone has drawn a lantern with a key in it, and crossed it out.',
      choices: [{ label: 'Copy it down', text: 'The wreckers kept clear of the Guild\'s boat. Interesting.', effects: { lore: true, xp: 15 } }, leave('Leave it')] });
  }

  // ---------------------------------------------------------- Mistwatch Abbey
  // The haunted abbey on the moor. Beyond its halls, the crypt door wears the
  // stone face of St Aldhelm, who asks a riddle; beneath it the undercroft,
  // where bell, book and candle open and shut the gates; and at the bottom
  // the abbot who made a bargain with the Mist.
  {
    const map = P.abbey;
    setLevel(map, 4, ['skeleton', 'bat_swarm', 'giant_rat', MON('mist_wraith', 'barrow_wight')]);
    const h = hoard(map);
    const m = stitchNorth(map, [
      '#####################',
      '###########.......###',
      '###########...M...###',
      '###########.......###',
      '###########..T....###',
      '#############X#######',
      '#.....#.....#.......#',
      '#..b..2..c..4.......#',
      '#.....#.....#.......#',
      '###1#########.......#',
      '#.....#.....#.......#',
      '#..H..3..k..5.......#',
      '#.....#.....#.......#',
      '###G#################',
      '#.f...###############',
      '#.....###############',
      '###E#################',
    ], h, { wall: 'dungeon_wall', floor: 'dungeon_floor' });
    // the face of St Aldhelm, and the crypt door it guards
    put(map, { id: 'abbey_face', type: 'riddle', x: m.f[0].x, y: m.f[0].y, look: 'face', name: 'The Face of St Aldhelm', flag: 'abbey_riddle',
      text: 'A great stone face is carved into the crypt door, its eyes closed. As you come near they open — grey, and old, and kind. "Answer, and pass:\n\nI drink and am never full; I eat the dark and leave no crumbs.\nSailors bless me, and the drowned would curse me if they could.\nStarve me, and the grey comes in. What am I?"',
      answers: ['lantern', 'a lantern', 'the lantern', 'lanterns', 'lamp', 'a lamp', 'the lamp', 'lighthouse', 'a lighthouse', 'light', 'a light'],
      reward: { xp: 60 },
      rightText: '"A lantern," the old saint sighs, and his stone eyes fill with a warm light. "Then keep yours lit, children, whatever comes up the stair."',
      solvedText: 'The saint\'s eyes are closed again, and he is smiling.',
      wrong: { text: 'The eyes close. Cold Mist breathes out of the stone mouth, and for a moment you hear drowned voices.', hurt: '1d6' } });
    put(map, { id: 'abbey_crypt_door', type: 'gate', x: m.G[0].x, y: m.G[0].y, need: 'abbey_riddle', style: 'stone', stayOpen: true, name: 'Crypt Door', openText: 'With a long grinding sigh, the crypt door sinks into the floor. Cold air breathes up from below.', closedText: 'A door of solid stone, without handle or keyhole. Only the face carved beside it seems to have anything to say.' });
    // bell, book and candle: three levers, and gates that answer to them (solved: ring the bell, close the book, snuff the candle)
    const L = (id, at, name, on, text) => put(map, { id, type: 'lever', x: at.x, y: at.y, name, on, text });
    L('abbey_bell', m.b[0], 'The Bell-rope', false, 'A bell-rope hangs from a hole in the vault, its bell somewhere far above.');
    L('abbey_book', m.k[0], 'The Great Book', false, 'A huge book on an iron lectern, wired to a chain that runs into the wall. It lies open.');
    L('abbey_candle', m.c[0], 'The Paschal Candle', true, 'A candle as tall as a man burns on an iron stand, its snuffer hanging beside it on a chain that runs into the floor.');
    const G = (id, at, need, name) => put(map, { id, type: 'gate', x: at.x, y: at.y, need, style: 'bars', name, closedText: 'Iron bars, wrought with bells and books and candles. They do not move.',
      openText: `Somewhere in the undercroft, the ${name} grinds open.`, shutText: `Somewhere in the undercroft, the ${name} clangs shut.` });
    G('abbey_gate_1', m['1'][0], '!abbey_book', 'Gate of the Book');
    G('abbey_gate_2', m['2'][0], 'abbey_bell', 'Gate of the Bell');
    G('abbey_gate_3', m['3'][0], 'abbey_candle,!abbey_bell', 'Gate of Silence');
    G('abbey_gate_4', m['4'][0], 'abbey_bell', 'Gate of the Bell');
    G('abbey_gate_5', m['5'][0], 'abbey_candle', 'Gate of the Candle');
    G('abbey_gate_crypt', m.X[0], 'abbey_bell,abbey_book,!abbey_candle', 'The Abbot\'s Gate');
    // (in the corner of the undercroft, clear of its doorway)
    ev(map, 'ev_abbey_rite', 'lore', { x: m.H[0].x - 2, y: m.H[0].y - 1 }, { name: 'The Rite of Laying',
      text: 'Painted on the wall of the undercroft, flaking: a monk with a bell, a monk with a book, a monk with a candle-snuffer, and a ghost fleeing from all three. Beneath, in old letters: "TO LAY THE RESTLESS DEAD: RING THE BELL. CLOSE THE BOOK. SNUFF THE CANDLE. AND IN THAT ORDER, BROTHER, OR NOT AT ALL."',
      choices: [{ label: 'Read the rite', text: 'Bell, book, candle — in that order.', effects: { lore: true, xp: 15 } }, leave('Leave it')] });
    // the abbot, his crypt, and the letter he kept for the lamplighter
    put(map, { id: uid('mon'), type: 'monster', monster: 'abbot_morcant', x: m.M[0].x, y: m.M[0].y - 1, count: '1', wander: 0, boss: true });
    put(map, { id: 'chest_abbot', type: 'chest', x: m.M[0].x, y: m.M[0].y, name: 'Abbot Morcant\'s Tomb', look: { kind: 'sarcophagus' }, gold: '150', items: [{ id: 'aldhelm_mace', n: 1 }, { id: 'greater_draught', n: 1 }] });
    ev(map, 'ev_abbey_letter', 'lore', m.T[0], { name: 'A Letter on the Lectern',
      text: 'A letter, new among the old dust, in a fine and careful hand: "My Lady beneath the Glass — Gannet Rock will fail on the dark of the moon, and the Midway Light after. I keep my word. Keep yours: give her back to me. Give me back my little lamp." It is sealed with a lantern with a key in its flame.',
      choices: [{ label: 'Take the letter', text: 'The seal is the mark of a Master of the Lanternwrights\' Guild. And "my little lamp" — someone who lost a child.', effects: { lore: true, xp: 40, flag: 'clue_letter' } }, leave('Leave it')] });
    if (h) Object.assign(h, { name: 'Alms-chest of Mistwatch', look: { kind: 'strongbox' } });
  }

  // ---------------------------------------------------------- the Midway Light
  // Halfway across the Glass Sea, on the Teeth: the drowned crew of the last
  // keeper walk its stair, and its lamp is lit by a chain from the gallery.
  {
    const map = P.midway;
    setLevel(map, 5, ['skeleton', MON('mist_wraith', 'barrow_wight')]);
    const h = hoard(map);
    const m = stitchNorth(map, [
      '#############',
      '###.......###',
      '##....l....##',
      '##.........##',
      '##....A....##',
      '##.........##',
      '###...k...###',
      '#####.E.#####',
    ], h, { wall: 'dungeon_wall', floor: 'floor_stone' });
    put(map, { id: 'midway_chain', type: 'lever', x: m.l[0].x, y: m.l[0].y, name: 'The Lamp-chain', on: false, oneWay: true, flag: 'lantern_midway',
      text: 'A great chain runs up from a windlass into the dark of the lamp-cage. Someone has jammed the pawl with a wedge of driftwood.' });
    put(map, { id: 'midway_lamp', type: 'trigger', x: m.A[0].x, y: m.A[0].y + 1, need: 'lantern_midway', tiles: [{ x: m.A[0].x, y: m.A[0].y, t: 'brazier' }], once: true,
      text: 'The windlass clanks, the chain runs, and high above a spark falls into the oil. The Midway Light blazes out over the Glass Sea — and all round the Teeth the Mist tears like wet paper.' });
    ev(map, 'ev_midway_room', 'lore', m.k[0], { name: 'Liesl\'s Room',
      text: 'A little room under the lamp, with a child\'s bed still in it, the blanket folded. Carved into the bedpost: LIESL, and a lantern. On the pillow, fresh, a sprig of sea-lavender. Someone has been here, and recently.',
      choices: [{ label: 'Look closer', text: 'Under the pillow: a wedge of driftwood like the one in the windlass, and a scrap of Guild oil-cloth.', effects: { lore: true, xp: 30 } }, leave('Leave it')] });
    put(map, { id: 'chest_midway', type: 'chest', ...freeSpot(map, m.k[0].x + 2, m.k[0].y), name: 'Keeper\'s Locker', look: { kind: 'chest' }, gold: '60', items: [{ id: 'keepers_lantern', n: 1 }] });
    if (h) Object.assign(h, { name: 'Drowned Crew\'s Sea-chest', look: { kind: 'seachest' }, items: [{ id: 'greater_draught', n: 2 }, { id: 'mistglass_pendant', n: 1 }] });
  }

  // ---------------------------------------------------------- the Sunken Temple of the Sun
  // The sun-priests' temple by the jungle lake. Its inner door answers to the
  // hatchlings' rhyme, stepped out on five glyphs; the sanctum's gate needs
  // both plates pressed; and the Serpent Priest keeps the Tide Stone there.
  {
    const map = P.temple;
    setLevel(map, 6, [MON('lizardfolk', 'orc'), MON('lizard_shaman', 'goblin_shaman'), MON('giant_frog', 'bog_lurker'), MON('stone_guardian', 'troll')]);
    const h = hoard(map);
    const m = stitchNorth(map, [
      '###############',
      '####.......####',
      '####..T.Q..####',
      '####...Z...####',
      '#######X#######',
      '#~...........~#',
      '#.a.........b.#',
      '#......o......#',
      '#.............#',
      '#######G#######',
      '#.............#',
      '#.1..2..3..4.5#',
      '#.............#',
      '#######E#######',
    ], h, { wall: keyOf(TW), floor: keyOf(TF) });
    // the five glyphs, left to right: sun, wave, flame, moon, star — stepped in the rhyme's order
    const glyphs = [['sun', 4], ['wave', 1], ['flame', 5], ['moon', 2], ['star', 3]];
    glyphs.forEach(([glyph, order], i) => put(map, { id: `temple_rune_${glyph}`, type: 'rune', x: m[String(i + 1)][0].x, y: m[String(i + 1)][0].y, group: 'temple_runes', order, glyph, name: `Glyph of the ${glyph[0].toUpperCase()}${glyph.slice(1)}`,
      text: `A floor-stone carved with the glyph of the ${glyph}, faintly warm under your feet.`, ...(order === 1 ? { wrong: { text: 'The glyphs flare and go dark. Somewhere in the walls, stone grinds on stone.', hurt: '1d4' } } : {}) }));
    put(map, { id: 'temple_door', type: 'gate', x: m.G[0].x, y: m.G[0].y, need: 'temple_runes', style: 'stone', stayOpen: true, name: 'Door of the Sun', openText: 'The glyphs blaze, one after another, and the Door of the Sun sinks into the floor with a sound like a long-held breath let go.',
      closedText: 'A slab of gold-veined stone carved with a sun. Five glyphs are cut into the floor before it: a sun, a wave, a flame, a moon, a star. It wants a song — the right one, step by step.' });
    put(map, { id: 'temple_plate_a', type: 'plate', x: m.a[0].x, y: m.a[0].y, name: 'Sun-plate', text: 'A golden plate in the floor, a little sunk, as if waiting for weight.' });
    put(map, { id: 'temple_plate_b', type: 'plate', x: m.b[0].x, y: m.b[0].y, name: 'Moon-plate', text: 'A silver plate in the floor, a little sunk, as if waiting for weight.' });
    put(map, { id: 'temple_boulder', type: 'boulder', x: m.o[0].x, y: m.o[0].y, group: 'temple_boulders', name: 'Fallen Sun-stone', text: 'A great round stone carved with a sun, fallen from the vault. It might roll.' });
    put(map, { id: 'temple_sanctum', type: 'gate', x: m.X[0].x, y: m.X[0].y, need: 'temple_plate_a,temple_plate_b', style: 'portcullis', stayOpen: true, name: 'Sanctum Gate', openText: 'Sun and moon pressed as one: the gilded gate of the sanctum rises into the vault.',
      closedText: 'A gate of gilded bars. A sun-plate and a moon-plate are set in the floor on either side of the hall: sun and moon must both be pressed at once.' });
    put(map, { id: uid('mon'), type: 'monster', monster: 'serpent_priest', x: m.Z[0].x, y: m.Z[0].y, count: '1', wander: 0, boss: true });
    put(map, { id: 'chest_tide_stone', type: 'chest', x: m.T[0].x, y: m.T[0].y, name: 'Altar of the Tides', look: { kind: 'reliquary', color: 0x2a6a5a }, gold: '120', items: [{ id: 'tide_stone', n: 1 }, { id: 'sunsteel_spear', n: 1 }] });
    put(map, { id: 'chest_sun_key', type: 'chest', x: m.Q[0].x, y: m.Q[0].y, name: 'Sun-priest\'s Coffer', look: { kind: 'urns' }, gold: '80', items: [{ id: 'sun_key', n: 1 }, { id: 'coral_mail', n: 1 }] });
    // the Queen's offering bowl, with what Vane gave her
    if (h) Object.assign(h, { name: 'The Drowned Queen\'s Offerings', look: { kind: 'urns' }, items: [...(h.items || []), { id: 'liesl_locket', n: 1 }] });
    ev(map, 'ev_temple_mural', 'lore', freeSpot(map, map.entry.x + 1, map.entry.y - 2), { name: 'Mural of the Sinking',
      text: 'A mural, half-lost under moss: a city of gold on the sea; a queen on a tower, singing; the sea rising to her song; and a ring of lanterns round the drowned city, holding the water back. In the last panel the lanterns burn, and the queen is under the sea, still singing.',
      choices: [{ label: 'Study the mural', text: 'So the lanterns were never for ships. They were a prison.', effects: { lore: true, xp: 40 } }, leave('Leave it')] });
  }

  // ---------------------------------------------------------- the Ember Vault
  // An old forge of the sun-priests in the flank of Mount Ashkar, where a
  // stone sphinx still asks its riddle and a young drake has made her nest.
  {
    const map = P.ember;
    setLevel(map, 7, [MON('lizardfolk', 'orc'), MON('jungle_cat', 'warg'), 'drake']);
    const h = hoard(map);
    const boss = map.entities.find((e) => e.type === 'monster' && e.boss);
    const m = stitchNorth(map, [
      '#############',
      '###.......###',
      '###..H.D..###',
      '###.......###',
      '######X######',
      '#...........#',
      '#..s........#',
      '#####.E.#####',
    ], h, { wall: 'cave_wall', floor: 'cave_floor' });
    // the drake's nest and the old forge's hoard move up into the vault
    if (boss) { boss.x = m.D[0].x; boss.y = m.D[0].y; }
    if (h) Object.assign(h, { x: m.H[0].x, y: m.H[0].y, name: 'Cinderwing\'s Nest', look: { kind: 'nest', color: 0x3a2a2a } });
    put(map, { id: 'ember_sphinx', type: 'riddle', x: m.s[0].x, y: m.s[0].y, look: 'sphinx', name: 'The Ember Sphinx', flag: 'ember_riddle',
      text: 'A stone sphinx crouches by the vault door, obsidian eyes glowing like coals. Its voice is the grind of a millstone: "The more of them you take, the more you leave behind. What are they?"',
      answers: ['footsteps', 'steps', 'footprints', 'foot steps', 'tracks', 'your footsteps'],
      reward: { xp: 80, items: [{ id: 'phoenix_ember', n: 1 }] },
      rightText: 'The sphinx bows its great head. "Then walk on, and leave yours in my Vault." A coal-bright ember drops from its mouth into your hand.',
      wrong: { text: 'The sphinx\'s eyes flare. The floor beneath you scorches.', hurt: '2d6' } });
    put(map, { id: 'ember_door', type: 'gate', x: m.X[0].x, y: m.X[0].y, need: 'ember_riddle', style: 'stone', stayOpen: true, name: 'Vault Door', openText: 'The black door grinds aside. Heat rolls out of the Vault like breath from a forge.', closedText: 'A door of black stone, warm to the touch. The sphinx beside it watches you.' });
  }

  // ---------------------------------------------------------- the Drowned Palace
  {
    const map = P.palace;
    setLevel(map, 8, [MON('mist_wraith', 'barrow_wight'), MON('sea_hag', 'dark_sorcerer'), 'skeleton']);
    const e0 = map.entry;
    addNpc(map, e0.x + 2, e0.y - 2, {
      id: 'npc_vane_chained', name: 'Aurelian Vane', race: 'human', wander: 0, desc: 'the Master Lanternwright, soaked and shaking, chained to a drowned pillar',
      need: 'vane_unmasked', // (here only once he has fled: an NPC `need` is asked of the engine)
      lookExtra: { face: 'bold', hair: 0xc8c8c0, beard: 0xc8c8c0, hairStyle: 'short', body: 0x3a3a3a, robe: true, trim: 0x8a7a4a },
      greeting: 'You. Of course it would be you. Have you come to finish me? She was going to. She only kept me to watch.',
      job: 'I was a lanternwright. I put out the lights. I did it for LIESL, and she lied to me.',
      keywords: [
        kw('LIESL', 'My daughter. She fell from the Midway Light ten years ago. The Queen sang to me from the water — said she had her, in her court, and I could have her back if the lights went out. I wanted to believe it so much.'),
        kw('LOCKET', '', { cond: { type: 'item', value: 'liesl_locket' }, text: 'Liesl\'s locket! From the temple — from her offering-bowl? Then she never had her. Never. Only my girl\'s locket, off the sea-bed... Show it to Wren. She must know I was a fool, and not a monster. Please.', elseText: 'She wore a silver locket. I gave it to the Queen as a token. Proof, she said, that I was sincere.' }),
        kw('QUEEN|NHALIA', 'She is in the throne-hall at the heart of the palace. The Mist is her body now; she hates the light as you or I would hate drowning. Strike her with fire and light — holy light, lantern-light, sun-steel. And do not listen when she sings.'),
      ],
    });
    // where Wren waits once she has run from the company (recruit.leaves.goTo)
    map.wrenAt = freeSpot(map, e0.x - 2, e0.y - 2);
    const h = hoard(map);
    if (h) Object.assign(h, { name: 'Treasury of Drowned Ixara', look: { kind: 'sarcophagus' } });
  }
}

// ------------------------------------------------------------ the wild
// Monsters, landmarks, people on the road, treasure, ships and waygates.
function placeWild(game, w, P, MON) {
  const open = (t) => t.walk && !t.water && !t.feature && t.key !== 'road' && t.key !== 'bridge';
  const clear = (t) => open(t) && !t.sight;
  const shore = (t, x, y) => clear(t) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(w, x + dx, y + dy) && terrain(getTile(w, x + dx, y + dy)).water && !terrain(getTile(w, x + dx, y + dy)).deck);
  const spot = (x, y, pred = clear) => nearestWhereXY(w, x, y, pred);
  const put = (id, tpl, x, y, extra = {}, pred = clear) => {
    const p = spot(x, y, pred);
    const e = { ...eventFromTemplate(tpl), id, x: p.x, y: p.y, ...extra };
    w.entities.push(e);
    return e;
  };
  const mon = (monster, x, y, count, extra = {}, pred = open) => {
    const p = spot(x, y, pred);
    const e = { id: uid('mon'), type: 'monster', monster, x: p.x, y: p.y, count, wander: 4, ...extra };
    w.entities.push(e);
    return e;
  };
  const sign = (id, x, y, text) => { const p = spot(x, y, open); w.entities.push({ id, type: 'sign', x: p.x, y: p.y, text }); };
  const at = (k) => P[k + 'At'];
  const named = (base, want, def, look) => {
    const b = game.monsters.find((m) => m.id === base);
    const m = { ...JSON.parse(JSON.stringify(b)), ...def, boss: true, habitat: [] };
    if (look && base !== want) m.look = look;
    game.monsters.push(m);
    return m;
  };

  // ---------------------------------------------------------- the strand and the Head
  const pw = at('pebblewick');
  const cormorant = put('ev_cormorant', 'wreck', pw.x - 9, pw.y + 9, {
    name: 'Wreck of the Cormorant',
    text: 'Your ship. The Cormorant lies broken-backed on the rocks under Gannet Head, her mast gone, her ribs bare, gulls on every spar. Up on the Head, the dead lighthouse stands black against the sky.',
    choices: [
      { label: 'Search the hold', text: 'Salt-sodden biscuit, a keg of fresh water, a coil of rope — and in the purser\'s cubby, a page of the ship\'s manifest with a note scrawled on the back.', effects: { food: 15, items: [{ id: 'tmap_cormorant', n: 1 }], flag: '{id}_hold' }, hideFlag: '{id}_hold' },
      { label: 'Climb to the captain\'s cabin', text: 'Captain Hale\'s log, the ink run: "Gannet Rock dark. No lamp, no fire. A small boat pulling AWAY from the Rock, no light on her. Mist closing. God help us." His sword still hangs on its hook.', effects: { lore: true, xp: 15, items: [{ id: 'short_sword', n: 1 }], flag: '{id}_cabin' }, hideFlag: '{id}_cabin' },
      { label: 'Say a word for the crew', text: 'You stand a while with the gulls. Somewhere under the water, you could almost swear, someone is singing.', effects: { xp: 5, flag: '{id}_word' }, hideFlag: '{id}_word' },
      leave(),
    ],
  }, (t) => t.key === 'sand');
  // the purser's strongbox, washed up some paces from the wreck
  {
    let p = null;
    for (let r = 0; r < 6 && !p; r++) for (let oy = -r; oy <= r && !p; oy++) for (let ox = -r; ox <= r && !p; ox++) if (buryable(w, cormorant.x + 4 + ox, cormorant.y - 2 + oy)) p = { x: cormorant.x + 4 + ox, y: cormorant.y - 2 + oy };
    if (p) {
      const paces = pacesText(p.x - cormorant.x, p.y - cormorant.y);
      w.entities.push({ id: 'tr_cormorant', type: 'treasure', x: p.x, y: p.y, name: 'The Cormorant\'s Strongbox', from: cormorant.id, gold: '45+2d10', items: [{ id: 'healing_draught', n: 2 }, { id: 'lucky_acorn', n: 1 }],
        clue: `${paces[0].toUpperCase()}${paces.slice(1)} of the wreck of the Cormorant, above the tide-line. The purser always said the box would float.` });
    }
  }
  // (a crab or two on the strand, a little way off: a lone hero's first fight should be one they choose)
  mon('shore_crab', pw.x - 11, pw.y + 9, '1', { wander: 2 }, (t) => t.key === 'sand');
  mon('shore_crab', pw.x + 14, pw.y + 6, '1', { wander: 2 }, (t) => t.key === 'sand');
  mon('giant_rat', at('gannet').x + 5, at('gannet').y - 4, '1-2', { wander: 3 });
  sign('sign_pebble_road', pw.x + 3, pw.y - 3, 'North-east: Thornby, and the coast road to Saltcombe.  South-west: Gannet Head and the Light.');
  put('ev_pebble_shrine', 'shrine_ward', pw.x + 6, pw.y - 6, { name: 'Shrine of the Sea-Mother', text: 'A little stone woman with a lantern in her hands looks out to sea from a cairn of white pebbles. Fishermen leave shells at her feet.' });

  // ---------------------------------------------------------- the Wend valley and Hollin Wood
  const th = at('thornby');
  sign('sign_thornby', th.x + 2, th.y + 4, 'THORNBY.  North: the King\'s Road to the Kestrel Pass and Highcrown.  West: Hollin Wood and the moor road.  East: Saltcombe.  South-west: Pebblewick.');
  mon('wolf', at('warren').x + 6, at('warren').y - 4, '1-2', { wander: 4 });
  mon('goblin', at('warren').x + 3, at('warren').y + 2, '2', { wander: 3 });
  mon('wolf', th.x - 14, th.y + 18, '2', { wander: 4 });
  put('ev_woodcutters', 'woodcutters', at('warren').x + 8, at('warren').y + 6, { name: 'Hollin Woodcutters' }, open);
  put('ev_thornby_camp', 'campfire', th.x - 10, th.y + 22, { name: 'Drovers\' Camp' });
  put('ev_fortune', 'fortune', th.x + 6, th.y - 8, { name: 'Madame Zelda\'s Caravan',
    text: 'A painted wagon covered in moons stands by the King\'s road. Madame Zelda, in a shawl of a hundred colours, beckons from the step. "The sea took your ship and gave you back, dearie. Cross my palm and I\'ll tell you why."' });

  // ---------------------------------------------------------- Saltcombe's coast
  const sc = at('saltcombe');
  put('ev_saltcombe_light', 'lighthouse', sc.x + 3, sc.y - 6, { name: 'Saltcombe Light',
    text: 'The great white light on Saltcombe\'s harbour-mole, still burning. Its keeper, Old Jowan, keeps a cutlass by the door now. "Nobody puts MY light out," he says, and means it.',
    choices: [
      { label: 'Climb to the lamp-room', text: 'From the gallery you can see the whole coast, the river-mouth — and far out over the Glass Sea, a grey wall of Mist where the Midway Light should be burning.', effects: { reveal: 22, lore: true, xp: 20 } },
      { label: 'Ask Jowan about the lights', text: '"Guild oil comes by the launch, regular as tides. Last month the launch came to me with the Master himself in her. I sent him off — told him I\'d my own oil. He looked at me a long while. Kind man, Master Vane. Sad eyes."' },
      leave('Back down to the quay'),
    ] }, shore);
  // the Black Gull, Mags Corrigan's sloop, hers to sell once she is free
  put('ev_black_gull', 'shipyard', sc.x + 2, sc.y + 3, {
    name: 'The Black Gull', repeat: 'always',
    text: 'A lean black sloop lies at a quiet mooring below the harbour wall, sails furled, a gull painted on her bow. The harbour guard leans on the rail. "Corrigan\'s boat. Impounded, till the magistrate says otherwise."',
    ship: { id: 'ship_black_gull', name: 'Black Gull', price: 1 },
    choices: [
      { label: 'Take the Black Gull (one crown, for luck)', text: 'Mags spits on the crown and hands it back to you with the tiller. "Never take a ship for nothing. Bad luck. Now — where are we going?"', effects: { ship: true }, req: { type: 'questdone', value: 'q_mags' }, lockedText: 'Mags Corrigan is in gaol: clear her name first' },
      leave(),
    ] }, shore);
  mon('bandit', sc.x - 8, sc.y + 16, '2', { wander: 4 });
  mon('bandit', at('wreckers').x - 6, at('wreckers').y - 6, '2-3', { wander: 3 });
  put('ev_gibbet', 'gallows', at('wreckers').x - 3, at('wreckers').y - 8, { name: 'Wreckers\' Gibbet',
    text: 'A gibbet on the cliff-top, its cage creaking in the wind, a board nailed to the post: "WRECKERS. BY ORDER OF THE HARBOUR COURT. — E. THORNE." The cage is empty; the wreckers came for their man in the night.' });
  // the fighting pit outside Saltcombe's walls
  game.items.push({ id: 'pit_trident', name: 'Gull-Pit Trident', type: 'weapon', wkind: 'spear', dmg: '1d10+2', hit: 2, range: 1, price: 300, model: 'spear', glow: 0x80c0ff, unique: true, desc: 'The pit champion\'s trident, its tines gilded. The crowd still chants for it.' });
  named('orc_captain', 'orc_captain', { id: 'iron_meg', name: 'Iron Meg', plural: 'Iron Megs', level: 4, hp: '11d8+14', ac: 15, hit: 8, dmg: '1d10+4', xp: 120, gold: '0', group: [1, 1], escort: [],
    abilities: ['war_cry', 'brutal_smash'], phaseAt: 0.4, phaseEnrage: true, phaseText: 'Iron Meg wipes the blood from her lip, grins, and the crowd goes wild!',
    look: { kind: 'humanoid', race: 'human', body: 0x4a4a52, armor: 'plate', hat: 'helm', weapon: 'spear', face: 'fair', hairStyle: 'braids', hair: 0x9a4a22, scale: 1.15 }, desc: 'Champion of the Gull Pit: thirty bouts, thirty wins, and she still does her own darning.' });
  put('ev_gull_pit', 'arena', sc.x - 8, sc.y - 6, { name: 'The Gull Pit',
    text: 'A pit of wet sand behind the fish-market, ringed by barrels and packed with sailors, dockers and fishwives, all shouting. The pit-master bangs a frying pan. "Five bouts! Win them all and face Iron Meg herself!"',
    choices: [...arenaBouts('iron_meg', 'pit_trident'), leave('Just watch')] });

  // ---------------------------------------------------------- the King's road, the pass and the north
  const hc = at('highcrown');
  sign('sign_kestrel', 41, 62, 'NORTH: the Kestrel Pass and Highcrown.  Travellers, go armed — RED JORY holds the pass.');
  const jory = mon('red_jory', 41, 57, '1', { boss: true, wander: 2 });
  jory.loot = [{ id: 'kestrel_bow', n: 1 }, { id: 'wolf_tooth', n: 1 }];
  mon('bandit', 39, 60, '2-3', { wander: 3 });
  mon('warg', 44, 46, '2', { wander: 4 });
  put('ev_kestrel_tower', 'ruined_tower', 44, 58, { name: 'Kestrel Tower',
    text: 'The old watchtower of the pass, half fallen. Red Jory\'s bandits have made it their roost: a fire-pit, a heap of stolen sacks, and their tally of robberies chalked on the wall in a very neat hand.' });
  put('ev_pass_camp', 'campfire', 40, 44, { name: 'Pilgrims\' Rest', text: 'A shelter of piled stones at the top of the pass, with a fire-pit and a view over all of Merrow. Someone has carved into the lintel: "REST HERE. JORY NEVER COMES THIS HIGH. TOO LAZY."' });
  put('ev_highcrown_chapel', 'chapel', hc.x + 7, hc.y + 6, { name: 'Chapel of the Lantern Knights',
    text: 'A little chapel of white stone below the castle, a stone lantern over its door. Inside, the shields of the Knights of the Lantern hang in rows — all but one of them dusty.' });
  mon('troll', 22, 22, '1', { wander: 3 });
  mon('wolf', 30, 36, '2-3', { wander: 4 });
  put('ev_quarry', 'quarry', 30, 46, { name: 'Greyspine Quarry' });
  put('ev_old_wyrm', 'bones', 58, 13, { name: 'Bones of the Old Wyrm', text: 'The bones of a dragon lie half sunk in the snow of the northern hills, ribs arching higher than a house. The shepherds say it came out of the Glass Sea, a thousand years ago, the night the isle sank.' });
  put('ev_fairy_ring', 'fairy_ring', 52, 36, { name: 'The Queen\'s Ring' });

  // ---------------------------------------------------------- Mistwatch Moor
  const ab = at('abbey');
  addWorldNpc(w, ab.x + 3, ab.y + 2, {
    id: 'npc_cadoc', name: 'Brother Cadoc', race: 'human', wander: 2, desc: 'a gaunt monk in a patched black habit, with burning eyes',
    lookExtra: { face: 'bold', hairStyle: 'bald', hair: 0x9a9a9a, beard: 0x5a5a5a, body: 0x1a1a1a, robe: true, trim: 0x5a5a5a },
    greeting: 'Repent! The Mist is coming, and it is no more than we deserve!',
    job: 'I am the last brother of MISTWATCH. I keep the abbey, though the dead keep it better.',
    keywords: [
      kw('MISTWATCH|ABBEY', 'Forty years since the brothers left. Abbot MORCANT would not go. He said the Mist had spoken to him. He is down there still. Do not go in — or if you must, lay him to REST.'),
      kw('MORCANT', 'He bargained with the voice in the Mist. Knowledge, he wanted. He got it. Now he lies in the crypt beneath the undercroft, behind the face of St Aldhelm, and the bells ring at night.'),
      kw('REST', 'Lay the abbot down, and the brothers with him, and I will bless you with what little I have.'),
      kw('LANTERNS|MIST|JUDGEMENT', 'Judgement! We built lights to keep out the dark, and grew proud. Now the dark comes. ...But I did not put them out. I would not know how. I am a monk, not a lanternwright.'),
      kw('LETTERS|VISITOR|LAMPLIGHTER', 'Someone comes to the abbey by night, in a cloak, with a lantern that is never lit. He goes down to the crypt and comes back up without a word. I thought he was a ghost. Ghosts do not wear good boots.'),
      kw('BELLS', 'There are no bells in Mistwatch. They were melted down for cannon a hundred years ago. And yet.'),
    ],
  });
  put('ev_abbey_graves', 'graveyard', ab.x - 3, ab.y + 4, { name: 'Brothers\' Graves', setsFlag: 'ev_abbey_graves_laid',
    text: 'The graves of the brothers of Mistwatch lean in the heather inside a tumbled wall. Several are open — from the inside.' });
  put('ev_grey_sisters', 'circle', ab.x + 10, ab.y + 9, { name: 'The Grey Sisters', text: 'Seven grey stones on the moor, leaning together. The Mist will not come inside the ring, the moor-folk say — and indeed, on the foggiest night, the grass inside is dry.' });
  put('ev_mere', 'lore', 30, 74, { name: 'Mistwatch Mere', text: 'A cold black mere under the moor. A carved post stands at the water\'s edge: "HERE THE MIST FIRST CAME ASHORE, IN THE YEAR OF THE SINKING. THE BROTHERS HELD IT WITH LIGHT."' });
  mon('skeleton', ab.x - 4, ab.y - 4, '2', { wander: 3 });
  mon('bog_lurker', 18, 78, '1-2', { wander: 3 }, (t) => t.key === 'swamp');
  mon('skeleton', 32, 66, '2-3', { wander: 3 });
  put('ev_moor_camp', 'campfire', ab.x + 8, ab.y - 2, { name: 'Shepherds\' Bothy' });
  // the old waygate in the abbey grounds, and its twin by the Sunken Temple
  const wgA = spot(ab.x - 2, ab.y - 3, open), tp = at('temple'), wgB = spot(tp.x + 3, tp.y + 3, open);
  w.entities.push({ id: 'waygate_abbey', type: 'portal', style: 'waygate', x: wgA.x, y: wgA.y, label: 'Ixaran Waygate', requires: 'sun_key', lockedText: 'An arch of green stone, carved with suns, older than the abbey built round it. A round socket at its keystone waits for something golden.', target: { map: w.id, x: wgB.x, y: wgB.y + 1 } });
  w.entities.push({ id: 'waygate_temple', type: 'portal', style: 'waygate', x: wgB.x, y: wgB.y, label: 'Ixaran Waygate', requires: 'sun_key', lockedText: 'An arch of green stone carved with suns, half swallowed by the jungle. A round socket at its keystone waits for something golden.', target: { map: w.id, x: wgA.x, y: wgA.y + 1 } });

  // ---------------------------------------------------------- the Glass Sea
  const sea = (x, y) => spot(x, y, (t) => t.key === 'ocean');
  { const p = sea(88, 34); w.entities.push({ id: uid('mon'), type: 'monster', monster: 'glass_wyrm', x: p.x, y: p.y, count: '1', wander: 6, boss: true, loot: [{ id: 'kings_coin', n: 1 }] }); }
  { const p = sea(86, 80); w.entities.push({ id: uid('mon'), type: 'monster', monster: MON('reef_shark', 'sea_serpent'), x: p.x, y: p.y, count: '1', wander: 6 }); }
  { const p = sea(150, 150); w.entities.push({ id: uid('mon'), type: 'monster', monster: MON('reef_shark', 'sea_serpent'), x: p.x, y: p.y, count: '1-2', wander: 5 }); }
  // Gull Skerry and its hoard
  {
    const p = spot(90, 26, (t) => t.walk && !t.water && !t.feature);
    w.entities.push({ id: 'tr_skerry', type: 'treasure', x: p.x, y: p.y, name: 'Old Corrigan\'s Rainy Day', gold: '220+4d20', items: [{ id: 'greater_draught', n: 2 }, { id: 'stormcaller_orb', n: 1 }],
      clue: 'On Gull Skerry, the lonely rock in the north of the Glass Sea, at its highest point. Old Corrigan was Mags\'s grandfather. She does not know.', guardian: 'giant_crab', count: '1', guardText: 'The shingle bursts apart — a giant crab has made its home on the old smuggler\'s chest!' });
  }
  // Seal Rock: an islet off the south coast, reached by wading the shallows with a charm
  {
    const rock = { x: 70, y: 152 };
    const coast = spot(68, 144, (t, x, y) => t.walk && !t.water && !t.feature);
    for (const [x, y] of line4(coast.x, coast.y + 1, rock.x, rock.y)) if (terrain(getTile(w, x, y)).key === 'ocean') setTile(w, x, y, T.shallows);
    const p = spot(rock.x, rock.y, (t) => t.walk && !t.water && !t.feature);
    w.entities.push({ id: 'chest_seal_rock', type: 'chest', x: p.x, y: p.y, name: 'Selkie\'s Cache', look: { kind: 'nest', color: 0xa8a8a0 }, gold: '70', items: [{ id: 'menders_pendant', n: 1 }, { id: 'healing_draught', n: 1 }] });
    sign('sign_seal_rock', coast.x, coast.y - 1, 'SEAL ROCK. The seals bask out there beyond the shallows. Something shines in the seals\' nest. (A wader might reach it on foot, or a sailor by sea.)');
  }

  // ---------------------------------------------------------- Ixara
  const lf = at('landfall');
  put('ev_landfall_camp', 'campfire', lf.x + 6, lf.y - 4, { name: 'Beach Fire', text: 'A driftwood fire on the beach above Landfall, ringed by hammocks slung between palms. The explorers keep it burning all night against the Mist and the things in the jungle.' });
  // the Old Lantern on the west cape, and the great cat that took Elowen's journal
  const oldL = put('ev_old_lantern', 'ruined_tower', 103, 56, { name: 'The Old Lantern',
    text: 'The first lantern of all: a stump of green Ixaran stone on the cape, older than Merrow, vines thick on it as rope. A great bronze mirror still hangs crooked at its top. Carved round its base, in glyphs and in the trader\'s tongue: "WHILE WE BURN, SHE SLEEPS."',
    choices: [
      { label: 'Climb the ruin', text: 'From the top, through the leaves, you can see the whole western coast of Ixara — and far to the south-east, the reef where the Mist sits thickest.', effects: { reveal: 20, lore: true, xp: 30 } },
      leave(),
    ] }, open);
  named(MON('jungle_cat', 'warg'), 'jungle_cat', { id: 'old_spots', name: 'Old Spots', plural: 'Old Spotses', level: 5, hp: '10d8+12', ac: 14, hit: 8, dmg: '1d10+3', xp: 140, gold: '0', group: [1, 1], escort: [{ id: MON('jungle_cat', 'wolf'), min: 1, max: 2 }],
    phaseAt: 0.5, phaseEnrage: true, phaseText: 'Old Spots screams like a woman and comes on in a blur of claws!', desc: 'A great spotted jungle cat, grey about the muzzle, who steals anything that smells of people.' },
  { kind: 'quadruped', color: 0xc89a40, eyes: 0x80ff60, scale: 1.4, tail: 'long' });
  mon('old_spots', oldL.x + 2, oldL.y + 3, '1', { boss: true, wander: 2 });
  { const p = spot(oldL.x + 3, oldL.y + 2, open); w.entities.push({ id: 'chest_elowen', type: 'chest', x: p.x, y: p.y, name: 'Torn Satchel', look: { kind: 'remains' }, gold: '15', items: [{ id: 'elowen_journal', n: 1 }] }); }
  // the frog fens in the south, and the stolen eggs
  named(MON('giant_frog', 'bog_lurker'), 'giant_frog', { id: 'fen_mother', name: 'The Fen-Mother', plural: 'Fen-Mothers', level: 5, hp: '12d8+12', ac: 13, hit: 8, dmg: '1d10+4', poison: 0.3, xp: 150, gold: '3d10', group: [1, 1], escort: [{ id: MON('giant_frog', 'bog_lurker'), min: 2, max: 2 }],
    desc: 'A frog the size of a haycart, warty and gold-eyed, squatting on a heap of stolen eggs.' },
  { kind: 'blob', color: 0x6a8a3a, scale: 1.4 });
  mon('fen_mother', 126, 124, '1', { boss: true, wander: 2 }, (t) => t.walk && !t.water && !t.feature);
  { const p = spot(127, 125, (t) => t.walk && !t.water && !t.feature); w.entities.push({ id: 'chest_eggs', type: 'chest', x: p.x, y: p.y, name: 'Frog-spawn Mound', look: { kind: 'nest', color: 0x5a6a3a }, gold: '20', items: [{ id: 'eggs_tzal', n: 1 }] }); }
  mon(MON('giant_frog', 'bog_lurker'), 120, 118, '2', { wander: 3 });
  // the jungle: the Queen's faithful, cats, frogs
  mon(MON('lizardfolk', 'orc'), tp.x - 4, tp.y + 8, '2-3', { wander: 3 });
  mon(MON('lizardfolk', 'orc'), 146, 70, '2-3', { wander: 4 });
  mon(MON('lizard_shaman', 'goblin_shaman'), 136, 64, '1', { wander: 3 });
  mon(MON('jungle_cat', 'wolf'), 118, 72, '1-2', { wander: 4 });
  mon(MON('jungle_cat', 'wolf'), 150, 96, '2', { wander: 4 });
  mon(MON('lizardfolk', 'orc'), 148, 120, '2-3', { wander: 3 });
  put('ev_sun_shrine', 'shrine_might', 120, 80, { name: 'Shrine of the Sun', text: 'A stone sun, taller than a man, rises out of the jungle floor, its face worn smooth by a thousand years of rain. The lizardfolk leave fruit at its foot.' });
  put('ev_ixara_camp', 'campfire', at('tzalka').x + 8, at('tzalka').y - 10, { name: 'Hunters\' Shelter' });
  put('ev_totem_ring', 'circle', 112, 104, { name: 'Ring of the Old Ones', text: 'A ring of carved stone posts in a jungle clearing, each topped with a lizard-headed figure holding a lantern. One of the lanterns has been knocked off and smashed.' });
  put('ev_galley', 'wreck', lf.x + 2, lf.y + 9, { name: 'Ixaran Galley', text: 'The ribs of a great galley stick out of the sand like a whale\'s bones, older than any ship in Merrow. Her figurehead — a woman with a lantern — lies face-down in the surf.',
    choices: [{ label: 'Turn over the figurehead', text: 'The lantern-woman\'s face is worn almost smooth. In her lantern, wedged fast: a small gold coin with a sun on one side and a crowned woman on the other.', effects: { lore: true, xp: 20, gold: 25, flag: '{id}_coin' }, hideFlag: '{id}_coin' }, leave()] }, (t) => t.key === 'sand' || t.key === terrain(TT('palms', 'sand')).key);
  put('ev_ashkar_throat', 'lore', 146, 34, { name: 'Ashkar\'s Throat', text: 'Black glass crunches underfoot, and the air shakes with heat. Below, the mountain\'s throat glows red. Carved into a pillar at the edge, sun-priest glyphs: "THE FORGE OF THE SUN-STEEL. LET THE WORTHY ANSWER THE SPHINX."' }, (t) => t.walk && !t.water && !t.feature);
  put('ev_ashkar_bones', 'bones', 154, 46, { name: 'Bones of the Mountain-wyrm', text: 'The skeleton of a great drake, half glassed over by old lava. Cinderwing\'s mother, perhaps. Her daughter nests in the Vault now.' }, (t) => t.walk && !t.water && !t.feature);

  // ---------------------------------------------------------- the Drowned Causeway
  // A line of drowned paving runs from the mangrove shore to the palace isle.
  // Set the Tide Stone on its plinth and the sea draws back to show it.
  const pal = at('palace');
  const shoreAt = spot(pal.x - 10, pal.y - 10, (t, x, y) => t.walk && !t.water && !t.feature && [[1, 0], [0, 1]].some(([dx, dy]) => terrain(getTile(w, x + dx, y + dy)).water));
  const way = line4(shoreAt.x, shoreAt.y, pal.x, pal.y).slice(1, -1).filter(([x, y]) => terrain(getTile(w, x, y)).water);
  // (black water, deeper than any keel can find: no ship lands there before the tide goes out)
  for (const [x, y] of way) setTile(w, x, y, T.pit_water);
  // the palace isle is walled by cliffs, all but the causeway's landing
  {
    const last = way[way.length - 1];
    const landing = last && [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: last[0] + dx, y: last[1] + dy })).find((q) => !terrain(getTile(w, q.x, q.y)).water);
    // (the landing, and the way up from it to the palace gate, stay open: paved)
    const lane = new Set(landing ? line4(landing.x, landing.y, pal.x, pal.y).map(([x, y]) => `${x},${y}`) : []);
    for (const k of lane) { const [x, y] = k.split(',').map(Number); if (!terrain(getTile(w, x, y)).feature) setTile(w, x, y, TT('ruins_floor', 'road')); }
    for (let y = pal.y - 9; y <= pal.y + 9; y++) for (let x = pal.x - 9; x <= pal.x + 9; x++) {
      if (!inBounds(w, x, y) || Math.hypot(x - pal.x, y - pal.y) > 8.5) continue;
      const t = terrain(getTile(w, x, y));
      if (t.water || t.feature || lane.has(`${x},${y}`)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => terrain(getTile(w, x + dx, y + dy)).water)) setTile(w, x, y, hash2(x, y, 120) < 0.3 ? T.peaks : T.mountains);
    }
  }
  const causeway = TT('ruins_floor', 'bridge');
  w.entities.push({ id: 'causeway_trigger', type: 'trigger', x: shoreAt.x, y: shoreAt.y - 1, need: 'tide_low', once: true,
    tiles: way.map(([x, y]) => ({ x, y, t: terrain(causeway).key })),
    text: 'The sea draws back with a long, sucking roar — back, and back — and out of the water rises a road of green paving, streaming and weed-hung, all the way to the palace on the reef.' });
  put('ev_tide_plinth', 'lore', shoreAt.x - 1, shoreAt.y, { name: 'The Tide Plinth', repeat: 'always',
    text: 'A plinth of green stone stands at the water\'s edge, carved with a spiral of waves, a round hollow at its top. Out on the reef the palace waits, cut off by deep water.',
    choices: [
      { label: 'Set the Tide Stone in the hollow', text: 'The stone fits as if it grew there. It begins to hum, and the sea begins to move.', effects: { flag: 'tide_low', xp: 60 }, req: { type: 'item', value: 'tide_stone' }, lockedText: 'The hollow wants a disc of green stone', hideFlag: 'tide_low' },
      leave(),
    ] }, (t) => t.walk && !t.water && !t.feature);
  // the tide-priest who watches the reef for the Elder
  const lizLook = game.monsters.find((m) => m.id === 'lizardfolk')?.look || {};
  addWorldNpc(w, shoreAt.x - 2, shoreAt.y - 1, {
    id: 'npc_tidepriest', name: 'Tide-priest Ossik', race: 'human', wander: 0, desc: 'a lizardfolk priest in a cloak of woven kelp, watching the reef',
    lookExtra: { ...lizLook, skin: 0x3a7a6a, body: 0x2a4a3a, robe: true, mantle: 0x3a6a4a, weapon: 'staff', weaponGlow: 0x60e0c0, shield: undefined, pennant: undefined, pose: undefined },
    greeting: 'Sss. The Queen\'s house, out on the reef. You go there? Then you need the low tide.',
    job: 'I watch the reef for the Elder. The old road lies under the black water. Only the TIDE STONE lays it bare.',
    keywords: [
      kw('TIDE STONE|STONE|PLINTH', 'Set the green stone in the plinth by my feet. The sea will draw back like a breath, and the old road will rise.', { cond: { type: 'flag', value: 'tide_low' }, text: 'The sea is back. Go, warm-blood. Go quickly, and do not listen when she sings.', elseText: 'Set the green stone in the plinth by my feet. The sea will draw back like a breath, and the old road will rise.' }),
      kw('QUEEN|PALACE', 'She sings at night. The young ones wake and walk to the water. I sit here and sing louder.'),
    ],
  });
  P.causewayShore = shoreAt;
  mon(MON('mist_wraith', 'barrow_wight'), shoreAt.x - 4, shoreAt.y - 3, '2', { wander: 3 });
}

function addWorldNpc(w, x, y, props) {
  return addNpc(w, x, y, props);
}

// ------------------------------------------------------------ the story
function buildQuests(game, P) {
  return [
    {
      id: 'q_main', name: 'The Lanterns of the Glass Sea', main: true, auto: true, giver: 'npc_nan',
      summary: 'The great sea-lanterns of Merrow are going dark, one by one, and ships die in the Mist beneath them — yours among them. Someone is putting them out.',
      stages: [
        { text: 'Speak to Old Nan Penhallow, the elder of Pebblewick, just up the beach', goal: talk('npc_nan'),
          say: 'The light on Gannet Rock went dark the night your ship struck. My son Tobias keeps it, and he hasn\'t come down. Climb up and find him for me, love — the path runs south-west out along the Head. Take his spare torches; it\'s black as pitch up there without the lamp.',
          reward: { food: 10, items: [{ id: 'torch', n: 3 }] } },
        { text: 'Climb to Gannet Rock Light, out on the Head south-west of Pebblewick', goal: { type: 'reach', map: P.gannet.id },
          log: 'The tower is cold and dark, and something scuttles on the stair below.' },
        { text: 'Relight the great lamp of Gannet Rock: light its four braziers in the order of the keepers\' shanty', goal: flagGoal('lantern_gannet'),
          log: 'Gannet Rock burns again.' },
        { text: 'Bring the news to Old Nan in Pebblewick', goal: talk('npc_nan'),
          say: 'Burning! I saw it from my window and I wept like a girl. And my Tobias — alive. ...Watered oil, you say? Under the Guild\'s own seal? Then somebody wants those lights out, and that\'s murder. Take this letter to the Harbour Magistrate in Saltcombe — up the coast road, east past Thornby. Eleanor Thorne will listen.',
          reward: { gold: 40, xp: 40, items: [{ id: 'nan_letter', n: 1 }] } },
        { text: 'Take Nan\'s letter to Magistrate Thorne in Saltcombe, east along the coast road past Thornby', goal: { type: 'deliver', npc: 'npc_thorne', item: 'nan_letter' },
          say: 'Watered oil under the Guild seal. Four lights out, four ships lost. Someone is doing this, and someone who knows how. Find me proof — and a NAME. But hear me: a guild master is beyond this court without the Queen\'s WARRANT. Fetch it from Highcrown, north over the Kestrel Pass. And ask me about the SUSPECTS.',
          reward: { xp: 60, flag: 'case_opened' } },
        { text: 'Ask Queen Rosamund for her warrant, in Highcrown castle — north from Thornby, over the Kestrel Pass', goal: talk('npc_rosamund'),
          say: 'Magistrate Thorne writes that my lanterns are being murdered. Then here is my warrant: whoever is doing this, guild master or beggar, answers to the Harbour Court. Go carefully. Anyone who can put out a lantern can put out a life.',
          reward: { gold: 100, xp: 80, flag: 'warrant_given', items: [{ id: 'queens_warrant', n: 1 }] } },
        { text: 'Gather proof of who is putting out the lanterns, then ACCUSE them before Magistrate Thorne in Saltcombe', goal: flagGoal('vane_unmasked'),
          log: 'Master Vane is gone, across the Glass Sea in the Guild launch — and the Midway Light still dark.' },
        { text: 'Get a ship in Saltcombe and relight the Midway Light on the Teeth, the islets halfway across the Glass Sea', goal: flagGoal('lantern_midway'),
          log: 'The Midway Light burns, and the way to Ixara is open.' },
        { text: 'Sail on east to Ixara, and make landfall at the explorers\' camp on its western beach', goal: { type: 'reach', map: P.landfall.id } },
        { text: 'Find the lizardfolk village of Tzal-Ka, east of Landfall along the old road, and speak to its Elder', goal: talk('npc_ssura'),
          say: 'The lantern-man came here. He went to the reef in a little boat and spoke to the water, and the water answered. Now he is hers. If you would follow him into her palace, you must have the TIDE STONE. It lies in the Sunken Temple of the Sun, north of here, by the lake in the ruins. The Serpent Priest keeps it for her.',
          reward: { xp: 80 } },
        { text: 'Take the Tide Stone from the heart of the Sunken Temple of the Sun, north of Tzal-Ka', goal: { type: 'collect', item: 'tide_stone' } },
        { text: 'Set the Tide Stone in its plinth at the Drowned Causeway, on the south-eastern shore, and cross to the palace at low tide', goal: flagGoal('tide_low'),
          log: 'The sea draws back. The palace of the Drowned Queen stands open on its reef.' },
        { text: 'Destroy Nhalia the Drowned Queen in the heart of her palace', goal: { type: 'kill', monster: 'drowned_queen' } },
      ],
      reward: { xp: 500 },
      doneText: 'Nhalia is gone, the Mist with her, and the lanterns of Merrow burn again.',
      thanks: 'You brought the light back. Pebblewick will tell of it until the sea runs dry.',
    },
    {
      id: 'q_tobias', name: 'Bring Da Home', giver: 'npc_kit',
      offer: 'My da\'s up on Gannet Rock, and the light\'s out, and Gran won\'t let me go. But she can\'t stop YOU. Find him. Bring him home — or tell me where he is. And then I\'ll follow you anywhere. Promise.',
      accept: 'The path\'s south-west, out along the Head. Mind the crabs.',
      summary: 'Kit Penhallow\'s father Tobias keeps the Gannet Rock light, and has not come down since it went dark.',
      stages: [
        { text: 'Find Tobias Penhallow in Gannet Rock Light', goal: talk('npc_tobias'),
          say: 'Kit sent you? That girl. Tell her I\'m alive, and to stop sharpening that harpoon. ...No. Tell her to bring it. She\'s better with it than I ever was.' },
        { text: 'Tell Kit in Pebblewick that her father is alive', goal: talk(''),
          say: 'He\'s ALIVE? Oh — oh, saints. Gran! GRAN! ...Right. I\'m coming with you. Don\'t argue. Somebody nearly killed my da, and I want to see their face.' },
      ],
      reward: { gold: 30, xp: 30, items: [{ id: 'healing_draught', n: 2 }] },
      thanks: 'Da\'s home, and Gran\'s cooked enough for a regiment. Thank you.',
    },
    {
      id: 'q_nets', name: 'The Thing in the Nets', giver: 'npc_ezra',
      offer: 'Third net this month, and it\'s Old Snapper doing it — the biggest crab on this coast, as old as the harbour wall. He lives in the cellars under Gannet Rock. Kill him, and I\'ll give you the best thing I ever pulled out of the sea.',
      accept: 'Go for the soft bit under the shell. Takes some finding.',
      summary: 'Old Ezra Quill of Pebblewick wants Old Snapper, the giant crab in the cellars of Gannet Rock, dead.',
      stages: [
        { text: 'Kill Old Snapper in the cellars of Gannet Rock Light', goal: { type: 'kill', monster: 'old_snapper' } },
        { text: 'Tell Ezra in Pebblewick', goal: talk(''),
          say: 'Old Snapper? Dead? Ha! HA! Here — I pulled this out of the nets the year I married. Hold it in your fist and you can walk on the shallows like a seal. My wife said it was bad luck. She was wrong about that, and so much else.' },
      ],
      reward: { gold: 45, xp: 40, items: [{ id: 'selkie_shell', n: 1 }] },
      thanks: 'Nets full every day. Fish for a week, if you want them.',
    },
    {
      id: 'q_warren', name: 'The Goblin-King of Hollin Wood', giver: 'npc_reeve',
      offer: 'Goblins, out of Hollin Wood west of here. A pig a night, and they laugh about it. Their king — Grubnose, he calls himself — wears a saucepan on his head. Clear out that warren and Thornby will feed you for a year. And Thrain the dwarf might finally earn his pies.',
      accept: 'Take Thrain. He\'s eaten enough of our pies to owe us.',
      summary: 'Reeve Haskett of Thornby wants the goblins of the Hollin Warren, and their king Grubnose, dealt with.',
      stages: [
        { text: 'Defeat Grubnose the Goblin-King in the Hollin Warren, in the wood west of Thornby', goal: { type: 'kill', monster: 'grubnose' } },
        { text: 'Tell Reeve Haskett in Thornby', goal: talk(''),
          say: 'Grubnose? Gone? And his saucepan? Ha! Here — the village\'s thanks, and a hearth-stone from my own fire. Every home in Thornby will have a pie for you.' },
      ],
      reward: { gold: 90, xp: 70, food: 25, items: [{ id: 'hearth_stone', n: 1 }] },
      thanks: 'Not a pig lost since. Thornby owes you.',
    },
    {
      id: 'q_mags', name: 'A Smuggler\'s Name', giver: 'npc_mags',
      offer: 'Thorne says I put out the lights. I run brandy, love, not wrecks. Gaff Hollis\'s wreckers are the ones who want ships on the rocks — and Gaff keeps accounts like a bishop. Get me his LEDGER from the Wreckers\' Hole, south of town under the cliffs, and I walk free. I don\'t forget a favour.',
      accept: 'The cave\'s on the cliffs south of Saltcombe. Gaff keeps his books in a strongroom behind a flood-gate. Takes two to open — or one, and a heavy rock.',
      summary: 'Mags Corrigan, smuggler captain of the Black Gull, swears she is innocent. The wreckers\' ledger would prove it.',
      stages: [
        { text: 'Find Gaff Hollis\'s ledger in the Wreckers\' Hole, on the cliffs south of Saltcombe', goal: { type: 'collect', item: 'wreckers_ledger' } },
        { text: 'Bring the ledger to Mags in Saltcombe gaol', goal: { type: 'deliver', npc: '', item: 'wreckers_ledger' },
          say: 'That\'s Gaff\'s hand! "Lights out — Guild boat on the water — keep clear." Not me, you see? Not even Gaff. Somebody with a Guild boat. Thorne\'ll have to let me go now. And the Black Gull\'s yours to sail, for a crown, for luck. If you\'ll have me along, ask me to JOIN.' },
      ],
      reward: { gold: 70, xp: 90, items: [{ id: 'fox_ring', n: 1 }] },
      thanks: 'Free as a gull, thanks to you.',
    },
    {
      id: 'q_abbey', name: 'The Bells of Mistwatch', giver: 'npc_cadoc',
      offer: 'Abbot Morcant bargained with the voice in the Mist, and he lies in the crypt beneath the abbey still, and the brothers will not rest while he walks. Lay him down. Please. I am too old, and too afraid.',
      accept: 'Mind the face of St Aldhelm on the crypt door. He asks before he lets you pass. He always did.',
      summary: 'Brother Cadoc, last monk of Mistwatch Abbey, begs you to lay the dead Abbot Morcant to rest in the crypt beneath the abbey.',
      stages: [
        { text: 'Lay Abbot Morcant to rest, in the crypt beneath Mistwatch Abbey', goal: { type: 'kill', monster: 'abbot_morcant' } },
        { text: 'Tell Brother Cadoc at the abbey gate', goal: talk(''),
          say: 'The bells have stopped. Do you hear? They have stopped. ...Take this. It hung in the bell-tower before the bells were taken. It still rings, for the dead, sometimes.' },
      ],
      reward: { gold: 70, xp: 100, items: [{ id: 'barrow_bell', n: 1 }] },
      thanks: 'The abbey is quiet at last. I shall stay, I think. Someone should keep a light here.',
    },
    {
      id: 'q_jory', name: 'Red Jory\'s Toll', giver: 'npc_garrick',
      offer: 'Red Jory holds the Kestrel Pass with a score of bandits and a tame warg, and robs every cart that crosses — in the Queen\'s name, if you please! Break his band. Then I can tell Her Majesty that I am needed elsewhere, and come with you.',
      accept: 'He camps on the south side of the pass, by the old tower. Mind his arrows — he never misses twice.',
      summary: 'Sir Garrick Oakes of Highcrown wants Red Jory\'s bandits driven out of the Kestrel Pass.',
      stages: [
        { text: 'Defeat Red Jory in the Kestrel Pass', goal: { type: 'kill', monster: 'red_jory' } },
        { text: 'Tell Sir Garrick in Highcrown', goal: talk(''),
          say: 'Red Jory beaten! Splendid! Magnificent! I shall write a ballad. ...Very well, I shall get someone else to write a ballad. And now — the Queen has given me leave. Ask me to JOIN, and the Knights of the Lantern ride with you. Both of us.' },
      ],
      reward: { gold: 150, xp: 110 },
      thanks: 'The pass is safe, the carts run, and I have started the ballad. It has eleven verses so far.',
    },
    {
      id: 'q_notes', name: 'The Scholar\'s Notes', giver: 'npc_elowen',
      offer: 'Twenty years of glyph-rubbings, and a word-list of the lizardfolk tongue — stolen by a CAT. A great spotted cat, grey about the muzzle, who took my whole satchel off to the Old Lantern ruins on the west cape, north of camp. Bring it back and I will translate anything you like. I may even come with you.',
      accept: 'Do not let it eat my journal. Or you. But mostly my journal.',
      summary: 'Elowen Starling, elven scholar of old Ixara, wants her journal back from the great cat that stole it.',
      stages: [
        { text: 'Recover Elowen\'s journal from the Old Lantern ruins on the west cape, north of Landfall', goal: { type: 'collect', item: 'elowen_journal' } },
        { text: 'Bring the journal back to Elowen at Landfall', goal: { type: 'deliver', npc: '', item: 'elowen_journal' },
          say: 'My journal! Only a little chewed. Thank you — truly. I owe you a translation, and I always pay my debts in full, with footnotes. Ask me to JOIN, and I will read you every wall on this isle.' },
      ],
      reward: { xp: 120, items: [{ id: 'scroll_ice_storm', n: 1 }, { id: 'mana_tonic', n: 2 }] },
      thanks: 'I have finished the translation of the Old Lantern\'s inscription. "While we burn, she sleeps." Charming.',
    },
    {
      id: 'q_eggs', name: 'The Eggs of Tzal-Ka', giver: 'npc_ithiss',
      offer: 'A whole clutch, stolen three nights gone! Frogs — great frogs from the south fens, by the mangroves. They take what is round and warm. Bring home my eggs, and you are family to Tzal-Ka. Family hears the hatchlings\' song.',
      accept: 'South, past the mangroves, where the frogs sing at night. Their mother is the size of a hut.',
      summary: 'The lizardfolk Hatch-mother Ithiss of Tzal-Ka wants back a clutch of eggs stolen by the giant frogs of the southern fens.',
      stages: [
        { text: 'Recover the stolen eggs from the frogs\' fen, south of Tzal-Ka by the mangroves', goal: { type: 'collect', item: 'eggs_tzal' } },
        { text: 'Bring the eggs home to Hatch-mother Ithiss in Tzal-Ka', goal: { type: 'deliver', npc: '', item: 'eggs_tzal' },
          say: 'My clutch! All five, and warm! Sss — you hear? That one taps. Here: an egg-tooth from my own first hatchling. Wear it, and every lizard of Tzal-Ka knows you are family. And family hears the RHYME.' },
      ],
      reward: { xp: 120, items: [{ id: 'hatchling_tooth', n: 1 }] },
      thanks: 'The eggs have hatched! Five of them. One is named after you. It bites.',
    },
    {
      id: 'q_ember', name: 'The Sword in the Mountain', giver: 'npc_sinbad',
      offer: 'There\'s a sword in Mount Ashkar, friend. A real one. The sun-priests forged it in the mountain\'s throat — Emberheart, they called it — and left it in their Vault on the north-east slope, behind a stone sphinx that asks questions. And now a drake nests there. You look like the sort who likes questions. And drakes.',
      accept: 'If you find two swords, one\'s mine. That\'s fair.',
      summary: 'Old Sinbad the treasure-hunter tells of Emberheart, a sun-steel sword in the Ember Vault on Mount Ashkar, guarded by a riddling sphinx and a young drake.',
      stages: [
        { text: 'Slay Cinderwing in the Ember Vault, on the slopes of Mount Ashkar', goal: { type: 'kill', monster: 'cinderwing' } },
        { text: 'Tell Old Sinbad at Landfall', goal: talk(''), say: 'You did it! And the sword — oh, look at it. No, keep it, keep it. Just let me hold it once. ...There. Now I\'ve held Emberheart. That\'s worth more than gold.' },
      ],
      reward: { gold: 200, xp: 200 },
    },
  ];
}

// Five chapters over the main quest, each ending at one of its steps; each
// side quest opens with the chapter that brings the company near it.
function buildChapters(game) {
  game.quests.find((q) => q.id === 'q_main').chapter = 'ch_ashore';
  // (side quests open with the chapter that brings the company to them)
  const side = { q_tobias: 'ch_ashore', q_nets: 'ch_ashore', q_warren: 'ch_lights', q_mags: 'ch_lights', q_abbey: 'ch_lights', q_jory: 'ch_lights', q_notes: 'ch_isle', q_eggs: 'ch_isle', q_ember: 'ch_isle' };
  for (const q of game.quests) if (side[q.id]) q.chapter = side[q.id];
  return {
    chapters: [
      { id: 'ch_ashore', name: 'Washed Ashore',
        summary: 'The lone survivor of the Cormorant wakes on the strand at Pebblewick. Up on the Head the Gannet Rock light stands dark, and its keeper has not come down.',
        notes: 'One hero, alone. Pebblewick is safe and its shore gentle; Gannet Rock is a short dungeon for a single level-one hero (crabs, rats, bats, and Old Snapper if they go looking). The shanty that orders the braziers is sung by Hob in the tavern, by Kit and by Tobias himself. Kit joins after "Bring Da Home".',
        cast: [{ npc: 'npc_nan', note: 'Sends the hero up the Rock, then to Saltcombe' }, { npc: 'npc_kit', note: 'The first companion: joins after Bring Da Home' }, { npc: 'npc_tobias', note: 'The keeper, holed up in the lamp-room' }],
        ends: { type: 'stage', quest: 'q_main', stage: 5 } },
      { id: 'ch_lights', name: 'Who Darkened the Lights?',
        summary: 'Someone is putting out the lanterns of Merrow. Magistrate Thorne of Saltcombe will hear an accusation — with the Queen\'s warrant, and with proof. Four names are whispered in the port.',
        notes: 'The mystery (Story → Mysteries) needs three clues of six. Vane is the culprit; Grell, Mags and Cadoc are red herrings, each cleared by a clue. Wren joins in the Guild hall at once and leaves the company when Vane is unmasked. Thrain, Mags and Garrick join after their quests.',
        cast: [{ npc: 'npc_thorne', note: 'The judge: hears the accusation' }, { npc: 'npc_rosamund', note: 'Gives the Queen\'s Warrant' }],
        ends: { type: 'stage', quest: 'q_main', stage: 8 } },
      { id: 'ch_sea', name: 'Across the Glass Sea',
        summary: 'Vane has fled across the Glass Sea. A ship from Saltcombe — bought from Master Cole, or Mags\'s Black Gull for a crown — carries the company to the Teeth, where the Midway Light must be lit again, and on to the jungle isle of Ixara.',
        notes: 'Two ships to choose from. The Glass Wyrm haunts the north of the sea; Gull Skerry\'s hoard is for those with the smuggler\'s chart.',
        cast: [],
        ends: { type: 'stage', quest: 'q_main', stage: 10 } },
      { id: 'ch_isle', name: 'The Jade Isle',
        summary: 'Ixara: jungle, ruins and a mountain that smokes. The lizardfolk of Tzal-Ka remember what the lanterns were for, and what waits in the Sunken Temple of the Sun.',
        notes: 'The rhyme is the Hatch-mother\'s reward for her eggs; Elowen (after her journal) explains it. The temple\'s sanctum needs both plates pressed: two heroes, or the fallen sun-stone and one hero. Liesl\'s locket lies in the Queen\'s offering-bowl. The Sun-Key opens the waygate home to Mistwatch Abbey.',
        cast: [{ npc: 'npc_ssura', note: 'Tells of the Queen and the Tide Stone' }, { npc: 'npc_ithiss', note: 'Knows the hatchlings\' rhyme' }, { npc: 'npc_elowen', note: 'Companion; translates the rhyme' }],
        ends: { type: 'stage', quest: 'q_main', stage: 12 } },
      { id: 'ch_queen', name: 'The Drowned Queen',
        summary: 'The Tide Stone draws the sea back from the Drowned Causeway. On the reef, the palace of drowned Ixara stands open, and at its heart its queen is singing.',
        notes: 'Vane waits in chains by the palace door (repentant: he tells how to fight her), and Wren beside him if she ran. Showing Wren Liesl\'s locket brings her back for the last fight. Slaying Nhalia wins the game (Campaign → How it ends).',
        cast: [],
        ends: { type: 'stage', quest: 'q_main', stage: 14 } },
    ],
  };
}

// The intrigue: who is putting out the lanterns? (game.mysteries)
function buildMysteries() {
  return [{
    id: 'mys_lanterns', name: 'Who Darkened the Lights?',
    intro: 'Someone is putting out the great lanterns of Merrow, and ships die in the Mist beneath them. Magistrate Thorne of Saltcombe will hear an accusation — but only with proof. Four names are whispered about the port.',
    suspects: ['npc_grell', 'npc_vane', 'npc_mags', 'npc_cadoc'],
    culprit: 'npc_vane',
    clues: [
      { flag: 'clue_oil', text: 'The lamp-oil at Gannet Rock was half sea-water — and every cask bore the Lanternwrights\' Guild seal, brought on the Guild\'s own launch by Master Vane himself.' },
      { flag: 'clue_ledger', text: 'The wreckers\' ledger: "Lights out — Guild boat on the water — keep clear." The wreckers only profited from the dark nights; a Guild boat was out on every one. (It clears Mags Corrigan.)' },
      { flag: 'clue_letter', text: 'A letter in Mistwatch Abbey\'s crypt, to "my Lady beneath the Glass", promising the lights will fail, asking for "my little lamp" back — sealed with a Guild master\'s lantern-and-key.' },
      { flag: 'clue_pip', text: 'Pip the Guild apprentice: the Guild launch goes out alone on moonless nights, without a lamp, and comes back with lighter casks — and that same night a lantern dies.' },
      { flag: 'clue_tides', text: 'Master Vane\'s desk: tide-tables with the nights each lantern failed circled in advance, and a child\'s lock of fair hair tied with ribbon.' },
      { flag: 'clue_grell', text: 'The harbourmaster\'s desk: Grell takes bribes to look away from smugglers — but he was drunk under a table at the Drowned Anchor every night a light went out. (It clears Grell.)' },
    ],
    need: 3,
    judge: 'npc_thorne',
    opens: 'case_opened',
    requires: 'warrant_given', // (Thorne cannot touch a guild master without the Queen's warrant)
    requiresText: 'Not without the Queen\'s warrant. The Guild holds a royal charter, and I will not drag an innocent master before this court on a guess and then have the charter thrown at me. Highcrown first — over the Kestrel Pass.',
    right: { text: '"Aurelian Vane." The Magistrate is silent a long moment. "Then God help him, and God help Merrow." Her guards run for the Guild hall — but the Master\'s study is empty, the boathouse open, and the Guild launch a speck on the Glass Sea, steering for the Mist and Ixara beyond.', flag: 'vane_unmasked', reward: { xp: 150, gold: 100 } },
    wrong: { text: 'The Magistrate hears you out, and has the accused taken in irons. That night, out on the Glass Sea, another light goes dark. In the morning Thorne sends for you, white with anger. "You were wrong. Bring me the truth next time — not a guess."', flag: 'accused_wrong', effects: { loseGold: 40 } },
  }];
}

// The company: who joins, why, what they say on the road, and who leaves.
// (recruit.banter and recruit.leaves are said and done by the engine as the
// Company stream wires them up; until then they are quiet data)
function companions(game, P) {
  const npc = (id) => npcById(game, id);
  const set = (id, recruit) => { const e = npc(id); if (e) e.recruit = recruit; return e; };
  set('npc_kit', {
    race: 'human', cls: 'ranger', level: 2, after: 'q_tobias', equip: ['spear', 'sling', 'leather_armor'], arts: ['steady_aim'],
    notYet: 'Not while Da\'s up on that Rock. Bring him home first.',
    offerText: 'Da\'s home. Gran\'s crying into the soup. And I\'m coming with you — somebody nearly killed my da, and I want to see their face.',
    joinText: 'Ha! Wait till I tell Jago. Lead on — and mind your feet on the rocks.',
    banter: [
      { text: 'Kit hums "Gannet Rock" under her breath, then stops. "Gran says if you sing it at sea, the drowned sing back. ...I don\'t believe that. Mostly."', once: true },
      { map: P.saltcombe.id, text: 'Kit grins at the crowds. "Gran says the pickpockets here can steal the buttons off your coat while you\'re wearing it. Hold onto your buttons."', once: true },
      { need: 'vane_unmasked', text: '"Master Vane. He used to give us pennies at the harbour," Kit says quietly. "All the time he was putting out the lights. Da could have died up there."', once: true },
      { map: P.landfall.id, text: 'Kit stares at the jungle. "Trees with hair on. Trees with HAIR ON. Nobody at home is ever going to believe this."', once: true },
      { need: 'tide_low', text: '"Gran says the sea gives back what it takes, in the end," Kit says, watching the water draw away from the causeway. "Let\'s go and make it."', once: true },
    ],
  });
  set('npc_thrain', {
    race: 'dwarf', cls: 'warrior', level: 3, after: 'q_warren', equip: ['battle_axe', 'chain_mail'], arts: ['hold_the_line'],
    notYet: 'Forty goblins and one dwarf: bad sums. Clear out the warren with me first.',
    offerText: 'Saucepan and all, gone! Well. The reeve has run out of pies, and you look like folk who eat well. I\'ll come — if you feed me.',
    joinText: 'Right. Axe sharp, belly full. Where are we going? Not on a boat, I hope.',
    banter: [
      { text: 'Thrain looks out at the sea and shudders. "All that water. Just lying there. Waiting."', once: true },
      { map: P.highcrown.id, text: '"A queen, a castle, and not one decent pie-shop," Thrain mutters. "Humans."', once: true },
      { map: P.abbey.id, text: 'Thrain taps the wall with his axe-butt. "Good stone. Bad dead. Mind the corners."', once: true },
      { need: 'lantern_midway', text: '"I want it noted," says Thrain, gripping the rail, "that I have been on a BOAT. Write it down. In case I sink."', once: true },
      { map: P.ember.id, text: 'Thrain sniffs the hot air and beams. "Now THIS is a forge. Sun-priests, eh? I\'d have liked them."', once: true },
    ],
  });
  const wren = set('npc_wren', {
    race: 'human', cls: 'runesmith', level: 3, equip: ['warhammer', 'leather_armor'], arts: ['first_aid'],
    joinText: 'Really? Oh, Uncle will be so pleased. I mean — I\'m pleased! Let me get my tools.',
    banter: [
      { need: '!vane_unmasked', text: 'Wren is quiet for a long while, turning a little brass lantern-badge over and over in her fingers. When she sees you watching, she puts it away, fast.', once: true },
      { need: 'clue_oil,!vane_unmasked', text: '"Watered oil? From OUR stores?" Wren goes pale. "Only Uncle and I have keys to the stores." She does not say another word for a mile.', once: true },
      { need: 'clue_letter,!vane_unmasked', text: 'Wren reads the abbey letter twice. "My little lamp," she whispers. "That\'s what he used to call Liesl." Then, too brightly: "Lots of people say that. It\'s a common sort of thing to say."', once: true },
      { map: P.abbey.id, need: '!vane_unmasked', text: '"I\'ve been down here before," Wren says — and then, quickly, "I mean, I\'ve HEARD of it. Uncle used to tell me about it."', once: true },
      { need: 'lantern_gannet,!vane_unmasked', text: 'In the night you wake to find Wren\'s bedroll empty. She comes back before dawn with wet boots and says she went for a walk by the water.', once: true },
      { need: 'wren_forgives', text: 'Wren holds Liesl\'s locket tight. "When this is over I\'m going to light every lamp in Merrow myself. Every single one."', once: true },
    ],
    // she runs when her uncle is unmasked, to his side in the Queen's palace; Liesl's locket brings her back
    leaves: {
      need: 'vane_unmasked',
      rejoin: 'wren_forgives',
      notAgain: 'Join you? After what I did? ...No. Not unless you can show me I was wrong to believe him.',
      text: 'Wren goes white. "I knew," she whispers. "Not all of it — not the ships — but I knew he went out at night, and I told him everything we found. He\'s all the family I have." Before anyone can stop her she is gone, running for the harbour.',
      hostile: false,
      goTo: { map: P.palace.id, x: P.palace.wrenAt.x, y: P.palace.wrenAt.y,
        greeting: 'You came. Of course you came. ...She has him chained like a dog, and she laughs at him. She said she had Liesl. She SAID.',
        job: 'I was a lanternwright. Now I don\'t know what I am. Ask me about LIESL, if you must.' },
    },
  });
  delete P.palace.wrenAt; // (only a builder's note)
  if (wren) wren.keywords.push(
    kw('LOCKET|LIESL', '', { cond: { type: 'item', value: 'liesl_locket' }, action: { type: 'set_flag', value: 'wren_forgives' },
      text: 'Liesl\'s locket. From the Queen\'s own offering-bowl. Then she never had her — she never had her at all, and Uncle... Oh, Uncle. ...I\'m coming with you, if you\'ll have me. Ask me to JOIN. For Liesl. For all of them.',
      elseText: 'Liesl had a silver locket. Uncle gave it to — to someone. As a token.' }),
    kw('SORRY|WHY', 'He said she was alive. Down there, in the Queen\'s court. He said if the lights went out she could come home. I wanted it to be true as much as he did.', { cond: { type: 'flag', value: 'vane_unmasked' }, elseText: 'Sorry? For what? You haven\'t done anything. Have you?' }),
  );
  set('npc_mags', {
    race: 'human', cls: 'burglar', level: 4, after: 'q_mags', equip: ['dagger', 'short_bow', 'leather_armor'], arts: ['throw_knife'],
    notYet: 'Join you? From in here? Get me the ledger first, love.',
    offerText: 'Free as a gull! And bored as a cat. You lot look like trouble. I like trouble. Take me along?',
    joinText: 'Lovely. I\'ll mind the purse. Don\'t look at me like that — I\'ll give it back. Mostly.',
    banter: [
      { map: P.saltcombe.id, text: 'Mags waves cheerfully at the gaol as you pass. A guard throws a boot at her. She keeps it.', once: true },
      { need: 'vane_unmasked', text: '"The Guild master," Mags says. "Huh. I\'d have bet my boat on Grell. ...I did bet my boat on Grell, actually. Lost a crown."', once: true },
      { text: '"Rule one of smuggling: never trust a man who\'s kind to you for no reason. Rule two: never trust a woman who tells you rule one."', once: true },
      { map: P.palace.id, text: '"Drowned treasure. Drowned queen. Drowned everything," Mags breathes. "I\'m not touching a thing in here that isn\'t nailed down. ...That\'s a lie. I\'m touching all of it."', once: true },
    ],
  });
  set('npc_garrick', {
    race: 'human', cls: 'paladin', level: 4, after: 'q_jory', equip: ['long_sword', 'chain_mail', 'kite_shield'], arts: ['second_wind'],
    notYet: 'The Queen says I may not leave until Red Jory is beaten. I asked her twice. She threw a slipper.',
    offerText: 'Red Jory beaten, the Queen\'s leave given — the Knights of the Lantern ride again! Both of us. Will you have me?',
    joinText: 'Splendid! Onward! Light in the dark! ...I made that up myself. It\'s our motto.',
    banter: [
      { text: '"The Knights of the Lantern\'s motto is Light in the Dark," says Sir Garrick. "I thought of it. I am also the only knight. And the motto committee."', once: true },
      { map: P.tzalka.id, text: 'Sir Garrick bows very low to the lizardfolk. They bow lower. This goes on for some time.', once: true },
      { need: 'tide_low', text: 'Sir Garrick lowers his visor. "For the Queen. For the lights. For the Cormorant\'s dead."', once: true },
      { map: P.palace.id, text: '"If I fall," Sir Garrick says, "tell the Queen I did not mean to break her favourite vase. It was the dog."', once: true },
    ],
  });
  set('npc_elowen', {
    race: 'elf', cls: 'wizard', level: 5, after: 'q_notes', equip: ['quarterstaff', 'robe'], arts: ['disengage'], stats: { str: 9, dex: 13, int: 17, wis: 14 },
    notYet: 'My journal first. Then, perhaps, adventure.',
    offerText: 'You have read my journal, I expect. Everyone does. Then you know I cannot leave a temple unread. I am coming.',
    joinText: 'Excellent. Do try not to touch anything older than a thousand years. That is everything here.',
    banter: [
      { map: P.temple.id, text: '"Look at these glyphs! Eleventh dynasty! No — twelfth!" Elowen is very nearly dancing. "Don\'t touch anything. Touch THAT. That\'s a door."', once: true },
      { need: 'heard_rhyme', text: '"Wave, moon, star, sun, flame," Elowen murmurs. "It is not a lullaby. It is a key. They taught their children the key to the temple and called it a nursery rhyme. Clever, clever lizards."', once: true },
      { map: P.palace.id, text: 'Elowen runs her fingers over a drowned mosaic. "This was a throne-room once. Gold, and windows, and sun. She sat in the light. I almost understand why she wants it back."', once: true },
      { text: 'Elowen and Thrain argue for an hour about whether the sun-priests or the dwarves invented the arch. Neither wins. Both are wrong, says Elowen, later, privately.', once: true },
    ],
  });
}

// ------------------------------------------------------------ countryside
// Fields round the villages, mills on the rivers, and the last touches.
function addCountryside(game, w, P) {
  const clear = (t) => t.walk && !t.water && !t.feature && !t.sight && t.key !== 'road' && t.key !== 'bridge';
  const put = (id, tpl, x, y, extra = {}) => {
    const p = nearestWhereXY(w, x, y, clear);
    const e = { ...eventFromTemplate(tpl), id, x: p.x, y: p.y, ...extra };
    w.entities.push(e);
    return e;
  };
  const besideWater = (x, y) => nearestWhereXY(w, x, y, (t, xx, yy) => clear(t) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = terrain(getTile(w, xx + dx, yy + dy)); return n.water && !n.deck && n.key !== 'ocean'; }));
  const at = (k) => P[k + 'At'];
  const th = at('thornby'), pw = at('pebblewick'), hc = at('highcrown'), sc = at('saltcombe');
  put('ev_thornby_mill', 'windmill', th.x - 5, th.y - 3, { name: 'Thornby Mill' });
  { const p = besideWater(th.x + 8, th.y - 2); w.entities.push({ ...eventFromTemplate('watermill'), id: 'ev_wend_mill', x: p.x, y: p.y, name: 'Wend Mill' }); }
  put('ev_thornby_hives', 'apiary', th.x + 5, th.y + 5, { name: 'Goody Ashe\'s Hives' });
  put('ev_pebble_fold', 'shepherd', pw.x + 9, pw.y - 7, { name: 'Downs Fold' });
  put('ev_royal_orchard', 'orchard', hc.x - 6, hc.y + 5, { name: 'The Queen\'s Orchard' });
  put('ev_salt_hives', 'apiary', sc.x - 10, sc.y - 4, { name: 'Harbour Hives' });
  put('ev_burnt_farm', 'burnt_farm', th.x - 12, th.y + 6, { name: 'Pike\'s Farm', text: 'A farmstead burned to its stones. Goblin arrows still stick in the door-posts. Hollin Wood looms dark beyond the ruined byre.' });
  // treasure that looks like what it is
  const chest = (id) => game.maps.flatMap((m) => m.entities).find((e) => e.id === id);
  void chest;
  // fields, after everything else, so nothing stands in a furrow
  sowFields(w, { seed: 2207, sites: [pw, th, sc, hc, at('tzalka')].filter(Boolean), keep: [game.settings.start] });
}
void createMap;
