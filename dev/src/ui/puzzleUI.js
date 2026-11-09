// (puzzles) The riddle: a carved face or a sphinx asks, and the player types
// the answer, on the same parchment as a conversation.
import { h, modal } from './dom.js';
import { portrait } from '../render/portrait.js';
import { iconSvg } from './icons.js';
import { puzzleName, puzzleLook } from '../game/puzzles.js';

export class PuzzleUI {
  constructor(ui) {
    this.ui = ui;
    this.s = ui.s;
    ui.openRiddle = (e) => this.openRiddle(e);
  }

  openRiddle(e) {
    const s = this.s, ui = this.ui;
    s.queued = null;
    s.mode = 'dialog';
    const conv = h('div.talk-log.riddle-log');
    const add = (el) => { conv.appendChild(el); conv.scrollTop = conv.scrollHeight; };
    const input = h('input.talk-input.riddle-input', { type: 'text', placeholder: 'Speak your answer… (type it and press Enter)', maxLength: 40, 'aria-label': 'Your answer' });
    const name = puzzleName(e);
    let fight = null, done = !!e.solved;
    const answer = () => {
      const word = String(input.value || '').trim();
      input.value = '';
      if (!word || done) return;
      add(h('p.you-say', '› ' + word.toUpperCase()));
      const res = s.puzzles.answer(e, word);
      add(h('p.npc-say' + (res.ok ? '.riddle-right' : '.riddle-wrong'), res.text));
      if (res.got?.length) add(h('p.note' + (res.ok ? '' : '.bad'), res.got.join(' · ')));
      box.box.classList.remove('riddle-shake');
      if (!res.ok) { void box.box.offsetWidth; box.box.classList.add('riddle-shake'); }
      if (res.ok) {
        done = true;
        ask.remove();
        add(h('div.modal-buttons', h('button.primary', { onclick: () => box.close() }, 'Onward')));
        pic.classList.add('riddle-glow');
      } else if (res.fight) {
        fight = res.fight;
        done = true;
        ask.remove();
        add(h('div.modal-buttons', h('button.primary', { onclick: () => box.close() }, 'To arms!')));
      } else if (s.mode === 'gameover' || !s.party.members.some((m) => m.status !== 'dead')) { done = true; setTimeout(() => box.close(), 600); }
      ui.refresh();
    };
    const face = portrait(s.view, puzzleLook(e));
    const pic = h('div.talk-pic.riddle-pic', face ? h('img', { src: face, alt: '' }) : h('span', { html: iconSvg('talk') }));
    const ask = h('div.talk-ask', input, h('button.primary', { onclick: () => { answer(); input.focus(); } }, 'Answer'));
    const body = h('div.talk.riddle',
      h('div.talk-side', pic, h('div.talk-name', e.name || name.replace(/^An? /, '').replace(/^./, (c) => c.toUpperCase()))),
      h('div.talk-main',
        h('div.talk-head', h('b', e.name || name), h('span', e.solved ? ' — its riddle is answered' : ' — it asks a riddle')),
        conv,
        e.solved ? null : ask,
        h('div.talk-tip', 'Type your answer in a word or two. A wrong answer may cost you.')));
    const box = modal(body, {
      cls: 'talk-modal riddle-modal',
      onClose: () => {
        if (s.mode === 'dialog') s.mode = 'explore';
        ui.refresh();
        if (fight) { const f = fight; fight = null; setTimeout(() => s.puzzles.riddleFight(e, f), 60); }
      },
    });
    if (e.intro) add(h('p.note', e.intro));
    add(h('p.npc-say.riddle-text', e.text || 'What walks on four legs at dawn, two at noon and three at dusk?'));
    if (e.solved) add(h('p.note', e.solvedText || 'The stone is silent now; it has had its answer.'));
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); answer(); } });
    setTimeout(() => input.focus(), 30);
    return box;
  }
}
