// Tactics: weapon training (anyone may wield anything, untrained at a
// penalty, shown wherever gear is chosen), each kind of weapon's trait, the
// gamble of breaking away (its odds shown before the move, rolled, moved by
// level and Dexterity), Withdraw, cover you can see (shields on squares and
// over foes, first on the odds card), soak and the last stand, gentler
// critical hits on heroes, the Construction Set's fields and older games —
// and the difficulty curve itself, measured by tests/curve.mjs.
//   node --require ./tests/fast.cjs tests/tactics.mjs     (NO_CURVE=1 skips the curve)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { measure, table } from './curve.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined && !ok ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };

// ------------------------------------------------------------ the curve, measured
if (!process.env.NO_CURVE) {
  const rows = await measure({ fights: parseInt(process.env.CURVE_FIGHTS, 10) || 40, blows: parseInt(process.env.CURVE_BLOWS, 10) || 600 });
  console.log(table(rows).split('\n').slice(0, rows.length + 1).map((l) => '   ' + l).join('\n'));
  const L = (n) => rows.find((r) => r.level === n);
  const lv = rows.map((r) => r.hitLv);
  check('a foe of the company\'s level hits a hero about half the time at every level (45–55%, give or take the dice: 40–60)', lv.every((x) => x >= 0.4 && x <= 0.6), lv.map((x) => Math.round(x * 100)));
  check('…with no cliff: from one level to the next it moves by under a tenth', lv.slice(1).every((x, i) => Math.abs(x - lv[i]) < 0.1), lv.map((x) => Math.round(x * 100)));
  check('at level 1 an ordinary hit takes a fifth or so of a front-liner\'s health (15–25%)', L(1).share.warrior >= 0.15 && L(1).share.warrior <= 0.25, L(1).share);
  check('…and at most two fifths of a wizard\'s', L(1).share.wizard <= 0.4, L(1).share);
  check('no ordinary foe fells a hero from full health in one blow, at any level', rows.every((r) => r.oneShot === 0), rows.map((r) => r.oneShot));
  check('whole fights stay winnable and are never a walk-over at the start (level 1–2 bands cost a tenth of the company\'s health or more)', rows.every((r) => r.win >= 0.85) && L(1).lost >= 0.08 && L(2).lost >= 0.08, rows.map((r) => [r.level, Math.round(r.win * 100), Math.round(r.lost * 100)]));
}

// ------------------------------------------------------------ the page
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', `${OUT}/${name}.png`); };
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(400);

// ------------------------------------------------------------ the rules of training
const rules = await ev(() => {
  const T = window.__tactics, s = window.__app.session, g = s.game;
  const mk = (race, cls, level = 1) => { const c = T.createCharacter(g, { name: cls, race, cls, stats: { str: 14, dex: 14, int: 12, wis: 12 } }); c.level = level; T.normalizeMember(g, c, {}); return c; };
  const it = (id) => g.items.find((x) => x.id === id);
  const ranger = mk('human', 'ranger'), warrior = mk('human', 'warrior'), wizard = mk('human', 'wizard');
  const out = {};
  out.rangerAxe = T.canEquip(g, ranger, it('battle_axe'));
  out.rangerAxeWhy = T.training(g, ranger, it('battle_axe')).why;
  out.rangerHand = T.training(g, ranger, it('hand_axe')).ok;
  out.warriorAxe = T.training(g, warrior, it('battle_axe')).ok;
  out.wizardSword = T.training(g, wizard, it('long_sword'));
  // the penalty: the same hero, a hand axe (trained) and a battle axe (heavy, untrained), both +0 to hit
  out.diff = T.attackBonus(g, ranger, it('hand_axe')) - T.attackBonus(g, ranger, it('battle_axe'));
  out.trait = T.weaponTrait(g, ranger, it('battle_axe'));
  out.handTrait = T.weaponTrait(g, ranger, it('hand_axe'))?.trait;
  g.settings.untrainedWeapons = 'forbid';
  out.forbid = T.canEquip(g, ranger, it('battle_axe'));
  g.settings.untrainedWeapons = 'penalty';
  g.settings.untrainedPenalty = 5;
  out.diff5 = T.attackBonus(g, ranger, it('hand_axe')) - T.attackBonus(g, ranger, it('battle_axe'));
  g.settings.untrainedPenalty = 3;
  // a class with no list is trained in everything; an older class that lists great blades is heavy-trained
  const k = g.classes.find((c) => c.id === 'wizard'), keep = [...k.weapons];
  k.weapons = [];
  out.noList = T.training(g, wizard, it('long_sword')).ok;
  k.weapons = keep;
  out.oldHeavy = T.heavyTrained({ weapons: ['blade', 'greatblade'] }) && !T.heavyTrained({ weapons: ['blade'] });
  out.text = T.traitText(T.kindOf(g, it('long_sword')));
  // the curve's own tools: heroic health, soak, dodging in light armour
  out.heroic = T.heroicHealth(g);
  const w2 = mk('human', 'warrior', 3); w2.equip.armor = 'chain_mail';
  out.soakChain = T.armorSoak(g, w2);
  w2.equip.armor = 'plate_armor'; out.soakPlate = T.armorSoak(g, w2);
  const wz6 = mk('human', 'wizard', 6); wz6.equip.armor = 'robe';
  out.dodge6 = T.dodgeBonus(g, wz6);
  out.dodgeChain = T.dodgeBonus(g, w2);
  return out;
});
check('a ranger may wield a battle axe, but untrained (it is a heavy weapon)', rules.rangerAxe.ok && rules.rangerAxe.untrained && /heavy weapons/.test(rules.rangerAxeWhy), rules);
check('…while a hand axe, a woodsman\'s tool, is trained in, trait and all; a warrior swings the battle axe trained', rules.rangerHand && rules.handTrait === 'hew' && rules.warriorAxe, rules);
check('a wizard is untrained with a long sword', !rules.wizardSword.ok && /blades/.test(rules.wizardSword.why), rules.wizardSword);
check('untrained is −3 to hit (the Rules\' penalty), and the kind\'s trait does not work', rules.diff === 3 && rules.diff5 === 5 && rules.trait === null, rules);
check('a realm that forbids it keeps the old hard rule', !rules.forbid.ok && /no training/.test(rules.forbid.why), rules.forbid);
check('a class with no list is trained in all; an older class listing great blades counts as heavy-trained', rules.noList && rules.oldHeavy, rules);
check('a trait reads plainly', rules.text === 'Parry: +1 armour against melee blows', rules.text);
check('heroic health, soak (chain 1, plate 2) and light-armour dodging (+2 by level 6, none in mail)', rules.heroic === 4 && rules.soakChain === 1 && rules.soakPlate === 2 && rules.dodge6 === 2 && rules.dodgeChain === 0, rules);

// ------------------------------------------------------------ older games
const old = await ev(() => {
  const sch = window.__schema, g = JSON.parse(sch.serializeGame(window.__app.session.game));
  delete g.weaponKinds; delete g.settings.tacticsV;
  for (const k of g.classes) delete k.heavyWeapons;
  const it = (id) => g.items.find((x) => x.id === id);
  it('chain_mail').ac = 4; it('plate_armor').ac = 7; delete it('battle_axe').heavy;
  g.items.push({ id: 'my_mail', name: 'My Mail', type: 'armor', weight: 'chain', ac: 4 });
  const gob = g.monsters.find((m) => m.id === 'goblin'); gob.hit = 4; gob.dmg = '1d6+2';
  const orc = g.monsters.find((m) => m.id === 'orc'); orc.hit = 9; // (a designer's own)
  const g2 = sch.deserializeGame(JSON.stringify(g));
  const it2 = (id) => g2.items.find((x) => x.id === id);
  return {
    kinds: (g2.weaponKinds || []).length, warrior: g2.classes.find((k) => k.id === 'warrior').heavyWeapons, ranger: g2.classes.find((k) => k.id === 'ranger').heavyWeapons,
    chain: it2('chain_mail').ac, plate: it2('plate_armor').ac, mine: it2('my_mail').ac, axe: it2('battle_axe').heavy,
    gob: [g2.monsters.find((m) => m.id === 'goblin').hit, g2.monsters.find((m) => m.id === 'goblin').dmg], orc: g2.monsters.find((m) => m.id === 'orc').hit,
    rules: [g2.settings.lastStand, g2.settings.breakAway, g2.settings.heroicHealth, g2.settings.untrainedWeapons],
  };
});
check('older games gain the weapon kinds, and the built-in callings their heavy-weapon training', old.kinds >= 10 && old.warrior === true && old.ranger === false, old);
check('…the built-in mail, plate, heavy weapons and first foes take their new figures; a designer\'s own are left alone', old.chain === 3 && old.plate === 5 && old.mine === 4 && old.axe === true && old.gob[0] === 3 && old.gob[1] === '1d6+1' && old.orc === 9, old);
check('…and the new rules, with their defaults', old.rules.join() === 'true,0.5,4,penalty', old.rules);

// ------------------------------------------------------------ training shown where gear is chosen
const shown = await ev(async () => {
  const s = window.__app.session, ui = window.__app.playUI, g = s.game;
  const ranger = s.party.members.find((m) => m.cls === 'ranger') || s.party.members[1];
  ranger.cls = 'ranger';
  s.party.inventory.battle_axe = 1;
  s.party.inventory.hand_axe = 1;
  ui.openParty();
  await new Promise((r) => setTimeout(r, 300));
  const row = [...document.querySelectorAll('.inv-row')].find((r) => r.textContent.includes('Battle Axe'));
  const chip = row && [...row.querySelectorAll('.cmp')].find((c) => c.textContent.includes(ranger.name));
  const title = row?.title || '';
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
  // the hero sheet, with the axe in hand
  const was = ranger.equip.weapon;
  window.__tactics.equipItem(g, ranger, g.items.find((x) => x.id === 'battle_axe'), s.party.inventory);
  ui.selectHero(ranger);
  await new Promise((r) => setTimeout(r, 300));
  const sheet = document.querySelector('.sheet-train')?.textContent || '';
  const num = !!document.querySelector('.num.untrained');
  return { chip: chip?.textContent || '', title, sheet, num, was, name: ranger.name };
});
check('the Pack\'s chip for an untrained piece says so', /untrained −3 hit/.test(shown.chip), shown.chip);
check('…its tooltip names the kind, the trait and who is trained in it', /Axe — Hew/.test(shown.title) && /Heavy/.test(shown.title) && /Trained: Warrior/.test(shown.title), shown.title);
check('the hero sheet says "Untrained: −3 to hit" and why, and lists the calling\'s training', /Untrained: −3 to hit/.test(shown.sheet) && /heavy weapons/.test(shown.sheet) && /trained with blades/.test(shown.sheet) && shown.num, shown.sheet);
await ev(() => document.querySelectorAll('.chbanner, .qbanner').forEach((e) => e.remove())); // (the opening chapter card would sit over the sheet)
await shot('tactics-sheet-training');
const shop = await ev(async () => {
  const s = window.__app.session, ui = window.__app.playUI;
  ui.closeHero();
  ui.openShop({ name: 'Smith', role: 'weapons', shop: { kind: 'weapons', stock: ['battle_axe', 'spear', 'long_sword'] }, look: {} });
  await new Promise((r) => setTimeout(r, 300));
  const row = [...document.querySelectorAll('.shop-row')].find((r) => r.textContent.includes('Battle Axe'));
  const txt = row ? [...row.querySelectorAll('.cmp')].map((c) => c.textContent).join(' | ') : '';
  // the swap card on hover
  const chip = row && [...row.querySelectorAll('.cmp')].find((c) => /untrained/.test(c.textContent));
  let card = '';
  if (chip?.tip) card = chip.tip().textContent;
  return { txt, card, title: row?.title || '' };
});
check('the shop\'s chips say who would wield it untrained', /untrained −3 hit/.test(shop.txt), shop.txt);
await shot('tactics-shop-untrained');
await ev(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));
// put the ranger's weapon back
await ev((was) => { const s = window.__app.session, g = s.game; const r = s.party.members.find((m) => m.cls === 'ranger'); const w = g.items.find((x) => x.id === was); if (w) window.__tactics.equipItem(g, r, w, s.party.inventory); }, shown.was);

// ------------------------------------------------------------ a battle to try it all in
await ev(() => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.level = 3; m.perkPending = 0; m.lvShown = 3; m.status = 'ok'; m.hp = window.__tactics.maxHp(s.game, m); m.mp = 40; }
  s.fight([{ id: 'goblin', n: 3 }], 'forest', {});
});
const heroUp = async () => {
  for (let i = 0; i < 160; i++) {
    if (await ev(() => { const b = window.__app.session.battle; return !!(b && b.active && !b.acting); })) return true;
    await wait(100);
  }
  return false;
};
check('a battle starts and a hero gets a turn', await heroUp());
await ev(() => {
  const s = window.__app.session, b = s.battle, g = s.game, T = window.__tactics;
  const rng = window.__delve.rng;
  window.__S = {
    b, g, s, T,
    it: (id) => g.items.find((x) => x.id === id),
    // a hero of a calling with a weapon in hand (the party member at i, turned into it)
    hero: (cls, i, weapon, ranged = null) => {
      const u = b.partyUnits[i];
      const m = u.member;
      m.cls = cls; m.level = 3; m.status = 'ok'; u.dead = false;
      m.equip.weapon = weapon || null; m.equip.ranged = ranged; m.equip.shield = null;
      m.hp = T.maxHp(g, m);
      return u;
    },
    put: (u, x, y) => { u.x = x; u.y = y; b.view.placeEntity(u.id, x, y); },
    // a clean slate: everyone along the far edge, n goblins with plenty of health
    reset: (n = 1, id = 'goblin') => {
      const def = g.monsters.find((m) => m.id === id);
      let foes = b.enemies.filter((e) => b.alive(e) && e.def.id === id);
      for (const e of b.enemies.filter((e) => b.alive(e) && e.def.id !== id)) { e.fled = true; b.view.removeEntity(e.id); }
      while (foes.length < n) { b.spawnEnemy(def); foes = b.enemies.filter((e) => b.alive(e) && e.def.id === id); }
      for (const e of foes.slice(n)) { e.fled = true; b.view.removeEntity(e.id); }
      foes = foes.slice(0, n);
      [...b.partyUnits, ...foes].forEach((u, i) => {
        u.st = {}; u.cd = {}; u.uses = {}; u.stun = 0; u.sleep = 0; u.fear = 0; u.reacted = false; u.charging = null; u.lastStood = false;
        if (u.member) { u.member.status = 'ok'; u.dead = false; u.member.hp = T.maxHp(g, u.member); } else { u.hp = u.maxHp = 200; }
        window.__S.put(u, i % 13, i < 13 ? 0 : 8);
      });
      return foes;
    },
    // a flat, open field (the logic tests; the pictures use the arena as it is)
    flat: () => { const k = b.arena.tiles[b.partyUnits[0].y * b.arena.w + b.partyUnits[0].x]; window.__S.saved = window.__S.saved || [...b.arena.tiles]; b.arena.tiles.fill(k); },
    unflat: () => { if (window.__S.saved) { b.arena.tiles.set(window.__S.saved); window.__S.saved = null; } },
    // steady dice: a d20 of 15, every chance taken (or none: chance(false))
    dice: (taken = true) => { const f = rng.f, c = rng.chance; rng.f = () => 0.7; rng.chance = () => taken; return () => { rng.f = f; rng.chance = c; }; },
    logs: (n = 8) => [...document.querySelectorAll('.log-line')].slice(-n).map((l) => l.textContent),
  };
});
const T = async (name, fn) => ev(async (src) => {
  const S = window.__S, ref = S.b.order, copy = [...ref], ti = S.b.turnIdx;
  try { return await (0, eval)(`(${src})`)(S); } catch (e) { return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') }; } finally {
    ref.length = 0; ref.push(...copy); S.b.order = ref; S.b.turnIdx = ti;
  }
}, fn.toString());

let r;
r = await T('untrained in battle', async (S) => {
  const { b } = S; S.flat(); const [g1] = S.reset(1);
  const u = S.hero('ranger', 0, 'hand_axe');
  S.put(u, 5, 4); S.put(g1, 6, 4);
  const trained = b.preview(u, g1);
  u.member.equip.weapon = 'battle_axe';
  const un = b.preview(u, g1);
  return { trained: trained.chance, un: un.chance, notes: un.notes, untrained: un.untrained };
});
check('in battle an untrained weapon shows "Untrained −3" on the odds card, and the odds fall', r.untrained && r.notes.includes('Untrained −3') && r.un < r.trained, r);

r = await T('parry and ward', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const sw = S.hero('warrior', 0, 'long_sword'), wz = S.hero('wizard', 1, 'quarterstaff');
  const ac = b.acOf(sw), melee = b.acOf(sw, 'melee'), ranged = b.acOf(sw, 'ranged');
  wz.member.equip.weapon = 'dagger'; const bare = b.acOf(wz);
  wz.member.equip.weapon = 'quarterstaff'; const ward = b.acOf(wz);
  // Ward: the wizard's Firebolt does a point more with the staff in hand
  S.put(wz, 5, 4); S.put(g1, 8, 4);
  const fb = S.g.abilities.find((a) => a.id === 'firebolt');
  const withStaff = b.preview(wz, g1, fb);
  wz.member.equip.weapon = 'dagger';
  const without = b.preview(wz, g1, fb);
  wz.member.equip.weapon = 'quarterstaff';
  return { ac, melee, ranged, bare, ward, staff: [withStaff.lo, withStaff.hi], dagger: [without.lo, without.hi] };
});
check('Parry: a trained blade is +1 armour against blows hand to hand, not against missiles', r.melee === r.ac + 1 && r.ranged === r.ac, r);
check('Ward: a staff is +1 armour, and +1 to a spell or skill\'s sure damage', r.ward === r.bare + 1 && r.staff[0] === r.dagger[0] + 1 && r.staff[1] === r.dagger[1] + 1, r);

r = await T('hew', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('warrior', 0, 'battle_axe');
  S.put(u, 5, 4); S.put(g1, 6, 4);
  const soft = b.preview(u, g1);
  g1.st.shielded = { rounds: 9, power: 4 }; // (armour 16)
  const hard = b.preview(u, g1);
  g1.st = {};
  return { soft: [soft.lo, soft.hi, soft.notes], hard: [hard.lo, hard.hi, hard.notes] };
});
check('Hew: an axe does +2 against a well-armoured foe (armour 14 or more), and says so', r.hard[0] === r.soft[0] + 2 && r.hard[2].some((n) => /^Hew \+2/.test(n)) && !r.soft[2].some((n) => /^Hew/.test(n)), r);

r = await T('stagger', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('cleric', 0, 'mace');
  S.put(u, 5, 4); S.put(g1, 6, 4);
  const note = b.preview(u, g1).notes;
  const undo = S.dice(true);
  try { await b.strike(u, g1); } finally { undo(); }
  const st = b.has(g1, 'staggered'), moves = b.movesFor(g1);
  b.endTurn(g1);
  return { note, st, moves, after: b.has(g1, 'staggered'), log: S.logs(3) };
});
check('Stagger: a mace\'s hit may leave the foe reeling — no moving on its next turn — then it passes', r.note.some((n) => /^Stagger 30%/.test(n)) && r.st && r.moves === 0 && !r.after && r.log.some((l) => /reels/.test(l)), r);

r = await T('reach', async (S) => {
  const { b } = S; const [g1, g2] = S.reset(2);
  const sp = S.hero('ranger', 0, 'spear'), wall = S.hero('warrior', 1, 'long_sword');
  S.put(sp, 5, 6); S.put(wall, 5, 5); S.put(g1, 5, 4); S.put(g2, 7, 7);
  const past = b.canAttack(sp, g1), note = b.preview(sp, g1).notes;
  S.put(g1, 6, 4); const diag = b.canAttack(sp, g1);
  S.put(wall, 9, 9); S.put(g1, 5, 4); S.put(g2, 5, 5); const pastFoe = b.inReach(sp, g1);
  // a hand axe does not reach
  sp.member.equip.weapon = 'hand_axe'; S.put(g2, 9, 4); const axe = b.canAttack(sp, g1);
  sp.member.equip.weapon = 'spear';
  // a set spear: a goblin stepping into reach takes a blow first
  S.put(g1, 5, 1); g1.reacted = false; sp.reacted = false;
  const hp = g1.hp;
  const undo = S.dice(true);
  try { await b.walkPath(g1, [[5, 2], [5, 3], [5, 4]]); } finally { undo(); }
  return { past, note, diag, pastFoe, axe, braced: sp.reacted, hurt: g1.hp < hp, log: S.logs(4) };
});
check('Reach: a spear strikes a foe two squares off in a line, past a companion; not corner-wise, not past a foe; an axe does not', r.past && r.note.includes('Reach (spear)') && !r.diag && !r.pastFoe && !r.axe, r);
check('…and a set spear strikes first at a foe that steps into reach', r.braced && r.hurt && r.log.some((l) => /sets the spear/.test(l)), r);

r = await T('sweep', async (S) => {
  const { b } = S; const [g1, g2] = S.reset(2);
  const u = S.hero('warrior', 0, 'great_sword');
  S.put(u, 5, 4); S.put(g1, 6, 4); S.put(g2, 5, 5);
  g1.hp = 1; const hp2 = g2.hp;
  const undo = S.dice(true);
  try { await b.strike(u, g1); } finally { undo(); }
  return { dead: !b.alive(g1), hurt: g2.hp < hp2, log: S.logs(4) };
});
check('Sweep: a great blade that fells a foe carries on into another beside its wielder', r.dead && r.hurt && r.log.some((l) => /swing carries on/.test(l)), r);

r = await T('quick', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('burglar', 0, 'dagger'), f = S.hero('warrior', 1, 'long_sword');
  S.put(u, 5, 4); S.put(g1, 6, 4); S.put(f, 7, 4);
  const pv = b.preview(u, g1);
  const kit = b.strikeKit(u, g1);
  u.member.equip.weapon = 'short_sword';
  const sword = b.strikeKit(u, g1).critMin;
  u.member.equip.weapon = 'dagger';
  return { notes: pv.notes, crit: kit.critMin, sword };
});
check('Quick: a dagger crits on one more number, and is +2 more when flanking', r.crit === r.sword - 1 && r.notes.includes('Quick +2') && r.notes.includes('Flanking +2'), r);

r = await T('missiles', async (S) => {
  const { b } = S; S.flat(); const [g1, g2] = S.reset(2);
  const ar = S.hero('ranger', 0, 'short_sword', 'short_bow');
  const rangeBow = b.weaponRange(ar);
  ar.member.cls = 'cleric'; const rangeUn = b.weaponRange(ar); ar.member.cls = 'ranger';
  void g1; void g2;
  return { rangeBow, rangeUn };
});
check('Far shot: a trained archer\'s bow reaches a square further than the same bow in an untrained hand', r.rangeBow === r.rangeUn + 1, r);

r = await T('cover, pierce, snap', async (S) => {
  const { b } = S; S.flat(); const [g1, g2] = S.reset(2);
  // a tree beside the goblin, on the side the shot comes from (a tree tile from the arena as it was)
  const W = b.arena.w;
  const treeKey = (() => { for (let i = 0; i < S.saved.length; i++) { const keep = b.arena.tiles[i]; b.arena.tiles[i] = S.saved[i]; const o = b.obstacle(i % W, Math.floor(i / W)); b.arena.tiles[i] = keep; if (o) return S.saved[i]; } return null; })();
  const ar = S.hero('ranger', 0, 'short_sword', 'short_bow');
  S.put(ar, 5, 7); S.put(g1, 5, 3); S.put(g2, 12, 0);
  b.arena.tiles[4 * W + 5] = treeKey;
  const bow = b.preview(ar, g1);
  ar.member.equip.ranged = 'crossbow'; ar.member.cls = 'warrior';
  const xbow = b.preview(ar, g1);
  // a sling beside a foe: no engaged penalty
  ar.member.cls = 'cleric'; ar.member.equip.ranged = 'sling';
  S.put(g2, 6, 7);
  const sling = b.preview(ar, g1);
  ar.member.cls = 'ranger'; ar.member.equip.ranged = 'short_bow';
  const engaged = b.preview(ar, g1);
  S.unflat();
  return { tree: treeKey != null, bow: bow.notes, cover: bow.cover, xbow: xbow.notes, sling: sling.notes, engaged: engaged.notes };
});
check('Cover −3 comes first on the odds card', r.tree && r.cover && r.bow[0] === 'Cover −3', r);
check('Pierce: a crossbow ignores the cover; Snap shot: a sling has no engaged penalty, a bow has', r.xbow.includes('Pierce: cover ignored') && !r.xbow.includes('Cover −3')
  && r.sling.includes('Snap shot: not engaged') && !r.sling.includes('Engaged −4') && r.engaged.includes('Engaged −4'), r);

// ------------------------------------------------------------ breaking away
r = await T('break odds', async (S) => {
  const { b } = S; S.flat(); const [g1] = S.reset(1);
  const u = S.hero('wizard', 0, 'quarterstaff');
  S.put(u, 5, 4); S.put(g1, 6, 4);
  const m = u.member, base = m.dex;
  m.level = 1; g1.def = { ...g1.def }; g1.def.level = 1; g1.def.reflex = 0; m.dex = 10;
  const even = b.breakChance(g1, u);
  m.dex = 16; const nimble = b.breakChance(g1, u);
  m.dex = 10; m.level = 5; const seasoned = b.breakChance(g1, u);
  m.level = 1; g1.def.level = 7; const brute = b.breakChance(g1, u);
  g1.def.level = 1;
  // the other way: a goblin running from a level-5 hero
  m.level = 5; const fleeing = b.breakChance(u, g1);
  m.level = 3; m.dex = base;
  b.game.settings.breakAway = 1; const always = b.breakChance(g1, u); b.game.settings.breakAway = 0.5;
  return { even, nimble, seasoned, brute, fleeing, always };
});
check('breaking away: an even match is a coin toss; Dexterity and levels tilt it (15–90%)', r.even === 0.5 && r.nimble === 0.35 && r.seasoned < 0.25 && r.brute >= 0.85 && r.brute <= 0.9, r);
check('…a high-level hero lands more free strikes on a foe that runs; Rules can make it certain again', r.fleeing >= 0.8 && r.always === 1, r);

r = await T('break rolled', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('wizard', 0, 'quarterstaff');
  S.put(u, 5, 4); S.put(g1, 6, 4);
  const hp = S.T.maxHp(S.g, u.member);
  let undo = S.dice(false);
  try { await b.provoke(u, 4, 4); } finally { undo(); }
  const slip = { log: S.logs(2), hp: u.member.hp, reacted: g1.reacted };
  g1.reacted = false; S.put(u, 5, 4);
  undo = S.dice(true);
  try { await b.provoke(u, 4, 4); } finally { undo(); }
  return { slip, struck: { log: S.logs(3), hp: u.member.hp }, full: hp };
});
check('…the roll: slipping away is logged and spends the foe\'s reaction; a landed free strike is logged too', r.slip.log.some((l) => /slips away from the Goblin/.test(l)) && r.slip.hp === r.full && r.slip.reacted
  && r.struck.log.some((l) => /strikes at .* as they break away/.test(l)), r);

r = await T('withdraw', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('wizard', 0, 'quarterstaff');
  S.put(u, 5, 4); S.put(g1, 6, 4);
  u.moves = 3; u.maxMoves = 3;
  const can = b.canWithdraw(u);
  const squares = b.withdrawSquares(u).map((c) => `${c.x},${c.y}`);
  // straight through the battle's own action (the hero whose turn it is)
  const was = b.active; b.active = u;
  const undo = S.dice(true);
  let ok;
  try { ok = await b.actWithdraw(4, 4, u); } finally { undo(); b.active = was; }
  return { can, squares, at: [u.x, u.y], moves: u.moves, hp: u.member.hp, full: S.T.maxHp(S.g, u.member), reacted: g1.reacted, log: S.logs(2), far: b.canWithdraw({ ...u, x: 1, y: 1, moves: 2 }) };
});
check('Withdraw: one square back, the rest of the moves given up, and no free strike even on a sure roll', r.can.ok && r.squares.includes('4,4') && r.at.join() === '4,4' && r.moves === 0 && r.hp === r.full && !r.reacted && r.log.some((l) => /withdraws/.test(l)), r);

// ------------------------------------------------------------ soak, the last stand, gentler criticals
r = await T('soak and last stand', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('warrior', 0, 'long_sword');
  u.member.equip.armor = 'chain_mail';
  S.put(u, 5, 4); S.put(g1, 6, 4);
  const full = S.T.maxHp(S.g, u.member); u.member.hp = full;
  const undo = S.dice(true);
  let r1, r2, r3;
  try {
    r1 = await b.strike(g1, u); // a goblin's blow on chain mail
    u.member.hp = full;
    await b.damage(u, full + 20, { by: g1, from: g1 });
    r2 = { hp: u.member.hp, stood: u.lastStood, log: S.logs(2) };
    u.member.hp = full;
    await b.damage(u, full + 20, { by: g1, from: g1 });
    r3 = { hp: u.member.hp, dead: !b.alive(u) };
  } finally { undo(); }
  // put the hero back on their feet
  u.member.status = 'ok'; u.dead = false; u.member.hp = full; S.T.normalizeMember(S.g, u.member, {});
  b.view.addEntity(u.id, window.__app.session.battle ? { kind: 'humanoid' } : {}, u.x, u.y);
  return { soaked: r1.soaked, r2, r3 };
});
check('mail soaks a point from a blow that lands (and the log says so)', r.soaked === 1, r);
check('Last stand: a hero in good health survives a felling blow on 1 health, once a battle; the next one is real', r.r2.hp === 1 && r.r2.stood && r.r2.log.some((l) => /Last stand/.test(l)) && r.r3.dead, r);

r = await T('gentle crits', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const u = S.hero('wizard', 0, 'quarterstaff');
  u.member.equip.armor = 'robe';
  S.put(u, 5, 4); S.put(g1, 6, 4);
  u.face = [1, 0]; g1.face = [-1, 0]; // (face to face: no blow from behind)
  const rng = window.__delve.rng, f = rng.f;
  const dmg = [];
  try {
    for (let i = 0; i < 12; i++) {
      u.member.hp = 999; u.lastStood = true;
      let k = 0; rng.f = () => (k++ === 0 ? 0.999 : (i + 0.5) / 12); // a natural 20, then the dice
      const res = await b.strike(g1, u);
      dmg.push(res.dmg);
    }
  } finally { rng.f = f; u.member.hp = S.T.maxHp(S.g, u.member); u.lastStood = false; }
  return { dmg, lo: Math.min(...dmg), hi: Math.max(...dmg), max: b.strikeKit(g1, u).max };
});
check('a monster\'s critical on a hero is its weapon\'s most and one die more, not double (a goblin: 8–13, not up to 14)', r.lo >= r.max + 1 && r.hi <= r.max + 6, r);

// ------------------------------------------------------------ what the player sees: odds on the path, cover marks
// a real arena: an orc archer beyond a tree, a goblin beside the wizard, and a square of cover to step into
await ev(() => document.querySelectorAll('.log-line').forEach((l) => l.remove())); // (the pictures need not show the test blows above)
const scene = await T('scene', async (S) => {
  const { b, g } = S;
  S.unflat();
  const [g1] = S.reset(1);
  const W = b.arena.w, H = b.arena.h;
  // a tree with open ground south of it (the wizard steps from y+2 to y+1,
  // into its lee, leaving the goblin at y+3) and an open square north of it
  // for the archer (at y-3 now, at y-1 when the ranger aims at it)
  // (the arena is random: a tree is planted where the scene needs one, and
  // the squares round it cleared, so the pictures are the same every run)
  const spot = { x: 5, y: 3 };
  const treeAt = b.arena.tiles.findIndex((t, i) => b.obstacle(i % W, Math.floor(i / W)) && b.arena.tiles[i] !== undefined);
  const tree = treeAt >= 0 ? b.arena.tiles[treeAt] : null;
  if (tree == null) return { skipped: true };
  const ground = b.arena.tiles[(H - 2) * W + 6];
  for (const [dx, dy] of [[0, 1], [0, 2], [0, 3], [1, 3], [0, -1], [0, -2], [0, -3], [1, 0], [2, 1], [3, 2], [-1, 1], [1, 1], [-1, 2], [1, 2], [-1, 0], [-2, 0], [2, 2], [3, 3], [2, 3], [-1, -1]]) {
    const x = spot.x + dx, y = spot.y + dy;
    if (x >= 0 && y >= 0 && x < W && y < H) b.arena.tiles[y * W + x] = ground;
  }
  b.arena.tiles[spot.y * W + spot.x] = tree;
  b.view.refreshTiles(0, 0, W - 1, H - 1);
  const archer = b.spawnEnemy(g.monsters.find((m) => m.id === 'orc_archer'));
  archer.hp = archer.maxHp = 200;
  const u = S.hero('wizard', 0, 'quarterstaff'), w = S.hero('warrior', 1, 'long_sword');
  S.put(archer, spot.x, spot.y - 3);
  S.put(u, spot.x, spot.y + 2); S.put(g1, spot.x, spot.y + 3); S.put(w, spot.x + 1, spot.y + 3);
  for (const p of b.partyUnits.slice(2)) S.put(p, 11 + (b.partyUnits.indexOf(p) % 2), 7 + (b.partyUnits.indexOf(p) > 3 ? 1 : 0));
  u.face = [0, 1]; g1.face = [0, -1];
  b.active = u; u.moves = 3; u.maxMoves = 3;
  window.__app.playUI.combatTurn(u);
  return { spot, archer: archer.id };
});
check('a scene for the pictures: an archer beyond a tree, a goblin beside the wizard', !scene.skipped, scene);
await wait(400);
const marks = await ev(() => [...document.querySelectorAll('.cbt-mark.cover')].length);
check('while a hero moves, the squares in cover from the foe\'s archer carry a shield', marks > 0, marks);
// hover the square behind the tree (in cover, breaking away from the goblin)
const hoverAt = (x, y, dx = 0, dy = 0) => ev(({ x, y, dx, dy }) => {
  const chud = window.__app.playUI.chud;
  const p = chud.view.worldToScreen(x + 0.5, chud.view.heightAt(x, y), y + 0.5);
  chud.hover({ x, y }, { clientX: p.x + dx, clientY: p.y + dy });
  return document.querySelector('.cbt-tip')?.textContent || '';
}, { x, y, dx, dy }); // (dx, dy: where the card goes, clear of the scene)
const tip = await hoverAt(scene.spot.x, scene.spot.y + 1, 90, -10);
check('hovering a square that leaves a foe\'s reach says "Leaving the Goblin: 50% it strikes" (as the odds are)', /Leaving the Goblin: \d+% it strikes/.test(tip), tip);
check('…and one in cover names the archer it shelters you from', /In cover from the Orc Archer/.test(tip), tip);
const odds = await ev(() => [...document.querySelectorAll('.cbt-mark.odds')].map((e) => e.textContent));
check('…while the path marks the square where the foe may strike, with its odds', odds.length === 1 && /\d+%/.test(odds[0]), odds);
await wait(250);
await shot('tactics-move-preview');
// aiming at a foe in cover: the shield over its head, and Cover first on the odds card
const aim = await ev(async (sc) => {
  const S = window.__S, b = S.b, ui = window.__app.playUI;
  const u = b.active, archer = b.units.find((x) => x.id === sc.archer);
  const g1 = b.enemies.find((e) => b.alive(e) && e.def.id === 'goblin');
  // the archer just west of the tree, the ranger with a bow off to the
  // south-east on the slant (the tree shelters the archer but does not block
  // the line; standing beside it, not behind it, the tree is not drawn
  // see-through as scenery in front of a figure is); the others out of the way
  S.put(g1, 12, 8); S.put(u, 0, 8);
  const ra = S.hero('ranger', 2, 'short_sword', 'short_bow');
  S.put(archer, sc.spot.x - 1, sc.spot.y);
  let best = null;
  for (let y = sc.spot.y + 1; y < b.arena.h; y++) for (let x = sc.spot.x + 1; x < b.arena.w; x++) {
    if (!b.walkable(x, y, ra) && !(x === ra.x && y === ra.y)) continue;
    const at = { ...ra, x, y };
    if (b.dist(at, archer) < 3 || b.dist(at, archer) > b.weaponRange(ra) || !b.lineClear(at, archer) || !b.inCover(archer, at)) continue;
    if (!best || b.dist(at, archer) < b.dist(best, archer)) best = { x, y };
  }
  if (best) S.put(ra, best.x, best.y);
  b.active = ra; ra.moves = 0; ra.maxMoves = 3;
  ui.combatTurn(ra);
  await new Promise((r) => setTimeout(r, 200));
  ui.chud.beginAttack();
  await new Promise((r) => setTimeout(r, 200));
  const badge = !!document.querySelector('.pl-cover');
  return { badge, ok: b.canAttack(ra, archer), cover: b.inCover(archer, ra), tree: b.obstacle(sc.spot.x, sc.spot.y), archer: [archer.x, archer.y], ranger: [ra.x, ra.y] };
}, scene);
check('aiming a shot, a foe in cover from the hero wears a shield badge', aim.badge && aim.cover, aim);
const card = await hoverAt(scene.spot.x - 1, scene.spot.y, 250, -60);
check('…and the odds card puts "Cover −3" first, with its shield', /to hit/.test(card) && (await ev(() => document.querySelector('.cbt-tip .pv-notes span')?.classList.contains('cover'))), card);
await wait(200);
// (the pointer's square cuts a window through the scenery round it: put it away, so the tree that gives the cover shows)
await ev(() => window.__app.playUI.chud.view.showCursor(null));
await wait(150);
await shot('tactics-odds-cover');
await ev(() => window.__app.playUI.cancelTargeting());
// a spear's reach, from the second rank
const reachShot = await T('reach picture', async (S) => {
  const { b } = S;
  const [g1] = S.reset(1);
  const sp = S.hero('ranger', 0, 'spear'), wall = S.hero('warrior', 1, 'long_sword');
  const W = b.arena.w;
  let at = null;
  // (along a row: from the camera's angle a column of three figures hides itself)
  for (const y of [5, 4, 6, 3]) for (let x = 4; x < W - 4 && !at; x++) if (!at && b.walkable(x, y, null) && b.walkable(x + 1, y, null) && b.walkable(x + 2, y, null)) at = { x, y };
  S.put(sp, at.x, at.y); S.put(wall, at.x + 1, at.y); S.put(g1, at.x + 2, at.y);
  sp.face = [1, 0]; wall.face = [1, 0]; g1.face = [-1, 0];
  b.view.face?.(sp.id, 1, 0); b.view.face?.(wall.id, 1, 0); b.view.face?.(g1.id, -1, 0);
  for (const p of b.partyUnits.slice(2)) S.put(p, 12, 8 - b.partyUnits.indexOf(p));
  b.active = sp; sp.moves = 0; sp.maxMoves = 3;
  window.__app.playUI.combatTurn(sp);
  await new Promise((r) => setTimeout(r, 200));
  return { reach: b.canAttack(sp, g1), at };
});
const spearCard = await hoverAt(reachShot.at.x + 2, reachShot.at.y, 60, -230);
check('a spear in the second rank reaches over its companion (red foe in reach, "Reach (spear)" on the card)', reachShot.reach && /Reach \(spear\)/.test(spearCard), spearCard);
await wait(200);
await shot('tactics-spear-reach');
// the action bar has Withdraw (R)
const bar = await ev(() => [...document.querySelectorAll('.cbt-btn .cb-name')].map((e) => e.textContent));
check('the action bar offers Withdraw beside Move', bar.includes('Withdraw') && bar.indexOf('Withdraw') === bar.indexOf('Move') + 1, bar);

// ------------------------------------------------------------ the Construction Set
await ev(() => { const s = window.__app.session; if (s.battle) s.battle.abort(); });
const cs = await ev(async () => {
  const app = window.__app;
  const g = app.session?.game || app.sample;
  const out = {};
  // the World Data categories, as the editor builds them
  const cats = window.__editorCats ? window.__editorCats(g) : null;
  out.cats = cats ? Object.keys(cats) : null;
  if (cats) {
    const f = (c, key) => cats[c].fields.find((x) => x.key === key);
    out.classWeapons = f('classes', 'weapons')?.label;
    out.heavy = !!f('classes', 'heavyWeapons');
    out.kindTrait = !!f('weaponKinds', 'trait');
    out.soak = !!f('items', 'soak');
    out.reflex = !!f('monsters', 'reflex');
  }
  return out;
});
check('World Data: weapon kinds with their traits; classes say what they are trained in, and heavy weapons; armour soak; monsters\' reflexes',
  cs.cats?.includes('weaponKinds') && /trained in/.test(cs.classWeapons || '') && cs.heavy && cs.kindTrait && cs.soak && cs.reflex, cs);
// …and in the editor itself: the weapon kinds, a calling's training, the Rules' battle section
const ed = await ev(async () => {
  const app = window.__app;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  app.stopSession?.();
  app.openEditor(app.sample);
  await sleep(1200);
  const e = app.editor;
  e.setTab('data');
  e.db.cat = 'weaponKinds'; e.db.sel = e.game.weaponKinds.find((k) => k.id === 'spear'); e.db.render();
  await sleep(300);
  const kinds = [...document.querySelectorAll('.entry-list .entry')].map((b) => b.textContent);
  const info = document.querySelector('.form .hint')?.textContent || '';
  return { kinds, info };
});
check('the editor lists the weapon kinds, and a kind\'s form says what its trait does', ed.kinds.includes('Spear') && ed.kinds.length >= 10 && /strikes a foe 2 squares off/.test(ed.info), ed);
await shot('tactics-cs-weapon-kinds');
const edc = await ev(async () => {
  const e = window.__app.editor;
  e.db.cat = 'classes'; e.db.sel = e.game.classes.find((k) => k.id === 'ranger'); e.db.render();
  await new Promise((r) => setTimeout(r, 300));
  const field = [...document.querySelectorAll('.field')].find((f) => /Weapons trained in/.test(f.textContent));
  field?.scrollIntoView({ block: 'center' });
  const ticks = field ? [...field.querySelectorAll('label.mc')].filter((l) => l.querySelector('input').checked).map((l) => l.textContent) : [];
  const heavy = [...document.querySelectorAll('label.field.check')].find((l) => /heavy weapons/.test(l.textContent))?.querySelector('input')?.checked;
  return { ticks, heavy };
});
check('a calling\'s form ticks the kinds it is trained in, and says whether heavy weapons too (a ranger: axes, yes; heavy, no)', edc.ticks.some((t) => /^Axe/.test(t)) && edc.heavy === false, edc);
await shot('tactics-cs-class-training');
const rulesStep = await ev(async () => {
  const e = window.__app.editor;
  e.setTab('rules');
  await new Promise((r) => setTimeout(r, 300));
  const sec = document.querySelector('#set-battle');
  sec?.scrollIntoView({ block: 'start' });
  return sec ? [...sec.querySelectorAll('.field-label')].map((l) => l.textContent) : [];
});
check('Rules has a Battle section: untrained weapons and their penalty, heroic health, the last stand, breaking away, light armour\'s dodge',
  ['A weapon a hero is not trained in', 'Untrained: to hit', 'Heroic health', 'Last stand', 'Breaking away: chance of a free strike', 'Light armour dodges: +1 armour every … levels'].every((l) => rulesStep.includes(l)), rulesStep);
await shot('tactics-cs-rules-battle');

check('no errors in the page', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nall tactics checks passed');
process.exit(fails.length ? 1 : 0);
