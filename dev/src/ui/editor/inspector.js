// Inspector panels for map entities and map properties.
import { h, clear, confirmDialog, toast } from '../dom.js';
import { buildForm } from './forms.js';
import { ACTIONS, CONDITIONS } from '../../game/dialog.js';
import { TERRAIN_LIST } from '../../data/terrain.js';
import { MAP_TYPES } from '../../world/map.js';
import { defaultStock } from '../../world/generate.js';
import { inspectEvent, npcQuestSection } from './quests.js';
import { DEFAULT_LEASH } from '../../game/travel.js';
import { clueFor, newMapItem, landmarksNear } from '../../game/treasure.js';
import { isBattleground } from '../../game/delve.js';
import { isHoard } from '../../game/charms.js';
import { CONTAINERS, chestLook, containerLookFor } from '../../data/containers.js';
import { containerLookFields } from './containerFields.js';
import { battleArts } from '../../game/rules.js';
import { recruitables } from '../../game/company.js';
import { flagDatalist } from './flagList.js';
import { isPuzzle } from '../../game/puzzles.js';
import { inspectPuzzle } from './puzzles.js'; // (puzzles)

const RACES = [['human', 'Human'], ['elf', 'Elf'], ['dwarf', 'Dwarf'], ['hobbit', 'Halfling'], ['orc', 'Orc'], ['goblin', 'Goblin'], ['troll', 'Troll'], ['skeleton', 'Skeleton'], ['lizard', 'Lizardfolk'], ['hag', 'Hag']]; // (isles: lizardfolk and hags)
const HATS = [['none', 'None'], ['wizard', 'Wizard hat'], ['helm', 'Helm'], ['hornhelm', 'Horned helm'], ['hood', 'Hood'], ['crown', 'Crown'], ['circlet', 'Circlet'], ['cap', 'Feathered cap'], ['mitre', 'Mitre']];
const WEAPONS = [['none', 'None'], ['sword', 'Sword'], ['greatsword', 'Great sword'], ['axe', 'Axe'], ['hammer', 'Hammer'], ['mace', 'Mace'], ['club', 'Club'], ['staff', 'Staff'], ['spear', 'Spear'], ['dagger', 'Dagger'], ['bow', 'Bow'], ['crossbow', 'Crossbow'], ['sling', 'Sling']];
const ARMORS = [['', 'None'], ['leather', 'Leather'], ['chain', 'Chain'], ['plate', 'Plate']];
export const NPC_ROLES = [
  ['villager', 'Villager'], ['guard', 'Guard'], ['lord', 'Lord / King'], ['sage', 'Sage (sells spell scrolls)'],
  ['weapons', 'Weaponsmith (shop)'], ['armor', 'Armourer (shop)'], ['provisions', 'Provisioner (shop)'], ['reagents', 'Herbalist (shop)'], ['bowyer', 'Bowyer (shop)'],
  ['inn', 'Innkeeper'], ['tavern', 'Barkeep (rumours)'], ['healer', 'Healer'], ['merchant', 'Travelling merchant (shop)'],
  ['shipwright', 'Shipwright (sells a ship)'],
];
const SHOP_KINDS = { weapons: 'weapons', armor: 'armor', provisions: 'provisions', reagents: 'reagents', bowyer: 'weapons', merchant: 'mixed', sage: 'scrolls' };

export const LOOK_FIELDS = [
  { key: 'look.race', label: 'Body', type: 'select', options: RACES },
  { key: 'look.body', label: 'Clothing colour', type: 'color' },
  { key: 'look.robe', label: 'Long robe', type: 'check' },
  { key: 'look.armor', label: 'Armour', type: 'select', options: ARMORS },
  { key: 'look.trim', label: 'Trim', type: 'color', nullable: true },
  { key: 'look.skin', label: 'Skin', type: 'color', nullable: true },
  { key: 'look.hair', label: 'Hair', type: 'color', nullable: true },
  { key: 'look.beard', label: 'Beard', type: 'color', nullable: true },
  { key: 'look.hat', label: 'Headgear', type: 'select', options: HATS },
  { key: 'look.hatColor', label: 'Headgear colour', type: 'color', nullable: true, show: (o) => o.look?.hat && o.look.hat !== 'none' },
  { key: 'look.weapon', label: 'Carries', type: 'select', options: WEAPONS },
  { key: 'look.shield', label: 'Shield', type: 'color', nullable: true },
  { key: 'look.cape', label: 'Cape', type: 'color', nullable: true },
  // (art) finer touches of the figure builder
  { key: 'look.face', label: 'Face', type: 'select', options: [['bold', 'Bold'], ['fair', 'Fair']], empty: 'Any', nullable: true },
  { key: 'look.hairStyle', label: 'Hair style', type: 'select', options: [['short', 'Short'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['braids', 'Braids'], ['topknot', 'Topknot'], ['bald', 'Bald']], empty: 'Any', nullable: true },
  { key: 'look.iris', label: 'Eyes', type: 'select', options: [[0, 'Brown'], [1, 'Blue'], [2, 'Green'], [3, 'Grey'], [4, 'Amber'], [5, 'Violet']], empty: 'Any', nullable: true, number: true },
  { key: 'look.lashes', label: 'Eyelashes', type: 'check' },
  { key: 'look.pose', label: 'Stance', type: 'select', options: [['raise', 'Weapon raised'], ['overhead', 'Weapon overhead'], ['cast', 'Casting hand'], ['hip', 'Hand on hip'], ['bow', 'Bow across the body']], empty: 'Natural', nullable: true },
  { key: 'look.pauldrons', label: 'Pauldrons', type: 'select', options: [['plate', 'Plate'], ['leather', 'Leather'], ['spiked', 'Spiked']], empty: 'By armour', nullable: true },
  { key: 'look.plume', label: 'Helm plume', type: 'color', nullable: true, show: (o) => o.look?.hat === 'helm' },
  { key: 'look.wings', label: 'Winged helm', type: 'check', show: (o) => o.look?.hat === 'helm' },
  { key: 'look.tabard', label: 'Tabard', type: 'color', nullable: true },
  { key: 'look.mantle', label: 'Mantle and stole', type: 'color', nullable: true },
  { key: 'look.scarf', label: 'Scarf', type: 'color', nullable: true },
  { key: 'look.shieldShape', label: 'Shield shape', type: 'select', options: [['round', 'Round'], ['kite', 'Kite']], empty: 'By armour', nullable: true, show: (o) => o.look?.shield != null },
  { key: 'look.emblem', label: 'Shield emblem', type: 'color', nullable: true, show: (o) => o.look?.shield != null },
  { key: 'look.offhand', label: 'Off hand', type: 'select', options: [['dagger', 'Dagger']], empty: 'Nothing', nullable: true },
  { key: 'look.back', label: 'On the back', type: 'select', options: [['lute', 'Lute']], empty: 'Nothing', nullable: true },
  { key: 'look.runes', label: 'Glowing runes', type: 'color', nullable: true },
];

function keywordFields(game) {
  const items = () => game.items.map((i) => [i.id, i.name]);
  const monsters = () => game.monsters.map((m) => [m.id, m.name]);
  const maps = () => game.maps.map((m) => [m.id, m.name]);
  const condNeeds = (r) => r.cond && r.cond.type && r.cond.type !== 'none';
  const act = (r) => r.action?.type || 'none';
  return [
    { key: 'key', label: 'Keyword(s)', type: 'text', placeholder: 'e.g. RING, TREASURE', hint: 'The player types these. Separate synonyms with commas; the first four letters are enough.' },
    { key: 'text', label: 'Reply', type: 'textarea', rows: 3, hint: 'Mention other keywords in your reply and they become clickable.' },
    { key: 'cond.type', label: 'Only if…', type: 'select', options: Object.entries(CONDITIONS), rerender: true },
    { key: 'cond.value', label: 'Item', type: 'select', options: items, show: (r) => r.cond?.type === 'item' },
    { key: 'cond.value', label: 'Quest', type: 'select', options: () => (game.quests || []).map((q) => [q.id, q.name]), show: (r) => ['quest', 'questdone', 'noquest'].includes(r.cond?.type) },
    { key: 'cond.value', label: 'Value', type: 'text', show: (r) => condNeeds(r) && !['item', 'quest', 'questdone', 'noquest'].includes(r.cond.type), placeholder: 'flag name or number' },
    { key: 'elseText', label: 'Reply otherwise', type: 'textarea', rows: 2, show: condNeeds },
    { key: 'action.type', label: 'Then…', type: 'select', options: Object.entries(ACTIONS), rerender: true },
    { key: 'action.value', label: 'Item', type: 'select', options: items, show: (r) => ['give_item', 'take_item'].includes(act(r)) },
    { key: 'action.value', label: 'Fights as', type: 'select', options: monsters, show: (r) => act(r) === 'fight' },
    { key: 'action.value', label: 'Flag name', type: 'text', show: (r) => ['set_flag', 'clear_flag'].includes(act(r)) },
    { key: 'action.value', label: 'Quest', type: 'select', options: () => (game.quests || []).map((q) => [q.id, q.name]), show: (r) => ['start_quest', 'advance_quest', 'complete_quest'].includes(act(r)) },
    // (company) who leaves: this person, or a companion named here
    { key: 'action.value', label: 'Who leaves', type: 'select', options: () => recruitables(game), empty: '— this person —', show: (r) => act(r) === 'leave_party', hint: 'They leave by their own leaving rule (its words, a fight, where they go), if they have one.' },
    { key: 'action.n', label: 'Amount', type: 'number', min: 1, show: (r) => ['give_item', 'take_item', 'give_gold', 'take_gold', 'give_xp'].includes(act(r)) },
    { key: 'action.map', label: 'To map', type: 'select', options: maps, show: (r) => act(r) === 'teleport' },
    { key: 'action.x', label: 'X', type: 'number', show: (r) => act(r) === 'teleport' },
    { key: 'action.y', label: 'Y', type: 'number', show: (r) => act(r) === 'teleport' },
    { key: 'once', label: 'Only once', type: 'check', hint: 'After the first time, give a different reply.' },
    { key: 'afterText', label: 'Reply afterwards', type: 'textarea', rows: 2, show: (r) => r.once },
  ];
}

// (company) a companion's words on the road, and when (and how) they leave
export function companionFields(game, mapId = null) {
  const maps = () => game.maps.map((m) => [m.id, m.name]);
  const monsters = () => game.monsters.map((m) => [m.id, `${m.name} (lvl ${m.level})`]);
  const lv = (o) => o.recruit?.leaves;
  const how = (o) => (lv(o)?.hostile ? 'hostile' : lv(o)?.goTo ? 'goTo' : 'gone');
  return [
    { type: 'section', label: 'On the road' },
    { type: 'info', label: 'Lines they say in the log (with their portrait) while in the company: when the company enters a place, or when a story flag is set. At most one line every little while, so they never chatter.' },
    { key: 'recruit.banter', label: 'Banter', type: 'list', wide: true, addLabel: '+ Add a line', newRow: () => ({ text: '', once: true }),
      rowLabel: (r) => (r.text ? `“${String(r.text).slice(0, 34)}${String(r.text).length > 34 ? '…' : ''}”` : '(a new line)'),
      fields: [
        { key: 'text', label: 'Says', type: 'textarea', rows: 2, placeholder: 'Smell that? Salt. We are near the sea at last.' },
        { key: 'map', label: 'On entering', type: 'select', options: maps, empty: '— anywhere —', nullable: true },
        { key: 'need', label: 'When', type: 'text', list: 'cs-flags', placeholder: 'flag  ·  a,b both  ·  a|b either  ·  !a not', hint: 'Story flags that must be set (blank: any time). Said when they come true.' },
        { key: 'once', label: 'Only once', type: 'check' },
      ] },
    { key: 'recruit.leaves', label: 'May leave the company', type: 'check', get: (o) => !!lv(o),
      put: (o, v) => { if (v) o.recruit.leaves = { need: '', text: '' }; else delete o.recruit.leaves; },
      hint: 'Going home, or a betrayal. Their own kit goes with them; what the company gave them comes back to the pack. Sets the flag left_<their id>.' },
    { key: 'recruit.leaves.need', label: 'Leaves when', type: 'text', list: 'cs-flags', placeholder: 'e.g. found_letter', show: (o) => !!lv(o), hint: 'Story flags, as above. Or let a conversation (“A companion leaves”) or an event decide.' },
    { key: 'recruit.leaves.text', label: 'Says as they go', type: 'textarea', rows: 2, show: (o) => !!lv(o) },
    { key: 'recruit.leaves.how', label: 'Then', type: 'select', show: (o) => !!lv(o), rerender: true, get: how,
      options: [['gone', 'They are gone'], ['goTo', 'They go somewhere, to be found and talked to'], ['hostile', 'They turn on the company: a fight']],
      put: (o, v) => {
        const l = o.recruit.leaves;
        delete l.hostile; delete l.goTo;
        if (v === 'hostile') l.hostile = { monster: game.monsters.find((m) => /bandit|cultist|knight/.test(m.id))?.id || game.monsters[0]?.id, count: '1' };
        if (v === 'goTo') l.goTo = { map: mapId || game.maps[0]?.id, x: o.x, y: o.y };
      } },
    { key: 'recruit.leaves.hostile.monster', label: 'Fights as', type: 'select', options: monsters, show: (o) => how(o) === 'hostile', hint: 'They lead the fight under their own name and face; the monster gives their strength and escort.' },
    { key: 'recruit.leaves.hostile.count', label: 'How many', type: 'text', placeholder: '1', show: (o) => how(o) === 'hostile', hint: 'Of that monster, counting them; its escort comes too. Beating them sets defeated_<their id>.' },
    { key: 'recruit.leaves.goTo.map', label: 'Goes to', type: 'select', options: maps, show: (o) => how(o) === 'goTo' },
    { key: 'recruit.leaves.goTo.x', label: 'X', type: 'number', show: (o) => how(o) === 'goTo' },
    { key: 'recruit.leaves.goTo.y', label: 'Y', type: 'number', show: (o) => how(o) === 'goTo', hint: 'They keep their words there; give them some that wait on the flag left_<their id>.' },
    { key: 'recruit.leaves.goTo.greeting', label: 'Greets the company there with', type: 'textarea', rows: 2, show: (o) => how(o) === 'goTo', hint: 'Blank: their usual greeting.' },
    // (adventure) one who went somewhere may be won back
    { key: 'recruit.leaves.rejoin', label: 'Will join again when', type: 'text', list: 'cs-flags', placeholder: 'blank: never  ·  yes: any time  ·  or story flags', show: (o) => how(o) === 'goTo',
      get: (o) => (lv(o)?.rejoin === true ? 'yes' : lv(o)?.rejoin || ''), put: (o, v) => { const t = String(v || '').trim(); if (!t) delete o.recruit.leaves.rejoin; else o.recruit.leaves.rejoin = t === 'yes' ? true : t; },
      hint: 'Asked to JOIN again once these flags are set, they come back as they were when they left (their level, their own kit). They never leave a second time.' },
  ];
}

export function npcFields(game) {
  return [
    { type: 'section', label: 'Character' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'desc', label: 'Description', type: 'text', placeholder: 'a grizzled dwarf smith', hint: 'Shown as “You meet …”' },
    { key: 'role', label: 'Role', type: 'select', options: NPC_ROLES, rerender: true },
    { key: 'shopName', label: 'Name over the door', type: 'text', placeholder: 'The Gilded Griffin', show: (o) => !['villager', 'guard'].includes(o.role || 'villager'), hint: 'Names the building this person keeps (blank: a name is made up).' },
    { key: 'wander', label: 'Wanders up to', type: 'number', min: 0, max: 30, hint: 'tiles from home (0 = stays put)' },
    // (adventure) someone who comes and goes with the story
    { key: 'need', label: 'Here only while', type: 'text', list: 'cs-flags', placeholder: 'blank: always  ·  flag  ·  a,b  ·  !a', hint: 'Story flags: while they hold, this person is here; otherwise they are gone (a traitor fled once unmasked: !unmasked).' },
    { type: 'section', label: 'Conversation' },
    { key: 'greeting', label: 'Greeting', type: 'textarea', rows: 2 },
    { key: 'job', label: 'Answer to JOB', type: 'textarea', rows: 2 },
    { type: 'info', label: 'Players can always ask NAME, JOB and BYE. Add your own keywords below.' },
    { key: 'keywords', label: 'Keywords', type: 'list', fields: keywordFields(game), rowLabel: (r) => (r.key || '(new keyword)').toUpperCase(), newRow: () => ({ key: '', text: '' }), addLabel: '+ Add keyword', wide: true },
    { key: 'rumour', label: 'Rumour', type: 'text', hint: 'Barkeeps anywhere may repeat this when asked for RUMOURS.' },
    { type: 'section', label: 'Trade', show: (o) => !!SHOP_KINDS[o.role] || o.role === 'inn' },
    { key: 'shop.stock', label: 'Sells', type: 'multicheck', options: () => game.items.filter((i) => i.type !== 'quest').map((i) => [i.id, `${i.name} (◆${i.price})`]), show: (o) => !!SHOP_KINDS[o.role] },
    { key: 'shop.priceMod', label: 'Price multiplier', type: 'number', step: 0.1, min: 0.1, show: (o) => !!SHOP_KINDS[o.role], hint: '1 = normal prices' },
    { key: 'price', label: 'Room price per hero', type: 'number', min: 0, show: (o) => o.role === 'inn' },
    { type: 'section', label: 'The ship for sale', show: (o) => o.role === 'shipwright' },
    { type: 'info', label: 'Players ask about the SHIP and say BUY. Once paid for, she is moored on the world map in the nearest open water beside this person\'s site (or at the square below).', show: (o) => o.role === 'shipwright' },
    { key: 'ship.name', label: 'Ship\'s name', type: 'text', placeholder: 'Seahorse', show: (o) => o.role === 'shipwright' },
    { key: 'ship.price', label: 'Price (gold)', type: 'number', min: 0, placeholder: '450', show: (o) => o.role === 'shipwright' },
    { key: 'ship.pitch', label: 'Says of her', type: 'textarea', rows: 2, show: (o) => o.role === 'shipwright', hint: 'The price is added after.' },
    { key: 'ship.x', label: 'Moored at X (world map)', type: 'number', nullable: true, show: (o) => o.role === 'shipwright', hint: 'Blank: beside the site.' },
    { key: 'ship.y', label: 'Moored at Y (world map)', type: 'number', nullable: true, show: (o) => o.role === 'shipwright' },
    { type: 'section', label: 'Appearance' },
    ...LOOK_FIELDS,
  ];
}

export function inspectEntity(ed, ent, container) {
  const game = ed.game;
  clear(container);
  const changed = () => { ed.markDirty(); ed.refreshEntity(ent); };
  const head = (title, sub) => h('div.insp-head', h('b', title), sub ? h('span', sub) : null);
  const del = h('button.danger.small', { onclick: () => { ed.beginEdit(); ed.removeEntity(ent); } }, 'Delete');
  switch (ent.type) {
    case 'npc': {
      container.appendChild(head('Person', `at ${ent.x}, ${ent.y}`));
      const onRole = () => {
        if (ent.role === 'shipwright' && !ent.ship) ent.ship = { name: 'Seahorse', price: 450 };
        const kind = SHOP_KINDS[ent.role];
        if (kind) {
          if (!ent.shop || ent.shop.kind !== kind) ent.shop = { kind, stock: defaultStock(game, kind), priceMod: 1 };
        } else ent.shop = null;
      };
      // a sage placed before sages sold scrolls has no shop yet: ticking stock opens one
      container.appendChild(buildForm(ent, npcFields(game), (k) => { if (k === 'role') onRole(); if (ent.shop && !ent.shop.kind) ent.shop.kind = SHOP_KINDS[ent.role]; changed(); }));
      // companion section (custom)
      flagDatalist(game); // (company) suggestions for the flag fields
      const rec = h('div.form');
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!ent.recruit;
      const sub = h('div');
      const renderRec = () => {
        clear(sub);
        if (!ent.recruit) return;
        sub.appendChild(buildForm(ent, [
          { key: 'recruit.cls', label: 'Joins as', type: 'select', options: () => game.classes.map((c) => [c.id, c.name]) },
          { key: 'recruit.race', label: 'Race', type: 'select', options: () => game.races.map((r) => [r.id, r.name]) },
          { key: 'recruit.level', label: 'Level', type: 'number', min: 1, max: 20 },
          { key: 'recruit.arts', label: 'Knows these battle arts', type: 'multicheck', options: () => battleArts(game).map((a) => [a.id, a.name]),
            hint: 'Skills any calling can learn (Abilities → battle arts); the rest come with their class and level' },
          { key: 'recruit.joinText', label: 'Says on joining', type: 'text' },
          { key: 'recruit.after', label: 'Joins after quest', type: 'select', options: () => [['', '— any time —'], ...(game.quests || []).map((q) => [q.id, q.name])], hint: 'Only once this quest is done; they ask to join as it ends' },
          { key: 'recruit.offerText', label: 'Says when offering', type: 'text', show: (o) => !!o.recruit?.after },
          ...companionFields(game, ed.map?.id),
        ], changed));
      };
      cb.addEventListener('change', () => {
        ent.recruit = cb.checked ? { cls: game.classes[0].id, race: ent.look?.race && game.races.some((r) => r.id === ent.look.race) ? ent.look.race : game.races[0].id, level: 1, joinText: 'I will join thee!' } : undefined;
        renderRec(); changed();
      });
      rec.append(h('div.form-section', 'Companion'), h('label.field.check', cb, h('span.field-label', 'Can JOIN the party')), sub);
      renderRec();
      container.appendChild(rec);
      container.appendChild(npcQuestSection(ed, ent));
      break;
    }
    case 'monster': {
      const def = game.monsters.find((m) => m.id === ent.monster);
      container.appendChild(head('Monster group', def ? def.name : ''));
      container.appendChild(buildForm(ent, [
        { key: 'monster', label: 'Monster', type: 'select', options: () => game.monsters.map((m) => [m.id, `${m.name} (lvl ${m.level})`]), rerender: true },
        { key: 'count', label: 'How many', type: 'text', placeholder: '2-4', hint: 'A number or a range. Escorts are added automatically.' },
        { key: 'wander', label: 'Roams up to', type: 'number', min: 0, max: 99, hint: 'tiles from home (0 = guards its post)' },
        { key: 'leash', label: 'Gives up the chase beyond', type: 'number', min: 0, max: 99, nullable: true, placeholder: String(DEFAULT_LEASH), hint: `tiles between the party and its home; then it walks back (empty = ${DEFAULT_LEASH}, 0 = never gives up)` },
        { key: 'passive', label: 'Never gives chase', type: 'check' },
        { key: 'boss', label: 'Boss (drawn larger)', type: 'check' },
        { key: 'flag', label: 'Sets flag when defeated', type: 'text', placeholder: 'e.g. troll_slain' },
        { key: 'loot', label: 'Carrying (found when beaten)', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]), hint: 'A treasure map, a key, a stolen heirloom…' },
      ], (k) => { if (k === 'monster') ed.lastMonster = ent.monster; changed(); if (k === 'monster') { ed.refreshEntities(); } }));
      break;
    }
    case 'chest': {
      // (containers) a chest may be drawn as something else, and called by name
      const auto = (o) => {
        const k = chestLook({ ...o, look: null }, ed.map, isHoard(ed.map, o)).kind;
        return { kind: k, why: o.name && containerLookFor(o.name) ? 'from its name' : k !== 'chest' ? 'suits the dungeon' : '' };
      };
      const lookName = CONTAINERS[chestLook(ent, ed.map, isHoard(ed.map, ent)).kind]?.label;
      container.appendChild(head(ent.name || 'Treasure chest', lookName && lookName !== 'Treasure chest' ? lookName : ''));
      container.appendChild(buildForm(ent, [
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Overturned Cart', hint: 'Shown when pointed at, and in what opening it says: "You search the Overturned Cart…". A name such as "Hollow Oak" or "Old Cairn" also picks its look.' },
        ...containerLookFields(auto, { hint: 'What the treasure is found in. The words follow: you lift a loose flagstone, rummage through sacks, search a fallen adventurer.' }),
        { key: 'gold', label: 'Gold', type: 'dice', placeholder: '3d20 or 50' },
        { key: 'items', label: 'Items', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]) },
        { key: 'locked', label: 'Locked (needs a key or a burglar)', type: 'check' },
        { key: 'trap', label: 'Trapped', type: 'check' },
        { key: 'flag', label: 'Sets flag when opened', type: 'text' },
        // (charms) ways only a worn charm opens, and a hoard's charm
        { key: 'sealed', label: 'Sealed by magic (opens only to a charm of opening, e.g. a Ring of Opening)', type: 'check' },
        { key: 'sealedText', label: 'Said when it will not open', type: 'textarea', rows: 2, show: (o) => !!o.sealed },
        { key: 'unseen', label: 'Hidden from mortal eyes (only true sight, e.g. an Owl Feather, finds it)', type: 'check' },
        { key: 'hoard', label: 'A hoard: also holds a charm, chosen for the company when opened', type: 'check', get: (o) => isHoard(ed.map, o), hint: 'A dungeon\'s final chest is one unless unticked.' },
      ], changed));
      break;
    }
    case 'treasure': {
      container.appendChild(head('Buried treasure', `at ${ent.x}, ${ent.y}`));
      if (ent.bonus === undefined) ent.bonus = true; // (the game treats a missing one as on)
      container.appendChild(buildForm(ent, [
        { key: 'name', label: 'Name', type: 'text', placeholder: 'The Smugglers\' Hoard' },
        { key: 'clue', label: 'Clue on the map', type: 'textarea', rows: 3, hint: 'Count the paces from something the player can find: "Three paces east of the lone standing stone".' },
        { key: 'gold', label: 'Gold', type: 'dice', placeholder: '6d20 or 150' },
        { key: 'items', label: 'Items', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]) },
        { key: 'bonus', label: 'Extra gold and gear for stronger companies', type: 'check', hint: 'On unless unticked: more gold and a piece of gear that grow with the party\'s level.' },
        { key: 'guardian', label: 'Guarded by', type: 'select', options: () => game.monsters.map((m) => [m.id, `${m.name} (lvl ${m.level})`]), empty: '— nothing —', nullable: true, rerender: true },
        { key: 'count', label: 'How many', type: 'text', placeholder: '1 or 2-3', show: (o) => !!o.guardian },
        { key: 'guardChance', label: 'Chance they rise', type: 'number', step: 0.05, min: 0, max: 1, nullable: true, show: (o) => !!o.guardian, hint: 'Blank = always.' },
        { key: 'guardText', label: 'When they rise', type: 'textarea', rows: 2, show: (o) => !!o.guardian },
      ], changed));
      const maps = game.items.filter((it) => it.type === 'map' && it.treasure === ent.id);
      container.appendChild(h('div.form', h('div.form-section', 'Its map'),
        maps.length ? h('p.hint', `Led to by: ${maps.map((it) => it.name).join(', ')} (edit it under World data → Items). Give it out in a chest, a shop, a quest reward or a monster band's loot.`)
          : h('p.hint', 'No map leads here yet.'),
        h('div.row', h('button.small', {
          onclick: () => { game.items.push(newMapItem(ent, { name: `Map to ${ent.name || 'Buried Treasure'}` })); ed.markDirty(); inspectEntity(ed, ent, container); toast('A new map item was made.'); },
        }, '+ Make a map item'), h('button.small', {
          onclick: () => { ent.clue = clueFor(ed.map, ent.x, ent.y); ent.from = landmarksNear(ed.map, ent.x, ent.y)[0]?.e.id; ed.markDirty(); inspectEntity(ed, ent, container); },
        }, '🎲 Write a clue from the landmarks'))));
      break;
    }
    case 'sign':
      container.appendChild(head('Signpost'));
      container.appendChild(buildForm(ent, [{ key: 'text', label: 'It reads', type: 'textarea', rows: 4 }], changed));
      break;
    case 'event':
      inspectEvent(ed, ent, container, head, changed);
      break;
    case 'ship':
      container.appendChild(head('Ship'));
      container.appendChild(buildForm(ent, [{ key: 'name', label: 'Name', type: 'text', placeholder: 'Seahorse' }], changed));
      container.appendChild(h('p.hint', 'The party boards by walking onto the ship, sails across water, and goes ashore by stepping onto land. The ship stays where they leave it. (A shipwright sells ships: give a person the Shipwright role.)'));
      break;
    case 'portal': {
      container.appendChild(head(ent.style === 'waygate' ? 'Waygate' : ent.style === 'site' ? 'Site entrance' : 'Passage'));
      const mapOpts = () => [['exit', '↩ Leave this map (to where it was entered from)'], ...game.maps.map((m) => [m.id, `${m.name} (${m.type})`])];
      container.appendChild(buildForm(ent, [
        { key: 'label', label: 'Name', type: 'text' },
        { key: 'style', label: 'Looks like', type: 'select', options: [['site', 'The tile itself (towns, caves…)'], ['stairs', 'Stairs tile'], ['waygate', 'Glowing waygate'], ['hidden', 'Nothing (hidden)']] },
        { key: 'target.map', label: 'Leads to', type: 'select', options: mapOpts, rerender: true },
        { key: 'target.x', label: 'Arrive at X', type: 'number', nullable: true, show: (o) => o.target?.map !== 'exit', hint: 'blank = that map\'s arrival point' },
        { key: 'target.y', label: 'Arrive at Y', type: 'number', nullable: true, show: (o) => o.target?.map !== 'exit' },
        { key: 'requires', label: 'Requires item', type: 'select', empty: '— nothing —', nullable: true, options: () => game.items.map((i) => [i.id, i.name]) },
        { key: 'lockedText', label: 'Message when barred', type: 'textarea', rows: 2, show: (o) => !!o.requires },
        // (charms) a way sealed by magic, or hidden from mortal eyes
        { key: 'sealed', label: 'Sealed by magic (only a charm of opening opens it)', type: 'check' },
        { key: 'sealedText', label: 'Said when it will not open', type: 'textarea', rows: 2, show: (o) => !!o.sealed },
        { key: 'unseen', label: 'Hidden from mortal eyes (only true sight finds it)', type: 'check' },
      ], changed));
      const tgt = game.maps.find((m) => m.id === ent.target?.map);
      if (tgt) {
        container.appendChild(h('div.row',
          h('button', { onclick: () => ed.pickTarget(ent) }, '🎯 Pick arrival point'),
          h('button', { onclick: () => ed.openLinkedMap(ent) }, `Open “${tgt.name}” →`)));
      }
      break;
    }
    default:
      if (isPuzzle(ent)) inspectPuzzle(ed, ent, container, head, changed); // (puzzles)
      else container.appendChild(head(ent.type));
  }
  container.appendChild(h('div.insp-foot', del));
}

export function inspectMap(ed, container) {
  const game = ed.game, map = ed.map;
  clear(container);
  container.appendChild(h('div.insp-head', h('b', 'Map properties'), h('span', `${map.w} × ${map.h}`)));
  const form = buildForm(map, [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'type', label: 'Kind', type: 'select', options: Object.entries(MAP_TYPES).map(([k, v]) => [k, v.label]) },
    { key: 'lighting', label: 'Lighting', type: 'select', options: [['day', 'Daylight'], ['dusk', 'Dusk'], ['night', 'Night'], ['dark', 'Dark (needs light)']], rerender: true },
    { key: 'fill', label: 'Beyond the edge', type: 'select', options: TERRAIN_LIST.map((t) => [t.key, t.name]) },
    { key: 'encounterRate', label: 'Random encounters', type: 'number', min: 0, max: 4, step: 0.25, hint: '0 = none, 1 = normal' },
    { key: 'level', label: 'Danger level', type: 'number', min: 1, max: 10, hint: 'Raises the strength of random monsters here.' },
    { key: 'encounters', label: 'Only these monsters', type: 'multicheck', options: () => game.monsters.filter((m) => !m.boss).map((m) => [m.id, m.name]), hint: 'Leave all unticked to allow any monster suited to the terrain.' },
  ], (k) => {
    ed.markDirty();
    if (k === 'lighting') ed.view.setLighting(map.lighting);
    if (k === 'fill' || k === 'name') ed.reloadMap();
    if (k === 'name' || k === 'type') ed.refreshMapList();
    // (delve) the battleground default follows the kind; a redrawn form needs its box again
    if ((k === 'type' && map.battleground == null) || k === 'lighting') setTimeout(() => { if (container.isConnected && ed.map === map) inspectMap(ed, container); });
  });
  container.appendChild(form);
  // (delve) dungeons are fought over where they stand, unless the designer says otherwise
  const bg = h('input', { type: 'checkbox' });
  bg.checked = isBattleground(map);
  bg.addEventListener('change', () => { map.battleground = bg.checked; ed.markDirty(); });
  if (map.type !== 'world') form.insertBefore(h('label.field.check.dv-bg', { title: 'On by default for dungeons: turn it on for, say, a haunted castle, or off for a peaceful mine' }, bg, h('span.field-label', 'Battleground'),
    h('span.field-hint', 'Every monster stands on the map and each hero walks a square of their own; monsters wake when they notice a hero, and the battle is fought right here. On by default for dungeons.')), form.children[3] || null);
  if (map.exit) {
    const back = game.maps.find((m) => m.id === map.exit.map);
    container.appendChild(h('p.hint', `Walking off the edge leads back to ${back ? back.name : '?'} (${map.exit.x}, ${map.exit.y}).`));
  }
  // resize
  const wIn = h('input', { type: 'number', value: map.w, min: 8, max: 256 });
  const hIn = h('input', { type: 'number', value: map.h, min: 8, max: 256 });
  container.appendChild(h('div.form-section', 'Size'));
  container.appendChild(h('div.row', wIn, h('span', '×'), hIn, h('button.small', {
    onclick: async () => {
      const w = Math.max(8, Math.min(256, parseInt(wIn.value, 10) || map.w));
      const hh = Math.max(8, Math.min(256, parseInt(hIn.value, 10) || map.h));
      if (w === map.w && hh === map.h) return;
      if (!(await confirmDialog(`Resize to ${w} × ${hh}? The map is kept centred; anything outside is cut off.`))) return;
      ed.beginEdit();
      ed.resizeMap(w, hh);
    },
  }, 'Resize')));
  if (game.maps.length > 1 && map !== game.maps[0]) {
    container.appendChild(h('div.insp-foot', h('button.danger.small', {
      onclick: async () => {
        if (!(await confirmDialog(`Delete the map “${map.name}”? Portals leading here will stop working.`))) return;
        ed.deleteMap(map);
      },
    }, 'Delete this map')));
  } else {
    container.appendChild(h('p.hint', 'This is the main world map.'));
  }
  void toast;
}
