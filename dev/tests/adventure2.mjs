// The second built-in adventure, "The Lanterns of the Glass Sea"
// (src/data/lanterns.js): built and checked in node first — the brief's
// checklist, the Construction Set's own checklist, every map reachable, the
// puzzles solvable from their hints, and the key fights fought out
// (tests/adventure2_sim.mjs) — then played in the page with a lone
// castaway: the main quest from the strand to the Drowned Queen, every
// puzzle solved by real steps (bumping levers and braziers, stepping runes
// and plates, pushing the boulder, typing the riddle), the companions found
// and their banter, the wrong and right accusations, Wren leaving and coming
// back; and screenshots of the world, both lands, towns and dungeons.
// (Between the places the company is set down where it would walk to, and
// the dungeons' monsters are left out of the walk: their fights are the
// simulation's.)  NO_SIM=1 skips the fights, SIM_ONLY=1 runs only node.
//
//   node --require ./tests/fast.cjs tests/adventure2.mjs
// Prints ok/FAIL per check, screenshots to tests/out/adv2-*.png, exit code 1 on failure.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { buildLanternsGame, LANTERNS_ID } from '../src/data/lanterns.js';
import { analyzeCampaign, reachability } from '../src/game/checklist.js';
import { terrain, T } from '../src/data/terrain.js';
import { serializeGame } from '../src/data/schema.js';
import { simulate } from './adventure2_sim.mjs';
import { installPlayHelpers } from './adventure2_play.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

// ------------------------------------------------------------ in node: the realm as built
const t0 = Date.now();
const game = buildLanternsGame();
const buildMs = Date.now() - t0;
check('builds in node', game.id === LANTERNS_ID && game.maps.length > 10, { maps: game.maps.length });
const plain = (g) => { const o = JSON.parse(serializeGame(g)); delete o.meta; return JSON.stringify(o); };
check('builds the same every time (deterministic ids)', plain(game) === plain(buildLanternsGame()), null);
console.log(`   built in ${buildMs} ms`);
const world = game.maps.find((m) => m.type === 'world');
const all = (pred) => game.maps.flatMap((m) => m.entities.filter(pred).map((e) => ({ ...e, mapId: m.id })));
const npc = (id) => all((e) => e.id === id)[0];

// the brief, point by point
check('large map (at least 160 × 160)', world.w >= 160 && world.h >= 160, { w: world.w, h: world.h });
{
  // land masses: 4-connected land, the two largest both big
  const seen = new Uint8Array(world.w * world.h), sizes = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || terrain(world.tiles[i]).water) continue;
    let n = 0; const q = [i]; seen[i] = 1;
    while (q.length) {
      const j = q.pop(); n++;
      const x = j % world.w, y = (j - x) / world.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * world.w + nx;
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h || seen[k] || terrain(world.tiles[k]).water) continue;
        seen[k] = 1; q.push(k);
      }
    }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a);
  check('two major landmasses, and islets', sizes[0] > 3000 && sizes[1] > 3000 && sizes.length >= 5, sizes.slice(0, 8));
}
check('starts with one hero', game.settings.startHeroes === 1, game.settings.startHeroes);
const recruits = all((e) => e.type === 'npc' && e.recruit);
check('at least four companions, each with a reason and banter', recruits.length >= 4 && recruits.every((r) => r.recruit.banter?.length >= 3 && (r.recruit.joinText || r.recruit.offerText)), recruits.map((r) => [r.id, r.recruit.banter?.length]));
check('a companion who leaves (the betrayal)', recruits.some((r) => r.recruit.leaves?.need && r.recruit.leaves.text), null);
const mys = game.mysteries?.[0];
const flagsSet = new Set();
for (const m of game.maps) for (const e of m.entities) {
  if (e.flag) flagsSet.add(e.flag);
  for (const c of e.choices || []) if (c.effects?.flag) flagsSet.add(c.effects.flag);
  for (const k of e.keywords || []) if (k.action?.type === 'set_flag') flagsSet.add(k.action.value);
}
check('a mystery: suspects, culprit, judge, clues all in the game', mys && mys.suspects.length >= 3 && mys.suspects.includes(mys.culprit) && mys.suspects.every((id) => npc(id)) && npc(mys.judge)
  && mys.clues.length >= mys.need && mys.clues.every((c) => flagsSet.has(c.flag)), mys && { missing: mys.clues.filter((c) => !flagsSet.has(c.flag)).map((c) => c.flag), suspects: mys.suspects.filter((id) => !npc(id)) });
const puzzleTypes = new Set(all((e) => ['lever', 'plate', 'boulder', 'gate', 'riddle', 'rune', 'brazier', 'trigger'].includes(e.type)).map((e) => e.type));
check('puzzles of every kind are placed', puzzleTypes.size === 8, [...puzzleTypes]);
check('ships, waygates, charms, containers, landmarks, fields, chapters, side quests',
  all((e) => e.role === 'shipwright' || (e.choices || []).some((c) => c.effects?.ship)).length >= 2
  && all((e) => e.style === 'waygate').length >= 2
  && all((e) => (e.shop?.stock || []).some((id) => game.items.find((i) => i.id === id)?.type === 'charm')).length >= 2
  && game.quests.some((q) => (q.reward?.items || []).some((it) => game.items.find((i) => i.id === it.id)?.type === 'charm'))
  && all((e) => e.type === 'chest' && e.look?.kind).length >= 10
  && all((e) => e.type === 'event' && ['windmill', 'watermill', 'lighthouse', 'wreck', 'chapel', 'circle', 'bones', 'graveyard', 'gallows'].includes(e.kind)).length >= 8
  && world.tiles.some((t) => t === T.fields)
  && game.story.chapters.length >= 4 && game.quests.filter((q) => !q.main).length >= 6, null);
// difficulty: the bosses climb from the first dungeon to the last
const lvl = (id) => game.monsters.find((m) => m.id === id)?.level;
const curve = ['old_snapper', 'grubnose', 'gaff_hollis', 'abbot_morcant', 'glass_wyrm', 'serpent_priest', 'drowned_queen'].map(lvl);
check('the bosses climb steadily to the Drowned Queen', curve.every((l, i) => l && (i === 0 || l >= curve[i - 1])) && curve[0] <= 2 && curve[curve.length - 1] >= 8, curve);
{
  // nothing too strong placed near the start
  const s = game.settings.start;
  const near = world.entities.filter((e) => e.type === 'monster' && Math.hypot(e.x - s.x, e.y - s.y) < 20).map((e) => [e.monster, lvl(e.monster)]);
  check('only gentle foes near the start', near.every(([, l]) => (l || 1) <= 2), near);
}
// every id the story names exists
{
  const items = new Set(game.items.map((i) => i.id)), mons = new Set(game.monsters.map((m) => m.id)), maps = new Set(game.maps.map((m) => m.id));
  const bad = [];
  for (const q of game.quests) {
    if (q.giver && !npc(q.giver)) bad.push(`${q.id} giver`);
    for (const st of q.stages) {
      const g = st.goal;
      if (g.npc && !npc(g.npc)) bad.push(`${q.id} npc ${g.npc}`);
      if (g.item && !items.has(g.item)) bad.push(`${q.id} item ${g.item}`);
      if (g.monster && !mons.has(g.monster)) bad.push(`${q.id} monster ${g.monster}`);
      if (g.map && !maps.has(g.map)) bad.push(`${q.id} map ${g.map}`);
      for (const it of st.reward?.items || []) if (!items.has(it.id)) bad.push(`${q.id} reward ${it.id}`);
    }
    for (const it of q.reward?.items || []) if (!items.has(it.id)) bad.push(`${q.id} reward ${it.id}`);
  }
  for (const m of game.maps) for (const e of m.entities) {
    if (e.type === 'monster' && !mons.has(e.monster)) bad.push(`monster ${e.monster}`);
    for (const it of [...(e.items || []), ...(e.loot || [])]) if (!items.has(it.id)) bad.push(`${e.id} item ${it.id}`);
    for (const id of e.shop?.stock || []) if (!items.has(id)) bad.push(`${e.id} stock ${id}`);
    for (const c of e.choices || []) for (const it of c.effects?.items || []) if (!items.has(it.id)) bad.push(`${e.id} choice item ${it.id}`);
    if (e.recruit) for (const id of e.recruit.equip || []) if (!items.has(id)) bad.push(`${e.id} equip ${id}`);
  }
  for (const m of game.monsters) for (const x of [...(m.escort || []), ...(m.phaseAdds || [])]) if (!mons.has(x.id)) bad.push(`${m.id} escort ${x.id}`);
  check('every person, item, monster and map the story names exists', !bad.length, bad);
}

// the Construction Set's own checklist
{
  const t1 = Date.now();
  const res = analyzeCampaign(game);
  const list = (Array.isArray(res) ? res : res.findings).filter((f) => f.level !== 'ok');
  console.log('   checklist:', list.map((f) => `${f.level} ${f.id}`).join(', ') || 'clean', `(${Date.now() - t1} ms)`);
  check('the checklist finds nothing broken and no warnings', !list.some((f) => f.level === 'error' || f.level === 'warn'), list.filter((f) => f.level === 'error' || f.level === 'warn'));
  const r = reachability(game);
  const unreached = game.maps.filter((m) => !r.maps.has(m.id)).map((m) => m.name);
  check('every map can be reached', !unreached.length, unreached);
}

// ------------------------------------------------------------ the puzzles, solved from their hints
const needMet = (flags, need) => String(need || '').split(',').map((s) => s.trim()).filter(Boolean)
  .every((part) => part.split('|').some((f) => (f.startsWith('!') ? !flags[f.slice(1)] : !!flags[f])));
const mapNamed = (n) => game.maps.find((m) => m.name === n);
{
  // bell, book and candle: search every state (square, levers) from the undercroft
  const map = mapNamed('Mistwatch Abbey');
  const levers = map.entities.filter((e) => e.type === 'lever');
  const gates = map.entities.filter((e) => e.type === 'gate' && e.id.startsWith('abbey_gate'));
  const goalGate = gates.find((g) => g.id === 'abbey_gate_crypt');
  const door = map.entities.find((e) => e.id === 'abbey_crypt_door');
  const start = { x: door.x, y: door.y - 1 };
  const walk = (x, y, flags) => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    if (levers.some((l) => l.x === x && l.y === y)) return false; // (a lever is pulled from beside it)
    const g = gates.find((q) => q.x === x && q.y === y);
    if (g) return needMet(flags, g.need);
    return terrain(map.tiles[y * map.w + x]).walk;
  };
  const key = (s) => `${s.x},${s.y},${levers.map((l) => (s.f[l.id] ? 1 : 0)).join('')}`;
  const init = { x: start.x, y: start.y, f: Object.fromEntries(levers.map((l) => [l.id, !!l.on])) };
  const solve = (from) => {
    const seen = new Map([[key(from), 0]]); const q = [from]; const states = [from];
    while (q.length) {
      const s = q.shift(), d = seen.get(key(s));
      if (s.x === goalGate.x && s.y === goalGate.y - 1) return { d, states };
      const next = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walk(s.x + dx, s.y + dy, s.f)) next.push({ ...s, x: s.x + dx, y: s.y + dy });
      for (const l of levers) if (Math.abs(l.x - s.x) + Math.abs(l.y - s.y) === 1) next.push({ ...s, f: { ...s.f, [l.id]: !s.f[l.id] } });
      for (const n of next) { const k = key(n); if (!seen.has(k)) { seen.set(k, d + 1); q.push(n); states.push(n); } }
    }
    return { d: -1, states };
  };
  const sol = solve(init);
  check('the abbey\'s lever maze can be solved', sol.d > 0, sol.d);
  check('…and needs thought (more than a straight walk)', sol.d > 30, sol.d);
  const stuck = sol.states.filter((s) => solve(s).d < 0).length;
  check('…and no lever pulled out of turn traps the company', stuck === 0, stuck);
  const rite = map.entities.find((e) => e.id === 'ev_abbey_rite');
  check('…with its hint on the undercroft wall', /RING THE BELL.*CLOSE THE BOOK.*SNUFF THE CANDLE/s.test(rite?.text || ''), null);
}
{
  // the hatchlings' rhyme gives the glyphs' order, and the rune numbers agree
  const map = mapNamed('Sunken Temple of the Sun');
  const runes = map.entities.filter((e) => e.type === 'rune').sort((a, b) => a.order - b.order).map((r) => r.glyph);
  const rhyme = npc('npc_ithiss').keywords.find((k) => k.key.startsWith('RHYME')).text;
  const said = [...rhyme.matchAll(/\b(WAVE|MOON|STAR|SUN|FLAME)\b/g)].map((m) => m[1].toLowerCase());
  check('the temple glyphs follow the hatchlings\' rhyme', runes.join() === said.join() && runes.length === 5, { runes, said });
  // two plates, one boulder: a lone hero can push it onto a plate
  const plates = map.entities.filter((e) => e.type === 'plate');
  const boulder = map.entities.find((e) => e.type === 'boulder');
  const open = (x, y) => terrain(map.tiles[y * map.w + x]).walk && !map.entities.some((e) => e.x === x && e.y === y && ['gate', 'rune'].includes(e.type));
  const pushable = (() => {
    const seen = new Set(); const q = [];
    // the pusher starts anywhere in the hall
    for (let y = boulder.y - 3; y <= boulder.y + 3; y++) for (let x = boulder.x - 7; x <= boulder.x + 7; x++) if (open(x, y) && !(x === boulder.x && y === boulder.y)) { q.push([x, y, boulder.x, boulder.y]); seen.add(q[q.length - 1].join()); }
    while (q.length) {
      const [px, py, bx, by] = q.shift();
      if (plates.some((p) => p.x === bx && p.y === by)) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        let s;
        if (nx === bx && ny === by) { if (!open(bx + dx, by + dy)) continue; s = [nx, ny, bx + dx, by + dy]; } else { if (!open(nx, ny)) continue; s = [nx, ny, bx, by]; }
        if (!seen.has(s.join())) { seen.add(s.join()); q.push(s); }
      }
    }
    return false;
  })();
  check('the temple\'s fallen sun-stone can be rolled onto a plate', plates.length === 2 && pushable, null);
}
{
  // Gannet Rock: the shanty names the braziers in their order
  const map = mapNamed('Gannet Rock Light');
  const order = map.entities.filter((e) => e.type === 'brazier').sort((a, b) => a.order - b.order).map((b) => b.glyph);
  check('the Gannet Rock braziers follow the shanty (gannet, morning, lost, drowned)', order.join() === 'gannet,sun,mast,eye', order);
  const hob = all((e) => e.type === 'npc' && (e.keywords || []).some((k) => /FIRST light the gannet/.test(k.text || ''))).length;
  check('…and the shanty is sung in Pebblewick and by the keeper', hob >= 3, hob);
  // the riddles have fair answers
  const face = all((e) => e.id === 'abbey_face')[0], sphinx = all((e) => e.id === 'ember_sphinx')[0];
  check('the riddles take sensible answers', face.answers.includes('lantern') && sphinx.answers.includes('footsteps'), null);
}

// ------------------------------------------------------------ the difficulty, fought out
// (real battles at each point of the story, with the company a player has there)
if (!process.env.NO_SIM) {
  const rows = await simulate(parseInt(process.env.SIM_N, 10) || 12, 4242);
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const r of rows) console.log(`   ${r.name.padEnd(38)} L${r.level} ×${1 + r.with.length}  win ${pct(r.win).padStart(4)}  health lost ${pct(r.lost).padStart(4)}  fallen ${r.dead.toFixed(1)}`);
  const solo = rows.filter((r) => r.with.length === 0);
  check('the first hour alone is gentle: a lone castaway wins its fights', solo.every((r) => r.win >= r.min), solo.map((r) => [r.name, r.win]));
  const off = rows.filter((r) => r.win < r.min || r.win > r.max || (r.lostMin && r.lost < r.lostMin));
  check('every key fight is winnable but not trivial for the company a player has there', !off.length, off.map((r) => [r.name, Math.round(r.win * 100), Math.round(r.lost * 100)]));
  const bosses = rows.filter((r) => /Snapper|Grubnose|Gaff|Jory|Morcant|Serpent|Nhalia the/.test(r.name));
  check('…and the bosses cost the company real blood (a fifth of its health or more)', bosses.every((r) => r.lost >= 0.2), bosses.map((r) => [r.name, Math.round(r.lost * 100)]));
}
if (process.env.SIM_ONLY) process.exit(fails ? 1 : 0);

// ------------------------------------------------------------ in the page
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
// (the whole world at once is a heavy frame for a software renderer: give it time)
const shot = async (name, keep = false) => {
  if (!keep) await page.evaluate(async () => { if (window.__L) await window.__L.close(); });
  await page.screenshot({ path: `${OUT}/adv2-${name}.png`, timeout: 240000 }); console.log('shot', `adv2-${name}`);
};
// a town from above its square, its people about it
const townView = (zoom = 30) => page.evaluate((zoom) => { const s = window.__app.session; s.map.explored?.fill(1); s.view.setVisibilityEnabled(false); window.__L?.day(); s.view.reach = null; s.view.setZoom(zoom, true); s.view.focus(s.map.w / 2, s.map.h / 2 + 1, true); s.camFocus = () => {}; }, zoom);
const closeModals = () => ev(async () => { for (let i = 0; i < 10 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 120)); } });

const installHelpers = () => installPlayHelpers(page);

try {
  // ---------------------------------------------------------- the title, and a lone hero's creation
  await wait(800);
  const titleBtns = await ev(() => [...document.querySelectorAll('.title-menu button')].map((b) => b.textContent));
  check('the title screen offers both adventures', titleBtns.some((t) => /Shadow over Eldmark/.test(t)) && titleBtns.some((t) => /Lanterns of the Glass Sea/.test(t)), titleBtns);
  await shot('title');
  const listed = await ev(() => window.__app.allAdventures().filter((a) => a.builtin).map((a) => a.game.id));
  check('the adventure list has both built-in adventures', listed.includes('sample_shadow_over_eldmark') && listed.includes('sample_lanterns_of_the_glass_sea'), listed);
  await ev(() => { const app = window.__app; app.playGame(app.lanterns, {}); });
  await wait(2500);
  const create = await ev(() => document.querySelector('.ch-title')?.textContent || '');
  check('a new game asks for one hero ("Create Your Hero")', /Create Your Hero/.test(create), create);
  await shot('create', true);
  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
  await wait(800);

  // ---------------------------------------------------------- the walk, with a lone castaway
  await ev(async () => {
    const app = window.__app;
    app.playGame(app.lanterns, { quick: true, noSave: true });
    for (let i = 0; i < 1600; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 50)); }
  });
  await closeModals();
  await installHelpers();
  await wait(600);
  const begin = await ev(() => { const s = window.__app.session; return { map: s.map.name, q: s.state.quests.q_main, heroes: s.party.members.length, cls: s.party.members[0].cls, chapter: Object.keys(s.state.chapters || {}) }; });
  check('one castaway on the strand, the main quest begun', begin.heroes === 1 && begin.map === 'The Glass Sea Lands' && begin.q?.stage === 0 && begin.chapter.includes('ch_ashore'), begin);
  await shot('start');

  // Pebblewick: Nan, Kit (not yet), Ezra
  let r = await ev(async () => {
    const L = window.__L, s = L.S(), Q = window.__quests;
    s.party.food = 900; // (the walk covers weeks of road in minutes: no starving on the way)
    await L.enter('Pebblewick');
    L.talk('npc_nan');
    Q.startQuest(s, 'q_tobias'); Q.startQuest(s, 'q_nets');
    const kitSays = await L.join('npc_kit');
    return { stage: L.stage(), kitSays, party: s.party.members.length };
  });
  check('Nan sends the castaway up Gannet Rock', r.stage === 1, r);
  check('Kit will not come until her father is found', /Da/.test(r.kitSays) && r.party === 1, r);
  await townView(26);
  await wait(1200);
  await shot('pebblewick');

  // Gannet Rock: the braziers, lit wrong and then right
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    await L.enter('Gannet Rock Light');
    const out = { stage0: L.stage() };
    await L.bump('gannet_br_dawn'); // the morning first: out of turn
    out.wrong = { lit: L.ent('gannet_br_dawn').lit, flag: L.flag('lantern_gannet'), seq: s.mapState(s.map.id).pz?.['seq:lantern_gannet'] || 0 };
    for (const id of ['gannet_br_gannet', 'gannet_br_dawn', 'gannet_br_gone', 'gannet_br_drowned']) { out[id] = await L.bump(id); await L.sleep(200); }
    const lamp = L.ent('gannet_lamp');
    out.lit = ['gannet_br_gannet', 'gannet_br_dawn', 'gannet_br_gone', 'gannet_br_drowned'].map((id) => L.ent(id).lit);
    out.flag = L.flag('lantern_gannet');
    out.lampTile = window.__travel.terrain(s.map.tiles[(lamp.y - 1) * s.map.w + lamp.x]).key;
    await L.sleep(300);
    out.stage = L.stage();
    L.talk('npc_tobias');
    out.oil = await L.stepOn('chest_gannet_oil');
    out.clue = L.flag('clue_oil');
    L.kill('old_snapper');
    s.view.focus(lamp.x, lamp.y - 1, true); s.view.setZoom(13, true);
    return out;
  });
  check('a brazier lit out of turn gutters out (the shanty\'s order matters)', !r.wrong.lit && !r.wrong.flag && r.wrong.seq === 0, r.wrong);
  check('lit in the shanty\'s order — gannet, morning, lost, drowned — the great lamp catches', r.lit.every(Boolean) && r.flag && r.lampTile === 'brazier' && r.stage === 3, r);
  check('the oil casks give the first clue', r.oil && r.clue, r);
  await wait(900);
  await shot('gannet-lamp');

  // home: Nan's letter; Kit joins, Ezra pays
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    await L.enter('Pebblewick');
    L.talk('npc_nan'); L.talk('npc_kit'); L.talk('npc_ezra');
    const kit = await L.join('npc_kit');
    return { stage: L.stage(), letter: s.party.inventory.nan_letter, kit, party: s.party.members.map((m) => m.name), shell: s.party.inventory.selkie_shell };
  });
  check('Nan gives her letter, and Kit joins the company', r.stage === 4 && r.letter === 1 && r.kit === 'joined' && r.party.includes('Kit Penhallow'), r);
  check('Ezra pays for Old Snapper with the selkie\'s shell', r.shell === 1, r);

  // Thornby: the goblin-king, and Thrain
  r = await ev(async () => {
    const L = window.__L, s = L.S(), Q = window.__quests;
    await L.enter('Thornby');
    Q.startQuest(s, 'q_warren');
    L.kill('grubnose');
    L.talk('npc_reeve');
    return { thrain: await L.join('npc_thrain'), party: s.party.members.length };
  });
  check('Thrain joins once the warren is cleared', r.thrain === 'joined' && r.party === 3, r);

  // Saltcombe: the letter to the Magistrate, Wren, Pip; the judge will not hear an accusation yet
  r = await ev(async () => {
    const L = window.__L, s = L.S(), Q = window.__quests;
    await L.enter('Saltcombe');
    await L.sleep(400);
    s.companyTick('map'); await L.sleep(200);
    const said = Object.keys(s.state.company?.said || {});
    L.talk('npc_thorne');
    const early = L.say('npc_thorne', 'ACCUSE').text;
    const wren = await L.join('npc_wren');
    L.say('npc_pip', 'LAUNCH');
    Q.startQuest(s, 'q_mags');
    const known = window.__company.knownMysteries(s).map((m) => m.id);
    return { stage: L.stage(), early, wren, pip: L.flag('clue_pip'), said, known };
  });
  check('the Magistrate takes Nan\'s letter and opens the case', r.stage === 5 && r.known.includes('mys_lanterns'), r);
  check('…but will hear no accusation without the Queen\'s warrant', /warrant/i.test(r.early), r.early);
  check('Wren joins at once; Pip tells of the launch (a clue)', r.wren === 'joined' && r.pip, r);
  check('Kit has a word as the company comes into Saltcombe (banter)', r.said.includes('npc_kit#1'), r.said);
  await townView(28);
  await wait(1200);
  await shot('saltcombe');

  // the Wreckers' Hole: two heroes on two plates raise the flood-gate
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    await L.enter('The Wreckers\' Hole');
    const gate = L.ent('wh_gate');
    const out = { shut: !gate._open };
    // (all together into the plate room, then each to a plate)
    out.there = await L.walk(L.ent('wh_boulder').x, L.ent('wh_boulder').y + 1);
    const pa = L.ent('wh_plate_a'), pb = L.ent('wh_plate_b');
    const first = L.aloneTo(pa.x, pa.y);
    out.a = await L.stepOn('wh_plate_a');
    out.half = gate._open;
    L.aloneTo(pb.x, pb.y, [first]);
    out.b = await L.stepOn('wh_plate_b');
    out.open = gate._open;
    L.aloneTo(L.ent('chest_ledger').x, L.ent('chest_ledger').y);
    out.ledger = await L.walk(L.ent('chest_ledger').x, L.ent('chest_ledger').y);
    out.clue = L.flag('clue_ledger'); out.item = s.party.inventory.wreckers_ledger;
    L.kill('gaff_hollis');
    L.alone(null);
    return out;
  });
  check('the flood-gate stays shut with one plate pressed, and rises with two heroes on both', r.shut && r.a && !r.half && r.b && r.open, r);
  check('Gaff\'s strongbox holds the ledger (a clue)', r.ledger && r.clue && r.item === 1, r);

  // Mags walks free; the Queen's warrant; Red Jory, and Sir Garrick
  r = await ev(async () => {
    const L = window.__L, s = L.S(), Q = window.__quests;
    await L.enter('Saltcombe');
    L.talk('npc_mags');
    const mags = await L.join('npc_mags');
    await L.enter('Highcrown');
    L.talk('npc_rosamund');
    Q.startQuest(s, 'q_jory'); L.kill('red_jory'); L.talk('npc_garrick');
    const garrick = await L.join('npc_garrick');
    return { mags, garrick, stage: L.stage(), warrant: L.flag('warrant_given'), party: s.party.members.length };
  });
  check('Mags joins once her name is cleared; the Queen gives her warrant; Sir Garrick joins after Red Jory', r.mags === 'joined' && r.garrick === 'joined' && r.stage === 6 && r.warrant && r.party === 6, r);

  // Mistwatch Abbey: the riddle typed at the stone face, then bell, book and candle
  r = await ev(async () => {
    const L = window.__L;
    await L.enter('Mistwatch Abbey');
    await L.bump('abbey_face');
    await L.sleep(400);
    return { open: !!document.querySelector('.riddle-input'), hp: L.S().party.members.reduce((t, m) => t + m.hp, 0) };
  });
  check('bumping the face of St Aldhelm asks its riddle', r.open, r);
  await page.fill('.riddle-input', 'a candle');
  await page.press('.riddle-input', 'Enter');
  await wait(400);
  const hurt = await ev(() => ({ hp: window.__L.S().party.members.reduce((t, m) => t + m.hp, 0), solved: window.__L.flag('abbey_riddle') }));
  await page.fill('.riddle-input', 'A Lantern!');
  await page.press('.riddle-input', 'Enter');
  await wait(400);
  await shot('abbey-riddle', true);
  const right = await ev(async () => { const L = window.__L; const ok = L.flag('abbey_riddle'); await L.close(); await L.idle(); return { ok, door: L.ent('abbey_crypt_door')._open }; });
  check('a wrong answer costs blood; "A Lantern!" opens the crypt door', hurt.hp < r.hp && !hurt.solved && right.ok && right.door, { r, hurt, right });
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    const out = { x0: L.ent('abbey_gate_crypt')._open };
    // the rite on the wall: ring the bell, close the book, snuff the candle
    out.bell = await L.bump('abbey_bell');
    out.book = await L.bump('abbey_book');
    out.candle = await L.bump('abbey_candle');
    out.x1 = L.ent('abbey_gate_crypt')._open;
    const lec = L.ent('ev_abbey_letter');
    out.reach = await L.walk(lec.x, lec.y, true);
    L.choose('ev_abbey_letter', 'Take');
    out.clue = L.flag('clue_letter');
    L.kill('abbot_morcant');
    s.companyTick('map'); await L.sleep(100);
    out.said = Object.keys(s.state.company.said);
    return out;
  });
  check('bell, book and candle, pulled in the rite\'s order, open the Abbot\'s gate', !r.x0 && r.bell && r.book && r.candle && r.x1 && r.reach, r);
  check('the abbot\'s lectern holds the letter (a clue)', r.clue, r);
  check('Wren lets slip she has been in the abbey before (banter)', r.said.includes('npc_wren#3'), r.said);
  await shot('abbey-maze');

  // the accusation: wrong, then right; Wren runs; Vane is gone from his hall
  r = await ev(async () => {
    const L = window.__L, s = L.S(), C = window.__company;
    await L.enter('Saltcombe');
    const ask = L.say('npc_thorne', 'ACCUSE');
    const gold0 = s.party.gold;
    const wrong = C.accuse(s, 'mys_lanterns', 'npc_grell');
    const lost = gold0 - s.party.gold;
    const again = C.canAccuse(s, C.mysteryById ? C.mysteryById(s.game, 'mys_lanterns') : s.game.mysteries[0]);
    const desk = L.ent('chest_grell_books');
    await L.walk(desk.x, desk.y);
    const grell = L.flag('clue_grell');
    const right = C.accuse(s, 'mys_lanterns', 'npc_vane');
    s.companyTick(); await L.sleep(1200); s.companyTick(); await L.sleep(300);
    return { ask: ask.action?.type, wrong: { right: wrong.right, lost, flag: L.flag('accused_wrong') }, again: again.reason, grell, right: right.right, stage: L.stage(),
      wrenGone: !L.member('npc_wren'), left: L.flag('left_npc_wren'), vaneHere: !!L.ent('npc_vane') };
  });
  check('with clues enough and the warrant, the Magistrate hears an accusation', r.ask === 'accuse', r);
  check('a wrong accusation costs gold, and the judge wants a new clue before the next', r.wrong.right === false && r.wrong.lost === 40 && r.wrong.flag && r.again === 'again', r);
  check('a new clue (Grell\'s desk), then the right name: Vane is unmasked and flees', r.grell && r.right && r.stage === 7 && !r.vaneHere, r);
  check('Wren leaves the company when her uncle is unmasked (the betrayal)', r.wrenGone && r.left, r);

  // the Black Gull, the Midway Light
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    const w = s.game.maps[0], gull = w.entities.find((e) => e.id === 'ev_black_gull');
    await L.enter(w.name, { x: gull.x, y: gull.y + 1 });
    const res = L.choose('ev_black_gull', 'Take');
    const ship = s.map.entities.find((e) => e.type === 'ship');
    await L.enter('The Midway Light');
    const chain = await L.bump('midway_chain');
    const lamp = L.ent('midway_lamp');
    await L.sleep(300);
    return { bought: !!ship && res.success !== false, chain, flag: L.flag('lantern_midway'), tile: window.__travel.terrain(s.map.tiles[(lamp.y - 1) * s.map.w + lamp.x]).key, stage: L.stage() };
  });
  check('Mags\'s Black Gull, for a crown', r.bought, r);
  check('the lamp-chain lights the Midway Light', r.chain && r.flag && r.tile === 'brazier' && r.stage === 8, r);

  // Ixara: Landfall and Elowen; Tzal-Ka, the eggs and the rhyme
  r = await ev(async () => {
    const L = window.__L, s = L.S(), Q = window.__quests;
    const w = s.game.maps[0];
    await L.enter('Landfall');
    const stage = L.stage();
    Q.startQuest(s, 'q_notes');
    const sat = w.entities.find((e) => e.id === 'chest_elowen');
    const spots = w.entities.find((e) => e.monster === 'old_spots'); if (spots) s.mapState(w.id).removed.push(spots.id);
    await L.enter(w.name, { x: sat.x + 1, y: sat.y }); const got = await L.walk(sat.x, sat.y);
    await L.enter('Landfall');
    L.talk('npc_elowen');
    s.restMember(L.member('npc_thrain'));
    const elowen = await L.join('npc_elowen');
    await L.enter('Tzal-Ka');
    L.talk('npc_ssura');
    Q.startQuest(s, 'q_eggs');
    const eggs = w.entities.find((e) => e.id === 'chest_eggs');
    const mother = w.entities.find((e) => e.monster === 'fen_mother'); if (mother) s.mapState(w.id).removed.push(mother.id);
    await L.enter(w.name, { x: eggs.x + 1, y: eggs.y }); const egg = await L.walk(eggs.x, eggs.y);
    await L.enter('Tzal-Ka');
    L.talk('npc_ithiss');
    const rhyme = L.say('npc_ithiss', 'RHYME').text;
    const look = L.ent('npc_ssura').look;
    return { stage, got, elowen, egg, rhyme, heard: L.flag('heard_rhyme'), stage2: L.stage(), look: look.race, party: s.party.members.map((m) => m.name) };
  });
  check('landfall on Ixara; Elowen\'s journal from the Old Lantern, and she joins', r.stage === 9 && r.got && r.elowen === 'joined', r);
  check('the Elder of Tzal-Ka (a lizardfolk, drawn as one)', r.stage2 === 10 && r.look === 'lizard', r);
  check('the stolen eggs home, and the Hatch-mother sings the rhyme', r.egg && r.heard && /WAVE.*MOON.*STAR.*SUN.*FLAME/.test(r.rhyme), r);
  await townView(28);
  await wait(1200);
  await shot('tzalka');

  // the Sunken Temple: the rhyme stepped wrong, then right; one hero and the sun-stone on the plates
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    await L.enter('Sunken Temple of the Sun');
    const out = {};
    // (all together into the glyph hall, then the castaway steps it out alone)
    const door = L.ent('temple_door');
    out.there = await L.walk(door.x, door.y + 2);
    const hp0 = s.party.members.reduce((t, m) => t + m.hp, 0);
    out.sunFirst = await L.stepOn('temple_rune_sun');
    out.reset = (s.mapState(s.map.id).pz?.['seq:temple_runes'] || 0) === 0 && !L.ent('temple_rune_sun').lit;
    out.hurt = s.party.members.reduce((t, m) => t + m.hp, 0) < hp0;
    L.alone(0);
    for (const g of ['wave', 'moon', 'star', 'sun', 'flame']) out[g] = await L.stepOn('temple_rune_' + g);
    out.runes = L.flag('temple_runes');
    out.door = L.ent('temple_door')._open;
    // the fallen sun-stone onto the sun-plate, the castaway alone on the moon-plate
    const pa = L.ent('temple_plate_a');
    out.pushed = await L.push('temple_boulder', pa.x, pa.y + 1) && await L.push('temple_boulder', pa.x, pa.y);
    out.plateA = L.flag('temple_plate_a');
    out.onB = await L.stepOn('temple_plate_b');
    out.sanctum = L.ent('temple_sanctum')._open;
    L.kill('serpent_priest');
    const ts = L.ent('chest_tide_stone');
    out.stone = await L.walk(ts.x, ts.y);
    const sk = L.ent('chest_sun_key');
    out.key = await L.walk(sk.x, sk.y);
    const offer = s.map.entities.find((e) => e.type === 'chest' && (e.items || []).some((i) => i.id === 'liesl_locket'));
    out.locket = await L.walk(offer.x, offer.y);
    out.items = ['tide_stone', 'sun_key', 'liesl_locket'].map((id) => s.party.inventory[id] || 0);
    out.stage = L.stage();
    s.view.focus(L.ent('temple_door').x, L.ent('temple_door').y + 2, true); s.view.setZoom(14, true);
    return out;
  });
  check('a glyph stepped out of turn puts them all out, and stings', r.sunFirst && r.reset && r.hurt, r);
  check('stepped in the rhyme\'s order — wave, moon, star, sun, flame — the Door of the Sun sinks', ['wave', 'moon', 'star', 'sun', 'flame'].every((g) => r[g]) && r.runes && r.door, r);
  check('one hero alone: the sun-stone rolled onto one plate, the hero on the other, and the sanctum opens', r.pushed && r.plateA && r.onB && r.sanctum, r);
  check('the Tide Stone, the Sun-Key and Liesl\'s locket', r.stone && r.key && r.locket && r.items.every((n) => n === 1) && r.stage === 11, r);
  await wait(5000); // (the chapter's banner fades)
  await shot('temple-puzzle');

  // the waygate home and back; the Drowned Causeway
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    const w = s.game.maps[0];
    const wg = w.entities.find((e) => e.id === 'waygate_temple');
    await L.enter(w.name, { x: wg.x, y: wg.y + 1 });
    await L.go(0, -1); await L.sleep(600); await L.idle();
    const ab = w.entities.find((e) => e.id === 'waygate_abbey');
    const home = Math.abs(L.pos().x - ab.x) + Math.abs(L.pos().y - ab.y) <= 2;
    const plinth = w.entities.find((e) => e.id === 'ev_tide_plinth');
    await L.enter(w.name, { x: plinth.x + 1, y: plinth.y });
    L.choose('ev_tide_plinth', 'Set');
    s.puzzles.evaluate(); await L.sleep(1500);
    const trig = w.entities.find((e) => e.id === 'causeway_trigger');
    const mid = trig.tiles[Math.floor(trig.tiles.length / 2)];
    const tile = window.__travel.terrain(s.map.tiles[mid.y * s.map.w + mid.x]).key;
    const pal = w.entities.find((e) => e.type === 'portal' && e.label === 'The Drowned Palace');
    const across = await L.walk(pal.x, pal.y, true);
    L.day(); s.view.focus(mid.x, mid.y, true); s.view.setZoom(22, true);
    return { home, stage: L.stage(), tile, across, pos: L.pos() };
  });
  check('the Sun-Key wakes the waygate: from the temple to Mistwatch Abbey in a step', r.home, r);
  check('the Tide Stone in its plinth: the sea draws back and the causeway rises', r.stage === 12 && r.tile === 'ruins_floor', r);
  check('…and the company walks across it to the palace on the reef', r.across, r);
  await wait(1200);
  await shot('causeway');

  // the Drowned Palace: Vane in chains, Wren, the locket, and the Queen
  r = await ev(async () => {
    const L = window.__L, s = L.S();
    await L.enter('The Drowned Palace');
    const out = { vane: !!L.ent('npc_vane_chained'), wren: !!L.ent('npc_wren'), greet: L.ent('npc_wren')?.greeting };
    out.before = await L.join('npc_wren');
    L.say('npc_wren', 'LOCKET');
    out.forgives = L.flag('wren_forgives');
    out.after = await L.join('npc_wren');
    out.wrenLevel = L.member('npc_wren')?.level;
    s.companyTick(); await L.sleep(200);
    s.state.company.lastBanter = -999; s.companyTick(); await L.sleep(200);
    out.said = Object.keys(s.state.company.said);
    L.kill('drowned_queen');
    await L.sleep(800);
    out.stage = L.stage();
    out.won = !!document.querySelector('.victory, .modal-back');
    return out;
  });
  check('in the palace: Vane in chains (now he is here), and Wren, with new words', r.vane && r.wren && /came/.test(r.greet || ''), r);
  check('Wren will not come back without proof; Liesl\'s locket brings her back as she was', /show me/.test(r.before) && r.forgives && r.after === 'joined' && r.wrenLevel >= 3, r);
  check('slaying the Drowned Queen ends the tale, and the game is won', r.stage === 'done' && r.won, r);
  const said = r.said.length;
  check('companions spoke on the road (banter): at least six lines', said >= 6, r.said);
  await shot('victory', true);
  await closeModals();

  // ---------------------------------------------------------- pictures
  await ev(() => { const s = window.__app.session; for (const m of s.party.members) { m.status = 'ok'; m.hp = window.__skills.maxHp(s.game, m); } s.ui?.refresh?.(); });
  const overview = async (name, x, y, zoom, pitch = 60) => {
    await ev(async ({ x, y, zoom, pitch }) => {
      const s = window.__app.session, v = s.view;
      if (s.map.type !== 'world') { await s.enterMap(s.game.maps[0].id, s.game.settings.start.x, s.game.settings.start.y); for (let i = 0; i < 400 && s.transitioning; i++) await new Promise((r) => setTimeout(r, 25)); }
      s.map.explored?.fill(1);
      // (pictures by mid-morning light)
      s.state.turn = Math.floor((s.state.turn || 0) / 300) * 300 + 375; s.applyDaylight?.();
      v.reach = null;
      v.setVisibilityEnabled(false);
      v.setPitch(pitch);
      v.setZoom(zoom, true);
      v.focus(x, y, true);
      s.camFocus = () => {};
      await new Promise((r) => setTimeout(r, 1500));
    }, { x, y, zoom, pitch });
    await closeModals();
    await wait(1500);
    await shot(name);
  };
  await overview('world', 88, 84, 175, 70);
  await overview('merrow', 40, 82, 100, 62);
  await overview('ixara', 134, 80, 100, 62);
  await overview('ixara-coast', 106, 96, 22, 50);
  await overview('volcano', 148, 36, 30, 50);
  await overview('reef', 156, 132, 30, 52);
  const placeShot = async (name, map, zoom, at) => {
    await ev(async ({ map, zoom, at }) => {
      const s = window.__app.session, m = s.game.maps.find((x) => x.name === map);
      await s.enterMap(m.id, m.entry.x, m.entry.y);
      for (let i = 0; i < 400 && s.transitioning; i++) await new Promise((r) => setTimeout(r, 25));
      s.view.reach = null;
      s.state.turn = Math.floor((s.state.turn || 0) / 300) * 300 + 375; s.applyDaylight?.();
      s.view.setZoom(zoom, true);
      if (at) s.view.focus(at.x, at.y, true); else s.view.focus(s.state.pos.x, s.state.pos.y - 4, true);
      s.camFocus = () => {};
      await new Promise((r) => setTimeout(r, 1500));
    }, { map, zoom, at });
    await closeModals();
    await wait(1200);
    await shot(name);
  };
  await placeShot('palace', 'The Drowned Palace', 16);
  await placeShot('ember', 'The Ember Vault', 16);
  // a frame's cost on the big world
  const cost = await ev(async () => {
    const s = window.__app.session;
    await s.enterMap(s.game.maps[0].id, s.game.settings.start.x, s.game.settings.start.y);
    for (let i = 0; i < 400 && s.transitioning; i++) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 1500));
    const info = s.view.renderer?.info?.render;
    return { calls: info?.calls, triangles: info?.triangles };
  });
  console.log('   world frame:', JSON.stringify(cost));
} catch (e) {
  check('the page run finished', false, e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | '));
}
check('no errors in the page', !errors.length, errors.slice(0, 6));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
