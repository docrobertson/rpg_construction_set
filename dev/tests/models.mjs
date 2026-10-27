// Close-up line-up of every class and monster model.
// Usage: node tests/models.mjs [prefix] [zoom] [x offset]
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
const pre = process.argv[2] || 'models';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
const fx = +(process.argv[4] || 0);
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1200);
await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
for (const [group, zoom] of (process.argv[3] ? [['classes', +process.argv[3]]] : [['classes', 6.5], ['monsters', 9]])) {
  await page.evaluate(async ([group, zoom, fx]) => {
    const s = window.__app.session, v = s.view, g = s.game;
    const m = g.maps.find((mm) => mm.name === 'Westhold');
    await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
    s.game.settings.lineOfSight = false; s.updateVisibility(true);
    v.clearEntities();
    const p = s.state.pos;
    const looks = group === 'classes'
      ? g.classes.flatMap((k, i) => [{ ...(g.races[i % 3].look || {}), ...k.look, race: g.races[i % 3].look.race }])
      : g.monsters.slice(0, 18).map((mm) => mm.look);
    const cols = group === 'classes' ? 4 : 6;
    looks.forEach((l, i) => v.addEntity('m' + i, l, p.x - Math.floor(cols / 2) + (i % cols), p.y - 2 + Math.floor(i / cols), {}));
    v.rig.minDist = 1; v.setZoom(zoom, true);
    v.focus(p.x + fx, p.y - (zoom < 4 ? 3 : 1), true);
  }, [group, zoom, fx]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${pre}-${group}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
