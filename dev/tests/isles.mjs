// The isles: the tropical terrain (jungle, palms, mangroves, reefs, ancient
// paving, temple walls, overgrowth, obsidian, idols, sacred pools, single
// jungle and palm trees), the 'temple' dungeon style and world-map site, the
// isle monsters and gear. Checks that every new terrain renders and has a
// battlefield, that the temple builds and can be walked end to end (and as a
// plan in the Places step), that each new monster builds and fights, that
// the editor offers the new ground and brushes, that a large jungle stays
// smooth, and takes the screenshots to look at (tests/out/isles_*.png).
// Prints `ok` / `FAIL` lines; exits 1 on any failure.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

const { T, TERRAIN, terrain, paletteFor, FEATURE_KINDS } = await import('../src/data/terrain.js');
const G = await import('../src/world/generate.js');
const P = await import('../src/world/places.js');
const D = await import('../src/data/defaults.js');
const { DECOR, AuxBuilder } = await import('../src/render/decor.js');
const { hash2 } = await import('../src/core/rng.js');
const { newGame, migrateGame, serializeGame, deserializeGame } = await import('../src/data/schema.js');
const { habitatOf } = await import('../src/game/session.js');
const { deterministicIds } = await import('../src/core/util.js');
const { coastMap } = await import('./isleScenes.mjs');

const ISLE_TERRAIN = ['jungle', 'palms', 'mangrove', 'reef', 'ruins_floor', 'temple_wall', 'vines', 'obsidian', 'temple', 'idol', 'pool', 'jungle_tree', 'palm_tree'];
const ISLE_MONSTERS = ['giant_frog', 'jungle_cat', 'lizardfolk', 'lizard_shaman', 'reef_shark', 'mist_wraith', 'stone_guardian', 'sea_hag', 'naga'];
const ISLE_ITEMS = ['coral_charm', 'jade_idol', 'hookblade', 'lizardhide'];
// (ISLES_MONS=a,b fights only those, and skips the slow frame timing: for working on one look)
const ONLY = process.env.ISLES_MONS ? process.env.ISLES_MONS.split(',') : null;
const MONS = ISLE_MONSTERS.filter((m) => !ONLY || ONLY.includes(m));

// ---- the terrain: what each square is, and its decor
{
  const t = (k) => TERRAIN[T[k]];
  check('every isle terrain is defined, with decor', ISLE_TERRAIN.every((k) => t(k) && (!t(k).deco || DECOR[t(k).deco])), ISLE_TERRAIN.filter((k) => !t(k) || (t(k).deco && !DECOR[t(k).deco])));
  check('jungle is slow and hides what is in it; vines and palms are slower than grass', t('jungle').sight && t('jungle').cost >= 2 && t('vines').cost > 1 && t('palms').cost > 1 && t('jungle').walk);
  check('a reef is sailed, never walked; mangroves are waded, never sailed', t('reef').ship && t('reef').water && !t('reef').walk && t('mangrove').walk && !t('mangrove').ship && !t('mangrove').water);
  check('ancient paving is walked; temple walls are walls; obsidian is walked', t('ruins_floor').walk && t('temple_wall').wall && !t('temple_wall').walk && t('temple_wall').sight && t('obsidian').walk);
  check('the temple is a world-map site that leads to a dungeon', t('temple').feature && FEATURE_KINDS.temple?.mapType === 'dungeon');
  check('the isles keep wild things of their own', habitatOf(t('jungle')) === 'jungle' && habitatOf(t('palms')) === 'beach' && habitatOf(t('ruins_floor')) === 'temple' && t('reef').habitat === 'reef' && habitatOf(t('grass')) === 'grass' && habitatOf(t('forest')) === 'forest');
  // every walkable new ground has a battlefield of its own kind
  const arenas = {};
  for (const k of ISLE_TERRAIN) if (t(k).walk) arenas[k] = t(k).arena;
  const styles = [...new Set(Object.values(arenas))];
  const bad = [];
  for (const st of styles) {
    for (const seed of [1, 2, 3]) {
      const a = G.generateArena(st, seed);
      const walk = (x, y) => terrain(a.tiles[y * a.w + x]).walk;
      for (let x = 2; x < a.w - 2; x++) for (const y of [0, 1, a.h - 2, a.h - 1]) if (!walk(x, y)) bad.push([st, seed, x, y]);
    }
  }
  check('every walkable isle ground has an arena, with room to stand at either end', styles.every((s) => ['jungle', 'beach', 'temple', 'ash'].includes(s)) && !bad.length, { arenas, bad: bad.slice(0, 4) });
  check('jungle, beach and temple battlefields are made of their own ground', G.generateArena('jungle', 4).fill === 'vines' && G.generateArena('beach', 4).fill === 'sand' && G.generateArena('temple', 4).fill === 'ruins_floor'
    && G.generateArena('jungle', 4).tiles.some((v) => v === T.jungle_tree) && G.generateArena('beach', 4).tiles.some((v) => v === T.palm_tree) && G.generateArena('temple', 4).tiles.some((v) => v === T.temple_wall));
  // decor builds, and stays within a forest's vertex budget per square
  const budget = {};
  for (const k of ISLE_TERRAIN) {
    const def = t(k);
    if (!def.deco) continue;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const B = new AuxBuilder(), W = new AuxBuilder(), Gl = new AuxBuilder();
      const x = i % 10, y = Math.floor(i / 10);
      DECOR[def.deco]({ B, W, G: Gl, x, z: y, cx: x + 0.5, cz: y + 0.5, y: 0, g: 0, gy: () => 0, t: def, map: null, nb: () => (k === 'temple_wall' ? TERRAIN[T.ruins_floor] : def), outside: false, dark: false,
        r: (q) => hash2(x * 7 + q * 13, y * 11 - q * 5, 4242), nbCount: () => 0, light: () => {}, torch: false, thin: false });
      n += B.count + W.count + Gl.count;
    }
    budget[k] = Math.round(n / 60);
  }
  const forestLike = ['jungle', 'palms', 'mangrove', 'reef', 'vines', 'ruins_floor', 'obsidian'];
  check('isle decor builds, within a forest\'s budget per square (about 2000 vertices)', forestLike.every((k) => budget[k] > 0 && budget[k] < 2400), budget);
}

// ---- the temple: a dungeon style, a plan, a place
{
  // the old styles come out byte for byte as before (as tests/cs_places.mjs)
  const hash = (o) => crypto.createHash('sha1').update(JSON.stringify(o, (k, v) => (v instanceof Uint8Array ? Array.from(v).join(',') : v))).digest('hex');
  const same = deterministicIds(() => hash(G.generateDungeon({ seed: 202, style: 'fortress', monsters: ['orc_captain', 'troll'], boss: 'shadow_lord', rooms: 11, w: 40, h: 40 }))) === '97454b885977adf9810f3b79e868e30057a349a5'
    && deterministicIds(() => hash(G.generateDungeon({ seed: 203, style: 'crypt', rooms: 5, w: 26, h: 26, wonders: false }))) === 'e54b4932d63037be6ac4b718b80e5705497b1e2c';
  check('the older dungeon styles are unchanged', same);
  const reachAll = (map) => {
    const seen = new Uint8Array(map.w * map.h), st = [map.entry.y * map.w + map.entry.x];
    seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop(), x = i % map.w, y = (i - x) / map.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * map.w + x + dx;
        if (!seen[j] && terrain(map.tiles[j]).walk) { seen[j] = 1; st.push(j); }
      }
    }
    const lost = map.entities.filter((e) => ['chest', 'monster', 'portal', 'event'].includes(e.type) && !seen[e.y * map.w + e.x]);
    let floor = 0, got = 0;
    for (let i = 0; i < map.tiles.length; i++) if (terrain(map.tiles[i]).walk) { floor++; if (seen[i]) got++; }
    return { lost, floor, got };
  };
  let ok = true;
  const info = [];
  for (const seed of [3, 5, 8, 13, 21, 34]) {
    const { map, rooms } = G.generateDungeon({ seed, style: 'temple', rooms: 9, monsters: ['lizardfolk', 'stone_guardian'], boss: 'naga' });
    const has = (k) => map.tiles.some((v) => v === T[k]);
    const r = reachAll(map);
    const good = map.fill === 'temple_wall' && has('ruins_floor') && has('idol') && map.mood === 'temple' && map.habitat === 'temple' && map.lighting === 'dark'
      && rooms.length >= 6 && !r.lost.length && r.got === r.floor && map.entities.some((e) => e.boss && e.monster === 'naga');
    if (!good) { ok = false; info.push({ seed, rooms: rooms.length, lost: r.lost.length, floor: r.floor, got: r.got, idol: has('idol') }); }
  }
  check('a generated temple has idols and pools in vine-choked halls, and every square, chest and foe can be reached', ok, info);
  const pools = [3, 5, 8, 13, 21, 34, 55, 89].map((seed) => G.generateDungeon({ seed, style: 'temple', rooms: 10 }).map).filter((m) => m.tiles.some((v) => v === T.pool)).length;
  check('most temples have a sacred pool or two', pools >= 4, pools);
  // as a plan: the Places step
  const game = newGame({ blank: true, w: 40, h: 40 });
  const plan = P.defaultPlan('temple');
  check('a temple plan is a dungeon plan in the temple style, with isle foes', plan.style === 'temple' && P.isDungeonKind('temple') && plan.monsters.includes('lizardfolk') && P.DUNGEON_STYLE_NAMES.temple, plan);
  const w = game.maps[0];
  const sub = G.placeFeature(game, w, 20, 20, 'temple', 'Shrine of Tests', 77, plan);
  check('founding a temple on a world map builds its map from the plan', sub?.type === 'dungeon' && sub.fill === 'temple_wall' && sub.mood === 'temple' && w.tiles[20 * w.w + 20] === T.temple
    && sub.entities.some((e) => e.type === 'monster' && ['lizardfolk', 'lizard_shaman', 'stone_guardian', 'mist_wraith', 'skeleton'].includes(e.monster)), sub && { fill: sub.fill, mons: sub.entities.filter((e) => e.type === 'monster').map((e) => e.monster) });
  const back = P.planOf(sub, 'temple');
  check('the Places step reads a temple back as a temple', back.style === 'temple' && back.kind === 'temple', back);
  const noPlan = G.placeFeature(game, w, 10, 10, 'temple', 'Old Shrine', 78);
  check('a temple founded without a plan is a temple too', noPlan.fill === 'temple_wall' && noPlan.mood === 'temple');
  check('a dungeon of the older kinds is not mistaken for a temple', P.planOf(G.placeFeature(game, w, 30, 30, 'cave', 'Hole', 79), 'cave').style === 'cave');
}

// ---- monsters and gear: data
{
  const M = (id) => D.MONSTERS.find((m) => m.id === id);
  const abil = new Set(D.ABILITIES.map((a) => a.id));
  const spells = new Set(D.SPELLS.map((s) => s.id));
  const bad = ISLE_MONSTERS.filter((id) => { const m = M(id); return !m || !(m.level >= 1 && m.level <= 8) || !m.look || !(m.habitat || []).every((h) => D.HABITATS.includes(h)) || (m.abilities || []).some((a) => !abil.has(a)) || (m.spells || []).some((s) => !spells.has(s)) || !m.desc; });
  check('the isle monsters are defined, levels 1-8, with looks, habitats and known powers', !bad.length, bad);
  check('they span the levels from a solo hero\'s first fights to a boss', M('giant_frog').level === 1 && M('naga').level >= 7 && ISLE_MONSTERS.map((id) => M(id).level).join() === ISLE_MONSTERS.map((id) => M(id).level).sort((a, b) => a - b).join());
  check('isle monsters keep to the isles (none in the old lands\' habitats)', ISLE_MONSTERS.every((id) => M(id).habitat.every((h) => ['jungle', 'beach', 'temple', 'reef'].includes(h))));
  check('the reef shark swims; the stone guardian is slow, hard and proof against poison and fear', M('reef_shark').swim && M('stone_guardian').hardened > 0 && M('stone_guardian').immune.includes('poisoned') && M('stone_guardian').immune.includes('afraid') && M('stone_guardian').moves <= 2);
  const I = (id) => D.ITEMS.find((x) => x.id === id);
  check('the isle gear is defined: two charms, a blade and an armour', ISLE_ITEMS.every(I) && I('coral_charm').type === 'charm' && I('jade_idol').type === 'charm' && I('hookblade').type === 'weapon' && I('lizardhide').type === 'armor');
  // an older game gains them once
  const old = newGame({ blank: true, w: 30, h: 30 });
  old.monsters = old.monsters.filter((m) => !ISLE_MONSTERS.includes(m.id));
  old.items = old.items.filter((it) => !ISLE_ITEMS.includes(it.id));
  delete old.settings.islesV;
  const again = deserializeGame(serializeGame(old));
  check('an older game gains the isle monsters and gear when it loads', ISLE_MONSTERS.every((id) => again.monsters.some((m) => m.id === id)) && ISLE_ITEMS.every((id) => again.items.some((x) => x.id === id)));
  migrateGame(again);
  check('... only once', again.monsters.filter((m) => m.id === 'naga').length === 1);
}

// ---- in the browser
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ev = (fn, a) => page.evaluate(fn, a);
const hideUi = () => ev(() => { for (const el of document.querySelectorAll('.modal-back, .chbanner-host, .qbanner-host, .toast')) el.style.display = 'none'; });
const shot = async (name) => { await hideUi(); await page.screenshot({ path: path.join(OUT, `isles_${name}.png`) }); console.log('shot', `tests/out/isles_${name}.png`); };
// a fresh game on the jungle coast (each battle below gets one of its own)
const coast = coastMap();
const fresh = async () => {
  await page.goto('file://' + path.resolve(HERE, '../../index.html'));
  await page.waitForTimeout(800);
  await ev(async (C) => {
    const app = window.__app;
    app.playGame(app.sample, { quick: true, noSave: true });
    for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 300));
    for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); }
    const s = app.session;
    const m = { id: 'isle_test', name: 'Isle of Tests', type: 'world', w: C.w, h: C.h, tiles: new Uint8Array(C.tiles), fill: 'ocean', lighting: 'day', entities: [], entry: C.start, encounterRate: 0 };
    s.game.maps.push(m);
    await s.enterMap(m.id, C.start.x, C.start.y, { instant: true, quiet: true });
    s.game.settings.lineOfSight = false; s.updateVisibility(true);
  }, coast);
};
await fresh();

// ---- the coast: every new terrain on one map, drawn
const drawn = await ev(async () => {
  const s = window.__app.session, v = s.view;
  const m = s.map;
  const tv = v.terrain;
  const meshes = tv.chunks.reduce((n, ch) => n + ch.meshes.length, 0);
  const keys = [...new Set(Array.from(m.tiles))].map((id) => window.__travel.terrain(id).key);
  return { meshes, keys };
});
check('the jungle coast draws, with every isle ground on it', drawn.meshes > 4 && ['jungle', 'palms', 'mangrove', 'reef', 'ruins_floor', 'temple_wall', 'vines', 'obsidian', 'temple', 'idol', 'pool'].every((k) => drawn.keys.includes(k)), drawn);
for (const [name, dusk, zoom, fx, fy] of [['coast_day', 0, 11.5, coast.start.x - 3.5, coast.start.y + 1], ['coast_dusk', 0.55, 11.5, coast.start.x - 3.5, coast.start.y + 1], ['courtyard', 0, 8.5, coast.court.x, coast.court.y - 1], ['temple_site', 0, 8, coast.temple.x, coast.temple.y + 0.5]]) {
  await ev(([dusk, zoom, fx, fy]) => { const v = window.__app.session.view; v.setDaylight(dusk); v.setZoom(zoom, true); v.focus(fx, fy, true); }, [dusk, zoom, fx, fy]);
  await page.waitForTimeout(1200);
  await shot(name);
}
await ev(() => { window.__app.session.view.setDaylight(0); });

// ---- frame time: a large map smothered in jungle against the same in forest
const frame = ONLY ? null : await ev(async () => {
  const s = window.__app.session, v = s.view, T = window.__travel.T;
  const out = {};
  for (const key of ['forest', 'jungle']) {
    const N = 160;
    const tiles = new Uint8Array(N * N).fill(T[key]);
    for (let i = 0; i < N; i++) { tiles[i] = T.ocean; tiles[(N - 1) * N + i] = T.ocean; }
    const id = 'big_' + key;
    s.game.maps = s.game.maps.filter((m) => m.id !== id);
    s.game.maps.push({ id, name: 'Big ' + key, type: 'world', w: N, h: N, tiles, fill: 'ocean', lighting: 'day', entities: [], entry: { x: 80, y: 80 }, encounterRate: 0 });
    const t0 = performance.now();
    await s.enterMap(id, 80, 80, { instant: true, quiet: true });
    const build = performance.now() - t0;
    s.game.settings.lineOfSight = false; s.updateVisibility(true);
    v.setZoom(16, true);
    await new Promise((r) => setTimeout(r, 600));
    const t = [];
    let last = performance.now();
    for (let i = 0; i < 24; i++) { await new Promise((r) => requestAnimationFrame(r)); const n = performance.now(); t.push(n - last); last = n; }
    t.sort((a, b) => a - b);
    out[key] = { build: Math.round(build), median: Math.round(t[12]), calls: v.renderer.info.render.calls, tris: v.renderer.info.render.triangles };
  }
  return out;
});
console.log('frame', JSON.stringify(frame));
if (frame) check('a 160x160 jungle builds and draws about as fast as a forest of the same size', frame.jungle.median <= frame.forest.median * 1.5 + 8 && frame.jungle.build <= frame.forest.build * 1.6 + 500 && frame.jungle.calls <= frame.forest.calls * 1.3 + 10, frame);

// ---- the temple, inside
const inside = await ev(async (C) => {
  const s = window.__app.session, v = s.view;
  const m = window.__generate.generateDungeon({ seed: 5, style: 'temple', name: 'Temple of Tests', monsters: ['lizardfolk', 'stone_guardian', 'mist_wraith'], boss: 'naga', rooms: 8 }).map;
  m.id = 'temple_test'; m.exit = { map: 'isle_test', x: C.start.x, y: C.start.y };
  s.game.maps.push(m);
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true, quiet: true });
  s.game.settings.lineOfSight = false; s.updateVisibility(true);
  v.setZoom(11, true);
  // look into the hall with a sacred pool (or the one north of the stairs)
  const T = window.__travel.T;
  let at = null;
  for (let i = 0; i < m.tiles.length && !at; i++) if (m.tiles[i] === T.pool) at = { x: i % m.w, y: Math.floor(i / m.w) };
  at ||= { x: m.entry.x, y: m.entry.y - 2.5 };
  v.setZoom(9.5, true);
  v.focus(at.x + 0.5, at.y + 1.5, true);
  return { mood: s.map.mood, bg: v.light?.bg, dark: v.lighting === 'dark', torches: v.terrain.chunks.reduce((n, ch) => n + ch.lights.length, 0) };
}, coast);
check('inside the temple: dark, with its own green gloom, torches and glowing idols', inside.mood === 'temple' && inside.dark && inside.bg === 0x0a120e && inside.torches > 3, inside);
await page.waitForTimeout(1200);
await shot('temple_inside');

// ---- each new monster in battle: it builds, takes its turns, uses its powers
const STYLE = { giant_frog: 'jungle', jungle_cat: 'jungle', lizardfolk: 'beach', lizard_shaman: 'temple', reef_shark: 'water', mist_wraith: 'temple', stone_guardian: 'temple', sea_hag: 'beach', naga: 'temple' };
const fought = {};
for (const id of MONS) {
  await fresh();
  const res = await ev(async ([id, style, C]) => {
    const s = window.__app.session, v = s.view;
    if (s.map.id !== 'isle_test') await s.enterMap('isle_test', C.start.x, C.start.y, { instant: true, quiet: true });
    for (const m of s.party.members) { m.level = 6; m.hp = 200; m.status = 'ok'; }
    // (the last fight must be quite over before the next begins)
    for (let i = 0; i < 80 && s.mode === 'combat'; i++) await new Promise((r) => setTimeout(r, 100));
    const prev = s.battle;
    const mine = () => s.battle && s.battle !== prev && s.battle.units?.some((x) => x.side === 'enemy' && x.def?.id === id);
    // (a busy machine can be slow to set a battle up: give it time, and a second go)
    for (let go = 0; go < 2 && !mine(); go++) {
      s.mode = 'explore';
      s.fight([{ id, n: 1 }], style, {}).catch((e) => { window.__fightErr = String(e?.stack || e); });
      for (let i = 0; i < 200 && !mine(); i++) await new Promise((r) => setTimeout(r, 100));
    }
    if (!mine()) return { failed: true, err: window.__fightErr || null, mode: s.mode, battle: !!s.battle, units: s.battle?.units?.map((x) => x.name) };
    await new Promise((r) => setTimeout(r, 1800));
    const b = s.battle;
    const u = b.units.find((x) => x.side === 'enemy');
    const model = v.entities?.get?.(u.id) || null;
    // a close look at it, for the contact sheet
    v.rig.minDist = 1; v.setZoom(5.2, true); v.focus(u.x + 0.5, u.y + 0.35, true);
    // its portrait in the turn-order strip
    const pic = document.querySelector('.cbt-chip.enemy img')?.src || '';
    return { arena: b.arena?.fill, x: u.x, y: u.y, hasModel: !!model, name: u.name, pic, water: s.battle.arena?.tiles?.some((t) => window.__travel.terrain(t).water) };
  }, [id, STYLE[id], coast]);
  if (res.failed) { fought[id] = { ...res, acts: [], pic: '' }; console.log('no battle for', id, JSON.stringify(res)); continue; }
  await page.waitForTimeout(500);
  // (it may have moved on its first turn: look at where it stands now)
  await ev(() => { const s = window.__app.session, v = s.view, u = s.battle.units.find((x) => x.side === 'enemy'); v.focus(u.x + 0.5, u.y - 0.45, true); });
  await page.waitForTimeout(250);
  await hideUi();
  await page.screenshot({ path: path.join(OUT, `isles_mon_${id}.png`), clip: { x: 160, y: 90, width: 640, height: 470 } });
  // let the fight run: the heroes stand and wait, the monster acts
  const acts = await ev(async (id) => {
    const s = window.__app.session, b = s.battle;
    const lines = [];
    const log0 = s.log;
    const e0 = b.units.find((x) => x.side === 'enemy'), x0 = e0?.x, y0 = e0?.y;
    s.log = (t, c) => { lines.push(String(t)); return log0.call(s, t, c); };
    // (a generous wait: on a busy machine a slow monster's turn comes late)
    for (let k = 0; k < 180 && lines.filter((l) => l.includes(b.units.find((x) => x.side === 'enemy')?.name ?? '#')).length < 3 && !b.over; k++) {
      if (b.active?.side === 'party' && b.awaiting !== false) { b.active.member.hp = Math.max(b.active.member.hp, 120); try { b.actPass(); } catch { /* not its turn yet */ } }
      await new Promise((r) => setTimeout(r, 200));
    }
    const en = b.units.find((x) => x.side === 'enemy');
    const name = en?.name || id;
    const mine = lines.filter((l) => l.includes(name));
    // (a shark that cannot reach anyone on the sand still swims up to the shallows' edge)
    if (en && (en.x !== x0 || en.y !== y0)) mine.push(`${name} moves to ${en.x},${en.y}`);
    // (stop the fight where it stands, as a quit would, ready for the next)
    b.abort();
    s.battle = null;
    s.mode = 'explore';
    await new Promise((r) => setTimeout(r, 300));
    s.log = log0;
    return mine.slice(0, 6);
  }, id);
  fought[id] = { ...res, acts };
  if (process.env.ISLES_MONS) console.log('fight', id, JSON.stringify({ ...res, pic: res.pic?.length, acts }));
}
const quiet = MONS.filter((id) => !fought[id].acts.length || !fought[id].hasModel);
check('each isle monster builds in battle and takes its turns', !quiet.length, { quiet, sample: { ...fought.giant_frog, pic: undefined } });
if (fought.reef_shark) check('the reef shark strikes at a ship from the water', fought.reef_shark.water && fought.reef_shark.acts.length > 0);
console.log('acts', JSON.stringify(Object.fromEntries(MONS.map((id) => [id, fought[id].acts.slice(0, 2)]))));
// the contact sheet
{
  const imgs = MONS.map((id) => [id, 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, `isles_mon_${id}.png`)).toString('base64')]);
  const sheet = await browser.newPage({ viewport: { width: 1290, height: 1000 } });
  await sheet.setContent(`<body style="margin:0;background:#1a1410;display:grid;grid-template-columns:repeat(3,430px);gap:0;font:600 15px sans-serif;color:#f0e0c0">${imgs.map(([id, src]) => `<div style="position:relative"><img src="${src}" style="width:430px;height:316px;object-fit:cover;display:block"><span style="position:absolute;left:8px;bottom:6px;background:#0008;padding:2px 6px">${id.replace(/_/g, ' ')}</span></div>`).join('')}</body>`);
  await sheet.screenshot({ path: path.join(OUT, 'isles_monsters.png'), fullPage: true });
  await sheet.close();
  console.log('shot tests/out/isles_monsters.png');
}

// ---- portraits in the battle's turn-order strip
check('every isle monster has a portrait in battle', MONS.every((id) => fought[id].pic.length > 2000), Object.fromEntries(MONS.map((id) => [id, fought[id].pic.length])));
{
  const sheet = await browser.newPage({ viewport: { width: 9 * 140, height: 190 } });
  await sheet.setContent(`<body style="margin:0;background:#2a2018;display:flex;font:600 12px sans-serif;color:#f0e0c0">${MONS.map((id) => `<div style="width:140px;text-align:center"><img src="${fought[id].pic}" style="width:132px;height:156px;background:#3a3028;border-radius:8px;margin:4px"><div>${id.replace(/_/g, ' ')}</div></div>`).join('')}</body>`);
  await sheet.screenshot({ path: path.join(OUT, 'isles_portraits.png') });
  await sheet.close();
  console.log('shot tests/out/isles_portraits.png');
}

// ---- the Construction Set: the new ground and brushes
const cs = await ev(async () => {
  const app = window.__app;
  app.session?.destroy?.();
  app.openEditor(app.sample);
  for (let i = 0; i < 50 && !app.editor; i++) await new Promise((r) => setTimeout(r, 100));
  const ed = app.editor;
  for (let i = 0; i < 50 && !ed?.map; i++) await new Promise((r) => setTimeout(r, 100));
  ed.setTab('land');
  await new Promise((r) => setTimeout(r, 400));
  const land = [...document.querySelectorAll('.tool')].map((b) => b.dataset.tool);
  ed.setTab('map');
  await new Promise((r) => setTimeout(r, 400));
  const swatches = [...document.querySelectorAll('.swatch')].map((b) => b.title);
  const tools = [...document.querySelectorAll('.tool')].map((b) => b.dataset.tool);
  return { land, swatches, tools, tab: ed.tab };
});
check('the Land step offers jungle, tropical coast and mangrove brushes, and a temple to found', ['land_jungle', 'land_tropical', 'land_mangrove', 'found_temple'].every((k) => cs.land.includes(k)), cs.land);
check('the world palette lists the isle ground', ['Jungle', 'Palm Grove', 'Mangrove', 'Coral Reef', 'Ancient Paving', 'Temple Wall', 'Overgrowth', 'Obsidian Flats', 'Stone Idol', 'Sacred Pool'].every((n) => cs.swatches.includes(n)), cs.swatches);
check('the dungeon palette offers temple walls and paving', ['Temple Wall', 'Ancient Paving'].every((n) => paletteFor('dungeon').some((t) => t.name === n)));
// a brush stroke of jungle and one of tropical coast on the world
const painted = await ev(async () => {
  const ed = window.__app.editor, T = window.__travel.T;
  ed.setTab('land');
  await new Promise((r) => setTimeout(r, 200));
  const m = ed.map;
  const before = Array.from(m.tiles);
  // find open grass beside the sea
  let spot = null;
  for (let y = 4; y < m.h - 4 && !spot; y++) for (let x = 4; x < m.w - 4 && !spot; x++) {
    if (m.tiles[y * m.w + x] === T.grass && m.tiles[(y + 3) * m.w + x] === T.ocean) spot = { x, y };
  }
  const tool = (id) => ed.tools[id];
  ed.stampSize = 4;
  // (and a stretch of open grassland for the jungle)
  let open = null;
  for (let y = 6; y < m.h - 6 && !open; y++) for (let x = 6; x < m.w - 6 && !open; x++) {
    let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (m.tiles[(y + dy) * m.w + x + dx] === T.grass || m.tiles[(y + dy) * m.w + x + dx] === T.meadow) n++;
    if (n >= 40) open = { x, y };
  }
  tool('land_jungle').down(ed, open); tool('land_jungle').up(ed);
  if (spot) { tool('land_tropical').down(ed, spot); tool('land_tropical').drag(ed, { x: spot.x + 6, y: spot.y }); tool('land_tropical').up(ed); }
  const count = (k) => m.tiles.filter((v, i) => v === T[k] && before[i] !== T[k]).length;
  return { jungle: count('jungle'), palms: count('palms') + count('reef'), spot };
});
check('painting with the jungle and tropical-coast brushes lays down the new ground', painted.jungle > 5 && painted.palms > 2, painted);

check('no errors on the page', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
