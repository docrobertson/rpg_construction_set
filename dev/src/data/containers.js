// Things treasure is kept in besides a chest: an overturned cart, a loose
// flagstone, a dead adventurer's satchel... A chest (or a "Hidden cache"
// event) may carry look: { kind, color? } naming one of these; without one it
// takes the look its name suggests ("Overturned Cart" → the cart), and a
// chest the dungeon generator left lying about takes one that suits the
// dungeon. The words a chest is opened with follow its look ("You lift the
// loose flagstone. Beneath it: …").
// (Pure data: the editor and the tests read it without the 3D code; the
// models themselves are in render/containers.js.)
import { terrain } from './terrain.js';

// label: in the editor · a: when pointed at · noun: in the messages
// verb: the hover's "Click to …" and the menu's "<Verb> the …"
// find / empty: what opening it says ({the}, {The}: its name; {loot}: what
// was found); words: what in a name or description calls for it
const C = (label, a, noun, verb, find, empty, words, more = {}) => ({ label, a, noun, verb, find, empty, words, ...more });

export const CONTAINERS = {
  chest: C('Treasure chest', 'a chest', 'chest', 'open', '{The} holds: {loot}.', '{The} is empty.', ['chest', 'coffer', 'trunk']),
  cart: C('Overturned cart', 'an overturned cart', 'overturned cart', 'search', 'You search {the} and find {loot}.', 'You search {the}, but whoever came before you left nothing worth taking.', ['cart', 'wagon', 'wain', 'barrow-cart']),
  flagstone: C('Loose flagstone', 'a loose flagstone', 'loose flagstone', 'lift', 'You lift {the}. Beneath it: {loot}.', 'You lift {the}. There is nothing beneath it but beetles.', ['flagstone', 'flag-stone', 'loose stone', 'paving stone', 'loose slab', 'slab', 'trapdoor']),
  wallstone: C('Loose stone in a wall', 'a loose stone in a wall', 'loose stone', 'pull out', 'You work {the} free. In the hollow behind it: {loot}.', 'You work {the} free. Behind it there is only dust.', ['loose stones? in (the|a|an old) wall', 'loose brick', 'hole in the wall', 'brickwork', 'masonry']),
  barrels: C('Barrels', 'some barrels', 'barrels', 'search', 'You prise the lids off {the}: {loot}.', 'You prise the lids off {the}. Stale water and sawdust, nothing more.', ['barrel', 'keg', 'cask', 'tun', 'hogshead'], { plural: true }),
  crates: C('Stacked crates', 'some crates', 'crates', 'search', 'You prise open {the}: {loot}.', 'You prise open {the}. Straw, and nothing else.', ['crate', 'cargo', 'packing case', 'stores'], { plural: true }),
  sacks: C('Sacks', 'some sacks', 'sacks', 'search', 'You rummage through {the} and find {loot}.', 'You rummage through {the}. Mouldy grain, nothing more.', ['sack', 'grain', 'flour', 'bundle', 'bag'], { plural: true }),
  urns: C('Clay urns', 'some clay urns', 'urns', 'search', 'You tip out {the}: {loot}.', 'You tip out {the}. Only dust and old ashes.', ['urn', 'amphora', 'amphorae', 'jar', 'pot', 'vase', 'pitcher']),
  sarcophagus: C('Stone sarcophagus', 'a stone sarcophagus', 'sarcophagus', 'open', 'You heave the lid of {the} aside. Within, among the bones: {loot}.', 'You heave the lid of {the} aside. Within lie only bones.', ['sarcophag(us|i)', 'tomb', 'effigy']),
  coffin: C('Wooden coffin', 'a coffin', 'coffin', 'open', 'You prise up the lid of {the}: {loot}.', 'You prise up the lid of {the}. It holds only bones.', ['coffin', 'casket', 'bier']),
  strongbox: C('Iron strongbox', 'an iron strongbox', 'strongbox', 'open', '{The} swings open: {loot}.', '{The} swings open. It is empty.', ['strongbox', 'strong-box', 'strong box', 'lockbox', 'pay-chest', 'pay chest', 'money-box', 'iron box', 'iron-bound box']),
  hollowlog: C('Hollow log', 'a hollow log', 'hollow log', 'search', 'You reach into {the} and pull out {loot}.', 'You reach into {the}. Leaves, and a startled beetle.', ['log', 'hollow (tree|oak|trunk)', 'fallen (tree|oak|pine)', 'stump']),
  nest: C('Great nest', 'a great nest', 'nest', 'search', 'Among the twigs and eggshells of {the}: {loot}.', 'You search {the}. Twigs and eggshells, nothing more.', ['nest', 'eyrie', 'roost']),
  remains: C('Fallen adventurer', 'the bones of an adventurer', 'fallen adventurer', 'search', 'You search {the}. In the satchel: {loot}.', 'You search {the}. The satchel is empty.', ['skeleton', 'bones', 'remains', 'corpse', 'fallen (adventurer|knight|soldier|explorer)', 'satchel', 'knapsack', 'dead (man|adventurer|explorer)']),
  cairn: C('Cairn of stones', 'a cairn', 'cairn', 'search', 'You lift away the stones of {the}. Beneath them: {loot}.', 'You lift away the stones of {the}. Beneath them, only earth.', ['cairn', '(pile|heap) of stones', 'rubble', 'rock ?pile']),
  bookcase: C('Bookcase', 'a bookcase', 'bookcase', 'search', 'Behind a row of books in {the} you find a hidden drawer: {loot}.', 'You search {the}, but find only books.', ['bookcase', 'book-case', 'bookshel(f|ves)', 'shel(f|ves)', 'library', 'lectern', 'desk']),
  runechest: C('Dwarven rune-chest', 'a rune-chest', 'rune-chest', 'open', 'The runes flare, and {the} opens: {loot}.', 'The runes flare, and {the} opens. It is empty.', ['rune-?chest', 'rune chest', 'dwar(f|ven|vish) (chest|vault|coffer)', 'vault']),
  seachest: C('Sea chest in the sand', 'a sea chest', 'sea chest', 'dig up', 'You dig {the} out of the sand and break it open: {loot}.', 'You dig {the} out of the sand. It holds only sea-water.', ['sea-?chest', 'sea chest', 'sailor\'?s chest', 'pirate', 'shipwreck', 'flotsam', 'driftwood']),
  reliquary: C('Reliquary on an altar', 'a reliquary', 'reliquary', 'open', 'You open {the}: {loot}.', 'You open {the}. It is empty.', ['reliquar(y|ies)', 'relic', 'altar', 'offerings?']),
};

// [kind, label] for the editor's "Looks like" lists
export const CONTAINER_LOOKS = Object.entries(CONTAINERS).map(([k, c]) => [k, c.label]);
export const CONTAINER_KINDS = Object.keys(CONTAINERS);
export const isContainer = (kind) => !!CONTAINERS[kind];

// words → a test that matches them at the start of a word (and their plurals)
const WORD_TESTS = Object.entries(CONTAINERS).flatMap(([k, c]) => c.words.map((w) => [k, new RegExp(`\\b${w}(e?s)?\\b`, 'i')]));

// The container a name or description calls for, or null: the word that
// comes first wins (the longest if two start together), so "a barrel stamped
// with a skull" is a barrel and "a sea chest" is not just a chest.
export function containerLookFor(text) {
  if (!text) return null;
  let best = null;
  for (const [k, re] of WORD_TESTS) {
    const m = re.exec(String(text));
    if (m && (!best || m.index < best.at || (m.index === best.at && m[0].length > best.len))) best = { k, at: m.index, len: m[0].length };
  }
  return best ? best.k : null;
}

// What a dungeon's own chests are found in, by its style
// (a third of them still plain chests)
const BY_STYLE = {
  cave: ['remains', 'chest', 'sacks', 'barrels', 'chest', 'cairn'],
  crypt: ['sarcophagus', 'chest', 'urns', 'coffin', 'chest', 'remains', 'reliquary'],
  fortress: ['crates', 'chest', 'strongbox', 'barrels', 'chest', 'sacks'],
  seacave: ['barrels', 'chest', 'crates', 'sacks', 'chest', 'seachest'],
};
const STYLE_OF_FLOOR = { cave_floor: 'cave', dungeon_floor: 'crypt', floor_stone: 'fortress' };

// a whole number from a square, the same every time
const spot = (x, y) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

// The style a dungeon's container would suit: its plan's, else its floor's
export function dungeonStyle(map, x, y) {
  if (!map || map.type !== 'dungeon') return null;
  if (map.plan?.style && BY_STYLE[map.plan.style]) return map.plan.style;
  const t = map.tiles && x >= 0 && y >= 0 && x < map.w && y < map.h ? terrain(map.tiles[y * map.w + x]) : null;
  return (t && STYLE_OF_FLOOR[t.key]) || null;
}

// The look a chest is drawn with. Its own look; else what its name calls for;
// else, for a plain chest the dungeon generator made (gold as a number, at
// most a healing draught in it, no lock, trap or seal, not the hoard), one of
// the things that dungeon's style keeps treasure in, the same for the same
// square every time. (Nothing is written into the map, so generated maps stay
// as they were and old games change their looks too.)
export function chestLook(e, map = null, hoard = false) {
  if (e.look?.kind) return e.look;
  const named = e.name && containerLookFor(e.name);
  if (named) return { kind: named };
  return { kind: autoContainer(e, map, hoard) || 'chest' };
}

export function autoContainer(e, map, hoard = false) {
  if (hoard || typeof e.gold !== 'number' || e.locked || e.trap || e.sealed || e.name) return null;
  if ((e.items || []).some((it) => it.id !== 'healing_draught')) return null; // (a quest's prize waits in a chest)
  const style = dungeonStyle(map, e.x, e.y);
  if (!style) return null;
  const pool = BY_STYLE[style];
  return pool[spot(e.x, e.y) % pool.length];
}

// The look of a "Hidden cache" event without one of its own: what its name,
// else its description, calls for (null: the old dull chest)
export function cacheLook(e) {
  const k = containerLookFor(e.name) || containerLookFor(e.text);
  return k ? { kind: k } : null;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// common folk a name may belong to ("the Drowned Sailor's Sea-chest"), as
// against someone's own ("Black Maddoc's Sea-chest", "Ulfgar's Coffin")
const FOLK = /^(king|queen|lord|lady|hero|smuggler|sailor|poacher|pilgrim|wizard|giant|dragon|prisoner|climber|hunter|traveller|knight|soldier|miner|hermit|pedlar|merchant|captain|thie[fv]|bandit|goblin|orc|dwar[fv]|el[fv]|monk|priest)/i;
// "the Overturned Cart", "the King's Pay-chest", but "Black Maddoc's Sea-chest"
function theName(name) {
  if (/^(the|a|an) /i.test(name)) return name.replace(/^(the|a|an) /i, (m) => m.toLowerCase());
  const own = name.match(/^(?:\S+ )*?(\S+?)'s? /);
  if (own && /^[A-Z]/.test(own[1]) && !FOLK.test(own[1])) return name;
  return `the ${name}`;
}

// The words for a chest drawn as `kind` (its own name, if it has one):
// { title, a, the, The, verb, act, plural, opened(loot), empty(), locked… }
export function containerWords(e, kind = 'chest') {
  const c = CONTAINERS[kind] || CONTAINERS.chest;
  const name = String(e?.name || '').trim();
  const the = name ? theName(name) : `the ${c.noun}`;
  const fill = (t, loot = '') => t.replace(/\{the\}/g, the).replace(/\{The\}/g, cap(the)).replace(/\{loot\}/g, loot);
  const plural = !!c.plural && (!name || /s$/i.test(name));
  return {
    kind, plural, the, The: cap(the),
    title: name || cap(c.a),
    a: name ? the : c.a,
    verb: c.verb,
    act: `${cap(c.verb)} ${the}`,
    opened: (loot) => fill(c.find, loot),
    empty: () => fill(c.empty),
    locked: `${cap(the)} ${plural ? 'are' : 'is'} locked.`,
    sealed: `${cap(the)} ${plural ? 'are' : 'is'} sealed by a spell: no key or pick will open ${plural ? 'them' : 'it'}.`,
  };
}

// Caches for the wild: what a hidden cache found out in the land is, by the
// ground it lies on (a flagstone does not belong in a meadow)
export const WILD_CACHES = {
  forest: { name: 'Hollow Log', text: 'A fallen oak lies rotting among the ferns, hollow as a drum. Something has been pushed deep inside it, wrapped in oilcloth.', label: 'Reach inside' },
  pines: { name: 'Hollow Log', text: 'A fallen pine, hollow at the root end. Someone has stuffed a bundle inside and wedged a stone over it.', label: 'Reach inside' },
  hills: { name: 'Old Cairn', text: 'A cairn of grey stones on the hillside. One side has been taken down and built up again, not so long ago.', label: 'Lift the stones' },
  mountains: { name: 'Climber\'s Bones', text: 'A skeleton in a rotted cloak lies against the rocks, a satchel still buckled at its side. The mountain kept this one.', label: 'Search the satchel' },
  sand: { name: 'Half-buried Sea Chest', text: 'The corner of a brass-bound sea chest pokes out of the sand above the tide line.', label: 'Dig it out' },
  swamp: { name: 'Sunken Bones', text: 'Bones in the reeds, and the rags of a traveller who missed the path. A satchel hangs on a root beside them.', label: 'Search the satchel' },
  grass: { name: 'Overturned Cart', text: 'A pedlar\'s cart lies on its side by the track, one wheel smashed. Sacks are still lashed to the bed.', label: 'Search the cart' },
  meadow: { name: 'Overturned Cart', text: 'A farm cart lies on its side in the long grass, one wheel smashed. Sacks are still lashed to the bed.', label: 'Search the cart' },
  desert: { name: 'Bleached Bones', text: 'A skeleton half-buried in the dunes, picked clean by the wind. A leather satchel is still strapped across its ribs.', label: 'Search the satchel' },
  ash: { name: 'Charred Bones', text: 'Blackened bones in the ash, and a scorched satchel that somehow did not burn.', label: 'Search the satchel' },
  snow: { name: 'Frozen Bones', text: 'A traveller who never reached shelter sits frozen against a drift, a satchel on their knees.', label: 'Search the satchel' },
};

// ...and in a dungeon, by its style (a crypt keeps the loose flagstone)
export const DUNGEON_CACHES = {
  cave: { name: 'Fallen Adventurer', text: 'A skeleton lies against the rock in the rags of a cloak, a satchel still buckled at its side. Whoever it was never found the way out.', label: 'Search the satchel' },
  seacave: { name: 'Smugglers\' Barrels', text: 'Barrels stacked in a dry corner of the cave, each stamped with a skull. One still sloshes when you rock it.', label: 'Break them open' },
  fortress: { name: 'Loose Stone in the Wall', text: 'One stone in the wall sits a finger\'s width proud of the rest, and the mortar round it has been scraped away.', label: 'Work it free' },
};

// A hidden cache (an event made from the 'cache' template) fitted to where it
// lies: name, text and the first choice's label. Keeps the template's words
// where nothing fits.
export function fitCache(e, variant) {
  if (!variant) return e;
  Object.assign(e, { name: variant.name, text: variant.text });
  if (e.choices?.[0] && !e.choices[0].leave) e.choices[0] = { ...e.choices[0], label: variant.label };
  return e;
}
export const fitWildCache = (e, groundKey) => fitCache(e, WILD_CACHES[groundKey]);
