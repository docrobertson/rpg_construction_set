// The schools of magic: the wizard's spellbook and copying scrolls into it,
// rangers' herb-lore (herbs, not mana) and foraging, plain words on who can
// use a reagent, resource bars named for each school, and old games and
// saves brought up to date (each check prints PASS/FAIL).
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
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
await ev(async () => {
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, 300));
});
await closeModals();

// ---- the wizard's cast window is an open spellbook, spells by circle
let r = await ev(async () => {
  const s = window.__app.session, M = window.__magic;
  const wiz = s.party.members.find((m) => m.cls === 'wizard');
  wiz.level = 3; wiz.mp = M.maxMp(s.game, wiz);
  const known = M.knownSpells(s.game, wiz);
  const p = s.ui.chooseSpell(wiz, known);
  await new Promise((res) => setTimeout(res, 200));
  const out = {
    book: !!document.querySelector('.cast-book .sb-tome .sb-page'),
    title: document.querySelector('.cast-book .modal-title')?.textContent || '',
    rows: document.querySelectorAll('.cast-book .sb-row').length, known: known.length,
    circles: [...document.querySelectorAll('.sb-circle')].map((e) => e.textContent),
    gems: document.querySelectorAll('.cast-book .sb-cost .pip').length,
    pool: document.querySelector('.cast-book .sb-pool')?.textContent || '',
  };
  document.querySelector('.cast-book .modal-x').click();
  out.closed = (await p) === null;
  return out;
});
check('a wizard casts from an open spellbook', r.book && /Spellbook/.test(r.title) && r.rows === r.known && r.closed, r);
check('the spellbook groups spells by circle and shows mana as gems', r.circles.includes('First Circle') && r.circles.includes('Second Circle') && r.gems > 0 && /Mana/.test(r.pool), r);

// ---- a spell scroll copied into the book is known for good
r = await ev(async () => {
  const s = window.__app.session, M = window.__magic, g = s.game;
  const wiz = s.party.members.find((m) => m.cls === 'wizard');
  const acid = g.spells.find((sp) => sp.id === 'acid_arrow');
  const before = M.knownSpells(g, wiz).includes(acid);
  s.party.inventory.scroll_acid_arrow = 1;
  s.party.inventory.scroll_ice_storm = 1;
  const tooHigh = M.canCopy(g, wiz, g.items.find((i) => i.id === 'scroll_ice_storm'));
  s.ui.openParty();
  await new Promise((res) => setTimeout(res, 200));
  const pack = document.querySelector('.party-modal').innerText;
  const btn = [...document.querySelectorAll('.party-modal button.cmp.copy')].find((b) => b.textContent.includes(`Copy into ${wiz.name}'s spellbook`));
  btn?.click();
  await new Promise((res) => setTimeout(res, 300));
  const out = {
    before, button: !!btn, inBook: wiz.book.includes('acid_arrow'), known: M.knownSpells(g, wiz).includes(acid),
    left: s.party.inventory.scroll_acid_arrow, tooHigh: !tooHigh.ok && /level/.test(tooHigh.why), scrollLine: /can copy it|keeps no spellbook|beyond/.test(pack),
    logged: [...document.querySelectorAll('.hud-log .log-line')].some((e) => /copies Acid Arrow into the spellbook/.test(e.textContent)),
  };
  // the copied spell is cast like any other
  out.listed = M.knownSpells(g, wiz).filter((sp) => sp.combat).includes(acid);
  return out;
});
await closeModals();
check('a scroll in the pack offers "Copy into …\'s spellbook"', r.button && r.scrollLine, r);
check('copying a scroll teaches the spell for good and uses the scroll up', !r.before && r.inBook && r.known && r.left === 0 && r.logged && r.listed, r);
check('a scroll beyond the wizard\'s circle cannot be copied yet', r.tooHigh, r);

// ---- rangers brew remedies from herbs, not mana
r = await ev(async () => {
  const s = window.__app.session, M = window.__magic, g = s.game;
  const ranger = s.party.members.find((m) => m.cls === 'ranger');
  const known = M.knownSpells(g, ranger);
  const inv = s.party.inventory;
  inv.silverleaf = 0;
  const poultice = g.spells.find((sp) => sp.id === 'poultice');
  const p = s.ui.chooseSpell(ranger, known);
  await new Promise((res) => setTimeout(res, 200));
  const satchel = !!document.querySelector('.cast-herbs .sb-herbs');
  const missing = document.querySelector('.cast-herbs')?.innerText.includes('Missing Silverleaf');
  document.querySelector('.cast-herbs .modal-x').click();
  await p;
  const hurt = s.party.members.find((m) => m.cls === 'warrior');
  hurt.hp = 3;
  const noHerb = await s.castField(ranger, poultice, hurt);
  inv.silverleaf = 2;
  const mp0 = ranger.mp;
  const cast = await s.castField(ranger, poultice, hurt);
  return {
    maxMp: M.maxMp(g, ranger), schools: [...new Set(known.map((sp) => sp.system))], herbs: known.every((sp) => (sp.reagents || []).length),
    satchel, missing, noHerb, cast, left: inv.silverleaf, mp: ranger.mp === mp0, healed: hurt.hp > 3,
    bar: [...document.querySelectorAll('.pcard')].map((c) => c.querySelector('.bar.res')?.textContent || ''),
  };
});
check('a ranger has no mana: Herb-lore burns herbs', r.maxMp === 0 && r.schools.join() === 'herbal' && r.herbs, r);
check('the ranger\'s window is a herb satchel that names a missing herb', r.satchel && r.missing, r);
check('a Poultice needs Silverleaf, uses one up and heals', r.noHerb === false && r.cast === true && r.left === 1 && r.mp && r.healed, r);
check('roster bars are named for each school (Mana, Faith, Herbs)', r.bar.some((t) => /^Mana \d/.test(t)) && r.bar.some((t) => /^Faith \d/.test(t)) && r.bar.some((t) => /^Herbs \d/.test(t)), r.bar);

// ---- foraging: a ranger gathers the herbs of the ground underfoot
r = await ev(async () => {
  const s = window.__app.session, g = s.game, inv = s.party.inventory;
  const sure = { chance: () => true, pick: (a) => a[0] };
  for (const id of ['silverleaf', 'puffcap', 'bitterwort', 'ironbark', 'hawkweed']) inv[id] = 0;
  const forest = s.forage('forest', sure);
  const swamp = s.forage('swamp', { chance: () => true, pick: (a) => a[a.length - 1] });
  const road = s.forage('road', sure);
  const line = [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent).find((t) => /gathers \d (Silverleaf|Puffcap)/.test(t));
  // only those whose art burns the herbs gather them
  const keep = s.party.members;
  s.party.members = keep.filter((m) => m.cls !== 'ranger');
  const none = s.forage('forest', sure);
  s.party.members = keep;
  // and it happens as the company walks the wild (a forest square beside it)
  const calls = [];
  const orig = s.forage.bind(s);
  s.forage = (k) => { calls.push(k); return orig(k, sure); };
  const p = s.state.pos, map = s.map;
  const T = window.__travel.T;
  let dir = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = p.x + dx, y = p.y + dy;
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    if (map.entities.some((e) => e.x === x && e.y === y)) continue;
    map.tiles[y * map.w + x] = T.forest; dir = [dx, dy]; break;
  }
  const before = (inv.silverleaf || 0) + (inv.puffcap || 0);
  if (dir) await s.move(dir[0], dir[1]);
  s.forage = orig;
  return {
    forest: forest && forest.item.id, n: forest?.n, swamp: swamp && swamp.item.id, road, none, line: !!line,
    walked: map.type === 'world' && calls.includes('forest') && (inv.silverleaf || 0) + (inv.puffcap || 0) > before, type: map.type,
  };
});
check('foraging in the forest yields forest herbs, the swamp swamp herbs', ['silverleaf', 'puffcap'].includes(r.forest) && r.n >= 1 && ['bitterwort', 'puffcap'].includes(r.swamp) && r.line, r);
check('no herbs on the road, and none without a herb-wise hero', r.road === null && r.none === null, r);
check('walking into wild country forages as you go', r.walked, r);

// ---- every reagent says plainly whether anyone in the company can use it
r = await ev(async () => {
  const s = window.__app.session;
  const inv = s.party.inventory;
  inv.moonpetal = 2; inv.silverleaf = 2;
  s.ui.openParty();
  await new Promise((res) => setTimeout(res, 200));
  const rows = [...document.querySelectorAll('.party-modal .inv-row')];
  const row = (name) => rows.find((e) => e.querySelector('.inv-name b')?.textContent === name);
  const moon = row('Moonpetal'), leaf = row('Silverleaf');
  const out = {
    moon: moon?.querySelector('.cmp.use')?.textContent, moonGrey: moon?.classList.contains('useless'),
    leaf: leaf?.querySelector('.cmp.use')?.textContent, leafGrey: leaf?.classList.contains('useless'),
  };
  await new Promise((res) => setTimeout(res, 50));
  document.querySelector('.party-modal').closest('.modal-back').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const herbalist = s.game.maps.flatMap((m) => m.entities).find((e) => e.shop?.kind === 'reagents' && e.shop.stock.includes('moonpetal') && e.shop.stock.includes('silverleaf'));
  s.ui.openShop(herbalist);
  await new Promise((res) => setTimeout(res, 200));
  const srows = [...document.querySelectorAll('.shop-modal .shop-row')];
  const srow = (name) => srows.find((e) => e.querySelector('.sr-name b')?.textContent === name);
  out.shopMoon = srow('Moonpetal')?.classList.contains('useless');
  out.shopLeaf = srow('Silverleaf')?.classList.contains('useless');
  out.shopText = srow('Moonpetal')?.querySelector('.cmp.use')?.textContent;
  document.querySelector('.shop-modal').closest('.modal-back').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return out;
});
check('a useful herb says who uses it, for what', /^✓ Used by .+: Poultice/.test(r.leaf || '') && !r.leafGrey, r);
check('a useless reagent says no one can use it, and is greyed', /^✗ No one in your company can use this \(rune-craft\)/.test(r.moon || '') && r.moonGrey, r);
check('shops grey out reagents no one in the company can use', r.shopMoon === true && r.shopLeaf === false && /No one/.test(r.shopText || ''), r);

// ---- the help's magic guide: every school, its mark and what it burns
r = await ev(async () => {
  window.__app.session.ui.openHelp();
  await new Promise((res) => setTimeout(res, 200));
  const rows = [...document.querySelectorAll('.hw-magic .mg-row')].map((e) => e.textContent);
  document.querySelector('.help-modal .modal-x')?.click();
  return rows;
});
check('the help lists Herb-lore and each school\'s resource', r.some((t) => /Herb-lore/.test(t) && /Herbs/.test(t)) && r.some((t) => /Prayer/.test(t) && /Faith/.test(t)) && r.some((t) => /Sorcery/.test(t) && /spellbook/.test(t)), r);

// ---- old games and saves: the default ranger moves to Herb-lore, a custom one is left alone
r = await ev(() => {
  const { serializeGame, deserializeGame } = window.__schema;
  const g = window.__app.sample;
  const old = JSON.parse(serializeGame(g));
  delete old.magicV;
  old.magic = old.magic.filter((m) => m.id !== 'herbal').map((m) => { const { style, resName, verb, icon, ...rest } = m; return rest; });
  old.spells = old.spells.filter((sp) => sp.system !== 'herbal' && !sp.scroll);
  old.items = old.items.filter((it) => !it.forage && it.type !== 'scroll');
  const ranger = old.classes.find((k) => k.id === 'ranger');
  ranger.magic = [{ system: 'divine', rate: 0.5 }];
  ranger.desc = 'A wanderer of the wild places, deadly with the bow and wise in woodcraft. Learns a little Prayer.';
  const custom = JSON.parse(JSON.stringify(old));
  custom.classes.find((k) => k.id === 'ranger').magic = [{ system: 'song', rate: 0.5 }];
  const a = deserializeGame(JSON.stringify(old)), b = deserializeGame(JSON.stringify(custom));
  // a hero from an old save: no spellbook, mana from Prayer
  const s = window.__app.session;
  const hero = { ...JSON.parse(JSON.stringify(s.party.members.find((m) => m.cls === 'ranger'))), mp: 6 };
  delete hero.book;
  return {
    ranger: a.classes.find((k) => k.id === 'ranger').magic, desc: a.classes.find((k) => k.id === 'ranger').desc,
    herbal: !!a.magic.find((m) => m.id === 'herbal'), leaf: !!a.items.find((i) => i.id === 'silverleaf'), poultice: !!a.spells.find((sp) => sp.id === 'poultice'),
    looks: a.magic.find((m) => m.id === 'divine').resName, custom: b.classes.find((k) => k.id === 'ranger').magic,
    shops: a.maps.flatMap((m) => m.entities).filter((e) => e.shop?.kind === 'reagents').every((e) => e.shop.stock.includes('silverleaf')),
    hero,
  };
});
check('an old game\'s default ranger takes up Herb-lore', r.ranger[0]?.system === 'herbal' && /herbs/.test(r.desc) && r.herbal && r.leaf && r.poultice && r.looks === 'Faith' && r.shops, r);
check('a custom ranger is left as its maker made it', r.custom[0]?.system === 'song', r.custom);
r = await ev((hero) => {
  const s = window.__app.session, M = window.__magic;
  const st = JSON.parse(JSON.stringify(s.state));
  st.party.members.push(hero);
  const S = s.constructor;
  const s2 = new S(window.__app, s.game, st, { noSave: true });
  const h2 = s2.party.members[s2.party.members.length - 1];
  return { book: Array.isArray(h2.book), mp: h2.mp, spells: M.knownSpells(s.game, h2).map((sp) => sp.system) };
}, r.hero);
check('an old save\'s ranger loads with no mana and herb remedies', r.book && r.mp === 0 && r.spells.length && r.spells.every((x) => x === 'herbal'), r);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
if (errors.length) fails++;
await browser.close();
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('magic: all passed');
