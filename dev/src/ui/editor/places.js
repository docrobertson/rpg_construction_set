// The Places step: every town, castle, village and dungeon of the realm, and
// a designer for each that builds it from a plan ("an inn, an armourer, two
// homes") and rebuilds it without losing the people written into it.
//
// [shell] A first version; the Places stream replaces it.
import { h, clear } from '../dom.js';
import { FEATURE_KINDS } from '../../data/terrain.js';
import { placesOf } from '../../world/places.js';

export class PlacesEditor {
  constructor(ed, left, main) { this.ed = ed; this.left = left; this.main = main; this.sel = null; }

  select(map) { this.sel = map; this.render(); }

  render() {
    const ed = this.ed;
    const places = placesOf(ed.game);
    if (!places.some((p) => p.map === this.sel)) this.sel = places[0]?.map || null;
    clear(this.left);
    this.left.appendChild(h('div.panel-title', '🏘 Places'));
    this.left.appendChild(h('div.entry-list', ...places.map((p) => h('button.entry' + (p.map === this.sel ? '.on' : ''), { onclick: () => this.select(p.map) },
      p.map.name, h('span.tag', FEATURE_KINDS[p.kind]?.label || p.kind)))));
    clear(this.main);
    const sel = places.find((p) => p.map === this.sel);
    if (!sel) { this.main.appendChild(h('p.hint', 'No places yet. Found towns and dungeons in the Land step.')); return; }
    this.main.appendChild(h('div.db-head', h('h2', sel.map.name)));
    this.main.appendChild(h('button', { onclick: () => { ed.setTab('map'); ed.loadMap(sel.map); } }, 'Open in Details →'));
  }
}
