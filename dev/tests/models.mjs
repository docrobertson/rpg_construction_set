// Line-ups and scenes for judging the character and monster art at the game
// camera (pitch 52°, figures upright).
// Usage: node tests/models.mjs [prefix] [shots] [pitch] [dpr]
//   shots: comma list of classes, monsters, side, close, battle, small,
//          portraits, create (default: all)
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
const pre = process.argv[2] || 'models';
const shots = (process.argv[3] || 'classes,monsters,side,close,battle,small,portraits,create').split(',');
const pitch = +(process.argv[4] || 52);
const dpr = +(process.argv[5] || 1); // device pixel ratio, e.g. 2 for crisp portraits
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1200);

// a few hand-picked people so the line-up shows the appearance options
const PEOPLE = [
  { face: 'bold', skin: 0xf0c4a0, hair: 0x5a3a20, hairStyle: 'short' },
  { face: 'fair', skin: 0xf6d2b4, hair: 0xd8b868, hairStyle: 'long' },
  { face: 'fair', skin: 0xc88c64, hair: 0x1e1a18, hairStyle: 'ponytail' },
  { face: 'bold', skin: 0x9c6a46, hair: 0x1e1a18, hairStyle: 'short', beard: 0x1e1a18 },
  { face: 'fair', skin: 0xe2aa84, hair: 0xb84a1e, hairStyle: 'braids' },
  { face: 'bold', skin: 0xf0c4a0, hair: 0xa8a8a8, hairStyle: 'short', beard: 0xa8a8a8 },
  { face: 'bold', skin: 0x74502f, hair: 0x3a2618, hairStyle: 'topknot' },
  { face: 'fair', skin: 0xf6d2b4, hair: 0x7a4a24, hairStyle: 'long' },
];

// figures stand upright for the new camera: no lean on anything already placed
const UPRIGHT = `(v, pitch) => {
  v.setPitch(pitch); v.lean = 0;
  for (const e of v.entities.values()) {
    if (!e.info.noLean) e.leanG.rotation.x = 0;
    for (const lg of e.model.userData.leanParts || []) lg.rotation.x = 0;
  }
}`;

async function startQuick() {
  await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1500)); });
}

// the sample company, grown to six with a paladin and a minstrel
const SIX = `(s) => {
  const ms = s.party.members;
  if (ms.length < 6) {
    const a = JSON.parse(JSON.stringify(ms[0]));
    Object.assign(a, { id: 'pal6', name: 'Aldwyn', race: 'human', cls: 'paladin', look: { face: 'bold', skin: 0xe2aa84, hair: 0xd8b868, hairStyle: 'short' } });
    a.equip = { ...a.equip, weapon: 'long_sword', shield: 'buckler', armor: 'chain_mail' };
    a.hp = 17; a.mp = 0;
    const b = JSON.parse(JSON.stringify(ms[1]));
    Object.assign(b, { id: 'min6', name: 'Liriel', race: 'elf', cls: 'minstrel', look: { face: 'fair', skin: 0xfae6d2, hair: 0xb06a30, hairStyle: 'braids' } });
    b.hp = 8; b.mp = 6;
    ms.push(a, b);
  }
}`;

let inGame = false;
for (const shot of shots) {
  if (shot === 'create') {
    inGame = false;
    await page.reload();
    await page.waitForTimeout(1200);
    await page.evaluate(async () => { const app = window.__app; app.playGame(app.sample, { noSave: true }); await new Promise((r) => setTimeout(r, 800)); });
    await page.evaluate(`(${UPRIGHT})(window.__app.view, ${pitch})`);
    await page.click('text=Random company');
    await page.waitForTimeout(1500);
    // show the appearance controls of the selected hero
    await page.evaluate(() => { const p = document.querySelector('.create-hero'); const a = [...document.querySelectorAll('.create-hero .sub')].find((e) => e.textContent.startsWith('Appearance')); if (p && a) p.scrollTop = a.offsetTop - 260; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${pre}-${shot}.png` });
    continue;
  }
  if (!inGame) { await startQuick(); inGame = true; }
  if (shot === 'battle') {
    await page.evaluate(async ([SIX, UPRIGHT, pitch]) => {
      const s = window.__app.session, v = s.view;
      eval(SIX)(s);
      const m = s.game.maps.find((mm) => mm.type === 'world');
      await s.enterMap(m.id, s.game.settings.start.x, s.game.settings.start.y, { instant: true });
      eval(UPRIGHT)(v, pitch);
      s.fight([{ id: 'orc', n: 2 }, { id: 'goblin', n: 2 }, { id: 'wolf', n: 1 }, { id: 'orc_archer', n: 1 }], 'forest', {});
      await new Promise((r) => setTimeout(r, 400));
      eval(UPRIGHT)(v, pitch);
    }, [SIX, UPRIGHT, pitch]);
    await page.waitForTimeout(3000);
    await page.evaluate(([UPRIGHT, pitch]) => eval(UPRIGHT)(window.__app.session.view, pitch), [UPRIGHT, pitch]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${pre}-${shot}.png` });
    // leave the battle behind for the next shots
    await page.evaluate(() => { const s = window.__app.session; if (s.battle) s.battle.over = true; });
    inGame = false;
    await page.evaluate(() => window.__app.showTitle && window.__app.showTitle());
    continue;
  }
  if (shot === 'portraits') {
    await page.evaluate(async ([SIX]) => {
      const s = window.__app.session;
      eval(SIX)(s);
      const m = s.game.maps.find((mm) => mm.name === 'Westhold');
      await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
      s.ui?.refresh?.();
    }, [SIX]);
    await page.waitForTimeout(1200);
    const box = await page.evaluate(() => { const r = document.querySelector('.pcard')?.parentElement?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.screenshot({ path: `${OUT}/${pre}-${shot}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 30), width: Math.min(1280 - box.x + 6, box.width + 12), height: Math.min(800 - box.y + 30, box.height + 40) } } : {}) });
    continue;
  }
  await page.evaluate(async ([shot, pitch, PEOPLE, UPRIGHT]) => {
    const s = window.__app.session, v = s.view, g = s.game;
    const m = g.maps.find((mm) => mm.name === 'Westhold');
    await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
    s.game.settings.lineOfSight = false; s.updateVisibility(true);
    eval(UPRIGHT)(v, pitch);
    const p = s.state.pos;
    const hero = (race, cls, i) => {
      const who = PEOPLE[i % PEOPLE.length];
      const l = { kind: 'humanoid', ...(race.look || {}), ...cls.look, ...who, race: race.look.race };
      if (race.look.race === 'dwarf') { delete l.beard; if (who.hairStyle === 'long') l.hairStyle = 'braids'; if (who.face === 'fair' && i % 2) l.beard = false; }
      if (race.look.race === 'elf') { delete l.beard; l.hair = [0xeedc98, 0xe2e2ea, 0x1e1a18, 0xb06a30][i % 4]; }
      return l;
    };
    const place = (list) => list.forEach(([l, x, y, o], i) => v.addEntity('m' + i, l, p.x + x, p.y + y, o || {}));
    if (shot !== 'small') v.clearEntities();
    if (shot === 'classes') {
      const n = g.classes.length;
      place(g.races.flatMap((r, ri) => g.classes.map((k, ci) => [hero(r, k, ci + ri * 3), ci - Math.floor(n / 2), -5 + ri * 2])));
      v.rig.minDist = 1; v.setZoom(11, true); v.focus(p.x - 0.5, p.y - 3.3, true);
    } else if (shot === 'monsters') {
      const M = Object.fromEntries(g.monsters.map((mm) => [mm.id, mm.look]));
      place([
        [M.dragon, -4, -8], [M.shadow_lord, -1, -8], [M.drake, 2, -8], [M.sea_serpent, 4, -8],
        [M.troll, -4, -5], [M.orc_captain, -3, -5], [M.orc, -2, -5], [M.orc_archer, -1, -5], [M.dark_sorcerer, 0, -5], [M.barrow_wight, 1, -5], [M.skeleton, 2, -5], [M.bandit, 3, -5], [M.goblin, 4, -5],
        [M.giant_spider, -3, -3], [M.warg, -2, -3], [M.wolf, -1, -3], [M.bog_lurker, 0, -3], [M.bat_swarm, 1, -3], [M.giant_rat, 2, -3],
      ]);
      v.rig.minDist = 1; v.setZoom(12.5, true); v.focus(p.x - 0.5, p.y - 5.1, true);
    } else if (shot === 'side') {
      place(g.classes.map((k, i) => [hero(g.races[i % 3], k, i), (i % 4) * 1.0 - 2, -4 + Math.floor(i / 4) * 2, { facing: [1, 0] }]));
      v.rig.minDist = 1; v.setZoom(7, true); v.focus(p.x - 0.5, p.y - 3.1, true);
    } else if (shot === 'close') {
      place([[hero(g.races[0], g.classes[0], 0), -2, -3], [hero(g.races[2], g.classes[1], 1), -1, -3], [hero(g.races[1], g.classes[7], 5), 0, -3], [hero(g.races[0], g.classes[2], 2), 1, -3]]);
      v.rig.minDist = 1; v.setZoom(4.4, true); v.focus(p.x - 0.5, p.y - 3.35, true);
    } else if (shot === 'small') {
      // a busy town square: the company, townsfolk and a goblin raid
      const L = g.monsters.find((mm) => mm.id === 'goblin').look, O = g.monsters.find((mm) => mm.id === 'orc').look, W = g.monsters.find((mm) => mm.id === 'wolf').look;
      place([
        [hero(g.races[0], g.classes[0], 0), -1, -2], [hero(g.races[2], g.classes[1], 1), 1, -2], [hero(g.races[0], g.classes[2], 2), -2, -1], [hero(g.races[1], g.classes[3], 3), 2, -1],
        [hero(g.races[0], g.classes[5], 6), 0, -1], [hero(g.races[2], g.classes[6], 7), -4, -1], [hero(g.races[1], g.classes[7], 5), 3, -2], [hero(g.races[0], g.classes[4], 4), -3, -2],
        [L, -2, -6], [L, 0, -6], [O, -1, -7], [O, 1, -7], [W, 2, -6], [L, 3, -7],
      ]);
      v.rig.minDist = 1; v.setZoom(21, true); v.focus(p.x, p.y - 3.5, true);
    }
  }, [shot, pitch, PEOPLE, UPRIGHT]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${pre}-${shot}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
