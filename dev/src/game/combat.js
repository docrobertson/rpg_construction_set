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
import { DIR4 } from '../core/util.js';
import {
  attackBonus, armorClass, damageRoll, damageBonus, weaponOf, rangedOf, critRange, maxHp, maxMp, charLook, hasTrait, hasAbility,
  canCast, payForSpell, spellPower, gainXp, partyAlive, knownSpells, specialOf, combatMoves, heroAbilities, abilityOf, ensureCombatData,
  perkCount, mod, classOf,
} from './rules.js';
import { sfx } from '../core/sound.js';
import { BattleFx } from '../render/fx.js';

const PARTY_SPOTS = [[6, 7], [5, 7], [7, 7], [4, 7], [8, 7], [6, 8], [5, 8], [7, 8]];
const fxHex = (n) => '#' + ((n ?? 0xffffff) >>> 0).toString(16).padStart(6, '0');
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const LEGACY = { stunned: 'stun', asleep: 'sleep', afraid: 'fear' };
// the blow a foe gets in when someone breaks away from it
const FREE_STRIKE = { id: '_free', name: 'Free strike', attack: 'melee' };

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
    ensureCombatData(this.game);
    this.fx = new BattleFx(this.view);
  }

  log(t, c) { this.s.log(t, c); }
  emit(type, data) { this.s.ui?.combatEvent?.(type, data, this); }

  // ------------------------------------------------------------ setup
  unit(base) {
    return { sleep: 0, fear: 0, stun: 0, st: {}, cd: {}, uses: {}, reacted: false, charging: null, ...base };
  }

  setup() {
    const lighting = this.s.map?.lighting === 'dark' ? 'dark' : this.s.currentLighting ? this.s.currentLighting() : this.s.map?.lighting === 'night' ? 'night' : 'day';
    this.arena = generateArena(this.style, rng.int(1, 1e9), { lighting });
    // sea monsters that strike at a party on the shore need water to fight from
    const swimmers = this.enemyList.some((g) => byId(this.game.monsters, g.id)?.swim);
    if (swimmers && !this.arena.tiles.some((t) => terrain(t).water && terrain(t).key !== 'bridge')) {
      for (let y = 0; y < 3; y++) for (let x = 1; x < ARENA_W - 1; x++) this.arena.tiles[y * ARENA_W + x] = y === 2 ? T.shallows : T.ocean;
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
    // party
    let i = 0;
    for (const m of this.s.party.members) {
      if (m.status === 'dead') continue;
      const [x, y] = this.freeSpot(PARTY_SPOTS[i++] || [6, 8], 'party');
      const u = this.unit({ id: 'pu_' + m.id, side: 'party', member: m, name: m.name, x, y, sleep: m.status === 'asleep' ? 2 : 0, face: [0, -1] });
      m.buffs = [];
      u.init = (m.dex || 10) + rng.int(1, 6) + perkCount(m, 'alert') * 4;
      this.units.push(u);
      v.addEntity(u.id, charLook(this.game, m), x, y, { ring: 0xffd040, facing: [0, -1] });
    }
    // enemies
    for (const grp of this.enemyList) {
      const def = byId(this.game.monsters, grp.id);
      if (!def) continue;
      for (let k = 0; k < grp.n; k++) {
        const spot = this.enemySpot(def);
        if (!spot) break;
        const hp = Math.max(1, roll(def.hp || '2d8'));
        const u = this.unit({ id: 'en_' + this.units.length, side: 'enemy', def, name: def.name, x: spot[0], y: spot[1], hp, maxHp: hp, buffs: [], face: [0, 1] });
        u.init = 8 + (def.level || 1) + (def.speed > 1 ? 3 : 0) + (def.init || 0) + rng.int(1, 6);
        this.units.push(u);
        v.addEntity(u.id, def.look || { kind: 'blob' }, u.x, u.y, { ring: 0xd03030, facing: [0, 1], scale: def.boss ? 1.15 : 1 });
      }
    }
    // tell several foes of one kind apart in the log and the turn strip
    const counts = {};
    for (const e of this.enemies) counts[e.def.id] = (counts[e.def.id] || 0) + 1;
    const seen = {};
    for (const e of this.enemies) if (counts[e.def.id] > 1) e.tag = String.fromCharCode(65 + (seen[e.def.id] = (seen[e.def.id] || 0) + 1) - 1);
    const names = this.enemyList.map((g) => {
      const d = byId(this.game.monsters, g.id);
      return d ? (g.n > 1 ? `${g.n} ${d.plural || d.name}` : `${/^[aeiou]/i.test(d.name) ? 'an' : 'a'} ${d.name}`) : '';
    }).filter(Boolean);
    this.log(`Battle! You face ${names.join(' and ')}.`, 'bad');
  }

  freeSpot([x, y]) {
    for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (this.walkable(nx, ny, null)) return [nx, ny];
    }
    return [x, y];
  }

  enemySpot(def) {
    for (let a = 0; a < 80; a++) {
      const x = rng.int(1, ARENA_W - 2);
      // close enough that the fight is joined in the first round
      const y = def.swim ? rng.int(0, ARENA_H - 4) : (def.range || 1) > 1 || this.aiOf(def) === 'caster' ? rng.int(0, 2) : rng.int(1, 3);
      if (this.walkable(x, y, { def })) return [x, y];
    }
    // nowhere suitable (e.g. landlubbers at sea): any free walkable tile
    for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < ARENA_W; x++) {
      if (this.walkable(x, y, { def }) || (this.walkable(x, y, null) && !def.swim)) return [x, y];
    }
    return null;
  }

  // ------------------------------------------------------------ queries
  get partyUnits() { return this.units.filter((u) => u.side === 'party'); }
  get enemies() { return this.units.filter((u) => u.side === 'enemy'); }
  alive(u) { return !!u && !u.dead && !u.fled; }
  hpOf(u) { return u.side === 'party' ? u.member.hp : u.hp; }
  maxHpOf(u) { return u.side === 'party' ? maxHp(this.game, u.member) : u.maxHp; }
  foesOf(u) { return this.units.filter((x) => x.side !== u.side && this.alive(x)); }
  friendsOf(u) { return this.units.filter((x) => x.side === u.side && this.alive(x)); }
  label(u) { return u.tag ? `${u.name} ${u.tag}` : u.name; }
  the(u) { return u.side === 'enemy' && !u.def?.boss ? `the ${this.label(u)}` : this.label(u); }
  The(u) { const t = this.the(u); return t[0].toUpperCase() + t.slice(1); }

  unitAt(x, y) { return this.units.find((u) => this.alive(u) && u.x === x && u.y === y); }

  walkable(x, y, unit) {
    return this.groundOk(x, y, unit) && !this.unitAt(x, y);
  }

  // can this unit stand on the terrain here (ignoring who else is there)?
  groundOk(x, y, unit) {
    if (!inBounds(this.arena, x, y)) return false;
    const t = terrain(getTile(this.arena, x, y));
    const def = unit && unit.def;
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
    if (id === 'poisoned' && u.side === 'party' && u.member.status === 'poisoned') return true;
    return !!u.st[id];
  }
  power(u, id) { return u.st[id]?.power || 0; }
  helpless(u) { return u.sleep > 0 || u.stun > 0; }

  // Every condition on a unit, for the HUD: [{ id, rounds, power, def }]
  statusList(u) {
    const out = [];
    if (u.stun > 0) out.push({ id: 'stunned', rounds: u.stun });
    if (u.sleep > 0) out.push({ id: 'asleep', rounds: u.sleep });
    if (u.fear > 0) out.push({ id: 'afraid', rounds: u.fear });
    if (u.side === 'party' && u.member.status === 'poisoned') out.push({ id: 'poisoned', rounds: null });
    for (const [id, s] of Object.entries(u.st)) out.push({ id, rounds: s.rounds, power: s.power });
    return out.map((s) => ({ ...s, def: STATUS_EFFECTS[s.id] || { name: s.id, icon: 'star', color: '#fff' } }));
  }

  resists(t, id) {
    const iron = t.side === 'party' && perkCount(t.member, 'iron_will');
    const stout = t.side === 'party' && hasTrait(this.game, t.member, 'stout');
    if (id === 'stunned') return iron || (t.def?.boss && rng.chance(0.5));
    if (id === 'asleep') return iron || t.def?.sleepImmune || t.def?.undead || (stout && rng.chance(0.5));
    if (id === 'afraid') return iron || t.def?.boss || (stout && rng.chance(0.5));
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
      if (id === 'asleep' && t.side === 'party' && t.member.status === 'ok') t.member.status = 'asleep';
    } else if (id === 'poisoned' && t.side === 'party') {
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
    let ac = u.side === 'party' ? armorClass(this.game, u.member) : (u.def.ac || 10);
    if (u.side !== 'party') for (const b of u.buffs || []) if (b.kind === 'shield') ac += b.power;
    return ac + this.power(u, 'shielded');
  }

  movesFor(u) {
    let n = u.side === 'party' ? combatMoves(this.game, u.member) : (u.def.moves ?? 4);
    if (this.has(u, 'rooted')) return 0;
    if (this.has(u, 'slowed')) n = Math.ceil(n / 2);
    return n;
  }

  statMod(u, stat) {
    if (!stat) return 0;
    if (u.side === 'party') return Math.max(0, mod(u.member[stat] || 10));
    return Math.floor((u.def.level || 1) / 2);
  }

  updateBar() { this.emit('update'); }

  // ------------------------------------------------------------ main loop
  async run() {
    this.setup();
    this.s.ui.combatStart(this);
    await this.s.app.fade(false, 250);
    this.emit('start');
    for (;;) {
      this.order = this.units.filter((u) => this.alive(u)).sort((a, b) => b.init - a.init || (a.side === 'party' ? -1 : 1));
      this.emit('round', this.round);
      for (this.turnIdx = 0; this.turnIdx < this.order.length; this.turnIdx++) {
        const u = this.order[this.turnIdx];
        if (!this.alive(u)) continue;
        if (u.side === 'party' && u.member.status === 'dead') { u.dead = true; continue; }
        this.current = u;
        u.reacted = false;
        this.emit('turn', u);
        const skip = await this.startTurn(u);
        let end = this.checkEnd();
        if (end) return this.finish(end);
        if (!skip && this.alive(u)) {
          if (u.side === 'party') await this.heroTurn(u);
          else await this.monsterTurn(u);
        }
        this.endTurn(u);
        this.current = null;
        end = this.checkEnd();
        if (end) return this.finish(end);
      }
      this.round++;
    }
  }

  async heroTurn(u) {
    this.active = u;
    u.moves = this.movesFor(u);
    u.maxMoves = u.moves;
    this.view.setRing(u.id, 0xffffff);
    this.s.ui.combatTurn(u);
    await new Promise((res) => { this.pending = res; });
    this.view.setRing(u.id, 0xffd040);
    this.active = null;
    this.s.ui.combatTurn(null);
  }

  // Returns true if the unit loses its turn
  async startTurn(u) {
    // legacy buffs from older saves
    const buffs = u.side === 'party' ? u.member.buffs : u.buffs;
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
    if (u.side === 'party' && u.member.status === 'poisoned') {
      await this.damage(u, rng.int(1, 2), { dot: 'poisoned', quiet: true });
      if (!this.alive(u)) return true;
    }
    if (u.charging && (u.stun > 0 || u.sleep > 0)) {
      this.log(`${this.The(u)} is interrupted — its ${u.charging.ab.name} comes to nothing!`, 'good');
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
        if (u.side === 'party' && u.member.status === 'asleep') u.member.status = 'ok';
      }
      await this.view.wait(0.2);
      return true;
    }
    if (u.charging) {
      await this.releaseWindup(u);
      return true;
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
    for (const u of this.units) if (u.charging) this.cancelWindup(u);
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
      summary.gold = this.gold;
      summary.xp = share;
      this.log(`Victory! Each survivor gains ${share} experience${this.gold ? `, and you find ${this.gold} gold` : ''}.`, 'good');
      for (const m of alive) {
        const before = { level: m.level, xp: m.xp };
        const lv = gainXp(this.game, m, share);
        summary.heroes.push({ member: m, from: before, gained: m.xp - before.xp, levels: lv });
        if (lv.length) {
          this.log(`${m.name} is now level ${m.level}! (▲ ${m.points} attribute point${m.points === 1 ? '' : 's'} and a new talent to choose)`, 'level');
          sfx('level');
          const u = this.partyUnits.find((pu) => pu.member === m);
          if (u) { this.view.sparkle(u.x, u.y, 0xffe060, 24); this.fx.callout(u.x, u.y, 'LEVEL UP!', 0xffe060); }
        }
      }
      this.dropLoot();
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
      u.x = nx; u.y = ny;
      u.face = [dx, dy];
      u.moves--;
      sfx('step');
      await this.view.moveEntity(u.id, nx, ny, 0.13);
      this.emit('moved', u);
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
        u.face = [px - u.x, py - u.y];
        u.x = px; u.y = py;
        u.moves--;
        sfx('step');
        await this.view.moveEntity(u.id, px, py, 0.12);
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
    if (this.has(u, 'hidden')) return [];
    return this.foesOf(u).filter((f) => !f.reacted && !this.helpless(f) && !(f.fear > 0) && !f.charging
      && cheb(f, from) <= 1 && cheb(f, { x, y }) > 1);
  }

  // Free strikes at a unit breaking away; false if it does not survive them
  async provoke(u, x, y) {
    for (const f of this.provokers(u, x, y)) {
      if (!this.alive(u)) return false;
      f.reacted = true;
      this.log(`${this.The(f)} strikes at ${this.the(u)} as ${u.side === 'party' ? 'they break' : 'it breaks'} away!`, u.side === 'party' ? 'bad' : 'good');
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
    if (u.side === 'enemy' && this.has(t, 'hidden')) return false;
    if (this.adjacent(u, t)) return true;
    const range = this.weaponRange(u);
    return range > 1 && this.dist(u, t) <= range && this.lineClear(u, t);
  }

  weaponRange(u) {
    if (u.side === 'party') {
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
      if (u.side === 'party') {
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
    if (u.side === 'party') {
      const m = u.member;
      const w = ab?.attack === 'ranged' ? rangedOf(this.game, m) : ab?.attack === 'melee' ? weaponOf(this.game, m) : this.weaponFor(u, t);
      if (!w) return null;
      const ranged = (w.range || 1) > 1;
      const d = parseDice(w.dmg || '1d2'), b = damageBonus(this.game, m, w);
      return {
        w, ranged, hit: attackBonus(this.game, m, w), critMin: critRange(this.game, m), name: w.name,
        min: Math.max(1, d.n + d.b + b), max: Math.max(1, d.n * d.d + d.b + b), roll: () => damageRoll(this.game, m, w),
      };
    }
    const def = u.def;
    const ranged = (def.range || 1) > 1 && !adj && ab?.attack !== 'melee';
    const d = parseDice(def.dmg || '1d4');
    return {
      w: null, ranged, hit: def.hit || 0, critMin: 20, name: ranged ? 'missile' : 'blow',
      min: Math.max(1, d.n + d.b), max: Math.max(1, d.n * d.d + d.b), roll: () => Math.max(1, roll(def.dmg || '1d4')),
    };
  }

  // Situational modifiers, with a note for each so the player can see why
  strikeMods(u, t, kit, ab) {
    const notes = [];
    let hit = 0, mult = 1, auto = false;
    const bl = this.power(u, 'blessed');
    if (bl) { hit += bl; notes.push(`Blessed +${bl}`); }
    if (this.has(u, 'weakened')) { hit -= 2; notes.push('Weakened −2'); }
    if (ab?.hit) { hit += ab.hit; notes.push(`${ab.name} +${ab.hit}`); }
    if (t.side === 'party' && hasTrait(this.game, t.member, 'lucky')) { hit -= 2; notes.push('Lucky −2'); }
    if (!kit.ranged) {
      if (this.friendsOf(u).some((f) => f !== u && this.adjacent(f, t) && !this.helpless(f))) { hit += 2; notes.push('Flanking +2'); }
      const hidden = this.has(u, 'hidden');
      if (hidden || this.behind(u, t)) {
        const stab = u.side === 'party' && hasAbility(this.game, u.member, 'backstab');
        hit += hidden ? 4 : 2;
        mult *= stab ? 2 : 1.5;
        notes.push(hidden ? 'Unseen +4' : 'From behind +2', stab ? 'Backstab ×2 dmg' : 'Rear ×1.5 dmg');
      }
    } else {
      if (!ab?.ignoreCover && this.inCover(t, u)) { hit -= 3; notes.push('Cover −3'); }
      if (this.foesOf(u).some((f) => this.adjacent(f, u) && !this.helpless(f))) { hit -= 4; notes.push('Engaged −4'); }
    }
    if (this.helpless(t)) { auto = true; notes.push('Helpless: sure hit'); }
    return { hit, mult, auto, crit: !!ab?.autoCrit, notes };
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
    if (ab && !ab.attack) {
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
    if (md.crit) { lo *= 2; hi *= 2; md.notes.push('Certain critical'); }
    return { chance, lo, hi, crit: md.crit ? 1 : Math.max(0, (21 - kit.critMin) / 20), notes: md.notes, ranged: kit.ranged, weapon: kit.name };
  }

  async shoot(from, to, kit, ab) {
    const w = kit.w;
    const kind = w?.wkind === 'sling' ? 'stone' : w?.wkind === 'crossbow' ? 'bolt' : 'arrow';
    sfx('shoot');
    const glow = w?.glow ?? (ab?.vfx === 'arrow' && ab?.fx != null && ab.id !== '_free' ? ab.fx : undefined);
    const opts = from.side === 'enemy' ? { fletch: 0x2a2a2a, shaft: 0x4a3a2a } : { kind, glow };
    await this.fx.shot(from, to, opts);
  }

  // One blow or shot from u at t, with all the trimmings. Used by plain
  // attacks, weapon skills, monsters and free strikes alike.
  async strike(u, t, opts = {}) {
    const ab = opts.ab;
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
    if (!hit) {
      this.fx.miss(t);
      sfx('miss');
      this.log(`${this.The(u)} misses ${this.the(t)}.`);
      return { hit: false };
    }
    let dmg = kit.roll() - (this.has(u, 'weakened') ? 2 : 0);
    dmg = Math.max(1, Math.round(dmg * md.mult * (ab?.mult ?? 1)));
    if (ab?.bonus) dmg += roll(ab.bonus);
    if (ab?.undeadBonus && t.def?.undead) dmg *= ab.undeadBonus;
    if (u.side === 'party') {
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
    return { hit: true, dmg, crit };
  }

  async damage(t, dmg, opts = {}) {
    if (!this.alive(t)) return;
    if (t.sleep > 0 && dmg > 0) t.sleep = 0;
    if (t.side === 'party') {
      t.member.hp -= dmg;
      if (t.member.status === 'asleep') t.member.status = 'ok';
    } else t.hp -= dmg;
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
    this.s.ui.refresh();
  }

  async kill(t) {
    t.dead = true;
    if (t.charging) this.cancelWindup(t);
    if (t.side === 'party') {
      t.member.hp = 0;
      t.member.status = 'dead';
      this.log(`${t.name} has fallen!`, 'bad');
      sfx('die');
    } else {
      this.xp += t.def.xp || 0;
      this.gold += Math.max(0, roll(t.def.gold || '0'));
      this.killedIds.push(t.def.id);
      this.log(`${this.The(t)} is slain!`, 'good');
      sfx('die');
    }
    this.emit('death', t);
    this.fx.death(t.x, t.y, t.def?.undead ? 0xd8d8c8 : 0xb8a890);
    await this.view.dieAnim(t.id);
  }

  heal(u, amt) {
    if (!this.alive(u)) return;
    if (u.side !== 'party') u.hp = Math.min(u.maxHp, u.hp + amt);
    else u.member.hp = Math.min(maxHp(this.game, u.member), u.member.hp + amt);
    this.fx.number(u.x, u.y, '+' + amt, 'heal');
    this.fx.healFx(u.x, u.y);
    this.emit('update');
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
    }
    t.face = [-dx, -dy];
    this.view.face(t.id, -dx, -dy);
  }

  async teleport(u, x, y) {
    this.fx.blink(u.x, u.y);
    this.view.sparkle(u.x, u.y, 0xc0a0ff, 12);
    u.x = x; u.y = y;
    await this.view.moveEntity(u.id, x, y, 0.08, 0.3);
    this.fx.blink(x, y);
    this.emit('moved', u);
  }

  // ------------------------------------------------------------ abilities
  abilitiesOf(u) {
    if (u.side === 'party') return heroAbilities(this.game, u.member);
    return (u.def.abilities || []).map((id) => abilityOf(this.game, id)).filter(Boolean);
  }

  isSpecial(u, ab) { return u.side === 'party' && classOf(this.game, u.member).special === ab.id; }

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
    const foes = this.foesOf(u).filter((f) => u.side === 'party' || !this.has(f, 'hidden'));
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
        return { kind: 'enemy', units };
      }
      case 'ally': {
        const r = ab.range ?? 1;
        return { kind: 'ally', units: friends.filter((p) => p === u || (r <= 1 ? this.adjacent(u, p) : this.dist(u, p) <= r)) };
      }
      case 'tile': {
        const tiles = [];
        const r = ab.range ?? 1;
        for (let y = 0; y < this.arena.h; y++) for (let x = 0; x < this.arena.w; x++) {
          if (cheb(u, { x, y }) > r) continue;
          if (ab.move === 'teleport' ? (x !== u.x || y !== u.y) && this.walkable(x, y, u) : true) tiles.push({ x, y });
        }
        return { kind: 'tile', tiles };
      }
      default:
        return { kind: 'none', units: this.affected(u, ab, null) };
    }
  }

  // Everyone an ability will touch
  affected(u, ab, target) {
    const foes = this.foesOf(u).filter((f) => u.side === 'party' || !this.has(f, 'hidden'));
    const friends = this.friendsOf(u);
    const r = ab.radius ?? 1;
    switch (ab.target) {
      case 'enemy': case 'ally': return target ? [target] : [];
      case 'self': return [u];
      case 'adjacentFoes': return foes.filter((f) => this.adjacent(u, f));
      case 'nearbyFoes': return foes.filter((f) => cheb(u, f) <= r);
      case 'nearbyAllies': return friends.filter((f) => cheb(u, f) <= r);
      case 'allAllies': return friends;
      case 'allEnemies': return foes;
      case 'multi': {
        const range = this.abilityRange(u, ab);
        return foes.filter((e) => cheb(u, e) <= range && this.lineClear(u, e)).sort((a, b) => this.hpOf(a) - this.hpOf(b)).slice(0, ab.count || 3);
      }
      case 'tile': return target && ab.move !== 'teleport' ? foes.filter((f) => cheb(f, target) <= (ab.radius ?? 0)) : [];
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
    if (ab.needs === 'ranged' && u.side === 'party' && !rangedOf(this.game, u.member)) return { ok: false, why: `${ab.name} needs a bow, crossbow or sling.`, short: 'Needs a bow' };
    if (ab.move === 'charge' && this.has(u, 'rooted')) return { ok: false, why: 'Pinned in place.', short: 'Pinned' };
    const tg = this.abilityTargets(u, ab);
    const melee = ab.attack === 'melee' && !ab.move;
    if (tg.kind === 'enemy' && !tg.units.length) {
      return melee || (ab.range ?? 1) <= 1
        ? { ok: false, why: 'No foe stands beside you.', short: 'No foe adjacent' }
        : { ok: false, why: `No foe in range (${ab.move ? ab.range : this.abilityRange(u, ab)} squares, with a clear line).`, short: 'Out of range' };
    }
    if (tg.kind === 'ally' && !tg.units.length) return { ok: false, why: 'No companion in reach.', short: 'No one in reach' };
    if (tg.kind === 'tile' && !tg.tiles.length) return { ok: false, why: 'Nowhere to go.', short: 'Blocked' };
    if (tg.kind === 'none' && ['adjacentFoes', 'nearbyFoes', 'multi', 'allEnemies'].includes(ab.target) && !tg.units.length) {
      const why = ab.target === 'adjacentFoes' ? 'No foe stands beside you.' : ab.target === 'nearbyFoes' ? `No foe within ${ab.radius ?? 1} square${(ab.radius ?? 1) > 1 ? 's' : ''}.` : 'No foe in range.';
      return { ok: false, why, short: ab.target === 'adjacentFoes' ? 'No foe adjacent' : 'No foe near' };
    }
    return { ok: true, why: '', short: ab.perBattle ? 'Once per battle' : 'Ready' };
  }

  async useAbility(u, ab, target) {
    const can = this.canUseAbility(u, ab);
    if (!can.ok) { if (u.side === 'party') { this.log(can.why, 'warn'); sfx('error'); } return false; }
    const tg = this.abilityTargets(u, ab);
    if ((tg.kind === 'enemy' || tg.kind === 'ally') && (!target || !tg.units.includes(target))) {
      if (u.side === 'party') { this.log(tg.kind === 'enemy' ? 'Choose a foe in reach.' : 'Choose a companion in reach.', 'warn'); sfx('error'); }
      return false;
    }
    if (tg.kind === 'tile' && (!target || !tg.tiles.some((c) => c.x === target.x && c.y === target.y))) {
      if (u.side === 'party') { this.log(`Choose a square within ${ab.range}.`, 'warn'); sfx('error'); }
      return false;
    }
    // pay for it
    if (ab.cooldown) u.cd[ab.id] = Math.max(1, ab.cooldown - (u.side === 'party' && perkCount(u.member, 'quick') ? 1 : 0)) + 1;
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
      }
    }
    await this.abilityLeadIn(u, ab, target);
    const targets = this.affected(u, ab, target);
    for (const t of targets) {
      if (!this.alive(t)) continue;
      let landed = true;
      if (ab.attack === 'melee' || ab.attack === 'ranged') {
        landed = (await this.strike(u, t, { ab })).hit;
      } else if (ab.damage) {
        let dmg = roll(ab.damage) + this.statMod(u, ab.stat) - (this.has(u, 'weakened') ? 2 : 0);
        if (ab.undeadBonus && t.def?.undead) dmg *= ab.undeadBonus;
        dmg = Math.max(1, dmg);
        sfx(ab.vfx === 'fire' ? 'fire' : 'spell');
        this.log(`${ab.name} hits ${this.the(t)} for ${dmg}.`, t.side === 'party' ? 'bad' : '');
        await this.damage(t, dmg, { by: u, from: u, color: fxHex(ab.fx), burst: ab.fx });
      }
      if (!landed || !this.alive(t)) continue;
      if (ab.heal || ab.healPct) {
        const amt = ab.healPct ? Math.max(2, Math.ceil(this.maxHpOf(t) * ab.healPct)) : Math.max(1, roll(ab.heal) + this.statMod(u, ab.stat));
        sfx('heal');
        this.heal(t, amt);
      }
      if (ab.cure && t.side === 'party' && t.member.status === 'poisoned') { t.member.status = 'ok'; this.fx.number(t.x, t.y, 'Cured', 'status', '#9fe09f'); }
      if (ab.cure) this.removeStatus(t, 'poisoned');
      for (const s of ab.statuses || []) if (!s.self && (s.chance == null || rng.chance(s.chance))) this.addStatus(t, s.id, s.rounds || 1, s.power || 0, u);
      if (ab.knockback && this.alive(t)) await this.knockback(u, t, ab.knockback);
    }
    for (const s of ab.statuses || []) if (s.self) this.addStatus(u, s.id, s.rounds || 1, s.power || 0, u);
    this.s.ui.refresh();
    this.emit('update');
    return !ab.free;
  }

  // The visual flourish before an ability's effect lands
  async abilityLeadIn(u, ab, target) {
    const col = ab.fx ?? 0xffffff;
    const kind = ab.vfx || 'arcane';
    const single = target && target.side && target !== u && !ab.attack;
    if (single && ['fire', 'frost', 'arcane', 'shadow', 'song', 'poison', 'holy'].includes(kind)) {
      sfx(kind === 'fire' ? 'fire' : 'spell');
      await this.view.attackAnim(u.id, target.x, target.y);
      if (kind === 'holy') await this.fx.beam(target.x, target.y, col);
      else await this.fx.bolt(u, target, col, kind);
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
          for (const t of this.affected(u, ab, target)) kind === 'holy' ? this.fx.beam(t.x, t.y, col) : this.fx.healFx(t.x, t.y, col);
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
      case 'shock':
        if (target?.side) this.fx.shock(target.x, target.y, col);
        break;
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
    u.charging = { ab, tiles, center: c, decal: this.fx.danger(tiles, 0xff3018) };
    this.faceTo(u, c);
    sfx('encounter');
    const verb = ab.vfx === 'fire' ? 'draws a deep, smouldering breath' : ab.vfx === 'shadow' ? 'gathers darkness about itself' : 'raises its weapon high';
    this.log(`${this.The(u)} ${verb}… get clear of the marked squares!`, 'bad');
    this.emit('update');
    return true;
  }

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
  specialFor(u) { return u && u.side === 'party' ? specialOf(this.game, u.member) : null; }
  specialAbility(u) { return u && u.side === 'party' ? abilityOf(this.game, classOf(this.game, u.member).special) : null; }

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
      this.log(`${how} ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}!`, 'loot');
      sfx('gold');
    };
    if (rng.chance(Math.min(0.6, 0.22 + power * 0.04))) {
      const drops = this.game.items.filter((it) => it.type === 'consumable' && it.combat && (it.price || 0) <= 40 + power * 6);
      if (drops.length) give(rng.pick(drops), 'Among the fallen you find');
    }
    if (this.game.settings.loot === false) return;
    const boss = this.killedIds.some((id) => byId(this.game.monsters, id)?.boss);
    if (!boss && !rng.chance(Math.min(0.5, 0.08 + power * 0.03))) return;
    const budget = 40 + power * 30 + (boss ? 400 : 0);
    const gear = this.game.items.filter((it) => ['weapon', 'armor', 'shield'].includes(it.type) && !it.noLoot && !it.unique && (it.price || 0) <= budget && (it.price || 0) >= budget * 0.12);
    if (gear.length) give(rng.weighted(gear, (it) => 1 + (it.price || 0) / 50), boss ? 'The great foe leaves behind' : 'You claim');
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
    payForSpell(m, spell, inv);
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
    const kind = /fire|flame|meteor|ember/i.test(spell.name) ? 'fire' : /frost|ice/i.test(spell.name) ? 'frost' : /drain|dark|shadow/i.test(spell.name) ? 'shadow' : spell.system === 'divine' ? 'holy' : 'arcane';
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
    const power = () => roll(spell.power || '1d6') + bonus;
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
          if (t.side === 'party' && t.member.status === 'dead') break;
          this.heal(t, Math.max(1, power()));
          sfx('heal');
          break;
        case 'cure':
          if (t.side === 'party' && t.member.status === 'poisoned') { t.member.status = 'ok'; this.fx.number(t.x, t.y, 'Cured', 'status', '#9f9'); }
          this.removeStatus(t, 'poisoned');
          this.fx.healFx(t.x, t.y, 0xa0ffa0);
          break;
        case 'revive':
          if (t.side === 'party' && t.dead) await this.revive(t);
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

  async revive(u) {
    const m = u.member;
    m.status = 'ok';
    m.hp = Math.max(1, Math.floor(maxHp(this.game, m) / 3));
    u.dead = false;
    u.st = {};
    const [x, y] = this.freeSpot([u.x, u.y]);
    u.x = x; u.y = y;
    this.view.addEntity(u.id, charLook(this.game, m), x, y, { ring: 0xffd040, facing: [0, -1] });
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
        inv[item.id]--;
        this.heal(target, roll(item.power || '2d8'));
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
    for (let a = 0; a < actions && this.alive(m) && !this.checkEnd(); a++) {
      // a fast monster's second action is a short lunge, not another full charge
      await this.monsterAct(m, a === 0 ? this.movesFor(m) : Math.min(1, this.movesFor(m)), a > 0);
    }
    await this.view.wait(0.05);
  }

  // whom a monster goes for
  pickTarget(m, ai) {
    const foes = this.foesOf(m).filter((p) => !this.has(p, 'hidden'));
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
    const frac = m.hp / m.maxHp;
    const alone = this.friendsOf(m).length === 1;
    if (!def.boss && ((def.fleeAt && frac <= def.fleeAt) || (ai === 'coward' && alone && frac < 0.5))) {
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
    const tgt = this.canAttack(m, target) ? target : this.attackTargets(m).filter((p) => !this.has(p, 'hidden')).sort((a, b) => this.hpOf(a) - this.hpOf(b))[0];
    const post = this.monsterAbility(m, tgt || target, 'post');
    if (post && rng.chance(eager)) { await this.useAbility(m, post.ab, post.target); return; }
    if (tgt) await this.strike(m, tgt);
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
        const spot = this.windupSpot(m, ab);
        if (spot) return { ab, target: spot };
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
    const foes = this.foesOf(m).filter((p) => !this.has(p, 'hidden'));
    if ((ab.range ?? 1) === 0) {
      const n = foes.filter((f) => cheb(f, m) <= (ab.radius ?? 0)).length;
      return n >= (m.def.boss ? 1 : 2) || (n && m.def.boss) ? { x: m.x, y: m.y } : null;
    }
    let best = null, bn = 0;
    const r = ab.radius ?? 0;
    for (const f of foes) {
      if ((ab.range ?? 1) <= 1 ? !this.adjacent(m, f) : cheb(m, f) > ab.range) continue;
      const n = foes.filter((g) => cheb(g, f) <= r).length;
      if (n > bn) { bn = n; best = { x: f.x, y: f.y }; }
    }
    return best;
  }

  async monsterCast(m) {
    const spell = byId(this.game.spells, rng.pick(m.def.spells));
    if (!spell || spell.combat === false) return false;
    let tgt = null;
    if (spell.target === 'enemy' || spell.target === 'area') {
      const inRange = this.foesOf(m).filter((p) => !this.has(p, 'hidden') && this.dist(m, p) <= (spell.range || 6) && this.lineClear(m, p));
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
      m.x = x; m.y = y;
      await this.view.moveEntity(m.id, x, y, speed);
    }
  }

  // Close in for a melee blow; pack hunters look for a flank or a back to bite
  async approach(m, target, steps, ai) {
    if (steps <= 0 || this.adjacent(m, target)) return;
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
      if (s > bs) { bs = s; best = c; }
    }
    if (best && best.d > 0) await this.walkPath(m, this.pathOf(best));
  }

  async flee(m, steps) {
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
