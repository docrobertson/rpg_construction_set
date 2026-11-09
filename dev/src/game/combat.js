// Tactical battles on a small arena map. Every combatant acts in initiative
// order: heroes move several squares and then strike, shoot, cast or use one
// of their class skills; monsters follow the behaviour set in their data.
// Position matters: flanking, blows from behind, cover from archers and free
// strikes at anyone who breaks away from a foe.
import { terrain, T } from '../data/terrain.js';
import { byId } from '../data/schema.js';
import { STATUS_EFFECTS } from '../data/defaults.js';
import { generateArena, ARENA_W, ARENA_H, bresenham } from '../world/generate.js';
import { getTile, inBounds } from '../world/map.js';
import { rng, roll, parseDice } from '../core/rng.js';
import { DIR4, deepClone } from '../core/util.js';
import {
  attackBonus, armorClass, damageRoll, damageBonus, weaponOf, rangedOf, critRange, maxHp, maxMp, charLook, hasTrait, hasAbility,
  canCast, payForSpell, spellPower, gainXp, partyAlive, knownSpells, specialOf, combatMoves, heroAbilities, abilityOf, ensureCombatData,
  perkCount, mod, classOf, levelUpNote, magicalOf,
} from './rules.js';
import { hasMagic } from './charms.js';
import { sfx } from '../core/sound.js';
import { lootTag, restoresPool, poolWords } from './magic.js';
import { BattleFx } from '../render/fx.js';

// The company's opening order: the first half of the roster in the front
// rank, a square apart, and the rest a step behind, each in a gap of the rank
// ahead (then at its ends), so the back rank can step up or shoot past
export function partySpots(n) {
  const front = Math.ceil(n / 2);
  const f = Array.from({ length: front }, (_, i) => 6 + (i - (front - 1) / 2) * 2);
  const gaps = f.slice(1).map((x, i) => (x + f[i]) / 2);
  const back = [...gaps, f[f.length - 1] + 1, f[0] - 1].slice(0, n - front).sort((a, b) => a - b);
  const fit = (x) => Math.max(0, Math.min(ARENA_W - 1, x));
  return [...f.map((x) => [fit(x), 7]), ...back.map((x) => [fit(x), 8])];
}
const fxHex = (n) => '#' + ((n ?? 0xffffff) >>> 0).toString(16).padStart(6, '0');
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const LEGACY = { stunned: 'stun', asleep: 'sleep', afraid: 'fear' };
// the blow a foe gets in when someone breaks away from it
const FREE_STRIKE = { id: '_free', name: 'Free strike', attack: 'melee' };
// the blow a riposting fighter answers with
const RIPOSTE = { id: '_riposte', name: 'Riposte', attack: 'melee', fx: 0xffd0a0 };
// "1d6+2" with n more: a called creature fights at its caller's level
function plusDice(dice, n) {
  if (!n) return dice || '1d4';
  const d = parseDice(dice || '1d4');
  const b = d.b + n;
  return d.d ? `${d.n}d${d.d}${b ? (b > 0 ? '+' : '') + b : ''}` : String(b);
}

export class Battle {
  constructor(session, enemies, style, opts = {}) {
    this.s = session;
    this.game = session.game;
    this.view = session.view;
    this.style = style;
    this.opts = opts;
    this.enemyList = enemies;
    this.units = [];
    this.round = 1;
    this.pending = null;
    this.active = null;
    this.current = null;
    this.order = [];
    this.turnIdx = 0;
    this.acting = false;
    this.xp = 0;
    this.gold = 0;
    this.killedIds = [];
    this.loot = [];
    this.over = false;
    // (delve) a battle on the live map where the company stands: opts.field
    // brings the map, the figures on it and what the dungeon decides
    this.field = opts.field || null;
    // runes and caltrops on the ground (traps and zones: see placeMark)
    this.marks = [];
    this.petN = 0;
    ensureCombatData(this.game);
    this.fx = new BattleFx(this.view);
  }

  log(t, c) { this.s.log(t, c); }
  // Hooks for what heroes carry (charms and the like): the session answers
  // battleHook(kind, battle, ...) for 'start' (after setup), 'turn' (a unit's
  // turn begins; return true to make it lose the turn), 'hit' (attacker,
  // target, damage dealt), 'hurt' (target, damage, by) and 'end' (outcome);
  // (delve) 'join' (the foes that joined a battle on the dungeon floor).
  hook(kind, ...a) { try { return this.s.battleHook?.(kind, this, ...a); } catch (e) { console.error(e); return null; } }
  emit(type, data) {
    if (type === 'moved' && this.field?.moved) this.field.moved(data);
    this.s.ui?.combatEvent?.(type, data, this);
  }

  // ------------------------------------------------------------ setup
  unit(base) {
    return { sleep: 0, fear: 0, stun: 0, st: {}, cd: {}, uses: {}, reacted: false, charging: null, ...base };
  }

  setup() {
    if (this.field) return this.setupField();
    const lighting = this.s.map?.lighting === 'dark' ? 'dark' : this.s.currentLighting ? this.s.currentLighting() : this.s.map?.lighting === 'night' ? 'night' : 'day';
    this.arena = generateArena(this.style, rng.int(1, 1e9), { lighting });
    // sea monsters that strike at a party on the shore need water to fight from
    const swimmers = this.enemyList.some((g) => byId(this.game.monsters, g.id)?.swim);
    // (the whole north half is open sea running off the edges, shallows at
    // its rim and a strip of beach below, so it reads as a coast, not a pool)
    if (swimmers && !this.arena.tiles.some((t) => terrain(t).water && !terrain(t).deck)) {
      const sea = Math.floor(ARENA_H / 2);
      for (let y = 0; y <= sea; y++) for (let x = 0; x < ARENA_W; x++) this.arena.tiles[y * ARENA_W + x] = y < sea - 1 ? T.ocean : y === sea - 1 ? T.shallows : T.sand;
      this.arena.seaNorth = sea;
    }
    const v = this.view;
    v.setMap(this.arena);
    v.setVisibilityEnabled(false);
    // a slightly lower, more dramatic angle than the map; restored afterwards
    this.prevPitch = v.rig?.pitch;
    if (v.setPitch && this.prevPitch > 60) v.setPitch(60);
    // leave room for the turn-order strip along the top
    v.frameArea(0, 0, ARENA_W, ARENA_H, { left: 8, right: 8, top: 74, bottom: 8 });
    v.rig.dist *= 1.6; // settle in from above
    // party: the first half of the roster in front, the rest a step behind
    const heroes = this.s.party.members.filter((m) => m.status !== 'dead');
    const spots = partySpots(heroes.length);
    for (const [i, m] of heroes.entries()) {
      const [x, y] = this.freeSpot(spots[i], 'party');
      const u = this.unit({ id: 'pu_' + m.id, side: 'party', member: m, name: m.name, x, y, sleep: m.status === 'asleep' ? 2 : 0, face: [0, -1] });
      m.buffs = [];
      u.init = (m.dex || 10) + rng.int(1, 6) + perkCount(m, 'alert') * 4;
      this.units.push(u);
      // (art) heroes stand turned towards the middle and a little towards the camera, so their faces and shields show
      v.addEntity(u.id, charLook(this.game, m), x, y, { ring: 0xffd040, facing: [x < ARENA_W / 2 ? 1 : -1, 0.45] });
    }
    // enemies
    for (const grp of this.enemyList) {
      const def = byId(this.game.monsters, grp.id);
      if (!def) continue;
      for (let k = 0; k < grp.n; k++) if (!this.spawnEnemy(def)) break;
    }
    // tell several foes of one kind apart in the log and the turn strip
    const counts = {};
    for (const e of this.enemies) counts[e.def.id] = (counts[e.def.id] || 0) + 1;
    const seen = {};
    for (const e of this.enemies) if (counts[e.def.id] > 1) e.tag = String.fromCharCode(65 + (seen[e.def.id] = (seen[e.def.id] || 0) + 1) - 1);
    const names = this.enemyList.map((g) => {
      const d = byId(this.game.monsters, g.id);
      return d ? (d.boss ? d.name : g.n > 1 ? `${g.n} ${d.plural || d.name}` : `${/^[aeiou]/i.test(d.name) ? 'an' : 'a'} ${d.name}`) : '';
    }).filter(Boolean);
    this.log(`Battle! You face ${names.join(' and ')}.`, 'bad');
  }

  spawnEnemy(def, near = null) {
    const spot = this.field ? this.fieldSpot(near || this.enemies.find((e) => this.alive(e)), def) : this.enemySpot(def);
    if (!spot) return null;
    const hp = Math.max(1, roll(def.hp || '2d8'));
    const u = this.unit({ id: 'en_' + this.units.length, side: 'enemy', def, name: def.name, x: spot[0], y: spot[1], hp, maxHp: hp, buffs: [], face: [0, 1] });
    u.init = 8 + (def.level || 1) + (def.speed > 1 ? 3 : 0) + (def.init || 0) + rng.int(1, 6);
    if (this.field && near) u.gid = near.gid;
    this.units.push(u);
    this.view.addEntity(u.id, def.look || { kind: 'blob' }, u.x, u.y, { ring: 0xd03030, facing: [0, 1], scale: def.boss ? 1.15 : 1 });
    return u;
  }

  // ------------------------------------------------------------ the field (delve)
  // A battle fought where the company stands: the live map is the field, and
  // the heroes and foes are the figures already standing on it
  setupField() {
    const F = this.field, v = this.view;
    this.arena = F.map;
    for (const hh of F.heroes) {
      const m = hh.m;
      if (m.status === 'dead') continue;
      const u = this.unit({ id: hh.id, side: 'party', member: m, name: m.name, x: hh.x, y: hh.y, sleep: m.status === 'asleep' ? 2 : 0, face: hh.face || [0, -1] });
      m.buffs = [];
      u.init = (m.dex || 10) + rng.int(1, 6) + perkCount(m, 'alert') * 4;
      this.units.push(u);
      if (!v.hasEntity(u.id)) v.addEntity(u.id, charLook(this.game, m), u.x, u.y, { ring: 0xffd040 });
      else v.setRing(u.id, 0xffd040);
    }
    for (const f of F.foes) this.addFoe(f);
    this.retag();
    const counts = {};
    for (const e of this.enemies) counts[e.def.id] = (counts[e.def.id] || 0) + 1;
    this.log(`Battle! You face ${this.facing(Object.entries(counts).map(([id, n]) => ({ id, n })))}.`, 'bad');
  }

  // "3 goblins and a giant spider"
  facing(list) {
    return list.map((g) => {
      const d = byId(this.game.monsters, g.id);
      return d ? (d.boss ? d.name : g.n > 1 ? `${g.n} ${d.plural || d.name}` : `${/^[aeiou]/i.test(d.name) ? 'an' : 'a'} ${d.name}`) : '';
    }).filter(Boolean).join(' and ');
  }

  // a foe already standing on the field (its figure is taken over as it is)
  addFoe(f) {
    const def = f.def;
    const u = this.unit({ id: f.id, side: 'enemy', def, name: def.name, x: f.x, y: f.y, hp: f.hp, maxHp: f.maxHp, buffs: [], face: f.face || [0, 1], gid: f.gid, mem: f.mem });
    u.init = 8 + (def.level || 1) + (def.speed > 1 ? 3 : 0) + (def.init || 0) + rng.int(1, 6);
    this.units.push(u);
    const v = this.view;
    if (!v.hasEntity(u.id)) v.addEntity(u.id, def.look || { kind: 'blob' }, u.x, u.y, { ring: 0xd03030, scale: def.boss ? 1.15 : 1 });
    else v.setRing(u.id, 0xd03030);
    v.setEntityVisible(u.id, true);
    return u;
  }

  // Bands that notice the fight join it: they take their first turn next round
  join(foes, text) {
    const added = foes.filter((f) => !this.units.some((u) => u.id === f.id)).map((f) => this.addFoe(f));
    if (!added.length) return [];
    this.retag();
    if (text) this.log(text, 'bad');
    this.hook('join', added); // (what heroes carry may answer newcomers too)
    for (const u of added) this.fx.number(u.x, u.y, 'Joins the fight!', 'info', '#ff9070');
    this.emit('update');
    return added;
  }

  // tell several foes of one kind apart (letters stay with whoever had them)
  retag() {
    const byDef = {};
    for (const e of this.enemies) (byDef[e.def.id] ||= []).push(e);
    for (const list of Object.values(byDef)) {
      if (list.length < 2) continue;
      const used = new Set(list.map((e) => e.tag).filter(Boolean));
      let c = 0;
      for (const e of list) {
        if (e.tag) continue;
        while (used.has(String.fromCharCode(65 + c))) c++;
        e.tag = String.fromCharCode(65 + c);
        used.add(e.tag);
      }
    }
  }

  // a free square beside `near` for a foe called into the fight
  fieldSpot(near, def) {
    if (!near) return null;
    for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = near.x + dx, y = near.y + dy;
      if (this.walkable(x, y, { def, side: 'enemy' }) && this.lineClear(near, { x, y })) return [x, y];
    }
    return null;
  }

  // a hero steps onto the way out (stairs, a passage) and is gone from the fight
  async escape(u, x, y, exit) {
    u.face = [Math.sign(x - u.x), Math.sign(y - u.y)];
    u.x = x; u.y = y;
    await this.view.moveEntity(u.id, x, y, 0.15);
    u.fled = true;
    u.exit = exit;
    this.log(`${u.name} escapes ${exit.name || 'the battle'}!`, 'warn');
    this.fx.number(x, y, 'Escapes!', 'info');
    this.view.removeEntity(u.id);
    this.emit('update');
    return true;
  }

  // A boss brought low enough enters its second phase: it calls its kin to
  // its side and, if it can, flies into a rage. Happens once per battle.
  async bossPhase(u) {
    const def = u.def;
    u.phased = true;
    this.log(def.phaseText || `${this.The(u)} rallies with a terrible cry!`, 'bad');
    this.fx.callout(u.x, u.y, def.phaseEnrage ? 'Enraged!' : 'Reinforcements!', 0xff5030);
    sfx('encounter');
    this.view.shake?.(0.3, 0.4);
    if (def.phaseEnrage) this.addStatus(u, 'enraged', 99, 2, u);
    for (const a of def.phaseAdds || []) {
      const ad = byId(this.game.monsters, a.id);
      if (!ad) continue;
      const n = rng.int(Math.max(0, a.min ?? 1), Math.max(a.min ?? 1, a.max ?? a.min ?? 1));
      for (let k = 0; k < n; k++) {
        const e = this.spawnEnemy(ad, u);
        if (!e) break;
        e.summoner = u; // they fall with the boss
        const kin = this.enemies.filter((x) => x.def.id === ad.id);
        if (kin.length > 1) for (const [i, x] of kin.entries()) if (!x.tag) x.tag = String.fromCharCode(65 + i);
        this.fx.number(e.x, e.y, 'Joins the fight!', 'info', '#ff9070');
      }
    }
    this.emit('update');
    await this.view.wait(0.4);
  }

  freeSpot([x, y]) {
    for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (this.walkable(nx, ny, null)) return [nx, ny];
    }
    return [x, y];
  }

  enemySpot(def) {
    const back = (def.range || 1) > 1 || this.aiOf(def) === 'caster';
    for (let a = 0; a < 80; a++) {
      // facing the party across the middle, not off at the edges
      const x = a < 50 ? rng.int(2, ARENA_W - 3) : rng.int(1, ARENA_W - 2);
      // close enough that blows are struck within a turn or two: fighters
      // two or three rows from the heroes' front line, archers and casters behind them
      const y = def.swim ? rng.int(0, ARENA_H - 4) : back ? rng.int(1, 2) : rng.pick([2, 3, 3, 4, 4]);
      // (art) at first, no foe straight behind another on the next row: from
      // the camera's angle their bodies, rings and health bars would merge
      if (a < 40 && this.enemies.some((e) => e.x === x && Math.abs(e.y - y) === 1)) continue;
      if (this.walkable(x, y, { def })) return [x, y];
    }
    // nowhere suitable (e.g. landlubbers at sea): any free walkable tile
    for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < ARENA_W; x++) {
      if (this.walkable(x, y, { def }) || (this.walkable(x, y, null) && !def.swim)) return [x, y];
    }
    return null;
  }

  // ------------------------------------------------------------ queries
  // the heroes (allies called into the fight fight on their side, but are no heroes: see pets)
  get partyUnits() { return this.units.filter((u) => u.side === 'party' && u.member); }
  get pets() { return this.units.filter((u) => u.pet); }
  get enemies() { return this.units.filter((u) => u.side === 'enemy'); }
  alive(u) { return !!u && !u.dead && !u.fled; }
  hpOf(u) { return u.member ? u.member.hp : u.hp; }
  maxHpOf(u) { return u.member ? maxHp(this.game, u.member) : u.maxHp; }
  foesOf(u) { return this.units.filter((x) => x.side !== u.side && this.alive(x)); }
  friendsOf(u) { return this.units.filter((x) => x.side === u.side && this.alive(x)); }
  label(u) { return u.tag ? `${u.name} ${u.tag}` : u.name; }
  the(u) { return !u.member && !u.def?.boss ? `the ${this.label(u)}` : this.label(u); }
  The(u) { const t = this.the(u); return t[0].toUpperCase() + t.slice(1); }

  unitAt(x, y) { return this.units.find((u) => this.alive(u) && u.x === x && u.y === y); }

  walkable(x, y, unit) {
    return this.groundOk(x, y, unit) && !this.unitAt(x, y);
  }

  // (delve) a square of the field holding something that is not in the fight
  fieldBlocked(x, y, unit) { return !!this.field?.blocked?.(x, y, unit); }

  // can this unit stand on the terrain here (ignoring who else is there)?
  groundOk(x, y, unit) {
    if (!inBounds(this.arena, x, y)) return false;
    const t = terrain(getTile(this.arena, x, y));
    const def = unit && unit.def;
    if (this.field && this.fieldBlocked(x, y, unit)) return false;
    if (def?.swim) return !!t.water;
    if (!t.walk) return !!(def?.fly && t.water);
    return true;
  }

  // trees, rocks and walls: they block movement and give cover from missiles
  obstacle(x, y) {
    if (!inBounds(this.arena, x, y)) return false;
    const t = terrain(getTile(this.arena, x, y));
    return !!(t.sight || t.wall || (!t.walk && !t.water));
  }

  lineClear(a, b) {
    const pts = bresenham(a.x, a.y, b.x, b.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const t = terrain(getTile(this.arena, pts[i][0], pts[i][1]));
      if (t.sight || t.wall) return false;
    }
    return true;
  }

  // the first thing standing in the way of a missile from a to b, or null
  lineBlocker(a, b) {
    const pts = bresenham(a.x, a.y, b.x, b.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const t = terrain(getTile(this.arena, pts[i][0], pts[i][1]));
      if (t.sight || t.wall) return { x: pts[i][0], y: pts[i][1], t };
    }
    return null;
  }

  dist(a, b) { return cheb(a, b); }
  adjacent(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }

  // is t sheltered from a missile coming from `from` by something beside it?
  inCover(t, from) {
    const dx = Math.sign(from.x - t.x), dy = Math.sign(from.y - t.y);
    if (dx && this.obstacle(t.x + dx, t.y)) return true;
    if (dy && this.obstacle(t.x, t.y + dy)) return true;
    return false;
  }

  // standing on the square at a foe's back
  behind(u, t) {
    const f = t.face || [0, 1];
    return u.x === t.x - f[0] && u.y === t.y - f[1];
  }

  faceTo(u, t) {
    const dx = t.x - u.x, dy = t.y - u.y;
    if (!dx && !dy) return;
    u.face = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    this.view.face(u.id, dx, dy);
  }

  // ------------------------------------------------------------ conditions
  has(u, id) {
    if (LEGACY[id]) return u[LEGACY[id]] > 0;
    if (id === 'poisoned' && u.member?.status === 'poisoned') return true;
    return !!u.st[id];
  }
  power(u, id) { return u.st[id]?.power || 0; }
  helpless(u) { return u.sleep > 0 || u.stun > 0; }
  // foes cannot see or aim at it: hidden in smoke, or in a sanctuary
  unseen(u) { return !!(u.st.hidden || u.st.sanctuary); }

  // Every condition on a unit, for the HUD: [{ id, rounds, power, def }]
  statusList(u) {
    const out = [];
    if (u.stun > 0) out.push({ id: 'stunned', rounds: u.stun });
    if (u.sleep > 0) out.push({ id: 'asleep', rounds: u.sleep });
    if (u.fear > 0) out.push({ id: 'afraid', rounds: u.fear });
    if (u.member?.status === 'poisoned') out.push({ id: 'poisoned', rounds: null });
    // (a rage that lasts the whole battle shows no count)
    for (const [id, s] of Object.entries(u.st)) out.push({ id, rounds: s.rounds >= 99 ? null : s.rounds, power: s.power });
    return out.map((s) => ({ ...s, def: STATUS_EFFECTS[s.id] || { name: s.id, icon: 'star', color: '#fff' } }));
  }

  resists(t, id) {
    if (this.hook('resist', t, id)) return true; // (charms) wards, and charms of resistance
    // (isles) a monster may be proof against some conditions (a statue does not bleed venom or fear)
    if (t.def?.immune?.includes(id)) return true;
    const iron = !!t.member && perkCount(t.member, 'iron_will');
    const stout = !!t.member && hasTrait(this.game, t.member, 'stout');
    if (id === 'stunned') return iron || (t.def?.boss && rng.chance(0.5));
    if (id === 'asleep') return iron || t.def?.sleepImmune || t.def?.undead || (stout && rng.chance(0.5));
    if (id === 'afraid') return iron || t.def?.boss || (stout && rng.chance(0.5));
    // (a hero's mind is the player's: only monsters and called creatures turn on their own)
    if (id === 'charmed') return !!t.member || (t.def?.boss && rng.chance(0.5));
    return false;
  }

  // Put a condition on a unit; returns false if it shrugs it off
  addStatus(t, id, rounds = 1, power = 0, src = null) {
    if (!this.alive(t)) return false;
    const def = STATUS_EFFECTS[id] || { name: id, color: '#fff' };
    if (this.resists(t, id)) { this.fx.number(t.x, t.y, 'Resists', 'info'); return false; }
    if (LEGACY[id]) {
      const k = LEGACY[id];
      t[k] = Math.max(t[k] || 0, rounds);
      if (id === 'asleep' && t.member?.status === 'ok') t.member.status = 'asleep';
    } else if (id === 'poisoned' && t.member) {
      // heroes stay poisoned after the battle until cured
      const m = t.member;
      if (m.status !== 'ok' && m.status !== 'asleep') return false;
      if (hasTrait(this.game, m, 'poisonResist') && rng.chance(0.6)) { this.log(`${t.name} shrugs off the venom.`); return false; }
      m.status = 'poisoned';
      this.log(`${t.name} is poisoned!`, 'bad');
    } else {
      const cur = t.st[id];
      // a condition put on a unit during its own turn should last through its next ones
      t.st[id] = { rounds: Math.max(cur?.rounds || 0, rounds), power: Math.max(cur?.power || 0, power), src: src || cur?.src || null, fresh: this.current === t };
    }
    this.fx.number(t.x, t.y, def.name, 'status', def.color);
    this.emit('update');
    return true;
  }

  removeStatus(u, id) {
    if (LEGACY[id]) u[LEGACY[id]] = 0;
    else delete u.st[id];
    this.emit('update');
  }

  acOf(u) {
    let ac = u.member ? armorClass(this.game, u.member) : (u.def.ac || 10);
    if (!u.member) for (const b of u.buffs || []) if (b.kind === 'shield') ac += b.power;
    return ac + this.power(u, 'shielded');
  }

  movesFor(u) {
    let n = u.member ? combatMoves(this.game, u.member) : (u.def.moves ?? 4);
    if (this.has(u, 'rooted')) return 0;
    n += this.power(u, 'hasted'); // (charms) quick feet
    if (this.has(u, 'slowed')) n = Math.ceil(n / 2);
    return n;
  }

  statMod(u, stat) {
    if (!stat) return 0;
    if (u.member) return Math.max(0, mod(u.member[stat] || 10));
    return Math.floor((u.def.level || 1) / 2);
  }

  updateBar() { this.emit('update'); }

  // ------------------------------------------------------------ main loop
  async run() {
    this.setup();
    this.s.ui.combatStart(this);
    if (!this.field) await this.s.app.fade(false, 250);
    this.emit('start');
    // (delve) foes caught unawares: every hero has a turn before the first round
    if (this.opts.surprise) {
      this.round = 0;
      this.surprise = true;
      const first = this.opts.striker;
      this.emit('surprise');
      const order = this.partyUnits.filter((u) => this.alive(u)).sort((a, b) => (b.member === first) - (a.member === first) || b.init - a.init);
      const res = await this.playRound(order);
      this.surprise = false;
      if (res) return res;
      this.round = 1;
    }
    for (;;) {
      const res = await this.playRound(this.units.filter((u) => this.alive(u)).sort((a, b) => b.init - a.init || (a.side === 'party' ? -1 : 1)));
      if (res) return res;
      this.round++;
    }
  }

  // Everyone in `order` takes a turn; returns the battle's result once it is over
  async playRound(order) {
    this.order = order;
    this.tickMarks();
    this.emit('round', this.round);
    for (this.turnIdx = 0; this.turnIdx < this.order.length; this.turnIdx++) {
      const u = this.order[this.turnIdx];
      if (!this.alive(u)) continue;
      if (u.member?.status === 'dead') { u.dead = true; continue; }
      this.current = u;
      u.reacted = false;
      this.emit('turn', u);
      const skip = await this.startTurn(u);
      if (this.aborted) return { outcome: 'aborted' };
      let end = this.checkEnd();
      if (end) return this.finish(end);
      if (!skip && this.alive(u)) {
        if (u.member) await this.heroTurn(u);
        else await this.monsterTurn(u);
      }
      if (this.aborted) return { outcome: 'aborted' };
      this.endTurn(u);
      this.current = null;
      // (delve) bands that notice the fight now join it next round
      if (this.field?.afterTurn) await this.field.afterTurn(this, u);
      if (this.aborted) return { outcome: 'aborted' };
      end = this.checkEnd();
      if (end) return this.finish(end);
    }
    return null;
  }

  // the player left play mid-fight (quit or load): stop taking turns and take
  // the battle's effects off the shared view, so nothing plays on over the title
  abort() {
    if (this.aborted) return;
    this.aborted = this.over = true;
    this.active = null;
    const p = this.pending;
    this.pending = null;
    p?.();
    this.fx.clear();
    if (this.prevPitch && this.view.setPitch) this.view.setPitch(this.prevPitch);
  }

  async heroTurn(u) {
    this.active = u;
    u.moves = this.movesFor(u);
    u.maxMoves = u.moves;
    this.view.setRing(u.id, 0xffffff);
    this.s.ui.combatTurn(u);
    await new Promise((res) => { this.pending = res; });
    if (this.aborted) return;
    this.view.setRing(u.id, 0xffd040);
    this.active = null;
    this.s.ui.combatTurn(null);
  }

  // Returns true if the unit loses its turn
  async startTurn(u) {
    if (await this.hook('turn', u)) return true;
    if (!this.alive(u)) return true;
    // legacy buffs from older saves
    const buffs = u.member ? u.member.buffs : u.buffs;
    if (buffs) {
      for (const b of buffs) b.rounds--;
      const keep = buffs.filter((b) => b.rounds > 0);
      buffs.length = 0;
      buffs.push(...keep);
    }
    if (u.side === 'enemy' && u.def.regen && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + u.def.regen);
      this.fx.number(u.x, u.y, '+' + u.def.regen, 'heal');
      this.emit('update');
    }
    // burning and poison bite at the start of the turn
    if (u.st.burning) {
      this.fx.particles(this.fx.pos(u.x, u.y, 0.4), { count: 8, color: 0xff8030, size: 0.25, speed: 0.4, up: 1.6, gravity: 1, life: 0.6, grow: 1 });
      await this.damage(u, roll('1d4'), { dot: 'burning', quiet: true });
      if (!this.alive(u)) return true;
    }
    if (u.st.poisoned) {
      await this.damage(u, u.st.poisoned.power || 2, { dot: 'poisoned', quiet: true });
      if (!this.alive(u)) return true;
    }
    if (u.member?.status === 'poisoned') {
      await this.damage(u, rng.int(1, 2), { dot: 'poisoned', quiet: true });
      if (!this.alive(u)) return true;
    }
    // hallowed ground, caltrops: what the ground underfoot does
    await this.zoneTouch(u);
    if (!this.alive(u)) return true;
    if (u.charging && (u.stun > 0 || u.sleep > 0)) {
      this.log(`${this.The(u)} is interrupted — ${u.member ? 'the' : 'its'} ${u.charging.ab.name} comes to nothing!`, u.member ? 'bad' : 'good');
      this.fx.number(u.x, u.y, 'Interrupted!', 'info', '#9fe09f');
      this.cancelWindup(u);
    }
    if (u.stun > 0) {
      u.stun--;
      this.fx.number(u.x, u.y, 'Stunned', 'status', STATUS_EFFECTS.stunned.color);
      await this.view.wait(0.25);
      return true;
    }
    if (u.sleep > 0) {
      u.sleep--;
      this.fx.number(u.x, u.y, 'Zzz', 'status', STATUS_EFFECTS.asleep.color);
      if (u.sleep === 0) {
        this.log(`${this.The(u)} wakes up.`);
        if (u.member?.status === 'asleep') u.member.status = 'ok';
      }
      await this.view.wait(0.2);
      return true;
    }
    // a telegraphed blow lands; a monster spends its turn on it, a hero's
    // falling star lands at the start of the turn and the hero still acts
    if (u.charging) {
      await this.releaseWindup(u);
      if (!u.member || !this.alive(u)) return true;
    }
    return false;
  }

  // Conditions and cooldowns run down at the end of each of the unit's own turns
  endTurn(u) {
    for (const [id, s] of Object.entries(u.st)) {
      if (s.fresh) { s.fresh = false; continue; }
      if (--s.rounds <= 0) delete u.st[id];
    }
    for (const k of Object.keys(u.cd)) if (u.cd[k] > 0) u.cd[k]--;
    // a called creature stays for so many of its own turns
    if (u.pet && this.alive(u) && --u.ttl <= 0) this.dismiss(u);
    this.emit('update');
  }

  checkEnd() {
    if (this.over) return null;
    if (!this.enemies.length) return 'fled'; // nothing could be placed: no fight happened
    const foes = this.enemies.some((e) => this.alive(e));
    const friends = this.partyUnits.some((u) => this.alive(u));
    if (!foes) return 'victory';
    if (!friends) return this.partyUnits.some((u) => u.fled) ? 'fled' : 'defeat';
    return null;
  }

  async finish(outcome) {
    this.over = true;
    this.hook('end', outcome);
    // (on the live map the fallen are carried off with the company)
    if (this.field) for (const u of this.partyUnits) if (u.dead) this.view.removeEntity(u.id);
    for (const u of this.units) if (u.charging) this.cancelWindup(u);
    // called creatures go back where they came from; runes and caltrops fade
    for (const u of this.pets) this.view.removeEntity(u.id);
    for (const mk of this.marks) mk.decal?.remove();
    this.marks = [];
    const members = this.s.party.members;
    for (const m of members) {
      m.buffs = [];
      if (m.status === 'asleep') m.status = 'ok';
    }
    const summary = { outcome, rounds: this.round, gold: 0, xp: 0, loot: [], heroes: [], slain: this.killedIds.length };
    if (outcome === 'victory') {
      sfx('victory');
      const alive = members.filter((m) => m.status !== 'dead');
      // a big company shares the glory, but not so thinly that it stops being fun
      const share = alive.length ? Math.ceil(this.xp / Math.sqrt(alive.length)) : 0;
      this.s.party.gold += this.gold;
      // (gold filched from purses during the fight is already in the pack)
      summary.gold = this.gold + (this.filched || 0);
      summary.xp = share;
      // the fallen learn from the fight too (half), so a hero raised later is
      // not left ever further behind; they level up with their next gain
      const fallen = members.filter((m) => m.status === 'dead');
      const half = Math.ceil(share / 2);
      this.log(`Victory! Each survivor gains ${share} experience${alive.some((m) => hasTrait(this.game, m, 'versatile')) ? ' (Humans, quick to learn, a tenth more)' : ''}${fallen.length && half ? `, the fallen ${half}` : ''}${this.gold ? `, and you find ${this.gold} gold` : ''}.`, 'good');
      for (const m of alive) {
        const before = { level: m.level, xp: m.xp };
        const lv = gainXp(this.game, m, share);
        summary.heroes.push({ member: m, from: before, gained: m.xp - before.xp, levels: lv });
        if (lv.length) {
          this.log(levelUpNote(m, this.game), 'level');
          sfx('level');
          const u = this.partyUnits.find((pu) => pu.member === m);
          if (u) { this.view.sparkle(u.x, u.y, 0xffe060, 24); this.fx.callout(u.x, u.y, 'LEVEL UP!', 0xffe060); }
        }
      }
      for (const m of fallen) {
        if (!half) break;
        const before = { level: m.level, xp: m.xp };
        m.xp += half;
        summary.heroes.push({ member: m, from: before, gained: half, levels: [], fallen: true });
      }
      this.dropLoot();
      this.dropCarried();
      summary.loot = [...this.loot];
      await this.view.wait(1.2);
    } else if (outcome === 'fled') {
      this.log('You escape the battle.', 'warn');
      await this.view.wait(0.5);
    } else {
      sfx('defeat');
      this.log('Your party has fallen...', 'bad');
      await this.view.wait(1.5);
    }
    this.fx.clear();
    if (this.prevPitch && this.view.setPitch) this.view.setPitch(this.prevPitch);
    this.summary = summary;
    this.s.ui.combatEnd(summary);
    return { outcome, killedIds: this.killedIds, summary };
  }

  // ------------------------------------------------------------ player actions
  async perform(fn, expect) {
    if (!this.active || this.acting || this.over) return false;
    if (expect && expect !== this.active) return false;
    this.acting = true;
    this.emit('busy', true);
    let used = false;
    try { used = await fn(this.active); } finally { this.acting = false; this.emit('busy', false); }
    if (used && this.pending) {
      const p = this.pending;
      this.pending = null;
      p();
    } else if (!used && this.active && !this.over) this.s.ui.combatTurn(this.active);
    return used;
  }

  actMove(dx, dy) {
    return this.perform(async (u) => {
      const nx = u.x + dx, ny = u.y + dy;
      if (!inBounds(this.arena, nx, ny)) {
        if (this.field) { sfx('bump'); return false; }
        if (!(await this.provoke(u, nx, ny))) return true;
        u.fled = true;
        this.log(`${u.name} flees the battle!`, 'warn');
        await this.view.moveEntity(u.id, nx, ny, 0.2);
        this.view.removeEntity(u.id);
        this.emit('update');
        return true;
      }
      const other = this.unitAt(nx, ny);
      if (other && other.side === 'enemy') return this.attack(u, other);
      if (this.has(u, 'rooted')) { this.log(`${u.name} is pinned and cannot move — attack, use a skill, or end the turn.`, 'warn'); sfx('bump'); return false; }
      if (!(u.moves > 0)) { this.log(`${u.name} has no moves left — attack, cast, or press Space to end the turn.`, 'warn'); sfx('bump'); return false; }
      if (other && other.side === 'party') {
        // swap places with an ally
        [other.x, other.y, u.x, u.y] = [u.x, u.y, nx, ny];
        u.moves--;
        u.face = [dx, dy];
        this.view.moveEntity(other.id, other.x, other.y, 0.15);
        await this.view.moveEntity(u.id, u.x, u.y, 0.15);
        return this.turnDone(u);
      }
      if (!this.walkable(nx, ny, u)) { sfx('bump'); return false; }
      if (!(await this.provoke(u, nx, ny))) return true;
      const exit = this.field?.exitAt?.(nx, ny);
      if (exit) return this.escape(u, nx, ny, exit);
      u.x = nx; u.y = ny;
      u.face = [dx, dy];
      u.moves--;
      sfx('step');
      await this.view.moveEntity(u.id, nx, ny, 0.13);
      this.emit('moved', u);
      await this.stepOn(u);
      if (!this.alive(u)) return true;
      return this.turnDone(u);
    });
  }

  // Walk to a square within this turn's moves, along the shortest path
  actMoveTo(x, y, expect) {
    return this.perform(async (u) => {
      const path = this.pathTo(u, x, y);
      if (!path || path.length - 1 > (u.moves || 0)) { sfx('bump'); return false; }
      for (const [px, py] of path.slice(1)) {
        if (!(await this.provoke(u, px, py))) return true;
        const exit = this.field?.exitAt?.(px, py);
        if (exit) return this.escape(u, px, py, exit);
        u.face = [px - u.x, py - u.y];
        u.x = px; u.y = py;
        u.moves--;
        sfx('step');
        await this.view.moveEntity(u.id, px, py, 0.12);
        await this.stepOn(u);
        if (!this.alive(u)) return true;
      }
      this.emit('moved', u);
      return this.turnDone(u);
    }, expect);
  }

  // Squares the unit can reach: Map "x,y" -> { x, y, d, from, ally }
  reachable(u, budget = u.moves || 0) {
    const out = new Map([[`${u.x},${u.y}`, { x: u.x, y: u.y, d: 0, from: null }]]);
    const queue = [out.get(`${u.x},${u.y}`)];
    while (queue.length) {
      const c = queue.shift();
      if (c.d >= budget) continue;
      for (const [dx, dy] of DIR4) {
        const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
        if (out.has(k) || !this.groundOk(nx, ny, u)) continue;
        // friends can be passed through but not stood on; foes block
        const occ = this.unitAt(nx, ny);
        if (occ && occ.side !== u.side) continue;
        const n = { x: nx, y: ny, d: c.d + 1, from: c, ally: !!occ };
        out.set(k, n);
        // (delve) the way out ends a walk: a hero who reaches it escapes
        if (this.field && u.member && this.field.exitAt?.(nx, ny)) { n.exit = true; continue; }
        queue.push(n);
      }
    }
    return out;
  }

  pathTo(u, x, y) {
    let c = this.reachable(u).get(`${x},${y}`);
    if (!c || c.ally || c.d === 0) return null;
    const path = [];
    for (; c; c = c.from) path.unshift([c.x, c.y]);
    return path;
  }

  // Foes that would get a free strike if u stepped from where it stands to (x,y)
  provokers(u, x, y, from = u) {
    if (this.has(u, 'hidden') || this.has(u, 'nimble') || this.has(u, 'sanctuary')) return [];
    return this.foesOf(u).filter((f) => !f.reacted && !this.helpless(f) && !(f.fear > 0) && !f.charging
      && cheb(f, from) <= 1 && cheb(f, { x, y }) > 1);
  }

  // Free strikes at a unit breaking away; false if it does not survive them
  async provoke(u, x, y) {
    for (const f of this.provokers(u, x, y)) {
      if (!this.alive(u)) return false;
      f.reacted = true;
      this.log(`${this.The(f)} strikes at ${this.the(u)} as ${u.member ? 'they break' : 'it breaks'} away!`, u.side === 'party' ? 'bad' : 'good');
      this.fx.number(f.x, f.y, 'Free strike!', 'info', '#ffd070');
      await this.strike(f, u, { ab: FREE_STRIKE });
    }
    return this.alive(u);
  }

  // A move ends the turn only when nothing else is left to do: no moves,
  // no foe in reach, no spell to cast and no skill ready
  turnDone(u) {
    if (u.moves > 0) return false;
    if (this.attackTargets(u).length) return false;
    if (this.abilitiesOf(u).some((ab) => this.canUseAbility(u, ab).ok)) return false;
    const inv = this.s.party.inventory;
    if (this.combatSpells(u).some((sp) => canCast(this.game, u.member, sp, inv).ok)) return false;
    return true;
  }

  actAttack(target, expect) {
    return this.perform(async (u) => this.attack(u, target), expect);
  }

  actPass() {
    return this.perform(async (u) => { this.log(`${u.name} waits.`); return true; });
  }

  // Brace: +3 armour until this hero's next turn is over
  actGuard(expect) {
    return this.perform(async (u) => {
      this.addStatus(u, 'shielded', 1, 3, u);
      sfx('door');
      this.fx.ring(u.x, u.y, 0x90b8ff, 0.2, 0.7, 0.4);
      this.log(`${u.name} stands guard (+3 armour).`);
      return true;
    }, expect);
  }

  actCast(spell, target, expect) {
    return this.perform(async (u) => this.castSpell(u, spell, target), expect);
  }

  actUse(item, target, expect) {
    return this.perform(async (u) => this.useItem(u, item, target), expect);
  }

  actAbility(ab, target, expect) {
    return this.perform(async (u) => this.useAbility(u, ab, target), expect);
  }

  // can u strike t with its weapon right now? Next to a foe the hand weapon is
  // used, further away the bow, crossbow or sling.
  canAttack(u, t) {
    if (!t || t.side === u.side || !this.alive(t)) return false;
    if (u.side === 'enemy' && this.unseen(t)) return false;
    if (this.adjacent(u, t)) return true;
    const range = this.weaponRange(u);
    return range > 1 && this.dist(u, t) <= range && this.lineClear(u, t);
  }

  weaponRange(u) {
    if (u.member) {
      const r = rangedOf(this.game, u.member);
      return r ? (r.range || 1) + perkCount(u.member, 'marksman') : 1;
    }
    return u.def.range || 1;
  }

  weaponFor(u, t) {
    return this.adjacent(u, t) ? weaponOf(this.game, u.member) : rangedOf(this.game, u.member) || weaponOf(this.game, u.member);
  }

  attackTargets(u) { return this.foesOf(u).filter((e) => this.canAttack(u, e)); }

  async attack(u, t) {
    if (!this.canAttack(u, t)) {
      if (u.member) {
        this.log(rangedOf(this.game, u.member) ? 'Out of range or no clear shot.' : 'Too far away — move adjacent to strike, or carry a bow.', 'warn');
        sfx('error');
      }
      return false;
    }
    await this.strike(u, t);
    return true;
  }

  // ------------------------------------------------------------ the anatomy of a blow
  // What u strikes t with, and how it rolls
  strikeKit(u, t, ab) {
    const adj = this.adjacent(u, t);
    if (u.member) {
      const m = u.member;
      const w = ab?.thrown ? this.thrownWeapon(ab) : ab?.attack === 'ranged' ? rangedOf(this.game, m) : ab?.attack === 'melee' ? weaponOf(this.game, m) : this.weaponFor(u, t);
      if (!w) return null;
      const ranged = (w.range || 1) > 1;
      const d = parseDice(w.dmg || '1d2'), b = damageBonus(this.game, m, w);
      return {
        w, ranged, hit: attackBonus(this.game, m, w), critMin: critRange(this.game, m), name: w.name,
        min: Math.max(1, d.n + d.b + b), max: Math.max(1, d.n * d.d + d.b + b), roll: () => damageRoll(this.game, m, w),
      };
    }
    const def = u.def;
    const ranged = !!ab?.thrown || ((def.range || 1) > 1 && !adj && ab?.attack !== 'melee');
    const dmg = ab?.thrown || def.dmg || '1d4';
    const d = parseDice(dmg);
    return {
      w: ab?.thrown ? this.thrownWeapon(ab) : null, ranged, hit: def.hit || 0, critMin: 20, name: ab?.thrown ? ab.name : ranged ? 'missile' : 'blow',
      min: Math.max(1, d.n + d.b), max: Math.max(1, d.n * d.d + d.b), roll: () => Math.max(1, roll(dmg)),
    };
  }

  // a knife or a bottle thrown by hand: a missile of the skill's own dice,
  // aimed with Dexterity like any shot, needing no bow
  thrownWeapon(ab) { return { id: null, name: ab.name, dmg: ab.thrown, hit: 0, range: Math.max(2, ab.range || ab.radius || 4), wkind: 'thrown', thrown: true }; }

  // Situational modifiers, with a note for each so the player can see why
  strikeMods(u, t, kit, ab) {
    const notes = [];
    let hit = 0, mult = 1, auto = false;
    const bl = this.power(u, 'blessed');
    if (bl) { hit += bl; notes.push(`Blessed +${bl}`); }
    if (this.has(u, 'weakened')) { hit -= 2; notes.push('Weakened −2'); }
    if (this.has(u, 'enraged')) { hit += 2; mult *= 1.25; notes.push('Enraged +2, ×1.25 dmg'); }
    if (ab?.hit) { hit += ab.hit; notes.push(`${ab.name} +${ab.hit}`); }
    const steady = this.power(u, 'focused');
    if (steady) { hit += steady; notes.push(`Steady +${steady}`); }
    const mark = this.has(t, 'marked') ? this.power(t, 'marked') || 2 : 0;
    if (mark) { hit += mark; notes.push(`Marked +${mark}, +${mark} dmg`); }
    if (t.member && hasTrait(this.game, t.member, 'lucky')) { hit -= 2; notes.push('Lucky −2'); }
    if (!kit.ranged) {
      if (this.friendsOf(u).some((f) => f !== u && this.adjacent(f, t) && !this.helpless(f))) { hit += 2; notes.push('Flanking +2'); }
      const hidden = this.has(u, 'hidden');
      if (hidden || this.behind(u, t)) {
        const stab = !!u.member && hasAbility(this.game, u.member, 'backstab');
        hit += hidden ? 4 : 2;
        mult *= stab ? 2 : 1.5;
        notes.push(hidden ? 'Unseen +4' : 'From behind +2', stab ? 'Backstab ×2 dmg' : 'Rear ×1.5 dmg');
      }
    } else {
      if (!ab?.ignoreCover && !steady && this.inCover(t, u)) { hit -= 3; notes.push('Cover −3'); }
      if (this.foesOf(u).some((f) => this.adjacent(f, u) && !this.helpless(f))) { hit -= 4; notes.push('Engaged −4'); }
    }
    if (this.helpless(t)) { auto = true; notes.push('Helpless: sure hit'); }
    // a finishing blow on a badly wounded foe
    if (ab?.execute && this.hpOf(t) <= this.maxHpOf(t) * ab.execute) { auto = true; mult *= 2; notes.push('Wounded: sure hit, ×2 dmg'); }
    return { hit, mult, auto, crit: !!ab?.autoCrit, notes, mark };
  }

  hitChance(bonus, ac, critMin, auto) {
    if (auto) return 1;
    let n = 0;
    for (let d = 2; d <= 20; d++) if (d >= critMin || d + bonus >= ac) n++;
    return n / 20;
  }

  // What would happen if u used ab (or its plain attack) on t: odds, damage, notes
  preview(u, t, ab = null) {
    if (!t) return null;
    if (ab?.revive) return { heal: true, lo: Math.ceil(this.maxHpOf(t) * (ab.healPct || 0.33)), hi: Math.ceil(this.maxHpOf(t) * (ab.healPct || 0.33)), notes: ['Rises again'] };
    if (ab?.steal) { const d = parseDice(t.def?.gold || '0'); return { effect: true, notes: [t.robbed ? 'Purse already taken' : `Purse: ${d.n + d.b}–${d.n * d.d + d.b} gold`] }; }
    if (ab && !ab.attack && !ab.thrown) {
      const sm = this.statMod(u, ab.stat);
      if (ab.damage && t.side !== u.side) {
        const d = parseDice(ab.damage);
        let lo = Math.max(1, d.n + d.b + sm), hi = Math.max(1, d.n * d.d + d.b + sm);
        if (ab.undeadBonus && t.def?.undead) { lo *= ab.undeadBonus; hi *= ab.undeadBonus; }
        return { chance: 1, lo, hi, notes: ['Never misses'], sure: true };
      }
      if (ab.heal) { const d = parseDice(ab.heal); return { heal: true, lo: d.n + d.b + sm, hi: d.n * d.d + d.b + sm, notes: [] }; }
      if (ab.healPct) { const v = Math.ceil(this.maxHpOf(t) * ab.healPct); return { heal: true, lo: v, hi: v, notes: [] }; }
      return { effect: true, notes: [] };
    }
    const kit = this.strikeKit(u, t, ab);
    if (!kit) return null;
    const md = this.strikeMods(u, t, kit, ab);
    const chance = md.crit ? 1 : this.hitChance(kit.hit + md.hit, this.acOf(t), kit.critMin, md.auto);
    const weak = this.has(u, 'weakened') ? 2 : 0;
    const k = md.mult * (ab?.mult ?? 1);
    let lo = Math.max(1, Math.round((kit.min - weak) * k)), hi = Math.max(1, Math.round((kit.max - weak) * k));
    if (ab?.bonus) { const d = parseDice(ab.bonus); lo += d.n + d.b; hi += d.n * d.d + d.b; }
    if (ab?.undeadBonus && t.def?.undead) { lo *= ab.undeadBonus; hi *= ab.undeadBonus; }
    lo += md.mark; hi += md.mark;
    if (md.crit) { lo *= 2; hi *= 2; md.notes.push('Certain critical'); }
    return { chance, lo, hi, crit: md.crit ? 1 : Math.max(0, (21 - kit.critMin) / 20), notes: md.notes, ranged: kit.ranged, weapon: kit.name };
  }

  async shoot(from, to, kit, ab) {
    const w = kit.w;
    const kind = w?.wkind === 'sling' ? 'stone' : w?.wkind === 'crossbow' || w?.thrown ? 'bolt' : 'arrow';
    sfx('shoot');
    const glow = w?.glow ?? (ab?.vfx === 'arrow' && ab?.fx != null && ab.id !== '_free' ? ab.fx : undefined);
    // (a thrown knife: a short dark grip and a bright blade, no feathers)
    const opts = w?.thrown ? { kind, shaft: 0x4a3020, head: 0xeef2f8, fletch: 0x6a4a30, speed: 13 } : from.side === 'enemy' ? { fletch: 0x2a2a2a, shaft: 0x4a3a2a } : { kind, glow };
    await this.fx.shot(from, to, opts);
  }

  // One blow or shot from u at t, with all the trimmings. Used by plain
  // attacks, weapon skills, monsters and free strikes alike.
  async strike(u, t, opts = {}) {
    const ab = opts.ab;
    t = await this.guardFor(u, t);
    const kit = this.strikeKit(u, t, ab);
    if (!kit || !this.alive(t)) return { hit: false };
    this.faceTo(u, t);
    if (kit.ranged) await this.shoot(u, t, kit, ab);
    else {
      await this.view.attackAnim(u.id, t.x, t.y);
      this.fx.slash(u, t, ab?.fx && ab.id !== '_free' ? ab.fx : 0xffffff);
    }
    const md = this.strikeMods(u, t, kit, ab);
    const d20 = rng.int(1, 20);
    const crit = md.crit || d20 >= kit.critMin;
    const hit = md.auto || crit || (d20 !== 1 && d20 + kit.hit + md.hit >= this.acOf(t));
    if (this.has(u, 'hidden')) this.removeStatus(u, 'hidden');
    if (this.has(u, 'sanctuary')) this.removeStatus(u, 'sanctuary');
    if (this.has(u, 'focused')) this.removeStatus(u, 'focused');
    if (!hit) {
      this.fx.miss(t);
      sfx('miss');
      this.log(`${this.The(u)} misses ${this.the(t)}.`);
      await this.riposte(u, t, kit);
      return { hit: false };
    }
    let dmg = kit.roll() - (this.has(u, 'weakened') ? 2 : 0);
    dmg = Math.max(1, Math.round(dmg * md.mult * (ab?.mult ?? 1))) + md.mark;
    if (ab?.bonus) dmg += roll(ab.bonus);
    if (ab?.undeadBonus && t.def?.undead) dmg *= ab.undeadBonus;
    if (u.member) {
      if (hasAbility(this.game, u.member, 'cleave') && this.hpOf(t) < this.maxHpOf(t) / 2) dmg += 2;
      if (kit.w?.id === 'runeblade' && (t.def?.undead || t.def?.boss)) dmg += 4;
    }
    if (crit) dmg *= 2;
    sfx(crit ? 'crit' : u.side === 'party' ? 'hit' : 'hurt');
    const how = crit ? (u.side === 'party' ? 'critically hits' : 'lands a terrible blow on') : 'hits';
    this.log(`${this.The(u)} ${how} ${this.the(t)} for ${dmg}${md.mult > 1 ? ' (from behind)' : ''}.`, u.side === 'party' ? (crit ? 'good' : '') : 'bad');
    await this.damage(t, dmg, { crit, by: u, from: u });
    if (this.alive(t) && u.side === 'enemy' && t.side === 'party' && u.def.poison && rng.chance(u.def.poison)) this.addStatus(t, 'poisoned', 3, 2, u);
    if (ab?.lifesteal && this.alive(u)) this.heal(u, Math.max(1, Math.round(dmg * ab.lifesteal)));
    await this.riposte(u, t, kit);
    return { hit: true, dmg, crit };
  }

  // Shield Wall: a guardian standing beside the one struck at takes the blow
  async guardFor(u, t) {
    const g = t?.st?.guarded?.src;
    if (!g || g === t || g === u || !this.alive(g) || !this.alive(t) || g.side !== t.side || u.side === t.side || cheb(g, t) > 1) return t;
    this.log(`${this.label(g)} steps in front of ${this.the(t)} and takes the blow!`, t.side === 'party' ? 'good' : 'bad');
    this.fx.number(g.x, g.y, 'Guards!', 'info', '#a8c8ff');
    this.fx.ring(g.x, g.y, 0xa8c8ff, 0.2, 0.8, 0.35);
    return g;
  }

  // Riposte: a fighter in the stance strikes back at whoever swung at it
  // in melee, hit or miss (once a round, like a free strike)
  async riposte(u, t, kit) {
    if (kit.ranged || !this.has(t, 'riposte') || t.reacted || !this.alive(t) || !this.alive(u) || this.helpless(t) || !this.adjacent(u, t) || u.side === t.side) return;
    t.reacted = true;
    this.log(`${this.label(t)} answers with a riposte!`, t.side === 'party' ? 'good' : 'bad');
    this.fx.number(t.x, t.y, 'Riposte!', 'info', '#ffd0a0');
    await this.strike(t, u, { ab: RIPOSTE });
  }

  async damage(t, dmg, opts = {}) {
    if (!this.alive(t)) return;
    // (isles) hard hides and stone shrug off part of every blow
    if (t.def?.hardened && dmg > 1 && !opts.dot) dmg = Math.max(1, dmg - t.def.hardened);
    if (t.sleep > 0 && dmg > 0) t.sleep = 0;
    // whoever harms a foe leaves the sanctuary's light
    const by = opts.by || (opts.from?.side ? opts.from : null);
    if (by && by !== t && by.side !== t.side && by.st?.sanctuary) this.removeStatus(by, 'sanctuary');
    // Shield of Dawn: a blow that would fell it leaves it standing, once
    if (t.st.deathward && dmg >= this.hpOf(t) && this.hpOf(t) > 0) {
      dmg = this.hpOf(t) - 1;
      this.removeStatus(t, 'deathward');
      this.log(`The light of dawn holds ${this.the(t)} up — still standing!`, t.side === 'party' ? 'good' : 'bad');
      this.fx.callout(t.x, t.y, 'Saved!', 0xffd870);
    }
    if (t.member) {
      t.member.hp -= dmg;
      if (t.member.status === 'asleep') t.member.status = 'ok';
    } else t.hp -= dmg;
    if (dmg > 0) {
      if (opts.by && opts.by !== t && !opts.dot) this.hook('hit', opts.by, t, dmg);
      this.hook('hurt', t, dmg, opts.by || null);
    }
    const kind = opts.crit ? 'crit' : t.side === 'party' ? 'hurt' : 'dmg';
    this.fx.number(t.x, t.y, String(dmg), kind, opts.color || (opts.dot === 'poisoned' ? '#9be070' : opts.dot === 'burning' ? '#ffa040' : null));
    if (!opts.dot) {
      const undead = t.def?.undead;
      await this.fx.impact(t, opts.from, { crit: opts.crit, color: opts.burst ?? 0xfff0c0, blood: undead ? 0xe0e0d0 : t.side === 'party' ? 0xd03028 : 0xb02018 });
    } else {
      try { this.view.hurtAnim(t.id); } catch { /* gone */ }
    }
    this.emit('update');
    if (this.hpOf(t) <= 0) await this.kill(t, opts.by);
    else if (t.side === 'enemy' && t.def.phaseAt > 0 && !t.phased && t.hp <= t.maxHp * t.def.phaseAt) await this.bossPhase(t);
    this.s.ui.refresh();
  }

  async kill(t) {
    t.dead = true;
    if (t.charging) this.cancelWindup(t);
    if (t.member) {
      t.member.hp = 0;
      t.member.status = 'dead';
      this.log(`${t.name} has fallen!`, 'bad');
      this.s.tip?.('death', 'The fallen stay down after the battle until they are raised: a healer in any town can RAISE them for gold, or use a Phoenix Feather, or a Raise Dead prayer or Rune of Life once your casters are strong enough.');
      sfx('die');
    } else if (t.pet) {
      // (a called creature is no foe slain: no experience, no spoils)
      this.log(`${this.The(t)} is struck down and fades away!`, t.side === 'party' ? 'bad' : 'good');
      sfx('die');
    } else {
      this.xp += t.def.xp || 0;
      if (!t.robbed) this.gold += Math.max(0, roll(t.def.gold || '0'));
      this.killedIds.push(t.def.id);
      this.log(`${this.The(t)} is slain!`, 'good');
      sfx('die');
    }
    this.emit('death', t);
    this.fx.death(t.x, t.y, t.def?.undead ? 0xd8d8c8 : 0xb8a890);
    // (a hero's body stays where they fell, to be raised there)
    if (t.member) await this.view.fallAnim(t.id);
    else await this.view.dieAnim(t.id);
    if (t.pet) this.view.removeEntity(t.id);
    // a boss's summoned kin do not fight on without it (no dull mop-up rounds)
    const adds = t.side === 'enemy' ? this.enemies.filter((e) => e.summoner === t && this.alive(e)) : [];
    if (adds.length) {
      this.log(`With ${this.the(t)} gone, the ${adds.length === 1 ? 'one it called falls' : 'ones it called fall'} with it!`, 'good');
      await Promise.all(adds.map((e) => this.kill(e)));
    }
  }

  // Heals u by up to amt (plus the healer's Healing Hands); shows and returns
  // what was actually restored, so a full-health hero shows "Full", not "+23"
  heal(u, amt, by = null) {
    if (!this.alive(u)) return 0;
    if (by?.member) amt += perkCount(by.member, 'mender') * 3;
    const before = this.hpOf(u);
    if (!u.member) u.hp = Math.min(u.maxHp, u.hp + amt);
    else u.member.hp = Math.min(maxHp(this.game, u.member), u.member.hp + amt);
    const got = Math.max(0, this.hpOf(u) - before);
    this.fx.number(u.x, u.y, got > 0 ? '+' + got : 'Full', got > 0 ? 'heal' : 'info');
    this.fx.healFx(u.x, u.y);
    this.emit('update');
    return got;
  }

  // Whom a healing ability or spell could actually help
  wounded(units, cure = false) {
    return units.filter((p) => this.alive(p) && (this.hpOf(p) < this.maxHpOf(p) || (cure && this.has(p, 'poisoned'))));
  }

  async knockback(u, t, n) {
    let dx = Math.sign(t.x - u.x), dy = Math.sign(t.y - u.y);
    if (dx && dy) { if (Math.abs(t.x - u.x) >= Math.abs(t.y - u.y)) dy = 0; else dx = 0; }
    if (!dx && !dy) return;
    for (let i = 0; i < n && this.alive(t); i++) {
      const nx = t.x + dx, ny = t.y + dy;
      if (!inBounds(this.arena, nx, ny)) break;
      const occ = this.unitAt(nx, ny);
      if (occ || !this.groundOk(nx, ny, t)) {
        this.log(`${this.The(t)} slams into ${occ ? this.the(occ) : 'an obstacle'}!`, t.side === 'party' ? 'bad' : 'good');
        sfx('hit');
        await this.damage(t, roll('1d4'), { from: u });
        break;
      }
      t.x = nx; t.y = ny;
      await this.view.moveEntity(t.id, nx, ny, 0.11, 0.12);
      await this.stepOn(t);
    }
    if (!this.alive(t)) return;
    t.face = [-dx, -dy];
    this.view.face(t.id, -dx, -dy);
    this.emit('moved', t);
  }

  // Drag t up to n squares towards u, a square at a time, until it stands
  // beside u or something is in the way. Returns the squares it moved.
  async pull(u, t, n) {
    let moved = 0;
    for (let i = 0; i < n && this.alive(t) && !this.adjacent(u, t); i++) {
      let best = null, bd = Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
      for (const [dx, dy] of DIR4) {
        const x = t.x + dx, y = t.y + dy;
        if (!this.walkable(x, y, t)) continue;
        const d = Math.abs(x - u.x) + Math.abs(y - u.y);
        if (d < bd) { bd = d; best = { x, y }; }
      }
      if (!best) break;
      t.x = best.x; t.y = best.y;
      moved++;
      await this.view.moveEntity(t.id, t.x, t.y, 0.1, 0.06);
      await this.stepOn(t);
    }
    if (moved && this.alive(t)) { this.faceTo(t, u); this.emit('moved', t); }
    return moved;
  }

  async teleport(u, x, y) {
    this.fx.blink(u.x, u.y);
    this.view.sparkle(u.x, u.y, 0xc0a0ff, 12);
    u.x = x; u.y = y;
    await this.view.moveEntity(u.id, x, y, 0.08, 0.3);
    this.fx.blink(x, y);
    this.emit('moved', u);
    await this.stepOn(u);
  }

  // ------------------------------------------------------------ the ground: traps and zones
  // A rune trap waits on its square for the first foe to step there; a zone
  // (hallowed ground, caltrops) works on whoever starts a turn in it or walks
  // in, once a round each: it mends friends of its maker and harms foes.
  placeMark(u, ab, target) {
    const c = ab.target === 'tile' && target ? { x: target.x, y: target.y } : { x: u.x, y: u.y };
    const trap = ab.place === 'trap';
    const r = ab.radius ?? (trap ? 0 : 1);
    const tiles = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (inBounds(this.arena, x, y) && this.groundOk(x, y, null)) tiles.push({ x, y });
    }
    if (!tiles.length) return null;
    const mk = { kind: trap ? 'trap' : 'zone', ab, owner: u, side: u.side, center: c, tiles, until: this.round + Math.max(1, ab.lasts || 3), hit: new Map() };
    mk.decal = this.fx.ground?.(tiles, ab.fx ?? 0xffe080, mk.kind) || null;
    this.marks.push(mk);
    const n = Math.max(1, ab.lasts || 3);
    this.log(trap ? `${u.name} carves ${ab.name} into the ground — it waits ${n} rounds for a foe to step there.` : `${ab.name} covers the ground for ${n} round${n > 1 ? 's' : ''}.`, 'magic');
    this.emit('update');
    return mk;
  }

  removeMark(mk) {
    mk.decal?.remove();
    this.marks = this.marks.filter((x) => x !== mk);
    this.emit('update');
  }

  // marks run out at the start of a round
  tickMarks() {
    for (const mk of [...this.marks]) if (this.round >= mk.until) this.removeMark(mk);
  }

  // the marks on a square: [{ kind, ab, owner, side, ... }]
  marksAt(x, y) { return this.marks.filter((mk) => mk.tiles.some((c) => c.x === x && c.y === y)); }

  // t has just come to stand on its square: a foe's trap springs, a zone works
  async stepOn(t) {
    if (!this.marks.length || !this.alive(t)) return;
    const trap = this.marks.find((mk) => mk.kind === 'trap' && mk.side !== t.side && mk.tiles.some((c) => c.x === t.x && c.y === t.y));
    if (trap) {
      this.removeMark(trap);
      const ab = trap.ab, col = ab.fx ?? 0xffe080;
      this.log(`${this.The(t)} steps on ${trap.owner.member ? `${trap.owner.name}'s ` : 'a '}${ab.name}!`, t.side === 'party' ? 'bad' : 'good');
      this.fx.callout(t.x, t.y, ab.name, col);
      sfx('crit');
      this.view.shake?.(0.12, 0.25);
      this.fx.nova(t.x, t.y, 1, col, ab.vfx === 'fire' || ab.vfx === 'earth' ? ab.vfx : 'frost');
      if (ab.vfx === 'shock') this.fx.shock(t.x, t.y, col);
      await this.view.wait(0.15);
      const hit = this.foesOf(trap.owner).filter((f) => trap.tiles.some((c) => cheb(c, f) <= 0) || f === t);
      for (const f of hit) await this.touch(trap.owner, ab, f, { sure: true });
    }
    await this.zoneTouch(t);
  }

  async zoneTouch(t) {
    for (const mk of [...this.marks]) {
      if (mk.kind !== 'zone' || !this.alive(t) || mk.hit.get(t.id) === this.round || !mk.tiles.some((c) => c.x === t.x && c.y === t.y)) continue;
      const ab = mk.ab, friend = t.side === mk.side;
      if (friend ? !(ab.heal || ab.healPct) || this.hpOf(t) >= this.maxHpOf(t) : !(ab.damage || ab.statuses?.length) || (ab.undeadOnly && !t.def?.undead)) continue;
      mk.hit.set(t.id, this.round);
      this.fx.splash(t.x, t.y, ab.fx ?? 0xffffff, friend ? 'holy' : 'arcane');
      await this.touch(mk.owner, ab, t, { sure: true, zone: true });
    }
  }

  // ------------------------------------------------------------ called creatures
  // A summoned creature fights on its caller's side for a few of its own
  // turns: a monster of the realm (ab.summon), named and tinted as the skill
  // says, a little stronger for a stronger caller. The battle's AI moves it.
  summonBase(ab) { return ab?.summon ? byId(this.game.monsters, ab.summon) || null : null; }

  async summon(u, ab, at) {
    const base = this.summonBase(ab);
    if (!base || !at || !this.walkable(at.x, at.y, { def: base, side: u.side })) return null;
    const lv = u.member?.level || u.def?.level || 1;
    const look = deepClone(base.look || { kind: 'blob' });
    if (ab.summonTint != null) { look.color = ab.summonTint; if (look.kind === 'humanoid') look.body = ab.summonTint; look.eyes = look.eyes ?? 0xb8f4ff; }
    const def = {
      ...deepClone(base), name: ab.summonName || base.name, plural: ab.summonName || base.plural, look, level: Math.max(base.level || 1, lv),
      hit: (base.hit || 0) + Math.floor(lv / 3), dmg: plusDice(base.dmg, Math.floor(lv / 3)), xp: 0, gold: '0', fleeAt: 0, boss: false, phaseAt: 0, ai: base.ai === 'coward' ? 'brute' : base.ai,
    };
    const hp = Math.max(1, roll(base.hp || '2d8') + lv * 2);
    const pet = this.unit({ id: `pet_${++this.petN}_${u.id}`, side: u.side, pet: true, owner: u, def, name: def.name, x: at.x, y: at.y, hp, maxHp: hp, buffs: [], face: u.face || [0, -1], ttl: Math.max(1, ab.lasts || 3) });
    pet.init = (u.init || 10) - 0.5;
    this.units.push(pet);
    // it acts straight after its caller, and from then on in turn
    const i = this.order.indexOf(u);
    if (i >= 0) this.order.splice(i + 1, 0, pet);
    this.view.addEntity(pet.id, look, at.x, at.y, { ring: 0x7fd8ff, facing: pet.face, scale: look.scale || 1 });
    this.fx.blink(at.x, at.y, ab.fx ?? 0x9fd8ff);
    this.view.sparkle(at.x, at.y, ab.fx ?? 0x9fd8ff, 22);
    this.fx.ring(at.x, at.y, ab.fx ?? 0x9fd8ff, 0.2, 1.2, 0.5);
    this.log(`${this.label(u)} calls ${/^[aeiou]/i.test(def.name) ? 'an' : 'a'} ${def.name} into the fight (for ${pet.ttl} turns)!`, u.side === 'party' ? 'good' : 'bad');
    this.emit('update');
    await this.view.wait(0.2);
    return pet;
  }

  // a called creature's time is up
  dismiss(u) {
    u.fled = true;
    u.gone = true;
    this.log(`${this.The(u)} fades away.`);
    this.fx.blink(u.x, u.y, 0x9fd8ff);
    this.view.sparkle(u.x, u.y, 0x9fd8ff, 14);
    this.view.removeEntity(u.id);
    this.emit('update');
  }

  // Encore: t takes a turn straight after the one acting now
  grantTurn(t) {
    if (!this.alive(t) || t === this.current) return false;
    this.order.splice(this.turnIdx + 1, 0, t);
    this.log(`${this.label(t)} gets an extra turn!`, t.side === 'party' ? 'good' : 'bad');
    this.fx.callout(t.x, t.y, 'Extra turn!', 0xffd870);
    this.emit('update');
    return true;
  }

  // a foe's purse: does it carry one, and is it still there?
  hasPurse(t) { const d = parseDice(t.def?.gold || '0'); return !t.robbed && !t.member && d.n * d.d + d.b > 0; }

  filch(u, t) {
    if (!this.hasPurse(t)) { this.log(`${this.The(t)} has nothing worth taking.`, 'warn'); return 0; }
    t.robbed = true;
    const n = Math.max(0, roll(t.def.gold));
    if (!n) { this.log(`${u.name} lifts ${this.the(t)}'s purse — it is empty!`); this.fx.number(t.x, t.y, 'Empty purse', 'info'); return 0; }
    if (u.member) { this.s.party.gold += n; this.filched = (this.filched || 0) + n; }
    this.log(`${this.label(u)} lifts ${n} gold from ${this.the(t)}'s purse!`, 'loot');
    this.fx.number(t.x, t.y, `+${n} gold`, 'info', '#ffd060');
    sfx('gold');
    this.s.ui.refresh?.();
    return n;
  }

  // ------------------------------------------------------------ abilities
  abilitiesOf(u) {
    if (u.member) return heroAbilities(this.game, u.member);
    return (u.def.abilities || []).map((id) => abilityOf(this.game, id)).filter(Boolean);
  }

  isSpecial(u, ab) { return !!u.member && classOf(this.game, u.member).special === ab.id; }

  abilityRange(u, ab) {
    if (ab.attack === 'ranged') return Math.min(ab.range || 99, this.weaponRange(u));
    return ab.range ?? 1;
  }

  landingBeside(u, e) {
    let best = null, bd = Infinity;
    for (const [dx, dy] of DIR4) {
      const x = e.x + dx, y = e.y + dy;
      if (!(x === u.x && y === u.y) && !this.walkable(x, y, u)) continue;
      // rather the foe's back, then the nearest side
      const d = Math.abs(x - u.x) + Math.abs(y - u.y) - (x === e.x - (e.face?.[0] || 0) && y === e.y - (e.face?.[1] || 0) ? 3 : 0);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  // the path a charging unit runs to end beside t (null if it cannot)
  chargePath(u, t, range) {
    if (this.adjacent(u, t)) return [];
    const reach = this.reachable(u, range);
    let best = null;
    for (const c of reach.values()) {
      if (c.ally || c.d === 0 || Math.abs(c.x - t.x) + Math.abs(c.y - t.y) !== 1) continue;
      if (!best || c.d < best.d) best = c;
    }
    if (!best) return null;
    const path = [];
    for (let c = best; c && c.d > 0; c = c.from) path.unshift([c.x, c.y]);
    return path;
  }

  // Who or where an ability can be aimed: { kind: enemy|ally|tile|none, units, tiles }
  abilityTargets(u, ab) {
    const foes = this.foesOf(u).filter((f) => u.side === 'party' || !this.unseen(f));
    const friends = this.friendsOf(u);
    switch (ab.target) {
      case 'enemy': {
        let units;
        if (ab.move === 'beside') units = foes.filter((e) => this.dist(u, e) <= (ab.range || 4) && this.landingBeside(u, e));
        else if (ab.move === 'charge') units = foes.filter((e) => this.chargePath(u, e, ab.range || 5));
        else if (ab.attack === 'melee' || (ab.range ?? 1) <= 1) units = foes.filter((e) => this.adjacent(u, e));
        else {
          const r = this.abilityRange(u, ab);
          units = foes.filter((e) => this.dist(u, e) <= r && this.lineClear(u, e));
        }
        if (ab.steal) units = units.filter((e) => this.hasPurse(e));
        return { kind: 'enemy', units };
      }
      case 'ally': {
        const r = ab.range ?? 1;
        const near = (p) => (r <= 1 ? this.adjacent(u, p) : this.dist(u, p) <= r);
        // (raising the fallen: a companion's body within reach)
        if (ab.revive) return { kind: 'ally', units: this.partyUnits.filter((p) => p.dead && !p.fled && p.member.status === 'dead' && p !== u && cheb(u, p) <= Math.max(1, r)) };
        let units = friends.filter((p) => (p === u ? !ab.others : near(p)));
        // a pure heal is no use on someone at full health
        if ((ab.heal || ab.healPct) && !ab.statuses?.length) units = this.wounded(units, ab.cure);
        return { kind: 'ally', units };
      }
      case 'tile': {
        const tiles = [];
        const r = ab.attack === 'ranged' ? this.abilityRange(u, ab) : ab.range ?? 1;
        const base = this.summonBase(ab);
        for (let y = Math.max(0, u.y - r); y <= Math.min(this.arena.h - 1, u.y + r); y++) for (let x = Math.max(0, u.x - r); x <= Math.min(this.arena.w - 1, u.x + r); x++) {
          if (cheb(u, { x, y }) > r) continue;
          const self = x === u.x && y === u.y;
          let ok = true;
          if (ab.move === 'teleport') ok = !self && this.walkable(x, y, u);
          else if (ab.summon) ok = !!base && !self && this.walkable(x, y, { def: base, side: u.side });
          else if (ab.place === 'trap') ok = !self && this.walkable(x, y, null);
          if (ok) tiles.push({ x, y });
        }
        return { kind: 'tile', tiles };
      }
      default:
        return { kind: 'none', units: this.affected(u, ab, null) };
    }
  }

  // Everyone an ability will touch
  affected(u, ab, target) {
    const foes = this.foesOf(u).filter((f) => u.side === 'party' || !this.unseen(f));
    const friends = this.friendsOf(u);
    const r = ab.radius ?? 1;
    switch (ab.target) {
      case 'enemy': case 'ally': {
        if (!target) return [];
        if (!ab.chain || target.side === u.side) return [target];
        // a chain leaps on from the last one struck to the nearest foe not yet struck
        const out = [target];
        for (let i = 0; i < ab.chain; i++) {
          const last = out[out.length - 1];
          const next = foes.filter((f) => !out.includes(f) && cheb(f, last) <= (ab.chainRange || 2) && this.lineClear(last, f)).sort((a, b) => cheb(a, last) - cheb(b, last))[0];
          if (!next) break;
          out.push(next);
        }
        return out;
      }
      case 'self': return ab.place ? [] : [u];
      case 'adjacentFoes': return foes.filter((f) => this.adjacent(u, f));
      case 'nearbyFoes': return foes.filter((f) => cheb(u, f) <= r);
      case 'nearbyAllies': return friends.filter((f) => cheb(u, f) <= r);
      case 'allAllies': return friends;
      case 'allEnemies': return foes;
      case 'multi': {
        const range = this.abilityRange(u, ab);
        return foes.filter((e) => cheb(u, e) <= range && this.lineClear(u, e)).sort((a, b) => this.hpOf(a) - this.hpOf(b)).slice(0, ab.count || 3);
      }
      case 'tile': return target && ab.move !== 'teleport' && !ab.place && !ab.summon ? foes.filter((f) => cheb(f, target) <= (ab.radius ?? 0)) : [];
      default: return [];
    }
  }

  // Can u use ab now? { ok, why, short } — short is the few words for a button
  canUseAbility(u, ab) {
    if (!ab) return { ok: false, why: 'No such ability.', short: '—' };
    const used = u.uses[ab.id] || 0;
    if (ab.perBattle && used >= ab.perBattle) return { ok: false, why: `${ab.name} has already been used this battle.`, short: 'Used' };
    const cd = u.cd[ab.id] || 0;
    if (cd > 0) return { ok: false, why: `${ab.name} is recovering: ready in ${cd} turn${cd > 1 ? 's' : ''}.`, short: `Ready in ${cd}`, cd };
    if (ab.needs === 'ranged' && u.member && !rangedOf(this.game, u.member)) return { ok: false, why: `${ab.name} needs a bow, crossbow or sling.`, short: 'Needs a bow' };
    if ((ab.move === 'charge' || ab.addMoves) && this.has(u, 'rooted')) return { ok: false, why: 'Pinned in place.', short: 'Pinned' };
    if (ab.summon) {
      if (!this.summonBase(ab)) return { ok: false, why: `Nothing answers the call: there is no “${ab.summon}” in this realm.`, short: 'Nothing answers' };
      if (this.pets.some((p) => p.owner === u && this.alive(p) && p.def.id === ab.summon)) return { ok: false, why: `${u.name}'s ${this.summonBase(ab).name} is still in the fight.`, short: 'Still here' };
    }
    if (ab.target === 'self' && (ab.heal || ab.healPct) && !ab.statuses?.length && !ab.place && !this.wounded([u], ab.cure).length) {
      return { ok: false, why: `${u.name} is unhurt — save it for when it counts.`, short: 'Unhurt' };
    }
    const tg = this.abilityTargets(u, ab);
    const melee = ab.attack === 'melee' && !ab.move;
    if (tg.kind === 'enemy' && !tg.units.length) {
      if (ab.steal && this.foesOf(u).some((e) => this.adjacent(u, e))) return { ok: false, why: 'No foe beside you has a purse left to lift.', short: 'No purse' };
      return melee || (ab.range ?? 1) <= 1
        ? { ok: false, why: 'No foe stands beside you.', short: 'No foe adjacent' }
        : { ok: false, why: `No foe in range (${ab.move ? ab.range : this.abilityRange(u, ab)} squares, with a clear line).`, short: 'Out of range' };
    }
    if (tg.kind === 'ally' && !tg.units.length) {
      if (ab.revive) return { ok: false, why: `No one has fallen within ${Math.max(1, ab.range ?? 1)} squares.`, short: 'No one fallen' };
      return ab.heal || ab.healPct ? { ok: false, why: 'No one in reach needs healing.', short: 'All healthy' } : { ok: false, why: ab.others ? 'No companion in reach.' : 'No one in reach.', short: 'No one in reach' };
    }
    if (ab.healPct && (ab.target === 'allAllies' || ab.target === 'nearbyAllies') && !this.wounded(this.affected(u, ab, null), ab.cure).length) {
      return { ok: false, why: 'Everyone is at full health — save it for when it counts.', short: 'All healthy' };
    }
    if (tg.kind === 'tile' && !tg.tiles.length) return { ok: false, why: ab.summon ? 'No open square to call it to.' : 'Nowhere to go.', short: 'Blocked' };
    // a blow aimed at the ground needs a foe it could catch
    if (tg.kind === 'tile' && (ab.attack || ab.damage) && !ab.place && ab.move !== 'teleport') {
      const foes = this.foesOf(u).filter((f) => u.side === 'party' || !this.unseen(f));
      if (!tg.tiles.some((c) => foes.some((f) => cheb(f, c) <= (ab.radius ?? 0)))) return { ok: false, why: 'No foe in reach.', short: 'Out of range' };
    }
    if (tg.kind === 'none' && ['adjacentFoes', 'nearbyFoes', 'multi', 'allEnemies'].includes(ab.target) && !tg.units.length) {
      const why = ab.target === 'adjacentFoes' ? 'No foe stands beside you.' : ab.target === 'nearbyFoes' ? `No foe within ${ab.radius ?? 1} square${(ab.radius ?? 1) > 1 ? 's' : ''}.` : 'No foe in range.';
      return { ok: false, why, short: ab.target === 'adjacentFoes' ? 'No foe adjacent' : 'No foe near' };
    }
    return { ok: true, why: '', short: ab.perBattle ? 'Once per battle' : 'Ready' };
  }

  async useAbility(u, ab, target) {
    const can = this.canUseAbility(u, ab);
    if (!can.ok) { if (u.member) { this.log(can.why, 'warn'); sfx('error'); } return false; }
    const tg = this.abilityTargets(u, ab);
    if ((tg.kind === 'enemy' || tg.kind === 'ally') && (!target || !tg.units.includes(target))) {
      if (u.member) { this.log(tg.kind === 'enemy' ? 'Choose a foe in reach.' : 'Choose a companion in reach.', 'warn'); sfx('error'); }
      return false;
    }
    if (tg.kind === 'tile' && (!target || !tg.tiles.some((c) => c.x === target.x && c.y === target.y))) {
      if (u.member) { this.log(`Choose a square within ${ab.range}.`, 'warn'); sfx('error'); }
      return false;
    }
    // pay for it
    if (ab.cooldown) u.cd[ab.id] = Math.max(1, ab.cooldown - (u.member && perkCount(u.member, 'quick') ? 1 : 0)) + 1;
    u.uses[ab.id] = (u.uses[ab.id] || 0) + 1;
    if (this.isSpecial(u, ab)) u.specialUsed = true;
    this.log(`${u.side === 'party' ? u.name : this.The(u)}: ${ab.name}!`, u.side === 'party' ? 'magic' : 'bad');
    this.fx.callout(u.x, u.y, ab.name, ab.fx ?? 0xffe080);
    this.emit('ability', { u, ab });
    if (ab.windup) return this.beginWindup(u, ab, target);
    // movement first
    if (ab.move === 'teleport') { sfx('spell'); await this.teleport(u, target.x, target.y); }
    else if (ab.move === 'beside') {
      const spot = this.landingBeside(u, target);
      if (spot && (spot.x !== u.x || spot.y !== u.y)) { sfx('spell'); await this.teleport(u, spot.x, spot.y); }
    } else if (ab.move === 'charge') {
      const path = this.chargePath(u, target, ab.range || 5) || [];
      for (const [x, y] of path) {
        u.face = [x - u.x, y - u.y];
        u.x = x; u.y = y;
        await this.view.moveEntity(u.id, x, y, 0.07, 0.22);
        await this.stepOn(u);
        if (!this.alive(u)) return true;
      }
      if (path.length) this.emit('moved', u);
    }
    await this.abilityLeadIn(u, ab, target);
    const targets = this.affected(u, ab, target);
    // (dragging several: the nearest first, so the far ones are not blocked by them)
    if (ab.pull) targets.sort((a, b) => cheb(a, u) - cheb(b, u));
    for (const t of targets) await this.touch(u, ab, t);
    if (ab.summon) await this.summon(u, ab, target);
    if (ab.place) { this.placeMark(u, ab, target); sfx(ab.vfx === 'holy' ? 'heal' : 'spell'); }
    if (ab.addMoves && u === this.active && this.alive(u)) {
      u.moves = (u.moves || 0) + ab.addMoves;
      u.maxMoves = (u.maxMoves || 0) + ab.addMoves;
      this.fx.number(u.x, u.y, `+${ab.addMoves} moves`, 'info', '#d8f0c0');
    }
    if (this.alive(u)) for (const s of ab.statuses || []) if (s.self) this.addStatus(u, s.id, s.rounds || 1, s.power || 0, u);
    this.s.ui.refresh();
    this.emit('update');
    return !ab.free;
  }

  // What an ability does to one it reaches — also what a sprung trap does to
  // the foe, and the ground of a zone (opts.sure: no roll to hit; opts.zone:
  // conditions only on foes). Returns whether it landed.
  async touch(u, ab, t, opts = {}) {
    if (ab.revive) {
      if (t.member && t.dead && !t.fled) { sfx('heal'); await this.revive(t, ab.healPct); }
      return true;
    }
    if (!this.alive(t)) return false;
    const friend = t.side === u.side;
    let landed = true;
    if ((ab.attack || ab.thrown) && !opts.sure) {
      landed = (await this.strike(u, t, { ab })).hit;
    } else if (ab.damage && !friend && (!ab.undeadOnly || t.def?.undead)) {
      let dmg = roll(ab.damage) + this.statMod(u, ab.stat) - (this.has(u, 'weakened') ? 2 : 0) + (u.member ? perkCount(u.member, 'spellfire') * 2 : 0);
      if (ab.undeadBonus && t.def?.undead) dmg *= ab.undeadBonus;
      dmg = Math.max(1, dmg);
      sfx(ab.vfx === 'fire' ? 'fire' : 'spell');
      this.log(`${ab.name} hits ${this.the(t)} for ${dmg}.`, t.side === 'party' ? 'bad' : '');
      await this.damage(t, dmg, { by: u, from: u, color: fxHex(ab.fx), burst: ab.fx });
    }
    if (!landed || !this.alive(t)) return landed;
    if ((ab.heal || ab.healPct) && friend) {
      const amt = ab.healPct ? Math.max(2, Math.ceil(this.maxHpOf(t) * ab.healPct)) : Math.max(1, roll(ab.heal) + this.statMod(u, ab.stat));
      sfx('heal');
      this.heal(t, amt, u);
    }
    if (ab.cure && friend) {
      if (t.member?.status === 'poisoned') { t.member.status = 'ok'; this.fx.number(t.x, t.y, 'Cured', 'status', '#9fe09f'); }
      this.removeStatus(t, 'poisoned');
    }
    if (!opts.zone || !friend) for (const s of ab.statuses || []) if (!s.self && (s.chance == null || rng.chance(s.chance))) this.addStatus(t, s.id, s.rounds || 1, s.power || 0, u);
    if (ab.steal && !friend) this.filch(u, t);
    if (ab.extraTurn && friend && t !== u) this.grantTurn(t);
    if (friend && t !== u && (ab.statuses || []).some((s) => s.id === 'guarded')) this.fx.ring(t.x, t.y, ab.fx ?? 0xa8c8ff, 0.2, 0.8, 0.4);
    if (ab.pull && !friend && this.alive(t)) await this.pull(u, t, ab.pull);
    if (ab.knockback && t !== u && this.alive(t)) await this.knockback(u, t, ab.knockback);
    return true;
  }

  // The visual flourish before an ability's effect lands
  async abilityLeadIn(u, ab, target) {
    const col = ab.fx ?? 0xffffff;
    const kind = ab.vfx || 'arcane';
    const single = target && target.side && target !== u && !ab.attack && !ab.thrown;
    if (single && ['fire', 'frost', 'arcane', 'shadow', 'song', 'poison', 'holy'].includes(kind) && !ab.revive) {
      sfx(kind === 'fire' ? 'fire' : 'spell');
      await this.view.attackAnim(u.id, target.x, target.y);
      if (kind === 'holy') await this.fx.beam(target.x, target.y, col);
      else await this.fx.bolt(u, target, col, kind);
      return;
    }
    // a marking arrow, a shove, a lifted purse: the hand goes out to the target
    if (single && target.side !== u.side && (kind === 'arrow' || kind === 'impact' || ab.steal)) {
      this.faceTo(u, target);
      if (kind === 'arrow') { sfx('shoot'); await this.fx.shot(u, target, { kind: 'arrow', glow: col }); this.fx.splash(target.x, target.y, col, 'arcane'); return; }
      await this.view.attackAnim(u.id, target.x, target.y);
      if (ab.steal) { this.fx.smoke(target.x, target.y); return; }
      return;
    }
    switch (kind) {
      case 'frost': case 'earth': case 'shout':
        sfx(kind === 'earth' ? 'crit' : kind === 'shout' ? 'encounter' : 'spell');
        await this.view.attackAnim(u.id, u.x, u.y + (u.side === 'party' ? -1 : 1));
        await this.fx.nova(u.x, u.y, ab.radius ?? 1, col, kind);
        break;
      case 'smoke': sfx('miss'); this.fx.smoke(u.x, u.y); await this.view.wait(0.2); break;
      case 'heal': case 'holy':
        if (!ab.attack) {
          sfx('heal');
          for (const t of ab.place ? [u] : this.affected(u, ab, target)) kind === 'holy' ? this.fx.beam(t.x, t.y, col) : this.fx.healFx(t.x, t.y, col);
          await this.view.wait(0.25);
        }
        break;
      case 'song':
        if (!ab.attack) {
          sfx('spell');
          this.fx.nova(u.x, u.y, ab.radius ?? 1, col, 'shout');
          for (const t of this.affected(u, ab, target)) this.fx.splash(t.x, t.y, col, 'song');
          await this.view.wait(0.3);
        }
        break;
      case 'shock': {
        // several foes: the lightning leaps from one to the next
        const chain = this.affected(u, ab, target).filter((t) => t !== u && t.side && t.side !== u.side);
        if (chain.length > 1) {
          sfx('spell');
          await this.view.attackAnim(u.id, chain[0].x, chain[0].y);
          await this.fx.chain(u, chain, col);
        } else if (target?.side) this.fx.shock(target.x, target.y, col);
        else if (chain.length) await this.fx.arc(u, chain[0], col);
        else if (ab.place && target) { sfx('spell'); await this.view.attackAnim(u.id, target.x, target.y); this.fx.shock(target.x, target.y, col); }
        break;
      }
      case 'arcane':
        if (!ab.attack && !ab.move) { sfx('spell'); for (const t of this.affected(u, ab, target)) this.fx.splash(t.x, t.y, col, 'arcane'); }
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------ telegraphed blows
  windupTiles(u, ab, target) {
    const c = (ab.range ?? 1) === 0 || !target ? { x: u.x, y: u.y } : target;
    const r = ab.radius ?? 0;
    const tiles = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (inBounds(this.arena, x, y) && !(x === u.x && y === u.y && (ab.range ?? 1) === 0)) tiles.push({ x, y });
    }
    return { c, tiles };
  }

  beginWindup(u, ab, target) {
    const { c, tiles } = this.windupTiles(u, ab, target);
    // (a hero's own blow is marked in its colour, not the red of danger)
    u.charging = { ab, tiles, center: c, decal: this.fx.danger(tiles, u.side === 'party' ? (ab.fx ?? 0xffb030) : 0xff3018) };
    this.faceTo(u, c);
    sfx('encounter');
    if (u.member) {
      this.log(`${u.name} calls down ${ab.name}… it lands on the marked squares when ${u.name} next acts.`, 'magic');
      this.fx.ring(c.x, c.y, ab.fx ?? 0xffb030, 0.3, (ab.radius ?? 0) + 0.9, 0.5);
    } else {
      const verb = ab.vfx === 'fire' ? 'draws a deep, smouldering breath' : ab.vfx === 'shadow' ? 'gathers darkness about itself' : 'raises its weapon high';
      this.log(u.side === 'party' ? `${this.The(u)} ${verb}!` : `${this.The(u)} ${verb}… get clear of the marked squares!`, u.side === 'party' ? 'good' : 'bad');
    }
    this.emit('update');
    return true;
  }

  // is the square under a telegraphed blow from the other side of `side`?
  inDanger(x, y, side) { return this.units.some((o) => o.side !== side && o.charging && this.alive(o) && o.charging.tiles.some((c) => c.x === x && c.y === y)); }

  cancelWindup(u) {
    if (!u.charging) return;
    u.charging.decal?.remove();
    u.charging = null;
    this.emit('update');
  }

  async releaseWindup(u) {
    const { ab, tiles, center } = u.charging;
    this.cancelWindup(u);
    this.log(`${this.The(u)} unleashes ${ab.name}!`, 'bad');
    this.fx.callout(u.x, u.y, ab.name, ab.fx ?? 0xff5020);
    if (center.x !== u.x || center.y !== u.y) await this.view.attackAnim(u.id, center.x, center.y);
    const col = ab.fx ?? 0xff5020;
    sfx(ab.vfx === 'fire' ? 'fire' : 'crit');
    this.view.shake(0.25, 0.35);
    for (const t of tiles) this.fx.splash(t.x, t.y, col, ab.vfx === 'fire' ? 'fire' : ab.vfx === 'shadow' ? 'shadow' : 'arcane');
    if (ab.vfx === 'earth') this.fx.nova(center.x, center.y, Math.max(1, ab.radius ?? 0), col, 'earth');
    await this.view.wait(0.2);
    const hit = this.foesOf(u).filter((f) => tiles.some((t) => t.x === f.x && t.y === f.y));
    if (!hit.length) {
      this.fx.number(center.x, center.y, 'Dodged!', 'info', '#9fe09f');
      this.log('…but it strikes only empty ground.', 'good');
    }
    for (const t of hit) {
      const dmg = Math.max(1, roll(ab.damage || '2d6') + this.statMod(u, ab.stat));
      this.log(`${ab.name} hits ${this.the(t)} for ${dmg}!`, 'bad');
      await this.damage(t, dmg, { by: u, from: center.x === t.x && center.y === t.y ? u : center, crit: dmg >= 12, color: fxHex(col) });
      if (!this.alive(t)) continue;
      for (const s of ab.statuses || []) if (!s.self && (s.chance == null || rng.chance(s.chance))) this.addStatus(t, s.id, s.rounds || 1, s.power || 0, u);
      if (ab.knockback) await this.knockback(center.x === t.x && center.y === t.y ? u : center, t, ab.knockback);
    }
  }

  // ------------------------------------------------------------ class specials (once per battle; the old API)
  specialFor(u) { return u?.member ? specialOf(this.game, u.member) : null; }
  specialAbility(u) { return u?.member ? abilityOf(this.game, classOf(this.game, u.member).special) : null; }

  specialTargets(u) {
    const ab = this.specialAbility(u);
    if (!ab) return null;
    const tg = this.abilityTargets(u, ab);
    return tg.kind === 'none' ? { kind: 'none' } : tg;
  }

  canSpecial(u) {
    const ab = this.specialAbility(u);
    if (!ab) return { ok: false, why: 'No special ability.' };
    const can = this.canUseAbility(u, ab);
    return can.ok ? { ok: true, special: this.specialFor(u) } : can;
  }

  actSpecial(target, expect) {
    return this.perform(async (u) => this.special(u, target), expect);
  }

  special(u, target) { return this.useAbility(u, this.specialAbility(u), target); }

  // Spoils: the occasional potion, and now and then a weapon or armour worth
  // the foes that carried it
  dropLoot() {
    const inv = this.s.party.inventory;
    const power = this.killedIds.reduce((t, id) => t + (byId(this.game.monsters, id)?.level || 1), 0);
    if (!power) return;
    const give = (it, how) => {
      inv[it.id] = (inv[it.id] || 0) + 1;
      this.loot.push(it.name);
      this.log(`${how} ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}!${lootTag(this.game, this.s.party.members, it)}`, 'loot');
      sfx('gold');
    };
    this.hook('loot', power, give); // (charms) now and then a charm
    if (rng.chance(Math.min(0.6, 0.22 + power * 0.04))) {
      const drops = this.game.items.filter((it) => it.type === 'consumable' && it.combat && (it.price || 0) <= 40 + power * 6);
      if (drops.length) give(rng.pick(drops), 'Among the fallen you find');
    }
    // now and then a spell scroll, for a wizard's book
    if (rng.chance(Math.min(0.2, 0.04 + power * 0.012))) {
      const scrolls = this.game.items.filter((it) => it.type === 'scroll' && !it.unique && (it.price || 0) <= 60 + power * 25);
      if (scrolls.length) give(rng.pick(scrolls), 'Tucked in a satchel you find');
    }
    if (this.game.settings.loot === false) return;
    const boss = this.killedIds.some((id) => byId(this.game.monsters, id)?.boss);
    if (!boss && !rng.chance(Math.min(0.5, 0.08 + power * 0.03))) return;
    const bossLevel = Math.max(0, ...this.killedIds.map((id) => byId(this.game.monsters, id)).filter((d) => d?.boss).map((d) => d.level || 1));
    const budget = 30 + power * 20 + bossLevel * 30;
    const gear = this.game.items.filter((it) => ['weapon', 'armor', 'shield'].includes(it.type) && !it.noLoot && !it.unique && (it.price || 0) <= budget && (it.price || 0) >= budget * 0.12);
    // (enchanted pieces turn up half as often as plain ones)
    if (gear.length) give(rng.weighted(gear, (it) => (1 + (it.price || 0) / 50) * (magicalOf(it) || hasMagic(it) ? 0.5 : 1)), boss ? 'The great foe leaves behind' : 'You claim');
  }

  // What a placed band was carrying (its map entity's loot: a treasure map,
  // a stolen key), found on the fallen
  dropCarried() {
    const inv = this.s.party.inventory;
    const srcs = this.field ? this.field.carried?.(this) || [] : [this.opts.source];
    for (const it of srcs.flatMap((src) => src?.loot || [])) {
      const def = byId(this.game.items, it.id);
      if (!def) continue;
      inv[def.id] = (inv[def.id] || 0) + (it.n || 1);
      this.loot.push(def.name);
      this.log(`On the fallen you find ${/^[aeiou]/i.test(def.name) ? 'an' : 'a'} ${def.name}!`, 'loot');
      sfx('gold');
    }
  }

  // ------------------------------------------------------------ spells
  spellTargets(u, spell) {
    const range = spell.range || 7;
    if (spell.target === 'enemy') return this.enemies.filter((e) => this.alive(e) && this.dist(u, e) <= range && this.lineClear(u, e));
    if (spell.target === 'ally') return this.partyUnits.filter((p) => (spell.effect === 'revive' ? p.dead && !p.fled : this.alive(p)));
    return [];
  }

  async castSpell(u, spell, target) {
    const m = u.member;
    const inv = this.s.party.inventory;
    if (!knownSpells(this.game, m).includes(spell)) { this.log(`${u.name} does not know ${spell.name}.`, 'warn'); return false; }
    const can = canCast(this.game, m, spell, inv);
    if (!can.ok) { this.log(can.why, 'warn'); sfx('error'); return false; }
    if (!spell.combat) { this.log('That spell is of no use in battle.', 'warn'); return false; }
    // validate target
    if (spell.target === 'enemy' && (!target || !this.spellTargets(u, spell).includes(target))) { this.log('Choose a visible foe in range.', 'warn'); return false; }
    if (spell.target === 'area') {
      if (!target || this.dist(u, target) > (spell.range || 7)) { this.log('Out of range.', 'warn'); return false; }
    }
    if (spell.target === 'ally' && !target) return false;
    if (spell.effect === 'heal') {
      const who = spell.target === 'ally' ? [target] : spell.target === 'self' ? [u] : this.partyUnits;
      if (!this.wounded(who).length) { this.log(spell.target === 'ally' ? `${target.name} is already at full health.` : 'No one needs healing.', 'warn'); sfx('error'); return false; }
    }
    if (payForSpell(m, spell, inv)) this.log(`${m.name}'s thrifty hands spare the reagents.`);
    this.log(`${u.name} casts ${spell.name}!`, 'magic');
    this.fx.callout(u.x, u.y, spell.name, spell.fx ?? 0xc0a0ff);
    sfx(spell.effect === 'damage' && /fire|flame|meteor/i.test(spell.name) ? 'fire' : 'spell');
    await this.view.attackAnim(u.id, target?.x ?? u.x, target?.y ?? u.y - 1);
    const bonus = spellPower(this.game, m, spell);
    await this.applySpell(u, spell, target, bonus);
    this.s.ui.refresh();
    return true;
  }

  // Shared by party and monsters. caster side determines friend/foe.
  async applySpell(caster, spell, target, bonus = 0) {
    const foes = this.units.filter((x) => x.side !== caster.side && this.alive(x));
    const friends = this.units.filter((x) => x.side === caster.side && this.alive(x));
    let targets = [];
    switch (spell.target) {
      case 'enemy': case 'ally': targets = target ? [target] : []; break;
      case 'self': targets = [caster]; break;
      case 'allEnemies': targets = foes; break;
      case 'allAllies': targets = friends; break;
      case 'area': targets = foes.filter((f) => this.dist(f, target) <= (spell.radius || 1)); break;
      default: break;
    }
    const color = spell.fx ?? 0xffffff;
    const kind = /fire|flame|meteor|ember/i.test(spell.name) ? 'fire' : /frost|ice/i.test(spell.name) ? 'frost' : /drain|dark|shadow/i.test(spell.name) ? 'shadow' : spell.system === 'divine' ? 'holy' : spell.system === 'herbal' ? 'poison' : 'arcane';
    if (spell.target === 'enemy' || spell.target === 'area') {
      if (kind === 'holy' && spell.target === 'enemy') await this.fx.beam(target.x, target.y, color);
      else await this.fx.bolt(caster, target, color, kind, spell.target === 'area' ? 8 : 11);
      if (spell.target === 'area') {
        const r = spell.radius || 1;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) this.fx.splash(target.x + dx, target.y + dy, color, kind);
        this.fx.ring(target.x, target.y, color, 0.3, r + 0.7, 0.45);
        this.view.shake(0.15);
      }
    } else if (spell.target === 'allEnemies') {
      this.view.flash(fxHex(color) + '55', 220);
      for (const f of targets) kind === 'holy' ? this.fx.beam(f.x, f.y, color) : this.fx.shock(f.x, f.y, color);
      await this.view.wait(0.3);
    }
    const fire = caster.member && spell.effect === 'damage' ? perkCount(caster.member, 'spellfire') * 2 : 0;
    const power = () => roll(spell.power || '1d6') + bonus + fire;
    for (const t of targets) {
      switch (spell.effect) {
        case 'damage': {
          if (spell.undeadOnly && !(t.def?.undead)) continue;
          let dmg = power();
          if (spell.undeadBonus && t.def?.undead) dmg *= 2;
          await this.damage(t, Math.max(1, dmg), { color: fxHex(color), burst: color, from: caster });
          if (this.alive(t)) for (const s of spell.statuses || []) if (s.chance == null || rng.chance(s.chance)) this.addStatus(t, s.id, s.rounds || 1, s.power || 0, caster);
          break;
        }
        case 'drain': {
          const dmg = Math.max(1, power());
          await this.damage(t, dmg, { color: '#80ff90', burst: 0x60ff80, from: caster });
          this.heal(caster, Math.ceil(dmg / 2));
          break;
        }
        case 'heal':
          if (t.member?.status === 'dead') break;
          this.heal(t, Math.max(1, power()), caster);
          sfx('heal');
          break;
        case 'cure':
          if (t.member?.status === 'poisoned') { t.member.status = 'ok'; this.fx.number(t.x, t.y, 'Cured', 'status', '#9f9'); }
          this.removeStatus(t, 'poisoned');
          this.fx.healFx(t.x, t.y, 0xa0ffa0);
          break;
        case 'revive':
          if (t.member && t.dead) await this.revive(t);
          break;
        case 'sleep': {
          if (spell.chance && !rng.chance(spell.chance)) { this.fx.number(t.x, t.y, 'Resists', 'info'); break; }
          this.addStatus(t, 'asleep', parseInt(spell.power, 10) || 2, 0, caster);
          break;
        }
        case 'fear': {
          if (spell.chance && !rng.chance(spell.chance)) { this.fx.number(t.x, t.y, 'Resists', 'info'); break; }
          this.addStatus(t, 'afraid', parseInt(spell.power, 10) || 3, 0, caster);
          break;
        }
        case 'shield': case 'bless': {
          this.addStatus(t, spell.effect === 'shield' ? 'shielded' : 'blessed', spell.duration || 6, parseInt(spell.power, 10) || 2, caster);
          this.view.sparkle(t.x, t.y, color, 10);
          break;
        }
        default:
          break;
      }
    }
    this.emit('update');
    await this.view.wait(0.15);
  }

  async revive(u, pct = 0) {
    const m = u.member;
    m.status = 'ok';
    m.hp = Math.max(1, pct > 0 ? Math.ceil(maxHp(this.game, m) * Math.min(1, pct)) : Math.floor(maxHp(this.game, m) / 3));
    // they rise where their body lies, unless someone stands on it now
    const [x, y] = this.freeSpot([u.x, u.y]);
    u.dead = false;
    u.st = {};
    u.x = x; u.y = y;
    this.view.addEntity(u.id, charLook(this.game, m), x, y, { ring: 0xffd040, facing: [x < ARENA_W / 2 ? 1 : -1, 0.45] });
    this.view.sparkle(x, y, 0xffffff, 26);
    this.fx.beam(x, y, 0xffffff);
    this.emit('update');
    this.log(`${m.name} rises again!`, 'good');
  }

  async useItem(u, item, target) {
    const inv = this.s.party.inventory;
    if (!inv[item.id]) return false;
    const tm = target?.member;
    switch (item.effect) {
      case 'heal':
        if (!target || !this.alive(target)) return false;
        if (!this.wounded([target]).length) { this.log(`${target.name} is already at full health.`, 'warn'); sfx('error'); return false; }
        inv[item.id]--;
        this.heal(target, roll(item.power || '2d8'), u);
        sfx('heal');
        break;
      case 'cure':
        if (!tm) return false;
        inv[item.id]--;
        if (tm.status === 'poisoned') tm.status = 'ok';
        this.fx.healFx(target.x, target.y, 0xa0ffa0);
        break;
      case 'mp':
        if (!tm) return false;
        if (!restoresPool(this.game, item, tm)) { this.log(`The ${item.name} does nothing for ${tm.name}: it renews ${poolWords(this.game, item)}.`, 'warn'); return false; }
        inv[item.id]--;
        tm.mp = Math.min(maxMp(this.game, tm), tm.mp + roll(item.power || '2d6'));
        this.fx.healFx(target.x, target.y, 0x80a0ff);
        break;
      case 'revive':
        if (!target || !target.dead) { this.log('Only the fallen can be revived.'); return false; }
        inv[item.id]--;
        await this.revive(target);
        break;
      default:
        this.log('That is of no use in battle.', 'warn');
        return false;
    }
    this.log(`${u.name} uses ${item.name}.`);
    this.s.ui.refresh();
    return true;
  }

  // ------------------------------------------------------------ monster AI
  aiOf(def) {
    if (def.ai) return def.ai;
    if (def.boss) return 'boss';
    if ((def.range || 1) > 1) return 'archer';
    if (def.spells?.length && (def.castChance ?? 0) >= 0.5) return 'caster';
    return 'brute';
  }

  async monsterTurn(m) {
    await this.view.wait(0.1);
    const actions = m.def.speed > 1 ? 2 : 1;
    const x0 = m.x, y0 = m.y;
    for (let a = 0; a < actions && !this.aborted && this.alive(m) && !this.checkEnd(); a++) {
      // a fast monster's second action is a short lunge, not another full charge
      await this.monsterAct(m, a === 0 ? this.movesFor(m) : Math.min(1, this.movesFor(m)), a > 0);
    }
    // (delve) on a big field a foe that can find no way to anyone (a locked door,
    // deep water) gives up after a few turns, so the battle cannot stall
    if (this.field && this.alive(m) && !m.pet) {
      const stuck = m.x === x0 && m.y === y0 && !this.helpless(m)
        && !this.foesOf(m).some((f) => (cheb(f, m) <= 6 && this.lineClear(f, m)) || this.distField(f, m).has(`${m.x},${m.y}`));
      m.stuck = stuck ? (m.stuck || 0) + 1 : 0;
      if (m.stuck >= 3) {
        m.fled = true;
        this.log(`${this.The(m)} can find no way to you and gives up the fight.`);
        this.emit('update');
      }
    }
    await this.view.wait(0.05);
  }

  // whom a monster goes for
  pickTarget(m, ai) {
    const foes = this.foesOf(m).filter((p) => !this.unseen(p));
    if (!foes.length) return null;
    const src = m.st.taunted?.src;
    if (src && foes.includes(src)) return src;
    const range = this.weaponRange(m);
    let best = null, bs = Infinity;
    for (const p of foes) {
      const d = this.dist(m, p);
      const frac = this.hpOf(p) / Math.max(1, this.maxHpOf(p));
      let s;
      if (ai === 'archer' || ai === 'caster') s = (d <= Math.max(range, 5) && this.lineClear(m, p) ? 0 : d * 2) + frac * 6;
      else {
        s = d * 3 + frac * 2;
        if (ai === 'coward') s += frac * 8 - (this.acOf(p) < 14 ? 2 : 0);
        if (ai === 'pack') s -= this.friendsOf(m).filter((f) => f !== m && this.adjacent(f, p)).length * 4 + (1 - frac) * 3;
      }
      if (p.sleep > 0) s -= 0.5;
      if (s < bs) { bs = s; best = p; }
    }
    return best;
  }

  async monsterAct(m, steps = 3, second = false) {
    const def = m.def;
    const ai = this.aiOf(def);
    if (m.fear > 0) {
      m.fear--;
      await this.flee(m, Math.max(1, steps));
      return;
    }
    if (this.has(m, 'charmed')) { await this.bewildered(m, steps); return; }
    const frac = m.hp / m.maxHp;
    const alone = this.friendsOf(m).length === 1;
    // (a called creature fights to the end of its time)
    if (!def.boss && !m.pet && ((def.fleeAt && frac <= def.fleeAt) || (ai === 'coward' && alone && frac < 0.5))) {
      await this.flee(m, steps);
      return;
    }
    const target = this.pickTarget(m, ai);
    if (!target) return;
    const eager = ai === 'boss' ? 0.85 : 0.6;
    if (!second) {
      const pre = this.monsterAbility(m, target, 'pre');
      if (pre && rng.chance(eager)) { await this.useAbility(m, pre.ab, pre.target); return; }
      if (def.spells?.length && rng.chance(def.castChance ?? 0.3) && (await this.monsterCast(m))) return;
    }
    if (ai === 'archer' || ai === 'caster') await this.reposition(m, steps, target, ai);
    else await this.approach(m, target, steps, ai);
    if (!this.alive(m) || this.checkEnd()) return;
    const tgt = this.canAttack(m, target) ? target : this.attackTargets(m).filter((p) => !this.unseen(p)).sort((a, b) => this.hpOf(a) - this.hpOf(b))[0];
    const post = this.monsterAbility(m, tgt || target, 'post');
    if (post && rng.chance(eager)) { await this.useAbility(m, post.ab, post.target); return; }
    if (tgt) await this.strike(m, tgt);
  }

  // Song of Discord: for a turn it goes for the nearest of its own side
  async bewildered(m, steps) {
    const kin = this.friendsOf(m).filter((f) => f !== m).sort((a, b) => cheb(a, m) - cheb(b, m));
    const t = kin[0];
    this.fx.number(m.x, m.y, 'Bewildered!', 'status', STATUS_EFFECTS.charmed?.color || '#e090ff');
    if (!t) { this.log(`${this.The(m)} stands bewildered, with no one of its own to turn on.`); return; }
    const range = this.weaponRange(m);
    const reach = () => this.adjacent(m, t) || (range > 1 && cheb(m, t) <= range && this.lineClear(m, t));
    if (!reach()) await this.approach(m, t, steps, 'brute');
    if (!this.alive(m) || !this.alive(t)) return;
    if (!reach()) { this.log(`${this.The(m)} lurches about, bewildered.`); return; }
    this.log(`${this.The(m)}, bewildered, turns on ${this.the(t)}!`, m.side === 'enemy' ? 'good' : 'bad');
    await this.strike(m, t);
  }

  // The ability a monster would like to use now (before or after moving), if any
  monsterAbility(m, target, phase) {
    const ai = this.aiOf(m.def);
    const abs = this.abilitiesOf(m).filter((ab) => this.canUseAbility(m, ab).ok);
    for (const ab of abs) {
      const tg = this.abilityTargets(m, ab);
      if (ab.heal) {
        const hurt = tg.units.filter((a) => this.hpOf(a) / this.maxHpOf(a) < 0.6).sort((a, b) => this.hpOf(a) / this.maxHpOf(a) - this.hpOf(b) / this.maxHpOf(b));
        if (hurt.length) return { ab, target: hurt[0] };
        continue;
      }
      if (ab.target === 'nearbyAllies' || ab.target === 'allAllies') {
        if (phase === 'pre' && tg.units.filter((a) => !this.has(a, 'blessed')).length >= 2) return { ab };
        continue;
      }
      if (ab.windup) {
        // a telegraphed blow is easy to step out of: ordinary monsters save it
        // for when it would catch two foes (or now and then), bosses use it freely
        const spot = this.windupSpot(m, ab);
        if (spot && (m.def.boss || spot.n >= 2 || rng.chance(0.35))) return { ab, target: { x: spot.x, y: spot.y } };
        continue;
      }
      if (ab.move === 'charge') {
        if (phase === 'pre' && tg.units.includes(target) && !this.adjacent(m, target)) return { ab, target };
        continue;
      }
      if (ab.target === 'enemy') {
        // casters curse from where they stand; everyone else strikes after closing in
        if (phase === 'post' || (ai === 'caster' && (ab.range ?? 1) > 1)) {
          const t = tg.units.includes(target) ? target : tg.units[0];
          if (t) return { ab, target: t };
        }
        continue;
      }
      if (ab.target === 'adjacentFoes' || ab.target === 'nearbyFoes') {
        if (phase === 'post' && tg.units.length >= (m.def.boss ? 1 : 2)) return { ab };
        continue;
      }
    }
    return null;
  }

  // where to aim a telegraphed blow: the square that catches the most foes
  windupSpot(m, ab) {
    const foes = this.foesOf(m).filter((p) => !this.unseen(p));
    if ((ab.range ?? 1) === 0) {
      const n = foes.filter((f) => cheb(f, m) <= (ab.radius ?? 0)).length;
      return n >= (m.def.boss ? 1 : 2) || (n && m.def.boss) ? { x: m.x, y: m.y, n } : null;
    }
    let best = null, bn = 0;
    const r = ab.radius ?? 0;
    for (const f of foes) {
      if ((ab.range ?? 1) <= 1 ? !this.adjacent(m, f) : cheb(m, f) > ab.range) continue;
      const n = foes.filter((g) => cheb(g, f) <= r).length;
      if (n > bn) { bn = n; best = { x: f.x, y: f.y, n }; }
    }
    return best;
  }

  async monsterCast(m) {
    const spell = byId(this.game.spells, rng.pick(m.def.spells));
    if (!spell || spell.combat === false) return false;
    let tgt = null;
    if (spell.target === 'enemy' || spell.target === 'area') {
      const inRange = this.foesOf(m).filter((p) => !this.unseen(p) && this.dist(m, p) <= (spell.range || 6) && this.lineClear(m, p));
      if (inRange.length) tgt = rng.pick(inRange);
    } else tgt = m;
    if (!tgt) return false;
    this.log(`${this.The(m)} uses ${spell.name}!`, 'bad');
    this.fx.callout(m.x, m.y, spell.name, spell.fx ?? 0xff6060);
    sfx(/fire/i.test(spell.name) ? 'fire' : 'spell');
    this.faceTo(m, tgt);
    await this.view.attackAnim(m.id, tgt.x, tgt.y);
    await this.applySpell(m, spell, tgt, Math.floor((m.def.level || 1) / 2));
    return true;
  }

  // BFS distances to t over ground the monster can cross (its foes block)
  distField(t, m) {
    const out = new Map([[`${t.x},${t.y}`, 0]]);
    const q = [[t.x, t.y, 0]];
    while (q.length) {
      const [x, y, d] = q.shift();
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (out.has(k) || !this.groundOk(nx, ny, m)) continue;
        const occ = this.unitAt(nx, ny);
        if (occ && occ.side !== m.side) continue;
        out.set(k, d + 1);
        q.push([nx, ny, d + 1]);
      }
    }
    return out;
  }

  pathOf(c) {
    const path = [];
    for (; c && c.d > 0; c = c.from) path.unshift([c.x, c.y]);
    return path;
  }

  async walkPath(m, path, speed = 0.11) {
    for (const [x, y] of path) {
      if (!this.alive(m)) return;
      if (!(await this.provoke(m, x, y))) return;
      m.face = [x - m.x, y - m.y];
      // (delve) a foe moving out in the dark, where no hero sees it, is not waited on
      const unseen = this.field && m.side === 'enemy' && !this.field.visible?.(m.x, m.y) && !this.field.visible?.(x, y);
      m.x = x; m.y = y;
      await this.view.moveEntity(m.id, x, y, unseen ? 0.02 : speed);
      // a sprung trap stops it where it stands
      await this.stepOn(m);
      if (!this.alive(m) || this.helpless(m) || this.has(m, 'rooted')) return;
    }
  }

  // Close in for a melee blow; pack hunters look for a flank or a back to bite
  async approach(m, target, steps, ai) {
    // (beside its target it stays put, unless a blow is about to land there)
    if (steps <= 0 || (this.adjacent(m, target) && !this.inDanger(m.x, m.y, m.side))) return;
    const reach = this.reachable(m, steps);
    const field = this.distField(target, m);
    const flankers = this.friendsOf(m).filter((f) => f !== m && this.adjacent(f, target));
    let best = null, bs = -Infinity;
    for (const c of reach.values()) {
      if (c.ally) continue;
      const adj = Math.abs(c.x - target.x) + Math.abs(c.y - target.y) === 1;
      let s;
      if (adj) {
        s = 100 - c.d * 0.5;
        if (ai === 'pack' || ai === 'coward') {
          if (flankers.length) s += 10;
          if (this.behind(c, target)) s += 8;
        }
      } else s = -(field.get(`${c.x},${c.y}`) ?? 99) * 5 - c.d * 0.2;
      if (c.d > 0 && this.provokers(m, c.x, c.y).length) s -= 15;
      if (this.inDanger(c.x, c.y, m.side)) s -= 30;
      if (s > bs) { bs = s; best = c; }
    }
    if (best && best.d > 0) await this.walkPath(m, this.pathOf(best));
  }

  // Archers and casters hang back where they can see a foe but none can reach them
  async reposition(m, steps, target, ai) {
    if (steps <= 0) return;
    const reach = this.reachable(m, steps);
    const foes = this.foesOf(m).filter((p) => !this.has(p, 'hidden'));
    const range = ai === 'archer' ? this.weaponRange(m) : 5;
    let best = null, bs = -Infinity;
    for (const c of reach.values()) {
      if (c.ally) continue;
      const near = Math.min(...foes.map((f) => cheb(f, c)));
      let s = 0;
      if (foes.some((f) => cheb(f, c) <= range && this.lineClear(c, f))) s += 50;
      if (target && cheb(target, c) <= range && this.lineClear(c, target)) s += 10 - (this.inCover(target, c) ? 4 : 0);
      if (near <= 1) s -= 40; else if (near === 2) s -= 8; else s += Math.min(near, 5) * 2;
      s -= c.d * 0.3;
      if (c.d > 0 && this.provokers(m, c.x, c.y).length) s -= 12;
      if (this.inDanger(c.x, c.y, m.side)) s -= 40;
      if (s > bs) { bs = s; best = c; }
    }
    if (best && best.d > 0) await this.walkPath(m, this.pathOf(best));
  }

  async flee(m, steps) {
    if (this.field) return this.fieldFlee(m, steps);
    for (let i = 0; i < steps && this.alive(m); i++) {
      if (m.x === 0 || m.y === 0 || m.x === ARENA_W - 1 || m.y === ARENA_H - 1) {
        m.fled = true;
        this.log(`${this.The(m)} flees!`);
        this.fx.number(m.x, m.y, 'Flees!', 'info');
        this.view.removeEntity(m.id);
        this.emit('update');
        return;
      }
      const near = this.foesOf(m).sort((a, b) => cheb(a, m) - cheb(b, m))[0];
      if (!near) return;
      let best = null, bs = -Infinity;
      for (const [dx, dy] of DIR4) {
        const nx = m.x + dx, ny = m.y + dy;
        if (!this.walkable(nx, ny, m)) continue;
        const s = cheb(near, { x: nx, y: ny }) * 2 - Math.min(nx, ny, ARENA_W - 1 - nx, ARENA_H - 1 - ny);
        if (s > bs) { bs = s; best = [nx, ny]; }
      }
      if (!best) return;
      await this.walkPath(m, [best], 0.13);
    }
  }

  // (delve) on a dungeon floor there is no edge to run off: a foe runs from
  // the heroes, and once none of them is near or can see it, it slips away
  // into the dark (to lurk where it stopped)
  async fieldFlee(m, steps) {
    for (let i = 0; i < steps && this.alive(m); i++) {
      const foes = this.foesOf(m);
      if (!foes.length) return;
      const near = (p) => Math.min(...foes.map((f) => cheb(f, p)));
      let best = null, bs = near(m);
      for (const [dx, dy] of DIR4) {
        const nx = m.x + dx, ny = m.y + dy;
        if (!this.walkable(nx, ny, m)) continue;
        const sc = near({ x: nx, y: ny });
        if (sc > bs) { bs = sc; best = [nx, ny]; }
      }
      if (!best) break; // cornered
      await this.walkPath(m, [best], 0.13);
    }
    if (this.alive(m) && this.foesOf(m).every((f) => cheb(f, m) > 5 || !this.lineClear(f, m))) {
      m.fled = true;
      this.log(`${this.The(m)} slips away into the dark.`);
      this.fx.number(m.x, m.y, 'Flees!', 'info');
      this.emit('update');
    }
  }

  // ------------------------------------------------------------ helpers for UI
  combatSpells(u) {
    return knownSpells(this.game, u.member).filter((s) => s.combat);
  }

  combatItems() {
    const inv = this.s.party.inventory;
    return this.game.items.filter((it) => it.type === 'consumable' && it.combat && inv[it.id] > 0);
  }

  partyMembersAlive() { return partyAlive(this.s.party); }

  // The coming turns, for the initiative strip: [{ u, now, round }]
  upcoming(n = 10) {
    const out = [];
    for (let i = this.turnIdx; i < this.order.length && out.length < n; i++) {
      const u = this.order[i];
      if (this.alive(u)) out.push({ u, now: u === this.current, round: this.round });
    }
    const next = this.units.filter((u) => this.alive(u)).sort((a, b) => b.init - a.init || (a.side === 'party' ? -1 : 1));
    for (let r = 1; out.length < n && next.length && r < 4; r++) for (const u of next) { if (out.length >= n) break; out.push({ u, now: false, round: this.round + r }); }
    return out;
  }
}
