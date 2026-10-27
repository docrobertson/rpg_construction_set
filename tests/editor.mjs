// Editor functional test: tools, inspector, data, playtest, export/import.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = 'tests/out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const log = (x) => console.log(JSON.stringify(x));
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch {} });
await page.goto('file://' + path.resolve('index.html'));
await wait(1200);

// new generated realm
await page.getByRole('button', { name: /Construction Set/ }).click();
await wait(300);
await page.getByRole('button', { name: 'Create', exact: true }).first().click();
await wait(1500);
await shot('40-new-realm');
const canvas = page.locator('#viewport canvas');
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
// tile under screen centre
const centre = await ev(({ x, y }) => window.__app.view.pick(x, y), { x: cx, y: cy });
log({ centre });
// stamp mountains, forest, island
for (const [tool, dx, dy] of [['stamp_mountains', -120, -80], ['stamp_forest', 100, 60], ['stamp_lake', 0, 120]]) {
  await ev((t) => window.__app.editor.setTool(t), tool);
  await page.mouse.click(cx + dx, cy + dy);
  await wait(300);
}
// draw a road path by dragging
await ev(() => window.__app.editor.setTool('path_road'));
await page.mouse.move(cx - 200, cy);
await page.mouse.down();
for (let i = 0; i <= 10; i++) { await page.mouse.move(cx - 200 + i * 40, cy + Math.sin(i / 2) * 30); await wait(30); }
await page.mouse.up();
await wait(400);
// brush paint
await ev(() => { const ed = window.__app.editor; ed.setPaintTile(19 /* village */); });
await ev(() => { const ed = window.__app.editor; ed.setPaintTile(5); ed.setTool('brush'); ed.brush = 3; });
await page.mouse.move(cx + 150, cy - 100);
await page.mouse.down();
await page.mouse.move(cx + 220, cy - 120, { steps: 6 });
await page.mouse.up();
await wait(300);
await shot('41-sculpted');
// found a town (prompt)
await ev(() => window.__app.editor.setTool('site_town'));
await page.mouse.click(cx + 30, cy - 30);
await wait(400);
await page.keyboard.press('Control+A');
await page.keyboard.type('Testford');
await page.keyboard.press('Enter');
await wait(1200);
const town = await ev(() => { const ed = window.__app.editor; const m = ed.game.maps.find((x) => x.name === 'Testford'); return m ? { id: m.id, n: m.entities.length, w: m.w } : null; });
log({ town });
await shot('42-town-founded');
// undo/redo
const undoInfo = await ev(() => { const ed = window.__app.editor; const before = ed.undoStack.length; ed.undo(); const mid = ed.undoStack.length; ed.redo(); return { before, mid, after: ed.undoStack.length }; });
log({ undoInfo });
// open the town map, place an NPC, edit it
await ev((id) => window.__app.editor.loadMapById(id), town.id);
await wait(800);
await ev(() => window.__app.editor.setTool('npc'));
const tc = await ev(() => { const ed = window.__app.editor; return { x: ed.map.entry.x, y: ed.map.entry.y - 3 }; });
await ev(({ x, y }) => { const ed = window.__app.editor; ed.view.focus(x, y, true); }, tc);
await wait(500);
await page.mouse.click(cx, cy);
await wait(500);
const sel = await ev(() => { const ed = window.__app.editor; return ed.selected ? { type: ed.selected.type, name: ed.selected.name } : null; });
log({ sel });
// fill name field & add keyword via inspector
const nameInput = page.locator('.ed-right .field input[type=text]').first();
await nameInput.fill('Old Tom');
await page.getByRole('button', { name: '+ Add keyword' }).click();
await wait(200);
await page.locator('.sl-row input[type=text]').first().fill('TREASURE');
await page.locator('.sl-row textarea').first().fill('It lies beneath the old oak.');
await wait(300);
await shot('43-npc-inspector');
const npcData = await ev(() => { const s = window.__app.editor.selected; return { name: s.name, kw: s.keywords }; });
log({ npcData });
// room stamp: shop
await ev(() => window.__app.editor.setTool('room_inn'));
await page.mouse.click(cx + 200, cy - 150);
await wait(500);
await shot('44-room');
// data tab: add a monster
await page.getByRole('button', { name: /World Data/ }).click();
await wait(400);
await page.getByRole('button', { name: /Monsters/ }).click();
await wait(300);
await page.getByRole('button', { name: '+ New' }).click();
await wait(500);
await shot('45-new-monster');
// settings: disable song magic
await page.getByRole('button', { name: /Settings/ }).click();
await wait(400);
await ev(() => { const g = window.__app.editor.game; const song = g.magic.find((m) => m.id === 'song'); song.enabled = false; window.__app.editor.markDirty(); });
await shot('46-settings');
await page.getByRole('button', { name: /🗺 Map/ }).click();
await wait(500);
// playtest quick from start
await ev(() => window.__app.editor.playtest(true, null));
await wait(2500);
const pt = await ev(() => { const s = window.__app.session; return { map: s.map.name, party: s.party.members.map((m) => m.cls), noSave: s.opts.noSave }; });
log({ pt });
await shot('47-playtest');
await ev(() => window.__app.endPlay(true));
await wait(1200);
await shot('48-back-in-editor');
const back = await ev(() => ({ tab: window.__app.editor.tab, hidden: window.__app.editor.hidden, map: window.__app.editor.map.name }));
log({ back });
// export json
const [dl] = await Promise.all([page.waitForEvent('download'), ev(() => { const { serializeGame } = {}; const ed = window.__app.editor; ed.fileMenu(); })
  .then(() => page.getByRole('button', { name: /Export game file/ }).click())]);
const jsonPath = `${OUT}/exported.json`;
await dl.saveAs(jsonPath);
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
log({ exported: json.meta.title, maps: json.maps.length, monsters: json.monsters.length, size: fs.statSync(jsonPath).size });
// export standalone html
await ev(() => window.__app.editor.fileMenu());
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export playable web page/ }).click()]);
const htmlPath = path.resolve(`${OUT}/standalone.html`);
await dl2.saveAs(htmlPath);
log({ standaloneKB: Math.round(fs.statSync(htmlPath).size / 1024) });
const page2 = await ctx.newPage();
page2.on('pageerror', (e) => errors.push('standalone pageerror: ' + e.message));
await page2.goto('file://' + htmlPath);
await page2.waitForTimeout(1500);
await page2.screenshot({ path: `${OUT}/49-standalone.png` });
const emb = await page2.evaluate(() => window.__app.embedded && window.__app.embedded.meta.title);
log({ embeddedTitle: emb });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
