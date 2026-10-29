// Quests: data-driven goals with stages, givers and rewards.
//
// A quest (game.quests[]) looks like
//   { id, name, giver: npcId, main, auto, requires: questId, offer, accept, summary,
//     stages: [{ text, goal: { type, ... }, say, log, reward }], reward, doneText }
// Goal types: talk {npc}, deliver {npc, item, n}, reach {map, x?, y?, r?},
// kill {monster, n}, collect {item, n}, clear {map}, flag {flags: 'a,b,c'}.
// An empty npc in a talk/deliver goal means "the quest giver".
// Progress lives in the play state: state.quests[id] = { status, stage, base, turn }.
import { byId, getMap } from '../data/schema.js';
import { partyAlive, gainXp, itemOf } from './rules.js';

export const GOAL_TYPES = {
  talk: 'Talk to someone',
  deliver: 'Deliver an item to someone',
  reach: 'Reach a place',
  kill: 'Defeat a monster',
  collect: 'Find an item',
  clear: 'Clear a map of monsters',
  flag: 'Story flag(s) set',
};

// ------------------------------------------------------------ state
export function ensureQuestState(state) {
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  if (!state.kills || typeof state.kills !== 'object') state.kills = {};
  if (!Array.isArray(state.lore)) state.lore = [];
  if (!state.poi || typeof state.poi !== 'object') state.poi = {};
  if (!Array.isArray(state.blessings)) state.blessings = [];
  if (state.tracked === undefined) state.tracked = null;
  return state;
}

export const questOf = (game, id) => byId(game.quests || [], id);
export const questState = (state, id) => state.quests?.[id] || null;
export const isActive = (state, id) => questState(state, id)?.status === 'active';
export const isDone = (state, id) => questState(state, id)?.status === 'done';

export function activeQuests(session) {
  const g = session.game, st = session.state;
  return (g.quests || []).filter((q) => isActive(st, q.id))
    .sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || (st.quests[a.id].turn || 0) - (st.quests[b.id].turn || 0));
}

export function doneQuests(session) {
  return (session.game.quests || []).filter((q) => isDone(session.state, q.id));
}

export function currentStage(session, q) {
  const qs = questState(session.state, q.id);
  return qs && qs.status === 'active' ? q.stages?.[qs.stage] || null : null;
}

// The quest the tracker follows: the chosen one if still active, else the main quest, else the oldest
export function trackedQuest(session) {
  const st = session.state;
  const act = activeQuests(session);
  return act.find((q) => q.id === st.tracked) || act[0] || null;
}

// ------------------------------------------------------------ availability
export function canOffer(session, q) {
  const st = session.state;
  if (questState(st, q.id)) return false;
  if (q.requires && !isDone(st, q.requires)) return false;
  if (q.requiresFlag && !st.party.flags[q.requiresFlag]) return false;
  return true;
}

export function offersFrom(session, npc) {
  return (session.game.quests || []).filter((q) => q.giver && q.giver === npc.id && !q.auto && canOffer(session, q));
}

const goalNpc = (q, goal) => goal.npc || q.giver;

// An active quest that still needs this person (so they should not wander off with the party)
export function questNeeding(session, npcId) {
  for (const q of activeQuests(session)) {
    const qs = questState(session.state, q.id);
    for (let i = qs.stage; i < (q.stages?.length || 0); i++) {
      const g = q.stages[i].goal;
      if (g && (g.type === 'talk' || g.type === 'deliver') && goalNpc(q, g) === npcId) return q;
    }
  }
  return null;
}

// ------------------------------------------------------------ npc markers
// What floats over a person's head: a quest to offer ('quest', "!"), a quest
// to hand in or a conversation that moves a quest on ('turnin'), a quest of
// theirs still under way ('progress', "?"), else what trade they ply.
export function npcMarker(session, npc) {
  if (!npc || npc.type !== 'npc' || npc.hostile) return null;
  const st = session.state;
  for (const q of activeQuests(session)) {
    const s = currentStage(session, q);
    const g = s?.goal;
    if (g && (g.type === 'talk' || g.type === 'deliver') && goalNpc(q, g) === npc.id) return 'turnin';
  }
  if (offersFrom(session, npc).length) return 'quest';
  if ((session.game.quests || []).some((q) => q.giver === npc.id && isActive(st, q.id))) return 'progress';
  if (npc.shop && npc.shop.kind) return npc.role === 'merchant' ? 'merchant' : 'shop';
  if (npc.role === 'inn') return 'inn';
  if (npc.role === 'healer') return 'healer';
  if (npc.role === 'trainer') return 'trainer';
  if (npc.recruit) return 'recruit';
  return null;
}

// ------------------------------------------------------------ goals
function countItem(session, id) {
  const p = session.state.party;
  let n = p.inventory[id] || 0;
  for (const m of p.members) for (const v of Object.values(m.equip || {})) if (v === id) n++;
  return n;
}

function flagList(goal) { return String(goal.flags || goal.flag || '').split(/[,|]/).map((s) => s.trim()).filter(Boolean); }

// Live monsters still placed on a map (from the game data minus those removed in play)
function monstersLeft(session, mapId) {
  if (session.map && session.map.id === mapId) return session.map.entities.filter((e) => e.type === 'monster' && !e.roaming).length;
  const src = getMap(session.game, mapId);
  if (!src) return 0;
  const removed = new Set(session.state.maps?.[mapId]?.removed || []);
  return src.entities.filter((e) => e.type === 'monster' && !removed.has(e.id)).length;
}

// progress of a passive goal: { have, need } or null for talk-type goals
export function goalProgress(session, q, goal, qs) {
  const st = session.state;
  const n = Math.max(1, parseInt(goal.n, 10) || 1);
  switch (goal.type) {
    case 'reach': {
      const p = st.pos;
      const spot = !(goal.x == null || goal.x === '' || goal.y == null || goal.y === '');
      // a whole map counts once it has been visited (even before the quest asked)
      if (!spot) return { have: goal.map && (p.map === goal.map || st.maps?.[goal.map]) ? 1 : 0, need: 1 };
      if (!goal.map || p.map !== goal.map) return { have: 0, need: 1 };
      const r = parseInt(goal.r, 10) || 1;
      return { have: Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) <= r ? 1 : 0, need: 1 };
    }
    case 'kill': {
      if (n <= 1) return { have: st.party.flags['killed_' + goal.monster] ? 1 : 0, need: 1 };
      const base = qs?.base ?? 0;
      return { have: Math.min(n, (st.kills[goal.monster] || 0) - base), need: n };
    }
    case 'collect': return { have: Math.min(n, countItem(session, goal.item)), need: n };
    case 'deliver': return { have: Math.min(n, countItem(session, goal.item)), need: n };
    case 'clear': {
      const left = monstersLeft(session, goal.map);
      const visited = !!st.maps?.[goal.map] || st.pos.map === goal.map;
      return { have: visited && left === 0 ? 1 : 0, need: 1, left };
    }
    case 'flag': {
      const fl = flagList(goal);
      return { have: fl.filter((f) => st.party.flags[f]).length, need: Math.max(1, fl.length) };
    }
    default: return null;
  }
}

function passiveDone(session, q, stage, qs) {
  const g = stage.goal || {};
  if (g.type === 'talk' || g.type === 'deliver' || !g.type) return false;
  const pr = goalProgress(session, q, g, qs);
  return !!pr && pr.have >= pr.need;
}

// ------------------------------------------------------------ rewards
export function applyReward(session, r) {
  if (!r) return [];
  const p = session.state.party, g = session.game;
  const got = [];
  const gold = parseInt(r.gold, 10) || 0;
  if (gold) { p.gold += gold; got.push(`${gold} gold`); }
  const food = parseInt(r.food, 10) || 0;
  if (food) { p.food += food; got.push(`${food} food`); }
  for (const it of r.items || []) {
    const def = itemOf(g, it.id);
    if (!def) continue;
    const n = Math.max(1, parseInt(it.n, 10) || 1);
    p.inventory[def.id] = (p.inventory[def.id] || 0) + n;
    got.push(n > 1 ? `${n} × ${def.name}` : def.name);
  }
  const xp = parseInt(r.xp, 10) || 0;
  if (xp) {
    got.push(`${xp} experience`);
    for (const m of partyAlive(p)) {
      if (gainXp(g, m, xp).length) session.log(`${m.name} is now level ${m.level}! (▲ ${m.points} attribute point${m.points === 1 ? '' : 's'} to spend)`, 'level');
    }
  }
  for (const f of String(r.flag || '').split(/[,|]/).map((s) => s.trim()).filter(Boolean)) p.flags[f] = true;
  return got;
}

// ------------------------------------------------------------ transitions
// Every change fires session.onQuestEvent(kind, quest, extra) so the UI can
// show banners: 'start', 'stage', 'done'.
function emit(session, kind, q, extra) {
  session.ui?.onQuestEvent?.(kind, q, extra);
}

function stageBase(session, stage) {
  const g = stage?.goal;
  return g && g.type === 'kill' ? session.state.kills[g.monster] || 0 : 0;
}

export function startQuest(session, id, opts = {}) {
  const q = questOf(session.game, id);
  if (!q) return false;
  const st = session.state;
  if (questState(st, id)) return false;
  st.quests[id] = { status: 'active', stage: 0, base: stageBase(session, q.stages?.[0]), turn: st.turn || 0 };
  if (!st.tracked || !isActive(st, st.tracked) || q.main) st.tracked = id;
  if (!opts.quiet) session.log(`New quest: ${q.name}.`, 'quest');
  if (q.startItems && q.startItems.length) {
    const got = applyReward(session, { items: q.startItems });
    if (got.length) session.log(`You receive ${got.join(', ')}.`, 'good');
  }
  emit(session, 'start', q);
  if (!q.stages || !q.stages.length) return completeQuest(session, id), true;
  checkQuests(session);
  return true;
}

export function advanceQuest(session, id) {
  const q = questOf(session.game, id);
  const qs = questState(session.state, id);
  if (!q || !qs || qs.status !== 'active') return false;
  const stage = q.stages?.[qs.stage];
  const got = stage ? applyReward(session, stage.reward) : [];
  if (stage?.log) session.log(stage.log, 'quest');
  qs.stage++;
  if (qs.stage >= (q.stages?.length || 0)) return completeQuest(session, id, got);
  qs.base = stageBase(session, q.stages[qs.stage]);
  session.log(`Quest updated — ${q.name}: ${q.stages[qs.stage].text}`, 'quest');
  emit(session, 'stage', q, { got });
  return true;
}

export function completeQuest(session, id, extraGot = []) {
  const q = questOf(session.game, id);
  const st = session.state;
  if (!q) return false;
  if (!st.quests[id]) st.quests[id] = { status: 'active', stage: 0, turn: st.turn || 0 };
  const qs = st.quests[id];
  if (qs.status === 'done') return false;
  qs.status = 'done';
  qs.stage = q.stages?.length || 0;
  qs.doneTurn = st.turn || 0;
  const got = [...extraGot, ...applyReward(session, q.reward)];
  session.log(`Quest complete: ${q.name}!${got.length ? ' Reward: ' + got.join(', ') + '.' : ''}`, 'quest');
  if (st.tracked === id) st.tracked = null;
  emit(session, 'done', q, { got });
  // follow-up quests that start by themselves
  for (const nq of session.game.quests || []) if (nq.auto && nq.requires === id && canOffer(session, nq)) startQuest(session, nq.id);
  session.checkVictory?.();
  return true;
}

// Re-check every passive goal; called after steps, battles, chests and talk
export function checkQuests(session) {
  if (!session.state?.quests) return;
  for (let guard = 0; guard < 20; guard++) {
    let moved = false;
    for (const q of activeQuests(session)) {
      const qs = questState(session.state, q.id);
      const s = q.stages?.[qs.stage];
      if (s && passiveDone(session, q, s, qs)) { advanceQuest(session, q.id); moved = true; }
    }
    if (!moved) break;
  }
}

// Begin-of-game: start every auto quest without a prerequisite
export function startAutoQuests(session) {
  for (const q of session.game.quests || []) if (q.auto && !q.requires && canOffer(session, q)) startQuest(session, q.id);
}

export function onKill(session, monsterId) {
  const st = session.state;
  st.kills[monsterId] = (st.kills[monsterId] || 0) + 1;
}

// Talking to someone may complete talk and deliver goals. Returns the lines
// the person says because of quests: [{ say, note, quest }]
export function onTalk(session, npc) {
  const out = [];
  for (let guard = 0; guard < 12; guard++) {
    let moved = false;
    for (const q of activeQuests(session)) {
      const s = currentStage(session, q);
      const g = s?.goal;
      if (!g || (g.type !== 'talk' && g.type !== 'deliver') || goalNpc(q, g) !== npc.id) continue;
      if (g.type === 'deliver') {
        const need = Math.max(1, parseInt(g.n, 10) || 1);
        const it = itemOf(session.game, g.item);
        if (countItem(session, g.item) < need) {
          if (!out.some((o) => o.quest === q && o.waiting)) out.push({ quest: q, waiting: true, note: `${q.name}: you still need ${need > 1 ? need + ' × ' : ''}${it?.name || g.item}.` });
          continue;
        }
        takeItems(session, g.item, need);
        out.push({ quest: q, note: `You hand over ${need > 1 ? need + ' × ' : ''}${it?.name || g.item}.` });
      }
      const was = questState(session.state, q.id).stage;
      out.push({ quest: q, say: s.say || '' });
      advanceQuest(session, q.id);
      checkQuests(session); // steps already done while away (a key in the pack, a foe already slain)
      const qs = questState(session.state, q.id);
      out.push({ quest: q, note: qs.status === 'done' ? `Quest complete: ${q.name}` : `Quest updated: ${q.stages[qs.stage]?.text || ''}`, done: qs.status === 'done', stage: was });
      moved = true;
    }
    if (!moved) break;
  }
  checkQuests(session);
  return out;
}

function takeItems(session, id, n) {
  const p = session.state.party;
  const fromPack = Math.min(n, p.inventory[id] || 0);
  p.inventory[id] = (p.inventory[id] || 0) - fromPack;
  let left = n - fromPack;
  for (const m of p.members) {
    for (const [slot, v] of Object.entries(m.equip || {})) if (left > 0 && v === id) { m.equip[slot] = null; left--; }
  }
}

// ------------------------------------------------------------ where to go
export function findNpc(game, id, liveMap) {
  if (!id) return null;
  if (liveMap) {
    const e = liveMap.entities.find((x) => x.id === id);
    if (e) return { map: liveMap, npc: e };
  }
  for (const m of game.maps) {
    const e = m.entities.find((x) => x.id === id);
    if (e) return { map: m, npc: e };
  }
  return null;
}

function findEntity(session, pred) {
  const st = session.state;
  const live = session.map;
  if (live) {
    const e = live.entities.find(pred);
    if (e) return { mapId: live.id, x: e.x, y: e.y };
  }
  for (const m of session.game.maps) {
    if (live && m.id === live.id) continue;
    const removed = new Set(st.maps?.[m.id]?.removed || []);
    const e = m.entities.find((x) => !removed.has(x.id) && pred(x));
    if (e) return { mapId: m.id, x: e.x, y: e.y };
  }
  return null;
}

// Where the current goal of a quest is: { mapId, x?, y? } or null
export function goalTarget(session, q) {
  const s = currentStage(session, q);
  const g = s?.goal;
  if (!g) return null;
  if (g.map && g.type !== 'kill' && g.type !== 'collect' && g.type !== 'flag') {
    const map = getMap(session.game, g.map);
    if (!map) return null;
    if (g.type === 'reach' && g.x != null && g.x !== '') return { mapId: g.map, x: +g.x, y: +g.y };
    return { mapId: g.map };
  }
  switch (g.type) {
    case 'talk': case 'deliver': {
      const f = findNpc(session.game, goalNpc(q, g), session.map);
      return f ? { mapId: f.map.id, x: f.npc.x, y: f.npc.y } : null;
    }
    case 'kill':
      if (g.map) return { mapId: g.map };
      return findEntity(session, (e) => e.type === 'monster' && e.monster === g.monster && !e.roaming);
    case 'collect':
      if (g.map) return { mapId: g.map };
      return findEntity(session, (e) => e.type === 'chest' && (e.items || []).some((it) => it.id === g.item));
    case 'flag': {
      const fl = flagList(g).filter((f) => !session.state.party.flags[f]);
      if (g.map) return { mapId: g.map };
      return findEntity(session, (e) => fl.includes(e.flag) || fl.includes(e.setsFlag));
    }
    default: return null;
  }
}

// Find where on the current map the way to a target lies: the target itself,
// a portal leading toward it, or (from inside a site) the way out.
export function pointOnMap(session, target, map = session.map) {
  if (!target || !map) return null;
  if (target.mapId === map.id) return target.x != null ? { x: target.x, y: target.y, here: true } : { here: true };
  // walk up from the target map through exits / portals until we reach this map
  const game = session.game;
  let id = target.mapId;
  const seen = new Set();
  for (let i = 0; i < 8 && id && !seen.has(id); i++) {
    seen.add(id);
    const portal = map.entities.find((e) => e.type === 'portal' && e.target?.map === id);
    if (portal) return { x: portal.x, y: portal.y, via: getMap(game, id)?.name };
    const m = getMap(game, id);
    if (!m) break;
    if (m.exit && m.exit.map === map.id) return { x: m.exit.x, y: m.exit.y, via: m.name };
    id = m.exit?.map;
  }
  if (map.exit) return { out: true };
  return null;
}

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

// Short guidance like "↗ 14 paces north-east" for the tracker
export function directionTo(session, pt, from = session.state.pos, map = session.map) {
  const p = from;
  if (!pt || pt.x == null) return null;
  const dx = pt.x - p.x, dy = pt.y - p.y;
  const d = Math.round(Math.hypot(dx, dy));
  if (d === 0) return { arrow: '●', text: 'right here', d: 0 };
  const a = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  const unit = map?.type === 'world' ? (d === 1 ? 'league' : 'leagues') : (d === 1 ? 'pace' : 'paces');
  return { arrow: ARROWS[a], text: `${d} ${unit} ${DIRS[a]}`, d, angle: Math.atan2(dy, dx) };
}

export function guidance(session, q) {
  const t = goalTarget(session, q);
  if (!t) return null;
  const pt = pointOnMap(session, t);
  const tmap = getMap(session.game, t.mapId);
  if (!pt) return { text: tmap ? `in ${tmap.name}` : '' };
  if (pt.out) {
    // from inside a site: say which way to head once outside
    const ex = session.map.exit;
    const outer = ex && getMap(session.game, ex.map);
    const opt = outer && pointOnMap(session, t, outer);
    const dir = opt && opt.x != null && directionTo(session, opt, ex, outer);
    const where = opt?.via || (t.mapId === outer?.id ? '' : tmap?.name);
    if (dir && dir.d > 0) return { arrow: '⤴', text: `Leave ${session.map.name}, then ${dir.text}${where ? ' to ' + where : ''}` };
    return { arrow: '⤴', text: `Leave ${session.map.name}${tmap && tmap !== outer ? ' for ' + tmap.name : ''}` };
  }
  const dir = directionTo(session, pt);
  if (!dir) return { text: pt.here ? `somewhere in ${session.map.name}` : '' };
  return { ...dir, text: pt.via ? `${pt.via}: ${dir.text}` : dir.text, x: pt.x, y: pt.y };
}

// Everything the renderer / map may want to pin: [{ x, y, quest, main }]
export function questPins(session) {
  const pins = [];
  for (const q of activeQuests(session)) {
    const t = goalTarget(session, q);
    const pt = t && pointOnMap(session, t);
    if (pt && pt.x != null) pins.push({ x: pt.x, y: pt.y, quest: q, main: !!q.main, tracked: trackedQuest(session) === q });
  }
  return pins;
}

// Text for a goal with live progress, e.g. "Slay the wolves (2/5)"
export function stageLine(session, q) {
  const s = currentStage(session, q);
  if (!s) return '';
  const qs = questState(session.state, q.id);
  const pr = s.goal ? goalProgress(session, q, s.goal, qs) : null;
  return s.text + (pr && pr.need > 1 ? ` (${Math.max(0, pr.have)}/${pr.need})` : '');
}

// Default wording for a goal, used by the editor and by generated quests
export function describeGoal(game, q, g) {
  if (!g) return '';
  const npcName = () => findNpc(game, g.npc || q?.giver)?.npc?.name || 'someone';
  const npcMap = () => findNpc(game, g.npc || q?.giver)?.map?.name;
  const item = () => itemOf(game, g.item)?.name || 'an item';
  const mapName = () => getMap(game, g.map)?.name || 'a place';
  const n = Math.max(1, parseInt(g.n, 10) || 1);
  switch (g.type) {
    case 'talk': return `Speak to ${npcName()}${npcMap() ? ' in ' + npcMap() : ''}`;
    case 'deliver': return `Bring ${n > 1 ? n + ' × ' : 'the '}${item()} to ${npcName()}${npcMap() ? ' in ' + npcMap() : ''}`;
    case 'reach': return `Travel to ${mapName()}`;
    case 'kill': { const m = byId(game.monsters, g.monster); return n > 1 ? `Slay ${n} ${m?.plural || 'foes'}` : `Defeat ${m?.name || 'the foe'}`; }
    case 'collect': return `Find ${n > 1 ? n + ' × ' : 'the '}${item()}`;
    case 'clear': return `Clear ${mapName()} of monsters`;
    case 'flag': return 'Complete the task';
    default: return '';
  }
}

// Migrate quest data in a game file (older files have none)
export function migrateQuests(game) {
  if (!Array.isArray(game.quests)) game.quests = [];
  for (const q of game.quests) {
    if (!q.id) q.id = 'quest_' + Math.random().toString(36).slice(2, 8);
    if (!q.name) q.name = 'A Quest';
    if (!Array.isArray(q.stages)) q.stages = [];
    for (const s of q.stages) { if (!s.goal) s.goal = { type: 'talk', npc: '' }; if (s.text == null) s.text = describeGoal(game, q, s.goal); }
    if (!q.reward || typeof q.reward !== 'object') q.reward = {};
    if (!Array.isArray(q.reward.items)) q.reward.items = [];
  }
  return game;
}
