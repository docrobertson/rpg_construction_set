// The "Level up!" card. Whenever a hero gains a level and has a talent to
// choose — from a quest, a conversation, a curiosity on the road, or a battle
// whose victory window was closed without choosing — this card appears as
// soon as no other window is open, with the three talents on offer.
import { h, clear, modal, anyModal } from './dom.js';
import { portrait } from '../render/portrait.js';
import { newAtLevel, charLook, classOf, raceOf, maxHp, maxMp, talentTree } from '../game/rules.js';
import { TALENT_TREES } from '../data/defaults.js';
import { perkPicker } from './combatHud.js';
import { sfx } from '../core/sound.js';

export class LevelUpCard {
  constructor(ui) {
    this.ui = ui;
    this.entry = null;
    this.timer = 0;
  }

  // heroes with a talent waiting who have not yet seen the card at this level
  due() {
    return this.ui.s.party.members.filter((m) => m.status !== 'dead' && m.perkPending > 0 && (m.lvShown || 0) < m.level);
  }

  ready() {
    const s = this.ui.s;
    // after a won battle the victory window offers the talents first
    return s.mode === 'explore' && !s.battle && !s.transitioning && !this.ui.chud?.victoryPending && !anyModal();
  }

  // called on every refresh of the play screen: cheap when nothing is due
  check() {
    if (this.entry || this.timer || !this.due().length || !this.ready()) return;
    // a short pause, so the card never jumps in while another window is opening
    this.timer = setTimeout(() => {
      this.timer = 0;
      if (!this.entry && this.ready() && this.due().length) this.show();
    }, 350);
  }

  show() {
    const ui = this.ui, g = ui.s.game;
    const heroes = this.due();
    for (const m of heroes) m.lvShown = m.level;
    const rows = h('div.lvl-heroes');
    const row = (m) => {
      const pic = (() => { try { return portrait(ui.view, charLook(g, m)); } catch { return ''; } })();
      const tree = TALENT_TREES[talentTree(g, m)];
      const mp = maxMp(g, m);
      const slot = h('div.lvl-pick');
      const fill = () => {
        clear(slot);
        slot.appendChild(perkPicker(ui, m, () => { fill(); if (!heroes.some((x) => x.perkPending > 0)) sfx('level'); }));
      };
      fill();
      return h('div.lvl-hero',
        pic ? h('img', { src: pic, alt: '' }) : null,
        h('div.lvl-body',
          h('div.lvl-head', h('b', m.name), h('span.lvl-badge', `Level ${m.level}`), h('span.lvl-cls', `${raceOf(g, m).name} ${classOf(g, m).name}`)),
          h('div.lvl-gains',
            h('span', `Health ${maxHp(g, m)}`),
            mp > 0 ? h('span', `Mana ${mp}`) : null,
            ...newAtLevel(g, m).map((n) => h('span.lvl-new', `New: ${n}`)),
            m.points > 0 ? h('span.lvl-pts', `▲ ${m.points} attribute point${m.points === 1 ? '' : 's'} — spend on the hero sheet`) : null,
            tree ? h('span.lvl-tree', { title: `${classOf(g, m).name}s are offered ${tree.toLowerCase()} talents most often` }, `${tree} talents`) : null),
          slot));
    };
    for (const m of heroes) rows.appendChild(row(m));
    sfx('level');
    this.entry = modal(h('div.lvl', h('p.lvl-intro', heroes.length > 1 ? 'Your company grows stronger. Each hero may learn a new talent:' : `${heroes[0].name} grows stronger and may learn a new talent:`), rows), {
      title: 'Level up!', icon: 'up', cls: 'levelup-modal',
      buttons: [{ label: 'Done', primary: true }],
      onClose: () => { this.entry = null; ui.refresh(); },
    });
  }

  destroy() {
    clearTimeout(this.timer);
    this.timer = 0;
  }
}
