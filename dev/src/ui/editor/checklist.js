// The Test step: the checklist of what still needs work, grouped by step,
// and the ways to playtest (from the start, from here, from a chapter).
//
// [shell] A first version; the Checklist stream replaces it.
import { h, clear } from '../dom.js';
import { analyzeCampaign, AREAS } from '../../game/checklist.js';

export function renderTest(ed, left, main) {
  clear(left);
  clear(main);
  left.appendChild(h('div.panel-title', '☑ Test'));
  const found = analyzeCampaign(ed.game);
  for (const [area, label] of AREAS) {
    const list = found.filter((f) => f.area === area && f.level !== 'ok');
    if (!list.length) continue;
    main.appendChild(h('h2', label));
    for (const f of list) main.appendChild(h('div.check-item', h('span', f.text), f.go ? h('button.small', { onclick: () => ed.goTo(f.go) }, 'Go →') : null));
  }
  main.appendChild(h('button.primary', { onclick: () => ed.playtestMenu() }, '▶ Playtest…'));
}
