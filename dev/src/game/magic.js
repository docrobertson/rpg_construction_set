// The schools of magic as the player meets them: how each looks and what it
// burns, who in the company can use a reagent or herb, copying spell scrolls
// into a spellbook, and rangers foraging for herbs on the road.
import { MAGIC_SYSTEMS } from '../data/defaults.js';
import { byId } from '../data/schema.js';
import { casting, knownSpells, itemOf, createCharacter, maxHp, maxMp, magicalOf, canEquip, onlyWords } from './rules.js';
import { charmForage } from './charms.js';

const STYLE_ICONS = { book: 'book', prayer: 'sun', song: 'note', runes: 'rune', herbs: 'herb' };

// A school's look, with sensible fallbacks for custom schools made before
// schools had looks: { sys, style, color, icon, resName, verb, items }
export function schoolLook(sys) {
  if (!sys) return null;
  const d = MAGIC_SYSTEMS.find((x) => x.id === sys.id) || {};
  const items = sys.resource === 'reagents';
  const style = sys.style || d.style || (items ? 'runes' : 'book');
  return {
    sys, style, items,
    color: sys.color || d.color || '#c0a0ff',
    icon: sys.icon || d.icon || STYLE_ICONS[style] || 'wand',
    resName: sys.resName || d.resName || (items ? 'Reagents' : 'Mana'),
    verb: sys.verb || d.verb || 'Cast',
  };
}

export function lookOf(game, id) { return schoolLook(byId(game.magic || [], id)); }

// The school a hero casts with first (the one the battle button and the cast
// window are dressed for), and the one whose pool their mana bar shows
export function heroSchool(game, c) { return schoolLook(casting(game, c)[0]?.sys); }
export function manaSchool(game, c) { return schoolLook(casting(game, c).find((ci) => ci.sys.resource === 'mp')?.sys); }

// "Mana", "Faith", "Voice": what this hero's spell points are called
export function poolName(game, c) { return manaSchool(game, c)?.resName || 'Mana'; }

// Does a restoring item (effect 'mp') work for this hero? Each names the
// schools whose pool it refills (item.pool); one that names none (an older
// game's) refills any
export function restoresPool(game, item, c) {
  if (!item?.pool?.length) return true;
  const sch = manaSchool(game, c);
  return !!sch && item.pool.includes(sch.sys.id);
}

// Why a draught, a tonic, a feather or a spell of that effect cannot go to
// this hero (null: it can). One answer for every way of choosing a hero.
export function noNeed(game, effect, c, item = null) {
  if (effect === 'revive') return c.status === 'dead' ? null : 'not fallen';
  if (c.status === 'dead') return 'fallen';
  if (effect === 'heal') return c.hp >= maxHp(game, c) ? 'already at full health' : null;
  if (effect === 'mp') {
    if (maxMp(game, c) <= 0) return item?.pool?.length ? `has no ${poolWords(game, item)}` : 'has no mana';
    if (item && !restoresPool(game, item, c)) return `not for ${poolName(game, c)}`;
    return c.mp >= maxMp(game, c) ? `${poolName(game, c)} already full` : null;
  }
  if (effect === 'cure') return c.status !== 'poisoned' ? 'not poisoned' : null;
  return null;
}

// "mana", "Faith" or "mana or Faith": what a restoring item refills
export function poolWords(game, item) {
  if (!item?.pool?.length) return 'mana';
  return item.pool.map((id) => (game.magic || []).find((m) => m.id === id)?.resName || id).join(' or ');
}

// A talent as this hero sees it: the deeper-pool talent is named for the
// pool they actually draw on (a cleric's Faith, a minstrel's Voice)
const POOL_TALENT = { Mana: 'Deep Well', Faith: 'Deep Faith', Voice: 'Strong Voice' };
export function perkText(game, c, p) {
  if (!p || p.id !== 'arcane') return p;
  const pool = poolName(game, c);
  return { ...p, name: POOL_TALENT[pool] || `Deep ${pool}`, desc: `+4 maximum ${pool.toLowerCase()}.` };
}

// the level at which a caster of this school reaches a spell's circle
function levelFor(ci, sp) { return Math.ceil((2 * (sp.level || 1) - 1) / (ci.rate || 1)); }

// Who in the company can burn a reagent or herb, in plain words:
// { cls: 'yes' | 'later' | 'no', text, users: [{ m, spells }] }
export function reagentUse(game, members, item) {
  const using = (game.spells || []).filter((sp) => (sp.reagents || []).includes(item.id) && byId(game.magic, sp.system)?.enabled !== false);
  if (!using.length) return { cls: 'no', text: '✗ No spell in this realm uses it', users: [] };
  const users = [], later = [];
  for (const m of members) {
    const known = knownSpells(game, m).filter((sp) => using.includes(sp));
    if (known.length) { users.push({ m, spells: known }); continue; }
    let best = null;
    for (const ci of casting(game, m)) for (const sp of using) if (sp.system === ci.sys.id && (!best || levelFor(ci, sp) < best.level)) best = { m, sp, level: levelFor(ci, sp) };
    if (best) later.push(best);
  }
  if (users.length) return { cls: 'yes', users, text: `✓ Used by ${users.map((u) => `${u.m.name}: ${u.spells.map((sp) => sp.name).join(', ')}`).join('; ')}` };
  if (later.length) {
    const l = later.sort((a, b) => a.level - b.level)[0];
    return { cls: 'later', users: [], text: `◔ ${l.m.name} can use it from level ${l.level} (${l.sp.name})` };
  }
  const arts = [...new Set(using.map((sp) => byId(game.magic, sp.system)?.name).filter(Boolean))];
  return { cls: 'no', users: [], text: `✗ No one in your company can use this${arts.length ? ` (${arts.join(', ').toLowerCase()})` : ''}` };
}

// ---------------------------------------------------------------- spellbooks
// Only schools drawn as a spellbook can copy scrolls
export function hasBook(game, c, system) {
  return casting(game, c).some((ci) => ci.sys.id === system && schoolLook(ci.sys).style === 'book');
}

// Can this hero copy the scroll into their book now? { ok, why, spell }
export function canCopy(game, c, item) {
  const sp = byId(game.spells || [], item?.spell);
  if (!sp) return { ok: false, why: 'The writing has faded past reading.' };
  const ci = casting(game, c).find((x) => x.sys.id === sp.system && schoolLook(x.sys).style === 'book');
  if (!ci) return { ok: false, why: `${c.name} keeps no spellbook for ${byId(game.magic, sp.system)?.name || 'this art'}.`, spell: sp };
  if (c.status === 'dead') return { ok: false, why: `${c.name} is dead.`, spell: sp };
  if (knownSpells(game, c).includes(sp) || (c.book || []).includes(sp.id)) return { ok: false, why: `${c.name} already knows ${sp.name}.`, spell: sp, known: true };
  if ((sp.level || 1) > ci.maxSpell) return { ok: false, why: `${sp.name} is beyond ${c.name} until level ${levelFor(ci, sp)}.`, spell: sp, level: levelFor(ci, sp) };
  return { ok: true, spell: sp };
}

export function copyScroll(game, c, item, inv) {
  const can = canCopy(game, c, item);
  if (!can.ok || !(inv[item.id] > 0)) return can.ok ? { ok: false, why: 'The scroll is gone.' } : can;
  c.book = [...(c.book || []), can.spell.id];
  inv[item.id]--;
  return can;
}

// What a scroll is to the company: { cls, text }
export function scrollUse(game, members, item) {
  const sp = byId(game.spells || [], item.spell);
  if (!sp) return { cls: 'no', text: '✗ The writing has faded past reading' };
  const keepers = members.filter((m) => hasBook(game, m, sp.system));
  if (!keepers.length) return { cls: 'no', text: `✗ No one in your company keeps a spellbook for ${byId(game.magic, sp.system)?.name || 'this art'}` };
  const ready = keepers.filter((m) => canCopy(game, m, item).ok);
  if (ready.length) return { cls: 'yes', text: `✓ ${ready.map((m) => m.name).join(', ')} can copy it (circle ${sp.level || 1})` };
  const why = canCopy(game, keepers[0], item);
  return { cls: why.known ? 'no' : 'later', text: `${why.known ? '✗' : '◔'} ${why.why}` };
}

// A short note after a reagent, herb or scroll in a loot line: " (for Thrar)"
export function lootTag(game, members, item) {
  // a charm: who could wear it (or who it is for)
  if (item?.type === 'charm') {
    const who = members.filter((m) => m.status !== 'dead' && canEquip(game, m, item).ok);
    return who.length ? ' (✦ charm)' : ` (✦ charm — ${(item.onlyText || onlyWords(game, item) || 'no one here can wear it').replace(/^Only/, 'only')})`;
  }
  const mg = magicalOf(item);
  if (mg) return ` (✦ magical${mg.notes.length ? ': ' + mg.notes.join(', ') : ''})`;
  if (item?.type === 'reagent') {
    const u = reagentUse(game, members, item);
    return u.cls === 'yes' ? ` (for ${u.users.map((x) => x.m.name).join(', ')})` : u.cls === 'no' ? ' (no use to your company)' : '';
  }
  if (item?.type === 'scroll') {
    const sp = byId(game.spells || [], item.spell);
    const keeper = sp && members.find((m) => hasBook(game, m, sp.system));
    return keeper ? ` (for ${keeper.name}'s spellbook)` : ' (no one can copy it)';
  }
  return '';
}

// ---------------------------------------------------------------- foraging
// Each step through wild country, a hero whose school burns the herbs that
// grow there may find a few. Light: about one find in fifteen steps.
export const FORAGE_CHANCE = 0.07;
export const FORAGE_CAP = 9; // no more of one herb than this in the pack

export function forageFind(game, members, inv, ground, rng) {
  const herbs = (game.items || []).filter((it) => it.type === 'reagent' && (it.forage || []).includes(ground));
  if (!herbs.length) return null;
  for (const m of members) {
    if (m.status === 'dead' || m.status === 'asleep') continue;
    const schools = casting(game, m).map((ci) => ci.sys.id);
    const mine = herbs.filter((it) => (inv[it.id] || 0) < FORAGE_CAP
      && (game.spells || []).some((sp) => schools.includes(sp.system) && (sp.reagents || []).includes(it.id)));
    const forager = (m.perks || []).includes('forager');
    if (!mine.length || !rng.chance(FORAGE_CHANCE * (forager ? 2 : 1) * (1 + charmForage(game, members)))) continue; // (charms) a forager's charm
    const it = rng.pick(mine);
    const n = Math.min(FORAGE_CAP - (inv[it.id] || 0), (rng.chance(0.35) ? 2 : 1) + (forager ? 1 : 0));
    inv[it.id] = (inv[it.id] || 0) + n;
    return { m, item: it, n };
  }
  return null;
}

// how many of the items a hero's reagent school burns are in the pack
export function reagentStock(game, c, inv) {
  const look = heroSchool(game, c);
  if (!look?.items) return null;
  const ids = new Set((game.spells || []).filter((sp) => sp.system === look.sys.id).flatMap((sp) => sp.reagents || []));
  const rows = [...ids].map((id) => ({ item: itemOf(game, id), n: inv[id] || 0 })).filter((r) => r.item);
  return { look, rows, total: rows.reduce((t, r) => t + r.n, 0) };
}

// for the tests and the console
if (typeof window !== 'undefined') window.__magic = { schoolLook, reagentUse, scrollUse, canCopy, copyScroll, forageFind, knownSpells, casting, createCharacter, maxMp };
