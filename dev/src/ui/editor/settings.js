// Game settings: story text, rules, magic systems, victory, starting kit.
import { h, clear } from '../dom.js';
import { buildForm } from './forms.js';

export function renderSettings(ed, left, main) {
  const game = ed.game;
  clear(left);
  clear(main);
  left.appendChild(h('div.panel-title', 'Rules'));
  left.appendChild(h('p.hint', 'The rules of the realm: the company, food and time, which kinds of magic exist, and what heroes set out with.'));
  const jump = (id) => main.querySelector('#' + id)?.scrollIntoView({ behavior: 'smooth' });
  for (const [id, label] of [['set-rules', '⚖ Rules'], ['set-magic', '🔮 Magic systems'], ['set-start', '🎒 Starting out']]) {
    left.appendChild(h('button.entry', { onclick: () => jump(id) }, label));
  }
  const changed = () => ed.markDirty();
  const section = (id, title, ...content) => h('div.settings-section', { id }, h('h2', title), ...content);

  main.appendChild(h('p.hint', 'The title, opening story and how the game is won are on the ', h('button.small.link', { onclick: () => ed.setTab('campaign') }, 'Campaign'), ' step.'));

  main.appendChild(section('set-rules', '⚖ Rules', buildForm(game, [
    { key: 'settings.maxParty', label: 'Largest party', type: 'number', min: 1, max: 8 },
    { key: 'settings.creationPoints', label: 'Attribute points at creation', type: 'number', min: 0, max: 60 },
    { key: 'settings.startLevel', label: 'Heroes start at level', type: 'number', min: 1, max: 20 },
    { key: 'settings.startGold', label: 'Starting gold', type: 'number', min: 0 },
    { key: 'settings.food', label: 'Food & hunger', type: 'check', hint: 'Travel in the wild and in dungeons eats food; starving hurts.' },
    { key: 'settings.startFood', label: 'Starting food', type: 'number', min: 0, show: (o) => o.settings.food },
    { key: 'settings.lineOfSight', label: 'Line of sight & fog of war', type: 'check', hint: 'Forests, walls and mountains hide what lies beyond.' },
    { key: 'settings.encounterRate', label: 'Wandering monster frequency', type: 'number', step: 0.25, min: 0, max: 4, hint: '0 = only the monsters you place' },
    { key: 'settings.combatMoves', label: 'Squares a hero moves per battle turn', type: 'number', min: 1, max: 8, hint: 'Before attacking or casting. Dexterity 16+ adds one; plate armour costs one.' },
    { key: 'settings.dayNight', label: 'Day and night', type: 'check', hint: 'Outdoors the sun sets every 300 turns: at night you see less and more monsters roam.' },
    { key: 'settings.loot', label: 'Monsters drop weapons and armour', type: 'check', hint: 'Sometimes, scaled to the foes defeated. Mark special items as never dropped.' },
    { key: 'settings.pitch', label: 'Camera angle', type: 'number', min: 35, max: 80, hint: 'Degrees above the horizon (52 gives a 3D diorama view; higher looks more straight down)' },
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
      h('div', h('b', { style: { color: m.color || '#fff' } }, m.name), h('span.res', ` · burns ${(m.resName || (m.resource === 'reagents' ? 'reagents' : 'mana')).toLowerCase()}`),
        h('p', m.desc || ''), h('small', `${nSpells} spells · ${classes.length ? 'used by ' + classes.join(', ') : 'no class uses it yet'}`))));
  }
  main.appendChild(section('set-magic', '🔮 Magic systems', h('p.hint', 'Switch whole schools of magic on or off. Edit their spells under World Data → Spells, and decide which classes wield them under World Data → Classes.'), magic));

  const s = game.settings.start;
  const startMap = game.maps.find((m) => m.id === s.map);
  main.appendChild(section('set-start', '🎒 Starting out',
    h('p', `The party begins on ${startMap ? startMap.name : '?'} at ${s.x}, ${s.y}. `,
      h('button.small', { onclick: () => { ed.setTab('map'); ed.loadMapById(s.map); ed.setTool('start'); } }, 'Move the starting point…')),
    buildForm(game, [
      { key: 'settings.startItems', label: 'Shared pack', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]), hint: 'Each hero also gets their class\'s starting equipment.' },
    ], changed)));
}
