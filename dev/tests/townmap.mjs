// Print a settlement of the sample adventure as text, with its buildings.
// Usage: node tests/townmap.mjs [map name]
const { buildSampleGame } = await import('../src/data/sample.js');
const { TERRAIN } = await import('../src/data/terrain.js');
const { findBuildings } = await import('../src/world/buildings.js');
const g = buildSampleGame();
const name = process.argv[2] || 'Westhold';
const m = g.maps.find((mm) => mm.name === name);
const ch = { cobble: '.', grass: ' ', meadow: ',', wall_stone: '#', wall_wood: '=', window: 'w', door: 'D', door_locked: 'L', floor_wood: '_', floor_stone: '-', carpet: 'c', counter: 'C', table: 'T', bed: 'B', hearth: 'H', fountain: 'F', statue: 'S', garden: '*', tree: 'Y', shelf: 'h', anvil: 'A', barrel: 'o', throne: 'K', altar: 'a', brazier: 'x', crops: '%', fence: '|', palisade: 'P', road: ':', shallows: '~', bridge: '=', stairs_down: '>', stairs_up: '<', cave_wall: '@' };
const rows = [];
for (let y = 0; y < m.h; y++) {
  let r = String(y).padStart(2) + ' ';
  for (let x = 0; x < m.w; x++) {
    const e = m.entities.find((en) => en.x === x && en.y === y);
    const k = TERRAIN[m.tiles[y * m.w + x]].key;
    r += e ? (e.type === 'npc' ? 'n' : 'e') : (ch[k] ?? k[0].toUpperCase());
  }
  rows.push(r);
}
console.log('   ' + Array.from({ length: m.w }, (_, i) => i % 10).join(''));
console.log(rows.join('\n'));
for (const b of findBuildings(m)) console.log(b.id, b.name, JSON.stringify(b.box), b.keeper?.role, 'doors', JSON.stringify(b.doors));
