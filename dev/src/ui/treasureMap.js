// The torn treasure map: a hand-inked sketch of the land round a hiding
// place, drawn from the real terrain on the same vellum the minimap uses for
// unexplored land, with a red X, the clue scrawled beneath, and the rough
// circle a read map puts on the big map and the minimap.
import { h, modal } from './dom.js';
import { fillVellum } from './vellum.js';
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { RNG, hashString } from '../core/rng.js';
import { readMap, roughArea, isDug, findSpot, landmarksNear } from '../game/treasure.js';
import { sfx } from '../core/sound.js';

const INK = 'rgba(58,36,18,0.88)', INK_SOFT = 'rgba(58,36,18,0.45)', RED = '#b3241b';
const SPAN = 15; // squares across the sketch

// Draw the sketch of the land round spot e of map onto a canvas
export function drawSketch(canvas, map, e) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const r = new RNG(hashString(String(e.id)));
  // the X is never quite in the middle
  const ox = e.x - Math.floor(SPAN / 2) + r.int(-2, 2), oy = e.y - Math.floor(SPAN / 2) + r.int(-2, 2);
  const k = W / SPAN;
  const px = (x) => (x - ox) * k, py = (y) => (y - oy) * k;
  const tile = (x, y) => (inBounds(map, x, y) ? terrain(getTile(map, x, y)) : null);
  const wet = (t) => !t || (t.water && !t.deck);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  // a torn edge all round
  const edge = [];
  const jag = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) { const t = i / n; edge.push([x0 + (x1 - x0) * t + r.float(-5, 5) * (y0 === y1 ? 0.3 : 1), y0 + (y1 - y0) * t + r.float(-5, 5) * (x0 === x1 ? 0.3 : 1)]); } };
  const m = 10;
  jag(m, m, W - m, m, 18); jag(W - m, m, W - m, H - m, 18); jag(W - m, H - m, m, H - m, 18); jag(m, H - m, m, m, 18);
  // one corner torn right off
  const c0 = r.int(0, 3), cut = r.float(40, 70);
  const corners = [[m, m], [W - m, m], [W - m, H - m], [m, H - m]];
  const cc = corners[c0];
  const tear = (p) => {
    const dx = Math.abs(p[0] - cc[0]), dy = Math.abs(p[1] - cc[1]);
    if (dx + dy >= cut) return p;
    const f = cut / Math.max(1, dx + dy);
    return [cc[0] + (p[0] - cc[0]) * f, cc[1] + (p[1] - cc[1]) * f];
  };
  const path = edge.map(tear);
  ctx.beginPath();
  path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#cfb98a';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  fillVellum(ctx, 0, 0, W, H, 4);

  const x0 = Math.floor(ox) - 1, y0 = Math.floor(oy) - 1, x1 = ox + SPAN + 1, y1 = oy + SPAN + 1;
  // the sea: a grey-blue wash, hatched with little waves, an inked shore
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const t = tile(x, y);
    if (!wet(t)) continue;
    ctx.fillStyle = t && t.key === 'shallows' ? 'rgba(70,110,120,0.18)' : 'rgba(60,90,110,0.3)';
    ctx.fillRect(px(x), py(y), k + 0.5, k + 0.5);
    if ((x * 7 + y * 3) % 4 === 0 && (!t || t.key !== 'shallows')) {
      ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 1.2;
      const cx = px(x + 0.5), cy = py(y + 0.5);
      ctx.beginPath(); ctx.moveTo(cx - k * 0.3, cy); ctx.quadraticCurveTo(cx - k * 0.15, cy - k * 0.15, cx, cy); ctx.quadraticCurveTo(cx + k * 0.15, cy + k * 0.15, cx + k * 0.3, cy); ctx.stroke();
    }
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (wet(tile(x, y))) continue;
    const j = () => r.float(-1.2, 1.2);
    if (wet(tile(x, y - 1))) { ctx.moveTo(px(x) + j(), py(y) + j()); ctx.lineTo(px(x + 1) + j(), py(y) + j()); }
    if (wet(tile(x, y + 1))) { ctx.moveTo(px(x) + j(), py(y + 1) + j()); ctx.lineTo(px(x + 1) + j(), py(y + 1) + j()); }
    if (wet(tile(x - 1, y))) { ctx.moveTo(px(x) + j(), py(y) + j()); ctx.lineTo(px(x) + j(), py(y + 1) + j()); }
    if (wet(tile(x + 1, y))) { ctx.moveTo(px(x + 1) + j(), py(y) + j()); ctx.lineTo(px(x + 1) + j(), py(y + 1) + j()); }
  }
  ctx.stroke();
  // roads: a dashed double line from square to square
  ctx.setLineDash([k * 0.22, k * 0.14]);
  ctx.lineWidth = 1.6; ctx.strokeStyle = INK;
  ctx.beginPath();
  const paved = (x, y) => { const t = tile(x, y); return t && (t.key === 'road' || t.key === 'bridge' || t.feature); };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!paved(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (paved(x + dx, y + dy)) { ctx.moveTo(px(x + 0.5), py(y + 0.5)); ctx.lineTo(px(x + 0.5 + dx), py(y + 0.5 + dy)); }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // the land: little drawings for woods, hills, mountains, marsh and sand
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const t = tile(x, y);
    if (!t || wet(t)) continue;
    const cx = px(x + 0.5) + r.float(-2, 2), cy = py(y + 0.5) + r.float(-2, 2);
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.4;
    switch (t.key) {
      case 'forest':
        for (const [dx, dy] of [[-0.18, -0.12], [0.2, 0.08]]) {
          const tx = cx + dx * k, ty = cy + dy * k;
          ctx.fillStyle = 'rgba(80,110,50,0.35)';
          ctx.beginPath(); ctx.arc(tx, ty - k * 0.12, k * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx, ty + k * 0.05); ctx.lineTo(tx, ty + k * 0.2); ctx.stroke();
        }
        break;
      case 'pines':
        for (const [dx, dy] of [[-0.2, -0.05], [0.18, 0.1]]) {
          const tx = cx + dx * k, ty = cy + dy * k;
          ctx.fillStyle = 'rgba(60,90,50,0.35)';
          ctx.beginPath(); ctx.moveTo(tx, ty - k * 0.3); ctx.lineTo(tx + k * 0.14, ty + k * 0.12); ctx.lineTo(tx - k * 0.14, ty + k * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        break;
      case 'hills': {
        const a = r.float(-0.15, 0.15) * k;
        ctx.beginPath(); ctx.arc(cx - k * 0.12 + a, cy + k * 0.1, k * 0.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        if (r.chance(0.6)) { ctx.beginPath(); ctx.arc(cx + k * 0.16 + a, cy + k * 0.22, k * 0.14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        break;
      }
      case 'mountains': case 'peaks': case 'dwarfgate':
        ctx.fillStyle = t.key === 'peaks' ? 'rgba(255,255,255,0.5)' : 'rgba(90,70,50,0.25)';
        ctx.beginPath(); ctx.moveTo(cx - k * 0.42, cy + k * 0.3); ctx.lineTo(cx - k * 0.02, cy - k * 0.38); ctx.lineTo(cx + k * 0.42, cy + k * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - k * 0.02, cy - k * 0.38); ctx.lineTo(cx + k * 0.08, cy + k * 0.3); ctx.stroke();
        break;
      case 'swamp':
        for (const dx of [-0.2, 0.15]) { ctx.beginPath(); ctx.moveTo(cx + dx * k, cy + k * 0.15); ctx.lineTo(cx + dx * k - 3, cy - k * 0.1); ctx.moveTo(cx + dx * k, cy + k * 0.15); ctx.lineTo(cx + dx * k + 3, cy - k * 0.12); ctx.stroke(); }
        break;
      case 'sand': case 'desert':
        ctx.fillStyle = INK_SOFT;
        for (let i = 0; i < 2; i++) ctx.fillRect(cx + r.float(-0.35, 0.35) * k, cy + r.float(-0.35, 0.35) * k, 1.5, 1.5);
        break;
      case 'grass': case 'meadow':
        if (r.chance(0.3)) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 3, cy + 2); ctx.lineTo(cx - 1, cy - 3); ctx.moveTo(cx + 1, cy + 2); ctx.lineTo(cx + 3, cy - 2); ctx.stroke(); }
        break;
      case 'ruins':
        for (const dx of [-0.2, 0, 0.22]) { ctx.strokeRect(cx + dx * k - 2, cy - k * (0.1 + Math.abs(dx)), 4, k * (0.3 + Math.abs(dx))); }
        break;
      case 'lava':
        ctx.fillStyle = 'rgba(200,60,20,0.4)'; ctx.fillRect(px(x), py(y), k, k);
        break;
      default:
        if (t.feature) {
          // a little walled town or keep
          ctx.fillStyle = 'rgba(240,230,200,0.9)';
          ctx.beginPath(); ctx.rect(cx - k * 0.32, cy - k * 0.12, k * 0.64, k * 0.4); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.rect(cx - k * 0.12, cy - k * 0.42, k * 0.24, k * 0.32); ctx.fill(); ctx.stroke();
          for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * k * 0.08 - 1.5, cy - k * 0.48, 3, 4);
        }
    }
  }
  // the landmarks a clue might count from: drawn small, and named
  const marks = landmarksNear(map, e.x, e.y, 9).filter((l) => l.e.x >= ox - 1 && l.e.y >= oy - 1 && l.e.x <= ox + SPAN && l.e.y <= oy + SPAN);
  ctx.font = `italic ${Math.round(k * 0.55)}px Alegreya, Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const shown = marks.slice(0, 4);
  const own = marks.find((l) => l.e.id === e.from);
  if (own && !shown.includes(own)) shown[shown.length - 1] = own;
  for (const l of shown) {
    const cx = px(l.e.x + 0.5), cy = py(l.e.y + 0.5);
    ctx.strokeStyle = INK; ctx.fillStyle = 'rgba(240,230,200,0.95)'; ctx.lineWidth = 1.6;
    if (l.e.type === 'event' || l.e.type === 'sign') {
      // a standing stone, a well, a shrine: a small pale stone with a dot
      ctx.beginPath(); ctx.moveTo(cx - k * 0.14, cy + k * 0.25); ctx.lineTo(cx - k * 0.1, cy - k * 0.25); ctx.lineTo(cx + k * 0.1, cy - k * 0.28); ctx.lineTo(cx + k * 0.14, cy + k * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    let label = l.name.replace(/^the /i, '').replace(/^./, (c) => c.toUpperCase());
    if (label.length > 24) label = label.slice(0, 23) + '…';
    const half = ctx.measureText(label).width / 2 + 4;
    ctx.fillStyle = INK;
    ctx.fillText(label, Math.max(m + half, Math.min(W - m - half, cx)), cy + k * 0.32);
  }
  // a dotted trail from the nearest landmark, and the X
  const lm = marks.find((l) => l.e.id === e.from) || marks[0];
  const X = px(e.x + 0.5), Y = py(e.y + 0.5);
  if (lm) {
    ctx.setLineDash([2, 6]); ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(150,30,20,0.75)';
    ctx.beginPath(); ctx.moveTo(px(lm.e.x + 0.5), py(lm.e.y + 0.5));
    const lx = px(lm.e.x + 0.5), ly = py(lm.e.y + 0.5);
    ctx.quadraticCurveTo((lx + X) / 2 + r.float(-12, 12), (ly + Y) / 2 + r.float(-12, 12), X, Y);
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = RED; ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(4, k * 0.2);
  const s = k * 0.42;
  ctx.beginPath(); ctx.moveTo(X - s, Y - s); ctx.lineTo(X + s * 1.05, Y + s * 0.95); ctx.moveTo(X + s, Y - s * 1.05); ctx.lineTo(X - s * 0.95, Y + s); ctx.stroke();
  // a compass mark in a corner
  const nx = W - 46, ny = 52;
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(nx, ny - 20); ctx.lineTo(nx + 6, ny); ctx.lineTo(nx, ny + 16); ctx.lineTo(nx - 6, ny); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(nx, ny - 20); ctx.lineTo(nx + 6, ny); ctx.lineTo(nx - 6, ny); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 15px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('N', nx, ny - 22);
  // age: darker, burnt edges
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.72);
  g.addColorStop(0, 'rgba(120,80,30,0)'); g.addColorStop(1, 'rgba(110,70,25,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.strokeStyle = 'rgba(90,55,25,0.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
}

// Read a treasure map: the sketch, the clue, and the place noted on the big map
export function showTreasureMap(ui, item) {
  const s = ui.s;
  const res = readMap(s, item);
  if (!res) { s.log(`The ${item.name} is too torn to make anything of.`, 'warn'); return null; }
  const { spot, map, first } = res;
  sfx('click');
  const canvas = h('canvas.tmap-canvas', { width: 480, height: 480 });
  drawSketch(canvas, map, spot);
  const dug = isDug(s, spot.id);
  const here = s.map?.id === map.id;
  const note = dug ? 'You have already dug up what was buried here.'
    : here ? 'You mark the place on your map (M): somewhere inside the red circle. Stand on the very spot and dig.'
      : `The place is in ${map.name}. It is marked on your map there.`;
  if (first && !dug) s.log(`You study the ${item.name} and mark the place on your map.`, 'quest');
  ui.refresh?.();
  return modal(h('div.tmap',
    canvas,
    h('p.tmap-clue', `“${spot.clue || 'X marks the spot.'}”`),
    h('p.hint', note)), { title: item.name, icon: 'map', cls: 'tmap-modal' });
}

// The circles of read, undug maps on this map (big map and minimap)
export function treasureCircles(s, map) {
  const st = s.state.treasure || {};
  const out = [];
  for (const [id, rec] of Object.entries(st)) {
    if (rec.read == null || rec.dug) continue;
    const found = findSpot(s.game, id);
    if (!found || found.map.id !== map.id) continue;
    out.push({ id, ...roughArea(found.e) });
  }
  return out;
}

// draw them: sx/sy map square coordinates to canvas pixels, k a square's size
export function drawTreasureCircles(ctx, circles, sx, sy, k, u = 1) {
  for (const c of circles) {
    const x = sx(c.x), y = sy(c.y), r = c.r * k;
    ctx.save();
    ctx.fillStyle = 'rgba(179,36,27,0.13)';
    ctx.strokeStyle = 'rgba(179,36,27,0.95)';
    ctx.lineWidth = Math.max(1.5 * u, k * 0.22);
    ctx.setLineDash([Math.max(3 * u, k * 0.6), Math.max(2 * u, k * 0.4)]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    // a small X in the middle: "somewhere about here"
    const q = Math.max(3 * u, k * 0.45);
    ctx.lineWidth = Math.max(1.5 * u, k * 0.25);
    ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke();
    ctx.restore();
  }
}
