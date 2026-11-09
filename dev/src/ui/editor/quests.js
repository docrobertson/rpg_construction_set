// Construction Set: the Quests tab, the inspector for events / points of
// interest, the event placing tool, and quest roles on the person inspector.
import { h, clear, confirmDialog } from '../dom.js';
import { buildForm } from './forms.js';
import { uniqueId, deepClone, uid, slugify } from '../../core/util.js';
import { inBounds } from '../../world/map.js';
import { GOAL_TYPES, describeGoal } from '../../game/quests.js';
import { chapterList, roman } from '../../game/story.js';
import { EVENT_TEMPLATES, EVENT_KINDS, BLESSINGS, REQS, eventFromTemplate } from '../../game/events.js';
import { questProblems } from '../../game/checklist.js';
import { cacheLook, isContainer } from '../../data/containers.js';
import { containerLookFields } from './containerFields.js';

const npcOptions = (game, emptyLabel) => () => {
  const out = emptyLabel ? [['', emptyLabel]] : [];
  for (const m of game.maps) for (const e of m.entities) if (e.type === 'npc') out.push([e.id, `${e.name || 'someone'} — ${m.name}`]);
  return out;
};
const itemOpts = (game) => () => game.items.map((i) => [i.id, i.name]);
const monsterOpts = (game) => () => game.monsters.map((m) => [m.id, `${m.name}${m.boss ? ' ★' : ''}`]);
const mapOpts = (game) => () => game.maps.map((m) => [m.id, `${m.name} (${m.type})`]);
const questOpts = (game) => () => (game.quests || []).map((q) => [q.id, q.name]);

function rewardFields(game, prefix) {
  return [
    { key: prefix + 'gold', label: 'Gold', type: 'number', min: 0 },
    { key: prefix + 'xp', label: 'Experience (each hero)', type: 'number', min: 0 },
    { key: prefix + 'food', label: 'Food', type: 'number', min: 0 },
    { key: prefix + 'items', label: 'Items', type: 'itemlist', options: itemOpts(game) },
    { key: prefix + 'flag', label: 'Sets story flag(s)', type: 'text', placeholder: 'e.g. hero_of_brookend' },
  ];
}

export function stageFields(game, q) {
  const gt = (s) => s.goal?.type || 'talk';
  return [
    { key: 'goal.type', label: 'Goal', type: 'select', options: Object.entries(GOAL_TYPES), rerender: true },
    { key: 'goal.npc', label: 'Person', type: 'select', options: npcOptions(game, '— the quest giver —'), show: (s) => gt(s) === 'talk' || gt(s) === 'deliver' },
    { key: 'goal.npc', label: 'Person', type: 'select', options: npcOptions(game), empty: '— choose someone —', show: (s) => gt(s) === 'companion', hint: 'Someone who can join the company (tick “Can JOIN the party” in their inspector, or use the Companion beat on the Story step). Done while they are with the company.' },
    { key: 'goal.map', label: 'On the map', type: 'select', options: mapOpts(game), empty: '— anywhere —', nullable: true, show: (s) => gt(s) === 'companion', hint: 'Optional: they must be with the company here (“Bring Elwen to the Barrow”).' },
    { key: 'goal.item', label: 'Item', type: 'select', options: itemOpts(game), show: (s) => gt(s) === 'deliver' || gt(s) === 'collect' },
    { key: 'goal.monster', label: 'Monster', type: 'select', options: monsterOpts(game), show: (s) => gt(s) === 'kill', hint: 'A unique boss (★) is defeated once; for common monsters set how many.' },
    { key: 'goal.n', label: 'How many', type: 'number', min: 1, show: (s) => ['deliver', 'collect', 'kill'].includes(gt(s)) },
    { key: 'goal.map', label: 'Map', type: 'select', options: mapOpts(game), empty: '— anywhere —', nullable: true, show: (s) => ['reach', 'clear', 'kill', 'collect', 'flag'].includes(gt(s)), hint: 'For kill / find / flag goals this only helps the tracker point the way.' },
    { key: 'goal.x', label: 'At X', type: 'number', nullable: true, show: (s) => gt(s) === 'reach', hint: 'Leave blank: reaching the map is enough.' },
    { key: 'goal.y', label: 'At Y', type: 'number', nullable: true, show: (s) => gt(s) === 'reach' },
    { key: 'goal.r', label: 'Within (tiles)', type: 'number', min: 0, nullable: true, show: (s) => gt(s) === 'reach' && s.goal?.x != null },
    { key: 'goal.flags', label: 'Flags', type: 'text', placeholder: 'verse_1, verse_2', show: (s) => gt(s) === 'flag', hint: 'All must be set. Chests, monsters, events and conversations can set flags.' },
    { key: 'text', label: 'Shown to the player', type: 'text', placeholder: describeGoal(game, q, { type: 'talk' }), hint: 'Say where to go: “Speak to Captain Hale in Westhold”.' },
    { key: 'say', label: 'They say', type: 'textarea', rows: 3, show: (s) => gt(s) === 'talk' || gt(s) === 'deliver', hint: 'Spoken when the party arrives — tell the story and point to the next step.' },
    { key: 'log', label: 'Message when done', type: 'text', show: (s) => !['talk', 'deliver'].includes(gt(s)) },    { type: 'section', label: 'Reward for this step' },
    ...rewardFields(game, 'reward.').filter((f) => f.key !== 'reward.food'),
  ];
}

const chapterOpts = (game) => () => chapterList(game).map((c, i) => [c.id, `${roman(i + 1)} · ${c.name || 'Chapter'}`]);

export function questFields(game, q) {
  return [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'chapter', label: 'Chapter', type: 'select', options: chapterOpts(game), empty: '— none: open at any time —', nullable: true, rerender: true,
      hint: 'It is not offered, and does not start by itself, until its chapter opens.' },
    { key: 'main', label: 'Main quest (shown first, marked ★)', type: 'check' },
    { key: 'giver', label: 'Given by', type: 'select', options: npcOptions(game, '— nobody —'), hint: 'People with a quest to offer are marked “!” and offer it when spoken to. With nobody, tick “Starts by itself” or start it from a conversation or event.' },
    { key: 'auto', label: 'Starts by itself', type: 'check', rerender: true, hint: 'At the start of the game, or as soon as the quest below is finished.' },
    { key: 'requires', label: 'Only after finishing', type: 'select', options: questOpts(game), empty: '— nothing —', nullable: true },
    { key: 'offer', label: 'Offer', type: 'textarea', rows: 3, hint: 'What the giver says when offering the quest.', show: (o) => !!o.giver && !o.auto },
    { key: 'accept', label: 'Reply on accepting', type: 'text', show: (o) => !!o.giver && !o.auto },
    { key: 'summary', label: 'Journal summary', type: 'textarea', rows: 2 },
    { key: 'startItems', label: 'Items given on accepting', type: 'itemlist', options: itemOpts(game) },
    { type: 'section', label: 'Steps' },
    { key: 'stages', label: 'Steps (in order)', type: 'list', wide: true, fields: stageFields(game, q),
      rowLabel: (s, i) => `${i + 1}. ${s.text || describeGoal(game, q, s.goal) || GOAL_TYPES[s.goal?.type] || 'Step'}`,
      newRow: () => ({ text: '', goal: { type: 'talk', npc: '' } }), addLabel: '+ Add step' },
    { type: 'section', label: 'Reward on completion' },
    ...rewardFields(game, 'reward.'),
    { key: 'doneText', label: 'Journal note when finished', type: 'textarea', rows: 2 },
    { key: 'thanks', label: 'Giver\'s greeting afterwards', type: 'text', show: (o) => !!o.giver, placeholder: 'Ye saved my flock! The lambs are safe.', hint: 'Replaces their usual greeting once the quest is done, so they do not still ask for help.' },
  ];
}

// An id still made from the name ("a_new_quest", "a_new_quest_2") follows the name
const idFromName = (name, id) => !!id && (id === slugify(name) || new RegExp('^' + slugify(name) + '_\\d+$').test(id));

// Give a quest a new id and mend everything that points at it
export function renameQuestId(game, from, to) {
  if (!from || from === to) return;
  const q = (game.quests || []).find((x) => x.id === from);
  if (q) q.id = to;
  const fix = (o, key) => { if (o && o[key] === from) o[key] = to; };
  for (const x of game.quests || []) fix(x, 'requires');
  for (const c of chapterList(game)) fix(c.ends, 'quest');
  for (const m of game.maps) for (const e of m.entities || []) {
    fix(e.recruit, 'after');
    for (const c of e.choices || []) { fix(c.effects, 'quest'); fix(c.failEffects, 'quest'); if (['quest', 'questdone'].includes(c.req?.type)) fix(c.req, 'value'); }
    for (const k of e.keywords || []) {
      if (['start_quest', 'advance_quest', 'complete_quest'].includes(k.action?.type)) fix(k.action, 'value');
      if (['quest', 'questdone', 'noquest'].includes(k.cond?.type)) fix(k.cond, 'value');
    }
  }
}

// (questProblems lives with the checklist, which looks the whole realm over)
export { questProblems };

function warnBox(game, q) {
  const list = questProblems(game, q);
  if (!list.length) return h('div.ed-warns-none');
  return h('div.ed-warns', h('b', '⚠ This quest cannot be played as it is:'), h('ul', ...list.map((t) => h('li', t))));
}

export function newQuest(game, props = {}) {
  const q = {
    name: 'A New Quest', giver: '', main: false, auto: false, offer: 'I have a task for thee, if thou art brave enough.', accept: 'Thank thee!',
    summary: '', stages: [{ text: '', goal: { type: 'talk', npc: '' } }], reward: { gold: 50, xp: 50, items: [] }, ...props,
  };
  q.id = uniqueId(q.name, (game.quests || []).map((x) => x.id));
  q.stages[0].text = q.giver ? describeGoal(game, q, { type: 'talk', npc: '' }).replace('Speak to', 'Return to') : '';
  return q;
}

// ------------------------------------------------------------ the Quests tab
export class QuestEditor {
  constructor(ed, left, main) { this.ed = ed; this.left = left; this.main = main; this.sel = null; }

  select(q) { this.sel = q; this.render(); }

  render() {
    const game = this.ed.game;
    if (!Array.isArray(game.quests)) game.quests = [];
    const list = game.quests;
    if (!list.includes(this.sel)) this.sel = list[0] || null;
    clear(this.left);
    this.left.appendChild(h('div.panel-title', '📜 Quests'));
    this.left.appendChild(h('p.hint', 'Give your heroes goals: people who ask for help, places to find, foes to defeat. The player always sees the current step.'));
    const ul = h('div.entry-list');
    for (const q of list) {
      ul.appendChild(h('button.entry' + (q === this.sel ? '.on' : ''), { onclick: () => this.select(q) },
        (q.main ? '★ ' : '') + (q.name || q.id), h('span.tag', `${(q.stages || []).length} step${(q.stages || []).length === 1 ? '' : 's'}`)));
    }
    this.left.appendChild(ul);
    this.left.appendChild(h('div.row',
      h('button.small', { onclick: () => { const q = newQuest(game); list.push(q); this.ed.markDirty(); this.select(q); } }, '+ New'),
      this.sel ? h('button.small', {
        onclick: () => { const q = deepClone(this.sel); q.name += ' II'; q.id = uniqueId(q.name, list.map((x) => x.id)); list.push(q); this.ed.markDirty(); this.select(q); },
      }, 'Duplicate') : null,
      this.sel ? h('button.small.danger', {
        onclick: async () => {
          if (!(await confirmDialog(`Delete the quest “${this.sel.name}”?`))) return;
          list.splice(list.indexOf(this.sel), 1); this.ed.markDirty(); this.sel = null; this.render();
        },
      }, 'Delete') : null));
    clear(this.main);
    const q = this.sel;
    if (!q) { this.main.appendChild(h('p.hint', 'No quests yet. Click “+ New” to write one.')); return; }
    this.renderForm(q, this.main, {
      onName: () => { const btn = this.left.querySelector('.entry.on'); if (btn) btn.firstChild.textContent = (q.main ? '★ ' : '') + q.name; },
    });
  }

  // The quest's form (head, warnings, fields) into a panel. hooks:
  // { onName(q), onChange(key), before: element shown under the head }
  renderForm(q, main, hooks = {}) {
    const game = this.ed.game;
    const list = game.quests;
    const code = h('code', { title: 'The quest\'s id: conversations and events refer to it. It follows the name until you rename it by hand elsewhere.' }, q.id);
    main.appendChild(h('div.db-head', h('h2', `📜 ${q.name}`), code, hooks.actions || null));
    if (hooks.before) main.appendChild(hooks.before);
    let warns = warnBox(game, q);
    main.appendChild(warns);
    let prevName = q.name;
    main.appendChild(buildForm(q, questFields(game, q), (k) => {
      this.ed.markDirty();
      for (const s of q.stages || []) if (!s.text && s.goal) s.text = describeGoal(game, q, s.goal);
      if (k === 'name') {
        // a made-up id ("a_new_quest") follows the new name; references follow it
        if (idFromName(prevName, q.id)) {
          renameQuestId(game, q.id, uniqueId(q.name, list.filter((x) => x !== q).map((x) => x.id)));
          code.textContent = q.id;
        }
        prevName = q.name;
        const hd = main.querySelector('.db-head h2');
        if (hd) hd.textContent = `📜 ${q.name}`;
        hooks.onName?.(q);
      }
      const nw = warnBox(game, q);
      warns.replaceWith(nw);
      warns = nw;
      hooks.onChange?.(k);
    }));
  }
}

// ------------------------------------------------------------ events on the map
export function choiceFields(game) {
  const rt = (c) => c.req?.type || 'none';
  const reqOptions = (c) => {
    switch (rt(c)) {
      case 'class': return () => game.classes.map((k) => [k.id, k.name]);
      case 'race': return () => game.races.map((r) => [r.id, r.name]);
      case 'item': return itemOpts(game);
      case 'quest': case 'questdone': return questOpts(game);
      default: return null;
    }
  };
  const reqSel = (type) => ({ key: 'req.value', label: 'Which', type: 'select', options: () => reqOptions({ req: { type } })(), show: (c) => rt(c) === type });
  return [
    { key: 'label', label: 'Choice', type: 'text', placeholder: 'Kneel and pray' },
    { key: 'leave', label: 'Leaves (nothing happens)', type: 'check' },
    { key: 'req.type', label: 'Only if', type: 'select', options: Object.entries(REQS), rerender: true, show: (c) => !c.leave },
    reqSel('class'), reqSel('race'), reqSel('item'), reqSel('quest'), reqSel('questdone'),
    { key: 'req.value', label: 'Value', type: 'text', placeholder: 'flag name, gold, or str:15', show: (c) => !c.leave && ['gold', 'flag', 'noflag', 'stat'].includes(rt(c)) },
    { key: 'cost.gold', label: 'Costs gold', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'cost.food', label: 'Costs food', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'cost.item', label: 'Uses up item', type: 'select', options: itemOpts(game), empty: '— nothing —', nullable: true, show: (c) => !c.leave },
    { key: 'chance', label: 'Chance of success', type: 'number', step: 0.05, min: 0, max: 1, nullable: true, show: (c) => !c.leave, hint: 'Blank = always works.' },
    { key: 'text', label: 'What happens', type: 'textarea', rows: 2, show: (c) => !c.leave, hint: '{who} is replaced by the hero who qualifies.' },
    { type: 'section', label: 'Outcome', show: (c) => !c.leave },
    { key: 'effects.gold', label: 'Gold', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'effects.xp', label: 'Experience (each hero)', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'effects.food', label: 'Food', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'effects.items', label: 'Items', type: 'itemlist', options: itemOpts(game), show: (c) => !c.leave },
    { key: 'effects.heal', label: 'Heal', type: 'text', placeholder: 'full or 2d6', show: (c) => !c.leave },
    { key: 'effects.rest', label: 'A safe night\'s rest (full health and mana)', type: 'check', show: (c) => !c.leave },
    { key: 'effects.blessing', label: 'Blessing', type: 'select', options: [...Object.entries(BLESSINGS).map(([k, b]) => [k, `${b.name} — ${b.desc}`]), ['random', 'One at random']], empty: '— none —', nullable: true, show: (c) => !c.leave, rerender: true },
    { key: 'effects.turns', label: 'Blessing lasts (turns)', type: 'number', min: 10, show: (c) => !c.leave && !!c.effects?.blessing },
    { key: 'effects.lore', label: 'Record the text in the journal', type: 'check', show: (c) => !c.leave },
    { key: 'effects.flag', label: 'Sets story flag', type: 'text', show: (c) => !c.leave },
    { key: 'effects.quest', label: 'Starts quest', type: 'select', options: questOpts(game), empty: '— none —', nullable: true, show: (c) => !c.leave },
    { key: 'effects.reveal', label: 'Reveals the land around (tiles)', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'effects.reset', label: 'Rolls the boulders of group back home', type: 'text', placeholder: 'e.g. rocks1', show: (c) => !c.leave }, // (puzzles)
    { key: 'effects.fortune', label: 'A fortune: shows an unfound place, a hoard or a great beast', type: 'check', show: (c) => !c.leave },
    { key: 'effects.fairy', label: 'Fairy magic (something unpredictable)', type: 'select', options: [['wild', 'Wild: good or mischief'], ['kind', 'Kind: only good things']], empty: '— none —', nullable: true, show: (c) => !c.leave },
    { key: 'effects.ship', label: 'Builds and sells the ship (her name and price are set above)', type: 'check', show: (c) => !c.leave },
    { key: 'effects.fight', label: 'Then fight', type: 'select', options: monsterOpts(game), empty: '— no fight —', nullable: true, show: (c) => !c.leave, rerender: true },
    { key: 'effects.count', label: 'How many', type: 'text', placeholder: '1 or 2-4', show: (c) => !c.leave && !!c.effects?.fight },
    { type: 'section', label: 'Prize for winning the fight', show: (c) => !c.leave && !!c.effects?.fight },
    { key: 'win.text', label: 'Said on winning', type: 'text', show: (c) => !c.leave && !!c.effects?.fight },
    { key: 'win.gold', label: 'Gold', type: 'number', min: 0, show: (c) => !c.leave && !!c.effects?.fight },
    { key: 'win.xp', label: 'Experience (each hero)', type: 'number', min: 0, show: (c) => !c.leave && !!c.effects?.fight },
    { key: 'win.items', label: 'Items', type: 'itemlist', options: itemOpts(game), show: (c) => !c.leave && !!c.effects?.fight },
    { key: 'win.flag', label: 'Sets story flag', type: 'text', show: (c) => !c.leave && !!c.effects?.fight, hint: '{id} stands for this event\'s id.' },
    { type: 'section', label: 'When it is offered', show: (c) => !c.leave },
    { key: 'hideFlag', label: 'No longer offered once flag is set', type: 'text', show: (c) => !c.leave, hint: 'e.g. a bout already won. {id} stands for this event\'s id.' },
    { key: 'lockedText', label: 'Why it can\'t be chosen yet', type: 'text', show: (c) => !c.leave && c.req?.type && c.req.type !== 'none' },
    { type: 'section', label: 'If it fails', show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failText', label: 'What happens instead', type: 'textarea', rows: 2, show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failEffects.hurt', label: 'Hurts each hero', type: 'dice', placeholder: '1d6', show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failEffects.poison', label: 'Poison', type: 'check', show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failEffects.fight', label: 'Fight', type: 'select', options: monsterOpts(game), empty: '— no fight —', nullable: true, show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
  ];
}

const sellsShipHere = (o) => o.kind === 'shipyard' || (o.choices || []).some((c) => c.effects?.ship);

export function eventFields(game) {
  return [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'kind', label: 'Looks like', type: 'select', options: Object.entries(EVENT_KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`]), rerender: true },
    // (containers) a hidden cache drawn as what it is: a cart, a loose flagstone…
    ...containerLookFields((o) => { const k = cacheLook(o)?.kind; return { kind: k || 'chest', why: k ? 'from its words' : '' }; },
      { label: 'Drawn as', show: (o) => o.kind === 'cache' || isContainer(o.look?.kind), hint: 'What the cache is found in. Automatic picks it from the name or description ("Overturned Cart", "beneath a loose flagstone").' }),
    { key: 'text', label: 'Description', type: 'textarea', rows: 4, hint: 'Shown when the party bumps into it.' },
    { key: 'repeat', label: 'Can be used', type: 'select', options: [['once', 'Once (then it is gone)'], ['daily', 'Once a day'], ['always', 'Any time']], rerender: true },
    { key: 'cooldown', label: 'Turns between uses', type: 'number', min: 10, show: (o) => o.repeat === 'daily', hint: 'A day is 300 turns.' },
    // a shipyard sells a ship: a choice that "builds and sells the ship" pays for her
    { type: 'section', label: 'The ship for sale', show: sellsShipHere },
    { type: 'info', label: 'Once paid for, she is moored in the nearest open water beside this place (or at the square below), ready to board. Each ship is sold once.', show: sellsShipHere },
    { key: 'ship.name', label: 'Ship\'s name', type: 'text', placeholder: 'Seahorse', show: sellsShipHere },
    { key: 'ship.price', label: 'Price (gold)', type: 'number', min: 0, placeholder: '450', show: sellsShipHere },
    { key: 'ship.x', label: 'Moored at X (world map)', type: 'number', nullable: true, show: sellsShipHere, hint: 'Blank: beside this place.' },
    { key: 'ship.y', label: 'Moored at Y (world map)', type: 'number', nullable: true, show: sellsShipHere },
    { type: 'section', label: 'Choices' },
    { key: 'choices', label: 'Choices', type: 'list', wide: true, fields: choiceFields(game), rowLabel: (c, i) => `${i + 1}. ${c.label || '(choice)'}`, newRow: () => ({ label: 'Do something', text: '', effects: {} }), addLabel: '+ Add choice' },
  ];
}

export function inspectEvent(ed, ent, container, head, changed) {
  container.appendChild(head(`${EVENT_KINDS[ent.kind]?.icon || '❔'} ${ent.name || 'Event'}`, `at ${ent.x}, ${ent.y}`));
  container.appendChild(buildForm(ent, eventFields(ed.game), (k) => { if (k === 'kind') ed.refreshEntity(ent); changed(); }));
}

// People: the quests they give, and a shortcut to write one
export function npcQuestSection(ed, ent) {
  const game = ed.game;
  const gives = (game.quests || []).filter((q) => q.giver === ent.id);
  const involved = (game.quests || []).filter((q) => q.giver !== ent.id && (q.stages || []).some((s) => s.goal?.npc === ent.id));
  return h('div.form',
    h('div.form-section', 'Quests'),
    gives.length ? h('p.hint', 'Offers: ') : h('p.hint', 'Offers no quest.'),
    ...gives.map((q) => h('button.small.link', { onclick: () => openQuest(ed, q) }, '📜 ' + q.name)),
    involved.length ? h('p.hint', 'Part of: ') : null,
    ...involved.map((q) => h('button.small.link', { onclick: () => openQuest(ed, q) }, '📜 ' + q.name)),
    h('div.row', h('button.small', {
      onclick: () => {
        const q = newQuest(game, { giver: ent.id, name: `${ent.name || 'A'}'s Request` });
        q.id = uniqueId(q.name, game.quests.map((x) => x.id));
        game.quests.push(q);
        ed.markDirty();
        openQuest(ed, q);
      },
    }, '+ New quest from this person')));
}

function openQuest(ed, q) {
  ed.setTab('quests');
  ed.questEd?.select(q);
}

// The map tool that places an event from a template
export const EVENT_TOOL = {
  label: 'Event', icon: '✨', cursor: 'tile',
  hint: 'Place a point of interest — a shrine, a campfire, a windmill, a ruined chapel — or a little event with choices. Pick the kind below; edit everything in the inspector.',
  down(ed, t) {
    if (!inBounds(ed.map, t.x, t.y)) return;
    const existing = ed.entityAt(t.x, t.y);
    if (existing && existing.type !== 'portal') { ed.select(existing); return; }
    const ent = { ...eventFromTemplate(ed.eventTemplate || 'shrine_might'), id: uid('ev'), x: t.x, y: t.y };
    ed.beginEdit();
    ed.map.entities.push(ent);
    ed.refreshEntities();
    ed.select(ent);
    ed.markDirty();
  },
};

export function eventTemplatePicker(ed) {
  // filed by kind of place: the wayside first, then the countryside's
  const groups = new Map();
  for (const [k, t] of Object.entries(EVENT_TEMPLATES)) {
    const g = EVENT_KINDS[t.kind]?.group || 'Wayside and wonders';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(h('option', { value: k }, `${EVENT_KINDS[t.kind]?.icon || ''} ${t.name}`));
  }
  const sel = h('select', { title: 'What the Event tool places' }, ...[...groups].map(([g, opts]) => h('optgroup', { label: g }, ...opts)));
  sel.value = ed.eventTemplate || 'shrine_might';
  sel.addEventListener('change', () => { ed.eventTemplate = sel.value; ed.setTool('event'); });
  return sel;
}
