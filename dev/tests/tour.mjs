// Visual tour: screenshot each map of the sample adventure in play mode.
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
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1200);
await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['Westhold', 'Caer Aldon', 'Lindaleth', 'Hammerdeep', 'Brookend', 'Grimholt Barrow', 'Dol Garoth', 'Tower of the Hermit'];
for (const name of names) {
  await page.evaluate(async (name) => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.name === name);
    s.party.light = 200;
    await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
    s.view.setZoom(24, true);
    s.view.focus(Math.floor(m.w / 2), Math.floor(m.h / 2) - 2, true);
    s.game.settings.lineOfSight = false;
    s.updateVisibility(true);
  }, name);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/tour-${name.replace(/\W/g, '')}.png` });
  console.log('shot', name);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
