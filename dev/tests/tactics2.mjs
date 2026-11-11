// Tactics II: the known gaps of the tactics pass, closed. High ground on the
// battlefield (raised squares in fitting arenas, +1 to shots from them and −1
// to blows struck up at them, shown on the odds card, in the move hover and
// as marks while moving; archers like it), shields that block (a chance to
// turn aside a blow that would land, not from behind; logged, flared, shown
// on the hero sheet, the tooltips and the chips), seasoned veterans when the
// company has far outgrown the open country, the cover a foe stands in kept
// visible in the see-through window, a fair migration for old classes'
// heavy-weapon training — and the curve that measures it all.
//   node --require ./tests/fast.cjs tests/tactics2.mjs     (NO_CURVE=1 skips the curve)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { measure, table } from './curve.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined && !ok ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };

// ------------------------------------------------------------ the curve, measured
if (!process.env.NO_CURVE) {
  const rows = await measure({ fights: parseInt(process.env.CURVE_FIGHTS, 10) || 40, blows: parseInt(process.env.CURVE_BLOWS, 10) || 600 });
  console.log(table(rows).split('\n').slice(0, rows.length + 1).map((l) => '   ' + l).join('\n'));
  const L = (n) => rows.find((r) => r.level === n);
  const pc = (x) => Math.round(x * 100);
  // (one run of the dice: the targets are ~45% and ~35%; a few points under is the dice)
  check('at levels 7 and 8 the real encounter mix still bites: heroes are hit 42% of the time or more (was 35%)', L(7).hit >= 0.42 && L(8).hit >= 0.42, [pc(L(7).hit), pc(L(8).hit)]);
  check('…because the open country\'s outgrown kinds come seasoned: a third or more of the bands at level 7, none at levels 1–3', L(7).vets >= 0.33 && [1, 2, 3].every((n) => L(n).vets === 0), rows.map((r) => pc(r.vets)));
  check('a level-7 warrior in plate with a kite shield is no longer near-immune: hit 28% or more by the real mix (was 20%), 35% or more by foes of their level', L(7).hitBy.warrior >= 0.28 && L(7).hitLvBy.warrior >= 0.35, [pc(L(7).hitBy.warrior), pc(L(7).hitLvBy.warrior)]);
  check('…and the kite shield earns its keep: it turns aside a sixth or so of the blows that would land (12–30%)', L(7).blockBy.warrior >= 0.12 && L(7).blockBy.warrior <= 0.3, pc(L(7).blockBy.warrior));
  check('a buckler blocks a tenth or so at level 1 (4–18%)', L(1).blockBy.warrior >= 0.04 && L(1).blockBy.warrior <= 0.18, pc(L(1).blockBy.warrior));
  check('fights stay winnable at every level (85% or more), and no ordinary blow fells a hero from full health', rows.every((r) => r.win >= 0.85 && r.oneShot === 0), rows.map((r) => [r.level, pc(r.win), pc(r.oneShot)]));
}

// ------------------------------------------------------------ the page
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', `${OUT}/${name}.png`); };
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(400);

// ------------------------------------------------------------ the rules: shields, veterans, high ground in the arena
const rules = await ev(() => {
  const T = window.__tactics, s = window.__app.session, g = s.game;
  const it = (id) => g.items.find((x) => x.id === id);
  const mk = (cls, level = 1) => { const c = T.createCharacter(g, { name: cls, race: 'human', cls, stats: { str: 14, dex: 14, int: 12, wis: 12 } }); c.level = level; T.normalizeMember(g, c, {}); return c; };
  const w = mk('warrior');
  const out = {};
  out.shields = ['buckler', 'kite_shield'].map((id) => [it(id).ac, T.blockOf(it(id))]);
  w.equip.shield = 'kite_shield'; out.kite = T.shieldBlock(g, w);
  w.equip.shield = 'buckler'; out.buckler = T.shieldBlock(g, w);
  w.equip.weapon = 'great_sword'; out.twoHanded = T.shieldBlock(g, w); w.equip.weapon = 'long_sword';
  out.cap = T.blockOf({ block: 0.9 });
  // veterans: a level-1 wolf for a level-7 company rises to level 5 and is named for it; an orc stays an "Orc Veteran"
  const wolf = g.monsters.find((m) => m.id === 'wolf'), orc = g.monsters.find((m) => m.id === 'orc');
  out.riseWolf = [T.veteranRise(g, wolf, 3), T.veteranRise(g, wolf, 4), T.veteranRise(g, wolf, 7)];
  const vw = T.veteranDef(g, wolf, T.veteranRise(g, wolf, 7));
  out.vetWolf = { name: vw.name, plural: vw.plural, level: vw.level, hit: vw.hit, dmg: vw.dmg, ac: vw.ac, hp: vw.hp, xp: vw.xp, base: [wolf.hit, wolf.dmg, wolf.ac, wolf.hp, wolf.xp] };
  out.vetOrc = T.veteranDef(g, orc, 2).name;
  const boss = g.monsters.find((m) => m.boss);
  out.boss = T.veteranRise(g, boss, 20);
  g.settings.veterans = 0; out.off = T.veteranRise(g, wolf, 9); g.settings.veterans = 3;
  out.mine = T.veteranRise(g, { ...wolf, veteran: false }, 9);
  // the encounter tables: a level-8 company on the grassland meets seasoned bands
  for (const m of s.party.members) m.level = 8;
  const met = [];
  for (let i = 0; i < 60; i++) { const m = s.pickMonster('grass'); if (m) met.push(m); }
  out.metVets = met.filter((m) => m.vet).length / met.length;
  const v = met.find((m) => m.vet);
  out.band = v ? s.enemiesFor({ monster: v.id, vet: v.vet, count: '3' }) : null;
  out.bandName = v?.name;
  const info = v && window.__app.playUI?.explore?.monsterInfo?.({ monster: v.id, vet: v.vet, count: '2-4' });
  out.info = info || null;
  for (const m of s.party.members) m.level = 1;
  // high ground in the arenas: grass and ruins have it, a town square and a ship's deck do not, and Rules can take it away
  const gen = window.__generate.generateArena;
  const highIn = (style, opt = {}) => { let n = 0; for (let k = 1; k <= 20; k++) { const a = gen(style, 1000 + k, opt); if (a.tiles.some((t) => [134, 135, 136].includes(t))) n++; } return n; };
  out.high = { grass: highIn('grass'), ruins: highIn('ruins'), cave: highIn('cave'), town: highIn('town'), water: highIn('water'), off: highIn('grass', { highGround: 0 }) };
  const a = gen('forest', 77);
  out.highRows = Array.from(a.tiles).map((t, i) => ([134, 135, 136].includes(t) ? Math.floor(i / a.w) : -1)).filter((y) => y >= 0);
  return out;
});
check('shields block and carry less flat armour: buckler 10% (+0), kite 20% (+0); at most 75%', JSON.stringify(rules.shields) === '[[0,0.1],[0,0.2]]' && rules.kite === 0.2 && rules.buckler === 0.1 && rules.cap === 0.75, rules);
check('…but not while a two-handed weapon fills both hands', rules.twoHanded === 0, rules.twoHanded);
check('veterans: a kind three levels below the company comes seasoned, rising to two levels below it', rules.riseWolf.join() === '0,1,4', rules.riseWolf);
check('…a seasoned wolf is a Dire Wolf: +1 to hit and damage a level risen, more health and armour, more experience', rules.vetWolf.name === 'Dire Wolf' && rules.vetWolf.plural === 'Dire Wolves' && rules.vetWolf.level === 5
  && rules.vetWolf.hit === rules.vetWolf.base[0] + 4 && rules.vetWolf.dmg === '1d6+5' && rules.vetWolf.ac === rules.vetWolf.base[2] + 2 && rules.vetWolf.xp > rules.vetWolf.base[4], rules.vetWolf);
check('…an orc without a name of its own is an "Orc Veteran"; never a boss, nor with Rules\' seasoned foes at 0, nor a monster kept as it is', rules.vetOrc === 'Orc Veteran' && rules.boss === 0 && rules.off === 0 && rules.mine === 0, rules);
check('a level-8 company on the grassland meets seasoned bands, and the band they bring is seasoned', rules.metVets > 0.5 && rules.band?.[0]?.vet > 0 && /Veteran|Dire|Plague|Great|Vampire/.test(rules.bandName), rules);
check('…the map\'s hover names them and says so', !!rules.info && rules.info.title.length > 0 && !/^Something/.test(rules.info.title) && /seasoned/.test(rules.info.sub), rules.info);
check('high ground: most grass, ruin and cave battlefields hold some, a town square and a ship\'s deck none, and none when the Rules say 0', rules.high.grass >= 12 && rules.high.ruins >= 12 && rules.high.cave >= 12 && rules.high.town === 0 && rules.high.water === 0 && rules.high.off === 0, rules.high);
check('…in the middle rows, clear of where either side starts', rules.highRows.length > 0 && rules.highRows.every((y) => y >= 2 && y <= 6), rules.highRows);

// ------------------------------------------------------------ the hero sheet, tooltips and chips
const sheet = await ev(async () => {
  const s = window.__app.session, ui = window.__app.playUI, g = s.game;
  const w = s.party.members.find((m) => m.cls === 'warrior') || s.party.members[0];
  w.cls = 'warrior'; w.equip.weapon = 'long_sword'; w.equip.shield = 'kite_shield'; w.equip.armor = 'chain_mail';
  s.party.inventory.buckler = 1;
  document.querySelectorAll('.chbanner, .qbanner').forEach((e) => e.remove());
  ui.openParty();
  await new Promise((r) => setTimeout(r, 300));
  const row = [...document.querySelectorAll('.inv-row')].find((r) => r.textContent.includes('Buckler'));
  const chip = row && [...row.querySelectorAll('.cmp')].find((c) => c.textContent.includes(w.name));
  const title = row?.title || '';
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
  ui.selectHero(w);
  await new Promise((r) => setTimeout(r, 300));
  const num = document.querySelector('.num i.block')?.textContent || '';
  const train = [...document.querySelectorAll('.sheet-train .tr-row')].map((e) => e.textContent).join(' | ');
  return { chip: chip?.textContent || '', title, num, train, name: w.name };
});
check('the hero sheet shows the shield\'s block beside the armour, and says what it does', /^20%$/.test(sheet.num) && /Kite Shield blocks 20% of the blows that would land — not one from behind/.test(sheet.train), sheet);
check('…the Pack\'s chip for a buckler says what it costs her (−10% block)', /−10% block/.test(sheet.chip), sheet.chip);
check('…and its tooltip how it blocks', /Blocks 10% of the blows and shots that would land/.test(sheet.title), sheet.title);
await shot('tactics2-sheet-block');
await ev(() => window.__app.playUI.closeHero());

// ------------------------------------------------------------ a battle to try it all in
await ev(() => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.level = 3; m.perkPending = 0; m.lvShown = 3; m.status = 'ok'; m.hp = window.__tactics.maxHp(s.game, m); m.mp = 40; }
  s.fight([{ id: 'goblin', n: 2 }], 'grass', {});
});
const heroUp = async () => {
  for (let i = 0; i < 160; i++) {
    if (await ev(() => { const b = window.__app.session.battle; return !!(b && b.active && !b.acting); })) return true;
    await wait(100);
  }
  return false;
};
check('a battle starts and a hero gets a turn', await heroUp());
await ev(() => {
  const s = window.__app.session, b = s.battle, g = s.game, T = window.__tactics;
  const rng = window.__delve.rng;
  window.__S = {
    b, g, s, T,
    hero: (cls, i, weapon, ranged = null, shield = null) => {
      const u = b.partyUnits[i];
      const m = u.member;
      m.cls = cls; m.level = 3; m.status = 'ok'; u.dead = false;
      m.equip.weapon = weapon || null; m.equip.ranged = ranged; m.equip.shield = shield;
      m.hp = T.maxHp(g, m);
      return u;
    },
    put: (u, x, y) => { u.x = x; u.y = y; b.view.placeEntity(u.id, x, y); },
    reset: (n = 1, id = 'goblin') => {
      const def = g.monsters.find((m) => m.id === id);
      let foes = b.enemies.filter((e) => b.alive(e) && e.def.id === id);
      for (const e of b.enemies.filter((e) => b.alive(e) && e.def.id !== id)) { e.fled = true; b.view.removeEntity(e.id); }
      while (foes.length < n) { b.spawnEnemy(def); foes = b.enemies.filter((e) => b.alive(e) && e.def.id === id); }
      for (const e of foes.slice(n)) { e.fled = true; b.view.removeEntity(e.id); }
      foes = foes.slice(0, n);
      [...b.partyUnits, ...foes].forEach((u, i) => {
        u.st = {}; u.cd = {}; u.uses = {}; u.stun = 0; u.sleep = 0; u.fear = 0; u.reacted = false; u.charging = null; u.lastStood = false;
        if (u.member) { u.member.status = 'ok'; u.dead = false; u.member.hp = T.maxHp(g, u.member); } else { u.hp = u.maxHp = 200; }
        window.__S.put(u, i % 13, i < 13 ? 0 : 8);
      });
      return foes;
    },
    // a flat, open field of the arena's own ground (the pictures paint what they need on it)
    flat: () => { const k = window.__S.ground ?? (window.__S.ground = window.__T.grass); b.arena.tiles.fill(k); b.view.refreshTiles(0, 0, b.arena.w - 1, b.arena.h - 1); },
    paint: (x, y, key) => { b.arena.tiles[y * b.arena.w + x] = window.__T[key]; b.view.refreshTiles(x, y, x, y); },
    // the dice: f() gives each roll in turn (then 0.5)
    rolls: (...seq) => { const f = rng.f; let i = 0; rng.f = () => (i < seq.length ? seq[i++] : 0.5); return () => { rng.f = f; }; },
    logs: (n = 8) => [...document.querySelectorAll('.log-line')].slice(-n).map((l) => l.textContent),
  };
  window.__T = Object.fromEntries([['knoll', 134], ['rise', 135], ['dais', 136], ['tree', 56], ['grass', 2]]);
});
const T = async (name, fn) => ev(async (src) => {
  const S = window.__S, ref = S.b.order, copy = [...ref], ti = S.b.turnIdx;
  try { return await (0, eval)(`(${src})`)(S); } catch (e) { return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') }; } finally {
    ref.length = 0; ref.push(...copy); S.b.order = ref; S.b.turnIdx = ti;
  }
}, fn.toString());

let r;
// ------------------------------------------------------------ shields block
r = await T('a block', async (S) => {
  const { b } = S; S.flat(); const [g1] = S.reset(1);
  const w = S.hero('warrior', 0, 'long_sword', null, 'kite_shield');
  S.put(w, 5, 4); S.put(g1, 5, 3); w.face = [0, -1]; g1.face = [0, 1];
  const md = b.strikeMods(g1, w, b.strikeKit(g1, w));
  // a d20 of 20 (a hit), then the shield's own roll of 0.05 (under its 20%)
  let undo = S.rolls(0.97, 0.05);
  let res;
  const hp = w.member.hp;
  try { res = await b.strike(g1, w); } finally { undo(); }
  const hp1 = w.member.hp;
  const log = S.logs(2), fx = [...document.querySelectorAll('.fx-num')].map((e) => e.textContent);
  // the same blow from behind: no block
  S.put(g1, 5, 5);
  const back = b.strikeMods(g1, w, b.strikeKit(g1, w));
  undo = S.rolls(0.97, 0.05);
  let res2;
  try { res2 = await b.strike(g1, w); } finally { undo(); }
  // a sleeping bearer blocks nothing
  S.put(g1, 5, 3); w.sleep = 2; const asleep = b.blockChance(w, g1); w.sleep = 0;
  // a hero striking a foe with a shield of its own: the odds say so
  g1.face = [0, 1];
  g1.def = { ...g1.def, block: 0.2 };
  const pv = b.preview(w, g1); g1.def = { ...g1.def, block: 0 };
  const pv0 = b.preview(w, g1);
  return { md: md.block, res, hp: [hp, hp1], log, fx, back: back.block, backNote: back.notes, res2: res2.hit, asleep, pv: [pv.chance, pv0.chance, pv.notes] };
});
check('a blow that would land is turned aside on the kite shield: no harm, logged by name', r.md === 0.2 && r.res?.blocked && !r.res.hit && r.hp[0] === r.hp[1] && r.log.some((l) => /blocks the Goblin( A)?'s blow with the Kite Shield/.test(l)), r);
check('…with a flare and "Blocked!" over the bearer', r.fx.includes('Blocked!'), r.fx);
check('…but not a blow from behind ("From behind: no block"), nor while the bearer sleeps', r.back === 0 && r.backNote.includes('From behind: no block') && r.res2 === true && r.asleep === 0, r);
check('a foe\'s shield shows on the odds card ("Shield blocks 20%") and takes its share off the chance', r.pv[2].includes('Shield blocks 20%') && Math.abs(r.pv[0] - r.pv[1] * 0.8) < 1e-9, r.pv);

// what the player sees: the block in the log and on the field
await ev(() => document.querySelectorAll('.log-line, .chbanner, .qbanner').forEach((l) => l.remove()));
await T('block picture', async (S) => {
  const { b } = S; S.flat(); const [g1] = S.reset(1, 'orc');
  const w = S.hero('warrior', 0, 'long_sword', null, 'kite_shield');
  S.put(w, 6, 5); S.put(g1, 6, 4); w.face = [0, -1]; g1.face = [0, 1];
  b.view.face?.(w.id, 0, -1); b.view.face?.(g1.id, 0, 1);
  for (const p of b.partyUnits.slice(1)) S.put(p, 1 + b.partyUnits.indexOf(p) * 2, 8);
  b.active = w; w.moves = 0; w.maxMoves = 3;
  window.__app.playUI.combatTurn?.(w);
  b.view.setHighlights(null); window.__app.playUI.chud.setMarks(null);
  const undo = S.rolls(0.9, 0.04);
  try { await b.strike(g1, w); } finally { undo(); }
  return true;
});
// (the flare is over in a blink: for the picture it shows again with the battle's clock slowed)
await wait(900);
await ev(() => { const b = window.__S.b; document.querySelectorAll('.fx-num').forEach((e) => e.remove()); window.__ts = b.view.timeScale; b.view.timeScale = 0.08; b.fx.block(b.partyUnits[0], b.enemies.find((e) => b.alive(e))); });
await wait(450);
await shot('tactics2-block');
await ev(() => { window.__S.b.view.timeScale = window.__ts; });
const blockLog = await ev(() => [...document.querySelectorAll('.log-line')].slice(-3).map((l) => l.textContent));
check('the picture: the orc\'s blow turned aside, in the log', blockLog.some((l) => /blocks the Orc( A)?'s blow with the Kite Shield/.test(l)), blockLog);

// ------------------------------------------------------------ high ground in battle
r = await T('high ground', async (S) => {
  const { b } = S; S.flat(); const [g1] = S.reset(1);
  const ra = S.hero('ranger', 0, 'short_sword', 'short_bow');
  S.put(ra, 5, 6); S.put(g1, 5, 2);
  const flat = b.preview(ra, g1);
  S.paint(5, 6, 'knoll');
  const up = b.preview(ra, g1);
  // both on high ground: no edge
  S.paint(5, 2, 'knoll');
  const both = b.preview(ra, g1);
  S.paint(5, 2, 'grass');
  // a blow struck up at a goblin on the knoll is −1; down from it, no penalty
  const sw = S.hero('warrior', 1, 'long_sword');
  S.put(g1, 6, 6); S.put(sw, 7, 6); S.put(ra, 1, 1);
  S.paint(6, 6, 'knoll'); S.paint(5, 6, 'grass');
  const uphill = b.preview(sw, g1);
  S.paint(6, 6, 'grass');
  const level = b.preview(sw, g1);
  S.paint(6, 6, 'knoll');
  // Rules: no high ground
  b.game.settings.highGround = 0; const off = b.preview(sw, g1); b.game.settings.highGround = 1;
  S.paint(6, 6, 'grass');
  return { flat: [flat.chance, flat.notes], up: [up.chance, up.notes], both: both.notes, uphill: [uphill.chance, uphill.notes], level: level.chance, off: off.notes, heights: [b.view.heightAt(5, 5), (S.paint(5, 5, 'knoll'), b.view.heightAt(5, 5))] };
});
check('a shot down from the knoll: "High ground +1" on the odds card, and 5% better odds', r.up[1].includes('High ground +1') && Math.abs(r.up[0] - r.flat[0] - 0.05) < 1e-9 && !r.flat[1].some((n) => /High ground/.test(n)), r);
check('…none when the foe is up there too', !r.both.some((n) => /High ground/.test(n)), r.both);
check('a blow struck up at a foe on high ground: "Uphill −1", 5% worse; none when the Rules say 0', r.uphill[1].includes('Uphill −1') && Math.abs(r.level - r.uphill[0] - 0.05) < 1e-9 && !r.off.some((n) => /Uphill/.test(n)), r);
check('…and a knoll stands clearly higher than the grass round it (half a figure or so)', r.heights[1] - r.heights[0] > 0.4, r.heights);

r = await T('archer on the hill', async (S) => {
  const { b } = S; S.flat(); S.reset(1);
  for (const e of b.enemies.filter((e) => b.alive(e))) { e.fled = true; b.view.removeEntity(e.id); }
  const ar = b.spawnEnemy(S.g.monsters.find((m) => m.id === 'orc_archer'));
  ar.hp = ar.maxHp = 200;
  const ra = S.hero('ranger', 0, 'short_sword', null);
  for (const p of b.partyUnits.slice(1)) S.put(p, 12, 8 - b.partyUnits.indexOf(p));
  S.put(ra, 6, 7); S.put(ar, 6, 2);
  // two squares it could shoot from: open grass, or the knoll beside it
  S.paint(4, 2, 'knoll');
  await b.reposition(ar, 3, ra, 'archer');
  const on = b.highGround(ar.x, ar.y);
  S.paint(4, 2, 'grass');
  ar.fled = true; b.view.removeEntity(ar.id);
  return { on, at: [ar.x, ar.y] };
});
check('an orc archer takes the high ground to shoot from', r.on, r);

// the picture: a hero about to step up onto a knoll, the odds card with "High ground +1"
await ev(() => document.querySelectorAll('.log-line').forEach((l) => l.remove()));
const hg = await T('high ground picture', async (S) => {
  const { b } = S; S.flat(); const [g1, g2] = S.reset(2, 'orc');
  for (const [x, y] of [[2, 4], [3, 4], [2, 5], [10, 2], [11, 2]]) S.paint(x, y, 'knoll');
  S.paint(7, 3, 'tree'); S.paint(0, 6, 'tree'); S.paint(12, 4, 'tree');
  const ra = S.hero('ranger', 0, 'short_sword', 'short_bow'), w = S.hero('warrior', 1, 'long_sword', null, 'kite_shield');
  S.put(ra, 3, 4); S.put(w, 5, 6); S.put(g1, 6, 1); S.put(g2, 8, 2);
  for (const p of b.partyUnits.slice(2)) S.put(p, 6 + b.partyUnits.indexOf(p) * 2, 8);
  ra.face = [1, -1]; b.view.face?.(ra.id, 1, -1); b.view.face?.(w.id, 0, -1);
  b.active = ra; ra.moves = 0; ra.maxMoves = 3;
  window.__app.playUI.combatTurn(ra);
  await new Promise((res) => setTimeout(res, 200));
  window.__app.playUI.chud.beginAttack();
  await new Promise((res) => setTimeout(res, 200));
  return { g1: [g1.x, g1.y], high: b.highGround(ra.x, ra.y) };
});
const hoverAt = (x, y, dx = 0, dy = 0) => ev(({ x, y, dx, dy }) => {
  const chud = window.__app.playUI.chud;
  const p = chud.view.worldToScreen(x + 0.5, chud.view.heightAt(x, y), y + 0.5);
  chud.hover({ x, y }, { clientX: p.x + dx, clientY: p.y + dy });
  return document.querySelector('.cbt-tip')?.textContent || '';
}, { x, y, dx, dy });
const hgCard = await hoverAt(hg.g1[0], hg.g1[1], 70, -40);
check('aiming from the knoll, the odds card says "High ground +1"', hg.high && /High ground \+1/.test(hgCard), hgCard);
await ev(() => window.__app.playUI.chud.view.showCursor(null));
await wait(200);
await shot('tactics2-high-ground-odds');
await ev(() => window.__app.playUI.cancelTargeting());
// moving: the knoll's squares carry a gold mark, and hovering one says what it gives
const mv = await T('high ground moves', async (S) => {
  const { b } = S;
  const w = b.partyUnits[1];
  S.put(w, 4, 6);
  b.active = w; w.moves = 3; w.maxMoves = 3;
  window.__app.playUI.combatTurn(w);
  await new Promise((res) => setTimeout(res, 250));
  return { marks: [...document.querySelectorAll('.cbt-mark.high')].length, at: [w.x, w.y] };
});
const mvTip = await hoverAt(2, 5, 40, -120);
check('while moving, the high squares in reach carry a mark', mv.marks > 0, mv);
check('…and the move hover says "High ground: +1 to your shots"', /High ground: \+1 to your shots/.test(mvTip), mvTip);
await wait(200);
await shot('tactics2-high-ground-move');

// ------------------------------------------------------------ cover kept in sight
await ev(() => window.__app.playUI.chud.view.showCursor(null));
const cov = await T('cover scene', async (S) => {
  const { b } = S; S.flat(); const [g1] = S.reset(1);
  for (const e of b.enemies.filter((e) => b.alive(e))) { e.fled = true; b.view.removeEntity(e.id); }
  const ar = b.spawnEnemy(S.g.monsters.find((m) => m.id === 'orc_archer'));
  ar.hp = ar.maxHp = 200;
  void g1;
  // the archer stands just north of a tree; the ranger shoots from the south, past the tree's side
  const tree = { x: 6, y: 3 };
  S.paint(tree.x, tree.y, 'tree');
  S.paint(3, 1, 'tree'); S.paint(9, 2, 'tree'); S.paint(1, 5, 'tree'); S.paint(11, 6, 'tree');
  S.put(ar, 6, 2);
  const ra = S.hero('ranger', 0, 'short_sword', 'short_bow');
  for (const p of b.partyUnits.slice(1)) S.put(p, 1 + b.partyUnits.indexOf(p) * 2, 8);
  // a square south-east of it with a clear line past the tree's side, in range
  let best = null;
  for (let y = 4; y < b.arena.h; y++) for (let x = 7; x < b.arena.w; x++) {
    const at = { ...ra, x, y };
    if ((!b.walkable(x, y, ra) && !(x === ra.x && y === ra.y)) || b.dist(at, ar) < 3 || b.dist(at, ar) > b.weaponRange(ra) || !b.lineClear(at, ar) || !b.inCover(ar, at)) continue;
    if (!best || b.dist(at, ar) < b.dist(best, ar)) best = { x, y };
  }
  if (best) S.put(ra, best.x, best.y);
  ra.face = [0, -1]; ar.face = [0, 1]; b.view.face?.(ar.id, 0, 1); b.view.face?.(ra.id, 0, -1);
  b.active = ra; ra.moves = 0; ra.maxMoves = 3;
  window.__app.playUI.combatTurn(ra);
  await new Promise((res) => setTimeout(res, 200));
  window.__app.playUI.chud.beginAttack();
  await new Promise((res) => setTimeout(res, 200));
  return { tree, ar: [ar.x, ar.y], cover: b.inCover(ar, ra), ok: b.canAttack(ra, ar), squares: b.coverSquares(ar, ra) };
});
check('a scene: an orc archer in the lee of a tree, a ranger aiming at it', cov.cover && cov.ok && cov.squares.some((c) => c.x === cov.tree.x && c.y === cov.tree.y), cov);
const covCard = await hoverAt(cov.ar[0], cov.ar[1], -380, -40);
await wait(250);
const cut = await ev((cv) => {
  const v = window.__app.playUI.chud.view;
  const t = cv.tree;
  // the tree's crown, over its square (the part that stands in front of the archer)
  const pts = [[0.5, 0.9, 0.5], [0.35, 1.1, 0.6], [0.65, 0.7, 0.45], [0.5, 1.3, 0.3]].map(([dx, y, dz]) => [t.x + dx, v.heightAt(t.x, t.y) + y, t.y + dz]);
  const kept = Math.max(...pts.map((p) => v.cutAt(...p)));
  const keep = (v.cutKeep || []).map((c) => `${c.x},${c.y}`);
  // the same window without the keep: what it was before
  const was = v.cutKeep;
  v.setCutKeep(null);
  const bare = Math.max(...pts.map((p) => v.cutAt(...p)));
  v.setCutKeep(was);
  return { kept, bare, keep };
}, cov);
check('aiming at a foe in cover, the odds card leads with Cover −3', /Cover −3/.test(covCard), covCard);
check('…and the tree that gives the cover is kept: only lightly ghosted (at most 35%) where the window would clear it', cut.keep.includes(`${cov.tree.x},${cov.tree.y}`) && cut.kept <= 0.35 && cut.bare >= 0.6, cut);
await shot('tactics2-cover-kept');
await ev(() => window.__app.playUI.cancelTargeting());
const after = await ev(() => { window.__app.playUI.chud.hover(null, {}); return (window.__app.playUI.chud.view.cutKeep || []).length; });
check('…and the keep is let go once the pointer moves off', after === 0, after);

// ------------------------------------------------------------ veterans in battle
r = await T('veterans in battle', async (S) => {
  const { b } = S;
  const grp = { id: 'orc', n: 1, vet: 3 };
  const d = b.groupDef(grp);
  const e = b.spawnEnemy(d);
  const names = b.facing([grp, { id: 'wolf', n: 2, vet: 4 }]);
  e.fled = true; b.view.removeEntity(e.id);
  return { name: e.name, hit: e.def.hit, base: S.g.monsters.find((m) => m.id === 'orc').hit, level: e.def.level, names };
});
check('a seasoned band fights under its seasoned name and figures: "an Orc Veteran and 2 Dire Wolves"', r.name === 'Orc Veteran' && r.hit === r.base + 3 && r.level === 5 && r.names === 'an Orc Veteran and 2 Dire Wolves', r);

await ev(() => { const s = window.__app.session; if (s.battle) s.battle.abort(); });
for (let i = 0; i < 40 && await ev(() => !!window.__app.session.battle || window.__app.session.mode === 'combat'); i++) await wait(100);
await wait(600);

// ------------------------------------------------------------ older games
const old = await ev(() => {
  const sch = window.__schema, base = JSON.parse(sch.serializeGame(window.__app.session.game));
  const mk = (v) => {
    const g = JSON.parse(JSON.stringify(base));
    if (v == null) delete g.settings.tacticsV; else g.settings.tacticsV = v;
    delete g.settings.veterans; delete g.settings.highGround;
    const it = (id) => g.items.find((x) => x.id === id);
    it('buckler').ac = 1; delete it('buckler').block;
    it('kite_shield').ac = 2; delete it('kite_shield').block;
    g.items.push({ id: 'my_shield', name: 'My Shield', type: 'shield', ac: 2 });
    for (const m of g.monsters) { delete m.vetName; delete m.vetPlural; }
    if (v == null) for (const k of g.classes) delete k.heavyWeapons;
    // a designer's own callings, saved before training: one that wielded axes (the battle axe among them), one only blades
    g.classes.push({ id: 'woodsman', name: 'Woodsman', weapons: ['axe', 'bow'], armor: 'leather', shields: false });
    g.classes.push({ id: 'duelist', name: 'Duelist', weapons: ['blade', 'dagger'], armor: 'leather', shields: false });
    g.classes.push({ id: 'brawler', name: 'Brawler', weapons: [], armor: 'leather', shields: false });
    // (the built-in ranger, as it came, lists axes too: it keeps its own mark)
    return sch.deserializeGame(JSON.stringify(g));
  };
  const g0 = mk(null), g1 = mk(1);
  const k = (g, id) => g.classes.find((c) => c.id === id);
  const sh = (g, id) => { const i = g.items.find((x) => x.id === id); return [i.ac, i.block ?? null]; };
  const T = window.__tactics;
  const axe = g0.items.find((x) => x.id === 'battle_axe');
  const hero = (g, cls) => { const c = T.createCharacter(g, { name: 'x', race: 'human', cls, stats: {} }); return T.training(g, c, axe).ok; };
  return {
    v0: { woodsman: k(g0, 'woodsman').heavyWeapons, duelist: k(g0, 'duelist').heavyWeapons, brawler: k(g0, 'brawler').heavyWeapons, ranger: k(g0, 'ranger').heavyWeapons, warrior: k(g0, 'warrior').heavyWeapons,
      axe: hero(g0, 'woodsman'), duelAxe: hero(g0, 'duelist') },
    v1: { woodsman: k(g1, 'woodsman').heavyWeapons ?? null, axe: hero(g1, 'woodsman') },
    shields: [sh(g0, 'buckler'), sh(g0, 'kite_shield'), sh(g0, 'my_shield'), sh(g1, 'kite_shield')],
    rules: [g0.settings.veterans, g0.settings.highGround, g0.settings.tacticsV, g1.settings.tacticsV],
    names: [g0.monsters.find((m) => m.id === 'wolf').vetName, g0.monsters.find((m) => m.id === 'orc').vetName ?? null],
  };
});
check('an old custom class that wielded axes keeps the battle axe (heavy-trained); one of blades only does not; one with no list wields all', old.v0.woodsman === true && old.v0.axe && old.v0.duelist === false && !old.v0.duelAxe && old.v0.brawler === true, old.v0);
check('…while the built-in callings, as they came, take their own marks (ranger no, warrior yes)', old.v0.ranger === false && old.v0.warrior === true, old.v0);
check('…a class made since training came is left to the designer', old.v1.woodsman === null && old.v1.axe === false, old.v1);
check('older games\' built-in shields take their new figures (buckler +0 and 10%, kite +0 and 20%), a designer\'s own is left alone', JSON.stringify(old.shields) === '[[0,0.1],[0,0.2],[2,null],[0,0.2]]', old.shields);
check('…and the new rules, with their defaults (seasoned foes at 3, high ground +1), and the beasts\' seasoned names', old.rules.join() === '3,1,2,2' && old.names[0] === 'Dire Wolf' && old.names[1] === null, old);

// ------------------------------------------------------------ the Construction Set
const cs = await ev(async () => {
  const app = window.__app, g = app.session?.game || app.sample;
  const cats = window.__editorCats ? window.__editorCats(g) : null;
  const f = (c, key) => cats?.[c]?.fields.find((x) => x.key === key);
  const kite = g.items.find((i) => i.id === 'kite_shield'), sword = g.items.find((i) => i.id === 'long_sword');
  return {
    block: !!f('items', 'block') && f('items', 'block').show(kite) && !f('items', 'block').show(sword),
    mBlock: !!f('monsters', 'block'), vet: !!f('monsters', 'veteran'), vetName: !!f('monsters', 'vetName'),
  };
});
check('World Data: a shield\'s block; a monster\'s shield, and whether and as what it comes seasoned', cs.block && cs.mBlock && cs.vet && cs.vetName, cs);
const ed = await ev(async () => {
  const app = window.__app;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  app.stopSession?.();
  app.openEditor(app.sample);
  await sleep(1200);
  const e = app.editor;
  e.setTab('rules');
  await sleep(300);
  const sec = document.querySelector('#set-battle');
  const labels = sec ? [...sec.querySelectorAll('.field-label')].map((l) => l.textContent) : [];
  [...(sec?.querySelectorAll('.field') || [])].find((x) => /High ground/.test(x.textContent))?.scrollIntoView({ block: 'center' });
  return { labels };
});
check('Rules → Battle: high ground and seasoned foes', ed.labels.some((l) => /^High ground/.test(l)) && ed.labels.some((l) => /^Seasoned foes/.test(l)), ed.labels);
await wait(200);
await shot('tactics2-cs-rules');
const edItem = await ev(async () => {
  const e = window.__app.editor;
  e.setTab('data');
  e.db.cat = 'items'; e.db.sel = e.game.items.find((i) => i.id === 'kite_shield'); e.db.render();
  await new Promise((r) => setTimeout(r, 300));
  const field = [...document.querySelectorAll('.field')].find((f) => /Blocks \(0\.15 = 15%\)/.test(f.textContent));
  field?.scrollIntoView({ block: 'center' });
  return { val: field?.querySelector('input')?.value };
});
check('the kite shield\'s form shows its block (0.2)', edItem.val === '0.2', edItem);
await shot('tactics2-cs-shield');

check('no errors in the page', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nall tactics II checks passed');
process.exit(fails.length ? 1 : 0);
