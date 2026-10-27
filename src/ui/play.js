// Play-mode HUD and all of its windows (talk, shop, party, spells, map...).
import { h, clear, modal, toast, anyModal, closeTopModal, closeAllModals, confirmDialog } from './dom.js';
import { byId } from '../data/schema.js';
import { terrain } from '../data/terrain.js';
import { getTile } from '../world/map.js';
import {
  maxHp, maxMp, armorClass, attackBonus, weaponOf, canEquip, itemOf, raceOf, classOf, knownSpells, canCast, xpForLevel,
  statusLabel, partyAlive, charLook, casting, mod,
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
  build() {
    const root = h('div.hud');
    this.root = root;
    this.statusEl = h('div.hud-status');
    this.partyEl = h('div.hud-party');
    this.logEl = h('div.hud-log');
    this.cmdEl = h('div.hud-cmds');
    this.hintEl = h('div.hud-hint');
    this.minimap = h('canvas.hud-minimap', { width: 64, height: 64, title: 'Map (M)', onclick: () => this.openMap() });
    this.hoverEl = h('div.hud-hover');
    root.append(
      h('div.hud-top', this.statusEl, this.hoverEl),
      h('div.hud-right', this.minimap, this.partyEl),
      h('div.hud-bottom', this.logEl, this.cmdEl),
      this.hintEl,
    );
    this.app.ui.appendChild(root);
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
    if (this.logLines.length > 120) this.logLines.shift();
    const line = h('div.log-line' + (cls ? '.' + cls : ''), text);
    this.logEl.appendChild(line);
    while (this.logEl.childNodes.length > 120) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  refresh() {
    this.refreshStatus();
    this.refreshParty();
    this.drawMinimap();
  }

  onMapChanged() { this.drawMinimap(); }

  refreshStatus() {
    const s = this.s, p = s.party;
    const map = s.battle ? null : s.map;
    clear(this.statusEl);
    this.statusEl.append(...[
      h('span.st-place', s.battle ? '⚔ Battle' : map ? map.name : ''),
      h('span.st-item', { title: 'Gold' }, h('b.gold', '◆'), ' ', String(p.gold)),
      this.s.game.settings.food ? h('span.st-item' + (p.food < 20 ? '.low' : ''), { title: 'Food' }, '🍖 ', String(p.food)) : null,
      p.light > 0 ? h('span.st-item', { title: 'Light' }, '🔥 ', String(p.light)) : null,
      s.state.vehicle ? h('span.st-item', '⛵ Aboard ship') : null,
    ].filter(Boolean));
  }

  refreshParty() {
    clear(this.partyEl);
    const g = this.s.game;
    const active = this.s.battle?.active?.member;
    for (const m of this.s.party.members) {
      const mhp = maxHp(g, m), mmp = maxMp(g, m);
      const card = h('div.pcard' + (m.status === 'dead' ? '.dead' : '') + (m === active ? '.active' : ''), {
        onclick: () => { if (!this.s.battle) this.openParty(m); },
      },
      h('div.pc-head', h('span.pc-name', m.name), h('span.pc-status', STATUS_ICON[m.status] || '')),
      h('div.pc-sub', `L${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}`),
      bar('HP', m.hp, mhp, 'hp'),
      mmp > 0 ? bar('MP', m.mp, mmp, 'mp') : null,
      );
      this.partyEl.appendChild(card);
    }
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
    const btn = (label, key, fn, title) => h('button.cmd', { title: title || label, onclick: () => { sfx('click'); fn(); } }, h('u', key), label.replace(key, ''));
    if (mode === 'combat') {
      this.cmdEl.append(
        btn('Fight', 'F', () => this.beginAttackTargeting(), 'Attack a foe (F) — or bump into an adjacent enemy'),
        btn('Cast', 'C', () => this.combatCast()),
        btn('Use', 'U', () => this.combatUse()),
        btn('Wait', '␣', () => this.s.battle?.actPass(), 'Pass this turn (Space)'),
      );
      this.hint('');
    } else {
      this.cmdEl.append(
        btn('Talk', 'T', () => this.askDirection('Talk', (dx, dy) => this.s.talkDirection(dx, dy))),
        btn('Look', 'L', () => this.askDirection('Look', (dx, dy) => this.look(dx, dy))),
        btn('Cast', 'C', () => this.fieldCast()),
        btn('Use', 'U', () => this.fieldUse()),
        btn('Party', 'I', () => this.openParty()),
        btn('Hole up', 'H', () => this.s.camp(), 'Make camp and rest (H)'),
        btn('Map', 'M', () => this.openMap()),
        btn('Wait', '␣', () => this.s.wait()),
        h('button.cmd.menu', { onclick: () => this.openMenu(), title: 'Menu (Esc)' }, '☰'),
      );
      this.hint('');
    }
    this.refresh();
  }

  hint(text) {
    this.hintEl.textContent = text || '';
    this.hintEl.style.display = text ? '' : 'none';
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
      this.view.showCursor(t.x, t.y, color);
      this.hoverEl.textContent = u ? `${u.name}${u.side === 'enemy' ? ` — ${healthWord(u.hp / u.maxHp)}` : ''}${u.sleep > 0 ? ' (asleep)' : ''}` : '';
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
    if (!b || !b.active) return;
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
    else if (k === ' ' || k === '.') { e.preventDefault(); b.actPass(); }
  }

  combatClick(t) {
    const b = this.s.battle;
    if (!b.active) return;
    if (this.targeting) {
      if (this.targetValid(t)) this.pickTarget(t);
      else sfx('error');
      return;
    }
    const u = b.active;
    const other = b.unitAt(t.x, t.y);
    if (other && other.side === 'enemy') { b.actAttack(other); return; }
    const dx = t.x - u.x, dy = t.y - u.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) b.actMove(dx, dy);
  }

  combatStart() {
    this.root.classList.add('combat');
    this.setMode('combat');
    this.refresh();
  }

  combatTurn(u) {
    this.cancelTargeting();
    this.refreshParty();
    const b = this.s.battle;
    if (!u || !b) { this.view.setHighlights(null); this.hint(''); return; }
    const w = weaponOf(this.s.game, u.member);
    this.hint(`${u.name}'s turn — arrows move (bump to strike${w.range > 1 ? ', F to shoot' : ''}), C cast, U use, Space wait. Walk off the edge to flee.`);
    const moves = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (b.walkable(u.x + dx, u.y + dy, u)) moves.push({ x: u.x + dx, y: u.y + dy });
    const atk = b.attackTargets(u).map((e) => ({ x: e.x, y: e.y }));
    this.view.setHighlights([...moves, ...atk], 0x50a0ff, 0.22);
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
    const targets = b.attackTargets(b.active);
    if (!targets.length) { this.s.log('No foe within reach. Move closer, or use a ranged weapon.', 'warn'); sfx('error'); return; }
    this.startTargeting({
      units: targets,
      label: 'Attack',
      onPick: (t) => b.actAttack(b.unitAt(t.x, t.y)),
    });
  }

  startTargeting(tg) {
    this.targeting = tg;
    const cells = tg.tiles || tg.units.map((u) => ({ x: u.x, y: u.y }));
    this.view.setHighlights(cells, tg.color || 0xffc030, 0.4);
    tg.index = 0;
    tg.cursor = cells[0] ? { ...cells[0] } : null;
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
    if (!b || !b.active) return;
    const u = b.active;
    const spells = b.combatSpells(u);
    if (!spells.length) { this.s.log(`${u.name} knows no battle magic.`, 'warn'); return; }
    const spell = await this.chooseSpell(u.member, spells);
    if (!spell) return;
    const can = canCast(this.s.game, u.member, spell, this.s.party.inventory);
    if (!can.ok) { this.s.log(can.why, 'warn'); sfx('error'); return; }
    if (spell.target === 'enemy') {
      const ts = b.spellTargets(u, spell);
      if (!ts.length) { this.s.log('No foe in sight for that spell.', 'warn'); return; }
      this.startTargeting({ units: ts, label: spell.name, color: spell.fx, onPick: (t) => b.actCast(spell, b.unitAt(t.x, t.y)) });
    } else if (spell.target === 'area') {
      const tiles = [];
      const r = spell.range || 7;
      for (let y = 0; y < b.arena.h; y++) for (let x = 0; x < b.arena.w; x++) if (Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) <= r) tiles.push({ x, y });
      this.startTargeting({ tiles, label: `${spell.name} (area)`, color: spell.fx, onPick: (t) => b.actCast(spell, { x: t.x, y: t.y }) });
      this.view.setHighlights(tiles.filter((c) => b.unitAt(c.x, c.y)?.side === 'enemy'), spell.fx || 0xffc030, 0.45);
    } else if (spell.target === 'ally') {
      const ts = b.spellTargets(u, spell);
      if (!ts.length) { this.s.log(spell.effect === 'revive' ? 'No one has fallen.' : 'No one to target.', 'warn'); return; }
      const pick = await this.chooseFrom(`${spell.name} — on whom?`, ts.map((t) => ({ label: `${t.name} (${t.member.hp}/${maxHp(this.s.game, t.member)} HP${t.dead ? ', fallen' : ''})`, value: t })));
      if (pick) b.actCast(spell, pick);
    } else {
      b.actCast(spell, null);
    }
  }

  async combatUse() {
    const b = this.s.battle;
    if (!b || !b.active) return;
    const items = b.combatItems();
    if (!items.length) { this.s.log('You have nothing useful to hand.', 'warn'); return; }
    const inv = this.s.party.inventory;
    const item = await this.chooseFrom('Use which item?', items.map((it) => ({ label: `${it.name} ×${inv[it.id]}`, sub: it.desc, value: it })));
    if (!item) return;
    const ts = b.partyUnits.filter((p) => (item.effect === 'revive' ? p.dead && !p.fled : b.alive(p)));
    const tgt = await this.chooseFrom(`${item.name} — on whom?`, ts.map((t) => ({ label: `${t.name} (${t.member.hp}/${maxHp(this.s.game, t.member)} HP)`, value: t })));
    if (tgt) b.actUse(item, tgt);
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
    const ask = (word) => {
      word = String(word || '').trim();
      if (!word) return;
      add(h('p.you-say', '› ' + word.toUpperCase()));
      const res = s.say(npc, word);
      if (res.text) sayLine(res.text);
      if (res.note) add(h('p.note', res.note));
      for (const k of knownKeywords(npc)) if (res.text && new RegExp('\\b' + k + '\\b', 'i').test(res.text)) asked.add(k);
      refreshChips();
      if (res.end) { setTimeout(() => m.close(), 450); return; }
      if (res.shop) { this.openShop(npc); }
      if (res.inn) { this.openInn(npc); }
      if (res.healer) { this.openHealer(npc); }
      if (res.join) {
        const err = s.recruit(npc);
        if (err) add(h('p.note', err));
        else { add(h('p.note', `${npc.name} joins your company!`)); setTimeout(() => m.close(), 900); }
      }
      if (res.fight) {
        setTimeout(async () => {
          m.close();
          s.log(`${npc.name} attacks!`, 'bad');
          await s.engage({ id: npc.id, monster: res.fight, count: '1', roaming: true });
          s.removeEntity(npc);
        }, 600);
      }
      if (res.teleport) {
        setTimeout(async () => { m.close(); await s.enterMap(res.teleport.map || s.map.id, +res.teleport.x || 0, +res.teleport.y || 0); }, 600);
      }
      if (res.victory) {
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
  openParty(focus) {
    const s = this.s, g = s.game;
    let sel = focus || s.party.members[0];
    const body = h('div.party-screen');
    const render = () => {
      clear(body);
      const tabs = h('div.tabs');
      for (const m of s.party.members) tabs.appendChild(h('button' + (m === sel ? '.on' : ''), { onclick: () => { sel = m; render(); } }, m.name));
      body.appendChild(tabs);
      const m = sel;
      const w = weaponOf(g, m);
      const next = xpForLevel(m.level + 1);
      const sheet = h('div.sheet',
        h('div.sheet-title', `${m.name} — Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}`, h('span.status', statusLabel(m))),
        h('div.sheet-grid',
          ...STATS.map((st) => h('div.stat', h('span', STAT_NAMES[st]), h('b', String(m[st])), h('i', fmtMod(mod(m[st]))))),
          h('div.stat', h('span', 'Health'), h('b', `${m.hp}/${maxHp(g, m)}`)),
          h('div.stat', h('span', 'Mana'), h('b', `${m.mp}/${maxMp(g, m)}`)),
          h('div.stat', h('span', 'Armour'), h('b', String(armorClass(g, m)))),
          h('div.stat', h('span', 'To hit'), h('b', fmtMod(attackBonus(g, m)))),
          h('div.stat', h('span', 'Weapon'), h('b', `${w.name} (${w.dmg}${w.range > 1 ? ', range ' + w.range : ''})`)),
          h('div.stat', h('span', 'Experience'), h('b', `${m.xp}${isFinite(next) ? ' / ' + next : ''}`)),
        ),
        h('div.equip',
          ...['weapon', 'armor', 'shield'].map((slot) => {
            const it = itemOf(g, m.equip[slot]);
            return h('div.slot', h('span.slot-name', slot), h('b', it ? it.name : '—'), it ? h('button', {
              onclick: () => { s.party.inventory[it.id] = (s.party.inventory[it.id] || 0) + 1; m.equip[slot] = null; s.refreshPartyVisual(); render(); this.refresh(); },
            }, 'Remove') : null);
          }),
        ),
      );
      const spells = knownSpells(g, m);
      if (spells.length) {
        const ci = casting(g, m);
        sheet.appendChild(h('div.spells', h('div.sub', 'Spells: ' + ci.map((c) => `${c.sys.name} (circle ${c.maxSpell})`).join(', ')),
          h('div.spell-tags', ...spells.map((sp) => h('span.tag', { title: sp.desc }, sp.name)))));
      }
      body.appendChild(sheet);
      // inventory
      const inv = s.party.inventory;
      const invList = h('div.inv');
      const items = g.items.filter((it) => inv[it.id] > 0);
      if (!items.length) invList.appendChild(h('p.hint', 'The pack is empty.'));
      for (const it of items) {
        const row = h('div.inv-row', h('span.inv-name', `${it.name} ×${inv[it.id]}`), h('span.inv-stats', itemStats(it)));
        if (['weapon', 'armor', 'shield'].includes(it.type)) {
          const ok = canEquip(g, m, it);
          row.appendChild(h('button' + (ok.ok ? '' : '.disabled'), {
            title: ok.ok ? `Equip on ${m.name}` : ok.why,
            onclick: () => {
              if (!ok.ok) { s.log(ok.why, 'warn'); sfx('error'); return; }
              const old = m.equip[ok.slot];
              if (old) inv[old] = (inv[old] || 0) + 1;
              inv[it.id]--;
              m.equip[ok.slot] = it.id;
              if (it.type === 'weapon' && (it.twoHanded || ['bow', 'crossbow'].includes(it.wkind)) && m.equip.shield) {
                inv[m.equip.shield] = (inv[m.equip.shield] || 0) + 1;
                m.equip.shield = null;
              }
              sfx('click');
              s.refreshPartyVisual();
              render(); this.refresh();
            },
          }, 'Equip'));
        } else if (it.type === 'consumable') {
          row.appendChild(h('button', { onclick: async () => { closeTopModal(); await this.fieldUseItem(it); } }, 'Use'));
        }
        invList.appendChild(row);
      }
      body.appendChild(h('div.inv-wrap', h('div.sub', `Pack — ◆ ${s.party.gold} gold${g.settings.food ? ` · ${s.party.food} food` : ''}`), invList));
      // reorder / dismiss
      const idx = s.party.members.indexOf(m);
      body.appendChild(h('div.party-actions',
        idx > 0 ? h('button', { onclick: () => { s.party.members.splice(idx, 1); s.party.members.splice(idx - 1, 0, m); s.refreshPartyVisual(); render(); this.refresh(); } }, '◀ Move up') : null,
        idx === 0 ? h('span.hint', 'The first hero leads the party.') : null,
      ));
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
<tr><td>I</td><td>Party, equipment &amp; pack</td><td>H</td><td>Hole up (camp &amp; rest)</td></tr>
<tr><td>M</td><td>Map</td><td>Space</td><td>Wait a turn</td></tr>
<tr><td>Ctrl/⌘+S</td><td>Save</td><td>Esc</td><td>Menu</td></tr>
</table>
<h3>Talking</h3>
<p>Type a word to ask about it — <b>NAME</b>, <b>JOB</b> and anything the person mentions. Highlighted words are worth asking about.
Merchants answer to <b>BUY</b>, innkeepers to <b>ROOM</b>, healers to <b>HEAL</b>, and some folk will <b>JOIN</b> your company.</p>
<h3>Battle</h3>
<p>Each hero acts in turn, then the enemy. Move with the arrows and bump a foe to strike. <b>F</b> fires a ranged weapon,
<b>C</b> casts, <b>U</b> uses an item, <b>Space</b> waits. Walk off the edge of the field to flee.</p>
<h3>Survival</h3>
<p>Food runs down as you travel. Swamps may poison you. Rest at inns, or hole up in the wild (if no foes are near).
Forests and mountains block your sight. Carry torches into dark places.</p>`;

export { escapeHtml };
