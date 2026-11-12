// The company as people: a lone hero (made at creation, playing a battle,
// a battleground and the victory screen alone), the gentle start, companions'
// banter in the log (once, and never in a flood), a companion who leaves on a
// flag (their kit kept, the company's returned, met again elsewhere) and one
// who turns on the company, a mystery (clues found, a wrong accusation, a
// right one), the Construction Set's Rules, companion and Mysteries forms,
// the checklist's checks, and old games brought up to date.
// Usage: node tests/company.mjs [shots-dir]
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
const closeModals = () => ev(async () => { for (let i = 0; i < 8 && document.querySelector('.modal-back'); i++) { document.querySelector('.modal-back .modal-x, .modal-back .modal-buttons button')?.click(); await new Promise((r) => setTimeout(r, 150)); } });
const calm = () => until(() => { const s = window.__app.session; return s && s.mode === 'explore' && !s.transitioning && !s.battle; });
// win the battle under way: every foe falls, then the heroes pass until it ends
const winBattle = () => ev(async () => {
  const s = window.__app.session;
  for (let i = 0; i < 80 && !s.battle?.active; i++) await new Promise((r) => setTimeout(r, 100));
  const b = s.battle;
  if (!b) return 'no battle';
  for (const e of b.enemies) if (b.alive(e)) await b.kill(e);
  for (let i = 0; i < 100 && s.battle; i++) { if (b.active && !b.acting) b.actPass(); await new Promise((r) => setTimeout(r, 100)); }
  return 'won';
});

// ---------------------------------------------------------------- a lone hero at creation
await ev(() => {
  const app = window.__app;
  const g = window.__schema.cloneGame(app.sample);
  g.settings.startHeroes = 1;
  window.__lone = g;
  app.playGame(g, { noSave: true });
});
check('party creation opens', await until(() => !!document.querySelector('.create .ch-title')));
await wait(1500);
let r = await ev(() => ({
  title: document.querySelector('.ch-title')?.textContent,
  card: !!document.querySelector('.lone-card'), rows: document.querySelectorAll('.roster-row').length,
  add: !!document.querySelector('.add-hero'), random: document.querySelector('.random-co b')?.textContent,
  pic: !!document.querySelector('.lone-card img')?.src, steps: document.querySelector('.ch-steps')?.textContent,
}));
check('one hero: “Create Your Hero”, one large card, no list, no “Add a hero”', r.title === 'Create Your Hero' && r.card && r.rows === 0 && !r.add, r);
check('the random button makes a random hero', r.random === 'A random hero', r);
await shot('company-01-lone-creation');
await ev(() => document.querySelector('.random-co').click());
await wait(800);
r = await ev(() => ({ name: document.querySelector('.lone-name')?.textContent, card: !!document.querySelector('.lone-card') }));
check('a random hero is still one hero', r.card && !!r.name, r);
await ev(() => document.querySelector('.begin').click());
await until(() => !!document.querySelector('.intro-modal'));
await ev(() => document.querySelector('.intro-modal .modal-buttons button')?.click());
check('the adventure begins with one hero', await calm() && await ev(() => window.__app.session.party.members.length === 1));
await wait(600);
await closeModals();
await shot('company-02-lone-company-panel');
r = await ev(() => ({ cards: document.querySelectorAll('.pcard').length, lead: !!document.querySelector('.pcard.leader') }));
check('the Company panel shows the lone hero as leader', r.cards === 1 && r.lead, r);

// ---------------------------------------------------------------- the gentle start
r = await ev(() => {
  const s = window.__app.session, C = window.__company;
  s.state.company = {};
  const shares = [C.gentleBand(s), C.gentleBand(s), C.gentleBand(s), C.gentleBand(s)];
  const gentle = s.enemiesFor({ monster: 'goblin', count: '4', gentle: 0.25 });
  const usual = s.enemiesFor({ monster: 'goblin', count: '4' });
  return { shares, gentle, usual };
});
check('a lone hero’s first three wandering bands are a quarter of the size', r.shares[0] === 0.25 && r.shares[2] === 0.25 && r.shares[3] === 1, r.shares);
check('a gentle band of four goblins is one, without escort', r.gentle.length === 1 && r.gentle[0].n === 1 && r.usual[0].n === 4, r);

// ---------------------------------------------------------------- a battle won alone
await ev(() => { const s = window.__app.session; s.map.encounterRate = 0; s.engage({ id: 'solo_t', monster: 'giant_rat', count: '2', roaming: true }); });
await until(() => !!window.__app.session.battle?.active);
await wait(1200);
await shot('company-03-lone-battle');
r = await ev(() => { const b = window.__app.session.battle; return { heroes: b.partyUnits.length, foes: b.enemies.length }; });
check('a lone hero fights a battle alone', r.heroes === 1 && r.foes === 2, r);
await winBattle();
check('the victory screen shows', await until(() => !!document.querySelector('.victory-modal'), 8000));
await wait(500);
await shot('company-04-lone-victory');
r = await ev(() => ({ rows: document.querySelectorAll('.victory-modal .vh-head').length, xp: window.__app.session.party.members[0].xp }));
check('the victory screen has one hero, who gained experience', r.rows === 1 && r.xp > 0, r);
await closeModals();
await calm();

// ---------------------------------------------------------------- a battleground alone
r = await ev(async () => {
  const s = window.__app.session, g = s.game;
  const dm = g.maps.find((m) => m.type === 'dungeon' && window.__delve?.isBattleground?.(m)) || g.maps.find((m) => m.type === 'dungeon');
  await s.enterMap(dm.id, dm.entry.x, dm.entry.y);
  await new Promise((res) => setTimeout(res, 800));
  return { name: dm.name, dv: !!s.dv, bar: document.querySelector('.dv-bar, .delve-bar')?.innerText || '' };
});
await closeModals();
await wait(400);
await shot('company-05-lone-battleground');
check('a lone hero walks a battleground', r.dv, r);
r = await ev(() => ({ bar: [...document.querySelectorAll('.hud-delve, .dv-bar, .delve-bar')].map((e) => e.offsetParent ? e.innerText : '').join('|') }));
console.log('     delve bar:', JSON.stringify(r.bar));
await ev(() => window.__app.endPlay(false));
await wait(800);

// ---------------------------------------------------------------- companions
// the sample with startHeroes 1, and two of its people given words and partings
await ev(() => {
  const app = window.__app;
  const g = window.__schema.cloneGame(app.sample);
  g.settings.startHeroes = 1;
  const Q = window.__quests;
  const borin = Q.findNpc(g, 'npc_borin');
  const elwen = Q.findNpc(g, 'npc_elwen');
  window.__borinMap = borin.map.id;
  borin.npc.recruit.banter = [
    { text: 'Ale and a fire. Westhold knows how to keep a dwarf happy.', map: borin.map.id, once: true },
    { text: 'A letter? From the Hold? Give it here.', need: 'saw_letter', once: true },
    { text: 'Hm. Another letter. I like this less and less.', need: 'second_letter' },
  ];
  borin.npc.recruit.leaves = { need: 'borin_called_home', text: 'The Hold calls, and I must answer. Keep my seat warm by the fire.', goTo: { map: borin.map.id, x: borin.npc.x, y: borin.npc.y } };
  elwen.npc.recruit.leaves = { need: 'elwen_turns', text: 'Did you never wonder why the shadow always knew your road? Fools.', hostile: { monster: 'bandit', count: '2' } };
  app.playGame(g, { quick: true, noSave: true });
});
await calm();
await wait(400);
r = await ev(async () => {
  const s = window.__app.session, g = s.game, Q = window.__quests;
  const m = g.maps.find((x) => x.id === window.__borinMap);
  const b = Q.findNpc(g, 'npc_borin').npc;
  await s.enterMap(m.id, b.x, b.y + 1);
  await new Promise((res) => setTimeout(res, 600));
  const live = s.map.entities.find((e) => e.id === 'npc_borin');
  // the company gives him something better than his own kit
  s.party.inventory.lucky_acorn = 1;
  const err = s.recruit(live);
  const borin = s.party.members.find((x) => x.fromNpc === 'npc_borin');
  window.__charms.equipItem(g, borin, g.items.find((i) => i.id === 'lucky_acorn'), s.party.inventory);
  return { err, members: s.party.members.length, own: borin?.ownKit, charm: borin?.equip.charm };
});
check('Borin joins, his own kit noted', !r.err && r.members === 2 && r.own?.includes('battle_axe') && r.charm === 'lucky_acorn', r);
// entering his own town again: the line for this place
r = await ev(async () => {
  const s = window.__app.session;
  s.state.company.lastBanter = -999;
  await s.enterMap(s.map.id, s.state.pos.x, s.state.pos.y, { instant: true });
  await new Promise((res) => setTimeout(res, 300));
  return [...document.querySelectorAll('.hud-log .log-line.banter')].map((e) => ({ text: e.textContent, pic: !!e.querySelector('img.log-pic')?.src }));
});
check('banter on entering a place: in the log with his portrait and name', r.length === 1 && /Borin/.test(r[0].text) && /Ale and a fire/.test(r[0].text) && r[0].pic, r);
r = await ev(async () => {
  const s = window.__app.session;
  s.state.turn += 40;
  s.party.flags.saw_letter = true;
  s.party.flags.second_letter = true; // (two at once: only one line now)
  s.companyTick();
  const n1 = document.querySelectorAll('.hud-log .log-line.banter').length;
  s.companyTick();
  const n2 = document.querySelectorAll('.hud-log .log-line.banter').length;
  s.state.turn += 40;
  s.companyTick();
  const n3 = document.querySelectorAll('.hud-log .log-line.banter').length;
  // a "once" line never again, even when its flag comes back
  delete s.party.flags.saw_letter; s.companyTick(); s.party.flags.saw_letter = true;
  s.state.turn += 400; s.companyTick();
  const lines = [...document.querySelectorAll('.hud-log .log-line.banter')].map((e) => e.textContent);
  return { n1, n2, n3, lines };
});
check('a flag that comes true brings its line', r.n1 === 2 && /A letter\?/.test(r.lines[1]), r);
check('never two lines in a row: the second waits its turn', r.n2 === 2 && r.n3 === 3, r);
check('a “once” line is said once', r.lines.filter((t) => /A letter\?/.test(t)).length === 1, r.lines);
await shot('company-06-banter-in-the-log');

// Borin goes home on a flag: his own axe goes with him, the company's charm comes back
r = await ev(async () => {
  const s = window.__app.session;
  s.state.turn += 40;
  s.party.flags.borin_called_home = true;
  s.companyTick();
  await new Promise((res) => setTimeout(res, 300));
  const live = s.map.entities.find((e) => e.id === 'npc_borin');
  const said = window.__app.session.say(live || { id: 'npc_borin', keywords: [] }, 'JOIN');
  return {
    members: s.party.members.map((m) => m.name), charm: s.party.inventory.lucky_acorn || 0, axe: s.party.inventory.battle_axe || 0,
    flag: !!s.party.flags.left_borin || !!s.party.flags.left_npc_borin, live: !!live, join: said.text,
    log: [...document.querySelectorAll('.hud-log .log-line')].slice(-3).map((e) => e.textContent),
  };
});
check('a companion leaves the company when the flag is set', r.members.length === 1 && r.flag, r);
check('the company’s charm comes back to the pack; his own axe goes with him', r.charm === 1 && r.axe === 0, r);
check('he stands where he went, but will not JOIN again', r.live && /parted/i.test(r.join), r);
check('a parting line in the log', r.log.some((t) => /Hold calls/.test(t)) && r.log.some((t) => /leaves the company/.test(t)), r.log);
await wait(300);
await shot('company-07-parting');
await closeModals();

// Elwen joins, then turns on the company: a fight against her and her escort
r = await ev(async () => {
  const s = window.__app.session, g = s.game, Q = window.__quests;
  const f = Q.findNpc(g, 'npc_elwen');
  s.recruit({ ...JSON.parse(JSON.stringify(f.npc)), mapId: f.map.id });
  const was = s.party.members.length;
  s.state.turn += 40;
  s.party.flags.elwen_turns = true;
  s.companyTick();
  for (let i = 0; i < 60 && !s.battle?.active; i++) await new Promise((res) => setTimeout(res, 100));
  const b = s.battle;
  return { was, now: s.party.members.length, battle: !!b, names: b ? b.enemies.map((e) => e.name) : [], heroes: b ? b.partyUnits.map((u) => u.name) : [] };
});
check('a turncoat leaves and turns on the company', r.was === 2 && r.now === 1 && r.battle, r);
check('she fights under her own name, with her escort', r.names.includes('Elwen') && r.names.length >= 2 && !r.heroes.includes('Elwen'), r);
await wait(1000);
await shot('company-08-turncoat-battle');
await winBattle();
await until(() => !!document.querySelector('.victory-modal'), 8000);
await closeModals();
await calm();
r = await ev(() => ({ defeated: !!window.__app.session.party.flags.defeated_npc_elwen, left: !!window.__app.session.party.flags.left_npc_elwen }));
check('beating the turncoat sets defeated_<id> (and left_<id>)', r.defeated && r.left, r);
// a conversation's leave_party, and an event's leave
r = await ev(() => {
  const s = window.__app.session, g = s.game, Q = window.__quests;
  const f = Q.findNpc(g, 'npc_milo');
  s.recruit({ ...JSON.parse(JSON.stringify(f.npc)), mapId: f.map.id });
  const before = s.party.members.length;
  const res = {};
  const ok = s.runAction({ id: 'npc_somebody', name: 'Somebody' }, { type: 'leave_party', value: 'npc_milo' }, res);
  const after = s.party.members.length;
  const f2 = Q.findNpc(g, 'npc_fennick');
  s.recruit({ ...JSON.parse(JSON.stringify(f2.npc)), mapId: f2.map.id });
  const fx = window.__events.applyEffects(s, { id: 'ev_t', x: 0, y: 0 }, { leave: 'npc_fennick' });
  return { before, after, ok, last: s.party.members.length, got: fx.got };
});
check('a conversation’s “leave_party” sends a companion away', r.before === 2 && r.after === 1 && r.ok, r);
check('an event’s “leave” does too', r.last === 1 && r.got.some((t) => /leaves/.test(t)), r);
await ev(() => window.__app.endPlay(false));
await wait(800);

// ---------------------------------------------------------------- a mystery
await ev(() => {
  const app = window.__app;
  const g = window.__schema.cloneGame(app.sample);
  const Q = window.__quests;
  const town = Q.findNpc(g, 'npc_hilda').map;
  window.__townId = town.id;
  g.mysteries = [{
    id: 'my_ledger', name: 'The Missing Ledger', intro: 'The town’s tax ledger has vanished from the Mayor’s strongbox, and with it a purse of silver. Someone in Westhold knows more than they say.',
    suspects: ['npc_osric', 'npc_wynn', 'npc_borin'], culprit: 'npc_osric', need: 2, judge: 'npc_hilda',
    clues: [
      { flag: 'clue_ink', text: 'Ink on the strongbox lid — the blue-black kind sold only at the harbour.' },
      { flag: 'clue_net', text: 'A torn scrap of fishing net caught on the window latch.' },
      { flag: 'clue_coin', text: 'Fresh silver spent at the tavern by someone who never has any.' },
    ],
    right: { text: 'Osric! Of all people. Guards — take him. Thou hast my thanks, and the town’s.', flag: 'ledger_solved', reward: { gold: 120, xp: 60 } },
    wrong: { text: 'That is an honest soul, and thou hast shamed them before the whole town. Bring me better proof.', flag: 'ledger_wrong', effects: { loseGold: 10 } },
  }];
  app.playGame(g, { quick: true, noSave: true });
});
await calm();
await wait(300);
r = await ev(async () => {
  const s = window.__app.session, Q = window.__quests;
  const h = Q.findNpc(s.game, 'npc_hilda').npc;
  await s.enterMap(window.__townId, h.x, h.y + 1);
  await new Promise((res) => setTimeout(res, 500));
  s.party.flags.clue_ink = true;
  Q.checkQuests(s);
  await new Promise((res) => setTimeout(res, 200));
  return {
    toast: document.querySelector('.toast.clue')?.textContent || '', log: [...document.querySelectorAll('.hud-log .log-line')].slice(-2).map((e) => e.textContent),
    found: s.state.mysteries?.my_ledger?.found,
  };
});
check('a clue found: a “Clue found” toast and a log line', /Clue found/.test(r.toast) && r.log.some((t) => /Clue found/.test(t)) && r.found?.includes('clue_ink'), r);
await shot('company-09-clue-toast');
// the judge will not hear an accusation on one clue
r = await ev(() => {
  const s = window.__app.session;
  const h = s.map.entities.find((e) => e.id === 'npc_hilda');
  return s.say(h, 'ACCUSE');
});
check('ACCUSE to the judge on one clue: “bring me more”', /more/.test(r.text) && !r.accuse, r);
// the journal's Mysteries page
await ev(() => { const s = window.__app.session; s.party.flags.clue_net = true; window.__quests.checkQuests(s); });
await wait(300);
await ev(() => { window.__app.playUI.quests.openJournal('mysteries'); });
await wait(1200);
r = await ev(() => ({
  tab: document.querySelector('.j-tab-myst.on')?.textContent, name: document.querySelector('.j-mystery h3')?.textContent,
  suspects: document.querySelectorAll('.j-mystery .my-suspect').length, pics: [...document.querySelectorAll('.j-mystery .my-suspect img')].filter((i) => i.src).length,
  clues: [...document.querySelectorAll('.j-mystery .my-clues li')].map((e) => e.textContent), btn: document.querySelector('.my-accuse button')?.disabled,
}));
check('the Mysteries page: name, suspects with portraits, the clues found', /Missing Ledger/.test(r.name) && r.suspects === 3 && r.pics === 3 && r.clues.length === 2, r);
check('the Accuse button works by the judge', r.btn === false, r);
await shot('company-10-mysteries-page');
// accuse from the page: the picker
await ev(() => document.querySelector('.my-accuse button').click());
await wait(600);
r = await ev(() => ({ cards: document.querySelectorAll('.accuse-modal .acc-card').length, pics: [...document.querySelectorAll('.accuse-modal .acc-card img')].filter((i) => i.src).length }));
check('the accusation picker shows the suspects with portraits', r.cards === 3 && r.pics === 3, r);
await ev(() => document.querySelectorAll('.accuse-modal .acc-card')[1].click());
await wait(200);
await shot('company-11-accusation-picker');
const gold0 = await ev(() => window.__app.session.party.gold);
await ev(() => [...document.querySelectorAll('.accuse-modal .modal-buttons button')].find((b) => /Accuse/.test(b.textContent)).click());
await wait(600);
r = await ev(() => {
  const s = window.__app.session, C = window.__company;
  return { title: [...document.querySelectorAll('.modal-title')].pop()?.textContent, gold: s.party.gold, flag: !!s.party.flags.ledger_wrong, can: C.canAccuse(s, s.game.mysteries[0]) };
});
check('a wrong accusation: its words, its price, its flag', /false accusation/i.test(r.title) && r.gold === gold0 - 10 && r.flag, { ...r, gold0 });
check('no second try until a new clue', r.can.ok === false && r.can.reason === 'again', r.can);
await shot('company-12-wrong-accusation');
await closeModals();
// a new clue, then the right name, in conversation with the judge
r = await ev(async () => {
  const s = window.__app.session, C = window.__company;
  s.party.flags.clue_coin = true;
  window.__quests.checkQuests(s);
  const can = C.canAccuse(s, s.game.mysteries[0]);
  const h = s.map.entities.find((e) => e.id === 'npc_hilda');
  s.ui.openDialog(h);
  await new Promise((res) => setTimeout(res, 400));
  const chips = [...document.querySelectorAll('.talk-chips .chip')].map((b) => b.textContent);
  [...document.querySelectorAll('.talk-chips .chip')].find((b) => b.textContent === 'ACCUSE')?.click();
  await new Promise((res) => setTimeout(res, 500));
  return { can: can.ok, chips, picker: !!document.querySelector('.accuse-modal') };
});
check('after a new clue the judge listens again; ACCUSE is offered in talk', r.can && r.chips.includes('ACCUSE') && r.picker, r);
const xp0 = await ev(() => window.__app.session.party.members[0].xp);
await ev(async () => {
  const cards = [...document.querySelectorAll('.accuse-modal .acc-card')];
  cards.find((c) => /Osric/.test(c.textContent)).click();
  await new Promise((res) => setTimeout(res, 100));
  [...document.querySelectorAll('.accuse-modal .modal-buttons button')].find((b) => /Accuse/.test(b.textContent)).click();
});
await wait(600);
r = await ev(() => {
  const s = window.__app.session;
  return { solved: s.state.mysteries.my_ledger.solved, flag: !!s.party.flags.ledger_solved, said: [...document.querySelectorAll('.talk-log .npc-say')].map((e) => e.textContent).slice(-1)[0], xp: s.party.members[0].xp };
});
check('the right name: solved, its flag set, its reward paid', r.solved === 'right' && r.flag && r.xp > xp0 && /Osric/.test(r.said || ''), r);
await shot('company-13-right-accusation');
await closeModals();
await ev(() => window.__app.playUI.quests.openJournal('mysteries'));
await wait(800);
r = await ev(() => ({ guilty: document.querySelector('.my-suspect.guilty b')?.textContent, done: document.querySelector('.j-mystery .j-done')?.textContent }));
check('the page marks the guilty one once solved', /Osric/.test(r.guilty || '') && !!r.done, r);
await shot('company-14-mystery-solved');
await closeModals();
await ev(() => window.__app.endPlay(false));
await wait(800);

// ---------------------------------------------------------------- the quick playtest party
r = await ev(() => {
  const g = window.__schema.cloneGame(window.__app.sample);
  const n0 = window.__app.quickPartyFor ? 0 : null;
  void n0;
  g.settings.startHeroes = 1;
  const a = window.__company.startHeroes(g);
  g.settings.startHeroes = 6;
  const b = window.__company.startHeroes(g);
  delete g.settings.startHeroes;
  const c = window.__company.startHeroes(g);
  return { a, b, c };
});
check('startHeroes: 1 is one, 6 is six, unset is four and the player chooses', r.a.n === 1 && r.a.fixed && r.b.n === 6 && r.c.n === 4 && !r.c.fixed, r);
await ev(() => { const g = window.__schema.cloneGame(window.__app.sample); g.settings.startHeroes = 1; window.__app.playGame(g, { quick: true, noSave: true }); });
await calm();
check('the quick playtest party honours it', await ev(() => window.__app.session.party.members.length === 1));
await ev(() => window.__app.endPlay(false));
await wait(800);

// ---------------------------------------------------------------- old games
r = await ev(() => {
  const S = window.__schema;
  const g = S.cloneGame(window.__app.sample);
  const data = JSON.parse(S.serializeGame(g));
  delete data.mysteries; delete data.settings.startHeroes;
  const old = S.deserializeGame(JSON.stringify(data));
  data.mysteries = [{ name: 'Half-made' }];
  data.settings.startHeroes = '0';
  const odd = S.deserializeGame(JSON.stringify(data));
  return { mys: old.mysteries, sh: old.settings.startHeroes ?? null, odd: odd.mysteries[0], oddSh: odd.settings.startHeroes ?? null };
});
check('an old game gains no mysteries and keeps the player’s choice of company', Array.isArray(r.mys) && !r.mys.length && r.sh === null, r);
check('a half-made mystery gets an id and empty lists', !!r.odd.id && Array.isArray(r.odd.suspects) && Array.isArray(r.odd.clues) && r.oddSh === null, r);

// ---------------------------------------------------------------- the Construction Set
await ev(() => {
  const app = window.__app;
  const g = window.__schema.cloneGame(app.sample);
  g.settings.maxParty = 3; g.settings.startHeroes = 4;
  g.mysteries = [{ id: 'my_bad', name: 'A Broken Case', suspects: ['npc_osric', 'npc_wynn'], culprit: 'npc_hilda', clues: [{ flag: 'nobody_sets_this', text: 'A clue nobody can find' }], right: { text: '' }, wrong: {} }];
  app.openEditor ? app.openEditor(g) : app.edit(g);
});
await until(() => !!document.querySelector('.editor'));
await wait(1500);
r = await ev(() => {
  const ed = window.__app.editor, C = window.__checklist || null;
  const f = (ed.allFindings || ed.findings || []).map((x) => x.text);
  return { f: f.filter((t) => /Mystery|heroes set out/.test(t)) };
});
console.log('     findings:', JSON.stringify(r.f));
check('checklist: no judge', r.f.some((t) => /Broken Case.*nobody judges/.test(t)), r.f);
check('checklist: the culprit is not among the suspects', r.f.some((t) => /culprit.*not among the suspects/.test(t)), r.f);
check('checklist: a clue flag nothing sets', r.f.some((t) => /nobody_sets_this.*nothing sets it/.test(t)), r.f);
check('checklist: more heroes set out than the company holds', r.f.some((t) => /4 heroes set out.*largest company is 3/.test(t)), r.f);
// the Rules step
await ev(() => window.__app.editor.setTab('rules'));
await wait(500);
r = await ev(() => {
  const lab = [...document.querySelectorAll('.field')].find((e) => /Heroes who set out/.test(e.textContent));
  const inp = lab?.querySelector('input');
  if (inp) { inp.value = '1'; inp.dispatchEvent(new Event('input')); }
  lab?.scrollIntoView();
  return { found: !!lab, gentle: [...document.querySelectorAll('.field')].some((e) => /Gentle first fights/.test(e.textContent)), val: window.__app.editor.game.settings.startHeroes };
});
check('the Rules step edits the heroes who set out (and the gentle start)', r.found && r.gentle && r.val === 1, r);
await shot('company-15-editor-rules');
// a companion's banter and leaving rule in the person inspector
r = await ev(async () => {
  const ed = window.__app.editor, Q = window.__quests;
  const f = Q.findNpc(ed.game, 'npc_borin');
  ed.goTo({ tab: 'map', map: f.map.id, entity: 'npc_borin' });
  await new Promise((res) => setTimeout(res, 800));
  const add = [...document.querySelectorAll('button')].find((b) => b.textContent === '+ Add a line');
  add?.click();
  await new Promise((res) => setTimeout(res, 200));
  const ta = [...document.querySelectorAll('.sublist textarea')].find((t) => t.placeholder.startsWith('Smell'));
  if (ta) { ta.value = 'Mind the stairs, they are older than me.'; ta.dispatchEvent(new Event('input')); }
  const cb = [...document.querySelectorAll('label.field.check')].find((l) => /May leave the company/.test(l.textContent))?.querySelector('input');
  cb?.click();
  await new Promise((res) => setTimeout(res, 200));
  const how = [...document.querySelectorAll('label.field')].find((l) => /^Then/.test(l.textContent.trim()) && l.querySelector('select option[value=hostile]'))?.querySelector('select');
  if (how) { how.value = 'hostile'; how.dispatchEvent(new Event('change')); }
  await new Promise((res) => setTimeout(res, 300));
  const need = [...document.querySelectorAll('label.field')].find((l) => /Leaves when/.test(l.textContent))?.querySelector('input');
  if (need) { need.value = 'borin_betrays'; need.dispatchEvent(new Event('input')); }
  const sec = [...document.querySelectorAll('.form-section')].find((e) => /On the road/.test(e.textContent));
  sec?.scrollIntoView();
  const npc = f.npc;
  return { banter: npc.recruit.banter, leaves: npc.recruit.leaves, list: need?.getAttribute('list'), dl: document.querySelectorAll('#cs-flags option').length };
});
check('the companion form edits banter lines', r.banter?.some((b) => /Mind the stairs/.test(b.text)), r);
check('the companion form edits the leaving rule (a turncoat)', r.leaves?.need === 'borin_betrays' && !!r.leaves?.hostile?.monster, r.leaves);
check('flag fields suggest the flags the realm uses', r.list === 'cs-flags' && r.dl > 5, r);
await wait(300);
await shot('company-16-editor-companion');
// the Story step's Mysteries editor
r = await ev(async () => {
  const ed = window.__app.editor;
  ed.setTab('story');
  await new Promise((res) => setTimeout(res, 400));
  const add = [...document.querySelectorAll('.st-mysthead button')][0];
  add?.click();
  await new Promise((res) => setTimeout(res, 400));
  const my = ed.game.mysteries[ed.game.mysteries.length - 1];
  const name = document.querySelector('.st-head h2')?.textContent;
  // fill it in as a designer would
  const field = (label) => [...document.querySelectorAll('.form .field')].find((l) => l.querySelector('.field-label')?.textContent === label);
  const nm = field('Name')?.querySelector('input'); nm.value = 'The Poisoned Cup'; nm.dispatchEvent(new Event('input'));
  const sus = field('Suspects');
  for (let i = 0; i < 3; i++) { [...sus.querySelectorAll('button')].pop().click(); await new Promise((res) => setTimeout(res, 60)); }
  const sus2 = field('Suspects');
  const sels = [...sus2.querySelectorAll('select')];
  const ids = ['npc_osric', 'npc_wynn', 'npc_borin'];
  sels.forEach((s, i) => { s.value = ids[i]; s.dispatchEvent(new Event('change')); });
  await new Promise((res) => setTimeout(res, 300));
  const cul = field('The guilty one')?.querySelector('select'); cul.value = 'npc_wynn'; cul.dispatchEvent(new Event('change'));
  await new Promise((res) => setTimeout(res, 300));
  const jd = field('Judge')?.querySelector('select'); jd.value = 'npc_hilda'; jd.dispatchEvent(new Event('change'));
  await new Promise((res) => setTimeout(res, 300));
  const clueAdd = [...document.querySelectorAll('button')].find((b) => b.textContent === '+ Add a clue');
  clueAdd.click(); await new Promise((res) => setTimeout(res, 100));
  const cf = [...document.querySelectorAll('.sublist input')].find((i) => i.placeholder === 'e.g. saw_muddy_boots');
  cf.value = 'q_wolf_done'; cf.dispatchEvent(new Event('input'));
  const ct = [...document.querySelectorAll('.sublist textarea')].find((t) => /Muddy boots/.test(t.placeholder));
  ct.value = 'Wynn’s crook, found by the poisoned well.'; ct.dispatchEvent(new Event('input'));
  await new Promise((res) => setTimeout(res, 200));
  return { name, my: JSON.parse(JSON.stringify(my)), left: [...document.querySelectorAll('.st-myst .entry')].map((e) => e.textContent), pics: document.querySelectorAll('.ed-suspects img').length, guilty: document.querySelector('.ed-suspects .guilty b')?.textContent };
});
check('the Story step adds a mystery and shows it', r.name === 'A New Mystery' && r.left.length === 2, r);
check('a mystery is edited: name, suspects, culprit, judge, a clue', r.my.name === 'The Poisoned Cup' && r.my.suspects.length === 3 && r.my.culprit === 'npc_wynn' && r.my.judge === 'npc_hilda' && r.my.clues[0]?.flag === 'q_wolf_done', r.my);
check('the editor shows the suspects with portraits, the guilty one marked', r.pics === 3 && r.guilty === 'Wynn', r);
await ev(() => document.querySelector('.ed-main, .editor-main, .main')?.scrollTo?.(0, 0));
await wait(300);
await shot('company-17-editor-mystery');
await ev(() => { const el = [...document.querySelectorAll('.form-section')].find((e) => /right name/.test(e.textContent)); el?.scrollIntoView(); });
await wait(200);
await shot('company-18-editor-mystery-outcomes');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails || errors.length ? 1 : 0);
