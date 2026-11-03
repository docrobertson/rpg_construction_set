// Procedural generation: chunky "stamps" used by the editor, plus whole-map
// generators for worlds, settlements, dungeons and battle arenas.
import { T, terrain, FEATURE_KINDS } from '../data/terrain.js';
import { getTile, setTile, inBounds, createMap } from './map.js';
import { fbm } from '../core/noise.js';
import { RNG, hash2 } from '../core/rng.js';
import { uid } from '../core/util.js';
import { eventFromTemplate } from '../game/events.js';
import { generateHarbour } from './harbour.js';

const def = (id) => terrain(id);
const isWaterT = (id) => def(id).water && def(id).key !== 'bridge';
const isFeature = (id) => def(id).feature;

class Bounds {
  constructor() { this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity; }
  add(x, y) { if (x < this.x0) this.x0 = x; if (y < this.y0) this.y0 = y; if (x > this.x1) this.x1 = x; if (y > this.y1) this.y1 = y; }
  get empty() { return this.x1 < this.x0; }
}

function put(map, x, y, key, b) {
  const id = typeof key === 'number' ? key : T[key];
  if (setTile(map, x, y, id) && b) b.add(x, y);
}

// Iterate tiles inside a noisy circle. fn(x, y, d) where d ~ 0 at the centre, 1 at the rim.
export function forBlob(map, cx, cy, r, seed, fn, margin = 0, rough = 0.32) {
  const R = Math.ceil(r * (1 + margin + rough)) + 1;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (!inBounds(map, x, y)) continue;
    const dist = Math.hypot(x - cx, y - cy) / Math.max(0.6, r);
    const n = (fbm(x * 0.21 + seed * 0.013, y * 0.21, seed, 3) - 0.5) * 2 * rough;
    const d = dist + n;
    if (d <= 1 + margin) fn(x, y, Math.max(0, d));
  }
}

export function bresenham(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

// "4-connected" line so paths have no diagonal gaps
export function line4(x0, y0, x1, y1) {
  const raw = bresenham(x0, y0, x1, y1);
  const out = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const [px, py] = out[out.length - 1];
    const [x, y] = raw[i];
    if (x !== px && y !== py) out.push([x, py]);
    out.push([x, y]);
  }
  return out;
}

// ---------------------------------------------------------------- stamps
const NATURAL_LAND = new Set(['grass', 'meadow', 'forest', 'pines', 'hills', 'swamp', 'sand', 'desert', 'snow', 'ash', 'mountains', 'peaks']);

function natural(id) { return NATURAL_LAND.has(def(id).key); }

export const STAMPS = {
  island: {
    label: 'Island', icon: '🏝', desc: 'Raise land from the sea, with beaches, meadows and woods.', defaultSize: 7,
    apply(map, cx, cy, r, seed) {
      const b = new Bounds();
      forBlob(map, cx, cy, r, seed, (x, y, d) => {
        const cur = getTile(map, x, y);
        if (isFeature(cur) || def(cur).key === 'road' || def(cur).key === 'bridge') return;
        if (d >= 1) {
          if (def(cur).key === 'ocean') put(map, x, y, 'shallows', b);
          return;
        }
        const n1 = fbm(x * 0.3, y * 0.3, seed + 7, 3);
        const n2 = fbm(x * 0.25, y * 0.25, seed + 19, 3);
        let k = d > 0.8 ? 'sand' : n1 > 0.55 ? 'meadow' : 'grass';
        if (d < 0.75 && r >= 4 && n2 > 0.58) k = d < 0.4 && r >= 7 ? 'pines' : 'forest';
        if (r >= 7 && d < 0.32 && n1 < 0.45) k = 'hills';
        if (r >= 10 && d < 0.16) k = 'mountains';
        put(map, x, y, k, b);
      }, 0.3);
      return b;
    },
  },
  lake: {
    label: 'Lake', icon: '🌊', desc: 'Sink the land into a lake with a sandy shore.', defaultSize: 4,
    apply(map, cx, cy, r, seed) {
      const b = new Bounds();
      forBlob(map, cx, cy, r, seed, (x, y, d) => {
        const cur = getTile(map, x, y);
        if (isFeature(cur)) return;
        if (d < 0.6 && r >= 3) put(map, x, y, 'ocean', b);
        else if (d < 1) put(map, x, y, def(cur).key === 'ocean' ? 'ocean' : 'shallows', b);
        else if (!def(cur).water && natural(cur) && d < 1.12) put(map, x, y, 'sand', b);
      }, 0.15);
      return b;
    },
  },
  forest: {
    label: 'Forest', icon: '🌳', desc: 'Leafy woodland — blocks sight, slows travel.', defaultSize: 4,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y, d) => (d > 0.8 && hash2(x, y, seed) < 0.35 ? null : 'forest')); },
  },
  pines: {
    label: 'Deep Woods', icon: '🌲', desc: 'Dark pine woods ringed by lighter forest.', defaultSize: 5,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y, d) => (d < 0.6 ? 'pines' : d > 0.85 && hash2(x, y, seed) < 0.4 ? null : 'forest')); },
  },
  hills: {
    label: 'Hills', icon: '⛰', desc: 'Rolling hills — slow going but passable.', defaultSize: 4,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y, d) => (d > 0.85 && hash2(x, y, seed) < 0.3 ? null : 'hills'), ['mountains', 'peaks']); },
  },
  mountains: {
    label: 'Mountains', icon: '🏔', desc: 'Impassable peaks with foothills around them.', defaultSize: 4,
    apply(map, cx, cy, r, seed) {
      return paintNatural(map, cx, cy, r, seed, (x, y, d) => {
        if (d < 0.4 && r >= 3 && fbm(x * 0.4, y * 0.4, seed + 3) > 0.45) return 'peaks';
        if (d < 0.78) return 'mountains';
        return 'hills';
      }, [], 0.2);
    },
  },
  swamp: {
    label: 'Swamp', icon: '🐸', desc: 'Fetid marsh — slow, and it may poison the unwary.', defaultSize: 4,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y, d) => (d > 0.85 && hash2(x, y, seed) < 0.4 ? null : 'swamp')); },
  },
  desert: {
    label: 'Desert', icon: '🏜', desc: 'Sand dunes edged by plain sand.', defaultSize: 5,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y, d) => (d < 0.75 ? 'desert' : 'sand')); },
  },
  snow: {
    label: 'Snowfield', icon: '❄', desc: 'Frozen wastes with lonely pines.', defaultSize: 5,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y, d) => (hash2(x, y, seed + 1) < 0.12 ? 'pines' : 'snow'), ['mountains', 'peaks']); },
  },
  blight: {
    label: 'Blighted Land', icon: '🔥', desc: 'Ash and rivers of lava — the land of the Enemy.', defaultSize: 5,
    apply(map, cx, cy, r, seed) {
      return paintNatural(map, cx, cy, r, seed, (x, y, d) => {
        if (d < 0.7 && fbm(x * 0.35, y * 0.35, seed + 11) > 0.62) return 'lava';
        return 'ash';
      }, ['mountains', 'peaks']);
    },
  },
  meadow: {
    label: 'Meadow', icon: '🌼', desc: 'Flowering meadows and open grass.', defaultSize: 4,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, (x, y) => (hash2(x, y, seed) < 0.6 ? 'meadow' : 'grass')); },
  },
  clear: {
    label: 'Clear Land', icon: '🟩', desc: 'Reset land to plain grassland.', defaultSize: 4,
    apply(map, cx, cy, r, seed) { return paintNatural(map, cx, cy, r, seed, () => 'grass', [], 0.15); },
  },
};

function paintNatural(map, cx, cy, r, seed, pick, keep = [], rough) {
  const b = new Bounds();
  forBlob(map, cx, cy, r, seed, (x, y, d) => {
    if (d >= 1) return;
    const cur = getTile(map, x, y);
    const cd = def(cur);
    if (cd.water || cd.feature || cd.key === 'road' || cd.key === 'bridge') return;
    if (keep.includes(cd.key)) return;
    if (map.type !== 'world' && !natural(cur) && !['cobble', 'garden', 'crops'].includes(cd.key)) return;
    const k = pick(x, y, d);
    if (k) put(map, x, y, k, b);
  }, 0, rough);
  return b;
}

// Path stamps: applied along a dragged stroke
export const PATHS = {
  river: {
    label: 'River', icon: '〰', desc: 'Drag to carve a river (impassable on foot — add bridges with Road).',
    apply(map, pts, width = 1) {
      const b = new Bounds();
      for (const [x, y] of pts) {
        for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
          const cur = getTile(map, x + dx, y + dy);
          if (isFeature(cur) || def(cur).key === 'ocean') continue;
          put(map, x + dx, y + dy, def(cur).key === 'road' ? 'bridge' : 'shallows', b);
        }
      }
      return b;
    },
  },
  road: {
    label: 'Road', icon: '🛤', desc: 'Drag to lay a road; it bridges water automatically.',
    apply(map, pts, width = 1) {
      const b = new Bounds();
      for (const [x, y] of pts) {
        for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
          const cur = getTile(map, x + dx, y + dy);
          const cd = def(cur);
          if (cd.feature || cd.key === 'bridge') continue;
          if (cd.water) put(map, x + dx, y + dy, 'bridge', b);
          else put(map, x + dx, y + dy, map.type === 'world' ? 'road' : 'cobble', b);
        }
      }
      return b;
    },
  },
  ridge: {
    label: 'Mountain Ridge', icon: '🗻', desc: 'Drag to raise a mountain range with foothills.',
    apply(map, pts, width = 1, seed = 1) {
      const b = new Bounds();
      const rad = Math.max(1, width);
      const seen = new Set();
      for (const [px, py] of pts) {
        for (let dy = -rad - 1; dy <= rad + 1; dy++) for (let dx = -rad - 1; dx <= rad + 1; dx++) {
          const x = px + dx, y = py + dy;
          const k = y * map.w + x;
          const d = Math.hypot(dx, dy) + (hash2(x, y, seed) - 0.5);
          const cur = getTile(map, x, y);
          const cd = def(cur);
          if (!inBounds(map, x, y) || cd.water || cd.feature || cd.key === 'road' || cd.key === 'bridge') continue;
          if (d <= rad * 0.5 && !seen.has(k)) { put(map, x, y, hash2(x, y, seed + 3) < 0.35 ? 'peaks' : 'mountains', b); seen.add(k); }
          else if (d <= rad + 0.4 && cd.key !== 'peaks') { if (cd.key !== 'mountains') put(map, x, y, 'mountains', b); }
          else if (d <= rad + 1.4 && !['mountains', 'peaks'].includes(cd.key)) put(map, x, y, 'hills', b);
        }
      }
      return b;
    },
  },
  wall: {
    label: 'Stone Wall', icon: '🧱', desc: 'Drag to build a stone wall.',
    apply(map, pts, width = 1) { return simplePath(map, pts, width, 'wall_stone'); },
  },
  palisade: {
    label: 'Palisade', icon: '🪵', desc: 'Drag to build a wooden stockade.',
    apply(map, pts, width = 1) { return simplePath(map, pts, width, 'palisade'); },
  },
  hedge: {
    label: 'Fence', icon: '⛓', desc: 'Drag to build a fence.',
    apply(map, pts, width = 1) { return simplePath(map, pts, width, 'fence'); },
  },
  tunnel: {
    label: 'Tunnel', icon: '🕳', desc: 'Drag to carve a passage through rock.',
    apply(map, pts, width = 1) {
      const floor = map.type === 'dungeon' ? 'cave_floor' : 'floor_stone';
      const b = new Bounds();
      for (const [x, y] of pts) for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
        if (def(getTile(map, x + dx, y + dy)).wall) put(map, x + dx, y + dy, floor, b);
      }
      return b;
    },
  },
};

function simplePath(map, pts, width, key) {
  const b = new Bounds();
  for (const [x, y] of pts) for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) put(map, x + dx, y + dy, key, b);
  return b;
}

// Room stamps for interior maps (click to place a rectangle)
export const ROOMS = {
  house: { label: 'House', icon: '🏠', desc: 'A timber house with a bed and table.', w: 6, h: 5 },
  shop: { label: 'Shop', icon: '🏪', desc: 'A shop with a counter and a merchant.', w: 7, h: 6 },
  inn: { label: 'Inn', icon: '🛏', desc: 'An inn with beds and an innkeeper.', w: 9, h: 7 },
  temple: { label: 'Temple', icon: '⛪', desc: 'A stone temple with an altar and a healer.', w: 7, h: 8 },
  tavern: { label: 'Tavern', icon: '🍺', desc: 'Tables, a hearth and a barkeep.', w: 8, h: 6 },
  hall: { label: 'Stone Hall', icon: '🏛', desc: 'An empty stone-walled room.', w: 8, h: 7 },
  chamber: { label: 'Dungeon Room', icon: '⬛', desc: 'Carve an empty chamber out of rock.', w: 6, h: 5 },
  cavern: { label: 'Cavern', icon: '🕳', desc: 'Carve an irregular cave out of rock.', w: 7, h: 7 },
};

// ---------------------------------------------------------------- world
export const WORLD_SHAPES = {
  continent: { label: 'One great land', water: 0.45 },
  islands: { label: 'Many islands', water: 0.6 },
  twin: { label: 'Two lands across the sea', water: 0.5 },
  coast: { label: 'A coast (sea to the west)', water: 0.33 },
};

export function generateWorld(w, h, seed, opt = {}) {
  const map = createMap({ type: 'world', w, h, name: opt.name || 'The World' });
  // the shape of the land: one continent, a scatter of islands, two lands
  // across a strait, or a coast with the sea to the west
  const shape = WORLD_SHAPES[opt.shape] ? opt.shape : 'continent';
  const water = opt.water ?? WORLD_SHAPES[shape].water;
  const mtn = opt.mountains ?? 0.5;
  const forest = opt.forest ?? 0.5;
  const elev = new Float32Array(w * h);
  const sr = new RNG(seed + 5);
  const across = sr.chance(0.5);
  const twins = across ? [[0.27, 0.4 + sr.float(-0.08, 0.08)], [0.73, 0.6 + sr.float(-0.08, 0.08)]] : [[0.4 + sr.float(-0.08, 0.08), 0.27], [0.6 + sr.float(-0.08, 0.08), 0.73]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = x / w, ny = y / h;
    const dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2;
    const edge = Math.max(Math.abs(dx), Math.abs(dy));
    let e, fall;
    if (shape === 'islands') {
      e = fbm(nx * 7, ny * 7, seed, 5);
      fall = Math.pow(edge, 4) * 0.6;
      e = e - fall * 0.55 + 0.05;
    } else if (shape === 'twin') {
      e = fbm(nx * 4.6, ny * 4.6, seed, 5);
      const d = Math.min(...twins.map(([cx, cy]) => Math.hypot((nx - cx) * 2.7, (ny - cy) * 2.7)));
      fall = Math.pow(d * 0.75 + edge * 0.35, 2.2);
      e = e - fall * 0.55 + 0.12;
    } else if (shape === 'coast') {
      e = fbm(nx * 4.2, ny * 4.2, seed, 5);
      // the sea to the west; the land runs on past the other edges
      fall = Math.pow(Math.max(0, 0.62 - nx) * 2.1, 2) + Math.pow(Math.max(0, edge - 0.85) * 3, 2) * 0.3;
      e = e - fall * 0.7 + 0.1;
    } else {
      e = fbm(nx * 4.2, ny * 4.2, seed, 5);
      fall = Math.pow(edge * 0.6 + Math.hypot(dx, dy) * 0.4, 2.2);
      e = e - fall * 0.55 + 0.12;
    }
    elev[y * w + x] = e;
  }
  // pick sea level so roughly `water` fraction is sea
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const sea = sorted[Math.floor(clamp01(water) * (sorted.length - 1))];
  const top = sorted[sorted.length - 1];
  // elevation cut-offs as quantiles of the land, so "mountains: 50%" means the same on every seed
  const land = sorted.filter((e) => e >= sea);
  const q = (p) => land[Math.max(0, Math.min(land.length - 1, Math.floor(clamp01(p) * (land.length - 1))))];
  const m2 = Math.max(0, mtn) * 2;
  const peakCut = q(1 - 0.03 * m2), mtnCut = q(1 - 0.1 * m2), hillCut = q(1 - 0.22 * m2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = elev[y * w + x];
    if (e < sea) {
      map.tiles[y * w + x] = e > sea - 0.035 ? T.shallows : T.ocean;
      continue;
    }
    const a = (e - sea) / (top - sea + 1e-6); // 0..1 altitude above sea
    const moist = fbm(x * 0.07, y * 0.07, seed + 101, 4);
    // the north (top of the map) is cold, the south warm
    const temp = y / h + (fbm(x * 0.05, y * 0.05, seed + 202, 3) - 0.5) * 0.4;
    let k;
    if (m2 > 0 && e >= mtnCut) k = e >= peakCut ? 'peaks' : 'mountains';
    else if (m2 > 0 && e >= hillCut) k = 'hills';
    else if (a < 0.04) k = temp > 0.2 ? 'sand' : 'snow';
    else if (temp < 0.14) k = moist > 0.52 ? 'pines' : 'snow';
    else if (moist > 0.63 && a < 0.25) k = 'swamp';
    else if (moist > 0.6 - (forest - 0.5) * 0.25) k = temp < 0.35 || moist > 0.66 ? 'pines' : 'forest';
    else if (moist > 0.53 - (forest - 0.5) * 0.2) k = 'forest';
    else if (moist < 0.4 && temp > 0.7) k = moist < 0.34 ? 'desert' : 'sand';
    else k = fbm(x * 0.2, y * 0.2, seed + 303, 2) > 0.58 ? 'meadow' : 'grass';
    map.tiles[y * w + x] = T[k];
  }
  // rivers flowing downhill from the highlands
  const rng = new RNG(seed + 9);
  let riversLeft = opt.rivers ?? 3;
  for (let i = 0; i < 200 && riversLeft > 0; i++) {
    const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
    const k = def(map.tiles[y * w + x]).key;
    if (k !== 'hills' && k !== 'mountains') continue;
    carveRiver(map, elev, x, y, rng);
    riversLeft--;
  }
  if (opt.wonders !== false) scatterWonders(map, seed + 31);
  return map;
}

// ---------------------------------------------------------------- points of interest
const WORLD_LORE = [
  ['Standing Stone', 'A lichen-spotted menhir. Carved at its foot: "Here the river-folk traded silver for salt, before the long winter."'],
  ['Circle of Stones', 'Seven grey stones lean together like gossips. The tallest is cut with a single line: "Seek the high places, and see far."'],
  ['Old Milestone', 'The distances have worn away, but someone has scratched a crude dragon beneath them, and the word RUN.'],
  ['Hero\'s Cairn', 'A cairn of white stones over a fallen champion. "She held the ford alone. Remember her."'],
  ['Weathered Obelisk', 'Runes spiral up a black obelisk, warm to the touch even in the rain: "What was bound shall wake. What wakes may be bound again."'],
];

// Shrines, campfires, lore stones and little encounters scattered over the land
export function scatterWonders(map, seed, opt = {}) {
  const rng = new RNG(seed);
  const scale = Math.max(1, Math.round((map.w * map.h) / 1700));
  const want = opt.list || [
    ...Array(scale).fill('campfire'),
    ...Array(Math.ceil(scale * 0.75)).fill('shrine'),
    ...Array(Math.ceil(scale * 0.6)).fill('lore'),
    'well', 'cache', 'traveller', 'toll_troll', 'bandits',
    'farm', 'fortune', 'fairy_ring', 'arena', 'lighthouse',
  ];
  const shrines = ['shrine_might', 'shrine_ward', 'shrine_vigour', 'shrine_fortune'];
  const placed = [];
  const free = (x, y) => {
    const t = def(getTile(map, x, y));
    if (!t.walk || t.water || t.feature || t.key === 'road' || t.key === 'bridge' || t.door) return false;
    if (map.entities.some((e) => e.x === x && e.y === y)) return false;
    return placed.every((p) => Math.abs(p.x - x) + Math.abs(p.y - y) > 7);
  };
  // a lighthouse stands on the shore; farms and fairy rings on open grass
  const sea = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => def(getTile(map, x + dx, y + dy)).key === 'ocean');
  const grassy = (x, y) => ['grass', 'meadow'].includes(def(getTile(map, x, y)).key);
  const fits = { lighthouse: sea, farm: grassy, fairy_ring: grassy };
  let n = 0;
  for (const kind of want) {
    for (let a = 0; a < (fits[kind] ? 400 : 60); a++) {
      const x = rng.int(2, map.w - 3), y = rng.int(2, map.h - 3);
      if (!free(x, y) || (fits[kind] && !fits[kind](x, y))) continue;
      const tpl = kind === 'shrine' ? rng.pick(shrines) : kind;
      const e = { ...eventFromTemplate(tpl), id: opt.ids ? `${opt.ids}_${n}` : uid('ev'), x, y };
      if (kind === 'lore') { const [name, text] = rng.pick(WORLD_LORE); Object.assign(e, { name, text }); }
      // a farm has its fields about it
      if (kind === 'farm') for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [2, -1], [2, 0]]) if (grassy(x + dx, y + dy) && !map.entities.some((o) => o.x === x + dx && o.y === y + dy)) setTile(map, x + dx, y + dy, T.fields);
      map.entities.push(e);
      placed.push(e);
      n++;
      break;
    }
  }
  return placed;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function carveRiver(map, elev, x, y, rng) {
  const w = map.w;
  const visited = new Set();
  for (let step = 0; step < 200; step++) {
    const id = map.tiles[y * w + x];
    if (isWaterT(id) && step > 0) return;
    if (!['mountains', 'peaks'].includes(def(id).key)) map.tiles[y * w + x] = T.shallows;
    visited.add(y * w + x);
    let best = null, bestE = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(map, nx, ny) || visited.has(ny * w + nx)) continue;
      const e = elev[ny * w + nx] + rng.float(0, 0.02);
      if (e < bestE) { bestE = e; best = [nx, ny]; }
    }
    if (!best) return;
    [x, y] = best;
  }
}

// ---------------------------------------------------------------- settlements
const SHOP_ROLES = {
  weapons: { title: 'Weaponsmith', kind: 'weapons' },
  armor: { title: 'Armourer', kind: 'armor' },
  provisions: { title: 'Provisioner', kind: 'provisions' },
  reagents: { title: 'Herbalist', kind: 'reagents' },
  inn: { title: 'Innkeeper', kind: 'inn' },
  healer: { title: 'Healer', kind: 'healer' },
  tavern: { title: 'Barkeep', kind: 'tavern' },
  bowyer: { title: 'Bowyer', kind: 'weapons' },
  // a trading post with a little of everything (only built from a plan)
  merchant: { title: 'Merchant', kind: 'mixed' },
};

export const SETTLEMENT_STYLES = {
  town: { ground: 'grass', street: 'cobble', wall: 'wall_stone', bwall: 'wall_wood', floor: 'floor_wood', shops: ['inn', 'tavern', 'healer', 'weapons', 'armor', 'provisions', 'reagents'], houses: 7, race: 'human', w: 38, h: 38 },
  village: { ground: 'grass', street: 'road', wall: 'palisade', bwall: 'wall_wood', floor: 'floor_wood', shops: ['provisions', 'inn', 'healer'], houses: 5, race: 'human', w: 30, h: 30 },
  castle: { ground: 'grass', street: 'cobble', wall: 'wall_stone', bwall: 'wall_stone', floor: 'floor_stone', shops: ['healer', 'weapons', 'armor'], houses: 2, race: 'human', w: 38, h: 38 },
  elfhall: { ground: 'meadow', street: 'road', wall: 'tree', bwall: 'wall_wood', floor: 'floor_wood', shops: ['inn', 'healer', 'bowyer', 'reagents'], houses: 4, race: 'elf', w: 34, h: 34 },
  dwarfgate: { ground: 'floor_stone', street: 'floor_stone', wall: 'cave_wall', bwall: 'wall_stone', floor: 'floor_stone', shops: ['tavern', 'healer', 'weapons', 'armor', 'provisions'], houses: 3, race: 'dwarf', w: 36, h: 36, underground: true },
  // laid out by hand in harbour.js: piers, a shipyard and its shipwright
  harbour: { ground: 'grass', street: 'cobble', race: 'human', w: 30, h: 24, shops: [], houses: 0 },
};

const OUTFITS = [0x7a2a2a, 0x2a4a7a, 0x3a6a3a, 0x7a6a2a, 0x5a3a6a, 0x6a4a2a, 0x2a6a6a, 0x8a5a3a];
const HAIRS = [0x2a1a10, 0x5a3a20, 0x8a5a2a, 0xd8b860, 0x9a9a9a, 0x1a1a1a, 0xa83a1a];

export function npcLook(race, rng, extra = {}) {
  return {
    kind: 'humanoid', race,
    body: rng.pick(OUTFITS), hair: rng.pick(race === 'elf' ? [0xe8d890, 0xc8b070, 0x3a2a1a, 0xe0e0e0] : HAIRS),
    ...extra,
  };
}

const ROLE_LOOKS = {
  weapons: { body: 0x5a3a2a, armor: 'leather', weapon: 'hammer' },
  armor: { body: 0x4a4a52, armor: 'chain' },
  provisions: { body: 0x6a7a3a },
  reagents: { body: 0x3a6a4a, hat: 'hood', hatColor: 0x3a6a4a },
  inn: { body: 0x8a5a3a },
  tavern: { body: 0x7a4a2a },
  healer: { body: 0xf0ead8, robe: true, trim: 0xd0a040 },
  guard: { body: 0x2a4a8a, armor: 'chain', hat: 'helm', weapon: 'spear', shield: 0x2a4a8a },
  lord: { body: 0x6a1a8a, robe: true, trim: 0xe8c040, hat: 'crown', cape: 0xa01a2a },
  sage: { body: 0x3a3a7a, robe: true, hat: 'wizard', hatColor: 0x3a3a7a, weapon: 'staff', beard: 0xe0e0e0 },
  shipwright: { body: 0x4a5a6a, armor: 'leather', hat: 'cap', hatColor: 0x2a3a4a, weapon: 'hammer', beard: 0x8a6a4a },
  merchant: { body: 0x7a5a2a, hat: 'cap', hatColor: 0x4a3218, cape: 0x6a2a2a },
};

export function makeNpc(role, race, x, y, rng, extra = {}) {
  const look = npcLook(race, rng, ROLE_LOOKS[role] || {});
  return {
    id: uid('npc'), type: 'npc', x, y,
    name: extra.name || '',
    role, look,
    wander: extra.wander ?? (SHOP_ROLES[role] || role === 'lord' ? 0 : 3),
    desc: extra.desc || '',
    greeting: extra.greeting || '',
    job: extra.job || '',
    keywords: extra.keywords || [],
    // sages sell spell scrolls for wizards' books
    shop: SHOP_ROLES[role] ? { kind: SHOP_ROLES[role].kind, stock: [] } : role === 'sage' ? { kind: 'scrolls', stock: [] } : null,
    ...(role === 'shipwright' ? { ship: { name: 'Seahorse', price: 450 } } : {}),
  };
}

function fillRect(map, x0, y0, w, h, key) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setTile(map, x, y, T[key]);
}

function rectFree(map, x0, y0, w, h, ok) {
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
    if (!inBounds(map, x, y)) return false;
    if (!ok(getTile(map, x, y), x, y)) return false;
  }
  return true;
}

// Build a rectangular building; returns building info including interior rect and door
export function buildRoom(map, x0, y0, w, h, opt) {
  const { wall = 'wall_wood', floor = 'floor_wood', door = 's' } = opt;
  fillRect(map, x0, y0, w, h, wall);
  fillRect(map, x0 + 1, y0 + 1, w - 2, h - 2, floor);
  let dx, dy;
  const mx = x0 + Math.floor(w / 2), my = y0 + Math.floor(h / 2);
  if (door === 's') { dx = mx; dy = y0 + h - 1; }
  else if (door === 'n') { dx = mx; dy = y0; }
  else if (door === 'e') { dx = x0 + w - 1; dy = my; }
  else { dx = x0; dy = my; }
  setTile(map, dx, dy, T.door);
  // windows
  if (wall === 'wall_wood') {
    for (const [wx, wy] of [[x0 + 1, y0], [x0 + w - 2, y0], [x0, y0 + 2], [x0 + w - 1, y0 + 2]]) {
      if (Math.abs(wx - dx) + Math.abs(wy - dy) > 1 && getTile(map, wx, wy) === T[wall]) setTile(map, wx, wy, T.window);
    }
  }
  return { x0, y0, w, h, ix: x0 + 1, iy: y0 + 1, iw: w - 2, ih: h - 2, door: { x: dx, y: dy, side: door } };
}

// Furnish a building interior by role, returns npc spot {x,y}
export function furnish(map, b, role, rng) {
  const { ix, iy, iw, ih, door } = b;
  const back = door.side === 's' ? iy : door.side === 'n' ? iy + ih - 1 : null;
  const inside = (x, y) => x >= ix && y >= iy && x < ix + iw && y < iy + ih;
  const setIf = (x, y, k) => { if (inside(x, y) && !(Math.abs(x - door.x) + Math.abs(y - door.y) <= 1)) setTile(map, x, y, T[k]); };
  let spot = { x: ix + Math.floor(iw / 2), y: iy + Math.floor(ih / 2) };
  const horizontal = door.side === 's' || door.side === 'n';
  if (SHOP_ROLES[role] && role !== 'inn' && role !== 'healer' && role !== 'tavern') {
    // counter across the room, merchant behind it, goods at the back
    if (horizontal) {
      const cy = door.side === 's' ? iy + 1 : iy + ih - 2;
      for (let x = ix; x < ix + iw; x++) if (x !== ix + iw - 1) setIf(x, cy, 'counter');
      const by = back;
      spot = { x: ix + Math.floor(iw / 2), y: door.side === 's' ? iy : iy + ih - 1 };
      for (let x = ix; x < ix + iw; x++) if (x !== spot.x && rng.chance(0.6)) setIf(x, by, rng.chance(0.5) ? 'shelf' : 'barrel');
    } else {
      const cx = door.side === 'e' ? ix + 1 : ix + iw - 2;
      for (let y = iy; y < iy + ih; y++) if (y !== iy + ih - 1) setIf(cx, y, 'counter');
      spot = { x: door.side === 'e' ? ix : ix + iw - 1, y: iy + Math.floor(ih / 2) };
    }
    if (role === 'weapons') setIf(ix + iw - 1, iy + ih - 1, 'anvil');
  } else if (role === 'inn') {
    for (let x = ix; x < ix + iw; x += 2) setIf(x, back ?? iy, 'bed');
    if (ih > 3) setIf(ix + 1, iy + ih - 2, 'table');
    setIf(ix + iw - 1, iy + ih - 1, 'hearth');
    spot = { x: ix + iw - 2, y: iy + ih - 2 };
    setIf(ix + iw - 2, iy + ih - 3, 'counter');
  } else if (role === 'tavern') {
    for (let y = iy + 1; y < iy + ih - 1; y += 2) for (let x = ix + 1; x < ix + iw - 1; x += 3) setIf(x, y, 'table');
    setIf(ix, iy, 'hearth');
    setIf(ix + iw - 1, iy, 'barrel');
    spot = { x: ix + iw - 2, y: iy };
  } else if (role === 'healer') {
    const ax = ix + Math.floor(iw / 2);
    const ay = back ?? iy;
    setIf(ax, ay, 'altar');
    for (let y = iy; y < iy + ih; y++) if (y !== ay && inside(ax, y)) setTile(map, ax, y, T.carpet);
    // the healer stands before the altar, inside the room whichever way the door faces
    spot = { x: ax, y: door.side === 'n' ? ay - 1 : ay + 1 };
    if (iw > 4) { setIf(ix, ay, 'brazier'); setIf(ix + iw - 1, ay, 'brazier'); }
  } else {
    // house
    setIf(ix, back ?? iy, 'bed');
    if (iw > 3) setIf(ix + iw - 1, back ?? iy, rng.chance(0.5) ? 'shelf' : 'hearth');
    if (ih > 2) setIf(ix + 1, iy + ih - 2, 'table');
    spot = { x: ix + Math.floor(iw / 2), y: iy + Math.floor(ih / 2) };
  }
  return spot;
}

// The buildings a plan can ask for that the old styles never made on their
// own: a lord's hall with its throne, a sage's library, a shipwright's loft
function furnishPlan(map, b, role, rng) {
  if (role !== 'lord' && role !== 'sage' && role !== 'shipwright') {
    // (a small house can set its table where its householder would stand)
    const spot = furnish(map, b, role, rng);
    if (def(getTile(map, spot.x, spot.y)).walk) return spot;
    for (let y = b.iy; y < b.iy + b.ih; y++) for (let x = b.ix; x < b.ix + b.iw; x++) {
      const t = def(getTile(map, x, y));
      if (t.walk && !t.door && Math.abs(x - b.door.x) + Math.abs(y - b.door.y) > 1) return { x, y };
    }
    return spot;
  }
  const { ix, iy, iw, ih, door } = b;
  const inside = (x, y) => x >= ix && y >= iy && x < ix + iw && y < iy + ih;
  const set = (x, y, k) => { if (inside(x, y) && Math.abs(x - door.x) + Math.abs(y - door.y) > 1) setTile(map, x, y, T[k]); };
  // the far wall from the door, and the step into the room from it
  const [bx, by, sx, sy] = door.side === 's' ? [door.x, iy, 0, 1] : door.side === 'n' ? [door.x, iy + ih - 1, 0, -1]
    : door.side === 'e' ? [ix, door.y, 1, 0] : [ix + iw - 1, door.y, -1, 0];
  const along = (k, fn) => {
    // every square of the back wall row (or column)
    if (sy) for (let x = ix; x < ix + iw; x++) fn(x, by, k);
    else for (let y = iy; y < iy + ih; y++) fn(bx, y, k);
  };
  if (role === 'lord') {
    // a carpet from the door to the throne, braziers in the far corners
    for (let x = bx, y = by; inside(x, y); x += sx, y += sy) setTile(map, x, y, T.carpet);
    setTile(map, bx, by, T.throne);
    if (sy) { set(ix, by, 'brazier'); set(ix + iw - 1, by, 'brazier'); } else { set(bx, iy, 'brazier'); set(bx, iy + ih - 1, 'brazier'); }
    return { x: bx + sx, y: by + sy };
  }
  if (role === 'sage') {
    along('shelf', (x, y) => { if (x !== bx || y !== by) set(x, y, rng.chance(0.85) ? 'shelf' : 'brazier'); });
    set(bx + sx * 2 + (sy ? 1 : 0), by + sy * 2 + (sx ? 1 : 0), 'table');
    return { x: bx + sx, y: by + sy };
  }
  // the shipwright's loft: timber, tools and tar
  set(ix, iy, 'barrel'); set(ix + iw - 1, iy, 'anvil'); set(ix, iy + ih - 1, 'cargo');
  return { x: ix + Math.floor(iw / 2), y: iy + Math.floor(ih / 2) };
}

// Plans: see world/places.js. These are the generator's side of one.
const PLAN_ORDER = ['lord', 'inn', 'tavern', 'healer', 'weapons', 'armor', 'bowyer', 'provisions', 'reagents', 'merchant', 'sage', 'shipwright'];
const WALL_TILES = { stone: 'wall_stone', palisade: 'palisade', hedge: 'fence', trees: 'tree', none: null };
const BIG = new Set(['inn', 'tavern', 'healer']);
export const SETTLEMENT_WALLS = { town: 'stone', village: 'palisade', castle: 'stone', elfhall: 'trees', dwarfgate: 'stone', harbour: 'none' };

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));

// What a plan asks of a settlement, in the generator's terms
function settlementSpec(kind, plan) {
  const S = SETTLEMENT_STYLES[kind] || SETTLEMENT_STYLES.town;
  const b = plan.buildings || {};
  const n = (k) => clampInt(b[k], 0, 12);
  let lords = n('lord'), sages = n('sage');
  // a castle's first lord sits in its keep (with a sage, if there is one); a
  // dwarf king in the hall at the head of the hold
  const keep = kind === 'castle' && lords > 0;
  const hall = kind === 'dwarfgate' && lords > 0;
  if (keep || hall) lords--;
  const keepSage = keep && sages > 0;
  if (keepSage) sages--;
  const roles = [];
  const push = (role, k) => { for (let i = 0; i < k; i++) roles.push(role); };
  for (const r of PLAN_ORDER) push(r, r === 'lord' ? lords : r === 'sage' ? sages : n(r));
  push('house', clampInt(plan.homes, 0, 40));
  const guards = clampInt(plan.guards, 0, 16);
  const walls = kind === 'dwarfgate' || kind === 'harbour' ? null : plan.walls in WALL_TILES ? plan.walls : SETTLEMENT_WALLS[kind] || 'stone';
  let gates = ['s', 'n', 'w', 'e'].filter((g) => (plan.gates || []).includes(g));
  if (!gates.length || kind === 'dwarfgate') gates = ['s'];
  // room enough for it all, as near as can be guessed (the map grows if not)
  const units = roles.reduce((a, r) => a + (r === 'house' ? 0.7 : r === 'lord' ? 1.7 : BIG.has(r) ? 1.3 : 1), 0) + (keep ? 3.2 : 0) + (hall ? 1 : 0);
  const side = Math.ceil(Math.sqrt(units * 100 + 120));
  const d = plan.size === 'small' ? -6 : plan.size === 'large' ? 8 : 0;
  const w = Math.max(24, S.w + d, side), h = Math.max(24, S.h + d, side);
  return { S, roles, keep, hall, keepSage, guards, keepGuards: keep && guards >= 4 ? 2 : 0, folk: clampInt(plan.folk, 0, 40), walls, gates, w: w + (w % 2), h: h + (h % 2) };
}

// Building sizes: the old styles' own (the same dice in the same order, so
// old seeds make the same towns), and a lord's hall from a plan
function buildingSize(rng, plan) {
  return (role, shrink) => {
    if (plan && role === 'lord') return [rng.int(9, 10) - shrink, rng.int(7, 8) - shrink];
    const big = role === 'inn' || role === 'tavern' || role === 'healer';
    const bw = (big ? rng.int(7, 8) : role === 'house' ? rng.int(5, 6) : rng.int(6, 7)) - shrink;
    const bh = (big ? rng.int(6, 7) : role === 'house' ? rng.int(4, 5) : rng.int(5, 6)) - shrink;
    return [bw, bh];
  };
}

// Find a free plot for a building, put it up with its keeper, and lay a path
// from its door to the street. Returns whether it found room.
function placeBuilding(map, role, c) {
  const { rng, S, kind, cx, cy, okTile, npcs, buildings } = c;
  const { w, h } = map;
  if (c.pack) return packBuilding(map, role, c);
  for (let attempt = 0; attempt < 400; attempt++) {
    const shrink = attempt > 250 ? 1 : 0;
    const [bw, bh] = c.size(role, shrink);
    const [x0, y0] = c.at || [rng.int(3, w - bw - 3), rng.int(3, h - bh - 3)];
    if (!rectFree(map, x0, y0, bw, bh, (t) => okTile(t))) continue;
    if (npcs.some((n) => n.x >= x0 - 1 && n.y >= y0 - 1 && n.x <= x0 + bw && n.y <= y0 + bh)) continue;
    // door faces the nearest street
    const mx = x0 + bw / 2, my = y0 + bh / 2;
    let door;
    if (c.doorTo) door = c.doorTo(mx, my);
    else if (kind === 'castle' || S.underground) door = Math.abs(mx - cx) > Math.abs(my - cy) ? (mx < cx ? 'e' : 'w') : (my < cy ? 's' : 'n');
    else door = Math.abs(mx - cx) < Math.abs(my - cy) ? (mx < cx ? 'e' : 'w') : (my < cy ? 's' : 'n');
    const stone = role === 'healer' || role === 'lord';
    const b = buildRoom(map, x0, y0, bw, bh, { wall: stone ? 'wall_stone' : S.bwall, floor: stone ? 'floor_stone' : S.floor, door });
    const spot = c.furnish(map, b, role, rng);
    // path from the door outwards
    const [ddx, ddy] = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[door];
    let px = b.door.x + ddx, py = b.door.y + ddy;
    for (let k = 0; k < 12 && inBounds(map, px, py); k++) {
      const t = getTile(map, px, py);
      if (t === T[S.street]) break;
      if (!okTile(t) && t !== T.meadow) break;
      setTile(map, px, py, T[S.street]);
      px += ddx; py += ddy;
    }
    const npc = makeNpc(role === 'house' ? 'villager' : role, c.race, spot.x, spot.y, rng);
    npcs.push(npc);
    buildings.push({ ...b, role, npc: npc.id });
    return true;
  }
  return false;
}

// From a plan: of every plot still free, one beside a street, its door
// towards it — so a town packs along its streets and leaves room for the
// rest — with a little chance in the choice
function packBuilding(map, role, c) {
  const { rng, okTile, npcs } = c;
  const { w, h } = map;
  const st = T[c.S.street];
  // steps from each square to the nearest street (under the mountain, where
  // all the hall is street, to the rock: the halls line its walls)
  const under = !!c.S.underground;
  const dist = new Int16Array(w * h).fill(999);
  const q = [];
  for (let i = 0; i < w * h; i++) if (under ? def(map.tiles[i]).wall : map.tiles[i] === st) { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] > dist[i] + 1 && okTile(map.tiles[j])) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  // free ground, summed, so a plot is checked at a glance
  const W1 = w + 1;
  const sum = new Int32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sum[(y + 1) * W1 + x + 1] = (okTile(map.tiles[y * w + x]) ? 1 : 0) + sum[y * W1 + x + 1] + sum[(y + 1) * W1 + x] - sum[y * W1 + x];
  const free = (x0, y0, x1, y1) => sum[(y1 + 1) * W1 + x1 + 1] - sum[y0 * W1 + x1 + 1] - sum[(y1 + 1) * W1 + x0] + sum[y0 * W1 + x0] === (x1 - x0 + 1) * (y1 - y0 + 1);
  for (const shrink of [0, 1]) {
    const [bw, bh] = c.size(role, shrink);
    let best = null, bestScore = Infinity;
    for (let y0 = 3; y0 <= h - bh - 3; y0++) for (let x0 = 3; x0 <= w - bw - 3; x0++) {
      if (!free(x0 - 1, y0 - 1, x0 + bw, y0 + bh)) continue;
      const mx = x0 + Math.floor(bw / 2), my = y0 + Math.floor(bh / 2);
      const sides = [['n', dist[(y0 - 1) * w + mx]], ['s', dist[(y0 + bh) * w + mx]], ['w', dist[my * w + x0 - 1]], ['e', dist[my * w + x0 + bw]]];
      let [side, d] = sides.reduce((a, b) => (b[1] < a[1] ? b : a));
      if (d >= 999) continue;
      if (under) side = Math.abs(mx - c.cx) > Math.abs(my - c.cy) ? (mx < c.cx ? 'e' : 'w') : (my < c.cy ? 's' : 'n');
      const score = d + rng.float(0, 2.5);
      if (score >= bestScore) continue;
      if (npcs.some((n) => n.x >= x0 - 1 && n.y >= y0 - 1 && n.x <= x0 + bw && n.y <= y0 + bh)) continue;
      best = { x0, y0, side };
      bestScore = score;
    }
    if (best) return placeBuilding(map, role, { ...c, pack: false, size: () => [bw, bh], at: [best.x0, best.y0], doorTo: () => best.side });
  }
  return false;
}

// opt: { seed, name, w, h, plan } — with a plan (world/places.js) the town is
// built to it, and grows until everything asked for has a place; then the
// result also says what was `missing` (if anything still did not fit)
export function generateSettlement(kind, opt = {}) {
  if (kind === 'harbour') return opt.plan ? harbourFromPlan(opt) : { ...generateHarbour(opt), buildings: [] };
  if (!opt.plan) return layOutSettlement(kind, opt, null);
  const P = settlementSpec(kind, opt.plan);
  let w = opt.w || P.w, h = opt.h || P.h, res = null;
  for (let i = 0; i < 12; i++) {
    res = layOutSettlement(kind, { ...opt, w, h }, P);
    if (!res.missing.length || w >= 84) break;
    w += 4; h += 4;
  }
  return res;
}

function layOutSettlement(kind, opt, P) {
  const S = SETTLEMENT_STYLES[kind] || SETTLEMENT_STYLES.town;
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const w = opt.w || S.w, h = opt.h || S.h;
  const mapType = kind === 'castle' ? 'castle' : 'town';
  const map = createMap({ type: mapType, w, h, name: opt.name || 'Settlement', fill: S.underground ? 'cave_wall' : S.ground });
  map.lighting = S.underground ? 'dark' : 'day';
  const buildings = [];
  const npcs = [];
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  // the old styles' walls and gates, or the plan's
  const wallKey = P ? (P.walls ? WALL_TILES[P.walls] : null) : S.wall;
  const sides = P ? P.gates : kind === 'castle' ? ['s'] : ['n', 's', 'w', 'e'];
  const keep = P ? P.keep : kind === 'castle';
  const inset = kind === 'castle' ? 3 : 2;
  const scale = (n) => (P ? Math.round(n * (w * h) / (S.w * S.h)) : n);

  if (S.underground) {
    // carve the great hall and an entrance tunnel from the south
    fillRect(map, 4, 4, w - 8, h - 9, 'floor_stone');
    fillRect(map, cx - 1, h - 6, 3, 6, 'floor_stone');
    // braziers in the tunnel walls, so a visit does not begin in the black
    for (const y of [h - 3, h - 5]) { setTile(map, cx - 2, y, T.brazier); setTile(map, cx + 2, y, T.brazier); }
    for (let y = 7; y < h - 7; y += 6) for (const x of [4, w - 5]) setTile(map, x, y, T.brazier);
    for (let y = 8; y < h - 8; y += 8) for (const x of [cx - 3, cx + 2]) setTile(map, x, y, T.brazier);
    for (let y = 10; y < h - 8; y += 8) for (const x of [cx - 3, cx + 2]) setTile(map, x, y, T.wall_stone);
  } else {
    // ground variety
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.2, y * 0.2, rng.seed % 1000, 2);
      if (n > 0.62) setTile(map, x, y, T.meadow);
    }
    // perimeter
    if (kind === 'castle' && wallKey) {
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3) setTile(map, x, y, T.shallows);
      }
      if (!P) {
        fillRect(map, cx - 1, h - 3, 3, 2, 'bridge');
        fillRect(map, cx - 1, h - 1, 3, 1, 'cobble');
      } else {
        // a bridge over the moat at every gate
        for (const g of sides) {
          if (g === 's') { fillRect(map, cx - 1, h - 3, 3, 2, 'bridge'); fillRect(map, cx - 1, h - 1, 3, 1, 'cobble'); }
          if (g === 'n') { fillRect(map, cx - 1, 1, 3, 2, 'bridge'); fillRect(map, cx - 1, 0, 3, 1, 'cobble'); }
          if (g === 'w') { fillRect(map, 1, cy - 1, 2, 3, 'bridge'); fillRect(map, 0, cy - 1, 1, 3, 'cobble'); }
          if (g === 'e') { fillRect(map, w - 3, cy - 1, 2, 3, 'bridge'); fillRect(map, w - 1, cy - 1, 1, 3, 'cobble'); }
        }
      }
    }
    if (wallKey === 'tree') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (edge <= 2 && hash2(x, y, rng.seed) < 0.75 - edge * 0.2) setTile(map, x, y, T.tree);
      }
    } else if (wallKey) {
      for (let x = inset; x < w - inset; x++) { setTile(map, x, inset, T[wallKey]); setTile(map, x, h - 1 - inset, T[wallKey]); }
      for (let y = inset; y < h - inset; y++) { setTile(map, inset, y, T[wallKey]); setTile(map, w - 1 - inset, y, T[wallKey]); }
      if (kind === 'castle' && wallKey === 'wall_stone') {
        for (const [tx, ty] of [[inset, inset], [w - inset - 3, inset], [inset, h - inset - 3], [w - inset - 3, h - inset - 3]]) fillRect(map, tx, ty, 3, 3, 'wall_stone');
      }
    }
    // gates
    const at = { n: [cx, inset], s: [cx, h - 1 - inset], w: [inset, cy], e: [w - 1 - inset, cy] };
    const gates = P ? sides.map((g) => at[g]) : kind === 'castle' ? [[cx, h - 1 - inset]] : [[cx, inset], [cx, h - 1 - inset], [inset, cy], [w - 1 - inset, cy]];
    for (const [gx, gy] of gates) {
      for (let d = -1; d <= 1; d++) {
        if (gy === inset || gy === h - 1 - inset) setTile(map, gx + d, gy, T[S.street]);
        else setTile(map, gx, gy + d, T[S.street]);
      }
    }
    // streets
    const st = T[S.street];
    const crossStreet = kind !== 'castle' || (P && (sides.includes('e') || sides.includes('w')));
    for (let y = inset + 1; y < h - inset - 1; y++) { setTile(map, cx, y, st); setTile(map, cx - 1, y, st); }
    if (crossStreet) for (let x = inset + 1; x < w - inset - 1; x++) { setTile(map, x, cy, st); setTile(map, x, cy - 1, st); }
    // edge paths so the gate connects to the map edge
    if (!P) {
      for (let y = h - 1 - inset; y < h; y++) setTile(map, cx, y, st), setTile(map, cx - 1, y, st);
      if (kind !== 'castle') {
        for (let y = 0; y <= inset; y++) setTile(map, cx, y, st), setTile(map, cx - 1, y, st);
        for (let x = 0; x <= inset; x++) setTile(map, x, cy, st), setTile(map, x, cy - 1, st);
        for (let x = w - 1 - inset; x < w; x++) setTile(map, x, cy, st), setTile(map, x, cy - 1, st);
      }
    } else {
      const road = (x, y) => { if (getTile(map, x, y) !== T.bridge) setTile(map, x, y, st); };
      if (sides.includes('s')) for (let y = h - 1 - inset; y < h; y++) road(cx, y), road(cx - 1, y);
      if (sides.includes('n')) for (let y = 0; y <= inset; y++) road(cx, y), road(cx - 1, y);
      if (sides.includes('w')) for (let x = 0; x <= inset; x++) road(x, cy), road(x, cy - 1);
      if (sides.includes('e')) for (let x = w - 1 - inset; x < w; x++) road(x, cy), road(x, cy - 1);
    }
    // plaza
    if (kind !== 'castle') {
      fillRect(map, cx - 3, cy - 4, 6, 6, S.street);
      setTile(map, cx - 1, cy - 1, T.fountain);
    }
  }

  // castle keep with throne room
  if (keep) {
    const kw = 16, kh = 12, kx = cx - 8, ky = 5;
    const b = buildRoom(map, kx, ky, kw, kh, { wall: 'wall_stone', floor: 'floor_stone', door: 's' });
    for (let y = ky + 1; y < ky + kh - 1; y++) setTile(map, cx - 1, y, T.carpet), setTile(map, cx, y, T.carpet);
    setTile(map, cx - 1, ky + kh - 1, T.door);
    setTile(map, cx, ky + kh - 1, T.door);
    setTile(map, cx - 1, ky + 1, T.throne);
    for (let y = ky + 3; y < ky + kh - 2; y += 3) { setTile(map, cx - 4, y, T.wall_stone); setTile(map, cx + 3, y, T.wall_stone); }
    setTile(map, kx + 1, ky + 1, T.brazier); setTile(map, kx + kw - 2, ky + 1, T.brazier);
    setTile(map, kx + 1, ky + kh - 2, T.shelf); setTile(map, kx + 2, ky + kh - 2, T.shelf);
    setTile(map, kx + kw - 2, ky + kh - 2, T.bed); setTile(map, kx + kw - 3, ky + kh - 2, T.bed);
    const lord = makeNpc('lord', 'human', cx - 1, ky + 2, rng, { wander: 0 });
    npcs.push(lord);
    buildings.push({ ...b, role: 'keep', npc: lord.id });
    if (!P || P.keepGuards) {
      npcs.push(makeNpc('guard', 'human', cx - 3, ky + 3, rng, { wander: 0 }));
      npcs.push(makeNpc('guard', 'human', cx + 2, ky + 3, rng, { wander: 0 }));
    }
    if (!P || P.keepSage) npcs.push(makeNpc('sage', 'human', kx + 3, ky + kh - 3, rng, { wander: 2 }));
  }
  if (kind === 'dwarfgate' && (!P || P.hall)) {
    // king's hall at the north end
    fillRect(map, cx - 3, 4, 6, 3, 'carpet');
    setTile(map, cx - 1, 4, T.throne);
    const lord = makeNpc('lord', 'dwarf', cx - 1, 5, rng, { wander: 0 });
    lord.look.body = 0x6a3a1a; lord.look.robe = false; lord.look.armor = 'plate';
    npcs.push(lord);
    buildings.push({ role: 'keep', npc: lord.id });
  }

  // place shops and houses
  const roles = P ? P.roles : [...S.shops];
  if (!P) for (let i = 0; i < S.houses; i++) roles.push('house');
  const ground = new Set([T[S.ground], T.meadow, T.grass, T.floor_stone]);
  const okTile = (t) => ground.has(t) || (S.underground && t === T.floor_stone);
  const ctx = { rng, S, kind, cx, cy, okTile, npcs, buildings, race: S.race, size: buildingSize(rng, P), furnish: P ? furnishPlan : furnish, pack: !!P };
  const missing = [];
  for (const role of roles) if (!placeBuilding(map, role, ctx)) missing.push(role);

  // greenery & clutter
  if (!S.underground) {
    const green = (tt) => tt === T.grass || tt === T.meadow || tt === T.garden || tt === T.tree;
    const elvish = kind === 'elfhall';
    for (let i = 0; i < scale(elvish ? 260 : kind === 'town' ? 30 : 16); i++) {
      const x = rng.int(3, w - 4), y = rng.int(3, h - 4);
      const t = getTile(map, x, y);
      if (t !== T.grass && t !== T.meadow) continue;
      if (npcs.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1)) continue;
      // elven glades are thick with trees, but streets and doorways stay clear
      if (elvish) {
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => green(getTile(map, x + dx, y + dy)))) continue;
      } else if (!rectFree(map, x, y, 1, 1, green)) continue;
      setTile(map, x, y, rng.chance(elvish ? 0.7 : 0.6) ? T.tree : T.garden);
    }
    if (kind === 'village') {
      for (let i = 0; i < scale(3); i++) {
        const x0 = rng.int(4, w - 9), y0 = rng.int(4, h - 8);
        if (rectFree(map, x0, y0, 4, 3, (t) => t === T.grass || t === T.meadow)) fillRect(map, x0, y0, 4, 3, 'crops');
      }
    }
  } else {
    for (let i = 0; i < scale(10); i++) {
      const x = rng.int(5, w - 6), y = rng.int(5, h - 8);
      if (getTile(map, x, y) === T.floor_stone && rectFree(map, x, y, 1, 1, (t) => t === T.floor_stone)) setTile(map, x, y, rng.chance(0.5) ? T.anvil : T.barrel);
    }
  }

  // guards and wanderers
  if (!P) {
    if (!S.underground && kind !== 'elfhall') {
      const gy = h - (kind === 'castle' ? 5 : 4);
      npcs.push(makeNpc('guard', 'human', cx - 2, gy, rng, { wander: 0 }));
      npcs.push(makeNpc('guard', 'human', cx + 1, gy, rng, { wander: 0 }));
    }
  } else placeGuards(map, P, { S, kind, cx, cy, inset, rng, npcs });
  const nWander = P ? P.folk : kind === 'castle' ? 3 : 4;
  for (let i = 0; i < nWander; i++) {
    for (let a = 0; a < 40; a++) {
      const x = rng.int(3, w - 4), y = rng.int(3, h - 4);
      const t = getTile(map, x, y);
      // (from a plan: out in the streets, never indoors)
      if (P && (npcs.some((n) => n.x === x && n.y === y) || buildings.some((b) => b.w && x >= b.x0 && y >= b.y0 && x < b.x0 + b.w && y < b.y0 + b.h))) continue;
      if (t === T[S.street] || t === T.grass || t === T.meadow) {
        npcs.push(makeNpc('villager', rng.chance(0.75) ? S.race : rng.pick(['human', 'elf', 'dwarf']), x, y, rng, { wander: 5 }));
        break;
      }
    }
  }
  streetFurniture(map, kind, S, new RNG((opt.seed ?? 7) * 7 + 3), npcs, cx, cy);
  map.entities.push(...npcs);
  map.entry = { x: cx - 1, y: h - 2 };
  if (S.underground) map.entry = { x: cx, y: h - 2 };
  else if (P && !sides.includes('s')) map.entry = sides[0] === 'n' ? { x: cx - 1, y: 1 } : sides[0] === 'w' ? { x: 1, y: cy } : { x: w - 2, y: cy };
  return P ? { map, buildings, npcs, missing } : { map, buildings, npcs };
}

// The watch: a pair inside each gate (or at the mouth of a dwarf hold's
// tunnel), and any more on patrol about the streets
function placeGuards(map, P, { S, kind, cx, cy, inset, rng, npcs }) {
  const { w, h } = map;
  const want = P.guards - P.keepGuards;
  const spots = [];
  if (S.underground) spots.push([cx - 2, h - 7], [cx + 2, h - 7]);
  else if (P.walls) {
    for (const g of P.gates) {
      if (g === 's') spots.push([cx - 2, h - 2 - inset], [cx + 1, h - 2 - inset]);
      if (g === 'n') spots.push([cx - 2, inset + 1], [cx + 1, inset + 1]);
      if (g === 'w') spots.push([inset + 1, cy - 2], [inset + 1, cy + 1]);
      if (g === 'e') spots.push([w - 2 - inset, cy - 2], [w - 2 - inset, cy + 1]);
    }
  }
  const free = (x, y) => inBounds(map, x, y) && def(getTile(map, x, y)).walk && !def(getTile(map, x, y)).door && !def(getTile(map, x, y)).water && !npcs.some((n) => n.x === x && n.y === y);
  for (let i = 0; i < want; i++) {
    let at = spots[i] && free(...spots[i]) ? spots[i] : null;
    for (let a = 0; !at && a < 200; a++) {
      const x = rng.int(3, w - 4), y = rng.int(3, h - 4);
      if (getTile(map, x, y) === T[S.street] && free(x, y)) at = [x, y];
    }
    if (!at) continue;
    npcs.push(makeNpc('guard', S.race, at[0], at[1], rng, { wander: spots[i] ? 0 : 3 }));
  }
}

// A harbour from a plan: the quay, piers, yard, tavern, chandler and cottages
// stand where harbour.js lays them out; the plan adds more buildings on the
// green behind the quay (the map grows east to fit them), and sets how many
// folk work the quay and how many guards watch the road in
const HARBOUR_FIXED = { tavern: 1, provisions: 1, shipwright: 1, house: 3 };
function harbourFromPlan(opt) {
  const P = settlementSpec('harbour', opt.plan);
  const left = { ...HARBOUR_FIXED };
  const extra = [];
  for (const r of P.roles) { if (left[r] > 0) left[r]--; else extra.push(r); }
  const large = opt.plan.size === 'large';
  let w = Math.max(opt.w || (large ? 38 : 30), 30 + Math.ceil(extra.length * 2.4)), h = opt.h || (large ? 30 : 24);
  let res = null;
  for (let i = 0; i < 12; i++) {
    res = harbourOnce(opt, P, extra, w, h);
    if (!res.missing.length || w >= 84) break;
    w += 6;
  }
  return res;
}

function harbourOnce(opt, P, extra, w, h) {
  const { map, npcs } = generateHarbour({ ...opt, w, h });
  const rng = new RNG((opt.seed ?? 1) * 13 + 5);
  const S = { ...SETTLEMENT_STYLES.harbour, street: 'road', bwall: 'wall_wood', floor: 'floor_wood' };
  const all = [...npcs];
  const buildings = [];
  const missing = [];
  const ctx = {
    rng, S, kind: 'harbour', cx: w, cy: 12, okTile: (t) => t === T.grass || t === T.meadow, npcs: all, buildings, race: 'human',
    size: buildingSize(rng, P), furnish: furnishPlan, pack: true,
    // doors face the road in along the middle
    doorTo: (mx, my) => (my < 12.5 ? 's' : 'n'),
  };
  for (const r of extra) if (!placeBuilding(map, r, ctx)) missing.push(r);
  // the dockhands harbour.js puts on the quay: fewer, or more of them
  const dock = (e) => e.role === 'villager' && e.wander === 3 && !def(getTile(map, e.x, e.y)).key.startsWith('floor');
  const hands = all.filter(dock);
  for (const e of hands.slice(P.folk)) all.splice(all.indexOf(e), 1);
  const open = (x, y) => inBounds(map, x, y) && def(getTile(map, x, y)).walk && !def(getTile(map, x, y)).door && !all.some((n) => n.x === x && n.y === y);
  for (let i = hands.length, a = 0; i < P.folk && a < 600; a++) {
    const x = rng.int(3, w - 3), y = rng.int(1, h - 2);
    const k = def(getTile(map, x, y)).key;
    if ((k === 'cobble' || k === 'pier' || k === 'road') && open(x, y)) { all.push(makeNpc('villager', 'human', x, y, rng, { wander: 4 })); i++; }
  }
  // guards on the road in from the east
  for (let i = 0, a = 0; i < P.guards && a < 400; a++) {
    const [x, y] = i < 2 ? [w - 3 - Math.floor(a / 2), i ? 14 : 11] : [rng.int(11, w - 3), rng.int(1, h - 2)];
    const k = def(getTile(map, x, y)).key;
    if (open(x, y) && (i < 2 || k === 'cobble' || k === 'road')) { all.push(makeNpc('guard', 'human', x, y, rng, { wander: i < 2 ? 0 : 3 })); i++; }
  }
  map.entities = map.entities.filter((e) => e.type !== 'npc');
  map.entities.push(...all);
  return { map, npcs: all, buildings, missing };
}

// Lamps along the streets, a market round the fountain, carts and hay by the
// roads: the things that make a settlement look lived in. Only bare ground
// next to a street is used, so no doorway or path is ever blocked.
function streetFurniture(map, kind, S, rng, npcs, cx, cy) {
  const { w, h } = map;
  const st = T[S.street];
  const bare = (x, y) => {
    if (!inBounds(map, x, y)) return false;
    const t = getTile(map, x, y);
    if (S.underground ? t !== T.floor_stone : t !== T.grass && t !== T.meadow) return false;
    if (npcs.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1)) return false;
    // never against a door or another prop
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const d = def(getTile(map, x + dx, y + dy));
      if (d.door || ['lamppost', 'cart', 'hay', 'stall', 'well'].includes(d.key)) return false;
    }
    return true;
  };
  const byStreet = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(map, x + dx, y + dy) && getTile(map, x + dx, y + dy) === st);
  const put = (x, y, key) => { setTile(map, x, y, T[key]); return true; };
  if (!S.underground) {
    // lamp posts down both sides of the high street, and along the cross street
    const step = kind === 'village' ? 7 : 5;
    for (let y = 4, i = 0; y < h - 4; y += step, i++) {
      const x = i % 2 ? cx + 1 : cx - 2;
      if (bare(x, y) && byStreet(x, y)) put(x, y, 'lamppost');
    }
    if (kind !== 'castle') for (let x = 4, i = 0; x < w - 4; x += step, i++) {
      const y = i % 2 ? cy + 1 : cy - 2;
      if (bare(x, y) && byStreet(x, y)) put(x, y, 'lamppost');
    }
    // market stalls at the corners of the town square
    if (kind === 'town') {
      for (const [x, y] of [[cx - 3, cy - 4], [cx + 2, cy - 4], [cx - 3, cy + 1], [cx + 2, cy + 1]]) {
        if (getTile(map, x, y) === st && !npcs.some((n) => n.x === x && n.y === y)) put(x, y, 'stall');
      }
    }
  }
  // carts and hay by the roadside
  const n = kind === 'village' ? 5 : kind === 'elfhall' ? 0 : 3;
  for (let i = 0, tries = 0; i < n && tries < 300; tries++) {
    const x = rng.int(3, w - 4), y = rng.int(3, h - 4);
    if (!bare(x, y) || !byStreet(x, y)) continue;
    put(x, y, S.underground ? 'cart' : rng.chance(kind === 'village' || kind === 'castle' ? 0.55 : 0.35) ? 'hay' : 'cart');
    i++;
  }
}

// ---------------------------------------------------------------- dungeons
export const DUNGEON_STYLES = {
  cave: { wall: 'cave_wall', floor: 'cave_floor', deco: ['rubble', 'bones', 'web', 'crystal', 'pit_water'] },
  crypt: { wall: 'dungeon_wall', floor: 'dungeon_floor', deco: ['bones', 'rubble', 'brazier', 'web'] },
  fortress: { wall: 'dungeon_wall', floor: 'floor_stone', deco: ['brazier', 'bones', 'lava', 'rubble'] },
};
// a plan's sizes (squares a side)
export const DUNGEON_SIZES = { small: 28, medium: 36, large: 44 };
// the curiosities a plan's `wonders` count adds, in turn
const DUNGEON_WONDERS = ['lore', 'cache', 'shrine_ward', 'lore', 'cache', 'shrine_might', 'lore', 'cache'];
const PILLAR_TEXTS = ['Scratched into the stone: "The deep ones sleep below. Light thy torch and pray."', 'A warning, half worn away: "...TREASURE...DEATH...DO NOT..."', 'A tally of marks, hundreds of them, ending in a single word: OUT.'];

// opt: { seed, name, style, w, h, rooms, monsters, boss, level, wonders } —
// or { seed, name, level, plan } to build one to a plan (world/places.js):
// its rooms, monsters (and how many in a band), boss, final treasure, extra
// chests and curiosities; the map grows until every room fits
export function generateDungeon(opt = {}) {
  const P = opt.plan || null;
  if (P && !opt._fit) {
    const want = clampInt(P.rooms, 2, 30);
    let s = Math.max(opt.w || DUNGEON_SIZES[P.size] || 36, Math.ceil(Math.sqrt(want * 110)));
    s += s % 2;
    let res = null;
    for (let i = 0; i < 10; i++) {
      res = generateDungeon({ ...opt, w: s, h: s, _fit: true });
      if (res.rooms.length >= want || s >= 84) break;
      s += 6;
    }
    res.missing = res.rooms.length < want ? [`${want - res.rooms.length} room${want - res.rooms.length === 1 ? '' : 's'}`] : [];
    return res;
  }
  const styleKey = P ? (P.style === 'seacave' ? 'cave' : P.style) : opt.style;
  const style = DUNGEON_STYLES[styleKey] || DUNGEON_STYLES.cave;
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const w = opt.w || 36, h = opt.h || 36;
  const map = createMap({ type: 'dungeon', w, h, name: opt.name || 'Dungeon', fill: style.wall });
  map.lighting = 'dark';
  map.level = opt.level || 1;
  const rooms = [];
  const wantRooms = P ? clampInt(P.rooms, 2, 30) : opt.rooms || 9;
  for (let i = 0; i < (P ? 1500 : 80) && rooms.length < wantRooms; i++) {
    const rw = rng.int(4, 8), rh = rng.int(4, 7);
    const x0 = rng.int(2, w - rw - 2), y0 = rng.int(2, h - rh - 2);
    if (rooms.some((r) => x0 < r.x + r.w + 2 && x0 + rw + 2 > r.x && y0 < r.y + r.h + 2 && y0 + rh + 2 > r.y)) continue;
    rooms.push({ x: x0, y: y0, w: rw, h: rh, cx: x0 + Math.floor(rw / 2), cy: y0 + Math.floor(rh / 2) });
  }
  const carve = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) setTile(map, x, y, T[style.floor]); };
  for (const r of rooms) {
    if (styleKey === 'cave') {
      forBlob(map, r.cx, r.cy, Math.max(r.w, r.h) / 2 + 0.5, rng.int(1, 9999), (x, y, d) => { if (d < 1) carve(x, y); }, 0, 0.35);
    } else {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
    }
  }
  // connect rooms in order of position for a winding path, plus a loop
  rooms.sort((a, b) => (b.cy - a.cy) || (a.cx - b.cx));
  const link = (a, b) => {
    const pts = rng.chance(0.5) ? [...line4(a.cx, a.cy, b.cx, a.cy), ...line4(b.cx, a.cy, b.cx, b.cy)] : [...line4(a.cx, a.cy, a.cx, b.cy), ...line4(a.cx, b.cy, b.cx, b.cy)];
    for (const [x, y] of pts) {
      carve(x, y);
      if (styleKey === 'cave' && rng.chance(0.3)) carve(x + 1, y);
    }
  };
  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);
  if (rooms.length > 3) link(rooms[0], rooms[rng.int(2, rooms.length - 1)]);

  // entry in the first (southern-most) room
  const entry = rooms[0];
  setTile(map, entry.cx, entry.cy, T.stairs_up);
  map.entry = { x: entry.cx, y: entry.cy - 1 };
  if (getTile(map, map.entry.x, map.entry.y) !== T[style.floor]) map.entry = { x: entry.cx + 1, y: entry.cy };
  setTile(map, map.entry.x, map.entry.y, T[style.floor]);
  map.entities.push({ id: uid('portal'), type: 'portal', x: entry.cx, y: entry.cy, target: { map: 'exit' }, label: 'Stairs up', style: 'stairs' });

  // decorate rooms
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
      if (i === 0 && Math.abs(x - entry.cx) + Math.abs(y - entry.cy) < 3) continue;
      if (getTile(map, x, y) !== T[style.floor]) continue;
      const k2 = rng.pick(style.deco);
      // keep impassable decor away from corridors
      if (['brazier', 'crystal', 'pit_water', 'lava'].includes(k2)) {
        if (!rectFree(map, x, y, 1, 1, (t) => t === T[style.floor] || def(t).wall)) continue;
      }
      setTile(map, x, y, T[k2]);
    }
    if (styleKey !== 'cave' && rng.chance(0.5)) {
      setTile(map, r.x, r.y, T.brazier);
    }
  }
  // the deepest room (last) holds the treasure; mid rooms hold monsters & chests
  const last = rooms[rooms.length - 1];
  const prize = P?.treasure || null;
  // (hoard: it also holds a charm, chosen when it is opened: game/charms.js charmHoard)
  map.entities.push({ id: uid('chest'), type: 'chest', x: last.cx, y: last.cy, gold: prize ? prize.gold ?? 80 + map.level * 60 : 80 + map.level * 60, items: prize ? JSON.parse(JSON.stringify(prize.items || [])) : [], hoard: true });
  const monsters = P ? P.monsters || [] : opt.monsters || [];
  const boss = P ? P.boss : opt.boss;
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    if (monsters.length && (i < rooms.length - 1 || !boss)) {
      const mx = r.cx + (rng.chance(0.5) ? 1 : -1), my = r.cy;
      if (def(getTile(map, mx, my)).walk) {
        const id = rng.pick(monsters);
        map.entities.push({ id: uid('mon'), type: 'monster', x: mx, y: my, monster: id, count: (P && P.counts?.[id]) || '2-4', wander: 3 });
      }
    }
    if (!P && i < rooms.length - 1 && rng.chance(0.35)) {
      const x = r.x + r.w - 1, y = r.y + r.h - 1;
      if (def(getTile(map, x, y)).walk) map.entities.push({ id: uid('chest'), type: 'chest', x, y, gold: rng.int(10, 30) * map.level, items: rng.chance(0.5) ? [{ id: 'healing_draught', n: 1 }] : [] });
    }
  }
  if (P) {
    // exactly as many chests as the plan asks, spread over the middle rooms
    const mids = rooms.length > 2 ? rooms.slice(1, -1) : rooms.slice(0, 1);
    const order = rng.shuffle ? rng.shuffle([...mids]) : mids;
    const taken = (x, y) => map.entities.some((e) => e.x === x && e.y === y);
    for (let k = 0, placed = 0; placed < clampInt(P.chests, 0, 24) && k < 200; k++) {
      const r = order[k % order.length];
      const corners = [[r.x + r.w - 1, r.y + r.h - 1], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y], [r.x, r.y]];
      const [x, y] = k < order.length * 4 ? corners[Math.floor(k / order.length) % 4] : [rng.int(r.x, r.x + r.w - 1), rng.int(r.y, r.y + r.h - 1)];
      const t = def(getTile(map, x, y));
      if (!t.walk || t.door || taken(x, y) || ['stairs_up', 'stairs_down'].includes(t.key)) continue;
      map.entities.push({ id: uid('chest'), type: 'chest', x, y, gold: rng.int(10, 30) * map.level, items: rng.chance(0.5) ? [{ id: 'healing_draught', n: 1 }] : [] });
      placed++;
    }
  }
  if (boss) {
    map.entities.push({ id: uid('mon'), type: 'monster', x: last.cx, y: Math.max(last.y, last.cy - 1), monster: boss, count: '1', wander: 0, boss: true });
  }
  map.encounterRate = 0.6;
  if (P ? P.wonders > 0 : opt.wonders !== false && rooms.length > 4) {
    const r2 = new RNG((opt.seed ?? 1) + 77);
    const spots = [];
    const pool = P && rooms.length <= 2 ? rooms : rooms.slice(1, -1);
    const want = P ? clampInt(P.wonders, 0, 8) : 2;
    for (let pass = 0; pass < (P ? 4 : 1) && spots.length < want + (P ? 0 : pool.length); pass++) {
      for (const r of pool) for (let k = 0; k < 4; k++) {
        const x = r2.int(r.x, r.x + r.w - 1), y = r2.int(r.y, r.y + r.h - 1);
        if (getTile(map, x, y) === T[style.floor] && !map.entities.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 2) && !spots.some((s) => s.x === x && s.y === y)) { spots.push({ x, y }); break; }
      }
    }
    const pick = (tpl, extra, n = 0) => {
      const s = spots.splice(r2.int(0, spots.length - 1), 1)[0];
      if (s) map.entities.push({ ...eventFromTemplate(tpl), id: opt.seed != null ? `ev_${opt.seed}_${tpl}${n ? '_' + n : ''}` : uid('ev'), x: s.x, y: s.y, ...extra });
    };
    const extraFor = (tpl) => (tpl === 'lore' ? { name: 'Carved Pillar', text: r2.pick(PILLAR_TEXTS) } : tpl === 'cache' ? { name: 'Loose Flagstone' } : { name: 'Forgotten Shrine' });
    if (!P) {
      if (spots.length) pick('lore', { name: 'Carved Pillar', text: r2.pick(PILLAR_TEXTS) });
      if (spots.length) pick('cache', { name: 'Loose Flagstone' });
    } else for (let i = 0; i < want && spots.length; i++) pick(DUNGEON_WONDERS[i % DUNGEON_WONDERS.length], extraFor(DUNGEON_WONDERS[i % DUNGEON_WONDERS.length]), i >= 2 ? i : 0);
  }
  return { map, rooms, last };
}

// A smugglers' sea cave: a short cave whose black water reaches in from the
// sea, bandits in its chambers and their hoard of brandy, silk and coin at
// the back. (opt: boss, monsters, rooms, counts as for generateDungeon; or
// plan, from world/places.js)
export function smugglersCave(game, name, seed, opt = {}) {
  const have = (id) => !game || game.monsters.some((m) => m.id === id);
  const P = opt.plan ? { ...opt.plan, style: 'cave', monsters: (opt.plan.monsters || []).filter(have), boss: opt.plan.boss && have(opt.plan.boss) ? opt.plan.boss : null } : null;
  const monsters = (opt.monsters || ['bandit', 'giant_rat', 'bat_swarm']).filter(have);
  const res = P ? generateDungeon({ name, seed, plan: P, ...opt.dungeon })
    : generateDungeon({ name, seed, style: 'cave', monsters, rooms: opt.rooms || 6, w: opt.w || 28, h: opt.h || 28, boss: opt.boss && have(opt.boss) ? opt.boss : null, ...opt.dungeon });
  const { map, rooms, last } = res;
  const rng = new RNG(seed + 5);
  // sea water lapping into the first chambers, and the smugglers' stores
  for (const r of rooms.slice(0, 2)) for (let k = 0; k < 3; k++) {
    const x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
    if (getTile(map, x, y) === T.cave_floor && rectFree(map, x, y, 1, 1, (t) => t === T.cave_floor || def(t).wall) && !map.entities.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 2)) setTile(map, x, y, T.pit_water);
  }
  for (const r of rooms.slice(1)) {
    const x = r.x, y = r.y;
    if (getTile(map, x, y) === T.cave_floor && !map.entities.some((e) => e.x === x && e.y === y)) setTile(map, x, y, rng.chance(0.5) ? T.barrel : T.cargo);
  }
  if (!P) for (const e of map.entities) if (e.type === 'monster' && !e.boss && opt.counts?.[e.monster]) e.count = opt.counts[e.monster];
  const chest = map.entities.find((e) => e.type === 'chest' && e.x === last.cx && e.y === last.cy);
  const known = (it) => !game || game.items.some((x) => x.id === it.id);
  if (chest && P) chest.items = chest.items.filter(known);
  else if (chest) { chest.gold = opt.gold ?? 180; chest.items = opt.items || [{ id: 'healing_draught', n: 2 }, { id: 'mana_tonic', n: 1 }].filter(known); }
  return { ...res, chest };
}

// Build a place's map from its plan (see world/places.js for what a plan
// holds): { map, missing: [what would not fit, even on a bigger map] }.
// The map carries the plan (map.plan) so it can be changed and rebuilt.
export function generateFromPlan(game, plan, opt = {}) {
  const fk = FEATURE_KINDS[plan.kind] || FEATURE_KINDS.town;
  const seed = opt.seed ?? plan.seed ?? Math.floor(Math.random() * 1e9);
  const name = opt.name || 'New place';
  let res;
  if (fk.mapType === 'dungeon') {
    const have = (id) => !game || game.monsters.some((m) => m.id === id);
    const P = { ...plan, monsters: (plan.monsters || []).filter(have), boss: plan.boss && have(plan.boss) ? plan.boss : null };
    if (P.treasure && game) P.treasure = { ...P.treasure, items: (P.treasure.items || []).filter((it) => game.items.some((x) => x.id === it.id)) };
    res = plan.style === 'seacave' ? smugglersCave(game, name, seed, { plan: P }) : generateDungeon({ name, seed, plan: P, level: opt.level });
  } else {
    res = generateSettlement(SETTLEMENT_STYLES[plan.style] ? plan.style : 'town', { name, seed, plan });
    nameNpcs(res.map, game, seed);
  }
  res.map.name = name;
  res.map.plan = JSON.parse(JSON.stringify({ ...plan, seed }));
  return { map: res.map, missing: res.missing || [] };
}

// ---------------------------------------------------------------- feature placement
// (plan: build the place's map to a plan instead of the kind's usual one)
export function placeFeature(game, world, x, y, kind, name, seed, plan = null) {
  const fk = FEATURE_KINDS[kind];
  if (!fk) return null;
  setTile(world, x, y, T[fk.terrain]);
  let sub;
  const s = seed ?? Math.floor(Math.random() * 1e9);
  if (plan) {
    sub = generateFromPlan(game, { ...plan, kind }, { name, seed: s }).map;
  } else if (kind === 'seacave') {
    sub = smugglersCave(game, name, s).map;
  } else if (fk.mapType === 'dungeon') {
    const style = kind === 'fortress' ? 'fortress' : kind === 'tower' ? 'crypt' : 'cave';
    sub = generateDungeon({ name, seed: s, style, monsters: kind === 'fortress' ? ['orc', 'orc_archer', 'skeleton'] : ['goblin', 'giant_rat', 'skeleton', 'giant_spider'] }).map;
  } else {
    const style = kind === 'castle' ? 'castle' : kind === 'village' ? 'village' : kind === 'elfhall' ? 'elfhall' : kind === 'dwarfgate' ? 'dwarfgate' : kind === 'harbour' ? 'harbour' : 'town';
    sub = generateSettlement(style, { name, seed: s }).map;
    nameNpcs(sub, game, s);
  }
  sub.name = name;
  sub.exit = { map: world.id, x, y };
  game.maps.push(sub);
  world.entities = world.entities.filter((e) => !(e.x === x && e.y === y && e.type === 'portal'));
  world.entities.push({ id: uid('portal'), type: 'portal', x, y, target: { map: sub.id }, label: name, style: 'site' });
  return sub;
}

// Plenty of names, so that every townsperson in a large realm (and every
// random hero) can have one of their own
const NAMES = {
  hobbit: { m: ['Bilbo', 'Drogo', 'Fosco', 'Hamfast', 'Largo', 'Milo', 'Odo', 'Posco', 'Rufus', 'Tolman', 'Bingo', 'Dudo', 'Griffo', 'Hob', 'Mungo', 'Otho', 'Ponto', 'Sancho', 'Tobold', 'Wilcome', 'Bungo', 'Fastred', 'Ferdi', 'Gorbadoc'],
    f: ['Bell', 'Daisy', 'Elanor', 'Hilly', 'Lily', 'Marigold', 'Myrtle', 'Pansy', 'Pervinca', 'Poppy', 'Primrose', 'Rosie', 'Tansy', 'Belba', 'Camellia', 'Dora', 'Esmeralda', 'Gilly', 'Lavender', 'Melilot', 'Peony', 'Prisca', 'Ruby', 'Salvia'] },
  human: { m: ['Aldric', 'Bram', 'Cedric', 'Doran', 'Edwin', 'Garret', 'Hal', 'Osric', 'Rowan', 'Tobin', 'Wilf', 'Merek', 'Alder', 'Bertram', 'Corwin', 'Duncan', 'Emeric', 'Godwin', 'Hugh', 'Jory', 'Leofric', 'Piers', 'Roland', 'Simon', 'Walter',
    'Ambrose', 'Baldwin', 'Conrad', 'Denholm', 'Edric', 'Fulk', 'Gareth', 'Harold', 'Ivo', 'Jasper', 'Kenric', 'Lambert', 'Matthias', 'Ned', 'Odo', 'Percival', 'Quentin', 'Ralf', 'Stephen', 'Thurstan',
    'Ulric', 'Warin', 'Aldous', 'Benedict', 'Cuthbert', 'Dunstan', 'Everard', 'Gilbert', 'Hamon', 'Lucan', 'Martin', 'Nigel', 'Oswin', 'Reginald', 'Silas', 'Tristram', 'Wystan', 'Yorick'],
    f: ['Ada', 'Brenna', 'Edith', 'Gwen', 'Hilda', 'Isolde', 'Maud', 'Rowena', 'Tilda', 'Wynn', 'Agnes', 'Beatrix', 'Cecily', 'Elena', 'Freya', 'Joan', 'Mabel', 'Nell', 'Rosalind', 'Sybil',
      'Alys', 'Bertha', 'Clemence', 'Dulcie', 'Emma', 'Felice', 'Gisela', 'Hawise', 'Ida', 'Juliana', 'Katherine', 'Lettice', 'Margery', 'Petronel', 'Rohese', 'Sabine', 'Thomasin', 'Ursula',
      'Avice', 'Blanche', 'Constance', 'Edwina', 'Helewise', 'Iseult', 'Millicent', 'Odette', 'Philippa', 'Elspeth', 'Marian', 'Gillian', 'Hester', 'Winifred', 'Mildred', 'Orabel', 'Talia'] },
  elf: { m: ['Aerendil', 'Caladir', 'Elrandir', 'Faelon', 'Galathil', 'Lindor', 'Thalion', 'Aranel', 'Calen', 'Erestor', 'Gilmir', 'Halmir', 'Orophin', 'Saeros',
    'Amras', 'Belthil', 'Ereinion', 'Fingal', 'Glorion', 'Ilmar', 'Lenwe', 'Mablung', 'Rumil', 'Tarathil', 'Arandur', 'Celedor', 'Faramel', 'Ingwion'],
  f: ['Arwyn', 'Celebrin', 'Elanor', 'Ithilwen', 'Laurelin', 'Nimloth', 'Silmariel', 'Aerin', 'Elemmire', 'Finduilas', 'Lothiel', 'Miriel', 'Tinuviel',
    'Aredhel', 'Celebwen', 'Earwen', 'Galadwen', 'Idril', 'Luthiel', 'Melian', 'Nenya', 'Rian', 'Anariel', 'Elenwe', 'Indis', 'Nerdanel', 'Mirwen'] },
  dwarf: { m: ['Balor', 'Borin', 'Dain', 'Durgan', 'Farin', 'Grimbold', 'Thrar', 'Norri', 'Bofur', 'Dwalin', 'Gloin', 'Hrothgar', 'Korin', 'Nain', 'Skafid', 'Thekk',
    'Ari', 'Bombur', 'Dvalin', 'Frerin', 'Gimbal', 'Hannar', 'Ingvi', 'Kili', 'Loni', 'Nali', 'Oin', 'Rurik', 'Sindri', 'Torvald', 'Vali'],
  f: ['Brunhild', 'Disa', 'Hilda', 'Thora', 'Vigdis', 'Dagny', 'Gerd', 'Helga', 'Sigrun', 'Ylva',
    'Asa', 'Bera', 'Dagrun', 'Edda', 'Frida', 'Gudrun', 'Hervor', 'Inga', 'Jorunn', 'Kelda', 'Ragna', 'Solvei', 'Tova', 'Unn', 'Yrsa', 'Svala'] },
};

const BYNAMES = ['Brightwater', 'Ashdown', 'Fairfield', 'Stonebrook', 'Hollins', 'Marsh', 'Underhill', 'Greenleaf', 'Oakshott', 'Redmane'];

// A random first name. `avoid` (a Set from nameWords) keeps it from
// sounding like anyone already in the game: "Hilda" is taken by Mayor Hilda.
// look: a figure's look, so a bearded "bold" face is not called Freya
export function randomName(race, rng, avoid = null, look = null) {
  const n = NAMES[race] || NAMES.human;
  const list = look?.face === 'bold' ? n.m : look?.face === 'fair' ? n.f : rng.chance(0.5) ? n.m : n.f;
  const free = avoid ? list.filter((x) => !avoid.has(x.toLowerCase())) : list;
  if (free.length) return rng.pick(free);
  // every name of that kind is in use: try the other sex, then add a byname
  const other = (list === n.m ? n.f : n.m).filter((x) => !avoid.has(x.toLowerCase()));
  if (other.length) return rng.pick(other);
  // every name is taken: a byname tells this one apart
  for (let i = 0; i < 40; i++) {
    const n = `${rng.pick(list)} ${rng.pick(BYNAMES)}`;
    if (!avoid.has(n.split(' ')[1].toLowerCase())) return n;
  }
  return rng.pick(list);
}

// The words of a name that make it someone's: "Mayor Hilda" → hilda,
// "King Durgan Ironhand" → durgan, ironhand. Titles do not count.
const TITLES = new Set(['mayor', 'king', 'queen', 'lady', 'lord', 'sir', 'dame', 'sister', 'brother', 'farmer', 'old', 'young', 'master', 'mistress', 'captain', 'father', 'mother', 'the', 'of', 'prince', 'princess']);
export function nameWords(name) {
  return String(name || '').toLowerCase().split(/[^a-z\u00c0-\u024f']+/).filter((w) => w.length > 1 && !TITLES.has(w));
}

// Every name word of every person placed in the game (optionally minus one)
export function npcNameWords(game, except = null) {
  const out = new Set();
  for (const m of game?.maps || []) for (const e of m.entities || []) {
    if (e.type === 'npc' && e !== except) for (const w of nameWords(e.name)) out.add(w);
  }
  return out;
}

// Give every made-up townsperson a name of their own across the whole game.
// keep(e) marks the story folk whose names stay; the others are renamed if
// they share a name word with anyone met earlier.
export function uniqueTownsfolk(game, keep, seed = 1) {
  const rng = new RNG(seed + 991);
  const used = new Set();
  const all = [];
  for (const m of game.maps) for (const e of m.entities || []) if (e.type === 'npc') all.push(e);
  for (const e of all) if (keep(e)) for (const w of nameWords(e.name)) used.add(w);
  for (const e of all) {
    if (keep(e)) continue;
    const words = nameWords(e.name);
    if (words.length && words.every((w) => !used.has(w))) { for (const w of words) used.add(w); continue; }
    e.name = randomName(e.look?.race || 'human', rng, used);
    for (const w of nameWords(e.name)) used.add(w);
  }
}

// the words a generated person starts with (the checklist knows them as unwritten)
export const ROLE_TEXT = {
  weapons: { job: 'I forge blades and sell arms. Wouldst thou BUY or SELL?', greet: 'Steel for the road, traveller?' },
  armor: { job: 'I sell armour of every kind. Wouldst thou BUY or SELL?', greet: 'A good hauberk is a friend for life.' },
  provisions: { job: 'I sell FOOD, torches and potions. Wouldst thou BUY?', greet: 'Hungry? The road is long.' },
  reagents: { job: 'I gather reagents for rune-craft and herbs for remedies. Wouldst thou BUY?', greet: 'Mind the nightshade, it bites.' },
  inn: { job: 'I keep this inn. A ROOM for the night will mend thy wounds.', greet: 'Welcome, weary travellers!' },
  tavern: { job: 'I pour ale and hear many RUMOURS.', greet: 'Pull up a stool!' },
  healer: { job: 'I tend the sick. I can HEAL, CURE poison, or RAISE the fallen.', greet: 'Peace be upon thee.' },
  guard: { job: 'I keep the peace. Mind thy manners.', greet: 'Halt! Ah, travellers. Pass.' },
  lord: { job: 'I rule these lands. Seek me when thou hast proven thy worth.', greet: 'Welcome to my hall, adventurers.' },
  sage: { job: 'I study the old lore and the stars, and copy out spell scrolls. Wouldst thou BUY?', greet: 'Hmm? Oh, visitors.' },
  bowyer: { job: 'I make bows of yew and ash. Wouldst thou BUY or SELL?', greet: 'A fine bow is a friend in the wild.' },
  villager: { job: 'I work hard and keep my head down.', greet: 'Good day to thee.' },
  merchant: { job: 'I trade in a little of everything. Wouldst thou BUY or SELL?', greet: 'Come, look! Bargains from every road in the realm.' },
};

// What the generator gives a person of a role (their words and the title in
// their description), so the editor can tell a made-up townsperson from one
// the designer has written
export function madeUpWords(role) {
  const rt = ROLE_TEXT[role] || ROLE_TEXT.villager;
  return { job: rt.job, greeting: rt.greet, title: SHOP_ROLES[role]?.title?.toLowerCase() || (role === 'villager' ? 'local' : role) };
}

// Whether a name is one the generator could have made up
export function isMadeUpName(name) {
  const words = String(name || '').trim().split(/\s+/);
  if (!words[0] || words.length > 2) return !words[0];
  const all = Object.values(NAMES).some((n) => n.m.includes(words[0]) || n.f.includes(words[0]));
  return all && (words.length === 1 || BYNAMES.includes(words[1]));
}

// the shopkeepers, innkeepers and healers (each keeps a building)
export const KEEPER_ROLES = Object.keys(SHOP_ROLES);

export function nameNpcs(map, game, seed = 1) {
  const rng = new RNG(seed + 77);
  // no new name may echo anyone already in the game, in any town
  const used = npcNameWords(game);
  for (const e of map.entities) if (e.type === 'npc') for (const w of nameWords(e.name)) used.add(w);
  for (const e of map.entities) {
    if (e.type !== 'npc') continue;
    const race = e.look?.race || 'human';
    if (!e.name) {
      e.name = randomName(race, rng, used);
      for (const w of nameWords(e.name)) used.add(w);
    }
    const rt = ROLE_TEXT[e.role] || ROLE_TEXT.villager;
    if (!e.job) e.job = rt.job;
    if (!e.greeting) e.greeting = rt.greet;
    if (!e.desc) {
      const title = SHOP_ROLES[e.role]?.title?.toLowerCase() || (e.role === 'villager' ? 'local' : e.role);
      e.desc = `a ${race === 'human' ? '' : race + ' '}${title}`.replace('  ', ' ');
    }
    if (e.shop && game && !(e.shop.stock && e.shop.stock.length)) e.shop.stock = defaultStock(game, e.shop.kind);
  }
}

// charms a shop keeps: up to n of those that pass, cheapest first, never a unique one
const SAGE_CHARMS = ['orb', 'mirror', 'feather', 'lantern', 'ring', 'amulet'];
function curios(items, pass, n) {
  return items.filter((it) => it.type === 'charm' && !it.unique && (it.price || 0) > 0 && !(it.only?.races?.length || it.only?.classes?.length) && pass(it))
    .sort((a, b) => (a.price || 0) - (b.price || 0)).slice(0, n).map((it) => it.id);
}

// What a shop sells unless the designer says otherwise: ordinary gear only.
// The finest arms and armour are left for quests, hoards and hand-picked shops.
export function defaultStock(game, kind) {
  const items = game.items || [];
  const ok = (it) => !it.unique && (it.price || 0) > 0;
  switch (kind) {
    case 'weapons': return items.filter((it) => it.type === 'weapon' && ok(it) && (it.price || 0) <= 100).map((it) => it.id);
    case 'armor': return items.filter((it) => (it.type === 'armor' || it.type === 'shield') && ok(it) && (it.price || 0) <= 130).map((it) => it.id);
    case 'provisions': return items.filter((it) => (it.type === 'consumable' || it.type === 'key') && ok(it)).map((it) => it.id);
    case 'reagents': return items.filter((it) => it.type === 'reagent' && ok(it)).map((it) => it.id);
    // sages keep a few curios of magic beside their scrolls, a trading post a
    // few humble charms; a curio-seller (kind 'charms') all but the legends
    case 'scrolls': return [...items.filter((it) => it.type === 'scroll' && ok(it)).map((it) => it.id), ...curios(items, (it) => ['uncommon', 'rare'].includes(it.rarity) && SAGE_CHARMS.includes(it.kind) && (it.price || 0) <= 450, 4)];
    case 'mixed': return [...items.filter((it) => (it.type === 'consumable' || it.type === 'reagent') && ok(it) && (it.price || 0) <= 120).map((it) => it.id), ...curios(items, (it) => it.rarity === 'common' && (it.price || 0) <= 80, 4)];
    case 'charms': return curios(items, (it) => it.rarity !== 'legendary' && (it.price || 0) <= 700, 12);
    default: return [];
  }
}

// ---------------------------------------------------------------- arenas
export const ARENA_W = 13;
export const ARENA_H = 9;

export function generateArena(style, seed, opt = {}) {
  const rng = new RNG(seed);
  const W = ARENA_W, H = ARENA_H;
  const base = {
    grass: 'grass', forest: 'grass', hills: 'hills', swamp: 'swamp', desert: 'sand', snow: 'snow',
    water: 'ocean', bridge: 'grass', town: 'cobble', indoor: 'floor_stone', cave: 'cave_floor', ash: 'ash', ruins: 'grass',
  }[style] || 'grass';
  const map = createMap({ type: 'arena', w: W, h: H, name: 'Battle', fill: base });
  map.lighting = opt.lighting || 'day';
  const scatter = (keys, p, avoidRows = true) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (avoidRows && (y >= H - 2 || y <= 1)) continue;
      if (rng.chance(p)) setTile(map, x, y, T[rng.pick(keys)]);
    }
  };
  switch (style) {
    case 'grass': scatter(['meadow', 'meadow', 'tree'], 0.1); break;
    case 'forest':
      // the wood frames the fight: thick on the flanks, a few trunks for cover
      // in the middle, and open ground before each line so the foes meet quickly
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = x <= 1 || x >= W - 2 ? 0.5 : y >= 3 && y <= H - 4 ? 0.12 : 0;
        if (rng.chance(p)) setTile(map, x, y, T[rng.pick(['tree', 'tree', 'meadow'])]);
      }
      break;
    case 'hills': scatter(['mountains', 'grass'], 0.1); break;
    case 'swamp': {
      // bog pools of a few squares each (lone squares looked like tiles of ice)
      scatter(['grass'], 0.06);
      for (let n = rng.int(2, 3), k = 0; k < n; k++) {
        let x = rng.int(1, W - 2), y = rng.int(2, H - 3);
        for (let s = rng.int(2, 4); s > 0; s--) {
          setTile(map, x, y, T.shallows);
          const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
          x = Math.max(0, Math.min(W - 1, x + dx));
          y = Math.max(2, Math.min(H - 3, y + dy));
        }
      }
      break;
    }
    case 'desert': scatter(['desert', 'mountains'], 0.08); break;
    case 'snow': scatter(['pines', 'peaks'], 0.08); break;
    case 'town': scatter(['barrel', 'fountain'], 0.04); break;
    case 'indoor': for (let y = 3; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 3) if (rng.chance(0.6)) setTile(map, x, y, T.wall_stone); break;
    case 'cave': scatter(['cave_wall', 'rubble', 'cave_wall'], 0.12); for (let i = 0; i < H; i++) { if (rng.chance(0.5)) setTile(map, 0, i, T.cave_wall); if (rng.chance(0.5)) setTile(map, W - 1, i, T.cave_wall); } break;
    case 'ash': scatter(['lava', 'ash'], 0.08); break;
    case 'ruins': scatter(['wall_stone', 'rubble', 'meadow'], 0.1); break;
    case 'water': {
      // party on a ship's deck
      for (let y = H - 3; y < H; y++) for (let x = 3; x < W - 3; x++) setTile(map, x, y, T.floor_wood);
      break;
    }
    case 'bridge': for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) setTile(map, x, y, T.shallows); break;
    default: break;
  }
  // make sure spawn rows are walkable
  const clear = (key) => (x, y) => { if (!def(getTile(map, x, y)).walk) setTile(map, x, y, T[key]); };
  const partyFloor = style === 'water' ? 'floor_wood' : style === 'indoor' ? 'floor_stone' : style === 'cave' ? 'cave_floor' : style === 'swamp' ? 'grass' : base === 'ocean' ? 'floor_wood' : base;
  for (let y = H - 2; y < H; y++) for (let x = 2; x < W - 2; x++) clear(partyFloor)(x, y);
  if (style !== 'water') for (let y = 0; y < 2; y++) for (let x = 2; x < W - 2; x++) clear(partyFloor)(x, y);
  return map;
}
