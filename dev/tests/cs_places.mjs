// The Places and Land steps of the Construction Set: plans inferred for the
// sample's places, rebuilding a town and a dungeon from a plan while keeping
// the people and things written into them, finding spots for places on a new
// land and joining them with roads, the generators unchanged without a plan,
// and the Places designer and Land panel working in the editor.
// Prints `ok` / `FAIL` lines; exits 1 on any failure.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

const G = await import('../src/world/generate.js');
const P = await import('../src/world/places.js');
const { findBuildings } = await import('../src/world/buildings.js');
const { buildSampleGame } = await import('../src/data/sample.js');
const { newGame } = await import('../src/data/schema.js');
const { deterministicIds } = await import('../src/core/util.js');
const { terrain, T } = await import('../src/data/terrain.js');

// ---- the generators, without a plan, make what they always made
{
  const hash = (o) => crypto.createHash('sha1').update(JSON.stringify(o, (k, v) => (v instanceof Uint8Array ? Array.from(v).join(',') : v))).digest('hex');
  const calls = {
    town101: ['f527c69ccdb55915e5c23f0131185e15649562f9', () => G.generateSettlement('town', { seed: 101, name: 'Westhold' })],
    castle102: ['5a532e4e46051469131cbea0639a44b97cf47faa', () => G.generateSettlement('castle', { seed: 102 })],
    village105: ['57302d1ecff423422372ffc8b7520bfb14b452bb', () => G.generateSettlement('village', { seed: 105 })],
    elfhall103: ['20170d99cc937da25d55ba7d1893f8220b899925', () => G.generateSettlement('elfhall', { seed: 103 })],
    dwarfgate104: ['b39af86aa1f8d3bf90230a2af23927c45598e305', () => G.generateSettlement('dwarfgate', { seed: 104 })],
    harbour106: ['0adeb1f4657ce35fd3c366a83070ac1f6737f0f7', () => G.generateSettlement('harbour', { seed: 106 })],
    townWide: ['e1c876042732f3ea30c49630cd8cf3748dec8268', () => G.generateSettlement('town', { seed: 7, w: 44, h: 40 })],
    barrow201: ['0d6f8fe6ccd0eeb5e077f456c4a9b8f1334eaa11', () => G.generateDungeon({ seed: 201, style: 'cave', monsters: ['goblin', 'giant_rat', 'giant_spider', 'skeleton', 'bat_swarm'], boss: 'hollow_king', rooms: 9 })],
    fortress202: ['97454b885977adf9810f3b79e868e30057a349a5', () => G.generateDungeon({ seed: 202, style: 'fortress', monsters: ['orc_captain', 'troll'], boss: 'shadow_lord', rooms: 11, w: 40, h: 40 })],
    crypt203: ['e54b4932d63037be6ac4b718b80e5705497b1e2c', () => G.generateDungeon({ seed: 203, style: 'crypt', rooms: 5, w: 26, h: 26, wonders: false })],
    cove207: ['d56c683e5c12dd3e50a9d0d74da367c7b4727b5e', () => G.smugglersCave(null, 'Cove', 207, {})],
  };
  const differ = Object.entries(calls).filter(([, [want, f]]) => deterministicIds(() => hash(f())) !== want).map(([k]) => k);
  check('settlements, dungeons and sea caves come out byte for byte as before when no plan is given', !differ.length, differ);
}

// ---- plans inferred for the sample's places
const game = buildSampleGame();
const byName = (n) => game.maps.find((m) => m.name === n);
const kindOf = (m) => P.placesOf(game).find((p) => p.map === m)?.kind;
{
  const plans = Object.fromEntries(['Westhold', 'Caer Aldon', 'Lindaleth', 'Hammerdeep', 'Brookend', 'Gullhaven', 'Grimholt Barrow', 'Dol Garoth', 'Tower of the Hermit', 'Smugglers\' Cove'].map((n) => [n, P.planOf(byName(n), kindOf(byName(n)))]));
  const w = plans.Westhold;
  check('Westhold is seen as a walled town with an inn, tavern, temple and four shops', w.style === 'town' && w.walls === 'stone' && w.gates.length === 4
    && ['inn', 'tavern', 'healer', 'weapons', 'armor', 'provisions', 'reagents'].every((k) => w.buildings[k] === 1) && w.homes >= 3 && w.guards === 2 && w.folk >= 3, w);
  const c = plans['Caer Aldon'];
  check('Caer Aldon is seen as a castle with its keep, a sage, a south gate and four guards', c.style === 'castle' && c.buildings.lord === 1 && c.buildings.sage === 1 && c.guards === 4 && c.gates.join() === 's', c);
  check('Lindaleth is an elven hall in a ring of trees, Hammerdeep a dwarf hold with its king', plans.Lindaleth.style === 'elfhall' && plans.Lindaleth.walls === 'trees' && plans.Hammerdeep.style === 'dwarfgate' && plans.Hammerdeep.buildings.lord === 1, [plans.Lindaleth.walls, plans.Hammerdeep.buildings]);
  check('Brookend is a village behind a palisade; Gullhaven a harbour with its shipyard', plans.Brookend.style === 'village' && plans.Brookend.walls === 'palisade' && plans.Gullhaven.style === 'harbour' && plans.Gullhaven.buildings.shipwright === 1, [plans.Brookend.walls, plans.Gullhaven.style]);
  const b = plans['Grimholt Barrow'];
  check('Grimholt is a cave with the Hollow King and the Rune-Key in its hoard', b.style === 'cave' && b.boss === 'hollow_king' && b.treasure.items.some((i) => i.id === 'rune_key') && b.rooms >= 6 && b.monsters.length >= 2 && b.counts.giant_rat === '4-6', b);
  check('Dol Garoth is a fortress with the Shadow Lord; the cove has Black Maddoc', plans['Dol Garoth'].style === 'fortress' && plans['Dol Garoth'].boss === 'shadow_lord' && plans['Smugglers\' Cove'].style === 'seacave' && plans['Smugglers\' Cove'].boss === 'black_maddoc', [plans['Dol Garoth'].boss, plans['Smugglers\' Cove'].boss]);
  check('every place gets a one-line summary', P.placesOf(game).every((p) => P.placeSummary(game, p.map, p.kind).length > 5));
}

// ---- rebuild Westhold with another armourer and two more homes
{
  const west = byName('Westhold');
  const npcIds = west.entities.filter((e) => e.type === 'npc').map((e) => e.id);
  const named = west.entities.filter((e) => e.type === 'npc' && P.authoredReasons(game, e).length).map((e) => e.id);
  const givers = game.quests.filter((q) => q.giver && npcIds.includes(q.giver)).map((q) => q.giver);
  // some authored things: a sign in the street, a chest in the armoury, an event
  const armoury = findBuildings(west).find((b) => b.keeper?.role === 'armor');
  const inside = armoury.tiles.find(([x, y]) => terrain(west.tiles[y * west.w + x]).walk && !west.entities.some((e) => e.x === x && e.y === y));
  west.entities.push({ id: 'sign_test', type: 'sign', x: west.entry.x, y: west.entry.y - 2, text: 'Welcome to Westhold' });
  west.entities.push({ id: 'chest_test', type: 'chest', x: inside[0], y: inside[1], gold: '30', items: [{ id: 'healing_draught', n: 3 }] });
  west.entities.push({ id: 'ev_test', type: 'event', kind: 'lore', name: 'Old Stone', text: 'hi', x: 3, y: 3, choices: [] });
  const plan = P.planOf(west, 'town');
  const homes0 = plan.homes;
  plan.buildings.armor += 1;
  plan.homes += 2;
  const t0 = performance.now();
  const res = P.rebuildPlace(game, west, plan);
  const ms = performance.now() - t0;
  const bs = findBuildings(west);
  const count = (k) => bs.filter((b) => b.kind === k).length;
  check(`the rebuild is quick (${ms.toFixed(0)} ms) and says what it did`, ms < 1500 && /rebuilt/.test(res.summary) && Array.isArray(res.notes), res);
  check('Westhold now has two armourers and two more homes', count('Armourer') === 2 && count('House') === homes0 + 2, { armour: count('Armourer'), homes: count('House'), want: homes0 + 2 });
  check('the plan is kept on the map', west.plan?.buildings?.armor === 2 && west.plan.homes === homes0 + 2);
  const ids = new Set(west.entities.map((e) => e.id));
  check('everyone the designer wrote is still there, ids and all', named.every((id) => ids.has(id)), named.filter((id) => !ids.has(id)));
  const allIds = new Set(game.maps.flatMap((m) => m.entities.filter((e) => e.type === 'npc').map((e) => e.id)));
  check('quests still point at their givers', givers.every((g) => allIds.has(g)) && game.quests.every((q) => !q.giver || allIds.has(q.giver)), givers.filter((g) => !allIds.has(g)));
  const tobin = west.entities.find((e) => e.name === 'Tobin');
  check('Tobin keeps the new inn', bs.some((b) => b.kind === 'Inn' && b.keeper === tobin), tobin && { x: tobin.x, y: tobin.y });
  const borin = west.entities.find((e) => e.id === 'npc_borin');
  check('Borin, who drank in the tavern, drinks in the new one', bs.some((b) => b.kind === 'Tavern' && b.tiles.some(([x, y]) => x === borin.x && y === borin.y)), { x: borin.x, y: borin.y });
  check('the sign, the chest and the event are kept', ['sign_test', 'chest_test', 'ev_test'].every((id) => ids.has(id)));
  const chest = west.entities.find((e) => e.id === 'chest_test');
  check('the chest moved into an armoury', bs.some((b) => b.kind === 'Armourer' && b.tiles.some(([x, y]) => x === chest.x && y === chest.y)), { x: chest.x, y: chest.y });
  const bad = west.entities.filter((e) => { const t = terrain(west.tiles[e.y * west.w + e.x]); return e.x < 0 || e.y < 0 || e.x >= west.w || e.y >= west.h || !t.walk || t.door; });
  check('no one stands in a wall or a doorway', !bad.length, bad.map((e) => [e.name || e.id, e.x, e.y]));
  const spots = new Set(west.entities.map((e) => `${e.x},${e.y}`));
  check('no two of them share a square', spots.size === west.entities.length, west.entities.length - spots.size);
  const portal = game.maps[0].entities.find((e) => e.type === 'portal' && e.target?.map === west.id);
  check('the way in from the world and the way out stay as they were', !!portal && west.exit?.map === game.maps[0].id, west.exit);
  // a rebuild with fewer buildings puts the written innkeeper in the square, and says so
  const plan2 = P.planOf(west, 'town');
  plan2.buildings.inn = 0;
  const res2 = P.rebuildPlace(game, west, plan2);
  check('with no inn, Tobin is kept and the notes say where he went', west.entities.includes(tobin) && res2.notes.some((n) => /Tobin/.test(n) && /square/.test(n)), res2.notes);
}

// ---- a dungeon rebuilt with a new boss, more rooms, and a deeper level kept
{
  const barrow = byName('Grimholt Barrow');
  // a deeper level beneath, reached by stairs
  const deeper = G.generateDungeon({ seed: 9, style: 'cave', name: 'Grimholt (level 2)', level: 2 }).map;
  const stair = barrow.entities.find((e) => e.type === 'chest');
  const sx = stair.x + 1, sy = stair.y;
  barrow.tiles[sy * barrow.w + sx] = T.stairs_down;
  barrow.entities.push({ id: 'portal_down', type: 'portal', x: sx, y: sy, style: 'stairs', label: 'Stairs down', target: { map: deeper.id } });
  deeper.exit = { map: barrow.id, x: sx, y: sy };
  game.maps.push(deeper);
  const exitId = barrow.entities.find((e) => e.type === 'portal' && e.target?.map === 'exit').id;
  const plan = P.planOf(barrow, 'cave');
  plan.boss = 'troll';
  plan.rooms = 11;
  plan.chests = 3;
  const res = P.rebuildPlace(game, barrow, plan);
  const mons = barrow.entities.filter((e) => e.type === 'monster');
  const boss = mons.filter((m) => m.boss);
  const fc = P.finalChest(barrow);
  check('the barrow has its new boss (and only that one)', boss.length === 1 && boss[0].monster === 'troll', boss.map((b) => b.monster));
  check('the boss waits by the hoard, and the hoard still holds the Rune-Key', fc && Math.abs(fc.x - boss[0].x) + Math.abs(fc.y - boss[0].y) <= 2 && fc.items.some((i) => i.id === 'rune_key'), fc);
  check('eleven rooms, and three more chests along the way', P.planOf(barrow, 'cave').rooms >= 9 && barrow.entities.filter((e) => e.type === 'chest').length === 4, { chests: barrow.entities.filter((e) => e.type === 'chest').length, notes: res.notes });
  check('the stairs up keep their id; the events written into it stay', barrow.entities.some((e) => e.id === exitId) && ['ev_barrow_lore', 'ev_mimic'].every((id) => barrow.entities.some((e) => e.id === id)));
  const down = barrow.entities.find((e) => e.id === 'portal_down');
  check('the stairs down are kept, on a stairs square, and the level below leads back to them', down && barrow.tiles[down.y * barrow.w + down.x] === T.stairs_down && deeper.exit.x === down.x && deeper.exit.y === down.y, { down, exit: deeper.exit });
  check('the monsters are the planned kinds, with their band sizes', mons.filter((m) => !m.boss).every((m) => plan.monsters.includes(m.monster)) && mons.some((m) => m.monster === 'giant_rat' && m.count === '4-6'), mons.map((m) => [m.monster, m.count]));
}

// ---- a new land: spots that suit each kind, and roads between them
{
  const g = newGame({ blank: true, w: 40, h: 40 });
  const world = g.maps[0];
  const fresh = G.generateWorld(72, 72, 4242, { shape: 'continent' });
  Object.assign(world, { tiles: fresh.tiles, w: fresh.w, h: fresh.h, entities: fresh.entities });
  const wants = ['town', 'castle', 'village', 'village', 'elfhall', 'dwarfgate', 'harbour', 'fortress', 'cave', 'cave', 'seacave'].map((kind, i) => ({ kind, name: `${kind} ${i}` }));
  const t0 = performance.now();
  const placed = P.autoPlaceSites(g, world, wants, { seed: 4242, start: null });
  const t1 = performance.now();
  check(`all ${wants.length} places found spots (${(t1 - t0).toFixed(0)} ms)`, placed.length === wants.length && t1 - t0 < 3000, placed.length);
  const home = placed[0].portal;
  g.settings.start = P.besideSite(world, home.x, home.y);
  const at = (p) => terrain(world.tiles[p.y * world.w + p.x]);
  const near = (p, keys, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = p.x + dx, y = p.y + dy; if (x >= 0 && y >= 0 && x < world.w && y < world.h && keys.includes(terrain(world.tiles[y * world.w + x]).key)) return true; } return false; };
  const of = (k) => placed.filter((p) => p.map && p.map.plan?.kind === k).map((p) => p.portal);
  check('each site stands on its own tile, with its map built from a plan', placed.every((p) => at(p.portal).feature && p.map?.plan?.kind));
  check('the dwarf hold is against the mountains, the elven hall in the woods', of('dwarfgate').every((p) => near(p, ['mountains', 'peaks'], 1)) && of('elfhall').every((p) => near(p, ['forest', 'pines'], 1)));
  check('the harbour and the sea cave are on the coast', [...of('harbour'), ...of('seacave')].every((p) => near(p, ['ocean', 'shallows'], 1)));
  const dist = (p) => Math.hypot(p.x - home.x, p.y - home.y);
  const others = placed.map((p) => p.portal).filter((p) => p !== home);
  const fort = of('fortress')[0];
  check('the dark fortress is among the farthest places from the start', dist(fort) >= others.map(dist).sort((a, b) => b - a)[Math.min(3, others.length - 1)], { fort: dist(fort), all: others.map(dist).map(Math.round) });
  const gap = Math.min(...placed.flatMap((a, i) => placed.slice(i + 1).map((b) => Math.hypot(a.portal.x - b.portal.x, a.portal.y - b.portal.y))));
  check('the places are spread apart', gap >= 4, gap);
  const t2 = performance.now();
  const b = P.connectPlaces(g, world, { seed: 7 });
  const t3 = performance.now();
  check(`roads are laid (${(t3 - t2).toFixed(0)} ms) and every place is reached`, b && b.x1 >= b.x0 && !b.unreached.length && t3 - t2 < 3000, b);
  // walk the roads (and the places they meet at) from the start
  const W = world.w;
  const roadish = (i) => { const t = terrain(world.tiles[i]); return t.key === 'road' || t.key === 'bridge' || t.feature; };
  const seen = new Uint8Array(W * world.h);
  const s0 = g.settings.start.y * W + g.settings.start.x;
  const q = [s0];
  seen[s0] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= world.h) continue;
      const j = ny * W + nx;
      if (!seen[j] && roadish(j)) { seen[j] = 1; q.push(j); }
    }
  }
  const off = placed.filter((p) => !seen[p.portal.y * W + p.portal.x]).map((p) => p.map.name);
  check('the roads join every place to the start', !off.length, off);
  const roads = Array.from(world.tiles).filter((t) => t === T.road).length;
  const bridges = Array.from(world.tiles).filter((t) => t === T.bridge).length;
  check('the network is made of road (and bridges where it crosses water)', roads > 20, { roads, bridges });
  const again = P.connectPlaces(g, world, { seed: 8 });
  check('joining them again reuses the roads already there', !again || again.x1 < again.x0 || Array.from(world.tiles).filter((t) => t === T.road).length - roads < 15, again);
}

// ---- plans build every kind of place
{
  const g = newGame({ blank: true, w: 40, h: 40 });
  const bad = [];
  for (const kind of ['town', 'castle', 'village', 'elfhall', 'dwarfgate', 'harbour', 'cave', 'tower', 'fortress', 'seacave']) {
    const plan = P.defaultPlan(kind);
    plan.seed = 77;
    if (plan.buildings) { plan.buildings.sage += 1; plan.buildings.merchant += 1; plan.homes += 1; }
    const { map, notes } = P.buildPlace(g, plan, { name: kind });
    const back = P.planOf({ ...map, plan: null, id: map.id }, kind);
    if (notes.length) bad.push([kind, notes]);
    if (plan.buildings) {
      const bs = findBuildings(map);
      const has = (k) => bs.filter((b) => b.keeper?.role === k).length;
      if (has('merchant') !== 1 || back.homes !== plan.homes) bad.push([kind, { merchant: has('merchant'), homes: back.homes, want: plan.homes }]);
    } else if (!map.entities.some((e) => e.type === 'chest') || back.style !== plan.style) bad.push([kind, back.style]);
  }
  check('a plan builds every kind of place, with everything it asks for', !bad.length, bad);
  const big = P.defaultPlan('village');
  big.buildings.inn = 2; big.buildings.weapons = 3; big.buildings.lord = 1; big.homes = 12; big.seed = 5;
  const { map } = P.buildPlace(g, big, { name: 'Bigvillage' });
  const bs = findBuildings(map);
  check('a village asked for much more grows to fit it all', map.w > 30 && bs.filter((b) => b.kind === 'House').length === 12 && bs.filter((b) => b.keeper?.role === 'weapons').length === 3, { w: map.w, houses: bs.filter((b) => b.kind === 'House').length });
}

// ---- in the editor
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
await ev(() => {
  const app = window.__app;
  // a copy of the sample to edit
  const g = JSON.parse(JSON.stringify(app.sample, (k, v) => (v instanceof Uint8Array ? { u8: Array.from(v) } : v)), (k, v) => (v && v.u8 ? Uint8Array.from(v.u8) : v));
  g.id = 'cs_places_' + Date.now();
  app.openEditor(g);
});
await wait(1200);
await page.locator('.ed-step', { hasText: 'Places' }).click();
await wait(700);
let r = await ev(() => ({ entries: document.querySelectorAll('.pl-entry').length, groups: [...document.querySelectorAll('.pl-list .entry-group')].map((e) => e.textContent), places: window.__app.editor.places ? 1 : 0, counters: document.querySelectorAll('.pl-count').length }));
check('the Places step lists the places in groups, with a designer', r.entries >= 10 && r.groups.length >= 3 && r.counters > 10, r);
await page.locator('.pl-entry', { hasText: 'Westhold' }).click();
await wait(900);
r = await ev(() => { const ed = window.__app.editor; return { title: document.querySelector('.pl-name')?.value, view: ed.view.map?.name, previewing: ed.previewing, people: document.querySelectorAll('.pl-person').length }; });
check('choosing Westhold shows its plan, its people and Westhold itself in the view', r.title === 'Westhold' && r.view === 'Westhold' && r.previewing && r.people > 5, r);
const before = await ev(() => { const m = window.__app.editor.game.maps.find((x) => x.name === 'Westhold'); return { w: m.w, n: m.entities.length, ids: m.entities.filter((e) => e.type === 'npc').map((e) => e.id) }; });
await page.locator('.pl-count', { hasText: 'Armourer' }).locator('button[aria-label^="One more"]').click();
await page.locator('.pl-count', { hasText: 'Homes' }).locator('button[aria-label^="One more"]').click();
await page.locator('.pl-count', { hasText: 'Homes' }).locator('button[aria-label^="One more"]').click();
r = await ev(() => ({ dirty: !document.querySelector('.pl-dirty')?.hidden }));
check('changing the plan says it needs a rebuild', r.dirty, r);
await page.locator('.pl-rebuild').click();
await wait(1200);
r = await ev(() => {
  const ed = window.__app.editor;
  const m = ed.game.maps.find((x) => x.name === 'Westhold');
  return { notes: !!document.querySelector('.pl-notes'), plan: m.plan, view: ed.view.map === m, ids: m.entities.filter((e) => e.type === 'npc').map((e) => e.id), w: m.w, undo: ed.undoStack.length, dirty: !document.querySelector('.pl-dirty')?.hidden };
});
check('Rebuild through the designer builds the plan and shows what it did', r.notes && r.plan?.buildings?.armor === 2 && r.view && !r.dirty, { notes: r.notes, armor: r.plan?.buildings?.armor, view: r.view });
check('nobody from Westhold was lost', before.ids.every((id) => r.ids.includes(id)), before.ids.filter((id) => !r.ids.includes(id)));
await ev(() => window.__app.editor.undo());
await wait(500);
r = await ev(() => { const m = window.__app.editor.game.maps.find((x) => x.name === 'Westhold'); return { w: m.w, n: m.entities.length, form: document.querySelector('.pl-name')?.value, plan: m.plan?.buildings?.armor ?? null, shown: [...document.querySelectorAll('.pl-count')].find((c) => /Armourer/.test(c.textContent))?.querySelector('.pl-n')?.textContent }; });
check('Undo puts Westhold back as it was, plan and all', r.w === before.w && r.n === before.n && r.form === 'Westhold' && r.plan !== 2 && r.shown === '1', { r, before });
await ev(() => window.__app.editor.redo());
await wait(400);
r = await ev(() => { const m = window.__app.editor.game.maps.find((x) => x.name === 'Westhold'); return { plan: m.plan?.buildings?.armor, w: m.w }; });
check('Redo brings the rebuild back', r.plan === 2, r);
await ev(() => window.__app.editor.undo());
await wait(300);
// a dungeon's designer
await page.locator('.pl-entry', { hasText: 'Grimholt' }).click();
await wait(800);
r = await ev(() => ({ mons: document.querySelectorAll('.pl-mon').length, boss: [...document.querySelectorAll('select')].find((s) => s.getAttribute('aria-label') === 'The boss')?.value, view: window.__app.editor.view.map?.name }));
check('a dungeon\'s designer shows its monsters, boss and hoard, and the dungeon in view', r.mons >= 2 && r.boss === 'hollow_king' && r.view === 'Grimholt Barrow', r);
await page.locator('select[aria-label="The boss"]').selectOption('troll');
await page.locator('.pl-rebuild').click();
await wait(1000);
r = await ev(() => { const m = window.__app.editor.game.maps.find((x) => x.name === 'Grimholt Barrow'); return m.entities.filter((e) => e.boss).map((e) => e.monster); });
check('a new boss through the designer', r.length === 1 && r[0] === 'troll', r);
// a new place, found by the land
await page.locator('.pl-head button', { hasText: 'New place' }).click();
await wait(300);
await page.locator('.pl-kind', { hasText: 'Dwarf Hold' }).click();
await page.locator('.pl-new input[type=text]').fill('Deepdelve');
await page.locator('.modal-buttons button', { hasText: 'Found it' }).click();
await wait(1200);
r = await ev(() => { const ed = window.__app.editor; const m = ed.game.maps.find((x) => x.name === 'Deepdelve'); const p = ed.game.maps[0].entities.find((e) => e.type === 'portal' && e.target?.map === m?.id); return { made: !!m, plan: m?.plan?.kind, portal: !!p, sel: document.querySelector('.pl-name')?.value }; });
check('+ New place → find a spot founds it on the world map and opens its designer', r.made && r.plan === 'dwarfgate' && r.portal && r.sel === 'Deepdelve', r);
// leaving the step puts the editor's map back
await page.locator('.ed-step', { hasText: 'Details' }).click();
await wait(600);
r = await ev(() => { const ed = window.__app.editor; return { same: ed.view.map === ed.map, previewing: ed.previewing, map: ed.map.name }; });
check('going on to Details shows the editor\'s own map again', r.same && !r.previewing, r);
// the Land step
await page.locator('.ed-step', { hasText: 'Land' }).click();
await wait(800);
r = await ev(() => ({ tools: ['land_raise', 'land_sink', 'land_forest', 'found_town', 'path_road'].every((t) => !!document.querySelector(`.tool[data-tool="${t}"]`)), roads: !!document.querySelector('.land-roads'), list: document.querySelectorAll('.land-place').length, size: document.querySelector('.land-size')?.textContent }));
check('the Land step has its brushes, coasts, roads, site tools and a list of the places', r.tools && r.roads && r.list >= 10 && /96 × 96/.test(r.size), r);
// a broad stroke of forest across the land
const box = await page.locator('#viewport canvas').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await ev(() => { const ed = window.__app.editor; ed.stampSize = 12; ed.setTool('land_hills'); });
const before2 = await ev(() => Array.from(window.__app.editor.map.tiles).filter((t) => t === 6).length);
await page.mouse.move(cx - 120, cy);
await page.mouse.down();
for (let i = 0; i <= 16; i++) { await page.mouse.move(cx - 120 + i * 15, cy + Math.sin(i / 3) * 30); await wait(15); }
await page.mouse.up();
await wait(300);
r = await ev(() => ({ hills: Array.from(window.__app.editor.map.tiles).filter((t) => t === 6).length, undo: window.__app.editor.undoStack.length }));
check('a long drag with a big brush paints a broad band of hills in one stroke', r.hills - before2 > 300, { before: before2, after: r.hills });
// double-click a place in the list opens its designer
await page.locator('.land-place', { hasText: 'Brookend' }).dblclick();
await wait(800);
r = await ev(() => ({ tab: window.__app.editor.tab, sel: document.querySelector('.pl-name')?.value }));
check('double-clicking a place in the Land list opens it in Places', r.tab === 'places' && r.sel === 'Brookend', r);
// + New place → I will pick the spot: the Land step, with the site tool ready
await page.locator('.pl-head button', { hasText: 'New place' }).click();
await wait(300);
await page.locator('.pl-kind', { hasText: 'Village' }).click();
await page.locator('.pl-new input[type=text]').fill('Pickford');
await page.locator('.pl-how', { hasText: 'I will pick' }).click();
await page.locator('.modal-buttons button', { hasText: 'Found it' }).click();
await wait(800);
r = await ev(() => ({ tab: window.__app.editor.tab, tool: window.__app.editor.toolId }));
check('“I will pick the spot” opens the Land step with the village tool in hand', r.tab === 'land' && r.tool === 'found_village', r);
r = await ev(async () => {
  const ed = window.__app.editor, w = ed.map, s = ed.game.settings.start;
  let at = null;
  for (let d = 4; d < 30 && !at; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
    const x = s.x + dx, y = s.y + dy, t = w.tiles[y * w.w + x];
    if (!at && [2, 3].includes(t) && !w.entities.some((e) => e.x === x && e.y === y)) at = { x, y };
  }
  await ed.tool.down(ed, at, {});
  await new Promise((res) => setTimeout(res, 600));
  const m = ed.game.maps.find((x) => x.name === 'Pickford');
  return { made: !!m, plan: m?.plan?.kind, tab: ed.tab, sel: document.querySelector('.pl-name')?.value, tile: w.tiles[at.y * w.w + at.x] };
});
check('clicking the map founds it there and comes back to its designer', r.made && r.plan === 'village' && r.tab === 'places' && r.sel === 'Pickford' && r.tile === 19, r);
// a fresh realm: find spots for places, then join them with roads, all through the panel
await ev(() => window.__app.editor.setTab('land'));
await wait(500);
await page.locator('button', { hasText: 'Find spots for places' }).click();
await wait(300);
for (const k of ['Village', 'Dungeon', 'Harbour']) await page.locator('.land-kinds .pl-count', { hasText: k }).locator('button[aria-label^="One more"]').click();
await page.locator('.modal-buttons button', { hasText: 'Found them' }).click();
await wait(1500);
r = await ev(() => window.__app.editor.game.maps[0].entities.filter((e) => e.type === 'portal' && e.style === 'site').length);
check('Find spots for places founds the places asked for', r >= 14, r);
await page.locator('.land-roads').click();
await wait(600);
r = await ev(() => document.querySelector('#toasts')?.textContent || '');
check('Join the places with roads lays them (or finds them joined)', /Roads laid|joined already|no way over land/i.test(r), r);
// the Generate the world dialog has a shape
await ev(() => window.__app.editor.regenerateDialog());
await wait(300);
r = await ev(() => ({ shapes: [...document.querySelectorAll('select[aria-label="Shape"] option')].map((o) => o.value), move: /Find new spots/.test(document.querySelector('.modal')?.textContent || '') }));
check('Generate the world… offers the shapes of land, and to move the places onto it', r.shapes.length >= 4 && r.move, r);
await ev(() => { const s = document.querySelector('select[aria-label="Shape"]'); s.value = 'islands'; s.dispatchEvent(new Event('change')); });
await page.locator('.modal-buttons button', { hasText: 'Generate' }).click();
await wait(1500);
r = await ev(() => {
  const g = window.__app.editor.game, w = g.maps[0];
  const sites = w.entities.filter((e) => e.type === 'portal' && e.style === 'site');
  const T = (x, y) => w.tiles[y * w.w + x];
  const ok = sites.every((p) => [17, 18, 19, 20, 21, 23, 24, 25, 27, 28].includes(T(p.x, p.y)));
  const exits = sites.every((p) => { const m = g.maps.find((x) => x.id === p.target.map); return m && m.exit.x === p.x && m.exit.y === p.y; });
  return { n: sites.length, ok, exits };
});
check('a new world moves every place onto the new land, and their ways out follow', r.n >= 14 && r.ok && r.exits, r);
check('no page errors', !errors.length, errors.slice(0, 5));
await browser.close();
if (fails) { console.log(`${fails} check(s) failed`); process.exit(1); }
console.log('all Places & Land checks passed');
