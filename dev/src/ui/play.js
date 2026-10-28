// Play-mode HUD and all of its windows (talk, shop, party, spells, map...).
import { h, clear, modal, toast, anyModal, closeTopModal, closeAllModals, confirmDialog } from './dom.js';
import { byId } from '../data/schema.js';
import { terrain } from '../data/terrain.js';
import { getTile } from '../world/map.js';
import {
  maxHp, maxMp, armorClass, attackBonus, weaponOf, rangedOf, canEquip, itemOf, raceOf, classOf, knownSpells, canCast, xpForLevel,
  statusLabel, mod, slotFor, equipItem, unequip, spendPoint, specialOf, combatMoves, EQUIP_SLOTS, SLOT_NAMES,
} from '../game/rules.js';
import { markKeywords, knownKeywords } from '../game/dialog.js';
import { STAT_NAMES, STATS } from '../data/defaults.js';
import { sfx, isMuted, setMuted } from '../core/sound.js';
import { musicEnabled, setMusicEnabled } from '../core/music.js';
import { loadState } from '../core/storage.js';
import { escapeHtml } from '../core/util.js';
import { attachGestures } from '../render/gestures.js';

const MOVE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
};

const STATUS_ICON = { ok: '', poisoned: '☠', asleep: 'z', dead: '✝' };
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
    this.build();
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
    this.logEl = h('div.hud-log');
    this.hintEl = h('div.hud-prompt');
    this.cmdEl = h('div.hud-cmds');
    this.minimap = h('canvas.hud-minimap', { width: 64, height: 64, title: 'Map (M)', onclick: () => this.openMap() });
    root.append(
      h('div.hud-head',
        h('div.hud-title', this.s.game.meta.title),
        this.statusEl,
        this.hoverEl,
        h('button.hud-menu', { onclick: () => this.openMenu(), title: 'Menu (Esc)' }, '☰ Menu')),
      h('div.hud-frame'),
      h('div.hud-side', h('div.side-head', 'Company'), this.partyEl, this.heroEl),
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
    this.unbindInput();
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
    el.appendChild(h('div.log-line' + (cls ? '.' + cls : ''), text));
    while (el.childNodes.length > 400) el.removeChild(el.firstChild);
    if (follow) el.scrollTop = el.scrollHeight;
  }

  refresh() {
    this.refreshStatus();
    this.refreshParty();
    this.refreshHero();
    this.drawMinimap();
  }

  onMapChanged() { this.drawMinimap(); }

  refreshStatus() {
    const s = this.s, p = s.party;
    const map = s.battle ? null : s.map;
    clear(this.statusEl);
    const tod = !s.battle && s.dayCycleActive && s.dayCycleActive() ? s.timeOfDay() : null;
    this.statusEl.append(...[
      h('span.st-place', s.battle ? '⚔ Battle' : map ? map.name : ''),
      tod ? h('span.st-item', { title: `Day ${tod.day}` }, tod.dark > 0.5 ? '☾ ' : '☀ ', `${tod.name}, day ${tod.day}`) : null,
      h('span.st-item', { title: 'Gold' }, h('b.gold', '◆'), ' ', String(p.gold)),
      this.s.game.settings.food ? h('span.st-item' + (p.food < 20 ? '.low' : ''), { title: 'Food' }, '🍖 ', String(p.food)) : null,
      p.light > 0 ? h('span.st-item', { title: 'Light' }, '🔥 ', String(p.light)) : null,
      s.state.vehicle ? h('span.st-item', '⛵ Aboard ship') : null,
    ].filter(Boolean));
  }

  selectHero(m) {
    this.selected = m;
    sfx('click');
    this.refreshParty();
    this.refreshHero();
    // on narrow screens the sheet is hidden: show it in the Pack instead
    if (!this.heroEl.offsetParent && !anyModal()) this.openParty(m);
  }

  refreshParty() {
    clear(this.partyEl);
    const g = this.s.game;
    const active = this.s.battle?.active?.member;
    for (const m of this.s.party.members) {
      const mhp = maxHp(g, m), mmp = maxMp(g, m);
      const cls = '.pcard' + (m.status === 'dead' ? '.dead' : '') + (m === active ? '.active' : '') + (m === this.selected ? '.sel' : '');
      this.partyEl.appendChild(h('div' + cls, { onclick: () => this.selectHero(m), title: 'Show details' },
        h('div.pc-head', h('span.pc-name', m.name), m.points > 0 ? h('span.pc-pts', { title: 'Attribute points to spend' }, '▲' + m.points) : null,
          h('span.pc-status', STATUS_ICON[m.status] || ''), h('span.pc-sub', `L${m.level} ${classOf(g, m).name}`)),
        h('div.pc-bars', bar('HP', m.hp, mhp, 'hp'), mmp > 0 ? bar('MP', m.mp, mmp, 'mp') : null),
      ));
    }
  }

  refreshHero(force = false) {
    const s = this.s;
    if (!s.party.members.includes(this.selected)) this.selected = s.party.members[0] || null;
    // rebuild only when something on the sheet changed (keeps open dropdowns stable while walking)
    const bu = s.battle?.partyUnits.find((u) => u.member === this.selected);
    const sig = JSON.stringify([this.selected, s.party.inventory, s.party.members.indexOf(this.selected), !!s.battle, bu?.specialUsed]);
    if (!force && sig === this.heroSig) return;
    this.heroSig = sig;
    clear(this.heroEl);
    if (this.selected) this.heroEl.appendChild(this.heroSheet(this.selected, () => this.refresh()));
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
    add(
      h('div.sheet-title', h('span', m.name), h('span.status' + (m.status !== 'ok' ? '.bad' : ''), statusLabel(m))),
      h('div.sheet-sub', `Level ${m.level} ${r.name} ${k.name}`),
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
    // special ability
    const sp = specialOf(g, m);
    if (sp) {
      const used = s.battle?.partyUnits.find((u) => u.member === m)?.specialUsed;
      add(h('div.special' + (used ? '.used' : ''), h('b', `★ ${sp.name}`), h('span', used ? ' — used this battle' : ' — once per battle (Q)'), h('p', sp.desc)));
    }
    // spells
    const spells = knownSpells(g, m);
    if (spells.length) {
      add(h('div.spells', h('div.sub', 'Spells'), h('div.spell-tags', ...spells.map((x) => h('span.tag', { title: `${x.desc || ''} (${x.reagents?.length ? x.reagents.map((id) => itemOf(g, id)?.name || id).join(' + ') : (x.cost || 0) + ' MP'})` }, x.name)))));
    }
    const idx = s.party.members.indexOf(m);
    add(h('div.sheet-actions',
      h('button.small', { onclick: () => this.openParty(m) }, '🎒 Pack'),
      idx > 0 && !inBattle ? h('button.small', {
        title: 'The first hero leads the party',
        onclick: () => { s.party.members.splice(idx, 1); s.party.members.splice(idx - 1, 0, m); changed(); },
      }, '▲ Move up') : null,
      idx === 0 ? h('span.hint', 'Leads the party') : null,
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
  }

  // ------------------------------------------------------------ commands
  setMode(mode) {
    this.mode = mode;
    clear(this.cmdEl);
    const btn = (label, key, fn, title, cls = '') => h('button.cmd' + cls, { title: title || label, onclick: () => { sfx('click'); fn(); } }, h('u', key), ' ', label);
    if (mode === 'combat') {
      this.cmdEl.append(
        btn('Attack', 'F', () => this.beginAttackTargeting(), 'Attack or shoot a foe (F) — or bump into an adjacent enemy'),
        this.specialBtn = btn('Special', 'Q', () => this.combatSpecial(), 'Class special, once per battle (Q)', '.special'),
        btn('Cast', 'C', () => this.combatCast()),
        btn('Use', 'U', () => this.combatUse()),
        btn('End turn', '␣', () => this.s.battle?.actPass(), 'End this hero\'s turn (Space)'),
        btn('Help', '?', () => this.openHelp()),
      );
    } else {
      this.cmdEl.append(
        btn('Talk', 'T', () => this.askDirection('Talk', (dx, dy) => this.s.talkDirection(dx, dy))),
        btn('Look', 'L', () => this.askDirection('Look', (dx, dy) => this.look(dx, dy))),
        btn('Cast', 'C', () => this.fieldCast()),
        btn('Use', 'U', () => this.fieldUse()),
        btn('Pack', 'I', () => this.openParty(this.selected)),
        btn('Camp', 'H', () => this.s.camp(), 'Hole up: make camp and rest (H)'),
        btn('Map', 'M', () => this.openMap()),
        btn('Wait', '␣', () => this.s.wait(), 'Wait a turn (Space)'),
        btn('Help', '?', () => this.openHelp()),
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
    this.onClick = (e) => this.handleClick(e);
    this.onCtx = (e) => e.preventDefault();
    window.addEventListener('keydown', this.onKey);
    const cv = this.view.renderer.domElement;
    cv.addEventListener('mousemove', this.onMove);
    cv.addEventListener('click', this.onClick);
    cv.addEventListener('contextmenu', this.onCtx);
    this.onWheel = (e) => { e.preventDefault(); this.view.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); };
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    cv.style.touchAction = 'none';
    this.gestures = attachGestures(this.view, cv, { pan: false });
  }

  unbindInput() {
    window.removeEventListener('keydown', this.onKey);
    const cv = this.view.renderer.domElement;
    cv.removeEventListener('mousemove', this.onMove);
    cv.removeEventListener('click', this.onClick);
    cv.removeEventListener('contextmenu', this.onCtx);
    cv.removeEventListener('wheel', this.onWheel);
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
      if (this.pendingDir || this.targeting) { this.cancelTargeting(); return; }
      if (this.s.mode === 'explore') this.openMenu();
      return;
    }
    if (anyModal()) return;
    const dir = MOVE_KEYS[e.key] || MOVE_KEYS[e.code];
    if (this.s.mode === 'combat') return this.combatKey(e, dir);
    if (this.s.mode !== 'explore') return;
    if (dir) {
      e.preventDefault();
      this.autoPath = null;
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
    const map = {
      t: () => this.askDirection('Talk', (dx, dy) => this.s.talkDirection(dx, dy)),
      l: () => this.askDirection('Look', (dx, dy) => this.look(dx, dy)),
      c: () => this.fieldCast(),
      u: () => this.fieldUse(),
      i: () => this.openParty(),
      z: () => this.openParty(),
      h: () => this.s.camp(),
      m: () => this.openMap(),
      ' ': () => this.s.wait(),
      '.': () => this.s.wait(),
      '?': () => this.openHelp(),
    };
    if (map[k] || map[e.key]) { e.preventDefault(); (map[k] || map[e.key])(); }
  }

  handleHover(e) {
    const t = this.view.pick(e.clientX, e.clientY);
    if (!t) { this.view.showCursor(null); return; }
    const b = this.s.battle;
    if (b) {
      const u = b.unitAt(t.x, t.y);
      let color = 0xffffff;
      if (this.targeting) color = this.targetValid(t) ? 0xffe040 : 0x808080;
      else if (u && u.side === 'enemy' && b.active && b.canAttack(b.active, u)) color = 0xff4040;
      else if (b.active && !u && b.pathTo(b.active, t.x, t.y)) color = 0x80c8ff;
      this.view.showCursor(t.x, t.y, color);
      this.hoverEl.textContent = u ? `${u.name}${u.side === 'enemy' ? ` — ${healthWord(u.hp / u.maxHp)}` : ''}${u.sleep > 0 ? ' (asleep)' : ''}${u.stun > 0 ? ' (stunned)' : ''}` : '';
      return;
    }
    if (!this.s.map) return;
    this.view.showCursor(t.x, t.y, 0xffffff);
    this.hoverEl.textContent = this.s.describeTile(t.x, t.y);
  }

  handleClick(e) {
    const t = this.view.pick(e.clientX, e.clientY);
    if (!t || anyModal()) return;
    const b = this.s.battle;
    if (b) return this.combatClick(t);
    if (this.s.mode !== 'explore') return;
    const p = this.s.state.pos;
    const dx = t.x - p.x, dy = t.y - p.y;
    if (this.pendingDir) {
      if (Math.abs(dx) + Math.abs(dy) >= 1) {
        const fn = this.pendingDir;
        this.pendingDir = null;
        this.hint('');
        fn(Math.sign(dx) * (Math.abs(dx) >= Math.abs(dy) ? 1 : 0), Math.sign(dy) * (Math.abs(dy) > Math.abs(dx) ? 1 : 0));
      }
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) === 1) { this.s.move(dx, dy); return; }
    if (dx === 0 && dy === 0) { this.s.wait(); return; }
    // walk along a path
    const path = this.s.findPathTo(t.x, t.y);
    if (path && path.length) this.followPath(path);
    else {
      // fall back to a single step in the main direction
      if (Math.abs(dx) >= Math.abs(dy)) this.s.move(Math.sign(dx), 0); else this.s.move(0, Math.sign(dy));
    }
  }

  async followPath(path) {
    const token = {};
    this.autoPath = token;
    for (const [x, y] of path) {
      if (this.autoPath !== token || this.s.mode !== 'explore') return;
      const p = this.s.state.pos;
      const dx = x - p.x, dy = y - p.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;
      const before = this.s.state.turn;
      await this.s.move(dx, dy);
      while (this.s.busy) await new Promise((r) => setTimeout(r, 20));
      if (this.s.state.turn === before) return;
      const q = this.s.state.pos;
      if (q.x !== x || q.y !== y) return; // blocked, slowed or interrupted
      if (this.s.map.entities.some((en) => en.type === 'monster' && this.s.isVisible(en.x, en.y) && Math.abs(en.x - q.x) + Math.abs(en.y - q.y) < 6)) return;
    }
  }

  // ------------------------------------------------------------ combat input
  combatKey(e, dir) {
    const b = this.s.battle;
    if (!b || !b.active || b.acting) return;
    if (this.targeting) {
      if (e.key === 'Tab') { e.preventDefault(); this.cycleTarget(e.shiftKey ? -1 : 1); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') { e.preventDefault(); this.confirmTarget(); return; }
      if (dir) {
        e.preventDefault();
        const c = this.targeting.cursor || { x: b.active.x, y: b.active.y };
        this.targeting.cursor = { x: c.x + dir[0], y: c.y + dir[1] };
        this.view.showCursor(this.targeting.cursor.x, this.targeting.cursor.y, this.targetValid(this.targeting.cursor) ? 0xffe040 : 0x808080);
        return;
      }
      return;
    }
    if (dir) { e.preventDefault(); b.actMove(dir[0], dir[1]); return; }
    const k = e.key.toLowerCase();
    if (k === 'f') { e.preventDefault(); this.beginAttackTargeting(); }
    else if (k === 'c') { e.preventDefault(); this.combatCast(); }
    else if (k === 'u') { e.preventDefault(); this.combatUse(); }
    else if (k === 'q') { e.preventDefault(); this.combatSpecial(); }
    else if (k === '?') { e.preventDefault(); this.openHelp(); }
    else if (k === ' ' || k === '.') { e.preventDefault(); b.actPass(); }
  }

  combatClick(t) {
    const b = this.s.battle;
    if (!b.active || b.acting) return;
    if (this.targeting) {
      if (this.targetValid(t)) this.pickTarget(t);
      else sfx('error');
      return;
    }
    const u = b.active;
    const other = b.unitAt(t.x, t.y);
    if (other && other.side === 'enemy') { b.actAttack(other); return; }
    const dx = t.x - u.x, dy = t.y - u.y;
    if (Math.abs(dx) + Math.abs(dy) === 1 && other) { b.actMove(dx, dy); return; } // swap with an ally
    if (b.pathTo(u, t.x, t.y)) b.actMoveTo(t.x, t.y, u);
    else if (dx || dy) sfx('bump');
  }

  combatStart() {
    this.root.classList.add('combat');
    this.setMode('combat');
    this.refresh();
  }

  combatTurn(u) {
    this.cancelTargeting();
    if (u && u.member !== this.selected) { this.selected = u.member; this.refreshHero(); }
    this.refreshParty();
    const b = this.s.battle;
    if (!u || !b) { this.view.setHighlights(null); this.hint(''); return; }
    const rw = rangedOf(this.s.game, u.member);
    const sp = specialOf(this.s.game, u.member);
    const spOk = sp && b.canSpecial(u).ok;
    const mv = u.moves || 0;
    this.hint(`${u.name}: ${mv} move${mv === 1 ? '' : 's'} left — click a blue square or use the arrows; bump or F to ${rw ? `attack (shoots with the ${rw.name.toLowerCase()})` : 'attack'}${spOk ? `, Q ${sp.name}` : ''}, C cast, U use, Space ends the turn.`);
    if (this.specialBtn) {
      this.specialBtn.classList.toggle('disabled', !spOk);
      this.specialBtn.lastChild.textContent = ' ' + (sp ? sp.name : 'Special');
      this.specialBtn.title = sp ? `${sp.name}: ${sp.desc}${u.specialUsed ? ' (used)' : ''}` : 'No special ability';
    }
    const moves = [...b.reachable(u).values()].filter((c) => c.d > 0 && !c.ally).map((c) => ({ x: c.x, y: c.y, color: 0x50a0ff }));
    const atk = b.attackTargets(u).map((e) => ({ x: e.x, y: e.y, color: 0xff5040 }));
    this.view.setHighlights([...moves, ...atk], 0x50a0ff, 0.34);
  }

  combatEnd() {
    this.root.classList.remove('combat');
    this.cancelTargeting();
    this.view.setHighlights(null);
    this.hint('');
  }

  beginAttackTargeting() {
    const b = this.s.battle;
    if (!b || !b.active) return;
    const u = b.active;
    const targets = b.attackTargets(u);
    if (!targets.length) { this.s.log('No foe within reach. Move closer, or use a ranged weapon.', 'warn'); sfx('error'); return; }
    this.startTargeting({
      units: targets,
      label: 'Attack',
      onPick: (t) => b.actAttack(b.unitAt(t.x, t.y), u),
    });
  }

  async combatSpecial() {
    const b = this.s.battle;
    if (!b || !b.active || b.acting) return;
    const u = b.active;
    const can = b.canSpecial(u);
    if (!can.ok) { this.s.log(can.why, 'warn'); sfx('error'); return; }
    const sp = can.special;
    const tg = b.specialTargets(u);
    const after = () => { if (b.active === u && this.s.battle === b) this.combatTurn(u); };
    if (tg.kind === 'tile') {
      this.startTargeting({ tiles: tg.tiles, label: sp.name, color: 0xb090ff, onPick: async (t) => { await b.actSpecial({ x: t.x, y: t.y }, u); after(); } });
    } else if (tg.kind === 'enemy') {
      this.startTargeting({ units: tg.units, label: sp.name, color: 0xb090ff, onPick: async (t) => { await b.actSpecial(b.unitAt(t.x, t.y), u); after(); } });
    } else {
      await b.actSpecial(null, u);
      after();
    }
  }

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

  async combatCast() {
    const b = this.s.battle;
    if (!b || !b.active || b.acting) return;
    const u = b.active;
    const spells = b.combatSpells(u);
    if (!spells.length) { this.s.log(`${u.name} knows no battle magic.`, 'warn'); return; }
    const spell = await this.chooseSpell(u.member, spells);
    if (!spell || b.active !== u || this.s.battle !== b) return;
    const can = canCast(this.s.game, u.member, spell, this.s.party.inventory);
    if (!can.ok) { this.s.log(can.why, 'warn'); sfx('error'); return; }
    if (spell.target === 'enemy') {
      const ts = b.spellTargets(u, spell);
      if (!ts.length) { this.s.log('No foe in sight for that spell.', 'warn'); return; }
      this.startTargeting({ units: ts, label: spell.name, color: spell.fx, onPick: (t) => b.actCast(spell, b.unitAt(t.x, t.y), u) });
    } else if (spell.target === 'area') {
      const tiles = [];
      const r = spell.range || 7;
      for (let y = 0; y < b.arena.h; y++) for (let x = 0; x < b.arena.w; x++) if (Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) <= r) tiles.push({ x, y });
      this.startTargeting({ tiles, label: `${spell.name} (area)`, color: spell.fx, onPick: (t) => b.actCast(spell, { x: t.x, y: t.y }, u) });
      this.view.setHighlights(tiles.filter((c) => b.unitAt(c.x, c.y)?.side === 'enemy'), spell.fx || 0xffc030, 0.45);
    } else if (spell.target === 'ally') {
      const ts = b.spellTargets(u, spell);
      if (!ts.length) { this.s.log(spell.effect === 'revive' ? 'No one has fallen.' : 'No one to target.', 'warn'); return; }
      const pick = await this.chooseFrom(`${spell.name} — on whom?`, ts.map((t) => ({ label: `${t.name} (${t.member.hp}/${maxHp(this.s.game, t.member)} HP${t.dead ? ', fallen' : ''})`, value: t })));
      if (pick) b.actCast(spell, pick, u);
    } else {
      b.actCast(spell, null, u);
    }
  }

  async combatUse() {
    const b = this.s.battle;
    if (!b || !b.active || b.acting) return;
    const u = b.active;
    const items = b.combatItems();
    if (!items.length) { this.s.log('You have nothing useful to hand.', 'warn'); return; }
    const inv = this.s.party.inventory;
    const item = await this.chooseFrom('Use which item?', items.map((it) => ({ label: `${it.name} ×${inv[it.id]}`, sub: it.desc, value: it })));
    if (!item) return;
    const ts = b.partyUnits.filter((p) => (item.effect === 'revive' ? p.dead && !p.fled : b.alive(p)));
    const tgt = await this.chooseFrom(`${item.name} — on whom?`, ts.map((t) => ({ label: `${t.name} (${t.member.hp}/${maxHp(this.s.game, t.member)} HP)`, value: t })));
    if (tgt) b.actUse(item, tgt, u);
  }

  // ------------------------------------------------------------ generic choosers
  chooseFrom(title, options) {
    return new Promise((resolve) => {
      let done = false;
      const list = h('div.choose-list');
      const m = modal(list, { title, cls: 'small', onClose: () => { if (!done) resolve(null); } });
      options.forEach((o, i) => {
        list.appendChild(h('button.choose-item' + (o.disabled ? '.disabled' : ''), {
          onclick: () => { if (o.disabled) return; done = true; m.close(); resolve(o.value); },
        }, h('span.ci-key', String(i + 1)), h('span.ci-label', o.label), o.sub ? h('span.ci-sub', o.sub) : null));
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
    return this.chooseFrom(`${member.name} casts... (MP ${member.mp}/${maxMp(g, member)})`, spells.map((sp) => {
      const can = canCast(g, member, sp, inv);
      const sys = byId(g.magic, sp.system);
      const cost = sp.reagents && sp.reagents.length
        ? sp.reagents.map((r) => `${itemOf(g, r)?.name || r} (${inv[r] || 0})`).join(' + ')
        : `${sp.cost} MP`;
      return { label: `${sp.name} — ${cost}`, sub: `${sys?.name || ''} · ${sp.desc || ''}${can.ok ? '' : ' — ' + can.why}`, value: sp, disabled: !can.ok };
    }));
  }

  chooseMember(title, filter = () => true) {
    const ms = this.s.party.members.filter(filter);
    return this.chooseFrom(title, ms.map((m) => ({ label: `${m.name} — ${m.hp}/${maxHp(this.s.game, m)} HP ${m.status !== 'ok' ? '(' + statusLabel(m) + ')' : ''}`, value: m })));
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
    const item = await this.chooseFrom('Use which item?', items.map((it) => ({ label: `${it.name} ×${inv[it.id]}`, sub: it.desc, value: it })));
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
    const body = h('div.talk',
      h('div.talk-head', h('b', npc.name || 'Stranger'), h('span', ' — ' + (npc.desc || ''))),
      conv,
      h('div.talk-ask', input, h('button.primary', { onclick: () => { ask(input.value); input.value = ''; input.focus(); } }, 'Ask')),
      chips,
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { ask(input.value); input.value = ''; }
    });
    const m = modal(body, { cls: 'talk-modal', onClose: () => { s.mode = 'explore'; this.refresh(); } });
    add(h('p.note', `You meet ${npc.desc || 'someone'}.`));
    if (npc.greeting) sayLine(npc.greeting);
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
    let tab = 'buy';
    const render = () => {
      clear(body);
      body.append(h('div.shop-gold', `Your gold: ◆ ${s.party.gold}`, g.settings.food ? `   ·   Food: ${s.party.food}` : ''));
      body.append(h('div.tabs',
        h('button' + (tab === 'buy' ? '.on' : ''), { onclick: () => { tab = 'buy'; render(); } }, 'Buy'),
        h('button' + (tab === 'sell' ? '.on' : ''), { onclick: () => { tab = 'sell'; render(); } }, 'Sell')));
      const list = h('div.shop-list');
      if (tab === 'buy') {
        if (!stock.length) list.appendChild(h('p', 'Nothing for sale today.'));
        for (const it of stock) {
          const price = this.priceOf(it, npc);
          const owned = s.party.inventory[it.id] || 0;
          const usable = it.type === 'weapon' || it.type === 'armor' || it.type === 'shield'
            ? s.party.members.filter((m) => canEquip(g, m, it).ok).map((m) => m.name).join(', ') || 'no one'
            : '';
          list.appendChild(h('div.shop-row',
            h('div.sr-main', h('b', it.name), h('span.sr-stats', itemStats(it)), h('div.sr-desc', it.desc || ''), usable ? h('div.sr-who', 'Usable by: ' + usable) : null),
            h('div.sr-side', h('span.price', `◆ ${price}`), owned ? h('span.owned', `own ${owned}`) : null,
              h('button' + (s.party.gold >= price ? '.primary' : '.disabled'), {
                onclick: () => {
                  if (s.party.gold < price) { sfx('error'); return; }
                  s.party.gold -= price;
                  if (it.effect === 'food') s.party.food += parseInt(it.power, 10) || 25;
                  else s.party.inventory[it.id] = owned + 1;
                  sfx('gold');
                  s.log(`Bought ${it.name}.`);
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
            h('div.sr-main', h('b', `${it.name} ×${inv[it.id]}`), h('span.sr-stats', itemStats(it))),
            h('div.sr-side', h('span.price', `◆ ${price}`), h('button', {
              onclick: () => { inv[it.id]--; s.party.gold += price; sfx('gold'); render(); this.refresh(); },
            }, 'Sell'))));
        }
        list.appendChild(h('p.hint', 'Unequip items in the Party screen (I) to sell them.'));
      }
      body.append(list);
    };
    render();
    modal(body, { title: `${npc.name}'s wares`, cls: 'wide' });
  }

  openInn(npc) {
    const s = this.s;
    const n = s.party.members.filter((m) => m.status !== 'dead').length;
    const cost = (npc.price || 6) * n;
    modal(h('p', `A room for the night costs ${cost} gold for your company. Rest here?`), {
      title: 'The Inn',
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
      body.appendChild(h('div.shop-gold', `Your gold: ◆ ${s.party.gold}`));
      for (const m of s.party.members) {
        const mh = maxHp(g, m);
        const services = [];
        if (m.status === 'dead') services.push(['Raise', 150 + m.level * 25, () => { m.status = 'ok'; m.hp = mh; s.refreshPartyVisual(); }]);
        else {
          if (m.hp < mh) services.push(['Heal', 10 + (mh - m.hp), () => { m.hp = mh; }]);
          if (m.status === 'poisoned') services.push(['Cure', 20, () => { m.status = 'ok'; }]);
        }
        body.appendChild(h('div.shop-row',
          h('div.sr-main', h('b', m.name), h('span.sr-stats', `${m.hp}/${mh} HP · ${statusLabel(m)}`)),
          h('div.sr-side', ...(services.length ? services.map(([label, cost, fn]) => h('button' + (s.party.gold >= cost ? '.primary' : '.disabled'), {
            onclick: () => {
              if (s.party.gold < cost) { sfx('error'); return; }
              s.party.gold -= cost; fn(); sfx('heal'); render(); this.refresh();
            },
          }, `${label} ◆${cost}`)) : [h('span.hint', 'In good health')]))));
      }
    };
    render();
    modal(body, { title: `${npc.name} the Healer`, cls: 'wide' });
  }

  // ------------------------------------------------------------ party / inventory
  // The pack: everything the company carries, with the chosen hero's sheet beside it
  openParty(focus) {
    const s = this.s, g = s.game;
    let sel = focus || this.selected || s.party.members[0];
    const body = h('div.party-screen');
    const render = () => {
      clear(body);
      const tabs = h('div.tabs');
      for (const m of s.party.members) tabs.appendChild(h('button' + (m === sel ? '.on' : ''), { onclick: () => { sel = m; render(); } }, m.name, m.points > 0 ? ' ▲' : ''));
      body.appendChild(tabs);
      const m = sel;
      const inv = s.party.inventory;
      const invList = h('div.inv');
      const items = g.items.filter((it) => inv[it.id] > 0);
      if (!items.length) invList.appendChild(h('p.hint', 'The pack is empty.'));
      for (const it of items) {
        const row = h('div.inv-row', h('span.inv-name', `${it.name} ×${inv[it.id]}`), h('span.inv-stats', itemStats(it)));
        const slot = slotFor(it);
        if (slot && !s.battle) {
          const ok = canEquip(g, m, it);
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
          row.appendChild(h('button', { onclick: async () => { closeTopModal(); await this.fieldUseItem(it); } }, 'Use'));
        }
        invList.appendChild(row);
      }
      body.appendChild(h('div.pack-cols',
        h('div.pack-sheet', this.heroSheet(m, () => { render(); this.refresh(); })),
        h('div.inv-wrap', h('div.sub', `Pack — ◆ ${s.party.gold} gold${g.settings.food ? ` · ${s.party.food} food` : ''}`), invList)));
    };
    render();
    modal(body, { title: 'Your Company', cls: 'wide party-modal' });
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
    modal(h('div.map-wrap', c), { title: map.name, cls: 'map-modal' });
  }

  // ------------------------------------------------------------ menus & endings
  openMenu() {
    const s = this.s;
    const items = [
      ['Resume', () => {}],
      !s.opts.noSave ? ['Save game', () => s.save()] : null,
      ['Help & keys', () => this.openHelp()],
      [isMuted() ? 'Sound effects: off' : 'Sound effects: on', () => { setMuted(!isMuted()); }],
      [musicEnabled() ? 'Music: on' : 'Music: off', () => { setMusicEnabled(!musicEnabled()); }],
      ['Camera angle', () => this.openCamera()],
      s.opts.fromEditor ? ['Return to the Construction Set', () => this.app.endPlay(true)] : ['Quit to title', async () => {
        if (await confirmDialog('Return to the title screen? Unsaved progress since your last save will be lost.')) this.app.endPlay(false);
      }],
    ].filter(Boolean);
    const list = h('div.choose-list');
    const m = modal(list, { title: this.s.game.meta.title, cls: 'small' });
    for (const [label, fn] of items) list.appendChild(h('button.choose-item', { onclick: () => { m.close(); fn(); } }, h('span.ci-label', label)));
  }

  openCamera() {
    const v = this.view;
    const slider = h('input', { type: 'range', min: 50, max: 85, value: v.rig.pitch });
    slider.addEventListener('input', () => v.setPitch(+slider.value));
    modal(h('div', h('p', 'Camera pitch (degrees above the horizon):'), slider, h('p.hint', 'Scroll the mouse wheel to zoom.')), { title: 'Camera', cls: 'small' });
  }

  openHelp() {
    modal(h('div.help', { html: HELP_HTML }), { title: 'How to play', cls: 'wide' });
  }

  showGameOver() {
    const s = this.s;
    const saved = !s.opts.noSave && loadState(s.game.id);
    sfx('defeat');
    modal(h('div', h('p.big', 'Your company has perished.'), h('p', 'Yet the tale need not end here...')), {
      title: 'Darkness Falls',
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
      title: '★ Victory ★',
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
<p><b>Arrow keys / WASD</b> move. Click a tile to walk there. Bump into people to talk, into monsters to fight.
Step onto towns, caves and stairs to enter them; walk off the edge of a town to leave.</p>
<table class="keys">
<tr><td>T</td><td>Talk (then a direction)</td><td>L</td><td>Look</td></tr>
<tr><td>C</td><td>Cast a spell</td><td>U</td><td>Use an item</td></tr>
<tr><td>I</td><td>Pack &amp; equipment</td><td>H</td><td>Hole up (camp &amp; rest)</td></tr>
<tr><td>M</td><td>Map</td><td>Space</td><td>Wait a turn</td></tr>
<tr><td>Ctrl/⌘+S</td><td>Save</td><td>Esc</td><td>Menu</td></tr>
</table>
<h3>Your company</h3>
<p>Click a hero on the right to see their sheet. Each hero carries a <b>hand weapon</b> for melee and a <b>ranged weapon</b>
(bow, crossbow or sling) — change either, and armour and shield, straight from the sheet. Every level brings an
<b>attribute point</b> (▲) to spend with the <b>+</b> buttons.</p>
<h3>Talking</h3>
<p>Type a word to ask about it — <b>NAME</b>, <b>JOB</b> and anything the person mentions. Highlighted words are worth asking about.
Merchants answer to <b>BUY</b>, innkeepers to <b>ROOM</b>, healers to <b>HEAL</b>, and some folk will <b>JOIN</b> your company.</p>
<h3>Battle</h3>
<p>Each hero acts in turn, then the enemy. A hero can move up to three squares (four if nimble, two in plate armour) —
click a blue square or use the arrows — and then strike, cast or use an item. Bump a foe to strike it. <b>F</b> attacks — with your bow if the foe is
out of reach. <b>Space</b> ends a hero's turn early. <b>Q</b> uses your class special, once per battle: Whirlwind, Volley, Blink, Shadow Strike and more.
<b>C</b> casts, <b>U</b> uses an item. Walk off the edge of the field to flee. Fallen foes sometimes leave gear behind.</p>
<table class="keys">
<tr><td>F</td><td>Attack / shoot</td><td>Q</td><td>Class special</td></tr>
<tr><td>C</td><td>Cast</td><td>U</td><td>Use item</td></tr>
<tr><td>Tab</td><td>Next target</td><td>Enter</td><td>Confirm target</td></tr>
</table>
<h3>Survival</h3>
<p>Food runs down as you travel. Swamps may poison you. Rest at inns, or hole up in the wild (if no foes are near).
Forests and mountains block your sight. Carry torches into dark places. Night falls every few hundred turns:
you see less, and more monsters roam.</p>`;

export { escapeHtml };
