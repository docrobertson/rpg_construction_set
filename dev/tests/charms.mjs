// Charms: the charm slot and the trinkets worn in it. Equipping one, a charm
// in the pack doing nothing, race and class charms, a battle-start blessing,
// a charm's battle action on the bar (cooldown and once a battle), passives
// on a blow struck, world effects (travel time, prices), a new way opened
// (the shallows), old saves and games brought up to date, and the editor's
// item form. Prints PASS/FAIL per check; exits 1 on any failure.
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
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });
await page.waitForTimeout(500);
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
const play = () => ev(async () => {
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, 300));
});
await play();
await closeModals();

// ---- a charm goes into the new slot (and only there)
let r = await ev(async () => {
  const s = window.__app.session, g = s.game, C = window.__charms, inv = s.party.inventory;
  const dwarf = s.party.members.find((m) => m.race === 'dwarf');
  const it = g.items.find((i) => i.id === 'lucky_acorn');
  inv.lucky_acorn = 1;
  const res = C.equipItem(g, dwarf, it, inv);
  s.ui.selectHero(dwarf);
  await new Promise((res2) => setTimeout(res2, 300));
  const slot = [...document.querySelectorAll('.sheet .slot')].find((x) => /Charm/.test(x.textContent));
  const out = {
    ok: res.ok, slot: res.slot, worn: dwarf.equip.charm, left: inv.lucky_acorn || 0, slots: Object.keys(dwarf.equip),
    sheetSlot: !!slot, selected: slot?.querySelector('select')?.value, panel: document.querySelector('.sheet-charm')?.innerText || '',
    charms: g.items.filter((i) => i.type === 'charm').length,
  };
  s.ui.closeHero();
  return out;
});
check('a charm is worn in the new charm slot', r.ok && r.slot === 'charm' && r.worn === 'lucky_acorn' && r.left === 0 && r.slots.includes('charm'), r);
check('the hero sheet shows the charm slot and what the charm does', r.sheetSlot && r.selected === 'lucky_acorn' && /Lucky Acorn/.test(r.panel) && /\+1 armour/.test(r.panel), r);
check('there are plenty of charms (35 or more)', r.charms >= 35, r);
await page.locator('.sheet').count() && closeModals();

// ---- a charm in the pack does nothing; worn, it works; taken off, it stops
r = await ev(async () => {
  const s = window.__app.session, g = s.game, C = window.__charms, inv = s.party.inventory;
  const dwarf = s.party.members.find((m) => m.race === 'dwarf');
  C.unequip(dwarf, 'charm', inv, g);
  const base = { ac: C.armorClass(g, dwarf), abs: C.heroAbilities(g, dwarf).length };
  inv.deep_runering = 1; inv.horn_of_brannoc = 1;
  const inPack = { ac: C.armorClass(g, dwarf), abs: C.heroAbilities(g, dwarf).length };
  C.equipItem(g, dwarf, g.items.find((i) => i.id === 'deep_runering'), inv);
  const worn = { ac: C.armorClass(g, dwarf) };
  C.unequip(dwarf, 'charm', inv, g);
  const off = { ac: C.armorClass(g, dwarf) };
  s.ui.openParty();
  await new Promise((res) => setTimeout(res, 250));
  const row = [...document.querySelectorAll('.party-modal .inv-row')].find((x) => /Rune-ring of the Deep/.test(x.textContent));
  const tip = row?.dataset.tip || row?.getAttribute('title') || '';
  const group = [...document.querySelectorAll('.party-modal .inv-group')].map((x) => x.textContent);
  return { base, inPack, worn, off, tip, group };
});
await closeModals();
check('a charm in the pack does nothing', r.inPack.ac === r.base.ac && r.inPack.abs === r.base.abs, r);
check('worn, the charm works (+2 armour), and stops when taken off', r.worn.ac === r.base.ac + 2 && r.off.ac === r.base.ac, r);
check('in the pack its tooltip says it sleeps there', /Asleep in the pack/.test(r.tip) && /\+2 armour/.test(r.tip) && r.group.includes('Charms'), r);

// ---- charms for one people or one calling
r = await ev(() => {
  const s = window.__app.session, g = s.game, C = window.__charms, inv = s.party.inventory;
  const dwarf = s.party.members.find((m) => m.race === 'dwarf');
  const elf = s.party.members.find((m) => m.race === 'elf');
  const wizard = s.party.members.find((m) => m.cls === 'wizard');
  const ring = g.items.find((i) => i.id === 'deep_runering'), star = g.items.find((i) => i.id === 'star_ring');
  inv.star_ring = 1;
  const elfTry = C.equipItem(g, elf, ring, inv);
  const dwarfTry = C.canEquip(g, dwarf, ring);
  const notWizard = C.canEquip(g, dwarf, star);
  const isWizard = C.canEquip(g, wizard, star);
  return { elfTry, elfWorn: elf.equip.charm, dwarfTry, notWizard, isWizard, left: inv.deep_runering };
});
check('a dwarves\' charm cannot be worn by an elf, and says why', !r.elfTry.ok && /Only a dwarf can wake its runes/.test(r.elfTry.why) && r.elfWorn !== 'deep_runering' && r.left === 1, r);
check('a dwarf may wear it; a wizards\' ring only a wizard', r.dwarfTry.ok && !r.notWizard.ok && /wizard/.test(r.notWizard.why) && r.isWizard.ok, r);

// ---- world effects: quicker steps, better prices, fewer wanderers
r = await ev(() => {
  const s = window.__app.session, g = s.game, C = window.__charms, inv = s.party.inventory;
  const p = s.state.pos;
  const m = s.party.members[1];
  const before = { step: s.stepCost(p.x, p.y + 1), price: s.ui.priceOf(g.items.find((i) => i.id === 'long_sword'), { shop: { priceMod: 1 } }), enc: C.charmEncounters(s) };
  inv.giants_hobnail = 1; inv.merchants_brooch = 1;
  C.equipItem(g, m, g.items.find((i) => i.id === 'giants_hobnail'), inv);
  const m2 = s.party.members[2];
  C.equipItem(g, m2, g.items.find((i) => i.id === 'merchants_brooch'), inv);
  const after = { step: s.stepCost(p.x, p.y + 1), price: s.ui.priceOf(g.items.find((i) => i.id === 'long_sword'), { shop: { priceMod: 1 } }), sell: s.ui.priceOf(g.items.find((i) => i.id === 'long_sword'), { shop: {} }, true) };
  C.unequip(m, 'charm', inv, g); C.unequip(m2, 'charm', inv, g);
  inv.shepherds_bell = 1;
  C.equipItem(g, m, g.items.find((i) => i.id === 'shepherds_bell'), inv);
  after.enc = C.charmEncounters(s);
  C.unequip(m, 'charm', inv, g);
  return { before, after };
});
check('a charm of travel makes each step take less time', r.after.step < r.before.step && Math.abs(r.after.step - r.before.step * 0.9) < 0.01, r);
check('a charm of haggling lowers shop prices and raises what merchants pay', r.after.price < r.before.price && r.after.sell > 20, r);
check('a charm of quiet keeps wandering monsters away', r.after.enc < r.before.enc, r);

// ---- a new way: the shallows, walkable only with the Selkie's Shell
r = await ev(async () => {
  const s = window.__app.session, g = s.game, C = window.__charms, inv = s.party.inventory, T = window.__travel.T, terrain = window.__travel.terrain;
  const w = s.map;
  const at = (x, y) => terrain(w.tiles[y * w.w + x]);
  // a dry square with the shallows just east of it, nothing on either
  let spot = null;
  for (let y = 2; y < w.h - 2 && !spot; y++) for (let x = 2; x < w.w - 3 && !spot; x++) {
    if (at(x, y).walk && !at(x, y).water && !at(x, y).feature && at(x + 1, y).key === 'shallows' && !w.entities.some((e) => (e.x === x || e.x === x + 1) && e.y === y)) spot = { x, y };
  }
  if (!spot) return { spot };
  await s.enterMap(w.id, spot.x, spot.y, { instant: true });
  await new Promise((res) => setTimeout(res, 200));
  s.peaceful = true;
  await s.move(1, 0);
  const without = { ...s.state.pos };
  const m = s.party.members[0];
  inv.selkie_shell = 1;
  C.equipItem(g, m, g.items.find((i) => i.id === 'selkie_shell'), inv);
  const turn0 = s.state.turn;
  await s.move(1, 0);
  const withShell = { ...s.state.pos, t: at(s.state.pos.x, s.state.pos.y).key, took: s.state.turn - turn0, cost: s.stepCost(s.state.pos.x, s.state.pos.y) };
  // and back ashore; without the shell no further into the water
  await s.move(-1, 0);
  C.unequip(m, 'charm', inv, g);
  await s.move(1, 0);
  const again = { ...s.state.pos };
  return { spot, without, withShell, again };
});
check('without the charm the shallows are closed', r.spot && r.without.x === r.spot.x, r);
check('with the Selkie\'s Shell worn the company wades into the shallows', r.withShell.x === r.spot.x + 1 && r.withShell.t === 'shallows' && r.withShell.took >= 1, r);
check('taken off, the way closes again', r.again.x === r.spot.x, r);

// ---- a shop with charms (the sample's curio-seller), for a look
r = await ev(async () => {
  const s = window.__app.session, g = s.game;
  const seller = g.maps.flatMap((m) => m.entities).find((e) => e.type === 'npc' && e.shop?.kind === 'charms');
  if (!seller) return { seller: false };
  s.party.gold = 900;
  s.ui.openShop(seller);
  await new Promise((res) => setTimeout(res, 300));
  return { seller: seller.name, rows: [...document.querySelectorAll('.shop-modal .shop-row.charm-row')].length };
});
check('a curio-seller sells charms', r.seller && r.rows >= 6, r);
await shot('charms_shop');
await closeModals();

// ---- battle: a blessing at the start, a charm's action on the bar
await ev(() => {
  const s = window.__app.session, g = s.game;
  const [a, b, c] = s.party.members;
  a.equip.charm = 'horn_of_brannoc';
  b.equip.charm = 'frostfang_pendant';
  c.equip.charm = 'stormcaller_orb';
  for (const m of s.party.members) { m.level = 5; m.hp = window.__charms.maxHp(g, m); m.mp = 30; m.status = 'ok'; }
  s.peaceful = false;
  s.engage({ id: 'x_charm', monster: 'goblin', count: '4', roaming: true });
});
const waitTurn = () => ev(async () => {
  let had = false;
  for (let i = 0; i < 300; i++) {
    const b = window.__app.session.battle;
    if (b) had = true; else if (had || i > 30) return null;
    if (b && b.active && !b.acting) return b.active.member.id;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
});
await waitTurn();
r = await ev(() => {
  const b = window.__app.session.battle;
  if (!b) return { battle: false };
  const log = [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent).join('\n');
  return {
    battle: true,
    blessed: b.partyUnits.filter((u) => b.alive(u)).map((u) => !!u.st.blessed),
    said: /Horn of Brannoc — the company is blessed/.test(log),
  };
});
check('a battle-start charm blesses the whole company and says so', r.battle && r.blessed.length && r.blessed.every(Boolean) && r.said, r);

// play the heroes' turns: the horn's free once-a-battle charge, the orb's lightning (cooldown 3)
const seen = { horn: null, orb: null, bar: null, shot: false };
for (let k = 0; k < 14 && (!seen.horn || !seen.orb); k++) {
  const who = await waitTurn();
  if (!who) break;
  // a look at the battle bar while a charm's action is ready (hovered, with its tooltip)
  if (!seen.shot && await ev(() => document.querySelectorAll('.cbt-btn.from-item:not(.off)').length > 0)) {
    await wait(400);
    await page.hover('.cbt-btn.from-item:not(.off)');
    await wait(500);
    await shot('charms_battlebar');
    seen.shot = true;
    await page.mouse.move(640, 300);
  }
  const res = await ev(async () => {
    const s = window.__app.session, b = s.battle, u = b.active;
    const out = {};
    const abs = b.abilitiesOf(u);
    const horn = abs.find((a) => a.id === 'item_horn_of_brannoc');
    const orb = abs.find((a) => a.id === 'item_stormcaller_orb');
    const btns = [...document.querySelectorAll('.cbt-btn.from-item')].map((e) => e.textContent);
    if (horn && b.canUseAbility(u, horn).ok) {
      out.bar = btns;
      const used = await b.actAbility(horn, null, u);
      await new Promise((r) => setTimeout(r, 300));
      out.horn = { used, stillTurn: b.active === u, hasted: b.partyUnits.filter((p) => b.alive(p)).every((p) => p.st.hasted), again: b.canUseAbility(u, horn), moves: b.movesFor(u) };
    }
    if (orb && b.active === u) {
      const can = b.canUseAbility(u, orb);
      if (can.ok) {
        out.bar = btns;
        await b.actAbility(orb, null, u);
        await new Promise((r) => setTimeout(r, 300));
        out.orb = { cd: u.cd[orb.id], again: b.canUseAbility(u, orb) };
      }
    }
    if (b.active === u && !b.acting) b.actPass();
    return out;
  });
  if (res.horn) { seen.horn = res.horn; seen.bar = res.bar; }
  if (res.orb) { seen.orb = res.orb; seen.bar = seen.bar || res.bar; }
}
check('a charm\'s battle action is on the battle bar with the item\'s badge', !!seen.bar && seen.bar.some((t) => /Sound the Charge|Chain Lightning/.test(t)) && seen.shot, seen);
check('a free once-a-battle charm action keeps the turn and is spent', seen.horn && seen.horn.used === false && seen.horn.hasted && !seen.horn.again.ok && /Used|already/.test(seen.horn.again.short + seen.horn.again.why), seen.horn);
check('a charm action with a cooldown waits its turns', seen.orb && seen.orb.cd > 1 && !seen.orb.again.ok && /Ready in/.test(seen.orb.again.short), seen.orb);

// ---- a passive on a blow struck: frost from the pendant (made sure for the test), life from a leech-stone
r = await ev(async () => {
  const s = window.__app.session, b = s.battle, g = s.game;
  if (!b) return { battle: false };
  const pend = g.items.find((i) => i.id === 'frostfang_pendant');
  const keep = JSON.stringify(pend.effects);
  pend.effects = [{ type: 'onHit', status: 'slowed', rounds: 2, chance: 1 }, { type: 'drain', pct: 0.5 }];
  const u = b.partyUnits.find((p) => p.member.equip.charm === 'frostfang_pendant' && b.alive(p));
  const foe = b.enemies.find((e) => b.alive(e));
  if (foe) foe.hp = Math.max(foe.hp, 10);
  if (!u || !foe) { pend.effects = JSON.parse(keep); return { u: !!u, foe: !!foe }; }
  u.member.hp = Math.max(1, b.maxHpOf(u) - 10);
  const hp0 = u.member.hp;
  await b.damage(foe, 2, { by: u, from: u });
  const out = { slowed: !!foe.st.slowed, healed: u.member.hp - hp0 };
  // taken off (in the pack), nothing
  delete foe.st.slowed;
  foe.hp = Math.max(foe.hp, 10);
  u.member.equip.charm = null;
  await b.damage(foe, 1, { by: u, from: u });
  out.packSlowed = !!foe.st.slowed;
  pend.effects = JSON.parse(keep);
  return out;
});
check('a passive charm fires on a blow struck (slows the foe, drinks some life)', r.slowed && r.healed >= 1, r);
check('...but not once the charm is off', r.packSlowed === false, r);
await shot('charms_battle');

// finish the fight quickly
await ev(async () => {
  const s = window.__app.session, b = s.battle;
  if (!b) return;
  for (const e of b.enemies) if (b.alive(e)) { e.hp = 1; await b.damage(e, 5, {}); }
  for (let i = 0; i < 80 && s.battle; i++) await new Promise((r) => setTimeout(r, 100));
});
await closeModals();

// ---- old saves and old games: the empty slot, the charms added once
r = await ev(() => {
  const s = window.__app.session, g = s.game, C = window.__charms, S = window.__schema;
  const old = { name: 'Old', race: 'human', cls: 'warrior', level: 2, hp: 10, equip: { weapon: 'dagger', ranged: null, armor: null, shield: null } };
  C.normalizeMember(g, old, {});
  const data = JSON.parse(S.serializeGame(g));
  data.items = data.items.filter((i) => i.type !== 'charm');
  delete data.settings.charmsV;
  const bow = data.items.find((i) => i.id === 'elven_bow');
  delete bow.effects;
  for (const m of data.maps) for (const e of m.entities || []) delete e.hoard;
  const back = S.deserializeGame(JSON.stringify(data));
  const twice = S.deserializeGame(S.serializeGame(back));
  const dungeons = back.maps.filter((m) => m.type === 'dungeon');
  return {
    slot: 'charm' in old.equip && old.equip.charm === null,
    charms: back.items.filter((i) => i.type === 'charm').length, want: g.items.filter((i) => i.type === 'charm' && i.id && !i.id.startsWith('x')).length,
    twice: twice.items.filter((i) => i.type === 'charm').length,
    bow: (back.items.find((i) => i.id === 'elven_bow').effects || []).length, flag: back.settings.charmsV,
    hoards: dungeons.filter((m) => m.entities.some((e) => e.type === 'chest' && e.hoard)).length, dungeons: dungeons.length,
  };
});
check('an old save\'s heroes gain an empty charm slot', r.slot, r);
check('an old game gains the charms once, and its magic gear their effects', r.charms >= 35 && r.twice === r.charms && r.bow > 0 && r.flag >= 1, r);
check('an old game\'s dungeons have their hoards marked', r.dungeons > 0 && r.hoards === r.dungeons, r);

// ---- the editor: a charm's effects, battle action and who may wear it
r = await ev(async () => {
  const app = window.__app;
  app.openEditor(app.sample);
  for (let i = 0; i < 50 && !app.editor; i++) await new Promise((res) => setTimeout(res, 100));
  await new Promise((res) => setTimeout(res, 800));
  for (let i = 0; i < 5 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((res) => setTimeout(res, 150)); }
  const ed = app.editor;
  ed.goTo({ tab: 'data', cat: 'items', id: 'horn_of_brannoc' });
  await new Promise((res) => setTimeout(res, 400));
  const labels = [...document.querySelectorAll('.form .field-label')].map((e) => e.textContent);
  const rows = [...document.querySelectorAll('.sl-head > span:first-child')].map((e) => e.textContent);
  const out = { labels: labels.filter((l) => /Effect|wear|battle action|Rarity|What it is|peoples|callings/i.test(l)), rows };
  return out;
});
check('the editor\'s item form shows a charm\'s effects, action and who may wear it',
  r.labels.includes('Effects') && r.labels.includes('Rarity') && r.labels.some((l) => /battle action/.test(l)) && r.labels.includes('Only these peoples') && r.rows.some((t) => /Battle start/.test(t)), r);
// (a look at the horn's form: its effects and its battle action)
await ev(() => { const el = [...document.querySelectorAll('.form-section')].find((e) => /Magic while worn/.test(e.textContent)); el?.scrollIntoView({ block: 'start' }); });
await wait(250);
await shot('charms_editor');
r = await ev(async () => {
  const ed = window.__app.editor;
  // a new charm starts ready to wear
  const btn = [...document.querySelectorAll('button.small')].find((b) => b.textContent === '+ New charm');
  btn?.click();
  await new Promise((res) => setTimeout(res, 300));
  const it = ed.game.items[ed.game.items.length - 1];
  return { type: it.type, effects: (it.effects || []).length, rarity: it.rarity, kind: it.kind, form: !!document.querySelector('.form .sublist') };
});
check('a new charm starts with sensible defaults', r.type === 'charm' && r.effects >= 1 && r.rarity && r.kind && r.form, r);

check('no page errors', !errors.length, errors);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall charms checks passed');
process.exit(fails ? 1 : 0);
