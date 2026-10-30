// The sample adventure: "Shadow over Eldmark". Built with the same stamps and
// generators the construction set uses, then hand-dressed with people, lore,
// quests and things to find. New entities get explicit ids and are added after
// the original ones, so saves made before the quest update keep their places.
import { newGame, findStart } from './schema.js';
import { createMap, setTile, getTile, inBounds } from '../world/map.js';
import { STAMPS, PATHS, line4, placeFeature, generateDungeon, nameNpcs, defaultStock, npcLook, uniqueTownsfolk } from '../world/generate.js';
import { T, terrain } from './terrain.js';
import { RNG } from '../core/rng.js';
import { uid, deterministicIds } from '../core/util.js';
import { eventFromTemplate } from '../game/events.js';

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
    intro: 'In the Elder Days the realm of Eldmark knew peace. Men tilled the green lands, the Elves sang beneath the boughs of Silverwood, and the Dwarves delved deep beneath the Grey Mountains.\n\nBut now a shadow has fallen. In the blasted lands beyond the Ashen Peaks, the fortress of Dol Garoth wakes, and its master — the Shadow Lord Malgrath — gathers orcs and worse things to his banner.\n\nYour company has come to the harbour town of Westhold, where Mayor Hilda has sent word that she needs brave souls. The town gate lies just to the west...',
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
    { id: 'merek_letter', name: 'Letter to Fennick', type: 'quest', unique: true, price: 0, desc: 'A letter from Merek the sage, sealed with green wax and smelling faintly of ink and pipe smoke.' },
    { id: 'star_chart', name: 'Fennick\'s Star-Chart', type: 'quest', unique: true, price: 0, desc: 'A great roll of vellum crowded with stars, moons and furious annotations.' },
    { id: 'wolfhide_jerkin', name: 'Shepherd\'s Wolfhide', type: 'armor', weight: 'leather', ac: 4, price: 160, unique: true, desc: 'A jerkin of thick black wolfhide. It has turned many a fang.' },
    { id: 'serpent_shield', name: 'Serpent-scale Shield', type: 'shield', ac: 3, price: 220, unique: true, desc: 'Green-black scales sewn over oak. Light as driftwood, hard as stone.' },
  );
  // named foes for the quests: each is a unique boss, never met at random
  const monster = (id) => game.monsters.find((m) => m.id === id);
  const named = (base, def) => { const m = { ...JSON.parse(JSON.stringify(monster(base))), ...def, boss: true, habitat: [] }; game.monsters.push(m); return m; };
  named('wolf', { id: 'greyfang', name: 'Greyfang', plural: 'Greyfangs', level: 3, hp: '7d8+8', ac: 13, hit: 5, dmg: '1d8+2', xp: 60, gold: '0', group: [1, 1], escort: [{ id: 'wolf', min: 2, max: 2 }],
    phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: 'wolf', min: 2, max: 2 }], phaseText: 'Greyfang throws back his head and howls — and from the trees, more wolves answer!',
    look: { kind: 'quadruped', color: 0x2e2a2c, eyes: 0xffd040, scale: 1.45 }, desc: 'A wolf as big as a pony, black as soot, with eyes like lamps.' });
  named('orc_captain', { id: 'grishak', name: 'Grishak the Burner', plural: 'Grishaks', level: 4, hp: '12d8+16', hit: 8, dmg: '1d10+5', xp: 110, gold: '8d10', escort: [{ id: 'orc', min: 2, max: 3 }, { id: 'orc_archer', min: 1, max: 1 }],
    speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: 'orc', min: 2, max: 2 }], phaseText: 'Grishak bellows for his warband, and orcs come running with torches!',
    look: { kind: 'humanoid', race: 'orc', body: 0x6a1a10, armor: 'chain', hat: 'hornhelm', hatColor: 0x2a2a2a, weapon: 'axe', weaponGlow: 0xff7020, cape: 0x8a2a10, scale: 1.2 }, desc: 'An orc chieftain who laughs as he burns.' });
  named('barrow_wight', { id: 'hollow_king', name: 'Ulfgar the Hollow King', plural: 'Hollow Kings', level: 5, hp: '15d8+20', ac: 15, hit: 8, dmg: '1d10+5', xp: 160, gold: '6d10', castChance: 0.3, ai: 'boss', abilities: ['brutal_smash'], escort: [{ id: 'skeleton', min: 2, max: 2 }],
    speed: 2, phaseAt: 0.5, phaseEnrage: true, phaseAdds: [{ id: 'skeleton', min: 2, max: 2 }], phaseText: '"Rise, my thanes!" Ulfgar\'s cry shakes the barrow, and the dead claw their way up through the floor!',
    look: { kind: 'wraith', color: 0x2a3436, eyes: 0x70ffb0, hat: 'crown', crownColor: 0xe8b830, weapon: 'sword', weaponGlow: 0x70ffb0, scale: 1.55 }, desc: 'A king of the old days, crowned still, who will not stay dead.' });
  named('sea_serpent', { id: 'west_serpent', name: 'Old Gulper', plural: 'Old Gulpers', level: 6, hp: '18d8+20', hit: 9, xp: 220, gold: '10d10', group: [1, 1], abilities: ['tidal_surge', 'tail_sweep'],
    speed: 2, phaseAt: 0.4, phaseEnrage: true, phaseText: 'Old Gulper thrashes in fury, and the whole sea seems to heave!',
    look: { kind: 'serpent', color: 0x1a5a5a, scale: 1.8 }, desc: 'The great serpent of the western sea. It has eaten boats.' });
  named('giant_spider', { id: 'spider_queen', name: 'Skarrith the Spider Queen', plural: 'Spider Queens', level: 5, hp: '13d8+15', ac: 14, hit: 8, dmg: '1d10+4', poison: 0.5, xp: 180, gold: '4d10', group: [1, 1], escort: [{ id: 'giant_spider', min: 2, max: 2 }], castChance: 0.35,
    speed: 2, phaseAt: 0.5, phaseAdds: [{ id: 'giant_spider', min: 2, max: 2 }], phaseText: 'Skarrith shrieks, and her brood boils out of the webs!',
    look: { kind: 'spider', color: 0x3a1a3a, mark: 0xe0c020, scale: 1.9 }, desc: 'Bloated and ancient, she fattens on the Shadow\'s malice.' });
  named('skeleton', { id: 'mimic', name: 'Mimic', plural: 'Mimics', level: 3, hp: '6d8+6', ac: 14, hit: 6, dmg: '1d10+2', undead: false, xp: 60, gold: '6d10', group: [1, 1], escort: [],
    look: { kind: 'chest', color: 0x7a3a22 }, desc: 'A chest with teeth. Lots of teeth.' });
  Object.assign(monster('shadow_lord'), { name: 'Malgrath the Shadow Lord' });

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
    seed: 201, style: 'cave', monsters: ['goblin', 'giant_rat', 'giant_spider', 'skeleton', 'bat_swarm'], boss: 'hollow_king', rooms: 9,
    counts: { goblin: '4-6', giant_rat: '4-6', bat_swarm: '4-6', giant_spider: '2-3', skeleton: '2-4' },
  });
  const fortress = addDungeon(game, w, 84, 58, 'fortress', 'Dol Garoth', {
    seed: 202, style: 'fortress', monsters: ['orc_captain', 'troll', 'barrow_wight', 'dark_sorcerer', 'warg', 'skeleton'], boss: 'shadow_lord', rooms: 11, w: 40, h: 40,
    counts: { orc_captain: '1', troll: '2', barrow_wight: '2-3', dark_sorcerer: '1', warg: '3-4', skeleton: '4-6' },
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
  // the hermit's treasure, behind locked doors
  tower.chest.items = [{ id: 'staff_of_power', n: 1 }, { id: 'phoenix_feather', n: 1 }];
  lockRoom(tower.map, tower.last);
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
  mon('wolf', 30, 40, '1', { monster: 'greyfang', boss: true, wander: 3 });
  mon('giant_spider', 72, 38, '1', { monster: 'spider_queen', boss: true, wander: 2 });
  mon('orc_captain', 78, 58, '1', { monster: 'grishak', boss: true, wander: 2 });
  mon('bog_lurker', 56, 72, '2');
  mon('drake', 62, 17, '1');
  // a sea serpent prowls the western sea, between Westhold and the Hermit's isle
  const sea = nearestWhere(w, 12, 66, (t) => t.key === 'ocean');
  w.entities.push({ id: uid('mon'), type: 'monster', monster: 'west_serpent', x: sea.x, y: sea.y, count: '1', wander: 6, boss: true });
  // hidden treasures
  const cache = nearestWhere(w, 31, 41, (t) => t.key === 'forest' || t.key === 'pines');
  w.entities.push({ id: 'chest_wolfwood', type: 'chest', x: cache.x, y: cache.y, gold: '40', items: [{ id: 'healing_draught', n: 2 }, { id: 'iron_key', n: 1 }] });
  const isle = nearestWhere(w, 10, 85, (t) => t.key === 'sand' || t.key === 'grass');
  w.entities.push({ id: 'chest_isle', type: 'chest', x: isle.x, y: isle.y, gold: '3d20', items: [{ id: 'mana_tonic', n: 2 }, { id: 'silverdust', n: 4 }], trap: true });
  const ruinsAt = nearestWhere(w, 47, 66, (t) => t.key === 'hills' || t.key === 'grass' || t.key === 'meadow');
  w.tiles[ruinsAt.y * w.w + ruinsAt.x] = T.ruins;
  w.entities.push({ id: 'sign_ruins', type: 'sign', x: ruinsAt.x + 1, y: ruinsAt.y, text: 'Here fell the host of King Elendur. Let the dead rest.' });
  mon('skeleton', ruinsAt.x, ruinsAt.y + 1, '2-3', { wander: 2 });

  // --- people
  // (remember the names the generator gave, to tell the story folk from the crowd)
  const madeUp = new Map();
  for (const m of game.maps) for (const e of m.entities) if (e.type === 'npc') madeUp.set(e, e.name);
  dressWesthold(game, westhold);
  dressCastle(game, castle);
  dressElves(game, elves);
  dressDwarves(game, dwarves);
  dressVillage(game, village);
  dressTower(game, tower.map);
  // one Wynn, one Tobin: townsfolk never share a name with anyone in Eldmark
  uniqueTownsfolk(game, (e) => !madeUp.has(e) || madeUp.get(e) !== e.name, 7);
  varyFolk(game);

  // start on the road just east of Westhold
  const st = nearestWalkable(w, 25, 52);
  S.start = { map: w.id, x: st.x, y: st.y };
  w.encounterRate = 1;
  void findStart;

  // --- things to find, and the quests that tie it all together
  placeWonders(game, w, { barrow, fortress, tower, village });
  game.quests = buildQuests(barrow.map.id, fortress.map.id);
  return game;
}

// Points of interest and little events across Eldmark
function placeWonders(game, w, { barrow, fortress, tower, village }) {
  const open = (t) => t.walk && !t.water && !t.feature && t.key !== 'road' && t.key !== 'bridge';
  const put = (map, id, tpl, x, y, extra = {}, pred = open) => {
    const p = nearestWhere(map, x, y, pred);
    const e = { ...eventFromTemplate(tpl), id, x: p.x, y: p.y, ...extra };
    map.entities.push(e);
    return e;
  };
  // places to rest along the roads
  put(w, 'ev_camp_west', 'campfire', 31, 50, { name: 'Wayfarers\' Camp' });
  put(w, 'ev_camp_north', 'campfire', 43, 37, { name: 'Kingsroad Camp' });
  put(w, 'ev_camp_east', 'campfire', 63, 45, { name: 'Riverbend Camp' });
  put(w, 'ev_camp_pass', 'campfire', 69, 53, { name: 'Last Camp before the Pass', text: 'A soldier\'s camp, abandoned in haste. The fire still smoulders. Beyond the ridge, the sky over Dol Garoth is the colour of a bruise.' });
  put(w, 'ev_camp_south', 'campfire', 36, 62, { name: 'Shepherds\' Fold' });
  // shrines that bless
  put(w, 'ev_shrine_might', 'shrine_might', 47, 33, { name: 'Shrine of King Elendur', text: 'A statue of a crowned warrior kneels by the road, sword point-down. The inscription reads: "He held the Ashen stair." Pilgrims have left flowers.' });
  put(w, 'ev_shrine_ward', 'shrine_ward', 43, 66);
  put(w, 'ev_shrine_vigour', 'shrine_vigour', 65, 29);
  put(w, 'ev_shrine_fortune', 'shrine_fortune', 57, 52);
  // the Lay of Elendur: three verse-stones
  put(w, 'ev_verse_1', 'lore', 48, 66, {
    name: 'Verse-stone of the Downs', setsFlag: 'verse_1',
    text: '"Elendur rode from the Westering gate, / a thousand spears and the dawn at his back; / the barrow-kings rose, but he would not wait, / and the downs ran red on the eastward track."',
    choices: [{ label: 'Copy down the verse', text: 'You copy the first verse of the Lay of Elendur into your journal.', effects: { lore: true, xp: 20, flag: 'verse_1' } }, { label: 'Leave it be', leave: true }],
  });
  put(w, 'ev_verse_2', 'lore', 37, 23, {
    name: 'Verse-stone of the Foothills', setsFlag: 'verse_2',
    text: '"He met the Shadow upon the Ashen stair / where no bird sings and no grass grows; / and the Dwarves forged a key the dark could not bear, / and sealed the gate, as the old song goes."',
    choices: [{ label: 'Copy down the verse', text: 'You copy the second verse of the Lay of Elendur into your journal.', effects: { lore: true, xp: 20, flag: 'verse_2' } }, { label: 'Leave it be', leave: true }],
  });
  put(w, 'ev_verse_3', 'lore', 14, 84, {
    name: 'Verse-stone of the Isle', setsFlag: 'verse_3',
    text: '"Yet sealed is not slain, and the Shadow shall wake; / then bind it with rune, and burn it with light — / for steel alone the dark will not break, / and only the two shall end the night."',
    choices: [{ label: 'Copy down the verse', text: 'You copy the third verse of the Lay of Elendur into your journal. Rune and light together...', effects: { lore: true, xp: 20, flag: 'verse_3' } }, { label: 'Leave it be', leave: true }],
  });
  put(w, 'ev_lore_cross', 'lore', 42, 51, {
    name: 'The Crossroads Stone',
    text: 'An old milestone, worn smooth. "WESTHOLD 20 · CAER ALDON 22 · BROOKEND 18 · GRIMHOLT —" The last name has been chiselled away, and someone has scratched beneath it: DON\'T.',
  });
  // curiosities and encounters
  put(w, 'ev_well', 'well', 46, 53, { name: 'The Crossroads Well' });
  put(w, 'ev_traveller', 'traveller', 57, 46, { name: 'Dobbin the Pedlar\'s Cousin' }, (t) => t.walk && !t.water && !t.feature && t.key !== 'bridge');
  put(w, 'ev_bandits', 'bandits', 34, 57, {}, (t) => t.walk && !t.water && !t.feature && t.key !== 'bridge');
  // a troll has claimed the Eldwater bridge on the east road
  put(w, 'ev_toll_troll', 'toll_troll', 52, 48, { name: 'Brugg the Toll Troll' }, (t) => t.key === 'bridge');
  put(w, 'ev_farm', 'traveller', 46, 42, {
    name: 'Hob\'s Farmstead', kind: 'person', repeat: 'always',
    look: { kind: 'humanoid', race: 'hobbit', body: 0x7a8a3a, hair: 0x8a5a2a },
    text: 'A cheerful farmer leans on his gate beside the King\'s road. Behind him, smoke curls from a chimney and a ham hangs in the porch. "Travellers! Going far? Ye\'ll want feeding."',
    choices: [
      { label: 'Buy a sack of provisions (12 gold)', text: '"Bread, cheese, apples and a bit of that ham. Mind ye don\'t eat it all at once!"', effects: { food: 30 }, cost: { gold: 12 } },
      { label: 'Ask about the road', text: '"North to the castle, south to the crossroads. Don\'t go down to the barrow — and if ye must, take plenty of food and torches. It\'s a long way from anywhere."' },
      { label: 'Walk on', leave: true },
    ],
  });
  put(w, 'ev_lodge', 'traveller', 39, 26, {
    name: 'Hunters\' Lodge', kind: 'person', repeat: 'daily',
    look: { kind: 'humanoid', race: 'human', body: 0x4a5a32, hat: 'hood', hatColor: 0x3a4a2a, weapon: 'bow' },
    text: 'A lodge of rough-cut logs stands among the foothills. A hunter is skinning a deer by the door. "Bound for the mountain? Sit, eat. There\'s plenty."',
    choices: [
      { label: 'Share their supper', text: 'Venison stew and black bread. You leave warm, rested and with a parcel of smoked meat.', effects: { food: 20, heal: '2d6' } },
      { label: 'Walk on', leave: true },
    ],
  });
  put(w, 'ev_cart', 'cache', 49, 50, {
    name: 'Overturned Cart', text: 'A pedlar\'s cart lies on its side in the ditch, one wheel smashed. Whoever owned it is long gone, but sacks are still lashed to the bed.',
    choices: [{ label: 'Search the cart', text: 'Flour, dried apples, a jar of honey — and a stoppered bottle wrapped in straw.', effects: { food: 20, gold: 12, items: [{ id: 'healing_draught', n: 1 }] } }, { label: 'Leave it', leave: true }],
  });
  put(w, 'ev_goblin_scouts', 'bandits', 37, 67, {
    name: 'Goblin Scouts', kind: 'creature',
    look: { kind: 'humanoid', race: 'goblin', body: 0x5a4a2a, weapon: 'dagger' },
    text: 'Three goblins squabble over a stolen sack by the roadside, so busy they have not seen you. One wears a dwarvish helm far too big for it.',
    choices: [
      { label: 'Charge!', text: 'The goblins squeal and draw their knives.', effects: { fight: 'goblin', count: '3', food: 15 } },
      { label: 'Sneak past', text: '{who} leads you through the heather without a sound. You even lift the sack on the way past: dwarf-bread!', effects: { xp: 15, food: 15 }, req: { type: 'stat', value: 'dex:14' } },
      { label: 'Leave them to it', leave: true },
    ],
  }, (t) => t.walk && !t.water && !t.feature && t.key !== 'bridge');
  put(w, 'ev_cache_isle', 'cache', 9, 81, { name: 'Smugglers\' Cache', text: 'Half-buried in the sand above the tide line, a barrel stamped with a skull. Smugglers\' goods, long forgotten.', choices: [{ label: 'Break it open', text: 'Brandy, silk and a pouch of coins!', effects: { gold: 60, items: [{ id: 'mana_tonic', n: 1 }, { id: 'antidote', n: 1 }] } }, { label: 'Leave it', leave: true }] });

  // a wandering merchant on the great road
  addNpc(w, 39, 49, {
    id: 'npc_pell', name: 'Pell', race: 'human', role: 'merchant', wander: 5, desc: 'a travelling merchant with an overloaded mule-pack on his back',
    lookExtra: { body: 0x7a5a2a, hat: 'cap', hatColor: 0x8a2a2a, cape: 0x5a3a1a },
    greeting: 'Pell\'s Peerless Provisions! Rare goods from four kingdoms! Wouldst thou BUY?',
    job: 'I walk the roads with the finest goods in Eldmark. Prices are fair — mostly. Ask to BUY.',
    shop: { kind: 'mixed', stock: ['greater_draught', 'healing_draught', 'mana_tonic', 'antidote', 'torch', 'rations', 'scroll_seeing', 'iron_key', 'silverdust', 'nightshade', 'studded_leather', 'long_bow', 'crossbow'], priceMod: 1.2 },
    keywords: [kw('RUMOURS', 'They say a troll has claimed the Eldwater bridge. Pays to be clever with trolls — or rich.')],
    rumour: 'Pell the pedlar walks the great road. He sells things you won\'t find in any shop.',
  });

  // Brookend's well
  put(village, 'ev_well_brookend', 'well', Math.floor(village.w / 2) + 2, Math.floor(village.h / 2) + 1, { name: 'Brookend Well' }, (t) => t.walk && !t.door && !t.water);

  // Grimholt Barrow: a warning by the door, and a chest that is not a chest
  const bRooms = barrow.rooms || [];
  const e0 = barrow.map.entry;
  put(barrow.map, 'ev_barrow_lore', 'lore', e0.x + 1, e0.y - 1, {
    name: 'Tomb-stone of Ulfgar',
    text: '"Here lies Ulfgar, King of the Downs, who would not bow. Let no one wake him." Below, in fresher scratches: "GOBLINS KEEP OUT. THIS MEANS YOU, SNAGA."',
  }, (t) => t.walk && !t.water);
  if (bRooms.length > 3) {
    const r = bRooms[Math.floor(bRooms.length / 2)];
    put(barrow.map, 'ev_mimic', 'cache', r.x + 1, r.y + 1, {
      name: 'Suspiciously Clean Chest', text: 'In an alcove sits an iron-bound chest. Unlike everything else in this barrow, it has not a speck of dust on it. Was that... a breath?',
      choices: [
        { label: 'Open it', text: 'The lid yawns open — onto rows of teeth! It\'s a MIMIC!', effects: { fight: 'mimic', count: '1' } },
        { label: 'Have the burglar check it first', req: { type: 'class', value: 'burglar' }, text: '{who} slips a dagger under the lid and the chest SHRIEKS. A mimic! At least you know.', effects: { xp: 25, fight: 'mimic', count: '1' } },
        { label: 'Leave it well alone', leave: true },
      ],
    }, (t) => t.walk && !t.water);
  }
  // Dol Garoth: one last rest before the end
  const fRooms = fortress.rooms || [];
  if (fRooms.length > 2) {
    const r = fRooms[fRooms.length - 2];
    put(fortress.map, 'ev_fortress_camp', 'campfire', r.cx, r.cy, {
      name: 'Prisoners\' Brazier', text: 'Chained to the wall beside a guttering brazier, a long-dead prisoner has scratched a message: "IT FEARS THE RUNE AND THE LIGHT." The brazier still gives warmth. You could rest here, once.',
      repeat: 'once',
    }, (t) => t.walk && !t.water);
    put(fortress.map, 'ev_fortress_shrine', 'shrine_ward', r.cx + 2, r.cy, { name: 'Defiled Altar', text: 'An altar of the old faith, cracked and blackened — yet a single candle still burns on it.', repeat: 'once' }, (t) => t.walk && !t.water);
  }
  void tower;
}

// The main quest and the side quests of Eldmark
function buildQuests(barrowId, fortressId) {
  const talk = (npc) => ({ type: 'talk', npc });
  return [
    {
      id: 'q_main', name: 'The Shadow in the East', main: true, auto: true, giver: 'npc_hilda',
      summary: 'A shadow is rising over Eldmark. Malgrath the Shadow Lord has woken in his fortress of Dol Garoth, and only a sealed gate stands between him and the free peoples.',
      stages: [
        { text: 'Speak to Mayor Hilda in Westhold, just to the west', goal: talk('npc_hilda'),
          say: 'Thank the stars you\'ve come! Orcs burn farms on the east road, and the King himself is asking for heroes. Go north to Caer Aldon and speak with King Aldric — follow the road east to the crossroads, then north. And take these; the road is long.',
          reward: { gold: 50, food: 20, items: [{ id: 'healing_draught', n: 2 }] } },
        { text: 'Speak to King Aldric in Caer Aldon, north of the crossroads', goal: talk('npc_aldric'),
          say: 'So Hilda sends me heroes. Good. Hear me: Malgrath, the Shadow Lord, has woken in Dol Garoth. Its gate is sealed by sorcery, and only the dwarven Rune-Key can open it. Take my seal to King Durgan in Hammerdeep, in the Grey Mountains to the north-west. He will give thee the Key.',
          reward: { xp: 15, items: [{ id: 'kings_seal', n: 1 }] } },
        { text: 'Bring the Seal of Aldric to King Durgan in Hammerdeep, in the Grey Mountains', goal: { type: 'deliver', npc: 'npc_durgan', item: 'kings_seal' },
          say: 'Aldric\'s seal... then thou art the King\'s champions, and I must tell thee a shameful thing. The Key is gone. Goblins crept in through the old mine and carried it south — to Grimholt Barrow. And something worse than goblins waits there: Ulfgar, the Hollow King, who will not stay dead. Take these torches and dwarf-bread, and bring it back.',
          reward: { xp: 20, food: 30, items: [{ id: 'wyrmroot', n: 4 }, { id: 'torch', n: 3 }] } },
        { text: 'Find Grimholt Barrow in the southern hills — take the south road from the crossroads', goal: { type: 'reach', map: barrowId },
          log: 'The air of the barrow is cold and stale. Somewhere below, something old is stirring.' },
        { text: 'Destroy Ulfgar the Hollow King in the depths of Grimholt Barrow', goal: { type: 'kill', monster: 'hollow_king' } },
        { text: 'Take the Rune-Key from the Hollow King\'s hoard', goal: { type: 'collect', item: 'rune_key' } },
        { text: 'Bring the Rune-Key back to King Durgan in Hammerdeep', goal: talk('npc_durgan'),
          say: 'The Rune-Key! The halls will sing of this for a hundred years. Take this Runeblade, forged in the deep fires to bite things of shadow. Now go — the black gate of Dol Garoth lies east, beyond the pass in the Ashen Peaks.',
          reward: { xp: 75, items: [{ id: 'runeblade', n: 1 }] } },
        { text: 'Open the black gate of Dol Garoth, east beyond the pass in the Ashen Peaks', goal: { type: 'reach', map: fortressId },
          log: 'The Rune-Key turns with a sound like a bell. The gates of Dol Garoth groan open...' },
        { text: 'Destroy Malgrath the Shadow Lord in the heart of Dol Garoth', goal: { type: 'kill', monster: 'shadow_lord' } },
      ],
      reward: { xp: 250 },
      doneText: 'Malgrath is unmade, and the sun shines on the Ashen Peaks once more.',
      thanks: 'The heroes of Eldmark! Westhold will sing of thee for a hundred years.',
    },
    {
      id: 'q_wolf', name: 'The Wolf of the Old Forest', giver: 'npc_wynn',
      offer: 'Have ye seen my sheep? No... they\'re gone. Greyfang took them — a great black wolf, big as a pony, with eyes like lamps. His pack dens in the old forest north-east of town. Please, kill him before he comes back for the lambs!',
      accept: 'Oh, thank ye! Mind his teeth.',
      summary: 'Wynn the shepherdess has lost her flock to Greyfang, a monstrous wolf whose pack dens in the old forest north-east of Westhold.',
      stages: [
        { text: 'Hunt down Greyfang in the old forest north-east of Westhold', goal: { type: 'kill', monster: 'greyfang' } },
        { text: 'Tell Wynn in Westhold that Greyfang is dead', goal: talk(''),
          say: 'He\'s really dead? The lambs are safe! I haven\'t much, but take this — my da made it from the hide of the last wolf that troubled us, and it\'s turned many a fang.' },
      ],
      reward: { gold: 40, xp: 40, items: [{ id: 'wolfhide_jerkin', n: 1 }] },
      thanks: 'It\'s ye! The lambs are growing fat, and not a wolf in sight. Thank ye again!',
    },
    {
      id: 'q_serpent', name: 'What Lurks in the West Sea', giver: 'npc_osric',
      offer: 'Thirty years I\'ve fished these waters, and now I daren\'t put out past the harbour wall. There\'s a serpent out there — Old Gulper, we call him — and he\'s had two boats and a good man. The town ship lies idle by the west wall. Take her out and put an end to him, and I\'ll make it worth thy while.',
      accept: 'Aim for the eyes. And don\'t fall in.',
      summary: 'Osric the fisherman wants Old Gulper, the serpent of the western sea, dead. The town ship rides at anchor by Westhold\'s west wall.',
      stages: [
        { text: 'Take the ship from Westhold harbour and slay Old Gulper in the western sea', goal: { type: 'kill', monster: 'west_serpent' } },
        { text: 'Bring the good news to Osric in Westhold', goal: talk(''),
          say: 'Gulper\'s gone? Ha! Drinks are on me tonight — and take this. It came up in my nets years back, too fine for a fisherman.' },
      ],
      reward: { gold: 120, xp: 75, items: [{ id: 'serpent_shield', n: 1 }] },
      thanks: 'The serpent-slayers! The fish are biting again, now Gulper\'s gone.',
    },
    {
      id: 'q_brookend', name: 'Smoke over Brookend', giver: 'npc_hal',
      offer: 'They came again last night. Grishak the Burner and his orcs — they took the grain, fired the barn, and laughed while they did it. They camp on the east road, near the pass. We\'re farmers, not fighters. Will ye help us?',
      accept: 'Bless ye. Brookend will never forget it.',
      summary: 'Orc raiders led by Grishak the Burner are terrorising the village of Brookend. They camp on the east road near the pass through the Ashen Peaks.',
      stages: [
        { text: 'Defeat Grishak the Burner at the orc camp on the east road, near the pass', goal: { type: 'kill', monster: 'grishak' } },
        { text: 'Return to Farmer Hal in Brookend', goal: talk(''),
          say: 'Grishak\'s dead? Then we\'ll plant again come spring! Take this bow — my grandfather took it off an orc in the old wars. And a ham. Ye look like ye need a ham.' },
      ],
      reward: { gold: 80, xp: 80, food: 40, items: [{ id: 'ember_bow', n: 1 }] },
      thanks: 'The barn\'s going back up, and not an orc in sight. Brookend owes ye.',
    },
    {
      id: 'q_spiders', name: 'The Spider Queen', giver: 'npc_ithilwen',
      offer: 'A darkness nests at the eastern edge of our wood. Skarrith, the Spider Queen, has grown fat on the Shadow\'s malice, and her brood poisons the streams. My rangers cannot cut through her webs. Thou canst.',
      accept: 'Go with the light of the stars. Elwen knows the way — she would gladly go with thee.',
      summary: 'Lady Ithilwen of Lindaleth asks you to slay Skarrith the Spider Queen, whose brood poisons the eastern edge of Silverwood.',
      stages: [
        { text: 'Slay Skarrith the Spider Queen at the eastern edge of Silverwood', goal: { type: 'kill', monster: 'spider_queen' } },
        { text: 'Return to Lady Ithilwen in Lindaleth', goal: talk(''),
          say: 'The streams run clear again. Take this bow, strung with elven hair. It has not missed in a thousand years, and I think it will like thee.' },
      ],
      reward: { xp: 90, items: [{ id: 'elven_bow', n: 1 }, { id: 'antidote', n: 2 }] },
      thanks: 'The streams of Silverwood run clear again. Thou art ever welcome here.',
    },
    {
      id: 'q_chart', name: 'The Hermit\'s Star-Chart', giver: 'npc_merek',
      offer: 'Visitors! Just the thing. My old master Fennick lives in a tower on the isle south-west of Westhold — mad as a hatter, brilliant as the sun. He has a chart of the stars I need for my studies. Wouldst thou carry a letter to him? Westhold\'s ship can take thee — or, so the elves say, a waygate east of Lindaleth.',
      accept: 'Splendid! Do mind the skeletons. They were his students.',
      startItems: [{ id: 'merek_letter', n: 1 }],
      summary: 'Merek the royal sage needs a star-chart from his old master Fennick, the hermit-wizard on the isle south-west of Westhold.',
      stages: [
        { text: 'Bring Merek\'s letter to Fennick in the Tower of the Hermit, on the isle south-west of Westhold', goal: { type: 'deliver', npc: 'npc_fennick', item: 'merek_letter' },
          say: 'A letter from young Merek! He still cannot spell "astrolabe". The chart? Take it, take it. Tell him to mind the third moon — he always forgets the third moon.',
          reward: { items: [{ id: 'star_chart', n: 1 }] } },
        { text: 'Bring the star-chart back to Merek in Caer Aldon', goal: { type: 'deliver', npc: '', item: 'star_chart' },
          say: 'The chart! And annotated! The third moon — of course! Here, take these from my stores, with a scholar\'s thanks.' },
      ],
      reward: { xp: 75, items: [{ id: 'scroll_seeing', n: 2 }, { id: 'mana_tonic', n: 3 }] },
      thanks: 'My couriers of the third moon! The chart is a wonder — I have not slept for joy.',
    },
    {
      id: 'q_lay', name: 'The Lay of Elendur', giver: 'npc_laurelin',
      offer: 'The Lay of Elendur tells how the Shadow was bound in the Elder Days. Its verses were carved on standing stones across Eldmark, and our songs have forgotten them. Find the three verse-stones and bring the words to me, and I will sing the whole lay again.',
      accept: 'Look for grey stones carved with runes: one among the ruins on the Barrow Downs, one in the foothills of the Grey Mountains, and one on the hermit\'s isle.',
      summary: 'Laurelin the minstrel wants the three lost verses of the Lay of Elendur, carved on standing stones across Eldmark.',
      stages: [
        { text: 'Find the three verse-stones: on the Barrow Downs, in the Grey Mountain foothills and on the hermit\'s isle', goal: { type: 'flag', flags: 'verse_1,verse_2,verse_3' } },
        { text: 'Bring the verses to Laurelin in Lindaleth', goal: talk(''),
          say: '"...bind it with rune, and burn it with light." So that is how it ends! Then the Shadow can be beaten — a rune-forged blade and holy light together. Take this, with my thanks: a feather from the phoenix that nests above the falls.' },
      ],
      reward: { gold: 100, xp: 75, items: [{ id: 'phoenix_feather', n: 1 }] },
      thanks: 'Shall I sing thee the Lay of Elendur? All of it, at last — thanks to thee.',
    },
  ];
}

function addDungeon(game, world, x, y, kind, name, opt) {
  const sub = placeFeature(game, world, x, y, kind, name, opt.seed);
  // replace the auto-generated dungeon with our tuned one
  const idx = game.maps.indexOf(sub);
  const { map, last, rooms } = generateDungeon({ ...opt, name });
  map.id = sub.id;
  map.exit = sub.exit;
  game.maps[idx] = map;
  const chest = map.entities.find((e) => e.type === 'chest' && e.x === last.cx && e.y === last.cy);
  for (const e of map.entities) if (e.type === 'monster' && !e.boss && opt.counts?.[e.monster]) e.count = opt.counts[e.monster];
  return { map, chest, last, rooms };
}

// Turn every entrance of a rectangular room into a locked door
function lockRoom(map, r) {
  const inRoom = (x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    if (inRoom(x, y)) continue;
    const corner = (x === r.x - 1 || x === r.x + r.w) && (y === r.y - 1 || y === r.y + r.h);
    if (corner || !inBounds(map, x, y)) continue;
    if (terrain(getTile(map, x, y)).walk) map.tiles[y * map.w + x] = T.door_locked;
  }
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
      id: 'npc_borin', name: 'Borin', race: 'dwarf', role: 'villager', wander: 1, desc: 'a stout dwarf nursing a tankard',
      lookExtra: { body: 0x6a4a2a, armor: 'chain', hat: 'hornhelm', weapon: 'axe' },
      greeting: 'Hmph. Another band of would-be heroes?',
      job: 'I was a guard of HAMMERDEEP, till the goblins came and took the KEY on my watch. I drink to forget.',
      keywords: [
        kw('HAMMERDEEP', 'The great dwarf-hold beneath the Grey Mountains, north of here. King Durgan rules there.'),
        kw('KEY', 'The Rune-Key! Forged to seal the gates of Dol Garoth. Goblins stole it and fled south, to the barrow of GRIMHOLT. If thou art going after it... I would JOIN thee.'),
        kw('GRIMHOLT', 'An old barrow in the southern hills. Cursed, they say. Goblins nest there now — and worse.'),
      ],
      recruit: { race: 'dwarf', cls: 'warrior', level: 2, joinText: 'Ha! My axe is thine. Let us go and get that key back!', equip: ['battle_axe', 'crossbow', 'chain_mail'] },
    });
  }
  const healer = byRole(map, 'healer')[0];
  if (healer) Object.assign(healer, { id: 'npc_edith', name: 'Sister Edith', desc: 'a kindly healer in white', greeting: 'Peace, travellers. Art thou hurt?' });
  const guards = byRole(map, 'guard');
  if (guards[0]) Object.assign(guards[0], { name: 'Garret', desc: 'a weary town guard', job: 'I guard the gate. ORCS have been seen on the east road.', keywords: [kw('ORCS', 'Foul things, out of the east, from the Ashen Peaks. They say a SHADOW drives them.'), kw('SHADOW', 'Talk to the King at Caer Aldon. North along the road. He\'ll know more than a gate guard.')] });
  addNpc(map, 17, 20, {
    id: 'npc_hilda', name: 'Mayor Hilda', race: 'human', desc: 'the mayor of Westhold, wearing a chain of office',
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
  addNpc(map, 9, 26, { id: 'npc_wynn', name: 'Wynn', race: 'human', desc: 'a young shepherdess', greeting: 'Have ye seen my sheep?', job: 'I mind the sheep. WOLVES took three last week.', keywords: [
    kw('WOLVES', 'Not a howl since Greyfang fell. The rest of the pack slunk off into the hills.', { cond: { type: 'questdone', value: 'q_wolf' }, elseText: 'They come out of the old forest north-east of town. Their leader is GREYFANG.' }),
    kw('GREYFANG', 'Dead, and by thy hand! I still can\'t believe it.', { cond: { type: 'questdone', value: 'q_wolf' }, elseText: 'Big as a pony, black as soot. Nobody can kill him!' }),
  ] });
  const rumours = [
    'They say the dwarves of Hammerdeep lost something precious to goblins.',
    'Old Fennick the hermit has a waygate on his island. Or so the elves say.',
    'Trolls in the southern hills. Their wounds close up while you watch — hit them hard and fast!',
    'The barrow-wights hate holy light. A good cleric is worth ten swords in Grimholt.',
    'The provisioner sells iron keys. Handy, if you find a locked door.',
    'A troll has claimed the Eldwater bridge on the east road. Wants a toll — or a riddle, if you\'re clever.',
    'Pilgrims pray at King Elendur\'s shrine on the north road. They say it puts strength in your sword-arm.',
    'There\'s a wishing well at the crossroads. Toss a coin, by all means — but I wouldn\'t drink from it.',
  ];
  let ri = 0;
  for (const e of byRole(map, 'villager')) if (!e.rumour) e.rumour = rumours[ri++ % rumours.length];
  nameNpcs(map, game, 1);
  for (const n of byRole(map, 'tavern')) n.rumour = n.rumour || 'Old Borin in the corner used to guard the dwarves\' treasure. Buy him a drink and ask about the KEY.';
  addNpc(map, 6, 17, {
    id: 'npc_osric', name: 'Osric', desc: 'a fisherman mending his nets', wander: 1,
    job: 'I fish. Or did, before the SERPENT came.',
    rumour: 'A sea-monster has been sighted off the west coast. Mind thy ship!',
    keywords: [kw('SERPENT', 'Old Gulper\'s gone to the bottom for good, thanks to thee. The boats are out again.', { cond: { type: 'questdone', value: 'q_serpent' }, elseText: 'Old Gulper, we call him. A great sea-serpent that haunts the western waters. He\'s had two boats already.' })],
  });
}

function dressCastle(game, map) {
  map.name = 'Caer Aldon';
  const king = byRole(map, 'lord')[0];
  Object.assign(king, {
    id: 'npc_aldric', name: 'King Aldric', desc: 'King Aldric of Eldmark, grey-bearded and stern',
    greeting: 'Welcome, travellers. Thou comest at a dark hour.',
    job: 'I am King of Eldmark — while there is still an Eldmark to rule. A SHADOW grows in the east. I will HEAL thy wounds whenever thou dost return.',
    lookExtra: undefined,
    keywords: [
      kw('SHADOW', 'Malgrath, the Shadow Lord, has woken in DOL GAROTH beyond the Ashen Peaks. His orcs grow bolder by the day. Wilt thou take up this QUEST?'),
      kw('QUEST', 'The gate of Dol Garoth is sealed by sorcery. Only the Rune-KEY forged by the dwarves can open it. My SEAL will open the doors of HAMMERDEEP to thee.'),
      kw('KEY', 'The Rune-Key was kept by the dwarves of Hammerdeep. I have heard troubling tales that it was STOLEN.'),
      kw('STOLEN', 'Ask the dwarves. Or that gloomy dwarf who drinks in Westhold\'s tavern. Return to me with the Rune-Key and I shall give thee my BLESSING.'),
      kw('BLESSING', 'The Rune-Key! Thou hast done what my knights could not. Kneel — and rise, heroes of Eldmark!', {
        cond: { type: 'item', value: 'rune_key' }, elseText: 'Bring me the Rune-Key, and thou shalt have my blessing.', once: true,
        action: { type: 'give_xp', n: 75 }, afterText: 'Go now to Dol Garoth, and may the light go with thee.',
      }),
      kw('DOL GAROTH', 'The black fortress in the blighted east. Follow the road east, through the pass in the Ashen Peaks. Its gates will not open without the KEY.'),
      kw('HAMMERDEEP', 'The dwarf-hold lies north-west, in the Grey Mountains. Follow the road north from here.'),
      kw('MAGIC', 'Speak with my sage, Merek. He knows the arts.'),
      kw('ELVES', 'The Elves of Silverwood keep to themselves, east of the river. Their lady is wise.'),
    ],
  });
  const sage = byRole(map, 'sage')[0];
  if (sage) Object.assign(sage, {
    id: 'npc_merek', name: 'Merek', desc: 'the royal sage, ink-stained and absent-minded',
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
  const e = map.entry || { x: Math.floor(map.w / 2), y: map.h - 3 };
  addNpc(map, e.x + 3, e.y - 3, {
    id: 'npc_bryce', name: 'Quartermaster Bryce', role: 'provisions', wander: 0, desc: 'the castle quartermaster, with a ledger and a laden cart',
    lookExtra: { body: 0x6a7a3a, hat: 'cap', hatColor: 0x5a4a2a },
    greeting: 'Provisions for the King\'s champions? Thou\'lt not march far on an empty belly.',
    job: 'I keep the castle stores: FOOD, torches and draughts. Wouldst thou BUY?',
    keywords: [kw('FOOD', 'Rations, waybread, salt pork. Every hero eats a ration each twenty paces or so in the wild — more than folk expect. Stock up before the road.')],
    shop: { kind: 'provisions', stock: ['rations', 'healing_draught', 'antidote', 'torch', 'mana_tonic', 'iron_key'] },
  });
  nameNpcs(map, game, 2);
  const smith = map.entities.find((x) => x.shop?.kind === 'weapons');
  if (smith) smith.shop.stock = ['dagger', 'short_sword', 'long_sword', 'great_sword', 'spear', 'mace', 'warhammer', 'battle_axe', 'long_bow', 'crossbow', 'sling'];
  const armorer = map.entities.find((x) => x.shop?.kind === 'armor');
  if (armorer) armorer.shop.stock = ['leather_armor', 'studded_leather', 'chain_mail', 'scale_mail', 'buckler', 'kite_shield'];
  for (const v of byRole(map, 'villager')) v.rumour = 'The King has not slept well since the orcs burned the farms at Brookend.';
  // the road crosses the moat on the bridge, not through the water beside it
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (getTile(map, x, y) !== T.bridge) continue;
    for (const d of [-1, 1]) {
      for (let k = x + d; inBounds(map, k, y) && (getTile(map, k, y) === T.cobble || getTile(map, k, y) === T.road); k += d) setTile(map, k, y, T.bridge);
    }
  }
}

function dressElves(game, map) {
  map.name = 'Lindaleth';
  addNpc(map, 15, 10, {
    id: 'npc_ithilwen', name: 'Lady Ithilwen', race: 'elf', desc: 'the Lady of Silverwood, tall and shining', wander: 0,
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
    id: 'npc_elwen', name: 'Elwen', race: 'elf', desc: 'a keen-eyed elven ranger',
    lookExtra: { body: 0x3a6a3a, hat: 'hood', hatColor: 0x2a5a2a, weapon: 'bow', cape: 0x2a4a2a },
    greeting: 'Well met, strangers!',
    job: 'I guard the borders of Silverwood. The SPIDERS grow bold.',
    keywords: [
      kw('SPIDERS', 'Great spiders creep out of the forest\'s eastern edge. They grow fat on the Shadow\'s malice. I would hunt them with thee — ask me to JOIN.'),
    ],
    recruit: { race: 'elf', cls: 'ranger', level: 2, joinText: 'At last! My bow is thine — let us see the wide world together.', equip: ['short_sword', 'elven_bow', 'leather_armor'] },
  });
  const bowyer = byRole(map, 'bowyer')[0] || map.entities.find((e) => e.shop?.kind === 'weapons');
  if (bowyer) {
    bowyer.name = 'Faelon';
    bowyer.shop.stock = ['short_bow', 'long_bow', 'dagger', 'short_sword', 'long_sword', 'spear'];
  }
  for (const e of map.entities) if (e.type === 'npc' && e.role === 'villager') e.look.race = 'elf';
  addNpc(map, 18, 24, {
    id: 'npc_nimrodel', name: 'Nimrodel', race: 'elf', role: 'provisions', wander: 0, desc: 'an elven baker with flour on her sleeves',
    lookExtra: { body: 0x8ab06a, robe: true, trim: 0xf0e0b0 },
    greeting: 'Thou lookest hungry. Elven waybread keeps for a month and fills a soldier for a day.',
    job: 'I bake the waybread of Lindaleth, and keep a few draughts besides. Wouldst thou BUY?',
    shop: { kind: 'provisions', stock: ['rations', 'healing_draught', 'antidote', 'mana_tonic', 'torch'] },
  });
  nameNpcs(map, game, 3);
  const singer = addNpc(map, 12, 22, {
    id: 'npc_laurelin', name: 'Laurelin', race: 'elf', desc: 'an elven minstrel with a silver harp',
    lookExtra: { body: 0x8a3a7a, hat: 'cap', hatColor: 0x6a2a5a, cape: 0xd0a040 },
    greeting: 'Wouldst thou hear a SONG?',
    job: 'I sing the old lays. Our songs have POWER.',
    keywords: [
      kw('SONG', 'In the deep of the forest, where the silver leaves fall / the Lady keeps watch, the fairest of all... But the song I long to sing is the LAY of Elendur.'),
      kw('LAY', 'The Lay of Elendur — how the Shadow was bound. Its verses were carved on standing stones, and lost.'),
      kw('POWER', 'An elven minstrel can sing a foe to sleep, or put fear in its heart, or heal a weary company.'),
    ],
  });
  void singer;
}

function dressDwarves(game, map) {
  map.name = 'Hammerdeep';
  const king = byRole(map, 'lord')[0];
  Object.assign(king, {
    id: 'npc_durgan', name: 'King Durgan', desc: 'King Durgan Ironhand, his beard braided with gold',
    greeting: 'Who dares the halls of Hammerdeep? Speak!',
    job: 'I am King under the Mountain. The Rune-KEY was ours to keep... and we failed.',
    keywords: [
      kw('KEY', 'Goblins! Goblins crept in through the old mine and stole the Rune-Key. They fled south to GRIMHOLT barrow.'),
      kw('GRIMHOLT', 'An old barrow in the hills south of the great road. Something worse than goblins dwells there now — a WIGHT, they say.'),
      kw('WIGHT', 'A cold spirit of the old kings. Holy magic hurts it. Bring torches — it is dark.'),
      kw('SEAL', 'Aldric\'s seal opens any door under the mountain.'),
      kw('REWARD', 'Bring back the KEY, and thou shalt have a RUNEBLADE from my own forges.'),
      kw('RUNEBLADE', 'The finest work of our smiths. I will give one to whoever returns the KEY — ask me for thy REWARD then.'),
    ],
  });
  for (const e of map.entities) if (e.type === 'npc' && (e.role === 'villager' || e.role === 'guard')) e.look.race = 'dwarf';
  nameNpcs(map, game, 4);
  const smith = map.entities.find((e) => e.shop?.kind === 'weapons');
  if (smith) smith.shop.stock = ['hand_axe', 'battle_axe', 'dwarf_axe', 'mace', 'warhammer', 'crossbow'];
  const armorer = map.entities.find((e) => e.shop?.kind === 'armor');
  if (armorer) armorer.shop.stock = ['leather_armor', 'chain_mail', 'scale_mail', 'plate_armor', 'buckler', 'kite_shield'];
  const prov = map.entities.find((e) => e.shop?.kind === 'provisions');
  if (prov) prov.shop.stock = [...defaultStock(game, 'provisions'), ...defaultStock(game, 'reagents')];
}

function dressVillage(game, map) {
  map.name = 'Brookend';
  addNpc(map, 14, 12, {
    id: 'npc_hal', name: 'Farmer Hal', desc: 'a farmer with a bandaged arm',
    greeting: 'Thank the stars — real fighters!',
    job: 'I farm, when the ORCS let me.',
    keywords: [
      kw('ORCS', 'They come down through the PASS from the east and burn what they can\'t carry. Their chief is GRISHAK.'),
      kw('GRISHAK', 'Grishak the Burner. He laughs while the barns burn.'),
      kw('PASS', 'The only way through the Ashen Peaks. Follow the road east. Beyond lies Dol Garoth.'),
    ],
  });
  nameNpcs(map, game, 5);
}

// Townsfolk come in all sorts: hobbits with bare feet and curly hair,
// bald grey-bearded elders, ladies in gowns, elves in circlets and white
// robes, dwarves with braided beards. (Looks only; names and words stay.)
const FOLK = {
  human: [
    { race: 'hobbit', face: 'bold', hair: 0x6a4020, body: 0x6a8a3a, legs: 0x8a6a3a },
    { face: 'bold', hairStyle: 'bald', hair: 0xd8d4cc, beard: 0xd8d4cc, body: 0x6a5a4a, robe: true },
    { face: 'fair', hairStyle: 'long', hair: 0xd8b860, body: 0x8a3a4a, robe: true, trim: 0xe8d8a0 },
    { race: 'hobbit', face: 'fair', hair: 0xb06a30, body: 0xa8742a, legs: 0x5a6a3a },
    { face: 'bold', hairStyle: 'short', hair: 0x3a2618, beard: 0x3a2618, body: 0x5a6a8a, hat: 'hood', hatColor: 0x7a5a32 },
    { face: 'fair', hairStyle: 'braids', hair: 0x9a4a22, body: 0x3a6a5a },
    { face: 'bold', hairStyle: 'bald', hair: 0x9a9a9a, beard: 0xe8e8e8, longBeard: true, body: 0x4a4a7a, robe: true },
    { face: 'bold', hairStyle: 'ponytail', hair: 0x1e1a18, body: 0x7a2a2a },
    { face: 'fair', hairStyle: 'ponytail', hair: 0x5a3a20, body: 0x2a5a8a, scarf: 0xe0c060 },
  ],
  elf: [
    { face: 'fair', hairStyle: 'long', hair: 0xeedc98, body: 0xf4f2ff, robe: true, trim: 0xc8d4ff, hat: 'circlet' },
    { face: 'bold', hairStyle: 'long', hair: 0xe2e2ea, body: 0x3a6a4a, cape: 0x2a4a3a },
    { face: 'fair', hairStyle: 'braids', hair: 0xb06a30, body: 0x8ab0d8, robe: true, trim: 0xf0f0ff, hat: 'circlet', hatColor: 0xd8dce8 },
    { face: 'fair', hairStyle: 'ponytail', hair: 0x1e1a18, body: 0x6a8a3a },
  ],
  dwarf: [
    { face: 'bold', hair: 0x9a4a22, body: 0x6a4a2a, hairStyle: 'braids' },
    { face: 'bold', hair: 0xe8e8e8, hairStyle: 'bald', body: 0x5a5a6a },
    { face: 'bold', hair: 0x1e1a18, hairStyle: 'short', body: 0x8a5a2a, hat: 'hood', hatColor: 0x6a3a2a },
    { face: 'fair', hair: 0xc8a050, hairStyle: 'braids', beard: false, body: 0x7a3a5a },
  ],
};

function varyFolk(game) {
  const n = { human: 0, elf: 0, dwarf: 0 };
  for (const map of game.maps) {
    for (const e of map.entities || []) {
      if (e.type !== 'npc' || e.role !== 'villager' || !/ local$/.test(e.desc || '') || !e.look) continue;
      const race = FOLK[e.look.race] ? e.look.race : 'human';
      const pick = FOLK[race][n[race]++ % FOLK[race].length];
      Object.assign(e.look, pick);
      if (pick.race === 'hobbit') e.desc = 'a hobbit of the town';
    }
  }
  // the named folk, dressed to match their words
  const npc = (id) => game.maps.flatMap((m) => m.entities || []).find((e) => e.id === id);
  const dress = (id, look) => { const e = npc(id); if (e && e.look) Object.assign(e.look, look); };
  dress('npc_aldric', { face: 'bold', hair: 0xc8c8c8, beard: 0xc8c8c8, hairStyle: 'short' });
  dress('npc_durgan', { face: 'bold', hair: 0xe8e4dc, hairStyle: 'braids', body: 0x6a2a2a, cape: 0x3a2a6a });
  dress('npc_wynn', { face: 'fair', hairStyle: 'braids', hair: 0xd8b868, body: 0x7a8a3a });
  dress('npc_osric', { face: 'bold', hair: 0x9a9a9a, beard: 0x9a9a9a, body: 0x3a5a6a, hat: 'hood', hatColor: 0x5a6a5a });
  dress('npc_hal', { face: 'bold', hair: 0x7a4a24, beard: 0x7a4a24, body: 0x8a6a3a });
  dress('npc_hilda', { face: 'fair', hairStyle: 'braids', hair: 0xb84a1e });
  dress('npc_ithilwen', { face: 'fair', hairStyle: 'long', hair: 0xf0e8c0 });
  dress('npc_laurelin', { face: 'fair', hairStyle: 'long', hair: 0xe2e2ea, back: 'lute', pose: 'hip' });
  dress('npc_merek', { face: 'bold', hair: 0xd8d4cc, beard: 0xd8d4cc });
  const westhold = game.maps.find((m) => m.name === 'Westhold');
  for (const e of westhold?.entities || []) {
    if (e.name === 'Tobin') Object.assign(e.look, { race: 'hobbit', face: 'bold', hair: 0x8a5a2a, body: 0x8a5a3a, legs: 0x6a5a3a });
    if (e.name === 'Maud') Object.assign(e.look, { face: 'fair', hairStyle: 'ponytail', hair: 0x9a4a22 });
  }
}

function dressTower(game, map) {
  const e = map.entry;
  addNpc(map, e.x + 1, e.y - 1, {
    id: 'npc_fennick', name: 'Fennick', race: 'human', desc: 'an old hermit-wizard in a patched blue robe', wander: 1,
    lookExtra: { body: 0x3a5a9a, robe: true, hat: 'wizard', hatColor: 0x3a5a9a, weapon: 'staff', beard: 0xe8e8e8 },
    greeting: 'Visitors! Splendid. Mind the skeletons — they were students once.',
    job: 'I am a wizard, retired. Mostly. My TREASURE lies above, if thou canst reach it.',
    keywords: [
      kw('TREASURE', 'A staff of great power, and a phoenix feather. They are wasted on me. Take them — if my old servants let thee pass, and if thou hast a KEY.'),
      kw('KEY', 'I locked the vault and threw away the key. Silly of me. Any iron key will do — the provisioners sell them. Or bring a clever burglar.'),
      kw('SHADOW', 'Malgrath? Hah! I fought him once, when I was young and foolish. Now I am old and foolish. Perhaps I should JOIN thee.'),
      kw('WAYGATE', 'The waygate on this isle leads to the elves of Silverwood. Handy, that.'),
    ],
    recruit: { race: 'human', cls: 'wizard', level: 4, joinText: 'Very well! One last adventure. Where did I leave my hat?', stats: { str: 9, dex: 12, int: 17, wis: 15 } },
  });
}
