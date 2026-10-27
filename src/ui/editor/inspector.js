// Inspector panels for map entities and map properties.
import { h, clear, confirmDialog, toast } from '../dom.js';
import { buildForm } from './forms.js';
import { ACTIONS, CONDITIONS } from '../../game/dialog.js';
import { TERRAIN_LIST } from '../../data/terrain.js';
import { MAP_TYPES } from '../../world/map.js';
import { defaultStock } from '../../world/generate.js';

const RACES = [['human', 'Human'], ['elf', 'Elf'], ['dwarf', 'Dwarf'], ['hobbit', 'Halfling'], ['orc', 'Orc'], ['goblin', 'Goblin'], ['troll', 'Troll'], ['skeleton', 'Skeleton']];
const HATS = [['none', 'None'], ['wizard', 'Wizard hat'], ['helm', 'Helm'], ['hornhelm', 'Horned helm'], ['hood', 'Hood'], ['crown', 'Crown'], ['circlet', 'Circlet'], ['cap', 'Feathered cap']];
const WEAPONS = [['none', 'None'], ['sword', 'Sword'], ['greatsword', 'Great sword'], ['axe', 'Axe'], ['hammer', 'Hammer'], ['mace', 'Mace'], ['club', 'Club'], ['staff', 'Staff'], ['spear', 'Spear'], ['dagger', 'Dagger'], ['bow', 'Bow']];
const ARMORS = [['', 'None'], ['leather', 'Leather'], ['chain', 'Chain'], ['plate', 'Plate']];
export const NPC_ROLES = [
  ['villager', 'Villager'], ['guard', 'Guard'], ['lord', 'Lord / King'], ['sage', 'Sage'],
  ['weapons', 'Weaponsmith (shop)'], ['armor', 'Armourer (shop)'], ['provisions', 'Provisioner (shop)'], ['reagents', 'Herbalist (shop)'], ['bowyer', 'Bowyer (shop)'],
  ['inn', 'Innkeeper'], ['tavern', 'Barkeep (rumours)'], ['healer', 'Healer'],
];
const SHOP_KINDS = { weapons: 'weapons', armor: 'armor', provisions: 'provisions', reagents: 'reagents', bowyer: 'weapons' };

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
    { key: 'cond.value', label: 'Value', type: 'text', show: (r) => condNeeds(r) && r.cond.type !== 'item', placeholder: 'flag name or number' },
    { key: 'elseText', label: 'Reply otherwise', type: 'textarea', rows: 2, show: condNeeds },
    { key: 'action.type', label: 'Then…', type: 'select', options: Object.entries(ACTIONS), rerender: true },
    { key: 'action.value', label: 'Item', type: 'select', options: items, show: (r) => ['give_item', 'take_item'].includes(act(r)) },
    { key: 'action.value', label: 'Fights as', type: 'select', options: monsters, show: (r) => act(r) === 'fight' },
    { key: 'action.value', label: 'Flag name', type: 'text', show: (r) => ['set_flag', 'clear_flag'].includes(act(r)) },
    { key: 'action.n', label: 'Amount', type: 'number', min: 1, show: (r) => ['give_item', 'take_item', 'give_gold', 'take_gold', 'give_xp'].includes(act(r)) },
    { key: 'action.map', label: 'To map', type: 'select', options: maps, show: (r) => act(r) === 'teleport' },
    { key: 'action.x', label: 'X', type: 'number', show: (r) => act(r) === 'teleport' },
    { key: 'action.y', label: 'Y', type: 'number', show: (r) => act(r) === 'teleport' },
    { key: 'once', label: 'Only once', type: 'check', hint: 'After the first time, give a different reply.' },
    { key: 'afterText', label: 'Reply afterwards', type: 'textarea', rows: 2, show: (r) => r.once },
  ];
}

export function npcFields(game) {
  return [
    { type: 'section', label: 'Character' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'desc', label: 'Description', type: 'text', placeholder: 'a grizzled dwarf smith', hint: 'Shown as “You meet …”' },
    { key: 'role', label: 'Role', type: 'select', options: NPC_ROLES, rerender: true },
    { key: 'wander', label: 'Wanders up to', type: 'number', min: 0, max: 30, hint: 'tiles from home (0 = stays put)' },
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
        const kind = SHOP_KINDS[ent.role];
        if (kind) {
          if (!ent.shop || ent.shop.kind !== kind) ent.shop = { kind, stock: defaultStock(game, kind), priceMod: 1 };
        } else ent.shop = null;
      };
      container.appendChild(buildForm(ent, npcFields(game), (k) => { if (k === 'role') onRole(); changed(); }));
      // companion section (custom)
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
          { key: 'recruit.joinText', label: 'Says on joining', type: 'text' },
        ], changed));
      };
      cb.addEventListener('change', () => {
        ent.recruit = cb.checked ? { cls: game.classes[0].id, race: ent.look?.race && game.races.some((r) => r.id === ent.look.race) ? ent.look.race : game.races[0].id, level: 1, joinText: 'I will join thee!' } : undefined;
        renderRec(); changed();
      });
      rec.append(h('div.form-section', 'Companion'), h('label.field.check', cb, h('span.field-label', 'Can JOIN the party')), sub);
      renderRec();
      container.appendChild(rec);
      break;
    }
    case 'monster': {
      const def = game.monsters.find((m) => m.id === ent.monster);
      container.appendChild(head('Monster group', def ? def.name : ''));
      container.appendChild(buildForm(ent, [
        { key: 'monster', label: 'Monster', type: 'select', options: () => game.monsters.map((m) => [m.id, `${m.name} (lvl ${m.level})`]), rerender: true },
        { key: 'count', label: 'How many', type: 'text', placeholder: '2-4', hint: 'A number or a range. Escorts are added automatically.' },
        { key: 'wander', label: 'Roams up to', type: 'number', min: 0, max: 99, hint: 'tiles from home (0 = guards its post)' },
        { key: 'passive', label: 'Never gives chase', type: 'check' },
        { key: 'boss', label: 'Boss (drawn larger)', type: 'check' },
        { key: 'flag', label: 'Sets flag when defeated', type: 'text', placeholder: 'e.g. troll_slain' },
      ], (k) => { if (k === 'monster') ed.lastMonster = ent.monster; changed(); if (k === 'monster') { ed.refreshEntities(); } }));
      break;
    }
    case 'chest':
      container.appendChild(head('Treasure chest'));
      container.appendChild(buildForm(ent, [
        { key: 'gold', label: 'Gold', type: 'dice', placeholder: '3d20 or 50' },
        { key: 'items', label: 'Items', type: 'itemlist', options: () => game.items.map((i) => [i.id, i.name]) },
        { key: 'locked', label: 'Locked (needs a key or a burglar)', type: 'check' },
        { key: 'trap', label: 'Trapped', type: 'check' },
        { key: 'flag', label: 'Sets flag when opened', type: 'text' },
      ], changed));
      break;
    case 'sign':
      container.appendChild(head('Signpost'));
      container.appendChild(buildForm(ent, [{ key: 'text', label: 'It reads', type: 'textarea', rows: 4 }], changed));
      break;
    case 'ship':
      container.appendChild(head('Ship'));
      container.appendChild(h('p.hint', 'The party boards by walking onto the ship, sails across water, and goes ashore by stepping onto land. The ship stays where they leave it.'));
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
      container.appendChild(head(ent.type));
  }
  container.appendChild(h('div.insp-foot', del));
}

export function inspectMap(ed, container) {
  const game = ed.game, map = ed.map;
  clear(container);
  container.appendChild(h('div.insp-head', h('b', 'Map properties'), h('span', `${map.w} × ${map.h}`)));
  container.appendChild(buildForm(map, [
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
    if (k === 'name') ed.refreshMapList();
  }));
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
