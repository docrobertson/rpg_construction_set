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
import { cacheLook } from '../data/containers.js';
import { siteScale } from '../render/landmarks.js';
import { DAY_LEN } from './session.js';
import { carriedMaps, findSpot, isDug } from './treasure.js';
import { getMap } from '../data/schema.js';
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { buyShip, shipBought } from './ships.js';
import { shipDeal } from './dialog.js';
import { leaveCompany, findNpc } from './company.js';

export const EVENT_KINDS = {
  shrine: { label: 'Shrine', icon: '⛩' },
  campfire: { label: 'Campfire', icon: '🔥' },
  lore: { label: 'Lore stone', icon: '🗿' },
  well: { label: 'Well', icon: '⛲' },
  lodge: { label: 'Lodge', icon: '🛖' },
  person: { label: 'Someone', icon: '🧍' },
  creature: { label: 'Creature', icon: '👹' },
  cache: { label: 'Hidden cache', icon: '🎁' },
  farm: { label: 'Farmstead', icon: '🏡', dot: 'farm' },
  arena: { label: 'Fighting pit', icon: '⚔' },
  fortune: { label: 'Fortune-teller', icon: '🔮' },
  fairy: { label: 'Fairy ring', icon: '🍄' },
  lighthouse: { label: 'Lighthouse', icon: '🗼' },
  shipyard: { label: 'Shipyard', icon: '⚓' },
  // the countryside (render/landmarks.js): `dot` is the colour group the
  // maps draw it in, `group` where the Event tool's list files it
  windmill: { label: 'Windmill', icon: '🌾', dot: 'farm', group: 'Farm and mill' },
  watermill: { label: 'Watermill', icon: '⚙', dot: 'farm', group: 'Farm and mill' },
  apiary: { label: 'Beehives', icon: '🐝', dot: 'farm', group: 'Farm and mill' },
  orchard: { label: 'Orchard', icon: '🍎', dot: 'farm', group: 'Farm and mill' },
  shepherd: { label: 'Shepherd\'s fold', icon: '🐑', dot: 'farm', group: 'Farm and mill' },
  chapel: { label: 'Wayside chapel', icon: '⛪', dot: 'shrine', group: 'Old places' },
  circle: { label: 'Stone circle', icon: '🪨', dot: 'lore', group: 'Old places' },
  statue: { label: 'Statue', icon: '👑', dot: 'lore', group: 'Old places' },
  graveyard: { label: 'Graveyard', icon: '🪦', dot: 'ruins', group: 'Old places' },
  bones: { label: 'Dragon bones', icon: '🐉', dot: 'lore', group: 'Old places' },
  tower: { label: 'Watchtower', icon: '🏰', group: 'Out in the wilds' },
  woodcutters: { label: 'Woodcutters\' camp', icon: '🪓', group: 'Out in the wilds' },
  quarry: { label: 'Quarry', icon: '⛏', group: 'Out in the wilds' },
  gallows: { label: 'Gallows', icon: '💀', group: 'Out in the wilds' },
  wreck: { label: 'Shipwreck', icon: '⛵', group: 'Out in the wilds' },
  ruined_mill: { label: 'Ruined windmill', icon: '🏚', dot: 'ruins', group: 'Ruins' },
  ruined_tower: { label: 'Ruined tower', icon: '🏚', dot: 'ruins', group: 'Ruins' },
  ruined_chapel: { label: 'Ruined chapel', icon: '🏚', dot: 'ruins', group: 'Ruins' },
  burnt_farm: { label: 'Burnt farmstead', icon: '🏚', dot: 'ruins', group: 'Ruins' },
  broken_circle: { label: 'Broken stone circle', icon: '🪨', dot: 'ruins', group: 'Ruins' },
  toppled_statue: { label: 'Toppled statue', icon: '🏚', dot: 'ruins', group: 'Ruins' },
  other: { label: 'Something', icon: '❔' },
};

// The colours points of interest wear on the maps, grouped so the key stays
// short: [colour, what the key calls them]
export const EVENT_DOTS = {
  shrine: ['#ffd870', 'Shrine or chapel'],
  campfire: ['#ff8a30', 'Campfire: rest'],
  lore: ['#b0b8ff', 'Lore: old stones and relics'],
  well: ['#60b0ff', 'Well'],
  farm: ['#a8dc60', 'Farm or mill: food'],
  ruins: ['#b4a48e', 'Ruins and graves'],
  other: ['#d0a0ff', 'Something curious'],
};
export const eventDot = (e) => EVENT_KINDS[e.kind]?.dot || (EVENT_DOTS[e.kind] ? e.kind : 'other');

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
  night: 'Only after dark',
  day: 'Only by daylight',
};

// ------------------------------------------------------------ looks
const has = (k) => MODEL_KINDS.includes(k);
// the countryside's landmarks, and the ruins of some of them
const LANDMARK_LOOKS = {
  windmill: { kind: 'windmill' }, watermill: { kind: 'watermill' }, apiary: { kind: 'apiary' }, orchard: { kind: 'orchard' },
  shepherd: { kind: 'sheepfold' }, chapel: { kind: 'chapel' }, circle: { kind: 'stonecircle' }, statue: { kind: 'statue' },
  graveyard: { kind: 'graveyard' }, bones: { kind: 'dragonbones' }, tower: { kind: 'watchtower' }, woodcutters: { kind: 'woodcamp' },
  quarry: { kind: 'quarry' }, gallows: { kind: 'gibbet' }, wreck: { kind: 'wreck' },
  ruined_mill: { kind: 'windmill', ruined: true }, ruined_tower: { kind: 'watchtower', ruined: true }, ruined_chapel: { kind: 'chapel', ruined: true },
  burnt_farm: { kind: 'burntfarm' }, broken_circle: { kind: 'stonecircle', ruined: true }, toppled_statue: { kind: 'statue', ruined: true },
};
// (map: where it stands; a shipyard on a harbour square is drawn by the
// harbour itself, quay, slipway and all, and needs no model of its own)
export function eventLook(e, map = null) {
  if (e.look && e.look.kind) return e.look;
  // (the world map draws a landmark larger by its kind; in a town it is
  // drawn to stand among the houses)
  const l = LANDMARK_LOOKS[e.kind];
  if (l) return !has(l.kind) ? { kind: 'marker', color: 0xc080ff } : map && map.type !== 'world' ? { ...l, scale: siteScale(l.kind) } : { ...l };
  switch (e.kind) {
    case 'shipyard': return map && inBounds(map, e.x, e.y) && terrain(getTile(map, e.x, e.y)).key === 'harbour' ? null : { kind: 'ship', scale: 0.8 };
    case 'shrine': return has('shrine') ? { kind: 'shrine', glow: e.glow ?? 0xffd870 } : { kind: 'waygate', glow: e.glow ?? 0xffd870, scale: 0.7 };
    case 'campfire': return { kind: 'campfire' };
    case 'lore': return has('lorestone') ? { kind: 'lorestone' } : { kind: 'sign', color: 0x8a8c96 };
    case 'well': return has('well') ? { kind: 'well' } : { kind: 'marker', color: 0x50a0ff };
    case 'lodge': return { kind: 'lodge' };
    // (a cache is drawn as what its name or description says: a cart, a loose flagstone…)
    case 'cache': return cacheLook(e) || { kind: 'chest', color: 0x6a5a3a };
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
    // (where the sun never sets or rises — indoors, underground — it is
    // neither: night-only and day-only choices wait for the open sky)
    case 'night': case 'day': {
      if (!session.dayCycleActive?.()) return { ok: false, tag: req.type === 'night' ? 'darkness' : 'daylight' };
      const dark = session.timeOfDay().dark >= 0.5;
      return { ok: req.type === 'night' ? dark : !dark, tag: req.type === 'night' ? 'darkness' : 'daylight' };
    }
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
  if (fx.reset) session.puzzles?.reset?.(fx.reset); // (puzzles) boulders of a group roll back home
  if (fx.fight) res.fight = { monster: fx.fight, count: String(fx.count || '1') };
  // (company) a companion leaves: by their own leaving rule (its text, a fight, where they go)
  if (fx.leave && leaveCompany(session, fx.leave)) got.push(`${findNpc(g, fx.leave)?.npc.name || 'a companion'} leaves the company`);
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

// The countryside: mills and farms that sell food, old places with lore and
// blessings, honest work for strong arms, and ruins with something left in
// them (and sometimes someone). Once-only rewards hide behind a flag named
// for the place itself ({id}), so each mill's strongbox is found only once.
Object.assign(EVENT_TEMPLATES, {
  windmill: {
    kind: 'windmill', name: 'The Windmill', repeat: 'always',
    text: 'Great canvas sails creak round against the sky. The miller, white with flour from his eyebrows to his boots, leans in the doorway. "Grinding\'s good with this wind. And the bread\'s just out of the oven, if you\'ve coin."',
    choices: [
      ch('Buy flour and fresh bread (8 gold)', 'Two warm loaves and a sack of flour, dusted white. "That\'ll see you a fair way. Mind the sack, it leaks."', { food: 25 }, { cost: { gold: 8 } }),
      ch('Hear the miller\'s gossip', '"Wind\'s from the east. Never trust an east wind, my old dad said: it brings rain, tax-men and worse." He taps his floury nose. "And folk say there\'s old gold under the hills hereabouts. Folk say a lot of things."'),
      ch('Climb up to the cap and look about', 'Up the ladders, past the rumbling stones, to the little window under the cap. The country lies spread out below you like a patchwork quilt.', { reveal: 12 }),
      ch('Hump sacks for the miller', '{who} carries sacks up and down the ladders all morning. The miller pays in coin and a loaf still too hot to hold.', { gold: 10, food: 8, xp: 10, flag: '{id}_helped' }, { req: { type: 'stat', value: 'str:13' }, hideFlag: '{id}_helped' }),
      leave('Walk on'),
    ],
  },
  watermill: {
    kind: 'watermill', name: 'The Watermill', repeat: 'daily',
    text: 'The great wheel turns and turns in the mill-race, slapping the water white. Inside, the millstones rumble like faraway thunder, and the miller\'s wife sits shelling peas on the step. "Hungry? There\'s pie."',
    choices: [
      ch('Buy a sack of meal and a pie (8 gold)', '"Eel pie. Don\'t make that face — it\'s the best in the shire."', { food: 25 }, { cost: { gold: 8 } }),
      ch('Fish below the weir', '{who} sits by the weir with a borrowed line. Supper bites!', { food: 10 }, { chance: 0.6, failText: 'Not a nibble. The ducks seem to find this very funny.' }),
      ch('Wash off the road in the mill-pond', 'Cold enough to make you yelp, but you come out scrubbed and lively.', { heal: '1d6' }),
      leave('Walk on'),
    ],
  },
  apiary: {
    kind: 'apiary', name: 'The Bee-wife\'s Hives', repeat: 'daily',
    text: 'Straw skeps hum on a bench among the lavender. A woman in a veil moves between them without hurry, talking to the bees as if they were old friends. "Mind your manners," she says. "They know if you\'re rude."',
    choices: [
      ch('Buy a comb of honey (6 gold)', 'Golden and dripping. You eat half of it before you mean to, and feel all the better for it.', { food: 8, heal: '1d6' }, { cost: { gold: 6 } }),
      ch('Buy a pot of lark\'s honey (40 gold)', '"Gathered where the larks sing. Good for a tired voice, or a tired heart."', { items: [{ id: 'larks_honey', n: 1 }] }, { cost: { gold: 40 } }),
      ch('Tell the bees your news', '{who} leans close to the hives and tells them everything: the road, the dangers, the hopes. The humming changes, softer. "There," says the bee-wife. "Now they\'ll watch over you."', { blessing: 'vigour', turns: 300 }),
      ch('Help yourself to a comb', 'You slip a hand into the nearest skep... and draw out a dripping comb, quite unstung!', { food: 8 }, { chance: 0.3, failText: 'The skep erupts. You run. The bees are faster.', failEffects: { hurt: '1d4' } }),
      leave(),
    ],
  },
  orchard: {
    kind: 'orchard', name: 'Apple Orchard', repeat: 'daily',
    text: 'Gnarled old apple trees stand in rows, heavy with red fruit. A ladder leans in one of them and a basket waits below, but the picker is nowhere to be seen — only a sign: "WINDFALLS FREE. PICKED, THREE COIN THE BASKET. THIEVES, A BOOT UP THE BREECHES."',
    choices: [
      ch('Gather windfalls', 'Bruised but sweet. You fill your pockets.', { food: 6 }),
      ch('Leave three coins and pick a basketful', 'You climb the ladder and pick the best of them, crisp and cold and crunching.', { food: 18, heal: '1d4' }, { cost: { gold: 3 } }),
      ch('Shake the old tree in the middle', 'Apples thump down all around you — and with them a little leather purse that someone hid in the fork of the branches, long ago.', { food: 6, gold: 15, flag: '{id}_shaken' }, { hideFlag: '{id}_shaken' }),
      leave('Walk on'),
    ],
  },
  shepherd: {
    kind: 'shepherd', name: 'Shepherd\'s Fold', repeat: 'always',
    text: 'Sheep crowd a pen of wattle hurdles beside a round stone hut with a turf roof. An old shepherd leans on his crook, his dog at his feet, watching the hills more than the sheep. "Wolves," he says, before you can ask. "Every night this moon. Bold as bailiffs."',
    choices: [
      ch('Ask about the wolves', '"Come down off the high ground after dark, three or four of them, and a big grey one leading. Took two of my ewes Tuesday. I\'d give a fair bit to see them gone."'),
      ch('Keep watch with him through the night', 'You settle down by the fold with your weapons ready. Near midnight, eyes shine at the edge of the firelight...', { fight: 'wolf', count: '3-4' }, {
        req: { type: 'night' }, lockedText: '"Come back at dusk. They never come by daylight."', hideFlag: '{id}_wolves',
        win: { gold: 25, xp: 30, food: 10, flag: '{id}_wolves', items: [{ id: 'shepherds_bell', n: 1 }], text: '"Well, I\'ll be!" The old man presses his own bell into your hand. "Take it. It\'s rung me home through many a fog." And a leg of mutton besides.' },
      }),
      ch('Share his bread and cheese (2 gold)', 'Hard cheese, harder bread, and a tale about a ram called Old Nick that goes on for most of an hour.', { food: 10, heal: '1d4' }, { cost: { gold: 2 } }),
      leave('Walk on'),
    ],
  },
  chapel: {
    kind: 'chapel', name: 'Wayside Chapel', repeat: 'daily',
    text: 'A little chapel of grey stone stands by the way, its bell tower leaning just slightly, as if listening. Inside it is cool and dim and smells of candle-wax. An elderly priest is sweeping the step. "All are welcome. Even the muddy ones."',
    choices: [
      ch('Kneel and pray', 'The quiet settles on you like a cloak. When you rise, you feel steadier.', { blessing: 'ward', turns: 300 }),
      ch('Ask the priest to tend your wounds (15 gold, for the poor box)', 'He washes and binds your hurts with gentle, practised hands, murmuring a blessing over each.', { heal: 'full' }, { cost: { gold: 15 } }),
      ch('Ring the bell', '{who} hauls on the rope. BONG. BONG. Crows burst from every tree for a league around. The priest sighs. "It is meant for feast-days."'),
      leave('Walk on'),
    ],
  },
  circle: {
    kind: 'circle', name: 'Circle of Standing Stones', repeat: 'daily',
    text: 'Nine grey stones stand in a ring, older than anyone remembers, two of them capped with a great lintel. In the middle lies a flat altar-stone, its runes worn almost smooth. The wind does not blow inside the ring.',
    choices: [
      ch('Trace the runes on the altar-stone', 'The runes are a calendar: moons, harvests and the longest night of the year. You copy them carefully.', { lore: true, xp: 15 }),
      ch('Stand in the ring under the stars', 'The stones hum, a sound you feel in your teeth more than hear. Starlight pools on the altar-stone and runs up your arms like cold water. You feel... watched over.', { blessing: 'ward', turns: 400, heal: '2d6' }, { req: { type: 'night' }, lockedText: 'Only under the stars: come back after dark' }),
      ch('Sleep within the ring', 'You lie down on the turf between the stones. You dream of old kings and long roads, and wake strangely rested.', { rest: true }, { chance: 0.75, failText: 'You dream of cold hands and wake with a start, hours later, frost on your blankets. Something walked the ring in the night.', failEffects: { hurt: '1d4' } }),
      leave('Leave the stones be'),
    ],
  },
  statue: {
    kind: 'statue', name: 'Statue of a Forgotten King', repeat: 'daily',
    text: 'A king of old stands on his plinth by the way, crowned and sword in hand, his stone face stern beneath a cap of moss. Coins and flowers lie at his feet. The inscription is half worn away: "...WHO HELD THE FORD..."',
    choices: [
      ch('Scrape the moss off the inscription', '"ALDRED THE STEADFAST, WHO HELD THE FORD AGAINST THE DARK. STAND AS HE STOOD."', { lore: true, xp: 15 }),
      ch('Leave a coin at his feet (1 gold)', 'The old king seems, just for a moment, to nod.', { blessing: 'might', turns: 240 }, { cost: { gold: 1 } }),
      leave('Walk on'),
    ],
  },
  graveyard: {
    kind: 'graveyard', name: 'Old Graveyard', repeat: 'always',
    text: 'Lichened headstones lean this way and that inside a tumbledown wall. Pale lights drift between the graves though it is not yet dark, and the crypt door at the back stands open a hand\'s breadth. It was not open a moment ago.',
    choices: [
      ch('Read the headstones', '"HERE LIES OLD TOM, WHO KEPT THE GATE. HE OPENED IT ONCE, A LITTLE TOO LATE." Most of the rest are worse.', { lore: true, xp: 10 }),
      ch('Look into the crypt', 'You push the door. Bones rattle in the dark — and stand up.', { fight: 'skeleton', count: '2-3' }, {
        hideFlag: '{id}_laid',
        win: { gold: 40, xp: 30, flag: '{id}_laid', items: [{ id: 'healing_draught', n: 1 }], text: 'The dead lie still at last. In the crypt, among the dust, a burial purse and a stoppered phial.' },
      }),
      ch('Leave flowers on the oldest grave', 'You lay wild flowers on a grave so old its name is gone. The pale lights gather round you for a moment, then drift away, content.', { xp: 10, heal: '1d6', flag: '{id}_flowers' }, { hideFlag: '{id}_flowers' }),
      leave('Hurry on'),
    ],
  },
  bones: {
    kind: 'bones', name: 'Dragon Bones', repeat: 'always',
    text: 'The bones of a dragon lie half sunk in the turf, ribs arching higher than a house, one great wing-bone still raised against the sky. Nothing grows near the skull. Even the crows keep a respectful distance — mostly.',
    choices: [
      ch('Study the bones', 'Scorch marks on the ribs, a broken lance-head lodged in the spine. Whoever slew this beast did not walk away from it either. You note it all in your journal.', { lore: true, xp: 25 }),
      ch('Prise loose a dragon\'s tooth', '{who} wrestles a tooth as long as a forearm out of the jaw. Dragon-ivory: any merchant will pay well for that.', { gold: 60, flag: '{id}_tooth' }, { req: { type: 'stat', value: 'str:14' }, hideFlag: '{id}_tooth' }),
      leave('Leave the dead to rest'),
    ],
  },
  tower: {
    kind: 'tower', name: 'Old Watchtower', repeat: 'always',
    text: 'A square tower of grey stone, its beacon smoking on top. A bored watchman sits on the step, whittling a stick into a smaller stick. "Want to see the view? Everyone wants to see the view. Mind the fourth step, it\'s loose."',
    choices: [
      ch('Climb to the beacon', 'Ninety-nine steps (the fourth is loose). From the battlements you can see for leagues in every direction.', { reveal: 18 }),
      ch('Ask what he has seen', '"Smoke, mostly. Riders on the road, too fast to be honest. And once a dragon, but the sergeant says that was a heron."'),
      ch('Share his watch-ration (2 gold)', 'Black bread, a hard sausage and a swig of something that makes your eyes water.', { food: 10 }, { cost: { gold: 2 } }),
      leave('Walk on'),
    ],
  },
  woodcutters: {
    kind: 'woodcutters', name: 'Woodcutters\' Camp', repeat: 'always',
    text: 'Chips fly and an axe rings in the clearing. Logs are stacked by a lean-to, and a turf mound beside it smokes gently: charcoal, slowly cooking. A woodcutter with forearms like hams wipes his brow. "Lost? Hungry? Handy with an axe?"',
    choices: [
      ch('Lend a hand for the day', '{who} swings an axe from dawn to dusk. Your backs ache, but the foreman pays fair, and there is stew.', { gold: 12, food: 8, xp: 15, flag: '{id}_worked' }, { req: { type: 'stat', value: 'str:12' }, hideFlag: '{id}_worked' }),
      ch('Share their stew (2 gold)', 'Rabbit stew, black bread and a long argument about which wood burns best.', { food: 12, heal: '1d6' }, { cost: { gold: 2 } }),
      ch('Ask about the woods', '"Stay on the paths. There\'s a hollow oak to the north they say is lucky, and a bog to the south that\'s anything but. And don\'t whistle after dark."'),
      leave('Walk on'),
    ],
  },
  quarry: {
    kind: 'quarry', name: 'Stone Quarry', repeat: 'always',
    text: 'A raw face of cut grey stone, a wooden crane creaking over it and blocks stacked ready for the carts. The quarry-master, grey with dust from head to foot, eyes your company like stone he might buy. "You lot look like you can lift."',
    choices: [
      ch('Haul stone for the quarry-master', '{who} heaves blocks onto carts until the sun goes down. "Not bad," says the master, and counts out your pay.', { gold: 20, xp: 15, flag: '{id}_hauled' }, { req: { type: 'stat', value: 'str:14' }, hideFlag: '{id}_hauled' }),
      ch('Explore the old workings', 'Behind a rockfall you find a forgotten tunnel... and a forgotten miner\'s pack, with his wages still in it.', { gold: 25, flag: '{id}_delved' }, { hideFlag: '{id}_delved', chance: 0.6, failText: 'Something in the dark squeaks. A lot of somethings.', failEffects: { fight: 'giant_rat', count: '4-6' } }),
      leave('Walk on'),
    ],
  },
  gallows: {
    kind: 'gallows', name: 'Gallows Hill', repeat: 'always',
    text: 'A gibbet creaks on the hilltop where the roads meet, an iron cage swinging from its arm. What is left of its last tenant grins down at you. A notice is nailed to the post: "SO PERISH ALL HIGHWAYMEN. BY ORDER OF THE SHERIFF."',
    choices: [
      ch('Read the notice', 'Beneath the sheriff\'s words someone has scratched: "his gold\'s still in the cage ha ha". Charming.'),
      ch('Climb up and search the cage', '{who} shins up the post and rummages among the bones. Tucked into a boot: a purse of old coins!', { gold: 35, xp: 10, flag: '{id}_searched' }, { hideFlag: '{id}_searched', chance: 0.7, failText: 'The rotten ladder gives way. {who} lands in a heap of nettles, and the crows laugh.', failEffects: { hurt: '1d4' } }),
      leave('Hurry on'),
    ],
  },
  wreck: {
    kind: 'wreck', name: 'Wreck on the Strand', repeat: 'always',
    text: 'A ship lies heeled over on the sand, her ribs bare where the sea has torn the planks away and her mast snapped like a twig. Gulls wheel and scream. Barrels and a sea-chest have washed up beside her.',
    choices: [
      ch('Break open the sea-chest', 'Salt-stained shirts, a rusty cutlass — and at the bottom, a purse of foreign silver.', { gold: 45, items: [{ id: 'antidote', n: 1 }], flag: '{id}_chest' }, { hideFlag: '{id}_chest' }),
      ch('Search the hold', 'You crawl into the dark belly of the wreck and come out with ship\'s biscuit, salt pork and a keg of something.', { food: 20, flag: '{id}_hold' }, { hideFlag: '{id}_hold', chance: 0.6, failText: 'Ship\'s rats! Big ones, and they don\'t care to share.', failEffects: { fight: 'giant_rat', count: '3-5' } }),
      ch('Read the captain\'s log', 'The last entry, in a shaking hand: "Lights on the shore. Not the lighthouse. NOT the lighthouse. They are waving us in." Wreckers.', { lore: true, xp: 15 }),
      leave(),
    ],
  },
  ruined_mill: {
    kind: 'ruined_mill', name: 'Burnt-out Mill', repeat: 'always',
    text: 'The mill is a blackened shell, its sails fallen and broken in the grass, its stones split by the heat. Whoever did this took the flour and left the miller\'s cat, who watches you from the rubble with deep suspicion.',
    choices: [
      ch('Search the ruins', 'Under a fallen beam: the miller\'s strongbox, scorched but shut tight.', { gold: 30, flag: '{id}_searched' }, { hideFlag: '{id}_searched' }),
      ch('Coax the cat out', 'It takes a long while and most of your dried fish. The cat accepts both, then sits on {who}\'s feet and purrs like a millstone.', { xp: 10, flag: '{id}_cat' }, { cost: { food: 3 }, hideFlag: '{id}_cat' }),
      leave('Walk on'),
    ],
  },
  ruined_tower: {
    kind: 'ruined_tower', name: 'Broken Tower', repeat: 'always',
    text: 'Only the lower half of a watchtower still stands, its top broken off like a rotten tooth and its stones tumbled in the grass. The stair inside climbs to a ragged edge, open to the sky.',
    choices: [
      ch('Climb the broken stair', 'You edge up the crumbling steps to the top of what is left. Even half a tower sees a long way.', { reveal: 12 }, { chance: 0.8, failText: 'A step crumbles underfoot, and {who} slides down the whole stair on the seat of their breeches.', failEffects: { hurt: '1d4' } }),
      ch('Dig in the rubble', 'Under the fallen stones, the watch\'s old strongbox, its lock rusted through.', { gold: 25, items: [{ id: 'torch', n: 2 }], flag: '{id}_dug' }, { hideFlag: '{id}_dug' }),
      leave('Walk on'),
    ],
  },
  ruined_chapel: {
    kind: 'ruined_chapel', name: 'Ruined Chapel', repeat: 'always',
    text: 'Roofless walls, an empty gable and a fallen beam across the nave; ivy has taken the rest. Yet a small stone in the nave is carved with fresh-looking runes, and a cold pale light hangs in the air above it, like a held breath.',
    choices: [
      ch('Read the runestone', '"I KEPT THIS HOUSE AND I KEEP IT STILL. LEAVE IT AS YOU FOUND IT."', { lore: true, xp: 15 }),
      ch('Speak to the light', 'The light gathers itself into the shape of a robed figure with empty eyes. Its voice is the creak of the old doors: "THIEVES." It raises its hands...', { fight: 'barrow_wight', count: '1' }, {
        hideFlag: '{id}_ghost',
        win: { gold: 50, xp: 50, flag: '{id}_ghost', items: [{ id: 'votive_candle', n: 2 }], text: 'The figure sighs and thins away to nothing. Where it stood lie two church candles that never quite burn down, and the poor box, still full.' },
      }),
      ch('Pray in the quiet nave', 'The chapel is only a ruin now, but a peaceful one. Something old and kind seems to listen.', { blessing: 'ward', turns: 300 }, { req: { type: 'flag', value: '{id}_ghost' }, lockedText: 'Not while it is haunted' }),
      leave('Leave quietly'),
    ],
  },
  burnt_farm: {
    kind: 'burnt_farm', name: 'Burnt Farmstead', repeat: 'always',
    text: 'The farmhouse is a black shell, its thatch gone to ash and its roof-beams fallen in. Smoke still curls from the ruin. Tracks of iron-shod boots lead away from the yard, and a scrap of red cloth flaps on the broken fence.',
    choices: [
      ch('Call out for survivors', 'A small voice answers from the well. A boy and his grandmother, soot-faced and shaking, hid there all night. You see them safe to the road, and they bless you all the way.', { xp: 30, flag: '{id}_found' }, { hideFlag: '{id}_found' }),
      ch('Search the cellar', 'Under the floor, the family\'s winter store, untouched by the fire.', { food: 20, flag: '{id}_cellar' }, { hideFlag: '{id}_cellar' }),
      ch('Follow the raiders\' tracks', 'The tracks lead to a hollow where the raiders sit round a fire, picking over their plunder.', { fight: 'orc', count: '3' }, {
        hideFlag: '{id}_avenged',
        win: { gold: 40, xp: 40, flag: '{id}_avenged', text: 'You take back what they stole. It will not raise the farm again, but someone will be glad of it.' },
      }),
      leave('Walk on'),
    ],
  },
  broken_circle: {
    kind: 'broken_circle', name: 'Broken Circle', repeat: 'daily',
    text: 'A ring of standing stones, most of them fallen, the rest leaning like drinkers at closing time. Moss has swallowed the altar-stone. Whatever power was here has mostly leaked away... mostly.',
    choices: [
      ch('Lay a hand on the fallen altar', 'For a moment the old power stirs under your palm, and a voice like grinding stone speaks in your head...', { fortune: true }, { chance: 0.5, failText: 'Cold stone, and nothing more. The stones seem to sulk.' }),
      ch('Set a fallen stone upright', '{who} heaves and heaves. Slowly, grinding, the stone rises and settles into its old socket. The whole ring seems to sigh.', { xp: 30, blessing: 'might', turns: 300, flag: '{id}_raised' }, { req: { type: 'stat', value: 'str:15' }, hideFlag: '{id}_raised' }),
      leave('Leave the stones be'),
    ],
  },
  toppled_statue: {
    kind: 'toppled_statue', name: 'Toppled Statue', repeat: 'always',
    text: 'A stone king lies on his back in the grass, broken off at the shins, his feet still standing on the plinth. Someone has drawn a moustache on him in charcoal. His stone eyes regard the clouds with great patience.',
    choices: [
      ch('Read the cracked plinth', '"...THE STEADFAST... HELD THE FORD..." And, in smaller, newer letters: "NOT ANY MORE HE DOESN\'T."', { lore: true, xp: 10 }),
      ch('Heave him over and look underneath', 'Wedged under his stone shoulder, where no one could reach it without a great deal of heaving: a small iron box.', { gold: 35, items: [{ id: 'healing_draught', n: 1 }], flag: '{id}_box' }, { req: { type: 'stat', value: 'str:13' }, hideFlag: '{id}_box' }),
      ch('Wipe off the moustache', 'There. A little dignity restored. You feel oddly better for it.', { xp: 5, flag: '{id}_clean' }, { hideFlag: '{id}_clean' }),
      leave('Walk on'),
    ],
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
  if (fx.leave) out.push('a companion leaves');
  return out.join(', ');
}

