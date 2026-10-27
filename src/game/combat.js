// Tactical battles on a small arena map, Ultima III/IV style:
// each party member acts in turn, then every monster acts.
import { terrain } from '../data/terrain.js';
import { byId } from '../data/schema.js';
import { generateArena, ARENA_W, ARENA_H, bresenham } from '../world/generate.js';
import { getTile, inBounds } from '../world/map.js';
import { rng, roll } from '../core/rng.js';
import { DIR4 } from '../core/util.js';
import { stepToward } from './path.js';
import {
  attackBonus, armorClass, damageRoll, weaponOf, isRanged, critRange, maxHp, maxMp, charLook, hasTrait, hasAbility,
  canCast, payForSpell, spellPower, gainXp, itemOf, partyAlive, knownSpells,
} from './rules.js';
import { sfx } from '../core/sound.js';

const PARTY_SPOTS = [[6, 7], [5, 7], [7, 7], [4, 7], [8, 7], [6, 8], [5, 8], [7, 8]];
const fxHex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

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
    this.acting = false;
    this.xp = 0;
    this.gold = 0;
    this.killedIds = [];
    this.over = false;
  }

  log(t, c) { this.s.log(t, c); }

  // ------------------------------------------------------------ setup
  setup() {
    const lighting = this.s.map?.lighting === 'dark' ? 'dark' : this.s.map?.lighting === 'night' ? 'night' : 'day';
    this.arena = generateArena(this.style, rng.int(1, 1e9), { lighting });
    const v = this.view;
    v.setMap(this.arena);
    v.setVisibilityEnabled(false);
    v.frameArea(0, 0, ARENA_W, ARENA_H, { left: 10, right: 256, top: 76, bottom: 150 });
    v.rig.dist *= 1.6; // settle in from above
    // party
    let i = 0;
    for (const m of this.s.party.members) {
      if (m.status === 'dead') continue;
      const [x, y] = this.freeSpot(PARTY_SPOTS[i++] || [6, 8], 'party');
      const u = { id: 'pu_' + m.id, side: 'party', member: m, name: m.name, x, y, sleep: m.status === 'asleep' ? 2 : 0, fear: 0 };
      m.buffs = [];
      this.units.push(u);
      v.addEntity(u.id, charLook(this.game, m), x, y, { ring: 0xffd040, facing: [0, -1] });
      this.updateBar(u);
    }
    // enemies
    for (const grp of this.enemyList) {
      const def = byId(this.game.monsters, grp.id);
      if (!def) continue;
      for (let k = 0; k < grp.n; k++) {
        const spot = this.enemySpot(def);
        if (!spot) break;
        const hp = Math.max(1, roll(def.hp || '2d8'));
        const u = {
          id: 'en_' + this.units.length, side: 'enemy', def, name: def.name, x: spot[0], y: spot[1],
          hp, maxHp: hp, sleep: 0, fear: 0, buffs: [],
        };
        this.units.push(u);
        v.addEntity(u.id, def.look || { kind: 'blob' }, u.x, u.y, { ring: 0xd03030, facing: [0, 1], scale: def.boss ? 1.15 : 1 });
        this.updateBar(u);
      }
    }
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
      const y = def.swim ? rng.int(0, ARENA_H - 4) : rng.int(0, 2);
      if (this.walkable(x, y, { def })) return [x, y];
    }
    // nowhere suitable (e.g. landlubbers at sea): any free walkable tile, farthest from the party first
    for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < ARENA_W; x++) {
      if (this.walkable(x, y, { def }) || (this.walkable(x, y, null) && !def.swim)) return [x, y];
    }
    return null;
  }

  // ------------------------------------------------------------ queries
  get partyUnits() { return this.units.filter((u) => u.side === 'party'); }
  get enemies() { return this.units.filter((u) => u.side === 'enemy'); }
  alive(u) { return u && !u.dead && !u.fled; }
  hpOf(u) { return u.side === 'party' ? u.member.hp : u.hp; }
  maxHpOf(u) { return u.side === 'party' ? maxHp(this.game, u.member) : u.maxHp; }

  unitAt(x, y) { return this.units.find((u) => this.alive(u) && u.x === x && u.y === y); }

  walkable(x, y, unit) {
    if (!inBounds(this.arena, x, y)) return false;
    const t = terrain(getTile(this.arena, x, y));
    const def = unit && unit.def;
    if (def?.swim) { if (!t.water) return false; }
    else if (!t.walk) { if (!(def?.fly && t.water)) return false; }
    return !this.unitAt(x, y);
  }

  lineClear(a, b) {
    const pts = bresenham(a.x, a.y, b.x, b.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const t = terrain(getTile(this.arena, pts[i][0], pts[i][1]));
      if (t.sight || t.wall) return false;
    }
    return true;
  }

  dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

  acOf(u) {
    if (u.side === 'party') return armorClass(this.game, u.member);
    let ac = u.def.ac || 10;
    for (const b of u.buffs) if (b.kind === 'shield') ac += b.power;
    return ac;
  }

  updateBar(u) {
    if (!this.alive(u)) { this.view.setHpBar(u.id, null); return; }
    this.view.setHpBar(u.id, this.hpOf(u) / this.maxHpOf(u));
  }

  // ------------------------------------------------------------ main loop
  async run() {
    this.setup();
    this.s.ui.combatStart(this);
    await this.s.app.fade(false, 250);
    for (;;) {
      for (const u of this.partyUnits) {
        if (!this.alive(u)) continue;
        if (u.member.status === 'dead') { u.dead = true; continue; }
        const skip = await this.startTurn(u);
        let end = this.checkEnd();
        if (end) return this.finish(end);
        if (skip) continue;
        this.active = u;
        this.view.setRing(u.id, 0xffffff);
        this.s.ui.combatTurn(u);
        await new Promise((res) => { this.pending = res; });
        this.view.setRing(u.id, 0xffd040);
        this.active = null;
        this.s.ui.combatTurn(null);
        end = this.checkEnd();
        if (end) return this.finish(end);
      }
      for (const m of this.enemies) {
        if (!this.alive(m)) continue;
        const skip = await this.startTurn(m);
        let end = this.checkEnd();
        if (end) return this.finish(end);
        if (skip) continue;
        const actions = m.def.speed > 1 ? 2 : 1;
        for (let a = 0; a < actions && this.alive(m); a++) {
          await this.monsterAct(m);
          end = this.checkEnd();
          if (end) return this.finish(end);
        }
        await this.view.wait(0.05);
      }
      this.round++;
    }
  }

  // Returns true if the unit loses its turn
  async startTurn(u) {
    const buffs = u.side === 'party' ? u.member.buffs : u.buffs;
    for (const b of buffs) b.rounds--;
    const keep = buffs.filter((b) => b.rounds > 0);
    buffs.length = 0;
    buffs.push(...keep);
    if (u.side === 'enemy' && u.def.regen && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + u.def.regen);
      this.updateBar(u);
    }
    if (u.side === 'party' && u.member.status === 'poisoned') {
      await this.damage(u, rng.int(1, 2), { quiet: true, color: '#8f8' });
      if (!this.alive(u)) return true;
    }
    if (u.sleep > 0) {
      u.sleep--;
      this.view.floatText(u.x, u.y, 'Zzz', '#aaf');
      if (u.sleep === 0) {
        this.log(`${u.name} wakes up.`);
        if (u.side === 'party') u.member.status = 'ok';
      }
      return true;
    }
    return false;
  }

  checkEnd() {
    if (this.over) return null;
    const foes = this.enemies.some((e) => this.alive(e));
    const friends = this.partyUnits.some((u) => this.alive(u));
    if (!foes) return 'victory';
    if (!friends) return this.partyUnits.some((u) => u.fled) ? 'fled' : 'defeat';
    return null;
  }

  async finish(outcome) {
    this.over = true;
    this.s.ui.combatEnd();
    const members = this.s.party.members;
    for (const m of members) {
      m.buffs = [];
      if (m.status === 'asleep') m.status = 'ok';
    }
    if (outcome === 'victory') {
      sfx('victory');
      const alive = members.filter((m) => m.status !== 'dead');
      // a big company shares the glory, but not so thinly that it stops being fun
      const share = alive.length ? Math.ceil(this.xp / Math.sqrt(alive.length)) : 0;
      this.s.party.gold += this.gold;
      this.log(`Victory! Each survivor gains ${share} experience${this.gold ? `, and you find ${this.gold} gold` : ''}.`, 'good');
      for (const m of alive) {
        const lv = gainXp(this.game, m, share);
        if (lv.length) {
          this.log(`${m.name} is now level ${m.level}!`, 'level');
          sfx('level');
          const u = this.partyUnits.find((pu) => pu.member === m);
          if (u) { this.view.sparkle(u.x, u.y, 0xffe060, 24); this.view.floatText(u.x, u.y, 'LEVEL UP!', '#ffe060', true); }
        }
      }
      if (rng.chance(0.2 + this.killedIds.length * 0.03)) {
        const drops = this.game.items.filter((it) => it.type === 'consumable' && (it.price || 0) <= 50 && it.combat);
        if (drops.length) {
          const it = rng.pick(drops);
          this.s.party.inventory[it.id] = (this.s.party.inventory[it.id] || 0) + 1;
          this.log(`You find a ${it.name} among the fallen.`, 'good');
        }
      }
      await this.view.wait(1.2);
    } else if (outcome === 'fled') {
      this.log('You escape the battle.', 'warn');
      await this.view.wait(0.5);
    } else {
      sfx('defeat');
      this.log('Your party has fallen...', 'bad');
      await this.view.wait(1.5);
    }
    return { outcome, killedIds: this.killedIds };
  }

  // ------------------------------------------------------------ player actions
  async perform(fn) {
    if (!this.active || this.acting || this.over) return false;
    this.acting = true;
    let used = false;
    try { used = await fn(this.active); } finally { this.acting = false; }
    if (used && this.pending) {
      const p = this.pending;
      this.pending = null;
      p();
    }
    return used;
  }

  actMove(dx, dy) {
    return this.perform(async (u) => {
      const nx = u.x + dx, ny = u.y + dy;
      if (!inBounds(this.arena, nx, ny)) {
        u.fled = true;
        this.log(`${u.name} flees the battle!`, 'warn');
        this.view.setHpBar(u.id, null);
        await this.view.moveEntity(u.id, nx, ny, 0.2);
        this.view.removeEntity(u.id);
        return true;
      }
      const other = this.unitAt(nx, ny);
      if (other && other.side === 'enemy') return this.attack(u, other);
      if (other && other.side === 'party') {
        // swap places with an ally
        [other.x, other.y, u.x, u.y] = [u.x, u.y, nx, ny];
        this.view.moveEntity(other.id, other.x, other.y, 0.15);
        await this.view.moveEntity(u.id, u.x, u.y, 0.15);
        return true;
      }
      if (!this.walkable(nx, ny, u)) { sfx('bump'); return false; }
      u.x = nx; u.y = ny;
      sfx('step');
      await this.view.moveEntity(u.id, nx, ny, 0.15);
      return true;
    });
  }

  actAttack(target) {
    return this.perform(async (u) => this.attack(u, target));
  }

  actPass() {
    return this.perform(async (u) => { this.log(`${u.name} waits.`); return true; });
  }

  actCast(spell, target) {
    return this.perform(async (u) => this.castSpell(u, spell, target));
  }

  actUse(item, target) {
    return this.perform(async (u) => this.useItem(u, item, target));
  }

  // can the active unit attack this target?
  canAttack(u, t) {
    if (!t || t.side === u.side || !this.alive(t)) return false;
    const w = weaponOf(this.game, u.member);
    const d = this.dist(u, t);
    if (d <= 1 && Math.abs(u.x - t.x) + Math.abs(u.y - t.y) === 1) return true;
    if (isRanged(w) && d <= (w.range || 1) && this.lineClear(u, t)) return true;
    return false;
  }

  attackTargets(u) { return this.enemies.filter((e) => this.canAttack(u, e)); }

  async attack(u, t) {
    if (!this.canAttack(u, t)) {
      this.log(isRanged(weaponOf(this.game, u.member)) ? 'Out of range or no clear shot.' : 'Too far away — move adjacent to strike.', 'warn');
      sfx('error');
      return false;
    }
    const m = u.member;
    const w = weaponOf(this.game, m);
    this.view.face(u.id, t.x - u.x, t.y - u.y);
    if (isRanged(w) && this.dist(u, t) > 1) {
      await this.view.projectile(u.x, u.y, t.x, t.y, w.wkind === 'sling' ? 0x9a9a9a : 0xe0d0a0, 0.06, 14);
    } else {
      await this.view.attackAnim(u.id, t.x, t.y);
    }
    const d20 = rng.int(1, 20);
    const asleep = t.sleep > 0;
    const crit = d20 >= critRange(this.game, m);
    const hit = asleep || crit || (d20 !== 1 && d20 + attackBonus(this.game, m, w) >= this.acOf(t));
    if (!hit) {
      this.view.floatText(t.x, t.y, 'miss', '#ccc');
      sfx('miss');
      this.log(`${u.name} misses the ${t.name}.`);
      return true;
    }
    let dmg = damageRoll(this.game, m, w);
    if (crit) dmg *= 2;
    if (hasAbility(this.game, m, 'cleave') && t.hp < t.maxHp / 2) dmg += 2;
    if (w.id === 'runeblade' && (t.def.undead || t.def.boss)) dmg += 4;
    sfx(crit ? 'crit' : 'hit');
    this.log(`${u.name} ${crit ? 'critically hits' : 'hits'} the ${t.name} for ${dmg}.`, crit ? 'good' : '');
    await this.damage(t, dmg, { crit, by: u });
    return true;
  }

  async damage(t, dmg, opts = {}) {
    if (!this.alive(t)) return;
    if (t.sleep > 0 && dmg > 0) t.sleep = 0;
    if (t.side === 'party') {
      t.member.hp -= dmg;
      if (t.member.status === 'asleep') t.member.status = 'ok';
    } else t.hp -= dmg;
    this.view.floatText(t.x, t.y, String(dmg), opts.color || (t.side === 'party' ? '#ff6060' : opts.crit ? '#ffd040' : '#ffffff'), !!opts.crit);
    this.view.hurtAnim(t.id);
    this.view.burst(t.x, t.y, opts.burst ?? (t.def?.undead ? 0xe0e0d0 : 0xc02020), opts.crit ? 14 : 7);
    if (opts.crit) this.view.shake(0.12);
    this.updateBar(t);
    if (this.hpOf(t) <= 0) await this.kill(t, opts.by);
    this.s.ui.refresh();
  }

  async kill(t) {
    t.dead = true;
    this.view.setHpBar(t.id, null);
    if (t.side === 'party') {
      t.member.hp = 0;
      t.member.status = 'dead';
      this.log(`${t.name} has fallen!`, 'bad');
      sfx('die');
    } else {
      this.xp += t.def.xp || 0;
      this.gold += Math.max(0, roll(t.def.gold || '0'));
      this.killedIds.push(t.def.id);
      this.log(`The ${t.name} is slain!`, 'good');
      sfx('die');
    }
    await this.view.dieAnim(t.id);
  }

  heal(u, amt) {
    if (u.side !== 'party') { u.hp = Math.min(u.maxHp, u.hp + amt); this.updateBar(u); return; }
    const m = u.member;
    m.hp = Math.min(maxHp(this.game, m), m.hp + amt);
    this.view.floatText(u.x, u.y, '+' + amt, '#70ff90');
    this.view.sparkle(u.x, u.y);
    this.updateBar(u);
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
    if (spell.target === 'enemy' || spell.target === 'area') {
      await this.view.projectile(caster.x, caster.y, target.x, target.y, color, spell.target === 'area' ? 0.2 : 0.13, 10);
      if (spell.target === 'area') {
        for (let dy = -(spell.radius || 1); dy <= (spell.radius || 1); dy++) for (let dx = -(spell.radius || 1); dx <= (spell.radius || 1); dx++) {
          this.view.burst(target.x + dx, target.y + dy, color, 6, { y: 0.2, up: 2.2 });
        }
        this.view.shake(0.15);
      }
    } else if (spell.target === 'allEnemies') {
      this.view.flash(fxHex(color) + '55', 220);
      for (const f of targets) this.view.burst(f.x, f.y, color, 8, { y: 1.2, up: -1, gravity: -12 });
      await this.view.wait(0.3);
    }
    const power = () => roll(spell.power || '1d6') + bonus;
    for (const t of targets) {
      switch (spell.effect) {
        case 'damage': {
          if (spell.undeadOnly && !(t.def?.undead)) continue;
          let dmg = power();
          if (spell.undeadBonus && t.def?.undead) dmg *= 2;
          await this.damage(t, Math.max(1, dmg), { color: fxHex(color), burst: color });
          break;
        }
        case 'drain': {
          const dmg = Math.max(1, power());
          await this.damage(t, dmg, { color: '#80ff90', burst: 0x60ff80 });
          this.heal(caster, Math.ceil(dmg / 2));
          break;
        }
        case 'heal':
          if (t.side === 'party' && t.member.status === 'dead') break;
          this.heal(t, Math.max(1, power()));
          sfx('heal');
          break;
        case 'cure':
          if (t.side === 'party' && t.member.status === 'poisoned') { t.member.status = 'ok'; this.view.floatText(t.x, t.y, 'cured', '#9f9'); }
          this.view.sparkle(t.x, t.y, 0xa0ffa0);
          break;
        case 'revive':
          if (t.side === 'party' && t.dead) await this.revive(t);
          break;
        case 'sleep': {
          const immune = t.def?.sleepImmune || t.def?.undead || (t.side === 'party' && hasTrait(this.game, t.member, 'stout') && rng.chance(0.5));
          if (immune || (spell.chance && !rng.chance(spell.chance))) { this.view.floatText(t.x, t.y, 'resists', '#ccc'); break; }
          t.sleep = parseInt(spell.power, 10) || 2;
          if (t.side === 'party') t.member.status = 'asleep';
          this.view.floatText(t.x, t.y, 'Zzz', '#b0a0ff');
          break;
        }
        case 'fear': {
          if (t.def?.boss || (spell.chance && !rng.chance(spell.chance))) { this.view.floatText(t.x, t.y, 'resists', '#ccc'); break; }
          t.fear = parseInt(spell.power, 10) || 3;
          this.view.floatText(t.x, t.y, 'afraid!', '#d0a0ff');
          break;
        }
        case 'shield': case 'bless': {
          const buffs = t.side === 'party' ? t.member.buffs : t.buffs;
          buffs.push({ kind: spell.effect, power: parseInt(spell.power, 10) || 2, rounds: spell.duration || 6 });
          this.view.sparkle(t.x, t.y, color, 10);
          this.view.floatText(t.x, t.y, spell.effect === 'shield' ? `+${spell.power} AC` : `+${spell.power} hit`, fxHex(color));
          break;
        }
        default:
          break;
      }
    }
    await this.view.wait(0.15);
  }

  async revive(u) {
    const m = u.member;
    m.status = 'ok';
    m.hp = Math.max(1, Math.floor(maxHp(this.game, m) / 3));
    u.dead = false;
    const [x, y] = this.freeSpot([u.x, u.y]);
    u.x = x; u.y = y;
    this.view.addEntity(u.id, charLook(this.game, m), x, y, { ring: 0xffd040, facing: [0, -1] });
    this.view.sparkle(x, y, 0xffffff, 26);
    this.updateBar(u);
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
        this.view.sparkle(target.x, target.y, 0xa0ffa0);
        break;
      case 'mp':
        if (!tm) return false;
        inv[item.id]--;
        tm.mp = Math.min(maxMp(this.game, tm), tm.mp + roll(item.power || '2d6'));
        this.view.sparkle(target.x, target.y, 0x80a0ff);
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
  nearestFoe(m) {
    let best = null, bd = Infinity;
    for (const p of this.partyUnits) {
      if (!this.alive(p)) continue;
      const d = this.dist(m, p) + (p.sleep > 0 ? -0.5 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  async monsterAct(m) {
    const def = m.def;
    const target = this.nearestFoe(m);
    if (!target) return;
    // fear: run away
    if (m.fear > 0) {
      m.fear--;
      await this.stepAway(m, target);
      return;
    }
    // fleeing when badly hurt
    if (def.fleeAt && m.hp / m.maxHp <= def.fleeAt && !def.boss) {
      const edge = [m.x, m.y, ARENA_W - 1 - m.x, ARENA_H - 1 - m.y];
      if (Math.min(...edge) === 0) {
        m.fled = true;
        this.log(`The ${m.name} flees!`);
        this.view.setHpBar(m.id, null);
        this.view.removeEntity(m.id);
        return;
      }
      await this.stepAway(m, target);
      return;
    }
    // spells
    if (def.spells && def.spells.length && rng.chance(def.castChance ?? 0.3)) {
      const spell = byId(this.game.spells, rng.pick(def.spells));
      if (spell && spell.combat !== false) {
        let tgt = null;
        if (spell.target === 'enemy' || spell.target === 'area') {
          const inRange = this.partyUnits.filter((p) => this.alive(p) && this.dist(m, p) <= (spell.range || 6) && this.lineClear(m, p));
          if (inRange.length) tgt = rng.pick(inRange);
        } else tgt = m;
        if (tgt) {
          this.log(`The ${m.name} uses ${spell.name}!`, 'bad');
          sfx(/fire/i.test(spell.name) ? 'fire' : 'spell');
          await this.view.attackAnim(m.id, tgt.x, tgt.y);
          await this.applySpell(m, spell, tgt, Math.floor((def.level || 1) / 2));
          return;
        }
      }
    }
    // ranged
    if ((def.range || 1) > 1) {
      const shots = this.partyUnits.filter((p) => this.alive(p) && this.dist(m, p) <= def.range && this.lineClear(m, p));
      if (shots.length) {
        const t = shots.reduce((a, b) => (this.hpOf(a) <= this.hpOf(b) ? a : b));
        await this.view.projectile(m.x, m.y, t.x, t.y, 0x2a2a2a, 0.06, 14);
        return this.monsterHit(m, t);
      }
    }
    // melee
    const adj = this.partyUnits.filter((p) => this.alive(p) && Math.abs(p.x - m.x) + Math.abs(p.y - m.y) === 1);
    if (adj.length) {
      const t = rng.pick(adj);
      await this.view.attackAnim(m.id, t.x, t.y);
      return this.monsterHit(m, t);
    }
    // approach
    const step = stepToward(m.x, m.y, target.x, target.y, (x, y) => this.walkable(x, y, m), ARENA_W);
    if (step && !(step[0] === target.x && step[1] === target.y) && this.walkable(step[0], step[1], m)) {
      m.x = step[0]; m.y = step[1];
      await this.view.moveEntity(m.id, m.x, m.y, 0.14);
    } else {
      // try any step that gets closer
      let best = null, bd = this.dist(m, target);
      for (const [dx, dy] of DIR4) {
        const nx = m.x + dx, ny = m.y + dy;
        if (!this.walkable(nx, ny, m)) continue;
        const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
        if (d < bd) { bd = d; best = [nx, ny]; }
      }
      if (best) { m.x = best[0]; m.y = best[1]; await this.view.moveEntity(m.id, m.x, m.y, 0.14); }
    }
  }

  async stepAway(m, from) {
    let best = null, bd = this.dist(m, from);
    for (const [dx, dy] of DIR4) {
      const nx = m.x + dx, ny = m.y + dy;
      if (!this.walkable(nx, ny, m)) continue;
      const d = Math.max(Math.abs(nx - from.x), Math.abs(ny - from.y));
      if (d > bd) { bd = d; best = [nx, ny]; }
    }
    if (best) { m.x = best[0]; m.y = best[1]; await this.view.moveEntity(m.id, m.x, m.y, 0.14); }
  }

  async monsterHit(m, t) {
    const def = m.def;
    const mem = t.member;
    const d20 = rng.int(1, 20);
    const luck = hasTrait(this.game, mem, 'lucky') ? 2 : 0;
    const asleep = t.sleep > 0;
    const crit = d20 === 20;
    const hit = asleep || crit || (d20 !== 1 && d20 + (def.hit || 0) - luck >= armorClass(this.game, mem));
    if (!hit) {
      this.view.floatText(t.x, t.y, 'miss', '#ccc');
      sfx('miss');
      this.log(`The ${m.name} misses ${t.name}.`);
      return;
    }
    let dmg = Math.max(1, roll(def.dmg || '1d4'));
    if (crit) dmg *= 2;
    sfx('hurt');
    this.log(`The ${m.name} hits ${t.name} for ${dmg}${crit ? ' — a terrible blow!' : '.'}`, 'bad');
    await this.damage(t, dmg, { crit });
    if (this.alive(t) && def.poison && mem.status === 'ok' && rng.chance(def.poison)) {
      if (hasTrait(this.game, mem, 'poisonResist') && rng.chance(0.6)) this.log(`${t.name} shrugs off the venom.`);
      else {
        mem.status = 'poisoned';
        this.view.floatText(t.x, t.y, 'poisoned', '#80ff80');
        this.log(`${t.name} is poisoned!`, 'bad');
      }
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
}
