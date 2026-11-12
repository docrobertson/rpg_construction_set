// The Test step: the checklist of what still needs work, step by step, and
// the ways to try the realm out — from the start, from a chapter (the ones
// before it played through), or from the spot last looked at in Details —
// with what the playtests so far have seen.
import { h, clear, modal, confirmDialog } from '../dom.js';
import { AREAS, coverageOf, ago } from '../../game/checklist.js';
import { chapterList, questsOfChapter } from '../../game/story.js';
import { placesOf } from '../../world/places.js';
import { getMap } from '../../data/schema.js';
import { FEATURE_KINDS } from '../../data/terrain.js';
import { suggestLevel } from '../testTools.js';
import { startHeroes } from '../../game/company.js';

const LEVELS = { error: ['⛔', 'must fix'], warn: ['⚠', 'worth a look'], todo: ['○', 'still to do'], ok: ['✓', 'done'] };
const ORDER = { error: 0, warn: 1, todo: 2, ok: 3 };
const STEP_N = Object.fromEntries(AREAS.map(([k], i) => [k, i + 1]));
const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;

// The spot last looked at in Details (or on the Land): { map, x, y }. The
// camera tells while the view still shows the editor's map, and a model
// preview keeps it aside; after a playtest the view shows where play ended,
// so the spot is remembered (ed.lookSpot).
export function lastSpot(ed) {
  let c = null;
  if (ed.previewing && ed.savedCam) c = ed.savedCam;
  else if (ed.view.map === ed.map) c = { map: ed.map.id, tx: ed.view.rig.tx, tz: ed.view.rig.tz };
  const map = getMap(ed.game, c?.map) || getMap(ed.game, ed.lookSpot?.map) || ed.map;
  const spot = c ? { map: map.id, x: Math.floor(c.tx), y: Math.floor(c.tz) } : ed.lookSpot?.map === map.id ? ed.lookSpot : { map: map.id, x: map.entry?.x ?? 0, y: map.entry?.y ?? 0 };
  ed.lookSpot = spot;
  return { map, x: Math.max(0, Math.min(map.w - 1, spot.x)), y: Math.max(0, Math.min(map.h - 1, spot.y)) };
}

// The designer's playtest choices, kept while the editor is open
function ptOpts(ed) {
  const chs = chapterList(ed.game);
  const o = ed.ptOpts || (ed.ptOpts = { from: 'start', chapter: null, quick: true, level: Math.max(1, ed.game.settings.startLevel || 1), levelSet: false });
  if (!chs.some((c) => c.id === o.chapter)) o.chapter = chs[1]?.id || chs[0]?.id || null;
  if (o.from === 'chapter' && !o.chapter) o.from = 'start';
  return o;
}

// Start a playtest as the options say (or as `over` overrides them)
export function runPlaytest(ed, over = {}) {
  const o = { ...ptOpts(ed), ...over };
  let start = null;
  if (o.from === 'here') { const s = lastSpot(ed); start = { map: s.map.id, x: s.x, y: s.y }; }
  else if (o.from === 'place') { const m = getMap(ed.game, o.place); if (m) start = { map: m.id, x: m.entry?.x ?? Math.floor(m.w / 2), y: m.entry?.y ?? m.h - 2 }; }
  ed.playtest(o.quick, start, { chapter: o.from === 'chapter' ? o.chapter : null, level: o.level });
}

// The playtest options as a form. With `button`, it carries its own ▶ button.
let formN = 0;
export function playtestForm(ed, { button = true } = {}) {
  const o = ptOpts(ed);
  const game = ed.game;
  const chs = chapterList(game);
  const here = lastSpot(ed);
  const box = h('div.pt-form');
  // (the page and the ▶ Playtest window may both show a form: their radio groups stay apart)
  const uid = ++formN;
  const radio = (name, value, checked, label, sub, extra, disabled) => {
    const r = h('input', { type: 'radio', name: `${name}-${uid}`, value, checked, disabled });
    r.addEventListener('change', () => { if (r.checked) { if (name === 'from') o.from = value; else o.quick = value === 'quick'; sync(); } });
    return h('label.pt-opt' + (disabled ? '.off' : ''), r, h('span.pt-txt', h('b', label), sub ? h('small', sub) : null), extra || null);
  };
  const chSel = h('select.pt-chapter', { disabled: !chs.length }, ...chs.map((c, i) => h('option', { value: c.id }, `${i + 1}. ${c.name || 'Chapter'}`)));
  if (o.chapter) chSel.value = o.chapter;
  chSel.addEventListener('change', () => { o.chapter = chSel.value; o.from = 'chapter'; box.querySelector('input[value=chapter]').checked = true; sync(true); });
  const start = game.settings.start || {};
  const startMap = getMap(game, start.map);
  const lvl = h('input.pt-level', { type: 'number', min: 1, max: 20, value: o.level });
  lvl.addEventListener('input', () => { o.level = Math.max(1, Math.min(20, parseInt(lvl.value, 10) || 1)); o.levelSet = true; sync(); });
  const sugg = h('button.link.pt-sugg');
  sugg.addEventListener('click', () => { o.level = +sugg.dataset.n; o.levelSet = true; lvl.value = o.level; sync(); });
  const chHint = h('small.pt-chint');
  box.append(
    h('div.pt-label', 'Begin'),
    radio('from', 'start', o.from === 'start', 'From the beginning', `${startMap?.name || 'the start'} — as a new player would`),
    radio('from', 'chapter', o.from === 'chapter', 'From a chapter', chs.length ? null : 'No chapters yet: make them in the Story step', chs.length ? h('span.pt-extra', chSel, chHint) : null, !chs.length),
    radio('from', 'here', o.from === 'here', 'From here', `${here.map.name} (${here.x}, ${here.y}) — where you last looked in Details`),
    h('div.pt-label', 'Company'),
    h('div.pt-two',
      radio('quick', 'quick', o.quick, 'Ready-made', (() => { const n = startHeroes(game).n; return n === 1 ? 'one hero, as the story begins' : `${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][n] || n} heroes, no fuss`; })()), // (company)
      radio('quick', 'make', !o.quick, 'Make my own', 'choose races and callings')),
    h('div.pt-label', 'Level'),
    h('div.pt-lvl', h('button.small', { onclick: () => { lvl.value = o.level = Math.max(1, o.level - 1); o.levelSet = true; sync(); } }, '−'), lvl,
      h('button.small', { onclick: () => { lvl.value = o.level = Math.min(20, o.level + 1); o.levelSet = true; sync(); } }, '+'), sugg));
  const go = button ? h('button.primary.pt-go', { onclick: () => runPlaytest(ed) }, '▶ Playtest') : null;
  if (go) box.appendChild(go);
  box.appendChild(h('p.hint.pt-note', 'Playtests never touch saved games. In play, 🛠 Tools jumps anywhere and takes you back to edit the very square you stand on.'));
  function sync(chapterChanged) {
    const n = o.from === 'chapter' && o.chapter ? suggestLevel(game, o.chapter) : Math.max(1, game.settings.startLevel || 1);
    if (chapterChanged && !o.levelSet) { o.level = n; lvl.value = n; }
    sugg.dataset.n = n;
    sugg.textContent = o.level === n ? `suggested ✓` : `suggested: ${n}`;
    const ch = chs.find((c) => c.id === o.chapter);
    const i = chs.indexOf(ch);
    chHint.textContent = !ch ? '' : i <= 0 ? 'the first chapter: a fresh start' : `begins with the ${plural(chs.slice(0, i).reduce((t, c) => t + questsOfChapter(game, c).length, 0), 'quest')} before it done`;
    if (go) go.textContent = o.from === 'chapter' && ch ? `▶ Playtest chapter ${i + 1}` : o.from === 'here' ? `▶ Playtest from ${here.map.name}` : '▶ Playtest from the start';
  }
  sync(!o.levelSet);
  return box;
}

// The ▶ Playtest button in the top bar
export function playtestModal(ed) {
  modal(playtestForm(ed, { button: false }), {
    title: 'Playtest', icon: 'play', cls: 'pt-modal',
    buttons: [{ label: 'Cancel' }, { label: '▶ Playtest', primary: true, onClick: () => runPlaytest(ed) }],
  });
}

// ------------------------------------------------------------ the step
export function renderTest(ed, left, main) {
  const game = ed.game;
  ed.refreshBadges();
  const all = ed.allFindings || ed.findings || [];
  const ignoredN = all.filter((f) => f.ignored).length;
  const showIgn = !!ed.testShowIgnored && ignoredN > 0;
  const shown = all.filter((f) => showIgn || !f.ignored);
  const open = all.filter((f) => !f.ignored && f.level !== 'ok');
  const done = all.filter((f) => f.level === 'ok');
  const count = (lvl) => open.filter((f) => f.level === lvl).length;
  const scrollTop = main.scrollTop;
  clear(left);
  clear(main);

  // ---- left: the steps with their progress, and quick playtests
  left.appendChild(h('div.panel-title', '☑ Test'));
  left.appendChild(h('p.hint', 'What still needs work, step by step, and ways to try the realm out. Nothing here blocks you: fix things in any order.'));
  const areas = h('div.tl-areas');
  for (const [k, label] of AREAS) {
    const mine = all.filter((f) => f.area === k && !f.ignored);
    const ok = mine.filter((f) => f.level === 'ok').length, todo = mine.length - ok;
    const bad = mine.some((f) => f.level === 'error') ? '.bad' : mine.some((f) => f.level === 'warn') ? '.warn' : '';
    const frac = ok + todo ? ok / (ok + todo) : 1;
    areas.appendChild(h('button.tl-area' + bad, { onclick: () => main.querySelector(`#tc-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), title: `${label}: ${ok} done, ${todo} to do` },
      h('span.step-n', String(STEP_N[k])),
      h('span.tl-body', h('span.tl-name', label), h('span.tl-bar', h('i', { style: { width: `${Math.round(frac * 100)}%` } }))),
      h('span.tl-count', todo ? [h('b', String(todo)), ok ? h('small', ` ✓${ok}`) : null] : h('span.tl-tick', ok ? `✓ ${ok}` : '✓'))));
  }
  left.appendChild(areas);
  const here = lastSpot(ed);
  left.appendChild(h('div.tl-play',
    h('div.tl-head', '▶ Playtest'),
    h('button.primary', { onclick: () => runPlaytest(ed, { from: 'start' }) }, '▶ From the beginning'),
    h('button', { onclick: () => runPlaytest(ed, { from: 'here' }), title: `Start at ${here.map.name} ${here.x}, ${here.y}` }, `▶ From here: ${here.map.name}`),
    h('button.link', { onclick: () => main.querySelector('.pt-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'More ways to playtest…')));

  // ---- main: the summary, then each step's findings beside the playtest panels
  const total = open.length + done.length;
  const pct = total ? Math.round((done.length / total) * 100) : 100;
  const summary = open.length
    ? [count('error') ? h('span.tc-n.error', `⛔ ${count('error')} to fix`) : null, count('warn') ? h('span.tc-n.warn', `⚠ ${count('warn')} worth a look`) : null,
      count('todo') ? h('span.tc-n.todo', `○ ${count('todo')} still to do`) : null, h('span.tc-n.ok', `✓ ${done.length} done`)]
    : [h('span.tc-n.ok', `✓ Nothing left on the checklist — ${done.length} things done. Time for a long playtest!`)];
  const ignBtn = ignoredN ? h('button.small.tc-ign', { onclick: () => { ed.testShowIgnored = !showIgn; renderTest(ed, left, main); } }, showIgn ? 'Hide ignored' : `Show ignored (${ignoredN})`) : null;
  main.appendChild(h('div.tc-top',
    h('div.tc-title', h('h2', '☑ The checklist'), ignBtn),
    h('div.tc-summary', ...summary),
    h('div.tc-meter', { title: `${pct}% of the checklist done` }, h('i', { style: { width: pct + '%' } }))));
  const list = h('div.tc-list');
  for (const [k, label] of AREAS) list.appendChild(groupEl(ed, k, label, shown.filter((f) => f.area === k), all.filter((f) => f.area === k && f.ignored && !showIgn).length, () => renderTest(ed, left, main)));
  const side = h('div.tc-side',
    h('section.tc-card.pt-card', h('h3', '▶ Playtest'), playtestForm(ed)),
    coverageCard(ed, () => renderTest(ed, left, main)));
  main.appendChild(h('div.tc-grid', list, side));
  main.scrollTop = scrollTop;
}

function groupEl(ed, k, label, found, hidden, rerender) {
  const open = found.filter((f) => f.level !== 'ok').sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const done = found.filter((f) => f.level === 'ok');
  const g = h('section.tc-group', { id: `tc-${k}` });
  const counts = ['error', 'warn', 'todo'].map((l) => { const n = open.filter((f) => f.level === l && !f.ignored).length; return n ? h('span.tc-c.' + l, `${LEVELS[l][0]} ${n}`) : null; });
  g.appendChild(h('div.tc-ghead',
    h('span.step-n', String(STEP_N[k])), h('b', label), h('span.tc-counts', ...counts, done.length ? h('span.tc-c.ok', `✓ ${done.length}`) : null),
    k !== 'test' ? h('button.small.link', { onclick: () => ed.setTab(k) }, `Open ${label} →`) : null));
  if (!open.length && !done.length) g.appendChild(h('p.tc-clear', hidden ? `Nothing to do here · ${hidden} ignored` : 'Nothing to check here yet.'));
  for (const f of open) g.appendChild(itemEl(ed, f, rerender));
  if (done.length) {
    const d = h('details.tc-done', h('summary', open.length ? `✓ ${plural(done.length, 'thing')} done` : `✓ Nothing to do here · ${plural(done.length, 'thing')} done`));
    for (const f of done) d.appendChild(h('div.tc-item.ok', h('span.tc-ico', '✓'), h('span.tc-text', f.text)));
    g.appendChild(d);
  }
  return g;
}

function itemEl(ed, f, rerender) {
  const ign = new Set(ed.game.meta.checklistIgnore || []);
  const toggle = () => {
    const list = ed.game.meta.checklistIgnore = (ed.game.meta.checklistIgnore || []).filter((id) => id !== f.id);
    if (!ign.has(f.id)) list.push(f.id);
    ed.markDirty();
    rerender();
  };
  const [ico, word] = LEVELS[f.level];
  return h('div.tc-item.' + f.level + (f.ignored ? '.ignored' : ''), { title: f.ignored ? 'Ignored' : word },
    h('span.tc-ico', ico),
    h('span.tc-text', f.text),
    h('span.tc-acts',
      goButton(ed, f),
      h('button.small.tc-x', { onclick: toggle, title: f.ignored ? 'Put it back on the checklist' : 'Leave this off the checklist (for things you mean to be so)' }, f.ignored ? 'Restore' : 'Ignore')));
}

// Go → where the finding points; on the Test step itself, the list of what
// playtests have missed, or a playtest
function goButton(ed, f) {
  if (!f.go) return null;
  if (f.go.tab !== 'test' || f.go.map) return h('button.small.tc-go', { onclick: () => ed.goTo(f.go) }, 'Go →');
  const list = { 'test-visit': 'visit', 'test-quests': 'quests' }[f.id];
  if (list) {
    return h('button.small.tc-go', {
      onclick: () => { const d = ed.main.querySelector(`.cov-list[data-cov=${list}]`); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
    }, 'See ↓');
  }
  if (f.id === 'test-never' || f.id === 'test-stale') return h('button.small.tc-go', { onclick: () => runPlaytest(ed) }, '▶ Play');
  return null;
}

// What playtests so far have seen
function coverageCard(ed, rerender) {
  const game = ed.game;
  const cov = coverageOf(game);
  const card = h('section.tc-card.cov-card', h('h3', '🧭 What playtests have seen'));
  if (!cov?.last) {
    card.appendChild(h('p.hint', 'Nothing yet. Playtest the realm, and the places you visit, the quests you finish and the chapters you reach are marked here.'));
    return card;
  }
  card.appendChild(h('div.cov-line',
    h('span', `Last playtest ${ago(cov.last)}`), h('span', plural(cov.count || 1, 'playtest')),
    h('span', { title: 'Times the game was won' }, `🏆 ${cov.wins || 0}`), h('span', { title: 'Times the whole company fell' }, `☠ ${cov.defeats || 0}`)));
  const places = placesOf(game);
  const quests = game.quests || [];
  const chs = chapterList(game);
  const meter = (label, n, of) => h('div.cov-row', h('span.cov-l', label), h('span.cov-bar', h('i', { style: { width: of ? `${Math.round((n / of) * 100)}%` : '0' } })), h('b', `${n} / ${of}`));
  const seen = places.filter((p) => cov.visited[p.map.id]);
  const fin = quests.filter((q) => cov.quests[q.id] === 'done');
  card.appendChild(meter('Places visited', seen.length, places.length));
  card.appendChild(meter('Quests finished', fin.length, quests.length));
  if (chs.length) card.appendChild(meter('Chapters reached', chs.filter((c) => cov.chapters[c.id]).length, chs.length));
  const unseen = places.filter((p) => !cov.visited[p.map.id]);
  if (unseen.length) {
    const d = h('details.cov-list', { 'data-cov': 'visit' }, h('summary', `Never visited (${unseen.length})`));
    for (const p of unseen) d.appendChild(h('div.cov-item', h('span', p.map.name, h('small', ` ${FEATURE_KINDS[p.kind]?.label || p.kind}`)),
      h('button.small', { title: `Playtest from ${p.map.name}'s way in`, onclick: () => runPlaytest(ed, { from: 'place', place: p.map.id }) }, '▶')));
    card.appendChild(d);
  }
  const left = quests.filter((q) => cov.quests[q.id] !== 'done');
  if (left.length) {
    const d = h('details.cov-list', { 'data-cov': 'quests' }, h('summary', `Not yet finished (${left.length})`));
    for (const q of left) d.appendChild(h('div.cov-item', h('button.link', { onclick: () => ed.goTo({ tab: 'story', quest: q.id }) }, q.name || q.id),
      h('small.cov-tag' + (cov.quests[q.id] ? '.started' : ''), cov.quests[q.id] ? 'started' : 'never begun')));
    card.appendChild(d);
  }
  card.appendChild(h('div.row', h('button.small', {
    onclick: async () => {
      if (!(await confirmDialog('Forget what the playtests so far have seen? The checklist will count from the next one.'))) return;
      ed.checkpoint?.('Forget what playtests have seen');
      delete game.meta.playtest;
      ed.markDirty();
      rerender();
    },
  }, 'Forget and start counting afresh')));
  return card;
}
