// Travel costs: how many turns a step onto a square takes. Roads are quick,
// open country a turn, rough ground more (see the cost of each terrain in
// data/terrain.js). Heroes who know a kind of country lighten its extra cost
// a little; monsters cross their native ground at no more than a turn a step.
import { terrain, T } from '../data/terrain.js';
import { TERRAIN_EASE, MONSTER_NATIVE, HABITAT_TERRAIN } from '../data/defaults.js';

const byId = (list, id) => (list || []).find((x) => x.id === id);

// the most a guide can save: half of the extra cost
export const MAX_EASE = 0.5;

// A placed monster follows the party until the party is this far from the
// monster's home (tiles), unless the monster's own leash says otherwise
export const DEFAULT_LEASH = 8;

const COUNTRY = {
  forest: 'the woods', pines: 'the woods', hills: 'the hills', snow: 'the snow', swamp: 'the marshes',
  sand: 'the sands', desert: 'the sands', rubble: 'broken ground', web: 'the webs', ash: 'the waste',
};

function easeOf(def, table, key) {
  if (!def) return 0;
  const e = def.ease || table[def.id];
  return (e && +e[key]) || 0;
}

// The best guide in the company for this terrain: { ease, who, why } or null
export function partyEase(game, members, t) {
  if (!(t.cost > 1)) return null;
  let best = null;
  for (const m of members) {
    if (m.status === 'dead') continue;
    const race = byId(game.races, m.race), cls = byId(game.classes, m.cls);
    const r = easeOf(race, TERRAIN_EASE.races, t.key), c = easeOf(cls, TERRAIN_EASE.classes, t.key);
    const ease = Math.min(MAX_EASE, Math.max(0, r + c));
    if (ease > 0 && (!best || ease > best.ease)) {
      const kind = r >= c ? race : cls;
      best = { ease, who: m, kind: (kind?.name || '').toLowerCase() };
    }
  }
  if (best) best.why = `your ${best.kind || best.who.name} moves easier in ${COUNTRY[t.key] || t.name.toLowerCase()}`;
  return best;
}

// turns a step onto terrain t takes the company (ease: the guide's saving)
export function easedCost(t, ease = 0) {
  const c = t.cost ?? 1;
  return c > 1 ? 1 + (c - 1) * (1 - ease) : c;
}

// A few words on how hard the going is
export function costWord(c) {
  return c <= 0.6 ? 'quick going' : c <= 1.05 ? '' : c <= 1.6 ? 'slow' : c <= 2.1 ? 'slow going' : 'very slow';
}

const fmt = (n) => String(Math.round(n * 100) / 100);

// "very slow (2.5); your elf moves easier in woods" — for hover text
export function costNote(game, members, t) {
  const g = partyEase(game, members, t);
  const c = easedCost(t, g?.ease || 0);
  const w = costWord(t.cost ?? 1);
  if (!w && !g) return '';
  const turns = (t.cost ?? 1) === 1 ? '' : ` (${fmt(t.cost)} turn${t.cost < 1 ? '' : 's'} a step${g ? `, ${fmt(c)} for you` : ''})`;
  return `${w || 'normal going'}${turns}${g ? '; ' + g.why : ''}`;
}

// The ground a monster is at home on (terrain keys)
export function nativeOf(def) {
  if (!def) return [];
  if (Array.isArray(def.native)) return def.native;
  if (MONSTER_NATIVE[def.id]) return MONSTER_NATIVE[def.id];
  return [...new Set((def.habitat || []).flatMap((h) => HABITAT_TERRAIN[h] || []))];
}

// turns a step onto terrain t takes this monster
export function monsterCost(def, t) {
  const c = t.cost ?? 1;
  if (def?.fly || def?.swim) return Math.min(1, c);
  return nativeOf(def).includes(t.key) ? Math.min(1, c) : c;
}

export function tileCost(map, x, y) {
  return terrain(map.tiles[y * map.w + x]).cost ?? 1;
}

// handles for tests and the browser console
if (typeof window !== 'undefined') window.__travel = { terrain, T, monsterCost, easedCost, partyEase, costNote, nativeOf };
