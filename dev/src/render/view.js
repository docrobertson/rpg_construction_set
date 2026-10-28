// The 3D view: renderer, fixed high-angle camera rig, lights, terrain,
// entity visuals, overlays and effects.
import * as THREE from 'three';
import { createMaterials, shared, silhouetteMaterial } from './materials.js';
import { TerrainView, WATER_Y } from './terrainView.js';
import { makeModel } from './models.js';
import { terrain } from '../data/terrain.js';
import { getTile } from '../world/map.js';
import { clamp } from '../core/util.js';

const _tmpColor = new THREE.Color(), _bgColor = new THREE.Color();

const LIGHTING = {
  day: { bg: 0x8fbde6, hemiSky: 0xdcefff, hemiGround: 0x6a5a40, hemi: 1.5, sun: 2.6, sunColor: 0xfff0d8, amb: 0 },
  dusk: { bg: 0x5a4a6a, hemiSky: 0xffc8a0, hemiGround: 0x3a2a40, hemi: 1.1, sun: 1.6, sunColor: 0xffb070, amb: 0 },
  night: { bg: 0x101828, hemiSky: 0x6080c0, hemiGround: 0x101018, hemi: 0.7, sun: 0.6, sunColor: 0x8090ff, amb: 0 },
  dark: { bg: 0x050505, hemiSky: 0xb0b4c8, hemiGround: 0x3a3028, hemi: 1.7, sun: 1.5, sunColor: 0xffd8a0, amb: 0 },
};

export class View {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.mats = createMaterials();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi.layers.enableAll();
    this.sun.layers.enableAll();

    this.terrain = new TerrainView(this.scene, this.mats);
    this.entities = new Map();
    this.entityGroup = new THREE.Group();
    this.scene.add(this.entityGroup);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.overlayGroup);

    // camera rig
    this.rig = { x: 8, z: 8, tx: 8, tz: 8, dist: 16, tdist: 16, pitch: 70, minDist: 5, maxDist: 80 };
    this.followSpeed = 8;
    this.unitScale = 1.3;
    this.setPitch(70);

    this.tweens = [];
    this.particles = [];
    this.floaters = [];
    this.clock = new THREE.Clock();
    this.time = 0;
    this.onTick = null;

    this.floatLayer = document.createElement('div');
    this.floatLayer.className = 'float-layer';
    container.appendChild(this.floatLayer);

    this._initOverlays();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.visOn = false;
    this.setLighting('day');
    window.addEventListener('resize', () => this.resize());
    // the map lives in a docked frame whose size changes with the layout
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Units are drawn in a second pass on top of the terrain and leaned back
  // towards the camera so that figures read clearly from a high angle.
  setPitch(deg) {
    this.rig.pitch = clamp(deg, 45, 85);
    this.lean = -THREE.MathUtils.degToRad(Math.max(0, this.rig.pitch - 22));
    for (const e of this.entities?.values?.() || []) if (!e.info.noLean) e.leanG.rotation.x = this.lean;
  }

  setLighting(name) {
    const L = LIGHTING[name] || LIGHTING.day;
    this.lighting = name;
    this.renderer.setClearColor(L.bg, 1);
    this.hemi.color.setHex(L.hemiSky);
    this.hemi.groundColor.setHex(L.hemiGround);
    this.hemi.intensity = L.hemi;
    this.sun.color.setHex(L.sunColor);
    this.sun.intensity = L.sun;
  }

  // Blend the outdoor light through the day: 0 = full day, 0.5 = dusk, 1 = night
  setDaylight(k) {
    const D = LIGHTING.day, U = LIGHTING.dusk, N = LIGHTING.night;
    const [A, B, t] = k < 0.5 ? [D, U, k * 2] : [U, N, (k - 0.5) * 2];
    const mixc = (target, a, b) => target.setHex(a).lerp(_tmpColor.setHex(b), t);
    this.lighting = k > 0.75 ? 'night' : k > 0.25 ? 'dusk' : 'day';
    this.renderer.setClearColor(mixc(_bgColor, A.bg, B.bg), 1);
    mixc(this.hemi.color, A.hemiSky, B.hemiSky);
    mixc(this.hemi.groundColor, A.hemiGround, B.hemiGround);
    this.hemi.intensity = A.hemi + (B.hemi - A.hemi) * t;
    mixc(this.sun.color, A.sunColor, B.sunColor);
    this.sun.intensity = A.sun + (B.sun - A.sun) * t;
  }

  // ---- map ----
  setMap(map) {
    this.map = map;
    this.clearEntities();
    this.clearFx();
    this.terrain.setMap(map);
    this.setLighting(map.lighting || 'day');
    this._initVisibility(map.w, map.h);
    this.rig.maxDist = Math.max(30, Math.max(map.w, map.h) * 1.2);
  }

  refreshTiles(x0, y0, x1, y1) {
    this.terrain.markDirty(x0, y0, x1, y1);
  }

  refreshAll() {
    this.terrain.markAllDirty();
  }

  heightAt(x, y) {
    if (!this.map) return 0;
    const t = terrain(getTile(this.map, x, y));
    if (t.key === 'bridge') return 0.04;
    if (t.water) return WATER_Y;
    const g = this.terrain.groundAt(x, y);
    if (t.wall) return g + t.h;
    if (t.deco === 'stairsup') return g + 0.1;
    return g;
  }

  // ---- visibility (fog of war) ----
  _initVisibility(w, h) {
    if (this.visTex) this.visTex.dispose();
    this.visW = w;
    this.visH = h;
    this.visCur = new Float32Array(w * h).fill(1);
    this.visTarget = new Float32Array(w * h).fill(1);
    this.visData = new Uint8Array(w * h).fill(255);
    this.visTex = new THREE.DataTexture(this.visData, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.visTex.magFilter = THREE.LinearFilter;
    this.visTex.minFilter = THREE.LinearFilter;
    this.visTex.needsUpdate = true;
    shared.uVisTex.value = this.visTex;
    shared.uVisSize.value.set(w, h);
    this.setVisibilityEnabled(false);
  }

  setVisibilityEnabled(on) {
    this.visOn = on;
    shared.uVisOn.value = on ? 1 : 0;
  }

  // levels: Float32Array/array of 0..1 per tile
  setVisibility(levels, instant = false) {
    if (!this.visTarget || levels.length !== this.visTarget.length) return;
    this.visTarget.set(levels);
    if (instant) {
      this.visCur.set(levels);
      for (let i = 0; i < levels.length; i++) this.visData[i] = Math.round(levels[i] * 255);
      this.visTex.needsUpdate = true;
    }
  }

  _updateVisibility(dt) {
    if (!this.visOn || !this.visTarget) return;
    let changed = false;
    const k = Math.min(1, dt * 7);
    const cur = this.visCur, tgt = this.visTarget, data = this.visData;
    for (let i = 0; i < cur.length; i++) {
      const d = tgt[i] - cur[i];
      if (d > 0.004 || d < -0.004) {
        cur[i] += d * k;
        data[i] = Math.round(cur[i] * 255);
        changed = true;
      } else if (cur[i] !== tgt[i]) {
        cur[i] = tgt[i];
        data[i] = Math.round(cur[i] * 255);
        changed = true;
      }
    }
    if (changed) this.visTex.needsUpdate = true;
  }

  // ---- camera ----
  focus(x, y, instant = false) {
    this.rig.tx = x + 0.5;
    this.rig.tz = y + 0.5;
    if (instant) { this.rig.x = this.rig.tx; this.rig.z = this.rig.tz; }
  }

  setZoom(dist, instant = false) {
    this.rig.tdist = clamp(dist, this.rig.minDist, this.rig.maxDist);
    if (instant) this.rig.dist = this.rig.tdist;
  }

  zoomBy(f) { this.setZoom(this.rig.tdist * f); }

  // Fit the world rectangle [x0,x1)x[z0,z1) inside the screen area left free by
  // UI panels (pixel margins), choosing distance and target accordingly.
  frameArea(x0, z0, x1, z1, m = {}) {
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    const left = m.left || 0, right = m.right || 0, top = m.top || 0, bottom = m.bottom || 0;
    const fw = Math.max(100, W - left - right), fh = Math.max(100, H - top - bottom);
    const p = THREE.MathUtils.degToRad(this.rig.pitch);
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = W / H;
    const ww = (x1 - x0) + 0.6, hh = (z1 - z0) + 1.4;
    // world units visible at distance d: width = 2 d t aspect, depth ≈ 2 d t / sin(p)
    const dW = (ww / (2 * t * aspect)) * (W / fw);
    const dH = (hh * Math.sin(p) / (2 * t)) * (H / fh);
    const d = Math.max(dW, dH, this.rig.minDist);
    const unitsPerPx = (2 * d * t * aspect) / W;
    const offX = ((left - right) / 2) * unitsPerPx;
    const offZ = ((top - bottom) / 2) * unitsPerPx / Math.sin(p);
    this.rig.tx = (x0 + x1) / 2 - offX;
    this.rig.tz = (z0 + z1) / 2 - offZ + 0.25;
    this.rig.x = this.rig.tx; this.rig.z = this.rig.tz;
    this.rig.tdist = this.rig.dist = d;
  }

  // world units per screen pixel at the current target distance
  unitsPerPixel() {
    const W = this.container.clientWidth || window.innerWidth;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return (2 * this.rig.tdist * t * (W / (this.container.clientHeight || window.innerHeight))) / W;
  }

  panBy(dx, dz) {
    this.rig.tx += dx;
    this.rig.tz += dz;
  }

  _updateCamera(dt) {
    const r = this.rig;
    const k = 1 - Math.exp(-dt * this.followSpeed);
    r.x += (r.tx - r.x) * k;
    r.z += (r.tz - r.z) * k;
    r.dist += (r.tdist - r.dist) * (1 - Math.exp(-dt * 10));
    const p = THREE.MathUtils.degToRad(r.pitch);
    this.camera.position.set(r.x, Math.sin(p) * r.dist, r.z + Math.cos(p) * r.dist);
    this.camera.lookAt(r.x, 0, r.z);
    // sun follows the view so shadows stay crisp
    const span = clamp(r.dist * 0.75, 8, 40);
    this.sun.position.set(r.x - 12, 30, r.z + 10);
    this.sun.target.position.set(r.x, 0, r.z);
    const sc = this.sun.shadow.camera;
    if (sc.right !== span) {
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 1; sc.far = 80;
      sc.updateProjectionMatrix();
    }
    this.sun.castShadow = r.dist < 60;
  }

  // screen → tile
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, p)) return null;
    return { x: Math.floor(p.x), y: Math.floor(p.z), fx: p.x, fz: p.z };
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height, behind: v.z > 1 };
  }

  // ---- entities ----
  addEntity(id, spec, x, y, opts = {}) {
    this.removeEntity(id);
    const root = new THREE.Group();
    const leanG = new THREE.Group();
    const faceG = new THREE.Group();
    const model = makeModel(spec, this.mats);
    model.traverse((o) => { o.layers.set(1); });
    const info = model.userData.info;
    faceG.add(model);
    leanG.add(faceG);
    root.add(leanG);
    if (!info.noLean) leanG.rotation.x = this.lean;
    const scale = (opts.scale ?? 1) * (info.noLean ? 1 : this.unitScale);
    leanG.scale.setScalar(scale);
    // blob shadow
    if (!info.boat) {
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.3 * scale * (spec.kind === 'dragon' ? 1.6 : 1), 16), this.mats.shadowBlob);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.012;
      blob.renderOrder = 1;
      root.add(blob);
    }
    if (opts.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.42, 24), new THREE.MeshBasicMaterial({ color: opts.ring, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      ring.renderOrder = 2;
      root.add(ring);
      root.userData.ring = ring;
    }
    if (opts.silhouette) {
      const sm = silhouetteMaterial(opts.silhouette);
      const meshes = [];
      model.traverse((o) => { if (o.isMesh && !o.userData.outline) meshes.push(o); });
      for (const o of meshes) {
        const s = new THREE.Mesh(o.geometry, sm);
        s.renderOrder = 10;
        o.parent.add(s);
      }
    }
    const e = {
      id, root, leanG, faceG, model, info, x, y,
      bobPhase: Math.random() * Math.PI * 2,
      anim: null, scale, idle: opts.idle !== false,
      hpBar: null,
    };
    if (opts.facing) this._applyFacing(e, opts.facing[0], opts.facing[1], true);
    root.position.set(x + 0.5, this._entityY(e, x, y), y + 0.5);
    this.entityGroup.add(root);
    this.entities.set(id, e);
    if (opts.hpBar) this.setHpBar(id, opts.hpBar);
    return e;
  }

  _entityY(e, x, y) {
    let h = this.heightAt(x, y);
    if (e.info.hover) h += e.info.hover;
    else if (e.info.float) h += 0.08;
    return h;
  }

  removeEntity(id) {
    const e = this.entities.get(id);
    if (!e) return;
    // never leave a caller waiting on an animation that can no longer finish
    if (e.anim) { const done = e.anim.done; e.anim = null; done && done(); }
    this.entityGroup.remove(e.root);
    e.root.traverse((o) => {
      if (o.isMesh && o.geometry && (o.geometry.type === 'CircleGeometry' || o.geometry.type === 'RingGeometry')) o.geometry.dispose();
    });
    if (e.hpBar) e.hpBar.el.remove();
    this.entities.delete(id);
  }

  clearEntities() {
    for (const id of [...this.entities.keys()]) this.removeEntity(id);
  }

  hasEntity(id) { return this.entities.has(id); }

  setEntityVisible(id, v) {
    const e = this.entities.get(id);
    if (e) {
      e.root.visible = v;
      if (e.hpBar) e.hpBar.el.style.display = v ? '' : 'none';
    }
  }

  setRing(id, color) {
    const e = this.entities.get(id);
    if (!e || !e.root.userData.ring) return;
    if (color == null) e.root.userData.ring.visible = false;
    else { e.root.userData.ring.visible = true; e.root.userData.ring.material.color.setHex(color); }
  }

  _applyFacing(e, dx, dy, instant) {
    if (!dx && !dy) return;
    const ang = Math.atan2(dx, dy);
    e.faceTarget = ang;
    if (instant) e.faceG.rotation.y = ang;
  }

  face(id, dx, dy) {
    const e = this.entities.get(id);
    if (e) this._applyFacing(e, dx, dy, false);
  }

  placeEntity(id, x, y) {
    const e = this.entities.get(id);
    if (!e) return;
    e.x = x; e.y = y;
    e.anim = null;
    e.root.position.set(x + 0.5, this._entityY(e, x, y), y + 0.5);
  }

  moveEntity(id, x, y, duration = 0.16, hop = 0.08) {
    const e = this.entities.get(id);
    if (!e) return Promise.resolve();
    const fx = e.root.position.x, fz = e.root.position.z, fy = e.root.position.y;
    const ty = this._entityY(e, x, y);
    this._applyFacing(e, x - e.x, y - e.y, false);
    e.x = x; e.y = y;
    return new Promise((resolve) => {
      e.anim = {
        t: 0, d: duration,
        update: (k) => {
          const s = k * k * (3 - 2 * k);
          e.root.position.x = fx + (x + 0.5 - fx) * s;
          e.root.position.z = fz + (y + 0.5 - fz) * s;
          e.root.position.y = fy + (ty - fy) * s + Math.sin(k * Math.PI) * hop;
        },
        done: resolve,
      };
    });
  }

  attackAnim(id, tx, ty) {
    const e = this.entities.get(id);
    if (!e) return Promise.resolve();
    const bx = e.x + 0.5, bz = e.y + 0.5, by = e.root.position.y;
    const dx = tx - e.x, dy = ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    this._applyFacing(e, dx, dy, true);
    return new Promise((resolve) => {
      e.anim = {
        t: 0, d: 0.22,
        update: (k) => {
          const s = Math.sin(k * Math.PI) * 0.35;
          e.root.position.x = bx + (dx / len) * s;
          e.root.position.z = bz + (dy / len) * s;
          e.root.position.y = by + Math.sin(k * Math.PI) * 0.06;
        },
        done: () => { e.root.position.set(bx, by, bz); resolve(); },
      };
    });
  }

  hurtAnim(id) {
    const e = this.entities.get(id);
    if (!e) return;
    const base = e.scale;
    this.tween(0.25, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.15;
      e.leanG.scale.set(base * s, base * (2 - s), base * s);
      e.faceG.position.x = Math.sin(k * 40) * 0.03 * (1 - k);
    }, () => { e.leanG.scale.setScalar(base); e.faceG.position.x = 0; });
  }

  dieAnim(id) {
    const e = this.entities.get(id);
    if (!e) return Promise.resolve();
    return new Promise((resolve) => {
      const base = e.scale;
      this.tween(0.45, (k) => {
        e.leanG.rotation.z = k * 1.4;
        e.leanG.scale.setScalar(base * (1 - k * 0.6));
        e.root.position.y -= 0.002;
      }, () => { this.removeEntity(id); resolve(); });
    });
  }

  setHpBar(id, frac) {
    const e = this.entities.get(id);
    if (!e) return;
    if (frac == null) {
      if (e.hpBar) { e.hpBar.el.remove(); e.hpBar = null; }
      return;
    }
    if (!e.hpBar) {
      const el = document.createElement('div');
      el.className = 'hpbar';
      el.innerHTML = '<i></i>';
      this.floatLayer.appendChild(el);
      e.hpBar = { el, fill: el.firstChild };
    }
    const f = clamp(frac, 0, 1);
    e.hpBar.fill.style.width = (f * 100).toFixed(0) + '%';
    e.hpBar.fill.style.background = f > 0.5 ? '#5c5' : f > 0.25 ? '#dc4' : '#d44';
  }

  entityScreenPos(id) {
    const e = this.entities.get(id);
    if (!e) return null;
    const p = e.root.position;
    return this.worldToScreen(p.x, p.y + e.info.height * e.scale * 0.95 + 0.15, p.z - 0.2);
  }

  _updateEntities(dt) {
    for (const e of this.entities.values()) {
      if (e.anim) {
        e.anim.t += dt;
        const k = Math.min(1, e.anim.t / e.anim.d);
        e.anim.update(k);
        if (k >= 1) {
          const done = e.anim.done;
          e.anim = null;
          done && done();
        }
      } else if (e.idle) {
        const bob = e.info.float || e.info.hover ? Math.sin(this.time * 2 + e.bobPhase) * 0.05 : 0;
        e.model.position.y = bob;
        if (!e.info.float && !e.info.noLean) {
          const breathe = 1 + Math.sin(this.time * 2.2 + e.bobPhase) * 0.015;
          e.model.scale.set(1, breathe, 1);
        }
        if (e.info.boat) e.model.rotation.z = Math.sin(this.time * 1.3 + e.bobPhase) * 0.05;
      }
      if (e.faceTarget !== undefined) {
        let d = e.faceTarget - e.faceG.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        e.faceG.rotation.y += d * Math.min(1, dt * 14);
      }
      if (e.hpBar && e.root.visible) {
        const p = this.entityScreenPos(e.id);
        e.hpBar.el.style.transform = `translate(${p.x - 18}px, ${p.y}px)`;
      }
    }
  }

  // ---- overlays ----
  _initOverlays() {
    const mk = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false });
    // tile cursor: square frame
    const frame = new THREE.Group();
    const thick = 0.06;
    const mat = mk(0xffffff);
    for (const [x, z, sx, sz] of [[0.5, thick / 2, 1, thick], [0.5, 1 - thick / 2, 1, thick], [thick / 2, 0.5, thick, 1], [1 - thick / 2, 0.5, thick, 1]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0, z);
      frame.add(m);
    }
    frame.renderOrder = 20;
    frame.traverse((o) => { o.renderOrder = 20; });
    frame.visible = false;
    this.cursor = frame;
    this.cursorMat = mat;
    this.overlayGroup.add(frame);

    const ringGeo = new THREE.RingGeometry(0.96, 1, 48);
    this.brushRing = new THREE.Mesh(ringGeo, mk(0xffe080, 0.8));
    this.brushRing.rotation.x = -Math.PI / 2;
    this.brushRing.renderOrder = 20;
    this.brushRing.visible = false;
    this.overlayGroup.add(this.brushRing);

    this.highlightMesh = null;
    this.highlightMat = new THREE.MeshBasicMaterial({ color: 0x40a0ff, transparent: true, opacity: 0.28, depthWrite: false, depthTest: false });
    this.lineObj = null;
  }

  showCursor(x, y, color = 0xffffff, size = 1) {
    if (x == null) { this.cursor.visible = false; return; }
    this.cursor.visible = true;
    const h = this.heightAt(x, y) + 0.03;
    const off = Math.floor((size - 1) / 2);
    this.cursor.position.set(x - off, h, y - off);
    this.cursor.scale.set(size, 1, size);
    this.cursorMat.color.setHex(color);
  }

  showBrush(fx, fz, radius, color = 0xffe080) {
    if (fx == null) { this.brushRing.visible = false; return; }
    this.brushRing.visible = true;
    this.brushRing.position.set(fx, 0.06, fz);
    this.brushRing.scale.set(radius, radius, 1);
    this.brushRing.material.color.setHex(color);
  }

  setHighlights(tiles, color = 0x40a0ff, opacity = 0.28) {
    if (this.highlightMesh) {
      this.overlayGroup.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh.dispose?.();
      this.highlightMesh = null;
    }
    if (!tiles || !tiles.length) return;
    const geo = new THREE.PlaneGeometry(0.92, 0.92);
    geo.rotateX(-Math.PI / 2);
    // tiles may carry their own colour (e.g. squares to move to and foes to strike)
    const mixed = tiles.some((t) => t.color != null);
    const mat = mixed ? (this.highlightMatMixed ||= this.highlightMat.clone()) : this.highlightMat;
    mat.color.setHex(mixed ? 0xffffff : color);
    mat.opacity = opacity;
    const inst = new THREE.InstancedMesh(geo, mat, tiles.length);
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    tiles.forEach((t, i) => {
      m4.makeTranslation(t.x + 0.5, this.heightAt(t.x, t.y) + 0.025, t.y + 0.5);
      inst.setMatrixAt(i, m4);
      if (mixed) inst.setColorAt(i, c.setHex(t.color ?? color));
    });
    inst.renderOrder = 5;
    this.highlightMesh = inst;
    this.overlayGroup.add(inst);
  }

  setLine(points, color = 0xffe080) {
    if (this.lineObj) {
      this.overlayGroup.remove(this.lineObj);
      this.lineObj.geometry.dispose();
      this.lineObj = null;
    }
    if (!points || points.length < 2) return;
    const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x + 0.5, 0.15, p.y + 0.5)));
    this.lineObj = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
    this.lineObj.renderOrder = 21;
    this.overlayGroup.add(this.lineObj);
  }

  // ---- effects ----
  tween(d, update, done) {
    this.tweens.push({ t: 0, d, update, done });
  }

  wait(sec) {
    return new Promise((res) => this.tween(sec, () => {}, res));
  }

  floatText(x, y, text, color = '#fff', big = false) {
    const el = document.createElement('div');
    el.className = 'float-text' + (big ? ' big' : '');
    el.textContent = text;
    el.style.color = color;
    this.floatLayer.appendChild(el);
    const h = this.heightAt(x, y) + 1.1;
    this.floaters.push({ el, x: x + 0.5, y: h, z: y + 0.5, t: 0, d: 1.1 });
  }

  _updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const k = f.t / f.d;
      if (k >= 1) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      const p = this.worldToScreen(f.x, f.y + k * 0.6, f.z);
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${1 + Math.sin(Math.min(1, k * 4) * Math.PI) * 0.25})`;
      f.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
  }

  burst(x, y, color = 0xff4040, count = 10, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const baseY = this.heightAt(x, y) + (opts.y ?? 0.45);
    const parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.layers.set(1);
      m.position.set(x + 0.5, baseY, y + 0.5);
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 1.6) * (0.5 + Math.random());
      m.userData.v = new THREE.Vector3(Math.cos(a) * sp, (opts.up ?? 1.5) * (0.5 + Math.random()), Math.sin(a) * sp);
      this.fxGroup.add(m);
      parts.push(m);
    }
    const g = opts.gravity ?? -5;
    this.particles.push({ parts, mat, geo, t: 0, d: opts.duration ?? 0.7, g });
  }

  sparkle(x, y, color = 0x80ffa0, count = 14) {
    this.burst(x, y, color, count, { speed: 0.35, up: 1.2, gravity: 0.6, duration: 1.0, y: 0.1 });
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      const k = p.t / p.d;
      for (const m of p.parts) {
        m.userData.v.y += p.g * dt;
        m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += dt * 5;
        m.rotation.y += dt * 4;
      }
      p.mat.opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        for (const m of p.parts) this.fxGroup.remove(m);
        p.mat.dispose();
        p.geo.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  projectile(fx, fy, tx, ty, color = 0xffa040, size = 0.12, speed = 9) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.IcosahedronGeometry(size, 0);
    const m = new THREE.Mesh(geo, mat);
    m.layers.set(1);
    const a = new THREE.Vector3(fx + 0.5, this.heightAt(fx, fy) + 0.5, fy + 0.5);
    const b = new THREE.Vector3(tx + 0.5, this.heightAt(tx, ty) + 0.45, ty + 0.5);
    const dist = a.distanceTo(b);
    const d = Math.max(0.12, dist / speed);
    m.position.copy(a);
    this.fxGroup.add(m);
    return new Promise((resolve) => {
      this.tween(d, (k) => {
        m.position.lerpVectors(a, b, k);
        m.position.y += Math.sin(k * Math.PI) * dist * 0.08;
        m.rotation.y += 0.3;
      }, () => {
        this.fxGroup.remove(m);
        geo.dispose();
        mat.dispose();
        resolve();
      });
    });
  }

  // An arrow (or sling stone / bolt) flying in an arc, nose along its path
  arrow(fx, fy, tx, ty, opts = {}) {
    const kind = opts.kind || 'arrow';
    const g = new THREE.Group();
    const mats = [];
    const mk = (geo, color, x = 0, y = 0, z = 0, rx = 0) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      mats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.layers.set(1);
      g.add(m);
    };
    if (kind === 'stone') mk(new THREE.IcosahedronGeometry(0.06, 0), 0x9a958c);
    else {
      const len = kind === 'bolt' ? 0.34 : 0.5;
      mk(new THREE.CylinderGeometry(0.012, 0.012, len, 5), opts.shaft ?? 0x8a6a42, 0, 0, 0, Math.PI / 2);
      mk(new THREE.ConeGeometry(0.03, 0.08, 5), opts.head ?? 0xd8dce4, 0, 0, len / 2 + 0.04, Math.PI / 2);
      mk(new THREE.BoxGeometry(0.06, 0.004, 0.09), opts.fletch ?? 0xe8e0d0, 0, 0, -len / 2 + 0.05);
      mk(new THREE.BoxGeometry(0.004, 0.06, 0.09), opts.fletch ?? 0xe8e0d0, 0, 0, -len / 2 + 0.05);
      if (opts.glow) mk(new THREE.SphereGeometry(0.05, 8, 6), opts.glow, 0, 0, len / 2 + 0.02);
    }
    const a = new THREE.Vector3(fx + 0.5, this.heightAt(fx, fy) + 0.55, fy + 0.5);
    const b = new THREE.Vector3(tx + 0.5, this.heightAt(tx, ty) + 0.45, ty + 0.5);
    const dist = a.distanceTo(b);
    const d = Math.max(0.12, dist / (opts.speed || 16));
    const arc = dist * (kind === 'stone' ? 0.1 : 0.07);
    g.position.copy(a);
    this.fxGroup.add(g);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const at = (k, out) => { out.lerpVectors(a, b, k); out.y += Math.sin(k * Math.PI) * arc; return out; };
    return new Promise((resolve) => {
      this.tween(d, (k) => {
        at(k, p);
        at(Math.min(1, k + 0.02), q);
        g.position.copy(p);
        if (q.distanceToSquared(p) > 1e-8) g.lookAt(q);
      }, () => {
        this.fxGroup.remove(g);
        g.traverse((o) => o.geometry && o.geometry.dispose());
        for (const m of mats) m.dispose();
        resolve();
      });
    });
  }

  flash(color = '#fff', ms = 160) {
    const el = document.createElement('div');
    el.className = 'screen-flash';
    el.style.background = color;
    this.container.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => el.remove(), ms + 300);
  }

  shake(amount = 0.15, d = 0.3) {
    this.tween(d, (k) => {
      const a = amount * (1 - k);
      this.rig.x += (Math.random() - 0.5) * a;
      this.rig.z += (Math.random() - 0.5) * a;
    });
  }

  clearFx() {
    for (const p of this.particles) for (const m of p.parts) this.fxGroup.remove(m);
    this.particles = [];
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    this.setHighlights(null);
    this.setLine(null);
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    shared.uTime.value = this.time;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.update(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done && tw.done();
      }
    }
    if (this.onTick) this.onTick(dt);
    this.terrain.update();
    this._updateCamera(dt);
    this._updateEntities(dt);
    this._updateParticles(dt);
    this._updateFloaters(dt);
    this._updateVisibility(dt);
    const r = this.renderer;
    r.shadowMap.needsUpdate = true;
    r.clear();
    this.camera.layers.set(0);
    r.render(this.scene, this.camera);
    r.clearDepth();
    this.camera.layers.set(1);
    r.render(this.scene, this.camera);
  }
}
