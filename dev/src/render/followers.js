// The company on the map: every living hero after the leader walks as their
// own little figure. On the move they tread in the leader's footsteps along a
// trail; when the leader stops they gather into a loose knot behind them on
// open ground. Purely visual — the party is still one square to the game.

import * as THREE from 'three';
import { makeModel } from './models.js';

// where the crew stands on a ship's deck (model space: the bow is +z)
const DECK = [[0, 0.3], [0.13, -0.1], [-0.13, 0.06], [0.11, 0.2], [-0.1, -0.28], [0.08, -0.33]];

// gathering spots round the leader, in units of the trail spacing: rings at
// these radii, at these angles away from straight behind (degrees)
const RINGS = [1, 1.7, 2.45];
const ANGLES = [0, 40, -40, 80, -80, 115, -115, 150, -150, 180];

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class Followers {
  constructor(view) {
    this.view = view;
    this.list = []; // { key, id, sig, d, rank, spot, walk, jx, jz, ja }
    this.trail = []; // leader positions, newest first: { x, z }
    this.mode = 'gather';
    this.still = 0;
    this.last = null;
    this.scale = 1;
    this.spacing = 0.6;
    this.walkable = () => true;
    this.taken = () => false;
  }

  get count() { return this.list.length; }

  // items: [{ key, look }] in marching order (the leader is not among them).
  // opts: { scale, spacing, walkable(x, y), taken(x, y) }
  set(items, opts = {}) {
    const v = this.view;
    if (opts.scale != null) this.scale = opts.scale;
    if (opts.spacing != null) this.spacing = opts.spacing;
    if (opts.walkable) this.walkable = opts.walkable;
    if (opts.taken) this.taken = opts.taken;
    const leader = v.entities.get('party');
    const old = new Map(this.list.map((f) => [f.key, f]));
    // a fresh map (or the first call): everyone is placed at once
    const fresh = !this.list.some((f) => v.entities.has(f.id));
    const next = [];
    let changed = false;
    for (const it of items) {
      const sig = JSON.stringify(it.look) + '|' + this.scale;
      let f = old.get(it.key);
      old.delete(it.key);
      const had = f && v.entities.get(f.id);
      if (had && f.sig === sig) { f.rank = next.length; next.push(f); continue; }
      changed = true;
      const from = had ? had.root.position.clone() : leader ? leader.root.position.clone() : null;
      const face = had ? had.faceG.rotation.y : leader ? leader.faceG.rotation.y : 0;
      if (had) v.removeEntity(f.id);
      const id = 'party:' + it.key;
      const e = v.addEntity(id, it.look, 0, 0, { scale: this.scale });
      e.follower = true;
      if (from) e.root.position.copy(from);
      e.faceG.rotation.y = face;
      e.faceTarget = face;
      const r = hash(it.key);
      f = { key: it.key, id, sig, d: 0, rank: next.length, spot: null, walk: r * 3, jx: (r - 0.5) * 0.12, jz: (hash(it.key + 'z') - 0.5) * 0.12, ja: (hash(it.key + 'a') - 0.5) * 0.5 };
      next.push(f);
    }
    for (const f of old.values()) { v.removeEntity(f.id); changed = true; }
    this.list = next;
    if (!next.length) { this.trail = []; this.last = null; return; }
    if (fresh || !leader) this.reset();
    else if (changed && this.mode === 'gather') this._gather();
  }

  clear() { this.set([]); }

  // Afloat: everyone stands on the deck of the ship ('party'), small, and
  // rocks with it
  aboard(looks) {
    const v = this.view;
    const L = v.entities.get('party');
    if (!L || !L.info.boat) return;
    looks.slice(0, DECK.length).forEach((look, i) => {
      const m = makeModel(look, v.mats);
      const g = new THREE.Group();
      g.add(m);
      g.scale.setScalar(0.36);
      g.position.set(DECK[i][0], 0.15, DECK[i][1]);
      g.rotation.y = (hash(i + ':' + JSON.stringify(look).length) - 0.5) * 0.8;
      L.model.add(g);
    });
  }

  // everyone straight to their place around the leader
  reset() {
    const v = this.view;
    const L = v.entities.get('party');
    if (!L) return;
    const lp = L.root.position;
    this.trail = [{ x: lp.x, z: lp.z }];
    this.last = { x: lp.x, z: lp.z };
    this.still = 1;
    this._gather();
    for (const f of this.list) {
      const e = v.entities.get(f.id);
      if (!e || !f.spot) continue;
      e.root.position.set(f.spot.x, this._ground(f.spot.x, f.spot.z), f.spot.z);
      e.faceG.rotation.y = e.faceTarget = f.spot.a;
    }
  }

  _ground(x, z) { return this.view.surfaceAt(x, z); }

  // can a figure stand here: on open ground, clear of walls by a margin
  _okPoint(x, z, m = 0.17) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!this.walkable(tx, tz) || this.taken(tx, tz)) return false;
    const fx = x - tx, fz = z - tz;
    if (fx < m && !this.walkable(tx - 1, tz)) return false;
    if (fx > 1 - m && !this.walkable(tx + 1, tz)) return false;
    if (fz < m && !this.walkable(tx, tz - 1)) return false;
    if (fz > 1 - m && !this.walkable(tx, tz + 1)) return false;
    // corners: keep off the tip of a wall
    if (fx < m && fz < m && !this.walkable(tx - 1, tz - 1)) return false;
    if (fx > 1 - m && fz < m && !this.walkable(tx + 1, tz - 1)) return false;
    if (fx < m && fz > 1 - m && !this.walkable(tx - 1, tz + 1)) return false;
    if (fx > 1 - m && fz > 1 - m && !this.walkable(tx + 1, tz + 1)) return false;
    return true;
  }

  // squares the company can reach from the leader's within a couple of steps
  _reach(cx, cz) {
    const ok = new Set([cx + ',' + cz]);
    let front = [[cx, cz]];
    for (let r = 0; r < 3; r++) {
      const nx = [];
      for (const [x, z] of front) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (x + dx) + ',' + (z + dz);
          if (ok.has(k) || !this.walkable(x + dx, z + dz) || this.taken(x + dx, z + dz)) continue;
          ok.add(k);
          nx.push([x + dx, z + dz]);
        }
      }
      front = nx;
    }
    return ok;
  }

  // choose a spot for everyone and send them there
  _gather() {
    const v = this.view;
    const L = v.entities.get('party');
    if (!L || !this.list.length) return;
    const lp = L.root.position;
    const a = L.faceTarget ?? L.faceG.rotation.y;
    const fx = Math.sin(a), fz = Math.cos(a); // facing
    const rx = -fz, rz = fx; // the leader's right hand
    const u = this.spacing;
    const reach = this._reach(Math.floor(lp.x), Math.floor(lp.z));
    const minD = u * 0.8;
    const chosen = [{ x: lp.x, z: lp.z, leader: true }];
    const spots = [];
    // The camera looks north from the south: a figure just south of another
    // hides it. Spots that would hide the leader (or anyone) cost extra, so
    // the company fans out sideways like a group posing for a painting.
    const wide = u * 0.7, deep = u * 1.9;
    const cost = (x, z, pri) => {
      let c = pri;
      for (const q of chosen) {
        const dx = Math.abs(x - q.x), dz = z - q.z;
        if (dx < wide && dz > 0.04 && dz < deep) c += q.leader ? 4 : 1.6; // in front of them
        else if (dx < wide && dz < -0.04 && dz > -deep) c += 0.7; // behind them
      }
      return c;
    };
    const cands = [];
    for (const r of RINGS) {
      for (const deg of ANGLES) {
        const t = (deg * Math.PI) / 180;
        const right = Math.sin(t) * r, back = Math.cos(t) * r;
        cands.push({ x: lp.x + (rx * right - fx * back) * u, z: lp.z + (rz * right - fz * back) * u, pri: r * 0.9 + (Math.abs(deg) / 180) * 1.3 });
      }
    }
    // and back along the way we came, for corridors and doorways
    for (let d = u, k = 0; d < u * 8; d += u * 0.5, k++) { const p = this._at(d); cands.push({ x: p.x, z: p.z, pri: 1.2 + k * 0.25 }); }
    const ok = cands.filter((c) => reach.has(Math.floor(c.x) + ',' + Math.floor(c.z)) && this._okPoint(c.x, c.z));
    while (spots.length < this.list.length) {
      let best = null, bc = Infinity;
      for (const c of ok) {
        if (c.used || chosen.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < minD)) continue;
        const k = cost(c.x, c.z, c.pri);
        if (k < bc) { bc = k; best = c; }
      }
      if (!best) break;
      best.used = true;
      chosen.push({ x: best.x, z: best.z });
      spots.push({ x: best.x, z: best.z });
    }
    while (spots.length < this.list.length) spots.push({ x: lp.x - fx * u * 0.5 * (spots.length + 1), z: lp.z - fz * u * 0.5 * (spots.length + 1), loose: true });
    // nearest spot for whoever is closest to the leader first, so no one crosses the group
    const order = this.list.map((f) => ({ f, e: v.entities.get(f.id) })).filter((o) => o.e);
    order.sort((p, q) => Math.hypot(p.e.root.position.x - lp.x, p.e.root.position.z - lp.z) - Math.hypot(q.e.root.position.x - lp.x, q.e.root.position.z - lp.z));
    const free = spots.slice();
    for (const { f, e } of order) {
      let best = 0, bd = Infinity;
      free.forEach((s, i) => {
        const d = Math.hypot(s.x - e.root.position.x, s.z - e.root.position.z) + Math.hypot(s.x - lp.x, s.z - lp.z) * 0.6;
        if (d < bd) { bd = d; best = i; }
      });
      const s = free.splice(best, 1)[0];
      const jx = s.loose ? 0 : f.jx * u, jz = s.loose ? 0 : f.jz * u;
      const x = this._okPoint(s.x + jx, s.z + jz) ? s.x + jx : s.x, z = this._okPoint(s.x + jx, s.z + jz) ? s.z + jz : s.z;
      f.spot = { x, z, a: a + f.ja };
    }
    this.mode = 'gather';
  }

  // the trail through the company as it stands, so that when the leader
  // sets off each follower falls in behind whoever is ahead of them
  _startFollow(lx, lz) {
    const v = this.view;
    const left = this.list.map((f) => ({ f, e: v.entities.get(f.id) })).filter((o) => o.e);
    const pts = [{ x: lx, z: lz }];
    let cur = pts[0], acc = 0, rank = 0;
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((o, i) => { const d = Math.hypot(o.e.root.position.x - cur.x, o.e.root.position.z - cur.z); if (d < bd) { bd = d; bi = i; } });
      const { f, e } = left.splice(bi, 1)[0];
      const p = { x: e.root.position.x, z: e.root.position.z };
      acc += Math.max(0.02, bd);
      f.d = acc;
      f.rank = rank++;
      pts.push(p);
      cur = p;
    }
    this.trail = pts;
    this.mode = 'follow';
  }

  _push(x, z) {
    const t = this.trail;
    if (t.length < 2 || Math.hypot(x - t[1].x, z - t[1].z) >= 0.12) t.unshift({ x, z });
    else t[0] = { x, z };
    // forget the trail beyond the last follower
    let max = 0;
    for (const f of this.list) max = Math.max(max, f.d);
    let acc = 0;
    for (let i = 1; i < t.length; i++) {
      acc += Math.hypot(t[i].x - t[i - 1].x, t[i].z - t[i - 1].z);
      if (acc > max + 1.5) { t.length = i + 1; break; }
    }
  }

  // the point d along the trail back from the leader
  _at(d) {
    const t = this.trail;
    if (!t.length) { const L = this.view.entities.get('party'); return L ? { x: L.root.position.x, z: L.root.position.z } : { x: 0, z: 0 }; }
    let acc = 0;
    for (let i = 1; i < t.length; i++) {
      const sl = Math.hypot(t[i].x - t[i - 1].x, t[i].z - t[i - 1].z);
      if (acc + sl >= d) {
        const k = sl > 0 ? (d - acc) / sl : 0;
        return { x: t[i - 1].x + (t[i].x - t[i - 1].x) * k, z: t[i - 1].z + (t[i].z - t[i - 1].z) * k };
      }
      acc += sl;
    }
    return { x: t[t.length - 1].x, z: t[t.length - 1].z };
  }

  update(dt) {
    if (!this.list.length) return;
    const v = this.view;
    const L = v.entities.get('party');
    // a new map cleared the figures away; the session sets them up again
    if (!L) return;
    if (!this.list.some((f) => v.entities.has(f.id))) { this.list = []; return; }
    const lp = L.root.position;
    if (!this.last) { this.reset(); return; }
    const moved = Math.hypot(lp.x - this.last.x, lp.z - this.last.z);
    // jumped (placed elsewhere, a new map): gather round at once
    if (moved > 1.6) { this.reset(); return; }
    if (moved > 1e-4) {
      if (this.mode !== 'follow') this._startFollow(this.last.x, this.last.z);
      this._push(lp.x, lp.z);
      this.still = 0;
    } else this.still += dt;
    this.last = { x: lp.x, z: lp.z };
    // the leader has stopped: gather round
    if (this.mode === 'follow' && this.still > 0.42) this._gather();
    const u = this.spacing;
    for (const f of this.list) {
      const e = v.entities.get(f.id);
      if (!e) continue;
      let tx, tz, speed;
      if (this.mode === 'follow') {
        // close up to the proper spacing, but never step backwards
        const want = (f.rank + 1) * u;
        if (f.d > want) f.d = Math.max(want, f.d - dt * 1.6);
        else if (moved > 0) f.d = Math.min(want, f.d + moved * 0.5);
        const p = this._at(f.d);
        tx = p.x; tz = p.z; speed = 9;
        // Marching straight up or down the screen, a column would stand one
        // figure behind the next: step aside, alternately left and right
        const q = this._at(f.d + 0.25), qx = p.x - q.x, qz = p.z - q.z, ql = Math.hypot(qx, qz);
        if (ql > 0.05) {
          const ns = Math.abs(qz / ql);
          const side = (f.rank % 2 ? 1 : -1) * u * 0.42 * Math.max(0, (ns - 0.35) / 0.65) * Math.min(1, f.d / u);
          const ox = tx + (-qz / ql) * side, oz = tz + (qx / ql) * side;
          if (this._okPoint(ox, oz, 0.1)) { tx = ox; tz = oz; }
        }
      } else {
        if (!f.spot) continue;
        tx = f.spot.x; tz = f.spot.z; speed = 2.4;
      }
      const p = e.root.position;
      const dx = tx - p.x, dz = tz - p.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, speed * dt);
      if (step > 1e-4) {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
      }
      const walking = step > 0.0025;
      if (walking) {
        if (dist > 0.03) e.faceTarget = Math.atan2(dx, dz);
        f.walk += step;
        f.moving = Math.min(1, (f.moving || 0) + dt * 8);
      } else {
        f.moving = Math.max(0, (f.moving || 0) - dt * 6);
        if (this.mode === 'gather' && f.spot) e.faceTarget = f.spot.a;
      }
      // a little step bob and sway while walking
      const ph = (f.walk / (0.34 * Math.max(0.6, this.scale))) * Math.PI;
      p.y = this._ground(p.x, p.z);
      if (f.moving > 0) {
        e.model.position.y = Math.abs(Math.sin(ph)) * 0.055 * f.moving;
        e.model.rotation.z = Math.sin(ph) * 0.06 * f.moving;
      } else e.model.rotation.z = 0;
      e.x = Math.floor(p.x); e.y = Math.floor(p.z);
    }
  }
}

