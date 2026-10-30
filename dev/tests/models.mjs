// Line-ups and scenes for judging the character and monster art at the real
// game camera (pitch 52°, figures upright).
// Usage: node tests/models.mjs [prefix] [shots] [outDir]
//   shots: comma list of classes, close, faces, monsters, beasts, side, back,
//          small, battle, portraits, portraits2, folk, pois, poiclose, worldpoi,
//          create (default: classes,monsters,small,battle,portraits,folk,pois)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const pre = process.argv[2] || 'models';
const shots = (process.argv[3] || 'classes,monsters,small,battle,portraits,folk,pois').split(',');
const OUT = process.argv[4] || path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const PITCH = 52;
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: +(process.env.DSF || 1) });
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForTimeout(1200);
// quest tracker and banners would cover the line-ups
await page.addStyleTag({ content: '.qtrack,.qbanner-host{display:none!important}' });
const file = (shot) => (shot.includes('/') ? shot : `${OUT}/${pre}-${shot}.png`);

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
    await page.click('text=Random company');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const p = document.querySelector('.create-hero'); const a = [...document.querySelectorAll('.create-hero .sub')].find((e) => e.textContent.startsWith('Appearance')); if (p && a) p.scrollTop = a.offsetTop - 260; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: file(shot) });
    continue;
  }
  if (!inGame) { await startQuick(); await page.addStyleTag({ content: '.qtrack,.qbanner-host{display:none!important}' }); inGame = true; }
  if (shot === 'battle') {
    await page.evaluate(async ([SIX, PITCH]) => {
      const s = window.__app.session, v = s.view;
      eval(SIX)(s);
      const m = s.game.maps.find((mm) => mm.type === 'world');
      await s.enterMap(m.id, s.game.settings.start.x, s.game.settings.start.y, { instant: true });
      v.setPitch(PITCH);
      s.fight([{ id: 'orc', n: 1 }, { id: 'orc_archer', n: 1 }, { id: 'orc_captain', n: 1 }, { id: 'goblin', n: 2 }, { id: 'wolf', n: 1 }], 'forest', {});
    }, [SIX, PITCH]);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: file(shot) });
    // and a closer look at the company from the battle camera
    await page.evaluate(() => { const s = window.__app.session, v = s.view; const u = s.battle.units.find((x) => x.side === 'party'); v.rig.minDist = 1; v.setZoom(7, true); v.focus(u.x + 1, u.y - 1.5, true); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: file(shot + '-close') });
    await page.evaluate(() => { const s = window.__app.session; if (s.battle) s.battle.over = true; });
    inGame = false;
    await page.evaluate(() => window.__app.showTitle && window.__app.showTitle());
    continue;
  }
  if (shot === 'portraits' || shot === 'portraits2') {
    await page.evaluate(async ([SIX, shot, PEOPLE]) => {
      const s = window.__app.session, g = s.game;
      eval(SIX)(s);
      if (shot === 'portraits2') {
        // the classes the first page leaves out, in other races and faces
        const pick = [['dwarf', 'paladin', 3], ['elf', 'wizard', 1], ['human', 'burglar', 0], ['dwarf', 'cleric', 4], ['human', 'runesmith', 5], ['elf', 'warrior', 7]];
        s.party.members.forEach((m, i) => { const [r, c, p] = pick[i]; m.race = r; m.cls = c; m.look = { ...PEOPLE[p] }; if (r !== 'human') delete m.look.beard; });
      }
      const m = g.maps.find((mm) => mm.name === 'Westhold');
      await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
      s.ui?.refresh?.();
    }, [SIX, shot, PEOPLE]);
    await page.waitForTimeout(1500);
    const box = await page.evaluate(() => { const r = document.querySelector('.pcard')?.parentElement?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await page.screenshot({ path: file(shot), ...(box ? { clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 30), width: Math.min(1280 - box.x + 6, box.width + 12), height: Math.min(800 - box.y + 30, box.height + 40) } } : {}) });
    continue;
  }
  if (shot === 'worldpoi') {
    // real points of interest on the world map, from the game camera
    await page.evaluate(async (PITCH) => {
      const s = window.__app.session, v = s.view;
      const m = s.game.maps.find((mm) => mm.type === 'world');
      const well = m.entities.find((e) => e.kind === 'well') || m.entities.find((e) => e.type === 'event');
      await s.enterMap(m.id, well.x, well.y + 2, { instant: true });
      s.game.settings.lineOfSight = false; s.updateVisibility(true);
      v.setPitch(PITCH); v.rig.minDist = 1; v.setZoom(9.5, true); v.focus(well.x, well.y, true);
    }, PITCH);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: file(shot) });
    continue;
  }
  await page.evaluate(async ([shot, PITCH, PEOPLE]) => {
    const s = window.__app.session, v = s.view, g = s.game;
    // folk and points of interest stand in open country, the rest in town
    const open = ['folk', 'pois', 'poiclose'].includes(shot);
    const m = open ? g.maps.find((mm) => mm.type === 'world') : g.maps.find((mm) => mm.name === 'Westhold');
    if (open) {
      // a clear stretch of grass on the world map
      // (the grass the travellers' camp west of Westhold stands on)
      const camp = m.entities.find((e) => e.id === 'ev_camp_west') || { x: s.game.settings.start.x, y: s.game.settings.start.y };
      const grass = m.tiles[camp.y * m.w + camp.x];
      let best = null, bd = Infinity;
      for (let y = 12; y < m.h - 4; y++) for (let x = 8; x < m.w - 8; x++) {
        const d = Math.abs(x - camp.x) + Math.abs(y - camp.y);
        if (d >= bd) continue;
        let good = true;
        for (let dy = -11; dy <= 1 && good; dy++) for (let dx = -6; dx <= 6 && good; dx++) if (m.tiles[(y + dy) * m.w + x + dx] !== grass) good = false;
        if (good && !m.entities.some((e) => Math.abs(e.x - x) < 7 && e.y > y - 9 && e.y < y + 2)) { best = { x, y }; bd = d; }
      }
      best ||= camp;
      await s.enterMap(m.id, best.x, best.y, { instant: true });
    } else await s.enterMap(m.id, m.entry.x, m.entry.y, { instant: true });
    s.game.settings.lineOfSight = false; s.updateVisibility(true);
    v.setPitch(PITCH);
    const p = s.state.pos;
    const hero = (race, cls, i) => {
      const who = PEOPLE[i % PEOPLE.length];
      const l = { kind: 'humanoid', ...(race.look || {}), ...cls.look, ...who, race: race.look.race };
      if (race.look.race === 'dwarf') { delete l.beard; if (who.hairStyle === 'long') l.hairStyle = 'braids'; if (who.face === 'fair' && i % 2) l.beard = false; }
      if (race.look.race === 'elf') { delete l.beard; l.hair = [0xeedc98, 0xe2e2ea, 0x1e1a18, 0xb06a30][i % 4]; }
      return l;
    };
    const place = (list) => list.forEach(([l, x, y, o], i) => v.addEntity('m' + i, l, p.x + x, p.y + y, o || {}));
    v.clearEntities();
    const M = Object.fromEntries(g.monsters.map((mm) => [mm.id, mm.look]));
    const C = Object.fromEntries(g.classes.map((k) => [k.id, k]));
    const R = Object.fromEntries(g.races.map((r) => [r.id, r]));
    v.rig.minDist = 1;
    if (shot === 'classes') {
      const n = g.classes.length;
      place(g.races.flatMap((r, ri) => g.classes.map((k, ci) => [hero(r, k, ci + ri * 3), ci - Math.floor(n / 2), -5 + ri * 2])));
      v.setZoom(11, true); v.focus(p.x - 0.5, p.y - 3.3, true);
    } else if (shot === 'back') {
      const n = g.classes.length;
      place(g.races.flatMap((r, ri) => g.classes.map((k, ci) => [hero(r, k, ci + ri * 3), ci - Math.floor(n / 2), -5 + ri * 2, { facing: [0, -1] }])));
      v.setZoom(11, true); v.focus(p.x - 0.5, p.y - 3.3, true);
    } else if (shot === 'faces') {
      // the headgear that must frame a face: hoods, brims, helms, at play zoom
      const list = [['human', 'wizard', 5], ['elf', 'ranger', 1], ['elf', 'burglar', 2], ['dwarf', 'warrior', 0], ['human', 'paladin', 3], ['dwarf', 'runesmith', 5], ['elf', 'paladin', 7], ['dwarf', 'cleric', 3], ['human', 'warrior', 6], ['elf', 'minstrel', 4]];
      place(list.map(([r, c, i], k) => [hero(R[r], C[c], i), (k % 5) - 2, -4 + Math.floor(k / 5) * 1.5]));
      v.setZoom(6.5, true); v.focus(p.x - 0.5, p.y - 3.4, true);
    } else if (shot === 'monsters') {
      place([
        [M.dragon, -4, -8], [M.shadow_lord, -2, -8], [M.sea_serpent, 0, -8], [M.drake, 2, -8],
        [M.troll, -4, -5], [M.orc_captain, -3, -5], [M.orc, -2, -5], [M.orc_archer, -1, -5], [M.dark_sorcerer, 0, -5], [M.barrow_wight, 1, -5], [M.skeleton, 2, -5], [M.bandit, 3, -5], [M.goblin, 4, -5],
        [M.giant_spider, -3, -3], [M.warg, -2, -3], [M.wolf, -1, -3], [M.bog_lurker, 0, -3], [M.bat_swarm, 1, -3], [M.giant_rat, 2, -3], [M.goblin_shaman, 3, -3],
      ]);
      v.setZoom(12.5, true); v.focus(p.x - 0.5, p.y - 5.1, true);
    } else if (shot === 'beasts') {
      place([[M.wolf, -2, -4], [M.warg, -0.5, -4], [M.giant_rat, 1, -4], [M.giant_spider, 2.5, -4], [M.sea_serpent, -1.5, -2], [M.goblin, 0.5, -2.5], [M.skeleton, 1.5, -2.5], [M.orc, 2.5, -2.5]]);
      v.setZoom(6.5, true); v.focus(p.x, p.y - 3.4, true);
    } else if (shot === 'side') {
      place(g.classes.map((k, i) => [hero(g.races[i % 3], k, i), (i % 4) * 1.0 - 2, -4 + Math.floor(i / 4) * 2, { facing: [1, 0] }]));
      v.setZoom(7, true); v.focus(p.x - 0.5, p.y - 3.1, true);
    } else if (shot === 'close') {
      place([[hero(R.human, C.warrior, 0), -2, -3], [hero(R.elf, C.ranger, 1), -1, -3], [hero(R.dwarf, C.runesmith, 5), 0, -3], [hero(R.human, C.wizard, 2), 1, -3], [hero(R.human, C.cleric, 4), 2, -3]]);
      v.setZoom(4.6, true); v.focus(p.x - 0.0, p.y - 3.35, true);
    } else if (shot === 'close2') {
      place([[hero(R.human, C.burglar, 2), -2, -3], [hero(R.dwarf, C.cleric, 3), -1, -3], [hero(R.human, C.paladin, 0), 0, -3], [hero(R.elf, C.minstrel, 4), 1, -3], [hero(R.dwarf, C.warrior, 5), 2, -3]]);
      v.setZoom(4.6, true); v.focus(p.x - 0.0, p.y - 3.35, true);
    } else if (shot === 'small') {
      // a busy town square: the company, townsfolk and a goblin raid
      place([
        [hero(R.human, C.warrior, 0), -1, -2], [hero(R.elf, C.ranger, 1), 1, -2], [hero(R.human, C.wizard, 2), -2, -1], [hero(R.dwarf, C.cleric, 3), 2, -1],
        [hero(R.human, C.paladin, 6), 0, -1], [hero(R.elf, C.minstrel, 7), -4, -1], [hero(R.dwarf, C.runesmith, 5), 3, -2], [hero(R.human, C.burglar, 4), -3, -2],
        [M.goblin, -2, -6], [M.goblin, 0, -6], [M.orc, -1, -7], [M.orc_archer, 1, -7], [M.wolf, 2, -6], [M.warg, 3, -7], [M.skeleton, -3, -6], [M.giant_rat, 4, -6],
      ]);
      v.setZoom(21, true); v.focus(p.x, p.y - 3.5, true);
    } else if (shot === 'folk') {
      // everyone who lives in the sample's towns
      // a few from every town: no more than one guard each
      const folk = [];
      for (const mm of g.maps) {
        let guards = 0, n = 0;
        for (const e of mm.entities || []) {
          if (e.type !== 'npc' || !e.look || n >= 7) continue;
          if (e.role === 'guard' && guards++) continue;
          folk.push(e.look); n++;
        }
      }
      const cols = 10;
      place(folk.slice(0, 30).map((l, i) => [l, (i % cols) - 5, -5 + Math.floor(i / cols) * 1.8]));
      v.setZoom(11, true); v.focus(p.x - 0.5, p.y - 2.9, true);
    } else if (shot === 'pois' || shot === 'poiclose') {
      place([
        [{ kind: 'shrine', glow: 0xffd870 }, -3, -4], [{ kind: 'shrine', glow: 0x90c0ff }, -1.5, -4], [{ kind: 'shrine', glow: 0x80ffb0 }, 0, -4], [{ kind: 'shrine', glow: 0xffb040 }, 1.5, -4],
        [{ kind: 'lorestone' }, 3, -4],
        [{ kind: 'well' }, -3, -2], [{ kind: 'chest', color: 0x6a5a3a }, -1.5, -2], [{ kind: 'chest', color: 0x7a3a22 }, -0.5, -2], [{ kind: 'campfire' }, 1, -2], [{ kind: 'sign' }, 2.5, -2], [{ kind: 'waygate' }, 3.5, -2.5],
      ]);
      if (shot === 'pois') { v.setZoom(8.5, true); v.focus(p.x + 0.2, p.y - 3.2, true); } else { v.setZoom(5.5, true); v.focus(p.x, p.y - 3.3, true); }
    }
  }, [shot, PITCH, PEOPLE]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file(shot) });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
