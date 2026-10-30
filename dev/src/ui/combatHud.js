// The battle HUD: who acts when (the initiative strip), whose turn it is,
// what the active hero can do (the action bar, with reasons when something
// cannot be done), and what will happen if they do it (hover cards with odds
// and damage, move paths and warnings). Also the victory screen and the
// choice of talents on levelling up.
import { h, clear, modal } from './dom.js';
import { icon } from './icons.js';
import { portrait } from '../render/portrait.js';
import {
  maxHp, maxMp, charLook, rangedOf, weaponOf, canCast, classOf, raceOf, xpForLevel, perkChoices, choosePerk, perkOf, heroAbilities,
} from '../game/rules.js';
import { AI_STYLES } from '../data/defaults.js';
import { sfx } from '../core/sound.js';

const hexCss = (n) => '#' + ((n ?? 0xe8c069) >>> 0).toString(16).padStart(6, '0');
const pct = (f) => Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';

export class CombatHud {
  constructor(ui) {
    this.ui = ui;
    this.s = ui.s;
    this.view = ui.view;
    this.root = null;
    this.plates = new Map();
  }

  get b() { return this.s.battle; }
  get game() { return this.s.game; }

  // ------------------------------------------------------------ lifecycle
  start() {
    this.stop();
    this.victoryPending = false;
    this.root = h('div.cbt-overlay');
    this.plateLayer = h('div.cbt-plates');
    this.strip = h('div.cbt-strip');
    this.banner = h('div.cbt-banner');
    this.root.append(this.plateLayer, this.strip, this.banner);
    const box = this.view.container || document.body;
    box.appendChild(this.root);
    // frame the arena below the turn strip (the camera eases in from above)
    this.renderStrip();
    this.frame(true);
    this.b?.fx?.stage?.(this.view.lighting);
    // the turn banner steps aside when someone shouts an ability's name
    this.onCallout = () => this.banner?.classList.remove('show');
    box.addEventListener('fx-callout', this.onCallout);
    if (typeof ResizeObserver !== 'undefined') {
      let last = `${box.clientWidth}x${box.clientHeight}`;
      this.resizer = new ResizeObserver(() => {
        const now = `${box.clientWidth}x${box.clientHeight}`;
        if (now !== last) { last = now; this.frame(false); }
      });
      this.resizer.observe(box);
    }
    this.tip = h('div.cbt-tip');
    this.tip.hidden = true;
    this.ui.root.appendChild(this.tip);
    // leaving the map clears what hovering drew on it
    this.canvas = this.view.renderer?.domElement;
    this.onLeave = () => { this.hideTip(); this.view.setLine?.(null); this.view.showCursor(null); if (this.b?.active && !this.ui.targeting) this.showMoves(this.b.active); };
    this.canvas?.addEventListener('mouseleave', this.onLeave);
    // on a touch screen there is no hovering: the first tap shows what would happen, the second does it
    this.onDown = (e) => { this.lastPointer = { type: e.pointerType, x: e.clientX, y: e.clientY }; };
    this.canvas?.addEventListener('pointerdown', this.onDown);
    const tick = () => {
      if (!this.root) return;
      this.placePlates();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.resizer?.disconnect();
    this.resizer = null;
    if (this.onCallout) (this.view.container || document.body).removeEventListener('fx-callout', this.onCallout);
    this.onCallout = null;
    this.view.safeTop = 0;
    if (this.onLeave) this.canvas?.removeEventListener('mouseleave', this.onLeave);
    if (this.onDown) this.canvas?.removeEventListener('pointerdown', this.onDown);
    this.onLeave = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.root?.remove();
    this.tip?.remove();
    this.root = null;
    this.plates.clear();
  }

  end(summary) {
    this.stop();
    this.hideTip();
    this.view.setLine?.(null);
    // the level-up card waits for this window (it offers the same talents)
    this.victoryPending = summary?.outcome === 'victory';
    if (this.victoryPending) this.vicTimer = setTimeout(() => { this.vicTimer = 0; this.showVictory(summary); }, 950);
  }

  event(type, data) {
    if (!this.root) return;
    if (type === 'turn') {
      this.showBanner(data);
      this.renderStrip();
      this.refreshPlates();
      if (data?.side !== 'party') this.renderBar();
    }
    else if (type === 'busy') { if (!data) this.renderBar(); else this.cmdEl?.classList.add('busy'); }
    else if (type === 'start' || type === 'round' || type === 'death' || type === 'update' || type === 'moved') this.schedule();
  }

  // many updates arrive in a burst: redraw once per frame
  schedule() {
    if (this.pendingDraw) return;
    this.pendingDraw = requestAnimationFrame(() => {
      this.pendingDraw = null;
      this.renderStrip();
      this.refreshPlates();
    });
  }

  // Fit the whole arena between the turn strip and the prompt at the map's
  // foot, so no fighter (nor the bar over its head) stands under either.
  // Floating words keep below the strip too (view.safeTop).
  frame(settle) {
    const b = this.b, v = this.view;
    if (!b?.arena || !v.frameArea || !this.strip) return;
    const box = (v.container || document.body).getBoundingClientRect();
    const below = Math.max(0, this.strip.getBoundingClientRect().bottom - box.top);
    v.safeTop = below + 2;
    if (this.banner) this.banner.style.top = `${Math.round(below + 4)}px`;
    const r = v.rig, k = settle && r ? r.dist / Math.max(1e-6, r.tdist) : 1;
    v.frameArea(0, 0, b.arena.w, b.arena.h, { left: 10, right: 10, top: below + 30, bottom: 40 });
    if (k > 1) r.dist = r.tdist * k;
  }

  // ------------------------------------------------------------ initiative strip
  lookOf(u) { return u.side === 'party' ? charLook(this.game, u.member) : (u.def.look || { kind: 'blob' }); }
  picOf(u) { try { return portrait(this.view, this.lookOf(u)); } catch { return ''; } }

  renderStrip() {
    const b = this.b;
    if (!b || !this.strip) return;
    clear(this.strip);
    const list = b.upcoming(11);
    let last = list[0]?.round;
    for (const it of list) {
      if (it.round !== last) { this.strip.appendChild(h('div.cbt-round', { title: `Round ${it.round}` }, `R${it.round}`)); last = it.round; }
      this.strip.appendChild(this.chip(it.u, it.now));
    }
  }

  chip(u, now) {
    const b = this.b;
    const frac = b.hpOf(u) / Math.max(1, b.maxHpOf(u));
    const pic = this.picOf(u);
    const st = b.statusList(u);
    const el = h('div.cbt-chip.' + u.side + (now ? '.now' : '') + (u.charging ? '.warn' : ''),
      pic ? h('img', { src: pic, alt: '' }) : h('span.ch-blank', u.name[0]),
      h('div.ch-hp', h('i', { style: { width: pct(frac) } })),
      now ? h('span.ch-now', u.side === 'party' ? 'YOUR TURN' : 'NOW') : null,
      u.tag ? h('span.ch-tag', u.tag) : null,
      u.charging ? h('span.ch-warn', icon('warn')) : null,
      st.length ? h('span.ch-st', ...st.slice(0, 2).map((s) => h('i', { style: { color: s.def.color } }, icon(s.def.icon)))) : null);
    el.addEventListener('mouseenter', (e) => {
      this.view.showCursor(u.x, u.y, u.side === 'enemy' ? 0xff6050 : 0x80ff80);
      this.showTip(this.unitCard(u, this.previewFor(u)), e.clientX, e.clientY + 40);
    });
    el.addEventListener('mouseleave', () => { this.hideTip(); this.view.showCursor(null); });
    return el;
  }

  showBanner(u) {
    const b = this.b;
    if (!this.banner || !u) return;
    clear(this.banner);
    const mine = u.side === 'party';
    this.banner.className = 'cbt-banner ' + (mine ? 'party' : 'enemy');
    this.banner.appendChild(h('span.bn-name', mine ? `${u.name}'s turn` : b.The(u)));
    if (!mine) this.banner.appendChild(h('span.bn-sub', ' acts'));
    void this.banner.offsetWidth; // restart the animation
    this.banner.classList.add('show');
  }

  // ------------------------------------------------------------ plates over figures
  refreshPlates() {
    const b = this.b;
    if (!b || !this.plateLayer) return;
    const live = new Set();
    for (const u of b.units) {
      if (!b.alive(u)) continue;
      live.add(u.id);
      let p = this.plates.get(u.id);
      if (!p) {
        p = { el: h('div.cbt-plate.' + u.side), u };
        this.plates.set(u.id, p);
        this.plateLayer.appendChild(p.el);
      }
      const frac = b.hpOf(u) / Math.max(1, b.maxHpOf(u));
      const st = b.statusList(u);
      const sig = [frac, u === b.current, !!u.charging, st.map((s) => s.id + s.rounds).join()].join('|');
      if (sig === p.sig) continue;
      p.sig = sig;
      clear(p.el);
      p.el.classList.toggle('now', u === b.current);
      p.el.appendChild(h('div.pl-in',
        u === b.current ? h('div.pl-now', '▼') : null,
        u.charging ? h('div.pl-warn', icon('warn')) : null,
        st.length ? h('div.pl-st', ...st.slice(0, 3).map((s) => this.badge(s)), st.length > 3 ? h('span.pl-more', `+${st.length - 3}`) : null) : null,
        h('div.pl-hp' + (frac <= 0.25 ? '.low' : frac <= 0.5 ? '.mid' : ''), h('i', { style: { width: pct(frac) } }))));
    }
    for (const [id, p] of this.plates) if (!live.has(id)) { p.el.remove(); this.plates.delete(id); }
  }

  // A condition as it shows over a head: its sign in its colour and the turns
  // it has left. The hover card repeats the same badge beside its name (the legend).
  badge(s) {
    // a condition that lasts the whole fight (a boss's rage) shows no count
    const el = h('span.st-badge', icon(s.def.icon), s.rounds && s.rounds < 20 ? h('b', String(s.rounds)) : null);
    el.style.setProperty('--c', s.def.color);
    return el;
  }

  placePlates() {
    for (const p of this.plates.values()) {
      const pos = this.view.entityScreenPos?.(p.u.id);
      if (!pos || pos.behind) { p.el.style.display = 'none'; continue; }
      p.el.style.display = '';
      p.el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    }
  }

  // ------------------------------------------------------------ action bar
  commands(cmdEl) {
    this.cmdEl = cmdEl;
    this.renderBar();
  }

  renderBar() {
    const el = this.cmdEl;
    const b = this.b;
    if (!el) return;
    clear(el);
    el.classList.remove('busy');
    const bar = h('div.cbt-bar');
    el.appendChild(bar);
    const u = b?.active;
    if (!b || !u) {
      const cur = b?.current;
      bar.classList.add('waiting');
      bar.append(h('div.cbt-waiting', cur ? h('span', cur.side === 'enemy' ? `${b.The(cur)} is acting…` : `${cur.name}…`) : h('span', 'The battle is joined…'),
        h('button.cbt-help', { onclick: () => this.ui.openHelp() }, '? How battles work')));
      return;
    }
    const g = this.game, m = u.member;
    const mv = u.moves || 0;
    const rw = rangedOf(g, m), w = weaponOf(g, m);
    const targets = b.attackTargets(u);
    const head = h('div.cbt-who',
      h('b', `${u.name}'s turn`),
      h('span', `${raceOf(g, m).name} ${classOf(g, m).name} · HP ${m.hp}/${maxHp(g, m)}${maxMp(g, m) ? ` · MP ${m.mp}/${maxMp(g, m)}` : ''} · Armour ${b.acOf(u)}`),
      h('button.cbt-help', { title: 'How battles work (?)', onclick: () => this.ui.openHelp() }, '?'));
    const row = h('div.cbt-btns');
    bar.append(head, row);
    const add = (o) => row.appendChild(this.button(o));
    const pinned = b.has(u, 'rooted');
    add({
      icon: 'move', name: 'Move', key: '←↑→', sub: pinned ? 'Pinned!' : `${mv} of ${u.maxMoves} left`, off: mv <= 0,
      why: pinned ? 'Pinned in place: you can still fight.' : 'No moves left this turn.',
      tip: 'Click a blue square, or use the arrow keys. Amber squares mean breaking away from a foe — it gets a free strike. Walk off the edge of the field to flee.',
      onClick: () => this.ui.hint('Click a blue square to move there.'),
    });
    const adjFoe = targets.some((t) => b.adjacent(u, t));
    add({
      icon: rw && !adjFoe ? 'bow' : 'sword', name: rw && !adjFoe ? 'Shoot' : 'Attack', key: 'F', off: !targets.length,
      sub: targets.length ? `${targets.length} in reach` : 'None in reach',
      why: rw ? `No foe beside you or within ${b.weaponRange(u)} squares with a clear line.` : 'No foe beside you — move next to one, or carry a bow.',
      tip: `Strike with your ${w.name}${rw ? `, or shoot with your ${rw.name} (range ${b.weaponRange(u)})` : ''}. You can also just click a foe. Hover a foe to see your odds.`,
      onClick: () => this.beginAttack(),
    });
    row.style.setProperty('--cols', String(Math.max(5, Math.ceil((6 + heroAbilities(g, m).length) / 2))));
    heroAbilities(g, m).forEach((ab, i) => {
      const special = b.isSpecial(u, ab);
      const can = b.canUseAbility(u, ab);
      const tags = [ab.free ? 'Free action' : null, ab.perBattle ? 'Once per battle' : ab.cooldown ? `Cooldown ${ab.cooldown}` : null].filter(Boolean).join(' · ');
      add({
        icon: ab.icon, name: ab.name, key: special ? 'Q' : String(i + 1), color: ab.fx, special, off: !can.ok, cd: can.cd,
        sub: can.ok ? (ab.free ? 'Free action' : special ? '1 per battle' : 'Ready') : can.short, why: can.why,
        tip: `${ab.desc}${tags ? `\n${tags}` : ''}`,
        onClick: () => this.beginAbility(ab),
        onHover: (on) => this.previewArea(on ? ab : null),
      });
    });
    const spells = b.combatSpells(u);
    const inv = this.s.party.inventory;
    const castable = spells.filter((sp) => canCast(g, m, sp, inv).ok);
    add({
      icon: 'wand', name: 'Cast', key: 'C', off: !castable.length,
      sub: !spells.length ? 'No spells' : maxMp(g, m) ? `MP ${m.mp}/${maxMp(g, m)}` : `${castable.length} ready`,
      why: !spells.length ? `${u.name} knows no battle magic.` : 'Not enough mana or reagents for any spell.',
      tip: 'Cast a spell from your book. Spells cost mana (or reagents for Rune-craft).',
      onClick: () => this.cast(),
    });
    const items = b.combatItems();
    const nItems = items.reduce((t, it) => t + (inv[it.id] || 0), 0);
    add({
      icon: 'potion', name: 'Item', key: 'U', off: !items.length, sub: items.length ? `${nItems} to hand` : 'Nothing to use',
      why: 'Nothing useful in the pack.', tip: 'Drink a draught or use a feather on yourself or a companion.', onClick: () => this.useItem(),
    });
    add({ icon: 'shield', name: 'Guard', key: 'G', sub: '+3 armour', tip: 'Brace yourself: +3 armour until the end of your next turn. Ends your turn.', onClick: () => b.actGuard(u) });
    add({ icon: 'end', name: 'End turn', key: 'Space', sub: mv > 0 ? 'Skip the rest' : 'Done', tip: 'End this hero\'s turn.', onClick: () => b.actPass() });
  }

  button(o) {
    // the icon with its key beneath it on the left; the name (two lines if it
    // must) and what stands in the way on the right, so nothing is cut short
    const el = h('button.cbt-btn' + (o.off ? '.off' : '') + (o.special ? '.special' : ''),
      h('span.cb-side', h('span.cb-ico', icon(o.icon)), h('span.cb-key', o.key), o.cd ? h('span.cb-cd', String(o.cd)) : null),
      h('span.cb-text', h('span.cb-name', o.name), h('span.cb-sub', o.sub || '')));
    if (o.color != null) el.style.setProperty('--accent', hexCss(o.color));
    el.addEventListener('click', () => {
      if (o.off) { this.s.log(o.why || 'Not now.', 'warn'); sfx('error'); return; }
      sfx('click');
      this.hideTip();
      o.onClick && o.onClick();
    });
    el.addEventListener('mouseenter', () => {
      const r = el.getBoundingClientRect();
      const card = h('div.tc-btn', h('div.tc-title', h('b', o.name), h('span.tc-key', o.key)),
        h('p', ...String(o.tip || '').split('\n').map((t, i) => (i ? [h('br'), h('i', t)] : t))),
        o.off && o.why ? h('p.tc-why', o.why) : null);
      this.showTip(card, r.left, r.top - 8, 'above');
      o.onHover && o.onHover(true);
    });
    el.addEventListener('mouseleave', () => { this.hideTip(); o.onHover && o.onHover(false); });
    return el;
  }

  // While hovering an ability, light up whom it would touch
  previewArea(ab) {
    const b = this.b, u = b?.active;
    if (!u || this.ui.targeting) return;
    if (!ab) { this.showMoves(u); return; }
    const tg = b.abilityTargets(u, ab);
    const units = tg.units || [];
    const cells = tg.tiles ? tg.tiles : units.map((t) => ({ x: t.x, y: t.y }));
    if (ab.target === 'nearbyFoes' || ab.target === 'nearbyAllies') {
      const r = ab.radius ?? 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) cells.push({ x: u.x + dx, y: u.y + dy, color: 0x806040 });
    }
    this.view.setHighlights(cells.map((c) => ({ ...c, color: c.color ?? ab.fx ?? 0xffc030 })), ab.fx ?? 0xffc030, 0.42);
  }

  // ------------------------------------------------------------ turn changes
  turn(u) {
    this.armed = null;
    this.hideTip();
    this.view.setLine?.(null);
    this.ui.targeting = null;
    this.ui.pendingDir = null;
    const ui = this.ui;
    if (u && u.member !== ui.selected) { ui.selected = u.member; ui.refreshHero(); }
    ui.refreshParty();
    this.renderBar();
    this.refreshPlates();
    const b = this.b;
    if (!u || !b) { this.view.setHighlights(null); this.view.setLine?.(null); ui.hint(''); return; }
    const mv = u.moves || 0;
    ui.hint(`${mv ? 'Click a blue square to move, ' : ''}a red foe to attack, or choose an action. Hover for odds.`);
    this.showMoves(u);
  }

  // blue: squares in reach; amber: squares where a foe gets a free strike; red: foes in reach
  showMoves(u) {
    const b = this.b;
    if (!b || b.active !== u) return;
    const cells = [];
    for (const c of b.reachable(u).values()) {
      if (c.d === 0 || c.ally) continue;
      cells.push({ x: c.x, y: c.y, color: this.pathProvokes(u, c.x, c.y).length ? 0xff8a2a : 0x50a0ff });
    }
    for (const e of b.attackTargets(u)) cells.push({ x: e.x, y: e.y, color: 0xff4030 });
    this.view.setHighlights(cells, 0x50a0ff, 0.34);
  }

  pathProvokes(u, x, y) {
    const b = this.b;
    const path = b.pathTo(u, x, y);
    if (!path) return [];
    const out = new Set();
    let from = { x: u.x, y: u.y };
    for (const [px, py] of path.slice(1)) {
      for (const f of b.provokers(u, px, py, from)) out.add(f);
      from = { x: px, y: py };
    }
    return [...out];
  }

  // ------------------------------------------------------------ hover
  previewFor(unit) {
    const b = this.b, u = b?.active;
    if (!u || unit.side === u.side) return null;
    return b.canAttack(u, unit) ? b.preview(u, unit) : null;
  }

  hover(t, e) {
    const b = this.b;
    if (!b || !t) { this.hideTip(); this.view.showCursor(null); return; }
    const u = b.active;
    const unit = b.unitAt(t.x, t.y);
    const tg = this.ui.targeting;
    const at = (card) => this.showTip(card, e.clientX + 18, e.clientY + 16);
    if (tg) {
      const valid = this.ui.targetValid(t);
      this.view.showCursor(t.x, t.y, valid ? 0xffe040 : 0x808080);
      this.view.setLine?.(null);
      if (valid && unit && u) at(this.unitCard(unit, b.preview(u, unit, tg.ab || null), tg.label));
      else if (valid) at(h('div.tc-move', h('b', tg.label), h('span', ' — here')));
      else this.hideTip();
      return;
    }
    if (unit) {
      const attackable = u && unit.side === 'enemy' && b.canAttack(u, unit);
      this.view.showCursor(t.x, t.y, unit.side === 'enemy' ? (attackable ? 0xff4040 : 0xffffff) : 0x80ff80);
      this.view.setLine?.(null);
      at(this.unitCard(unit, attackable ? b.preview(u, unit) : null));
      return;
    }
    const danger = b.units.find((x) => b.alive(x) && x.charging && x.charging.tiles.some((c) => c.x === t.x && c.y === t.y));
    const lines = [];
    if (danger) lines.push(h('p.tc-why', icon('warn'), ` ${danger.charging.ab.name} lands here when ${b.the(danger)} next acts!`));
    if (u && !b.acting) {
      const path = b.pathTo(u, t.x, t.y);
      if (path) {
        const n = path.length - 1;
        this.view.showCursor(t.x, t.y, 0x80c8ff);
        this.view.setLine?.(path.map(([x, y]) => ({ x, y })), 0xbfe4ff);
        const prov = this.pathProvokes(u, t.x, t.y);
        const cover = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b.obstacle(t.x + dx, t.y + dy));
        at(h('div.tc-move', h('b', `Move ${n} square${n > 1 ? 's' : ''}`), h('span', ` · ${u.moves - n} left after`),
          prov.length ? h('p.tc-why', icon('warn'), ` Breaking away: ${prov.map((f) => b.the(f)).join(', ')} ${prov.length > 1 ? 'get free strikes' : 'gets a free strike'}.`) : null,
          cover ? h('p.tc-good', icon('shield'), ' Beside cover: missiles from that side are −3 to hit.') : null,
          ...lines));
        return;
      }
    }
    this.view.setLine?.(null);
    this.view.showCursor(t.x, t.y, 0x707070);
    if (lines.length) at(h('div.tc-move', ...lines));
    else if (u && b.obstacle(t.x, t.y)) at(h('div.tc-move', h('span', this.s.describeTile ? 'Impassable — but it gives cover beside it.' : 'Impassable.')));
    else this.hideTip();
  }

  unitCard(unit, pv, label) {
    const b = this.b, g = this.game;
    const enemy = unit.side === 'enemy';
    const hp = b.hpOf(unit), mhp = b.maxHpOf(unit);
    const pic = this.picOf(unit);
    let sub, stats;
    if (enemy) {
      const d = unit.def;
      const ai = b.aiOf(d);
      sub = `Level ${d.level || 1}${d.undead ? ' · Undead' : ''}${d.boss ? ' · Boss' : ''}`;
      stats = [`Armour ${b.acOf(unit)}`, `Attack +${d.hit || 0} · ${d.dmg}${(d.range || 1) > 1 ? ` · range ${d.range}` : ''}`];
      const abil = (d.abilities || []).map((id) => b.abilitiesOf(unit).find((a) => a.id === id)?.name).filter(Boolean);
      const eye = !unit.charging && b.pickTarget ? b.pickTarget(unit, ai) : null;
      return h('div.tc-unit.enemy',
        h('div.tc-head', pic ? h('img', { src: pic }) : null, h('div', h('b', b.label(unit)), h('span.tc-sub', sub))),
        this.hpBar(hp, mhp),
        h('div.tc-stats', ...stats.map((s) => h('span', s))),
        h('p.tc-ai', ...((AI_STYLES[ai] || ai).match(/^([^:]*):\s*(.*)$/) || [null, ai, '']).slice(1).map((t, i) => (i ? ` — ${t}` : h('b', t)))),
        abil.length ? h('p.tc-abil', 'Abilities: ', abil.join(', ')) : null,
        this.statusRows(unit),
        unit.charging ? h('p.tc-why', icon('warn'), ` Preparing ${unit.charging.ab.name}: it lands on the marked squares when it next acts. ${unit.charging.ab.desc}`) : null,
        eye && !this.ui.targeting ? h('p.tc-eye', `Has its eye on ${eye.name}.`) : null,
        this.previewBlock(pv, label, unit) || this.reachNote(unit));
    }
    const m = unit.member;
    return h('div.tc-unit.party',
      h('div.tc-head', pic ? h('img', { src: pic }) : null, h('div', h('b', m.name), h('span.tc-sub', `Level ${m.level} ${raceOf(g, m).name} ${classOf(g, m).name}`))),
      this.hpBar(hp, mhp),
      h('div.tc-stats', h('span', `Armour ${b.acOf(unit)}`), maxMp(g, m) ? h('span', `MP ${m.mp}/${maxMp(g, m)}`) : null),
      this.statusRows(unit),
      this.previewBlock(pv, label, unit));
  }

  // when the active hero cannot strike this foe: what could reach it, or how far it is
  reachNote(unit) {
    const b = this.b, u = b?.active;
    if (!u || this.ui.targeting || unit.side === u.side) return null;
    const abs = heroAbilities(this.game, u.member);
    for (const ab of abs) {
      if (!b.canUseAbility(u, ab).ok || !(b.abilityTargets(u, ab).units || []).includes(unit)) continue;
      return this.previewBlock(b.preview(u, unit, ab), `${ab.name} (${b.isSpecial(u, ab) ? 'Q' : abs.filter((a) => !b.isSpecial(u, a)).indexOf(ab) + 1})`, unit);
    }
    const why = this.whyNot(u, unit);
    return h('p.tc-why', why[0].toUpperCase() + why.slice(1));
  }

  // Why u cannot strike t from where it stands: a blocked line of fire, out of
  // a bow's range, corner to corner, or simply too far
  whyNot(u, t) {
    const b = this.b;
    const d = b.dist(u, t), range = b.weaponRange(u);
    const mv = u.moves ? ` (you can move ${u.moves})` : '';
    if (range > 1 && d <= range) {
      const blk = b.lineBlocker?.(u, t);
      return `line of fire blocked${blk ? ` by ${String(blk.t.name).toLowerCase()}` : ''} — move for a clear shot${mv}.`;
    }
    if (d === 1) return `corner to corner — step beside ${b.the(t)} to strike.`;
    const rw = rangedOf(this.game, u.member);
    if (range > 1) return `out of range: ${d} squares away, your ${rw ? rw.name : 'missile'} reaches ${range}${mv}.`;
    return `out of reach: ${d} squares away${mv}.`;
  }

  hpBar(hp, mhp) {
    const f = hp / Math.max(1, mhp);
    return h('div.tc-hp' + (f <= 0.25 ? '.low' : f <= 0.5 ? '.mid' : ''), h('i', { style: { width: pct(f) } }), h('span', `${Math.max(0, hp)} / ${mhp}`));
  }

  // The conditions on a figure, each beside the badge it wears over its head
  statusRows(unit) {
    const st = this.b.statusList(unit);
    if (!st.length) return null;
    return h('div.tc-status', ...st.map((s) => h('div.tc-st-row', this.badge(s),
      h('div', h('b', { style: { color: s.def.color } }, s.def.name),
        h('span', `${s.power && ['blessed', 'shielded'].includes(s.id) ? ` +${s.power}` : ''}${s.rounds >= 20 ? ' · for the whole fight' : s.rounds ? ` · ${s.rounds} turn${s.rounds > 1 ? 's' : ''} left` : ''} — ${s.def.desc}`)))),
      h('div.tc-st-note', 'Badges over heads: sign of the condition, and the turns it has left.'));
  }

  previewBlock(pv, label, unit) {
    if (!pv) return null;
    if (pv.heal) return h('div.tc-pv.heal', h('b', `${label ? label + ': ' : ''}+${pv.lo}${pv.hi !== pv.lo ? '–' + pv.hi : ''} health`));
    if (pv.effect) return h('div.tc-pv', h('b', label || 'Target'));
    const chance = Math.round(pv.chance * 100);
    return h('div.tc-pv' + (chance >= 70 ? '.good' : chance >= 45 ? '.ok' : '.bad'),
      h('div.pv-main', h('b', `${chance}%`), h('span', ' to hit'), h('b', ` ${pv.lo}${pv.hi !== pv.lo ? '–' + pv.hi : ''}`), h('span', ' damage'),
        pv.hi >= this.b.hpOf(unit) ? h('em', pv.lo >= this.b.hpOf(unit) ? ' · deadly' : ' · could kill') : null),
      h('div.pv-sub', `${label || (pv.ranged ? `Shoot (${pv.weapon})` : `Strike (${pv.weapon})`)}${pv.crit && pv.crit < 1 ? ` · ${Math.round(pv.crit * 100)}% critical` : ''}`),
      pv.notes.length ? h('div.pv-notes', ...pv.notes.map((n) => h('span' + (/[−]|Lucky|Cover|Engaged|Weakened/.test(n) ? '.neg' : ''), n))) : null);
  }

  showTip(card, x, y, mode) {
    const tip = this.tip;
    if (!tip) return;
    clear(tip);
    tip.appendChild(card);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x, top = y;
    if (mode === 'above') top = y - r.height;
    left = Math.max(6, Math.min(left, window.innerWidth - r.width - 6));
    if (top + r.height > window.innerHeight - 6) top = Math.max(6, y - r.height - 30);
    tip.style.left = left + 'px';
    tip.style.top = Math.max(6, top) + 'px';
  }

  hideTip() { if (this.tip) this.tip.hidden = true; }

  // ------------------------------------------------------------ input
  click(t) {
    const b = this.b;
    if (!b.active || b.acting) return;
    const ui = this.ui;
    const lp = this.lastPointer;
    if (lp?.type === 'touch') {
      const key = `${t.x},${t.y}`;
      if (this.armed !== key) {
        this.armed = key;
        this.hover(t, { clientX: lp.x, clientY: lp.y - 60 });
        return;
      }
      this.armed = null;
      this.hideTip();
    }
    if (ui.targeting) {
      if (ui.targetValid(t)) ui.pickTarget(t);
      else sfx('error');
      return;
    }
    const u = b.active;
    const other = b.unitAt(t.x, t.y);
    if (other && other.side === 'enemy') {
      if (b.canAttack(u, other)) b.actAttack(other, u);
      else { this.s.log(`${b.The(other)}: ${this.whyNot(u, other)}`, 'warn'); sfx('error'); }
      return;
    }
    const dx = t.x - u.x, dy = t.y - u.y;
    if (Math.abs(dx) + Math.abs(dy) === 1 && other) { b.actMove(dx, dy); return; } // swap with an ally
    if (b.pathTo(u, t.x, t.y)) { this.view.setLine?.(null); this.hideTip(); b.actMoveTo(t.x, t.y, u); }
    else if (dx || dy) sfx('bump');
  }

  key(e, dir) {
    const b = this.b;
    if (!b || !b.active || b.acting) return;
    const ui = this.ui;
    if (ui.targeting) {
      if (e.key === 'Tab') { e.preventDefault(); ui.cycleTarget(e.shiftKey ? -1 : 1); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') { e.preventDefault(); ui.confirmTarget(); return; }
      if (dir) {
        e.preventDefault();
        const c = ui.targeting.cursor || { x: b.active.x, y: b.active.y };
        ui.targeting.cursor = { x: c.x + dir[0], y: c.y + dir[1] };
        this.view.showCursor(ui.targeting.cursor.x, ui.targeting.cursor.y, ui.targetValid(ui.targeting.cursor) ? 0xffe040 : 0x808080);
        return;
      }
      return;
    }
    if (dir) { e.preventDefault(); this.hideTip(); b.actMove(dir[0], dir[1]); return; }
    const k = e.key.toLowerCase();
    const u = b.active;
    const abs = heroAbilities(this.game, u.member);
    const skills = abs.filter((ab) => !b.isSpecial(u, ab));
    const press = (fn) => { e.preventDefault(); this.hideTip(); fn(); };
    if (k === 'f') press(() => this.beginAttack());
    else if (k === 'c') press(() => this.cast());
    else if (k === 'u') press(() => this.useItem());
    else if (k === 'q') press(() => { const sp = abs.find((ab) => b.isSpecial(u, ab)); if (sp) this.beginAbility(sp); else { this.s.log('No special ability.', 'warn'); sfx('error'); } });
    else if (k === 'g') press(() => b.actGuard(u));
    else if (/^[1-4]$/.test(k) && skills[+k - 1]) press(() => this.beginAbility(skills[+k - 1]));
    else if (k === '?') press(() => ui.openHelp());
    else if (k === ' ' || k === '.') press(() => b.actPass());
  }

  // ------------------------------------------------------------ actions that need a target
  beginAttack() {
    const b = this.b;
    if (!b || !b.active) return;
    const u = b.active;
    const targets = b.attackTargets(u);
    if (!targets.length) { this.s.log('No foe within reach. Move closer, or use a ranged weapon.', 'warn'); sfx('error'); return; }
    this.ui.startTargeting({ units: targets, label: 'Attack', color: 0xff5040, onPick: (t) => b.actAttack(b.unitAt(t.x, t.y), u) });
  }

  beginAbility(ab) {
    const b = this.b;
    if (!b || !b.active || b.acting) return;
    const u = b.active;
    const can = b.canUseAbility(u, ab);
    if (!can.ok) { this.s.log(can.why, 'warn'); sfx('error'); return; }
    const tg = b.abilityTargets(u, ab);
    if (tg.kind === 'enemy' || tg.kind === 'ally') {
      this.ui.startTargeting({ units: tg.units, label: ab.name, color: ab.fx ?? 0xffc030, ab, onPick: (t) => b.actAbility(ab, b.unitAt(t.x, t.y), u) });
    } else if (tg.kind === 'tile') {
      this.ui.startTargeting({ tiles: tg.tiles, label: ab.name, color: ab.fx ?? 0xb090ff, ab, onPick: (t) => b.actAbility(ab, { x: t.x, y: t.y }, u) });
    } else b.actAbility(ab, null, u);
  }

  async cast() {
    const b = this.b;
    if (!b || !b.active || b.acting) return;
    const u = b.active, ui = this.ui;
    const spells = b.combatSpells(u);
    if (!spells.length) { this.s.log(`${u.name} knows no battle magic.`, 'warn'); return; }
    const spell = await ui.chooseSpell(u.member, spells);
    if (!spell || b.active !== u || this.s.battle !== b) return;
    const can = canCast(this.game, u.member, spell, this.s.party.inventory);
    if (!can.ok) { this.s.log(can.why, 'warn'); sfx('error'); return; }
    if (spell.target === 'enemy') {
      const ts = b.spellTargets(u, spell);
      if (!ts.length) { this.s.log('No foe in sight for that spell.', 'warn'); return; }
      ui.startTargeting({ units: ts, label: spell.name, color: spell.fx, onPick: (t) => b.actCast(spell, b.unitAt(t.x, t.y), u) });
    } else if (spell.target === 'area') {
      const tiles = [];
      const r = spell.range || 7;
      for (let y = 0; y < b.arena.h; y++) for (let x = 0; x < b.arena.w; x++) if (Math.max(Math.abs(x - u.x), Math.abs(y - u.y)) <= r) tiles.push({ x, y });
      ui.startTargeting({ tiles, label: `${spell.name} (area)`, color: spell.fx, onPick: (t) => b.actCast(spell, { x: t.x, y: t.y }, u) });
      this.view.setHighlights(tiles.filter((c) => b.unitAt(c.x, c.y)?.side === 'enemy'), spell.fx || 0xffc030, 0.45);
    } else if (spell.target === 'ally') {
      const ts = b.spellTargets(u, spell);
      if (!ts.length) { this.s.log(spell.effect === 'revive' ? 'No one has fallen.' : 'No one to target.', 'warn'); return; }
      const pick = await ui.chooseFrom(`${spell.name} — on whom?`, targetChoices(this.game, ts, spell.effect));
      if (pick) b.actCast(spell, pick, u);
    } else {
      b.actCast(spell, null, u);
    }
  }

  async useItem() {
    const b = this.b;
    if (!b || !b.active || b.acting) return;
    const u = b.active, ui = this.ui;
    const items = b.combatItems();
    if (!items.length) { this.s.log('You have nothing useful to hand.', 'warn'); return; }
    const inv = this.s.party.inventory;
    const item = await ui.chooseFrom('Use which item?', items.map((it) => ({ label: `${it.name} ×${inv[it.id]}`, sub: it.desc, value: it })));
    if (!item) return;
    const ts = b.partyUnits.filter((p) => (item.effect === 'revive' ? p.dead && !p.fled : b.alive(p)));
    const tgt = await ui.chooseFrom(`${item.name} — on whom?`, targetChoices(this.game, ts, item.effect));
    if (tgt) b.actUse(item, tgt, u);
  }

  // ------------------------------------------------------------ after the battle
  showVictory(sum) {
    const levelled = sum.heroes.some((x) => x.levels.length);
    // Men learn a tenth faster, so "each" can be a range
    const gains = sum.heroes.filter((x) => !x.fallen).map((x) => x.gained);
    const lo = gains.length ? Math.min(...gains) : sum.xp, hi = gains.length ? Math.max(...gains) : sum.xp;
    const body = h('div.vic',
      h('div.vic-stats',
        h('span', h('b', String(sum.slain)), ` foe${sum.slain === 1 ? '' : 's'} slain`),
        h('span', h('b', String(sum.rounds)), ` round${sum.rounds === 1 ? '' : 's'}`),
        h('span.gold', h('b', `◆ ${sum.gold}`), ' gold'),
        h('span', { title: lo !== hi ? 'Men, quick to learn, gain a tenth more' : null }, h('b', lo !== hi ? `+${lo}–${hi}` : `+${lo}`), ' experience each')),
      sum.loot.length ? h('div.vic-loot', h('span.vl-label', 'Spoils'), ...sum.loot.map((n) => h('span.vic-item', icon('potion'), ' ', n))) : null,
      h('div.vic-heroes', ...sum.heroes.map((x) => this.heroRow(x))));
    modal(body, { title: '⚔ Victory!', cls: 'victory-modal' + (levelled ? ' levelled' : ''), buttons: [{ label: 'Onward', primary: true }], onClose: () => { this.victoryPending = false; this.ui.refresh(); } });
    if (levelled) setTimeout(() => sfx('level'), 350);
  }

  heroRow(x) {
    const g = this.game, m = x.member;
    const pic = (() => { try { return portrait(this.view, charLook(g, m)); } catch { return ''; } })();
    const prog = (lv, xp) => {
      const a = xpForLevel(lv), z = xpForLevel(lv + 1);
      return isFinite(z) ? Math.max(0, Math.min(1, (xp - a) / Math.max(1, z - a))) : 1;
    };
    const fill = h('i', { style: { width: pct(prog(x.from.level, x.from.xp)) } });
    // grow the bar to its new length once the window is up
    setTimeout(() => { fill.style.width = x.levels.length ? '100%' : pct(prog(m.level, m.xp)); }, 120);
    if (x.levels.length) setTimeout(() => { fill.style.transition = 'none'; fill.style.width = '0%'; requestAnimationFrame(() => { fill.style.transition = ''; fill.style.width = pct(prog(m.level, m.xp)); }); }, 1100);
    const row = h('div.vic-hero' + (x.levels.length ? '.up' : ''),
      pic ? h('img', { src: pic, alt: '' }) : null,
      h('div.vh-body',
        h('div.vh-head', h('b', m.name), h('span', `+${x.gained} XP`), x.fallen ? h('span.vh-lv', 'Fallen: half experience') : x.levels.length ? h('span.vh-up', `LEVEL UP! Now level ${m.level}`) : h('span.vh-lv', `Level ${m.level}`)),
        h('div.vh-xp', fill),
        x.levels.length ? h('div.vh-perks') : null));
    const slot = row.querySelector('.vh-perks');
    if (slot) this.fillPerks(slot, m);
    return row;
  }

  fillPerks(slot, m) {
    clear(slot);
    slot.appendChild(perkPicker(this.ui, m, () => this.fillPerks(slot, m)));
  }
}

// Whom a draught, tonic, feather or healing spell can go to: anyone, but those
// it would be wasted on are greyed out with the reason, and the hurt come first
function targetChoices(game, units, effect) {
  const opt = (t) => {
    const m = t.member, mh = maxHp(game, m), mm = maxMp(game, m);
    let why = '';
    if (effect === 'heal' && !t.dead && m.hp >= mh) why = 'Already at full health';
    else if (effect === 'mp' && m.mp >= mm) why = mm ? 'Mana already full' : 'Has no mana';
    else if (effect === 'cure' && m.status !== 'poisoned') why = 'Not poisoned';
    return { label: `${t.name} (${m.hp}/${mh} HP${t.dead ? ', fallen' : ''})`, tag: why || null, sub: why ? null : effect === 'heal' ? `Missing ${mh - m.hp} health` : null, value: t, disabled: !!why, why, need: m.hp / Math.max(1, mh) };
  };
  return units.map(opt).sort((a, b) => a.disabled - b.disabled || a.need - b.need);
}

// The choice of talent for a hero with one pending (or a note of what was learned)
export function perkPicker(ui, m, after) {
  const g = ui.s.game;
  if (!(m.perkPending > 0)) {
    const last = perkOf((m.perks || [])[m.perks.length - 1]);
    return h('div.perk-done', last ? [icon(last.icon), ` Learned ${last.name}: ${last.desc}`] : '');
  }
  const opts = perkChoices(g, m);
  return h('div.perk-pick',
    h('div.pp-title', `Choose a talent${m.perkPending > 1 ? ` (${m.perkPending} to choose)` : ''}:`),
    h('div.pp-opts', ...opts.map((p) => h('button.perk', {
      title: p.desc,
      onclick: (e) => {
        e.stopPropagation();
        if (!choosePerk(g, m, p.id)) return;
        sfx('level');
        ui.refresh();
        after && after();
      },
    }, h('span.pk-ico', icon(p.icon)), h('b', p.name), h('span', p.desc)))));
}

// The hero sheet's battle section: skills, special, talents (and a pending choice)
export function sheetAbilities(ui, m, onChange) {
  const g = ui.s.game, b = ui.s.battle;
  const bu = b?.partyUnits.find((u) => u.member === m);
  const abs = heroAbilities(g, m);
  const special = classOf(g, m).special;
  const wrap = h('div.sheet-abil');
  if (abs.length) {
    wrap.appendChild(h('div.sub', 'Battle skills'));
    let n = 0;
    for (const ab of abs) {
      const isSp = ab.id === special;
      const key = isSp ? 'Q' : String(++n);
      const state = bu ? b.canUseAbility(bu, ab) : null;
      const tags = [ab.free ? 'free action' : null, ab.perBattle ? 'once per battle' : ab.cooldown ? `cooldown ${ab.cooldown}` : null].filter(Boolean).join(', ');
      wrap.appendChild(h('div.sa-row' + (isSp ? '.special' : '') + (state && !state.ok ? '.off' : ''), { style: { '--accent': hexCss(ab.fx) } },
        h('span.sa-ico', icon(ab.icon)),
        h('div', h('b', ab.name), h('span.sa-tag', ` ${key} · ${tags}${state && !state.ok ? ' — ' + state.short : ''}`), h('p', ab.desc))));
    }
  }
  if ((m.perks || []).length) {
    const counts = {};
    for (const id of m.perks) counts[id] = (counts[id] || 0) + 1;
    wrap.appendChild(h('div.sub', 'Talents'));
    wrap.appendChild(h('div.sa-perks', ...Object.entries(counts).map(([id, n]) => {
      const p = perkOf(id);
      return p ? h('span.tag', { title: p.desc }, icon(p.icon), ` ${p.name}${n > 1 ? ' ×' + n : ''}`) : null;
    })));
  }
  if (m.perkPending > 0 && m.status !== 'dead') wrap.appendChild(perkPicker(ui, m, onChange));
  return wrap;
}
