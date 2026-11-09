// (company) A <datalist> of the story flags the realm uses, for flag fields
// to suggest from (a clue, a banter line's need, a leaving rule).
import { h, clear } from '../dom.js';
import { flagsInGame } from '../../game/checklist.js';

export function flagDatalist(game) {
  let dl = document.getElementById('cs-flags');
  if (!dl) { dl = h('datalist', { id: 'cs-flags' }); document.body.appendChild(dl); }
  clear(dl);
  for (const f of flagsInGame(game)) dl.appendChild(h('option', { value: f }));
  return dl;
}
