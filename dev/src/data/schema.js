// Game module structure: creation, (de)serialisation and migration.
import { MAGIC_GEAR, MAGIC_SYSTEMS, RACES, CLASSES, ITEMS, SPELLS, MONSTERS, GEAR_MAGIC, ABILITIES, WEAPON_KIND_DEFS } from './defaults.js';
import { deepClone, rleEncode, rleDecode, uid } from '../core/util.js';
import { createMap } from '../world/map.js';
import { generateWorld } from '../world/generate.js';
import { T } from './terrain.js';
import { migrateQuests } from '../game/quests.js';
import { nativeOf } from '../game/travel.js';
import { buryTreasures } from '../game/treasure.js';

export const FORMAT = 'rpgcs-game';
export const VERSION = 1;

export function defaultSettings() {
  return {
    start: { map: null, x: 0, y: 0 },
    maxParty: 6,
    startGold: 150,
    startFood: 80,
    startItems: [{ id: 'healing_draught', n: 3 }, { id: 'torch', n: 2 }, { id: 'moonpetal', n: 4 }, { id: 'ember_salt', n: 3 }, { id: 'wyrmroot', n: 3 }, { id: 'spidersilk', n: 3 }, { id: 'silverleaf', n: 3 }, { id: 'bitterwort', n: 2 }, { id: 'hawkweed', n: 2 }],
    food: true,
    lineOfSight: true,
    encounterRate: 1,
    creationPoints: 24,
    startLevel: 1,
    victory: { type: 'none', target: '' },
    pitch: 52,
    cameraV: 2,
    dayNight: true,
    combatMoves: 3,
    loot: true,
    // (tactics) weapon training, heroic health, the last stand, breaking away
    untrainedWeapons: 'penalty', // or 'forbid': only the kinds a class is trained in
    untrainedPenalty: 3,
    heroicHealth: 4,
    dodgeEvery: 3, // heroes in cloth or leather gain +1 armour every this-many levels (0: never)
    lastStand: true,
    breakAway: 0.5, // a foe's chance to land a free strike on one who breaks away, before levels and reflexes (1: always)
    // (tactics II) seasoned foes, high ground
    veterans: 3, // a wandering kind this many levels below the company comes as veterans (0: never; rules.js veteranRise)
  };
}

export function newGame(opts = {}) {
  const game = {
    format: FORMAT,
    version: VERSION,
    magicV: MAGIC_V,
    id: uid('game'),
    meta: {
      title: opts.title || 'Untitled Realm',
      author: opts.author || '',
      description: '',
      intro: 'Long ago, in an age of legend, a shadow fell upon the land...',
      victoryText: 'The shadow is lifted, and songs of your deeds will be sung for an age.',
      created: Date.now(),
      modified: Date.now(),
    },
    settings: defaultSettings(),
    magic: deepClone(MAGIC_SYSTEMS),
    races: deepClone(RACES),
    classes: deepClone(CLASSES),
    items: deepClone(ITEMS),
    spells: deepClone(SPELLS),
    monsters: deepClone(MONSTERS),
    // (tactics) the kinds of weapon and their traits
    weaponKinds: deepClone(WEAPON_KIND_DEFS),
    quests: [],
    // the designer's outline: chapters that group quests (see game/story.js)
    story: { chapters: [] },
    // (company) whodunits: clues, suspects and a judge (see game/company.js)
    mysteries: [],
    maps: [],
  };
  let world;
  if (opts.blank) {
    world = createMap({ type: 'world', w: opts.w || 64, h: opts.h || 64, name: 'The World' });
    // a small starting island so there is somewhere to stand
    const cx = Math.floor(world.w / 2), cy = Math.floor(world.h / 2);
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 5; x <= cx + 5; x++) {
      const d = Math.hypot((x - cx) / 5.5, (y - cy) / 4.5);
      if (d < 1) world.tiles[y * world.w + x] = d > 0.75 ? T.sand : T.grass;
      else if (d < 1.3) world.tiles[y * world.w + x] = T.shallows;
    }
  } else {
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    world = generateWorld(opts.w || 80, opts.h || 80, seed);
    // two or three hoards, their maps given out by the world's encounters
    buryTreasures(game, world, seed);
  }
  world.name = 'The World';
  game.maps.push(world);
  game.settings.charmsV = CHARMS_V; // (born with charms: nothing to migrate)
  game.settings.poolsV = 1;
  game.settings.tacticsV = TACTICS_V; // (born with weapon training: nothing to migrate)
  game.settings.start = findStart(world);
  return game;
}

export function findStart(map) {
  const cx = Math.floor(map.w / 2), cy = Math.floor(map.h / 2);
  for (let r = 0; r < Math.max(map.w, map.h); r++) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const t = map.tiles[y * map.w + x];
      if (t === T.grass || t === T.meadow || t === T.road) return { map: map.id, x, y };
    }
  }
  return { map: map.id, x: cx, y: cy };
}

export function serializeGame(game) {
  const out = { ...game, maps: game.maps.map(serializeMap) };
  out.meta = { ...game.meta, modified: Date.now() };
  return JSON.stringify(out);
}

export function serializeMap(m) {
  const { tiles, ...rest } = m;
  return { ...rest, tilesRLE: rleEncode(tiles) };
}

export function deserializeMap(m) {
  const { tilesRLE, ...rest } = m;
  const map = { ...rest };
  map.tiles = tilesRLE ? rleDecode(tilesRLE, m.w * m.h) : new Uint8Array(m.w * m.h).fill(T.grass);
  map.entities = Array.isArray(map.entities) ? map.entities : [];
  if (!map.entry) map.entry = { x: Math.floor(map.w / 2), y: map.h - 2 };
  if (map.encounterRate == null) map.encounterRate = map.type === 'world' || map.type === 'dungeon' ? 1 : 0;
  if (!map.encounters) map.encounters = [];
  if (!map.lighting) map.lighting = map.type === 'dungeon' ? 'dark' : 'day';
  if (!map.fill) map.fill = map.type === 'world' ? 'ocean' : map.type === 'dungeon' ? 'cave_wall' : 'grass';
  return map;
}

export function deserializeGame(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  if (!data || data.format !== FORMAT) throw new Error('This file is not a Realms Construction Set game.');
  const game = { ...data, maps: (data.maps || []).map(deserializeMap) };
  return migrateGame(game);
}

// Fill in anything missing (older files, hand-edited JSON)
export function migrateGame(game) {
  game.version = VERSION;
  game.id = game.id || uid('game');
  game.meta = { title: 'Untitled Realm', author: '', description: '', intro: '', victoryText: '', ...(game.meta || {}) };
  const oldCamera = !game.settings?.cameraV;
  game.settings = { ...defaultSettings(), ...(game.settings || {}) };
  // the camera used to look almost straight down: bring old games to the new 3D view
  if (oldCamera) {
    if (!(game.settings.pitch < 70)) game.settings.pitch = defaultSettings().pitch;
    game.settings.cameraV = 2;
  }
  const ensure = (key, defs) => {
    if (!Array.isArray(game[key])) game[key] = deepClone(defs);
  };
  ensure('magic', MAGIC_SYSTEMS);
  ensure('races', RACES);
  // humans were once called "Man"
  for (const r of game.races) if (r.id === 'human' && r.name === 'Man') r.name = 'Human';
  // magic gear came to be marked later: built-in pieces gain the mark once
  if (!game.settings.magicGearV) {
    game.settings.magicGearV = 1;
    for (const it of game.items || []) if (MAGIC_GEAR[it.id] != null && it.magical === undefined) { it.magical = true; if (it.glow == null) it.glow = MAGIC_GEAR[it.id]; }
  }
  // hobbits came later: games still on the built-in races gain them once
  // (a realm that has since removed them is left alone)
  if (!game.settings.hobbitsV) {
    game.settings.hobbitsV = 1;
    const builtIn = ['human', 'dwarf', 'elf'].every((id) => game.races.some((r) => r.id === id));
    if (builtIn && !game.races.some((r) => r.id === 'hobbit')) game.races.push(deepClone(RACES.find((r) => r.id === 'hobbit')));
  }
  ensure('classes', CLASSES);
  ensure('items', ITEMS);
  ensure('spells', SPELLS);
  ensure('monsters', MONSTERS);
  migrateCharms(game);
  migratePools(game);
  migrateIsles(game);
  if (!game.magic.some((m) => m.id === 'innate')) game.magic.push(deepClone(MAGIC_SYSTEMS.find((m) => m.id === 'innate')));
  migrateMagic(game);
  // classes from before class specials existed get their default one
  for (const k of game.classes) if (k.special === undefined) k.special = CLASSES.find((d) => d.id === k.id)?.special || null;
  // monsters from before travel costs: the ground they are at home on
  for (const m of game.monsters) if (!Array.isArray(m.native)) m.native = nativeOf({ ...m, native: undefined }).slice();
  migrateQuests(game); // quests arrived after the first files were saved
  // chapters arrived later still
  if (!game.story || typeof game.story !== 'object') game.story = { chapters: [] };
  if (!Array.isArray(game.story.chapters)) game.story.chapters = [];
  if (!game.maps.length) game.maps.push(createMap({ type: 'world', name: 'The World' }));
  migrateCompany(game);
  migrateTactics(game);
  if (!game.settings.start || !game.maps.some((m) => m.id === game.settings.start.map)) game.settings.start = findStart(game.maps[0]);
  return game;
}

// Weapon training and the tactics pass came later (TACTICS_V 1). Older games
// gain the weapon kinds and their traits (World Data → Weapon kinds), the
// built-in callings their heavy-weapon training, and the built-in mail and
// plate, heavy weapons and first foes their new figures — each only while it
// is still as it came: a designer's own pieces and changes are left alone.
// (The new rules themselves — heroic health, the last stand, breaking away
// as a gamble — are Rules settings, on with their defaults.)
//
// (tactics II, TACTICS_V 2) Shields came to block: the built-in shields
// still at their old armour take their new figures (less armour, a chance to
// turn a blow aside); a designer's own are left alone. And a class from
// before training (TACTICS_V 0) that is not a built-in calling as it came
// keeps every weapon it could wield then: heavy weapons too, if it listed a
// kind a heavy weapon of the game belongs to (an old "axes" class keeps its
// battle axe), or listed none.
export const TACTICS_V = 2;
const OLD_FIGURES = {
  chain_mail: { ac: 4 }, scale_mail: { ac: 5 }, plate_armor: { ac: 7 }, truesilver_mail: { ac: 7 }, dragonscale: { ac: 6 },
  goblin: { hit: 4, dmg: '1d6+2' }, wolf: { hit: 4, dmg: '1d6+2' },
};
// the built-in shields as they were before they blocked, and as they are
// now (the two of the sample realm too: its pieces are not in ITEMS)
export const OLD_SHIELDS = {
  buckler: { was: { ac: 1 }, now: { ac: 0, block: 0.1 } }, kite_shield: { was: { ac: 2 }, now: { ac: 0, block: 0.2 } },
  serpent_shield: { was: { ac: 3 }, now: { ac: 1, block: 0.2 } }, gilded_buckler: { was: { ac: 3 }, now: { ac: 0, block: 0.25 } },
};
// Could a class wield a heavy weapon before heavy training existed? Any
// weapon of a kind it listed (or any, with no list): so if the game holds a
// heavy weapon of a kind it lists, or it lists a heavy kind
export function oldHeavyTraining(game, k) {
  const list = k?.weapons || [];
  if (!list.length) return true;
  const kinds = Array.isArray(game.weaponKinds) && game.weaponKinds.length ? game.weaponKinds : WEAPON_KIND_DEFS;
  if (kinds.some((x) => x.heavy && list.includes(x.id))) return true;
  return (game.items || []).some((it) => it.type === 'weapon' && (it.range || 1) <= 1 && list.includes(it.wkind)
    && (it.heavy ?? (!!kinds.find((x) => x.id === it.wkind)?.heavy || !!it.twoHanded)));
}
export function migrateTactics(game) {
  if (!Array.isArray(game.weaponKinds) || !game.weaponKinds.length) game.weaponKinds = deepClone(WEAPON_KIND_DEFS);
  const v = game.settings.tacticsV || 0;
  if (v >= TACTICS_V) return;
  game.settings.tacticsV = TACTICS_V;
  const same = (o, was) => Object.entries(was).every(([key, val]) => o[key] === val);
  if (v < 1) {
    for (const k of game.classes || []) {
      if (k.heavyWeapons !== undefined) continue;
      // (a built-in calling still as it came takes its own; any other keeps what it could wield)
      const d = CLASSES.find((x) => x.id === k.id);
      const asCame = d && JSON.stringify([...(k.weapons || [])].sort()) === JSON.stringify([...(d.weapons || [])].sort());
      k.heavyWeapons = asCame ? d.heavyWeapons : oldHeavyTraining(game, k);
    }
    for (const it of game.items || []) {
      const d = ITEMS.find((x) => x.id === it.id);
      if (!d) continue;
      if (OLD_FIGURES[it.id] && same(it, OLD_FIGURES[it.id])) it.ac = d.ac;
      if (d.heavy && it.heavy === undefined) it.heavy = true;
    }
    for (const m of game.monsters || []) {
      const d = MONSTERS.find((x) => x.id === m.id);
      if (d && OLD_FIGURES[m.id] && same(m, OLD_FIGURES[m.id])) { m.hit = d.hit; m.dmg = d.dmg; }
    }
  }
  if (v < 2) {
    if (game.settings.veterans === undefined) game.settings.veterans = 3;
    // (the built-in beasts' seasoned names: "Dire Wolf", not "Wolf Veteran")
    for (const m of game.monsters || []) {
      const d = MONSTERS.find((x) => x.id === m.id);
      if (d?.vetName && m.vetName === undefined && m.name === d.name) { m.vetName = d.vetName; if (d.vetPlural) m.vetPlural = d.vetPlural; }
    }
    for (const it of game.items || []) {
      const o = OLD_SHIELDS[it.id];
      if (o && it.type === 'shield' && it.block === undefined && same(it, o.was)) Object.assign(it, o.now);
    }
  }
}

// (company) Starting heroes, companions' words and mysteries came later.
// startHeroes is left unset in older games: party creation then makes four
// and lets the player take more or fewer, as it always did.
export function migrateCompany(game) {
  const st = game.settings;
  if (st.startHeroes != null && st.startHeroes !== '') {
    const n = parseInt(st.startHeroes, 10);
    if (n > 0) st.startHeroes = Math.min(8, n); else delete st.startHeroes;
  }
  if (!Array.isArray(game.mysteries)) game.mysteries = [];
  game.mysteries = game.mysteries.filter((my) => my && typeof my === 'object');
  for (const my of game.mysteries) {
    if (!my.id) my.id = uid('mystery');
    if (!Array.isArray(my.suspects)) my.suspects = [];
    if (!Array.isArray(my.clues)) my.clues = [];
    if (!my.right || typeof my.right !== 'object') my.right = {};
    if (!my.wrong || typeof my.wrong !== 'object') my.wrong = {};
  }
  for (const m of game.maps) for (const e of m.entities || []) {
    const r = e.type === 'npc' && e.recruit;
    if (!r) continue;
    if (r.banter != null && !Array.isArray(r.banter)) delete r.banter;
    if (r.leaves != null && (typeof r.leaves !== 'object' || Array.isArray(r.leaves))) delete r.leaves;
  }
}

// Charms came later (a fifth equipment slot and the trinkets worn in it).
// Older games gain the built-in charms once, and their enchanted arms and
// armour the small magic of the same vocabulary (unless the designer gave
// them some). Heroes gain the empty slot as they load (rules.js); a dungeon's
// hoard holds a charm with no marking needed (game/charms.js isHoard).
export const CHARMS_V = 1;
export function migrateCharms(game) {
  if ((game.settings.charmsV || 0) >= CHARMS_V) return;
  game.settings.charmsV = CHARMS_V;
  for (const d of ITEMS) if (d.type === 'charm' && !game.items.some((x) => x.id === d.id)) game.items.push(deepClone(d));
  for (const [id, magic] of Object.entries(GEAR_MAGIC)) {
    const it = game.items.find((x) => x.id === id);
    if (it && it.effects === undefined && it.ability === undefined) Object.assign(it, deepClone(magic));
  }
}

// The isles came later (ISLES_V 1): their folk and beasts, the powers they
// fight with and the gear found there join older games once, so a designer
// can build a tropical land in them. Their habitats are the isles' own, so
// nothing new walks the old lands.
export const ISLES_V = 1;
const ISLE_MONSTERS = ['giant_frog', 'jungle_cat', 'lizardfolk', 'lizard_shaman', 'reef_shark', 'mist_wraith', 'stone_guardian', 'sea_hag', 'naga'];
const ISLE_ABILITIES = ['tongue_lash', 'venom_spit', 'shark_lunge', 'thrash', 'wail', 'constrict', 'hag_curse'];
const ISLE_ITEMS = ['coral_charm', 'jade_idol', 'hookblade', 'lizardhide'];
export function migrateIsles(game) {
  if ((game.settings.islesV || 0) >= ISLES_V) return;
  game.settings.islesV = ISLES_V;
  const add = (list, defs, ids) => { for (const id of ids) { const d = defs.find((x) => x.id === id); if (d && !list.some((x) => x.id === id)) list.push(deepClone(d)); } };
  add(game.monsters, MONSTERS, ISLE_MONSTERS);
  add(game.items, ITEMS, ISLE_ITEMS);
  // (games from before battle abilities get the whole set when they load: see rules.js)
  if (Array.isArray(game.abilities)) add(game.abilities, ABILITIES, ISLE_ABILITIES);
}

// Restoring draughts once refilled any pool, so a cleric drank Mana Tonic for
// Faith. Now each names the pool it refills; older games learn which the
// built-in tonic is and gain a candle for Faith and honey for Voice, stocked
// wherever the tonic is sold. (A designer's own draughts, naming none, still
// refill any pool.)
export function migratePools(game) {
  if (game.settings.poolsV >= 1) return;
  game.settings.poolsV = 1;
  const tonic = game.items.find((x) => x.id === 'mana_tonic');
  if (tonic && tonic.effect === 'mp' && tonic.pool === undefined) tonic.pool = ['arcane'];
  const fresh = ITEMS.filter((d) => (d.id === 'votive_candle' || d.id === 'larks_honey') && !game.items.some((x) => x.id === d.id));
  for (const d of fresh) game.items.push(deepClone(d));
  for (const m of game.maps) for (const e of m.entities || []) {
    const st = e.shop?.stock;
    if (Array.isArray(st) && st.includes('mana_tonic')) for (const d of fresh) if (!st.includes(d.id)) st.push(d.id);
  }
}

// Magic was reworked (MAGIC_V 2): every school got a look of its own, rangers
// traded their scrap of Prayer for Herb-lore, and wizards keep spellbooks that
// scrolls can be copied into. Older games get the new schools, herbs, scrolls
// and spells added; the ranger is changed only while it is still the default one.
export const MAGIC_V = 2;
const OLD_START_ITEMS = '[{"id":"healing_draught","n":3},{"id":"torch","n":2},{"id":"moonpetal","n":4},{"id":"ember_salt","n":3},{"id":"wyrmroot","n":3},{"id":"spidersilk","n":3}]';
function migrateMagic(game) {
  // look fields for schools that predate them (custom schools keep their own)
  for (const m of game.magic) {
    const d = MAGIC_SYSTEMS.find((x) => x.id === m.id);
    if (!d) continue;
    for (const k of ['style', 'resName', 'verb', 'icon']) if (m[k] === undefined && d[k] !== undefined) m[k] = d[k];
  }
  if ((game.magicV || 1) >= MAGIC_V) return;
  game.magicV = MAGIC_V;
  const add = (list, defs) => { for (const d of defs) if (!list.some((x) => x.id === d.id)) list.push(deepClone(d)); };
  add(game.magic, MAGIC_SYSTEMS.filter((m) => m.id === 'herbal'));
  const herbal = new Set(SPELLS.filter((sp) => sp.system === 'herbal').flatMap((sp) => sp.reagents || []));
  const fresh = ITEMS.filter((it) => (it.type === 'reagent' && herbal.has(it.id)) || it.type === 'scroll');
  add(game.items, fresh);
  add(game.spells, SPELLS.filter((sp) => sp.system === 'herbal' || sp.scroll));
  // reagents from before icons: draw them as the defaults do
  for (const it of game.items) {
    const d = ITEMS.find((x) => x.id === it.id && x.type === 'reagent');
    if (d && it.type === 'reagent' && it.icon === undefined) { it.icon = d.icon; it.tint = d.tint; }
  }
  const ranger = game.classes.find((k) => k.id === 'ranger');
  if (ranger && JSON.stringify(ranger.magic) === '[{"system":"divine","rate":0.5}]') {
    const d = CLASSES.find((k) => k.id === 'ranger');
    ranger.magic = deepClone(d.magic);
    if (/Learns a little Prayer\.$/.test(ranger.desc || '')) ranger.desc = d.desc;
  }
  if (JSON.stringify(game.settings.startItems) === OLD_START_ITEMS) game.settings.startItems = deepClone(defaultSettings().startItems);
  // herbalists stock the new herbs too
  const herbs = fresh.filter((it) => it.type === 'reagent').map((it) => it.id);
  for (const map of game.maps) for (const e of map.entities || []) {
    if (e.shop?.kind === 'reagents' && Array.isArray(e.shop.stock) && e.shop.stock.length) e.shop.stock.push(...herbs.filter((id) => !e.shop.stock.includes(id)));
  }
}

export function cloneGame(game) {
  return deserializeGame(serializeGame(game));
}

// lookups
export const byId = (list, id) => list.find((x) => x.id === id);
export function getMap(game, id) { return game.maps.find((m) => m.id === id); }
export function worldMap(game) { return game.maps.find((m) => m.type === 'world') || game.maps[0]; }
