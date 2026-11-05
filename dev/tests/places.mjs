// Places to visit: Hob's farmstead, the shipyard at Gullhaven, the Red Pit's
// ladder of bouts, the fortune-teller, the fairy ring, the lighthouse, the
// smugglers' cove and its hoard, and the same places in generated worlds and
// in the editor's site tools (each check prints PASS/FAIL).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

// ---- without a browser: generated worlds and the site generators
{
  const { generateWorld, generateSettlement, placeFeature } = await import('../src/world/generate.js');
  const { newGame } = await import('../src/data/schema.js');
  const { T } = await import('../src/data/terrain.js');
  const kinds = new Set();
  for (const seed of [11, 222, 3333]) for (const e of generateWorld(80, 80, seed).entities) if (e.type === 'event') kinds.add(e.kind);
  check('generated worlds get farms, fortune-tellers, fairy rings, fighting pits and lighthouses', ['farm', 'fortune', 'fairy', 'arena', 'lighthouse'].every((k) => kinds.has(k)), [...kinds]);
  const h = generateSettlement('harbour', { seed: 9 }).map;
  const has = (k) => h.tiles.some((t) => t === T[k]);
  check('a generated harbour has piers, a slipway, a crane and a shipwright', ['pier', 'slipway', 'crane', 'cargo'].every(has) && h.entities.some((e) => e.role === 'shipwright' && e.ship?.price > 0), { tiles: ['pier', 'slipway', 'crane', 'cargo'].map((k) => [k, has(k)]) });
  const game = newGame({ blank: true, w: 40, h: 40 });
  const w = game.maps[0];
  const harbour = placeFeature(game, w, 17, 20, 'harbour', 'Testhaven', 5);
  const cave = placeFeature(game, w, 22, 20, 'seacave', 'Test Grotto', 6);
  check('the editor can found a harbour and a sea cave, each with its own map', harbour?.type === 'town' && cave?.type === 'dungeon' && w.tiles[20 * w.w + 17] === T.harbour && w.tiles[20 * w.w + 22] === T.seacave
    && cave.entities.some((e) => e.type === 'chest') && cave.entities.some((e) => e.type === 'monster'), { h: harbour?.type, c: cave?.type });
}

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1000);
const ev = (fn, a) => page.evaluate(fn, a);
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
await ev(async () => {
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, 300));
});
await closeModals();

// ---- Hob's farmstead stands on farmland, not sand
let r = await ev(() => {
  const s = window.__app.session, w = s.game.maps[0];
  const e = w.entities.find((x) => x.id === 'ev_farm');
  const at = (x, y) => w.tiles[y * w.w + x];
  const names = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) names.push(at(e.x + dx, e.y + dy));
  return { kind: e.kind, look: e.look?.kind, here: at(e.x, e.y), around: names, choices: e.choices.map((c) => c.label) };
});
check('Hob\'s farmstead is a homestead (farm kind, cottage-and-yard look)', r.kind === 'farm' && r.look === 'farmstead', r);
// (terrain ids: meadow 3, sand 10, fields 26)
check('the farmstead stands on meadow among fields, with no sand round it', r.here === 3 && r.around.filter((t) => t === 26).length >= 5 && !r.around.includes(10), r);

// ---- the shipyard at Gullhaven: a simple place on the map; too poor, then a
// ship built and moored at the quay
const yardChoice = () => ev(() => {
  const btn = [...document.querySelectorAll('.event-modal .choose-item')].find((b) => /Gull/.test(b.textContent));
  return btn && { text: btn.textContent, off: btn.classList.contains('disabled') };
});
r = await ev(async () => {
  const s = window.__app.session, g = s.game, w = g.maps[0];
  const yard = w.entities.find((e) => e.id === 'ev_gullhaven');
  const town = g.maps.some((m) => m.name === 'Gullhaven');
  const portal = w.entities.some((e) => e.type === 'portal' && e.label === 'Gullhaven');
  if (s.map.id !== w.id) await s.enterMap(w.id, yard.x + 1, yard.y + 1, { instant: true });
  s.party.gold = 200;
  s.ui.openEvent(s.map.entities.find((e) => e.id === yard.id));
  await new Promise((res) => setTimeout(res, 200));
  return { yard: yard && { kind: yard.kind, x: yard.x, y: yard.y, tile: w.tiles[yard.y * w.w + yard.x], mooring: [yard.ship?.x, yard.ship?.y] }, town, portal, text: document.querySelector('.event-modal .ev-text')?.textContent };
});
const poor = await yardChoice();
check('Gullhaven is a simple place on the map: a shipyard on the harbour square, no town to enter', r.yard?.kind === 'shipyard' && r.yard.tile === 27 && !r.town && !r.portal, r);
check('the shipyard offers to build the Gull for 450 gold', /Four hundred and fifty gold/.test(r.text) && /450/.test(poor?.text || ''), { text: r.text, poor });
check('a company too poor cannot have her built', poor?.off && /Costs 450 gold/.test(poor.text), poor);
await closeModals();
r = await ev(async () => {
  const s = window.__app.session, w = s.game.maps[0];
  s.party.gold = 600;
  s.ui.openEvent(s.map.entities.find((e) => e.id === 'ev_gullhaven'));
  await new Promise((res) => setTimeout(res, 200));
  [...document.querySelectorAll('.event-modal .choose-item')].find((b) => /Gull/.test(b.textContent))?.click();
  await new Promise((res) => setTimeout(res, 200));
  const said = document.querySelector('.event-modal .ev-text')?.textContent;
  const added = (s.state.maps[w.id]?.added || []).filter((e) => e.type === 'ship');
  const live = s.map.entities.filter((e) => e.type === 'ship');
  return { said, gold: s.party.gold, added, live: live.map((e) => e.id) };
});
check('having her built takes 450 gold', r.gold === 150, r);
check('the new ship is moored at the quay on the world map', r.added.length === 1 && r.added[0].x === 19 && r.added[0].y === 45 && r.live.includes('ship_npc_halloran') && /Gull is thine/.test(r.said), r);
await closeModals();
r = await ev(async () => {
  const s = window.__app.session;
  s.ui.openEvent(s.map.entities.find((e) => e.id === 'ev_gullhaven'));
  await new Promise((res) => setTimeout(res, 200));
  return { gold: s.party.gold };
});
const again = await yardChoice();
check('a ship is built only once', r.gold === 150 && again?.off && /yours already/.test(again.text), { r, again });
await closeModals();

r = await ev(async () => {
  const s = window.__app.session, g = s.game, w = g.maps[0];
  const ship = s.map.entities.find((e) => e.type === 'ship');
  if (!ship) return { onWorld: s.map.id === w.id, ship: null };
  // step aboard from the quay beside her
  let boarded = false;
  for (const [dx, dy] of [[1, 0], [0, -1], [-1, 0], [0, 1]]) {
    const t = s.map.tiles[(ship.y + dy) * w.w + ship.x + dx];
    if (!s.followerGround(ship.x + dx, ship.y + dy) && t !== 27) continue;
    s.state.pos = { map: w.id, x: ship.x + dx, y: ship.y + dy };
    s.view.placeEntity('party', ship.x + dx, ship.y + dy);
    await s.move(-dx, -dy);
    if (s.state.vehicle) { boarded = true; break; }
  }
  const at = { ...s.state.pos };
  await s.move(-1, 0);
  const sailed = { ...s.state.pos };
  return { onWorld: s.map.id === w.id, ship: { x: ship.x, y: ship.y, name: ship.name }, boarded, at, sailed, vehicle: s.state.vehicle };
});
check('the company can board its new ship', r.onWorld && r.boarded && r.vehicle?.id === 'ship_npc_halloran', r);
check('the bought ship sails', r.sailed.x === r.at.x - 1, r);

// the ship stays where she was left, after the map is built afresh (a reload)
r = await ev(async () => {
  const s = window.__app.session, w = s.game.maps[0];
  await s.move(-1, 0);
  const pos = { ...s.state.pos };
  s.state.vehicle = null;
  s.refreshPartyVisual();
  const live = s.buildLiveMap(w.id);
  const ship = live.entities.find((e) => e.id === 'ship_npc_halloran');
  // an old save that had sailed Westhold's free ship keeps her
  s.state.maps[w.id].moved.ship_westhold = [12, 50];
  const old = s.buildLiveMap(w.id).entities.find((e) => e.id === 'ship_westhold');
  delete s.state.maps[w.id].moved.ship_westhold;
  return { pos, ship: ship && { x: ship.x, y: ship.y }, old: old && { x: old.x, y: old.y, type: old.type } };
});
check('a bought ship stays where she was sailed to', r.ship && r.ship.x === r.pos.x && r.ship.y === r.pos.y, r);
check('an old save keeps the ship it had sailed', r.old && r.old.type === 'ship' && r.old.x === 12, r);

// ---- the smugglers' skerry: only by sea; the cove has its captain and the chart
r = await ev(() => {
  const s = window.__app.session, g = s.game, w = g.maps[0];
  const portal = w.entities.find((e) => e.type === 'portal' && g.maps.find((m) => m.id === e.target?.map)?.name === 'Smugglers\' Cove');
  const tr = w.entities.find((e) => e.id === 'tr_maddoc');
  // (walking the land from Westhold's gate reaches neither the cove nor the hoard)
  const start = w.entities.find((e) => e.type === 'portal' && g.maps.find((m) => m.id === e.target?.map)?.name === 'Westhold');
  return { portal: portal && { x: portal.x, y: portal.y }, tr: tr && { x: tr.x, y: tr.y }, start: { x: start.x, y: start.y } };
});
const reach = await ev(({ from }) => {
  // flood-fill walkable ground from Westhold: dry land only (sites count as land)
  const s = window.__app.session, w = s.game.maps[0];
  const walkable = (x, y) => {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) return false;
    const d = s.view.terrain?.tileAt ? s.view.terrain.tileAt(x, y) : null;
    return d ? d.walk && (!d.water || d.deck) : false;
  };
  const seen = new Set([from.x + ',' + from.y]);
  const q = [from];
  while (q.length) {
    const p = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = x + ',' + y;
      if (seen.has(k) || !walkable(x, y)) continue;
      seen.add(k); q.push({ x, y });
    }
  }
  return { size: seen.size, list: [...seen] };
}, { from: r.start });
const land = new Set(reach.list);
check('the smugglers\' cove can only be reached by ship', r.portal && reach.size > 500 && !land.has(`${r.portal.x},${r.portal.y}`), { portal: r.portal, size: reach.size });
check('Maddoc\'s hoard lies on an isle reached only by ship', r.tr && !land.has(`${r.tr.x},${r.tr.y}`), r.tr);

r = await ev(async () => {
  const s = window.__app.session, g = s.game;
  const cove = g.maps.find((m) => m.name === 'Smugglers\' Cove');
  await s.enterMap(cove.id, cove.entry.x, cove.entry.y, { instant: true });
  const boss = s.map.entities.find((e) => e.type === 'monster' && e.monster === 'black_maddoc');
  const chests = s.map.entities.filter((e) => e.type === 'chest');
  const hoard = chests.find((c) => (c.items || []).some((i) => i.id === 'tmap_maddoc'));
  const item = g.items.find((i) => i.id === 'tmap_maddoc');
  return { entered: s.map.id === cove.id, boss: !!boss, hoard: hoard && hoard.items.map((i) => i.id), gold: hoard?.gold, leads: item?.treasure };
});
check('the cove can be entered; Black Maddoc guards it', r.entered && r.boss, r);
check('the smugglers\' chest holds gold, a rapier and Maddoc\'s chart to his hoard', r.hoard && r.hoard.includes('duellists_rapier') && +r.gold >= 200 && r.leads === 'tr_maddoc', r);

// back to the world for the curiosities
await ev(async () => {
  const s = window.__app.session, w = s.game.maps[0];
  await s.enterMap(w.id, 56, 47, { instant: true, quiet: true });
});

// ---- the Red Pit: each bout fought once, paid on a win, the champion last
const pit = async (pick) => ev(async ({ pick }) => {
  const s = window.__app.session;
  const e = s.map.entities.find((x) => x.id === 'ev_red_pit');
  s.state.pos = { map: s.map.id, x: e.x, y: e.y + 1 };
  // the fight itself is tested elsewhere: here it is won at once
  const real = s.engage;
  let fought = null;
  s.engage = async (f) => { fought = f; return { outcome: 'victory' }; };
  const gold0 = s.party.gold;
  s.ui.openEvent(e);
  await new Promise((res) => setTimeout(res, 100));
  const items = [...document.querySelectorAll('.event-modal .choose-item')].map((b) => ({ label: b.querySelector('.ci-label')?.textContent || '', dis: b.classList.contains('disabled') }));
  if (pick != null) {
    [...document.querySelectorAll('.event-modal .choose-item')][pick].click();
    await new Promise((res) => setTimeout(res, 100));
    document.querySelector('.event-modal .modal-buttons button')?.click();
    await new Promise((res) => setTimeout(res, 300));
  }
  for (let i = 0; i < 6 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 100)); }
  s.engage = real;
  return { items, fought: fought && { monster: fought.monster, count: fought.count }, gold: s.party.gold - gold0, flags: Object.keys(s.party.flags).filter((f) => /bout/.test(f)) };
}, { pick });
r = await pit(0);
check('the Red Pit opens with the rat-pit; later bouts wait their turn', /rat-pit/.test(r.items[0].label) && !r.items[0].dis && r.items[1].dis && r.items[4].dis, r.items);
check('winning a bout pays its purse once the fight is won', r.fought?.monster === 'giant_rat' && r.gold === 25 && r.flags.includes('ev_red_pit_bout1'), r);
r = await pit(null);
check('a bout won is not offered again; the next one opens', !/rat-pit/.test(r.items[0].label) && /goblin/.test(r.items[0].label) && !r.items[0].dis, r.items);
for (let k = 0; k < 3; k++) r = await pit(0);
const champ = await pit(0);
const inv = await ev(() => window.__app.session.party.inventory.brakkas_cleaver || 0);
check('the champion\'s bout is against Brakka, and pays his cleaver', champ.fought?.monster === 'brakka' && champ.gold === 150 && inv === 1, { champ, inv });
r = await pit(null);
check('champions may fight exhibition bouts', r.items.some((i) => /exhibition/i.test(i.label) && !i.dis) && !r.items.some((i) => /champion's bout/i.test(i.label)), r.items);

// ---- the fortune-teller, the fairy ring and the lighthouse
r = await ev(async () => {
  const s = window.__app.session, w = s.map;
  const e = w.entities.find((x) => x.id === 'ev_caravan');
  s.state.pos = { map: w.id, x: e.x, y: e.y + 1 };
  const gold0 = s.party.gold;
  const explored0 = w.explored.reduce((n, v) => n + v, 0);
  s.ui.openEvent(e);
  await new Promise((res) => setTimeout(res, 100));
  [...document.querySelectorAll('.event-modal .choose-item')][0].click();
  await new Promise((res) => setTimeout(res, 150));
  const text = document.querySelector('.event-modal .ev-text')?.textContent || '';
  document.querySelector('.event-modal .modal-buttons button')?.click();
  await new Promise((res) => setTimeout(res, 200));
  for (let i = 0; i < 6 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 120)); }
  // a second visit the same day finds her asleep
  s.ui.openEvent(e);
  await new Promise((res) => setTimeout(res, 100));
  const again = !!document.querySelector('.event-modal');
  for (let i = 0; i < 6 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 120)); }
  return { paid: gold0 - s.party.gold, text, explored: w.explored.reduce((n, v) => n + v, 0) - explored0, again };
});
check('the fortune-teller takes her silver and shows what the road hides', r.paid === 10 && /leagues to the|map in your pack/.test(r.text), r);
check('her vision lifts the fog over the place she sees', r.explored > 0, r.explored);
check('the fortune-teller is seen once a day', !r.again, r);

r = await ev(async () => {
  const s = window.__app.session, w = s.map;
  const e = w.entities.find((x) => x.id === 'ev_fairy_ring');
  const outcomes = new Set();
  let badKind = 0, food0, gold0;
  for (let k = 0; k < 40; k++) {
    s.state.poi = {};
    s.state.pos = { map: w.id, x: e.x, y: e.y + 1 };
    s.party.food = 200; s.party.gold = 500;
    food0 = s.party.food; gold0 = s.party.gold;
    const kind = k % 2 === 1;
    s.ui.openEvent(e);
    await new Promise((res) => setTimeout(res, 30));
    [...document.querySelectorAll('.event-modal .choose-item')][kind ? 1 : 0].click();
    await new Promise((res) => setTimeout(res, 30));
    const txt = document.querySelector('.event-modal .ev-text')?.textContent || '';
    const got = document.querySelector('.event-modal .ev-got')?.textContent || '';
    outcomes.add(txt.slice(0, 60));
    if (kind && (s.party.gold < gold0 || s.party.food < food0 - 6 || /leaves|stolen/.test(got))) badKind++;
    const btn = document.querySelector('.event-modal .modal-buttons button');
    btn?.click();
    await new Promise((res) => setTimeout(res, 60));
    for (let i = 0; i < 4 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 40)); }
    // a whisk carries the company off: come back for the next try
    for (let i = 0; i < 30 && s.transitioning; i++) await new Promise((res) => setTimeout(res, 50));
  }
  return { n: outcomes.size, badKind };
});
check('the fairy ring does many different things', r.n >= 4, r);
check('an offering keeps the Fair Folk\'s mischief away', r.badKind === 0, r);

r = await ev(async () => {
  const s = window.__app.session, w = s.game.maps[0];
  for (let i = 0; i < 30 && s.transitioning; i++) await new Promise((res) => setTimeout(res, 50));
  const e = w.entities.find((x) => x.id === 'ev_lighthouse');
  await s.enterMap(w.id, e.x + 1, e.y + 1, { instant: true, quiet: true });
  const coast = s.map.tiles[e.y * w.w + e.x];
  const water = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => [0, 1].includes(s.map.tiles[(e.y + dy) * w.w + e.x + dx]));
  const xp = () => s.party.members.reduce((n, m) => n + (m.xp || 0), 0);
  const climb = async () => {
    s.state.poi = {};
    s.ui.openEvent(e);
    await new Promise((res) => setTimeout(res, 60));
    const x0 = xp();
    [...document.querySelectorAll('.event-modal .choose-item')][0].click();
    await new Promise((res) => setTimeout(res, 60));
    for (let i = 0; i < 6 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 60)); }
    return xp() - x0;
  };
  const first = await climb();
  const second = await climb();
  const cove = w.entities.find((x) => x.type === 'portal' && s.game.maps.find((m) => m.id === x.target?.map)?.name === 'Smugglers\' Cove');
  return { coast, water, first, second, lore: s.state.lore.some((l) => l.id === 'ev_lighthouse'), seesCove: !!s.map.explored[cove.y * w.w + cove.x] };
});
check('the lighthouse stands on the shore', r.water, r);
check('climbing the lighthouse pays experience once and notes it in the journal', r.first > 0 && r.second === 0 && r.lore, r);
check('from the lamp-room the smugglers\' skerry can be seen', r.seesCove, r);

await page.waitForTimeout(300);
// ---- Eldmark's countryside: fields, mills and ruins, treasure that looks like
// itself, and three small side quests built only from events and flags
await closeModals();
r = await ev(async () => {
  const s = window.__app.session, g = s.game, w = g.maps[0], sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const all = g.maps.flatMap((m) => m.entities);
  const fields = [...w.tiles].filter((t) => t === 26).length;
  const kinds = new Set(w.entities.filter((e) => e.type === 'event').map((e) => e.kind));
  const looks = Object.fromEntries(['chest_wolfwood', 'chest_heron', 'chest_vault', 'chest_neds_box'].map((id) => [id, all.find((e) => e.id === id)?.look?.kind]));
  if (s.map.id !== w.id || s.state.vehicle) { s.state.vehicle = null; await s.enterMap(w.id, 60, 51, { instant: true }); }
  const ev = (id) => s.map.entities.find((e) => e.id === id);
  const close = async () => { for (let i = 0; i < 5 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-buttons button, .modal-back .modal-x')?.click(); await sleep(120); } };
  const choose = async (id, label) => {
    s.ui.openEvent(ev(id)); await sleep(150);
    const btn = [...document.querySelectorAll('.event-modal .choose-item')].find((x) => x.textContent.includes(label));
    const off = !btn || btn.classList.contains('disabled');
    if (!off) { btn.click(); await sleep(150); }
    await close();
    return !off;
  };
  const q = (id) => s.state.quests[id]?.status;
  s.party.food = 50; s.party.gold = 200; s.party.members[0].str = 15;
  const asked = await choose('ev_brookend_mill', 'Ask Ned');
  const early = await choose('ev_brookend_mill', 'Give Ned');
  await choose('ev_burnt_mill', 'Coax Tansy');
  const box = ev('chest_neds_box');
  s.state.pos = { map: w.id, x: box.x - 1, y: box.y };
  await s.openChest(box); await sleep(100); await close();
  const gave = await choose('ev_brookend_mill', 'Give Ned');
  await choose('ev_aldred', 'Scrape');
  await choose('ev_edric', 'Heave');
  const edric = s.party.inventory.oath_ring_edric;
  await choose('ev_kings_chapel', 'old chapel');
  s.party.flags.ev_fallen_chapel_ghost = true;
  await choose('ev_kings_chapel', 'Tell Brother');
  return { fields, kinds: ['windmill', 'ruined_mill', 'statue', 'toppled_statue', 'graveyard', 'chapel', 'ruined_chapel', 'circle', 'wreck', 'watermill', 'apiary'].filter((k) => !kinds.has(k)), looks,
    asked, early, gave, mill: q('q_mill'), tin: s.party.inventory.honeycake_tin, brothers: q('q_brothers'), edric, ghost: q('q_ghost'), bell: s.party.inventory.barrow_bell };
});
check('Eldmark has fields round its towns and new landmarks and ruins', r.fields >= 40 && !r.kinds.length, r);
check('Eldmark\'s treasure looks like itself: bones, a heron\'s nest, a rune-chest, a strongbox', r.looks.chest_wolfwood === 'remains' && r.looks.chest_heron === 'nest' && r.looks.chest_vault === 'runechest' && r.looks.chest_neds_box === 'strongbox', r.looks);
check('the Burnt Mill: Ned asks, wants his box and his cat first, and pays when both come home', r.asked && !r.early && r.gave && r.mill === 'done' && r.tin >= 1, r);
check('the Brothers of the Ford starts at Aldred\'s statue; Edric\'s ring lies under his', r.brothers === 'active' && r.edric === 1, r);
check('the Chapel of the Fallen Host is told back at the Kingsroad Chapel', r.ghost === 'done' && r.bell >= 1, r);

check('no page errors', !errors.length, errors);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
