// Screenshots for exploring: the company on the world map, in a town and a
// dungeon, marks over people, hover info and the Nearby actions.
// Usage: node tests/exploreshots.mjs [outdir] [only]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = process.argv[2] || path.join(HERE, 'out');
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const want = (k) => !ONLY || ONLY.has(k);
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1500);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(2500);
// clear the opening banner
await ev(() => document.querySelectorAll('.qbanner').forEach((b) => b.remove()));
const walk = (steps) => ev(async (steps) => {
  const s = window.__app.session;
  for (const [dx, dy] of steps) {
    await s.move(dx, dy);
    while (s.busy) await new Promise((r) => setTimeout(r, 20));
  }
}, steps);
// the test machine renders a frame or two a second: put the company in place
const settle = () => ev(() => { const v = window.__app.view; for (const e of v.entities.values()) if (e.anim) { e.anim.update(1); const d = e.anim.done; e.anim = null; d && d(); } v.followers.reset(); });
// hover the screen point over an entity's chest
const hoverEntity = (id) => ev((id) => {
  const v = window.__app.view;
  const e = v.entities.get(id);
  const p = e.root.position;
  const s = v.worldToScreen(p.x, p.y + e.info.height * e.scale * 0.5, p.z);
  const r = v.renderer.domElement.getBoundingClientRect();
  return { x: r.left + s.x, y: r.top + s.y };
}, id);

if (want('world')) {
  await walk([[1, 0], [1, 0], [0, 1]]);
  await settle();
  await ev(() => window.__app.view.setZoom(9.5, true));
  await wait(2500);
  await shot('world-party');
  // mid-walk
  await ev(() => { const s = window.__app.session; s.move(0, -1).then(() => s.move(0, -1)); });
  await wait(250);
  await shot('world-walking');
}

// wait for the view to draw a few frames (the test machine is slow)
const frames = (n = 2) => ev(async (n) => { const v = window.__app.view; const t = v.time; let k = 0; while (k++ < 400) { await new Promise((r) => setTimeout(r, 50)); if (v.time - t >= n * 0.03) break; } }, n);
// put the party on a square (facing a way) and let everything settle
const place = (x, y, face = [0, -1]) => ev(({ x, y, face }) => {
  const s = window.__app.session;
  s.state.pos.x = x; s.state.pos.y = y; s.state.facing = face;
  s.refreshPartyVisual();
  s.view.focus(x, y, true);
  s.updateVisibility(true);
  s.ui.refresh();
  s.view.followers.reset();
}, { x, y, face }).then(() => frames(3));
const hoverAt = async (p) => {
  await page.mouse.move(p.x, p.y);
  await ev((p) => { const ex = window.__app.playUI.explore; ex.mouse = { x: p.x, y: p.y }; ex.refreshHover(); }, p);
  await wait(2500);
};
const tileScreen = (x, y, up = 0.3) => ev(({ x, y, up }) => {
  const v = window.__app.view;
  const s = v.worldToScreen(x + 0.5, v.heightAt(x, y) + up, y + 0.5);
  const r = v.renderer.domElement.getBoundingClientRect();
  return { x: r.left + s.x, y: r.top + s.y };
}, { x, y, up });

if (want('town') || want('markers') || want('hover')) {
  await ev(async () => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.name === 'Westhold');
    await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  });
  await wait(1500);
  // up the high street
  await place(18, 26, [0, -1]);
  await walk([[0, -1], [0, -1], [0, -1]]);
  await settle();
  await wait(2500);
  await shot('town-party');
  // by the west lanes: people with tasks and the shops round about
  // as if the town had been walked round once: the shops are known
  await ev(() => window.__app.session.map.explored.fill(1));
  await place(10, 18, [0, 1]);
  await ev(() => window.__app.view.setZoom(15.5, true));
  await frames(3);
  await wait(1000);
  await shot('markers-quests');
  // up by the market: shops, the tavern and a would-be companion
  await place(18, 11, [0, -1]);
  await ev(() => window.__app.view.focus(17, 8, true));
  await frames(3);
  await wait(1000);
  await shot('markers');
  await ev(() => window.__app.view.setZoom(10.5, true));
  await place(12, 24, [-1, 0]);
  const wynn = await hoverEntity('npc_wynn');
  await hoverAt(wynn);
  await shot('hover-npc');
  await page.mouse.move(5, 5);
  await ev(() => window.__app.view.setZoom(10.5, true));
  // a shop by the high street
  await place(13, 18, [0, -1]);
  await ev(() => { window.__app.view.focus(12, 16, true); });
  await frames(3);
  await hoverAt(await tileScreen(13, 15, 0.45));
  await shot('hover-building');
  await page.mouse.move(5, 5);
  // beside Mayor Hilda
  const spot = await ev(() => {
    const s = window.__app.session;
    const npc = s.map.entities.find((e) => e.id === 'npc_hilda');
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (s.followerGround(npc.x + dx, npc.y + dy) && !s.blockingAt(npc.x + dx, npc.y + dy)) return [npc.x + dx, npc.y + dy, -dx, -dy];
    return null;
  });
  await place(spot[0], spot[1], [spot[2], spot[3]]);
  await wait(2500);
  await shot('nearby-actions');
}

if (want('dungeon')) {
  await ev(async () => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.name === 'Grimholt Barrow');
    s.party.light = 200;
    await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  });
  await wait(1500);
  await walk([[0, -1]]);
  await settle();
  await wait(2500);
  await shot('dungeon-party');
}
if (want('ship')) {
  // back to the world and aboard the ship
  await ev(async () => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.type === 'world');
    await s.enterMap(m.id, s.game.settings.start.x, s.game.settings.start.y, { instant: true });
    const ship = s.map.entities.find((e) => e.type === 'ship');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (s.followerGround(ship.x + dx, ship.y + dy)) { s.state.pos.x = ship.x + dx; s.state.pos.y = ship.y + dy; s.refreshPartyVisual(); break; }
    }
    const p = s.state.pos;
    await s.move(ship.x - p.x, ship.y - p.y);
  });
  await settle();
  await ev(() => window.__app.view.setZoom(7, true));
  await frames(3);
  await wait(1000);
  await shot('ship-crew');
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
