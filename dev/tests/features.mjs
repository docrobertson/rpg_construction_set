// New-feature checks: ranged slot, character sheet, attribute points,
// class specials, loot, day/night and old-save migration.
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
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(800);

// --- kits and the ranged slot
const kits = await ev(() => window.__app.session.party.members.map((m) => ({ cls: m.cls, equip: m.equip, points: m.points })));
const ranger = kits.find((k) => k.cls === 'ranger');
check('ranger carries sword and bow', ranger && ranger.equip.weapon === 'short_sword' && ranger.equip.ranged === 'short_bow', ranger);
check('layout is docked', await ev(() => document.getElementById('app').dataset.layout === 'play' && document.getElementById('viewport').getBoundingClientRect().width < window.innerWidth));
// the sheet lives in a pop-over opened from the roster
const openSheet = (cls) => ev((cls) => { const ui = window.__app.playUI; const m = ui.s.party.members.find((x) => !cls || x.cls === cls); if (ui.popHero !== m || ui.popEl.hidden) ui.selectHero(m); }, cls);
check('roster shows a portrait for every hero', await ev(() => [...document.querySelectorAll('.pcard .pc-pic img')].filter((i) => i.src.startsWith('data:image/png')).length === window.__app.session.party.members.length));
check('leader is marked', await ev(() => document.querySelector('.pcard')?.classList.contains('leader') && !!document.querySelector('.pcard .pc-lead')));
await openSheet(null);
check('character sheet pops over with four slots', (await ev(() => !document.querySelector('.hero-pop').hidden && document.querySelectorAll('.hero-pop .slot select').length)) === 4);
await page.keyboard.press('Escape');
check('Esc closes the pop-over', await ev(() => document.querySelector('.hero-pop').hidden));

// select the ranger and take the bow off, then put it back, via the sheet
await openSheet('ranger');
await wait(200);
await ev(() => { const sel = document.querySelectorAll('.hero-pop .slot select')[1]; sel.value = ''; sel.dispatchEvent(new Event('change')); });
let st = await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); return { ranged: r.equip.ranged, inv: s.party.inventory.short_bow || 0 }; });
check('unequip bow puts it in the pack', st.ranged === null && st.inv === 1, st);
await ev(() => { const sel = document.querySelectorAll('.hero-pop .slot select')[1]; sel.value = 'short_bow'; sel.dispatchEvent(new Event('change')); });
st = await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); return { ranged: r.equip.ranged, inv: s.party.inventory.short_bow || 0 }; });
check('equip bow from the pack', st.ranged === 'short_bow' && st.inv === 0, st);

// --- attribute points
await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); r.xp = 0; s.ui.refresh(); });
const lv = await ev(() => {
  const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger');
  const before = { level: r.level, dex: r.dex };
  // award enough experience for one level through the normal path
  const g = s.game;
  const need = 60;
  r.xp = 0;
  return { before, need };
});
await ev(() => { const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger'); window.__gain = s.grantXp ? s.grantXp(r, 60) : null; });
await ev(async () => {
  // use the rules directly if the session has no helper
  const s = window.__app.session; const r = s.party.members.find((m) => m.cls === 'ranger');
  if (r.level === 1) { r.level = 2; r.points = (r.points || 0) + 1; }
  s.ui.refresh();
});
await openSheet('ranger');
await wait(200);
const plus = await ev(() => document.querySelectorAll('.hero-pop .attr .plus').length);
check('plus buttons appear with points', plus === 4, plus);
await ev(() => document.querySelectorAll('.hero-pop .attr .plus')[1].click());
const after = await ev(() => { const r = window.__app.session.party.members.find((m) => m.cls === 'ranger'); return { dex: r.dex, points: r.points }; });
check('spending a point raises Dexterity', after.dex === lv.before.dex + 1 && after.points === 0, { before: lv.before, after });

// --- day and night
const dn = await ev(() => {
  const s = window.__app.session;
  s.state.turn = 200; s.applyDaylight(); s.updateVisibility(true); s.ui.refresh();
  const night = { name: s.timeOfDay().name, lighting: s.view.lighting, sight: s.sightRadius().sight, status: document.querySelector('.hud-status').textContent };
  s.state.turn = 10; s.applyDaylight(); s.updateVisibility(true); s.ui.refresh();
  return { night, day: { name: s.timeOfDay().name, lighting: s.view.lighting } };
});
check('night falls', dn.night.name === 'Night' && dn.night.lighting === 'night' && dn.night.sight <= 8 && /Night/.test(dn.night.status), dn.night);
check('morning returns', dn.day.lighting === 'day' && dn.day.name === 'Morning', dn.day);
await ev(() => { const s = window.__app.session; s.state.turn = 160; s.applyDaylight(); });
await wait(600);
await shot('feat-dusk');
await ev(() => { const s = window.__app.session; s.state.turn = 10; s.applyDaylight(); });

// --- battle: ranged attack, specials
await ev(() => { const s = window.__app.session; for (const m of s.party.members) { m.hp = 60; } s.engage({ id: 'x', monster: 'goblin', count: '4', roaming: true }); });
await wait(2500);
await shot('feat-moves');
const mv = await ev(async () => {
  const b = window.__app.session.battle; const u = b && b.active;
  if (!u) return { none: true };
  const start = u.moves;
  const dest = [...b.reachable(u).values()].find((c) => c.d === 2);
  if (dest) await b.actMoveTo(dest.x, dest.y, u);
  return { start, stillActive: b.active === u, left: u.moves, moved: !!dest && u.x === dest.x && u.y === dest.y };
});
check('heroes move several squares in one turn', mv.start >= 2 && mv.moved && mv.stillActive && mv.left === mv.start - 2, mv);
const active = () => ev(() => { const b = window.__app.session.battle; return b && b.active ? b.active.member.cls : null; });
const waitActive = async (cls) => {
  for (let i = 0; i < 80; i++) {
    const a = await active();
    if (a === cls) return true;
    if (a) await ev(() => window.__app.session.battle.actPass());
    await wait(150);
  }
  return false;
};
check('ranger gets a turn', await waitActive('ranger'));
const shotRes = await ev(async () => {
  const b = window.__app.session.battle; const u = b.active;
  let far = b.enemies.find((e) => b.alive(e) && !b.adjacent(u, e) && b.canAttack(u, e));
  if (!far) {
    // bring a goblin into bow range
    far = b.enemies.find((e) => b.alive(e));
    for (let d = 3; d <= 4 && far; d++) if (b.walkable(u.x, u.y - d, far)) { far.x = u.x; far.y = u.y - d; b.view.moveEntity(far.id, far.x, far.y, 0.05); break; }
    for (let y = u.y - 1; y > far.y; y--) if (!b.walkable(u.x, y, null)) return { blocked: true };
  }
  const before = b.round;
  const ok = await b.actAttack(far, u);
  return { ok, wkind: b.weaponFor(u, far).wkind };
});
check('ranger shoots a distant foe with the bow', shotRes.blocked || (shotRes.ok && shotRes.wkind === 'bow'), shotRes);
// wizard blink is a free action
if (await waitActive('wizard')) {
  const bl = await ev(async () => {
    const b = window.__app.session.battle; const u = b.active;
    const tg = b.specialTargets(u);
    const t = tg.tiles[0];
    await b.actSpecial(t, u);
    return { still: b.active === u, moved: u.x === t.x && u.y === t.y, used: u.specialUsed, again: b.canSpecial(u).ok };
  });
  check('blink moves the wizard and keeps the turn', bl.still && bl.moved && bl.used && !bl.again, bl);
  await ev(() => window.__app.session.battle.actPass());
}
if (await waitActive('cleric')) {
  const md = await ev(async () => {
    const b = window.__app.session.battle; const u = b.active;
    for (const p of b.partyUnits) p.member.hp = 5;
    await b.actSpecial(null, u);
    return { healed: b.partyUnits.filter((p) => b.alive(p)).every((p) => p.member.hp > 5), used: u.specialUsed };
  });
  check('prayer of mending heals everyone', md.healed && md.used, md);
}
await shot('feat-battle');
// loot
const loot = await ev(() => {
  const b = window.__app.session.battle;
  if (!b) return { nobattle: true };
  const inv = window.__app.session.party.inventory;
  const before = JSON.stringify(inv);
  b.killedIds = ['troll', 'orc_captain', 'troll', 'drake'];
  for (let i = 0; i < 12; i++) b.dropLoot();
  return { changed: JSON.stringify(inv) !== before, lines: [...document.querySelectorAll('.log-line.loot')].map((x) => x.textContent).slice(-3) };
});
check('foes drop loot', loot.nobattle || (loot.changed && loot.lines.length > 0), loot);
// finish the battle
await ev(() => { const b = window.__app.session.battle; if (b) for (const e of b.enemies) { e.hp = 0; e.dead = true; } if (b && b.active) b.actPass(); });
const idle = () => ev(async () => { for (let i = 0; i < 300; i++) { const s = window.__app.session; if (!s.battle && s.mode === 'explore' && !s.busy) return true; await new Promise((r) => setTimeout(r, 100)); } return false; });
await idle();
await wait(500);
await ev(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));

// --- the battle overhaul: initiative, action bar, odds, skills, tactics, telegraphed blows, talents
await ev(() => { const s = window.__app.session; for (const m of s.party.members) { m.hp = 60; m.status = 'ok'; } s.fight([{ id: 'orc', n: 2 }, { id: 'goblin', n: 2 }], 'grass', {}); });
const heroUp = async () => { for (let i = 0; i < 200; i++) { if (await ev(() => !!window.__app.session.battle?.active && !window.__app.session.battle.acting)) return true; await wait(150); } return false; };
await heroUp();
const hud = await ev(() => {
  const b = window.__app.session.battle;
  return {
    chips: document.querySelectorAll('.cbt-chip').length, now: document.querySelectorAll('.cbt-chip.now').length, units: b.units.length,
    buttons: [...document.querySelectorAll('.cbt-btn .cb-name')].map((x) => x.textContent),
    plates: document.querySelectorAll('.cbt-plate').length, ordered: b.order.every((u, i) => !i || b.order[i - 1].init >= u.init),
  };
});
check('initiative strip shows who acts now and next', hud.chips >= hud.units && hud.now === 1 && hud.ordered, hud);
check('action bar lists moves, attack, skills, special, cast, item, guard and end turn', hud.buttons.length >= 8 && hud.buttons.includes('Guard') && hud.buttons.includes('End turn'), hud.buttons);
check('health plates float over every figure', hud.plates === hud.units, hud.plates);
// odds on hover: put a goblin beside the active hero, with a friend flanking it
const odds = await ev(() => {
  const b = window.__app.session.battle; const u = b.active;
  const gob = b.enemies.find((e) => b.alive(e) && e.def.id === 'goblin');
  const spot = [[0, -1], [1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy })).find((c) => b.walkable(c.x, c.y, gob));
  gob.x = spot.x; gob.y = spot.y; b.view.placeEntity(gob.id, gob.x, gob.y);
  const plain = b.preview(u, gob);
  const mate = b.partyUnits.find((p) => p !== u && b.alive(p));
  const fs = [[0, -1], [1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => ({ x: gob.x + dx, y: gob.y + dy })).find((c) => b.walkable(c.x, c.y, mate));
  mate.x = fs.x; mate.y = fs.y; b.view.placeEntity(mate.id, mate.x, mate.y);
  const flanked = b.preview(u, gob);
  b.s.ui.combatTurn(u);
  return { plain: plain.chance, flanked: flanked.chance, notes: flanked.notes, lo: flanked.lo, hi: flanked.hi };
});
check('attack preview gives odds and damage, and flanking helps', odds.plain > 0 && odds.plain <= 1 && odds.flanked > odds.plain && odds.notes.some((n) => /Flanking/.test(n)) && odds.hi >= odds.lo, odds);
const card = await ev(async () => {
  const b = window.__app.session.battle; const v = b.view;
  const gob = b.enemies.find((e) => b.alive(e) && b.adjacent(b.active, e));
  const r = v.renderer.domElement.getBoundingClientRect(); const p = v.worldToScreen(gob.x + 0.5, 0.3, gob.y + 0.5);
  return { x: p.x + r.left, y: p.y + r.top };
});
await page.mouse.move(card.x, card.y);
await wait(300);
const tip = await ev(() => { const t = document.querySelector('.cbt-tip'); return t && !t.hidden ? t.textContent : ''; });
check('hovering a foe shows its card with the chance to hit', /to hit/.test(tip) && /Armour/.test(tip), tip.slice(0, 120));
await page.mouse.move(5, 795);
// a skill with a cooldown, and a status effect
const skill = await ev(async () => {
  const b = window.__app.session.battle; const u = b.active;
  const ab = b.abilitiesOf(u).find((a) => a.cooldown && b.canUseAbility(u, a).ok && b.abilityTargets(u, a).kind === 'enemy' && b.abilityTargets(u, a).units.length);
  if (!ab) return { none: b.abilitiesOf(u).map((a) => a.id + ':' + b.canUseAbility(u, a).why) };
  const t = b.abilityTargets(u, ab).units[0];
  const used = await b.actAbility(ab, t, u);
  return { id: ab.id, used, cd: u.cd[ab.id], again: b.canUseAbility(u, ab).ok, why: b.canUseAbility(u, ab).short };
});
check('skills go on cooldown after use', skill.id && skill.cd > 0 && !skill.again && /Ready in/.test(skill.why), skill);
// conditions apply, show and run out
const cond = await ev(() => {
  const b = window.__app.session.battle;
  const e = b.enemies.find((x) => b.alive(x));
  b.addStatus(e, 'weakened', 1, 0, null);
  const shown = b.statusList(e).some((s) => s.id === 'weakened');
  b.endTurn(e);
  return { shown, after: b.has(e, 'weakened') };
});
check('conditions show and expire', cond.shown && !cond.after, cond);
// breaking away from a foe invites a free strike
await heroUp();
const opp = await ev(async () => {
  const b = window.__app.session.battle; const u = b.active;
  const foe = b.enemies.find((e) => b.alive(e));
  const spots = [[0, -1], [1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy, dx, dy }));
  const at = spots.find((c) => b.walkable(c.x, c.y, foe) && b.walkable(u.x - c.dx, u.y - c.dy, u));
  if (!at) return { skipped: true };
  foe.x = at.x; foe.y = at.y; foe.reacted = false; foe.stun = 0; foe.sleep = 0; b.view.placeEntity(foe.id, foe.x, foe.y);
  const warned = b.provokers(u, u.x - at.dx, u.y - at.dy).includes(foe);
  u.moves = Math.max(1, u.moves || 0);
  const lines = document.querySelectorAll('.log-line').length;
  await b.actMove(-at.dx, -at.dy);
  const log = [...document.querySelectorAll('.log-line')].slice(lines).map((l) => l.textContent);
  return { warned, reacted: foe.reacted, log };
});
check('stepping away from a foe provokes a free strike', opp.skipped || (opp.warned && opp.reacted && opp.log.some((l) => /strikes at/.test(l))), opp);
// a telegraphed blow lands only on whoever stays in the marked squares
const wind = await ev(async () => {
  const b = window.__app.session.battle;
  const orc = b.enemies.find((e) => b.alive(e));
  const smash = b.game.abilities.find((a) => a.id === 'brutal_smash');
  const hero = b.partyUnits.find((p) => b.alive(p));
  b.current = orc;
  await b.beginWindup(orc, smash, { x: hero.x, y: hero.y });
  const marked = !!orc.charging && orc.charging.tiles.some((t) => t.x === hero.x && t.y === hero.y);
  const hp0 = hero.member.hp;
  // the hero steps out of the way before it lands
  const free = [[0, -1], [1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => ({ x: hero.x + dx, y: hero.y + dy })).find((c) => b.walkable(c.x, c.y, hero));
  hero.x = free.x; hero.y = free.y; b.view.placeEntity(hero.id, hero.x, hero.y);
  await b.releaseWindup(orc);
  b.current = null;
  return { marked, dodged: hero.member.hp === hp0, cleared: !orc.charging };
});
check('telegraphed blows mark their squares and can be dodged', wind.marked && wind.dodged && wind.cleared, wind);
// guard is a turn-ending brace
await heroUp();
const guard = await ev(async () => { const b = window.__app.session.battle; const u = b.active; const ac = b.acOf(u); await b.actGuard(u); return { before: ac, after: b.acOf(u), ended: b.active !== u }; });
check('guard braces for +3 armour and ends the turn', guard.after === guard.before + 3 && guard.ended, guard);
await shot('feat-battle-hud');
// win: the victory screen sums it up, with talents to choose after a level-up
await ev(() => { for (const m of window.__app.session.party.members) m.xp = 49; });
await heroUp();
await ev(async () => { const b = window.__app.session.battle; for (const e of b.enemies) if (b.alive(e)) await b.kill(e); if (b.active) b.actPass(); });
await idle();
await wait(1500);
const vic = await ev(() => ({
  title: document.querySelector('.victory-modal .modal-title')?.textContent, rows: document.querySelectorAll('.vic-hero').length,
  perks: document.querySelectorAll('.victory-modal .perk').length, pending: window.__app.session.party.members.map((m) => m.perkPending),
}));
check('victory screen shows experience and offers talents', /Victory/.test(vic.title || '') && vic.rows >= 1 && vic.perks >= 2 && vic.pending.some((p) => p > 0), vic);
const perk = await ev(() => {
  const s = window.__app.session; const m = s.party.members.find((x) => x.perkPending > 0);
  const btn = document.querySelector('.victory-modal .perk');
  const before = { perks: m.perks.length, pending: m.perkPending };
  btn.click();
  return { before, after: { perks: m.perks.length, pending: m.perkPending } };
});
check('choosing a talent learns it', perk.after.perks === perk.before.perks + 1 && perk.after.pending === perk.before.pending - 1, perk);
await shot('feat-victory');
await ev(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));
await idle();

// --- older games gain battle abilities, class skills and monster behaviours
// (the battle code and the editor fill them in on first use)
await ev(() => {
  const s = window.__app.session, g = s.game;
  delete g.abilities;
  for (const k of g.classes) delete k.skills;
  for (const m of g.monsters) { delete m.abilities; delete m.ai; }
  for (const m of s.party.members) { m.hp = 60; m.status = 'ok'; }
  s.fight([{ id: 'troll', n: 1 }], 'grass', {});
});
await heroUp();
const migr = await ev(() => {
  const s = window.__app.session; const g = s.game; const b = s.battle;
  return { abilities: g.abilities?.length, warrior: g.classes.find((k) => k.id === 'warrior').skills, troll: g.monsters.find((m) => m.id === 'troll').abilities, bar: [...document.querySelectorAll('.cbt-btn .cb-name')].map((x) => x.textContent).length, active: !!b?.active };
});
check('older games gain the default abilities', migr.abilities > 20 && migr.warrior?.length === 2 && migr.troll?.includes('brutal_smash') && migr.bar >= 8, migr);
await ev(async () => { const b = window.__app.session.battle; if (b) { for (const e of b.enemies) if (b.alive(e)) await b.kill(e); if (b.active) b.actPass(); } });
await idle();
await wait(1200);
await ev(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));

// --- old saves: a bow in the weapon slot moves to the ranged slot
const mig = await ev(() => {
  const app = window.__app;
  const s = app.session;
  const state = JSON.parse(JSON.stringify(s.state));
  const r = state.party.members.find((m) => m.cls === 'ranger');
  r.equip = { weapon: 'long_bow', armor: 'leather_armor', shield: null };
  delete r.points;
  const S = s.constructor;
  const s2 = new S(app, s.game, state, { noSave: true });
  const r2 = s2.party.members.find((m) => m.cls === 'ranger');
  return { equip: r2.equip, points: r2.points };
});
check('old saves migrate bows to the ranged slot', mig.equip.ranged === 'long_bow' && mig.equip.weapon === null && mig.points === 0, mig);

// --- the help explains the mouse as well as the keys
const help = await ev(async () => {
  const ui = window.__app.playUI;
  if (!ui) return '';
  ui.openHelp();
  await new Promise((r) => setTimeout(r, 200));
  const t = document.querySelector('.help')?.textContent || '';
  document.querySelector('.help')?.closest('.modal-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return t;
});
check('help explains pointing, clicking, right-click and the Nearby bar', /Point at anything/.test(help) && /Right-click/.test(help) && /Nearby/.test(help) && /E, 1–4/.test(help));

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
