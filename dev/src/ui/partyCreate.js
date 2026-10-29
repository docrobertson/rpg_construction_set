// Party creation: up to N heroes, race + class + point-buy stats,
// previewed live as 3D figures standing in a meadow.
import { h, clear } from './dom.js';
import { STATS, STAT_NAMES, RACE_TRAITS, CLASS_ABILITIES, CLASS_SPECIALS } from '../data/defaults.js';
import { createCharacter, classAvailable, charLook, maxHp, maxMp, mod, equipKit, specialOf } from '../game/rules.js';
import { createMap } from '../world/map.js';
import { T } from '../data/terrain.js';
import { randomName } from '../world/generate.js';
import { RNG, hash2 } from '../core/rng.js';
import { byId } from '../data/schema.js';
import { sfx } from '../core/sound.js';
import { randomPerson, randomOutfit, SKINS, HAIRS, OUTFITS, STYLE_NAMES, FACE_NAMES } from '../game/looks.js';

const BASE = 8, MAXBASE = 17;

// which races a random company favours for each calling
const RACE_AFFINITY = {
  warrior: { dwarf: 2 }, runesmith: { dwarf: 4 }, cleric: { dwarf: 1.5, human: 1.5 }, paladin: { human: 2.5 },
  ranger: { elf: 2.5 }, minstrel: { elf: 2.5 }, wizard: { elf: 1.5, human: 1.5 }, burglar: { human: 1.5 },
};

export function partyCreation(app, game, { onDone, onBack }) {
  const view = app.view;
  const rng = new RNG();
  const maxParty = Math.max(1, Math.min(8, game.settings.maxParty || 6));
  const points = game.settings.creationPoints ?? 24;
  const races = game.races;
  const classes = game.classes.filter((c) => classAvailable(game, c));

  // preview stage
  const stage = createMap({ type: 'town', w: 15, h: 9, name: 'Stage', fill: 'meadow' });
  for (let y = 0; y < stage.h; y++) for (let x = 0; x < stage.w; x++) {
    const edge = Math.min(x, y, stage.w - 1 - x, stage.h - 1 - y);
    stage.tiles[y * stage.w + x] = edge === 0 ? (hash2(x, y, 5) < 0.6 ? T.tree : T.garden) : hash2(x, y, 9) < 0.5 ? T.meadow : T.grass;
  }
  for (let x = 3; x < 12; x++) stage.tiles[4 * stage.w + x] = T.road;
  view.setMap(stage);
  view.setVisibilityEnabled(false);
  const frame = (n) => {
    const right = Math.min(554, window.innerWidth - 300) + 14;
    const x0 = 7 - Math.floor(n / 2);
    view.frameArea(x0 - 0.3, 2.4, x0 + Math.max(3, n) + 0.3, 5.2, { left: 278, right, top: 10, bottom: 10 });
  };

  const heroes = [];
  let sel = null;

  const raceLook = (raceId) => { const r = byId(races, raceId); return r?.look?.race || r?.id || 'human'; };

  function newHero(raceId, clsId, varied = false) {
    const r = byId(races, raceId) || races[0];
    const k = byId(classes, clsId) || classes[0];
    // no two heroes share a name
    let name = randomName(raceLook(r.id), rng);
    for (let i = 0; i < 12 && heroes.some((x) => x.name === name); i++) name = randomName(raceLook(r.id), rng);
    const hero = { name, race: r.id, cls: k.id, stats: {}, look: {} };
    newLook(hero);
    autoStats(hero, varied);
    return hero;
  }

  // who they are (skin, hair) and what they wear (outfit colours)
  function newLook(hero, part = 'both') {
    const keep = hero.look || {};
    const person = part === 'outfit' ? { face: keep.face, skin: keep.skin, hair: keep.hair, hairStyle: keep.hairStyle, beard: keep.beard } : randomPerson(raceLook(hero.race), rng);
    const outfit = part === 'person' ? { body: keep.body, hatColor: keep.hatColor, cape: keep.cape } : randomOutfit(byId(classes, hero.cls), rng);
    hero.look = Object.fromEntries(Object.entries({ ...person, ...outfit }).filter(([, v]) => v !== undefined));
  }

  // Spend creation points, favouring the class's attributes; `varied` adds
  // some chance so no two random heroes come out alike
  function autoStats(hero, varied = false) {
    const k = byId(classes, hero.cls);
    const prim = k?.primary || ['str', 'dex'];
    for (const s of STATS) hero.stats[s] = BASE;
    let left = points;
    const order = [prim[0], prim[0], prim[0], prim[1] || prim[0], prim[1] || prim[0], ...STATS];
    let i = 0;
    while (left > 0) {
      const s = varied ? (rng.chance(0.55) ? prim[rng.chance(0.6) ? 0 : prim.length - 1] : STATS[rng.int(0, 3)]) : i < 5 * 3 ? order[i % 5] : STATS[rng.int(0, 3)];
      i++;
      if (hero.stats[s] < MAXBASE) { hero.stats[s]++; left--; }
      if (i > 400) break;
    }
  }

  const spent = (hero) => STATS.reduce((a, s) => a + (hero.stats[s] - BASE), 0);

  // a classic balanced company to start from
  function quickParty() {
    heroes.length = 0;
    const want = [['dwarf', 'warrior'], ['elf', 'ranger'], ['human', 'wizard'], ['human', 'cleric'], ['dwarf', 'runesmith'], ['elf', 'minstrel']];
    for (const [r, c] of want) {
      if (heroes.length >= Math.min(4, maxParty)) break;
      if (!byId(classes, c)) continue;
      heroes.push(newHero(byId(races, r) ? r : races[0].id, c));
    }
    while (heroes.length < Math.min(4, maxParty)) heroes.push(newHero(rng.pick(races).id, rng.pick(classes).id));
    sel = heroes[0];
  }

  // a fully random company: different callings (with someone to hold the
  // front), races that suit them, varied attributes and looks
  function randomParty() {
    heroes.length = 0;
    const n = Math.min(4, maxParty);
    const pool = rng.shuffle(classes.slice());
    const front = pool.filter((k) => (k.hpBase || 10) >= 14 || k.shields);
    const picks = front.length ? [rng.pick(front)] : [];
    for (const k of pool) if (picks.length < n && !picks.includes(k)) picks.push(k);
    while (picks.length < n) picks.push(rng.pick(classes));
    for (const k of picks) heroes.push(newHero(raceFor(k), k.id, true));
    sel = heroes[0];
  }

  function raceFor(k) {
    const like = RACE_AFFINITY[k.id] || {};
    const ws = races.map((r) => like[raceLook(r.id)] || 1);
    let t = ws.reduce((a, b) => a + b, 0) * rng.next();
    for (let i = 0; i < races.length; i++) { t -= ws[i]; if (t < 0) return races[i].id; }
    return races[0].id;
  }

  quickParty();

  const root = h('div.create');
  app.ui.appendChild(root);

  function refreshStage() {
    view.clearEntities();
    const n = heroes.length;
    frame(n);
    heroes.forEach((hero, i) => {
      const c = createCharacter(game, hero);
      equipKit(game, c, byId(classes, hero.cls)?.start);
      const x = 7 - Math.floor(n / 2) + i;
      view.addEntity('hero' + i, charLook(game, c), x, 4, { ring: hero === sel ? 0xffd040 : 0x806020 });
    });
  }

  function render() {
    clear(root);
    const roster = h('div.create-roster.panel',
      h('h2', 'Your Company'),
      h('p.hint', `Up to ${maxParty} heroes. The first leads the way.`),
      ...heroes.map((hero, i) => {
        const r = byId(races, hero.race), k = byId(classes, hero.cls);
        return h('div.roster-row' + (hero === sel ? '.on' : ''), { onclick: () => { sel = hero; render(); } },
          h('b', hero.name), h('span', `${r?.name || ''} ${k?.name || ''}`),
          heroes.length > 1 ? h('button.x', { title: 'Remove', onclick: (e) => { e.stopPropagation(); heroes.splice(i, 1); if (sel === hero) sel = heroes[0]; render(); } }, '×') : null);
      }),
      heroes.length < maxParty ? h('button', { onclick: () => { const k = rng.pick(classes); const nh = newHero(raceFor(k), k.id, true); heroes.push(nh); sel = nh; sfx('click'); render(); } }, '+ Add a hero') : null,
      h('button', { title: 'New callings, races, names, looks and attributes', onclick: () => { randomParty(); sfx('click'); render(); } }, '🎲 Random company'),
      h('div.grow'),
      h('div.row', h('button', { onclick: () => { root.remove(); onBack(); } }, '← Back'),
        h('button.primary.big', { onclick: () => begin() }, 'Begin the Adventure ›')),
    );
    root.appendChild(roster);
    if (sel) root.appendChild(heroPanel(sel));
    refreshStage();
  }

  function heroPanel(hero) {
    const nameIn = h('input', { type: 'text', value: hero.name, maxLength: 16 });
    nameIn.addEventListener('input', () => { hero.name = nameIn.value; rosterNameUpdate(); });
    const r = byId(races, hero.race), k = byId(classes, hero.cls);
    const left = points - spent(hero);
    const c = createCharacter(game, hero);
    const panel = h('div.create-hero.panel',
      h('div.row', h('label.field.grow', h('span.field-label', 'Name'), nameIn),
        h('button', { title: 'Random name', onclick: () => { hero.name = randomName(r?.look?.race || hero.race, rng); render(); } }, '🎲')),
      h('div.sub', 'Race'),
      h('div.cards', ...races.map((race) => h('div.card' + (race.id === hero.race ? '.on' : ''), {
        onclick: () => { if (hero.race !== race.id) { hero.race = race.id; newLook(hero, 'person'); } sfx('click'); render(); },
      }, h('b', race.name), h('small', modsText(race.mods)), h('p', race.desc || ''),
      (race.traits || []).length ? h('small.traits', race.traits.map((t) => (RACE_TRAITS[t] || t).split(':')[0]).join(' · ')) : null))),
      h('div.sub', 'Calling'),
      h('div.cards.classes', ...classes.map((cls) => h('div.card' + (cls.id === hero.cls ? '.on' : ''), {
        onclick: () => { if (hero.cls !== cls.id) { hero.cls = cls.id; autoStats(hero); newLook(hero, 'outfit'); } sfx('click'); render(); },
      }, h('b', cls.name), h('small', magicText(game, cls)), h('p', cls.desc || ''),
      CLASS_SPECIALS[cls.special] ? h('small.traits', `★ ${CLASS_SPECIALS[cls.special].name}`) : null))),
      h('div.sub', 'Appearance', h('button.small', { title: 'Random skin, hair and outfit', onclick: () => { newLook(hero); sfx('click'); render(); } }, '🎲 New look')),
      appearance(hero),
      h('div.sub', `Attributes — ${left} point${left === 1 ? '' : 's'} left`,
        h('button.small', { onclick: () => { autoStats(hero); render(); } }, 'Auto')),
      h('div.stats', ...STATS.map((s) => {
        const total = hero.stats[s] + (r?.mods?.[s] || 0);
        return h('div.statrow',
          h('span.sname', STAT_NAMES[s]),
          h('button.small', { onclick: () => { if (hero.stats[s] > BASE - 2) { hero.stats[s]--; render(); } } }, '−'),
          h('b.sval', String(total)), h('i', `(${mod(total) >= 0 ? '+' : ''}${mod(total)})`),
          h('button.small', { onclick: () => { if (left > 0 && hero.stats[s] < MAXBASE) { hero.stats[s]++; render(); } } }, '+'));
      })),
      h('p.hint', `Health ${maxHp(game, c)} · Mana ${maxMp(game, c)} · ${(k?.abilities || []).map((a) => (CLASS_ABILITIES[a] || a).split(':')[0]).join(', ') || 'no special skills'}`),
      specialOf(game, c) ? h('p.hint', `★ ${specialOf(game, c).name} (once per battle): ${specialOf(game, c).desc}`) : null,
    );
    return panel;
  }

  function appearance(hero) {
    const lk = hero.look || (hero.look = {});
    const kind = SKINS[raceLook(hero.race)] ? raceLook(hero.race) : 'human';
    const cls = byId(classes, hero.cls);
    const css = (c) => '#' + c.toString(16).padStart(6, '0');
    const swatches = (label, colors, cur, set) => h('div.look-row', h('span.look-label', label),
      h('div.dots', ...colors.map((c) => h('button.dot' + (c === cur ? '.on' : ''), {
        style: { background: css(c) }, title: label, onclick: () => { set(c); sfx('click'); render(); },
      }))));
    const style = lk.hairStyle || (kind === 'elf' ? 'long' : 'short');
    const face = lk.face || 'bold';
    return h('div.looks',
      h('div.look-row', h('span.look-label', 'Face'), h('div.dots',
        ...Object.entries(FACE_NAMES).map(([k, n]) => h('button.small' + (k === face ? '.on' : ''), { onclick: () => { lk.face = k; sfx('click'); render(); } }, n)))),
      swatches('Skin', SKINS[kind], lk.skin, (c) => { lk.skin = c; }),
      swatches('Hair', HAIRS[kind], lk.hair, (c) => { lk.hair = c; if (lk.beard != null && lk.beard !== false) lk.beard = c; }),
      h('div.look-row', h('span.look-label', 'Style'), h('div.dots',
        ...Object.entries(STYLE_NAMES).map(([k, n]) => h('button.small' + (k === style ? '.on' : ''), { onclick: () => { lk.hairStyle = k; sfx('click'); render(); } }, n)),
        kind === 'human' ? h('button.small' + (lk.beard != null ? '.on' : ''), { onclick: () => { if (lk.beard != null) delete lk.beard; else lk.beard = lk.hair ?? 0x5a3a20; sfx('click'); render(); } }, 'Beard') : null,
        kind === 'dwarf' ? h('button.small' + (lk.beard !== false ? '.on' : ''), { onclick: () => { if (lk.beard === false) delete lk.beard; else lk.beard = false; sfx('click'); render(); } }, 'Beard') : null)),
      swatches('Outfit', OUTFITS, lk.body ?? cls?.look?.body, (c) => {
        lk.body = c;
        if (['hood', 'wizard', 'cap'].includes(cls?.look?.hat)) lk.hatColor = c;
      }),
    );
  }

  function rosterNameUpdate() {
    const rows = root.querySelectorAll('.roster-row b');
    heroes.forEach((hero, i) => { if (rows[i]) rows[i].textContent = hero.name; });
  }

  function begin() {
    if (!heroes.length) return;
    sfx('level');
    const members = heroes.map((hero) => createCharacter(game, { ...hero, name: hero.name.trim() || 'Nameless' }));
    root.remove();
    view.clearEntities();
    onDone(members);
  }

  render();
  return { destroy: () => root.remove() };
}

// A ready-made balanced company (used for quick playtests)
export function quickParty(game) {
  const rng = new RNG(7);
  const classes = game.classes.filter((c) => classAvailable(game, c));
  const want = [['dwarf', 'warrior'], ['elf', 'ranger'], ['human', 'wizard'], ['human', 'cleric']];
  const out = [];
  for (const [r, c] of want) {
    const cls = byId(classes, c) || classes[out.length % classes.length];
    const race = byId(game.races, r) || game.races[0];
    const stats = {};
    for (const s of STATS) stats[s] = 11;
    for (const s of cls.primary || []) stats[s] = 16;
    const look = { ...randomPerson(race.look?.race || race.id, rng), ...randomOutfit(cls, rng) };
    for (const k of Object.keys(look)) if (look[k] === undefined) delete look[k];
    out.push(createCharacter(game, { name: randomName(race.look?.race || race.id, rng), race: race.id, cls: cls.id, stats, look }));
    if (out.length >= Math.min(4, game.settings.maxParty || 6)) break;
  }
  return out;
}

function modsText(mods = {}) {
  const parts = STATS.filter((s) => mods[s]).map((s) => `${s.toUpperCase()} ${mods[s] > 0 ? '+' : ''}${mods[s]}`);
  return parts.join(', ') || 'balanced';
}

function magicText(game, cls) {
  const ms = (cls.magic || []).map((m) => {
    const sys = byId(game.magic, m.system);
    if (!sys || !sys.enabled) return null;
    return (m.rate ?? 1) < 1 ? `some ${sys.name}` : sys.name;
  }).filter(Boolean);
  return ms.length ? ms.join(', ') : 'no magic';
}
