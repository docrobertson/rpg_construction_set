// Puzzles: levers, pressure plates, boulders to push, gates, riddles, rune
// sequences, braziers and hidden triggers. They are map entities written as
// plain data ({ id, type, x, y, ... }, see PUZZLE_KINDS) and all of them talk
// through story flags (state.party.flags), so a lever can open a gate, a rune
// sequence can raise a bridge, and a gate can as well wait on a conversation,
// a chest or a quest.
//
// A need is a string of flag names: 'a,b' all set, 'a|b' any set, '!a' not
// set (mixed: 'a|b,!c'). An empty need is always met.
//
// What changes in play is kept in the play state per map, like the rest of a
// map's changes (session.mapState(id)):
//   pz: { [entity id]: { on, lit, down, solved, open, fired, tries } ,
//         ['seq:' + group]: steps done so far }  (runes and ordered braziers)
//   moved[boulder id] = [x, y]  (a pushed boulder stays where it was pushed)
//   tiles[i] = t                (a trigger's bridge, a wall that crumbled)
import { terrain, T } from '../data/terrain.js';
import { getMap, byId } from '../data/schema.js';
import { getTile, inBounds } from '../world/map.js';
import { roll } from '../core/rng.js';
import { sfx } from '../core/sound.js';
import { partyAlive, itemOf, knownSpells, heroAbilities } from './rules.js';
import { checkQuests } from './quests.js';
import { applyEffects } from './events.js';
import { computeLitMask } from './los.js';
import { showPuzzle, animatePuzzle, setPuzzleLights, puzzleFx } from '../render/puzzles.js';

// ------------------------------------------------------------ the kinds
// solid: holds its square (bumped, not walked onto); floor: walked over
export const PUZZLE_KINDS = {
  lever: { label: 'Lever', icon: '🕹', solid: true, hint: 'Pull it to set its flag (and pull again to clear it). Gates and triggers wait on the flag.' },
  plate: { label: 'Pressure plate', icon: '⏹', floor: true, hint: 'Sets its flag while a hero or a boulder stands on it. In a battleground any one hero will do — so a split company can hold two at once.' },
  boulder: { label: 'Boulder', icon: '🪨', solid: true, hint: 'Walk into it to push it one square, onto open floor. It holds a plate down where it rests.' },
  gate: { label: 'Gate', icon: '⛩', hint: 'Bars its square until its need is met: a portcullis, iron bars or a stone slab.' },
  riddle: { label: 'Riddle', icon: '🗿', solid: true, hint: 'A carved face or a sphinx that asks a riddle; the player types the answer.' },
  rune: { label: 'Rune tile', icon: '✴', floor: true, hint: 'Step on the runes of a group in order (1, 2, 3…); the group\'s flag is set when the last is lit. A wrong step puts them all out.' },
  brazier: { label: 'Brazier', icon: '🔥', solid: true, hint: 'Light it with a torch from the pack, or a hero\'s fire magic; its flag is set while it burns.' },
  trigger: { label: 'Trigger', icon: '✳', floor: true, hidden: true, hint: 'Invisible in play: when its need is met it changes tiles — a bridge rises, a wall crumbles.' },
};
export const PUZZLE_TYPES = Object.keys(PUZZLE_KINDS);
export const GLYPHS = ['sun', 'moon', 'star', 'wave', 'flame', 'leaf', 'eye', 'crown'];
export const GLYPH_NAMES = { sun: 'sun', moon: 'moon', star: 'star', wave: 'wave', flame: 'flame', leaf: 'leaf', eye: 'eye', crown: 'crown' };
export const GATE_STYLES = { portcullis: 'Portcullis', bars: 'Iron bars', stone: 'Stone slab' };
export const RIDDLE_LOOKS = { face: 'A great stone face', sphinx: 'A sphinx', door: 'A carved door' };

export const isPuzzle = (e) => !!e && !!PUZZLE_KINDS[e.type];
// what holds its square (a closed gate does; an open one is a doorway)
export function puzzleSolid(e) {
  if (!e) return false;
  if (e.type === 'gate') return !e._open;
  return !!PUZZLE_KINDS[e.type]?.solid;
}
export const puzzleFloor = (e) => isPuzzle(e) && !puzzleSolid(e);
// the flag a puzzle sets (a rune sets its group's)
export const flagOf = (e) => (e.type === 'rune' ? String(e.group || '') : String(e.flag || e.id || ''));
// the flag a group of runes (or ordered braziers) sets when done
const seqKey = (g) => 'seq:' + g;

// ------------------------------------------------------------ needs
export function needMet(flags, need) {
  const s = String(need ?? '').trim();
  if (!s) return true;
  const f = flags || {};
  return s.split(',').every((all) => {
    const opts = all.split('|').map((t) => t.trim()).filter(Boolean);
    if (!opts.length) return true;
    return opts.some((t) => (t[0] === '!' ? !f[t.slice(1).trim()] : !!f[t]));
  });
}
// the flag names a need mentions
export function needFlags(need) {
  return [...new Set(String(need ?? '').split(/[,|]/).map((t) => t.trim().replace(/^!\s*/, '')).filter(Boolean))];
}
// [[{ flag, not }]]: all of the outer list, any of each inner one
export function needTerms(need) {
  return String(need ?? '').split(',').map((all) => all.split('|').map((t) => t.trim()).filter(Boolean)
    .map((t) => (t[0] === '!' ? { flag: t.slice(1).trim(), not: true } : { flag: t, not: false }))).filter((l) => l.length);
}

// ------------------------------------------------------------ riddles
// "A River!", "it's a river", "the river" and "river" are all the river
export function normAnswer(s) {
  let a = String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const b = a.replace(/^(i think|i guess|perhaps|maybe|surely|the answer is|answer|its|it is|is it|that is|thats)\s+/, '').replace(/^(a|an|the|some|one)\s+/, '');
    if (b === a) break;
    a = b;
  }
  return a;
}
export function answerMatches(answers, input) {
  const a = normAnswer(input);
  if (!a) return false;
  const sing = (w) => w.replace(/(?<=[a-z]{3})s$/, '');
  return (answers || []).some((x) => { const n = normAnswer(x); return !!n && (n === a || sing(n) === sing(a)); });
}

// ------------------------------------------------------------ looks
// the model a puzzle is drawn as (render/puzzles.js); null: nothing (a trigger in play)
export function puzzleLook(e, editor = false) {
  if (e.look && typeof e.look === 'object') return e.look;
  switch (e.type) {
    case 'lever': return { kind: 'pz_lever', on: !!e.on };
    case 'plate': return { kind: 'pz_plate', down: !!e.down };
    case 'boulder': return { kind: 'pz_boulder', seed: hashStr(e.id) % 7 };
    case 'gate': return { kind: 'pz_gate', style: GATE_STYLES[e.style] ? e.style : 'portcullis', open: !!e._open };
    case 'riddle': return { kind: 'pz_riddle', look: RIDDLE_LOOKS[e.look] ? e.look : 'face', solved: !!e.solved };
    case 'rune': return { kind: 'pz_rune', glyph: GLYPHS.includes(e.glyph) ? e.glyph : GLYPHS[((+e.order || 1) - 1) % GLYPHS.length], lit: !!e.lit };
    case 'brazier': return { kind: 'pz_brazier', lit: !!e.lit };
    case 'trigger': return editor ? { kind: 'pz_trigger' } : null;
    default: return null;
  }
}
function hashStr(s) { let h = 2166136261 >>> 0; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }

// what a puzzle is called on the hover card and in the log
export function puzzleName(e) {
  if (e.name) return e.name;
  switch (e.type) {
    case 'lever': return 'A lever';
    case 'plate': return 'A pressure plate';
    case 'boulder': return 'A boulder';
    case 'gate': return e.style === 'bars' ? 'Iron bars' : e.style === 'stone' ? 'A stone slab' : 'A portcullis';
    case 'riddle': return e.look === 'sphinx' ? 'A sphinx' : e.look === 'door' ? 'A carved door' : 'A great stone face';
    case 'rune': return `A ${GLYPH_NAMES[e.glyph] || 'carved'} rune`;
    case 'brazier': return 'A brazier';
    default: return 'Something';
  }
}

// ------------------------------------------------------------ live state
// The play state's record for a map's puzzles
export function pzState(session, mapId) {
  const ms = session.mapState(mapId);
  return ms.pz || (ms.pz = {});
}

// Put what has happened back onto a freshly built live map (called from
// session.buildLiveMap, before the light mask is worked out)
export function applyPuzzleState(session, map) {
  if (!map.entities.some(isPuzzle)) return;
  const pz = pzState(session, map.id);
  const flags = session.state.party.flags;
  const src = getMap(session.game, map.id);
  for (const e of map.entities) {
    if (!isPuzzle(e)) continue;
    const st = pz[e.id] || {};
    switch (e.type) {
      case 'lever':
        e.on = st.on ?? !!e.on;
        // a lever that starts pulled sets its flag from the first
        if (st.on == null && e.on && flagOf(e)) flags[flagOf(e)] = true;
        break;
      case 'brazier':
        e.lit = st.lit ?? !!e.lit;
        if (st.lit == null && e.lit && flagOf(e)) flags[flagOf(e)] = true;
        break;
      case 'plate': e.down = !!st.down; break;
      case 'riddle': e.solved = !!st.solved; break;
      case 'boulder': {
        const o = src?.entities.find((x) => x.id === e.id);
        e.origin = o ? { x: o.x, y: o.y } : { x: e.x, y: e.y };
        break;
      }
      default:
    }
  }
  for (const e of map.entities) if (e.type === 'rune') e.lit = runeLit(map, pz, flags, e);
  for (const e of map.entities) if (e.type === 'gate') e._open = needMet(flags, e.need) || !!pz[e.id]?.open;
}

function runeLit(map, pz, flags, e) {
  if (!e.group) return false;
  if (flags[e.group]) return true;
  return (+e.order || 0) <= (pz[seqKey(e.group)] || 0);
}

// ------------------------------------------------------------ in play
export class Puzzles {
  constructor(session) {
    this.s = session;
    this._busy = false;
  }

  get map() { return this.s.map; }
  get flags() { return this.s.state.party.flags; }
  get pz() { return pzState(this.s, this.map.id); }
  get view() { return this.s.view; }
  log(t, c) { this.s.log(t, c); }
  list(type) { return this.map ? this.map.entities.filter((e) => e.type === type) : []; }
  any() { return !!this.map?.entities.some(isPuzzle); }
  at(x, y, pred = isPuzzle) { return this.map.entities.find((e) => e.x === x && e.y === y && pred(e)) || null; }

  // ---------------------------------------------------------- visuals
  addVisual(e) {
    const look = puzzleLook(e);
    if (!look) return;
    showPuzzle(this.view, e, look);
  }

  refreshVisual(e, how = null) {
    if (!this.view.hasEntity(e.id)) { this.addVisual(e); return; }
    animatePuzzle(this.view, e, puzzleLook(e), how);
  }

  // the glow of the braziers that burn (and the light they lend the dark)
  refreshLights() {
    const list = this.list('brazier').filter((e) => e.lit).map((e) => [e.x + 0.5, e.y + 0.5]);
    setPuzzleLights(this.view, list);
    this.map.litMask = computeLitMask(this.map);
  }

  fx() { return (this._fx ||= puzzleFx(this.view)); }

  // the company has just arrived on the map (or a save was loaded on it)
  enter() {
    if (!this.any()) { setPuzzleLights(this.view, []); return; }
    this.refreshLights();
    this.evaluate({ quiet: true });
  }

  // ---------------------------------------------------------- who stands where
  heroSquares() {
    const s = this.s;
    if (s.dv) return s.dv.alive().filter((m) => !s.dv.away(m)).map((m) => s.dv.pos(m));
    return s.state.vehicle ? [] : [{ x: s.state.pos.x, y: s.state.pos.y }];
  }

  heroOn(x, y) {
    const s = this.s;
    if (s.dv) return !!s.dv.heroAt(x, y);
    return !s.state.vehicle && s.state.pos.x === x && s.state.pos.y === y;
  }

  pressed(e) {
    if (this.heroSquares().some((p) => p.x === e.x && p.y === e.y)) return true;
    return this.map.entities.some((b) => b.type === 'boulder' && b.x === e.x && b.y === e.y);
  }

  // ---------------------------------------------------------- the world reacts
  // Plates follow what stands on them, gates follow their needs, triggers
  // fire; repeated until nothing more changes (a plate opens a gate that
  // lets a trigger fire…). quiet: on arrival, nothing is said.
  evaluate(opt = {}) {
    if (this._busy || !this.map || !this.any()) return false;
    this._busy = true;
    let changed = false;
    try {
      for (let guard = 0; guard < 6; guard++) {
        let more = false;
        if (this.evalPlates(opt)) more = true;
        if (this.evalGates(opt)) more = true;
        if (this.evalTriggers(opt)) more = true;
        if (!more) break;
        changed = true;
      }
    } finally { this._busy = false; }
    if (changed) { checkQuests(this.s); this.s.ui?.refresh?.(); }
    return changed;
  }

  evalPlates(opt) {
    const plates = this.list('plate');
    if (!plates.length) return false;
    const pz = this.pz, flags = this.flags;
    let any = false;
    const byFlag = new Map();
    for (const e of plates) {
      const down = this.pressed(e) || (!!e.latch && !!pz[e.id]?.down);
      if (down !== !!e.down) {
        e.down = down;
        (pz[e.id] ||= {}).down = down;
        any = true;
        if (!opt.quiet) {
          sfx(down ? 'plate' : 'plateUp');
          if (down) this.fx().clunk(e.x, e.y);
        }
        this.refreshVisual(e, down ? 'press' : 'release');
      }
      const f = flagOf(e);
      if (f) byFlag.set(f, (byFlag.get(f) || false) || down);
    }
    for (const [f, down] of byFlag) {
      if (down && !flags[f]) { flags[f] = true; any = true; } else if (!down && flags[f]) { delete flags[f]; any = true; }
    }
    return any;
  }

  // something stands in the gate's square, so it cannot come down
  gateJammed(e) {
    if (this.heroSquares().some((p) => p.x === e.x && p.y === e.y)) return true;
    if (this.map.entities.some((o) => o !== e && o.x === e.x && o.y === e.y && (o.type === 'boulder' || o.type === 'npc' || o.type === 'monster'))) return true;
    return !!this.s.dv?.memberAt(e.x, e.y);
  }

  evalGates(opt) {
    const gates = this.list('gate');
    if (!gates.length) return false;
    const pz = this.pz;
    let any = false;
    for (const e of gates) {
      const met = needMet(this.flags, e.need);
      if (met && e.stayOpen) (pz[e.id] ||= {}).open = true;
      const want = met || !!pz[e.id]?.open;
      if (want === !!e._open) continue;
      if (!want && this.gateJammed(e)) continue; // (it comes down once the square is clear)
      e._open = want;
      any = true;
      if (this.s.dv) this.s.dv.blocks = null;
      this.refreshVisual(e, opt.quiet ? null : want ? 'open' : 'close');
      if (!opt.quiet) {
        sfx(want ? 'gateOpen' : 'gateShut');
        this.fx().grind(e.x, e.y, want);
        const seen = this.s.isVisible(e.x, e.y);
        const name = puzzleName(e).replace(/^A /, 'a ').replace(/^Iron/, 'iron');
        if (want) this.log(e.openText || (seen ? `With a grinding of stone and chain, ${name} ${e.style === 'stone' ? 'sinks into the floor' : e.style === 'bars' ? 'slides away' : 'rises'}.` : 'Somewhere nearby, chains rattle and stone grinds.'), 'good');
        else this.log(seen ? `${name.replace(/^./, (c) => c.toUpperCase())} grinds shut again.` : 'Somewhere, something heavy slams shut.', 'warn');
      }
    }
    return any;
  }

  evalTriggers(opt) {
    const trigs = this.list('trigger');
    if (!trigs.length) return false;
    const pz = this.pz;
    let any = false;
    for (const e of trigs) {
      const st = pz[e.id] || {};
      const met = needMet(this.flags, e.need) && String(e.need || '').trim() !== '';
      if (met && !st.fired) { this.fire(e, opt); any = true; } else if (!met && st.fired && e.once === false) { this.unfire(e, opt); any = true; }
    }
    return any;
  }

  // a trigger's need is met: its tiles change, one after another
  fire(e, opt = {}) {
    const map = this.map, s = this.s;
    (this.pz[e.id] ||= {}).fired = true;
    const tiles = (e.tiles || []).filter((t) => inBounds(map, +t.x, +t.y) && tileId(t.t) != null);
    const ms = s.mapState(map.id);
    for (const t of tiles) {
      const i = +t.y * map.w + +t.x;
      map.tiles[i] = tileId(t.t);
      ms.tiles[i] = tileId(t.t);
    }
    map.litMask = computeLitMask(map);
    if (s.dv) s.dv.blocks = null;
    this.stagger(tiles, opt.quiet);
    if (!opt.quiet) {
      sfx(e.sfx && e.sfx !== 'none' ? e.sfx : 'rumble');
      this.view.shake?.(0.08, 0.5);
      this.log(e.text || triggerWords(tiles), 'good');
    }
  }

  unfire(e, opt = {}) {
    const map = this.map, s = this.s;
    this.pz[e.id].fired = false;
    const src = getMap(s.game, map.id);
    const tiles = (e.tiles || []).filter((t) => inBounds(map, +t.x, +t.y));
    const ms = s.mapState(map.id);
    for (const t of tiles) {
      const i = +t.y * map.w + +t.x;
      map.tiles[i] = src.tiles[i];
      delete ms.tiles[i];
    }
    map.litMask = computeLitMask(map);
    this.stagger(tiles, opt.quiet);
    if (!opt.quiet) { sfx('rumble'); this.log(e.undoText || 'The stone shifts back as it was.', 'warn'); }
  }

  // the tiles redrawn one by one along the line, each with a puff of dust
  stagger(tiles, quiet) {
    const v = this.view, map = this.map;
    if (quiet || !tiles.length) { for (const t of tiles) v.refreshTiles(+t.x, +t.y, +t.x, +t.y); return; }
    tiles.forEach((t, k) => setTimeout(() => {
      if (this.map !== map) return;
      v.refreshTiles(+t.x, +t.y, +t.x, +t.y);
      this.fx().rise(+t.x, +t.y, terrain(tileId(t.t) ?? 0).water ? 0x9ad8ff : 0xd8c8a8);
    }, k * (v.fast ? 40 : 140)));
  }

  // ---------------------------------------------------------- after a step
  // Called by session.afterStep: the rune underfoot, then everything else.
  async afterStep(noMove) {
    if (!this.any()) return;
    const s = this.s, p = s.state.pos;
    if (!noMove && !s.state.vehicle) {
      const rune = this.at(p.x, p.y, (e) => e.type === 'rune');
      if (rune) this.stepRune(rune);
    }
    this.evaluate();
  }

  // ---------------------------------------------------------- bumping
  // The company walks into a puzzle that holds its square. Returns true if
  // the step goes on (a boulder pushed out of the way).
  async bump(e, dx, dy) {
    this.s.queued = null;
    switch (e.type) {
      case 'lever': this.pull(e); return false;
      case 'boulder': return this.push(e, dx, dy);
      case 'brazier': this.light(e); return false;
      case 'riddle': this.ask(e); return false;
      case 'gate': this.barred(e); return false;
      default: return false;
    }
  }

  // clicking it, the Nearby bar or E: whatever it is for
  use(e) {
    const s = this.s, p = s.state.pos;
    const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (e.type === 'boulder' || e.type === 'rune' || e.type === 'plate' || (e.type === 'gate' && e._open)) return d === 1 ? s.move(e.x - p.x, e.y - p.y) : null;
    return this.bump(e, e.x - p.x, e.y - p.y).then(() => { s.ui?.refresh?.(); });
  }

  barred(e) {
    sfx('bump');
    const waits = needFlags(e.need);
    this.log(e.closedText || `${puzzleName(e)} bars the way${waits.length ? '. There must be a way to open it.' : '.'}`, 'warn');
  }

  // ---------------------------------------------------------- levers
  pull(e) {
    const flags = this.flags;
    this.s.view.face(this.s.dv ? this.s.dv.actorFig() : 'party', e.x - this.s.state.pos.x, e.y - this.s.state.pos.y);
    if (e.need && !needMet(flags, e.need)) { sfx('bump'); this.log(e.lockedText || 'The lever will not budge: something holds it fast.', 'warn'); return false; }
    if (e.oneWay && e.on) { sfx('bump'); this.log('The lever is locked down and will not come back up.'); return false; }
    e.on = !e.on;
    (this.pz[e.id] ||= {}).on = e.on;
    const f = flagOf(e);
    if (f) { if (e.on) flags[f] = true; else delete flags[f]; }
    sfx('lever');
    this.refreshVisual(e, e.on ? 'on' : 'off');
    this.fx().spark(e.x, e.y);
    this.log(e.pullText || (e.on ? 'You heave the lever down. It locks with a heavy clunk.' : 'You haul the lever back up.'));
    if (e.reset) this.reset(e.reset);
    this.evaluate();
    return true;
  }

  // ---------------------------------------------------------- boulders
  boulderCanEnter(x, y) {
    const map = this.map, s = this.s;
    if (!inBounds(map, x, y)) return false;
    const t = terrain(getTile(map, x, y));
    if (!t.walk || t.door || t.dmg || t.locked || (t.water && !t.deck) || t.feature || t.key === 'stairs_up' || t.key === 'stairs_down') return false;
    // (it rolls over plates, runes and an open gate's sill; anything else stops it)
    const over = (o) => o.type === 'treasure' || o.type === 'trigger' || o.type === 'plate' || o.type === 'rune' || (o.type === 'gate' && o._open);
    if (map.entities.some((o) => o.x === x && o.y === y && !over(o))) return false;
    if (this.heroOn(x, y) || s.dv?.memberAt(x, y)) return false;
    return true;
  }

  async push(e, dx, dy) {
    const s = this.s;
    const nx = e.x + dx, ny = e.y + dy;
    if (!dx && !dy) return false;
    if (!this.boulderCanEnter(nx, ny)) {
      sfx('bump');
      this.log(e.stuckText || 'You heave at the boulder, but it will not budge that way.', 'warn');
      return false;
    }
    const fx0 = e.x, fy0 = e.y;
    e.x = nx; e.y = ny;
    s.mapState(this.map.id).moved[e.id] = [nx, ny];
    if (s.dv) s.dv.blocks = null;
    sfx('rumble');
    this.fx().dust(fx0, fy0);
    await animatePuzzle(this.view, e, puzzleLook(e), 'roll', { dx, dy });
    if (!this.tipped) { this.tipped = true; s.tip('boulder', 'Boulders roll one square at a time, onto open floor. One resting on a pressure plate holds it down — and one pushed into a corner stays there (look for a lever to set them back).'); }
    return true;
  }

  // the boulders of a group roll back to where they began
  reset(group) {
    let n = 0;
    for (const b of this.list('boulder')) {
      if (b.group !== group || !b.origin || (b.x === b.origin.x && b.y === b.origin.y)) continue;
      const { x, y } = b.origin;
      if (this.heroOn(x, y) || this.map.entities.some((o) => o !== b && o.x === x && o.y === y && (o.type === 'boulder' || o.type === 'npc'))) continue;
      this.fx().dust(b.x, b.y);
      b.x = x; b.y = y;
      delete this.s.mapState(this.map.id).moved[b.id];
      this.view.placeEntity(b.id, x, y);
      this.fx().dust(x, y);
      n++;
    }
    if (n) { sfx('rumble'); this.log(n > 1 ? 'With a deep rumble, the boulders roll back to where they began.' : 'With a deep rumble, the boulder rolls back to where it began.'); }
    this.evaluate();
    return n;
  }

  // ---------------------------------------------------------- sequences
  // Runes (and braziers with a group and an order) are lit in order 1..n;
  // done, the group's flag is set; a wrong one puts the whole group out.
  members(type, group) { return this.list(type).filter((r) => r.group === group); }

  stepRune(e) {
    const flags = this.flags, g = e.group;
    if (!g) return;
    if (flags[g]) { sfx('chime'); this.fx().chime(e.x, e.y, 1); return; }
    this.sequence('rune', e);
  }

  // e was just lit (stepped on, kindled): right or wrong?
  sequence(type, e) {
    const g = e.group, pz = this.pz, flags = this.flags;
    const all = this.members(type, g);
    const n = Math.max(0, ...all.map((r) => +r.order || 0));
    const done = pz[seqKey(g)] || 0;
    const ord = +e.order || 0;
    if (ord && ord <= done) return 'again';
    if (ord === done + 1) {
      pz[seqKey(g)] = ord;
      if (type === 'rune') { e.lit = true; this.refreshVisual(e, 'lit'); }
      sfx('rune' + Math.min(8, ord));
      this.fx().chime(e.x, e.y, ord);
      if (ord >= n) {
        flags[g] = true;
        setTimeout(() => sfx('solved'), this.view.fast ? 60 : 260);
        all.forEach((r, k) => setTimeout(() => this.fx().chime(r.x, r.y, 8, true), (this.view.fast ? 30 : 110) * k));
        this.log(e.doneText || all.find((r) => r.doneText)?.doneText || (type === 'rune' ? 'The last rune flares — every glyph in the floor blazes at once, and the air hums.' : 'The last flame leaps up, and the fires burn as one.'), 'good');
      }
      this.evaluate();
      return 'right';
    }
    // out of order: the group goes dark
    pz[seqKey(g)] = 0;
    sfx('wrong');
    this.view.flash?.('rgba(255,60,40,.35)', 220);
    for (const r of all) {
      this.fx().fizzle(r.x, r.y);
      if (type === 'rune') { if (r.lit) { r.lit = false; this.refreshVisual(r, 'dim'); } } else if (r.lit) this.douse(r);
    }
    const first = all.find((r) => +r.order === 1) || e;
    const w = first.wrong || {};
    this.log(w.text || (type === 'rune' ? 'The rune flashes red and every glyph goes dark. The sequence is broken.' : 'The flames gutter and die. The order was wrong.'), 'bad');
    this.punish(w, first);
    return 'wrong';
  }

  // the wrong effects of a rune, a brazier or a riddle: hurt, a fight
  punish(w, e) {
    const s = this.s;
    if (w.hurt) {
      for (const m of partyAlive(s.party)) if (!s.dv || s.dv.near(m, 3)) s.hurtMember(m, Math.max(1, roll(String(w.hurt)) || 1), 'a curse');
      sfx('hurt');
      this.view.burst?.(e.x, e.y, 0xff5030, 12);
      s.checkDefeat?.();
    }
    if (w.fight) {
      const id = '__pz_' + e.id;
      setTimeout(() => { if (s.mode === 'explore') s.engage({ id, monster: w.fight, count: String(w.count || '1'), roaming: true }); }, 60);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------- braziers
  // a hero who can make fire close by: { m, what }
  fireMaker() {
    const s = this.s, g = s.game;
    for (const m of partyAlive(s.party)) {
      if (s.dv && !s.dv.near(m, 2)) continue;
      const sp = knownSpells(g, m).find((x) => /fire|flame|ember|burn|inferno|blaze/i.test(`${x.id} ${x.name}`));
      if (sp) return { m, what: `a word of ${sp.name}` };
      const ab = heroAbilities(g, m).find((a) => a.vfx === 'fire' || /fire|flame/i.test(a.id || ''));
      if (ab) return { m, what: `a spark of ${ab.name}` };
    }
    return null;
  }

  light(e) {
    const s = this.s, inv = s.party.inventory;
    if (e.lit) { this.log(e.text || 'The brazier burns brightly.'); return false; }
    const cost = e.cost === undefined || e.cost === null ? { item: 'torch' } : e.cost;
    const item = cost?.item ? itemOf(s.game, cost.item) : null;
    const fire = this.fireMaker();
    let how;
    if (fire) how = `${fire.m.name} kindles the brazier with ${fire.what}.`;
    else if (!cost?.item) how = 'You kindle the brazier.';
    else if ((inv[cost.item] || 0) > 0) { inv[cost.item]--; how = `You touch a ${item?.name?.toLowerCase() || cost.item} to the brazier, and it catches.`; }
    else { sfx('bump'); this.log(e.coldText || `The brazier is cold. You need a ${item?.name?.toLowerCase() || cost.item} — or a hero with fire magic — to light it.`, 'warn'); return false; }
    e.lit = true;
    (this.pz[e.id] ||= {}).lit = true;
    const f = flagOf(e);
    if (f) this.flags[f] = true;
    sfx('ignite');
    this.fx().ignite(e.x, e.y);
    this.refreshVisual(e, 'lit');
    this.refreshLights();
    this.s.updateVisibility();
    this.log(how, 'good');
    if (e.group && e.order) this.sequence('brazier', e);
    else this.evaluate();
    return true;
  }

  douse(e) {
    e.lit = false;
    (this.pz[e.id] ||= {}).lit = false;
    const f = flagOf(e);
    if (f) delete this.flags[f];
    this.refreshVisual(e, 'out');
    this.refreshLights();
  }

  // ---------------------------------------------------------- riddles
  ask(e) {
    const s = this.s;
    if (s.ui?.openRiddle) { s.mode = 'dialog'; s.ui.openRiddle(e); return; }
    this.log(`${puzzleName(e)} speaks: "${e.text || '…'}"`, 'say');
  }

  // The player's answer: { ok, text, got, fight? }
  answer(e, input) {
    const s = this.s;
    const st = (this.pz[e.id] ||= {});
    if (st.solved) return { ok: true, again: true, text: e.solvedText || 'The stone is silent; it has had its answer.' };
    if (answerMatches(e.answers, input)) {
      st.solved = e.solved = true;
      const f = flagOf(e);
      if (f) this.flags[f] = true;
      const got = e.reward ? applyEffects(s, e, e.reward).got : [];
      sfx('solved');
      this.fx().chime(e.x, e.y, 8, true);
      this.refreshVisual(e, 'solved');
      const text = e.rightText || 'The stone eyes glow, and a voice like grinding millstones says: "So it is." Something unlocks deep in the rock.';
      this.log(`${puzzleName(e)}: ${text}${got.length ? ' (' + got.join(', ') + ')' : ''}`, 'good');
      this.evaluate();
      checkQuests(s);
      s.autosave?.();
      return { ok: true, text, got };
    }
    st.tries = (st.tries || 0) + 1;
    const w = e.wrong || {};
    sfx('wrong');
    const text = w.text || 'The stone eyes flash red. "No," it rumbles.';
    this.log(`${puzzleName(e)}: ${text}`, 'bad');
    const res = { ok: false, text, got: [] };
    if (w.hurt) {
      for (const m of partyAlive(s.party)) if (!s.dv || s.dv.near(m, 3)) s.hurtMember(m, Math.max(1, roll(String(w.hurt)) || 1), 'the riddle\'s curse');
      res.got.push('the company is hurt');
      this.view.burst?.(e.x, e.y, 0xff5030, 14);
    }
    if (w.fight) res.fight = { monster: w.fight, count: String(w.count || '1') };
    return res;
  }

  // a wrong answer's fight, once its window is closed
  async riddleFight(e, f) {
    const s = this.s;
    if (!f) return;
    s.checkDefeat?.();
    if (s.mode !== 'explore') return;
    s.log(`${puzzleName(e)} calls out its guardians!`, 'bad');
    return s.engage({ id: '__pz_' + e.id, monster: f.monster, count: f.count, roaming: true });
  }

  // ---------------------------------------------------------- describing
  // the hover card for a puzzle: { title, sub, note, act, verb }
  describe(e) {
    const flags = this.flags;
    const t = puzzleName(e);
    switch (e.type) {
      case 'lever': {
        const locked = e.need && !needMet(flags, e.need);
        return { title: t, sub: e.text || (e.on ? 'pulled down' : 'standing up'), note: locked ? 'It will not move yet' : e.oneWay && e.on ? 'locked down' : '', verb: locked ? 'try' : 'pull' };
      }
      case 'plate': return { title: t, sub: e.text || (e.down ? 'pressed down' : 'a flagstone that rocks underfoot'), verb: 'step on' };
      case 'boulder': return { title: t, sub: e.text || 'big, round and mossy — it might roll', verb: 'push' };
      case 'gate': {
        if (e._open) return { title: t, sub: e.text || 'open', verb: 'walk through' };
        return { title: t, sub: e.text || 'shut fast', note: e.closedText ? '' : 'Something must open it', verb: 'try' };
      }
      case 'riddle': return { title: t, sub: e.solved ? 'its riddle answered' : e.text ? 'it asks a riddle' : '', verb: e.solved ? 'look at' : 'answer' };
      case 'rune': {
        const done = e.group && flags[e.group];
        return { title: t, sub: e.text || (done ? 'blazing with light' : e.lit ? 'glowing' : 'dark, carved deep in the floor'), verb: 'step on' };
      }
      case 'brazier': return { title: t, sub: e.text || (e.lit ? 'burning brightly' : 'cold, full of old coals'), verb: e.lit ? 'warm your hands at' : 'light' };
      default: return { title: t, sub: e.text || '', verb: 'use' };
    }
  }
}

// a tile type by key ('bridge') or number
export function tileId(t) {
  if (t == null || t === '') return null;
  if (typeof t === 'number') return t;
  if (/^\d+$/.test(String(t))) return +t;
  return T[t] ?? null;
}

function triggerWords(tiles) {
  const keys = new Set(tiles.map((t) => terrain(tileId(t.t) ?? 0).key));
  if (keys.has('bridge')) return 'With a roar of stone, a bridge rises out of the depths and locks into place!';
  if ([...keys].some((k) => /stairs/.test(k))) return 'Stone steps grind up out of the floor!';
  if ([...keys].some((k) => terrain(T[k] ?? 0).water)) return 'Water rushes in with a roar!';
  if ([...keys].every((k) => terrain(T[k] ?? 0).walk)) return 'With a crash, the stone gives way and a new path opens!';
  return 'Somewhere, the stone shifts with a deep rumble.';
}

if (typeof window !== 'undefined') window.__puzzles = { needMet, needFlags, answerMatches, normAnswer, isPuzzle, puzzleSolid, PUZZLE_TYPES };
void byId;
