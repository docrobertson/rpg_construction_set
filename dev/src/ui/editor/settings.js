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
  for (const [id, label] of [['set-rules', '⚖ Rules'], ['set-battle', '⚔ Battle'], ['set-magic', '🔮 Magic systems'], ['set-start', '🎒 Starting out']]) {
    left.appendChild(h('button.entry', { onclick: () => jump(id) }, label));
  }
  const changed = () => ed.markDirty();
  const section = (id, title, ...content) => h('div.settings-section', { id }, h('h2', title), ...content);

  main.appendChild(h('p.hint', 'The title, opening story and how the game is won are on the ', h('button.small.link', { onclick: () => ed.setTab('campaign') }, 'Campaign'), ' step.'));

  main.appendChild(section('set-rules', '⚖ Rules', buildForm(game, [
    { key: 'settings.maxParty', label: 'Largest party', type: 'number', min: 1, max: 8 },
    // (company) a lone hero, or a set number, and an easier road for a small company
    { key: 'settings.startHeroes', label: 'Heroes who set out', type: 'number', min: 1, max: 8, nullable: true, placeholder: '4 — the player chooses',
      hint: '1: the player creates a lone hero, and companions join along the road. A number: exactly that many. Blank: four, and the player may take more or fewer.' },
    { key: 'settings.gentleStart', label: 'Gentle first fights', type: 'number', min: 0, max: 20, nullable: true, placeholder: '3',
      hint: 'While the company is under four strong, its first this-many wandering bands come sized for it, without escorts. 0: never.' },
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

  // (tactics) the rules of a fight: weapon training, how hard heroes are to kill, breaking away
  main.appendChild(section('set-battle', '⚔ Battle', h('p.hint', 'How fights go. Weapon kinds and their traits are under World Data → Weapon kinds; which kinds a class is trained in, under Classes.'), buildForm(game, [
    { key: 'settings.untrainedWeapons', label: 'A weapon a hero is not trained in', type: 'select', rerender: true, options: [['penalty', 'May be wielded, at a penalty'], ['forbid', 'Cannot be wielded at all']] },
    { key: 'settings.untrainedPenalty', label: 'Untrained: to hit', type: 'number', min: 0, max: 10, show: (o) => o.settings.untrainedWeapons !== 'forbid', hint: 'Taken off the hero\'s to-hit; the kind\'s trait does not work either. Heavy weapons need heavy-weapon training too.' },
    { key: 'settings.heroicHealth', label: 'Heroic health', type: 'number', min: 0, max: 30, hint: 'Extra health every hero has, from level 1: it matters most early, when one goblin\'s blow could take half a wizard.' },
    { key: 'settings.lastStand', label: 'Last stand', type: 'check', hint: 'A hero above half health survives any single blow on 1 health, once per battle: no one falls from full health in one stroke.' },
    { key: 'settings.breakAway', label: 'Breaking away: chance of a free strike', type: 'number', step: 0.05, min: 0, max: 1, hint: 'When anyone steps out of a foe\'s reach. 0.5: half the time, more against a higher-level or quicker foe, less the other way (15–90%). 1: always, as of old. Withdraw always steps back safely.' },
    { key: 'settings.dodgeEvery', label: 'Light armour dodges: +1 armour every … levels', type: 'number', min: 0, max: 10, hint: 'For heroes in cloth or leather (mail and plate soak blows instead). 3: at levels 3, 6 and 9. 0: never.' },
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
