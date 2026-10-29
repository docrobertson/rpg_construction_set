// Quests, journal, points of interest and events: start → progress → completion
// on the sample adventure, the tracker and journal UI, a shrine, a text event
// with a fight, old-save migration and the editor's quest tab.
// Usage: node tests/quests.mjs [shots-dir]
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
const fails = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const settle = async () => {
  await ev(async () => {
    const s = window.__app.session;
    for (let i = 0; i < 300 && (s.busy || s.transitioning || s.mode === 'combat'); i++) await new Promise((r) => setTimeout(r, 25));
    // the victory screen waits for "Onward"
    document.querySelector('.victory-modal .modal-buttons button, .victory-modal button.primary')?.click();
  });
};

await page.addInitScript(() => localStorage.setItem('rpgcs.pref.seenEditorHelp', 'true'));
await page.goto('file://' + path.resolve(HERE, '../../index.html'));
await wait(1200);
await ev(async () => { const app = window.__app; app.playGame(app.sample, { quick: true, noSave: true }); await new Promise((r) => setTimeout(r, 1800)); });
await wait(1200);

// --- the first thing a new player sees: the main quest and where to go
let st = await ev(() => {
  const s = window.__app.session;
  return { q: s.state.quests.q_main, tracked: s.state.tracked, tracker: document.querySelector('.qtrack')?.innerText || '', banner: document.querySelector('.qbanner')?.innerText || '' };
});
check('main quest starts by itself', st.q && st.q.status === 'active' && st.q.stage === 0, st.q);
check('tracker shows the first goal', /Mayor Hilda/.test(st.tracker) && /Westhold/.test(st.tracker), st.tracker);
check('tracker points the way', /west/.test(st.tracker), st.tracker);
check('a banner announces the quest', /Main quest/i.test(st.banner) || /New quest/i.test(st.banner), st.banner);
await shot('quests-start');

// --- markers: Hilda is the one to talk to
await ev(async () => {
  const s = window.__app.session;
  const town = s.game.maps.find((m) => m.name === 'Westhold');
  await s.enterMap(town.id, town.entry.x, town.entry.y, { instant: true });
});
await wait(400);
st = await ev(async () => {
  const s = window.__app.session;
  const { npcMarker } = window.__quests;
  const hilda = s.map.entities.find((e) => e.id === 'npc_hilda');
  const wynn = s.map.entities.find((e) => e.id === 'npc_wynn');
  const shop = s.map.entities.find((e) => e.shop && e.role !== 'inn');
  s.visible = null; // as if in plain sight
  return { hilda: npcMarker(s, hilda), wynn: npcMarker(s, wynn), shop: npcMarker(s, shop), hover: s.describeTile(hilda.x, hilda.y) };
});
check('npcMarker: main-quest contact is a turn-in', st.hilda === 'turnin', st);
check('npcMarker: side-quest giver offers a quest', st.wynn === 'quest', st);
check('npcMarker: shopkeeper is a shop', st.shop === 'shop', st);
check('hover text mentions the quest', /quest/.test(st.hover), st.hover);

// --- talking to Hilda advances the main quest and pays out
st = await ev(async () => {
  const s = window.__app.session;
  const gold0 = s.party.gold;
  const hilda = s.map.entities.find((e) => e.id === 'npc_hilda');
  s.talkTo(hilda);
  await new Promise((r) => setTimeout(r, 300));
  const talk = document.querySelector('.talk-log')?.innerText || '';
  return { stage: s.state.quests.q_main.stage, gold: s.party.gold - gold0, talk };
});
check('talking to Hilda completes stage 1', st.stage === 1, st.stage);
check('stage reward paid', st.gold === 50, st.gold);
check('her quest line is spoken', /Caer Aldon/.test(st.talk) && /Quest updated/.test(st.talk), st.talk.slice(0, 200));
await page.keyboard.press('Escape');
await wait(300);

// --- a side quest offered in conversation: accept → kill → turn in
st = await ev(async () => {
  const s = window.__app.session;
  const wynn = s.map.entities.find((e) => e.id === 'npc_wynn');
  s.talkTo(wynn);
  await new Promise((r) => setTimeout(r, 300));
  const offer = document.querySelector('.qoffer');
  const txt = offer?.innerText || '';
  [...offer.querySelectorAll('button')].find((b) => /Accept/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 200));
  return { txt, q: s.state.quests.q_wolf, tracked: s.state.tracked };
});
check('quest offer card is shown', /Wolf of the Old Forest/.test(st.txt) && /Reward/.test(st.txt), st.txt.slice(0, 160));
check('accepting starts the quest', st.q && st.q.status === 'active' && st.q.stage === 0, st.q);
check('accepted quest is tracked', st.tracked === 'q_wolf', st.tracked);
st = await ev(() => { const s = window.__app.session; s.ui.refresh(); return document.querySelector('.qtrack')?.innerText || ''; });
check('from inside a town the tracker says which way to head', /Leave Westhold, then \d+ leagues? [a-z-]+/.test(st), st);
await page.keyboard.press('Escape');
await wait(300);
// Greyfang's death arrives the same way a battle reports it
st = await ev(async () => {
  const s = window.__app.session;
  s.onMonsterKilled('greyfang');
  const { checkQuests } = window.__quests;
  checkQuests(s);
  const after = { ...s.state.quests.q_wolf };
  const wynn = s.map.entities.find((e) => e.id === 'npc_wynn');
  const mk = window.__quests.npcMarker(s, wynn);
  const xp0 = s.party.members[0].xp;
  s.talkTo(wynn);
  await new Promise((r) => setTimeout(r, 300));
  const talk = document.querySelector('.talk-log')?.innerText || '';
  return { after, mk, done: s.state.quests.q_wolf, hide: s.party.inventory.wolfhide_jerkin || 0, xp: s.party.members[0].xp - xp0, talk };
});
check('kill goal advances the side quest', st.after.stage === 1, st.after);
check('giver becomes a turn-in', st.mk === 'turnin', st.mk);
check('turning in completes the quest', st.done.status === 'done', st.done);
check('quest reward: item and experience', st.hide === 1 && st.xp >= 80, { hide: st.hide, xp: st.xp });
check('completion is announced', /Quest complete/.test(st.talk), st.talk.slice(-160));
await page.keyboard.press('Escape');
await wait(300);

// --- the journal
await page.keyboard.press('j');
await wait(400);
st = await ev(() => ({ open: !!document.querySelector('.journal-modal'), text: document.querySelector('.journal-modal')?.innerText || '' }));
check('J opens the journal', st.open, st.text.slice(0, 120));
check('journal lists the main quest and its next step', /Shadow in the East/.test(st.text) && /King Aldric/.test(st.text), st.text.slice(0, 300));
await shot('quests-journal');
await ev(() => { [...document.querySelectorAll('.journal-modal .tabs button')].find((b) => /Completed/.test(b.textContent)).click(); });
await wait(200);
st = await ev(() => document.querySelector('.journal-modal')?.innerText || '');
check('completed tab shows the finished quest', /Wolf of the Old Forest/.test(st), st.slice(0, 200));
await page.keyboard.press('Escape');
await wait(200);
check('tracker can be clicked to open the journal', await ev(async () => { document.querySelector('.qtrack').click(); await new Promise((r) => setTimeout(r, 200)); const ok = !!document.querySelector('.journal-modal'); document.querySelector('.journal-modal')?.closest('.modal-back')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return ok; }));
await wait(200);

// --- a shrine: bump into it, pray, receive a blessing that lasts into battle
await ev(async () => {
  const s = window.__app.session;
  const world = s.game.maps[0];
  const shrine = world.entities.find((e) => e.id === 'ev_shrine_might');
  await s.enterMap(world.id, shrine.x, shrine.y + 1, { instant: true });
  s.view.setZoom(9, true);
});
await wait(500);
await settle();
await page.keyboard.press('ArrowUp');
await wait(600);
st = await ev(() => ({ open: !!document.querySelector('.event-modal'), text: document.querySelector('.event-modal')?.innerText || '' }));
check('bumping a shrine opens it', st.open && /Elendur/.test(st.text), st.text.slice(0, 120));
await shot('quests-poi');
await page.keyboard.press('1');
await wait(400);
st = await ev(() => {
  const s = window.__app.session;
  return { text: document.querySelector('.event-modal')?.innerText || '', bl: s.state.blessings.map((b) => b.id), tracker: document.querySelector('.qtrack')?.innerText || '' };
});
check('praying grants the blessing', st.bl.includes('might'), st);
check('the result is shown', /Blessing of Might/.test(st.text), st.text.slice(0, 200));
await page.keyboard.press('Escape');
await wait(300);
st = await ev(() => document.querySelector('.qtrack')?.innerText || '');
check('tracker shows the blessing', /Blessing of Might/.test(st), st);
// the same shrine is quiet until tomorrow
st = await ev(async () => {
  const s = window.__app.session;
  const shrine = s.map.entities.find((e) => e.id === 'ev_shrine_might');
  s.ui.openEvent(shrine);
  await new Promise((r) => setTimeout(r, 100));
  return !!document.querySelector('.event-modal');
});
check('a used shrine rests until tomorrow', st === false);
// blessing buffs carry into battle
st = await ev(async () => {
  const s = window.__app.session;
  s.fight([{ id: 'giant_rat', n: 1 }], 'grass', {});
  for (let i = 0; i < 100 && !(s.battle && s.battle.units.length); i++) await new Promise((r) => setTimeout(r, 30));
  const buffs = s.battle ? s.battle.partyUnits.map((u) => u.member.buffs.map((b) => b.kind).join(',')) : null;
  for (let i = 0; i < 300 && s.battle; i++) {
    const b = s.battle;
    if (b.active && !b.acting && b.active.side === 'party') {
      for (const u of b.enemies) u.dead = true;
      b.actPass();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return buffs;
});
check('blessing gives battle buffs', Array.isArray(st) && st.every((x) => x.includes('bless')), st);
await wait(800);
await settle();

// --- a text event with choices: the toll troll on the bridge
st = await ev(async () => {
  const s = window.__app.session;
  const troll = s.map.entities.find((e) => e.id === 'ev_toll_troll');
  const p = s.state.pos;
  await s.enterMap(s.map.id, troll.x - 1, troll.y, { instant: true });
  s.view.setZoom(9, true);
  return { troll: !!troll, kind: troll && troll.kind, mode: s.mode, pos: s.state.pos, at: troll && [troll.x, troll.y], battle: !!s.battle };
});
check('the toll troll waits on the bridge', st.troll && st.kind === 'creature', st);
await settle();
await page.keyboard.press('ArrowRight');
await wait(700);
st = await ev(() => ({ text: document.querySelector('.event-modal')?.innerText || '', disabled: [...document.querySelectorAll('.event-modal .choose-item')].map((b) => b.classList.contains('disabled')) }));
check('the troll demands a toll', /TOLL/.test(st.text) && st.disabled.length === 4, st);
await shot('quests-event');
st = await ev(async () => {
  const s = window.__app.session;
  const gold0 = s.party.gold;
  [...document.querySelectorAll('.event-modal .choose-item')][0].click();
  await new Promise((r) => setTimeout(r, 200));
  const text = document.querySelector('.event-modal')?.innerText || '';
  document.querySelector('.event-modal .modal-buttons button')?.click();
  await new Promise((r) => setTimeout(r, 200));
  return { paid: gold0 - s.party.gold, text, gone: !s.map.entities.some((e) => e.id === 'ev_toll_troll'), mode: s.mode };
});
check('paying the toll costs 20 gold', st.paid === 20, st);
check('the troll leaves the bridge', st.gone && st.mode === 'explore', st);

// --- a fight from an event (bandits)
st = await ev(async () => {
  const s = window.__app.session;
  const b = s.map.entities.find((e) => e.id === 'ev_bandits');
  s.ui.openEvent(b);
  await new Promise((r) => setTimeout(r, 200));
  const items = [...document.querySelectorAll('.event-modal .choose-item')];
  items.find((x) => /Fight/.test(x.textContent)).click();
  await new Promise((r) => setTimeout(r, 200));
  document.querySelector('.event-modal .modal-buttons button')?.click();
  for (let i = 0; i < 100 && !s.battle; i++) await new Promise((r) => setTimeout(r, 30));
  const fought = !!s.battle;
  for (let i = 0; i < 300 && s.battle; i++) {
    const bt = s.battle;
    if (bt.active && !bt.acting && bt.active.side === 'party') { for (const u of bt.enemies) u.dead = true; bt.actPass(); }
    await new Promise((r) => setTimeout(r, 50));
  }
  for (let i = 0; i < 200 && (s.mode !== 'explore' || s.map.entities.some((e) => e.id === 'ev_bandits')); i++) await new Promise((r) => setTimeout(r, 50));
  return { fought, gone: !s.map.entities.some((e) => e.id === 'ev_bandits'), mode: s.mode };
});
check('an event can start a fight', st.fought, st);
check('beaten bandits are gone for good', st.gone && st.mode === 'explore', st);

// --- a lore stone: recorded in the journal, pays out once, sets its verse flag
st = await ev(async () => {
  const s = window.__app.session;
  const stone = s.map.entities.find((e) => e.id === 'ev_verse_1');
  const read = async () => {
    s.ui.openEvent(stone);
    await new Promise((r) => setTimeout(r, 150));
    document.querySelector('.event-modal .choose-item').click();
    await new Promise((r) => setTimeout(r, 150));
    document.querySelector('.event-modal .modal-buttons button').click();
    await new Promise((r) => setTimeout(r, 150));
  };
  const xp0 = s.party.members[0].xp;
  await read();
  const xp1 = s.party.members[0].xp;
  await read();
  return { first: xp1 - xp0, again: s.party.members[0].xp - xp1, flag: !!s.party.flags.verse_1, lore: s.state.lore.filter((l) => l.id === 'ev_verse_1').length, still: s.map.entities.includes(stone) };
});
check('lore stone: xp once, flag set, one journal entry, stays put', st.first === 20 && st.again === 0 && st.flag && st.lore === 1 && st.still, st);

// --- quest pins on the map
st = await ev(() => { const s = window.__app.session; return window.__quests.questPins(s).map((p) => p.quest.id); });
check('quest pins point to goals', st.includes('q_main'), st);

// --- the full main quest line resolves to victory
st = await ev(async () => {
  const s = window.__app.session;
  const Q = window.__quests;
  const log = [];
  const durgan = Q.findNpc(s.game, 'npc_durgan').npc;
  const aldric = Q.findNpc(s.game, 'npc_aldric').npc;
  Q.onTalk(s, aldric); log.push(s.state.quests.q_main.stage);
  Q.onTalk(s, durgan); log.push(s.state.quests.q_main.stage);
  const barrow = s.game.maps.find((m) => m.name === 'Grimholt Barrow');
  s.mapState(barrow.id); Q.checkQuests(s); log.push(s.state.quests.q_main.stage);
  s.onMonsterKilled('hollow_king'); Q.checkQuests(s); log.push(s.state.quests.q_main.stage);
  s.party.inventory.rune_key = 1; Q.checkQuests(s); log.push(s.state.quests.q_main.stage);
  Q.onTalk(s, durgan); log.push(s.state.quests.q_main.stage);
  const fort = s.game.maps.find((m) => m.name === 'Dol Garoth');
  s.mapState(fort.id); Q.checkQuests(s); log.push(s.state.quests.q_main.stage);
  return { log, runeblade: s.party.inventory.runeblade || 0, seal: s.party.inventory.kings_seal || 0 };
});
check('main quest walks through its stages', JSON.stringify(st.log) === '[2,3,4,5,6,7,8]', st);
check('Durgan takes the seal and gives the Runeblade', st.runeblade === 1 && st.seal === 0, st);

// --- deliver quests and quest-keeping companions
st = await ev(async () => {
  const s = window.__app.session;
  const Q = window.__quests;
  Q.startQuest(s, 'q_chart');
  const letter = s.party.inventory.merek_letter || 0;
  const fen = Q.findNpc(s.game, 'npc_fennick');
  const err = s.map.id === fen.map.id ? null : 'elsewhere';
  Q.onTalk(s, fen.npc);
  return { letter, stage: s.state.quests.q_chart.stage, chart: s.party.inventory.star_chart || 0, needs: Q.questNeeding(s, 'npc_merek')?.id, err };
});
check('quest gives its starting item', st.letter === 1, st);
check('delivering the letter yields the chart', st.stage === 1 && st.chart === 1, st);
check('the sage is still needed for the quest', st.needs === 'q_chart', st);

// --- an old save (no quest log) still loads
st = await ev(async () => {
  const app = window.__app;
  const s = app.session;
  const old = JSON.parse(JSON.stringify(s.state));
  delete old.quests; delete old.kills; delete old.lore; delete old.poi; delete old.blessings; delete old.tracked; delete old.questsBegun;
  app.stopSession();
  app.playGame(app.sample, { state: old, noSave: true });
  await new Promise((r) => setTimeout(r, 2500));
  const n = app.session;
  return { ok: !!n.state.quests, main: n.state.quests.q_main?.status, mode: n.mode, tracker: !!document.querySelector('.qtrack') };
});
check('old saves load and gain a quest log', st.ok && st.main === 'active' && st.tracker, st);

// --- old game files (no quests) migrate
st = await ev(() => {
  const { deserializeGame, serializeGame } = window.__schema;
  const g = JSON.parse(serializeGame(window.__app.sample));
  delete g.quests;
  const back = deserializeGame(g);
  return Array.isArray(back.quests) && back.quests.length === 0;
});
check('old game files gain an empty quest list', st);

// --- the editor: quests tab and event placement
st = await ev(async () => {
  const app = window.__app;
  app.stopSession();
  const g = window.__schema.cloneGame(app.sample);
  app.openEditor(g);
  await new Promise((r) => setTimeout(r, 1200));
  const ed = app.editor;
  ed.setTab('quests');
  await new Promise((r) => setTimeout(r, 300));
  const list = [...document.querySelectorAll('.entry')].map((b) => b.textContent);
  return { list, form: !!document.querySelector('.ed-main .form') };
});
check('editor lists the quests', st.list.some((t) => /Shadow in the East/.test(t)) && st.form, st.list.slice(0, 4));
await shot('quests-editor');
st = await ev(async () => {
  const ed = window.__app.editor;
  const n0 = ed.game.quests.length;
  [...document.querySelectorAll('.ed-left button')].find((b) => /New/.test(b.textContent)).click();
  await new Promise((r) => setTimeout(r, 200));
  const q = ed.game.quests[ed.game.quests.length - 1];
  return { added: ed.game.quests.length === n0 + 1, stages: q.stages.length, id: q.id };
});
check('editor creates a quest with a first step', st.added && st.stages >= 1, st);
st = await ev(async () => {
  const ed = window.__app.editor;
  ed.setTab('map');
  await new Promise((r) => setTimeout(r, 400));
  const tool = ed.tools.event;
  const n0 = ed.map.entities.length;
  const map = ed.map;
  let spot = null;
  for (let y = 5; y < map.h - 5 && !spot; y++) for (let x = 5; x < map.w - 5 && !spot; x++) if (!map.entities.some((e) => e.x === x && e.y === y)) spot = { x, y };
  tool.down(ed, spot, { detail: 1 });
  await new Promise((r) => setTimeout(r, 200));
  const e = ed.map.entities[ed.map.entities.length - 1];
  return { added: ed.map.entities.length === n0 + 1, type: e.type, choices: (e.choices || []).length, insp: document.querySelector(".ed-right")?.innerText.slice(0, 3000) };
});
check('editor places an event with choices', st.added && st.type === 'event' && st.choices > 0, st);
check('event inspector shows its choices', /Choices/.test(st.insp), st.insp);
await shot('quests-editor-event');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
if (fails.length || errors.length) { console.log(`${fails.length} check(s) failed`); process.exit(1); }
console.log('all quest checks passed');
