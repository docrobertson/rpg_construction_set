// Dungeons as battlegrounds (the way Age of Wonders did them). On such a map
// every placed band of monsters stands there in the flesh, each with its own
// health, and the company splits up: every hero has a square of their own and
// may walk on alone. Monsters stand idle until one of them notices a hero
// (nearness, light, a quiet foot, a clear line of sight); then its whole band
// is aware at once and the battle is fought on the dungeon floor itself — the
// heroes where they stand, the foes where they stand (Battle's field mode).
//
// What happens here is kept in the play state per map (mapState(id).delve):
//   groups: { [entity id]: { aware, m: [{ id, x, y, hx, hy, hp, max, dead, f }], ent?, temp? } }
//   heroes: { [hero key]: [x, y] }, sel: hero key or null (the company), trail: [[x, y]...]
// The map's monster entities stay what they were (a band per entity) so quests,
// the checklist and the story walk-through read them as before; a band is
// removed, as a beaten band always was, once every one of its monsters is dead.
import { terrain } from '../data/terrain.js';
import { byId } from '../data/schema.js';
import { getTile, inBounds } from '../world/map.js';
import { rng, roll } from '../core/rng.js';
import { DIR4, uid } from '../core/util.js';
import { hasLOS, computeVisible } from './los.js';
import { partyAlive, charLook, hasTrait, hasAbility, raceOf, classOf, partyLevel } from './rules.js';
import { checkQuests } from './quests.js';
import { hasBlessing } from './events.js';
import { Battle } from './combat.js';
import { sfx } from '../core/sound.js';
import { playMusic } from '../core/music.js';
import { confirmDialog } from '../ui/dom.js';

// A map is fought over like this when the designer says so, or (unsaid) when
// it is a dungeon: caves, crypts, towers, fortresses, the deeper levels
export function isBattleground(map) {
  if (!map || map.type === 'arena') return false;
  return map.battleground === true || (map.battleground == null && map.type === 'dungeon');
}

export const heroKey = (m) => m.id || m.name;
export const heroFig = (m) => 'hero:' + heroKey(m);
const memFig = (gid, k) => `dv:${gid}:${k}`;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sq = (x, y) => x + ',' + y;

// rings at the figures' feet
const RING = { actor: 0xfff0b0, hero: 0xc89a3a, away: 0x8c7a58, dormant: 0x8a3a32, aware: 0xff3a2a };

// Quiet of foot: hobbits (and any race drawn as one), and those whose calling
// is stealth (lock-picking burglars, woodcrafty rangers)
export function stealthy(game, m) {
  const r = raceOf(game, m);
  if (r?.id === 'hobbit' || r?.look?.race === 'hobbit' || (r?.traits || []).includes('quiet')) return true;
  return hasAbility(game, m, 'lockpick') || hasAbility(game, m, 'tracker') || hasAbility(game, m, 'backstab');
}

export class Delve {
  constructor(session, map) {
    this.s = session;
    this.game = session.game;
    this.view = session.view;
    this.map = map;
    const ms = session.mapState(map.id);
    this.data = ms.delve || (ms.delve = { v: 1, groups: {}, heroes: {}, sel: null, trail: [] });
    this.data.groups ||= {};
    this.data.heroes ||= {};
    this.data.trail ||= [];
    this.battle = null;
  }

  get groups() { return this.data.groups; }
  get party() { return this.s.party; }
  alive() { return partyAlive(this.party).filter((m) => this.data.heroes[heroKey(m)]); }

  // ------------------------------------------------------------ arriving
  // fresh: the company has just come in (by stairs, a portal, a teleport), so
  // everyone gathers at (x, y); otherwise (a saved game) they stand where they were
  init(x, y, fresh) {
    const map = this.map;
    const ents = map.entities.filter((e) => e.type === 'monster');
    const live = new Set(ents.map((e) => e.id));
    for (const [gid, g] of Object.entries(this.groups)) {
      // a band the designer has since taken away, or a stray fight that never finished
      if (!live.has(gid) || g.temp) { delete this.groups[gid]; continue; }
      g.aware = false; // nobody stays roused across a reload or a fresh arrival
      g.m = (g.m || []).filter((mm) => byId(this.game.monsters, mm.id));
    }
    for (const e of ents) if (!this.groups[e.id]) this.populate(e);
    if (fresh) { this.data.heroes = {}; this.data.sel = null; this.data.trail = []; }
    // anyone without a square (all of them, on arrival) gathers round (x, y)
    const want = partyAlive(this.party).filter((m) => !this.validHero(m));
    if (want.length) this.placeHeroes(want, x, y);
    for (const k of Object.keys(this.data.heroes)) if (!this.party.members.some((m) => heroKey(m) === k && m.status !== 'dead')) delete this.data.heroes[k];
    if (this.data.sel && !this.alive().some((m) => heroKey(m) === this.data.sel)) this.data.sel = null;
    this.syncPos();
  }

  validHero(m) {
    const at = this.data.heroes[heroKey(m)];
    if (!at) return false;
    const [x, y] = at;
    return inBounds(this.map, x, y) && terrain(getTile(this.map, x, y)).walk;
  }

  // everyone in `list` on the nearest free squares to (x, y), the first on it
  placeHeroes(list, x, y) {
    const spots = this.freeSquares(x, y, list.length, (px, py) => this.standable(px, py));
    list.forEach((m, i) => { const p = spots[i] || { x, y }; this.data.heroes[heroKey(m)] = [p.x, p.y]; });
  }

  // squares round (x, y) nearest first (breadth-first over open ground), where ok(x, y)
  freeSquares(x, y, n, ok, pass = (px, py) => this.walkable(px, py)) {
    const out = [];
    const seen = new Set([sq(x, y)]);
    const q = [[x, y]];
    for (let i = 0; i < q.length && out.length < n && i < 900; i++) {
      const [cx, cy] = q[i];
      if (ok(cx, cy)) out.push({ x: cx, y: cy });
      for (const [dx, dy] of DIR4) {
        const nx = cx + dx, ny = cy + dy;
        if (seen.has(sq(nx, ny)) || !inBounds(this.map, nx, ny) || !pass(nx, ny)) continue;
        seen.add(sq(nx, ny));
        q.push([nx, ny]);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ the bands
  // Each monster of a band, around the band's square: as many as a fight with
  // it would bring (count or the monster's usual group, its escorts, more for
  // a big company), each with its own health
  populate(e, list = null, origin = null, hidden = false) {
    const roster = list || this.s.enemiesFor(e);
    const g = { aware: false, m: [] };
    const taken = new Set();
    const o = origin || { x: e.x, y: e.y };
    for (const { id, n } of roster) {
      const def = byId(this.game.monsters, id);
      if (!def) continue;
      for (let k = 0; k < n; k++) {
        const ok = (x, y) => !taken.has(sq(x, y)) && this.standable(x, y, def, o) && (!hidden || (!this.s.isVisible(x, y) && !this.nearHero(x, y, 7)));
        const spot = this.freeSquares(o.x, o.y, 1, ok, (x, y) => this.walkable(x, y, def))[0];
        if (!spot) break;
        taken.add(sq(spot.x, spot.y));
        const hp = Math.max(1, roll(def.hp || '2d8'));
        g.m.push({ id: def.id, x: spot.x, y: spot.y, hx: spot.x, hy: spot.y, hp, max: hp, dead: false, f: [rng.int(-1, 1), 1] });
      }
    }
    if (e.roaming) g.ent = { ...e };
    this.groups[e.id] = g;
    return g;
  }

  // a band that turned up while the company was here (a wandering one)
  addGroup(e) {
    const g = this.populate(e, null, null, true); // (out of everyone's sight)
    if (!g.m.length) { delete this.groups[e.id]; this.s.removeEntity(e, false); return; }
    this.spawnGroup(e.id);
    this.applyVis(this.s.visible);
  }

  def(mm) { return byId(this.game.monsters, mm.id); }
  living(g) { return (g?.m || []).filter((mm) => !mm.dead); }
  entityOf(gid) { return this.map.entities.find((e) => e.id === gid) || this.groups[gid]?.ent || this.groups[gid]?.src || null; }
  mainDef(gid) {
    const e = this.entityOf(gid);
    return byId(this.game.monsters, e?.monster) || this.def(this.groups[gid]?.m?.[0] || {}) || null;
  }

  // "The goblins", "The goblin", "Ulfgar the Hollow King"
  groupName(gid, cap = true) {
    const def = this.mainDef(gid);
    const n = this.living(this.groups[gid]).filter((mm) => mm.id === def?.id).length;
    if (!def) return cap ? 'Something' : 'something';
    if (def.boss) return def.name;
    const name = n > 1 ? (def.plural || def.name).toLowerCase() : def.name.toLowerCase();
    return `${cap ? 'The' : 'the'} ${name}`;
  }
  plural(gid) { const def = this.mainDef(gid); return !def?.boss && this.living(this.groups[gid]).length > 1; }

  // ------------------------------------------------------------ squares
  walkable(x, y, def = null) {
    if (!inBounds(this.map, x, y)) return false;
    const t = terrain(getTile(this.map, x, y));
    if (def?.swim) return !!t.water && !t.deck;
    if (!t.walk) return !!(def?.fly && t.water);
    return !(t.dmg && !def?.fly) && !(t.water && !t.deck && !def?.fly);
  }

  // things that hold a square: people, signs, curiosities, chests, passages
  entityBlocks(x, y, except = null) {
    return this.map.entities.some((e) => e !== except && e.x === x && e.y === y && e.type !== 'monster' && e.type !== 'treasure');
  }

  memberAt(x, y, alsoAware = true) {
    for (const [gid, g] of Object.entries(this.groups)) {
      if (!alsoAware && g.aware) continue;
      const k = g.m.findIndex((mm) => !mm.dead && mm.x === x && mm.y === y);
      if (k >= 0) return { gid, g, k, mem: g.m[k] };
    }
    return null;
  }

  heroAt(x, y) {
    return this.alive().find((m) => { const p = this.data.heroes[heroKey(m)]; return p[0] === x && p[1] === y; }) || null;
  }

  occupied(x, y) { return !!(this.heroAt(x, y) || this.memberAt(x, y)); }

  // somewhere a figure may stand still: open ground, nothing else there, not
  // on the stairs or a doorway (origin: a square that counts as free, the
  // spot of the band being placed)
  standable(x, y, def = null, origin = null) {
    if (!this.walkable(x, y, def)) return false;
    const t = terrain(getTile(this.map, x, y));
    if (t.door || t.key === 'stairs_up' || t.key === 'stairs_down') return false;
    if (this.occupied(x, y)) return false;
    const own = origin && origin.x === x && origin.y === y;
    return own ? !this.map.entities.some((e) => e.x === x && e.y === y && (e.type === 'portal' || e.type === 'chest')) : !this.entityBlocks(x, y);
  }

  // where a hero may step on the way somewhere (doors and stairs too)
  heroPass(x, y) {
    if (!this.walkable(x, y)) return false;
    if (this.memberAt(x, y)) return false;
    return !this.map.entities.some((e) => e.x === x && e.y === y && ['npc', 'sign', 'event', 'ship'].includes(e.type));
  }

  // what bumping into this square means: a monster (a hero striking it)
  blockerAt(x, y) {
    const hit = this.memberAt(x, y);
    if (!hit) return null;
    return { type: 'monster', id: hit.gid, gid: hit.gid, k: hit.k, mem: hit.mem, e: this.entityOf(hit.gid), monster: hit.mem.id, x, y, member: true };
  }

  // a way out of the map on this square: stairs that lead up and out, or a passage
  exitAt(x, y) {
    if (!inBounds(this.map, x, y)) return null;
    const portal = this.map.entities.find((e) => e.type === 'portal' && e.x === x && e.y === y);
    const t = terrain(getTile(this.map, x, y));
    const stairs = t.key === 'stairs_up' || t.key === 'stairs_down';
    if (portal) {
      if (portal.requires && !this.s.hasItem(portal.requires)) return null;
      const name = stairs ? (t.key === 'stairs_up' ? 'up the stairs' : 'down the stairs') : `through ${portal.label ? 'the ' + portal.label.toLowerCase() : 'the passage'}`;
      return { portal, name, x, y };
    }
    if (stairs && this.map.exit) return { name: t.key === 'stairs_up' ? 'up the stairs' : 'down the stairs', x, y };
    return null;
  }

  // ------------------------------------------------------------ heroes
  // (in a battle a hero is wherever their figure stands in the fight)
  pos(m) {
    const u = this.battle?.partyUnits.find((x) => x.member === m);
    if (u) return { x: u.x, y: u.y };
    const p = this.data.heroes[heroKey(m)];
    return p ? { x: p[0], y: p[1] } : { ...this.s.state.pos };
  }

  // gone from the fight up the stairs (they see nothing down here, nor are seen)
  away(m) { return !!this.battle?.partyUnits.some((x) => x.member === m && x.fled); }
  setPos(m, x, y) {
    this.data.heroes[heroKey(m)] = [x, y];
    if (m === this.actor()) { this.s.state.pos.x = x; this.s.state.pos.y = y; }
  }

  // who walks: the hero chosen to go alone, else the company's leader
  selected() { return this.data.sel ? this.alive().find((m) => heroKey(m) === this.data.sel) || null : null; }
  actor() { return this.selected() || this.alive()[0] || this.s.leader; }
  actorFig() { return heroFig(this.actor()); }
  bearer() { return this.party.light > 0 ? this.alive()[0] || null : null; } // the leader carries the torch

  syncPos() {
    const a = this.actor();
    if (!a) return;
    const p = this.pos(a);
    this.s.state.pos.x = p.x; this.s.state.pos.y = p.y;
    this.view.anchorId = heroFig(this.bearer() || a);
  }

  // m: a hero to send on alone, or null for the whole company
  select(m, quiet = false) {
    const s = this.s;
    if (m && !this.alive().includes(m)) return;
    const key = m ? heroKey(m) : null;
    if (key === this.data.sel) return;
    this.data.sel = key;
    this.data.trail = [];
    this.syncPos();
    this.refreshRings();
    s.ui?.explore?.stop();
    const p = s.state.pos;
    s.camFocus(p.x, p.y);
    sfx('click');
    if (!quiet) {
      if (m) {
        if (!s.tip('delve-alone', `${m.name} goes on alone; the others stay where they stand. Click the ground to walk ${m.name} there. Tab picks the next hero, G (or “All together”) brings the company back as one.`)) s.log(`${m.name} goes on alone.`);
      } else {
        const far = this.alive().filter((h) => cheb(this.pos(h), p) > 2);
        s.log(far.length ? `All together: the company falls in behind ${this.actor().name}.` : 'All together.');
      }
    }
    s.ui?.refresh();
  }

  cycle(d = 1) {
    const list = [null, ...this.alive()];
    const cur = list.indexOf(this.selected());
    this.select(list[(Math.max(0, cur) + d + list.length) % list.length]);
  }

  // ------------------------------------------------------------ figures
  spawn() {
    this.spawnHeroes();
    // (bands already put up with the map's other figures are left as they are)
    for (const [gid, g] of Object.entries(this.groups)) if (g.m.some((mm, k) => !mm.dead && !this.view.hasEntity(memFig(gid, k)))) this.spawnGroup(gid);
    this.refreshMarkers();
  }

  spawnHeroes() {
    const v = this.view;
    for (const id of [...v.entities.keys()]) if (id.startsWith('hero:')) v.removeEntity(id);
    const list = this.alive();
    const big = list.length > 4;
    const face = this.s.state.facing || [0, 1];
    for (const m of list) {
      const p = this.pos(m);
      v.addEntity(heroFig(m), charLook(this.game, m), p.x, p.y, { ring: RING.hero, facing: face, scale: big ? 0.92 : 1 });
    }
    v.setFollowers?.([]);
    v.cutAlways = new Set(list.map(heroFig));
    this.refreshRings();
    this.syncPos();
  }

  spawnGroup(gid) {
    const g = this.groups[gid];
    if (!g) return;
    const v = this.view;
    const ent = this.entityOf(gid);
    g.m.forEach((mm, k) => {
      if (mm.dead) { v.removeEntity(memFig(gid, k)); return; }
      const def = this.def(mm);
      const boss = def?.boss || (ent?.boss && mm.id === ent.monster);
      v.addEntity(memFig(gid, k), def?.look || { kind: 'blob' }, mm.x, mm.y, { ring: g.aware ? RING.aware : RING.dormant, scale: boss ? 1.18 : 1, facing: mm.f || [0, 1] });
    });
  }

  // after a fight: the dead are gone, the living stand where they ended, calm again
  settleGroups() {
    const v = this.view;
    for (const [gid, g] of Object.entries(this.groups)) {
      g.m.forEach((mm, k) => {
        const id = memFig(gid, k);
        if (mm.dead) v.removeEntity(id);
        else if (!v.hasEntity(id)) this.spawnGroup(gid);
        else v.setRing(id, g.aware ? RING.aware : RING.dormant);
      });
    }
  }

  refreshRings() {
    const v = this.view;
    const a = this.actor(), alone = !!this.selected();
    for (const m of this.alive()) v.setRing(heroFig(m), m === a ? RING.actor : alone ? RING.away : RING.hero);
  }

  // party changes while here: a death, someone raised or recruited, a new leader
  refreshHeroes() {
    const want = partyAlive(this.party).filter((m) => !this.data.heroes[heroKey(m)]);
    for (const k of Object.keys(this.data.heroes)) if (!this.party.members.some((m) => heroKey(m) === k && m.status !== 'dead')) delete this.data.heroes[k];
    if (want.length) { const p = this.s.state.pos; this.placeHeroes(want, p.x, p.y); }
    if (this.data.sel && !this.alive().some((m) => heroKey(m) === this.data.sel)) this.data.sel = null;
    this.spawnHeroes();
  }

  memberOfFig(id) {
    if (!id?.startsWith('hero:')) return null;
    return this.alive().find((m) => heroFig(m) === id) || null;
  }

  targetOfFig(id) {
    if (!id?.startsWith('dv:')) return null;
    const i = id.lastIndexOf(':');
    const gid = id.slice(3, i), k = +id.slice(i + 1);
    const g = this.groups[gid], mem = g?.m[k];
    if (!mem || mem.dead) return null;
    return { gid, k, mem, e: this.entityOf(gid), x: mem.x, y: mem.y };
  }

  // marks over heads: Zz over a monster that has not noticed anyone
  refreshMarkers(ids = null) {
    const v = this.view;
    const keep = ids || new Set();
    for (const [gid, g] of Object.entries(this.groups)) {
      g.m.forEach((mm, k) => {
        const id = memFig(gid, k);
        if (mm.dead || !v.hasEntity(id)) return;
        if (!g.aware) { v.setMarker(id, 'unaware'); keep.add(id); } else if (this.alertUntil?.[gid] > performance.now()) { v.setMarker(id, 'alert'); keep.add(id); }
      });
    }
    if (!ids) {
      // (marks of the people round about are looked after by the explorer)
      for (const id of [...(v.markers?.marks?.keys() || [])]) if (id.startsWith('dv:') && !keep.has(id)) v.setMarker(id, null);
    }
    return keep;
  }

  // ------------------------------------------------------------ sight
  // What one hero sees: the torch is the leader's; the rest see by what light
  // there is (and their own dark-sight)
  sightOf(m) {
    const s = this.s;
    const base = s.sightRadius();
    const L = s.currentLighting();
    const torch = this.bearer() === m;
    if (L === 'dark') {
      const halls = this.map.type === 'town' || this.map.type === 'castle' ? 2.5 : 0;
      return { sight: base.sight, light: (torch ? 6.5 : 2.6) + halls + (hasTrait(this.game, m, 'darkSight') ? 1.2 : 0) };
    }
    if (L === 'night') return { sight: base.sight, light: (torch ? 8 : 5) + (hasTrait(this.game, m, 'keenSight') || hasTrait(this.game, m, 'darkSight') ? 1 : 0) };
    return base;
  }

  // everything any hero can see
  computeVis() {
    const map = this.map;
    const out = new Uint8Array(map.w * map.h);
    for (const m of this.alive()) {
      if (this.away(m)) continue;
      const p = this.pos(m);
      const { sight, light } = this.sightOf(m);
      const v = computeVisible(map, p.x, p.y, sight, light, map.litMask);
      for (let i = 0; i < v.length; i++) if (v[i]) out[i] = 1;
    }
    return out;
  }

  // monsters show where a hero can see them (and every foe in a battle);
  // a band seen now counts as seen first if it notices them on the next step
  applyVis(vis) {
    const v = this.view, map = this.map, b = this.battle;
    for (const [gid, g] of Object.entries(this.groups)) {
      let seen = false;
      g.m.forEach((mm, k) => {
        if (mm.dead) return;
        const id = memFig(gid, k);
        const fighting = b && b.units.some((u) => u.id === id && b.alive(u));
        const show = !vis || fighting || !!vis[mm.y * map.w + mm.x];
        if (show && !fighting) seen = true;
        v.setEntityVisible(id, show);
      });
      g.vis = seen;
    }
  }

  // the nearest monster of each band in sight: [{ id, x, y, monster }]
  visibleFoes() {
    const p = this.s.state.pos, out = [];
    for (const [gid, g] of Object.entries(this.groups)) {
      let best = null;
      for (const mm of this.living(g)) {
        if (!this.s.isVisible(mm.x, mm.y)) continue;
        if (!best || cheb(mm, p) < cheb(best, p)) best = mm;
      }
      if (best && !this.entityOf(gid)?.passive) out.push({ id: gid, x: best.x, y: best.y, monster: best.id });
    }
    return out;
  }

  nearHero(x, y, d) { return this.alive().some((m) => cheb(this.pos(m), { x, y }) < d); }
  near(m, d = 2) { return cheb(this.pos(m), this.s.state.pos) <= d; }

  // ------------------------------------------------------------ walking
  // The one who walks steps to (x, y); with the company together, everyone
  // else falls in along the leader's footsteps, square by square (stragglers
  // hurry two squares to the leader's one). A companion standing in the way
  // changes places.
  async step(x, y, dur, hop) {
    const a = this.actor();
    const from = this.pos(a);
    const anims = [];
    const other = this.heroAt(x, y);
    this.setPos(a, x, y);
    this.s.camFocus(x, y);
    anims.push(this.view.moveEntity(heroFig(a), x, y, dur, hop));
    if (this.selected()) {
      if (other && other !== a) { this.setPos(other, from.x, from.y); this.view.moveEntity(heroFig(other), from.x, from.y, dur, hop); }
    } else this.fallIn(a, from, { x, y }, dur, hop, other);
    await anims[0];
  }

  // the rest of the company after the leader (from: where the leader was; to: where now)
  fallIn(lead, from, to, dur = 0.13, hop = 0.07, bumped = null) {
    const fol = this.alive().filter((m) => m !== lead);
    if (!fol.length) return;
    let trail = [];
    if (from && (from.x !== to.x || from.y !== to.y)) trail.push(from);
    for (const [tx, ty] of this.data.trail) trail.push({ x: tx, y: ty });
    const seen = new Set([sq(to.x, to.y)]);
    trail = trail.filter((p) => { const k = sq(p.x, p.y); if (seen.has(k) || !this.heroPass(p.x, p.y)) return false; seen.add(k); return true; }).slice(0, 10);
    this.data.trail = trail.map((p) => [p.x, p.y]);
    // squares to stand on: the leader's footsteps, then the nearest open ground
    const slots = trail.slice(0, fol.length);
    if (slots.length < fol.length) {
      const used = new Set([sq(to.x, to.y), ...slots.map((p) => sq(p.x, p.y))]);
      const more = this.freeSquares(to.x, to.y, fol.length + 6, (px, py) => !used.has(sq(px, py)) && this.walkable(px, py) && !this.memberAt(px, py) && !this.entityBlocks(px, py) && !terrain(getTile(this.map, px, py)).door, (px, py) => this.heroPass(px, py));
      for (const p of more) { if (slots.length >= fol.length) break; if (!used.has(sq(p.x, p.y))) { slots.push(p); used.add(sq(p.x, p.y)); } }
    }
    const order = bumped && bumped !== lead ? [bumped, ...fol.filter((m) => m !== bumped)] : fol;
    const claimed = new Set();
    const finals = new Set([sq(to.x, to.y)]);
    const where = new Map(fol.map((m) => [m, this.pos(m)]));
    const done = new Set();
    for (const m of order) {
      const at = where.get(m);
      let idx = fol.indexOf(m);
      if (idx >= slots.length || claimed.has(idx)) idx = slots.findIndex((_, i) => !claimed.has(i));
      const goal = idx >= 0 ? slots[idx] : null;
      if (idx >= 0) claimed.add(idx);
      // squares taken: where those already moved end up, where the rest still stand
      const block = new Set(finals);
      for (const o of order) if (o !== m && !done.has(o)) { const q = where.get(o); block.add(sq(q.x, q.y)); }
      let path = (goal && (goal.x !== at.x || goal.y !== at.y) ? this.pathFor(at, goal, block) : null) || [];
      path = path.slice(0, 2);
      while (path.length && block.has(sq(path[path.length - 1][0], path[path.length - 1][1]))) path.pop();
      let end = path.length ? { x: path[path.length - 1][0], y: path[path.length - 1][1] } : at;
      // whoever the leader stepped onto changes places with them
      if (end.x === to.x && end.y === to.y && from) { path = [[from.x, from.y]]; end = from; }
      done.add(m);
      finals.add(sq(end.x, end.y));
      where.set(m, end);
      if (path.length) {
        this.setPos(m, end.x, end.y);
        const id = heroFig(m);
        (async () => { for (const [px, py] of path) await this.view.moveEntity(id, px, py, dur, hop); })();
      }
    }
  }

  // up to 30 squares of breadth-first search for a hero from a to b, avoiding `block`
  pathFor(a, b, block) {
    const prev = new Map([[sq(a.x, a.y), null]]);
    const q = [[a.x, a.y]];
    for (let i = 0; i < q.length && i < 1600; i++) {
      const [x, y] = q[i];
      if (x === b.x && y === b.y) break;
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy, k = sq(nx, ny);
        if (prev.has(k) || Math.abs(nx - a.x) > 30 || Math.abs(ny - a.y) > 30) continue;
        if (!this.heroPass(nx, ny) || (block.has(k) && !(nx === b.x && ny === b.y))) continue;
        prev.set(k, [x, y]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(sq(b.x, b.y))) return null;
    const path = [];
    for (let c = [b.x, b.y]; c && !(c[0] === a.x && c[1] === a.y); c = prev.get(sq(c[0], c[1]))) path.unshift(c);
    return path;
  }

  // a turn's wait: the company closes up round its leader
  closeUp() {
    if (this.selected()) return;
    const a = this.actor();
    const p = this.pos(a);
    this.fallIn(a, null, p);
  }

  // Before the company takes the stairs or a passage out: if some are far off,
  // ask (they will hurry after)
  async readyToLeave() {
    const p = this.s.state.pos;
    const far = this.alive().filter((m) => cheb(this.pos(m), p) > 5);
    if (!far.length) return true;
    const names = far.map((m) => m.name);
    const who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    if (!this.s.ui) return true;
    const ok = await confirmDialog(`${who} ${far.length === 1 ? 'is' : 'are'} still elsewhere in ${this.map.name}. Leave anyway? (${far.length === 1 ? 'They hurry' : 'They hurry'} after you.)`, `Leave ${this.map.name}?`);
    if (!ok) this.s.log('You wait at the way out.');
    return !!ok;
  }

  // the company is leaving the map: nobody down here is hunting them any more
  leave() {
    for (const g of Object.values(this.groups)) g.aware = false;
    for (const [gid, g] of Object.entries(this.groups)) if (g.temp) delete this.groups[gid];
    this.data.heroes = {};
    this.data.sel = null;
    this.data.trail = [];
    this.view.anchorId = null;
    this.view.cutAlways = null;
  }

  // ------------------------------------------------------------ the monsters' turn
  // Unaware monsters stand about (now and then one turns, or shuffles a step)
  idle() {
    const v = this.view;
    for (const [gid, g] of Object.entries(this.groups)) {
      if (g.aware || this.entityOf(gid)?.wander === 0) continue;
      g.m.forEach((mm, k) => {
        if (mm.dead) return;
        if (rng.chance(0.06)) {
          const [dx, dy] = rng.pick(DIR4);
          mm.f = [dx, dy];
          v.face(memFig(gid, k), dx, dy);
        } else if (rng.chance(0.025)) {
          const [dx, dy] = rng.pick(DIR4);
          const nx = mm.x + dx, ny = mm.y + dy;
          if (Math.abs(nx - (mm.hx ?? mm.x)) + Math.abs(ny - (mm.hy ?? mm.y)) <= 1 && this.standable(nx, ny, this.def(mm)) && !this.data.trail.some(([tx, ty]) => tx === nx && ty === ny)) {
            mm.x = nx; mm.y = ny; mm.f = [dx, dy];
            v.moveEntity(memFig(gid, k), nx, ny, 0.3, 0.03);
          }
        }
      });
    }
  }

  // How far a monster notices a hero: by light (the torch shows its bearer
  // from afar), less for the quiet of foot, a little more for a great foe
  noticeRange(mm, m) {
    const map = this.map, p = this.pos(m);
    const lit = map.lighting !== 'dark' || !!map.litMask?.[p.y * map.w + p.x];
    let r = lit ? 6 : 3;
    if (this.bearer() === m) r = Math.max(r, 7);
    if (this.s.currentLighting() === 'night' && !map.litMask?.[p.y * map.w + p.x] && this.bearer() !== m) r = Math.min(r, 4);
    if (stealthy(this.game, m)) r -= 2;
    if (this.def(mm)?.boss) r += 1;
    r -= +this.s.stealthBonus?.(m) || 0; // (what a hero carries may quieten them)
    return Math.max(1, r);
  }

  noticeChance(d, r, m) {
    let p = Math.min(1, Math.max(0.15, 1.15 - d / (r + 1)));
    if (stealthy(this.game, m)) p *= 0.55;
    return p;
  }

  // Bands that notice a hero now: [{ gid, hero, came }] (came: the heroes had
  // the band in sight before it saw them). heroes: only these may be noticed.
  notices(heroes = null) {
    if (this.s.peaceful) return [];
    const out = [];
    const list = (heroes || this.alive()).filter((m) => m.status !== 'dead' && !this.away(m));
    for (const [gid, g] of Object.entries(this.groups)) {
      if (g.aware || this.entityOf(gid)?.passive) continue;
      let hero = null;
      for (const mm of this.living(g)) {
        for (const m of list) {
          const p = this.pos(m);
          const d = cheb(mm, p), r = this.noticeRange(mm, m);
          if (d > r || !hasLOS(this.map, mm.x, mm.y, p.x, p.y)) continue;
          if (rng.chance(this.noticeChance(d, r, m))) { hero = m; break; }
        }
        if (hero) break;
      }
      if (hero) out.push({ gid, hero, came: !!g.vis });
    }
    return out;
  }

  // the world's turn on this map: returns true if a battle was fought
  async act() {
    this.idle();
    const found = this.notices();
    if (!found.length) return false;
    await this.wake(found);
    return true;
  }

  // a band's eyes on the company: the ring flares red and a ! goes up
  alert(gid) {
    const g = this.groups[gid];
    if (!g) return;
    g.aware = true;
    (this.alertUntil ||= {})[gid] = performance.now() + 1800;
    g.m.forEach((mm, k) => { if (!mm.dead) { this.view.setRing(memFig(gid, k), RING.aware); this.view.setEntityVisible(memFig(gid, k), true); } });
    this.refreshMarkers();
    setTimeout(() => { if (this.s.dv === this) this.refreshMarkers(); }, 1900);
  }

  surpriseChance(found) {
    let p = 0.3;
    if (found.some((f) => stealthy(this.game, f.hero))) p += 0.25;
    if (found.some((f) => { const q = this.pos(f.hero); return this.map.lighting === 'dark' && !this.map.litMask?.[q.y * this.map.w + q.x]; })) p += 0.1;
    return Math.min(0.75, p);
  }

  // Bands become aware; a battle begins. strike: a hero struck first (sure surprise)
  async wake(found, { strike = false, ambush = false } = {}) {
    const s = this.s;
    for (const f of found) {
      this.alert(f.gid);
      if (!strike && !ambush) s.log(`${this.groupName(f.gid)} ${this.plural(f.gid) ? 'notice' : 'notices'} ${f.hero.name}!`, 'bad');
    }
    let surprise = false;
    const hero = found[0]?.hero || this.actor();
    if (strike) {
      surprise = true;
      s.log(`${hero.name} falls on ${this.groupName(found[0].gid, false)} before ${this.plural(found[0].gid) ? 'they know' : 'it knows'} anyone is there!`, 'good');
    } else if (!ambush && found.some((f) => f.came)) surprise = rng.chance(this.surpriseChance(found));
    if (surprise) s.log(`Caught unawares! ${this.groupName(found[0].gid)} ${this.plural(found[0].gid) ? 'are' : 'is'} surprised: every hero has a free turn before the foe can act.`, 'good');
    return this.fight(found.map((f) => f.gid), { surprise, striker: strike ? hero : null });
  }

  // Anything else that starts a fight here — a mimic, a hostile stranger, an
  // ambush at camp, a hoard's guardian — stands up on the dungeon floor as a
  // band that knows the company is there
  async engage(e, list = null) {
    const gid = e?.gid || (e && this.groups[e.id] && !this.groups[e.id].temp ? e.id : null);
    if (gid) {
      const g = this.groups[gid];
      if (!g || g.aware || this.battle) return null;
      return this.wake([{ gid, hero: this.actor(), came: true }], { strike: true });
    }
    if (this.battle) return null;
    const t = this.spawnTemp(e || {}, list);
    if (!t) return { outcome: 'fled' };
    return this.wake([{ gid: t, hero: this.actor() }], { ambush: true });
  }

  spawnTemp(e, list) {
    const s = this.s, map = this.map;
    const gid = uid('foe');
    // where it comes from: the stranger or curiosity it was (hidden while the fight lasts), else near the company
    const src = [e.id, e.alsoRemove].map((id) => id && map.entities.find((x) => x.id === id && x.type !== 'monster')).find(Boolean);
    const p = s.state.pos;
    let origin = src ? { x: src.x, y: src.y } : null;
    if (!origin) {
      const spots = this.freeSquares(p.x, p.y, 40, (x, y) => cheb({ x, y }, p) >= 2 && this.standable(x, y) && hasLOS(map, p.x, p.y, x, y));
      origin = spots.find((q) => cheb(q, p) >= 3) || spots[0] || null;
    }
    if (!origin) return null;
    const roster = list || (e.monster ? s.enemiesFor(e) : []);
    if (src) { this.view.setEntityVisible(src.id, false); this.hidden = src; }
    const g = this.populate({ ...e, id: gid, roaming: true }, roster, origin);
    if (!g.m.length) { delete this.groups[gid]; return null; }
    g.temp = true;
    g.src = { id: e.id, alsoRemove: e.alsoRemove, flag: e.flag, loot: e.loot, monster: e.monster || roster[0]?.id, roaming: e.roaming };
    delete g.ent;
    this.spawnGroup(gid);
    return gid;
  }

  // ------------------------------------------------------------ the battle
  fieldFor() {
    const foes = [];
    for (const [gid, g] of Object.entries(this.groups)) if (g.aware) foes.push(...this.foesOf(gid));
    return {
      map: this.map,
      heroes: this.alive().map((m) => ({ m, id: heroFig(m), ...this.pos(m), face: this.s.state.facing })),
      foes,
      blocked: (x, y, unit) => this.fieldBlocked(x, y, unit),
      exitAt: (x, y) => this.exitAt(x, y),
      afterTurn: (b, u) => this.afterTurn(b, u),
      moved: (u) => this.onMoved(u),
      carried: (b) => this.carried(b),
      visible: (x, y) => this.s.isVisible(x, y),
      describe: (x, y) => this.describeAt(x, y),
    };
  }

  foesOf(gid) {
    const g = this.groups[gid];
    return g.m.map((mm, k) => ({ mm, k })).filter(({ mm }) => !mm.dead).map(({ mm, k }) => {
      const def = this.def(mm);
      return { def, id: memFig(gid, k), x: mm.x, y: mm.y, hp: mm.hp, maxHp: mm.max, face: mm.f, gid, mem: mm };
    }).filter((f) => f.def);
  }

  // squares a fighter cannot enter: monsters still unaware, people and
  // curiosities, foes that slipped away into the dark; and for monsters the way out
  // (asked for every square of every path search: the squares are gathered once a turn)
  fieldBlocked(x, y, unit) {
    const c = this.blocks || this.gatherBlocks();
    const k = y * this.map.w + x;
    if (c.all.has(k)) return true;
    return unit?.side === 'enemy' && c.foe.has(k);
  }

  gatherBlocks() {
    const w = this.map.w, all = new Set(), foe = new Set();
    for (const g of Object.values(this.groups)) if (!g.aware) for (const mm of g.m) if (!mm.dead) all.add(mm.y * w + mm.x);
    for (const u of this.battle?.units || []) if (u.fled && u.side === 'enemy' && !u.dead) all.add(u.y * w + u.x);
    for (const e of this.map.entities) {
      if (['npc', 'sign', 'event', 'ship'].includes(e.type) && e !== this.hidden) all.add(e.y * w + e.x);
      if (e.type === 'portal') foe.add(e.y * w + e.x);
    }
    if (this.map.exit) for (let i = 0; i < this.map.tiles.length; i++) { const t = terrain(this.map.tiles[i]); if (t.key === 'stairs_up' || t.key === 'stairs_down') foe.add(i); }
    return (this.blocks = { all, foe });
  }

  // Noticing and noise while the battle goes on: after a hero's turn, bands that
  // see them; after anyone's turn, bands close by may hear the fighting.
  // They join the fight at the next round.
  async afterTurn(b, u) {
    this.blocks = null;
    this.s.updateVisibility();
    if (this.s.peaceful) return;
    const found = u?.side === 'party' && b.alive(u) ? this.notices([u.member]) : [];
    const heard = [];
    if (u && b.alive(u)) {
      for (const [gid, g] of Object.entries(this.groups)) {
        if (g.aware || found.some((f) => f.gid === gid) || this.entityOf(gid)?.passive) continue;
        if (this.living(g).some((mm) => cheb(mm, u) <= 3 && hasLOS(this.map, mm.x, mm.y, u.x, u.y)) && rng.chance(0.35)) heard.push(gid);
      }
    }
    for (const f of found) this.join(b, f.gid, `${this.groupName(f.gid)} ${this.plural(f.gid) ? 'notice' : 'notices'} ${f.hero.name} and ${this.plural(f.gid) ? 'join' : 'joins'} the fight!`);
    for (const gid of heard) this.join(b, gid, `${this.groupName(gid)} ${this.plural(gid) ? 'hear' : 'hears'} the fighting and ${this.plural(gid) ? 'come' : 'comes'} running!`);
  }

  // a hero moved in the fight: what they see now, and who sees them
  onMoved(u) {
    this.s.updateVisibility();
    const b = this.battle;
    if (!b || this.s.peaceful || u?.side !== 'party' || !b.alive(u)) return;
    for (const f of this.notices([u.member])) this.join(b, f.gid, `${this.groupName(f.gid)} ${this.plural(f.gid) ? 'notice' : 'notices'} ${f.hero.name} and ${this.plural(f.gid) ? 'join' : 'joins'} the fight!`);
  }

  join(b, gid, text) {
    this.alert(gid);
    b.join(this.foesOf(gid), text);
    this.blocks = null;
    sfx('encounter');
  }

  // what bands wiped out in this battle were carrying
  carried(b) {
    const gids = new Set(b.enemies.map((u) => u.gid).filter(Boolean));
    const out = [];
    for (const gid of gids) {
      const g = this.groups[gid];
      const dead = b.enemies.filter((u) => u.gid === gid).every((u) => u.dead) && (g?.m || []).every((mm) => mm.dead || b.enemies.some((u) => u.mem === mm));
      if (dead) { const e = this.entityOf(gid); if (e?.loot?.length) out.push(e); }
    }
    return out;
  }

  describeAt(x, y) {
    const hit = this.memberAt(x, y, false);
    if (!hit || !this.s.isVisible(x, y)) return null;
    const def = this.def(hit.mem);
    return `${def?.name || 'Something'} — unaware of you. ${this.plural(hit.gid) ? 'Its band joins' : 'It joins'} the fight if it notices a hero or hears the fighting close by.`;
  }

  async fight(gids, { surprise = false, striker = null } = {}) {
    const s = this.s, ui = s.ui, v = this.view;
    s.lastStand = partyAlive(s.party);
    s.mode = 'combat';
    s.queued = null;
    ui?.explore?.stop();
    ui?.explore?.clearHover();
    s.persistExplored();
    sfx('encounter');
    v.shake?.(0.15, 0.25);
    playMusic('combat');
    this.blocks = null;
    const b = new Battle(s, [], 'field', { field: this.fieldFor(gids), surprise, striker });
    this.battle = b;
    s.battle = b;
    // blessings and what heroes carry: every battle is readied by the session
    const setup = b.setup.bind(b);
    b.setup = () => { setup(); s.prepareBattle(b); };
    const reach = v.reach;
    v.reach = Math.max(reach || 8, 12); // room to look over a wider field
    ui?.setMode('combat');
    this.refreshMarkers();
    const res = await b.run();
    v.reach = reach;
    if (res.outcome === 'aborted') { this.battle = null; return res; }
    if (res.outcome !== 'defeat') s.lastStand = null;
    if (res.outcome === 'victory' && b.gold > 0 && hasBlessing(s, 'fortune')) {
      const extra = Math.ceil(b.gold / 2);
      s.party.gold += extra;
      s.log(`Fortune smiles: you find ${extra} more gold.`, 'good');
    }
    s.battle = null;
    this.battle = null;
    const exit = this.sync(b, res);
    this.blocks = null;
    if (this.hidden) { if (res.outcome !== 'victory' && this.map.entities.includes(this.hidden)) v.setEntityVisible(this.hidden.id, true); this.hidden = null; }
    if (res.outcome === 'defeat') {
      s.mode = 'gameover';
      ui?.setMode('explore');
      this.spawn();
      s.updateVisibility(true);
      ui?.showGameOver();
      return res;
    }
    s.mode = 'explore';
    ui?.setMode('explore');
    playMusic(this.map.type === 'dungeon' ? 'dungeon' : this.map.type === 'world' ? 'world' : 'town');
    this.refreshHeroes();
    this.settleGroups();
    this.refreshMarkers();
    s.updateVisibility();
    s.camFocus(s.state.pos.x, s.state.pos.y);
    if (res.outcome === 'fled' && exit) {
      s.log('The company flees the battle.', 'warn');
      for (const g of Object.values(this.groups)) g.aware = false;
      if (exit.portal) await s.usePortal(exit.portal);
      else await s.leaveMap();
      return res;
    }
    ui?.refresh();
    for (const id of res.killedIds || []) s.onMonsterKilled(id);
    checkQuests(s);
    s.checkVictory();
    if (res.outcome === 'victory') s.autosave();
    return res;
  }

  // The battle's outcome written back: every monster's square and health,
  // every hero's square; bands with no one left are beaten and go. Returns the
  // way out the last hero took, if the company fled.
  sync(b, res) {
    const v = this.view;
    const touched = new Set();
    let exit = null;
    const won = res.outcome === 'victory';
    for (const u of b.units) {
      if (u.side !== 'party') continue;
      const m = u.member, key = heroKey(m);
      if (m.status === 'dead' || u.dead) { delete this.data.heroes[key]; continue; }
      if (u.fled) {
        exit = u.exit || exit;
        // they wait at the way out while the others finish the fight
        if (won && u.exit) {
          const spot = this.freeSquares(u.exit.x, u.exit.y, 1, (x, y) => this.standable(x, y) && !this.heroAt(x, y))[0] || { x: u.exit.x, y: u.exit.y };
          this.data.heroes[key] = [spot.x, spot.y];
          s_log(this.s, `${m.name} comes back down to rejoin the company.`);
        }
        continue;
      }
      this.data.heroes[key] = [u.x, u.y];
    }
    for (const u of b.units) {
      if (u.side !== 'enemy' || !u.gid) continue;
      const g = this.groups[u.gid];
      if (!g) continue;
      touched.add(u.gid);
      let mm = u.mem;
      if (!mm) {
        // summoned in the fight: stays with the band if it lived
        v.removeEntity(u.id);
        if (u.dead) continue;
        mm = { id: u.def.id, hp: u.hp, max: u.maxHp, dead: false };
        g.m.push(mm);
      }
      mm.x = u.x; mm.y = u.y; mm.hx = u.x; mm.hy = u.y;
      mm.hp = Math.max(0, u.hp);
      mm.dead = !!u.dead;
      mm.f = u.face;
    }
    for (const gid of touched) {
      const g = this.groups[gid];
      g.aware = false;
      if (g.m.every((mm) => mm.dead)) this.beaten(gid, won);
      else if (g.temp && !won) this.removeGroup(gid);
    }
    if (!this.data.sel || !this.alive().some((m) => heroKey(m) === this.data.sel)) this.data.sel = null;
    this.syncPos();
    return exit;
  }

  // every monster of a band is dead: it is beaten, as a band always was
  beaten(gid, won = true) {
    const s = this.s;
    const e = this.map.entities.find((x) => x.id === gid);
    const g = this.groups[gid];
    const src = g?.src;
    this.removeGroup(gid);
    if (e) {
      s.removeEntity(e, !e.roaming);
      if (e.flag) s.party.flags[e.flag] = true;
    }
    if (src && won) {
      const also = src.alsoRemove && this.map.entities.find((x) => x.id === src.alsoRemove);
      if (also) s.removeEntity(also, !also.roaming);
      const self = src.id && this.map.entities.find((x) => x.id === src.id && x.type !== 'monster');
      if (self) s.removeEntity(self, !self.roaming);
      if (src.flag) s.party.flags[src.flag] = true;
    }
  }

  removeGroup(gid) {
    const g = this.groups[gid];
    if (!g) return;
    g.m.forEach((_, k) => this.view.removeEntity(memFig(gid, k)));
    delete this.groups[gid];
  }

  // ------------------------------------------------------------ describing
  memberInfo(gid, mm) {
    const s = this.s;
    const def = this.def(mm);
    if (!def) return { title: 'Something', sub: '' };
    const g = this.groups[gid];
    const n = this.living(g).length;
    const lvl = def.level || 1, pl = partyLevel(s.party);
    const diff = lvl - pl;
    const threat = diff <= -2 ? 'easy prey' : diff <= 0 ? 'a fair fight' : diff === 1 ? 'a tough fight' : 'deadly';
    const hurt = mm.hp < mm.max ? (mm.hp / mm.max > 0.5 ? ' · wounded' : ' · badly hurt') : '';
    const band = n > 1 ? `one of a band of ${n} · ` : '';
    const main = this.mainDef(gid);
    return {
      title: (def.boss ? '★ ' : '') + def.name,
      sub: `${band}level ${lvl} · ${threat}${hurt}`,
      note: g.aware ? 'Aware of you!' : `Unaware of you${main && main.id !== def.id ? ` — with the ${(main.plural || main.name).toLowerCase()}` : ''}. Strike first and they are caught unawares.`,
      badge: g.aware ? null : 'unaware',
    };
  }
}

function s_log(s, text) { s.log(text, 'place'); }

if (typeof window !== 'undefined') window.__delve = { isBattleground, stealthy, heroKey, heroFig, rng, cheb };
