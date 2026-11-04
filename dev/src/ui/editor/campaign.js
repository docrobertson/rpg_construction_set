// The Campaign step: the realm as a whole. Its title and premise, how it is
// won, the road through the other steps (with what each still needs), and
// the Quick Start that lays down a core campaign in one go: a world of the
// chosen size and shape, its towns and dungeons joined by roads, and the
// chapters of a story with the quests, people and keys they need.
import { h, clear, modal, toast } from '../dom.js';
import { buildForm } from './forms.js';
import { FEATURE_KINDS, terrain } from '../../data/terrain.js';
import { generateWorld, WORLD_SHAPES } from '../../world/generate.js';
import { worldMap } from '../../data/schema.js';
import { placesOf, autoPlaceSites, connectPlaces, besideSite } from '../../world/places.js';
import { sowFields } from '../../world/countryside.js';
import { PREMISES, generateStory } from '../../world/storyGen.js';
import { chapterList } from '../../game/story.js';
import { buryTreasures, forgetLostMaps } from '../../game/treasure.js';
import { defaultSiteName } from './tools.js';
import { STEPS } from './editor.js';

const TOWNLIKE = new Set(['town', 'castle', 'village', 'elfhall', 'dwarfgate', 'harbour']);

// A realm the Quick Start would not be overwriting much of
export function isFresh(game) {
  return placesOf(game).length <= 1 && !(game.quests || []).length && !chapterList(game).length;
}

export function renderCampaign(ed, left, main) {
  const game = ed.game;
  clear(left);
  clear(main);
  const fresh = isFresh(game);

  left.appendChild(h('div.panel-title', '🏁 Campaign'));
  left.appendChild(h('p.hint', 'The steps of building a realm, in the order they usually go. Jump between them whenever you like: nothing waits on anything else.'));
  STEPS.forEach(([k, label, tip], i) => left.appendChild(h('button.entry.step-entry', { title: tip, onclick: () => ed.setTab(k) }, h('span.step-n', String(i + 1)), label, h('span.tag', stepCount(ed, k)))));
  left.appendChild(h('div.row', h('button.primary.wide', { onclick: () => quickStart(ed) }, '✦ Quick Start…')));

  main.appendChild(h('div.db-head', h('h2', `🏁 ${game.meta.title || 'Untitled Realm'}`)));
  if (fresh) {
    main.appendChild(h('div.qs-card',
      h('div.qs-text', h('b', '✦ Quick Start'), h('p', 'Answer a few questions — how big a world, which places, what kind of story — and a core campaign is laid down for you: the land, its towns and dungeons joined by roads, and chapters of quests with the people and keys they need. Then make it yours, step by step.')),
      h('button.primary', { onclick: () => quickStart(ed) }, 'Start…')));
  }

  // the road through the steps
  const road = h('div.roadmap');
  STEPS.forEach(([k, label, tip], i) => {
    const found = (ed.findings || []).filter((f) => f.area === k && f.level !== 'ok');
    const errs = found.filter((f) => f.level === 'error').length;
    road.appendChild(h('button.road-step' + (errs ? '.bad' : found.length ? '.warn' : ''), { onclick: () => ed.setTab(k) },
      h('span.road-n', String(i + 1)),
      h('span.road-body', h('b', label), h('span.road-tip', tip), h('span.road-status', stepStatus(ed, k))),
      h('span.road-check', found.length ? `${found.length} to do` : '✓')));
  });
  main.appendChild(h('div.settings-section', h('h2', 'The road to a finished realm'), road));

  main.appendChild(h('div.settings-section', h('h2', '📜 The realm'), buildForm(game, [
    { key: 'meta.title', label: 'Title', type: 'text' },
    { key: 'meta.author', label: 'Author', type: 'text' },
    { key: 'meta.description', label: 'Blurb', type: 'textarea', rows: 2, hint: 'Shown when players choose an adventure.' },
    { key: 'meta.intro', label: 'Opening story', type: 'textarea', rows: 7, hint: 'Shown before play begins. Blank lines separate paragraphs.' },
  ], (k) => { ed.markDirty(); if (k === 'meta.title') { ed.refreshTitle(); const hd = main.querySelector('.db-head h2'); if (hd) hd.textContent = `🏁 ${game.meta.title}`; } })));

  if (!game.settings.victory) game.settings.victory = { type: 'none', target: '' };
  const vic = h('div');
  const renderVic = () => {
    clear(vic);
    vic.appendChild(buildForm(game, [
      { key: 'settings.victory.type', label: 'The game is won when…', type: 'select', options: [['none', 'Never (open-ended)'], ['kill', 'A certain monster is slain'], ['item', 'A certain item is found'], ['flag', 'A story flag is set (e.g. by a conversation)']], rerender: true },
      { key: 'settings.victory.target', label: 'Monster', type: 'select', options: () => game.monsters.map((m) => [m.id, m.name]), show: (o) => o.settings.victory.type === 'kill' },
      { key: 'settings.victory.target', label: 'Item', type: 'select', options: () => game.items.map((m) => [m.id, m.name]), show: (o) => o.settings.victory.type === 'item' },
      { key: 'settings.victory.target', label: 'Flag', type: 'text', show: (o) => o.settings.victory.type === 'flag' },
      { key: 'meta.victoryText', label: 'Victory text', type: 'textarea', rows: 4 },
      { type: 'info', label: 'Tip: a conversation keyword with the action “Win the game!” also ends the adventure in triumph.' },
    ], () => ed.markDirty()));
  };
  renderVic();
  main.appendChild(h('div.settings-section', h('h2', '🏆 How it ends'), vic));

  const world = worldMap(game);
  main.appendChild(h('div.settings-section', h('h2', '🗺 The world'),
    h('div.world-glance', minimap(ed, world),
      h('div.world-side',
        h('p', `${world.name} is ${world.w} × ${world.h} squares, with ${placesOf(game).filter((p) => p.world === world).length} places on it. Click the map to go there.`),
        h('div.col',
          h('button', { onclick: () => { ed.setTab('land'); ed.regenerateDialog(); } }, '🎲 Generate a new world…'),
          h('button', { onclick: () => { ed.setTab('land'); ed.select(null); } }, 'Resize or shape the land →')),
        fresh ? null : h('p.hint', 'The Quick Start can also add to a realm already under way: more places, or more chapters.', ' ', h('button.small', { onclick: () => quickStart(ed) }, '✦ Quick Start…'))))));
}

// The world at a glance: its land and sea, its places and where the
// adventure begins. Click to go there in the Land step.
function minimap(ed, world) {
  const scale = Math.max(2, Math.floor(340 / Math.max(world.w, world.h)));
  const W = world.w * scale, H = world.h * scale;
  const cv = h('canvas.minimap', { width: W, height: H });
  const ctx = cv.getContext('2d');
  const px = document.createElement('canvas');
  px.width = world.w; px.height = world.h;
  const pc = px.getContext('2d');
  const img = pc.createImageData(world.w, world.h);
  for (let i = 0; i < world.tiles.length; i++) {
    const c = terrain(world.tiles[i]).top ?? 0x406040;
    img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
  }
  pc.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(px, 0, 0, W, H);
  const places = placesOf(ed.game).filter((p) => p.world === world);
  ctx.font = '600 11px sans-serif';
  ctx.textAlign = 'center';
  for (const p of places) {
    const x = (p.portal.x + 0.5) * scale, y = (p.portal.y + 0.5) * scale;
    const town = TOWNLIKE.has(p.kind);
    ctx.fillStyle = town ? '#ffd86a' : '#e07050';
    ctx.strokeStyle = '#1a0e04';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (town) ctx.arc(x, y, 4.5, 0, Math.PI * 2); else { ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); }
    ctx.stroke(); ctx.fill();
    // names stay inside the frame
    const tw = ctx.measureText(p.map.name).width;
    const lx = Math.min(W - tw / 2 - 2, Math.max(tw / 2 + 2, x)), ly = y < 16 ? y + 16 : y - 8;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20,12,4,.85)';
    ctx.strokeText(p.map.name, lx, ly);
    ctx.fillStyle = '#fff4d8';
    ctx.fillText(p.map.name, lx, ly);
  }
  const st = ed.game.settings.start;
  if (st?.map === world.id) {
    const x = (st.x + 0.5) * scale, y = (st.y + 0.5) * scale;
    ctx.fillStyle = '#ff4030'; ctx.strokeStyle = '#1a0e04'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 1, y + 5); ctx.lineTo(x - 1, y - 7); ctx.lineTo(x + 7, y - 4); ctx.lineTo(x - 1, y - 1); ctx.stroke(); ctx.fill();
  }
  cv.title = 'Click to go there';
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - r.left) / r.width) * world.w), ty = Math.floor(((e.clientY - r.top) / r.height) * world.h);
    ed.setTab('land');
    if (ed.map !== world) ed.loadMap(world);
    ed.view.focus(tx, ty, true);
  });
  return cv;
}

function stepCount(ed, k) {
  const n = (ed.findings || []).filter((f) => f.area === k && f.level !== 'ok').length;
  return n ? String(n) : '';
}

// One line on where each step stands
function stepStatus(ed, k) {
  const g = ed.game;
  const places = placesOf(g);
  const world = worldMap(g);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  switch (k) {
    case 'campaign': {
      const v = g.settings.victory?.type && g.settings.victory.type !== 'none';
      return `${g.meta.intro?.trim() ? 'Opening story written' : 'No opening story yet'} · ${v ? 'a way to win' : 'no way to win yet'}`;
    }
    case 'land': {
      let land = 0;
      for (let i = 0; i < world.tiles.length; i++) if (!terrain(world.tiles[i]).water) land++;
      return `${world.w} × ${world.h} · ${Math.round((land / world.tiles.length) * 100)}% land · ${plural(places.filter((p) => p.world === world).length, 'place')}`;
    }
    case 'places': {
      const towns = places.filter((p) => TOWNLIKE.has(p.kind)).length;
      const deeps = places.length - towns;
      return `${plural(towns, 'town')} and castles · ${plural(deeps, 'dungeon')} and other places`;
    }
    case 'story': return `${plural(chapterList(g).length, 'chapter')} · ${plural((g.quests || []).length, 'quest')}`;
    case 'map': {
      let people = 0, monsters = 0, chests = 0, events = 0;
      for (const m of g.maps) for (const e of m.entities) {
        if (e.type === 'npc') people++; else if (e.type === 'monster') monsters++; else if (e.type === 'chest') chests++; else if (e.type === 'event') events++;
      }
      return `${plural(people, 'person')} · ${plural(monsters, 'monster band')} · ${plural(chests, 'chest')} · ${plural(events, 'point')} of interest`.replace('persons', 'people');
    }
    case 'test': {
      const last = g.meta.playtest?.last;
      const n = (ed.findings || []).filter((f) => f.level !== 'ok').length;
      return `${last ? 'Last playtested ' + ago(last) : 'Not playtested yet'} · ${n ? plural(n, 'thing') + ' on the checklist' : 'the checklist is clear'}`;
    }
    default: return '';
  }
}

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// ------------------------------------------------------------ the Quick Start
// names for a new world, and titles for the tale told in it
const NAME_A = ['Eld', 'Ash', 'Mor', 'Val', 'Thal', 'Bryn', 'Cal', 'Dun', 'Ess', 'Fen', 'Gal', 'Har', 'Iver', 'Kel', 'Lor', 'Mar', 'Nor', 'Ost', 'Ryn', 'Sil', 'Tor', 'Wyn', 'Aer', 'Bel'];
const NAME_B = ['mark', 'land', 'mere', 'reach', 'vale', 'dor', 'heim', 'moor', 'wold', 'haven', 'fell', 'march', 'garth', 'ria'];
function worldName(seed) {
  const a = NAME_A[seed % NAME_A.length], b = NAME_B[Math.floor(seed / NAME_A.length) % NAME_B.length];
  return a + b;
}
const TITLES = {
  darklord: (w) => `Shadow over ${w}`, relic: (w) => `The Stolen Relic of ${w}`, curse: (w) => `The Curse of ${w}`,
  heir: (w) => `The Lost Heir of ${w}`, blank: (w) => `Tales of ${w}`,
};

const SIZES = [['48', 'Small (48 × 48) — an evening\'s adventure'], ['64', 'Medium (64 × 64)'], ['80', 'Large (80 × 80)'], ['112', 'Vast (112 × 112) — a long campaign']];
const EXTRAS = ['elfhall', 'dwarfgate', 'harbour', 'tower', 'fortress', 'seacave'];

export function quickStart(ed) {
  const game = ed.game;
  const fresh = isFresh(game);
  const world = worldMap(game);
  const o = {
    mode: fresh ? 'fresh' : 'add', title: game.meta.title === 'Untitled Realm' ? '' : game.meta.title,
    premise: 'darklord', size: String(Math.min(112, Math.max(48, world.w >= 100 ? 112 : world.w >= 72 ? 80 : world.w >= 56 ? 64 : 48))), shape: 'continent', mountains: 50, forest: 50,
    towns: 2, villages: 2, castles: 1, dungeons: 2, roads: true, chapters: 3, extras: {},
  };
  if (!fresh) { o.towns = 1; o.villages = 0; o.castles = 0; o.dungeons = 1; o.chapters = 1; o.premise = 'blank'; }
  const tick = () => { for (const k of PREMISES[o.premise]?.needs || []) o.extras[k] = true; };
  tick();
  const body = h('div.qs-wizard');
  const draw = () => {
    clear(body);
    const afresh = o.mode === 'fresh';
    if (!fresh) {
      body.appendChild(buildForm(o, [{ key: 'mode', label: 'Build', type: 'select', rerender: true, options: [['add', 'Onto what is here (adds places and chapters)'], ['fresh', 'Afresh (replaces the world, its places, quests and chapters)']] }], draw));
    }
    body.appendChild(h('div.form-section', '1 · The realm'));
    body.appendChild(buildForm(o, [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Leave blank and the world is named, and the tale after it', show: () => afresh },
      { key: 'premise', label: 'Story', type: 'select', rerender: true, options: Object.entries(PREMISES).map(([k, p]) => [k, p.label]) },
      { type: 'info', label: () => PREMISES[o.premise]?.desc || '' },
    ], (k) => { if (k === 'premise') { tick(); draw(); } }));
    if (afresh) {
      body.appendChild(h('div.form-section', '2 · The land'));
      body.appendChild(buildForm(o, [
        { key: 'size', label: 'Size', type: 'select', options: SIZES },
        { key: 'shape', label: 'Shape', type: 'select', options: Object.entries(WORLD_SHAPES).map(([k, s]) => [k, s.label]) },
        { key: 'mountains', label: 'Mountains', type: 'number', min: 0, max: 100, step: 10, hint: '0 = none, 50 = some, 100 = a great many' },
        { key: 'forest', label: 'Forests', type: 'number', min: 0, max: 100, step: 10 },
      ], () => {}));
    }
    body.appendChild(h('div.form-section', `${afresh ? 3 : 2} · Places`));
    body.appendChild(buildForm(o, [
      { key: 'towns', label: 'Towns', type: 'number', min: 0, max: 6 },
      { key: 'villages', label: 'Villages', type: 'number', min: 0, max: 6 },
      { key: 'castles', label: 'Castles', type: 'number', min: 0, max: 3 },
      { key: 'dungeons', label: 'Dungeons', type: 'number', min: 0, max: 6 },
    ], () => {}));
    const extras = h('div.qs-extras', ...EXTRAS.map((k) => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!o.extras[k];
      cb.addEventListener('change', () => { o.extras[k] = cb.checked; });
      return h('label.field.check', cb, h('span.field-label', FEATURE_KINDS[k].label));
    }));
    body.appendChild(h('label.field', h('span.field-label', 'Also'), extras));
    body.appendChild(buildForm(o, [{ key: 'roads', label: 'Join them with roads', type: 'check' }], () => {}));
    if (o.premise !== 'blank') {
      body.appendChild(h('div.form-section', `${afresh ? 4 : 3} · Chapters`));
      body.appendChild(buildForm(o, [{ key: 'chapters', label: 'How many', type: 'number', min: 1, max: 5, hint: 'Each chapter is a stretch of the story with its own goal; the next opens when it is done.' }], () => {}));
    }
    body.appendChild(h('p.hint', afresh ? 'Everything it makes is ordinary realm-stuff: change, move or delete any of it afterwards.' : 'New places go where there is room; new chapters follow the ones you have.'));
  };
  draw();
  modal(body, {
    title: '✦ Quick Start', sub: 'A core campaign in one go', cls: 'wide qs-modal',
    buttons: [{ label: 'Cancel' }, { label: 'Build it', primary: true, onClick: () => buildCampaign(ed, o) }],
  });
}

function buildCampaign(ed, o) {
  const game = ed.game;
  const seed = Math.floor(Math.random() * 1e9);
  let world = worldMap(game);
  const notes = [];
  ed.checkpoint('the Quick Start');
  if (o.mode === 'fresh') {
    const n = parseInt(o.size, 10) || 64;
    const fresh = generateWorld(n, n, seed, { shape: o.shape, mountains: (+o.mountains || 0) / 100, forest: (+o.forest || 0) / 100 });
    // the world keeps its id (and anything that points at it); everything else goes
    world.tiles = fresh.tiles; world.w = fresh.w; world.h = fresh.h; world.entities = fresh.entities;
    world.entry = fresh.entry; world.fill = fresh.fill; world.lighting = fresh.lighting;
    game.maps = [world];
    game.quests = [];
    game.story = { chapters: [] };
    forgetLostMaps(game);
    buryTreasures(game, world, seed);
    // a name for the world, and (unless one was given) a title to match
    if (!world.name || world.name === 'The World') world.name = worldName(seed);
    game.meta.title = o.title?.trim() || (TITLES[o.premise] || TITLES.blank)(world.name);
  }
  // the places: a town first (where the adventure begins), then the rest
  const wants = [];
  const add = (kind, n) => { for (let i = 0; i < n; i++) wants.push({ kind }); };
  add('town', +o.towns || 0);
  add('castle', +o.castles || 0);
  add('village', +o.villages || 0);
  for (const k of EXTRAS) if (o.extras[k]) wants.push({ kind: k });
  add('cave', +o.dungeons || 0);
  const names = new Set(game.maps.map((m) => m.name));
  for (const w of wants) {
    let name = defaultSiteName(w.kind);
    for (let i = 0; i < 20 && names.has(name); i++) name = defaultSiteName(w.kind);
    names.add(name);
    w.name = name;
  }
  const start = o.mode === 'fresh' ? null : game.settings.start;
  const placed = autoPlaceSites(game, world, wants, { seed, start });
  if (placed.length < wants.length) notes.push(`There was room for only ${placed.length} of the ${wants.length} places.`);
  // the company starts beside the first town
  const home = placed.find((p) => p.map && (p.map.type === 'town' || p.map.type === 'castle'));
  if (o.mode === 'fresh' && home?.portal) {
    const at = besideSite(world, home.portal.x, home.portal.y);
    game.settings.start = { map: world.id, x: at?.x ?? home.portal.x, y: at?.y ?? home.portal.y };
  }
  if (o.roads && placed.length) {
    try {
      const r = connectPlaces(game, world, { seed });
      if (r?.unreached?.length) notes.push(`No road could reach ${r.unreached.join(', ')}.`);
    } catch (e) { console.error(e); }
  }
  // farmland round the new towns, villages and castles (after the roads, so
  // it never lies across them), a windmill or an orchard beside some
  if (placed.length) {
    try { sowFields(world, { seed, sites: placed.map((p) => p.portal).filter(Boolean), keep: [game.settings.start], landmarks: true }); } catch (e) { console.error(e); }
  }
  if (o.premise !== 'blank') {
    try {
      const res = generateStory(game, { premise: o.premise, chapters: Math.max(1, Math.min(5, +o.chapters || 1)), seed });
      notes.push(...(res.notes || []));
    } catch (e) { console.error(e); notes.push('The story could not be sketched: ' + e.message); }
  }
  ed.markDirty();
  ed.loadMap(world);
  ed.refreshBadges();
  ed.setTab('campaign');
  const n = placed.length;
  toast(`Laid down ${n} place${n === 1 ? '' : 's'}${o.premise !== 'blank' ? ` and ${chapterList(game).length} chapter${chapterList(game).length === 1 ? '' : 's'}` : ''}. ${notes.join(' ')}`.trim());
}


