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

// The quickest way (in turns, not squares) to the nearest goal square, where
// cost(x, y) is the turns a step onto a square takes: click-to-walk keeps to
// the roads and skirts the sands when that is faster. Same contract as bfsPath.
export function cheapestPath(sx, sy, isGoal, passable, cost, maxR = 40) {
  if (isGoal(sx, sy)) return [];
  const W = maxR * 2 + 1;
  const idx = (x, y) => (y - sy + maxR) * W + (x - sx + maxR);
  const prev = new Int32Array(W * W).fill(-1);
  const best = new Float64Array(W * W).fill(Infinity);
  const start = idx(sx, sy);
  prev[start] = start;
  best[start] = 0;
  // a small binary heap of [cost, x, y]
  const heap = [];
  const push = (c, x, y) => {
    heap.push([c, x, y]);
    let i = heap.length - 1;
    while (i > 0) { const pi = (i - 1) >> 1; if (heap[pi][0] <= heap[i][0]) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  push(0, sx, sy);
  while (heap.length) {
    const [c, x, y] = pop();
    const k0 = idx(x, y);
    if (c > best[k0]) continue;
    if (k0 !== start && isGoal(x, y)) {
      const path = [];
      let k = k0;
      while (k !== start) { path.push([(k % W) - maxR + sx, Math.floor(k / W) - maxR + sy]); k = prev[k]; }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (Math.abs(nx - sx) > maxR || Math.abs(ny - sy) > maxR) continue;
      const k = idx(nx, ny);
      if (k === start || !passable(nx, ny)) continue;
      // a hair per square, so of two equal ways the shorter wins
      const nc = c + Math.max(0.05, cost(nx, ny)) + 0.001;
      if (nc >= best[k]) continue;
      best[k] = nc;
      prev[k] = k0;
      push(nc, nx, ny);
    }
  }
  return null;
}
