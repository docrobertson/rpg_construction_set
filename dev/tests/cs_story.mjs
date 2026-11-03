// The Story stream of the Construction Set: chapters in play (they gate their
// quests, open with a title card and a log line, and head the journal), the
// "someone in the company" goal, old saves and chapterless games, story
// sketches on a new realm (generateStory: every giver, item and boss is there
// and a walk-through gets to the end), and the Story step itself (the flow,
// the overview, a beat written through its form, chapters added and moved).
// Usage: node tests/cs_story.mjs [shots-dir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const OUT = process.argv[2] || path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rpgcs.pref.seenHowTo', 'true'); localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'); } catch { /* private mode */ } });
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 });

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(info)}`); if (!ok) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const until = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

// ---------------------------------------------------------------- chapters in play
// the sample, with a side quest moved into Chapter II and a quest of Chapter II
// that starts by itself
await ev(() => {
  const app = window.__app;
  const g = window.__schema.cloneGame(app.sample);
  g.quests.find((q) => q.id === 'q_wolf').chapter = 'ch_barrow';
  g.quests.push({ id: 'q_test_auto', name: 'A Test of Chapter Two', auto: true, chapter: 'ch_barrow', stages: [{ text: 'Speak to Mayor Hilda', goal: { type: 'talk', npc: 'npc_hilda' } }], reward: { items: [] } });
  app.playGame(g, { quick: true, noSave: true });
});
check('the game starts', await until(() => window.__app.session?.mode === 'explore' && !window.__app.session.transitioning && window.__app.session.state.questsBegun));
await wait(500);
let r = await ev(() => {
  const s = window.__app.session, Q = window.__quests;
  const wynn = Q.findNpc(s.game, 'npc_wynn').npc;
  return {
    chapters: s.state.chapters, main: s.state.quests.q_main?.status, auto: s.state.quests.q_test_auto?.status || null,
    offer: Q.canOffer(s, s.game.quests.find((q) => q.id === 'q_wolf')), marker: Q.npcMarker(s, wynn), offers: Q.offersFrom(s, wynn).map((q) => q.id),
    card: document.querySelector('.chbanner')?.innerText || '', log: [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent).join(' | '),
    serpent: Q.canOffer(s, s.game.quests.find((q) => q.id === 'q_serpent')),
  };
});
check('Chapter I is open from the start', r.chapters && r.chapters.ch_gathering != null && r.chapters.ch_barrow == null, r.chapters);
check('the main quest starts as before', r.main === 'active', r.main);
check('a Chapter II quest is not offered yet', r.offer === false && !r.offers.includes('q_wolf') && r.marker !== 'quest', r);
check('a Chapter II quest that starts by itself waits', r.auto === null, r.auto);
check('quests in no chapter are offered from the start', r.serpent === true, r.serpent);
check('the game opens with a Chapter I title card', /Chapter I\b/i.test(r.card) && /Gathering Dark/i.test(r.card), r.card);
check('and a log line', /Chapter I — The Gathering Dark/.test(r.log), r.log.slice(-300));
await shot('story-play-chapter1');
// the main quest reaches step 4: Chapter I ends, Chapter II opens
r = await ev(async () => {
  const s = window.__app.session, Q = window.__quests;
  for (const b of document.querySelectorAll('.chbanner')) b.click();
  await new Promise((res) => setTimeout(res, 900));
  Q.onTalk(s, Q.findNpc(s.game, 'npc_hilda').npc);
  Q.onTalk(s, Q.findNpc(s.game, 'npc_aldric').npc);
  const before = s.state.chapters.ch_barrow;
  Q.onTalk(s, Q.findNpc(s.game, 'npc_durgan').npc);
  const wynn = Q.findNpc(s.game, 'npc_wynn').npc;
  await new Promise((res) => setTimeout(res, 600));
  return {
    stage: s.state.quests.q_main.stage, before, after: s.state.chapters.ch_barrow, auto: s.state.quests.q_test_auto?.status || null,
    offer: Q.canOffer(s, s.game.quests.find((q) => q.id === 'q_wolf')), marker: Q.npcMarker(s, wynn),
    card: document.querySelector('.chbanner')?.innerText || '', log: [...document.querySelectorAll('.hud-log .log-line')].map((e) => e.textContent).join(' | '),
  };
});
check('the main quest reaches step 4', r.stage === 3, r.stage);
check('Chapter II opens when Chapter I ends', r.before == null && r.after != null, r);
check('its title card: "Chapter II — The Barrow King"', /Chapter II/i.test(r.card) && /Barrow King/i.test(r.card) && /Grimholt/.test(r.card), r.card);
check('its log line', /Chapter II — The Barrow King/.test(r.log), r.log.slice(-300));
check('the Chapter II quest is offered now', r.offer === true && r.marker === 'quest', r);
check('the Chapter II quest that starts by itself has started', r.auto === 'active', r.auto);
await shot('story-play-chapter2');
// the journal groups the quests under their chapters
r = await ev(async () => {
  const s = window.__app.session;
  for (const b of document.querySelectorAll('.chbanner')) b.click();
  s.ui.openJournal();
  await new Promise((res) => setTimeout(res, 300));
  const heads = [...document.querySelectorAll('.journal-modal .j-chapter')].map((e) => e.textContent);
  const now = document.querySelector('.journal-modal .j-chapnow')?.innerText || '';
  return { heads, now };
});
check('the journal heads its quests with their chapters', r.heads.some((t) => /Chapter II/i.test(t) && /Barrow King/.test(t)), r.heads);
check('the journal says which chapter the story is in', /Chapter II/i.test(r.now) && /Barrow King/.test(r.now), r.now);
await shot('story-play-journal');
await page.keyboard.press('Escape');
await wait(200);

// ---------------------------------------------------------------- someone in the company
r = await ev(async () => {
  const s = window.__app.session, Q = window.__quests;
  const west = s.game.maps.find((m) => m.name === 'Westhold');
  s.game.quests.push({ id: 'q_test_comp', name: 'Elwen Comes Along', stages: [
    { text: 'Have Elwen join you', goal: { type: 'companion', npc: 'npc_elwen' } },
    { text: 'Bring Elwen to Westhold', goal: { type: 'companion', npc: 'npc_elwen', map: west.id } },
  ], reward: { items: [] } });
  Q.startQuest(s, 'q_test_comp');
  const first = { ...s.state.quests.q_test_comp };
  const f = Q.findNpc(s.game, 'npc_elwen');
  const target = Q.goalTarget(s, s.game.quests.find((q) => q.id === 'q_test_comp'));
  const err = s.recruit({ ...JSON.parse(JSON.stringify(f.npc)), mapId: f.map.id }, { toInn: true });
  const joined = s.party.members.find((m) => m.fromNpc === 'npc_elwen');
  const second = { ...s.state.quests.q_test_comp };
  await s.enterMap(west.id, west.entry.x, west.entry.y, { instant: true });
  return { first, err, joined: !!joined, second, done: s.state.quests.q_test_comp.status, target: target && target.mapId === f.map.id, text: Q.describeGoal(s.game, null, { type: 'companion', npc: 'npc_elwen', map: west.id }) };
});
check('a companion goal waits for the person', r.first.stage === 0 && r.first.status === 'active', r);
check('the tracker points to them before they join', r.target, r);
check('a companion remembers whom they were', r.err == null && r.joined, r);
check('the goal is met as they join', r.second.stage === 1, r.second);
check('…and on a map, once the company is there with them', r.done === 'done', r.done);
check('the goal reads well', /Bring Elwen with you to Westhold/.test(r.text), r.text);

// ---------------------------------------------------------------- old saves and chapterless games
r = await ev(async () => {
  const app = window.__app;
  const s = app.session;
  // a save of the sample from before chapters, deep in Chapter II
  const old = JSON.parse(JSON.stringify(s.state));
  delete old.chapters;
  old.quests = { q_main: { status: 'active', stage: 4, base: 0, turn: 10 } };
  app.stopSession();
  app.playGame(app.sample, { state: old, noSave: true });
  for (let i = 0; i < 80 && !(app.session?.mode === 'explore' && !app.session.transitioning && document.querySelector('.qtrack')); i++) await new Promise((res) => setTimeout(res, 100));
  await new Promise((res) => setTimeout(res, 400));
  const n = app.session;
  return { chapters: n.state.chapters, stage: n.state.quests.q_main.stage, card: !!document.querySelector('.chbanner'), wolf: window.__quests.canOffer(n, n.game.quests.find((q) => q.id === 'q_wolf')) };
});
check('an old save of the sample loads where it was', r.stage === 4, r);
check('…its chapters worked out quietly (no title card)', r.chapters?.ch_gathering != null && r.chapters?.ch_barrow != null && r.chapters?.ch_garoth == null && !r.card, r);
check('…and its side quests are still offered', r.wolf === true, r);
r = await ev(async () => {
  const app = window.__app;
  app.stopSession();
  const g = window.__schema.cloneGame(app.sample);
  g.story = { chapters: [] };
  for (const q of g.quests) delete q.chapter;
  app.playGame(g, { quick: true, noSave: true });
  for (let i = 0; i < 80 && !(app.session?.state?.questsBegun && app.session.mode === 'explore'); i++) await new Promise((res) => setTimeout(res, 100));
  await new Promise((res) => setTimeout(res, 400));
  const s = app.session;
  return { main: s.state.quests.q_main?.status, chapters: s.state.chapters, card: !!document.querySelector('.chbanner'), wolf: window.__quests.canOffer(s, s.game.quests.find((q) => q.id === 'q_wolf')) };
});
check('a game without chapters plays as before', r.main === 'active' && r.chapters === undefined && !r.card && r.wolf === true, r);
r = await ev(() => {
  // a game file from before chapters gains an empty outline
  const g = JSON.parse(window.__schema.serializeGame(window.__app.sample));
  delete g.story;
  const back = window.__schema.deserializeGame(g);
  return Array.isArray(back.story?.chapters) && back.story.chapters.length === 0;
});
check('old game files gain an empty story', r);

// ---------------------------------------------------------------- the sample, walked through
r = await ev(() => {
  const w = window.__story.walkStory(window.__app.sample);
  return { ok: w.ok, won: w.won, chapters: w.chapters, stuck: w.stuck.map((s) => `${s.quest.name}: ${s.why}`) };
});
check('the sample walks through to victory, chapter by chapter', r.ok && r.won && r.chapters.length === 3, r);

// ---------------------------------------------------------------- story sketches on a new realm
await ev(async () => { const app = window.__app; app.stopSession(); app.newProject(false); await new Promise((res) => setTimeout(res, 1500)); });
check('a new realm opens in the editor', await until(() => !!window.__app.editor));
r = await ev(() => {
  const ed = window.__app.editor;
  const out = [];
  const cases = [['darklord', 3, true], ['relic', 4, true], ['curse', 2, true], ['heir', 5, true], ['darklord', 1, true], ['relic', 3, false]];
  for (const [premise, n, places] of cases) {
    const g = window.__schema.cloneGame(ed.game);
    const world = g.maps.find((m) => m.type === 'world');
    if (places) {
      const wants = [{ kind: 'town', name: 'Ashford' }, { kind: 'castle', name: 'Highwatch' }, { kind: 'village', name: 'Greenstead' }, { kind: 'cave', name: 'Wolfden' }, { kind: 'cave', name: 'Misthollow' }];
      if (premise === 'darklord') wants.push({ kind: 'fortress', name: 'Doomfang' });
      window.__places.autoPlaceSites(g, world, wants, { seed: 11 + n });
    }
    const t0 = performance.now();
    let res;
    try { res = window.__storyGen.generateStory(g, { premise, chapters: n, seed: 100 + n }); } catch (e) { out.push({ premise, n, crash: e.message }); continue; }
    const ms = performance.now() - t0;
    const f = window.__story.storyFacts(g);
    const probs = [];
    for (const q of res.quests) {
      if (q.giver && !f.npcs.has(q.giver)) probs.push(`${q.name}: its giver is missing`);
      if (!q.giver && !q.auto) probs.push(`${q.name}: nobody gives it`);
      if (q.chapter && !g.story.chapters.some((c) => c.id === q.chapter)) probs.push(`${q.name}: no such chapter`);
      for (const st of q.stages) {
        const gl = st.goal || {};
        if ((gl.type === 'collect' || gl.type === 'deliver') && !g.items.some((i) => i.id === gl.item)) probs.push(`${q.name}: the item is not in the game`);
        if ((gl.type === 'collect' || gl.type === 'deliver') && !(f.items.get(gl.item) || []).length) probs.push(`${q.name}: nothing gives ${gl.item}`);
        if (gl.type === 'kill' && g.monsters.find((m) => m.id === gl.monster)?.boss && !f.monsters.has(gl.monster)) probs.push(`${q.name}: ${gl.monster} is not placed`);
        if ((gl.type === 'talk' || gl.type === 'deliver' || gl.type === 'companion') && gl.npc !== '' && !f.npcs.has(gl.npc || q.giver)) probs.push(`${q.name}: the person is missing`);
      }
    }
    for (const id of [...new Set(res.quests.flatMap((q) => [q.giver, ...q.stages.map((s) => s.goal?.npc)]).filter(Boolean))]) {
      const p = f.npcs.get(id);
      if (p && !window.__story.canStandBy(f, p.map, p.npc.x, p.npc.y)) probs.push(`${p.npc.name} cannot be reached`);
    }
    const w = window.__story.walkStory(g, { facts: f });
    out.push({ premise, n, places, ms: Math.round(ms), chapters: res.chapters.length, quests: res.quests.length, probs, walk: w.ok, won: w.won, stuck: w.stuck.map((s) => `${s.quest.name}: ${s.why}`), victory: g.settings.victory.type, intro: g.meta.intro.slice(0, 40) });
  }
  return out;
});
for (const c of r) {
  const label = `${c.premise} in ${c.n} chapter${c.n === 1 ? '' : 's'}${c.places ? '' : ' (on a realm with no places)'}`;
  check(`generateStory: ${label} writes its chapters and quests`, !c.crash && c.chapters === c.n && c.quests >= c.n, c);
  check(`generateStory: ${label}: every giver, item and boss is there`, !c.crash && !c.probs.length, c.probs || c.crash);
  check(`generateStory: ${label}: a company can play it to victory`, !c.crash && c.walk && c.won === true, c.stuck || c.crash);
  check(`generateStory: ${label}: quick`, !c.crash && c.ms < 500, c.ms);
}
check('generateStory sets how the game is won and its opening story', r.every((c) => c.victory && c.victory !== 'none' && !/^Long ago, in an age of legend/.test(c.intro)), r.map((c) => [c.victory, c.intro]));

// ---------------------------------------------------------------- the Story step
await ev(async () => {
  const app = window.__app;
  const g = window.__schema.cloneGame(app.sample);
  g.id = 'cs_story_test_' + Date.now();
  app.openEditor(g);
  await new Promise((res) => setTimeout(res, 1000));
  app.editor.setTab('story');
  await new Promise((res) => setTimeout(res, 400));
});
r = await ev(() => ({
  chapters: [...document.querySelectorAll('.ed-left .st-ch')].map((b) => b.textContent),
  quests: [...document.querySelectorAll('.ed-left .st-q')].length,
  head: document.querySelector('.ed-main .st-head h2')?.textContent,
  form: !!document.querySelector('.ed-main .form'),
  cards: [...document.querySelectorAll('.ed-main .qcard')].map((c) => c.dataset.q),
  steps: [...document.querySelectorAll('.ed-main .qc-step')].map((c) => c.innerText.replace(/\s+/g, ' ')),
  cast: document.querySelectorAll('.ed-main .st-castrow').length,
  walk: document.querySelector('.ed-main .st-walk')?.innerText || '',
}));
check('the Story step lists the chapters in order', r.chapters.length === 3 && /Gathering Dark/.test(r.chapters[0]) && /Barrow King/.test(r.chapters[1]), r.chapters);
check('…with their quests nested', r.quests >= 9, r.quests);
check('it opens on the first chapter, with its form', /Gathering Dark/.test(r.head) && r.form, r);
check('the chapter is laid out as a flow of steps with places', r.cards.includes('q_main') && r.steps.length === 3 && /Talk to Mayor Hilda \(Westhold\)/.test(r.steps[0]) && /Seal of Aldric/.test(r.steps[2]), r.steps);
check('the chapter shows its cast', r.cast === 3, r.cast);
check('the walk-through vouches for the chapter', /Walked through/.test(r.walk), r.walk);
await shot('story-chapter');
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.goTo({ tab: 'story', chapter: 'ch_barrow' });
  await new Promise((res) => setTimeout(res, 300));
  const steps = [...document.querySelectorAll('.ed-main .qc-step')].map((c) => c.innerText.replace(/\s+/g, ' '));
  return { head: document.querySelector('.ed-main .st-head h2')?.textContent, steps };
});
check('goTo a chapter opens it', /Barrow King/.test(r.head), r.head);
check('a quest carried on shows its steps of this chapter, keys and all', r.steps.length === 4 && /Grimholt Barrow/.test(r.steps[0]) && /Ulfgar/.test(r.steps[1]) && /Rune-Key/.test(r.steps[2]) && /chest in Grimholt Barrow/.test(r.steps[2]), r.steps);
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.goTo({ tab: 'story', chapter: 'ch_garoth' });
  await new Promise((res) => setTimeout(res, 300));
  return [...document.querySelectorAll('.ed-main .qc-step')].map((c) => c.innerText.replace(/\s+/g, ' '));
});
check('a barred way shows which key opens it', r.some((t) => /Dol Garoth opens with the Rune-Key/.test(t)), r);
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.story.showOverview();
  await new Promise((res) => setTimeout(res, 400));
  return {
    cols: document.querySelectorAll('.st-board .st-col').length, cards: document.querySelectorAll('.st-board .mcard').length,
    links: [...document.querySelectorAll('.st-board svg.st-links path')].map((p) => p.getAttribute('class')),
    walk: document.querySelector('.ed-main .st-walk')?.innerText || '', key: [...document.querySelectorAll('.mcard .mc-key')].map((e) => e.textContent),
  };
});
check('the whole story: a column for each chapter and one for any time', r.cols === 4 && r.cards >= 9, r);
check('…with what leads to what, and the key to its gate', r.links.includes('cont') && r.links.includes('key'), r.links);
check('…and the walk-through says the story can be won', /game is won/.test(r.walk), r.walk);
await shot('story-overview');
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.goTo({ tab: 'story', quest: 'q_main' });
  await new Promise((res) => setTimeout(res, 300));
  const sel = [...document.querySelectorAll('.ed-main .field')].find((f) => /^Chapter/.test(f.querySelector('.field-label')?.textContent || ''))?.querySelector('select');
  return { head: document.querySelector('.ed-main .db-head h2')?.textContent, chapter: sel?.value, options: sel ? [...sel.options].map((o) => o.textContent) : [], marks: [...document.querySelectorAll('.qcard.solo .qc-chap')].map((e) => e.textContent) };
});
check('a quest opens in its form, with a Chapter select', /Shadow in the East/.test(r.head) && r.chapter === 'ch_gathering' && r.options.length === 4, r);
check('…and its flow marks where each chapter begins', r.marks.join(',') === 'I,II,III', r.marks);
r = await ev(async () => {
  // the companion goal in the step form
  const ed = window.__app.editor;
  const types = [...document.querySelectorAll('.ed-main .sl-row select')][0];
  return { has: !!types && [...types.options].some((o) => o.value === 'companion' && /someone in the company/i.test(o.textContent)) };
});
check('the step form offers “Have someone in the company”', r.has, r);

// a beat, written through its form
r = await ev(async () => {
  const ed = window.__app.editor;
  const g = ed.game;
  ed.goTo({ tab: 'story', chapter: 'ch_barrow' });
  await new Promise((res) => setTimeout(res, 300));
  const n0 = g.quests.length;
  document.querySelector('.st-beat[data-beat=talk]').click();
  await new Promise((res) => setTimeout(res, 300));
  const form = document.querySelector('.st-beatform');
  // (the first new person is the one who gives it; the second, whom to see)
  const names = [...form.querySelectorAll('input')].filter((i) => /made-up/.test(i.placeholder));
  names[0].value = 'Captain Rhosyn'; names[0].dispatchEvent(new Event('input', { bubbles: true }));
  names[1].value = 'Brother Anselm'; names[1].dispatchEvent(new Event('input', { bubbles: true }));
  const shotOk = !!document.querySelector('.st-beat-modal');
  [...document.querySelectorAll('.modal-buttons button')].find((b) => /Write it/.test(b.textContent)).click();
  await new Promise((res) => setTimeout(res, 400));
  const q = g.quests[g.quests.length - 1];
  const f = window.__story.storyFacts(g);
  const who = f.npcs.get(q.stages[q.stages.length - 1].goal.npc);
  return {
    added: g.quests.length === n0 + 1, chapter: q.chapter, name: q.name, stages: q.stages.map((s) => s.text), giver: q.giver && f.npcs.get(q.giver)?.npc.name,
    who: who?.npc.name, where: who?.map.name, reach: who ? window.__story.canStandBy(f, who.map, who.npc.x, who.npc.y) : false, modal: shotOk,
    card: !!document.querySelector(`.ed-main .qcard[data-q="${q.id}"]`), problems: window.__story && ed.story.questIssues(q).map((x) => x.text),
  };
});
check('a Talk beat writes a quest into the chapter', r.added && r.chapter === 'ch_barrow' && r.modal, r);
check('…with the new people stood where the company can reach', r.who === 'Brother Anselm' && r.giver === 'Captain Rhosyn' && r.reach, r);
check('…worded with the real names', r.stages.some((t) => /Brother Anselm/.test(t)) && /Anselm/.test(r.name), r);
check('…shown in the chapter\'s flow, with nothing to fix', r.card && !r.problems.length, r);
await shot('story-beat-written');
r = await ev(async () => {
  const ed = window.__app.editor;
  const g = ed.game;
  document.querySelector('.st-beat[data-beat=gate]').click();
  await new Promise((res) => setTimeout(res, 300));
  [...document.querySelectorAll('.modal-buttons button')].find((b) => /Write it/.test(b.textContent)).click();
  await new Promise((res) => setTimeout(res, 400));
  const q = g.quests[g.quests.length - 1];
  const gate = g.maps.flatMap((m) => m.entities).find((e) => e.type === 'portal' && e.requires === q.stages.find((s) => s.goal.type === 'collect')?.goal.item);
  const w = window.__story.walkStory(g);
  return { name: q.name, stages: q.stages.map((s) => s.goal.type), gate: !!gate, walk: w.ok, stuck: w.stuck.map((s) => s.why) };
});
check('a Key & gate beat bars a way and puts its key on a guardian', r.gate && r.stages.join(',') === 'kill,collect,reach', r);
check('…and the story still plays through', r.walk, r.stuck);
// chapters: add, move, delete
r = await ev(async () => {
  const ed = window.__app.editor;
  const g = ed.game;
  const n0 = g.story.chapters.length;
  [...document.querySelectorAll('.ed-left button')].find((b) => /Add chapter/.test(b.textContent)).click();
  await new Promise((res) => setTimeout(res, 300));
  const added = g.story.chapters.length === n0 + 1;
  const ch = g.story.chapters[g.story.chapters.length - 1];
  const nameInput = document.querySelector('.ed-main .form input[type=text]');
  nameInput.value = 'The Long Road Home'; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  [...document.querySelectorAll('.ed-main .st-head button')].find((b) => /Earlier/.test(b.textContent)).click();
  await new Promise((res) => setTimeout(res, 200));
  const at = g.story.chapters.indexOf(ch);
  const left = [...document.querySelectorAll('.ed-left .st-ch')].map((b) => b.textContent);
  [...document.querySelectorAll('.ed-main .st-head button')].find((b) => /Delete/.test(b.textContent)).click();
  await new Promise((res) => setTimeout(res, 200));
  const ok = [...document.querySelectorAll('.modal-buttons button')].find((b) => /OK|Yes|Delete/i.test(b.textContent) && !/Cancel/.test(b.textContent));
  ok?.click();
  await new Promise((res) => setTimeout(res, 300));
  return { added, name: ch.name, at, n0, left, gone: !g.story.chapters.includes(ch) };
});
check('a chapter is added, named and moved earlier', r.added && r.name === 'The Long Road Home' && r.at === r.n0 - 1 && /Long Road Home/.test(r.left[r.n0 - 1]), r);
check('…and deleted', r.gone, r);
// the first “New” button still writes a quest (in the chapter in view)
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.goTo({ tab: 'story', chapter: 'ch_garoth' });
  await new Promise((res) => setTimeout(res, 200));
  [...document.querySelectorAll('.ed-left button')].find((b) => /New/.test(b.textContent)).click();
  await new Promise((res) => setTimeout(res, 200));
  const q = ed.game.quests[ed.game.quests.length - 1];
  return { chapter: q.chapter, form: !!document.querySelector('.ed-main .form'), view: ed.story.view.kind };
});
check('“+ New quest” writes one into the chapter in view', r.chapter === 'ch_garoth' && r.form && r.view === 'quest', r);

check('no page errors', !errors.length, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'cs_story: all passed');
process.exit(fails ? 1 : 0);
