// A fast sanity pass, run with every change: the page loads, the sample
// starts, the company walks, enters a town, opens the pack and a shop, and a
// battle begins with its HUD. Catches the "nothing works" kind of breakage in
// well under a minute; the other suites test the details.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const until = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);

check('title screen', await ev(() => !!document.querySelector('.title, .title-screen, .ts-card, button')));
await ev(() => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); });
check('the sample starts', await until(() => window.__app.session?.mode === 'explore' && !window.__app.session.transitioning));
await ev(() => { for (let i = 0; i < 4; i++) document.querySelector('.modal-buttons button')?.click(); });

let r = await ev(async () => {
  const s = window.__app.session;
  const p0 = { ...s.state.pos };
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { await s.move(dx, dy); if (s.state.pos.x !== p0.x || s.state.pos.y !== p0.y) break; }
  return { moved: s.state.pos.x !== p0.x || s.state.pos.y !== p0.y, party: s.party.members.length };
});
check('the company walks', r.moved && r.party > 0, r);

r = await ev(async () => {
  const s = window.__app.session;
  const town = s.game.maps.find((m) => m.name === 'Westhold') || s.game.maps.find((m) => m.type === 'town');
  await s.enterMap(town.id, town.entry.x, town.entry.y, { instant: true });
  s.ui.openParty();
  const pack = !!document.querySelector('.party-modal');
  document.querySelector('.party-modal .modal-x')?.click();
  const keeper = s.map.entities.find((e) => e.shop?.kind);
  if (keeper) s.ui.openShop(keeper);
  const shop = !!document.querySelector('.shop-modal');
  document.querySelector('.shop-modal .modal-x')?.click();
  return { map: s.map.name, pack, shop: shop || !keeper };
});
check('a town, the pack and a shop open', r.pack && r.shop, r);

r = await ev(async () => {
  const s = window.__app.session;
  const world = s.game.maps.find((m) => m.type === 'world');
  await s.enterMap(world.id, s.game.settings.start?.x ?? world.entry.x, s.game.settings.start?.y ?? world.entry.y, { instant: true });
  s.fight([{ id: s.game.monsters[0].id, n: 1 }], 'grass', {});
  for (let i = 0; i < 120 && !(s.battle && document.querySelector('.cbt-strip, .cbt-btn')); i++) await new Promise((res) => setTimeout(res, 100));
  return { battle: !!s.battle, hud: !!document.querySelector('.cbt-strip, .cbt-btn') };
});
check('a battle begins with its HUD', r.battle && r.hud, r);

check('no page errors', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'quick: all passed');
process.exit(fails ? 1 : 0);
