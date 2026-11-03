// The Construction Set's steps: every step renders, the Quick Start lays down
// a campaign (and Undo takes it back), Find jumps to people and places, the
// next-step button walks the steps, and the help opens for each step.
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
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);

// the Quick Start from the project picker
await page.getByRole('button', { name: /Construction Set/ }).click();
await wait(300);
await page.getByRole('button', { name: 'Begin', exact: true }).click();
await wait(800);
check('the Quick Start opens on a new realm', await ev(() => !!document.querySelector('.qs-wizard')));
await ev(() => {
  const inp = [...document.querySelectorAll('.qs-wizard .field')].find((f) => /Title/.test(f.textContent))?.querySelector('input');
  inp.value = 'Testmark'; inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.locator('.modal button.primary', { hasText: 'Build it' }).click();
await wait(1500);
let r = await ev(() => {
  const ed = window.__app.editor, g = ed.game;
  const world = g.maps.find((m) => m.type === 'world');
  const sites = world.entities.filter((e) => e.type === 'portal' && e.style === 'site');
  const st = g.settings.start;
  const near = sites.some((p) => Math.abs(p.x - st.x) + Math.abs(p.y - st.y) <= 8);
  return { title: g.meta.title, maps: g.maps.length, sites: sites.length, near, tab: ed.tab, chapters: g.story.chapters.length, quests: g.quests.length, w: world.w };
});
check('the Quick Start lays down places and a start beside one', r.title === 'Testmark' && r.sites >= 5 && r.maps === r.sites + 1 && r.near && r.tab === 'campaign', r);
await page.screenshot({ path: `${OUT}/cs-campaign.png` });

// undo the whole Quick Start, then redo it
r = await ev(() => {
  const ed = window.__app.editor;
  const before = ed.game.maps.length;
  const label = ed.undoBtn.title;
  ed.undo();
  const undone = ed.game.maps.length;
  ed.redo();
  return { before, undone, again: ed.game.maps.length, label };
});
check('Undo takes back the Quick Start, Redo brings it again', r.undone === 1 && r.again === r.before && /Quick Start/.test(r.label), r);

// every step and side tab renders
for (const tab of ['campaign', 'land', 'places', 'story', 'map', 'test', 'data', 'rules']) {
  r = await ev(async (t) => {
    const ed = window.__app.editor;
    ed.setTab(t);
    await new Promise((res) => setTimeout(res, 250));
    const on = document.querySelector('.ed-top button.on')?.dataset.tab;
    return { on, left: document.querySelector('.ed-left')?.textContent.length || 0 };
  }, tab);
  check(`the ${tab} step renders`, r.on === tab && r.left > 3, r);
}
await ev(() => window.__app.editor.setTab('land'));
await wait(400);
check('the Land step shows the world map', await ev(() => window.__app.editor.map.type === 'world'));

// the next-step button walks the steps
r = await ev(() => {
  const ed = window.__app.editor;
  ed.setTab('campaign');
  const seen = [ed.tab];
  for (let i = 0; i < 4; i++) { document.querySelector('.ed-next').click(); seen.push(ed.tab); }
  return seen;
});
check('Next walks Campaign → Land → Places → Story → Details', r.join() === 'campaign,land,places,story,map', r);

// Find on the sample: a person, then a place
await ev(() => { const a = window.__app; a.openEditor(a.sample); });
await wait(1200);
await page.keyboard.press('Control+k');
await wait(200);
await page.keyboard.type('Hilda');
await wait(200);
await page.keyboard.press('Enter');
await wait(900);
r = await ev(() => { const ed = window.__app.editor; return { tab: ed.tab, map: ed.map.name, sel: ed.selected?.name }; });
check('Find goes to a person in Details', r.tab === 'map' && r.map === 'Westhold' && /Hilda/.test(r.sel || ''), r);
await page.keyboard.press('Control+k');
await wait(200);
await page.keyboard.type('Grimholt');
await wait(200);
await page.keyboard.press('Enter');
await wait(900);
r = await ev(() => ({ tab: window.__app.editor.tab }));
check('Find goes to a place in Places', r.tab === 'places', r);

// the help opens on the step in view
await ev(() => window.__app.editor.setTab('story'));
await wait(300);
await ev(() => window.__app.editor.help());
await wait(300);
r = await ev(() => ({ on: document.querySelector('.ed-help-tabs .on')?.textContent, text: document.querySelector('.ed-help-page')?.textContent.slice(0, 40) }));
check('the help opens on the step in view', r.on === 'Story', r);
await ev(() => document.querySelector('.modal .modal-x')?.click());

check('no page errors', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'cs_shell: all passed');
process.exit(fails ? 1 : 0);
