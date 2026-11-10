// Help for newcomers: the ? controls reference, and the short "how to play"
// card shown over the map the first time someone plays.
import { h, modal } from './dom.js';
import { iconSvg } from './icons.js';
import { getPref, setPref } from '../core/storage.js';
import { STAT_NAMES } from '../data/defaults.js';
import { schoolLook } from '../game/magic.js';

// how each school's window looks, in a word or two
const STYLE_WORDS = { book: 'spellbook', prayer: 'prayer beads', song: 'songs', runes: 'rune-stones', herbs: 'herb satchel' };

// One line per school of magic, in its own colour and mark: what it burns,
// which attribute powers it, who wields it and what it is good for. ids
// limits it to the schools a caster actually uses.
export function magicGuide(game, ids = null) {
  const list = (game.magic || []).filter((m) => m.enabled !== false && !m.monsterOnly && (!ids || ids.includes(m.id)));
  if (!list.length) return null;
  return h('div.magic-guide', ...list.map((m) => {
    const look = schoolLook(m);
    const who = (game.classes || []).filter((k) => (k.magic || []).some((x) => x.system === m.id)).map((k) => k.name);
    return h('div.mg-row', { style: { '--school': look.color } },
      h('i.mg-ico', { html: iconSvg(look.icon) }),
      h('b.mg-name', m.name),
      h('span.mg-fuel', `${look.resName} · ${STAT_NAMES[m.stat] || m.stat}${who.length ? ` · ${who.join(', ')}` : ''}`),
      h('span.mg-desc', m.desc || ''),
      h('span.mg-style', STYLE_WORDS[look.style] || ''));
  }));
}

const ico = (name) => h('i.hw-ico', { html: iconSvg(name) });
const kbd = (...keys) => keys.map((k, i) => [i ? h('span.kbd-or', '/') : null, h('kbd', k)]);

// The ? overlay: four things to know, the keys for exploring and for battle,
// and the full rules (rulesHtml, from play.js) folded away underneath
export function openHelpOverlay(ui, rulesHtml) {
  const card = (icon, title, text) => h('div.hw-card', h('div.hw-card-ico', { html: iconSvg(icon) }), h('b', title), h('p', ...text));
  const row = (keys, what) => h('div.key-row', h('span.key-caps', ...keys), h('span.key-what', what));
  const nearby = !!ui.explore;
  const game = ui.s?.game;
  const body = h('div.help-overlay',
    h('div.hw-cards',
      card('move', 'Move', ['Arrow keys or ', h('b', 'WASD'), ' — or click the ground and the company walks there.']),
      card('talk', 'Talk', ['Click a person to walk up and talk. Ask about the ', h('b.kw-sample', 'red words'), ' they use.']),
      card('scroll', 'Follow your quest', ['The tracker at the top left shows your goal and points the way. ', h('b', 'J'), ' opens the Journal.']),
      card('sword', 'Fight', ['Battles are turn-based: move, then attack, use a skill or cast. Hover a foe to see your odds.'])),
    h('div.hw-keys',
      h('section',
        h('h3', ico('compass'), ' Exploring'),
        row(kbd('←↑↓→', 'WASD'), 'Walk (bump into people to talk, foes to fight)'),
        row(kbd('Click'), 'Walk there, or act on what you click'),
        nearby ? row(kbd('E', '1–4'), 'Do what is nearby (see the Nearby bar)') : null,
        row(kbd('T'), 'Talk'),
        row(kbd('L'), 'Look'),
        row(kbd('C'), 'Cast a spell'),
        row(kbd('U'), 'Use an item'),
        row(kbd('H'), 'Make camp and rest'),
        row(kbd('Space'), 'Wait a turn'),
        h('h3', ico('skull'), ' In dungeons'),
        row(kbd('Tab'), 'One hero walks alone (Tab again: the next)'),
        row(kbd('G'), 'All together again'),
        row(kbd('X'), 'Leave a cleared dungeon at once'),
        row(kbd('Click'), 'A hero or their portrait: send them on alone')),
      h('section',
        h('h3', ico('book'), ' Windows'),
        row(kbd('J'), 'Journal: quests and lore'),
        row(kbd('I'), 'The pack (gear goes on from a hero\'s sheet)'),
        row(kbd('M'), 'Map'),
        row(kbd('?'), 'This help'),
        row(kbd('Esc'), 'Close a window / menu'),
        row(kbd('Ctrl+S'), 'Save'),
        h('h3', ico('sword'), ' In battle'),
        row(kbd('Click'), 'Blue square: move · red foe: attack'),
        row(kbd('F'), 'Attack or shoot'),
        row(kbd('1–9'), 'Skills (more as heroes rise)'),
        row(kbd('Q'), '★ Special, once per battle'),
        row(kbd('G'), 'Guard (+3 armour)'),
        row(kbd('R'), 'Withdraw: one step back, no free strike'),
        row(kbd('Space'), 'End the turn'))),
    game && magicGuide(game) ? h('section.hw-magic', h('h3', ico('sparkle'), ' Magic'), magicGuide(game),
      h('p.mg-note', 'Mana, faith and voice return when you rest. Runes burn reagents from herbalists; rangers gather herbs in wild country as you travel. Wizards copy spell scrolls into their spellbooks. The Pack says who can use each reagent, herb and scroll.')) : null,
    h('div.hw-tip', ico('sparkle'), ' Hover over almost anything — heroes, buttons, foes, the numbers in the top bar — to see what it means.'),
    h('details.hw-rules', h('summary', 'The full rules: towns, quests, tactics and survival'), h('div.help', { html: rulesHtml })),
  );
  modal(body, { title: 'How to Play', icon: 'help', cls: 'wide help-modal' });
}

// The first-time card: a few lines over the map, until dismissed (remembered)
export function showHowTo(ui) {
  if (getPref('seenHowTo', false)) return null;
  if (ui.howtoEl?.isConnected) return ui.howtoEl;
  const done = () => { setPref('seenHowTo', true); el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  const li = (icon, ...text) => h('li', ico(icon), h('span', ...text));
  const el = h('div.howto', { role: 'dialog', 'aria-label': 'How to play' },
    h('div.hw-head', h('i.hw-crest', { html: iconSvg('compass') }), h('b', 'Welcome, adventurer'),
      h('button.hw-x', { title: 'Hide this card', 'aria-label': 'Close', onclick: done, html: iconSvg('close') })),
    h('ul.hw-list',
      li('move', h('b', 'Move'), ' with ', ...kbd('←↑↓→', 'WASD'), ' or click the ground'),
      li('talk', h('b', 'Talk'), ' by clicking people'),
      li('scroll', 'Follow the ', h('b', 'quest tracker'), ' at the top left'),
      li('sword', h('b', 'Battles'), ' are turn-based: move, attack, use skills'),
      li('book', ...kbd('J'), ' journal · ', ...kbd('I'), ' pack · ', ...kbd('?'), ' help')),
    h('div.hw-btns',
      h('button.primary.hw-ok', { onclick: done }, 'Got it'),
      h('button.hw-more', { onclick: () => { done(); ui.openHelp(); } }, 'All controls')));
  ui.root.appendChild(el);
  ui.howtoEl = el;
  return el;
}
