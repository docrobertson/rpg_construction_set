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
  // one step, not waiting on a battle it may start (unseen: nobody notices it)
  window.__step = async (dx, dy, unseen = false) => {
    const s = window.__app.session, rng = window.__delve.rng, chance = rng.chance;
    if (unseen) rng.chance = () => false;
    try {
      s.move(dx, dy);
      for (let i = 0; i < 400 && s.busy && !s.battle; i++) await new Promise((r) => setTimeout(r, 20));
    } finally { rng.chance = chance; }
  };
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
  await window.__step(open[0], open[1]);
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
    await window.__step(dir[0], dir[1]);
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

// --- a quiet scout goes ahead alone (torch-lit company behind) until a band is in sight
const scout = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  document.querySelectorAll('.chbanner').forEach((el) => el.click());
  s.party.light = 120;
  const quiet = dv.alive().find((h) => window.__delve.stealthy(s.game, h) && h !== dv.alive()[0]) || dv.alive()[1];
  dv.select(quiet, true);
  const p0 = dv.pos(quiet);
  // the nearest band (by the way there), not the boss
  let best = null;
  for (const [gid, g] of Object.entries(dv.groups)) {
    if (dv.entityOf(gid)?.boss) continue;
    for (const mm of g.m) {
      const goal = dv.freeSquares(mm.x, mm.y, 1, (x, y) => dv.standable(x, y) && Math.max(Math.abs(x - mm.x), Math.abs(y - mm.y)) === 3)[0];
      const path = goal && dv.pathFor(p0, goal, new Set());
      if (path && (!best || path.length < best.path.length)) best = { gid, path };
    }
  }
  let steps = 0, seen = false;
  for (const [x, y] of best?.path || []) {
    const p = dv.pos(quiet);
    await window.__step(x - p.x, y - p.y, true);
    await window.__idle();
    steps++;
    seen = dv.groups[best.gid]?.m.some((mm) => !mm.dead && s.isVisible(mm.x, mm.y));
    if (s.battle || seen || steps > 16) break;
  }
  window.__tick(1.5);
  s.camFocus(s.state.pos.x, s.state.pos.y, true);
  window.__tick(1);
  const mark = [...document.querySelectorAll('.emark.unaware')].some((el) => el.style.display !== 'none');
  return { scout: quiet.name, steps, seen, battle: !!s.battle, mark, gid: best?.gid };
});
check('a scout walks ahead alone and comes upon a band, still unaware', scout.steps > 0 && scout.seen && !scout.battle && scout.mark, scout);
// point at one of them: the card says it has not noticed anyone
const card = await ev(() => {
  const s = window.__app.session, dv = s.dv, v = s.view;
  const g = dv.groups[window.__dvScoutGid || Object.keys(dv.groups).find((k) => dv.groups[k].m.some((mm) => !mm.dead && s.isVisible(mm.x, mm.y)))];
  const k = g.m.findIndex((mm) => !mm.dead && s.isVisible(mm.x, mm.y));
  const gid = Object.keys(dv.groups).find((x) => dv.groups[x] === g);
  const e = v.entities.get(`dv:${gid}:${k}`);
  const q = v.worldToScreen(e.root.position.x, e.root.position.y + 0.5, e.root.position.z);
  const r = v.renderer.domElement.getBoundingClientRect();
  const ex = window.__app.playUI.explore;
  ex.mouse = { x: r.left + q.x, y: r.top + q.y };
  ex.refreshHover();
  return ex.tip.el.hidden ? '' : ex.tip.el.textContent;
});
check('pointing at an unaware monster says so (and that striking first surprises it)', /Unaware of you/.test(card) && /attack/i.test(card), card);
await shot('dv-02-scout-and-dormant-band');
await ev(() => { const ex = window.__app.playUI.explore; ex.mouse = null; ex.clearHover(); window.__app.session.dv.select(null, true); });

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

await ev(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // wait for a hero's turn (the HUD waiting on the player)
  window.__heroTurn = async (ms = 30000) => {
    const s = window.__app.session;
    for (let i = 0; i < ms / 30; i++) { const b = s.battle; if (!b) return null; if (b.active && !b.acting) return b.active; await sleep(30); }
    return null;
  };
  // strike down every foe in the fight and end the turn: victory
  window.__win = async () => {
    const s = window.__app.session, b = s.battle;
    if (!b) return false;
    // (bands that hear the fight may join as it goes: strike them down too)
    for (let k = 0; k < 6 && s.battle === b; k++) {
      if (!(await window.__heroTurn())) break;
      for (const e of b.enemies) if (b.alive(e)) await b.damage(e, 999, {});
      await b.actPass();
      for (let i = 0; i < 100 && s.battle === b && !(b.active && !b.acting); i++) await sleep(30);
    }
    for (let i = 0; i < 300 && (s.battle || s.mode !== 'explore'); i++) await sleep(30);
    await sleep(1100); // the victory window
    document.querySelectorAll('.victory-modal').forEach((m) => m.closest('.modal-back')?.remove());
    return s.mode === 'explore' && !s.battle;
  };
});

// a turn in, the camera on the hero whose turn it is; screenshot of a battle in a corridor-ish place
await ev(() => window.__heroTurn());
await ev(() => window.__tick(1));
await shot('dv-04-battle');

// --- a band that sees the fight joins it at the next round
const joined = await ev(async () => {
  const s = window.__app.session, dv = s.dv, b = s.battle;
  const u = await window.__heroTurn();
  if (!u) return { noTurn: true };
  // another band, one of whom has wandered close to this hero
  const [gid, g] = Object.entries(dv.groups).find(([og, gg]) => !gg.aware && !dv.entityOf(og)?.boss && gg.m.some((mm) => !mm.dead)) || [];
  if (!gid) return { none: true };
  const spot = dv.freeSquares(u.x, u.y, 1, (x, y) => (x !== u.x || y !== u.y) && dv.standable(x, y) && !b.unitAt(x, y) && Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) <= 2)[0];
  const mm = g.m.find((x) => !x.dead);
  mm.x = spot.x; mm.y = spot.y;
  s.view.placeEntity(`dv:${gid}:${g.m.indexOf(mm)}`, spot.x, spot.y);
  const rng = window.__delve.rng, chance = rng.chance;
  rng.chance = () => true; // (it surely notices)
  try { await dv.afterTurn(b, u); } finally { rng.chance = chance; }
  const units = b.enemies.filter((x) => x.gid === gid);
  return { gid, members: g.m.filter((x) => !x.dead).length, units: units.length, inOrder: units.some((x) => b.order.includes(x)), aware: g.aware, log: [...document.querySelectorAll('.log-line')].slice(-3).map((l) => l.textContent) };
});
check('a dormant band that notices the fight joins it (whole, at the next round)', joined.aware && joined.units === joined.members && joined.units > 0 && !joined.inOrder, joined);
check('the log says they join', joined.log?.some((l) => /join|come running/.test(l)), joined.log);
await ev(() => window.__tick(0.5));
await shot('dv-05-joined');

// --- victory: back to exploring, everyone where they stood; the beaten bands are gone
const won = await ev(async () => {
  const s = window.__app.session, dv = s.dv, b = s.battle;
  await window.__heroTurn();
  const at = Object.fromEntries(b.partyUnits.filter((u) => b.alive(u)).map((u) => [u.member.name, { x: u.x, y: u.y }]));
  const gids = [...new Set(b.enemies.map((u) => u.gid))];
  const ok = await window.__win();
  const now = Object.fromEntries(dv.alive().map((h) => [h.name, dv.pos(h)]));
  const ms = s.mapState(s.map.id);
  return {
    ok, mode: s.mode, at, now, gids,
    gone: gids.every((g) => !s.map.entities.some((e) => e.id === g) && !dv.groups[g] && ms.removed.includes(g)),
    flags: Object.keys(s.party.flags).filter((k) => k.startsWith('killed_')),
    figs: [...s.view.entities.keys()].filter((k) => k.startsWith('hero:')).length,
  };
});
check('victory returns to exploring', won.ok && won.mode === 'explore', won);
check('after the battle every hero stands where they fought', Object.keys(won.at).every((n) => won.now[n] && won.now[n].x === won.at[n].x && won.now[n].y === won.at[n].y) && won.figs === Object.keys(won.now).length, won);
check('beaten bands leave the map for good (and count as slain)', won.gone && won.flags.length > 0, won);

// --- strike an unaware monster: caught unawares, every hero a free turn first
const surprise = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const p = s.state.pos;
  const cands = Object.entries(dv.groups).filter(([gid, g]) => !g.aware && !dv.entityOf(gid)?.boss && g.m.some((mm) => !mm.dead));
  cands.sort(([, a], [, b2]) => Math.abs(a.m[0].x - p.x) + Math.abs(a.m[0].y - p.y) - (Math.abs(b2.m[0].x - p.x) + Math.abs(b2.m[0].y - p.y)));
  for (const [gid, g] of cands) {
    const mm = g.m.find((x) => !x.dead);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = mm.x + dx, y = mm.y + dy;
      if (!dv.standable(x, y)) continue;
      // the company a few squares behind, the striker right beside it, unseen
      const lead = dv.actor();
      dv.setPos(lead, x, y);
      const rest = dv.freeSquares(x, y, dv.alive().length + 4, (a, c) => dv.standable(a, c) && Math.max(Math.abs(a - mm.x), Math.abs(c - mm.y)) >= 2);
      dv.alive().filter((h) => h !== lead).forEach((h, i) => dv.setPos(h, rest[i].x, rest[i].y));
      dv.spawnHeroes();
      s.updateVisibility(true);
      s.move(-dx, -dy); // bump: strike
      for (let i = 0; i < 200 && !s.battle?.active; i++) await new Promise((r) => setTimeout(r, 30));
      const b = s.battle;
      if (!b) return { noBattle: true, gid };
      const first = { round: b.round, order: b.order.map((u) => u.side), striker: b.order[0]?.member?.name, lead: lead.name, banner: !!document.querySelector('.dv-surprise'), strip: document.querySelector('.cbt-round.dv-free')?.textContent };
      return { gid, surprise: !!b.opts.surprise, ...first, log: [...document.querySelectorAll('.log-line')].slice(-4).map((l) => l.textContent), heroes: b.partyUnits.length };
    }
  }
  return { none: true };
});
check('striking an unaware monster catches its band unawares', surprise.surprise && surprise.round === 0 && surprise.log?.some((l) => /Caught unawares/.test(l)), surprise);
check('in the surprise every hero has a turn before any foe, the striker first', surprise.order?.length === surprise.heroes && surprise.order.every((x) => x === 'party') && surprise.striker === surprise.lead, surprise);
check('the surprise is shown on screen (banner, strip)', surprise.banner && surprise.strip === 'Free', surprise);
await ev(() => window.__tick(0.3));
await shot('dv-03-surprise');
const surpriseWin = await ev(() => window.__win());
check('the surprise battle can be won', surpriseWin);

// --- leave and come back: the dead stay dead, the living as they were
const back = await ev(async () => {
  const s = window.__app.session;
  const m = window.__barrow();
  const before = Object.fromEntries(Object.entries(s.dv.groups).map(([gid, g]) => [gid, g.m.map((mm) => mm.dead ? 'x' : mm.hp).join()]));
  const removed = [...s.mapState(m.id).removed];
  await s.leaveMap();
  const out = s.map.type;
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  const after = Object.fromEntries(Object.entries(s.dv.groups).map(([gid, g]) => [gid, g.m.map((mm) => mm.dead ? 'x' : mm.hp).join()]));
  return { out, before, after, removedBack: removed.filter((id) => s.map.entities.some((e) => e.id === id)), heroes: s.dv.alive().map((h) => s.dv.pos(h)) };
});
check('leaving the dungeon and coming back keeps the dead dead and the living as they were', back.out === 'world' && JSON.stringify(back.before) === JSON.stringify(back.after) && !back.removedBack.length, back);

// --- fleeing by the stairs: every hero who steps onto them leaves the fight; all gone, the company is out
const fled = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const stairs = s.map.entities.find((e) => e.type === 'portal');
  // everyone close by the stairs; then something nasty out of the dark
  const spots = dv.freeSquares(stairs.x, stairs.y, dv.alive().length, (a, c) => dv.standable(a, c) && Math.abs(a - stairs.x) + Math.abs(c - stairs.y) <= 2);
  dv.alive().forEach((h, i) => dv.setPos(h, spots[i].x, spots[i].y));
  dv.spawnHeroes();
  s.updateVisibility(true);
  s.engage({ id: 'amb_test', monster: 'goblin', count: '3', roaming: true });
  const seen = [];
  for (let guard = 0; guard < 20; guard++) {
    const u = await window.__heroTurn(20000);
    if (!u) break;
    const b = s.battle;
    seen.push(u.member.name);
    if (!(await b.actMoveTo(stairs.x, stairs.y, u))) await b.actPass();
  }
  for (let i = 0; i < 200 && (s.battle || s.transitioning || s.mode !== 'explore'); i++) await new Promise((r) => setTimeout(r, 30));
  return { seen, map: s.map.type, dv: !!s.dv, tmp: Object.keys(s.mapState(window.__barrow().id).delve.groups).filter((k) => k.startsWith('foe')).length, log: [...document.querySelectorAll('.log-line')].slice(-16).map((l) => l.textContent) };
});
check('heroes escape up the stairs one by one; when all are out, the company has left the dungeon', fled.map === 'world' && !fled.dv && fled.log.filter((l) => /escapes up the stairs/.test(l)).length >= 1, fled);
check('a fight that sprang up from nowhere does not linger once fled', fled.tmp === 0, fled);

// --- a wandering band in a dungeon turns up out of sight, unaware
const wander = await ev(async () => {
  const s = window.__app.session;
  const m = window.__barrow();
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  const dv = s.dv;
  // somewhere well inside (the way in is a breather), and the dice say yes
  const lead = dv.actor();
  const far = Object.values(dv.groups).flatMap((g) => g.m).filter((mm) => !mm.dead).sort((a, b) => (Math.abs(b.y - m.entry.y) + Math.abs(b.x - m.entry.x)) - (Math.abs(a.y - m.entry.y) + Math.abs(a.x - m.entry.x)))[0];
  const spot = dv.freeSquares(far.x, far.y, 30, (a, c) => dv.standable(a, c) && Math.abs(a - far.x) + Math.abs(c - far.y) >= 10)[0] || dv.freeSquares(m.entry.x, m.entry.y - 12, 1, (a, c) => dv.standable(a, c))[0];
  dv.alive().forEach((h) => dv.setPos(h, h === lead ? spot.x : dv.pos(h).x, h === lead ? spot.y : dv.pos(h).y));
  dv.select(lead, true);
  s.updateVisibility(true);
  const before = Object.keys(dv.groups).length;
  const rng = window.__delve.rng, chance = rng.chance;
  s.state.lastEncounter = -99;
  rng.chance = () => true;
  try { for (let i = 0; i < 5 && Object.keys(dv.groups).length === before; i++) s.maybeSpawnEncounter(); } finally { rng.chance = chance; }
  const gid = Object.keys(dv.groups).find((k) => s.map.entities.find((e) => e.id === k)?.roaming);
  const g = gid && dv.groups[gid];
  const ms = s.mapState(m.id);
  return { gid, n: g?.m.length, aware: g?.aware, seen: g ? g.m.some((mm) => s.isVisible(mm.x, mm.y)) : null, near: g ? g.m.some((mm) => dv.nearHero(mm.x, mm.y, 7)) : null, kept: !!ms.delve.groups[gid]?.ent, battle: !!s.battle };
});
check('a wandering band in a dungeon turns up out of sight, unaware (no battle at once)', wander.gid && wander.n > 0 && !wander.aware && !wander.seen && !wander.near && !wander.battle && wander.kept, wander);

// --- the designer's "monsters leave us alone": none notice
const peace = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  s.peaceful = true;
  const [gid, g] = Object.entries(dv.groups).find(([, gg]) => gg.m.some((mm) => !mm.dead));
  const mm = g.m.find((x) => !x.dead);
  const spot = dv.freeSquares(mm.x, mm.y, 1, (a, c) => dv.standable(a, c) && (a !== mm.x || c !== mm.y))[0];
  dv.setPos(dv.actor(), spot.x, spot.y);
  dv.spawnHeroes();
  s.party.light = 200;
  for (let i = 0; i < 3; i++) { await s.wait(); await window.__idle(); }
  const out = { aware: g.aware, battle: !!s.battle };
  s.peaceful = false;
  return out;
});
check('a playtest where monsters leave the company alone: nobody notices', !peace.aware && !peace.battle, peace);

// --- an old save made inside a dungeon (before battlegrounds) loads sensibly
const old = await ev(async () => {
  const app = window.__app;
  const s = app.session;
  const m = window.__barrow();
  const st = s.serializeState();
  for (const ms of Object.values(st.maps)) delete ms.delve;
  st.pos = { map: m.id, x: m.entry.x, y: m.entry.y };
  // (an old save had moved a band while it chased the company)
  const band = m.entities.find((e) => e.type === 'monster' && !e.boss && !(st.maps[m.id]?.removed || []).includes(e.id));
  (st.maps[m.id] ||= { removed: [], tiles: {}, moved: {}, explored: null }).moved[band.id] = [m.entry.x + 1, m.entry.y - 3];
  app.stopSession();
  await app.playGame(app.sample, { state: st, noSave: true });
  await new Promise((r) => setTimeout(r, 1500));
  const s2 = app.session, dv = s2.dv;
  return {
    dv: !!dv, map: s2.map?.name, heroes: dv ? dv.alive().map((h) => dv.pos(h)) : [], groups: dv ? Object.keys(dv.groups).length : 0,
    ents: s2.map.entities.filter((e) => e.type === 'monster').length, pos: s2.state.pos,
    figs: [...s2.view.entities.keys()].filter((k) => k.startsWith('hero:')).length,
  };
});
check('an old save inside a dungeon loads: the company split round where it stood, the bands all there', old.dv && old.map === 'Grimholt Barrow' && old.heroes.length >= 2 && old.groups === old.ents && old.figs === old.heroes.length && old.heroes.some((p) => p.x === old.pos.x && p.y === old.pos.y), old);

// --- a curiosity that turns into a fight (the barrow's mimic) is fought right there, where the chest stood
const mimic = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const e = s.map.entities.find((x) => x.id === 'ev_mimic');
  if (!e) return { none: true };
  const spot = dv.freeSquares(e.x, e.y, 1, (x, y) => dv.standable(x, y) && Math.abs(x - e.x) + Math.abs(y - e.y) === 1)[0];
  dv.setPos(dv.actor(), spot.x, spot.y);
  dv.spawnHeroes();
  s.updateVisibility(true);
  s.ui.openEvent(e);
  await sleep(200);
  [...document.querySelectorAll('.choose-item')].find((b) => /Open it/.test(b.textContent))?.click();
  await sleep(300);
  [...document.querySelectorAll('.modal-back button')].find((b) => /To arms/.test(b.textContent))?.click();
  for (let i = 0; i < 200 && !s.battle?.active; i++) await sleep(30);
  const b = s.battle;
  const foe = b?.enemies[0];
  const out = { battle: !!b, field: !!b?.field, foe: foe?.def.id, at: foe ? [foe.x, foe.y] : null, chest: [e.x, e.y], hidden: !s.view.entities.get(e.id)?.root.visible };
  out.won = await window.__win();
  out.gone = !s.map.entities.includes(e);
  return out;
});
check('a curiosity that turns into a fight is fought on the dungeon floor, the mimic where the chest stood', mimic.field && mimic.foe === 'mimic' && mimic.at?.[0] === mimic.chest[0] && mimic.at?.[1] === mimic.chest[1] && mimic.hidden && mimic.won && mimic.gone, mimic);

// --- camping: not with monsters in sight close by; otherwise a rest as ever
const camp = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const rng = window.__delve.rng, chance = rng.chance;
  const [gid, g] = Object.entries(dv.groups).find(([, gg]) => gg.m.some((mm) => !mm.dead));
  const mm = g.m.find((x) => !x.dead);
  s.party.light = 100;
  const near = dv.freeSquares(mm.x, mm.y, 1, (x, y) => dv.standable(x, y) && Math.max(Math.abs(x - mm.x), Math.abs(y - mm.y)) === 2 && window.__delve.hasLOS(s.map, x, y, mm.x, mm.y))[0];
  dv.setPos(dv.actor(), near.x, near.y);
  s.updateVisibility(true);
  const t0 = s.state.turn;
  await s.camp();
  const refused = s.state.turn === t0 && g.aware === false;
  // far from every band
  const entry = window.__barrow().entry;
  dv.alive().forEach((h) => dv.setPos(h, entry.x, entry.y));
  const mems = Object.values(dv.groups).flatMap((gg) => gg.m).filter((x) => !x.dead);
  const quiet = dv.freeSquares(entry.x, entry.y, 1, (x, y) => dv.standable(x, y) && mems.every((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) >= 12))[0] || entry;
  const spots = dv.freeSquares(quiet.x, quiet.y, dv.alive().length, (x, y) => dv.standable(x, y));
  dv.alive().forEach((h, i) => dv.setPos(h, spots[i].x, spots[i].y));
  dv.spawnHeroes();
  s.updateVisibility(true);
  rng.chance = () => false; // (no ambush tonight)
  try { await s.camp(); } finally { rng.chance = chance; }
  return { refused, rested: s.state.turn >= t0 + 50, gid, foes: dv.visibleFoes().filter((f) => dv.nearHero(f.x, f.y, 8)).length, mode: s.mode, busy: s.busy, log: [...document.querySelectorAll('.log-line')].slice(-3).map((l) => l.textContent) };
});
check('no camp with a band in sight close by; a rest when none is', camp.refused && camp.rested, camp);

// --- a battle in a corridor: the company strung out along it, a band coming down on them
const corridor = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const m of s.party.members) { m.status = 'ok'; m.hp = Math.max(m.hp, 12); }
  dv.refreshHeroes();
  const open = (x, y) => dv.walkable(x, y);
  // a passage: a square with little open ground round it (the barrow's tunnels are one or two wide)
  const corr = (x, y) => {
    if (!dv.standable(x, y)) return false;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && open(x + dx, y + dy)) n++;
    return n <= 5 && ((open(x, y - 1) && open(x, y + 1)) || (open(x - 1, y) && open(x + 1, y)));
  };
  const n = dv.alive().length;
  for (const [gid, g] of Object.entries(dv.groups)) {
    if (dv.entityOf(gid)?.boss || !g.m.some((mm) => !mm.dead)) continue;
    const mm = g.m.find((x) => !x.dead);
    // a straight run of corridor some way from the band
    const runs = dv.freeSquares(mm.x, mm.y, 400, (x, y) => corr(x, y) && Math.abs(x - mm.x) + Math.abs(y - mm.y) >= 5, (x, y) => open(x, y));
    for (const c of runs) {
      const dir = open(c.x, c.y - 1) && open(c.x, c.y + 1) ? [0, 1] : [1, 0];
      const line = [];
      for (let i = -n; i <= n && line.length < n; i++) { const x = c.x + dir[0] * i, y = c.y + dir[1] * i; if (corr(x, y)) line.push({ x, y }); else if (line.length) break; }
      if (line.length < n) continue;
      const others = Object.entries(dv.groups).filter(([og, gg]) => og !== gid && gg.m.some((o) => !o.dead && line.some((p) => Math.max(Math.abs(p.x - o.x), Math.abs(p.y - o.y)) < 7)));
      if (others.length) continue;
      dv.alive().forEach((h, i) => dv.setPos(h, line[i].x, line[i].y));
      dv.spawnHeroes();
      s.updateVisibility(true);
      s.camFocus(line[0].x, line[0].y, true);
      dv.wake([{ gid, hero: dv.actor(), came: false }]);
      // a round or two of standing fast while they come on
      for (let k = 0; k < 10; k++) {
        const u = await window.__heroTurn(20000);
        if (!u) break;
        const b = s.battle;
        if (b.enemies.some((e) => b.alive(e) && b.partyUnits.some((p) => b.alive(p) && Math.abs(p.x - e.x) + Math.abs(p.y - e.y) <= 2))) return { gid, line, ok: true };
        await b.actPass();
        await sleep(50);
      }
      return { gid, line, ok: !!s.battle };
    }
  }
  return { none: true };
});
await ev(() => window.__tick(0.5));
await shot('dv-06-corridor-battle');
check('a battle can be fought in a corridor of the dungeon', corridor.ok, corridor);
await ev(() => window.__win());

// --- defeat on the dungeon floor is the end, as ever
const lost = await ev(async () => {
  const s = window.__app.session, dv = s.dv;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  s.engage({ id: 'amb_doom', monster: 'goblin', count: '2', roaming: true });
  const u = await window.__heroTurn(20000);
  const b = s.battle;
  if (!u || !b) return { noBattle: true };
  for (const p of b.partyUnits) if (b.alive(p)) await b.damage(p, 999, {});
  await b.actPass();
  for (let i = 0; i < 200 && s.mode !== 'gameover'; i++) await sleep(30);
  await sleep(300);
  return { mode: s.mode, modal: [...document.querySelectorAll('.modal-title, .modal h2, .modal-head')].map((x) => x.textContent).join('|'), dv: !!dv };
});
check('defeat on the dungeon floor ends in the game-over window as ever', lost.mode === 'gameover' && /Darkness Falls/.test(lost.modal), lost);

console.log(JSON.stringify(errors.slice(0, 5)));
await browser.close();
if (errors.length) { console.log('FAIL page errors'); fails.push('page errors'); }
console.log(fails.length ? `FAIL ${fails.length} check(s) failed` : 'all delve checks passed');
process.exit(fails.length ? 1 : 0);
