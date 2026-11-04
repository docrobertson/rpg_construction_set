// Game module structure: creation, (de)serialisation and migration.
import { MAGIC_GEAR, MAGIC_SYSTEMS, RACES, CLASSES, ITEMS, SPELLS, MONSTERS, GEAR_MAGIC } from './defaults.js';
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
    quests: [],
    // the designer's outline: chapters that group quests (see game/story.js)
    story: { chapters: [] },
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
  if (!game.settings.start || !game.maps.some((m) => m.id === game.settings.start.map)) game.settings.start = findStart(game.maps[0]);
  return game;
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
