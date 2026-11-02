// Buying a ship from a shipwright: the gold changes hands and the new ship is
// moored on the world map beside the yard (or where the shipwright's `ship.x/y`
// says), ready to board when the company comes out.
import { terrain } from '../data/terrain.js';
import { getTile, inBounds } from '../world/map.js';
import { worldMap } from '../data/schema.js';
import { shipDeal } from './dialog.js';
import { sfx } from '../core/sound.js';

// open water beside dry land, with nothing moored there yet
function mooring(map, x, y, taken) {
  if (!inBounds(map, x, y)) return false;
  const t = terrain(getTile(map, x, y));
  if (!t.ship || t.deck || taken(x, y)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    if (!inBounds(map, x + dx, y + dy)) return false;
    const n = terrain(getTile(map, x + dx, y + dy));
    return n.walk && !n.water;
  });
}

// Where the shipwright's ship is moored: { map, x, y } or null
export function mooringFor(game, npc, entities = null) {
  const world = worldMap(game);
  if (!world) return null;
  const ents = entities || world.entities;
  const taken = (x, y) => ents.some((e) => e.x === x && e.y === y && (e.type === 'ship' || e.type === 'monster'));
  const deal = shipDeal(npc);
  if (deal.x != null && deal.y != null && deal.x !== '' && mooring(world, +deal.x, +deal.y, taken)) return { map: world, x: +deal.x, y: +deal.y };
  // beside the site whose map the shipwright keeps, or beside the shipwright
  const home = game.maps.find((m) => m.entities?.includes(npc) || m.entities?.some((e) => e.id === npc.id));
  let at = null;
  if (home === world) at = { x: npc.x, y: npc.y };
  else if (home) at = world.entities.find((e) => e.type === 'portal' && e.target?.map === home.id);
  if (!at) return null;
  for (let r = 1; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (mooring(world, at.x + dx, at.y + dy, taken)) return { map: world, x: at.x + dx, y: at.y + dy };
  }
  return null;
}

export const shipBought = (session, npc) => !!session.party.flags[`_ship_${npc.id}`];

// The BUY action: returns false (and says why) when no sale is made
export function buyShip(session, npc, res) {
  const deal = shipDeal(npc);
  const p = session.party;
  if (shipBought(session, npc)) { res.text = deal.soldText; return false; }
  if (p.gold < deal.price) {
    res.text = `The ${deal.name} costs ${deal.price} gold, and not a copper less. Come back when thy purse is heavier.`;
    res.note = `You have ${p.gold} gold.`;
    return false;
  }
  const world = worldMap(session.game);
  const live = session.map?.id === world.id ? session.map : null;
  const spot = mooringFor(session.game, npc, live ? live.entities : session.buildLiveMap(world.id)?.entities);
  if (!spot) { res.text = 'I\'ve a ship, but nowhere to float her! (There is no open water by the yard.)'; return false; }
  p.gold -= deal.price;
  p.flags[`_ship_${npc.id}`] = true;
  const ship = { id: `ship_${npc.id}`, type: 'ship', x: spot.x, y: spot.y, name: deal.name };
  const ms = session.mapState(world.id);
  (ms.added ||= []).push(ship);
  if (live) {
    live.entities.push({ ...ship, home: { x: ship.x, y: ship.y } });
    session.addVisual(ship);
  }
  res.text = `Done! ${deal.price} gold, and the ${deal.name} is thine. My lads have warped her round to the quay: she lies moored and ready, just outside the yard. Fair winds!`;
  res.note = `Paid ${deal.price} gold. The ${deal.name} is moored outside the yard.`;
  res.ship = ship;
  session.log(`You buy the ${deal.name} for ${deal.price} gold. She is moored at the quay, ready to board.`, 'loot');
  sfx('gold');
  session.autosave?.();
  return true;
}
