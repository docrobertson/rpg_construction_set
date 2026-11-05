// Buried treasure and the torn maps that lead to it.
//
// A hiding place is a map entity, unseen in play:
//   { type: 'treasure', id, x, y, name, clue, gold, items: [{id, n}],
//     guardian?, count?, guardChance?, bonus? }
// and the map to it an item { type: 'map', treasure: <that entity's id> },
// found in a chest, carried by a band of monsters, given for a quest or sold.
// Reading the map shows a sketch of the land round the spot (ui/treasureMap.js)
// and marks the big map, but only roughly: a circle somewhere round it. On the
// very square, with the map in the pack, the company can dig; a guardian may
// rise to defend the hoard. Dug places stay dug (the spot leaves the map).
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { RNG, hashString, roll, rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { partyAlive, partyLevel } from './rules.js';
import { durationText } from './travel.js';
import { pickCharm } from './charms.js';
import { sfx } from '../core/sound.js';

// a spell of digging: about half an hour
export const DIG_TURNS = 6;

export const treasureState = (state) => (state.treasure ||= {});

// the hiding place a map item leads to: { map, e } (null if it is gone)
export function findSpot(game, id) {
  if (!id) return null;
  for (const map of game.maps) {
    const e = (map.entities || []).find((x) => x.id === id && x.type === 'treasure');
    if (e) return { map, e };
  }
  return null;
}

export const mapItemsFor = (game, spotId) => game.items.filter((it) => it.type === 'map' && it.treasure === spotId);

// the treasure maps the company carries
export function carriedMaps(session) {
  const inv = session.party.inventory;
  return session.game.items.filter((it) => it.type === 'map' && inv[it.id] > 0);
}

export const isDug = (session, id) => !!session.state.treasure?.[id]?.dug;

// Maps whose hoard is already dug up have served their purpose: they leave
// the pack (quietly unless `say`, e.g. when the spade has just found it)
export function dropSpentMaps(session, say = false) {
  const inv = session.party?.inventory;
  if (!inv) return;
  for (const it of session.game.items) {
    if (it.type !== 'map' || !(inv[it.id] > 0) || !it.treasure || !isDug(session, it.treasure)) continue;
    delete inv[it.id];
    if (say) session.log(`The ${it.name} has led you true; you let the old map go.`);
  }
}

// The rough circle a read map marks on the big map: the spot lies somewhere
// inside it, never at its centre (the same circle every time for a spot)
export function roughArea(e) {
  const r = new RNG(hashString(String(e.id)) ^ 0x5eed);
  const a = r.float(0, Math.PI * 2), d = r.float(1.2, 2.6);
  return { x: e.x + 0.5 + Math.cos(a) * d, y: e.y + 0.5 + Math.sin(a) * d, r: 4.5 };
}

// Read a map: the place is noted (the big map shows its circle from now on).
// Returns { spot, map, first } or null when the map leads nowhere.
export function readMap(session, item) {
  const found = findSpot(session.game, item?.treasure);
  if (!found) return null;
  const st = treasureState(session.state);
  const rec = (st[found.e.id] ||= {});
  const first = rec.read == null;
  if (first) rec.read = session.state.turn || 0;
  return { spot: found.e, map: found.map, first };
}

// Treasure the company could dig for on its map: here (on the very square)
// or near (within two squares); only with the map in the pack
export function digOptions(session) {
  const map = session.map;
  if (!map || session.state.vehicle) return {};
  const maps = carriedMaps(session);
  const want = new Set(maps.map((it) => it.treasure));
  // (charms) a spot a dowsing charm has sensed can be dug without its map
  for (const [id, rec] of Object.entries(session.state.treasure || {})) if (rec.sensed != null && !rec.dug) want.add(id);
  if (!want.size) return {};
  const p = session.state.pos;
  const out = {};
  for (const e of map.entities) {
    if (e.type !== 'treasure' || !want.has(e.id) || isDug(session, e.id)) continue;
    const d = Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    if (d === 0) out.here = e;
    else if (d <= 2 && !out.near) out.near = e;
  }
  return out;
}

// What the hoard holds: its own gold and items, and (unless bonus is off) a
// little more gold and a piece of gear that grow with the company's level
export function treasureLoot(session, e) {
  const g = session.game;
  const lvl = partyLevel(session.party) || 1;
  let gold = e.gold ? roll(String(e.gold)) || 0 : 0;
  const items = (e.items || []).filter((it) => g.items.some((d) => d.id === it.id)).map((it) => ({ id: it.id, n: it.n || 1 }));
  if (e.bonus !== false) {
    gold += lvl * 15 + rng.int(0, 10) * lvl;
    if (g.settings.loot !== false) {
      const budget = 70 + lvl * 55;
      const gear = g.items.filter((it) => ['weapon', 'armor', 'shield'].includes(it.type) && !it.unique && !it.noLoot && (it.price || 0) <= budget && (it.price || 0) >= budget * 0.3);
      if (gear.length) items.push({ id: rng.weighted(gear, (it) => 1 + (it.price || 0) / 40).id, n: 1 });
      // as often as not a charm too, finer for a stronger company
      const charm = rng.chance(0.5) && pickCharm(g, lvl + 1, { hoard: true, maxPrice: 120 + lvl * 90 });
      if (charm) items.push({ id: charm.id, n: 1 });
    }
  }
  return { gold, items };
}

const countOf = (c) => {
  const m = String(c || '1').match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  return m ? rng.int(+m[1], +(m[2] || m[1])) : 1;
};

// Dig on the spot: time passes, the hoard comes up (in a chest that opens
// at once); a guardian may rise first. If the company flees, the chest stays
// where it was dug up, to be opened later.
export async function digTreasure(session, e) {
  const s = session;
  if (s.mode !== 'explore' || s.busy || !e || isDug(s, e.id)) return false;
  const p = s.state.pos;
  if (e.x !== p.x || e.y !== p.y) return false;
  s.busy = true;
  let res = null;
  try {
    const digger = partyAlive(s.party).find((m) => m.race === 'dwarf' || m.cls === 'warrior') || s.leader;
    s.log(`${digger?.name || 'You'} set${digger ? 's' : ''} spade to earth. You dig for ${durationText(DIG_TURNS)}...`);
    for (let k = 0; k < 3; k++) {
      s.view.burst(p.x, p.y, 0x7a5a34, 10, { up: 1.2, speed: 0.6 });
      sfx('step');
      await s.view.wait(0.25);
    }
    s.passTime(DIG_TURNS);
    const rec = (treasureState(s.state)[e.id] ||= {});
    rec.dug = s.state.turn || 0;
    dropSpentMaps(s, true);
    s.removeEntity(e);
    const loot = treasureLoot(s, e);
    // (the chest keeps the hoard's name: "The King's Pay-chest swings open…")
    const chest = { id: `${e.id}_chest`, type: 'chest', x: e.x, y: e.y, gold: String(loot.gold), items: loot.items, ...(e.name ? { name: e.name } : {}) };
    s.log(`Your spade strikes wood: ${e.name ? `${e.name}!` : 'a buried chest!'}`, 'good');
    const guard = e.guardian && s.game.monsters.some((m) => m.id === e.guardian) && rng.chance(e.guardChance == null || e.guardChance === '' ? 1 : +e.guardChance);
    if (guard) {
      const def = s.game.monsters.find((m) => m.id === e.guardian);
      const n = countOf(e.count);
      s.log(e.guardText || `The earth heaves, and out burst${n > 1 ? ` ${num(n)} ${(def.plural || def.name).toLowerCase()}` : `s a ${def.name.toLowerCase()}`} to defend the hoard!`, 'bad');
      s.busy = false;
      const t = terrain(getTile(s.map, p.x, p.y));
      const out = await s.fight([{ id: e.guardian, n }], t.arena || 'grass', {});
      if (out.outcome === 'victory') await s.openChest(chest);
      else if (out.outcome === 'fled') {
        // the chest waits where it came up
        s.map.entities.push(chest);
        (s.mapState(s.map.id).added ||= []).push(chest);
        s.addVisual(chest);
        s.log('The dug-up chest is left lying in its hole.', 'warn');
      }
      res = out;
    } else {
      await s.openChest(chest);
      res = { outcome: 'found' };
    }
    s.updateVisibility();
    s.ui?.refresh();
    s.autosave();
  } finally {
    s.busy = false;
  }
  return res;
}

// The guardian of beach hoards (a game that lacks one gets it when needed)
export const GIANT_CRAB = {
  id: 'giant_crab', name: 'Giant Crab', plural: 'Giant Crabs', level: 4, hp: '9d8+10', ac: 15, hit: 7, dmg: '2d6+2', xp: 45, gold: '2d10',
  habitat: [], native: ['sand', 'shallows'], group: [1, 1],
  look: { kind: 'crab', color: 0xc8542c, mark: 0xf2c890, scale: 1.3 },
  desc: 'A crab the size of a cart, shelled like a knight, with claws that can snap an oar.',
};
export function addCrab(game) {
  if (!game.monsters.some((m) => m.id === GIANT_CRAB.id)) game.monsters.push(JSON.parse(JSON.stringify(GIANT_CRAB)));
  return GIANT_CRAB.id;
}

// ------------------------------------------------------------ clues
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => NUM[n] || String(n);

// "three paces east and two north" (dx, dy from the landmark to the spot)
export function pacesText(dx, dy) {
  const part = (n, a, b) => (n ? `${num(Math.abs(n))} ${n > 0 ? a : b}` : '');
  const h = part(dx, 'east', 'west'), v = part(dy, 'south', 'north');
  if (h && v) return `${h.replace(/^(\w+)/, (m, w) => `${w} ${w === 'one' ? 'pace' : 'paces'}`)} and ${v}`;
  const one = h || v;
  return one.replace(/^(\w+) /, (m, w) => `${w} ${w === 'one' ? 'pace' : 'paces'} `);
}

const GROUND = {
  forest: 'under the oaks', pines: 'among the pines', hills: 'on the hillside', grass: 'in the long grass', meadow: 'among the wild flowers',
  sand: 'in the sand above the tide', desert: 'in the drifting sand', snow: 'under the snow', swamp: 'in the reeds', ash: 'in the grey ash', ruins: 'among the fallen stones', road: 'beneath the road itself',
};

// Something on the map a clue can count paces from: points of interest,
// signposts, towns and sites, waygates (nearest first, within `reach`)
export function landmarksNear(map, x, y, reach = 8) {
  const out = [];
  // a name met twice on the map (every "Travellers' Camp") points nowhere
  const seen = new Map();
  for (const e of map.entities || []) if (e.type === 'event' && e.name) seen.set(e.name, (seen.get(e.name) || 0) + 1);
  for (const e of map.entities || []) {
    if (e.type === 'event' && seen.get(e.name) > 1) continue;
    let name = null;
    if (e.type === 'event') name = e.name ? `the ${e.name.replace(/^the /i, '')}` : null;
    else if (e.type === 'sign') name = 'the signpost';
    else if (e.type === 'portal' && e.style === 'waygate') name = 'the waygate';
    else if (e.type === 'portal' && e.style === 'site' && e.label) name = e.label;
    if (!name) continue;
    const d = Math.max(Math.abs(e.x - x), Math.abs(e.y - y));
    if (d > 0 && d <= reach) out.push({ e, name, d });
  }
  // (the nearest first; at a tie, a stone or a shrine before a town)
  return out.sort((a, b) => a.d - b.d || (a.e.type === 'portal') - (b.e.type === 'portal'));
}

// A clue for a spot: paces from the nearest landmark, and the lie of the land
export function clueFor(map, x, y) {
  const t = terrain(getTile(map, x, y));
  const ground = GROUND[t.key] || 'where the ground is soft';
  const lm = landmarksNear(map, x, y)[0];
  if (!lm) return `Dig ${ground}, where no one would think to look.`;
  return `${pacesText(x - lm.e.x, y - lm.e.y).replace(/^./, (c) => c.toUpperCase())} of ${lm.name}, ${ground}.`;
}

// ------------------------------------------------------------ making them
// A good square to bury something: dry, open land with nothing on it
export function buryable(map, x, y) {
  if (!inBounds(map, x, y)) return false;
  const t = terrain(getTile(map, x, y));
  if (!t.walk || t.water || t.feature || t.door || t.dmg || t.deck) return false;
  return !map.entities.some((e) => e.x === x && e.y === y);
}

export function newTreasure(map, x, y, extra = {}) {
  return { id: uid('tr'), type: 'treasure', x, y, name: 'Buried Treasure', clue: clueFor(map, x, y), from: landmarksNear(map, x, y)[0]?.e.id, gold: '6d20', items: [], ...extra };
}

export function newMapItem(spot, extra = {}) {
  return {
    id: uid('tmap'), name: 'Torn Map', type: 'map', treasure: spot.id, price: 90,
    desc: 'A torn scrap of map, a red X inked on it and a few lines scrawled beneath.', ...extra,
  };
}

// A generated world hides two or three hoards near its landmarks. Their maps
// go where a player will come across them: in a hidden cache, pressed on the
// company by a grateful traveller, left behind by a beaten troll.
export function buryTreasures(game, map, seed) {
  const r = new RNG((seed >>> 0) + 4049);
  const holders = [
    ...map.entities.filter((e) => e.type === 'event' && e.kind === 'cache'),
    ...map.entities.filter((e) => e.type === 'event' && e.kind === 'person'),
    ...map.entities.filter((e) => e.type === 'event' && e.kind === 'creature'),
  ];
  const named = new Map();
  for (const e of map.entities) if (e.type === 'event') named.set(e.name, (named.get(e.name) || 0) + 1);
  const marks = map.entities.filter((e) => e.type === 'event' && ['shrine', 'lore', 'well', 'campfire'].includes(e.kind) && named.get(e.name) === 1);
  const want = Math.min(holders.length, r.int(2, 3));
  const made = [];
  const names = ['The Pedlar\'s Hoard', 'A Robber\'s Stash', 'The Lost Tithe', 'A Sea-captain\'s Chest', 'The Miser\'s Pot'];
  const guards = ['skeleton', 'giant_spider'];
  for (let i = 0; i < want && marks.length; i++) {
    let spot = null;
    for (let a = 0; a < 40 && !spot; a++) {
      const m = r.pick(marks);
      const x = m.x + r.int(-5, 5), y = m.y + r.int(-5, 5);
      if (Math.max(Math.abs(x - m.x), Math.abs(y - m.y)) < 2 || !buryable(map, x, y)) continue;
      if (made.some((t) => Math.abs(t.x - x) + Math.abs(t.y - y) < 10)) continue;
      spot = { x, y };
    }
    if (!spot) continue;
    const beach = terrain(getTile(map, spot.x, spot.y)).key === 'sand';
    const guardian = r.chance(0.5) ? (beach ? addCrab(game) : r.pick(guards)) : null;
    const e = newTreasure(map, spot.x, spot.y, {
      id: `tr_${seed >>> 0}_${i}`, name: names[(i + r.int(0, 4)) % names.length], gold: `${r.int(6, 10)}d20`,
      items: [{ id: r.pick(['greater_draught', 'mana_tonic', 'phoenix_feather', 'scroll_seeing']), n: 1 }],
      ...(guardian && game.monsters.some((m) => m.id === guardian) ? { guardian, count: guardian === 'skeleton' ? '2' : '1' } : {}),
    });
    map.entities.push(e);
    const item = newMapItem(e, { id: `tmap_${seed >>> 0}_${i}`, name: ['Torn Map', 'Stained Map', 'Scrap of Map'][i % 3], auto: true });
    game.items.push(item);
    // hand the map to one of the world's encounters
    const h = holders[i];
    const open = (h.choices || []).filter((c) => !c.leave && !c.effects?.fight);
    const ch = open.find((c) => c.effects?.gold || c.effects?.xp || c.effects?.items) || open[0];
    if (ch) {
      ch.effects = { ...(ch.effects || {}), items: [...(ch.effects?.items || []), { id: item.id, n: 1 }] };
      ch.text = `${ch.text || ''} Among it all: a torn map, marked with a red X.`.trim();
    }
    made.push(e);
  }
  return made;
}

// A world map was made again in the editor: drop the maps that were made for
// its old hoards (only those the generator made)
export function forgetLostMaps(game) {
  game.items = game.items.filter((it) => !(it.type === 'map' && it.auto && !findSpot(game, it.treasure)));
}
