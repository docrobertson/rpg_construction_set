// Regression checks for bugs found in review (each prints PASS/FAIL).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1000);
const ev = (fn, a) => page.evaluate(fn, a);
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const fresh = () => ev(async () => {
  const app = window.__app;
  if (app.session) app.endPlay(false);
  app.playGame(app.sample, { quick: true, noSave: true });
  await new Promise((r) => setTimeout(r, 1500));
});
const sleep = (ms) => `new Promise((r) => setTimeout(r, ${ms}))`;

// 1. moving during a map change must not wedge the party
await fresh();
let r = await ev(async () => {
  const s = window.__app.session;
  const town = s.game.maps.find((m) => m.name === 'Westhold');
  const p = s.enterMap(town.id, town.entry.x, town.entry.y);
  s.move(0, -1);
  await p;
  await new Promise((r2) => setTimeout(r2, 300));
  const t0 = s.state.turn;
  await s.move(0, -1);
  return { busy: s.busy, advanced: s.state.turn > t0 };
});
check('no soft-lock after map change', !r.busy && r.advanced, r);

// 2. JOIN twice adds one companion
r = await ev(async () => {
  const s = window.__app.session;
  const borin = s.map.entities.find((e) => e.name === 'Borin');
  const n0 = s.party.members.length;
  s.ui.openDialog(borin);
  const chip = () => [...document.querySelectorAll('.chip')].find((c) => c.textContent === 'JOIN');
  const ask = (w) => { const i = document.querySelector('.talk-input'); i.value = w; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
  ask('join'); ask('join');
  await new Promise((r2) => setTimeout(r2, 1200));
  void chip;
  return { added: s.party.members.length - n0 };
});
check('JOIN only once', r.added === 1, r);

// 3. a sea serpent can't be beaten by not placing it
r = await ev(async () => {
  const s = window.__app.session;
  const p = s.fight([{ id: 'sea_serpent', n: 1 }], 'grass', {});
  await new Promise((r2) => setTimeout(r2, 1500));
  const n = s.battle ? s.battle.enemies.length : -1;
  // finish quickly
  if (s.battle) for (const e of s.battle.enemies) e.hp = 1;
  return { enemies: n };
});
check('swimmers get water on a land field', r.enemies === 1, r);

// 4. spells stay with the hero who chose them
await fresh();
r = await ev(async () => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.level = 5; m.mp = 30; }
  s.engage({ id: 'g', monster: 'goblin', count: '3', roaming: true });
  await new Promise((r2) => setTimeout(r2, 1500));
  const b = s.battle;
  for (let i = 0; i < 20 && !(b.active && b.active.member.cls === 'wizard'); i++) { if (b.active) b.actPass(); await new Promise((r2) => setTimeout(r2, 300)); }
  const wiz = b.active;
  const mm = s.game.spells.find((x) => x.id === 'magic_missile');
  await b.actPass();
  const used = await b.actCast(mm, b.enemies[0], wiz);
  const cleric = s.party.members.find((m) => m.cls === 'cleric');
  return { used, clericMp: cleric.mp };
});
check('stale spell choice is ignored', r.used === false && r.clericMp === 30, r);

// 5. sleep does not cure poison
r = await ev(async () => {
  const s = window.__app.session;
  const b = s.battle;
  if (!b) return { skipped: true };
  const u = b.partyUnits.find((p) => b.alive(p));
  u.member.status = 'poisoned';
  const web = s.game.spells.find((x) => x.id === 'web');
  const foe = b.enemies.find((e) => b.alive(e));
  await b.applySpell(foe, web, u, 0);
  const asleep = u.member.status;
  u.sleep = 1;
  await b.startTurn(u);
  return { asleep, after: u.member.status };
});
check('poison survives sleep', r.skipped || (r.asleep === 'poisoned' && r.after === 'poisoned'), r);

// 6. exploration survives teleports, recall items work, flag victories fire
await fresh();
r = await ev(async () => {
  const s = window.__app.session;
  const worldId = s.map.id;
  const before = s.map.explored.reduce((a, b) => a + b, 0);
  const town = s.game.maps.find((m) => m.name === 'Westhold');
  await s.enterMap(town.id, town.entry.x, town.entry.y);
  s.game.items.push({ id: 'scroll_recall', name: 'Scroll of Recall', type: 'consumable', effect: 'recall', price: 50 });
  s.party.inventory.scroll_recall = 1;
  s.useItemField(s.game.items.find((i) => i.id === 'scroll_recall'), null);
  await new Promise((r2) => setTimeout(r2, 2000));
  const after = s.map.explored.reduce((a, b) => a + b, 0);
  return { before, after, back: s.map.id === worldId, at: s.state.pos };
});
check('recall item returns to start', r.back, r);
check('explored tiles persist across maps', r.after >= r.before, r);
r = await ev(async () => {
  const s = window.__app.session;
  s.game.settings.victory = { type: 'flag', target: 'test_flag' };
  s.engage({ id: 'flagged', monster: 'giant_rat', count: '1', roaming: true, flag: 'test_flag' });
  await new Promise((r2) => setTimeout(r2, 2000));
  return { mode: s.mode };
});
await ev(async () => {
  const s = window.__app.session;
  for (let i = 0; i < 300 && s.battle; i++) {
    const b = s.battle;
    if (b.active && !b.acting) { for (const e of b.enemies) e.hp = 1; const t = b.attackTargets(b.active)[0]; if (t) b.actAttack(t); else { const foe = b.enemies.find((e) => b.alive(e)); if (!foe) break; const u = b.active; const dy = Math.sign(foe.y - u.y), dx = Math.sign(foe.x - u.x); if (dy && b.walkable(u.x, u.y + dy, u)) b.actMove(0, dy); else if (dx && b.walkable(u.x + dx, u.y, u)) b.actMove(dx, 0); else b.actPass(); } }
    await new Promise((r2) => setTimeout(r2, 100));
  }
});
await page.waitForTimeout(4000);
r = await ev(() => ({ won: window.__app.session.state.won, flag: !!window.__app.session.party.flags.test_flag }));
check('flag victory from a defeated monster', r.won === r.flag && r.flag, r);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
console.log(fails ? `${fails} FAILED` : 'all regressions pass');
await browser.close();
process.exit(fails ? 1 : 0);
