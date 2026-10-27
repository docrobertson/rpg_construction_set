// Character rules: creation, derived stats, levelling, equipment and spells.
import { XP_TABLE, MAX_LEVEL, ARMOR_WEIGHTS, STATS, CLASS_SPECIALS } from '../data/defaults.js';
import { byId } from '../data/schema.js';
import { roll } from '../core/rng.js';
import { uid } from '../core/util.js';

export const mod = (v) => Math.floor(((v || 10) - 10) / 2);

export function raceOf(game, c) { return byId(game.races, c.race) || game.races[0]; }
export function classOf(game, c) { return byId(game.classes, c.cls) || game.classes[0]; }
export function itemOf(game, id) { return id ? byId(game.items, id) : null; }

export function systemEnabled(game, id) {
  const s = byId(game.magic, id);
  return !!(s && s.enabled);
}

export function classAvailable(game, cls) {
  if (cls.requires && !systemEnabled(game, cls.requires)) return false;
  return true;
}

export function hasTrait(game, c, t) { return (raceOf(game, c).traits || []).includes(t); }
export function hasAbility(game, c, a) { return (classOf(game, c).abilities || []).includes(a); }

export function createCharacter(game, { name, race, cls, stats, look }) {
  const r = byId(game.races, race) || game.races[0];
  const k = byId(game.classes, cls) || game.classes[0];
  const level = Math.max(1, game.settings.startLevel || 1);
  const c = {
    id: uid('pc'),
    name: name || 'Nameless',
    race: r.id,
    cls: k.id,
    level,
    xp: XP_TABLE[level] || 0,
    status: 'ok',
    equip: { weapon: null, ranged: null, armor: null, shield: null },
    points: 0,
    buffs: [],
    look: look || {},
  };
  for (const s of STATS) c[s] = Math.max(3, (stats?.[s] ?? 10) + (r.mods?.[s] || 0));
  c.hp = maxHp(game, c);
  c.mp = maxMp(game, c);
  return c;
}

export function maxHp(game, c) {
  const k = classOf(game, c), r = raceOf(game, c);
  const per = (k.hpLevel || 6) + Math.max(-1, mod(c.str)) + (r.hp || 0);
  return Math.max(4, (k.hpBase || 10) + (r.hp || 0) * 2 + mod(c.str) + (c.level - 1) * Math.max(2, per));
}

// Casting ability per magic system (only enabled systems count)
export function casting(game, c) {
  const k = classOf(game, c);
  const out = [];
  for (const m of k.magic || []) {
    const sys = byId(game.magic, m.system);
    if (!sys || !sys.enabled || sys.monsterOnly) continue;
    const castLevel = Math.floor(c.level * (m.rate ?? 1));
    if (castLevel < 1) continue;
    out.push({ sys, rate: m.rate ?? 1, castLevel, maxSpell: Math.min(5, Math.ceil(castLevel / 2)) });
  }
  return out;
}

export function maxMp(game, c) {
  let best = 0;
  for (const ci of casting(game, c)) {
    if (ci.sys.resource !== 'mp') continue;
    const statMod = Math.max(0, mod(c[ci.sys.stat] || 10));
    best = Math.max(best, Math.floor(3 + ci.castLevel * (2 + statMod * 0.5)));
  }
  return best;
}

export function knownSpells(game, c) {
  const out = [];
  for (const ci of casting(game, c)) {
    for (const sp of game.spells) if (sp.system === ci.sys.id && (sp.level || 1) <= ci.maxSpell) out.push(sp);
  }
  return out;
}

export function spellPower(game, c, sp) {
  const sys = byId(game.magic, sp.system);
  return sys ? Math.max(0, mod(c[sys.stat] || 10)) : 0;
}

export function canCast(game, c, sp, inventory) {
  if (c.status === 'dead') return { ok: false, why: `${c.name} is dead.` };
  if (c.status === 'asleep') return { ok: false, why: `${c.name} is asleep.` };
  const sys = byId(game.magic, sp.system);
  if (!sys || !sys.enabled) return { ok: false, why: 'That magic is unknown in this realm.' };
  if ((sp.cost || 0) > c.mp) return { ok: false, why: 'Not enough mana.' };
  if (sp.reagents && sp.reagents.length) {
    const need = {};
    for (const r of sp.reagents) need[r] = (need[r] || 0) + 1;
    for (const [r, n] of Object.entries(need)) {
      if ((inventory[r] || 0) < n) return { ok: false, why: `Lacking ${itemOf(game, r)?.name || r}.` };
    }
  }
  return { ok: true };
}

export function payForSpell(c, sp, inventory) {
  c.mp -= sp.cost || 0;
  for (const r of sp.reagents || []) inventory[r] = Math.max(0, (inventory[r] || 0) - 1);
}

// --- equipment
// Heroes carry a hand weapon for melee and, separately, a bow, crossbow or sling.
export const EQUIP_SLOTS = ['weapon', 'ranged', 'armor', 'shield'];
export const SLOT_NAMES = { weapon: 'Weapon', ranged: 'Ranged', armor: 'Armour', shield: 'Shield' };

export function slotFor(item) {
  if (!item) return null;
  if (item.type === 'weapon') return (item.range || 1) > 1 ? 'ranged' : 'weapon';
  if (item.type === 'armor' || item.type === 'shield') return item.type;
  return null;
}

export function canEquip(game, c, item) {
  if (!item) return { ok: false, why: 'Nothing to equip.' };
  const k = classOf(game, c);
  if (item.type === 'weapon') {
    if (k.weapons && k.weapons.length && !k.weapons.includes(item.wkind)) return { ok: false, why: `A ${k.name} cannot wield that.` };
    return { ok: true, slot: slotFor(item) };
  }
  if (item.type === 'armor') {
    const max = ARMOR_WEIGHTS.indexOf(k.armor || 'plate');
    if (ARMOR_WEIGHTS.indexOf(item.weight || 'cloth') > max) return { ok: false, why: `A ${k.name} cannot wear such heavy armour.` };
    return { ok: true, slot: 'armor' };
  }
  if (item.type === 'shield') {
    if (!k.shields) return { ok: false, why: `A ${k.name} cannot use a shield.` };
    const w = itemOf(game, c.equip.weapon);
    if (w && w.twoHanded) return { ok: false, why: 'Both hands are busy with the weapon.' };
    return { ok: true, slot: 'shield' };
  }
  return { ok: false, why: 'That cannot be equipped.' };
}

// Equip an item from the pack (inventory counts are updated); returns canEquip's verdict
export function equipItem(game, c, item, inv) {
  const ok = canEquip(game, c, item);
  if (!ok.ok) return ok;
  const old = c.equip[ok.slot];
  if (old) inv[old] = (inv[old] || 0) + 1;
  inv[item.id] = Math.max(0, (inv[item.id] || 0) - 1);
  c.equip[ok.slot] = item.id;
  if (ok.slot === 'weapon' && item.twoHanded && c.equip.shield) {
    inv[c.equip.shield] = (inv[c.equip.shield] || 0) + 1;
    c.equip.shield = null;
  }
  return ok;
}

export function unequip(c, slot, inv) {
  const id = c.equip[slot];
  if (!id) return;
  inv[id] = (inv[id] || 0) + 1;
  c.equip[slot] = null;
}

// Put a class's starting kit on a new hero; anything that doesn't fit goes to the pack
export function equipKit(game, c, ids, inv) {
  for (const id of ids || []) {
    const it = itemOf(game, id);
    if (!it) continue;
    const slot = slotFor(it);
    if (slot && !c.equip[slot]) c.equip[slot] = id;
    else if (inv) inv[id] = (inv[id] || 0) + 1;
  }
}

// Older saves kept bows in the weapon slot and had no attribute points
export function normalizeMember(game, c, inv) {
  c.equip = { weapon: null, ranged: null, armor: null, shield: null, ...(c.equip || {}) };
  const w = itemOf(game, c.equip.weapon);
  if (w && slotFor(w) === 'ranged') {
    if (!c.equip.ranged) c.equip.ranged = w.id;
    else if (inv) inv[w.id] = (inv[w.id] || 0) + 1;
    c.equip.weapon = null;
  }
  c.points = c.points || 0;
}

export function weaponOf(game, c) {
  return itemOf(game, c.equip.weapon) || { id: null, name: 'Fists', dmg: '1d2', hit: 0, range: 1, wkind: 'none' };
}

export function rangedOf(game, c) { return itemOf(game, c.equip.ranged); }

export function specialOf(game, c) {
  const key = classOf(game, c).special;
  return key && CLASS_SPECIALS[key] ? { key, ...CLASS_SPECIALS[key] } : null;
}

export function isRanged(w) { return (w.range || 1) > 1; }

export function buffTotal(c, kind) {
  let t = 0;
  for (const b of c.buffs || []) if (b.kind === kind) t += b.power;
  return t;
}

export function attackBonus(game, c, w = weaponOf(game, c)) {
  const k = classOf(game, c);
  const stat = isRanged(w) || w.wkind === 'dagger' ? c.dex : c.str;
  let b = Math.floor(c.level * (k.hitRate ?? 0.75)) + mod(stat) + (w.hit || 0) + buffTotal(c, 'bless');
  if (w.wkind === 'bow' && hasTrait(game, c, 'keenSight')) b += 1;
  return b;
}

export function armorClass(game, c) {
  const a = itemOf(game, c.equip.armor), s = itemOf(game, c.equip.shield);
  let ac = 10 + (a?.ac || 0) + (s?.ac || 0) + mod(c.dex) + buffTotal(c, 'shield');
  if (hasAbility(game, c, 'layHands') && c.hp < maxHp(game, c) / 2) ac += 2;
  return ac;
}

export function damageRoll(game, c, w = weaponOf(game, c)) {
  const melee = !isRanged(w);
  return Math.max(1, roll(w.dmg || '1d2') + (melee ? mod(c.str) : Math.floor(mod(c.dex) / 2)));
}

export function critRange(game, c) { return hasAbility(game, c, 'backstab') ? 18 : 20; }

// --- experience
export function xpForLevel(l) { return XP_TABLE[Math.min(l, MAX_LEVEL)] ?? Infinity; }

export function gainXp(game, c, amount) {
  if (c.status === 'dead') return [];
  let a = amount;
  if (hasTrait(game, c, 'versatile')) a = Math.round(a * 1.1);
  c.xp += a;
  const gained = [];
  while (c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level + 1)) {
    const oldHp = maxHp(game, c), oldMp = maxMp(game, c);
    c.level++;
    // every level brings an attribute point to spend on the character sheet
    c.points = (c.points || 0) + 1;
    c.hp += maxHp(game, c) - oldHp;
    c.mp += maxMp(game, c) - oldMp;
    gained.push(c.level);
  }
  return gained;
}

export const STAT_MAX = 25;

export function spendPoint(game, c, stat) {
  if (!(c.points > 0) || !STATS.includes(stat) || c[stat] >= STAT_MAX) return false;
  const oldHp = maxHp(game, c), oldMp = maxMp(game, c);
  c[stat]++;
  c.points--;
  if (c.status !== 'dead') {
    c.hp = Math.max(1, c.hp + maxHp(game, c) - oldHp);
    c.mp = Math.max(0, c.mp + maxMp(game, c) - oldMp);
  }
  return true;
}

export function recompute(game, c) {
  c.hp = Math.min(c.hp, maxHp(game, c));
  c.mp = Math.min(c.mp, maxMp(game, c));
}

// --- appearance
export function charLook(game, c) {
  const r = raceOf(game, c), k = classOf(game, c);
  const look = { kind: 'humanoid', ...(r.look || {}), ...(k.look || {}), ...(c.look || {}) };
  look.race = (r.look && r.look.race) || 'human';
  const w = itemOf(game, c.equip?.weapon), rw = itemOf(game, c.equip?.ranged);
  const hand = w || rw;
  if (hand) {
    look.weapon = hand.model || (hand === rw ? 'bow' : 'sword');
    if (hand.glow) look.weaponGlow = hand.glow; else delete look.weaponGlow;
  } else if (c.equip) look.weapon = 'none';
  if (w && rw) look.ranged = rw.model || 'bow'; else delete look.ranged;
  const sh = itemOf(game, c.equip?.shield);
  if (c.equip && !sh) look.shield = null;
  else if (sh && look.shield == null) look.shield = 0x8a6a3a;
  const ar = itemOf(game, c.equip?.armor);
  if (ar && !look.robe) look.armor = ar.weight === 'plate' ? 'plate' : ar.weight === 'chain' ? 'chain' : look.armor === 'plate' || look.armor === 'chain' ? undefined : look.armor;
  return look;
}

export function statusLabel(c) {
  return { ok: 'Good', poisoned: 'Poisoned', asleep: 'Asleep', dead: 'Dead' }[c.status] || c.status;
}

export function partyAlive(party) { return party.members.filter((m) => m.status !== 'dead'); }

export function partyLevel(party) {
  const a = party.members.filter((m) => m.status !== 'dead');
  if (!a.length) return 1;
  return Math.round(a.reduce((s, m) => s + m.level, 0) / a.length);
}
