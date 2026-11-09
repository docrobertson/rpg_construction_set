// The designer's checklist: what in a realm still needs work, found by looking
// the whole game over. Each finding:
//   { id, area, level: 'error' | 'warn' | 'todo' | 'ok', text, go, ignored? }
// area: one of AREAS (the editor's steps). go says where to fix it:
//   { tab, map?, x?, y?, entity?, quest?, chapter?, place? }
// error: the game cannot be played through as it is; warn: a player is likely
// to be stuck or puzzled; todo: unfinished, but playable; ok: a thing done.
// Ids are stable (built from what the finding is about), so the designer can
// ignore one and it stays ignored: game.meta.checklistIgnore = [id].
//
// Reachability is worked out the way the party moves: on foot over walkable
// squares (4 ways), through passages, stairs, waygates and the edges of
// towns, and by ship across the water a ship floats on. The squares each map
// is split into are cached per map (keyed by a hash of its tiles), so the
// analysis stays a few milliseconds even while the designer paints.
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { placesOf } from '../world/places.js';
import { ROLE_TEXT } from '../world/generate.js';
import { chapterList, questsInChapter, questSpans, walkStory } from './story.js';
import { GOAL_TYPES } from './quests.js';
import { mooringFor, sellsShip } from './ships.js';
import { mysteriesOf, needFlags, startHeroes } from './company.js';

export const AREAS = [
  ['campaign', 'Campaign'], ['land', 'Land'], ['places', 'Places'], ['story', 'Story'], ['map', 'Details'], ['test', 'Test'],
];

// What a fresh realm, a new person or a new sign start with
const DEFAULT_TITLE = 'Untitled Realm';
const DEFAULT_INTRO = 'Long ago, in an age of legend, a shadow fell upon the land...';
const DEFAULT_SIGN = 'Here lies the road to adventure.';
const DEFAULT_WORDS = new Set(['', 'Well met.', 'I wander where the road takes me.', ...Object.values(ROLE_TEXT).flatMap((r) => [r.job, r.greet])]);
const TOWN_TYPES = new Set(['town', 'castle']);
// items a fight can drop by chance (combat.js dropLoot): never the only way to
// a key, but enough for a potion or a sword a quest asks for
const LOOT_TYPES = new Set(['weapon', 'armor', 'shield']);
// monsters this far above the company's starting level, this near the start,
// make for a short adventure
const DANGER_STEP = 3, DANGER_REACH = 12;
// the start shut in fewer squares than this, with no way out, is a pocket
const POCKET = 40;

const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
const listNames = (names, max = 3) => names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
const flagList = (s) => String(s || '').split(/[,|]/).map((x) => x.trim()).filter(Boolean);
const shortHash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// ------------------------------------------------------------ quests
// Things in one quest that would leave the player stuck or guessing, in plain
// words (shown above the quest's form, and on the checklist)
export function questProblems(game, q) {
  const out = [];
  const npcs = new Map();
  for (const m of game.maps) for (const e of m.entities || []) if (e.type === 'npc') npcs.set(e.id, e);
  const startedBy = game.maps.some((m) => (m.entities || []).some((e) => (e.choices || []).some((c) => c.effects?.quest === q.id)
    || (e.keywords || []).some((k) => k.action?.type === 'start_quest' && k.action.value === q.id)));
  if (!(q.stages || []).length) out.push('It has no steps: add at least one.');
  if (!q.giver && !q.auto && !startedBy) out.push('Nobody gives it and it does not start by itself: choose “Given by”, tick “Starts by itself”, or start it from a conversation or an event.');
  if (q.giver && !npcs.has(q.giver)) out.push('The person who gives it is no longer in the game.');
  if (q.requires && !(game.quests || []).some((x) => x.id === q.requires)) out.push('It waits for a quest that no longer exists.');
  (q.stages || []).forEach((st, i) => {
    const g = st.goal || {};
    const n = `Step ${i + 1}`;
    if (g.type === 'talk' || g.type === 'deliver') {
      const who = g.npc || q.giver;
      if (!who) out.push(`${n}: “${GOAL_TYPES[g.type]}” needs a person — the quest has no giver to stand in for “the quest giver”.`);
      else if (!npcs.has(who)) out.push(`${n}: that person is no longer in the game.`);
    }
    if ((g.type === 'deliver' || g.type === 'collect') && !(game.items || []).some((it) => it.id === g.item)) out.push(`${n}: choose the item.`);
    if (g.type === 'kill' && !(game.monsters || []).some((mo) => mo.id === g.monster)) out.push(`${n}: choose the monster to defeat.`);
    if ((g.type === 'reach' || g.type === 'clear') && !game.maps.some((m) => m.id === g.map)) out.push(`${n}: choose the map.`);
    if (g.type === 'flag' && !String(g.flags || g.flag || '').trim()) out.push(`${n}: name the story flag(s) to wait for.`);
    if (g.type === 'companion') {
      const p = npcs.get(g.npc);
      if (!p) out.push(`${n}: choose who must be in the company.`);
      else if (!p.recruit && !(p.keywords || []).some((k) => k.action?.type === 'join')) out.push(`${n}: ${p.name || 'that person'} never offers to join the company — tick “Can JOIN the party” on them, or give them a keyword that makes them join.`);
    }
  });
  return out;
}

// ------------------------------------------------------------ walking
const walkable = (t) => t.walk || t.locked; // a locked door opens to a key or a burglar
const sailable = (t) => t.ship || (t.water && !t.deck);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function tileHash(map) {
  const a = map.tiles;
  let h = (2166136261 ^ map.w ^ (map.h << 12)) >>> 0;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

// Label the connected patches of a map: comp[i] = patch of square i (-1 for
// squares the party cannot stand on). Water the party can sail is labelled
// too (sea[i]), with the land patches each stretch of water touches.
const TILE_CACHE = new WeakMap();
function mapPatches(map) {
  const sig = tileHash(map);
  const hit = TILE_CACHE.get(map);
  if (hit && hit.sig === sig && hit.tiles === map.tiles) return hit;
  const { w, h } = map;
  const n = w * h;
  const kind = new Uint8Array(n); // 1 walk, 2 sail, 0 neither
  const stairs = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = terrain(map.tiles[i]);
    kind[i] = walkable(t) ? 1 : sailable(t) ? 2 : 0;
    if (t.key === 'stairs_up' || t.key === 'stairs_down') stairs[i] = 1;
  }
  const label = (want) => {
    const comp = new Int32Array(n).fill(-1);
    const size = [];
    const stack = new Int32Array(n);
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (kind[i] !== want || comp[i] >= 0) continue;
      let sp = 0, cnt = 0;
      stack[sp++] = i; comp[i] = c;
      while (sp) {
        const j = stack[--sp];
        cnt++;
        const x = j % w, y = (j - x) / w;
        if (x > 0 && kind[j - 1] === want && comp[j - 1] < 0) { comp[j - 1] = c; stack[sp++] = j - 1; }
        if (x < w - 1 && kind[j + 1] === want && comp[j + 1] < 0) { comp[j + 1] = c; stack[sp++] = j + 1; }
        if (y > 0 && kind[j - w] === want && comp[j - w] < 0) { comp[j - w] = c; stack[sp++] = j - w; }
        if (y < h - 1 && kind[j + w] === want && comp[j + w] < 0) { comp[j + w] = c; stack[sp++] = j + w; }
      }
      size.push(cnt);
      c++;
    }
    return { comp, size };
  };
  const land = label(1);
  const sea = label(2);
  // which land patches touch the map's edge (a town is left that way), hold
  // stairs (which lead back out of a level), or border each stretch of water
  const edge = new Set(), stairComps = new Set();
  const shore = sea.size.map(() => new Set());
  for (let i = 0; i < n; i++) {
    const lc = land.comp[i];
    const x = i % w, y = (i - x) / w;
    if (lc >= 0) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge.add(lc);
      if (stairs[i]) stairComps.add(lc);
      continue;
    }
    const sc = sea.comp[i];
    if (sc < 0) continue;
    if (x > 0 && land.comp[i - 1] >= 0) shore[sc].add(land.comp[i - 1]);
    if (x < w - 1 && land.comp[i + 1] >= 0) shore[sc].add(land.comp[i + 1]);
    if (y > 0 && land.comp[i - w] >= 0) shore[sc].add(land.comp[i - w]);
    if (y < h - 1 && land.comp[i + w] >= 0) shore[sc].add(land.comp[i + w]);
  }
  const out = { sig, tiles: map.tiles, comp: land.comp, size: land.size, sea: sea.comp, shore, edge, stairComps };
  TILE_CACHE.set(map, out);
  return out;
}

// The land patch at (x, y), or those beside it when the square itself is not
// one to stand on (a person behind a counter, an arrival point on a wall)
function patchesAt(map, P, x, y, near = true) {
  if (!inBounds(map, x, y)) return [];
  const c = P.comp[y * map.w + x];
  if (c >= 0) return [c];
  if (!near) return [];
  const out = [];
  for (const [dx, dy] of N4) {
    for (const k of [1, 2]) { // across a counter, two squares away
      const nx = x + dx * k, ny = y + dy * k;
      if (!inBounds(map, nx, ny)) break;
      const nc = P.comp[ny * map.w + nx];
      if (nc >= 0) { if (!out.includes(nc)) out.push(nc); break; }
      if (!terrain(getTile(map, nx, ny)).talkOver) break;
    }
  }
  return out;
}

// Where the party can go from the start. Returns
//   { reached: Set('mapId:patch'), maps: Set(mapId), ways, at(map, x, y, near),
//     startMap, startOk, startSize, startExits }
export function reachability(game) {
  const maps = new Map(game.maps.map((m) => [m.id, m]));
  const P = new Map();
  const patches = (m) => { let p = P.get(m.id); if (!p) { p = mapPatches(m); P.set(m.id, p); } return p; };
  // the ways out of each patch: to a patch of a map, or aboard a ship onto a
  // stretch of water ('mapId:patch' -> [[mapId, patch] | ['sea', mapId, sea]])
  const ways = new Map();
  const addWay = (from, to) => { let l = ways.get(from); if (!l) ways.set(from, l = []); l.push(to); };
  const arrive = (dest, x, y, fromWorld) => {
    const Pd = patches(dest);
    const out = patchesAt(dest, Pd, x, y).map((c) => [dest.id, c]);
    // walking into a town from the wide world, the party comes in at whichever side it approached
    if (fromWorld && dest.type !== 'world' && dest.type !== 'dungeon') for (const c of Pd.edge) out.push([dest.id, c]);
    return out;
  };
  const exitOf = (m) => {
    const back = m.exit && maps.get(m.exit.map);
    return back ? arrive(back, m.exit.x, m.exit.y, false) : [];
  };
  const sailed = new Set(); // 'mapId:sea' stretches of water already crossed
  for (const m of game.maps) {
    const Pm = patches(m);
    const key = (c) => `${m.id}:${c}`;
    for (const e of m.entities || []) {
      if (e.type === 'portal') {
        const tgt = e.target || {};
        let to = [];
        if (tgt.map === 'exit' || (!tgt.map && m.exit)) to = exitOf(m);
        else {
          const dest = maps.get(tgt.map);
          if (dest) {
            const atEntry = tgt.x == null || tgt.x === '' || (dest.entry && tgt.x === dest.entry.x && tgt.y === dest.entry.y);
            to = arrive(dest, tgt.x == null || tgt.x === '' ? dest.entry?.x ?? Math.floor(dest.w / 2) : +tgt.x, tgt.y == null || tgt.y === '' ? dest.entry?.y ?? dest.h - 2 : +tgt.y, m.type === 'world' && atEntry);
          }
        }
        for (const c of patchesAt(m, Pm, e.x, e.y, false)) for (const t of to) addWay(key(c), t);
      } else if (e.type === 'ship' && inBounds(m, e.x, e.y)) {
        const sc = Pm.sea[e.y * m.w + e.x];
        if (sc < 0) continue;
        // boarded from the shore beside it
        for (const [dx, dy] of N4) {
          if (!inBounds(m, e.x + dx, e.y + dy)) continue;
          const lc = Pm.comp[(e.y + dy) * m.w + e.x + dx];
          if (lc >= 0) addWay(key(lc), ['sea', m.id, sc]);
        }
      } else if (e.type === 'npc') {
        const near = patchesAt(m, Pm, e.x, e.y);
        for (const k of e.keywords || []) {
          const a = k.action;
          if (a?.type !== 'teleport' || !maps.get(a.map)) continue;
          for (const c of near) for (const t of arrive(maps.get(a.map), +a.x || 0, +a.y || 0, false)) addWay(key(c), t);
        }
      }
      // a shipwright, or a shipyard on the map, puts a ship on the water
      if (sellsShip(e)) {
        const spot = mooringFor(game, e);
        const sc = spot ? patches(spot.map).sea[spot.y * spot.map.w + spot.x] : -1;
        if (sc >= 0) for (const c of patchesAt(m, Pm, e.x, e.y)) addWay(key(c), ['sea', spot.map.id, sc]);
      }
    }
    // the edges of a town, and stairs with nothing on them, lead back out
    if (m.exit) {
      const out = exitOf(m);
      for (const c of new Set([...Pm.edge, ...Pm.stairComps])) for (const t of out) addWay(key(c), t);
    }
  }
  const reached = new Set();
  const mapsReached = new Set();
  const start = game.settings.start || {};
  const sm = maps.get(start.map) || game.maps[0];
  const Ps = patches(sm);
  const startPatches = patchesAt(sm, Ps, start.x, start.y);
  const queue = startPatches.map((c) => [sm.id, c]);
  const visit = (mapId, c) => {
    const k = `${mapId}:${c}`;
    if (reached.has(k)) return;
    reached.add(k);
    mapsReached.add(mapId);
    queue.push([mapId, c]);
  };
  for (const [mid, c] of queue.splice(0)) visit(mid, c);
  while (queue.length) {
    const [mid, c] = queue.shift();
    for (const t of ways.get(`${mid}:${c}`) || []) {
      if (t[0] === 'sea') {
        const sk = `${t[1]}:${t[2]}`;
        if (sailed.has(sk)) continue;
        sailed.add(sk);
        for (const lc of patches(maps.get(t[1])).shore[t[2]]) visit(t[1], lc);
      } else visit(t[0], t[1]);
    }
  }
  const startPatch = startPatches[0] ?? -1;
  const startKey = `${sm.id}:${startPatch}`;
  return {
    reached, maps: mapsReached, ways,
    P: patches,
    // can the party stand on this square (or, with near, reach it from beside it, or from a ship)?
    at(map, x, y, near = true) {
      const Pm = patches(map);
      if (patchesAt(map, Pm, x, y, near).some((c) => reached.has(`${map.id}:${c}`))) return true;
      if (!near) return false;
      for (const [dx, dy] of [[0, 0], ...N4]) {
        if (!inBounds(map, x + dx, y + dy)) continue;
        const sc = Pm.sea[(y + dy) * map.w + x + dx];
        if (sc >= 0 && sailed.has(`${map.id}:${sc}`)) return true;
      }
      return false;
    },
    startMap: sm,
    startOk: inBounds(sm, start.x, start.y) && Ps.comp[start.y * sm.w + start.x] >= 0,
    startSize: startPatch >= 0 ? Ps.size[startPatch] : 0,
    startExits: (ways.get(startKey) || []).length,
  };
}

// ------------------------------------------------------------ the realm, indexed
function indexGame(game) {
  const ix = {
    npcs: new Map(), // id -> { e, map }
    itemSrc: new Map(), // item id -> first place it comes from (words)
    flagSrc: new Set(),
    met: new Set(), // monsters the party can meet somewhere
    metElse: new Set(), // ...somewhere other than standing on a map (an event, a conversation, the wild)
    placed: new Map(), // monster id -> [{ map, e }] the bands it stands in (or comes along with)
    linked: new Set(), // maps something leads to
    victoryWords: false,
    questRoles: new Map(), // npc id -> [quest]
  };
  const src = (id, why) => { if (id && !ix.itemSrc.has(id)) ix.itemSrc.set(id, why); };
  const srcList = (list, why) => { for (const it of list || []) src(it?.id ?? it, why); };
  const flag = (f) => { for (const x of flagList(f)) ix.flagSrc.add(x); };
  const meet = (id, at = null, seen = new Set()) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ix.met.add(id);
    if (at) { let l = ix.placed.get(id); if (!l) ix.placed.set(id, l = []); l.push(at); } else ix.metElse.add(id);
    const def = (game.monsters || []).find((m) => m.id === id);
    for (const esc of def?.escort || []) meet(esc.id, at, seen); // escorts come along
    for (const add of def?.phaseAdds || []) meet(add.id, at, seen);
  };
  const s = game.settings || {};
  srcList(s.startItems, 'the starting kit');
  for (const c of game.classes || []) srcList(c.start, `the ${c.name}'s kit`);
  const reward = (r, why) => { if (!r) return; srcList(r.items, why); flag(r.flag); };
  for (const q of game.quests || []) {
    reward(q.reward, `the reward for ${q.name}`);
    srcList(q.startItems, `${q.name}`);
    for (const st of q.stages || []) reward(st.reward, `a step of ${q.name}`);
    const role = (id) => { if (!id) return; let l = ix.questRoles.get(id); if (!l) ix.questRoles.set(id, l = []); if (!l.includes(q)) l.push(q); };
    role(q.giver);
    for (const st of q.stages || []) if (st.goal?.type === 'talk' || st.goal?.type === 'deliver') role(st.goal.npc || q.giver);
  }
  const effects = (fx, why) => {
    if (!fx) return;
    srcList(fx.items, why);
    if (fx.flag) flag(fx.flag);
    if (fx.fight) meet(fx.fight);
  };
  for (const m of game.maps) {
    for (const e of m.entities || []) {
      switch (e.type) {
        case 'npc':
          ix.npcs.set(e.id, { e, map: m });
          srcList(e.shop?.stock, `${e.name || 'a shop'} in ${m.name}`);
          for (const k of e.keywords || []) {
            const a = k.action || {};
            if (a.type === 'give_item') src(a.value, `${e.name || 'someone'} in ${m.name}`);
            else if (a.type === 'set_flag') flag(a.value);
            else if (a.type === 'fight') meet(a.value);
            else if (a.type === 'victory') ix.victoryWords = true;
            else if (a.type === 'teleport' && a.map) ix.linked.add(a.map);
          }
          break;
        case 'chest': srcList(e.items, `a chest in ${m.name}`); if (e.flag) flag(e.flag); break;
        case 'treasure': srcList(e.items, `a hoard in ${m.name}`); meet(e.guardian); break;
        case 'monster': meet(e.monster, { map: m, e }); srcList(e.loot, `monsters in ${m.name}`); if (e.flag) flag(e.flag); break;
        case 'event':
          for (const c of e.choices || []) {
            // ({id} in a flag stands for the event's own id)
            const fix = (fx) => (fx?.flag ? { ...fx, flag: String(fx.flag).replace(/\{id\}/g, e.id) } : fx);
            effects(fix(c.effects), `${e.name || 'a curiosity'} in ${m.name}`);
            effects(fix(c.failEffects), `${e.name || 'a curiosity'} in ${m.name}`);
            effects(fix(c.win), `${e.name || 'a curiosity'} in ${m.name}`);
          }
          break;
        case 'portal': if (e.target?.map && e.target.map !== 'exit') ix.linked.add(e.target.map); break;
        default:
      }
    }
  }
  // (company) a companion who leaves sets left_<id> (and a turncoat beaten,
  // defeated_<id>); a mystery solved or wrongly accused sets its flags
  const leavers = new Set();
  for (const m of game.maps) for (const e of m.entities || []) {
    if (e.type === 'npc' && e.recruit?.leaves) { leavers.add(e.id); if (e.recruit.leaves.hostile?.monster) { ix.flagSrc.add('defeated_' + e.id); meet(e.recruit.leaves.hostile.monster); } }
    for (const k of e.keywords || []) if (k.action?.type === 'leave_party') leavers.add(k.action.value || e.id);
    for (const c of e.choices || []) for (const fx of [c.effects, c.failEffects]) if (fx?.leave) leavers.add(fx.leave);
  }
  for (const id of leavers) ix.flagSrc.add('left_' + id);
  for (const my of mysteriesOf(game)) {
    reward(my.right?.reward, `solving ${my.name || 'a mystery'}`);
    flag(my.right?.flag);
    flag(my.wrong?.flag);
    effects(my.wrong?.effects, `a false accusation in ${my.name || 'a mystery'}`);
  }
  // the map to a hoard, the scrolls and gear a fight may drop, and monsters met in the wild
  for (const it of game.items || []) {
    if (it.type === 'map' && it.auto) src(it.id, 'an encounter on the road');
    if (s.loot !== false && LOOT_TYPES.has(it.type) && !it.unique && !it.noLoot && (it.price || 0) > 0) src(it.id, 'the spoils of battle');
    if (it.type === 'consumable' && it.combat) src(it.id, 'the spoils of battle');
    if (it.type === 'scroll' && !it.unique) src(it.id, 'the spoils of battle');
  }
  const wild = new Set();
  for (const m of game.maps) {
    if (!((m.encounterRate ?? 0) > 0) || (s.encounterRate ?? 1) <= 0) continue;
    const allowed = m.encounters?.length ? new Set(m.encounters) : null;
    if (m.type === 'dungeon') wild.add('dungeon');
    else wild.add('*'); // (the ground of a world map is a mix; any habitat but dungeon is likely)
    for (const mon of game.monsters || []) if (allowed?.has(mon.id) && !mon.boss) meet(mon.id);
  }
  for (const mon of game.monsters || []) {
    if (mon.boss || !(mon.habitat || []).length) continue;
    if ((wild.has('dungeon') && mon.habitat.includes('dungeon')) || (wild.has('*') && mon.habitat.some((x) => x !== 'dungeon'))) meet(mon.id);
  }
  return ix;
}

// ------------------------------------------------------------ mysteries (company)
// What in a mystery would leave it unsolvable or unfair: [{ level, text }]
export function mysteryProblems(game, my, ix = null) {
  ix ||= indexGame(game);
  const out = [];
  const name = (id) => ix.npcs.get(id)?.e.name || 'someone';
  const sus = (my.suspects || []).filter(Boolean);
  if (!my.judge) out.push({ level: 'error', text: 'nobody judges it: choose the person the company accuses to.' });
  else if (!ix.npcs.has(my.judge)) out.push({ level: 'error', text: 'its judge is no longer in the realm.' });
  if (sus.length < 2) out.push({ level: 'warn', text: sus.length ? 'there is only one suspect: give the company a choice.' : 'it has no suspects yet.' });
  for (const id of sus) if (!ix.npcs.has(id)) out.push({ level: 'warn', text: 'a suspect is no longer in the realm.' });
  if (!my.culprit) out.push({ level: 'error', text: 'nobody is guilty: choose the culprit.' });
  else if (!sus.includes(my.culprit)) out.push({ level: 'error', text: `the culprit, ${name(my.culprit)}, is not among the suspects.` });
  const clues = (my.clues || []).filter((c) => c?.flag);
  if (!clues.length) out.push({ level: 'warn', text: 'it has no clues: the company could accuse at once, on a guess.' });
  for (const c of clues) if (!ix.flagSrc.has(c.flag)) out.push({ level: 'warn', text: `the clue “${c.text || c.flag}” is found when the flag “${c.flag}” is set, but nothing sets it.` });
  const n = parseInt(my.need, 10);
  if (n > clues.length && clues.length) out.push({ level: 'todo', text: `it asks for ${n} clues before an accusation but has only ${clues.length}: the company may accuse once it has them all.` });
  if (!String(my.right?.text || '').trim()) out.push({ level: 'todo', text: 'nothing is said when the guilty one is named.' });
  return out;
}

// Every story flag the realm sets or waits on, sorted (for the editor's
// suggestions): what sets one, and what a need, a condition or a goal reads
export function flagsInGame(game) {
  const out = new Set(indexGame(game).flagSrc);
  const read = (need) => { for (const f of needFlags(need)) out.add(f); };
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 7) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && ['need', 'flag', 'flags', 'hideFlag', 'opens'].includes(k)) read(v);
      else if (typeof v === 'object') walk(v, depth + 1);
    }
    if ((o.type === 'flag' || o.type === 'noflag') && typeof o.value === 'string') read(o.value);
  };
  for (const m of game.maps) walk(m.entities);
  walk(game.quests); walk(game.story); walk(game.mysteries);
  if (game.settings?.victory?.type === 'flag') read(game.settings.victory.target);
  return [...out].filter((f) => f && !f.startsWith('_') && !f.includes('{id}')).sort();
}

// ------------------------------------------------------------ the checklist
export function analyzeCampaign(game, opt = {}) {
  const out = [];
  const add = (id, area, level, text, go) => out.push({ id, area, level, text, go: go || { tab: area } });
  const ix = indexGame(game);
  const R = reachability(game);
  const s = game.settings || {};
  const monName = (id) => (game.monsters || []).find((m) => m.id === id)?.name || id;
  const itemName = (id) => (game.items || []).find((i) => i.id === id)?.name || id;
  const mapById = new Map(game.maps.map((m) => [m.id, m]));
  const goEnt = (map, e, tab = 'map') => ({ tab, map: map.id, x: e.x, y: e.y, entity: e.id });
  const where = (id) => ix.npcs.get(id);
  const npcReached = (id) => { const w = where(id); return !!w && R.at(w.map, w.e.x, w.e.y); };
  // a foe met only where it stands, and standing only out of the party's reach
  const outOfReach = (id) => !ix.metElse.has(id) && !(ix.placed.get(id) || []).some(({ map, e }) => R.at(map, e.x, e.y));
  const goPlaced = (id) => { const p = ix.placed.get(id)?.[0]; return p ? goEnt(p.map, p.e) : { tab: 'campaign' }; };

  // ---------------------------------------------------------- campaign
  const title = (game.meta?.title || '').trim();
  if (!title || title === DEFAULT_TITLE) add('title', 'campaign', 'todo', 'Give your realm a title.');
  else add('ok-title', 'campaign', 'ok', `The realm is called “${title}”.`);
  const intro = (game.meta?.intro || '').trim();
  if (!intro || intro === DEFAULT_INTRO) add('intro', 'campaign', 'todo', intro ? 'The opening story is still the one every new realm starts with: tell your own.' : 'Write the opening story the players read before they set out.');
  else add('ok-intro', 'campaign', 'ok', 'The opening story is written.');
  const v = s.victory || {};
  if (!v.type || v.type === 'none') {
    if (ix.victoryWords) add('ok-win', 'campaign', 'ok', 'Someone’s words end the game in triumph.');
    else add('win', 'campaign', 'todo', 'There is no way to win yet: choose how the adventure ends (a foe slain, an item found or a story flag).');
  } else if (!v.target) add('win', 'campaign', 'error', 'The game is won when… — but nothing is chosen: pick the monster, item or flag.');
  else if (v.type === 'kill') {
    if (!(game.monsters || []).some((m) => m.id === v.target)) add('win', 'campaign', 'error', 'The foe that wins the game no longer exists: choose another.');
    else if (!ix.met.has(v.target)) add('win', 'campaign', 'error', `The game is won by slaying ${monName(v.target)}, but it stands nowhere and nothing summons it: place it on a map.`);
    else if (outOfReach(v.target)) add('win', 'campaign', 'warn', `The game is won by slaying ${monName(v.target)}, but it stands only where the party cannot reach.`, goPlaced(v.target));
    else add('ok-win', 'campaign', 'ok', `The game is won by slaying ${monName(v.target)}.`);
  } else if (v.type === 'item') {
    if (!ix.itemSrc.has(v.target)) add('win', 'campaign', 'error', `The game is won by finding the ${itemName(v.target)}, but nothing in the realm gives it: put it in a chest, a hoard or a reward.`);
    else add('ok-win', 'campaign', 'ok', `The game is won by finding the ${itemName(v.target)}.`);
  } else if (v.type === 'flag') {
    if (!ix.flagSrc.has(v.target)) add('win', 'campaign', 'error', `The game is won when the flag “${v.target}” is set, but nothing sets it: a conversation, a quest reward or a foe’s defeat could.`);
    else add('ok-win', 'campaign', 'ok', `The game is won when “${v.target}” is set.`);
  }
  const sm = R.startMap;
  if (!R.startOk) add('start', 'campaign', 'error', `The party starts on a square it cannot stand on (${sm.name} ${s.start?.x}, ${s.start?.y}): move the start.`, { tab: 'map', map: sm.id, x: s.start?.x, y: s.start?.y });

  // ---------------------------------------------------------- land
  const places = placesOf(game);
  const sites = places.filter((p) => p.portal);
  if (!sites.length) add('noplaces', 'land', 'todo', 'No places yet: found towns, castles and dungeons on the world map.', { tab: 'land' });
  else {
    const lost = sites.filter((p) => !R.at(p.world, p.portal.x, p.portal.y, false));
    for (const p of lost) add(`unreach:${p.map.id}`, 'land', 'warn', `${p.map.name} cannot be reached from the start: no road on foot, by ship or through a passage leads there.`, goEnt(p.world, p.portal, 'land'));
    if (!lost.length) add('ok-reach', 'land', 'ok', `${plural(sites.length, 'place')} on the map, every one within reach of the start.`);
  }
  if (R.startOk && R.startSize < POCKET && !R.startExits && R.maps.size <= 1) add('pocket', 'land', 'warn', `The party starts shut in a patch of ${plural(R.startSize, 'square')} with no way out.`, { tab: 'land', map: sm.id, x: s.start?.x, y: s.start?.y });

  // ---------------------------------------------------------- places
  const towns = game.maps.filter((m) => TOWN_TYPES.has(m.type));
  let inn = false, healer = false;
  for (const { e } of ix.npcs.values()) { if (e.role === 'inn') inn = true; if (e.role === 'healer') healer = true; }
  if (towns.length) {
    if (!inn) add('noinn', 'places', 'warn', 'There is no inn anywhere in the realm: the party has nowhere to rest and mend.', { tab: 'places' });
    if (!healer) add('nohealer', 'places', 'warn', 'There is no healer anywhere in the realm: the fallen can never be raised.', { tab: 'places' });
    if (inn && healer) add('ok-inn', 'places', 'ok', 'There are inns and healers in the realm.');
  }
  let emptyShops = 0;
  for (const m of game.maps) {
    const ents = m.entities || [];
    const npcs = ents.filter((e) => e.type === 'npc');
    if (TOWN_TYPES.has(m.type) && !npcs.length) add(`empty:${m.id}`, 'places', 'warn', `Nobody lives in ${m.name}: put some people in it.`, { tab: 'places', place: m.id });
    if (m.type === 'dungeon') {
      const foes = ents.some((e) => e.type === 'monster');
      const loot = ents.some((e) => e.type === 'chest' || e.type === 'treasure');
      if (!foes && !loot) add(`bare:${m.id}`, 'places', 'warn', `${m.name} holds no monsters and no treasure.`, { tab: 'places', place: m.id });
      else if (!foes) add(`bare:${m.id}`, 'places', 'todo', `${m.name} has no monsters in it.`, { tab: 'places', place: m.id });
      else if (!loot) add(`bare:${m.id}`, 'places', 'todo', `${m.name} has no treasure to find.`, { tab: 'places', place: m.id });
    }
    if (m.type !== 'world' && m.id !== s.start?.map && !ix.linked.has(m.id)) add(`orphan:${m.id}`, 'places', 'warn', `Nothing leads to ${m.name}: no site, stairs or passage opens on it.`, { tab: 'places', place: m.id });
    else if (m.type !== 'world' && R.maps.has(m.id) && !wayOut(R, m)) add(`trap:${m.id}`, 'places', 'warn', `Once inside ${m.name} the party cannot get out again: add stairs or a passage back${m.exit ? '' : ', or an exit'}.`, { tab: 'places', place: m.id });
    if (m.type !== 'world' && m.entry && ix.linked.has(m.id) && !patchesAt(m, R.P(m), m.entry.x, m.entry.y).length) {
      add(`entry:${m.id}`, 'places', 'warn', `The way into ${m.name} arrives ${inBounds(m, m.entry.x, m.entry.y) ? 'inside solid ground' : 'outside the map'}: move its arrival point.`, { tab: 'map', map: m.id, x: m.entry.x, y: m.entry.y });
    }
    for (const e of ents) {
      if (e.type === 'npc' && e.shop && ['weapons', 'armor', 'provisions', 'reagents', 'scrolls', 'mixed'].includes(e.shop.kind) && !(e.shop.stock || []).length) {
        emptyShops++;
        add(`shop:${e.id}`, 'places', 'warn', `${e.name || 'A shopkeeper'} in ${m.name} keeps a shop with nothing for sale.`, goEnt(m, e));
      }
      if ((e.type === 'npc' || e.type === 'monster') && inBounds(m, e.x, e.y)) {
        const t = terrain(getTile(m, e.x, e.y));
        const swims = e.type === 'monster' && (game.monsters || []).find((d) => d.id === e.monster)?.swim;
        if (!(swims ? t.water : t.walk)) {
          // the party meets whoever it bumps into, so only a square with no way up to it strands them
          const who = e.type === 'npc' ? e.name || 'Someone' : `A band of ${monName(e.monster)}`;
          const them = e.type === 'npc' ? 'them' : 'it';
          const what = t.name.toLowerCase();
          if (R.maps.has(m.id) && !R.at(m, e.x, e.y)) add(`wall:${e.id}`, 'places', 'warn', `${who} in ${m.name} stands in the ${what} where nobody can get to ${them}.`, goEnt(m, e));
          else if (t.wall) add(`wall:${e.id}`, 'places', 'warn', `${who} in ${m.name} stands inside a ${what}: move ${them} out into the open.`, goEnt(m, e));
          else add(`wall:${e.id}`, 'map', 'todo', `${who} in ${m.name} stands on a ${what}: move ${them} onto the floor beside it.`, goEnt(m, e));
        }
      }
    }
  }
  if (places.length && !emptyShops) add('ok-shops', 'places', 'ok', 'Every shop has something to sell.');

  // ---------------------------------------------------------- story
  const quests = game.quests || [];
  const chapters = chapterList(game);
  if (!quests.length) add('noquests', 'story', 'todo', 'No quests yet: give the players something to do.', { tab: 'story' });
  if (!chapters.length) add('nochapters', 'story', 'todo', 'No chapters yet: group the quests into chapters to see the shape of the adventure.', { tab: 'story' });
  else add('ok-chapters', 'story', 'ok', `The story has ${plural(chapters.length, 'chapter')}.`);
  const spans = chapters.length ? questSpans(game) : null;
  for (const ch of chapters) {
    const go = { tab: 'story', chapter: ch.id };
    // (a long quest may run on through several chapters)
    const qs = questsInChapter(game, ch, spans);
    if (!qs.length) add(`ch-empty:${ch.id}`, 'story', 'todo', `Chapter “${ch.name}” has no quests yet.`, go);
    const involved = new Set();
    for (const q of qs) { involved.add(q.giver); for (const st of q.stages || []) if (st.goal?.npc) involved.add(st.goal.npc); }
    for (const c of ch.cast || []) {
      if (!c?.npc) continue;
      if (!ix.npcs.has(c.npc)) add(`cast-gone:${ch.id}:${c.npc}`, 'story', 'warn', `Chapter “${ch.name}” needs someone who is no longer in the realm.`, go);
      else if (!involved.has(c.npc)) add(`cast-idle:${ch.id}:${c.npc}`, 'story', 'todo', `${where(c.npc).e.name || 'Someone'} is in the cast of “${ch.name}” but none of its quests uses them.`, go);
    }
    const end = ch.ends || {};
    if (end.type === 'stage' && !quests.some((q) => q.id === end.quest)) add(`ch-end:${ch.id}`, 'story', 'warn', `Chapter “${ch.name}” ends at a step of a quest that no longer exists.`, go);
    if (end.type === 'flag' && end.flag && !ix.flagSrc.has(end.flag)) add(`ch-end:${ch.id}`, 'story', 'warn', `Chapter “${ch.name}” ends when “${end.flag}” is set, but nothing sets it.`, go);
  }
  // (company) mysteries: someone to judge, a culprit among the suspects, clues that can be found
  const myst = mysteriesOf(game);
  let mystTrouble = 0;
  for (const my of myst) {
    const probs = mysteryProblems(game, my, ix);
    mystTrouble += probs.length;
    for (const p of probs) add(`myst:${my.id}:${shortHash(p.text)}`, 'story', p.level, `Mystery “${my.name || my.id}”: ${p.text}`, { tab: 'story', mystery: my.id });
  }
  if (myst.length && !mystTrouble) add('ok-myst', 'story', 'ok', `${plural(myst.length, 'mystery', 'mysteries')}, each with a judge, a culprit among the suspects and clues to find.`, { tab: 'story' });
  // (company) companions' banter and leaving rules wait on flags something must set
  for (const m of game.maps) for (const e of m.entities || []) {
    const r = e.type === 'npc' && e.recruit;
    if (!r) continue;
    const who = e.name || 'A companion';
    const lv = r.leaves;
    if (lv) {
      for (const f of needFlags(lv.need)) if (!ix.flagSrc.has(f) && !/^killed_/.test(f)) add(`leaveflag:${e.id}:${f}`, 'story', 'warn', `${who} leaves the company when “${f}” is set, but nothing sets it.`, goEnt(m, e));
      if (lv.hostile && !(game.monsters || []).some((x) => x.id === lv.hostile.monster)) add(`leavefoe:${e.id}`, 'story', 'warn', `${who} turns on the company as a monster that no longer exists.`, goEnt(m, e));
      if (lv.goTo && !mapById.get(lv.goTo.map)) add(`leaveto:${e.id}`, 'story', 'warn', `${who} goes, on leaving, to a map that no longer exists.`, goEnt(m, e));
    }
    (r.banter || []).forEach((b, i) => {
      for (const f of needFlags(b?.need)) if (!ix.flagSrc.has(f) && !/^killed_/.test(f)) add(`banterflag:${e.id}:${i}:${f}`, 'story', 'todo', `${who} has a line for when “${f}” is set, but nothing sets it.`, goEnt(m, e));
    });
  }
  // (company) more heroes set out than the company can hold
  const sh = parseInt(game.settings?.startHeroes, 10);
  if (sh > 0 && sh > (game.settings?.maxParty || 6)) add('startheroes', 'campaign', 'warn', `${plural(sh, 'hero sets', 'heroes set')} out, but the largest company is ${game.settings?.maxParty || 6}: only ${game.settings?.maxParty || 6} will. Change one of them on the Rules page.`, { tab: 'rules' });
  else if (startHeroes(game).fixed && startHeroes(game).n < 4 && !game.maps.some((m) => (m.entities || []).some((e) => e.type === 'npc' && (e.recruit || (e.keywords || []).some((k) => k.action?.type === 'join'))))) {
    add('lonely', 'story', 'todo', `${startHeroes(game).n === 1 ? 'A lone hero sets out' : `Only ${startHeroes(game).n} heroes set out`}, but nobody in the realm can join them: tick “Can JOIN the party” on someone.`, { tab: 'story' });
  }
  // the story played through step by step, as a company would: where it stalls
  if (quests.length) {
    let walk = null;
    try { walk = walkStory(game); } catch (e) { console.error(e); }
    if (walk) {
      for (const st of walk.stuck) {
        add(`walk:${st.quest.id}`, 'story', 'warn', `Played through, a company gets stuck on “${st.quest.name}” at step ${st.step + 1}${st.why ? ': ' + st.why : ''}.`, { tab: 'story', quest: st.quest.id });
      }
      if (!walk.stuck.length && walk.won === false) add('walk-win', 'story', 'warn', 'Played through, every quest can be finished but the game is never won: check how it ends on the Campaign step.', { tab: 'campaign' });
      else if (!walk.stuck.length && walk.won) add('ok-walk', 'story', 'ok', 'Played through step by step, the story can be won.');
    }
  }
  let questTrouble = 0;
  const needs = new Map(); // item -> [{ text, go, hard }]
  const need = (id, text, go, hard) => { if (!id) return; let l = needs.get(id); if (!l) needs.set(id, l = []); l.push({ text, go, hard }); };
  const killNeeds = new Map(); // monster -> [quest]
  for (const q of quests) {
    const go = { tab: 'story', quest: q.id };
    const probs = questProblems(game, q);
    questTrouble += probs.length;
    for (const p of probs) add(`qp:${q.id}:${shortHash(p)}`, 'story', 'warn', `“${q.name || q.id}”: ${p}`, go);
    (q.stages || []).forEach((st, i) => {
      const g = st.goal || {};
      if ((g.type === 'deliver' || g.type === 'collect') && g.item) need(g.item, `step ${i + 1} of “${q.name}”`, go, true);
      if (g.type === 'kill' && g.monster && (game.monsters || []).some((m) => m.id === g.monster)) { let l = killNeeds.get(g.monster); if (!l) killNeeds.set(g.monster, l = []); l.push(q); }
      if (g.type === 'flag') for (const f of flagList(g.flags || g.flag)) if (!ix.flagSrc.has(f) && !/^killed_/.test(f)) add(`noflag:${q.id}:${f}`, 'story', 'warn', `“${q.name}” waits for the flag “${f}”, but nothing in the realm sets it.`, go);
    });
    // the people a quest sends the party to must be within reach
    const who = new Set([q.giver, ...(q.stages || []).filter((st) => st.goal?.type === 'talk' || st.goal?.type === 'deliver').map((st) => st.goal.npc || q.giver)].filter(Boolean));
    for (const id of who) {
      const w = where(id);
      if (w && !npcReached(id)) add(`far:${q.id}:${id}`, 'story', 'warn', `${w.e.name || 'Someone'}, whom “${q.name}” sends the party to, is in ${w.map.name}, which the party cannot reach.`, goEnt(w.map, w.e));
    }
  }
  if (quests.length && !questTrouble) add('ok-quests', 'story', 'ok', `${plural(quests.length, 'quest')}, each one complete.`);
  for (const m of game.maps) for (const e of m.entities || []) {
    if (e.type === 'portal' && e.requires) need(e.requires, `the way into ${mapById.get(e.target?.map)?.name || 'somewhere'}`, goEnt(m, e), true);
    if (e.type === 'event') for (const c of e.choices || []) {
      if (c.req?.type === 'item') need(c.req.value, `“${c.label || 'a choice'}” at ${e.name || 'a curiosity'}`, goEnt(m, e), false);
      if (c.cost?.item) need(c.cost.item, `“${c.label || 'a choice'}” at ${e.name || 'a curiosity'}`, goEnt(m, e), false);
    }
    if (e.type === 'npc') for (const k of e.keywords || []) if (k.cond?.type === 'item') need(k.cond.value, `${e.name || 'someone'}’s words about ${String(k.key || '').toUpperCase() || 'something'}`, goEnt(m, e), false);
  }
  let lacking = 0;
  for (const [id, list] of needs) {
    if (ix.itemSrc.has(id) || !(game.items || []).some((it) => it.id === id)) continue;
    lacking++;
    const hard = list.some((n) => n.hard);
    add(`nosrc:${id}`, 'story', hard ? 'error' : 'warn', `Nothing in the realm gives the ${itemName(id)}, yet ${listNames(list.map((n) => n.text), 2)} ${list.length > 1 ? 'need' : 'needs'} it.`, (list.find((n) => n.hard) || list[0]).go);
  }
  if (needs.size && !lacking) add('ok-items', 'story', 'ok', 'Every key and quest item can be found somewhere.');
  for (const [id, qs] of killNeeds) {
    if (ix.met.has(id)) {
      if (outOfReach(id)) add(`farmon:${id}`, 'story', 'warn', `“${qs[0].name}” asks the party to defeat ${monName(id)}, but it stands only where the party cannot reach.`, goPlaced(id));
      continue;
    }
    add(`nomon:${id}`, 'story', 'error', `“${qs[0].name}” asks the party to defeat ${monName(id)}, but it stands nowhere and nothing summons it: place it on a map.`, { tab: 'story', quest: qs[0].id });
  }

  // ---------------------------------------------------------- details
  const startLevel = Math.max(1, s.startLevel || 1);
  for (const m of game.maps) {
    let plain = 0, people = 0;
    for (const e of m.entities || []) {
      if (e.type === 'npc') {
        people++;
        if (!String(e.name || '').trim()) add(`noname:${e.id}`, 'map', 'todo', `Someone in ${m.name} has no name.`, goEnt(m, e));
        if (DEFAULT_WORDS.has(String(e.greeting || '').trim()) && DEFAULT_WORDS.has(String(e.job || '').trim()) && !(e.keywords || []).length
          && !e.rumour && !e.recruit && !ix.questRoles.has(e.id) && !['inn', 'healer', 'shipwright'].includes(e.role) && !e.shop) plain++;
      } else if (e.type === 'sign' && (!String(e.text || '').trim() || e.text === DEFAULT_SIGN)) {
        add(`sign:${e.id}`, 'map', 'todo', `A sign in ${m.name} still says “${e.text || '…'}”.`, goEnt(m, e));
      } else if (e.type === 'chest' && !(e.items || []).length && !e.flag && !(String(e.gold ?? '').trim() && String(e.gold).trim() !== '0')) {
        add(`chest:${e.id}`, 'map', 'todo', `A chest in ${m.name} holds nothing.`, goEnt(m, e));
      } else if (e.type === 'monster' && m.id === sm.id && !e.passive) {
        const def = (game.monsters || []).find((d) => d.id === e.monster);
        const d = Math.abs(e.x - (s.start?.x || 0)) + Math.abs(e.y - (s.start?.y || 0));
        if (def && d <= DANGER_REACH && (def.level || 1) >= startLevel + DANGER_STEP) add(`danger:${e.id}`, 'map', 'warn', `${def.name} (level ${def.level}) waits ${plural(d, 'step')} from the start, far beyond a new company.`, goEnt(m, e));
      }
    }
    if (plain >= 3 && plain * 2 >= people) add(`plain:${m.id}`, 'map', 'todo', `${plain} of the ${people} people in ${m.name} still say only the words they were made with: give a few of them something to tell.`, { tab: 'map', map: m.id });
  }

  // ---------------------------------------------------------- test
  const cov = opt.coverage;
  if (!cov || !cov.last) add('test-never', 'test', 'todo', 'You have not playtested the realm yet.', { tab: 'test' });
  else {
    add('ok-tested', 'test', 'ok', `Playtested ${plural(cov.count || 1, 'time')}, last ${ago(cov.last)}.`, { tab: 'test' });
    const unvisited = places.filter((p) => !cov.visited?.[p.map.id]);
    if (unvisited.length) add('test-visit', 'test', 'todo', `${plural(unvisited.length, 'place has', 'places have')} never been visited in a playtest: ${listNames(unvisited.map((p) => p.map.name))}.`, { tab: 'test' });
    else if (places.length) add('ok-visit', 'test', 'ok', 'Every place has been visited in a playtest.', { tab: 'test' });
    const open = quests.filter((q) => cov.quests?.[q.id] !== 'done');
    if (open.length) add('test-quests', 'test', 'todo', `${plural(open.length, 'quest has', 'quests have')} never been finished in a playtest: ${listNames(open.map((q) => `“${q.name}”`))}.`, { tab: 'test' });
    else if (quests.length) add('ok-qdone', 'test', 'ok', 'Every quest has been finished in a playtest.', { tab: 'test' });
    const unreached = chapters.filter((c) => !cov.chapters?.[c.id]);
    if (chapters.length && unreached.length) add('test-chapters', 'test', 'todo', `${plural(unreached.length, 'chapter has', 'chapters have')} never been reached in a playtest: ${listNames(unreached.map((c) => `“${c.name}”`))}.`, { tab: 'test' });
    const ch = changesSince(game, cov.sig);
    if (ch) add('test-stale', 'test', 'todo', `Much has changed since the last playtest (${ch}): play it through again.`, { tab: 'test' });
  }

  const ignored = new Set(game.meta?.checklistIgnore || []);
  for (const f of out) if (ignored.has(f.id)) f.ignored = true;
  return opt.withIgnored ? out : out.filter((f) => !f.ignored);
}

// Does a map (once reached) lead anywhere else?
function wayOut(R, m) {
  for (const k of R.reached) {
    if (!k.startsWith(m.id + ':')) continue;
    for (const t of R.ways.get(k) || []) if (t[0] === 'sea' || t[0] !== m.id) return true;
  }
  return false;
}

// "3 hours ago"
export function ago(t, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400 * 1.5) return plural(Math.round(s / 3600), 'hour') + ' ago';
  return plural(Math.round(s / 86400), 'day') + ' ago';
}

// ------------------------------------------------------------ change since a playtest
// A small fingerprint of the realm, kept with the coverage when a playtest
// begins: a hash per map (its tiles and what stands where) and of the quests
// and the story.
export function realmSig(game) {
  const maps = {};
  for (const m of game.maps) {
    let h = tileHash(m);
    for (const e of m.entities || []) h = Math.imul(h ^ (shortHashNum(`${e.id}${e.type}${e.x},${e.y}`)), 16777619) >>> 0;
    maps[m.id] = h >>> 0;
  }
  return { maps, quests: shortHash(JSON.stringify(game.quests || [])), story: shortHash(JSON.stringify(game.story || {})) };
}
function shortHashNum(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// What changed a lot since the fingerprint was taken ('' when little did)
export function changesSince(game, sig) {
  if (!sig?.maps) return '';
  const now = realmSig(game);
  let maps = 0;
  for (const [id, h] of Object.entries(now.maps)) if (sig.maps[id] !== h) maps++;
  const quests = now.quests !== sig.quests, story = now.story !== sig.story;
  const score = maps + (quests ? 2 : 0) + (story ? 1 : 0);
  if (score < 3) return '';
  return [maps ? plural(maps, 'map') : '', quests ? 'the quests' : '', story ? 'the chapters' : ''].filter(Boolean).join(', ');
}

// ------------------------------------------------------------ coverage
// What playtests have seen, kept with the realm (game.meta.playtest):
//   { last, count, visited: {mapId: t}, quests: {qid: 'started'|'done'},
//     chapters: {id: t}, wins, defeats, sig }
export function coverageOf(game, create = false) {
  const meta = game.meta || (game.meta = {});
  let c = meta.playtest;
  if (!c || typeof c !== 'object') { if (!create) return null; c = meta.playtest = {}; }
  c.visited ||= {}; c.quests ||= {}; c.chapters ||= {};
  c.count ||= 0; c.wins ||= 0; c.defeats ||= 0;
  return c;
}
