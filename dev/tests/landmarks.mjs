// The countryside's landmarks: every model builds (and every ruin), each new
// kind of place has a look, a map colour and a ready-made event whose choices
// work in play (flour for gold, a watch kept only after dark, a purse found
// once), the Event tool places them, the fields helper sows only open ground
// round the towns and never a road, and the Land step's farmland tools.
// Screenshots (tests/out/landmarks-*.png): every landmark on the world map at
// play zoom, the windmill close up, the ruins, a town with fields about it,
// and landmarks standing in a town.
// Prints PASS/FAIL lines; exits 1 on any failure.
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

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

const M = await import('../src/render/models.js');
const L = await import('../src/render/landmarks.js');
const E = await import('../src/game/events.js');
const C = await import('../src/world/countryside.js');
const G = await import('../src/world/generate.js');
const P = await import('../src/world/places.js');
const D = await import('../src/data/defaults.js');
const { terrain, T } = await import('../src/data/terrain.js');
const { buildSampleGame } = await import('../src/data/sample.js');
const { newGame } = await import('../src/data/schema.js');

// the new kinds of place, intact and ruined
const NEW_KINDS = Object.entries(E.EVENT_KINDS).filter(([, k]) => k.group).map(([id]) => id);
const RUINS = NEW_KINDS.filter((k) => E.EVENT_KINDS[k].group === 'Ruins');

// ---- every model builds, light enough to keep a MacBook smooth
{
  const bad = [];
  let heaviest = 0;
  // (a mill's sails and wheel are parts, centred on their axles)
  for (const kind of Object.keys(L.LANDMARK_BUILDERS).filter((k) => !['millsails', 'millwheel'].includes(k))) for (const ruined of [false, true]) {
    const g = M.buildModelGeometry({ kind, ruined });
    const n = (g.lit?.attributes.position.count || 0) + (g.glow?.attributes.position.count || 0);
    const bb = g.lit?.boundingBox;
    const finite = bb && [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(Number.isFinite);
    heaviest = Math.max(heaviest, n);
    // (a square's worth: nothing much beyond its edges, nothing under the ground)
    if (!n || !finite || !(g.height > 0) || n > 60000 || bb.min.y < -0.2 || Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) > 0.85) bad.push({ kind, ruined, n, finite, h: g.height, bb: finite && [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(2)) });
  }
  check(`all ${Object.keys(L.LANDMARK_BUILDERS).length} landmark models build, plain and ruined, about a square in size (heaviest ${heaviest} vertices)`, !bad.length, bad);
  check('the registry knows them', Object.keys(L.LANDMARK_BUILDERS).every((k) => M.MODEL_KINDS.includes(k)));
  const sp = L.SPINNERS.windmill({}), wp = L.SPINNERS.watermill({});
  check('a windmill\'s sails and a watermill\'s wheel turn (a ruin\'s do not)', sp?.look.kind === 'millsails' && wp?.look.kind === 'millwheel' && L.SPINNERS.windmill({ ruined: true }) === null && M.MODEL_KINDS.includes('millsails'));
}

// ---- each new kind: a look, a map colour, a ready-made event
{
  const mons = new Set(D.MONSTERS.map((m) => m.id)), items = new Set(D.ITEMS.map((i) => i.id));
  const bad = [];
  for (const k of NEW_KINDS) {
    const tpl = Object.entries(E.EVENT_TEMPLATES).find(([, t]) => t.kind === k);
    const look = E.eventLook({ kind: k });
    if (!tpl) { bad.push([k, 'no template']); continue; }
    if (!look || !M.MODEL_KINDS.includes(look.kind) || look.kind === 'marker') bad.push([k, 'look', look]);
    if (!E.EVENT_DOTS[E.eventDot({ kind: k })]) bad.push([k, 'dot']);
    if (!E.EVENT_KINDS[k].icon || !E.EVENT_KINDS[k].label) bad.push([k, 'label']);
    const t = tpl[1];
    if (!t.name || !t.text || (t.choices || []).length < 2 || !t.choices.some((c) => c.leave)) bad.push([k, 'choices']);
    for (const c of t.choices) for (const fx of [c.effects, c.failEffects, c.win]) {
      if (fx?.fight && !mons.has(fx.fight)) bad.push([k, 'monster', fx.fight]);
      for (const it of fx?.items || []) if (!items.has(it.id)) bad.push([k, 'item', it.id]);
    }
    // a prize or a purse found once hides behind its own flag
    for (const c of t.choices) if (c.hideFlag && ![c.effects?.flag, c.win?.flag].includes(c.hideFlag)) bad.push([k, 'hideFlag never set', c.label]);
  }
  check(`${NEW_KINDS.length} new kinds of place, each with a model, a map colour and a ready-made event`, NEW_KINDS.length >= 20 && !bad.length, bad);
  check('the ruins are separate kinds the editor can pick, drawn as ruins and coloured as ruins', RUINS.length >= 6 && RUINS.every((k) => E.eventDot({ kind: k }) === 'ruins' && (E.eventLook({ kind: k }).ruined || E.eventLook({ kind: k }).kind === 'burntfarm')), RUINS);
  check('farms and mills share a colour on the map, and the key stays short', ['windmill', 'watermill', 'apiary', 'orchard', 'shepherd', 'farm'].every((k) => E.eventDot({ kind: k }) === 'farm') && Object.keys(E.EVENT_DOTS).length <= 8);
  check('a designer\'s own look still wins over the kind\'s', E.eventLook({ kind: 'windmill', look: { kind: 'well' } }).kind === 'well');
  check('choices can wait for the dark (or the daylight)', !!E.REQS.night && !!E.REQS.day);
}

// ---- the fields helper, on the sample's world
const ch = (t) => terrain(t).key;
{
  const g = buildSampleGame();
  const w = g.maps[0];
  const before = Uint16Array.from(w.tiles);
  const busy = new Set(w.entities.map((e) => e.y * w.w + e.x));
  const roadsBefore = Array.from(w.tiles).filter((t) => ch(t) === 'road' || ch(t) === 'bridge').length;
  const t0 = performance.now();
  const r = C.sowFields(w, { seed: 7, keep: [g.settings.start], landmarks: true, ids: 'ev_farmland' });
  const ms = performance.now() - t0;
  const sites = C.farmingSites(w, true);
  const changed = [];
  for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] !== before[i]) changed.push({ i, x: i % w.w, y: Math.floor(i / w.w), was: ch(before[i]), now: ch(w.tiles[i]) });
  check(`fields are sown round the towns (${r.sown} squares, ${r.pasture} of pasture, ${ms.toFixed(0)} ms)`, r.sown >= 30 && ms < 500, r);
  check('only open grass and meadow is sown, never a road, the water or a place', changed.every((c) => ['grass', 'meadow'].includes(c.was) && ['fields', 'meadow'].includes(c.now)), changed.filter((c) => !['grass', 'meadow'].includes(c.was)).slice(0, 5));
  check('no square anything stands on is sown, nor the start', changed.every((c) => !busy.has(c.i) && !(c.x === g.settings.start.x && c.y === g.settings.start.y)));
  check('the roads are all still there', Array.from(w.tiles).filter((t) => ch(t) === 'road' || ch(t) === 'bridge').length === roadsBefore);
  const nearest = (c) => Math.min(...C.farmingSites(w).map((s) => Math.hypot(s.x - c.x, s.y - c.y)));
  check('every field lies near a town, village or castle, and none hard against one', changed.filter((c) => c.now === 'fields').every((c) => nearest(c) <= 6.6 && sites.every((s) => Math.max(Math.abs(s.x - c.x), Math.abs(s.y - c.y)) >= 2)), changed.filter((c) => c.now === 'fields' && nearest(c) > 6.6).slice(0, 4));
  // Brookend is a village: its fields are the thickest
  const round = (x0, y0, R) => changed.filter((c) => c.now === 'fields' && Math.hypot(c.x - x0, c.y - y0) <= R).length;
  check('a village has fields about it', round(60, 56, 6) >= 10, round(60, 56, 6));
  check('a farm landmark or two stands beside the fields, on open ground', r.events.length >= 1 && r.events.every((e) => ['grass', 'meadow'].includes(ch(before[e.y * w.w + e.x])) && C.FARM_LANDMARKS.includes(e.kind) && /^ev_farmland_/.test(e.id)), r.events.map((e) => [e.kind, e.x, e.y]));
  const w2 = buildSampleGame().maps[0];
  C.sowFields(w2, { seed: 7, keep: [g.settings.start], landmarks: true, ids: 'ev_farmland' });
  check('the same seed sows the same fields', w2.tiles.every((t, i) => t === w.tiles[i]));
  const w3 = buildSampleGame().maps[0];
  const was3 = Uint16Array.from(w3.tiles);
  const r3 = C.sowFields(w3, { seed: 7, sites: [{ x: 60, y: 56 }] });
  const far3 = [];
  w3.tiles.forEach((t, i) => { if (t !== was3[i] && t === T.fields && Math.hypot((i % w3.w) - 60, Math.floor(i / w3.w) - 56) > 5.6) far3.push(i); });
  check('fields can be sown round chosen places only', r3.sown > 0 && !far3.length, { sown: r3.sown, far3 });
  let on = 0;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) on += C.inFieldPlot(x, y, 12) ? 1 : 0;
  check('the Farmland brush lays a patchwork, not a carpet', on > 300 && on < 800, on);
}

// ---- a new land: fields round its places, its roads still whole
{
  const g = newGame({ blank: true, w: 40, h: 40 });
  const world = g.maps[0];
  const fresh = G.generateWorld(72, 72, 4242, { shape: 'continent' });
  Object.assign(world, { tiles: fresh.tiles, w: fresh.w, h: fresh.h, entities: fresh.entities });
  const kinds = new Set(fresh.entities.filter((e) => e.type === 'event').map((e) => e.kind));
  check('a generated world has the countryside\'s landmarks and ruins too', ['tower', 'chapel', 'circle', 'statue', 'graveyard'].every((k) => kinds.has(k)) && RUINS.filter((k) => kinds.has(k)).length >= 3, [...kinds]);
  const wants = ['town', 'village', 'village', 'castle', 'cave'].map((kind, i) => ({ kind, name: `${kind} ${i}` }));
  const placed = P.autoPlaceSites(g, world, wants, { seed: 4242, start: null });
  g.settings.start = P.besideSite(world, placed[0].portal.x, placed[0].portal.y);
  P.connectPlaces(g, world, { seed: 7 });
  const roads = Array.from(world.tiles).filter((t) => ch(t) === 'road').length;
  const r = C.sowFields(world, { seed: 4242, sites: placed.map((p) => p.portal), keep: [g.settings.start], landmarks: true });
  check('the Quick Start\'s new land gets fields round its towns, and keeps its roads', r.sown > 10 && Array.from(world.tiles).filter((t) => ch(t) === 'road').length === roads, { sown: r.sown, roads });
}

// ---- in play, and in the Construction Set
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `landmarks-${name}.png`) }); };
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
const TPL = JSON.parse(JSON.stringify(E.EVENT_TEMPLATES));
const play = async (game) => {
  await ev(async (g) => {
    const app = window.__app;
    // (a copy of the sample: this suite clears a meadow on it)
    const copy = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v instanceof Uint8Array ? { u8: Array.from(v) } : v)), (k, v) => (v && v.u8 ? Uint8Array.from(v.u8) : v));
    app.playGame(g === 'sample' ? copy(app.sample) : app.editor.game, { quick: true, noSave: true });
    for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 300));
  }, game);
  await page.addStyleTag({ content: '.qtrack,.qbanner-host,.chbanner{display:none!important}' });
  await closeModals();
};
await play('sample');

// a clean stretch of meadow on the world map to set things down on (west of
// the Barrow Downs), and a helper to put an event from a template there
await ev(async () => {
  const s = window.__app.session, w = s.game.maps.find((m) => m.type === 'world');
  const grass = w.tiles[50 * w.w + 31];
  const at = { x: 30, y: 62 };
  for (let y = at.y - 12; y <= at.y + 8; y++) for (let x = at.x - 13; x <= at.x + 13; x++) w.tiles[y * w.w + x] = grass;
  w.entities = w.entities.filter((e) => Math.abs(e.x - at.x) > 13 || e.y < at.y - 12 || e.y > at.y + 8);
  window.__lm = { at };
  await s.enterMap(w.id, at.x, at.y + 3, { instant: true });
  s.game.settings.lineOfSight = false;
  s.updateVisibility(true);
});
const putEvent = (tplKey, x, y, extra = {}) => ev(([t, k, x, y, extra]) => {
  const s = window.__app.session, at = window.__lm.at;
  const e = { ...JSON.parse(JSON.stringify(t)), type: 'event', id: `lm_${k}_${x}_${y}`, x: at.x + x, y: at.y + y, ...extra };
  s.map.entities.push(e);
  s.addVisual(e);
  return e.id;
}, [TPL[tplKey], tplKey, x, y, extra]);
const choose = (id, re) => ev(async ([id, re]) => {
  const s = window.__app.session;
  const e = s.map.entities.find((x) => x.id === id);
  s.ui.openEvent(e);
  await new Promise((r) => setTimeout(r, 150));
  const btns = [...document.querySelectorAll('.event-modal .choose-item')];
  const b = btns.find((x) => new RegExp(re).test(x.textContent));
  const out = { found: !!b, off: b?.classList.contains('disabled'), labels: btns.map((x) => x.textContent), why: b?.title };
  if (b && !out.off) { b.click(); await new Promise((r) => setTimeout(r, 150)); out.said = document.querySelector('.event-modal .ev-text')?.textContent; }
  return out;
}, [id, re]);

// buying flour at the windmill: gold for food
let id = await putEvent('windmill', 0, -3);
let r = await ev(() => { const p = window.__app.session.party; p.gold = 20; p.food = 10; return { gold: p.gold, food: p.food }; });
let c = await choose(id, 'flour');
let after = await ev(() => { const p = window.__app.session.party; return { gold: p.gold, food: p.food }; });
await closeModals();
check('the windmill sells flour and bread: 8 gold for 25 food', c.found && !c.off && after.gold === r.gold - 8 && after.food === r.food + 25, { c, r, after });
r = await ev(() => { window.__app.session.party.gold = 3; });
c = await choose(id, 'flour');
await closeModals();
check('...and not to a company with only 3 gold', c.found && c.off && /8 gold/.test(c.why || ''), c);
// the shepherd's watch is kept only after dark, and pays once
id = await putEvent('shepherd', 3, -3);
await ev(() => { const s = window.__app.session; s.state.turn = 30; s.applyDaylight?.(); });
c = await choose(id, 'watch');
await closeModals();
check('the shepherd\'s night watch waits for dusk', c.found && c.off && /dusk/.test(c.why || ''), c);
await ev(() => { const s = window.__app.session; s.state.turn = 300 * 0.72; s.applyDaylight?.(); });
const watch = await choose(id, 'watch');
await closeModals();
check('...and after dark it is offered', watch.found && !watch.off && /eyes shine/.test(watch.said || ''), watch);
for (let i = 0; i < 40 && !(await ev(() => !!window.__app.session.battle)); i++) await wait(150);
r = await ev(() => { const s = window.__app.session; return { battle: !!s.battle, bell0: s.party.inventory.shepherds_bell || 0 }; });
// (won at a stroke: the fight itself is not what this suite is about) the
// foes fall, the hero whose turn it is ends it, and the company is back on
// the road with the prize
const state = () => ev(() => { const s = window.__app.session; return { battle: !!s.battle, mode: s.mode, bell: s.party.inventory.shepherds_bell || 0 }; });
for (let k = 0, st = await state(); k < 80 && !(st.mode === 'explore' && !st.battle && st.bell > r.bell0); k++, st = await state()) {
  if (st.battle) {
    await ev(async () => { const b = window.__app.session.battle; for (const e of b?.enemies || []) if (b.alive(e)) { e.hp = 1; await b.damage(e, 5, {}); } });
    await page.keyboard.press('Space');
  } else await closeModals();
  await wait(250);
}
await wait(400);
r = { ...r, ...(await ev(() => { const s = window.__app.session; return { bell: s.party.inventory.shepherds_bell || 0, flag: Object.keys(s.party.flags).filter((f) => /_wolves$/.test(f)), mode: s.mode, log: [...document.querySelectorAll('.hud-log .log-line')].slice(-4).map((x) => x.textContent) }; })) };
check('the wolves come, and seeing them off earns the shepherd\'s bell', r.battle && r.bell === r.bell0 + 1 && r.flag.length === 1, r);
c = await choose(id, 'watch');
await closeModals();
check('...and the watch is not offered again', !c.found, c.labels);
await ev(() => { const s = window.__app.session; s.state.turn = 600; s.applyDaylight?.(); });
// the orchard's hidden purse is found once
id = await putEvent('orchard', -3, -3);
r = await ev(() => window.__app.session.party.gold);
c = await choose(id, 'Shake');
await closeModals();
after = await ev(() => window.__app.session.party.gold);
await ev(() => { window.__app.session.state.turn += 400; });
const again = await choose(id, 'Shake');
await closeModals();
check('shaking the old apple tree finds a purse — once', c.found && !c.off && after === r + 15 && !again.found, { c, r, after, again: again.labels });
// the ruined chapel's prayer waits for its ghost to be laid
id = await putEvent('ruined_chapel', 6, -3);
c = await choose(id, 'Pray');
await closeModals();
check('the ruined chapel is haunted until its ghost is laid', c.found && c.off && /haunted/.test(c.why || ''), c);
// a keeper's face on the card
r = await ev(async () => {
  const s = window.__app.session;
  s.ui.openEvent(s.map.entities.find((x) => x.kind === 'windmill'));
  await new Promise((res) => setTimeout(res, 300));
  return { pic: !!document.querySelector('.event-modal .ev-pic'), title: document.querySelector('.modal-title, .event-modal h2, .modal h2')?.textContent || '' };
});
await closeModals();
check('the miller\'s face is on the windmill\'s card', r.pic, r);

// ---- screenshots: every landmark on the world map at play zoom
const lay = (rows) => ev(([rows]) => {
  const s = window.__app.session, v = s.view, at = window.__lm.at;
  v.clearEntities();
  rows.forEach((row, ri) => row.forEach((look, i) => {
    const sp = row.length > 5 ? 2.4 : 2.8;
    v.addEntity(`lm${ri}_${i}`, look, at.x + Math.round((i - (row.length - 1) / 2) * sp), at.y - 6 + ri * 4, {});
  }));
  v.setPitch(52); v.rig.minDist = 1; v.setZoom(15, true); v.focus(at.x, at.y - 4, true);
}, [rows]);
const looks = (kinds) => kinds.map((k) => E.eventLook({ kind: k }));
const byGroup = (g) => NEW_KINDS.filter((k) => E.EVENT_KINDS[k].group === g);
await ev(() => { const s = window.__app.session; s.state.turn = 20; s.applyDaylight?.(); });
await lay([looks(byGroup('Farm and mill')), looks(byGroup('Old places'))]);
await wait(1800);
await shot('sheet-farms-and-old-places');
await lay([looks(byGroup('Out in the wilds')), looks(RUINS)]);
await wait(1800);
await shot('sheet-wilds-and-ruins');
r = await ev(() => {
  const v = window.__app.session.view;
  const all = [...v.entities.values()];
  return { n: all.length, scales: all.map((e) => +e.scale.toFixed(2)) };
});
check('on the world map the landmarks are drawn larger than their square', r.n >= 10 && r.scales.every((k) => k >= 1.25), r);

// the windmill close up, its sails turning
await ev(() => {
  const s = window.__app.session, v = s.view, at = window.__lm.at;
  v.clearEntities();
  v.addEntity('mill', { kind: 'windmill' }, at.x - 1, at.y - 4, {});
  v.addEntity('wheel', { kind: 'watermill' }, at.x + 2, at.y - 4, {});
  v.setZoom(7, true); v.focus(at.x + 0.4, at.y - 4.3, true);
});
const turn0 = await ev(() => window.__app.session.view.entities.get('mill').spin.part.rotation.z);
let turn1 = turn0;
// (a few frames: at full quality without a graphics card they come slowly)
for (let k = 0; k < 30 && turn1 === turn0; k++) { await wait(500); turn1 = await ev(() => window.__app.session.view.entities.get('mill').spin.part.rotation.z); }
await wait(1000);
await shot('windmill-close');
check('the windmill\'s sails turn as you watch', turn1 > turn0, { turn0, turn1 });
// the ruins, close enough to see what happened to them
await ev(([ruins]) => {
  const s = window.__app.session, v = s.view, at = window.__lm.at;
  v.clearEntities();
  ruins.forEach((look, i) => v.addEntity('r' + i, look, at.x - 2 + (i % 3) * 2, at.y - 6 + Math.floor(i / 3) * 2, {}));
  v.setZoom(7, true); v.focus(at.x, at.y - 5.2, true);
}, [looks(RUINS)]);
await wait(1500);
await shot('ruins');

// ---- the Construction Set: the Event tool places a windmill; its ruin can
// be chosen in the inspector; the Land step sows fields round every town
await ev(() => {
  const app = window.__app;
  const g = JSON.parse(JSON.stringify(app.sample, (k, v) => (v instanceof Uint8Array ? { u8: Array.from(v) } : v)), (k, v) => (v && v.u8 ? Uint8Array.from(v.u8) : v));
  g.id = 'landmarks_' + Date.now();
  app.openEditor(g);
});
await wait(1200);
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.setTab('map');
  await new Promise((res) => setTimeout(res, 300));
  const world = ed.game.maps.find((m) => m.type === 'world');
  if (ed.map !== world) ed.loadMap(world);
  ed.eventTemplate = 'windmill';
  ed.setTool('event');
  await new Promise((res) => setTimeout(res, 200));
  const groups = [...document.querySelectorAll('select optgroup')].map((g) => g.label);
  // an open square near Brookend
  let spot = null;
  for (let r = 3; r < 9 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const x = 60 + dx, y = 56 + dy, t = world.tiles[y * world.w + x];
    if ((t === 2 || t === 3) && !world.entities.some((e) => e.x === x && e.y === y)) spot = { x, y };
  }
  ed.tools.event.down(ed, spot);
  const e = world.entities.find((x) => x.x === spot.x && x.y === spot.y && x.type === 'event');
  const vis = ed.view.entities.get(e?.id);
  const kinds = [...document.querySelectorAll('.inspector select, .ed-right select, select')].flatMap((s) => [...s.options].map((o) => o.textContent)).filter((t) => /Ruined windmill/.test(t));
  return { groups, kind: e?.kind, name: e?.name, choices: e?.choices?.length, spin: !!vis?.spin, kinds: kinds.length };
});
check('the Event tool files its list by kind of place (farm and mill, old places, ruins...)', ['Farm and mill', 'Old places', 'Out in the wilds', 'Ruins'].every((g) => r.groups.includes(g)), r.groups);
check('the Event tool places a ready-made windmill, sails turning', r.kind === 'windmill' && r.name === 'The Windmill' && r.choices >= 4 && r.spin, r);
check('the inspector offers "Ruined windmill" among the looks', r.kinds >= 1, r);
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.setTab('land');
  await new Promise((res) => setTimeout(res, 300));
  const count = (k) => Array.from(ed.map.tiles).filter((t) => t === k).length;
  const before = { fields: count(26), roads: count(13), brush: !!ed.tools.land_fields, btn: !!document.querySelector('.land-fields') };
  document.querySelector('.land-fields')?.click();
  await new Promise((res) => setTimeout(res, 400));
  const sown = { fields: count(26), roads: count(13) };
  ed.undo();
  const undone = count(26);
  ed.redo();
  return { before, sown, undone, redone: count(26) };
});
check('the Land step sows fields round every town at a click, leaving the roads be', r.before.btn && r.before.brush && r.sown.fields > r.before.fields + 30 && r.sown.roads === r.before.roads, r);
check('...and Undo takes the fields back', r.undone === r.before.fields && r.redone === r.sown.fields, r);

// ---- a town with fields about it, in play
await play('editor');
await ev(async () => {
  const s = window.__app.session, w = s.game.maps.find((m) => m.type === 'world');
  await s.enterMap(w.id, 60, 59, { instant: true });
  s.game.settings.lineOfSight = false; s.updateVisibility(true);
  s.state.turn = 20; s.applyDaylight?.();
  const v = s.view;
  v.setPitch(52); v.rig.minDist = 1; v.setZoom(13, true); v.focus(60, 56.5, true);
});
await wait(1800);
await shot('village-fields');
await ev(() => { const v = window.__app.session.view; v.reach = 0; v.setZoom(26, true); v.focus(55, 52, true); });
await wait(1800);
await shot('village-fields-far');
// the big map's key names the new groups
r = await ev(async () => {
  const s = window.__app.session, w = s.map;
  w.explored?.fill?.(1);
  s.ui.openMap?.();
  await new Promise((res) => setTimeout(res, 400));
  const rows = [...document.querySelectorAll('.map-legend .ml-row')].map((x) => x.textContent);
  return rows;
});
await shot('map-key');
await closeModals();
check('the big map\'s key groups the places: farms and mills among them', r.some((t) => /Farm or mill/.test(t)) && new Set(r).size === r.length, r);

// ---- landmarks standing in a town
await ev(async ([tpls]) => {
  const s = window.__app.session, m = s.game.maps.find((x) => x.name === 'Brookend');
  // open green squares inside the palisade, clear of everyone, nearest the middle first
  const green = (x, y) => [2, 3, 55].includes(m.tiles[y * m.w + x]);
  const open = (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => green(x + dx, y + dy)) && !m.entities.some((e) => Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1);
  const cx = Math.floor(m.w / 2), cy = Math.floor(m.h / 2), spots = [];
  const order = [];
  for (let y = 2; y < m.h - 2; y++) for (let x = 2; x < m.w - 2; x++) order.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  order.sort((a, b) => a.d - b.d);
  // (close together, so one view shows them all)
  for (const p of order) if (spots.length < 3 && open(p.x, p.y) && spots.every((q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > 3) && (!spots.length || Math.abs(spots[0].x - p.x) + Math.abs(spots[0].y - p.y) <= 10)) spots.push(p);
  tpls.forEach((t, i) => { if (spots[i]) m.entities.push({ ...t, type: 'event', id: 'lm_town_' + i, x: spots[i].x, y: spots[i].y }); });
  window.__lm.town = spots;
  const mx = Math.round(spots.reduce((t, p) => t + p.x, 0) / spots.length), my = Math.round(spots.reduce((t, p) => t + p.y, 0) / spots.length);
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  s.game.settings.lineOfSight = false; s.updateVisibility(true);
  const v = s.view;
  v.setPitch(52); v.rig.minDist = 1; v.setZoom(11, true); v.focus(mx, my, true);
}, [[TPL.windmill, TPL.chapel, TPL.apiary]]);
await wait(1800);
await shot('in-town');
r = await ev(() => { const s = window.__app.session; return [...s.view.entities.values()].filter((e) => /^lm_town_/.test(e.id)).map((e) => ({ kind: e.info && e.model.userData.info && e.id, h: +(e.info.height * e.scale).toFixed(2) })); });
check('in a town the landmarks stand among the houses: the windmill and chapel as tall as a house', r.length === 3 && r[0].h > 2 && r[1].h > 1.8, r);

check('no errors in the page', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
