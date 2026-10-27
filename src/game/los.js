// Line of sight, lighting and fog-of-war levels.
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { bresenham } from '../world/generate.js';

function sightCost(map, x, y) {
  const t = terrain(getTile(map, x, y));
  if (!t.sight) return 0;
  if (t.key === 'forest' || t.key === 'pines') return 1;
  return 2;
}

export function hasLOS(map, x0, y0, x1, y1) {
  const pts = bresenham(x0, y0, x1, y1);
  let cost = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    cost += sightCost(map, pts[i][0], pts[i][1]);
    if (cost >= 2) return false;
  }
  return true;
}

// Mask of tiles lit by light-emitting terrain (braziers, lava, crystals...)
export function computeLitMask(map) {
  const mask = new Uint8Array(map.w * map.h);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const L = terrain(getTile(map, x, y)).light;
    if (!L) continue;
    for (let dy = -L; dy <= L; dy++) for (let dx = -L; dx <= L; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(map, nx, ny) || dx * dx + dy * dy > L * L + 1) continue;
      mask[ny * map.w + nx] = 1;
    }
  }
  return mask;
}

// Returns Uint8Array of visible tiles (1) for the party at (px,py)
export function computeVisible(map, px, py, sightR, lightR, litMask) {
  const vis = new Uint8Array(map.w * map.h);
  const R = Math.ceil(sightR);
  for (let y = py - R; y <= py + R; y++) for (let x = px - R; x <= px + R; x++) {
    if (!inBounds(map, x, y)) continue;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 > sightR * sightR) continue;
    const lit = d2 <= lightR * lightR || (litMask && litMask[y * map.w + x]);
    if (!lit) continue;
    if (hasLOS(map, px, py, x, y)) vis[y * map.w + x] = 1;
  }
  return vis;
}
