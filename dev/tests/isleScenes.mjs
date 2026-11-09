// Shared scene-building for the isles suite (tests/isles.mjs): a jungle
// coast laid out by hand on a small world map, so the new terrain can be
// looked at (and timed) the same way every run. Node side only builds data.
import { T } from '../src/data/terrain.js';
import { fbm } from '../src/core/noise.js';
import { hash2 } from '../src/core/rng.js';

// A 44 x 34 stretch of tropical coast: the sea to the south with a reef off
// the beach, palms on the sand, a mangrove creek, the jungle behind, a ruined
// temple courtyard in a clearing and a temple site on the hill, obsidian
// flats at the foot of a volcano to the north-east.
export function coastMap() {
  const w = 44, h = 34;
  const tiles = new Array(w * h).fill(T.jungle);
  const at = (x, y, k) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = T[k]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const shore = 21 + Math.sin(x * 0.27) * 1.6 + (fbm(x * 0.2, 3, 7, 2) - 0.5) * 3;
    const n = fbm(x * 0.21, y * 0.21, 11, 3);
    let k;
    if (y > shore + 6) k = 'ocean';
    else if (y > shore + 2.2) k = n > 0.5 || hash2(x, y, 5) < 0.25 ? 'reef' : 'shallows';
    else if (y > shore + 1.2) k = 'shallows';
    else if (y > shore - 0.6) k = hash2(x, y, 3) < 0.55 ? 'palms' : 'sand';
    else if (y > shore - 1.8) k = hash2(x, y, 4) < 0.45 ? 'palms' : 'vines';
    else if (y > shore - 3) k = n > 0.55 ? 'jungle' : 'vines';
    else k = n > 0.42 || hash2(x, y, 9) < 0.3 ? 'jungle' : 'vines';
    tiles[y * w + x] = T[k];
  }
  // the mangrove creek winding in from the sea
  for (let y = 14; y < 26; y++) {
    const cx = 17 + Math.round(Math.sin(y * 0.4) * 1.5);
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      if (tiles[y * w + x] === T.ocean || tiles[y * w + x] === T.reef) continue;
      at(x, y, Math.abs(dx) <= 0 ? 'shallows' : 'mangrove');
    }
  }
  // a ruined courtyard in a clearing
  const rx = 22, ry = 9;
  for (let y = ry; y < ry + 7; y++) for (let x = rx; x < rx + 10; x++) at(x, y, 'ruins_floor');
  for (let x = rx; x < rx + 10; x++) if (x !== rx + 4 && x !== rx + 5) at(x, ry, 'temple_wall');
  for (const x of [rx, rx + 9]) for (let y = ry; y < ry + 4; y++) at(x, y, 'temple_wall');
  at(rx + 2, ry + 2, 'idol'); at(rx + 7, ry + 2, 'idol');
  at(rx + 4, ry + 4, 'pool'); at(rx + 5, ry + 4, 'pool');
  at(rx + 1, ry + 6, 'vines'); at(rx + 8, ry + 5, 'vines'); at(rx + 6, ry + 6, 'vines');
  at(rx + 9, ry + 5, 'temple_wall');
  // the temple on its hill, and a lone palm and jungle giant by the beach
  at(36, 5, 'temple');
  for (let y = 0; y < 4; y++) for (let x = 38; x < 44; x++) at(x, y, hash2(x, y, 2) < 0.6 ? 'obsidian' : 'ash');
  at(42, 0, 'mountains'); at(43, 1, 'mountains'); at(43, 0, 'peaks');
  // the company stands on the beach
  let sy = 0;
  while (sy < h - 1 && tiles[sy * w + 27] !== T.sand && tiles[sy * w + 27] !== T.palms) sy++;
  tiles[sy * w + 27] = T.sand;
  return { w, h, tiles, start: { x: 27, y: sy }, court: { x: rx + 5, y: ry + 5 }, temple: { x: 36, y: 5 } };
}
