// Battle effects: punchy hits, spell visuals, floating numbers and danger
// markers. Built only on the view's public pieces (scene groups, tweens,
// worldToScreen, heightAt, wait, shake, arrow...) so that it survives changes
// to how the world itself is drawn.
import * as THREE from 'three';
import { shared } from './materials.js';

// The view draws figures and their effects in a second pass on layer 1
// (after clearing depth), so effects are never buried inside the terrain.
const FX_LAYER = 1;
const hexCss = (n) => '#' + ((n ?? 0xffffff) >>> 0).toString(16).padStart(6, '0');
// at most this many floating words at once; the oldest gives way to the newest
const MAX_FLOATS = 8;
const LANES = 5;

let TEX = null;
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function textures() {
  if (TEX) return TEX;
  TEX = {
    glow: canvasTex(64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,.85)');
      r.addColorStop(0.5, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    }),
    star: canvasTex(64, (g, s) => {
      g.translate(s / 2, s / 2);
      const r = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2);
        g.beginPath(); g.moveTo(0, -s * 0.07); g.lineTo(s * 0.5, 0); g.lineTo(0, s * 0.07); g.fill();
      }
      g.beginPath(); g.arc(0, 0, s * 0.13, 0, Math.PI * 2); g.fill();
    }),
    ring: canvasTex(128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s * 0.5);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,.5)');
      r.addColorStop(0.86, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    }),
    puff: canvasTex(64, (g, s) => {
      for (let i = 0; i < 7; i++) {
        const x = s / 2 + Math.cos(i * 2.4) * s * 0.16, y = s / 2 + Math.sin(i * 2.4) * s * 0.14;
        const r = g.createRadialGradient(x, y, 0, x, y, s * 0.3);
        r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
      }
    }),
    slash: canvasTex(128, (g, s) => {
      g.translate(s / 2, s / 2);
      const grd = g.createLinearGradient(-s / 2, 0, s / 2, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.55, 'rgba(255,255,255,.9)'); grd.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, s * 0.18, s * 0.44, Math.PI * 1.08, Math.PI * 1.92, false);
      g.arc(0, s * 0.3, s * 0.4, Math.PI * 1.9, Math.PI * 1.1, true);
      g.closePath(); g.fill();
    }),
    tile: canvasTex(64, (g, s) => {
      g.fillStyle = 'rgba(255,255,255,.32)'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.strokeRect(3, 3, s - 6, s - 6);
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3;
      for (let i = -s; i < s; i += 14) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke(); }
    }),
  };
  return TEX;
}

export class BattleFx {
  constructor(view) {
    this.view = view;
    this.objs = new Set();
    this.doms = new Set();
    this.loops = new Set();
  }

  // ---------------------------------------------------------------- helpers
  h(x, y) { try { return this.view.heightAt(x, y) || 0; } catch { return 0; } }
  pos(x, y, up = 0.55) { return new THREE.Vector3(x + 0.5, this.h(x, y) + up, y + 0.5); }

  add(obj, layer = FX_LAYER) {
    obj.traverse((o) => o.layers.set(layer));
    this.view.fxGroup.add(obj);
    this.objs.add(obj);
    return obj;
  }

  drop(obj) {
    if (!this.objs.has(obj)) return;
    this.objs.delete(obj);
    this.view.fxGroup.remove(obj);
    obj.traverse((o) => {
      if (o.material) o.material.dispose();
      if (o.geometry && !o.isSprite) o.geometry.dispose();
    });
  }

  sprite(tex, color, size, additive = true, opacity = 1) {
    const mat = new THREE.SpriteMaterial({ map: textures()[tex], color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    return this.add(s);
  }

  // a flat decal lying on the ground
  decal(tex, color, size, x, y, opacity = 0.9, additive = true) {
    const mat = new THREE.MeshBasicMaterial({ map: textures()[tex], color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(size, size, 1);
    m.position.set(x + 0.5, this.h(x, y) + 0.04, y + 0.5);
    m.renderOrder = 7;
    return this.add(m, 0);
  }

  tween(d, fn, done) { this.view.tween(d, fn, done); }
  wait(s) { return this.view.wait(s); }

  // Loose particles: a little cloud of glowing sprites with velocities
  particles(p, o = {}) {
    const n = o.count ?? 10;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = this.sprite(o.tex || 'glow', o.color ?? 0xffffff, (o.size ?? 0.16) * (0.6 + Math.random() * 0.8), o.additive !== false, o.opacity ?? 1);
      s.position.copy(p);
      if (o.spread) s.position.add(new THREE.Vector3((Math.random() - 0.5) * o.spread, (Math.random() - 0.5) * o.spread * 0.5, (Math.random() - 0.5) * o.spread));
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 1.6) * (0.4 + Math.random() * 0.8);
      s.userData.v = new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 1.2) * (0.4 + Math.random()), Math.sin(a) * sp);
      s.userData.s0 = s.scale.x;
      parts.push(s);
    }
    const life = o.life ?? 0.6, g = o.gravity ?? -4, grow = o.grow ?? 0;
    let last = 0;
    this.tween(life, (k) => {
      const dt = (k - last) * life;
      last = k;
      for (const s of parts) {
        s.userData.v.y += g * dt;
        s.position.addScaledVector(s.userData.v, dt);
        s.material.opacity = (o.opacity ?? 1) * (1 - k) * (k < 0.1 ? k * 10 : 1);
        s.scale.setScalar(s.userData.s0 * (1 + grow * k));
      }
    }, () => { for (const s of parts) this.drop(s); });
  }

  // a sprite that swells and fades in one place
  pop(p, tex, color, from, to, d, additive = true) {
    const s = this.sprite(tex, color, from, additive);
    s.position.copy(p);
    return new Promise((res) => this.tween(d, (k) => {
      s.scale.setScalar(from + (to - from) * (1 - (1 - k) * (1 - k)));
      s.material.opacity = 1 - k * k;
    }, () => { this.drop(s); res(); }));
  }

  // ground ring expanding outwards
  ring(x, y, color, r0, r1, d = 0.45, opacity = 0.9) {
    const m = this.decal('ring', color, r0 * 2, x, y, opacity);
    return new Promise((res) => this.tween(d, (k) => {
      const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k));
      m.scale.set(r * 2, r * 2, 1);
      m.material.opacity = opacity * (1 - k);
    }, () => { this.drop(m); res(); }));
  }

  screenOf(x, y, up) {
    const p = this.pos(x, y, up);
    return this.view.worldToScreen(p.x, p.y, p.z);
  }

  // ---------------------------------------------------------------- floating text
  // Words over the figures share the screen. Each new one takes the lowest
  // lane above its figure that nothing else is using, so a heal, a shout and a
  // condition over neighbours never print on top of each other; at most
  // MAX_FLOATS are up at once (the oldest steps aside early, a critical last),
  // and none rises under the turn strip (view.safeTop, set by the battle HUD).
  float(el, anchor, life, o = {}) {
    const layer = this.view.floatLayer || this.view.container;
    layer.appendChild(el);
    this.doms.add(el);
    const list = (this.floats ||= []);
    while (list.length >= MAX_FLOATS) (list.find((f) => !f.keep) || list[0]).cut();
    const w = el.offsetWidth || 40, h = el.offsetHeight || 20;
    const oy = o.oy ?? 0.5, gap = 3;
    const rectAt = (p, lane) => {
      const L = p.x - w / 2;
      let T = p.y - h * oy - lane * (h + gap);
      T = Math.max(T, (this.view.safeTop || 0) + 2);
      return { L, T, R: L + w, B: T + h };
    };
    const hit = (a, b) => a.L < b.R + gap && b.L < a.R + gap && a.T < b.B + gap && b.T < a.B + gap;
    const p0 = anchor(0);
    let lane = 0;
    while (lane < LANES && list.some((f) => f.r && hit(f.r, rectAt(p0, lane)))) lane++;
    // no room left above this figure: the words already in the way step aside
    if (lane === LANES) {
      lane = 0;
      for (const f of [...list]) if (f.r && hit(f.r, rectAt(p0, 0))) f.cut();
    }
    const f = { el, keep: !!o.keep, lane, r: rectAt(p0, lane), dead: false };
    f.cut = () => {
      if (f.dead) return;
      f.dead = true;
      el.remove();
      this.doms.delete(el);
      const i = list.indexOf(f);
      if (i >= 0) list.splice(i, 1);
    };
    list.push(f);
    const fadeAt = o.fadeAt ?? 0.72;
    const draw = (k) => {
      if (f.dead) return;
      f.r = rectAt(anchor(k), lane);
      const pop = o.pop ? o.pop(k) : 1;
      el.style.transform = `translate(${Math.round(f.r.L)}px, ${Math.round(f.r.T)}px) scale(${pop})`;
      el.style.opacity = String(k < fadeAt ? 1 : 1 - (k - fadeAt) / (1 - fadeAt));
    };
    draw(0);
    this.tween(life, draw, f.cut);
    return f;
  }

  // kind: dmg (we hit them), hurt (they hit us), crit, heal, miss, status, info
  number(x, y, text, kind = 'dmg', color = null) {
    const el = document.createElement('div');
    el.className = 'fx-num fx-' + kind;
    if (kind === 'crit') el.innerHTML = `<small>CRITICAL</small>${text}`;
    else el.textContent = text;
    if (color) el.style.color = color;
    const d = kind === 'crit' ? 1.5 : kind === 'status' || kind === 'info' ? 1.4 : 1.1;
    const jitter = (Math.random() - 0.5) * 0.15;
    const up0 = kind === 'status' || kind === 'info' ? 1.5 : 1.25;
    this.float(el, (k) => this.screenOf(x + jitter, y, up0 + k * 0.6), d, {
      keep: kind === 'crit',
      pop: (k) => (k < 0.12 ? 0.6 + k / 0.12 * 0.75 : k < 0.25 ? 1.35 - (k - 0.12) / 0.13 * 0.35 : 1),
    });
  }

  // a shout of the ability's name above the user
  callout(x, y, text, color = 0xffe080) {
    const el = document.createElement('div');
    el.className = 'fx-callout';
    el.textContent = text;
    el.style.color = hexCss(color);
    // the turn banner steps aside for it
    this.view.container?.dispatchEvent?.(new CustomEvent('fx-callout'));
    this.float(el, (k) => this.screenOf(x, y, 1.9 + k * 0.25), 1.5, { oy: 1, keep: true, fadeAt: 0.75, pop: (k) => (k < 0.1 ? 0.7 + k * 3 : 1) });
  }

  // Battle lighting: in a dark or night arena figures get a cool rim so that
  // black spiders and dark armour stand off the floor
  stage(lighting) {
    const dark = lighting === 'dark' ? 1 : lighting === 'night' ? 0.7 : lighting === 'dusk' ? 0.35 : 0;
    shared.uRim.value.set(0.78, 0.84, 1.0, 0.55 * dark);
  }

  // ---------------------------------------------------------------- impacts
  // The moment of a blow landing: a white spark, a ring of sparks and the
  // victim knocked back a hand's breadth. Crits get a longer pause and shake.
  async impact(t, from, o = {}) {
    const p = this.pos(t.x, t.y, 0.6);
    const col = o.color ?? 0xfff0c0;
    this.pop(p, 'star', 0xffffff, 0.2, o.crit ? 1.9 : 1.15, o.crit ? 0.26 : 0.18);
    this.pop(p, 'glow', col, 0.3, o.crit ? 1.6 : 0.9, 0.22);
    this.particles(p, { count: o.crit ? 16 : 8, color: o.blood ?? col, size: 0.12, speed: 2.4, up: 1.6, gravity: -7, life: 0.45 });
    this.nudge(t, from, o.crit ? 0.32 : 0.18);
    try { this.view.hurtAnim(t.id); } catch { /* the figure may be gone */ }
    if (o.crit) {
      this.view.shake(0.22, 0.32);
      this.flash('rgba(255,240,200,.28)', 120);
      await this.wait(0.09); // hit-stop: let the blow register
    }
  }

  // push a figure away from the attacker and let it settle back
  nudge(t, from, amt) {
    const e = this.view.entities?.get?.(t.id);
    if (!e || !e.faceG || !from) return;
    let dx = t.x - from.x, dz = t.y - from.y;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const g = e.faceG.parent || e.faceG;
    const bx = g.position.x, bz = g.position.z;
    this.tween(0.26, (k) => {
      const s = Math.sin(Math.min(1, k * 2.2) * Math.PI) * (1 - k * 0.4) * amt;
      g.position.x = bx + dx * s;
      g.position.z = bz + dz * s;
    }, () => { g.position.x = bx; g.position.z = bz; });
  }

  flash(color, ms = 140) {
    try { this.view.flash(color, ms); } catch { /* no flash layer */ }
  }

  slash(u, t, color = 0xffffff) {
    const a = this.screenOf(u.x, u.y, 0.6), b = this.screenOf(t.x, t.y, 0.6);
    const ang = Math.atan2(-(b.y - a.y), b.x - a.x);
    const p = this.pos(t.x, t.y, 0.65).lerp(this.pos(u.x, u.y, 0.65), 0.25);
    const s = this.sprite('slash', color, 1.1);
    s.position.copy(p);
    s.material.rotation = ang - Math.PI / 2 + 0.9;
    this.tween(0.2, (k) => {
      s.material.rotation = ang - Math.PI / 2 + 0.9 - k * 1.6;
      s.material.opacity = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
      s.scale.setScalar(0.9 + k * 0.4);
    }, () => this.drop(s));
  }

  miss(t) { this.number(t.x, t.y, 'Miss', 'miss'); }

  // ---------------------------------------------------------------- projectiles
  // A glowing bolt with a trail. kind tunes the look: fire, frost, arcane,
  // shadow, holy, song, poison.
  bolt(from, to, color = 0xffa040, kind = 'arcane', speed = 11) {
    const a = this.pos(from.x, from.y, 0.75), b = this.pos(to.x, to.y, 0.6);
    const dist = a.distanceTo(b);
    const d = Math.max(0.14, dist / speed);
    const core = this.sprite('glow', color, kind === 'fire' ? 0.75 : 0.55);
    const hot = this.sprite('star', 0xffffff, 0.35);
    const arc = dist * (kind === 'fire' ? 0.12 : 0.06);
    let lastTrail = 0;
    return new Promise((res) => this.tween(d, (k) => {
      const p = new THREE.Vector3().lerpVectors(a, b, k);
      p.y += Math.sin(k * Math.PI) * arc;
      core.position.copy(p); hot.position.copy(p);
      hot.material.rotation += 0.4;
      if (k - lastTrail > 0.06) {
        lastTrail = k;
        this.particles(p, { count: kind === 'fire' ? 3 : 2, color, size: kind === 'fire' ? 0.24 : 0.14, speed: 0.25, up: kind === 'fire' ? 0.8 : 0.1, gravity: kind === 'fire' ? 1 : 0, life: 0.35, grow: kind === 'shadow' || kind === 'fire' ? 1.2 : 0 });
      }
    }, () => {
      this.drop(core); this.drop(hot);
      this.splash(to.x, to.y, color, kind);
      res();
    }));
  }

  // what a bolt does when it arrives
  splash(x, y, color, kind) {
    const p = this.pos(x, y, 0.55);
    this.pop(p, 'glow', color, 0.4, kind === 'fire' ? 2.2 : 1.5, 0.3);
    if (kind === 'fire') {
      this.particles(p, { count: 14, color: 0xff9030, size: 0.28, speed: 1.4, up: 2.2, gravity: 1.5, life: 0.6, grow: 1 });
      this.particles(p, { count: 8, color: 0xffe080, size: 0.12, speed: 2.5, up: 2.5, gravity: -4, life: 0.5 });
    } else if (kind === 'frost') {
      this.particles(p, { tex: 'star', count: 12, color: 0xd8f6ff, size: 0.2, speed: 2, up: 1, gravity: -3, life: 0.55 });
    } else if (kind === 'shadow') {
      this.particles(p, { tex: 'puff', count: 9, color: 0x7040c0, size: 0.4, speed: 0.6, up: 0.6, gravity: 0, life: 0.7, grow: 1.4, additive: false, opacity: 0.8 });
    } else if (kind === 'poison') {
      this.particles(p, { count: 10, color: 0x90e060, size: 0.14, speed: 0.6, up: 1.4, gravity: 0.5, life: 0.8 });
    } else {
      this.particles(p, { tex: 'star', count: 10, color, size: 0.18, speed: 1.8, up: 1.2, gravity: -2, life: 0.5 });
    }
  }

  shot(from, to, o = {}) {
    return this.view.arrow(from.x, from.y, to.x, to.y, o);
  }

  // ---------------------------------------------------------------- area effects
  nova(x, y, radius, color, kind) {
    const p = this.pos(x, y, 0.3);
    this.ring(x, y, color, 0.3, radius + 0.6, 0.45);
    this.pop(p, 'glow', color, 0.5, 1.6 + radius, 0.35);
    if (kind === 'frost') {
      this.particles(p, { tex: 'star', count: 18 + radius * 6, color: 0xe0f8ff, size: 0.22, speed: 3 + radius, up: 0.8, gravity: -2, life: 0.6 });
      this.particles(p, { tex: 'puff', count: 10, color: 0xb8ecff, size: 0.6, speed: 1.6 + radius, up: 0.2, gravity: 0, life: 0.8, grow: 1, opacity: 0.6 });
    } else if (kind === 'earth') {
      this.view.shake(0.3, 0.45);
      this.particles(p, { tex: 'puff', count: 16, color: 0xb09878, size: 0.7, speed: 2 + radius, up: 1.2, gravity: -1, life: 0.9, grow: 1.2, additive: false, opacity: 0.85 });
      this.particles(p, { count: 14, color: 0x8a7458, size: 0.14, speed: 2.4, up: 3, gravity: -9, life: 0.7, additive: false });
    } else if (kind === 'shout') {
      this.ring(x, y, color, 0.2, radius + 0.5, 0.35, 0.7);
      setTimeout(() => this.ring(x, y, color, 0.2, radius + 0.5, 0.35, 0.5), 120);
    } else {
      this.particles(p, { tex: 'star', count: 14, color, size: 0.2, speed: 2.4, up: 1.2, gravity: -2, life: 0.6 });
    }
    return this.wait(0.25);
  }

  // a shaft of light from above
  beam(x, y, color = 0xfff0a0) {
    const g = new THREE.CylinderGeometry(0.32, 0.42, 5, 16, 1, true);
    g.translate(0, 2.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x + 0.5, this.h(x, y), y + 0.5);
    this.add(m);
    this.particles(this.pos(x, y, 0.2), { count: 12, color, size: 0.14, speed: 0.4, up: 2.2, gravity: 0.5, life: 0.9, spread: 0.6 });
    this.ring(x, y, color, 0.3, 0.9, 0.6, 0.8);
    return new Promise((res) => this.tween(0.6, (k) => {
      m.material.opacity = (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * 0.55;
      m.scale.set(1 - k * 0.5, 1, 1 - k * 0.5);
    }, () => { this.drop(m); res(); }));
  }

  healFx(x, y, color = 0x80ffa0) {
    const p = this.pos(x, y, 0.15);
    this.ring(x, y, color, 0.15, 0.75, 0.6, 0.8);
    this.particles(p, { count: 14, color, size: 0.15, speed: 0.35, up: 1.9, gravity: 0.6, life: 1.0, spread: 0.5 });
    this.particles(p, { tex: 'star', count: 5, color: 0xffffff, size: 0.18, speed: 0.3, up: 1.5, gravity: 0.4, life: 0.9, spread: 0.4 });
  }

  smoke(x, y) {
    const p = this.pos(x, y, 0.35);
    this.particles(p, { tex: 'puff', count: 16, color: 0x8a8a98, size: 0.8, speed: 0.9, up: 0.5, gravity: 0, life: 1.2, grow: 1.3, additive: false, opacity: 0.9, spread: 0.4 });
  }

  shock(x, y, color = 0xa0d0ff) {
    const top = this.pos(x, y, 3.2), bot = this.pos(x, y, 0.4);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const v = new THREE.Vector3().lerpVectors(top, bot, i / 8);
      if (i > 0 && i < 8) { v.x += (Math.random() - 0.5) * 0.35; v.z += (Math.random() - 0.5) * 0.35; }
      pts.push(v);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
    this.add(line);
    this.pop(bot, 'glow', color, 0.5, 1.8, 0.3);
    this.particles(bot, { tex: 'star', count: 10, color, size: 0.16, speed: 2.4, up: 1.5, gravity: -3, life: 0.4 });
    this.tween(0.25, (k) => { line.material.opacity = k < 0.5 ? 1 : 2 - k * 2; }, () => this.drop(line));
  }

  blink(x, y, color = 0xc0a0ff) {
    const p = this.pos(x, y, 0.55);
    this.pop(p, 'glow', color, 1.2, 0.2, 0.3);
    this.ring(x, y, color, 0.6, 0.1, 0.35);
    this.particles(p, { tex: 'star', count: 12, color, size: 0.16, speed: 1.2, up: 1, gravity: 0, life: 0.5, spread: 0.4 });
  }

  death(x, y, color = 0xc8c0b0) {
    const p = this.pos(x, y, 0.3);
    this.particles(p, { tex: 'puff', count: 10, color, size: 0.6, speed: 1.1, up: 0.5, gravity: 0, life: 0.9, grow: 1.2, additive: false, opacity: 0.7 });
    const w = this.sprite('glow', 0xe8f0ff, 0.45, true, 0.8);
    w.position.copy(this.pos(x, y, 0.7));
    this.tween(1.2, (k) => {
      w.position.y += 0.025;
      w.position.x += Math.sin(k * 9) * 0.006;
      w.material.opacity = 0.8 * (1 - k);
    }, () => this.drop(w));
  }

  // Squares where a telegraphed blow will land. Stays (pulsing) until removed.
  danger(tiles, color = 0xff4020) {
    // normal blending: additive red on green grass would turn yellow
    const ms = tiles.map((t) => this.decal('tile', color, 0.96, t.x, t.y, 0.7, false));
    let on = true;
    const t0 = performance.now();
    const pulse = () => {
      if (!on) return;
      const k = 0.62 + Math.sin((performance.now() - t0) / 160) * 0.25;
      for (const m of ms) m.material.opacity = k;
      this.view.tween(0.05, () => {}, pulse);
    };
    pulse();
    const handle = { tiles, remove: () => { on = false; for (const m of ms) this.drop(m); this.loops.delete(handle); } };
    this.loops.add(handle);
    return handle;
  }

  clear() {
    for (const l of [...this.loops]) l.remove();
    for (const o of [...this.objs]) this.drop(o);
    for (const el of this.doms) el.remove();
    this.doms.clear();
    this.floats = [];
    shared.uRim.value.set(0, 0, 0, 0);
  }
}
