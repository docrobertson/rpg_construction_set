// The designer's tools in a playtest launched from the Construction Set: a
// small 🛠 button in the HUD opens a panel to jump anywhere, fill the purse,
// give an item, level the company up, heal, lift the fog, finish the step of
// the tracked quest, keep the monsters off, and go back to the editor on the
// very square the party stands on.
//
// While the playtest runs, what it sees is written into the editor's realm
// (game.meta.playtest, see game/checklist.js coverageOf): the places visited,
// the quests started and finished, the chapters reached, wins and defeats.
// It is saved as the designer goes back to the Construction Set.
//
// setupPlaytest(game, state, opt) readies a play state before play begins:
// the company raised to a level, and the chapters before a chosen one played
// through (their quests done, with their rewards and flags).
import { h, clear, toast } from './dom.js';
import { iconSvg } from './icons.js';
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { getMap, worldMap } from '../data/schema.js';
import { placesOf } from '../world/places.js';
import { FEATURE_KINDS } from '../data/terrain.js';
import { xpForLevel, gainXp, perkChoices, choosePerk, maxHp, maxMp, partyAlive, levelUpNote } from '../game/rules.js';
import { ensureQuestState, startQuest, advanceQuest, checkQuests, questOf, questState, isDone, trackedQuest, currentStage } from '../game/quests.js';
import { chapterList, questsOfChapter } from '../game/story.js';
import { coverageOf, realmSig } from '../game/checklist.js';
import { sfx } from '../core/sound.js';

const flagList = (s) => String(s || '').split(/[,|]/).map((x) => x.trim()).filter(Boolean);

// ------------------------------------------------------------ before play
export function setupPlaytest(game, state, opt = {}) {
  ensureQuestState(state);
  if (opt.level > 1) raiseParty(game, state, opt.level);
  if (opt.chapter) {
    const r = prepareChapter(game, state, opt.chapter);
    if (opt.placeParty && r.pos) state.pos = r.pos;
    return r;
  }
  return null;
}

// Every hero up to `level`, talents chosen (the first offered), fully mended
export function raiseParty(game, state, level) {
  let L = Math.max(1, Math.round(level));
  while (L > 1 && !Number.isFinite(xpForLevel(L))) L--;
  for (const m of state.party.members) {
    if ((m.level || 1) < L) {
      m.xp = Math.max(m.xp || 0, xpForLevel(L));
      gainXp(game, m, 0);
    }
    for (let i = 0; i < 40 && m.perkPending > 0; i++) {
      const pick = perkChoices(game, m)[0];
      if (!pick || !choosePerk(game, m, pick.id)) break;
    }
    m.lvShown = m.level;
    m.hp = maxHp(game, m);
    m.mp = maxMp(game, m);
  }
}

// A level that suits the start of a chapter: a couple a chapter, or what
// the quests before it pay in experience (with as much again from battles)
export function suggestLevel(game, chapterId) {
  const chs = chapterList(game);
  const at = chs.findIndex((c) => c.id === chapterId);
  const base = Math.max(1, game.settings?.startLevel || 1);
  if (at <= 0) return base;
  let xp = 0;
  for (const ch of chs.slice(0, at)) for (const q of questsOfChapter(game, ch)) {
    xp += parseInt(q.reward?.xp, 10) || 0;
    for (const st of q.stages || []) xp += parseInt(st.reward?.xp, 10) || 0;
  }
  let byXp = 1;
  while (byXp < 20 && Number.isFinite(xpForLevel(byXp + 1)) && xpForLevel(byXp + 1) <= xp * 2) byXp++;
  return Math.min(20, Math.max(base + at * 2, byXp));
}

// Play the chapters before `chapterId` through on a play state: each of their
// quests started and finished in order (rewards, flags, follow-up quests), as
// if the party had done what each step asks — slain the foe (it leaves its
// map), found the item (its chest is opened), handed over what was asked for.
// Returns { done: [questIds], pos } (pos: beside whoever the chapter opens with).
export function prepareChapter(game, state, chapterId) {
  const chs = chapterList(game);
  const at = chs.findIndex((c) => c.id === chapterId);
  const res = { done: [], pos: null };
  if (at <= 0) return res;
  ensureQuestState(state);
  const earlier = chs.slice(0, at);
  // the quest functions want a session; this one plays without a screen
  const stub = { game, state, map: null, ui: null, log() {}, get party() { return state.party; } };
  const stopAt = new Map(); // a chapter that ends at a step of a quest stops that quest there
  for (const ch of earlier) {
    const end = ch.ends || {};
    if (end.type === 'stage' && end.quest) stopAt.set(end.quest, Math.max(stopAt.get(end.quest) || 0, parseInt(end.stage, 10) || 0));
    if (end.type === 'flag') for (const f of flagList(end.flag)) state.party.flags[f] = true;
  }
  const ids = new Set(earlier.flatMap((ch) => questsOfChapter(game, ch).map((q) => q.id)));
  for (const id of stopAt.keys()) ids.add(id);
  // in an order that keeps "only after finishing"
  const order = [], left = [...ids];
  while (left.length) {
    let i = left.findIndex((id) => { const q = questOf(game, id); return !q?.requires || !ids.has(q.requires) || order.includes(q.requires); });
    if (i < 0) i = 0;
    order.push(...left.splice(i, 1));
  }
  for (const id of order) {
    const q = questOf(game, id);
    if (!q) continue;
    if (!questState(state, id)) startQuest(stub, id, { quiet: true });
    const stop = stopAt.has(id) ? stopAt.get(id) : Infinity;
    for (let guard = 0; guard < 80; guard++) {
      const qs = questState(state, id);
      if (!qs || qs.status !== 'active' || qs.stage >= stop) break;
      playGoal(game, state, q.stages?.[qs.stage]?.goal);
      advanceQuest(stub, id);
      checkQuests(stub);
    }
    if (isDone(state, id)) res.done.push(id);
  }
  state.tracked = null;
  state.pinned = null;
  res.pos = openingSpot(game, state, chs[at]);
  return res;
}

const mapState = (state, id) => (state.maps[id] ||= { removed: [], tiles: {}, moved: {}, explored: null });

function held(state, id) {
  const p = state.party;
  let n = p.inventory[id] || 0;
  for (const m of p.members) for (const v of Object.values(m.equip || {})) if (v === id) n++;
  return n;
}

// the first thing still on the maps that matches, marked gone from play
function takeFromWorld(game, state, pred, all = false) {
  for (const m of game.maps) {
    const gone = new Set(state.maps[m.id]?.removed || []);
    for (const e of m.entities || []) {
      if (gone.has(e.id) || !pred(e, m)) continue;
      mapState(state, m.id).removed.push(e.id);
      if (!all) return e;
    }
  }
  return null;
}

// What the party would have done for a step of a quest
function playGoal(game, state, g) {
  if (!g) return;
  const p = state.party;
  const n = Math.max(1, parseInt(g.n, 10) || 1);
  switch (g.type) {
    case 'kill':
      p.flags['killed_' + g.monster] = true;
      state.kills[g.monster] = (state.kills[g.monster] || 0) + n;
      takeFromWorld(game, state, (e) => e.type === 'monster' && e.monster === g.monster);
      break;
    case 'collect':
    case 'deliver': {
      const chest = takeFromWorld(game, state, (e) => (e.type === 'chest' || e.type === 'treasure') && (e.items || []).some((it) => it.id === g.item));
      if (g.type === 'collect') { if (held(state, g.item) < n) p.inventory[g.item] = (p.inventory[g.item] || 0) + n - held(state, g.item); }
      else if (!chest) p.inventory[g.item] = Math.max(0, (p.inventory[g.item] || 0) - n); // handed over
      break;
    }
    case 'reach': if (g.map) mapState(state, g.map); break;
    case 'clear': if (g.map) takeFromWorld(game, state, (e, m) => m.id === g.map && e.type === 'monster', true); break;
    case 'flag': for (const f of flagList(g.flags || g.flag)) p.flags[f] = true; break;
    default:
  }
}

// Beside whoever the chapter begins with: the person its first open quest
// sends the party to, or who offers it, or the first of its cast
function openingSpot(game, state, ch) {
  const qs = questsOfChapter(game, ch);
  const tryNpc = (id) => besideNpc(game, state, id);
  for (const q of qs) {
    const st = questState(state, q.id);
    if (st?.status === 'active') {
      const g = q.stages?.[st.stage]?.goal;
      const spot = tryNpc(g && (g.type === 'talk' || g.type === 'deliver') ? g.npc || q.giver : q.giver);
      if (spot) return spot;
    } else if (!st && q.giver && (!q.requires || isDone(state, q.requires))) {
      const spot = tryNpc(q.giver);
      if (spot) return spot;
    }
  }
  for (const c of ch.cast || []) { const spot = tryNpc(c.npc); if (spot) return spot; }
  return null;
}

function besideNpc(game, state, id) {
  if (!id) return null;
  for (const m of game.maps) {
    const e = (m.entities || []).find((x) => x.id === id && x.type === 'npc');
    if (!e) continue;
    const spot = freeSquareNear(m, e.x, e.y, 4);
    return spot ? { map: m.id, ...spot } : null;
  }
  return null;
}

// an open square near (x, y): walkable, not a site, not water, nobody on it
export function freeSquareNear(map, x, y, reach = 5) {
  const ok = (nx, ny) => {
    if (!inBounds(map, nx, ny)) return false;
    const t = terrain(getTile(map, nx, ny));
    return t.walk && !t.feature && !t.water && !t.dmg && !t.door && !(map.entities || []).some((e) => e.x === nx && e.y === ny && e.type !== 'treasure');
  };
  for (let r = 1; r <= reach; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return null;
}

// ------------------------------------------------------------ in play
export class TestTools {
  constructor(app, session) {
    this.app = app;
    this.s = session;
    this.ui = session.ui;
    this.open = false;
    const ed = app.editor;
    this.cov = ed ? coverageOf(ed.game, true) : null;
    if (this.cov) {
      const now = Date.now();
      this.cov.count++;
      this.cov.last = now;
      this.cov.sig = realmSig(ed.game);
      if (session.opts.chapter) this.cov.chapters[session.opts.chapter] = now;
      this.dirty = true;
    }
    this.hook();
    this.build();
  }

  // ---------------------------------------------------------- coverage
  hook() {
    const ui = this.ui;
    const was = { quest: ui.onQuestEvent, map: ui.onMapChanged, win: ui.showVictory, lose: ui.showGameOver };
    this.was = was;
    ui.onQuestEvent = (kind, q, extra) => { this.onQuest(kind, q, extra); return was.quest?.call(ui, kind, q, extra); };
    ui.onMapChanged = () => { this.note('visited', this.s.map?.id); this.refresh(); return was.map.call(ui); };
    ui.showVictory = () => { if (!this.won) { this.won = true; this.bump('wins'); } return was.win.call(ui); };
    ui.showGameOver = () => { this.bump('defeats'); return was.lose.call(ui); };
  }

  onQuest(kind, q, extra) {
    const c = this.cov;
    if (!c || !q) return;
    if (kind === 'chapter') { this.note('chapters', q.id || extra?.chapter); return; }
    if (!q.id) return;
    if (kind === 'done') c.quests[q.id] = 'done';
    else if (c.quests[q.id] !== 'done') c.quests[q.id] = 'started';
    // a chapter is reached once one of its quests is under way
    if (q.chapter) this.note('chapters', q.chapter);
    this.dirty = true;
    this.refresh();
  }

  note(key, id) {
    if (!this.cov || !id || (key === 'visited' && !getMap(this.app.editor.game, id))) return; // (not a battle's arena)
    if (!this.cov[key][id]) this.cov[key][id] = Date.now();
    this.dirty = true;
  }

  bump(key) { if (this.cov) { this.cov[key] = (this.cov[key] || 0) + 1; this.dirty = true; } }

  destroy() {
    const ui = this.ui;
    if (this.was) { ui.onQuestEvent = this.was.quest; ui.onMapChanged = this.was.map; ui.showVictory = this.was.win; ui.showGameOver = this.was.lose; }
    this.btn?.remove();
    this.panel?.remove();
    const ed = this.app.editor;
    if (this.dirty && ed) { ed.dirty = true; ed.save(true); }
  }

  // ---------------------------------------------------------- the panel
  build() {
    const head = this.ui.root.querySelector('.hud-head');
    this.btn = h('button.hud-tools', { title: 'Designer\'s tools: go anywhere, give gold and items, level up, finish a step — or go back to editing here', onclick: () => this.toggle() },
      h('span.ht-ico', '🛠'), h('span.ht-l', 'Tools'));
    head.insertBefore(this.btn, head.querySelector('.hud-help'));
    this.panel = h('div.tt-panel');
    this.panel.hidden = true;
    this.ui.root.appendChild(this.panel);
  }

  toggle(on = !this.open) {
    this.open = on;
    this.panel.hidden = !on;
    this.btn.classList.toggle('on', on);
    if (on) this.render();
    sfx('click');
  }

  refresh() { if (this.open) this.render(); }

  render() {
    const s = this.s, g = s.game, P = this.panel;
    clear(P);
    const calm = s.mode === 'explore' && !s.battle;
    P.appendChild(h('div.tt-head', h('b', '🛠 Designer\'s tools'), h('span.tt-sub'),
      h('button.tt-x', { title: 'Close', 'aria-label': 'Close', onclick: () => this.toggle(false), html: iconSvg('close') })));
    if (!calm) { P.appendChild(h('p.tt-note', 'Not in the middle of a battle.')); return; }

    // go anywhere
    const places = placesOf(g);
    const world = worldMap(g);
    const sel = h('select.tt-place');
    sel.appendChild(h('option', { value: world.id }, `${world.name} (the start)`));
    const og = h('optgroup', { label: 'Places' });
    for (const p of places) og.appendChild(h('option', { value: p.map.id }, `${p.map.name} — ${FEATURE_KINDS[p.kind]?.label || p.kind}`));
    sel.appendChild(og);
    sel.value = places.some((p) => p.map.id === this.lastPlace) ? this.lastPlace : s.map.id;
    const beside = h('button.small', { title: 'Stand beside its gate on the world map', onclick: () => this.goBeside(sel.value) }, 'Beside it');
    const syncBeside = () => { beside.disabled = !places.find((p) => p.map.id === sel.value)?.portal; };
    sel.addEventListener('change', () => { this.lastPlace = sel.value; syncBeside(); sel.blur(); });
    syncBeside();
    P.appendChild(h('div.tt-sec', h('div.tt-label', 'Go to'), sel,
      h('div.tt-row', h('button.small', { onclick: () => this.goInside(sel.value) }, 'Go there'), beside)));

    // the company
    const item = h('select.tt-item');
    const groups = {};
    for (const it of g.items || []) (groups[it.type] ||= []).push(it);
    for (const [type, list] of Object.entries(groups)) {
      const o = h('optgroup', { label: type });
      for (const it of list) o.appendChild(h('option', { value: it.id }, it.name));
      item.appendChild(o);
    }
    if (this.lastItem) item.value = this.lastItem;
    item.addEventListener('change', () => { this.lastItem = item.value; item.blur(); });
    P.appendChild(h('div.tt-sec', h('div.tt-label', 'The company'),
      h('div.tt-grid',
        h('button.small', { onclick: () => this.gold() }, '+500 gold'),
        h('button.small', { onclick: () => this.heal() }, 'Heal everyone'),
        h('button.small', { onclick: () => this.levelUp() }, 'Level up'),
        h('button.small', { onclick: () => this.reveal() }, 'Reveal this map')),
      h('div.tt-row', item, h('button.small', { onclick: () => this.give(item.value) }, 'Give'))));

    // the story
    const q = trackedQuest(s);
    const st = q ? currentStage(s, q) : null;
    const peace = h('input', { type: 'checkbox' });
    peace.checked = !!s.peaceful;
    peace.addEventListener('change', () => { s.peaceful = peace.checked; s.log(peace.checked ? '🛠 The monsters leave you alone.' : '🛠 The monsters take notice again.', 'magic'); peace.blur(); });
    P.appendChild(h('div.tt-sec', h('div.tt-label', 'The story'),
      h('button.small.tt-wide', { disabled: !q, onclick: () => this.finishStep(), title: q ? 'Count the current step of the quest you are following as done' : 'No quest under way' },
        q ? h('span', 'Finish this step', h('small', `${q.name}: ${st?.text || 'the last step'}`)) : 'No quest under way'),
      h('label.tt-check', peace, h('span', 'Monsters leave us alone'))));

    P.appendChild(h('div.tt-foot',
      h('button.primary.tt-wide', { onclick: () => this.editHere(), title: 'Back to the Construction Set, on the Details step, looking at this square' },
        '✎ Edit here', h('small', `${s.map.name} · ${s.state.pos.x}, ${s.state.pos.y}`))));
  }

  // ---------------------------------------------------------- the tools
  ready() {
    const s = this.s;
    if (s.mode !== 'explore' || s.battle || s.transitioning || s.busy) { toast('Not just now: finish what is happening first.', 'warn'); return false; }
    return true;
  }

  async jump(mapId, x, y, what) {
    const s = this.s;
    if (!this.ready()) return;
    if (s.state.vehicle) { s.state.vehicle = null; s.refreshPartyVisual(); }
    await s.enterMap(mapId, x, y);
    s.log(`🛠 You are whisked to ${what}.`, 'magic');
    this.refresh();
  }

  goInside(id) {
    const g = this.s.game, m = getMap(g, id);
    if (!m) return;
    const st = g.settings.start;
    let x, y;
    if (st?.map === m.id) ({ x, y } = st);
    else if (m.type === 'world') { x = Math.floor(m.w / 2); y = Math.floor(m.h / 2); }
    else { x = m.entry?.x ?? Math.floor(m.w / 2); y = m.entry?.y ?? m.h - 2; }
    const t = inBounds(m, x, y) ? terrain(getTile(m, x, y)) : null;
    if (!t?.walk) { const p = freeSquareNear(m, x, y, 12); if (p) ({ x, y } = p); }
    return this.jump(m.id, x, y, m.name);
  }

  goBeside(id) {
    const p = placesOf(this.s.game).find((x) => x.map.id === id);
    if (!p?.portal) return;
    const spot = freeSquareNear(p.world, p.portal.x, p.portal.y, 4);
    if (!spot) { toast(`No open ground beside ${p.map.name}.`, 'warn'); return; }
    return this.jump(p.world.id, spot.x, spot.y, `the gates of ${p.map.name}`);
  }

  gold() {
    this.s.party.gold += 500;
    this.s.log('🛠 500 gold appears in your purse.', 'loot');
    sfx('gold');
    this.s.ui.refresh();
  }

  give(id) {
    const s = this.s, it = (s.game.items || []).find((x) => x.id === id);
    if (!it) return;
    s.party.inventory[id] = (s.party.inventory[id] || 0) + 1;
    s.log(`🛠 You receive ${/^[aeiou]/i.test(it.name) ? 'an' : 'a'} ${it.name}.`, 'loot');
    sfx('gold');
    s.ui.refresh();
  }

  heal() {
    const s = this.s, g = s.game;
    for (const m of s.party.members) { m.status = 'ok'; m.hp = maxHp(g, m); m.mp = maxMp(g, m); m.buffs = []; }
    s.refreshPartyVisual();
    s.view.sparkle?.(s.state.pos.x, s.state.pos.y, 0xa0ffa0, 16);
    s.log('🛠 The whole company is mended.', 'good');
    sfx('heal');
    s.ui.refresh();
  }

  levelUp() {
    if (!this.ready()) return;
    const s = this.s, g = s.game;
    for (const m of partyAlive(s.party)) {
      const need = xpForLevel((m.level || 1) + 1) - (m.xp || 0);
      if (!Number.isFinite(need)) continue;
      if (gainXp(g, m, Math.max(0, need)).length) s.log(levelUpNote(m, g), 'level');
    }
    s.ui.refresh(); // (the level-up card offers the new talents)
    this.refresh();
  }

  reveal() {
    const s = this.s, m = s.map;
    if (m.explored) m.explored.fill(1);
    s.updateVisibility(true);
    s.ui.drawMinimap?.();
    s.log(`🛠 All of ${m.name} is revealed.`, 'magic');
  }

  finishStep() {
    if (!this.ready()) return;
    const s = this.s, q = trackedQuest(s);
    if (!q) return;
    advanceQuest(s, q.id);
    checkQuests(s);
    s.ui.refresh();
    this.refresh();
  }

  editHere() {
    const s = this.s, app = this.app;
    const id = s.map?.id, { x, y } = s.state.pos;
    if (!this.ready()) return;
    app.endPlay(true);
    const ed = app.editor;
    if (!ed || !getMap(ed.game, id)) return;
    ed.goTo({ tab: 'map', map: id, x, y });
    ed.lookSpot = { map: id, x, y };
    ed.view.setHighlights([{ x, y }], 0xffe080, 0.5); // (until the next tool is picked)
    toast(`Back to editing ${ed.map.name}, where the party stood (${x}, ${y}).`);
  }
}
