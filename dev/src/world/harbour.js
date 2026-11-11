// A harbour hamlet with a shipyard: the sea along its west side, piers out
// over the water, a hull on the slipway with a crane beside it, cargo and
// nets along the quay, and behind it the shipwright's yard, a tavern, a
// chandler and the fishermen's cottages. The shipwright sells a ship.
import { T } from '../data/terrain.js';
import { getTile, setTile, inBounds, createMap } from './map.js';
import { RNG } from '../core/rng.js';
import { buildRoom, furnish, makeNpc } from './generate.js';

export function generateHarbour(opt = {}) {
  const rng = new RNG(opt.seed ?? Math.floor(Math.random() * 1e9));
  const w = opt.w || 30, h = opt.h || 24;
  const map = createMap({ type: 'town', w, h, name: opt.name || 'Harbour', fill: 'grass' });
  map.lighting = 'day';
  map.settlement = 'harbour'; // (market) its shops keep a harbour's trade
  const set = (x, y, k) => setTile(map, x, y, T[k]);
  const rect = (x0, y0, rw, rh, k) => { for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) set(x, y, k); };
  const SHORE = 10;
  // the sea, deepening westwards, a strip of shingle, then the quay
  for (let y = 0; y < h; y++) {
    const wob = rng.int(0, 1);
    for (let x = 0; x < SHORE; x++) set(x, y, x < 4 + wob ? 'ocean' : 'shallows');
    set(SHORE, y, 'sand');
    set(SHORE + 1, y, 'cobble');
    set(SHORE + 2, y, 'cobble');
  }
  // three piers out over the water, the middle one broad
  const piers = [[4, 1], [12, 2], [19, 1]];
  for (const [py, pw] of piers) rect(3, py, SHORE - 3, pw, 'pier');
  // the road in from the east, and a lane along the back
  rect(SHORE + 3, 12, w - SHORE - 3, 2, 'road');
  rect(SHORE + 1, 12, 2, 2, 'cobble');
  // the shipyard: two slipways with cranes beside them, on the shore
  const yard = [[8, 7], [16, 15]];
  for (const [sy, cy] of yard) { set(SHORE, sy, 'slipway'); set(SHORE, cy, 'crane'); }
  // cargo and nets along the quay (never blocking a pier's root)
  const root = (y) => piers.some(([py, pw]) => y >= py - 1 && y <= py + pw);
  for (let y = 1; y < h - 1; y++) {
    if (root(y) || y === 12 || y === 13 || yard.some(([a, b]) => y === a || y === b)) continue;
    if (rng.chance(0.28)) set(SHORE + 2, y, rng.chance(0.55) ? 'cargo' : 'nets');
  }
  // the buildings: shipwright's loft, tavern, chandler and cottages
  const bx = SHORE + 5;
  const plots = [
    { role: 'house', x0: bx, y0: 2, bw: 7, bh: 5, door: 's', keeper: 'shipwright' },
    { role: 'tavern', x0: bx, y0: 16, bw: 8, bh: 6, door: 'n' },
    { role: 'provisions', x0: bx + 8, y0: 2, bw: 5, bh: 5, door: 's' },
    { role: 'house', x0: bx + 9, y0: 16, bw: 5, bh: 4, door: 'n' },
    { role: 'house', x0: bx + 8, y0: 7, bw: 5, bh: 4, door: 's' },
  ];
  const npcs = [];
  for (const p of plots) {
    if (p.x0 + p.bw >= w - 1 || p.y0 + p.bh >= h) continue;
    const b = buildRoom(map, p.x0, p.y0, p.bw, p.bh, { wall: 'wall_wood', floor: 'floor_wood', door: p.door });
    const spot = furnish(map, b, p.role, rng);
    // a path from the door to the road or quay
    const dy = p.door === 's' ? 1 : -1;
    for (let y = b.door.y + dy; inBounds(map, b.door.x, y) && getTile(map, b.door.x, y) === T.grass; y += dy) set(b.door.x, y, 'road');
    if (p.keeper === 'shipwright') {
      // the shipwright works out in the yard, by the hull on the slipway
      npcs.push(makeNpc('shipwright', 'human', SHORE + 1, 8, rng, { wander: 1 }));
      npcs.push(makeNpc('villager', 'human', spot.x, spot.y, rng));
    } else npcs.push(makeNpc(p.role === 'house' ? 'villager' : p.role, 'human', spot.x, spot.y, rng));
  }
  // dockhands and fishermen about the quay
  for (const [x, y] of [[SHORE + 1, 3], [SHORE + 2, 18], [6, 13]]) {
    npcs.push(makeNpc('villager', 'human', x, y, rng, { wander: 3 }));
  }
  // a little green: trees, hay and a well behind the quay
  for (let i = 0; i < 14; i++) {
    const x = rng.int(SHORE + 4, w - 2), y = rng.int(1, h - 2);
    if (getTile(map, x, y) !== T.grass || npcs.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1)) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = getTile(map, x + dx, y + dy); return t !== T.grass && t !== T.tree && t !== T.garden; });
    if (near) continue;
    set(x, y, rng.chance(0.6) ? 'tree' : 'garden');
  }
  if (getTile(map, SHORE + 4, 10) === T.grass) set(SHORE + 4, 10, 'well');
  if (getTile(map, SHORE + 4, 15) === T.grass) set(SHORE + 4, 15, 'lamppost');
  map.entities.push(...npcs);
  map.entry = { x: w - 2, y: 12 };
  return { map, npcs };
}
