// Play-mode HUD and all of its windows (talk, shop, party, spells, map...).
import { h, clear, modal, toast, anyModal, closeTopModal, closeAllModals, confirmDialog } from './dom.js';
import { byId } from '../data/schema.js';
import { terrain } from '../data/terrain.js';
import { diceAvg } from '../core/rng.js';
import { getTile } from '../world/map.js';
import {
  maxHp, maxMp, armorClass, attackBonus, weaponOf, rangedOf, canEquip, itemOf, raceOf, classOf, knownSpells, canCast, xpForLevel,
  statusLabel, mod, slotFor, equipItem, unequip, spendPoint, specialOf, combatMoves, charLook, EQUIP_SLOTS, SLOT_NAMES,
} from '../game/rules.js';
import { markKeywords, knownKeywords } from '../game/dialog.js';
import { STAT_NAMES, STATS } from '../data/defaults.js';
import { sfx, isMuted, setMuted } from '../core/sound.js';
import { musicEnabled, setMusicEnabled } from '../core/music.js';
import { loadState } from '../core/storage.js';
import { escapeHtml } from '../core/util.js';
import { attachGestures } from '../render/gestures.js';
import { portrait } from '../render/portrait.js';
import { CombatHud, sheetAbilities } from './combatHud.js';
import { iconSvg, itemIcon, itemTile } from './icons.js';
import { openHelpOverlay } from './help.js';
import { QuestUI } from './journal.js';
import { Explorer, glyph } from './explore.js';

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
};

// a small glyph before each kind of log line, so the eye can sort them
const LOG_ICONS = { good: 'heart', bad: 'sword', warn: 'warn', magic: 'sparkle', place: 'place', say: 'talk', level: 'up', loot: 'coin', quest: 'scroll' };

const STAT_HELP = {
  str: 'Strength: melee damage and to-hit, and health',
  dex: 'Dexterity: armour, and to-hit with bows and daggers',
  int: 'Intellect: power and mana for Sorcery and Rune-craft',
  wis: 'Wisdom: power and mana for Prayer and Elven Song',
};

export class PlayUI {
  constructor(app, session) {
    this.app = app;
    this.s = session;
    session.ui = this;
    this.view = app.view;
    this.logLines = [];
    this.pendingDir = null;
    this.targeting = null;
    this.autoPath = null;
    this.chud = new CombatHud(this);
    this.build();
    this.quests = new QuestUI(this); // tracker, journal, quest offers, events
    this.explore = new Explorer(this); // hover info, click to act, the Nearby bar, marks over heads
    this.bindInput();
    this.setMode('explore');
  }

  // ------------------------------------------------------------ layout
  // Docked layout: a header strip, the map in its own frame, the company on the
  // right, and the log, commands and minimap along the bottom.
  build() {
    const root = h('div.hud');
    this.root = root;
    this.statusEl = h('div.hud-status');
    this.hoverEl = h('div.hud-hover');
    this.partyEl = h('div.hud-party');
    this.heroEl = h('div.hud-hero');
    this.popEl = h('div.hero-pop', h('button.pop-close', { title: 'Close (Esc)', onclick: () => this.closeHero() }, '×'), this.heroEl);
    this.popEl.hidden = true;
    this.logEl = h('div.hud-log');
    this.hintEl = h('div.hud-prompt');
    this.cmdEl = h('div.hud-cmds');
    this.minimap = h('canvas.hud-minimap', { width: 64, height: 64, title: 'Map (M)', onclick: () => this.openMap() });
    root.append(
      h('div.hud-head',
        h('div.hud-title', h('i.st-ico', { html: iconSvg('castle') }), this.s.game.meta.title),
        this.statusEl,
        this.hoverEl,
        h('button.hud-help', { onclick: () => this.openHelp(), title: 'How to play (?)', 'aria-label': 'Help', html: iconSvg('help') }),
        h('button.hud-menu', { onclick: () => this.openMenu(), title: 'Save, sound, camera and quit (Esc)' }, h('i.st-ico', { html: iconSvg('menu') }), 'Menu')),
      h('div.hud-frame'),
      h('div.hud-side', h('div.side-head', 'Company'), this.partyEl),
      this.popEl,
      h('div.hud-foot',
        h('div.hud-logbox', this.logEl, this.hintEl),
        this.cmdEl,
        h('div.hud-mapbox', this.minimap)),
    );
    this.app.ui.appendChild(root);
    this.app.setLayout('play');
    this.selected = this.s.party.members[0] || null;
  }

  destroy() {
    this.chud.stop();
    this.unbindInput();
    this.quests?.destroy();
    this.explore?.destroy();
    this.view.markers.clear();
    this.view.pathPreview.clear();
    document.removeEventListener('pointerdown', this.onOutside, true);
    closeAllModals();
    this.root.remove();
    this.view.showCursor(null);
    this.view.setHighlights(null);
  }

  log(text, cls = '') {
    this.logLines.push({ text, cls });
    if (this.logLines.length > 400) this.logLines.shift();
    const el = this.logEl;
    // keep following new lines unless the player has scrolled back to read
    const follow = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const ico = LOG_ICONS[cls];
    el.appendChild(h('div.log-line' + (cls ? '.' + cls : ''), ico ? h('i.log-ico', { html: iconSvg(ico) }) : null, text));
    while (el.childNodes.length > 400) el.removeChild(el.firstChild);
    if (follow) el.scrollTop = el.scrollHeight;
  }

  refresh() {
    this.refreshStatus();
    this.refreshParty();
    this.refreshHero();
    this.drawMinimap();
    this.quests?.refresh();
    this.explore?.refreshNearby();
    this.explore?.refreshMarkers();
  }

  onMapChanged() { this.drawMinimap(); }

  refreshStatus() {
    const s = this.s, p = s.party;
    const map = s.battle ? null : s.map;
    clear(this.statusEl);
    const tod = !s.battle && s.dayCycleActive && s.dayCycleActive() ? s.timeOfDay() : null;
    const n = s.party.members.filter((m) => m.status !== 'dead').length || 1;
    const ico = (name) => h('i.st-ico', { html: iconSvg(name) });
    this.statusEl.append(...[
      h('span.st-place', { title: s.battle ? 'A battle is under way' : 'Where your company stands' }, ico(s.battle ? 'sword' : 'place'), s.battle ? 'Battle' : map ? map.name : ''),
      tod ? h('span.st-item.st-time' + (tod.dark > 0.5 ? '.night' : ''), { title: `Day ${tod.day}: at night you see less and more monsters roam` }, ico(tod.dark > 0.5 ? 'moon' : 'sun'), `${tod.name}, day ${tod.day}`) : null,
      h('span.st-item.st-gold', { title: 'Gold: spend it in shops, inns and temples' }, ico('coin'), String(p.gold)),
      this.s.game.settings.food ? h('span.st-item.st-food' + (p.food < 20 ? '.low' : ''), { title: `Food: the company eats as it travels, and camping costs ${n}. Buy rations in town.` }, ico('food'), String(p.food)) : null,
      p.light > 0 ? h('span.st-item.st-light', { title: 'Torchlight: lets you see in dark places; it burns down as you walk' }, ico('torch'), String(p.light)) : null,
      s.state.vehicle ? h('span.st-item', { title: 'Sailing: walk onto land to go ashore' }, ico('compass'), 'Aboard ship') : null,
    ].filter(Boolean));
  }

  // Clicking a hero shows their full sheet in a pop-over beside the panel;
  // clicking them again (or Esc, or anywhere else) puts it away
  selectHero(m, card) {
    sfx('click');
    if (this.popHero === m && !this.popEl.hidden) { this.closeHero(); return; }
    this.selected = m;
    this.popHero = m;
    this.popEl.hidden = false;
    this.refreshParty();
    this.refreshHero(true);
    const r = (card || this.partyEl.children[this.s.party.members.indexOf(m)])?.getBoundingClientRect();
    const top = r ? Math.max(48, Math.min(r.top - 8, window.innerHeight - this.popEl.offsetHeight - 10)) : 52;
    this.popEl.style.top = top + 'px';
    if (!this.onOutside) {
      this.onOutside = (e) => {
        if (this.popEl.hidden || this.popEl.contains(e.target) || this.partyEl.contains(e.target) || e.target.closest?.('.modal-back')) return;
        this.closeHero();
      };
      document.addEventListener('pointerdown', this.onOutside, true);
    }
  }

  closeHero() {
    if (this.popEl.hidden) return false;
    this.popEl.hidden = true;
    this.popHero = null;
    this.refreshParty();
    return true;
  }

  // One card per hero: a portrait of their figure, then the numbers that
  // matter at a glance. The first hero leads the company.
  refreshParty() {
    clear(this.partyEl);
    const g = this.s.game;
    const active = this.s.battle?.active?.member;
    this.s.party.members.forEach((m, i) => {
      const mhp = maxHp(g, m), mmp = maxMp(g, m);
      const w = weaponOf(g, m), rw = rangedOf(g, m);
      const next = xpForLevel(m.level + 1), prev = xpForLevel(m.level);
      const xpf = isFinite(next) ? Math.max(0, Math.min(1, (m.xp - prev) / Math.max(1, next - prev))) : 1;
      const cls = '.pcard' + (m.status === 'dead' ? '.dead' : '') + (m === active ? '.active' : '') + (m === this.popHero ? '.sel' : '') + (i === 0 ? '.leader' : '');
      const pic = portrait(this.view, charLook(g, m));
      const card = h('div' + cls, { title: `${m.name} — click for the full sheet` },
        h('div.pc-pic', pic ? h('img', { src: pic, alt: '' }) : null, i === 0 ? h('span.pc-crown', { title: 'Party leader', html: iconSvg('crown') }) : null),
        h('div.pc-body',
          h('div.pc-head', h('span.pc-name', m.name),
            m.points > 0 ? h('span.pc-pts', { title: 'Attribute points to spend' }, '▲' + m.points) : null,
            m.perkPending > 0 ? h('span.pc-pts.perk', { title: 'A talent to choose — open the sheet', html: iconSvg('star') }) : null,
            m.status !== 'ok' ? h('span.pc-status.' + m.status, statusLabel(m)) : null,
            i === 0 ? h('span.pc-lead', 'Leader') : null),
          h('div.pc-sub', `Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}`),
          bar('HP', m.hp, mhp, 'hp'),
          mmp > 0 ? bar('MP', m.mp, mmp, 'mp') : null,
          h('div.pc-xp', { title: isFinite(next) ? `${m.xp} / ${next} experience to level ${m.level + 1}` : `${m.xp} experience` }, h('i', { style: { width: Math.round(xpf * 100) + '%' } })),
          h('div.pc-gear',
            h('span', { title: 'Armour: foes must roll this or more to hit' }, h('i.gi', { html: iconSvg('shield') }), String(armorClass(g, m))),
            h('span', { title: `${w.name}: ${w.dmg} damage` }, h('i.gi', { html: iconSvg(w.id ? itemIcon(w)[0] : 'sword') }), w.name),
            rw ? h('span', { title: `${rw.name}: ${rw.dmg} damage, range ${rw.range}` }, h('i.gi', { html: iconSvg(itemIcon(rw)[0]) }), rw.name) : null),
        ));
      card.addEventListener('click', () => this.selectHero(m, card));
      this.partyEl.appendChild(card);
    });
  }

  refreshHero(force = false) {
    const s = this.s;
    if (!s.party.members.includes(this.selected)) this.selected = s.party.members[0] || null;
    const m = this.popHero;
    if (!m || this.popEl.hidden) return;
    if (!s.party.members.includes(m)) { this.closeHero(); return; }
    // rebuild only when something on the sheet changed (keeps open dropdowns stable while walking)
    const bu = s.battle?.partyUnits.find((u) => u.member === m);
    const sig = JSON.stringify([m, s.party.inventory, s.party.members.indexOf(m), !!s.battle, bu?.uses, bu?.cd]);
    if (!force && sig === this.heroSig) return;
    this.heroSig = sig;
    clear(this.heroEl);
    this.heroEl.appendChild(this.heroSheet(m, () => this.refresh()));
  }

  // The character sheet: attributes, numbers that matter, equipment, special and spells
  heroSheet(m, onChange) {
    const s = this.s, g = s.game, inv = s.party.inventory;
    const inBattle = !!s.battle;
    const k = classOf(g, m), r = raceOf(g, m);
    const w = weaponOf(g, m), rw = rangedOf(g, m);
    const next = xpForLevel(m.level + 1), prev = xpForLevel(m.level);
    const changed = () => { s.refreshPartyVisual(); onChange && onChange(); };
    const el = h('div.sheet');
    const add = (...kids) => { for (const k of kids) if (k) el.appendChild(k); };
    const face = portrait(this.view, charLook(g, m));
    add(
      h('div.sheet-head',
        h('div.sheet-pic' + (m.status === 'dead' ? '.dead' : ''), face ? h('img', { src: face, alt: '' }) : null, h('span.sheet-lv', { title: `Level ${m.level}` }, String(m.level))),
        h('div.sheet-id',
          h('div.sheet-title', h('span', m.name), h('span.status' + (m.status !== 'ok' ? '.bad' : ''), statusLabel(m))),
          h('div.sheet-sub', `Level ${m.level} ${r.name} ${k.name}`))),
      h('div.sheet-bars',
        bar('HP', m.hp, maxHp(g, m), 'hp'),
        maxMp(g, m) > 0 ? bar('MP', m.mp, maxMp(g, m), 'mp') : null,
        isFinite(next) ? h('div.bar.xp', { title: `${m.xp} / ${next} experience` }, h('i', { style: { width: Math.round(100 * Math.max(0, Math.min(1, (m.xp - prev) / Math.max(1, next - prev)))) + '%' } }), h('span', `XP ${m.xp} / ${next}`)) : null),
    );
    // attributes, with points to spend after levelling up
    const pts = m.points || 0;
    add(
      pts > 0 ? h('div.points', `▲ ${pts} attribute point${pts === 1 ? '' : 's'} to spend`) : null,
      h('div.attrs', ...STATS.map((st) => h('div.attr', { title: STAT_HELP[st] },
        h('span.an', STAT_NAMES[st]), h('b', String(m[st])), h('i', fmtMod(mod(m[st]))),
        pts > 0 && m.status !== 'dead' ? h('button.small.plus', {
          title: `Raise ${STAT_NAMES[st]}`,
          onclick: (e) => { e.stopPropagation(); if (spendPoint(g, m, st)) { sfx('level'); changed(); } },
        }, '+') : null))),
      h('div.nums',
        h('div.num', { title: 'Armour class: foes must roll this or more to hit' }, h('span', 'Armour'), h('b', String(armorClass(g, m)))),
        h('div.num', { title: 'Squares this hero can move in a battle turn before acting' }, h('span', 'Moves'), h('b', String(combatMoves(g, m)))),
        h('div.num', { title: `${w.name}: ${w.dmg} damage` }, h('span', 'Melee'), h('b', `${fmtMod(attackBonus(g, m, w))} · ${w.dmg}`)),
        h('div.num', { title: rw ? `${rw.name}: ${rw.dmg} damage, range ${rw.range}` : 'No ranged weapon' }, h('span', 'Ranged'), h('b', rw ? `${fmtMod(attackBonus(g, m, rw))} · ${rw.dmg} · ${rw.range}sq` : '—')),
      ),
    );
    // equipment
    const eq = h('div.equip');
    for (const slot of EQUIP_SLOTS) {
      const cur = itemOf(g, m.equip[slot]);
      const sel = h('select', { disabled: inBattle || m.status === 'dead', title: inBattle ? 'You cannot change gear mid-battle' : `Choose ${SLOT_NAMES[slot].toLowerCase()}` });
      sel.appendChild(h('option', { value: '' }, '— none —'));
      if (cur) sel.appendChild(h('option', { value: cur.id, selected: true }, `${cur.name} (${itemStats(cur)})`));
      for (const it of g.items) {
        if (!(inv[it.id] > 0) || slotFor(it) !== slot || (cur && it.id === cur.id)) continue;
        const ok = canEquip(g, m, it);
        sel.appendChild(h('option', { value: it.id, disabled: !ok.ok }, `${it.name} (${itemStats(it)})${ok.ok ? '' : ' — ' + ok.why}`));
      }
      sel.value = cur ? cur.id : '';
      sel.addEventListener('change', () => {
        if (!sel.value) unequip(m, slot, inv);
        else {
          const res = equipItem(g, m, itemOf(g, sel.value), inv);
          if (!res.ok) { s.log(res.why, 'warn'); sfx('error'); }
        }
        sfx('click');
        changed();
      });
      eq.appendChild(h('div.slot', h('span.slot-name', SLOT_NAMES[slot]), sel));
    }
    add(eq);
    // battle skills, special and talents
    add(sheetAbilities(this, m, changed));
    // spells
    const spells = knownSpells(g, m);
    if (spells.length) {
      add(h('div.spells', h('div.sub', 'Spells', h('span.sub-note', 'C casts')), h('div.spell-tags', ...spells.map((x) => h('span.tag.spell-tag', {
        title: `${x.desc || ''} — ${spellCost(g, x)}${x.combat === false ? ' · not in battle' : ''}`,
      }, h('i.gi', { html: iconSvg(spellIcon(x)) }), x.name)))));
    }
    const idx = s.party.members.indexOf(m);
    add(h('div.sheet-actions',
      h('button.small', { onclick: () => this.openParty(m) }, '🎒 Pack'),
      idx > 0 && !inBattle ? h('button.small', {
        title: 'Lead the company: the leader walks in front and speaks for everyone',
        onclick: () => { s.party.members.splice(idx, 1); s.party.members.unshift(m); changed(); },
      }, '♛ Make leader') : null,
      idx > 1 && !inBattle ? h('button.small', {
        onclick: () => { s.party.members.splice(idx, 1); s.party.members.splice(idx - 1, 0, m); changed(); },
      }, '▲ Move up') : null,
      idx === 0 ? h('span.hint', '♛ Leads the company') : null,
    ));
    return el;
  }

  drawMinimap() {
    const map = this.s.map;
    if (!map || this.s.battle) return;
    const c = this.minimap;
    if (c.width !== map.w || c.height !== map.h) { c.width = map.w; c.height = map.h; }
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(map.w, map.h);
    const d = img.data;
    const explored = map.explored;
    const vis = this.s.visible;
    for (let i = 0; i < map.w * map.h; i++) {
      const seen = !vis || explored[i];
      const col = terrain(map.tiles[i]).top;
      const k = !seen ? 0 : vis && !vis[i] ? 0.55 : 1;
      d[i * 4] = ((col >> 16) & 255) * k;
      d[i * 4 + 1] = ((col >> 8) & 255) * k;
      d[i * 4 + 2] = (col & 255) * k;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const p = this.s.state.pos;
    ctx.fillStyle = '#ff3';
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
    ctx.fillStyle = '#f00';
    ctx.fillRect(p.x, p.y, 1, 1);
    this.quests?.drawPins(ctx, 1);
  }

  // ------------------------------------------------------------ commands
  setMode(mode) {
    this.mode = mode;
    clear(this.cmdEl);
    if (mode === 'combat') {
      this.cmdEl.classList.remove('explore');
      this.chud.commands(this.cmdEl);
    } else {
      // the general commands; what can be done right here sits in the Nearby bar over the map
      const cmd = (icon, label, key, fn, title) => h('button.cmd.xcmd', { title: `${title || label} (${key === '␣' ? 'Space' : key})`, onclick: () => { sfx('click'); fn(); } },
        h('span.xc-ico', { html: glyph(icon) }), h('span.xc-label', label), h('kbd', key));
      this.cmdEl.classList.add('explore');
      this.cmdEl.append(
        cmd('talk', 'Talk', 'T', () => this.talkKey(), 'Talk to someone beside you'),
        cmd('look', 'Look', 'L', () => this.askDirection('Look', (dx, dy) => this.look(dx, dy)), 'Look around (or right-click anything)'),
        cmd('cast', 'Cast', 'C', () => this.fieldCast(), 'Cast a spell'),
        cmd('use', 'Use', 'U', () => this.fieldUse(), 'Use an item'),
        cmd('pack', 'Pack', 'I', () => this.openParty(this.selected), 'Pack and equipment'),
        cmd('journal', 'Journal', 'J', () => this.quests.openJournal(), 'Quests and lore'),
        cmd('map', 'Map', 'M', () => this.openMap()),
        cmd('camp', 'Camp', 'H', () => this.s.camp(), 'Hole up: make camp and rest'),
        cmd('wait', 'Wait', '␣', () => this.s.wait(), 'Wait a turn'),
        cmd('help', 'Help', '?', () => this.openHelp(), 'How to play'),
      );
    }
    this.hint('');
    this.refresh();
  }

  hint(text) {
    this.hintEl.textContent = text ? '› ' + text : '';
    this.hintEl.classList.toggle('on', !!text);
  }

  askDirection(what, fn) {
    this.explore?.clearHover();
    this.pendingDir = fn;
    this.hint(`${what} — which direction? (arrow key, or click a neighbouring tile; Esc cancels)`);
  }

  look(dx, dy) {
    const p = this.s.state.pos;
    this.s.log(`You see: ${this.s.describeTile(p.x + dx, p.y + dy)}.`);
  }

  // ------------------------------------------------------------ input
  bindInput() {
    this.onKey = (e) => this.handleKey(e);
    this.onMove = (e) => this.handleHover(e);
    this.onLeave = () => this.explore?.hover(null);
    this.onClick = (e) => this.handleClick(e);
    this.onCtx = (e) => { e.preventDefault(); if (!this.press?.long) this.handleLook(e.clientX, e.clientY); };
    window.addEventListener('keydown', this.onKey);
    const cv = this.view.renderer.domElement;
    cv.addEventListener('mousemove', this.onMove);
    cv.addEventListener('mouseleave', this.onLeave);
    cv.addEventListener('click', this.onClick);
    cv.addEventListener('contextmenu', this.onCtx);
    this.onWheel = (e) => { e.preventDefault(); this.view.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); };
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    cv.style.touchAction = 'none';
    this.gestures = attachGestures(this.view, cv, { pan: false });
    // a long press (finger or pen) looks instead of walking
    this.onPress = (e) => {
      if (e.pointerType === 'mouse') return;
      clearTimeout(this.pressTimer);
      const x = e.clientX, y = e.clientY;
      this.press = { x, y, long: false };
      this.pressTimer = setTimeout(() => {
        if (!this.press || this.gestures?.active) return;
        this.press.long = true;
        this.handleLook(x, y);
      }, 520);
    };
    this.onPressMove = (e) => { if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 12) { clearTimeout(this.pressTimer); this.press.moved = true; } };
    this.onPressEnd = () => { clearTimeout(this.pressTimer); };
    cv.addEventListener('pointerdown', this.onPress);
    cv.addEventListener('pointermove', this.onPressMove);
    cv.addEventListener('pointerup', this.onPressEnd);
    cv.addEventListener('pointercancel', this.onPressEnd);
  }

  unbindInput() {
    window.removeEventListener('keydown', this.onKey);
    const cv = this.view.renderer.domElement;
    cv.removeEventListener('mousemove', this.onMove);
    cv.removeEventListener('mouseleave', this.onLeave);
    cv.removeEventListener('click', this.onClick);
    cv.removeEventListener('contextmenu', this.onCtx);
    cv.removeEventListener('wheel', this.onWheel);
    cv.removeEventListener('pointerdown', this.onPress);
    cv.removeEventListener('pointermove', this.onPressMove);
    cv.removeEventListener('pointerup', this.onPressEnd);
    cv.removeEventListener('pointercancel', this.onPressEnd);
    clearTimeout(this.pressTimer);
    cv.style.cursor = '';
    if (this.gestures) { this.gestures.destroy(); this.gestures = null; }
  }

  handleKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') { e.target.blur(); closeTopModal(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (this.s.mode === 'explore') this.s.save();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (closeTopModal()) return;
      if (this.closeHero()) return;
      if (this.pendingDir || this.targeting) { this.cancelTargeting(); return; }
      if (this.autoPath) { this.explore.stop(); return; }
      if (this.s.mode === 'explore') this.openMenu();
      return;
    }
    if (anyModal()) return;
    const dir = MOVE_KEYS[e.key] || MOVE_KEYS[e.code];
    if (this.s.mode === 'combat') return this.combatKey(e, dir);
    if (this.s.mode !== 'explore') return;
    if (dir) {
      e.preventDefault();
      this.explore.stop();
      if (this.pendingDir) {
        const fn = this.pendingDir;
        this.pendingDir = null;
        this.hint('');
        fn(dir[0], dir[1]);
        return;
      }
      this.s.move(dir[0], dir[1]);
      return;
    }
    const k = e.key.toLowerCase();
    // E and 1-4: the Nearby actions
    if ((k === 'e' || (k >= '1' && k <= '4')) && !this.pendingDir) {
      if (this.explore.key(k)) e.preventDefault();
      return;
    }
    const map = {
      t: () => this.talkKey(),
      l: () => this.askDirection('Look', (dx, dy) => this.look(dx, dy)),
      c: () => this.fieldCast(),
      u: () => this.fieldUse(),
      i: () => this.openParty(),
      z: () => this.openParty(),
      h: () => this.s.camp(),
      m: () => this.openMap(),
      j: () => this.quests.openJournal(),
      ' ': () => this.s.wait(),
      '.': () => this.s.wait(),
      '?': () => this.openHelp(),
    };
    if (map[k] || map[e.key]) { e.preventDefault(); this.explore.stop(); (map[k] || map[e.key])(); }
  }

  // T: talk straight away when only one person is in reach, else ask which way
  talkKey() {
    if (this.s.mode !== 'explore') return;
    const talks = this.explore.nearby().filter((a) => a.kind === 'talk');
    if (talks.length === 1) { this.explore.stop(); talks[0].run(); return; }
    this.askDirection('Talk', (dx, dy) => this.s.talkDirection(dx, dy));
  }

  handleHover(e) {
    const b = this.s.battle;
    if (b) {
      const t = this.view.pick(e.clientX, e.clientY);
      if (!t) { this.view.showCursor(null); return; }
      const u = b.unitAt(t.x, t.y);
      this.hoverEl.textContent = u ? `${b.label(u)}${u.side === 'enemy' ? ` — ${healthWord(u.hp / u.maxHp)}` : ''}` : '';
      this.chud.hover(t, e);
      return;
    }
    if (!this.s.map) return;
    if (this.pendingDir) {
      const t = this.view.pick(e.clientX, e.clientY);
      if (t) this.view.showCursor(t.x, t.y, 0xffe040);
      return;
    }
    this.explore.hover(e.clientX, e.clientY);
  }

  handleClick(e) {
    if (anyModal()) return;
    // the end of a long press or a pinch is not a click
    if (this.press && (this.press.long || this.press.moved)) { this.press = null; return; }
    this.press = null;
    if (this.gestures?.active) return;
    const b = this.s.battle;
    if (b) { const t = this.view.pick(e.clientX, e.clientY); if (t) this.combatClick(t); return; }
    if (this.s.mode !== 'explore') return;
    if (this.pendingDir) {
      const t = this.view.pick(e.clientX, e.clientY);
      if (!t) return;
      const p = this.s.state.pos;
      const dx = t.x - p.x, dy = t.y - p.y;
      if (Math.abs(dx) + Math.abs(dy) >= 1) {
        const fn = this.pendingDir;
        this.pendingDir = null;
        this.hint('');
        fn(Math.sign(dx) * (Math.abs(dx) >= Math.abs(dy) ? 1 : 0), Math.sign(dy) * (Math.abs(dy) > Math.abs(dx) ? 1 : 0));
      }
      return;
    }
    this.explore.click(e.clientX, e.clientY);
  }

  // right-click or long press
  handleLook(x, y) {
    if (this.s.battle || anyModal() || this.s.mode !== 'explore') return;
    this.explore.look(x, y);
  }

  // ------------------------------------------------------------ combat input (the battle HUD does the work)
  combatKey(e, dir) { this.chud.key(e, dir); }
  combatClick(t) { this.chud.click(t); }
  combatEvent(type, data) { this.chud.event(type, data); }

  combatStart() {
    this.root.classList.add('combat');
    this.chud.start();
    this.setMode('combat');
    this.refresh();
  }

  combatTurn(u) {
    this.cancelTargeting();
    this.chud.turn(u);
  }

  combatEnd(summary) {
    this.root.classList.remove('combat');
    this.cancelTargeting();
    this.view.setHighlights(null);
    this.hint('');
    this.chud.end(summary);
  }

  beginAttackTargeting() { this.chud.beginAttack(); }
  combatCast() { return this.chud.cast(); }
  combatUse() { return this.chud.useItem(); }

  startTargeting(tg) {
    this.targeting = tg;
    const cells = tg.tiles || tg.units.map((u) => ({ x: u.x, y: u.y }));
    this.view.setHighlights(cells, tg.color || 0xffc030, 0.4);
    tg.index = 0;
    const foe = tg.tiles ? tg.tiles.find((c) => this.s.battle?.unitAt(c.x, c.y)?.side === 'enemy') : null;
    tg.cursor = foe ? { ...foe } : cells[0] ? { ...cells[0] } : null;
    if (tg.cursor) this.view.showCursor(tg.cursor.x, tg.cursor.y, 0xffe040);
    this.hint(`${tg.label}: click a target (Tab cycles, Enter confirms, Esc cancels).`);
  }

  targetValid(t) {
    const tg = this.targeting;
    if (!tg) return false;
    if (tg.tiles) return tg.tiles.some((c) => c.x === t.x && c.y === t.y);
    return tg.units.some((u) => u.x === t.x && u.y === t.y);
  }

  cycleTarget(d) {
    const tg = this.targeting;
    const cells = tg.units ? tg.units.map((u) => ({ x: u.x, y: u.y })) : tg.tiles.filter((c) => this.s.battle.unitAt(c.x, c.y)?.side === 'enemy');
    if (!cells.length) return;
    tg.index = ((tg.index || 0) + d + cells.length) % cells.length;
    tg.cursor = { ...cells[tg.index] };
    this.view.showCursor(tg.cursor.x, tg.cursor.y, 0xffe040);
  }

  confirmTarget() {
    const tg = this.targeting;
    if (tg && tg.cursor && this.targetValid(tg.cursor)) this.pickTarget(tg.cursor);
  }

  pickTarget(t) {
    const tg = this.targeting;
    this.cancelTargeting();
    tg.onPick(t);
  }

  cancelTargeting() {
    const wasTargeting = !!this.targeting;
    this.targeting = null;
    this.pendingDir = null;
    this.hint('');
    if (wasTargeting && this.s.battle?.active) this.combatTurn(this.s.battle.active);
  }

  // ------------------------------------------------------------ generic choosers
  chooseFrom(title, options) {
    return new Promise((resolve) => {
      let done = false;
      const list = h('div.choose-list');
      const m = modal(list, { title, cls: 'small choose-modal', onClose: () => { if (!done) resolve(null); } });
      options.forEach((o, i) => {
        // options may carry an icon (or a portrait picture) and a tag shown at the right
        const lead = o.pic ? h('img.ci-pic', { src: o.pic, alt: '' }) : o.icon ? h('span.ci-ico' + (o.tone ? '.tone-' + o.tone : ''), { html: iconSvg(o.icon) }) : null;
        list.appendChild(h('button.choose-item' + (o.disabled ? '.disabled' : '') + (lead ? '.has-ico' : ''), {
          title: o.disabled && o.why ? o.why : null,
          onclick: () => { if (o.disabled) return; done = true; m.close(); resolve(o.value); },
        }, h('span.ci-key', String(i + 1)), lead, h('span.ci-label', o.label, o.tag ? h('span.ci-tag', o.tag) : null), o.sub ? h('span.ci-sub', o.sub) : null));
      });
      const keyer = (e) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= options.length && !options[n - 1].disabled && m.back.isConnected) {
          e.stopPropagation();
          done = true; m.close(); resolve(options[n - 1].value);
        }
      };
      m.back.tabIndex = -1;
      m.back.addEventListener('keydown', keyer);
      setTimeout(() => m.back.focus(), 10);
    });
  }

  chooseSpell(member, spells) {
    const g = this.s.game;
    const inv = this.s.party.inventory;
    return this.chooseFrom(`${member.name} casts… (MP ${member.mp}/${maxMp(g, member)})`, spells.map((sp) => {
      const can = canCast(g, member, sp, inv);
      const sys = byId(g.magic, sp.system);
      const reach = SPELL_REACH[sp.target];
      return {
        label: sp.name, tag: spellCost(g, sp, inv), icon: spellIcon(sp), value: sp, disabled: !can.ok, why: can.why,
        sub: `${sp.desc || ''}${reach ? ` · ${reach}` : ''}${sys ? ` · ${sys.name}` : ''}${can.ok ? '' : ' — ' + can.why}`,
      };
    }));
  }

  chooseMember(title, filter = () => true) {
    const g = this.s.game;
    const ms = this.s.party.members.filter(filter);
    return this.chooseFrom(title, ms.map((m) => ({
      label: m.name, tag: `${m.hp}/${maxHp(g, m)} HP`, pic: portrait(this.view, charLook(g, m)), value: m,
      sub: `${raceOf(g, m).name} ${classOf(g, m).name}${m.status !== 'ok' ? ' · ' + statusLabel(m) : ''}`,
    })));
  }

  async fieldCast() {
    if (this.s.mode !== 'explore' || this.s.busy) return;
    const casters = this.s.party.members.filter((m) => m.status !== 'dead' && this.s.spellsFor(m, 'field').length);
    if (!casters.length) { this.s.log('No one in your party can cast spells here.', 'warn'); return; }
    const caster = casters.length === 1 ? casters[0] : await this.chooseMember('Who casts?', (m) => casters.includes(m));
    if (!caster) return;
    const spell = await this.chooseSpell(caster, this.s.spellsFor(caster, 'field'));
    if (!spell) return;
    let target = null;
    if (spell.target === 'ally') {
      target = await this.chooseMember(`${spell.name} — on whom?`, (m) => (spell.effect === 'revive' ? m.status === 'dead' : m.status !== 'dead'));
      if (!target) return;
    }
    await this.s.castField(caster, spell, target);
  }

  async fieldUse() {
    if (this.s.mode !== 'explore' || this.s.busy) return;
    const inv = this.s.party.inventory;
    const items = this.s.game.items.filter((it) => it.type === 'consumable' && inv[it.id] > 0);
    if (!items.length) { this.s.log('You have nothing to use.', 'warn'); return; }
    const item = await this.chooseFrom('Use which item?', items.map((it) => ({ label: it.name, tag: `×${inv[it.id]}`, sub: it.desc, icon: itemIcon(it)[0], tone: itemIcon(it)[1], value: it })));
    if (!item) return;
    let target = null;
    if (['heal', 'cure', 'mp', 'revive'].includes(item.effect)) {
      target = await this.chooseMember(`${item.name} — for whom?`, (m) => (item.effect === 'revive' ? m.status === 'dead' : m.status !== 'dead'));
      if (!target) return;
    }
    this.s.useItemField(item, target);
  }

  // ------------------------------------------------------------ talk
  openDialog(npc) {
    const s = this.s;
    const conv = h('div.talk-log');
    const input = h('input.talk-input', { type: 'text', placeholder: 'Ask about... (type a word and press Enter)', maxLength: 30 });
    const chips = h('div.talk-chips');
    const asked = new Set();
    const add = (el) => { conv.appendChild(el); conv.scrollTop = conv.scrollHeight; };
    const sayLine = (text) => {
      const p = h('p.npc-say');
      for (const part of markKeywords(text, npc)) {
        if (part.key) p.appendChild(h('a.kw', { onclick: () => ask(part.key) }, part.text));
        else p.appendChild(document.createTextNode(part.text));
      }
      add(p);
    };
    const refreshChips = () => {
      clear(chips);
      const words = new Set(['NAME', 'JOB', ...asked]);
      for (const k of knownKeywords(npc)) if (['BUY', 'ROOM', 'HEAL', 'RUMOURS', 'JOIN'].includes(k)) words.add(k);
      for (const w of words) chips.appendChild(h('button.chip', { onclick: () => ask(w) }, w));
      chips.appendChild(h('button.chip.bye', { onclick: () => ask('BYE') }, 'BYE'));
    };
    let finished = false;
    const ask = (word) => {
      word = String(word || '').trim();
      if (!word || finished) return;
      add(h('p.you-say', '› ' + word.toUpperCase()));
      const res = s.say(npc, word);
      if (res.text) sayLine(res.text);
      if (res.note) add(h('p.note', res.note));
      for (const k of knownKeywords(npc)) if (res.text && new RegExp('\\b' + k + '\\b', 'i').test(res.text)) asked.add(k);
      refreshChips();
      if (res.end) { finished = true; setTimeout(() => m.close(), 450); return; }
      if (res.shop) { this.openShop(npc); }
      if (res.inn) { this.openInn(npc); }
      if (res.healer) { this.openHealer(npc); }
      if (res.join) {
        const err = s.recruit(npc);
        if (err) add(h('p.note', err));
        else { finished = true; add(h('p.note', `${npc.name} joins your company!`)); setTimeout(() => m.close(), 900); }
      }
      if (res.fight) {
        finished = true;
        setTimeout(async () => {
          m.close();
          s.log(`${npc.name} attacks!`, 'bad');
          const out = await s.engage({ id: '__fight_' + npc.id, monster: res.fight, count: '1', roaming: true });
          if (out && out.outcome === 'victory' && s.map.entities.includes(npc)) s.removeEntity(npc);
        }, 600);
      }
      if (res.teleport) {
        finished = true;
        setTimeout(async () => { m.close(); await s.enterMap(res.teleport.map || s.map.id, +res.teleport.x || 0, +res.teleport.y || 0); }, 600);
      }
      if (res.victory) {
        finished = true;
        s.state.won = true;
        setTimeout(() => { m.close(); this.showVictory(); }, 700);
      }
    };
    const face = portrait(this.view, s.entityLook(npc));
    const role = { weapons: 'Weaponsmith', armor: 'Armourer', provisions: 'Provisioner', reagents: 'Herbalist', inn: 'Innkeeper', healer: 'Healer', tavern: 'Barkeep', bowyer: 'Bowyer', merchant: 'Merchant', lord: 'Lord', guard: 'Guard', trainer: 'Trainer' }[npc.role];
    const body = h('div.talk',
      h('div.talk-side',
        h('div.talk-pic', face ? h('img', { src: face, alt: '' }) : h('span', { html: iconSvg('talk') })),
        h('div.talk-name', npc.name || 'Stranger'),
        role ? h('div.talk-role', role) : null),
      h('div.talk-main',
        h('div.talk-head', h('b', npc.name || 'Stranger'), h('span', ' — ' + (npc.desc || ''))),
        conv,
        h('div.talk-ask', input, h('button.primary', { onclick: () => { ask(input.value); input.value = ''; input.focus(); } }, 'Ask')),
        chips,
        h('div.talk-tip', 'Click a ', h('b', 'red word'), ' or a button to ask about it, or type your own word.')),
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { ask(input.value); input.value = ''; }
    });
    const m = modal(body, { cls: 'talk-modal', onClose: () => { s.mode = 'explore'; this.refresh(); } });
    add(h('p.note', `You meet ${npc.desc || 'someone'}.`));
    if (npc.greeting) sayLine(npc.greeting);
    this.quests.dialogHook(npc, { add, sayLine });
    refreshChips();
    setTimeout(() => input.focus(), 30);
  }

  // ------------------------------------------------------------ shops
  priceOf(item, npc, selling = false) {
    const mod = npc.shop?.priceMod || 1;
    const base = item.price || 0;
    return selling ? Math.max(1, Math.floor(base * 0.5)) : Math.max(1, Math.round(base * mod));
  }

  openShop(npc) {
    const s = this.s, g = s.game;
    const stock = (npc.shop?.stock || []).map((id) => itemOf(g, id)).filter(Boolean);
    const body = h('div.shop');
    const coin = () => h('i.coin', { html: iconSvg('coin') });
    const face = portrait(this.view, s.entityLook(npc));
    let tab = 'buy';
    // who could use a piece of gear, and is it better than what they carry?
    const verdicts = (it) => {
      if (!slotFor(it)) return null;
      const who = s.party.members.filter((m) => m.status !== 'dead');
      const can = who.filter((m) => canEquip(g, m, it).ok);
      if (!can.length) return h('div.sr-cmp', h('span.cmp.none', 'No one in your company can use this'));
      return h('div.sr-cmp', ...can.map((m) => {
        const c = compareText(g, m, it);
        const cur = itemOf(g, m.equip[slotFor(it)]);
        return h('span.cmp.' + c.cls, { title: `${m.name} now has ${cur ? `${cur.name} (${itemStats(cur)})` : 'nothing'} as ${SLOT_NAMES[slotFor(it)].toLowerCase()}` },
          c.cls === 'up' ? h('i', { html: iconSvg('up') }) : null, `${m.name} ${c.text}`);
      }));
    };
    const render = () => {
      const scroller = body.parentElement;
      const keep = scroller ? scroller.scrollTop : 0;
      clear(body);
      body.append(h('div.shop-head',
        face ? h('img.shop-face', { src: face, alt: '' }) : null,
        h('div.shop-purse',
          h('span.shop-gold', { title: 'Your gold' }, coin(), String(s.party.gold)),
          g.settings.food ? h('span.shop-food', { title: 'Your food' }, h('i', { html: iconSvg('food') }), String(s.party.food)) : null),
        h('div.tabs',
          h('button' + (tab === 'buy' ? '.on' : ''), { onclick: () => { tab = 'buy'; render(); } }, 'Buy'),
          h('button' + (tab === 'sell' ? '.on' : ''), { onclick: () => { tab = 'sell'; render(); } }, 'Sell'))));
      const list = h('div.shop-list');
      if (tab === 'buy') {
        if (!stock.length) list.appendChild(h('p', 'Nothing for sale today.'));
        for (const it of stock) {
          const price = this.priceOf(it, npc);
          const owned = s.party.inventory[it.id] || 0;
          const afford = s.party.gold >= price;
          list.appendChild(h('div.shop-row' + (afford ? '' : '.dear'),
            itemTile(it),
            h('div.sr-main',
              h('div.sr-name', h('b', it.name), owned ? h('span.owned', { title: 'How many your company already carries' }, `×${owned} owned`) : null),
              h('span.sr-stats', itemStats(it)),
              it.desc ? h('div.sr-desc', it.desc) : null,
              verdicts(it)),
            h('div.sr-side', h('span.price' + (afford ? '' : '.short'), { title: afford ? 'Price' : `You need ${price - s.party.gold} more gold` }, coin(), String(price)),
              h('button' + (afford ? '.primary' : '.disabled'), {
                onclick: () => {
                  if (s.party.gold < price) { sfx('error'); return; }
                  s.party.gold -= price;
                  if (it.effect === 'food') s.party.food += parseInt(it.power, 10) || 25;
                  else s.party.inventory[it.id] = owned + 1;
                  sfx('gold');
                  s.log(`Bought ${it.name}.`, 'loot');
                  render(); this.refresh();
                },
              }, 'Buy'))));
        }
      } else {
        const inv = s.party.inventory;
        const owned = g.items.filter((it) => inv[it.id] > 0 && it.type !== 'quest');
        if (!owned.length) list.appendChild(h('p', 'You have nothing to sell.'));
        for (const it of owned) {
          const price = this.priceOf(it, npc, true);
          list.appendChild(h('div.shop-row',
            itemTile(it),
            h('div.sr-main', h('div.sr-name', h('b', it.name), h('span.owned', `×${inv[it.id]}`)), h('span.sr-stats', itemStats(it))),
            h('div.sr-side', h('span.price', coin(), String(price)), h('button', {
              onclick: () => { inv[it.id]--; s.party.gold += price; sfx('gold'); render(); this.refresh(); },
            }, 'Sell'))));
        }
        list.appendChild(h('p.hint', 'Only what is in the pack can be sold: take gear off in the Pack (I) first. Merchants pay half the price.'));
      }
      body.append(list);
      if (scroller) scroller.scrollTop = keep;
    };
    render();
    modal(body, { title: `${npc.name}'s wares`, icon: 'shop', sub: npc.desc || null, cls: 'wide shop-modal' });
  }

  openInn(npc) {
    const s = this.s;
    const n = s.party.members.filter((m) => m.status !== 'dead').length;
    const cost = (npc.price || 6) * n;
    const hurt = s.party.members.filter((m) => m.status !== 'dead' && (m.hp < maxHp(s.game, m) || m.mp < maxMp(s.game, m))).length;
    const face = portrait(this.view, s.entityLook(npc));
    modal(h('div.service',
      face ? h('img.service-face', { src: face, alt: '' }) : h('span.service-ico', { html: iconSvg('bed') }),
      h('div',
        h('p', `A room for the night costs `, h('b.gold-text', `${cost} gold`), ` for your company of ${n}.`),
        h('p.hint', `Everyone wakes with full health and mana${hurt ? ` — ${hurt} of you could use it` : ''}. The night passes and your game is saved.`),
        h('p.hint', `You have ${s.party.gold} gold.`))), {
      title: npc.name ? `${npc.name}'s Inn` : 'The Inn',
      icon: 'bed',
      cls: 'service-modal',
      buttons: [
        { label: 'Not now' },
        {
          label: `Rest (◆ ${cost})`, primary: true, onClick: () => {
            if (s.party.gold < cost) { s.log('You cannot afford a room.', 'warn'); sfx('error'); return; }
            s.party.gold -= cost;
            for (const m of s.party.members) {
              if (m.status === 'dead') continue;
              m.hp = maxHp(s.game, m); m.mp = maxMp(s.game, m);
            }
            s.state.turn += 80;
            sfx('heal');
            this.app.fade(true, 300).then(() => this.app.fade(false, 500));
            s.log('You sleep soundly and wake fully rested.', 'good');
            s.autosave();
            this.refresh();
          },
        },
      ],
    });
  }

  openHealer(npc) {
    const s = this.s, g = s.game;
    const body = h('div.shop-list');
    const render = () => {
      clear(body);
      body.appendChild(h('div.shop-head', h('div.shop-purse', h('span.shop-gold', { title: 'Your gold' }, h('i.coin', { html: iconSvg('coin') }), String(s.party.gold))),
        h('span.hint', 'Healing costs more the deeper the wounds.')));
      for (const m of s.party.members) {
        const mh = maxHp(g, m);
        const services = [];
        if (m.status === 'dead') services.push(['Raise', 150 + m.level * 25, () => { m.status = 'ok'; m.hp = mh; s.refreshPartyVisual(); }]);
        else {
          if (m.hp < mh) services.push(['Heal', 10 + (mh - m.hp), () => { m.hp = mh; }]);
          if (m.status === 'poisoned') services.push(['Cure', 20, () => { m.status = 'ok'; }]);
        }
        const face = portrait(this.view, charLook(g, m));
        body.appendChild(h('div.shop-row' + (m.status === 'dead' ? '.fallen' : ''),
          h('span.item-ico.face', face ? h('img', { src: face, alt: '' }) : null),
          h('div.sr-main', h('div.sr-name', h('b', m.name), h('span.owned', statusLabel(m))), bar('HP', m.hp, mh, 'hp')),
          h('div.sr-side', ...(services.length ? services.map(([label, cost, fn]) => h('button' + (s.party.gold >= cost ? '.primary' : '.disabled'), {
            onclick: () => {
              if (s.party.gold < cost) { sfx('error'); return; }
              s.party.gold -= cost; fn(); sfx('heal'); render(); this.refresh();
            },
          }, `${label} ◆${cost}`)) : [h('span.hint', 'In good health')]))));
      }
    };
    render();
    modal(body, { title: `${npc.name} the Healer`, icon: 'cross', sub: npc.desc || null, cls: 'wide shop-modal' });
  }

  // ------------------------------------------------------------ party / inventory
  // The pack: everything the company carries, with the chosen hero's sheet beside it
  openParty(focus) {
    const s = this.s, g = s.game;
    let sel = focus || this.selected || s.party.members[0];
    const body = h('div.party-screen');
    const render = () => {
      clear(body);
      const tabs = h('div.tabs.hero-tabs');
      for (const m of s.party.members) {
        const face = portrait(this.view, charLook(g, m));
        tabs.appendChild(h('button' + (m === sel ? '.on' : ''), { title: `${m.name}: level ${m.level} ${classOf(g, m).name}`, onclick: () => { sel = m; render(); } },
          face ? h('img.tab-face', { src: face, alt: '' }) : null, m.name, m.points > 0 ? h('span.pc-pts', '▲') : ''));
      }
      body.appendChild(tabs);
      const m = sel;
      const inv = s.party.inventory;
      const invList = h('div.inv');
      const items = g.items.filter((it) => inv[it.id] > 0);
      if (!items.length) invList.appendChild(h('p.hint', 'The pack is empty.'));
      // grouped, so gear, supplies and spell reagents are easy to find
      const groups = [
        ['Arms & armour', (it) => !!slotFor(it)],
        ['Potions & supplies', (it) => it.type === 'consumable'],
        ['Reagents', (it) => it.type === 'reagent'],
        ['Keys & treasures', () => true],
      ];
      const placed = new Set();
      for (const [label, test] of groups) {
        const list = items.filter((it) => !placed.has(it) && test(it));
        if (!list.length) continue;
        invList.appendChild(h('div.inv-group', label));
        for (const it of list) {
          placed.add(it);
          const slot = slotFor(it);
          const cmp = slot ? compareText(g, m, it) : null;
          const ok = slot ? canEquip(g, m, it) : null;
          const row = h('div.inv-row', { title: it.desc || null },
            itemTile(it),
            h('span.inv-name', h('b', it.name), inv[it.id] > 1 ? h('span.inv-n', `×${inv[it.id]}`) : null,
              h('span.inv-stats', itemStats(it)),
              cmp && ok.ok ? h('span.cmp.' + cmp.cls, `${m.name}: ${cmp.text}`) : null));
          if (slot && !s.battle) {
            row.appendChild(h('button' + (ok.ok ? '' : '.disabled'), {
              title: ok.ok ? `Equip on ${m.name} (${SLOT_NAMES[ok.slot].toLowerCase()})` : ok.why,
              onclick: () => {
                const res = equipItem(g, m, it, inv);
                if (!res.ok) { s.log(res.why, 'warn'); sfx('error'); return; }
                sfx('click');
                s.refreshPartyVisual();
                render(); this.refresh();
              },
            }, 'Equip'));
          } else if (it.type === 'consumable' && !s.battle) {
            row.appendChild(h('button', { title: it.desc || 'Use it now', onclick: async () => { closeTopModal(); await this.fieldUseItem(it); } }, 'Use'));
          }
          invList.appendChild(row);
        }
      }
      body.appendChild(h('div.pack-cols',
        h('div.pack-sheet', this.heroSheet(m, () => { render(); this.refresh(); })),
        h('div.inv-wrap',
          h('div.pack-head', h('span', h('i', { html: iconSvg('pack') }), ' The Pack'),
            h('span.pack-purse', h('span', { title: 'Gold' }, h('i.coin', { html: iconSvg('coin') }), String(s.party.gold)),
              g.settings.food ? h('span', { title: 'Food' }, h('i', { html: iconSvg('food') }), String(s.party.food)) : null)),
          h('p.hint.pack-hint', `Everything the company carries is shared. Equip gear on ${m.name}, or pick another hero above.`),
          invList)));
    };
    render();
    modal(body, { title: 'Your Company', icon: 'pack', cls: 'wide party-modal' });
  }

  async fieldUseItem(it) {
    let target = null;
    if (['heal', 'cure', 'mp', 'revive'].includes(it.effect)) {
      target = await this.chooseMember(`${it.name} — for whom?`, (m) => (it.effect === 'revive' ? m.status === 'dead' : m.status !== 'dead'));
      if (!target) return;
    }
    this.s.useItemField(it, target);
  }

  // ------------------------------------------------------------ map
  openMap() {
    const s = this.s;
    const map = s.map;
    if (!map || s.battle) return;
    const scale = Math.max(2, Math.min(8, Math.floor(560 / Math.max(map.w, map.h))));
    const c = h('canvas.bigmap', { width: map.w * scale, height: map.h * scale });
    const ctx = c.getContext('2d');
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (s.visible && !map.explored[i]) continue;
      const t = terrain(getTile(map, x, y));
      ctx.fillStyle = '#' + t.top.toString(16).padStart(6, '0');
      ctx.fillRect(x * scale, y * scale, scale, scale);
      if (t.feature || t.key === 'stairs_down' || t.key === 'stairs_up') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * scale + scale * 0.25, y * scale + scale * 0.25, scale * 0.5, scale * 0.5);
      } else if (t.wall || t.key === 'mountains' || t.key === 'peaks') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    for (const e of map.entities) {
      if (e.type !== 'portal' || !e.label) continue;
      if (s.visible && !map.explored[e.y * map.w + e.x]) continue;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(10, scale * 2.2)}px serif`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(e.label, e.x * scale + scale + 2, e.y * scale + scale);
      ctx.fillText(e.label, e.x * scale + scale + 2, e.y * scale + scale);
    }
    const p = s.state.pos;
    ctx.fillStyle = '#ff0';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(p.x * scale + scale / 2, p.y * scale + scale / 2, Math.max(3, scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.quests.drawPins(ctx, scale, { events: true });
    modal(h('div.map-wrap', c), { title: map.name, icon: 'map', cls: 'map-modal' });
  }

  // ------------------------------------------------------------ menus & endings
  openMenu() {
    const s = this.s;
    const items = [
      ['play', 'Resume', () => {}],
      !s.opts.noSave ? ['save', 'Save game', () => s.save()] : null,
      ['help', 'Help & keys', () => this.openHelp()],
      ['book', 'Journal', () => this.quests?.openJournal()],
      ['sound', isMuted() ? 'Sound effects: off' : 'Sound effects: on', () => { setMuted(!isMuted()); }],
      ['note', musicEnabled() ? 'Music: on' : 'Music: off', () => { setMusicEnabled(!musicEnabled()); }],
      ['camera', 'Camera angle', () => this.openCamera()],
      s.opts.fromEditor ? ['anvil', 'Return to the Construction Set', () => this.app.endPlay(true)] : ['door', 'Quit to title', async () => {
        if (await confirmDialog('Return to the title screen? Unsaved progress since your last save will be lost.')) this.app.endPlay(false);
      }],
    ].filter(Boolean);
    const list = h('div.choose-list.menu-list');
    const m = modal(list, { title: this.s.game.meta.title, icon: 'castle', cls: 'small menu-modal' });
    for (const [icon, label, fn] of items) list.appendChild(h('button.choose-item.has-ico', { onclick: () => { m.close(); fn(); } }, h('span.ci-ico', { html: iconSvg(icon) }), h('span.ci-label', label)));
  }

  openCamera() {
    const v = this.view;
    const slider = h('input', { type: 'range', min: 50, max: 85, value: v.rig.pitch });
    slider.addEventListener('input', () => v.setPitch(+slider.value));
    modal(h('div', h('p', 'Camera pitch (degrees above the horizon):'), slider, h('p.hint', 'Scroll the mouse wheel to zoom.')), { title: 'Camera', icon: 'camera', cls: 'small' });
  }

  // the controls reference (help.js), with the full rules folded in below it
  openHelp() { openHelpOverlay(this, HELP_HTML); }

  showGameOver() {
    const s = this.s;
    const saved = !s.opts.noSave && loadState(s.game.id);
    sfx('defeat');
    modal(h('div', h('p.big', 'Your company has perished.'), h('p', 'Yet the tale need not end here...')), {
      title: 'Darkness Falls', icon: 'skull',
      closeOnBack: false,
      closeOnEsc: false,
      buttons: [
        saved ? { label: 'Load last save', onClick: () => this.app.continueGame() } : null,
        { label: 'Rise again (lose half your gold)', primary: true, onClick: () => { s.resurrect(); } },
        { label: s.opts.fromEditor ? 'Back to editor' : 'Quit to title', onClick: () => this.app.endPlay(!!s.opts.fromEditor) },
      ].filter(Boolean),
    });
  }

  showVictory() {
    const s = this.s, g = s.game;
    sfx('victory');
    const lines = (g.meta.victoryText || 'Victory!').split(/\n+/).map((t) => h('p', t));
    modal(h('div.victory', ...lines, h('p.hint', `Turns taken: ${s.state.turn}. Party: ${s.party.members.map((m) => `${m.name} (L${m.level})`).join(', ')}`)), {
      title: 'Victory', icon: 'crown',
      cls: 'wide',
      buttons: [
        { label: 'Keep exploring' },
        { label: s.opts.fromEditor ? 'Back to editor' : 'Title screen', primary: true, onClick: () => this.app.endPlay(!!s.opts.fromEditor) },
      ],
    });
  }
}

function bar(label, v, max, cls) {
  const f = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  return h('div.bar.' + cls, h('i', { style: { width: (f * 100).toFixed(0) + '%' } }), h('span', `${label} ${v}/${max}`));
}

function fmtMod(n) { return n >= 0 ? '+' + n : String(n); }

const SPELL_ICONS = { heal: 'heart', cure: 'cross', revive: 'sun', sleep: 'sleep', fear: 'fear', shield: 'shield', bless: 'sparkle', drain: 'skull', light: 'torch', reveal: 'eye', recall: 'blink' };
function spellIcon(sp) {
  if (sp.effect === 'damage') return /frost/i.test(sp.id) ? 'frost' : sp.system === 'song' ? 'note' : sp.system === 'runic' ? 'rune' : sp.system === 'divine' ? 'sun' : 'fire';
  return SPELL_ICONS[sp.effect] || 'wand';
}
function spellCost(g, sp, inv) {
  return sp.reagents && sp.reagents.length
    ? sp.reagents.map((r) => `${itemOf(g, r)?.name || r}${inv ? ` (${inv[r] || 0})` : ''}`).join(' + ')
    : `${sp.cost || 0} MP`;
}
// what a spell reaches, in words
const SPELL_REACH = { enemy: 'one foe', area: 'a group of foes', allEnemies: 'every foe', ally: 'one companion', allAllies: 'the whole company', self: 'the caster' };

// how an item compares with what a hero already has in that slot
function compareText(g, m, it) {
  const slot = slotFor(it);
  if (!slot) return null;
  const cur = itemOf(g, m.equip[slot]);
  if (cur?.id === it.id) return { cls: 'same', text: 'equipped' };
  if (it.type === 'weapon') {
    const d = diceAvg(it.dmg || '1d2') + (it.hit || 0) * 0.5 - (cur ? diceAvg(cur.dmg || '1d2') + (cur.hit || 0) * 0.5 : slot === 'weapon' ? 1.5 : 0);
    if (!cur && slot === 'ranged') return { cls: 'up', text: 'new: can shoot' };
    const v = Math.round(d * 10) / 10;
    return v > 0.05 ? { cls: 'up', text: `+${v} dmg` } : v < -0.05 ? { cls: 'down', text: `${v} dmg` } : { cls: 'same', text: 'same dmg' };
  }
  const v = (it.ac || 0) - (cur?.ac || 0);
  return v > 0 ? { cls: 'up', text: `+${v} armour` } : v < 0 ? { cls: 'down', text: `${v} armour` } : { cls: 'same', text: 'same armour' };
}

function healthWord(f) {
  if (f > 0.9) return 'unhurt';
  if (f > 0.6) return 'wounded';
  if (f > 0.3) return 'badly hurt';
  return 'near death';
}

export function itemStats(it) {
  switch (it.type) {
    case 'weapon': return `${it.dmg}${it.hit ? ` ${it.hit > 0 ? '+' : ''}${it.hit} hit` : ''}${(it.range || 1) > 1 ? `, range ${it.range}` : ''}${it.twoHanded ? ', two-handed' : ''}`;
    case 'armor': return `AC +${it.ac} (${it.weight})`;
    case 'shield': return `AC +${it.ac}`;
    case 'consumable': return it.effect === 'food' ? `+${it.power} food` : it.power ? `${it.effect} ${it.power}` : it.effect;
    case 'reagent': return 'reagent';
    case 'key': return 'key';
    default: return it.type;
  }
}

const HELP_HTML = `
<h3>Exploring</h3>
<p><b>Point at anything</b> on the map to see what it is and what a click will do. <b>Click</b> to act: click the ground to walk
there (the dotted line shows the way), a person to walk up and talk, a shop or house to visit whoever keeps it, a monster to attack,
a chest, shrine, door or stairs to go and use it. <b>Right-click</b> (or press and hold on a tablet) to look without moving.
Any key stops a walk. Two fingers pinch to zoom; the mouse wheel zooms too.</p>
<p>The <b>Nearby</b> bar over the map lists what you can do where you stand — <b>T</b> talks, <b>E</b> does the first other thing,
<b>1–4</b> the rest. Marks over heads: <b class="hk-q">!</b> has a task for you, <b class="hk-q">?</b> wants to hear about your quest,
<b class="hk-p">?</b> is waiting on one; coins, a bed and a cross mark shops, inns and healers; a banner, someone who might join you.</p>
<table class="keys">
<tr><td>Arrows / WASD</td><td>Walk (bump into people to talk, monsters to fight)</td><td>T</td><td>Talk</td></tr>
<tr><td>E, 1–4</td><td>Nearby actions</td><td>L</td><td>Look</td></tr>
<tr><td>C</td><td>Cast a spell</td><td>U</td><td>Use an item</td></tr>
<tr><td>I</td><td>Pack &amp; equipment</td><td>H</td><td>Hole up (camp &amp; rest)</td></tr>
<tr><td>M</td><td>Map</td><td>Space</td><td>Wait a turn</td></tr>
<tr><td>J</td><td>Journal (quests, lore)</td><td>?</td><td>This help</td></tr>
<tr><td>Ctrl/⌘+S</td><td>Save</td><td>Esc</td><td>Stop walking / menu</td></tr>
</table>
<p>Step onto towns, caves and stairs to enter them; walk off the edge of a town to leave.</p>
<h3>Quests</h3>
<p>Your current goal is always shown at the top left of the map, with an arrow pointing the way. People with a task for you
are marked <b>!</b>; talk to them to take it on. Press <b>J</b> for the Journal: every quest, its steps and its reward.
Shrines, campfires, standing stones and stranger things are scattered across the land — click them to see what they offer.</p>
<h3>Your company</h3>
<p>Click a hero on the right to see their sheet. Each hero carries a <b>hand weapon</b> for melee and a <b>ranged weapon</b>
(bow, crossbow or sling) — change either, and armour and shield, straight from the sheet. Every level brings an
<b>attribute point</b> (▲) to spend with the <b>+</b> buttons.</p>
<h3>Talking</h3>
<p>Type a word to ask about it — <b>NAME</b>, <b>JOB</b> and anything the person mentions. Highlighted words are worth asking about.
Merchants answer to <b>BUY</b>, innkeepers to <b>ROOM</b>, healers to <b>HEAL</b>, and some folk will <b>JOIN</b> your company.</p>
<h3>Battle</h3>
<p>Everyone acts in turn: the strip along the top shows who acts now and who comes next. On a hero's turn, move up to their
squares (click a blue square, or the arrows), then strike, shoot, cast, use a skill or an item. <b>Hover</b> any figure to see its
health, conditions, what it is up to and your <b>chance to hit</b>; hover a square to see the path there.</p>
<p><b>Tactics.</b> <b>Flanking</b>: +2 to hit a foe that a companion also stands beside. <b>From behind</b>: +2 and half as much
damage again when you strike a foe's back (burglars backstab for double). <b>Cover</b>: beside a tree, rock or wall, missiles from
that side are −3 to hit. <b>Engaged</b>: shooting with a foe beside you is −4. <b>Breaking away</b>: stepping out of a foe's reach
gives it a free strike (amber squares warn you).</p>
<p><b>Skills</b> (keys 1, 2) recharge after a few turns; free actions do not end the turn. The <b>★ special</b> (Q) works once per
battle. When a great foe winds up a blow, <b>red squares</b> show where it lands on its next turn: step aside, or stun it to break it
off. Every level brings a new <b>talent</b> to choose. Walk off the edge of the field to flee.</p>
<table class="keys">
<tr><td>F</td><td>Attack / shoot</td><td>1, 2</td><td>Skills</td></tr>
<tr><td>Q</td><td>★ Special</td><td>G</td><td>Guard (+3 armour)</td></tr>
<tr><td>C</td><td>Cast</td><td>U</td><td>Use item</td></tr>
<tr><td>Space</td><td>End turn</td><td>Tab, Enter</td><td>Next / confirm target</td></tr>
</table>
<h3>Survival</h3>
<p>Food runs down as you travel. Swamps may poison you. Rest at inns, or hole up in the wild (if no foes are near).
Forests and mountains block your sight. Carry torches into dark places. Night falls every few hundred turns:
you see less, and more monsters roam.</p>`;

export { escapeHtml };
