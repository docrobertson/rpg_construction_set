// One breadth-first search to the nearest of several goal squares — for
// click-to-walk, where the party heads for whichever square next to a person
// (or across their counter) is closest.
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Path from (sx,sy) to the nearest square where isGoal(x, y) holds, as a list
// of [x, y] steps (not including the start); [] if already there, null if no
// way within maxR squares. Goal squares must be passable too.
export function bfsPath(sx, sy, isGoal, passable, maxR = 40) {
  if (isGoal(sx, sy)) return [];
  const W = maxR * 2 + 1;
  const prev = new Int32Array(W * W).fill(-1);
  const idx = (x, y) => (y - sy + maxR) * W + (x - sx + maxR);
  const start = idx(sx, sy);
  prev[start] = start;
  let front = [sx, sy];
  while (front.length) {
    const next = [];
    for (let i = 0; i < front.length; i += 2) {
      const x = front[i], y = front[i + 1];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (Math.abs(nx - sx) > maxR || Math.abs(ny - sy) > maxR) continue;
        const k = idx(nx, ny);
        if (prev[k] !== -1 || !passable(nx, ny)) continue;
        prev[k] = idx(x, y);
        if (isGoal(nx, ny)) {
          const path = [];
          let c = k;
          while (c !== start) { path.push([(c % W) - maxR + sx, Math.floor(c / W) - maxR + sy]); c = prev[c]; }
          return path.reverse();
        }
        next.push(nx, ny);
      }
    }
    front = next;
  }
  return null;
}
