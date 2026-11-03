// Story building blocks for designers: beats (a fetch, a slaying, a key and
// its gate, a companion who must come along...) that write real quests,
// people and items into a realm, and premises that sketch a whole adventure
// of chapters from them.
//
// Beats: addBeat(game, kind, opt) → { quest, notes, made }. Every beat writes
// one quest (into opt.chapter), worded with the real names, and whatever it
// needs: a person standing in a town, a quest item in a chest or on a boss, a
// named foe in a dungeon, a lock on a gate. Common options:
//   chapter: chapter id · giver: person (below) or '' · after: the quest it
//   waits for (default: the last quest of the chapter; null: none) · main ·
//   auto (starts by itself; default when nobody gives it) · reward: {gold, xp} · seed
// A person is an npc id, or { name?, map, role?, race?, greeting? } for a new
// one stood on a free square of that map (see placePerson).
// Per kind: talk {who, say?} · fetch {item, map, hold: 'chest'|'boss', boss?} ·
//   slay {monster, map, count?} · gate {portal, key, from: 'person'|'reward'|
//   'monster', person?, quest?, foe?, map?} · companion {who, joinAfter?, to?, cls?} ·
//   clear {map} · explore {map}
// An item is an item id or { name, desc? } for a new quest item; a monster is
// a monster id or { base, name } for a new named foe.
import { FEATURE_KINDS, terrain } from '../data/terrain.js';
import { getTile, inBounds } from './map.js';
import { makeNpc, randomName, npcNameWords } from './generate.js';
import { placesOf, autoPlaceSites } from './places.js';
import { RNG } from '../core/rng.js';
import { uniqueId, deepClone } from '../core/util.js';
import { worldMap, getMap } from '../data/schema.js';
import { chapterList, chapterById, newChapter, questsOfChapter, mapReach } from '../game/story.js';
import { describeGoal } from '../game/quests.js';

const TOWNLIKE = new Set(['town', 'castle', 'village', 'elfhall', 'dwarfgate', 'harbour']);

// Premises the Quick Start offers: { id: { label, desc, needs } } where needs
// lists the kinds of place (FEATURE_KINDS keys) the story wants to exist;
// the Quick Start ticks them for the designer.
export const PREMISES = {
  darklord: { label: 'The Dark Lord', desc: 'A tyrant wakes in his fortress. Find the weapon that can hurt him, win the key to his gate and an ally to stand beside you, and end him.', needs: ['fortress'] },
  relic: { label: 'The Stolen Relic', desc: 'A holy relic is stolen from the temple. Follow the thieves\' trail to their den, take it back and bring it home.', needs: ['cave'] },
  curse: { label: 'The Curse on the Land', desc: 'The crops wither and the wells run foul. A witch in her tower has cursed the land: find what can break her power, and break it.', needs: ['tower'] },
  heir: { label: 'The Lost Heir', desc: 'The rightful heir is lost and a usurper rules. Find the heir, bring down the usurper\'s champion, and see the heir crowned.', needs: ['castle'] },
  blank: { label: 'No story yet', desc: 'Just the land and its places: write the story yourself.', needs: [] },
};

// The beats a designer can add to a chapter
export const BEATS = {
  talk: { label: 'Talk', icon: '🗣', desc: 'Go and see someone in a place' },
  fetch: { label: 'Fetch', icon: '💎', desc: 'Someone needs an item from a dungeon: it waits in the deepest chest, or its boss carries it' },
  slay: { label: 'Slay', icon: '⚔', desc: 'A monster troubles a place: defeat it, and return' },
  gate: { label: 'Key & gate', icon: '🗝', desc: 'A site or passage is locked; its key comes from a person, a quest reward or a monster' },
  companion: { label: 'Companion', icon: '🛡', desc: 'Someone joins the company after a quest, and a later step needs them along' },
  clear: { label: 'Clear', icon: '🔥', desc: 'Clear a dungeon of its monsters' },
  explore: { label: 'Explore', icon: '🧭', desc: 'Reach a place' },
};

// Roles a new story person can have (none keeps a shop)
export const PERSON_ROLES = [['villager', 'Townsfolk'], ['lord', 'Lord or lady'], ['guard', 'Guard or captain'], ['sage', 'Sage or priest'], ['companion', 'Adventurer']];
const GREETINGS = {
  villager: 'Well met, travellers. These are troubled days.',
  lord: 'Welcome to my hall. I have need of brave souls.',
  guard: 'Halt — ah, adventurers. I could use the likes of thee.',
  sage: 'Ah, visitors. I have been reading the signs, and they are not good.',
  companion: 'Looking for a sword-arm? I have been waiting for someone like thee.',
};
const TITLES = { villager: ['', 'Old', 'Goodwife', 'Farmer'], lord: ['Lord', 'Lady', 'Elder'], guard: ['Captain', 'Sergeant'], sage: ['Brother', 'Sister', 'Master'], companion: [''] };
const FEMALE = new Set(['Lady', 'Sister', 'Goodwife', 'Dame', 'Queen', 'Mistress']);
const MALE = new Set(['Lord', 'Brother', 'Master', 'Sir', 'King', 'Farmer']);
const TITLE_WORDS = /^(Old|Lord|Lady|Elder|Captain|Sergeant|Brother|Sister|Master|Goodwife|Farmer|Steward|Mayor|King|Queen|Sir|Dame)$/;

// ------------------------------------------------------------ places
export const townsOf = (game) => placesOf(game).filter((p) => TOWNLIKE.has(p.kind) && p.map.type !== 'world' && p.map.type !== 'dungeon');
export const dungeonsOf = (game) => placesOf(game).filter((p) => p.map.type === 'dungeon');
export const isDungeon = (map) => map?.type === 'dungeon';

// Distances over walkable ground from where a map is entered (doors count)
function distances(map, from) {
  const dist = new Int32Array(map.w * map.h).fill(-1);
  const start = from || map.entry || { x: Math.floor(map.w / 2), y: Math.floor(map.h / 2) };
  if (!inBounds(map, start.x, start.y)) return dist;
  const q = [start.x, start.y];
  dist[start.y * map.w + start.x] = 0;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1], d = dist[y * map.w + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(map, nx, ny) || dist[ny * map.w + nx] >= 0) continue;
      const t = terrain(getTile(map, nx, ny));
      if (!(t.walk || t.door) || t.water) continue;
      dist[ny * map.w + nx] = d + 1;
      q.push(nx, ny);
    }
  }
  return dist;
}

const INDOOR_FLOOR = new Set(['floor_wood', 'floor_stone', 'carpet']);

// A free square to stand something on: open floor the company can walk to,
// not a door, a counter or the way in, with nobody beside it. opt.deep: as far
// from the way in as can be (the deepest room); else near opt.near (within
// opt.r steps on a world map), or the middle of the map.
export function freeSpot(map, rng, opt = {}) {
  const world = map.type === 'world';
  const from = world ? (opt.from || opt.near || { x: Math.floor(map.w / 2), y: Math.floor(map.h / 2) }) : null;
  const dist = distances(map, from);
  const entry = map.entry || from || { x: 0, y: 0 };
  const near = opt.near || { x: Math.floor(map.w / 2), y: Math.floor(map.h / 2) };
  const busy = new Uint8Array(map.w * map.h);
  for (const e of map.entities) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) <= 1 && inBounds(map, e.x + dx, e.y + dy)) busy[(e.y + dy) * map.w + e.x + dx] = 1;
  let best = null, bestScore = -Infinity;
  for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < map.w - 1; x++) {
    const d = dist[y * map.w + x];
    if (d < 0 || busy[y * map.w + x]) continue;
    const t = terrain(getTile(map, x, y));
    if (!t.walk || t.door || t.water || t.feature || t.talkOver || /stairs/.test(t.key)) continue;
    if (Math.abs(x - entry.x) + Math.abs(y - entry.y) < 3) continue;
    let score;
    if (opt.deep) score = d + rng.float(0, 1.5);
    else {
      score = -Math.hypot(x - near.x, y - near.y) + rng.float(0, 2.5);
      if (INDOOR_FLOOR.has(t.key) && !opt.indoors) score -= 6;
      if (world && d > (opt.r || 8)) score -= 100;
    }
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best || { x: entry.x, y: entry.y };
}

// The site entrance on a world map that leads to a map, if any
export function siteOf(game, map) {
  for (const w of game.maps) {
    if (w.type !== 'world') continue;
    const p = w.entities.find((e) => e.type === 'portal' && e.target?.map === map.id);
    if (p) return { world: w, portal: p };
  }
  return null;
}

function raceForPlace(game, map) {
  const site = siteOf(game, map);
  const key = site ? terrain(getTile(site.world, site.portal.x, site.portal.y)).key : '';
  return key === 'elfhall' ? 'elf' : key === 'dwarfgate' ? 'dwarf' : 'human';
}

// Stand a new named person on a free square of a map, with a role and a
// line of greeting. spec: { name?, role?, race?, greeting?, desc?, title?, job? }
export function placePerson(game, map, spec = {}, seed = Math.floor(Math.random() * 1e9)) {
  const rng = new RNG(seed);
  const role = spec.role || 'villager';
  const race = spec.race || raceForPlace(game, map);
  const at = freeSpot(map, rng, { near: spec.near || (map.type === 'world' ? game.settings.start : null), r: 6 });
  let name = (spec.name || '').trim();
  let face = null;
  if (!name) {
    // a title and a name that agree (no "Lord Gwen"), and a face to match
    const title = spec.title ?? rng.pick(TITLES[role] || ['']);
    const sex = FEMALE.has(title) ? 'f' : MALE.has(title) ? 'm' : rng.chance(0.5) ? 'f' : 'm';
    face = sex === 'f' ? 'fair' : 'bold';
    name = `${title ? title + ' ' : ''}${randomName(race, rng, npcNameWords(game), { face })}`;
  }
  const what = { villager: 'local', lord: 'noble', guard: 'guard', sage: 'scholar', companion: 'adventurer' }[role] || 'local';
  const npc = makeNpc(role === 'companion' ? 'villager' : role, race, at.x, at.y, rng, {
    name, greeting: spec.greeting || GREETINGS[role] || GREETINGS.villager,
    job: spec.job || { lord: 'I hold this place for my people, as my mothers and fathers did.', guard: 'I keep the peace, such as it is.', sage: 'I study the old lore, and the stars.', companion: 'I sell my sword to good causes. Mostly good ones.' }[role] || 'I work hard and keep my head down.',
    desc: spec.desc || `a ${race === 'human' ? '' : race + ' '}${what}`.replace('  ', ' '),
    wander: spec.wander ?? (role === 'lord' ? 0 : 1),
  });
  npc.role = role;
  npc.shop = null;
  if (face) npc.look.face = face;
  if (role === 'companion') npc.look = { ...npc.look, armor: 'leather', weapon: rng.pick(['sword', 'axe', 'spear', 'bow']), cape: rng.pick([0x4a2a1a, 0x2a3a5a, 0x3a4a2a]) };
  map.entities.push(npc);
  return npc;
}

export function npcPlace(game, id) {
  for (const m of game.maps) { const e = m.entities.find((x) => x.id === id); if (e) return { npc: e, map: m }; }
  return null;
}

// A person spec → the npc: an id is looked up, an object stands a new one
function person(game, spec, rng, notes, made) {
  if (!spec) return null;
  if (typeof spec === 'string') {
    const f = npcPlace(game, spec);
    if (f?.npc?.type === 'npc') return f.npc;
    notes.push('That person is no longer in the game.');
    return null;
  }
  const map = getMap(game, spec.map) || townsOf(game)[0]?.map || worldMap(game);
  const npc = placePerson(game, map, spec, rng.int(1, 1e9));
  made.npcs.push(npc);
  notes.push(`${npc.name} now stands in ${map.name}.`);
  return npc;
}

// ------------------------------------------------------------ items & foes
// A new quest item (unique, not for sale)
export function makeQuestItem(game, name, desc = '') {
  const id = uniqueId(name, game.items.map((i) => i.id));
  const it = { id, name, type: 'quest', unique: true, price: 0, desc };
  game.items.push(it);
  return it;
}

function item(game, spec, made) {
  if (!spec) return null;
  if (typeof spec === 'string') return game.items.find((i) => i.id === spec) || null;
  const it = makeQuestItem(game, (spec.name || '').trim() || 'Strange Token', spec.desc || '');
  made.items.push(it);
  return it;
}

// A named foe: a unique boss built on an ordinary monster, a little tougher
export function makeNamedFoe(game, base, name, extra = {}) {
  const b = game.monsters.find((m) => m.id === base) || game.monsters.filter((m) => !m.boss).sort((a, c) => (c.level || 1) - (a.level || 1))[0] || game.monsters[0];
  const id = uniqueId(name, game.monsters.map((m) => m.id));
  const m = { ...deepClone(b), id, name, plural: name, boss: true, habitat: [], group: [1, 1] };
  m.level = (b.level || 1) + 1;
  m.xp = Math.round((b.xp || 20) * 3);
  if (m.look) m.look = { ...m.look, scale: Math.max(1.25, (m.look.scale || 1) * 1.25) };
  Object.assign(m, extra);
  game.monsters.push(m);
  return m;
}

function monster(game, spec, made) {
  if (!spec) return null;
  if (typeof spec === 'string') return game.monsters.find((m) => m.id === spec) || null;
  const m = makeNamedFoe(game, spec.base, (spec.name || '').trim() || 'The Nameless Thing');
  made.monsters.push(m);
  return m;
}

// Stand a band of monsters on a map: a dungeon's deepest room, or the open
// land just outside a town (its site on the world map), or near the start.
// Returns { ent, map } (map: where it was put)
export function placeMonster(game, map, def, rng, opt = {}) {
  let host = map;
  let spot = null;
  if (!isDungeon(map) && map.type !== 'world') {
    const site = siteOf(game, map);
    if (site) {
      host = site.world;
      const at = { x: site.portal.x, y: site.portal.y };
      spot = freeSpot(host, rng, { near: at, from: at, r: 7 });
    }
  }
  if (!spot) spot = host.type === 'world' ? freeSpot(host, rng, { near: game.settings.start, from: game.settings.start, r: 12 }) : freeSpot(host, rng, { deep: true });
  const ent = { id: uniqueId('mon_' + def.id, host.entities.map((e) => e.id)), type: 'monster', monster: def.id, x: spot.x, y: spot.y, count: String(opt.count || (def.boss ? 1 : '2-3')), wander: def.boss ? 0 : 3 };
  if (def.boss) ent.boss = true;
  host.entities.push(ent);
  return { ent, map: host };
}

// The chest in a dungeon's deepest room (made if there is none)
export function deepestChest(map, rng) {
  const dist = distances(map);
  let best = null, bd = -1;
  for (const e of map.entities) {
    if (e.type !== 'chest') continue;
    const d = dist[e.y * map.w + e.x];
    if (d > bd) { bd = d; best = e; }
  }
  if (best) return best;
  const at = freeSpot(map, rng, { deep: true });
  const chest = { id: uniqueId('chest_story', map.entities.map((e) => e.id)), type: 'chest', x: at.x, y: at.y, gold: 60, items: [] };
  map.entities.push(chest);
  return chest;
}

// The boss of a dungeon (the placed band marked boss, deepest first), or null
export function bossOf(game, map) {
  const dist = distances(map);
  return map.entities.filter((e) => e.type === 'monster' && (e.boss || game.monsters.find((m) => m.id === e.monster)?.boss))
    .sort((a, b) => dist[b.y * map.w + b.x] - dist[a.y * map.w + a.x])[0] || null;
}

// A base monster of fitting strength for a named foe
export function foeBase(game, level, rng) {
  const ok = game.monsters.filter((m) => !m.boss && (m.level || 1) >= level - 1 && (m.level || 1) <= level + 1 && !/serpent|drake|dragon/.test(m.id));
  return (ok.length ? rng.pick(ok) : game.monsters.filter((m) => !m.boss)[0] || game.monsters[0])?.id;
}

const FOE_NAMES = ['Gorgath', 'Skulnak', 'Vexa', 'Murgrim', 'Old Blackjaw', 'Hrogar', 'Zul', 'Grimtooth', 'Ashka', 'Morvhal', 'Kragg', 'Ulmar'];
const FOE_TITLES = ['the Cruel', 'the Hungry', 'the Pale', 'Bonebreaker', 'the Gaunt', 'the Black', 'Ironhide'];
export function foeName(game, rng) {
  for (let i = 0; i < 30; i++) {
    const n = `${rng.pick(FOE_NAMES)} ${rng.pick(FOE_TITLES)}`;
    if (!game.monsters.some((m) => m.name === n)) return n;
  }
  return `${rng.pick(FOE_NAMES)} the ${rng.int(2, 9)}th`;
}

// ------------------------------------------------------------ quests
function writeQuest(game, props) {
  const q = {
    name: 'A Quest', giver: '', main: false, auto: false, requires: null, offer: '', accept: 'We will do it.', summary: '',
    stages: [], reward: { gold: 50, xp: 50, items: [] }, doneText: '', thanks: '', ...props,
  };
  q.id = uniqueId(q.name, [...(game.quests || []).map((x) => x.id), ...chapterList(game).map((c) => c.id)]);
  if (!q.reward.items) q.reward.items = [];
  for (const s of q.stages) if (!s.text) s.text = describeGoal(game, q, s.goal);
  if (!q.chapter) delete q.chapter;
  (game.quests ||= []).push(q);
  return q;
}

const first = (npc) => (npc?.name || 'someone').split(' ').filter((w) => !TITLE_WORDS.test(w))[0] || npc?.name || 'someone';
const placeName = (game, npc) => npcPlace(game, npc?.id)?.map?.name || 'the wilds';
const where = (game, npc) => { const m = npcPlace(game, npc?.id)?.map; return m && m.type !== 'world' ? ` in ${m.name}` : ''; };
const the = (name) => (/^(the|a|an) /i.test(name) ? name : 'the ' + name);
const The = (name) => { const s = the(name); return s[0].toUpperCase() + s.slice(1); };

// The quest a new beat follows by default: the last one in its chapter
export function lastQuestOf(game, chapterId) {
  const ch = chapterById(game, chapterId);
  const list = ch ? questsOfChapter(game, ch) : [];
  return list[list.length - 1] || null;
}

// Write one beat into the game. Returns { quest, notes, made }
export function addBeat(game, kind, opt = {}) {
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const notes = [];
  const made = { npcs: [], items: [], monsters: [] };
  const giver = person(game, opt.giver, rng, notes, made);
  const base = {
    chapter: opt.chapter || undefined, giver: giver?.id || '', main: !!opt.main,
    requires: opt.after === undefined ? lastQuestOf(game, opt.chapter)?.id || null : opt.after || null,
    reward: { gold: +(opt.reward?.gold ?? 60), xp: +(opt.reward?.xp ?? 60), items: [] },
  };
  // nobody gives it: it starts by itself (when its chapter opens, or the quest before it ends)
  base.auto = opt.auto ?? !giver;
  const back = giver ? [{ goal: { type: 'talk', npc: '' } }] : [];
  // a quest that starts by itself but has a giver begins by going to see them
  const meet = (say) => (base.auto && giver ? [{ goal: { type: 'talk', npc: '' }, say }] : []);
  let q = null;
  switch (kind) {
    case 'talk': {
      const who = person(game, opt.who, rng, notes, made);
      if (!who) break;
      q = writeQuest(game, {
        ...base, name: opt.name || `A Word with ${first(who)}`,
        offer: giver ? `Go to ${placeName(game, who)} and find ${who.name}. ${first(who)} knows more of this than I do — say that I sent thee.` : '',
        summary: `${giver ? giver.name + ' sends the company' : 'The company must go'} to speak with ${who.name}${where(game, who)}.`,
        stages: [
          ...(giver !== who ? meet(`Thank the stars thou art here. Go to ${placeName(game, who)} and find ${who.name}. Tell ${first(who)} I sent thee.`) : []),
          { goal: { type: 'talk', npc: who.id }, say: opt.say || `${giver && giver !== who ? first(giver) + ' sent thee? Then' : 'So,'} hear me, for there is little time.` },
        ],
      });
      break;
    }
    case 'fetch': {
      const map = getMap(game, opt.map);
      const it = item(game, opt.item, made);
      if (!map || !it) { notes.push('Choose a dungeon and an item.'); break; }
      let holder = null;
      if (opt.hold === 'boss') {
        let ent = opt.boss ? null : bossOf(game, map);
        if (!ent) {
          let def = monster(game, opt.boss, made);
          if (!def) { def = makeNamedFoe(game, foeBase(game, (map.level || 1) + 2, rng), foeName(game, rng)); made.monsters.push(def); }
          ent = placeMonster(game, map, def, rng).ent;
        }
        (ent.loot ||= []).push({ id: it.id, n: 1 });
        holder = game.monsters.find((m) => m.id === ent.monster);
        notes.push(`${holder?.name || 'The boss'} of ${map.name} carries ${the(it.name)}.`);
      } else {
        const chest = deepestChest(map, rng);
        (chest.items ||= []).push({ id: it.id, n: 1 });
        notes.push(`${The(it.name)} waits in the deepest chest of ${map.name}.`);
      }
      q = writeQuest(game, {
        ...base, name: opt.name || The(it.name),
        offer: `${The(it.name)} lies in ${map.name}${holder ? `, in the hands of ${holder.name}` : ''}. Bring it to me, and thou shalt not go unrewarded.`,
        summary: `${giver ? giver.name + ' needs' : 'The company needs'} ${the(it.name)}, which lies in ${map.name}${holder ? ' with ' + holder.name : ''}.`,
        stages: [
          ...meet(`I have need of ${the(it.name)}. It lies in ${map.name}${holder ? `, and ${holder.name} has it` : ''}. Bring it to me.`),
          { goal: { type: 'collect', item: it.id, map: map.id }, text: `Find ${the(it.name)} in ${map.name}${holder ? ' — ' + holder.name + ' has it' : ''}`, log: `You have ${the(it.name)}.` },
          ...(giver ? [{ goal: { type: 'deliver', npc: '', item: it.id }, say: `${The(it.name)}! Thou hast done it. Here — this is thine.` }] : []),
        ],
      });
      break;
    }
    case 'slay': {
      const map = getMap(game, opt.map);
      const def = monster(game, opt.monster, made);
      if (!map || !def) { notes.push('Choose a place and a foe.'); break; }
      const { map: host } = placeMonster(game, map, def, rng, { count: opt.count });
      const at = host === map ? 'in' : 'outside';
      notes.push(`${def.name} now lurks ${at} ${map.name}.`);
      const foe = def.boss ? def.name : 'the ' + (def.plural || def.name).toLowerCase();
      q = writeQuest(game, {
        ...base, name: opt.name || (def.boss ? `${def.name.replace(/^The /, '')} of ${map.name}` : `The ${def.plural || def.name} of ${map.name}`),
        offer: `${def.boss ? def.name : 'A band of ' + (def.plural || def.name).toLowerCase()} troubles ${map.name}. Nobody is safe. Put an end to ${def.boss ? 'it' : 'them'}!`,
        summary: `${def.boss ? def.name + ' troubles' : (def.plural || def.name) + ' trouble'} ${map.name}.`,
        stages: [
          ...meet(`${def.boss ? def.name : 'A band of ' + (def.plural || def.name).toLowerCase()} troubles ${map.name}. Put an end to it!`),
          { goal: { type: 'kill', monster: def.id, n: 1 }, text: `Defeat ${foe} ${at} ${map.name}` },
          ...back.map((s) => ({ ...s, say: `${def.name} is no more? ${map.name} can sleep again. Thank thee!` })),
        ],
      });
      break;
    }
    case 'gate': {
      const found = findPortal(game, opt.portal);
      const it = item(game, opt.key, made);
      if (!found || !it) { notes.push('Choose the way to lock and its key.'); break; }
      const { portal } = found;
      const target = getMap(game, portal.target?.map);
      const gateName = target?.name || portal.label || 'the gate';
      portal.requires = it.id;
      if (!portal.lockedText) portal.lockedText = `The way into ${gateName} is barred, and its lock wants a key: the ${it.name}.`;
      notes.push(`${gateName} is now barred: it needs the ${it.name}.`);
      const stages = [...meet(`None may enter ${gateName} without the ${it.name}. Find it, and the way will open.`)];
      if (opt.from === 'person') {
        const keeper = person(game, opt.person, rng, notes, made) || giver;
        if (!keeper) notes.push('Choose who keeps the key.');
        else stages.push({ goal: { type: 'talk', npc: keeper.id }, text: `Ask ${keeper.name}${where(game, keeper)} for the ${it.name}`, say: `The ${it.name}? Aye, I have kept it all these years. Take it — and may it open the way for thee.`, reward: { items: [{ id: it.id, n: 1 }] } });
      } else if (opt.from === 'reward') {
        const rq = (game.quests || []).find((x) => x.id === opt.quest);
        if (rq) { (rq.reward.items ||= []).push({ id: it.id, n: 1 }); base.requires = rq.id; notes.push(`“${rq.name}” now gives the ${it.name}.`); }
        else notes.push('Choose the quest whose reward is the key.');
        stages.push({ goal: { type: 'collect', item: it.id }, text: `Win the ${it.name}${rq ? ' — the reward for “' + rq.name + '”' : ''}` });
      } else {
        let fent = null;
        if (typeof opt.foe === 'string') for (const m of game.maps) { const e = m.entities.find((x) => x.id === opt.foe && x.type === 'monster'); if (e) fent = e; }
        if (!fent) {
          let fmap = getMap(game, opt.map);
          // (never behind the very gate the key opens)
          if (fmap && fmap === target) { fmap = null; notes.push(`The key's guardian cannot stand in ${target.name}, behind its own gate: it went to another dungeon.`); }
          if (!fmap) {
            // a dungeon the company can get into without a key of its own
            const open = mapReach(game).open;
            const others = dungeonsOf(game).filter((p) => p.map.id !== target?.id);
            fmap = (others.find((p) => open.has(p.map.id)) || others[0])?.map;
          }
          if (fmap) {
            let fdef = monster(game, typeof opt.foe === 'object' ? opt.foe : null, made);
            if (!fdef) { fdef = makeNamedFoe(game, foeBase(game, (fmap.level || 1) + 2, rng), foeName(game, rng)); made.monsters.push(fdef); }
            fent = placeMonster(game, fmap, fdef, rng).ent;
          }
        }
        if (fent) {
          (fent.loot ||= []).push({ id: it.id, n: 1 });
          const fdef = game.monsters.find((m) => m.id === fent.monster);
          stages.push({ goal: { type: 'kill', monster: fent.monster, n: 1 }, text: `Defeat ${fdef?.name || 'the foe'}, who carries the ${it.name}` });
          stages.push({ goal: { type: 'collect', item: it.id }, text: `Take the ${it.name} from ${fdef?.boss ? fdef.name : 'the fallen'}` });
        } else notes.push('No monster to carry the key: choose one.');
      }
      if (target) stages.push({ goal: { type: 'reach', map: target.id }, text: `Open the way into ${target.name} with the ${it.name}`, log: `The ${it.name} turns in the lock. The way into ${target.name} stands open.` });
      q = writeQuest(game, {
        ...base, name: opt.name || `The Way into ${gateName}`,
        offer: `None may enter ${gateName} without the ${it.name}. Find it, and the way will open.`,
        summary: `${gateName} is barred. Its key, the ${it.name}, must be found.`,
        stages,
      });
      break;
    }
    case 'companion': {
      const who = person(game, opt.who, rng, notes, made);
      if (!who) break;
      const after = opt.joinAfter ? (game.quests || []).find((x) => x.id === opt.joinAfter) : null;
      const cls = opt.cls || { lord: 'paladin', guard: 'warrior', sage: 'cleric', companion: 'ranger' }[who.role] || 'warrior';
      who.recruit = {
        ...(who.recruit || {}), race: who.look?.race || 'human', cls: game.classes.some((k) => k.id === cls) ? cls : game.classes[0]?.id, level: opt.level || 2,
        joinText: 'I will gladly join thee!',
        ...(after ? { after: after.id, offerText: 'Thou hast done well. Let me come with thee — I would see this through.', notYet: `Join thee? Not yet. Finish “${after.name}” first.` } : {}),
      };
      notes.push(`${who.name} can now join the company${after ? ' once “' + after.name + '” is done' : ''}.`);
      const to = getMap(game, opt.to);
      if (after && opt.after === undefined) base.requires = after.id;
      q = writeQuest(game, {
        ...base, auto: opt.auto ?? true, name: opt.name || `${first(who)} at Your Side`,
        summary: `${who.name}${where(game, who)} would join the company${to ? ', and must go with it to ' + to.name : ''}.`,
        stages: [
          { goal: { type: 'companion', npc: who.id }, text: `Win ${who.name} to your company — ${after ? 'they will ask to come' : 'ask them to JOIN you'}${where(game, who)}` },
          ...(to ? [{ goal: { type: 'companion', npc: who.id, map: to.id }, text: `Bring ${first(who)} with you to ${to.name}`, log: `${first(who)} looks about ${to.name}. "So this is the place."` }] : []),
        ],
      });
      break;
    }
    case 'clear': {
      const map = getMap(game, opt.map);
      if (!map) { notes.push('Choose a dungeon.'); break; }
      q = writeQuest(game, {
        ...base, name: opt.name || `Clear ${map.name}`,
        offer: `Things have made a nest of ${map.name}. Clear it out, every last one of them.`,
        summary: `${map.name} must be cleared of its monsters.`,
        stages: [
          ...meet(`Things have made a nest of ${map.name}. Clear it out, every last one of them.`),
          { goal: { type: 'clear', map: map.id } },
          ...back.map((s) => ({ ...s, say: `${map.name} is clear? Then the roads are safe again. Well done!` })),
        ],
      });
      break;
    }
    case 'explore': {
      const map = getMap(game, opt.map);
      if (!map) { notes.push('Choose a place.'); break; }
      q = writeQuest(game, {
        ...base, name: opt.name || `The Road to ${map.name}`,
        offer: `Go to ${map.name} and see what is there. Then come back and tell me.`,
        summary: `${giver ? giver.name + ' wants to know' : 'The company must find out'} what lies in ${map.name}.`,
        stages: [
          ...meet(`Go to ${map.name} and see what is there. Then come back and tell me.`),
          { goal: { type: 'reach', map: map.id }, log: `So this is ${map.name}.` },
          ...back.map((s) => ({ ...s, say: `Thou hast been to ${map.name}! Tell me everything.` })),
        ],
      });
      break;
    }
    default: notes.push(`No such beat: ${kind}.`);
  }
  return { quest: q, notes, made };
}

// A portal by id: { portal, map }
export function findPortal(game, id) {
  for (const m of game.maps) { const p = m.entities.find((e) => e.id === id && e.type === 'portal'); if (p) return { portal: p, map: m }; }
  return null;
}

// Ways in that a key could bar: site entrances and passages (not exits, not waygates)
export function lockablePortals(game) {
  const out = [];
  for (const m of game.maps) for (const e of m.entities) {
    if (e.type !== 'portal' || !e.target?.map || e.target.map === 'exit' || e.style === 'waygate') continue;
    const t = getMap(game, e.target.map);
    if (t && t.type !== 'world') out.push({ portal: e, map: m, target: t });
  }
  return out;
}

// ------------------------------------------------------------ a whole story
const SITE_A = ['Ash', 'Bright', 'Cold', 'Elder', 'Green', 'High', 'Long', 'Mist', 'Oak', 'Red', 'Silver', 'Stone', 'Thorn', 'Wolf', 'Raven', 'Black'];
const SITE_B = { town: ['ford', 'bury', 'wick', 'by'], village: ['stead', 'brook', 'field'], castle: ['guard', 'watch', 'keep'], cave: ['delve', 'hollow', 'barrow', 'den'], tower: ['spire', 'needle'], fortress: ['gloom', 'fang', 'doom'] };
function siteName(game, kind, rng) {
  const names = new Set(game.maps.map((m) => m.name));
  for (let i = 0; i < 40; i++) {
    const n = rng.pick(SITE_A) + rng.pick(SITE_B[kind] || ['hold']);
    if (!names.has(n)) return n;
  }
  return `${rng.pick(SITE_A)} ${FEATURE_KINDS[kind]?.label || 'Place'}`;
}

// The texts of each premise: a villain, the thing that helps against them,
// what the chapters are called, the opening story and the ending.
const PLOTS = {
  darklord: {
    villain: { bases: ['shadow_lord', 'dark_sorcerer', 'barrow_wight'], names: ['Morgath', 'Vorlang', 'Malakar', 'Drogath', 'Skarn'], title: 'the Dark Lord' },
    lair: ['fortress', 'tower', 'cave', 'seacave'],
    boon: ['Sword of Dawn', 'Sunstone', 'Lamp of the First Kings', 'Spear of Morning'],
    boonDesc: 'Old light, kept against the dark. It is said the Dark Lord fears it.',
    win: 'kill',
    acts: { call: 'A Shadow Gathers', boon: (c) => The(c.boon), trial: (c) => `The Fall of ${c.d2}`, muster: 'Allies in the Dark', key: (c) => `The Gate of ${c.lair}`, finale: (c) => c.lair },
    sum: {
      call: (c) => `${c.villain} has woken in ${c.lair}. ${c.elder} of ${c.home} sends the company to ${c.sage}${c.sageAt}, who knows the old lore.`,
      boon: (c) => `Only ${the(c.boon)} can hurt ${c.villainShort}. It lies in ${c.d1}.`,
      trial: (c) => `${c.d2} has fallen to the Dark Lord's creatures. It must be won back.`,
      muster: (c) => `${c.ally} would stand with the company against ${c.villainShort}.`,
      key: (c) => `The gate of ${c.lair} is sealed, and ${c.guardian} keeps its key.`,
      finale: (c) => `The gate is open. In the heart of ${c.lair}, ${c.villain} waits.`,
    },
    intro: (c) => `Long have the people of ${c.world} lived in peace. But now, in the dark fastness of ${c.lair}, ${c.villain} has woken, and his creatures gather on the borders.\n\nYour company has come to ${c.home}, where ${c.elder} has sent word that brave souls are needed.`,
    victory: (c) => `${c.villain} is unmade, and the shadow over ${c.world} breaks. Songs of your deeds will be sung for an age.`,
  },
  relic: {
    villain: { bases: ['orc_captain', 'bandit', 'goblin_shaman'], names: ['Varg', 'Corvin', 'Mother Grisk', 'Rattle-Jack', 'Black Annis'], title: 'the Reaver' },
    lair: ['cave', 'seacave', 'tower', 'fortress'],
    relic: ['Chalice of Dawn', 'Ember Crown', 'Bell of Saint Aldhelm', 'Silver Reliquary'],
    boon: ['Thieves\' Token', 'Torn Black Cloak', 'Map of the Hidden Ways', 'Signet of the Reavers'],
    boonDesc: 'Something the thieves left behind. It may lead to their den.',
    win: 'relic',
    acts: { call: 'The Theft', boon: 'The Thieves\' Trail', trial: (c) => `The Raid on ${c.d2}`, muster: 'A Friend in Need', key: (c) => `The Door of ${c.lair}`, finale: (c) => `The Den in ${c.lair}` },
    sum: {
      call: (c) => `${The(c.relic)} has been stolen from ${c.home}. ${c.elder} asks the company to find ${c.sage}${c.sageAt}, who saw the thieves.`,
      boon: (c) => `The thieves left a trail: ${the(c.boon)}, lost in ${c.d1}.`,
      trial: (c) => `The thieves' friends hold ${c.d2}. Clear them out.`,
      muster: (c) => `${c.ally} knows the thieves' ways, and would come along.`,
      key: (c) => `The den in ${c.lair} is barred, and ${c.guardian} holds its key.`,
      finale: (c) => `${c.villain} has ${the(c.relic)} in ${c.lair}. Take it back, and bring it home to ${c.home}.`,
    },
    intro: (c) => `In the temple of ${c.home} the ${c.relic} was kept for a hundred years, and while it was kept the land was blessed.\n\nThree nights ago it was stolen. Your company has come to ${c.home}, where ${c.elder} begs for help.`,
    victory: (c) => `${The(c.relic)} is home again in ${c.home}. The bells ring, the people sing, and the blessing returns to the land.`,
  },
  curse: {
    villain: { bases: ['dark_sorcerer', 'barrow_wight', 'goblin_shaman'], names: ['Morwen', 'Hagatha', 'Grisela', 'Nan Blight', 'Sabeth'], title: 'the Witch' },
    lair: ['tower', 'cave', 'fortress', 'seacave'],
    boon: ['Silver Bough', 'Water of the Moonwell', 'Rowan Staff', 'Heart of the Oak'],
    boonDesc: 'Green and living, even now. Curses do not hold where it is carried.',
    win: 'kill',
    acts: { call: 'The Withering', boon: (c) => The(c.boon), trial: (c) => `Blight in ${c.d2}`, muster: 'The Witch-Hunter', key: (c) => `The Door of ${c.lair}`, finale: (c) => c.lair },
    sum: {
      call: (c) => `The crops wither and the wells run foul. ${c.elder} of ${c.home} sends the company to ${c.sage}${c.sageAt}, who reads the signs.`,
      boon: (c) => `${The(c.boon)} can break the witch's power. It lies in ${c.d1}.`,
      trial: (c) => `The curse has woken foul things in ${c.d2}.`,
      muster: (c) => `${c.ally} has hunted witches before, and would come.`,
      key: (c) => `${c.lair} is sealed, and ${c.guardian} keeps its key.`,
      finale: (c) => `In ${c.lair}, ${c.villain} weaves the curse. End it.`,
    },
    intro: (c) => `A curse lies on ${c.world}. The crops wither, the wells run foul, and children dream of a woman in a high tower.\n\nYour company has come to ${c.home}, where ${c.elder} has sent for help.`,
    victory: (c) => `${c.villain} is gone, and her curse with her. The rain comes, the wells run sweet, and ${c.world} is green again.`,
  },
  heir: {
    villain: { bases: ['orc_captain', 'troll', 'dark_sorcerer'], names: ['Malvern', 'Black Hugh', 'Ravel', 'Grimwald'], title: 'the Usurper\'s Champion' },
    lair: ['fortress', 'tower', 'cave', 'seacave'],
    boon: ['Royal Signet', 'Old King\'s Seal', 'Letter of Proof'],
    boonDesc: 'Proof of the old king\'s line.',
    win: 'crown',
    acts: { call: 'A Kingdom Without a King', boon: (c) => The(c.boon), trial: (c) => `The Siege of ${c.d2}`, muster: 'The Lost Heir', key: (c) => `The Gate of ${c.lair}`, finale: 'The Crowning' },
    sum: {
      call: (c) => `A usurper rules, and the true heir is lost. ${c.elder} of ${c.home} sends the company to ${c.sage}${c.sageAt}.`,
      boon: (c) => `${The(c.boon)} proves the heir's blood. It lies in ${c.d1}.`,
      trial: (c) => `The usurper's soldiers hold ${c.d2}.`,
      muster: (c) => `${c.ally} is the lost heir — and does not know it yet.`,
      key: (c) => `${c.villain} waits behind the gate of ${c.lair}, and ${c.guardian} keeps its key.`,
      finale: (c) => `${c.villain} must fall; then bring ${c.allyShort} home to ${c.crownAt} to be crowned.`,
    },
    intro: (c) => `The old king of ${c.world} is dead, his heir lost, and a usurper sits on the throne.\n\nYour company has come to ${c.home}, where ${c.elder} keeps faith with the old line, and needs brave souls.`,
    victory: (c) => `${c.ally} is crowned in ${c.crownAt}, and the usurper flees. A new age begins in ${c.world}.`,
  },
};

// Which acts each chapter holds, by number of chapters
const LAYOUTS = {
  1: [['call', 'key', 'finale']],
  2: [['call', 'boon'], ['key', 'finale']],
  3: [['call', 'slay'], ['boon', 'muster', 'key'], ['finale']],
  4: [['call', 'slay'], ['boon', 'muster'], ['trial', 'key'], ['finale']],
  5: [['call'], ['boon', 'slay'], ['trial'], ['muster', 'key'], ['finale']],
};

const DEFAULT_INTRO = 'Long ago, in an age of legend, a shadow fell upon the land...';
const DEFAULT_WIN = 'The shadow is lifted, and songs of your deeds will be sung for an age.';

// Sketch a story onto a realm that already has its places: chapters with
// their quests, the people who give them and the items they need.
// opt: { premise, chapters: n, seed }. Returns { chapters: [], quests: [], notes: [] }
export function generateStory(game, opt = {}) {
  const plot = PLOTS[opt.premise];
  if (!plot) return { chapters: [], quests: [], notes: [] };
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const seed = () => rng.int(1, 1e9);
  const n = Math.max(1, Math.min(5, parseInt(opt.chapters, 10) || 3));
  const notes = [];
  const world = worldMap(game);
  if (!game.story || !Array.isArray(game.story.chapters)) game.story = { chapters: [] };
  if (!Array.isArray(game.quests)) game.quests = [];
  const q0 = game.quests.length;

  // ---- the places it needs (founded if missing, where there is room)
  const found = (kind) => {
    try {
      const got = autoPlaceSites(game, world, [{ kind, name: siteName(game, kind, rng) }], { seed: seed(), start: game.settings.start });
      if (got[0]?.map) { notes.push(`Founded ${got[0].map.name} for the story.`); return got[0].map; }
    } catch (e) { console.error(e); }
    return null;
  };
  const start = game.settings.start || { x: world.w / 2, y: world.h / 2 };
  const nearStart = (list) => list.slice().sort((a, b) => {
    const da = a.portal ? Math.hypot(a.portal.x - start.x, a.portal.y - start.y) : 1e9;
    const db = b.portal ? Math.hypot(b.portal.x - start.x, b.portal.y - start.y) : 1e9;
    return da - db;
  });
  let towns = nearStart(townsOf(game));
  if (!towns.length && found('village')) towns = nearStart(townsOf(game));
  const home = towns[0]?.map || world;
  if (!towns.length) notes.push('There is no town: the story folk stand out on the land near the start.');
  const castle = towns.find((p) => p.kind === 'castle')?.map;
  const town2 = towns.find((p) => p.map !== home && p.kind !== 'village')?.map || towns.find((p) => p.map !== home)?.map || home;
  const village = towns.find((p) => p.kind === 'village' && p.map !== home)?.map || towns[towns.length - 1]?.map || home;
  // the lair: a place of the premise's kind, else another dungeon, else a new one
  let dungeons = dungeonsOf(game).filter((p) => p.portal);
  let lair = null;
  for (const k of plot.lair) { lair = dungeons.find((p) => p.kind === k)?.map; if (lair) break; }
  if (!lair) lair = found(plot.lair[0]) || dungeons[0]?.map || found('cave');
  dungeons = nearStart(dungeonsOf(game).filter((p) => p.portal && p.map !== lair));
  if (!dungeons.length && n > 1 && found('cave')) dungeons = nearStart(dungeonsOf(game).filter((p) => p.portal && p.map !== lair));
  const d1 = dungeons[0]?.map || null;
  const d2 = dungeons[1]?.map || d1;

  // ---- the people
  const mk = (map, role, extra = {}) => placePerson(game, map, { role, ...extra }, seed());
  const elder = (home.type !== 'world' && home.entities.find((e) => e.type === 'npc' && e.role === 'lord' && e.name)) || mk(home, 'lord', { title: home === castle ? rng.pick(['Lord', 'Lady']) : 'Elder' });
  const sage = mk(town2, 'sage');
  const crownAt = castle || home;
  const ctx = {
    world: world.name && world.name !== 'The World' ? world.name : 'the realm',
    home: home.name, elder: elder.name, sage: sage.name, sageAt: town2 !== home ? ` in ${town2.name}` : '',
    lair: lair?.name || 'the dark places', d1: d1?.name || 'the wilds', d2: d2?.name || 'the wilds', crownAt: crownAt.name,
  };
  // the villain and the things of the tale
  const vbase = plot.villain.bases.find((b) => game.monsters.some((m) => m.id === b)) || foeBase(game, 8, rng);
  const vfirst = rng.pick(plot.villain.names);
  const villain = makeNamedFoe(game, vbase, `${vfirst} ${plot.villain.title}`, { level: 9 });
  ctx.villain = villain.name;
  ctx.villainShort = vfirst;
  ctx.boon = rng.pick(plot.boon);
  if (plot.relic) ctx.relic = rng.pick(plot.relic);
  const keyFoe = !!d2 && d2 !== lair;
  const guardian = keyFoe ? makeNamedFoe(game, foeBase(game, 5, rng), foeName(game, rng)) : null;
  ctx.guardian = guardian ? `${guardian.name} in ${d2.name}` : elder.name;
  const ally = mk(village !== home ? village : town2, 'companion');
  ctx.ally = ally.name;
  ctx.allyShort = first(ally);
  const fill = (v) => (typeof v === 'function' ? v(ctx) : v);

  // ---- the chapters and their beats
  const layout = LAYOUTS[n].map((acts) => acts.slice());
  // the heir must be found before the end, however short the story
  if (plot.win === 'crown' && !layout.flat().includes('muster')) {
    const acts = layout[Math.max(0, n - 2)];
    if (n === 1) acts.splice(acts.length - 1, 0, 'muster'); else acts.push('muster');
  }
  if (!d1) for (const acts of layout) for (const a of ['boon', 'trial']) if (acts.includes(a)) acts.splice(acts.indexOf(a), 1);
  const allyAlong = layout.flat().includes('muster');
  const chapters = [];
  let lastMain = null; // the main quest before (across chapters)
  for (let ci = 0; ci < layout.length; ci++) {
    const acts = layout[ci];
    const lead = acts.find((a) => a !== 'slay') || acts[0];
    const ch = newChapter(game, { name: fill(plot.acts[lead]) || `Chapter ${ci + 1}` });
    ch.summary = acts.filter((a) => plot.sum[a]).map((a) => plot.sum[a](ctx)).join(' ');
    ch.notes = 'Sketched by the Quick Start: change anything you like.';
    ch.cast = [];
    ch.ends = { type: 'quests' };
    game.story.chapters.push(ch);
    chapters.push(ch);
    const cast = (npc, note) => { if (npc && !ch.cast.some((c) => c.npc === npc.id)) ch.cast.push({ npc: npc.id, note }); };
    const rw = (k) => ({ gold: Math.round(40 + 30 * ci * k), xp: Math.round(40 + 40 * ci * k) });
    let after = null; // the main quest before, inside this chapter
    const beat = (kind, o) => {
      const res = addBeat(game, kind, { chapter: ch.id, seed: seed(), auto: true, main: true, after, ...o });
      notes.push(...res.notes.filter((t) => /no longer|Choose|No monster/.test(t)));
      if (res.quest?.main) { after = res.quest.id; lastMain = res.quest.id; }
      return res.quest;
    };
    for (const act of acts) {
      if (act === 'call') {
        beat('talk', { giver: elder.id, who: sage.id, name: fill(plot.acts.call), reward: rw(1),
          say: `${first(elder)} sent thee? Good. Listen well, for I have read of ${ctx.villainShort} in the old books.` });
        cast(elder, `Sends the company out from ${home.name}`);
        cast(sage, 'Knows the old lore');
      } else if (act === 'boon') {
        beat('fetch', { giver: sage.id, map: d1.id, hold: 'chest', item: { name: ctx.boon, desc: plot.boonDesc }, reward: rw(1) });
        cast(sage, `Wants ${the(ctx.boon)}`);
      } else if (act === 'trial' && d2) {
        const captain = mk(castle || town2, 'guard');
        beat('clear', { giver: captain.id, map: d2.id, reward: rw(1.5) });
        cast(captain, `Asks for ${d2.name} to be cleared`);
      } else if (act === 'slay') {
        const farmer = mk(village, 'villager');
        const foe = makeNamedFoe(game, foeBase(game, 2 + ci, rng), foeName(game, rng));
        beat('slay', { giver: farmer.id, main: false, auto: false, after: null, map: village.id, monster: foe.id, reward: rw(1) });
      } else if (act === 'muster') {
        beat('companion', { who: ally.id, joinAfter: after || lastMain, name: plot.win === 'crown' ? `${ctx.allyShort}, the Lost Heir` : undefined, reward: rw(1) });
        cast(ally, plot.win === 'crown' ? 'The lost heir: must be at the crowning' : 'Must be with the company at the end');
      } else if (act === 'key') {
        const gate = lair && siteOf(game, lair)?.portal;
        const key = { name: `Key of ${lair?.name || 'the Gate'}`, desc: `A heavy key, cold to the touch. It opens the way into ${lair?.name || 'the dark places'}.` };
        if (gate && keyFoe) beat('gate', { portal: gate.id, key, from: 'monster', foe: placeMonster(game, d2, guardian, rng).ent.id, reward: rw(1) });
        else if (gate) {
          // nowhere else to keep the key: someone in a town keeps it
          beat('gate', { portal: gate.id, key, from: 'person', person: elder.id, reward: rw(1) });
          notes.push(`${elder.name} keeps the key of ${lair.name}: there was no other dungeon to hide it in.`);
        } else if (lair) beat('explore', { map: lair.id, reward: rw(1) });
      } else if (act === 'finale') {
        const vent = placeMonster(game, lair || world, villain, rng).ent;
        const stages = [];
        if (lair) {
          if (allyAlong && plot.win !== 'crown') stages.push({ goal: { type: 'companion', npc: ally.id, map: lair.id }, text: `Enter ${lair.name} with ${ally.name} at your side` });
          else stages.push({ goal: { type: 'reach', map: lair.id }, text: `Go to ${lair.name}` });
        }
        stages.push({ goal: { type: 'kill', monster: villain.id, n: 1 }, text: `Defeat ${villain.name}${lair ? ' in the depths of ' + lair.name : ''}` });
        if (plot.win === 'relic') {
          const relic = makeQuestItem(game, ctx.relic, `The holy relic of ${home.name}.`);
          (vent.loot ||= []).push({ id: relic.id, n: 1 });
          stages.push({ goal: { type: 'collect', item: relic.id }, text: `Take back ${the(relic.name)}` });
          stages.push({ goal: { type: 'deliver', npc: elder.id, item: relic.id }, text: `Bring ${the(relic.name)} home to ${elder.name} in ${home.name}`, say: `${The(relic.name)}! Home at last. The land will be blessed again — and so will thou.`, reward: { flag: 'relic_returned' } });
          cast(elder, `Must receive ${the(relic.name)}`);
        }
        if (plot.win === 'crown') {
          const steward = crownAt === home ? elder : mk(crownAt, 'lord', { title: 'Steward' });
          stages.push({ goal: { type: 'companion', npc: ally.id, map: crownAt.id }, text: `Bring ${ally.name} home to ${crownAt.name}` });
          stages.push({ goal: { type: 'talk', npc: steward.id }, text: `Present ${first(ally)} to ${steward.name} in ${crownAt.name}`, say: `It is true... the old king's eyes. Kneel, all of you — and rise, ${first(ally)}, rightful ruler of ${ctx.world}!`, reward: { flag: 'heir_crowned' } });
          cast(ally, 'Must be crowned');
          cast(steward, 'Crowns the heir');
        } else if (allyAlong) cast(ally, 'Must be at the company\'s side');
        const fq = writeQuest(game, {
          chapter: ch.id, name: plot.win === 'crown' ? 'The Crowning' : `The Fall of ${vfirst}`, main: true, auto: true, giver: '',
          requires: after, summary: plot.sum.finale(ctx), stages, reward: { gold: 300, xp: 300, items: [] },
          doneText: fill(plot.victory),
        });
        after = fq.id;
        lastMain = fq.id;
      }
    }
  }
  // the way to win
  const v = game.settings.victory;
  const valid = v?.type === 'kill' ? game.monsters.some((m) => m.id === v.target) : v?.type === 'item' ? game.items.some((i) => i.id === v.target) : v?.type === 'flag' ? !!v.target : false;
  if (!valid) game.settings.victory = plot.win === 'relic' ? { type: 'flag', target: 'relic_returned' } : plot.win === 'crown' ? { type: 'flag', target: 'heir_crowned' } : { type: 'kill', target: villain.id };
  else notes.push('The way to win the game was left as it was (Campaign → How it ends).');
  if (!game.meta.intro?.trim() || game.meta.intro === DEFAULT_INTRO) game.meta.intro = fill(plot.intro);
  if (!game.meta.victoryText?.trim() || game.meta.victoryText === DEFAULT_WIN) game.meta.victoryText = fill(plot.victory);
  return { chapters, quests: game.quests.slice(q0), notes };
}
