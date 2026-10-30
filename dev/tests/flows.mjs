// Survival flows: food, camping, poison, game over & resurrection, save/continue.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const log = (x) => console.log(JSON.stringify(x));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
// start, and wait until the opening fade has finished
const ready = () => ev(async () => { for (let i = 0; i < 200; i++) { const s = window.__app.session; if (s && s.map && !s.transitioning) return true; await new Promise((r) => setTimeout(r, 100)); } return false; });
await ev(() => { const app = window.__app; app.playGame(app.sample, { quick: true }); });
await ready();
// food: walk 30 steps back and forth on the world
log(await ev(async () => {
  const s = window.__app.session;
  s.map.encounterRate = 0; // a wandering band would start a battle nobody here fights
  const before = s.party.food;
  for (let i = 0; i < 30; i++) { await s.move(i % 2 ? 1 : -1, 0); while (s.busy) await new Promise((r) => setTimeout(r, 10)); if (s.mode !== 'explore') break; }
  return { before, after: s.party.food, mode: s.mode, turn: s.state.turn };
}));
// camp
log(await ev(async () => {
  const s = window.__app.session;
  if (s.mode !== 'explore') return 'not exploring: ' + s.mode;
  s.map.entities = s.map.entities.filter((e) => e.type !== 'monster');
  s.map.encounterRate = 0; // no ambush: the camp should finish
  s.party.members[0].hp = 1;
  await s.camp();
  return { hp: s.party.members[0].hp, food: s.party.food };
}));
// poison & cure via spell
log(await ev(async () => {
  const s = window.__app.session;
  const cleric = s.party.members.find((m) => m.cls === 'cleric');
  cleric.level = 3; cleric.mp = 10;
  const w = s.party.members[0];
  w.status = 'poisoned';
  const spell = s.game.spells.find((x) => x.id === 'cure');
  await s.castField(cleric, spell, w);
  return { status: w.status, mp: cleric.mp };
}));
// save & continue
log(await ev(async () => {
  const s = window.__app.session;
  s.save();
  const pos = { ...s.state.pos };
  window.__app.endPlay(false);
  await new Promise((r) => setTimeout(r, 800));
  const btn = [...document.querySelectorAll('.title-menu button')].map((b) => b.textContent);
  return { pos, titleButtons: btn };
}));
await page.screenshot({ path: `${OUT}/60-title-continue.png` });
await page.getByRole('button', { name: /Continue/ }).first().click();
await wait(500);
await ready();
log(await ev(() => { const s = window.__app.session; return { map: s.map.name, pos: s.state.pos, members: s.party.members.length }; }));
// defeat → game over → rise again
log(await ev(async () => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.hp = 1; m.status = 'ok'; }
  s.engage({ id: 'doom', monster: 'troll', count: '3', roaming: true });
  await new Promise((r) => setTimeout(r, 2500));
  for (let i = 0; i < 900 && s.battle; i++) {
    const b = s.battle;
    if (b.active && !b.acting) b.actPass();
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 2500));
  const modal = document.querySelector('.modal-title')?.textContent;
  return { mode: s.mode, modal };
}));
await page.screenshot({ path: `${OUT}/61-gameover.png` });
const rise = page.getByRole('button', { name: /Rise again/ });
if (await rise.count()) {
  await rise.click();
  await wait(2000);
  log(await ev(() => { const s = window.__app.session; return { mode: s.mode, map: s.map.name, alive: s.party.members.filter((m) => m.status !== 'dead').length }; }));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
