// Editor tools: painting, chunky stamps, paths, rooms, sites and entities.
import { T, terrain, FEATURE_KINDS } from '../../data/terrain.js';
import { getTile, setTile, inBounds } from '../../world/map.js';
import { STAMPS, PATHS, ROOMS, buildRoom, furnish, forBlob, line4, placeFeature, nameNpcs, npcLook, randomName } from '../../world/generate.js';
import { RNG, hash2 } from '../../core/rng.js';
import { uid } from '../../core/util.js';
import { promptDialog, toast } from '../dom.js';

function brushTiles(cx, cy, size) {
  const out = [];
  const r = (size - 1) / 2;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    if (size > 2 && dx * dx + dy * dy > (r + 0.5) * (r + 0.5)) continue;
    if (size === 2 && (dx < 0 || dy < 0)) continue;
    out.push([cx + dx, cy + dy]);
  }
  return out;
}

class Bounds {
  constructor() { this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity; }
  add(x, y) { this.x0 = Math.min(this.x0, x); this.y0 = Math.min(this.y0, y); this.x1 = Math.max(this.x1, x); this.y1 = Math.max(this.y1, y); }
  get empty() { return this.x1 < this.x0; }
}

function paintAt(ed, x, y, prob = 1) {
  const b = new Bounds();
  for (const [tx, ty] of brushTiles(x, y, ed.brush)) {
    if (prob < 1 && Math.random() > prob) continue;
    if (setTile(ed.map, tx, ty, ed.tile)) b.add(tx, ty);
  }
  ed.changed(b);
}

// ------------------------------------------------------------ paint tools
export const PAINT_TOOLS = {
  brush: {
    label: 'Brush', icon: '🖌', hint: 'Paint the selected tile. Drag to paint strokes.', cursor: 'brush',
    down(ed, t) { ed.beginEdit(); this.last = t; paintAt(ed, t.x, t.y); },
    drag(ed, t) {
      for (const [x, y] of line4(this.last.x, this.last.y, t.x, t.y)) paintAt(ed, x, y);
      this.last = t;
    },
  },
  scatter: {
    label: 'Scatter', icon: '✨', hint: 'Sprinkle the selected tile sparsely — great for natural-looking woods and rocks.', cursor: 'brush',
    down(ed, t) { ed.beginEdit(); this.last = t; paintAt(ed, t.x, t.y, 0.2); },
    drag(ed, t) {
      if (t.x === this.last.x && t.y === this.last.y) return;
      paintAt(ed, t.x, t.y, 0.2);
      this.last = t;
    },
  },
  line: {
    label: 'Line', icon: '╱', hint: 'Drag to draw a straight line of tiles.', cursor: 'tile',
    down(ed, t) { this.start = t; this.end = t; ed.view.setLine([t, t]); },
    drag(ed, t) { this.end = t; ed.view.setLine([this.start, t]); },
    up(ed) {
      ed.view.setLine(null);
      if (!this.start) return;
      ed.beginEdit();
      for (const [x, y] of line4(this.start.x, this.start.y, this.end.x, this.end.y)) paintAt(ed, x, y);
      this.start = null;
    },
  },
  rect: {
    label: 'Rectangle', icon: '▭', hint: 'Drag to fill a rectangle. Hold Shift for an outline only.', cursor: 'tile',
    down(ed, t) { this.start = t; this.end = t; this.preview(ed); },
    drag(ed, t) { this.end = t; this.preview(ed); },
    preview(ed) {
      const cells = [];
      const [x0, x1] = [Math.min(this.start.x, this.end.x), Math.max(this.start.x, this.end.x)];
      const [y0, y1] = [Math.min(this.start.y, this.end.y), Math.max(this.start.y, this.end.y)];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ x, y });
      ed.view.setHighlights(cells, 0xffe080, 0.35);
    },
    up(ed, t, e) {
      ed.view.setHighlights(null);
      if (!this.start) return;
      ed.beginEdit();
      const b = new Bounds();
      const [x0, x1] = [Math.min(this.start.x, this.end.x), Math.max(this.start.x, this.end.x)];
      const [y0, y1] = [Math.min(this.start.y, this.end.y), Math.max(this.start.y, this.end.y)];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (e && e.shiftKey && x > x0 && x < x1 && y > y0 && y < y1) continue;
        if (setTile(ed.map, x, y, ed.tile)) b.add(x, y);
      }
      ed.changed(b);
      this.start = null;
    },
  },
  fill: {
    label: 'Fill', icon: '🪣', hint: 'Flood-fill a connected area of the same tile.', cursor: 'tile',
    down(ed, t) {
      const map = ed.map;
      if (!inBounds(map, t.x, t.y)) return;
      const from = getTile(map, t.x, t.y);
      if (from === ed.tile) return;
      ed.beginEdit();
      const b = new Bounds();
      const stack = [[t.x, t.y]];
      let n = 0;
      while (stack.length && n < 40000) {
        const [x, y] = stack.pop();
        if (!inBounds(map, x, y) || getTile(map, x, y) !== from) continue;
        setTile(map, x, y, ed.tile);
        b.add(x, y);
        n++;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      ed.changed(b);
    },
  },
  picker: {
    label: 'Pick', icon: '💧', hint: 'Click a tile to select its type for painting.', cursor: 'tile',
    down(ed, t) {
      if (!inBounds(ed.map, t.x, t.y)) return;
      ed.setPaintTile(getTile(ed.map, t.x, t.y));
      ed.setTool(ed.prevPaintTool || 'brush');
    },
  },
};

// ------------------------------------------------------------ stamps (chunky placement)
export function stampTool(key) {
  const st = STAMPS[key];
  return {
    label: st.label, icon: st.icon, hint: st.desc + ' Click, or drag to keep stamping.', cursor: 'stamp',
    down(ed, t) {
      ed.beginEdit();
      this.last = t;
      ed.changed(st.apply(ed.map, t.x, t.y, ed.stampSize, Math.floor(Math.random() * 1e6)));
    },
    drag(ed, t) {
      if (Math.hypot(t.x - this.last.x, t.y - this.last.y) < Math.max(1.5, ed.stampSize * 0.6)) return;
      this.last = t;
      ed.changed(st.apply(ed.map, t.x, t.y, ed.stampSize, Math.floor(Math.random() * 1e6)));
    },
  };
}

export function pathTool(key) {
  const st = PATHS[key];
  return {
    label: st.label, icon: st.icon, hint: st.desc, cursor: 'tile',
    down(ed, t) { this.pts = [t]; ed.view.setLine(this.pts); },
    drag(ed, t) {
      const last = this.pts[this.pts.length - 1];
      if (last.x === t.x && last.y === t.y) return;
      this.pts.push(t);
      ed.view.setLine(this.pts);
    },
    up(ed) {
      ed.view.setLine(null);
      if (!this.pts) return;
      const all = [];
      for (let i = 0; i < this.pts.length; i++) {
        if (i === 0) all.push([this.pts[0].x, this.pts[0].y]);
        else all.push(...line4(this.pts[i - 1].x, this.pts[i - 1].y, this.pts[i].x, this.pts[i].y));
      }
      ed.beginEdit();
      ed.changed(st.apply(ed.map, all, ed.pathWidth, Math.floor(Math.random() * 1e6)));
      this.pts = null;
    },
  };
}

const ROOM_ROLE = { house: 'villager', shop: 'provisions', inn: 'inn', temple: 'healer', tavern: 'tavern' };

export function roomTool(key) {
  const rm = ROOMS[key];
  return {
    label: rm.label, icon: rm.icon, hint: rm.desc + ' Click to place (centred on the cursor). The door faces the way set below.', cursor: 'room',
    size: () => [rm.w, rm.h],
    down(ed, t) {
      const map = ed.map;
      const x0 = t.x - Math.floor(rm.w / 2), y0 = t.y - Math.floor(rm.h / 2);
      ed.beginEdit();
      const b = new Bounds();
      b.add(x0 - 1, y0 - 1); b.add(x0 + rm.w, y0 + rm.h);
      if (key === 'chamber' || key === 'cavern') {
        const floor = map.type === 'dungeon' ? (getTile(map, t.x, t.y) === T.dungeon_wall || map.fill === 'dungeon_wall' ? 'dungeon_floor' : 'cave_floor') : 'floor_stone';
        if (key === 'cavern') {
          forBlob(map, t.x, t.y, rm.w / 2, Math.floor(Math.random() * 1e5), (x, y, d) => { if (d < 1) setTile(map, x, y, T[floor]); }, 0, 0.35);
        } else {
          for (let y = y0; y < y0 + rm.h; y++) for (let x = x0; x < x0 + rm.w; x++) setTile(map, x, y, T[floor]);
        }
        ed.changed(b);
        return;
      }
      const stone = key === 'temple' || key === 'hall' || map.type === 'castle' || map.type === 'dungeon';
      const bld = buildRoom(map, x0, y0, rm.w, rm.h, { wall: stone ? 'wall_stone' : 'wall_wood', floor: stone ? 'floor_stone' : 'floor_wood', door: ed.doorSide });
      const role = key === 'shop' ? ed.shopKind : ROOM_ROLE[key];
      if (role) {
        const rng = new RNG(Math.floor(Math.random() * 1e9));
        const spot = furnish(map, bld, role, rng);
        const shops = ['weapons', 'armor', 'provisions', 'reagents', 'inn', 'tavern', 'healer'];
        const npc = {
          id: uid('npc'), type: 'npc', x: spot.x, y: spot.y, role, name: '', desc: '', greeting: '', job: '', keywords: [],
          wander: shops.includes(role) ? 0 : 2, look: npcLook('human', rng),
          shop: ['weapons', 'armor', 'provisions', 'reagents'].includes(role) ? { kind: role, stock: [] } : null,
        };
        map.entities = map.entities.filter((e) => !(e.x >= x0 && e.y >= y0 && e.x < x0 + rm.w && e.y < y0 + rm.h && e.type === 'npc'));
        map.entities.push(npc);
        nameNpcs(map, ed.game, Math.floor(Math.random() * 1e6));
        ed.refreshEntities();
        ed.select(npc);
      }
      ed.changed(b);
    },
  };
}

export function featureTool(kind) {
  const fk = FEATURE_KINDS[kind];
  const icons = { town: '🏘', castle: '🏰', village: '🛖', cave: '🕳', tower: '🗼', fortress: '🏯', elfhall: '🌳', dwarfgate: '⛏' };
  return {
    label: fk.label, icon: icons[kind] || '⌂', hint: `Click to found a ${fk.label.toLowerCase()}. Its map is generated for you — double-click the site to edit it.`, cursor: 'tile',
    async down(ed, t) {
      if (!inBounds(ed.map, t.x, t.y)) return;
      const name = await promptDialog(`Name your new ${fk.label.toLowerCase()}:`, defaultSiteName(kind), 'New site');
      if (!name) return;
      ed.beginEdit();
      const sub = placeFeature(ed.game, ed.map, t.x, t.y, kind, name);
      ed.changed({ x0: t.x, y0: t.y, x1: t.x, y1: t.y });
      ed.refreshEntities();
      ed.refreshMapList();
      const portal = ed.map.entities.find((e) => e.type === 'portal' && e.x === t.x && e.y === t.y);
      if (portal) ed.select(portal);
      toast(`Founded ${name}. Double-click it (or use “Open map”) to edit its streets and people.`);
      void sub;
    },
  };
}

function defaultSiteName(kind) {
  const r = new RNG(Math.floor(Math.random() * 1e9));
  const a = ['Ash', 'Bright', 'Cold', 'Elder', 'Green', 'High', 'Long', 'Mist', 'Oak', 'Red', 'Silver', 'Stone', 'Thorn', 'West', 'Wolf', 'Raven'];
  const b = { town: ['ford', 'bury', 'wick', 'hold', 'by', 'ton'], castle: ['guard', 'watch', 'keep', 'hall'], village: ['stead', 'wood', 'brook', 'field'],
    cave: ['delve', 'hollow', 'barrow', 'den'], tower: ['spire', 'tower', 'needle'], fortress: ['gloom', 'fang', 'doom'], elfhall: ['glade', 'bower', 'eaves'], dwarfgate: ['deep', 'forge', 'gate'] }[kind] || ['hold'];
  return r.pick(a) + r.pick(b);
}

// ------------------------------------------------------------ entities
const ENTITY_DEFAULTS = {
  npc: (ed, t) => {
    const rng = new RNG(Math.floor(Math.random() * 1e9));
    const race = ed.map.type === 'world' ? 'human' : rng.pick(['human', 'human', 'human', 'elf', 'dwarf']);
    return { type: 'npc', name: randomName(race, rng), role: 'villager', desc: `a ${race === 'human' ? '' : race + ' '}traveller`.replace('  ', ' '), greeting: 'Well met.', job: 'I wander where the road takes me.', keywords: [], wander: 2, look: npcLook(race, rng) };
  },
  monster: (ed) => {
    const def = ed.game.monsters.find((m) => m.id === ed.lastMonster) || ed.game.monsters.find((m) => !m.boss) || ed.game.monsters[0];
    return { type: 'monster', monster: def?.id, count: def?.group ? `${def.group[0]}-${def.group[1]}` : '1', wander: 4 };
  },
  chest: () => ({ type: 'chest', gold: '2d20', items: [] }),
  sign: () => ({ type: 'sign', text: 'Here lies the road to adventure.' }),
  ship: () => ({ type: 'ship' }),
  waygate: (ed, t) => ({ type: 'portal', style: 'waygate', label: 'Waygate', target: { map: ed.map.id, x: t.x, y: t.y + 2 } }),
  portal: (ed) => ({ type: 'portal', style: ed.map.type === 'dungeon' ? 'stairs' : 'hidden', label: 'Passage', target: { map: ed.map.exit ? 'exit' : ed.game.maps[0].id } }),
};

export const ENTITY_TOOLS = {
  select: { label: 'Select', icon: '👆', hint: 'Click a character or object to edit it; drag to move it; Delete removes it. Double-click a site or stairs to open its map.', cursor: 'tile' },
  npc: { label: 'Person', icon: '🧙', hint: 'Place a person to talk to. Edit their words in the inspector.', cursor: 'tile' },
  monster: { label: 'Monsters', icon: '👹', hint: 'Place a group of monsters that roams nearby.', cursor: 'tile' },
  chest: { label: 'Chest', icon: '🧰', hint: 'Place a treasure chest.', cursor: 'tile' },
  sign: { label: 'Sign', icon: '🪧', hint: 'Place a signpost with a message.', cursor: 'tile' },
  ship: { label: 'Ship', icon: '⛵', hint: 'Place a ship on water. The party boards by walking onto it.', cursor: 'tile' },
  waygate: { label: 'Waygate', icon: '🌀', hint: 'A magic gate that teleports the party. Set its destination in the inspector.', cursor: 'tile' },
  portal: { label: 'Passage', icon: '🚪', hint: 'An invisible link or stairway to another map.', cursor: 'tile' },
  start: { label: 'Party start', icon: '🚩', hint: 'Click where the adventure begins.', cursor: 'tile' },
  entry: { label: 'Arrival point', icon: '⚑', hint: 'Where the party appears when entering this map.', cursor: 'tile' },
  erase: { label: 'Remove', icon: '✖', hint: 'Click a character or object to remove it.', cursor: 'tile' },
};

for (const [k, tool] of Object.entries(ENTITY_TOOLS)) {
  if (k === 'select') {
    tool.down = function (ed, t, e) {
      const ent = ed.entityAt(t.x, t.y);
      this.drag0 = null;
      if (ent) {
        ed.select(ent);
        this.drag0 = { ent, moved: false };
        if (e.detail >= 2) ed.openLinkedMap(ent);
      } else {
        ed.select(null);
        if (e.detail >= 2) {
          const portal = ed.map.entities.find((p) => p.type === 'portal' && p.x === t.x && p.y === t.y);
          if (portal) ed.openLinkedMap(portal);
        }
      }
    };
    tool.drag = function (ed, t) {
      const d = this.drag0;
      if (!d || !inBounds(ed.map, t.x, t.y)) return;
      if (d.ent.x === t.x && d.ent.y === t.y) return;
      if (!d.moved) { ed.beginEdit(); d.moved = true; }
      d.ent.x = t.x; d.ent.y = t.y;
      ed.view.placeEntity(d.ent.id, t.x, t.y);
      ed.markDirty();
    };
    tool.up = function (ed) { if (this.drag0?.moved) ed.inspect(); this.drag0 = null; };
    continue;
  }
  if (k === 'erase') {
    tool.down = (ed, t) => {
      const ent = ed.entityAt(t.x, t.y);
      if (!ent) return;
      ed.beginEdit();
      ed.removeEntity(ent);
    };
    continue;
  }
  if (k === 'start') {
    tool.down = (ed, t) => {
      if (!inBounds(ed.map, t.x, t.y)) return;
      ed.game.settings.start = { map: ed.map.id, x: t.x, y: t.y };
      ed.refreshEntities();
      ed.markDirty();
      toast('The adventure will begin here.');
    };
    continue;
  }
  if (k === 'entry') {
    tool.down = (ed, t) => {
      if (!inBounds(ed.map, t.x, t.y)) return;
      ed.beginEdit();
      ed.map.entry = { x: t.x, y: t.y };
      ed.refreshEntities();
      ed.markDirty();
    };
    continue;
  }
  tool.down = (ed, t) => {
    if (!inBounds(ed.map, t.x, t.y)) return;
    const existing = ed.entityAt(t.x, t.y);
    if (existing && existing.type !== 'portal') { ed.select(existing); return; }
    const ent = { id: uid(k), x: t.x, y: t.y, ...ENTITY_DEFAULTS[k](ed, t) };
    const td = terrain(getTile(ed.map, t.x, t.y));
    if (k === 'ship' && !td.ship) toast('Ships belong on water!', 'warn');
    else if ((k === 'npc' || k === 'monster') && !td.walk) toast('That spot is not walkable.', 'warn');
    ed.beginEdit();
    ed.map.entities.push(ent);
    ed.refreshEntities();
    ed.select(ent);
    ed.markDirty();
  };
}

export { brushTiles, hash2 };
