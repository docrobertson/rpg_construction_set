// The Story step: chapters, the quests in them, the people they need, and the
// keys and gates between them, laid out so the designer can see the shape of
// the adventure and what is missing.
//
// Left: the chapters in order with their quests, and the quests in no
// chapter. Main: a chapter (its form, its cast, its quests laid out as a flow
// of steps, and beats that write new quests into it), a quest (its flow and
// its form), or the whole story side by side with what needs what.
import { h, clear, modal, toast, confirmDialog } from '../dom.js';
import { buildForm } from './forms.js';
import { QuestEditor, questProblems, newQuest } from './quests.js';
import { deepClone, uniqueId } from '../../core/util.js';
import { itemOf } from '../../game/rules.js';
import { GOAL_TYPES } from '../../game/quests.js';
import { worldMap } from '../../data/schema.js';
import {
  chapterList, chapterById, chapterIndex, chapterLabel, roman, newChapter, questSpans, questsInChapter, describeEnds,
  storyFacts, canStandBy, walkStory, chapterOfQuestNow,
} from '../../game/story.js';
import * as Story from '../../game/story.js';
import * as StoryGen from '../../world/storyGen.js';
import * as Places from '../../world/places.js';
import { BEATS, PERSON_ROLES, addBeat, lockablePortals, townsOf, dungeonsOf, lastQuestOf } from '../../world/storyGen.js';

if (typeof window !== 'undefined') {
  window.__storyGen = StoryGen;
  window.__story = Story;
  window.__places ||= Places;
}

const GOAL_ICON = { talk: '🗣', deliver: '📦', reach: '🧭', kill: '⚔', collect: '💎', clear: '🔥', flag: '🚩', companion: '🛡' };
const ROLE_NAMES = { weapons: 'weaponsmith', armor: 'armourer', provisions: 'provisioner', reagents: 'herbalist', inn: 'innkeeper', tavern: 'barkeep', healer: 'healer', guard: 'guard', lord: 'lord', sage: 'sage', villager: 'local', merchant: 'merchant', shipwright: 'shipwright', bowyer: 'bowyer', companion: 'adventurer', trainer: 'trainer' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const range = (a, b) => (b - a <= 1 ? `step ${a + 1}` : `steps ${a + 1}–${b}`);

export class StoryEditor {
  constructor(ed, left, main) {
    this.ed = ed; this.left = left; this.main = main;
    this.quests = new QuestEditor(ed, left, main);
    this.view = null; // { kind: 'chapter', id } | { kind: 'quest', q } | { kind: 'overview' } | { kind: 'loose' }
  }

  get game() { return this.ed.game; }

  // open a quest in its form
  selectQuest(q) { this.view = { kind: 'quest', q }; this.render(); this.main.scrollTop = 0; }

  // open a chapter (by id); no id: the whole story
  selectChapter(id) {
    this.view = id && chapterById(this.game, id) ? { kind: 'chapter', id } : { kind: 'overview' };
    this.render();
    this.main.scrollTop = 0;
  }

  showOverview() { this.view = { kind: 'overview' }; this.render(); this.main.scrollTop = 0; }

  showLoose() { this.view = { kind: 'loose' }; this.render(); this.main.scrollTop = 0; }

  render() {
    const game = this.game;
    if (!Array.isArray(game.quests)) game.quests = [];
    if (!game.story || !Array.isArray(game.story.chapters)) game.story = { chapters: [] };
    const v = this.view;
    const valid = v && (v.kind === 'overview' || v.kind === 'loose' || (v.kind === 'chapter' && chapterById(game, v.id)) || (v.kind === 'quest' && game.quests.includes(v.q)));
    if (!valid) this.view = chapterList(game).length ? { kind: 'chapter', id: chapterList(game)[0].id } : { kind: 'loose' };
    this.facts = storyFacts(game);
    this.spans = questSpans(game);
    this.walk = null;
    this.renderLeft();
    this.renderMain();
  }

  // the walk-through, worked out once per render (it is quick, but not free)
  get walked() {
    if (!this.walk) { try { this.walk = walkStory(this.game, { facts: this.facts }); } catch (e) { console.error(e); this.walk = { ok: false, stuck: [], chapters: [], failed: e.message }; } }
    return this.walk;
  }

  // ------------------------------------------------------------ left: chapters and their quests
  renderLeft() {
    const game = this.game, L = this.left, v = this.view;
    clear(L);
    L.appendChild(h('div.panel-title', '📖 Story'));
    L.appendChild(h('p.hint', 'Chapters break the adventure into stretches; each opens when the one before it ends. Quests in a chapter wait for it.'));
    L.appendChild(h('div.row.st-addrow',
      h('button.small', { title: 'Write a new quest (in the chapter you are looking at)', onclick: () => this.addQuest() }, '+ New quest'),
      h('button.small', { title: 'Add a chapter at the end of the story', onclick: () => this.addChapter() }, '+ Add chapter')));
    const list = h('div.st-tree');
    list.appendChild(h('button.entry.st-over' + (v.kind === 'overview' ? '.on' : ''), { onclick: () => this.showOverview() },
      h('span', '🗺 The whole story'), h('span.tag', plural(chapterList(game).length, 'chapter'))));
    const chs = chapterList(game);
    chs.forEach((ch, i) => {
      const bad = this.chapterIssueCount(ch);
      const row = h('div.st-chrow' + (v.kind === 'chapter' && v.id === ch.id ? '.on' : ''),
        h('button.entry.st-ch' + (v.kind === 'chapter' && v.id === ch.id ? '.on' : ''), { onclick: () => this.selectChapter(ch.id), title: ch.summary || '' },
          h('span.st-num', roman(i + 1)), h('span.st-chname', ch.name || 'Chapter'), bad ? h('span.st-warn', { title: plural(bad, 'thing') + ' to look at' }, '⚠') : null),
        h('span.st-move',
          h('button.icon.tiny', { title: 'Move earlier', disabled: i === 0, onclick: () => this.moveChapter(ch, -1) }, '↑'),
          h('button.icon.tiny', { title: 'Move later', disabled: i === chs.length - 1, onclick: () => this.moveChapter(ch, 1) }, '↓')));
      list.appendChild(row);
      for (const sp of this.spans.get(ch.id) || []) list.appendChild(this.questEntry(sp.quest, sp));
      if (!(this.spans.get(ch.id) || []).length) list.appendChild(h('div.st-empty', 'No quests yet'));
    });
    const loose = game.quests.filter((q) => !chapterById(game, q.chapter));
    list.appendChild(h('button.entry.st-loose' + (v.kind === 'loose' ? '.on' : ''), { onclick: () => this.showLoose(), title: 'Quests that belong to no chapter: they are open from the start' },
      h('span', chs.length ? 'Quests in no chapter' : 'Quests'), h('span.tag', String(loose.length))));
    for (const q of loose) list.appendChild(this.questEntry(q));
    L.appendChild(list);
  }

  questEntry(q, sp = null) {
    const on = this.view.kind === 'quest' && this.view.q === q;
    const n = (q.stages || []).length;
    const bad = questProblems(this.game, q).length;
    const b = h('button.entry.st-q' + (on ? '.on' : '') + (sp?.cont ? '.cont' : ''), { onclick: () => this.selectQuest(q), title: sp?.cont ? 'Carried on from an earlier chapter' : q.summary || '' },
      (sp?.cont ? '↳ ' : q.main ? '★ ' : '') + (q.name || q.id),
      h('span.tag', sp && (sp.from > 0 || sp.to < n) ? range(sp.from, sp.to) : plural(n, 'step')));
    if (bad) b.classList.add('bad');
    return b;
  }

  // ------------------------------------------------------------ main
  renderMain() {
    const M = this.main;
    clear(M);
    const v = this.view;
    if (v.kind === 'chapter') this.renderChapter(chapterById(this.game, v.id));
    else if (v.kind === 'quest') this.renderQuest(v.q);
    else if (v.kind === 'overview') this.renderOverview();
    else this.renderLoose();
  }

  // ------------------------------------------------------------ a chapter
  renderChapter(ch) {
    const game = this.game, M = this.main;
    const i = chapterIndex(game, ch.id);
    const chs = chapterList(game);
    if (!ch.ends) ch.ends = { type: 'quests' };
    if (!Array.isArray(ch.cast)) ch.cast = [];
    const title = h('h2', ch.name || 'Chapter');
    M.appendChild(h('div.st-head',
      h('div.st-head-l', h('div.st-kicker', `Chapter ${roman(i + 1)} of ${chs.length}`), title),
      h('div.st-head-r',
        h('button.small', { title: 'Move this chapter earlier', disabled: i === 0, onclick: () => this.moveChapter(ch, -1) }, '↑ Earlier'),
        h('button.small', { title: 'Move this chapter later', disabled: i === chs.length - 1, onclick: () => this.moveChapter(ch, 1) }, '↓ Later'),
        h('button.small', { title: 'All the chapters side by side', onclick: () => this.showOverview() }, '🗺 Whole story'),
        h('button.small.danger', { onclick: () => this.deleteChapter(ch) }, 'Delete'))));
    const opens = h('span', i === 0 ? 'Open from the start of the game' : `Opens when ${chapterLabel(game, chs[i - 1])} ends`);
    const ends = h('span', `Ends ${describeEnds(game, ch)}`);
    M.appendChild(h('div.st-status', h('div', h('span.st-dot.open', '▶ '), opens), h('div', h('span.st-dot.end', '■ '), ends)));
    const walkNote = this.walkNote(ch);
    if (walkNote) M.appendChild(walkNote);
    const issues = this.chapterIssues(ch);
    if (issues.length) M.appendChild(h('div.ed-warns', h('b', '⚠ This chapter needs a look:'), h('ul', ...issues.map((t) => h('li', t)))));
    this.findingsBox(M, (f) => f.go?.chapter === ch.id || questsInChapter(game, ch, this.spans).some((q) => q.id === f.go?.quest));

    // the chapter's own words, and how it ends
    const questOptions = () => {
      const inCh = questsInChapter(game, ch, this.spans);
      return [...inCh, ...game.quests.filter((q) => !inCh.includes(q))].map((q) => [q.id, (inCh.includes(q) ? '' : '(another chapter) ') + q.name]);
    };
    const stepOptions = () => {
      const q = game.quests.find((x) => x.id === ch.ends.quest);
      if (!q) return [];
      return [...(q.stages || []).map((s, k) => [k + 1, `reaches step ${k + 1}: ${s.text || GOAL_TYPES[s.goal?.type] || ''}`]), [(q.stages || []).length + 1, 'is finished']];
    };
    const form = buildForm(ch, [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'The Barrow King' },
      { key: 'summary', label: 'In this chapter…', type: 'textarea', rows: 3, placeholder: 'What happens, in a line or two. The player sees it when the chapter opens.', hint: 'Shown on the chapter\'s title card in play, and in the journal.' },
      { key: 'ends.type', label: 'It ends', type: 'select', rerender: true, options: [['quests', 'When its quests are done (the main ones ★, if any)'], ['stage', 'When a quest reaches a certain step'], ['flag', 'When a story flag is set']] },
      { key: 'ends.quest', label: 'Quest', type: 'select', options: questOptions, show: (o) => o.ends?.type === 'stage', rerender: true },
      { key: 'ends.stage', label: 'When it', type: 'select', number: true, options: stepOptions, show: (o) => o.ends?.type === 'stage', hint: 'A long quest can run through several chapters: each ends at one of its steps.' },
      { key: 'ends.flag', label: 'Story flag', type: 'text', placeholder: 'e.g. gate_opened', show: (o) => o.ends?.type === 'flag', hint: 'Set by a conversation, an event, a quest reward or a slain foe.' },
      { key: 'notes', label: 'Designer notes', type: 'textarea', rows: 2, placeholder: 'Ideas, reminders — only you see these.' },
    ], (k) => {
      if (k === 'ends.type' && ch.ends.type === 'stage' && !game.quests.some((q) => q.id === ch.ends.quest)) {
        const q = questsInChapter(game, ch, this.spans)[0] || game.quests[0];
        ch.ends.quest = q?.id || '';
        ch.ends.stage = Math.min(2, (q?.stages || []).length + 1);
      }
      if (k === 'ends.quest') { const q = game.quests.find((x) => x.id === ch.ends.quest); ch.ends.stage = Math.min(+ch.ends.stage || 2, (q?.stages || []).length + 1); }
      this.ed.markDirty();
      if (k === 'name') {
        title.textContent = ch.name || 'Chapter';
        const el = this.left.querySelector('.st-ch.on .st-chname');
        if (el) el.textContent = ch.name || 'Chapter';
        return;
      }
      if (k === 'summary' || k === 'notes' || k === 'ends.flag') { ends.textContent = `Ends ${describeEnds(game, ch)}`; return; }
      // how it ends changes which steps belong where: draw it all again
      const top = M.scrollTop;
      this.render();
      M.scrollTop = top;
    });
    M.appendChild(h('div.st-section.st-chform', form));

    // the people it needs
    M.appendChild(this.castSection(ch));

    // how it plays
    const flow = h('div.st-flow');
    flow.appendChild(h('div.st-marker.open', h('b', '▶'), i === 0 ? ' The game begins' : ` ${chapterLabel(game, chs[i - 1])} ends — this chapter opens`));
    const spans = this.spans.get(ch.id) || [];
    if (!spans.length) flow.appendChild(h('p.hint.st-none', 'No quests in this chapter yet. Add one below — a beat writes a whole quest, people and things included — or choose this chapter in a quest\'s form.'));
    for (const sp of spans) flow.appendChild(this.questCard(sp.quest, { from: sp.from, to: sp.to, cont: sp.cont, chapter: ch }));
    flow.appendChild(h('div.st-marker.end', h('b', '■'), ` Ends ${describeEnds(game, ch)}`, i < chs.length - 1 ? h('span.st-next', ` → ${chapterLabel(game, chs[i + 1])}: ${chs[i + 1].name || ''} opens`) : h('span.st-next', ' — the last chapter')));
    M.appendChild(h('div.st-section', h('h3.st-h', 'How the chapter plays', h('span.st-h-note', 'Each quest, step by step: who, where, and what it takes. Click a quest to change it.')), flow));

    // beats
    M.appendChild(this.beatSection(ch));
  }

  // The chapter's notes from the walk-through: where a company gets stuck
  walkNote(ch) {
    const w = this.walked;
    if (w.failed) return null;
    const here = w.stuck.filter((s) => (w.state ? chapterOfQuestNow(this.game, w.state, s.quest, this.spans)?.id : s.quest.chapter) === ch.id);
    if (here.length) {
      return h('div.st-walk.bad', h('b', '⚠ A company would be stuck here: '),
        ...here.map((s) => h('div', h('a.st-link', { onclick: () => this.selectQuest(s.quest) }, `“${s.quest.name}”`), ` step ${s.step + 1}: ${s.why}.`)));
    }
    if (w.chapters.includes(ch.id)) {
      const i = chapterIndex(this.game, ch.id);
      const next = chapterList(this.game)[i + 1];
      if (!next || w.chapters.includes(next.id)) return h('div.st-walk.ok', '✓ Walked through: a company can play this chapter to its end.');
    }
    if (!w.chapters.includes(ch.id)) return h('div.st-walk.warn', '⚠ Walked through: a company never reaches this chapter — an earlier one does not end.');
    return null;
  }

  // ------------------------------------------------------------ cast
  castSection(ch) {
    const game = this.game;
    const box = h('div.st-section');
    box.appendChild(h('h3.st-h', 'Cast', h('span.st-h-note', 'The people this chapter cannot do without. Each should stand where the company can reach, and play a part in its quests.')));
    const used = this.peopleOf(ch);
    const list = h('div.st-cast');
    ch.cast.forEach((c, k) => {
      const f = this.facts.npcs.get(c.npc);
      const checks = [];
      if (!f) checks.push(h('span.ck.bad', '⚠ no longer in the game'));
      else {
        const reach = this.facts.reach.all.has(f.map.id) && canStandBy(this.facts, f.map, f.npc.x, f.npc.y);
        checks.push(reach ? h('span.ck.ok', '✓ can be reached') : h('span.ck.bad', { title: 'No way leads there, or walls shut them in' }, '⚠ stands where no one can reach'));
        const part = used.get(c.npc);
        checks.push(part ? h('span.ck.ok', { title: part.join(', ') }, `✓ ${part[0]}`) : h('span.ck.warn', '⚠ no quest of this chapter uses them'));
      }
      const note = h('input', { type: 'text', value: c.note || '', placeholder: 'What the chapter needs them for' });
      note.addEventListener('input', () => { c.note = note.value; this.ed.markDirty(); });
      list.appendChild(h('div.st-castrow' + (f ? '' : '.gone'),
        h('div.cr-who', h('b', f?.npc.name || c.npc), f ? h('span.cr-where', this.personWhere(f)) : null),
        note,
        h('div.cr-checks', ...checks),
        h('div.cr-btns',
          f ? h('button.small', { title: 'Show them on the map (Details)', onclick: () => this.ed.goTo({ tab: 'map', map: f.map.id, entity: f.npc.id }) }, '📍') : null,
          h('button.small', { title: 'Take them off the cast', onclick: () => { ch.cast.splice(k, 1); this.ed.markDirty(); this.render(); } }, '×'))));
    });
    if (!ch.cast.length) list.appendChild(h('p.hint', 'Nobody yet. Add the people the chapter turns on — the one who sends the company out, the keeper of a key, a companion who must come along.'));
    box.appendChild(list);
    const pick = h('select.st-castpick');
    pick.appendChild(h('option', { value: '' }, '+ Add someone to the cast…'));
    for (const [label, opts] of this.peopleGroups()) {
      const og = h('optgroup', { label });
      for (const [id, name] of opts) if (!ch.cast.some((c) => c.npc === id)) og.appendChild(h('option', { value: id }, name));
      if (og.children.length) pick.appendChild(og);
    }
    pick.addEventListener('change', () => { if (!pick.value) return; ch.cast.push({ npc: pick.value, note: '' }); this.ed.markDirty(); this.render(); });
    const missing = [...used.keys()].filter((id) => !ch.cast.some((c) => c.npc === id) && this.facts.npcs.has(id));
    box.appendChild(h('div.row', pick, missing.length ? h('button.small', {
      title: missing.map((id) => this.facts.npcs.get(id).npc.name).join(', '),
      onclick: () => { for (const id of missing) ch.cast.push({ npc: id, note: '' }); this.ed.markDirty(); this.render(); },
    }, `+ Everyone its quests use (${missing.length})`) : null));
    return box;
  }

  // People a chapter's quests turn on: Map npcId → ['gives “X”', 'in “Y”']
  peopleOf(ch) {
    const out = new Map();
    const add = (id, why) => { if (!id) return; if (!out.has(id)) out.set(id, []); out.get(id).push(why); };
    for (const sp of this.spans.get(ch.id) || []) {
      const q = sp.quest;
      if (!sp.cont && q.giver) add(q.giver, `gives “${q.name}”`);
      (q.stages || []).slice(sp.from, sp.to).forEach((s) => {
        const g = s.goal || {};
        if (g.type === 'talk' || g.type === 'deliver') add(g.npc || q.giver, `in “${q.name}”`);
        if (g.type === 'companion') add(g.npc, `joins for “${q.name}”`);
      });
    }
    return out;
  }

  personWhere(f) {
    const role = f.npc.role !== 'villager' && ROLE_NAMES[f.npc.role];
    return `${role ? role[0].toUpperCase() + role.slice(1) + ' · ' : ''}${f.map.type === 'world' ? this.nearText(f.map, f.npc.x, f.npc.y) : f.map.name} (${f.npc.x}, ${f.npc.y})`;
  }

  // "out on Eldmark, near Westhold": somewhere on a world map, by its nearest place
  nearText(map, x, y) {
    let best = null, bd = 16;
    for (const e of map.entities) {
      if (e.type !== 'portal' || e.style !== 'site') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return `out on ${map.name}${best ? ', near ' + (this.game.maps.find((m) => m.id === best.target?.map)?.name || best.label) : ''}`;
  }

  peopleGroups() {
    const groups = [];
    for (const m of this.game.maps) {
      const people = m.entities.filter((e) => e.type === 'npc' && !e.reserveOf).map((e) => [e.id, `${e.name || 'someone'}${ROLE_NAMES[e.role] && e.role !== 'villager' ? ' — ' + ROLE_NAMES[e.role] : ''}`]);
      if (people.length) groups.push([m.name, people.sort((a, b) => a[1].localeCompare(b[1]))]);
    }
    return groups;
  }

  // ------------------------------------------------------------ checks
  chapterIssues(ch) {
    const game = this.game;
    const out = [];
    const e = ch.ends || {};
    if (e.type === 'stage' && !game.quests.some((q) => q.id === e.quest)) out.push('It ends at a step of a quest that is not chosen (or no longer exists): it will end when its quests are done instead.');
    if (e.type === 'flag' && !String(e.flag || '').trim()) out.push('It ends when a story flag is set, but no flag is named: it will end when its quests are done instead.');
    if (e.type !== 'stage' && e.type !== 'flag' && !questsInChapter(game, ch, this.spans).length) out.push('It has no quests, so it ends as soon as it opens.');
    const i = chapterIndex(game, ch.id);
    const endQ = e.type === 'stage' && game.quests.find((q) => q.id === e.quest);
    if (endQ && chapterIndex(game, endQ.chapter) > i) out.push(`It ends at a step of “${endQ.name}”, a quest of a later chapter that is not offered until then: this chapter would never end.`);
    for (const sp of this.spans.get(ch.id) || []) {
      const q = sp.quest;
      if (sp.cont) continue;
      const req = q.requires && game.quests.find((x) => x.id === q.requires);
      if (req && chapterIndex(game, req.chapter) > i) out.push(`“${q.name}” waits for “${req.name}”, which is in a later chapter.`);
    }
    for (const c of ch.cast || []) if (!this.facts.npcs.has(c.npc)) out.push('Someone in the cast is no longer in the game.');
    return out;
  }

  chapterIssueCount(ch) {
    let n = this.chapterIssues(ch).length;
    for (const sp of this.spans.get(ch.id) || []) n += this.questIssues(sp.quest).length;
    return n;
  }

  findingsBox(M, pred) {
    const list = (this.ed.findings || []).filter((f) => f.level !== 'ok' && pred(f));
    if (!list.length) return;
    M.appendChild(h('div.st-findings', h('b', '☑ On the checklist'), h('ul', ...list.map((f) => h('li.' + f.level, h('a.st-link', { onclick: () => this.ed.goTo(f.go) }, f.text))))));
  }

  // Problems of a quest: the form's own, and what the flow can see
  questIssues(q) {
    const facts = this.facts;
    const out = questProblems(this.game, q).map((t) => ({ text: t, step: /^Step (\d+)/.test(t) ? +t.match(/^Step (\d+)/)[1] - 1 : null }));
    (q.stages || []).forEach((s, i) => { for (const t of this.stepIssues(q, s.goal || {})) out.push({ text: `Step ${i + 1}: ${t}`, step: i }); });
    const giver = q.giver && facts.npcs.get(q.giver);
    if (giver && !(facts.reach.all.has(giver.map.id) && canStandBy(facts, giver.map, giver.npc.x, giver.npc.y))) out.push({ text: `${giver.npc.name}, who gives it, stands where the company cannot reach.`, step: null });
    return out;
  }

  // What would leave a company stuck at a step (the form checks the rest)
  stepIssues(q, g) {
    const facts = this.facts, game = this.game;
    const out = [];
    const person = (id) => {
      const f = facts.npcs.get(id);
      if (f && !(facts.reach.all.has(f.map.id) && canStandBy(facts, f.map, f.npc.x, f.npc.y))) out.push(`${f.npc.name} stands where the company cannot reach.`);
    };
    const item = (id) => {
      if (!id || !itemOf(game, id)) return;
      const src = (facts.items.get(id) || []).filter((s) => !s.map || facts.reach.all.has(s.map.id));
      if (!src.length) out.push(`nothing in the realm gives the ${itemOf(game, id).name}: put it in a chest, on a foe or in a reward.`);
    };
    const place = (id) => {
      const m = game.maps.find((x) => x.id === id);
      if (m && !facts.reach.all.has(m.id)) out.push(`no way leads to ${m.name}.`);
      const gate = facts.reach.behind.get(id);
      if (gate) item(gate);
    };
    switch (g.type) {
      case 'talk': case 'deliver': person(g.npc || q.giver); if (g.type === 'deliver') item(g.item); break;
      case 'collect': item(g.item); break;
      case 'reach': case 'clear': place(g.map); break;
      case 'kill': {
        const def = game.monsters.find((m) => m.id === g.monster);
        if (def?.boss && !facts.monsters.has(g.monster) && !facts.fights.has(g.monster)) out.push(`${def.name} is not placed anywhere: put them on a map.`);
        break;
      }
      case 'companion': person(g.npc); if (g.map) place(g.map); break;
      default: break;
    }
    return out;
  }

  // ------------------------------------------------------------ quest cards
  // A quest as a card of its steps in order (steps from..to only, for a
  // quest carried through several chapters)
  questCard(q, opt = {}) {
    const game = this.game;
    const n = (q.stages || []).length;
    const from = opt.from ?? 0, to = opt.to ?? n;
    const issues = this.questIssues(q);
    const quest = issues.filter((x) => x.step == null || x.step < from || x.step >= to);
    const head = h('div.qc-head', { onclick: () => this.selectQuest(q), title: opt.solo ? '' : 'Open the quest' },
      h('div.qc-title', q.main ? h('span.qc-star', '★') : null, h('b', q.name || q.id), (from > 0 || to < n) ? h('span.qc-range', range(from, to) + ` of ${n}`) : null),
      h('div.qc-start', this.startText(q, opt)),
      opt.solo ? null : h('span.qc-open', 'Open ›'));
    // a quest that runs through several chapters shows where each begins
    const chapterAt = new Map();
    if (opt.solo) for (const ch of chapterList(game)) for (const sp of this.spans.get(ch.id) || []) if (sp.quest === q && sp.to > sp.from && !chapterAt.has(sp.from)) chapterAt.set(sp.from, ch);
    const steps = h('div.qc-steps');
    for (let i = from; i < to; i++) {
      const chip = this.stepChip(q, i, issues.filter((x) => x.step === i));
      const ch = chapterAt.size > 1 ? chapterAt.get(i) : null;
      // (the arrow goes with the step it leads to, so a wrapped row starts with one)
      steps.appendChild(h('div.qc-link', ch ? h('span.qc-chap', { title: ch.name }, roman(chapterIndex(game, ch.id) + 1)) : i > from ? h('span.qc-arrow', '→') : null, chip));
    }
    if (from === to) steps.appendChild(h('span.hint', opt.cont ? 'The chapter ends as this quest goes on.' : 'No steps in this chapter.'));
    const body = [head, steps];
    if (quest.length && !opt.cont) body.push(h('div.qc-warns', ...quest.map((x) => h('div', '⚠ ' + x.text.replace(/^Step \d+: /, '')))));
    if (to >= n) {
      const gives = this.rewardText(q.reward);
      body.push(h('div.qc-foot', gives ? h('span.qc-gives', h('b', 'On completion: '), gives) : h('span.hint', 'No reward on completion.'), q.doneText ? h('span.qc-done', { title: q.doneText }, '“' + q.doneText.slice(0, 60) + (q.doneText.length > 60 ? '…' : '') + '”') : null));
    }
    return h('div.qcard' + (q.main ? '.main' : '') + (issues.length ? '.bad' : ''), { 'data-q': q.id }, ...body);
  }

  startText(q, opt = {}) {
    const game = this.game;
    if (opt.cont) return `Carried on from ${chapterLabel(game, chapterById(game, q.chapter) || { id: q.chapter })}`;
    const parts = [];
    const g = q.giver && this.facts.npcs.get(q.giver);
    if (q.auto) parts.push('Starts by itself');
    else if (g) parts.push('Offered by ', this.who(g));
    else parts.push('Started by a conversation or event');
    if (q.auto && g) parts.push(' · given by ', this.who(g));
    const req = q.requires && game.quests.find((x) => x.id === q.requires);
    if (req) parts.push(` · after “${req.name}”`);
    else if (q.auto) parts.push(q.chapter ? ' when the chapter opens' : ' as the game begins');
    return h('span', ...parts);
  }

  // "Mayor Hilda (Westhold)" with a link to them on the map
  who(f) {
    return h('a.st-link', { title: 'Show on the map', onclick: (e) => { e.stopPropagation(); this.ed.goTo({ tab: 'map', map: f.map.id, entity: f.npc.id }); } }, f.npc.name || 'someone', f.map.type === 'world' ? '' : ` (${f.map.name})`);
  }

  placeLink(map) {
    if (!map) return 'somewhere';
    return h('a.st-link', { title: 'Open the map', onclick: (e) => { e.stopPropagation(); this.ed.goTo({ tab: 'map', map: map.id }); } }, map.name);
  }

  rewardText(r) {
    if (!r) return '';
    const out = [];
    if (+r.gold) out.push(`${r.gold} gold`);
    if (+r.xp) out.push(`${r.xp} XP`);
    if (+r.food) out.push(`${r.food} food`);
    for (const it of r.items || []) { const d = itemOf(this.game, it.id); if (d) out.push(`${this.isKey(d.id) ? '🗝 ' : ''}${+it.n > 1 ? it.n + ' × ' : ''}${d.name}`); }
    if (r.flag) out.push(`flag “${r.flag}”`);
    return out.join(' · ');
  }

  // Does an item open a barred way?
  isKey(id) { for (const list of this.facts.gates.values()) if (list.some((g) => g.item === id)) return true; return false; }

  // One step: an icon, what to do, where, and what it gives
  stepChip(q, i, issues) {
    const game = this.game, facts = this.facts;
    const s = q.stages[i];
    const g = s.goal || {};
    const mapOf = (id) => game.maps.find((m) => m.id === id);
    const itemName = (id) => itemOf(game, id)?.name || 'item (not chosen)';
    let icon = GOAL_ICON[g.type] || '•', what, where = null;
    const person = (id) => { const f = facts.npcs.get(id); return f ? this.who(f) : h('span.qc-missing', 'someone (not chosen)'); };
    switch (g.type) {
      case 'talk': what = ['Talk to ', person(g.npc || q.giver)]; break;
      case 'deliver': what = [`Bring the ${itemName(g.item)} to `, person(g.npc || q.giver)]; break;
      case 'reach': {
        const m = mapOf(g.map);
        const key = facts.reach.behind.get(g.map);
        if (key) { icon = '🚪'; what = [this.placeLink(m), ` opens with the ${itemName(key)}`]; }
        else what = ['Reach ', this.placeLink(m)];
        break;
      }
      case 'clear': what = ['Clear ', this.placeLink(mapOf(g.map)), ' of monsters']; break;
      case 'kill': {
        const def = game.monsters.find((m) => m.id === g.monster);
        const nn = Math.max(1, parseInt(g.n, 10) || 1);
        what = [nn > 1 ? `Slay ${nn} ${def?.plural || 'foes'}` : `Defeat ${def?.name || 'a foe (not chosen)'}`];
        const at = facts.monsters.get(g.monster) || [];
        if (at.length === 1 && at[0].map.type === 'world') where = [h('a.st-link', { onclick: (e) => { e.stopPropagation(); this.ed.goTo({ tab: 'map', map: at[0].map.id, entity: at[0].ent.id }); } }, this.nearText(at[0].map, at[0].ent.x, at[0].ent.y))];
        else if (at.length) where = ['in ', ...at.slice(0, 2).flatMap((x, k) => (k ? [', ', this.placeLink(x.map)] : [this.placeLink(x.map)]))];
        else if (def && !def.boss) where = 'met in the wild';
        else if (facts.fights.has(g.monster)) where = 'from an event or a word';
        break;
      }
      case 'collect': {
        if (this.isKey(g.item)) icon = '🗝';
        what = [`Find the ${itemName(g.item)}`];
        where = this.sourceText(g.item, q);
        break;
      }
      case 'flag': what = [`Story flag${String(g.flags || '').includes(',') ? 's' : ''} “${g.flags || g.flag || '?'}”`]; break;
      case 'companion': {
        const f = facts.npcs.get(g.npc);
        what = g.map ? ['Bring ', person(g.npc), ' to ', this.placeLink(mapOf(g.map))] : ['Have ', person(g.npc), ' in the company'];
        const after = f?.npc.recruit?.after && game.quests.find((x) => x.id === f.npc.recruit.after);
        where = f ? (after ? `joins after “${after.name}”` : facts.joiners.has(g.npc) ? 'asks to JOIN' : null) : null;
        break;
      }
      default: what = [s.text || 'A step'];
    }
    if (!where && (g.type === 'deliver') && g.item) where = this.sourceText(g.item, q);
    const gives = s.reward && (s.reward.items?.length || +s.reward.gold || s.reward.flag) ? this.rewardText({ items: s.reward.items, gold: s.reward.gold, flag: s.reward.flag }) : '';
    return h('div.qc-step' + (issues.length ? '.bad' : ''), { title: `Step ${i + 1}: ${s.text || ''}${issues.length ? '\n⚠ ' + issues.map((x) => x.text.replace(/^Step \d+: /, '')).join('\n⚠ ') : ''}`, onclick: () => this.selectQuest(q) },
      h('div.qs-top', h('span.qs-ico', icon), h('span.qs-what', ...what)),
      where ? h('div.qs-where', ...(Array.isArray(where) ? where : [where])) : null,
      gives ? h('div.qs-gives', '→ gives ', gives) : null,
      issues.length ? h('div.qs-warn', '⚠ ' + issues[0].text.replace(/^Step \d+: /, '')) : null);
  }

  // Where an item can be had, in a few words
  sourceText(id, q) {
    const list = this.facts.items.get(id) || [];
    if (!list.length) return null;
    const s = list.find((x) => x.kind === 'reward' && x.quest === q) || list.find((x) => x.kind === 'loot') || list.find((x) => x.kind === 'chest') || list[0];
    const more = list.length > 1 ? ` (+${list.length - 1} more)` : '';
    switch (s.kind) {
      case 'chest': return ['in a chest in ', this.placeLink(s.map), more];
      case 'hoard': return ['in a buried hoard', more];
      case 'loot': return [`carried by ${this.game.monsters.find((m) => m.id === s.monster)?.name || 'a foe'} in `, this.placeLink(s.map), more];
      case 'reward': return [s.quest === q ? `given at step ${(s.step ?? q.stages.length - 1) + 1}` : `a reward for “${s.quest.name}”`, more];
      case 'start': return [`given on accepting “${s.quest.name}”`, more];
      case 'shop': return [`sold by ${s.npc.name} in `, this.placeLink(s.map), more];
      case 'gift': return [`given by ${s.npc.name} (asked)`, more];
      case 'event': return ['from an event in ', this.placeLink(s.map), more];
      case 'kit': return ['in the starting kit', more];
      default: return null;
    }
  }

  // ------------------------------------------------------------ a quest
  renderQuest(q) {
    const game = this.game, M = this.main;
    const ch = chapterById(game, q.chapter);
    M.appendChild(h('div.st-crumbs',
      h('a.st-link', { onclick: () => this.showOverview() }, '🗺 Story'), ' › ',
      ch ? h('a.st-link', { onclick: () => this.selectChapter(ch.id) }, `${chapterLabel(game, ch)} · ${ch.name}`) : h('a.st-link', { onclick: () => this.showLoose() }, 'Quests in no chapter'),
      ' › ', h('span', q.name)));
    const card = this.questCard(q, { solo: true });
    card.classList.add('solo');
    // (what the checklist says of it, under its card)
    const top = h('div.st-qtop', card);
    this.findingsBox(top, (f) => f.go?.quest === q.id);
    const actions = h('span.st-qbtns',
      h('button.small', { title: 'A copy of this quest', onclick: () => this.duplicateQuest(q) }, 'Duplicate'),
      h('button.small.danger', { onclick: () => this.deleteQuest(q) }, 'Delete'));
    this.quests.renderForm(q, M, {
      actions,
      before: top,
      onName: () => { const el = this.left.querySelector('.st-q.on'); if (el) el.firstChild.textContent = (q.main ? '★ ' : '') + q.name; },
      onChange: (k) => {
        if (k === 'chapter' || k === 'main' || k === 'giver' || k === 'auto' || k === 'requires' || k?.startsWith?.('stages')) {
          // the quest moved, or its steps changed: redraw the list and its card
          clearTimeout(this.redrawT);
          this.redrawT = setTimeout(() => {
            if (this.view.kind !== 'quest' || this.view.q !== q) return;
            this.facts = storyFacts(game);
            this.spans = questSpans(game);
            this.walk = null;
            this.renderLeft();
            const fresh = this.questCard(q, { solo: true });
            fresh.classList.add('solo');
            M.querySelector('.qcard.solo')?.replaceWith(fresh);
          }, k === 'chapter' || k === 'main' ? 0 : 350);
        }
      },
    });
  }

  // ------------------------------------------------------------ quests in no chapter
  renderLoose() {
    const game = this.game, M = this.main;
    const chs = chapterList(game);
    const loose = game.quests.filter((q) => !chapterById(game, q.chapter));
    M.appendChild(h('div.st-head', h('div.st-head-l', h('div.st-kicker', chs.length ? 'Open from the start' : 'Your story'), h('h2', chs.length ? 'Quests in no chapter' : 'Quests'))));
    if (!chs.length) {
      M.appendChild(h('div.st-intro',
        h('p', 'Break your adventure into ', h('b', 'chapters'), ': stretches of the story, each with its own goal. Chapter I is open from the start; each later chapter opens when the one before it ends, and the quests in it wait until then.'),
        h('p', 'A chapter can list its ', h('b', 'cast'), ' — the people it cannot do without — and shows its quests as a flow of steps: who to see, where to go, which key opens which gate.'),
        h('div.row', h('button.primary', { onclick: () => this.addChapter() }, '+ Add the first chapter'))));
    } else M.appendChild(h('p.hint', 'These quests belong to no chapter: they can be offered (or start by themselves) at any time. Side quests often live here.'));
    if (!loose.length) M.appendChild(h('p.hint', 'None.'));
    const flow = h('div.st-flow');
    for (const q of loose) flow.appendChild(this.questCard(q));
    M.appendChild(flow);
    M.appendChild(this.beatSection(null));
  }

  // ------------------------------------------------------------ the whole story
  renderOverview() {
    const game = this.game, M = this.main;
    const chs = chapterList(game);
    M.appendChild(h('div.st-head', h('div.st-head-l', h('div.st-kicker', game.meta.title || 'Untitled Realm'), h('h2', 'The whole story')),
      h('div.st-head-r', h('button.small', { onclick: () => this.addChapter() }, '+ Add chapter'))));
    // the walk-through
    const w = this.walked;
    const v = game.settings.victory || {};
    if (!w.failed) {
      if (w.ok) {
        M.appendChild(h('div.st-walk.ok', h('b', '✓ Walked through: '), `a company can play it all — ${plural(chs.length, 'chapter')}, ${plural(w.done.length, 'quest')}${w.won ? ', and the game is won' : v.type === 'none' || !v.type ? ' (the game has no way to be won yet: Campaign → How it ends)' : ''}.`));
      } else {
        const lines = w.stuck.map((s) => h('div', h('a.st-link', { onclick: () => this.selectQuest(s.quest) }, `“${s.quest.name}”`), ` step ${s.step + 1}: ${s.why}.`));
        if (!lines.length && w.won === false) lines.push(h('div', 'Every quest it can reach is done, but the game is never won (Campaign → How it ends).'));
        if (!lines.length && w.chapters.length < chs.length) lines.push(h('div', `${chapterLabel(game, chs[w.chapters.length])} never opens: the chapter before it does not end.`));
        M.appendChild(h('div.st-walk.bad', h('b', '⚠ Walked through, a company would be stuck:'), ...lines));
      }
    }
    M.appendChild(h('p.hint.st-legend', 'Each column is a chapter, its quests top to bottom. ', h('span.lg.req', '——'), ' one quest leads to the next   ', h('span.lg.key', '- - 🗝'), ' a key, from where it is won to the way it opens. Click anything to open it.'));
    const board = h('div.st-board');
    const cols = h('div.st-cols');
    const loose = game.quests.filter((q) => !chapterById(game, q.chapter));
    chs.forEach((ch, i) => {
      const col = h('div.st-col');
      col.appendChild(h('div.st-colhead', { onclick: () => this.selectChapter(ch.id), title: ch.summary || 'Open the chapter' },
        h('span.st-num.big', roman(i + 1)), h('div', h('b', ch.name || 'Chapter'), h('div.st-colsub', i === 0 ? 'Open from the start' : 'Opens when the chapter before ends'))));
      if (ch.summary) col.appendChild(h('p.st-colsum', ch.summary));
      const sps = this.spans.get(ch.id) || [];
      for (const sp of sps) col.appendChild(this.miniCard(sp.quest, sp));
      if (!sps.length) col.appendChild(h('div.st-empty.box', 'No quests yet'));
      if (ch.cast?.length) col.appendChild(h('div.st-colcast', h('span', 'Cast: '), ch.cast.map((c) => this.facts.npcs.get(c.npc)?.npc.name || '?').join(', ')));
      col.appendChild(h('div.st-colend', '■ Ends ' + describeEnds(game, ch)));
      cols.appendChild(col);
    });
    if (loose.length || !chs.length) {
      const col = h('div.st-col.loose');
      col.appendChild(h('div.st-colhead', { onclick: () => this.showLoose() }, h('span.st-num.big', '∞'), h('div', h('b', 'Any time'), h('div.st-colsub', 'Quests in no chapter'))));
      for (const q of loose) col.appendChild(this.miniCard(q));
      if (!loose.length) col.appendChild(h('div.st-empty.box', 'None'));
      cols.appendChild(col);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'st-links');
    board.append(cols, svg);
    M.appendChild(board);
    // the arrows need the cards laid out first
    requestAnimationFrame(() => this.drawLinks(board, svg));
  }

  // A small card for the overview: name, who gives it, its steps as icons,
  // the keys it gives and the gates it needs
  miniCard(q, sp = null) {
    const game = this.game, facts = this.facts;
    const n = (q.stages || []).length;
    const from = sp?.from ?? 0, to = sp?.to ?? n;
    const g = q.giver && facts.npcs.get(q.giver);
    const issues = this.questIssues(q).filter((x) => x.step == null ? !sp?.cont : x.step >= from && x.step < to);
    const icons = [];
    for (let i = from; i < to; i++) {
      const s = q.stages[i], gl = s.goal || {};
      let ic = GOAL_ICON[gl.type] || '•';
      if (gl.type === 'reach' && facts.reach.behind.get(gl.map)) ic = '🚪';
      if (gl.type === 'collect' && this.isKey(gl.item)) ic = '🗝';
      icons.push(h('span.mc-ic' + (issues.some((x) => x.step === i) ? '.bad' : ''), { title: `${i + 1}. ${s.text || GOAL_TYPES[gl.type] || ''}` }, ic));
    }
    const keys = this.keysGiven(q, from, to).map((id) => itemOf(game, id)?.name).filter(Boolean);
    const gates = this.gatesNeeded(q, from, to).map((id) => itemOf(game, id)?.name).filter(Boolean);
    return h('div.mcard' + (q.main ? '.main' : '') + (issues.length ? '.bad' : '') + (sp?.cont ? '.cont' : ''), { 'data-q': q.id + (sp ? '@' + sp.from : ''), onclick: () => this.selectQuest(q), title: q.summary || 'Open the quest' },
      h('div.mc-title', sp?.cont ? '↳ ' : q.main ? '★ ' : '', q.name || q.id, (from > 0 || to < n) ? h('span.mc-range', range(from, to)) : null),
      h('div.mc-who', sp?.cont ? 'carried on' : q.auto ? (g ? `starts by itself · ${g.npc.name}` : 'starts by itself') : g ? `${g.npc.name}${g.map.type === 'world' ? '' : ', ' + g.map.name}` : 'nobody gives it'),
      h('div.mc-steps', ...icons.flatMap((x, k) => (k ? [h('span.mc-ar', '›'), x] : [x]))),
      keys.length ? h('div.mc-key', '🗝 gives ', keys.join(', ')) : null,
      gates.length ? h('div.mc-gate', '🚪 needs ', gates.join(', ')) : null,
      issues.length ? h('div.mc-warn', `⚠ ${plural(issues.length, 'problem')}`) : null);
  }

  // Keys (items that open barred ways) a quest gives or finds in steps from..to
  keysGiven(q, from = 0, to = (q.stages || []).length) {
    const out = new Set();
    (q.stages || []).slice(from, to).forEach((s) => {
      for (const it of s.reward?.items || []) if (this.isKey(it.id)) out.add(it.id);
      if (s.goal?.type === 'collect' && this.isKey(s.goal.item)) out.add(s.goal.item);
    });
    if (to >= (q.stages || []).length) for (const it of q.reward?.items || []) if (this.isKey(it.id)) out.add(it.id);
    return [...out];
  }

  // Keys a quest's steps from..to need, to get through a barred way
  gatesNeeded(q, from = 0, to = (q.stages || []).length) {
    const out = new Set();
    for (const s of (q.stages || []).slice(from, to)) {
      const g = s.goal || {};
      const key = (g.type === 'reach' || g.type === 'clear' || (g.type === 'companion' && g.map)) && this.facts.reach.behind.get(g.map);
      if (key) out.add(key);
    }
    return [...out];
  }

  drawLinks(board, svg) {
    if (!board.isConnected) return;
    const game = this.game;
    const bb = board.getBoundingClientRect();
    const W = board.scrollWidth, H = board.scrollHeight;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const NS = 'http://www.w3.org/2000/svg';
    const cards = [...board.querySelectorAll('.mcard')];
    const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - bb.left + board.scrollLeft, r: r.right - bb.left + board.scrollLeft, t: r.top - bb.top, b: r.bottom - bb.top, col: el.parentElement }; };
    const firstCard = (qid) => cards.find((c) => c.dataset.q.split('@')[0] === qid);
    const lastCard = (qid) => [...cards].reverse().find((c) => c.dataset.q.split('@')[0] === qid);
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="st-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b8913f"/></marker>'
      + '<marker id="st-ark" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ffd56a"/></marker>';
    svg.appendChild(defs);
    const link = (a, b, cls, label, tip) => {
      if (!a || !b || a === b) return;
      const A = rect(a), B = rect(b);
      let d, lx, ly;
      if (A.col === B.col) {
        // in one column: a bracket down the left side
        const x = A.l - 2, y1 = (A.t + A.b) / 2, y2 = (B.t + B.b) / 2;
        const bow = Math.min(26, 10 + Math.abs(y2 - y1) / 12);
        d = `M${x},${y1} C${x - bow},${y1} ${x - bow},${y2} ${x},${y2}`;
        lx = x - bow; ly = (y1 + y2) / 2;
      } else {
        const fwd = B.l >= A.r;
        const x1 = fwd ? A.r : A.l, y1 = (A.t + A.b) / 2, x2 = fwd ? B.l : B.r, y2 = (B.t + B.b) / 2;
        const dx = Math.max(30, Math.abs(x2 - x1) / 2) * (fwd ? 1 : -1);
        d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
        lx = (x1 + x2) / 2; ly = (y1 + y2) / 2;
      }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      p.setAttribute('marker-end', cls === 'key' ? 'url(#st-ark)' : 'url(#st-ar)');
      svg.appendChild(p);
      if (label) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', lx); t.setAttribute('y', ly + 4);
        t.setAttribute('class', 'lbl');
        t.setAttribute('text-anchor', 'middle');
        t.textContent = label;
        if (tip) { const ti = document.createElementNS(NS, 'title'); ti.textContent = tip; t.appendChild(ti); }
        svg.appendChild(t);
      }
    };
    // one quest waits for another; a quest carried on runs from one chapter into the next
    for (const q of game.quests) if (q.requires) link(lastCard(q.requires), firstCard(q.id), 'req');
    for (const q of game.quests) {
      const parts = cards.filter((c) => c.dataset.q.split('@')[0] === q.id);
      for (let k = 1; k < parts.length; k++) link(parts[k - 1], parts[k], 'cont');
    }
    // a key, from where it is won to where it opens a way
    const allSpans = [...this.spans.values()].flat();
    const cardQuest = (c) => {
      const [qid, at] = c.dataset.q.split('@');
      const q = game.quests.find((x) => x.id === qid);
      return { q, sp: q && at != null ? allSpans.find((s) => s.quest === q && String(s.from) === at) : null };
    };
    const givers = new Map();
    for (const c of cards) {
      const { q, sp } = cardQuest(c);
      if (q) for (const k of this.keysGiven(q, sp?.from, sp?.to)) if (!givers.has(k)) givers.set(k, c);
    }
    for (const c of cards) {
      const { q, sp } = cardQuest(c);
      if (!q) continue;
      for (const k of this.gatesNeeded(q, sp?.from, sp?.to)) {
        const from = givers.get(k);
        if (from && from !== c) link(from, c, 'key', '🗝', `The ${itemOf(game, k)?.name || 'key'}: won here, opens the way there`);
      }
    }
  }

  // ------------------------------------------------------------ beats
  beatSection(ch) {
    const box = h('div.st-section.st-beats');
    box.appendChild(h('h3.st-h', ch ? '+ Add to this chapter…' : '+ Add a quest…', h('span.st-h-note', 'A beat writes a whole quest with good words to start from — and stands the people, items and foes it needs in the realm.')));
    const grid = h('div.st-beatgrid');
    for (const [k, b] of Object.entries(BEATS)) {
      grid.appendChild(h('button.st-beat', { 'data-beat': k, onclick: () => this.beatDialog(k, ch) }, h('span.sb-ic', b.icon), h('span.sb-txt', h('b', b.label), h('span', b.desc))));
    }
    box.appendChild(grid);
    return box;
  }

  // The form for a beat, in a window; "Write it" writes it into the game
  beatDialog(kind, ch) {
    const game = this.game;
    const beat = BEATS[kind];
    const towns = townsOf(game).map((p) => [p.map.id, p.map.name]);
    const dungeons = dungeonsOf(game).map((p) => [p.map.id, p.map.name]);
    const allPlaces = game.maps.map((m) => [m.id, `${m.name}${m.type === 'world' ? ' (the open land)' : ''}`]);
    const homeTown = towns[0]?.[0] || worldMap(game).id;
    const people = () => this.peopleGroups().flatMap(([m, list]) => list.map(([id, name]) => [id, `${name} — ${m}`]));
    const inChapter = ch ? questsInChapter(game, ch, this.spans) : [];
    const last = ch ? lastQuestOf(game, ch.id) : null;
    const questsAll = () => [...inChapter, ...game.quests.filter((q) => !inChapter.includes(q))].map((q) => [q.id, q.name]);
    const o = {
      giver: kind === 'companion' || kind === 'gate' ? '' : '__new', giverMap: homeTown, giverRole: 'villager', giverName: '', giverGreet: '',
      who: '__new', whoMap: towns[1]?.[0] || homeTown, whoRole: kind === 'companion' ? 'companion' : 'sage', whoName: '', whoGreet: '',
      after: last?.id || '', main: ch ? !questsInChapter(game, ch, this.spans).some((q) => q.main) || kind !== 'slay' : false, name: '', gold: 60, xp: 60,
      item: '__new', itemName: kind === 'gate' ? 'Iron Key' : '', itemDesc: '',
      map: kind === 'slay' ? (towns.find(([id]) => id !== homeTown)?.[0] || homeTown) : dungeons[0]?.[0] || '', hold: 'chest',
      monster: '__new', foeName: '', foeBase: game.monsters.find((m) => m.id === 'troll' || m.id === 'orc_captain')?.id || game.monsters[0]?.id, count: '1',
      portal: '', from: 'monster', person: '__new', personMap: homeTown, personRole: 'lord', personName: '', quest: last?.id || '', foeMap: dungeons[0]?.[0] || '',
      joinAfter: last?.id || '', to: '', say: '',
    };
    const portals = lockablePortals(game).map(({ portal, map, target }) => [portal.id, `${target.name} — ${portal.style === 'site' ? 'its entrance' : portal.label || 'a passage'} on ${map.name}${portal.requires ? ' (already barred)' : ''}`]);
    o.portal = lockablePortals(game).find((x) => !x.portal.requires && x.target.type === 'dungeon')?.portal.id || portals[0]?.[0] || '';
    // a key's guardian never stands behind the gate it opens
    const gateTarget = () => lockablePortals(game).find((x) => x.portal.id === o.portal)?.target;
    // (ones a company can get into without another key first)
    const open = this.facts.reach.open;
    const guardPlaces = () => dungeons.filter(([id]) => id !== gateTarget()?.id)
      .map(([id, name]) => [id, open.has(id) ? name : `${name} (behind a barred way)`])
      .sort((a, b) => (open.has(b[0]) ? 1 : 0) - (open.has(a[0]) ? 1 : 0));
    const fixGuard = () => { if (!guardPlaces().some(([id]) => id === o.foeMap)) o.foeMap = guardPlaces()[0]?.[0] || ''; };
    if (kind === 'gate') { const t = gateTarget(); if (t) o.itemName = `Key of ${t.name}`; fixGuard(); }
    const personFields = (key, label, opt = {}) => [
      { key, label, type: 'select', rerender: true, options: () => [...(opt.none ? [['', opt.none]] : []), ['__new', '✦ Someone new…'], ...people()] },
      { key: key + 'Name', label: 'Their name', type: 'text', placeholder: 'Leave blank for a made-up one', show: (x) => x[key] === '__new' },
      { key: key + 'Map', label: 'Stands in', type: 'select', options: allPlaces, show: (x) => x[key] === '__new', hint: 'They are stood on a free square the company can walk to.' },
      { key: key + 'Role', label: 'Who they are', type: 'select', options: PERSON_ROLES, show: (x) => x[key] === '__new' },
      { key: key + 'Greet', label: 'Greeting', type: 'text', placeholder: 'A line of greeting (or leave a fitting one)', show: (x) => x[key] === '__new' },
    ];
    const spec = (key) => (o[key] === '__new' ? { name: o[key + 'Name'], map: o[key + 'Map'], role: o[key + 'Role'], greeting: o[key + 'Greet'] } : o[key] || null);
    const fields = [];
    const giverFields = personFields('giver', 'Who gives it', { none: '— nobody: it starts by itself —' });
    switch (kind) {
      case 'talk':
        fields.push(...giverFields, { type: 'section', label: 'Who the company must see' }, ...personFields('who', 'Go and see'),
          { key: 'say', label: 'What they say', type: 'textarea', rows: 2, placeholder: 'So you have come at last…' });
        break;
      case 'fetch':
        fields.push(...giverFields, { type: 'section', label: 'The item' },
          { key: 'item', label: 'Item', type: 'select', rerender: true, options: () => [['__new', '✦ A new quest item…'], ...game.items.filter((i) => i.type === 'quest').map((i) => [i.id, i.name]), ...game.items.filter((i) => i.type !== 'quest').map((i) => [i.id, i.name])] },
          { key: 'itemName', label: 'Its name', type: 'text', placeholder: 'Amulet of the Moon', show: (x) => x.item === '__new' },
          { key: 'itemDesc', label: 'Description', type: 'text', placeholder: 'What the player reads in the pack', show: (x) => x.item === '__new' },
          { key: 'map', label: 'In the dungeon', type: 'select', options: dungeons, empty: dungeons.length ? undefined : '— there are no dungeons yet —' },
          { key: 'hold', label: 'Where it waits', type: 'select', options: [['chest', 'In a chest in the deepest room'], ['boss', 'Carried by the dungeon\'s boss (a new named foe if it has none)']] });
        break;
      case 'slay':
        fields.push(...giverFields, { type: 'section', label: 'The foe' },
          { key: 'monster', label: 'Foe', type: 'select', rerender: true, options: () => [['__new', '✦ A new named foe…'], ...game.monsters.map((m) => [m.id, `${m.name}${m.boss ? ' ★' : ''}`])] },
          { key: 'foeName', label: 'Its name', type: 'text', placeholder: 'Old Blackjaw', show: (x) => x.monster === '__new' },
          { key: 'foeBase', label: 'Made from', type: 'select', options: () => game.monsters.filter((m) => !m.boss).map((m) => [m.id, `${m.name} (level ${m.level || 1})`]), show: (x) => x.monster === '__new', hint: 'A tougher, unique one of these, met once.' },
          { key: 'map', label: 'Troubles', type: 'select', options: allPlaces, hint: 'A dungeon: it waits in the deepest room. A town: it prowls the land just outside.' },
          { key: 'count', label: 'How many', type: 'text', placeholder: '2-3', show: (x) => x.monster !== '__new' && !game.monsters.find((m) => m.id === x.monster)?.boss });
        break;
      case 'gate':
        fields.push(
          { key: 'portal', label: 'The way to lock', type: 'select', options: portals, rerender: true },
          { key: 'item', label: 'Key', type: 'select', rerender: true, options: () => [['__new', '✦ A new key…'], ...game.items.filter((i) => i.type === 'quest' || i.type === 'key').map((i) => [i.id, i.name])] },
          { key: 'itemName', label: 'Its name', type: 'text', show: (x) => x.item === '__new' },
          { key: 'from', label: 'The key comes from', type: 'select', rerender: true, options: [['monster', 'A foe who carries it'], ['person', 'Someone who keeps it'], ['reward', 'The reward of a quest']] },
          ...personFields('person', 'Who keeps it').map((f) => ({ ...f, show: (x) => x.from === 'person' && (!f.show || f.show(x)) })),
          { key: 'quest', label: 'Reward of', type: 'select', options: questsAll, show: (x) => x.from === 'reward' },
          { key: 'foeMap', label: 'A new guardian, in', type: 'select', options: guardPlaces, show: (x) => x.from === 'monster', hint: 'A named foe is made and stood in the deepest room, the key on them.' },
          { type: 'section', label: 'The quest' }, ...giverFields);
        break;
      case 'companion':
        fields.push(...personFields('who', 'Who joins'),
          { key: 'joinAfter', label: 'Joins after', type: 'select', options: questsAll, empty: '— any time: ask them to JOIN —', hint: 'They ask to come along as that quest ends.' },
          { key: 'to', label: 'And must come along to', type: 'select', options: allPlaces, empty: '— nowhere in particular —', hint: 'A later step that needs them at the company\'s side there.' });
        o.after = o.joinAfter;
        break;
      case 'clear':
        fields.push(...giverFields, { key: 'map', label: 'Dungeon to clear', type: 'select', options: dungeons });
        break;
      case 'explore':
        fields.push(...giverFields, { key: 'map', label: 'Place to reach', type: 'select', options: allPlaces.filter(([id]) => id !== worldMap(game).id) });
        break;
      default: break;
    }
    fields.push({ type: 'section', label: 'Its place in the story' },
      { key: 'name', label: 'Quest name', type: 'text', placeholder: 'Leave blank: a name is made from the beat' },
      ...(kind === 'companion' ? [] : [{ key: 'after', label: 'Comes after', type: 'select', options: questsAll, empty: '— nothing: when the chapter opens —' }]),
      { key: 'main', label: 'Main quest (★) — the chapter waits for it', type: 'check' },
      { key: 'gold', label: 'Reward: gold', type: 'number', min: 0 },
      { key: 'xp', label: 'Reward: experience', type: 'number', min: 0 });
    const body = h('div.st-beatform');
    const draw = () => {
      clear(body);
      body.appendChild(h('p.hint', `${beat.desc}.${ch ? ` It goes into ${chapterLabel(game, ch)}, ${ch.name}.` : ''}`));
      body.appendChild(buildForm(o, fields, (k) => {
        // a new key is named after the way it opens
        if (k === 'portal' && kind === 'gate') {
          const t = gateTarget();
          if (t && o.item === '__new') o.itemName = `Key of ${t.name}`;
          fixGuard();
          draw();
        }
      }));
    };
    draw();
    modal(body, {
      title: `${beat.icon} ${beat.label}`, sub: ch ? `${chapterLabel(game, ch)} · ${ch.name}` : 'A quest in no chapter', cls: 'wide st-beat-modal',
      buttons: [{ label: 'Cancel' }, {
        label: 'Write it', primary: true, onClick: () => {
          const opt = {
            chapter: ch?.id, giver: spec('giver'), main: !!o.main, name: o.name.trim() || undefined, reward: { gold: +o.gold || 0, xp: +o.xp || 0 },
            after: kind === 'companion' ? undefined : o.after || null,
            who: spec('who'), say: o.say || undefined,
            item: o.item === '__new' ? { name: o.itemName || (kind === 'gate' ? 'Iron Key' : ''), desc: o.itemDesc } : o.item,
            map: o.map, hold: o.hold,
            monster: o.monster === '__new' ? { base: o.foeBase, name: o.foeName } : o.monster, count: o.count,
            portal: o.portal, key: o.item === '__new' ? { name: o.itemName || 'Iron Key' } : o.item, from: o.from, person: spec('person'), quest: o.quest,
            joinAfter: o.joinAfter || null, to: o.to || null,
          };
          // (a key's guardian: a new named foe, stood in that dungeon)
          if (kind === 'gate' && o.from === 'monster') opt.map = o.foeMap;
          const need = { fetch: ['map'], slay: ['map'], gate: ['portal'], clear: ['map'], explore: ['map'] }[kind] || [];
          if (need.some((k) => !o[k])) { toast('Choose the place first.', 'warn'); return false; }
          if (kind === 'fetch' && o.item === '__new' && !o.itemName.trim()) { toast('Give the item a name.', 'warn'); return false; }
          this.ed.checkpoint?.(`the ${beat.label} beat`);
          let res;
          try { res = addBeat(game, kind, opt); } catch (e) { console.error(e); toast('That beat could not be written: ' + e.message, 'bad'); return false; }
          this.ed.markDirty();
          if (!res.quest) { toast(res.notes.join(' ') || 'Nothing was written.', 'warn'); return false; }
          toast(`Wrote “${res.quest.name}”. ${res.notes.join(' ')}`.trim());
          this.render();
          const card = this.main.querySelector(`.qcard[data-q="${res.quest.id}"]`);
          if (card) { card.classList.add('fresh'); card.scrollIntoView({ block: 'center' }); }
          return true;
        },
      }],
    });
  }

  // ------------------------------------------------------------ chapters & quests
  addChapter() {
    const game = this.game;
    const ch = newChapter(game);
    game.story.chapters.push(ch);
    this.ed.markDirty();
    this.selectChapter(ch.id);
    setTimeout(() => { const el = this.main.querySelector('.form input[type=text]'); if (el) { el.focus(); el.select(); } }, 30);
  }

  moveChapter(ch, d) {
    const list = this.game.story.chapters;
    const i = list.indexOf(ch), j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, ch);
    this.ed.markDirty();
    this.render();
  }

  async deleteChapter(ch) {
    const game = this.game;
    const qs = game.quests.filter((q) => q.chapter === ch.id);
    const msg = `Delete ${chapterLabel(game, ch)}, “${ch.name}”?${qs.length ? ` Its ${plural(qs.length, 'quest')} stay, in no chapter.` : ''}`;
    if (!(await confirmDialog(msg))) return;
    this.ed.checkpoint?.(`deleting ${ch.name || 'a chapter'}`);
    for (const q of qs) delete q.chapter;
    game.story.chapters.splice(game.story.chapters.indexOf(ch), 1);
    this.ed.markDirty();
    this.view = null;
    this.render();
  }

  addQuest() {
    const game = this.game;
    const ch = this.view?.kind === 'chapter' ? chapterById(game, this.view.id) : this.view?.kind === 'quest' ? chapterById(game, this.view.q.chapter) : null;
    const q = newQuest(game, ch ? { chapter: ch.id } : {});
    game.quests.push(q);
    this.ed.markDirty();
    this.selectQuest(q);
  }

  duplicateQuest(q) {
    const game = this.game;
    const c = deepClone(q);
    c.name += ' II';
    c.id = uniqueId(c.name, game.quests.map((x) => x.id));
    game.quests.push(c);
    this.ed.markDirty();
    this.selectQuest(c);
  }

  async deleteQuest(q) {
    const game = this.game;
    if (!(await confirmDialog(`Delete the quest “${q.name}”?`))) return;
    this.ed.checkpoint?.(`deleting ${q.name}`);
    const ch = q.chapter;
    game.quests.splice(game.quests.indexOf(q), 1);
    this.ed.markDirty();
    if (chapterById(game, ch)) this.selectChapter(ch); else this.showLoose();
  }
}
