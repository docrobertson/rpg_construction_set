// Points of interest and little text events with choices: shrines that bless,
// campfires to rest at, lore stones, wishing wells, a troll at the bridge...
//
// Each is a map entity { type: 'event', kind, name, text, look?, repeat, choices }
// where repeat is 'once' (gone after a choice is made), 'daily' or 'always',
// and a choice is { label, req: {type, value}, cost: {gold, item, n}, chance,
// text, effects, failText, failEffects, leave }.
import { byId } from '../data/schema.js';
import { maxHp, maxMp, partyAlive, hasTrait } from './rules.js';
import { applyReward, startQuest, isActive, isDone, checkQuests } from './quests.js';
import { roll, rng } from '../core/rng.js';
import { deepClone } from '../core/util.js';
import { MODEL_KINDS } from '../render/models.js';

export const EVENT_KINDS = {
  shrine: { label: 'Shrine', icon: '⛩' },
  campfire: { label: 'Campfire', icon: '🔥' },
  lore: { label: 'Lore stone', icon: '🗿' },
  well: { label: 'Well', icon: '⛲' },
  person: { label: 'Someone', icon: '🧍' },
  creature: { label: 'Creature', icon: '👹' },
  cache: { label: 'Hidden cache', icon: '🎁' },
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
export function eventLook(e) {
  if (e.look && e.look.kind) return e.look;
  switch (e.kind) {
    case 'shrine': return has('shrine') ? { kind: 'shrine', glow: e.glow ?? 0xffd870 } : { kind: 'waygate', glow: e.glow ?? 0xffd870, scale: 0.7 };
    case 'campfire': return { kind: 'campfire' };
    case 'lore': return has('lorestone') ? { kind: 'lorestone' } : { kind: 'sign', color: 0x8a8c96 };
    case 'well': return has('well') ? { kind: 'well' } : { kind: 'marker', color: 0x50a0ff };
    case 'cache': return { kind: 'chest', color: 0x6a5a3a };
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

export function checkReq(session, req) {
  if (!req || !req.type || req.type === 'none') return { ok: true };
  const st = session.state, p = st.party, g = session.game;
  const alive = partyAlive(p);
  const v = req.value;
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

export function choiceState(session, c) {
  const r = checkReq(session, c.req);
  const p = session.state.party;
  const cg = parseInt(c.cost?.gold, 10) || 0;
  const ci = c.cost?.item, cn = Math.max(1, parseInt(c.cost?.n, 10) || 1);
  let ok = r.ok, why = r.ok ? '' : (r.tag ? `Needs ${r.tag}` : 'Not possible');
  if (ok && cg && p.gold < cg) { ok = false; why = `Costs ${cg} gold`; }
  if (ok && ci && (p.inventory[ci] || 0) < cn) { ok = false; why = `Needs ${byId(session.game.items, ci)?.name || ci}`; }
  const cf = parseInt(c.cost?.food, 10) || 0;
  if (ok && cf && p.food < cf) { ok = false; why = `Needs ${cf} food`; }
  return { ok, why, tag: r.tag, who: r.who };
}

// ------------------------------------------------------------ resolving
// Make a choice. Returns { text, got: [..], fight?: {monster, count}, remove, leave }
export function resolveChoice(session, e, c) {
  const st = session.state, p = st.party;
  const cs = choiceState(session, c);
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
  st.poi[e.id] = st.turn || 0;
  res.text = text;
  res.success = success;
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
  const got = applyReward(session, reread ? { flag: fx.flag } : { gold: fx.gold, xp: fx.xp, items: fx.items, food: fx.food, flag: fx.flag });
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
    st.turn = (st.turn || 0) + 60;
    session.applyDaylight?.();
    got.push('a safe night\'s rest');
  }
  if (fx.hurt) {
    for (const m of partyAlive(p)) session.hurtMember?.(m, Math.max(1, roll(String(fx.hurt)) || 1), 'misfortune');
    got.push('the company is hurt');
  }
  if (fx.poison) {
    for (const m of partyAlive(p)) if (!hasTrait(g, m, 'poisonResist') && rng.chance(0.6)) m.status = 'poisoned';
    got.push('poison!');
  }
  if (fx.blessing && BLESSINGS[fx.blessing]) {
    const b = BLESSINGS[fx.blessing];
    const turns = parseInt(fx.turns, 10) || 300;
    st.blessings = st.blessings.filter((x) => x.id !== fx.blessing);
    st.blessings.push({ id: fx.blessing, until: (st.turn || 0) + turns });
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
  if (fx.quest) startQuest(session, fx.quest);
  if (fx.fight) res.fight = { monster: fx.fight, count: String(fx.count || '1') };
  return res;
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
    choices: [ch('Rest by the fire', 'You sleep deeply and wake with the sun, whole again.', { rest: true }), leave('Move on')],
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
  if (fx.blessing) out.push(BLESSINGS[fx.blessing]?.name || fx.blessing);
  if (fx.rest) out.push('rest');
  if (fx.heal) out.push('healing');
  if (fx.fight) out.push(`fight ${byId(game.monsters, fx.fight)?.name || fx.fight}`);
  return out.join(', ');
}

