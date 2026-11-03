// Places: the towns, castles, villages and dungeons of a realm, and the plans
// they are built from. A plan says what a place holds ("an inn, an armourer
// and two homes"; "a crypt of eight rooms with a barrow wight at the end"), so
// the designer can change it and rebuild the place without losing the people
// and things they have written.
//
//   map.plan = { kind, ...kind-specific fields }   (see defaultPlan)
//
// [shell] Interfaces fixed by the editor shell; the Places stream fills them in.
import { FEATURE_KINDS, terrain } from '../data/terrain.js';
import { getTile, inBounds } from './map.js';
import { placeFeature } from './generate.js';
import { RNG } from '../core/rng.js';

// Every place reachable from a world map: { map, portal, world, kind }
// kind is the FEATURE_KINDS key of the site tile (town, castle, cave, ...),
// or the map type for places only reached some other way (deeper levels).
export function placesOf(game) {
  const out = [];
  const seen = new Set();
  for (const world of game.maps.filter((m) => m.type === 'world')) {
    for (const p of world.entities) {
      if (p.type !== 'portal' || p.style !== 'site') continue;
      const map = game.maps.find((m) => m.id === p.target?.map);
      if (!map || seen.has(map.id)) continue;
      seen.add(map.id);
      const key = terrain(getTile(world, p.x, p.y)).key;
      const kind = Object.keys(FEATURE_KINDS).find((k) => FEATURE_KINDS[k].terrain === key) || map.type;
      out.push({ map, portal: p, world, kind });
    }
  }
  for (const map of game.maps) if (map.type !== 'world' && !seen.has(map.id)) out.push({ map, portal: null, world: null, kind: map.type });
  return out;
}

// A fresh plan for a kind of place (FEATURE_KINDS key)
export function defaultPlan(kind) {
  return { kind };
}

// The plan a map was built from, or a best guess for maps made before plans
export function planOf(map) {
  return map.plan || null;
}

// Rebuild a place's map from a plan, in place, keeping its id, name, links
// and the people and things the designer has written. Returns { notes: [] }
// (things the designer should know, e.g. "Hal has no inn now: he waits in
// the square").
export function rebuildPlace(game, map, plan) {
  void game; void map; void plan;
  throw new Error('rebuildPlace: not built yet');
}

// Found several places on a world map at sensible spots (suitable ground,
// apart from each other, reachable from the start). wants: [{ kind, name? }].
// Returns [{ portal, map }]. (A simple version: the Places stream improves it.)
export function autoPlaceSites(game, world, wants, opt = {}) {
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const out = [];
  const taken = world.entities.filter((e) => e.type === 'portal' && e.style === 'site').map((e) => [e.x, e.y]);
  for (const want of wants) {
    for (let tries = 0; tries < 600; tries++) {
      const x = rng.int(3, world.w - 4), y = rng.int(3, world.h - 4);
      const t = terrain(getTile(world, x, y));
      if (!inBounds(world, x, y) || !t.walk || t.water || t.feature) continue;
      if (taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < Math.max(6, world.w / 8))) continue;
      const map = placeFeature(game, world, x, y, want.kind, want.name || 'New place', rng.int(1, 1e9));
      const portal = world.entities.find((e) => e.type === 'portal' && e.x === x && e.y === y);
      taken.push([x, y]);
      out.push({ portal, map });
      break;
    }
  }
  return out;
}

// Lay roads between places on a world map (and bridges over rivers), so the
// broad strokes come with ways between them. Returns the changed bounds
// { x0, y0, x1, y1 } or null.
export function connectPlaces(game, world, opt = {}) {
  void game; void world; void opt;
  return null;
}
