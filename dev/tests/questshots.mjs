// Screenshots of the quest features for review: first goal, a quest offer,
// the journal, a point of interest, an event and the editor's quest tab.
// Usage: node tests/questshots.mjs [out-dir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = process.argv[2] || path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const settle = () => ev(async () => { const s = window.__app.session; for (let i = 0; i < 300 && (s.busy || s.transitioning || s.mode === 'combat'); i++) await new Promise((r) => setTimeout(r, 25)); });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
// a real new game: party creation, intro, then the first goal
await page.getByRole('button', { name: /Play an Adventure/ }).first().click();
await wait(400);
await page.getByRole('button', { name: 'Play', exact: true }).first().click();
await wait(400);
await page.getByRole('button', { name: 'New Game', exact: true }).first().click();
await wait(900);
await page.getByRole('button', { name: /Begin the Adventure/ }).first().click();
await wait(600);
await page.getByRole('button', { name: 'Begin', exact: true }).first().click();
await wait(2600);
await shot('start');
// walk into Westhold and click on Mayor Hilda: the party walks up and talks
await ev(async () => { await new Promise((r) => setTimeout(r, 3000)); });
await ev(async () => { const s = window.__app.session; const t = s.game.maps.find((m) => m.name === 'Westhold'); await s.enterMap(t.id, t.entry.x, t.entry.y); });
await settle();
const hilda = await ev(() => { const s = window.__app.session; const e = s.map.entities.find((x) => x.id === 'npc_hilda'); s.view.focus(e.x, e.y + 2, true); return { x: e.x, y: e.y, map: s.map.name }; });
console.log('in', hilda.map);
await ev(async () => {
  const s = window.__app.session;
  const e = s.map.entities.find((x) => x.id === 'npc_hilda');
  // stand two steps away, then talk by walking
  await s.enterMap(s.map.id, e.x, e.y + 3, { instant: true });
});
await settle();
// click on her: the party walks up and starts talking
await wait(800);
const at = await ev(() => {
  const s = window.__app.session;
  const e = s.map.entities.find((x) => x.id === 'npc_hilda');
  const r = s.view.renderer.domElement.getBoundingClientRect();
  const p = s.view.worldToScreen(e.x + 0.5, s.view.heightAt(e.x, e.y) + 0.2, e.y + 0.5);
  return { x: r.left + p.x, y: r.top + p.y };
});
await page.mouse.click(at.x, at.y);
for (let i = 0; i < 40 && !(await ev(() => !!document.querySelector('.talk-modal'))); i++) await wait(500);
await wait(600);
await shot('talk-hilda');
await page.keyboard.press('Escape'); await wait(400);
// Wynn offers a quest
await ev(async () => { const s = window.__app.session; const e = s.map.entities.find((x) => x.id === 'npc_wynn'); s.talkTo(e); });
await wait(600);
await shot('talk-offer');
await ev(() => { [...document.querySelectorAll('.qoffer button')].find((b) => /Accept/.test(b.textContent))?.click(); });
await wait(300);
await page.keyboard.press('Escape'); await wait(4500);
await page.keyboard.press('j'); await wait(600);
await shot('journal');
await page.keyboard.press('Escape'); await wait(300);
// out to the world: a shrine and the big map
await ev(async () => {
  const s = window.__app.session;
  const w = s.game.maps[0];
  const sh = w.entities.find((e) => e.id === 'ev_shrine_might');
  await s.enterMap(w.id, sh.x, sh.y + 1, { instant: true });
});
await settle();
await wait(5000);
await page.keyboard.press('ArrowUp'); await wait(900);
await shot('poi');
await page.keyboard.press('1'); await wait(500);
await shot('poi-result');
await page.keyboard.press('Escape'); await wait(400);
await page.keyboard.press('m'); await wait(600);
await shot('bigmap');
await page.keyboard.press('Escape'); await wait(300);
await ev(async () => {
  const s = window.__app.session;
  const t = s.map.entities.find((e) => e.id === 'ev_toll_troll');
  await s.enterMap(s.map.id, t.x - 1, t.y, { instant: true });
});
await settle();
await wait(1500);
await page.keyboard.press('ArrowRight'); await wait(900);
await shot('event');
await page.keyboard.press('Escape'); await wait(300);
// the editor
await ev(async () => {
  const app = window.__app;
  app.stopSession();
  app.openEditor(window.__schema.cloneGame(app.sample));
  await new Promise((r) => setTimeout(r, 1200));
  app.editor.setTab('quests');
  await new Promise((r) => setTimeout(r, 200));
  const main = document.querySelector('.ed-main');
  const steps = [...main.querySelectorAll('.form-section')].find((x) => /Steps/.test(x.textContent));
  if (steps) main.scrollTop = steps.offsetTop - 260;
});
await wait(500);
await shot('editor-quests');
await ev(async () => {
  const ed = window.__app.editor;
  ed.setTab('map');
  await new Promise((r) => setTimeout(r, 300));
  const e = ed.map.entities.find((x) => x.id === 'ev_toll_troll');
  ed.view.focus(e.x, e.y, true);
  ed.view.setZoom(14, true);
  ed.select(e);
});
await wait(800);
await shot('editor-event');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
