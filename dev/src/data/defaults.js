// Default rules content for a new game: magic systems, races, classes,
// items, spells and monsters. Everything here is editable in the
// construction set and saved with the game.

export const STATS = ['str', 'dex', 'int', 'wis'];
export const STAT_NAMES = { str: 'Strength', dex: 'Dexterity', int: 'Intellect', wis: 'Wisdom' };

export const HABITATS = ['grass', 'forest', 'hills', 'swamp', 'desert', 'snow', 'water', 'ash', 'ruins', 'dungeon', 'town', 'jungle', 'beach', 'temple', 'reef'];

export const RACE_TRAITS = {
  versatile: 'Versatile: +10% experience',
  poisonResist: 'Hardy: resists poison',
  darkSight: 'Dark-sight: sees further in darkness',
  keenSight: 'Keen eyes: +1 to hit with bows, sees further outdoors',
  stout: 'Stout-hearted: resists fear and sleep',
  lucky: 'Lucky: monsters miss more often',
  homely: 'Home cooking: a camp mends the company a quarter more',
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
// and, for the skills heroes learn as they rise (game/combat.js has the rules):
//   others   an ally ability that cannot be aimed at the user; revive raises a companion fallen this battle
//   thrown   dice of a thrown missile (rolls to hit with Dexterity, no bow needed)
//   pull     squares the target is dragged towards the user; chain/chainRange: leaps to more foes
//   execute  below this share of health the target is struck surely, for double damage
//   steal    lifts the foe's purse (once each); addMoves: more squares this turn; extraTurn: an ally acts next
//   summon   a monster id called to the chosen square for `lasts` turns (summonName, summonTint)
//   place    trap (the first foe to step on the square suffers the ability) | zone (the squares
//            harm foes and mend friends who start a turn there or walk in) for `lasts` rounds
//   general  a battle art any hero may learn, offered among the talents from `level` on
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
  // ---- skills learned later (levels 5, 7 and 9 of each calling)
  // Warrior
  { id: 'shield_wall', name: 'Shield Wall', icon: 'shield', target: 'ally', range: 1, others: true, cooldown: 4, vfx: 'impact', fx: 0xa8c8ff,
    statuses: [{ id: 'guarded', rounds: 2 }, { id: 'shielded', rounds: 2, power: 2, self: true }],
    desc: 'Plant your shield beside a companion: for two rounds the blows aimed at them strike you instead, and you gain +2 armour.' },
  { id: 'riposte', name: 'Riposte', icon: 'sword', target: 'self', cooldown: 4, vfx: 'slash', fx: 0xffd0a0,
    statuses: [{ id: 'riposte', rounds: 2, self: true }, { id: 'shielded', rounds: 2, power: 1, self: true }],
    desc: 'Take a fencer\'s stance for two rounds (+1 armour): every foe that swings at you in melee, hit or miss, is struck back at once.' },
  { id: 'finishing_blow', name: 'Finishing Blow', icon: 'axe', target: 'enemy', range: 1, attack: 'melee', mult: 1, execute: 0.34, cooldown: 3, vfx: 'impact', fx: 0xff7050,
    desc: 'A brutal blow. Against a foe at a third of its health or less it cannot miss and deals double damage.' },
  // Ranger
  { id: 'hunters_mark', name: 'Hunter\'s Mark', icon: 'aim', target: 'enemy', range: 8, free: true, cooldown: 4, vfx: 'arrow', fx: 0xff9a7a,
    statuses: [{ id: 'marked', rounds: 3, power: 2 }], desc: 'Free action. Mark a foe in sight: for three rounds every attack on it, by anyone, is +2 to hit and +2 damage.' },
  { id: 'spirit_wolf', name: 'Spirit Wolf', icon: 'paw', target: 'tile', range: 2, summon: 'wolf', summonName: 'Spirit Wolf', summonTint: 0xa8d4f0, lasts: 4, perBattle: 1, vfx: 'arcane', fx: 0x9fd8ff,
    desc: 'Once per battle. Call a spirit wolf of the old woods to an open square within 2: it fights beside the company for four turns, then fades.' },
  { id: 'arrowstorm', name: 'Arrowstorm', icon: 'volley', target: 'tile', range: 8, radius: 1, attack: 'ranged', mult: 1, needs: 'ranged', cooldown: 4, vfx: 'arrow', fx: 0xfff0b0,
    desc: 'Loose a storm of arrows over a 3×3 patch within range: one shot at every foe standing there.' },
  // Wizard
  { id: 'arc_lightning', name: 'Arc Lightning', icon: 'sparkle', target: 'enemy', range: 6, damage: '1d8', stat: 'int', chain: 2, chainRange: 2, cooldown: 3, vfx: 'shock', fx: 0xa8d4ff,
    statuses: [{ id: 'stunned', rounds: 1, chance: 0.15 }], desc: 'Lightning strikes a foe and leaps on to two more, each within 2 squares of the last (1d8 + Intellect each; it may stun).' },
  { id: 'arcane_grasp', name: 'Arcane Grasp', icon: 'hands', target: 'enemy', range: 6, pull: 3, damage: '1d4', stat: 'int', cooldown: 3, vfx: 'arcane', fx: 0xc0a0ff,
    statuses: [{ id: 'rooted', rounds: 1 }], desc: 'An unseen hand drags a foe up to three squares towards you (1d4 + Intellect) and holds it there for a turn.' },
  { id: 'meteor', name: 'Falling Star', icon: 'fire', target: 'tile', range: 7, radius: 1, windup: true, damage: '4d6', stat: 'int', perBattle: 1, vfx: 'fire', fx: 0xff8030,
    statuses: [{ id: 'burning', rounds: 2 }], desc: 'Once per battle. Call down a star on a 3×3 patch within 7: it lands at the start of your next turn (4d6 + Intellect, and fire). Foes may flee the mark!' },
  // Cleric
  { id: 'hallowed_ground', name: 'Hallowed Ground', icon: 'cross', target: 'self', radius: 1, place: 'zone', lasts: 3, heal: '1d4', damage: '1d6', stat: 'wis', undeadOnly: true, cooldown: 5, vfx: 'holy', fx: 0xfff0a0,
    desc: 'Bless the ground around you for three rounds: companions who start a turn there or step in heal 1d4 + Wisdom; the undead burn for 1d6 + Wisdom.' },
  { id: 'sanctuary', name: 'Sanctuary', icon: 'sun', target: 'ally', range: 4, cooldown: 5, vfx: 'holy', fx: 0xfff4c0,
    statuses: [{ id: 'sanctuary', rounds: 2 }], desc: 'Wrap yourself or a companion within 4 in holy light: for two rounds no foe can strike or aim at them — unless they strike first.' },
  { id: 'breath_of_life', name: 'Breath of Life', icon: 'heart', target: 'ally', range: 3, revive: true, healPct: 0.34, perBattle: 1, vfx: 'heal', fx: 0xfff0c0,
    desc: 'Once per battle. Call back a companion who has fallen in this battle, within 3 squares: they rise with a third of their health.' },
  // Burglar
  { id: 'filch', name: 'Filch', icon: 'pouch', target: 'enemy', range: 1, steal: true, free: true, cooldown: 2, vfx: 'smoke', fx: 0xffd060,
    desc: 'Free action. Lift the purse of a foe beside you: its gold is yours, there and then (each foe has but the one purse).' },
  { id: 'caltrops', name: 'Caltrops', icon: 'claw', target: 'tile', range: 4, radius: 1, place: 'zone', lasts: 3, damage: '1d4', cooldown: 4, vfx: 'smoke', fx: 0xc8c0a8,
    statuses: [{ id: 'slowed', rounds: 1 }], desc: 'Scatter iron caltrops over a 3×3 patch within 4 for three rounds: foes who start a turn there or walk in take 1d4 and are slowed.' },
  { id: 'fan_of_knives', name: 'Fan of Knives', icon: 'dagger', target: 'nearbyFoes', radius: 2, thrown: '1d6', cooldown: 4, vfx: 'slash', fx: 0xd8e0ec,
    desc: 'Spin and loose a fan of knives: a throw at every foe within 2 squares (1d6 + half Dexterity each, rolled to hit).' },
  // Paladin
  { id: 'holy_charge', name: 'Holy Charge', icon: 'paladin', target: 'enemy', range: 5, move: 'charge', attack: 'melee', mult: 1, bonus: '1d6', knockback: 1, cooldown: 4, vfx: 'holy', fx: 0xffe080,
    desc: 'Charge up to 5 squares at a foe and strike it with holy fury: +1d6 damage, and it is driven back a square.' },
  { id: 'aura_of_courage', name: 'Aura of Courage', icon: 'banner', target: 'nearbyAllies', radius: 2, cooldown: 5, vfx: 'holy', fx: 0xffe8a0,
    statuses: [{ id: 'warded', rounds: 3 }, { id: 'shielded', rounds: 3, power: 1 }], desc: 'You and every companion within 2 gain +1 armour and a ward that turns aside the next stun, sleep, fear or curse (three rounds).' },
  { id: 'shield_of_dawn', name: 'Shield of Dawn', icon: 'sun', target: 'nearbyAllies', radius: 2, perBattle: 1, vfx: 'holy', fx: 0xffd870,
    statuses: [{ id: 'deathward', rounds: 2 }], desc: 'Once per battle. For two rounds no companion within 2 can fall: a blow that would fell them leaves them at 1 health instead (once each).' },
  // Minstrel
  { id: 'lullaby', name: 'Lullaby', icon: 'sleep', target: 'nearbyFoes', radius: 2, cooldown: 5, vfx: 'song', fx: 0xb0a0ff,
    statuses: [{ id: 'asleep', rounds: 2, chance: 0.5 }], desc: 'A drowsy air: each foe within 2 may nod off (one in two) for two turns, until struck.' },
  { id: 'discord', name: 'Song of Discord', icon: 'note', target: 'enemy', range: 5, cooldown: 4, vfx: 'song', fx: 0xe090ff,
    statuses: [{ id: 'charmed', rounds: 1 }], desc: 'A maddening tune: a foe within 5 turns on its own side for its next turn (a great foe may shake it off).' },
  { id: 'encore', name: 'Encore', icon: 'star', target: 'ally', range: 5, others: true, extraTurn: true, perBattle: 1, vfx: 'song', fx: 0xffd870,
    desc: 'Once per battle. Strike up a reel: a companion within 5 takes an extra turn straight after yours.' },
  // Runesmith
  { id: 'rune_trap', name: 'Rune Trap', icon: 'rune', target: 'tile', range: 4, radius: 0, place: 'trap', lasts: 6, damage: '2d6', stat: 'int', cooldown: 3, vfx: 'shock', fx: 0x5ee8ff,
    statuses: [{ id: 'stunned', rounds: 1 }], desc: 'Carve a hidden rune on an empty square within 4 (it waits six rounds): the first foe to step on it takes 2d6 + Intellect and is stunned.' },
  { id: 'lodestone', name: 'Lodestone Rune', icon: 'stone', target: 'nearbyFoes', radius: 3, pull: 2, cooldown: 4, vfx: 'shock', fx: 0x9ab8ff,
    desc: 'A rune of iron-hunger: every foe within 3 is dragged two squares towards you. (Then let the hammer fall.)' },
  { id: 'stone_warden', name: 'Stone Warden', icon: 'anvil', target: 'tile', range: 1, summon: 'stone_warden', lasts: 5, perBattle: 1, vfx: 'earth', fx: 0x5ee8ff,
    desc: 'Once per battle. Wake a rune-carved warden of stone on a square beside you: for five turns it fights at your side and bellows foes away from your friends.' },
  // ---- battle arts: any hero may learn them, offered among the talents
  { id: 'second_wind', name: 'Second Wind', icon: 'heart', general: true, level: 2, target: 'self', healPct: 0.3, perBattle: 1, free: true, vfx: 'heal', fx: 0x9fe8b8,
    desc: 'Free action, once per battle. Catch your breath: heal three tenths of your health.' },
  { id: 'first_aid', name: 'First Aid', icon: 'hands', general: true, level: 2, target: 'ally', range: 1, heal: '1d6+2', cure: true, cooldown: 4, vfx: 'heal', fx: 0x9fe8b8,
    desc: 'Bind your own wounds or those of a companion beside you: heal 1d6+2 and draw out poison.' },
  { id: 'dash', name: 'Dash', icon: 'boot', general: true, level: 2, target: 'self', addMoves: 3, free: true, cooldown: 3, vfx: 'smoke', fx: 0xd8d0b8,
    desc: 'Free action. Sprint: three more squares of movement this turn.' },
  { id: 'throw_knife', name: 'Throw Knife', icon: 'dagger', general: true, level: 2, target: 'enemy', range: 4, thrown: '1d4', cooldown: 2, vfx: 'slash', fx: 0xd8e0ec,
    desc: 'Hurl a knife at a foe up to 4 squares away: rolled to hit with Dexterity, 1d4 + half Dexterity. No bow needed.' },
  { id: 'shove', name: 'Shove', icon: 'bash', general: true, level: 2, target: 'enemy', range: 1, knockback: 2, free: true, cooldown: 3, vfx: 'impact', fx: 0xe8d0a0,
    desc: 'Free action. Shove a foe beside you two squares back — into a wall or another foe, and it takes a knock.' },
  { id: 'steady_aim', name: 'Steady Aim', icon: 'eye', general: true, level: 4, target: 'self', free: true, cooldown: 2, vfx: 'arcane', fx: 0xffe8a0,
    statuses: [{ id: 'focused', rounds: 1, power: 4, self: true }], desc: 'Free action. Take a breath and steady your hand: your next attack is +4 to hit and ignores cover.' },
  { id: 'hold_the_line', name: 'Hold the Line', icon: 'shield', general: true, level: 4, target: 'nearbyAllies', radius: 1, cooldown: 4, vfx: 'shout', fx: 0x90b8ff,
    statuses: [{ id: 'shielded', rounds: 2, power: 2 }], desc: 'Close ranks: you and every companion beside you gain +2 armour for two rounds.' },
  { id: 'disengage', name: 'Disengage', icon: 'flee', general: true, level: 4, target: 'self', free: true, cooldown: 3, vfx: 'smoke', fx: 0xb8f0d0,
    statuses: [{ id: 'nimble', rounds: 1, self: true }], desc: 'Free action. Watch your footing: this turn you slip away from foes without giving them free strikes.' },
  { id: 'battle_cry', name: 'Battle Cry', icon: 'shout', general: true, level: 6, target: 'nearbyAllies', radius: 3, cooldown: 5, vfx: 'shout', fx: 0xffb050,
    statuses: [{ id: 'blessed', rounds: 2, power: 2 }], desc: 'A roar that stirs the blood: you and every companion within 3 are +2 to hit for two rounds.' },
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
  // (isles) the powers of the isle folk and beasts
  { id: 'tongue_lash', name: 'Tongue Lash', icon: 'hands', monster: true, target: 'enemy', range: 4, pull: 3, damage: '1d4', cooldown: 3, statuses: [{ id: 'rooted', rounds: 1 }], vfx: 'poison', fx: 0xf08aa0,
    desc: 'A long, sticky tongue snaps out and drags a foe up to three squares to its jaws, holding it there.' },
  { id: 'venom_spit', name: 'Venom Spit', icon: 'poison', monster: true, target: 'enemy', range: 5, damage: '1d6', cooldown: 2, statuses: [{ id: 'poisoned', rounds: 3, power: 2 }], vfx: 'poison', fx: 0x9be050,
    desc: 'Spits green venom at a foe within 5: it burns, and keeps on burning (2 a turn for three turns).' },
  { id: 'shark_lunge', name: 'Lunge', icon: 'claw', monster: true, target: 'enemy', range: 4, move: 'charge', attack: 'melee', mult: 1, bonus: '1d6', cooldown: 3, vfx: 'impact', fx: 0xd0e8f0,
    desc: 'Surges through the water at a foe up to 4 squares off and bites deep.' },
  { id: 'thrash', name: 'Thrash', icon: 'frost', monster: true, target: 'tile', range: 6, radius: 1, windup: true, windupVerb: 'circles, churning the shallows into foam', damage: '2d6', cooldown: 3, knockback: 1, vfx: 'frost', fx: 0x80d8e8,
    desc: 'Churns the shallows into foam — next turn a wave of thrashing water and snapping jaws breaks over the marked squares. Step back from the water\'s edge!' },
  { id: 'wail', name: 'Grave Wail', icon: 'skull', monster: true, target: 'nearbyFoes', radius: 2, damage: '1d4', cooldown: 4, statuses: [{ id: 'weakened', rounds: 2 }], vfx: 'shadow', fx: 0xa8d8c8,
    desc: 'A thin, terrible wail: every foe within 2 is chilled and weakened.' },
  { id: 'constrict', name: 'Constrict', icon: 'pin', monster: true, target: 'enemy', range: 1, attack: 'melee', mult: 1, bonus: '1d6', cooldown: 3, statuses: [{ id: 'rooted', rounds: 2 }, { id: 'weakened', rounds: 2 }], vfx: 'impact', fx: 0x7ac8a0,
    desc: 'Wraps its coils round a foe beside it and squeezes: the foe cannot move, and fights feebly.' },
  { id: 'hag_curse', name: 'Drowned Curse', icon: 'eye', monster: true, target: 'enemy', range: 6, damage: '1d6', cooldown: 3, statuses: [{ id: 'weakened', rounds: 3 }, { id: 'slowed', rounds: 2 }], vfx: 'shadow', fx: 0x60d0b0,
    desc: 'Mutters a curse of the deep: the foe feels the weight of the sea, slowed and weakened.' },
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
  // (charms) quick feet, and a ward that turns aside the next curse
  hasted: { name: 'Hasted', icon: 'boot', color: '#9ff0d0', desc: 'Moves further each turn (its strength in squares).' },
  warded: { name: 'Warded', icon: 'rune', color: '#c8dcff', desc: 'The next stun, sleep, fear or curse slides off it.' },
  // (skills learned later)
  guarded: { name: 'Guarded', icon: 'shield', color: '#a8c8ff', desc: 'A companion beside it takes the blows meant for it.' },
  riposte: { name: 'Riposte', icon: 'sword', color: '#ffd0a0', desc: 'Strikes back at once at any foe that swings at it in melee (once a round).' },
  marked: { name: 'Marked', icon: 'aim', color: '#ff9a7a', bad: true, desc: 'Every attack on it is more accurate and harder-hitting (+2 to hit, +2 damage).' },
  focused: { name: 'Steady', icon: 'eye', color: '#ffe8a0', desc: 'Its next attack is more accurate and ignores cover.' },
  sanctuary: { name: 'Sanctuary', icon: 'sun', color: '#fff0b0', desc: 'No foe can strike or aim at it — until it strikes first.' },
  charmed: { name: 'Bewildered', icon: 'note', color: '#e090ff', bad: true, desc: 'Turns on its own side.' },
  deathward: { name: 'Dawn-shielded', icon: 'sun', color: '#ffd870', desc: 'A blow that would fell it leaves it at 1 health instead (once).' },
  nimble: { name: 'Nimble', icon: 'boot', color: '#b8f0d0', desc: 'Slips away from foes without giving them free strikes.' },
  // (tactics) a mace or hammer's heavy blow
  staggered: { name: 'Staggered', icon: 'down', color: '#e8c070', bad: true, desc: 'Reeling from a heavy blow: cannot move on its next turn, but may still strike.' },
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
  // (tactics II) at most twice: plate, a shield and a stack of these made a knight no ordinary foe could touch
  { id: 'guard', name: 'Guarded', icon: 'shield', stack: true, max: 2, trees: ['fighter', 'healer'], desc: '+1 armour (taken at most twice).' },
  { id: 'brutal', name: 'Brutal', icon: 'hammer', stack: true, trees: ['fighter'], desc: '+2 melee damage.' },
  { id: 'fleet', name: 'Fleet-footed', icon: 'boot', trees: ['archer', 'rogue'], desc: '+1 square of movement in battle.' },
  { id: 'deadly', name: 'Deadly', icon: 'dagger', trees: ['rogue', 'archer'], desc: 'Critical hits on one more number of the die.' },
  { id: 'marksman', name: 'Marksman', icon: 'bow', needs: 'ranged', trees: ['archer'], desc: '+1 range and +1 damage with bows, crossbows and slings.' },
  // (named for the hero's pool: Deep Well for mana, Deep Faith, Strong Voice — see magic.js perkText)
  { id: 'arcane', name: 'Deep Well', icon: 'rune', stack: true, needs: 'mana', trees: ['caster', 'healer'], desc: '+4 maximum mana.' },
  { id: 'quick', name: 'Quick Recovery', icon: 'hourglass', trees: ['caster', 'rogue'], desc: 'Skill cooldowns are one round shorter.' },
  { id: 'iron_will', name: 'Iron Will', icon: 'star', trees: ['fighter', 'healer', 'caster'], desc: 'Cannot be stunned, put to sleep or frightened.' },
  { id: 'alert', name: 'Alert', icon: 'eye', trees: ['archer', 'rogue', 'caster'], desc: '+4 initiative: acts earlier in battle.' },
  { id: 'mender', name: 'Healing Hands', icon: 'heart', stack: true, needs: 'heals', trees: ['healer'], desc: 'Every heal this hero gives mends 3 more health.' },
  { id: 'spellfire', name: 'Spellfire', icon: 'fire', stack: true, needs: 'magic', trees: ['caster'], desc: '+2 damage with spells, runes and magical skills.' },
  { id: 'forager', name: 'Forager', icon: 'herb', needs: 'herbs', trees: ['archer', 'healer'], desc: 'Finds herbs twice as often on the road, and one more each time.' },
  { id: 'thrifty', name: 'Thrifty Hands', icon: 'rune', needs: 'reagents', trees: ['caster', 'fighter', 'archer'], desc: 'One time in three, a rune or remedy burns none of its reagents.' },
];

// built-in pieces that are enchanted (older games gain the mark once)
export const MAGIC_GEAR = { elven_bow: 0xb8ffb0, ember_bow: 0xff8030, shadow_fang: 0x9a70ff, runeblade: 0x60e0ff, dwarf_axe: 0xffb060, staff_of_power: 0xff80ff,
  truesilver_mail: 0xd8ecff, elven_cloak: 0xa8f0c0, dragonscale: 0xff7050, serpent_shield: 0x60d0c8, whisperwind: 0xc0f0ff, fallen_hauberk: 0xa8b0ff, gilded_buckler: 0xffd060 };

// Kinds of weapon. Each has a trait of its own (the rules are in
// game/combat.js; their numbers are data here, editable under World Data →
// Weapon kinds), and it works only for a hero trained in the kind: a class's
// weapons list. Anyone may wield anything, but untrained at −3 to hit
// (settings.untrainedPenalty) and without the trait. A heavy kind (and any
// heavy or two-handed hand weapon) also needs the class's heavy-weapon training.
//   parry  +power armour against melee blows      hew     +power damage against armour minAc or more
//   stagger a hit may root the foe a turn (chance) reach   strikes `range` squares off in a line; first blow at a foe stepping in
//   sweep  felling a foe carries on to another     quick   +1 critical range, +power to hit flanking or from behind
//   ward   +power armour, +power to sure damage    far     +power range
//   pierce ignores cover                           snap    no penalty for shooting with a foe beside you
export const WEAPON_TRAITS = {
  parry: 'Parry', hew: 'Hew', stagger: 'Stagger', reach: 'Reach', sweep: 'Sweep', quick: 'Quick', ward: 'Ward', far: 'Far shot', pierce: 'Pierce', snap: 'Snap shot',
};
export const WEAPON_KIND_DEFS = [
  { id: 'blade', name: 'Blade', plural: 'blades', trait: 'parry', power: 1, desc: 'Swords: a guard and a quick wrist turn blows aside.' },
  { id: 'greatblade', name: 'Great blade', plural: 'great blades', trait: 'sweep', heavy: true, desc: 'Two-handed swords: a felled foe does not stop the swing.' },
  { id: 'axe', name: 'Axe', plural: 'axes', trait: 'hew', power: 2, minAc: 14, desc: 'Axes bite through mail and plate.' },
  { id: 'blunt', name: 'Mace & hammer', plural: 'maces and hammers', trait: 'stagger', chance: 0.3, desc: 'A crack on the helm leaves a foe reeling, unable to give chase.' },
  { id: 'staff', name: 'Staff', plural: 'staves', trait: 'ward', power: 1, desc: 'A staff held across the body wards its bearer, and steadies a caster\'s power.' },
  { id: 'dagger', name: 'Dagger', plural: 'daggers', trait: 'quick', power: 2, desc: 'A knife finds the gaps when the foe is looking elsewhere.' },
  { id: 'spear', name: 'Spear', plural: 'spears', trait: 'reach', range: 2, desc: 'A long reach: strike past a companion, and meet a charge point first.' },
  { id: 'bow', name: 'Bow', plural: 'bows', trait: 'far', power: 1, desc: 'A trained archer draws to the ear and shoots further.' },
  { id: 'crossbow', name: 'Crossbow', plural: 'crossbows', trait: 'pierce', desc: 'A bolt drives straight through leaves and lattice.' },
  { id: 'sling', name: 'Sling', plural: 'slings', trait: 'snap', desc: 'A flick of the wrist, even with a foe in your face.' },
];
export const WEAPON_KINDS = WEAPON_KIND_DEFS.map((k) => k.id);
export const ARMOR_WEIGHTS = ['cloth', 'leather', 'chain', 'plate'];
// Heavier armour also soaks up part of every blow that lands (an item's own
// `soak` overrides this): mail takes the edge off, plate shrugs off swarms
export const ARMOR_SOAK = { cloth: 0, leather: 0, chain: 1, plate: 2 };
export const ITEM_TYPES = ['weapon', 'armor', 'shield', 'charm', 'consumable', 'reagent', 'scroll', 'key', 'quest', 'map'];

// Charms: rings, amulets, horns and stones worn in a hero's charm slot. Their
// kind gives a default icon; rarity colours the name and sets loot odds.
export const CHARM_KINDS = {
  ring: 'Ring', amulet: 'Amulet', brooch: 'Brooch', talisman: 'Talisman', horn: 'Horn', stone: 'Stone', token: 'Token',
  whistle: 'Whistle', feather: 'Feather', bell: 'Bell', lantern: 'Lantern', orb: 'Orb', mirror: 'Mirror', pipe: 'Pipe', relic: 'Relic',
};
export const CHARM_KIND_ICONS = { ring: 'ring', amulet: 'amulet', brooch: 'brooch', talisman: 'rune', horn: 'horn', stone: 'stone', token: 'acorn',
  whistle: 'whistle', feather: 'feather', bell: 'bell', lantern: 'lantern', orb: 'orb', mirror: 'mirror', pipe: 'pipe', relic: 'gem' };
export const RARITIES = {
  common: { name: 'Common', color: '#d8ccb0', weight: 6 },
  uncommon: { name: 'Uncommon', color: '#8fe08a', weight: 3 },
  rare: { name: 'Rare', color: '#7ab8ff', weight: 1.5 },
  legendary: { name: 'Legendary', color: '#ffa640', weight: 0.5 },
};
export const ITEM_EFFECTS = ['heal', 'cure', 'revive', 'mp', 'light', 'food', 'reveal', 'recall'];
export const SPELL_TARGETS = ['enemy', 'area', 'allEnemies', 'ally', 'allAllies', 'self'];
export const SPELL_EFFECTS = ['damage', 'heal', 'cure', 'revive', 'sleep', 'fear', 'shield', 'bless', 'drain', 'light', 'reveal', 'recall'];

// Each school of magic looks and plays differently. style picks its cast
// window (book is a spellbook that scrolls can be copied into); resName names
// what it burns (a pool like mana, or the items of a reagent school); verb
// names the battle button; icon and color mark the school wherever it shows.
export const MAGIC_STYLES = { book: 'Spellbook (learns from scrolls)', prayer: 'Prayer beads', song: 'Song staves', runes: 'Rune tablets', herbs: 'Herb satchel' };
export const MAGIC_SYSTEMS = [
  { id: 'arcane', name: 'Sorcery', stat: 'int', resource: 'mp', enabled: true, color: '#7ab0ff', style: 'book', resName: 'Mana', verb: 'Cast', icon: 'book',
    desc: 'Words of power kept in a spellbook. Mighty in battle, costly in mana; spell scrolls can be copied into the book.' },
  { id: 'divine', name: 'Prayer', stat: 'wis', resource: 'mp', enabled: true, color: '#ffe27a', style: 'prayer', resName: 'Faith', verb: 'Pray', icon: 'sun',
    desc: 'Miracles granted to the faithful through Wisdom: healing, protection, and bane of the undead.' },
  { id: 'runic', name: 'Rune-craft', stat: 'int', resource: 'reagents', enabled: true, color: '#ff9a50', style: 'runes', resName: 'Reagents', verb: 'Carve', icon: 'rune',
    desc: 'The old craft of the dwarves. Runes need no mana — but every rune consumes its reagents.' },
  { id: 'song', name: 'Elven Song', stat: 'wis', resource: 'mp', enabled: true, color: '#8affc0', style: 'song', resName: 'Voice', verb: 'Sing', icon: 'note',
    desc: 'Songs of power that sway the whole battlefield, heartening friends and dismaying foes.' },
  { id: 'herbal', name: 'Herb-lore', stat: 'wis', resource: 'reagents', enabled: true, color: '#c2d65a', style: 'herbs', resName: 'Herbs', verb: 'Brew', icon: 'herb',
    desc: 'Remedies and charms of the wild. No mana: each uses up herbs, which a ranger gathers as the company travels.' },
  { id: 'innate', name: 'Innate (monsters only)', stat: 'int', resource: 'mp', enabled: true, color: '#ff6060', monsterOnly: true,
    desc: 'Breath weapons and dark gifts used only by monsters.' },
];

export const RACES = [
  { id: 'human', name: 'Human', desc: 'Short-lived, restless and adaptable: kings and wanderers both.',
    mods: { str: 0, dex: 0, int: 0, wis: 0 }, hp: 0, traits: ['versatile'],
    look: { race: 'human', skin: 0xe8b890 } },
  { id: 'dwarf', name: 'Dwarf', desc: 'Stout folk of the deep halls: tireless, stubborn and hard as the stone they carve.',
    mods: { str: 2, dex: -1, int: 0, wis: 1 }, hp: 2, traits: ['poisonResist', 'darkSight', 'stout'],
    look: { race: 'dwarf', skin: 0xe0a880 } },
  { id: 'elf', name: 'Elf', desc: 'The Fair Folk of the woods: keen-eyed, graceful and wise beyond mortal years.',
    mods: { str: -1, dex: 2, int: 1, wis: 0 }, hp: -1, traits: ['keenSight'],
    look: { race: 'elf', skin: 0xf0d0b0 } },
  { id: 'hobbit', name: 'Hobbit', desc: 'Small folk of the green hills: quiet of foot, hard to frighten, lucky beyond reason and fond of six meals a day.',
    mods: { str: -2, dex: 2, int: 0, wis: 1 }, hp: 0, traits: ['lucky', 'homely'],
    look: { race: 'hobbit', skin: 0xf0c4a0 } },
];

// skills: [{ id, level }] — each class skill and the level it is learned at (a
// plain id is learned at 1, 3, 5… by its place in the list, as older games had it)
const learn = (id, level) => ({ id, level });
export const CLASSES = [
  { id: 'warrior', talents: 'fighter', name: 'Warrior', desc: 'A master of arms and armour, the shield-wall of any fellowship.',
    hpBase: 16, hpLevel: 8, hitRate: 1.0, magic: [], weapons: ['blade', 'greatblade', 'axe', 'blunt', 'spear', 'dagger', 'crossbow', 'bow', 'sling'], heavyWeapons: true, armor: 'plate', shields: true,
    abilities: ['cleave'], special: 'whirlwind', skills: [learn('shield_bash', 1), learn('taunt', 3), learn('shield_wall', 5), learn('riposte', 7), learn('finishing_blow', 9)], start: ['long_sword', 'leather_armor', 'buckler'], primary: ['str', 'dex'],
    look: { body: 0xa8302a, hat: 'helm', hatColor: 0x8c94a0, wings: true, helmTrim: 0xd8a83a, weapon: 'sword', shield: 0x9a6a30, pauldrons: 'plate', cape: 0x6a1c1a, pose: 'raise' } },
  { id: 'ranger', talents: 'archer', name: 'Ranger', desc: 'A wanderer of the wild places, deadly with the bow. Gathers herbs on the road and brews remedies from them.',
    hpBase: 14, hpLevel: 7, hitRate: 0.85, magic: [{ system: 'herbal', rate: 1 }], weapons: ['blade', 'dagger', 'spear', 'bow', 'axe', 'sling'], heavyWeapons: false, armor: 'chain', shields: false,
    abilities: ['tracker'], special: 'volley', skills: [learn('aimed_shot', 1), learn('pinning_shot', 3), learn('hunters_mark', 5), learn('spirit_wolf', 7), learn('arrowstorm', 9)], start: ['short_sword', 'short_bow', 'leather_armor'], primary: ['dex', 'wis'],
    look: { body: 0x4a7a32, hat: 'hood', hatColor: 0x3a6a2c, weapon: 'bow', cape: 0x3a6a2c } },
  // (tactics: a point more health at level 1, 13 with the heroic 4: a goblin's blow took two thirds of the old 8)
  { id: 'wizard', talents: 'caster', name: 'Wizard', desc: 'A scholar of Sorcery whose words can call down fire and lightning. Frail in body.',
    requires: 'arcane', hpBase: 9, hpLevel: 4, hitRate: 0.4, magic: [{ system: 'arcane', rate: 1 }], weapons: ['staff', 'dagger'], heavyWeapons: false, armor: 'cloth', shields: false,
    abilities: [], special: 'blink', skills: [learn('firebolt', 1), learn('frost_nova', 3), learn('arc_lightning', 5), learn('arcane_grasp', 7), learn('meteor', 9)], start: ['quarterstaff', 'robe'], primary: ['int', 'dex'],
    look: { body: 0x3446a8, robe: true, hat: 'wizard', hatColor: 0x3446a8, trim: 0xe2b24a, weapon: 'staff', pose: 'cast' } },
  { id: 'cleric', talents: 'healer', name: 'Cleric', desc: 'A servant of the Powers, healer of wounds and scourge of the restless dead.',
    requires: 'divine', hpBase: 12, hpLevel: 6, hitRate: 0.6, magic: [{ system: 'divine', rate: 1 }], weapons: ['blunt', 'staff', 'sling'], heavyWeapons: false, armor: 'chain', shields: true,
    abilities: [], special: 'mending', skills: [learn('healing_word', 1), learn('smite', 3), learn('hallowed_ground', 5), learn('sanctuary', 7), learn('breath_of_life', 9)], start: ['mace', 'sling', 'leather_armor', 'buckler'], primary: ['wis', 'str'],
    look: { body: 0xe6dcc4, robe: true, trim: 0xd8a83a, weapon: 'mace', shield: 0x8a5a32, mantle: 0xa87828 } },
  { id: 'burglar', talents: 'rogue', name: 'Burglar', desc: 'Quick of hand and quiet of foot. Picks locks, finds traps, and strikes from the shadows.',
    hpBase: 10, hpLevel: 5, hitRate: 0.75, magic: [], weapons: ['dagger', 'blade', 'sling', 'bow'], heavyWeapons: false, armor: 'leather', shields: false,
    abilities: ['backstab', 'lockpick'], special: 'shadowstrike', skills: [learn('poison_blade', 1), learn('smoke_bomb', 3), learn('filch', 5), learn('caltrops', 7), learn('fan_of_knives', 9)], start: ['dagger', 'sling', 'leather_armor'], primary: ['dex', 'int'],
    look: { body: 0x5a5448, hat: 'hood', hatColor: 0x3e3a44, weapon: 'dagger', offhand: 'dagger', cape: 0x3e3a44, scarf: 0xb03a2a } },
  { id: 'paladin', talents: 'fighter', name: 'Paladin', desc: 'A holy knight sworn to a cause, mighty in arms and gifted with a little Prayer.',
    requires: null, hpBase: 15, hpLevel: 7, hitRate: 0.9, magic: [{ system: 'divine', rate: 0.5 }], weapons: ['blade', 'greatblade', 'blunt', 'spear', 'axe'], heavyWeapons: true, armor: 'plate', shields: true,
    abilities: ['layHands'], special: 'rally', skills: [learn('holy_strike', 1), learn('lay_on_hands', 3), learn('holy_charge', 5), learn('aura_of_courage', 7), learn('shield_of_dawn', 9)], start: ['long_sword', 'chain_mail', 'buckler'], primary: ['str', 'wis'],
    look: { body: 0xd8d8e0, armor: 'plate', hat: 'helm', plume: 0xc03030, weapon: 'sword', shield: 0xcdd2da, cape: 0x2a4a9a } },
  { id: 'minstrel', talents: 'caster', name: 'Minstrel', desc: 'A singer of the old lays whose songs of power hearten friends and dismay foes.',
    requires: 'song', hpBase: 10, hpLevel: 5, hitRate: 0.65, magic: [{ system: 'song', rate: 1 }], weapons: ['blade', 'dagger', 'bow', 'sling'], heavyWeapons: false, armor: 'leather', shields: false,
    abilities: [], special: 'dazzle', skills: [learn('cutting_words', 1), learn('inspire', 3), learn('lullaby', 5), learn('discord', 7), learn('encore', 9)], start: ['short_sword', 'short_bow', 'leather_armor'], primary: ['wis', 'dex'],
    look: { body: 0x9a3a8a, hat: 'cap', hatColor: 0x7a2a6a, weapon: 'sword', cape: 0xd8a83a, back: 'lute', pose: 'hip' } },
  { id: 'runesmith', talents: 'caster', name: 'Runesmith', desc: 'A forge-priest of the dwarves who carves runes of power, fuelled by rare reagents.',
    requires: 'runic', hpBase: 13, hpLevel: 6, hitRate: 0.75, magic: [{ system: 'runic', rate: 1 }], weapons: ['blunt', 'axe', 'dagger', 'crossbow'], heavyWeapons: true, armor: 'chain', shields: true,
    abilities: [], special: 'earthshaker', skills: [learn('thunder_hammer', 1), learn('ward_rune', 3), learn('rune_trap', 5), learn('lodestone', 7), learn('stone_warden', 9)], start: ['warhammer', 'crossbow', 'leather_armor', 'buckler'], primary: ['int', 'str'],
    // slate and steel with glowing cyan runes: never mistaken for the white-and-gold cleric
    look: { body: 0x3e5a78, armor: 'chain', hat: 'helm', hatColor: 0x8e9cae, weapon: 'hammer', shield: 0x4a5c70, runes: 0x5ee8ff } },
];

// ---------------------------------------------------------------- charms
// Magic worn in the charm slot (only a worn charm works; one in the pack
// sleeps). Each is data: effects [{ type, ...params }] (see game/charms.js
// for the vocabulary: steady bonuses, battle-start blessings, effects each
// turn, on a blow struck or taken, resistances, spoils, and world effects such
// as quicker travel, keener sight, wading the shallows or climbing mountains),
// an optional battle action (ability: the ability schema above, shown on the
// battle bar), and who may wear it (only: { races, classes }, onlyText).
// rarity and level decide where it turns up; say is the log line when its
// battle-start magic fires ({who} is the wearer). An effect with `with` wakes
// only while someone else in the company wears that other piece (twins).
const C = (o) => ({ type: 'charm', ...o });
export const CHARMS = [
  // humble trinkets
  C({ id: 'lucky_acorn', name: 'Lucky Acorn', kind: 'token', icon: 'acorn', tint: 0xc8904a, rarity: 'common', level: 1, price: 35,
    desc: 'Picked from the hollow of a lightning-struck oak. Squirrels give you funny looks.', effects: [{ type: 'bonus', stat: 'ac', power: 1 }] }),
  C({ id: 'tin_whistle', name: 'Tin Whistle', kind: 'whistle', icon: 'whistle', tint: 0xc8d0dc, rarity: 'common', level: 1, price: 25,
    desc: 'Three notes, all of them shrill.', effects: [],
    ability: { name: 'Shrill Blast', icon: 'whistle', target: 'nearbyFoes', radius: 2, perBattle: 1, free: true, statuses: [{ id: 'stunned', rounds: 1, chance: 0.3 }], vfx: 'shout', fx: 0xe0e8ff,
      desc: 'Free action, once per battle. A blast that sets teeth on edge: each foe within 2 squares may flinch (3 in 10) and lose its next turn.' } }),
  C({ id: 'giants_hobnail', name: 'Giant\'s Hobnail', kind: 'token', icon: 'boot', tint: 0xa8a8a8, rarity: 'common', level: 1, price: 60,
    desc: 'A hobnail the size of a thumb, from the boot of some long-dead giant. It wants to keep walking.', effects: [{ type: 'travel', pct: 0.1 }] }),
  C({ id: 'glowworm_jar', name: 'Glow-worm Jar', kind: 'lantern', icon: 'lantern', tint: 0xc0ff70, rarity: 'common', level: 1, price: 50,
    desc: 'A stoppered jar of glow-worms. They seem happy enough.', effects: [{ type: 'sight', light: 2 }] }),
  C({ id: 'rabbit_foot', name: 'Rabbit\'s Foot', kind: 'token', icon: 'paw', tint: 0xeadfcc, rarity: 'common', level: 1, price: 65,
    desc: 'Lucky for you. Less so for the rabbit.', effects: [{ type: 'bonus', stat: 'init', power: 3 }, { type: 'resist', status: 'stunned', chance: 0.25 }] }),
  C({ id: 'worry_stone', name: 'Worry Stone', kind: 'stone', icon: 'stone', tint: 0x8ea8b8, rarity: 'common', level: 1, price: 30,
    desc: 'A river pebble worn smooth by an anxious thumb. Rub it, and the fear goes into the stone.', effects: [{ type: 'resist', status: 'afraid', chance: 1 }, { type: 'resist', status: 'asleep', chance: 0.25 }] }),
  C({ id: 'hazel_twig', name: 'Hazel Dowsing-twig', kind: 'talisman', icon: 'rod', tint: 0xc09058, rarity: 'common', level: 2, price: 95,
    desc: 'A forked hazel twig. Held loosely, it dips towards whatever lies buried.', effects: [{ type: 'dowse', radius: 5 }] }),
  C({ id: 'copper_bangle', name: 'Copper Bangle', kind: 'ring', icon: 'ring', tint: 0xe08c50, rarity: 'common', level: 1, price: 45,
    desc: 'Turns your wrist green, and keeps the venom out.', effects: [{ type: 'resist', status: 'poisoned', chance: 0.5 }] }),
  C({ id: 'shepherds_bell', name: 'Shepherd\'s Bell', kind: 'bell', icon: 'bell', tint: 0xe0c060, rarity: 'common', level: 1, price: 70,
    desc: 'Its dull clank says: nothing worth eating here, move along.', effects: [{ type: 'encounters', pct: 0.25 }] }),
  C({ id: 'honeycake_tin', name: 'Honey-cake Tin', kind: 'relic', icon: 'pouch', tint: 0xe8b848, rarity: 'common', level: 1, price: 60,
    desc: 'A battered tin that always seems to hold one more cake than you remember.', effects: [{ type: 'food', pct: 0.25 }] }),
  C({ id: 'hearth_stone', name: 'Hearth-stone', kind: 'stone', icon: 'stone', tint: 0xe07040, rarity: 'common', level: 2, price: 80,
    desc: 'A warm stone from a hobbit-hole hearth. Tucked into a bedroll, it makes any camp a home.', effects: [{ type: 'camp', pct: 0.3 }] }),
  // finer work
  C({ id: 'selkie_shell', name: 'Selkie\'s Shell', kind: 'talisman', icon: 'shell', tint: 0xf4c8dc, rarity: 'uncommon', level: 2, price: 240,
    desc: 'Hold it to your ear and you hear the sea; hold it in your fist and the sea holds you up.', effects: [{ type: 'wade' }] }),
  C({ id: 'goatfoot_amulet', name: 'Goat-foot Amulet', kind: 'amulet', icon: 'amulet', tint: 0xc8b890, rarity: 'uncommon', level: 3, price: 380,
    desc: 'A cloven hoof bound in silver wire. Dwarf scouts wear them on the high passes, where no road goes.', effects: [{ type: 'climb' }] }),
  C({ id: 'merchants_brooch', name: 'Merchant\'s Brooch', kind: 'brooch', icon: 'brooch', tint: 0xecc464, rarity: 'uncommon', level: 2, price: 240,
    desc: 'A brass brooch shaped like a pair of scales. Shopkeepers find themselves strangely reasonable.', effects: [{ type: 'prices', pct: 0.15 }] }),
  C({ id: 'nettle_ring', name: 'Nettle Ring', kind: 'ring', icon: 'ring', tint: 0x88c058, rarity: 'uncommon', level: 2, price: 220,
    desc: 'Woven of nettle-stems and silver wire. It stings anyone who lays a hand on you.', effects: [{ type: 'thorns', dmg: '1d4' }] }),
  C({ id: 'leech_stone', name: 'Leech-stone', kind: 'stone', icon: 'stone', tint: 0xb02838, rarity: 'uncommon', level: 3, price: 350,
    desc: 'A blood-red stone, warm as skin. It drinks a little of every wound you deal, and shares.', effects: [{ type: 'drain', pct: 0.25 }] }),
  C({ id: 'owl_feather', name: 'Owl Feather', kind: 'feather', icon: 'feather', tint: 0xdccaa8, rarity: 'uncommon', level: 2, price: 320,
    desc: 'A grey owl\'s feather. Tuck it behind your ear, and shadows give up their secrets.', effects: [{ type: 'trueSight' }, { type: 'sight', power: 1, light: 1 }] }),
  C({ id: 'wolf_tooth', name: 'Wolf-tooth Necklace', kind: 'amulet', icon: 'tooth', tint: 0xf2ead2, rarity: 'uncommon', level: 2, price: 260,
    only: { classes: ['warrior', 'ranger'] }, onlyText: 'Only a warrior or a ranger can bear its hunger',
    desc: 'Teeth of a pack-leader, still sharp. In battle you can hear it howl.', say: '{who}\'s wolf-tooth howls — the blood runs hot!',
    effects: [{ type: 'onStart', status: 'enraged', rounds: 2, who: 'self' }] }),
  C({ id: 'shieldmaiden_brooch', name: 'Brooch of the Shield-maiden', kind: 'brooch', icon: 'brooch', tint: 0x98bcff, rarity: 'uncommon', level: 3, price: 270,
    desc: 'A round silver brooch. When steel comes for you, a pale shield shimmers into being.',
    effects: [{ type: 'onStart', status: 'shielded', power: 2, rounds: 3, who: 'self' }, { type: 'onHurt', status: 'shielded', power: 3, rounds: 2, below: 0.5 }] }),
  C({ id: 'frostfang_pendant', name: 'Frostfang Pendant', kind: 'amulet', icon: 'tooth', tint: 0xa8ecff, rarity: 'uncommon', level: 3, price: 380,
    desc: 'An icicle that never melts, on a silver chain. Your blows leave rime behind.',
    effects: [{ type: 'onHit', status: 'slowed', rounds: 2, chance: 0.3 }, { type: 'resist', status: 'slowed', chance: 1 }] }),
  C({ id: 'viper_amulet', name: 'Amulet of the Viper', kind: 'amulet', icon: 'amulet', tint: 0x88d868, rarity: 'uncommon', level: 3, price: 420,
    desc: 'A coiled serpent of green enamel. Your blades come away glistening.',
    effects: [{ type: 'onHit', status: 'poisoned', rounds: 3, power: 2, chance: 0.3, melee: true }] }),
  C({ id: 'wanderers_pin', name: 'Wanderer\'s Cloak-pin', kind: 'brooch', icon: 'brooch', tint: 0x74b07a, rarity: 'uncommon', level: 3, price: 370,
    desc: 'Worn by a ranger who walked every road in Eldmark twice, and found the short cuts on the third time round.',
    effects: [{ type: 'travel', pct: 0.15 }, { type: 'encounters', pct: 0.2 }] }),
  C({ id: 'bone_dice', name: 'Gambler\'s Bone Dice', kind: 'token', icon: 'dice', tint: 0xf2ead8, rarity: 'uncommon', level: 2, price: 300,
    desc: 'Two knucklebone dice that never seem to roll a one.', effects: [{ type: 'bonus', stat: 'crit', power: 1 }, { type: 'spoils', gold: 0.25 }] }),
  C({ id: 'wildwood_whistle', name: 'Wildwood Whistle', kind: 'whistle', icon: 'whistle', tint: 0xa0d478, rarity: 'uncommon', level: 3, price: 450,
    desc: 'Carved from rowan. Its note is too low for you to hear, but every beast of the wild hears it, and lies down.',
    effects: [{ type: 'calm' }],
    ability: { name: 'Hush', icon: 'whistle', target: 'nearbyFoes', radius: 3, perBattle: 1, statuses: [{ id: 'asleep', rounds: 2, chance: 0.4 }], vfx: 'song', fx: 0xa0d478,
      desc: 'Once per battle. A note below hearing: each foe within 3 may drowse off (4 in 10) for a turn or two.' } }),
  C({ id: 'salamander_scale', name: 'Salamander Scale', kind: 'talisman', icon: 'scale', tint: 0xff8848, rarity: 'uncommon', level: 4, price: 510,
    desc: 'A single scale of a fire-lizard, hot to the touch. Flames lick at you and find nothing to eat.',
    effects: [{ type: 'fireWalk' }, { type: 'resist', status: 'burning', chance: 1 }] }),
  // rare things
  C({ id: 'quicksilver_hourglass', name: 'Quicksilver Hourglass', kind: 'relic', icon: 'hourglass', tint: 0xd4e4f4, rarity: 'rare', level: 4, price: 540,
    desc: 'Its sand runs upwards. So, for a little while, does time.', say: 'The sand in {who}\'s hourglass runs upwards…',
    effects: [{ type: 'onStart', status: 'hasted', power: 2, rounds: 2, who: 'self' }, { type: 'bonus', stat: 'init', power: 4 }] }),
  C({ id: 'ring_of_opening', name: 'Ring of Opening', kind: 'ring', icon: 'keyring', tint: 0xffd468, rarity: 'rare', level: 3, price: 680,
    desc: 'Fennick made it after locking himself out of his own tower. Twice. No lock, bar or seal of magic refuses it.', effects: [{ type: 'unseal' }] }),
  C({ id: 'trollblood_ring', name: 'Troll-blood Ring', kind: 'ring', icon: 'ring', tint: 0x7a9a50, rarity: 'rare', level: 5, price: 860,
    desc: 'Set with a stone of clotted troll-blood. Your wounds close as you watch, which is unsettling.', effects: [{ type: 'regen', hp: 2, who: 'self' }] }),
  C({ id: 'warding_mirror', name: 'Mirror of Warding', kind: 'mirror', icon: 'mirror', tint: 0xd4e4ff, rarity: 'rare', level: 4, price: 650,
    desc: 'A hand-mirror of polished silver. Curses see their own faces in it, and flee.',
    effects: [{ type: 'onStart', status: 'warded', rounds: 99, who: 'self' }, { type: 'cleanse', chance: 0.35 }] }),
  C({ id: 'phoenix_ember', name: 'Phoenix Ember', kind: 'talisman', icon: 'fire', tint: 0xff7a30, rarity: 'rare', level: 4, price: 760,
    desc: 'A coal from a phoenix\'s nest that has burned for a hundred years, and is not tired yet.', effects: [{ type: 'resist', status: 'burning', chance: 1 }],
    ability: { name: 'Rekindle', icon: 'fire', target: 'ally', range: 4, healPct: 0.4, cure: true, perBattle: 1, vfx: 'heal', fx: 0xffa040,
      desc: 'Once per battle. Fan the ember over yourself or a companion within 4: they heal two-fifths of their health and are cured of poison.' } }),
  C({ id: 'stormcaller_orb', name: 'Stormcaller\'s Orb', kind: 'orb', icon: 'orb', tint: 0x98c8ff, rarity: 'rare', level: 5, price: 940,
    desc: 'Lightning sleeps in the glass, and does not like to be woken.', effects: [],
    ability: { name: 'Chain Lightning', icon: 'orb', target: 'multi', count: 3, range: 6, damage: '2d6', stat: 'int', cooldown: 3, statuses: [{ id: 'stunned', rounds: 1, chance: 0.2 }], vfx: 'shock', fx: 0xa8d4ff,
      desc: 'Lightning leaps from the orb to up to three foes within 6 (2d6 + Intellect each; never misses, may stun). Ready again three turns later.' } }),
  C({ id: 'horn_of_brannoc', name: 'Horn of Brannoc', kind: 'horn', icon: 'horn', tint: 0xe8c888, rarity: 'rare', level: 5, price: 1150,
    desc: 'The war-horn of Brannoc, who sounded the charge at King Elendur\'s last battle. It has not forgotten how.',
    say: '{who} sounds the Horn of Brannoc — the company is blessed!',
    effects: [{ type: 'onStart', status: 'blessed', power: 2, rounds: 3, who: 'party' }],
    ability: { name: 'Sound the Charge', icon: 'horn', target: 'allAllies', perBattle: 1, free: true, statuses: [{ id: 'hasted', rounds: 2, power: 2 }], vfx: 'shout', fx: 0xffd080,
      desc: 'Free action, once per battle. The horn calls the charge: every companion moves 2 squares further for two turns.' } }),
  C({ id: 'sunstone', name: 'Sunstone of Anor', kind: 'stone', icon: 'sunstone', tint: 0xffc848, rarity: 'rare', level: 4, price: 600,
    desc: 'A golden stone that holds a summer noon. It longs for its pale twin.', say: 'Sun and moon wake together on {who}\'s breast!',
    effects: [{ type: 'bonus', stat: 'hit', power: 1 }, { type: 'onStart', status: 'blessed', power: 2, rounds: 3, who: 'party', with: 'moonstone' }] }),
  C({ id: 'moonstone', name: 'Moonstone of Ithil', kind: 'stone', icon: 'moonstone', tint: 0xc8d8ff, rarity: 'rare', level: 4, price: 600,
    desc: 'A pale stone that holds a winter midnight. It longs for its golden twin.',
    effects: [{ type: 'bonus', stat: 'ac', power: 1 }, { type: 'onStart', status: 'shielded', power: 2, rounds: 3, who: 'party', with: 'sunstone' }] }),
  // sworn brothers: apart a little armour; worn by two of the company, neither falls easily
  C({ id: 'oath_ring_aldred', name: 'Oath-ring of Aldred', kind: 'ring', icon: 'ring', tint: 0xd8dce8, rarity: 'uncommon', level: 3, price: 340,
    desc: 'One of two silver rings sworn on the same blade. Aldred died beside his brother Edric, and the rings remember.',
    effects: [{ type: 'bonus', stat: 'ac', power: 1 }, { type: 'regen', hp: 1, who: 'self', with: 'oath_ring_edric' }, { type: 'resist', status: 'afraid', chance: 1, with: 'oath_ring_edric' }] }),
  C({ id: 'oath_ring_edric', name: 'Oath-ring of Edric', kind: 'ring', icon: 'ring', tint: 0xe8d8b8, rarity: 'uncommon', level: 3, price: 340,
    desc: 'One of two silver rings sworn on the same blade. Edric died beside his brother Aldred, and the rings remember.',
    effects: [{ type: 'bonus', stat: 'hit', power: 1 }, { type: 'regen', hp: 1, who: 'self', with: 'oath_ring_aldred' }, { type: 'resist', status: 'afraid', chance: 1, with: 'oath_ring_aldred' }] }),
  // odds and ends
  C({ id: 'gull_feather', name: 'Gull-feather Charm', kind: 'feather', icon: 'feather', tint: 0xf0f0f4, rarity: 'common', level: 1, price: 45,
    desc: 'Sailors tie them to the mast for a fair wind. On land, it seems, the wind is fair too — and there is always a fish.',
    effects: [{ type: 'travel', pct: 0.05 }, { type: 'food', pct: 0.1 }] }),
  C({ id: 'thieves_penny', name: 'Thieves\' Penny', kind: 'token', icon: 'coin', tint: 0xd8a860, rarity: 'uncommon', level: 2, price: 180,
    desc: 'A copper penny with a head on both sides, for those who never lose a toss.',
    effects: [{ type: 'prices', pct: 0.1 }, { type: 'spoils', gold: 0.1 }] }),
  C({ id: 'ember_ring', name: 'Ember Ring', kind: 'ring', icon: 'ring', tint: 0xff7838, rarity: 'uncommon', level: 3, price: 320,
    desc: 'A band of red gold that is always warm. Strike with that hand, and sparks fly.',
    effects: [{ type: 'onHit', status: 'burning', rounds: 2, chance: 0.25 }, { type: 'resist', status: 'burning', chance: 1 }] }),
  // small powers that come again a few turns later
  C({ id: 'thunder_egg', name: 'Thunder-egg', kind: 'stone', icon: 'stone', tint: 0x9aa4b8, rarity: 'uncommon', level: 2, price: 290,
    desc: 'A grey stone the size of a hen\'s egg. Shake it and it grumbles; strike it and it roars.', effects: [],
    ability: { name: 'Thunderclap', icon: 'quake', target: 'adjacentFoes', damage: '1d6', knockback: 1, cooldown: 3, vfx: 'shock', fx: 0xc8d4ff,
      desc: 'The egg cracks like thunder: every foe beside you takes 1d6 and is thrown back a square. Ready again three turns later.' } }),
  C({ id: 'menders_pendant', name: 'Mender\'s Pendant', kind: 'amulet', icon: 'hands', tint: 0xd8f0e0, rarity: 'uncommon', level: 2, price: 270,
    desc: 'A silver pendant shaped like a cupped hand. It is warm whenever someone near you bleeds.', effects: [],
    ability: { name: 'Cupped Hand', icon: 'heart', target: 'ally', range: 3, heal: '1d8+2', stat: 'wis', cooldown: 3, free: true, vfx: 'heal', fx: 0x9fe8b8,
      desc: 'Free action. Heal yourself or a companion within 3 (1d8+2 + Wisdom). Ready again three turns later.' } }),
  C({ id: 'fox_ring', name: 'Ring of the Fox', kind: 'ring', icon: 'ring', tint: 0xe8904a, rarity: 'rare', level: 3, price: 600,
    desc: 'A copper ring with a fox\'s mask. The fox is never quite where the hounds thought.', effects: [{ type: 'bonus', stat: 'init', power: 2 }],
    ability: { name: 'Fox\'s Leap', icon: 'blink', target: 'tile', range: 3, move: 'teleport', cooldown: 4, free: true, vfx: 'arcane', fx: 0xffa860,
      desc: 'Free action. Vanish and step out on any open square within 3. Ready again four turns later.' } }),
  C({ id: 'barrow_bell', name: 'Barrow-warden\'s Bell', kind: 'bell', icon: 'bell', tint: 0xb8c0a8, rarity: 'uncommon', level: 3, price: 370,
    desc: 'The barrow-wardens rang it at dusk to tell the dead to keep to their graves. Most of them listen.',
    effects: [{ type: 'resist', status: 'afraid', chance: 0.5, who: 'party' }],
    ability: { name: 'Toll for the Dead', icon: 'bell', target: 'nearbyFoes', radius: 3, damage: '1d4', undeadBonus: 3, cooldown: 4, statuses: [{ id: 'afraid', rounds: 2, chance: 0.4 }], vfx: 'shout', fx: 0xd8e0c0,
      desc: 'The bell tolls: every foe within 3 takes 1d4 (three times as much if undead) and may flee in fear. Ready again four turns later.' } }),
  // for one people
  C({ id: 'deep_runering', name: 'Rune-ring of the Deep', kind: 'ring', icon: 'ring', tint: 0x68e4ff, rarity: 'uncommon', level: 3, price: 480,
    only: { races: ['dwarf'] }, onlyText: 'Only a dwarf can wake its runes',
    desc: 'Black iron set with blue runes that glow only on a dwarf\'s finger.',
    effects: [{ type: 'bonus', stat: 'ac', power: 2 }, { type: 'resist', status: 'poisoned', chance: 1 }, { type: 'resist', status: 'stunned', chance: 0.5 }] }),
  C({ id: 'leaf_brooch', name: 'Leaf-brooch of Lindaleth', kind: 'brooch', icon: 'leaf', tint: 0xa0e8a8, rarity: 'uncommon', level: 2, price: 420,
    only: { races: ['elf'] }, onlyText: 'Only an elf can hear the leaf sing',
    desc: 'A leaf of green enamel that rustles though there is no wind. It knows every path through the woods.',
    effects: [{ type: 'travel', pct: 0.15 }, { type: 'sight', power: 2 }, { type: 'forage', pct: 0.5 }] }),
  C({ id: 'old_toby_pipe', name: 'Old Toby\'s Pipe', kind: 'pipe', icon: 'pipe', tint: 0xb07a48, rarity: 'uncommon', level: 1, price: 190,
    only: { races: ['hobbit'] }, onlyText: 'Only a hobbit can draw on it without coughing',
    desc: 'A long-stemmed pipe of briar. Its smoke-rings drift, unhurried, through any danger — and so does whoever is puffing it.',
    effects: [{ type: 'camp', pct: 0.5 }, { type: 'food', pct: 0.2 }, { type: 'onStart', status: 'hidden', rounds: 1, who: 'self' }, { type: 'resist', status: 'afraid', chance: 1 }] }),
  C({ id: 'kings_coin', name: 'Coin of the Old Kings', kind: 'token', icon: 'coin', tint: 0xf4d470, rarity: 'uncommon', level: 2, price: 350,
    only: { races: ['human'] }, onlyText: 'Only one of Men may carry the Kings\' coin',
    desc: 'A gold coin of the Elder Days, stamped with a crowned head. Men who carry it learn swiftly, and fight with a king\'s confidence.',
    effects: [{ type: 'spoils', xp: 0.15 }, { type: 'bonus', stat: 'hit', power: 1 }] }),
  C({ id: 'heart_of_the_mountain', name: 'Heart of the Mountain', kind: 'relic', icon: 'gem', tint: 0x8ab0d0, rarity: 'legendary', level: 7, price: 2200,
    only: { races: ['dwarf'] }, onlyText: 'Only a dwarf can bear the mountain\'s weight',
    desc: 'A gem the size of a fist, cut from the root of the world. Stone remembers its own, and lets them pass.',
    effects: [{ type: 'bonus', stat: 'ac', power: 3 }, { type: 'bonus', stat: 'hp', power: 10 }, { type: 'resist', status: 'stunned', chance: 1 }, { type: 'climb' }] }),
  // for one calling
  C({ id: 'star_ring', name: 'Star-ring of the Magi', kind: 'ring', icon: 'starring', tint: 0xb8a8ff, rarity: 'rare', level: 3, price: 760,
    only: { classes: ['wizard'] }, onlyText: 'Only a wizard can kindle its star',
    desc: 'A ring set with a chip of fallen star. It hums with stored power.', effects: [{ type: 'bonus', stat: 'mp', power: 4 }, { type: 'regen', mp: 1, who: 'self' }] }),
  C({ id: 'dawn_medallion', name: 'Dawn-sun Medallion', kind: 'amulet', icon: 'sun', tint: 0xfff0a0, rarity: 'rare', level: 3, price: 680,
    only: { classes: ['cleric', 'paladin'] }, onlyText: 'Only a cleric or a paladin may bear the Dawn',
    desc: 'A gold sun on a chain, warm as morning. The dead cannot bear to look at it.', effects: [{ type: 'resist', status: 'afraid', chance: 1 }],
    ability: { name: 'Dawnburst', icon: 'sun', target: 'nearbyFoes', radius: 2, damage: '1d6', stat: 'wis', undeadBonus: 2, perBattle: 1, statuses: [{ id: 'weakened', rounds: 2 }], vfx: 'holy', fx: 0xfff0a0,
      desc: 'Once per battle. Light bursts from the medallion: every foe within 2 takes 1d6 + Wisdom (double against the undead) and is weakened.' } }),
  C({ id: 'golden_string', name: 'Golden Lute-string', kind: 'talisman', icon: 'note', tint: 0xffd870, rarity: 'uncommon', level: 2, price: 480,
    only: { classes: ['minstrel'] }, onlyText: 'Only a minstrel can make it sing',
    desc: 'A single string of spun gold. Plucked in battle, it plays the whole company\'s heartbeat, only faster.', effects: [],
    ability: { name: 'Quickstep Reel', icon: 'note', target: 'allAllies', perBattle: 1, free: true, statuses: [{ id: 'hasted', rounds: 2, power: 1 }, { id: 'blessed', rounds: 2, power: 1 }], vfx: 'song', fx: 0xffd870,
      desc: 'Free action, once per battle. A wild reel: every companion moves a square further and gains +1 to hit for two turns.' } }),
  C({ id: 'shadowsilk_mask', name: 'Shadow-silk Mask', kind: 'relic', icon: 'mask', tint: 0x8a80a8, rarity: 'rare', level: 3, price: 600,
    only: { classes: ['burglar'] }, onlyText: 'Only a burglar knows how to vanish into it',
    desc: 'A half-mask of grey silk. Foes forget you were ever there — until you are behind them.',
    effects: [{ type: 'onStart', status: 'hidden', rounds: 2, who: 'self' }, { type: 'bonus', stat: 'crit', power: 1 }] }),
  C({ id: 'hawk_eye', name: 'Hawk\'s-eye Pendant', kind: 'amulet', icon: 'eye', tint: 0xd8a850, rarity: 'uncommon', level: 2, price: 420,
    only: { classes: ['ranger'] }, onlyText: 'Only a ranger can see through the hawk\'s eye',
    desc: 'A hawk\'s eye of amber. Look through it, and the far hills come near.',
    effects: [{ type: 'bonus', stat: 'hit', power: 1 }, { type: 'sight', power: 2 }, { type: 'forage', pct: 1 }] }),
  C({ id: 'shieldwall_torc', name: 'Torc of the Shield-wall', kind: 'amulet', icon: 'torc', tint: 0xc8ccd4, rarity: 'uncommon', level: 3, price: 450,
    only: { classes: ['warrior', 'paladin'] }, onlyText: 'Only one sworn to the front rank can close the torc',
    desc: 'A heavy iron neck-ring, worn by those who stand where the blows fall thickest.', effects: [{ type: 'bonus', stat: 'ac', power: 1 }, { type: 'bonus', stat: 'hp', power: 6 }] }),
  C({ id: 'forgespark_amulet', name: 'Forge-spark Amulet', kind: 'amulet', icon: 'anvil', tint: 0xffa058, rarity: 'uncommon', level: 3, price: 420,
    only: { classes: ['runesmith'] }, onlyText: 'Only a runesmith can stoke its spark',
    desc: 'A tiny anvil of red-gold that rings like a bell whenever its wearer strikes.',
    effects: [{ type: 'onHit', status: 'stunned', rounds: 1, chance: 0.2, melee: true }, { type: 'resist', status: 'burning', chance: 1 }] }),
  // (isles)
  C({ id: 'coral_charm', name: 'Red Coral Charm', kind: 'amulet', icon: 'coral', tint: 0xf06a5a, rarity: 'uncommon', level: 2, price: 220,
    desc: 'A twist of blood-red coral on a cord. Divers of the isles swear it keeps the sea\'s stings away — and it cuts whoever grabs you.',
    effects: [{ type: 'resist', status: 'poisoned', chance: 0.5 }, { type: 'thorns', dmg: '1d4' }] }),
  C({ id: 'jade_idol', name: 'Jade Idol', kind: 'relic', icon: 'idol', tint: 0x5ad89a, rarity: 'rare', level: 4, price: 760,
    desc: 'A thumb-high god of green jade, squatting, smiling as if it knows something. Curses slide off whoever carries it, and the mind stays clear.',
    effects: [{ type: 'resist', status: 'weakened', chance: 1 }, { type: 'resist', status: 'charmed', chance: 1 }, { type: 'regen', mp: 1 }] }),
  // legends
  C({ id: 'seers_eye', name: 'Eye of the Seer', kind: 'orb', icon: 'eye', tint: 0x98f4ff, rarity: 'legendary', level: 6, price: 1450,
    desc: 'A crystal eye that sees what was, what is, and where you left your keys.',
    effects: [{ type: 'trueSight' }, { type: 'dowse', radius: 8 }, { type: 'sight', power: 3, light: 3 }] }),
  C({ id: 'phial_of_morning', name: 'Phial of Morning', kind: 'lantern', icon: 'phial', tint: 0xfff8d8, rarity: 'legendary', level: 6, price: 1200,
    desc: 'Light caught from the first dawn, stoppered in crystal. Things of shadow cannot bear to look upon it.',
    say: 'Light floods from {who}\'s phial — the foes shrink from it!',
    effects: [{ type: 'sight', light: 4 }, { type: 'onStart', status: 'weakened', rounds: 2, who: 'foes' }] }),
  C({ id: 'dragons_eye', name: 'Dragon\'s-eye Amulet', kind: 'amulet', icon: 'eye', tint: 0xff5a30, rarity: 'legendary', level: 8, price: 2600,
    desc: 'The eye of a great dragon, cut and set in red gold. It still sees — and it still burns.',
    say: 'The dragon\'s eye on {who}\'s breast opens, and the company stands in its glare!',
    effects: [{ type: 'onStart', status: 'shielded', power: 2, rounds: 3, who: 'party' }, { type: 'resist', status: 'afraid', chance: 1, who: 'party' }, { type: 'resist', status: 'burning', chance: 1 }],
    ability: { name: 'Dragon\'s Wrath', icon: 'fire', target: 'tile', range: 6, radius: 1, damage: '4d6', stat: 'int', perBattle: 1, statuses: [{ id: 'burning', rounds: 2 }], vfx: 'fire', fx: 0xff5010,
      desc: 'Once per battle. The eye opens: dragonfire bursts on a square within 6, searing every foe on and around it (4d6 + Intellect) and setting them alight.' } }),
];

export const ITEMS = [
  // weapons
  { id: 'dagger', name: 'Dagger', type: 'weapon', wkind: 'dagger', dmg: '1d4', hit: 1, range: 1, price: 12, model: 'dagger', desc: 'A long knife. Quick and easily hidden.' },
  { id: 'short_sword', name: 'Short Sword', type: 'weapon', wkind: 'blade', dmg: '1d6', hit: 0, range: 1, price: 35, model: 'sword', desc: 'A soldier\'s sidearm.' },
  { id: 'long_sword', name: 'Long Sword', type: 'weapon', wkind: 'blade', dmg: '1d8', hit: 0, range: 1, price: 140, model: 'sword', desc: 'The blade of knights and captains.' },
  { id: 'great_sword', name: 'Great Sword', type: 'weapon', wkind: 'greatblade', dmg: '2d6', hit: 0, range: 1, twoHanded: true, price: 760, model: 'greatsword', desc: 'A two-handed blade as tall as a dwarf.' },
  { id: 'hand_axe', name: 'Hand Axe', type: 'weapon', wkind: 'axe', dmg: '1d6', hit: 0, range: 1, price: 30, model: 'axe', desc: 'A woodsman\'s axe, light enough for a ranger.' },
  { id: 'battle_axe', name: 'Battle Axe', type: 'weapon', wkind: 'axe', dmg: '1d10', hit: 0, range: 1, twoHanded: true, heavy: true, price: 580, model: 'axe', desc: 'Favoured by dwarven warriors. A heavy weapon: only those trained in heavy weapons wield it well.' },
  { id: 'mace', name: 'Mace', type: 'weapon', wkind: 'blunt', dmg: '1d6+1', hit: 0, range: 1, price: 45, model: 'mace', desc: 'A flanged iron club.' },
  { id: 'warhammer', name: 'Warhammer', type: 'weapon', wkind: 'blunt', dmg: '1d8+1', hit: 0, range: 1, price: 240, model: 'hammer', desc: 'Breaks shields and bones alike.' },
  { id: 'quarterstaff', name: 'Quarterstaff', type: 'weapon', wkind: 'staff', dmg: '1d6', hit: 1, range: 1, price: 10, model: 'staff', desc: 'A stout walking staff of ash.' },
  { id: 'spear', name: 'Spear', type: 'weapon', wkind: 'spear', dmg: '1d8', hit: 1, range: 1, price: 110, model: 'spear', desc: 'Long reach and a keen point.' },
  { id: 'sling', name: 'Sling', type: 'weapon', wkind: 'sling', dmg: '1d4', hit: 0, range: 4, price: 12, model: 'sling', desc: 'Stones flung at range.' },
  { id: 'short_bow', name: 'Short Bow', type: 'weapon', wkind: 'bow', dmg: '1d6', hit: 0, range: 5, price: 60, model: 'bow', desc: 'A hunter\'s bow.' },
  { id: 'long_bow', name: 'Long Bow', type: 'weapon', wkind: 'bow', dmg: '1d8', hit: 1, range: 7, price: 180, model: 'bow', desc: 'A tall bow of yew with a long reach.' },
  { id: 'crossbow', name: 'Crossbow', type: 'weapon', wkind: 'crossbow', dmg: '1d10', hit: 1, range: 6, price: 220, model: 'crossbow', desc: 'Slow to wind, deadly to receive.' },
  { id: 'elven_bow', magical: true, glow: 0xb8ffb0, unique: true, name: 'Elven Bow', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 3, range: 8, price: 900, model: 'bow', desc: 'Strung with elven hair; its arrows sing.' },
  { id: 'ember_bow', unique: true, name: 'Ember Bow', type: 'weapon', wkind: 'bow', dmg: '1d8+2', hit: 1, range: 7, price: 900, model: 'bow', glow: 0xff8030, desc: 'Red-lacquered horn; its arrows kindle in flight.' },
  { id: 'shadow_fang', name: 'Shadow Fang', type: 'weapon', wkind: 'dagger', dmg: '1d6+2', hit: 3, range: 1, price: 600, model: 'dagger', glow: 0x9a70ff, desc: 'A black blade that drinks the light. Finds the gaps in any armour.' },
  { id: 'runeblade', unique: true, name: 'Runeblade', type: 'weapon', wkind: 'blade', dmg: '1d10+2', hit: 2, range: 1, price: 1400, model: 'sword', glow: 0x60e0ff, desc: 'A dwarf-forged sword etched with glowing runes. Bane of evil things.' },
  { id: 'dwarf_axe', magical: true, glow: 0xffb060, name: 'Dwarven Axe', type: 'weapon', wkind: 'axe', dmg: '1d12+1', hit: 1, range: 1, twoHanded: true, heavy: true, price: 1000, model: 'axe', desc: 'Forged deep beneath the mountains.' },
  // (isles)
  { id: 'hookblade', name: 'Hookblade', type: 'weapon', wkind: 'blade', dmg: '1d8+1', hit: 1, range: 1, price: 240, model: 'sword', weaponColor: 0x9aa0a8,
    desc: 'A heavy, forward-curved blade with a hooked tip, made for cutting a road through the creepers — and for whatever waits on the road.' },
  { id: 'staff_of_power', unique: true, name: 'Staff of Power', type: 'weapon', wkind: 'staff', dmg: '1d8+2', hit: 2, range: 1, price: 1200, model: 'staff', glow: 0xff80ff, desc: 'A wizard\'s staff crowned with a star-stone.' },
  // armour
  { id: 'robe', name: 'Robe', type: 'armor', weight: 'cloth', ac: 1, price: 12, desc: 'Woven wool, warm but thin.' },
  { id: 'leather_armor', name: 'Leather Armour', type: 'armor', weight: 'leather', ac: 2, price: 40, desc: 'Boiled and oiled leather.' },
  { id: 'studded_leather', name: 'Studded Leather', type: 'armor', weight: 'leather', ac: 3, price: 110, desc: 'Leather set with iron rivets.' },
  // (tactics) mail and plate trade a little armour for soak (ARMOR_SOAK: 1 and
  // 2 off every blow that lands), so a knight is struck as often as before
  // the curve flattened, but shrugs off a swarm of rats
  { id: 'chain_mail', name: 'Chain Mail', type: 'armor', weight: 'chain', ac: 3, price: 200, desc: 'A shirt of interlocking rings.' },
  { id: 'scale_mail', name: 'Scale Mail', type: 'armor', weight: 'chain', ac: 4, price: 420, desc: 'Overlapping steel scales.' },
  { id: 'plate_armor', name: 'Plate Armour', type: 'armor', weight: 'plate', ac: 5, price: 900, desc: 'Full harness of steel.' },
  { id: 'truesilver_mail', magical: true, glow: 0xd8ecff, unique: true, name: 'Truesilver Mail', type: 'armor', weight: 'chain', ac: 6, price: 2200, desc: 'Light as silk, hard as dragon-scale.' },
  { id: 'elven_cloak', magical: true, glow: 0xa8f0c0, name: 'Elven Cloak', type: 'armor', weight: 'cloth', ac: 3, price: 650, desc: 'Grey-green and shimmering; the eye slides off it.' },
  { id: 'lizardhide', name: 'Lizardhide Armour', type: 'armor', weight: 'leather', ac: 3, price: 240, effects: [{ type: 'resist', status: 'poisoned', chance: 0.35 }],
    desc: 'Supple scaled hide of the great marsh lizards, light enough for the jungle\'s heat. It turns a little venom.' },
  { id: 'dragonscale', magical: true, glow: 0xff7050, name: 'Dragonscale Mail', type: 'armor', weight: 'chain', ac: 5, price: 1400, desc: 'Scales shed by a wyrm: hard as iron, light as leather.' },
  // (tactics II) shields block: a chance to turn aside a blow that would land
  // (not one from behind), traded for flat armour, so plate, a kite shield and
  // talents of armour no longer stack into a knight no one can touch
  { id: 'buckler', name: 'Buckler', type: 'shield', ac: 0, block: 0.1, price: 30, desc: 'A small round shield.' },
  { id: 'kite_shield', name: 'Kite Shield', type: 'shield', ac: 0, block: 0.2, price: 150, desc: 'A tall knight\'s shield.' },
  // consumables
  { id: 'healing_draught', name: 'Healing Draught', type: 'consumable', effect: 'heal', power: '2d8+2', price: 35, combat: true, desc: 'A bitter green draught that knits wounds.' },
  { id: 'greater_draught', name: 'Greater Draught', type: 'consumable', effect: 'heal', power: '4d8+6', price: 100, combat: true, desc: 'A potent restorative.' },
  { id: 'antidote', name: 'Antidote', type: 'consumable', effect: 'cure', price: 20, combat: true, desc: 'Draws poison from the blood.' },
  // (each refills one kind of pool: a sorcerer's mana is not a cleric's faith)
  { id: 'mana_tonic', name: 'Mana Tonic', type: 'consumable', effect: 'mp', pool: ['arcane'], power: '2d6+2', price: 55, combat: true, desc: 'A blue, fizzing draught that refills a sorcerer\'s mana.' },
  { id: 'votive_candle', name: 'Votive Candle', type: 'consumable', effect: 'mp', pool: ['divine'], power: '2d6+2', price: 55, combat: true, icon: 'torch', tint: 'fire',
    desc: 'A blessed beeswax candle. Lit and prayed over, it renews a cleric\'s or paladin\'s Faith.' },
  { id: 'larks_honey', name: 'Lark\'s Honey', type: 'consumable', effect: 'mp', pool: ['song'], power: '2d6+2', price: 55, combat: true, icon: 'drop', tint: 'food',
    desc: 'Wild honey from the meadows where larks nest. A spoonful soothes the throat and brings back an elven singer\'s Voice.' },
  { id: 'phoenix_feather', name: 'Phoenix Feather', type: 'consumable', effect: 'revive', price: 450, combat: true, desc: 'Brings a fallen companion back from the brink.' },
  { id: 'torch', name: 'Torch', type: 'consumable', effect: 'light', power: '100', price: 4, combat: false, desc: 'Pitch-soaked; lights the dark places for a while.' },
  { id: 'rations', name: 'Rations (x25)', type: 'consumable', effect: 'food', power: '25', price: 20, combat: false, desc: 'Waybread, salt meat and dried apples. Adds 25 food.' },
  { id: 'scroll_seeing', name: 'Scroll of Seeing', type: 'consumable', effect: 'reveal', price: 80, combat: false, desc: 'Reveals the lay of the land around you.' },
  { id: 'iron_key', name: 'Iron Key', type: 'key', price: 40, desc: 'Opens one locked door. Consumed on use.' },
  // reagents (icon and tint draw them in the pack and on the rune tablets)
  { id: 'moonpetal', name: 'Moonpetal', type: 'reagent', price: 5, icon: 'flower', tint: 0xe4e0ff, desc: 'A pale flower that blooms only by moonlight. Mending and purity.' },
  { id: 'ember_salt', name: 'Ember Salt', type: 'reagent', price: 6, icon: 'gem', tint: 0xff7a48, desc: 'Red crystals warm to the touch. Fire.' },
  { id: 'wyrmroot', name: 'Wyrmroot', type: 'reagent', price: 7, icon: 'root', tint: 0xc8925a, desc: 'A twisted root from old dragon-haunts. Raw power.' },
  { id: 'nightshade', name: 'Nightshade', type: 'reagent', price: 6, icon: 'berry', tint: 0xa070e0, desc: 'A deadly berry. Sleep and shadow.' },
  { id: 'silverdust', name: 'Silverdust', type: 'reagent', price: 8, icon: 'sparkle', tint: 0xdfe8f4, desc: 'Fine dust of truesilver. Warding and sight.' },
  { id: 'spidersilk', name: 'Spidersilk', type: 'reagent', price: 4, icon: 'thread', tint: 0xf2efe6, desc: 'Sticky thread from great spiders. Binding.' },
  // herbs: reagents of Herb-lore, gathered on the kinds of ground in forage
  { id: 'silverleaf', name: 'Silverleaf', type: 'reagent', price: 4, icon: 'leaf', tint: 0xb8e0b0, forage: ['forest', 'meadow'], desc: 'Soft grey-green leaves that close a wound. Grows in woods and meadows.' },
  { id: 'bitterwort', name: 'Bitterwort', type: 'reagent', price: 4, icon: 'herb', tint: 0x9cc840, forage: ['swamp'], desc: 'A foul marsh weed that draws out poison. Grows in swamps.' },
  { id: 'hawkweed', name: 'Hawkweed', type: 'reagent', price: 5, icon: 'flower', tint: 0xffc840, forage: ['hills', 'meadow'], desc: 'A yellow flower whose smoke sharpens the eye. Grows on hills and meadows.' },
  { id: 'puffcap', name: 'Puffcap', type: 'reagent', price: 6, icon: 'mushroom', tint: 0xd8b48a, forage: ['forest', 'swamp'], desc: 'A mushroom that bursts into choking spores. Grows in damp woods and swamps.' },
  { id: 'ironbark', name: 'Ironbark', type: 'reagent', price: 6, icon: 'bark', tint: 0xa07a50, forage: ['pines', 'hills'], desc: 'Bark of the hill-pine; its sap sets hard as horn. Found in pine woods and hills.' },
  // spell scrolls: copied into a spellbook, each teaches its spell for good
  { id: 'scroll_acid_arrow', name: 'Scroll: Acid Arrow', type: 'scroll', spell: 'acid_arrow', price: 130, desc: 'A spell in a cramped green hand, smelling of vinegar.' },
  { id: 'scroll_phantasm', name: 'Scroll: Phantasmal Terror', type: 'scroll', spell: 'phantasm', price: 160, desc: 'The ink seems to crawl when you are not looking at it.' },
  { id: 'scroll_vampiric', name: 'Scroll: Vampiric Touch', type: 'scroll', spell: 'vampiric_touch', price: 240, desc: 'Written in rust-brown ink. Best not to ask.' },
  { id: 'scroll_ice_storm', name: 'Scroll: Ice Storm', type: 'scroll', spell: 'ice_storm', price: 360, desc: 'Frost forms on the vellum as you unroll it.' },
  // charms (see CHARMS below): worn in the charm slot
  ...CHARMS,
];

// Enchanted gear does a little more than hit harder (older games gain these once)
export const GEAR_MAGIC = {
  elven_bow: { effects: [{ type: 'bonus', stat: 'init', power: 2 }] },
  ember_bow: { effects: [{ type: 'onHit', status: 'burning', rounds: 2, chance: 0.35 }] },
  shadow_fang: { effects: [{ type: 'bonus', stat: 'crit', power: 1 }] },
  runeblade: { effects: [{ type: 'resist', status: 'afraid', chance: 1 }] },
  dwarf_axe: { effects: [{ type: 'onHit', status: 'stunned', rounds: 1, chance: 0.15, melee: true }] },
  staff_of_power: { effects: [{ type: 'bonus', stat: 'mp', power: 4 }],
    ability: { name: 'Star-stone Flare', icon: 'sparkle', target: 'nearbyFoes', radius: 1, damage: '2d6', stat: 'int', perBattle: 1, statuses: [{ id: 'stunned', rounds: 1, chance: 0.3 }], vfx: 'arcane', fx: 0xff80ff,
      desc: 'Once per battle. The star-stone flares: every foe beside you takes 2d6 + Intellect and may be dazzled for a turn.' } },
  truesilver_mail: { effects: [{ type: 'resist', status: 'stunned', chance: 0.5 }, { type: 'resist', status: 'poisoned', chance: 0.5 }] },
  elven_cloak: { effects: [{ type: 'onStart', status: 'hidden', rounds: 1, who: 'self' }] },
  dragonscale: { effects: [{ type: 'resist', status: 'burning', chance: 1 }, { type: 'fireWalk' }] },
};
for (const it of ITEMS) if (GEAR_MAGIC[it.id]) Object.assign(it, JSON.parse(JSON.stringify(GEAR_MAGIC[it.id])));

// (market) What a shop sells, by theme: a merchant keeps a few things along a
// line of trade, not the whole list, so the company must look round the realm
// for an axe or a coat of plate. A shop follows its theme (World Data → Shop
// themes) unless the designer picks its wares by hand. Where a new town is
// built its shops take a fitting theme by its size and folk (styles: the
// kinds of settlement it suits, races: whose shops; coast: a coastal place's
// only), a different one from every other shop of that kind in the realm
// where it can. priceMod: the theme's own markup (a castle's armoury is dear,
// the militia's arms cheap). Humble places sell humble tiers; the dear tiers
// are found in castles, dwarf holds and big towns.
export const SHOP_KIND_NAMES = {
  weapons: 'Weapons', armor: 'Armour', provisions: 'Provisions', reagents: 'Reagents and herbs', scrolls: 'Scrolls and curios', mixed: 'A little of everything', charms: 'Charms',
};
export const SHOP_THEMES = [
  // weaponsmiths and bowyers
  { id: 'militia_arms', name: 'Militia Arms', kind: 'weapons', desc: 'spears, maces and slings for the village muster', priceMod: 0.9,
    items: ['dagger', 'sling', 'quarterstaff', 'short_sword', 'mace', 'spear'], styles: ['village', 'town'], races: ['human', 'hobbit'] },
  { id: 'blades', name: 'Blades', kind: 'weapons', desc: 'swords and daggers', items: ['dagger', 'short_sword', 'long_sword', 'great_sword'], styles: ['town', 'castle'], races: ['human'] },
  { id: 'axes_hammers', name: 'Axes & Hammers', kind: 'weapons', desc: 'dwarf-forged axes, maces and hammers', priceMod: 0.9,
    items: ['hand_axe', 'mace', 'warhammer', 'battle_axe', 'crossbow'], styles: ['dwarfgate', 'town'], races: ['dwarf'] },
  { id: 'bows_arrows', name: 'Bows & Arrows', kind: 'weapons', desc: 'bows, slings and crossbows', items: ['sling', 'short_bow', 'long_bow', 'crossbow'],
    styles: ['town', 'village', 'elfhall'], races: ['human', 'elf', 'hobbit'], roles: ['bowyer', 'weapons'] },
  { id: 'hunting_arms', name: 'Hunting Arms', kind: 'weapons', desc: 'a woodsman\'s axe, spear and bow', items: ['dagger', 'hand_axe', 'spear', 'short_bow', 'long_bow'],
    styles: ['village', 'town', 'elfhall'], races: ['human', 'elf', 'hobbit'], roles: ['bowyer', 'weapons'] },
  { id: 'elven_arms', name: 'Elven Arms', kind: 'weapons', desc: 'long bows of yew, and light, keen blades', items: ['dagger', 'short_sword', 'long_sword', 'spear', 'short_bow', 'long_bow'],
    styles: ['elfhall'], races: ['elf'], roles: ['bowyer', 'weapons'] },
  { id: 'boarding_arms', name: 'Boarding Arms', kind: 'weapons', desc: 'cutlasses, boarding-axes and crossbows', items: ['dagger', 'short_sword', 'long_sword', 'hand_axe', 'crossbow'],
    styles: ['town', 'village'], races: ['human', 'dwarf'], coast: true },
  { id: 'castle_armoury', name: 'Castle Armoury', kind: 'weapons', desc: 'arms for knights and men-at-arms, at a knight\'s price', priceMod: 1.1,
    items: ['long_sword', 'spear', 'warhammer', 'crossbow', 'battle_axe', 'great_sword'], styles: ['castle'], races: ['human', 'dwarf'] },
  // armourers
  { id: 'leatherwork', name: 'Leatherwork', kind: 'armor', desc: 'leather coats, jerkins and bucklers', items: ['robe', 'leather_armor', 'studded_leather', 'buckler'],
    styles: ['village', 'town', 'elfhall'], races: ['human', 'elf', 'hobbit'] },
  { id: 'second_hand', name: 'Second-hand Armour', kind: 'armor', desc: 'a bit of everything, none of it new — and cheap for it', priceMod: 0.85,
    items: ['robe', 'leather_armor', 'chain_mail', 'buckler', 'kite_shield'], styles: ['town', 'village'], races: ['human', 'hobbit'] },
  { id: 'mail_shields', name: 'Mail & Shields', kind: 'armor', desc: 'shirts of mail, scale and good shields', items: ['leather_armor', 'chain_mail', 'scale_mail', 'buckler', 'kite_shield'],
    styles: ['town', 'castle', 'dwarfgate'], races: ['human', 'dwarf'] },
  { id: 'plate_steel', name: 'Plate & Steel', kind: 'armor', desc: 'heavy mail and full plate, for those who can pay', priceMod: 1.1,
    items: ['chain_mail', 'scale_mail', 'plate_armor', 'kite_shield', 'tower_shield'], styles: ['castle', 'dwarfgate'], races: ['human', 'dwarf'] },
  { id: 'dwarf_mail', name: 'Dwarf-mail', kind: 'armor', desc: 'mail and plate of the deep forges, cheaper at the source', priceMod: 0.95,
    items: ['chain_mail', 'scale_mail', 'plate_armor', 'buckler', 'kite_shield'], styles: ['dwarfgate'], races: ['dwarf'] },
  // provisioners
  { id: 'village_stores', name: 'Stores', kind: 'provisions', desc: 'food for the road, torches and a few remedies', items: ['rations', 'torch', 'healing_draught', 'antidote', 'iron_key'],
    styles: ['village', 'town'] },
  { id: 'chandlery', name: 'Chandlery', kind: 'provisions', desc: 'ship\'s stores: biscuit, lamps, charts and keys', items: ['rations', 'torch', 'healing_draught', 'antidote', 'scroll_seeing', 'iron_key'],
    styles: ['town', 'village'], coast: true },
  { id: 'pilgrim_fare', name: 'Pilgrim Fare', kind: 'provisions', desc: 'plain food, candles and honey for the faithful', items: ['rations', 'healing_draught', 'votive_candle', 'larks_honey', 'antidote', 'torch'],
    styles: ['village', 'town', 'elfhall'] },
  { id: 'apothecary', name: 'Apothecary', kind: 'provisions', desc: 'draughts, tonics and cures — dear, and worth it', items: ['healing_draught', 'greater_draught', 'antidote', 'mana_tonic', 'votive_candle', 'larks_honey', 'phoenix_feather'],
    styles: ['town', 'castle'] },
  { id: 'delvers_supplies', name: 'Delving Supplies', kind: 'provisions', desc: 'what a delver takes underground: food, light, keys and draughts', items: ['rations', 'torch', 'iron_key', 'healing_draught', 'greater_draught', 'antidote'],
    styles: ['dwarfgate'], races: ['dwarf'] },
  // herbalists and reagent-sellers
  { id: 'herbs_simples', name: 'Herbs & Simples', kind: 'reagents', desc: 'herbs for remedies and a few common reagents', items: ['silverleaf', 'bitterwort', 'hawkweed', 'moonpetal', 'spidersilk', 'ember_salt'] },
  { id: 'rune_reagents', name: 'Rune-reagents', kind: 'reagents', desc: 'salts, roots and dusts for rune-craft', items: ['moonpetal', 'ember_salt', 'wyrmroot', 'nightshade', 'silverdust', 'spidersilk'], styles: ['town', 'castle', 'dwarfgate'] },
  { id: 'moon_garden', name: 'Moon Garden', kind: 'reagents', desc: 'flowers and herbs grown by moonlight', items: ['moonpetal', 'silverleaf', 'hawkweed', 'puffcap', 'nightshade', 'silverdust'], styles: ['elfhall', 'village'], races: ['elf', 'hobbit'] },
  // sages
  { id: 'scriptorium', name: 'Scriptorium', kind: 'scrolls', desc: 'spell scrolls copied fair, and a chart or two', items: ['scroll_seeing', 'scroll_acid_arrow', 'scroll_phantasm', 'owl_feather'] },
  { id: 'arcana', name: 'Arcana', kind: 'scrolls', desc: 'rare scrolls and curios of power', priceMod: 1.2, items: ['scroll_phantasm', 'scroll_vampiric', 'warding_mirror', 'star_ring', 'moonstone'], styles: ['castle', 'town'] },
  // merchants: a little of everything, and the curio-sellers
  { id: 'oddments', name: 'Oddments', kind: 'mixed', desc: 'a pedlar\'s pack of this and that', items: ['torch', 'rations', 'antidote', 'healing_draught', 'iron_key', 'lucky_acorn', 'tin_whistle'] },
  { id: 'trading_post', name: 'Trading Post', kind: 'mixed', desc: 'goods from every road in the realm', items: ['rations', 'torch', 'healing_draught', 'mana_tonic', 'scroll_seeing', 'worry_stone', 'copper_bangle'] },
  { id: 'trinkets', name: 'Trinkets', kind: 'charms', desc: 'humble charms, a little magic in each', items: ['lucky_acorn', 'worry_stone', 'tin_whistle', 'copper_bangle', 'glowworm_jar'] },
  { id: 'curios', name: 'Curios', kind: 'charms', desc: 'finer charms, and dear', priceMod: 1.25, items: ['rabbit_foot', 'hazel_twig', 'selkie_shell', 'owl_feather', 'thunder_egg', 'nettle_ring'] },
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
  // found only on scrolls (scroll: true): a wizard copies them into the spellbook
  { id: 'acid_arrow', name: 'Acid Arrow', system: 'arcane', level: 2, cost: 4, scroll: true, target: 'enemy', effect: 'damage', power: '2d4+2', range: 7, statuses: [{ id: 'poisoned', rounds: 3, power: 2 }], combat: true, field: false, fx: 0x9be070, desc: 'A hissing dart of acid that keeps on burning.' },
  { id: 'phantasm', name: 'Phantasmal Terror', system: 'arcane', level: 2, cost: 5, scroll: true, target: 'allEnemies', effect: 'fear', power: '3', chance: 0.5, combat: true, field: false, fx: 0xb080ff, desc: 'Each foe may see its worst nightmare, and flee.' },
  { id: 'vampiric_touch', name: 'Vampiric Touch', system: 'arcane', level: 3, cost: 6, scroll: true, target: 'enemy', effect: 'drain', power: '3d6', range: 2, combat: true, field: false, fx: 0x80ff90, desc: 'Steals a foe\'s life to mend the caster.' },
  { id: 'ice_storm', name: 'Ice Storm', system: 'arcane', level: 4, cost: 9, scroll: true, target: 'area', radius: 2, effect: 'damage', power: '3d6', range: 7, statuses: [{ id: 'slowed', rounds: 2 }], combat: true, field: false, fx: 0xb8ecff, desc: 'Hail and ice batter a wide area, slowing all caught in it.' },
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
  { id: 'rune_purity', name: 'Rune of Purity', system: 'runic', level: 1, cost: 0, reagents: ['moonpetal'], target: 'ally', effect: 'cure', combat: true, field: true, fx: 0xa0ffd0, desc: 'Cures poison.' },
  { id: 'rune_mending', name: 'Rune of Mending', system: 'runic', level: 1, cost: 0, reagents: ['moonpetal', 'spidersilk'], target: 'ally', effect: 'heal', power: '2d8+4', combat: true, field: true, fx: 0x80ffa0, desc: 'Strong healing.' },
  { id: 'rune_flame', name: 'Rune of Flame', system: 'runic', level: 1, cost: 0, reagents: ['ember_salt', 'wyrmroot'], target: 'area', radius: 1, effect: 'damage', power: '3d6', range: 6, combat: true, field: false, fx: 0xff7020, desc: 'A burst of rune-fire.' },
  { id: 'rune_binding', name: 'Rune of Binding', system: 'runic', level: 2, cost: 0, reagents: ['spidersilk', 'nightshade'], target: 'area', radius: 1, effect: 'sleep', power: '3', range: 6, combat: true, field: false, fx: 0xc0a0ff, desc: 'Foes are held fast.' },
  { id: 'rune_warding', name: 'Rune of Warding', system: 'runic', level: 2, cost: 0, reagents: ['silverdust', 'moonpetal'], target: 'allAllies', effect: 'shield', power: '2', duration: 8, combat: true, field: false, fx: 0xd0e0ff, desc: '+2 armour for the party.' },
  { id: 'rune_seeing', name: 'Rune of Seeing', system: 'runic', level: 2, cost: 0, reagents: ['silverdust', 'nightshade'], target: 'self', effect: 'reveal', combat: false, field: true, fx: 0xd0e0ff, desc: 'Reveals the land.' },
  { id: 'rune_thunder', name: 'Rune of Thunder', system: 'runic', level: 3, cost: 0, reagents: ['ember_salt', 'silverdust', 'wyrmroot'], target: 'allEnemies', effect: 'damage', power: '3d6', combat: true, field: false, fx: 0xe0e0ff, desc: 'Thunder breaks upon every foe.' },
  { id: 'rune_life', name: 'Rune of Life', system: 'runic', level: 4, cost: 0, reagents: ['moonpetal', 'wyrmroot', 'silverdust'], target: 'ally', effect: 'revive', combat: true, field: true, fx: 0xffffff, desc: 'Restores the fallen.' },
  // Elven Song
  { id: 'song_courage', name: 'Song of Courage', system: 'song', level: 1, cost: 3, target: 'allAllies', effect: 'bless', power: '2', duration: 6, combat: true, field: false, fx: 0x8affc0, desc: 'The party fights with fresh heart (+2 to hit).' },
  { id: 'lullaby', name: 'Lullaby', system: 'song', level: 1, cost: 4, target: 'allEnemies', effect: 'sleep', power: '2', chance: 0.55, combat: true, field: false, fx: 0xc0a0ff, desc: 'Each foe may drowse off for a time.' },
  { id: 'song_rest', name: 'Song of Rest', system: 'song', level: 2, cost: 4, target: 'allAllies', effect: 'heal', power: '1d6+1', combat: true, field: true, fx: 0x80ffa0, desc: 'A gentle song that eases wounds.' },
  { id: 'dirge', name: 'Dirge of Dread', system: 'song', level: 3, cost: 6, target: 'allEnemies', effect: 'fear', power: '3', chance: 0.6, combat: true, field: false, fx: 0x9060a0, desc: 'Foes may flee in terror.' },
  { id: 'song_stars', name: 'Song of the Stars', system: 'song', level: 3, cost: 5, target: 'self', effect: 'light', power: '250', combat: false, field: true, fx: 0xe0f0ff, desc: 'Starlight gathers about the party.' },
  { id: 'ballad_heroes', name: 'Ballad of Heroes', system: 'song', level: 4, cost: 9, target: 'allAllies', effect: 'shield', power: '3', duration: 8, combat: true, field: false, fx: 0xffe080, desc: '+3 armour for the whole party.' },
  { id: 'song_doom', name: 'Song of Doom', system: 'song', level: 5, cost: 14, target: 'allEnemies', effect: 'damage', power: '3d8', combat: true, field: false, fx: 0xa0ffe0, desc: 'A terrible chord that shatters foes.' },
  // Herb-lore: a ranger's remedies, each using up its herbs
  { id: 'poultice', name: 'Poultice', system: 'herbal', level: 1, cost: 0, reagents: ['silverleaf'], target: 'ally', effect: 'heal', power: '1d8+3', combat: true, field: true, fx: 0x9fe08a, desc: 'Silverleaf bound over a wound.' },
  { id: 'antidote_brew', name: 'Antidote Brew', system: 'herbal', level: 1, cost: 0, reagents: ['bitterwort'], target: 'ally', effect: 'cure', combat: true, field: true, fx: 0xa8e070, desc: 'Bitterwort steeped hot. Draws out poison.' },
  { id: 'hunters_mark', name: 'Hunter\'s Mark', system: 'herbal', level: 1, cost: 0, reagents: ['hawkweed'], target: 'self', effect: 'bless', power: '3', duration: 8, combat: true, field: false, fx: 0xffc840, desc: 'Hawkweed smoke sharpens the eye: +3 to hit for a while.' },
  { id: 'smoke_pouch', name: 'Smoke Pouch', system: 'herbal', level: 2, cost: 0, reagents: ['puffcap'], target: 'area', radius: 1, effect: 'sleep', power: '2', chance: 0.75, range: 5, combat: true, field: false, fx: 0xd8c8a0, desc: 'A burst of puffcap spores: foes choke and drowse.' },
  { id: 'barkskin', name: 'Bark-skin', system: 'herbal', level: 2, cost: 0, reagents: ['ironbark'], target: 'ally', effect: 'shield', power: '3', duration: 6, combat: true, field: false, fx: 0xc09a60, desc: 'Ironbark sap hardens the skin: +3 armour.' },
  { id: 'woodland_salve', name: 'Woodland Salve', system: 'herbal', level: 3, cost: 0, reagents: ['silverleaf', 'ironbark'], target: 'allAllies', effect: 'heal', power: '1d6+2', combat: true, field: true, fx: 0x9fe08a, desc: 'A salve for the whole company.' },
  // Innate (monsters)
  { id: 'fire_breath', name: 'Fire Breath', system: 'innate', level: 1, cost: 0, target: 'area', radius: 1, effect: 'damage', power: '3d6', range: 5, combat: true, field: false, fx: 0xff5010, desc: 'A gout of flame.' },
  { id: 'drain_life', name: 'Drain Life', system: 'innate', level: 1, cost: 0, target: 'enemy', effect: 'drain', power: '2d6', range: 4, combat: true, field: false, fx: 0x60ff80, desc: 'Steals the life of the living.' },
  { id: 'web', name: 'Web', system: 'innate', level: 1, cost: 0, target: 'enemy', effect: 'sleep', power: '2', range: 4, combat: true, field: false, fx: 0xf0f0f0, desc: 'Sticky strands hold a foe fast.' },
];

const L = (o) => ({ kind: 'humanoid', ...o });

export const MONSTERS = [
  // (tactics II) vetName: what a seasoned band of the kind is called (rules.js veteranDef)
  { id: 'giant_rat', name: 'Giant Rat', plural: 'Giant Rats', vetName: 'Plague Rat', level: 1, hp: '2d4+2', ac: 10, hit: 2, dmg: '1d4+1', xp: 4, gold: '0', habitat: ['grass', 'dungeon', 'swamp', 'ruins'], group: [3, 6], poison: 0.1, ai: 'pack', moves: 4,
    look: { kind: 'quadruped', color: 0x4e3a2e, scale: 0.72, tail: 'long', long: 0.45 }, desc: 'A rat the size of a dog.' },
  // (tactics) the commonest first foes strike a little less surely and less hard (were +4, 1d6+2)
  { id: 'wolf', name: 'Wolf', plural: 'Wolves', vetName: 'Dire Wolf', vetPlural: 'Dire Wolves', level: 1, hp: '3d6+4', ac: 12, hit: 3, dmg: '1d6+1', xp: 8, gold: '0', habitat: ['grass', 'forest', 'hills', 'snow'], group: [2, 5], ai: 'pack', moves: 5,
    look: { kind: 'quadruped', color: 0x7a7470 }, desc: 'Grey wolves hunt in packs.' },
  { id: 'bat_swarm', name: 'Giant Bat', plural: 'Giant Bats', vetName: 'Vampire Bat', level: 1, hp: '2d4+2', ac: 13, hit: 3, dmg: '1d4+1', xp: 5, gold: '0', habitat: ['dungeon', 'swamp'], group: [3, 6], fly: true, speed: 2, ai: 'pack',
    look: { kind: 'bat', color: 0x3a2a2a, scale: 1.2 }, desc: 'Leathery wings in the dark.' },
  { id: 'goblin', name: 'Goblin', plural: 'Goblins', level: 1, hp: '2d6+4', ac: 12, hit: 3, dmg: '1d6+1', xp: 7, gold: '1d6', habitat: ['hills', 'forest', 'dungeon'], group: [3, 6], ai: 'coward', fleeAt: 0.3, escort: [{ id: 'goblin_shaman', min: 0, max: 1 }],
    look: L({ race: 'goblin', body: 0x5a4a2a, weapon: 'dagger' }), desc: 'Small, cruel and cowardly — except in numbers.' },
  // (combat stream) a support caster so that goblin bands are worth thinking about
  { id: 'goblin_shaman', name: 'Goblin Shaman', plural: 'Goblin Shamans', vetName: 'Goblin Elder', level: 2, hp: '2d6', ac: 11, hit: 1, dmg: '1d4', xp: 12, gold: '1d8', habitat: [], group: [1, 1], ai: 'caster', abilities: ['mend', 'hex'],
    look: L({ race: 'goblin', body: 0x5a2a4a, robe: true, hat: 'hood', hatColor: 0x6a2a50, weapon: 'staff', weaponGlow: 0x80ff60, pose: 'cast' }), desc: 'A wizened goblin hung with bones, who patches up its kin and curses their foes.' },
  { id: 'bandit', name: 'Bandit', plural: 'Bandits', level: 2, hp: '4d8+6', ac: 13, hit: 5, dmg: '1d8+2', xp: 14, gold: '3d6', habitat: ['grass', 'forest'], group: [2, 4], fleeAt: 0.25, ai: 'coward',
    look: L({ race: 'human', body: 0x3a3028, hat: 'hood', hatColor: 0x2a2420, weapon: 'sword' }), desc: 'Outlaws who prey on travellers.' },
  { id: 'orc', name: 'Orc', plural: 'Orcs', level: 2, hp: '4d8+6', ac: 13, hit: 6, dmg: '1d8+3', xp: 16, gold: '2d6', habitat: ['hills', 'forest', 'grass', 'ash', 'dungeon'], group: [2, 5], ai: 'brute', escort: [{ id: 'orc_archer', min: 0, max: 1 }],
    look: L({ race: 'orc', body: 0x3a2a24, armor: 'leather', weapon: 'axe', pose: 'overhead' }), desc: 'Servants of the Shadow, bred for war.' },
  { id: 'orc_archer', name: 'Orc Archer', plural: 'Orc Archers', vetName: 'Orc Bowmaster', level: 2, hp: '3d8+4', ac: 12, hit: 5, dmg: '1d8+2', range: 5, xp: 16, gold: '2d6', habitat: ['hills', 'ash'], group: [2, 3], ai: 'archer',
    look: L({ race: 'orc', body: 0x4a3a24, weapon: 'bow', fletch: 0x1a1a1a }), desc: 'Orcs with black-feathered arrows.' },
  { id: 'giant_spider', name: 'Giant Spider', plural: 'Giant Spiders', vetName: 'Elder Spider', level: 3, hp: '8d8+4', ac: 13, hit: 7, dmg: '1d10+3', poison: 0.4, xp: 24, gold: '0', habitat: ['forest', 'dungeon'], group: [1, 3], spells: ['web'], castChance: 0.25,
    look: { kind: 'spider', color: 0x2a2424, mark: 0xa02020, scale: 1.2 }, desc: 'Bloated spiders with venomous fangs.' },
  { id: 'skeleton', name: 'Skeleton', plural: 'Skeletons', level: 3, hp: '7d8+8', ac: 13, hit: 7, dmg: '1d10+3', undead: true, sleepImmune: true, xp: 20, gold: '1d10', habitat: ['dungeon', 'ruins'], group: [2, 5],
    moves: 3, look: L({ race: 'skeleton', weapon: 'sword', shield: 0x5a4a3a, eyes: 0xff5030 }), desc: 'Bones bound by an evil will.' },
  { id: 'warg', name: 'Warg', plural: 'Wargs', vetName: 'Great Warg', level: 3, hp: '7d8+10', ac: 13, hit: 7, dmg: '1d10+4', xp: 28, gold: '0', habitat: ['hills', 'grass', 'snow', 'ash'], group: [2, 4], ai: 'pack', moves: 5, abilities: ['pounce'],
    look: { kind: 'quadruped', color: 0x3a3430, spikes: true, scale: 1.35, eyes: 0xffd040 }, desc: 'Great evil wolves, ridden by orcs.' },
  { id: 'bog_lurker', name: 'Bog Lurker', plural: 'Bog Lurkers', vetName: 'Elder Lurker', level: 3, hp: '9d8', ac: 11, hit: 7, dmg: '1d10+3', poison: 0.3, xp: 26, gold: '1d8', habitat: ['swamp'], group: [1, 3], abilities: ['engulf'],
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
  // (isles) the folk and beasts of the tropical isles: their habitats are the
  // isles' own (jungle, beach, temple, reef), so they keep to that land
  { id: 'giant_frog', name: 'Giant Frog', plural: 'Giant Frogs', vetName: 'Bull Frog', level: 1, hp: '2d8+2', ac: 11, hit: 3, dmg: '1d6+1', xp: 7, gold: '0', habitat: ['jungle'], group: [2, 4], beast: true, ai: 'brute', moves: 4, poison: 0.15,
    abilities: ['tongue_lash'], look: { kind: 'frog', color: 0x5aa83a, belly: 0xe8d870, spots: 0x2a4a1a, scale: 1.35 }, desc: 'A frog as big as a pig, with a tongue that reaches further than you would like.' },
  { id: 'jungle_cat', name: 'Jungle Cat', plural: 'Jungle Cats', vetName: 'Scarred Jungle Cat', level: 2, hp: '4d6+4', ac: 13, hit: 5, dmg: '1d8+2', xp: 18, gold: '0', habitat: ['jungle'], group: [1, 2], beast: true, ai: 'pack', moves: 5,
    abilities: ['pounce'], look: { kind: 'cat', color: 0xd89a3a, spots: 0x3a2414, scale: 1.2 }, desc: 'A spotted cat that drops from the boughs without a sound.' },
  { id: 'lizardfolk', name: 'Lizardfolk', plural: 'Lizardfolk', level: 2, hp: '4d8+6', ac: 13, hit: 5, dmg: '1d8+2', xp: 16, gold: '2d6', habitat: ['jungle', 'temple', 'beach'], group: [2, 4], ai: 'brute',
    escort: [{ id: 'lizard_shaman', min: 0, max: 1 }],
    look: L({ race: 'lizard', body: 0x8a5a2a, weapon: 'spear', shield: 0x9a7a4a, pennant: 0xd8b040, crest: 0xd86a2a, pose: 'raise' }), desc: 'Scaled warriors of the swamps and ruins, who hunt with spear and hide shield.' },
  { id: 'lizard_shaman', name: 'Lizard Shaman', plural: 'Lizard Shamans', level: 3, hp: '3d8+3', ac: 12, hit: 3, dmg: '1d6', xp: 24, gold: '2d8', habitat: ['temple'], group: [1, 1], ai: 'caster',
    abilities: ['mend', 'venom_spit'],
    look: L({ race: 'lizard', skin: 0x4a8a6a, body: 0x6a3a6a, robe: true, mantle: 0x2a6a5a, weapon: 'staff', weaponGlow: 0x9be050, crest: 0x9a50d8, pose: 'cast' }), desc: 'A painted elder of the lizardfolk who speaks with the old gods — and spits their venom.' },
  { id: 'reef_shark', name: 'Reef Shark', plural: 'Reef Sharks', vetName: 'Great Reef Shark', level: 3, hp: '6d8+6', ac: 13, hit: 6, dmg: '2d4+3', xp: 30, gold: '0', habitat: ['reef'], group: [1, 3], beast: true, ai: 'brute', swim: true, moves: 5,
    abilities: ['shark_lunge', 'thrash'], look: { kind: 'shark', color: 0x6a7e8e, scale: 1.1 }, desc: 'Grey shadows in the clear water over the reef. Keep your feet out of it.' },
  { id: 'mist_wraith', name: 'Mist Wraith', plural: 'Mist Wraiths', level: 4, hp: '8d8+8', ac: 14, hit: 6, dmg: '1d8+3', undead: true, sleepImmune: true, xp: 60, gold: '2d10', habitat: ['temple', 'jungle'], group: [1, 3],
    spells: ['drain_life'], castChance: 0.35, ai: 'caster', abilities: ['wail'], fly: true,
    look: { kind: 'wraith', mist: true, color: 0x7a9a90, eyes: 0x9affd8 }, desc: 'A temple priest that would not die, drifting through the halls in a shroud of fog. Its touch drinks the warmth from you.' },
  { id: 'stone_guardian', name: 'Stone Guardian', plural: 'Stone Guardians', level: 5, hp: '10d10+20', ac: 17, hit: 7, dmg: '2d6+4', xp: 95, gold: '0', habitat: ['temple'], group: [1, 2], ai: 'brute', moves: 2, init: -4,
    hardened: 2, sleepImmune: true, poisonImmune: true, immune: ['afraid', 'poisoned', 'charmed', 'burning'], abilities: ['brutal_smash', 'taunt'],
    look: { kind: 'guardian', color: 0x767a66, glow: 0x60ffb0, scale: 1.12 }, desc: 'A temple statue that rises when trespassers pass: slow, and very hard to break (it shrugs off 2 of every blow).' },
  { id: 'sea_hag', name: 'Sea Hag', plural: 'Sea Hags', level: 6, hp: '12d8+12', ac: 13, hit: 6, dmg: '1d8+3', xp: 170, gold: '6d10', habitat: ['beach'], group: [1, 1], ai: 'caster',
    spells: ['drain_life'], castChance: 0.3, abilities: ['hag_curse', 'tidal_surge', 'mend'], escort: [{ id: 'giant_frog', min: 0, max: 2 }],
    look: L({ race: 'hag', body: 0x2e5a52, robe: true, scarf: 0x5a7a34, scale: 1.08, weapon: 'staff', weaponColor: 0x9a8a6a, weaponGlow: 0x60e0c0, pose: 'cast' }), desc: 'A crone of the tide-pools, hung with weed and shells, who curses ships and drowns sailors. Can stand as a boss.' },
  { id: 'naga', name: 'Naga', plural: 'Nagas', level: 7, hp: '16d8+24', ac: 16, hit: 9, dmg: '2d6+5', xp: 260, gold: '8d10', habitat: ['temple'], group: [1, 1], ai: 'brute', moves: 4,
    sleepImmune: true, abilities: ['constrict', 'tail_sweep', 'venom_spit'],
    look: { kind: 'naga', color: 0x2a8a7a, belly: 0xe8d890, skin: 0x5aa898, crown: 0xe2b24a, scale: 1.15 }, desc: 'Serpent below, warrior above: an ancient guardian of the temple-cities, spear in hand. Can stand as a boss.' },
  // called into battle by a runesmith's skill, never met in the wild (no habitat)
  { id: 'stone_warden', name: 'Stone Warden', plural: 'Stone Wardens', level: 4, hp: '6d10+12', ac: 16, hit: 5, dmg: '1d8+3', xp: 0, gold: '0', habitat: [], group: [1, 1], ai: 'brute', moves: 3,
    abilities: ['taunt'], sleepImmune: true, poisonImmune: true,
    look: L({ race: 'dwarf', body: 0x8c8a82, skin: 0xa8a294, beard: 0x7a776e, armor: 'plate', hat: 'helm', hatColor: 0x8c8a82, weapon: 'hammer', shield: 0x7a786e, runes: 0x5ee8ff, eyes: 0x5ee8ff, scale: 1.1 }),
    desc: 'A dwarf-shaped guardian of rune-carved granite, woken for a little while by a runesmith\'s craft.' },
];

// ---------------------------------------------------------------- travel
// Ground a monster is at home on: it crosses these at no more than a turn a
// step, where others pay the full cost of rough ground (terrain keys; editable
// per monster). Fliers and swimmers ignore the ground anyway.
export const MONSTER_NATIVE = {
  giant_rat: ['grass', 'meadow', 'swamp', 'ruins', 'cave_floor', 'dungeon_floor', 'rubble'],
  wolf: ['forest', 'pines', 'grass', 'meadow', 'snow'],
  goblin: ['hills', 'forest', 'cave_floor', 'rubble'],
  goblin_shaman: ['hills', 'forest', 'cave_floor'],
  bandit: ['forest', 'grass', 'meadow'],
  orc: ['hills', 'ash', 'rubble'],
  orc_archer: ['hills', 'ash'],
  giant_spider: ['forest', 'pines', 'web', 'cave_floor'],
  skeleton: ['ruins', 'dungeon_floor', 'bones'],
  warg: ['hills', 'snow', 'grass', 'ash'],
  bog_lurker: ['swamp'],
  orc_captain: ['hills', 'ash', 'rubble'],
  troll: ['hills', 'forest', 'pines', 'snow'],
  barrow_wight: ['ruins', 'swamp', 'bones'],
  dark_sorcerer: ['ash', 'ruins'],
  drake: ['ash', 'hills', 'lava'],
  // (isles)
  giant_frog: ['jungle', 'vines', 'mangrove', 'swamp'],
  jungle_cat: ['jungle', 'vines', 'palms'],
  lizardfolk: ['jungle', 'vines', 'mangrove', 'swamp', 'ruins_floor'],
  lizard_shaman: ['jungle', 'vines', 'mangrove', 'ruins_floor'],
  mist_wraith: ['jungle', 'vines', 'ruins_floor'],
  stone_guardian: ['ruins_floor'],
  sea_hag: ['palms', 'sand', 'mangrove', 'swamp'],
  naga: ['ruins_floor', 'jungle', 'mangrove'],
};
for (const m of MONSTERS) if (!m.native) m.native = (MONSTER_NATIVE[m.id] || []).slice();

// Where a monster has no list of its own, its habitats suggest one
export const HABITAT_TERRAIN = {
  grass: ['grass', 'meadow'], forest: ['forest', 'pines'], hills: ['hills'], swamp: ['swamp'], desert: ['sand', 'desert'],
  snow: ['snow'], ash: ['ash'], ruins: ['ruins'], dungeon: ['cave_floor', 'dungeon_floor', 'rubble'], town: ['cobble'], water: [],
  jungle: ['jungle', 'vines', 'mangrove'], beach: ['palms', 'sand'], temple: ['ruins_floor', 'vines'], reef: [],
};

// Heroes who know a kind of country cross it a little more easily: the share
// of the EXTRA cost of rough ground they save (0.25 = a quarter; the best
// guide in the company leads, and a hero's race and class add up to at most
// one half). A race or class in a game may carry its own "ease" instead.
export const TERRAIN_EASE = {
  races: {
    elf: { forest: 0.4, pines: 0.4 },
    dwarf: { hills: 0.4, snow: 0.25, rubble: 0.4 },
    hobbit: { hills: 0.25, swamp: 0.25 },
    halfling: { hills: 0.25, swamp: 0.25 },
  },
  classes: {
    ranger: { forest: 0.25, pines: 0.25, hills: 0.25, swamp: 0.25, snow: 0.25, sand: 0.25, desert: 0.25 },
  },
};

// XP needed to reach a given level (index = level)
export const XP_TABLE = [0, 0, 60, 170, 340, 580, 900, 1320, 1850, 2500, 3300, 4300, 5500, 7000, 8800, 11000, 13500, 16500, 20000, 24000, 28500];
export const MAX_LEVEL = XP_TABLE.length - 1;
