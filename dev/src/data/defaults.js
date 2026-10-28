// Default rules content for a new game: magic systems, races, classes,
// items, spells and monsters. Everything here is editable in the
// construction set and saved with the game.

export const STATS = ['str', 'dex', 'int', 'wis'];
export const STAT_NAMES = { str: 'Strength', dex: 'Dexterity', int: 'Intellect', wis: 'Wisdom' };

export const HABITATS = ['grass', 'forest', 'hills', 'swamp', 'desert', 'snow', 'water', 'ash', 'ruins', 'dungeon', 'town'];

export const RACE_TRAITS = {
  versatile: 'Versatile: +10% experience',
  poisonResist: 'Hardy: resists poison',
  darkSight: 'Dark-sight: sees further in darkness',
  keenSight: 'Keen eyes: +1 to hit with bows, sees further outdoors',
  stout: 'Stout-hearted: resists fear and sleep',
  lucky: 'Lucky: monsters miss more often',
};

export const CLASS_ABILITIES = {
  backstab: 'Backstab: critical hits on 18-20',
  lockpick: 'Lock-picking: can open locked doors and chests without keys',
  tracker: 'Woodcraft: fewer ambushes in the wild',
  cleave: 'Cleave: extra damage against weakened foes',
  layHands: 'Steadfast: +2 AC when below half health',
};

// One special move per class, usable once in every battle (key Q)
export const CLASS_SPECIALS = {
  whirlwind: { name: 'Whirlwind', desc: 'Strike every foe standing beside you.' },
  volley: { name: 'Volley', desc: 'Loose arrows at up to three foes in range. Needs a ranged weapon.' },
  blink: { name: 'Blink', desc: 'Step through the air to any open square within 5. Does not use up your turn.' },
  mending: { name: 'Prayer of Mending', desc: 'Heal every companion for a quarter of their health.' },
  shadowstrike: { name: 'Shadow Strike', desc: 'Vanish and reappear beside a foe within 4 squares for a certain critical blow.' },
  rally: { name: 'Rally', desc: 'The whole company gains +2 to hit and +2 armour for 3 rounds.' },
  dazzle: { name: 'Dazzling Air', desc: 'Foes within 3 squares are spellbound and lose their next turn.' },
  earthshaker: { name: 'Earthshaker', desc: 'Slam the ground: every adjacent foe takes 1d8 damage and is stunned.' },
};

export const WEAPON_KINDS = ['blade', 'greatblade', 'axe', 'blunt', 'staff', 'dagger', 'spear', 'bow', 'crossbow', 'sling'];
export const ARMOR_WEIGHTS = ['cloth', 'leather', 'chain', 'plate'];
export const ITEM_TYPES = ['weapon', 'armor', 'shield', 'consumable', 'reagent', 'key', 'quest'];
export const ITEM_EFFECTS = ['heal', 'cure', 'revive', 'mp', 'light', 'food', 'reveal', 'recall'];
export const SPELL_TARGETS = ['enemy', 'area', 'allEnemies', 'ally', 'allAllies', 'self'];
export const SPELL_EFFECTS = ['damage', 'heal', 'cure', 'revive', 'sleep', 'fear', 'shield', 'bless', 'drain', 'light', 'reveal', 'recall'];

export const MAGIC_SYSTEMS = [
  { id: 'arcane', name: 'Sorcery', stat: 'int', resource: 'mp', enabled: true, color: '#7ab0ff',
    desc: 'The high art of wizards: words of power drawn from the Intellect. Mighty in battle, costly in mana.' },
  { id: 'divine', name: 'Prayer', stat: 'wis', resource: 'mp', enabled: true, color: '#ffe27a',
    desc: 'Miracles granted to the faithful through Wisdom: healing, protection, and bane of the undead.' },
  { id: 'runic', name: 'Rune-craft', stat: 'int', resource: 'reagents', enabled: true, color: '#ff9a50',
    desc: 'The old craft of the dwarves. Runes need no mana — but every rune consumes its reagents.' },
  { id: 'song', name: 'Elven Song', stat: 'wis', resource: 'mp', enabled: true, color: '#8affc0',
    desc: 'Songs of power that sway the whole battlefield, heartening friends and dismaying foes.' },
  { id: 'innate', name: 'Innate (monsters only)', stat: 'int', resource: 'mp', enabled: true, color: '#ff6060', monsterOnly: true,
    desc: 'Breath weapons and dark gifts used only by monsters.' },
];

export const RACES = [
  { id: 'human', name: 'Man', desc: 'The race of Men: short-lived, restless and adaptable. Kings and wanderers both.',
    mods: { str: 0, dex: 0, int: 0, wis: 0 }, hp: 0, traits: ['versatile'],
    look: { race: 'human', skin: 0xe8b890 } },
  { id: 'dwarf', name: 'Dwarf', desc: 'Stout folk of the deep halls: tireless, stubborn and hard as the stone they carve.',
    mods: { str: 2, dex: -1, int: 0, wis: 1 }, hp: 2, traits: ['poisonResist', 'darkSight', 'stout'],
    look: { race: 'dwarf', skin: 0xe0a880 } },
  { id: 'elf', name: 'Elf', desc: 'The Fair Folk of the woods: keen-eyed, graceful and wise beyond mortal years.',
    mods: { str: -1, dex: 2, int: 1, wis: 0 }, hp: -1, traits: ['keenSight'],
    look: { race: 'elf', skin: 0xf0d0b0 } },
];

export const CLASSES = [
  { id: 'warrior', name: 'Warrior', desc: 'A master of arms and armour, the shield-wall of any fellowship.',
    hpBase: 16, hpLevel: 8, hitRate: 1.0, magic: [], weapons: ['blade', 'greatblade', 'axe', 'blunt', 'spear', 'dagger', 'crossbow', 'bow', 'sling'], armor: 'plate', shields: true,
    abilities: ['cleave'], special: 'whirlwind', start: ['long_sword', 'leather_armor', 'buckler'], primary: ['str', 'dex'],
    look: { body: 0x8a2a2a, hat: 'helm', weapon: 'sword', shield: 0x8a6a2a } },
  { id: 'ranger', name: 'Ranger', desc: 'A wanderer of the wild places, deadly with the bow and wise in woodcraft. Learns a little Prayer.',
    hpBase: 14, hpLevel: 7, hitRate: 0.85, magic: [{ system: 'divine', rate: 0.5 }], weapons: ['blade', 'dagger', 'spear', 'bow', 'axe', 'sling'], armor: 'chain', shields: false,
    abilities: ['tracker'], special: 'volley', start: ['short_sword', 'short_bow', 'leather_armor'], primary: ['dex', 'wis'],
    look: { body: 0x3a5a2a, hat: 'hood', hatColor: 0x2e4a24, weapon: 'bow', cape: 0x2e4a24 } },
  { id: 'wizard', name: 'Wizard', desc: 'A scholar of Sorcery whose words can call down fire and lightning. Frail in body.',
    requires: 'arcane', hpBase: 8, hpLevel: 4, hitRate: 0.4, magic: [{ system: 'arcane', rate: 1 }], weapons: ['staff', 'dagger'], armor: 'cloth', shields: false,
    abilities: [], special: 'blink', start: ['quarterstaff', 'robe'], primary: ['int', 'dex'],
    look: { body: 0x3a3a8a, robe: true, hat: 'wizard', hatColor: 0x3a3a8a, weapon: 'staff' } },
  { id: 'cleric', name: 'Cleric', desc: 'A servant of the Powers, healer of wounds and scourge of the restless dead.',
    requires: 'divine', hpBase: 12, hpLevel: 6, hitRate: 0.6, magic: [{ system: 'divine', rate: 1 }], weapons: ['blunt', 'staff', 'sling'], armor: 'chain', shields: true,
    abilities: [], special: 'mending', start: ['mace', 'sling', 'leather_armor', 'buckler'], primary: ['wis', 'str'],
    look: { body: 0xe8e0c8, robe: true, trim: 0xd0a040, weapon: 'mace', shield: 0xe8d090 } },
  { id: 'burglar', name: 'Burglar', desc: 'Quick of hand and quiet of foot. Picks locks, finds traps, and strikes from the shadows.',
    hpBase: 10, hpLevel: 5, hitRate: 0.75, magic: [], weapons: ['dagger', 'blade', 'sling', 'bow'], armor: 'leather', shields: false,
    abilities: ['backstab', 'lockpick'], special: 'shadowstrike', start: ['dagger', 'sling', 'leather_armor'], primary: ['dex', 'int'],
    look: { body: 0x4a4a3a, hat: 'hood', hatColor: 0x3a3a30, weapon: 'dagger', cape: 0x2a2a24 } },
  { id: 'paladin', name: 'Paladin', desc: 'A holy knight sworn to a cause, mighty in arms and gifted with a little Prayer.',
    requires: null, hpBase: 15, hpLevel: 7, hitRate: 0.9, magic: [{ system: 'divine', rate: 0.5 }], weapons: ['blade', 'greatblade', 'blunt', 'spear', 'axe'], armor: 'plate', shields: true,
    abilities: ['layHands'], special: 'rally', start: ['long_sword', 'chain_mail', 'buckler'], primary: ['str', 'wis'],
    look: { body: 0xd8d8e0, armor: 'plate', hat: 'helm', plume: 0xc03030, weapon: 'sword', shield: 0xe8e8f0, cape: 0x2a4a9a } },
  { id: 'minstrel', name: 'Minstrel', desc: 'A singer of the old lays whose songs of power hearten friends and dismay foes.',
    requires: 'song', hpBase: 10, hpLevel: 5, hitRate: 0.65, magic: [{ system: 'song', rate: 1 }], weapons: ['blade', 'dagger', 'bow', 'sling'], armor: 'leather', shields: false,
    abilities: [], special: 'dazzle', start: ['short_sword', 'short_bow', 'leather_armor'], primary: ['wis', 'dex'],
    look: { body: 0x8a3a7a, hat: 'cap', hatColor: 0x6a2a5a, weapon: 'sword', cape: 0xd0a040 } },
  { id: 'runesmith', name: 'Runesmith', desc: 'A forge-priest of the dwarves who carves runes of power, fuelled by rare reagents.',
    requires: 'runic', hpBase: 13, hpLevel: 6, hitRate: 0.75, magic: [{ system: 'runic', rate: 1 }], weapons: ['blunt', 'axe', 'dagger', 'crossbow'], armor: 'chain', shields: true,
    abilities: [], special: 'earthshaker', start: ['warhammer', 'crossbow', 'leather_armor', 'buckler'], primary: ['int', 'str'],
    look: { body: 0x7a4a2a, armor: 'chain', hat: 'helm', hatColor: 0xb08a40, weapon: 'hammer', shield: 0x7a5a3a } },
];

export const ITEMS = [
  // weapons
  { id: 'dagger', name: 'Dagger', type: 'weapon', wkind: 'dagger', dmg: '1d4', hit: 1, range: 1, price: 4, model: 'dagger', desc: 'A long knife. Quick and easily hidden.' },
  { id: 'short_sword', name: 'Short Sword', type: 'weapon', wkind: 'blade', dmg: '1d6', hit: 0, range: 1, price: 18, model: 'sword', desc: 'A soldier\'s sidearm.' },
  { id: 'long_sword', name: 'Long Sword', type: 'weapon', wkind: 'blade', dmg: '1d8', hit: 0, range: 1, price: 40, model: 'sword', desc: 'The blade of knights and captains.' },
  { id: 'great_sword', name: 'Great Sword', type: 'weapon', wkind: 'greatblade', dmg: '2d6', hit: 0, range: 1, twoHanded: true, price: 90, model: 'greatsword', desc: 'A two-handed blade as tall as a dwarf.' },
  { id: 'hand_axe', name: 'Hand Axe', type: 'weapon', wkind: 'axe', dmg: '1d6', hit: 0, range: 1, price: 12, model: 'axe', desc: 'A woodsman\'s axe.' },
  { id: 'battle_axe', name: 'Battle Axe', type: 'weapon', wkind: 'axe', dmg: '1d10', hit: 0, range: 1, twoHanded: true, price: 70, model: 'axe', desc: 'Favoured by dwarven warriors.' },
  { id: 'mace', name: 'Mace', type: 'weapon', wkind: 'blunt', dmg: '1d6+1', hit: 0, range: 1, price: 20, model: 'mace', desc: 'A flanged iron club.' },
  { id: 'warhammer', name: 'Warhammer', type: 'weapon', wkind: 'blunt', dmg: '1d8+1', hit: 0, range: 1, price: 45, model: 'hammer', desc: 'Breaks shields and bones alike.' },
  { id: 'quarterstaff', name: 'Quarterstaff', type: 'weapon', wkind: 'staff', dmg: '1d6', hit: 1, range: 1, price: 6, model: 'staff', desc: 'A stout walking staff of ash.' },
  { id: 'spear', name: 'Spear', type: 'weapon', wkind: 'spear', dmg: '1d8', hit: 1, range: 1, price: 15, model: 'spear', desc: 'Long reach and a keen point.' },
  { id: 'sling', name: 'Sling', type: 'weapon', wkind: 'sling', dmg: '1d4', hit: 0, range: 4, price: 5, model: 'sling', desc: 'Stones flung at range.' },
  { id: 'short_bow', name: 'Short Bow', type: 'weapon', wkind: 'bow', dmg: '1d6', hit: 0, range: 5, price: 30, model: 'bow', desc: 'A hunter\'s bow.' },
  { id: 'long_bow', name: 'Long Bow', type: 'weapon', wkind: 'bow', dmg: '1d8', hit: 1, range: 7, price: 75, model: 'bow', desc: 'A tall bow of yew with a long reach.' },
  { id: 'crossbow', name: 'Crossbow', type: 'weapon', wkind: 'crossbow', dmg: '1d10', hit: 1, range: 6, price: 80, model: 'crossbow', desc: 'Slow to wind, deadly to receive.' },
  { id: 'elven_bow', name: 'Elven Bow', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 3, range: 8, price: 300, model: 'bow', desc: 'Strung with elven hair; its arrows sing.' },
  { id: 'ember_bow', name: 'Ember Bow', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 1, range: 7, price: 360, model: 'bow', glow: 0xff8030, desc: 'Red-lacquered horn; its arrows kindle in flight.' },
  { id: 'shadow_fang', name: 'Shadow Fang', type: 'weapon', wkind: 'dagger', dmg: '1d6+2', hit: 3, range: 1, price: 280, model: 'dagger', glow: 0x9a70ff, desc: 'A black blade that drinks the light. Finds the gaps in any armour.' },
  { id: 'runeblade', name: 'Runeblade', type: 'weapon', wkind: 'blade', dmg: '1d10+2', hit: 2, range: 1, price: 450, model: 'sword', glow: 0x60e0ff, desc: 'A dwarf-forged sword etched with glowing runes. Bane of evil things.' },
  { id: 'dwarf_axe', name: 'Dwarven Axe', type: 'weapon', wkind: 'axe', dmg: '1d12+1', hit: 1, range: 1, twoHanded: true, price: 380, model: 'axe', desc: 'Forged deep beneath the mountains.' },
  { id: 'staff_of_power', name: 'Staff of Power', type: 'weapon', wkind: 'staff', dmg: '1d8+2', hit: 2, range: 1, price: 420, model: 'staff', glow: 0xff80ff, desc: 'A wizard\'s staff crowned with a star-stone.' },
  // armour
  { id: 'robe', name: 'Robe', type: 'armor', weight: 'cloth', ac: 1, price: 8, desc: 'Woven wool, warm but thin.' },
  { id: 'leather_armor', name: 'Leather Armour', type: 'armor', weight: 'leather', ac: 2, price: 25, desc: 'Boiled and oiled leather.' },
  { id: 'studded_leather', name: 'Studded Leather', type: 'armor', weight: 'leather', ac: 3, price: 60, desc: 'Leather set with iron rivets.' },
  { id: 'chain_mail', name: 'Chain Mail', type: 'armor', weight: 'chain', ac: 4, price: 120, desc: 'A shirt of interlocking rings.' },
  { id: 'scale_mail', name: 'Scale Mail', type: 'armor', weight: 'chain', ac: 5, price: 200, desc: 'Overlapping steel scales.' },
  { id: 'plate_armor', name: 'Plate Armour', type: 'armor', weight: 'plate', ac: 7, price: 450, desc: 'Full harness of steel.' },
  { id: 'truesilver_mail', name: 'Truesilver Mail', type: 'armor', weight: 'chain', ac: 7, price: 900, desc: 'Light as silk, hard as dragon-scale.' },
  { id: 'elven_cloak', name: 'Elven Cloak', type: 'armor', weight: 'cloth', ac: 3, price: 240, desc: 'Grey-green and shimmering; the eye slides off it.' },
  { id: 'dragonscale', name: 'Dragonscale Mail', type: 'armor', weight: 'chain', ac: 6, price: 520, desc: 'Scales shed by a wyrm: hard as iron, light as leather.' },
  { id: 'buckler', name: 'Buckler', type: 'shield', ac: 1, price: 15, desc: 'A small round shield.' },
  { id: 'kite_shield', name: 'Kite Shield', type: 'shield', ac: 2, price: 55, desc: 'A tall knight\'s shield.' },
  // consumables
  { id: 'healing_draught', name: 'Healing Draught', type: 'consumable', effect: 'heal', power: '2d8+2', price: 25, combat: true, desc: 'A bitter green draught that knits wounds.' },
  { id: 'greater_draught', name: 'Greater Draught', type: 'consumable', effect: 'heal', power: '4d8+6', price: 70, combat: true, desc: 'A potent restorative.' },
  { id: 'antidote', name: 'Antidote', type: 'consumable', effect: 'cure', price: 15, combat: true, desc: 'Draws poison from the blood.' },
  { id: 'mana_tonic', name: 'Mana Tonic', type: 'consumable', effect: 'mp', power: '2d6+2', price: 45, combat: true, desc: 'Restores magical energy.' },
  { id: 'phoenix_feather', name: 'Phoenix Feather', type: 'consumable', effect: 'revive', price: 300, combat: true, desc: 'Brings a fallen companion back from the brink.' },
  { id: 'torch', name: 'Torch', type: 'consumable', effect: 'light', power: '100', price: 3, combat: false, desc: 'Pitch-soaked; lights the dark places for a while.' },
  { id: 'rations', name: 'Rations (x25)', type: 'consumable', effect: 'food', power: '25', price: 20, combat: false, desc: 'Waybread, salt meat and dried apples. Adds 25 food.' },
  { id: 'scroll_seeing', name: 'Scroll of Seeing', type: 'consumable', effect: 'reveal', price: 60, combat: false, desc: 'Reveals the lay of the land around you.' },
  { id: 'iron_key', name: 'Iron Key', type: 'key', price: 30, desc: 'Opens one locked door. Consumed on use.' },
  // reagents
  { id: 'moonpetal', name: 'Moonpetal', type: 'reagent', price: 5, desc: 'A pale flower that blooms only by moonlight. Mending and purity.' },
  { id: 'ember_salt', name: 'Ember Salt', type: 'reagent', price: 6, desc: 'Red crystals warm to the touch. Fire.' },
  { id: 'wyrmroot', name: 'Wyrmroot', type: 'reagent', price: 7, desc: 'A twisted root from old dragon-haunts. Raw power.' },
  { id: 'nightshade', name: 'Nightshade', type: 'reagent', price: 6, desc: 'A deadly berry. Sleep and shadow.' },
  { id: 'silverdust', name: 'Silverdust', type: 'reagent', price: 8, desc: 'Fine dust of truesilver. Warding and sight.' },
  { id: 'spidersilk', name: 'Spidersilk', type: 'reagent', price: 4, desc: 'Sticky thread from great spiders. Binding.' },
];

export const SPELLS = [
  // Sorcery
  { id: 'magic_missile', name: 'Magic Missile', system: 'arcane', level: 1, cost: 2, target: 'enemy', effect: 'damage', power: '1d6+2', range: 7, autoHit: true, combat: true, field: false, fx: 0x8ab8ff, desc: 'A dart of force that never misses.' },
  { id: 'sleep', name: 'Sleep', system: 'arcane', level: 1, cost: 3, target: 'area', radius: 1, effect: 'sleep', power: '3', range: 6, combat: true, field: false, fx: 0xc080ff, desc: 'Foes near the target fall into an enchanted slumber.' },
  { id: 'light', name: 'Light', system: 'arcane', level: 1, cost: 2, target: 'self', effect: 'light', power: '150', combat: false, field: true, fx: 0xfff0a0, desc: 'Conjures a floating light for a long while.' },
  { id: 'frost_lance', name: 'Frost Lance', system: 'arcane', level: 2, cost: 4, target: 'enemy', effect: 'damage', power: '2d6+2', range: 6, combat: true, field: false, fx: 0x80e8ff, desc: 'A spear of ice.' },
  { id: 'mage_shield', name: 'Mage Shield', system: 'arcane', level: 2, cost: 3, target: 'ally', effect: 'shield', power: '3', duration: 6, combat: true, field: false, fx: 0x80a0ff, desc: '+3 armour class for several rounds.' },
  { id: 'fireball', name: 'Fireball', system: 'arcane', level: 3, cost: 7, target: 'area', radius: 1, effect: 'damage', power: '3d6', range: 7, combat: true, field: false, fx: 0xff7020, desc: 'A roaring ball of flame bursts at the target.' },
  { id: 'far_sight', name: 'Far Sight', system: 'arcane', level: 3, cost: 6, target: 'self', effect: 'reveal', combat: false, field: true, fx: 0xc0e0ff, desc: 'See the land from on high.' },
  { id: 'lightning_storm', name: 'Lightning Storm', system: 'arcane', level: 4, cost: 10, target: 'allEnemies', effect: 'damage', power: '2d8', combat: true, field: false, fx: 0xe0e0ff, desc: 'Lightning strikes every foe.' },
  { id: 'recall', name: 'Recall', system: 'arcane', level: 4, cost: 10, target: 'self', effect: 'recall', combat: false, field: true, fx: 0xa0c0ff, desc: 'Returns the party to where the journey began.' },
  { id: 'meteor_swarm', name: 'Meteor Swarm', system: 'arcane', level: 5, cost: 16, target: 'allEnemies', effect: 'damage', power: '4d8', combat: true, field: false, fx: 0xff5010, desc: 'Fire falls from the heavens.' },
  // Prayer
  { id: 'heal', name: 'Heal', system: 'divine', level: 1, cost: 2, target: 'ally', effect: 'heal', power: '1d8+3', combat: true, field: true, fx: 0x80ffa0, desc: 'Mends the wounds of one companion.' },
  { id: 'bless', name: 'Bless', system: 'divine', level: 1, cost: 3, target: 'allAllies', effect: 'bless', power: '2', duration: 6, combat: true, field: false, fx: 0xffe080, desc: '+2 to hit for the whole party.' },
  { id: 'cure', name: 'Cure Poison', system: 'divine', level: 2, cost: 3, target: 'ally', effect: 'cure', combat: true, field: true, fx: 0xa0ffa0, desc: 'Purges poison.' },
  { id: 'turn_undead', name: 'Turn Undead', system: 'divine', level: 2, cost: 4, target: 'allEnemies', effect: 'damage', power: '3d6', undeadOnly: true, combat: true, field: false, fx: 0xfff8d0, desc: 'Holy light sears every undead foe.' },
  { id: 'shield_of_faith', name: 'Shield of Faith', system: 'divine', level: 2, cost: 3, target: 'ally', effect: 'shield', power: '2', duration: 8, combat: true, field: false, fx: 0xffe8a0, desc: '+2 armour class.' },
  { id: 'mass_heal', name: 'Mass Heal', system: 'divine', level: 3, cost: 7, target: 'allAllies', effect: 'heal', power: '1d8+3', combat: true, field: true, fx: 0x80ffa0, desc: 'Heals the whole party.' },
  { id: 'smite', name: 'Holy Smite', system: 'divine', level: 3, cost: 6, target: 'enemy', effect: 'damage', power: '3d8', range: 6, undeadBonus: true, combat: true, field: false, fx: 0xffffa0, desc: 'Divine wrath; double damage to the undead.' },
  { id: 'raise_dead', name: 'Raise Dead', system: 'divine', level: 4, cost: 12, target: 'ally', effect: 'revive', combat: true, field: true, fx: 0xffffff, desc: 'Calls a fallen companion back to life.' },
  { id: 'divine_wrath', name: 'Divine Wrath', system: 'divine', level: 5, cost: 15, target: 'allEnemies', effect: 'damage', power: '3d10', combat: true, field: false, fx: 0xfff0a0, desc: 'Every foe is struck by holy fire.' },
  // Rune-craft
  { id: 'rune_purity', name: 'Rune of Purity', system: 'runic', level: 1, cost: 0, reagents: ['moonpetal'], target: 'ally', effect: 'cure', combat: true, field: true, fx: 0xa0ffd0, desc: 'Moonpetal. Cures poison.' },
  { id: 'rune_mending', name: 'Rune of Mending', system: 'runic', level: 1, cost: 0, reagents: ['moonpetal', 'spidersilk'], target: 'ally', effect: 'heal', power: '2d8+4', combat: true, field: true, fx: 0x80ffa0, desc: 'Moonpetal + Spidersilk. Strong healing.' },
  { id: 'rune_flame', name: 'Rune of Flame', system: 'runic', level: 1, cost: 0, reagents: ['ember_salt', 'wyrmroot'], target: 'area', radius: 1, effect: 'damage', power: '3d6', range: 6, combat: true, field: false, fx: 0xff7020, desc: 'Ember Salt + Wyrmroot. A burst of rune-fire.' },
  { id: 'rune_binding', name: 'Rune of Binding', system: 'runic', level: 2, cost: 0, reagents: ['spidersilk', 'nightshade'], target: 'area', radius: 1, effect: 'sleep', power: '3', range: 6, combat: true, field: false, fx: 0xc0a0ff, desc: 'Spidersilk + Nightshade. Foes are held fast.' },
  { id: 'rune_warding', name: 'Rune of Warding', system: 'runic', level: 2, cost: 0, reagents: ['silverdust', 'moonpetal'], target: 'allAllies', effect: 'shield', power: '2', duration: 8, combat: true, field: false, fx: 0xd0e0ff, desc: 'Silverdust + Moonpetal. +2 armour for the party.' },
  { id: 'rune_seeing', name: 'Rune of Seeing', system: 'runic', level: 2, cost: 0, reagents: ['silverdust', 'nightshade'], target: 'self', effect: 'reveal', combat: false, field: true, fx: 0xd0e0ff, desc: 'Silverdust + Nightshade. Reveals the land.' },
  { id: 'rune_thunder', name: 'Rune of Thunder', system: 'runic', level: 3, cost: 0, reagents: ['ember_salt', 'silverdust', 'wyrmroot'], target: 'allEnemies', effect: 'damage', power: '3d6', combat: true, field: false, fx: 0xe0e0ff, desc: 'Ember Salt + Silverdust + Wyrmroot. Thunder breaks upon every foe.' },
  { id: 'rune_life', name: 'Rune of Life', system: 'runic', level: 4, cost: 0, reagents: ['moonpetal', 'wyrmroot', 'silverdust'], target: 'ally', effect: 'revive', combat: true, field: true, fx: 0xffffff, desc: 'Moonpetal + Wyrmroot + Silverdust. Restores the fallen.' },
  // Elven Song
  { id: 'song_courage', name: 'Song of Courage', system: 'song', level: 1, cost: 3, target: 'allAllies', effect: 'bless', power: '2', duration: 6, combat: true, field: false, fx: 0x8affc0, desc: 'The party fights with fresh heart (+2 to hit).' },
  { id: 'lullaby', name: 'Lullaby', system: 'song', level: 1, cost: 4, target: 'allEnemies', effect: 'sleep', power: '2', chance: 0.55, combat: true, field: false, fx: 0xc0a0ff, desc: 'Each foe may drowse off for a time.' },
  { id: 'song_rest', name: 'Song of Rest', system: 'song', level: 2, cost: 4, target: 'allAllies', effect: 'heal', power: '1d6+1', combat: true, field: true, fx: 0x80ffa0, desc: 'A gentle song that eases wounds.' },
  { id: 'dirge', name: 'Dirge of Dread', system: 'song', level: 3, cost: 6, target: 'allEnemies', effect: 'fear', power: '3', chance: 0.6, combat: true, field: false, fx: 0x9060a0, desc: 'Foes may flee in terror.' },
  { id: 'song_stars', name: 'Song of the Stars', system: 'song', level: 3, cost: 5, target: 'self', effect: 'light', power: '250', combat: false, field: true, fx: 0xe0f0ff, desc: 'Starlight gathers about the party.' },
  { id: 'ballad_heroes', name: 'Ballad of Heroes', system: 'song', level: 4, cost: 9, target: 'allAllies', effect: 'shield', power: '3', duration: 8, combat: true, field: false, fx: 0xffe080, desc: '+3 armour for the whole party.' },
  { id: 'song_doom', name: 'Song of Doom', system: 'song', level: 5, cost: 14, target: 'allEnemies', effect: 'damage', power: '3d8', combat: true, field: false, fx: 0xa0ffe0, desc: 'A terrible chord that shatters foes.' },
  // Innate (monsters)
  { id: 'fire_breath', name: 'Fire Breath', system: 'innate', level: 1, cost: 0, target: 'area', radius: 1, effect: 'damage', power: '3d6', range: 5, combat: true, field: false, fx: 0xff5010, desc: 'A gout of flame.' },
  { id: 'drain_life', name: 'Drain Life', system: 'innate', level: 1, cost: 0, target: 'enemy', effect: 'drain', power: '2d6', range: 4, combat: true, field: false, fx: 0x60ff80, desc: 'Steals the life of the living.' },
  { id: 'web', name: 'Web', system: 'innate', level: 1, cost: 0, target: 'enemy', effect: 'sleep', power: '2', range: 4, combat: true, field: false, fx: 0xf0f0f0, desc: 'Sticky strands hold a foe fast.' },
];

const L = (o) => ({ kind: 'humanoid', ...o });

export const MONSTERS = [
  { id: 'giant_rat', name: 'Giant Rat', plural: 'Giant Rats', level: 1, hp: '1d6+1', ac: 10, hit: 0, dmg: '1d3', xp: 4, gold: '0', habitat: ['grass', 'dungeon', 'swamp', 'ruins'], group: [3, 6], poison: 0.1,
    look: { kind: 'quadruped', color: 0x6a5040, scale: 0.55, tail: 'long', long: 0.45 }, desc: 'A rat the size of a dog.' },
  { id: 'wolf', name: 'Wolf', plural: 'Wolves', level: 1, hp: '2d6', ac: 12, hit: 1, dmg: '1d6', xp: 8, gold: '0', habitat: ['grass', 'forest', 'hills', 'snow'], group: [2, 5], speed: 2,
    look: { kind: 'quadruped', color: 0x7a7470 }, desc: 'Grey wolves hunt in packs.' },
  { id: 'bat_swarm', name: 'Giant Bat', plural: 'Giant Bats', level: 1, hp: '1d6', ac: 13, hit: 1, dmg: '1d3', xp: 5, gold: '0', habitat: ['dungeon', 'swamp'], group: [3, 6], fly: true, speed: 2,
    look: { kind: 'bat', color: 0x3a2a2a, scale: 1.2 }, desc: 'Leathery wings in the dark.' },
  { id: 'goblin', name: 'Goblin', plural: 'Goblins', level: 1, hp: '1d8', ac: 12, hit: 1, dmg: '1d6', xp: 7, gold: '1d6', habitat: ['hills', 'forest', 'dungeon'], group: [3, 6],
    look: L({ race: 'goblin', body: 0x5a4a2a, weapon: 'dagger' }), desc: 'Small, cruel and cowardly — except in numbers.' },
  { id: 'bandit', name: 'Bandit', plural: 'Bandits', level: 2, hp: '2d8', ac: 13, hit: 2, dmg: '1d6+1', xp: 14, gold: '3d6', habitat: ['grass', 'forest'], group: [2, 4], fleeAt: 0.25,
    look: L({ race: 'human', body: 0x3a3028, hat: 'hood', hatColor: 0x2a2420, weapon: 'sword' }), desc: 'Outlaws who prey on travellers.' },
  { id: 'orc', name: 'Orc', plural: 'Orcs', level: 2, hp: '2d8+2', ac: 13, hit: 2, dmg: '1d8', xp: 16, gold: '2d6', habitat: ['hills', 'forest', 'grass', 'ash', 'dungeon'], group: [2, 5], escort: [{ id: 'orc_archer', min: 0, max: 2 }],
    look: L({ race: 'orc', body: 0x3a2a24, armor: 'leather', weapon: 'axe' }), desc: 'Servants of the Shadow, bred for war.' },
  { id: 'orc_archer', name: 'Orc Archer', plural: 'Orc Archers', level: 2, hp: '2d6+1', ac: 12, hit: 3, dmg: '1d6', range: 5, xp: 16, gold: '2d6', habitat: ['hills', 'ash'], group: [2, 3],
    look: L({ race: 'orc', body: 0x4a3a24, weapon: 'bow' }), desc: 'Orcs with black-feathered arrows.' },
  { id: 'giant_spider', name: 'Giant Spider', plural: 'Giant Spiders', level: 3, hp: '3d8', ac: 13, hit: 3, dmg: '1d6', poison: 0.4, xp: 24, gold: '0', habitat: ['forest', 'dungeon'], group: [1, 3], spells: ['web'], castChance: 0.25,
    look: { kind: 'spider', color: 0x2a2424, mark: 0xa02020, scale: 1.2 }, desc: 'Bloated spiders with venomous fangs.' },
  { id: 'skeleton', name: 'Skeleton', plural: 'Skeletons', level: 3, hp: '2d8+4', ac: 13, hit: 3, dmg: '1d8', undead: true, sleepImmune: true, xp: 20, gold: '1d10', habitat: ['dungeon', 'ruins'], group: [2, 5],
    moves: 2, look: L({ race: 'skeleton', weapon: 'sword', shield: 0x5a4a3a, eyes: 0xff5030 }), desc: 'Bones bound by an evil will.' },
  { id: 'warg', name: 'Warg', plural: 'Wargs', level: 3, hp: '3d8+3', ac: 13, hit: 3, dmg: '1d8+1', xp: 28, gold: '0', habitat: ['hills', 'grass', 'snow', 'ash'], group: [2, 4], speed: 2,
    look: { kind: 'quadruped', color: 0x3a3430, spikes: true, scale: 1.35, eyes: 0xffd040 }, desc: 'Great evil wolves, ridden by orcs.' },
  { id: 'bog_lurker', name: 'Bog Lurker', plural: 'Bog Lurkers', level: 3, hp: '4d8', ac: 11, hit: 3, dmg: '1d8', poison: 0.3, xp: 26, gold: '1d8', habitat: ['swamp'], group: [1, 3],
    moves: 2, look: { kind: 'blob', color: 0x4a6a3a }, desc: 'A heap of slime and reeds that lunges from the mire.' },
  { id: 'orc_captain', name: 'Orc Captain', plural: 'Orc Captains', level: 4, hp: '4d8+6', ac: 15, hit: 4, dmg: '1d10+1', xp: 50, gold: '5d10', habitat: ['ash', 'hills', 'dungeon'], group: [1, 1], escort: [{ id: 'orc', min: 2, max: 4 }, { id: 'orc_archer', min: 1, max: 2 }],
    look: L({ race: 'orc', body: 0x4a1a1a, armor: 'chain', hat: 'hornhelm', hatColor: 0x3a3a3a, weapon: 'greatsword', scale: 1.15 }), desc: 'A brutal leader of orcs.' },
  { id: 'troll', name: 'Troll', plural: 'Trolls', level: 5, hp: '6d8+10', ac: 14, hit: 5, dmg: '2d6+2', regen: 3, xp: 90, gold: '4d10', habitat: ['hills', 'forest', 'dungeon'], group: [1, 2],
    moves: 2, look: L({ race: 'troll', body: 0x5a4a3a, weapon: 'club' }), desc: 'Huge, stupid and terribly strong. Its wounds close as you watch.' },
  { id: 'barrow_wight', name: 'Barrow Wight', plural: 'Barrow Wights', level: 5, hp: '5d8', ac: 14, hit: 4, dmg: '1d8', undead: true, sleepImmune: true, xp: 80, gold: '3d10', habitat: ['dungeon', 'ruins', 'swamp'], group: [1, 3], spells: ['drain_life'], castChance: 0.3,
    look: { kind: 'wraith', color: 0x2a2e30, eyes: 0x70ff90 }, desc: 'A cold spirit that haunts the old tombs.' },
  { id: 'sea_serpent', name: 'Sea Serpent', plural: 'Sea Serpents', level: 5, hp: '6d8', ac: 14, hit: 5, dmg: '2d6', swim: true, xp: 85, gold: '0', habitat: ['water'], group: [1, 2],
    look: { kind: 'serpent', color: 0x2a7a6a, scale: 1.3 }, desc: 'Coils rise from the deep.' },
  { id: 'dark_sorcerer', name: 'Dark Sorcerer', plural: 'Dark Sorcerers', level: 6, hp: '4d8+4', ac: 12, hit: 3, dmg: '1d6', xp: 110, gold: '6d10', habitat: ['ash', 'ruins', 'dungeon'], group: [1, 1], spells: ['fireball', 'magic_missile'], castChance: 0.6, escort: [{ id: 'skeleton', min: 1, max: 3 }],
    look: L({ race: 'human', body: 0x1a1a20, robe: true, hat: 'hood', hatColor: 0x1a1a20, weapon: 'staff', weaponGlow: 0xff3020, eyes: 0xff4020 }), desc: 'A man who sold his soul for power.' },
  { id: 'drake', name: 'Fire Drake', plural: 'Fire Drakes', level: 7, hp: '8d8', ac: 16, hit: 6, dmg: '2d8', xp: 200, gold: '10d10', habitat: ['ash', 'hills'], group: [1, 1], spells: ['fire_breath'], castChance: 0.35, fly: true,
    look: { kind: 'dragon', color: 0x6a8a2a, belly: 0xd0c070, scale: 0.85 }, desc: 'A lesser wyrm, still deadly.' },
  { id: 'dragon', name: 'Great Dragon', plural: 'Great Dragons', level: 10, hp: '20d8', ac: 18, hit: 8, dmg: '3d8', xp: 800, gold: '40d10', habitat: [], group: [1, 1], spells: ['fire_breath'], castChance: 0.45, fly: true, boss: true, sleepImmune: true,
    look: { kind: 'dragon', color: 0xa83a2a, scale: 1.5 }, desc: 'Ancient, cunning and greedy beyond measure.' },
  { id: 'shadow_lord', name: 'The Shadow Lord', plural: 'Shadow Lords', level: 10, hp: '24d8', ac: 17, hit: 8, dmg: '2d10', undead: true, sleepImmune: true, xp: 1000, gold: '50d10', habitat: [], group: [1, 1], spells: ['drain_life', 'fireball'], castChance: 0.45, boss: true, escort: [{ id: 'barrow_wight', min: 2, max: 2 }],
    look: { kind: 'wraith', color: 0x1a1820, eyes: 0xff3030, hat: 'crown', weapon: 'sword', weaponGlow: 0xff4040, scale: 1.4 }, desc: 'The Enemy himself, crowned in iron and shadow.' },
];

// XP needed to reach a given level (index = level)
export const XP_TABLE = [0, 0, 50, 130, 250, 420, 650, 950, 1350, 1850, 2500, 3300, 4300, 5500, 7000, 8800, 11000, 13500, 16500, 20000, 24000];
export const MAX_LEVEL = XP_TABLE.length - 1;
