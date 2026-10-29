// Construction Set: the Quests tab, the inspector for events / points of
// interest, the event placing tool, and quest roles on the person inspector.
import { h, clear, confirmDialog } from '../dom.js';
import { buildForm } from './forms.js';
import { uniqueId, deepClone, uid } from '../../core/util.js';
import { inBounds } from '../../world/map.js';
import { GOAL_TYPES, describeGoal } from '../../game/quests.js';
import { EVENT_TEMPLATES, EVENT_KINDS, BLESSINGS, REQS, eventFromTemplate } from '../../game/events.js';

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
    { key: 'log', label: 'Message when done', type: 'text', show: (s) => !['talk', 'deliver'].includes(gt(s)) },
    { type: 'section', label: 'Reward for this step' },
    ...rewardFields(game, 'reward.').filter((f) => f.key !== 'reward.food'),
  ];
}

export function questFields(game, q) {
  return [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'main', label: 'Main quest (shown first, marked ★)', type: 'check' },
    { key: 'giver', label: 'Given by', type: 'select', options: npcOptions(game, '— nobody (starts by itself) —'), hint: 'People with a quest to offer are marked “!” and offer it when spoken to.' },
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
  ];
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
    this.main.appendChild(h('div.db-head', h('h2', `📜 ${q.name}`), h('code', q.id)));
    this.main.appendChild(buildForm(q, questFields(game, q), (k) => {
      this.ed.markDirty();
      for (const s of q.stages || []) if (!s.text && s.goal) s.text = describeGoal(game, q, s.goal);
      if (k === 'name') {
        const hd = this.main.querySelector('.db-head h2');
        if (hd) hd.textContent = `📜 ${q.name}`;
        const btn = this.left.querySelector('.entry.on');
        if (btn) btn.firstChild.textContent = (q.main ? '★ ' : '') + q.name;
      }
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
    { key: 'effects.blessing', label: 'Blessing', type: 'select', options: Object.entries(BLESSINGS).map(([k, b]) => [k, `${b.name} — ${b.desc}`]), empty: '— none —', nullable: true, show: (c) => !c.leave, rerender: true },
    { key: 'effects.turns', label: 'Blessing lasts (turns)', type: 'number', min: 10, show: (c) => !c.leave && !!c.effects?.blessing },
    { key: 'effects.lore', label: 'Record the text in the journal', type: 'check', show: (c) => !c.leave },
    { key: 'effects.flag', label: 'Sets story flag', type: 'text', show: (c) => !c.leave },
    { key: 'effects.quest', label: 'Starts quest', type: 'select', options: questOpts(game), empty: '— none —', nullable: true, show: (c) => !c.leave },
    { key: 'effects.reveal', label: 'Reveals the land around (tiles)', type: 'number', min: 0, show: (c) => !c.leave },
    { key: 'effects.fight', label: 'Then fight', type: 'select', options: monsterOpts(game), empty: '— no fight —', nullable: true, show: (c) => !c.leave, rerender: true },
    { key: 'effects.count', label: 'How many', type: 'text', placeholder: '1 or 2-4', show: (c) => !c.leave && !!c.effects?.fight },
    { type: 'section', label: 'If it fails', show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failText', label: 'What happens instead', type: 'textarea', rows: 2, show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failEffects.hurt', label: 'Hurts each hero', type: 'dice', placeholder: '1d6', show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failEffects.poison', label: 'Poison', type: 'check', show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
    { key: 'failEffects.fight', label: 'Fight', type: 'select', options: monsterOpts(game), empty: '— no fight —', nullable: true, show: (c) => !c.leave && c.chance != null && c.chance !== '' && +c.chance < 1 },
  ];
}

export function eventFields(game) {
  return [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'kind', label: 'Looks like', type: 'select', options: Object.entries(EVENT_KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`]) },
    { key: 'text', label: 'Description', type: 'textarea', rows: 4, hint: 'Shown when the party bumps into it.' },
    { key: 'repeat', label: 'Can be used', type: 'select', options: [['once', 'Once (then it is gone)'], ['daily', 'Once a day'], ['always', 'Any time']], rerender: true },
    { key: 'cooldown', label: 'Turns between uses', type: 'number', min: 10, show: (o) => o.repeat === 'daily', hint: 'A day is 300 turns.' },
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
  hint: 'Place a point of interest — a shrine, campfire, lore stone, well — or a little event with choices. Pick the kind below; edit everything in the inspector.',
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
  const sel = h('select', { title: 'What the Event tool places' }, ...Object.entries(EVENT_TEMPLATES).map(([k, t]) => h('option', { value: k }, `${EVENT_KINDS[t.kind]?.icon || ''} ${t.name}`)));
  sel.value = ed.eventTemplate || 'shrine_might';
  sel.addEventListener('change', () => { ed.eventTemplate = sel.value; ed.setTool('event'); });
  return sel;
}
