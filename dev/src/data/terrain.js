// Built-in terrain types. The numeric index is what is stored in map data, so
// never reorder: only append new entries.
//
// Props:
//   walk   - passable on foot          ship  - passable by ship
//   sight  - blocks line of sight      h     - surface height
//   top    - top colour                side  - side colour
//   deco   - decoration builder key    water - render as water
//   wall   - tall block                slow  - chance a step is slowed
//   poison - chance of poisoning when entering
//   dmg    - damage dealt when entering (lava)
//   arena  - battle arena style        feature - world-map site icon
//   light  - emits light (dungeon visibility)
//   talkOver - NPCs can be talked to across it (shop counters)

const defs = [
  // id, key, name, group, props
  [0, 'ocean', 'Deep Water', 'world', { walk: false, ship: true, water: true, h: -0.34, top: 0x235f9c, arena: 'water' }],
  [1, 'shallows', 'Shallow Water', 'world', { walk: false, ship: true, water: true, h: -0.2, top: 0x3a88bb, arena: 'water' }],
  [2, 'grass', 'Grassland', 'world', { h: 0, top: 0x6c9f48, side: 0x6b4f2e, deco: 'tufts', arena: 'grass' }],
  [3, 'meadow', 'Meadow', 'world', { h: 0, top: 0x8aaf55, side: 0x6b4f2e, deco: 'flowers', arena: 'grass' }],
  [4, 'forest', 'Forest', 'world', { h: 0.02, top: 0x3f7a30, side: 0x5a4127, deco: 'trees', sight: true, slow: 0.2, arena: 'forest' }],
  [5, 'pines', 'Pine Woods', 'world', { h: 0.02, top: 0x35612c, side: 0x5a4127, deco: 'pines', sight: true, slow: 0.25, arena: 'forest' }],
  [6, 'hills', 'Hills', 'world', { h: 0.08, top: 0x8c9a4c, side: 0x6b5534, deco: 'hill', slow: 0.3, arena: 'hills' }],
  [7, 'mountains', 'Mountains', 'world', { walk: false, sight: true, h: 0.14, top: 0x7d7468, side: 0x5f574d, deco: 'mountain', arena: 'hills' }],
  [8, 'peaks', 'Snowy Peaks', 'world', { walk: false, sight: true, h: 0.18, top: 0xc9cfd6, side: 0x777b80, deco: 'peak', arena: 'snow' }],
  [9, 'swamp', 'Swamp', 'world', { h: -0.05, top: 0x4c5a33, side: 0x3f3a25, deco: 'reeds', slow: 0.3, poison: 0.15, arena: 'swamp' }],
  [10, 'sand', 'Sand', 'world', { h: -0.03, top: 0xdcc78d, side: 0xb59a62, deco: 'pebbles', arena: 'desert' }],
  [11, 'desert', 'Desert Dunes', 'world', { h: -0.01, top: 0xe2bf72, side: 0xb59a62, deco: 'dunes', slow: 0.15, arena: 'desert' }],
  [12, 'snow', 'Snowfield', 'world', { h: 0.02, top: 0xeaf0f4, side: 0x9aa3ab, deco: 'snowdrift', arena: 'snow' }],
  [13, 'road', 'Road', 'world', { h: 0.0, top: 0xb08f5c, side: 0x6b4f2e, deco: 'road', arena: 'grass' }],
  [14, 'bridge', 'Bridge', 'world', { h: -0.2, water: true, top: 0x3c8fc0, deco: 'bridge', walk: true, arena: 'bridge' }],
  [15, 'lava', 'Lava', 'world', { h: -0.06, top: 0xff5a14, side: 0x3a2a24, deco: 'lava', dmg: 6, light: 3, arena: 'ash' }],
  [16, 'ash', 'Ashen Waste', 'world', { h: 0, top: 0x4b4542, side: 0x302b29, deco: 'ashrocks', arena: 'ash' }],
  [17, 'town', 'Town', 'world', { h: 0, top: 0x6aa84f, side: 0x6b4f2e, deco: 'town', feature: true, arena: 'grass' }],
  [18, 'castle', 'Castle', 'world', { h: 0, top: 0x6aa84f, side: 0x6b4f2e, deco: 'castle', feature: true, arena: 'grass' }],
  [19, 'village', 'Village', 'world', { h: 0, top: 0x6aa84f, side: 0x6b4f2e, deco: 'village', feature: true, arena: 'grass' }],
  [20, 'cave', 'Cave Entrance', 'world', { h: 0, top: 0x8c9a4c, side: 0x6b5534, deco: 'cave', feature: true, arena: 'hills' }],
  [21, 'tower', 'Tower', 'world', { h: 0, top: 0x6aa84f, side: 0x6b4f2e, deco: 'tower', feature: true, arena: 'grass' }],
  [22, 'ruins', 'Ruins', 'world', { h: 0, top: 0x7d8a5a, side: 0x6b4f2e, deco: 'ruins', arena: 'ruins' }],
  [23, 'fortress', 'Dark Fortress', 'world', { h: 0.02, top: 0x4b4542, side: 0x302b29, deco: 'fortress', feature: true, arena: 'ash' }],
  [24, 'elfhall', 'Elven Hall', 'world', { h: 0, top: 0x3f7a30, side: 0x5a4127, deco: 'elfhall', feature: true, arena: 'forest' }],
  [25, 'dwarfgate', 'Dwarf Gate', 'world', { h: 0.14, top: 0x7d7468, side: 0x5f574d, deco: 'dwarfgate', feature: true, arena: 'hills' }],

  // Settlements & interiors
  [40, 'cobble', 'Cobblestones', 'town', { h: 0, top: 0x908a80, side: 0x6a645c, deco: 'cobble', arena: 'town' }],
  [41, 'floor_wood', 'Wood Floor', 'town', { h: 0.02, top: 0x9b6a3c, side: 0x6a4626, deco: 'planks', arena: 'indoor' }],
  [42, 'floor_stone', 'Flagstone Floor', 'town', { h: 0.02, top: 0xa29d92, side: 0x7d776c, deco: 'flags', arena: 'indoor' }],
  [43, 'carpet', 'Carpet', 'town', { h: 0.03, top: 0x8e2430, side: 0x6a1a22, deco: 'carpet', arena: 'indoor' }],
  [44, 'wall_stone', 'Stone Wall', 'town', { walk: false, sight: true, wall: true, h: 0.62, top: 0xaaa497, side: 0x847d70, deco: 'stonewall' }],
  [45, 'wall_wood', 'Timber Wall', 'town', { walk: false, sight: true, wall: true, h: 0.55, top: 0x9a7650, side: 0xd8c8a6, deco: 'timberwall' }],
  [46, 'door', 'Door', 'town', { h: 0.02, top: 0x9b6a3c, side: 0x6a4626, sight: true, deco: 'door', door: true, arena: 'indoor' }],
  [47, 'door_locked', 'Locked Door', 'town', { walk: false, h: 0.02, top: 0x9b6a3c, side: 0x6a4626, sight: true, deco: 'lockeddoor', door: true, locked: true }],
  [48, 'window', 'Window', 'town', { walk: false, wall: true, h: 0.55, top: 0x9a7650, side: 0xd8c8a6, deco: 'window' }],
  [49, 'counter', 'Counter', 'town', { walk: false, h: 0.02, top: 0x9b6a3c, side: 0x6a4626, deco: 'counter', talkOver: true }],
  [50, 'table', 'Table', 'town', { walk: false, h: 0.02, top: 0x9b6a3c, side: 0x6a4626, deco: 'table' }],
  [51, 'bed', 'Bed', 'town', { walk: false, h: 0.02, top: 0x9b6a3c, side: 0x6a4626, deco: 'bed' }],
  [52, 'hearth', 'Hearth', 'town', { walk: false, h: 0.02, top: 0xa29d92, side: 0x7d776c, deco: 'hearth', light: 3 }],
  [53, 'fountain', 'Fountain', 'town', { walk: false, h: 0, top: 0x908a80, side: 0x6a645c, deco: 'fountain' }],
  [54, 'statue', 'Statue', 'town', { walk: false, h: 0, top: 0x908a80, side: 0x6a645c, deco: 'statue' }],
  [55, 'garden', 'Garden', 'town', { h: 0, top: 0x6aa84f, side: 0x6b4f2e, deco: 'garden', arena: 'grass' }],
  [56, 'tree', 'Tree', 'town', { walk: false, sight: true, h: 0, top: 0x5f9a45, side: 0x6b4f2e, deco: 'bigtree' }],
  [57, 'shelf', 'Bookshelf', 'town', { walk: false, sight: true, h: 0.02, top: 0x9b6a3c, side: 0x6a4626, deco: 'shelf' }],
  [58, 'anvil', 'Anvil', 'town', { walk: false, h: 0.02, top: 0xa29d92, side: 0x7d776c, deco: 'anvil' }],
  [59, 'barrel', 'Barrels', 'town', { walk: false, h: 0, top: 0x908a80, side: 0x6a645c, deco: 'barrels' }],
  [60, 'throne', 'Throne', 'town', { walk: false, h: 0.03, top: 0x8e2430, side: 0x6a1a22, deco: 'throne' }],
  [61, 'altar', 'Altar', 'town', { walk: false, h: 0.02, top: 0xa29d92, side: 0x7d776c, deco: 'altar', light: 2 }],
  [62, 'stairs_down', 'Stairs Down', 'any', { h: 0.02, top: 0x6b655c, side: 0x4a453f, deco: 'stairsdown', arena: 'indoor' }],
  [63, 'stairs_up', 'Stairs Up', 'any', { h: 0.02, top: 0x8a847a, side: 0x4a453f, deco: 'stairsup', arena: 'indoor' }],
  [64, 'brazier', 'Brazier', 'any', { walk: false, h: 0.02, top: 0x5a5048, side: 0x3d3631, deco: 'brazier', light: 4 }],
  [65, 'crops', 'Crops', 'town', { h: 0, top: 0x7a5e34, side: 0x5a4127, deco: 'crops', arena: 'grass' }],
  [66, 'fence', 'Fence', 'town', { walk: false, h: 0, top: 0x6aa84f, side: 0x6b4f2e, deco: 'fence' }],
  [67, 'palisade', 'Palisade', 'town', { walk: false, sight: true, wall: true, h: 0.05, top: 0x7a5a36, side: 0x5a4127, deco: 'palisade' }],

  // Dungeon
  [80, 'cave_floor', 'Cave Floor', 'dungeon', { h: 0, top: 0x7a6e60, side: 0x403a34, deco: 'cavefloor', arena: 'cave' }],
  [81, 'cave_wall', 'Rock Wall', 'dungeon', { walk: false, sight: true, wall: true, h: 0.8, top: 0x2a2520, side: 0x4a4038, deco: 'rockwall' }],
  [82, 'dungeon_floor', 'Dungeon Floor', 'dungeon', { h: 0, top: 0x5a5650, side: 0x47443f, deco: 'dflags', arena: 'indoor' }],
  [83, 'dungeon_wall', 'Dungeon Wall', 'dungeon', { walk: false, sight: true, wall: true, h: 0.8, top: 0x24211f, side: 0x6a645a, deco: 'dwall' }],
  [84, 'rubble', 'Rubble', 'dungeon', { h: 0, top: 0x5f564d, side: 0x403a34, deco: 'rubble', slow: 0.4, arena: 'cave' }],
  [85, 'chasm', 'Chasm', 'dungeon', { walk: false, h: -1.2, top: 0x0b0a0a, side: 0x1c1917 }],
  [86, 'web', 'Webs', 'dungeon', { h: 0, top: 0x5f564d, side: 0x403a34, deco: 'web', slow: 0.6, arena: 'cave' }],
  [87, 'bones', 'Bone Pile', 'dungeon', { h: 0, top: 0x5f564d, side: 0x403a34, deco: 'bones', arena: 'cave' }],
  [88, 'pit_water', 'Dark Pool', 'dungeon', { walk: false, water: true, h: -0.18, top: 0x1d3550, arena: 'cave' }],
  [89, 'crystal', 'Crystals', 'dungeon', { walk: false, h: 0, top: 0x5f564d, side: 0x403a34, deco: 'crystal', light: 2 }],
  [90, 'void', 'Void', 'dungeon', { walk: false, sight: true, h: -1.5, top: 0x050505, side: 0x050505 }],
];

export const TERRAIN = [];
export const T = {};
for (const [id, key, name, group, p] of defs) {
  const t = {
    id, key, name, group,
    walk: p.walk !== false,
    ship: !!p.ship,
    sight: !!p.sight,
    h: p.h ?? 0,
    top: p.top ?? 0x777777,
    side: p.side ?? p.top ?? 0x555555,
    deco: p.deco || null,
    water: !!p.water,
    wall: !!p.wall,
    slow: p.slow || 0,
    poison: p.poison || 0,
    dmg: p.dmg || 0,
    arena: p.arena || 'grass',
    feature: !!p.feature,
    light: p.light || 0,
    door: !!p.door,
    locked: !!p.locked,
    talkOver: !!p.talkOver,
  };
  TERRAIN[id] = t;
  T[key] = id;
}

export const TERRAIN_LIST = TERRAIN.filter(Boolean);

export function terrain(id) {
  return TERRAIN[id] || TERRAIN[T.grass];
}

// Which terrains a palette should offer for a given map type
export function paletteFor(mapType) {
  const groups = mapType === 'world' ? ['world', 'any']
    : mapType === 'dungeon' ? ['dungeon', 'any', 'town']
    : ['town', 'any', 'world'];
  const list = [];
  for (const g of groups) for (const t of TERRAIN_LIST) if (t.group === g && !list.includes(t)) list.push(t);
  return list;
}

export const FEATURE_KINDS = {
  town: { terrain: 'town', mapType: 'town', label: 'Town' },
  castle: { terrain: 'castle', mapType: 'castle', label: 'Castle' },
  village: { terrain: 'village', mapType: 'town', label: 'Village' },
  cave: { terrain: 'cave', mapType: 'dungeon', label: 'Dungeon' },
  tower: { terrain: 'tower', mapType: 'dungeon', label: 'Tower' },
  fortress: { terrain: 'fortress', mapType: 'dungeon', label: 'Dark Fortress' },
  elfhall: { terrain: 'elfhall', mapType: 'town', label: 'Elven Hall' },
  dwarfgate: { terrain: 'dwarfgate', mapType: 'town', label: 'Dwarf Hold' },
};
