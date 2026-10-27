// Map data helpers. Maps are plain objects so they serialise cleanly; `tiles`
// is a Uint8Array at runtime (RLE+base64 when saved).
import { T, terrain } from '../data/terrain.js';
import { uid } from '../core/util.js';

export const MAP_TYPES = {
  world: { label: 'World', fill: 'ocean', lighting: 'day', w: 96, h: 96 },
  town: { label: 'Town', fill: 'grass', lighting: 'day', w: 34, h: 34 },
  castle: { label: 'Castle', fill: 'grass', lighting: 'day', w: 36, h: 36 },
  dungeon: { label: 'Dungeon', fill: 'cave_wall', lighting: 'dark', w: 36, h: 36 },
};

export function createMap({ id, name, type = 'town', w, h, fill, lighting } = {}) {
  const def = MAP_TYPES[type] || MAP_TYPES.town;
  w = w || def.w;
  h = h || def.h;
  const fillKey = fill || def.fill;
  const tiles = new Uint8Array(w * h).fill(T[fillKey] ?? T.grass);
  return {
    id: id || uid('map'),
    name: name || def.label,
    type,
    w, h,
    tiles,
    fill: fillKey,
    lighting: lighting || def.lighting,
    entities: [],
    entry: { x: Math.floor(w / 2), y: h - 2 },
    exit: null,
    encounterRate: type === 'world' ? 1 : type === 'dungeon' ? 1 : 0,
    encounters: [],
    level: 1,
  };
}

export function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.w && y < map.h;
}

export function getTile(map, x, y) {
  if (!inBounds(map, x, y)) return T[map.fill] ?? T.ocean;
  return map.tiles[y * map.w + x];
}

export function setTile(map, x, y, t) {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.w + x;
  if (map.tiles[i] === t) return false;
  map.tiles[i] = t;
  return true;
}

export function tileDef(map, x, y) {
  return terrain(getTile(map, x, y));
}

export function entitiesAt(map, x, y) {
  return map.entities.filter((e) => e.x === x && e.y === y);
}

export function findEntity(map, id) {
  return map.entities.find((e) => e.id === id);
}

export function removeEntity(map, id) {
  const i = map.entities.findIndex((e) => e.id === id);
  if (i >= 0) map.entities.splice(i, 1);
}

export function addEntity(map, ent) {
  if (!ent.id) ent.id = uid(ent.type || 'ent');
  map.entities.push(ent);
  return ent;
}

export function resizeMap(map, w, h, anchor = 'center') {
  const old = map.tiles, ow = map.w, oh = map.h;
  const tiles = new Uint8Array(w * h).fill(T[map.fill] ?? T.grass);
  const ox = anchor === 'center' ? Math.floor((w - ow) / 2) : 0;
  const oy = anchor === 'center' ? Math.floor((h - oh) / 2) : 0;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const nx = x + ox, ny = y + oy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) tiles[ny * w + nx] = old[y * ow + x];
  }
  map.tiles = tiles;
  map.w = w;
  map.h = h;
  for (const e of map.entities) { e.x += ox; e.y += oy; }
  map.entities = map.entities.filter((e) => e.x >= 0 && e.y >= 0 && e.x < w && e.y < h);
  if (map.entry) { map.entry.x = Math.min(w - 1, Math.max(0, map.entry.x + ox)); map.entry.y = Math.min(h - 1, Math.max(0, map.entry.y + oy)); }
}

export function snapshotMap(map) {
  return { tiles: map.tiles.slice(), entities: JSON.stringify(map.entities), w: map.w, h: map.h, entry: { ...map.entry } };
}

export function restoreSnapshot(map, snap) {
  map.tiles = snap.tiles.slice();
  map.w = snap.w;
  map.h = snap.h;
  map.entities = JSON.parse(snap.entities);
  map.entry = { ...snap.entry };
}
