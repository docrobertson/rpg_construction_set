// Puzzles: levers and gates, pressure plates held by heroes or boulders,
// boulders that push and block, riddles answered in words, rune sequences,
// braziers lit from a torch or by fire magic, triggers that raise a bridge;
// all of it surviving a save and reload. The Construction Set places and
// edits them, the checklist finds a gate nothing can open, and a planned
// dungeon can come with a puzzle room. Screenshots of the models and the
// rooms land in tests/out (pz-*.png).
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
const fails = [];
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || info === undefined ? '' : ' ' + JSON.stringify(info))); if (!ok) fails.push(name); };

// ---- in node: the generator makes a puzzle room only when asked
let genRoom = null;
{
  const G = await import('../src/world/generate.js');
  const P = await import('../src/world/places.js');
  const { deterministicIds } = await import('../src/core/util.js');
  const plan = { ...P.defaultPlan('fortress'), seed: 4242 };
  const none = deterministicIds(() => G.generateDungeon({ plan: { ...plan, puzzles: 0 }, seed: 4242 }).map);
  const plain = deterministicIds(() => G.generateDungeon({ plan: { ...plan }, seed: 4242 }).map);
  check('a plan without puzzles makes the very same dungeon as before', JSON.stringify(none) === JSON.stringify(plain));
  const kinds = (m) => m.entities.filter((e) => e.made === 'puzzle').map((e) => e.type).sort().join(',');
  for (const n of [1, 2, 3]) {
    const m = deterministicIds(() => G.generateDungeon({ plan: { ...plan, puzzles: n }, seed: 4242 }).map);
    const gates = m.entities.filter((e) => e.type === 'gate');
    check(`a plan with ${n} puzzle${n > 1 ? 's' : ''} makes ${n} gated side room${n > 1 ? 's' : ''}, each with what opens it and a chest behind`, gates.length === n && gates.every((g) => m.entities.some((e) => e.type === 'chest' && e.made === 'puzzle' && Math.abs(e.x - g.x) + Math.abs(e.y - g.y) <= 3)), kinds(m));
    if (n === 1) {
      const { terrain } = await import('../src/data/terrain.js');
      const lv = m.entities.find((e) => e.type === 'lever');
      const spot = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [lv.x + dx, lv.y + dy]).find(([x, y]) => terrain(m.tiles[y * m.w + x]).walk && !m.entities.some((e) => e.x === x && e.y === y));
      genRoom = { ...m, tiles: Array.from(m.tiles), _spot: spot };
    }
    if (n === 3) {
      check('the three are a lever, a boulder on a plate and a rune sequence (hinted on a carved pillar)', ['lever', 'plate', 'boulder', 'rune', 'event'].every((k) => m.entities.some((e) => e.made === 'puzzle' && e.type === k)), kinds(m));
      const inferred = P.planOf(m, 'fortress');
      check('the plan read back from such a dungeon counts its puzzles', inferred.puzzles === 3, inferred.puzzles);
    }
  }
}

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
await page.addInitScript(() => { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await page.addStyleTag({ content: '.qtrack,.qbanner-host,.chbanner-host{display:none!important}' });

// ---- needs and answers
const unit = await ev(() => {
  const P = window.__puzzles;
  const f = { a: true, b: true };
  return {
    needs: [P.needMet(f, ''), P.needMet(f, 'a,b'), !P.needMet(f, 'a,c'), P.needMet(f, 'c|b'), !P.needMet(f, '!a'), P.needMet(f, 'a,!c'), P.needMet(f, 'c|a, b'), !P.needMet({}, 'x')],
    answers: [P.answerMatches(['river'], 'A River'), P.answerMatches(['river'], "It's a river!"), P.answerMatches(['a river'], 'river'), P.answerMatches(['echo'], 'Echoes'), !P.answerMatches(['river'], 'a mountain'), !P.answerMatches(['river'], '')],
  };
});
check('needs: all of a,b; any of a|b; !a for "not"; empty is always met', unit.needs.every(Boolean), unit.needs);
check('answers match without case, articles or punctuation ("A River" for river)', unit.answers.every(Boolean), unit.answers);

// ---- a test dungeon full of puzzles, added to the sample
// (x→) 0         1         2
//      012345678901234567890123
//  0   ########################
//  1   #.......#..............#
//  2   #...L...#...F..........#
//  3   #.......G..............#
//  4   #.......#.....b........#
//  5   #.......#...a...p......#   a, p: plates   b: boulder (pushes onto p)
//  6   #.......#..............#
//  7   ####H####......Q.......#   H: gate (plates), Q: brazier
//  8   #.......#..............#
//  9   #.1.2.3.#..CCCCC.......#   1-3: runes   C: chasm (a trigger bridges it)
// 10   #.......#..............#
// 11   #R......S..............#   R: riddle   S: gate (runes)
// 12   ########################
await ev(async () => {
  const app = window.__app;
  const g = app.sample;
  const W = 24, H = 13, F = 82, X = 83, C = 85;
  const tiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x === 8 && y !== 3 && y !== 11) || (y === 7 && x < 8 && x !== 4) ? X : F);
  for (let x = 11; x <= 15; x++) tiles[9 * W + x] = C;
  const ents = [
    { id: 'pzt_lever', type: 'lever', x: 4, y: 2, flag: 'pzt_lever_on' },
    { id: 'pzt_gate1', type: 'gate', x: 8, y: 3, need: 'pzt_lever_on', style: 'portcullis' },
    { id: 'pzt_plate_a', type: 'plate', x: 12, y: 5, flag: 'pzt_pa' },
    { id: 'pzt_plate_b', type: 'plate', x: 16, y: 5, flag: 'pzt_pb' },
    { id: 'pzt_boulder', type: 'boulder', x: 14, y: 4, group: 'pzt_rocks' },
    { id: 'pzt_reset', type: 'lever', x: 20, y: 2, reset: 'pzt_rocks', flag: 'pzt_reset_on' },
    { id: 'pzt_gate2', type: 'gate', x: 4, y: 7, need: 'pzt_pa,pzt_pb', style: 'bars' },
    { id: 'pzt_brazier', type: 'brazier', x: 15, y: 7, flag: 'pzt_fire' },
    { id: 'pzt_brazier2', type: 'brazier', x: 18, y: 7, flag: 'pzt_fire2' },
    { id: 'pzt_trigger', type: 'trigger', x: 13, y: 10, need: 'pzt_fire', tiles: [11, 12, 13, 14, 15].map((x) => ({ x, y: 9, t: 'bridge' })), text: 'A bridge of stone rises out of the chasm!' },
    { id: 'pzt_r1', type: 'rune', x: 2, y: 9, group: 'pzt_runes', order: 1, glyph: 'sun' },
    { id: 'pzt_r2', type: 'rune', x: 4, y: 9, group: 'pzt_runes', order: 2, glyph: 'moon' },
    { id: 'pzt_r3', type: 'rune', x: 6, y: 9, group: 'pzt_runes', order: 3, glyph: 'star' },
    { id: 'pzt_gate3', type: 'gate', x: 8, y: 11, need: 'pzt_runes', style: 'stone' },
    { id: 'pzt_riddle', type: 'riddle', x: 1, y: 11, look: 'face', text: 'I run but never walk, have a mouth but never talk, a bed but never sleep. What am I?', answers: ['river'], flag: 'pzt_riddle_ok', reward: { gold: 25 }, wrong: { text: 'The stone eyes flare. Pain lances through you!', hurt: '2' } },
  ];
  g.maps.push({ id: 'pzt_map', name: 'Hall of Trials', type: 'dungeon', w: W, h: H, tiles: Uint8Array.from(tiles), entities: ents, lighting: 'dark', battleground: false, exit: { map: g.maps[0].id, x: g.settings.start.x, y: g.settings.start.y }, entry: { x: 2, y: 3 } });
  app.playGame(g, { quick: true, noSave: true });
  await new Promise((r) => setTimeout(r, 1500));
  const s = app.session;
  s.game.settings.lineOfSight = false;
  await s.enterMap('pzt_map', 4, 3, { instant: true });
  // (the session is looked up afresh each time: a reload makes a new one)
  const S = () => window.__app.session;
  window.__idle = async (ms = 8000) => { for (let i = 0; i < ms / 20 && (S().busy || S().transitioning); i++) await new Promise((r) => setTimeout(r, 20)); };
  window.__go = async (dx, dy) => { await S().move(dx, dy); await window.__idle(); };
  window.__walk = async (path) => { for (const [dx, dy] of path) await window.__go(dx, dy); };
  window.__ent = (id) => S().map.entities.find((e) => e.id === id);
});
await wait(800);

// ---- a lever opens a gate
let r = await ev(async () => {
  const s = window.__app.session;
  const out = { before: window.__ent('pzt_gate1')._open, blocks0: !!s.blockingAt(8, 3) };
  await window.__go(0, -1); // bump the lever (it stands north)
  out.pos = { ...s.state.pos };
  out.on = window.__ent('pzt_lever').on;
  out.flag = !!s.party.flags.pzt_lever_on;
  out.open = window.__ent('pzt_gate1')._open;
  out.blocks1 = !!s.blockingAt(8, 3);
  out.part = !!s.view.entities.get('pzt_gate1')?.pzPart;
  return out;
});
check('a gate starts shut and holds its square', r.before === false && r.blocks0, r);
check('bumping the lever pulls it: its flag is set and the gate opens (the company stays put)', r.on && r.flag && r.open && !r.blocks1 && r.pos.x === 4 && r.pos.y === 3, r);
await wait(500);
await ev(() => window.__app.view.focus(6, 3, true));
await shot('pz-01-lever-gate');
r = await ev(async () => {
  const s = window.__app.session;
  await window.__go(0, -1); // pull it back up
  const shut = { flag: !!s.party.flags.pzt_lever_on, open: window.__ent('pzt_gate1')._open };
  // walk to the gate: barred
  await window.__walk([[1, 0], [1, 0], [1, 0]]);
  const at = { ...s.state.pos };
  await window.__go(1, 0);
  const barred = { ...s.state.pos };
  return { shut, at, barred, log: [...document.querySelectorAll('.log p, .log div')].slice(-2).map((e) => e.textContent).join(' | ') };
});
check('pulled back up, the flag clears and the gate shuts again', !r.shut.flag && !r.shut.open, r.shut);
check('a shut gate bars the way', r.at.x === 7 && r.barred.x === 7, r);
r = await ev(async () => {
  const s = window.__app.session;
  await window.__walk([[-1, 0], [-1, 0], [-1, 0]]);
  await window.__go(0, -1); // pull it again
  await window.__walk([[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]);
  return { pos: { ...s.state.pos } };
});
check('with the lever down the company walks through the gate', r.pos.x === 9 && r.pos.y === 3, r);

// ---- a boulder pushes, blocks and holds a plate down; two plates need two weights
r = await ev(async () => {
  const s = window.__app.session;
  const b = window.__ent('pzt_boulder');
  // (9,3) → (14,3), just north of the boulder at (14,4); push it south to (14,5)… not a plate.
  // Go round: stand west of it at (13,4) and push east twice: (15,4) then (16,4); then from (16,3) push south onto (16,5)
  await window.__walk([[1, 0], [1, 0], [1, 0], [1, 0], [0, 1]]); // (13,4)
  const by = { ...s.state.pos };
  await window.__go(1, 0); // push: boulder → (15,4), company → (14,4)
  const p1 = { b: [b.x, b.y], pos: { ...s.state.pos } };
  await window.__go(1, 0); // boulder → (16,4)
  await window.__walk([[0, -1], [1, 0]]); // (15,3) → (16,3)
  await window.__go(0, 1); // boulder → (16,5): onto the plate
  const p2 = { b: [b.x, b.y], pos: { ...s.state.pos }, pb: !!s.party.flags.pzt_pb, plate: window.__ent('pzt_plate_b').down, gate: window.__ent('pzt_gate2')._open };
  // into the wall? (16,5) → push south twice: (16,6), then (16,7)… then the brazier row; push it back north instead to test a block:
  const moved = s.mapState('pzt_map').moved.pzt_boulder;
  return { by, p1, p2, moved, blocks: s.blockingAt(16, 5)?.id };
});
check('walking into a boulder pushes it a square, and the company steps after it', r.p1.b[0] === 15 && r.p1.b[1] === 4 && r.p1.pos.x === 14, r.p1);
check('a boulder rolled onto a plate holds it down (one of two: the gate stays shut)', r.p2.b[0] === 16 && r.p2.b[1] === 5 && r.p2.pb && r.p2.plate && !r.p2.gate, r.p2);
check('a boulder holds its square, and where it was pushed is kept in the play state', r.blocks === 'pzt_boulder' && r.moved[0] === 16 && r.moved[1] === 5, r);
r = await ev(async () => {
  const s = window.__app.session;
  const b = window.__ent('pzt_boulder');
  // stuck: put another weight in the way — the boulder will not go through the wall either
  await window.__walk([[0, -1], [-1, 0], [-1, 0], [-1, 0], [-1, 0], [0, 1]]); // (16,4)→(16,3)→(12,3)→(12,4)
  const before = { pa: !!s.party.flags.pzt_pa, gate: window.__ent('pzt_gate2')._open };
  await window.__go(0, 1); // onto plate a at (12,5)
  const on = { pa: !!s.party.flags.pzt_pa, gate: window.__ent('pzt_gate2')._open, pos: { ...s.state.pos } };
  await window.__go(0, 1); // off it
  const off = { pa: !!s.party.flags.pzt_pa, gate: window.__ent('pzt_gate2')._open };
  void b;
  return { before, on, off };
});
check('a hero standing on the second plate opens the gate that wants both', !r.before.pa && r.on.pa && r.on.gate, r);
check('stepping off, the plate rises and the gate shuts again', !r.off.pa && !r.off.gate, r.off);
r = await ev(async () => {
  const s = window.__app.session;
  const b = window.__ent('pzt_boulder');
  // a boulder will not roll into a wall: push the boulder at (16,5) east? walk to (15,5) and push east → (17,5) fine.
  // Instead: push it north from (16,6) into (16,4), (16,3)… up to the wall at (16,0): it stops at (16,1)
  await window.__walk([[1, 0], [1, 0], [1, 0], [1, 0]]); // (12,6)→(16,6)
  for (let i = 0; i < 5; i++) await window.__go(0, -1);
  const top = [b.x, b.y];
  const pos = { ...s.state.pos };
  await window.__go(0, -1); // against the wall: no
  const still = [b.x, b.y];
  return { top, pos, still, pb: !!s.party.flags.pzt_pb };
});
check('pushed into a wall, a boulder stops (and the company with it); its plate rises when it rolls off', r.top[1] === 1 && r.still[1] === 1 && r.pos.y === 2 && !r.pb, r);
r = await ev(async () => {
  const s = window.__app.session;
  const b = window.__ent('pzt_boulder');
  // the reset lever (at 20,2) rolls the group's boulders home
  await window.__walk([[1, 0], [1, 0], [1, 0], [1, 0]]); // (16,2) → (20,2) is the lever: bump it
  const at = { ...s.state.pos };
  return { at, b: [b.x, b.y], moved: s.mapState('pzt_map').moved.pzt_boulder || null };
});
check('a lever with "reset" rolls its group\'s boulders back home', r.b[0] === 14 && r.b[1] === 4 && !r.moved, r);

// ---- braziers, and a trigger that raises a bridge
r = await ev(async () => {
  const s = window.__app.session;
  const inv = s.party.inventory;
  const torches0 = inv.torch || 0;
  inv.torch = 0;
  const fm = s.puzzles.fireMaker;
  s.puzzles.fireMaker = () => null; // (nobody with fire magic, for now)
  const br = window.__ent('pzt_brazier');
  const cold = s.puzzles.light(br);
  inv.torch = 2;
  const lit = s.puzzles.light(br);
  const out = { cold, lit, torches: inv.torch, flag: !!s.party.flags.pzt_fire, light: (s.view.terrain.puzzleLights || []).length, litMask: !!s.map.litMask[(br.y + 2) * s.map.w + br.x] };
  // the trigger: the bridge is up
  out.tiles = [11, 12, 13, 14, 15].map((x) => s.map.tiles[9 * s.map.w + x]);
  out.saved = s.mapState('pzt_map').tiles[9 * s.map.w + 13];
  s.puzzles.fireMaker = fm;
  // fire magic: the wizard kindles the second without a torch
  inv.torch = 0;
  const who = s.puzzles.fireMaker();
  const lit2 = s.puzzles.light(window.__ent('pzt_brazier2'));
  out.wizard = who?.m?.name; out.lit2 = lit2; out.flag2 = !!s.party.flags.pzt_fire2;
  inv.torch = torches0;
  return out;
});
check('a cold brazier will not light without a torch (or fire magic)', r.cold === false, r);
check('lit from a torch from the pack: the torch is spent, its flag set, its light shines', r.lit && r.torches === 1 && r.flag && r.light >= 1 && r.litMask, r);
check('a trigger waiting on the brazier raises a bridge over the chasm (kept in the play state)', r.tiles.every((t) => t === 14) && r.saved === 14, r);
check('a hero with fire magic lights a brazier without a torch', !!r.wizard && r.lit2 && r.flag2, r);
await ev(() => { const v = window.__app.view; v.focus(14, 8, true); });
await wait(900);
await shot('pz-02-bridge-braziers');

// ---- runes: in order sets the flag, out of order resets
r = await ev(async () => {
  const s = window.__app.session;
  // to the rune room: through gate 2 (open it with both plates: stand on a, boulder on b)
  s.party.flags.pzt_pa = true; s.party.flags.pzt_pb = true; s.puzzles.evaluate();
  await s.enterMap('pzt_map', 3, 10, { instant: true });
  const out = {};
  await window.__walk([[1, 0], [0, -1]]); // (4,10) → (4,9): rune 2 first: wrong
  out.wrong = { flag: !!s.party.flags.pzt_runes, lit: ['pzt_r1', 'pzt_r2', 'pzt_r3'].map((id) => window.__ent(id).lit), seq: s.mapState('pzt_map').pz['seq:pzt_runes'] || 0 };
  await window.__walk([[0, 1], [-1, 0], [-1, 0], [0, -1]]); // (2,9): rune 1
  out.one = { lit: ['pzt_r1', 'pzt_r2', 'pzt_r3'].map((id) => window.__ent(id).lit), seq: s.mapState('pzt_map').pz['seq:pzt_runes'] };
  await window.__walk([[0, 1], [1, 0], [1, 0], [0, -1]]); // (4,9): rune 2
  out.two = { lit: ['pzt_r1', 'pzt_r2', 'pzt_r3'].map((id) => window.__ent(id).lit) };
  return out;
});
check('a rune stepped on out of order flares and resets the group', !r.wrong.flag && r.wrong.lit.every((x) => !x) && r.wrong.seq === 0, r.wrong);
check('runes stepped on in order light one by one', r.one.lit.join() === 'true,false,false' && r.one.seq === 1 && r.two.lit.join() === 'true,true,false', r);
await wait(300);
await ev(() => window.__app.view.focus(4, 9, true));
await shot('pz-03-runes-mid-solve');
r = await ev(async () => {
  const s = window.__app.session;
  await window.__walk([[0, 1], [1, 0], [1, 0], [0, -1]]); // (6,9): rune 3
  return { flag: !!s.party.flags.pzt_runes, lit: ['pzt_r1', 'pzt_r2', 'pzt_r3'].map((id) => window.__ent(id).lit), gate: window.__ent('pzt_gate3')._open };
});
check('the last rune in order sets the group\'s flag, and the gate waiting on it opens', r.flag && r.lit.every(Boolean) && r.gate, r);

// ---- a riddle, answered in words
r = await ev(async () => {
  const s = window.__app.session;
  await window.__walk([[0, 1], [0, 1], [-1, 0], [-1, 0], [-1, 0], [-1, 0]]); // (6,9)→(6,11)→(2,11)
  const at = { ...s.state.pos };
  const hp0 = s.party.members.reduce((n, m) => n + m.hp, 0);
  await window.__go(-1, 0); // bump the stone face: it asks
  await new Promise((r2) => setTimeout(r2, 300));
  const modal = !!document.querySelector('.riddle-modal');
  const input = document.querySelector('.riddle-input');
  input.value = 'a mountain';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 200));
  const hp1 = s.party.members.reduce((n, m) => n + m.hp, 0);
  const wrong = { flag: !!s.party.flags.pzt_riddle_ok, hurt: hp1 < hp0, text: document.querySelector('.riddle-wrong')?.textContent };
  return { at, modal, wrong, gold0: s.party.gold };
});
check('bumping the riddle face opens the riddle, with a box to type the answer', r.at.x === 2 && r.modal, r);
check('a wrong answer is punished (the company is hurt) and the riddle stays unanswered', !r.wrong.flag && r.wrong.hurt && /Pain/.test(r.wrong.text || ''), r.wrong);
await page.fill('.riddle-input', 'A River');
await wait(200);
await shot('pz-04-riddle-dialog');
r = await ev(async (gold0) => {
  const s = window.__app.session;
  const input = document.querySelector('.riddle-input');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  const out = { flag: !!s.party.flags.pzt_riddle_ok, solved: window.__ent('pzt_riddle').solved, gold: s.party.gold - gold0, right: document.querySelector('.riddle-right')?.textContent };
  await new Promise((r2) => setTimeout(r2, 400));
  await page_snap();
  return out;
  function page_snap() { return Promise.resolve(); }
}, r.gold0);
check('"A River" answers "river": the flag is set and the reward paid', r.flag && r.solved && r.gold === 25 && !!r.right, r);
await shot('pz-05-riddle-answered');
await ev(() => document.querySelector('.riddle-modal .modal-buttons button')?.click());
await wait(300);

// ---- the hover card and the Nearby bar
r = await ev(async () => {
  const s = window.__app.session, ui = s.ui;
  const acts = ui.explore.nearby().map((a) => a.label);
  const d = ui.explore.describe({ kind: 'riddle', e: window.__ent('pzt_riddle'), x: 1, y: 11 }, ui.explore.planFor({ kind: 'riddle', e: window.__ent('pzt_riddle'), x: 1, y: 11 }), []);
  const g = ui.explore.describe({ kind: 'gate', e: window.__ent('pzt_gate1'), x: 8, y: 3 }, null, null);
  return { acts, d, g };
});
check('Nearby offers the riddle beside the company; the hover card names what it is', r.acts.some((a) => /riddle|stone face/i.test(a)) && /face/i.test(r.d.title), r);

// ---- everything survives a save and a reload
r = await ev(async () => {
  const app = window.__app;
  const s = app.session;
  const st = s.serializeState();
  app.stopSession();
  await app.playGame(app.sample, { state: st, noSave: true });
  await new Promise((r2) => setTimeout(r2, 1500));
  const s2 = app.session;
  const e = (id) => s2.map.entities.find((x) => x.id === id);
  return {
    map: s2.map.id, lever: e('pzt_lever').on, gate1: e('pzt_gate1')._open, brazier: e('pzt_brazier').lit, bridge: s2.map.tiles[9 * s2.map.w + 13],
    runes: ['pzt_r1', 'pzt_r2', 'pzt_r3'].map((id) => e(id).lit), gate3: e('pzt_gate3')._open, riddle: e('pzt_riddle').solved, boulder: [e('pzt_boulder').x, e('pzt_boulder').y],
    flags: ['pzt_lever_on', 'pzt_fire', 'pzt_runes', 'pzt_riddle_ok'].map((f) => !!s2.party.flags[f]), lights: (s2.view.terrain.puzzleLights || []).length,
    vis: s2.view.entities.has('pzt_brazier') && !!s2.view.entities.get('pzt_brazier').spin,
  };
});
check('after a reload: the lever still down, braziers burning, the bridge up, runes lit, the riddle answered', r.map === 'pzt_map' && r.lever && r.gate1 && r.brazier && r.bridge === 14 && r.runes.every(Boolean) && r.gate3 && r.riddle && r.flags.every(Boolean) && r.lights === 2 && r.vis, r);

// ---- in a battleground, two heroes hold two plates
r = await ev(async () => {
  const app = window.__app, g = app.sample;
  const m = g.maps.find((x) => x.id === 'pzt_map');
  const m2 = { ...JSON.parse(JSON.stringify({ ...m, tiles: null })), tiles: m.tiles.slice(), id: 'pzt_map2', name: 'Hall of Trials (fought over)', battleground: true };
  m2.entities = m2.entities.filter((e) => e.type !== 'boulder');
  g.maps.push(m2);
  const s = app.session;
  delete s.party.flags.pzt_pa; delete s.party.flags.pzt_pb;
  await s.enterMap('pzt_map2', 12, 3, { instant: true });
  const dv = s.dv;
  const [a, b, ...rest] = dv.alive();
  const out = { dv: !!dv };
  [a, b, ...rest].forEach((h, i) => { dv.setPos(h, 10 + i, 2); s.view.placeEntity('hero:' + (h.id || h.name), 10 + i, 2); });
  dv.select(a, true);
  dv.setPos(a, 12, 4); s.view.placeEntity('hero:' + (a.id || a.name), 12, 4);
  await window.__go(0, 1); // a onto plate a (12,5)
  out.a = { pa: !!s.party.flags.pzt_pa, gate: m2 && s.map.entities.find((e) => e.id === 'pzt_gate2')._open, at: dv.pos(a) };
  dv.select(b, true);
  dv.setPos(b, 16, 4); s.view.placeEntity('hero:' + (b.id || b.name), 16, 4);
  await window.__go(0, 1); // b onto plate b (16,5)
  out.b = { pa: !!s.party.flags.pzt_pa, pb: !!s.party.flags.pzt_pb, gate: s.map.entities.find((e) => e.id === 'pzt_gate2')._open, at: dv.pos(b), aStill: dv.pos(a) };
  return out;
});
check('in a battleground one hero alone holds one plate down (the gate wants both: still shut)', r.dv && r.a.pa && !r.a.gate && r.a.at.y === 5, r.a);
check('a second hero on the other plate: both held, and the gate opens', r.b.pa && r.b.pb && r.b.gate && r.b.aStill.y === 5, r.b);
await ev(() => window.__app.view.focus(14, 5, true));
await wait(800);
await shot('pz-06-two-heroes-two-plates');

// ---- the Construction Set: the Puzzles tools, the inspector, the checklist
r = await ev(async () => {
  const app = window.__app;
  app.stopSession();
  // (a copy as the Remix makes it: tiles stay byte arrays)
  const g = JSON.parse(JSON.stringify(app.sample, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));
  for (const m of g.maps) m.tiles = Uint8Array.from(m.tiles);
  g.id = 'pzt_game'; g.meta.title = 'Puzzle remix';
  app.openEditor(g);
  for (let i = 0; i < 100 && !app.editor; i++) await new Promise((r2) => setTimeout(r2, 30));
  const ed = app.editor;
  ed.setTab('map');
  ed.loadMap(ed.game.maps.find((m) => m.id === 'pzt_map'));
  await new Promise((r2) => setTimeout(r2, 300));
  const sec = [...document.querySelectorAll('.tool-section')].find((s) => /Puzzles/.test(s.querySelector('summary')?.textContent || ''));
  const tools = sec ? [...sec.querySelectorAll('.tool')].map((b) => b.dataset.tool) : [];
  // place a lever and a gate beside it: the gate waits on the lever's flag
  ed.setTool('puzzle_lever');
  ed.tool.down(ed, { x: 18, y: 10 });
  const lever = ed.selected;
  ed.setTool('puzzle_gate');
  ed.tool.down(ed, { x: 20, y: 10 });
  const gate = ed.selected;
  await new Promise((r2) => setTimeout(r2, 200));
  const insp = document.querySelector('.inspector');
  const out = {
    tools, lever: lever?.type, flag: lever?.flag, gate: gate?.type, need: gate?.need,
    needField: !!insp?.querySelector('.pz-need input'), chips: insp?.querySelectorAll('.pz-flags .chip').length || 0, reads: insp?.querySelector('.pz-src')?.textContent,
    visuals: ed.view.hasEntity(lever.id) && ed.view.hasEntity(gate.id) && !!ed.view.entities.get(gate.id).pzPart,
    tags: [...document.querySelectorAll('.pz-tag')].map((t) => t.textContent),
  };
  return out;
});
check('the Details step has a Puzzles group with a tool for each of the eight', r.tools.length === 8 && ['lever', 'plate', 'boulder', 'gate', 'riddle', 'rune', 'brazier', 'trigger'].every((k) => r.tools.includes('puzzle_' + k)), r.tools);
check('a lever placed gets a fresh flag; a gate placed beside it waits on that flag', r.lever === 'lever' && /^lever\d+$/.test(r.flag) && r.gate === 'gate' && r.need === r.flag && r.visuals, r);
check('the gate\'s inspector edits its need, says what sets each flag, and offers the realm\'s flags', r.needField && r.chips > 3 && /pulled/.test(r.reads || ''), r);
check('tags over the map say what each gate waits on', r.tags.some((t) => t.includes(r.need)) && r.tags.some((t) => /pzt_lever_on/.test(t)), r.tags);
await ev(() => { const ed = window.__app.editor; ed.view.focus(14, 7, true); ed.view.setZoom(17, true); });
await wait(900);
await shot('pz-07-editor-gate-inspector');
r = await ev(async () => {
  const ed = window.__app.editor;
  const find = () => { ed.refreshBadges(); return ed.allFindings.map((f) => ({ id: f.id, level: f.level, text: f.text })); };
  const before = find().filter((f) => f.id.startsWith('pz-'));
  // a gate waiting on a flag nothing sets
  ed.setTool('puzzle_gate');
  ed.tool.down(ed, { x: 20, y: 6 });
  const shut = ed.selected;
  shut.need = 'the_moon_key';
  // runes with a gap in their order, a riddle with no answer
  ed.setTool('puzzle_rune');
  ed.tool.down(ed, { x: 10, y: 10 });
  const ra = ed.selected; ra.group = 'gap_runes'; ra.order = 1;
  ed.tool.down(ed, { x: 12, y: 10 });
  const rb = ed.selected; rb.group = 'gap_runes'; rb.order = 3;
  ed.setTool('puzzle_riddle');
  ed.tool.down(ed, { x: 10, y: 6 });
  const rd = ed.selected; rd.answers = [];
  ed.markDirty();
  const after = find().filter((f) => f.id.startsWith('pz-'));
  // fix them: the checklist is content
  shut.need = 'pzt_lever_on'; rb.order = 2; rd.answers = ['echo'];
  const fixed = find().filter((f) => f.id.startsWith('pz-'));
  return { before, after, fixed, ids: [shut.id, ra.id, rd.id] };
});
check('the checklist is quiet about a realm whose puzzles all work', !r.before.some((f) => f.level === 'warn' || f.level === 'error'), r.before);
check('the checklist finds a gate nothing can open', r.after.some((f) => f.id === `pz-never:${r.ids[0]}` && /never open/.test(f.text) && /the_moon_key/.test(f.text)), r.after);
check('…a rune group missing a number, and a riddle with no answer', r.after.some((f) => f.id === 'pz-order:pzt_map:gap_runes' && /number 2/.test(f.text)) && r.after.some((f) => f.id === `pz-noanswer:${r.ids[2]}`), r.after);
check('…and is quiet again once they are put right', !r.fixed.some((f) => f.level === 'warn'), r.fixed);
// a trigger: its tiles picked on the map
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.setTool('puzzle_trigger');
  ed.tool.down(ed, { x: 19, y: 4 });
  const t = ed.selected;
  const btn = [...document.querySelectorAll('.inspector button')].find((b) => /Pick tiles/.test(b.textContent));
  btn.click();
  const picking = ed.toolId;
  ed.tool.down(ed, { x: 18, y: 4 });
  ed.tool.down(ed, { x: 17, y: 4 });
  ed.tool.down(ed, { x: 17, y: 4 }); // (again: taken away)
  ed.tool.down(ed, { x: 16, y: 4 });
  const marker = ed.view.hasEntity(t.id);
  return { picking, tiles: t.tiles.map((q) => `${q.x},${q.y}:${q.t}`), marker, need: t.need };
});
check('a trigger\'s tiles are picked on the map (a second click takes one away); the trigger shows as a marker', r.picking === '__pzTiles' && r.tiles.join(' ') === '18,4:bridge 16,4:bridge' && r.marker, r);
await ev(() => { const ed = window.__app.editor; ed.view.focus(17, 5, true); });
await wait(700);
await shot('pz-08-editor-trigger-tiles');
// the palette, scrolled into view
await ev(() => { const ed = window.__app.editor; ed.setTool('select'); ed.select(null); const sec = [...document.querySelectorAll('.tool-section')].find((s) => /Puzzles/.test(s.querySelector('summary')?.textContent || '')); sec?.scrollIntoView({ block: 'center' }); });
await wait(400);
await shot('pz-09-editor-palette');

// ---- the Places step offers puzzles in a dungeon's plan
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.setTab('places');
  await new Promise((r2) => setTimeout(r2, 300));
  const cave = [...document.querySelectorAll('.pl-list button, .pl-place, [data-place]')].find((b) => /Grimholt/.test(b.textContent));
  cave?.click();
  await new Promise((r2) => setTimeout(r2, 300));
  return { counter: [...document.querySelectorAll('.pl-counters *')].some((el) => /^Puzzles/.test(el.textContent || '')) };
});
check('the Places step has a Puzzles counter in a dungeon\'s plan', r.counter, r);

// ---- a lever-and-gate room the generator made, in play; then the models side by side
r = await ev(async (room) => {
  const app = window.__app, g = app.sample;
  room.id = 'pzt_gen'; room.name = 'The Vault Hall';
  room.tiles = Uint8Array.from(room.tiles);
  room.exit = { map: g.maps[0].id, x: g.settings.start.x, y: g.settings.start.y };
  g.maps.push(room);
  app.playGame(g, { quick: true, noSave: true });
  await new Promise((r2) => setTimeout(r2, 1500));
  const s = app.session;
  const lever = room.entities.find((e) => e.type === 'lever'), gate = room.entities.find((e) => e.type === 'gate');
  // stand beside the lever, the monsters asleep
  s.peaceful = true;
  const spot = room._spot;
  await s.enterMap('pzt_gen', spot[0], spot[1], { instant: true });
  const live = s.map.entities.find((e) => e.type === 'lever');
  s.puzzles.pull(live);
  await new Promise((r2) => setTimeout(r2, 1200));
  s.view.focus((lever.x + gate.x) / 2, (lever.y + gate.y) / 2, true);
  return { open: s.map.entities.find((e) => e.type === 'gate')._open, dist: Math.abs(lever.x - gate.x) + Math.abs(lever.y - gate.y) };
}, genRoom);
check('in a generated dungeon the lever opens the gate to its vault', r.open, r);
await wait(800);
await shot('pz-10-generated-lever-room');

for (const light of ['dark', 'day', 'close']) {
  await ev(async (light) => {
    const s = window.__app.session, v = s.view, g = s.game;
    // a bare hall to stand them in
    let m = g.maps.find((mm) => mm.id === 'pzt_sheet');
    if (!m) {
      const W = 26, H = 15, tiles = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles[y * W + x] = x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 83 : 82;
      m = { id: 'pzt_sheet', name: 'Hall of Pieces', type: 'dungeon', w: W, h: H, tiles, entities: [], lighting: 'dark', battleground: false, exit: { map: g.maps[0].id, x: g.settings.start.x, y: g.settings.start.y }, entry: { x: 12, y: 13 } };
      g.maps.push(m);
    }
    await s.enterMap(m.id, 12, 13, { instant: true });
    s.game.settings.lineOfSight = false;
    s.updateVisibility(true);
    v.clearEntities();
    if (light !== 'dark') v.setLighting('day');
    const R = window.__pzRender;
    let n = 0;
    const put = (x, y, look) => R.showPuzzle(v, { id: 'sheet' + n++, x, y, type: 'x' }, look);
    [{ kind: 'pz_lever', on: false }, { kind: 'pz_lever', on: true }, { kind: 'pz_plate', down: false }, { kind: 'pz_plate', down: true }, { kind: 'pz_boulder', seed: 1 }, { kind: 'pz_brazier', lit: false }, { kind: 'pz_brazier', lit: true }, { kind: 'pz_trigger' }]
      .forEach((l, i) => put(9 + i * 1.5 | 0, 2, l));
    [{ kind: 'pz_gate', style: 'portcullis' }, { kind: 'pz_gate', style: 'portcullis', open: true }, { kind: 'pz_gate', style: 'bars' }, { kind: 'pz_gate', style: 'bars', open: true }, { kind: 'pz_gate', style: 'stone' }, { kind: 'pz_gate', style: 'stone', open: true }]
      .forEach((l, i) => put(9 + i * 2, 4, l));
    [{ kind: 'pz_riddle', look: 'face' }, { kind: 'pz_riddle', look: 'face', solved: true }, { kind: 'pz_riddle', look: 'sphinx', scale: 1.3 }, { kind: 'pz_riddle', look: 'door' }]
      .forEach((l, i) => put(10 + i * 3, 7, l));
    ['sun', 'moon', 'star', 'wave', 'flame', 'leaf', 'eye', 'crown'].forEach((gl, i) => { put(9 + i * 1.5 | 0, 9, { kind: 'pz_rune', glyph: gl, lit: false }); put(9 + i * 1.5 | 0, 10, { kind: 'pz_rune', glyph: gl, lit: true }); });
    s.puzzles.refreshLights();
    v.rig.minDist = 1;
    v.removeEntity('party');
    if (light === 'close') { v.setZoom(7.5, true); v.focus(14.5, 5.6, true); } else { v.setZoom(13.5, true); v.focus(14.5, 6.2, true); }
  }, light);
  await wait(1500);
  await shot(`pz-00-models-${light}`);
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
if (errors.length) fails.push('page errors');
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nall ok');
process.exit(fails.length ? 1 : 0);
