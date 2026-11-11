// "World Data" editors: races, classes, items, spells, monsters, magic systems.
import { h, clear, confirmDialog, toast } from '../dom.js';
import { buildForm } from './forms.js';
import { LOOK_FIELDS } from './inspector.js';
import {
  STATS, STAT_NAMES, RACE_TRAITS, CLASS_ABILITIES, ARMOR_WEIGHTS, ITEM_TYPES, ITEM_EFFECTS, SPELL_TARGETS, SPELL_EFFECTS, HABITATS,
  ABILITY_TARGETS, ABILITY_VFX, STATUS_EFFECTS, AI_STYLES, TALENT_TREES, MAGIC_STYLES, CHARM_KINDS, CHARM_KIND_ICONS, RARITIES,
  WEAPON_TRAITS, WEAPON_KIND_DEFS, ARMOR_SOAK,
} from '../../data/defaults.js';
import { EFFECT_TYPES, BONUS_STATS, newEffect, effectText, isBeast } from '../../game/charms.js';
import { uniqueId, deepClone } from '../../core/util.js';
import { MODEL_KINDS } from '../../render/models.js';
import { ensureCombatData, classSkills, SPECIAL_LEVEL, weaponKinds, traitText, isHeavy } from '../../game/rules.js';
import { ICON_NAMES } from '../icons.js';
import { TERRAIN_LIST } from '../../data/terrain.js';

const TARGET_HELP = {
  enemy: 'one foe', ally: 'one companion (or self)', self: 'the user', tile: 'a square (teleport, or a blow aimed at an area)',
  adjacentFoes: 'every foe beside the user', nearbyFoes: 'every foe within the radius', nearbyAllies: 'every friend within the radius',
  allAllies: 'the whole side', allEnemies: 'every foe', multi: 'the weakest few foes in range',
};
// conditions a battle ability or spell can inflict, as a list of rows
const statusList = (label = 'Conditions inflicted') => ({
  key: 'statuses', label, type: 'list', fields: [
    { key: 'id', label: 'Condition', type: 'select', options: Object.entries(STATUS_EFFECTS).map(([k, v]) => [k, `${v.name} — ${v.desc}`]) },
    { key: 'rounds', label: 'Turns', type: 'number', min: 1, max: 10 },
    { key: 'power', label: 'Strength', type: 'number', min: 0, hint: 'Armour or to-hit bonus, or poison damage per turn' },
    { key: 'chance', label: 'Chance', type: 'number', step: 0.05, min: 0, max: 1, nullable: true, hint: 'Leave empty: always' },
    { key: 'self', label: 'On the user instead of the target', type: 'check' },
  ], rowLabel: (r) => STATUS_EFFECTS[r.id]?.name || r.id, newRow: () => ({ id: 'stunned', rounds: 1 }), addLabel: '+ Add condition',
});

const abilityFields = () => [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'desc', label: 'Description', type: 'textarea', rows: 2, hint: 'Shown on the battle button and the hero sheet' },
  { key: 'icon', label: 'Icon', type: 'select', options: ICON_NAMES },
  { type: 'section', label: 'Targeting' },
  { key: 'target', label: 'Affects', type: 'select', options: ABILITY_TARGETS.map((t) => [t, `${t} — ${TARGET_HELP[t]}`]), rerender: true },
  { key: 'range', label: 'Range (squares)', type: 'number', min: 0, max: 12, show: (o) => ['enemy', 'ally', 'tile', 'multi'].includes(o.target), hint: '1 = beside; 0 = centred on the user' },
  { key: 'radius', label: 'Radius', type: 'number', min: 0, max: 4, show: (o) => ['nearbyFoes', 'nearbyAllies', 'tile'].includes(o.target) },
  { key: 'count', label: 'Number of foes', type: 'number', min: 1, max: 6, show: (o) => o.target === 'multi' },
  { key: 'move', label: 'Movement', type: 'select', empty: '— none —', nullable: true, options: [['teleport', 'Teleport to the chosen square'], ['beside', 'Appear beside the target'], ['charge', 'Charge at the target']] },
  { key: 'others', label: 'Only companions (not the user)', type: 'check', show: (o) => o.target === 'ally' },
  { key: 'revive', label: 'Raises a companion fallen in this battle (heals the share below)', type: 'check', show: (o) => o.target === 'ally' },
  { key: 'chain', label: 'Leaps on to more foes', type: 'number', min: 0, max: 6, show: (o) => o.target === 'enemy', hint: 'Each leap goes from the last foe struck to the nearest one not yet struck' },
  { key: 'chainRange', label: 'Leap distance (squares)', type: 'number', min: 1, max: 6, show: (o) => o.target === 'enemy' && o.chain > 0 },
  { type: 'section', label: 'Effect' },
  { key: 'attack', label: 'Weapon attack', type: 'select', empty: '— no attack roll —', nullable: true, options: [['melee', 'Melee weapon'], ['ranged', 'Ranged weapon']], rerender: true },
  { key: 'hit', label: 'To-hit bonus', type: 'number', show: (o) => !!o.attack },
  { key: 'mult', label: 'Damage multiplier', type: 'number', step: 0.25, min: 0, show: (o) => !!o.attack },
  { key: 'bonus', label: 'Extra damage dice', type: 'dice', placeholder: '1d6', show: (o) => !!o.attack },
  { key: 'autoCrit', label: 'Always a critical hit', type: 'check', show: (o) => !!o.attack },
  { key: 'ignoreCover', label: 'Ignores cover', type: 'check', show: (o) => o.attack === 'ranged' },
  { key: 'needs', label: 'Needs a ranged weapon', type: 'select', empty: '— nothing —', nullable: true, options: [['ranged', 'A bow, crossbow or sling']] },
  { key: 'execute', label: 'Finishing blow below this share of health', type: 'number', step: 0.05, min: 0, max: 1, show: (o) => !!o.attack, hint: 'Against a foe this badly hurt it cannot miss and deals double damage (0.34 = a third)' },
  { key: 'thrown', label: 'Thrown missile (damage dice)', type: 'dice', placeholder: '1d4', show: (o) => !o.attack, hint: 'Rolls to hit with Dexterity, like a shot, but needs no bow (a knife, a bottle)' },
  { key: 'damage', label: 'Sure damage (no roll to hit)', type: 'dice', placeholder: '1d8', show: (o) => !o.attack },
  { key: 'undeadOnly', label: 'Its damage harms only the undead', type: 'check', show: (o) => !!o.damage },
  { key: 'heal', label: 'Healing', type: 'dice', placeholder: '1d6+1' },
  { key: 'healPct', label: 'Heal a share of health', type: 'number', step: 0.05, min: 0, max: 1 },
  { key: 'stat', label: 'Adds the modifier of', type: 'select', empty: '— none —', nullable: true, options: STATS.map((s) => [s, STAT_NAMES[s]]), hint: 'For damage and healing; monsters add half their level' },
  { key: 'undeadBonus', label: 'Multiplier against the undead', type: 'number', step: 0.5, min: 0 },
  { key: 'lifesteal', label: 'Heals the user for this share of damage', type: 'number', step: 0.05, min: 0, max: 1 },
  { key: 'cure', label: 'Cures poison', type: 'check' },
  { key: 'knockback', label: 'Knock back (squares)', type: 'number', min: 0, max: 4 },
  { key: 'pull', label: 'Drag towards the user (squares)', type: 'number', min: 0, max: 6 },
  { key: 'steal', label: 'Lifts the foe\'s purse (its gold, once per foe)', type: 'check', show: (o) => o.target === 'enemy' },
  { key: 'addMoves', label: 'More squares of movement this turn', type: 'number', min: 0, max: 8 },
  { key: 'extraTurn', label: 'The companion takes an extra turn straight after', type: 'check', show: (o) => o.target === 'ally' },
  statusList(),
  { type: 'section', label: 'Calls a creature, or marks the ground' },
  { key: 'summon', label: 'Calls into the fight', type: 'select', empty: '— nothing —', nullable: true, rerender: true, options: () => (abilityGame?.monsters || []).map((m) => [m.id, m.name]),
    hint: 'A monster that fights on the user\'s side, on the chosen square (Affects: tile). It grows a little stronger with the caller\'s level.' },
  { key: 'summonName', label: 'Called', type: 'text', placeholder: 'Spirit Wolf', show: (o) => !!o.summon },
  { key: 'summonTint', label: 'Tinted', type: 'color', nullable: true, show: (o) => !!o.summon },
  { key: 'place', label: 'Marks the ground', type: 'select', empty: '— no —', nullable: true, rerender: true,
    options: [['trap', 'Trap: the first foe to step on the square suffers the ability'], ['zone', 'Zone: harms foes and mends friends who start a turn there or walk in']],
    hint: 'Aimed at a square (Affects: tile) or round the user (Affects: self). Radius sets its size.' },
  { key: 'lasts', label: 'Lasts (turns of the creature, rounds of the mark)', type: 'number', min: 1, max: 12, show: (o) => !!(o.summon || o.place) },
  { type: 'section', label: 'Use' },
  { key: 'cooldown', label: 'Cooldown (turns)', type: 'number', min: 0, max: 10 },
  { key: 'perBattle', label: 'Uses per battle', type: 'number', min: 0, max: 5, hint: '0 or empty = unlimited' },
  { key: 'free', label: 'Free action (does not end the turn)', type: 'check' },
  { key: 'windup', label: 'Telegraphed: lands next turn on the marked squares', type: 'check' },
  { key: 'windupVerb', label: 'What a monster is seen to do as it winds up', type: 'text', placeholder: 'raises its weapon high', show: (o) => !!o.windup },
  { type: 'section', label: 'Look' },
  { key: 'vfx', label: 'Effect', type: 'select', options: ABILITY_VFX },
  { key: 'fx', label: 'Colour', type: 'color' },
];

// ---- charms: what a worn piece does (game/charms.js has the vocabulary)
const GEAR = ['weapon', 'armor', 'shield'];
const isCharm = (o) => o.type === 'charm';
const wearable = (o) => isCharm(o) || GEAR.includes(o.type);
const takes = (p) => (r) => (EFFECT_TYPES[r.type]?.params || []).includes(p);
const effectFields = (game) => [
  { key: 'type', label: 'Effect', type: 'select', rerender: true, options: Object.entries(EFFECT_TYPES).map(([k, v]) => [k, `${v.group} — ${v.name}`]),
    put: (r, v) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, newEffect(v)); } },
  { key: 'stat', label: 'Raises', type: 'select', options: Object.entries(BONUS_STATS), show: takes('stat'), hint: 'Critical range: crits on that many more numbers of the die' },
  { key: 'status', label: 'Condition', type: 'select', options: Object.entries(STATUS_EFFECTS).map(([k, v]) => [k, `${v.name} — ${v.desc}`]), show: takes('status') },
  { key: 'power', label: 'Strength', type: 'number', show: takes('power'), hint: 'Bonus points; for a condition its strength (to hit, armour, squares, poison a turn); for sight, squares further' },
  { key: 'rounds', label: 'Turns', type: 'number', min: 1, max: 99, show: takes('rounds'), hint: '99 = the whole battle' },
  { key: 'chance', label: 'Chance', type: 'number', step: 0.05, min: 0, max: 1, nullable: true, show: takes('chance'), hint: 'Empty or 1: always' },
  { key: 'who', label: 'On whom', type: 'select', options: [['self', 'The wearer'], ['party', 'The whole company'], ['foes', 'Every foe (battle start only)']], show: takes('who') },
  { key: 'with', label: 'Only while someone else in the company wears', type: 'select', empty: '— always —', nullable: true, show: takes('with'),
    options: () => game.items.filter((i) => i.type === 'charm').map((i) => [i.id, i.name]), hint: 'A twin: this magic wakes only beside its other half' },
  { key: 'hp', label: 'Health a turn', type: 'number', min: 0, show: takes('hp') },
  { key: 'mp', label: 'Mana a turn', type: 'number', min: 0, show: takes('mp') },
  { key: 'melee', label: 'Only in melee', type: 'check', show: takes('melee') },
  { key: 'ranged', label: 'Only with missiles', type: 'check', show: takes('ranged') },
  { key: 'pct', label: 'How much (0.1 = 10%)', type: 'number', step: 0.05, min: 0, max: 2, show: takes('pct') },
  { key: 'dmg', label: 'Damage', type: 'dice', placeholder: '1d4', show: takes('dmg') },
  { key: 'below', label: 'Below this share of health', type: 'number', step: 0.05, min: 0.05, max: 0.95, show: takes('below') },
  { key: 'gold', label: 'More gold (0.25 = a quarter)', type: 'number', step: 0.05, min: 0, max: 1, show: takes('gold') },
  { key: 'xp', label: 'Learns faster (0.1 = a tenth)', type: 'number', step: 0.05, min: 0, max: 1, show: takes('xp') },
  { key: 'light', label: 'Light in the dark (squares)', type: 'number', min: 0, max: 8, show: takes('light') },
  { key: 'radius', label: 'Senses within (squares)', type: 'number', min: 1, max: 12, show: takes('radius') },
];

// a battle action granted by a worn piece: the ability fields, kept on item.ability
const itemAbilityFields = () => abilityFields().map((f) => ({ ...f, key: f.key ? `ability.${f.key}` : undefined, show: (o) => !!o.ability && (!f.show || f.show(o.ability)) }));
const NEW_ACTION = (o) => ({ name: `${o.name || 'Charm'}'s Power`, icon: o.icon || CHARM_KIND_ICONS[o.kind] || 'star', target: 'nearbyFoes', radius: 2, perBattle: 1, statuses: [{ id: 'stunned', rounds: 1, chance: 0.3 }], vfx: 'arcane', fx: o.tint ?? 0xc8b8ff, desc: 'Once per battle. Describe what it does.' });

// a new charm (or an item turned into one) starts as a humble lucky trinket
function charmDefaults(o) {
  for (const k of ['wkind', 'dmg', 'hit', 'range', 'twoHanded', 'model', 'weight', 'ac', 'effect', 'power', 'combat', 'magical', 'glow']) delete o[k];
  Object.assign(o, { kind: o.kind || 'ring', rarity: o.rarity || 'common', level: o.level || 1, tint: o.tint ?? 0xd8c8a0, price: Math.max(o.price || 0, 40) });
  if (!Array.isArray(o.effects) || !o.effects.length) o.effects = [newEffect('bonus')];
  if (!o.desc) o.desc = 'A trinket of magic. Say where it came from, and what it feels like to wear.';
}

const ITEM_GROUPS = { weapon: 'Weapons', armor: 'Armour & shields', shield: 'Armour & shields', charm: 'Charms', consumable: 'Potions & supplies', reagent: 'Reagents & herbs', scroll: 'Spell scrolls', key: 'Keys, maps & quest things', quest: 'Keys, maps & quest things', map: 'Keys, maps & quest things' };

const WEAPON_MODELS = ['sword', 'greatsword', 'axe', 'hammer', 'mace', 'club', 'staff', 'spear', 'dagger', 'bow', 'crossbow', 'sling'];

// (the game whose monsters an ability can call: set by categories())
let abilityGame = null;

export function categories(game) {
  ensureCombatData(game);
  abilityGame = game;
  const abilities = () => game.abilities.map((a) => [a.id, `${a.name}${a.special ? ' ★' : ''}${a.monster ? ' (monster)' : ''}`]);
  const items = () => game.items.map((i) => [i.id, i.name]);
  const systems = () => game.magic.map((m) => [m.id, m.name]);
  const sysOf = (sp) => game.magic.find((m) => m.id === sp.system);
  // (tactics) the kinds of weapon, each with its trait
  if (!Array.isArray(game.weaponKinds) || !game.weaponKinds.length) game.weaponKinds = deepClone(WEAPON_KIND_DEFS);
  const kinds = () => weaponKinds(game).map((k) => [k.id, k.trait && WEAPON_TRAITS[k.trait] ? `${k.name} — ${WEAPON_TRAITS[k.trait]}` : k.name]);
  const heavyOf = (k) => k.heavyWeapons ?? (!(k.weapons || []).length || k.weapons.includes('greatblade'));
  return {
    races: {
      label: 'Races', icon: '🧝', list: game.races,
      blank: () => ({ name: 'New Race', desc: '', mods: { str: 0, dex: 0, int: 0, wis: 0 }, hp: 0, traits: [], look: { race: 'human' } }),
      preview: (r) => ({ kind: 'humanoid', race: r.look?.race || 'human', skin: r.look?.skin, body: 0x6a5a4a }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea' },
        { key: 'mods', label: 'Attribute modifiers', type: 'statmods', hint: STATS.map((s) => STAT_NAMES[s]).join(' · ') },
        { key: 'hp', label: 'Extra health per level', type: 'number', min: -5, max: 10 },
        { key: 'traits', label: 'Traits', type: 'multicheck', options: Object.entries(RACE_TRAITS) },
        { type: 'section', label: 'Appearance' },
        { key: 'look.race', label: 'Body shape', type: 'select', options: [['human', 'Human'], ['elf', 'Elf (tall, pointed ears)'], ['dwarf', 'Dwarf (short, bearded)'], ['hobbit', 'Halfling (small)'], ['orc', 'Orc'], ['goblin', 'Goblin']] },
        { key: 'look.skin', label: 'Skin', type: 'color', nullable: true },
      ],
    },
    classes: {
      label: 'Classes', icon: '⚔', list: game.classes,
      blank: () => ({ name: 'New Class', desc: '', hpBase: 12, hpLevel: 6, hitRate: 0.75, magic: [], weapons: ['blade', 'dagger'], armor: 'leather', shields: false, abilities: [], start: ['dagger'], primary: ['str', 'dex'], look: { body: 0x6a5a4a } }),
      preview: (c) => ({ kind: 'humanoid', race: 'human', ...(c.look || {}) }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea' },
        { key: 'requires', label: 'Only available if magic enabled', type: 'select', empty: '— always available —', nullable: true, options: systems },
        { key: 'hpBase', label: 'Health at level 1', type: 'number', min: 1 },
        { key: 'hpLevel', label: 'Health per level', type: 'number', min: 1 },
        { key: 'hitRate', label: 'Fighting skill', type: 'number', step: 0.05, min: 0, max: 1.5, hint: 'To-hit bonus per level (warrior 1.0, wizard 0.4)' },
        { key: 'magic', label: 'Magic', type: 'list', fields: [
          { key: 'system', label: 'System', type: 'select', options: systems },
          { key: 'rate', label: 'Aptitude', type: 'number', step: 0.25, min: 0.25, max: 1, hint: '1 = full caster, 0.5 = learns slowly' },
        ], rowLabel: (r) => game.magic.find((m) => m.id === r.system)?.name || 'Magic', newRow: () => ({ system: game.magic[0].id, rate: 1 }), addLabel: '+ Add magic' },
        { key: 'weapons', label: 'Weapons trained in', type: 'multicheck', options: kinds,
          hint: 'Anyone may wield any weapon, but untrained it is −3 to hit and its trait does not work (Rules: or forbid it). None ticked: trained in all. Each kind\'s trait is under Weapon kinds.' },
        { key: 'heavyWeapons', label: 'Trained in heavy weapons', type: 'check', get: (o) => heavyOf(o), hint: 'Great swords, battle axes and other heavy pieces need this too (warriors, paladins, runesmiths)' },
        { key: 'armor', label: 'Heaviest armour', type: 'select', options: ARMOR_WEIGHTS },
        { key: 'shields', label: 'Can use shields', type: 'check' },
        { key: 'abilities', label: 'Special abilities', type: 'multicheck', options: Object.entries(CLASS_ABILITIES) },
        { key: 'skills', label: 'Battle skills, and the level each is learned at', type: 'list', fields: [
          { key: 'id', label: 'Skill', type: 'select', options: abilities },
          { key: 'level', label: 'Learned at level', type: 'number', min: 1, max: 20 },
        ], inline: true, get: (o) => { if ((o.skills || []).some((x) => typeof x === 'string')) o.skills = classSkills(o); return o.skills; },
          rowLabel: (r) => `${game.abilities.find((a) => a.id === r.id)?.name || r.id || 'Skill'} — level ${r.level || 1}`,
          newRow: () => ({ id: game.abilities.find((a) => !a.monster && !a.special && !a.general)?.id, level: 5 }), addLabel: '+ Add skill',
          hint: 'Defined under Abilities. They go on the battle bar (keys 1–9) as the hero reaches each level; the built-in callings learn theirs at 1, 3, 5, 7 and 9.' },
        { key: 'special', label: 'Battle special (key Q)', type: 'select', empty: '— none —', nullable: true, options: abilities, hint: 'Usually a once-per-battle ability (★).' },
        { key: 'specialLevel', label: 'Special learned at level', type: 'number', min: 1, max: 20, placeholder: String(SPECIAL_LEVEL), nullable: true, show: (o) => !!o.special, hint: `Empty: level ${SPECIAL_LEVEL}` },
        { key: 'talents', label: 'Talent tree', type: 'select', empty: '— guess from the skills —', nullable: true, options: Object.entries(TALENT_TREES), hint: 'On each level-up a hero picks one of three talents, mostly from this tree.' },
        { key: 'primary', label: 'Favoured attributes', type: 'multicheck', options: STATS.map((s) => [s, STAT_NAMES[s]]), hint: 'Suggested when creating a hero. Players spend a point per level themselves.' },
        { key: 'start', label: 'Starting equipment', type: 'ids', options: items },
        { type: 'section', label: 'Appearance' },
        ...LOOK_FIELDS.filter((f) => !['look.race', 'look.skin', 'look.hair', 'look.beard'].includes(f.key)),
      ],
    },
    items: {
      label: 'Items', icon: '🗡', list: game.items,
      group: (i) => ITEM_GROUPS[i.type] || 'Other things',
      blank: () => ({ name: 'New Item', type: 'weapon', wkind: 'blade', dmg: '1d6', hit: 0, range: 1, price: 20, model: 'sword', desc: '' }),
      // (a second button: a new charm, ready to wear)
      blanks: [['+ New charm', () => { const o = { name: 'New Charm', type: 'charm' }; charmDefaults(o); return o; }]],
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'type', label: 'Kind', type: 'select', options: ITEM_TYPES, rerender: true, put: (o, v) => { o.type = v; if (v === 'charm') charmDefaults(o); } },
        { key: 'kind', label: 'What it is', type: 'select', options: Object.entries(CHARM_KINDS), show: isCharm, rerender: true, hint: 'Worn in the charm slot. Gives it a default icon.' },
        { key: 'rarity', label: 'Rarity', type: 'select', options: Object.entries(RARITIES).map(([k, v]) => [k, v.name]), show: isCharm, hint: 'Colours its name; rarer charms turn up less often' },
        { key: 'level', label: 'Level', type: 'number', min: 1, max: 12, show: isCharm, hint: 'Found in the spoils of battle and in hoards from about this level of the company' },
        { key: 'desc', label: 'Description', type: 'textarea', rows: 2 },
        { key: 'price', label: 'Price (gold)', type: 'number', min: 0 },
        { key: 'unique', label: 'Unique — never sold in shops', type: 'check' },
        { key: 'noLoot', label: 'Never dropped by defeated monsters or found in hoards', type: 'check', show: wearable },
        { key: 'wkind', label: 'Weapon type', type: 'select', options: kinds, show: (o) => o.type === 'weapon', rerender: true,
          hint: 'Its kind\'s trait works for a hero trained in it (World Data → Weapon kinds; Classes → weapons trained in)' },
        { type: 'info', label: (o) => traitText(weaponKinds(game).find((k) => k.id === o.wkind)) || 'This kind has no trait.', show: (o) => o.type === 'weapon' },
        { key: 'heavy', label: 'Heavy weapon — needs heavy-weapon training', type: 'check', show: (o) => o.type === 'weapon' && (o.range || 1) <= 1, get: (o) => isHeavy(game, { id: 'x', ...o }),
          hint: 'Unticked by default unless it is two-handed or its kind is heavy' },
        { key: 'dmg', label: 'Damage', type: 'dice', placeholder: '1d8', show: (o) => o.type === 'weapon' },
        { key: 'hit', label: 'To-hit bonus', type: 'number', show: (o) => o.type === 'weapon' },
        { key: 'range', label: 'Range', type: 'number', min: 1, max: 12, show: (o) => o.type === 'weapon', hint: '1 = melee (hand weapon); 2 or more = ranged, carried in its own slot beside a hand weapon' },
        { key: 'twoHanded', label: 'Two-handed', type: 'check', show: (o) => o.type === 'weapon' },
        { key: 'model', label: 'Looks like', type: 'select', options: WEAPON_MODELS, show: (o) => o.type === 'weapon' },
        { key: 'magical', label: 'Magical — marked ✦ in the pack and shops', type: 'check', show: (o) => ['weapon', 'armor', 'shield'].includes(o.type) },
        { key: 'glow', label: 'Magic colour', type: 'color', nullable: true, show: (o) => ['weapon', 'armor', 'shield'].includes(o.type),
          hint: 'The ✦ mark and the name take this colour; a weapon also glows in the hero\'s hand. Setting it marks the piece magical.' },
        { key: 'weight', label: 'Weight', type: 'select', options: ARMOR_WEIGHTS, show: (o) => o.type === 'armor' },
        { key: 'ac', label: 'Armour bonus', type: 'number', min: 0, show: (o) => o.type === 'armor' || o.type === 'shield' },
        { key: 'block', label: 'Blocks (0.15 = 15%)', type: 'number', step: 0.05, min: 0, max: 0.75, nullable: true, show: (o) => o.type === 'shield', placeholder: '0',
          hint: 'The chance it turns aside a blow or shot that would land (not one from behind). The built-in buckler blocks 10%, the kite shield 20%.' },
        { key: 'soak', label: 'Soaks from every blow', type: 'number', min: 0, max: 6, nullable: true, show: (o) => o.type === 'armor', placeholder: 'by weight',
          hint: 'Damage taken off each blow that lands (never below 1). Empty: as its weight (chain 1, plate 2)' },
        { key: 'effect', label: 'Effect', type: 'select', options: ITEM_EFFECTS, show: (o) => o.type === 'consumable', rerender: true },
        { key: 'pool', label: 'Refills', type: 'multicheck', show: (o) => o.type === 'consumable' && o.effect === 'mp',
          options: () => (game.magic || []).filter((m) => m.resource === 'mp' && !m.monsterOnly).map((m) => [m.id, `${m.resName || 'Mana'} (${m.name})`]),
          hint: 'Whose spell points it renews: a tonic for sorcerers\' mana, a candle for clerics\' faith. Leave all unticked to refill any.' },
        { key: 'power', label: 'Power', type: 'text', placeholder: '2d8+2', show: (o) => o.type === 'consumable', hint: 'Healing dice, light duration, food amount…' },
        { key: 'combat', label: 'Usable in battle', type: 'check', show: (o) => o.type === 'consumable' },
        { key: 'treasure', label: 'Leads to', type: 'select', options: () => game.maps.flatMap((m) => (m.entities || []).filter((e) => e.type === 'treasure').map((e) => [e.id, `${e.name || 'Buried treasure'} (${m.name} ${e.x}, ${e.y})`])), empty: '— nowhere —', nullable: true, show: (o) => o.type === 'map', hint: 'Bury treasure with the ⛏ tool on a map; its map item is made with it.' },
        { key: 'forage', label: 'Gathered while travelling through', type: 'multicheck', show: (o) => o.type === 'reagent',
          options: () => TERRAIN_LIST.filter((t) => t.group === 'world' && t.walk && !t.feature && !t.water).map((t) => [t.key, t.name]),
          hint: 'A hero whose art burns it (a ranger, for herbs) sometimes finds a few on this ground. Leave empty: bought only.' },
        { key: 'icon', label: 'Icon', type: 'select', empty: '— herb —', nullable: true, options: ICON_NAMES, show: (o) => o.type === 'reagent' },
        { key: 'icon', label: 'Icon', type: 'select', empty: '— as its kind —', nullable: true, options: ICON_NAMES, show: isCharm },
        { key: 'tint', label: 'Icon colour', type: 'color', nullable: true, show: (o) => o.type === 'reagent' || isCharm(o) },
        { key: 'spell', label: 'Teaches', type: 'select', options: () => game.spells.filter((sp) => !sysOf(sp)?.monsterOnly).map((sp) => [sp.id, `${sp.name} (${sysOf(sp)?.name || sp.system}, circle ${sp.level || 1})`]), show: (o) => o.type === 'scroll',
          hint: 'Copied into the spellbook of a hero whose school is drawn as a spellbook, once its circle is within reach.' },
        { type: 'info', label: 'Reagents fuel reagent schools such as Rune-craft and Herb-lore. Keys open locked doors and chests (one key per lock). Quest items can be required by portals and checked in conversations.', show: (o) => ['reagent', 'key', 'quest'].includes(o.type) },
        // ---- magic worn: charms, and arms and armour with a little magic of their own
        { type: 'section', label: 'Magic while worn', show: wearable },
        { type: 'info', label: (o) => (isCharm(o) ? 'Only a worn charm works: one in the pack sleeps.' : 'Works while the piece is worn (a weapon\'s, only with its own blows).'), show: wearable },
        { key: 'effects', label: 'Effects', type: 'list', show: wearable, fields: effectFields(game), rowLabel: (r) => effectText(game, r) || r.type, newRow: () => newEffect('bonus'), addLabel: '+ Add effect' },
        { key: 'say', label: 'Said when its battle-start magic fires', type: 'text', placeholder: '{who} sounds the horn — the company is blessed!', show: (o) => wearable(o) && (o.effects || []).some((e) => e.type === 'onStart'), hint: '{who} is the wearer. Empty: a plain line.' },
        { type: 'section', label: 'Battle action while worn', show: wearable },
        { key: 'ability', label: 'Gives the wearer a battle action (on the battle bar, with the item\'s badge)', type: 'check', show: wearable, get: (o) => !!o.ability, put: (o, v) => { if (v) o.ability = o.ability || NEW_ACTION(o); else delete o.ability; } },
        ...itemAbilityFields().map((f) => ({ ...f, show: (o) => wearable(o) && f.show(o) })),
        { type: 'section', label: 'Who may wear it', show: wearable },
        { key: 'only.races', label: 'Only these peoples', type: 'multicheck', options: () => game.races.map((r) => [r.id, r.name]), show: wearable, hint: 'None ticked: anyone' },
        { key: 'only.classes', label: 'Only these callings', type: 'multicheck', options: () => game.classes.map((k) => [k.id, k.name]), show: wearable, hint: 'None ticked: anyone' },
        { key: 'onlyText', label: 'Said to anyone else', type: 'text', placeholder: 'Only a dwarf can wake its runes', show: (o) => wearable(o) && ((o.only?.races || []).length || (o.only?.classes || []).length), hint: 'Empty: "Only a … can wear it"' },
      ],
    },
    spells: {
      label: 'Spells', icon: '✨', list: game.spells,
      group: (sp) => sysOf(sp)?.name || sp.system,
      blank: () => ({ name: 'New Spell', system: game.magic[0].id, level: 1, cost: 3, target: 'enemy', effect: 'damage', power: '2d6', range: 6, combat: true, field: false, fx: 0xffa040, desc: '' }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'system', label: 'Magic system', type: 'select', options: systems, rerender: true },
        { key: 'level', label: 'Circle', type: 'number', min: 1, max: 5, hint: 'Casters learn circle N at about level 2N-1' },
        { key: 'scroll', label: 'Learned only from a scroll', type: 'check', hint: 'Not learned by levelling: copied into a spellbook from a scroll item (Items → kind "scroll").' },
        { key: 'cost', label: 'Mana cost', type: 'number', min: 0, show: (o) => sysOf(o)?.resource !== 'reagents' },
        { key: 'reagents', label: 'Reagents consumed', type: 'ids', options: () => game.items.filter((i) => i.type === 'reagent').map((i) => [i.id, i.name]), show: (o) => sysOf(o)?.resource === 'reagents' || (o.reagents && o.reagents.length) },
        { key: 'target', label: 'Target', type: 'select', options: SPELL_TARGETS, rerender: true },
        { key: 'effect', label: 'Effect', type: 'select', options: SPELL_EFFECTS, rerender: true },
        { key: 'power', label: 'Power', type: 'text', placeholder: '3d6', hint: 'Dice for damage/healing; rounds for sleep/fear; bonus for shield/bless; turns for light.' },
        { key: 'range', label: 'Range', type: 'number', min: 1, show: (o) => o.target === 'enemy' || o.target === 'area' },
        { key: 'radius', label: 'Blast radius', type: 'number', min: 1, max: 4, show: (o) => o.target === 'area' },
        { key: 'duration', label: 'Lasts (rounds)', type: 'number', min: 1, show: (o) => o.effect === 'shield' || o.effect === 'bless' },
        { key: 'chance', label: 'Chance to affect each foe', type: 'number', step: 0.05, min: 0, max: 1, show: (o) => o.effect === 'sleep' || o.effect === 'fear' },
        { key: 'autoHit', label: 'Never misses', type: 'check', show: (o) => o.effect === 'damage' },
        { ...statusList('Also inflicts'), show: (o) => o.effect === 'damage' },
        { key: 'undeadOnly', label: 'Only harms the undead', type: 'check', show: (o) => o.effect === 'damage' },
        { key: 'undeadBonus', label: 'Double damage to the undead', type: 'check', show: (o) => o.effect === 'damage' },
        { key: 'combat', label: 'Usable in battle', type: 'check' },
        { key: 'field', label: 'Usable while exploring', type: 'check' },
        { key: 'fx', label: 'Colour', type: 'color' },
        { key: 'desc', label: 'Description', type: 'textarea', rows: 2 },
      ],
    },
    monsters: {
      label: 'Monsters', icon: '🐉', list: game.monsters,
      blank: () => ({ name: 'New Monster', plural: 'New Monsters', level: 1, hp: '2d8', ac: 12, hit: 1, dmg: '1d6', xp: 10, gold: '1d6', habitat: ['grass'], native: ['grass', 'meadow'], group: [1, 3], look: { kind: 'humanoid', race: 'orc', body: 0x4a3a2a, weapon: 'axe' }, desc: '' }),
      preview: (m) => m.look,
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'plural', label: 'Plural', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea', rows: 2 },
        { key: 'level', label: 'Level', type: 'number', min: 1, max: 20, hint: 'Random encounters favour monsters near the party\'s level.' },
        { key: 'hp', label: 'Health', type: 'dice', placeholder: '3d8+2' },
        { key: 'ac', label: 'Armour class', type: 'number' },
        { key: 'hit', label: 'To-hit bonus', type: 'number' },
        { key: 'dmg', label: 'Damage', type: 'dice' },
        { key: 'range', label: 'Attack range', type: 'number', min: 1, hint: '>1 makes it an archer' },
        { key: 'speed', label: 'Actions per turn', type: 'number', min: 1, max: 3 },
        { key: 'moves', label: 'Squares moved per turn', type: 'number', min: 1, max: 8, hint: 'Default 4. Monsters move, then strike.' },
        { key: 'xp', label: 'Experience', type: 'number', min: 0 },
        { key: 'gold', label: 'Gold carried', type: 'dice' },
        { key: 'habitat', label: 'Found in', type: 'multicheck', options: HABITATS },
        { key: 'native', label: 'At home on (moves freely)', type: 'multicheck', options: () => TERRAIN_LIST.filter((t) => t.walk && t.cost > 1 || ['grass', 'meadow'].includes(t.key)).map((t) => [t.key, `${t.name} (${t.cost})`]),
          hint: 'Rough ground costs it no more than a turn a step; elsewhere it pays the full cost, like the party (forest 1.5, hills 1.75, swamp 2, sand 2.5…). Roads are half a turn for all.' },
        { key: 'group.0', label: 'Group size from', type: 'number', min: 1 },
        { key: 'group.1', label: 'Group size to', type: 'number', min: 1 },
        { key: 'escort', label: 'Escorted by', type: 'list', fields: [
          { key: 'id', label: 'Monster', type: 'select', options: () => game.monsters.map((m) => [m.id, m.name]) },
          { key: 'min', label: 'Min', type: 'number', min: 0 },
          { key: 'max', label: 'Max', type: 'number', min: 0 },
        ], rowLabel: (r) => game.monsters.find((m) => m.id === r.id)?.name || 'Escort', newRow: () => ({ id: game.monsters[0].id, min: 1, max: 2 }), addLabel: '+ Add escort' },
        { key: 'spells', label: 'Spells', type: 'ids', options: () => game.spells.map((s) => [s.id, s.name]) },
        { key: 'castChance', label: 'Chance to cast', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'ai', label: 'Behaviour in battle', type: 'select', options: Object.entries(AI_STYLES) },
        { key: 'abilities', label: 'Battle abilities', type: 'ids', options: abilities, hint: 'Defined under Abilities. Used when ready (bosses more eagerly).' },
        { key: 'init', label: 'Initiative bonus', type: 'number', min: -10, max: 20, hint: 'Higher acts earlier in each round' },
        { key: 'reflex', label: 'Reflexes', type: 'number', min: -4, max: 6, nullable: true, placeholder: 'from its pace',
          hint: 'Like a hero\'s Dexterity when someone breaks away from it (or it from them): each point is 5% on the chance of a free strike. Empty: +1 for the fleet, −1 for the slow' },
        { key: 'poison', label: 'Chance to poison', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'regen', label: 'Regenerates per round', type: 'number', min: 0 },
        { key: 'fleeAt', label: 'Flees below (fraction of health)', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'undead', label: 'Undead', type: 'check' },
        { key: 'beast', label: 'A wild beast (a charm of calming soothes it)', type: 'check', get: (o) => isBeast(o) },
        { key: 'sleepImmune', label: 'Immune to sleep', type: 'check' },
        // (isles) a statue shrugs off blows and the conditions of the living
        { key: 'hardened', label: 'Shrugs off per blow', type: 'number', min: 0, max: 10, hint: 'Each blow that lands on it does this much less (never below 1). Stone, thick hide, a shell.' },
        // (tactics II) a shield of its own, and its seasoned kind
        { key: 'block', label: 'Shield blocks (0.1 = 10%)', type: 'number', step: 0.05, min: 0, max: 0.75, nullable: true, placeholder: '0', hint: 'The chance it turns aside a hero\'s blow or shot that would land (not one from behind).' },
        { type: 'section', label: 'Seasoned (veterans)' },
        { key: 'veteran', label: 'Comes seasoned when the company has far outgrown it', type: 'check', get: (o) => o.veteran !== false, put: (o, v) => { if (v) delete o.veteran; else o.veteran = false; },
          hint: 'A wandering band this many levels below the company (Rules → Battle: seasoned foes) comes as veterans: tougher, and worth more.' },
        { key: 'vetName', label: 'Its seasoned name', type: 'text', placeholder: 'empty: "<name> Veteran"', show: (o) => o.veteran !== false && !o.boss, hint: 'A beast reads better with a name of its own: Dire Wolf, Plague Rat.' },
        { key: 'vetPlural', label: 'Seasoned, plural', type: 'text', placeholder: 'empty: the name and an s', show: (o) => o.veteran !== false && !o.boss && !!o.vetName },
        { key: 'immune', label: 'Proof against', type: 'multicheck', options: () => Object.entries(STATUS_EFFECTS).filter(([, d]) => d.bad).map(([k, d]) => [k, d.name]) },
        { key: 'swim', label: 'Lives in water', type: 'check' },
        { key: 'fly', label: 'Flies (crosses water)', type: 'check' },
        { key: 'boss', label: 'Unique boss (never random)', type: 'check' },
        { type: 'section', label: 'Second phase' },
        { key: 'phaseAt', label: 'Second phase below (fraction of health)', type: 'number', step: 0.05, min: 0, max: 0.95, rerender: true, hint: 'Once per battle, e.g. 0.5 at half health. 0 or empty: no second phase.' },
        { key: 'phaseEnrage', label: 'Becomes enraged (+2 to hit, ×1.25 damage)', type: 'check', show: (o) => o.phaseAt > 0 },
        { key: 'phaseAdds', label: 'Calls to its side', type: 'list', show: (o) => o.phaseAt > 0, fields: [
          { key: 'id', label: 'Monster', type: 'select', options: () => game.monsters.map((m) => [m.id, m.name]) },
          { key: 'min', label: 'Min', type: 'number', min: 0 },
          { key: 'max', label: 'Max', type: 'number', min: 0 },
        ], rowLabel: (r) => game.monsters.find((m) => m.id === r.id)?.name || 'Monster', newRow: () => ({ id: game.monsters[0].id, min: 2, max: 2 }), addLabel: '+ Add reinforcements' },
        { key: 'phaseText', label: 'What happens (shown in the log)', type: 'textarea', rows: 2, show: (o) => o.phaseAt > 0 },
        { type: 'section', label: 'Appearance' },
        { key: 'look.kind', label: 'Shape', type: 'select', options: MODEL_KINDS.filter((k) => !['chest', 'ship', 'waygate', 'sign', 'campfire', 'marker'].includes(k)), rerender: true },
        { key: 'look.scale', label: 'Size', type: 'number', step: 0.05, min: 0.3, max: 3 },
        { key: 'look.color', label: 'Colour', type: 'color', show: (o) => o.look?.kind !== 'humanoid' },
        { key: 'look.eyes', label: 'Glowing eyes', type: 'color', nullable: true },
        // (isles) the finer touches of the newer beasts
        { key: 'look.belly', label: 'Belly', type: 'color', nullable: true, show: (o) => ['frog', 'naga', 'serpent', 'dragon', 'shark', 'quadruped'].includes(o.look?.kind) },
        { key: 'look.spots', label: 'Spots', type: 'color', nullable: true, show: (o) => ['frog', 'cat'].includes(o.look?.kind) },
        { key: 'look.mist', label: 'Wreathed in mist', type: 'check', show: (o) => o.look?.kind === 'wraith' },
        { key: 'look.glow', label: 'Glowing runes', type: 'color', nullable: true, show: (o) => o.look?.kind === 'guardian' },
        { key: 'look.crest', label: 'Crest', type: 'color', nullable: true, show: (o) => o.look?.kind === 'humanoid' && o.look?.race === 'lizard' },
        ...LOOK_FIELDS.map((f) => ({ ...f, show: (o) => o.look?.kind === 'humanoid' && (!f.show || f.show(o)) })),
      ],
    },
    weaponKinds: {
      label: 'Weapon kinds', icon: '🏹', list: game.weaponKinds,
      blank: () => ({ name: 'New Kind', plural: 'new kinds', trait: 'parry', power: 1, desc: '' }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'plural', label: 'As it reads in a sentence', type: 'text', placeholder: 'blades', hint: '"A wizard has no training with blades"' },
        { key: 'desc', label: 'Description', type: 'textarea', rows: 2 },
        { key: 'trait', label: 'Trait (works in a trained hand)', type: 'select', empty: '— none —', nullable: true, rerender: true, options: Object.entries(WEAPON_TRAITS) },
        { type: 'info', label: (o) => traitText(o) || 'A weapon of this kind has no trait of its own.' },
        { key: 'power', label: 'Strength', type: 'number', min: 0, max: 6, show: (o) => ['parry', 'hew', 'quick', 'ward', 'far'].includes(o.trait),
          hint: 'Parry and Ward: armour; Hew: damage; Quick: to hit when flanking; Far shot: squares of range' },
        { key: 'minAc', label: 'Against armour of at least', type: 'number', min: 0, max: 30, placeholder: '14', show: (o) => o.trait === 'hew' },
        { key: 'chance', label: 'Chance a hit staggers', type: 'number', step: 0.05, min: 0, max: 1, placeholder: '0.3', show: (o) => o.trait === 'stagger' },
        { key: 'range', label: 'Reach (squares)', type: 'number', min: 2, max: 3, placeholder: '2', show: (o) => o.trait === 'reach' },
        { key: 'heavy', label: 'A heavy kind — needs heavy-weapon training', type: 'check' },
        { type: 'info', label: () => `The built-in kinds: ${WEAPON_KIND_DEFS.map((k) => `${k.name} (${WEAPON_TRAITS[k.trait]})`).join(', ')}.` },
      ],
    },
    abilities: {
      label: 'Abilities', icon: '💥', list: game.abilities,
      group: (a) => (a.monster ? 'Monster abilities' : a.special ? 'Class specials ★' : a.general ? 'Battle arts (any calling)' : 'Class skills'),
      blank: () => ({ name: 'New Ability', icon: 'star', target: 'enemy', range: 1, attack: 'melee', mult: 1, cooldown: 2, statuses: [], vfx: 'slash', fx: 0xffe080, desc: '' }),
      fields: [
        ...abilityFields().slice(0, 3),
        { key: 'special', label: 'A class special (★, key Q)', type: 'check' },
        { key: 'monster', label: 'Monster ability (hidden from class lists)', type: 'check' },
        { key: 'general', label: 'A battle art: any hero may learn it', type: 'check', rerender: true, show: (o) => !o.monster && !o.special,
          hint: 'On every second level one of the three talents on offer is a battle art the hero does not know yet.' },
        { key: 'level', label: 'Offered from level', type: 'number', min: 2, max: 20, placeholder: '2', show: (o) => !!o.general },
        ...abilityFields().slice(3),
      ],
    },
    magic: {
      label: 'Magic Systems', icon: '🔮', list: game.magic,
      blank: () => ({ name: 'New Art', stat: 'int', resource: 'mp', enabled: true, color: '#c0a0ff', style: 'prayer', resName: 'Mana', verb: 'Cast', icon: 'wand', desc: '' }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'enabled', label: 'Enabled in this game', type: 'check', hint: 'Disabled systems vanish from play: their spells cannot be cast and classes that require them are hidden.' },
        { key: 'stat', label: 'Powered by', type: 'select', options: STATS.map((s) => [s, STAT_NAMES[s]]) },
        { key: 'resource', label: 'Spells cost', type: 'select', options: [['mp', 'A pool of points (mana)'], ['reagents', 'Reagents (items)']] },
        { key: 'resName', label: 'Called', type: 'text', placeholder: 'Mana', hint: 'What the player sees: Mana, Faith, Voice… or Reagents, Herbs' },
        { key: 'style', label: 'Look', type: 'select', options: Object.entries(MAGIC_STYLES), hint: 'The cast window. A spellbook can also learn spells from scrolls.' },
        { key: 'verb', label: 'Battle button', type: 'text', placeholder: 'Cast' },
        { key: 'icon', label: 'Icon', type: 'select', options: ICON_NAMES },
        { key: 'color', label: 'Colour', type: 'color', css: true },
        { key: 'desc', label: 'Description', type: 'textarea' },
        { key: 'monsterOnly', label: 'Monsters only', type: 'check' },
      ],
    },
  };
}

export class DatabaseEditor {
  constructor(ed, left, main) {
    this.ed = ed;
    this.left = left;
    this.main = main;
    this.cat = 'races';
    this.sel = null;
  }

  render() {
    const cats = categories(this.ed.game);
    const C = cats[this.cat];
    clear(this.left);
    const catBar = h('div.cat-list', ...Object.entries(cats).map(([k, c]) => h('button' + (k === this.cat ? '.on' : ''), {
      onclick: () => { this.cat = k; this.sel = null; this.render(); },
    }, h('span.ic', c.icon), c.label)));
    this.left.appendChild(catBar);
    const list = h('div.entry-list');
    let lastGroup = null;
    const entries = C.group ? [...C.list].sort((a, b) => String(C.group(a)).localeCompare(String(C.group(b))) || (a.level || 0) - (b.level || 0)) : C.list;
    if (!this.sel || !C.list.includes(this.sel)) this.sel = C.list[0] || null;
    for (const e of entries) {
      if (C.group) {
        const g = C.group(e);
        if (g !== lastGroup) { list.appendChild(h('div.entry-group', g)); lastGroup = g; }
      }
      list.appendChild(h('button.entry' + (e === this.sel ? '.on' : ''), { onclick: () => { this.sel = e; this.render(); } },
        e.name || e.id, this.cat === 'magic' ? h('span.tag' + (e.enabled ? '.on' : ''), e.enabled ? 'on' : 'off') : null));
    }
    this.left.appendChild(list);
    list.querySelector('.entry.on')?.scrollIntoView?.({ block: 'nearest' }); // (a long list: the chosen one in view)
    this.left.appendChild(h('div.row',
      h('button.small', { onclick: () => this.add(C) }, '+ New'),
      ...(C.blanks || []).map(([label, make]) => h('button.small', { onclick: () => this.add(C, make) }, label)),
      this.sel ? h('button.small', { onclick: () => this.duplicate(C) }, 'Duplicate') : null,
      this.sel ? h('button.small.danger', { onclick: () => this.remove(C) }, 'Delete') : null,
    ));
    // form
    clear(this.main);
    if (this.sel) {
      const e = this.sel;
      this.main.appendChild(h('div.db-head', h('h2', `${C.icon} ${e.name || e.id}`), h('code', e.id)));
      this.main.appendChild(buildForm(e, C.fields, (k) => {
        this.ed.markDirty();
        if (k === 'name') {
          const btn = this.left.querySelector('.entry.on');
          if (btn) btn.firstChild.textContent = e.name;
          const hd = this.main.querySelector('.db-head h2');
          if (hd) hd.textContent = `${C.icon} ${e.name}`;
        }
        if (C.preview) this.ed.showPreview(C.preview(e));
      }));
      if (C.preview) this.ed.showPreview(C.preview(e)); else this.ed.showPreview(null);
    } else {
      this.main.appendChild(h('p.hint', 'Nothing here yet.'));
      this.ed.showPreview(null);
    }
  }

  add(C, make = C.blank) {
    const o = make();
    o.id = uniqueId(o.name, C.list.map((x) => x.id));
    C.list.push(o);
    this.sel = o;
    this.ed.markDirty();
    this.render();
  }

  duplicate(C) {
    const o = deepClone(this.sel);
    o.name = (o.name || 'Copy') + ' II';
    o.id = uniqueId(o.name, C.list.map((x) => x.id));
    C.list.push(o);
    this.sel = o;
    this.ed.markDirty();
    this.render();
  }

  async remove(C) {
    if (C.list.length <= 1 && ['races', 'classes'].includes(this.cat)) { toast('A game needs at least one.', 'warn'); return; }
    if (!(await confirmDialog(`Delete “${this.sel.name}”? Anything that refers to it (shops, chests, maps) will quietly ignore it.`))) return;
    const i = C.list.indexOf(this.sel);
    C.list.splice(i, 1);
    this.sel = C.list[Math.max(0, i - 1)] || null;
    this.ed.markDirty();
    this.render();
  }
}

// (for the tests) the World Data forms, as the editor builds them for a game
if (typeof window !== 'undefined') window.__editorCats = categories;
