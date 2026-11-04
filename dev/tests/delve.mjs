// Delve: dungeons as battlegrounds. Entering one splits the company and puts
// every monster on the map; heroes walk alone or together; bands notice heroes
// and wake as one; surprise; battles fought on the dungeon floor (bands
// joining mid-fight, fleeing by the stairs); what is slain stays dead; old
// saves inside a dungeon still load.
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
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
await page.addInitScript(() => { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(600);

// helpers living in the page
await ev(() => {
  const v = window.__app.view;
  window.__tick = (sec = 1) => { for (let t = 0; t < sec; t += 0.05) { v.time += 0.05; v._updateEntities(0.05); } v._updateCamera(1); };
  window.__idle = async (ms = 8000) => { const s = window.__app.session; for (let i = 0; i < ms / 20 && (s.busy || s.transitioning); i++) await new Promise((r) => setTimeout(r, 20)); };
  window.__barrow = () => window.__app.session.game.maps.find((m) => m.name === 'Grimholt Barrow');
});

// --- into Grimholt Barrow
const entered = await ev(async () => {
  const s = window.__app.session;
  const m = window.__barrow();
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  const dv = s.dv;
  if (!dv) return { dv: false };
  const groups = Object.entries(dv.groups);
  const v = s.view;
  return {
    dv: true,
    battleground: window.__delve.isBattleground(s.map),
    heroes: dv.alive().map((h) => ({ n: h.name, ...dv.pos(h), fig: v.hasEntity(window.__delve.heroFig(h)) })),
    party: v.hasEntity('party'),
    groups: groups.length,
    ents: s.map.entities.filter((e) => e.type === 'monster').length,
    members: groups.reduce((n, [, g]) => n + g.m.length, 0),
    figs: [...v.entities.keys()].filter((k) => k.startsWith('dv:')).length,
    hp: groups.flatMap(([, g]) => g.m.map((mm) => mm.hp)).slice(0, 6),
    pos: { ...s.state.pos },
  };
});
check('a dungeon is a battleground', entered.dv && entered.battleground, entered);
const squares = new Set(entered.heroes?.map((h) => h.x + ',' + h.y));
check('the company splits: every hero has a square and a figure of their own', entered.heroes?.length >= 2 && squares.size === entered.heroes.length && entered.heroes.every((h) => h.fig) && !entered.party, entered.heroes);
check('every band is there as its own monsters, each with its own health', entered.groups === entered.ents && entered.members > entered.groups && entered.figs === entered.members && entered.hp.every((x) => x > 0), entered);

await wait(5000); // (the chapter card and quest banner fade)
await ev(() => window.__tick(1));
await shot('dv-01-split-company');

// --- one hero walks alone; the rest stay put
const alone = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const [lead, scout] = dv.alive();
  const before = Object.fromEntries(dv.alive().map((h) => [h.name, dv.pos(h)]));
  dv.select(scout);
  const at = dv.pos(scout);
  const open = [[0, -1], [1, 0], [-1, 0], [0, 1]].find(([dx, dy]) => dv.heroPass(at.x + dx, at.y + dy) && !dv.heroAt(at.x + dx, at.y + dy) && !s.blockingAt(at.x + dx, at.y + dy));
  await s.move(open[0], open[1]);
  await window.__idle();
  const after = Object.fromEntries(dv.alive().map((h) => [h.name, dv.pos(h)]));
  return { scout: scout.name, lead: lead.name, before, after, pos: { x: s.state.pos.x, y: s.state.pos.y }, sel: dv.selected()?.name, actor: dv.actor().name };
});
const movedNames = Object.keys(alone.after).filter((n) => alone.after[n].x !== alone.before[n].x || alone.after[n].y !== alone.before[n].y);
check('one hero chosen walks alone; the others stay where they stand', movedNames.length === 1 && movedNames[0] === alone.scout && alone.sel === alone.scout, { movedNames, alone });
check('whoever walks is where the company "is"', alone.pos.x === alone.after[alone.scout].x && alone.pos.y === alone.after[alone.scout].y, alone);
// Tab picks the next hero, G brings everyone together
const keys = await ev(async () => {
  const s = window.__app.session;
  const names = [];
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  names.push(s.dv.selected()?.name || 'all');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
  names.push(s.dv.selected()?.name || 'all');
  const bar = document.querySelector('.dv-bar');
  return { names, bar: !!bar && !bar.hidden, chips: bar ? bar.querySelectorAll('.dv-chip').length : 0, on: bar?.querySelector('.dv-chip.on')?.textContent };
});
check('Tab picks the next hero, G brings the company together', keys.names[0] !== alone.scout && keys.names[0] !== 'all' && keys.names[1] === 'all', keys);
check('a bar shows who walks: All together and a chip per hero', keys.bar && keys.chips === entered.heroes.length + 1 && /All together/.test(keys.on || ''), keys);
// together: the leader steps, the others fall in on real squares
const together = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const lead = dv.actor();
  const out = [];
  for (let i = 0; i < 4; i++) {
    const at = dv.pos(lead);
    const dir = [[0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => dv.heroPass(at.x + dx, at.y + dy) && !s.blockingAt(at.x + dx, at.y + dy) && !dv.exitAt(at.x + dx, at.y + dy));
    if (!dir) break;
    await s.move(dir[0], dir[1]);
    await window.__idle();
    window.__tick(0.5);
    const ps = dv.alive().map((h) => dv.pos(h));
    out.push({ lead: dv.pos(lead), ps, distinct: new Set(ps.map((p) => p.x + ',' + p.y)).size === ps.length, walk: ps.every((p) => dv.walkable(p.x, p.y)) });
  }
  const last = out[out.length - 1];
  const near = last.ps.every((p) => Math.max(Math.abs(p.x - last.lead.x), Math.abs(p.y - last.lead.y)) <= 4);
  return { steps: out.length, ok: out.every((o) => o.distinct && o.walk), near, last };
});
check('all together, the others fall in behind the leader on real squares', together.steps >= 2 && together.ok && together.near, together);

// --- a band out of sight stays dormant
const dormant = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const p = s.state.pos;
  const far = Object.entries(dv.groups).filter(([, g]) => g.m.every((mm) => Math.abs(mm.x - p.x) + Math.abs(mm.y - p.y) > 14));
  for (let i = 0; i < 4; i++) { await s.wait(); await window.__idle(); }
  return { far: far.length, aware: far.filter(([, g]) => g.aware).length, battle: !!s.battle, marks: document.querySelectorAll('.emark.unaware').length };
});
check('bands out of sight stay where they are, unaware', dormant.far > 0 && dormant.aware === 0 && !dormant.battle, dormant);

// --- a hero comes into a band's sight: the whole band wakes, and a battle is fought right there
const woke = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  s.party.light = 200; // the leader carries a torch: seen from afar
  const lead = dv.alive()[0];
  // the band nearest the way in, and a square a little way off it in its sight
  const entry = window.__barrow().entry;
  const bands = Object.entries(dv.groups).filter(([gid, g]) => !dv.entityOf(gid)?.boss && g.m.length >= 2).sort(([, a], [, b]) => (Math.abs(a.m[0].x - entry.x) + Math.abs(a.m[0].y - entry.y)) - (Math.abs(b.m[0].x - entry.x) + Math.abs(b.m[0].y - entry.y)));
  for (const [gid, g] of bands) {
    const mm = g.m[0];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = mm.x + dx, y = mm.y + dy;
      if (!dv.standable(x, y)) continue;
      const others = Object.entries(dv.groups).filter(([og]) => og !== gid).every(([, og]) => og.m.every((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) > 8));
      if (!others) continue;
      // everyone gathers there (as if they had walked), and waits a moment
      const spots = dv.freeSquares(x, y, dv.alive().length, (a, b) => dv.standable(a, b));
      dv.alive().forEach((h, i) => dv.setPos(h, spots[i].x, spots[i].y));
      dv.spawnHeroes();
      s.updateVisibility(true);
      window.__wokeGid = gid;
      s.wait();
      for (let i = 0; i < 100 && !s.battle; i++) await new Promise((r) => setTimeout(r, 30));
      const b = s.battle;
      return { gid, lead: lead.name, battle: !!b, field: !!b?.field, sameMap: b?.arena === s.map, members: g.m.length, units: b ? b.enemies.filter((u) => u.gid === gid).length : 0, aware: g.aware, heroes: b ? b.partyUnits.map((u) => u.id) : [], log: [...document.querySelectorAll('.log-line')].slice(-4).map((l) => l.textContent) };
    }
  }
  return { none: true };
});
check('a band that notices a hero wakes as a whole', woke.battle && woke.aware && woke.units === woke.members && woke.members >= 2, woke);
check('the battle is fought on the dungeon map itself, heroes where they stand', woke.field && woke.sameMap && woke.heroes.every((id) => id.startsWith('hero:')), woke);
check('the log says who noticed whom', woke.log?.some((l) => /notices? /.test(l)), woke.log);

console.log(JSON.stringify(errors.slice(0, 5)));
await browser.close();
if (errors.length) { console.log('FAIL page errors'); fails.push('page errors'); }
console.log(fails.length ? `FAIL ${fails.length} check(s) failed` : 'all delve checks passed');
process.exit(fails.length ? 1 : 0);
