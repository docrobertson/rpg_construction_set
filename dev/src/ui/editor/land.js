// The Land step: broad strokes on a world map. Big regions of forest, hills,
// desert or sea; coasts, rivers, roads and ridges; and the places of the realm
// dropped where they belong. (Tile-by-tile work is the Details step.)
//
// [shell] A first version; the Places stream extends it.
import { h } from '../dom.js';
import { FEATURE_KINDS } from '../../data/terrain.js';
import { placesOf } from '../../world/places.js';

const REGIONS = ['island', 'lake', 'forest', 'pines', 'hills', 'mountains', 'swamp', 'desert', 'snow', 'blight', 'meadow', 'clear'];
const PATHS = ['road', 'river', 'ridge'];

export function renderLandPanel(ed, L) {
  const { section, toolBtn, slider } = ed.ui;
  L.appendChild(h('div.panel-title', 'The Land'));
  L.appendChild(h('p.hint', 'Broad strokes first: the shape of the land, its regions, rivers and roads, and where its places stand. Fine work comes later, in Details.'));
  L.appendChild(section('Start over', 'Generate a whole new world map.',
    h('button', { onclick: () => ed.regenerateDialog() }, '🎲 Generate the world…')));
  L.appendChild(section('Paint regions', 'Click to drop a region, or drag to paint broad swathes.',
    h('div.tool-grid', ...REGIONS.map((k) => toolBtn('stamp_' + k))),
    slider('Size', 1, 20, ed.stampSize, (v) => { ed.stampSize = v; })));
  L.appendChild(section('Rivers, roads and ridges', 'Drag across the map.',
    h('div.tool-grid', ...PATHS.map((k) => toolBtn('path_' + k))),
    slider('Width', 1, 4, ed.pathWidth, (v) => { ed.pathWidth = v; })));
  L.appendChild(section('Places', 'Click the map to found a town, castle or dungeon; its map is made for you.',
    h('div.tool-grid', ...Object.keys(FEATURE_KINDS).map((k) => toolBtn('site_' + k)))));
  const places = placesOf(ed.game).filter((p) => p.world === ed.map);
  if (places.length) {
    L.appendChild(section(`On this map (${places.length})`, 'Click to look at a place.',
      h('div.entry-list', ...places.map((p) => h('button.entry', { onclick: () => { ed.view.focus(p.portal.x, p.portal.y); ed.select(p.portal); } }, p.map.name, h('span.tag', FEATURE_KINDS[p.kind]?.label || p.kind))))));
  }
}
