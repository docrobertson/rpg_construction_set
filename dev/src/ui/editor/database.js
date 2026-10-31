// "World Data" editors: races, classes, items, spells, monsters, magic systems.
import { h, clear, confirmDialog, toast } from '../dom.js';
import { buildForm } from './forms.js';
import { LOOK_FIELDS } from './inspector.js';
import {
  STATS, STAT_NAMES, RACE_TRAITS, CLASS_ABILITIES, WEAPON_KINDS, ARMOR_WEIGHTS, ITEM_TYPES, ITEM_EFFECTS, SPELL_TARGETS, SPELL_EFFECTS, HABITATS,
  ABILITY_TARGETS, ABILITY_VFX, STATUS_EFFECTS, AI_STYLES, TALENT_TREES,
} from '../../data/defaults.js';
import { uniqueId, deepClone } from '../../core/util.js';
import { MODEL_KINDS } from '../../render/models.js';
import { ensureCombatData } from '../../game/rules.js';
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

const WEAPON_MODELS = ['sword', 'greatsword', 'axe', 'hammer', 'mace', 'club', 'staff', 'spear', 'dagger', 'bow', 'crossbow', 'sling'];

export function categories(game) {
  ensureCombatData(game);
  const abilities = () => game.abilities.map((a) => [a.id, `${a.name}${a.special ? ' ★' : ''}${a.monster ? ' (monster)' : ''}`]);
  const items = () => game.items.map((i) => [i.id, i.name]);
  const systems = () => game.magic.map((m) => [m.id, m.name]);
  const sysOf = (sp) => game.magic.find((m) => m.id === sp.system);
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
        { key: 'weapons', label: 'Weapons allowed', type: 'multicheck', options: WEAPON_KINDS },
        { key: 'armor', label: 'Heaviest armour', type: 'select', options: ARMOR_WEIGHTS },
        { key: 'shields', label: 'Can use shields', type: 'check' },
        { key: 'abilities', label: 'Special abilities', type: 'multicheck', options: Object.entries(CLASS_ABILITIES) },
        { key: 'skills', label: 'Battle skills (keys 1, 2…)', type: 'ids', options: abilities, hint: 'Defined under Abilities. Most have a cooldown; free actions do not end the turn.' },
        { key: 'special', label: 'Battle special (key Q)', type: 'select', empty: '— none —', nullable: true, options: abilities, hint: 'Usually a once-per-battle ability (★).' },
        { key: 'talents', label: 'Talent tree', type: 'select', empty: '— guess from the skills —', nullable: true, options: Object.entries(TALENT_TREES), hint: 'On each level-up a hero picks one of three talents, mostly from this tree.' },
        { key: 'primary', label: 'Favoured attributes', type: 'multicheck', options: STATS.map((s) => [s, STAT_NAMES[s]]), hint: 'Suggested when creating a hero. Players spend a point per level themselves.' },
        { key: 'start', label: 'Starting equipment', type: 'ids', options: items },
        { type: 'section', label: 'Appearance' },
        ...LOOK_FIELDS.filter((f) => !['look.race', 'look.skin', 'look.hair', 'look.beard'].includes(f.key)),
      ],
    },
    items: {
      label: 'Items', icon: '🗡', list: game.items,
      blank: () => ({ name: 'New Item', type: 'weapon', wkind: 'blade', dmg: '1d6', hit: 0, range: 1, price: 20, model: 'sword', desc: '' }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'type', label: 'Kind', type: 'select', options: ITEM_TYPES, rerender: true },
        { key: 'desc', label: 'Description', type: 'textarea', rows: 2 },
        { key: 'price', label: 'Price (gold)', type: 'number', min: 0 },
        { key: 'unique', label: 'Unique — never sold in shops', type: 'check' },
        { key: 'noLoot', label: 'Never dropped by defeated monsters', type: 'check', show: (o) => ['weapon', 'armor', 'shield'].includes(o.type) },
        { key: 'wkind', label: 'Weapon type', type: 'select', options: WEAPON_KINDS, show: (o) => o.type === 'weapon' },
        { key: 'dmg', label: 'Damage', type: 'dice', placeholder: '1d8', show: (o) => o.type === 'weapon' },
        { key: 'hit', label: 'To-hit bonus', type: 'number', show: (o) => o.type === 'weapon' },
        { key: 'range', label: 'Range', type: 'number', min: 1, max: 12, show: (o) => o.type === 'weapon', hint: '1 = melee (hand weapon); 2 or more = ranged, carried in its own slot beside a hand weapon' },
        { key: 'twoHanded', label: 'Two-handed', type: 'check', show: (o) => o.type === 'weapon' },
        { key: 'model', label: 'Looks like', type: 'select', options: WEAPON_MODELS, show: (o) => o.type === 'weapon' },
        { key: 'glow', label: 'Magical glow', type: 'color', nullable: true, show: (o) => o.type === 'weapon' },
        { key: 'weight', label: 'Weight', type: 'select', options: ARMOR_WEIGHTS, show: (o) => o.type === 'armor' },
        { key: 'ac', label: 'Armour bonus', type: 'number', min: 0, show: (o) => o.type === 'armor' || o.type === 'shield' },
        { key: 'effect', label: 'Effect', type: 'select', options: ITEM_EFFECTS, show: (o) => o.type === 'consumable' },
        { key: 'power', label: 'Power', type: 'text', placeholder: '2d8+2', show: (o) => o.type === 'consumable', hint: 'Healing dice, light duration, food amount…' },
        { key: 'combat', label: 'Usable in battle', type: 'check', show: (o) => o.type === 'consumable' },
        { type: 'info', label: 'Reagents fuel Rune-craft spells. Keys open locked doors and chests (one key per lock). Quest items can be required by portals and checked in conversations.', show: (o) => ['reagent', 'key', 'quest'].includes(o.type) },
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
        { key: 'poison', label: 'Chance to poison', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'regen', label: 'Regenerates per round', type: 'number', min: 0 },
        { key: 'fleeAt', label: 'Flees below (fraction of health)', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'undead', label: 'Undead', type: 'check' },
        { key: 'sleepImmune', label: 'Immune to sleep', type: 'check' },
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
        ...LOOK_FIELDS.map((f) => ({ ...f, show: (o) => o.look?.kind === 'humanoid' && (!f.show || f.show(o)) })),
      ],
    },
    abilities: {
      label: 'Abilities', icon: '💥', list: game.abilities,
      group: (a) => (a.monster ? 'Monster abilities' : a.special ? 'Class specials ★' : 'Class skills'),
      blank: () => ({ name: 'New Ability', icon: 'star', target: 'enemy', range: 1, attack: 'melee', mult: 1, cooldown: 2, statuses: [], vfx: 'slash', fx: 0xffe080, desc: '' }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea', rows: 2, hint: 'Shown on the battle button and the hero sheet' },
        { key: 'icon', label: 'Icon', type: 'select', options: ICON_NAMES },
        { key: 'special', label: 'A class special (★, key Q)', type: 'check' },
        { key: 'monster', label: 'Monster ability (hidden from class lists)', type: 'check' },
        { type: 'section', label: 'Targeting' },
        { key: 'target', label: 'Affects', type: 'select', options: ABILITY_TARGETS.map((t) => [t, `${t} — ${TARGET_HELP[t]}`]), rerender: true },
        { key: 'range', label: 'Range (squares)', type: 'number', min: 0, max: 12, show: (o) => ['enemy', 'ally', 'tile', 'multi'].includes(o.target), hint: '1 = beside; 0 = centred on the user' },
        { key: 'radius', label: 'Radius', type: 'number', min: 0, max: 4, show: (o) => ['nearbyFoes', 'nearbyAllies', 'tile'].includes(o.target) },
        { key: 'count', label: 'Number of foes', type: 'number', min: 1, max: 6, show: (o) => o.target === 'multi' },
        { key: 'move', label: 'Movement', type: 'select', empty: '— none —', nullable: true, options: [['teleport', 'Teleport to the chosen square'], ['beside', 'Appear beside the target'], ['charge', 'Charge at the target']] },
        { type: 'section', label: 'Effect' },
        { key: 'attack', label: 'Weapon attack', type: 'select', empty: '— no attack roll —', nullable: true, options: [['melee', 'Melee weapon'], ['ranged', 'Ranged weapon']], rerender: true },
        { key: 'hit', label: 'To-hit bonus', type: 'number', show: (o) => !!o.attack },
        { key: 'mult', label: 'Damage multiplier', type: 'number', step: 0.25, min: 0, show: (o) => !!o.attack },
        { key: 'bonus', label: 'Extra damage dice', type: 'dice', placeholder: '1d6', show: (o) => !!o.attack },
        { key: 'autoCrit', label: 'Always a critical hit', type: 'check', show: (o) => !!o.attack },
        { key: 'ignoreCover', label: 'Ignores cover', type: 'check', show: (o) => o.attack === 'ranged' },
        { key: 'needs', label: 'Needs a ranged weapon', type: 'select', empty: '— nothing —', nullable: true, options: [['ranged', 'A bow, crossbow or sling']] },
        { key: 'damage', label: 'Sure damage (no roll to hit)', type: 'dice', placeholder: '1d8', show: (o) => !o.attack },
        { key: 'heal', label: 'Healing', type: 'dice', placeholder: '1d6+1' },
        { key: 'healPct', label: 'Heal a share of health', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'stat', label: 'Adds the modifier of', type: 'select', empty: '— none —', nullable: true, options: STATS.map((s) => [s, STAT_NAMES[s]]), hint: 'For damage and healing; monsters add half their level' },
        { key: 'undeadBonus', label: 'Multiplier against the undead', type: 'number', step: 0.5, min: 0 },
        { key: 'lifesteal', label: 'Heals the user for this share of damage', type: 'number', step: 0.05, min: 0, max: 1 },
        { key: 'cure', label: 'Cures poison', type: 'check' },
        { key: 'knockback', label: 'Knock back (squares)', type: 'number', min: 0, max: 4 },
        statusList(),
        { type: 'section', label: 'Use' },
        { key: 'cooldown', label: 'Cooldown (turns)', type: 'number', min: 0, max: 10 },
        { key: 'perBattle', label: 'Uses per battle', type: 'number', min: 0, max: 5, hint: '0 or empty = unlimited' },
        { key: 'free', label: 'Free action (does not end the turn)', type: 'check' },
        { key: 'windup', label: 'Telegraphed: lands next turn on the marked squares', type: 'check' },
        { type: 'section', label: 'Look' },
        { key: 'vfx', label: 'Effect', type: 'select', options: ABILITY_VFX },
        { key: 'fx', label: 'Colour', type: 'color' },
      ],
    },
    magic: {
      label: 'Magic Systems', icon: '🔮', list: game.magic,
      blank: () => ({ name: 'New Art', stat: 'int', resource: 'mp', enabled: true, color: '#c0a0ff', desc: '' }),
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'enabled', label: 'Enabled in this game', type: 'check', hint: 'Disabled systems vanish from play: their spells cannot be cast and classes that require them are hidden.' },
        { key: 'stat', label: 'Powered by', type: 'select', options: STATS.map((s) => [s, STAT_NAMES[s]]) },
        { key: 'resource', label: 'Spells cost', type: 'select', options: [['mp', 'Mana'], ['reagents', 'Reagents']] },
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
    this.left.appendChild(h('div.row',
      h('button.small', { onclick: () => this.add(C) }, '+ New'),
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

  add(C) {
    const o = C.blank();
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
