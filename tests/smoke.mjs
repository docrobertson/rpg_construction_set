// Smoke test: drives the built index.html through title → party creation →
// exploring → battle → editor, capturing screenshots and console errors.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const OUT = 'tests/out';
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] || 'all';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);
const click = async (text) => { await page.getByRole('button', typeof text === 'string' ? { name: text, exact: true } : { name: text }).first().click(); await wait(300); };
const key = async (k, n = 1, delay = 260) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(delay); } };

await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch {} });
await page.goto('file://' + path.resolve('index.html'));
await wait(1500);
await shot('01-title');

if (only === 'all' || only === 'play') {
  await click(/Play an Adventure/);
  await shot('02-adventures');
  await click('Play');
  await wait(300);
  await click('New Game');
  await wait(800);
  await shot('03-create');
  await click(/Begin the Adventure/);
  await wait(500);
  await shot('04-intro');
  await click('Begin');
  await wait(1500);
  await shot('05-world');
  // walk west into Westhold
  await key('ArrowLeft', 3, 350);
  await wait(1200);
  await shot('06-town');
  const st = await page.evaluate(() => { const s = window.__app.session; return { map: s.map.name, pos: s.state.pos, mode: s.mode }; });
  console.log('state', JSON.stringify(st));
  // talk to someone: find nearest npc and path to it
  const npc = await page.evaluate(() => {
    const s = window.__app.session;
    const p = s.state.pos;
    const n = s.map.entities.filter((e) => e.type === 'npc').sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0];
    s.talkTo(n);
    return n.name;
  });
  await wait(500);
  await page.keyboard.type('job');
  await page.keyboard.press('Enter');
  await wait(400);
  await shot('07-talk-' + npc.replace(/\W/g, ''));
  await page.keyboard.press('Escape');
  await wait(300);
  // fight: start a battle programmatically with orcs
  await page.evaluate(() => { const s = window.__app.session; s.engage({ id: 'test', monster: 'orc', count: '3', roaming: true }); });
  await wait(2000);
  await shot('08-battle');
  // a few combat moves
  for (let i = 0; i < 6; i++) {
    const info = await page.evaluate(() => { const b = window.__app.session.battle; return b && b.active ? { name: b.active.name } : null; });
    if (!info) { await wait(600); continue; }
    await key('ArrowUp', 1, 500);
  }
  await wait(800);
  await shot('09-battle2');
  // auto-resolve the battle
  await page.evaluate(async () => {
    const s = window.__app.session;
    for (let i = 0; i < 200 && s.battle; i++) {
      const b = s.battle;
      if (b.active && !b.acting) {
        const u = b.active;
        const t = b.attackTargets(u)[0];
        if (t) b.actAttack(t);
        else {
          const foe = b.enemies.find((e) => b.alive(e));
          if (!foe) break;
          const dx = Math.sign(foe.x - u.x), dy = Math.sign(foe.y - u.y);
          if (dy && b.walkable(u.x, u.y + dy, u)) b.actMove(0, dy);
          else if (dx && b.walkable(u.x + dx, u.y, u)) b.actMove(dx, 0);
          else b.actPass();
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  await wait(2500);
  await shot('10-after-battle');
  const st2 = await page.evaluate(() => { const s = window.__app.session; return { mode: s.mode, gold: s.party.gold, xp: s.party.members.map((m) => m.xp + '/' + m.hp) }; });
  console.log('after battle', JSON.stringify(st2));
  // open party screen
  await page.keyboard.press('i');
  await wait(400);
  await shot('11-party');
  await page.keyboard.press('Escape');
  await wait(200);
  await page.keyboard.press('m');
  await wait(400);
  await shot('12-map');
  await page.keyboard.press('Escape');
}

if (only === 'all' || only === 'edit') {
  await page.evaluate(() => window.__app.showTitle());
  await wait(500);
  await click(/Construction Set/);
  await click(/Open copy/);
  await wait(1500);
  await shot('20-editor');
  // stamp an island in the ocean
  await page.evaluate(() => { const ed = window.__app.editor; ed.setTool('stamp_island'); });
  const box = await page.locator('#viewport canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await wait(800);
  await shot('21-editor-stamp');
  await click(/World Data/);
  await wait(600);
  await shot('22-editor-data');
  await page.getByRole('button', { name: /Monsters/ }).first().click();
  await wait(600);
  await shot('23-editor-monsters');
  await click(/Settings/);
  await wait(500);
  await shot('24-editor-settings');
  await click(/🗺 Map/);
  await wait(500);
  // open a town
  await page.evaluate(() => { const ed = window.__app.editor; ed.loadMap(ed.game.maps.find((m) => m.name === 'Westhold')); });
  await wait(1000);
  await shot('25-editor-town');
  // select an npc
  await page.evaluate(() => { const ed = window.__app.editor; ed.select(ed.map.entities.find((e) => e.type === 'npc' && e.keywords && e.keywords.length)); });
  await wait(400);
  await shot('26-editor-npc');
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
