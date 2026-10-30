// Quest UI for play mode: the always-visible tracker, quest banners, the
// Journal (J), quest offers inside conversations, and the window for points
// of interest and little text events.
import { h, clear, modal, anyModal } from './dom.js';
import { sfx } from '../core/sound.js';
import { itemOf } from '../game/rules.js';
import { portrait } from '../render/portrait.js';
import {
  activeQuests, doneQuests, trackedQuest, currentStage, questState, stageLine, stageLineHere, guidance, questPins, onTalk, offersFrom, startQuest, npcMarker,
  goalTarget, pinQuest, isPinned, greetingFor,
} from '../game/quests.js';
import { activeBlessings, resolveChoice, choiceState, eventUsedRecently, eventLook, EVENT_KINDS } from '../game/events.js';
import * as Quests from '../game/quests.js';
import * as Events from '../game/events.js';
import { serializeGame, deserializeGame, cloneGame } from '../data/schema.js';

// handles for tests and the browser console
if (typeof window !== 'undefined') {
  window.__quests = Quests;
  window.__events = Events;
  window.__schema = { serializeGame, deserializeGame, cloneGame };
}

const MARKER_TEXT = {
  quest: 'has a task for you',
  turnin: 'wants to speak with you about your quest',
  progress: 'awaits news of your quest',
  merchant: 'travelling merchant',
  shop: 'merchant',
  inn: 'innkeeper',
  healer: 'healer',
  recruit: 'might join you',
};
export const markerText = (k) => MARKER_TEXT[k] || '';

export function rewardText(game, r) {
  if (!r) return '';
  const out = [];
  if (+r.gold) out.push(`◆ ${r.gold} gold`);
  if (+r.xp) out.push(`${r.xp} XP`);
  if (+r.food) out.push(`${r.food} food`);
  for (const it of r.items || []) { const d = itemOf(game, it.id); if (d) out.push((+it.n > 1 ? it.n + ' × ' : '') + d.name); }
  return out.join(' · ');
}

export class QuestUI {
  constructor(ui) {
    this.ui = ui;
    this.s = ui.s;
    this.banners = [];
    this.el = h('div.qtrack', { title: 'Your current goal — click for the Journal (J)' });
    this.el.addEventListener('click', (e) => { if (!e.target.closest('.qt-other-row')) this.openJournal(); });
    ui.root.appendChild(this.el);
    this.bannerHost = h('div.qbanner-host');
    ui.root.appendChild(this.bannerHost);
    // the session talks to the PlayUI; these land here
    ui.openEvent = (e) => this.openEvent(e);
    ui.onQuestEvent = (kind, q, extra) => this.onQuestEvent(kind, q, extra);
    ui.openJournal = () => this.openJournal();
  }

  destroy() { clearTimeout(this.waitT); this.el.remove(); this.bannerHost.remove(); this.banners.length = 0; }

  // ------------------------------------------------------------ tracker
  refresh() {
    const s = this.s;
    const el = this.el;
    if (!s.state.quests) return;
    el.hidden = !!s.battle;
    if (s.battle) return;
    const q = trackedQuest(s);
    // people wander: follow where the one we are after stands now
    const tgt = q ? goalTarget(s, q) : null;
    const sig = JSON.stringify([s.state.pos, s.state.quests, s.state.tracked, s.state.pinned, s.state.blessings, s.state.turn % 50 === 0, s.map?.id, tgt]);
    if (sig === this.sig) return;
    this.sig = sig;
    clear(el);
    const pinned = isPinned(s, q);
    el.appendChild(h('div.qt-head', h('span', '📜 ', q ? (q.main ? 'Main quest' : 'Quest') : 'Journal'),
      pinned ? h('button.qt-pin', { title: 'You chose to follow this quest — click to follow the story again', onclick: (e) => { e.stopPropagation(); pinQuest(s, null); sfx('click'); this.sig = null; this.refresh(); } }, '📌 Pinned ×') : null,
      h('span.qt-key', 'Journal · J')));
    if (q) {
      const g = guidance(s, q);
      el.appendChild(h('div.qt-name' + (q.main ? '.main' : ''), q.main ? '★ ' : '', q.name));
      el.appendChild(h('div.qt-goal', g?.here ? stageLineHere(s, q) : stageLine(s, q)));
      if (g && g.text) {
        const arrow = h('span.qt-arrow', g.angle != null ? '➜' : (g.arrow || '•'));
        if (g.angle != null) arrow.style.transform = `rotate(${g.angle}rad)`;
        el.appendChild(h('div.qt-dir', arrow, h('span', g.text)));
      }
    } else {
      el.appendChild(h('div.qt-goal.none', activeQuests(s).length ? '' : 'No quest under way. Look for people marked ! and talk to them.'));
    }
    const others = activeQuests(s).filter((x) => x !== q).slice(0, 3);
    for (const o of others) {
      el.appendChild(h('div.qt-other-row', {
        title: 'Follow this quest instead (pins it until you change it or it is done)',
        onclick: (e) => { e.stopPropagation(); pinQuest(s, o.id); sfx('click'); this.sig = null; this.refresh(); },
      }, h('b', o.name), h('span', ' — ' + stageLine(s, o))));
    }
    const more = activeQuests(s).length - 1 - others.length;
    if (more > 0) el.appendChild(h('div.qt-more', `+ ${more} more in the Journal`));
    const bl = activeBlessings(s);
    if (bl.length) el.appendChild(h('div.qt-bless', ...bl.map((b) => h('span', { title: `${b.desc} — ${b.left} turns left` }, '✦ ', b.name))));
  }

  // ------------------------------------------------------------ banners
  onQuestEvent(kind, q, extra = {}) {
    const s = this.s;
    let title, line;
    if (kind === 'start') { title = q.main ? 'Main quest' : 'New quest'; line = q.stages?.[0]?.text || ''; sfx('level'); }
    else if (kind === 'stage') { title = 'Quest updated'; line = currentStage(s, q)?.text || ''; sfx('click'); }
    else { title = 'Quest complete!'; line = rewardText(s.game, q.reward); sfx('victory'); }
    const got = extra.got && extra.got.length && kind !== 'done' ? 'Received: ' + extra.got.join(', ') : '';
    this.banner(h('div.qbanner.' + kind, h('div.qb-kind', title), h('div.qb-name', q.name), line ? h('div.qb-line', kind === 'done' && line ? 'Reward: ' + line : line) : null, got ? h('div.qb-line.got', got) : null));
    this.sig = null;
    this.ui.refresh();
  }

  // One banner at a time: several quest changes at once play in turn
  banner(el) {
    this.banners.push(el);
    if (this.banners.length > 4) this.banners.splice(0, this.banners.length - 4);
    if (!this.showing) this.nextBanner();
  }

  nextBanner() {
    // never over a window: wait until the conversation / victory panel is closed
    if (this.banners.length && anyModal()) {
      this.showing = true;
      clearTimeout(this.waitT);
      this.waitT = setTimeout(() => { this.showing = null; if (this.bannerHost.isConnected) this.nextBanner(); }, 400);
      return;
    }
    const el = this.banners.shift();
    this.showing = el || null;
    if (!el) return;
    this.bannerHost.appendChild(el);
    let gone = false;
    const kill = () => {
      if (gone) return;
      gone = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); this.nextBanner(); }, 450);
    };
    el.addEventListener('click', kill);
    setTimeout(kill, this.banners.length ? 2400 : 4200);
  }

  // ------------------------------------------------------------ minimap / map pins
  // Returns what was drawn ({ tracked, other, events: Set of kinds }) for the map key
  drawPins(ctx, scale, opts = {}) {
    const s = this.s;
    const shown = { tracked: false, other: false, events: new Set() };
    if (!s.map || !s.state.quests) return shown;
    const map = s.map;
    if (opts.events) {
      for (const e of map.entities) {
        if (e.type !== 'event' || (s.visible && !map.explored[e.y * map.w + e.x])) continue;
        const known = { shrine: '#ffd870', campfire: '#ff8a30', lore: '#b0b8ff', well: '#60b0ff' };
        const c = known[e.kind] || '#d0a0ff';
        shown.events.add(known[e.kind] ? e.kind : 'other');
        ctx.fillStyle = c;
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.arc(e.x * scale + scale / 2, e.y * scale + scale / 2, Math.max(2, scale * 0.6), 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }
    for (const p of questPins(s)) {
      // a way point that lies off this map's grid would be pinned to its edge
      if (p.x < 0 || p.y < 0 || p.x >= map.w || p.y >= map.h) continue;
      if (p.tracked) shown.tracked = true; else shown.other = true;
      const x = p.x * scale + scale / 2, y = p.y * scale + scale / 2;
      const r = Math.max(2, scale * (p.tracked ? 1.4 : 1));
      ctx.fillStyle = p.tracked ? '#ffe040' : '#e0a0ff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(1, scale / 4);
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.4); ctx.lineTo(x - r, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (scale >= 4) {
        // a dark tag above the pin, clear of the company's dot and the site under it
        const size = Math.max(10, Math.round(scale * 1.6));
        ctx.font = `bold ${size}px serif`;
        const w = ctx.measureText(p.quest.name).width + 10, ht = size + 6;
        const bx = x - w / 2, by = y - r * 1.4 - 5 - ht;
        ctx.fillStyle = 'rgba(16,11,6,.86)';
        ctx.strokeStyle = p.tracked ? '#a8823c' : '#7a5a8a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(bx, by, w, ht, ht / 2) : ctx.rect(bx, by, w, ht);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = p.tracked ? '#ffe040' : '#e0a0ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.quest.name, x, by + ht / 2 + 1);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }
    return shown;
  }

  // ------------------------------------------------------------ conversations
  // Called once a conversation opens: settle quest business, then offer new quests
  dialogHook(npc, { add, sayLine }) {
    const s = this.s;
    for (const l of onTalk(s, npc)) {
      if (l.say) sayLine(l.say);
      if (l.got) add(h('p.note.qnote.got', '🎁 ' + l.note));
      else if (l.note) add(h('p.note.qnote' + (l.done ? '.done' : ''), (l.done ? '★ ' : '📜 ') + l.note));
      if (l.done) {
        const rt = rewardText(s.game, l.quest.reward);
        if (rt) add(h('p.note.qnote.got', '🎁 Reward: ' + rt));
      }
    }
    for (const q of offersFrom(s, npc)) {
      const btns = h('div.qo-btns');
      const card = h('div.qoffer',
        h('div.qo-title', '📜 ', q.name, q.main ? h('span.qo-main', 'main quest') : null),
        q.offer ? h('p.qo-text', q.offer) : null,
        h('div.qo-goal', 'Goal: ', q.stages?.[0]?.text || ''),
        rewardText(s.game, q.reward) ? h('div.qo-reward', 'Reward: ', rewardText(s.game, q.reward)) : null,
        btns);
      btns.append(
        h('button.primary.small', {
          onclick: () => {
            clear(btns);
            startQuest(s, q.id);
            btns.appendChild(h('span.qo-accepted', '✔ Quest accepted — see your Journal (J) to follow it'));
            if (q.accept) sayLine(q.accept);
            this.ui.refresh();
          },
        }, 'Accept quest'),
        h('button.small', { onclick: () => { clear(btns); btns.appendChild(h('span.qo-later', 'Perhaps later.')); } }, 'Not now'));
      add(card);
    }
  }

  // Head line of a conversation: what this person is about
  markerFor(npc) { return npcMarker(this.s, npc); }

  // What they say first: thanks once their quest is done, else their greeting
  greetingFor(npc) { return greetingFor(this.s, npc); }

  // ------------------------------------------------------------ journal
  openJournal(tab = 'active', focus = null) {
    const s = this.s, g = s.game;
    if (s.mode === 'combat') return;
    sfx('click');
    const body = h('div.journal');
    let sel = focus || trackedQuest(s);
    const render = () => {
      clear(body);
      const act = activeQuests(s), done = doneQuests(s);
      body.appendChild(h('div.tabs',
        h('button' + (tab === 'active' ? '.on' : ''), { onclick: () => { tab = 'active'; sel = trackedQuest(s); render(); } }, `Under way (${act.length})`),
        h('button' + (tab === 'done' ? '.on' : ''), { onclick: () => { tab = 'done'; sel = done[done.length - 1] || null; render(); } }, `Completed (${done.length})`),
        h('button' + (tab === 'lore' ? '.on' : ''), { onclick: () => { tab = 'lore'; render(); } }, `Lore & blessings (${s.state.lore.length})`)));
      if (tab === 'lore') return renderLore();
      const list = tab === 'active' ? act : done;
      if (!list.includes(sel)) sel = list[0] || null;
      const left = h('div.j-list');
      if (!list.length) left.appendChild(h('p.hint', tab === 'active' ? 'No quests under way. People with a task for you are marked “!” — go and talk to them.' : 'Nothing finished yet.'));
      for (const q of list) {
        left.appendChild(h('button.j-item' + (q === sel ? '.on' : '') + (q.main ? '.main' : ''), { onclick: () => { sel = q; render(); } },
          h('b', q.main ? '★ ' : '', q.name),
          h('span', tab === 'active' ? stageLine(s, q) : 'Completed')));
      }
      const right = h('div.j-detail');
      if (sel) renderQuest(right, sel);
      body.appendChild(h('div.j-cols', left, right));
    };
    const renderQuest = (el, q) => {
      const qs = questState(s.state, q.id);
      const active = qs?.status === 'active';
      el.appendChild(h('h3', q.main ? '★ ' : '', q.name));
      const giver = q.giver ? findName(g, q.giver) : null;
      if (giver) el.appendChild(h('div.j-giver', `Given by ${giver}`));
      if (q.summary || q.offer) el.appendChild(h('p.j-summary', q.summary || q.offer));
      const steps = h('ol.j-steps');
      (q.stages || []).forEach((st, i) => {
        if (active && i > qs.stage) return;
        const cur = active && i === qs.stage;
        const li = h('li' + (cur ? '.cur' : '.done'), cur ? stageLine(s, q) : st.text);
        if (cur) {
          const gd = guidance(s, q);
          if (gd && gd.text) li.appendChild(h('div.j-where', '➜ ', gd.text));
        }
        steps.appendChild(li);
      });
      el.appendChild(steps);
      if (!active && q.doneText) el.appendChild(h('p.j-done', q.doneText));
      const rt = rewardText(g, q.reward);
      if (rt) el.appendChild(h('div.j-reward', active ? 'Reward: ' : 'You were rewarded with: ', rt));
      if (active) {
        const tracked = trackedQuest(s) === q;
        const pinned = isPinned(s, q);
        const redo = () => { this.sig = null; this.ui.refresh(); render(); };
        el.appendChild(h('div.row',
          tracked ? h('span.hint', pinned ? '📌 Pinned: shown on screen and on the map' : '◎ Shown on screen and on the map') : null,
          pinned ? h('button.small', { title: 'Let the tracker follow the story again', onclick: () => { pinQuest(s, null); redo(); } }, 'Unpin')
            : h('button.small', { title: 'Keep this quest on screen until you choose another or it is done', onclick: () => { pinQuest(s, q.id); redo(); } }, '📌 Pin to the screen')));
      }
    };
    const renderLore = () => {
      const bl = activeBlessings(s);
      const box = h('div.j-lore');
      box.appendChild(h('div.sub', 'Blessings upon you'));
      if (!bl.length) box.appendChild(h('p.hint', 'None. Shrines across the land grant blessings to those who pray.'));
      for (const b of bl) box.appendChild(h('p', h('b', '✦ ', b.name), ` — ${b.desc} (${b.left} turns left)`));
      box.appendChild(h('div.sub', 'Lore'));
      if (!s.state.lore.length) box.appendChild(h('p.hint', 'Standing stones and old inscriptions you study are recorded here.'));
      for (const l of [...s.state.lore].reverse()) box.appendChild(h('div.j-lore-entry', h('b', l.title), h('p', l.text)));
      body.appendChild(box);
    };
    render();
    modal(body, { title: '📜 Journal', cls: 'wide journal-modal' });
  }

  // ------------------------------------------------------------ points of interest & events
  openEvent(e) {
    const s = this.s, g = s.game;
    s.queued = null;
    if (eventUsedRecently(s, e)) {
      s.log(e.kind === 'campfire' ? 'The camp is still warm from your last rest. Come back tomorrow.' : `${e.name || 'It'} is quiet now. Perhaps tomorrow.`);
      sfx('bump');
      return;
    }
    s.view.face('party', e.x - s.state.pos.x, e.y - s.state.pos.y);
    s.mode = 'dialog';
    sfx('click');
    const body = h('div.event');
    const look = eventLook(e);
    const pic = look.kind === 'humanoid' ? portrait(s.view, look) : null;
    let pendingFight = null;
    const m = modal(body, {
      title: (EVENT_KINDS[e.kind]?.icon || '❔') + ' ' + (e.name || 'Something curious'),
      cls: 'event-modal',
      onClose: () => {
        if (s.mode === 'dialog') s.mode = 'explore';
        this.ui.refresh();
        if (pendingFight) {
          const f = pendingFight;
          pendingFight = null;
          setTimeout(async () => {
            s.log(`${e.name || 'The foe'} attacks!`, 'bad');
            const once = e.repeat === 'once' || !e.repeat;
            const out = await s.engage({ id: '__ev_' + e.id, monster: f.monster, count: f.count, roaming: true, alsoRemove: once ? e.id : null });
            if (out && out.outcome === 'victory' && (e.repeat === 'once' || !e.repeat) && s.map.entities.includes(e)) s.removeEntity(e);
          }, 50);
        }
      },
    });
    const showChoices = () => {
      clear(body);
      body.appendChild(h('div.ev-top', pic ? h('img.ev-pic', { src: pic, alt: '' }) : null, h('p.ev-text', e.text || '')));
      const list = h('div.choose-list');
      (e.choices || []).forEach((c, i) => {
        const cs = choiceState(s, c);
        const tags = [];
        if (c.req && c.req.type && c.req.type !== 'none' && cs.tag) tags.push(cs.tag);
        if (+c.cost?.gold) tags.push(`◆ ${c.cost.gold}`);
        if (+c.cost?.food) tags.push(`${c.cost.food} food`);
        if (c.cost?.item) tags.push(itemOf(g, c.cost.item)?.name || c.cost.item);
        if (c.chance != null && c.chance !== '' && +c.chance < 1) tags.push('a gamble');
        list.appendChild(h('button.choose-item' + (cs.ok ? '' : '.disabled'), {
          title: cs.ok ? '' : cs.why,
          onclick: () => { if (cs.ok) choose(c); else sfx('error'); },
        }, h('span.ci-key', String(i + 1)), h('span.ci-label', c.label || '…', tags.length ? h('span.ev-tag', ' [' + tags.join(', ') + ']') : null),
        !cs.ok ? h('span.ci-sub', cs.why) : cs.who && c.req?.type && c.req.type !== 'none' ? h('span.ci-sub', `${cs.who.name} can do this`) : null));
      });
      body.appendChild(list);
    };
    const choose = (c) => {
      const res = resolveChoice(s, e, c);
      if (res.leave) { m.close(); return; }
      clear(body);
      body.appendChild(h('div.ev-top', pic ? h('img.ev-pic', { src: pic, alt: '' }) : null, h('p.ev-text', res.text || '')));
      if (res.got?.length) body.appendChild(h('p.ev-got' + (res.success === false ? '.bad' : ''), res.got.join(' · ')));
      s.log(`${e.name || 'Event'}: ${res.text}${res.got?.length ? ' (' + res.got.join(', ') + ')' : ''}`, res.success === false ? 'warn' : 'good');
      if (res.success !== false) sfx('gold');
      if (res.fight) pendingFight = res.fight;
      else if (res.remove && s.map.entities.includes(e)) s.removeEntity(e);
      if (!res.fight) s.autosave?.();
      body.appendChild(h('div.modal-buttons.ev-btns', h('button.primary', { onclick: () => m.close() }, res.fight ? 'To arms!' : 'Continue')));
      this.ui.refresh();
    };
    showChoices();
    const keyer = (ev) => {
      const n = parseInt(ev.key, 10);
      const btns = body.querySelectorAll('.choose-list .choose-item');
      if (n >= 1 && n <= btns.length) { ev.stopPropagation(); btns[n - 1].click(); }
    };
    m.back.tabIndex = -1;
    m.back.addEventListener('keydown', keyer);
    setTimeout(() => m.back.focus(), 10);
  }
}

function findName(game, npcId) {
  for (const m of game.maps) {
    const e = m.entities.find((x) => x.id === npcId);
    if (e) return `${e.name || 'someone'}${m.type !== 'world' ? ' of ' + m.name : ''}`;
  }
  return null;
}

