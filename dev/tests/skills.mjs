// Skills heroes learn as they rise: each calling's skills at levels 1–9, the
// battle arts any hero can learn among the talents, every new mechanic in a
// battle (called creatures, traps and zones, pulls, chains, finishing blows,
// purses, thrown knives, extra turns, raising the fallen, guards, ripostes,
// marks, sanctuary, bewilderment, the dawn's ward), the denser battle bar and
// its keys, the level-up card, the editor's fields, older games, and a fight
// on a dungeon floor.
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
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined && !ok ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
await wait(500);
const closeModals = () => ev(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));
// the victory window comes a moment after a battle: wait for it and leave it by its button
const closeVictory = () => ev(async () => {
  for (let i = 0; i < 60 && !document.querySelector('.victory-modal'); i++) await new Promise((r) => setTimeout(r, 100));
  const btn = [...document.querySelectorAll('.victory-modal button')].find((x) => /Onward/.test(x.textContent));
  btn?.click();
  await new Promise((r) => setTimeout(r, 200));
  return !!btn;
});

// ------------------------------------------------------------ the rules: who learns what, when
const rules = await ev(() => {
  const S = window.__skills, g = window.__app.session.game;
  S.ensureCombatData(g);
  const out = { classes: {}, missing: [] };
  for (const k of g.classes) {
    const list = S.classSkills(k);
    out.classes[k.id] = list.map((s) => s.level).join(',');
    for (const s of list) if (!g.abilities.some((a) => a.id === s.id)) out.missing.push(s.id);
  }
  const w = window.__app.session.party.members.find((m) => m.cls === 'warrior');
  const was = w.level;
  const at = (L) => { w.level = L; return S.heroAbilities(g, w).map((a) => a.id); };
  out.l4 = at(4); out.l5 = at(5); out.l9 = at(9);
  w.level = 5;
  out.locked5 = S.lockedAbilities(g, w).map((x) => `${x.ab.id}@${x.level}`);
  out.new5 = S.newAtLevel(g, w);
  out.note5 = S.levelUpNote(w, g);
  // older games: a plain list is learned by its place (1, 3, 5…), the special at specialLevel
  const k = g.classes.find((c) => c.id === 'warrior');
  const keep = JSON.stringify(k.skills);
  k.skills = ['shield_bash', 'taunt', 'riposte'];
  out.plain = S.classSkills(k).map((s) => `${s.id}@${s.level}`);
  w.level = 4; out.plain4 = S.heroAbilities(g, w).map((a) => a.id);
  w.level = 5; out.plain5 = S.heroAbilities(g, w).map((a) => a.id);
  k.specialLevel = 6;
  w.level = 5; out.spec5 = S.heroAbilities(g, w).some((a) => a.id === k.special);
  w.level = 6; out.spec6 = S.heroAbilities(g, w).some((a) => a.id === k.special);
  delete k.specialLevel;
  k.skills = JSON.parse(keep);
  w.level = was;
  out.arts = S.battleArts(g).map((a) => `${a.id}@${a.level || 2}`);
  return out;
});
check('every built-in calling learns five skills, at levels 1, 3, 5, 7 and 9', Object.values(rules.classes).every((l) => l === '1,3,5,7,9') && !rules.missing.length, rules);
check('a warrior has two skills at level 4 and Shield Wall at 5; all five by level 9', !rules.l4.includes('shield_wall') && rules.l5.includes('shield_wall') && ['riposte', 'finishing_blow'].every((id) => rules.l9.includes(id)), rules);
check('the sheet knows what is still to come, and when', rules.locked5.join() === 'riposte@7,finishing_blow@9', rules.locked5);
check('a level-up says which skill was learned', rules.new5.includes('Shield Wall') && /learns Shield Wall/.test(rules.note5), rules.note5);
check('older games: a plain list of skills is learned at 1, 3, 5…', rules.plain.join() === 'shield_bash@1,taunt@3,riposte@5' && !rules.plain4.includes('riposte') && rules.plain5.includes('riposte'), rules);
check('a class can say when its special comes', !rules.spec5 && rules.spec6, rules);
check('there are battle arts for any calling (8 or more)', rules.arts.length >= 8, rules.arts);

// ------------------------------------------------------------ battle arts among the talents
const arts = await ev(() => {
  const S = window.__skills, g = window.__app.session.game;
  const m = window.__app.session.party.members.find((x) => x.cls === 'wizard');
  const save = JSON.stringify({ level: m.level, xp: m.xp, perks: m.perks, arts: m.arts, perkPending: m.perkPending, lastPick: m.lastPick });
  const out = {};
  m.level = 3; m.perkPending = 1; m.arts = [];
  out.odd = S.perkChoices(g, m).map((p) => p.id);
  m.level = 4;
  out.even = S.perkChoices(g, m).map((p) => p.id);
  out.same = JSON.stringify(S.perkChoices(g, m).map((p) => p.id)) === JSON.stringify(out.even);
  const art = S.perkChoices(g, m).find((p) => p.art);
  out.learned = art ? S.choosePerk(g, m, art.id) : false;
  out.arts = m.arts.map((a) => `${a.id}@${a.level}`);
  out.bar = S.heroAbilities(g, m).map((a) => a.id);
  out.last = S.lastPick(g, m)?.name;
  // the art keeps its place on the bar when a later class skill comes
  m.level = 5;
  out.bar5 = S.heroAbilities(g, m).map((a) => a.id);
  // a hero's own class skill is never offered as an art; a ranged art needs a calling with bows
  out.offered = S.artsInReach(g, m, 6).map((a) => a.id);
  Object.assign(m, JSON.parse(save));
  return out;
});
check('odd levels offer talents only; even levels one battle art among three', arts.odd.every((id) => !id.startsWith('art:')) && arts.even.filter((id) => id.startsWith('art:')).length === 1 && arts.even.length === 3 && arts.same, arts);
check('choosing the art learns it: it joins the battle bar before the ★ special', arts.learned && arts.arts.length === 1 && arts.bar.includes(arts.arts[0].split('@')[0]) && arts.bar[arts.bar.length - 1] === 'blink' && !!arts.last, arts);
check('a skill learned later goes after the art, so keys never move', arts.bar5.indexOf(arts.arts[0].split('@')[0]) < arts.bar5.indexOf('arc_lightning'), arts);
check('an art already known is not offered again', !arts.offered.includes(arts.arts[0]?.split('@')[0]), arts.offered);

// ------------------------------------------------------------ older games gain the new skills
const migr = await ev(() => {
  const S = window.__skills, app = window.__app, sch = window.__schema;
  const g = sch.cloneGame(app.session.game);
  const newIds = new Set(g.classes.flatMap((k) => S.classSkills(k).filter((s) => s.level > 3).map((s) => s.id)));
  g.abilities = g.abilities.filter((a) => !a.general && !newIds.has(a.id));
  g.monsters = g.monsters.filter((m) => m.id !== 'stone_warden');
  for (const k of g.classes) k.skills = S.classSkills(k).filter((s) => s.level <= 3).map((s) => s.id);
  g.classes.find((k) => k.id === 'cleric').skills = ['smite', 'healing_word']; // a designer's own order
  delete g.skillsV;
  const g2 = sch.deserializeGame(sch.serializeGame(g));
  S.ensureCombatData(g2);
  return {
    v: g2.skillsV, arts: S.battleArts(g2).length,
    warrior: S.classSkills(g2.classes.find((k) => k.id === 'warrior')).map((s) => s.level).join(),
    cleric: JSON.stringify(g2.classes.find((k) => k.id === 'cleric').skills),
    warden: g2.monsters.some((m) => m.id === 'stone_warden'), wolf: g2.abilities.some((a) => a.id === 'spirit_wolf'),
  };
});
check('older games gain the battle arts and the new skills of callings still on their first two', migr.v >= 1 && migr.arts >= 8 && migr.warrior === '1,3,5,7,9' && migr.warden && migr.wolf, migr);
check('a calling the designer changed is left as it was', migr.cleric === '["smite","healing_word"]', migr.cleric);

// ------------------------------------------------------------ a battle to try every skill in
await ev(() => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.level = 10; m.perkPending = 0; m.lvShown = 10; m.status = 'ok'; m.hp = window.__skills.maxHp(s.game, m); m.mp = 60; }
  s.fight([{ id: 'goblin', n: 3 }], 'grass', {});
});
const heroUp = async () => {
  for (let i = 0; i < 160; i++) {
    if (await ev(() => { const b = window.__app.session.battle; return !!(b && b.active && !b.acting); })) return true;
    await wait(100);
  }
  return false;
};
check('a battle starts and a hero gets a turn', await heroUp());
// helpers in the page: a flat field, units parked out of the way, foes at will
await ev(() => {
  const s = window.__app.session, b = s.battle, g = s.game;
  const walk = b.arena.tiles[b.partyUnits[0].y * b.arena.w + b.partyUnits[0].x];
  b.arena.tiles.fill(walk);
  const rng = window.__delve.rng;
  window.__S = {
    b, g, s,
    ab: (id) => g.abilities.find((a) => a.id === id),
    // the hero of a calling (a party member turned into it, at level 10)
    hero: (cls, i = 0) => {
      const u = b.partyUnits[i];
      u.member.cls = cls; u.member.level = 10; u.member.status = 'ok'; u.dead = false;
      u.member.hp = window.__skills.maxHp(g, u.member);
      return u;
    },
    put: (u, x, y) => { u.x = x; u.y = y; b.view.placeEntity(u.id, x, y); },
    // a clean slate: everyone parked along the far edge, n goblins with plenty of health
    reset: (n = 1) => {
      for (const p of b.pets) { p.fled = true; b.view.removeEntity(p.id); }
      for (const mk of [...b.marks]) b.removeMark(mk);
      const def = g.monsters.find((m) => m.id === 'goblin');
      let foes = b.enemies.filter((e) => b.alive(e));
      while (foes.length < n) { b.spawnEnemy(def); foes = b.enemies.filter((e) => b.alive(e)); }
      for (const e of foes.slice(n)) { e.fled = true; b.view.removeEntity(e.id); }
      foes = foes.slice(0, n);
      const all = [...b.partyUnits, ...foes];
      all.forEach((u, i) => {
        u.st = {}; u.cd = {}; u.uses = {}; u.stun = 0; u.sleep = 0; u.fear = 0; u.reacted = false; u.charging = null; u.robbed = false;
        if (u.member) { u.member.status = 'ok'; u.dead = false; u.member.hp = window.__skills.maxHp(g, u.member); }
        else { u.hp = u.maxHp = 200; }
        window.__S.put(u, i % 13, i < 13 ? 0 : 8);
      });
      return foes;
    },
    hp: (u) => b.hpOf(u),
    // steady dice: every roll in the middle, a d20 of 15, every chance taken
    steady: () => { const f = rng.f, c = rng.chance; rng.f = () => 0.7; rng.chance = () => true; return () => { rng.f = f; rng.chance = c; }; },
    logs: () => [...document.querySelectorAll('.log-line')].slice(-8).map((l) => l.textContent),
  };
  // the foes are easy to hit for these tests (put back afterwards, with everyone's calling)
  window.__gobAc = g.monsters.find((m) => m.id === 'goblin').ac;
  window.__cls = s.party.members.map((m) => m.cls);
  g.monsters.find((m) => m.id === 'goblin').ac = 1;
});

// each mechanic, one at a time
const T = async (name, fn) => {
  const r = await ev(async (src) => {
    // (the battle is waiting on a hero's turn: its order of turns is put back afterwards)
    const S = window.__S, undo = S.steady(), ref = S.b.order, copy = [...ref], ti = S.b.turnIdx;
    try { return await (0, eval)(`(${src})`)(S); } catch (e) { return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') }; } finally {
      undo();
      ref.length = 0; ref.push(...copy); S.b.order = ref; S.b.turnIdx = ti;
    }
  }, fn.toString());
  return r;
};
let r;

// Warrior
r = await T('shield wall', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const w = S.hero('warrior', 0), a = S.hero('wizard', 1);
  S.put(w, 5, 4); S.put(a, 6, 4); S.put(g1, 7, 4);
  const used = await b.useAbility(w, S.ab('shield_wall'), a);
  const guarded = a.st.guarded?.src === w;
  const redirect = await b.guardFor(g1, a);
  const hpA = S.hp(a), hpW = S.hp(w);
  const d0 = g1.def; g1.def = { ...g1.def, hit: 30 }; // (a sure blow: the warrior's armour and parry are not what is tested here)
  try { await b.strike(g1, a); } finally { g1.def = d0; }
  return { used, guarded, redirect: redirect === w, aSafe: S.hp(a) === hpA, wHit: S.hp(w) < hpW, shield: b.power(w, 'shielded') };
});
check('Shield Wall: blows aimed at the guarded companion strike the warrior instead', r.used && r.guarded && r.redirect && r.aSafe && r.wHit && r.shield === 2, r);

r = await T('riposte', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const w = S.hero('warrior', 0);
  S.put(w, 5, 4); S.put(g1, 6, 4);
  await b.useAbility(w, S.ab('riposte'), null);
  const hp = S.hp(g1);
  await b.strike(g1, w);
  return { st: !!w.st.riposte, struckBack: S.hp(g1) < hp, reacted: w.reacted };
});
check('Riposte: a foe that swings at the warrior is struck back at once', r.st && r.struckBack && r.reacted, r);

r = await T('finishing blow', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const w = S.hero('warrior', 0);
  S.put(w, 5, 4); S.put(g1, 6, 4);
  const ab = S.ab('finishing_blow');
  const healthy = b.preview(w, g1, ab);
  g1.hp = 30; // under a third of 200
  const pv = b.preview(w, g1, ab);
  await b.useAbility(w, ab, g1);
  return { healthy: healthy.chance, wounded: pv.chance, notes: pv.notes, double: pv.lo >= healthy.lo * 2 - 1, hp: g1.hp };
});
check('Finishing Blow: a foe at a third of its health is struck surely, for double', r.wounded === 1 && r.notes.some((n) => /Wounded/.test(n)) && r.double && r.hp < 30, r);

// Ranger
r = await T('hunters mark', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const ra = S.hero('ranger', 0), w = S.hero('warrior', 1);
  S.put(ra, 2, 6); S.put(w, 7, 3); S.put(g1, 7, 2);
  const before = b.preview(w, g1);
  const used = await b.useAbility(ra, S.ab('hunters_mark'), g1);
  const after = b.preview(w, g1);
  return { free: used === false, marked: !!g1.st.marked, hitUp: after.chance >= before.chance, dmgUp: after.lo === before.lo + 2, note: after.notes.some((n) => /Marked/.test(n)) };
});
check('Hunter\'s Mark: a free action; every attack on the marked foe is +2 to hit and +2 damage', r.free && r.marked && r.hitUp && r.dmgUp && r.note, r);

r = await T('spirit wolf', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const ra = S.hero('ranger', 0);
  S.put(ra, 4, 5); S.put(g1, 7, 2);
  const ab = S.ab('spirit_wolf');
  const tiles = b.abilityTargets(ra, ab).tiles;
  const spot = tiles.find((t) => t.x === 5 && t.y === 5);
  b.order = [ra, g1]; b.turnIdx = 0;
  const used = await b.useAbility(ra, ab, spot);
  const pet = b.pets[0];
  const out = { used, pet: !!pet, side: pet?.side, name: pet?.name, next: b.order[1] === pet, inParty: b.partyUnits.includes(pet), again: b.canUseAbility(ra, ab).ok };
  if (!pet) return out;
  const x0 = pet.x, y0 = pet.y, hp = g1.hp;
  await b.monsterTurn(pet);
  out.acted = pet.x !== x0 || pet.y !== y0 || g1.hp < hp;
  for (let i = 0; i < 5 && b.alive(pet); i++) b.endTurn(pet);
  out.faded = !b.alive(pet) && !b.view.hasEntity(pet.id);
  out.card = !!window.__app.playUI.chud.unitCard(pet, null);
  return out;
});
check('Spirit Wolf: a creature fights on the company\'s side, acts after the ranger, then fades', r.used && r.pet && r.side === 'party' && r.name === 'Spirit Wolf' && r.next && !r.inParty && !r.again && r.acted && r.faded && r.card, r);

r = await T('arrowstorm', async (S) => {
  const { b } = S; const foes = S.reset(3);
  const ra = S.hero('ranger', 1);
  S.put(ra, 6, 7); S.put(foes[0], 6, 2); S.put(foes[1], 7, 2); S.put(foes[2], 6, 3);
  let n = 0; const strike = b.strike.bind(b); b.strike = (...a) => { n++; return strike(...a); };
  try { await b.useAbility(ra, S.ab('arrowstorm'), { x: 6, y: 2 }); } finally { delete b.strike; }
  return { shots: n, hurt: foes.filter((f) => f.hp < 200).length };
});
check('Arrowstorm: one shot at every foe in the 3×3 patch', r.shots === 3 && r.hurt >= 2, r);

// Wizard
r = await T('arc lightning', async (S) => {
  const { b } = S; const foes = S.reset(3);
  const wz = S.hero('wizard', 0);
  S.put(wz, 2, 6); S.put(foes[0], 6, 3); S.put(foes[1], 8, 3); S.put(foes[2], 9, 5);
  const chain = b.affected(wz, S.ab('arc_lightning'), foes[0]);
  await b.useAbility(wz, S.ab('arc_lightning'), foes[0]);
  return { chain: chain.length, hurt: foes.filter((f) => f.hp < 200).length };
});
check('Arc Lightning: leaps from the first foe on to two more nearby', r.chain === 3 && r.hurt === 3, r);

r = await T('arcane grasp', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const wz = S.hero('wizard', 0);
  S.put(wz, 2, 4); S.put(g1, 7, 4);
  const d0 = b.dist(wz, g1);
  await b.useAbility(wz, S.ab('arcane_grasp'), g1);
  return { d0, d1: b.dist(wz, g1), rooted: !!g1.st.rooted };
});
check('Arcane Grasp: drags a foe three squares closer and holds it', r.d0 - r.d1 === 3 && r.rooted, r);

r = await T('falling star', async (S) => {
  const { b } = S; const foes = S.reset(2);
  const wz = S.hero('wizard', 0), w = S.hero('warrior', 1);
  S.put(wz, 2, 7); S.put(foes[0], 6, 3); S.put(foes[1], 9, 3); S.put(w, 9, 4);
  const used = await b.useAbility(wz, S.ab('meteor'), { x: 6, y: 3 });
  const marked = !!wz.charging && wz.charging.tiles.length === 9;
  // a foe beside its target moves out of the mark it stands in
  S.put(foes[1], 6, 4); S.put(w, 6, 5);
  await b.approach(foes[1], w, 3, 'brute');
  const dodged = !b.inDanger(foes[1].x, foes[1].y, 'enemy') && b.adjacent(foes[1], w);
  const hp = foes[0].hp;
  const lost = await b.startTurn(wz); // it lands at the start of the wizard's turn...
  return { used, marked, dodged, hit: foes[0].hp < hp, keepsTurn: lost === false, cleared: !wz.charging };
});
check('Falling Star: marked now, lands at the start of the wizard\'s next turn, which is not lost', r.used && r.marked && r.hit && r.keepsTurn && r.cleared, r);
check('monsters step out of a hero\'s marked squares', r.dodged, r);

// Cleric
r = await T('hallowed ground', async (S) => {
  const { b, g } = S; const [g1] = S.reset(1);
  const cl = S.hero('cleric', 0), w = S.hero('warrior', 1);
  S.put(cl, 5, 4); S.put(w, 6, 4); S.put(g1, 4, 4);
  w.member.hp -= 20;
  await b.useAbility(cl, S.ab('hallowed_ground'), null);
  const zone = b.marks.find((m) => m.kind === 'zone');
  const hp = S.hp(w);
  await b.zoneTouch(w);
  const healed = S.hp(w) > hp;
  const ghp = g1.hp;
  await b.zoneTouch(g1); // a goblin is no undead
  const sk = b.spawnEnemy(g.monsters.find((m) => m.id === 'skeleton'));
  sk.hp = sk.maxHp = 200; S.put(sk, 4, 5);
  await b.stepOn(sk); // the undead burn as they walk in
  b.round += 3; b.tickMarks();
  return { zone: !!zone, tiles: zone?.tiles.length, healed, goblinSafe: g1.hp === ghp, burned: sk.hp < 200, faded: !b.marks.length };
});
check('Hallowed Ground: companions there heal, the undead burn, others are left be; it fades', r.zone && r.tiles === 9 && r.healed && r.goblinSafe && r.burned && r.faded, r);

r = await T('sanctuary', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const cl = S.hero('cleric', 0), wz = S.hero('wizard', 1);
  S.put(cl, 3, 4); S.put(wz, 6, 4); S.put(g1, 7, 4);
  await b.useAbility(cl, S.ab('sanctuary'), wz);
  const safe = !b.canAttack(g1, wz) && b.pickTarget(g1, 'brute') !== wz && b.provokers(wz, 5, 4).length === 0;
  await b.strike(wz, g1);
  return { safe, broken: !wz.st.sanctuary };
});
check('Sanctuary: no foe can strike the companion, until they strike first', r.safe && r.broken, r);

r = await T('breath of life', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const cl = S.hero('cleric', 0), w = S.hero('warrior', 1);
  S.put(cl, 4, 4); S.put(w, 6, 4); S.put(g1, 10, 4);
  const none = b.canUseAbility(cl, S.ab('breath_of_life'));
  await b.kill(w);
  const ab = S.ab('breath_of_life');
  const can = b.canUseAbility(cl, ab);
  await b.useAbility(cl, ab, w);
  const m = w.member;
  return { none: none.short, can: can.ok, alive: b.alive(w) && m.status === 'ok', pct: Math.round(100 * m.hp / window.__skills.maxHp(S.g, m)) };
});
check('Breath of Life: a companion fallen in this battle rises with a third of their health', r.none === 'No one fallen' && r.can && r.alive && r.pct >= 30 && r.pct <= 40, r);

// Burglar
r = await T('filch', async (S) => {
  const { b, s } = S; const [g1] = S.reset(1);
  const bu = S.hero('burglar', 0);
  S.put(bu, 5, 4); S.put(g1, 6, 4);
  const gold = s.party.gold;
  const used = await b.useAbility(bu, S.ab('filch'), g1);
  bu.cd = {};
  const again = b.canUseAbility(bu, S.ab('filch'));
  return { free: used === false, more: s.party.gold > gold, robbed: g1.robbed, again: again.short };
});
check('Filch: a free action that lifts a foe\'s purse, once', r.free && r.more && r.robbed && r.again === 'No purse', r);

r = await T('caltrops', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const bu = S.hero('burglar', 0);
  S.put(bu, 4, 6); S.put(g1, 6, 3);
  await b.useAbility(bu, S.ab('caltrops'), { x: 6, y: 3 });
  const zone = b.marks.find((m) => m.kind === 'zone');
  await b.zoneTouch(g1);
  const hurt = g1.hp < 200, slowed = !!g1.st.slowed;
  const hp = g1.hp;
  await b.zoneTouch(g1); // once a round
  return { zone: !!zone, hurt, slowed, once: g1.hp === hp };
});
check('Caltrops: a foe in the patch is hurt and slowed, once a round', r.zone && r.hurt && r.slowed && r.once, r);

r = await T('fan of knives', async (S) => {
  const { b } = S; const foes = S.reset(3);
  const bu = S.hero('burglar', 0);
  S.put(bu, 6, 4); S.put(foes[0], 7, 4); S.put(foes[1], 4, 5); S.put(foes[2], 11, 4);
  const kit = b.strikeKit(bu, foes[1], S.ab('fan_of_knives'));
  let n = 0; const strike = b.strike.bind(b); b.strike = (...a) => { n++; return strike(...a); };
  try { await b.useAbility(bu, S.ab('fan_of_knives'), null); } finally { delete b.strike; }
  return { throws: n, thrown: !!kit?.w?.thrown && kit.ranged, far: foes[2].hp === 200 };
});
check('Fan of Knives: a thrown knife at every foe within 2 (none beyond)', r.throws === 2 && r.thrown && r.far, r);

// Paladin
r = await T('holy charge', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const pa = S.hero('paladin', 0);
  S.put(pa, 2, 4); S.put(g1, 6, 4);
  const ok = b.canUseAbility(pa, S.ab('holy_charge')).ok;
  await b.useAbility(pa, S.ab('holy_charge'), g1);
  return { ok, moved: pa.x >= 4, pushed: g1.x === 7, hurt: g1.hp < 200 };
});
check('Holy Charge: the paladin rushes in, strikes and drives the foe back', r.ok && r.moved && r.pushed && r.hurt, r);

r = await T('aura of courage', async (S) => {
  const { b } = S; S.reset(1);
  const pa = S.hero('paladin', 0), a = S.hero('wizard', 1), far = S.hero('cleric', 2);
  S.put(pa, 5, 4); S.put(a, 6, 5); S.put(far, 11, 4);
  await b.useAbility(pa, S.ab('aura_of_courage'), null);
  return { self: !!pa.st.warded, near: !!a.st.warded && b.power(a, 'shielded') === 1, far: !far.st.warded };
});
check('Aura of Courage: a ward and +1 armour for companions within 2', r.self && r.near && r.far, r);

r = await T('shield of dawn', async (S) => {
  const { b } = S; S.reset(1);
  const pa = S.hero('paladin', 0), a = S.hero('wizard', 1);
  S.put(pa, 5, 4); S.put(a, 6, 4);
  await b.useAbility(pa, S.ab('shield_of_dawn'), null);
  await b.damage(a, 999);
  const saved = b.alive(a) && S.hp(a) === 1 && !a.st.deathward;
  await b.damage(a, 999);
  return { saved, onceOnly: !b.alive(a) };
});
check('Shield of Dawn: a killing blow leaves the companion at 1 health — once', r.saved && r.onceOnly, r);

// Minstrel
r = await T('lullaby', async (S) => {
  const { b } = S; const foes = S.reset(3);
  const mi = S.hero('minstrel', 0);
  S.put(mi, 5, 4); S.put(foes[0], 6, 4); S.put(foes[1], 7, 5); S.put(foes[2], 11, 4);
  await b.useAbility(mi, S.ab('lullaby'), null);
  return { asleep: foes.map((f) => f.sleep > 0) };
});
check('Lullaby: foes within 2 may fall asleep (those further off are untouched)', r.asleep[0] && r.asleep[1] && !r.asleep[2], r);

r = await T('discord', async (S) => {
  const { b } = S; const foes = S.reset(2);
  const mi = S.hero('minstrel', 0);
  S.put(mi, 3, 6); S.put(foes[0], 6, 3); S.put(foes[1], 8, 3);
  await b.useAbility(mi, S.ab('discord'), foes[0]);
  const charmed = !!foes[0].st.charmed;
  const hp = foes[1].hp, mhp = S.hp(mi);
  await b.monsterAct(foes[0], 4);
  // heroes keep their own minds
  const heroCharm = b.addStatus(mi, 'charmed', 1, 0, foes[0]);
  return { charmed, turned: foes[1].hp < hp, heroSafe: S.hp(mi) === mhp, heroCharm };
});
check('Song of Discord: the foe turns on its own side for a turn', r.charmed && r.turned && r.heroSafe && !r.heroCharm, r);

r = await T('encore', async (S) => {
  const { b } = S; S.reset(1);
  const mi = S.hero('minstrel', 0), w = S.hero('warrior', 1);
  S.put(mi, 5, 4); S.put(w, 7, 4);
  b.order = [mi, ...b.order.filter((u) => u !== mi)]; b.turnIdx = 0;
  const self = b.abilityTargets(mi, S.ab('encore')).units.includes(mi);
  await b.useAbility(mi, S.ab('encore'), w);
  return { self, next: b.order[1] === w };
});
check('Encore: a companion (not the minstrel) takes an extra turn straight after', !r.self && r.next, r);

// Runesmith
r = await T('rune trap', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const rs = S.hero('runesmith', 0);
  S.put(rs, 3, 4); S.put(g1, 8, 4);
  await b.useAbility(rs, S.ab('rune_trap'), { x: 6, y: 4 });
  const placed = b.marks.some((m) => m.kind === 'trap');
  await b.walkPath(g1, [[7, 4], [6, 4], [5, 4]]);
  return { placed, sprung: !b.marks.length, hurt: g1.hp < 200, stunned: g1.stun > 0, stopped: g1.x === 6 };
});
check('Rune Trap: the first foe to step on it is hurt, stunned and stopped', r.placed && r.sprung && r.hurt && r.stunned && r.stopped, r);

r = await T('lodestone', async (S) => {
  const { b } = S; const foes = S.reset(2);
  const rs = S.hero('runesmith', 0);
  S.put(rs, 6, 4); S.put(foes[0], 9, 4); S.put(foes[1], 6, 1);
  const d = foes.map((f) => b.dist(rs, f));
  await b.useAbility(rs, S.ab('lodestone'), null);
  return { before: d, after: foes.map((f) => b.dist(rs, f)) };
});
check('Lodestone Rune: every foe within 3 is dragged two squares in', r.after[0] === r.before[0] - 2 && r.after[1] === r.before[1] - 2, r);

r = await T('stone warden', async (S) => {
  const { b } = S; const foes = S.reset(2);
  const rs = S.hero('runesmith', 0);
  S.put(rs, 5, 4); S.put(foes[0], 8, 4); S.put(foes[1], 8, 5);
  const used = await b.useAbility(rs, S.ab('stone_warden'), { x: 6, y: 4 });
  const pet = b.pets.find((p) => b.alive(p));
  const want = pet && b.monsterAbility(pet, foes[0], 'post');
  return { used, pet: pet?.def.id, hp: pet?.maxHp, taunts: want?.ab?.id };
});
check('Stone Warden: a stone guardian stands beside the runesmith and bellows foes to it', r.used && r.pet === 'stone_warden' && r.hp > 40 && r.taunts === 'taunt', r);

// Battle arts
r = await T('second wind', async (S) => {
  const { b } = S; S.reset(1);
  const w = S.hero('warrior', 0);
  const ab = S.ab('second_wind');
  const unhurt = b.canUseAbility(w, ab).short;
  w.member.hp = 20;
  const used = await b.useAbility(w, ab, null);
  return { unhurt, free: used === false, healed: S.hp(w) > 20, once: b.canUseAbility(w, ab).short };
});
check('Second Wind: a free heal for the hurt, once a battle', r.unhurt === 'Unhurt' && r.free && r.healed && r.once === 'Used', r);

r = await T('first aid', async (S) => {
  const { b } = S; S.reset(1);
  const w = S.hero('warrior', 0), a = S.hero('wizard', 1);
  S.put(w, 5, 4); S.put(a, 6, 4);
  a.member.hp = 10; a.member.status = 'poisoned';
  await b.useAbility(w, S.ab('first_aid'), a);
  return { healed: S.hp(a) > 10, cured: a.member.status === 'ok' };
});
check('First Aid: heals a companion beside you and draws out poison', r.healed && r.cured, r);

r = await T('dash', async (S) => {
  const { b } = S; S.reset(1);
  const u = b.active;
  const before = u.moves;
  const used = await b.useAbility(u, S.ab('dash'), null);
  return { free: used === false, moves: u.moves - before };
});
check('Dash: a free action, three more squares this turn', r.free && r.moves === 3, r);

r = await T('throw knife', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const w = S.hero('warrior', 0);
  S.put(w, 3, 4); S.put(g1, 6, 4);
  const ab = S.ab('throw_knife');
  const tg = b.abilityTargets(w, ab).units.includes(g1);
  const pv = b.preview(w, g1, ab);
  await b.useAbility(w, ab, g1);
  return { tg, pv: !!pv && pv.ranged && pv.chance > 0, hurt: g1.hp < 200, cd: w.cd.throw_knife > 0 };
});
check('Throw Knife: a warrior with no bow throws at a foe three squares off', r.tg && r.pv && r.hurt && r.cd, r);

r = await T('shove', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const w = S.hero('warrior', 0);
  S.put(w, 5, 4); S.put(g1, 6, 4);
  const used = await b.useAbility(w, S.ab('shove'), g1);
  return { free: used === false, x: g1.x };
});
check('Shove: a free push of two squares', r.free && r.x === 8, r);

r = await T('steady aim', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const ra = S.hero('ranger', 1);
  S.put(ra, 2, 4); S.put(g1, 7, 4);
  g1.st.shielded = { rounds: 9, power: b.strikeKit(ra, g1).hit + 11 }; // (a target hit on 12 or more, so the odds can rise)
  const before = b.preview(ra, g1);
  await b.useAbility(ra, S.ab('steady_aim'), null);
  const after = b.preview(ra, g1);
  await b.strike(ra, g1);
  return { up: after.chance > before.chance || after.chance === 1, note: after.notes.some((n) => /Steady/.test(n)), spent: !ra.st.focused };
});
check('Steady Aim: the next attack is +4 to hit, and the steadiness is spent', r.up && r.note && r.spent, r);

r = await T('hold the line', async (S) => {
  const { b } = S; S.reset(1);
  const w = S.hero('warrior', 0), a = S.hero('wizard', 1), far = S.hero('cleric', 2);
  S.put(w, 5, 4); S.put(a, 5, 5); S.put(far, 10, 4);
  await b.useAbility(w, S.ab('hold_the_line'), null);
  return { self: b.power(w, 'shielded'), near: b.power(a, 'shielded'), far: b.power(far, 'shielded') };
});
check('Hold the Line: +2 armour for you and the companions beside you', r.self === 2 && r.near === 2 && r.far === 0, r);

r = await T('disengage', async (S) => {
  const { b } = S; const [g1] = S.reset(1);
  const w = S.hero('wizard', 0);
  S.put(w, 5, 4); S.put(g1, 6, 4);
  const before = b.provokers(w, 3, 4).length;
  await b.useAbility(w, S.ab('disengage'), null);
  return { before, after: b.provokers(w, 3, 4).length };
});
check('Disengage: slipping away from a foe gives it no free strike', r.before === 1 && r.after === 0, r);

r = await T('battle cry', async (S) => {
  const { b } = S; S.reset(1);
  const w = S.hero('warrior', 0), a = S.hero('wizard', 1), far = S.hero('cleric', 2);
  S.put(w, 2, 4); S.put(a, 4, 6); S.put(far, 10, 4);
  await b.useAbility(w, S.ab('battle_cry'), null);
  return { self: b.power(w, 'blessed'), near: b.power(a, 'blessed'), far: b.power(far, 'blessed') };
});
check('Battle Cry: +2 to hit for everyone within 3', r.self === 2 && r.near === 2 && r.far === 0, r);

// monsters keep their wits among all this, and turns always end
r = await T('ai', async (S) => {
  const { b } = S; const foes = S.reset(3);
  const w = S.hero('warrior', 0), wz = S.hero('wizard', 1);
  S.put(w, 5, 4); S.put(wz, 4, 6); S.put(foes[0], 7, 4); S.put(foes[1], 8, 2); S.put(foes[2], 9, 6);
  await b.useAbility(w, S.ab('shield_wall'), b.partyUnits.find((u) => b.adjacent(u, w)) || wz);
  await b.useAbility(wz, S.ab('spirit_wolf'), null).catch(() => {});
  await b.summon(wz, S.ab('spirit_wolf'), { x: 4, y: 5 });
  foes[1].st.charmed = { rounds: 1, power: 0 };
  for (const f of foes) await b.monsterTurn(f);
  for (const p of b.pets) await b.monsterTurn(p);
  return { ok: true, pets: b.pets.length };
});
check('monsters take their turns among guards, called creatures and bewilderment without error', r.ok && !r.error, r);

// ------------------------------------------------------------ that battle ends; a fresh one on a real field
const ended = await ev(async () => {
  const S = window.__S, { b, g, s } = S;
  g.monsters.find((m) => m.id === 'goblin').ac = window.__gobAc;
  s.party.members.forEach((m, i) => { m.cls = window.__cls[i]; m.status = 'ok'; m.hp = window.__skills.maxHp(g, m); });
  for (const u of b.partyUnits) u.dead = false;
  for (const p of b.pets) if (b.alive(p)) b.dismiss(p);
  for (const e of b.enemies) if (b.alive(e)) await b.kill(e);
  await b.actPass();
  for (let i = 0; i < 100 && s.battle; i++) await new Promise((r) => setTimeout(r, 50));
  return { over: b.over, outcome: b.summary?.outcome };
});
check('the testing battle ends in victory', ended.outcome === 'victory', ended);
await closeVictory();
await closeModals();
await ev(() => { window.__app.session.fight([{ id: 'goblin', n: 3 }], 'grass', {}); });
check('a second battle starts', await heroUp());
await ev(() => {
  const b = window.__app.session.battle;
  // a free square near (x, y) on the real field
  window.__free = (x, y, r0 = 1) => {
    for (let r = r0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (b.walkable(x + dx, y + dy, null)) return { x: x + dx, y: y + dy };
    }
    return null;
  };
});

// ------------------------------------------------------------ the bar of a hero with many skills
const barFor = async (cls, arts) => ev(async ({ cls, arts }) => {
  const b = window.__app.session.battle, g = b.game, ui = window.__app.playUI;
  const u = b.active;
  u.member.cls = cls; u.member.level = 10;
  u.member.arts = arts.map((id, i) => ({ id, level: 2 + i * 2 }));
  ui.combatTurn(u);
  await new Promise((r) => setTimeout(r, 150));
  const btns = [...document.querySelectorAll('.cbt-btns .cbt-btn')];
  const box = btns[0]?.closest('.hud-cmds')?.getBoundingClientRect();
  const out = btns.filter((el) => { const r = el.getBoundingClientRect(); return !(r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.width > 60 && r.height > 30); })
    .map((el) => el.querySelector('.cb-name')?.textContent);
  const keys = btns.map((el) => el.querySelector('.cb-key')?.textContent || '');
  // a name may wrap to two lines, never more
  const clipped = btns.map((el) => el.querySelector('.cb-name')).filter((n) => n.scrollHeight > n.clientHeight + 2).map((n) => n.textContent);
  return { n: btns.length, dense: !!document.querySelector('.cbt-btns.dense'), out, keys, clipped, abilities: window.__skills.heroAbilities(g, u.member).length };
}, { cls, arts });
const ARTS4 = ['second_wind', 'dash', 'throw_knife', 'battle_cry'];
for (const cls of ['warrior', 'ranger', 'wizard', 'cleric', 'burglar', 'paladin', 'minstrel', 'runesmith']) {
  const bar = await barFor(cls, ARTS4);
  // (seven fixed buttons: Move, Withdraw, Attack, Cast, Item, Guard, End turn)
  check(`a level-10 ${cls} with four battle arts: ${bar.n} buttons on three rows, all inside the bar, keys 1–9`, bar.dense && !bar.out.length && bar.n === 7 + bar.abilities && bar.keys.includes('9') && bar.keys.includes('Q') && !bar.clipped.length, bar);
  if (['warrior', 'ranger', 'wizard', 'runesmith'].includes(cls)) await shot(`skills-bar-${cls}`);
}
// even more: a fifth art and a charm's power still fit, the keys running on to 0 and −
const crowd = await ev(async () => {
  const b = window.__app.session.battle, ui = window.__app.playUI, u = b.active, s = window.__app.session;
  u.member.cls = 'cleric';
  u.member.arts = ['second_wind', 'dash', 'throw_knife', 'battle_cry', 'hold_the_line'].map((id, i) => ({ id, level: 2 + i * 2 }));
  const was = u.member.equip.charm;
  u.member.equip.charm = 'tin_whistle';
  ui.combatTurn(u);
  await new Promise((r) => setTimeout(r, 150));
  const btns = [...document.querySelectorAll('.cbt-btns .cbt-btn')];
  const box = btns[0].closest('.hud-cmds').getBoundingClientRect();
  const inside = btns.every((el) => { const r = el.getBoundingClientRect(); return r.right <= box.right + 1 && r.bottom <= box.bottom + 1 && r.width > 60; });
  const keys = btns.map((el) => el.querySelector('.cb-key')?.textContent || '');
  return { n: btns.length, inside, keys, was };
});
check('twelve skills and a charm\'s power: still inside the bar, keys running on to 0 and −', crowd.inside && crowd.keys.includes('0') && crowd.keys.includes('-'), crowd);
await shot('skills-bar-crowded');
await ev((was) => { const u = window.__app.session.battle.active; u.member.equip.charm = was || null; u.member.arts = ['second_wind', 'dash', 'throw_knife', 'battle_cry'].map((id, i) => ({ id, level: 2 + i * 2 })); }, crowd.was);

// a key past 4 aims the skill in that place
const keyPrep = await ev(() => {
  const b = window.__app.session.battle, ui = window.__app.playUI, u = b.active;
  u.member.cls = 'warrior'; u.cd = {}; u.uses = {};
  const g1 = b.enemies.find((e) => b.alive(e));
  const sq = [[1, 0], [-1, 0], [0, -1], [0, 1]].map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy })).find((c) => b.walkable(c.x, c.y, null));
  if (sq) { g1.x = sq.x; g1.y = sq.y; b.view.placeEntity(g1.id, sq.x, sq.y); }
  ui.combatTurn(u);
  const abs = window.__skills.heroAbilities(b.game, u.member).filter((a) => a.id !== 'whirlwind');
  return { sixth: abs[5]?.name, ninth: abs[8]?.name, placed: !!sq };
});
await page.keyboard.press('6');
await wait(250);
const aimed6 = await ev(() => window.__app.playUI.targeting?.label || null);
await ev(() => window.__app.playUI.cancelTargeting());
await page.keyboard.press('9');
await wait(250);
const aimed9 = await ev(() => window.__app.playUI.targeting?.label || null);
await ev(() => window.__app.playUI.cancelTargeting());
check('keys 6 and 9 aim the sixth and ninth skills', aimed6 === keyPrep.sixth && aimed9 === keyPrep.ninth, { keyPrep, aimed6, aimed9 });

// hovering a skill explains it; aiming at a square shows what it covers
const tip = await ev(async () => {
  const b = window.__app.session.battle, ui = window.__app.playUI, u = b.active;
  u.member.cls = 'ranger';
  u.member.equip.ranged = u.member.equip.ranged || 'short_bow';
  ui.combatTurn(u);
  const btn = [...document.querySelectorAll('.cbt-btn')].find((el) => el.textContent.includes('Arrowstorm'));
  btn.dispatchEvent(new MouseEvent('mouseenter'));
  const text = document.querySelector('.cbt-tip')?.textContent || '';
  btn.dispatchEvent(new MouseEvent('mouseleave'));
  btn.click();
  await new Promise((r) => setTimeout(r, 100));
  const tg = ui.targeting;
  const foe = b.enemies.find((e) => b.alive(e) && tg?.tiles?.some((c) => c.x === e.x && c.y === e.y));
  if (foe) ui.chud.hover({ x: foe.x, y: foe.y }, { clientX: 640, clientY: 300 });
  const card = document.querySelector('.cbt-tip')?.textContent || '';
  return { text, aiming: tg?.label, card };
});
check('a skill\'s button explains it; aiming Arrowstorm shows whom it catches', /3×3/.test(tip.text) && /Cooldown 4/.test(tip.text) && tip.aiming === 'Arrowstorm' && /Catches/.test(tip.card), tip);
await shot('skills-aim-arrowstorm');
await ev(() => window.__app.playUI.cancelTargeting());

// a few skills in action, for the eye: a spirit wolf, a stone warden, a rune and hallowed ground
const scene = await ev(async () => {
  const b = window.__app.session.battle, ui = window.__app.playUI, g = b.game;
  const ab = (id) => g.abilities.find((a) => a.id === id);
  const ra = b.active;
  const [rs, cl] = b.partyUnits.filter((u) => u !== ra && b.alive(u));
  rs.member.cls = 'runesmith'; cl.member.cls = 'cleric';
  const wolf = await b.summon(ra, ab('spirit_wolf'), window.__free(ra.x, ra.y));
  const warden = await b.summon(rs, ab('stone_warden'), window.__free(rs.x, rs.y));
  const foe = b.enemies.find((e) => b.alive(e));
  const spot = window.__free(foe.x, foe.y + 1, 1);
  const trap = spot && b.placeMark(rs, ab('rune_trap'), spot);
  const zone = b.placeMark(cl, ab('hallowed_ground'), null);
  ui.combatTurn(ra);
  return { wolf: !!wolf, warden: !!warden, trap: !!trap, zone: !!zone };
});
await wait(900);
check('a wolf and a warden answer the call; a rune and hallowed ground lie on the field', scene.wolf && scene.warden && scene.trap && scene.zone, scene);
await shot('skills-in-action');

// ------------------------------------------------------------ the turn always ends
const flow = await ev(async () => {
  const b = window.__app.session.battle, g = b.game;
  const u = b.active;
  const used = await b.actAbility(g.abilities.find((a) => a.id === 'dash'), null, u);
  const still = b.active === u;
  await b.actPass();
  for (let i = 0; i < 60 && b.active === u; i++) await new Promise((r) => setTimeout(r, 50));
  return { used, still, moved: b.active !== u };
});
check('a free action keeps the turn; ending the turn passes it on', flow.used === false && flow.still && flow.moved, flow);

// let the battle run to its end, called creatures, runes and all: nothing gets stuck
const ran = await ev(async () => {
  const s = window.__app.session, b = s.battle;
  for (const e of b.enemies) if (b.alive(e)) { e.hp = Math.min(e.hp, 4); }
  for (let i = 0; i < 600 && s.battle === b && !b.over; i++) {
    if (b.active && !b.acting) {
      const u = b.active;
      const t = b.attackTargets(u)[0];
      if (t) await b.actAttack(t, u); else await b.actPass();
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return { over: b.over, outcome: b.summary?.outcome, pets: b.pets.map((p) => s.view.hasEntity(p.id)) };
});
check('the battle plays out to its end, and the called creatures go with it', ran.over && !ran.pets.some(Boolean), ran);
await closeVictory();
await closeModals();

// ------------------------------------------------------------ the level-up card offers a battle art
const lvl = await ev(async () => {
  const S = window.__skills, s = window.__app.session, g = s.game;
  const m = s.party.members.find((x) => x.cls !== 'cleric') || s.party.members[0];
  m.cls = 'warrior'; m.level = 1; m.xp = S.xpForLevel(4) - 1; m.perks = []; m.arts = []; m.perkPending = 0; m.lvShown = 1; m.lastPick = null;
  for (const o of s.party.members) if (o !== m) { o.perkPending = 0; o.lvShown = o.level; }
  S.gainXp(g, m, 1);
  m.hp = S.maxHp(g, m);
  s.ui.refresh();
  for (let i = 0; i < 40 && !document.querySelector('.levelup-modal'); i++) await new Promise((r) => setTimeout(r, 100));
  return { name: m.name, level: m.level, pending: m.perkPending, card: !!document.querySelector('.levelup-modal'), art: [...document.querySelectorAll('.levelup-modal .perk.art')].map((el) => el.textContent), next: document.querySelector('.levelup-modal .lvl-next')?.textContent };
});
check('the level-up card offers a battle art beside two talents, and names the next skill to come', lvl.card && lvl.art.length === 1 && /Learn/.test(lvl.art[0]) && /Next: Shield Wall at level 5/.test(lvl.next || ''), lvl);
await shot('skills-levelup-card');
const picked = await ev(async () => {
  const s = window.__app.session, m = s.party.members.find((x) => x.name === window.__lvName) || s.party.members.find((x) => x.perkPending > 0);
  const name = m.name;
  document.querySelector('.levelup-modal .perk.art').click();
  await new Promise((r) => setTimeout(r, 100));
  const done = document.querySelector('.levelup-modal .perk-pick .pp-title')?.textContent || document.querySelector('.levelup-modal .perk-done')?.textContent;
  return { name, arts: m.arts.map((a) => a.id), pending: m.perkPending, done };
});
check('choosing the art on the card learns it', picked.arts.length === 1 && picked.pending === 2, picked);
await closeModals();
// the sheet: skills learned, still to come, and the arts
const sheet = await ev(async () => {
  const ui = window.__app.playUI, s = window.__app.session;
  const m = s.party.members.find((x) => (x.arts || []).length);
  ui.selectHero(m);
  await new Promise((r) => setTimeout(r, 200));
  const t = document.querySelector('.hero-pop')?.textContent || '';
  document.querySelector('.hero-pop .sheet-abil')?.scrollIntoView({ block: 'start' });
  return { learned: /learned at level 5/.test(t), art: /Battle art/i.test(t), later: /Still to learn/.test(t) };
});
check('the hero sheet lists the battle art, what is still to come and when', sheet.learned && sheet.art && sheet.later, sheet);
await shot('skills-sheet');
await page.keyboard.press('Escape');
await closeModals();

// a companion can join already knowing battle arts (the designer ticks them on the person)
const joined = await ev(() => {
  const s = window.__app.session, g = s.game, S = window.__skills;
  const npc = { id: 'test_joiner', type: 'npc', name: 'Sir Testwick', x: s.state.pos.x, y: s.state.pos.y, look: { race: 'human' }, recruit: { cls: 'paladin', race: 'human', level: 5, arts: ['dash', 'first_aid', 'no_such_art'] } };
  s.map.entities.push(npc);
  const why = s.recruit(npc);
  const m = s.party.members.find((x) => x.name === 'Sir Testwick');
  const out = { why, arts: m?.arts.map((a) => `${a.id}@${a.level}`), bar: m ? S.heroAbilities(g, m).map((a) => a.id) : [] };
  if (m) s.party.members.splice(s.party.members.indexOf(m), 1);
  s.refreshPartyVisual?.();
  return out;
});
check('a companion joins knowing the battle arts the designer gave them', !joined.why && joined.arts?.join() === 'dash@2,first_aid@4' && joined.bar.includes('holy_charge') && joined.bar.includes('first_aid'), joined);

// ------------------------------------------------------------ a fight on a dungeon floor
const field = await ev(async () => {
  const s = window.__app.session;
  for (const m of s.party.members) { m.level = 10; m.status = 'ok'; m.hp = window.__skills.maxHp(s.game, m); m.perkPending = 0; m.lvShown = 10; }
  s.party.members[1].cls = 'ranger';
  const m = s.game.maps.find((x) => x.name === 'Grimholt Barrow');
  await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
  const dv = s.dv;
  if (!dv) return { dv: false };
  const [gid] = Object.entries(dv.groups).find(([og, g]) => !dv.entityOf(og)?.boss && g.m.some((mm) => !mm.dead)) || [];
  if (!gid) return { dv: true, band: false };
  dv.alert(gid);
  const done = dv.fight([gid]);
  for (let i = 0; i < 120 && !(s.battle?.active && !s.battle.acting); i++) await new Promise((r) => setTimeout(r, 50));
  const b = s.battle;
  if (!b?.field) return { dv: true, field: false };
  const ra = b.partyUnits.find((u) => u.member.cls === 'ranger');
  const ab = s.game.abilities.find((a) => a.id === 'spirit_wolf');
  const spot = b.abilityTargets(ra, ab).tiles[0];
  await b.useAbility(ra, ab, spot);
  const pet = b.pets[0];
  const rs = b.partyUnits.find((u) => u !== ra);
  rs.member.cls = 'runesmith';
  const trapAb = s.game.abilities.find((a) => a.id === 'rune_trap');
  const tt = b.abilityTargets(rs, trapAb).tiles[0];
  if (tt) await b.useAbility(rs, trapAb, tt);
  if (pet) await b.monsterTurn(pet);
  const mid = { pet: !!pet, petId: pet?.id, marks: b.marks.length };
  for (const e of b.enemies) if (b.alive(e)) await b.kill(e);
  if (b.active) b.actPass();
  await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]);
  return { dv: true, field: true, ...mid, over: b.over, petGone: !s.view.hasEntity(mid.petId), heroes: Object.keys(dv.data.heroes).length };
});
check('on a dungeon floor a called creature fights, a rune is carved, and both are gone after', field.field && field.pet && field.marks >= 1 && field.over && field.petGone && field.heroes >= 1, field);
await closeVictory();
await closeModals();

// ------------------------------------------------------------ the Construction Set
const ed = await ev(async () => {
  const app = window.__app;
  app.openEditor(window.__schema.cloneGame(app.sample));
  return !!app.editor;
});
let editor = { opened: ed };
if (ed) {
  await wait(1500);
  await page.getByRole('button', { name: /World Data/ }).click();
  await wait(300);
  await page.getByRole('button', { name: /Classes/ }).first().click();
  await wait(300);
  editor = await ev(async () => {
    const app = window.__app, g = app.editor.game;
    const field = [...document.querySelectorAll('.form .field')].find((f) => /^Battle skills/.test(f.querySelector('.field-label')?.textContent || ''));
    const rows = [...(field?.querySelectorAll('.sl-row') || [])];
    const heads = rows.map((r) => r.querySelector('.sl-head span')?.textContent);
    // change the level of the third skill through its field
    const input = rows[2]?.querySelectorAll('input[type=number]')[0];
    if (input) { input.value = '6'; input.dispatchEvent(new Event('input')); }
    const k = g.classes[0];
    field?.scrollIntoView({ block: 'start' });
    return { opened: true, heads, level: k.skills[2]?.level, special: !!document.querySelector('.form input[placeholder="2"]') };
  });
  await page.screenshot({ path: `${OUT}/skills-editor-class.png` });
  await page.getByRole('button', { name: /Abilities/ }).first().click();
  await wait(300);
  const abil = await ev(async () => {
    const btn = [...document.querySelectorAll('.entry-list .entry')].find((b) => b.textContent === 'Spirit Wolf');
    btn?.click();
    await new Promise((r) => setTimeout(r, 200));
    const labels = [...document.querySelectorAll('.form .field-label')].map((l) => l.textContent);
    [...document.querySelectorAll('.form .form-section')].find((x) => /Calls a creature/.test(x.textContent))?.scrollIntoView({ block: 'start' });
    const groups = [...document.querySelectorAll('.entry-list .entry-group')].map((x) => x.textContent);
    return { labels, groups };
  });
  editor.abil = abil;
  await page.screenshot({ path: `${OUT}/skills-editor-ability.png` });
}
check('the class form lists each skill with the level it is learned at, and edits it', editor.opened && editor.heads?.length >= 5 && /level 1/.test(editor.heads[0]) && editor.level === 6 && editor.special, editor);
check('the ability form edits what a skill calls, and battle arts have a group of their own', ['Calls into the fight', 'Called', 'Marks the ground', 'Lasts (turns of the creature, rounds of the mark)'].every((l) => editor.abil?.labels.includes(l)) && editor.abil?.groups.some((x) => /Battle arts/.test(x)), editor.abil);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
