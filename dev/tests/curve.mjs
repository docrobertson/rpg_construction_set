// The difficulty curve, measured. For each level from 1 to 8 a company with
// the gear a player would really have by then (a dwarf warrior, an elf
// ranger, a human wizard and a human cleric, as tests/balance.mjs) meets the
// foes the game's own encounter tables would really send at that level
// (PlaySession.pickMonster over open country). Two measures, both with the
// real combat code (effects and sound stubbed out):
//   blows   each foe strikes each hero many times from full health, one on
//           one, on open ground: how often it hits, what an ordinary hit
//           costs as a share of health, how often one blow fells a hero
//   fights  whole battles against wandering bands, a sensible player at the
//           helm: wins, health lost, heroes fallen, and every blow struck
// Used by tests/tactics.mjs; run alone for the table:
//   node tests/curve.mjs [fights per level=30] [blows per hero and level=300]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const STUB_FX = `export class BattleFx { constructor() { return new Proxy(this, { get: (t, k) => k === 'danger' ? () => ({ remove() {} }) : () => Promise.resolve() }); } }`;
const STUB_NOOP = `export function sfx() {} export function playMusic() {} export function setMuted() {} export function isMuted() { return true; } export function musicEnabled() { return false; } export function setMusic() {}`;

async function load(src = process.env.SRC || path.join(HERE, '..', 'src')) {
  const entry = `
export { buildSampleGame } from './data/sample.js';
export * as rules from './game/rules.js';
export { Battle } from './game/combat.js';
export { rng, RNG } from './core/rng.js';
export { byId } from './data/schema.js';
export { T } from './data/terrain.js';
export * as session from './game/session.js';
`;
  const out = path.join(os.tmpdir(), `rpgcs-curve-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  await esbuild.build({
    stdin: { contents: entry, resolveDir: src, loader: 'js' },
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

// the company, and what it carries at each level (a player following the main quest)
const COMPANY = [['dwarf', 'warrior'], ['elf', 'ranger'], ['human', 'wizard'], ['human', 'cleric']];
const GEAR = {
  1: { warrior: ['long_sword', 'leather_armor', 'buckler'], ranger: ['short_sword', 'short_bow', 'leather_armor'], wizard: ['quarterstaff', 'robe'], cleric: ['mace', 'sling', 'leather_armor', 'buckler'] },
  3: { warrior: ['long_sword', 'chain_mail', 'kite_shield', 'crossbow'], ranger: ['short_sword', 'long_bow', 'studded_leather'], wizard: ['quarterstaff', 'robe'], cleric: ['mace', 'sling', 'chain_mail', 'buckler'] },
  5: { warrior: ['long_sword', 'scale_mail', 'kite_shield', 'crossbow'], ranger: ['short_sword', 'ember_bow', 'studded_leather'], wizard: ['quarterstaff', 'elven_cloak'], cleric: ['warhammer', 'sling', 'scale_mail', 'kite_shield'] },
  7: { warrior: ['runeblade', 'plate_armor', 'kite_shield', 'crossbow'], ranger: ['short_sword', 'elven_bow', 'studded_leather'], wizard: ['staff_of_power', 'elven_cloak'], cleric: ['warhammer', 'sling', 'scale_mail', 'kite_shield'] },
};
const HABITATS = ['grass', 'grass', 'forest', 'hills', 'swamp'];

// a seeded stand-in for Math.random (attributes that grow, reagents spared,
// a new RNG's own seed): the same run gives the same table every time
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function measure(opt = {}) {
  const real = Math.random;
  Math.random = seeded((opt.seed ?? 4242) * 7 + 1);
  try { return await measureRun(opt); } finally { Math.random = real; }
}

async function measureRun(opt) {
  const fights = opt.fights ?? 30, blows = opt.blows ?? 300, seed = opt.seed ?? 4242;
  const levels = opt.levels || [1, 2, 3, 4, 5, 6, 7, 8];
  const M = await load(opt.src);
  const { rules: R, Battle, rng, RNG, byId } = M;
  const { PlaySession, encounterCount } = M.session;
  { const r = new RNG(seed); rng.next = () => r.next(); rng.f = () => r.next(); }
  const game = M.buildSampleGame();
  R.ensureCombatData(game);
  const view = new Proxy({ rig: { pitch: 52, dist: 10, tdist: 10 } }, { get: (t, k) => (k in t ? t[k] : () => Promise.resolve()) });
  const makeSession = (party) => ({ game, view, party, map: { lighting: 'day', type: 'world' }, log: () => {}, currentLighting: () => 'day', app: { fade: async () => {} }, ui: new Proxy({}, { get: () => () => {} }) });
  const makeParty = (level) => {
    const tier = [7, 5, 3, 1].find((l) => level >= l);
    const members = COMPANY.map(([race, cls], i) => {
      const k = byId(game.classes, cls);
      const stats = { str: 11, dex: 11, int: 11, wis: 11 };
      for (const s of k.primary || []) stats[s] = 16;
      const c = R.createCharacter(game, { name: cls, race, cls, stats });
      c.id = `pc${i}_${level}`;
      R.normalizeMember(game, c, {});
      R.gainXp(game, c, Math.max(0, R.xpForLevel(level) - c.xp));
      while (c.points > 0) R.spendPoint(game, c, k.primary?.[c.points % 2] || 'str');
      while (c.perkPending > 0) R.choosePerk(game, c, R.perkChoices(game, c)[0].id);
      R.equipKit(game, c, GEAR[tier][cls], {});
      c.hp = R.maxHp(game, c); c.mp = R.maxMp(game, c);
      return c;
    });
    return { members, gold: 0, food: 50, inventory: { healing_draught: level >= 3 ? 3 : 2 }, flags: {}, light: 0 };
  };
  // the foes the tables send at this level, as often as they send them
  const foeMix = (level) => {
    const s = { game, party: makeParty(level), map: { encounters: [], level: 1, type: 'world' } };
    const out = [];
    for (let i = 0; i < 400; i++) { const m = PlaySession.prototype.pickMonster.call(s, rng.pick(HABITATS)); if (m) out.push(m); }
    return out;
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
    const danger = new Set(b.enemies.filter((e) => b.alive(e) && e.charging).flatMap((e) => e.charging.tiles.map((t) => `${t.x},${t.y}`)));
    if (danger.has(`${u.x},${u.y}`) && u.moves > 0) {
      const safe = [...b.reachable(u).values()].filter((c) => !c.ally && c.d > 0 && !danger.has(`${c.x},${c.y}`)).sort((p, q) => p.d - q.d)[0];
      if (safe) await moveTo(b, u, safe.x, safe.y);
    }
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
      if (special && special.move !== 'teleport' && foes.length >= 2) {
        const tg = b.abilityTargets(u, special);
        const hits = tg.kind === 'none' ? tg.units.length : 1;
        if (special.target === 'allAllies' || hits >= 2) {
          const t = tg.kind === 'enemy' ? tg.units.sort((p, q) => b.hpOf(p) - b.hpOf(q))[0] : null;
          if (await b.useAbility(u, special, t)) return; continue;
        }
      }
      const dmgSpell = b.combatSpells(u).filter((s) => s.effect === 'damage' && R.canCast(game, m, s, inv).ok && (s.target === 'enemy' || s.target === 'area' || s.target === 'allEnemies') && (!s.undeadOnly || foes.some((f) => f.def.undead)))
        .sort((p, q) => (q.level || 1) - (p.level || 1))[0];
      if (dmgSpell && m.mp >= (dmgSpell.cost || 0) * 2) {
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

  // every blow a foe strikes at a hero: [{ cls, hit, dmg, crit, max, full, fell }]
  const watch = (b, list) => {
    const strike = b.strike.bind(b);
    b.strike = async (u, t, o) => {
      if (u.side !== 'enemy' || !t.member) return strike(u, t, o);
      const m = t.member, max = R.maxHp(game, m), before = m.hp;
      const r = await strike(u, t, o);
      list.push({ cls: m.cls, foe: u.def.id, lv: u.def.level || 1, hit: !!r.hit, dmg: Math.max(0, before - Math.max(0, m.hp)), raw: r.dmg || 0, crit: !!r.crit, max, full: before >= max, fell: m.status === 'dead' });
      return r;
    };
  };

  const rows = [];
  for (const level of levels) {
    const mix = foeMix(level);
    const party = makeParty(level);
    // ---- blows: one on one, on open ground
    const blowsList = [], heroShots = [];
    {
      const s = makeSession(party);
      const b = new Battle(s, [{ id: mix[0].id, n: 1 }], 'grass');
      b.setup();
      b.arena.tiles.fill(M.T.grass);
      watch(b, blowsList);
      const park = (u, i) => { u.x = i; u.y = 0; };
      for (const [hi, hu] of b.partyUnits.entries()) {
        for (let k = 0; k < blows; k++) {
          const def = rng.pick(mix);
          b.units = b.units.filter((u) => u.member);
          const e = b.spawnEnemy(def);
          if (!e) continue;
          b.partyUnits.forEach(park);
          const ranged = (def.range || 1) > 1;
          hu.x = 6; hu.y = 6; hu.face = [0, -1];
          e.x = 6; e.y = ranged ? 3 : 5; e.face = [0, 1];
          hu.st = {}; hu.stun = 0; hu.sleep = 0; hu.dead = false; hu.reacted = false; hu.lastStood = false;
          hu.member.status = 'ok'; hu.member.hp = R.maxHp(game, hu.member); hu.member.buffs = [];
          b.current = e;
          await b.strike(e, hu);
          // and the hero's answer: how often a hero of this level lands a blow on what it meets
          if (b.alive(e) && b.alive(hu)) {
            e.x = 6; e.y = 5;
            const pv = b.preview(hu, e);
            if (pv) heroShots.push(pv.chance);
          }
          b.units = b.units.filter((u) => u !== e);
          void hi;
        }
      }
      b.units = b.units.filter((u) => u.member);
    }
    // ---- whole fights against wandering bands
    let win = 0, lost = 0, fallen = 0, rounds = 0, nf = 0;
    const fightBlows = [];
    for (let i = 0; i < fights; i++) {
      const p = makeParty(level);
      const s = makeSession(p);
      const sp = { game, party: p, map: { encounters: [], level: 1, type: 'world' } };
      const mon = PlaySession.prototype.pickMonster.call(sp, rng.pick(HABITATS));
      if (!mon) continue;
      const enemies = PlaySession.prototype.enemiesFor.call({ game, party: p }, { monster: mon.id, count: encounterCount(mon, level) });
      const before = p.members.reduce((t, m) => t + m.hp, 0), max = p.members.reduce((t, m) => t + R.maxHp(game, m), 0);
      const b = new Battle(s, enemies, rng.pick(['grass', 'grass', 'forest', 'hills']));
      b.heroTurn = (u) => heroAI(b, u);
      watch(b, fightBlows);
      let after = 0;
      const finish = b.finish.bind(b);
      b.finish = (o) => { after = p.members.reduce((t, m) => t + Math.max(0, m.hp), 0); return finish(o); };
      const orig = b.checkEnd.bind(b);
      b.checkEnd = () => orig() || (b.round > 30 ? 'fled' : null);
      const res = await b.run();
      nf++; win += res.outcome === 'victory'; lost += (before - after) / max; fallen += p.members.filter((m) => m.status === 'dead').length; rounds += b.round;
    }
    const of = (list, cls) => list.filter((x) => !cls || x.cls === cls);
    const rate = (list) => (list.length ? list.filter((x) => x.hit).length / list.length : 0);
    const share = (list) => { const h = list.filter((x) => x.hit && !x.crit); return h.length ? h.reduce((t, x) => t + x.raw / x.max, 0) / h.length : 0; };
    const worst = (list) => { const h = list.filter((x) => x.hit && !x.crit).map((x) => x.raw / x.max).sort((a, b) => a - b); return h.length ? h[Math.floor(h.length * 0.95)] : 0; };
    const oneShot = (list) => { const f = list.filter((x) => x.full); return f.length ? f.filter((x) => x.fell).length / f.length : 0; };
    const counts = {};
    for (const m of mix) counts[m.id] = (counts[m.id] || 0) + 1;
    rows.push({
      level,
      foes: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${Math.round((n / mix.length) * 100)}%`).join(', '),
      foeHit: Math.round((mix.reduce((t, m) => t + (m.hit || 0), 0) / mix.length) * 10) / 10,
      ac: Object.fromEntries(party.members.map((m) => [m.cls, R.armorClass(game, m)])),
      hp: Object.fromEntries(party.members.map((m) => [m.cls, R.maxHp(game, m)])),
      // (and by the foes of the company's own level, give or take one)
      hitLv: rate(blowsList.filter((x) => Math.abs(x.lv - level) <= 1)),
      hitLvBy: Object.fromEntries(COMPANY.map(([, c]) => [c, rate(of(blowsList, c).filter((x) => Math.abs(x.lv - level) <= 1))])),
      hit: rate(blowsList), hitBy: Object.fromEntries(COMPANY.map(([, c]) => [c, rate(of(blowsList, c))])),
      share: Object.fromEntries(COMPANY.map(([, c]) => [c, share(of(blowsList, c))])),
      worst: Object.fromEntries(COMPANY.map(([, c]) => [c, worst(of(blowsList, c))])),
      oneShot: oneShot(blowsList), oneShotBy: Object.fromEntries(COMPANY.map(([, c]) => [c, oneShot(of(blowsList, c))])),
      heroHit: heroShots.length ? heroShots.reduce((a, x) => a + x, 0) / heroShots.length : 0,
      win: nf ? win / nf : 0, lost: nf ? lost / nf : 0, fallen: nf ? fallen / nf : 0, rounds: nf ? rounds / nf : 0,
      fightHit: rate(fightBlows), fightOneShot: oneShot(fightBlows),
    });
  }
  return rows;
}

export function table(rows) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const out = [];
  out.push('Lv | foes hit heroes: all  war  ran  wiz  cle | foes of its level: all war wiz | ordinary hit, share of health: war  wiz (95th: war wiz) | one blow fells from full: all wiz | heroes hit foes | fights: win  lost  fallen  rounds');
  for (const r of rows) {
    out.push(`L${r.level} | ${pct(r.hit).padStart(4)} ${pct(r.hitBy.warrior).padStart(4)} ${pct(r.hitBy.ranger).padStart(4)} ${pct(r.hitBy.wizard).padStart(4)} ${pct(r.hitBy.cleric).padStart(4)} | ${pct(r.hitLv).padStart(4)} ${pct(r.hitLvBy.warrior).padStart(4)} ${pct(r.hitLvBy.wizard).padStart(4)}`
      + ` | ${pct(r.share.warrior).padStart(4)} ${pct(r.share.wizard).padStart(4)} (${pct(r.worst.warrior)} ${pct(r.worst.wizard)})`
      + ` | ${pct(r.oneShot).padStart(4)} ${pct(r.oneShotBy.wizard).padStart(4)} | ${pct(r.heroHit).padStart(4)}`
      + ` | ${pct(r.win).padStart(4)} ${pct(r.lost).padStart(4)} ${r.fallen.toFixed(2)} ${r.rounds.toFixed(1)}`);
  }
  out.push('');
  for (const r of rows) out.push(`L${r.level}  armour ${Object.entries(r.ac).map(([k, v]) => `${k} ${v}`).join(', ')} · health ${Object.entries(r.hp).map(([k, v]) => `${k} ${v}`).join(', ')} · foes met (avg +${r.foeHit} to hit): ${r.foes}`);
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rows = await measure({ fights: parseInt(process.argv[2], 10) || 30, blows: parseInt(process.argv[3], 10) || 300 });
  console.log(table(rows));
}
