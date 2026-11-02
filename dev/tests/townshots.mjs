// Settlement screenshots: streets, a wide view, inside a shop, a highlighted
// building, the castle, the elven and dwarven halls and a town at night.
// Usage: node tests/townshots.mjs [outdir] [only,names]
// Prints renderer.info (draw calls / triangles) for each shot.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.resolve(process.argv[2] || path.join(HERE, 'out', 'towns'));
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true');
  // quest banners would cover the view
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.qbanner{display:none!important}'; document.head.appendChild(st); });
});
await page.goto('file://' + (process.env.HTML ? path.resolve(process.env.HTML) : path.resolve(HERE, '../../index.html')));
await page.waitForTimeout(1200);
await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await page.waitForTimeout(800);

// go to a map; at: 'entry' | {x,y} | {role} (stand inside the keeper's building)
async function go(name, at = 'entry', opts = {}) {
  return page.evaluate(async ({ name, at, opts }) => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.name === name);
    s.party.light = 200;
    let x = m.entry.x, y = m.entry.y;
    if (at && at.x != null) { x = at.x; y = at.y; }
    if (at && at.role) {
      const k = m.entities.find((e) => e.type === 'npc' && e.role === at.role);
      // a free floor square inside, next to the keeper's counter
      const free = (xx, yy) => { const t = m.tiles[yy * m.w + xx]; return [41, 42, 43].includes(t) && !m.entities.some((e) => e.x === xx && e.y === yy); };
      let best = null, bd = 1e9;
      for (let yy = k.y - 5; yy <= k.y + 5; yy++) for (let xx = k.x - 5; xx <= k.x + 5; xx++) {
        if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h || !free(xx, yy)) continue;
        const d = Math.abs(xx - k.x) + Math.abs(yy - k.y) + (yy < k.y ? 3 : 0);
        if (d > 1 && d < bd) { bd = d; best = [xx, yy]; }
      }
      if (best) [x, y] = best;
    }
    await s.enterMap(m.id, x, y, { instant: true, quiet: true });
    if (opts.zoom) s.view.setZoom(opts.zoom, true);
    if (opts.focus) s.view.focus(opts.focus.x, opts.focus.y, true);
    if (opts.night != null) s.view.setDaylight(opts.night);
    return { x, y };
  }, { name, at, opts });
}
async function shot(file) {
  await page.waitForTimeout(1600);
  const info = await page.evaluate(() => { const r = window.__app.session.view.renderer; return { calls: r.info.render.calls, tris: r.info.render.triangles }; });
  await page.screenshot({ path: path.join(OUT, file), timeout: 180000 });
  console.log(file.padEnd(18), 'calls', info.calls, 'tris', info.tris);
}
const want = (n) => !ONLY || ONLY.has(n);

// ad-hoc views: AT="Map name:x:y:zoom[:night];..." node tests/townshots.mjs dir none
for (const [i, spec] of (process.env.AT ? process.env.AT.split(';') : []).entries()) {
  const [name, x, y, zoom, night] = spec.split(':');
  await go(name, { x: +x, y: +y }, { zoom: +zoom, night: night ? +night : null });
  await shot(`at${i}.png`);
  if (night) await page.evaluate(() => window.__app.session.applyDaylight());
}
if (want('westhold')) { await go('Westhold', { x: 11, y: 17 }); await shot('westhold.png'); }
if (want('westhold-wide')) { await go('Westhold', { x: 18, y: 19 }, { zoom: 26 }); await shot('westhold-wide.png'); }
if (want('inside')) { await go('Westhold', { role: 'weapons' }, { zoom: 9 }); await shot('inside.png'); }
if (want('inn')) { await go('Westhold', { role: 'inn' }, { zoom: 10 }); await shot('inn.png'); }
if (want('temple')) { await go('Westhold', { role: 'healer' }, { zoom: 10 }); await shot('temple.png'); }
if (want('tavern')) { await go('Westhold', { role: 'tavern' }, { zoom: 10 }); await shot('tavern.png'); }
if (want('hover')) {
  await go('Westhold', { x: 18, y: 22 }, { zoom: 13 });
  await page.evaluate(() => {
    const v = window.__app.session.view;
    const list = v.buildings?.list || [];
    // the building nearest the party with a keeper
    let best = -1, bd = 1e9;
    list.forEach((b, i) => { const d = Math.abs((b.box.x0 + b.box.x1) / 2 - 18) + Math.abs((b.box.y0 + b.box.y1) / 2 - 20); if (b.keeper && d < bd) { bd = d; best = i; } });
    v.highlightBuilding?.(best);
  });
  await shot('hover.png');
  await page.evaluate(() => window.__app.session.view.highlightBuilding?.(-1));
}
if (want('night')) { await go('Westhold', { x: 13, y: 18 }, { zoom: 15, night: 1 }); await shot('night.png'); await page.evaluate(() => window.__app.session.applyDaylight()); }
if (want('castle')) { await go('Caer Aldon', { x: 18, y: 18 }, { zoom: 30 }); await shot('castle.png'); }
if (want('elven')) { await go('Lindaleth', { x: 17, y: 18 }, { zoom: 26 }); await shot('elven.png'); }
if (want('dwarven')) { await go('Hammerdeep', { x: 18, y: 16 }, { zoom: 20 }); await shot('dwarven.png'); }
if (want('village')) { await go('Brookend', { x: 14, y: 16 }, { zoom: 17 }); await shot('village.png'); }
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
