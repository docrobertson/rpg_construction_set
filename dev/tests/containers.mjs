// Containers: the other things treasure is found in. Every container model
// builds; the sample's overturned cart and the dungeons' loose flagstones no
// longer look like chests; a chest drawn as something else still opens and
// says the right words; generated dungeons keep some treasure in sacks,
// coffins and strongboxes (but never their hoard); the Construction Set's
// "Looks like" selects write look.kind. Takes a contact sheet of every
// container (play zoom and close), the cart on the world map and a loose
// flagstone in a dungeon. Prints PASS / FAIL lines; exits 1 on any failure.
// Usage: node tests/containers.mjs [outDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = process.argv[2] || path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

// ---- without a browser: the models, the words, the looks
const C = await import('../src/data/containers.js');
const { buildModelGeometry, MODEL_KINDS } = await import('../src/render/models.js');
const { CONTAINER_BUILDERS } = await import('../src/render/containers.js');
const { eventLook, eventFromTemplate } = await import('../src/game/events.js');
const G = await import('../src/world/generate.js');
const { isHoard } = await import('../src/game/charms.js');
const { buildSampleGame } = await import('../src/data/sample.js');
const KINDS = Object.keys(CONTAINER_BUILDERS);
{
  const bad = [], big = [];
  for (const k of KINDS) {
    try {
      const g = buildModelGeometry({ kind: k });
      const bb = g.lit?.boundingBox;
      if (!g.lit || !g.shell || !g.glow) bad.push(k);
      // about a square, like the chest (the world map draws it larger)
      else if (bb.max.x - bb.min.x > 1.2 || bb.max.z - bb.min.z > 1.0 || bb.max.y > 0.9 || bb.min.y < -0.12) big.push([k, +(bb.max.x - bb.min.x).toFixed(2), +(bb.max.z - bb.min.z).toFixed(2), +bb.max.y.toFixed(2)]);
      buildModelGeometry({ kind: k, color: 0x8a4a8a }); // a colour of its own
    } catch (e) { bad.push(`${k}: ${e.message}`); }
  }
  check(`every container model builds, lit, outlined and glinting (${KINDS.length} of them)`, KINDS.length >= 14 && !bad.length, bad);
  check('each is about a square across, like a chest', !big.length, big);
  check('the editor lists every container look, each one a model', C.CONTAINER_LOOKS.length === KINDS.length + 1 && C.CONTAINER_LOOKS.every(([k]) => MODEL_KINDS.includes(k)), C.CONTAINER_LOOKS.map(([k]) => k).filter((k) => !MODEL_KINDS.includes(k)));
  const T = {
    'Overturned Cart': 'cart', 'Loose Flagstone': 'flagstone', 'Beneath a loose flagstone lies a waxed bundle': 'flagstone',
    'Half-buried in the sand above the tide line, a barrel stamped with a skull.': 'barrels', 'Suspiciously Clean Chest': 'chest',
    'The Drowned Sailor\'s Sea-chest': 'seachest', 'The King\'s Pay-chest': 'strongbox', 'Loose Stone in the Wall': 'wallstone',
    'Hollow Oak': 'hollowlog', 'Fallen Adventurer': 'remains', 'Old Cairn': 'cairn', 'A cracked urn among the bones': 'urns', 'Smugglers\' Cache': null,
  };
  const wrong = Object.entries(T).filter(([t, k]) => C.containerLookFor(t) !== k).map(([t, k]) => [t, k, C.containerLookFor(t)]);
  check('a name or description calls for the right container (the first word wins)', !wrong.length, wrong);
  const w = (e, k) => C.containerWords(e, k);
  const msgs = [w({}, 'chest').opened('40 gold'), w({}, 'chest').empty(), w({ name: 'Overturned Cart' }, 'cart').opened('12 gold'), w({}, 'flagstone').opened('30 gold'), w({}, 'sacks').act, w({ name: 'Black Maddoc\'s Sea-chest' }, 'seachest').act, w({}, 'strongbox').locked];
  check('the words follow the look: "The chest holds", "You search the Overturned Cart", "You lift the loose flagstone"',
    msgs[0] === 'The chest holds: 40 gold.' && msgs[1] === 'The chest is empty.' && msgs[2] === 'You search the Overturned Cart and find 12 gold.'
    && msgs[3] === 'You lift the loose flagstone. Beneath it: 30 gold.' && msgs[4] === 'Search the sacks' && msgs[5] === 'Dig up Black Maddoc\'s Sea-chest' && msgs[6] === 'The strongbox is locked.', msgs);
}
// the sample's caches
const sample = buildSampleGame();
{
  const all = sample.maps.flatMap((m) => m.entities.map((e) => ({ e, m })));
  const ev = (id) => all.find((x) => x.e.id === id);
  const cart = ev('ev_cart'), isle = ev('ev_cache_isle'), mimic = ev('ev_mimic');
  const flags = all.filter((x) => x.e.type === 'event' && x.e.name === 'Loose Flagstone');
  const looks = { cart: eventLook(cart.e, cart.m)?.kind, isle: eventLook(isle.e, isle.m)?.kind, mimic: eventLook(mimic.e, mimic.m)?.kind, flags: flags.map((x) => eventLook(x.e, x.m)?.kind) };
  check('the sample\'s overturned cart is drawn as a cart, the smugglers\' barrel as barrels', looks.cart === 'cart' && looks.isle === 'barrels', looks);
  check('the dungeons\' loose flagstones are loose flagstones, not chests', flags.length >= 2 && looks.flags.every((k) => k === 'flagstone'), looks.flags);
  check('…but the barrow\'s suspiciously clean chest (a mimic) still looks like a chest', looks.mimic === 'chest', looks.mimic);
  const fresh = eventLook(eventFromTemplate('cache'));
  check('a hidden cache made from the template lies under a loose flagstone', fresh.kind === 'flagstone', fresh);
}
// generated dungeons: their own chests vary by style; the hoard, locks and
// chests the designer placed stay chests; nothing is written into the map
{
  const kinds = {}, hoards = [], stored = [];
  for (const [style, seeds] of [['cave', [3, 4, 5, 6]], ['crypt', [7, 8, 9, 10]], ['fortress', [11, 12, 13, 14]]]) {
    kinds[style] = new Set();
    for (const seed of seeds) {
      const { map } = G.generateDungeon({ seed, style, monsters: ['goblin'], rooms: 10 });
      for (const e of map.entities.filter((x) => x.type === 'chest')) {
        if (e.look) stored.push(e.id);
        const k = C.chestLook(e, map, isHoard(map, e)).kind;
        if (isHoard(map, e)) hoards.push(k); else kinds[style].add(k);
      }
    }
  }
  const sets = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, [...v]]));
  check('generated dungeons keep some treasure in sacks and bones (caves), coffins and urns (crypts), crates and strongboxes (fortresses)',
    sets.cave.some((k) => ['remains', 'sacks', 'barrels', 'cairn'].includes(k)) && sets.crypt.some((k) => ['sarcophagus', 'urns', 'coffin', 'reliquary', 'remains'].includes(k))
    && sets.fortress.some((k) => ['crates', 'strongbox', 'barrels', 'sacks'].includes(k)) && Object.values(sets).every((s) => s.includes('chest')), sets);
  check('a dungeon\'s hoard is always a proper chest', hoards.length >= 12 && hoards.every((k) => k === 'chest'), hoards);
  check('the generator writes no looks into its maps (the same maps as before)', !stored.length, stored);
  const map = G.generateDungeon({ seed: 11, style: 'fortress', monsters: ['goblin'], rooms: 10 }).map;
  const some = map.entities.find((e) => e.type === 'chest' && !isHoard(map, e) && C.chestLook(e, map).kind !== 'chest');
  const kept = [{ ...some, locked: true }, { ...some, gold: '3d20' }, { ...some, items: [{ id: 'rune_key', n: 1 }] }, { ...some, look: { kind: 'nest' } }, { ...some, name: 'The Paymaster\'s Strongbox' }].map((e) => C.chestLook(e, map, false).kind);
  check('a locked chest, one placed by hand or holding a quest\'s prize stay chests; a look or a name of its own is kept', kept.join() === 'chest,chest,chest,nest,strongbox', kept);
  const plan = { style: 'cave', size: 'medium', rooms: 9, monsters: ['goblin'], counts: {}, boss: null, treasure: { gold: 100, items: [] }, chests: 2, wonders: 2 };
  const cave = G.generateDungeon({ seed: 5, name: 'T', plan }).map.entities.find((e) => e.kind === 'cache');
  const fort = G.generateDungeon({ seed: 5, name: 'T', plan: { ...plan, style: 'fortress' } }).map.entities.find((e) => e.kind === 'cache');
  check('a planned cave hides its cache on a fallen adventurer, a fortress in a loose stone in the wall', eventLook(cave)?.kind === 'remains' && eventLook(fort)?.kind === 'wallstone' && cave.choices[0].label === 'Search the satchel', [cave?.name, fort?.name]);
  const wild = [];
  for (const seed of [11, 222, 3333, 44, 5]) for (const e of G.generateWorld(80, 80, seed).entities) if (e.kind === 'cache') wild.push(`${e.name}:${eventLook(e)?.kind}`);
  check('caches out in a generated land fit their ground (a hollow log, a cairn, a cart…)', wild.length >= 4 && wild.every((s) => !s.endsWith(':chest')) && new Set(wild).size >= 2, wild);
}

// ---- in the browser
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(240000); // (full-quality screenshots of the wide world are slow without a graphics card)
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1000);
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: path.join(OUT, `containers-${name}.png`) });
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
await ev(async () => {
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, 300));
});
await closeModals();
await page.addStyleTag({ content: '.qtrack,.qbanner-host,.chbanner,.nearby{display:none!important} .ct-lbl{position:fixed;z-index:99;font:600 11px sans-serif;color:#fff;background:#0009;padding:1px 4px;border-radius:3px;transform:translate(-50%,0);pointer-events:none}' });

// ---- a chest drawn as something else opens as a chest does, in its own words
let r = await ev(async () => {
  const s = window.__app.session;
  const w = s.game.maps.find((m) => m.type === 'world');
  if (s.map.id !== w.id) await s.enterMap(w.id, s.game.settings.start.x, s.game.settings.start.y, { instant: true });
  const p = s.state.pos;
  const lines = () => [...document.querySelectorAll('.log > div, .log-line, .log p')].map((el) => el.textContent);
  const out = {};
  const put = (props) => { const e = { id: 'ct_' + Math.random().toString(36).slice(2), type: 'chest', x: p.x, y: p.y - 1, gold: '10', items: [{ id: 'healing_draught', n: 1 }], ...props }; s.map.entities.push(e); s.addVisual(e); return e; };
  const said = [];
  const log0 = s.log.bind(s);
  s.log = (t, k) => { said.push(t); return log0(t, k); };
  // the cart: hover card, the Nearby menu, its model, what opening it says
  const cart = put({ name: 'Overturned Cart', look: { kind: 'cart' } });
  out.look = s.entityLook(cart).kind;
  out.model = s.view.entities.get(cart.id)?.info ? true : false;
  const card = s.ui.explore.describe({ kind: 'chest', e: cart, x: cart.x, y: cart.y }, { tone: 'use' }, [[cart.x, cart.y]]);
  out.card = [card.title, card.act];
  out.menu = s.ui.explore.nearby().map((a) => a.label).filter((l) => /cart/i.test(l));
  out.tile = s.describeTile(cart.x, cart.y);
  const gold0 = s.party.gold;
  await s.openChest(cart);
  out.gold = s.party.gold - gold0;
  out.gone = !s.map.entities.includes(cart);
  // a loose flagstone with no name, a plain chest, an empty sack and a locked strongbox
  await s.openChest(put({ look: { kind: 'flagstone' } }));
  await s.openChest(put({}));
  await s.openChest(put({ look: { kind: 'sacks' }, gold: '0', items: [] }));
  const box = put({ look: { kind: 'strongbox' }, locked: true });
  for (const it of s.game.items.filter((i) => i.type === 'key')) s.party.inventory[it.id] = 0;
  await s.openChest(box);
  out.boxStays = s.map.entities.includes(box);
  out.said = said;
  s.log = log0;
  return out;
});
check('a chest drawn as a cart has a cart for its model', r.look === 'cart' && r.model, r);
check('pointing at it says what it is and what a click does', r.card[0] === 'Overturned Cart' && r.card[1] === 'Click to search', r.card);
check('the Nearby menu offers to search it, and Look calls it by name', r.menu.includes('Search the Overturned Cart') && /Overturned Cart/.test(r.tile), [r.menu, r.tile]);
check('it opens as a chest does: the gold is paid and it is gone', r.gold >= 10 && r.gone, r);
check('…saying "You search the Overturned Cart and find …"', r.said.some((t) => /^You search the Overturned Cart and find 10 gold, Healing Draught/.test(t)), r.said);
check('a loose flagstone is lifted, a plain chest still "holds", empty sacks are rummaged through', r.said.some((t) => /^You lift the loose flagstone\. Beneath it: 10 gold/.test(t)) && r.said.some((t) => /^The chest holds: 10 gold/.test(t)) && r.said.some((t) => /^You rummage through the sacks\. Mouldy grain/.test(t)), r.said);
check('a locked strongbox says so, and stays shut', r.said.includes('The strongbox is locked.') && r.boxStays, r.said);

// ---- the contact sheet: every container side by side on a stretch of grass
const sheet = async (name, focus) => {
  await ev(async ([KINDS, focus]) => {
    for (const el of document.querySelectorAll('.ct-lbl')) el.remove();
    const s = window.__app.session, v = s.view, m = s.map;
    const grass = m.tiles[52 * m.w + 33];
    const at = { x: 36, y: 58 };
    if (!s._ctSheet) {
      for (let y = at.y - 9; y <= at.y + 4; y++) for (let x = at.x - 12; x <= at.x + 12; x++) m.tiles[y * m.w + x] = grass;
      m.entities = m.entities.filter((e) => !(Math.abs(e.x - at.x) <= 13 && e.y >= at.y - 10 && e.y <= at.y + 5));
      await s.enterMap(m.id, at.x, at.y + 2, { instant: true });
      s.game.settings.lineOfSight = false; s.updateVisibility(true);
      s._ctSheet = true;
    }
    v.clearEntities();
    const o = { x: at.x - 6, y: at.y - 6 };
    const pos = ['chest', ...KINDS].map((k, i) => ({ k, x: o.x + (i % 7) * 2, y: o.y + Math.floor(i / 7) * 2 }));
    pos.forEach(({ k, x, y }, i) => v.addEntity('ct' + i, { kind: k }, x, y, { poi: true }));
    v.rig.minDist = 1;
    v.setZoom(focus.zoom, true); v.focus(o.x + focus.x, o.y + focus.y, true);
    window.__ctPos = pos;
  }, [KINDS, focus]);
  await wait(1500);
  // name each one, once the camera has settled
  await ev(() => {
    const v = window.__app.session.view;
    v.camera.updateMatrixWorld();
    const rect = v.renderer.domElement.getBoundingClientRect();
    for (const { k, x, y } of window.__ctPos) {
      const p = v.worldToScreen(x + 0.5, 0, y + 1.05);
      if (p.x < 10 || p.y < 10 || p.x > rect.width - 10 || p.y > rect.height - 10) continue;
      const el = document.createElement('div');
      el.className = 'ct-lbl'; el.textContent = k;
      el.style.left = rect.left + p.x + 'px'; el.style.top = rect.top + p.y + 'px';
      document.body.appendChild(el);
    }
  });
  await wait(300);
  await shot(name);
};
await sheet('sheet', { zoom: 14, x: 6, y: 2.4 });
await sheet('sheet-close1', { zoom: 7.5, x: 3.5, y: 1 });
await sheet('sheet-close2', { zoom: 7.5, x: 9.5, y: 3 });
await sheet('sheet-close3', { zoom: 7.5, x: 3, y: 3.4 });
await ev(() => { for (const el of document.querySelectorAll('.ct-lbl')) el.remove(); });

// ---- the sample's cart where it lies by the road, and a loose flagstone underground
r = await ev(async () => {
  const s = window.__app.session, g = s.game;
  // a fresh copy of the sample's world (the line-up above dug up its grass)
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s2 = app.session; if (s2 && s2 !== s && s2.map && !s2.transitioning) break; await new Promise((res) => setTimeout(res, 100)); }
  const s2 = app.session;
  const cart = s2.map.entities.find((e) => e.id === 'ev_cart');
  await s2.enterMap(s2.map.id, cart.x, cart.y + 2, { instant: true });
  s2.view.setZoom(13, true); s2.view.focus(cart.x + 0.5, cart.y, true);
  return { kind: s2.entityLook(cart)?.kind, drawn: s2.view.entities.get(cart.id)?.info ? true : false, g: !!g };
});
check('on the world map the overturned cart by the road is drawn as a cart', r.kind === 'cart' && r.drawn, r);
await closeModals();
await wait(1500);
await shot('cart-world');
r = await ev(async () => {
  const s = window.__app.session, g = s.game;
  const m = g.maps.find((mm) => mm.name === 'Grimholt Barrow');
  const flag = m.entities.find((e) => e.type === 'event' && e.name === 'Loose Flagstone');
  const near = m.entities.filter((e) => e.type === 'chest').map((e) => s.chestLook ? s.chestLook(e).kind : null);
  // the company a step or two off, its torch lighting the slab (and the
  // barrow's dead kept out of the picture)
  const floor = m.tiles[flag.y * m.w + flag.x];
  m.entities = m.entities.filter((e) => !(e.type === 'monster' && Math.abs(e.x - flag.x) + Math.abs(e.y - flag.y) < 10));
  const spots = [[1, 2], [-1, 2], [0, 2], [2, 1], [-2, 1], [2, 0], [-2, 0]].map(([dx, dy]) => ({ x: flag.x + dx, y: flag.y + dy }));
  const t = spots.find((p) => m.tiles[p.y * m.w + p.x] === floor && !m.entities.some((e) => e.x === p.x && e.y === p.y)) || spots[0];
  await s.enterMap(m.id, t.x, t.y, { instant: true });
  s.view.setZoom(6.5, true); s.view.focus(flag.x + 0.5 + (t.x - flag.x) * 0.3, flag.y + 1, true);
  return { kind: s.entityLook(flag)?.kind, chests: near };
});
check('in Grimholt Barrow the loose flagstone is a lifted slab, not a chest', r.kind === 'flagstone', r);
await closeModals();
await wait(1500);
await shot('flagstone-dungeon');

// ---- the Construction Set: "Looks like" for a chest, "Drawn as" for a cache
r = await ev(async () => {
  const app = window.__app;
  app.openEditor(app.sample);
  for (let i = 0; i < 50 && !app.editor; i++) await new Promise((res) => setTimeout(res, 100));
  await new Promise((res) => setTimeout(res, 800));
  for (let i = 0; i < 5 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 150)); }
  const ed = app.editor;
  ed.setTab('map');
  const w = ed.game.maps.find((m) => m.type === 'world');
  if (ed.map !== w) ed.loadMap(w);
  await new Promise((res) => setTimeout(res, 300));
  const field = (label) => [...document.querySelectorAll('.field')].find((f) => f.querySelector('.field-label')?.textContent === label);
  const out = {};
  // the Wolfwood chest: give it a name and a look
  const chest = ed.map.entities.find((e) => e.id === 'chest_wolfwood');
  ed.select(chest);
  ed.view.focus(chest.x, chest.y, true);
  await new Promise((res) => setTimeout(res, 300));
  const sel = field('Looks like')?.querySelector('select');
  out.auto = sel?.options[0]?.textContent;
  out.options = sel ? [...sel.options].length : 0;
  sel.value = 'hollowlog'; sel.dispatchEvent(new Event('change'));
  await new Promise((res) => setTimeout(res, 200));
  const name = field('Name')?.querySelector('input');
  name.value = 'Hollow Oak'; name.dispatchEvent(new Event('input'));
  out.look = chest.look; out.name = chest.name;
  out.drawn = ed.entityLook(chest).kind;
  out.colour = !!field('Its colour');
  await new Promise((res) => setTimeout(res, 300));
  // the overturned cart (a hidden cache): automatic from its name, then barrels
  const cart = ed.map.entities.find((e) => e.id === 'ev_cart');
  ed.select(cart);
  await new Promise((res) => setTimeout(res, 200));
  const sel2 = field('Drawn as')?.querySelector('select');
  out.cartAuto = sel2?.options[0]?.textContent;
  sel2.value = 'barrels'; sel2.dispatchEvent(new Event('change'));
  out.cartLook = cart.look;
  out.cartDrawn = ed.entityLook(cart).kind;
  const sel3 = field('Drawn as')?.querySelector('select');
  sel3.value = ''; sel3.dispatchEvent(new Event('change'));
  out.cartBack = cart.look === undefined && ed.entityLook(cart).kind === 'cart';
  // a shrine shows no such select
  ed.select(ed.map.entities.find((e) => e.kind === 'shrine'));
  await new Promise((res) => setTimeout(res, 200));
  out.shrine = !!field('Drawn as');
  // a chest given some other model by hand (a campfire) shows it, and keeps it
  const heron = ed.map.entities.find((e) => e.id === 'chest_heron');
  heron.look = { kind: 'campfire' };
  ed.select(heron);
  await new Promise((res) => setTimeout(res, 200));
  const sel4 = field('Looks like')?.querySelector('select');
  out.other = [sel4?.value, sel4?.selectedOptions[0]?.textContent, ed.entityLook(heron).kind];
  delete heron.look;
  ed.select(chest);
  return out;
});
check('the chest inspector offers a "Looks like" list of every container, automatic by default', r.options === KINDS.length + 2 && /^Automatic — treasure chest/.test(r.auto), [r.options, r.auto]);
check('choosing one writes look.kind and redraws it; a name is kept', r.look?.kind === 'hollowlog' && r.name === 'Hollow Oak' && r.drawn === 'hollowlog' && r.colour, r);
check('a hidden cache\'s "Drawn as" list starts at what its name calls for, and writes look.kind', /^Automatic — overturned cart/.test(r.cartAuto) && r.cartLook?.kind === 'barrels' && r.cartDrawn === 'barrels' && r.cartBack, r);
check('other points of interest show no such list', !r.shrine, r.shrine);
check('a chest drawn by hand as some other model (a campfire) shows it in the list', r.other[0] === 'campfire' && /Other: campfire/.test(r.other[1]) && r.other[2] === 'campfire', r.other);
await wait(500);
await ev(() => { const el = [...document.querySelectorAll('.field-label')].find((e) => e.textContent === 'Looks like'); el?.scrollIntoView({ block: 'center' }); });
await wait(400);
await shot('editor-chest');
// (and the cart's inspector, for a look)
await ev(async () => { const ed = window.__app.editor; const cart = ed.map.entities.find((e) => e.id === 'ev_cart'); ed.select(cart); ed.view.focus(cart.x, cart.y, true); await new Promise((res) => setTimeout(res, 300)); });
await wait(600);
await shot('editor-cache');

check('no page errors', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall containers checks passed');
process.exit(fails ? 1 : 0);
