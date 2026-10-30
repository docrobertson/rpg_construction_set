// Triangle and draw-call budget of a settlement: renderer.info for a few
// views, plus how the triangles split between terrain, buildings and figures.
// Usage: node tests/townstats.mjs [map name]   (HTML=path/to/index.html to
// measure another build, e.g. an older one, for a before/after comparison)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const name = process.argv[2] || 'Westhold';
const html = process.env.HTML ? path.resolve(process.env.HTML) : path.resolve(HERE, '../../index.html');
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('file://' + html);
await page.waitForTimeout(1000);
await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
const views = [['entry', null, 10.5], ['street', [11, 17], 10.5], ['square', [18, 19], 14], ['wide', [18, 20], 26]];
for (const [label, at, zoom] of views) {
  const out = await page.evaluate(async ({ name, at, zoom }) => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.name === name);
    const [x, y] = at || [m.entry.x, m.entry.y];
    const t0 = performance.now();
    await s.enterMap(m.id, x, y, { instant: true, quiet: true });
    const enterMs = Math.round(performance.now() - t0);
    s.view.setZoom(zoom, true);
    await new Promise((r) => setTimeout(r, 2500));
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    const v = s.view;
    const tri = (o) => { let n = 0; o?.traverse?.((c) => { if (c.isMesh && c.geometry) n += (c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count) / 3; }); return Math.round(n); };
    return {
      calls: v.renderer.info.render.calls, frameTris: v.renderer.info.render.triangles,
      terrainTris: tri(v.terrain.group), buildingTris: tri(v.buildings?.meshes?.[0]), shadowProxyTris: tri(v.buildings?.meshes?.[1]),
      buildings: v.buildings?.list?.length ?? 0, enterMs,
    };
  }, { name, at, zoom });
  console.log(name, label.padEnd(7), JSON.stringify(out));
}
await browser.close();
