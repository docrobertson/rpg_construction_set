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

// ---------------------------------------------------------------- battle abilities
// Active abilities used in battle by heroes (class skills and once-per-battle
// specials) and by monsters. They are data, editable in the construction set:
//   target   enemy | ally | self | tile | adjacentFoes | nearbyFoes | nearbyAllies | allAllies | allEnemies | multi
//   attack   melee | ranged (rolls to hit with the user's weapon) — or none for sure effects
//   mult/bonus/hit  weapon damage multiplier, extra dice and to-hit bonus
//   damage/heal     dice plus the user's stat modifier (stat); healPct heals a share of max health
//   statuses [{ id, rounds, power, chance, self }] applied to each target (self: to the user instead)
//   move     teleport (to the chosen tile) | beside (appear next to the target) | charge (rush at it)
//   cooldown rounds before it can be used again; perBattle limits uses; free keeps the turn going
//   windup   the blow lands a turn later on whoever still stands in the marked squares
export const ABILITIES = [
  // Warrior
  { id: 'shield_bash', name: 'Shield Bash', icon: 'bash', target: 'enemy', range: 1, attack: 'melee', mult: 1, cooldown: 3, knockback: 1,
    statuses: [{ id: 'stunned', rounds: 1 }], vfx: 'impact', fx: 0xffe0a0, desc: 'Slam a foe beside you: it reels back a square and loses its next turn.' },
  { id: 'taunt', name: 'Taunt', icon: 'shout', target: 'nearbyFoes', radius: 3, cooldown: 4,
    statuses: [{ id: 'taunted', rounds: 2 }, { id: 'shielded', rounds: 2, power: 2, self: true }], vfx: 'shout', fx: 0xff7050,
    desc: 'Foes within 3 must come for you for two turns, and you gain +2 armour. Takes your action, but not your moves.' },
  { id: 'whirlwind', name: 'Whirlwind', icon: 'whirl', special: true, target: 'adjacentFoes', attack: 'melee', mult: 1, perBattle: 1, vfx: 'slash', fx: 0xffffff,
    desc: 'Once per battle. Strike every foe standing beside you.' },
  // Ranger
  { id: 'aimed_shot', name: 'Aimed Shot', icon: 'aim', target: 'enemy', range: 8, attack: 'ranged', hit: 4, bonus: '1d6', ignoreCover: true, needs: 'ranged', cooldown: 2, vfx: 'arrow', fx: 0xfff0b0,
    desc: 'A careful shot: +4 to hit, +1d6 damage, and cover does not help the target.' },
  { id: 'pinning_shot', name: 'Pinning Shot', icon: 'pin', target: 'enemy', range: 8, attack: 'ranged', mult: 1, needs: 'ranged', cooldown: 3,
    statuses: [{ id: 'rooted', rounds: 2 }], vfx: 'arrow', fx: 0xc0a070, desc: 'Nail a foe in place: it cannot move for two turns.' },
  { id: 'volley', name: 'Volley', icon: 'volley', special: true, target: 'multi', count: 3, range: 8, attack: 'ranged', mult: 1, needs: 'ranged', perBattle: 1, vfx: 'arrow', fx: 0xfff0b0,
    desc: 'Once per battle. Loose arrows at up to three foes in range.' },
  // Wizard
  { id: 'firebolt', name: 'Firebolt', icon: 'fire', target: 'enemy', range: 6, damage: '1d8', stat: 'int', cooldown: 1,
    statuses: [{ id: 'burning', rounds: 2, chance: 0.5 }], vfx: 'fire', fx: 0xff7020, desc: 'Hurl a bolt of flame (1d8 + Intellect) that may set the target alight. No mana needed.' },
  { id: 'frost_nova', name: 'Frost Nova', icon: 'frost', target: 'nearbyFoes', radius: 1, damage: '1d6', stat: 'int', cooldown: 4,
    statuses: [{ id: 'slowed', rounds: 2 }], vfx: 'frost', fx: 0x9ae8ff, desc: 'Every foe around you is chilled (1d6 + Intellect) and slowed for two turns.' },
  { id: 'blink', name: 'Blink', icon: 'blink', special: true, target: 'tile', range: 5, move: 'teleport', perBattle: 1, free: true, vfx: 'arcane', fx: 0xc0a0ff,
    desc: 'Once per battle. Step through the air to any open square within 5. Does not use up your turn.' },
  // Cleric
  { id: 'healing_word', name: 'Healing Word', icon: 'heart', target: 'ally', range: 5, heal: '1d6+1', stat: 'wis', cooldown: 3, free: true, vfx: 'heal', fx: 0x80ffa0,
    desc: 'Free action. A word of comfort heals a companion within 5 (1d6+1 + Wisdom).' },
  { id: 'smite', name: 'Smite', icon: 'sun', target: 'enemy', range: 1, attack: 'melee', mult: 1, bonus: '1d6', undeadBonus: 2, cooldown: 2, vfx: 'holy', fx: 0xfff0a0,
    desc: 'A blow wreathed in holy light: +1d6 damage, double against the undead.' },
  { id: 'mending', name: 'Prayer of Mending', icon: 'cross', special: true, target: 'allAllies', healPct: 0.25, perBattle: 1, vfx: 'heal', fx: 0x80ffa0,
    desc: 'Once per battle. Heal every companion for a quarter of their health.' },
  // Burglar
  { id: 'poison_blade', name: 'Poisoned Blade', icon: 'poison', target: 'enemy', range: 1, attack: 'melee', mult: 1, cooldown: 3,
    statuses: [{ id: 'poisoned', rounds: 3, power: 2 }], vfx: 'poison', fx: 0x90e060, desc: 'A strike with a venomed edge: the foe also loses 2 health a turn for three turns.' },
  { id: 'smoke_bomb', name: 'Smoke Bomb', icon: 'smoke', target: 'self', cooldown: 4, free: true, statuses: [{ id: 'hidden', rounds: 2, self: true }], vfx: 'smoke', fx: 0x9a9aaa,
    desc: 'Free action. Vanish in smoke: foes lose sight of you, you slip away without provoking, and your next attack is a backstab.' },
  { id: 'shadowstrike', name: 'Shadow Strike', icon: 'dagger', special: true, target: 'enemy', range: 4, move: 'beside', attack: 'melee', autoCrit: true, perBattle: 1, vfx: 'shadow', fx: 0x9a70ff,
    desc: 'Once per battle. Vanish and reappear beside a foe within 4 squares for a certain critical blow.' },
  // Paladin
  { id: 'holy_strike', name: 'Holy Strike', icon: 'sun', target: 'enemy', range: 1, attack: 'melee', mult: 1, bonus: '1d6', lifesteal: 0.5, cooldown: 2, vfx: 'holy', fx: 0xfff0a0,
    desc: '+1d6 radiant damage, and the paladin is healed for half the damage dealt.' },
  { id: 'lay_on_hands', name: 'Lay on Hands', icon: 'hands', target: 'ally', range: 1, heal: '2d6+2', stat: 'wis', cure: true, cooldown: 4, vfx: 'heal', fx: 0xfff0a0,
    desc: 'Touch yourself or a companion beside you: heal 2d6+2 + Wisdom and draw out poison.' },
  { id: 'rally', name: 'Rally', icon: 'banner', special: true, target: 'allAllies', perBattle: 1, statuses: [{ id: 'blessed', rounds: 4, power: 2 }, { id: 'shielded', rounds: 4, power: 2 }], vfx: 'holy', fx: 0xffe080,
    desc: 'Once per battle. The whole company gains +2 to hit and +2 armour for three rounds.' },
  // Minstrel
  { id: 'cutting_words', name: 'Cutting Words', icon: 'note', target: 'enemy', range: 5, damage: '1d4', stat: 'wis', cooldown: 2,
    statuses: [{ id: 'weakened', rounds: 2 }], vfx: 'song', fx: 0xd080ff, desc: 'A mocking verse (1d4 + Wisdom) that leaves a foe weakened: −2 to hit and damage.' },
  { id: 'inspire', name: 'Inspire', icon: 'star', target: 'ally', range: 5, cooldown: 3, free: true, statuses: [{ id: 'blessed', rounds: 3, power: 3 }], vfx: 'song', fx: 0x8affc0,
    desc: 'Free action. A rousing refrain: you or a companion gain +3 to hit for two rounds.' },
  { id: 'dazzle', name: 'Dazzling Air', icon: 'sparkle', special: true, target: 'nearbyFoes', radius: 3, perBattle: 1, statuses: [{ id: 'stunned', rounds: 1 }], vfx: 'song', fx: 0xff90ff,
    desc: 'Once per battle. Foes within 3 squares are spellbound and lose their next turn.' },
  // Runesmith
  { id: 'thunder_hammer', name: 'Thunder Blow', icon: 'hammer', target: 'enemy', range: 1, attack: 'melee', mult: 1, bonus: '1d4', knockback: 2, cooldown: 2, vfx: 'shock', fx: 0xa0d0ff,
    desc: 'A rune-charged blow: +1d4 damage and the foe is hurled back two squares.' },
  { id: 'ward_rune', name: 'Rune of Warding', icon: 'rune', target: 'ally', range: 3, cooldown: 3, free: true, statuses: [{ id: 'shielded', rounds: 3, power: 3 }], vfx: 'arcane', fx: 0xd0e0ff,
    desc: 'Free action. Carve a ward on yourself or a companion within 3: +3 armour for two rounds.' },
  { id: 'earthshaker', name: 'Earthshaker', icon: 'quake', special: true, target: 'nearbyFoes', radius: 1, damage: '1d8', stat: 'str', perBattle: 1, statuses: [{ id: 'stunned', rounds: 1 }], vfx: 'earth', fx: 0x9a8a70,
    desc: 'Once per battle. Slam the ground: every foe around you takes 1d8 + Strength and is stunned.' },
  // Monsters
  { id: 'pounce', name: 'Pounce', icon: 'claw', monster: true, target: 'enemy', range: 5, move: 'charge', attack: 'melee', mult: 1, cooldown: 3,
    statuses: [{ id: 'stunned', rounds: 1, chance: 0.35 }], vfx: 'impact', fx: 0xd0c0a0, desc: 'Leaps on a foe up to 5 squares away and may knock it down.' },
  { id: 'war_cry', name: 'War Cry', icon: 'shout', monster: true, target: 'nearbyAllies', radius: 5, cooldown: 4, statuses: [{ id: 'blessed', rounds: 3, power: 2 }], vfx: 'shout', fx: 0xff5030,
    desc: 'Bellows to its kin: allies within 5 gain +2 to hit.' },
  { id: 'brutal_smash', name: 'Crushing Blow', icon: 'hammer', monster: true, target: 'tile', range: 1, radius: 0, windup: true, damage: '3d6', cooldown: 3, knockback: 1,
    statuses: [{ id: 'stunned', rounds: 1 }], vfx: 'earth', fx: 0xc08040, desc: 'Raises its weapon high — next turn it crashes down on the marked square. Step aside!' },
  { id: 'mend', name: 'Mend', icon: 'heart', monster: true, target: 'ally', range: 5, heal: '2d4+2', cooldown: 2, vfx: 'heal', fx: 0x80ff60, desc: 'Heals a wounded ally.' },
  { id: 'hex', name: 'Hex', icon: 'eye', monster: true, target: 'enemy', range: 5, damage: '1d4', cooldown: 2, statuses: [{ id: 'weakened', rounds: 2 }], vfx: 'shadow', fx: 0xa060ff,
    desc: 'A spiteful curse: −2 to hit and damage.' },
  { id: 'engulf', name: 'Engulf', icon: 'pin', monster: true, target: 'enemy', range: 1, attack: 'melee', mult: 1, cooldown: 3, statuses: [{ id: 'rooted', rounds: 2 }], vfx: 'poison', fx: 0x6a9a4a,
    desc: 'Smothers a foe in slime; it cannot move.' },
  { id: 'tail_sweep', name: 'Tail Sweep', icon: 'whirl', monster: true, target: 'adjacentFoes', attack: 'melee', mult: 1, knockback: 1, cooldown: 3, vfx: 'slash', fx: 0xffd080,
    desc: 'Sweeps every foe beside it backwards.' },
  { id: 'inferno', name: 'Inferno', icon: 'fire', monster: true, target: 'tile', range: 6, radius: 1, windup: true, damage: '4d6', cooldown: 3, statuses: [{ id: 'burning', rounds: 2 }], vfx: 'fire', fx: 0xff5010,
    desc: 'Draws a deep breath — next turn the marked squares are engulfed in flame.' },
  { id: 'tidal_surge', name: 'Tidal Surge', icon: 'frost', monster: true, target: 'tile', range: 6, radius: 1, windup: true, damage: '3d6', cooldown: 3, knockback: 1, vfx: 'frost', fx: 0x60c0ff,
    desc: 'Rears up out of the sea — next turn a wall of water crashes over the marked squares.' },
  { id: 'dark_wave', name: 'Wave of Night', icon: 'skull', monster: true, target: 'tile', range: 0, radius: 2, windup: true, damage: '3d8', cooldown: 3, statuses: [{ id: 'weakened', rounds: 2 }], vfx: 'shadow', fx: 0x8040ff,
    desc: 'Gathers darkness about itself — next turn it bursts outward over the marked squares.' },
];
export const ABILITY_TARGETS = ['enemy', 'ally', 'self', 'tile', 'adjacentFoes', 'nearbyFoes', 'nearbyAllies', 'allAllies', 'allEnemies', 'multi'];
export const ABILITY_VFX = ['slash', 'impact', 'arrow', 'fire', 'frost', 'holy', 'heal', 'shadow', 'poison', 'smoke', 'arcane', 'song', 'shock', 'earth', 'shout'];

// Older games stored a special key per class; these are the same ids in ABILITIES
export const CLASS_SPECIALS = Object.fromEntries(ABILITIES.filter((a) => a.special).map((a) => [a.id, { name: a.name, desc: a.desc }]));

// Conditions in battle. Their effects are rules of the game; names and icons can be restyled.
export const STATUS_EFFECTS = {
  stunned: { name: 'Stunned', icon: 'stun', color: '#ffd860', bad: true, desc: 'Loses its next turn. Attacks against it always hit.' },
  asleep: { name: 'Asleep', icon: 'sleep', color: '#b0a0ff', bad: true, desc: 'Sleeps until struck. Attacks against it always hit.' },
  afraid: { name: 'Afraid', icon: 'fear', color: '#d0a0ff', bad: true, desc: 'Runs from the fight.' },
  rooted: { name: 'Pinned', icon: 'pin', color: '#d0a070', bad: true, desc: 'Cannot move, but may still fight.' },
  slowed: { name: 'Slowed', icon: 'frost', color: '#80d8ff', bad: true, desc: 'Moves half as far.' },
  poisoned: { name: 'Poisoned', icon: 'poison', color: '#9be070', bad: true, desc: 'Loses health at the start of each turn.' },
  burning: { name: 'Burning', icon: 'fire', color: '#ff9040', bad: true, desc: 'Takes 1d4 fire damage at the start of each turn.' },
  weakened: { name: 'Weakened', icon: 'down', color: '#c090ff', bad: true, desc: '−2 to hit and −2 damage.' },
  taunted: { name: 'Taunted', icon: 'shout', color: '#ff7060', bad: true, desc: 'Must attack whoever taunted it.' },
  blessed: { name: 'Blessed', icon: 'star', color: '#ffe080', desc: 'Bonus to hit.' },
  enraged: { name: 'Enraged', icon: 'fire', color: '#ff6040', desc: 'Fights in a fury: +2 to hit and a quarter more damage.' },
  shielded: { name: 'Shielded', icon: 'shield', color: '#90b8ff', desc: 'Bonus to armour.' },
  hidden: { name: 'Hidden', icon: 'smoke', color: '#b8b8d0', desc: 'Foes cannot see it. Slips away without provoking; its next attack is a backstab.' },
};

// Bosses can have a second phase: below phaseAt of their health they call
// phaseAdds to their side and, with phaseEnrage, fight in a fury.
// How monsters fight (editable per monster)
export const AI_STYLES = {
  brute: 'Brute: charges the nearest foe',
  pack: 'Pack hunter: gangs up and flanks',
  archer: 'Archer: keeps its distance and shoots the weakest',
  caster: 'Caster: hangs back, heals and curses',
  coward: 'Coward: picks on the weak, flees when hurt',
  boss: 'Boss: uses its terrible powers often',
};

// Talent trees: each class draws mostly from its own (set per class)
export const TALENT_TREES = { fighter: 'Fighter', archer: 'Archer', healer: 'Healer', caster: 'Caster', rogue: 'Rogue' };

// Talents: on every level-up a hero chooses one of three, mostly from the
// class's own tree (trees lists the trees a talent belongs to)
export const PERKS = [
  { id: 'tough', name: 'Tough', icon: 'heart', stack: true, trees: ['fighter', 'healer'], desc: '+5 maximum health.' },
  { id: 'precise', name: 'Precise', icon: 'aim', stack: true, trees: ['fighter', 'archer', 'rogue'], desc: '+1 to hit with every weapon.' },
  { id: 'guard', name: 'Guarded', icon: 'shield', stack: true, trees: ['fighter', 'healer'], desc: '+1 armour.' },
  { id: 'brutal', name: 'Brutal', icon: 'hammer', stack: true, trees: ['fighter'], desc: '+2 melee damage.' },
  { id: 'fleet', name: 'Fleet-footed', icon: 'boot', trees: ['archer', 'rogue'], desc: '+1 square of movement in battle.' },
  { id: 'deadly', name: 'Deadly', icon: 'dagger', trees: ['rogue', 'archer'], desc: 'Critical hits on one more number of the die.' },
  { id: 'marksman', name: 'Marksman', icon: 'bow', needs: 'ranged', trees: ['archer'], desc: '+1 range and +1 damage with bows, crossbows and slings.' },
  { id: 'arcane', name: 'Deep Well', icon: 'rune', stack: true, needs: 'mana', trees: ['caster', 'healer'], desc: '+4 maximum mana.' },
  { id: 'quick', name: 'Quick Recovery', icon: 'hourglass', trees: ['caster', 'rogue'], desc: 'Skill cooldowns are one round shorter.' },
  { id: 'iron_will', name: 'Iron Will', icon: 'star', trees: ['fighter', 'healer', 'caster'], desc: 'Cannot be stunned, put to sleep or frightened.' },
  { id: 'alert', name: 'Alert', icon: 'eye', trees: ['archer', 'rogue', 'caster'], desc: '+4 initiative: acts earlier in battle.' },
  { id: 'mender', name: 'Healing Hands', icon: 'heart', stack: true, needs: 'heals', trees: ['healer'], desc: 'Every heal this hero gives mends 3 more health.' },
  { id: 'spellfire', name: 'Spellfire', icon: 'fire', stack: true, trees: ['caster'], desc: '+2 damage with spells, runes and magical skills.' },
];

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
  { id: 'warrior', talents: 'fighter', name: 'Warrior', desc: 'A master of arms and armour, the shield-wall of any fellowship.',
    hpBase: 16, hpLevel: 8, hitRate: 1.0, magic: [], weapons: ['blade', 'greatblade', 'axe', 'blunt', 'spear', 'dagger', 'crossbow', 'bow', 'sling'], armor: 'plate', shields: true,
    abilities: ['cleave'], special: 'whirlwind', skills: ['shield_bash', 'taunt'], start: ['long_sword', 'leather_armor', 'buckler'], primary: ['str', 'dex'],
    look: { body: 0xa8302a, hat: 'helm', hatColor: 0x8c94a0, wings: true, helmTrim: 0xd8a83a, weapon: 'sword', shield: 0x9a6a30, pauldrons: 'plate', cape: 0x6a1c1a, pose: 'raise' } },
  { id: 'ranger', talents: 'archer', name: 'Ranger', desc: 'A wanderer of the wild places, deadly with the bow and wise in woodcraft. Learns a little Prayer.',
    hpBase: 14, hpLevel: 7, hitRate: 0.85, magic: [{ system: 'divine', rate: 0.5 }], weapons: ['blade', 'dagger', 'spear', 'bow', 'axe', 'sling'], armor: 'chain', shields: false,
    abilities: ['tracker'], special: 'volley', skills: ['aimed_shot', 'pinning_shot'], start: ['short_sword', 'short_bow', 'leather_armor'], primary: ['dex', 'wis'],
    look: { body: 0x4a7a32, hat: 'hood', hatColor: 0x3a6a2c, weapon: 'bow', cape: 0x3a6a2c } },
  { id: 'wizard', talents: 'caster', name: 'Wizard', desc: 'A scholar of Sorcery whose words can call down fire and lightning. Frail in body.',
    requires: 'arcane', hpBase: 8, hpLevel: 4, hitRate: 0.4, magic: [{ system: 'arcane', rate: 1 }], weapons: ['staff', 'dagger'], armor: 'cloth', shields: false,
    abilities: [], special: 'blink', skills: ['firebolt', 'frost_nova'], start: ['quarterstaff', 'robe'], primary: ['int', 'dex'],
    look: { body: 0x3446a8, robe: true, hat: 'wizard', hatColor: 0x3446a8, trim: 0xe2b24a, weapon: 'staff', pose: 'cast' } },
  { id: 'cleric', talents: 'healer', name: 'Cleric', desc: 'A servant of the Powers, healer of wounds and scourge of the restless dead.',
    requires: 'divine', hpBase: 12, hpLevel: 6, hitRate: 0.6, magic: [{ system: 'divine', rate: 1 }], weapons: ['blunt', 'staff', 'sling'], armor: 'chain', shields: true,
    abilities: [], special: 'mending', skills: ['healing_word', 'smite'], start: ['mace', 'sling', 'leather_armor', 'buckler'], primary: ['wis', 'str'],
    look: { body: 0xe6dcc4, robe: true, trim: 0xd8a83a, weapon: 'mace', shield: 0x8a5a32, mantle: 0xa87828 } },
  { id: 'burglar', talents: 'rogue', name: 'Burglar', desc: 'Quick of hand and quiet of foot. Picks locks, finds traps, and strikes from the shadows.',
    hpBase: 10, hpLevel: 5, hitRate: 0.75, magic: [], weapons: ['dagger', 'blade', 'sling', 'bow'], armor: 'leather', shields: false,
    abilities: ['backstab', 'lockpick'], special: 'shadowstrike', skills: ['poison_blade', 'smoke_bomb'], start: ['dagger', 'sling', 'leather_armor'], primary: ['dex', 'int'],
    look: { body: 0x5a5448, hat: 'hood', hatColor: 0x3e3a44, weapon: 'dagger', offhand: 'dagger', cape: 0x3e3a44, scarf: 0xb03a2a } },
  { id: 'paladin', talents: 'fighter', name: 'Paladin', desc: 'A holy knight sworn to a cause, mighty in arms and gifted with a little Prayer.',
    requires: null, hpBase: 15, hpLevel: 7, hitRate: 0.9, magic: [{ system: 'divine', rate: 0.5 }], weapons: ['blade', 'greatblade', 'blunt', 'spear', 'axe'], armor: 'plate', shields: true,
    abilities: ['layHands'], special: 'rally', skills: ['holy_strike', 'lay_on_hands'], start: ['long_sword', 'chain_mail', 'buckler'], primary: ['str', 'wis'],
    look: { body: 0xd8d8e0, armor: 'plate', hat: 'helm', plume: 0xc03030, weapon: 'sword', shield: 0xcdd2da, cape: 0x2a4a9a } },
  { id: 'minstrel', talents: 'caster', name: 'Minstrel', desc: 'A singer of the old lays whose songs of power hearten friends and dismay foes.',
    requires: 'song', hpBase: 10, hpLevel: 5, hitRate: 0.65, magic: [{ system: 'song', rate: 1 }], weapons: ['blade', 'dagger', 'bow', 'sling'], armor: 'leather', shields: false,
    abilities: [], special: 'dazzle', skills: ['cutting_words', 'inspire'], start: ['short_sword', 'short_bow', 'leather_armor'], primary: ['wis', 'dex'],
    look: { body: 0x9a3a8a, hat: 'cap', hatColor: 0x7a2a6a, weapon: 'sword', cape: 0xd8a83a, back: 'lute', pose: 'hip' } },
  { id: 'runesmith', talents: 'caster', name: 'Runesmith', desc: 'A forge-priest of the dwarves who carves runes of power, fuelled by rare reagents.',
    requires: 'runic', hpBase: 13, hpLevel: 6, hitRate: 0.75, magic: [{ system: 'runic', rate: 1 }], weapons: ['blunt', 'axe', 'dagger', 'crossbow'], armor: 'chain', shields: true,
    abilities: [], special: 'earthshaker', skills: ['thunder_hammer', 'ward_rune'], start: ['warhammer', 'crossbow', 'leather_armor', 'buckler'], primary: ['int', 'str'],
    // slate and steel with glowing cyan runes: never mistaken for the white-and-gold cleric
    look: { body: 0x3e5a78, armor: 'chain', hat: 'helm', hatColor: 0x8e9cae, weapon: 'hammer', shield: 0x4a5c70, runes: 0x5ee8ff } },
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
  { id: 'elven_bow', unique: true, name: 'Elven Bow', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 3, range: 8, price: 300, model: 'bow', desc: 'Strung with elven hair; its arrows sing.' },
  { id: 'ember_bow', unique: true, name: 'Ember Bow', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 1, range: 7, price: 360, model: 'bow', glow: 0xff8030, desc: 'Red-lacquered horn; its arrows kindle in flight.' },
  { id: 'shadow_fang', name: 'Shadow Fang', type: 'weapon', wkind: 'dagger', dmg: '1d6+2', hit: 3, range: 1, price: 280, model: 'dagger', glow: 0x9a70ff, desc: 'A black blade that drinks the light. Finds the gaps in any armour.' },
  { id: 'runeblade', unique: true, name: 'Runeblade', type: 'weapon', wkind: 'blade', dmg: '1d10+2', hit: 2, range: 1, price: 450, model: 'sword', glow: 0x60e0ff, desc: 'A dwarf-forged sword etched with glowing runes. Bane of evil things.' },
  { id: 'dwarf_axe', name: 'Dwarven Axe', type: 'weapon', wkind: 'axe', dmg: '1d12+1', hit: 1, range: 1, twoHanded: true, price: 380, model: 'axe', desc: 'Forged deep beneath the mountains.' },
  { id: 'staff_of_power', unique: true, name: 'Staff of Power', type: 'weapon', wkind: 'staff', dmg: '1d8+2', hit: 2, range: 1, price: 420, model: 'staff', glow: 0xff80ff, desc: 'A wizard\'s staff crowned with a star-stone.' },
  // armour
  { id: 'robe', name: 'Robe', type: 'armor', weight: 'cloth', ac: 1, price: 8, desc: 'Woven wool, warm but thin.' },
  { id: 'leather_armor', name: 'Leather Armour', type: 'armor', weight: 'leather', ac: 2, price: 25, desc: 'Boiled and oiled leather.' },
  { id: 'studded_leather', name: 'Studded Leather', type: 'armor', weight: 'leather', ac: 3, price: 60, desc: 'Leather set with iron rivets.' },
  { id: 'chain_mail', name: 'Chain Mail', type: 'armor', weight: 'chain', ac: 4, price: 120, desc: 'A shirt of interlocking rings.' },
  { id: 'scale_mail', name: 'Scale Mail', type: 'armor', weight: 'chain', ac: 5, price: 200, desc: 'Overlapping steel scales.' },
  { id: 'plate_armor', name: 'Plate Armour', type: 'armor', weight: 'plate', ac: 7, price: 450, desc: 'Full harness of steel.' },
  { id: 'truesilver_mail', unique: true, name: 'Truesilver Mail', type: 'armor', weight: 'chain', ac: 7, price: 900, desc: 'Light as silk, hard as dragon-scale.' },
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
  { id: 'frost_lance', name: 'Frost Lance', system: 'arcane', level: 2, cost: 4, target: 'enemy', effect: 'damage', power: '2d6+2', range: 6, statuses: [{ id: 'slowed', rounds: 2 }], combat: true, field: false, fx: 0x80e8ff, desc: 'A spear of ice that slows its target.' },
  { id: 'mage_shield', name: 'Mage Shield', system: 'arcane', level: 2, cost: 3, target: 'ally', effect: 'shield', power: '3', duration: 6, combat: true, field: false, fx: 0x80a0ff, desc: '+3 armour class for several rounds.' },
  { id: 'fireball', name: 'Fireball', system: 'arcane', level: 3, cost: 7, target: 'area', radius: 1, effect: 'damage', power: '3d6', range: 7, statuses: [{ id: 'burning', rounds: 2, chance: 0.5 }], combat: true, field: false, fx: 0xff7020, desc: 'A roaring ball of flame bursts at the target, setting foes alight.' },
  { id: 'far_sight', name: 'Far Sight', system: 'arcane', level: 3, cost: 6, target: 'self', effect: 'reveal', combat: false, field: true, fx: 0xc0e0ff, desc: 'See the land from on high.' },
  { id: 'lightning_storm', name: 'Lightning Storm', system: 'arcane', level: 4, cost: 10, target: 'allEnemies', effect: 'damage', power: '2d8', combat: true, field: false, fx: 0xe0e0ff, desc: 'Lightning strikes every foe.' },
  { id: 'recall', name: 'Recall', system: 'arcane', level: 4, cost: 10, target: 'self', effect: 'recall', combat: false, field: true, fx: 0xa0c0ff, desc: 'Returns the party to where the journey began.' },
  { id: 'meteor_swarm', name: 'Meteor Swarm', system: 'arcane', level: 5, cost: 16, target: 'allEnemies', effect: 'damage', power: '4d8', combat: true, field: false, fx: 0xff5010, desc: 'Fire falls from the heavens.' },
  // Prayer
  { id: 'heal', name: 'Heal', system: 'divine', level: 1, cost: 2, target: 'ally', effect: 'heal', power: '1d8+3', combat: true, field: true, fx: 0x80ffa0, desc: 'Mends the wounds of one companion.' },
  { id: 'bless', name: 'Bless', system: 'divine', level: 1, cost: 3, target: 'allAllies', effect: 'bless', power: '2', duration: 6, combat: true, field: false, fx: 0xffe080, desc: '+2 to hit for the whole party.' },
  { id: 'cure', name: 'Cure Poison', system: 'divine', level: 2, cost: 3, target: 'ally', effect: 'cure', combat: true, field: true, fx: 0xa0ffa0, desc: 'Purges poison.' },
  { id: 'turn_undead', name: 'Turn Undead', system: 'divine', level: 2, cost: 6, target: 'allEnemies', effect: 'damage', power: '2d6', undeadOnly: true, combat: true, field: false, fx: 0xfff8d0, desc: 'Holy light sears every undead foe.' },
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
  { id: 'giant_rat', name: 'Giant Rat', plural: 'Giant Rats', level: 1, hp: '2d4+2', ac: 10, hit: 2, dmg: '1d4+1', xp: 4, gold: '0', habitat: ['grass', 'dungeon', 'swamp', 'ruins'], group: [3, 6], poison: 0.1, ai: 'pack', moves: 4,
    look: { kind: 'quadruped', color: 0x4e3a2e, scale: 0.72, tail: 'long', long: 0.45 }, desc: 'A rat the size of a dog.' },
  { id: 'wolf', name: 'Wolf', plural: 'Wolves', level: 1, hp: '3d6+4', ac: 12, hit: 4, dmg: '1d6+2', xp: 8, gold: '0', habitat: ['grass', 'forest', 'hills', 'snow'], group: [2, 5], ai: 'pack', moves: 5,
    look: { kind: 'quadruped', color: 0x7a7470 }, desc: 'Grey wolves hunt in packs.' },
  { id: 'bat_swarm', name: 'Giant Bat', plural: 'Giant Bats', level: 1, hp: '2d4+2', ac: 13, hit: 3, dmg: '1d4+1', xp: 5, gold: '0', habitat: ['dungeon', 'swamp'], group: [3, 6], fly: true, speed: 2, ai: 'pack',
    look: { kind: 'bat', color: 0x3a2a2a, scale: 1.2 }, desc: 'Leathery wings in the dark.' },
  { id: 'goblin', name: 'Goblin', plural: 'Goblins', level: 1, hp: '2d6+4', ac: 12, hit: 4, dmg: '1d6+2', xp: 7, gold: '1d6', habitat: ['hills', 'forest', 'dungeon'], group: [3, 6], ai: 'coward', fleeAt: 0.3, escort: [{ id: 'goblin_shaman', min: 0, max: 1 }],
    look: L({ race: 'goblin', body: 0x5a4a2a, weapon: 'dagger' }), desc: 'Small, cruel and cowardly — except in numbers.' },
  // (combat stream) a support caster so that goblin bands are worth thinking about
  { id: 'goblin_shaman', name: 'Goblin Shaman', plural: 'Goblin Shamans', level: 2, hp: '2d6', ac: 11, hit: 1, dmg: '1d4', xp: 12, gold: '1d8', habitat: [], group: [1, 1], ai: 'caster', abilities: ['mend', 'hex'],
    look: L({ race: 'goblin', body: 0x5a2a4a, robe: true, hat: 'hood', hatColor: 0x6a2a50, weapon: 'staff', weaponGlow: 0x80ff60, pose: 'cast' }), desc: 'A wizened goblin hung with bones, who patches up its kin and curses their foes.' },
  { id: 'bandit', name: 'Bandit', plural: 'Bandits', level: 2, hp: '4d8+6', ac: 13, hit: 5, dmg: '1d8+2', xp: 14, gold: '3d6', habitat: ['grass', 'forest'], group: [2, 4], fleeAt: 0.25, ai: 'coward',
    look: L({ race: 'human', body: 0x3a3028, hat: 'hood', hatColor: 0x2a2420, weapon: 'sword' }), desc: 'Outlaws who prey on travellers.' },
  { id: 'orc', name: 'Orc', plural: 'Orcs', level: 2, hp: '4d8+6', ac: 13, hit: 6, dmg: '1d8+3', xp: 16, gold: '2d6', habitat: ['hills', 'forest', 'grass', 'ash', 'dungeon'], group: [2, 5], ai: 'brute', escort: [{ id: 'orc_archer', min: 0, max: 1 }],
    look: L({ race: 'orc', body: 0x3a2a24, armor: 'leather', weapon: 'axe', pose: 'overhead' }), desc: 'Servants of the Shadow, bred for war.' },
  { id: 'orc_archer', name: 'Orc Archer', plural: 'Orc Archers', level: 2, hp: '3d8+4', ac: 12, hit: 5, dmg: '1d8+2', range: 5, xp: 16, gold: '2d6', habitat: ['hills', 'ash'], group: [2, 3], ai: 'archer',
    look: L({ race: 'orc', body: 0x4a3a24, weapon: 'bow', fletch: 0x1a1a1a }), desc: 'Orcs with black-feathered arrows.' },
  { id: 'giant_spider', name: 'Giant Spider', plural: 'Giant Spiders', level: 3, hp: '8d8+4', ac: 13, hit: 7, dmg: '1d10+3', poison: 0.4, xp: 24, gold: '0', habitat: ['forest', 'dungeon'], group: [1, 3], spells: ['web'], castChance: 0.25,
    look: { kind: 'spider', color: 0x2a2424, mark: 0xa02020, scale: 1.2 }, desc: 'Bloated spiders with venomous fangs.' },
  { id: 'skeleton', name: 'Skeleton', plural: 'Skeletons', level: 3, hp: '7d8+8', ac: 13, hit: 7, dmg: '1d10+3', undead: true, sleepImmune: true, xp: 20, gold: '1d10', habitat: ['dungeon', 'ruins'], group: [2, 5],
    moves: 3, look: L({ race: 'skeleton', weapon: 'sword', shield: 0x5a4a3a, eyes: 0xff5030 }), desc: 'Bones bound by an evil will.' },
  { id: 'warg', name: 'Warg', plural: 'Wargs', level: 3, hp: '7d8+10', ac: 13, hit: 7, dmg: '1d10+4', xp: 28, gold: '0', habitat: ['hills', 'grass', 'snow', 'ash'], group: [2, 4], ai: 'pack', moves: 5, abilities: ['pounce'],
    look: { kind: 'quadruped', color: 0x3a3430, spikes: true, scale: 1.35, eyes: 0xffd040 }, desc: 'Great evil wolves, ridden by orcs.' },
  { id: 'bog_lurker', name: 'Bog Lurker', plural: 'Bog Lurkers', level: 3, hp: '9d8', ac: 11, hit: 7, dmg: '1d10+3', poison: 0.3, xp: 26, gold: '1d8', habitat: ['swamp'], group: [1, 3], abilities: ['engulf'],
    moves: 2, look: { kind: 'blob', color: 0x4a6a3a }, desc: 'A heap of slime and reeds that lunges from the mire.' },
  { id: 'orc_captain', name: 'Orc Captain', plural: 'Orc Captains', level: 4, hp: '9d8+15', ac: 15, hit: 8, dmg: '1d10+5', xp: 50, gold: '5d10', habitat: ['ash', 'hills', 'dungeon'], group: [1, 1], abilities: ['war_cry', 'brutal_smash'], escort: [{ id: 'orc', min: 2, max: 4 }, { id: 'orc_archer', min: 1, max: 2 }],
    look: L({ race: 'orc', body: 0x4a1a1a, armor: 'chain', hat: 'hornhelm', hatColor: 0x3a3a3a, weapon: 'greatsword', cape: 0x8a1a16, tabard: 0x8a1a16, pose: 'raise', scale: 1.15 }), desc: 'A brutal leader of orcs.' },
  { id: 'troll', name: 'Troll', plural: 'Trolls', level: 5, hp: '15d8+30', ac: 14, hit: 9, dmg: '2d6+6', regen: 4, xp: 90, gold: '4d10', habitat: ['hills', 'forest', 'dungeon'], group: [1, 3], abilities: ['brutal_smash'], init: -4,
    moves: 3, look: L({ race: 'troll', body: 0x5a4a3a, weapon: 'club' }), desc: 'Huge, stupid and terribly strong. Its wounds close as you watch.' },
  { id: 'barrow_wight', name: 'Barrow Wight', plural: 'Barrow Wights', level: 5, hp: '12d8+12', ac: 14, hit: 8, dmg: '1d8+5', undead: true, sleepImmune: true, xp: 80, gold: '3d10', habitat: ['dungeon', 'ruins', 'swamp'], group: [1, 3], spells: ['drain_life'], castChance: 0.3, ai: 'caster',
    look: { kind: 'wraith', color: 0x2a2e30, eyes: 0x70ff90 }, desc: 'A cold spirit that haunts the old tombs.' },
  { id: 'sea_serpent', name: 'Sea Serpent', plural: 'Sea Serpents', level: 5, hp: '15d8+15', ac: 14, hit: 8, dmg: '2d6+5', range: 4, ai: 'brute', swim: true, xp: 85, gold: '0', habitat: ['water'], group: [1, 2],
    look: { kind: 'serpent', color: 0x2a7a6a, scale: 1.3 }, desc: 'Coils rise from the deep.' },
  { id: 'dark_sorcerer', name: 'Dark Sorcerer', plural: 'Dark Sorcerers', level: 6, hp: '10d8+12', ac: 12, hit: 6, dmg: '1d6+2', xp: 110, gold: '6d10', habitat: ['ash', 'ruins', 'dungeon'], group: [1, 1], spells: ['fireball', 'magic_missile'], castChance: 0.6, ai: 'caster', abilities: ['hex'], escort: [{ id: 'skeleton', min: 2, max: 3 }],
    look: L({ race: 'human', body: 0x1a1a20, robe: true, hat: 'hood', hatColor: 0x1a1a20, weapon: 'staff', weaponGlow: 0xff3020, eyes: 0xff4020 }), desc: 'A man who sold his soul for power.' },
  { id: 'drake', name: 'Fire Drake', plural: 'Fire Drakes', level: 7, hp: '18d8+15', ac: 16, hit: 10, dmg: '2d8+6', xp: 200, gold: '10d10', habitat: ['ash', 'hills'], group: [1, 1], spells: ['fire_breath'], castChance: 0.25, fly: true, abilities: ['inferno', 'tail_sweep'],
    look: { kind: 'dragon', color: 0xc04a1e, belly: 0xf0b040, scale: 0.85 }, desc: 'A lesser wyrm, still deadly.' },
  { id: 'dragon', name: 'Great Dragon', plural: 'Great Dragons', level: 10, hp: '40d8+40', ac: 18, hit: 13, dmg: '3d8+8', xp: 800, gold: '40d10', habitat: [], group: [1, 1], spells: ['fire_breath'], castChance: 0.3, fly: true, boss: true, sleepImmune: true, ai: 'boss', abilities: ['inferno', 'tail_sweep'],
    speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseText: 'The dragon roars in fury, and the air shimmers with heat!',
    look: { kind: 'dragon', color: 0xa83a2a, scale: 1.5 }, desc: 'Ancient, cunning and greedy beyond measure.' },
  { id: 'shadow_lord', name: 'The Shadow Lord', plural: 'Shadow Lords', level: 10, hp: '36d8+50', ac: 17, hit: 12, dmg: '2d10+8', undead: true, sleepImmune: true, xp: 1000, gold: '50d10', habitat: [], group: [1, 1], spells: ['drain_life', 'fireball'], castChance: 0.35, boss: true, ai: 'boss', abilities: ['dark_wave'], escort: [{ id: 'barrow_wight', min: 2, max: 2 }],
    speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: 'barrow_wight', min: 2, max: 2 }], phaseText: 'The Shadow Lord cries out in a dead tongue, and the dead rise to his call!',
    look: { kind: 'wraith', color: 0x1a1820, eyes: 0xff3030, hat: 'crown', weapon: 'sword', weaponGlow: 0xff4040, scale: 1.4 }, desc: 'The Enemy himself, crowned in iron and shadow.' },
];

// XP needed to reach a given level (index = level)
export const XP_TABLE = [0, 0, 60, 170, 340, 580, 900, 1320, 1850, 2500, 3300, 4300, 5500, 7000, 8800, 11000, 13500, 16500, 20000, 24000, 28500];
export const MAX_LEVEL = XP_TABLE.length - 1;
