// The Places step: every town, castle, village and dungeon of the realm, and
// a designer for each that builds it from a plan ("an inn, an armourer, two
// homes") and rebuilds it without losing the people written into it. The
// place itself shows in the view beside the form, so a rebuild is seen at once.
import { h, clear, modal, toast, confirmDialog } from '../dom.js';
import { FEATURE_KINDS, T, terrain } from '../../data/terrain.js';
import { getTile, setTile, inBounds, snapshotMap } from '../../world/map.js';
import { worldMap } from '../../data/schema.js';
import { getPref, setPref } from '../../core/storage.js';
import { debounce } from '../../core/util.js';
import { buildForm } from './forms.js';
import { defaultSiteName } from './tools.js';
import {
  placesOf, planOf, rebuildPlace, autoPlaceSites, peopleOfPlace, placeSummary, isDungeonKind,
  PLACE_ICONS, BUILDINGS, SETTLEMENT_STYLE_NAMES, DUNGEON_STYLE_NAMES, WALL_NAMES, SIZE_NAMES,
} from '../../world/places.js';

const GROUPS = [
  ['towns', 'Towns & castles', ['town', 'castle', 'harbour']],
  ['halls', 'Villages & halls', ['village', 'elfhall', 'dwarfgate']],
  ['dungeons', 'Dungeons & lairs', ['cave', 'tower', 'fortress', 'seacave', 'dungeon']],
  ['other', 'Other maps', null],
];
const KIND_LABEL = (k) => FEATURE_KINDS[k]?.label || { dungeon: 'Dungeon level', town: 'Town map', castle: 'Castle map' }[k] || k;
const GATE_NAMES = { n: 'North', e: 'East', s: 'South', w: 'West' };

export class PlacesEditor {
  constructor(ed, left, main) {
    this.ed = ed; this.left = left; this.main = main; this.sel = null;
    this.drafts = new Map();
    this.notes = null;
    this.auto = getPref('placesRebuildAsYouGo', false);
    this.autoLater = debounce(() => { const s = this.current(); if (s && this.isDirty(s)) this.rebuild(s, true); }, 650);
    this.relist = debounce(() => { if (ed.tab === 'places') this.renderList(); }, 300);
    // the shell restores the map behind the forms when a step needs it; a
    // model preview (Story, Rules) must not find this place's map loaded
    const show = ed.showPreview.bind(ed);
    ed.showPreview = (look) => {
      if (this.shown) { const cam = ed.savedCam; this.shown = null; ed.previewing = false; show(look); ed.savedCam = cam; return; }
      return show(look);
    };
    // an undo while the designer is open: show what came back. (A rebuild's
    // own snapshot of its map also holds the plan, kind and lighting, which
    // a map snapshot alone does not bring back.)
    for (const [k, from, to] of [['undo', 'undoStack', 'redoStack'], ['redo', 'redoStack', 'undoStack']]) {
      const f = ed[k].bind(ed);
      ed[k] = (...a) => {
        const top = ed[from][ed[from].length - 1];
        const map = top?.snap?.place && ed.game.maps.find((m) => m.id === top.mapId);
        const now = map ? placeState(map) : null;
        const r = f(...a);
        if (map) {
          Object.assign(map, top.snap.place);
          if (!top.snap.place.plan) delete map.plan;
          const back = ed[to][ed[to].length - 1];
          if (back?.mapId === map.id) back.snap.place = now;
        }
        if (ed.tab === 'places' && !ed.hidden) { this.drafts.clear(); this.shown = null; this.render(); } else if (map && map === ed.map && !ed.hidden) ed.reloadMap();
        return r;
      };
    }
  }

  select(map) {
    this.sel = map;
    if (this.notes?.id !== map?.id) this.notes = null;
    this.render();
  }

  current() { return placesOf(this.ed.game).find((p) => p.map === this.sel) || null; }

  render() {
    const places = placesOf(this.ed.game);
    if (!places.some((p) => p.map === this.sel)) this.sel = places[0]?.map || null;
    this.renderList(places);
    this.renderMain(places.find((p) => p.map === this.sel) || null);
  }

  // ------------------------------------------------------------ the list
  renderList(places = placesOf(this.ed.game)) {
    const L = this.left;
    const keep = L.querySelector('.pl-list')?.scrollTop || 0;
    clear(L);
    L.appendChild(h('div.pl-head', h('div.panel-title', '🏘 Places'),
      h('button.small.primary', { title: 'Found a new town, castle or dungeon', onclick: () => this.newPlace() }, '+ New place')));
    if (!places.length) {
      L.appendChild(h('p.hint', 'No places yet. Found towns, castles and dungeons here, or on the world map in the Land step — or let the Quick Start lay down a whole realm.'));
      return;
    }
    const list = h('div.pl-list');
    const deeper = (m) => places.filter((p) => !p.portal && p.map.exit?.map === m.id);
    const listed = new Set();
    const entry = (p, depth = 0) => {
      listed.add(p.map);
      const b = h('button.pl-entry' + (p.map === this.sel ? '.on' : '') + (depth ? '.deep' : ''), { onclick: () => this.select(p.map), title: `${p.map.name}: ${KIND_LABEL(p.kind)}` },
        h('span.pl-ic', depth ? '↳' : PLACE_ICONS[p.kind] || '⌂'),
        h('span.pl-txt', h('b', p.map.name), h('small', depth ? `Level ${p.map.level || depth + 1} · ${placeSummary(this.ed.game, p.map, p.kind)}` : placeSummary(this.ed.game, p.map, p.kind))));
      b.dataset.map = p.map.id;
      list.appendChild(b);
      for (const d of deeper(p.map)) if (!listed.has(d.map)) entry(d, depth + 1);
    };
    for (const [, label, kinds] of GROUPS) {
      const mine = places.filter((p) => (kinds ? p.portal && kinds.includes(p.kind) : !p.portal) && !listed.has(p.map));
      if (!kinds) for (const p of [...mine]) if (p.map.exit && places.some((q) => q.map.id === p.map.exit.map)) mine.splice(mine.indexOf(p), 1);
      if (!mine.length) continue;
      list.appendChild(h('div.entry-group', `${label} (${mine.length})`));
      for (const p of mine) if (!listed.has(p.map)) entry(p);
    }
    L.appendChild(list);
    list.scrollTop = keep;
    L.appendChild(h('p.hint.pl-foot', 'Each place is built from a plan: say what it holds, then Rebuild. The people and things you have written stay.'));
  }

  // ------------------------------------------------------------ the designer
  draft(sel) {
    if (!this.drafts.has(sel.map.id)) this.drafts.set(sel.map.id, planOf(sel.map, sel.kind));
    return this.drafts.get(sel.map.id);
  }

  isDirty(sel) {
    const d = this.drafts.get(sel.map.id);
    return !!d && JSON.stringify(d) !== JSON.stringify(planOf(sel.map, sel.kind));
  }

  changed(sel, structural = false) {
    if (structural) this.renderMain(sel);
    else this.refreshDirty(sel);
    if (this.auto) this.autoLater();
  }

  refreshDirty(sel) {
    const dirty = this.isDirty(sel);
    const banner = this.main.querySelector('.pl-dirty');
    if (banner) banner.hidden = !dirty;
    this.main.querySelector('.pl-rebuild')?.classList.toggle('pulse', dirty);
  }

  renderMain(sel) {
    const M = this.main;
    const keep = M.scrollTop;
    clear(M);
    if (!sel) {
      M.appendChild(h('div.pl-empty', h('h2', 'Places'),
        h('p', 'Towns, castles, villages and dungeons: each one is built from a plan of what it holds — an inn, an armourer and two homes; a crypt of eight rooms with a wight at the end — and can be rebuilt from it at any time.'),
        h('button.primary', { onclick: () => this.newPlace() }, '+ Found your first place')));
      this.preview(null);
      return;
    }
    const ed = this.ed, map = sel.map;
    const plan = this.draft(sel);
    const dungeon = isDungeonKind(plan.kind);
    // the head: name, kind, where it is
    const name = h('input.pl-name', { type: 'text', value: map.name, title: 'The place\'s name', 'aria-label': 'Name' });
    name.addEventListener('input', () => {
      map.name = name.value;
      if (sel.portal) sel.portal.label = name.value;
      ed.markDirty();
      this.relist();
    });
    const where = sel.portal ? `On ${sel.world.name} at ${sel.portal.x}, ${sel.portal.y}` : map.exit ? `Reached from ${ed.game.maps.find((m) => m.id === map.exit.map)?.name || 'another map'}` : 'Not reached from the world map';
    M.appendChild(h('div.pl-title', h('span.pl-bigic', PLACE_ICONS[sel.kind] || '⌂'), h('div.pl-titletext', name, h('div.pl-where', h('span.tag', KIND_LABEL(sel.kind)), ` ${where} · ${map.w} × ${map.h} squares`))));
    const rebuildBtn = h('button.primary.pl-rebuild', { title: `Lay ${map.name} out afresh from this plan. Its people and things are kept.`, onclick: () => this.rebuild(sel) }, '⟳ Rebuild');
    const autoCb = h('input', { type: 'checkbox' });
    autoCb.checked = this.auto;
    autoCb.addEventListener('change', () => { this.auto = autoCb.checked; setPref('placesRebuildAsYouGo', this.auto); if (this.auto && this.isDirty(sel)) this.rebuild(sel, true); });
    M.appendChild(h('div.pl-actions', rebuildBtn,
      h('button', { title: 'Every square of it, its people and their words', onclick: () => ed.goTo({ tab: 'map', map: map.id }) }, 'Open in Details →'),
      sel.portal ? h('button', { title: 'Where it stands on the world map', onclick: () => ed.goTo({ tab: 'land', map: sel.world.id, entity: sel.portal.id }) }, '🗺 On the map') : null,
      h('button.danger.small.pl-del', { title: `Delete ${map.name}`, 'aria-label': 'Delete this place', onclick: () => this.deletePlace(sel) }, '🗑')));
    M.appendChild(h('div.pl-subactions', h('label.pl-auto', autoCb, h('span', 'Rebuild as I change the plan')),
      h('button.small.link', { title: 'The same plan, laid out another way', onclick: () => { plan.seed = Math.floor(Math.random() * 1e9); this.rebuild(sel); } }, '🎲 Try another layout')));
    const banner = h('div.pl-dirty', 'The plan has changed — press Rebuild to see it.');
    banner.hidden = !this.isDirty(sel);
    M.appendChild(banner);
    if (this.notes?.id === map.id) M.appendChild(this.notesBox());
    if (dungeon) this.dungeonForm(M, sel, plan); else this.townForm(M, sel, plan);
    this.peopleBox(M, sel);
    M.appendChild(h('p.hint.pl-foot', 'Rebuilding lays the place out afresh. People you have written (quest givers, anyone with words, rumours, a stock or a story part of their own) keep who they are and move into the new building of their trade; chests, signs, events and stairs to other maps stay too. Squares painted by hand in Details are not kept.'));
    M.scrollTop = keep;
    this.refreshDirty(sel);
    this.preview(map);
  }

  notesBox() {
    const n = this.notes;
    return h('div.pl-notes',
      h('div.pl-notes-head', h('b', '✓ ' + n.summary), h('button.small.link', { onclick: () => this.ed.undo() }, '↶ Undo')),
      n.notes.length ? h('ul', ...n.notes.map((t) => h('li', t))) : null);
  }

  section(M, title, help, ...kids) {
    M.appendChild(h('div.pl-sec', h('div.pl-sec-head', h('span', title), help ? h('small', help) : null), ...kids));
  }

  // + − counter for a number on the plan
  counter(label, icon, desc, get, set, min = 0, max = 12, on = null) {
    const val = h('b.pl-n', String(get()));
    const row = h('div.pl-count' + (get() > 0 ? '.on' : ''), { title: desc || label });
    const bump = (d) => {
      const v = Math.max(min, Math.min(max, get() + d));
      set(v);
      val.textContent = String(v);
      row.classList.toggle('on', v > 0);
      minus.disabled = v <= min; plus.disabled = v >= max;
      on && on();
    };
    const minus = h('button.small.pl-pm', { 'aria-label': `One fewer ${label}`, onclick: () => bump(-1) }, '−');
    const plus = h('button.small.pl-pm', { 'aria-label': `One more ${label}`, onclick: () => bump(1) }, '+');
    minus.disabled = get() <= min; plus.disabled = get() >= max;
    row.append(h('span.pl-cic', icon), h('span.pl-cl', h('span', label), desc ? h('small', desc) : null), minus, val, plus);
    return row;
  }

  sizeButtons(sel, plan) {
    return h('div.pl-seg', ...Object.entries(SIZE_NAMES).map(([k, l]) => h('button.small' + (plan.size === k ? '.on' : ''), { onclick: () => { plan.size = k; this.changed(sel, true); } }, l)));
  }

  townForm(M, sel, plan) {
    const style = h('select', { 'aria-label': 'Built as' }, ...Object.entries(SETTLEMENT_STYLE_NAMES).map(([k, l]) => h('option', { value: k }, l)));
    style.value = plan.style;
    style.addEventListener('change', () => { plan.style = style.value; this.changed(sel, true); });
    this.section(M, 'Built as', 'The look of the place: streets, walls and the folk who live there', h('div.pl-row', style, this.sizeButtons(sel, plan)));
    const harbour = plan.style === 'harbour';
    const lordName = plan.style === 'castle' ? 'The keep' : plan.style === 'dwarfgate' ? 'The king\'s hall' : 'Lord\'s hall';
    const grid = h('div.pl-counters');
    for (const [k, label, icon, desc] of BUILDINGS) {
      const min = harbour && ['tavern', 'provisions', 'shipwright'].includes(k) ? 1 : 0;
      grid.appendChild(this.counter(k === 'lord' ? lordName : label, icon, desc, () => plan.buildings[k], (v) => { plan.buildings[k] = v; }, min, 6, () => this.changed(sel)));
    }
    this.section(M, 'Key buildings', harbour ? 'The quay, its piers, shipyard, tavern and chandler are laid out by hand; you can add more' : 'Each with its keeper, as the player will see it', grid);
    const folk = h('div.pl-counters');
    folk.appendChild(this.counter('Homes', '🏠', 'a cottage, and the household in it', () => plan.homes, (v) => { plan.homes = v; }, harbour ? 3 : 0, 30, () => this.changed(sel)));
    folk.appendChild(this.counter('Townsfolk', '🧑', 'out and about the streets', () => plan.folk, (v) => { plan.folk = v; }, 0, 30, () => this.changed(sel)));
    folk.appendChild(this.counter('Guards', '💂', plan.style === 'dwarfgate' ? 'at the mouth of the hold' : 'at the gates', () => plan.guards, (v) => { plan.guards = v; }, 0, 12, () => this.changed(sel)));
    this.section(M, 'Homes, folk and the watch', null, folk);
    if (!harbour && plan.style !== 'dwarfgate') {
      const walls = h('select', { 'aria-label': 'Walls' }, ...Object.entries(WALL_NAMES).map(([k, l]) => h('option', { value: k }, l)));
      walls.value = plan.walls;
      walls.addEventListener('change', () => { plan.walls = walls.value; this.changed(sel, true); });
      const gate = (g) => h('button.small.pl-gate' + (plan.gates.includes(g) ? '.on' : ''), {
        title: `${GATE_NAMES[g]}: ${plan.gates.includes(g) ? 'a gate and a road out' : 'no gate'}`, 'aria-label': `${GATE_NAMES[g]} gate`,
        onclick: () => {
          const has = plan.gates.includes(g);
          if (has && plan.gates.length === 1) { toast('A place needs at least one way in.', 'warn'); return; }
          plan.gates = has ? plan.gates.filter((x) => x !== g) : [...plan.gates, g];
          this.changed(sel, true);
        },
      }, g.toUpperCase());
      const compass = h('div.pl-compass', h('span'), gate('n'), h('span'), gate('w'), h('span.pl-hub', '✦'), gate('e'), h('span'), gate('s'), h('span'));
      this.section(M, plan.walls === 'none' ? 'Roads out' : 'Walls and gates', plan.walls === 'none' ? 'Where the streets leave the place' : 'Gates are where the roads come in; the party arrives at the south gate if there is one',
        h('div.pl-row.pl-walls', walls, compass));
    }
  }

  dungeonForm(M, sel, plan) {
    const g = this.ed.game;
    const style = h('select', { 'aria-label': 'Built as' }, ...Object.entries(DUNGEON_STYLE_NAMES).map(([k, l]) => h('option', { value: k }, l)));
    style.value = plan.style;
    style.addEventListener('change', () => { plan.style = style.value; this.changed(sel, true); });
    this.section(M, 'Built as', 'Caves wind; crypts and fortresses are halls of dressed stone; a sea cave lets the sea in', h('div.pl-row', style, this.sizeButtons(sel, plan)));
    const grid = h('div.pl-counters');
    grid.appendChild(this.counter('Rooms', '🚪', 'chambers, joined by passages', () => plan.rooms, (v) => { plan.rooms = v; }, 2, 24, () => this.changed(sel)));
    grid.appendChild(this.counter('Chests', '🧰', 'along the way, besides the hoard', () => plan.chests, (v) => { plan.chests = v; }, 0, 12, () => this.changed(sel)));
    grid.appendChild(this.counter('Curiosities', '🗿', 'carved pillars, hidden caches, shrines', () => plan.wonders, (v) => { plan.wonders = v; }, 0, 6, () => this.changed(sel)));
    this.section(M, 'Rooms and riches', null, grid);
    // monsters: who lurks in the rooms, and how many to a band
    const monName = (id) => g.monsters.find((m) => m.id === id)?.name || id;
    const chips = h('div.pl-mons', ...plan.monsters.map((id, i) => {
      const n = h('input', { type: 'text', value: plan.counts[id] || '2-4', title: 'How many in a band (a number, or a range like 2-4)', 'aria-label': `How many ${monName(id)}` });
      n.addEventListener('input', () => { if (n.value && n.value !== '2-4') plan.counts[id] = n.value; else delete plan.counts[id]; this.changed(sel); });
      return h('span.pl-mon', h('span', monName(id)), h('i', '×'), n, h('button.small.link', { title: 'Remove', 'aria-label': `Remove ${monName(id)}`, onclick: () => { plan.monsters.splice(i, 1); delete plan.counts[id]; this.changed(sel, true); } }, '✕'));
    }));
    const dungeonFolk = g.monsters.filter((m) => !m.boss && (m.habitat || []).includes('dungeon'));
    const others = g.monsters.filter((m) => !m.boss && !dungeonFolk.includes(m));
    const add = h('select', { 'aria-label': 'Add a monster' }, h('option', { value: '' }, '+ Add a monster…'),
      h('optgroup', { label: 'Dungeon dwellers' }, ...dungeonFolk.filter((m) => !plan.monsters.includes(m.id)).map((m) => h('option', { value: m.id }, `${m.name} (level ${m.level || 1})`))),
      h('optgroup', { label: 'Others' }, ...others.filter((m) => !plan.monsters.includes(m.id)).map((m) => h('option', { value: m.id }, `${m.name} (level ${m.level || 1})`))));
    add.addEventListener('change', () => { if (add.value) { plan.monsters.push(add.value); this.changed(sel, true); } });
    this.section(M, 'Monsters', 'A band of them waits in each room on the way', chips, add);
    const boss = h('select', { 'aria-label': 'The boss' }, h('option', { value: '' }, 'No boss'),
      h('optgroup', { label: 'Great foes' }, ...g.monsters.filter((m) => m.boss).map((m) => h('option', { value: m.id }, m.name))),
      h('optgroup', { label: 'Any monster' }, ...g.monsters.filter((m) => !m.boss).map((m) => h('option', { value: m.id }, m.name))));
    boss.value = plan.boss || '';
    boss.addEventListener('change', () => { plan.boss = boss.value || null; this.changed(sel); });
    this.section(M, 'The boss', 'Waits alone in the last room, before the hoard', boss);
    const hoard = buildForm(plan.treasure, [
      { key: 'gold', label: 'Gold', type: 'dice', hint: 'A number, or dice such as 3d20+50' },
      { key: 'items', label: 'Treasures', type: 'itemlist', options: () => g.items.map((it) => [it.id, it.name]) },
    ], () => this.changed(sel));
    this.section(M, 'The hoard', 'In the chest in the last room', hoard);
  }

  peopleBox(M, sel) {
    const ed = this.ed, map = sel.map;
    const people = peopleOfPlace(ed.game, map);
    const all = map.entities.filter((e) => e.type === 'npc').length;
    const go = (e) => ed.goTo({ tab: 'map', map: map.id, entity: e.id });
    const rows = people.map(({ e, role, reasons, giver }) => h('button.pl-person', { title: `${e.name || 'Someone'}: open in Details`, onclick: () => go(e) },
      h('span.pl-pname', giver ? h('span.pl-star', { title: 'Gives a quest' }, '★') : null, e.name || '(no name)'),
      h('span.pl-prole', role),
      h('span.pl-why', reasons.length ? reasons.slice(0, 2).join(' · ') : 'made up by the generator')));
    const things = map.entities.filter((e) => e.type !== 'npc' && !(e.type === 'monster' && !e.boss) && !(e.type === 'portal' && e.target?.map === 'exit'));
    const thingRows = things.slice(0, 12).map((e) => h('button.pl-person.thing', { onclick: () => go(e) },
      h('span.pl-pname', thingLabel(ed.game, e)), h('span.pl-prole', e.type === 'portal' ? 'passage' : e.type), h('span.pl-why', thingInfo(ed.game, e))));
    const rest = all - people.length;
    if (!rows.length && !thingRows.length) return;
    this.section(M, isDungeonKind(this.draft(sel).kind) ? 'Who and what is here' : 'Who lives here', 'Click one to open it in Details',
      rows.length ? h('div.pl-people', ...rows) : null,
      rest > 0 ? h('p.hint', `…and ${rest} made-up ${rest === 1 ? 'townsperson' : 'townsfolk'}, who may change when the place is rebuilt.`) : null,
      thingRows.length ? h('div.pl-people', ...thingRows) : null,
      things.length > 12 ? h('p.hint', `…and ${things.length - 12} more.`) : null);
  }

  // ------------------------------------------------------------ the live view
  preview(map) {
    const ed = this.ed, v = ed.view;
    if (!map) return;
    if (!ed.previewing) {
      const r = v.rig;
      ed.savedCam = { map: ed.map.id, tx: r.tx, tz: r.tz, dist: r.dist };
      ed.previewing = true;
    }
    if (this.shown !== map || v.map !== map) {
      v.setMap(map);
      v.setVisibilityEnabled(false);
      for (const e of map.entities) {
        v.addEntity(e.id, ed.entityLook(e), e.x, e.y, { ring: e.type === 'monster' ? 0xd03030 : 0xffe040, scale: e.boss ? 1.2 : 1, idle: true });
        if (e.type !== 'monster') v.setRing(e.id, null);
      }
      v.terrain.refreshClearings?.();
      this.shown = map;
    }
    // frame the place in the space to the right of the form
    requestAnimationFrame(() => {
      if (this.shown !== map || ed.tab !== 'places') return;
      const mainRight = this.main.getBoundingClientRect().right || 812;
      const vpLeft = v.container.getBoundingClientRect().left;
      v.frameArea(0, 0, map.w, map.h, { left: Math.max(0, mainRight - vpLeft) + 8, right: 8, top: 34, bottom: 8 });
    });
    let cap = ed.root.querySelector('.pl-caption');
    if (!cap) { cap = h('div.pl-caption'); ed.root.appendChild(cap); }
    cap.textContent = `${map.name} — as it stands`;
  }

  // ------------------------------------------------------------ doing things
  rebuild(sel, quiet = false) {
    const ed = this.ed, map = sel.map;
    const plan = this.draft(sel);
    if (ed.checkpoint) ed.checkpoint(`the rebuild of ${map.name}`);
    else {
      ed.undoStack.push({ mapId: map.id, snap: { ...snapshotMap(map), place: placeState(map) } });
      if (ed.undoStack.length > 60) ed.undoStack.shift();
      ed.redoStack = [];
      ed.updateUndo();
    }
    let res;
    try { res = rebuildPlace(ed.game, map, plan); } catch (e) { console.error(e); toast('Could not rebuild: ' + e.message, 'bad'); return; }
    this.drafts.delete(map.id);
    this.notes = { id: map.id, ...res };
    this.shown = null;
    ed.markDirty();
    this.render();
    if (!quiet || res.notes.length) toast(res.summary + (res.notes.length ? ` (${res.notes.length} note${res.notes.length === 1 ? '' : 's'} in the designer.)` : ''));
  }

  newPlace() {
    const ed = this.ed;
    const o = { kind: 'town', name: defaultSiteName('town'), how: 'find' };
    let named = false;
    const body = h('div.pl-new');
    const draw = () => {
      clear(body);
      const kinds = h('div.pl-kinds', ...Object.entries(FEATURE_KINDS).map(([k, f]) => h('button.pl-kind' + (o.kind === k ? '.on' : ''), {
        onclick: () => { o.kind = k; if (!named) o.name = defaultSiteName(k); draw(); },
      }, h('span', PLACE_ICONS[k]), h('small', f.label))));
      const name = h('input', { type: 'text', value: o.name, 'aria-label': 'Name' });
      name.addEventListener('input', () => { o.name = name.value; named = true; });
      const how = (k, label, sub) => h('label.pl-how' + (o.how === k ? '.on' : ''), h('input', { type: 'radio', name: 'pl-how', checked: o.how === k, onchange: () => { o.how = k; draw(); } }), h('span', h('b', label), h('small', sub)));
      body.append(h('div.field', h('span.field-label', 'What kind of place'), kinds),
        h('label.field', h('span.field-label', 'Name'), name),
        h('div.field', h('span.field-label', 'Where'),
          how('find', '✦ Find a good spot for me', isDungeonKind(o.kind) ? 'Somewhere wild, a fair way from the start' : COASTAL_HINT[o.kind] || 'On open ground, apart from the other places, that the company can walk to'),
          how('pick', '🗺 I will pick the spot', 'Opens the world map: click where it should stand')));
    };
    draw();
    modal(body, {
      title: 'A new place', sub: 'Its map is built for you, from a plan you can change', cls: 'pl-new-modal',
      buttons: [{ label: 'Cancel' }, { label: 'Found it', primary: true, onClick: () => { if (!o.name.trim()) o.name = defaultSiteName(o.kind); if (o.how === 'pick') this.pickSpot(o.kind, o.name.trim()); else this.findSpot(o.kind, o.name.trim()); } }],
    });
  }

  pickSpot(kind, name) {
    const ed = this.ed;
    ed.pendingSite = { kind, name };
    ed.setTab('land');
    ed.setTool('found_' + kind);
    toast(`Click the world map where ${name} should stand.`);
  }

  findSpot(kind, name) {
    const ed = this.ed, game = ed.game;
    const world = worldMap(game);
    if (ed.checkpoint) ed.checkpoint(`founding ${name}`);
    else { ed.undoStack.push({ mapId: world.id, snap: snapshotMap(world) }); ed.redoStack = []; ed.updateUndo(); }
    const res = autoPlaceSites(game, world, [{ kind, name }], { seed: Math.floor(Math.random() * 1e9) });
    if (!res.length) { toast(`There is nowhere on ${world.name} that suits a ${FEATURE_KINDS[kind].label.toLowerCase()}. Pick a spot yourself in the Land step.`, 'warn'); return; }
    ed.markDirty();
    this.notes = null;
    this.select(res[0].map);
    toast(`Founded ${name} at ${res[0].portal.x}, ${res[0].portal.y} on ${world.name}.`);
  }

  async deletePlace(sel) {
    const ed = this.ed, game = ed.game, map = sel.map;
    // the place, and every level beneath it
    const doomed = [map];
    for (let i = 0; i < doomed.length; i++) for (const m of game.maps) if (m.exit?.map === doomed[i].id && !doomed.includes(m) && m.type !== 'world') doomed.push(m);
    const ids = new Set(doomed.map((m) => m.id));
    const people = doomed.flatMap((m) => m.entities.filter((e) => e.type === 'npc'));
    const quests = (game.quests || []).filter((q) => people.some((p) => JSON.stringify(q).includes(`"${p.id}"`)) || JSON.stringify(q).includes(`"${map.id}"`));
    const text = `${map.name}${doomed.length > 1 ? ` and the ${doomed.length - 1} level${doomed.length > 2 ? 's' : ''} beneath it` : ''} will be gone: ${doomed.length > 1 ? 'their maps' : 'its map'}, ${people.length} ${people.length === 1 ? 'person' : 'people'} and everything there${sel.portal ? ', and its site on the world map' : ''}.`
      + (quests.length ? ` ${quests.length} quest${quests.length === 1 ? '' : 's'} point${quests.length === 1 ? 's' : ''} there and will need mending: ${quests.slice(0, 4).map((q) => `“${q.name}”`).join(', ')}${quests.length > 4 ? '…' : ''}.` : '')
      + (ed.checkpoint ? ' Undo brings it back.' : ' This cannot be undone.');
    if (!await confirmDialog(text, `Delete ${map.name}?`)) return;
    ed.checkpoint?.(`deleting ${map.name}`);
    game.maps = game.maps.filter((m) => !ids.has(m.id));
    for (const m of game.maps) {
      for (const e of m.entities) {
        if (e.type === 'portal' && ids.has(e.target?.map) && e.style === 'site') setTile(m, e.x, e.y, naturalAround(m, e.x, e.y));
      }
      m.entities = m.entities.filter((e) => !(e.type === 'portal' && ids.has(e.target?.map)));
    }
    if (ids.has(game.settings.start?.map)) {
      const w = worldMap(game);
      game.settings.start = { map: w.id, x: Math.floor(w.w / 2), y: Math.floor(w.h / 2) };
    }
    this.drafts.delete(map.id);
    this.notes = null;
    this.shown = null;
    if (ids.has(ed.map.id)) ed.map = worldMap(game);
    ed.undoStack = ed.checkpoint ? ed.undoStack : ed.undoStack.filter((u) => !ids.has(u.mapId));
    ed.markDirty();
    ed.refreshMapList?.();
    this.sel = null;
    this.render();
    toast(`${map.name} is no more.`);
  }
}

// what a rebuild changes on a map besides its squares and things
const placeState = (map) => ({ plan: map.plan ? JSON.parse(JSON.stringify(map.plan)) : null, type: map.type, lighting: map.lighting, fill: map.fill });

const COASTAL_HINT = {
  harbour: 'On the coast, by deep water',
  seacave: 'On a rocky coast, perhaps an island reached only by ship',
  dwarfgate: 'Against the mountains',
  elfhall: 'Deep in the woods',
  fortress: 'Far from the start, in blighted land or the mountains',
};

function thingLabel(game, e) {
  if (e.type === 'monster') return game.monsters.find((m) => m.id === e.monster)?.name || e.monster;
  if (e.type === 'portal') return e.label || (e.target?.map ? `To ${game.maps.find((m) => m.id === e.target.map)?.name || 'another map'}` : 'A passage');
  if (e.type === 'chest') return e.name || 'Chest';
  if (e.type === 'sign') return 'Sign';
  return e.name || e.label || e.type;
}

function thingInfo(game, e) {
  if (e.type === 'chest') {
    const items = (e.items || []).map((it) => game.items.find((x) => x.id === it.id)?.name || it.id);
    return [e.gold ? `${e.gold} gold` : null, ...items.slice(0, 2)].filter(Boolean).join(', ') || 'empty';
  }
  if (e.type === 'sign') return `“${String(e.text || '').slice(0, 40)}${String(e.text || '').length > 40 ? '…' : ''}”`;
  if (e.type === 'monster') return e.boss ? 'a great foe' : `a band of ${e.count}`;
  if (e.type === 'portal') return e.style === 'stairs' ? 'stairs' : e.style || '';
  if (e.type === 'event') return e.kind || '';
  return '';
}

// the land a site stood on, once it is gone
function naturalAround(map, x, y) {
  const tally = {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    if (!inBounds(map, x + dx, y + dy)) continue;
    const t = terrain(getTile(map, x + dx, y + dy));
    if (!t.walk || t.water || t.feature || t.key === 'road' || t.key === 'bridge') continue;
    tally[t.id] = (tally[t.id] || 0) + 1;
  }
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return best ? +best[0] : T.grass;
}
