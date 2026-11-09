// (puzzles) The Construction Set's side of puzzles: the Puzzles tools in the
// Details step, an inspector for each kind (with a helper for needs that
// lists the realm's flags and what sets them, and a way to pick a trigger's
// tiles on the map), labels over gates, triggers and runes saying what they
// wait on, and the links drawn when one is selected.
import { h, clear, toast } from '../dom.js';
import { buildForm } from './forms.js';
import { uid } from '../../core/util.js';
import { inBounds, getTile } from '../../world/map.js';
import { terrain, TERRAIN_LIST } from '../../data/terrain.js';
import {
  PUZZLE_KINDS, PUZZLE_TYPES, GLYPHS, GATE_STYLES, RIDDLE_LOOKS, isPuzzle, flagOf, needTerms, needText, needUnmet, needFlags, flagSources, puzzleLook, puzzleName, tileId,
} from '../../game/puzzles.js';
import { showPuzzle } from '../../render/puzzles.js';
import { GLYPH_COLORS } from '../../render/puzzles.js';

const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());

// a fresh flag name like lever1, lever2… not yet used in the realm
function freshFlag(game, base) {
  const used = flagSources(game);
  for (const m of game.maps) for (const e of m.entities || []) if (isPuzzle(e)) { used.set(e.id, []); used.set(flagOf(e), []); }
  for (let i = 1; i < 999; i++) if (!used.has(base + i)) return base + i;
  return base + Date.now() % 1000;
}

// the flag of the lever, plate, brazier or rune group nearest (x, y) on the map
function nearestSource(map, x, y) {
  let best = null, bd = Infinity;
  for (const e of map.entities) {
    if (!['lever', 'plate', 'brazier', 'riddle', 'rune'].includes(e.type) || !flagOf(e)) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best ? flagOf(best) : '';
}

// what a new piece starts as
const DEFAULTS = {
  lever: (ed) => ({ on: false, flag: freshFlag(ed.game, 'lever') }),
  plate: (ed) => ({ flag: freshFlag(ed.game, 'plate') }),
  boulder: () => ({}),
  gate: (ed, t) => ({ need: nearestSource(ed.map, t.x, t.y), style: ed.map.type === 'dungeon' ? 'portcullis' : 'bars' }),
  riddle: (ed) => ({ look: 'face', text: 'I have cities, but no houses; forests, but no trees; water, but no fish. What am I?', answers: ['map'], flag: freshFlag(ed.game, 'riddle'),
    wrong: { text: 'The stone eyes flash red. "No," it rumbles, and pain lances through you.', hurt: '1d4' } }),
  rune: (ed) => {
    // the next rune of the group laid last on this map
    const runes = ed.map.entities.filter((e) => e.type === 'rune');
    const group = runes.length ? runes[runes.length - 1].group : freshFlag(ed.game, 'runes');
    const order = Math.max(0, ...runes.filter((r) => r.group === group).map((r) => +r.order || 0)) + 1;
    return { group, order, glyph: GLYPHS[(order - 1) % GLYPHS.length] };
  },
  brazier: (ed) => ({ lit: false, flag: freshFlag(ed.game, 'brazier') }),
  trigger: (ed, t) => ({ need: nearestSource(ed.map, t.x, t.y), tiles: [], text: '', once: true }),
};

// ------------------------------------------------------------ tools
export const PUZZLE_TOOLS = Object.fromEntries(PUZZLE_TYPES.map((k) => [`puzzle_${k}`, {
  label: PUZZLE_KINDS[k].label.replace('Pressure plate', 'Plate').replace('Rune tile', 'Rune'), icon: PUZZLE_KINDS[k].icon, cursor: 'tile',
  hint: `${PUZZLE_KINDS[k].label}: ${PUZZLE_KINDS[k].hint} Click the map to place one.`,
  down(ed, t) {
    if (!inBounds(ed.map, t.x, t.y)) return;
    const there = ed.entityAt(t.x, t.y);
    if (there && there.type !== 'portal' && !(k === 'trigger' && there.type !== 'trigger')) { ed.select(there); return; }
    const ent = { id: uid(k), type: k, x: t.x, y: t.y, ...DEFAULTS[k](ed, t) };
    const td = terrain(getTile(ed.map, t.x, t.y));
    if (!td.walk && k !== 'riddle') toast('That square is not walkable — set it on open floor.', 'warn');
    ed.beginEdit();
    ed.map.entities.push(ent);
    ed.refreshEntities();
    ed.select(ent);
    ed.markDirty();
  },
}]));
export const PUZZLE_TOOL_IDS = Object.keys(PUZZLE_TOOLS);

// ------------------------------------------------------------ in the editor's view
// (called by the editor's addVisual) the piece with its moving part
export function addPuzzleVisual(ed, e) {
  const look = puzzleLook({ ...e, _open: false, on: !!e.on, lit: !!e.lit }, true);
  if (!look) return false;
  showPuzzle(ed.view, e, look, { ring: 0xffe040 });
  ed.view.setRing(e.id, null);
  return true;
}

// The flags each map square's puzzle waits on, and the squares they come
// from: highlighted when a gate, a trigger or a lever with a need is
// selected (sources gold, a trigger's tiles violet)
export function showPuzzleLinks(ed, e) {
  const v = ed.view;
  if (!e || !isPuzzle(e)) { if (ed._pzLinks) { v.setHighlights(null); ed._pzLinks = false; } return; }
  const cells = [];
  const wants = new Set(needFlags(e.need));
  for (const o of ed.map.entities) if (o !== e && isPuzzle(o) && wants.has(flagOf(o))) cells.push({ x: o.x, y: o.y, color: 0xffd040 });
  // and what this one's flag opens
  const mine = flagOf(e);
  if (mine && e.type !== 'gate' && e.type !== 'trigger') for (const o of ed.map.entities) if (o !== e && needFlags(o.need).includes(mine)) cells.push({ x: o.x, y: o.y, color: 0x60e0ff });
  for (const t of e.tiles || []) cells.push({ x: +t.x, y: +t.y, color: 0xc070ff });
  if (cells.length) { v.setHighlights(cells, 0xffd040, 0.36); ed._pzLinks = true; } else if (ed._pzLinks) { v.setHighlights(null); ed._pzLinks = false; }
}

// Little tags over gates and triggers (what they wait on, red when nothing
// can ever set it) and runes (their group and place in it)
export class PuzzleLabels {
  constructor(ed) {
    this.ed = ed;
    this.el = h('div.pz-labels');
    ed.view.container.appendChild(this.el);
    this.tags = new Map();
    const loop = () => { this._raf = requestAnimationFrame(loop); this.update(); };
    this._raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this._raf); this.el.remove(); }

  refresh() {
    const ed = this.ed, map = ed.map;
    clear(this.el);
    this.tags.clear();
    if (!map) return;
    const src = flagSources(ed.game);
    for (const e of map.entities) {
      if (!isPuzzle(e)) continue;
      let text = '', bad = false, cls = '';
      if (e.type === 'gate' || e.type === 'trigger' || (e.type === 'lever' && e.need)) {
        const missing = needUnmet(e.need, src);
        bad = missing.length > 0 || (e.type === 'trigger' && !String(e.need || '').trim());
        text = `${e.type === 'trigger' ? '✳ when' : e.type === 'lever' ? '🔒' : '⛓'} ${needText(e.need)}`;
        cls = e.type;
      } else if (e.type === 'rune') {
        text = `${e.group || '?'} · ${e.order || '?'}`;
        cls = 'rune';
        bad = !e.group || !e.order;
      } else continue;
      const tag = h('div.pz-tag.' + cls + (bad ? '.bad' : ''), text);
      if (e.type === 'rune') tag.style.borderColor = '#' + (GLYPH_COLORS[e.glyph] || 0xffffff).toString(16).padStart(6, '0');
      this.el.appendChild(tag);
      this.tags.set(e, tag);
    }
  }

  update() {
    const ed = this.ed, v = ed.view;
    const show = !ed.hidden && !!ed.map && ['map'].includes(ed.tab) && this.tags.size;
    this.el.hidden = !show;
    if (!show) return;
    const rect = v.renderer.domElement.getBoundingClientRect(), crect = v.container.getBoundingClientRect();
    for (const [e, tag] of this.tags) {
      const up = e.type === 'gate' ? 1.35 : e.type === 'trigger' ? 0.9 : e.type === 'lever' ? 0.95 : 0.25;
      const p = v.worldToScreen(e.x + 0.5, v.heightAt(e.x, e.y) + up, e.y + 0.5);
      if (p.behind) { tag.style.display = 'none'; continue; }
      tag.style.display = '';
      tag.style.transform = `translate(${p.x + rect.left - crect.left}px, ${p.y + rect.top - crect.top}px) translate(-50%, -100%)`;
    }
  }
}

// ------------------------------------------------------------ inspector
// A need: the text (a,b all; a|b any; !a not), what it reads as, each flag
// with what sets it (or a warning), and the realm's flags to click in
function needField(ed, ent, key, label, changed, hint) {
  const wrap = h('div.field.wide.pz-need');
  const input = h('input', { type: 'text', value: ent[key] || '', placeholder: 'e.g. lever1  ·  plate1,plate2  ·  runes1|riddle1', 'aria-label': label });
  const read = h('div.pz-need-read');
  const flags = h('div.pz-flags');
  const render = () => {
    const src = flagSources(ed.game);
    clear(read);
    const terms = needTerms(ent[key]);
    if (!terms.length) read.appendChild(h('span.hint', key === 'need' && ent.type === 'gate' ? 'Nothing: the gate stands open.' : 'Nothing yet.'));
    else {
      read.appendChild(h('div.pz-reads', 'Waits on: ', h('b', needText(ent[key]))));
      for (const f of needFlags(ent[key])) {
        const by = src.get(f) || [];
        const killed = /^killed_/.test(f);
        read.appendChild(h('div.pz-src' + (by.length || killed ? '.ok' : '.bad'), h('code', f), ' — ',
          by.length ? by.slice(0, 3).map((b) => `${b.what}${b.map && b.map !== ed.map ? ' in ' + b.map.name : b.e ? ` at ${b.e.x}, ${b.e.y}` : ''}`).join('; ') + (by.length > 3 ? '…' : '')
            : killed ? 'set when that monster is slain' : 'nothing sets this flag yet'));
      }
      const missing = needUnmet(ent[key], src);
      if (missing.length) read.appendChild(h('div.pz-warn', `⚠ This can never be met: nothing sets ${missing.join(', ')}.`));
    }
    clear(flags);
    const known = [...src.keys()].filter((f) => f !== flagOf(ent)).sort();
    if (known.length) {
      flags.appendChild(h('span.hint', 'Flags in this realm (click to add):'));
      for (const f of known.slice(0, 40)) {
        flags.appendChild(h('button.chip.small', {
          title: (src.get(f) || []).map((b) => b.what).join('; '),
          onclick: (ev) => {
            ev.preventDefault();
            const cur = String(ent[key] || '').trim();
            ent[key] = cur ? `${cur},${f}` : f;
            input.value = ent[key];
            changed(); render();
          },
        }, f));
      }
    }
  };
  input.addEventListener('input', () => { ent[key] = input.value.trim(); changed(); render(); });
  wrap.append(h('span.field-label', label), input, h('span.field-hint', hint || 'Flag names: a,b needs both; a|b either; !a means a must not be set.'), read, flags);
  render();
  return wrap;
}

const TILE_OPTS = () => TERRAIN_LIST.map((t) => [t.key, t.name]);

// pick a trigger's tiles: each click on the map adds that square (or takes it away)
function pickTiles(ed, ent, kind, done) {
  const prev = ed.toolId;
  ed.tools.__pzTiles = {
    label: 'Pick tiles', icon: '🎯', cursor: 'tile',
    hint: `Click squares to add them to the trigger (they become ${terrain(tileId(kind) ?? 0).name}); click one again to take it away. Choose another tool, or Done, to finish.`,
    down: (e2, t) => {
      if (!inBounds(ed.map, t.x, t.y)) return;
      ed.beginEdit();
      const i = ent.tiles.findIndex((q) => +q.x === t.x && +q.y === t.y);
      if (i >= 0) ent.tiles.splice(i, 1); else ent.tiles.push({ x: t.x, y: t.y, t: kind });
      ed.markDirty();
      showPuzzleLinks(ed, ent);
      done?.(false);
    },
  };
  ed.setTool('__pzTiles');
  ed._pzPick = { prev, ent };
  toast('Click the squares the trigger changes.');
}

export function inspectPuzzle(ed, ent, container, head, changed) {
  const game = ed.game;
  const K = PUZZLE_KINDS[ent.type];
  container.appendChild(head(cap(puzzleName(ent).replace(/^An? /, '')), `${K.label} · at ${ent.x}, ${ent.y}`));
  container.appendChild(h('p.hint', K.hint));
  const common = [
    { key: 'name', label: 'Name', type: 'text', placeholder: puzzleName(ent), hint: 'Shown when pointed at.' },
    { key: 'text', label: ent.type === 'trigger' ? 'Said when it fires' : ent.type === 'riddle' ? 'The riddle' : 'When looked at', type: 'textarea', rows: ent.type === 'riddle' ? 3 : 2 },
  ];
  const flagField = (label = 'Sets flag') => ({ key: 'flag', label, type: 'text', placeholder: ent.id, hint: 'Blank: its own id. Gates and triggers wait on this name.' });
  const redraw = () => { changed(); ed.labels?.refresh(); showPuzzleLinks(ed, ent); };
  const items = () => game.items.map((i) => [i.id, i.name]);
  const monsters = () => game.monsters.map((m) => [m.id, `${m.name} (lvl ${m.level})`]);
  let fields = [];
  const after = [];
  switch (ent.type) {
    case 'lever':
      fields = [...common, flagField(), { key: 'on', label: 'Starts pulled down (flag set)', type: 'check' },
        { key: 'oneWay', label: 'One way: once down it stays down', type: 'check' },
        { key: 'reset', label: 'Also rolls back the boulders of group', type: 'text', placeholder: 'e.g. rocks1', hint: 'Boulders with this group go back where they began.' },
        { key: 'pullText', label: 'Said when pulled', type: 'text' },
        { key: 'lockedText', label: 'Said while it will not move', type: 'text', show: (o) => !!o.need }];
      after.push(needField(ed, ent, 'need', 'Locked until', redraw, 'Leave blank for a lever that always moves.'));
      break;
    case 'plate':
      fields = [...common, flagField(), { key: 'latch', label: 'Latches: stays down once pressed', type: 'check' }];
      break;
    case 'boulder':
      fields = [...common, { key: 'group', label: 'Group', type: 'text', placeholder: 'e.g. rocks1', hint: 'A lever (or a choice) with this "reset" rolls the group back home.' },
        { key: 'stuckText', label: 'Said when it will not budge', type: 'text' }];
      break;
    case 'gate':
      fields = [{ key: 'name', label: 'Name', type: 'text', placeholder: puzzleName(ent) },
        { key: 'style', label: 'Looks like', type: 'select', options: Object.entries(GATE_STYLES) },
        { key: 'stayOpen', label: 'Stays open once opened', type: 'check' },
        { key: 'closedText', label: 'Said when the company bumps it', type: 'textarea', rows: 2 },
        { key: 'openText', label: 'Said when it opens', type: 'text' },
        { key: 'text', label: 'When looked at', type: 'text' }];
      container.appendChild(needField(ed, ent, 'need', 'Opens when', redraw, 'Shut until this holds (and shut again when it stops, unless it stays open).'));
      break;
    case 'riddle':
      fields = [{ key: 'name', label: 'Name', type: 'text', placeholder: puzzleName(ent) },
        { key: 'look', label: 'Looks like', type: 'select', options: Object.entries(RIDDLE_LOOKS) },
        { key: 'text', label: 'The riddle', type: 'textarea', rows: 3 },
        { key: 'answers', label: 'Answers', type: 'text', get: (o) => (o.answers || []).join(', '), put: (o, v) => { o.answers = String(v).split(',').map((x) => x.trim()).filter(Boolean); },
          hint: 'Comma-separated. Case, "a"/"the" and a plural s do not matter: "river" also takes "A River".' },
        flagField('Sets flag when answered'),
        { key: 'rightText', label: 'Said to the right answer', type: 'textarea', rows: 2 },
        { key: 'reward.gold', label: 'Reward: gold', type: 'number', min: 0, nullable: true },
        { key: 'reward.xp', label: 'Reward: experience', type: 'number', min: 0, nullable: true },
        { key: 'reward.items', label: 'Reward: items', type: 'itemlist', options: items },
        { key: 'wrong.text', label: 'Said to a wrong answer', type: 'textarea', rows: 2 },
        { key: 'wrong.hurt', label: 'A wrong answer hurts (dice)', type: 'dice', placeholder: '1d4' },
        { key: 'wrong.fight', label: 'A wrong answer calls up', type: 'select', options: monsters, empty: '— nothing —', nullable: true, rerender: true },
        { key: 'wrong.count', label: 'How many', type: 'text', placeholder: '1 or 2-3', show: (o) => !!o.wrong?.fight }];
      break;
    case 'rune':
      fields = [{ key: 'group', label: 'Group (its flag)', type: 'text', hint: 'The runes of a group are trodden in order; the group\'s name is the flag set when the last is lit.' },
        { key: 'order', label: 'Place in the order', type: 'number', min: 1, max: 12 },
        { key: 'glyph', label: 'Glyph', type: 'select', options: GLYPHS.map((g) => [g, cap(g)]) },
        { key: 'text', label: 'When looked at', type: 'text' },
        { key: 'doneText', label: 'Said when the group is complete', type: 'text', show: (o) => +o.order === 1 },
        { key: 'wrong.text', label: 'Said on a wrong step', type: 'text', show: (o) => +o.order === 1 },
        { key: 'wrong.hurt', label: 'A wrong step hurts (dice)', type: 'dice', placeholder: '1d4', show: (o) => +o.order === 1 },
        { key: 'wrong.fight', label: 'A wrong step calls up', type: 'select', options: monsters, empty: '— nothing —', nullable: true, show: (o) => +o.order === 1 }];
      {
        const mates = ed.map.entities.filter((e) => e.type === 'rune' && e.group === ent.group);
        after.push(h('p.hint', `${mates.length} rune${mates.length === 1 ? '' : 's'} in “${ent.group}”, in order: ${mates.slice().sort((a, b) => (a.order || 99) - (b.order || 99)).map((r) => `${r.order ?? '?'} ${r.glyph}`).join(', ')}. The words for a wrong step and the end belong to rune 1.`));
      }
      break;
    case 'brazier':
      fields = [...common, flagField('Sets flag when lit'), { key: 'lit', label: 'Starts lit', type: 'check' },
        { key: 'cost.item', label: 'Lit with', type: 'select', options: items, empty: 'a torch (or fire magic)', nullable: true, get: (o) => o.cost?.item ?? '', put: (o, v) => { if (!v) delete o.cost; else o.cost = { item: v }; } },
        { key: 'group', label: 'Lit in order with group', type: 'text', placeholder: '(optional)', hint: 'Braziers sharing a group must be lit in order: the wrong one puts them all out.' },
        { key: 'order', label: 'Place in the order', type: 'number', min: 1, nullable: true, show: (o) => !!o.group },
        { key: 'coldText', label: 'Said when it cannot be lit', type: 'text' }];
      break;
    case 'trigger': {
      container.appendChild(needField(ed, ent, 'need', 'Fires when', redraw, 'When this holds, the tiles below change.'));
      fields = [{ key: 'text', label: 'Said when it fires', type: 'textarea', rows: 2, placeholder: 'With a roar of stone, a bridge rises…' },
        { key: 'once', label: 'Once only (if unticked, the tiles change back when the need stops holding)', type: 'check', get: (o) => o.once !== false, put: (o, v) => { o.once = v ? true : false; } },
        { key: 'undoText', label: 'Said when they change back', type: 'text', show: (o) => o.once === false },
        { key: 'sfx', label: 'Sound', type: 'select', options: [['rumble', 'A deep rumble'], ['gateOpen', 'Grinding stone'], ['splash', 'Water'], ['solved', 'A chime'], ['none', 'Silence']], empty: 'A deep rumble', nullable: true }];
      ent.tiles ||= [];
      const kind = h('select', { 'aria-label': 'Tiles become' }, ...TILE_OPTS().map(([k, n]) => h('option', { value: k }, n)));
      kind.value = ed.pzTileKind || ent.tiles[0]?.t || 'bridge';
      kind.addEventListener('change', () => { ed.pzTileKind = kind.value; });
      const list = h('div.pz-tiles');
      const renderList = () => {
        clear(list);
        if (!ent.tiles.length) list.appendChild(h('p.hint', 'No tiles yet: pick some on the map.'));
        ent.tiles.forEach((t, i) => list.appendChild(h('div.pz-tile', `${t.x}, ${t.y} → ${terrain(tileId(t.t) ?? 0).name}`,
          h('button.small', { title: 'Remove', onclick: () => { ed.beginEdit(); ent.tiles.splice(i, 1); ed.markDirty(); renderList(); showPuzzleLinks(ed, ent); } }, '×'))));
      };
      renderList();
      after.push(h('div.form', h('div.form-section', 'Tiles it changes'),
        h('div.row', h('span', 'Become'), kind),
        h('div.row', h('button', { onclick: () => pickTiles(ed, ent, kind.value, () => renderList()) }, '🎯 Pick tiles on the map'),
          h('button.small', { onclick: () => { if (ed.toolId === '__pzTiles') ed.setTool(ed._pzPick?.prev && ed._pzPick.prev !== '__pzTiles' ? ed._pzPick.prev : 'select'); } }, 'Done')),
        list));
      break;
    }
    default:
  }
  container.appendChild(buildForm(ent, fields, (k) => { redraw(); if (k === 'style' || k === 'look' || k === 'glyph' || k === 'lit' || k === 'on') ed.refreshEntity(ent); }));
  for (const el of after) container.appendChild(el);
  showPuzzleLinks(ed, ent);
}
