// Balance simulator: auto-plays battles from the sample adventure's encounter
// tables with a sensible (not perfect) player at party levels 1..6, and prints
// win rate, rounds, health lost and potions drunk. Runs the real combat code
// headless (effects, sound and music are stubbed out).
//   node tests/balance.mjs [battles per row=60] [seed]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.dirname(new URL(import.meta.url).pathname);
const src = process.env.SRC || path.join(root, '..', 'src');
const N = parseInt(process.argv[2], 10) || 60;
const SEED = parseInt(process.argv[3], 10) || 12345;

const STUB_FX = `export class BattleFx { constructor() { return new Proxy(this, { get: (t, k) => k === 'danger' ? () => ({ remove() {} }) : () => Promise.resolve() }); } }`;
const STUB_NOOP = `export function sfx() {} export function playMusic() {} export function setMuted() {} export function isMuted() { return true; } export function musicEnabled() { return false; } export function setMusic() {}`;

const entry = `
export { buildSampleGame } from './data/sample.js';
export * as rules from './game/rules.js';
export { Battle } from './game/combat.js';
export { rng, RNG, roll } from './core/rng.js';
export * as defaults from './data/defaults.js';
export { byId } from './data/schema.js';
export * as session from './game/session.js';
`;
const out = path.join(os.tmpdir(), `rpgcs-balance-${process.pid}.mjs`);
await esbuild.build({
  stdin: { contents: entry, resolveDir: src, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /render\/fx\.js$/ }, () => ({ path: 'fx', namespace: 'stub' }));
      b.onResolve({ filter: /core\/(sound|music)\.js$/ }, () => ({ path: 'noop', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: a.path === 'fx' ? STUB_FX : STUB_NOOP, loader: 'js' }));
    },
  }],
});
const M = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });
const { rules: R, Battle, rng, RNG, byId } = M;
const { PlaySession } = M.session;
const encounterCount = M.session.encounterCount || ((mon) => `${mon.group?.[0] || 1}-${mon.group?.[1] || 3}`);

// deterministic runs
{
  const r = new RNG(SEED);
  rng.next = () => r.next();
}

const game = M.buildSampleGame();
R.ensureCombatData(game);

// ---------------------------------------------------------------- a stand-in session
const any = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : any()), apply: () => Promise.resolve() });
const view = new Proxy({ rig: { pitch: 52, dist: 10, tdist: 10 } }, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve()) });

function makeSession(party) {
  return {
    game, view, party, map: { lighting: 'day', type: 'world' },
    log: process.env.TRACE ? (t) => console.log('   ', t) : () => {}, currentLighting: () => 'day',
    app: { fade: async () => {} },
    ui: new Proxy({}, { get: () => () => {} }),
  };
}

// ---------------------------------------------------------------- the company
const COMPANY = [['dwarf', 'warrior'], ['elf', 'ranger'], ['human', 'wizard'], ['human', 'cleric']];
// what a party following the main quest would carry at each level
const GEAR = {
  1: { warrior: ['long_sword', 'leather_armor', 'buckler'], ranger: ['short_sword', 'short_bow', 'leather_armor'], wizard: ['quarterstaff', 'robe'], cleric: ['mace', 'sling', 'leather_armor', 'buckler'] },
  3: { warrior: ['long_sword', 'chain_mail', 'kite_shield', 'crossbow'], ranger: ['short_sword', 'long_bow', 'studded_leather'], wizard: ['quarterstaff', 'robe'], cleric: ['mace', 'sling', 'chain_mail', 'buckler'] },
  5: { warrior: ['long_sword', 'scale_mail', 'kite_shield', 'crossbow'], ranger: ['short_sword', 'ember_bow', 'studded_leather'], wizard: ['quarterstaff', 'elven_cloak'], cleric: ['warhammer', 'sling', 'scale_mail', 'kite_shield'] },
  7: { warrior: ['runeblade', 'plate_armor', 'kite_shield', 'crossbow'], ranger: ['short_sword', 'elven_bow', 'studded_leather'], wizard: ['staff_of_power', 'elven_cloak'], cleric: ['warhammer', 'sling', 'scale_mail', 'kite_shield'] },
};
function makeParty(level) {
  const members = COMPANY.map(([race, cls], i) => {
    const k = byId(game.classes, cls);
    const stats = { str: 11, dex: 11, int: 11, wis: 11 };
    for (const s of k.primary || []) stats[s] = 16;
    const c = R.createCharacter(game, { name: `${cls}`, race, cls, stats });
    c.id = 'pc' + i;
    R.normalizeMember(game, c, {});
    R.gainXp(game, c, Math.max(0, (game.settings && R.xpForLevel(level)) - c.xp));
    // spend points on the first primary attribute; take the first talent offered
    while (c.points > 0) R.spendPoint(game, c, k.primary?.[c.points % 2] || 'str');
    while (c.perkPending > 0) R.choosePerk(game, c, R.perkChoices(game, c)[0].id);
    const kit = GEAR[[7, 5, 3, 1].find((l) => level >= l)][cls];
    R.equipKit(game, c, kit, {});
    c.hp = R.maxHp(game, c); c.mp = R.maxMp(game, c);
    return c;
  });
  return { members, gold: 0, food: 50, inventory: { healing_draught: level >= 3 ? 3 : 2 }, flags: {}, light: 0 };
}

// ---------------------------------------------------------------- the player
const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
async function moveTo(b, u, x, y) {
  const p = b.pathTo(u, x, y);
  if (!p) return;
  for (const [px, py] of p.slice(1)) {
    if (!(await b.provoke(u, px, py))) return;
    u.x = px; u.y = py; u.moves--;
  }
}
const frac = (b, x) => b.hpOf(x) / Math.max(1, b.maxHpOf(x));

async function heroAI(b, u, stats) {
  u.moves = b.movesFor(u);
  const m = u.member;
  // a sensible player steps out of the marked squares of a blow that is coming
  const danger = new Set(b.enemies.filter((e) => b.alive(e) && e.charging).flatMap((e) => e.charging.tiles.map((t) => `${t.x},${t.y}`)));
  if (danger.has(`${u.x},${u.y}`) && u.moves > 0) {
    const safe = [...b.reachable(u).values()].filter((c) => !c.ally && c.d > 0 && !danger.has(`${c.x},${c.y}`)).sort((p, q) => p.d - q.d)[0];
    if (safe) await moveTo(b, u, safe.x, safe.y);
  }
  const inv = b.s.party.inventory;
  for (let guard = 0; guard < 6 && b.alive(u) && !b.checkEnd(); guard++) {
    const foes = b.foesOf(u);
    if (!foes.length) return;
    const allies = b.friendsOf(u);
    const hurt = allies.filter((a) => frac(b, a) < 0.45).sort((p, q) => frac(b, p) - frac(b, q));
    const abs = b.abilitiesOf(u).filter((ab) => b.canUseAbility(u, ab).ok);
    // 1. keep people alive
    if (hurt.length) {
      const mend = abs.find((ab) => ab.healPct && b.isSpecial(u, ab));
      if (mend && allies.filter((a) => frac(b, a) < 0.6).length >= 2) { stats.heals++; if (await b.useAbility(u, mend, null)) return; continue; }
      const word = abs.find((ab) => ab.heal && ab.target === 'ally' && b.abilityTargets(u, ab).units.includes(hurt[0]));
      if (word) { stats.heals++; if (await b.useAbility(u, word, hurt[0])) return; continue; }
      const sp = b.combatSpells(u).find((s) => s.effect === 'heal' && R.canCast(game, m, s, inv).ok);
      if (sp) { stats.heals++; await b.castSpell(u, sp, sp.target === 'ally' ? hurt[0] : null); return; }
      // drink (or hand over) a draught when someone is in real trouble
      if (frac(b, hurt[0]) < 0.3 && inv.healing_draught > 0) { stats.potions++; await b.useItem(u, byId(game.items, 'healing_draught'), hurt[0]); return; }
    }
    // 2. the special, when it is worth it
    const special = abs.find((ab) => b.isSpecial(u, ab) && !ab.heal && !ab.healPct);
    if (special && (foes.length >= 2 || foes.some((f) => f.def.boss))) {
      const tg = b.abilityTargets(u, special);
      const hits = tg.kind === 'none' ? tg.units.length : 1;
      if (special.move === 'teleport') { /* wizards keep blink for emergencies */ }
      else if (special.target === 'allAllies' || hits >= 2 || (tg.kind === 'enemy' && tg.units.some((f) => f.def.boss))) {
        const t = tg.kind === 'enemy' ? tg.units.sort((p, q) => b.hpOf(p) - b.hpOf(q))[0] : null;
        stats.specials++;
        if (await b.useAbility(u, special, t)) return; continue;
      }
    }
    // 3. free buffs (taunt, inspire, ward) once in a while
    const free = abs.find((ab) => ab.free && !ab.heal && ab.target !== 'tile');
    if (free && !u._freeUsed) {
      u._freeUsed = true;
      const tg = b.abilityTargets(u, free);
      const t = tg.kind === 'ally' ? tg.units[0] : null;
      if ((tg.units || []).length || tg.kind === 'ally') { await b.useAbility(u, free, t); continue; }
    }
    // 4. casters cast
    const dmgSpell = b.combatSpells(u).filter((s) => s.effect === 'damage' && R.canCast(game, m, s, inv).ok && (s.target === 'enemy' || s.target === 'area' || s.target === 'allEnemies')
      && (!s.undeadOnly || foes.some((f) => f.def.undead)))
      .sort((p, q) => (q.level || 1) - (p.level || 1))[0];
    if (dmgSpell && (m.mp >= (dmgSpell.cost || 0) * 2 || foes.some((f) => f.def.boss))) {
      const ts = dmgSpell.target === 'allEnemies' ? [null] : foes.filter((f) => near(u, f) <= (dmgSpell.range || 7) && b.lineClear(u, f));
      if (ts.length) { await b.castSpell(u, dmgSpell, ts.sort((p, q) => b.hpOf(p || u) - b.hpOf(q || u))[0]); return; }
    }
    // 5. attack skills on something in reach
    const skill = abs.find((ab) => !b.isSpecial(u, ab) && (ab.target === 'enemy' || ab.target === 'nearbyFoes' || ab.target === 'adjacentFoes') && !ab.free);
    if (skill) {
      const tg = b.abilityTargets(u, skill);
      const t = tg.kind === 'enemy' ? tg.units.sort((p, q) => b.hpOf(p) - b.hpOf(q))[0] : null;
      if (tg.kind !== 'enemy' || t) { if (await b.useAbility(u, skill, t)) return; continue; }
    }
    // 6. plain attack
    const ts = b.attackTargets(u).sort((p, q) => b.hpOf(p) - b.hpOf(q));
    if (ts.length) { await b.attack(u, ts[0]); return; }
    // 7. move: melee to the nearest foe's side; shooters to a square with a clear shot
    if (u.moves > 0) {
      const reach = b.reachable(u);
      const ranged = b.weaponRange(u) > 1 || b.combatSpells(u).some((s) => s.effect === 'damage') || abs.some((ab) => ab.range > 1 && !ab.heal);
      let best = null, bs = Infinity;
      for (const c of reach.values()) {
        if (c.ally || c.d === 0) continue;
        let s;
        if (ranged && b.weaponRange(u) > 1) {
          const shots = foes.filter((f) => near(c, f) <= b.weaponRange(u) && b.lineClear(c, f)).length;
          const close = Math.min(...foes.map((f) => near(c, f)));
          s = (shots ? 0 : 50) + (close <= 1 ? 20 : 0) + c.d * 0.1;
        } else s = Math.min(...foes.map((f) => Math.abs(f.x - c.x) + Math.abs(f.y - c.y))) * 2 + c.d * 0.1;
        if (s < bs) { bs = s; best = c; }
      }
      if (best) { await moveTo(b, u, best.x, best.y); continue; }
    }
    break;
  }
}

// ---------------------------------------------------------------- encounter tables
function sess(level) { return { game, party: makeParty(level), map: { encounters: [], level: 1, type: 'world' } }; }
function worldGroup(level) {
  const s = sess(level);
  const hab = rng.pick(['grass', 'grass', 'forest', 'hills', 'swamp']);
  const mon = PlaySession.prototype.pickMonster.call(s, hab);
  return mon ? PlaySession.prototype.enemiesFor.call({ game }, { monster: mon.id, count: encounterCount(mon, level) }) : null;
}
// rooms of the two dungeons, with the group sizes the sample gives them
function roomGroup(map) {
  const ms = map.entities.filter((e) => e.type === 'monster' && !e.boss);
  const e = rng.pick(ms);
  return PlaySession.prototype.enemiesFor.call({ game }, e);
}
const barrowMap = game.maps.find((m) => m.name === 'Grimholt Barrow');
const fortressMap = game.maps.find((m) => m.name === 'Dol Garoth');
const placed = (id, count) => () => PlaySession.prototype.enemiesFor.call({ game }, { monster: id, count });
const TABLES = {
  'world (random)': (l) => worldGroup(l),
  'barrow rooms': () => roomGroup(barrowMap),
  'fortress rooms': () => roomGroup(fortressMap),
  'bandits 2-3': placed('bandit', '2-3'),
  'orc band 3-5': placed('orc', '3-5'),
  'troll': placed('troll', '1'),
  'Greyfang': placed('greyfang', '1'),
  'Grishak': placed('grishak', '1'),
  'Spider Queen': placed('spider_queen', '1'),
  'Hollow King': placed('hollow_king', '1'),
  'Old Gulper': placed('west_serpent', '1'),
  'Shadow Lord': placed('shadow_lord', '1'),
};
const STYLE = { 'barrow rooms': 'cave', 'fortress rooms': 'indoor', 'Hollow King': 'cave', 'Shadow Lord': 'indoor', 'Old Gulper': 'water' };

// One battle, or with CRAWL=n a run of n battles with no rest between them
// (health, mana, the fallen and potions carry over), as in a dungeon
const CRAWL = parseInt(process.env.CRAWL, 10) || 1;
async function fight(level, table) {
  const party = makeParty(level);
  const tot = { win: true, rounds: 0, lost: 0, dead: 0, xp: 0, heals: 0, potions: 0, specials: 0 };
  for (let k = 0; k < CRAWL; k++) {
    const r = await battle(level, table, party);
    if (!r) return null;
    tot.rounds += r.rounds / CRAWL; tot.xp += r.xp; tot.potions += r.potions; tot.lost += r.lost; tot.dead = r.dead;
    if (!r.win) { tot.win = false; break; }
  }
  return tot;
}

async function battle(level, table, party) {
  const before = party.members.reduce((t, m) => t + Math.max(0, m.hp), 0);
  const maxTotal = party.members.reduce((t, m) => t + R.maxHp(game, m), 0);
  const enemies = TABLES[table](level);
  if (!enemies) return null;
  const s = makeSession(party);
  const b = new Battle(s, enemies, STYLE[table] || rng.pick(['grass', 'grass', 'forest', 'hills']));
  const stats = { heals: 0, potions: 0, specials: 0 };
  b.heroTurn = (u) => heroAI(b, u, stats);
  // health is counted as the battle ends, before any level-up from its experience
  let after = 0;
  const finish = b.finish.bind(b);
  b.finish = (o) => { after = party.members.reduce((t, m) => t + Math.max(0, m.hp), 0); return finish(o); };
  // a hard cap on rounds so a stalemate cannot hang the run
  const orig = b.checkEnd.bind(b);
  b.checkEnd = () => orig() || (b.round > 30 ? 'fled' : null);
  const res = await b.run();
  return {
    win: res.outcome === 'victory', rounds: b.round, lost: (before - after) / maxTotal,
    dead: party.members.filter((m) => m.status === 'dead').length, xp: res.summary?.xp || 0, ...stats,
    foes: enemies.map((g) => `${g.n} ${g.id}`).join(' + '),
  };
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
const rows = [];
const LEVELS = (process.env.LEVELS || "1,2,3,4,5,6,7").split(",").map(Number);
const show = (process.argv[4] || '').split(',').filter(Boolean);
console.log(`Balance: ${N} ${CRAWL > 1 ? `runs of ${CRAWL} battles without rest` : 'battles'} per cell, seed ${SEED}. Company: dwarf warrior, elf ranger, human wizard, human cleric.`);
console.log('Each cell: win% · avg rounds · health lost · heroes fallen per fight · potions per fight\n');
for (const table of Object.keys(TABLES)) {
  if (show.length && !show.some((s) => table.toLowerCase().includes(s.toLowerCase()))) continue;
  const cells = [];
  for (const level of LEVELS) {
    let w = 0, r = 0, l = 0, d = 0, p = 0, n = 0, xp = 0;
    for (let i = 0; i < N; i++) {
      const res = await fight(level, table);
      if (!res) continue;
      n++; w += res.win; r += res.rounds; l += res.lost; d += res.dead; p += res.potions; xp += res.xp;
    }
    cells.push(n ? `${pct(w / n)} ${(r / n).toFixed(1).padStart(4)}r ${pct(l / n)} ${(d / n).toFixed(1)}† ${(p / n).toFixed(1)}p` : '—');
    rows.push({ table, level, win: w / n, rounds: r / n, lost: l / n, dead: d / n, potions: p / n, xp: xp / n });
  }
  console.log(table.padEnd(16), cells.map((c, i) => `L${LEVELS[i]} ${c}`).join(' | '));
}
const xpRow = rows.filter((r) => r.table === 'world (random)');
if (xpRow.length) console.log('\nXP per hero from a random world fight:', xpRow.map((r) => `L${r.level} ${Math.round(r.xp)}`).join(', '));
const hp = LEVELS.map((l) => { const p = makeParty(l); return `L${l} ` + p.members.map((m) => R.maxHp(game, m)).join('/'); });
console.log('Max health (warrior/ranger/wizard/cleric):', hp.join('  '));
