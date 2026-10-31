// Balance and progression checks: shops, loot, food, camping, healing,
// boss phases, naming, and the level-up card (each prints PASS/FAIL).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1000);
const ev = (fn, a) => page.evaluate(fn, a);
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const fresh = () => ev(async () => {
  const app = window.__app;
  if (app.session) app.endPlay(false);
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, 300));
  // close the opening windows properly (the level-up card waits for them)
  for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) {
    document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click();
    await new Promise((r) => setTimeout(r, 150));
  }
});
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });

await fresh();

// ---- B10: no quest rewards or endgame gear on sale on day one; uniques never dropped
let r = await ev(() => {
  const s = window.__app.session, g = s.game;
  const town = g.maps.find((m) => m.name === 'Westhold');
  const stock = town.entities.filter((e) => e.shop).flatMap((e) => e.shop.stock || []);
  const items = stock.map((id) => g.items.find((i) => i.id === id)).filter(Boolean);
  const all = g.maps.flatMap((m) => m.entities.filter((e) => e.shop).flatMap((e) => e.shop.stock || []));
  return {
    unique: items.filter((i) => i.unique).map((i) => i.id),
    dear: items.filter((i) => ['weapon', 'armor', 'shield'].includes(i.type) && i.price > 150).map((i) => i.id),
    rewardsSold: ['elven_bow', 'ember_bow', 'runeblade', 'staff_of_power', 'truesilver_mail'].filter((id) => all.includes(id)),
    flagged: ['elven_bow', 'ember_bow', 'runeblade'].every((id) => g.items.find((i) => i.id === id)?.unique),
  };
});
check('Westhold sells no unique or endgame gear', !r.unique.length && !r.dear.length, r);
check('quest-reward gear is unique and sold nowhere', r.flagged && !r.rewardsSold.length, r);

r = await ev(async () => {
  const s = window.__app.session;
  s.engage({ id: 'loot_t', monster: 'hollow_king', count: '1', roaming: true });
  for (let i = 0; i < 60 && !s.battle?.active; i++) await new Promise((res) => setTimeout(res, 100));
  const b = s.battle;
  const got = new Set();
  const inv = s.party.inventory;
  const before = { ...inv };
  for (let k = 0; k < 150; k++) { b.loot = []; b.killedIds = ['hollow_king', 'skeleton', 'skeleton']; b.dropLoot(); for (const n of b.loot) got.add(n); }
  for (const k of Object.keys(inv)) inv[k] = before[k] || 0;
  const items = [...got].map((n) => s.game.items.find((i) => i.name === n));
  return { names: [...got], unique: items.filter((i) => i?.unique).map((i) => i.name), dear: items.filter((i) => i && i.price > 460).map((i) => i.name) };
});
check('boss loot is good but never unique or endgame', !r.unique.length && !r.dear.length && r.names.length > 0, r);

// ---- B9: a named boss is named, not counted
r = await ev(() => [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent).filter((t) => /You face/.test(t)).pop());
check('battle log names the boss without an article', /You face Ulfgar the Hollow King/.test(r || '') && !/an Ulfgar|Hollow Kings/.test(r || ''), r);

// ---- boss second phase: reinforcements and rage at half health
r = await ev(async () => {
  const b = window.__app.session.battle;
  const boss = b.enemies.find((e) => e.def.id === 'hollow_king');
  const n0 = b.enemies.filter((e) => b.alive(e)).length;
  await b.damage(boss, Math.ceil(boss.hp - boss.maxHp * 0.45));
  return { n0, n1: b.enemies.filter((e) => b.alive(e)).length, enraged: b.has(boss, 'enraged'), phased: !!boss.phased, hp: boss.hp, max: boss.maxHp };
});
check('boss enters its second phase at half health', r.phased && r.enraged && r.n1 >= r.n0 + 2, r);

// ---- B13: heals show what they mend; full-health heroes are not dosed
r = await ev(async () => {
  const s = window.__app.session, b = s.battle;
  const u = b.partyUnits.find((p) => b.alive(p));
  u.member.hp = b.maxHpOf(u);
  const got = b.heal(u, 25);
  const inv = s.party.inventory;
  inv.healing_draught = 3;
  const used = await b.useItem(u, s.game.items.find((i) => i.id === 'healing_draught'), u);
  const mend = s.game.abilities.find((a) => a.id === 'mending');
  for (const p of b.partyUnits) if (b.alive(p)) p.member.hp = b.maxHpOf(p);
  const can = b.canUseAbility(u, mend);
  u.member.hp = Math.max(1, u.member.hp - 5);
  const healed = b.heal(u, 25);
  return { got, used, left: inv.healing_draught, canMend: can.ok, why: can.short, healed };
});
check('a heal on a full-health hero mends 0 and says so', r.got === 0 && r.healed === 5, r);
check('a draught is not wasted on a full-health hero', r.used === false && r.left === 3, r);
check('Prayer of Mending waits until someone is hurt', r.canMend === false, r);
// end the fight
await ev(async () => {
  const s = window.__app.session, b = s.battle;
  for (const e of b.enemies) if (b.alive(e)) { e.dead = true; }
  for (let i = 0; i < 80 && s.battle; i++) { if (b.active && !b.acting) b.actPass(); await new Promise((res) => setTimeout(res, 100)); }
});
await page.waitForTimeout(1500);
await closeModals();

// ---- B16: the victory header shows the real range when Men learn faster
r = await ev(async () => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.status = 'ok'; m.hp = 5; }
  s.engage({ id: 'xp_t', monster: 'giant_rat', count: '2', roaming: true });
  for (let i = 0; i < 60 && !s.battle?.active; i++) await new Promise((res) => setTimeout(res, 100));
  const b = s.battle;
  for (const e of b.enemies) await b.kill(e);
  for (let i = 0; i < 80 && s.battle; i++) { if (b.active && !b.acting) b.actPass(); await new Promise((res) => setTimeout(res, 100)); }
  for (let i = 0; i < 40 && !document.querySelector('.victory-modal'); i++) await new Promise((res) => setTimeout(res, 100));
  const head = document.querySelector('.victory-modal .vic-stats')?.textContent || '';
  const rows = [...document.querySelectorAll('.victory-modal .vh-head span')].map((e) => e.textContent).filter((t) => /XP/.test(t));
  return { head, rows };
});
const gains = (r.rows || []).map((t) => parseInt(t.replace(/[^0-9]/g, ''), 10));
const lo = Math.min(...gains), hi = Math.max(...gains);
check('victory header matches what each hero gained', gains.length && r.head.includes(lo === hi ? `+${lo}` : `+${lo}–${hi}`), r);
await closeModals();

// ---- B12 and talents: a level from quest experience brings the card, with three talents
await fresh();
r = await ev(async () => {
  const s = window.__app.session;
  window.__quests.applyReward(s, { xp: 80 });
  s.ui.refresh();
  for (let i = 0; i < 80 && !document.querySelector('.levelup-modal'); i++) { s.ui.refresh(); await new Promise((res) => setTimeout(res, 100)); }
  const card = document.querySelector('.levelup-modal');
  return {
    card: !!card, heroes: card ? card.querySelectorAll('.lvl-hero').length : 0,
    perks: card ? [...card.querySelectorAll('.lvl-hero')].map((x) => x.querySelectorAll('button.perk').length) : [],
    pending: s.party.members.map((m) => m.perkPending), level: s.party.members.map((m) => m.level),
  };
});
await page.screenshot({ path: `${OUT}/r3-levelup.png` });
check('quest experience that levels the company shows the level-up card', r.card && r.heroes === 4, r);
check('each hero is offered three talents', r.perks.length === 4 && r.perks.every((n) => n === 3), r);
r = await ev(async () => {
  const s = window.__app.session;
  const btn = document.querySelector('.levelup-modal .lvl-hero button.perk');
  if (!btn) return { missing: true };
  const m = s.party.members[0];
  const before = m.perkPending;
  btn.click();
  await new Promise((res) => setTimeout(res, 200));
  const after = m.perkPending;
  document.querySelector('.levelup-modal .modal-buttons button')?.click();
  await new Promise((res) => setTimeout(res, 600));
  s.ui.refresh();
  await new Promise((res) => setTimeout(res, 600));
  return { before, after, perks: m.perks, again: !!document.querySelector('.levelup-modal') };
});
check('picking a talent on the card learns it, and the card does not nag', r.before === 1 && r.after === 0 && r.perks.length === 1 && !r.again, r);
// talents follow the class: the healer's tree for the cleric
r = await ev(() => {
  const s = window.__app.session;
  const cleric = s.party.members.find((m) => m.cls === 'cleric');
  const ranger = s.party.members.find((m) => m.cls === 'ranger');
  return { cleric: cleric?.perks?.length ? null : null, tree: [cleric, ranger].map((m) => m && s.game.classes.find((k) => k.id === m.cls)?.talents) };
});
check('classes have talent trees', r.tree[0] === 'healer' && r.tree[1] === 'archer', r);

// ---- B7 / confusion 9: food lasts, is explained, and an empty larder still lets you rest
await fresh();
r = await ev(async () => {
  const s = window.__app.session;
  s.map.encounterRate = 0;
  s.map.entities = s.map.entities.filter((e) => e.type !== 'monster');
  const n = s.party.members.length;
  const f0 = s.party.food, t0 = s.state.turn;
  for (let i = 0; i < 40; i++) await s.afterStep(true);
  return { n, used: f0 - s.party.food, turns: s.state.turn - t0 };
});
check('each hero eats one ration per 20 steps in the wild', r.used === r.n * 2 && r.turns === 40, r);
r = await ev(async () => {
  const s = window.__app.session;
  s.party.food = 5;
  s.state.foodTick = 19;
  await s.afterStep(true);
  const lines = [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent);
  const tip = lines.find((t) => /each hero eats one ration/.test(t));
  s.party.food = 0;
  const m = s.party.members[0];
  const mh = m.hp;
  m.hp = 1;
  await s.camp();
  return { tip: !!tip, hp: m.hp, mh, food: s.party.food, last: [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent).slice(-2) };
});
check('low food is explained once', r.tip, r);
check('camping without food is allowed but heals less', r.hp > 1 && r.hp <= Math.ceil(r.mh * 0.25) + 1 && r.food === 0, r);

// ---- travel: the ground sets the pace (roads quick, sand very slow), explained once
r = await ev(async () => {
  const s = window.__app.session;
  const before = document.querySelectorAll('.hud-log .log-line').length;
  s.map.entities = s.map.entities.filter((e) => e.type !== 'monster');
  s.map.encounterRate = 0;
  // a straight test strip of open ground east of the party
  const p0 = { ...s.state.pos };
  const key = (k) => window.__travel.T[k];
  const ids = {};
  for (const k of ['road', 'sand', 'forest', 'grass']) ids[k] = key(k);
  const lay = (k) => { for (let x = p0.x; x <= p0.x + 5; x++) s.map.tiles[p0.y * s.map.w + x] = ids[k]; };
  s.map.entities = s.map.entities.filter((e) => !(e.y === p0.y && e.x >= p0.x && e.x <= p0.x + 5));
  const walk = async (dx, n) => {
    const t0 = s.state.turn;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const x0 = s.state.pos.x;
      await s.move(dx, 0);
      while (s.busy) await new Promise((res) => setTimeout(res, 10));
      if (s.state.pos.x !== x0) moved++;
    }
    return { turns: s.state.turn - t0, moved };
  };
  s.state.clock = 0;
  lay('road');
  const road = await walk(1, 4);
  lay('sand');
  const sand = await walk(-1, 4);
  lay('forest');
  const forest = await walk(1, 4);
  lay('grass');
  const lines = [...document.querySelectorAll('.hud-log .log-line')].slice(before).map((e) => e.textContent);
  const tTerrain = (k) => window.__travel.terrain(ids[k]);
  return {
    ids, road, sand, forest,
    cost: { road: s.stepCost(p0.x, p0.y), sand: s.terrainNote(tTerrain('sand')), forest: s.terrainNote(tTerrain('forest')) },
    tips: lines.filter((t) => /The ground decides your pace/.test(t)).length, tipSeen: !!s.state.tips?.terrain,
  };
});
check('roads are quick: four road steps take two turns', r.road.moved === 4 && r.road.turns === 2, r);
check('sand is very slow: four steps take eight turns or more, but every step lands', r.sand.moved === 4 && r.sand.turns >= 8, r);
check('forest costs more than a turn, a little less with an elf ranger along', r.forest.moved === 4 && r.forest.turns >= 5 && r.forest.turns <= 6, r);
check('terrain hover text gives the cost and the guide', /very slow \(2\.5 turns/.test(r.cost.sand) && /elf/.test(r.cost.forest), r.cost);
check('the pace of travel is explained once', r.tips <= 1 && r.tipSeen, r);

// ---- monsters: a guard gives up past its leash and walks home; monsters pay for rough ground
r = await ev(async () => {
  const s = window.__app.session;
  const before = document.querySelectorAll('.hud-log .log-line').length;
  s.map.entities = s.map.entities.filter((e) => e.type !== 'monster');
  s.map.encounterRate = 0;
  const grass = window.__travel.T.grass;
  const p0 = { ...s.state.pos };
  // open grass two rows wide, ten squares either way
  for (let x = p0.x - 12; x <= p0.x + 6; x++) for (const y of [p0.y, p0.y + 1]) s.map.tiles[y * s.map.w + x] = grass;
  s.map.entities = s.map.entities.filter((e) => !(e.y >= p0.y && e.y <= p0.y + 1 && e.x >= p0.x - 12 && e.x <= p0.x + 6));
  const wolf = { id: 'test_wolf', type: 'monster', monster: 'wolf', count: '3', x: p0.x + 3, y: p0.y, leash: 4 };
  wolf.home = { x: wolf.x, y: wolf.y };
  s.map.entities.push(wolf);
  s.addVisual(wolf);
  s.state.clock = 0;
  const trail = [];
  for (let i = 0; i < 9; i++) {
    await s.move(-1, 0);
    while (s.busy) await new Promise((res) => setTimeout(res, 10));
    trail.push({ px: s.state.pos.x, wx: wolf.x, mood: wolf.mood || null, dh: Math.abs(wolf.x - wolf.home.x) + Math.abs(wolf.y - wolf.home.y) });
    if (s.mode !== 'explore') break;
  }
  const gaveUp = trail.findIndex((t) => t.mood === 'return');
  for (let i = 0; i < 8; i++) await s.afterStep(true);
  const lines = [...document.querySelectorAll('.hud-log .log-line')].slice(before).map((e) => e.textContent);
  const def = s.game.monsters.find((m) => m.id === 'wolf');
  const tr = window.__travel;
  const forestT = tr.terrain(tr.T.forest), sandT = tr.terrain(tr.T.sand);
  return {
    trail, gaveUp, mode: s.mode, home: { x: wolf.x - wolf.home.x, y: wolf.y - wolf.home.y },
    lost: lines.filter((t) => /The wolves lose interest\./.test(t)).length,
    native: def.native, costs: { forest: tr.monsterCost(def, forestT), sand: tr.monsterCost(def, sandT) },
  };
});
check('a placed monster chases, then gives up past its leash ("The wolves lose interest.")', r.mode === 'explore' && r.gaveUp >= 0 && r.trail[0].mood === 'chase' && r.lost === 1, r);
check('...and walks back home', r.trail.slice(r.gaveUp + 1).some((t) => t.dh <= 1 && t.mood !== 'chase'), r);
check('monsters move freely on native ground, slowly elsewhere', r.native.includes('forest') && r.costs && r.costs.forest === 1 && r.costs.sand === 2.5, r);

// ---- the explored mask: unknown land is blank vellum outdoors, kept in the save
r = await ev(async () => {
  const s = window.__app.session;
  const map = s.map;
  let seen = 0;
  for (let i = 0; i < map.explored.length; i++) seen += map.explored[i];
  const far = (() => { for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (!map.explored[y * map.w + x]) return { x, y }; })();
  const fi = far.y * map.w + far.x;
  const state = s.serializeState();
  const saved = state.maps[map.id]?.explored;
  // a fresh session from the save sees the same mask
  const live = s.buildLiveMap(map.id);
  let same = true;
  for (let i = 0; i < map.explored.length; i++) if (!!live.explored[i] !== !!map.explored[i]) { same = false; break; }
  const dungeon = s.game.maps.find((m) => m.type === 'dungeon');
  return {
    seen, total: map.explored.length, saved: typeof saved === 'string' && saved.length < 4000, same,
    vellum: s.vellumMap(), dungeonVellum: s.vellumMap(dungeon), farText: s.describeTile(far.x, far.y),
    view: s.view.expTarget[fi] === 0 && s.view.expTarget[s.state.pos.y * map.w + s.state.pos.x] === 1,
    found: (state.found?.[map.id] || []).length,
  };
});
check('explored land is tracked; most of the world starts unknown', r.seen > 50 && r.seen < r.total / 2, r);
check('the explored mask is saved compactly and loads back the same', r.saved && r.same, r);
check('unknown land outdoors is vellum (dungeons stay dark)', r.vellum && !r.dungeonVellum && r.farText === 'Unexplored land.' && r.view, r);
check('discoveries are remembered in the save', r.found > 0, r);

// ---- the healer explains raising the dead (confusion 7)
r = await ev(async () => {
  const s = window.__app.session;
  const m = s.party.members[1];
  m.status = 'ok'; m.hp = 1;
  s.hurtMember(m, 5, 'a test');
  const lines = [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent);
  return { dead: m.status, tip: lines.some((t) => /healer in any town can RAISE/.test(t)) };
});
check('a fallen hero comes with a word on raising the dead', r.dead === 'dead' && r.tip, r);

// ---- the field heal target list greys out the hale
r = await ev(async () => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.status = 'ok'; m.hp = 999; }
  s.party.members[0].hp = 3;
  s.party.inventory.healing_draught = 2;
  const it = s.game.items.find((i) => i.id === 'healing_draught');
  const p = s.ui.fieldUseItem(it);
  await new Promise((res) => setTimeout(res, 300));
  const opts = [...document.querySelectorAll('.choose-modal .choose-item')].map((b) => ({ dis: b.classList.contains('disabled'), text: b.textContent }));
  document.querySelector('.choose-modal .choose-item:not(.disabled)')?.click();
  await p;
  return { opts, left: s.party.inventory.healing_draught };
});
check('field draught list greys out heroes at full health', r.opts.filter((o) => o.dis).length === 3 && r.left === 1, r);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
if (errors.length) fails++;
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
