// Blank map vellum for the minimap and the big map: outdoor land the company
// has never seen is drawn as old parchment, with a faint ink line where the
// charted land ends (the 3D view does the same in its shader).

export const VELLUM = '#e2cfa2';

const cache = new Map();

// parchment over a canvas rectangle: a warm base, soft stains and fine grain
// (painted once per size, then copied)
export function fillVellum(ctx, x, y, w, h, unit = 4) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const key = `${w}x${h}x${Math.round(unit)}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 6) cache.clear();
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h, unit);
    cache.set(key, c);
  }
  ctx.drawImage(c, x, y);
}

function paint(ctx, w, h, unit) {
  const x = 0, y = 0;
  ctx.fillStyle = VELLUM;
  ctx.fillRect(x, y, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.save();
  // broad stains
  for (let i = 0; i < 14; i++) {
    const cx = x + rnd() * w, cy = y + rnd() * h, r = (0.12 + rnd() * 0.22) * Math.max(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rnd() < 0.5 ? 'rgba(150,110,60,0.10)' : 'rgba(255,248,225,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // fibres and specks
  const n = Math.min(1600, Math.round((w * h) / Math.max(18, unit * unit * 2)));
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() < 0.55 ? 'rgba(110,80,40,0.10)' : 'rgba(255,250,235,0.18)';
    ctx.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * Math.max(1, unit * 0.6), 1);
  }
  ctx.restore();
}

// Where charted land meets blank vellum: the known edge squares fade a little
// towards the paper, and a thin brown ink line runs along the border.
// sx/sy map tile coordinates to canvas pixels; k is the pixel size of a tile.
export function inkEdges(ctx, map, explored, x0, y0, x1, y1, sx, sy, k) {
  const known = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || !!explored[y * map.w + x];
  ctx.save();
  ctx.fillStyle = 'rgba(226,207,162,0.38)';
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!known(x, y)) continue;
    if (known(x - 1, y) && known(x + 1, y) && known(x, y - 1) && known(x, y + 1)) continue;
    ctx.fillRect(sx(x), sy(y), k, k);
  }
  ctx.strokeStyle = 'rgba(92,60,30,0.7)';
  ctx.lineWidth = Math.max(1, k / 7);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!known(x, y)) continue;
    if (!known(x, y - 1)) { ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x + 1), sy(y)); }
    if (!known(x, y + 1)) { ctx.moveTo(sx(x), sy(y + 1)); ctx.lineTo(sx(x + 1), sy(y + 1)); }
    if (!known(x - 1, y)) { ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x), sy(y + 1)); }
    if (!known(x + 1, y)) { ctx.moveTo(sx(x + 1), sy(y)); ctx.lineTo(sx(x + 1), sy(y + 1)); }
  }
  ctx.stroke();
  ctx.restore();
}
