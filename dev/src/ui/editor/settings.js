// Game settings: story text, rules, magic systems, victory, starting kit.
import { h, clear } from '../dom.js';
import { buildForm } from './forms.js';

export function renderSettings(ed, left, main) {
  const game = ed.game;
  clear(left);
  clear(main);
  left.appendChild(h('div.panel-title', 'Game Settings'));
  left.appendChild(h('p.hint', 'Tell your story, set the rules of the realm, and choose which kinds of magic exist.'));
  const jump = (id) => main.querySelector('#' + id)?.scrollIntoView({ behavior: 'smooth' });
  for (const [id, label] of [['set-story', '📜 Story'], ['set-rules', '⚖ Rules'], ['set-magic', '🔮 Magic systems'], ['set-victory', '🏆 Victory'], ['set-start', '🎒 Starting out']]) {
    left.appendChild(h('button.entry', { onclick: () => jump(id) }, label));
  }
  const changed = () => ed.markDirty();
  const section = (id, title, ...content) => h('div.settings-section', { id }, h('h2', title), ...content);

  main.appendChild(section('set-story', '📜 Story', buildForm(game, [
    { key: 'meta.title', label: 'Title', type: 'text' },
    { key: 'meta.author', label: 'Author', type: 'text' },
    { key: 'meta.description', label: 'Blurb', type: 'textarea', rows: 2, hint: 'Shown when choosing an adventure.' },
    { key: 'meta.intro', label: 'Opening story', type: 'textarea', rows: 8, hint: 'Shown before play begins. Blank lines separate paragraphs.' },
    { key: 'meta.victoryText', label: 'Victory text', type: 'textarea', rows: 5 },
  ], (k) => { changed(); if (k === 'meta.title') ed.refreshTitle(); })));

  main.appendChild(section('set-rules', '⚖ Rules', buildForm(game, [
    { key: 'settings.maxParty', label: 'Largest party', type: 'number', min: 1, max: 8 },
    { key: 'settings.creationPoints', label: 'Attribute points at creation', type: 'number', min: 0, max: 60 },
    { key: 'settings.startLevel', label: 'Heroes start at level', type: 'number', min: 1, max: 20 },
    { key: 'settings.startGold', label: 'Starting gold', type: 'number', min: 0 },
    { key: 'settings.food', label: 'Food & hunger', type: 'check', hint: 'Travel in the wild and in dungeons eats food; starving hurts.' },
    { key: 'settings.startFood', label: 'Starting food', type: 'number', min: 0, show: (o) => o.settings.food },
    { key: 'settings.lineOfSight', label: 'Line of sight & fog of war', type: 'check', hint: 'Forests, walls and mountains hide what lies beyond.' },
    { key: 'settings.encounterRate', label: 'Wandering monster frequency', type: 'number', step: 0.25, min: 0, max: 4, hint: '0 = only the monsters you place' },
    { key: 'settings.pitch', label: 'Camera angle', type: 'number', min: 50, max: 85, hint: 'Degrees above the horizon (70 is a good board-game view)' },
  ], changed)));

  const magic = h('div.magic-toggles');
  for (const m of game.magic) {
    if (m.monsterOnly) continue;
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!m.enabled;
    cb.addEventListener('change', () => { m.enabled = cb.checked; changed(); });
    const nSpells = game.spells.filter((s) => s.system === m.id).length;
    const classes = game.classes.filter((c) => (c.magic || []).some((x) => x.system === m.id)).map((c) => c.name);
    magic.appendChild(h('label.magic-toggle', { style: { borderColor: m.color || '#888' } }, cb,
      h('div', h('b', { style: { color: m.color || '#fff' } }, m.name), h('span.res', m.resource === 'reagents' ? ' · uses reagents' : ' · uses mana'),
        h('p', m.desc || ''), h('small', `${nSpells} spells · ${classes.length ? 'used by ' + classes.join(', ') : 'no class uses it yet'}`))));
  }
  main.appendChild(section('set-magic', '🔮 Magic systems', h('p.hint', 'Switch whole schools of magic on or off. Edit their spells under World Data → Spells, and decide which classes wield them under World Data → Classes.'), magic));

  const vic = h('div');
  const renderVic = () => {
    clear(vic);
    vic.appendChild(buildForm(game, [
      { key: 'settings.victory.type', label: 'The game is won when…', type: 'select', options: [['none', 'Never (open-ended)'], ['kill', 'A certain monster is slain'], ['item', 'A certain item is found'], ['flag', 'A story flag is set (e.g. by a conversation)']], rerender: true },
      { key: 'settings.victory.target', label: 'Monster', type: 'select', options: () => game.monsters.map((m) => [m.id, m.name]), show: (o) => o.settings.victory.type === 'kill' },
      { key: 'settings.victory.target', label: 'Item', type: 'select', options: () => game.items.map((m) => [m.id, m.name]), show: (o) => o.settings.victory.type === 'item' },
      { key: 'settings.victory.target', label: 'Flag', type: 'text', show: (o) => o.settings.victory.type === 'flag' },
      { type: 'info', label: 'Tip: a conversation keyword with the action “Win the game!” also ends the adventure in triumph.' },
    ], () => { changed(); }));
  };
  if (!game.settings.victory) game.settings.victory = { type: 'none', target: '' };
  renderVic();
  main.appendChild(section('set-victory', '🏆 Victory', vic));

  const s = game.settings.start;
  const startMap = game.maps.find((m) => m.id === s.map);
  main.appendChild(section('set-start', '🎒 Starting out',
    h('p', `The party begins on ${startMap ? startMap.name : '?'} at ${s.x}, ${s.y}. `,
      h('button.small', { onclick: () => { ed.setTab('map'); ed.loadMapById(s.map); ed.setTool('start'); } }, 'Move the starting point…')),
    buildForm(game, [
      { key: 'settings.startItems', label: 'Shared pack', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]), hint: 'Each hero also gets their class\'s starting equipment.' },
    ], changed)));
}
