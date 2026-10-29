// A play session: exploration of world / town / dungeon maps, turn by turn.
import { terrain, T } from '../data/terrain.js';
import { getMap, byId } from '../data/schema.js';
import { getTile, inBounds } from '../world/map.js';
import { rng, roll, RNG } from '../core/rng.js';
import { deepClone, uid, rleEncode, rleDecode, plural, DIR4 } from '../core/util.js';
import { computeVisible, computeLitMask, hasLOS } from './los.js';
import { stepToward, findPath } from './path.js';
import {
  createCharacter, maxHp, maxMp, charLook, partyAlive, partyLevel, hasTrait, hasAbility, itemOf, xpForLevel, gainXp, knownSpells, canCast, payForSpell, spellPower,
  equipKit, normalizeMember,
} from './rules.js';
import { respond, fillText } from './dialog.js';
import { Battle } from './combat.js';
import { saveState } from '../core/storage.js';
import { sfx } from '../core/sound.js';
import { playMusic } from '../core/music.js';

export function moodFor(map) {
  return map.type === 'world' ? 'world' : map.type === 'dungeon' ? 'dungeon' : 'town';
}

export const STATE_VERSION = 1;

// A day lasts this many turns: morning, midday and afternoon, then evening,
// night and dawn
export const DAY_LEN = 300;
const PHASES = [[0, 'Morning'], [0.2, 'Midday'], [0.35, 'Afternoon'], [0.5, 'Evening'], [0.6, 'Night'], [0.9, 'Dawn']];

export function newPlayState(game, members) {
  const s = game.settings;
  const inv = {};
  for (const it of s.startItems || []) if (byId(game.items, it.id)) inv[it.id] = (inv[it.id] || 0) + (it.n || 1);
  // starting equipment from class kits
  for (const m of members) {
    const cls = byId(game.classes, m.cls);
    normalizeMember(game, m, inv);
    equipKit(game, m, cls?.start, inv);
    m.hp = maxHp(game, m);
    m.mp = maxMp(game, m);
  }
  return {
    version: STATE_VERSION,
    gameId: game.id,
    created: Date.now(),
    party: { members, gold: s.startGold ?? 100, food: s.startFood ?? 60, inventory: inv, flags: {}, light: 0 },
    pos: { map: s.start.map, x: s.start.x, y: s.start.y },
    facing: [0, 1],
    vehicle: null,
    maps: {},
    turn: 0,
    foodTick: 0,
    won: false,
  };
}

export class PlaySession {
  constructor(app, game, state, opts = {}) {
    this.app = app;
    this.view = app.view;
    this.game = game;
    this.state = state;
    this.opts = opts;
    this.mode = 'explore';
    this.busy = false;
    this.queued = null;
    this.map = null;
    this.battle = null;
    this.ui = null; // set by PlayUI
    this.roamCount = 0;
    for (const m of state.party.members) normalizeMember(game, m, state.party.inventory);
  }

  get party() { return this.state.party; }
  get leader() { return partyAlive(this.party)[0] || this.party.members[0]; }

  log(text, cls) { this.ui && this.ui.log(text, cls); }

  // ------------------------------------------------------------ maps
  mapState(id) {
    if (!this.state.maps[id]) this.state.maps[id] = { removed: [], tiles: {}, moved: {}, explored: null };
    return this.state.maps[id];
  }

  buildLiveMap(id) {
    const src = getMap(this.game, id);
    if (!src) return null;
    const ms = this.mapState(id);
    const map = { ...src, tiles: src.tiles.slice(), entities: deepClone(src.entities) };
    for (const [i, t] of Object.entries(ms.tiles)) map.tiles[+i] = t;
    const removed = new Set(ms.removed);
    map.entities = map.entities.filter((e) => !removed.has(e.id));
    for (const e of map.entities) {
      if (ms.moved[e.id]) [e.x, e.y] = ms.moved[e.id];
      e.home = { x: e.x, y: e.y };
    }
    for (const e of ms.added || []) map.entities.push({ ...deepClone(e), home: { x: e.x, y: e.y } });
    map.explored = ms.explored ? rleDecode(ms.explored, map.w * map.h) : new Uint8Array(map.w * map.h);
    map.litMask = computeLitMask(map);
    return map;
  }

  async enterMap(id, x, y, opts = {}) {
    if (this.map) this.persistExplored();
    const map = this.buildLiveMap(id);
    if (!map) { this.log('That way leads nowhere (missing map).', 'warn'); return; }
    this.transitioning = true;
    this.queued = null;
    try {
      await this._enterMap(map, id, x, y, opts);
    } finally {
      this.transitioning = false;
      this.queued = null;
    }
  }

  async _enterMap(map, id, x, y, opts) {
    const zoomFor = (m) => (m.type === 'world' ? 18 : 15);
    // swoop the camera in (entering a site) or out (returning to the wide world)
    const dir = opts.zoom || (this.map && map.type !== 'world' && this.map.type === 'world' ? 'in' : this.map && map.type === 'world' && this.map.type !== 'world' ? 'out' : null);
    if (dir && !opts.instant) this.view.setZoom(this.view.rig.tdist * (dir === 'in' ? 0.45 : 1.8));
    if (!opts.instant) await this.app.fade(true);
    this.map = map;
    this.state.pos = { map: id, x, y };
    this.roamCount = 0;
    this.view.setMap(map);
    this.applyDaylight();
    playMusic(moodFor(map));
    this.view.setPitch(this.game.settings.pitch || 70);
    this.view.setZoom(zoomFor(map) * (dir === 'in' ? 1.9 : dir === 'out' ? 0.5 : 1), true);
    this.view.setZoom(zoomFor(map));
    this.view.focus(x, y, true);
    this.spawnVisuals();
    this.updateVisibility(true);
    this.ui && this.ui.refresh();
    if (!opts.instant) await this.app.fade(false);
    if (!opts.quiet) this.log(map.type === 'world' ? `You are in ${map.name}.` : `You enter ${map.name}.`, 'place');
    this.ui && this.ui.onMapChanged();
  }

  persistExplored() {
    if (this.map && this.map.explored) this.mapState(this.map.id).explored = rleEncode(this.map.explored);
  }

  // ------------------------------------------------------------ visuals
  entityLook(e) {
    switch (e.type) {
      case 'npc': return e.look || { kind: 'humanoid', race: 'human' };
      case 'monster': return byId(this.game.monsters, e.monster)?.look || { kind: 'blob' };
      case 'chest': return { kind: 'chest' };
      case 'sign': return { kind: 'sign' };
      case 'ship': return { kind: 'ship' };
      case 'portal': return e.style === 'waygate' ? { kind: 'waygate' } : null;
      default: return null;
    }
  }

  spawnVisuals() {
    this.view.clearEntities();
    for (const e of this.map.entities) this.addVisual(e);
    this.addPartyVisual();
  }

  addVisual(e) {
    const look = this.entityLook(e);
    if (!look) return;
    if (this.state.vehicle && this.state.vehicle.id === e.id) return;
    const scale = e.type === 'monster' && e.boss ? 1.2 : 1;
    this.view.addEntity(e.id, look, e.x, e.y, { ring: e.type === 'monster' ? 0xd03030 : null, scale });
  }

  // Out in the wide world the whole company travels together; in towns and
  // dungeons the leader stands for them all
  addPartyVisual() {
    const p = this.state.pos;
    if (this.state.vehicle) this.view.addEntity('party', { kind: 'ship', flag: 0xe0c040 }, p.x, p.y, { ring: 0xffd040, facing: this.state.facing });
    else if (this.map?.type === 'world' && partyAlive(this.party).length > 1) {
      const members = partyAlive(this.party).map((m) => charLook(this.game, m));
      this.view.addEntity('party', { kind: 'party', members }, p.x, p.y, { ring: 0xffd040, facing: this.state.facing });
    } else this.view.addEntity('party', charLook(this.game, this.leader), p.x, p.y, { ring: 0xffd040, facing: this.state.facing });
  }

  refreshPartyVisual() {
    if (!this.map) return;
    this.view.removeEntity('party');
    this.addPartyVisual();
  }

  // ------------------------------------------------------------ time of day
  dayCycleActive() {
    const m = this.map;
    return this.game.settings.dayNight !== false && !!m && (m.type === 'world' || m.type === 'town' || m.type === 'castle') && (!m.lighting || m.lighting === 'day');
  }

  timeOfDay() {
    const turn = this.state.turn || 0;
    const t = (turn % DAY_LEN) / DAY_LEN;
    let name = PHASES[0][1];
    for (const [at, n] of PHASES) if (t >= at) name = n;
    // 0 in daylight, 1 at night, ramping through evening and dawn
    const dark = t < 0.5 ? 0 : t < 0.6 ? (t - 0.5) / 0.1 : t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1;
    return { day: Math.floor(turn / DAY_LEN) + 1, t, name, dark };
  }

  darkness() { return this.dayCycleActive() ? this.timeOfDay().dark : 0; }

  currentLighting() {
    if (this.map?.lighting === 'dark') return 'dark';
    if (!this.dayCycleActive()) return this.map?.lighting || 'day';
    const k = this.darkness();
    return k > 0.75 ? 'night' : k > 0.25 ? 'dusk' : 'day';
  }

  applyDaylight() {
    if (!this.map) return;
    if (this.dayCycleActive()) this.view.setDaylight(this.darkness());
    else this.view.setLighting(this.map.lighting || 'day');
  }

  // announce nightfall and daybreak
  checkPhase() {
    if (!this.dayCycleActive()) { this.lastPhase = null; return; }
    const { name } = this.timeOfDay();
    if (this.lastPhase && name !== this.lastPhase) {
      if (name === 'Evening') this.log('The sun sinks low. Night is coming.', 'place');
      else if (name === 'Night') this.log('Night falls. Foul things walk in the dark.', 'warn');
      else if (name === 'Dawn') this.log('Dawn breaks over the land.', 'place');
    }
    this.lastPhase = name;
  }

  sightRadius() {
    const lighting = this.currentLighting();
    const keen = this.party.members.some((m) => m.status !== 'dead' && hasTrait(this.game, m, 'keenSight'));
    const dark = this.party.members.some((m) => m.status !== 'dead' && hasTrait(this.game, m, 'darkSight'));
    if (lighting === 'dark') {
      const light = this.party.light > 0 ? 5 : 1.6;
      return { sight: 14, light: light + (dark ? 1.2 : 0) };
    }
    if (lighting === 'night') return { sight: 8, light: (this.party.light > 0 ? 7 : 4) + (keen || dark ? 1 : 0) };
    const s = (this.map.type === 'world' ? 10.5 : 13) - (lighting === 'dusk' ? 2 : 0);
    return { sight: s + (keen ? 2 : 0), light: 99 };
  }

  updateVisibility(instant = false) {
    const map = this.map;
    if (!map) return;
    const p = this.state.pos;
    if (!this.game.settings.lineOfSight) {
      this.view.setVisibilityEnabled(false);
      for (const e of map.entities) this.view.setEntityVisible(e.id, true);
      map.explored.fill(1);
      this.visible = null;
      return;
    }
    const { sight, light } = this.sightRadius();
    const vis = computeVisible(map, p.x, p.y, sight, light, map.litMask);
    this.visible = vis;
    const dark = map.lighting === 'dark';
    const levels = new Float32Array(map.w * map.h);
    for (let i = 0; i < vis.length; i++) {
      if (vis[i]) { map.explored[i] = 1; levels[i] = 1; }
      else levels[i] = map.explored[i] ? (dark ? 0.32 : 0.45) : (dark ? 0 : 0.08);
    }
    this.view.setVisibility(levels, instant);
    this.view.setVisibilityEnabled(true);
    for (const e of map.entities) {
      const i = e.y * map.w + e.x;
      const show = e.type === 'npc' || e.type === 'monster' ? !!vis[i] : !!map.explored[i];
      this.view.setEntityVisible(e.id, show);
    }
  }

  isVisible(x, y) {
    if (!this.visible) return true;
    return !!this.visible[y * this.map.w + x];
  }

  // ------------------------------------------------------------ movement
  entitiesAt(x, y) { return this.map.entities.filter((e) => e.x === x && e.y === y); }

  blockingAt(x, y) {
    return this.map.entities.find((e) => e.x === x && e.y === y && (e.type === 'npc' || e.type === 'monster' || e.type === 'sign'));
  }

  async move(dx, dy) {
    if (this.mode !== 'explore' || this.transitioning) return;
    if (this.busy) { this.queued = [dx, dy]; return; }
    this.busy = true;
    try {
      await this._move(dx, dy);
    } finally {
      this.busy = false;
    }
    if (this.queued && this.mode === 'explore') {
      const q = this.queued;
      this.queued = null;
      this.move(q[0], q[1]);
    }
  }

  async _move(dx, dy) {
    const p = this.state.pos;
    const nx = p.x + dx, ny = p.y + dy;
    this.state.facing = [dx, dy];
    this.view.face('party', dx, dy);
    const map = this.map;
    if (!inBounds(map, nx, ny)) {
      if (map.exit) return this.leaveMap();
      this.log('You cannot travel beyond the edge of the world.');
      sfx('bump');
      return;
    }
    const blocker = this.blockingAt(nx, ny);
    if (blocker) {
      if (blocker.type === 'npc') return this.talkTo(blocker);
      if (blocker.type === 'monster') return this.engage(blocker);
      if (blocker.type === 'sign') { this.log(`The sign reads: "${blocker.text || '...'}"`, 'say'); return; }
    }
    const t = terrain(getTile(map, nx, ny));
    const gate = this.map.entities.find((e) => e.type === 'portal' && e.x === nx && e.y === ny && e.requires);
    if (gate && !this.hasItem(gate.requires)) {
      sfx('bump');
      this.log(gate.lockedText || `The way is barred. You need the ${itemOf(this.game, gate.requires)?.name || gate.requires}.`, 'warn');
      return;
    }
    const ship = this.map.entities.find((e) => e.type === 'ship' && e.x === nx && e.y === ny);
    if (this.state.vehicle) {
      if (t.ship || (t.water && t.key !== 'bridge')) {
        await this.stepParty(nx, ny, 0.14);
        const ve = this.map.entities.find((e) => e.id === this.state.vehicle.id);
        if (ve) { ve.x = nx; ve.y = ny; this.mapState(map.id).moved[ve.id] = [nx, ny]; }
        sfx('splash');
        return this.afterStep();
      }
      if (t.walk) {
        // disembark; the ship stays where it is
        const ve = this.map.entities.find((e) => e.id === this.state.vehicle.id);
        this.state.vehicle = null;
        this.refreshPartyVisual();
        if (ve) this.addVisual(ve);
        this.log('You go ashore.');
        await this.stepParty(nx, ny);
        return this.afterStep();
      }
      sfx('bump');
      return;
    }
    if (ship) {
      this.state.vehicle = { type: 'ship', id: ship.id };
      this.view.removeEntity(ship.id);
      await this.stepParty(nx, ny);
      this.refreshPartyVisual();
      this.log('You board the ship. Sail the seas — step onto land to go ashore.', 'good');
      return this.afterStep();
    }
    if (t.locked) return this.tryUnlock(nx, ny);
    if (!t.walk) {
      sfx('bump');
      this.log(t.water ? 'You cannot swim! (Find a ship or a bridge.)' : `Blocked by ${t.name.toLowerCase()}.`);
      return;
    }
    if (t.slow && rng.chance(t.slow) && !this.mapIsTown()) {
      this.log('Slow progress!');
      return this.afterStep(true);
    }
    await this.stepParty(nx, ny);
    if (t.door) sfx('door'); else sfx('step');
    return this.afterStep();
  }

  mapIsTown() { return this.map.type === 'town' || this.map.type === 'castle'; }

  hasItem(id) {
    return (this.party.inventory[id] || 0) > 0 || this.party.members.some((m) => Object.values(m.equip || {}).includes(id));
  }

  async stepParty(x, y, dur = 0.13) {
    this.state.pos.x = x;
    this.state.pos.y = y;
    this.view.focus(x, y);
    await this.view.moveEntity('party', x, y, dur, this.state.vehicle ? 0 : 0.07);
  }

  async tryUnlock(x, y) {
    const inv = this.party.inventory;
    const picker = partyAlive(this.party).find((m) => hasAbility(this.game, m, 'lockpick'));
    const keyItem = this.game.items.find((it) => it.type === 'key' && inv[it.id] > 0);
    if (picker && rng.chance(0.6 + picker.dex * 0.015)) {
      this.log(`${picker.name} picks the lock!`, 'good');
    } else if (keyItem) {
      inv[keyItem.id]--;
      this.log(`You unlock the door with a ${keyItem.name}.`, 'good');
    } else {
      sfx('bump');
      this.log(picker ? `${picker.name} fails to pick the lock.` : 'The door is locked. You need a key.');
      return this.afterStep(true);
    }
    this.setTileLive(x, y, T.door);
    sfx('door');
    this.ui.refresh();
  }

  setTileLive(x, y, t) {
    const map = this.map;
    map.tiles[y * map.w + x] = t;
    this.mapState(map.id).tiles[y * map.w + x] = t;
    this.view.refreshTiles(x, y, x, y);
    map.litMask = computeLitMask(map);
  }

  async wait() {
    if (this.mode !== 'explore' || this.busy || this.transitioning) return;
    this.busy = true;
    this.log('You wait a moment.');
    try { await this.afterStep(true); } finally { this.busy = false; }
  }

  // Called after every turn on a map
  async afterStep(noMove = false) {
    const st = this.state;
    st.turn++;
    this.applyDaylight();
    this.checkPhase();
    const map = this.map;
    const p = st.pos;
    // portals & pickups
    if (!noMove) {
      const here = this.entitiesAt(p.x, p.y);
      const chest = here.find((e) => e.type === 'chest');
      if (chest) await this.openChest(chest);
      const portal = here.find((e) => e.type === 'portal');
      if (portal && !st.vehicle) return this.usePortal(portal);
      if (map.type !== 'world' && !st.vehicle) {
        const tk = terrain(getTile(map, p.x, p.y)).key;
        if ((tk === 'stairs_up' || tk === 'stairs_down') && !portal && map.exit) return this.leaveMap();
      }
    }
    // hazards
    const t = terrain(getTile(map, p.x, p.y));
    if (!noMove && !st.vehicle) {
      if (t.poison) for (const m of partyAlive(this.party)) {
        if (m.status === 'ok' && rng.chance(t.poison) && !(hasTrait(this.game, m, 'poisonResist') && rng.chance(0.6))) {
          m.status = 'poisoned';
          this.log(`${m.name} is poisoned by the foul water!`, 'bad');
        }
      }
      if (t.dmg) {
        for (const m of partyAlive(this.party)) this.hurtMember(m, roll(`1d${t.dmg}`), 'burns');
        this.view.burst(p.x, p.y, 0xff6020, 10);
        sfx('fire');
      }
    }
    // poison ticks
    for (const m of partyAlive(this.party)) {
      if (m.status === 'poisoned' && st.turn % 2 === 0) this.hurtMember(m, 1, 'poison');
    }
    // food
    if (this.game.settings.food && (map.type === 'world' || map.type === 'dungeon')) {
      st.foodTick++;
      if (st.foodTick >= 10) {
        st.foodTick = 0;
        const n = partyAlive(this.party).length;
        this.party.food = Math.max(0, this.party.food - n);
        if (this.party.food <= 0) {
          this.log('Starving!', 'bad');
          for (const m of partyAlive(this.party)) this.hurtMember(m, rng.int(1, 3), 'hunger');
        } else if (this.party.food < n * 5) this.log('Food is running low.', 'warn');
      }
    }
    if (this.party.light > 0) {
      this.party.light--;
      if (this.party.light === 0) this.log('Your light goes out.', 'warn');
    }
    if (this.checkDefeat()) return;
    // the world moves
    const combat = await this.monstersAct();
    if (combat) return;
    this.npcsAct();
    this.maybeSpawnEncounter();
    this.updateVisibility();
    this.ui.refresh();
    if (st.turn % 40 === 0) this.autosave();
  }

  hurtMember(m, dmg, why) {
    if (m.status === 'dead') return;
    m.hp -= dmg;
    if (m.hp <= 0) {
      m.hp = 0;
      m.status = 'dead';
      this.log(`${m.name} has died${why ? ' of ' + why : ''}!`, 'bad');
      sfx('die');
      this.refreshPartyVisual();
    }
  }

  checkDefeat() {
    if (partyAlive(this.party).length) return false;
    this.mode = 'gameover';
    this.ui.showGameOver();
    return true;
  }

  // ------------------------------------------------------------ portals
  async usePortal(portal) {
    const tgt = portal.target || {};
    sfx('portal');
    if (tgt.map === 'exit' || (!tgt.map && this.map.exit)) return this.leaveMap();
    const dest = getMap(this.game, tgt.map);
    if (!dest) { this.log('The way is sealed.'); return; }
    if (portal.requires) this.log(portal.openText || `The ${itemOf(this.game, portal.requires)?.name || 'key'} turns... the way opens!`, 'good');
    this.persistExplored();
    if (portal.style === 'waygate') this.view.sparkle(this.state.pos.x, this.state.pos.y, 0x80b0ff, 24);
    const x = tgt.x ?? dest.entry?.x ?? Math.floor(dest.w / 2);
    const y = tgt.y ?? dest.entry?.y ?? dest.h - 2;
    await this.enterMap(dest.id, x, y);
    this.autosave();
  }

  async leaveMap() {
    const exit = this.map.exit;
    if (!exit) return;
    const dest = getMap(this.game, exit.map);
    if (!dest) return;
    this.persistExplored();
    this.log(`You leave ${this.map.name}.`);
    await this.enterMap(dest.id, exit.x, exit.y, { quiet: true });
    // step off the site tile so that we don't immediately re-enter
    this.autosave();
  }

  // ------------------------------------------------------------ chests
  async openChest(chest) {
    const st = this.state;
    if (chest.locked) {
      const picker = partyAlive(this.party).find((m) => hasAbility(this.game, m, 'lockpick'));
      const key = this.game.items.find((it) => it.type === 'key' && this.party.inventory[it.id] > 0);
      if (picker) this.log(`${picker.name} picks the chest's lock.`);
      else if (key) { this.party.inventory[key.id]--; this.log(`You open the chest with a ${key.name}.`); }
      else { this.log('The chest is locked.'); return; }
    }
    if (chest.trap) {
      const burglar = partyAlive(this.party).find((m) => hasAbility(this.game, m, 'lockpick'));
      if (burglar && rng.chance(0.75)) this.log(`${burglar.name} disarms a trap!`, 'good');
      else {
        this.log('A trap! Poison needles!', 'bad');
        for (const m of partyAlive(this.party)) if (rng.chance(0.5) && !hasTrait(this.game, m, 'poisonResist')) m.status = 'poisoned';
      }
    }
    const gold = chest.gold ? roll(chest.gold) : 0;
    const got = [];
    if (gold > 0) { this.party.gold += gold; got.push(`${gold} gold`); }
    for (const it of chest.items || []) {
      const def = itemOf(this.game, it.id);
      if (!def) continue;
      this.party.inventory[it.id] = (this.party.inventory[it.id] || 0) + (it.n || 1);
      got.push((it.n || 1) > 1 ? `${it.n} × ${def.name}` : def.name);
    }
    sfx('gold');
    this.view.burst(chest.x, chest.y, 0xffd040, 14, { up: 2, speed: 0.8 });
    this.log(got.length ? `The chest holds: ${got.join(', ')}.` : 'The chest is empty.', 'good');
    this.removeEntity(chest);
    if (chest.flag) this.party.flags[chest.flag] = true;
    this.checkVictory();
  }

  removeEntity(e, persist = true) {
    this.map.entities = this.map.entities.filter((x) => x !== e);
    this.view.removeEntity(e.id);
    if (persist && !e.roaming) this.mapState(this.map.id).removed.push(e.id);
  }

  // ------------------------------------------------------------ NPCs & monsters
  passableFor(e, x, y) {
    const map = this.map;
    if (!inBounds(map, x, y)) return false;
    const t = terrain(getTile(map, x, y));
    if (e.type === 'monster') {
      const def = byId(this.game.monsters, e.monster);
      if (def?.swim) { if (!t.water || t.key === 'bridge') return false; }
      else if (!t.walk) return false;
      else if (def?.fly ? false : t.dmg) return false;
    } else if (!t.walk || t.door) {
      if (!(t.walk && t.door && e.type === 'npc')) return false;
    }
    if (this.map.entities.some((o) => o !== e && o.x === x && o.y === y && (o.type === 'npc' || o.type === 'monster' || o.type === 'sign' || o.type === 'ship'))) return false;
    if (e.type === 'monster' && this.map.entities.some((o) => o.type === 'portal' && o.x === x && o.y === y)) return false;
    return true;
  }

  async monstersAct() {
    const p = this.state.pos;
    const map = this.map;
    for (const e of [...map.entities]) {
      if (e.type !== 'monster') continue;
      const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      if (d > 22) {
        if (e.roaming && d > 30) this.removeEntity(e, false);
        continue;
      }
      if (e.passive) continue;
      const sees = d <= 9 && hasLOS(map, e.x, e.y, p.x, p.y) && (map.lighting !== 'dark' || this.isVisible(e.x, e.y) || d <= 4);
      const def = byId(this.game.monsters, e.monster);
      let moves = def?.speed > 1 && rng.chance(0.4) ? 2 : 1;
      while (moves-- > 0) {
        if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1) break;
        let step = null;
        if (sees && e.wander !== 0) {
          step = stepToward(e.x, e.y, p.x, p.y, (x, y) => this.passableFor(e, x, y), 12);
        } else if (e.wander !== 0 && rng.chance(0.4)) {
          const [dx, dy] = rng.pick(DIR4);
          const nx = e.x + dx, ny = e.y + dy;
          const home = e.home || e;
          const wr = e.roaming ? 99 : (e.wander ?? 4);
          if (Math.abs(nx - home.x) + Math.abs(ny - home.y) <= wr && this.passableFor(e, nx, ny) && !(nx === p.x && ny === p.y)) step = [nx, ny];
        }
        if (step && !(step[0] === p.x && step[1] === p.y)) {
          e.x = step[0]; e.y = step[1];
          this.view.moveEntity(e.id, e.x, e.y, 0.14, 0.05);
        }
      }
      if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1 && (sees || d <= 2)) {
        this.view.face(e.id, p.x - e.x, p.y - e.y);
        const name = def ? def.plural || def.name : 'Monsters';
        this.log(`${name} attack!`, 'bad');
        await this.engage(e);
        return true;
      }
    }
    return false;
  }

  npcsAct() {
    const p = this.state.pos;
    for (const e of this.map.entities) {
      if (e.type !== 'npc' || !e.wander || e.hostile) continue;
      if (!rng.chance(0.3)) continue;
      const [dx, dy] = rng.pick(DIR4);
      const nx = e.x + dx, ny = e.y + dy;
      if (nx === p.x && ny === p.y) continue;
      if (Math.abs(nx - e.home.x) + Math.abs(ny - e.home.y) > e.wander) continue;
      if (!this.passableFor(e, nx, ny)) continue;
      const t = terrain(getTile(this.map, nx, ny));
      if (t.door) continue; // villagers stay in or out
      e.x = nx; e.y = ny;
      this.view.moveEntity(e.id, nx, ny, 0.2, 0.05);
    }
  }

  maybeSpawnEncounter() {
    const map = this.map;
    const rate = (map.encounterRate ?? 0) * (this.game.settings.encounterRate ?? 1) * (1 + 0.5 * this.darkness());
    if (!rate) return;
    const tracker = partyAlive(this.party).some((m) => hasAbility(this.game, m, 'tracker'));
    const base = map.type === 'dungeon' ? 0.03 : 0.035;
    if (!rng.chance(base * rate * (tracker ? 0.7 : 1))) return;
    if (map.entities.filter((e) => e.roaming).length >= 4) return;
    const p = this.state.pos;
    for (let a = 0; a < 20; a++) {
      const x = p.x + rng.int(-9, 9), y = p.y + rng.int(-9, 9);
      const d = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d < 6 || !inBounds(map, x, y)) continue;
      if (this.isVisible(x, y) && map.type !== 'world') continue;
      const t = terrain(getTile(map, x, y));
      const habitat = map.type === 'dungeon' ? 'dungeon' : t.water ? 'water' : habitatOf(t);
      if (!habitat) continue;
      const mon = this.pickMonster(habitat);
      if (!mon) return;
      const e = { id: uid('roam'), type: 'monster', monster: mon.id, x, y, roaming: true, count: `${mon.group?.[0] || 1}-${mon.group?.[1] || 3}`, wander: 99 };
      if (!this.passableFor(e, x, y)) continue;
      e.home = { x, y };
      map.entities.push(e);
      this.addVisual(e);
      return;
    }
  }

  pickMonster(habitat) {
    const lvl = partyLevel(this.party);
    const allowed = this.map.encounters && this.map.encounters.length ? new Set(this.map.encounters) : null;
    const cands = this.game.monsters.filter((m) => !m.boss && (m.habitat || []).includes(habitat) && (!allowed || allowed.has(m.id)) && (m.level || 1) <= lvl + 2 + (this.map.level || 1) - 1);
    if (!cands.length) return null;
    return new RNG(rng.int(0, 1e9)).weighted(cands, (m) => {
      const diff = Math.abs((m.level || 1) - lvl);
      return diff === 0 ? 4 : diff === 1 ? 3 : 1;
    });
  }

  // ------------------------------------------------------------ combat
  enemiesFor(e) {
    const def = byId(this.game.monsters, e.monster);
    if (!def) return [];
    let n = 1;
    if (e.count) {
      const m = String(e.count).match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (m) n = m[2] ? rng.int(+m[1], +m[2]) : +m[1];
    } else if (def.group) n = rng.int(def.group[0], def.group[1]);
    const list = [{ id: def.id, n: Math.max(1, Math.min(n, 12)) }];
    for (const esc of def.escort || []) {
      const k = rng.int(esc.min || 0, esc.max || 0);
      if (k > 0 && byId(this.game.monsters, esc.id)) list.push({ id: esc.id, n: k });
    }
    return list;
  }

  async engage(e) {
    const enemies = this.enemiesFor(e);
    if (!enemies.length) return;
    const p = this.state.pos;
    const t = terrain(getTile(this.map, p.x, p.y));
    let style = this.state.vehicle ? 'water' : t.arena;
    if (this.map.type === 'dungeon' && !['cave', 'indoor'].includes(style)) style = 'cave';
    if (this.mapIsTown() && style === 'grass') style = 'town';
    const res = await this.fight(enemies, style, { boss: e.boss, source: e });
    if (res.outcome === 'victory') {
      const real = this.map.entities.find((x) => x.id === e.id);
      if (real) this.removeEntity(real, !real.roaming);
      if (e.flag) { this.party.flags[e.flag] = true; this.checkVictory(); }
    } else if (res.outcome === 'fled' && e.roaming) {
      const real = this.map.entities.find((x) => x.id === e.id);
      if (real) this.removeEntity(real, false);
    }
    return res;
  }

  async fight(enemies, style, opts = {}) {
    this.mode = 'combat';
    this.queued = null;
    this.persistExplored();
    sfx('encounter');
    this.view.shake(0.2, 0.3);
    this.view.setZoom(this.view.rig.tdist * 0.5);
    playMusic('combat');
    await this.app.fade(true, 300);
    this.battle = new Battle(this, enemies, style, opts);
    this.ui.setMode('combat');
    const res = await this.battle.run();
    this.battle = null;
    // restore the exploration view
    await this.app.fade(true, 200);
    this.view.setMap(this.map);
    this.applyDaylight();
    playMusic(res.outcome === 'defeat' ? null : moodFor(this.map));
    this.view.setZoom(this.map.type === 'world' ? 18 : 15, true);
    this.view.focus(this.state.pos.x, this.state.pos.y, true);
    this.spawnVisuals();
    this.updateVisibility(true);
    if (res.outcome === 'defeat') {
      this.mode = 'gameover';
      this.ui.setMode('explore');
      await this.app.fade(false);
      this.ui.showGameOver();
      return res;
    }
    this.mode = 'explore';
    this.ui.setMode('explore');
    this.ui.refresh();
    await this.app.fade(false, 250);
    if (res.killedIds) for (const id of res.killedIds) this.onMonsterKilled(id);
    this.checkVictory();
    return res;
  }

  onMonsterKilled(monsterId) {
    this.party.flags['killed_' + monsterId] = true;
  }

  checkVictory() {
    const v = this.game.settings.victory;
    if (!v || !v.type || v.type === 'none' || this.state.won) return false;
    let won = false;
    if (v.type === 'kill') won = !!this.party.flags['killed_' + v.target];
    else if (v.type === 'item') won = (this.party.inventory[v.target] || 0) > 0;
    else if (v.type === 'flag') won = !!this.party.flags[v.target];
    if (won) {
      this.state.won = true;
      this.autosave();
      setTimeout(() => this.ui.showVictory(), 600);
    }
    return won;
  }

  // ------------------------------------------------------------ talking
  talkTo(npc) {
    this.queued = null;
    if (npc.hostile) return this.engage({ ...npc, monster: npc.hostile, count: '1' });
    this.view.face('party', npc.x - this.state.pos.x, npc.y - this.state.pos.y);
    this.view.face(npc.id, this.state.pos.x - npc.x, this.state.pos.y - npc.y);
    this.mode = 'dialog';
    this.ui.openDialog(npc);
  }

  talkDirection(dx, dy) {
    const p = this.state.pos;
    for (let r = 1; r <= 2; r++) {
      const x = p.x + dx * r, y = p.y + dy * r;
      const npc = this.map.entities.find((e) => e.type === 'npc' && e.x === x && e.y === y);
      if (npc) return this.talkTo(npc);
      const t = terrain(getTile(this.map, x, y));
      if (!t.talkOver) break;
    }
    this.log('Nobody is there.');
  }

  dialogContext() {
    const rumours = [];
    for (const m of this.game.maps) for (const e of m.entities) if (e.type === 'npc' && e.rumour) rumours.push(e.rumour);
    return {
      state: this.state,
      partyLevel: partyLevel(this.party),
      leaderName: this.leader?.name,
      rumour: () => (rumours.length ? rng.pick(rumours) : null),
    };
  }

  say(npc, input) {
    const ctx = this.dialogContext();
    const res = respond(npc, input, ctx);
    res.text = fillText(res.text, ctx);
    const ok = res.action ? this.runAction(npc, res.action, res) : true;
    if (res.setFlag && ok !== false) this.party.flags[res.setFlag] = true;
    return res;
  }

  runAction(npc, a, res) {
    const inv = this.party.inventory;
    const n = parseInt(a.n, 10) || 1;
    let ok = true;
    switch (a.type) {
      case 'give_item': {
        const it = itemOf(this.game, a.value);
        if (it) { inv[it.id] = (inv[it.id] || 0) + n; res.note = `Received ${n > 1 ? n + ' × ' : ''}${it.name}.`; sfx('gold'); }
        break;
      }
      case 'take_item': {
        const it = itemOf(this.game, a.value);
        if (it && (inv[it.id] || 0) >= n) { inv[it.id] -= n; res.note = `Gave ${it.name}.`; }
        else { res.note = `You do not have ${n > 1 ? n + ' × ' : ''}${it ? it.name : 'that'}.`; ok = false; }
        break;
      }
      case 'give_gold': this.party.gold += n; res.note = `Received ${n} gold.`; sfx('gold'); break;
      case 'give_xp': {
        const ups = [];
        for (const m of partyAlive(this.party)) if (gainXp(this.game, m, n).length) ups.push(`${m.name} reaches level ${m.level}`);
        res.note = `The party gains ${n} experience.${ups.length ? ' ' + ups.join('; ') + '!' : ''}`;
        sfx(ups.length ? 'level' : 'gold');
        break;
      }
      case 'take_gold':
        if (this.party.gold >= n) { this.party.gold -= n; res.note = `Paid ${n} gold.`; } else { res.note = 'You cannot afford it.'; ok = false; }
        break;
      case 'set_flag': this.party.flags[a.value] = true; break;
      case 'clear_flag': delete this.party.flags[a.value]; break;
      case 'heal':
        for (const m of this.party.members) {
          if (m.status === 'dead') continue;
          m.hp = maxHp(this.game, m); m.mp = maxMp(this.game, m);
          if (m.status === 'poisoned') m.status = 'ok';
        }
        sfx('heal');
        res.note = 'The party is healed.';
        break;
      case 'join': res.join = true; break;
      case 'teleport': res.teleport = a; break;
      case 'fight': res.fight = a.value || npc.hostile || 'bandit'; break;
      case 'victory': res.victory = true; break;
      case 'shop': res.shop = true; break;
      case 'inn': res.inn = true; break;
      case 'healer': res.healer = true; break;
      default: break;
    }
    this.ui.refresh();
    this.checkVictory();
    return ok;
  }

  recruit(npc) {
    if (!this.map.entities.includes(npc)) return `${npc.name} has already joined thee.`;
    const max = this.game.settings.maxParty || 6;
    if (this.party.members.length >= max) return `Thy company is full (${max}).`;
    const r = npc.recruit || {};
    const c = createCharacter(this.game, {
      name: npc.name,
      race: r.race || npc.look?.race || 'human',
      cls: r.cls || 'warrior',
      stats: r.stats || { str: 13, dex: 13, int: 12, wis: 12 },
    });
    c.level = Math.max(1, parseInt(r.level, 10) || 1);
    c.xp = xpForLevel(c.level);
    c.points = c.level - 1; // seasoned companions arrive with points to spend
    c.hp = maxHp(this.game, c); c.mp = maxMp(this.game, c);
    equipKit(this.game, c, r.equip || byId(this.game.classes, c.cls)?.start);
    c.look = {};
    this.party.members.push(c);
    this.removeEntity(npc);
    this.refreshPartyVisual();
    sfx('level');
    this.ui.refresh();
    return null;
  }

  // ------------------------------------------------------------ field actions
  async castField(caster, spell, target) {
    const can = canCast(this.game, caster, spell, this.party.inventory);
    if (!can.ok) { this.log(can.why, 'warn'); sfx('error'); return false; }
    if (!spell.field) { this.log('That spell can only be cast in battle.', 'warn'); return false; }
    payForSpell(caster, spell, this.party.inventory);
    sfx('spell');
    this.log(`${caster.name} casts ${spell.name}.`, 'magic');
    const p = this.state.pos;
    const bonus = spellPower(this.game, caster, spell);
    const targets = spell.target === 'allAllies' ? partyAlive(this.party) : target ? [target] : [];
    switch (spell.effect) {
      case 'heal':
        for (const m of targets) {
          if (m.status === 'dead') continue;
          const amt = roll(spell.power || '1d8') + bonus;
          m.hp = Math.min(maxHp(this.game, m), m.hp + amt);
          this.log(`${m.name} is healed for ${amt}.`, 'good');
        }
        this.view.sparkle(p.x, p.y);
        sfx('heal');
        break;
      case 'cure':
        for (const m of targets) if (m.status === 'poisoned') { m.status = 'ok'; this.log(`${m.name} is cured.`, 'good'); }
        this.view.sparkle(p.x, p.y, 0xa0ffa0);
        break;
      case 'revive':
        for (const m of targets) {
          if (m.status !== 'dead') { this.log(`${m.name} is not dead.`); continue; }
          m.status = 'ok';
          m.hp = Math.max(1, Math.floor(maxHp(this.game, m) / 3));
          this.log(`${m.name} returns to life!`, 'good');
        }
        this.view.sparkle(p.x, p.y, 0xffffff, 24);
        this.refreshPartyVisual();
        break;
      case 'light':
        this.party.light = Math.max(this.party.light, parseInt(spell.power, 10) || 150);
        this.log('A soft light surrounds the party.', 'good');
        this.view.sparkle(p.x, p.y, 0xfff0a0);
        break;
      case 'reveal': this.reveal(); break;
      case 'recall': await this.recall(); break;
      default: this.log('Nothing happens.');
    }
    this.updateVisibility();
    this.ui.refresh();
    return true;
  }

  async recall() {
    const s = this.game.settings.start;
    const p = this.state.pos;
    this.view.sparkle(p.x, p.y, 0xa0c0ff, 30);
    this.state.vehicle = null;
    this.log('The world blurs... and you stand where your journey began.', 'magic');
    await this.enterMap(s.map, s.x, s.y);
  }

  reveal(radius = 14) {
    const p = this.state.pos;
    const map = this.map;
    for (let y = p.y - radius; y <= p.y + radius; y++) for (let x = p.x - radius; x <= p.x + radius; x++) {
      if (inBounds(map, x, y) && (x - p.x) ** 2 + (y - p.y) ** 2 <= radius * radius) map.explored[y * map.w + x] = 1;
    }
    this.log('The land is revealed to your mind\'s eye.', 'magic');
    this.updateVisibility();
    this.ui.openMap();
  }

  useItemField(item, target) {
    const inv = this.party.inventory;
    if (!inv[item.id]) return false;
    const p = this.state.pos;
    const consume = () => { inv[item.id]--; };
    switch (item.effect) {
      case 'heal': {
        if (!target || target.status === 'dead') return false;
        const amt = roll(item.power || '2d8');
        target.hp = Math.min(maxHp(this.game, target), target.hp + amt);
        this.log(`${target.name} drinks the ${item.name} (+${amt} HP).`, 'good');
        this.view.sparkle(p.x, p.y); sfx('heal');
        consume(); break;
      }
      case 'cure':
        if (!target) return false;
        if (target.status === 'poisoned') target.status = 'ok';
        this.log(`${target.name} is cured.`, 'good'); consume(); break;
      case 'mp': {
        if (!target) return false;
        const amt = roll(item.power || '2d6');
        target.mp = Math.min(maxMp(this.game, target), target.mp + amt);
        this.log(`${target.name} regains ${amt} mana.`, 'good'); consume(); break;
      }
      case 'revive':
        if (!target || target.status !== 'dead') { this.log('Only the fallen can be revived.'); return false; }
        target.status = 'ok'; target.hp = Math.max(1, Math.floor(maxHp(this.game, target) / 2));
        this.log(`${target.name} is restored to life!`, 'good'); consume(); this.refreshPartyVisual(); break;
      case 'light':
        this.party.light = Math.max(this.party.light, parseInt(item.power, 10) || 100);
        this.log('You light a torch.', 'good'); consume(); break;
      case 'food':
        this.party.food += parseInt(item.power, 10) || 25;
        this.log(`You pack away the provisions (+${parseInt(item.power, 10) || 25} food).`); consume(); break;
      case 'reveal': consume(); this.reveal(); break;
      case 'recall': consume(); this.recall(); break;
      default: this.log('You cannot use that here.'); return false;
    }
    this.updateVisibility();
    this.ui.refresh();
    return true;
  }

  async camp() {
    if (this.mode !== 'explore' || this.busy || this.transitioning) return;
    this.queued = null;
    if (this.mapIsTown()) { this.log('Find an inn to rest in town.'); return; }
    const p = this.state.pos;
    if (this.map.entities.some((e) => e.type === 'monster' && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) < 8 && this.isVisible(e.x, e.y))) {
      this.log('You cannot rest with enemies nearby!', 'warn');
      return;
    }
    const n = partyAlive(this.party).length;
    if (this.game.settings.food && this.party.food < n) { this.log('You have no food to make camp.', 'warn'); return; }
    this.busy = true;
    this.log('You make camp and rest...', 'place');
    this.view.addEntity('campfire', { kind: 'campfire' }, p.x, p.y + (inBounds(this.map, p.x, p.y + 1) && terrain(getTile(this.map, p.x, p.y + 1)).walk ? 1 : 0));
    await this.view.wait(1.2);
    this.view.removeEntity('campfire');
    if (this.game.settings.food) this.party.food -= n;
    this.state.turn += 50;
    this.applyDaylight();
    this.checkPhase();
    this.updateVisibility();
    if (rng.chance(0.18) && (this.map.encounterRate ?? 0) > 0) {
      this.busy = false;
      const t = terrain(getTile(this.map, p.x, p.y));
      const mon = this.pickMonster(this.map.type === 'dungeon' ? 'dungeon' : habitatOf(t) || 'grass');
      if (mon) {
        this.log('Ambush! Your camp is attacked!', 'bad');
        await this.engage({ id: uid('amb'), monster: mon.id, roaming: true });
        return;
      }
    }
    for (const m of partyAlive(this.party)) {
      m.hp = Math.min(maxHp(this.game, m), m.hp + Math.ceil(maxHp(this.game, m) * 0.5));
      m.mp = Math.min(maxMp(this.game, m), m.mp + Math.ceil(maxMp(this.game, m) * 0.6));
    }
    this.log('The party wakes refreshed.', 'good');
    sfx('heal');
    this.busy = false;
    this.ui.refresh();
  }

  // ------------------------------------------------------------ saving
  serializeState() {
    this.persistExplored();
    return JSON.parse(JSON.stringify(this.state));
  }

  autosave() {
    if (this.opts.noSave) return;
    saveState(this.game.id, this.serializeState());
  }

  save() {
    if (this.opts.noSave) { this.log('(Playtest: progress is not saved.)'); return false; }
    const ok = saveState(this.game.id, this.serializeState());
    this.log(ok ? 'Game saved.' : 'Could not save — browser storage is full.', ok ? 'good' : 'bad');
    return ok;
  }

  // respawn the party at the start after defeat
  async resurrect() {
    const s = this.game.settings.start;
    for (const m of this.party.members) {
      m.status = 'ok';
      m.hp = Math.max(1, Math.floor(maxHp(this.game, m) / 2));
      m.mp = maxMp(this.game, m);
      m.buffs = [];
    }
    this.party.gold = Math.floor(this.party.gold / 2);
    this.state.vehicle = null;
    this.mode = 'explore';
    this.ui.setMode('explore');
    await this.enterMap(s.map, s.x, s.y);
    this.log('You awaken where your journey began, your purse lighter.', 'place');
  }

  // ------------------------------------------------------------ helpers for the UI
  findPathTo(x, y) {
    const p = this.state.pos;
    const ship = !!this.state.vehicle;
    return findPath(p.x, p.y, x, y, (tx, ty) => {
      if (!inBounds(this.map, tx, ty)) return false;
      const t = terrain(getTile(this.map, tx, ty));
      if (ship ? !(t.water && t.key !== 'bridge') : !t.walk) return false;
      if (this.map.lighting === 'dark' && !this.map.explored[ty * this.map.w + tx]) return false;
      return !this.blockingAt(tx, ty);
    }, 30);
  }

  describeTile(x, y) {
    if (!inBounds(this.map, x, y)) return 'The edge of the world.';
    if (this.visible && !this.map.explored[y * this.map.w + x]) return 'Darkness.';
    const t = terrain(getTile(this.map, x, y));
    const parts = [t.name];
    if (this.isVisible(x, y)) {
      for (const e of this.entitiesAt(x, y)) {
        if (e.type === 'npc') parts.push(e.name ? `${e.name}, ${e.desc || ''}` : e.desc || 'someone');
        else if (e.type === 'monster') { const d = byId(this.game.monsters, e.monster); parts.push(d ? `${d.plural || d.name}` : 'monsters'); }
        else if (e.type === 'chest') parts.push('a chest');
        else if (e.type === 'ship') parts.push('a ship');
        else if (e.type === 'sign') parts.push('a sign');
        else if (e.type === 'portal' && e.label) parts.push(e.label);
      }
    }
    return parts.join(' — ');
  }

  spellsFor(m, context) {
    return knownSpells(this.game, m).filter((s) => (context === 'combat' ? s.combat : s.field));
  }
}

export function habitatOf(t) {
  switch (t.arena) {
    case 'grass': case 'bridge': case 'town': return 'grass';
    case 'forest': return 'forest';
    case 'hills': return 'hills';
    case 'swamp': return 'swamp';
    case 'desert': return 'desert';
    case 'snow': return 'snow';
    case 'ash': return 'ash';
    case 'ruins': return 'ruins';
    case 'water': return 'water';
    case 'cave': case 'indoor': return 'dungeon';
    default: return 'grass';
  }
}

export { plural };
