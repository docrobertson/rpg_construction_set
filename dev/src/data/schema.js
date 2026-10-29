// Game module structure: creation, (de)serialisation and migration.
import { MAGIC_SYSTEMS, RACES, CLASSES, ITEMS, SPELLS, MONSTERS } from './defaults.js';
import { deepClone, rleEncode, rleDecode, uid } from '../core/util.js';
import { createMap } from '../world/map.js';
import { generateWorld } from '../world/generate.js';
import { T } from './terrain.js';
import { migrateQuests } from '../game/quests.js';

export const FORMAT = 'rpgcs-game';
export const VERSION = 1;

export function defaultSettings() {
  return {
    start: { map: null, x: 0, y: 0 },
    maxParty: 6,
    startGold: 150,
    startFood: 80,
    startItems: [{ id: 'healing_draught', n: 3 }, { id: 'torch', n: 2 }, { id: 'moonpetal', n: 4 }, { id: 'ember_salt', n: 3 }, { id: 'wyrmroot', n: 3 }, { id: 'spidersilk', n: 3 }],
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
    world = generateWorld(opts.w || 80, opts.h || 80, opts.seed ?? Math.floor(Math.random() * 1e9));
  }
  world.name = 'The World';
  game.maps.push(world);
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
  ensure('classes', CLASSES);
  ensure('items', ITEMS);
  ensure('spells', SPELLS);
  ensure('monsters', MONSTERS);
  if (!game.magic.some((m) => m.id === 'innate')) game.magic.push(deepClone(MAGIC_SYSTEMS.find((m) => m.id === 'innate')));
  // classes from before class specials existed get their default one
  for (const k of game.classes) if (k.special === undefined) k.special = CLASSES.find((d) => d.id === k.id)?.special || null;
  migrateQuests(game); // quests arrived after the first files were saved
  if (!game.maps.length) game.maps.push(createMap({ type: 'world', name: 'The World' }));
  if (!game.settings.start || !game.maps.some((m) => m.id === game.settings.start.map)) game.settings.start = findStart(game.maps[0]);
  return game;
}

export function cloneGame(game) {
  return deserializeGame(serializeGame(game));
}

// lookups
export const byId = (list, id) => list.find((x) => x.id === id);
export function getMap(game, id) { return game.maps.find((m) => m.id === id); }
export function worldMap(game) { return game.maps.find((m) => m.type === 'world') || game.maps[0]; }
