// The 3D view: renderer, fixed north-up camera rig, lights and atmosphere,
// terrain, entity visuals, overlays and effects.
import * as THREE from 'three';
import { createMaterials, shared, silhouetteMaterial } from './materials.js';
import { TerrainView, WATER_Y, LAVA_Y } from './terrainView.js';
import { makeModel } from './models.js';
import { terrain } from '../data/terrain.js';
import { getTile } from '../world/map.js';
import { clamp } from '../core/util.js';

// the camera's default angle above the horizon
export const DEFAULT_PITCH = 52;

const _tmpColor = new THREE.Color();
const _v3 = new THREE.Vector3();

// where each member of a travelling company stands on its square, by size
const PARTY_FORMATION = [
  [[0, 0]],
  [[0, 0.05]],
  [[-0.14, 0.12], [0.14, -0.12]],
  [[0, 0.2], [-0.22, -0.1], [0.22, -0.1]],
  [[-0.13, 0.2], [0.17, 0.16], [-0.2, -0.16], [0.12, -0.2]],
  [[0, 0.26], [-0.25, 0.06], [0.25, 0.06], [-0.16, -0.24], [0.16, -0.24]],
  [[-0.14, 0.28], [0.16, 0.26], [-0.3, -0.02], [0.3, -0.02], [-0.12, -0.28], [0.16, -0.26]],
  [[0, 0.3], [-0.24, 0.12], [0.24, 0.12], [-0.32, -0.16], [0, -0.14], [0.32, -0.16], [-0.14, -0.36]],
  [[0, 0.3], [-0.24, 0.12], [0.24, 0.12], [-0.32, -0.16], [0, -0.14], [0.32, -0.16], [-0.16, -0.36], [0.16, -0.36]],
];

// bg: haze/fog colour, sky: colour mirrored in water, light: strength of
// torch and lava pools, party: the glow carried by the party
const LIGHTING = {
  day: { bg: 0xb4cfe4, sky: 0xa6d0f0, hemiSky: 0xc4dcff, hemiGround: 0x5e4a30, hemi: 1.15, sun: 3.1, sunColor: 0xffe4bc, light: 0, party: 0, fogNear: 1.35, fogFar: 3.6 },
  dusk: { bg: 0x6c5a78, sky: 0xe8a07a, hemiSky: 0x9a90d0, hemiGround: 0x3a2830, hemi: 0.95, sun: 2.0, sunColor: 0xffa060, light: 0.75, party: 0.35, fogNear: 1.2, fogFar: 3.2 },
  night: { bg: 0x121a2e, sky: 0x2c3e66, hemiSky: 0x5a78c8, hemiGround: 0x16141e, hemi: 0.85, sun: 0.8, sunColor: 0x9ab0ff, light: 1.0, party: 0.85, fogNear: 1.05, fogFar: 2.8 },
  dark: { bg: 0x060508, sky: 0x141a22, hemiSky: 0x8090b8, hemiGround: 0x30241a, hemi: 0.8, sun: 0.55, sunColor: 0xb0bcdc, light: 1.0, party: 1.0, fogNear: 1.0, fogFar: 2.6 },
};
const SUN_DIR = new THREE.Vector3(-0.52, 0.74, 0.42).normalize();

export class View {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb4cfe4, 20, 60);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.camera.layers.enableAll();
    this.mats = createMaterials();

    // cool sky fill and a warm key sun
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.radius = 3;
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
    this.rig = { x: 8, y: 0, z: 8, tx: 8, tz: 8, dist: 12, tdist: 12, pitch: DEFAULT_PITCH, minDist: 4, maxDist: 80 };
    this.followSpeed = 8;
    this.unitScale = 1.3;
    this.cutFocus = new Set();
    this.setPitch(DEFAULT_PITCH);

    this.tweens = [];
    this.particles = [];
    this.floaters = [];
    this.clock = new THREE.Clock();
    this.time = 0;
    this.onTick = null;

    // a soft vignette frames the diorama
    this.vignette = document.createElement('div');
    this.vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 46%, rgba(0,0,0,0) 58%, rgba(12,8,4,.32) 100%);';
    container.appendChild(this.vignette);
    this.floatLayer = document.createElement('div');
    this.floatLayer.className = 'float-layer';
    container.appendChild(this.floatLayer);

    this._initOverlays();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.visOn = false;
    this.light = { ...LIGHTING.day };
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

  // Degrees above the horizon. Figures always stand upright.
  setPitch(deg) {
    this.rig.pitch = clamp(deg || DEFAULT_PITCH, 35, 80);
  }

  _applyLight(L) {
    this.light = L;
    this.renderer.setClearColor(L.bg, 1);
    this.scene.fog.color.setHex(L.bg);
    this.hemi.color.setHex(L.hemiSky);
    this.hemi.groundColor.setHex(L.hemiGround);
    this.hemi.intensity = L.hemi;
    this.sun.color.setHex(L.sunColor);
    this.sun.intensity = L.sun;
    shared.uSky.value.setHex(L.sky);
    shared.uLightOn.value = L.light;
  }

  setLighting(name) {
    const L = LIGHTING[name] || LIGHTING.day;
    this.lighting = name;
    this._applyLight({ ...L });
  }

  // Blend the outdoor light through the day: 0 = full day, 0.5 = dusk, 1 = night
  setDaylight(k) {
    const D = LIGHTING.day, U = LIGHTING.dusk, N = LIGHTING.night;
    const [A, B, t] = k < 0.5 ? [D, U, k * 2] : [U, N, (k - 0.5) * 2];
    this.lighting = k > 0.75 ? 'night' : k > 0.25 ? 'dusk' : 'day';
    const L = {};
    for (const key of Object.keys(A)) {
      L[key] = ['bg', 'sky', 'hemiSky', 'hemiGround', 'sunColor'].includes(key)
        ? _tmpColor.setHex(A[key]).lerp(new THREE.Color(B[key]), t).getHex()
        : A[key] + (B[key] - A[key]) * t;
    }
    this._applyLight(L);
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
    if (t.key === 'bridge') return 0.05;
    if (t.water) return WATER_Y;
    if (t.key === 'lava') return LAVA_Y;
    const g = this.terrain.groundAt(x, y);
    if (t.wall) return g + t.h;
    if (t.deco === 'stairsup') return g + 0.1;
    return g;
  }

  // what a ray from the camera meets: ground, water or the top of a wall
  surfaceAt(px, pz) {
    const tx = Math.floor(px), ty = Math.floor(pz);
    if (this.map && tx >= 0 && ty >= 0 && tx < this.map.w && ty < this.map.h) {
      const t = terrain(getTile(this.map, tx, ty));
      if (t.water) return t.key === 'bridge' ? 0.05 : WATER_Y;
      if (t.wall) return this.terrain.groundAt(tx, ty) + t.h;
    }
    return Math.max(this.terrain.heightAtPoint(px, pz), WATER_Y);
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
    if (instant) { this.rig.x = this.rig.tx; this.rig.z = this.rig.tz; this.rig.y = this._lookY(this.rig.x, this.rig.z); }
  }

  setZoom(dist, instant = false) {
    this.rig.tdist = clamp(dist, this.rig.minDist, this.rig.maxDist);
    if (instant) this.rig.dist = this.rig.tdist;
  }

  zoomBy(f) { this.setZoom(this.rig.tdist * f); }

  // the height the camera aims at: the ground under the target, gently
  _lookY(x, z) {
    if (!this.map) return 0;
    return clamp(this.terrain.heightAtPoint(x, z), -0.1, 0.6);
  }

  _place(cam, x, y, z, dist) {
    const p = THREE.MathUtils.degToRad(this.rig.pitch);
    cam.position.set(x, y + Math.sin(p) * dist, z + Math.cos(p) * dist);
    cam.lookAt(x, y, z);
    cam.updateMatrixWorld();
  }

  // Fit the world rectangle [x0,x1)x[z0,z1) inside the screen area left free by
  // UI panels (pixel margins), choosing distance and target accordingly. The
  // far edge allows for figures standing on it.
  frameArea(x0, z0, x1, z1, m = {}) {
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    const left = m.left || 0, right = m.right || 0, top = m.top || 0, bottom = m.bottom || 0;
    const fw = Math.max(100, W - left - right), fh = Math.max(100, H - top - bottom);
    const cam = this.camera;
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    const pts = [[x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1], [x0 + 0.3, 1.1, z0 + 0.2], [x1 - 0.3, 1.1, z0 + 0.2]];
    const box = (tx, tz, d) => {
      this._place(cam, tx, 0, tz, d);
      let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
      for (const [px, py, pz] of pts) {
        _v3.set(px, py, pz).project(cam);
        const sx = (_v3.x * 0.5 + 0.5) * W, sy = (-_v3.y * 0.5 + 0.5) * H;
        ax = Math.min(ax, sx); bx = Math.max(bx, sx); ay = Math.min(ay, sy); by = Math.max(by, sy);
      }
      return [ax, bx, ay, by];
    };
    let tx = (x0 + x1) / 2, tz = (z0 + z1) / 2, d = 10;
    const p = THREE.MathUtils.degToRad(this.rig.pitch);
    for (let iter = 0; iter < 4; iter++) {
      let lo = this.rig.minDist, hi = 400;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2;
        const [ax, bx, ay, by] = box(tx, tz, mid);
        if (bx - ax <= fw && by - ay <= fh) hi = mid; else lo = mid;
      }
      d = hi;
      const [ax, bx, ay, by] = box(tx, tz, d);
      const upp = (2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / H;
      const dx = (left + fw / 2) - (ax + bx) / 2, dy = (top + fh / 2) - (ay + by) / 2;
      tx -= dx * upp;
      tz -= dy * upp / Math.sin(p);
    }
    const r = this.rig;
    r.tx = r.x = tx;
    r.tz = r.z = tz;
    r.y = 0;
    r.tdist = r.dist = d;
    this._fixed = 0.6; // hold the aim at y = 0 while the framing settles
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
    if (this._fixed > 0) this._fixed -= dt;
    else r.y += (this._lookY(r.x, r.z) - r.y) * (1 - Math.exp(-dt * 3));
    this._place(this.camera, r.x, r.y, r.z, r.dist);
    // fog and haze scale with the zoom
    const L = this.light;
    this.scene.fog.near = r.dist * L.fogNear;
    this.scene.fog.far = r.dist * L.fogFar;
    // the sun follows the view so shadows stay crisp: cover the visible ground,
    // which reaches further north (up the screen) than south
    const span = clamp(r.dist * 0.9, 6, 46);
    const cx = r.x, cz = r.z - r.dist * 0.12;
    this.sun.position.set(cx + SUN_DIR.x * 40, r.y + SUN_DIR.y * 40, cz + SUN_DIR.z * 40);
    this.sun.target.position.set(cx, r.y, cz);
    const sc = this.sun.shadow.camera;
    if (sc.right !== span) {
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 5; sc.far = 90;
      sc.updateProjectionMatrix();
    }
    this.sun.castShadow = r.dist < 60;
  }

  // screen → tile: march the ray down to whatever surface it meets first
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray, o = ray.origin, d = ray.direction;
    const p = new THREE.Vector3();
    if (this.map && d.y < -1e-4) {
      let t = Math.max(0, (2.5 - o.y) / d.y);
      const end = (-2.6 - o.y) / d.y;
      const step = 0.06;
      let prev = t;
      for (; t <= end; t += step) {
        ray.at(t, p);
        if (p.y <= this.surfaceAt(p.x, p.z)) {
          // refine between the last point above and this one below
          let a = prev, b = t;
          for (let k = 0; k < 8; k++) {
            const m = (a + b) / 2;
            ray.at(m, p);
            if (p.y <= this.surfaceAt(p.x, p.z)) b = m; else a = m;
          }
          ray.at(b, p);
          return { x: Math.floor(p.x), y: Math.floor(p.z), fx: p.x, fz: p.z };
        }
        prev = t;
      }
    }
    if (!ray.intersectPlane(this.groundPlane, p)) return null;
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
    const leanG = new THREE.Group(); // scale group (squash on hurt, topple on death)
    const faceG = new THREE.Group();
    const model = spec.kind === 'party' ? this._partyModel(spec) : makeModel(spec, this.mats);
    const info = model.userData.info;
    faceG.add(model);
    leanG.add(faceG);
    root.add(leanG);
    const scale = (opts.scale ?? 1) * (info.noLean ? 1 : this.unitScale);
    leanG.scale.setScalar(scale);
    // soft contact shadow under the feet
    if (!info.boat) {
      const r = info.group ? 0.5 : 0.3 * scale * (spec.kind === 'dragon' ? 1.6 : 1);
      const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 20), this.mats.shadowBlob);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.035;
      blob.renderOrder = 1;
      root.add(blob);
    }
    if (opts.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.43, 32), new THREE.MeshBasicMaterial({
        color: opts.ring, transparent: true, opacity: 0.9, depthWrite: false, fog: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
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

  // The whole company on one square, leader in front and the rest in ranks
  // behind, every figure standing upright.
  _partyModel(spec) {
    const looks = spec.members || [];
    const spots = PARTY_FORMATION[Math.min(looks.length, PARTY_FORMATION.length - 1)] || [[0, 0]];
    const group = new THREE.Group();
    const k = spec.figureScale ?? 0.78;
    let height = 0;
    looks.forEach((look, i) => {
      const m = makeModel(look, this.mats);
      const lg = new THREE.Group();
      lg.add(m);
      lg.scale.setScalar(this.unitScale * k);
      const [ox, oz] = spots[i] || [0, 0];
      lg.position.set(ox, 0, oz);
      group.add(lg);
      height = Math.max(height, m.userData.info.height * this.unitScale * k);
    });
    group.userData.info = { height: height || 1, noLean: true, group: true, float: false, hover: 0 };
    return group;
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
    this.cutFocus.delete(id);
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
    // the unit whose turn it is (white ring) is always seen through scenery
    if (color === 0xffffff) this.cutFocus.add(id); else this.cutFocus.delete(id);
  }

  // keep an entity visible through walls and trees in front of it
  setCutFocus(id, on = true) {
    if (on) this.cutFocus.add(id); else this.cutFocus.delete(id);
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
    return this.worldToScreen(p.x, p.y + e.info.height * e.scale * 1.0 + 0.12, p.z);
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

  // ---- cutaway & carried light ----
  // Scenery between the camera and the party (or the unit whose turn it is,
  // or the square under the cursor) dithers away in a circle around them.
  _updateCutaway() {
    const cuts = shared.uCut.value, ys = shared.uCutY.value;
    const pr = this.renderer.getPixelRatio();
    const H = this._h || 1;
    let n = 0;
    const add = (x, y, z, h, rad) => {
      if (n >= 4) return;
      const a = this.worldToScreen(x, y, z), b = this.worldToScreen(x, y + h, z);
      const px = Math.abs(a.y - b.y);
      // sized to the figure on screen, so a far-off party doesn't punch big holes
      const r = px * 1.25 + rad * Math.min(1, px / 50);
      cuts[n].set(((a.x + b.x) / 2) * pr, (H - (a.y + b.y) / 2) * pr, r * pr, z - 0.1);
      ys.setComponent(n, y + 0.08);
      n++;
    };
    const ent = (e, extra = 0) => {
      if (!e.root.visible) return;
      const p = e.root.position;
      add(p.x, p.y, p.z, e.info.height * e.scale, 22 + extra);
    };
    const party = this.entities.get('party');
    if (party) ent(party, party.info.group ? 26 : 0);
    for (const id of this.cutFocus) { const e = this.entities.get(id); if (e && e !== party) ent(e); }
    if (this.cursor.visible && this.map?.type === 'arena') {
      const c = this.cursor.position, s = this.cursor.scale.x;
      add(c.x + s / 2, c.y, c.z + s / 2, 0.9, 34 + s * 10);
    }
    shared.uCutN.value = n;
    // the party's own torchlight at night and underground
    const L = this.light;
    if (party && L.party > 0) {
      const p = party.root.position;
      shared.uParty.value.set(p.x, p.z, 4.6, L.party);
    } else shared.uParty.value.set(0, 0, 0, 0);
  }

  // ---- overlays ----
  _initOverlays() {
    // seen-through copies: what scenery hides still shows faintly
    const pair = (color, opacity) => {
      const front = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
      const back = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
      return [front, back];
    };
    // tile cursor: square frame
    const frame = new THREE.Group();
    const thick = 0.07;
    const [mat, matBack] = pair(0xffffff, 0.95);
    for (const m of [mat, matBack]) {
      for (const [x, z, sx, sz] of [[0.5, thick / 2, 1, thick], [0.5, 1 - thick / 2, 1, thick], [thick / 2, 0.5, thick, 1], [1 - thick / 2, 0.5, thick, 1]]) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), m);
        q.rotation.x = -Math.PI / 2;
        q.position.set(x, 0, z);
        q.renderOrder = 20;
        frame.add(q);
      }
    }
    frame.visible = false;
    this.cursor = frame;
    this.cursorMat = mat;
    this.cursorMatBack = matBack;
    this.overlayGroup.add(frame);

    const ringGeo = new THREE.RingGeometry(0.96, 1, 48);
    this.brushRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, fog: false }));
    this.brushRing.rotation.x = -Math.PI / 2;
    this.brushRing.renderOrder = 20;
    this.brushRing.visible = false;
    this.overlayGroup.add(this.brushRing);

    this.highlightMesh = null;
    const [hm, hb] = pair(0x40a0ff, 0.28);
    this.highlightMat = hm;
    this.highlightMatBack = hb;
    this.lineObj = null;
  }

  showCursor(x, y, color = 0xffffff, size = 1) {
    if (x == null) { this.cursor.visible = false; return; }
    this.cursor.visible = true;
    const off = Math.floor((size - 1) / 2);
    // sit on the highest point of the square so the frame is never buried
    let h = this.heightAt(x, y);
    for (const [px, pz] of [[x + 0.05, y + 0.05], [x + 0.95, y + 0.05], [x + 0.05, y + 0.95], [x + 0.95, y + 0.95], [x + 0.5, y + 0.5]]) h = Math.max(h, this.surfaceAt(px, pz));
    this.cursor.position.set(x - off, h + 0.04, y - off);
    this.cursor.scale.set(size, 1, size);
    this.cursorMat.color.setHex(color);
    this.cursorMatBack.color.setHex(color);
  }

  showBrush(fx, fz, radius, color = 0xffe080) {
    if (fx == null) { this.brushRing.visible = false; return; }
    this.brushRing.visible = true;
    this.brushRing.position.set(fx, Math.max(0.06, this.surfaceAt(fx, fz) + 0.06), fz);
    this.brushRing.scale.set(radius, radius, 1);
    this.brushRing.material.color.setHex(color);
  }

  // Squares drawn on the ground, following its rise and fall
  setHighlights(tiles, color = 0x40a0ff, opacity = 0.28) {
    if (this.highlightMesh) {
      this.overlayGroup.remove(this.highlightMesh);
      this.highlightMesh.traverse((o) => o.geometry && o.geometry.dispose());
      this.highlightMesh = null;
    }
    if (!tiles || !tiles.length) return;
    const pos = [], col = [];
    const c = new THREE.Color();
    const inset = 0.05, N = 2;
    for (const t of tiles) {
      c.setHex(t.color ?? color);
      const at = (u, v) => {
        const px = t.x + inset + (1 - 2 * inset) * u, pz = t.y + inset + (1 - 2 * inset) * v;
        return [px, this.surfaceAt(px, pz) + 0.035, pz];
      };
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = at(i / N, (j + 1) / N), b = at((i + 1) / N, (j + 1) / N), cc = at((i + 1) / N, j / N), d = at(i / N, j / N);
        for (const v of [a, b, cc, a, cc, d]) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    for (const m of [this.highlightMat, this.highlightMatBack]) {
      m.vertexColors = true;
      m.color.setHex(0xffffff);
      m.needsUpdate = true;
    }
    this.highlightMat.opacity = opacity;
    this.highlightMatBack.opacity = opacity * 0.5;
    const g = new THREE.Group();
    const front = new THREE.Mesh(geo, this.highlightMat);
    const back = new THREE.Mesh(geo, this.highlightMatBack);
    front.renderOrder = 5;
    back.renderOrder = 4;
    g.add(back, front);
    this.highlightMesh = g;
    this.overlayGroup.add(g);
  }

  setLine(points, color = 0xffe080) {
    if (this.lineObj) {
      this.overlayGroup.remove(this.lineObj);
      this.lineObj.geometry.dispose();
      this.lineObj = null;
    }
    if (!points || points.length < 2) return;
    const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x + 0.5, this.heightAt(p.x, p.y) + 0.15, p.y + 0.5)));
    this.lineObj = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, fog: false }));
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
    // a slow device still moves at a sensible pace
    const dt = Math.min(0.1, this.clock.getDelta());
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
    this._updateCutaway();
    const r = this.renderer;
    r.shadowMap.needsUpdate = true;
    // one pass: figures are depth-tested against the scenery like everything
    // else; the cutaway keeps them in view
    shared.uFx.value = 1;
    r.render(this.scene, this.camera);
    shared.uFx.value = 0;
  }
}
