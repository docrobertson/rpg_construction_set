// The company as people: how many heroes set out, companions who talk on the
// road (banter) and who may one day leave — going home, or turning on the
// company — and mysteries: clues gathered as story flags, and an accusation
// made to a judge.
//
// Data (all optional, so older games need nothing):
//   settings.startHeroes   how many heroes party creation makes (missing: 4,
//                          and the player may take more or fewer as before)
//   settings.gentleStart   while the company is under four strong, its first
//                          this-many wandering bands come sized for it
//   npc.recruit.banter     [{ need?, map?, text, once? }]
//   npc.recruit.leaves     { need, text, hostile?: { monster, count } | false, goTo?: { map, x, y } }
//   game.mysteries         [{ id, name, intro, suspects, culprit, clues: [{ flag, text }],
//                             need?, judge, opens?, right: { text, flag, reward? },
//                             wrong: { text, flag?, effects?, final? } }]
// State: state.company = { said, armed, lastBanter, left, gentle }, state.mysteries.
import { byId } from '../data/schema.js';
import { deepClone } from '../core/util.js';
import { charLook, partyAlive, unequip } from './rules.js';
import { applyReward } from './quests.js';
import { applyEffects } from './events.js';

// turns between two lines of banter (from anyone), and before the same line again
export const BANTER_GAP = 18;
const BANTER_AGAIN = 300;
export const DEFAULT_START_HEROES = 4;
export const DEFAULT_CLUES_NEEDED = 2;

// ------------------------------------------------------------ needs
// A need is a string of flag names: 'a,b' all set, 'a|b' any set, '!a' not
// set; empty is always met. (The same rules as puzzles.js needMet.)
export function needMet(flags, need) {
  const s = String(need ?? '').trim();
  if (!s) return true;
  const one = (f) => { f = f.trim(); if (!f) return true; return f[0] === '!' ? !flags[f.slice(1).trim()] : !!flags[f]; };
  if (s.includes('|') && !s.includes(',')) return s.split('|').some(one);
  // 'a,b|c' reads as a AND (b OR c)
  return s.split(',').every((part) => (part.includes('|') ? part.split('|').some(one) : one(part)));
}

// the flag names a need mentions (for the checklist and the editor)
export const needFlags = (need) => String(need ?? '').split(/[,|]/).map((f) => f.trim().replace(/^!/, '').trim()).filter(Boolean);

// ------------------------------------------------------------ the start
// How many heroes set out (1..largest party); `fixed` when the designer chose
export function startHeroes(game) {
  const max = Math.max(1, Math.min(8, game.settings?.maxParty || 6));
  const n = parseInt(game.settings?.startHeroes, 10);
  return { n: Math.max(1, Math.min(max, n > 0 ? n : DEFAULT_START_HEROES)), fixed: n > 0, max };
}

// (gentle start) a new wandering band for a small company: is it one of the
// first few? Counts it if so. Returns the share of the usual numbers it brings.
export function gentleBand(session) {
  const n = parseInt(session.game.settings?.gentleStart ?? 3, 10) || 0;
  const heroes = partyAlive(session.party).length;
  if (n <= 0 || heroes >= 4) return 1;
  const c = companyState(session.state);
  if ((c.gentle || 0) >= n) return 1;
  c.gentle = (c.gentle || 0) + 1;
  return Math.max(0.25, heroes / 4);
}

// ------------------------------------------------------------ people
export function companyState(state) {
  const c = (state.company ||= {});
  c.said ||= {}; c.armed ||= {}; c.left ||= {};
  return c;
}

// the person (as the designer made them) and the map they stand on
export function findNpc(game, id) {
  if (!id) return null;
  for (const m of game.maps) for (const e of m.entities || []) if (e.type === 'npc' && e.id === id) return { npc: e, map: m };
  return null;
}

// companions who have something to say or a time to leave: members of the
// company (and those resting at an inn) who came from a person with words
function companions(session) {
  const out = [];
  const add = (m, resting) => {
    const f = m.fromNpc && findNpc(session.game, m.fromNpc);
    if (f?.npc.recruit) out.push({ m, npc: f.npc, r: f.npc.recruit, resting });
  };
  for (const m of session.party.members) add(m, false);
  for (const r of session.state.reserve || []) add(r.member, true);
  return out;
}

// Called whenever the story may have moved (quests.js checkQuests, a step, a
// new map). Clues are noted at once; banter and partings wait for a quiet
// moment (no battle, no window open), and the UI asks again when it comes.
export function companyTick(session, trigger = null) {
  if (!session.state || session._companyTicking) return;
  session._companyTicking = true;
  try {
    noteClues(session);
    if (trigger === 'map') session._mapBanter = true;
    const calm = session.mode === 'explore' && !session.battle && !session.transitioning && (session.ui?.calm?.() ?? true);
    if (!calm) { session.companyPending = true; return; }
    session.companyPending = false;
    if (session.turncoat) {
      const fight = session.turncoat;
      session.turncoat = null;
      if (!session.app || session.app.session === session) session.engage(fight);
      return;
    }
    const flags = session.party.flags;
    // partings first: a companion who is going says nothing else
    for (const c of companions(session)) {
      const lv = c.r.leaves;
      if (lv && lv.need && needMet(flags, lv.need) && !companyState(session.state).left[c.npc.id]) {
        if (leaveCompany(session, c.npc.id)) return;
      }
    }
    banter(session);
    session._mapBanter = false;
  } finally {
    session._companyTicking = false;
  }
}

function banter(session) {
  const st = session.state, c = companyState(st), flags = session.party.flags;
  const turn = st.turn || 0;
  const mapId = session.map?.id;
  let pick = null;
  for (const { m, npc, r, resting } of companions(session)) {
    (r.banter || []).forEach((b, i) => {
      if (!b || !String(b.text || '').trim()) return;
      const key = `${npc.id}#${i}`;
      const holds = !resting && m.status !== 'dead' && (!b.map || b.map === mapId) && needMet(flags, b.need);
      // a line is said once each time its moment comes: it waits (armed)
      // while its condition does not hold
      if (!holds) { if (!b.once || c.said[key] == null) c.armed[key] = true; return; }
      if (c.armed[key] === false) return;
      if (b.once && c.said[key] != null) return;
      if (!b.once && c.said[key] != null && turn - c.said[key] < BANTER_AGAIN) return;
      // a line for this place comes first, as the company arrives
      const score = (b.map ? 2 : 0) + (b.need ? 1 : 0);
      if (!pick || score > pick.score) pick = { m, b, key, score };
    });
  }
  if (!pick) return;
  if (c.lastBanter != null && turn - c.lastBanter < BANTER_GAP && !(session._mapBanter && pick.b.map && c.lastBanterTurnMap !== turn)) return;
  c.said[pick.key] = turn;
  c.armed[pick.key] = false;
  c.lastBanter = turn;
  if (pick.b.map) c.lastBanterTurnMap = turn;
  say(session, pick.m, pick.b.text);
}

const fill = (session, t) => String(t || '').replace(/\{leader\}/g, session.leader?.name || 'friend');

// a line in the log with the speaker's small portrait and name
export function say(session, member, text, cls = 'banter') {
  const t = fill(session, text);
  if (session.ui?.banter) session.ui.banter(member, t, cls);
  else session.log?.(`${member.name}: “${t}”`, 'say');
}

// ------------------------------------------------------------ partings
// A companion leaves the company (by the leaving rule, a conversation's
// leave_party or an event's leave). Their own kit goes with them; whatever
// the company gave them (a better sword, a charm) comes back to the pack.
// Then they may turn on the company (a fight against them and their
// escort), or turn up somewhere else as a person to talk to. Sets the flag
// left_<npcId>; beating a turncoat sets defeated_<npcId>. Returns true if
// they went.
export function leaveCompany(session, npcId, opts = {}) {
  const st = session.state, c = companyState(st), g = session.game;
  const f = findNpc(g, npcId);
  if (!f) return false;
  const lv = { ...(f.npc.recruit?.leaves || {}), ...opts };
  let m = session.party.members.find((x) => x.fromNpc === npcId);
  const resting = !m && (st.reserve || []).find((r) => r.member.fromNpc === npcId);
  if (resting) m = resting.member;
  if (!m) return false;
  // someone must carry on the quest: not while they are all that is left standing
  if (!resting && !session.party.members.some((x) => x !== m && x.status !== 'dead')) return false;
  c.left[npcId] = true;
  session.party.flags['left_' + npcId] = true;
  // the company's gear comes back; their own goes with them
  const own = (m.ownKit || []).slice();
  const back = [];
  for (const slot of Object.keys(m.equip || {})) {
    const id = m.equip[slot];
    if (!id) continue;
    const k = own.indexOf(id);
    if (k >= 0) { own.splice(k, 1); continue; }
    unequip(m, slot, session.party.inventory, g);
    back.push(byId(g.items, id)?.name || id);
  }
  if (resting) {
    st.reserve.splice(st.reserve.indexOf(resting), 1);
    const fig = session.map?.entities.find((e) => e.reserveOf === m.id);
    if (fig) { session.map.entities.splice(session.map.entities.indexOf(fig), 1); session.view?.removeEntity(fig.id); }
  } else session.party.members.splice(session.party.members.indexOf(m), 1);
  const hostile = lv.hostile && lv.hostile.monster && byId(g.monsters, lv.hostile.monster) ? lv.hostile : null;
  if (lv.text) say(session, m, lv.text, hostile ? 'betrayal' : 'parting');
  session.log(`${m.name} ${resting ? 'is gone from the inn' : 'leaves the company'}.${back.length ? ` What the company gave them is back in the pack: ${back.join(', ')}.` : ''}`, hostile ? 'bad' : 'warn');
  session.ui?.onParting?.(m, !!hostile);
  // reappearing somewhere else, as a person to talk to
  if (!hostile && lv.goTo && lv.goTo.map) placeAgain(session, f, lv.goTo);
  session.refreshPartyVisual?.();
  session.ui?.refresh();
  if (hostile && !resting) {
    const look = charLook(g, m);
    const fight = { id: '__turncoat_' + npcId, monster: hostile.monster, count: String(hostile.count || '1'), roaming: true, as: { name: m.name, look, boss: true }, flag: 'defeated_' + npcId };
    // the fight comes once the moment is quiet (a conversation or an event closed)
    session.turncoat = fight;
    setTimeout(() => session.companyTick?.(), 900);
  }
  session.autosave?.();
  return true;
}

// The one who left stands at goTo, the same person (their words, their
// quest parts) but no longer one to JOIN
function placeAgain(session, f, at) {
  const id = f.npc.id;
  const x = +at.x || 0, y = +at.y || 0;
  const target = at.map;
  if (target === f.map.id) {
    const ms = session.mapState(target);
    ms.removed = ms.removed.filter((r) => r !== id);
    ms.moved[id] = [x, y];
  } else {
    const ms = session.mapState(target);
    const e = { ...deepClone(f.npc), x, y };
    delete e.recruit;
    (ms.added ||= []).push(e);
  }
  // here and now: stand them on the live map
  if (session.map?.id === target && !session.map.entities.some((e) => e.id === id)) {
    const e = { ...deepClone(f.npc), x, y, home: { x, y } };
    delete e.recruit;
    session.map.entities.push(e);
    session.addVisual?.(e);
  }
}

// people who can join the company, for the editor's pickers: [[id, name]]
export function recruitables(game) {
  const out = [];
  for (const m of game.maps) for (const e of m.entities || []) if (e.type === 'npc' && e.recruit) out.push([e.id, `${e.name || 'someone'} (${m.name})`]);
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

// everyone in the realm, for the editor's pickers: [[id, 'name — place']]
export function peopleOptions(game) {
  const out = [];
  for (const m of game.maps) for (const e of m.entities || []) if (e.type === 'npc' && !e.reserveOf) out.push([e.id, `${e.name || 'someone'} — ${m.name}`]);
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

// a person who has left the company is not asked to JOIN again
export const hasLeft = (state, npcId) => !!state?.company?.left?.[npcId];

// ------------------------------------------------------------ mysteries
export const mysteriesOf = (game) => (Array.isArray(game.mysteries) ? game.mysteries : []);
export const mysteryById = (game, id) => mysteriesOf(game).find((m) => m.id === id) || null;
export const cluesNeeded = (my) => Math.max(0, Math.min((my.clues || []).length, parseInt(my.need, 10) >= 0 && my.need !== '' && my.need != null ? parseInt(my.need, 10) : DEFAULT_CLUES_NEEDED));

export function mysteryState(state, id) {
  const all = (state.mysteries ||= {});
  return (all[id] ||= { found: [], wrong: 0, wrongAt: -1, solved: null });
}

// new clues: noted (a toast and a log line) the moment their flag is set
function noteClues(session) {
  const st = session.state, flags = session.party.flags;
  const first = !st.mysteries;
  for (const my of mysteriesOf(session.game)) {
    const ms = mysteryState(st, my.id);
    for (const cl of my.clues || []) {
      if (!cl.flag || !flags[cl.flag] || ms.found.includes(cl.flag)) continue;
      ms.found.push(cl.flag);
      ms.known = true;
      // (a save from before mysteries, or a playtest begun later: no fanfare)
      if (!first) session.ui?.onClue?.(my, cl);
    }
    if (!ms.known && my.opens && needMet(flags, my.opens)) ms.known = true;
  }
}

// mysteries the company has stumbled on (a clue, or the story opened them)
export function knownMysteries(session) {
  return mysteriesOf(session.game).filter((my) => {
    const ms = mysteryState(session.state, my.id);
    return ms.known || ms.found.length || ms.solved;
  });
}

// May the company accuse now? { ok, why, left (clues still wanted) }
export function canAccuse(session, my) {
  const ms = mysteryState(session.state, my.id);
  if (ms.solved === 'right') return { ok: false, why: 'Solved.', solved: true };
  if (ms.solved === 'wrong') return { ok: false, why: 'The chance to name the guilty one has passed.', closed: true };
  const need = cluesNeeded(my);
  const found = ms.found.length;
  if (found < need) return { ok: false, reason: 'clues', left: need - found, why: `${need - found} more clue${need - found === 1 ? '' : 's'} needed before anyone will listen.` };
  // after a wrong accusation, the judge wants something new — unless every clue is already found
  if (ms.wrong && found <= ms.wrongAt && found < (my.clues || []).length) return { ok: false, reason: 'again', left: 1, why: 'After a false accusation, only a new clue will make the judge listen again.' };
  return { ok: true };
}

// the mystery whose judge this person is (one still open first)
export function mysteryOfJudge(session, npcId) {
  const list = mysteriesOf(session.game).filter((my) => my.judge && my.judge === npcId);
  return list.find((my) => !mysteryState(session.state, my.id).solved) || list[0] || null;
}

// The judge standing near the company now (for the journal's button)
export function judgeInReach(session, my) {
  const p = session.state.pos;
  const e = session.map?.entities.find((x) => x.type === 'npc' && x.id === my.judge);
  return !!e && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 2;
}

// Name the guilty one. Returns { right, text, got, fight? }
export function accuse(session, mysteryId, suspectId) {
  const my = mysteryById(session.game, mysteryId);
  if (!my) return { text: '', got: [] };
  const can = canAccuse(session, my);
  if (!can.ok) return { text: can.why, got: [], refused: true };
  const ms = mysteryState(session.state, my.id);
  const flags = session.party.flags;
  ms.accused = suspectId;
  if (suspectId === my.culprit) {
    ms.solved = 'right';
    const r = my.right || {};
    const got = applyReward(session, { ...(r.reward || {}), flag: r.flag });
    session.log(`Mystery solved — ${my.name}: ${findNpc(session.game, suspectId)?.npc.name || 'the guilty one'} is unmasked.`, 'quest');
    session.autosave?.();
    return { right: true, text: r.text || 'The truth is out at last.', got };
  }
  ms.wrong = (ms.wrong || 0) + 1;
  ms.wrongAt = ms.found.length;
  const w = my.wrong || {};
  if (w.flag) flags[w.flag] = true;
  const judge = findNpc(session.game, my.judge)?.npc || { id: my.id, x: session.state.pos.x, y: session.state.pos.y };
  const res = applyEffects(session, judge, w.effects || {});
  if (w.final) ms.solved = 'wrong';
  session.log(`A false accusation — ${my.name}.`, 'bad');
  const again = !w.final && canAccuse(session, my);
  session.autosave?.();
  return { right: false, text: w.text || 'The judge shakes their head. That is not the one.', got: res.got || [], fight: res.fight, again: again && again.ok, final: !!w.final };
}

// for the tests and the browser console
if (typeof window !== 'undefined') window.__company = { needMet, startHeroes, gentleBand, companyTick, leaveCompany, findNpc, mysteryState, canAccuse, accuse, knownMysteries, mysteryOfJudge, cluesNeeded, hasLeft, BANTER_GAP };
