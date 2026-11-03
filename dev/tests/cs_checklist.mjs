// The Test step: the checklist (game/checklist.js), its page (ui/editor/
// checklist.js), playtests from the start, a chapter or a place, the
// designer's tools in play (ui/testTools.js) and the coverage playtests record.
//
//   node --require ./tests/fast.cjs tests/cs_checklist.mjs
// Prints ok/FAIL per check, screenshots to tests/out/, exit code 1 on failure.
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
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const until = (fn, a, ms = 20000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
// the editor's findings, recomputed: [{ id, area, level, text, ignored }]
const findings = () => ev(() => { const ed = window.__app.editor; ed.refreshBadges(); return ed.allFindings.map(({ id, area, level, text, go, ignored }) => ({ id, area, level, text, go, ignored: !!ignored })); });
const open = (list) => list.filter((f) => f.level !== 'ok' && !f.ignored);
const inPlay = () => until(() => window.__app.session?.mode === 'explore' && !window.__app.session.transitioning && !!window.__app.session.map);
const closeModals = () => ev(() => { for (let i = 0; i < 5; i++) document.querySelector('.modal-back .modal-buttons button.primary, .modal-back .modal-x')?.click(); });

try {
  // ------------------------------------------------------------ a new realm
  await ev(() => window.__app.newProject(false));
  await until(() => !!window.__app.editor);
  let f = await findings();
  const newTodos = open(f).filter((x) => x.level === 'todo').map((x) => x.id);
  check('a new realm has several todos', newTodos.length >= 4 && ['title', 'intro', 'win', 'noplaces', 'test-never'].every((id) => newTodos.includes(id)), newTodos);
  check('a new realm has nothing broken', !open(f).some((x) => x.level === 'error'), open(f).filter((x) => x.level === 'error'));
  check('every finding says where to fix it', f.every((x) => x.go && x.go.tab && x.text), f.filter((x) => !x.go));
  // a signpost and a chest as placed, a dragon by the start, the start in the sea
  const placed = await ev(() => {
    const ed = window.__app.editor, g = ed.game, w = g.maps[0], s = g.settings.start;
    const big = [...g.monsters].filter((m) => !m.boss).sort((a, b) => (b.level || 1) - (a.level || 1))[0];
    w.entities.push({ id: 'sign_t', type: 'sign', x: s.x + 1, y: s.y, text: 'Here lies the road to adventure.' },
      { id: 'chest_t', type: 'chest', x: s.x - 1, y: s.y, gold: '', items: [] },
      { id: 'mon_t', type: 'monster', x: s.x, y: s.y + 3, monster: big.id, count: '1' });
    let sea = null;
    for (let i = 0; i < w.tiles.length && !sea; i++) if (w.tiles[i] === 0) sea = { x: i % w.w, y: Math.floor(i / w.w) };
    const was = { ...s };
    g.settings.start = { map: w.id, ...sea };
    ed.refreshBadges();
    const startErr = ed.allFindings.find((x) => x.id === 'start')?.level;
    g.settings.start = was;
    return { big: big.name, startErr };
  });
  f = await findings();
  check('a signpost that still says what every new one says is a todo', f.find((x) => x.id === 'sign:sign_t')?.level === 'todo', f.filter((x) => x.area === 'map'));
  check('a chest with nothing in it is a todo', f.find((x) => x.id === 'chest:chest_t')?.level === 'todo', f.filter((x) => x.area === 'map'));
  check('a fearsome monster by the start is a warning', f.find((x) => x.id === 'danger:mon_t')?.level === 'warn', { placed, map: f.filter((x) => x.area === 'map') });
  check('a start in the sea is an error', placed.startErr === 'error', placed);

  // ------------------------------------------------------------ the sample
  await ev(() => { const app = window.__app; app.showTitle(); app.pickProject(); });
  await page.getByRole('button', { name: 'Open copy' }).click();
  await until(() => window.__app.editor?.game.meta.title.includes('remix'));
  const t = await ev(() => { const ed = window.__app.editor; const t0 = performance.now(); for (let i = 0; i < 5; i++) ed.refreshBadges(); return (performance.now() - t0) / 5; });
  check('the checklist takes milliseconds on the sample', t < 100, { ms: t });
  f = await findings();
  const sampleOpen = open(f);
  console.log('   sample:', sampleOpen.map((x) => `${x.level} ${x.id}`).join(', '));
  check('the sample has nothing broken', !sampleOpen.some((x) => x.level === 'error'), sampleOpen.filter((x) => x.level === 'error'));
  check('the sample is nearly clean', sampleOpen.filter((x) => x.level === 'warn').length <= 1 && sampleOpen.length <= 8, sampleOpen.map((x) => x.id));
  check('the sample shows what is done', f.filter((x) => x.level === 'ok').length >= 6 && f.some((x) => x.id === 'ok-reach') && f.some((x) => x.id === 'ok-items'), f.filter((x) => x.level === 'ok').map((x) => x.id));
  const badge = await ev(() => +(document.querySelector('.ed-step[data-tab=test] .step-badge').textContent || 0));
  check('the Test badge counts every open finding', badge === sampleOpen.length, { badge, open: sampleOpen.length });

  // ------------------------------------------------------------ breaking things
  // the only source of the Rune-Key goes
  const key = await ev(() => {
    const g = window.__app.editor.game;
    for (const m of g.maps) for (const e of m.entities) if (e.type === 'chest' && (e.items || []).some((i) => i.id === 'rune_key')) {
      const was = JSON.stringify(e.items);
      e.items = e.items.filter((i) => i.id !== 'rune_key');
      return { map: m.id, id: e.id, was };
    }
    return null;
  });
  f = await findings();
  const keyErr = f.find((x) => x.id === 'nosrc:rune_key');
  check('no source for a needed key is an error', keyErr?.level === 'error' && /Rune-Key/.test(keyErr.text), keyErr || key);
  // an island in a lake, with a cave on it
  const isle = await ev(() => {
    const ed = window.__app.editor, g = ed.game;
    const w = g.maps.find((m) => m.type === 'world');
    const dry = (x, y) => { const t = w.tiles[y * w.w + x]; return [2, 3, 4, 6, 13].includes(t) && !w.entities.some((e) => e.x === x && e.y === y); };
    for (let y = 8; y < w.h - 8; y++) for (let x = 8; x < w.w - 8; x++) {
      let ok = true;
      for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) if (!dry(x + dx, y + dy)) ok = false;
      if (!ok) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.tiles[(y + dy) * w.w + x + dx] = Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? 2 : 1;
      return { x, y, world: w.id };
    }
    return null;
  });
  await ev(() => window.__app.editor.setTab('land'));
  await wait(300);
  await ev((p) => { const ed = window.__app.editor; ed.view.focus(p.x, p.y, true); ed.tools.site_cave.down(ed, { x: p.x, y: p.y }); }, isle);
  await page.locator('.modal input').fill('Isle Cave');
  await page.keyboard.press('Enter');
  await until(() => window.__app.editor.game.maps.some((m) => m.name === 'Isle Cave'));
  f = await findings();
  const isleId = await ev(() => window.__app.editor.game.maps.find((m) => m.name === 'Isle Cave')?.id);
  const isleWarn = f.find((x) => x.id === `unreach:${isleId}`);
  check('a site on an island in a lake cannot be reached', isleWarn?.level === 'warn' && isleWarn.area === 'land', isleWarn || { isle, isleId });
  // a town's people leave
  const town = await ev(() => {
    const g = window.__app.editor.game;
    const m = g.maps.find((x) => x.name === 'Brookend');
    const was = m.entities;
    m.entities = m.entities.filter((e) => e.type !== 'npc');
    window.__brookend = was;
    return { id: m.id, gone: was.length - m.entities.length };
  });
  f = await findings();
  const empty = f.find((x) => x.id === `empty:${town.id}`);
  check('a town with nobody in it is a warning', empty?.level === 'warn' && empty.area === 'places', empty || town);
  check('quests whose people are gone are flagged', f.some((x) => /^qp:q_brookend:/.test(x.id) && x.level === 'warn'), f.filter((x) => x.area === 'story').map((x) => x.id));

  // ------------------------------------------------------------ the Test page
  await ev(() => window.__app.editor.setTab('test'));
  await wait(400);
  const ui = await ev(() => ({
    groups: [...document.querySelectorAll('.tc-group')].map((g) => g.id),
    errors: document.querySelectorAll('.tc-item.error').length,
    warns: document.querySelectorAll('.tc-item.warn').length,
    goes: document.querySelectorAll('.tc-item .tc-go').length,
    areas: document.querySelectorAll('.tl-area').length,
    playtest: !!document.querySelector('.pt-card .pt-go'),
    summary: document.querySelector('.tc-summary')?.textContent,
  }));
  check('the Test page shows every step as a group', ui.groups.length === 6 && ui.groups.includes('tc-story') && ui.areas === 6, ui);
  check('its findings show their weight and a Go button', ui.errors >= 1 && ui.warns >= 2 && ui.goes >= 3 && /to fix/.test(ui.summary), ui);
  check('the playtest panel is there', ui.playtest, ui);
  await shot('cs-test-broken');
  // Go → jumps where the finding points
  await ev(() => [...document.querySelectorAll('.tc-item.error')].find((el) => /Rune-Key/.test(el.textContent))?.querySelector('.tc-go').click());
  await wait(400);
  let at = await ev(() => { const ed = window.__app.editor; return { tab: ed.tab, head: document.querySelector('.ed-main .db-head h2')?.textContent || '' }; });
  check('Go on a missing key opens the quest that needs it', at.tab === 'story' && /Shadow in the East/.test(at.head), at);
  await ev(() => window.__app.editor.setTab('test'));
  await wait(300);
  await ev((id) => [...document.querySelectorAll('.tc-item.warn')].find((el) => el.textContent.includes('Isle Cave'))?.querySelector('.tc-go').click(), isleId);
  await wait(500);
  at = await ev(() => { const ed = window.__app.editor; return { tab: ed.tab, map: ed.map.type, sel: ed.selected?.type, target: ed.selected?.target?.map, tx: ed.view.rig.tx, tz: ed.view.rig.tz }; });
  check('Go on an unreachable place shows it on the Land', at.tab === 'land' && at.map === 'world' && at.sel === 'portal' && at.target === isleId && Math.abs(at.tx - 0.5 - isle.x) < 1 && Math.abs(at.tz - 0.5 - isle.y) < 1, at);
  await ev(() => window.__app.editor.setTab('test'));
  await wait(300);
  const tableFind = f.find((x) => x.go?.entity && x.go.tab === 'map');
  if (tableFind) {
    await ev((text) => [...document.querySelectorAll('.tc-item')].find((el) => el.textContent.includes(text))?.querySelector('.tc-go')?.click(), tableFind.text.slice(0, 30));
    await wait(600);
    at = await ev(() => { const ed = window.__app.editor; return { tab: ed.tab, map: ed.map.id, sel: ed.selected?.id }; });
    check('Go on a person opens Details on them', at.tab === 'map' && at.map === tableFind.go.map && at.sel === tableFind.go.entity, { at, go: tableFind.go });
    await ev(() => window.__app.editor.setTab('test'));
    await wait(300);
  }
  // put things back
  await ev((k) => {
    const g = window.__app.editor.game;
    const chest = g.maps.find((m) => m.id === k.map).entities.find((e) => e.id === k.id);
    chest.items = JSON.parse(k.was);
    g.maps.find((x) => x.name === 'Brookend').entities = window.__brookend;
    window.__app.editor.markDirty();
  }, key);
  f = await findings();
  check('mended, the errors go', !open(f).some((x) => x.level === 'error' || x.id === `empty:${town.id}`), open(f).map((x) => x.id));

  // ------------------------------------------------------------ ignore
  await ev(() => window.__app.editor.setTab('test'));
  await wait(300);
  const ignId = await ev(() => {
    const ed = window.__app.editor;
    const el = [...document.querySelectorAll('.tc-item.warn')].find((x) => x.textContent.includes('Isle Cave'));
    el.querySelector('.tc-x').click();
    return ed.game.meta.checklistIgnore?.[0];
  });
  await wait(300);
  f = await findings();
  check('Ignore takes a finding off the checklist', ignId === `unreach:${isleId}` && f.find((x) => x.id === ignId)?.ignored, { ignId });
  const shown = await ev(() => ({ btn: document.querySelector('.tc-ign')?.textContent, isle: [...document.querySelectorAll('.tc-item')].some((x) => x.textContent.includes('Isle Cave')) }));
  check('ignored findings hide until asked for', /Show ignored \(1\)/.test(shown.btn || '') && !shown.isle, shown);
  await ev(() => document.querySelector('.tc-ign').click());
  await wait(200);
  check('Show ignored brings them back, greyed', await ev(() => [...document.querySelectorAll('.tc-item.ignored')].some((x) => x.textContent.includes('Isle Cave'))));
  // saved, and back after reopening the realm
  const gid = await ev(() => { const ed = window.__app.editor; ed.save(true); return ed.game.id; });
  await ev((id) => { const app = window.__app; app.showTitle(); app.pickProject(); }, gid);
  await wait(300);
  await ev(() => [...document.querySelectorAll('.adv-row')].find((r) => r.textContent.includes('(remix)'))?.querySelector('button.primary').click());
  await until(() => window.__app.editor?.game.meta.title.includes('remix'));
  const kept = await ev(() => window.__app.editor.game.meta.checklistIgnore || []);
  check('Ignore persists with the realm', kept.includes(`unreach:${isleId}`), kept);

  // ------------------------------------------------------------ a playtest from a chapter
  // three chapters of its own, each ending when its quests are done (the
  // sample's own chapters split its main quest at steps instead)
  const chapters = await ev(() => {
    const ed = window.__app.editor, g = ed.game;
    g.story = g.story || { chapters: [] };
    {
      for (const q of g.quests) delete q.chapter;
      g.story.chapters = [
        { id: 'ch_a', name: 'Troubles near Westhold', summary: '', notes: '', cast: [{ npc: 'npc_wynn', note: '' }], ends: { type: 'quests' } },
        { id: 'ch_b', name: 'Friends Far Away', summary: '', notes: '', cast: [], ends: { type: 'quests' } },
        { id: 'ch_c', name: 'The Shadow in the East', summary: '', notes: '', cast: [{ npc: 'npc_hilda', note: '' }], ends: { type: 'quests' } },
      ];
      const set = { q_wolf: 'ch_a', q_brookend: 'ch_a', q_spiders: 'ch_b', q_chart: 'ch_b', q_main: 'ch_c' };
      for (const q of g.quests) if (set[q.id]) q.chapter = set[q.id];
    }
    ed.markDirty();
    return g.story.chapters.map((c) => c.id);
  });
  if (chapters.length < 2) console.log('skip playtest from a chapter: the realm has no chapters');
  else {
    const target = chapters[chapters.length - 1];
    await ev(() => window.__app.editor.setTab('test'));
    await wait(300);
    await page.locator('.pt-card input[value=chapter]').check();
    await page.locator('.pt-card select.pt-chapter').selectOption(target);
    await page.locator('.pt-card .pt-level').fill('5');
    await shot('cs-test-chapter');
    await page.locator('.pt-card .pt-go').click();
    check('the playtest from a chapter begins', await inPlay());
    await wait(500);
    const st = await ev((target) => {
      const s = window.__app.session, g = s.game;
      const ch = g.story.chapters, at = ch.findIndex((c) => c.id === target);
      const earlier = g.quests.filter((q) => ch.slice(0, at).some((c) => c.id === q.chapter));
      return {
        earlier: earlier.map((q) => [q.id, s.state.quests[q.id]?.status]),
        levels: s.party.members.map((m) => m.level),
        pending: s.party.members.map((m) => m.perkPending || 0),
        map: s.map.name,
        jerkin: s.party.inventory.wolfhide_jerkin || 0,
        letter: s.party.inventory.merek_letter || 0,
        greyfang: !!s.state.party.flags.killed_greyfang,
        main: s.state.quests.q_main?.status,
        chapterSeen: !!window.__app.editor.game.meta.playtest?.chapters?.[target],
      };
    }, target);
    check('the quests of earlier chapters are done', st.earlier.length >= 2 && st.earlier.every(([, s]) => s === 'done'), st.earlier);
    check('their rewards and flags are the party\'s', st.jerkin >= 1 && st.greyfang && st.letter === 0, st);
    check('the company is at the chosen level, talents chosen', st.levels.every((l) => l === 5) && st.pending.every((n) => n === 0), st);
    check('the party starts beside who the chapter opens with', st.map === 'Westhold' && st.main === 'active', st);
    check('the chapter counts as reached', st.chapterSeen, st);
    await ev(() => window.__app.endPlay(true));
    await until(() => window.__app.editor && !window.__app.editor.hidden);
  }

  // ------------------------------------------------------------ the designer's tools
  await ev(() => window.__app.editor.playtest(true, null));
  check('a quick playtest from the start begins', await inPlay());
  await wait(400);
  check('the 🛠 button is in the HUD', await ev(() => !!document.querySelector('.hud-head .hud-tools')));
  await page.locator('.hud-tools').click();
  await wait(200);
  const brook = await ev(() => window.__app.session.game.maps.find((m) => m.name === 'Brookend').id);
  await page.locator('.tt-panel select.tt-place').selectOption(brook);
  await page.getByRole('button', { name: 'Go there' }).click();
  check('Go there whisks the party into the place', await until((id) => window.__app.session.map?.id === id && !window.__app.session.transitioning, brook));
  await page.getByRole('button', { name: 'Beside it' }).click();
  await until(() => window.__app.session.map?.type === 'world' && !window.__app.session.transitioning);
  const beside = await ev((id) => {
    const s = window.__app.session;
    const portal = s.map.entities.find((e) => e.type === 'portal' && e.target?.map === id);
    return { world: s.map.type, d: Math.max(Math.abs(s.state.pos.x - portal.x), Math.abs(s.state.pos.y - portal.y)) };
  }, brook);
  check('Beside it puts the party by the site on the world map', beside.world === 'world' && beside.d >= 1 && beside.d <= 4, beside);
  const before = await ev(() => { const s = window.__app.session; return { gold: s.party.gold, lv: s.party.members.map((m) => m.level), stage: s.state.quests.q_main?.stage, sword: s.party.inventory.runeblade || 0 }; });
  await page.getByRole('button', { name: '+500 gold' }).click();
  const gold = await ev(() => window.__app.session.party.gold);
  check('+500 gold', gold === before.gold + 500, { before: before.gold, gold });
  await page.locator('.tt-panel select.tt-item').selectOption('runeblade');
  await page.getByRole('button', { name: 'Give', exact: true }).click();
  await ev(() => { const s = window.__app.session; s.party.members[0].hp = 1; });
  await page.getByRole('button', { name: 'Heal everyone' }).click();
  await page.getByRole('button', { name: 'Level up' }).click();
  check('the level-up card offers the new talents', await until(() => !!document.querySelector('.levelup-modal'), null, 5000));
  await closeModals();
  await page.locator('.tt-panel button.tt-wide').first().click(); // finish this step
  await page.locator('.tt-check input').check();
  const after = await ev(() => { const s = window.__app.session, g = s.game; return { gold: s.party.gold, lv: s.party.members.map((m) => m.level), stage: s.state.quests.q_main?.stage, sword: s.party.inventory.runeblade || 0, full: s.party.members[0].hp > 1, peace: !!s.peaceful }; });
  check('Give an item', after.sword === before.sword + 1, after);
  check('Heal everyone', after.full, after);
  check('Level up', after.lv.every((l, i) => l === before.lv[i] + 1), { before: before.lv, after: after.lv });
  check('Finish this step moves the tracked quest on', after.stage === (before.stage || 0) + 1, { before: before.stage, after: after.stage });
  check('Monsters leave us alone', after.peace && await ev(async () => (await window.__app.session.monstersAct()) === false), after);
  const rev = await ev(() => { const s = window.__app.session; document.querySelectorAll('.tt-panel button.small').forEach((b) => { if (b.textContent === 'Reveal this map') b.click(); }); return [...s.map.explored].every((v) => v === 1); });
  check('Reveal this map', rev);
  await ev(() => { if (!document.querySelector('.tt-panel') || document.querySelector('.tt-panel').hidden) document.querySelector('.hud-tools').click(); });
  await wait(200);
  await shot('cs-tools');
  // a fall, and the coverage of the trip so far
  await ev(() => window.__app.session.ui.showGameOver());
  await wait(200);
  await ev(() => [...document.querySelectorAll('.modal-buttons button')].find((b) => /Rise again/.test(b.textContent))?.click());
  await inPlay();
  await wait(300);
  // Edit here: back to Details, on the same map, looking at the party's square
  await ev(() => window.__app.session.enterMap(window.__app.session.game.maps.find((m) => m.name === 'Westhold').id, 12, 12, { instant: true }));
  await wait(300);
  const spot = await ev(() => { const s = window.__app.session; return { map: s.map.id, x: s.state.pos.x, y: s.state.pos.y }; });
  await ev(() => { if (document.querySelector('.tt-panel').hidden) document.querySelector('.hud-tools').click(); });
  await page.getByRole('button', { name: /Edit here/ }).click();
  await until(() => window.__app.editor && !window.__app.editor.hidden && !window.__app.session);
  await wait(500);
  at = await ev(() => { const ed = window.__app.editor; return { tab: ed.tab, map: ed.map.id, tx: ed.view.rig.tx, tz: ed.view.rig.tz }; });
  check('Edit here returns to Details on that map, at the party\'s square', at.tab === 'map' && at.map === spot.map && Math.abs(at.tx - 0.5 - spot.x) < 0.01 && Math.abs(at.tz - 0.5 - spot.y) < 0.01, { at, spot });
  await shot('cs-edit-here');
  await ev(() => window.__app.editor.setTab('test'));
  await wait(300);
  const hereTxt = await ev(() => [...document.querySelectorAll('.pt-card .pt-opt')].map((o) => o.textContent).find((t) => t.startsWith('From here')));
  check('From here then means where the party stood', hereTxt?.includes(`(${spot.x}, ${spot.y})`) && hereTxt.includes('Westhold'), { hereTxt, spot });

  // ------------------------------------------------------------ coverage
  const cov = await ev(() => { const g = window.__app.editor.game; return { pt: g.meta.playtest, names: Object.keys(g.meta.playtest?.visited || {}).map((id) => g.maps.find((m) => m.id === id)?.name) }; });
  check('playtests are counted', cov.pt?.count >= 2 && cov.pt.last > Date.now() - 600000, cov.pt && { count: cov.pt.count });
  check('the places visited are recorded', ['Brookend', 'Westhold'].every((n) => cov.names.includes(n)), cov.names);
  check('quests started are recorded', cov.pt?.quests?.q_main === 'started' || cov.pt?.quests?.q_main === 'done', cov.pt?.quests);
  check('defeats are recorded', cov.pt?.defeats >= 1, cov.pt && { defeats: cov.pt.defeats });
  const stored = await ev((id) => { const raw = Object.keys(localStorage).filter((k) => k.includes(id)).map((k) => localStorage.getItem(k)).join(''); return /"playtest"/.test(raw) && /"visited"/.test(raw); }, gid);
  check('the coverage is saved with the realm', stored);
  // a quest finished in a playtest, with the tools
  await ev(() => window.__app.editor.playtest(true, null));
  await inPlay();
  await wait(300);
  await ev(async () => {
    const s = window.__app.session;
    document.querySelector('.hud-tools').click();
    for (let i = 0; i < 12 && s.state.quests.q_main?.status !== 'done'; i++) {
      document.querySelector('.tt-panel button.tt-wide')?.click();
      await new Promise((r) => setTimeout(r, 30));
    }
  });
  await wait(300);
  const done = await ev(() => window.__app.session.state.quests.q_main?.status);
  await ev(() => window.__app.session.ui.showVictory());
  await wait(200);
  check('a win is recorded', await ev(() => window.__app.editor.game.meta.playtest.wins) >= 1);
  await closeModals();
  await ev(() => window.__app.endPlay(true));
  await until(() => window.__app.editor && !window.__app.editor.hidden);
  await wait(800);
  check('no window from play is left over the editor', await ev(() => !document.querySelector('.modal-back')), await ev(() => document.querySelector('.modal-back .modal-title')?.textContent));
  await ev(() => window.__app.editor.setTab('test'));
  await wait(400);
  const covUi = await ev(() => ({ q: window.__app.editor.game.meta.playtest.quests.q_main, rows: [...document.querySelectorAll('.cov-row')].map((r) => r.textContent), tested: window.__app.editor.findings.some((x) => x.id === 'test-never') }));
  check('quests finished in a playtest are recorded', done === 'done' && covUi.q === 'done', { done, q: covUi.q });
  check('the Test page shows what playtests have seen', covUi.rows.some((r) => /Places visited\s*\d+ \/ \d+/.test(r)) && covUi.rows.some((r) => /Quests finished\s*[1-9]/.test(r)) && !covUi.tested, covUi);
  await ev(() => { document.querySelectorAll('.cov-list').forEach((d) => { d.open = true; }); });
  await shot('cs-test-step');
  await ev(() => document.querySelector('.cov-card').scrollIntoView({ block: 'end' }));
  await wait(200);
  await shot('cs-coverage');
  await ev(() => { document.querySelector('.ed-main').scrollTop = 0; });
  await ev(() => window.__app.editor.playtestMenu());
  await wait(200);
  // much changed since: the checklist asks for another playtest
  check('nothing much changed since the last playtest', !(await findings()).some((x) => x.id === 'test-stale'));
  await ev(() => {
    const ed = window.__app.editor, g = ed.game;
    for (const m of g.maps.filter((x) => x.type !== 'world').slice(0, 3)) m.entities.push({ id: 'sign_' + m.id, type: 'sign', x: 1, y: 1, text: 'Changed.' });
    g.quests[0].name += ' (changed)';
  });
  const stale = (await findings()).find((x) => x.id === 'test-stale');
  check('much changed since the last playtest is a todo', stale?.level === 'todo' && /3 maps, the quests/.test(stale.text), stale);
  check('the ▶ Playtest button offers the same choices', await ev(() => !!document.querySelector('.pt-modal input[value=chapter]') && !!document.querySelector('.pt-modal .pt-level')));
  await shot('cs-playtest-menu');
  await ev(() => document.querySelector('.pt-modal .modal-x').click());
} catch (e) {
  check('the suite ran to the end', false, String(e.stack || e).split('\n').slice(0, 4));
}

check('no page errors', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'cs_checklist: all passed');
process.exit(fails ? 1 : 0);
