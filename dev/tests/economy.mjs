// The economy, measured. For each built-in adventure, a company's purse over
// levels 1 to 8 and what the shops' prices let it buy, from the game's own
// data and code:
//   fights   the bands the encounter tables really send at each level
//            (PlaySession.pickMonster over the adventure's own open country,
//            encounterCount and enemiesFor for their size, escorts and all),
//            as many as the experience still wanted for the next level asks
//            for: their purses (the monsters' gold dice, on average) and the
//            spoils they leave (Battle.dropLoot itself), the gear among them
//            sold back at the game's sell rate (charms and potions are kept)
//   content  everything placed once: chests and caches, buried hoards (with
//            the bonus a hoard grows by), bands and bosses set on the maps,
//            quest rewards, events that pay and people who give gold, each
//            met at the level the company comes to it: a dungeon's at its
//            boss's level, a chest out in the country at the level of the
//            strongest foes set down beside it, a hoard no sooner than its
//            map is found, a quest at the level of what it sends the company
//            to kill or fetch, the main quest's reward at the end
//   upkeep   what a company spends to keep going: a night at an inn every
//            fourth fight, rations for the road and a healing draught every
//            fourth fight, at the game's own prices
// The journey: at each level the company does all it has found to do there
// (the content of its level or below), meeting wanderers on the way to each
// piece, then fights more of them for whatever experience the next level
// still asks. "In hand" is what it holds on
// reaching a level had it bought no gear on the way: what saving up buys.
// Used by tests/market.mjs; run alone for the table:
//   node tests/economy.mjs [sample|lanterns|both] [bands per level=300] [ledger]   (SRC=dir: another source tree)
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);

// the milestones the prices are set against: what a company first wants,
// what it saves a little for, and what it saves a long time for
export const TIERS = {
  basic: ['dagger', 'club', 'short_sword', 'sling', 'leather_armor', 'buckler'],
  good: ['long_sword', 'spear', 'long_bow', 'chain_mail', 'kite_shield'],
  great: ['great_sword', 'battle_axe', 'warhammer', 'plate_armor', 'tower_shield', 'dwarf_axe'],
};

// who walks the road at each level (the Lanterns' castaway gathers a company
// as tests/adventure2_sim.mjs has it)
const COMPANY = {
  sample: () => 4,
  lanterns: (lvl) => (lvl <= 1 ? 1 : lvl <= 3 ? 2 : lvl <= 4 ? 4 : 5),
};
// fights between one night at an inn and the next, and between healing draughts drunk
const REST_EVERY = 4, DRAUGHT_EVERY = 4;
// turns on the road for each fight: the wanderers' wait (15 turns, then a
// 4.5% chance a turn) and the walking between; a hero eats a ration in 20
const TURNS_PER_FIGHT = 40, FOOD_TURNS = 20;
// wandering bands met on the way to each piece of content (the walk there and back)
const TRAVEL_FIGHTS = 0.4;

async function load(src) {
  const at = (p) => import(pathToFileURL(path.join(src, p)).href);
  const [sample, lanterns, defaults, session, combat, rngM, terrainM] = await Promise.all([
    at('data/sample.js'), at('data/lanterns.js'), at('data/defaults.js'), at('game/session.js'), at('game/combat.js'), at('core/rng.js'), at('data/terrain.js'),
  ]);
  return { sample, lanterns, defaults, session, combat, rngM, terrainM };
}

const avgDice = (spec, parseDice) => { const d = parseDice(spec || '0'); return d.n * (d.d + 1) / 2 + d.b; };

export async function economy(opt = {}) {
  const src = opt.src || process.env.SRC || path.join(HERE, '..', 'src');
  const M = await load(src);
  const { rng, RNG, parseDice } = M.rngM;
  const seed = opt.seed ?? 4242;
  const realRandom = Math.random;
  const seeded = new RNG(seed * 7 + 1);
  Math.random = () => seeded.next();
  const keep = { next: rng.next, f: rng.f };
  { const r = new RNG(seed); rng.next = () => r.next(); rng.f = () => r.next(); }
  try {
    const out = {};
    for (const which of opt.adventures || ['sample', 'lanterns']) out[which] = measureAdventure(M, which, { ...opt, rng, parseDice });
    return out;
  } finally { Math.random = realRandom; rng.next = keep.next; rng.f = keep.f; }
}

function measureAdventure(M, which, opt) {
  const { rng, parseDice } = opt;
  const game = opt.game?.(which) || (which === 'sample' ? M.sample.buildSampleGame() : M.lanterns.buildLanternsGame());
  const { XP_TABLE } = M.defaults;
  const { PlaySession, encounterCount, habitatOf } = M.session;
  const { terrain } = M.terrainM;
  const perLevel = opt.fights ?? 300;
  const levels = opt.levels || [1, 2, 3, 4, 5, 6, 7, 8];
  const top = levels[levels.length - 1];
  const item = (id) => game.items.find((i) => i.id === id);
  const price = (id) => item(id)?.price || 0;
  const sellRate = game.settings.sellRate ?? 0.5;
  const sell = (it) => Math.max(1, Math.floor((it.price || 0) * sellRate));
  const mon = (id) => game.monsters.find((m) => m.id === id);
  const escorts = (def, f) => (def.escort || []).reduce((t, e) => t + f(mon(e.id)) * ((e.min || 0) + (e.max || 0)) / 2, 0);
  const bandGold = (def, n) => avgDice(def.gold, parseDice) * n + escorts(def, (d) => avgDice(d?.gold, parseDice));
  const bandXp = (def, n) => (def.xp || 0) * n + escorts(def, (d) => d?.xp || 0);
  const countOf = (c, def) => { const m = String(c || '').match(/^(\d+)(?:\s*-\s*(\d+))?$/); return m ? (+m[1] + +(m[2] || m[1])) / 2 : def?.group ? (def.group[0] + def.group[1]) / 2 : 1; };
  const world = game.maps.find((m) => m.type === 'world') || game.maps[0];
  const heroes = COMPANY[which] || COMPANY.sample;

  // ---- content: what each map holds, at the level the company meets it
  const placed = (m) => (m.entities || []).filter((e) => e.type === 'monster' && !e.roaming && mon(e.monster));
  const capLevel = (l) => Math.max(1, Math.min(top, Math.round(l)));
  const dungeonLevel = (m) => {
    const foes = placed(m).map((e) => mon(e.monster));
    const boss = foes.filter((d) => d.boss).map((d) => d.level || 1);
    if (boss.length) return capLevel(Math.max(...boss));
    if (foes.length) return capLevel(Math.max(...foes.map((d) => d.level || 1)) + 1);
    return capLevel((m.level || 1) + 1);
  };
  // out in the country: the strongest foes set down close by, else the nearest
  const nearLevel = (m, x, y) => {
    const by = placed(m).map((e) => ({ l: mon(e.monster).level || 1, d: Math.hypot(e.x - x, e.y - y) }));
    const close = by.filter((o) => o.d <= 10);
    if (close.length) return capLevel(Math.max(...close.map((o) => o.l)));
    const near = by.filter((o) => o.d <= 25).sort((a, b) => a.d - b.d)[0];
    return near ? capLevel(near.l) : null;
  };
  const levelAt = (m, x, y) => (m.type === 'dungeon' ? dungeonLevel(m) : m.type === 'world' ? nearLevel(m, x, y) ?? 2 : 2);
  // where a thing is first found: a chest, a band's loot, a quest's reward, a shop
  const sourceLevel = (id, depth = 0) => {
    const ls = [];
    for (const m of game.maps) for (const e of m.entities || []) {
      if (e.type === 'chest' && (e.items || []).some((i) => i.id === id)) ls.push(levelAt(m, e.x, e.y));
      if (e.type === 'monster' && (e.loot || []).some((i) => i.id === id)) ls.push(m.type === 'dungeon' ? dungeonLevel(m) : capLevel(mon(e.monster)?.level || 1));
      if (e.type === 'npc' && (e.shop?.stock || []).includes(id)) ls.push(3);
    }
    if (depth < 2) for (const q of game.quests || []) if ([q.reward, ...(q.stages || []).map((s) => s.reward)].some((r) => (r?.items || []).some((i) => i.id === id))) ls.push(questLevel(q, depth + 1));
    return ls.length ? Math.min(...ls) : null;
  };
  const goalLevel = (gl, depth) => (gl?.type === 'kill' && mon(gl.monster) ? capLevel(mon(gl.monster).level || 1)
    : (gl?.type === 'collect' || gl?.type === 'deliver') && gl.item ? sourceLevel(gl.item, depth) : null);
  function questLevel(q, depth = 0) {
    const ls = (q.stages || []).map((s) => goalLevel(s.goal, depth)).filter((l) => l != null);
    return ls.length ? Math.max(...ls) : 2;
  }
  const ledger = [];
  const add = (l, gold, xp, what) => { if (gold || xp) ledger.push({ level: capLevel(l), gold: Math.round(gold), xp: Math.round(xp), what }); };
  for (const m of game.maps) for (const e of m.entities || []) {
    if (e.type === 'chest') add(levelAt(m, e.x, e.y), avgDice(e.gold, parseDice), 0, `chest in ${m.name}`);
    else if (e.type === 'treasure') {
      const map = game.items.find((i) => i.type === 'map' && i.treasure === e.id);
      const l = Math.max(levelAt(m, e.x, e.y), (map && sourceLevel(map.id)) || 1);
      add(l, avgDice(e.gold, parseDice) + (e.bonus === false ? 0 : l * 15 + 5 * l), 0, `hoard ${e.id}`);
    } else if (e.type === 'monster' && !e.roaming && mon(e.monster)) {
      const def = mon(e.monster), n = countOf(e.count, def);
      const l = m.type === 'dungeon' ? dungeonLevel(m) : capLevel(def.level || 1);
      add(l, bandGold(def, n), bandXp(def, n) / Math.sqrt(heroes(l)), `${def.id} in ${m.name}`);
    } else if (e.type === 'event') {
      // the best a company can come away with: gold won less gold paid
      const net = (c) => (parseInt(c.effects?.gold, 10) || 0) + (parseInt(c.win?.gold, 10) || 0) - (parseInt(c.cost?.gold, 10) || 0);
      const best = Math.max(0, ...(e.choices || []).map(net));
      const xp = Math.max(0, ...(e.choices || []).map((c) => (parseInt(c.effects?.xp, 10) || 0) + (parseInt(c.win?.xp, 10) || 0)));
      add(levelAt(m, e.x, e.y), best, xp, `event ${e.name || e.id}`);
    } else if (e.type === 'npc') {
      for (const k of e.keywords || []) if (k.action?.type === 'give_gold') add(2, parseInt(k.action.value, 10) || 0, 0, `${e.name}'s gift`);
    }
  }
  for (const q of game.quests || []) {
    // each stage's reward at that stage's level, the quest's own at its end
    for (const s of q.stages || []) if (s.reward) add(goalLevel(s.goal, 0) ?? questLevel(q), parseInt(s.reward.gold, 10) || 0, parseInt(s.reward.xp, 10) || 0, `${q.id}: a stage`);
    add(q.main ? top : questLevel(q), parseInt(q.reward?.gold, 10) || 0, parseInt(q.reward?.xp, 10) || 0, `quest ${q.id}`);
  }
  ledger.sort((a, b) => a.level - b.level);

  // ---- the open country: where wanderers come from, as often as the land has it
  const habitats = [];
  for (let i = 0; i < world.tiles.length; i += 7) {
    const t = terrain(world.tiles[i]);
    if (!t.walk || t.water) continue;
    const h = habitatOf(t);
    if (h && h !== 'town') habitats.push(h);
  }
  const fake = (n, lvl) => ({ members: Array.from({ length: n }, (_, i) => ({ id: 'h' + i, level: lvl, status: 'ok', equip: {} })), gold: 0, inventory: {}, flags: {} });
  const inns = game.maps.flatMap((m) => m.entities || []).filter((e) => e.type === 'npc' && e.role === 'inn');
  const innPrice = inns.length ? inns.reduce((t, e) => t + (e.price || 6), 0) / inns.length : 6;

  // ---- a wandering band at each level: experience, purse and spoils sold, on average
  const bands = {};
  for (const level of levels) {
    const n = heroes(level);
    const party = fake(n, level);
    const sess = { game, party, map: { encounters: [], level: 1, type: 'world' } };
    let xp = 0, gold = 0, sold = 0, got = 0;
    const lootSeen = {};
    for (let k = 0; k < perLevel; k++) {
      const def = PlaySession.prototype.pickMonster.call(sess, rng.pick(habitats));
      if (!def) continue;
      got++;
      const list = PlaySession.prototype.enemiesFor.call({ game, party }, { monster: def.id, count: encounterCount(def, level) });
      const killed = list.flatMap((x) => Array(x.n).fill(x.id));
      xp += Math.ceil(killed.reduce((t, id) => t + (mon(id)?.xp || 0), 0) / Math.sqrt(n));
      gold += killed.reduce((t, id) => t + avgDice(mon(id)?.gold, parseDice), 0);
      const inv = {};
      const b = { s: { party: { ...party, inventory: inv } }, game, killedIds: killed, loot: [], log: () => {}, hook: () => null };
      M.combat.Battle.prototype.dropLoot.call(b);
      for (const [id, cnt] of Object.entries(inv)) {
        const it = item(id);
        if (it && ['weapon', 'armor', 'shield'].includes(it.type)) { sold += sell(it) * cnt; lootSeen[id] = (lootSeen[id] || 0) + cnt; }
      }
    }
    const k = Math.max(1, got);
    const upkeep = n * innPrice / REST_EVERY + n * TURNS_PER_FIGHT / FOOD_TURNS * price('rations') / 25 + price('healing_draught') / DRAUGHT_EVERY;
    bands[level] = { xp: xp / k, gold: gold / k, sold: sold / k, upkeep, lootSeen };
  }

  // ---- the journey
  const rows = levels.map((level) => ({ level, heroes: heroes(level), inHand: 0, fights: 0, goldFights: 0, goldLoot: 0, goldContent: 0, upkeep: 0, income: 0, lootSeen: bands[level].lootSeen }));
  const row = (l) => rows.find((r) => r.level === l);
  let lvl = levels[0], xp = XP_TABLE[lvl] ?? 0, purse = game.settings.startGold ?? 100;
  row(lvl).inHand = Math.round(purse);
  const next = () => XP_TABLE[lvl + 1] ?? Infinity;
  const levelUp = () => { while (lvl <= top && xp >= next()) { lvl++; if (row(lvl)) row(lvl).inHand = Math.round(purse); } };
  // f wandering bands fought at the level the company is at
  const fight = (f) => {
    const b = bands[lvl], r = row(lvl);
    r.fights += f; r.goldFights += f * b.gold; r.goldLoot += f * b.sold; r.upkeep += f * b.upkeep; r.income += f * (b.gold + b.sold);
    purse += f * (b.gold + b.sold - b.upkeep);
    xp += f * b.xp;
  };
  let i = 0;
  while (lvl <= top) {
    for (; i < ledger.length && ledger[i].level <= lvl && lvl <= top; i++) {
      const c = ledger[i], r = row(lvl);
      purse += c.gold; xp += c.xp;
      r.goldContent += c.gold; r.income += c.gold;
      levelUp();
      // and the wanderers met on the way to it
      if (lvl <= top) { fight(TRAVEL_FIGHTS); levelUp(); }
    }
    if (lvl > top) break;
    fight(Math.max(0, next() - xp) / Math.max(1, bands[lvl].xp));
    xp = Math.max(xp, next());
    levelUp();
  }
  for (const r of rows) {
    for (const k of ['goldFights', 'goldLoot', 'goldContent', 'upkeep', 'income']) r[k] = Math.round(r[k]);
    r.fights = +r.fights.toFixed(1);
    r.buys = affordable(game, r.inHand);
  }
  return { rows, ledger, bands, sellRate, startGold: game.settings.startGold, prices: Object.fromEntries(Object.values(TIERS).flat().filter((id) => item(id)).map((id) => [id, price(id)])), game };
}

// what a purse of this much can buy: the pieces of each tier in reach
export function affordable(game, gold) {
  const out = {};
  for (const [tier, ids] of Object.entries(TIERS)) out[tier] = ids.map((id) => game.items.find((i) => i.id === id)).filter((it) => it && (it.price || 0) <= gold).map((it) => it.id);
  return out;
}

// the first level whose purse buys this piece outright (Infinity: none of them)
export function levelToAfford(res, id) {
  const p = res.prices[id] ?? res.game.items.find((i) => i.id === id)?.price;
  const r = res.rows.find((x) => x.inHand >= p);
  return r ? r.level : Infinity;
}

export function table(res, name) {
  const lines = [`${name}: start ${res.startGold} gold, merchants pay ${Math.round(res.sellRate * 100)}%`];
  lines.push('lvl heroes  fights  in hand | + purses  + loot  + content  - upkeep | in reach (the dearest of each tier)');
  for (const r of res.rows) {
    const dear = (ids) => (ids.length ? ids.map((id) => [id, res.prices[id]]).sort((a, b) => b[1] - a[1])[0].join(' ') : '—');
    lines.push(`${String(r.level).padStart(3)} ${String(r.heroes).padStart(6)} ${String(r.fights).padStart(7)} ${String(r.inHand).padStart(8)} | ${String(r.goldFights).padStart(8)} ${String(r.goldLoot).padStart(7)} ${String(r.goldContent).padStart(10)} ${String(r.upkeep).padStart(9)} | basic: ${dear(r.buys.basic)}; good: ${dear(r.buys.good)}; great: ${dear(r.buys.great)}`);
  }
  lines.push('a wandering band, by level: ' + res.rows.map((r) => { const b = res.bands[r.level]; return `${r.level}: ${Math.round(b.xp)} xp ${Math.round(b.gold)}+${Math.round(b.sold)} gold`; }).join(' · '));
  const first = Object.values(TIERS).flat().filter((id) => res.prices[id] != null).map((id) => `${id} ${res.prices[id]}→${levelToAfford(res, id) === Infinity ? '—' : levelToAfford(res, id)}`);
  lines.push('first in reach at level: ' + first.join(', '));
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const which = process.argv[2] && process.argv[2] !== 'both' ? [process.argv[2]] : ['sample', 'lanterns'];
  const res = await economy({ adventures: which, fights: +(process.argv[3] || 300) });
  for (const k of which) {
    console.log(table(res[k], k === 'sample' ? 'Shadow over Eldmark' : 'The Lanterns of the Glass Sea') + '\n');
    if (process.argv[4] === 'ledger') for (const c of res[k].ledger) console.log(`  L${c.level} ${String(c.gold).padStart(5)} gold ${String(c.xp).padStart(4)} xp  ${c.what}`);
  }
}
