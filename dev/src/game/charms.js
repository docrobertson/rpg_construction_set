// Charms: rings, amulets, horns, stones and other trinkets a hero wears in
// the charm slot, and enchanted arms and armour with a little magic of their
// own. Their magic is data on the item:
//   effects  [{ type, ...params }] from EFFECT_TYPES below
//   ability  a battle action (the ability schema of data/defaults.js), shown
//            on the battle bar while the piece is worn (rules.js itemAbility)
//   only     { races: [], classes: [] } who may wear it; onlyText says so
//   say      the log line when its battle-start magic fires ({who}: the wearer)
//   rarity, level  where it turns up (shops, hoards, the spoils of battle)
// Only what is worn works: a charm in the pack sleeps. This module answers
// the battle's hooks (session.battleHook) and the world's questions: how fast
// the company walks, what it eats, what it sees, and where it may go.
import { STATUS_EFFECTS, RARITIES, CHARM_KINDS, STAT_NAMES } from '../data/defaults.js';
import { byId } from '../data/schema.js';
import { wornEffects, wornItems, partyAlive, partyLevel, maxMp, onlyWords, itemAbility } from './rules.js';
import { hasLOS } from './los.js';
import { pacesText, treasureState } from './treasure.js';
import { rng, roll } from '../core/rng.js';
import { sfx } from '../core/sound.js';

// ---------------------------------------------------------------- the vocabulary
// Each type: its group (for the editor), name, and the parameters it reads.
export const EFFECT_TYPES = {
  bonus: { group: 'Always', name: 'Steady bonus', params: ['stat', 'power'] },
  resist: { group: 'Battle', name: 'Resists a condition', params: ['status', 'chance', 'who'] },
  onStart: { group: 'Battle', name: 'At the start of a battle', params: ['status', 'power', 'rounds', 'who', 'with'] },
  regen: { group: 'Battle', name: 'Each turn: mends health or mana', params: ['hp', 'mp', 'who'] },
  cleanse: { group: 'Battle', name: 'Each turn: may shake off a bad condition', params: ['chance'] },
  onHit: { group: 'Battle', name: 'A blow struck: a condition on the foe', params: ['status', 'power', 'rounds', 'chance', 'melee', 'ranged'] },
  drain: { group: 'Battle', name: 'A blow struck: drinks some of the damage', params: ['pct'] },
  thorns: { group: 'Battle', name: 'Struck in melee: hurts the attacker', params: ['dmg'] },
  onHurt: { group: 'Battle', name: 'Badly hurt: a condition on the wearer', params: ['status', 'power', 'rounds', 'below'] },
  spoils: { group: 'Battle', name: 'Spoils: more gold, or learns faster', params: ['gold', 'xp'] },
  travel: { group: 'World', name: 'Quicker travel', params: ['pct'] },
  food: { group: 'World', name: 'Eats less', params: ['pct'] },
  prices: { group: 'World', name: 'Better prices', params: ['pct'] },
  sight: { group: 'World', name: 'Sees further, or carries light', params: ['power', 'light'] },
  encounters: { group: 'World', name: 'Fewer wandering monsters', params: ['pct'] },
  forage: { group: 'World', name: 'Better foraging', params: ['pct'] },
  camp: { group: 'World', name: 'Better rest in camp', params: ['pct'] },
  wade: { group: 'New ways', name: 'Walks the shallows', params: [] },
  climb: { group: 'New ways', name: 'Climbs the mountains', params: [] },
  fireWalk: { group: 'New ways', name: 'Walks through fire', params: [] },
  trueSight: { group: 'New ways', name: 'Sees what is hidden', params: [] },
  unseal: { group: 'New ways', name: 'Opens locks and magical seals', params: [] },
  dowse: { group: 'New ways', name: 'Senses buried treasure', params: ['radius'] },
  calm: { group: 'New ways', name: 'Calms the wild beasts', params: [] },
};

// what a steady bonus can raise
export const BONUS_STATS = { hit: 'to hit', dmg: 'damage', ac: 'armour', moves: 'moves in battle', init: 'initiative', crit: 'critical range', hp: 'maximum health', mp: 'maximum mana' };

// A new effect row in the editor gets sensible numbers for its type
export function newEffect(type = 'bonus') {
  switch (type) {
    case 'bonus': return { type, stat: 'ac', power: 1 };
    case 'resist': return { type, status: 'afraid', chance: 1 };
    case 'onStart': return { type, status: 'blessed', power: 2, rounds: 3, who: 'self' };
    case 'regen': return { type, hp: 1, who: 'self' };
    case 'cleanse': return { type, chance: 0.3 };
    case 'onHit': return { type, status: 'slowed', rounds: 2, chance: 0.25 };
    case 'drain': return { type, pct: 0.2 };
    case 'thorns': return { type, dmg: '1d4' };
    case 'onHurt': return { type, status: 'shielded', power: 3, rounds: 2, below: 0.5 };
    case 'spoils': return { type, gold: 0.2 };
    case 'sight': return { type, power: 1, light: 0 };
    case 'dowse': return { type, radius: 5 };
    case 'travel': case 'food': case 'prices': case 'encounters': case 'forage': case 'camp': return { type, pct: 0.15 };
    default: return { type };
  }
}

// what makes a monster a wild beast (a charm of calming soothes it), for
// monsters whose data does not say
const BEASTS = ['giant_rat', 'wolf', 'bat_swarm', 'giant_spider', 'warg', 'bog_lurker', 'giant_crab'];
export const isBeast = (def) => !!def && (def.beast ?? BEASTS.includes(def.id));

// ground a worn charm opens: the terrain key, the effect it needs, the turns a step takes
export const WAYS = {
  shallows: { type: 'wade', cost: 2, verb: 'wade out into the shallows' },
  mountains: { type: 'climb', cost: 3, verb: 'climb into the mountains' },
  peaks: { type: 'climb', cost: 4, verb: 'climb onto the snowy peaks' },
};

// ---------------------------------------------------------------- words
const pct = (n) => `${Math.round((+n || 0) * 100)}%`;
const odds = (c) => (c == null || +c >= 1 ? '' : +c === 0.5 ? 'half the time' : `${Math.round(+c * 10) === +c * 10 ? `${Math.round(+c * 10)} in 10` : pct(c)}`);
const turns = (n) => `${n || 1} turn${(+n || 1) === 1 ? '' : 's'}`;
const RESIST_WORDS = { stunned: 'stuns', asleep: 'sleep', afraid: 'fear', poisoned: 'poison', burning: 'fire', slowed: 'being slowed', rooted: 'being pinned', weakened: 'curses of weakness', taunted: 'taunts' };
const IMMUNE_WORDS = { stunned: 'Cannot be stunned', asleep: 'Cannot be put to sleep', afraid: 'Cannot be frightened', poisoned: 'Immune to poison', burning: 'Cannot be set alight', slowed: 'Cannot be slowed', rooted: 'Cannot be pinned', weakened: 'Cannot be weakened', taunted: 'Cannot be taunted' };
const DEFAULT_POWER = { blessed: 2, shielded: 2, hasted: 1, poisoned: 2 };

// "blessed (+2 to hit)", "shielded (+3 armour)", "hasted (+1 square)"
function statusWords(id, power) {
  const p = +power || DEFAULT_POWER[id] || 0;
  const name = (STATUS_EFFECTS[id]?.name || id).toLowerCase();
  if (id === 'blessed') return `${name} (+${p} to hit)`;
  if (id === 'shielded') return `${name} (+${p} armour)`;
  if (id === 'hasted') return `${name} (+${p} square${p === 1 ? '' : 's'} of movement)`;
  if (id === 'poisoned') return `${name} (${p} a turn)`;
  if (id === 'enraged') return `${name} (+2 to hit, a quarter more damage)`;
  if (id === 'hidden') return 'hidden from foes';
  if (id === 'warded') return 'warded (the next curse slides off)';
  return name;
}

// One effect in plain words, for tooltips, the shop and the hero sheet
export function effectText(game, e) {
  if (!e?.type) return '';
  const party = e.who === 'party';
  switch (e.type) {
    case 'bonus': {
      const n = +e.power || 0, sign = n >= 0 ? '+' : '−', a = Math.abs(n);
      if (e.stat === 'crit') return `Critical hits on ${a === 1 ? 'one more number' : `${a} more numbers`} of the die`;
      if (e.stat === 'moves') return `${sign}${a} square${a === 1 ? '' : 's'} of movement in battle`;
      return `${sign}${a} ${BONUS_STATS[e.stat] || e.stat}`;
    }
    case 'resist': {
      const sure = e.chance == null || +e.chance >= 1;
      if (party) return sure ? `The whole company: ${(IMMUNE_WORDS[e.status] || `immune to ${e.status}`).toLowerCase()}` : `The whole company resists ${RESIST_WORDS[e.status] || e.status} (${odds(e.chance)})`;
      return sure ? IMMUNE_WORDS[e.status] || `Immune to ${e.status}` : `Resists ${RESIST_WORDS[e.status] || e.status} (${odds(e.chance)})`;
    }
    case 'onStart': {
      const who = party ? 'the whole company is' : e.who === 'foes' ? 'every foe is' : 'the wearer is';
      const twin = e.with ? ` — while someone else in the company wears the ${byId(game?.items || [], e.with)?.name || e.with}` : '';
      return `Battle start: ${who} ${statusWords(e.status, e.power)} for ${turns(e.rounds || 3)}${twin}`;
    }
    case 'regen': {
      const parts = [];
      if (+e.hp > 0) parts.push(`${e.hp} health`);
      if (+e.mp > 0) parts.push(`${e.mp} mana`);
      return `Each turn: ${party ? 'every companion regains' : 'regains'} ${parts.join(' and ') || 'nothing'}`;
    }
    case 'cleanse': return `Each turn: may shake off a stun, sleep, fear, poison or curse (${odds(e.chance ?? 0.3) || 'always'})`;
    case 'onHit': {
      const how = e.melee ? 'Melee blows' : e.ranged ? 'Shots' : 'Blows';
      return `${how} may leave a foe ${statusWords(e.status, e.power)} (${[odds(e.chance), turns(e.rounds)].filter(Boolean).join(', ')})`;
    }
    case 'drain': return `Drinks ${pct(e.pct || 0.25)} of the damage dealt as health`;
    case 'thorns': return `A foe striking in melee takes ${e.dmg || '1d4'}`;
    case 'onHurt': return `Below ${pct(e.below || 0.5)} health: ${statusWords(e.status, e.power)} for ${turns(e.rounds || 2)} (once a battle)`;
    case 'spoils': {
      const parts = [];
      if (+e.gold > 0) parts.push(`${pct(e.gold)} more gold from battles`);
      if (+e.xp > 0) parts.push(`learns ${pct(e.xp)} faster`);
      return parts.join('; ').replace(/^./, (c) => c.toUpperCase()) || 'Spoils';
    }
    case 'travel': return `The company travels ${pct(e.pct)} quicker`;
    case 'food': return `The company eats ${pct(e.pct)} less on the road`;
    case 'prices': return `Shops sell for ${pct(e.pct)} less and buy for ${pct(e.pct)} more`;
    case 'sight': {
      const parts = [];
      if (+e.power > 0) parts.push(`sees ${e.power} square${+e.power === 1 ? '' : 's'} further`);
      if (+e.light > 0) parts.push(`sheds a light of ${e.light} in the dark`);
      return (parts.join(' and ') || 'Sight').replace(/^./, (c) => c.toUpperCase());
    }
    case 'encounters': return `${pct(e.pct)} fewer wandering monsters`;
    case 'forage': return `Better foraging (+${pct(e.pct)}): herbs, and now and then food from the wild`;
    case 'camp': return `A camp mends ${pct(e.pct)} more`;
    case 'wade': return 'Wades the shallows on foot (2 turns a step)';
    case 'climb': return 'Climbs mountains on foot (3 turns a step, peaks 4)';
    case 'fireWalk': return 'Walks on fire unburnt';
    case 'trueSight': return 'Sees things hidden from mortal eyes';
    case 'unseal': return 'Opens locks, and seals of magic no key can';
    case 'dowse': return `Senses buried treasure within ${e.radius || 5} squares`;
    case 'calm': return 'Wild beasts lie down and let the company pass';
    default: return EFFECT_TYPES[e.type]?.name || e.type;
  }
}

// Everything a piece's magic does, for its tooltip: { lines, ability, only, kind, rarity }
export function charmInfo(game, it) {
  if (!it) return null;
  const lines = (Array.isArray(it.effects) ? it.effects : []).map((e) => effectText(game, e)).filter(Boolean);
  const ab = itemAbility(it);
  const tags = ab ? [ab.free ? 'free action' : null, ab.perBattle ? (ab.perBattle > 1 ? `${ab.perBattle} times a battle` : 'once a battle') : ab.cooldown ? `ready again ${ab.cooldown} turn${ab.cooldown === 1 ? '' : 's'} later` : null].filter(Boolean).join(', ') : '';
  return {
    lines,
    ability: ab ? { name: ab.name, icon: ab.icon, tags, desc: ab.desc } : null,
    only: it.only && ((it.only.races || []).length || (it.only.classes || []).length) ? (it.onlyText || onlyWords(game, it)) : '',
    kind: CHARM_KINDS[it.kind] || '',
    rarity: RARITIES[it.rarity] || null,
  };
}

// does the piece do anything beyond its numbers? (arms and armour with effects)
export const hasMagic = (it) => !!it && ((Array.isArray(it.effects) && it.effects.length > 0) || !!it.ability);

// ---------------------------------------------------------------- battle
// session.battleHook(kind, battle, ...) lands here (see Battle.hook)
export function battleHook(session, kind, battle, ...a) {
  switch (kind) {
    case 'start': return battleStart(battle);
    case 'turn': return turnStart(battle, a[0]);
    case 'hit': return blowStruck(battle, a[0], a[1], a[2]);
    case 'hurt': return blowTaken(battle, a[0], a[1], a[2]);
    case 'resist': return resisted(battle, a[0], a[1]);
    case 'loot': return battleLoot(session, battle, a[0], a[1]);
    case 'end': return battleEnd(battle, a[0]);
    default: return null;
  }
}

const worn = (b, u) => (u?.side === 'party' && u.member && u.member.status !== 'dead' ? wornEffects(b.game, u.member) : []);
const tint = (it) => it?.tint ?? 0xffe080;
const wears = (b, u, id) => !!u?.member && wornItems(b.game, u.member).some((w) => w.it.id === id);
const sayLine = (it, u, fallback) => (it.say ? it.say.replace(/\{who\}/g, u.name) : fallback);

// Battle-start magic: blessings on the wearer or the company, curses on the
// foes, a head start in the turn order. Each piece that fires says so.
function battleStart(b) {
  b.charms = { hurt: new Set() };
  const heroes = b.partyUnits.filter((u) => b.alive(u));
  let n = 0;
  for (const u of heroes) {
    const fired = new Map();
    for (const { e, it } of worn(b, u)) {
      if (e.type === 'bonus' && e.stat === 'init') u.init += +e.power || 0;
      if (e.type !== 'onStart' || !STATUS_EFFECTS[e.status]) continue;
      // a twin's magic wakes only beside its other half, worn by someone else
      if (e.with && !heroes.some((h) => h !== u && wears(b, h, e.with))) continue;
      const who = e.who === 'party' ? heroes : e.who === 'foes' ? b.enemies.filter((x) => b.alive(x)) : [u];
      let hit = 0;
      for (const t of who) if (b.addStatus(t, e.status, +e.rounds || 3, +e.power || DEFAULT_POWER[e.status] || 0, u)) hit++;
      if (hit) fired.set(it, [...(fired.get(it) || []), { e, hit }]);
    }
    for (const [it, list] of fired) {
      const what = list.map(({ e }) => `${e.who === 'party' ? 'the company is' : e.who === 'foes' ? 'the foes are' : `${u.name} is`} ${(STATUS_EFFECTS[e.status]?.name || e.status).toLowerCase()}`).join(', ');
      b.log(sayLine(it, u, `${u.name}'s ${it.name} wakes — ${what}!`), 'magic');
      b.fx.callout(u.x, u.y, it.name, tint(it));
      b.view.sparkle?.(u.x, u.y, tint(it), 12);
      n++;
    }
  }
  if (n) sfx('spell');
  return null;
}

// a unit's turn begins: mending, and shaking off what binds it
function turnStart(b, u) {
  if (u?.side !== 'party') return false;
  for (const { e, it } of worn(b, u)) {
    if (e.type === 'regen') {
      for (const t of e.who === 'party' ? b.friendsOf(u) : [u]) {
        if (+e.hp > 0 && b.hpOf(t) < b.maxHpOf(t)) b.heal(t, +e.hp);
        const mx = t.member ? maxMp(b.game, t.member) : 0;
        if (+e.mp > 0 && mx > 0 && t.member.mp < mx) {
          t.member.mp = Math.min(mx, t.member.mp + +e.mp);
          b.fx.number(t.x, t.y, `+${e.mp} mana`, 'heal', '#90b0ff');
        }
      }
    }
    if (e.type === 'cleanse') {
      const bad = b.statusList(u).filter((s) => s.def?.bad);
      if (bad.length && rng.chance(e.chance == null ? 0.3 : +e.chance)) {
        const s = rng.pick(bad);
        if (s.id === 'poisoned' && u.member.status === 'poisoned') u.member.status = 'ok';
        if (s.id === 'asleep' && u.member.status === 'asleep') u.member.status = 'ok';
        b.removeStatus(u, s.id);
        b.log(`${u.name}'s ${it.name} flashes — no longer ${s.def.name.toLowerCase()}!`, 'magic');
        b.fx.number(u.x, u.y, `${s.def.name} lifted`, 'status', '#c8dcff');
      }
    }
  }
  return false;
}

// a blow the wearer lands (by, on t, for dmg): its venom, frost, or a sip of life.
// A weapon's own magic goes with its blows: a sword's in melee, a bow's at range.
function blowStruck(b, by, t, dmg) {
  if (by?.side !== 'party' || !b.alive(by)) return;
  const near = b.dist(by, t) <= 1;
  for (const { e, slot } of worn(b, by)) {
    if ((slot === 'weapon' && !near) || (slot === 'ranged' && near)) continue;
    if (e.type === 'onHit' && STATUS_EFFECTS[e.status] && b.alive(t) && b.hpOf(t) > 0) {
      if ((e.melee && !near) || (e.ranged && near)) continue;
      if (rng.chance(e.chance == null ? 1 : +e.chance)) b.addStatus(t, e.status, +e.rounds || 1, +e.power || DEFAULT_POWER[e.status] || 0, by);
    }
    if (e.type === 'drain' && dmg > 0 && b.hpOf(by) < b.maxHpOf(by)) b.heal(by, Math.max(1, Math.round(dmg * (+e.pct || 0.25))));
  }
}

// a blow the wearer takes: thorns for the one who struck, a last-ditch ward
function blowTaken(b, t, dmg, by) {
  if (t?.side !== 'party') return;
  for (const { e, it } of worn(b, t)) {
    if (e.type === 'thorns' && by && by !== t && by.side !== t.side && b.alive(by) && b.hpOf(by) > 0 && b.dist(by, t) <= 1) {
      const d = Math.max(1, roll(e.dmg || '1d4'));
      b.log(`${t.name}'s ${it.name} stings ${b.the(by)} for ${d}.`, 'good');
      Promise.resolve(b.damage(by, d, { dot: 'thorns', color: '#b0e070' })).catch((err) => console.error(err));
    }
    if (e.type === 'onHurt' && STATUS_EFFECTS[e.status] && b.hpOf(t) > 0 && b.hpOf(t) <= b.maxHpOf(t) * (+e.below || 0.5)) {
      const key = `${t.id}:${it.id}:${e.status}`;
      const st = b.charms || (b.charms = { hurt: new Set() });
      if (st.hurt.has(key)) continue;
      st.hurt.add(key);
      if (b.addStatus(t, e.status, +e.rounds || 2, +e.power || DEFAULT_POWER[e.status] || 0, t)) {
        b.log(`${t.name}'s ${it.name} flares — ${statusWords(e.status, e.power)}!`, 'magic');
        b.fx.callout(t.x, t.y, it.name, tint(it));
      }
    }
  }
}

// does a condition slide off this unit? A ward (spent on use), or a charm of
// resistance worn by the unit, or one worn for the whole company
function resisted(b, t, id) {
  if (t?.side !== 'party' || !STATUS_EFFECTS[id]?.bad) return false;
  if (t.st?.warded) {
    b.removeStatus(t, 'warded');
    b.log(`${t.name}'s ward turns the ${(STATUS_EFFECTS[id].name || id).toLowerCase()} aside.`, 'good');
    return true;
  }
  const sure = (e) => rng.chance(e.chance == null ? 1 : +e.chance);
  for (const { e } of worn(b, t)) if (e.type === 'resist' && e.status === id && sure(e)) return true;
  for (const u of b.partyUnits) {
    if (u === t || !b.alive(u)) continue;
    for (const { e } of worn(b, u)) if (e.type === 'resist' && e.who === 'party' && e.status === id && sure(e)) return true;
  }
  return false;
}

// Now and then a fallen band leaves a charm; a great foe often does, and a finer one
function battleLoot(session, b, power, give) {
  const g = b.game;
  if (g.settings.loot === false || typeof give !== 'function') return;
  const bosses = b.killedIds.map((id) => byId(g.monsters, id)).filter((d) => d?.boss);
  const chance = bosses.length ? 0.55 : Math.min(0.14, 0.025 + power * 0.006);
  if (!rng.chance(chance)) return;
  const lvl = Math.max(partyLevel(session.party), ...bosses.map((d) => d.level || 1));
  const it = pickCharm(g, lvl, { boss: bosses.length > 0 });
  if (it) give(it, bosses.length ? 'The great foe was wearing' : 'Among the fallen, something glints:');
}

// after a victory: a charm of fortune finds a little more gold
function battleEnd(b, outcome) {
  if (outcome !== 'victory' || !(b.gold > 0)) return;
  let k = 0, from = null;
  for (const u of b.partyUnits) {
    if (!u.member || u.member.status === 'dead') continue;
    for (const { e, it } of wornEffects(b.game, u.member)) if (e.type === 'spoils' && +e.gold > 0) { k += +e.gold; from = from || { u, it }; }
  }
  if (!k) return;
  const extra = Math.max(1, Math.round(b.gold * Math.min(1, k)));
  b.gold += extra;
  b.log(`${from.u.name}'s ${from.it.name} brings luck: ${extra} more gold turns up.`, 'loot');
}

// A charm for a hoard or the spoils of battle at about this level: rarer
// ones are scarcer, a boss or a deep hoard favours the finer kinds
export function pickCharm(game, level, { boss = false, hoard = false, r = rng } = {}) {
  const lift = boss || hoard;
  const pool = (game.items || []).filter((it) => it.type === 'charm' && !it.unique && !it.noLoot && (it.level || 1) <= level + (lift ? 2 : 1));
  if (!pool.length) return null;
  const boost = { common: lift ? 0.4 : 1, uncommon: 1, rare: lift ? 2.2 : 0.8, legendary: lift ? 1.4 : 0.15 };
  return r.weighted(pool, (it) => (RARITIES[it.rarity]?.weight ?? 2) * (boost[it.rarity] ?? 1) * (1 + Math.max(0, 3 - Math.abs((it.level || 1) - level)) * 0.4));
}

// A dungeon's hoard (chest.hoard, the treasure in its deepest room) holds a
// charm as well, chosen when it is opened for the company's level and the
// depth. Adds it to the pack and returns the lines for the chest's message.
export function charmHoard(session, chest) {
  const g = session.game;
  if (!chest?.hoard || chest.charm === false || g.settings.loot === false) return [];
  const lvl = Math.max(partyLevel(session.party), (session.map?.level || 1) + 1);
  const it = pickCharm(g, lvl, { hoard: true });
  if (!it) return [];
  session.party.inventory[it.id] = (session.party.inventory[it.id] || 0) + 1;
  return [`${it.name} (✦ charm)`];
}

// ---------------------------------------------------------------- the world
// living heroes' worn effects: [{ m, e, it, slot }]
export function companyEffects(session) {
  const out = [];
  for (const m of partyAlive(session.party)) for (const w of wornEffects(session.game, m)) out.push({ m, ...w });
  return out;
}

const sumOf = (list, type, key = 'pct', cap = 0.6) => Math.min(cap, list.reduce((t, x) => t + (x.e.type === type ? +x.e[key] || 0 : 0), 0));

// the first hero (and piece) with an effect of this type, or null
export function wornBy(session, type) { return companyEffects(session).find((x) => x.e.type === type) || null; }

// Can the company go onto this closed ground (shallows, mountains)? The hero
// and charm that take them there, or null. say: explain the first time.
export function charmWay(session, t, say = false) {
  const w = WAYS[t?.key];
  if (!w || session.state?.vehicle) return null;
  const x = wornBy(session, w.type);
  if (x && say) session.tip?.(`charm_${w.type}`, `${x.m.name}'s ${x.it.name} shows the way: the company can ${w.verb} (slow going, ${w.cost} turns a step). Only while it is worn!`);
  return x;
}

// turns a step takes: wading and climbing have their own pace, and a
// quick-foot charm shortens every step (by at most a third)
export function charmPace(session, t, cost) {
  const w = WAYS[t?.key];
  if (w && !t.walk && charmWay(session, t)) cost = w.cost;
  const k = sumOf(companyEffects(session), 'travel', 'pct', 0.35);
  return k ? cost * (1 - k) : cost;
}

// rations eaten by n heroes: less with a charm of plenty (the part saved is carried over)
export function charmRations(session, n) {
  const k = sumOf(companyEffects(session), 'food', 'pct', 0.5);
  if (!k) return n;
  const st = session.state;
  const want = n * (1 - k) + (st.foodCarry || 0);
  const eat = Math.floor(want + 1e-9);
  st.foodCarry = want - eat;
  return eat;
}

// a merchant's price with the company's charm of haggling (selling: the price paid to them)
export function charmPrice(session, base, selling = false) {
  const k = session ? sumOf(companyEffects(session), 'prices', 'pct', 0.3) : 0;
  return selling ? base * (1 + k) : base * (1 - k);
}

// sight and light round the company: { sight, light } widened by worn charms
export function charmSight(session, base) {
  const list = companyEffects(session).filter((x) => x.e.type === 'sight');
  if (!list.length) return base;
  const far = Math.max(0, ...list.map((x) => +x.e.power || 0));
  const lamp = Math.max(0, ...list.map((x) => +x.e.light || 0));
  const dim = base.light < 50; // (in daylight the light is 99: nothing to add)
  const light = dim ? base.light + lamp * (session.party.light > 0 ? 0.35 : session.currentLighting?.() === 'night' ? 0.5 : 1) : base.light;
  return { sight: base.sight + far, light };
}

// does a worn charm shed light (drawn as the carried lantern glow)?
export const charmLit = (session) => companyEffects(session).some((x) => x.e.type === 'sight' && +x.e.light > 0);

// chance of a wandering band, scaled by charms that keep them away
export function charmEncounters(session) { return 1 - sumOf(companyEffects(session), 'encounters', 'pct', 0.6); }

// a camp's mending, scaled by charms of rest (say: tell of it)
export function charmCamp(session, say = false) {
  const list = companyEffects(session);
  const k = sumOf(list, 'camp', 'pct', 1);
  if (k && say) {
    const x = list.find((y) => y.e.type === 'camp');
    session.log(`${x.m.name}'s ${x.it.name} makes the camp snug: everyone mends the better for it.`, 'magic');
  }
  return 1 + k;
}

// foraging: the extra chance of a find (for game/magic.js forageFind)
export function charmForage(game, members) {
  let k = 0;
  for (const m of members || []) if (m.status !== 'dead') for (const { e } of wornEffects(game, m)) if (e.type === 'forage') k += +e.pct || 0;
  return Math.min(2, k);
}

// would this hero walk on fire unburnt?
export const charmFireproof = (game, m) => wornEffects(game, m).some(({ e }) => e.type === 'fireWalk');

// A wild beast on the map lets a company with a charm of calming pass (not
// a boss, nor a beast far stronger than the company). It lies down quietly.
export function charmCalms(session, e) {
  if (e?.type !== 'monster' || e.boss) return false;
  const def = byId(session.game.monsters, e.monster);
  if (!isBeast(def) || def.boss || (def.level || 1) > partyLevel(session.party) + 2) return false;
  const x = wornBy(session, 'calm');
  if (!x) return false;
  if (e.mood === 'chase') {
    e.mood = null;
    const p = session.state.pos;
    if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 10) session.log(`The ${(def.plural || def.name).toLowerCase()} hear ${x.m.name}'s ${x.it.name}, and lie down in the grass.`, 'magic');
  }
  return true;
}

// Open a lock or a seal of magic with a charm of opening. A sealed thing
// that will not open says why. Returns true when it opens.
export function charmOpens(session, thing = null) {
  const x = wornBy(session, 'unseal');
  if (!x) {
    if (thing?.sealed) {
      session.log(thing.sealedText || `${thing.type === 'chest' ? 'The chest' : 'The way'} is sealed by a spell: no key or pick will open it.`, 'warn');
      session.tip?.('sealed', 'A seal of magic opens only to magic: a charm of opening (such as a Ring of Opening) worn by someone in the company.');
      sfx('bump');
    }
    return false;
  }
  const what = thing?.type === 'chest' ? 'the chest' : thing?.type === 'portal' ? 'the way' : 'the lock';
  session.log(thing?.sealed ? `${x.m.name}'s ${x.it.name} flares — the seal on ${what} breaks!` : `${x.m.name}'s ${x.it.name} glows, and ${what} clicks open.`, 'magic');
  if (thing) { thing.sealed = false; thing.locked = false; }
  sfx('spell');
  return true;
}

// Things hidden from mortal eyes (entities marked unseen) wait aside in a
// live map (map.unseen) until a hero with true sight comes near; once seen
// they stay (the map's play state keeps a list).
export function hideUnseen(map, ms) {
  const seen = new Set(ms?.revealed || []);
  map.unseen = map.entities.filter((e) => e.unseen && !seen.has(e.id));
  if (map.unseen.length) map.entities = map.entities.filter((e) => !map.unseen.includes(e));
}

const THING_WORDS = { chest: 'a hidden chest', portal: 'a hidden way', event: 'something hidden', sign: 'a hidden sign', npc: 'someone hidden', treasure: 'a hidden hoard' };

function revealUnseen(session, x) {
  const map = session.map, p = session.state.pos;
  for (const e of [...(map.unseen || [])]) {
    if (Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) > 5 || !hasLOS(map, p.x, p.y, e.x, e.y)) continue;
    map.unseen.splice(map.unseen.indexOf(e), 1);
    map.entities.push(e);
    (session.mapState(map.id).revealed ||= []).push(e.id);
    session.addVisual?.(e);
    session.view.sparkle?.(e.x, e.y, 0xc8e0ff, 22);
    sfx('spell');
    session.log(`${x.m.name}'s ${x.it.name} stirs: ${e.name || THING_WORDS[e.type] || 'something hidden'} shimmers into view, hidden from mortal eyes!`, 'magic');
  }
}

// a dowsing charm dips over buried treasure: the spot is marked on the big
// map (as a read map would) and may be dug without its map
function dowse(session, list) {
  const r = Math.max(0, ...list.filter((x) => x.e.type === 'dowse').map((x) => +x.e.radius || 5));
  if (!r) return;
  const x = list.find((y) => y.e.type === 'dowse' && (+y.e.radius || 5) === r);
  const p = session.state.pos, st = treasureState(session.state);
  for (const e of session.map.entities) {
    if (e.type !== 'treasure' || st[e.id]?.dug || st[e.id]?.sensed != null) continue;
    if (Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) > r) continue;
    const rec = (st[e.id] ||= {});
    rec.sensed = session.state.turn || 0;
    if (rec.read == null) rec.read = rec.sensed;
    const where = e.x === p.x && e.y === p.y ? 'right here' : `${pacesText(e.x - p.x, e.y - p.y)} from here`;
    session.log(`${x.m.name}'s ${x.it.name} dips sharply: something lies buried ${where}! (Dig on the very spot.)`, 'magic');
    session.view.sparkle?.(e.x, e.y, 0xd0a060, 18);
    sfx('gold');
  }
}

// food the wild gives a forager, by the ground
const FINDS = {
  forest: 'a bramble thick with blackberries', pines: 'a stand of fat ceps', meadow: 'a patch of wild strawberries', grass: 'a hare\'s nest of plovers\' eggs',
  hills: 'a crop of bilberries', swamp: 'a clutch of duck eggs among the reeds', fields: 'gleanings of a harvest', snow: 'a frozen cache of hazelnuts',
};

// After every step on foot: true sight, dowsing, and food from the wild
export function charmStep(session, t) {
  const list = companyEffects(session);
  if (!list.length) return;
  const sight = list.find((x) => x.e.type === 'trueSight');
  if (sight) revealUnseen(session, sight);
  if (list.some((x) => x.e.type === 'dowse')) dowse(session, list);
  const k = sumOf(list, 'forage', 'pct', 2);
  if (k && session.map.type === 'world' && FINDS[t?.key] && session.game.settings.food && rng.chance(0.02 * k)) {
    const x = list.find((y) => y.e.type === 'forage');
    const n = rng.int(2, 5);
    session.party.food += n;
    session.log(`${x.m.name}'s ${x.it.name} leads them to ${FINDS[t.key]} (+${n} food).`, 'loot');
  }
}

// for the tests and the browser console
if (typeof window !== 'undefined') window.__charms = { EFFECT_TYPES, effectText, charmInfo, pickCharm, companyEffects, charmWay, charmPace, charmRations, charmPrice, charmSight, charmEncounters, isBeast, STAT_NAMES };
