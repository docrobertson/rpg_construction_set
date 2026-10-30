// The Construction Set: map editing, world data, settings, files and playtesting.
import { h, clear, modal, toast, confirmDialog, promptDialog, anyModal, closeTopModal, closeAllModals } from '../dom.js';
import { T, TERRAIN_LIST, terrain, paletteFor, FEATURE_KINDS } from '../../data/terrain.js';
import { getTile, inBounds, createMap, snapshotMap, restoreSnapshot, resizeMap, MAP_TYPES } from '../../world/map.js';
import { STAMPS, PATHS, ROOMS, generateWorld, generateSettlement, generateDungeon, nameNpcs, SETTLEMENT_STYLES, DUNGEON_STYLES } from '../../world/generate.js';
import { serializeGame, cloneGame, getMap } from '../../data/schema.js';
import { saveProject, listProjects, getPref, setPref } from '../../core/storage.js';
import { debounce, downloadText, slugify, uid } from '../../core/util.js';
import { PAINT_TOOLS, stampTool, pathTool, roomTool, featureTool, ENTITY_TOOLS } from './tools.js';
import { inspectEntity, inspectMap } from './inspector.js';
import { DatabaseEditor } from './database.js';
import { renderSettings } from './settings.js';
import { QuestEditor, EVENT_TOOL, eventTemplatePicker } from './quests.js';
import { eventLook } from '../../game/events.js';
import { byId } from '../../data/schema.js';
import { sfx } from '../../core/sound.js';
import { attachGestures } from '../../render/gestures.js';

const WORLD_STAMPS = ['island', 'lake', 'forest', 'pines', 'hills', 'mountains', 'swamp', 'desert', 'snow', 'blight', 'meadow', 'clear'];
const TOWN_STAMPS = ['forest', 'meadow', 'clear', 'lake'];
const WORLD_PATHS = ['road', 'river', 'ridge'];
const TOWN_PATHS = ['road', 'wall', 'palisade', 'hedge', 'river'];
const DUNGEON_PATHS = ['tunnel', 'wall', 'river'];
const TOWN_ROOMS = ['house', 'shop', 'inn', 'tavern', 'temple', 'hall'];
const DUNGEON_ROOMS = ['chamber', 'cavern', 'hall', 'temple'];
const SHOP_KINDS = [['weapons', 'Weapons'], ['armor', 'Armour'], ['provisions', 'Provisions'], ['reagents', 'Reagents']];

export class Editor {
  constructor(app, game) {
    this.app = app;
    this.view = app.view;
    this.game = game;
    this.map = game.maps.find((m) => m.id === game.settings.start?.map) || game.maps[0];
    this.tab = 'map';
    this.tile = T.grass;
    this.brush = 1;
    this.stampSize = 5;
    this.pathWidth = 1;
    this.doorSide = 's';
    this.shopKind = 'weapons';
    this.showAllTiles = false;
    this.undoStack = [];
    this.redoStack = [];
    this.selected = null;
    // a remix, a new realm or an imported file is not in this browser yet:
    // say so until the first save (on the first edit, Save, or leaving)
    this.neverSaved = !listProjects().some((p) => p.id === game.id);
    this.dirty = this.neverSaved;
    this.mouse = { down: false, panning: false };
    this.keys = new Set();
    this.tools = { ...PAINT_TOOLS, ...ENTITY_TOOLS };
    for (const k of Object.keys(STAMPS)) this.tools['stamp_' + k] = stampTool(k);
    for (const k of Object.keys(PATHS)) this.tools['path_' + k] = pathTool(k);
    for (const k of Object.keys(ROOMS)) this.tools['room_' + k] = roomTool(k);
    for (const k of Object.keys(FEATURE_KINDS)) this.tools['site_' + k] = featureTool(k);
    this.tools.event = EVENT_TOOL;
    this.toolId = 'select';
    this.autosave = debounce(() => this.save(true), 2000);
    this.build();
    this.bindInput();
    this.loadMap(this.map);
    this.setTool('select');
    this.updateSaveState();
    if (!getPref('seenEditorHelp', false)) { setPref('seenEditorHelp', true); setTimeout(() => this.help(), 400); }
  }

  help() {
    modal(h('div.help', { html: EDITOR_HELP }), { title: 'Building your realm', cls: 'wide' });
  }

  // ------------------------------------------------------------ layout
  build() {
    this.app.setLayout('editor');
    const root = h('div.editor');
    this.root = root;
    this.titleInput = h('input.ed-title', { type: 'text', value: this.game.meta.title, title: 'Game title' });
    this.titleInput.addEventListener('input', () => { this.game.meta.title = this.titleInput.value; this.markDirty(); });
    this.tabBtns = {};
    const tabs = h('div.ed-tabs', ...[['map', '🗺 Map'], ['data', '📚 World Data'], ['quests', '📜 Quests'], ['settings', '⚙ Settings']].map(([k, label]) => {
      const b = h('button', { onclick: () => this.setTab(k) }, label);
      this.tabBtns[k] = b;
      return b;
    }));
    this.saveState = h('span.save-state');
    this.undoBtn = h('button.icon', { title: 'Undo (Ctrl+Z)', onclick: () => this.undo() }, '↶');
    this.redoBtn = h('button.icon', { title: 'Redo (Ctrl+Y)', onclick: () => this.redo() }, '↷');
    const top = h('div.ed-top',
      h('button.ed-logo', { title: 'Back to the title screen', onclick: () => this.close() }, '⚒'),
      this.titleInput,
      tabs,
      h('div.grow'),
      this.undoBtn, this.redoBtn,
      this.saveState,
      h('button', { onclick: () => this.save(false), title: 'Save to this browser (Ctrl+S)' }, 'Save'),
      h('button', { onclick: () => this.fileMenu() }, 'File ▾'),
      h('button.icon', { onclick: () => this.help(), title: 'How to build a game' }, '?'),
      h('button.primary', { onclick: () => this.playtestMenu(), title: 'Try your game' }, '▶ Playtest'),
    );
    this.left = h('div.ed-left.panel');
    this.right = h('div.ed-right.panel');
    this.main = h('div.ed-main.panel');
    this.status = h('div.ed-status');
    root.append(top, this.left, this.main, this.right, this.status);
    this.app.ui.appendChild(root);
    this.db = new DatabaseEditor(this, this.left, this.main);
    this.questEd = new QuestEditor(this, this.left, this.main);
    this.setTab('map');
  }

  destroy() {
    this.unbindInput();
    this.root.remove();
    this.view.onTick = null;
    this.view.showCursor(null);
    this.view.showBrush(null);
    this.view.setHighlights(null);
  }

  hide() {
    this.hidden = true;
    this.root.style.display = 'none';
    this.unbindInput();
    this.view.onTick = null;
  }

  show() {
    this.hidden = false;
    this.app.setLayout(this.tab === 'map' ? 'editor' : 'editor-data');
    this.root.style.display = '';
    this.bindInput();
    this.view.setPitch(this.game.settings.pitch || 52);
    if (this.tab === 'map') this.loadMap(this.map, true); else this.setTab(this.tab);
  }

  refreshTitle() { this.titleInput.value = this.game.meta.title; }

  setTab(tab) {
    this.tab = tab;
    for (const [k, b] of Object.entries(this.tabBtns)) b.classList.toggle('on', k === tab);
    this.root.classList.toggle('tab-map', tab === 'map');
    this.root.classList.toggle('tab-data', tab !== 'map');
    this.root.classList.toggle('tab-quests', tab === 'quests');
    this.app.setLayout(tab === 'map' ? 'editor' : 'editor-data');
    if (tab === 'map') {
      this.main.style.display = 'none';
      this.right.style.display = '';
      if (this.previewing) { this.previewing = false; this.loadMap(this.map, true); }
      this.renderMapPanel();
      this.inspect();
    } else {
      this.main.style.display = '';
      this.right.style.display = 'none';
      this.view.showCursor(null);
      this.view.showBrush(null);
      if (tab === 'data') this.db.render();
      else if (tab === 'quests') { this.questEd.render(); this.showPreview(null); }
      else { renderSettings(this, this.left, this.main); this.showPreview(null); }
    }
  }

  // ------------------------------------------------------------ map panel
  renderMapPanel() {
    const L = this.left;
    clear(L);
    const map = this.map;
    // map chooser
    const sel = h('select.map-select');
    const groups = {};
    for (const m of this.game.maps) (groups[m.type] = groups[m.type] || []).push(m);
    for (const [type, maps] of Object.entries(groups)) {
      const og = h('optgroup', { label: MAP_TYPES[type]?.label || type });
      for (const m of maps) og.appendChild(h('option', { value: m.id }, m.name));
      sel.appendChild(og);
    }
    sel.value = map.id;
    sel.addEventListener('change', () => this.loadMapById(sel.value));
    this.mapSelect = sel;
    L.appendChild(h('div.panel-title', 'Map'));
    L.appendChild(h('div.row', sel, h('button.small', { title: 'New map', onclick: () => this.newMapDialog() }, '＋'),
      h('button.small', { title: 'Map properties', onclick: () => { this.select(null); } }, '⚙')));
    if (map.exit) {
      const back = getMap(this.game, map.exit.map);
      if (back) L.appendChild(h('button.small.link', { onclick: () => this.loadMap(back) }, `↩ Back to ${back.name}`));
    }

    const isWorld = map.type === 'world';
    const isDungeon = map.type === 'dungeon';
    const toolBtn = (id) => {
      const t = this.tools[id];
      const b = h('button.tool' + (this.toolId === id ? '.on' : ''), { title: t.hint || t.label, onclick: () => this.setTool(id) }, h('span.ic', t.icon || '•'), h('span.lb', t.label));
      b.dataset.tool = id;
      return b;
    };
    const section = (title, help, ...children) => h('details.tool-section', { open: true }, h('summary', title, help ? h('span.help', { title: help }, '?') : null), ...children);

    // chunky shaping
    const stamps = isWorld ? WORLD_STAMPS : isDungeon ? [] : TOWN_STAMPS;
    if (stamps.length) {
      L.appendChild(section('Shape the land', 'Click to drop a whole chunk of landscape — an island, a forest, a range of mountains. Drag to keep stamping.',
        h('div.tool-grid', ...stamps.map((k) => toolBtn('stamp_' + k))),
        slider('Stamp size', 1, 20, this.stampSize, (v) => { this.stampSize = v; })));
    }
    const rooms = isWorld ? [] : isDungeon ? DUNGEON_ROOMS : TOWN_ROOMS;
    if (rooms.length) {
      const door = h('select', {}, ...[['s', 'Door: south'], ['n', 'Door: north'], ['e', 'Door: east'], ['w', 'Door: west']].map(([v, l]) => h('option', { value: v }, l)));
      door.value = this.doorSide;
      door.addEventListener('change', () => { this.doorSide = door.value; });
      const shop = h('select', {}, ...SHOP_KINDS.map(([v, l]) => h('option', { value: v }, l)));
      shop.value = this.shopKind;
      shop.addEventListener('change', () => { this.shopKind = shop.value; });
      L.appendChild(section(isDungeon ? 'Carve rooms' : 'Buildings', 'Click to place a furnished building with its keeper.',
        h('div.tool-grid', ...rooms.map((k) => toolBtn('room_' + k))),
        h('div.row', door, isDungeon ? null : shop)));
    }
    const paths = isWorld ? WORLD_PATHS : isDungeon ? DUNGEON_PATHS : TOWN_PATHS;
    L.appendChild(section('Draw paths', 'Drag across the map to lay roads, rivers, walls and ridges.',
      h('div.tool-grid', ...paths.map((k) => toolBtn('path_' + k))),
      slider('Width', 1, 4, this.pathWidth, (v) => { this.pathWidth = v; })));
    if (isWorld) {
      L.appendChild(section('Found a site', 'Click the map to create a town, castle or dungeon — complete with its own map, streets and townsfolk.',
        h('div.tool-grid', ...Object.keys(FEATURE_KINDS).map((k) => toolBtn('site_' + k)))));
    }
    // paint
    const pal = h('div.palette');
    const list = this.showAllTiles ? TERRAIN_LIST : paletteFor(map.type);
    for (const t of list) {
      const sw = h('button.swatch' + (t.id === this.tile ? '.on' : ''), { title: t.name, onclick: () => { this.setPaintTile(t.id); if (!PAINT_TOOLS[this.toolId] || this.toolId === 'picker') this.setTool('brush'); } },
        h('i', { style: { background: '#' + t.top.toString(16).padStart(6, '0') } }), h('span', t.name));
      pal.appendChild(sw);
    }
    const allCb = h('input', { type: 'checkbox' });
    allCb.checked = this.showAllTiles;
    allCb.addEventListener('change', () => { this.showAllTiles = allCb.checked; this.renderMapPanel(); });
    L.appendChild(section('Paint tiles', 'Fine-tune tile by tile.',
      h('div.tool-grid.small', ...Object.keys(PAINT_TOOLS).map(toolBtn)),
      slider('Brush size', 1, 9, this.brush, (v) => { this.brush = v; }),
      pal,
      h('label.field.check', allCb, h('span.field-label', 'Show every tile type'))));
    // entities
    const ents = ['select', 'npc', 'monster', 'chest', 'sign', 'ship', 'waygate', 'portal', 'start'];
    if (!isWorld) ents.push('entry');
    ents.push('erase');
    L.appendChild(section('Characters & objects', 'Place people, monsters and treasure. Select them to edit.',
      h('div.tool-grid', ...ents.map(toolBtn))));
    L.appendChild(section('Points of interest', 'Shrines, campfires, lore stones and little events with choices. Pick one, then click the map.',
      h('div.tool-grid', toolBtn('event')), eventTemplatePicker(this)));
    L.appendChild(section('Generate', 'Replace this whole map with a freshly generated one.',
      h('button', { onclick: () => this.regenerateDialog() }, '🎲 Regenerate this map…'),
      isDungeon ? h('button', { onclick: () => this.addDeeperLevel(), title: 'Generate a new level below this one, linked by stairs' }, '⬇ Add a deeper level') : null));
    if (!L.querySelector(`.tool[data-tool="${this.toolId}"]`)) this.setTool('select');
  }

  refreshMapList() { if (this.tab === 'map') this.renderMapPanel(); }

  setTool(id) {
    if (!this.tools[id]) return;
    if (PAINT_TOOLS[id] && id !== 'picker') this.prevPaintTool = id;
    this.toolId = id;
    for (const b of this.left.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
    this.view.setLine(null);
    this.view.setHighlights(null);
    this.showToolHint();
  }

  get tool() { return this.tools[this.toolId]; }

  setPaintTile(id) {
    this.tile = id;
    for (const b of this.left.querySelectorAll('.swatch')) b.classList.toggle('on', b.title === terrain(id).name);
  }

  showToolHint() {
    if (!this.toolHintEl) return;
    const t = this.tool;
    this.toolHintEl.innerHTML = '';
    this.toolHintEl.append(h('b', `${t.icon || ''} ${t.label}`), h('p', t.hint || ''));
  }

  // ------------------------------------------------------------ maps
  loadMapById(id) {
    const m = getMap(this.game, id);
    if (m) this.loadMap(m);
  }

  loadMap(map, keepCamera = false) {
    const prev = this.map;
    this.map = map;
    this.selected = null;
    this.view.setMap(map);
    this.view.setVisibilityEnabled(false);
    this.view.setPitch(this.game.settings.pitch || 52);
    if (!keepCamera || prev !== map) {
      const s = this.game.settings.start;
      const fx = s.map === map.id ? s.x : map.entry?.x ?? map.w / 2;
      const fy = s.map === map.id ? s.y : map.entry?.y ?? map.h / 2;
      this.view.focus(fx, fy, true);
      this.view.setZoom(map.type === 'world' ? 30 : 20, true);
    }
    this.refreshEntities();
    if (this.tab === 'map') { this.renderMapPanel(); this.inspect(); }
  }

  reloadMap() { this.loadMap(this.map, true); }

  showPreview(look) {
    // a little stage for previewing models from the World Data tab
    if (!this.stage) {
      this.stage = createMap({ type: 'town', w: 9, h: 7, name: 'Preview', fill: 'meadow' });
      this.stage.tiles.fill(T.meadow);
      for (let x = 2; x < 7; x++) this.stage.tiles[3 * 9 + x] = T.road;
    }
    if (!this.previewing) {
      this.previewing = true;
      this.view.setMap(this.stage);
      this.view.setVisibilityEnabled(false);
    }
    // frame the model in the space to the right of the form
    const mainRight = this.main.getBoundingClientRect().right || 912;
    const vpLeft = this.view.container.getBoundingClientRect().left;
    this.view.frameArea(3, 1.5, 6, 4.2, { left: Math.max(0, mainRight - vpLeft) });
    this.view.clearEntities();
    if (look) this.view.addEntity('preview', look, 4, 3, { ring: 0xffd040 });
  }

  newMapDialog() {
    const name = h('input', { type: 'text', value: 'New Map' });
    const type = h('select', {}, ...Object.entries(MAP_TYPES).map(([k, v]) => h('option', { value: k }, v.label)));
    type.value = 'town';
    const gen = h('select');
    const fillGen = () => {
      clear(gen);
      const opts = type.value === 'world' ? [['blank', 'Empty sea'], ['world', 'Generated continent']]
        : type.value === 'dungeon' ? [['blank', 'Solid rock'], ...Object.keys(DUNGEON_STYLES).map((k) => [k, `Generated ${k}`])]
          : [['blank', 'Empty grass'], ...Object.keys(SETTLEMENT_STYLES).map((k) => [k, `Generated ${k}`])];
      for (const [v, l] of opts) gen.appendChild(h('option', { value: v }, l));
      gen.value = opts[1][0];
    };
    type.addEventListener('change', fillGen);
    fillGen();
    modal(h('div.form', h('label.field', h('span.field-label', 'Name'), name), h('label.field', h('span.field-label', 'Kind'), type), h('label.field', h('span.field-label', 'Start from'), gen),
      h('p.hint', 'Link maps together with Passage or Waygate objects — or found sites on the world map, which links them automatically.')), {
      title: 'New map',
      buttons: [{ label: 'Cancel' }, {
        label: 'Create', primary: true, onClick: () => {
          const m = this.makeMap(type.value, gen.value, name.value || 'New Map');
          this.game.maps.push(m);
          this.markDirty();
          this.loadMap(m);
        },
      }],
    });
  }

  makeMap(type, gen, name, seed = Math.floor(Math.random() * 1e9)) {
    let m;
    if (gen === 'world') m = generateWorld(80, 80, seed);
    else if (DUNGEON_STYLES[gen]) m = generateDungeon({ style: gen, seed, name, monsters: this.game.monsters.filter((x) => (x.habitat || []).includes('dungeon') && x.level <= 3).map((x) => x.id) }).map;
    else if (SETTLEMENT_STYLES[gen]) { m = generateSettlement(gen, { seed, name }).map; nameNpcs(m, this.game, seed); }
    else m = createMap({ type, name });
    m.name = name;
    m.type = type === 'castle' || gen === 'castle' ? 'castle' : type;
    return m;
  }

  regenerateDialog() {
    const map = this.map;
    const type = map.type;
    const gen = h('select');
    const opts = type === 'world' ? [['world', 'Generated continent'], ['blank', 'Empty sea']]
      : type === 'dungeon' ? [...Object.keys(DUNGEON_STYLES).map((k) => [k, `Generated ${k}`]), ['blank', 'Solid rock']]
        : [...Object.keys(SETTLEMENT_STYLES).map((k) => [k, `Generated ${k}`]), ['blank', 'Empty grass']];
    for (const [v, l] of opts) gen.appendChild(h('option', { value: v }, l));
    const water = slider('Sea level', 20, 75, 45, () => {});
    const mtn = slider('Mountains', 0, 100, 50, () => {});
    const forest = slider('Forests', 0, 100, 50, () => {});
    const worldOpts = h('div', water, mtn, forest);
    const sync = () => { worldOpts.style.display = gen.value === 'world' ? '' : 'none'; };
    gen.addEventListener('change', sync);
    sync();
    modal(h('div.form', h('label.field', h('span.field-label', 'Generate'), gen), worldOpts,
      h('p.hint', 'This replaces the whole map. Characters and objects on it are removed (you can Undo).')), {
      title: `Regenerate ${map.name}`,
      buttons: [{ label: 'Cancel' }, {
        label: 'Generate', primary: true, onClick: () => {
          this.beginEdit();
          const seed = Math.floor(Math.random() * 1e9);
          let m;
          if (gen.value === 'world') m = generateWorld(map.w, map.h, seed, { water: water.value / 100, mountains: mtn.value / 100, forest: forest.value / 100 });
          else m = this.makeMap(type, gen.value, map.name, seed);
          // keep identity and links
          // sites keep their place (and their tile) on a regenerated world
          const keepPortals = type === 'world' ? map.entities.filter((e) => e.type === 'portal' && e.style === 'site').map((p) => ({ p, t: getTile(map, p.x, p.y) })) : [];
          map.tiles = m.tiles;
          map.w = m.w; map.h = m.h;
          map.entities = [...m.entities, ...keepPortals.map((k) => k.p)];
          for (const { p, t } of keepPortals) if (inBounds(map, p.x, p.y)) map.tiles[p.y * map.w + p.x] = t;
          map.entry = m.entry;
          map.lighting = m.lighting;
          map.fill = m.fill;
          this.markDirty();
          this.loadMap(map, true);
        },
      }],
    });
  }

  // Dig a new dungeon level beneath this one, joined by a staircase
  addDeeperLevel() {
    const map = this.map;
    const entry = map.entry || { x: 1, y: 1 };
    // farthest reachable floor tile from the entry
    const dist = new Map();
    const key = (x, y) => y * map.w + x;
    const q = [[entry.x, entry.y]];
    dist.set(key(entry.x, entry.y), 0);
    let far = null, fd = -1;
    while (q.length) {
      const [x, y] = q.shift();
      const d = dist.get(key(x, y));
      const t = terrain(getTile(map, x, y));
      if (d > fd && t.walk && !t.door && !map.entities.some((en) => en.x === x && en.y === y) && !['stairs_up', 'stairs_down'].includes(t.key)) { fd = d; far = [x, y]; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(map, nx, ny) || dist.has(key(nx, ny))) continue;
        if (!terrain(getTile(map, nx, ny)).walk) continue;
        dist.set(key(nx, ny), d + 1);
        q.push([nx, ny]);
      }
    }
    if (!far) { toast('No room for a staircase on this level.', 'warn'); return; }
    this.beginEdit();
    const style = map.fill === 'dungeon_wall' ? 'crypt' : 'cave';
    const level = (map.level || 1) + 1;
    const monsters = this.game.monsters.filter((m) => !m.boss && (m.habitat || []).includes('dungeon') && (m.level || 1) <= level + 2).map((m) => m.id);
    const { map: deeper } = generateDungeon({ style, seed: Math.floor(Math.random() * 1e9), name: `${map.name.replace(/ \(level \d+\)$/, '')} (level ${level})`, level, monsters });
    deeper.exit = { map: map.id, x: far[0], y: far[1] };
    this.game.maps.push(deeper);
    map.tiles[far[1] * map.w + far[0]] = T.stairs_down;
    map.entities.push({ id: uid('portal'), type: 'portal', x: far[0], y: far[1], style: 'stairs', label: 'Stairs down', target: { map: deeper.id } });
    this.markDirty();
    this.loadMap(map, true);
    this.view.focus(far[0], far[1]);
    toast(`Dug ${deeper.name}. The stairs down are marked on this level.`);
  }

  deleteMap(map) {
    const i = this.game.maps.indexOf(map);
    if (i <= 0) return;
    this.game.maps.splice(i, 1);
    for (const m of this.game.maps) m.entities = m.entities.filter((e) => !(e.type === 'portal' && e.target?.map === map.id));
    if (this.game.settings.start.map === map.id) {
      const w = this.game.maps[0];
      this.game.settings.start = { map: w.id, x: Math.floor(w.w / 2), y: Math.floor(w.h / 2) };
    }
    this.markDirty();
    this.loadMap(this.game.maps[0]);
  }

  resizeMap(w, hh) {
    resizeMap(this.map, w, hh);
    const s = this.game.settings.start;
    if (s.map === this.map.id) { s.x = Math.min(w - 1, s.x); s.y = Math.min(hh - 1, s.y); }
    this.markDirty();
    this.loadMap(this.map, true);
  }

  // Choose a portal's arrival point by clicking on its destination map
  pickTarget(ent) {
    const dest = getMap(this.game, ent.target?.map);
    if (!dest) { toast('Choose a destination map first.', 'warn'); return; }
    const from = this.map;
    const prevTool = this.toolId;
    this.loadMap(dest);
    this.tools.__pick = {
      label: 'Pick arrival point', icon: '🎯', hint: `Click where the party should arrive in ${dest.name}. Esc cancels.`, cursor: 'tile',
      down: (ed, t) => {
        if (!inBounds(dest, t.x, t.y)) return;
        ent.target.x = t.x;
        ent.target.y = t.y;
        ed.markDirty();
        toast(`Arrival set to ${t.x}, ${t.y} in ${dest.name}.`);
        ed.loadMap(from);
        ed.setTool(prevTool in ed.tools && prevTool !== '__pick' ? prevTool : 'select');
        ed.select(ent);
      },
    };
    this.setTool('__pick');
    toast(`Click the arrival point in ${dest.name}.`);
  }

  openLinkedMap(ent) {
    if (ent.type !== 'portal') return;
    const id = ent.target?.map === 'exit' ? this.map.exit?.map : ent.target?.map;
    const m = getMap(this.game, id);
    if (m) this.loadMap(m);
  }

  // ------------------------------------------------------------ entities
  entityLook(e) {
    switch (e.type) {
      case 'npc': return e.look || { kind: 'humanoid' };
      case 'monster': return byId(this.game.monsters, e.monster)?.look || { kind: 'blob' };
      case 'chest': return { kind: 'chest' };
      case 'sign': return { kind: 'sign' };
      case 'ship': return { kind: 'ship' };
      case 'portal': return e.style === 'waygate' ? { kind: 'waygate' } : { kind: 'marker', color: 0x60a0ff };
      case 'event': return eventLook(e);
      default: return { kind: 'marker' };
    }
  }

  refreshEntities() {
    this.view.clearEntities();
    for (const e of this.map.entities) this.addVisual(e);
    const s = this.game.settings.start;
    if (s.map === this.map.id) this.view.addEntity('__start', { kind: 'marker', color: 0xffd040 }, s.x, s.y);
    if (this.map.type !== 'world' && this.map.entry) this.view.addEntity('__entry', { kind: 'marker', color: 0x40e080 }, this.map.entry.x, this.map.entry.y);
    if (this.selected) this.view.setRing(this.selected.id, 0xffe040);
  }

  addVisual(e) {
    const look = this.entityLook(e);
    const def = e.type === 'monster' ? byId(this.game.monsters, e.monster) : null;
    this.view.addEntity(e.id, look, e.x, e.y, { ring: e.type === 'monster' ? 0xd03030 : 0xffe040, scale: e.boss ? 1.2 : 1, idle: true });
    if (e.type !== 'monster') this.view.setRing(e.id, null);
    void def;
  }

  refreshEntity(e) {
    this.view.removeEntity(e.id);
    this.addVisual(e);
    if (this.selected === e) this.view.setRing(e.id, 0xffe040);
  }

  entityAt(x, y) {
    const list = this.map.entities.filter((e) => e.x === x && e.y === y);
    return list.find((e) => e.type !== 'portal') || list[0] || null;
  }

  removeEntity(e) {
    this.map.entities = this.map.entities.filter((x) => x !== e);
    this.view.removeEntity(e.id);
    if (this.selected === e) this.select(null);
    this.markDirty();
  }

  select(e) {
    if (this.selected && this.selected !== e) {
      const prev = this.selected;
      this.view.setRing(prev.id, prev.type === 'monster' ? 0xd03030 : null);
    }
    this.selected = e;
    if (e) this.view.setRing(e.id, 0xffe040);
    this.inspect();
  }

  inspect() {
    if (this.tab !== 'map') return;
    clear(this.right);
    this.toolHintEl = h('div.tool-hint');
    this.right.appendChild(this.toolHintEl);
    this.showToolHint();
    const box = h('div.inspector');
    this.right.appendChild(box);
    if (this.selected && this.map.entities.includes(this.selected)) inspectEntity(this, this.selected, box);
    else inspectMap(this, box);
  }

  // ------------------------------------------------------------ editing & undo
  beginEdit() {
    this.undoStack.push({ mapId: this.map.id, snap: snapshotMap(this.map) });
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.updateUndo();
  }

  undo() {
    const u = this.undoStack.pop();
    if (!u) return;
    const map = getMap(this.game, u.mapId);
    if (!map) return this.undo();
    this.redoStack.push({ mapId: u.mapId, snap: snapshotMap(map) });
    restoreSnapshot(map, u.snap);
    if (map !== this.map) this.loadMap(map); else this.loadMap(map, true);
    this.markDirty();
    this.updateUndo();
  }

  redo() {
    const r = this.redoStack.pop();
    if (!r) return;
    const map = getMap(this.game, r.mapId);
    if (!map) return;
    this.undoStack.push({ mapId: r.mapId, snap: snapshotMap(map) });
    restoreSnapshot(map, r.snap);
    if (map !== this.map) this.loadMap(map); else this.loadMap(map, true);
    this.markDirty();
    this.updateUndo();
  }

  updateUndo() {
    this.undoBtn.disabled = !this.undoStack.length;
    this.redoBtn.disabled = !this.redoStack.length;
  }

  changed(b) {
    if (!b || b.empty || b.x1 < b.x0) return;
    this.view.refreshTiles(b.x0, b.y0, b.x1, b.y1);
    // entities standing on changed tiles may need their height updated
    for (const e of this.map.entities) {
      if (e.x >= b.x0 - 1 && e.x <= b.x1 + 1 && e.y >= b.y0 - 1 && e.y <= b.y1 + 1) this.view.placeEntity(e.id, e.x, e.y);
    }
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
    this.updateSaveState();
    this.autosave();
  }

  updateSaveState(err) {
    if (err) { this.saveState.textContent = '⚠ Not saved'; this.saveState.title = err; this.saveState.className = 'save-state bad'; return; }
    this.saveState.textContent = this.dirty ? (this.neverSaved ? '● Not saved yet' : '● Unsaved') : '✓ Saved';
    this.saveState.className = 'save-state' + (this.dirty ? ' dirty' : '');
    this.saveState.title = this.neverSaved ? 'This realm is not in this browser yet: it is saved as soon as you change something, press Save, or leave' : this.dirty ? 'Changes will be saved to this browser automatically' : 'Saved in this browser';
  }

  save(silent) {
    try {
      saveProject(this.game);
      this.dirty = false;
      this.neverSaved = false;
      this.updateSaveState();
      if (!silent) toast('Saved to this browser.');
      return true;
    } catch (e) {
      this.updateSaveState(e.message);
      if (!silent) toast(e.message, 'bad');
      return false;
    }
  }

  // ------------------------------------------------------------ files & play
  fileMenu() {
    const list = h('div.choose-list');
    const m = modal(list, { title: 'File', cls: 'small' });
    const item = (label, sub, fn) => list.appendChild(h('button.choose-item', { onclick: () => { m.close(); fn(); } }, h('span.ci-label', label), sub ? h('span.ci-sub', sub) : null));
    item('Save to browser', 'Ctrl/⌘ + S — also saves automatically', () => this.save(false));
    item('Export game file (.json)', 'Back up your game or send it to a friend', () => {
      downloadText(slugify(this.game.meta.title) + '.json', serializeGame(this.game));
    });
    item('Export playable web page (.html)', 'One file anyone can open to play — no install needed', () => this.app.exportStandalone(this.game));
    item('Import a game file…', 'Opens it in the Construction Set', () => this.app.importFile('edit'));
    item('Close', 'Back to the title screen', () => this.close());
  }

  async close() {
    if (this.dirty) this.save(true);
    this.app.showTitle();
  }

  playtestMenu() {
    const quick = h('input', { type: 'checkbox' });
    quick.checked = true;
    const here = this.map;
    const c = this.view.rig;
    modal(h('div', h('label.field.check', quick, h('span.field-label', 'Skip party creation (use a ready-made company)')),
      h('p.hint', 'Playtests never overwrite saved games. Press Esc → “Return to the Construction Set” when done.')), {
      title: 'Playtest',
      buttons: [
        { label: 'Cancel' },
        { label: `From here (${here.name})`, onClick: () => this.playtest(quick.checked, { map: here.id, x: Math.floor(c.tx), y: Math.floor(c.tz) }) },
        { label: 'From the start', primary: true, onClick: () => this.playtest(quick.checked, null) },
      ],
    });
  }

  playtest(quick, start) {
    if (this.dirty) this.save(true);
    const g = cloneGame(this.game);
    if (start) {
      const m = getMap(g, start.map);
      const p = nearestWalkable(m, start.x, start.y);
      start = { map: m.id, x: p.x, y: p.y };
    }
    this.app.playGame(g, { fromEditor: true, noSave: true, start, quick });
  }

  // ------------------------------------------------------------ input
  bindInput() {
    if (this.bound) return;
    this.bound = true;
    const cv = this.view.renderer.domElement;
    this.h = {
      down: (e) => this.onDown(e),
      move: (e) => this.onMove(e),
      up: (e) => this.onUp(e),
      wheel: (e) => { if (this.tab !== 'map' && !this.previewing) return; e.preventDefault(); this.view.zoomBy(e.deltaY > 0 ? 1.12 : 0.89); },
      ctx: (e) => e.preventDefault(),
      key: (e) => this.onKey(e),
      keyup: (e) => this.keys.delete(e.key.toLowerCase()),
      leave: () => { this.view.showCursor(null); this.view.showBrush(null); },
    };
    cv.addEventListener('pointerdown', this.h.down);
    window.addEventListener('pointermove', this.h.move);
    window.addEventListener('pointerup', this.h.up);
    cv.style.touchAction = 'none';
    this.gestures = attachGestures(this.view, cv, { pan: true });
    cv.addEventListener('wheel', this.h.wheel, { passive: false });
    cv.addEventListener('contextmenu', this.h.ctx);
    cv.addEventListener('mouseleave', this.h.leave);
    window.addEventListener('keydown', this.h.key);
    window.addEventListener('keyup', this.h.keyup);
    this.view.onTick = (dt) => this.tick(dt);
  }

  unbindInput() {
    if (!this.bound) return;
    this.bound = false;
    const cv = this.view.renderer.domElement;
    cv.removeEventListener('pointerdown', this.h.down);
    window.removeEventListener('pointermove', this.h.move);
    window.removeEventListener('pointerup', this.h.up);
    if (this.gestures) { this.gestures.destroy(); this.gestures = null; }
    cv.removeEventListener('wheel', this.h.wheel);
    cv.removeEventListener('contextmenu', this.h.ctx);
    cv.removeEventListener('mouseleave', this.h.leave);
    window.removeEventListener('keydown', this.h.key);
    window.removeEventListener('keyup', this.h.keyup);
  }

  tick(dt) {
    if (this.tab !== 'map' || anyModal()) return;
    const k = this.keys;
    const sp = this.view.rig.dist * 0.9 * dt;
    let dx = 0, dz = 0;
    if (k.has('a') || k.has('arrowleft')) dx -= sp;
    if (k.has('d') || k.has('arrowright')) dx += sp;
    if (k.has('w') || k.has('arrowup')) dz -= sp;
    if (k.has('s') || k.has('arrowdown')) dz += sp;
    if (dx || dz) this.view.panBy(dx, dz);
  }

  worldPerPixel() {
    const r = this.view.rig;
    const hgt = this.view.renderer.domElement.clientHeight || 800;
    return (2 * r.dist * Math.tan((this.view.camera.fov * Math.PI) / 360)) / hgt;
  }

  onDown(e) {
    if (this.tab !== 'map') return;
    if (this.gestures?.active) { this.cancelStroke(); return; }
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.keys.has(' '))) {
      this.mouse.panning = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const t = this.view.pick(e.clientX, e.clientY);
    if (!t) return;
    this.mouse.down = true;
    this.mouse.last = t;
    const now = performance.now();
    const dbl = this.lastDown && now - this.lastDown.t < 400 && this.lastDown.x === t.x && this.lastDown.y === t.y;
    this.lastDown = { t: now, x: t.x, y: t.y };
    const ev = { shiftKey: e.shiftKey, detail: dbl ? 2 : 1, button: e.button };
    const tool = this.tool;
    try { tool.down && tool.down(this, t, ev); } catch (err) { console.error(err); toast('Tool error: ' + err.message, 'bad'); }
  }

  onMove(e) {
    if (this.hidden) return;
    if (this.gestures?.active) return;
    if (this.mouse.panning) {
      const k = this.worldPerPixel();
      const dx = e.clientX - this.mouse.panning.x, dy = e.clientY - this.mouse.panning.y;
      this.view.panBy(-dx * k, -dy * k / Math.sin((this.view.rig.pitch * Math.PI) / 180));
      this.mouse.panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.tab !== 'map' || e.target !== this.view.renderer.domElement) return;
    const t = this.view.pick(e.clientX, e.clientY);
    if (!t) return;
    this.hover(t);
    if (this.mouse.down) {
      const last = this.mouse.last;
      if (!last || last.x !== t.x || last.y !== t.y) {
        this.mouse.last = t;
        const tool = this.tool;
        try { tool.drag && tool.drag(this, t, e); } catch (err) { console.error(err); }
      }
    }
  }

  cancelStroke() {
    if (!this.mouse.down) return;
    this.mouse.down = false;
    const tool = this.tool;
    this.view.setLine(null);
    this.view.setHighlights(null);
    if (tool.pts) tool.pts = null;
    if (tool.start) tool.start = null;
  }

  onUp(e) {
    if (this.mouse.panning) { this.mouse.panning = false; return; }
    if (!this.mouse.down) return;
    this.mouse.down = false;
    const t = this.view.pick(e.clientX, e.clientY) || this.mouse.last;
    const tool = this.tool;
    try { tool.up && tool.up(this, t, e); } catch (err) { console.error(err); }
  }

  hover(t) {
    const tool = this.tool;
    const v = this.view;
    if (tool.cursor === 'brush') {
      v.showCursor(t.x, t.y, 0xffffff, this.brush % 2 ? this.brush : this.brush);
      v.showBrush(null);
    } else if (tool.cursor === 'stamp') {
      v.showCursor(t.x, t.y, 0xffffff);
      v.showBrush(t.x + 0.5, t.y + 0.5, this.stampSize + 0.5);
    } else if (tool.cursor === 'room' && tool.size) {
      const [w, hh] = tool.size();
      v.showBrush(null);
      v.showCursor(null);
      if (!this.mouse.down) {
        const x0 = t.x - Math.floor(w / 2), y0 = t.y - Math.floor(hh / 2);
        const cells = [];
        for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) cells.push({ x, y });
        v.setHighlights(cells, 0xffe080, 0.3);
      }
    } else {
      v.showBrush(null);
      v.showCursor(t.x, t.y, 0xffffff);
    }
    // status line
    const map = this.map;
    if (inBounds(map, t.x, t.y)) {
      const td = terrain(getTile(map, t.x, t.y));
      const ents = map.entities.filter((e) => e.x === t.x && e.y === t.y).map((e) => (e.type === 'npc' ? e.name || 'person' : e.type === 'monster' ? byId(this.game.monsters, e.monster)?.name || 'monster' : e.label || e.type));
      this.status.textContent = `${map.name} · ${t.x}, ${t.y} · ${td.name}${ents.length ? ' · ' + ents.join(', ') : ''}   —   Right-drag / WASD to pan · wheel to zoom · Ctrl+Z undo`;
    } else this.status.textContent = `${map.name} · outside the map`;
  }

  onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(false); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod) return;
    if (e.key === 'Escape') {
      if (closeTopModal()) return;
      if (this.selected) this.select(null); else this.setTool('select');
      return;
    }
    if (anyModal() || this.tab !== 'map') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) { e.preventDefault(); this.beginEdit(); this.removeEntity(this.selected); return; }
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) {
      this.keys.add(k);
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      return;
    }
    const shortcuts = { b: 'brush', f: 'fill', r: 'rect', l: 'line', i: 'picker', v: 'select', x: 'erase' };
    if (shortcuts[k]) this.setTool(shortcuts[k]);
    if (k === '[') { this.brush = Math.max(1, this.brush - 1); this.stampSize = Math.max(1, this.stampSize - 1); this.renderMapPanel(); }
    if (k === ']') { this.brush = Math.min(9, this.brush + 1); this.stampSize = Math.min(20, this.stampSize + 1); this.renderMapPanel(); }
  }
}

function slider(label, min, max, value, onChange) {
  const input = h('input', { type: 'range', min, max, value });
  const out = h('b', String(value));
  input.addEventListener('input', () => { out.textContent = input.value; onChange(+input.value); });
  const wrap = h('label.slider', h('span', label), input, out);
  Object.defineProperty(wrap, 'value', { get: () => +input.value });
  return wrap;
}

function nearestWalkable(map, x, y) {
  for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const t = terrain(getTile(map, nx, ny));
    if (t.walk && !t.feature && !t.water && !map.entities.some((e) => e.x === nx && e.y === ny && e.type !== 'chest')) return { x: nx, y: ny };
  }
  return { x, y };
}

void uid; void promptDialog; void confirmDialog; void closeAllModals; void sfx; void cloneGame;

const EDITOR_HELP = `
<p>Everything you build is saved in this browser as you go. Here is the usual way to make an adventure:</p>
<h3>1 · Shape the world</h3>
<p>On the <b>Map</b> tab, use <b>Shape the land</b>: click to drop an island, a lake, a forest or a mountain range — or drag to keep stamping.
Change the <b>stamp size</b> for continents or copses. <b>Draw paths</b> lets you drag out roads (they bridge rivers on their own), rivers and mountain ridges.</p>
<h3>2 · Found towns, castles and dungeons</h3>
<p>Under <b>Found a site</b>, click the map to create a town, castle, village, dungeon, tower, dark fortress, elven hall or dwarf hold.
Each one gets its own generated map — streets, shops, an inn, a healer and townsfolk. <b>Double-click</b> a site (or select it and press <i>Open</i>) to go inside and change anything.</p>
<h3>3 · Paint the details</h3>
<p><b>Paint tiles</b> gives you a brush, scatter, line, rectangle, flood fill and picker, with every tile type — walls, doors, counters, beds, braziers, lava…</p>
<h3>4 · People, monsters and treasure</h3>
<p>Place <b>people</b> and give them a role (shopkeeper, innkeeper, healer, king…), a look, and <b>keywords</b> they answer to.
A keyword can require a flag, item or gold, and can give items or gold, set story flags, heal the party, make the speaker <b>join</b> your company, start a fight, teleport the party — or win the game.
Place <b>monster groups</b>, <b>chests</b>, <b>signs</b>, <b>ships</b>, <b>waygates</b> and <b>passages</b> (links between maps — use <i>Pick arrival point</i> to choose where they lead).</p>
<h3>5 · Rules of the realm</h3>
<p><b>World Data</b> holds the races, classes, items, spells, monsters and the magic systems themselves. <b>Settings</b> holds your story, the starting point and kit,
the victory condition, and switches for the four kinds of magic — Sorcery, Prayer, Rune-craft and Elven Song.</p>
<p><b>Quests</b> give the player goals: who offers each one, its steps (talk to someone, bring an item, reach a place, defeat a foe, find
something, clear a dungeon) and its rewards. The player always sees the current step and which way to go. Select a person to see the
quests they are part of. Under <b>Points of interest</b> on the map, place shrines, campfires, lore stones and little events with choices.</p>
<h3>6 · Playtest and share</h3>
<p>Press <b>▶ Playtest</b> at any time — from the start, or from wherever you are looking. Use <b>File → Export</b> to save a <i>.json</i> game file,
or a single <i>.html</i> page your friends can simply open and play.</p>
<h3>Keys</h3>
<table class="keys">
<tr><td>B</td><td>Brush</td><td>F</td><td>Fill</td><td>R</td><td>Rectangle</td></tr>
<tr><td>L</td><td>Line</td><td>I</td><td>Pick tile</td><td>V</td><td>Select</td></tr>
<tr><td>X</td><td>Remove</td><td>[ ]</td><td>Brush/stamp size</td><td>Del</td><td>Delete selected</td></tr>
<tr><td>WASD</td><td>Pan</td><td>Wheel</td><td>Zoom</td><td>Right-drag</td><td>Pan</td></tr>
<tr><td>Ctrl+Z</td><td>Undo</td><td>Ctrl+Y</td><td>Redo</td><td>Ctrl+S</td><td>Save</td></tr>
</table>`;
