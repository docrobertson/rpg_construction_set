// Exploring with the mouse (or a finger): what is under the pointer, what a
// click there will do, walking there along a path and doing it, and the
// Nearby bar of things the party can do right where it stands.
import { h, clear, anyModal } from './dom.js';
import { terrain } from '../data/terrain.js';
import { byId, getMap } from '../data/schema.js';
import { getTile, inBounds } from '../world/map.js';
import { findBuildings, buildingMap } from '../world/buildings.js';
import { npcMarker } from '../game/quests.js';
import { eventLabel, EVENT_KINDS } from '../game/events.js';
import { bfsPath } from '../game/walk.js';
import { partyAlive, partyLevel, raceOf, classOf, itemOf } from '../game/rules.js';
import { sfx } from '../core/sound.js';
import { HoverInfo, CURSORS } from './hoverInfo.js';
import { markerGlyph } from '../render/markers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const TONE_COLOR = { talk: 0xffd860, attack: 0xff5a40, enter: 0x9ad8ff, use: 0xffffff, walk: 0xffe9a0, none: 0x9a9a9a, self: 0xffd860 };

const SHOP_WORDS = {
  weapons: 'weapons for sale', armor: 'armour for sale', armour: 'armour for sale', bowyer: 'bows and arrows', provisions: 'food, torches and supplies',
  reagents: 'reagents and potions', magic: 'magic for sale', mixed: 'all sorts of goods',
};

// small glyphs for the Nearby bar and the command grid (24×24, currentColor)
const P = (d) => `<path d="${d}"/>`;
const ST = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const GLYPHS = {
  talk: P('M4 4h16a2.5 2.5 0 012.5 2.5v8.5a2.5 2.5 0 01-2.5 2.5h-8l-5 4.5v-4.5H4A2.5 2.5 0 011.5 15V6.5A2.5 2.5 0 014 4z'),
  look: P('M12 5C6.5 5 3 9.5 2 12c1 2.5 4.5 7 10 7s9-4.5 10-7c-1-2.5-4.5-7-10-7z') + '<circle cx="12" cy="12" r="3.4" fill="#000a"/>',
  cast: ST('M4 20L15 9', 2.8) + P('M17.5 1.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3L13 6l3.3-1.2z'),
  use: P('M9.5 2h5v2h-1v4.3c3.3 1 5.5 3.8 5.5 7.2a7 7 0 01-14 0c0-3.4 2.2-6.2 5.5-7.2V4h-1z'),
  pack: P('M8.4 3.2h7.2l-1.8 3.4c3.9 1.6 6.4 5.6 6.4 9.4 0 3.4-2.6 5-8.2 5S3.8 19.4 3.8 16c0-3.8 2.5-7.8 6.4-9.4z'),
  journal: P('M5 2.5h12.5a2 2 0 012 2V19H7.2a1.7 1.7 0 000 3.4H19.5V24H7a3.5 3.5 0 01-3.5-3.5V4A1.5 1.5 0 015 2.5z') + ST('M8 7.5h8M8 11h6', 1.6).replace('currentColor', '#0008'),
  map: P('M2 5l6.5-2.5 7 2.5L22 2.5v16.5l-6.5 2.5-7-2.5L2 21.5z') + ST('M8.5 2.5v16.5M15.5 5v16.5', 1.4).replace('currentColor', '#0007'),
  camp: P('M12 3l9.5 17h-19z') + P('M12 11l3.6 9H8.4z').replace('<path', '<path fill="#0008"'),
  wait: P('M5.5 2h13v2.5c0 3-2.6 5.3-4.6 7.5 2 2.2 4.6 4.5 4.6 7.5V22h-13v-2.5c0-3 2.6-5.3 4.6-7.5-2-2.2-4.6-4.5-4.6-7.5z'),
  help: '<circle cx="12" cy="12" r="10"/>' + ST('M9 9.2a3 3 0 115 2.3c-1.2.8-2 1.4-2 3', 2.4).replace('currentColor', '#1a120a') + '<circle cx="12" cy="18" r="1.4" fill="#1a120a"/>',
  attack: P('M20.6 2.4l1 1-10.5 11.3-2.4-2.4z') + P('M5.2 12.6l1.5-1.5 6.2 6.2-1.5 1.5-1.8-1.8-3.1 3.1a1.5 1.5 0 01-2.1-2.1l3.1-3.1z'),
  enter: P('M5 2h14v20H5z') + P('M8 5h8v14H8z').replace('<path', '<path fill="#0006"') + '<circle cx="14" cy="12.5" r="1.2" fill="#fff"/>',
  chest: P('M3 9h18v11H3z') + P('M3 9a4 4 0 014-4h10a4 4 0 014 4z') + P('M10.5 11h3v4h-3z').replace('<path', '<path fill="#0008"'),
  ship: P('M11 2h2v12h-2z') + P('M13 3l7 9h-7z') + P('M2 15h20l-3 6H5z'),
  stairs: P('M3 20h5v-5h5v-5h5V5h3v18H3z'),
  key: '<circle cx="7" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2.4"/>' + ST('M11.5 12H22M18 12v4M21 12v3', 2.4),
  sign: P('M11 10h2v12h-2z') + P('M3 3h18v8H3z'),
  star: P('M12 2.2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.1l-6.1 3.5 1.5-6.8-5.2-4.6 6.9-.7z'),
  leave: P('M3 3h10v18H3z') + ST('M14 12h8M18.5 8.5L22 12l-3.5 3.5', 2.4),
};
export const glyph = (k) => `<svg class="xg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${GLYPHS[k] || GLYPHS.star}</svg>`;

// innkeepers and healers who also sell a few things still show a bed or a cross
export function markerFor(s, e) {
  const mk = npcMarker(s, e);
  if (mk === 'shop' && (e.role === 'inn' || e.role === 'healer')) return e.role;
  return mk;
}

export class Explorer {
  constructor(ui) {
    this.ui = ui;
    this.s = ui.s;
    this.view = ui.view;
    this.tip = new HoverInfo(document.body);
    this.nearbyEl = h('div.nearby');
    this.nearbyEl.hidden = true;
    ui.root.appendChild(this.nearbyEl);
    this.acts = [];
    this.hoverTarget = null;
    this.mouse = null;
    this._bcache = null;
  }

  destroy() {
    clearTimeout(this._watchT);
    if (this._raf) cancelAnimationFrame(this._raf);
    this.tip.destroy();
    this.nearbyEl.remove();
    this.clearHover();
  }

  // ------------------------------------------------------------ buildings
  buildings() {
    const map = this.s.map;
    if (!map || map.type === 'world') return [];
    if (this._bcache?.map !== map) {
      const list = findBuildings(map);
      this._bcache = { map, list, idx: buildingMap(map, list) };
      this.view.setBuildings?.(list);
    }
    return this._bcache.list;
  }

  buildingIndexAt(x, y) {
    const list = this.buildings();
    if (!list.length || !inBounds(this.s.map, x, y)) return -1;
    return this._bcache.idx[y * this.s.map.w + x];
  }

  // ------------------------------------------------------------ what is where
  member(key) { return this.s.party.members.find((m) => (m.id || m.name) === key); }

  entityTarget(e) {
    const s = this.s;
    if (!e) return null;
    if ((e.type === 'npc' || e.type === 'monster') && !s.isVisible(e.x, e.y)) return null;
    if (s.visible && !s.map.explored[e.y * s.map.w + e.x]) return null;
    return { kind: e.type, e, x: e.x, y: e.y };
  }

  // the thing under the pointer: a figure, a building, or a square of ground
  targetAt(cx, cy) {
    const s = this.s, v = this.view;
    if (!s.map || s.battle) return null;
    const id = v.pickEntity(cx, cy, (e) => e.id !== 'campfire');
    if (id === 'party') return { kind: 'party', m: s.state.vehicle ? null : partyAlive(s.party)[0] || s.leader, x: s.state.pos.x, y: s.state.pos.y };
    if (id && id.startsWith('party:')) { const m = this.member(id.slice(6)); if (m) return { kind: 'companion', m, x: s.state.pos.x, y: s.state.pos.y }; }
    if (id) {
      const t = this.entityTarget(s.map.entities.find((e) => e.id === id));
      if (t) return t;
    }
    const t = v.pick(cx, cy);
    if (!t || !inBounds(s.map, t.x, t.y)) return null;
    // a building (its roof or walls), unless the party is already inside it
    let bi = v.pickBuilding ? v.pickBuilding(cx, cy) : -1;
    if (bi == null || bi < 0) bi = this.buildingIndexAt(t.x, t.y);
    if (bi >= 0) {
      const b = this.buildings()[bi];
      const here = this.buildingIndexAt(s.state.pos.x, s.state.pos.y);
      if (b && here !== bi) return { kind: 'building', b, bi, x: t.x, y: t.y };
    }
    const at = s.map.entities.filter((e) => e.x === t.x && e.y === t.y && e.type !== 'npc' && e.type !== 'monster');
    for (const e of at) { const et = this.entityTarget(e); if (et) return et; }
    return { kind: 'tile', x: t.x, y: t.y };
  }

  // ------------------------------------------------------------ walking
  // squares the party may step through on the way somewhere
  passable(goalX, goalY) {
    const s = this.s, map = s.map;
    const ship = !!s.state.vehicle;
    return (x, y) => {
      if (!inBounds(map, x, y)) return false;
      const t = terrain(getTile(map, x, y));
      if (ship ? !(t.water && t.key !== 'bridge') : !t.walk) return false;
      if (s.visible && map.lighting === 'dark' && !map.explored[y * map.w + x]) return false;
      if (s.blockingAt(x, y)) return false;
      const goal = x === goalX && y === goalY;
      if (!goal) {
        // don't wander through doorways out of the map, onto sites or into fire by accident
        if (t.dmg) return false;
        if (map.entities.some((e) => e.x === x && e.y === y && (e.type === 'portal' || e.type === 'ship'))) return false;
        if (map.exit && (t.key === 'stairs_up' || t.key === 'stairs_down')) return false;
      }
      const gate = map.entities.find((e) => e.type === 'portal' && e.x === x && e.y === y && e.requires);
      if (gate && !s.hasItem(gate.requires)) return false;
      return true;
    };
  }

  pathFor(plan) {
    const p = this.s.state.pos;
    return bfsPath(p.x, p.y, plan.goal, this.passable(plan.gx, plan.gy), 40);
  }

  // where to stand to speak with someone: beside them, or across a counter
  // (o is the live entity, so a wanderer is followed as they move)
  besideGoal(o, counter = true) {
    const map = this.s.map;
    return (x, y) => {
      const tx = o.x, ty = o.y;
      const d = Math.abs(x - tx) + Math.abs(y - ty);
      if (d === 1) return true;
      if (counter && d === 2 && (x === tx || y === ty)) return terrain(getTile(map, (x + tx) / 2, (y + ty) / 2)).talkOver;
      return false;
    };
  }

  // A plan: { goal(x,y), arrive() after reaching it, target entity to track, tone }
  planFor(tg) {
    const s = this.s, map = s.map;
    if (!tg) return null;
    const bump = (e) => async () => {
      const p = s.state.pos;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) await s.move(dx, dy);
      else if (e.type === 'npc') s.talkTo(e);
    };
    switch (tg.kind) {
      case 'npc': {
        const e = tg.e;
        return { goal: this.besideGoal(e), arrive: bump(e), track: e, tone: e.hostile ? 'attack' : 'talk' };
      }
      case 'monster': case 'event': case 'sign': {
        const e = tg.e;
        return { goal: this.besideGoal(e, false), arrive: bump(e), track: e, tone: tg.kind === 'monster' ? 'attack' : 'use' };
      }
      case 'ship': {
        const e = tg.e;
        if (s.state.vehicle) return null;
        return { goal: this.besideGoal(e, false), arrive: bump(e), tone: 'enter' };
      }
      case 'chest': case 'portal':
        return { goal: (x, y) => x === tg.x && y === tg.y, gx: tg.x, gy: tg.y, tone: tg.kind === 'portal' ? 'enter' : 'use' };
      case 'building': {
        const k = tg.b.keeper && map.entities.includes(tg.b.keeper) ? tg.b.keeper : null;
        if (k) return { goal: this.besideGoal(k), arrive: bump(k), track: k, tone: 'enter' };
        const inside = new Set(tg.b.tiles.map(([x, y]) => x + ',' + y));
        return { goal: (x, y) => inside.has(x + ',' + y), tone: 'enter' };
      }
      case 'party': return { here: true, arrive: () => s.wait(), tone: 'self' };
      case 'companion': return { here: true, arrive: () => this.ui.selectHero(tg.m), tone: 'self' };
      case 'tile': {
        const { x, y } = tg;
        const t = terrain(getTile(map, x, y));
        if (s.visible && !map.explored[y * map.w + x]) return null;
        if (t.locked) return { goal: this.besideGoal({ x, y }, false), arrive: bump({ x, y }), tone: 'use' };
        // walking off the edge of a town leaves it
        const edge = map.exit && (x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1);
        if (edge && t.walk && !s.state.vehicle) {
          const out = x === 0 ? [-1, 0] : x === map.w - 1 ? [1, 0] : y === 0 ? [0, -1] : [0, 1];
          return { goal: (gx, gy) => gx === x && gy === y, gx: x, gy: y, arrive: () => s.move(out[0], out[1]), tone: 'enter', leave: true };
        }
        const ok = s.state.vehicle ? t.water && t.key !== 'bridge' : t.walk;
        if (!ok && s.state.vehicle && t.walk) return { goal: this.besideGoal({ x, y }, false), arrive: bump({ x, y }), tone: 'walk', ashore: true };
        if (!ok) return null;
        const stairs = (t.key === 'stairs_up' || t.key === 'stairs_down') && (map.exit || map.entities.some((e) => e.type === 'portal' && e.x === x && e.y === y));
        return { goal: (gx, gy) => gx === x && gy === y, gx: x, gy: y, tone: stairs ? 'enter' : 'walk', stairs };
      }
      default: return null;
    }
  }

  // Walk the plan out one step at a time, finding the way afresh each step
  // (people wander). Any key, a new click, a fight or a conversation stops it.
  async go(plan) {
    const s = this.s, ui = this.ui;
    if (!plan || s.mode !== 'explore') return false;
    if (plan.here) { await plan.arrive?.(); return true; }
    const token = {};
    ui.autoPath = token;
    const mapId = s.map.id;
    const foes = () => s.map.entities.filter((e) => e.type === 'monster' && !e.passive && s.isVisible(e.x, e.y));
    const known = new Set(foes().map((e) => e.id));
    let stuck = 0, steps = 0, arrived = false;
    try {
      while (ui.autoPath === token) {
        await this.idle();
        if (ui.autoPath !== token || s.mode !== 'explore' || !s.map || s.map.id !== mapId || anyModal()) break;
        if (plan.track && !s.map.entities.includes(plan.track)) break;
        const p = { x: s.state.pos.x, y: s.state.pos.y };
        if (plan.goal(p.x, p.y)) {
          this.view.pathPreview.clear();
          ui.autoPath = null;
          arrived = true;
          await plan.arrive?.();
          break;
        }
        const path = this.pathFor(plan);
        if (!path || !path.length) {
          if (!steps) { s.log('You see no way to get there.', 'warn'); sfx('bump'); }
          break;
        }
        // stop when trouble shows up (but not for the foe we are going for)
        if (steps > 0) {
          const near = foes().find((e) => e !== plan.track && (!known.has(e.id) && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 7 || Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 2));
          if (near) {
            const d = byId(s.game.monsters, near.monster);
            s.log(`You stop: ${d ? (d.boss ? d.name : d.plural || d.name) : 'something'} ahead!`, 'warn');
            break;
          }
        }
        this.view.pathPreview.set(path.map(([x, y]) => ({ x, y })), TONE_COLOR[plan.tone] || TONE_COLOR.walk, { from: { x: p.x, y: p.y } });
        const [nx, ny] = path[0];
        const turn = s.state.turn;
        await s.move(nx - p.x, ny - p.y);
        await this.idle();
        steps++;
        const q = s.state.pos;
        if (q.x === p.x && q.y === p.y && s.map.id === mapId) {
          // slowed by the ground (a turn passed): try again; bumped into something: give up
          if (s.state.turn === turn || ++stuck > 3) break;
        } else stuck = 0;
        if (steps > 160) break;
      }
    } finally {
      if (ui.autoPath === token) ui.autoPath = null;
      if (!this.walking()) this.view.pathPreview.clear();
      this.refreshHover();
    }
    return arrived;
  }

  walking() { return !!this.ui.autoPath; }

  async idle() {
    const s = this.s;
    for (let i = 0; i < 1000 && (s.busy || s.transitioning); i++) await sleep(20);
  }

  stop() {
    if (this.ui.autoPath) { this.ui.autoPath = null; this.view.pathPreview.clear(); }
  }

  // ------------------------------------------------------------ describing
  monsterInfo(e) {
    const s = this.s;
    const d = byId(s.game.monsters, e.monster);
    if (!d) return { title: 'Something', sub: '' };
    const lvl = d.level || 1, pl = partyLevel(s.party);
    const diff = lvl - pl;
    const threat = diff <= -2 ? 'easy prey' : diff <= 0 ? 'a fair fight' : diff === 1 ? 'a tough fight' : 'deadly';
    const m = String(e.count || '').match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    const n = m ? (m[2] ? `${m[1]}–${m[2]}` : m[1]) : d.group ? `${d.group[0]}–${d.group[1]}` : '1';
    const group = n === '1' ? '' : `a band of ${n} · `;
    return { title: (e.boss ? '★ ' : '') + (n === '1' ? d.name : d.plural || d.name), sub: `${group}level ${lvl} · ${threat}` };
  }

  npcInfo(e) {
    const s = this.s;
    const mk = markerFor(s, e);
    const desc = e.desc || 'someone';
    const title = e.name || desc.replace(/^(a|an|the) /i, '').replace(/^./, (c) => c.toUpperCase());
    const parts = [];
    if (e.name) parts.push(desc);
    const bi = this.buildingIndexAt(e.x, e.y);
    const b = bi >= 0 ? this.buildings()[bi] : null;
    if (b && b.keeper === e && !/house$/i.test(b.name)) parts.push(b.name);
    if (e.shop?.kind) parts.push(SHOP_WORDS[e.shop.kind] || 'goods for sale');
    const notes = { quest: 'Has a task for you', turnin: 'About your quest — speak with them', progress: 'Awaits news of your quest', recruit: 'Might join your company', inn: 'Rooms for the night', healer: 'Heals wounds and sickness' };
    return { title, sub: parts.join(' · '), badge: mk, note: notes[mk] || '' };
  }

  // What the card says about a target, and what a click will do
  describe(tg, plan, path) {
    const s = this.s, map = s.map, g = s.game;
    if (!tg) return null;
    const steps = path ? path.length : 0;
    const far = steps > 1 ? ` · ${steps} steps` : '';
    const reach = !!plan && (plan.here || path != null);
    const tone = plan && reach ? plan.tone : 'none';
    const noWay = 'No way there from here';
    switch (tg.kind) {
      case 'party':
        if (s.state.vehicle) return { title: 'Your ship', sub: `${partyAlive(s.party).length} aboard`, act: 'Click to wait a turn', tone: 'self' };
        return { title: tg.m.name, sub: `${raceOf(g, tg.m).name} ${classOf(g, tg.m).name} · leads your company`, act: 'Click to wait a turn', tone: 'self' };
      case 'companion':
        return { title: tg.m.name, sub: `Level ${tg.m.level} ${raceOf(g, tg.m).name} ${classOf(g, tg.m).name} · your companion`, act: 'Click for their sheet', tone: 'self' };
      case 'npc': {
        const i = this.npcInfo(tg.e);
        if (tg.e.hostile) return { ...i, act: reach ? `Click to confront${far}` : noWay, tone };
        return { ...i, act: reach ? `Click to talk${far}` : noWay, tone };
      }
      case 'monster': return { ...this.monsterInfo(tg.e), act: reach ? `Click to attack${far}` : noWay, tone };
      case 'event': {
        const e = tg.e;
        return { title: eventLabel(e), sub: EVENT_KINDS[e.kind] && e.name ? EVENT_KINDS[e.kind].label : '', act: reach ? `Click to visit${far}` : noWay, tone };
      }
      case 'sign': return { title: 'A signpost', sub: tg.e.text ? `“${String(tg.e.text).slice(0, 48)}${String(tg.e.text).length > 48 ? '…' : ''}”` : '', act: reach ? `Click to read${far}` : noWay, tone };
      case 'chest': return { title: 'A chest', sub: tg.e.locked ? 'locked' : '', act: reach ? `Click to open${far}` : noWay, tone };
      case 'ship': return s.state.vehicle ? { title: 'A ship', tone: 'none' } : { title: 'A ship', sub: 'sail the seas', act: reach ? `Click to board${far}` : noWay, tone };
      case 'portal': {
        const e = tg.e;
        const dest = getMap(g, e.target?.map);
        const name = e.label || dest?.name || (e.style === 'waygate' ? 'A waygate' : 'A way through');
        const kind = dest ? { town: 'a town', castle: 'a castle', dungeon: 'a dungeon', world: 'the wide world' }[dest.type] || '' : '';
        if (e.requires && !s.hasItem(e.requires)) return { title: name, sub: kind, note: `Barred — you need the ${itemOf(g, e.requires)?.name || e.requires}`, act: '', tone: 'none' };
        return { title: name, sub: kind, act: reach ? `Click to enter${far}` : noWay, tone };
      }
      case 'building': {
        const b = tg.b;
        const k = b.keeper && map.entities.includes(b.keeper) ? b.keeper : null;
        const sub = [b.info, k && !b.name.includes(k.name) ? `kept by ${k.name}` : ''].filter(Boolean).join(' · ');
        const badge = k ? markerFor(s, k) : null;
        const act = !reach ? noWay : k ? `Click to visit${far}` : `Click to go inside${far}`;
        return { title: b.name, sub, badge, act, tone };
      }
      case 'tile': {
        const { x, y } = tg;
        if (s.visible && !map.explored[y * map.w + x]) return { title: 'Unexplored', tone: 'none' };
        const t = terrain(getTile(map, x, y));
        if (!plan) {
          if (t.water && !s.state.vehicle) return { title: t.name, sub: 'You need a ship to cross water', tone: 'none' };
          return { title: t.name, tone: 'none' };
        }
        if (!reach) return { title: t.name, act: noWay, tone: 'none' };
        if (plan.leave) return { title: `Leave ${map.name}`, act: `Click to go${far}`, tone };
        if (plan.ashore) return { title: t.name, act: 'Click to go ashore', tone };
        if (t.locked) return { title: t.name, act: 'Click to try the lock', tone: 'use' };
        if (plan.stairs) return { title: t.name, act: `Click to ${t.key === 'stairs_up' ? 'climb' : 'go down'}${far}`, tone };
        const sub = [t.poison ? 'foul water — may poison you' : '', t.dmg ? 'it burns!' : '', t.slow && !t.poison && !s.mapIsTown() ? 'slow going' : '', t.sight && !t.wall ? 'hard to see through' : ''].filter(Boolean).join(' · ');
        return { title: t.name, sub, act: steps ? `Walk here · ${steps} step${steps === 1 ? '' : 's'}` : 'You are here', tone };
      }
      default: return null;
    }
  }

  // ------------------------------------------------------------ pointer
  hover(cx, cy) {
    if (cx == null) { this.mouse = null; this.clearHover(); return; }
    this.mouse = { x: cx, y: cy };
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.refreshHover(); });
  }

  refreshHover() {
    const s = this.s, v = this.view;
    const m = this.mouse;
    if (!m || !s.map || s.battle || s.mode !== 'explore' || anyModal() || this.ui.pendingDir) { this.clearHover(); return; }
    const tg = this.targetAt(m.x, m.y);
    if (!tg) { this.clearHover(); return; }
    const plan = this.planFor(tg);
    const path = plan && !plan.here ? this.pathFor(plan) : null;
    const info = this.describe(tg, plan, path);
    this.hoverTarget = tg;
    this.tip.show(info, m.x, m.y);
    this._hoverTurn = s.state.turn + ':' + s.state.pos.x + ',' + s.state.pos.y;
    this._watch();
    const tone = info?.tone || 'none';
    v.renderer.domElement.style.cursor = CURSORS[tone === 'self' ? 'use' : tone] || 'default';
    // glow round a figure, a frame round a square
    const ent = tg.kind === 'party' ? 'party' : tg.kind === 'companion' ? 'party:' + (tg.m.id || tg.m.name) : tg.e && v.hasEntity(tg.e.id) ? tg.e.id : null;
    v.hoverGlow.set(ent, TONE_COLOR[tone] || TONE_COLOR.walk);
    if (!ent && tg.kind !== 'building') v.showCursor(tg.x, tg.y, tone === 'none' ? 0x9a9a9a : 0xffffff);
    else v.showCursor(null);
    v.highlightBuilding?.(tg.kind === 'building' ? tg.bi : -1);
    if (tg.kind === 'building' && !v.highlightBuilding) {
      const b = tg.b;
      v.setHighlights([...b.tiles.map(([x, y]) => ({ x, y })), ...b.rim.map(([x, y]) => ({ x, y, color: 0xffe08a }))], 0xffd860, 0.32);
      this._bhl = true;
    } else if (this._bhl) { v.setHighlights(null); this._bhl = false; }
    // the way there (unless already walking somewhere)
    if (!this.walking()) {
      if (path && path.length) v.pathPreview.set(path.map(([x, y]) => ({ x, y })), TONE_COLOR[tone] || TONE_COLOR.walk, { from: { x: s.state.pos.x, y: s.state.pos.y }, noEnd: tg.kind !== 'tile' });
      else v.pathPreview.clear();
    }
    this.ui.hoverEl.textContent = info ? [info.title, info.act].filter(Boolean).join(' — ') : '';
  }

  // keep the card honest: gone when a window opens, updated as the party moves
  _watch() {
    if (this._watchT) return;
    const tick = () => {
      this._watchT = null;
      if (this.tip.el.hidden) return;
      const s = this.s;
      if (anyModal() || s.mode !== 'explore' || s.battle || this.ui.pendingDir) { this.clearHover(); return; }
      if (this._hoverTurn !== s.state.turn + ':' + s.state.pos.x + ',' + s.state.pos.y && !s.busy) { this.refreshHover(); return; }
      this._watchT = setTimeout(tick, 250);
    };
    this._watchT = setTimeout(tick, 250);
  }

  clearHover() {
    const v = this.view;
    this.hoverTarget = null;
    this.tip.hide();
    v.hoverGlow.set(null);
    v.highlightBuilding?.(-1);
    if (this._bhl) { v.setHighlights(null); this._bhl = false; }
    if (!this.walking()) v.pathPreview.clear();
    if (!this.s.battle) v.showCursor(null);
    v.renderer.domElement.style.cursor = '';
    this.ui.hoverEl.textContent = '';
  }

  async click(cx, cy) {
    const s = this.s;
    if (s.mode !== 'explore') return;
    const tg = this.targetAt(cx, cy);
    if (!tg) return;
    const plan = this.planFor(tg);
    if (!plan) {
      sfx('bump');
      const info = this.describe(tg, null, null);
      // say why nothing happens, not just what was clicked ("Stone Wall.")
      const why = info?.title === 'Unexplored' ? 'paths only cross ground you have seen, so walk nearer first' : 'no way there from here';
      if (info) s.log(info.sub ? `${info.title}: ${info.sub}.` : `${info.title}: ${why}.`);
      return;
    }
    this.stop();
    await this.go(plan);
  }

  // right-click / long-press: say what is there
  look(cx, cy) {
    const s = this.s;
    const tg = this.targetAt(cx, cy);
    if (!tg) return;
    const info = this.describe(tg, this.planFor(tg), null);
    let text = s.describeTile(tg.x, tg.y);
    if (info && tg.kind !== 'tile') text = [info.title, info.sub, info.note].filter(Boolean).join(' — ');
    s.log(`You see: ${text}.`);
    // on a tablet there is no hover: show the card for a moment
    if (this.mouse == null && info) {
      this.tip.show(info, cx, cy);
      clearTimeout(this._lookT);
      this._lookT = setTimeout(() => { if (this.mouse == null) this.tip.hide(); }, 2600);
    }
  }

  // ------------------------------------------------------------ nearby
  // What the party can do from where it stands, best first
  nearby() {
    const s = this.s, map = s.map, g = s.game;
    if (!map || s.battle || s.mode === 'combat') return [];
    const p = s.state.pos;
    const acts = [];
    const seen = new Set();
    const step = (x, y) => () => s.move(x - p.x, y - p.y);
    const ship = !!s.state.vehicle;
    // people: beside us or across a counter
    for (const e of map.entities) {
      if (e.type !== 'npc' || !s.isVisible(e.x, e.y)) continue;
      const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      const over = d === 2 && (e.x === p.x || e.y === p.y) && terrain(getTile(map, (e.x + p.x) / 2, (e.y + p.y) / 2)).talkOver;
      if (d !== 1 && !over) continue;
      const name = e.name || (e.desc || 'someone').replace(/^(a|an|the) /i, '');
      acts.push({ kind: e.hostile ? 'attack' : 'talk', icon: e.hostile ? 'attack' : 'talk', label: e.hostile ? `Confront ${name}` : `Talk to ${name}`, badge: e.hostile ? null : markerFor(s, e), run: () => (d === 1 ? s.move(e.x - p.x, e.y - p.y) : s.talkTo(e)), pri: npcMarker(s, e) === 'quest' || npcMarker(s, e) === 'turnin' ? 0 : 2 });
      seen.add(e);
    }
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx, y = p.y + dy;
      if (!inBounds(map, x, y)) continue;
      const t = terrain(getTile(map, x, y));
      for (const e of map.entities) {
        if (e.x !== x || e.y !== y || seen.has(e)) continue;
        if (e.type === 'monster' && s.isVisible(x, y)) { const i = this.monsterInfo(e); acts.push({ kind: 'attack', icon: 'attack', label: `Attack ${i.title}`, run: step(x, y), pri: 1 }); }
        else if (e.type === 'event') acts.push({ kind: 'use', icon: 'star', label: `Visit ${eventLabel(e)}`, run: step(x, y), pri: 1 });
        else if (e.type === 'sign') acts.push({ kind: 'use', icon: 'sign', label: 'Read the sign', run: step(x, y), pri: 3 });
        else if (e.type === 'chest' && !ship) acts.push({ kind: 'use', icon: 'chest', label: 'Open the chest', run: step(x, y), pri: 1 });
        else if (e.type === 'ship' && !ship) acts.push({ kind: 'enter', icon: 'ship', label: 'Board the ship', run: step(x, y), pri: 2 });
        else if (e.type === 'portal' && !ship) {
          const dest = getMap(g, e.target?.map);
          const name = e.label || dest?.name;
          if (e.requires && !s.hasItem(e.requires)) acts.push({ kind: 'none', icon: 'key', label: `${name || 'The way'} is barred`, run: step(x, y), pri: 4 });
          // stairs say so ("Enter Stairs up" read oddly)
          else if (t.key === 'stairs_up' || t.key === 'stairs_down') acts.push({ kind: 'enter', icon: 'stairs', label: (t.key === 'stairs_up' ? 'Climb the stairs' : 'Go down the stairs') + (name && !/stair/i.test(name) ? ` to ${name}` : ''), run: step(x, y), pri: 1 });
          else if (name || e.style === 'waygate') acts.push({ kind: 'enter', icon: 'enter', label: `Enter ${name || 'the waygate'}`, run: step(x, y), pri: 1 });
          else acts.push({ kind: 'enter', icon: 'enter', label: 'Go through', run: step(x, y), pri: 2 });
          seen.add(e);
        }
      }
      if ((t.key === 'stairs_up' || t.key === 'stairs_down') && map.exit && !map.entities.some((e) => e.type === 'portal' && e.x === x && e.y === y)) {
        acts.push({ kind: 'enter', icon: 'stairs', label: t.key === 'stairs_up' ? 'Climb the stairs' : 'Go down the stairs', run: step(x, y), pri: 1 });
      }
      if (t.locked && !ship) acts.push({ kind: 'use', icon: 'key', label: 'Try the locked door', run: step(x, y), pri: 3 });
      // a shop or house door: go and see whoever keeps it
      if (t.door && !ship) {
        const here = this.buildingIndexAt(p.x, p.y);
        const bi = this.buildingIndexAt(x, y);
        const b = bi >= 0 && bi !== here ? this.buildings()[bi] : null;
        if (b && b.keeper && map.entities.includes(b.keeper) && !seen.has(b.keeper)) {
          const plan = this.planFor({ kind: 'building', b, bi });
          acts.push({ kind: 'enter', icon: 'enter', label: `Visit ${b.name}`, run: () => this.go(plan), pri: 1 });
        }
      }
      if (ship && t.walk && !s.blockingAt(x, y) && !acts.some((a) => a.ashore)) acts.push({ kind: 'walk', icon: 'leave', label: 'Go ashore', run: step(x, y), pri: 3, ashore: true });
    }
    // the edge of a town: out into the world
    if (map.exit && !ship && (p.x === 0 || p.y === 0 || p.x === map.w - 1 || p.y === map.h - 1)) {
      const out = p.x === 0 ? [-1, 0] : p.x === map.w - 1 ? [1, 0] : p.y === 0 ? [0, -1] : [0, 1];
      acts.push({ kind: 'enter', icon: 'leave', label: `Leave ${map.name}`, run: () => s.move(out[0], out[1]), pri: 2 });
    }
    acts.sort((a, b) => a.pri - b.pri);
    // keys: T talks, E does the first other thing, then 1-4
    let n = 1;
    let e = false, t = false;
    for (const a of acts.slice(0, 6)) {
      if (a.kind === 'talk' && !t) { a.key = 'T'; t = true; } else if (a.kind !== 'talk' && !e) { a.key = 'E'; e = true; } else if (n <= 4) a.key = String(n++);
    }
    return acts.slice(0, 6);
  }

  refreshNearby() {
    const s = this.s;
    const acts = s.mode === 'explore' || s.mode === 'dialog' ? this.nearby() : [];
    const sig = acts.map((a) => a.label + a.key + (a.badge || '')).join('|') + '|' + s.mode;
    this.acts = acts;
    if (sig === this._nsig) return;
    this._nsig = sig;
    const el = this.nearbyEl;
    clear(el);
    el.hidden = !acts.length || !!s.battle;
    if (!acts.length) return;
    el.appendChild(h('div.nb-head', 'Nearby'));
    for (const a of acts) {
      el.appendChild(h('button.nb-act.' + a.kind, {
        title: a.label + (a.key ? ` (${a.key})` : ''),
        onclick: (ev) => { ev.stopPropagation(); if (s.mode !== 'explore' || s.busy) return; sfx('click'); this.stop(); a.run(); },
      }, h('span.nb-ico', { html: glyph(a.icon) }), a.badge ? h('span.nb-badge.' + a.badge, { html: markerGlyph(a.badge) }) : null,
      h('span.nb-label', a.label), a.key ? h('kbd', a.key) : null));
    }
  }

  // a key for one of the Nearby actions; true if it did something
  key(k) {
    const K = k.length === 1 ? k.toUpperCase() : k;
    const a = this.acts.find((x) => x.key === K);
    if (!a) return false;
    this.stop();
    sfx('click');
    a.run();
    return true;
  }

  // ------------------------------------------------------------ marks over heads
  refreshMarkers() {
    const s = this.s, v = this.view;
    if (!s.map || s.battle) return;
    const ids = new Set();
    for (const e of s.map.entities) {
      if (e.type !== 'npc' || !v.hasEntity(e.id)) continue;
      const mk = markerFor(s, e);
      if (!mk) continue;
      // shops and quest folk stay marked once you have seen where they are, even indoors
      v.setMarker(e.id, mk, !s.visible || !!s.map.explored[e.y * s.map.w + e.x]);
      ids.add(e.id);
    }
    v.markers.retain(ids);
  }
}
