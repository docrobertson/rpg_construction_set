// Screenshots of every UI screen for visual review: title, adventure picker,
// party creation, the play HUD, shop, dialog, pack, hero pop-over, help,
// the first-time card, a battle and the editor — at several window sizes.
// Usage: node tests/uishots.mjs [prefix] [out-dir] [sizes, e.g. 1280x800,1024x768]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const pre = process.argv[2] || 'ui';
const OUT = process.argv[3] || path.join(HERE, 'out');
const SIZES = (process.argv[4] || '1280x800').split(',').map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];

for (const [W, H] of SIZES) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const wait = (ms) => page.waitForTimeout(ms);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const tag = SIZES.length > 1 || W !== 1280 ? `-${W}x${H}` : '';
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${pre}-${name}${tag}.png`, timeout: 180000 }); console.log('shot', name + tag); };
  const esc = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await wait(250); } };
  // nothing may stick out sideways, and the floating map widgets must not overlap
  const audit = async (where) => {
    const r = await ev(() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
      const box = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden || e.offsetParent === null) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
      const pairs = [['.qtrack', '.cbt-strip'], ['.qtrack', '.howto'], ['.cbt-strip', '.howto'], ['.qtrack', '.nearby'], ['.howto', '.nearby']];
      for (const [a, b] of pairs) {
        const A = box(a), B = box(b);
        if (A && B && A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom) out.push(`${a} overlaps ${b}`);
      }
      for (const sel of ['.qtrack', '.cbt-strip', '.howto', '.modal']) {
        const A = box(sel);
        if (A && (A.right > innerWidth + 1 || A.bottom > innerHeight + 1 || A.left < -1 || A.top < -1)) out.push(`${sel} leaves the window`);
      }
      return out;
    });
    for (const p of r) problems.push(`${W}x${H} ${where}: ${p}`);
  };

  await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* */ } });
  await page.goto('file://' + path.resolve(HERE, '../../index.html'));
  await wait(2200);
  await shot('title');
  await audit('title');
  // the adventure picker
  await page.getByRole('button', { name: /Play an Adventure/ }).first().click();
  await wait(500);
  await shot('picker');
  await audit('picker');
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await wait(500);
  await shot('adventure');
  await page.getByRole('button', { name: 'New Game', exact: true }).first().click();
  await wait(1800);
  await shot('party');
  await audit('party');
  await page.getByRole('button', { name: /Begin the Adventure/ }).first().click();
  await wait(700);
  await shot('intro');
  await page.getByRole('button', { name: 'Begin', exact: true }).first().click();
  await wait(3500);
  await shot('world-first');
  await audit('world-first');
  // the first-time card goes away once dismissed
  await ev(() => { const b = document.querySelector('.howto .hw-ok'); if (b) b.click(); });
  await wait(4500); // let the quest banner pass
  await ev(() => { window.__app.session.log('You found 12 gold.', 'loot'); window.__app.session.log('The wolf bites Hrolf for 4.', 'bad'); window.__app.session.log('Quest updated: The Shadow over Eldmark', 'quest'); });
  await wait(300);
  await shot('world');
  await audit('world');
  // the hero pop-over
  await page.locator('.pcard').nth(1).click();
  await wait(700);
  await shot('hero-pop');
  await esc();
  // help
  await page.keyboard.press('?');
  await wait(600);
  await shot('help');
  await audit('help');
  await esc();
  // the pack
  await page.keyboard.press('i');
  await wait(800);
  await shot('pack');
  await audit('pack');
  await esc();
  // a town: shop and a conversation
  await ev(async () => {
    const s = window.__app.session;
    s.party.gold = 420;
    const t = s.game.maps.find((m) => m.name === 'Westhold');
    await s.enterMap(t.id, t.entry.x, t.entry.y, { instant: true });
  });
  await wait(2000);
  await shot('town');
  await audit('town');
  const shopName = await ev(() => {
    const s = window.__app.session;
    const shops = s.map.entities.filter((e) => e.shop?.stock?.length);
    const g = s.game;
    const npc = shops.find((e) => e.shop.stock.some((id) => ['weapon', 'armor'].includes(g.items.find((i) => i.id === id)?.type))) || shops[0];
    if (!npc) return null;
    s.ui.openShop(npc);
    return npc.name;
  });
  await wait(900);
  if (shopName) { await shot('shop'); await audit('shop'); }
  await ev(() => { const b = [...document.querySelectorAll('.shop .tabs button')].find((x) => /Sell/.test(x.textContent)); b && b.click(); });
  await wait(400);
  if (shopName) await shot('shop-sell');
  await esc(1);
  await ev(() => { const s = window.__app.session; const e = s.map.entities.find((x) => x.id === 'npc_hilda') || s.map.entities.find((x) => x.type === 'npc'); s.talkTo(e); });
  await wait(1200);
  await ev(() => { const c = [...document.querySelectorAll('.chip')].find((x) => x.textContent === 'JOB'); c && c.click(); });
  await wait(5000); // let the quest banner pass
  await shot('dialog');
  await audit('dialog');
  await esc(1);
  await ev(() => window.__app.session.ui.openMenu());
  await wait(500);
  await shot('menu');
  await esc();
  // a battle: the initiative strip against the quest tracker
  await ev(async () => {
    const s = window.__app.session;
    const m = s.game.maps.find((mm) => mm.type === 'world');
    await s.enterMap(m.id, s.game.settings.start.x, s.game.settings.start.y, { instant: true });
    s.fight([{ id: 'orc', n: 2 }, { id: 'goblin', n: 3 }, { id: 'wolf', n: 2 }], 'forest', {});
  });
  await wait(4500);
  await shot('battle');
  await audit('battle');
  // the editor
  await ev(() => { const a = window.__app; a.endPlay(false); });
  await wait(1200);
  await page.getByRole('button', { name: /Construction Set/ }).first().click();
  await wait(500);
  await shot('editor-pick');
  await page.getByRole('button', { name: /Open copy/ }).first().click();
  await wait(2500);
  await shot('editor');
  await audit('editor');
  await page.getByRole('button', { name: /World Data/ }).first().click();
  await wait(1200);
  await shot('editor-data');
  if (errors.length) problems.push(`${W}x${H} errors:\n` + errors.join('\n'));
  await page.close();
}
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no problems');
await browser.close();
