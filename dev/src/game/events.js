// Points of interest and little text events with choices: shrines that bless,
// campfires to rest at, lore stones, wishing wells, a troll at the bridge...
//
// Each is a map entity { type: 'event', kind, name, text, look?, repeat, choices }
// where repeat is 'once' (gone after a choice is made), 'daily' or 'always',
// and a choice is { label, req: {type, value}, cost: {gold, item, n}, chance,
// text, effects, failText, failEffects, win, hideFlag, lockedText, leave }.
// A shipyard sells a ship (e.ship, as a shipwright's) through a choice whose
// effects say { ship: true }.
// `win` is a prize paid only if the fight the choice starts is won; a choice
// whose hideFlag is set is no longer offered (a bout already won). In flag
// names {id} stands for the event's own id, so two fighting pits keep apart.
import { byId } from '../data/schema.js';
import { maxHp, maxMp, partyAlive, hasTrait } from './rules.js';
import { applyReward, startQuest, isActive, isDone, checkQuests } from './quests.js';
import { roll, rng } from '../core/rng.js';
import { deepClone } from '../core/util.js';
import { MODEL_KINDS } from '../render/models.js';
import { DAY_LEN } from './session.js';
import { carriedMaps, findSpot, isDug } from './treasure.js';
import { getMap } from '../data/schema.js';
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { buyShip, shipBought } from './ships.js';
import { shipDeal } from './dialog.js';

export const EVENT_KINDS = {
  shrine: { label: 'Shrine', icon: '⛩' },
  campfire: { label: 'Campfire', icon: '🔥' },
  lore: { label: 'Lore stone', icon: '🗿' },
  well: { label: 'Well', icon: '⛲' },
  lodge: { label: 'Lodge', icon: '🛖' },
  person: { label: 'Someone', icon: '🧍' },
  creature: { label: 'Creature', icon: '👹' },
  cache: { label: 'Hidden cache', icon: '🎁' },
  farm: { label: 'Farmstead', icon: '🏡' },
  arena: { label: 'Fighting pit', icon: '⚔' },
  fortune: { label: 'Fortune-teller', icon: '🔮' },
  fairy: { label: 'Fairy ring', icon: '🍄' },
  lighthouse: { label: 'Lighthouse', icon: '🗼' },
  shipyard: { label: 'Shipyard', icon: '⚓' },
  other: { label: 'Something', icon: '❔' },
};

export const BLESSINGS = {
  might: { name: 'Blessing of Might', desc: '+2 to hit in battle', buffs: [{ kind: 'bless', power: 2 }] },
  ward: { name: 'Blessing of Warding', desc: '+2 armour in battle', buffs: [{ kind: 'shield', power: 2 }] },
  vigour: { name: 'Blessing of Vigour', desc: 'Wounds mend as you travel' },
  fortune: { name: 'Fortune\'s Favour', desc: 'Half again as much gold from battles' },
};

export const REQS = {
  none: 'Anyone',
  gold: 'Gold at least',
  item: 'Carrying item',
  flag: 'Story flag set',
  noflag: 'Story flag NOT set',
  class: 'A hero of class',
  race: 'A hero of race',
  stat: 'Best attribute at least (e.g. str:15)',
  quest: 'Quest under way',
  questdone: 'Quest finished',
};

// ------------------------------------------------------------ looks
const has = (k) => MODEL_KINDS.includes(k);
// (map: where it stands; a shipyard on a harbour square is drawn by the
// harbour itself, quay, slipway and all, and needs no model of its own)
export function eventLook(e, map = null) {
  if (e.look && e.look.kind) return e.look;
  switch (e.kind) {
    case 'shipyard': return map && inBounds(map, e.x, e.y) && terrain(getTile(map, e.x, e.y)).key === 'harbour' ? null : { kind: 'ship', scale: 0.8 };
    case 'shrine': return has('shrine') ? { kind: 'shrine', glow: e.glow ?? 0xffd870 } : { kind: 'waygate', glow: e.glow ?? 0xffd870, scale: 0.7 };
    case 'campfire': return { kind: 'campfire' };
    case 'lore': return has('lorestone') ? { kind: 'lorestone' } : { kind: 'sign', color: 0x8a8c96 };
    case 'well': return has('well') ? { kind: 'well' } : { kind: 'marker', color: 0x50a0ff };
    case 'lodge': return { kind: 'lodge' };
    case 'cache': return { kind: 'chest', color: 0x6a5a3a };
    // (the bigger curiosities are drawn larger than their square, like sites)
    case 'farm': return { kind: 'farmstead', scale: 1.4 };
    case 'arena': return { kind: 'arena', scale: 1.5 };
    case 'fortune': return { kind: 'caravan', scale: 1.5 };
    case 'fairy': return { kind: 'fairyring', scale: 1.4 };
    case 'lighthouse': return { kind: 'lighthouse', scale: 1.25 };
    case 'person': return { kind: 'humanoid', race: 'human', body: 0x6a5a3a, hat: 'hood', hatColor: 0x5a4a2a };
    case 'creature': return { kind: 'humanoid', race: 'troll', body: 0x5a4a3a, weapon: 'club' };
    default: return { kind: 'marker', color: 0xc080ff };
  }
}

// ------------------------------------------------------------ availability
export function eventUsedRecently(session, e) {
  const used = session.state.poi?.[e.id];
  if (used == null) return false;
  if (e.repeat === 'daily') return (session.state.turn || 0) - used < (parseInt(e.cooldown, 10) || 300);
  return false;
}

// a flag name with {id} standing for the event's own id
export const flagName = (e, f) => String(f || '').replace(/\{id\}/g, e?.id || '');

export function checkReq(session, req, e = null) {
  if (!req || !req.type || req.type === 'none') return { ok: true };
  const st = session.state, p = st.party, g = session.game;
  const alive = partyAlive(p);
  const v = req.type === 'flag' || req.type === 'noflag' ? flagName(e, req.value) : req.value;
  switch (req.type) {
    case 'gold': return { ok: p.gold >= (parseInt(v, 10) || 0), tag: `◆${parseInt(v, 10) || 0}` };
    case 'item': return { ok: (p.inventory[v] || 0) > 0 || p.members.some((m) => Object.values(m.equip || {}).includes(v)), tag: byId(g.items, v)?.name || v };
    case 'flag': return { ok: !!p.flags[v] };
    case 'noflag': return { ok: !p.flags[v] };
    case 'class': { const who = alive.find((m) => m.cls === v); return { ok: !!who, who, tag: byId(g.classes, v)?.name || v }; }
    case 'race': { const who = alive.find((m) => m.race === v); return { ok: !!who, who, tag: byId(g.races, v)?.name || v }; }
    case 'stat': {
      const [s, n] = String(v || '').split(':');
      const need = parseInt(n, 10) || 0;
      const who = [...alive].sort((a, b) => (b[s] || 0) - (a[s] || 0))[0];
      const names = { str: 'Strength', dex: 'Dexterity', int: 'Intellect', wis: 'Wisdom' };
      return { ok: !!who && (who[s] || 0) >= need, who, tag: `${names[s] || s} ${need}` };
    }
    case 'quest': return { ok: isActive(st, v) };
    case 'questdone': return { ok: isDone(st, v) };
    default: return { ok: true };
  }
}

export function choiceState(session, c, e = null) {
  const r = checkReq(session, c.req, e);
  const p = session.state.party;
  const cg = parseInt(c.cost?.gold, 10) || 0;
  const ci = c.cost?.item, cn = Math.max(1, parseInt(c.cost?.n, 10) || 1);
  let ok = r.ok, why = r.ok ? '' : c.lockedText || (r.tag ? `Needs ${r.tag}` : 'Not possible');
  if (ok && cg && p.gold < cg) { ok = false; why = `Costs ${cg} gold`; }
  if (ok && ci && (p.inventory[ci] || 0) < cn) { ok = false; why = `Needs ${byId(session.game.items, ci)?.name || ci}`; }
  const cf = parseInt(c.cost?.food, 10) || 0;
  if (ok && cf && p.food < cf) { ok = false; why = `Needs ${cf} food`; }
  // a ship is built once, and paid for in full
  if (ok && c.effects?.ship && e) {
    const deal = shipDeal(e);
    if (shipBought(session, e)) { ok = false; why = `The ${deal.name} is yours already`; }
    else if (p.gold < deal.price) { ok = false; why = `Costs ${deal.price} gold`; }
  }
  return { ok, why, tag: r.tag, who: r.who };
}

// The choices on offer just now (a won bout is not fought again)
export function visibleChoices(session, e) {
  const flags = session.state.party.flags;
  return (e.choices || []).filter((c) => !c.hideFlag || !flags[flagName(e, c.hideFlag)]);
}

// ------------------------------------------------------------ resolving
// Make a choice. Returns { text, got: [..], fight?: {monster, count}, remove, leave }
export function resolveChoice(session, e, c) {
  const st = session.state, p = st.party;
  const cs = choiceState(session, c, e);
  if (!cs.ok) return { text: cs.why, got: [], failed: true };
  if (c.leave) return { leave: true, text: c.text || '', got: [] };
  const cg = parseInt(c.cost?.gold, 10) || 0;
  if (cg) p.gold -= cg;
  const cf = parseInt(c.cost?.food, 10) || 0;
  if (cf) p.food = Math.max(0, p.food - cf);
  if (c.cost?.item) p.inventory[c.cost.item] = Math.max(0, (p.inventory[c.cost.item] || 0) - Math.max(1, parseInt(c.cost.n, 10) || 1));
  const chance = c.chance == null || c.chance === '' ? 1 : +c.chance;
  const success = rng.chance(Math.max(0, Math.min(1, chance)));
  const fx = success ? c.effects : c.failEffects;
  const text = fillWho(success ? c.text : (c.failText || 'Nothing happens.'), cs.who, session);
  const res = applyEffects(session, e, fx || {});
  // the prize waits on the fight's outcome
  if (res.fight && success && c.win) res.fight.win = c.win;
  st.poi[e.id] = st.turn || 0;
  res.text = [text, res.vision, res.fairyText, res.shipText].filter(Boolean).join(' ');
  res.success = success && !res.shipFailed;
  res.remove = e.repeat === 'once' || !e.repeat ? fx?.keep !== true : false;
  checkQuests(session);
  return res;
}

function fillWho(text, who, session) {
  return String(text || '').replace(/\{who\}/g, who?.name || session.leader?.name || 'You').replace(/\{leader\}/g, session.leader?.name || 'traveller');
}

export function applyEffects(session, e, fx) {
  const st = session.state, p = st.party, g = session.game;
  // lore pays out the first time it is read, not every time
  const reread = fx.lore && st.lore.some((l) => l.id === e.id);
  const flag = fx.flag ? flagName(e, fx.flag) : undefined;
  const got = applyReward(session, reread ? { flag } : { gold: fx.gold, xp: fx.xp, items: fx.items, food: fx.food, flag });
  const res = { got };
  const lostGold = parseInt(fx.loseGold, 10) || 0;
  if (lostGold) { const n = Math.min(p.gold, lostGold); p.gold -= n; got.push(`lost ${n} gold`); }
  if (fx.heal) {
    for (const m of partyAlive(p)) {
      const mh = maxHp(g, m);
      m.hp = fx.heal === 'full' || fx.heal === true ? mh : Math.min(mh, m.hp + (roll(String(fx.heal)) || 0));
      if (fx.heal === 'full' || fx.heal === true) { m.mp = maxMp(g, m); if (m.status === 'poisoned') m.status = 'ok'; }
    }
    got.push(fx.heal === 'full' || fx.heal === true ? 'the company is fully restored' : 'wounds mend');
    session.view?.sparkle?.(e.x, e.y, 0xa0ffa0, 16);
  }
  if (fx.rest) {
    for (const m of partyAlive(p)) { m.hp = maxHp(g, m); m.mp = maxMp(g, m); }
    // from late afternoon on, the company sleeps through to the next morning;
    // earlier in the day it is a few hours by the fire (the clock must agree)
    const tod = session.dayCycleActive?.() ? session.timeOfDay?.() : null;
    if (tod && tod.t >= 0.45) {
      st.turn = (st.turn || 0) + Math.max(1, Math.round((1 - tod.t) * DAY_LEN));
      got.push(`a safe night's rest: you wake with the sun on day ${tod.day + 1}`);
    } else {
      st.turn = (st.turn || 0) + 60;
      got.push(tod ? 'a few hours\' safe rest' : 'a safe rest');
    }
    session.applyDaylight?.();
    session.checkPhase?.();
  }
  if (fx.hurt) {
    for (const m of partyAlive(p)) session.hurtMember?.(m, Math.max(1, roll(String(fx.hurt)) || 1), 'misfortune');
    got.push('the company is hurt');
  }
  if (fx.poison) {
    for (const m of partyAlive(p)) if (!hasTrait(g, m, 'poisonResist') && rng.chance(0.6)) m.status = 'poisoned';
    got.push('poison!');
  }
  const bid = fx.blessing === 'random' ? rng.pick(Object.keys(BLESSINGS)) : fx.blessing;
  if (bid && BLESSINGS[bid]) {
    const b = BLESSINGS[bid];
    const turns = parseInt(fx.turns, 10) || 300;
    st.blessings = st.blessings.filter((x) => x.id !== bid);
    st.blessings.push({ id: bid, until: (st.turn || 0) + turns });
    got.push(`${b.name} (${b.desc.toLowerCase()})`);
    session.view?.sparkle?.(e.x, e.y, 0xffe080, 24);
  }
  if (fx.lore) {
    if (!st.lore.some((l) => l.id === e.id)) {
      st.lore.push({ id: e.id, title: e.name || 'Lore', text: e.text || '', turn: st.turn || 0 });
      got.push('a new entry in your journal');
    }
  }
  if (fx.reveal) session.reveal?.(parseInt(fx.reveal, 10) || 16);
  if (fx.fortune) { const f = fortuneFor(session, e); res.vision = f.text; if (f.at) session.reveal?.(3, f.at, true); }
  if (fx.fairy) fairyMagic(session, e, fx.fairy === 'kind', res);
  if (fx.quest) startQuest(session, fx.quest);
  if (fx.fight) res.fight = { monster: fx.fight, count: String(fx.count || '1') };
  if (fx.ship) {
    const r = {};
    if (buyShip(session, e, r, { quiet: true })) got.push(r.note);
    else res.shipFailed = true;
    res.shipText = r.text;
  }
  return res;
}

// ------------------------------------------------------------ the fortune-teller
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
export function bearing(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.round(Math.hypot(dx, dy));
  if (d < 2) return 'close by';
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return `${d} leagues to the ${COMPASS[(k + 8) % 8]}`;
}

// What the crystal shows: the hoard on a map the company carries but has not
// dug, else a place on this map not yet found, else a great beast still at
// large. { text, at } (at: where to lift the fog a little)
export function fortuneFor(session, e) {
  const map = session.map, g = session.game;
  const here = { x: e.x, y: e.y };
  const seen = (x, y) => !map.explored || !!map.explored[y * map.w + x];
  for (const it of carriedMaps(session)) {
    const spot = findSpot(g, it.treasure);
    if (!spot || isDug(session, spot.e.id)) continue;
    const near = spot.map.id === map.id ? `, ${bearing(here, spot.e)}` : ` in ${spot.map.name}`;
    return { text: `"The map in your pack is true. I see gold under the earth${near}... and something that does not want you to have it."`, at: spot.map.id === map.id ? spot.e : null };
  }
  const known = new Set(session.state.found?.[map.id] || []);
  const places = (map.entities || []).filter((x) => x !== e && !known.has(x.id) && !seen(x.x, x.y)
    && ((x.type === 'portal' && x.style === 'site') || (x.type === 'event' && x.kind !== 'campfire')));
  const beasts = (map.entities || []).filter((x) => x.type === 'monster' && (x.boss || byId(g.monsters, x.monster)?.boss));
  const pick = places.length && (!beasts.length || rng.chance(0.65)) ? rng.pick(places) : beasts.length ? rng.pick(beasts) : null;
  if (!pick) return { text: '"The mists are empty. You have seen all there is to see, it seems — or the spirits are sulking."' };
  if (pick.type === 'monster') {
    const name = byId(g.monsters, pick.monster)?.name || 'a great beast';
    return { text: `"I see eyes in the dark... ${name}, ${bearing(here, pick)}. It waits for you. Go strong, or go not at all."`, at: pick };
  }
  const name = pick.type === 'portal' ? pick.label || getMap(g, pick.target?.map)?.name || 'a place of power' : eventLabel(pick);
  return { text: `"The mists part... ${name}, ${bearing(here, pick)}. No one has shown you that road. Now I have."`, at: pick };
}

// ------------------------------------------------------------ the fairy ring
// Stepping into the ring: the Fair Folk do as they please. An offering
// (kind) keeps their mischief away.
const FAIRY = [
  ['bless', 3], ['heal', 2], ['xp', 2], ['gold', 2], ['dance', 2], ['whisk', 2], ['leaves', 2], ['food', 1],
];
export function fairyMagic(session, e, kind, res) {
  const p = session.state.party;
  const list = FAIRY.filter(([k]) => !kind || !['leaves', 'food', 'whisk'].includes(k));
  let n = rng.float(0, list.reduce((t, [, w]) => t + w, 0)), what = list[0][0];
  for (const [k, w] of list) { if ((n -= w) < 0) { what = k; break; } }
  const got = res.got;
  const say = (t) => { res.fairyText = t; };
  res.fairy = what;
  switch (what) {
    case 'bless':
      got.push(...applyEffects(session, e, { blessing: 'random', turns: 240 }).got);
      say('Tiny voices sing all around you, and the song settles on your shoulders like a cloak.');
      break;
    case 'heal':
      got.push(...applyEffects(session, e, { heal: 'full' }).got);
      say('The motes of light gather on your hurts and, one by one, put them out.');
      break;
    case 'xp':
      got.push(...applyReward(session, { xp: 30 }));
      say('For a moment you see the land as the Fair Folk see it: every root, every stone, every old war. You come back wiser.');
      break;
    case 'gold':
      got.push(...applyReward(session, { gold: 20 + rng.int(0, 25) }));
      say('Among the toadstools lies a little heap of coins — fairy gold! You bite one. It stays gold.');
      break;
    case 'dance':
      got.push(...applyEffects(session, e, { rest: true }).got);
      say('Pipes play from nowhere, and you dance, and dance... and wake on the grass, rested as never before.');
      break;
    case 'whisk': {
      const to = fairyLanding(session, e);
      if (to) { res.whisk = to; say('The ring spins — or the world does — and the grass beneath your feet is suddenly somewhere else.'); }
      else { got.push(...applyReward(session, { xp: 15 })); say('The ring spins and spins, and sets you down exactly where you started, giggling.'); }
      break;
    }
    case 'leaves': {
      const lost = Math.min(p.gold, 10 + rng.int(0, 15));
      p.gold -= lost;
      got.push(`${lost} gold turned to leaves`);
      say('Laughter in the grass. When you next open your purse, some of your coins have become crumbling oak leaves.');
      break;
    }
    case 'food': {
      const lost = Math.min(p.food, 12);
      p.food -= lost;
      got.push(`${lost} food stolen`);
      say('Something tugs at your packs. When you look, half a loaf, the cheese and all the honey-cakes are gone. Tiny footprints lead nowhere.');
      break;
    }
    default: break;
  }
}

// Where a whisk sets the company down: beside another fairy ring on this
// map, or on open ground some way off
function fairyLanding(session, e) {
  const map = session.map;
  const others = map.entities.filter((x) => x !== e && x.type === 'event' && x.kind === 'fairy');
  const open = (x, y) => {
    if (!inBounds(map, x, y)) return false;
    const t = terrain(getTile(map, x, y));
    return t.walk && !t.water && !t.feature && !t.dmg && !t.door && !map.entities.some((o) => o.x === x && o.y === y);
  };
  const near = (c) => {
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) if (open(c.x + dx, c.y + dy)) return { x: c.x + dx, y: c.y + dy };
    return null;
  };
  if (others.length) { const to = near(rng.pick(others)); if (to) return to; }
  for (let k = 0; k < 40; k++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(8, 16);
    const x = Math.round(e.x + Math.cos(a) * d), y = Math.round(e.y + Math.sin(a) * d);
    if (open(x, y)) return { x, y };
  }
  return null;
}

// ------------------------------------------------------------ blessings in play
export function activeBlessings(session) {
  const st = session.state;
  const t = st.turn || 0;
  if (!Array.isArray(st.blessings)) return [];
  st.blessings = st.blessings.filter((b) => b.until > t && BLESSINGS[b.id]);
  return st.blessings.map((b) => ({ ...b, ...BLESSINGS[b.id], left: b.until - t }));
}

export const hasBlessing = (session, id) => activeBlessings(session).some((b) => b.id === id);

// After every step: blessings fade, vigour mends wounds
export function blessingsTick(session) {
  const before = (session.state.blessings || []).length;
  const act = activeBlessings(session);
  if (act.length < before) session.log('A blessing fades.', 'warn');
  if (act.some((b) => b.id === 'vigour') && (session.state.turn || 0) % 3 === 0) {
    for (const m of partyAlive(session.party)) m.hp = Math.min(maxHp(session.game, m), m.hp + 1);
  }
}

// Battle buffs from blessings: lasts the whole fight
export function blessBattle(session, battle) {
  const buffs = [];
  for (const b of activeBlessings(session)) for (const bf of b.buffs || []) buffs.push({ ...bf, rounds: 999 });
  if (!buffs.length) return;
  for (const u of battle.partyUnits || battle.units?.filter((x) => x.side === 'party') || []) {
    if (u.member?.buffs) u.member.buffs.push(...buffs.map((x) => ({ ...x })));
  }
}

// ------------------------------------------------------------ templates
const ch = (label, text, effects = {}, extra = {}) => ({ label, text, effects, ...extra });
const leave = (label = 'Leave') => ({ label, leave: true });

export const EVENT_TEMPLATES = {
  shrine_might: {
    kind: 'shrine', name: 'Shrine of the Warrior', repeat: 'daily',
    text: 'A weathered statue of a warrior kneels over a stone basin. Fresh flowers lie at its feet, though no one is near.',
    choices: [ch('Kneel and pray', 'Warmth floods your limbs. Your grip on your weapons feels surer.', { blessing: 'might', turns: 300 }), leave('Walk on')],
  },
  shrine_ward: {
    kind: 'shrine', name: 'Shrine of the Shield-Maiden', repeat: 'daily', glow: 0x90c0ff,
    text: 'A pale stone figure holds a round shield before her. The air is still and cool.',
    choices: [ch('Touch the shield', 'A cool calm settles over the company. Blows will glance from you.', { blessing: 'ward', turns: 300 }), leave('Walk on')],
  },
  shrine_vigour: {
    kind: 'shrine', name: 'Spring of the Green Lady', repeat: 'daily', glow: 0x80ffb0,
    text: 'Clear water wells up between mossy stones carved with leaves.',
    choices: [ch('Drink deeply', 'The water is sweet and cold. Your wounds close a little, and keep closing as you walk.', { blessing: 'vigour', turns: 400, heal: '2d6' }), leave('Walk on')],
  },
  shrine_fortune: {
    kind: 'shrine', name: 'Shrine of the Laughing God', repeat: 'daily', glow: 0xffb040,
    text: 'A fat little stone god grins up at you, his belly polished bright by a thousand hopeful hands. A slot in his lap is worn smooth by coins.',
    choices: [ch('Offer a coin and rub his belly', 'The god\'s grin seems to widen. Luck is with you.', { blessing: 'fortune', turns: 300 }, { cost: { gold: 5 } }), leave('Walk on')],
  },
  campfire: {
    kind: 'campfire', name: 'Travellers\' Camp', repeat: 'daily',
    text: 'A ring of stones and a fire that someone has kept burning. Bedrolls lie ready beneath a sheltering tree. Here, at least, you would be safe.',
    choices: [ch('Rest by the fire', 'You stretch out by the fire and sleep soundly, safe at last, and rise whole again.', { rest: true }), leave('Move on')],
  },
  lore: {
    kind: 'lore', name: 'Standing Stone', repeat: 'always',
    text: 'Runes are cut deep into the grey stone: "Here the old kings sleep. Wake them not."',
    choices: [ch('Study the runes', 'You commit the words to memory.', { lore: true, xp: 15 }), leave('Leave it be')],
  },
  well: {
    kind: 'well', name: 'Wishing Well', repeat: 'daily',
    text: 'An old well, its stones green with moss. Coins glint far below. A carved sign reads: "One coin, one wish."',
    choices: [
      ch('Toss in a coin', 'Something glitters as it falls... and a moment later a fat purse floats up on the dark water!', { gold: 40 }, { cost: { gold: 1 }, chance: 0.3, failText: 'Plink. Nothing happens. Perhaps next time.' }),
      ch('Drink the water', 'The water is cold and clean. You feel refreshed.', { heal: '1d8' }, { chance: 0.7, failText: 'Ugh — brackish and foul. Your stomach turns.', failEffects: { poison: true, keep: true } }),
      leave(),
    ],
  },
  lodge: {
    kind: 'lodge', name: 'Hunters\' Lodge', repeat: 'daily',
    text: 'A lodge of rough-cut logs, antlers nailed over the door and smoke curling from the chimney. A hunter is skinning a deer on the step. "Come far? Sit, eat. There\'s plenty."',
    choices: [ch('Share their supper', 'Venison stew and black bread. You leave warm, rested and with a parcel of smoked meat.', { food: 20, heal: '2d6' }), leave('Walk on')],
  },
  traveller: {
    kind: 'person', name: 'Stranded Traveller', repeat: 'once',
    look: { kind: 'humanoid', race: 'human', body: 0x6a5a3a, hat: 'hood', hatColor: 0x5a4a2a },
    text: 'A footsore merchant sits on a broken cart. "Bandits took my mule and my food. Can ye spare anything for an honest man?"',
    choices: [
      ch('Share your food', '"Bless ye! Here — I kept this hidden in my boot." He presses a map into your hands.', { xp: 20, reveal: 18, items: [{ id: 'healing_draught', n: 1 }] }, { cost: { food: 10 } }),
      ch('Give him some coin', '"Ye are true heroes." He gives you a lucky charm before limping away.', { xp: 25, items: [{ id: 'mana_tonic', n: 1 }] }, { cost: { gold: 15 } }),
      leave('Wish him luck'),
    ],
  },
  toll_troll: {
    kind: 'creature', name: 'Toll Troll', repeat: 'once',
    look: { kind: 'humanoid', race: 'troll', body: 0x5a4a3a, weapon: 'club' },
    text: 'A huge troll squats in the road, picking its teeth with a femur. "TOLL!" it booms. "Twenty gold. Or riddle. Or SMASH."',
    choices: [
      ch('Pay the toll', 'The troll bites the coins, grunts, and waddles off the road.', {}, { cost: { gold: 20 } }),
      ch('Answer its riddle', '"What has a bed but never sleeps, a mouth but never eats?" — "A river!" The troll scratches its head, bursts into tears, and stomps off — leaving its toll-pot behind.', { xp: 40, gold: 30 }, { req: { type: 'stat', value: 'int:13' }, chance: 0.85, failText: 'You answer wrongly. "SMASH!"', failEffects: { fight: 'troll', count: '1' } }),
      ch('Fight!', 'You draw steel.', { fight: 'troll', count: '1' }),
      leave('Turn back'),
    ],
  },
  bandits: {
    kind: 'person', name: 'Bandits on the Road', repeat: 'once',
    look: { kind: 'humanoid', race: 'human', body: 0x3a3028, hat: 'hood', hatColor: 0x2a2420, weapon: 'sword' },
    text: 'Hooded figures step out from behind the rocks, blades drawn. "Your purses or your lives, friends. We\'re not fussy which."',
    choices: [
      ch('Hand over the gold', 'They count it twice, laugh, and melt back into the hills.', {}, { cost: { gold: 30 } }),
      ch('Talk them down', '{who} speaks of the Shadow in the east, of homes burned and kin lost. One by one the blades lower. "Go on, then. And... good luck."', { xp: 30 }, { req: { type: 'stat', value: 'wis:14' } }),
      ch('Fight!', 'Steel rings on steel.', { fight: 'bandit', count: '3' }),
    ],
  },
  cache: {
    kind: 'cache', name: 'Hidden Cache', repeat: 'once',
    text: 'Beneath a loose flagstone lies a waxed bundle, left by some long-gone adventurer.',
    choices: [ch('Open it', 'Inside you find gold and a draught wrapped in oilcloth.', { gold: 30, items: [{ id: 'healing_draught', n: 1 }] }), leave('Leave it')],
  },
};

// The fighting pit: five bouts, each fought once and paid once, the champion
// last; then exhibition bouts any time, and a wager on someone else's fight.
const bout = (n, label, monster, count, gold, xp, extra = {}) => ({
  label, text: extra.text || 'The crowd roars as the gate swings open.',
  ...(n > 1 ? { req: { type: 'flag', value: `{id}_bout${n - 1}` }, lockedText: 'Win the bout before it first' } : {}),
  hideFlag: `{id}_bout${n}`, effects: { fight: monster, count },
  win: { gold, xp, flag: `{id}_bout${n}`, ...(extra.items ? { items: extra.items } : {}), text: extra.winText || 'The crowd chants your names. The pit-master counts out your purse.' },
});
export function arenaBouts(champion = 'orc_captain', prize = null) {
  return [
    bout(1, 'Bout one: the rat-pit', 'giant_rat', '5', 25, 15),
    bout(2, 'Bout two: goblin cut-throats', 'goblin', '4', 40, 25),
    bout(3, 'Bout three: the Brothers Blade', 'bandit', '3', 60, 35),
    bout(4, 'Bout four: the beast-master\'s wargs', 'warg', '2', 90, 45),
    bout(5, 'The champion\'s bout', champion, '1', 150, 80, {
      items: prize ? [{ id: prize, n: 1 }] : null,
      text: 'The pit falls silent. The champion steps out, and the crowd begins to stamp.',
      winText: 'The champion falls! The crowd pours into the pit and carries you round it on their shoulders. The pit-master hands over the purse.',
    }),
    { label: 'An exhibition bout', text: 'Three of the pit\'s regulars want a go at the new champions.', req: { type: 'flag', value: '{id}_bout5' }, lockedText: 'Only for the champions of the pit', effects: { fight: 'orc', count: '3' }, win: { gold: 30, text: 'A good show. The crowd throws coins.' } },
    { label: 'Wager on a bout', text: 'You put your money on a scarred old fighter called Mags. She wins in three blows!', cost: { gold: 20 }, chance: 0.45, effects: { gold: 45 }, failText: 'Your fighter goes down in the first exchange. The bookie grins and pockets your coin.' },
  ];
}

Object.assign(EVENT_TEMPLATES, {
  farm: {
    kind: 'farm', name: 'Farmstead', repeat: 'always',
    text: 'A thatched cottage with smoke at its chimney, a kitchen-garden and a cow at the trough. The farmer leans on his gate. "Hungry? There\'s bread and cheese for anyone with coin."',
    choices: [ch('Buy a sack of provisions (12 gold)', '"Bread, cheese, apples and a bit of ham. Mind ye don\'t eat it all at once!"', { food: 30 }, { cost: { gold: 12 } }), leave('Walk on')],
  },
  arena: {
    kind: 'arena', name: 'The Fighting Pit', repeat: 'always',
    text: 'A pit of red sand ringed with timber, the benches above it packed and roaring. A pit-master with a voice like a gong takes names. "Win five bouts and live, and you are champions of the pit!"',
    choices: [...arenaBouts(), leave('Just watch')],
  },
  fortune: {
    kind: 'fortune', name: 'Fortune-teller\'s Caravan', repeat: 'daily',
    text: 'A painted wagon covered in stars, a pony cropping the grass beside it. Under the awning an old woman sits over a crystal ball that glows with its own light. "Cross my palm, dearies, and I\'ll tell you what the road hides."',
    choices: [
      ch('Cross her palm with silver', 'She peers into the crystal. Mist swirls inside it...', { fortune: true }, { cost: { gold: 10 } }),
      ch('Buy a lucky charm', 'She ties a knot of red thread round {who}\'s wrist and mutters over it.', { blessing: 'random', turns: 300 }, { cost: { gold: 30 } }),
      leave('Not today'),
    ],
  },
  fairy_ring: {
    kind: 'fairy', name: 'Fairy Ring', repeat: 'daily',
    text: 'A perfect circle of red-capped toadstools in the grass, the turf inside greener than any around it. Faint lights dance above the ring, and you could swear you hear pipes.',
    choices: [
      ch('Step into the ring', 'You step over the toadstools...', { fairy: 'wild' }),
      ch('Leave an offering of food first', 'You lay honey-cakes by the toadstools and step in, minding your manners...', { fairy: 'kind' }, { cost: { food: 6 } }),
      leave('Leave the Fair Folk to themselves'),
    ],
  },
  lighthouse: {
    kind: 'lighthouse', name: 'Lighthouse', repeat: 'always',
    text: 'A white tower banded with red stands on the rocks, its great lamp turning slowly. The keeper, a whiskery old salt, waves you in. "Climb up, if you\'ve the legs. You can see half the world from the lamp-room."',
    choices: [
      ch('Climb to the lamp-room', 'Two hundred and twelve steps. At the top the whole coast lies spread out below you, and every sail on the sea.', { reveal: 20, lore: true, xp: 20 }),
      ch('Share the keeper\'s supper', 'Fish stew and hard biscuit, and sea-stories until the lamp needs trimming.', { heal: '2d6', food: 10 }, { cost: { gold: 5 } }),
      leave('Back down to the shore'),
    ],
  },
  shipyard: {
    kind: 'shipyard', name: 'Shipyard', repeat: 'always',
    text: 'A slipway runs down into the water, and on it stands a new hull, her oak ribs still pale from the saw. The shipwright wipes the tar from his hands. "Come about a ship? Say the word and my lads will finish her for thee."',
    ship: { name: 'Seahorse', price: 450 },
    choices: [ch('Have a ship built', '', { ship: true }), leave('Walk on')],
  },
});

export function eventFromTemplate(key) {
  const t = EVENT_TEMPLATES[key] || EVENT_TEMPLATES.lore;
  return { type: 'event', ...deepClone(t) };
}

// Name for the hover line and the look command
export function eventLabel(e) {
  return e.name || EVENT_KINDS[e.kind]?.label || 'something curious';
}

// For tests and summaries
export function describeEffects(game, fx) {
  if (!fx) return '';
  const out = [];
  if (fx.gold) out.push(`${fx.gold} gold`);
  if (fx.xp) out.push(`${fx.xp} XP`);
  for (const it of fx.items || []) out.push(byId(game.items, it.id)?.name || it.id);
  if (fx.blessing) out.push(fx.blessing === 'random' ? 'a random blessing' : BLESSINGS[fx.blessing]?.name || fx.blessing);
  if (fx.fortune) out.push('a glimpse of the road ahead');
  if (fx.fairy) out.push('fairy magic');
  if (fx.rest) out.push('rest');
  if (fx.heal) out.push('healing');
  if (fx.fight) out.push(`fight ${byId(game.monsters, fx.fight)?.name || fx.fight}`);
  return out.join(', ');
}

