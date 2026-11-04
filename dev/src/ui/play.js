// Play-mode HUD and all of its windows (talk, shop, party, spells, map...).
import { h, clear, modal, toast, anyModal, closeTopModal, closeAllModals, confirmDialog } from './dom.js';
import { byId, getMap } from '../data/schema.js';
import { terrain } from '../data/terrain.js';
import { diceAvg } from '../core/rng.js';
import { getTile } from '../world/map.js';
import {
  maxHp, maxMp, armorClass, attackBonus, weaponOf, rangedOf, canEquip, itemOf, raceOf, classOf, xpForLevel, gainXp,
  statusLabel, mod, slotFor, equipItem, unequip, spendPoint, specialOf, combatMoves, charLook, EQUIP_SLOTS, SLOT_NAMES,
 magicalOf, wearRule,
} from '../game/rules.js';
import { charmInfo, charmPrice, hasMagic } from '../game/charms.js';
import { markKeywords, knownKeywords } from '../game/dialog.js';
import { STAT_NAMES, STATS, CHARM_KINDS, RARITIES } from '../data/defaults.js';
import { sfx, isMuted, setMuted } from '../core/sound.js';
import { musicEnabled, setMusicEnabled } from '../core/music.js';
import { loadState } from '../core/storage.js';
import { escapeHtml } from '../core/util.js';
import { attachGestures, attachWheel } from '../render/gestures.js';
import { portrait } from '../render/portrait.js';
import { CombatHud, sheetAbilities } from './combatHud.js';
import { iconSvg, itemIcon, itemTile } from './icons.js';
import { openHelpOverlay } from './help.js';
import { QuestUI } from './journal.js';
import { Explorer, glyph } from './explore.js';
import { clockText, durationText, travelTimes } from '../game/travel.js';
import { LevelUpCard } from './levelUp.js';
import { questPins } from '../game/quests.js';
import { fillVellum, inkEdges } from './vellum.js';
import { showTreasureMap, treasureCircles, drawTreasureCircles } from './treasureMap.js';
import { isDug } from '../game/treasure.js';
import { castWindow, sheetSpells, resourceLine } from './spellbook.js';
import { reagentUse, scrollUse, canCopy, copyScroll, hasBook, restoresPool, poolWords, poolName, noNeed } from '../game/magic.js';
import { heroKey } from '../game/delve.js';
import { EVENT_DOTS, eventDot } from '../game/events.js';

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
};

// a small glyph before each kind of log line, so the eye can sort them
const LOG_ICONS = { good: 'heart', bad: 'sword', warn: 'warn', magic: 'sparkle', place: 'place', say: 'talk', level: 'up', loot: 'coin', quest: 'scroll', tip: 'help' };

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
    this.levelUp = new LevelUpCard(this); // the talent choice after a level gained outside battle
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
    this.restEl = h('div.hud-resting');
    this.heroEl = h('div.hud-hero');
    this.popEl = h('div.hero-pop', h('button.pop-close', { title: 'Close (Esc)', onclick: () => this.closeHero() }, '×'), this.heroEl);
    this.popEl.hidden = true;
    this.logEl = h('div.hud-log');
    // The log always shows the newest line. Only while the player is reading
    // back (they scrolled it up themselves, in the last few seconds) does it
    // wait; then it jumps to the end with the next line. (Following "is it at
    // the bottom?" alone stuck for good after one scroll up.)
    this.logReadUntil = 0;
    const reading = () => {
      const el = this.logEl;
      // (only the player's own wheel, drag or keys count, never our scrolling)
      requestAnimationFrame(() => { this.logReadUntil = el.scrollHeight - el.scrollTop - el.clientHeight > 24 ? performance.now() + 8000 : 0; });
    };
    for (const ev of ['wheel', 'touchmove', 'keydown']) this.logEl.addEventListener(ev, reading, { passive: true });
    this.logEl.addEventListener('pointerdown', () => { this.logDrag = true; });
    window.addEventListener('pointerup', this.onLogUp = () => { if (this.logDrag) { this.logDrag = false; reading(); } });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.logToEnd()).observe(this.logEl);
    this.hintEl = h('div.hud-prompt');
    this.cmdEl = h('div.hud-cmds');
    // (delve) in a dungeon battleground: who walks, the company or one hero
    this.dvBar = h('div.dv-bar', { role: 'toolbar', 'aria-label': 'Who walks' });
    this.dvBar.hidden = true;
    // (delve) a cleared level's way straight out, just below the bar
    this.dvOut = h('button.dv-chip.dv-out', { title: 'Every foe here is slain: walk straight out (up through any cleared levels above) without retracing your steps. The walk still takes its time. (X)', onclick: () => this.quickExit() },
      h('span.dv-ico', { html: iconSvg('door') }), h('span.dv-name', 'Leave the dungeon'), h('kbd', 'X'));
    this.dvOut.hidden = true;
    this.minimap = h('canvas.hud-minimap', { width: 64, height: 64, title: 'Map (M): the yellow dot is your company, the gold diamond your current goal. Click for the big map and its key.', onclick: () => this.openMap() });
    root.append(
      h('div.hud-head',
        h('div.hud-title', h('i.st-ico', { html: iconSvg('castle') }), this.s.game.meta.title),
        this.statusEl,
        this.hoverEl,
        h('button.hud-help', { onclick: () => this.openHelp(), title: 'How to play (?)', 'aria-label': 'Help', html: iconSvg('help') }),
        h('button.hud-menu', { onclick: () => this.openMenu(), title: 'Save, sound, camera and quit (Esc)' }, h('i.st-ico', { html: iconSvg('menu') }), 'Menu')),
      h('div.hud-frame'),
      h('div.hud-side', h('div.side-head', 'Company'), this.partyEl, this.restEl),
      this.popEl,
      this.dvBar,
      this.dvOut,
      h('div.hud-foot',
        h('div.hud-logbox', this.logEl, this.hintEl),
        this.cmdEl,
        h('div.hud-mapbox', this.minimap, this.mmLegend = minimapLegend())),
    );
    this.app.ui.appendChild(root);
    this.app.setLayout('play');
    this.selected = this.s.party.members[0] || null;
  }

  destroy() {
    this.s.rememberZoom?.();
    this.chud.stop();
    clearTimeout(this.chud.vicTimer);
    this.chud.victoryPending = false;
    this.unbindInput();
    this.quests?.destroy();
    this.explore?.destroy();
    this.levelUp?.destroy();
    this.view.markers.clear();
    this.view.pathPreview.clear();
    document.removeEventListener('pointerdown', this.onOutside, true);
    window.removeEventListener('pointerup', this.onLogUp);
    closeAllModals();
    this.root.remove();
    this.view.showCursor(null);
    this.view.setHighlights(null);
  }

  log(text, cls = '') {
    // the same line again (bumping a wall six times) counts up instead of repeating
    const last = this.logLines[this.logLines.length - 1];
    if (last && last.text === text && last.cls === cls && last.el?.isConnected) {
      last.n = (last.n || 1) + 1;
      if (!last.rep) last.el.appendChild(last.rep = h('span.log-rep'));
      last.rep.textContent = ` (×${last.n})`;
      this.logToEnd();
      return;
    }
    const line = { text, cls };
    this.logLines.push(line);
    if (this.logLines.length > 400) this.logLines.shift();
    const el = this.logEl;
    const ico = LOG_ICONS[cls];
    el.appendChild(line.el = h('div.log-line' + (cls ? '.' + cls : ''), ico ? h('i.log-ico', { html: iconSvg(ico) }) : null, text));
    while (el.childNodes.length > 400) el.removeChild(el.firstChild);
    this.logToEnd();
  }

  // show the newest line (unless the player is reading back just now)
  logToEnd() {
    const el = this.logEl;
    if (!el || performance.now() < this.logReadUntil) return;
    el.scrollTop = el.scrollHeight;
    // and again once the line is laid out (fonts, icons, a wrapped line)
    cancelAnimationFrame(this.logRaf);
    this.logRaf = requestAnimationFrame(() => { if (performance.now() >= this.logReadUntil) el.scrollTop = el.scrollHeight; });
  }

  refresh() {
    this.refreshStatus();
    this.refreshDelveBar();
    this.refreshParty();
    this.refreshResting();
    this.offerJoin();
    this.refreshHero();
    this.drawMinimap();
    this.quests?.refresh();
    this.explore?.refreshNearby();
    this.explore?.refreshMarkers();
    this.levelUp?.check();
  }

  onMapChanged() { this.drawMinimap(); }

  // A poison tick: a green "−1" and bubbles over the hero's figure, and their
  // card flashes
  onPoisonTick(m) {
    const s = this.s, v = this.view;
    const p = s.dv?.pos ? s.dv.pos(m) : s.state.pos;
    if (p && !s.battle) {
      v.floatText(p.x, p.y, '−1 ☠', '#8ef070');
      v.burst(p.x, p.y, 0x70e040, 8, { speed: 0.3, up: 1.0, gravity: 0.4, duration: 0.9, y: 0.6 });
    }
    this.refresh();
    const i = s.party.members.indexOf(m);
    const card = this.partyEl.children[i];
    if (card) { card.classList.remove('pc-sting'); void card.offsetWidth; card.classList.add('pc-sting'); }
  }

  refreshStatus() {
    const s = this.s, p = s.party;
    const map = s.battle ? null : s.map;
    clear(this.statusEl);
    const tod = !s.battle && s.dayCycleActive && s.dayCycleActive() ? s.timeOfDay() : null;
    const n = s.party.members.filter((m) => m.status !== 'dead').length || 1;
    const ico = (name) => h('i.st-ico', { html: iconSvg(name) });
    this.statusEl.append(...[
      h('span.st-place', { title: s.battle ? 'A battle is under way' : 'Where your company stands' }, ico(s.battle ? 'sword' : 'place'), s.battle ? 'Battle' : map ? map.name : ''),
      tod ? h('span.st-item.st-time' + (tod.dark > 0.5 ? '.night' : ''), {
        title: `Day ${tod.day}, ${clockText(s.state.turn || 0)}. Each step takes time: ten squares take\n${travelTimes().join('\n')}\nA camp takes ${durationText(50)}, a night at an inn ${durationText(80)}. At night you see less and more monsters roam.`,
      }, ico(tod.dark > 0.5 ? 'moon' : 'sun'), `${tod.name} · ${clockText(s.state.turn || 0).replace('about ', '~')}, day ${tod.day}`) : null,
      h('span.st-item.st-gold', { title: 'Gold: spend it in shops, inns and temples' }, ico('coin'), String(p.gold)),
      this.s.game.settings.food ? h('span.st-item.st-food' + (p.food < 20 ? '.low' : ''), { title: `Food: in the wild each hero eats a ration every 20 turns (roads are quicker, rough ground slower), and a camp costs ${n}. Without food the company goes hungry. Every town's provisioner sells rations.` }, ico('food'), String(p.food)) : null,
      p.light > 0 ? h('span.st-item.st-light', { title: 'Torchlight: lets you see in dark places; it burns down as you walk' }, ico('torch'), String(p.light)) : null,
      s.state.vehicle ? h('span.st-item', { title: 'Sailing: walk onto land to go ashore' }, ico('compass'), 'Aboard ship') : null,
      (() => {
        const sick = p.members.filter((m) => m.status === 'poisoned');
        if (!sick.length || s.battle) return null;
        return h('span.st-item.st-poison', { title: `Poisoned: ${sick.map((m) => `${m.name} (${m.hp}/${maxHp(s.game, m)})`).join(', ')}. They lose health as you travel until cured: an Antidote (U), Cure Poison or the Rune of Purity, or any town healer.` },
          ico('skull'), sick.length === 1 ? `${sick[0].name} poisoned` : `${sick.length} poisoned`);
      })(),
    ].filter(Boolean));
  }

  // (delve) In a dungeon battleground every hero has a square of their own:
  // the whole company walks together (the others fall in behind the leader),
  // or one hero walks alone. A chip per hero; Tab picks the next, G gathers.
  refreshDelveBar() {
    const s = this.s, dv = s.dv, el = this.dvBar;
    const on = !!dv && !s.battle && (s.mode === 'explore' || s.mode === 'dialog');
    const list = on ? dv.alive() : [];
    const sel = on ? dv.selected() : null, bearer = on ? dv.bearer() : null;
    const out = on && !!s.map?.exit && s.levelCleared?.();
    const sig = on ? [list.map((m) => heroKey(m) + ':' + m.status).join(), sel && heroKey(sel), bearer && heroKey(bearer), out].join('|') : '';
    if (sig === this._dvSig) return;
    this._dvSig = sig;
    clear(el);
    this.dvOut.hidden = !out;
    this.dvOut.classList.toggle('alone', list.length < 2);
    el.hidden = !on || list.length < 2;
    if (el.hidden) return;
    const g = s.game;
    el.append(
      h('button.dv-chip.all' + (sel ? '' : '.on'), { title: 'All together: the company walks as one, the others falling in behind the leader (G)', onclick: () => dv.select(null) },
        h('span.dv-ico', { html: iconSvg('party') }), h('span.dv-name', 'All together'), h('kbd', 'G')),
      ...list.map((m) => {
        const pic = portrait(this.view, charLook(g, m));
        return h('button.dv-chip' + (m === sel ? '.on' : ''), { title: m === sel ? `${m.name} walks alone` : `Send ${m.name} on alone (the others stay where they stand)`, onclick: () => dv.select(m) },
          pic ? h('img', { src: pic, alt: '' }) : null, h('span.dv-name', m.name),
          m === bearer ? h('i.dv-torch', { title: `${m.name} carries the torch: seen further in the dark, and sees further`, html: iconSvg('torch') }) : null);
      }),
      h('span.dv-tab', { title: 'Tab: the next hero · Shift+Tab: the one before' }, h('kbd', 'Tab')));
  }

  // (delve) out of a cleared dungeon at once
  async quickExit() {
    const s = this.s;
    if (!s.dv) return;
    if (!s.map?.exit) { s.log('There is no way out of here to hurry to.', 'warn'); return; }
    if (!s.levelCleared()) { s.log('Not while foes still lurk here: clear the level first, or walk back to the stairs.', 'warn'); sfx('error'); return; }
    this.explore.stop();
    await s.quickExit();
  }

  // the moment the last foe on a level falls
  onCleared(name) {
    this.quests.banner(h('div.qbanner.done', h('div.qb-kind', 'Cleared'), h('div.qb-name', name), h('div.qb-line', 'Not a foe left alive. Leave the dungeon (X) to walk straight out.')));
    this._dvSig = null;
    this.refreshDelveBar();
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
    this.refreshPickBar();
    const g = this.s.game;
    const active = this.s.battle?.active?.member;
    const dv = this.s.battle ? null : this.s.dv;
    const walker = dv?.selected();
    this.s.party.members.forEach((m, i) => {
      const mhp = maxHp(g, m);
      const w = weaponOf(g, m), rw = rangedOf(g, m);
      const next = xpForLevel(m.level + 1), prev = xpForLevel(m.level);
      const xpf = isFinite(next) ? Math.max(0, Math.min(1, (m.xp - prev) / Math.max(1, next - prev))) : 1;
      const pick = this.pickState(m);
      const cls = '.pcard' + (m.status === 'dead' ? '.dead' : '') + (m.status === 'poisoned' ? '.poisoned' : '') + (m === active ? '.active' : '') + (m === this.popHero ? '.sel' : '') + (i === 0 ? '.leader' : '') + (walker === m ? '.dv-walks' : '')
        + (pick ? (pick.ok ? '.pick-ok' : '.pick-no') : '');
      const pic = portrait(this.view, charLook(g, m));
      const who = `${m.name} — Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}${i === 0 ? ' · party leader' : ''}`;
      const card = h('div' + cls, { title: pick ? (pick.ok ? `${pick.title}: ${m.name}` : `${m.name}: ${pick.why}`) : `${who}. Click for the full sheet.` },
        h('div.pc-pic', { title: who }, pic ? h('img', { src: pic, alt: m.name }) : null, i === 0 ? h('span.pc-crown', { title: 'Party leader', html: iconSvg('crown') }) : null),
        h('div.pc-body',
          h('div.pc-head', h('span.pc-name', m.name),
            m.points > 0 ? h('span.pc-pts', { title: 'Attribute points to spend' }, '▲' + m.points) : null,
            m.perkPending > 0 ? h('span.pc-pts.perk', { title: 'A talent to choose — open the sheet', html: iconSvg('star') }) : null,
            m.status === 'poisoned' ? h('span.pc-status.poisoned', { title: `${m.name} is poisoned: loses health as the company travels, and in battle, until cured — an Antidote (U), a Cure Poison spell or Rune of Purity, or a town healer.`, html: iconSvg('skull') + 'Poisoned' })
              : m.status !== 'ok' ? h('span.pc-status.' + m.status, statusLabel(m)) : null,
            i === 0 ? h('span.pc-lead', 'Leader') : null),
          h('div.pc-sub', `Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}`),
          bar('HP', m.hp, mhp, 'hp'),
          resourceLine(g, m, this.s.party.inventory),
          h('div.pc-xp', { title: isFinite(next) ? `${m.xp} / ${next} experience to level ${m.level + 1}` : `${m.xp} experience` }, h('i', { style: { width: Math.round(xpf * 100) + '%' } })),
          h('div.pc-gear',
            h('span', { title: 'Armour: foes must roll this or more to hit' }, h('i.gi', { html: iconSvg('shield') }), String(armorClass(g, m))),
            h('span', { title: `${w.name}: ${w.dmg} damage` }, h('i.gi', { html: iconSvg(w.id ? itemIcon(w)[0] : 'sword') }), w.name),
            rw ? h('span', { title: `${rw.name}: ${rw.dmg} damage, range ${rw.range}` }, h('i.gi', { html: iconSvg(itemIcon(rw)[0]) }), rw.name) : null,
            // (charms) the worn charm, as its glyph in its rarity's colour
            (() => { const ch = itemOf(g, m.equip?.charm); return ch ? h('span.pc-charm', { title: itemTip(g, ch), style: { color: magicalOf(ch)?.color } }, h('i.gi', { html: iconSvg(itemIcon(ch)[0]) })) : null; })()),
        ));
      // (choosing a hero for something: the card says whether it can go to them)
      if (pick) {
        card.appendChild(pick.ok ? h('span.pc-key', String(i + 1)) : h('span.pc-why', pick.why));
      }
      card.addEventListener('click', () => (pick ? this.pickCard(m) : this.selectHero(m, card)));
      // (delve) the portrait sends a hero on alone; the rest of the card opens the sheet
      if (dv && m.status !== 'dead' && !pick) {
        const pc = card.querySelector('.pc-pic');
        pc.title = walker === m ? `${m.name} walks alone` : `Click the portrait to send ${m.name} on alone`;
        pc.addEventListener('click', (e) => { e.stopPropagation(); dv.select(m); });
        if (walker === m) pc.appendChild(h('span.pc-walk', { title: 'Walking alone' }, '◆'));
      }
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
        resourceLine(g, m, inv),
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
      if (cur) sel.appendChild(h('option', { value: cur.id, selected: true }, `${magicalOf(cur) ? '✦ ' : ''}${cur.name} (${itemStats(cur)})`));
      for (const it of g.items) {
        if (!(inv[it.id] > 0) || slotFor(it) !== slot || (cur && it.id === cur.id)) continue;
        const ok = canEquip(g, m, it);
        sel.appendChild(h('option', { value: it.id, disabled: !ok.ok }, `${magicalOf(it) ? '✦ ' : ''}${it.name} (${itemStats(it)})${ok.ok ? '' : ' — ' + ok.why}`));
      }
      sel.value = cur ? cur.id : '';
      sel.addEventListener('change', () => {
        if (!sel.value) unequip(m, slot, inv, g);
        else {
          const res = equipItem(g, m, itemOf(g, sel.value), inv);
          if (!res.ok) { s.log(res.why, 'warn'); sfx('error'); }
        }
        sfx('click');
        changed();
      });
      eq.appendChild(h('div.slot' + (slot === 'charm' ? '.slot-charm' : ''), { title: cur && hasMagic(cur) ? itemTip(g, cur) : slot === 'charm' ? CHARM_SLOT_TIP : null }, h('span.slot-name', SLOT_NAMES[slot]), sel));
    }
    add(eq);
    add(charmPanel(g, m));
    // battle skills, special and talents
    add(sheetAbilities(this, m, changed));
    // spells, by school
    add(sheetSpells(g, m, inv));
    const idx = s.party.members.indexOf(m);
    add(h('div.sheet-actions',
      h('button.small', { title: 'Everything the company carries (I)', onclick: () => this.openParty() }, '🎒 The Pack'),
      idx > 0 && !inBattle ? h('button.small', {
        title: 'Lead the company: the leader walks in front and speaks for everyone',
        onclick: () => { s.party.members.splice(idx, 1); s.party.members.unshift(m); changed(); },
      }, '♛ Make leader') : null,
      idx > 1 && !inBattle ? h('button.small', {
        onclick: () => { s.party.members.splice(idx, 1); s.party.members.splice(idx - 1, 0, m); changed(); },
      }, '▲ Move up') : null,
      idx === 0 ? h('span.hint', '♛ Leads the company') : null,
      !inBattle ? (() => {
        const lodge = s.lodging();
        const why = !lodge ? 'Find a town with an inn first: those who leave the company wait at an inn'
          : !s.party.members.some((x) => x !== m && x.status !== 'dead') ? 'Someone must carry on the quest' : '';
        return h('button.small' + (why ? '.disabled' : ''), {
          title: why || `${m.name} takes a room at the inn in ${lodge.name} and waits there. Talk to them at the inn to call them back.`,
          onclick: () => { if (why) { sfx('error'); return; } this.closeHero(); const err = s.restMember(m); if (err) { s.log(err, 'warn'); sfx('error'); } },
        }, '🛏 Rest at the inn');
      })() : null,
    ));
    return el;
  }

  // The minimap: a window of the land round the company (a whole town when it
  // fits), filling its frame, with the company, quest goals (an arrow at the
  // rim when a goal lies beyond the window) and places marked.
  drawMinimap() {
    const s = this.s, map = s.map;
    if (!map || (s.battle && !s.battle.field)) return; // (a battle on the dungeon floor keeps the map)
    const c = this.minimap;
    const box = c.parentElement;
    const css = Math.max(64, Math.min(box?.clientWidth || 160, box?.clientHeight || 160));
    const u = Math.min(2, window.devicePixelRatio || 1); // canvas pixels per css pixel
    const size = Math.round(css * u);
    if (c.width !== size || c.height !== size) { c.width = size; c.height = size; }
    const ctx = c.getContext('2d');
    const p = s.state.pos;
    const span = Math.min(Math.max(map.w, map.h), map.type === 'world' ? 32 : 40);
    const k = size / span;
    const fit = (pos, len) => (len <= span ? (len - span) / 2 : Math.max(0, Math.min(len - span, pos + 0.5 - span / 2)));
    const ox = fit(p.x, map.w), oy = fit(p.y, map.h);
    const sx = (x) => (x - ox) * k, sy = (y) => (y - oy) * k;
    const vis = s.visible, explored = map.explored;
    // outdoors, unexplored land is blank parchment; underground, black
    const vellum = !!vis && s.vellumMap();
    if (vellum) fillVellum(ctx, 0, 0, size, size, k);
    else { ctx.fillStyle = '#17110a'; ctx.fillRect(0, 0, size, size); }
    const x0 = Math.max(0, Math.floor(ox)), y0 = Math.max(0, Math.floor(oy));
    const x1 = Math.min(map.w, Math.ceil(ox + span)), y1 = Math.min(map.h, Math.ceil(oy + span));
    const sites = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * map.w + x;
      if (vis && !explored[i]) continue;
      const t = terrain(map.tiles[i]);
      const col = t.top;
      let f = vis && !vis[i] ? 0.62 : 1;
      if (t.wall || t.key === 'mountains' || t.key === 'peaks') f *= 0.72;
      ctx.fillStyle = `rgb(${((col >> 16) & 255) * f | 0},${((col >> 8) & 255) * f | 0},${(col & 255) * f | 0})`;
      ctx.fillRect(Math.floor(sx(x)), Math.floor(sy(y)), Math.ceil(k) + 1, Math.ceil(k) + 1);
      if (t.feature || t.key === 'stairs_down' || t.key === 'stairs_up') sites.push([x, y]);
    }
    if (vellum) inkEdges(ctx, map, explored, x0, y0, x1, y1, sx, sy, k);
    // towns, sites and stairs: pale squares with an ink edge
    const r0 = Math.max(u * 2.6, k * 0.42);
    ctx.lineWidth = Math.max(1, k / 6);
    for (const [x, y] of sites) {
      ctx.fillStyle = '#fff4d8'; ctx.strokeStyle = '#2a1a08';
      ctx.fillRect(sx(x + 0.5) - r0, sy(y + 0.5) - r0, r0 * 2, r0 * 2);
      ctx.strokeRect(sx(x + 0.5) - r0, sy(y + 0.5) - r0, r0 * 2, r0 * 2);
    }
    // points of interest seen so far
    for (const e of map.entities) {
      if (e.type !== 'event' || (vis && !explored[e.y * map.w + e.x])) continue;
      if (terrain(getTile(map, e.x, e.y)).feature) continue; // (a shipyard on its harbour: the site square says enough)
      if (e.x < ox - 1 || e.y < oy - 1 || e.x > ox + span || e.y > oy + span) continue;
      ctx.fillStyle = EVENT_DOTS[eventDot(e)][0];
      ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(sx(e.x + 0.5), sy(e.y + 0.5), Math.max(u * 2.6, k * 0.36), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // read treasure maps: the rough circle
    drawTreasureCircles(ctx, treasureCircles(s, map), sx, sy, k, u);
    // quest goals: a diamond, or an arrow at the rim pointing the way
    const pins = questPins(s).sort((a, b) => a.tracked - b.tracked);
    for (const pin of pins) {
      const px = sx(pin.x + 0.5), py = sy(pin.y + 0.5);
      const m = u * 8;
      ctx.fillStyle = pin.tracked ? '#ffd440' : '#d8a0ff'; ctx.strokeStyle = '#1a0e02'; ctx.lineWidth = u * 1.5;
      if (px >= m && py >= m && px <= size - m && py <= size - m) {
        const r = u * (pin.tracked ? 5 : 3.8);
        ctx.beginPath(); ctx.moveTo(px, py - r * 1.4); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r * 1.4); ctx.lineTo(px - r, py); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        const cx = size / 2, cy = size / 2, dx = px - cx, dy = py - cy;
        const t = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
        const r = u * (pin.tracked ? 7.5 : 6);
        ctx.save(); ctx.translate(cx + dx * t, cy + dy * t); ctx.rotate(Math.atan2(dy, dx));
        ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.75); ctx.lineTo(-r * 0.35, 0); ctx.lineTo(-r * 0.7, -r * 0.75); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    // (delve) every hero on a square of their own: a small gold disc each
    if (s.dv) {
      for (const m of s.dv.alive()) {
        const q = s.dv.pos(m);
        if (q.x === p.x && q.y === p.y) continue;
        ctx.fillStyle = '#e8b830'; ctx.strokeStyle = '#1a0e02'; ctx.lineWidth = u * 1.3;
        ctx.beginPath(); ctx.arc(sx(q.x + 0.5), sy(q.y + 0.5), u * 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // the company: a gold disc with a dark rim and a white heart
    const cx = sx(p.x + 0.5), cy = sy(p.y + 0.5), pr = u * 5.5;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.arc(cx, cy + pr * 0.25, pr * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe24a'; ctx.strokeStyle = '#1a0e02'; ctx.lineWidth = u * 1.8;
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy, pr * 0.38, 0, Math.PI * 2); ctx.fill();
    // north
    const nf = Math.round(u * 11);
    ctx.font = `bold ${nf}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = u * 2.5; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#f0d890';
    ctx.strokeText('N', size / 2, size * 0.03); ctx.fillText('N', size / 2, size * 0.03);
    if (this.mmLegend) this.mmLegend.querySelector('.mm-goal').hidden = !pins.length;
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
        cmd('pack', 'Pack', 'I', () => this.openParty(), 'The pack: everything the company carries'),
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
    // a mouse wheel or a pinch zooms; two fingers on a trackpad look around a
    // little way from the company (it comes back into view as they move on)
    this.wheel = attachWheel(this.view, cv, { pan: () => this.s.mode === 'explore' && !this.s.transitioning, onPan: () => this.keepLookNear() });
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

  // Looking around never strays far from the company: no further than the
  // zoom lets them see (the view's reach)
  keepLookNear() {
    const p = this.s.state?.pos, r = this.view.rig;
    if (!p) return;
    const R = Math.max(4, this.view.reach || 8);
    r.tx = Math.max(p.x + 0.5 - R, Math.min(p.x + 0.5 + R, r.tx));
    r.tz = Math.max(p.y + 0.5 - R, Math.min(p.y + 0.5 + R, r.tz));
  }

  unbindInput() {
    window.removeEventListener('keydown', this.onKey);
    const cv = this.view.renderer.domElement;
    cv.removeEventListener('mousemove', this.onMove);
    cv.removeEventListener('mouseleave', this.onLeave);
    cv.removeEventListener('click', this.onClick);
    cv.removeEventListener('contextmenu', this.onCtx);
    if (this.wheel) { this.wheel.destroy(); this.wheel = null; }
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
    // Space, Enter and (in battle) Tab are game keys: they must not also press
    // whichever HUD button was clicked or tabbed to last (Space would reopen Help)
    const ae = document.activeElement;
    if ((e.key === ' ' || e.key === 'Enter' || (e.key === 'Tab' && this.s.mode === 'combat')) && !anyModal()) {
      if (ae && ae !== document.body && !ae.closest?.('.modal-back')) ae.blur?.();
      if (e.key === 'Tab' || ae?.tagName === 'BUTTON') e.preventDefault();
    }
    if (e.key === 'Escape') {
      if (closeTopModal()) return;
      if (this.endPick(null)) return;
      if (this.closeHero()) return;
      if (this.pendingDir || this.targeting) { this.cancelTargeting(); return; }
      if (this.autoPath) { this.explore.stop(); return; }
      if (this.s.mode === 'explore') this.openMenu();
      return;
    }
    if (anyModal()) return;
    // choosing a hero on the Company panel: their number picks; anything else lets it be
    if (this.picking) {
      const n = parseInt(e.key, 10);
      const m = n >= 1 ? this.s.party.members[n - 1] : null;
      if (m) { e.preventDefault(); this.pickCard(m); return; }
      this.endPick(null);
    }
    const dir = MOVE_KEYS[e.key] || MOVE_KEYS[e.code];
    if (this.s.mode === 'combat') return this.combatKey(e, dir);
    if (this.s.mode !== 'explore') return;
    // (delve) Tab: the next hero walks alone; G: all together again
    if (this.s.dv && !this.pendingDir && (e.key === 'Tab' || e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      this.explore.stop();
      if (e.key === 'Tab') this.s.dv.cycle(e.shiftKey ? -1 : 1); else this.s.dv.select(null);
      return;
    }
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
      x: () => this.quickExit(),
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
      const t = this.battleTile(e.clientX, e.clientY);
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
    if (b) { const t = this.battleTile(e.clientX, e.clientY); if (t) this.combatClick(t); return; }
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

  // The square a battle click or hover means. A foe is picked by its body,
  // not only by the ground at its feet: a tall monster's head, or one half
  // hidden behind the top of a cave wall, can be clicked. Where figures
  // overlap, the one nearer the camera is in front and takes the click (a
  // great beast hides whoever stands behind it). An ally's figure counts only
  // while choosing whom to heal or bless, so the ground behind a friend can
  // still be walked to.
  battleTile(cx, cy) {
    const b = this.s.battle, v = this.view;
    const want = new Set((this.targeting?.units || []).map((u) => u.id));
    const id = v.pickEntity(cx, cy, (en) => {
      const u = b.units.find((x) => x.id === en.id);
      return !!u && ((b.alive(u) && u.side === 'enemy') || want.has(u.id));
    });
    const u = id && b.units.find((x) => x.id === id);
    if (u) return { x: u.x, y: u.y };
    return v.pick(cx, cy);
  }
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
    if (tg.ally) this.refreshParty();
    const cells = tg.tiles || tg.units.map((u) => ({ x: u.x, y: u.y }));
    this.view.setHighlights(cells, tg.color || 0xffc030, 0.4);
    tg.index = 0;
    const foe = tg.tiles ? tg.tiles.find((c) => this.s.battle?.unitAt(c.x, c.y)?.side === 'enemy') : null;
    tg.cursor = foe ? { ...foe } : cells[0] ? { ...cells[0] } : null;
    if (tg.cursor) this.view.showCursor(tg.cursor.x, tg.cursor.y, 0xffe040);
    this.hint(tg.ally ? `${tg.label}: click a hero, on the field or on the right (Tab cycles, Enter confirms, Esc cancels).`
      : `${tg.label}: click a target (Tab cycles, Enter confirms, Esc cancels).`);
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

  // (the unit is passed along too: a fallen hero's body is no unit standing there)
  pickTarget(t) {
    const tg = this.targeting;
    this.cancelTargeting();
    tg.onPick(t, tg.units?.find((u) => u.x === t.x && u.y === t.y) || null);
  }

  cancelTargeting() {
    const was = this.targeting;
    this.targeting = null;
    this.pendingDir = null;
    this.hint('');
    if (was?.ally) this.refreshParty();
    if (was && this.s.battle?.active) this.combatTurn(this.s.battle.active);
  }

  // ------------------------------------------------------------ choosing a hero
  // One way to say who something is for (who drinks the draught, who casts,
  // on whom the spell goes): the Company panel on the right lights up the
  // heroes it can go to and says why not of the rest; a click on a card (or
  // its number) chooses, Esc or a click elsewhere lets it be. In battle the
  // heroes are clicked on the field instead, or their cards (pickAlly).
  // why(m): a reason it cannot go to m, or null. Resolves to a hero or null.
  pickHero(title, why = () => null) {
    this.endPick(null);
    this.closeHero();
    return new Promise((resolve) => {
      this.picking = { title, why, resolve };
      this.hint(`${title} Click a hero on the right, or press their number (Esc cancels).`);
      this.refreshParty();
      this.pickOutside = (e) => {
        if (this.partyEl.contains(e.target) || this.pickBar?.contains(e.target)) return;
        this.endPick(null);
      };
      document.addEventListener('pointerdown', this.pickOutside, true);
    });
  }

  endPick(m) {
    const p = this.picking;
    if (!p) return false;
    this.picking = null;
    document.removeEventListener('pointerdown', this.pickOutside, true);
    this.hint('');
    this.refreshParty();
    p.resolve(m);
    return true;
  }

  // In battle: the heroes a spell, a draught or a skill can go to are clicked
  // where they stand (or lie), or on their cards; act(unit) does the deed
  pickAlly(label, units, why, color, act) {
    this.startTargeting({ units, ally: true, why, label, color: color ?? 0x70e070, onPick: (t, u) => u && act(u) });
  }

  // What a hero's card shows while one is being chosen: { ok, why, title } or null
  pickState(m) {
    const p = this.picking;
    if (p) { const why = p.why(m); return { ok: !why, why, title: p.title }; }
    const tg = this.targeting;
    if (!tg?.ally) return null;
    const ok = tg.units.some((u) => u.member === m);
    return { ok, why: ok ? null : tg.why?.(m) || 'out of reach', title: tg.label };
  }

  pickCard(m) {
    const st = this.pickState(m);
    if (!st) return;
    if (!st.ok) { this.s.log(`${m.name}: ${st.why}.`, 'warn'); sfx('error'); return; }
    sfx('click');
    if (this.picking) { this.endPick(m); return; }
    const u = this.targeting.units.find((x) => x.member === m);
    this.pickTarget({ x: u.x, y: u.y });
  }

  // the question over the Company panel while a hero is being chosen
  refreshPickBar() {
    const p = this.picking || (this.targeting?.ally ? { title: `${this.targeting.label}: on whom?` } : null);
    if (!p) { this.pickBar?.remove(); this.pickBar = null; this.partyEl.parentElement?.classList.remove('picking'); return; }
    const bar = h('div.pick-bar', h('span.pk-title', p.title), h('button.pk-x', {
      title: 'Never mind (Esc)', onclick: () => (this.picking ? this.endPick(null) : this.cancelTargeting()),
    }, '✕'));
    if (this.pickBar) this.pickBar.replaceWith(bar); else this.partyEl.before(bar);
    this.pickBar = bar;
    this.partyEl.parentElement?.classList.add('picking');
  }

  // ------------------------------------------------------------ generic choosers
  chooseFrom(title, options, intro = null) {
    return new Promise((resolve) => {
      let done = false;
      const list = h('div.choose-list');
      const m = modal(intro ? h('div', intro, list) : list, { title, cls: 'small choose-modal', onClose: () => { if (!done) resolve(null); } });
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

  // the school's own window: spellbook, prayer beads, staves, tablets, satchel
  chooseSpell(member, spells) { return castWindow(this, member, spells); }

  // need(m) may return a reason this hero gains nothing from it ("already at full health")
  chooseMember(title, filter = () => true, need = null) {
    const g = this.s.game;
    const ms = this.s.party.members.filter(filter);
    return this.chooseFrom(title, ms.map((m) => {
      const why = need ? need(m) : null;
      return {
        label: m.name, tag: `${m.hp}/${maxHp(g, m)} HP`, pic: portrait(this.view, charLook(g, m)), value: m, disabled: !!why, why,
        sub: `${raceOf(g, m).name} ${classOf(g, m).name}${m.status !== 'ok' ? ' · ' + statusLabel(m) : ''}${why ? ' — ' + why : ''}`,
      };
    }));
  }

  async fieldCast() {
    if (this.s.mode !== 'explore' || this.s.busy) return;
    const casters = this.s.party.members.filter((m) => m.status !== 'dead' && this.s.spellsFor(m, 'field').length);
    if (!casters.length) { this.s.log('No one in your party can cast spells here.', 'warn'); return; }
    const caster = casters.length === 1 ? casters[0] : await this.pickHero('Who casts?', (m) => (casters.includes(m) ? null : m.status === 'dead' ? 'fallen' : 'no spell to cast here'));
    if (!caster) return;
    const spell = await this.chooseSpell(caster, this.s.spellsFor(caster, 'field'));
    if (!spell) return;
    let target = null;
    if (spell.target === 'ally') {
      target = await this.pickHero(`${spell.name}: on whom?`, (m) => noNeed(this.s.game, spell.effect, m));
      if (!target) return;
    }
    await this.s.castField(caster, spell, target);
  }

  async fieldUse() {
    if (this.s.mode !== 'explore' || this.s.busy) return;
    const inv = this.s.party.inventory;
    const items = this.s.game.items.filter((it) => (it.type === 'consumable' || it.type === 'map') && inv[it.id] > 0);
    if (!items.length) { this.s.log('You have nothing to use.', 'warn'); return; }
    const item = await this.chooseFrom('Use which item?', this.itemOptions(items));
    if (!item) return;
    await this.fieldUseItem(item);
  }

  // the pack's usable things as a list to choose from (the same in battle)
  itemOptions(items) {
    const inv = this.s.party.inventory;
    return items.map((it) => ({ label: it.name, tag: `×${inv[it.id]}`, sub: itemUse(this.s.game, it) || it.desc, icon: itemIcon(it)[0], tone: itemIcon(it)[1], value: it }));
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
          const out = await s.engage({ id: '__fight_' + npc.id, monster: res.fight, count: '1', roaming: true, alsoRemove: npc.id });
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
    const greet = this.quests.greetingFor(npc);
    if (greet) sayLine(greet);
    this.quests.dialogHook(npc, { add, sayLine });
    refreshChips();
    setTimeout(() => input.focus(), 30);
  }

  // ------------------------------------------------------------ shops
  priceOf(item, npc, selling = false) {
    const mod = npc.shop?.priceMod || 1;
    const base = item.price || 0;
    // (a charm of haggling: the merchant asks less and pays more)
    return selling ? Math.max(1, Math.floor(charmPrice(this.s, base * 0.5, true))) : Math.max(1, Math.round(charmPrice(this.s, base * mod)));
  }

  openShop(npc) {
    const s = this.s, g = s.game;
    // (a treasure map is sold only while the company has none and its hoard is undug)
    const stock = (npc.shop?.stock || []).map((id) => itemOf(g, id)).filter((it) => it && !(it.type === 'map' && ((s.party.inventory[it.id] || 0) > 0 || isDug(s, it.treasure))));
    const body = h('div.shop');
    const coin = () => h('i.coin', { html: iconSvg('coin') });
    const face = portrait(this.view, s.entityLook(npc));
    let tab = 'buy';
    // who could use a piece of gear, and is it better than what they carry?
    const verdicts = (it) => {
      if (!slotFor(it)) return null;
      const who = s.party.members.filter((m) => m.status !== 'dead');
      const can = who.filter((m) => canEquip(g, m, it).ok);
      if (!can.length) return h('div.sr-cmp', h('span.cmp.none', noOneText(g, it)));
      // (hover a hero: the piece beside what they wear now, gains and losses
      // marked; a charm's chip is just the name: ▲ a free slot, ⇄ a swap)
      return h('div.sr-cmp', ...can.map((m) => {
        const c = compareText(g, m, it);
        return h('span.cmp.' + c.cls, { tip: () => swapCard(g, m, it) }, cmpArrow(c), it.type === 'charm' ? m.name : `${m.name} ${c.text}`);
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
          const magic = magicNote(g, s.party.members, it);
          list.appendChild(h('div.shop-row' + (afford ? '' : '.dear') + (magic?.cls === 'no' ? '.useless' : '') + (it.type === 'charm' ? '.charm-row' : ''),
            { title: hasMagic(it) || it.type === 'charm' ? itemTip(g, it) : null },
            itemTile(it),
            h('div.sr-main',
              h('div.sr-name', itemName(it), owned ? h('span.owned', { title: 'How many your company already carries' }, `×${owned} owned`) : null),
              h('span.sr-stats', itemStats(it)),
              it.desc ? h('div.sr-desc', it.desc) : null,
              shownUse(g, it, magic) ? h('span.sr-use', shownUse(g, it, magic)) : null,
              magic ? h('div.sr-cmp', h('span.cmp.use.' + magic.cls, magic.text)) : null,
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
                  if (slotFor(it)) s.tip('wear', 'New gear goes into the Pack, not onto anyone: open the Pack (I) and click a hero\'s name beside the item to put it on.');
                  render(); this.refresh();
                },
              }, 'Buy'))));
        }
      } else {
        const inv = s.party.inventory;
        const owned = g.items.filter((it) => inv[it.id] > 0 && it.type !== 'quest');
        if (!owned.length) list.appendChild(h('p', 'You have nothing to sell.'));
        // one click for the clutter: gear no one would gain from, and reagents,
        // herbs and scrolls no one in the company can use (never potions, food,
        // keys, maps or named treasures)
        const junk = owned.filter((it) => !it.unique && uselessToCompany(g, s.party.members, it));
        if (junk.length) {
          const total = junk.reduce((t, it) => t + this.priceOf(it, npc, true) * inv[it.id], 0);
          const count = junk.reduce((t, it) => t + inv[it.id], 0);
          list.appendChild(h('div.sell-junk',
            h('div', h('b', `${count} thing${count === 1 ? '' : 's'} no one in your company would gain from`),
              h('div.sj-names', junk.map((it) => (inv[it.id] > 1 ? `${it.name} ×${inv[it.id]}` : it.name)).join(', '))),
            h('button.primary', {
              title: 'Sell them all at once',
              onclick: () => {
                for (const it of junk) { s.party.gold += this.priceOf(it, npc, true) * inv[it.id]; inv[it.id] = 0; }
                sfx('gold');
                s.log(`Sold ${count} unneeded thing${count === 1 ? '' : 's'} for ${total} gold.`, 'loot');
                render(); this.refresh();
              },
            }, coin(), ` Sell all for ${total}`)));
        }
        for (const it of owned) {
          const price = this.priceOf(it, npc, true);
          const magic = magicNote(g, s.party.members, it);
          list.appendChild(h('div.shop-row' + (magic?.cls === 'no' ? '.useless' : '') + (it.type === 'charm' ? '.charm-row' : ''),
            { title: hasMagic(it) || it.type === 'charm' ? itemTip(g, it, true) : null },
            itemTile(it),
            h('div.sr-main', h('div.sr-name', itemName(it), h('span.owned', `×${inv[it.id]}`)), h('span.sr-stats', itemStats(it)),
              magic ? h('div.sr-cmp', h('span.cmp.use.' + magic.cls, magic.text)) : null),
            h('div.sr-side', h('span.price', coin(), String(price)), h('button', {
              onclick: () => { inv[it.id]--; s.party.gold += price; sfx('gold'); render(); this.refresh(); },
            }, 'Sell'))));
        }
        list.appendChild(h('p.hint', 'Only what is in the pack can be sold: take gear off on the hero\'s sheet (click their portrait) first. Merchants pay half the price.'));
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
            // the morning light (and sight) changes while the screen is dark
            this.app.fade(true, 300).then(() => {
              if (this.app.session === s) { s.applyDaylight(); s.checkPhase(); s.updateVisibility(true); }
              return this.app.fade(false, 500);
            });
            s.log(`You sleep soundly and wake fully rested, ${clockText(s.state.turn || 0).replace('about ', 'at about ')}.`, 'good');
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
        if (m.status === 'dead') services.push(['Raise', 50 + m.level * 25, () => { m.status = 'ok'; m.hp = mh; gainXp(g, m, 0) /* levels earned while fallen */; s.refreshPartyVisual(); }]);
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
  // The pack: everything the company carries. Gear is put on in one place:
  // each hero's sheet (the pop-over by their portrait). Here every piece says
  // who it suits (▲ better / ▼ worse than what they wear) and links there.
  openParty() {
    return modal(this.packBody(), { title: 'The Pack', icon: 'pack', cls: 'wide party-modal' });
  }

  // After a change in the open pack (a piece put on, a scroll copied): build
  // it afresh in place, the list scrolled just where it was
  refreshPack() {
    const old = document.querySelector('.party-modal .party-screen');
    if (!old) return this.openParty();
    const outer = old.closest('.modal-body');
    const keep = [old.querySelector('.inv')?.scrollTop || 0, outer?.scrollTop || 0];
    const fresh = this.packBody();
    old.replaceWith(fresh);
    const list = fresh.querySelector('.inv');
    if (list) list.scrollTop = keep[0];
    if (outer) outer.scrollTop = keep[1];
  }

  packBody() {
    const s = this.s, g = s.game;
    const body = h('div.party-screen');
    const inv = s.party.inventory;
    const invList = h('div.inv');
    const items = g.items.filter((it) => inv[it.id] > 0);
    if (!items.length) invList.appendChild(h('p.hint', 'The pack is empty.'));
    // grouped, so gear, supplies and spell reagents are easy to find
    const groups = [
      ['Charms', (it) => it.type === 'charm'],
      ['Arms & armour', (it) => !!slotFor(it)],
      ['Potions & supplies', (it) => it.type === 'consumable'],
      ['Reagents & herbs', (it) => it.type === 'reagent'],
      ['Spell scrolls', (it) => it.type === 'scroll'],
      ['Keys & treasures', () => true],
    ];
    const placed = new Set();
    const heroes = s.party.members.filter((x) => x.status !== 'dead');
    for (const [label, test] of groups) {
      const list = items.filter((it) => !placed.has(it) && test(it));
      if (!list.length) continue;
      invList.appendChild(h('div.inv-group', label));
      for (const it of list) {
        placed.add(it);
        const slot = slotFor(it);
        const magic = magicNote(g, s.party.members, it);
        const use = shownUse(g, it, magic);
        // who could wear it, and would it be better than what they have?
        const who = slot ? heroes.filter((x) => canEquip(g, x, it).ok) : [];
        const chips = !slot ? [] : who.length ? who.map((x) => {
          const c = compareText(g, x, it);
          return h('button.cmp.' + c.cls, {
            tip: () => swapCard(g, x, it, `Click to put it on ${x.name}.`),
            onclick: () => this.equipFromPack(x, it, { stay: true }),
          }, cmpArrow(c), `${x.name} ${c.text}`);
        }) : [h('span.cmp.none', noOneText(g, it))];
        // reagents and herbs say plainly who burns them; scrolls offer to be
        // copied into each spellbook-keeper's book
        if (it.type === 'scroll' && !s.battle) {
          for (const x of heroes.filter((x) => hasBook(g, x, byId(g.spells, it.spell)?.system))) {
            const can = canCopy(g, x, it);
            if (can.known) continue;
            chips.push(h('button.cmp.copy' + (can.ok ? '.up' : '.disabled'), {
              title: can.ok ? `${x.name} copies ${can.spell.name} into the spellbook, and knows it for good. The scroll is used up.` : can.why,
              onclick: () => {
                const res = copyScroll(g, x, it, inv);
                if (!res.ok) { s.log(res.why, 'warn'); sfx('error'); return; }
                sfx('level');
                s.log(`${x.name} copies ${res.spell.name} into the spellbook.`, 'magic');
                this.refresh(); this.refreshPack();
              },
            }, h('i', { html: iconSvg('quill') }), can.ok ? `Copy into ${x.name}'s spellbook` : can.why.replace(/\.$/, '')));
          }
        }
        const row = h('div.inv-row' + (magic?.cls === 'no' ? '.useless' : '') + (it.type === 'charm' ? '.charm-row' : ''), { title: hasMagic(it) || it.type === 'charm' ? itemTip(g, it, true) : it.desc || null },
          itemTile(it),
          h('span.inv-name', itemName(it), inv[it.id] > 1 ? h('span.inv-n', `×${inv[it.id]}`) : null,
            h('span.inv-stats', itemStats(it)),
            use ? h('span.inv-use', use) : null,
            // a scroll's copy buttons already say who can copy it
            magic && !(it.type === 'scroll' && chips.length) ? h('span.cmp.use.' + magic.cls, magic.text) : null,
            ...chips));
        if (it.type === 'consumable' && !s.battle) {
          row.appendChild(h('button', { title: it.desc || 'Use it now', onclick: async () => { closeTopModal(); await this.fieldUseItem(it); } }, 'Use'));
        }
        if (it.type === 'map') row.appendChild(h('button', { title: 'Study the map and its clue', onclick: () => { closeTopModal(); this.readMap(it); } }, 'Read'));
        invList.appendChild(row);
      }
    }
    body.appendChild(h('div.inv-wrap',
      h('div.pack-head', h('span', h('i', { html: iconSvg('pack') }), ' Carried by the company'),
        h('span.pack-purse', h('span', { title: 'Gold' }, h('i.coin', { html: iconSvg('coin') }), String(s.party.gold)),
          g.settings.food ? h('span', { title: 'Food' }, h('i', { html: iconSvg('food') }), String(s.party.food)) : null)),
      h('p.hint.pack-hint', 'Everything here is shared. Click a name on a piece to put it on that hero; hover the name to see it beside what they wear now.'),
      invList));
    return body;
  }

  // From the pack: put the piece on that hero, then show their sheet so the
  // change (and the way to undo it) is right there
  // stay: from the pack's own list, put it on and keep the pack open where
  // it was (the hero's sheet is a click on their portrait away)
  equipFromPack(m, it, { stay = false } = {}) {
    const s = this.s, g = s.game;
    const res = equipItem(g, m, it, s.party.inventory);
    if (!res.ok) { s.log(res.why, 'warn'); sfx('error'); } else { sfx('click'); s.log(`${m.name} now wears the ${it.name}.`); s.refreshPartyVisual(); }
    if (stay) {
      this.refresh();
      this.refreshPack();
      return;
    }
    this.popHero = null;
    this.selectHero(m);
    this.refresh();
  }

  async fieldUseItem(it) {
    if (it.type === 'map') { this.readMap(it); return; }
    let target = null;
    if (['heal', 'cure', 'mp', 'revive'].includes(it.effect)) {
      const g = this.s.game;
      const why = (m) => noNeed(g, it.effect, m, it);
      if (this.s.party.members.every(why)) { this.s.log(it.effect === 'revive' ? 'No one has fallen.' : `No one needs the ${it.name} right now (${why(this.s.party.members.find((m) => m.status !== 'dead') || this.s.party.members[0])}).`, 'warn'); sfx('error'); return; }
      target = await this.pickHero(`${it.name}: for whom?`, why);
      if (!target) return;
    }
    this.s.useItemField(it, target);
  }

  // a treasure map: its sketch and clue (ui/treasureMap.js)
  readMap(it) { return showTreasureMap(this, it); }

  // ------------------------------------------------------------ map
  openMap() {
    const s = this.s;
    const map = s.map;
    if (!map || s.battle) return;
    // frame what has been explored (a little margin round it), not a sea of black
    let bx0 = map.w, by0 = map.h, bx1 = -1, by1 = -1;
    for (let i = 0; i < map.w * map.h; i++) {
      if (s.visible && !map.explored[i]) continue;
      const x = i % map.w, y = (i / map.w) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (bx1 < 0) { bx0 = 0; by0 = 0; bx1 = map.w - 1; by1 = map.h - 1; }
    const side = Math.min(Math.max(map.w, map.h), Math.max(40, Math.max(bx1 - bx0, by1 - by0) + 9));
    const fit = (a, b, len) => Math.max(0, Math.min(len - side, Math.round((a + b + 1) / 2 - side / 2)));
    const ox = map.w <= side ? 0 : fit(bx0, bx1, map.w), oy = map.h <= side ? 0 : fit(by0, by1, map.h);
    const vw = Math.min(map.w, side), vh = Math.min(map.h, side);
    const scale = Math.max(2, Math.min(10, Math.floor(560 / Math.max(vw, vh))));
    const c = h('canvas.bigmap', { width: vw * scale, height: vh * scale });
    const ctx = c.getContext('2d');
    const vellum = !!s.visible && s.vellumMap();
    if (vellum) fillVellum(ctx, 0, 0, c.width, c.height, scale);
    else { ctx.fillStyle = '#17110a'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.translate(-ox * scale, -oy * scale);
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
    if (vellum) inkEdges(ctx, map, map.explored, 0, 0, map.w, map.h, (x) => x * scale, (y) => y * scale, scale);
    for (const e of map.entities) {
      if (e.type !== 'portal') continue;
      if (s.visible && !map.explored[e.y * map.w + e.x]) continue;
      // towns and sites are named under their square, small, so the names
      // keep clear of the company's dot and the goal's tag
      const name = e.label || (map.type === 'world' && getMap(s.game, e.target?.map)?.name);
      if (!name) continue;
      ctx.font = `600 ${Math.max(10, Math.round(scale * 1.25))}px serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.fillStyle = '#f4e6c0';
      ctx.strokeText(name, e.x * scale + scale / 2, e.y * scale + scale * 3.9);
      ctx.fillText(name, e.x * scale + scale / 2, e.y * scale + scale * 3.9);
      ctx.textAlign = 'start';
    }
    const p = s.state.pos;
    ctx.fillStyle = '#ff0';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(p.x * scale + scale / 2, p.y * scale + scale / 2, Math.max(3, scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const circles = treasureCircles(s, map);
    drawTreasureCircles(ctx, circles, (x) => x * scale, (y) => y * scale, scale);
    const shown = this.quests.drawPins(ctx, scale, { events: true }) || {};
    // what the marks mean (only those on this map)
    const row = (cls, color, label) => h('div.ml-row', h('i.' + cls, { style: { background: color } }), label);
    const legend = h('div.map-legend', h('div.ml-head', 'Key'),
      row('dot', '#ff0', 'Your company'),
      shown.tracked ? row('dia', '#ffe040', 'Your current goal') : null,
      shown.other ? row('dia', '#e0a0ff', 'Goals of other quests') : null,
      row('sq', '#fff', 'Towns, sites and stairs'),
      circles.length ? row('dot.tx', 'rgba(179,36,27,0.35)', 'Buried treasure: somewhere in the circle') : null,
      ...Object.entries(EVENT_DOTS).filter(([k]) => shown.events?.has(k)).map(([, [color, label]]) => row('dot', color, label)),
      s.visible ? h('p.hint', vellum ? 'Blank parchment is land you have not explored yet.' : 'Dark parts are not explored yet.') : null);
    modal(h('div.map-wrap', c, legend), { title: map.name, icon: 'map', cls: 'map-modal' });
  }

  // ------------------------------------------------------------ menus & endings
  // Those resting at inns, under the company: who, and where to find them
  refreshResting() {
    if (!this.restEl) return;
    clear(this.restEl);
    const list = this.s.state.reserve || [];
    if (!list.length) return;
    const g = this.s.game;
    this.restEl.append(h('div.rest-head', '🛏 Resting at inns'), ...list.map((r) => {
      const m = r.member, where = getMap(g, r.map)?.name || 'an inn';
      const pic = portrait(this.view, charLook(g, m));
      return h('div.rest-row', { title: `${m.name} — Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}. Resting at the inn in ${where}: talk to them there to call them back.` },
        pic ? h('img', { src: pic, alt: '' }) : null, h('span.rest-name', m.name), h('span.rest-where', where));
    }));
  }

  // talking to a hero resting at the inn
  openResting(npc) {
    const s = this.s, g = s.game;
    const r = (s.state.reserve || []).find((x) => x.member.id === npc.reserveOf);
    if (!r) return;
    const m = r.member;
    const max = g.settings.maxParty || 6;
    const full = s.party.members.length >= max;
    const pic = portrait(this.view, charLook(g, m));
    const body = h('div.resting-card',
      h('div.rc-head', pic ? h('img', { src: pic, alt: '' }) : null,
        h('div', h('b', m.name), h('span.rc-sub', `Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}`),
          h('p.rc-say', m.status === 'dead' ? 'Laid out in the back room. A healer could raise them.' : full ? '"The company is full — but say the word and I\'ll take someone\'s place."' : '"Rested and ready. Shall we go?"'))));
    const buttons = [];
    if (!full) buttons.push({ label: 'Rejoin the company', primary: true, onClick: () => { const err = s.callBack(npc); if (err) s.log(err, 'warn'); } });
    else buttons.push({ label: 'Swap with someone…', primary: true, onClick: () => {
      setTimeout(async () => {
        const out = await this.chooseMember(`Who rests at the inn in ${m.name}'s place?`, () => true, (x) => (!s.party.members.some((y) => y !== x && y.status !== 'dead') ? 'someone must carry on' : null));
        if (!out) return;
        const err = s.callBack(npc, out);
        if (err) s.log(err, 'warn');
      }, 0);
    } });
    buttons.push({ label: 'Leave them be' });
    modal(body, { title: 'Resting at the inn', icon: 'bed', cls: 'small resting-modal', buttons });
  }

  // someone offered to join when a quest ended: ask once, when nothing else is open
  offerJoin() {
    const s = this.s;
    if (this.joinAsking || anyModal() || s.mode !== 'explore' || s.battle || s.transitioning || !s.state.joinOffers?.length) return;
    const npc = s.nextJoinOffer();
    if (!npc) return;
    const g = s.game, rc = npc.recruit || {};
    const max = g.settings.maxParty || 6;
    const full = s.party.members.length >= max;
    const lodge = s.lodging();
    const k = byId(g.classes, rc.cls), race = byId(g.races, rc.race || npc.look?.race);
    const drop = () => { s.state.joinOffers = (s.state.joinOffers || []).filter((id) => id !== npc.id); };
    this.joinAsking = true;
    const body = h('div.resting-card',
      h('div.rc-head', h('div',
        h('b', npc.name), h('span.rc-sub', `Level ${rc.level || 1} ${race?.name || ''} ${k?.name || ''}`),
        h('p.rc-say', `"${rc.offerText || rc.joinText || 'Take me with thee!'}"`),
        full ? h('p.hint', lodge ? `Thy company is full: ${npc.name} would wait at the inn in ${lodge.name} until you make room.` : 'Thy company is full; find an inn to make room.') : null)));
    modal(body, {
      title: `${npc.name} asks to join you`, icon: 'banner', cls: 'small resting-modal',
      onClose: () => { this.joinAsking = false; },
      buttons: [
        { label: 'Welcome them', primary: true, onClick: () => { const err = s.recruit(npc, { toInn: true }); if (err) { s.log(err, 'warn'); return; } drop(); if (s.party.members.some((x) => x.name === npc.name)) s.log(`${npc.name} joins your company!`, 'good'); } },
        { label: 'Not now', onClick: () => { drop(); s.log(`${npc.name} will still JOIN you if you ask.`); } },
      ],
    });
  }

  showSign(e) {
    modal(h('p.sign-text', e.text || '…'), {
      title: e.name || 'Signpost', icon: 'sign', cls: 'small sign-modal', buttons: [{ label: 'Onward', primary: true }],
    });
  }

  openMenu() {
    const s = this.s;
    // mid-battle there is nothing safe to save (and loading would dodge the fight)
    const fighting = s.mode === 'combat';
    const items = [
      ['play', 'Resume', () => {}],
      !s.opts.noSave && !fighting ? ['save', 'Save game', () => s.save()] : null,
      !s.opts.noSave && !fighting && loadState(s.game.id) ? ['upload', 'Load your last save', async () => {
        const saved = loadState(s.game.id);
        const same = saved && JSON.stringify(saved) === JSON.stringify(s.serializeState());
        if (same || await confirmDialog('Go back to your last save? Whatever happened since then will be lost.')) this.app.continueGame();
      }] : null,
      ['help', 'Help & keys', () => this.openHelp()],
      ['book', 'Journal', () => this.quests?.openJournal()],
      ['sound', isMuted() ? 'Sound effects: off' : 'Sound effects: on', () => { setMuted(!isMuted()); }],
      ['note', musicEnabled() ? 'Music: on' : 'Music: off', () => { setMusicEnabled(!musicEnabled()); }],
      ['camera', 'Camera angle', () => this.openCamera()],
      // leaving saves the game (endPlay), so only a playtest that never saves asks first
      s.opts.fromEditor ? ['anvil', 'Return to the Construction Set', () => this.app.endPlay(true)]
        : fighting && !s.opts.noSave ? ['door', 'Abandon the battle and quit (not saved)', async () => {
          if (await confirmDialog('Quit to the title screen? The game is not saved mid-battle: you will go back to your last save.')) this.app.endPlay(false);
        }]
        : ['door', s.opts.noSave ? 'Quit to title' : 'Save and quit to title', async () => {
          if (!s.opts.noSave || await confirmDialog('Return to the title screen? This quick game is not saved.')) this.app.endPlay(false);
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
    modal(h('div', h('p', 'Camera pitch (degrees above the horizon):'), slider, h('p.hint', 'Pinch or scroll the mouse wheel to zoom — or hold Option (⌥) or Command (⌘) and scroll, as on a Magic Mouse. On a trackpad, slide two fingers to look around.')), { title: 'Camera', icon: 'camera', cls: 'small' });
  }

  // the controls reference (help.js), with the full rules folded in below it
  openHelp() { openHelpOverlay(this, HELP_HTML); }

  showGameOver() {
    const s = this.s;
    const saved = !s.opts.noSave && loadState(s.game.id);
    sfx('defeat');
    const earlier = s.lastStand?.length ? s.party.members.filter((m) => !s.lastStand.includes(m)).map((m) => m.name) : [];
    modal(h('div', h('p.big', 'Your company has perished.'), h('p', 'Yet the tale need not end here...'),
      earlier.length ? h('p.hint', `If you rise again, ${earlier.join(' and ')}, fallen before this fight, will still need a healer.`) : null), {
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

const RARITY_NAMES = Object.fromEntries(Object.entries(RARITIES).map(([k, v]) => [k, v.name]));



// What a piece's magic does, line by line (its effects, then its battle action)
function magicLines(g, it) {
  if (!it || !(hasMagic(it) || it.type === 'charm')) return [];
  const ci = charmInfo(g, it);
  const out = [...(ci?.lines || [])];
  if (ci?.ability) out.push(`${ci.ability.name} (battle action${ci.ability.tags ? ', ' + ci.ability.tags : ''})`);
  return out;
}

// A hover card setting a piece beside what a hero wears in its place (and the
// shield, when it needs both hands): each side's stats and magic, with what
// only the new piece does marked + and what only the old one did marked −
function swapCard(g, m, it, foot) {
  const slot = slotFor(it);
  const cur = itemOf(g, m.equip[slot]);
  const c = compareText(g, m, it);
  const head = h('div.sw-head', h('span.cmp.' + c.cls, cmpArrow(c), `${m.name} ${c.text}`));
  if (cur?.id === it.id) return h('div.swap-card', head, h('div.sw-cols.one', h('div.sw-col', swapPiece(g, it, null))));
  const sh = it.twoHanded && slot === 'weapon' ? itemOf(g, m.equip.shield) : null;
  const got = magicLines(g, it);
  const had = [...magicLines(g, cur), ...magicLines(g, sh)];
  const slotName = (SLOT_NAMES[slot] || slot).toLowerCase();
  return h('div.swap-card', head,
    h('div.sw-cols',
      h('div.sw-col.new', h('div.sw-label', 'Puts on'), swapPiece(g, it, had, 'gain')),
      h('div.sw-col.old', h('div.sw-label', cur || sh ? 'Takes off' : 'In its place'),
        cur ? swapPiece(g, cur, got, 'lose') : h('div.sw-plain', `No ${slotName} now`),
        sh ? swapPiece(g, sh, got, 'lose', 'shield: both hands are needed') : null)),
    foot ? h('div.sw-foot', foot) : null);
}

// one side of a swap card: name, stats and the magic, each line marked by
// whether the other side has it too
function swapPiece(g, it, other, mark, note) {
  const lines = magicLines(g, it);
  const mg = magicalOf(it);
  return h('div.sw-piece',
    h('div.sw-name', { style: mg ? { color: mg.color } : null }, mg ? '✦ ' : '', it.name),
    note ? h('div.sw-note', note) : null,
    itemStats(it) ? h('div.sw-stats', itemStats(it)) : null,
    lines.length ? h('ul.sw-lines', ...lines.map((l) => h('li.' + (!other ? 'same' : other.includes(l) ? 'same' : mark), l)))
      : h('div.sw-plain', 'No magic'));
}

// how an item compares with what a hero already has in that slot
function compareText(g, m, it) {
  const slot = slotFor(it);
  if (!slot) return null;
  const cur = itemOf(g, m.equip[slot]);
  if (cur?.id === it.id) return { cls: 'same', text: 'equipped' };
  // a charm is not better or worse, only different: say what it would replace
  if (it.type === 'charm') return cur ? { cls: 'swap', text: `instead of ${cur.name}` } : { cls: 'up', text: 'new charm' };
  if (it.type === 'weapon') {
    const d = diceAvg(it.dmg || '1d2') + (it.hit || 0) * 0.5 - (cur ? diceAvg(cur.dmg || '1d2') + (cur.hit || 0) * 0.5 : slot === 'weapon' ? 1.5 : 0);
    if (!cur && slot === 'ranged') return { cls: 'up', text: 'new: can shoot' };
    const v = Math.round(d * 10) / 10;
    // a two-handed weapon takes the shield off: say so, with what it costs
    const sh = it.twoHanded && slot === 'weapon' && itemOf(g, m.equip.shield);
    const off = sh ? `, shield off (−${sh.ac || 0} armour)` : '';
    return v > 0.05 ? { cls: sh ? 'same' : 'up', text: `+${v} dmg${off}` } : v < -0.05 ? { cls: 'down', text: `${v} dmg${off}` } : { cls: sh ? 'down' : 'same', text: `same dmg${off}` };
  }
  const v = (it.ac || 0) - (cur?.ac || 0);
  return v > 0 ? { cls: 'up', text: `+${v} armour` } : v < 0 ? { cls: 'down', text: `${v} armour` } : { cls: 'same', text: 'same armour' };
}

// Would anyone in the company gain from this? Gear: only if it would be an
// upgrade for someone who can use it. Reagents, herbs and scrolls: only if
// someone can use them. Everything else (potions, food, keys) always counts.
function uselessToCompany(g, members, it) {
  const who = members.filter((m) => m.status !== 'dead');
  // a charm is never sold off while anyone in the company could wear it
  if (it.type === 'charm') return !who.some((m) => canEquip(g, m, it).ok);
  if (slotFor(it)) {
    return !who.some((m) => {
      if (!canEquip(g, m, it).ok) return false;
      const c = compareText(g, m, it);
      return c && (c.cls === 'up' || c.text.startsWith('+'));
    });
  }
  if (it.type === 'reagent' || it.type === 'scroll') return magicNote(g, members, it)?.cls === 'no';
  return false;
}

// An item's name as lists show it: enchanted gear in its glow colour, with a
// ✦ and what the magic does on hover
function itemName(it) {
  const mg = magicalOf(it);
  if (!mg) return h('b', it.name);
  // (charms and enchanted gear with effects: the row itself carries the whole tooltip)
  const title = mg.charm || hasMagic(it) ? null : `Magical${mg.notes.length ? ': ' + mg.notes.join(', ') : ''}. ${it.desc || ''}`.trim();
  return h('b.magic-name', { style: { '--magic': mg.color }, title },
    h('span.mg-star', '✦ '), it.name);
}

// ▲ better, ▼ worse, = no change, in front of a comparison chip
function cmpArrow(c) {
  return h('b.cmp-arrow', c.cls === 'up' ? '▲' : c.cls === 'down' ? '▼' : c.cls === 'swap' ? '⇄' : c.text === 'equipped' ? '✓' : '=');
}

// when no one in the company can wear a piece: a charm for one people or
// calling says who could ("Only a dwarf can wake its runes")
function noOneText(g, it) {
  return it?.only && charmInfo(g, it)?.only ? charmInfo(g, it).only : 'No one in your company can use this';
}

const CHARM_SLOT_TIP = 'A ring, an amulet, a horn or another trinket of magic. A charm works only while it is worn here: in the pack it sleeps.';

// A piece's whole magic as a tooltip: what it is, what it does, its battle
// action, who may wear it (pack: and that it sleeps there)
export function itemTip(g, it, inPack = false) {
  const info = charmInfo(g, it);
  if (!info) return it?.desc || '';
  const head = it.type === 'charm' ? `${it.name} — ${[info.rarity?.name, info.kind || 'charm'].filter(Boolean).join(' ').toLowerCase()}` : it.name;
  const out = [head];
  if (it.desc) out.push(it.desc);
  for (const l of magicalOf(it)?.notes || []) out.push(`• ${l}`);
  for (const l of info.lines) out.push(`• ${l}`);
  if (info.ability) out.push(`⚔ Battle action: ${info.ability.name}${info.ability.tags ? ` (${info.ability.tags})` : ''}. ${info.ability.desc}`);
  if (info.only) out.push(`✋ ${info.only}.`);
  if (it.type === 'charm') out.push(inPack ? '☾ Asleep in the pack: it works only while worn in a hero\'s charm slot.' : '☾ Works only while worn in a hero\'s charm slot.');
  return out.join('\n');
}

// The hero sheet's charm: what it does while worn (or what the slot is for)
function charmPanel(g, m) {
  const it = itemOf(g, m.equip?.charm);
  if (!it) return h('div.sheet-charm.empty', h('span.sc-ico', { html: iconSvg('ring') }), h('span.hint', 'No charm worn. Rings, amulets, horns and other trinkets of magic work only while worn here.'));
  const info = charmInfo(g, it);
  const rule = wearRule(g, m, it);
  return h('div.sheet-charm', { title: itemTip(g, it), style: { '--magic': magicalOf(it)?.color || '#c8b8ff' } },
    itemTile(it),
    h('div.sc-main',
      h('div.sc-name', itemName(it), h('span.sc-kind', [info.rarity?.name, info.kind].filter(Boolean).join(' '))),
      rule.ok ? null : h('div.sc-warn', `${rule.why} It sleeps.`),
      h('ul.sc-lines', ...info.lines.map((l) => h('li', l)),
        info.ability ? h('li.sc-ab', h('span', { html: iconSvg(info.ability.icon || 'star') }), h('b', info.ability.name), info.ability.tags ? ` — ${info.ability.tags}` : '') : null)));
}

// What a thing is for, in plain words: reagents name the spells that burn
// them, potions say what they do
export function itemUse(g, it) {
  if (!it) return '';
  if (it.type === 'reagent') {
    const spells = (g.spells || []).filter((sp) => (sp.reagents || []).includes(it.id));
    if (!spells.length) return 'A spell reagent (no spell in this realm uses it)';
    const arts = [...new Set(spells.map((sp) => byId(g.magic || [], sp.system)?.name).filter(Boolean))];
    const where = (it.forage || []).length ? ` · found in ${it.forage.map((k) => GROUND_WORDS[k] || k).join(', ')}` : '';
    return `Burned to cast ${spells.map((sp) => sp.name).join(', ')}${arts.length ? ` (${arts.join(', ')})` : ''}${where}`;
  }
  if (it.type === 'scroll') {
    const sp = byId(g.spells || [], it.spell);
    return sp ? `Copy into a spellbook to learn ${sp.name} for good (${byId(g.magic || [], sp.system)?.name || ''}, circle ${sp.level || 1})` : 'A spell scroll';
  }
  if (it.type === 'charm' || hasMagic(it)) {
    const info = charmInfo(g, it);
    const parts = [...info.lines];
    if (info.ability) parts.push(`battle action: ${info.ability.name}`);
    if (it.type === 'charm' && !parts.length) return 'A trinket of magic, worn in the charm slot';
    if (it.type !== 'charm') return parts.length ? `✦ ${parts.join('; ')}` : '';
    return parts.join('; ');
  }
  if (it.type === 'key') return 'Opens a locked door or chest (used up)';
  if (it.type === 'quest') return 'Needed for a quest';
  if (it.type === 'map') return 'Read it to see where the treasure lies';
  if (it.type !== 'consumable') return '';
  switch (it.effect) {
    case 'heal': return `Drink to heal one hero (${it.power || '2d8'} health)`;
    case 'cure': return 'Cures one hero of poison';
    case 'mp': return `Restores one hero's ${poolWords(g, it)} (${it.power || '2d6'})`;
    case 'revive': return 'Brings a fallen hero back to life';
    case 'light': return 'Light it to see in dark halls and caves';
    case 'food': return `Food for the road (+${parseInt(it.power, 10) || 25})`;
    case 'reveal': return 'Read it to reveal the land around you';
    case 'recall': return 'Read it to return to where your journey began';
    default: return '';
  }
}

const GROUND_WORDS = { forest: 'woods', pines: 'pine woods', meadow: 'meadows', hills: 'hills', swamp: 'swamps', grass: 'grassland', snow: 'snow', desert: 'desert', sand: 'sand', ash: 'ash' };

// The use line under an item: once a reagent says who burns it (✓ Used by…),
// only where it grows is worth adding
function shownUse(g, it, magic) {
  if (magic?.cls !== 'yes') return itemUse(g, it);
  return (it.forage || []).length ? `Found in ${it.forage.map((k) => GROUND_WORDS[k] || k).join(', ')}` : '';
}

// For reagents, herbs and scrolls: can anyone in the company use it? (null otherwise)
function magicNote(g, members, it) {
  if (it.type === 'reagent') return reagentUse(g, members, it);
  if (it.type === 'scroll') return scrollUse(g, members, it);
  return null;
}

// Why a hero would gain nothing from a heal / cure / mana (null if they would)
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
    case 'reagent': return (it.forage || []).length ? 'herb' : 'reagent';
    case 'scroll': return 'spell scroll';
    case 'key': return 'key';
    case 'map': return 'treasure map';
    case 'charm': return [(RARITY_NAMES[it.rarity] || ''), (CHARM_KINDS[it.kind] || 'charm')].filter(Boolean).join(' ').toLowerCase();
    default: return it.type;
  }
}

const HELP_HTML = `
<h3>Exploring</h3>
<p><b>Point at anything</b> on the map to see what it is and what a click will do. <b>Click</b> to act: click the ground to walk
there (the dotted line shows the way), a person to walk up and talk, a shop or house to visit whoever keeps it, a monster to attack,
a chest, shrine, door or stairs to go and use it. <b>Right-click</b> (or press and hold on a tablet) to look without moving.
Any key stops a walk. Pinch (or scroll a mouse wheel, or hold Option ⌥ or Command ⌘ and scroll — handy on a Magic Mouse) to zoom; on a trackpad, slide two fingers to look around — the view comes back to the company as it moves.</p>
<p>The <b>Nearby</b> bar over the map lists what you can do where you stand — <b>T</b> talks, <b>E</b> does the first other thing,
<b>1–4</b> the rest. Marks over heads: <b class="hk-q">!</b> has a task for you, <b class="hk-q">?</b> wants to hear about your quest,
<b class="hk-p">?</b> is waiting on one; coins, a bed and a cross mark shops, inns and healers; a banner, someone who might join you.</p>
<table class="keys">
<tr><td>Arrows / WASD</td><td>Walk (bump into people to talk, monsters to fight)</td><td>T</td><td>Talk</td></tr>
<tr><td>E, 1–4</td><td>Nearby actions</td><td>L</td><td>Look</td></tr>
<tr><td>C</td><td>Cast a spell</td><td>U</td><td>Use an item</td></tr>
<tr><td>I</td><td>The pack (what you carry)</td><td>H</td><td>Hole up (camp &amp; rest)</td></tr>
<tr><td>M</td><td>Map</td><td>Space</td><td>Wait a turn</td></tr>
<tr><td>J</td><td>Journal (quests, lore)</td><td>?</td><td>This help</td></tr>
<tr><td>Ctrl/⌘+S</td><td>Save</td><td>Esc</td><td>Stop walking / menu</td></tr>
</table>
<p>Step onto towns, caves and stairs to enter them; walk off the edge of a town to leave.</p>
<h3>Dungeons</h3>
<p>Caves, crypts, towers and fortresses are <b>battlegrounds</b>. Every monster stands there in the flesh, and each hero has a
square of their own. The bar at the top of the map shows who walks: <b>All together</b> (the others fall in behind the leader),
or one hero alone — click a hero (or their portrait), or press <b>Tab</b> for the next; <b>G</b> brings the company together again.
Send a quiet hobbit or burglar ahead to scout; the others wait where they stand. Chests, doors and curiosities work for whoever
reaches them; the stairs take everyone.</p>
<p>Monsters marked <b>Zz</b> have not noticed you. They notice a hero who comes close in their sight — sooner in the light and
when the hero carries the torch (the leader does), later in the dark and for the quiet of foot (hobbits, burglars, rangers).
When one notices, its whole band is roused and the battle is fought right there, everyone where they stand; other bands that
see the fight, or hear it close by, join in. Come upon a band before it sees you, or strike one that is unaware, and it may be
<b>caught unawares</b>: every hero has a free turn before the first round. Win, and you carry on where you stand; step onto the
stairs mid-battle to flee. What you slay stays dead.</p>
<p><b>Treasure maps</b> turn up in chests, on beaten foes, as rewards and (for a price) from shady folk. Read one (<b>U</b>, or
<b>Read</b> in the pack) to see a sketch of the place and its clue; your map (<b>M</b>) then rings the area in red. Find the very
square the clue speaks of and <b>Dig here</b> appears in the Nearby bar. Some hoards are guarded.</p>
<h3>Quests</h3>
<p>Your current goal is always shown at the top left of the map, with an arrow pointing the way. People with a task for you
are marked <b>!</b>; talk to them to take it on. Press <b>J</b> for the Journal: every quest, its steps and its reward.
Shrines, campfires, standing stones and stranger things are scattered across the land — click them to see what they offer.</p>
<h3>Your company</h3>
<p>Click a hero on the right to see their sheet: that is where gear is put on and taken off. Each hero carries a <b>hand weapon</b>
for melee and a <b>ranged weapon</b> (bow, crossbow or sling) — change either, and armour and shield, straight from the sheet.
The <b>Pack</b> (I) holds what the company shares; each piece of gear in it shows who it suits (▲ better, ▼ worse). Every level brings a choice of
<b>talent</b> (★), and every second level one <b>attribute</b> grows by itself (▲): most often the ones the hero's calling needs most.</p>
<h3>Magic</h3>
<p>Each school works its own way. <b>Wizards</b> cast from a spellbook and spend mana; spell scrolls, found or bought from sages,
can be copied into the book from the Pack. <b>Clerics</b> pray and spend faith; <b>minstrels</b> sing and spend voice — mana, faith and
voice all return with rest. <b>Runesmiths</b> carve runes that burn reagents, and <b>rangers</b> brew remedies from herbs they gather
in woods, meadows, hills and swamps as the company travels. The Pack and the shops say whether anyone in your company can use a reagent, herb or scroll.</p>
<h3>Talking</h3>
<p>Type a word to ask about it — <b>NAME</b>, <b>JOB</b> and anything the person mentions. Highlighted words are worth asking about.
Merchants answer to <b>BUY</b>, innkeepers to <b>ROOM</b>, healers to <b>HEAL</b>, and some folk will <b>JOIN</b> your company (some only once you have helped them).
The company holds six; to make room, open a hero's sheet and choose <b>Rest at the inn</b>. They wait at that town's inn
(or the last inn you passed): talk to them there to call them back, or to swap them for someone in the company.</p>
<h3>Battle</h3>
<p>Everyone acts in turn: the strip along the top shows who acts now and who comes next. On a hero's turn, move up to their
squares (click a blue square, or the arrows), then strike, shoot, cast, use a skill or an item. <b>Hover</b> any figure to see its
health, conditions, what it is up to and your <b>chance to hit</b>; hover a square to see the path there.</p>
<p><b>Tactics.</b> <b>Flanking</b>: +2 to hit a foe that a companion also stands beside. <b>From behind</b>: +2 and half as much
damage again when you strike a foe's back (burglars backstab for double). <b>Cover</b>: beside a tree, rock or wall, missiles from
that side are −3 to hit. <b>Engaged</b>: shooting with a foe beside you is −4. <b>Breaking away</b>: stepping out of a foe's reach
gives it a free strike (amber squares warn you).</p>
<p><b>Skills</b> (keys 1–9) recharge after a few turns; free actions do not end the turn. The <b>★ special</b> (Q) works once per
battle. Each calling learns new skills as it rises (levels 3, 5, 7 and 9 for the built-in ones), and on every second level one of
the talents on offer is a <b>battle art</b> any hero can learn: Second Wind, Dash, First Aid, Throw Knife and more. When a great foe winds up a blow, <b>red squares</b> show where it lands on its next turn: step aside, or stun it to break it
off. Every level brings a new <b>talent</b> to choose. Walk off the edge of the field to flee (in a dungeon, step onto the stairs).</p>
<table class="keys">
<tr><td>F</td><td>Attack / shoot</td><td>1–9</td><td>Skills</td></tr>
<tr><td>Q</td><td>★ Special</td><td>G</td><td>Guard (+3 armour)</td></tr>
<tr><td>C</td><td>Cast</td><td>U</td><td>Use item</td></tr>
<tr><td>Space</td><td>End turn</td><td>Tab, Enter</td><td>Next / confirm target</td></tr>
</table>
<h3>Survival</h3>
<p>In the wild each hero eats a ration every 20 turns (towns are free); provisioners sell more. With no food the company
goes hungry and slowly loses health. Swamps may poison you. Rest at inns, or hole up in the wild (if no foes are near) —
a camp without food mends only half as much.
The fallen stay dead until raised by a healer, a Phoenix Feather or a priest's prayer.
Forests and mountains block your sight. Carry torches into dark places. Night falls every few hundred turns:
you see less, and more monsters roam.</p>
<h3>Travel</h3>
<p>The ground sets your pace. A step along a road or bridge takes half a turn; grass and meadow a turn; forest 1½;
pine woods and hills 1¾; swamp and snow 2; sand and desert 2½. Every turn eats food and gives monsters time to move,
so roads are the quick and safe way. Heroes who know their country go a little easier there (elves in the woods,
dwarves in the hills, rangers in the wild) — point at a square to see its cost. Monsters pay too, except on their
native ground. Guards give up once you are far from their post; wandering bands lose interest after a while.</p>
<p>Land you have never seen is blank parchment on the map; land seen before but out of sight lies in shadow.
The first sight of a town, a site, a curiosity or a new kind of country is a discovery worth a little experience.</p>`;

export { escapeHtml };

// what the minimap's marks mean, shown while the pointer is over it
function minimapLegend() {
  const row = (cls, label) => h('div.mm-row', h('i.' + cls), label);
  return h('div.mm-legend', { 'aria-hidden': 'true' },
    row('mm-you', 'Your company'), h('div.mm-goal', row('mm-dia', 'Quest goal (an arrow: that way)')),
    row('mm-site', 'Town, site or stairs'), row('mm-poi', 'Point of interest'), h('div.mm-hint', 'Click or press M for the big map'));
}
