// Print how each building of a settlement was built (style, roof rectangles,
// cross gables). Usage: node tests/townbuild.mjs [map name]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1000);
const out = await page.evaluate(async (name) => {
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  await new Promise((r) => setTimeout(r, 1500));
  const s = app.session;
  const m = s.game.maps.find((mm) => mm.name === name);
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true, quiet: true });
  const v = s.view.buildings;
  return v.info.map((i, k) => [v.list[k].name, i.style, 'H', i.H, JSON.stringify(i.rects), 'cross', JSON.stringify(i.crosses)]);
}, process.argv[2] || 'Caer Aldon');
for (const o of out) console.log(o.join(' '));
await browser.close();
