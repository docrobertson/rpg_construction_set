// The second built-in adventure, "The Lanterns of the Glass Sea"
// (src/data/lanterns.js): built and checked in node first — the brief's
// checklist, the Construction Set's own checklist, every map reachable, the
// puzzles solvable from their hints — then played in the page: the main
// quest walked step by step (teleporting and resolving events by script),
// every companion recruited, and screenshots of the world, both lands, the
// starting village, a town and a dungeon.
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
const shot = async (name) => { await page.screenshot({ path: `${OUT}/adv2-${name}.png`, timeout: 240000 }); console.log('shot', `adv2-${name}`); };
const closeModals = () => ev(async () => { for (let i = 0; i < 10 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 120)); } });

try {
  // the title screen offers the new voyage beside the old one
  await wait(800);
  const titleBtns = await ev(() => [...document.querySelectorAll('.title-menu button')].map((b) => b.textContent));
  check('the title screen offers both adventures', titleBtns.some((t) => /Shadow over Eldmark/.test(t)) && titleBtns.some((t) => /Lanterns of the Glass Sea/.test(t)), titleBtns);
  const listed = await ev(() => window.__app.allAdventures().filter((a) => a.builtin).map((a) => a.game.id));
  check('the adventure list has both built-in adventures', listed.includes('sample_shadow_over_eldmark') && listed.includes('sample_lanterns_of_the_glass_sea'), listed);

  // ---------------------------------------------------------- a quick game, walked through
  await ev(async () => {
    const app = window.__app;
    app.playGame(app.lanterns, { quick: true, noSave: true });
    for (let i = 0; i < 1200; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 50)); }
  });
  await closeModals();
  await wait(600);
  const begin = await ev(() => { const s = window.__app.session; return { map: s.map.name, q: s.state.quests.q_main, heroes: s.party.members.length, chapter: Object.keys(s.state.chapters || {}) }; });
  check('the game begins on the strand with the main quest', begin.map === 'The Glass Sea Lands' && begin.q?.stage === 0 && begin.chapter.includes('ch_ashore'), begin);
  await shot('start');

  // the walk: each step done by script, the quest's step checked after it
  const walk = await ev(async () => {
    const s = window.__app.session, g = s.game, Q = window.__quests, E = window.__events;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const mapOf = (name) => g.maps.find((m) => m.name === name);
    const go = async (name, at) => { const m = mapOf(name); await s.enterMap(m.id, at?.x ?? m.entry.x, at?.y ?? m.entry.y); for (let i = 0; i < 200 && s.transitioning; i++) await sleep(25); };
    const find = (id) => s.map.entities.find((e) => e.id === id);
    const talk = (id) => Q.onTalk(s, find(id));
    const choose = (id, label) => { const e = find(id); const c = e.choices.find((x) => x.label.startsWith(label)); return E.resolveChoice(s, e, c); };
    const stage = () => (s.state.quests.q_main.status === 'done' ? 'done' : s.state.quests.q_main.stage);
    const log = [];
    const step = async (what, fn) => { try { await fn(); } catch (e) { log.push(`${what}: ${e.message}`); } Q.checkQuests(s); log.push([what, stage()]); };
    // (a lone hero, as the company stream will make it)
    s.party.members.length = 1;
    for (const m of s.party.members) { m.level = 8; m.hp = 999; }
    await step('nan', async () => { await go('Pebblewick'); talk('npc_nan'); });
    await step('gannet', async () => go('Gannet Rock Light'));
    await step('lamp', async () => choose('ev_gannet_bypass', 'Light')); // PHASE2: the braziers themselves
    await step('tobias', async () => { talk('npc_tobias'); s.onMonsterKilled('old_snapper'); s.openChest(find('chest_gannet_oil')); });
    await step('nan again', async () => { await go('Pebblewick'); talk('npc_nan'); talk('npc_kit'); talk('npc_ezra'); });
    await step('magistrate', async () => { await go('Saltcombe'); talk('npc_thorne'); });
    await step('queen', async () => { await go('Highcrown'); talk('npc_rosamund'); });
    await step('clues', async () => {
      await go('Mistwatch Abbey');
      choose('ev_abbey_letter', 'Take');
      await go('Saltcombe');
      s.say(find('npc_pip'), 'LAUNCH');
      s.say(find('npc_thorne'), 'VANE'); // PHASE2: the mystery's ACCUSE
    });
    await step('midway', async () => { await go('The Midway Light'); choose('ev_midway_bypass', 'Knock'); }); // PHASE2: the lamp-chain lever
    await step('landfall', async () => go('Landfall'));
    await step('elder', async () => { await go('Tzal-Ka'); talk('npc_ssura'); });
    await step('tide stone', async () => { await go('Sunken Temple of the Sun'); s.openChest(find('chest_tide_stone')); s.openChest(find('chest_sun_key')); });
    const world = g.maps[0];
    const plinth = world.entities.find((e) => e.id === 'ev_tide_plinth');
    await step('plinth', async () => { await go(world.name, { x: plinth.x, y: plinth.y + 1 }); choose('ev_tide_plinth', 'Set'); });
    const cross = s.say(find('npc_tidepriest'), 'CROSS'); // PHASE2: the causeway trigger
    await sleep(100);
    await step('palace', async () => { await go('The Drowned Palace'); s.onMonsterKilled('drowned_queen'); });
    return { log, cross: cross.action?.type, flags: Object.keys(s.party.flags).filter((f) => !f.startsWith('_')) };
  });
  console.log('   walk:', walk.log.map((x) => (Array.isArray(x) ? `${x[0]}→${x[1]}` : x)).join('  '));
  const at = (what) => walk.log.find((x) => Array.isArray(x) && x[0] === what)?.[1];
  check('Nan sets the hero on the road', at('nan') === 1, walk.log);
  check('reaching Gannet Rock, relighting it, and back to Nan', at('gannet') === 2 && at('lamp') === 3 && at('nan again') === 4, walk.log);
  check('the letter to the Magistrate, then the Queen\'s warrant', at('magistrate') === 5 && at('queen') === 6, walk.log);
  check('the clues and the accusation unmask Vane', at('clues') === 7 && walk.flags.includes('vane_unmasked') && walk.flags.includes('clue_letter') && walk.flags.includes('clue_pip') && walk.flags.includes('clue_oil'), walk);
  check('the Midway Light, Landfall and the Elder', at('midway') === 8 && at('landfall') === 9 && at('elder') === 10, walk.log);
  check('the Tide Stone and the causeway', at('tide stone') === 11 && at('plinth') === 12 && walk.cross === 'teleport', walk);
  check('slaying the Drowned Queen finishes the tale', at('palace') === 'done', walk.log);
  const won = await ev(() => !!document.querySelector('.victory, .modal-back') || window.__app.session?.state?.won);
  check('…and the game is won', !!won, won);
  await closeModals();

  // ---------------------------------------------------------- every companion can be found and joins
  await ev(async () => { const app = window.__app; if (app.session) app.endPlay(false); app.playGame(app.lanterns, { quick: true, noSave: true }); for (let i = 0; i < 1200; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 50)); } });
  await closeModals();
  const joins = await ev(async () => {
    const s = window.__app.session, g = s.game, Q = window.__quests;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    s.party.members.length = 1;
    const go = async (name) => { const m = g.maps.find((x) => x.name === name); await s.enterMap(m.id, m.entry.x, m.entry.y); for (let i = 0; i < 200 && s.transitioning; i++) await sleep(25); };
    const find = (id) => s.map.entities.find((e) => e.id === id);
    const out = {};
    const join = (id) => { const n = find(id); const said = s.say(n, 'JOIN'); if (said.action?.type === 'join') s.recruit(n); out[id] = s.party.members.some((m) => m.fromNpc === id); };
    // (the chapters each companion's quest belongs to, opened)
    for (const ch of g.story.chapters) s.state.chapters[ch.id] = 0;
    const finish = (qid) => { Q.startQuest(s, qid); Q.completeQuest(s, qid); };
    await go('Pebblewick'); finish('q_tobias'); join('npc_kit');
    await go('Thornby'); finish('q_warren'); join('npc_thrain');
    await go('Saltcombe'); join('npc_wren'); finish('q_mags'); join('npc_mags');
    await go('Highcrown'); finish('q_jory'); join('npc_garrick');
    await go('Landfall');
    // (the company is full at six: the scholar waits at the inn)
    const lodged = () => (s.state.reserve || []).some((r) => r.member.fromNpc === 'npc_elowen');
    finish('q_notes'); { const n = find('npc_elowen'); const said = s.say(n, 'JOIN'); if (said.action?.type === 'join') s.recruit(n, { toInn: true }); out.npc_elowen = s.party.members.some((m) => m.fromNpc === 'npc_elowen') || lodged(); }
    out.size = s.party.members.length;
    return out;
  });
  check('every companion joins once their reason is met', ['npc_kit', 'npc_thrain', 'npc_wren', 'npc_mags', 'npc_garrick', 'npc_elowen'].every((id) => joins[id]) && joins.size === 6, joins);

  // ---------------------------------------------------------- pictures
  // the whole world from high above, then each land, with the fog lifted
  const overview = async (name, x, y, zoom, pitch = 60) => {
    await ev(async ({ x, y, zoom, pitch }) => {
      const s = window.__app.session, v = s.view;
      if (s.map.type !== 'world') { await s.enterMap(s.game.maps[0].id, s.game.settings.start.x, s.game.settings.start.y); for (let i = 0; i < 200 && s.transitioning; i++) await new Promise((r) => setTimeout(r, 25)); }
      s.map.explored?.fill(1);
      v.reach = null;
      v.setVisibilityEnabled(false);
      v.setPitch(pitch);
      v.setZoom(zoom, true);
      v.focus(x, y, true);
      s.camFocus = () => {};
      await new Promise((r) => setTimeout(r, 1500));
    }, { x, y, zoom, pitch });
    await wait(1500);
    await shot(name);
  };
  await closeModals();
  await ev(() => { document.querySelector('.play-ui, #ui')?.classList.add('shot-hide'); });
  await overview('world', 88, 84, 175, 70);
  await overview('merrow', 40, 82, 100, 62);
  await overview('ixara', 134, 80, 100, 62);
  await overview('glass-sea', 92, 64, 40, 52);
  const placeShot = async (name, map, zoom = 22) => {
    await ev(async ({ map, zoom }) => {
      const s = window.__app.session, m = s.game.maps.find((x) => x.name === map);
      await s.enterMap(m.id, m.entry.x, m.entry.y);
      for (let i = 0; i < 200 && s.transitioning; i++) await new Promise((r) => setTimeout(r, 25));
      s.map.explored?.fill(1);
      s.view.reach = null;
      // (a town from above its square; a dungeon by torchlight, round the company at its door)
      if (m.type !== 'dungeon') { s.view.setVisibilityEnabled(false); s.view.focus(m.w / 2, m.h / 2 + 2, true); } else s.view.focus(s.state.pos.x, s.state.pos.y - 3, true);
      s.view.setZoom(zoom, true);
      s.camFocus = () => {};
      await new Promise((r) => setTimeout(r, 1500));
    }, { map, zoom });
    await closeModals();
    await wait(1200);
    await shot(name);
  };
  await placeShot('pebblewick', 'Pebblewick', 30);
  await placeShot('saltcombe', 'Saltcombe', 36);
  await placeShot('tzalka', 'Tzal-Ka', 30);
  await placeShot('abbey', 'Mistwatch Abbey', 16);
  await placeShot('temple', 'Sunken Temple of the Sun', 16);
  // a frame's cost on the big world, against the sample's
  const cost = await ev(async () => {
    const s = window.__app.session;
    await s.enterMap(s.game.maps[0].id, s.game.settings.start.x, s.game.settings.start.y);
    for (let i = 0; i < 200 && s.transitioning; i++) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 1500));
    const info = s.view.renderer?.info?.render;
    return { calls: info?.calls, triangles: info?.triangles };
  });
  console.log('   world frame:', JSON.stringify(cost));
} catch (e) {
  check('the page run finished', false, e.message);
}
check('no errors in the page', !errors.length, errors.slice(0, 6));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
