// Market: themed merchants and a real economy. Shop themes exist, are the
// game's own and editable; a new town's shops each sell 4–7 things along a
// fitting theme, and two towns' smiths differ; both adventures' shops are
// themed, small, and vary through the realm; prices follow the curve
// (tests/economy.mjs: the great sword is out of reach until the middle
// levels); merchants buy back at the sell rate; an old game keeps its
// hand-picked stock; the shop screen names its theme; and the Construction
// Set's theme picker, Shop themes and Trade rules work. Screenshots in
// tests/out: two smiths' shops, the person's Trade section, World Data's
// Shop themes, the Rules' Trade section. Prints PASS/FAIL per check; exits 1
// on any failure.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { economy, levelToAfford, TIERS } from './economy.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(HERE, '..', 'src');
const at = (p) => import(pathToFileURL(path.join(SRC, p)).href);
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };

// ------------------------------------------------------------ the data, and the generator (no browser)
const D = await at('data/defaults.js');
const S = await at('data/schema.js');
const G = await at('world/generate.js');
const P = await at('world/places.js');
const M = await at('game/shops.js');
const { buildSampleGame } = await at('data/sample.js');
const { buildLanternsGame } = await at('data/lanterns.js');

{
  const g = S.newGame({ blank: true });
  const kinds = new Set(g.shopThemes.map((t) => t.kind));
  const sizes = g.shopThemes.map((t) => M.themeStock(g, t).length);
  const missing = g.shopThemes.flatMap((t) => (t.items || []).filter((id) => !D.ITEMS.some((i) => i.id === id)).map((id) => `${t.id}:${id}`));
  check('the built-in shop themes are the game\'s own, a few of every kind', g.shopThemes.length >= 20 && g.shopThemes !== D.SHOP_THEMES
    && ['weapons', 'armor', 'provisions', 'reagents', 'scrolls', 'mixed', 'charms'].every((k) => g.shopThemes.filter((t) => t.kind === k).length >= 2), { n: g.shopThemes.length, kinds: [...kinds] });
  check('every built-in theme sells 4–7 things (never the whole list), all of them real items', sizes.every((n) => n >= 4 && n <= 7) && missing.every((m) => m.endsWith(':tower_shield')), { sizes, missing });
  // a designer's edit is the game's, not the defaults'
  g.shopThemes.find((t) => t.id === 'blades').items.push('battle_axe');
  check('editing a game\'s theme leaves the built-in table alone', !D.SHOP_THEMES.find((t) => t.id === 'blades').items.includes('battle_axe'), null);
}

// what a shop of each kind may sell
const SUITS = { weapons: ['weapon', 'shield', 'charm'], armor: ['armor', 'shield', 'charm'], provisions: ['consumable', 'key', 'reagent', 'charm'], reagents: ['reagent', 'charm'], scrolls: ['scroll', 'consumable', 'charm'], mixed: null, charms: ['charm'] };
const shopsOf = (map) => map.entities.filter((e) => e.type === 'npc' && e.shop && e.shop.kind in SUITS); // (traders: not inns, healers, taverns)
{
  // every kind of settlement, a few seeds each: each shop on a theme of its kind, fit for the place and folk
  const g = S.newGame({ blank: true });
  const bad = [], seen = {};
  for (const style of ['village', 'town', 'castle', 'elfhall', 'dwarfgate']) {
    for (let seed = 1; seed <= 4; seed++) {
      const { map } = G.generateSettlement(style, { seed: seed * 31 + style.length, name: `${style} ${seed}` });
      G.nameNpcs(map, g, seed);
      for (const e of shopsOf(map)) {
        const t = M.themeOf(g, e.shop), st = M.shopStock(g, e.shop);
        const its = st.map((id) => g.items.find((i) => i.id === id));
        if (!t || !e.shop.theme || t.kind !== e.shop.kind) bad.push(`${style}/${e.role}: no theme of its kind`);
        else if (st.length < 4 || st.length > 7) bad.push(`${style}/${e.role} ${t.id}: ${st.length} things`);
        else if (SUITS[t.kind] && its.some((it) => !SUITS[t.kind].includes(it.type))) bad.push(`${style}/${e.role} ${t.id}: sells off its trade`);
        else if (t.styles?.length && !t.styles.includes(style)) bad.push(`${style}/${e.role} ${t.id}: not for a ${style}`);
        if (t) (seen[style] ||= new Set()).add(t.id);
      }
    }
  }
  check('a generated place\'s shops each sell 4–7 things along a theme of their kind, fit for the place', !bad.length, bad);
  check('the dwarves\' hold sells dwarven axes and mail; the elves\' hall elven bows; a castle the dear arms', seen.dwarfgate?.has('axes_hammers') && [...seen.elfhall].some((id) => ['elven_arms', 'bows_arrows', 'hunting_arms'].includes(id))
    && [...seen.castle].some((id) => ['castle_armoury', 'plate_steel', 'mail_shields', 'blades'].includes(id)), Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v]])));
}
{
  // a Quick Start realm: its towns' smiths are each a different trade
  const g = S.newGame({ seed: 777, w: 72, h: 72 });
  const world = g.maps[0];
  const wants = [{ kind: 'town', name: 'Ashby' }, { kind: 'town', name: 'Brigg' }, { kind: 'town', name: 'Corwen' }, { kind: 'village', name: 'Dunmore' }, { kind: 'castle', name: 'Elderhold' }];
  const placed = P.autoPlaceSites(g, world, wants, { seed: 4242 });
  const smiths = placed.map((p) => p.map && shopsOf(p.map).find((e) => e.role === 'weapons')).filter(Boolean);
  const themes = smiths.map((e) => e.shop.theme);
  const stocks = smiths.map((e) => M.shopStock(g, e.shop).join());
  check('a Quick Start realm\'s towns each have a smith of a different trade, selling different things', smiths.length >= 3 && new Set(themes).size === themes.length && new Set(stocks).size === stocks.length, { themes, n: placed.length });
  // and a place built again from its plan keeps a fitting theme
  const town = placed[0].map;
  const before = shopsOf(town).map((e) => e.shop.theme).sort().join();
  P.rebuildPlace(g, town, P.planOf(town));
  const after = shopsOf(town).filter((e) => e.shop.theme);
  check('a town built again from its plan gives its shops themes again', after.length >= 3 && after.every((e) => M.shopStock(g, e.shop).length >= 4), { before, after: after.map((e) => e.shop.theme) });
}

// ------------------------------------------------------------ the adventures' shops
for (const [name, build] of [['Eldmark', buildSampleGame], ['The Glass Sea', buildLanternsGame]]) {
  const g = build();
  const bad = [];
  const smiths = new Map();
  for (const m of g.maps) for (const e of shopsOf(m)) {
    const n = M.shopStock(g, e.shop).length;
    if (n < 4 || n > 7) bad.push(`${e.name} (${m.name}): ${n}`);
    if (['weapons', 'bowyer'].includes(e.role)) smiths.set(`${e.name} (${m.name})`, M.shopStock(g, e.shop).join());
  }
  check(`${name}: every shop sells 4–7 things`, !bad.length, bad);
  check(`${name}: no two towns' weaponsmiths are alike`, smiths.size >= 3 && new Set(smiths.values()).size === smiths.size, [...smiths.keys()]);
  const themed = g.maps.flatMap(shopsOf).filter((e) => M.themeOf(g, e.shop)).length;
  check(`${name}: its shops are themed (named on the shop screen)`, themed >= g.maps.flatMap(shopsOf).length - 1, { themed, of: g.maps.flatMap(shopsOf).length });
}
{
  const g = buildSampleGame();
  const npc = (id) => g.maps.flatMap((m) => m.entities).find((e) => e.id === id);
  const pel = npc('npc_pelagia');
  const westhold = g.maps.find((m) => m.name === 'Westhold');
  const dear = shopsOf(westhold).flatMap((e) => M.shopStock(g, e.shop)).map((id) => g.items.find((i) => i.id === id)).filter((it) => ['weapon', 'armor', 'shield'].includes(it.type) && it.price > 150);
  check('Pelagia\'s charm stall stays small and dear', M.shopStock(g, pel.shop).length <= 7 && M.shopPriceMod(g, pel.shop) >= 1.2 && M.shopStock(g, pel.shop).every((id) => g.items.find((i) => i.id === id).type === 'charm'), pel.shop);
  check('Westhold, where the company sets out, sells only the humble tiers', !dear.length, dear.map((i) => i.id));
  const sellers = (id) => g.maps.flatMap(shopsOf).filter((e) => M.shopStock(g, e.shop).includes(id)).map((e) => e.name);
  check('the great sword is sold only at the castle, and dearly; the dwarves\' axe at their hold, cheaper at the forge', sellers('great_sword').join() === 'Dulcie' && sellers('dwarf_axe').join() === 'Hannar'
    && M.shopPriceMod(g, g.maps.flatMap(shopsOf).find((e) => e.name === 'Dulcie').shop) > 1 && M.shopPriceMod(g, g.maps.flatMap(shopsOf).find((e) => e.name === 'Hannar').shop) < 1, { gs: sellers('great_sword'), axe: sellers('dwarf_axe') });
  const L = buildLanternsGame();
  const isle = L.maps.filter((m) => ['Landfall', 'Tzal-Ka'].includes(m.name)).flatMap(shopsOf);
  check('the far isle\'s shops are dearer, and sell the isles\' own goods', isle.length >= 4 && isle.every((e) => M.shopPriceMod(L, e.shop) > 1) && isle.some((e) => M.shopStock(L, e.shop).includes('hookblade')) && isle.some((e) => M.shopStock(L, e.shop).includes('lizardhide')),
    isle.map((e) => [e.name, M.shopPriceMod(L, e.shop)]));
}

// ------------------------------------------------------------ prices on the curve
{
  const p = Object.fromEntries(D.ITEMS.map((i) => [i.id, i.price]));
  const rising = (ids) => ids.every((id, i) => i === 0 || p[id] > p[ids[i - 1]]);
  const lines = [['dagger', 'short_sword', 'long_sword', 'great_sword'], ['hand_axe', 'battle_axe', 'dwarf_axe'], ['mace', 'warhammer'], ['sling', 'short_bow', 'long_bow', 'crossbow'],
    ['robe', 'leather_armor', 'studded_leather', 'chain_mail', 'scale_mail', 'plate_armor', 'truesilver_mail'], ['buckler', 'kite_shield'], ['healing_draught', 'greater_draught', 'phoenix_feather']];
  check('within each line, the better piece costs more', lines.every(rising), lines.filter((l) => !rising(l)));
  const tier = (t) => TIERS[t].filter((id) => p[id] != null).map((id) => p[id]);
  check('the tiers are a curve: basic gear cheap, good gear several times dearer, the great pieces many times', Math.max(...tier('basic')) * 2.5 < Math.min(...tier('good').filter((x, i) => TIERS.good[i] !== 'spear'))
    && Math.max(...tier('good')) * 1.8 < Math.min(...tier('great')) && p.great_sword >= 700, { basic: tier('basic'), good: tier('good'), great: tier('great') });
  const rare = D.ITEMS.filter((i) => i.type === 'charm');
  const by = (r) => rare.filter((i) => i.rarity === r).map((i) => i.price);
  check('charms cost what their rarity says: a rare one is an accomplishment', Math.max(...by('common')) < Math.min(...by('rare')) && Math.min(...by('rare')) >= 500 && Math.min(...by('legendary')) >= 1000, { common: Math.max(...by('common')), rare: Math.min(...by('rare')) });
}
const econ = await economy({ adventures: ['sample', 'lanterns'], fights: 200 });
for (const [k, name] of [['sample', 'Eldmark'], ['lanterns', 'The Glass Sea']]) {
  const res = econ[k];
  const lv = (id) => levelToAfford(res, id);
  const basic = ['dagger', 'short_sword', 'sling', 'leather_armor', 'buckler'].map(lv);
  const good = ['long_sword', 'chain_mail', 'kite_shield'].map(lv);
  check(`${name}: basic gear is in reach from the first hour (level 1)`, basic.every((l) => l <= 1), basic);
  check(`${name}: good gear (a long sword, mail, a kite shield) around level 3`, good.every((l) => l >= 2 && l <= 4), good);
  check(`${name}: the great sword is out of reach until level 5 or later (and in reach by 7)`, lv('great_sword') >= 5 && lv('great_sword') <= 7, { gs: lv('great_sword'), rows: res.rows.map((r) => r.inHand) });
  check(`${name}: plate and the great two-handers need saving to level 5 or later`, ['plate_armor', 'battle_axe'].every((id) => lv(id) >= 5), ['plate_armor', 'battle_axe'].map(lv));
  check(`${name}: a draught is a decision — a few fights' purses`, res.prices.great_sword && (res.game.items.find((i) => i.id === 'healing_draught').price >= 1.5 * res.bands[2].gold), { draught: res.game.items.find((i) => i.id === 'healing_draught').price, purse: res.bands[2].gold });
}
{
  // old: the great sword in reach on day one
  const base = process.env.BASE_SRC;
  if (base) {
    const old = await economy({ src: base, adventures: ['sample'], fights: 120 });
    check('(before: the great sword was in reach on day one)', levelToAfford(old.sample, 'great_sword') <= 1, null);
  }
}

// ------------------------------------------------------------ an old game
{
  const g = buildSampleGame();
  const data = JSON.parse(S.serializeGame(g));
  delete data.shopThemes; delete data.settings.marketV; delete data.settings.sellRate; delete data.settings.priceScale;
  // the old prices, a designer's own, and a shop with its own list
  const OLD = { dagger: 4, great_sword: 90, plate_armor: 450, healing_draught: 25, lucky_acorn: 25 };
  for (const [id, price] of Object.entries(OLD)) data.items.find((i) => i.id === id).price = price;
  data.items.find((i) => i.id === 'long_sword').price = 55; // (the designer's)
  const smith = data.maps.flatMap((m) => m.entities).find((e) => e.shop?.kind === 'weapons' && e.name === 'Ambrose');
  smith.shop = { kind: 'weapons', stock: ['dagger', 'short_sword', 'long_sword', 'great_sword', 'hand_axe', 'battle_axe', 'mace', 'warhammer', 'quarterstaff', 'spear', 'sling', 'short_bow', 'long_bow', 'crossbow'] };
  const empty = data.maps.flatMap((m) => m.entities).find((e) => e.shop?.kind === 'armor' && e.name === 'Orabel');
  empty.shop = { kind: 'armor', stock: [] };
  const g2 = S.deserializeGame(JSON.stringify(data));
  const it = (id) => g2.items.find((i) => i.id === id);
  const sm = g2.maps.flatMap((m) => m.entities).find((e) => e.name === 'Ambrose');
  const ar = g2.maps.flatMap((m) => m.entities).find((e) => e.name === 'Orabel');
  check('an old game gains the shop themes and the new sell rate', Array.isArray(g2.shopThemes) && g2.shopThemes.length >= 20 && g2.settings.sellRate === 0.35 && g2.settings.marketV >= 1, { themes: g2.shopThemes?.length, rate: g2.settings.sellRate });
  check('…its shops with a list of their own keep it, word for word', M.shopStock(g2, sm.shop).length === 14 && sm.shop.stock.includes('great_sword') && !sm.shop.theme, sm.shop);
  check('…a shop with nothing set sells along its kind\'s first theme', M.shopStock(g2, ar.shop).length >= 4, M.shopStock(g2, ar.shop));
  check('…built-in prices update only where still at the old ones', it('dagger').price === 12 && it('great_sword').price === D.ITEMS.find((i) => i.id === 'great_sword').price && it('plate_armor').price === 900 && it('healing_draught').price === 35 && it('lucky_acorn').price === 35 && it('long_sword').price === 55,
    { dagger: it('dagger').price, gs: it('great_sword').price, ls: it('long_sword').price });
  const g3 = S.deserializeGame(S.serializeGame(g2));
  check('…and only once', g3.items.find((i) => i.id === 'long_sword').price === 55 && JSON.stringify(g3.shopThemes) === JSON.stringify(g2.shopThemes), null);
}

// ------------------------------------------------------------ in the browser
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
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
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
await ev(async () => {
  const app = window.__app;
  app.playGame(app.sample, { quick: true, noSave: true });
  for (let i = 0; i < 100; i++) { const s = app.session; if (s && s.map && !s.transitioning) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, 300));
});
await closeModals();

// the shop screen names its theme: two smiths, two trades
const openSmith = (town) => ev(async (town) => {
  const s = window.__app.session, g = s.game;
  const map = g.maps.find((m) => m.name === town);
  const smith = map.entities.find((e) => e.type === 'npc' && e.shop?.kind === 'weapons');
  s.party.gold = 900;
  s.ui.openShop(smith);
  await new Promise((r) => setTimeout(r, 400));
  const modal = document.querySelector('.shop-modal');
  return {
    title: modal?.querySelector('.modal-title, h2, .modal-head')?.textContent || modal?.closest('.modal-back')?.querySelector('h2,.modal-title')?.textContent || '',
    theme: modal?.querySelector('.shop-theme')?.textContent || '',
    rows: [...(modal?.querySelectorAll('.shop-row .sr-name') || [])].map((x) => x.childNodes[0]?.textContent || x.textContent),
    prices: [...(modal?.querySelectorAll('.shop-row .price') || [])].map((x) => +x.textContent.replace(/\D/g, '')),
    name: smith.name,
  };
}, town);
const west = await openSmith('Westhold');
check('the shop screen names the smith\'s trade and says what it is ("Ambrose\'s Militia Arms — spears, maces and slings")', new RegExp(`${west.name}'s Militia Arms`).test(west.title) && /spears, maces and slings/.test(west.theme) && /cheap here/.test(west.theme), west);
check('…and shows just its 4–7 wares, at its prices', west.rows.length >= 4 && west.rows.length <= 7 && west.rows.includes('Spear') && !west.rows.includes('Great Sword') && west.prices[west.rows.indexOf('Spear')] === 99, west);
await shot('market-shop-westhold');
await closeModals();
const deep = await openSmith('Hammerdeep');
check('the dwarves\' smith keeps another trade: axes and hammers, and their own axe', /Axes & Hammers/.test(deep.title) && deep.rows.includes('Battle Axe') && deep.rows.some((r) => /Dwarven Axe/.test(r)) && deep.rows.join() !== west.rows.join(), deep);
await shot('market-shop-hammerdeep');
await closeModals();
const castle = await openSmith('Caer Aldon');
check('the castle\'s armoury is dear, and sells the great sword at a long saving', /Castle Armoury/.test(castle.title) && /dear here/.test(castle.theme) && castle.prices[castle.rows.indexOf('Great Sword')] >= 800, castle);
await closeModals();

// selling: at the sell rate, and a price scale in the Rules
const sold = await ev(() => {
  const s = window.__app.session, g = s.game, ui = s.ui;
  const it = (id) => g.items.find((i) => i.id === id);
  const shop = { shop: { kind: 'weapons', stock: [] } };
  const out = { rate: g.settings.sellRate, gs: ui.priceOf(it('great_sword'), shop, true), gsBuy: ui.priceOf(it('great_sword'), shop), plate: ui.priceOf(it('plate_armor'), shop) };
  g.settings.sellRate = 0.5; out.half = ui.priceOf(it('great_sword'), shop, true);
  g.settings.sellRate = 0.35;
  g.settings.priceScale = 2; out.scaled = ui.priceOf(it('long_sword'), shop);
  g.settings.priceScale = 1; out.plain = ui.priceOf(it('long_sword'), shop);
  s.party.inventory.great_sword = 1;
  const smith = g.maps.find((m) => m.name === 'Westhold').entities.find((e) => e.shop?.kind === 'weapons');
  ui.openShop(smith);
  return out;
});
await wait(300);
const sellTab = await ev(async () => {
  [...document.querySelectorAll('.shop-modal .tabs button')].find((b) => b.textContent === 'Sell')?.click();
  await new Promise((r) => setTimeout(r, 300));
  const row = [...document.querySelectorAll('.shop-modal .shop-row')].find((r) => /Great Sword/.test(r.textContent));
  return { price: +(row?.querySelector('.price')?.textContent.replace(/\D/g, '') || 0), hint: document.querySelector('.shop-modal .shop-list > p.hint')?.textContent || '' };
});
check('merchants buy back at the sell rate (35%): a found great sword is no fortune', sold.rate === 0.35 && sold.gs === Math.floor(D.ITEMS.find((i) => i.id === 'great_sword').price * 0.35) && sold.gs < sold.plate / 3 && sellTab.price === sold.gs && /35% of the price/.test(sellTab.hint), { sold, sellTab });
check('the sell rate and the price scale are the Rules\' to change', sold.half === Math.floor(D.ITEMS.find((i) => i.id === 'great_sword').price * 0.5) && sold.scaled === sold.plain * 2, sold);
await closeModals();
await ev(() => { delete window.__app.session.party.inventory.great_sword; });

// ------------------------------------------------------------ the Construction Set
await ev(async () => {
  const app = window.__app;
  app.stopSession?.();
  app.openEditor(app.sample);
  await new Promise((r) => setTimeout(r, 1200));
});
const pick = await ev(async () => {
  const ed = window.__app.editor, g = ed.game, Mk = window.__market;
  const map = g.maps.find((m) => m.name === 'Westhold');
  const smith = map.entities.find((e) => e.type === 'npc' && e.shop?.kind === 'weapons');
  ed.goTo({ tab: 'map', map: map.id, entity: smith.id });
  await new Promise((r) => setTimeout(r, 900));
  const field = (re) => [...document.querySelectorAll('.ed-right .field')].find((f) => re.test(f.querySelector('.field-label')?.textContent || ''));
  const sel = field(/^Trades in$/)?.querySelector('select');
  const out = { first: sel?.value, options: [...(sel?.options || [])].map((o) => o.value).filter(Boolean), wares0: document.querySelector('.ed-right .insp-wares')?.textContent || '' };
  if (sel) { sel.value = 'blades'; sel.dispatchEvent(new Event('change')); }
  await new Promise((r) => setTimeout(r, 300));
  out.theme = smith.shop.theme; out.chosen = smith.shop.chosen;
  out.wares1 = document.querySelector('.ed-right .insp-wares')?.textContent || '';
  out.follows = Mk.followsTheme(smith.shop);
  out.markup = field(/Price multiplier/)?.querySelector('input')?.placeholder || '';
  // pick by hand: the theme's wares, ticked, to change
  const own = [...document.querySelectorAll('.ed-right label.field.check')].find((l) => /Pick the wares by hand/.test(l.textContent))?.querySelector('input');
  own?.click();
  await new Promise((r) => setTimeout(r, 300));
  out.pinned = smith.shop.stock.slice();
  out.sells = !!field(/^Sells$/);
  const box = [...(field(/^Sells$/)?.querySelectorAll('label.mc') || [])].find((l) => /^Battle Axe/.test(l.textContent))?.querySelector('input');
  box?.click();
  await new Promise((r) => setTimeout(r, 200));
  out.withAxe = Mk.shopStock(g, smith.shop).includes('battle_axe');
  // back to the theme
  [...document.querySelectorAll('.ed-right label.field.check')].find((l) => /Pick the wares by hand/.test(l.textContent))?.querySelector('input')?.click();
  await new Promise((r) => setTimeout(r, 300));
  out.back = smith.shop.stock.length === 0 && Mk.shopStock(g, smith.shop).join() === Mk.themeStock(g, Mk.themeById(g, 'blades')).join();
  [...document.querySelectorAll('.form-section')].find((e) => /Trade/.test(e.textContent))?.scrollIntoView({ block: 'start' });
  return out;
});
check('the person\'s Trade section picks a theme from the trades of their kind, and shows what it gives', pick.first === 'militia_arms' && pick.options.includes('blades') && !pick.options.includes('leatherwork')
  && /Sells 6: Dagger ◆11/.test(pick.wares0) && pick.theme === 'blades' && pick.chosen && /Long Sword ◆140/.test(pick.wares1) && pick.follows && /^1 — the theme's/.test(pick.markup), pick);
check('…the wares may be picked by hand instead, and given back to the theme', pick.pinned.length === 4 && pick.sells && pick.withAxe && pick.back, pick);
await wait(200);
await shot('market-cs-inspector-trade');

const data = await ev(async () => {
  const ed = window.__app.editor, g = ed.game, Mk = window.__market;
  ed.goTo({ tab: 'data', cat: 'shopThemes', id: 'axes_hammers' });
  await new Promise((r) => setTimeout(r, 500));
  const out = {
    cat: !!document.querySelector('.cat-list button.on') && /Shop themes/.test(document.querySelector('.cat-list button.on').textContent),
    entries: [...document.querySelectorAll('.entry-list .entry')].map((b) => b.textContent),
    groups: [...document.querySelectorAll('.entry-list .entry-group')].map((b) => b.textContent),
    head: document.querySelector('.db-head h2')?.textContent || '',
    summary: [...document.querySelectorAll('.form .hint')].map((x) => x.textContent).find((t) => /things, ◆/.test(t)) || '',
  };
  // tick a piece into the theme: every shop following it sells it too
  const deep = g.maps.find((m) => m.name === 'Hammerdeep');
  const field = [...document.querySelectorAll('.field')].find((f) => /^Sells$/.test(f.querySelector('.field-label')?.textContent || ''));
  const box = [...(field?.querySelectorAll('label.mc') || [])].find((l) => /^Great Sword/.test(l.textContent))?.querySelector('input');
  const t = Mk.themeById(g, 'axes_hammers');
  // (a shop in a fresh dwarf hold that follows the theme)
  const keeper = { shop: { kind: 'weapons', theme: 'axes_hammers', stock: [] } };
  const before = Mk.shopStock(g, keeper.shop).includes('great_sword');
  box?.click();
  await new Promise((r) => setTimeout(r, 300));
  out.ticked = t.items.includes('great_sword') && !before && Mk.shopStock(g, keeper.shop).includes('great_sword');
  // (Hammerdeep's own smith keeps his hand-picked list)
  out.pinnedKept = !Mk.shopStock(g, deep.entities.find((e) => e.shop?.kind === 'weapons').shop).includes('great_sword');
  [...(document.querySelectorAll('.field label.mc') || [])].find((l) => /^Great Sword/.test(l.textContent))?.querySelector('input')?.click();
  await new Promise((r) => setTimeout(r, 200));
  out.untick = !t.items.includes('great_sword');
  out.summary2 = [...document.querySelectorAll('.form .hint')].map((x) => x.textContent).find((t2) => /things, ◆/.test(t2)) || '';
  document.querySelector('.ed-main, .db-main, main')?.scrollTo?.(0, 0);
  return out;
});
check('World Data has Shop themes, grouped by kind of shop', data.cat && data.entries.includes('Axes & Hammers') && data.entries.length >= 20 && data.groups.length >= 6 && /Axes & Hammers/.test(data.head), data);
check('…a theme\'s form says what it sells, its prices and who trades in it', /5 things, ◆30–580/.test(data.summary) && /Hannar/.test(data.summary) && /by hand/.test(data.summary), data.summary);
check('…ticking a piece into a theme stocks every shop that follows it (a hand-picked list is left alone)', data.ticked && data.pinnedKept && data.untick, data);
await wait(200);
await shot('market-cs-shop-themes');

const rules = await ev(async () => {
  const ed = window.__app.editor, g = ed.game;
  ed.setTab('rules');
  await new Promise((r) => setTimeout(r, 400));
  const sec = document.querySelector('#set-trade');
  sec?.scrollIntoView({ block: 'start' });
  const input = [...(sec?.querySelectorAll('.field') || [])].find((f) => /Merchants pay/.test(f.textContent))?.querySelector('input');
  const was = input?.value;
  if (input) { input.value = '0.4'; input.dispatchEvent(new Event('input')); }
  const out = { sec: !!sec, was, now: g.settings.sellRate, scale: [...(sec?.querySelectorAll('.field') || [])].some((f) => /Price scale/.test(f.textContent)) };
  if (input) { input.value = '0.35'; input.dispatchEvent(new Event('input')); }
  return out;
});
check('the Rules step\'s Trade section sets what merchants pay, and a price scale', rules.sec && rules.was === '0.35' && rules.now === 0.4 && rules.scale, rules);
await wait(200);
await shot('market-cs-rules-trade');

check('no page errors', !errors.length, errors.slice(0, 3));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
