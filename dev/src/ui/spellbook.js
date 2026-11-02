// The cast window, dressed for each school: a wizard's open spellbook, a
// cleric's prayer beads, a minstrel's staves, a runesmith's stone tablets and
// a ranger's herb satchel. Also the schools' marks on the hero sheet and the
// roster (resource bars named Mana, Faith, Voice; herb and reagent counts).
import { h, modal } from './dom.js';
import { iconSvg } from './icons.js';
import { STAT_NAMES } from '../data/defaults.js';
import { byId } from '../data/schema.js';
import { canCast, maxMp, itemOf, knownSpells, casting } from '../game/rules.js';
import { schoolLook, manaSchool, reagentStock } from '../game/magic.js';

const ico = (name, cls = '') => h('i.sb-ico' + cls, { html: iconSvg(name) });
const tintCss = (n) => '#' + ((n ?? 0xd8d0b0) >>> 0).toString(16).padStart(6, '0');

// what a spell reaches, in words
export const SPELL_REACH = { enemy: 'one foe', area: 'a group of foes', allEnemies: 'every foe', ally: 'one companion', allAllies: 'the whole company', self: 'the caster' };

const SPELL_ICONS = { heal: 'heart', cure: 'cross', revive: 'sun', sleep: 'sleep', fear: 'fear', shield: 'shield', bless: 'sparkle', drain: 'skull', light: 'torch', reveal: 'eye', recall: 'blink' };
export function spellIcon(sp) {
  if (sp.effect === 'damage') return /frost|ice/i.test(sp.id) ? 'frost' : sp.system === 'song' ? 'note' : sp.system === 'runic' ? 'rune' : sp.system === 'divine' ? 'sun' : sp.system === 'herbal' ? 'smoke' : 'fire';
  if (sp.system === 'herbal' && sp.effect === 'sleep') return 'smoke';
  return SPELL_ICONS[sp.effect] || 'wand';
}

// "3 Mana", "Moonpetal (2) + Spidersilk (0)": the price of a spell, in words
export function spellCost(g, sp, inv) {
  if (sp.reagents && sp.reagents.length) return sp.reagents.map((r) => `${itemOf(g, r)?.name || r}${inv ? ` (${inv[r] || 0})` : ''}`).join(' + ');
  const look = schoolLook(byId(g.magic, sp.system));
  return `${sp.cost || 0} ${look?.resName || 'Mana'}`;
}

// reagents a spell burns, counted: [{ item, need, have }]
function reagentNeeds(g, sp, inv) {
  const need = {};
  for (const r of sp.reagents || []) need[r] = (need[r] || 0) + 1;
  return Object.entries(need).map(([id, n]) => ({ item: itemOf(g, id) || { id, name: id }, need: n, have: inv[id] || 0 }));
}

function reagentChip(r, showNeed = false) {
  const short = r.have < r.need;
  return h('span.sb-rg' + (short ? '.short' : ''), { title: `${r.item.name}: ${r.have} carried${r.need > 1 ? `, ${r.need} needed` : ''}` },
    h('i.sb-rg-ico', { style: { color: tintCss(r.item.tint) }, html: iconSvg(r.item.icon || 'herb') }),
    h('span.sb-rg-name', r.item.name), h('b.sb-rg-n', showNeed && r.need > 1 ? `${r.have}/${r.need}` : String(r.have)));
}

// the cost as the school shows it: blue gems for a spellbook, suns for
// prayers, notes for songs; reagent chips for the item schools
function costMark(g, sp, look, inv) {
  if (look.items) return h('span.sb-cost.rg', ...reagentNeeds(g, sp, inv).map((r) => reagentChip(r, true)));
  const n = sp.cost || 0;
  const glyph = { book: 'gem', prayer: 'sun', song: 'note' }[look.style] || 'drop';
  const marks = n <= 8 ? Array.from({ length: n }, () => ico(glyph, '.pip')) : [ico(glyph, '.pip'), h('b.sb-x', `×${n}`)];
  return h('span.sb-cost', { title: `${n} ${look.resName}` }, ...marks);
}

// Older games began rune descriptions with the reagents ("Moonpetal + Spidersilk.
// Strong healing."): the chips show those now, so drop them
function plainDesc(g, sp) {
  const d = sp.desc || '';
  if (!(sp.reagents || []).length) return d;
  const names = sp.reagents.map((r) => itemOf(g, r)?.name).filter(Boolean);
  const m = /^([^.]+)\.\s+/.exec(d);
  return m && m[1].split(' + ').every((n) => names.includes(n.trim())) ? d.slice(m[0].length) : d;
}

const CIRCLES = ['', 'First Circle', 'Second Circle', 'Third Circle', 'Fourth Circle', 'Fifth Circle'];

// The header of a school's section: its pool of mana/faith/voice, or the
// reagents or herbs on hand
function poolHead(g, m, look, inv) {
  if (look.items) {
    const ids = new Set((g.spells || []).filter((sp) => sp.system === look.sys.id && knownSpells(g, m).includes(sp)).flatMap((sp) => sp.reagents || []));
    const rows = [...ids].map((id) => ({ item: itemOf(g, id), need: 1, have: inv[id] || 0 })).filter((r) => r.item);
    return h('div.sb-pool.rg', h('span.sb-pool-label', ico(look.icon), `${look.resName} on hand`), h('span.sb-pool-chips', ...rows.map((r) => reagentChip(r))));
  }
  const max = maxMp(g, m), f = max ? Math.max(0, Math.min(1, m.mp / max)) : 0;
  return h('div.sb-pool', h('span.sb-pool-label', ico(look.icon), look.resName),
    h('span.sb-pool-bar', h('i', { style: { width: Math.round(f * 100) + '%' } })), h('b.sb-pool-n', `${m.mp}/${max}`));
}

// Resolves to the chosen spell, or null. Rows are .choose-item buttons with
// the number key to press, like every other chooser.
export function castWindow(ui, member, spells) {
  const g = ui.s.game, inv = ui.s.party.inventory;
  return new Promise((resolve) => {
    let done = false;
    const order = [];
    const schools = [];
    for (const sp of spells) {
      let s = schools.find((x) => x.id === sp.system);
      if (!s) schools.push(s = { id: sp.system, look: schoolLook(byId(g.magic, sp.system)) || schoolLook({ id: sp.system }), spells: [] });
      s.spells.push(sp);
    }
    const first = schools[0]?.look || schoolLook({ id: 'arcane' });
    const row = (sp, look, cls = '') => {
      const can = canCast(g, member, sp, inv);
      const n = order.push({ sp, can });
      const reach = SPELL_REACH[sp.target];
      const missing = look.items ? reagentNeeds(g, sp, inv).filter((r) => r.have < r.need).map((r) => r.item.name) : [];
      const why = !can.ok ? (missing.length ? `Missing ${missing.join(', ')}` : can.why) : '';
      const name = look.style === 'book' ? [h('span.sb-initial', sp.name[0]), sp.name.slice(1)] : [sp.name];
      return h('button.choose-item.sb-row' + cls + (can.ok ? '' : '.disabled'), {
        title: can.ok ? sp.desc || null : can.why,
        onclick: () => { if (!can.ok) return; done = true; m.close(); resolve(sp); },
      },
      h('span.ci-key', String(n)),
      h('span.sb-glyph', { html: iconSvg(spellIcon(sp)) }),
      h('span.ci-label', h('span.sb-name', ...name, (member.book || []).includes(sp.id) ? h('i.sb-copied', { title: 'Copied from a scroll', html: iconSvg('quill') }) : null), costMark(g, sp, look, inv)),
      h('span.ci-sub', plainDesc(g, sp), reach ? h('span.sb-reach', ` · ${reach}`) : null, why ? h('span.sb-why', ` — ${why}`) : null));
    };
    const body = h('div.cast-window');
    for (const s of schools) {
      const look = s.look;
      const sec = h(`div.sb-school.sb-${look.style}`, { style: { '--school': look.color } });
      if (schools.length > 1) sec.appendChild(h('div.sb-school-name', ico(look.icon), look.sys.name, h('span.sb-stat', ` · ${STAT_NAMES[look.sys.stat] || look.sys.stat}`)));
      sec.appendChild(poolHead(g, member, look, inv));
      if (look.style === 'book') {
        // an open book: circles flow down the left page, then the right
        const circles = [];
        for (const sp of s.spells) {
          const c = sp.level || 1;
          let grp = circles.find((x) => x.c === c);
          if (!grp) circles.push(grp = { c, spells: [] });
          grp.spells.push(sp);
        }
        const left = h('div.sb-page.left'), right = h('div.sb-page.right');
        const half = Math.ceil(s.spells.length / 2);
        let placed = 0;
        for (const grp of circles) {
          const page = placed && placed + grp.spells.length / 2 > half ? right : left;
          page.appendChild(h('div.sb-circle', CIRCLES[grp.c] || `Circle ${grp.c}`));
          for (const sp of grp.spells) page.appendChild(row(sp, look));
          placed += grp.spells.length;
        }
        if (!right.children.length) right.appendChild(h('div.sb-blank', 'The pages that follow are blank.'));
        // spells still to be found, waiting for their page
        const sys = look.sys.id;
        const unfound = (g.spells || []).filter((sp) => sp.system === sys && sp.scroll && !(member.book || []).includes(sp.id)).length;
        if (unfound) right.appendChild(h('div.sb-blank', { title: 'Spell scrolls are found on the road and sold by sages. Open the Pack to copy one into the book.' }, ico('quill'), ` ${unfound} spell${unfound === 1 ? '' : 's'} known only from scrolls — copy any you find into this book.`));
        sec.appendChild(h('div.sb-tome', left, h('div.sb-spine'), right));
      } else {
        const list = h(`div.sb-list`);
        for (const sp of s.spells) list.appendChild(row(sp, look));
        sec.appendChild(list);
      }
      body.appendChild(sec);
    }
    const titles = {
      book: `${member.name}'s Spellbook`, prayer: `${member.name} prays`, song: `${member.name} sings`,
      runes: `${member.name}'s rune-stones`, herbs: `${member.name}'s herb satchel`,
    };
    const m = modal(body, {
      title: titles[first.style] || `${member.name} casts`, icon: first.icon,
      sub: schools.length === 1 ? `${first.sys.name} · ${STAT_NAMES[first.sys.stat] || ''}` : null,
      cls: `cast-modal cast-${first.style}`,
      onClose: () => { if (!done) resolve(null); },
    });
    m.box.style.setProperty('--school', first.color);
    const keyer = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= order.length && order[n - 1].can.ok && m.back.isConnected) {
        e.stopPropagation();
        done = true; m.close(); resolve(order[n - 1].sp);
      }
    };
    m.back.tabIndex = -1;
    m.back.addEventListener('keydown', keyer);
    setTimeout(() => m.back.focus(), 10);
  });
}

// The hero sheet's magic: one row per school, its spells tinted in the
// school's colour (dimmed when they cannot be cast right now)
export function sheetSpells(g, m, inv) {
  const spells = knownSpells(g, m);
  if (!spells.length) return null;
  const wrap = h('div.spells');
  for (const ci of casting(g, m)) {
    const look = schoolLook(ci.sys);
    const mine = spells.filter((sp) => sp.system === ci.sys.id);
    if (!mine.length) continue;
    const noun = { book: 'Spellbook', prayer: 'Prayers', song: 'Songs', runes: 'Runes', herbs: 'Remedies' }[look.style] || 'Spells';
    wrap.appendChild(h('div.sub.sb-sheet-head', { style: { '--school': look.color } }, h('span', ico(look.icon), ` ${noun}`, h('span.sb-sheet-art', ` · ${look.sys.name}`)), h('span.sub-note', `C · ${look.verb}`)));
    wrap.appendChild(h('div.spell-tags', { style: { '--school': look.color } }, ...mine.map((x) => {
      const can = canCast(g, m, x, inv);
      return h('span.tag.spell-tag' + (can.ok ? '' : '.dim'), {
        title: `${x.desc || ''} — ${spellCost(g, x, look.items ? inv : null)}${x.combat === false ? ' · not in battle' : ''}${can.ok ? '' : ` · ${can.why}`}`,
      }, h('i.gi', { html: iconSvg(spellIcon(x)) }), x.name);
    })));
  }
  return wrap;
}

// The resource line under a hero's health: a pool bar named for the school
// (Mana, Faith, Voice) in its colour, or a count of the herbs or reagents
// their art burns. null for heroes without magic.
export function resourceLine(g, m, inv) {
  const mm = maxMp(g, m);
  if (mm > 0) {
    const look = manaSchool(g, m);
    const f = Math.max(0, Math.min(1, m.mp / mm));
    return h('div.bar.mp.res', { style: { '--school': look?.color || '#6a8cf0' }, title: `${look?.resName || 'Mana'}: fuel for ${look?.sys.name || 'spells'}. It returns with rest.` },
      h('i', { style: { width: (f * 100).toFixed(0) + '%' } }), h('span', `${look?.resName || 'Mana'} ${m.mp}/${mm}`));
  }
  const st = reagentStock(g, m, inv);
  if (!st || !st.rows.length) return null;
  return h('div.bar.res.items', { style: { '--school': st.look.color }, title: `${st.look.resName} for ${st.look.sys.name}: ${st.rows.map((r) => `${r.item.name} ${r.n}`).join(', ')}` },
    h('span', h('em.res-ico', { html: iconSvg(st.look.icon) }), `${st.look.resName} ${st.total}`,
      h('span.res-chips', ...st.rows.map((r) => h('em.res-dot' + (r.n ? '' : '.none'), { style: { color: tintCss(r.item.tint) }, html: iconSvg(r.item.icon || 'herb') })))));
}
