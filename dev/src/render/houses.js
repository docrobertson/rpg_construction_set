// Settlement buildings as buildings: every room found by findBuildings gets
// proper walls (timber-framed plaster or coursed stone, windows with shutters
// and flower boxes, framed doors), a roof, a chimney with smoke where there is
// a hearth and a hanging sign when a shopkeeper lives there.
//
// All buildings of a map are merged into one mesh (one draw call plus its
// shadow). Each vertex carries a tag: which building it belongs to and
// whether it is roof, front wall or window glass. A small uniform table per
// building then fades the roof and the upper front wall away (Ultima-style)
// when the party goes inside, lifts and lights the roof when the player points
// at it, makes windows glow at night and keeps the roof lit whenever any of
// the building can be seen.
import * as THREE from 'three';
import { TPL } from './builder.js';
import { AuxBuilder } from './decor.js';
import { roofRect, ROOFS, chimney, keepTop, stepRoof, beam, col } from './roofs.js';
import { hangingSign, wallSign, SIGN_FOR } from './signs.js';
import { shared } from './materials.js';
import { terrain, T } from '../data/terrain.js';
import { findBuildings, buildingMap } from '../world/buildings.js';
import { getTile, inBounds } from '../world/map.js';
import { hash2 } from '../core/rng.js';

const MAXB = 48;
const F_ROOF = 1, F_FRONT = 2, F_GLASS = 4;
const OWNABLE = new Set(['wall_wood', 'wall_stone', 'window', 'door', 'door_locked']);
const PROPS = new Set(['well', 'stall', 'lamppost', 'cart', 'hay', 'barrel', 'statue', 'fountain']);
const DIRS = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };

// AuxBuilder that also stamps every vertex with the current building tag
class TagBuilder extends AuxBuilder {
  constructor() { super(); this.tags = []; this.tag = 0; }
  _pad(a) {
    super._pad(a);
    const n = this.pos.length / 3;
    while (this.tags.length < n) this.tags.push(this.tag);
  }
  build() {
    const g = super.build();
    g.setAttribute('btag', new THREE.Float32BufferAttribute(this.tags, 1));
    return g;
  }
}

// ---------------------------------------------------------------- materials
function buildingMaterial(mats, U) {
  const m = mats.props.clone();
  const base = mats.props.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    base(shader, r);
    shader.uniforms.uB = U.uB;
    shader.uniforms.uBHi = U.uBHi;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float btag;
        uniform vec4 uB[${MAXB}];
        uniform vec2 uBHi;
        varying float vBFlags;
        varying vec4 vBState;
        varying float vBHi;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float bq = floor(btag / 8.0 + 0.01);
          vBFlags = btag - bq * 8.0;
          vBState = vec4(0.0);
          vBHi = 0.0;
          if (bq > 0.5) {
            vBState = uB[int(bq - 1.0)];
            if (abs(bq - 1.0 - uBHi.x) < 0.5) vBHi = uBHi.y;
            // the pointed-at building's roof lifts a little
            if (mod(vBFlags, 2.0) > 0.5) transformed.y += vBHi * 0.24;
          }
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vBFlags;
        varying vec4 vBState;
        varying float vBHi;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          // roofs and the top of the front wall dissolve while the party is inside
          float isRoof = mod(vBFlags, 2.0);
          float isFront = mod(floor(vBFlags / 2.0), 2.0);
          float k = isRoof > 0.5 ? vBState.x : isFront > 0.5 ? vBState.x * smoothstep(vBState.w + 0.2, vBState.w + 0.3, vWorldPos.y) : 0.0;
          if (k > 0.001 && fxBayer(gl_FragCoord.xy) < k * 1.06) discard;
        }`)
      .replace('outgoingLight += diffuseColor.rgb * fxLight();', 'outgoingLight += diffuseColor.rgb * fxLight() * (mod(vBFlags, 2.0) > 0.5 ? 0.2 : 1.0);')
      .replace('#include <opaque_fragment>', `
        if (vBFlags > 3.5) {
          // window glass: dark panes that catch the sky by day, a warm glow at night
          float night = clamp(uLightOn * 1.2, 0.0, 1.0);
          vec3 day = vec3(0.07, 0.09, 0.13) + uSky * 0.22 + diffuseColor.rgb * 0.06;
          vec3 lit = diffuseColor.rgb * (1.25 + 0.12 * sin(uTime * 2.3 + vWorldPos.x * 3.1 + vWorldPos.z));
          outgoingLight = mix(day + outgoingLight * 0.1, lit, night);
        }
        outgoingLight += vBHi * (diffuseColor.rgb * 0.32 + vec3(0.1, 0.07, 0.0)) * (0.85 + 0.15 * sin(uTime * 5.0));
        #include <opaque_fragment>`)
      .replace('gl_FragColor.rgb *= vis;', 'vis = max(vis, vBState.y); gl_FragColor.rgb *= vis;');
  };
  m.customProgramCacheKey = () => 'buildings1';
  return m;
}

// shadows follow the fade: an open building lets the sun in
function depthMaterial(U) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uB = U.uB;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float btag;
        uniform vec4 uB[${MAXB}];
        varying float vCutK;
        varying float vCutY;
        varying float vCutF;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float bq = floor(btag / 8.0 + 0.01);
          float fl = btag - bq * 8.0;
          vec4 st = bq > 0.5 ? uB[int(bq - 1.0)] : vec4(0.0);
          vCutK = mod(fl, 2.0) > 0.5 ? st.x : 0.0;
          vCutF = mod(floor(fl / 2.0), 2.0) > 0.5 ? st.x : 0.0;
          vCutY = (modelMatrix * vec4(transformed, 1.0)).y - st.w;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vCutK;
        varying float vCutY;
        varying float vCutF;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vCutK > 0.5 || (vCutF > 0.5 && vCutY > 0.25)) discard;`);
  };
  m.customProgramCacheKey = () => 'buildingsDepth1';
  return m;
}

// chimney smoke: soft puffs that rise, swell and thin out (one draw call)
function smokeMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xe4e0dc, transparent: true, opacity: 0.6, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute vec4 puff;
        varying float vSmokeT;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float t = fract(uTime * 0.11 + puff.w);
          float s = 0.1 + t * 0.34;
          vec3 drift = vec3(t * 0.55 + sin(t * 5.0 + puff.w * 31.0) * 0.07, t * 1.7, -t * 0.25);
          transformed = puff.xyz + transformed * s + drift;
          vSmokeT = t;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vSmokeT;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a *= (1.0 - vSmokeT) * smoothstep(0.0, 0.15, vSmokeT);`);
  };
  m.customProgramCacheKey = () => 'smoke1';
  return m;
}

// ---------------------------------------------------------------- looks
// A whole settlement's character, from who lives there and what it is made of
export function settlementStyle(map) {
  if (map.buildStyle) return map.buildStyle;
  if (map.type === 'castle') return 'castle';
  const races = { human: 0, elf: 0, dwarf: 0 };
  for (const e of map.entities || []) if (e.type === 'npc') races[e.look?.race || e.race || 'human'] = (races[e.look?.race || e.race || 'human'] || 0) + 1;
  if (races.dwarf > races.human && races.dwarf >= races.elf) return 'dwarven';
  if (races.elf > races.human) return 'elven';
  let pal = 0, road = 0, cob = 0;
  for (const t of map.tiles) { if (t === T.palisade) pal++; else if (t === T.road) road++; else if (t === T.cobble) cob++; }
  if (pal > 8 || road > cob) return 'village';
  return 'town';
}

const PLASTER = {
  town: [0xf0e4c8, 0xe9d3a6, 0xf4ece0, 0xe8cdb6, 0xdcd8c6, 0xeedcb0],
  village: [0xece0c4, 0xe2d0a8, 0xf0e8d4],
  elven: [0xf6f2e6, 0xeef0e2, 0xf4eedc],
  castle: [0xeee6d4],
  dwarven: [0xb0a898],
};
const TIMBER = { town: [0x4a2e1c, 0x55361f, 0x3e2818], village: [0x5a3e26, 0x4e3420], elven: [0xd6cab0, 0xcfc2a4], castle: [0x4a2e1c], dwarven: [0x3a3430] };
const SHUTTERS = [0x3a6a4a, 0x2e5a8a, 0x8a3a2a, 0x4a7a8a, 0x6a4a2a, 0x7a6a2a];
const STONE = { castle: 0xbdb6a6, dwarven: 0x7c7670, temple: 0xe2ddd0, town: 0xc4bcaa, elven: 0xe8e4d8, village: 0xb8b0a0 };

function lookFor(style, b, rimStone, size) {
  const h = (k) => hash2(b.box.x0 * 3 + k, b.box.y0 * 5 - k, 7177);
  const role = b.keeper?.role;
  const L = { style, stone: rimStone, H: 1.3, plaster: 0xf0e4c8, timber: 0x4a2e1c, shutters: SHUTTERS[Math.floor(h(1) * SHUTTERS.length)], braces: true };
  L.plaster = (PLASTER[style] || PLASTER.town)[Math.floor(h(2) * (PLASTER[style] || PLASTER.town).length)];
  L.timber = (TIMBER[style] || TIMBER.town)[Math.floor(h(3) * (TIMBER[style] || TIMBER.town).length)];
  L.stoneC = role === 'healer' && style !== 'dwarven' ? STONE.temple : STONE[style] || STONE.town;
  L.roofOpt = {};
  switch (style) {
    case 'castle':
      L.H = 1.45;
      if (size.w >= 9 && size.d >= 7) { L.keep = true; L.H = 1.95; }
      L.roof = ROOFS.bluslate;
      break;
    case 'elven':
      L.H = 1.4; L.braces = false; L.arched = true;
      L.roof = ROOFS.elven;
      L.shutters = [0x3a7a6a, 0x5a8a9a, 0x8a9a5a][Math.floor(h(4) * 3)];
      break;
    case 'dwarven':
      L.H = 1.35; L.stone = true; L.rune = true;
      L.roof = ROOFS.stone;
      break;
    case 'village':
      L.H = 1.22;
      L.roof = rimStone ? ROOFS.shingle : ROOFS.thatch;
      break;
    default:
      L.H = role === 'inn' || role === 'tavern' ? 1.42 : 1.3;
      if (rimStone) { L.roof = ROOFS.slate; L.arched = true; }
      else if (!role || role === 'villager') L.roof = h(5) < 0.45 ? ROOFS.thatch : h(5) < 0.75 ? ROOFS.redtile : ROOFS.shingle;
      else L.roof = h(6) < 0.6 ? ROOFS.tile : ROOFS.redtile;
  }
  return L;
}

// ---------------------------------------------------------------- the view
export class BuildingsView {
  constructor(scene, mats, terrainView) {
    this.scene = scene;
    this.terrain = terrainView;
    this.group = new THREE.Group();
    this.group.name = 'buildings';
    scene.add(this.group);
    this.U = {
      uB: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
      uBHi: { value: new THREE.Vector2(-1, 0) },
    };
    this.mat = buildingMaterial(mats, this.U);
    this.depthMat = depthMaterial(this.U);
    this.smokeMat = smokeMaterial();
    // draws nothing on screen; only its shadow counts
    this.proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, shadowSide: THREE.DoubleSide });
    this.map = null;
    this.list = [];
    this.idx = null;
    this.meshes = [];
    this.state = [];
    this.hover = -1;
    this.hoverK = 0;
    this.hoverShown = -1;
    this.forced = -1;
    this.outline = null;
    this.sig = '';
    const ring = (opacity, back) => new THREE.MeshBasicMaterial({
      color: 0xffd860, transparent: true, opacity, depthWrite: false, fog: false,
      ...(back ? { depthFunc: THREE.GreaterDepth } : { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
    });
    this.outlineMats = [ring(0.9, false), ring(0.35, true)];
  }

  static sig(list) { return signature(list); }

  static enabledFor(map) { return !!map && (map.type === 'town' || map.type === 'castle'); }

  // Work out which wall tiles the buildings draw themselves, before the
  // terrain is built, so the terrain leaves them out.
  prepare(map, list) {
    this.map = map;
    const on = BuildingsView.enabledFor(map);
    this.list = on ? (list || findBuildings(map)) : [];
    if (this.list.length > MAXB) this.list = this.list.slice(0, MAXB);
    this.sig = signature(this.list);
    this.idx = this.list.length ? buildingMap(map, this.list) : null;
    const tv = this.terrain;
    this.owned = null;
    tv.owned = null;
    tv.groundSubst = null;
    if (!on) return;
    const owned = new Uint8Array(map.w * map.h);
    const subst = new Map();
    // the ground round a tile's open sides, by majority
    const groundBeside = (x, y, skip) => {
      const count = new Map();
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        if (skip && skip(ny * map.w + nx)) continue;
        const nt = terrain(getTile(map, nx, ny));
        if (nt.wall || nt.door || !nt.walk || nt.water) continue;
        count.set(nt.id, (count.get(nt.id) || 0) + 1);
      }
      let best = null, bn = 0;
      for (const [id, n] of count) if (n > bn) { bn = n; best = id; }
      return terrain(best ?? (map.fill && T[map.fill] != null ? T[map.fill] : T.grass));
    };
    this.list.forEach((b, bi) => {
      const rim = new Set(b.rim.map(([x, y]) => y * map.w + x));
      const inside = new Set(b.tiles.map(([x, y]) => y * map.w + x));
      for (const [x, y] of b.rim) {
        const t = terrain(getTile(map, x, y));
        if (!OWNABLE.has(t.key)) continue;
        // a stretch of town wall that a house leans on stays the town's
        let part = false;
        if (t.wall) for (const [dx, dy] of Object.values(DIRS)) {
          const nx = x + dx, ny = y + dy;
          if (!inBounds(map, nx, ny)) continue;
          const k = ny * map.w + nx;
          if (terrain(getTile(map, nx, ny)).wall && !rim.has(k) && !inside.has(k)) part = true;
        }
        if (part) continue;
        owned[y * map.w + x] = bi + 1;
        // the strip of ground outside the wall looks like the street beside it
        subst.set(y * map.w + x, groundBeside(x, y, (k) => rim.has(k) || inside.has(k)));
      }
    });
    // street furniture stands on whatever ground surrounds it
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (PROPS.has(terrain(getTile(map, x, y)).key)) subst.set(y * map.w + x, groundBeside(x, y, null));
    }
    this.owned = owned;
    tv.owned = this.list.length ? owned : null;
    tv.groundSubst = subst.size ? (x, y) => subst.get(y * map.w + x) || null : null;
  }

  // (re)build every building's geometry
  build() {
    this.dispose();
    const map = this.map;
    this.state = this.list.map((b) => ({ open: 0, vis: 1, base: 0 }));
    // a freshly built town shows its roofs as they should be at once (the
    // party may land indoors), fading only once play goes on
    this.snapFrames = 8;
    this.terrain.extraLights = [];
    if (!this.list.length) { this._writeUniforms(); return; }
    const B = new TagBuilder();
    // a plain stand-in casts the shadows, so the detail is drawn only once
    const S = new TagBuilder();
    const smoke = [];
    const style = settlementStyle(map);
    this.style = style;
    this.info = [];
    this.list.forEach((b, bi) => {
      const info = buildOne(B, S, bi, b, map, this.terrain, style, smoke, this.owned);
      this.state[bi].base = info.base;
      this.info.push(info);
    });
    B.tag = 0;
    const mesh = new THREE.Mesh(B.build(), this.mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.meshes.push(mesh);
    S.tag = 0;
    if (S.count) {
      const proxy = new THREE.Mesh(S.build(), this.proxyMat);
      proxy.castShadow = true;
      proxy.customDepthMaterial = this.depthMat;
      proxy.matrixAutoUpdate = false;
      this.group.add(proxy);
      this.meshes.push(proxy);
    }
    if (smoke.length) {
      const sm = new THREE.Mesh(smokeGeometry(smoke), this.smokeMat);
      sm.frustumCulled = false;
      sm.renderOrder = 3;
      sm.matrixAutoUpdate = false;
      this.group.add(sm);
      this.meshes.push(sm);
    }
    this._writeUniforms();
  }

  dispose() {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    this._clearOutline();
  }

  clear() {
    this.dispose();
    this.list = [];
    this.idx = null;
    this.state = [];
    this.terrain.owned = null;
    this.terrain.groundSubst = null;
    this.terrain.extraLights = [];
    this.hover = -1;
    this.forced = -1;
  }

  at(x, y) {
    if (!this.idx || !this.map || x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return -1;
    return this.idx[y * this.map.w + x];
  }

  // the building under a camera ray (its walls and roof as a box)
  pick(ray) {
    let best = -1, bt = Infinity;
    const box = new THREE.Box3(), hit = new THREE.Vector3();
    this.list.forEach((b, i) => {
      const inf = this.info?.[i];
      const top = inf ? inf.top : 2;
      box.min.set(b.box.x0 + 0.1, (inf?.base ?? 0) - 0.1, b.box.y0 + 0.1);
      box.max.set(b.box.x1 + 0.9, top, b.box.y1 + 0.9);
      if (ray.intersectBox(box, hit)) {
        const t = hit.distanceTo(ray.origin);
        if (t < bt) { bt = t; best = i; }
      }
    });
    return best;
  }

  setHover(i) {
    this.hover = i >= 0 && i < this.list.length ? i : -1;
  }

  setOpen(i) { this.forced = i >= 0 && i < this.list.length ? i : -1; }

  // per frame: which buildings stand open, fades, glow and visibility
  update(dt, ctx) {
    if (!this.list.length) return;
    // a steady fade (about a third of a second) that always finishes
    const step = dt * 3;
    this.list.forEach((b, i) => {
      const s = this.state[i];
      const want = i === ctx.inside || i === this.forced || i === ctx.cursor ? 1 : 0;
      s.t = this.snapFrames > 0 ? want : Math.max(0, Math.min(1, (s.t ?? s.open) + Math.sign(want - (s.t ?? s.open)) * step));
      s.open = s.t * s.t * (3 - 2 * s.t);
      // a roof is lit whenever any of the building's walls can be seen
      let v = 1;
      if (ctx.vis) {
        v = 0;
        for (const [x, y] of b.rim) { const q = ctx.vis[y * this.map.w + x]; if (q > v) v = q; }
      }
      s.vis = v;
    });
    if (this.snapFrames > 0) this.snapFrames--;
    const tgt = this.hover >= 0 ? 1 : 0;
    if (this.hover >= 0 && this.hover !== this.hoverShown) {
      this.hoverShown = this.hover;
      this.hoverK = Math.min(this.hoverK, 0.3);
      this._makeOutline(this.hover);
    }
    this.hoverK += (tgt - this.hoverK) * Math.min(1, dt * 8);
    if (tgt === 0 && this.hoverK < 0.02 && this.hoverShown >= 0) { this.hoverShown = -1; this.hoverK = 0; this._clearOutline(); }
    this.U.uBHi.value.set(this.hoverShown, this.hoverK);
    if (this.outline) {
      const p = 0.75 + 0.25 * Math.sin(shared.uTime.value * 5);
      this.outlineMats[0].opacity = 0.9 * this.hoverK * p;
      this.outlineMats[1].opacity = 0.35 * this.hoverK;
      if (this.outlineLift) this.outlineLift.position.y = this.hoverK * 0.24;
    }
    this._writeUniforms();
  }

  _writeUniforms() {
    const u = this.U.uB.value;
    for (let i = 0; i < MAXB; i++) {
      const s = this.state[i];
      if (s) u[i].set(s.open, s.vis, 0, s.base); else u[i].set(0, 0, 0, 0);
    }
  }

  // a glowing ribbon round the building's foot
  _makeOutline(i) {
    this._clearOutline();
    const b = this.list[i];
    if (!b) return;
    const map = this.map, w = map.w;
    const foot = new Set([...b.tiles, ...b.rim].map(([x, y]) => y * w + x));
    const y0 = (this.info?.[i]?.base ?? 0) + 0.05;
    const pos = [];
    const W = 0.09;
    for (const k of foot) {
      const x = k % w, y = Math.floor(k / w);
      for (const [dx, dy] of Object.values(DIRS)) {
        if (foot.has((y + dy) * w + x + dx) && inBounds(map, x + dx, y + dy)) continue;
        // an edge of the footprint: a strip just inside it
        let a, c, n;
        if (dy === 1) { a = [x, y + 1]; c = [x + 1, y + 1]; n = [0, -1]; }
        else if (dy === -1) { a = [x + 1, y]; c = [x, y]; n = [0, 1]; }
        else if (dx === 1) { a = [x + 1, y + 1]; c = [x + 1, y]; n = [-1, 0]; }
        else { a = [x, y]; c = [x, y + 1]; n = [1, 0]; }
        const a2 = [a[0] + n[0] * W, a[1] + n[1] * W], c2 = [c[0] + n[0] * W, c[1] + n[1] * W];
        pos.push(a[0], y0, a[1], c[0], y0, c[1], c2[0], y0, c2[1], a[0], y0, a[1], c2[0], y0, c2[1], a2[0], y0, a2[1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // and a glowing rim just outside the eaves, which rises with the roof
    const ep = [];
    const E = 0.13;
    for (const e of this.info?.[i]?.eaves || []) {
      const y = e.y - 0.03;
      const ring = [[e.x0, e.z0], [e.x1, e.z0], [e.x1, e.z1], [e.x0, e.z1]];
      const out = [[e.x0 - E, e.z0 - E], [e.x1 + E, e.z0 - E], [e.x1 + E, e.z1 + E], [e.x0 - E, e.z1 + E]];
      for (let k = 0; k < 4; k++) {
        const a = ring[k], c = ring[(k + 1) % 4], a2 = out[k], c2 = out[(k + 1) % 4];
        ep.push(a[0], y, a[1], c[0], y, c[1], c2[0], y - 0.05, c2[1], a[0], y, a[1], c2[0], y - 0.05, c2[1], a2[0], y - 0.05, a2[1]);
      }
    }
    const ge = new THREE.BufferGeometry();
    ge.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
    const grp = new THREE.Group();
    const lift = new THREE.Group();
    for (const m of this.outlineMats) {
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = 6;
      grp.add(mesh);
      if (ep.length) {
        const me = new THREE.Mesh(ge, m);
        me.renderOrder = 6;
        lift.add(me);
      }
    }
    grp.add(lift);
    this.outlineLift = lift;
    // the mesh's winding may face down: draw both sides
    for (const m of this.outlineMats) m.side = THREE.DoubleSide;
    this.outline = grp;
    this.group.add(grp);
  }

  _clearOutline() {
    if (!this.outline) return;
    this.group.remove(this.outline);
    this.outline.children[0]?.geometry.dispose();
    this.outlineLift?.children[0]?.geometry.dispose();
    this.outline = null;
    this.outlineLift = null;
  }
}

function signature(list) {
  return list.map((b) => `${b.box.x0},${b.box.y0},${b.box.x1},${b.box.y1}:${b.tiles.length}:${b.rim.length}:${b.doors.length}:${b.keeper?.id || ''}`).join('|');
}

function smokeGeometry(spots) {
  const pos = [], nor = [], puff = [];
  const P = TPL.blob.pos, N = TPL.blob.nor;
  for (const s of spots) {
    for (let i = 0; i < 6; i++) {
      const ph = (i / 6 + hash2(s[0] * 13, s[2] * 7, i) * 0.08) % 1;
      for (let j = 0; j < P.length; j += 3) {
        pos.push(P[j], P[j + 1], P[j + 2]);
        nor.push(N[j], N[j + 1], N[j + 2]);
        puff.push(s[0], s[1], s[2], ph);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('puff', new THREE.Float32BufferAttribute(puff, 4));
  return g;
}

// ---------------------------------------------------------------- one building
// Quad facing direction n (flips the winding if needed); colours per corner
function face(B, a, b, c, d, ca, cb = ca, cc = ca, cd = ca, n = null) {
  if (n) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * n[0] + ny * n[1] + nz * n[2] < 0) { B.quadC(a, d, c, b, ca, cd, cc, cb); return; }
  }
  B.quadC(a, b, c, d, ca, cb, cc, cd);
}

// A local frame for one straight run of wall: u runs along it, w outwards
// from the room (the room's edge is w = 0), y is height.
function wallFrame(dir, line) {
  switch (dir) {
    case 'S': return { P: (u, w, y) => [u, y, line + 1 + w], N: [0, 0, 1], A: [1, 0, 0] };
    case 'N': return { P: (u, w, y) => [u, y, line - w], N: [0, 0, -1], A: [1, 0, 0] };
    case 'E': return { P: (u, w, y) => [line + 1 + w, y, u], N: [1, 0, 0], A: [0, 0, 1] };
    default: return { P: (u, w, y) => [line - w, y, u], N: [-1, 0, 0], A: [0, 0, 1] };
  }
}

// a box in a wall frame, all faces
function fbox(B, F, u0, u1, w0, w1, y0, y1, c, cOut = c, cTop = c, skipBottom = true) {
  const P = F.P, N = F.N, A = F.A;
  const neg = (v) => [-v[0], -v[1], -v[2]];
  face(B, P(u0, w1, y0), P(u1, w1, y0), P(u1, w1, y1), P(u0, w1, y1), cOut, cOut, cOut, cOut, N);
  face(B, P(u0, w0, y0), P(u1, w0, y0), P(u1, w0, y1), P(u0, w0, y1), c, c, c, c, neg(N));
  face(B, P(u0, w0, y1), P(u1, w0, y1), P(u1, w1, y1), P(u0, w1, y1), cTop, cTop, cTop, cTop, [0, 1, 0]);
  face(B, P(u0, w0, y0), P(u0, w1, y0), P(u0, w1, y1), P(u0, w0, y1), c, c, c, c, neg(A));
  face(B, P(u1, w0, y0), P(u1, w1, y0), P(u1, w1, y1), P(u1, w0, y1), c, c, c, c, A);
  if (!skipBottom) face(B, P(u0, w0, y0), P(u1, w0, y0), P(u1, w1, y0), P(u0, w1, y0), c, c, c, c, [0, -1, 0]);
}

const WALL_T = 0.4;

function buildOne(B, S, bi, b, map, tv, style, smoke, owned) {
  const w = map.w;
  const key = (x, y) => y * w + x;
  const inside = new Set(b.tiles.map(([x, y]) => key(x, y)));
  const rim = new Map(b.rim.map(([x, y]) => [key(x, y), terrain(getTile(map, x, y))]));
  // rim tiles standing inside the room (the keep's pillars) are columns
  const pillars = new Set();
  for (const [x, y] of b.rim) {
    let enclosed = true;
    for (let dy = -1; dy <= 1 && enclosed; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = key(x + dx, y + dy);
      if (!inside.has(k) && !rim.has(k)) { enclosed = false; break; }
    }
    let orth = 0;
    for (const [dx, dy] of Object.values(DIRS)) if (inside.has(key(x + dx, y + dy))) orth++;
    if (enclosed && orth >= 3) pillars.add(key(x, y));
  }
  const room = new Set([...inside, ...pillars]);
  const isRoom = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && room.has(key(x, y));
  let base = 0;
  for (const [x, y] of b.tiles) base += tv.groundAt(x, y);
  base /= b.tiles.length;
  // stone or timber: what most of its walls are
  let stoneN = 0, woodN = 0;
  for (const t of rim.values()) { if (t.key === 'wall_stone') stoneN++; else if (t.key === 'wall_wood' || t.key === 'window') woodN++; }
  const rimStone = stoneN > woodN;
  let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
  for (const k of room) { const x = k % w, y = Math.floor(k / w); rx0 = Math.min(rx0, x); ry0 = Math.min(ry0, y); rx1 = Math.max(rx1, x); ry1 = Math.max(ry1, y); }
  const L = lookFor(style, b, rimStone, { w: rx1 - rx0 + 1, d: ry1 - ry0 + 1 });
  if (rimStone || L.stone) L.dormerC = L.stoneC;
  const H = L.H, top = base + H;
  const tagOf = (f) => (bi + 1) * 8 + f;
  const plaster = col(L.plaster), plasterIn = col(L.plaster, 0.92), timber = col(L.timber);
  const stoneC = L.stoneC;
  const stoneWalls = rimStone || L.stone;
  const seed = b.box.x0 * 31 + b.box.y0 * 17;

  // ---- walls: runs of room edges that face a rim tile
  const edges = new Map();
  for (const k of inside) {
    const x = k % w, y = Math.floor(k / w);
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const nk = key(x + dx, y + dy);
      if (!rim.has(nk) || pillars.has(nk)) continue;
      const line = d === 'S' || d === 'N' ? y : x;
      const along = d === 'S' || d === 'N' ? x : y;
      const id = d + ':' + line;
      if (!edges.has(id)) edges.set(id, { d, line, items: [] });
      edges.get(id).items.push({ along, t: rim.get(nk), nx: x + dx, ny: y + dy });
    }
  }
  const windows = [];
  const doors = [];
  for (const { d, line, items } of edges.values()) {
    items.sort((a, c) => a.along - c.along);
    let run = [];
    const flush = () => { if (run.length) wallRun(d, line, run); run = []; };
    for (const it of items) {
      if (run.length && it.along !== run[run.length - 1].along + 1) flush();
      run.push(it);
    }
    flush();
  }

  function wallRun(d, line, run) {
    const F = wallFrame(d, line);
    const front = d === 'S';
    B.tag = tagOf(front ? F_FRONT : 0);
    S.tag = B.tag;
    const a0 = run[0].along, a1 = run[run.length - 1].along + 1;
    const [dx, dy] = DIRS[d];
    // convex corners: carry the wall on to close the corner
    const isH = d === 'S' || d === 'N';
    const tileAt = (u) => (isH ? [u, line] : [line, u]);
    const [sx, sy] = tileAt(a0 - 1), [ex, ey] = tileAt(a1);
    const ext0 = isRoom(sx, sy) ? 0 : WALL_T, ext1 = isRoom(ex, ey) ? 0 : WALL_T;
    const u0 = a0 - ext0, u1 = a1 + ext1;
    const T0 = -0.03, T1 = WALL_T;
    const y0 = base - 0.08;
    // solid spans, leaving door openings
    const spans = [];
    let cur = u0;
    const DW = 0.34, DH = Math.min(1.1, H - 0.2);
    for (const it of run) {
      if (!it.t.door) continue;
      const uc = it.along + 0.5;
      spans.push([cur, uc - DW, y0, top]);
      spans.push([uc - DW, uc + DW, base + DH, top]);
      cur = uc + DW;
      doors.push({ d, F, uc, it, front });
    }
    spans.push([cur, u1, y0, top]);
    const outC = stoneWalls ? col(stoneC, 0.62) : plaster;
    const topC = stoneWalls ? col(stoneC, 0.95) : col(L.plaster, 0.78);
    for (const [s0, s1, h0, h1] of spans) {
      if (s1 - s0 < 0.005) continue;
      fbox(B, F, s0, s1, T0, T1, h0, h1, stoneWalls ? col(stoneC, 0.85) : plasterIn, outC, topC, h0 < base);
      fbox(S, F, s0, s1, T0, T1, h0, h1, outC, outC, outC, h0 < base);
      // indoors: dark panelling round the foot of plaster walls, a moulded rail on top
      if (!stoneWalls && h0 < base && s1 - s0 > 0.1) {
        const pa = Math.max(s0, a0), pb = Math.min(s1, a1);
        if (pb - pa > 0.05) {
          fbox(B, F, pa, pb, T0 - 0.03, T0, base, base + H * 0.3, col(L.timber, 1.25), col(L.timber, 1.25), col(L.timber, 1.4));
          fbox(B, F, pa, pb, T0 - 0.045, T0, base + H * 0.3, base + H * 0.3 + 0.04, col(L.timber, 1.0), col(L.timber, 1.0), col(L.timber, 1.5));
        }
      }
    }
    // inside the doorways: the reveal and the lintel's underside
    // dressing of the outer face, tile by tile
    if (stoneWalls) {
      stoneFace(B, F, u0, u1, y0, top, T1, stoneC, seed + line * 7 + (d.charCodeAt(0)), run, base, DW, DH, L);
      // quoins: big dressed blocks at the corners
      for (const [u, s] of [[u0, 1], [u1, -1]]) {
        if ((u === u0 && !ext0) || (u === u1 && !ext1)) continue;
        for (let yy = y0 + 0.06, i = 0; yy < top - 0.1; yy += 0.24, i++) {
          const wq = i % 2 ? 0.3 : 0.2;
          const qa = s > 0 ? u : u - wq, qb = s > 0 ? u + wq : u;
          fbox(B, F, qa, qb, T0, T1 + 0.03, yy, yy + 0.2, col(stoneC, 1.02), col(stoneC, 1.1 - (i % 2) * 0.08), col(stoneC, 1.15));
        }
      }
    } else {
      timberFace(B, F, u0, u1, y0, top, T1, run, base, H, L, timber, seed + line * 13);
    }
    // a plinth along the foot
    beam(B, F.P(u0 - 0.02, T1 + 0.02, base + 0.05), F.P(u1 + 0.02, T1 + 0.02, base + 0.05), 0.1, 0.18, col(L.style === 'dwarven' ? 0x4a4440 : 0x8a8478), F.N);
    // the wall's top plate (or coping) and the rune band in dwarven halls
    beam(B, F.P(u0 - 0.03, (T0 + T1) / 2, top + 0.025), F.P(u1 + 0.03, (T0 + T1) / 2, top + 0.025), WALL_T + 0.1, 0.06, stoneWalls ? col(stoneC, 1.08) : timber);
    if (L.rune) {
      B.tag = tagOf(F_GLASS | (front ? F_FRONT : 0));
      beam(B, F.P(u0 + 0.1, T1 + 0.012, top - 0.16), F.P(u1 - 0.1, T1 + 0.012, top - 0.16), 0.02, 0.035, col(0x60d8ff));
      B.tag = tagOf(front ? F_FRONT : 0);
    }
    for (const it of run) {
      if (it.t.key === 'window') windows.push({ d, F, uc: it.along + 0.5, front, it });
    }
  }

  // ---- windows
  for (const wd of windows) {
    windowAt(B, wd, base, H, L, tagOf, map, tv);
    // lamplight spills from the window onto the street after dark
    const o = wd.F.P(wd.uc, WALL_T + 0.75, 0);
    tv.extraLights.push([o[0], o[2], 1.7, lin3(L.style === 'dwarven' ? 0x9ad8ff : 0xffb060), 0.42]);
  }
  // ---- doors (and the shop sign over the main one)
  let signed = false;
  const kind = SIGN_FOR[b.keeper?.role];
  const doorList = doors.slice().sort((p, q) => 'SEWN'.indexOf(p.d) - 'SEWN'.indexOf(q.d));
  for (const dd of doorList) {
    doorAt(B, dd, base, H, L, tagOf, stoneWalls, stoneC, timber);
    if (kind && !signed && dd.d !== 'N') {
      signed = true;
      B.tag = tagOf(0);
      const { F } = dd;
      const side = dd.d === 'W' ? -1 : 1;
      const u = dd.uc + side * 0.62;
      if (dd.d === 'S') hangingSign(B, kind, F.P(u, WALL_T, base + H * 0.86), F.P(u, WALL_T + 0.46, base + H * 0.86), 1.05);
      else hangingSign(B, kind, F.P(dd.uc + 0.7, WALL_T, base + H * 0.86), F.P(dd.uc + 0.7, WALL_T + 0.5, base + H * 0.86), 1.05);
    }
  }
  // a keeper whose only door faces away gets a board on the street side
  if (kind && !signed) {
    B.tag = tagOf(F_FRONT);
    wallSign(B, kind, (rx0 + rx1 + 1) / 2, base + H * 0.55, ry1 + 1 + WALL_T + 0.03, 1.2);
  }
  // lanterns either side of a keeper's door, lit at night
  if (kind && doorList.length) {
    const dd = doorList[0];
    B.tag = tagOf(F_GLASS);
    const p = dd.F.P(dd.uc - 0.55, WALL_T + 0.08, base + H * 0.66);
    B.box(col(0x2a2624), { x: p[0], y: p[1] + 0.13, z: p[2], sx: 0.1, sy: 0.03, sz: 0.1 });
    B.box(col(0xffc060), { x: p[0], y: p[1], z: p[2], sx: 0.08, sy: 0.13, sz: 0.08 });
    B.shape(TPL.cone4, col(0x2a2624), { x: p[0], y: p[1] + 0.15, z: p[2], sx: 0.13, sy: 0.07, sz: 0.13, ry: Math.PI / 4 });
    const o = dd.F.P(dd.uc - 0.55, WALL_T + 0.8, 0);
    tv.extraLights.push([o[0], o[2], 2.2, lin3(0xffb060), 0.7]);
  }

  // ---- pillars inside
  B.tag = tagOf(0);
  for (const k of pillars) {
    const x = k % w + 0.5, z = Math.floor(k / w) + 0.5;
    const sc = col(stoneC, 1);
    B.box(col(stoneC, 0.9), { x, y: base - 0.04, z, sx: 0.5, sy: 0.14, sz: 0.5 });
    B.shape(TPL.cyl12, sc, { x, y: base + 0.08, z, sx: 0.34, sy: H - 0.16, sz: 0.34, grad: 0.2 });
    B.box(col(stoneC, 1.08), { x, y: top - 0.1, z, sx: 0.48, sy: 0.12, sz: 0.48 });
  }

  // ---- roof over the room, split into rectangles
  const rects = splitRects(room, w);
  let roofTop = top;
  const roofs = [];
  const crosses = [];
  B.tag = tagOf(F_ROOF);
  S.tag = B.tag;
  for (const r of rects) {
    const box = { x0: r.x0 - WALL_T, z0: r.y0 - WALL_T, x1: r.x1 + 1 + WALL_T, z1: r.y1 + 1 + WALL_T };
    if (L.style === 'dwarven') {
      const R = stepRoof(B, box, top, stoneC, tagOf(F_ROOF | F_GLASS));
      S.box(stoneC, { x: (box.x0 + box.x1) / 2, y: top - 0.1, z: (box.z0 + box.z1) / 2, sx: box.x1 - box.x0, sy: 0.7, sz: box.z1 - box.z0 });
      roofs.push({ box, heightAt: R.heightAt, eave: R.eave, eaveY: R.eaveY });
      roofTop = Math.max(roofTop, R.ridgeY + 0.1);
      continue;
    }
    if (L.keep && r === rects[0]) {
      const R = keepTop(B, box, top, stoneC, L.roof, S);
      roofs.push({ box, heightAt: R.heightAt, eave: R.eave, eaveY: R.eaveY });
      // a row of dormers down the great roof's street side, clear of the fleche
      const ib = R.eave, span = ib.x1 - ib.x0;
      const n = Math.max(1, Math.floor((span - 2) / 2.6));
      for (let i = 0; i < n; i++) {
        const x = ib.x0 + 1 + (i + 0.5) * ((span - 2) / n);
        if (Math.abs(x - (ib.x0 + ib.x1) / 2) < 0.9) continue;
        dormer(B, x, ib.z1 - 0.2, R, L, tagOf, top);
      }
      roofTop = Math.max(roofTop, R.ridgeY + 0.3, top + 1.9);
      continue;
    }
    const wdt = box.x1 - box.x0, dep = box.z1 - box.z0;
    const doorS = doors.some((dd) => dd.d === 'S');
    // gable to the street on compact buildings, ridge along the long side otherwise
    let along = wdt >= dep ? 'x' : 'z';
    if (doorS && wdt / dep < 1.35 && wdt < 7 && !L.roof.hip && hash2(b.box.x0, b.box.y0, 99) < 0.6) along = 'z';
    const gable = (pa, pb, apex, n) => gableEnd(B, pa, pb, apex, n, stoneWalls, L, plaster, timber, stoneC, tagOf);
    const over = L.roof === ROOFS.thatch ? 0.3 : 0.24;
    const R = roofRect(B, box, top, L.roof, { along, gable, shadow: S, over, maxRise: L.style === 'elven' ? 2.5 : L.style === 'castle' ? 2.4 : L.style === 'dwarven' ? 1.4 : 2.1 });
    roofs.push({ box, heightAt: R.heightAt, eave: R.eave, eaveY: R.eaveY });
    roofTop = Math.max(roofTop, R.ridgeY + 0.2);
    // A long roof seen from the street is one flat plane: a cross gable
    // over the front door (its gable end to the street) breaks it up, or
    // failing that a dormer window.
    const hipped = L.roof.hip;
    if (!hipped && along === 'x' && wdt >= 5.5 && dep >= 3.7 && L.style !== 'dwarven') {
      const dS = doors.find((dd) => dd.d === 'S' && dd.uc > box.x0 + 1.2 && dd.uc < box.x1 - 1.2);
      const cw = Math.min(2.8, wdt * 0.42);
      let cx = dS ? dS.uc : (box.x0 + box.x1) / 2 + (hash2(seed, 3, 5) - 0.5) * (wdt - cw - 1);
      cx = Math.max(box.x0 + cw / 2 + 0.5, Math.min(box.x1 - cw / 2 - 0.5, cx));
      const cbox = { x0: cx - cw / 2, z0: (box.z0 + box.z1) / 2 - 0.1, x1: cx + cw / 2, z1: box.z1 };
      roofRect(B, cbox, top, L.roof, { along: 'z', gable, shadow: S, over, hip: false, noCurl: true, maxRise: Math.max(0.6, R.rise * 0.82) });
      crosses.push(cbox);
      // long roofs get a dormer either side as well
      if (wdt >= 7.5) for (const s of [-1, 1]) {
        const x = cx + s * (cw / 2 + 1.1);
        if (x > box.x0 + 0.8 && x < box.x1 - 0.8) dormer(B, x, box.z1, R, L, tagOf, top);
      }
    } else if (!hipped && along === 'x' && wdt >= 4.5 && L.style !== 'dwarven') {
      dormer(B, (box.x0 + box.x1) / 2 + (hash2(seed, 3, 5) - 0.5) * 1.5, box.z1, R, L, tagOf, top);
    }
  }
  // ---- chimneys: over the hearth (with smoke), or on the odd cottage
  B.tag = tagOf(F_ROOF);
  const hearths = b.tiles.filter(([x, y]) => terrain(getTile(map, x, y)).key === 'hearth');
  const stacks = hearths.map(([x, y]) => {
    // lean the stack against the nearest wall
    let px = x + 0.5, pz = y + 0.5;
    for (const [dx, dy] of Object.values(DIRS)) if (!isRoom(x + dx, y + dy)) { px += dx * 0.32; pz += dy * 0.32; break; }
    return [px, pz, true];
  });
  if (!stacks.length && L.style !== 'castle' && L.style !== 'elven' && hash2(seed, 1, 77) < 0.5) {
    const r = rects[0];
    stacks.push([r.x1 + 0.5, r.y0 + 0.9, false]);
  }
  for (const [px, pz, lit] of stacks) {
    const rf = roofs.find((q) => px >= q.box.x0 && px <= q.box.x1 && pz >= q.box.z0 && pz <= q.box.z1) || roofs[0];
    if (!rf) continue;
    const h = rf.heightAt(px, pz);
    const cTop = Math.max(h + 0.42, top + 0.5);
    chimney(B, px, pz, top - 0.3, cTop, L.style === 'dwarven' ? 0x5a5650 : 0x8a7e72);
    S.box(0x808080, { x: px, y: top - 0.3, z: pz, sx: 0.3, sy: cTop - top + 0.3, sz: 0.3 });
    roofTop = Math.max(roofTop, cTop + 0.2);
    if (lit) smoke.push([px, cTop + 0.1, pz]);
  }
  // ---- the strip of ground outside the walls: flowers, barrels, firewood
  B.tag = 0;
  dressStrip(B, b, map, tv, room, owned, bi, seed, L, base);
  return { base, top: roofTop, H, rimStone, style: L.style, crosses, rects, eaves: roofs.map((r) => ({ ...r.eave, y: r.eaveY })) };
}

// gable triangle under a roof's end: plaster with timbers, or stone
function gableEnd(B, pa, pb, apex, n, stoneWalls, L, plaster, timber, stoneC, tagOf) {
  const a = pa, b = pb, c = apex;
  const fc = stoneWalls ? col(stoneC, 0.9) : plaster;
  B.triC(...orient(a, b, c, n), fc, fc, fc);
  const win = c[1] - a[1] >= 0.75;
  if (!stoneWalls) {
    // tie beam, king post (above the window) and braces
    const off = (p, k = 0.025) => [p[0] + n[0] * k, p[1], p[2] + n[2] * k];
    const mid = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
    beam(B, off(win ? lerp(mid, c, 0.62) : mid), off([c[0], c[1] - 0.05, c[2]]), 0.07, 0.04, timber, n);
    beam(B, off(a), off(b), 0.07, 0.05, timber, n);
    const m1 = lerp(mid, c, 0.62);
    beam(B, off(lerp(a, mid, 0.3)), off(m1), 0.06, 0.04, timber, n);
    beam(B, off(lerp(b, mid, 0.3)), off(m1), 0.06, 0.04, timber, n);
  }
  if (win) gableWindow(B, a, b, c, n, L, tagOf, stoneWalls ? col(stoneC, 1.15) : timber);
}

// a small window high in a gable, glowing at night like the others
function gableWindow(B, a, b, c, n, L, tagOf, frameC) {
  const h = c[1] - a[1];
  if (h < 0.75 || !tagOf) return;
  const tag = B.tag;
  const mid = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
  const along = [b[0] - a[0], 0, b[2] - a[2]];
  const len = Math.hypot(along[0], along[2]);
  along[0] /= len; along[2] /= len;
  const P = (u, y, w) => [mid[0] + along[0] * u + n[0] * w, a[1] + y, mid[2] + along[2] * u + n[2] * w];
  const y0 = h * 0.22, y1 = Math.min(h * 0.55, y0 + 0.4), hw = Math.min(0.17, len * 0.08);
  const tg = tag - (tag % 8);
  B.tag = tg + (tag % 8 & 1) + F_GLASS;
  const g = col(L.style === 'elven' ? 0xfff0c0 : 0xffc870);
  face(B, P(-hw, y0, 0.03), P(hw, y0, 0.03), P(hw, y1, 0.03), P(-hw, y1, 0.03), g, g, g, g, n);
  B.tag = tag;
  beam(B, P(-hw - 0.04, y0 - 0.02, 0.05), P(hw + 0.04, y0 - 0.02, 0.05), 0.06, 0.05, frameC, [0, 1, 0]);
  beam(B, P(-hw - 0.03, y1 + 0.03, 0.05), P(hw + 0.03, y1 + 0.03, 0.05), 0.05, 0.05, frameC, [0, 1, 0]);
  beam(B, P(-hw - 0.02, y0, 0.05), P(-hw - 0.02, y1 + 0.04, 0.05), 0.05, 0.04, frameC, n);
  beam(B, P(hw + 0.02, y0, 0.05), P(hw + 0.02, y1 + 0.04, 0.05), 0.05, 0.04, frameC, n);
  beam(B, P(0, y0, 0.045), P(0, y1, 0.045), 0.025, 0.02, frameC, n);
}
function orient(a, b, c, n) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
  return nx * n[0] + nz * n[2] >= 0 ? [a, b, c] : [a, c, b];
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const _lc = new THREE.Color();
function lin3(hex) { _lc.setHex(hex); return [_lc.r, _lc.g, _lc.b]; }

// Timber framing on a plaster wall: sill, posts, rails and braces
function timberFace(B, F, u0, u1, y0, top, T1, run, base, H, L, timber, seed) {
  const w = T1 + 0.018;
  const P = F.P;
  const bw = L.style === 'elven' ? 0.05 : 0.075;
  // posts at the corners and every tile edge
  const posts = new Set([u0 + bw / 2, u1 - bw / 2]);
  for (const it of run) { posts.add(it.along); posts.add(it.along + 1); }
  for (const u of posts) {
    if (u < u0 + 0.01 || u > u1 - 0.01) continue;
    if (run.some((it) => it.t.door && Math.abs(u - (it.along + 0.5)) < 0.36)) continue;
    beam(B, P(u, w, base + 0.12), P(u, w, top - 0.02), bw, 0.04, timber, F.N);
  }
  beam(B, P(u0, w, top - 0.05), P(u1, w, top - 0.05), 0.04, 0.09, timber, [0, 1, 0]);
  if (L.style === 'elven') {
    // slender pale frame with a gilded band
    beam(B, P(u0, w + 0.005, base + H * 0.62), P(u1, w + 0.005, base + H * 0.62), 0.03, 0.03, col(0xd8b860), [0, 1, 0]);
    return;
  }
  for (const it of run) {
    const a = it.along, c = a + 1;
    if (it.t.door || it.t.key === 'window') continue;
    // a rail at sill height and a brace: '/', '\', or a cross
    const ym = base + H * 0.45;
    beam(B, P(a, w, ym), P(c, w, ym), 0.035, 0.06, timber, [0, 1, 0]);
    if (!L.braces) continue;
    const r = hash2(a * 7 + seed, seed, 31);
    const lo = base + 0.14, hi = top - 0.1;
    if (r < 0.35) beam(B, P(a + 0.05, w, lo), P(c - 0.05, w, ym), bw * 0.85, 0.035, timber, F.N);
    else if (r < 0.7) beam(B, P(c - 0.05, w, lo), P(a + 0.05, w, ym), bw * 0.85, 0.035, timber, F.N);
    else {
      beam(B, P(a + 0.05, w, ym), P(c - 0.05, w, hi), bw * 0.8, 0.035, timber, F.N);
      beam(B, P(c - 0.05, w, ym), P(a + 0.05, w, hi), bw * 0.8, 0.035, timber, F.N);
    }
  }
}

// Coursed blocks proud of the dark mortar face
function stoneFace(B, F, u0, u1, y0, top, T1, stoneC, seed, run, base, DW, DH, L) {
  const P = F.P;
  const rows = Math.max(3, Math.round((top - y0) / (L.style === 'dwarven' ? 0.24 : 0.18)));
  const rh = (top - y0) / rows;
  const holes = [];
  for (const it of run) {
    const uc = it.along + 0.5;
    if (it.t.door) holes.push([uc - DW - 0.02, uc + DW + 0.02, base + DH + 0.02]);
    if (it.t.key === 'window') holes.push([uc - 0.24, uc + 0.24, base + 0.82, base + 0.32]);
  }
  for (let r = 0; r < rows; r++) {
    const ya = y0 + r * rh + 0.012, yb = y0 + (r + 1) * rh - 0.012;
    let u = u0 - (r % 2) * 0.22 - hash2(r, seed, 61) * 0.12;
    let k = 0;
    while (u < u1) {
      const bw = (L.style === 'dwarven' ? 0.5 : 0.3) + hash2(r * 13 + k, seed, 62) * 0.22;
      let ua = Math.max(u0, u) + 0.014, ub = Math.min(u1, u + bw) - 0.014;
      u += bw; k++;
      if (ub - ua < 0.05) continue;
      // skip blocks over a door or window opening
      const um = (ua + ub) / 2, ym = (ya + yb) / 2;
      if (holes.some((h) => um > h[0] && um < h[1] && (h.length === 3 ? ym < h[2] : ym < h[2] && ym > h[3]))) continue;
      const rr = hash2(r * 29 + k * 3, seed, 63);
      const out = 0.012 + rr * 0.016;
      const lift = 0.86 + 0.18 * ((ym - y0) / (top - y0));
      const c = col(stoneC, (0.8 + rr * 0.3) * lift), cap = col(stoneC, (0.98 + rr * 0.25) * lift);
      face(B, P(ua, T1 + out, ya), P(ub, T1 + out, ya), P(ub, T1 + out, yb), P(ua, T1 + out, yb), c, c, c, c, F.N);
      face(B, P(ua, T1 + out, yb), P(ub, T1 + out, yb), P(ub, T1, yb), P(ua, T1, yb), cap, cap, cap, cap, [0, 1, 0]);
    }
  }
}

function windowAt(B, wd, base, H, L, tagOf, map, tv) {
  const { F, uc, front } = wd;
  const P = F.P, N = F.N;
  const fl = front ? F_FRONT : 0;
  const ya = base + H * 0.34, yb = base + H * 0.74;
  const hw = 0.2;
  const T1 = WALL_T;
  // glass, outside and in
  B.tag = tagOf(F_GLASS | fl);
  const g = col(L.style === 'elven' ? 0xfff0c0 : 0xffc870);
  for (const [ww, n, inner] of [[T1 + 0.006, N, false], [-0.036, [-N[0], -N[1], -N[2]], true]]) {
    if (inner) { B.tag = tagOf(fl); }
    const gc = inner ? col(L.plaster, 0.42) : g;
    face(B, P(uc - hw, ww, ya), P(uc + hw, ww, ya), P(uc + hw, ww, yb), P(uc - hw, ww, yb), gc, gc, gc, gc, n);
    if (L.arched) {
      const apex = P(uc, ww, yb + hw * 0.9);
      B.triC(...orient(P(uc - hw, ww, yb), P(uc + hw, ww, yb), apex, n), gc, gc, gc);
    }
  }
  B.tag = tagOf(fl);
  const fc = L.style === 'elven' ? col(0xe8d8a8) : col(L.timber, 1.15);
  const wf = T1 + 0.03;
  // frame and glazing bars
  beam(B, P(uc - hw - 0.03, wf, ya - 0.03), P(uc + hw + 0.03, wf, ya - 0.03), 0.07, 0.05, fc, [0, 1, 0]);
  beam(B, P(uc - hw - 0.03, wf, yb + 0.02), P(uc + hw + 0.03, wf, yb + 0.02), 0.05, 0.05, fc, [0, 1, 0]);
  beam(B, P(uc - hw - 0.02, wf, ya - 0.03), P(uc - hw - 0.02, wf, yb + 0.04), 0.05, 0.04, fc, N);
  beam(B, P(uc + hw + 0.02, wf, ya - 0.03), P(uc + hw + 0.02, wf, yb + 0.04), 0.05, 0.04, fc, N);
  beam(B, P(uc, wf - 0.01, ya), P(uc, wf - 0.01, yb), 0.025, 0.02, fc, N);
  beam(B, P(uc - hw, wf - 0.01, (ya + yb) / 2), P(uc + hw, wf - 0.01, (ya + yb) / 2), 0.02, 0.025, fc, [0, 1, 0]);
  if (L.arched) {
    beam(B, P(uc - hw - 0.02, wf, yb + 0.02), P(uc, wf, yb + hw * 0.95), 0.04, 0.04, fc, N);
    beam(B, P(uc + hw + 0.02, wf, yb + 0.02), P(uc, wf, yb + hw * 0.95), 0.04, 0.04, fc, N);
  }
  if (L.style === 'dwarven' || L.style === 'castle') return;
  // shutters, folded back, and a box of flowers under the sill
  const sc = col(L.shutters);
  for (const s of [-1, 1]) {
    const ua = uc + s * (hw + 0.05), ub = uc + s * (hw + 0.24);
    face(B, P(ua, T1 + 0.04, ya - 0.02), P(ub, T1 + 0.06, ya - 0.02), P(ub, T1 + 0.06, yb + 0.03), P(ua, T1 + 0.04, yb + 0.03), sc, sc, col(L.shutters, 1.15), col(L.shutters, 1.15), N);
    beam(B, P(ua + s * 0.02, T1 + 0.062, ya + 0.04), P(ub - s * 0.02, T1 + 0.072, ya + 0.04), 0.012, 0.02, col(L.shutters, 0.7), [0, 1, 0]);
    beam(B, P(ua + s * 0.02, T1 + 0.062, yb - 0.04), P(ub - s * 0.02, T1 + 0.072, yb - 0.04), 0.012, 0.02, col(L.shutters, 0.7), [0, 1, 0]);
  }
  const boxY = ya - 0.12;
  beam(B, P(uc - hw - 0.04, T1 + 0.08, boxY), P(uc + hw + 0.04, T1 + 0.08, boxY), 0.14, 0.09, col(0x7a4e2a), [0, 1, 0]);
  const flowers = [[0xe84a5a, 0xf4f0e8], [0xf0c040, 0xe86a2a], [0xa070e0, 0xf4f0ff], [0xff7a9a, 0xfff0a0]];
  const fs = flowers[Math.floor(hash2(uc * 7, base * 3 + F.N[0] * 5, 404) * flowers.length)];
  for (let i = 0; i < 5; i++) {
    const u = uc - hw + (i + 0.5) * (2 * hw / 5);
    const p = P(u, T1 + 0.08 + (i % 2) * 0.03, boxY + 0.05);
    B.shape(TPL.blob, col(0x4f8a34), { x: p[0], y: p[1], z: p[2], sx: 0.1, sy: 0.07, sz: 0.1 });
    B.shape(TPL.blob, col(fs[i % 2]), { x: p[0], y: p[1] + 0.05, z: p[2], s: 0.055 });
  }
  void map; void tv;
}

function doorAt(B, dd, base, H, L, tagOf, stoneWalls, stoneC, timber) {
  const { F, uc, it, front } = dd;
  const P = F.P, N = F.N;
  const DW = 0.34, DH = Math.min(1.1, H - 0.2);
  const fl = front ? F_FRONT : 0;
  B.tag = tagOf(fl);
  const T1 = WALL_T;
  const fc = stoneWalls ? col(stoneC, 1.12) : col(L.timber, 1.05);
  // frame: jambs, lintel (an arch of voussoirs in stone)
  if (stoneWalls) {
    for (const s of [-1, 1]) for (let yy = base, i = 0; yy < base + DH - 0.05; yy += 0.18, i++) {
      const ua = uc + s * DW, ub = uc + s * (DW + (i % 2 ? 0.13 : 0.09));
      fbox(B, F, Math.min(ua, ub), Math.max(ua, ub), T1 - 0.02, T1 + 0.035, yy, yy + 0.16, col(stoneC, 1.05), fc, fc);
    }
    for (let i = 0; i < 5; i++) {
      const a0 = Math.PI * (i / 5), a1 = Math.PI * ((i + 1) / 5);
      const r0 = DW + 0.02, r1 = DW + 0.15;
      const yc = base + DH - 0.12;
      const p = (a, r) => P(uc + Math.cos(a) * r, T1 + 0.035, yc + Math.sin(a) * r * 0.75);
      const c = col(stoneC, 1.05 + (i % 2) * 0.08);
      face(B, p(a0, r0), p(a0, r1), p(a1, r1), p(a1, r0), c, c, c, c, N);
    }
  } else {
    beam(B, P(uc - DW - 0.04, T1 + 0.02, base), P(uc - DW - 0.04, T1 + 0.02, base + DH + 0.06), 0.09, 0.06, fc, N);
    beam(B, P(uc + DW + 0.04, T1 + 0.02, base), P(uc + DW + 0.04, T1 + 0.02, base + DH + 0.06), 0.09, 0.06, fc, N);
    beam(B, P(uc - DW - 0.12, T1 + 0.03, base + DH + 0.05), P(uc + DW + 0.12, T1 + 0.03, base + DH + 0.05), 0.08, 0.11, fc, [0, 1, 0]);
  }
  // the reveal through the wall's thickness, darker
  const rv = col(stoneWalls ? stoneC : L.plaster, 0.55);
  for (const s of [-1, 1]) face(B, P(uc + s * DW, -0.03, base), P(uc + s * DW, T1, base), P(uc + s * DW, T1, base + DH), P(uc + s * DW, -0.03, base + DH), rv, rv, rv, rv, [-F.A[0] * s, 0, -F.A[2] * s]);
  face(B, P(uc - DW, -0.03, base + DH), P(uc + DW, -0.03, base + DH), P(uc + DW, T1, base + DH), P(uc - DW, T1, base + DH), rv, rv, rv, rv, [0, -1, 0]);
  // threshold step
  B.tag = tagOf(0);
  B.box(col(0x9a948a), { ...pt(P(uc, T1 + 0.12, base - 0.05)), sx: F.A[0] ? DW * 2 + 0.16 : 0.3, sy: 0.07, sz: F.A[2] ? DW * 2 + 0.16 : 0.3 });
  B.tag = tagOf(fl);
  const leafC = it.t.locked ? col(0x6a3a1a) : col(L.style === 'elven' ? 0xc8a868 : 0x8a5a2a);
  const strap = col(0x2a2624);
  if (it.t.locked) {
    // shut fast: planks, iron bands and a brass lock
    face(B, P(uc - DW, T1 * 0.5, base), P(uc + DW, T1 * 0.5, base), P(uc + DW, T1 * 0.5, base + DH), P(uc - DW, T1 * 0.5, base + DH), leafC, leafC, col(0x6a3a1a, 1.15), col(0x6a3a1a, 1.15), N);
    for (const yy of [0.2, 0.62]) beam(B, P(uc - DW, T1 * 0.5 + 0.015, base + DH * yy), P(uc + DW, T1 * 0.5 + 0.015, base + DH * yy), 0.02, 0.05, strap, [0, 1, 0]);
    const lk = P(uc + DW * 0.55, T1 * 0.5 + 0.03, base + DH * 0.42);
    B.box(col(0xe0b040), { x: lk[0], y: lk[1], z: lk[2], sx: F.A[0] ? 0.08 : 0.03, sy: 0.1, sz: F.A[2] ? 0.08 : 0.03 });
  } else {
    // swung open into the room: planks with strap hinges
    const hinge = P(uc - DW, 0.02, base);
    const ang = 1.35;
    const dirA = [F.A[0] * Math.cos(ang) - F.N[0] * Math.sin(ang), 0, F.A[2] * Math.cos(ang) - F.N[2] * Math.sin(ang)];
    const far = [hinge[0] + dirA[0] * DW * 2, base, hinge[2] + dirA[2] * DW * 2];
    beam(B, [hinge[0], base + DH / 2 - 0.0, hinge[2]], [far[0], base + DH / 2, far[2]], 0.05, DH - 0.02, leafC, [0, 1, 0]);
    for (const yy of [0.22, 0.75]) {
      const y = base + DH * yy;
      beam(B, [hinge[0], y, hinge[2]], [hinge[0] + dirA[0] * DW * 1.3, y, hinge[2] + dirA[2] * DW * 1.3], 0.065, 0.04, strap, [0, 1, 0]);
    }
  }
}
function pt(p) { return { x: p[0], y: p[1], z: p[2] }; }

// a dormer on the long slope facing the street
function dormer(B, x, zEave, R, L, tagOf, top) {
  B.tag = tagOf(F_ROOF);
  const z = zEave - 0.8;
  const zf = z + 0.38;
  const y0 = R.heightAt(x, z) - 0.02;
  // the cheeks reach down to wherever the slope meets the dormer's front
  const yb = R.heightAt(x, zf) - 0.06;
  const w = 0.7, h = 0.48;
  const pl = col(L.dormerC ?? L.plaster), tc = col(L.timber);
  B.box(pl, { x, y: yb, z: z + 0.06, sx: w, sy: y0 + h - yb, sz: 0.64 });
  B.tag = tagOf(F_ROOF | F_GLASS);
  B.box(col(0xffc870), { x, y: y0 + 0.04, z: zf + 0.003, sx: w * 0.52, sy: h * 0.62, sz: 0.01 });
  B.tag = tagOf(F_ROOF);
  B.box(tc, { x, y: y0 + 0.04, z: zf + 0.01, sx: 0.03, sy: h * 0.62, sz: 0.02 });
  B.box(tc, { x, y: y0 + 0.02, z: zf + 0.02, sx: w * 0.62, sy: 0.04, sz: 0.04 });
  B.box(tc, { x, y: y0 + 0.04 + h * 0.62, z: zf + 0.02, sx: w * 0.62, sy: 0.04, sz: 0.04 });
  roofRect(B, { x0: x - w / 2, z0: z - 0.26, x1: x + w / 2, z1: zf }, y0 + h, L.roof, { along: 'z', over: 0.08, maxRise: 0.4, hip: false, noCurl: true });
  void top;
}

// Gardens and clutter on the strip between a building's walls and the street
function dressStrip(B, b, map, tv, room, owned, bi, seed, L, base) {
  const w = map.w;
  for (const [x, y] of b.rim) {
    if (owned[y * w + x] !== bi + 1) continue;
    const t = terrain(getTile(map, x, y));
    if (t.door) continue;
    // which side of the tile faces out (away from the room)
    let ox = 0, oy = 0, ins = 0;
    for (const [dx, dy] of Object.values(DIRS)) if (room.has((y + dy) * w + x + dx)) { ox -= dx; oy -= dy; ins++; }
    if (ins !== 1) continue;
    const r = hash2(x * 5 + seed, y * 3, 515);
    const cx = x + 0.5 + ox * 0.3, cz = y + 0.5 + oy * 0.3;
    const gy = base;
    const along = ox === 0 ? [1, 0] : [0, 1];
    if (t.key === 'window' && oy >= 0 && L.style !== 'dwarven' && L.style !== 'castle') {
      // a little bed of flowers under the window
      for (let i = 0; i < 4; i++) {
        const s = (i - 1.5) * 0.2;
        const px = cx + along[0] * s, pz = cz + along[1] * s;
        B.shape(TPL.blob, col(0x4a8a30, 0.9 + (i % 2) * 0.15), { x: px, y: gy + 0.06, z: pz, sx: 0.2, sy: 0.15, sz: 0.18 });
        B.shape(TPL.blob, col([0xf06080, 0xf8e070, 0xb080f0, 0xffffff][(i + Math.floor(r * 4)) % 4]), { x: px + 0.03, y: gy + 0.14, z: pz + 0.02, s: 0.06 });
      }
    } else if (r < 0.12 && L.style !== 'elven') {
      // barrels and a crate
      B.shape(TPL.cyl8, col(0x8a5a2a), { x: cx - along[0] * 0.12, y: gy, z: cz - along[1] * 0.12, sx: 0.24, sy: 0.32, sz: 0.24 });
      B.shape(TPL.cyl8, col(0x3a3430), { x: cx - along[0] * 0.12, y: gy + 0.22, z: cz - along[1] * 0.12, sx: 0.25, sy: 0.03, sz: 0.25 });
      B.box(col(0xa07a48), { x: cx + along[0] * 0.18, y: gy, z: cz + along[1] * 0.18, sx: 0.24, sy: 0.22, sz: 0.24, ry: r * 3 });
    } else if (r < 0.2 && L.style !== 'elven' && L.style !== 'castle') {
      // a stack of firewood under the eaves
      for (let i = 0; i < 6; i++) {
        const s = (i % 3 - 1) * 0.11, h = Math.floor(i / 3) * 0.09;
        B.shape(TPL.cyl6, col(i % 2 ? 0x8a6038 : 0x7a5230), { x: cx + along[0] * s, y: gy + 0.05 + h, z: cz + along[1] * s, sx: 0.09, sy: 0.4, sz: 0.09, rx: along[0] ? Math.PI / 2 : 0, rz: along[1] ? Math.PI / 2 : 0 });
      }
    } else if (r > 0.88 && (L.style === 'village' || L.style === 'town' || L.style === 'elven')) {
      B.shape(TPL.blob, col(0x3f7a2c), { x: cx, y: gy + 0.12, z: cz, sx: 0.36, sy: 0.3, sz: 0.32 });
    }
  }
}

// Split a set of tiles into rectangles (rows merged greedily)
function splitRects(set, w) {
  const left = new Set(set);
  const out = [];
  const keys = [...set].sort((a, b) => a - b);
  for (const k of keys) {
    if (!left.has(k)) continue;
    const x0 = k % w, y0 = Math.floor(k / w);
    let x1 = x0;
    while (left.has(y0 * w + x1 + 1)) x1++;
    let y1 = y0;
    for (;;) {
      let ok = true;
      for (let x = x0; x <= x1; x++) if (!left.has((y1 + 1) * w + x)) { ok = false; break; }
      if (!ok) break;
      y1++;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) left.delete(y * w + x);
    out.push({ x0, y0, x1, y1 });
  }
  // biggest first
  out.sort((a, b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1));
  return out;
}
