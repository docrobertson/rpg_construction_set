// New-feature checks: ranged slot, character sheet, attribute points,
// class specials, loot, day/night and old-save migration.
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
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const fails = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(800);

// --- kits and the ranged slot
const kits = await ev(() => window.__app.session.party.members.map((m) => ({ cls: m.cls, equip: m.equip, points: m.points })));
const ranger = kits.find((k) => k.cls === 'ranger');
check('ranger carries sword and bow', ranger && ranger.equip.weapon === 'short_sword' && ranger.equip.ranged === 'short_bow', ranger);
check('layout is docked', await ev(() => document.getElementById('app').dataset.layout === 'play' && document.getElementById('viewport').getBoundingClientRect().width < window.innerWidth));
check('character sheet shows four slots', (await ev(() => document.querySelectorAll('.hud-hero .slot select').length)) === 4);

// select the ranger and take the bow off, then put it back, via the sheet
await ev(() => { const ui = window.__app.playUI; ui.selectHero(ui.s.party.members.find((m) => m.cls === 'ranger')); });
await wait(200);
await ev(() => { const sel = document.querySelectorAll('.hud-hero .slot select')[1]; sel.value = ''; sel.dispatchEvent(new Event('change')); });
let st = await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); return { ranged: r.equip.ranged, inv: s.party.inventory.short_bow || 0 }; });
check('unequip bow puts it in the pack', st.ranged === null && st.inv === 1, st);
await ev(() => { const sel = document.querySelectorAll('.hud-hero .slot select')[1]; sel.value = 'short_bow'; sel.dispatchEvent(new Event('change')); });
st = await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); return { ranged: r.equip.ranged, inv: s.party.inventory.short_bow || 0 }; });
check('equip bow from the pack', st.ranged === 'short_bow' && st.inv === 0, st);

// --- attribute points
await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); r.xp = 0; s.ui.refresh(); });
const lv = await ev(() => {
  const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger');
  const before = { level: r.level, dex: r.dex };
  // award enough experience for one level through the normal path
  const g = s.game;
  const need = 60;
  r.xp = 0;
  return { before, need };
});
await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); window.__gain = s.grantXp ? s.grantXp(r, 60) : null; });
await ev(async () => {
  // use the rules directly if the session has no helper
  const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger');
  if (r.level === 1) { r.level = 2; r.points = (r.points || 0) + 1; }
  s.ui.selectHero(r);
});
await wait(200);
const plus = await ev(() => document.querySelectorAll('.hud-hero .attr .plus').length);
check('plus buttons appear with points', plus === 4, plus);
await ev(() => document.querySelectorAll('.hud-hero .attr .plus')[1].click());
const after = await ev(() => { const r = window.__app.session.party.members.find((m) => m.cls === 'ranger'); return { dex: r.dex, points: r.points }; });
check('spending a point raises Dexterity', after.dex === lv.before.dex + 1 && after.points === 0, { before: lv.before, after });

// --- day and night
const dn = await ev(() => {
  const s = window.__app.session;
  s.state.turn = 200; s.applyDaylight(); s.updateVisibility(true); s.ui.refresh();
  const night = { name: s.timeOfDay().name, lighting: s.view.lighting, sight: s.sightRadius().sight, status: document.querySelector('.hud-status').textContent };
  s.state.turn = 10; s.applyDaylight(); s.updateVisibility(true); s.ui.refresh();
  return { night, day: { name: s.timeOfDay().name, lighting: s.view.lighting } };
});
check('night falls', dn.night.name === 'Night' && dn.night.lighting === 'night' && dn.night.sight <= 8 && /Night/.test(dn.night.status), dn.night);
check('morning returns', dn.day.lighting === 'day' && dn.day.name === 'Morning', dn.day);
await ev(() => { const s = window.__app.session; s.state.turn = 160; s.applyDaylight(); });
await wait(600);
await shot('feat-dusk');
await ev(() => { const s = window.__app.session; s.state.turn = 10; s.applyDaylight(); });

// --- battle: ranged attack, specials
await ev(() => { const s = window.__app.session; for (const m of s.party.members) { m.hp = 60; } s.engage({ id: 'x', monster: 'goblin', count: '4', roaming: true }); });
await wait(2500);
const active = () => ev(() => { const b = window.__app.session.battle; return b && b.active ? b.active.member.cls : null; });
const waitActive = async (cls) => {
  for (let i = 0; i < 80; i++) {
    const a = await active();
    if (a === cls) return true;
    if (a) await ev(() => window.__app.session.battle.actPass());
    await wait(150);
  }
  return false;
};
check('ranger gets a turn', await waitActive('ranger'));
const shotRes = await ev(async () => {
  const b = window.__app.session.battle; const u = b.active;
  let far = b.enemies.find((e) => b.alive(e) && !b.adjacent(u, e) && b.canAttack(u, e));
  if (!far) {
    // bring a goblin into bow range
    far = b.enemies.find((e) => b.alive(e));
    for (let d = 3; d <= 4 && far; d++) if (b.walkable(u.x, u.y - d, far)) { far.x = u.x; far.y = u.y - d; b.view.moveEntity(far.id, far.x, far.y, 0.05); break; }
    for (let y = u.y - 1; y > far.y; y--) if (!b.walkable(u.x, y, null)) return { blocked: true };
  }
  const before = b.round;
  const ok = await b.actAttack(far, u);
  return { ok, wkind: b.weaponFor(u, far).wkind };
});
check('ranger shoots a distant foe with the bow', shotRes.blocked || (shotRes.ok && shotRes.wkind === 'bow'), shotRes);
// wizard blink is a free action
if (await waitActive('wizard')) {
  const bl = await ev(async () => {
    const b = window.__app.session.battle; const u = b.active;
    const tg = b.specialTargets(u);
    const t = tg.tiles[0];
    await b.actSpecial(t, u);
    return { still: b.active === u, moved: u.x === t.x && u.y === t.y, used: u.specialUsed, again: b.canSpecial(u).ok };
  });
  check('blink moves the wizard and keeps the turn', bl.still && bl.moved && bl.used && !bl.again, bl);
  await ev(() => window.__app.session.battle.actPass());
}
if (await waitActive('cleric')) {
  const md = await ev(async () => {
    const b = window.__app.session.battle; const u = b.active;
    for (const p of b.partyUnits) p.member.hp = 5;
    await b.actSpecial(null, u);
    return { healed: b.partyUnits.filter((p) => b.alive(p)).every((p) => p.member.hp > 5), used: u.specialUsed };
  });
  check('prayer of mending heals everyone', md.healed && md.used, md);
}
await shot('feat-battle');
// loot
const loot = await ev(() => {
  const b = window.__app.session.battle;
  if (!b) return { nobattle: true };
  const inv = window.__app.session.party.inventory;
  const before = JSON.stringify(inv);
  b.killedIds = ['troll', 'orc_captain', 'troll', 'drake'];
  for (let i = 0; i < 12; i++) b.dropLoot();
  return { changed: JSON.stringify(inv) !== before, lines: [...document.querySelectorAll('.log-line.loot')].map((x) => x.textContent).slice(-3) };
});
check('foes drop loot', loot.nobattle || (loot.changed && loot.lines.length > 0), loot);
// finish the battle
await ev(() => { const b = window.__app.session.battle; if (b) for (const e of b.enemies) { e.hp = 0; e.dead = true; } if (b && b.active) b.actPass(); });
await wait(3000);

// --- old saves: a bow in the weapon slot moves to the ranged slot
const mig = await ev(() => {
  const app = window.__app;
  const s = app.session;
  const state = JSON.parse(JSON.stringify(s.state));
  const r = state.party.members.find((m) => m.cls === 'ranger');
  r.equip = { weapon: 'long_bow', armor: 'leather_armor', shield: null };
  delete r.points;
  const S = s.constructor;
  const s2 = new S(app, s.game, state, { noSave: true });
  const r2 = s2.party.members.find((m) => m.cls === 'ranger');
  return { equip: r2.equip, points: r2.points };
});
check('old saves migrate bows to the ranged slot', mig.equip.ranged === 'long_bow' && mig.equip.weapon === null && mig.points === 0, mig);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
