// Party creation: up to N heroes, race + class + point-buy stats,
// previewed live as 3D figures standing in a meadow.
import { h, clear } from './dom.js';
import { STATS, STAT_NAMES, RACE_TRAITS, CLASS_ABILITIES } from '../data/defaults.js';
import { createCharacter, classAvailable, charLook, maxHp, maxMp, mod } from '../game/rules.js';
import { createMap } from '../world/map.js';
import { T } from '../data/terrain.js';
import { randomName } from '../world/generate.js';
import { RNG, hash2 } from '../core/rng.js';
import { byId } from '../data/schema.js';
import { sfx } from '../core/sound.js';

const BASE = 8, MAXBASE = 17;

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

  function newHero(raceId, clsId) {
    const r = byId(races, raceId) || races[0];
    const k = byId(classes, clsId) || classes[0];
    const hero = { name: randomName(r.look?.race || r.id, rng), race: r.id, cls: k.id, stats: {} };
    autoStats(hero);
    return hero;
  }

  function autoStats(hero) {
    const k = byId(classes, hero.cls);
    const prim = k?.primary || ['str', 'dex'];
    for (const s of STATS) hero.stats[s] = BASE;
    let left = points;
    const order = [prim[0], prim[0], prim[0], prim[1] || prim[0], prim[1] || prim[0], ...STATS];
    let i = 0;
    while (left > 0) {
      const s = i < 5 * 3 ? order[i % 5] : STATS[rng.int(0, 3)];
      i++;
      if (hero.stats[s] < MAXBASE) { hero.stats[s]++; left--; }
      if (i > 400) break;
    }
  }

  const spent = (hero) => STATS.reduce((a, s) => a + (hero.stats[s] - BASE), 0);

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

  quickParty();

  const root = h('div.create');
  app.ui.appendChild(root);

  function refreshStage() {
    view.clearEntities();
    const n = heroes.length;
    frame(n);
    heroes.forEach((hero, i) => {
      const c = createCharacter(game, hero);
      const k = byId(classes, hero.cls);
      for (const id of k?.start || []) {
        const it = byId(game.items, id);
        if (!it) continue;
        const slot = it.type === 'weapon' ? 'weapon' : it.type === 'armor' ? 'armor' : it.type === 'shield' ? 'shield' : null;
        if (slot && !c.equip[slot]) c.equip[slot] = id;
      }
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
      heroes.length < maxParty ? h('button', { onclick: () => { const nh = newHero(rng.pick(races).id, rng.pick(classes).id); heroes.push(nh); sel = nh; sfx('click'); render(); } }, '+ Add a hero') : null,
      h('button', { onclick: () => { quickParty(); sfx('click'); render(); } }, '🎲 Random company'),
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
        onclick: () => { hero.race = race.id; sfx('click'); render(); },
      }, h('b', race.name), h('small', modsText(race.mods)), h('p', race.desc || ''),
      (race.traits || []).length ? h('small.traits', race.traits.map((t) => (RACE_TRAITS[t] || t).split(':')[0]).join(' · ')) : null))),
      h('div.sub', 'Calling'),
      h('div.cards.classes', ...classes.map((cls) => h('div.card' + (cls.id === hero.cls ? '.on' : ''), {
        onclick: () => { hero.cls = cls.id; autoStats(hero); sfx('click'); render(); },
      }, h('b', cls.name), h('small', magicText(game, cls)), h('p', cls.desc || '')))),
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
    );
    return panel;
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
    out.push(createCharacter(game, { name: randomName(race.look?.race || race.id, rng), race: race.id, cls: cls.id, stats }));
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
