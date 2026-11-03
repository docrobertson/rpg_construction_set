// Help for the Construction Set: the road through the steps, and a short
// card for each step (the ? button opens the card for the step in view).
import { h, modal, clear } from '../dom.js';

const ROAD = `
<p>A realm is built in steps, roughly in this order. None of them waits on another: jump about whenever you like.
Everything saves itself in this browser as you go.</p>
<ol class="help-road">
<li><b>Campaign</b> — name the realm, write its opening, decide how it is won. New here? The <b>✦ Quick Start</b>
lays down a whole core campaign — land, places, roads and chapters of quests — for you to make your own.</li>
<li><b>Land</b> — the broad strokes: regions of forest, hills and desert, coasts, rivers and roads, and where
towns, castles and dungeons stand.</li>
<li><b>Places</b> — design each place from a list of what it holds (“an inn, an armourer and two homes”) and rebuild
it in a click. People you have written stay.</li>
<li><b>Story</b> — chapters, the quests in them, the people they need, and the keys that open the gates.</li>
<li><b>Details</b> — tile by tile: paint, and place and script people, monsters, treasure and wonders.</li>
<li><b>Test</b> — the checklist of what still needs work, and playtesting from the start, a chapter, or anywhere.</li>
</ol>
<p>Beside the steps: <b>World Data</b> (races, classes, items, spells, monsters) and <b>Rules</b> (the company,
food, magic schools, starting kit). The numbers on the steps count what the checklist still finds there.
<b>Ctrl+K</b> finds anything — a person, a place, a quest — and takes you to it.</p>`;

const STEP = {
  campaign: `<p>The realm as a whole. Write the <b>opening story</b> players read before they begin, and choose
<b>how it ends</b>: a monster slain, an item found, or a story flag set (a conversation can also win the game).</p>
<p>The <b>road</b> shows each step with where it stands and what the checklist still wants there. The <b>Quick Start</b>
asks a few questions and builds the core of a campaign; on a realm already under way it adds places and chapters.</p>`,
  land: `<p>Broad strokes on the world map. <b>Paint regions</b>: click to drop a forest, hills or a desert, or drag to
paint wide swathes (make the size large). <b>Rivers, roads and ridges</b>: drag a line across the map; roads bridge
rivers by themselves.</p><p><b>Places</b>: pick a kind and click the map to found it — its map is made for you. Join
them with roads, and design each one in the Places step.</p>`,
  places: `<p>Every town, castle and dungeon in the realm. Choose one to see its <b>plan</b>: the key buildings and how
many of each, homes, townsfolk, walls and gates — or for a dungeon its rooms, monsters, boss and treasure.</p>
<p><b>Rebuild</b> makes the place afresh from its plan. People you have named or written words for keep them and move
into the new buildings; anything that cannot find a home is reported. Undo puts it back.</p>`,
  story: `<p>Lay out the adventure in <b>chapters</b>. Each has a goal and the quests that reach it; the next chapter
opens when it ends. The flow shows each quest step by step — who to see and where, what to find, which key opens
which gate — and warns where a player would be stuck.</p><p>Add <b>beats</b> to a chapter — a fetch, a slaying, a key
and its gate, a companion who must come along — and the quests, people and items are written for you to adjust.
The <b>cast</b> lists the people a chapter cannot do without.</p>`,
  map: `<p>Tile-by-tile work on any map. <b>Paint tiles</b> with a brush, line, rectangle, fill or picker;
<b>Characters & objects</b> places people, monsters, chests, signs, ships and passages; <b>Points of interest</b>
adds shrines, campfires and small events with choices.</p><p>Select anything to edit it on the right; drag to move it;
Delete removes it. Double-click a site or stairs to go inside.</p>
<table class="keys">
<tr><td>B</td><td>Brush</td><td>F</td><td>Fill</td><td>R</td><td>Rectangle</td></tr>
<tr><td>L</td><td>Line</td><td>I</td><td>Pick tile</td><td>V</td><td>Select</td></tr>
<tr><td>X</td><td>Remove</td><td>[ ]</td><td>Brush/stamp size</td><td>Del</td><td>Delete selected</td></tr>
<tr><td>WASD</td><td>Pan</td><td>Wheel</td><td>Zoom</td><td>Right-drag</td><td>Pan</td></tr>
<tr><td>Two fingers</td><td>Pan (trackpad)</td><td>Pinch</td><td>Zoom</td><td></td><td></td></tr>
<tr><td>Ctrl+Z</td><td>Undo</td><td>Ctrl+Y</td><td>Redo</td><td>Ctrl+K</td><td>Find anything</td></tr>
</table>`,
  test: `<p>The <b>checklist</b> looks the whole realm over: places no one can reach, keys nothing gives, quests nobody
offers, towns without a healer, people who still say nothing of their own. <b>Go</b> takes you to each one;
<b>Ignore</b> hides what you mean to leave as it is.</p><p><b>Playtest</b> from the start, from a chapter (the ones
before it counted as done), or from wherever you were looking. In a playtest the 🛠 button jumps about, hands out
gold and levels, and <b>Edit here</b> brings you back to that very spot.</p>`,
  data: `<p>The stuff of the realm: <b>races</b>, <b>classes</b>, <b>items</b>, <b>spells</b> and <b>monsters</b>.
Choose a kind on the left, then an entry; changes apply at once. Monsters show as a model on the right.</p>`,
  rules: `<p>The rules of play: how big a company may be, food and hunger, line of sight, wandering monsters,
day and night, the magic schools that exist, and the gold and kit heroes set out with.</p>`,
};

const TITLES = { campaign: 'Campaign', land: 'Land', places: 'Places', story: 'Story', map: 'Details', test: 'Test', data: 'World Data', rules: 'Rules' };

export function editorHelp(ed, tab = ed.tab) {
  const body = h('div.help.ed-help');
  const tabs = h('div.ed-help-tabs');
  const page = h('div.ed-help-page');
  const show = (k) => {
    clear(page);
    page.innerHTML = k === 'road' ? ROAD : STEP[k] || ROAD;
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k);
  };
  for (const [k, label] of [['road', 'The steps'], ...Object.entries(TITLES)]) {
    const b = h('button.small', { onclick: () => show(k) }, label);
    b.dataset.k = k;
    tabs.appendChild(b);
  }
  body.append(tabs, page);
  show(STEP[tab] && tab !== 'campaign' ? tab : 'road');
  modal(body, { title: 'Building your realm', cls: 'wide' });
}
