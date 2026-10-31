// Party creation: up to N heroes, race + class + point-buy stats,
// previewed live as 3D figures standing in a meadow.
import { h, clear } from './dom.js';
import { iconSvg, classIcon, raceIcon } from './icons.js';
import { portrait } from '../render/portrait.js';
import { STATS, STAT_NAMES, RACE_TRAITS, CLASS_ABILITIES, CLASS_SPECIALS } from '../data/defaults.js';
import { createCharacter, classAvailable, charLook, maxHp, maxMp, mod, equipKit, specialOf, armorClass, combatMoves } from '../game/rules.js';
import { createMap } from '../world/map.js';
import { T } from '../data/terrain.js';
import { randomName, nameWords, npcNameWords } from '../world/generate.js';
import { RNG, hash2 } from '../core/rng.js';
import { byId } from '../data/schema.js';
import { sfx } from '../core/sound.js';
import { randomPerson, randomOutfit, SKINS, HAIRS, OUTFITS, STYLE_NAMES, FACE_NAMES, EYE_COLOURS } from '../game/looks.js';

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
  // fit the line-up into the gap between the two panels (measured, so it
  // follows the layout at any window size)
  const frame = (n) => {
    const l = root.querySelector('.create-roster')?.getBoundingClientRect();
    const r = root.querySelector('.create-hero')?.getBoundingClientRect();
    const wide = innerWidth > 860;
    const left = wide && l ? l.right + 4 : 10, right = wide && r ? innerWidth - r.left + 4 : 10;
    const top = wide ? 74 : 10, bottom = wide ? 10 : (r ? innerHeight - r.top + 4 : 10);
    const x0 = 7 - Math.floor(n / 2);
    view.frameArea(x0 - 0.3, 2.4, x0 + Math.max(3, n) + 0.3, 5.2, { left, right, top, bottom });
  };

  const heroes = [];
  let sel = null;

  const raceLook = (raceId) => { const r = byId(races, raceId); return r?.look?.race || r?.id || 'human'; };

  function newHero(raceId, clsId, varied = false) {
    const r = byId(races, raceId) || races[0];
    const k = byId(classes, clsId) || classes[0];
    // no two heroes share a name, nor with anyone in the story
    const hero = { name: '', race: r.id, cls: k.id, stats: {}, look: {} };
    newLook(hero);
    hero.name = randomName(raceLook(r.id), rng, takenBy(null), hero.look);
    autoStats(hero, varied);
    return hero;
  }

  // who they are (skin, hair) and what they wear (outfit colours)
  function newLook(hero, part = 'both') {
    const keep = hero.look || {};
    const person = part === 'outfit' ? { face: keep.face, skin: keep.skin, hair: keep.hair, hairStyle: keep.hairStyle, beard: keep.beard, iris: keep.iris, lashes: keep.lashes } : randomPerson(raceLook(hero.race), rng);
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
  // random names never echo the story's people (no hero "Hilda" beside Mayor Hilda) or each other
  const storyWords = npcNameWords(game);
  const takenBy = (except) => new Set([...storyWords, ...heroes.filter((x) => x !== except).flatMap((x) => nameWords(x.name))]);

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

  // a hero as they will set out: their kit in hand (for numbers and portraits)
  const kitted = (hero) => { const c = createCharacter(game, hero); equipKit(game, c, byId(classes, hero.cls)?.start); return c; };
  const ico = (name, cls = '') => h('span.ci' + cls, { html: iconSvg(name) });
  // Portraits are painted a moment after the panel appears, one at a time,
  // so a click never waits on several off-screen renders at once
  const pics = new Map();
  let picQueue = [], picBusy = false;
  const picKey = (hero) => JSON.stringify([hero.race, hero.cls, hero.look]);
  function picImg(hero) {
    const key = picKey(hero);
    const img = h('img', { alt: '' });
    img.dataset.look = key;
    const r = byId(game.races, hero.race), k = byId(classes, hero.cls);
    img.title = `${hero.name || 'Unnamed hero'} — Level 1 ${r?.name || ''} ${k?.name || ''}`.trim();
    if (pics.has(key)) img.src = pics.get(key);
    else {
      img.style.visibility = 'hidden';
      if (!picQueue.some((q) => q.key === key)) picQueue.push({ key, hero: { ...hero, look: { ...hero.look } } });
      if (!picBusy) { picBusy = true; setTimeout(paintNext, 20); }
    }
    return img;
  }
  function paintNext() {
    const q = picQueue.shift();
    if (!q || !root.isConnected) { picBusy = false; picQueue = []; return; }
    let url = '';
    try { url = portrait(view, charLook(game, kitted(q.hero))); } catch { /* no picture */ }
    pics.set(q.key, url);
    for (const img of root.querySelectorAll('img')) {
      if (img.dataset.look === q.key && url) { img.src = url; img.style.visibility = ''; }
    }
    setTimeout(paintNext, 20);
  }

  function render() {
    // keep the hero panel where the player had scrolled it
    const scroll = root.querySelector('.create-hero')?.scrollTop || 0;
    clear(root);
    const head = h('div.create-head',
      h('div.ch-title', 'Gather Your Company'),
      h('div.ch-steps',
        h('span', h('b', '1'), ' Pick up to ', String(maxParty), ' heroes'),
        h('span', h('b', '2'), ' Choose each one’s race and calling'),
        h('span', h('b', '3'), ' Begin the adventure')));
    const roster = h('div.create-roster.panel',
      h('h2', ico('party'), ' Your Company'),
      h('p.hint', `Up to ${maxParty} heroes. The first leads the way; click one to shape them.`),
      h('div.roster-list', ...heroes.map((hero, i) => {
        const r = byId(races, hero.race), k = byId(classes, hero.cls);
        return h('div.roster-row' + (hero === sel ? '.on' : ''), { onclick: () => { sel = hero; sfx('click'); render(); } },
          h('span.rr-pic', picImg(hero), i === 0 ? h('span.rr-lead', { title: 'Leads the company', html: iconSvg('crown') }) : null),
          h('span.rr-text', h('b', hero.name || 'Nameless'), h('span', ico(classIcon(k), '.rr-ico'), ` ${r?.name || ''} ${k?.name || ''}`)),
          heroes.length > 1 ? h('button.x', { title: 'Remove from the company', onclick: (e) => { e.stopPropagation(); heroes.splice(i, 1); if (sel === hero) sel = heroes[0]; render(); }, html: iconSvg('close') }) : null);
      })),
      heroes.length < maxParty ? h('button.add-hero', { title: 'A new hero with a random calling', onclick: () => { const k = rng.pick(classes); const nh = newHero(raceFor(k), k.id, true); heroes.push(nh); sel = nh; sfx('click'); render(); } }, ico('plus'), ' Add a hero') : null,
      h('button.random-co', { title: 'New callings, races, names, looks and attributes for everyone', onclick: () => { randomParty(); sfx('click'); render(); } },
        ico('dice', '.big'), h('span', h('b', 'Random company'), h('small', 'A fresh band of heroes, ready to go'))),
      h('div.grow'),
      h('div.create-go',
        h('button.primary.big.begin', { onclick: () => begin() }, 'Begin the Adventure ', ico('chevron')),
        h('button.back', { onclick: () => { root.remove(); onBack(); } }, ico('back'), ' Back')),
    );
    root.append(head, roster);
    if (sel) {
      const panel = heroPanel(sel);
      root.appendChild(panel);
      panel.scrollTop = scroll;
    }
    refreshStage();
  }

  function heroPanel(hero) {
    const nameIn = h('input.ch-name', { type: 'text', value: hero.name, maxLength: 16, 'aria-label': 'Name' });
    nameIn.addEventListener('input', () => { hero.name = nameIn.value; rosterNameUpdate(); });
    const r = byId(races, hero.race), k = byId(classes, hero.cls);
    const left = points - spent(hero);
    const c = kitted(hero);
    const sp = specialOf(game, c);
    const skills = (k?.skills || []).map((id) => byId(game.abilities || [], id)?.name).filter(Boolean);
    const quick = (icon, label, val, title) => h('span.cq', { title }, ico(icon), h('b', String(val)), ` ${label}`);
    const panel = h('div.create-hero.panel',
      h('div.ch-top',
        h('div.ch-portrait', picImg(hero)),
        h('div.ch-id',
          h('div.row', h('label.field.grow', h('span.field-label', 'Name'), nameIn),
            h('button.icon', { title: 'A random name', onclick: () => { hero.name = randomName(r?.look?.race || hero.race, rng, takenBy(hero), hero.look); render(); }, html: iconSvg('dice') })),
          h('div.ch-line', ico(raceIcon(r)), ` ${r?.name || ''} `, ico(classIcon(k)), ` ${k?.name || ''}`),
          h('div.ch-quick',
            quick('heart', 'Health', maxHp(game, c), 'Health: how much harm this hero can take'),
            maxMp(game, c) > 0 ? quick('drop', 'Mana', maxMp(game, c), 'Mana: fuel for spells') : null,
            quick('shield', 'Armour', armorClass(game, c), 'Armour: foes must roll this or more to hit'),
            quick('boot', 'Moves', combatMoves(game, c), 'Squares this hero can move in a battle turn')),
          sp ? h('div.ch-special', { title: sp.desc }, ico('star'), h('b', ` ${sp.name}`), h('span', ' — once per battle')) : null)),
      h('div.sub', h('span', h('i.step', '1'), ' Race')),
      h('div.cards.races', ...races.map((race) => h('div.card' + (race.id === hero.race ? '.on' : ''), {
        title: race.desc || '',
        onclick: () => { if (hero.race !== race.id) { hero.race = race.id; newLook(hero, 'person'); } sfx('click'); render(); },
      }, h('div.card-head', ico(raceIcon(race), '.card-ico'), h('b', race.name)),
      h('small', modsText(race.mods)), h('p', racePlay(race))))),
      h('div.sub', h('span', h('i.step', '2'), ' Calling')),
      h('div.cards.classes', ...classes.map((cls) => h('div.card' + (cls.id === hero.cls ? '.on' : ''), {
        title: cls.desc || '',
        onclick: () => { if (hero.cls !== cls.id) { hero.cls = cls.id; autoStats(hero); newLook(hero, 'outfit'); } sfx('click'); render(); },
      }, h('div.card-head', ico(classIcon(cls), '.card-ico'), h('b', cls.name)),
      h('small', magicText(game, cls)), h('p', classPlay(game, cls))))),
      k ? h('p.ch-flavour', k.desc || '', skills.length ? h('span.ch-skills', ` Battle skills: ${skills.join(', ')}${CLASS_SPECIALS[k.special] ? ` · ★ ${CLASS_SPECIALS[k.special].name}` : ''}.`) : null) : null,
      h('div.sub', 'Appearance', h('button.small', { title: 'Random skin, hair and outfit', onclick: () => { newLook(hero); sfx('click'); render(); } }, ico('dice'), ' New look')),
      appearance(hero),
      h('div.sub', `Attributes — ${left} point${left === 1 ? '' : 's'} left`,
        h('button.small', { title: 'Spend the points to suit the calling', onclick: () => { autoStats(hero); render(); } }, 'Auto')),
      h('div.stats', ...STATS.map((s) => {
        const total = hero.stats[s] + (r?.mods?.[s] || 0);
        return h('div.statrow', { title: STAT_PLAY[s] },
          h('span.sname', STAT_NAMES[s]),
          h('button.small', { 'aria-label': `Lower ${STAT_NAMES[s]}`, onclick: () => { if (hero.stats[s] > BASE - 2) { hero.stats[s]--; render(); } } }, '−'),
          h('b.sval', String(total)), h('i', `(${mod(total) >= 0 ? '+' : ''}${mod(total)})`),
          h('button.small', { 'aria-label': `Raise ${STAT_NAMES[s]}`, onclick: () => { if (left > 0 && hero.stats[s] < MAXBASE) { hero.stats[s]++; render(); } } }, '+'));
      })),
      h('p.hint', `${(k?.abilities || []).map((a) => CLASS_ABILITIES[a] || a).join(' · ') || ''}`),
      sp ? h('p.hint', `★ ${sp.name} (once per battle): ${sp.desc}`) : null,
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
        ...Object.entries(FACE_NAMES).map(([k, n]) => h('button.small' + (k === face ? '.on' : ''), { onclick: () => { lk.face = k; sfx('click'); render(); } }, n)),
        h('button.small' + ((lk.lashes ?? face === 'fair') ? '.on' : ''), { title: 'Painted eyelashes', onclick: () => { lk.lashes = !(lk.lashes ?? face === 'fair'); sfx('click'); render(); } }, 'Lashes'))),
      swatches('Eyes', EYE_COLOURS, lk.iris != null ? EYE_COLOURS[lk.iris] : null, (c) => { lk.iris = EYE_COLOURS.indexOf(c); }),
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
    const rows = root.querySelectorAll('.roster-row .rr-text b');
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
  const taken = npcNameWords(game);
  for (const [r, c] of want) {
    const cls = byId(classes, c) || classes[out.length % classes.length];
    const race = byId(game.races, r) || game.races[0];
    const stats = {};
    for (const s of STATS) stats[s] = 11;
    for (const s of cls.primary || []) stats[s] = 16;
    const look = { ...randomPerson(race.look?.race || race.id, rng), ...randomOutfit(cls, rng) };
    for (const k of Object.keys(look)) if (look[k] === undefined) delete look[k];
    const name = randomName(race.look?.race || race.id, rng, taken, look);
    for (const w of nameWords(name)) taken.add(w);
    out.push(createCharacter(game, { name, race: race.id, cls: cls.id, stats, look }));
    if (out.length >= Math.min(4, game.settings.maxParty || 6)) break;
  }
  return out;
}

function modsText(mods = {}) {
  const parts = STATS.filter((s) => mods[s]).map((s) => `${s.toUpperCase()} ${mods[s] > 0 ? '+' : ''}${mods[s]}`);
  return parts.join(', ') || 'balanced';
}

// What a race or a calling does in play, in a line
const RACE_PLAY = {
  human: 'Learns fastest: +10% experience from every deed.',
  dwarf: 'Tough and stubborn: resists poison, fear and sleep; sees in the dark.',
  elf: 'Nimble and keen-eyed: a sure shot with the bow, sees far outdoors.',
};
const CLASS_PLAY = {
  warrior: 'Front line: heavy armour, bashes foes and draws their blows.',
  ranger: 'Archer: deadly from afar, pins foes in place.',
  wizard: 'Spellcaster: fire and frost at range, but frail.',
  cleric: 'Healer: mends wounds and smites the dead.',
  burglar: 'Skirmisher: backstabs, poison and smoke; opens locks.',
  paladin: 'Holy knight: heavy armour and a healing touch.',
  minstrel: 'Bard: songs that hearten friends and dismay foes.',
  runesmith: 'Rune-caster: thunderous blows and warding runes.',
};
const STAT_PLAY = {
  str: 'Strength: melee damage and to-hit, and health',
  dex: 'Dexterity: armour, and to-hit with bows and daggers',
  int: 'Intellect: power and mana for Sorcery and Rune-craft',
  wis: 'Wisdom: power and mana for Prayer and Elven Song',
};

function racePlay(race) {
  if (RACE_PLAY[race.id]) return RACE_PLAY[race.id];
  const t = (race.traits || []).map((x) => (RACE_TRAITS[x] || x).split(':')[1]?.trim() || x).join('; ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + '.' : (race.desc || '');
}

function classPlay(game, cls) {
  if (CLASS_PLAY[cls.id]) return CLASS_PLAY[cls.id];
  const skills = (cls.skills || []).map((id) => byId(game.abilities || [], id)?.name).filter(Boolean);
  return skills.length ? `Skills: ${skills.join(', ')}.` : (cls.desc || '');
}

function magicText(game, cls) {
  const ms = (cls.magic || []).map((m) => {
    const sys = byId(game.magic, m.system);
    if (!sys || !sys.enabled) return null;
    return (m.rate ?? 1) < 1 ? `some ${sys.name}` : sys.name;
  }).filter(Boolean);
  return ms.length ? ms.join(', ') : 'no magic';
}
