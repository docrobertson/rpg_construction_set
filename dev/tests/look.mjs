// Quick visual check: overworld at a few zooms, a town, a dungeon and a battle.
// Usage: node tests/look.mjs [prefix]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const pre = process.argv[2] || 'look';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${pre}-title.png` });
await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${pre}-world.png` });
await page.evaluate(() => { const s = window.__app.session; s.view.setZoom(12, true); });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/${pre}-world-close.png` });
await page.evaluate(() => { const s = window.__app.session; s.view.setZoom(40, true); });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/${pre}-world-far.png` });
await page.evaluate(() => { const s = window.__app.session; s.view.setZoom(11, true); s.view.setDaylight(1); });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/${pre}-world-night.png` });
await page.evaluate(() => { const s = window.__app.session; s.applyDaylight(); });
for (const name of ['Westhold', 'Grimholt Barrow']) {
  await page.evaluate(async (name) => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.name === name);
    s.party.light = 200;
    await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  }, name);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${pre}-${name.replace(/\W/g, '')}.png` });
}
// a town street, where the buildings stand closest (more in tests/townshots.mjs)
await page.evaluate(async () => {
  const s = window.__app.session;
  const m = s.game.maps.find((mm) => mm.name === 'Westhold');
  await s.enterMap(m.id, 11, 17, { instant: true });
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${pre}-Westhold-street.png` });
// battle
await page.evaluate(async () => {
  const s = window.__app.session;
  const m = s.game.maps.find((mm) => mm.type === 'world');
  await s.enterMap(m.id, s.game.settings.start.x, s.game.settings.start.y, { instant: true });
  s.fight([{ id: 'orc', n: 2 }, { id: 'goblin', n: 2 }, { id: 'wolf', n: 1 }], 'forest', {});
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${pre}-battle.png` });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
