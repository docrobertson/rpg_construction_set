// The story outline: chapters that group the quests of a realm.
//
//   game.story = { chapters: [{ id, name, summary, notes, cast: [{ npc, note }],
//                               ends: { type: 'quests' | 'stage' | 'flag', quest, stage, flag } }] }
//   quest.chapter = chapter id (quests without one belong to no chapter and
//                   are open at any time)
//
// How a chapter ends (ends.type):
//   'quests' — every quest of the chapter marked main is done (every quest, if
//              none is main). A quest carried on from an earlier chapter (see
//              questSpans) counts as one of its quests.
//   'stage'  — quest `quest` reaches step `stage`: 1-based, as the editor
//              numbers steps; one past the last step means "is finished".
//   'flag'   — the story flag `flag` is set.
// An end left half set (no quest, no flag) falls back to 'quests', so a
// player is never shut out of the rest of the story by a slip.
// Chapter 1 is open from the start; each later chapter opens when the one
// before it ends. Quests with a chapter are not offered, and do not start by
// themselves, until their chapter is open (game/quests.js: canOffer).
//
// In play, state.chapters = { chapterId: turn it opened } (older saves have
// none: it is worked out again, quietly, from where the company stands).
import { getTile, inBounds } from '../world/map.js';
import { terrain } from '../data/terrain.js';
import { uniqueId } from '../core/util.js';
import { shopStock } from './shops.js'; // (market) what a shop sells
// (quests.js imports this module too: only functions cross, so the cycle is safe)
import { ensureQuestState, startAutoQuests, checkQuests, onTalk, startQuest, canOffer, activeQuests, currentStage, isDone as questDone, questOf } from './quests.js';

export function chapterList(game) { return game.story?.chapters || []; }

export function chapterById(game, id) { return chapterList(game).find((c) => c.id === id) || null; }

// The chapter a quest belongs to, or null
export function chapterOfQuest(game, q) { return q?.chapter ? chapterById(game, q.chapter) : null; }

// The quests of a chapter, in the order they appear in game.quests
export function questsOfChapter(game, ch) { return (game.quests || []).filter((q) => q.chapter === ch.id); }

export function chapterIndex(game, id) { return chapterList(game).findIndex((c) => c.id === id); }

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out || 'I';
}

// "Chapter II" and "Chapter II — The Barrow King"
export function chapterLabel(game, ch) { return `Chapter ${roman(chapterIndex(game, ch.id) + 1)}`; }
export function chapterTitle(game, ch) { return `${chapterLabel(game, ch)}${ch.name ? ' — ' + ch.name : ''}`; }

// A new chapter (not yet added to the game)
export function newChapter(game, props = {}) {
  const n = chapterList(game).length + 1;
  const ch = { name: props.name || `Chapter ${roman(n)}`, summary: '', notes: '', cast: [], ends: { type: 'quests' }, ...props };
  ch.id = uniqueId('ch_' + (props.name || 'chapter_' + n), [...chapterList(game).map((c) => c.id), ...(game.quests || []).map((q) => q.id)]);
  return ch;
}

// ------------------------------------------------------------ spans
// Which steps of which quests each chapter holds. A quest begins in its own
// chapter and carries on into the next while a chapter ends at one of its
// steps (a long main quest broken into acts):
//   Map chapterId → [{ quest, from, to, cont }]   (steps from..to-1, 0-based;
//   cont: carried on from an earlier chapter)
export function questSpans(game) {
  const list = chapterList(game);
  const out = new Map(list.map((c) => [c.id, []]));
  const idx = new Map(list.map((c, i) => [c.id, i]));
  for (const q of game.quests || []) {
    let i = idx.get(q.chapter);
    if (i == null) continue;
    const n = (q.stages || []).length;
    let from = 0;
    for (let guard = 0; i < list.length && guard < list.length; guard++) {
      const e = list[i].ends || {};
      if (e.type === 'stage' && e.quest === q.id) {
        const to = Math.max(from, Math.min(n, (parseInt(e.stage, 10) || 1) - 1));
        out.get(list[i].id).push({ quest: q, from, to, cont: from > 0 || list[i].id !== q.chapter });
        if (to >= n) break;
        from = to;
        i++;
        continue;
      }
      out.get(list[i].id).push({ quest: q, from, to: n, cont: from > 0 || list[i].id !== q.chapter });
      break;
    }
  }
  // the quests carried on come first: they are the thread from before
  for (const arr of out.values()) arr.sort((a, b) => (b.cont ? 1 : 0) - (a.cont ? 1 : 0));
  return out;
}

// Every quest that runs in a chapter: its own and those carried on into it
export function questsInChapter(game, ch, spans = questSpans(game)) {
  return [...new Set((spans.get(ch.id) || []).map((s) => s.quest))];
}

// ------------------------------------------------------------ play
const isDone = (state, id) => state?.quests?.[id]?.status === 'done';

function questsEnded(game, state, ch, spans) {
  const qs = questsInChapter(game, ch, spans);
  const main = qs.filter((q) => q.main);
  return (main.length ? main : qs).every((q) => isDone(state, q.id));
}

// Has a chapter's end come about in this play state?
export function chapterEnded(game, state, ch, spans = null) {
  const e = ch.ends || {};
  if (e.type === 'stage') {
    const q = (game.quests || []).find((x) => x.id === e.quest);
    if (q) {
      const qs = state?.quests?.[q.id];
      if (!qs) return false;
      return qs.status === 'done' || qs.stage + 1 >= (parseInt(e.stage, 10) || 1);
    }
  } else if (e.type === 'flag' && String(e.flag || '').trim()) {
    return !!state?.party?.flags?.[String(e.flag).trim()];
  }
  return questsEnded(game, state, ch, spans || questSpans(game));
}

// The ids of the chapters open in a play state (the first always; then each
// whose chapter before it has ended, or that already opened)
export function openChapterIds(game, state) {
  const list = chapterList(game);
  const open = new Set();
  if (!list.length) return open;
  const seen = state?.chapters || {};
  let spans = null;
  open.add(list[0].id);
  for (let i = 1; i < list.length; i++) {
    if (seen[list[i].id] != null) { open.add(list[i].id); continue; }
    if (!open.has(list[i - 1].id)) break;
    if (!chapterEnded(game, state, list[i - 1], spans || (spans = questSpans(game)))) break;
    open.add(list[i].id);
  }
  return open;
}

export function isChapterOpen(game, state, id) { return openChapterIds(game, state).has(id); }

// May this quest be offered (or start by itself) yet, as far as chapters go?
export function questOpen(game, state, q) {
  const ch = chapterOfQuest(game, q);
  if (!ch) return true;
  if (state?.chapters?.[ch.id] != null || chapterList(game)[0] === ch) return true;
  return isChapterOpen(game, state, ch.id);
}

// The latest chapter open in play, or null
export function currentChapter(game, state) {
  const open = openChapterIds(game, state);
  let cur = null;
  for (const ch of chapterList(game)) if (open.has(ch.id)) cur = ch;
  return cur;
}

// The chapter a quest is in now: for a quest that spans chapters, the one
// holding the step it has reached
export function chapterOfQuestNow(game, state, q, spans = questSpans(game)) {
  const qs = state?.quests?.[q.id];
  const n = (q.stages || []).length;
  const at = qs ? (qs.status === 'done' ? Math.max(0, n - 1) : qs.stage || 0) : 0;
  let best = chapterOfQuest(game, q);
  for (const ch of chapterList(game)) {
    for (const sp of spans.get(ch.id) || []) if (sp.quest === q && sp.from <= at && (sp.to > sp.from || sp.from === 0)) best = ch;
  }
  return best;
}

// ------------------------------------------------------------ words
const qname = (q) => `“${q.name || q.id}”`;

// How a chapter ends, in plain words: "when “The Shadow in the East” reaches step 4: Find Grimholt Barrow"
export function describeEnds(game, ch) {
  const e = ch.ends || {};
  if (e.type === 'stage') {
    const q = (game.quests || []).find((x) => x.id === e.quest);
    if (q) {
      const n = parseInt(e.stage, 10) || 1;
      const st = q.stages?.[n - 1];
      return n > (q.stages || []).length ? `when ${qname(q)} is finished` : `when ${qname(q)} reaches step ${n}${st?.text ? ': ' + st.text : ''}`;
    }
  } else if (e.type === 'flag' && String(e.flag || '').trim()) {
    return `when the story flag “${String(e.flag).trim()}” is set`;
  }
  const qs = questsInChapter(game, ch);
  const main = qs.filter((q) => q.main);
  if (!qs.length) return 'at once — it has no quests yet';
  if (main.length) return main.length === 1 ? `when ${qname(main[0])} is done` : `when its ${main.length} main quests are done`;
  return qs.length === 1 ? `when ${qname(qs[0])} is done` : `when all ${qs.length} of its quests are done`;
}

// ------------------------------------------------------------ facts for the designer
// Where everything the story needs stands, worked out once for the Story view
// and the checks: people, placed monsters, where each item can be had, which
// ways in are barred by which item, and which maps a company can get to.
export function storyFacts(game) {
  const npcs = new Map();
  const monsters = new Map();
  const items = new Map();
  const gates = new Map();
  const fights = new Set();
  const joiners = new Set();
  const addItem = (id, src) => { if (!id) return; if (!items.has(id)) items.set(id, []); items.get(id).push(src); };
  for (const map of game.maps) {
    for (const e of map.entities || []) {
      if (e.type === 'npc') {
        npcs.set(e.id, { npc: e, map });
        if (e.recruit) joiners.add(e.id);
        for (const id of e.shop ? shopStock(game, e.shop) : []) addItem(id, { kind: 'shop', map, npc: e }); // (market) a theme's wares too
        for (const k of e.keywords || []) {
          if (k.action?.type === 'give_item') addItem(k.action.value, { kind: 'gift', map, npc: e });
          if (k.action?.type === 'join') joiners.add(e.id);
          if (k.action?.type === 'fight' && k.action.value) fights.add(k.action.value);
        }
        if (e.hostile) fights.add(e.hostile);
      } else if (e.type === 'monster') {
        if (!monsters.has(e.monster)) monsters.set(e.monster, []);
        monsters.get(e.monster).push({ map, ent: e });
        for (const it of e.loot || []) addItem(it.id, { kind: 'loot', map, ent: e, monster: e.monster });
      } else if (e.type === 'chest') {
        for (const it of e.items || []) addItem(it.id, { kind: 'chest', map, ent: e });
      } else if (e.type === 'treasure') {
        for (const it of e.items || []) addItem(it.id, { kind: 'hoard', map, ent: e });
      } else if (e.type === 'event') {
        for (const c of e.choices || []) {
          for (const it of c.effects?.items || []) addItem(it.id, { kind: 'event', map, ent: e });
          for (const it of c.win?.items || []) addItem(it.id, { kind: 'event', map, ent: e });
          if (c.effects?.fight) fights.add(c.effects.fight);
        }
      } else if (e.type === 'portal' && e.requires && e.target?.map && e.target.map !== 'exit') {
        if (!gates.has(e.target.map)) gates.set(e.target.map, []);
        gates.get(e.target.map).push({ portal: e, map, item: e.requires });
      }
    }
  }
  for (const q of game.quests || []) {
    for (const it of q.reward?.items || []) addItem(it.id, { kind: 'reward', quest: q });
    for (const it of q.startItems || []) addItem(it.id, { kind: 'start', quest: q });
    (q.stages || []).forEach((s, i) => { for (const it of s.reward?.items || []) addItem(it.id, { kind: 'reward', quest: q, step: i }); });
  }
  for (const it of game.settings?.startItems || []) addItem(it.id, { kind: 'kit' });
  const reach = mapReach(game);
  return { npcs, monsters, items, gates, fights, joiners, reach, standCache: new Map() };
}

// Which maps a company can get to from the start: open (no key needed) and
// behind a barred way (Map mapId → the item that opens the way)
export function mapReach(game) {
  const start = game.settings?.start?.map || game.maps[0]?.id;
  const byId = new Map(game.maps.map((m) => [m.id, m]));
  const walk = (useGates) => {
    const seen = new Set();
    const barred = new Map();
    const todo = start ? [start] : [];
    while (todo.length) {
      const id = todo.pop();
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      const m = byId.get(id);
      if (m.exit?.map && !seen.has(m.exit.map)) todo.push(m.exit.map);
      for (const e of m.entities || []) {
        if (e.type !== 'portal' || !e.target?.map || e.target.map === 'exit') continue;
        if (e.requires && !useGates) { if (!barred.has(e.target.map)) barred.set(e.target.map, e.requires); continue; }
        todo.push(e.target.map);
      }
      for (const e of m.entities || []) {
        for (const k of e.keywords || []) if (k.action?.type === 'teleport' && k.action.map) todo.push(k.action.map);
      }
    }
    return { seen, barred };
  };
  const open = walk(false);
  const all = walk(true);
  const behind = new Map();
  for (const id of all.seen) if (!open.seen.has(id)) behind.set(id, open.barred.get(id) || null);
  return { open: open.seen, all: all.seen, behind };
}

// Can a company walk up to a square of a map (to talk to whoever stands
// there)? From where the map is entered, through doors (locked ones too:
// keys can be had), and across counters.
export function canStandBy(facts, map, x, y) {
  if (!map || map.type === 'world') return true;
  let set = facts?.standCache?.get(map.id);
  if (!set) {
    set = new Uint8Array(map.w * map.h);
    const starts = [];
    if (map.entry) starts.push([map.entry.x, map.entry.y]);
    for (const e of map.entities || []) if (e.type === 'portal' && e.target?.map === 'exit') starts.push([e.x, e.y]);
    const pass = (t) => t.walk || t.door || t.locked;
    const stack = [];
    for (const [sx, sy] of starts) if (inBounds(map, sx, sy)) { set[sy * map.w + sx] = 1; stack.push([sx, sy]); }
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(map, nx, ny) || set[ny * map.w + nx]) continue;
        if (!pass(terrain(getTile(map, nx, ny)))) continue;
        set[ny * map.w + nx] = 1;
        stack.push([nx, ny]);
      }
    }
    facts?.standCache?.set(map.id, set);
  }
  const ok = (px, py) => inBounds(map, px, py) && !!set[py * map.w + px];
  if (ok(x, y)) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (ok(x + dx, y + dy)) return true;
    if (inBounds(map, x + dx, y + dy) && terrain(getTile(map, x + dx, y + dy)).talkOver && ok(x + 2 * dx, y + 2 * dy)) return true;
  }
  return false;
}

// ------------------------------------------------------------ a walk through the story
// Play the story through in the head, as a tireless company would: take what
// can be had where the company can go, accept every quest offered, and do
// each step whose person, place, foe or item can be reached. Uses the real
// quest rules (so chapters open, quests start and end as they would in play)
// but not the lie of the land: every place a way leads to counts as
// reachable, and a barred way opens once its key is in the pack. Ordinary
// monsters can always be met; a boss must stand somewhere (or come from an
// event or a word).
// Returns { ok, won, chapters: [ids opened], done: [quest ids], stuck: [{ quest, step, why }], mainLeft }
export function walkStory(game, opt = {}) {
  const facts = opt.facts || storyFacts(game);
  const start = game.settings?.start || { map: game.maps[0]?.id, x: 0, y: 0 };
  const inv = {};
  for (const it of game.settings?.startItems || []) inv[it.id] = (inv[it.id] || 0) + (it.n || 1);
  const state = {
    party: { members: [], inventory: inv, flags: {}, gold: game.settings?.startGold || 0, food: 99 },
    pos: { map: start.map, x: start.x, y: start.y }, maps: {}, turn: 0, quests: {},
  };
  ensureQuestState(state);
  state.questsBegun = true;
  const session = { game, state, map: null, ui: null, log() {}, autosave() {}, checkVictory() {} };
  const byMap = new Map(game.maps.map((m) => [m.id, m]));
  const holding = (id) => (inv[id] || 0) > 0;
  // the maps the company can get to now (barred ways open with their key)
  const reach = () => {
    const seen = new Set();
    const todo = [start.map];
    while (todo.length) {
      const id = todo.pop();
      if (seen.has(id) || !byMap.has(id)) continue;
      seen.add(id);
      const m = byMap.get(id);
      if (m.exit?.map) todo.push(m.exit.map);
      for (const e of m.entities || []) {
        if (e.type === 'portal' && e.target?.map && e.target.map !== 'exit' && (!e.requires || holding(e.requires))) todo.push(e.target.map);
        for (const k of e.keywords || []) if (k.action?.type === 'teleport' && k.action.map) todo.push(k.action.map);
      }
    }
    return seen;
  };
  const removed = new Set();
  const taken = new Set();
  const kill = (ent, map) => {
    if (removed.has(ent.id)) return;
    removed.add(ent.id);
    (state.maps[map.id] ||= { removed: [], tiles: {}, moved: {} }).removed.push(ent.id);
    state.party.flags['killed_' + ent.monster] = true;
    state.kills[ent.monster] = (state.kills[ent.monster] || 0) + 1;
    if (ent.flag) state.party.flags[ent.flag] = true;
    for (const it of ent.loot || []) inv[it.id] = (inv[it.id] || 0) + (it.n || 1);
  };
  const visit = (map) => {
    state.maps[map.id] ||= { removed: [], tiles: {}, moved: {} };
    state.pos = { map: map.id, x: map.entry?.x ?? 0, y: map.entry?.y ?? 0 };
  };
  const npcHere = (id, open) => {
    const f = facts.npcs.get(id);
    return f && open.has(f.map.id) && !removed.has(id) && canStandBy(facts, f.map, f.npc.x, f.npc.y) ? f : null;
  };
  startAutoQuests(session);
  for (let round = 0; round < 400; round++) {
    let moved = false;
    const open = reach();
    // pick up all that lies about where the company can go
    for (const map of game.maps) {
      if (!open.has(map.id)) continue;
      for (const e of map.entities || []) {
        if (taken.has(e.id)) continue;
        let got = null;
        if (e.type === 'chest' || e.type === 'treasure') got = e.items || [];
        else if (e.type === 'event') got = (e.choices || []).flatMap((c) => [...(c.effects?.items || []), ...(c.win?.items || [])]);
        else if (e.type === 'npc') got = [...(e.shop ? shopStock(game, e.shop) : []).map((id) => ({ id })), ...(e.keywords || []).filter((k) => k.action?.type === 'give_item').map((k) => ({ id: k.action.value }))];
        if (!got) continue;
        taken.add(e.id);
        for (const it of got) if (it?.id) inv[it.id] = (inv[it.id] || 0) + (it.n || 1);
        for (const c of e.choices || []) for (const f of [c.effects?.flag, c.win?.flag]) if (f) state.party.flags[String(f).replace(/\{id\}/g, e.id)] = true;
        for (const k of e.keywords || []) if (k.action?.type === 'set_flag' && k.action.value) state.party.flags[k.action.value] = true;
        moved = true;
      }
      // (adventure) levers, plates, braziers, riddles and runes set their flags (and groups theirs) where the company can go
      for (const e of map.entities || []) {
        if (!['lever', 'plate', 'brazier', 'riddle', 'rune'].includes(e.type)) continue;
        const f = e.type === 'rune' ? e.group : e.flag || e.id;
        for (const x of [f, e.type === 'brazier' && e.order ? e.group : null, e.reward?.flag]) if (x && !state.party.flags[x]) { state.party.flags[x] = true; moved = true; }
      }
    }
    // (adventure) a mystery is solved once enough of its clues are found (and the judge will listen)
    for (const my of game.mysteries || []) {
      const flags = state.party.flags;
      if (!my.right?.flag || flags[my.right.flag]) continue;
      const found = (my.clues || []).filter((c) => flags[c.flag]).length;
      const want = Math.min((my.clues || []).length, parseInt(my.need, 10) >= 0 ? parseInt(my.need, 10) : 2);
      const listens = !my.requires || String(my.requires).split(',').every((t) => (t.trim()[0] === '!' ? !flags[t.trim().slice(1)] : !!flags[t.trim()]));
      if (found >= want && listens) { flags[my.right.flag] = true; moved = true; }
    }
    // accept every quest on offer from someone the company can reach
    for (const q of game.quests || []) {
      if (q.auto || !q.giver || !canOffer(session, q) || !npcHere(q.giver, open)) continue;
      startQuest(session, q.id, { quiet: true });
      moved = true;
    }
    // and do the steps that can be done
    for (const q of activeQuests(session)) {
      const g = currentStage(session, q)?.goal || {};
      const was = state.quests[q.id].stage;
      if (g.type === 'talk' || g.type === 'deliver') {
        // (an item to hand over that a foe carries: go and take it first)
        if (g.type === 'deliver' && !holding(g.item)) for (const src of facts.items.get(g.item) || []) if (src.kind === 'loot' && open.has(src.map.id)) kill(src.ent, src.map);
        const f = npcHere(g.npc || q.giver, open);
        if (f) onTalk(session, f.npc);
      } else if (g.type === 'reach' || g.type === 'clear') {
        const map = byMap.get(g.map);
        if (map && open.has(map.id)) {
          visit(map);
          if (g.type === 'clear') for (const e of map.entities) if (e.type === 'monster') kill(e, map);
        }
      } else if (g.type === 'kill') {
        let found = false;
        for (const { map, ent } of facts.monsters.get(g.monster) || []) if (open.has(map.id) && !removed.has(ent.id)) { kill(ent, map); found = true; }
        const def = (game.monsters || []).find((m) => m.id === g.monster);
        if (!found && (facts.fights.has(g.monster) || (def && !def.boss))) {
          state.party.flags['killed_' + g.monster] = true;
          state.kills[g.monster] = (state.kills[g.monster] || 0) + Math.max(1, parseInt(g.n, 10) || 1);
        }
      } else if (g.type === 'collect') {
        // carried by a foe: go and take it from them
        for (const src of facts.items.get(g.item) || []) if (src.kind === 'loot' && open.has(src.map.id)) kill(src.ent, src.map);
      } else if (g.type === 'flag') {
        // a flag a foe sets as it falls
        const want = String(g.flags || g.flag || '').split(/[,|]/).map((x) => x.trim()).filter(Boolean);
        for (const [, list] of facts.monsters) for (const { map, ent } of list) if (ent.flag && want.includes(ent.flag) && open.has(map.id)) kill(ent, map);
      } else if (g.type === 'companion') {
        const f = facts.npcs.get(g.npc);
        const along = () => state.party.members.some((m) => m.fromNpc === g.npc);
        if (!along() && f && npcHere(g.npc, open) && facts.joiners.has(g.npc) && (!f.npc.recruit?.after || questDone(state, f.npc.recruit.after))) {
          // (stands in for a hero: no experience to share out in a walk-through)
          state.party.members.push({ id: 'walk_' + g.npc, name: f.npc.name, fromNpc: g.npc, status: 'dead', level: 1 });
          removed.add(g.npc);
        }
        const to = g.map && byMap.get(g.map);
        if (to && open.has(to.id) && along()) visit(to);
      }
      checkQuests(session);
      if (state.quests[q.id].stage !== was || state.quests[q.id].status === 'done') moved = true;
    }
    if (!moved) break;
  }
  // where it stalled
  const open = reach();
  const stuck = activeQuests(session).map((q) => ({ quest: q, step: state.quests[q.id].stage, why: walkWhy(game, facts, session, q, currentStage(session, q)?.goal || {}, open) }));
  const v = game.settings?.victory || {};
  const won = v.type === 'kill' ? !!state.party.flags['killed_' + v.target] : v.type === 'item' ? holding(v.target) : v.type === 'flag' ? !!state.party.flags[v.target] : null;
  const chapters = [...openChapterIds(game, state)];
  const mainLeft = (game.quests || []).filter((q) => q.main && !questDone(state, q.id));
  return {
    ok: !stuck.length && won !== false && chapters.length === chapterList(game).length,
    won, chapters, done: (game.quests || []).filter((q) => questDone(state, q.id)).map((q) => q.id), stuck, mainLeft, state,
  };
}

// Why a step could not be done, in plain words
function walkWhy(game, facts, session, q, g, open) {
  const mapName = (id) => game.maps.find((m) => m.id === id)?.name || 'a place';
  const itemName = (id) => (game.items || []).find((i) => i.id === id)?.name || 'item (none is chosen)';
  const npcWhy = (id) => {
    const f = facts.npcs.get(id);
    if (!f) return 'that person is not in the game';
    if (!open.has(f.map.id)) return `${f.npc.name} is in ${f.map.name}, which the company cannot get to`;
    return `${f.npc.name} cannot be reached in ${f.map.name}`;
  };
  switch (g.type) {
    case 'talk': return npcWhy(g.npc || q.giver);
    case 'deliver': return (session.state.party.inventory[g.item] || 0) > 0 ? npcWhy(g.npc || q.giver) : `nothing the company can get to gives the ${itemName(g.item)}`;
    case 'collect': return `nothing the company can get to gives the ${itemName(g.item)}`;
    case 'kill': return `${(game.monsters || []).find((m) => m.id === g.monster)?.name || 'that foe'} stands nowhere the company can get to`;
    case 'reach': case 'clear': {
      const barred = (facts.gates.get(g.map) || []).map((x) => x.item);
      return barred.length ? `the way into ${mapName(g.map)} needs the ${itemName(barred[0])}, which the company never gets` : `no way leads to ${mapName(g.map)}`;
    }
    case 'companion': {
      const f = facts.npcs.get(g.npc);
      if (!f) return 'that person is not in the game';
      if (!facts.joiners.has(g.npc)) return `${f.npc.name} never offers to join the company`;
      if (f.npc.recruit?.after && !questDone(session.state, f.npc.recruit.after)) return `${f.npc.name} joins only after “${questOf(game, f.npc.recruit.after)?.name || 'a quest'}”`;
      if (g.map && !open.has(g.map)) return `no way leads to ${mapName(g.map)}`;
      return npcWhy(g.npc);
    }
    case 'flag': return `nothing sets the story flag “${g.flags || g.flag || ''}”`;
    default: return 'its goal is not set';
  }
}
