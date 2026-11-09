// (company) The Story step's mysteries: who is suspected, who did it, the
// clues (story flags something in the realm sets) and who hears the
// accusation. Drawn into the StoryEditor (story.js): a list under the
// chapters on the left, and a mystery's page in the main panel.
import { h, confirmDialog } from '../dom.js';
import { buildForm } from './forms.js';
import { uniqueId } from '../../core/util.js';
import { portrait } from '../../render/portrait.js';
import { mysteriesOf, peopleOptions, findNpc, cluesNeeded } from '../../game/company.js';
import { mysteryProblems } from '../../game/checklist.js';
import { flagDatalist } from './flagList.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function newMystery(game) {
  const ids = mysteriesOf(game).map((m) => m.id);
  return {
    id: uniqueId('mystery', ids), name: 'A New Mystery', intro: '',
    suspects: [], culprit: '', clues: [], need: 2, judge: '',
    right: { text: 'The truth is out at last, and justice will be done.', flag: '', reward: { gold: 0, xp: 0 } },
    wrong: { text: 'That is not the one. Thou hast shamed an honest soul.', flag: '' },
  };
}

// left: the mysteries under the chapters
export function mysteryList(se, L) {
  const game = se.game, v = se.view;
  const list = mysteriesOf(game);
  const box = h('div.st-tree.st-myst');
  box.appendChild(h('div.st-mysthead', h('span', '🔎 Mysteries'), h('button.small', { title: 'A whodunit: suspects, a culprit, clues to find and a judge to accuse to', onclick: () => addMystery(se) }, '+ Add mystery')));
  if (!list.length) box.appendChild(h('div.st-empty', 'None yet: a crime, suspects and clues'));
  for (const my of list) {
    const bad = mysteryProblems(game, my).filter((p) => p.level !== 'todo').length;
    const b = h('button.entry.st-q' + (v.kind === 'mystery' && v.id === my.id ? '.on' : ''), { onclick: () => se.selectMystery(my.id), title: my.intro || '' },
      `🔎 ${my.name || my.id}`, h('span.tag', plural((my.clues || []).length, 'clue')));
    if (bad) b.classList.add('bad');
    box.appendChild(b);
  }
  L.appendChild(box);
}

function addMystery(se) {
  const game = se.game;
  if (!Array.isArray(game.mysteries)) game.mysteries = [];
  const my = newMystery(game);
  game.mysteries.push(my);
  se.ed.markDirty();
  se.selectMystery(my.id);
  setTimeout(() => { const el = se.main.querySelector('.form input[type=text]'); if (el) { el.focus(); el.select(); } }, 30);
}

// main: one mystery
export function renderMystery(se, my) {
  const game = se.game, M = se.main, ed = se.ed;
  my.suspects ||= []; my.clues ||= []; my.right ||= {}; my.wrong ||= {};
  flagDatalist(game);
  const title = h('h2', my.name || 'A mystery');
  M.appendChild(h('div.st-head',
    h('div.st-head-l', h('div.st-kicker', 'Mystery'), title),
    h('div.st-head-r', h('button.small.danger', { onclick: async () => {
      if (!(await confirmDialog(`Delete the mystery “${my.name}”?`))) return;
      ed.checkpoint?.(`deleting ${my.name || 'a mystery'}`);
      game.mysteries.splice(game.mysteries.indexOf(my), 1);
      ed.markDirty();
      se.view = null; se.render();
    } }, 'Delete'))));
  M.appendChild(h('p.hint', 'Clues are story flags: anything that sets one — a conversation, an event\'s choice, a chest, a puzzle — finds the clue, and the journal\'s Mysteries page writes it down. Once enough are found, the company may say ACCUSE to the judge (or press Accuse on the page, standing by them) and pick a suspect. A wrong name costs what you say below, and the company may try again once it finds another clue (or at once, if it has them all) — unless the first wrong answer is final.'));
  const probs = mysteryProblems(game, my);
  if (probs.length) M.appendChild(h('div.ed-warns', h('b', '⚠ This mystery needs a look:'), h('ul', ...probs.map((p) => h('li', p.text[0].toUpperCase() + p.text.slice(1))))));

  // the suspects as the player will see them
  const cast = h('div.my-suspects.ed-suspects');
  const drawCast = () => {
    cast.replaceChildren(...(my.suspects || []).filter(Boolean).map((id) => {
      const f = findNpc(game, id);
      let pic = '';
      try { pic = f ? portrait(ed.view, f.npc.look || { kind: 'humanoid', race: 'human' }) : ''; } catch { /* no picture */ }
      return h('div.my-suspect' + (id === my.culprit ? '.guilty' : ''), { title: f ? `${f.npc.desc || ''} (${f.map.name})` : 'No longer in the realm' },
        h('span.acc-pic', pic ? h('img', { src: pic, alt: '' }) : null),
        h('b', f?.npc.name || '(gone)'),
        id === my.culprit ? h('small.tag-guilty', 'Guilty') : h('small', f?.map.name || ''),
        f ? h('button.small', { title: 'Show them on the map (Details)', onclick: () => ed.goTo({ tab: 'map', map: f.map.id, entity: id }) }, '📍') : null);
    }));
    if (!cast.children.length) cast.appendChild(h('p.hint', 'No suspects yet: add them below.'));
  };
  drawCast();
  M.appendChild(h('div.st-section', h('h3.st-h', 'Suspects', h('span.st-h-note', 'As the journal shows them. The guilty one is marked here only.')), cast));

  const people = () => peopleOptions(game);
  const fields = [
    { key: 'name', label: 'Name', type: 'text', placeholder: 'The Poisoned Chalice' },
    { key: 'need', label: 'Clues before an accusation', type: 'number', min: 0, max: 20, placeholder: '2' },
    { key: 'intro', label: 'What happened', type: 'textarea', rows: 3, placeholder: 'The harbour-master lies dead in his chair, his wine cup still warm…', hint: 'The journal\'s Mysteries page opens with this.' },
    { key: 'suspects', label: 'Suspects', type: 'ids', options: people, hint: 'People the company may accuse. Each should be someone they can meet.' },
    { key: 'culprit', label: 'The guilty one', type: 'select', options: (o) => (o.suspects || []).filter(Boolean).map((id) => [id, findNpc(game, id)?.npc.name || id]), empty: '— choose one of the suspects —' },
    { key: 'judge', label: 'Judge', type: 'select', options: people, empty: '— nobody yet —', hint: 'The one the company accuses to: say ACCUSE to them.' },
    { key: 'opens', label: 'Shown in the journal once', type: 'text', list: 'cs-flags', placeholder: 'e.g. heard_of_murder', hint: 'Story flags (blank: once the first clue is found).' },
    { key: 'clues', label: 'Clues', type: 'list', wide: true, addLabel: '+ Add a clue', newRow: () => ({ flag: '', text: '' }),
      rowLabel: (r, i) => `${i + 1}. ${r.flag || '(no flag yet)'}`,
      fields: [
        { key: 'flag', label: 'Found when this flag is set', type: 'text', list: 'cs-flags', placeholder: 'e.g. saw_muddy_boots' },
        { key: 'text', label: 'Written in the journal', type: 'textarea', rows: 2, placeholder: 'Muddy boots by the cellar door — and the cook swears she never left the kitchen.' },
      ] },
    { type: 'section', label: 'The right name' },
    { key: 'right.text', label: 'The judge says', type: 'textarea', rows: 2 },
    { key: 'right.flag', label: 'Sets story flag', type: 'text', list: 'cs-flags', placeholder: 'e.g. murder_solved' },
    { key: 'right.reward.gold', label: 'Reward: gold', type: 'number', min: 0 },
    { key: 'right.reward.xp', label: 'Reward: experience (each hero)', type: 'number', min: 0 },
    { key: 'right.reward.items', label: 'Reward: items', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]) },
    { type: 'section', label: 'A wrong name' },
    { key: 'wrong.text', label: 'The judge says', type: 'textarea', rows: 2 },
    { key: 'wrong.flag', label: 'Sets story flag', type: 'text', list: 'cs-flags', placeholder: 'e.g. accused_wrongly' },
    { key: 'wrong.effects.loseGold', label: 'Costs gold (a fine)', type: 'number', min: 0 },
    { key: 'wrong.effects.hurt', label: 'Hurts the company', type: 'text', placeholder: 'e.g. 1d6' },
    { key: 'wrong.effects.fight', label: 'Then fight', type: 'select', options: () => game.monsters.map((m) => [m.id, m.name]), empty: '— no fight —', nullable: true, rerender: true, hint: 'The wronged one\'s friends take it badly…' },
    { key: 'wrong.effects.count', label: 'How many', type: 'text', placeholder: '1 or 2-4', show: (o) => !!o.wrong?.effects?.fight },
    { key: 'wrong.final', label: 'One chance only: a wrong name closes the mystery for good', type: 'check', hint: 'Off: the company may accuse again after finding another clue. Make sure the story goes on either way.' },
  ];
  const form = buildForm(my, fields, (k) => {
    ed.markDirty();
    if (k === 'name') { title.textContent = my.name || 'A mystery'; return; }
    if (k === 'suspects' || k === 'culprit') drawCast();
    // the checks and the list on the left follow a new choice of people
    // (not typing: that would steal the cursor)
    if (k === 'suspects' || k === 'culprit' || k === 'judge') { const top = M.scrollTop; se.render(); M.scrollTop = top; }
  });
  const need = cluesNeeded(my);
  M.appendChild(h('div.st-section.st-myform', h('p.hint.my-sum', `${plural((my.clues || []).length, 'clue')} to find; the company may accuse after ${plural(need, 'clue')}.`), form));
}
