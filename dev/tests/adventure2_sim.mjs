// The Lanterns' difficulty, fought out: real battles (the game's own combat
// code, headless, effects and sound stubbed out, as tests/balance.mjs does)
// at the points of the story where they come, with the company a player
// would really have there — a lone castaway at Gannet Rock, two at the
// Hollin Warren, four on the moor, six in the Drowned Palace — and the gear
// they could have bought or been given by then. Used by tests/adventure2.mjs;
// run alone for the table:  node tests/adventure2_sim.mjs [battles per row=40]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const STUB_FX = `export class BattleFx { constructor() { return new Proxy(this, { get: (t, k) => k === 'danger' ? () => ({ remove() {} }) : () => Promise.resolve() }); } }`;
const STUB_NOOP = `export function sfx() {} export function playMusic() {} export function setMuted() {} export function isMuted() { return true; } export function musicEnabled() { return false; } export function setMusic() {}`;

async function load() {
  const entry = `
export { buildLanternsGame } from './data/lanterns.js';
export * as rules from './game/rules.js';
export { Battle } from './game/combat.js';
export { rng, RNG } from './core/rng.js';
export { byId } from './data/schema.js';
export * as session from './game/session.js';
`;
  const out = path.join(os.tmpdir(), `rpgcs-lanterns-sim-${process.pid}.mjs`);
  await esbuild.build({
    stdin: { contents: entry, resolveDir: path.join(HERE, '..', 'src'), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
    plugins: [{
      name: 'stubs',
      setup(b) {
        b.onResolve({ filter: /render\/(fx|puzzles)\.js$/ }, (a) => ({ path: a.path.includes('puzzles') ? 'pz' : 'fx', namespace: 'stub' }));
        b.onResolve({ filter: /core\/(sound|music)\.js$/ }, () => ({ path: 'noop', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: a.path === 'fx' ? STUB_FX : a.path === 'pz' ? 'export const showPuzzle = () => {}, animatePuzzle = async () => {}, setPuzzleLights = () => {}, puzzleFx = () => new Proxy({}, { get: () => () => {} });' : STUB_NOOP, loader: 'js' }));
      },
    }],
  });
  const M = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  return M;
}

// the company at each point of the story: [race, class, gear], the castaway first
const HERO = { warrior: ['human', 'warrior'], cleric: ['human', 'cleric'], wizard: ['elf', 'wizard'] };
const KIT = {
  // what a lone castaway has on the strand, and what a few dozen crowns buy in Pebblewick
  1: { warrior: ['long_sword', 'leather_armor', 'buckler'], cleric: ['mace', 'leather_armor', 'buckler'], wizard: ['quarterstaff', 'robe'], ranger: ['spear', 'sling', 'leather_armor'] },
  3: { warrior: ['long_sword', 'chain_mail', 'kite_shield'], cleric: ['mace', 'chain_mail', 'buckler'], wizard: ['quarterstaff', 'robe'], ranger: ['spear', 'short_bow', 'studded_leather'], runesmith: ['warhammer', 'leather_armor'] },
  5: { warrior: ['long_sword', 'scale_mail', 'kite_shield'], cleric: ['aldhelm_mace', 'scale_mail', 'kite_shield'], wizard: ['quarterstaff', 'elven_cloak'], ranger: ['spear', 'kestrel_bow', 'studded_leather'],
    burglar: ['dagger', 'short_bow', 'saltwake_leathers'], paladin: ['long_sword', 'chain_mail', 'kite_shield'], runesmith: ['warhammer', 'chain_mail'] },
  // (Gaff's boat-hook is a spear: it goes to Kit, a ranger trained with spears, not to Mags, who is not)
  7: { warrior: ['sunsteel_spear', 'coral_mail', 'kite_shield'], cleric: ['aldhelm_mace', 'scale_mail', 'kite_shield'], wizard: ['quarterstaff', 'elven_cloak'], ranger: ['wreckers_hook', 'kestrel_bow', 'studded_leather'],
    burglar: ['dagger', 'short_bow', 'saltwake_leathers'], paladin: ['long_sword', 'plate_armor', 'kite_shield'], runesmith: ['warhammer', 'chain_mail'] },
};
const COMPANIONS = { kit: ['human', 'ranger'], thrain: ['dwarf', 'warrior'], wren: ['human', 'runesmith'], mags: ['human', 'burglar'], garrick: ['human', 'paladin'], elowen: ['elf', 'wizard'] };

// The fights: where, who stands with the castaway, at what level, and the foes;
// min: the share of fights a sensible player wins; lostMin: what a boss must
// cost the company in health at the least, so that it is never a walk-over
export const STAGES = [
  { name: 'Gannet Rock: rats (alone)', level: 1, with: [], foes: [['giant_rat', '1-2']], style: 'indoor', min: 0.8, max: 1 },
  { name: 'Gannet Rock: bats (alone)', level: 1, with: [], foes: [['bat_swarm', '1']], style: 'indoor', min: 0.8, max: 1 },
  { name: 'the strand: a shore crab (alone)', level: 1, with: [], foes: [['shore_crab', '1']], style: 'desert', min: 0.85, max: 1 },
  { name: 'Old Snapper (with Kit)', level: 2, with: ['kit'], foes: [['old_snapper', '1']], style: 'indoor', min: 0.55, max: 1, lostMin: 0.25 },
  { name: 'Hollin Warren rooms (with Kit)', level: 3, with: ['kit'], foes: [['goblin', '2-3'], ['giant_rat', '2-3']], style: 'cave', min: 0.7, max: 1 },
  { name: 'Grubnose the Goblin-King', level: 3, with: ['kit'], foes: [['grubnose', '1']], style: 'cave', min: 0.5, max: 1, lostMin: 0.25 },
  { name: 'Wreckers\' Hole: Gaff Hollis', level: 4, with: ['kit', 'thrain', 'wren'], foes: [['gaff_hollis', '1']], style: 'cave', min: 0.55, max: 1, lostMin: 0.25 },
  { name: 'Kestrel Pass: Red Jory', level: 5, with: ['kit', 'thrain', 'wren', 'mags'], foes: [['red_jory', '1']], style: 'hills', min: 0.55, max: 1, lostMin: 0.25 },
  { name: 'Mistwatch Abbey: Abbot Morcant', level: 5, with: ['kit', 'thrain', 'wren', 'mags'], foes: [['abbot_morcant', '1']], style: 'indoor', min: 0.55, max: 1, lostMin: 0.25 },
  { name: 'the Midway Light: wraiths', level: 6, with: ['kit', 'thrain', 'mags', 'garrick'], foes: [['mist_wraith', '2'], ['skeleton', '3-4']], style: 'indoor', min: 0.7, max: 1 },
  { name: 'Sunken Temple rooms', level: 6, with: ['kit', 'thrain', 'mags', 'garrick', 'elowen'], foes: [['lizardfolk', '3-4'], ['lizard_shaman', '1-2']], style: 'temple', min: 0.75, max: 1 },
  { name: 'Sunken Temple: stone guardians', level: 6, with: ['kit', 'thrain', 'mags', 'garrick', 'elowen'], foes: [['stone_guardian', '2']], style: 'temple', min: 0.75, max: 1 },
  { name: 'Ssessath the Serpent Priest', level: 7, with: ['kit', 'thrain', 'mags', 'garrick', 'elowen'], foes: [['serpent_priest', '1']], style: 'temple', min: 0.55, max: 1, lostMin: 0.25 },
  { name: 'Cinderwing (optional)', level: 7, with: ['kit', 'thrain', 'mags', 'garrick', 'elowen'], foes: [['cinderwing', '1']], style: 'ash', min: 0.4, max: 1, lostMin: 0.25 },
  { name: 'Nhalia the Drowned Queen', level: 8, with: ['kit', 'mags', 'garrick', 'elowen', 'wren'], foes: [['drowned_queen', '1']], style: 'temple', min: 0.45, max: 1, lostMin: 0.25 },
  // (a company that has done everything else first comes in two levels stronger: still a fight)
  { name: 'Nhalia, by a company that did it all', level: 10, with: ['kit', 'mags', 'garrick', 'elowen', 'wren'], foes: [['drowned_queen', '1']], style: 'temple', min: 0.7, max: 1, lostMin: 0.2 },
];

// Every roll of the run comes from the seed: the game's own dice (rng.f, which
// rng.int and rng.chance draw on, not only rng.next) and Math.random (the
// attributes that grow on levelling, reagents spared, new seeds), so the same
// code always gives the same table and the suite's bounds never fail at random
export async function simulate(n = 30, seed = 777, opt = {}) {
  const real = Math.random;
  let a = (seed * 7 + 1) >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return await simulateRun(n, seed, opt); } finally { Math.random = real; }
}

async function simulateRun(n, seed, opt) {
  const M = await load();
  const { rules: R, Battle, rng, RNG, byId } = M;
  const { PlaySession } = M.session;
  { const r = new RNG(seed); rng.next = () => r.next(); rng.f = () => r.next(); }
  const game = M.buildLanternsGame();
  R.ensureCombatData(game);
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : any()), apply: () => Promise.resolve() });
  void any;
  const view = new Proxy({ rig: { pitch: 52, dist: 10, tdist: 10 } }, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve()) });
  const makeSession = (party) => ({ game, view, party, map: { lighting: 'day', type: 'world' }, log: () => {}, currentLighting: () => 'day', app: { fade: async () => {} }, ui: new Proxy({}, { get: () => () => {} }) });
  const kitFor = (level, cls) => { const lv = [7, 5, 3, 1].find((l) => level >= l); for (const l of [lv, 5, 3, 1]) if (KIT[l]?.[cls]) return KIT[l][cls]; return byId(game.classes, cls)?.start || []; };
  const hero = (race, cls, level, name) => {
    const k = byId(game.classes, cls);
    const stats = { str: 11, dex: 11, int: 11, wis: 11 };
    for (const s of k.primary || []) stats[s] = 16;
    const c = R.createCharacter(game, { name, race, cls, stats });
    c.id = 'pc_' + name;
    R.normalizeMember(game, c, {});
    R.gainXp(game, c, Math.max(0, R.xpForLevel(level) - c.xp));
    while (c.points > 0) R.spendPoint(game, c, k.primary?.[c.points % 2] || 'str');
    while (c.perkPending > 0) R.choosePerk(game, c, R.perkChoices(game, c)[0].id);
    R.equipKit(game, c, kitFor(level, cls), {});
    c.hp = R.maxHp(game, c); c.mp = R.maxMp(game, c);
    return c;
  };
  const party = (st, heroCls) => {
    const members = [hero(...HERO[heroCls], st.level, 'castaway'), ...st.with.map((w) => hero(...COMPANIONS[w], st.level, w))];
    return { members, gold: 0, food: 50, inventory: { healing_draught: st.level >= 5 ? 3 : st.level >= 2 ? 2 : 1 }, flags: {}, light: 0 };
  };
  const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const frac = (b, x) => b.hpOf(x) / Math.max(1, b.maxHpOf(x));
  async function moveTo(b, u, x, y) {
    const p = b.pathTo(u, x, y);
    if (!p) return;
    for (const [px, py] of p.slice(1)) { if (!(await b.provoke(u, px, py))) return; u.x = px; u.y = py; u.moves--; }
  }
  // a sensible (not perfect) player, as in tests/balance.mjs
  async function heroAI(b, u) {
    u.moves = b.movesFor(u);
    const m = u.member, inv = b.s.party.inventory;
    for (let guard = 0; guard < 6 && b.alive(u) && !b.checkEnd(); guard++) {
      const foes = b.foesOf(u);
      if (!foes.length) return;
      const allies = b.friendsOf(u);
      const hurt = allies.filter((a) => frac(b, a) < 0.45).sort((p, q) => frac(b, p) - frac(b, q));
      const abs = b.abilitiesOf(u).filter((ab) => b.canUseAbility(u, ab).ok);
      if (hurt.length) {
        const mend = abs.find((ab) => ab.healPct && b.isSpecial(u, ab));
        if (mend && allies.filter((a) => frac(b, a) < 0.6).length >= 2) { if (await b.useAbility(u, mend, null)) return; continue; }
        const word = abs.find((ab) => ab.heal && ab.target === 'ally' && b.abilityTargets(u, ab).units.includes(hurt[0]));
        if (word) { if (await b.useAbility(u, word, hurt[0])) return; continue; }
        const sp = b.combatSpells(u).find((s) => s.effect === 'heal' && R.canCast(game, m, s, inv).ok);
        if (sp) { await b.castSpell(u, sp, sp.target === 'ally' ? hurt[0] : null); return; }
        if (frac(b, hurt[0]) < 0.3 && inv.healing_draught > 0) { await b.useItem(u, byId(game.items, 'healing_draught'), hurt[0]); return; }
      }
      const special = abs.find((ab) => b.isSpecial(u, ab) && !ab.heal && !ab.healPct);
      if (special && special.move !== 'teleport' && (foes.length >= 2 || foes.some((f) => f.def.boss))) {
        const tg = b.abilityTargets(u, special);
        const hits = tg.kind === 'none' ? tg.units.length : 1;
        if (special.target === 'allAllies' || hits >= 2 || (tg.kind === 'enemy' && tg.units.some((f) => f.def.boss))) {
          const t = tg.kind === 'enemy' ? tg.units.sort((p, q) => b.hpOf(p) - b.hpOf(q))[0] : null;
          if (await b.useAbility(u, special, t)) return; continue;
        }
      }
      const dmgSpell = b.combatSpells(u).filter((s) => s.effect === 'damage' && R.canCast(game, m, s, inv).ok && (s.target === 'enemy' || s.target === 'area' || s.target === 'allEnemies') && (!s.undeadOnly || foes.some((f) => f.def.undead)))
        .sort((p, q) => (q.level || 1) - (p.level || 1))[0];
      if (dmgSpell && (m.mp >= (dmgSpell.cost || 0) * 2 || foes.some((f) => f.def.boss))) {
        const ts = dmgSpell.target === 'allEnemies' ? [null] : foes.filter((f) => near(u, f) <= (dmgSpell.range || 7) && b.lineClear(u, f));
        if (ts.length) { await b.castSpell(u, dmgSpell, ts.sort((p, q) => b.hpOf(p || u) - b.hpOf(q || u))[0]); return; }
      }
      const skill = abs.find((ab) => !b.isSpecial(u, ab) && (ab.target === 'enemy' || ab.target === 'nearbyFoes' || ab.target === 'adjacentFoes') && !ab.free);
      if (skill) {
        const tg = b.abilityTargets(u, skill);
        const t = tg.kind === 'enemy' ? tg.units.sort((p, q) => b.hpOf(p) - b.hpOf(q))[0] : null;
        if (tg.kind !== 'enemy' || t) { if (await b.useAbility(u, skill, t)) return; continue; }
      }
      const ts = b.attackTargets(u).sort((p, q) => b.hpOf(p) - b.hpOf(q));
      if (ts.length) { await b.attack(u, ts[0]); return; }
      if (u.moves > 0) {
        const reach = b.reachable(u);
        let best = null, bs = Infinity;
        for (const c of reach.values()) {
          if (c.ally || c.d === 0) continue;
          let s;
          if (b.weaponRange(u) > 1) {
            const shots = foes.filter((f) => near(c, f) <= b.weaponRange(u) && b.lineClear(c, f)).length;
            s = (shots ? 0 : 50) + (Math.min(...foes.map((f) => near(c, f))) <= 1 ? 20 : 0) + c.d * 0.1;
          } else s = Math.min(...foes.map((f) => Math.abs(f.x - c.x) + Math.abs(f.y - c.y))) * 2 + c.d * 0.1;
          if (s < bs) { bs = s; best = c; }
        }
        if (best) { await moveTo(b, u, best.x, best.y); continue; }
      }
      break;
    }
  }
  const rows = [];
  for (const st of STAGES) {
    if (opt.only && !st.name.toLowerCase().includes(opt.only)) continue;
    let w = 0, lost = 0, dead = 0, rounds = 0, k = 0;
    for (const heroCls of Object.keys(HERO)) {
      for (let i = 0; i < n; i++) {
        const p = party(st, heroCls);
        const s = makeSession(p);
        const enemies = st.foes.flatMap(([id, count]) => PlaySession.prototype.enemiesFor.call({ game, party: p }, { monster: id, count }));
        const before = p.members.reduce((t, m) => t + m.hp, 0), max = p.members.reduce((t, m) => t + R.maxHp(game, m), 0);
        const b = new Battle(s, enemies, st.style);
        b.heroTurn = (u) => heroAI(b, u);
        let after = 0;
        const finish = b.finish.bind(b);
        b.finish = (o) => { after = p.members.reduce((t, m) => t + Math.max(0, m.hp), 0); return finish(o); };
        const orig = b.checkEnd.bind(b);
        b.checkEnd = () => orig() || (b.round > 30 ? 'fled' : null);
        const res = await b.run();
        k++; w += res.outcome === 'victory'; lost += (before - after) / max; dead += p.members.filter((m) => m.status === 'dead').length; rounds += b.round;
      }
    }
    rows.push({ ...st, win: w / k, lost: lost / k, dead: dead / k, rounds: rounds / k });
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rows = await simulate(parseInt(process.argv[2], 10) || 40, 777, { only: process.argv[3] });
  const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
  for (const r of rows) console.log(`${r.name.padEnd(38)} L${r.level} ×${1 + r.with.length}  win ${pct(r.win)}  health lost ${pct(r.lost)}  fallen ${r.dead.toFixed(1)}  rounds ${r.rounds.toFixed(1)}  ${r.win >= r.min && r.win <= r.max ? 'ok' : `(want ${pct(r.min)}–${pct(r.max)})`}`);
}
