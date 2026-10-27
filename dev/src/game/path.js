// Breadth-first pathfinding on the tile grid.
import { DIR4 } from '../core/util.js';

// Returns the first step [x,y] from (sx,sy) towards (tx,ty), or null.
// passable(x,y) decides walkability; the target tile itself is always allowed.
export function stepToward(sx, sy, tx, ty, passable, maxR = 18) {
  if (sx === tx && sy === ty) return null;
  const key = (x, y) => (y + 512) * 2048 + (x + 512);
  const prev = new Map();
  prev.set(key(sx, sy), null);
  let frontier = [[sx, sy]];
  let found = false;
  while (frontier.length && !found) {
    const next = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        if (Math.abs(nx - sx) > maxR || Math.abs(ny - sy) > maxR) continue;
        const isTarget = nx === tx && ny === ty;
        if (!isTarget && !passable(nx, ny)) continue;
        prev.set(k, [x, y]);
        if (isTarget) { found = true; break; }
        next.push([nx, ny]);
      }
      if (found) break;
    }
    frontier = next;
  }
  if (!found) return null;
  let cur = [tx, ty];
  for (;;) {
    const p = prev.get(key(cur[0], cur[1]));
    if (!p) return null;
    if (p[0] === sx && p[1] === sy) return cur;
    cur = p;
  }
}

// Full path (list of [x,y], excluding start) or null
export function findPath(sx, sy, tx, ty, passable, maxR = 40) {
  const path = [];
  let x = sx, y = sy;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const s = stepToward(x, y, tx, ty, passable, maxR);
    if (!s) return path.length ? path : null;
    const k = s[0] + ',' + s[1];
    if (seen.has(k)) return path;
    seen.add(k);
    path.push(s);
    [x, y] = s;
    if (x === tx && y === ty) return path;
  }
  return path;
}

export function dist4(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
export function dist8(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
