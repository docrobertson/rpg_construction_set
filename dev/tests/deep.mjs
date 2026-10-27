// Deeper functional test of play mechanics via the app's own objects.
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
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch {} });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
const ev = (fn, arg) => page.evaluate(fn, arg);
const log = (x) => console.log(JSON.stringify(x));

// start a quick game
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true }); await new Promise((r) => setTimeout(r, 1500)); });
// helper to teleport
const tp = (name, x, y) => ev(async ({ name, x, y }) => {
  const s = window.__app.session;
  const m = s.game.maps.find((mm) => mm.name === name);
  await s.enterMap(m.id, x ?? m.entry.x, y ?? m.entry.y, { instant: true });
  return { map: s.map.name, pos: s.state.pos };
}, { name, x, y });

// 1. Shops: buy from a weaponsmith in Westhold
log(await tp('Westhold'));
log(await ev(() => {
  const s = window.__app.session;
  const smith = s.map.entities.find((e) => e.shop && e.shop.kind === 'weapons');
  const before = s.party.gold;
  s.ui.openShop(smith);
  const btn = [...document.querySelectorAll('.shop-row button.primary')][0];
  btn && btn.click();
  return { smith: smith.name, stock: smith.shop.stock.length, before, after: s.party.gold };
}));
await shot('30-shop');
await ev(() => document.querySelector('.modal-back').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
// 2. Talk & recruit Borin
log(await ev(() => {
  const s = window.__app.session;
  const borin = s.map.entities.find((e) => e.name === 'Borin');
  if (!borin) return 'no borin';
  const r1 = s.say(borin, 'key');
  const r2 = s.say(borin, 'join');
  const err = r2.join ? s.recruit(borin) : 'no join';
  return { r1: r1.text.slice(0, 40), join: r2.join, err, size: s.party.members.length };
}));
// 3. Inn & healer
log(await ev(() => {
  const s = window.__app.session;
  s.party.members[0].hp = 3;
  const inn = s.map.entities.find((e) => e.role === 'inn');
  s.ui.openInn(inn);
  const b = [...document.querySelectorAll('.modal-buttons button')].find((x) => /Rest/.test(x.textContent));
  b && b.click();
  return { hp: s.party.members[0].hp, gold: s.party.gold };
}));
// 4. King gives the seal; Mayor gives gold once
log(await tp('Caer Aldon'));
log(await ev(() => {
  const s = window.__app.session;
  const king = s.map.entities.find((e) => e.role === 'lord');
  const a = s.say(king, 'shadow').text.slice(0, 30);
  const b = s.say(king, 'quest');
  const c = s.say(king, 'quest');
  return { a, gave: b.note, after: c.text.slice(0, 30), seal: s.party.inventory.kings_seal };
}));
await shot('31-castle');
// 5. Dungeon darkness
log(await tp('Grimholt Barrow'));
await wait(800);
await shot('32-dungeon-dark');
log(await ev(() => { const s = window.__app.session; const torch = s.game.items.find((i) => i.id === 'torch'); s.useItemField(torch, null); return s.party.light; }));
await wait(1200);
await shot('33-dungeon-torch');
// 6. Chest with rune key — teleport onto the last chest and step
log(await ev(async () => {
  const s = window.__app.session;
  const chest = s.map.entities.find((e) => e.type === 'chest' && (e.items || []).some((i) => i.id === 'rune_key'));
  if (!chest) return 'no key chest';
  s.state.pos = { map: s.map.id, x: chest.x, y: chest.y };
  await s.openChest(chest);
  return { key: s.party.inventory.rune_key, gold: s.party.gold };
}));
// 7. Leave dungeon via exit
log(await ev(async () => { const s = window.__app.session; await s.leaveMap(); return { map: s.map.name, pos: s.state.pos }; }));
// 8. Ship: board the ship near Westhold and sail
log(await ev(async () => {
  const s = window.__app.session;
  const w = s.game.maps[0];
  if (s.map.id !== w.id) await s.enterMap(w.id, 20, 52, { instant: true });
  const ship = s.map.entities.find((e) => e.type === 'ship');
  // stand next to it
  const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: ship.x + dx, y: ship.y + dy, dx: -dx, dy: -dy }));
  const { terrain } = { terrain: null };
  for (const a of adj) {
    s.state.pos = { map: s.map.id, x: a.x, y: a.y };
    s.view.placeEntity('party', a.x, a.y);
    await s.move(a.dx, a.dy);
    if (s.state.vehicle) break;
  }
  const boarded = !!s.state.vehicle;
  // sail west a few tiles
  for (let i = 0; i < 3; i++) await s.move(-1, 0);
  return { boarded, pos: s.state.pos };
}));
await wait(600);
await shot('34-ship');
// 9. Gated portal: Dol Garoth with key
log(await ev(async () => {
  const s = window.__app.session;
  s.state.vehicle = null;
  s.refreshPartyVisual();
  const gate = s.map.entities.find((e) => e.type === 'portal' && e.requires);
  s.state.pos = { map: s.map.id, x: gate.x - 1, y: gate.y };
  s.view.placeEntity('party', gate.x - 1, gate.y);
  await s.move(1, 0);
  return { map: s.map.name };
}));
await wait(600);
await shot('35-fortress');
// 10. Boss fight: give the party a big boost and fight the Shadow Lord to test victory
log(await ev(async () => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.level = 12; m.str = 20; m.hp = 400; }
  const boss = s.map.entities.find((e) => e.boss);
  s.engage(boss);
  await new Promise((r) => setTimeout(r, 2500));
  for (const u of s.battle.enemies) { u.hp = 2; }
  for (let i = 0; i < 400 && s.battle; i++) {
    const b = s.battle;
    if (b.active && !b.acting) {
      const u = b.active;
      const t = b.attackTargets(u)[0];
      if (t) b.actAttack(t);
      else {
        const foe = b.enemies.filter((e) => b.alive(e)).sort((a, c) => b.dist(u, a) - b.dist(u, c))[0];
        if (!foe) break;
        const dx = Math.sign(foe.x - u.x), dy = Math.sign(foe.y - u.y);
        if (dy && b.walkable(u.x, u.y + dy, u)) b.actMove(0, dy);
        else if (dx && b.walkable(u.x + dx, u.y, u)) b.actMove(dx, 0);
        else b.actPass();
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 3500));
  return { won: s.state.won, mode: s.mode, flags: Object.keys(s.party.flags).filter((f) => f.startsWith('killed')) };
}));
await wait(1000);
await shot('36-victory');
// 11. save & continue
log(await ev(() => { const s = window.__app.session; return s.save(); }));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
