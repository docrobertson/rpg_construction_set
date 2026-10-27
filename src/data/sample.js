// The sample adventure: "Shadow over Eldmark". Built with the same stamps and
// generators the construction set uses, then hand-dressed with people and lore.
import { newGame, findStart } from './schema.js';
import { createMap, setTile, getTile, inBounds } from '../world/map.js';
import { STAMPS, PATHS, line4, placeFeature, generateDungeon, nameNpcs, defaultStock, npcLook } from '../world/generate.js';
import { T, terrain } from './terrain.js';
import { RNG } from '../core/rng.js';
import { uid, deterministicIds } from '../core/util.js';

export const SAMPLE_ID = 'sample_shadow_over_eldmark';

const kw = (key, text, extra = {}) => ({ key, text, ...extra });

export function buildSampleGame() {
  return deterministicIds(buildSample);
}

function buildSample() {
  const game = newGame({ blank: true, w: 96, h: 96 });
  game.id = SAMPLE_ID;
  game.meta = {
    ...game.meta,
    title: 'Shadow over Eldmark',
    author: 'The Realms Construction Set',
    description: 'A shadow stirs in the east. Gather a fellowship of Men, Elves and Dwarves, recover the stolen Rune-Key, and break the power of the Shadow Lord in his fortress of Dol Garoth.',
    intro: 'In the Elder Days the realm of Eldmark knew peace. Men tilled the green lands, the Elves sang beneath the boughs of Silverwood, and the Dwarves delved deep beneath the Grey Mountains.\n\nBut now a shadow has fallen. In the blasted lands beyond the Ashen Peaks, the fortress of Dol Garoth wakes, and its master — the Shadow Lord Malgrath — gathers orcs and worse things to his banner.\n\nYour company has come to the harbour town of Westhold. Seek out King Aldric in Caer Aldon to the north, for it is said he looks for heroes...',
    victoryText: 'With a cry that shakes the very stones, Malgrath the Shadow Lord is unmade. The darkness over Dol Garoth breaks, and for the first time in an age the sun shines upon the Ashen Peaks.\n\nThe bells of Caer Aldon ring for seven days. In the halls of Hammerdeep and beneath the boughs of Silverwood, songs are made of your deeds — and they are sung still.',
  };
  const S = game.settings;
  S.victory = { type: 'kill', target: 'shadow_lord' };
  S.startGold = 120;
  S.startFood = 90;

  // a unique quest item and a few treasures
  game.items.push(
    { id: 'rune_key', name: 'Rune-Key of Hammerdeep', type: 'quest', unique: true, price: 0, desc: 'A heavy key of black iron, its runes glowing faintly blue. It opens the gate of Dol Garoth.' },
    { id: 'kings_seal', name: 'Seal of Aldric', type: 'quest', unique: true, price: 0, desc: 'The royal seal of Caer Aldon. The dwarves will honour it.' },
  );

  const world = game.maps[0];
  world.name = 'Eldmark';
  world.tiles.fill(T.ocean);
  const w = world;
  const stamp = (k, x, y, r, seed) => STAMPS[k].apply(w, x, y, r, seed);
  const path = (k, pts, width = 1, seed = 1) => {
    const all = [];
    for (let i = 1; i < pts.length; i++) all.push(...line4(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    return PATHS[k].apply(w, all, width, seed);
  };

  // --- land
  stamp('island', 44, 50, 27, 11);
  stamp('island', 62, 40, 22, 12);
  stamp('island', 28, 30, 17, 13);
  stamp('island', 66, 64, 17, 14);
  stamp('island', 80, 56, 14, 15);
  stamp('island', 36, 70, 14, 16);
  stamp('island', 12, 82, 6, 17); // Isle of the Hermit
  stamp('clear', 40, 48, 6, 30);
  stamp('hills', 39, 46, 4, 31);
  stamp('meadow', 34, 50, 7, 3);
  stamp('meadow', 50, 32, 6, 4);
  // Grey Mountains in the north
  path('ridge', [[18, 20], [30, 15], [44, 13], [56, 16]], 2, 5);
  stamp('mountains', 30, 14, 5, 6);
  stamp('hills', 40, 20, 5, 7);
  // Silverwood
  stamp('pines', 70, 32, 8, 8);
  stamp('forest', 62, 26, 6, 9);
  stamp('forest', 76, 40, 5, 10);
  // Old forest near Westhold
  stamp('forest', 28, 40, 5, 21);
  // southern hills and barrow downs
  stamp('hills', 40, 70, 7, 22);
  stamp('swamp', 56, 72, 6, 23);
  // the Ashen Peaks and the blighted land of Dol Garoth
  stamp('blight', 84, 58, 9, 24);
  path('ridge', [[74, 44], [72, 52], [73, 56]], 1, 25);
  path('ridge', [[73, 61], [72, 66], [76, 72]], 1, 26);
  stamp('hills', 70, 58, 3, 27);
  // snowy north-east
  stamp('snow', 62, 18, 5, 28);
  // the river Eldwater
  path('river', [[50, 18], [51, 30], [53, 40], [52, 50], [54, 60], [55, 70], [57, 80], [58, 88]], 1);
  // roads
  path('road', [[24, 52], [34, 51], [44, 49], [52, 48], [60, 47], [68, 50], [71, 58], [78, 58]]);
  path('road', [[44, 49], [44, 38], [44, 30]]);
  path('road', [[60, 47], [64, 40], [68, 35]]);
  path('road', [[34, 51], [34, 60], [38, 66]]);
  path('road', [[44, 30], [36, 24], [32, 21]]);

  // --- places
  const westhold = placeFeature(game, w, 22, 52, 'town', 'Westhold', 101);
  const castle = placeFeature(game, w, 44, 28, 'castle', 'Caer Aldon', 102);
  const elves = placeFeature(game, w, 69, 33, 'elfhall', 'Lindaleth', 103);
  const dwarves = placeFeature(game, w, 32, 20, 'dwarfgate', 'Hammerdeep', 104);
  const village = placeFeature(game, w, 60, 56, 'village', 'Brookend', 105);
  // dungeons built by hand so we can dress them
  const barrow = addDungeon(game, w, 40, 72, 'cave', 'Grimholt Barrow', {
    seed: 201, style: 'cave', monsters: ['goblin', 'giant_rat', 'giant_spider', 'skeleton', 'bat_swarm'], boss: 'barrow_wight', rooms: 9,
  });
  const fortress = addDungeon(game, w, 84, 58, 'fortress', 'Dol Garoth', {
    seed: 202, style: 'fortress', monsters: ['orc', 'orc_archer', 'skeleton', 'orc_captain', 'dark_sorcerer'], boss: 'shadow_lord', rooms: 11, w: 40, h: 40,
  });
  const tower = addDungeon(game, w, 12, 82, 'tower', 'Tower of the Hermit', {
    seed: 203, style: 'crypt', monsters: ['skeleton', 'bat_swarm', 'giant_rat'], rooms: 5, w: 26, h: 26,
  });

  // the gate of Dol Garoth needs the Rune-Key
  const fp = w.entities.find((e) => e.type === 'portal' && e.target.map === fortress.map.id);
  fp.requires = 'rune_key';
  fp.lockedText = 'Great gates of black iron bar the way, sealed with a shadow-spell. There is a keyhole carved with dwarven runes...';

  // --- the Rune-Key lies in Grimholt's deepest chest
  barrow.chest.items = [{ id: 'rune_key', n: 1 }, { id: 'healing_draught', n: 2 }];
  barrow.chest.gold = '150';
  // the hermit's treasure
  tower.chest.items = [{ id: 'staff_of_power', n: 1 }, { id: 'phoenix_feather', n: 1 }];
  // the fortress hoard
  fortress.chest.items = [{ id: 'truesilver_mail', n: 1 }, { id: 'greater_draught', n: 3 }];
  fortress.chest.gold = '1000';

  // ship at Westhold harbour
  const dock = nearestWater(w, 20, 52);
  if (dock) w.entities.push({ id: 'ship_westhold', type: 'ship', x: dock.x, y: dock.y });
  // waygates: Lindaleth glade <-> Isle of the Hermit
  const wg1 = nearestWalkable(w, 74, 30), wg2 = nearestWalkable(w, 14, 80);
  w.entities.push({ id: 'waygate_silverwood', type: 'portal', style: 'waygate', x: wg1.x, y: wg1.y, label: 'Waygate', target: { map: w.id, x: wg2.x + 1, y: wg2.y } });
  w.entities.push({ id: 'waygate_isle', type: 'portal', style: 'waygate', x: wg2.x, y: wg2.y, label: 'Waygate', target: { map: w.id, x: wg1.x - 1, y: wg1.y } });
  // signs
  const sg = nearestWhere(w, 45, 50, (t) => t.walk && !t.water && !t.feature && t.key !== 'road' && t.key !== 'bridge');
  w.entities.push({ id: 'sign_cross', type: 'sign', x: sg.x, y: sg.y, text: 'West: Westhold.  North: Caer Aldon.  East: Silverwood and Brookend.  South: the Barrow Downs — beware!' });

  // placed monsters on the world
  const mon = (id, x, y, count, extra = {}) => {
    const p = nearestWalkable(w, x, y);
    w.entities.push({ id: uid('mon'), type: 'monster', monster: id, x: p.x, y: p.y, count, wander: 4, ...extra });
  };
  mon('orc', 70, 57, '3-5');
  mon('warg', 68, 62, '2-3');
  mon('troll', 44, 64, '1');
  mon('bandit', 38, 52, '2-3');
  mon('wolf', 30, 40, '3-4');
  mon('giant_spider', 72, 38, '2');
  mon('orc_captain', 78, 58, '1');
  mon('bog_lurker', 56, 72, '2');
  mon('drake', 62, 17, '1');

  // --- people
  dressWesthold(game, westhold);
  dressCastle(game, castle);
  dressElves(game, elves);
  dressDwarves(game, dwarves);
  dressVillage(game, village);
  dressTower(game, tower.map);

  // start on the road just east of Westhold
  const st = nearestWalkable(w, 25, 52);
  S.start = { map: w.id, x: st.x, y: st.y };
  w.encounterRate = 1;
  void findStart;
  return game;
}

function addDungeon(game, world, x, y, kind, name, opt) {
  const sub = placeFeature(game, world, x, y, kind, name, opt.seed);
  // replace the auto-generated dungeon with our tuned one
  const idx = game.maps.indexOf(sub);
  const { map, last } = generateDungeon({ ...opt, name });
  map.id = sub.id;
  map.exit = sub.exit;
  game.maps[idx] = map;
  const chest = map.entities.find((e) => e.type === 'chest' && e.x === last.cx && e.y === last.cy);
  return { map, chest };
}

function nearestWalkable(map, x, y) {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const t = terrain(getTile(map, nx, ny));
    if (t.walk && !t.feature && !t.water && !map.entities.some((e) => e.x === nx && e.y === ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

function nearestWhere(map, x, y, pred) {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    if (pred(terrain(getTile(map, nx, ny))) && !map.entities.some((e) => e.x === nx && e.y === ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

function nearestWater(map, x, y) {
  for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const t = terrain(getTile(map, nx, ny));
    if (t.ship) {
      // must be next to land so the party can board
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tt = terrain(getTile(map, nx + ax, ny + ay));
        if (tt.walk && !tt.water && !tt.feature) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function freeSpot(map, x, y) {
  for (let r = 0; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const t = terrain(getTile(map, nx, ny));
    if (t.walk && !t.door && !map.entities.some((e) => e.x === nx && e.y === ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

function byRole(map, role) { return map.entities.filter((e) => e.type === 'npc' && e.role === role); }

function addNpc(map, x, y, props) {
  const rng = new RNG(x * 31 + y);
  const p = freeSpot(map, x, y);
  const npc = {
    id: uid('npc'), type: 'npc', x: p.x, y: p.y, role: 'villager', wander: 2, keywords: [],
    look: npcLook(props.race || 'human', rng, props.lookExtra || {}),
    ...props,
  };
  delete npc.lookExtra;
  map.entities.push(npc);
  return npc;
}

function dressWesthold(game, map) {
  map.name = 'Westhold';
  const inn = byRole(map, 'inn')[0];
  if (inn) Object.assign(inn, { name: 'Tobin', desc: 'a round, red-faced innkeeper', greeting: 'Welcome to the Leaping Pony! Best beds this side of the Eldwater.', job: 'I keep the Leaping Pony. A ROOM for the night will set thee right.' });
  const bar = byRole(map, 'tavern')[0];
  if (bar) Object.assign(bar, { name: 'Maud', desc: 'a sharp-eyed barmaid', greeting: 'What\'ll it be, travellers?', job: 'I pour the ale and hear all the RUMOURS.' });
  {
    // Borin, the dwarf who would join
    const near = bar || inn || { x: 18, y: 18 };
    addNpc(map, near.x - 2, near.y + 2, {
      name: 'Borin', race: 'dwarf', role: 'villager', wander: 1, desc: 'a stout dwarf nursing a tankard',
      lookExtra: { body: 0x6a4a2a, armor: 'chain', hat: 'hornhelm', weapon: 'axe' },
      greeting: 'Hmph. Another band of would-be heroes?',
      job: 'I was a guard of HAMMERDEEP, till the goblins came and took the KEY on my watch. I drink to forget.',
      keywords: [
        kw('HAMMERDEEP', 'The great dwarf-hold beneath the Grey Mountains, north of here. King Durgan rules there.'),
        kw('KEY', 'The Rune-Key! Forged to seal the gates of Dol Garoth. Goblins stole it and fled south, to the barrow of GRIMHOLT. If thou art going after it... I would JOIN thee.'),
        kw('GRIMHOLT', 'An old barrow in the southern hills. Cursed, they say. Goblins nest there now — and worse.'),
      ],
      recruit: { race: 'dwarf', cls: 'warrior', level: 2, joinText: 'Ha! My axe is thine. Let us go and get that key back!', equip: ['battle_axe', 'chain_mail'] },
    });
  }
  const healer = byRole(map, 'healer')[0];
  if (healer) Object.assign(healer, { name: 'Sister Edith', desc: 'a kindly healer in white', greeting: 'Peace, travellers. Art thou hurt?' });
  const guards = byRole(map, 'guard');
  if (guards[0]) Object.assign(guards[0], { name: 'Garret', desc: 'a weary town guard', job: 'I guard the gate. ORCS have been seen on the east road.', keywords: [kw('ORCS', 'Foul things, out of the east, from the Ashen Peaks. They say a SHADOW drives them.'), kw('SHADOW', 'Talk to the King at Caer Aldon. North along the road. He\'ll know more than a gate guard.')] });
  addNpc(map, 17, 20, {
    name: 'Mayor Hilda', race: 'human', desc: 'the mayor of Westhold, wearing a chain of office',
    lookExtra: { body: 0x2a4a7a, robe: true, trim: 0xe0c040 },
    greeting: 'Ah, adventurers! Westhold is glad of thee.',
    job: 'I keep this town running, as best I can in these dark days. The KING has sent word he seeks heroes.',
    keywords: [
      kw('KING', 'King Aldric rules from CAER ALDON, north along the road past the crossroads. Go to him!'),
      kw('CAER ALDON', 'The king\'s castle, north of the crossroads. Thou canst not miss its towers.'),
      kw('SHIP', 'The harbourmaster has a ship that no one uses. Ask HARBOUR.'),
      kw('HARBOUR', 'Our little ship rides at anchor by the west wall. Take her if thou wilt — the Isle of the HERMIT lies south-west across the water.'),
      kw('HERMIT', 'An old wizard lives in a tower on an island to the south-west. Mad as a hatter, but wise.'),
      kw('GOLD', 'Times are hard. Still... take this for the road.', { once: true, action: { type: 'give_gold', n: 50 }, afterText: 'I have given all I can spare.' }),
    ],
  });
  addNpc(map, 9, 26, { name: 'Wynn', race: 'human', desc: 'a young shepherdess', greeting: 'Have ye seen my sheep?', job: 'I mind the sheep. WOLVES took three last week.', keywords: [kw('WOLVES', 'They come out of the old forest north of town. Hunt in packs, they do.')] });
  for (const e of byRole(map, 'villager')) if (!e.rumour) e.rumour = 'They say the dwarves of Hammerdeep lost something precious to goblins.';
  nameNpcs(map, game, 1);
  for (const n of byRole(map, 'tavern')) n.rumour = n.rumour || 'Old Borin in the corner used to guard the dwarves\' treasure. Buy him a drink and ask about the KEY.';
  addNpc(map, 6, 17, {
    name: 'Osric', desc: 'a fisherman mending his nets', wander: 1,
    job: 'I fish. Or did, before the SERPENT came.',
    rumour: 'A sea-monster has been sighted off the west coast. Mind thy ship!',
    keywords: [kw('SERPENT', 'A great sea-serpent haunts the western waters. Sail carefully!')],
  });
}

function dressCastle(game, map) {
  map.name = 'Caer Aldon';
  const king = byRole(map, 'lord')[0];
  Object.assign(king, {
    name: 'King Aldric', desc: 'King Aldric of Eldmark, grey-bearded and stern',
    greeting: 'Welcome, travellers. Thou comest at a dark hour.',
    job: 'I am King of Eldmark — while there is still an Eldmark to rule. A SHADOW grows in the east. I will HEAL thy wounds whenever thou dost return.',
    lookExtra: undefined,
    keywords: [
      kw('SHADOW', 'Malgrath, the Shadow Lord, has woken in DOL GAROTH beyond the Ashen Peaks. His orcs grow bolder by the day. Wilt thou take up this QUEST?'),
      kw('QUEST', 'Then hear me. The gate of Dol Garoth is sealed by sorcery. Only the Rune-KEY forged by the dwarves can open it. Take my SEAL to King Durgan of HAMMERDEEP, and he will aid thee.', { once: true, action: { type: 'give_item', value: 'kings_seal' }, afterText: 'Go! Take my seal to Hammerdeep, find the KEY, and break the Shadow.' }),
      kw('KEY', 'The Rune-Key was kept by the dwarves of Hammerdeep. I have heard troubling tales that it was STOLEN.'),
      kw('STOLEN', 'Ask the dwarves. Or that gloomy dwarf who drinks in Westhold\'s tavern.'),
      kw('DOL GAROTH', 'The black fortress in the blighted east. Follow the road east, through the pass in the Ashen Peaks. Its gates will not open without the KEY.'),
      kw('HAMMERDEEP', 'The dwarf-hold lies north-west, in the Grey Mountains. Follow the road north from here.'),
      kw('MAGIC', 'Speak with my sage, Merek. He knows the arts.'),
      kw('ELVES', 'The Elves of Silverwood keep to themselves, east of the river. Their lady is wise.'),
    ],
  });
  const sage = byRole(map, 'sage')[0];
  if (sage) Object.assign(sage, {
    name: 'Merek', desc: 'the royal sage, ink-stained and absent-minded',
    greeting: 'Hmm? Oh — visitors! Do mind the scrolls.',
    job: 'I study the four ARTS of MAGIC, and the stars.',
    keywords: [
      kw('ARTS', 'SORCERY, PRAYER, RUNE-CRAFT and SONG. Each draws on a different power.'),
      kw('MAGIC', 'Magic in Eldmark takes four forms: SORCERY, PRAYER, RUNE-CRAFT and SONG.'),
      kw('SORCERY', 'The art of wizards. It draws upon the Intellect and burns mana.'),
      kw('PRAYER', 'Clerics and paladins pray for miracles. Wisdom is their strength. Holy power sears the UNDEAD.'),
      kw('RUNE-CRAFT', 'The dwarves carve runes fuelled by REAGENTS — moonpetal, ember salt, wyrmroot and the like. No mana is needed, but each rune burns its reagents.'),
      kw('REAGENTS', 'Herbalists sell them. The dwarves of Hammerdeep surely do.'),
      kw('SONG', 'The elven minstrels sing songs that sway a whole battle. Lovely, and terribly dangerous.'),
      kw('UNDEAD', 'The Shadow Lord himself is no living thing. Holy magic and rune-forged steel will hurt him most. The dwarves forge RUNEBLADES...'),
      kw('RUNEBLADES', 'Swords etched with runes that burn the undead. King Durgan may part with one, if thou dost him a great service.'),
    ],
  });
  for (const g of byRole(map, 'guard')) { g.job = 'I serve the King.'; g.keywords = [kw('KING', 'The King sits on his throne at the north end of the great hall.')]; }
  nameNpcs(map, game, 2);
  for (const v of byRole(map, 'villager')) v.rumour = 'The King has not slept well since the orcs burned the farms at Brookend.';
}

function dressElves(game, map) {
  map.name = 'Lindaleth';
  addNpc(map, 15, 10, {
    name: 'Lady Ithilwen', race: 'elf', desc: 'the Lady of Silverwood, tall and shining', wander: 0,
    lookExtra: { body: 0xf0f0ff, robe: true, trim: 0xc0d0ff, hat: 'circlet', cape: 0xd0e0ff },
    greeting: 'Mae govannen. We have watched thy coming.',
    job: 'I keep the woods of Silverwood, as I have for three thousand years. The SHADOW is not new to me.',
    keywords: [
      kw('SHADOW', 'Malgrath fell once before, in the Elder Days. He was not slain — only bound. Steel will not finish him; he must be struck with RUNE and LIGHT together.'),
      kw('RUNE', 'The dwarves know rune-craft. Their runeblades bite deep into things of shadow.'),
      kw('LIGHT', 'Take this cloak, woven under starlight. May it turn the blades of thine enemies.', { once: true, action: { type: 'give_item', value: 'elven_cloak' }, afterText: 'Holy prayers and the light of the stars — those are thy weapons against him.' }),
      kw('WAYGATE', 'East of our glade stands a waygate of the Elder Days. It leads to the Isle of the HERMIT.'),
      kw('HERMIT', 'Fennick is his name. A wizard of Men, and stranger than most. He knows much.'),
      kw('ELWEN', 'My niece, the ranger. She longs to see the world of Men. Speak with her.'),
    ],
  });
  addNpc(map, 20, 18, {
    name: 'Elwen', race: 'elf', desc: 'a keen-eyed elven ranger',
    lookExtra: { body: 0x3a6a3a, hat: 'hood', hatColor: 0x2a5a2a, weapon: 'bow', cape: 0x2a4a2a },
    greeting: 'Well met, strangers!',
    job: 'I guard the borders of Silverwood. The SPIDERS grow bold.',
    keywords: [
      kw('SPIDERS', 'Great spiders creep out of the forest\'s eastern edge. They grow fat on the Shadow\'s malice. I would hunt them with thee — ask me to JOIN.'),
    ],
    recruit: { race: 'elf', cls: 'ranger', level: 2, joinText: 'At last! My bow is thine — let us see the wide world together.', equip: ['elven_bow', 'leather_armor'] },
  });
  const bowyer = byRole(map, 'bowyer')[0] || map.entities.find((e) => e.shop?.kind === 'weapons');
  if (bowyer) {
    bowyer.name = 'Faelon';
    bowyer.shop.stock = ['short_bow', 'long_bow', 'elven_bow', 'dagger', 'short_sword', 'long_sword', 'spear'];
  }
  for (const e of map.entities) if (e.type === 'npc' && e.role === 'villager') e.look.race = 'elf';
  nameNpcs(map, game, 3);
  const singer = addNpc(map, 12, 22, {
    name: 'Laurelin', race: 'elf', desc: 'an elven minstrel with a silver harp',
    lookExtra: { body: 0x8a3a7a, hat: 'cap', hatColor: 0x6a2a5a, cape: 0xd0a040 },
    greeting: 'Wouldst thou hear a SONG?',
    job: 'I sing the old lays. Our songs have POWER.',
    keywords: [
      kw('SONG', 'In the deep of the forest, where the silver leaves fall / the Lady keeps watch, the fairest of all...'),
      kw('POWER', 'An elven minstrel can sing a foe to sleep, or put fear in its heart, or heal a weary company.'),
    ],
  });
  void singer;
}

function dressDwarves(game, map) {
  map.name = 'Hammerdeep';
  const king = byRole(map, 'lord')[0];
  Object.assign(king, {
    name: 'King Durgan', desc: 'King Durgan Ironhand, his beard braided with gold',
    greeting: 'Who dares the halls of Hammerdeep? Speak!',
    job: 'I am King under the Mountain. The Rune-KEY was ours to keep... and we failed.',
    keywords: [
      kw('KEY', 'Goblins! Goblins crept in through the old mine and stole the Rune-Key. They fled south to GRIMHOLT barrow.'),
      kw('GRIMHOLT', 'An old barrow in the hills south of the great road. Something worse than goblins dwells there now — a WIGHT, they say.'),
      kw('WIGHT', 'A cold spirit of the old kings. Holy magic hurts it. Bring torches — it is dark.'),
      kw('SEAL', 'Aldric\'s seal! Then thou art the King\'s champions. Take these reagents for thy runesmiths, and go with my blessing.', {
        cond: { type: 'item', value: 'kings_seal' }, elseText: 'What seal? I see no seal.', once: true,
        action: { type: 'give_item', value: 'wyrmroot', n: 5 }, afterText: 'Go! Bring back the KEY!',
      }),
      kw('REWARD', 'Thou hast the Key! Take it to the gates of Dol Garoth — and take this RUNEBLADE, forged in the deep fires. May it bite deep into the Shadow!', {
        cond: { type: 'item', value: 'rune_key' }, elseText: 'Reward? Bring me the KEY first.', once: true,
        action: { type: 'give_item', value: 'runeblade' }, afterText: 'Strike true with that blade.',
      }),
      kw('RUNEBLADE', 'The finest work of our smiths. I will give one to whoever returns the KEY — ask me for thy REWARD then.'),
    ],
  });
  for (const e of map.entities) if (e.type === 'npc' && (e.role === 'villager' || e.role === 'guard')) e.look.race = 'dwarf';
  nameNpcs(map, game, 4);
  const smith = map.entities.find((e) => e.shop?.kind === 'weapons');
  if (smith) smith.shop.stock = ['hand_axe', 'battle_axe', 'dwarf_axe', 'mace', 'warhammer', 'crossbow', 'runeblade'];
  const armorer = map.entities.find((e) => e.shop?.kind === 'armor');
  if (armorer) armorer.shop.stock = ['leather_armor', 'chain_mail', 'scale_mail', 'plate_armor', 'buckler', 'kite_shield'];
  const prov = map.entities.find((e) => e.shop?.kind === 'provisions');
  if (prov) prov.shop.stock = [...defaultStock(game, 'provisions'), ...defaultStock(game, 'reagents')];
}

function dressVillage(game, map) {
  map.name = 'Brookend';
  addNpc(map, 14, 12, {
    name: 'Farmer Hal', desc: 'a farmer with a bandaged arm',
    greeting: 'Thank the stars — real fighters!',
    job: 'I farm, when the ORCS let me.',
    keywords: [
      kw('ORCS', 'They come down through the PASS from the east and burn what they can\'t carry.'),
      kw('PASS', 'The only way through the Ashen Peaks. Follow the road east. Beyond lies Dol Garoth.'),
    ],
  });
  nameNpcs(map, game, 5);
}

function dressTower(game, map) {
  const e = map.entry;
  addNpc(map, e.x + 1, e.y - 1, {
    name: 'Fennick', race: 'human', desc: 'an old hermit-wizard in a patched blue robe', wander: 1,
    lookExtra: { body: 0x3a5a9a, robe: true, hat: 'wizard', hatColor: 0x3a5a9a, weapon: 'staff', beard: 0xe8e8e8 },
    greeting: 'Visitors! Splendid. Mind the skeletons — they were students once.',
    job: 'I am a wizard, retired. Mostly. My TREASURE lies above, if thou canst reach it.',
    keywords: [
      kw('TREASURE', 'A staff of great power, and a phoenix feather. They are wasted on me. Take them, if my old servants let thee pass.'),
      kw('SHADOW', 'Malgrath? Hah! I fought him once, when I was young and foolish. Now I am old and foolish. Perhaps I should JOIN thee.'),
      kw('WAYGATE', 'The waygate on this isle leads to the elves of Silverwood. Handy, that.'),
    ],
    recruit: { race: 'human', cls: 'wizard', level: 4, joinText: 'Very well! One last adventure. Where did I leave my hat?', stats: { str: 9, dex: 12, int: 17, wis: 15 } },
  });
}
