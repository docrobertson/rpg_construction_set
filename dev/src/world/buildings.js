// Buildings in a settlement map, found from the tiles: rooms of indoor floor
// closed in by walls, windows and doors. Used to roof houses over, to label
// them and to let the player click a building to visit whoever keeps it.
import { terrain } from '../data/terrain.js';
import { inBounds, getTile } from './map.js';

const INDOOR = new Set(['floor_wood', 'floor_stone', 'carpet', 'counter', 'table', 'bed', 'hearth', 'shelf', 'anvil', 'barrel', 'throne', 'altar', 'stairs_down', 'stairs_up', 'brazier']);

const KEEPERS = {
  weapons: ['Weaponsmith', 'weapons for sale'], armor: ['Armourer', 'armour for sale'], bowyer: ['Bowyer', 'bows and arrows'],
  provisions: ['Provisioner', 'food, torches and supplies'], reagents: ['Herbalist', 'reagents and potions'],
  inn: ['Inn', 'rest and recover'], tavern: ['Tavern', 'drinks and rumours'], healer: ['Temple', 'healing'],
  lord: ['Hall', 'the lord of this place'], sage: ['Library', 'a sage'], merchant: ['Trading post', 'goods for sale'],
};

function closed(t) { return t.wall || t.door || t.key === 'palisade' || t.key === 'fence'; }

// Each building: { id, tiles: [[x,y]], rim: [[x,y]] (its walls, doors, windows),
// doors: [[x,y]], box: {x0,y0,x1,y1}, keeper (npc entity or null), name, info }
export function findBuildings(map) {
  if (!map || map.type === 'world') return [];
  const { w, h } = map;
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (seen[i]) continue;
    const t = terrain(getTile(map, x, y));
    if (closed(t) || !INDOOR.has(t.key)) continue;
    // flood the room (not through walls or doors)
    const tiles = [], stack = [[x, y]];
    seen[i] = 1;
    let indoor = 0, leaks = false;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      tiles.push([cx, cy]);
      if (INDOOR.has(terrain(getTile(map, cx, cy)).key)) indoor++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(map, nx, ny)) { leaks = true; continue; }
        const j = ny * w + nx;
        if (seen[j]) continue;
        const nt = terrain(getTile(map, nx, ny));
        if (closed(nt)) continue;
        seen[j] = 1;
        stack.push([nx, ny]);
      }
    }
    // open courtyards and whole walled towns are not buildings
    if (leaks || tiles.length > 260 || indoor < tiles.length * 0.6) continue;
    out.push(describe(map, tiles, out.length));
  }
  return out;
}

function describe(map, tiles, n) {
  const inside = new Set(tiles.map(([x, y]) => y * map.w + x));
  const rimSet = new Set(), rim = [], doors = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of tiles) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const k = ny * map.w + nx;
      if (inside.has(k) || rimSet.has(k)) continue;
      const t = terrain(getTile(map, nx, ny));
      if (!closed(t)) continue;
      rimSet.add(k);
      rim.push([nx, ny]);
      if (t.door) doors.push([nx, ny]);
    }
  }
  for (const [x, y] of [...tiles, ...rim]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const keeper = pickKeeper(map, inside);
  const [kind, info] = (keeper && KEEPERS[keeper.role]) || ['House', ''];
  const name = keeper?.shopName || (keeper && KEEPERS[keeper.role] ? `${keeper.name}'s ${kind}` : keeper ? `${keeper.name}'s house` : 'House');
  return { id: `b${n}`, tiles, rim, doors, box: { x0, y0, x1, y1 }, keeper, kind, name, info };
}

// the most important person indoors: a shopkeeper beats a villager
function pickKeeper(map, inside) {
  let best = null, bestScore = -1;
  for (const e of map.entities) {
    if (e.type !== 'npc' || e.hostile || !inside.has(e.y * map.w + e.x)) continue;
    const s = KEEPERS[e.role] ? 2 : 1;
    if (s > bestScore) { best = e; bestScore = s; }
  }
  return best;
}

// building index per tile (interior and rim), or -1
export function buildingMap(map, list) {
  const idx = new Int16Array(map.w * map.h).fill(-1);
  list.forEach((b, i) => { for (const [x, y] of [...b.tiles, ...b.rim]) idx[y * map.w + x] = i; });
  return idx;
}


