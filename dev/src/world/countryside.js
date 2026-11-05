// Farmland about the places people live: a patchwork of fenced fields on the
// open grass round towns, villages and castles (thickest round villages),
// strips of flowering pasture between some of them, and now and then a
// windmill, an orchard or a bee-garden beside them. Only open grass and
// meadow is ever sown: roads, bridges, water, the places themselves (and the
// square of ground about each, where the world map draws it larger) and every
// square something stands on are left as they were, so no way is blocked.
import { T, terrain } from '../data/terrain.js';
import { getTile, setTile, inBounds } from './map.js';
import { RNG, hash2 } from '../core/rng.js';
import { uid } from '../core/util.js';
import { eventFromTemplate } from '../game/events.js';

// How far the fields reach round each kind of place (in squares), how much
// of the open ground within that reach is farmed, and the chance of a farm
// landmark beside the fields
export const FIELD_SITES = {
  village: { reach: 5, share: 0.55, landmark: 1 },
  town: { reach: 6, share: 0.45, landmark: 0.7 },
  castle: { reach: 5, share: 0.35, landmark: 0.5 },
  harbour: { reach: 3, share: 0.2, landmark: 0 },
};
const SOWABLE = new Set(['grass', 'meadow']);
// plots: mostly two or three squares a side, now and then a long strip
const PLOTS = [[2, 2], [2, 2], [3, 2], [2, 3], [3, 3], [3, 1], [1, 3], [2, 1], [1, 2], [4, 2], [2, 4]];
// what may stand beside a generated village's or town's fields
export const FARM_LANDMARKS = ['windmill', 'orchard', 'apiary', 'windmill', 'shepherd', 'watermill'];

// The places on a map: every site square, or (all = false) only the kinds
// that farm the land about them. { x, y, kind }
export function farmingSites(map, all = false) {
  const out = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = terrain(getTile(map, x, y));
    if (t.feature && (all || FIELD_SITES[t.key])) out.push({ x, y, kind: t.key });
  }
  return out;
}

// Sow fields round the places on a world map. opt:
//   seed      the same seed sows the same fields
//   sites     [{ x, y }] to farm round (default: every town, village, castle
//             and harbour on the map); a site's kind is read from its square
//   keep      [{ x, y }] squares never to sow (the start, say)
//   reach, share   override FIELD_SITES for every site
//   ground    the kinds of ground that may be sown (default grass, meadow)
//   landmarks put a windmill, orchard, beehives or the like beside the
//             fields of some (village always; towns and castles sometimes)
//   ids       a prefix for those landmarks' ids (default: fresh unique ids)
// Returns { sown, pasture, events, x0, y0, x1, y1 } (the changed bounds).
export function sowFields(map, opt = {}) {
  const rng = new RNG((opt.seed ?? 1) >>> 0);
  const { w, h } = map;
  const sites = (opt.sites || farmingSites(map))
    .filter((s) => s && inBounds(map, s.x, s.y))
    .map((s) => ({ x: s.x, y: s.y, kind: terrain(getTile(map, s.x, s.y)).key }))
    .filter((s) => FIELD_SITES[s.kind]);
  const busy = new Uint8Array(w * h);
  for (const e of map.entities) if (inBounds(map, e.x, e.y)) busy[e.y * w + e.x] = 1;
  for (const k of opt.keep || []) if (k && inBounds(map, k.x, k.y)) busy[k.y * w + k.x] = 1;
  // every place keeps the ring of squares about it clear
  for (const s of farmingSites(map, true)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(map, s.x + dx, s.y + dy)) busy[(s.y + dy) * w + s.x + dx] = 1;
  const ground = opt.ground ? new Set(opt.ground) : SOWABLE;
  const sowable = (x, y) => inBounds(map, x, y) && !busy[y * w + x] && ground.has(terrain(getTile(map, x, y)).key);
  const res = { sown: 0, pasture: 0, events: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const mark = (x, y) => { res.x0 = Math.min(res.x0, x); res.y0 = Math.min(res.y0, y); res.x1 = Math.max(res.x1, x); res.y1 = Math.max(res.y1, y); };
  const field = new Uint8Array(w * h);
  for (const s of sites) {
    const F = FIELD_SITES[s.kind];
    const R = opt.reach ?? F.reach;
    const ring = [];
    for (let y = s.y - R; y <= s.y + R; y++) for (let x = s.x - R; x <= s.x + R; x++) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d <= R + 0.5 && sowable(x, y)) ring.push({ x, y, d });
    }
    if (!ring.length) continue;
    const want = Math.round(ring.length * (opt.share ?? F.share));
    let got = 0;
    for (let t = 0; t < 160 && got < want; t++) {
      // plots crowd in near the place and thin out towards the edge
      const c = rng.pick(ring);
      if (!rng.chance(1 - Math.pow(c.d / (R + 1), 2) * 0.85)) continue;
      const [pw, ph] = rng.pick(PLOTS);
      const ox = c.x - rng.int(0, pw - 1), oy = c.y - rng.int(0, ph - 1);
      for (let y = oy; y < oy + ph; y++) for (let x = ox; x < ox + pw; x++) {
        if (!sowable(x, y) || Math.hypot(x - s.x, y - s.y) > R + 0.5) continue;
        setTile(map, x, y, T.fields);
        field[y * w + x] = 1;
        mark(x, y);
        got++;
        res.sown++;
      }
    }
  }
  // flowering pasture along some of the new fields' edges
  for (let i = 0; i < w * h; i++) {
    if (!field[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!sowable(nx, ny) || getTile(map, nx, ny) !== T.grass || field[ny * w + nx]) continue;
      if (hash2(nx, ny, (opt.seed ?? 1) + 77) < 0.16) { setTile(map, nx, ny, T.meadow); mark(nx, ny); res.pasture++; }
    }
  }
  // a windmill, an orchard or the like beside some places' fields
  if (opt.landmarks) {
    let n = 0;
    for (const s of sites) {
      const F = FIELD_SITES[s.kind];
      if (!F.landmark || !rng.chance(F.landmark)) continue;
      const R = (opt.reach ?? F.reach) + 1;
      const spots = [];
      for (let y = s.y - R; y <= s.y + R; y++) for (let x = s.x - R; x <= s.x + R; x++) {
        const d = Math.hypot(x - s.x, y - s.y);
        if (d < 2.5 || d > R + 0.5 || !sowable(x, y)) continue;
        // beside the fields, clear of anything else that stands about
        const byField = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(map, x + dx, y + dy) && field[(y + dy) * w + x + dx]);
        if (!byField || map.entities.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) < 4)) continue;
        spots.push({ x, y, d });
      }
      if (!spots.length) continue;
      const at = rng.pick(spots);
      // a watermill wants a stream beside it; anything else will do anywhere
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = terrain(getTile(map, at.x + dx, at.y + dy)); return inBounds(map, at.x + dx, at.y + dy) && t.water && !t.deck; });
      let tpl = rng.pick(FARM_LANDMARKS);
      if (tpl === 'watermill' && !nearWater) tpl = 'orchard';
      const e = { ...eventFromTemplate(tpl), id: opt.ids ? `${opt.ids}_${n}` : uid('ev'), x: at.x, y: at.y };
      map.entities.push(e);
      busy[at.y * w + at.x] = 1;
      res.events.push(e);
      mark(at.x, at.y);
      n++;
    }
  }
  return res;
}

// The Farmland brush: does a square of open ground fall in a field? A seeded
// patchwork of plots, mostly two or three squares a side, lanes of grass
// between some of them.
export function inFieldPlot(x, y, seed) {
  const ox = Math.floor(hash2(1, 2, seed) * 3), oy = Math.floor(hash2(3, 4, seed) * 3);
  const cx = Math.floor((x + ox) / 3), cy = Math.floor((y + oy) / 3);
  if (hash2(cx, cy, seed) > 0.72) return false;
  const lx = (x + ox) - cx * 3, ly = (y + oy) - cy * 3;
  if (lx === 2 && hash2(cx, cy, seed + 5) < 0.45) return false;
  if (ly === 2 && hash2(cx, cy, seed + 9) < 0.45) return false;
  return true;
}
