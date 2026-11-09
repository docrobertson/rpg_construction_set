// The Land step: broad strokes on a world map. Big regions of forest, hills,
// desert or sea, painted in long smooth strokes; coasts raised from the sea or
// sunk beneath it; rivers, roads and ridges; and the places of the realm
// dropped where they belong, then joined by roads. (Tile-by-tile work is the
// Details step.)
import { h, clear, modal, toast, promptDialog } from '../dom.js';
import { FEATURE_KINDS, T, terrain } from '../../data/terrain.js';
import { getTile, inBounds, resizeMap } from '../../world/map.js';
import { STAMPS, placeFeature } from '../../world/generate.js';
import { placesOf, autoPlaceSites, connectPlaces, defaultPlan, placeSummary, PLACE_ICONS } from '../../world/places.js';
import { fbm } from '../../core/noise.js';
import { hash2 } from '../../core/rng.js';
import { defaultSiteName } from './tools.js';
import { sowFields, inFieldPlot } from '../../world/countryside.js';

const SEA = ['raise', 'sink', 'island', 'lake'];
const REGIONS = ['forest', 'pines', 'hills', 'mountains', 'swamp', 'desert', 'snow', 'blight', 'meadow', 'fields', 'jungle', 'tropical', 'mangrove', 'clear'];
const PATHS = ['road', 'river', 'ridge'];

// ------------------------------------------------------------ region brushes
// Each brush says what a square becomes at depth d into the stroke (0 at its
// spine, 1 at its edge), from what it was before the stroke began. A stroke is
// one smooth shape however it is dragged: every square keeps the deepest it
// has been, and is worked out afresh from the land as it was.
const plainLand = (cur) => { const c = terrain(cur); return !(c.water || c.feature || c.key === 'road' || c.key === 'bridge'); };
const nat = (keep, pick) => (x, y, d, cur, r, seed) => {
  if (d >= 1 || !plainLand(cur) || keep.includes(terrain(cur).key)) return null;
  return pick(x, y, d, r, seed);
};
const HIGH = ['mountains', 'peaks'];
const BRUSHES = {
  raise: {
    label: 'Raise land', icon: '🏞', desc: 'Raise new land out of the sea, with beaches at its edge. Drag along a coast to push it out.', margin: 0.18, rough: 0.3,
    pick(x, y, d, cur) {
      const c = terrain(cur);
      if (c.feature || !c.water || c.deck) return null;
      if (d >= 1) return c.key === 'ocean' ? 'shallows' : null;
      return d > 0.78 ? 'sand' : fbm(x * 0.2, y * 0.2, 303, 2) > 0.58 ? 'meadow' : 'grass';
    },
  },
  sink: {
    label: 'Sink into the sea', icon: '🌊', desc: 'Drown the land: deep water, a shallow edge and a sandy new shore. Drag to cut a bay or a strait.', margin: 0.15, rough: 0.3,
    pick(x, y, d, cur) {
      const c = terrain(cur);
      if (c.feature) return null;
      if (d >= 1) return !c.water && plainLand(cur) && !HIGH.includes(c.key) ? 'sand' : null;
      if (d < 0.62) return 'ocean';
      return c.key === 'ocean' ? null : 'shallows';
    },
  },
  island: {
    margin: 0.3, rough: 0.32,
    pick(x, y, d, cur, r, seed) {
      const c = terrain(cur);
      if (c.feature || c.key === 'road' || c.key === 'bridge') return null;
      if (d >= 1) return c.key === 'ocean' ? 'shallows' : null;
      const n1 = fbm(x * 0.3, y * 0.3, seed + 7, 3), n2 = fbm(x * 0.25, y * 0.25, seed + 19, 3);
      let k = d > 0.8 ? 'sand' : n1 > 0.55 ? 'meadow' : 'grass';
      if (d < 0.75 && r >= 4 && n2 > 0.58) k = d < 0.4 && r >= 7 ? 'pines' : 'forest';
      if (r >= 7 && d < 0.32 && n1 < 0.45) k = 'hills';
      if (r >= 10 && d < 0.16) k = 'mountains';
      return k;
    },
  },
  lake: {
    icon: '💧', margin: 0.15, rough: 0.32,
    pick(x, y, d, cur, r) {
      const c = terrain(cur);
      if (c.feature) return null;
      if (d < 0.6 && r >= 3) return 'ocean';
      if (d < 1) return c.key === 'ocean' ? 'ocean' : 'shallows';
      return !c.water && plainLand(cur) && d < 1.12 ? 'sand' : null;
    },
  },
  forest: { pick: nat([], (x, y, d, r, seed) => (d > 0.8 && hash2(x, y, seed) < 0.35 ? null : 'forest')) },
  pines: { pick: nat([], (x, y, d, r, seed) => (d < 0.6 ? 'pines' : d > 0.85 && hash2(x, y, seed) < 0.4 ? null : 'forest')) },
  hills: { pick: nat(HIGH, (x, y, d, r, seed) => (d > 0.85 && hash2(x, y, seed) < 0.3 ? null : 'hills')) },
  mountains: { rough: 0.2, pick: nat([], (x, y, d, r, seed) => (d < 0.4 && r >= 3 && fbm(x * 0.4, y * 0.4, seed + 3) > 0.45 ? 'peaks' : d < 0.78 ? 'mountains' : 'hills')) },
  swamp: { pick: nat([], (x, y, d, r, seed) => (d > 0.85 && hash2(x, y, seed) < 0.4 ? null : 'swamp')) },
  desert: { pick: nat([], (x, y, d) => (d < 0.75 ? 'desert' : 'sand')) },
  snow: { pick: nat(HIGH, (x, y, d, r, seed) => (hash2(x, y, seed + 1) < 0.12 ? 'pines' : 'snow')) },
  blight: { pick: nat(HIGH, (x, y, d, r, seed) => (d < 0.7 && fbm(x * 0.35, y * 0.35, seed + 11) > 0.62 ? 'lava' : 'ash')) },
  meadow: { pick: nat([], (x, y, d, r, seed) => (hash2(x, y, seed) < 0.6 ? 'meadow' : 'grass')) },
  // farmland is sown only on open grass and meadow, in a patchwork of plots
  fields: {
    label: 'Farmland', icon: '🌾', desc: 'A patchwork of fenced fields, sown only on open grass and meadow: roads, water, woods and places are left alone.',
    pick(x, y, d, cur, r, seed) {
      const k = terrain(cur).key;
      return d < 1 && (k === 'grass' || k === 'meadow') && inFieldPlot(x, y, seed) ? 'fields' : null;
    },
  },
  // (isles) jungle inland; a tropical shore of palms, reefs and mangroves
  jungle: { pick: nat(HIGH, (x, y, d, r, seed) => (d > 0.86 ? (hash2(x, y, seed) < 0.5 ? 'vines' : null) : d > 0.7 || hash2(x, y, seed + 2) < 0.07 ? 'vines' : 'jungle')) },
  tropical: {
    label: 'Tropical coast', icon: '🏝', margin: 0.1,
    desc: 'A tropical shore: palms along the sand, coral reefs in the shallows, mangroves in the creeks and the jungle behind. Drag it along a coast.',
    pick(x, y, d, cur, r, seed, map) {
      const c = terrain(cur);
      if (d >= 1 || c.feature || c.deck || c.key === 'road' || c.key === 'bridge' || HIGH.includes(c.key)) return null;
      if (c.key === 'shallows') return fbm(x * 0.35, y * 0.35, seed + 5, 2) > 0.47 ? 'reef' : null;
      if (c.water) return null;
      if (c.key === 'swamp') return 'mangrove';
      const near = (k) => { for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { const t = inBounds(map, x + dx, y + dy) && terrain(getTile(map, x + dx, y + dy)); if (t && t.water && !t.deck) return true; } return false; };
      if (c.key === 'sand' || c.key === 'desert' || near(1)) return hash2(x, y, seed) < 0.55 ? 'palms' : 'sand';
      if (near(3)) return hash2(x, y, seed + 1) < 0.75 ? 'palms' : 'vines';
      return fbm(x * 0.3, y * 0.3, seed + 9, 2) > 0.5 ? 'jungle' : 'vines';
    },
  },
  mangrove: {
    label: 'Mangroves', icon: '🌳', margin: 0.1,
    desc: 'Mangrove swamp: trees standing on their roots in the shallows. Wadeable, slowly; no ship gets through. Paint it over shallow water, a marsh or a muddy shore.',
    pick(x, y, d, cur, r, seed) {
      const c = terrain(cur);
      if (d >= 1 || c.feature || c.deck || c.key === 'road' || c.key === 'bridge' || HIGH.includes(c.key) || c.key === 'ocean') return null;
      if (c.key === 'shallows' || c.key === 'swamp' || c.key === 'reef') return d > 0.85 && hash2(x, y, seed) < 0.4 ? null : 'mangrove';
      return d < 0.6 ? 'mangrove' : hash2(x, y, seed) < 0.5 ? 'swamp' : null;
    },
  },
  clear: { rough: 0.15, pick: nat([], () => 'grass') },
};

function brushTool(key) {
  const B = BRUSHES[key];
  const st = STAMPS[key];
  const margin = B.margin ?? 0, rough = B.rough ?? 0.32;
  return {
    label: B.label || st.label, icon: B.icon || st.icon,
    hint: `${B.desc || st.desc} Click, or drag for broad smooth strokes; the size slider sets how broad.`,
    cursor: 'stamp',
    down(ed, t) {
      ed.beginEdit();
      this.s = { seed: Math.floor(Math.random() * 1e6), orig: new Map(), best: new Map(), noise: new Map(), last: t };
      this.paint(ed, t, t);
    },
    drag(ed, t) {
      if (!this.s) return;
      this.paint(ed, this.s.last, t);
      this.s.last = t;
    },
    up() { this.s = null; },
    paint(ed, a, b) {
      const map = ed.map, s = this.s;
      const r = Math.max(1, ed.stampSize);
      const R = Math.ceil(r * (1 + margin + rough)) + 1;
      const x0 = Math.max(0, Math.min(a.x, b.x) - R), x1 = Math.min(map.w - 1, Math.max(a.x, b.x) + R);
      const y0 = Math.max(0, Math.min(a.y, b.y) - R), y1 = Math.min(map.h - 1, Math.max(a.y, b.y) + R);
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, empty: true };
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        // how far into the stroke: the distance to this drag's segment, made ragged
        const u = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
        const dd = Math.hypot(x - (a.x + u * dx), y - (a.y + u * dy)) / Math.max(0.6, r);
        if (dd > 1 + margin + rough) continue;
        const k = y * map.w + x;
        let n = s.noise.get(k);
        if (n === undefined) { n = (fbm(x * 0.21 + s.seed * 0.013, y * 0.21, s.seed, 3) - 0.5) * 2 * rough; s.noise.set(k, n); }
        const d = dd + n;
        if (d > 1 + margin) continue;
        const prev = s.best.get(k);
        if (prev !== undefined && prev <= d) continue;
        s.best.set(k, d);
        if (!s.orig.has(k)) s.orig.set(k, map.tiles[k]);
        const cur = s.orig.get(k);
        const pick = B.pick(x, y, Math.max(0, d), cur, r, s.seed, map);
        const id = pick == null ? cur : T[pick];
        if (map.tiles[k] === id) continue;
        map.tiles[k] = id;
        bx.empty = false;
        bx.x0 = Math.min(bx.x0, x); bx.y0 = Math.min(bx.y0, y); bx.x1 = Math.max(bx.x1, x); bx.y1 = Math.max(bx.y1, y);
      }
      if (!bx.empty) ed.changed(bx);
    },
  };
}

// Found a place where the designer clicks; its map is built from a plan
function foundTool(kind) {
  const fk = FEATURE_KINDS[kind];
  return {
    label: fk.label, icon: PLACE_ICONS[kind] || '⌂', cursor: 'tile',
    hint: `Click the map to found a ${fk.label.toLowerCase()}. Its map is built for you from a plan you can change in the Places step.`,
    async down(ed, t) {
      if (!inBounds(ed.map, t.x, t.y)) return;
      const td = terrain(getTile(ed.map, t.x, t.y));
      if (td.water && !td.deck) { toast('Places stand on dry land: click the shore beside the water.', 'warn'); return; }
      if (td.feature) { toast('There is a place there already.', 'warn'); return; }
      const pending = ed.pendingSite?.kind === kind ? ed.pendingSite : null;
      ed.pendingSite = null;
      const name = pending ? pending.name : await promptDialog(`Name your new ${fk.label.toLowerCase()}:`, defaultSiteName(kind), 'A new place');
      if (!name) return;
      if (ed.checkpoint) ed.checkpoint(`founding ${name}`); else ed.beginEdit();
      const plan = defaultPlan(kind);
      const sub = placeFeature(ed.game, ed.map, t.x, t.y, kind, name, plan.seed, plan);
      ed.changed({ x0: t.x, y0: t.y, x1: t.x, y1: t.y });
      ed.refreshEntities();
      const portal = ed.map.entities.find((e) => e.type === 'portal' && e.x === t.x && e.y === t.y);
      if (pending) { ed.setTab('places'); ed.places.select(sub); toast(`Founded ${name}. Design it here: what it holds, then Rebuild.`); return; }
      ed.renderMapPanel();
      if (portal) ed.select(portal);
      toast(`Founded ${name}. Double-click it in the list to design it in the Places step.`);
    },
  };
}

// The Land step's own tools, made once per editor
export function ensureLandTools(ed) {
  if (ed.tools.land_raise) return;
  for (const k of [...SEA, ...REGIONS]) ed.tools['land_' + k] = brushTool(k);
  for (const k of Object.keys(FEATURE_KINDS)) ed.tools['found_' + k] = foundTool(k);
}

// ------------------------------------------------------------ the panel
export function renderLandPanel(ed, L) {
  ensureLandTools(ed);
  const { section, toolBtn, slider } = ed.ui;
  const world = ed.map;
  L.appendChild(h('div.panel-title', 'The Land'));
  L.appendChild(h('p.hint', 'Broad strokes first: the shape of the land, its regions, rivers and roads, and where its places stand. Fine work comes later, in Details.'));
  const worlds = ed.game.maps.filter((m) => m.type === 'world');
  const pickWorld = worlds.length > 1 ? (() => {
    const s = h('select.map-select', { 'aria-label': 'World map' }, ...worlds.map((m) => h('option', { value: m.id }, m.name)));
    s.value = world.id;
    s.addEventListener('change', () => ed.loadMapById(s.value));
    return s;
  })() : null;
  L.appendChild(section('The world', 'Its size, and a whole new land at a stroke',
    pickWorld,
    h('div.land-size', h('b', world.name), h('span', ` ${world.w} × ${world.h} squares`)),
    h('div.land-btns',
      h('button', { title: 'A whole new land: choose its shape, seas, mountains and forests', onclick: () => ed.regenerateDialog() }, '🎲 Generate the world…'),
      h('button', { title: 'Make the world larger or smaller', onclick: () => resizeDialog(ed) }, '⤢ Size…'))));
  L.appendChild(section('Paint the land', 'Click to drop a region, or drag for long smooth strokes — a coast, a forest, a range of hills. The size sets how broad the stroke is.',
    h('div.land-sub', 'Land and sea'),
    h('div.tool-grid.land-two', ...SEA.map((k) => toolBtn('land_' + k))),
    h('div.land-sub', 'Regions'),
    h('div.tool-grid', ...REGIONS.map((k) => toolBtn('land_' + k))),
    slider('Size', 1, 20, ed.stampSize, (v) => { ed.stampSize = v; })));
  L.appendChild(section('Rivers, roads and ridges', 'Drag across the map. Roads bridge rivers on their own.',
    h('div.tool-grid', ...PATHS.map((k) => toolBtn('path_' + k))),
    slider('Width', 1, 4, ed.pathWidth, (v) => { ed.pathWidth = v; }),
    h('button.wide.land-roads', { title: 'Lay roads joining every place and the start, round the mountains and over the rivers, using the roads already there', onclick: () => joinRoads(ed) }, '🛣 Join the places with roads')));
  L.appendChild(section('Places', 'Click the map to found a town, castle or dungeon — its map is built for you — or let the land choose good spots.',
    h('div.tool-grid', ...Object.keys(FEATURE_KINDS).map((k) => toolBtn('found_' + k))),
    h('button.wide', { title: 'Choose how many of each kind; they go where the ground suits them', onclick: () => findSpotsDialog(ed) }, '✦ Find spots for places…'),
    h('button.wide.land-fields', { title: 'Sow a patchwork of fields on the open grass round every town, village and castle (roads, water and anything standing there are left alone)', onclick: () => sowAround(ed) }, '🌾 Fields round the towns')));
  const places = placesOf(ed.game).filter((p) => p.world === world);
  if (places.length) {
    const list = h('div.entry-list.land-places', ...places.map((p) => {
      const b = h('button.entry.land-place' + (ed.selected === p.portal ? '.on' : ''), {
        title: `${p.map.name}: click to look, double-click to design it in Places`,
        onclick: () => { ed.view.focus(p.portal.x, p.portal.y); ed.select(p.portal); for (const x of list.children) x.classList.toggle('on', x === b); },
        ondblclick: () => { ed.setTab('places'); ed.places.select(p.map); },
      }, h('span.lp-ic', PLACE_ICONS[p.kind] || '⌂'), h('span.lp-txt', h('b', p.map.name), h('small', placeSummary(ed.game, p.map, p.kind))));
      return b;
    }));
    L.appendChild(section(`On this map (${places.length})`, 'Click to look at a place; double-click to design it in the Places step.', list));
  }
}

// ------------------------------------------------------------ actions
function sowAround(ed, sites = null) {
  const world = ed.map;
  if (world.type !== 'world') return;
  ed.beginEdit();
  const b = sowFields(world, { seed: Math.floor(Math.random() * 1e6), sites, keep: [ed.game.settings.start] });
  if (b.x1 >= b.x0) ed.changed(b); else ed.markDirty();
  toast(b.sown ? `Sowed ${b.sown} square${b.sown === 1 ? '' : 's'} of fields.` : 'There is no open grass left round the towns to sow.', b.sown ? '' : 'warn');
}

function joinRoads(ed) {
  const world = ed.map;
  if (world.type !== 'world') return;
  if (ed.checkpoint) ed.checkpoint('roads between the places'); else ed.beginEdit();
  const b = connectPlaces(ed.game, world, { seed: Math.floor(Math.random() * 1e6) });
  if (!b) { toast('There are not yet two places to join (the start counts as one).'); return; }
  if (b.x1 >= b.x0) ed.changed(b); else ed.markDirty();
  const n = b.unreached?.length || 0;
  toast(n ? `Roads laid. There is no way over land to ${b.unreached.join(', ')}: give ${n === 1 ? 'it' : 'them'} a bridge, a waygate, or a ship.` : b.x1 >= b.x0 ? 'Roads laid between all the places.' : 'Every place is joined already.', n ? 'warn' : '');
}

function findSpotsDialog(ed) {
  const world = ed.map;
  const o = Object.fromEntries(Object.keys(FEATURE_KINDS).map((k) => [k, 0]));
  o.town = 1;
  let roads = true, fields = true;
  const body = h('div.land-find');
  const draw = () => {
    clear(body);
    body.appendChild(h('p.hint', 'How many of each? They go where the ground suits them: harbours and sea caves on the coast, dwarf holds by the mountains, elven halls in the woods, the dark fortress far from the start — and the rest on open land, apart from each other, where the company can walk to.'));
    body.appendChild(h('div.land-kinds', ...Object.entries(FEATURE_KINDS).map(([k, f]) => {
      const n = h('b.pl-n', String(o[k]));
      const bump = (d) => { o[k] = Math.max(0, Math.min(8, o[k] + d)); n.textContent = String(o[k]); row.classList.toggle('on', o[k] > 0); };
      const row = h('div.pl-count' + (o[k] ? '.on' : ''), h('span.pl-cic', PLACE_ICONS[k]), h('span.pl-cl', h('span', f.label)),
        h('button.small.pl-pm', { onclick: () => bump(-1), 'aria-label': `One fewer ${f.label}` }, '−'), n, h('button.small.pl-pm', { onclick: () => bump(1), 'aria-label': `One more ${f.label}` }, '+'));
      return row;
    })));
    const cb = h('input', { type: 'checkbox' });
    cb.checked = roads;
    cb.addEventListener('change', () => { roads = cb.checked; });
    body.appendChild(h('label.field.check', cb, h('span.field-label', 'Then join every place with roads')));
    const fb = h('input', { type: 'checkbox' });
    fb.checked = fields;
    fb.addEventListener('change', () => { fields = fb.checked; });
    body.appendChild(h('label.field.check', fb, h('span.field-label', 'And sow fields round the new towns and villages')));
  };
  draw();
  modal(body, {
    title: 'Find spots for places', sub: world.name, cls: 'land-find-modal',
    buttons: [{ label: 'Cancel' }, {
      label: 'Found them', primary: true, onClick: () => {
        const wants = [];
        const names = new Set(ed.game.maps.map((m) => m.name));
        for (const [k, n] of Object.entries(o)) for (let i = 0; i < n; i++) {
          let name = defaultSiteName(k);
          for (let j = 0; j < 20 && names.has(name); j++) name = defaultSiteName(k);
          names.add(name);
          wants.push({ kind: k, name });
        }
        if (!wants.length) return;
        if (ed.checkpoint) ed.checkpoint('new places'); else ed.beginEdit();
        const placed = autoPlaceSites(ed.game, world, wants, { seed: Math.floor(Math.random() * 1e9) });
        let roadNote = '';
        if (roads && placed.length) {
          const b = connectPlaces(ed.game, world, { seed: Math.floor(Math.random() * 1e6) });
          if (b?.unreached?.length) roadNote = ` No road reaches ${b.unreached.join(', ')}.`;
        }
        if (fields && placed.length) sowFields(world, { seed: Math.floor(Math.random() * 1e6), sites: placed.map((p) => p.portal).filter(Boolean), keep: [ed.game.settings.start] });
        ed.markDirty();
        ed.loadMap(world, true);
        toast(`Founded ${placed.length} of ${wants.length} place${wants.length === 1 ? '' : 's'}${placed.length < wants.length ? ' (the land had no good spot for the rest)' : ''}.${roadNote}`, placed.length < wants.length ? 'warn' : '');
      },
    }],
  });
}

// Make the world larger or smaller about its middle, and move everything that
// points at a square of it to match (the way out of every place, waygates,
// the start, quest goals)
function resizeDialog(ed) {
  const world = ed.map;
  const wIn = h('input', { type: 'number', min: 24, max: 160, step: 4, value: world.w });
  const hIn = h('input', { type: 'number', min: 24, max: 160, step: 4, value: world.h });
  const warn = h('p.hint.land-warn');
  const check = () => {
    const w = clampSize(wIn.value), hh = clampSize(hIn.value);
    const ox = Math.floor((w - world.w) / 2), oy = Math.floor((hh - world.h) / 2);
    const lost = world.entities.filter((e) => e.type === 'portal' && e.style === 'site' && (e.x + ox < 0 || e.y + oy < 0 || e.x + ox >= w || e.y + oy >= hh));
    warn.textContent = lost.length ? `${lost.map((p) => p.label).join(', ')} would be cut off: make it larger, or move ${lost.length === 1 ? 'it' : 'them'} first.` : w > world.w || hh > world.h ? 'New land at the edges is open sea: raise it with the brushes.' : w < world.w || hh < world.h ? 'The edges are cut away, and anything on them.' : '';
    return lost.length === 0;
  };
  wIn.addEventListener('input', check);
  hIn.addEventListener('input', check);
  check();
  modal(h('div.form', h('div.row', h('label.field', h('span.field-label', 'Width'), wIn), h('label.field', h('span.field-label', 'Height'), hIn)), warn,
    h('p.hint', 'The land grows or shrinks about its middle; the places, the start and every way back to the world map move with it.')), {
    title: `The size of ${world.name}`,
    buttons: [{ label: 'Cancel' }, {
      label: 'Resize', primary: true, onClick: () => {
        if (!check()) return false;
        const w = clampSize(wIn.value), hh = clampSize(hIn.value);
        if (w === world.w && hh === world.h) return;
        if (ed.checkpoint) ed.checkpoint(`resizing ${world.name}`); else ed.beginEdit();
        resizeWorld(ed.game, world, w, hh);
        ed.markDirty();
        ed.loadMap(world);
        toast(`${world.name} is now ${w} × ${hh} squares.`);
      },
    }],
  });
}

const clampSize = (v) => Math.max(24, Math.min(160, Math.round(+v || 64)));

export function resizeWorld(game, world, w, hh) {
  const ox = Math.floor((w - world.w) / 2), oy = Math.floor((hh - world.h) / 2);
  resizeMap(world, w, hh);
  const shift = (p) => { if (p && p.x != null && p.x !== '') { p.x = Math.max(0, Math.min(w - 1, +p.x + ox)); p.y = Math.max(0, Math.min(hh - 1, +p.y + oy)); } };
  for (const m of game.maps) {
    if (m.exit?.map === world.id) shift(m.exit);
    for (const e of m.entities || []) {
      if (e.type === 'portal' && e.target?.map === world.id && m !== world) shift(e.target);
      if (m === world && e.type === 'portal' && e.target?.map === world.id && e.target.x != null) shift(e.target);
      if (e.ship && e.ship.x != null && e.ship.x !== '') shift(e.ship);
    }
  }
  if (game.settings.start?.map === world.id) shift(game.settings.start);
  for (const q of game.quests || []) for (const s of q.stages || []) if (s.goal?.type === 'reach' && s.goal.map === world.id) shift(s.goal);
}
