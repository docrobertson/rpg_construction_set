// The company's people in play: a clue found, a companion parting ways, the
// journal's Mysteries page and the window where the guilty one is named.
import { h, clear, modal, toast, closeAllModals } from './dom.js';
import { sfx } from '../core/sound.js';
import { portrait } from '../render/portrait.js';
import { getMap } from '../data/schema.js';
import {
  findNpc, knownMysteries, mysteryById, mysteryState, canAccuse, accuse, judgeInReach, cluesNeeded,
} from '../game/company.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// a person's face (as they stand in the story), or nothing
function face(ui, npcId) {
  const f = findNpc(ui.s.game, npcId);
  if (!f) return '';
  try { return portrait(ui.view, ui.s.entityLook(f.npc)); } catch { return ''; }
}

export const companyUI = {
  // "Clue found": a toast over the map and a line in the log
  onClue(ui, my, cl) {
    sfx('gold');
    toast(`Clue found — ${cl.text || my.name}`, 'clue');
    ui.s.log(`Clue found (${my.name}): ${cl.text || 'something that does not add up'}`, 'quest');
  },

  // a companion leaves: a banner over the map, as quests have
  onParting(ui, m, hostile) {
    sfx(hostile ? 'encounter' : 'click');
    ui.quests?.banner(h('div.qbanner.parting' + (hostile ? '.betrayal' : ''),
      h('div.qb-kind', hostile ? 'Betrayal!' : 'Parted ways'),
      h('div.qb-name', m.name),
      h('div.qb-line', hostile ? 'turns on the company' : 'has left the company')));
  },

  // Name the guilty one. In a conversation (hooks: add, sayLine, close) the
  // judge answers there; from the journal, in a window of its own.
  accusePicker(ui, mysteryId, hooks = null) {
    const s = ui.s, g = s.game;
    const my = mysteryById(g, mysteryId);
    if (!my) return;
    let pick = null;
    const go = h('button.primary', { disabled: true }, 'Accuse');
    const cards = h('div.acc-cards', ...(my.suspects || []).map((id) => {
      const f = findNpc(g, id);
      const pic = face(ui, id);
      const card = h('button.acc-card', { onclick: () => {
        pick = id; sfx('click');
        for (const c of cards.children) c.classList.toggle('on', c === card);
        go.disabled = false; go.textContent = `Accuse ${f?.npc.name || 'them'}`;
      } },
      h('span.acc-pic', pic ? h('img', { src: pic, alt: '' }) : null),
      h('b', f?.npc.name || id),
      h('small', f?.npc.desc || ''));
      return card;
    }));
    const ms = mysteryState(s.state, my.id);
    const clues = (my.clues || []).filter((c) => ms.found.includes(c.flag));
    const body = h('div.accuse',
      h('p.acc-intro', 'Whom do you accuse? Weigh what you have found — a wrong name has its price.'),
      cards,
      clues.length ? h('details.acc-clues', h('summary', `What you know (${plural(clues.length, 'clue')})`), h('ul', ...clues.map((c) => h('li', c.text)))) : null);
    const win = modal(body, {
      title: 'Name the guilty one', sub: my.name, icon: 'scroll', cls: 'wide accuse-modal',
      buttons: [{ label: 'Not yet' }],
    });
    win.box.querySelector('.modal-buttons').appendChild(go);
    go.addEventListener('click', () => {
      if (!pick) return;
      win.close();
      const res = accuse(s, my.id, pick);
      sfx(res.right ? 'victory' : 'error');
      const notes = res.got?.length ? (res.right ? 'Reward: ' : '') + res.got.join(', ') : '';
      const after = res.right ? null : res.final ? 'The matter is closed: the guilty one will never be named now.' : 'You may accuse again once you have found something new.';
      if (hooks) {
        hooks.add(h('p.you-say', `› I accuse ${findNpc(g, pick)?.npc.name || pick}!`));
        if (res.text) hooks.sayLine(res.text);
        if (notes) hooks.add(h('p.note' + (res.right ? '.qnote.got' : ''), notes));
        if (after) hooks.add(h('p.note', after));
      } else {
        const judge = findNpc(g, my.judge)?.npc;
        const jp = face(ui, my.judge);
        modal(h('div.acc-result' + (res.right ? '.right' : '.wrong'),
          h('div.acc-judge', jp ? h('img', { src: jp, alt: '' }) : null, h('b', judge?.name || '')),
          h('div', h('p', res.text || ''), notes ? h('p.hint', notes) : null, after ? h('p.hint', after) : null)),
        { title: res.right ? 'The truth is out' : 'A false accusation', sub: my.name, icon: res.right ? 'crown' : 'warn', buttons: [{ label: 'Continue', primary: true }] });
      }
      if (res.fight) {
        setTimeout(async () => {
          hooks?.close?.(); closeAllModals();
          await s.engage({ id: '__accuse_' + my.id, monster: res.fight.monster, count: res.fight.count, roaming: true });
        }, 900);
      }
      ui.refresh();
    });
  },

  // The journal's Mysteries page
  renderMysteries(ui, body, sel, onSel) {
    const s = ui.s, g = s.game;
    const list = knownMysteries(s);
    if (!list.length) {
      body.appendChild(h('div.j-lore', h('p.hint', 'Nothing strange has come to light yet. When something does not add up — a clue, a whisper, a lie — it is written here.')));
      return;
    }
    if (!list.includes(sel)) sel = list.find((m) => !mysteryState(s.state, m.id).solved) || list[0];
    const left = h('div.j-list', ...list.map((my) => {
      const ms = mysteryState(s.state, my.id);
      const line = ms.solved === 'right' ? 'Solved' : ms.solved === 'wrong' ? 'Closed, unsolved' : `${plural(ms.found.length, 'clue')} found`;
      return h('button.j-item' + (my === sel ? '.on' : ''), { onclick: () => onSel(my) }, h('b', ms.solved === 'right' ? '✔ ' : '🔎 ', my.name || 'A mystery'), h('span', line));
    }));
    const right = h('div.j-detail.j-mystery');
    const ms = mysteryState(s.state, sel.id);
    right.appendChild(h('h3', '🔎 ', sel.name || 'A mystery'));
    if (sel.intro) right.appendChild(h('p.j-summary', sel.intro));
    right.appendChild(h('div.sub', 'Suspects'));
    right.appendChild(h('div.my-suspects', ...(sel.suspects || []).map((id) => {
      const f = findNpc(g, id);
      const pic = face(ui, id);
      const guilty = ms.solved === 'right' && id === sel.culprit;
      const wrong = ms.accused === id && !guilty;
      return h('div.my-suspect' + (guilty ? '.guilty' : '') + (wrong ? '.cleared' : ''), { title: f?.npc.desc || '' },
        h('span.acc-pic', pic ? h('img', { src: pic, alt: '' }) : null),
        h('b', f?.npc.name || id),
        guilty ? h('small.tag-guilty', 'Guilty') : wrong ? h('small', 'Wrongly accused') : null);
    })));
    const need = cluesNeeded(sel), all = (sel.clues || []).length;
    const found = (sel.clues || []).filter((c) => ms.found.includes(c.flag));
    right.appendChild(h('div.sub', `Clues — ${found.length} found`));
    if (!found.length) right.appendChild(h('p.hint', 'None yet.'));
    else right.appendChild(h('ul.my-clues', ...found.map((c) => h('li', c.text || '(a clue)'))));
    const can = canAccuse(s, sel);
    const judge = findNpc(g, sel.judge);
    const where = judge ? (getMap(g, judge.map.id)?.name || '') : '';
    if (ms.solved === 'right') right.appendChild(h('p.j-done', sel.right?.text || 'The truth is out.'));
    else if (ms.solved === 'wrong') right.appendChild(h('p.j-done', 'The chance to name the guilty one has passed.'));
    else {
      const more = Math.max(0, need - found.length);
      right.appendChild(h('p.my-need', more > 0 ? `${plural(more, 'more clue')} needed before you may accuse anyone.` : can.reason === 'again' ? 'After your false accusation, you need a new clue before anyone will listen again.' : found.length < all ? 'You know enough to accuse — though more may be found.' : 'Every clue is found.'));
      const reach = judgeInReach(s, sel);
      right.appendChild(h('div.row.my-accuse',
        judge ? h('span.hint', `Bring your accusation to ${judge.npc.name}${where ? ` in ${where}` : ''}: say ACCUSE.`) : null,
        h('button.primary.small', {
          disabled: !(can.ok && reach),
          title: !can.ok ? can.why : reach ? 'Name the guilty one' : `Stand beside ${judge?.npc.name || 'the judge'} to accuse`,
          onclick: () => this.accusePicker(ui, sel.id),
        }, '⚖ Accuse…')));
    }
    body.appendChild(h('div.j-cols', left, right));
  },
};
