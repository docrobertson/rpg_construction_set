// Character rules: creation, derived stats, levelling, equipment and spells.
import { XP_TABLE, MAX_LEVEL, ARMOR_WEIGHTS, STATS, STAT_NAMES, ABILITIES, PERKS, CLASSES, MONSTERS, TALENT_TREES, RARITIES } from '../data/defaults.js';
import { byId } from '../data/schema.js';
import { roll, RNG, hashString } from '../core/rng.js';
import { uid, deepClone } from '../core/util.js';

export const mod = (v) => Math.floor(((v || 10) - 10) / 2);

export function raceOf(game, c) { return byId(game.races, c.race) || game.races[0]; }
export function classOf(game, c) { return byId(game.classes, c.cls) || game.classes[0]; }
export function itemOf(game, id) { return id ? byId(game.items, id) : null; }

// Is a piece of gear enchanted? Marked magical (or given a magic glow) in the
// item's data. Returns { color: '#rrggbb', notes: ['+2 to hit', ...] } or null.
const MAGIC_GOLD = 0xffd56a;
export function magicalOf(it) {
  // charms are magic by nature: their rarity's colour
  if (it?.type === 'charm') return { color: RARITIES[it.rarity]?.color || '#c8b8ff', notes: [], charm: true };
  if (!it || !['weapon', 'armor', 'shield'].includes(it.type)) return null;
  if (it.magical === false || (it.magical !== true && it.glow == null)) return null;
  const notes = [];
  if (it.hit > 0) notes.push(`+${it.hit} to hit`);
  const plus = /\+(\d+)\s*$/.exec(String(it.dmg || ''));
  if (plus) notes.push(`+${plus[1]} damage`);
  return { color: '#' + ((it.glow ?? MAGIC_GOLD) >>> 0).toString(16).padStart(6, '0'), notes };
}

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
    equip: { weapon: null, ranged: null, armor: null, shield: null, charm: null },
    points: 0,
    buffs: [],
    look: look || {},
  };
  for (const s of STATS) c[s] = Math.max(3, (stats?.[s] ?? 10) + (r.mods?.[s] || 0));
  c.hp = maxHp(game, c);
  c.mp = maxMp(game, c);
  return c;
}

// Health grows a little over half the class's "per level" figure each level,
// plus half the Strength bonus: heroes toughen, but a level-6 warrior is no
// longer four times the man he was (the old curve made every fight trivial).
export function maxHp(game, c) {
  const k = classOf(game, c), r = raceOf(game, c);
  const per = Math.ceil((k.hpLevel || 6) * 0.6) + Math.floor(Math.max(-1, mod(c.str)) / 2) + Math.sign(r.hp || 0);
  return Math.max(4, (k.hpBase || 10) + (r.hp || 0) * 2 + mod(c.str) + (c.level - 1) * Math.max(2, per) + perkCount(c, 'tough') * 5 + wornBonus(game, c, 'hp'));
}

// --- talents chosen on levelling up
export function perkCount(c, id) {
  let n = 0;
  for (const p of c.perks || []) if (p === id) n++;
  return n;
}

export function perkOf(id) { return PERKS.find((p) => p.id === id) || null; }

// Which talent tree a class draws from (fighter, archer, healer, caster or
// rogue). Set per class in the construction set; older games guess from the
// class's skills and magic.
export function talentTree(game, c) {
  const k = classOf(game, c);
  if (k.talents && TALENT_TREES[k.talents]) return k.talents;
  const def = CLASSES.find((d) => d.id === k.id);
  if (def?.talents) return def.talents;
  const abs = [...(k.skills || []), k.special].map((id) => abilityOf(game, id)).filter(Boolean);
  if (abs.some((a) => a.heal || a.healPct)) return 'healer';
  if ((k.magic || []).some((m) => (m.rate ?? 1) >= 1)) return 'caster';
  if (abs.some((a) => a.needs === 'ranged')) return 'archer';
  if ((k.abilities || []).includes('backstab')) return 'rogue';
  return 'fighter';
}

// The three talents offered for the next pending level: fixed per hero and
// level so that closing the window and coming back offers the same three.
// Talents from the hero's own tree are three times as likely to come up.
export function perkChoices(game, c) {
  const ok = PERKS.filter((p) => (p.stack || !perkCount(c, p.id))
    && (p.needs !== 'mana' || maxMp(game, c) > 0)
    && (p.needs !== 'magic' || (() => { const ids = casting(game, c).map((ci) => ci.sys.id); return (game.spells || []).some((sp) => ids.includes(sp.system) && (sp.effect === 'damage' || sp.effect === 'drain')); })())
    && (p.needs !== 'reagents' || casting(game, c).some((ci) => ci.sys.resource === 'reagents'))
    && (p.needs !== 'herbs' || knownSpells(game, c).some((sp) => (sp.reagents || []).some((id) => (itemOf(game, id)?.forage || []).length)))
    && (p.needs !== 'heals' || heroAbilities(game, c).some((a) => a.heal || a.healPct) || knownSpells(game, c).some((sp) => sp.effect === 'heal') || casting(game, c).some((ci) => ci.sys.id === 'divine'))
    && (p.needs !== 'ranged' || classOf(game, c).weapons?.some((w) => ['bow', 'crossbow', 'sling'].includes(w))));
  const tree = talentTree(game, c);
  const r = new RNG(hashString(`${c.id}:${c.level}:${(c.perks || []).length}`));
  const pool = [...ok], out = [];
  while (out.length < 3 && pool.length) {
    const p = r.weighted(pool, (x) => ((x.trees || []).includes(tree) ? 3 : 1));
    out.push(p);
    pool.splice(pool.indexOf(p), 1);
  }
  return out;
}

export function choosePerk(game, c, id) {
  if (!(c.perkPending > 0) || !perkOf(id)) return false;
  const oldHp = maxHp(game, c), oldMp = maxMp(game, c);
  c.perks = [...(c.perks || []), id];
  c.perkPending--;
  if (c.status !== 'dead') {
    c.hp = Math.max(1, c.hp + maxHp(game, c) - oldHp);
    c.mp = Math.max(0, c.mp + maxMp(game, c) - oldMp);
  }
  return true;
}

// --- battle abilities (data in game.abilities)
// Games made before abilities existed get the defaults, and their classes and
// monsters the default skills of the same id. Safe to call often.
export function ensureCombatData(game) {
  if (!Array.isArray(game.abilities)) game.abilities = deepClone(ABILITIES);
  for (const k of game.classes || []) {
    if (k.skills === undefined) k.skills = [...(CLASSES.find((d) => d.id === k.id)?.skills || [])];
  }
  for (const m of game.monsters || []) {
    const d = MONSTERS.find((x) => x.id === m.id);
    if (m.abilities === undefined) m.abilities = [...(d?.abilities || [])];
    if (m.ai === undefined && d?.ai) m.ai = d.ai;
  }
  return game.abilities;
}

export function abilityOf(game, id) { return id ? byId(ensureCombatData(game), id) || null : null; }

// A hero's battle abilities: class skills first, then the once-per-battle special
// A new hero starts with one class skill; the rest arrive as they rise, so
// levelling up brings something new to do: the ★ special at level 2, the
// second skill at 3 (and any further ones a level apart after that).
export const SPECIAL_LEVEL = 2;
export function abilityLevel(k, id) {
  if (id === k.special) return SPECIAL_LEVEL;
  const i = (k.skills || []).indexOf(id);
  return i <= 0 ? 1 : 1 + i * 2;
}

// abilities in hand, in class order (all = include those not yet learned);
// what the hero wears may add a battle action of its own (a charm's, or a
// magic staff's), listed after the class skills and before the ★ special
export function heroAbilities(game, c, all = false) {
  const k = classOf(game, c);
  ensureCombatData(game);
  const out = [];
  for (const id of [...(k.skills || []), k.special]) {
    const a = abilityOf(game, id);
    if (a && !out.includes(a) && (all || (c.level || 1) >= abilityLevel(k, id))) out.push(a);
  }
  const worn = wornAbilities(game, c).filter((a) => !out.includes(a));
  if (worn.length) {
    const sp = abilityOf(game, k.special);
    const i = sp ? out.indexOf(sp) : -1;
    out.splice(i >= 0 ? i : out.length, 0, ...worn);
  }
  return out;
}

// what the hero will learn later: [{ ab, level }]
export function lockedAbilities(game, c) {
  const k = classOf(game, c);
  return heroAbilities(game, c, true).filter((a) => !heroAbilities(game, c).includes(a)).map((ab) => ({ ab, level: abilityLevel(k, ab.id) }));
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
  return best > 0 ? best + perkCount(c, 'arcane') * 4 + wornBonus(game, c, 'mp') : 0;
}

// Spells within reach of the caster's power, lowest first; a novice knows
// only two per school, a second-level caster four, then all within reach.
// Scroll-only spells are never learned this way: they must be copied into a
// spellbook (c.book), and come into use once their circle is within reach.
export function knownSpells(game, c) {
  const out = [];
  const cap = (c.level || 1) * 2;
  const book = c.book || [];
  for (const ci of casting(game, c)) {
    const reach = game.spells.filter((sp) => sp.system === ci.sys.id && (sp.level || 1) <= ci.maxSpell);
    const mine = reach.filter((sp) => !sp.scroll).sort((a, b) => (a.level || 1) - (b.level || 1)).slice(0, cap);
    for (const sp of reach) if (book.includes(sp.id) && !mine.includes(sp)) mine.push(sp);
    out.push(...mine.sort((a, b) => (a.level || 1) - (b.level || 1)));
  }
  return out;
}

// what a level brought besides health: newly learned abilities and spells
export function newAtLevel(game, c) {
  const was = { ...c, level: c.level - 1 };
  const abs = heroAbilities(game, c).filter((a) => !heroAbilities(game, was).includes(a)).map((a) => a.name);
  const sps = knownSpells(game, c).filter((sp) => !knownSpells(game, was).includes(sp)).map((sp) => sp.name);
  return [...abs, ...sps];
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
  if ((sp.cost || 0) > c.mp) return { ok: false, why: `Not enough ${(sys.resName || 'mana').toLowerCase()}.` };
  if (sp.reagents && sp.reagents.length) {
    const need = {};
    for (const r of sp.reagents) need[r] = (need[r] || 0) + 1;
    for (const [r, n] of Object.entries(need)) {
      if ((inventory[r] || 0) < n) return { ok: false, why: `Lacking ${itemOf(game, r)?.name || r}.` };
    }
  }
  return { ok: true };
}

// returns true when Thrifty Hands spared the reagents
export function payForSpell(c, sp, inventory) {
  c.mp -= sp.cost || 0;
  if ((sp.reagents || []).length && perkCount(c, 'thrifty') && Math.random() < 1 / 3) return true;
  for (const r of sp.reagents || []) inventory[r] = Math.max(0, (inventory[r] || 0) - 1);
  return false;
}

// --- equipment
// Heroes carry a hand weapon for melee and, separately, a bow, crossbow or
// sling; and one charm (a ring, an amulet, a horn...), whose magic works only
// while it is worn. A charm in the pack sleeps.
export const EQUIP_SLOTS = ['weapon', 'ranged', 'armor', 'shield', 'charm'];
export const SLOT_NAMES = { weapon: 'Weapon', ranged: 'Ranged', armor: 'Armour', shield: 'Shield', charm: 'Charm' };

export function slotFor(item) {
  if (!item) return null;
  if (item.type === 'weapon') return (item.range || 1) > 1 ? 'ranged' : 'weapon';
  if (item.type === 'armor' || item.type === 'shield') return item.type;
  if (item.type === 'charm') return 'charm';
  return null;
}

// Who may wear a piece: its `only` lists races and/or classes (empty = any).
// { ok, why } — why in the item's own words (onlyText) when it has them.
export function wearRule(game, c, it) {
  const races = (it?.only?.races || []).filter(Boolean), classes = (it?.only?.classes || []).filter(Boolean);
  if ((!races.length || races.includes(c.race)) && (!classes.length || classes.includes(c.cls))) return { ok: true };
  return { ok: false, why: `${it.onlyText || onlyWords(game, it)}.` };
}

// "Only a dwarf can wear it", "Only a wizard or a cleric can wear it"
export function onlyWords(game, it) {
  const names = (list, ids) => ids.map((id) => (byId(list || [], id)?.name || id).toLowerCase());
  const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
  const or = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} or ${a[a.length - 1]}` : a[0] || '');
  const races = names(game.races, it?.only?.races || []), classes = names(game.classes, it?.only?.classes || []);
  if (!races.length && !classes.length) return '';
  const who = races.length && classes.length ? `${an(or(races))} ${or(classes)}` : or((races.length ? races : classes).map(an));
  return `Only ${who} can wear it`;
}

export function canEquip(game, c, item) {
  if (!item) return { ok: false, why: 'Nothing to equip.' };
  const rule = wearRule(game, c, item);
  if (!rule.ok) return rule;
  if (item.type === 'charm') return { ok: true, slot: 'charm' };
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
  const was = poolsOf(game, c);
  const old = c.equip[ok.slot];
  if (old) inv[old] = (inv[old] || 0) + 1;
  inv[item.id] = Math.max(0, (inv[item.id] || 0) - 1);
  c.equip[ok.slot] = item.id;
  if (ok.slot === 'weapon' && item.twoHanded && c.equip.shield) {
    inv[c.equip.shield] = (inv[c.equip.shield] || 0) + 1;
    c.equip.shield = null;
  }
  keepPools(game, c, was);
  return ok;
}

// game: when given, health and mana follow a charm of health or mana taken off
export function unequip(c, slot, inv, game = null) {
  const id = c.equip[slot];
  if (!id) return;
  const was = game ? poolsOf(game, c) : null;
  inv[id] = (inv[id] || 0) + 1;
  c.equip[slot] = null;
  if (game) keepPools(game, c, was);
}

// a piece that raises (or lowers) maximum health or mana moves the current
// value with it, as a talent does, so taking it off and on again gains nothing
const poolsOf = (game, c) => ({ hp: maxHp(game, c), mp: maxMp(game, c) });
function keepPools(game, c, was) {
  if (!was || c.status === 'dead' || c.hp == null) return;
  c.hp = Math.max(1, Math.min(maxHp(game, c), c.hp + maxHp(game, c) - was.hp));
  c.mp = Math.max(0, Math.min(maxMp(game, c), (c.mp || 0) + maxMp(game, c) - was.mp));
}

// ---- what a hero wears works for them (charms, and enchanted arms and
// armour with effects of their own; see game/charms.js for the vocabulary)
// The pieces worn whose magic is awake: [{ it, slot }] (a piece its wearer
// may not wear, after the designer changed it, sleeps like one in the pack)
export function wornItems(game, c) {
  const out = [];
  if (!c?.equip) return out;
  for (const slot of EQUIP_SLOTS) {
    const it = itemOf(game, c.equip[slot]);
    if (it && slotFor(it) === slot && wearRule(game, c, it).ok) out.push({ it, slot });
  }
  return out;
}

// every effect worn: [{ e, it, slot }]
export function wornEffects(game, c) {
  const out = [];
  for (const { it, slot } of wornItems(game, c)) for (const e of Array.isArray(it.effects) ? it.effects : []) if (e && e.type) out.push({ e, it, slot });
  return out;
}

// the sum of a steady bonus worn (stat: hit, dmg, ac, moves, init, crit, hp, mp)
export function wornBonus(game, c, stat) {
  if (!c?.equip || !game?.items) return 0;
  let n = 0;
  for (const { e } of wornEffects(game, c)) if (e.type === 'bonus' && e.stat === stat) n += +e.power || 0;
  return n;
}

// A battle action a worn piece grants: its `ability` (the ability schema of
// data/defaults.js) as an ability of its own, id 'item_<item id>', marked with
// the item it comes from. The same object comes back while the data is
// unchanged, so lists of abilities can be compared.
const ITEM_ABILITIES = new WeakMap();
export function itemAbility(it) {
  if (!it || !it.ability || typeof it.ability !== 'object') return null;
  const sig = `${it.id}|${it.name}|${it.icon}|${JSON.stringify(it.ability)}`;
  const had = ITEM_ABILITIES.get(it);
  if (had && had.sig === sig) return had.ab;
  const ab = { icon: it.icon || 'star', target: 'self', fx: it.tint ?? 0xffe080, ...deepClone(it.ability), id: `item_${it.id}`, fromItem: it.id, itemName: it.name };
  ab.name = ab.name || it.name;
  ab.desc = ab.desc || `A power of the ${it.name}.`;
  ITEM_ABILITIES.set(it, { sig, ab });
  return ab;
}

export function wornAbilities(game, c) {
  return wornItems(game, c).map(({ it }) => itemAbility(it)).filter(Boolean);
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
  // (heroes from before charms gain an empty charm slot)
  c.equip = { weapon: null, ranged: null, armor: null, shield: null, charm: null, ...(c.equip || {}) };
  const w = itemOf(game, c.equip.weapon);
  if (w && slotFor(w) === 'ranged') {
    if (!c.equip.ranged) c.equip.ranged = w.id;
    else if (inv) inv[w.id] = (inv[w.id] || 0) + 1;
    c.equip.weapon = null;
  }
  c.points = c.points || 0;
  if (!Array.isArray(c.book)) c.book = []; // spells copied from scrolls
  // heroes from before talents existed get one for every level already gained
  const fresh = !Array.isArray(c.perks);
  c.perks = fresh ? [] : c.perks;
  c.perkPending = c.perkPending || (fresh ? Math.max(0, (c.level || 1) - 1) : 0);
  // health was rebalanced: an older save's hero must not keep more than the new maximum
  if (c.status !== 'dead' && c.hp != null) recompute(game, c);
}

export function weaponOf(game, c) {
  return itemOf(game, c.equip.weapon) || { id: null, name: 'Fists', dmg: '1d2', hit: 0, range: 1, wkind: 'none' };
}

export function rangedOf(game, c) { return itemOf(game, c.equip.ranged); }

export function specialOf(game, c) {
  const key = classOf(game, c).special;
  const a = abilityOf(game, key);
  return a ? { key, ...a } : null;
}

export function isRanged(w) { return (w.range || 1) > 1; }

// Squares a hero may move in one battle turn before attacking or casting:
// nimble heroes (Dexterity 16+) get one more, plate armour costs one.
export function combatMoves(game, c) {
  let n = game.settings.combatMoves ?? 3;
  if ((c.dex || 10) >= 16) n++;
  if (perkCount(c, 'fleet')) n++;
  if (itemOf(game, c.equip?.armor)?.weight === 'plate') n--;
  n += wornBonus(game, c, 'moves');
  return Math.max(1, n);
}

export function buffTotal(c, kind) {
  let t = 0;
  for (const b of c.buffs || []) if (b.kind === kind) t += b.power;
  return t;
}

export function attackBonus(game, c, w = weaponOf(game, c)) {
  const k = classOf(game, c);
  const stat = isRanged(w) || w.wkind === 'dagger' ? c.dex : c.str;
  let b = Math.floor(c.level * (k.hitRate ?? 0.75)) + mod(stat) + (w.hit || 0) + buffTotal(c, 'bless') + perkCount(c, 'precise') + wornBonus(game, c, 'hit');
  if (w.wkind === 'bow' && hasTrait(game, c, 'keenSight')) b += 1;
  return b;
}

export function armorClass(game, c) {
  const a = itemOf(game, c.equip.armor), s = itemOf(game, c.equip.shield);
  let ac = 10 + (a?.ac || 0) + (s?.ac || 0) + mod(c.dex) + buffTotal(c, 'shield') + perkCount(c, 'guard') + wornBonus(game, c, 'ac');
  if (hasAbility(game, c, 'layHands') && c.hp < maxHp(game, c) / 2) ac += 2;
  return ac;
}

export function damageRoll(game, c, w = weaponOf(game, c)) {
  const melee = !isRanged(w);
  return Math.max(1, roll(w.dmg || '1d2') + damageBonus(game, c, w));
}

// the flat part of a weapon's damage (for previews: dice range plus this)
export function damageBonus(game, c, w = weaponOf(game, c)) {
  return (!isRanged(w) ? mod(c.str) + perkCount(c, 'brutal') * 2 : Math.floor(mod(c.dex) / 2) + perkCount(c, 'marksman')) + wornBonus(game, c, 'dmg');
}

// the lowest roll of the die that is a critical hit (never below 15)
export function critRange(game, c) { return Math.max(15, (hasAbility(game, c, 'backstab') ? 18 : 20) - (perkCount(c, 'deadly') ? 1 : 0) - wornBonus(game, c, 'crit')); }

// --- experience
export function xpForLevel(l) { return XP_TABLE[Math.min(l, MAX_LEVEL)] ?? Infinity; }

export function gainXp(game, c, amount) {
  if (c.status === 'dead') return [];
  let a = amount;
  if (hasTrait(game, c, 'versatile')) a = Math.round(a * 1.1);
  // a charm of learning (spoils: xp) worn by this hero
  const keen = wornEffects(game, c).reduce((t, { e }) => t + (e.type === 'spoils' ? +e.xp || 0 : 0), 0);
  if (keen > 0) a = Math.round(a * (1 + Math.min(1, keen)));
  c.xp += a;
  const gained = [];
  while (c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level + 1)) {
    const oldHp = maxHp(game, c), oldMp = maxMp(game, c);
    c.level++;
    // every second level an attribute grows by itself (every level made
    // attributes, and so every hit, grow too fast)
    c.grew = c.level % 2 === 0 ? growStat(game, c) : null;
    // ...and every level a choice of talent
    c.perkPending = (c.perkPending || 0) + 1;
    // (never above the new maximum, whatever the pools held before)
    c.hp = Math.min(maxHp(game, c), c.hp + maxHp(game, c) - oldHp);
    c.mp = Math.min(maxMp(game, c), c.mp + maxMp(game, c) - oldMp);
    gained.push(c.level);
  }
  return gained;
}

// "Helga is now level 3! (a new talent to choose)" — what a level-up brings
export function levelUpNote(c, game = null) {
  const learned = game ? newAtLevel(game, c) : [];
  const grew = c.grew && c.grew.level === c.level ? `${STAT_NAMES[c.grew.stat]} rises to ${c.grew.to}; ` : '';
  return `${c.name} is now level ${c.level}! (${grew}${learned.length ? `learns ${learned.join(', ')}; ` : ''}a new talent to choose)`;
}

export const STAT_MAX = 25;

// One attribute grows: by chance, but the class's chief attributes (its
// primary list, most important first) far more often than the rest, so a
// warrior mostly grows stronger yet now and then wiser. Returns
// { stat, to, level } (kept on the hero for the level-up card).
export function growStat(game, c, rand = Math.random) {
  const prim = classOf(game, c).primary || [];
  const w = STATS.map((st) => (c[st] >= STAT_MAX ? 0 : st === prim[0] ? 5 : st === prim[1] ? 3 : 1));
  const total = w.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let r = rand() * total, i = 0;
  while (r >= w[i]) { r -= w[i]; i++; }
  const stat = STATS[i];
  c[stat]++;
  return { stat, to: c[stat], level: c.level };
}

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
