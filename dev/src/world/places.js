// Places: the towns, castles, villages and dungeons of a realm, and the plans
// they are built from. A plan says what a place holds ("an inn, an armourer
// and two homes"; "a crypt of eight rooms with a barrow wight at the end"), so
// the designer can change it and rebuild the place without losing the people
// and things they have written.
//
//   map.plan = { kind, ...kind-specific fields }   (see defaultPlan)
//
// A settlement's plan:
//   { kind, style: town|village|castle|elfhall|dwarfgate|harbour, size: small|medium|large,
//     buildings: { inn, tavern, healer, weapons, armor, bowyer, provisions, reagents,
//                  merchant, sage, lord, shipwright: count }, homes, folk (townsfolk
//     about the streets), guards, walls: stone|palisade|hedge|trees|none,
//     gates: ['n','s','e','w'] (the roads out), seed }
// A dungeon's plan:
//   { kind, style: cave|crypt|fortress|seacave|temple, size, rooms, monsters: [ids],
//     counts: { id: '2-4' } (how many in a band), boss: id|null,
//     treasure: { gold, items: [{ id, n }] } (the hoard in the last room),
//     chests (more chests along the way), wonders (carved pillars, hidden
//     caches and shrines), puzzles (0-3 gated side rooms: a lever, a boulder
//     on a plate, runes), seed }
import { FEATURE_KINDS, T, terrain } from '../data/terrain.js';
import { getTile, setTile, inBounds } from './map.js';
import { placeFeature, generateFromPlan, SETTLEMENT_STYLES, SETTLEMENT_WALLS, DUNGEON_SIZES, KEEPER_ROLES, madeUpWords, isMadeUpName, STAMPS, PATHS, line4 } from './generate.js';
import { findBuildings } from './buildings.js';
import { themeStock, themeOf } from '../game/shops.js'; // (market)
import { RNG, hash2 } from '../core/rng.js';

// ------------------------------------------------------------ the catalogue
export const PLACE_ICONS = { town: '🏘', castle: '🏰', village: '🛖', cave: '🕳', tower: '🗼', fortress: '🏯', elfhall: '🌳', dwarfgate: '⛏', harbour: '⚓', seacave: '🌊', temple: '🛕', dungeon: '🕳', world: '🗺' };

// The key buildings a settlement's plan can ask for, as the player knows them
//   [key, name, icon, what it offers]
export const BUILDINGS = [
  ['inn', 'Inn', '🛏', 'beds for the night: a rest mends the company'],
  ['tavern', 'Tavern', '🍺', 'ale, and rumours'],
  ['healer', 'Temple', '⛪', 'a healer: heal, cure, raise the fallen'],
  ['weapons', 'Weaponsmith', '⚔', 'blades, axes and bows'],
  ['armor', 'Armourer', '🛡', 'armour and shields'],
  ['bowyer', 'Bowyer', '🏹', 'bows and arrows'],
  ['provisions', 'Provisioner', '🧺', 'food, torches and draughts'],
  ['reagents', 'Herbalist', '🌿', 'reagents for rune-craft, and herbs'],
  ['merchant', 'Trading post', '⚖', 'a little of everything'],
  ['sage', 'Sage\'s library', '📜', 'spell scrolls, and old lore'],
  ['lord', 'Lord\'s hall', '👑', 'the ruler of the place, on a throne'],
  ['shipwright', 'Shipyard', '⛵', 'a shipwright who sells a ship'],
];
const BUILDING_KEYS = BUILDINGS.map((b) => b[0]);

export const SETTLEMENT_STYLE_NAMES = { town: 'Town', village: 'Village', castle: 'Castle', elfhall: 'Elven hall', dwarfgate: 'Dwarf hold', harbour: 'Harbour' };
export const DUNGEON_STYLE_NAMES = { cave: 'Cave', crypt: 'Crypt of stone halls', fortress: 'Fortress', seacave: 'Sea cave', temple: 'Jungle temple' };
export const WALL_NAMES = { stone: 'Stone walls', palisade: 'A palisade', hedge: 'A fence', trees: 'A ring of trees', none: 'No walls' };
export const SIZE_NAMES = { small: 'Small', medium: 'Medium', large: 'Large' };

const KIND_STYLE = { town: 'town', castle: 'castle', village: 'village', elfhall: 'elfhall', dwarfgate: 'dwarfgate', harbour: 'harbour', cave: 'cave', tower: 'crypt', fortress: 'fortress', seacave: 'seacave', temple: 'temple' };
const STYLE_KIND = { town: 'town', castle: 'castle', village: 'village', elfhall: 'elfhall', dwarfgate: 'dwarfgate', harbour: 'harbour', cave: 'cave', crypt: 'tower', fortress: 'fortress', seacave: 'seacave', temple: 'temple' };
const DUNGEON_DEFAULTS = {
  cave: { style: 'cave', size: 'medium', rooms: 9, monsters: ['goblin', 'giant_rat', 'skeleton', 'giant_spider'], gold: 140, items: [], chests: 2, wonders: 2 },
  tower: { style: 'crypt', size: 'small', rooms: 6, monsters: ['skeleton', 'bat_swarm', 'giant_rat'], gold: 160, items: [], chests: 1, wonders: 1 },
  fortress: { style: 'fortress', size: 'large', rooms: 11, monsters: ['orc', 'orc_archer', 'skeleton'], gold: 300, items: [], chests: 3, wonders: 2 },
  seacave: { style: 'seacave', size: 'small', rooms: 6, monsters: ['bandit', 'giant_rat', 'bat_swarm'], gold: 180, items: [{ id: 'healing_draught', n: 2 }, { id: 'mana_tonic', n: 1 }], chests: 1, wonders: 1 },
  // (isles) monsters a game lacks are left out when it is built
  temple: { style: 'temple', size: 'medium', rooms: 8, monsters: ['lizardfolk', 'lizard_shaman', 'stone_guardian', 'mist_wraith', 'skeleton'], gold: 260, items: [], chests: 2, wonders: 2 },
};

export const isDungeonKind = (kind) => FEATURE_KINDS[kind]?.mapType === 'dungeon';
export const isPlaceMap = (map) => !!map && map.type !== 'world';
const clone = (o) => JSON.parse(JSON.stringify(o));
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));
const newSeed = () => Math.floor(Math.random() * 1e9);
const seedOf = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h % 1e9; };

// Every place reachable from a world map: { map, portal, world, kind }
// kind is the FEATURE_KINDS key of the site tile (town, castle, cave, ...),
// or the map type for places only reached some other way (deeper levels).
export function placesOf(game) {
  const out = [];
  const seen = new Set();
  for (const world of game.maps.filter((m) => m.type === 'world')) {
    for (const p of world.entities) {
      if (p.type !== 'portal' || p.style !== 'site') continue;
      const map = game.maps.find((m) => m.id === p.target?.map);
      if (!map || seen.has(map.id)) continue;
      seen.add(map.id);
      const key = terrain(getTile(world, p.x, p.y)).key;
      const kind = Object.keys(FEATURE_KINDS).find((k) => FEATURE_KINDS[k].terrain === key) || map.type;
      out.push({ map, portal: p, world, kind });
    }
  }
  for (const map of game.maps) if (map.type !== 'world' && !seen.has(map.id)) out.push({ map, portal: null, world: null, kind: map.type });
  return out;
}

// ------------------------------------------------------------ plans
// A fresh plan for a kind of place (FEATURE_KINDS key)
export function defaultPlan(kind) {
  if (!FEATURE_KINDS[kind]) kind = kind === 'dungeon' ? 'cave' : 'town';
  if (isDungeonKind(kind)) {
    const D = DUNGEON_DEFAULTS[kind] || DUNGEON_DEFAULTS.cave;
    return { kind, style: D.style, size: D.size, rooms: D.rooms, monsters: [...D.monsters], counts: {}, boss: null, treasure: { gold: D.gold, items: clone(D.items) }, chests: D.chests, wonders: D.wonders, seed: newSeed() };
  }
  const style = KIND_STYLE[kind] || 'town';
  const S = SETTLEMENT_STYLES[style];
  const buildings = Object.fromEntries(BUILDING_KEYS.map((k) => [k, 0]));
  for (const r of S.shops) buildings[r]++;
  if (style === 'castle') { buildings.lord = 1; buildings.sage = 1; }
  if (style === 'dwarfgate') buildings.lord = 1;
  if (style === 'harbour') Object.assign(buildings, { tavern: 1, provisions: 1, shipwright: 1 });
  return {
    kind, style, size: 'medium', buildings,
    homes: style === 'harbour' ? 3 : S.houses,
    folk: style === 'castle' || style === 'harbour' ? 3 : 4,
    guards: style === 'castle' ? 4 : style === 'town' || style === 'village' ? 2 : 0,
    walls: SETTLEMENT_WALLS[style] || 'stone',
    gates: style === 'castle' || style === 'dwarfgate' ? ['s'] : style === 'harbour' ? ['e'] : ['n', 's', 'e', 'w'],
    seed: newSeed(),
  };
}

// A plan with every field present and in range (the kind decides which)
export function normalizePlan(plan, kind = plan?.kind) {
  const base = defaultPlan(kind || 'town');
  const p = { ...base, ...(plan || {}), kind: base.kind };
  if (p.seed == null) p.seed = base.seed;
  if (!SIZE_NAMES[p.size]) p.size = base.size;
  if (isDungeonKind(p.kind)) {
    if (!DUNGEON_STYLE_NAMES[p.style]) p.style = base.style;
    p.rooms = clampInt(p.rooms, 2, 24);
    p.monsters = Array.isArray(p.monsters) ? p.monsters.filter(Boolean) : [];
    p.counts = p.counts && typeof p.counts === 'object' ? p.counts : {};
    p.boss = p.boss || null;
    p.treasure = { gold: p.treasure?.gold ?? base.treasure.gold, items: Array.isArray(p.treasure?.items) ? p.treasure.items : [] };
    p.chests = clampInt(p.chests, 0, 12);
    p.wonders = clampInt(p.wonders, 0, 6);
    p.puzzles = clampInt(p.puzzles ?? 0, 0, 3); // (puzzles)
    return p;
  }
  if (!SETTLEMENT_STYLE_NAMES[p.style]) p.style = base.style;
  p.buildings = Object.fromEntries(BUILDING_KEYS.map((k) => [k, clampInt(p.buildings?.[k] ?? 0, 0, 12)]));
  // a harbour's quay comes with its tavern, chandler and shipyard
  if (p.style === 'harbour') for (const k of ['tavern', 'provisions', 'shipwright']) p.buildings[k] = Math.max(1, p.buildings[k]);
  p.homes = clampInt(p.homes, p.style === 'harbour' ? 3 : 0, 40);
  p.folk = clampInt(p.folk, 0, 40);
  p.guards = clampInt(p.guards, 0, 16);
  if (!WALL_NAMES[p.walls]) p.walls = SETTLEMENT_WALLS[p.style] || 'stone';
  p.gates = ['n', 's', 'e', 'w'].filter((g) => (p.gates || []).includes(g));
  if (!p.gates.length) p.gates = ['s'];
  return p;
}

// The plan a map was built from, or a best guess for maps made before plans
// (kind: the site's kind, from placesOf, when known)
export function planOf(map, kind = null) {
  if (!map || map.type === 'world') return null;
  if (map.plan) return normalizePlan(clone(map.plan), map.plan.kind || kind);
  return map.type === 'dungeon' ? inferDungeon(map, kind) : inferSettlement(map, kind);
}

function inferSettlement(map, kind) {
  const style = kind && KIND_STYLE[kind] && !isDungeonKind(kind) ? KIND_STYLE[kind] : styleOfTown(map);
  const plan = defaultPlan(kind && !isDungeonKind(kind) && FEATURE_KINDS[kind] ? kind : STYLE_KIND[style]);
  plan.style = style;
  const c = census(map);
  for (const k of BUILDING_KEYS) plan.buildings[k] = 0;
  for (const p of c.people) if (p.slot in plan.buildings) plan.buildings[p.slot]++;
  plan.homes = c.buildings.filter((b) => b.role === 'home').length;
  plan.folk = c.people.filter((p) => p.slot === 'folk').length;
  plan.guards = c.people.filter((p) => p.slot === 'guard').length;
  plan.walls = wallsOf(map, style);
  plan.gates = gatesOf(map, style);
  const S = SETTLEMENT_STYLES[style];
  plan.size = map.w <= S.w - 4 ? 'small' : map.w >= S.w + 6 ? 'large' : 'medium';
  plan.seed = seedOf(map.id);
  return normalizePlan(plan);
}

function styleOfTown(map) {
  const count = (k) => { let n = 0; const id = T[k]; for (const t of map.tiles) if (t === id) n++; return n; };
  if (count('pier') > 4 || map.entities.some((e) => e.role === 'shipwright')) return 'harbour';
  if (map.fill === 'cave_wall') return 'dwarfgate';
  if (map.type === 'castle') return 'castle';
  let trees = 0, ring = 0;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (Math.min(x, y, map.w - 1 - x, map.h - 1 - y) > 2) continue;
    ring++;
    if (getTile(map, x, y) === T.tree) trees++;
  }
  if (trees > ring * 0.25) return 'elfhall';
  if (count('palisade') > 20) return 'village';
  return 'town';
}

function wallsOf(map, style) {
  if (style === 'dwarfgate') return 'stone';
  if (style === 'harbour') return 'none';
  const tally = {};
  let ring = 0;
  for (const inset of [2, 3]) {
    for (let x = inset; x < map.w - inset; x++) for (const y of [inset, map.h - 1 - inset]) { ring++; const k = terrain(getTile(map, x, y)).key; tally[k] = (tally[k] || 0) + 1; }
    for (let y = inset; y < map.h - inset; y++) for (const x of [inset, map.w - 1 - inset]) { ring++; const k = terrain(getTile(map, x, y)).key; tally[k] = (tally[k] || 0) + 1; }
  }
  const share = (k) => (tally[k] || 0) / Math.max(1, ring / 2);
  if (share('wall_stone') > 0.4) return 'stone';
  if (share('palisade') > 0.4) return 'palisade';
  if (share('fence') > 0.4) return 'hedge';
  let trees = 0, band = 0;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (Math.min(x, y, map.w - 1 - x, map.h - 1 - y) > 2) continue;
    band++;
    if (getTile(map, x, y) === T.tree) trees++;
  }
  return trees > band * 0.25 ? 'trees' : 'none';
}

// the sides a road leaves the map by
function gatesOf(map, style) {
  if (style === 'dwarfgate') return ['s'];
  const roadish = new Set(['cobble', 'road', 'bridge', 'floor_stone']);
  const out = [];
  const third = (n) => [Math.floor(n / 3), Math.ceil((2 * n) / 3)];
  const [x0, x1] = third(map.w), [y0, y1] = third(map.h);
  const any = (pts) => pts.some(([x, y]) => roadish.has(terrain(getTile(map, x, y)).key));
  const row = (y) => Array.from({ length: x1 - x0 }, (_, i) => [x0 + i, y]);
  const col = (x) => Array.from({ length: y1 - y0 }, (_, i) => [x, y0 + i]);
  if (any(row(0))) out.push('n');
  if (any(row(map.h - 1))) out.push('s');
  if (any(col(map.w - 1))) out.push('e');
  if (any(col(0))) out.push('w');
  return out.length ? out : ['s'];
}

function inferDungeon(map, kind) {
  let style;
  if (kind === 'seacave') style = 'seacave';
  else if (map.fill === 'cave_wall') style = 'cave';
  else if (map.fill === 'temple_wall' || map.mood === 'temple') style = 'temple';
  else {
    let stone = 0, crypt = 0;
    for (const t of map.tiles) { if (t === T.floor_stone) stone++; else if (t === T.dungeon_floor) crypt++; }
    style = stone > crypt ? 'fortress' : 'crypt';
  }
  const plan = defaultPlan(kind && isDungeonKind(kind) ? kind : STYLE_KIND[style] === 'tower' ? 'cave' : STYLE_KIND[style]);
  plan.style = style;
  plan.size = map.w <= 30 ? 'small' : map.w >= 42 ? 'large' : 'medium';
  // cave chambers run into each other: their floor space says more
  let walk = 0;
  for (const t of map.tiles) if (terrain(t).walk) walk++;
  plan.rooms = clampInt(style === 'cave' || style === 'seacave' ? Math.max(countRooms(map), Math.round((walk - 60) / 48)) : countRooms(map), 2, 24);
  const mons = map.entities.filter((e) => e.type === 'monster');
  const final = finalChest(map);
  const bosses = mons.filter((m) => m.boss);
  const boss = final ? bosses.sort((a, b) => Math.hypot(a.x - final.x, a.y - final.y) - Math.hypot(b.x - final.x, b.y - final.y))[0] : bosses[0];
  plan.boss = boss?.monster || null;
  plan.monsters = [];
  const tally = {};
  for (const m of mons) {
    if (m.boss || !madeMonster(m)) continue;
    if (!plan.monsters.includes(m.monster)) plan.monsters.push(m.monster);
    (tally[m.monster] ||= {})[m.count] = (tally[m.monster][m.count] || 0) + 1;
  }
  plan.counts = {};
  for (const [id, t] of Object.entries(tally)) {
    const best = Object.entries(t).sort((a, b) => b[1] - a[1])[0][0];
    if (best && best !== '2-4') plan.counts[id] = best;
  }
  plan.treasure = final ? { gold: final.gold ?? 0, items: clone(final.items || []) } : { gold: 0, items: [] };
  plan.chests = map.entities.filter((e) => e.type === 'chest' && e !== final && madeChest(e)).length;
  plan.wonders = map.entities.filter(madeEvent).length;
  plan.puzzles = map.entities.filter((e) => e.made === 'puzzle' && e.type === 'gate').length; // (puzzles)
  plan.seed = seedOf(map.id);
  return normalizePlan(plan);
}

// rooms: open floor at least two squares deep, in separate pieces
function countRooms(map) {
  const { w, h } = map;
  const open = (x, y) => inBounds(map, x, y) && terrain(getTile(map, x, y)).walk;
  const core = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (open(x, y) && open(x + 1, y) && open(x - 1, y) && open(x, y + 1) && open(x, y - 1) && open(x + 1, y + 1) && open(x - 1, y - 1) && open(x + 1, y - 1) && open(x - 1, y + 1)) core[y * w + x] = 1;
  }
  let rooms = 0;
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!core[i] || seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % w, y = (j - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (y + dy) * w + x + dx;
        if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && core[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (size >= 3) rooms++;
  }
  return rooms;
}

const goldValue = (g) => {
  if (typeof g === 'number') return g;
  const m = String(g || '').match(/^(\d+)(?:d(\d+))?/);
  return m ? (m[2] ? (+m[1] * (+m[2] + 1)) / 2 : +m[1]) : 0;
};

// The hoard at the end: by the boss if there is one, else the richest chest
export function finalChest(map) {
  const chests = map.entities.filter((e) => e.type === 'chest' && e.made !== 'puzzle'); // (a puzzle's vault is not the hoard)
  if (!chests.length) return null;
  const boss = map.entities.find((e) => e.type === 'monster' && e.boss);
  if (boss) {
    const near = chests.filter((c) => Math.abs(c.x - boss.x) + Math.abs(c.y - boss.y) <= 3);
    if (near.length) return near[0];
  }
  const value = (c) => (c.items?.length || 0) * 1000 + goldValue(c.gold);
  return chests.slice().sort((a, b) => value(b) - value(a))[0];
}

// What the generator makes in a dungeon, as it made it (the rest is the designer's)
const STD_MONSTER = new Set(['id', 'type', 'x', 'y', 'monster', 'count', 'wander']);
const STD_CHEST = new Set(['id', 'type', 'x', 'y', 'gold', 'items']);
const madeMonster = (m) => !m.boss && Object.keys(m).every((k) => STD_MONSTER.has(k));
const madeBoss = (m) => m.boss && Object.keys(m).every((k) => STD_MONSTER.has(k) || k === 'boss');
const madeChest = (c) => typeof c.gold === 'number' && Object.keys(c).every((k) => STD_CHEST.has(k))
  && (!c.items?.length || (c.items.length === 1 && c.items[0].id === 'healing_draught' && c.items[0].n === 1));
const madeEvent = (e) => e.type === 'event' && /^ev_\d+_[a-z_]+?(_\d+)?$/.test(e.id || '');

// ------------------------------------------------------------ the people of a place
// Who stands where, and in which "slot": the keeper of a building (by role),
// a home's householder ('home'), a guard, one of the townsfolk wandering the
// streets ('folk'), a lord or shipwright — or someone else ('other': people
// the designer placed by hand), with the kind of building they are in.
export function census(map) {
  const bs = findBuildings(map);
  const at = new Map();
  const list = bs.map((b) => {
    const role = b.keeper && b.kind !== 'House' ? b.keeper.role : 'home';
    const out = { b, role, tiles: b.tiles };
    for (const [x, y] of b.tiles) at.set(y * map.w + x, out);
    return out;
  });
  const people = [];
  for (const e of map.entities) {
    if (e.type !== 'npc') continue;
    const b = at.get(e.y * map.w + e.x) || null;
    let slot = 'other';
    if (e.role === 'guard') slot = 'guard';
    else if (e.role === 'lord' || e.role === 'shipwright') slot = e.role;
    else if (e.role === 'sage' && b) slot = 'sage';
    else if (b && b.b.keeper === e) slot = b.role;
    else if (!b && e.role === 'villager' && (e.wander ?? 0) >= 3) slot = 'folk';
    people.push({ e, slot, home: b ? b.role : null });
  }
  return { buildings: list, people, at };
}

// Every id the game points at from somewhere: quest givers and goals, the
// cast of chapters, keyword actions, other things' links
export function referencedIds(game) {
  const out = new Set();
  const walk = (v, skipId) => {
    if (typeof v === 'string') { out.add(v); return; }
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    for (const [k, x] of Object.entries(v)) if (!(skipId && k === 'id')) walk(x);
  };
  walk(game.quests);
  walk(game.story);
  walk(game.settings);
  for (const m of game.maps) for (const e of m.entities || []) walk(e, true);
  return out;
}

const MADE_DESC = /^an? ([a-z]+ )?(weaponsmith|armourer|provisioner|herbalist|innkeeper|healer|barkeep|bowyer|merchant|local|guard|lord|sage|shipwright|villager)$|^a hobbit of the town$/;

// Why a person counts as the designer's own (empty: a made-up townsperson
// the generator can make again)
export function authoredReasons(game, e, refs = referencedIds(game)) {
  const out = [];
  const quests = (game.quests || []).filter((q) => JSON.stringify(q).includes(`"${e.id}"`));
  for (const q of quests) out.push(q.giver === e.id ? `gives “${q.name || 'a quest'}”` : `in “${q.name || 'a quest'}”`);
  const chapters = (game.story?.chapters || []).filter((c) => (c.cast || []).some((x) => x.npc === e.id));
  for (const c of chapters) out.push(`needed in “${c.name || 'a chapter'}”`);
  if (!quests.length && !chapters.length && refs.has(e.id)) out.push('linked from elsewhere');
  if (e.recruit) out.push('can join the company');
  if (e.keywords?.length) out.push('has things to say');
  if (e.rumour) out.push('knows a rumour');
  const w = madeUpWords(e.role);
  if ((e.greeting && e.greeting !== w.greeting) || (e.job && e.job !== w.job) || (e.desc && !MADE_DESC.test(e.desc))) out.push('has words of their own');
  else if (e.name && !isMadeUpName(e.name)) out.push('named by you');
  // (market) a list of wares of the designer's own, a markup, or a theme chosen in the editor
  if (e.shop?.kind && game.items) {
    const def = themeStock(game, themeOf(game, { ...e.shop, stock: [] }));
    const own = e.shop.stock?.length && (e.shop.stock.length !== def.length || e.shop.stock.some((id) => !def.includes(id)));
    if (own || e.shop.priceMod != null) out.push('sells a stock you chose');
    else if (e.shop.chosen) out.push('trades along a theme you chose');
  }
  if (e.ship && (e.ship.name !== 'Seahorse' || e.ship.price !== 450 || e.ship.pitch)) out.push('sells a ship you set out');
  if (e.hostile) out.push('is hostile');
  return out;
}

const ROLE_NAMES = {
  inn: 'innkeeper', tavern: 'barkeep', healer: 'healer', weapons: 'weaponsmith', armor: 'armourer', bowyer: 'bowyer', provisions: 'provisioner',
  reagents: 'herbalist', merchant: 'merchant', sage: 'sage', lord: 'lord', shipwright: 'shipwright', guard: 'guard', villager: 'townsperson', trainer: 'trainer',
};
export const roleName = (role) => ROLE_NAMES[role] || role || 'townsperson';
// the building a slot belongs to, in plain words
const HOUSE_NAMES = {
  inn: 'inn', tavern: 'tavern', healer: 'temple', weapons: 'smithy', armor: 'armoury', bowyer: 'bowyer\'s shop', provisions: 'shop', reagents: 'herb shop',
  merchant: 'trading post', sage: 'library', lord: 'hall', shipwright: 'yard', home: 'home', guard: 'post', folk: 'street',
};

// The people of a place worth listing: everyone the designer has written,
// and every keeper. [{ e, role, reasons, giver }]
export function peopleOfPlace(game, map) {
  const refs = referencedIds(game);
  const out = [];
  for (const e of map.entities) {
    if (e.type !== 'npc') continue;
    const reasons = authoredReasons(game, e, refs);
    const keeper = KEEPER_ROLES.includes(e.role) || ['lord', 'sage', 'shipwright'].includes(e.role);
    if (!reasons.length && !keeper) continue;
    out.push({ e, role: roleName(e.role), reasons, giver: (game.quests || []).some((q) => q.giver === e.id) });
  }
  return out.sort((a, b) => (b.giver - a.giver) || (b.reasons.length - a.reasons.length));
}

// One line about a place for lists: "Inn, tavern, temple and 4 shops · 7 homes · 18 people"
export function placeSummary(game, map, kind) {
  if (map.type === 'world') return `${map.w} × ${map.h} squares`;
  const plan = planOf(map, kind);
  if (!plan) return '';
  if (isDungeonKind(plan.kind)) {
    const boss = plan.boss && (game.monsters || []).find((m) => m.id === plan.boss);
    return [`${plan.rooms} rooms`, boss ? boss.name : null, plan.treasure?.items?.length ? `${plan.treasure.items.length} treasure${plan.treasure.items.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
  }
  const b = plan.buildings;
  const named = ['inn', 'tavern', 'healer', 'lord'].filter((k) => b[k]).map((k) => (k === 'healer' ? 'temple' : k === 'lord' ? 'hall' : k));
  const shops = ['weapons', 'armor', 'bowyer', 'provisions', 'reagents', 'merchant', 'sage', 'shipwright'].reduce((a, k) => a + (b[k] || 0), 0);
  const people = map.entities.filter((e) => e.type === 'npc').length;
  const head = [...named, shops ? `${shops} shop${shops === 1 ? '' : 's'}` : null].filter(Boolean);
  const list = head.length > 1 ? `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}` : head[0] || 'no shops';
  return `${list[0].toUpperCase()}${list.slice(1)} · ${plan.homes} home${plan.homes === 1 ? '' : 's'} · ${people} ${people === 1 ? 'person' : 'people'}`;
}

// ------------------------------------------------------------ building and rebuilding
// A place's map, built to a plan (not yet part of the game): { map, notes }
export function buildPlace(game, plan, opt = {}) {
  plan = normalizePlan(plan);
  const seed = opt.seed ?? plan.seed;
  const { map, missing } = generateFromPlan(game, { ...plan, seed }, { name: opt.name || 'New place', seed });
  return { map, notes: missingNotes(missing) };
}

function missingNotes(missing) {
  if (!missing?.length) return [];
  const tally = {};
  for (const r of missing) tally[r] = (tally[r] || 0) + 1;
  const words = Object.entries(tally).map(([r, n]) => {
    const name = BUILDINGS.find((b) => b[0] === r)?.[1]?.toLowerCase() || (r === 'house' ? 'home' : r);
    return `${n} ${name}${n === 1 ? '' : r === 'house' ? 's' : 's'}`;
  });
  return [`There was no room for ${words.join(', ')}, even on a bigger map. Try fewer, or a larger size.`];
}

// Rebuild a place's map from a plan, in place, keeping its id, name, links
// and the people and things the designer has written. Returns { notes: [] }
// (things the designer should know, e.g. "Hal has no inn now: he waits in
// the square") and a one-line summary.
export function rebuildPlace(game, map, plan) {
  if (!map || map.type === 'world') throw new Error('Only places can be rebuilt from a plan.');
  const old = planOf(map);
  plan = normalizePlan(clone(plan || old), plan?.kind || old?.kind);
  if (isDungeonKind(plan.kind) !== (map.type === 'dungeon')) throw new Error('A town cannot be rebuilt as a dungeon, nor a dungeon as a town.');
  const { map: fresh, missing } = generateFromPlan(game, plan, { name: map.name, seed: plan.seed, level: map.level, where: { replaces: map.id } }); // (market: its shops may take the old ones' themes again)
  const notes = missingNotes(missing);
  const ctx = { game, old: map, fresh, notes, moved: [], refs: referencedIds(game) };
  const entities = map.type === 'dungeon' ? mergeDungeon(ctx, plan) : mergeSettlement(ctx);
  // hand-painted squares go with the old layout
  let locked = 0;
  for (const t of map.tiles) if (t === T.door_locked) locked++;
  if (locked && map.type === 'dungeon') notes.push(`The ${locked} locked door${locked === 1 ? '' : 's'} painted in by hand ${locked === 1 ? 'is' : 'are'} gone: lock the new rooms again in Details if you need ${locked === 1 ? 'it' : 'them'}.`);
  if (fresh.w !== map.w || fresh.h !== map.h) notes.push(`${map.name} is now ${fresh.w} × ${fresh.h} squares (it was ${map.w} × ${map.h})${fresh.w > nominalSize(plan) && !missing.length ? ': it grew to fit everything in' : ''}.`);
  ctx.entities = entities;
  fixLinks(ctx);
  const sameStyle = old && old.style === plan.style;
  map.tiles = fresh.tiles;
  map.w = fresh.w;
  map.h = fresh.h;
  map.fill = fresh.fill;
  map.entry = fresh.entry;
  map.type = fresh.type;
  if (fresh.settlement) map.settlement = fresh.settlement; // (market) the kind of place its shops suit
  if (!sameStyle) map.lighting = fresh.lighting;
  map.entities = entities;
  map.plan = fresh.plan;
  const people = entities.filter((e) => e.type === 'npc').length;
  const summary = map.type === 'dungeon'
    ? `${map.name} rebuilt: ${plan.rooms} rooms${plan.boss ? ', with its boss at the end' : ''}.`
    : `${map.name} rebuilt: ${census(map).buildings.length} buildings and ${people} people (${ctx.kept} of them kept).`;
  return { notes, summary, map };
}

// how big a plan's size makes a place, before it grows to fit what it holds
function nominalSize(plan) {
  if (isDungeonKind(plan.kind)) return DUNGEON_SIZES[plan.size] || 36;
  if (plan.style === 'harbour') return plan.size === 'large' ? 38 : 30;
  const S = SETTLEMENT_STYLES[plan.style] || SETTLEMENT_STYLES.town;
  return Math.max(24, S.w + (plan.size === 'small' ? -6 : plan.size === 'large' ? 8 : 0));
}

// "Borin", "A chest", "The sign": for notes
const thingName = (e) => (e.type === 'npc' ? e.name || 'Someone' : e.name ? e.name : e.type === 'portal' ? 'A passage' : `A ${e.type}`);

// a free square to stand on: walkable, no door, nothing there yet
function freeAt(map, ents, x, y, test = null) {
  if (!inBounds(map, x, y)) return false;
  const t = terrain(getTile(map, x, y));
  if (test ? !test(t, x, y) : !t.walk || t.door || (t.water && !t.deck) || ['stairs_up', 'stairs_down'].includes(t.key)) return false;
  return !ents.some((e) => e.x === x && e.y === y);
}
function nearestFree(map, ents, x, y, test = null) {
  x = Math.max(0, Math.min(map.w - 1, x)); y = Math.max(0, Math.min(map.h - 1, y));
  for (let r = 0; r < Math.max(map.w, map.h); r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!freeAt(map, ents, x + dx, y + dy, test)) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; }
    }
    if (best) return best;
  }
  return { x, y };
}

function mergeSettlement(ctx) {
  const { game, old, fresh, notes, refs } = ctx;
  const was = census(old), now = census(fresh);
  const authored = (e) => authoredReasons(game, e, refs).length > 0;
  const out = [];
  const group = (people) => {
    const by = {};
    for (const p of people) if (p.slot !== 'other') (by[p.slot] ||= []).push(p);
    return by;
  };
  const olds = group(was.people), news = group(now.people);
  // the designer's people take the new places first
  for (const list of Object.values(olds)) list.sort((a, b) => authored(b.e) - authored(a.e));
  const homeless = [];
  let gone = 0, kept = 0;
  for (const slot of new Set([...Object.keys(olds), ...Object.keys(news)])) {
    const o = olds[slot] || [], n = news[slot] || [];
    n.forEach((p, i) => {
      const q = o[i];
      if (!q) { out.push(p.e); return; }
      q.e.x = p.e.x; q.e.y = p.e.y;
      out.push(q.e);
      kept++;
    });
    for (const q of o.slice(n.length)) {
      if (authored(q.e)) homeless.push(q);
      else gone++;
    }
  }
  const sx = fresh.w / old.w, sy = fresh.h / old.h;
  const outdoors = (t, x, y) => t.walk && !t.door && !(t.water && !t.deck) && !now.at.has(y * fresh.w + x) && !['stairs_up', 'stairs_down'].includes(t.key);
  // the square, for people with nowhere else to be
  const square = () => nearestFree(fresh, out, Math.floor(fresh.w / 2) + 1, Math.floor(fresh.h / 2) + 1, outdoors);
  const inBuilding = (role) => {
    for (const nb of now.buildings) {
      if (nb.role !== role) continue;
      const k = nb.b.keeper;
      const ok = (t, x, y) => t.walk && !t.door && nb.b.tiles.some(([a, b]) => a === x && b === y);
      const spot = nearestFree(fresh, out, k ? k.x : nb.b.tiles[0][0], k ? k.y : nb.b.tiles[0][1], ok);
      if (ok(terrain(getTile(fresh, spot.x, spot.y)), spot.x, spot.y) && !out.some((e) => e.x === spot.x && e.y === spot.y)) return spot;
    }
    return null;
  };
  for (const q of homeless) {
    const spot = square();
    q.e.x = spot.x; q.e.y = spot.y;
    out.push(q.e);
    kept++;
    const who = q.e.name || `The ${roleName(q.e.role)}`;
    notes.push(q.slot === 'guard' || q.slot === 'folk'
      ? `${who} (${roleName(q.e.role)}) has no post in the new plan, and waits in the square.`
      : `${who} has no ${HOUSE_NAMES[q.slot] || 'place'} now, and waits in the square.`);
  }
  // everyone and everything else goes back where it was, or into the same
  // kind of building as before
  const others = [...was.people.filter((p) => p.slot === 'other').map((p) => ({ e: p.e, home: p.home })),
    ...old.entities.filter((e) => e.type !== 'npc').map((e) => ({ e, home: was.at.get(e.y * old.w + e.x)?.role || null }))];
  for (const { e, home } of others) {
    let spot = home ? inBuilding(home) : null;
    if (home && !spot) notes.push(`${thingName(e)} was in ${home === 'home' ? 'a home' : `the ${HOUSE_NAMES[home] || home}`}, and there is none now: ${e.type === 'npc' ? 'they wait' : 'it stands'} in the square.`);
    if (!spot && home) spot = square();
    if (!spot) {
      const test = e.type === 'ship' ? (t) => t.ship : outdoors;
      spot = nearestFree(fresh, out, Math.round(e.x * sx), Math.round(e.y * sy), test);
    }
    ctx.moved.push({ e, from: { x: e.x, y: e.y }, to: spot });
    e.x = spot.x; e.y = spot.y;
    out.push(e);
    if (e.type === 'npc') kept++;
  }
  if (gone) notes.push(`${gone} made-up ${gone === 1 ? 'townsperson has' : 'townsfolk have'} gone with the buildings and posts the plan no longer has.`);
  ctx.kept = kept;
  return out;
}

function mergeDungeon(ctx, plan) {
  const { old, fresh } = ctx;
  const oldFinal = finalChest(old);
  const oldExit = old.entities.find((e) => e.type === 'portal' && e.target?.map === 'exit');
  const oldBoss = plan.boss ? old.entities.find((e) => e.type === 'monster' && e.boss && e.monster === plan.boss) : null;
  const newFinal = finalChest(fresh);
  const out = [];
  const used = new Set();
  for (const e of fresh.entities) {
    if (e === newFinal && oldFinal) { out.push(Object.assign(oldFinal, { x: e.x, y: e.y, gold: e.gold, items: e.items })); used.add(oldFinal); continue; }
    if (e.type === 'portal' && e.target?.map === 'exit' && oldExit) { out.push(Object.assign(oldExit, { x: e.x, y: e.y })); used.add(oldExit); continue; }
    if (e.type === 'monster' && e.boss && oldBoss) { out.push(Object.assign(oldBoss, { x: e.x, y: e.y })); used.add(oldBoss); continue; }
    out.push(e);
  }
  const sx = fresh.w / old.w, sy = fresh.h / old.h;
  const near = (a, b, r) => a && b && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= r;
  for (const e of old.entities) {
    if (used.has(e)) continue;
    // what the generator made goes, and comes again from the plan
    if ((e.type === 'monster' && (madeMonster(e) || madeBoss(e))) || (e.type === 'chest' && (e === oldFinal || madeChest(e))) || madeEvent(e) || e.made === 'puzzle') continue;
    if (e.type === 'portal' && e.target?.map === 'exit') continue;
    // the rest is the designer's: by the stairs, by the hoard, or about where it was
    const anchor = near(e, old.entry, 4) ? fresh.entry : oldFinal && near(e, oldFinal, 3) ? newFinal || fresh.entry : { x: Math.round(e.x * sx), y: Math.round(e.y * sy) };
    const spot = nearestFree(fresh, out, anchor.x, anchor.y);
    const wasStairs = getTile(old, e.x, e.y) === T.stairs_down;
    ctx.moved.push({ e, from: { x: e.x, y: e.y }, to: spot });
    e.x = spot.x; e.y = spot.y;
    if (e.type === 'portal' && wasStairs) setTile(fresh, spot.x, spot.y, T.stairs_down);
    out.push(e);
  }
  ctx.kept = out.filter((e) => e.type === 'npc').length;
  return out;
}

// Whatever points at a square of the rebuilt map follows it: the arrival
// points of passages into it, the way back up from deeper levels, the
// party's start, quest goals to reach a spot
function fixLinks(ctx) {
  const { game, old, fresh, moved } = ctx;
  const sx = fresh.w / old.w, sy = fresh.h / old.h;
  const ents = ctx.entities || fresh.entities;
  const remap = (x, y) => {
    const m = moved.find((k) => k.from.x === x && k.from.y === y);
    if (m) return { ...m.to };
    if (old.entry && x === old.entry.x && y === old.entry.y) return { ...fresh.entry };
    return nearestFree(fresh, ents, Math.round(x * sx), Math.round(y * sy), (t) => t.walk && !(t.water && !t.deck));
  };
  for (const m of game.maps) {
    if (m === old) continue;
    for (const e of m.entities || []) {
      if (e.type === 'portal' && e.target?.map === old.id && e.target.x != null && e.target.y != null && e.target.x !== '') Object.assign(e.target, remap(+e.target.x, +e.target.y));
    }
    if (m.exit?.map === old.id && m.exit.x != null) Object.assign(m.exit, remap(m.exit.x, m.exit.y));
  }
  const s = game.settings?.start;
  if (s?.map === old.id) Object.assign(s, remap(s.x, s.y));
  for (const q of game.quests || []) for (const st of q.stages || []) {
    const g = st.goal;
    if (g?.type === 'reach' && g.map === old.id && g.x != null && g.x !== '') Object.assign(g, remap(+g.x, +g.y));
  }
}

// ------------------------------------------------------------ finding spots on the land
const LAND_OPEN = new Set(['grass', 'meadow', 'fields']);
const WOODS = new Set(['forest', 'pines']);
const HIGH = new Set(['mountains', 'peaks']);
const COASTAL = new Set(['harbour', 'seacave']);

// Squares on foot from (x, y): walkable land, bridges and piers
function reachFrom(world, x, y) {
  const { w, h } = world;
  const seen = new Uint8Array(w * h);
  if (!inBounds(world, x, y)) return seen;
  const ok = (i) => { const t = terrain(world.tiles[i]); return t.walk && (!t.water || t.deck); };
  const stack = [y * w + x];
  seen[y * w + x] = 1;
  while (stack.length) {
    const i = stack.pop();
    const cx = i % w, cy = (i - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j] || !ok(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

// distance (in steps) from every square to the nearest square that passes `is`
function distanceTo(world, is) {
  const { w, h } = world;
  const d = new Int16Array(w * h).fill(32000);
  const q = [];
  for (let i = 0; i < w * h; i++) if (is(terrain(world.tiles[i]))) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}

// share of the squares within r of each square that pass `is` (0..1)
function density(world, is, r = 2) {
  const { w, h } = world;
  const sum = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    sum[(y + 1) * (w + 1) + x + 1] = (is(terrain(world.tiles[y * w + x])) ? 1 : 0) + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    const n = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
    out[y * w + x] = n / ((x1 - x0) * (y1 - y0));
  }
  return out;
}

// Found several places on a world map at sensible spots: ground suited to
// each kind (a harbour or sea cave on the coast, a dwarf hold against the
// mountains, an elven hall in the woods, the dark fortress far off in the
// blight; towns and villages on open land), spread apart, and reachable on
// foot from the start unless they belong on the coast. wants: [{ kind, name? }]
// (or { kind, portal }: move a site that is already there, keeping its map —
// after the world is made afresh, say). opt: { seed, start ({ map, x, y }, or
// null: none yet) }. Returns [{ portal, map }].
export function autoPlaceSites(game, world, wants, opt = {}) {
  const rng = new RNG(opt.seed ?? newSeed());
  const { w, h } = world;
  const N = w * h;
  const start0 = 'start' in opt ? opt.start : game.settings?.start;
  let start = start0 && start0.map === world.id && inBounds(world, start0.x, start0.y) && terrain(getTile(world, start0.x, start0.y)).walk ? start0 : null;
  const moving = new Set(wants.map((x) => x.portal).filter(Boolean));
  const taken = world.entities.filter((e) => e.type === 'portal' && e.style === 'site' && !moving.has(e)).map((e) => ({ x: e.x, y: e.y }));
  const dSea = distanceTo(world, (t) => t.water && !t.deck);
  const dDeep = distanceTo(world, (t) => t.key === 'ocean');
  const dHigh = distanceTo(world, (t) => HIGH.has(t.key));
  const dBlight = distanceTo(world, (t) => t.key === 'ash' || t.key === 'lava');
  const open = density(world, (t) => LAND_OPEN.has(t.key));
  const woods = density(world, (t) => WOODS.has(t.key));
  const hills = density(world, (t) => t.key === 'hills');
  const jungle = density(world, (t) => t.key === 'jungle' || t.key === 'vines' || t.key === 'mangrove'); // (isles)
  let land = 0;
  for (let i = 0; i < N; i++) { const t = terrain(world.tiles[i]); if (t.walk && !t.water) land++; }
  // how far apart: the land shared out among all its places
  const spacing = Math.max(5, Math.sqrt(land / Math.max(1, taken.length + wants.length)) * 0.8);
  // where the company can walk to (from the start, or the greatest land)
  let reach = null, walk = null;
  const home = () => {
    if (start) return reachFrom(world, start.x, start.y);
    let best = null, size = 0;
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i]) continue;
      const t = terrain(world.tiles[i]);
      if (!t.walk || t.water) continue;
      const r = reachFrom(world, i % w, Math.floor(i / w));
      let n = 0;
      for (let j = 0; j < N; j++) if (r[j]) { n++; seen[j] = 1; }
      if (n > size) { size = n; best = r; }
    }
    return best || new Uint8Array(N);
  };
  reach = home();
  // steps on foot from the start (or the middle of the home land), for "far off"
  const walkFrom = () => {
    let sx = start?.x, sy = start?.y;
    if (!start) {
      let ax = 0, ay = 0, n = 0;
      for (let i = 0; i < N; i++) if (reach[i]) { ax += i % w; ay += Math.floor(i / w); n++; }
      sx = Math.round(ax / Math.max(1, n)); sy = Math.round(ay / Math.max(1, n));
    }
    const d = new Float32Array(N).fill(-1);
    const s = nearestOf(world, sx, sy, (i) => reach[i]);
    if (s < 0) return d;
    const q = [s];
    d[s] = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (d[j] >= 0 || !reach[j]) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  };
  walk = walkFrom();
  let far = 1;
  for (let i = 0; i < N; i++) if (walk[i] > far) far = walk[i];

  const busy = new Uint8Array(N);
  for (const e of world.entities) if (inBounds(world, e.x, e.y) && !moving.has(e)) busy[e.y * w + e.x] = 1;
  const out = [];
  for (const want of wants) {
    const kind = want.kind;
    if (!FEATURE_KINDS[kind]) continue;
    let best = -1, bestScore = -Infinity;
    // relax the spacing, then the ground, until somewhere will do
    for (let pass = 0; pass < 5 && best < 0; pass++) {
      const minGap = spacing * [1, 0.75, 0.5, 0.3, 0][pass];
      const strict = pass < 3;
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const i = y * w + x;
        const t = terrain(world.tiles[i]);
        if (!t.walk || t.water || t.feature || t.key === 'bridge' || t.key === 'lava') continue;
        if (busy[i]) continue;
        if (start && Math.abs(start.x - x) + Math.abs(start.y - y) < 3) continue;
        const gap = taken.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
        if (gap < Math.max(3, minGap)) continue;
        const coastal = COASTAL.has(kind);
        if (coastal && dSea[i] !== 1) continue;
        if (!coastal && !reach[i] && pass < 4) continue;
        const fit = suits(kind, { i, t, dSea, dDeep, dHigh, dBlight, open, woods, hills, walk, far, reach, jungle }, strict);
        if (fit == null) continue;
        const score = fit + Math.min(1.5, gap / spacing) * 1.2 + rng.float(0, 0.3);
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    if (best < 0) continue;
    const x = best % w, y = Math.floor(best / w);
    let map, portal;
    if (want.portal) {
      portal = want.portal;
      Object.assign(portal, { x, y });
      setTile(world, x, y, T[FEATURE_KINDS[kind].terrain]);
      map = game.maps.find((m) => m.id === portal.target?.map) || null;
      if (map?.exit?.map === world.id) Object.assign(map.exit, { x, y });
    } else {
      const plan = { ...defaultPlan(kind), seed: rng.int(1, 1e9) };
      map = placeFeature(game, world, x, y, kind, want.name || FEATURE_KINDS[kind].label, plan.seed, plan);
      portal = world.entities.find((e) => e.type === 'portal' && e.x === x && e.y === y);
    }
    dressSite(world, x, y, kind, rng);
    busy[best] = 1;
    taken.push({ x, y });
    out.push({ portal, map });
    // the first town of a new land is where the company will be
    if (!start && (kind === 'town' || kind === 'castle')) { start = { map: world.id, x, y }; reach = home(); walk = walkFrom(); far = 1; for (let k = 0; k < N; k++) if (walk[k] > far) far = walk[k]; }
  }
  return out;
}

// A good square for the company to stand on beside a site: open ground,
// south of it if it can be ({ map, x, y })
export function besideSite(world, x, y) {
  for (let r = 1; r < 6; r++) for (const [dx, dy] of [[0, r], [-r, r], [r, r], [-r, 0], [r, 0], [0, -r]]) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(world, nx, ny)) continue;
    const t = terrain(getTile(world, nx, ny));
    if (t.walk && !t.water && !t.feature && !world.entities.some((e) => e.x === nx && e.y === ny)) return { map: world.id, x: nx, y: ny };
  }
  return { map: world.id, x, y };
}

function nearestOf(world, x, y, ok) {
  for (let r = 0; r < Math.max(world.w, world.h); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (inBounds(world, nx, ny) && ok(ny * world.w + nx)) return ny * world.w + nx;
  }
  return -1;
}

// How well a square suits a kind of place (higher is better), or null if not
// at all. strict: the first passes, which insist on the right ground.
function suits(kind, f, strict) {
  const { i, t, dSea, dDeep, dHigh, dBlight, open, woods, hills, walk, far } = f;
  const away = walk[i] >= 0 ? walk[i] / far : 0.5; // 0 at the start, 1 at the far end
  switch (kind) {
    case 'town': return open[i] * 1.6 + (dSea[i] >= 2 && dSea[i] <= 5 ? 0.4 : 0) - (dHigh[i] < 3 ? 0.6 : 0) + (strict && !LAND_OPEN.has(t.key) ? -1 : 0) + (1 - Math.abs(away - 0.35)) * 0.3;
    case 'village': return open[i] * 1.4 + woods[i] * 0.3 - (dHigh[i] < 2 ? 0.5 : 0) + (strict && !LAND_OPEN.has(t.key) && !WOODS.has(t.key) ? -1 : 0);
    case 'castle': return open[i] + hills[i] * 1.2 - (dHigh[i] < 2 ? 0.4 : 0) + (1 - Math.abs(away - 0.4)) * 0.4;
    case 'elfhall':
      if (strict && woods[i] < 0.35) return null;
      return woods[i] * 2 + (WOODS.has(t.key) ? 0.5 : 0) + away * 0.3;
    case 'dwarfgate':
      if (strict && dHigh[i] > 1) return null;
      return (dHigh[i] <= 1 ? 1.5 : 1 / dHigh[i]) + hills[i] * 0.6 + away * 0.3;
    case 'fortress':
      if (strict && away < 0.5) return null;
      return away * 2.2 + (dBlight[i] <= 2 ? 1.2 : 0) + (dHigh[i] <= 3 ? 0.6 : 0) - open[i] * 0.3;
    case 'cave': return (dHigh[i] <= 3 ? 0.7 : 0) + hills[i] * 0.8 + woods[i] * 0.4 + Math.min(away, 0.8) * 0.8 - open[i] * 0.3;
    case 'tower': return away * 1.2 + (dSea[i] <= 3 ? 0.4 : 0) + hills[i] * 0.3;
    case 'harbour':
      if (strict && dDeep[i] > 3) return null;
      return 1 + open[i] + (f.reach[i] ? 1 : -1) - (dHigh[i] < 2 ? 0.6 : 0);
    case 'seacave': return 0.5 + (dHigh[i] <= 2 ? 0.6 : 0) + hills[i] * 0.6 + away * 0.6 + (f.reach[i] ? 0 : 0.6);
    // (isles) deep in the jungle, far from the start
    case 'temple': return (f.jungle?.[i] ?? 0) * 2 + woods[i] * 0.5 + away * 0.8 - open[i] * 0.3;
    default: return open[i];
  }
}

// The ground about a new place, where it does not suit it yet: the blight
// round a dark fortress, a ridge behind a dwarf hold, woods round elves
function dressSite(world, x, y, kind, rng) {
  const near = (keys, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (keys.has(terrain(getTile(world, x + dx, y + dy)).key)) return true;
    return false;
  };
  const seed = rng.int(1, 1e6);
  if (kind === 'fortress' && !near(new Set(['ash', 'lava']), 2)) STAMPS.blight.apply(world, x, y, 4, seed);
  if (kind === 'dwarfgate' && !near(HIGH, 1)) PATHS.ridge.apply(world, line4(x - 3, y - 2, x + 3, y - 2), 1, seed);
  if (kind === 'elfhall' && !near(WOODS, 1)) STAMPS.forest.apply(world, x, y, 3, seed);
  // the squares beside the site's door stay open
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0]]) {
    const t = terrain(getTile(world, x + dx, y + dy));
    if (inBounds(world, x + dx, y + dy) && !t.walk && !t.water && !t.feature) setTile(world, x + dx, y + dy, T.hills);
  }
}

// ------------------------------------------------------------ roads between places
// Lay roads between places on a world map (and bridges over rivers), so the
// broad strokes come with ways between them: a network that joins every
// site and the start, grown one nearest place at a time (so roads meet at
// junctions and existing roads are used), going round mountains, lakes and
// the sea and bridging rivers and narrow straits. Returns the changed bounds
// { x0, y0, x1, y1, unreached: [names] } or null.
export function connectPlaces(game, world, opt = {}) {
  const { w, h } = world;
  const N = w * h;
  const sites = world.entities.filter((e) => e.type === 'portal' && e.style === 'site' && inBounds(world, e.x, e.y));
  const nodes = sites.map((p) => ({ i: p.y * w + p.x, name: p.label || 'a place' }));
  const s = game.settings?.start;
  if (s?.map === world.id && inBounds(world, s.x, s.y) && !nodes.some((n) => n.i === s.y * w + s.x)) nodes.unshift({ i: s.y * w + s.x, name: 'the start', start: true });
  if (nodes.length < 2) return null;
  const seed = opt.seed ?? 1;
  const isNode = new Uint8Array(N);
  for (const n of nodes) isNode[n.i] = 1;
  // what it costs to lay road over each square (Infinity: never)
  const narrow = narrowWater(world);
  const busy = new Uint8Array(N);
  for (const e of world.entities) if (inBounds(world, e.x, e.y) && e.type !== 'portal') busy[e.y * w + e.x] = 1;
  const cost = new Float32Array(N);
  const COST = { road: 0.25, bridge: 0.3, grass: 1, meadow: 1, fields: 1.3, sand: 1.6, desert: 1.9, snow: 1.8, hills: 2.4, forest: 2, pines: 2.6, swamp: 3.2, ash: 1.4, ruins: 1.6 };
  for (let i = 0; i < N; i++) {
    const t = terrain(world.tiles[i]);
    let c;
    if (isNode[i]) c = 0.5;
    else if (t.feature || t.key === 'lava' || HIGH.has(t.key)) c = Infinity;
    else if (t.water && !t.deck) c = narrow[i] ? 6 : Infinity;
    else if (!t.walk) c = Infinity;
    else c = COST[t.key] ?? 1.5;
    // a little unevenness, so roads wander a touch like real ones
    if (isFinite(c) && !isNode[i]) c += hash2(i % w, Math.floor(i / w), seed) * 0.35 + (busy[i] ? 3 : 0);
    cost[i] = c;
  }
  const inTree = new Uint8Array(N);
  inTree[nodes[0].i] = 1;
  const left = new Set(nodes.slice(1).map((n) => n.i));
  const dist = new Float64Array(N);
  const prev = new Int32Array(N);
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let painted = 0;
  const pave = (i) => {
    if (isNode[i]) return;
    inTree[i] = 1;
    const t = terrain(world.tiles[i]);
    const k = t.water && !t.deck ? T.bridge : t.key === 'bridge' ? T.bridge : T.road;
    if (world.tiles[i] !== k) {
      world.tiles[i] = k;
      const x = i % w, y = Math.floor(i / w);
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
      painted++;
    }
  };
  const heap = new Heap();
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.42], [-1, 1, 1.42], [1, -1, 1.42], [-1, -1, 1.42]];
  while (left.size) {
    dist.fill(Infinity);
    prev.fill(-1);
    heap.clear();
    for (let i = 0; i < N; i++) if (inTree[i]) { dist[i] = 0; heap.push(i, 0); }
    let found = -1;
    while (heap.size) {
      const [u, d] = heap.pop();
      if (d > dist[u]) continue;
      if (left.has(u)) { found = u; break; }
      const ux = u % w, uy = (u - ux) / w;
      for (const [dx, dy, m] of DIRS) {
        const nx = ux + dx, ny = uy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const v = ny * w + nx;
        let c = cost[v];
        if (!isFinite(c)) continue;
        // a diagonal step is paved through one of its corners
        if (dx && dy) {
          const c1 = cost[uy * w + nx], c2 = cost[ny * w + ux];
          if (!isFinite(c1) && !isFinite(c2)) continue;
          c = (c + Math.min(c1, c2)) * 0.71;
        } else c *= m;
        // never through another place on the way
        if (isNode[v] && !left.has(v) && !inTree[v]) continue;
        const nd = d + c;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(v, nd); }
      }
    }
    if (found < 0) break;
    // walk back to the network, paving as we go
    const path = [];
    for (let u = found; u >= 0 && !(inTree[u] && u !== found); u = prev[u]) path.push(u);
    const last = path[path.length - 1];
    if (prev[last] >= 0) path.push(prev[last]);
    for (let k = path.length - 1; k > 0; k--) {
      const a = path[k], c = path[k - 1];
      const ax = a % w, ay = (a - ax) / w, cx = c % w, cy = (c - cx) / w;
      if (ax !== cx && ay !== cy) {
        const p = ay * w + cx, q = cy * w + ax;
        pave(cost[p] <= cost[q] ? p : q);
      }
      pave(c);
    }
    pave(path[path.length - 1]);
    inTree[found] = 1;
    left.delete(found);
  }
  const unreached = nodes.filter((n) => left.has(n.i)).map((n) => n.name);
  if (!painted) return unreached.length ? { x0: 0, y0: 0, x1: -1, y1: -1, unreached } : null;
  return { ...b, unreached };
}

// Water a bridge can cross: a river or strait no more than three squares across
function narrowWater(world) {
  const { w, h } = world;
  const wet = (x, y) => inBounds(world, x, y) && (() => { const t = terrain(getTile(world, x, y)); return t.water && !t.deck; })();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!wet(x, y)) continue;
    let a = 0, c = 0;
    for (let k = 1; k < 5 && wet(x - k, y); k++) a++;
    for (let k = 1; k < 5 && wet(x + k, y); k++) a++;
    for (let k = 1; k < 5 && wet(x, y - k); k++) c++;
    for (let k = 1; k < 5 && wet(x, y + k); k++) c++;
    if (Math.min(a, c) + 1 <= 3) out[y * w + x] = 1;
  }
  return out;
}

// a small binary heap of [index, priority]
class Heap {
  constructor() { this.i = []; this.p = []; }
  get size() { return this.i.length; }
  clear() { this.i.length = 0; this.p.length = 0; }
  push(v, pr) {
    const I = this.i, P = this.p;
    let k = I.length;
    I.push(v); P.push(pr);
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (P[up] <= pr) break;
      I[k] = I[up]; P[k] = P[up];
      k = up;
    }
    I[k] = v; P[k] = pr;
  }
  pop() {
    const I = this.i, P = this.p;
    const top = [I[0], P[0]];
    const v = I.pop(), pr = P.pop();
    if (I.length) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= I.length) break;
        if (c + 1 < I.length && P[c + 1] < P[c]) c++;
        if (P[c] >= pr) break;
        I[k] = I[c]; P[k] = P[c];
        k = c;
      }
      I[k] = v; P[k] = pr;
    }
    return top;
  }
}
