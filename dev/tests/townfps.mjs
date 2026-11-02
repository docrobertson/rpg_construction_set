// Rough frame time in a settlement (software WebGL, so only good for
// comparing two builds on the same machine at the same moment).
// Usage: node tests/townfps.mjs [map name]   (HTML=path/to/index.html for another build)
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
const out = await page.evaluate(async (name) => {
  const s = window.__app.session;
  const m = s.game.maps.find((mm) => mm.name === name);
  await s.enterMap(m.id, 11, 17, { instant: true, quiet: true });
  await new Promise((r) => setTimeout(r, 2000));
  const t = [];
  let last = performance.now();
  for (let i = 0; i < 20; i++) { await new Promise((r) => requestAnimationFrame(r)); const n = performance.now(); t.push(n - last); last = n; }
  t.sort((a, b) => a - b);
  return { medianMs: Math.round(t[10]), worstMs: Math.round(t[19]) };
}, name);
console.log(name, JSON.stringify(out));
await browser.close();
