// Procedural generation: chunky "stamps" used by the editor, plus whole-map
// generators for worlds, settlements, dungeons and battle arenas.
import { T, terrain, FEATURE_KINDS } from '../data/terrain.js';
import { getTile, setTile, inBounds, createMap } from './map.js';
import { fbm } from '../core/noise.js';
import { RNG, hash2 } from '../core/rng.js';
import { uid } from '../core/util.js';

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
export function generateWorld(w, h, seed, opt = {}) {
  const map = createMap({ type: 'world', w, h, name: opt.name || 'The World' });
  const water = opt.water ?? 0.45;
  const mtn = opt.mountains ?? 0.5;
  const forest = opt.forest ?? 0.5;
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = x / w, ny = y / h;
    let e = fbm(nx * 4.2, ny * 4.2, seed, 5);
    const dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2;
    const fall = Math.pow(Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + Math.hypot(dx, dy) * 0.4, 2.2);
    e = e - fall * 0.55 + 0.12;
    elev[y * w + x] = e;
  }
  // pick sea level so roughly `water` fraction is sea
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const sea = sorted[Math.floor(clamp01(water) * (sorted.length - 1))];
  const top = sorted[sorted.length - 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = elev[y * w + x];
    if (e < sea) {
      map.tiles[y * w + x] = e > sea - 0.035 ? T.shallows : T.ocean;
      continue;
    }
    const a = (e - sea) / (top - sea + 1e-6); // 0..1 altitude above sea
    const moist = fbm(x * 0.06, y * 0.06, seed + 101, 4);
    const temp = 1 - y / h + (fbm(x * 0.05, y * 0.05, seed + 202, 3) - 0.5) * 0.4;
    let k;
    if (a > 1 - 0.18 * mtn) k = a > 1 - 0.07 * mtn ? 'peaks' : 'mountains';
    else if (a > 1 - 0.3 * mtn - 0.05) k = 'hills';
    else if (a < 0.05) k = temp > 0.25 ? 'sand' : 'snow';
    else if (temp < 0.18) k = moist > 0.55 ? 'pines' : 'snow';
    else if (moist > 0.68 && a < 0.3) k = 'swamp';
    else if (moist > 1 - 0.38 * forest - 0.07) k = temp < 0.4 || moist > 0.66 ? 'pines' : 'forest';
    else if (moist < 0.32 && temp > 0.62) k = moist < 0.25 ? 'desert' : 'sand';
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
  return map;
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
};

export const SETTLEMENT_STYLES = {
  town: { ground: 'grass', street: 'cobble', wall: 'wall_stone', bwall: 'wall_wood', floor: 'floor_wood', shops: ['inn', 'tavern', 'healer', 'weapons', 'armor', 'provisions', 'reagents'], houses: 3, race: 'human', w: 38, h: 38 },
  village: { ground: 'grass', street: 'road', wall: 'palisade', bwall: 'wall_wood', floor: 'floor_wood', shops: ['provisions', 'inn', 'healer'], houses: 4, race: 'human', w: 30, h: 30 },
  castle: { ground: 'grass', street: 'cobble', wall: 'wall_stone', bwall: 'wall_stone', floor: 'floor_stone', shops: ['healer', 'weapons', 'armor'], houses: 1, race: 'human', w: 38, h: 38 },
  elfhall: { ground: 'meadow', street: 'road', wall: 'tree', bwall: 'wall_wood', floor: 'floor_wood', shops: ['inn', 'healer', 'bowyer', 'reagents'], houses: 3, race: 'elf', w: 34, h: 34 },
  dwarfgate: { ground: 'floor_stone', street: 'floor_stone', wall: 'cave_wall', bwall: 'wall_stone', floor: 'floor_stone', shops: ['tavern', 'healer', 'weapons', 'armor', 'provisions'], houses: 2, race: 'dwarf', w: 36, h: 36, underground: true },
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
};

function makeNpc(role, race, x, y, rng, extra = {}) {
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
    shop: SHOP_ROLES[role] ? { kind: SHOP_ROLES[role].kind, stock: [] } : null,
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
    spot = { x: ax, y: door.side === 's' ? ay + 1 : ay - 1 };
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

export function generateSettlement(kind, opt = {}) {
  const S = SETTLEMENT_STYLES[kind] || SETTLEMENT_STYLES.town;
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const w = opt.w || S.w, h = opt.h || S.h;
  const mapType = kind === 'castle' ? 'castle' : 'town';
  const map = createMap({ type: mapType, w, h, name: opt.name || 'Settlement', fill: S.underground ? 'cave_wall' : S.ground });
  map.lighting = S.underground ? 'dark' : 'day';
  const buildings = [];
  const npcs = [];
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);

  if (S.underground) {
    // carve the great hall and an entrance tunnel from the south
    fillRect(map, 4, 4, w - 8, h - 9, 'floor_stone');
    fillRect(map, cx - 1, h - 6, 3, 6, 'floor_stone');
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
    const inset = kind === 'castle' ? 3 : 2;
    if (kind === 'castle') {
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (x <= 2 || y <= 2 || x >= w - 3 || y >= h - 3) setTile(map, x, y, T.shallows);
      }
      fillRect(map, cx - 1, h - 3, 3, 2, 'bridge');
      fillRect(map, cx - 1, h - 1, 3, 1, 'cobble');
    }
    if (S.wall === 'tree') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (edge <= 2 && hash2(x, y, rng.seed) < 0.75 - edge * 0.2) setTile(map, x, y, T.tree);
      }
    } else {
      for (let x = inset; x < w - inset; x++) { setTile(map, x, inset, T[S.wall]); setTile(map, x, h - 1 - inset, T[S.wall]); }
      for (let y = inset; y < h - inset; y++) { setTile(map, inset, y, T[S.wall]); setTile(map, w - 1 - inset, y, T[S.wall]); }
      if (kind === 'castle') {
        for (const [tx, ty] of [[inset, inset], [w - inset - 3, inset], [inset, h - inset - 3], [w - inset - 3, h - inset - 3]]) fillRect(map, tx, ty, 3, 3, 'wall_stone');
      }
    }
    // gates
    const gates = kind === 'castle' ? [[cx, h - 1 - inset]] : [[cx, inset], [cx, h - 1 - inset], [inset, cy], [w - 1 - inset, cy]];
    for (const [gx, gy] of gates) {
      for (let d = -1; d <= 1; d++) {
        if (gy === inset || gy === h - 1 - inset) setTile(map, gx + d, gy, T[S.street]);
        else setTile(map, gx, gy + d, T[S.street]);
      }
    }
    // streets
    const st = T[S.street];
    for (let y = inset + 1; y < h - inset - 1; y++) { setTile(map, cx, y, st); setTile(map, cx - 1, y, st); }
    if (kind !== 'castle') for (let x = inset + 1; x < w - inset - 1; x++) { setTile(map, x, cy, st); setTile(map, x, cy - 1, st); }
    // edge paths so the gate connects to the map edge
    for (let y = h - 1 - inset; y < h; y++) setTile(map, cx, y, st), setTile(map, cx - 1, y, st);
    if (kind !== 'castle') {
      for (let y = 0; y <= inset; y++) setTile(map, cx, y, st), setTile(map, cx - 1, y, st);
      for (let x = 0; x <= inset; x++) setTile(map, x, cy, st), setTile(map, x, cy - 1, st);
      for (let x = w - 1 - inset; x < w; x++) setTile(map, x, cy, st), setTile(map, x, cy - 1, st);
    }
    // plaza
    if (kind !== 'castle') {
      fillRect(map, cx - 3, cy - 4, 6, 6, S.street);
      setTile(map, cx - 1, cy - 1, T.fountain);
    }
  }

  // castle keep with throne room
  if (kind === 'castle') {
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
    npcs.push(makeNpc('guard', 'human', cx - 3, ky + 3, rng, { wander: 0 }));
    npcs.push(makeNpc('guard', 'human', cx + 2, ky + 3, rng, { wander: 0 }));
    npcs.push(makeNpc('sage', 'human', kx + 3, ky + kh - 3, rng, { wander: 2 }));
  }
  if (kind === 'dwarfgate') {
    // king's hall at the north end
    fillRect(map, cx - 3, 4, 6, 3, 'carpet');
    setTile(map, cx - 1, 4, T.throne);
    const lord = makeNpc('lord', 'dwarf', cx - 1, 5, rng, { wander: 0 });
    lord.look.body = 0x6a3a1a; lord.look.robe = false; lord.look.armor = 'plate';
    npcs.push(lord);
    buildings.push({ role: 'keep', npc: lord.id });
  }

  // place shops and houses
  const roles = [...S.shops];
  for (let i = 0; i < S.houses; i++) roles.push('house');
  const ground = new Set([T[S.ground], T.meadow, T.grass, T.floor_stone]);
  const okTile = (t) => ground.has(t) || (S.underground && t === T.floor_stone);
  for (const role of roles) {
    let placed = false;
    for (let attempt = 0; attempt < 400 && !placed; attempt++) {
      const big = role === 'inn' || role === 'tavern' || role === 'healer';
      const shrink = attempt > 250 ? 1 : 0;
      const bw = (big ? rng.int(7, 8) : role === 'house' ? rng.int(5, 6) : rng.int(6, 7)) - shrink;
      const bh = (big ? rng.int(6, 7) : role === 'house' ? rng.int(4, 5) : rng.int(5, 6)) - shrink;
      const x0 = rng.int(3, w - bw - 3), y0 = rng.int(3, h - bh - 3);
      if (!rectFree(map, x0, y0, bw, bh, (t) => okTile(t))) continue;
      if (npcs.some((n) => n.x >= x0 - 1 && n.y >= y0 - 1 && n.x <= x0 + bw && n.y <= y0 + bh)) continue;
      // door faces the nearest street
      const mx = x0 + bw / 2, my = y0 + bh / 2;
      let door;
      if (kind === 'castle' || S.underground) door = Math.abs(mx - cx) > Math.abs(my - cy) ? (mx < cx ? 'e' : 'w') : (my < cy ? 's' : 'n');
      else door = Math.abs(mx - cx) < Math.abs(my - cy) ? (mx < cx ? 'e' : 'w') : (my < cy ? 's' : 'n');
      const b = buildRoom(map, x0, y0, bw, bh, { wall: role === 'healer' ? 'wall_stone' : S.bwall, floor: role === 'healer' ? 'floor_stone' : S.floor, door });
      const spot = furnish(map, b, role, rng);
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
      const npc = makeNpc(role === 'house' ? 'villager' : role, S.race, spot.x, spot.y, rng);
      npcs.push(npc);
      buildings.push({ ...b, role, npc: npc.id });
      placed = true;
    }
  }

  // greenery & clutter
  if (!S.underground) {
    const green = (tt) => tt === T.grass || tt === T.meadow || tt === T.garden || tt === T.tree;
    const elvish = kind === 'elfhall';
    for (let i = 0; i < (elvish ? 260 : 14); i++) {
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
      for (let i = 0; i < 3; i++) {
        const x0 = rng.int(4, w - 9), y0 = rng.int(4, h - 8);
        if (rectFree(map, x0, y0, 4, 3, (t) => t === T.grass || t === T.meadow)) fillRect(map, x0, y0, 4, 3, 'crops');
      }
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const x = rng.int(5, w - 6), y = rng.int(5, h - 8);
      if (getTile(map, x, y) === T.floor_stone && rectFree(map, x, y, 1, 1, (t) => t === T.floor_stone)) setTile(map, x, y, rng.chance(0.5) ? T.anvil : T.barrel);
    }
  }

  // guards and wanderers
  if (!S.underground && kind !== 'elfhall') {
    const gy = h - (kind === 'castle' ? 5 : 4);
    npcs.push(makeNpc('guard', 'human', cx - 2, gy, rng, { wander: 0 }));
    npcs.push(makeNpc('guard', 'human', cx + 1, gy, rng, { wander: 0 }));
  }
  const nWander = kind === 'castle' ? 3 : 4;
  for (let i = 0; i < nWander; i++) {
    for (let a = 0; a < 40; a++) {
      const x = rng.int(3, w - 4), y = rng.int(3, h - 4);
      const t = getTile(map, x, y);
      if (t === T[S.street] || t === T.grass || t === T.meadow) {
        npcs.push(makeNpc('villager', rng.chance(0.75) ? S.race : rng.pick(['human', 'elf', 'dwarf']), x, y, rng, { wander: 5 }));
        break;
      }
    }
  }
  map.entities.push(...npcs);
  map.entry = { x: cx - 1, y: h - 2 };
  if (S.underground) map.entry = { x: cx, y: h - 2 };
  return { map, buildings, npcs };
}

// ---------------------------------------------------------------- dungeons
export const DUNGEON_STYLES = {
  cave: { wall: 'cave_wall', floor: 'cave_floor', deco: ['rubble', 'bones', 'web', 'crystal', 'pit_water'] },
  crypt: { wall: 'dungeon_wall', floor: 'dungeon_floor', deco: ['bones', 'rubble', 'brazier', 'web'] },
  fortress: { wall: 'dungeon_wall', floor: 'floor_stone', deco: ['brazier', 'bones', 'lava', 'rubble'] },
};

export function generateDungeon(opt = {}) {
  const style = DUNGEON_STYLES[opt.style] || DUNGEON_STYLES.cave;
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const w = opt.w || 36, h = opt.h || 36;
  const map = createMap({ type: 'dungeon', w, h, name: opt.name || 'Dungeon', fill: style.wall });
  map.lighting = 'dark';
  map.level = opt.level || 1;
  const rooms = [];
  for (let i = 0; i < 80 && rooms.length < (opt.rooms || 9); i++) {
    const rw = rng.int(4, 8), rh = rng.int(4, 7);
    const x0 = rng.int(2, w - rw - 2), y0 = rng.int(2, h - rh - 2);
    if (rooms.some((r) => x0 < r.x + r.w + 2 && x0 + rw + 2 > r.x && y0 < r.y + r.h + 2 && y0 + rh + 2 > r.y)) continue;
    rooms.push({ x: x0, y: y0, w: rw, h: rh, cx: x0 + Math.floor(rw / 2), cy: y0 + Math.floor(rh / 2) });
  }
  const carve = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) setTile(map, x, y, T[style.floor]); };
  for (const r of rooms) {
    if (opt.style === 'cave') {
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
      if (opt.style === 'cave' && rng.chance(0.3)) carve(x + 1, y);
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
    if (opt.style !== 'cave' && rng.chance(0.5)) {
      setTile(map, r.x, r.y, T.brazier);
    }
  }
  // the deepest room (last) holds the treasure; mid rooms hold monsters & chests
  const last = rooms[rooms.length - 1];
  map.entities.push({ id: uid('chest'), type: 'chest', x: last.cx, y: last.cy, gold: 80 + map.level * 60, items: [] });
  const monsters = opt.monsters || [];
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    if (monsters.length && (i < rooms.length - 1 || !opt.boss)) {
      const mx = r.cx + (rng.chance(0.5) ? 1 : -1), my = r.cy;
      if (def(getTile(map, mx, my)).walk) map.entities.push({ id: uid('mon'), type: 'monster', x: mx, y: my, monster: rng.pick(monsters), count: '2-4', wander: 3 });
    }
    if (i < rooms.length - 1 && rng.chance(0.35)) {
      const x = r.x + r.w - 1, y = r.y + r.h - 1;
      if (def(getTile(map, x, y)).walk) map.entities.push({ id: uid('chest'), type: 'chest', x, y, gold: rng.int(10, 30) * map.level, items: rng.chance(0.5) ? [{ id: 'healing_draught', n: 1 }] : [] });
    }
  }
  if (opt.boss) {
    map.entities.push({ id: uid('mon'), type: 'monster', x: last.cx, y: Math.max(last.y, last.cy - 1), monster: opt.boss, count: '1', wander: 0, boss: true });
  }
  map.encounterRate = 0.6;
  return { map, rooms, last };
}

// ---------------------------------------------------------------- feature placement
export function placeFeature(game, world, x, y, kind, name, seed) {
  const fk = FEATURE_KINDS[kind];
  if (!fk) return null;
  setTile(world, x, y, T[fk.terrain]);
  let sub;
  const s = seed ?? Math.floor(Math.random() * 1e9);
  if (fk.mapType === 'dungeon') {
    const style = kind === 'fortress' ? 'fortress' : kind === 'tower' ? 'crypt' : 'cave';
    sub = generateDungeon({ name, seed: s, style, monsters: kind === 'fortress' ? ['orc', 'orc_archer', 'skeleton'] : ['goblin', 'giant_rat', 'skeleton', 'giant_spider'] }).map;
  } else {
    const style = kind === 'castle' ? 'castle' : kind === 'village' ? 'village' : kind === 'elfhall' ? 'elfhall' : kind === 'dwarfgate' ? 'dwarfgate' : 'town';
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

const NAMES = {
  human: { m: ['Aldric', 'Bram', 'Cedric', 'Doran', 'Edwin', 'Garret', 'Hal', 'Osric', 'Rowan', 'Tobin', 'Wilf', 'Merek', 'Alder', 'Bertram', 'Corwin', 'Duncan', 'Emeric', 'Godwin', 'Hugh', 'Jory', 'Leofric', 'Piers', 'Roland', 'Simon', 'Walter'],
    f: ['Ada', 'Brenna', 'Edith', 'Gwen', 'Hilda', 'Isolde', 'Maud', 'Rowena', 'Tilda', 'Wynn', 'Agnes', 'Beatrix', 'Cecily', 'Elena', 'Freya', 'Joan', 'Mabel', 'Nell', 'Rosalind', 'Sybil'] },
  elf: { m: ['Aerendil', 'Caladir', 'Elrandir', 'Faelon', 'Galathil', 'Lindor', 'Thalion', 'Aranel', 'Calen', 'Erestor', 'Gilmir', 'Halmir', 'Orophin', 'Saeros'],
    f: ['Arwyn', 'Celebrin', 'Elanor', 'Ithilwen', 'Laurelin', 'Nimloth', 'Silmariel', 'Aerin', 'Elemmire', 'Finduilas', 'Lothiel', 'Miriel', 'Tinuviel'] },
  dwarf: { m: ['Balor', 'Borin', 'Dain', 'Durgan', 'Farin', 'Grimbold', 'Thrar', 'Norri', 'Bofur', 'Dwalin', 'Gloin', 'Hrothgar', 'Korin', 'Nain', 'Skafid', 'Thekk'], f: ['Brunhild', 'Disa', 'Hilda', 'Thora', 'Vigdis', 'Dagny', 'Gerd', 'Helga', 'Sigrun', 'Ylva'] },
};

export function randomName(race, rng) {
  const n = NAMES[race] || NAMES.human;
  return rng.pick(rng.chance(0.5) ? n.m : n.f);
}

const ROLE_TEXT = {
  weapons: { job: 'I forge blades and sell arms. Wouldst thou BUY or SELL?', greet: 'Steel for the road, traveller?' },
  armor: { job: 'I sell armour of every kind. Wouldst thou BUY or SELL?', greet: 'A good hauberk is a friend for life.' },
  provisions: { job: 'I sell FOOD, torches and potions. Wouldst thou BUY?', greet: 'Hungry? The road is long.' },
  reagents: { job: 'I gather reagents for rune-craft. Wouldst thou BUY?', greet: 'Mind the nightshade, it bites.' },
  inn: { job: 'I keep this inn. A ROOM for the night will mend thy wounds.', greet: 'Welcome, weary travellers!' },
  tavern: { job: 'I pour ale and hear many RUMOURS.', greet: 'Pull up a stool!' },
  healer: { job: 'I tend the sick. I can HEAL, CURE poison, or RAISE the fallen.', greet: 'Peace be upon thee.' },
  guard: { job: 'I keep the peace. Mind thy manners.', greet: 'Halt! Ah, travellers. Pass.' },
  lord: { job: 'I rule these lands. Seek me when thou hast proven thy worth.', greet: 'Welcome to my hall, adventurers.' },
  sage: { job: 'I study the old lore and the stars.', greet: 'Hmm? Oh, visitors.' },
  bowyer: { job: 'I make bows of yew and ash. Wouldst thou BUY or SELL?', greet: 'A fine bow is a friend in the wild.' },
  villager: { job: 'I work hard and keep my head down.', greet: 'Good day to thee.' },
};

export function nameNpcs(map, game, seed = 1) {
  const rng = new RNG(seed + 77);
  const used = new Set(map.entities.filter((e) => e.type === 'npc' && e.name).map((e) => e.name));
  for (const e of map.entities) {
    if (e.type !== 'npc') continue;
    const race = e.look?.race || 'human';
    if (!e.name) {
      let n = randomName(race, rng);
      for (let i = 0; i < 12 && used.has(n); i++) n = randomName(race, rng);
      e.name = n;
      used.add(n);
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

export function defaultStock(game, kind) {
  const items = game.items || [];
  const ok = (it) => !it.unique && (it.price || 0) > 0;
  switch (kind) {
    case 'weapons': return items.filter((it) => it.type === 'weapon' && ok(it) && (it.price || 0) <= 400).map((it) => it.id);
    case 'armor': return items.filter((it) => (it.type === 'armor' || it.type === 'shield') && ok(it) && (it.price || 0) <= 500).map((it) => it.id);
    case 'provisions': return items.filter((it) => (it.type === 'consumable' || it.type === 'key') && ok(it)).map((it) => it.id);
    case 'reagents': return items.filter((it) => it.type === 'reagent' && ok(it)).map((it) => it.id);
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
    case 'forest': scatter(['tree', 'tree', 'meadow'], 0.2, false); break;
    case 'hills': scatter(['mountains', 'grass'], 0.1); break;
    case 'swamp': scatter(['shallows', 'grass'], 0.12); break;
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
