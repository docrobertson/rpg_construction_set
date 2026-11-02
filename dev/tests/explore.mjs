// Exploring checks: the company walks as a group, marks over heads, the hover
// card, click to walk / talk / visit, the Nearby bar and its keys.
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
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(800);

// helpers living in the page: run the view's clock by hand (the test machine
// draws a frame or two a second), place the party, find a figure on screen
await ev(() => {
  const v = window.__app.view;
  window.__tick = (sec = 1) => { for (let t = 0; t < sec; t += 0.05) { v.time += 0.05; v._updateEntities(0.05); } v._updateCamera(1); };
  window.__place = (x, y, face = [0, -1]) => {
    const s = window.__app.session;
    s.state.pos.x = x; s.state.pos.y = y; s.state.facing = face;
    s.refreshPartyVisual();
    s.view.focus(x, y, true);
    s.updateVisibility(true);
    s.ui.refresh();
    window.__tick(2);
  };
  window.__screen = (id) => {
    const e = v.entities.get(id);
    const p = e.root.position;
    const q = v.worldToScreen(p.x, p.y + e.info.height * e.scale * 0.55, p.z);
    const r = v.renderer.domElement.getBoundingClientRect();
    return { x: r.left + q.x, y: r.top + q.y };
  };
  window.__tileScreen = (x, y, up = 0.3) => {
    const q = v.worldToScreen(x + 0.5, v.heightAt(x, y) + up, y + 0.5);
    const r = v.renderer.domElement.getBoundingClientRect();
    return { x: r.left + q.x, y: r.top + q.y };
  };
  window.__hover = (p) => { const ex = window.__app.playUI.explore; ex.mouse = { x: p.x, y: p.y }; ex.refreshHover(); const t = ex.tip.el; return t.hidden ? '' : t.textContent; };
  window.__walkDone = async () => { const s = window.__app.session; for (let i = 0; i < 600 && (window.__app.playUI.autoPath || s.busy); i++) { window.__tick(0.3); await new Promise((r) => setTimeout(r, 30)); } };
});

// --- the company: everyone after the leader walks as their own figure
const fol = await ev(() => {
  const s = window.__app.session, v = window.__app.view;
  const alive = s.party.members.filter((m) => m.status !== 'dead');
  const ids = [...v.entities.keys()].filter((k) => k.startsWith('party:'));
  return { alive: alive.length, ids, leader: !!v.entities.get('party') };
});
check('every companion has a figure of their own', fol.leader && fol.ids.length === fol.alive - 1 && fol.alive > 1, fol);

const near = (r) => r.dists.every((d) => d < 2.2) && r.minGap >= 0.3 && r.onGround;
const groupState = () => ev(() => {
  const s = window.__app.session, v = window.__app.view;
  const L = v.entities.get('party').root.position;
  const fs = [...v.entities.entries()].filter(([k]) => k.startsWith('party:')).map(([, e]) => e.root.position);
  const all = [L, ...fs];
  let minGap = 9;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) minGap = Math.min(minGap, Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z));
  return {
    dists: fs.map((p) => +Math.hypot(p.x - L.x, p.z - L.z).toFixed(2)), minGap: +minGap.toFixed(2),
    onGround: fs.every((p) => s.followerGround(Math.floor(p.x), Math.floor(p.z)) || (Math.floor(p.x) === s.state.pos.x && Math.floor(p.z) === s.state.pos.y)),
    xs: fs.map((p) => +(p.x - L.x).toFixed(2)), mode: v.followers.mode,
  };
});
check('the company gathers round the leader without crowding', near(await groupState()), await groupState());
// walk three squares east: the others follow behind
const walked = await ev(async () => {
  const s = window.__app.session;
  const start = { ...s.state.pos };
  for (let i = 0; i < 3; i++) {
    const p = s.move(1, 0);
    for (let k = 0; k < 40 && s.busy; k++) { window.__tick(0.05); await new Promise((r) => setTimeout(r, 5)); }
    await p;
  }
  return { start, end: { ...s.state.pos } };
});
let g = await groupState();
check('followers trail behind the leader while walking', walked.end.x > walked.start.x && g.xs.every((x) => x < 0), { walked, g });
await ev(() => window.__tick(3));
g = await groupState();
check('when the leader stops they gather into a little group', g.mode === 'gather' && near(g), g);
// deaths and recruits change the figures
const dead = await ev(() => {
  const s = window.__app.session, v = window.__app.view;
  const m = s.party.members[s.party.members.length - 1];
  s.hurtMember(m, 999, 'test');
  const n1 = [...v.entities.keys()].filter((k) => k.startsWith('party:')).length;
  m.status = 'ok'; m.hp = 5;
  s.refreshPartyVisual();
  const n2 = [...v.entities.keys()].filter((k) => k.startsWith('party:')).length;
  // a new leader walks in front
  const second = s.party.members[1];
  s.party.members.splice(1, 1); s.party.members.unshift(second);
  s.refreshPartyVisual();
  const leadKey = 'party:' + (s.party.members[1].id || s.party.members[1].name);
  const ok = v.entities.has(leadKey) && !v.entities.has('party:' + (second.id || second.name));
  s.party.members.shift(); s.party.members.splice(1, 0, second);
  s.refreshPartyVisual();
  return { n1, n2, ok };
});
check('a fallen hero leaves the line and comes back when raised', dead.n2 === dead.n1 + 1, dead);
check('a new leader takes the front and the old one falls in behind', dead.ok, dead);

// --- Westhold: marks over heads
await ev(async () => {
  const s = window.__app.session;
  const m = s.game.maps.find((mm) => mm.name === 'Westhold');
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  window.__tick(1);
});
const marks = await ev(() => {
  const els = [...document.querySelectorAll('.emark')];
  const k = (id) => els.find((e) => e.dataset.id === id)?.dataset.kind || null;
  return { wynn: k('npc_wynn'), hilda: k('npc_hilda'), borin: k('npc_borin'), inn: els.filter((e) => e.dataset.kind === 'inn').length, shop: els.filter((e) => e.dataset.kind === 'shop').length };
});
check('a quest giver wears a gold !, the quest contact a ?', marks.wynn === 'quest' && marks.hilda === 'turnin', marks);
check('shops, the inn and a would-be companion are marked', marks.shop >= 3 && marks.inn >= 1 && marks.borin === 'recruit', marks);
const marked = await ev(() => {
  const s = window.__app.session;
  window.__quests.startQuest(s, 'q_wolf');
  s.ui.refresh();
  const k = document.querySelector('.emark[data-id="npc_wynn"]')?.dataset.kind;
  return k;
});
check('the mark changes when the quest is taken', marked === 'progress', marked);

// --- the hover card and the path preview
await ev(() => {
  const s = window.__app.session;
  const w = s.map.entities.find((e) => e.id === 'npc_wynn');
  window.__place(w.x + 3, w.y, [-1, 0]);
});
const tipNpc = await ev(() => window.__hover(window.__screen('npc_wynn')));
check('hovering a person names them and says a click talks', /Wynn/.test(tipNpc) && /Click to talk/.test(tipNpc), tipNpc);
check('hovering shows the path there', await ev(() => window.__app.view.pathPreview.dots.count > 0));
check('the cursor says talk', await ev(() => /data:image\/svg/.test(window.__app.view.renderer.domElement.style.cursor)));
const tipTile = await ev(() => { const p = window.__app.session.state.pos; return window.__hover(window.__tileScreen(p.x, p.y + 2, 0)); });
check('hovering the ground offers a walk and counts the steps', /Walk here · \d+ steps?/.test(tipTile), tipTile);

// right-click looks
const looked = await ev(() => {
  const p = window.__screen('npc_wynn');
  window.__app.view.renderer.domElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
  return [...document.querySelectorAll('.log-line')].slice(-1)[0]?.textContent;
});
check('right-click looks without walking', /You see: Wynn/.test(looked || ''), looked);

// --- click a person: walk over and talk
const talked = await ev(async () => {
  const ui = window.__app.playUI;
  const p = window.__screen('npc_wynn');
  const go = ui.explore.click(p.x, p.y);
  await window.__walkDone();
  await go;
  return { modal: !!document.querySelector('.talk-modal'), who: document.querySelector('.talk-head b')?.textContent, mode: window.__app.session.mode };
});
check('clicking a person walks up and opens the conversation', talked.modal && talked.who === 'Wynn', talked);
await ev(() => document.querySelector('.talk-modal')?.closest('.modal-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await wait(300);
await ev(() => { const s = window.__app.session; if (s.mode === 'dialog') s.mode = 'explore'; });

// --- hover and click a building: walk to its keeper
const shop = await ev(() => {
  const s = window.__app.session, ui = window.__app.playUI;
  const b = ui.explore.buildings().find((x) => x.keeper && x.keeper.shop && x.keeper.role === 'armor') || ui.explore.buildings().find((x) => x.keeper && x.keeper.shop);
  const [dx, dy] = b.doors[0];
  // stand a few squares out from the door
  let at = null;
  for (const [ox, oy] of [[0, 3], [0, -3], [3, 0], [-3, 0], [0, 2], [2, 0], [-2, 0], [0, -2]]) {
    const x = dx + ox, y = dy + oy;
    if (s.followerGround(x, y) && !s.blockingAt(x, y) && ui.explore.buildingIndexAt(x, y) < 0) { at = [x, y]; break; }
  }
  window.__place(at[0], at[1], [0, -1]);
  const walls = b.rim.filter(([x, y]) => !b.doors.some(([a, c]) => a === x && c === y));
  walls.sort((p, q) => Math.hypot(p[0] - at[0], p[1] - at[1]) - Math.hypot(q[0] - at[0], q[1] - at[1]));
  const wall = walls[0] || b.rim[0];
  const p = window.__tileScreen(wall[0], wall[1], 0.45);
  return { name: b.name, keeper: b.keeper.name, p, tip: window.__hover(p) };
});
check('hovering a building names it and offers a visit', shop.tip.includes(shop.name) && /Click to visit/.test(shop.tip), shop);
const visited = await ev(async (p) => {
  const ui = window.__app.playUI, s = window.__app.session;
  const go = ui.explore.click(p.x, p.y);
  await window.__walkDone();
  await go;
  return { modal: !!document.querySelector('.talk-modal'), who: document.querySelector('.talk-head b')?.textContent, pos: { ...s.state.pos }, mode: s.mode, log: [...document.querySelectorAll('.log-line')].slice(-3).map((l) => l.textContent), keeper: [s.map.entities.find((e) => e.name === 'Sybil')?.x, s.map.entities.find((e) => e.name === 'Sybil')?.y] };
}, shop.p);
check('clicking a building walks to its keeper and talks with them', visited.modal && visited.who === shop.keeper, visited);
await ev(() => document.querySelector('.talk-modal')?.closest('.modal-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await wait(300);
await ev(() => { const s = window.__app.session; if (s.mode === 'dialog') s.mode = 'explore'; });

// --- the Nearby bar and its keys
const nb = await ev(() => {
  const s = window.__app.session;
  const h = s.map.entities.find((e) => e.id === 'npc_hilda');
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    if (s.followerGround(h.x + dx, h.y + dy) && !s.blockingAt(h.x + dx, h.y + dy)) { window.__place(h.x + dx, h.y + dy, [-dx, -dy]); break; }
  }
  const el = document.querySelector('.nearby');
  return { shown: el && !el.hidden, text: el?.textContent || '' };
});
check('the Nearby bar offers to talk to whoever is beside you', nb.shown && /Talk to Mayor Hilda/.test(nb.text) && /T/.test(nb.text), nb);
await page.keyboard.press('t');
await wait(400);
check('T talks straight away when one person is in reach', await ev(() => document.querySelector('.talk-head b')?.textContent === 'Mayor Hilda'));
await ev(() => document.querySelector('.talk-modal')?.closest('.modal-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await wait(300);
await ev(() => { const s = window.__app.session; if (s.mode === 'dialog') s.mode = 'explore'; });
check('the command grid has the general commands, Journal among them', await ev(() => [...document.querySelectorAll('.hud-cmds .xcmd .xc-label')].map((x) => x.textContent).join(',') === 'Talk,Look,Cast,Use,Pack,Journal,Map,Camp,Wait,Help'));
// E steps out of the gate when standing at the edge... check the key goes to the first non-talk action
const ekey = await ev(async () => {
  const s = window.__app.session, ui = window.__app.playUI;
  const m = s.map;
  // stand on the south edge by the gate
  const e = m.entry;
  window.__place(e.x, m.h - 1, [0, 1]);
  const acts = ui.explore.nearby().map((a) => a.label + ':' + a.key);
  return { acts, edge: e.y };
});
check('at the edge of town the Nearby bar offers to leave (E)', ekey.acts.some((a) => /^Leave Westhold:E$/.test(a)), ekey);
await page.keyboard.press('e');
await ev(async () => { const s = window.__app.session; for (let i = 0; i < 200 && (s.transitioning || s.busy); i++) await new Promise((r) => setTimeout(r, 50)); });
check('E leaves the town', await ev(() => window.__app.session.map.type === 'world'));
const site = await ev(() => {
  const s = window.__app.session;
  window.__tick(1);
  const e = s.map.entities.find((x) => x.type === 'portal' && x.label === 'Westhold');
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (s.followerGround(e.x + dx, e.y + dy)) { window.__place(e.x + dx, e.y + dy, [-dx, -dy]); break; }
  const tip = window.__hover(window.__tileScreen(e.x, e.y, 0.2));
  const acts = window.__app.playUI.explore.nearby().map((a) => a.label);
  return { tip, acts, d: Math.abs(e.x - s.state.pos.x) + Math.abs(e.y - s.state.pos.y) };
});
check('hovering a town on the world map offers to enter it', /Westhold/.test(site.tip) && /Click to enter/.test(site.tip), site);
check('beside a town the Nearby bar offers to enter it', site.d === 1 && site.acts.includes('Enter Westhold'), site);

// --- a walk stops when a key is pressed
const stopped = await ev(async () => {
  const s = window.__app.session, ui = window.__app.playUI;
  const p = { ...s.state.pos };
  // somewhere a dozen squares away
  let tgt = null;
  for (let r = 10; r < 16 && !tgt; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
    const plan = ui.explore.planFor({ kind: 'tile', x: p.x + dx, y: p.y + dy });
    if (plan && ui.explore.pathFor(plan)?.length > 6) { tgt = plan; break; }
  }
  if (!tgt) return { skipped: true };
  const go = ui.explore.go(tgt);
  for (let k = 0; k < 60 && Math.abs(s.state.pos.x - p.x) + Math.abs(s.state.pos.y - p.y) < 1; k++) { window.__tick(0.05); await new Promise((r) => setTimeout(r, 10)); }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await window.__walkDone();
  await go;
  return { moved: Math.abs(s.state.pos.x - p.x) + Math.abs(s.state.pos.y - p.y), walking: !!ui.autoPath };
});
check('Esc (or any key) stops a walk', stopped.skipped || (stopped.moved >= 1 && stopped.moved < 6 && !stopped.walking), stopped);

// --- aboard ship the vessel carries everyone
const ship = await ev(() => {
  const s = window.__app.session, v = window.__app.view;
  s.state.vehicle = { type: 'ship', id: 'none' };
  s.refreshPartyVisual();
  const n = [...v.entities.keys()].filter((k) => k.startsWith('party:')).length;
  s.state.vehicle = null;
  s.refreshPartyVisual();
  return { aboard: n, ashore: [...v.entities.keys()].filter((k) => k.startsWith('party:')).length };
});
check('on a ship the companions are aboard; ashore they walk again', ship.aboard === 0 && ship.ashore >= 1, ship);

await page.screenshot({ path: `${OUT}/explore-end.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
