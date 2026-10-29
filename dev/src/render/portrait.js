// Small pictures of heroes for the side panel: each figure is rendered once
// (per look) off-screen with the game's own renderer, then kept as an image.
// Heroes are framed head-and-shoulders in a three-quarter view, lit like a
// painted portrait: warm key from the upper left, sky fill, cool rim behind.
import * as THREE from 'three';
import { makeModel } from './models.js';
import { shared } from './materials.js';

const W = 264, H = 312; // rendered at twice the stored size, for smooth edges
const cache = new Map();
let rig = null;

function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x50402e, 1.6));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.5);
  key.position.set(-1.8, 2.6, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.3);
  rim.position.set(2.5, 1.5, -2.5);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 20);
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  return { scene, cam, rt, buf: new Uint8Array(W * H * 4) };
}

export function portrait(view, look) {
  const key = JSON.stringify(look);
  let url = cache.get(key);
  if (url) return url;
  try { url = render(view, look); } catch { url = ''; }
  cache.set(key, url);
  return url;
}

function render(view, look) {
  rig ||= setup();
  const { scene, cam, rt, buf } = rig;
  // a portrait is about the face: leave weapons, shields and packs out of it
  const bust = look.kind === 'humanoid' || !look.kind ? { ...look, weapon: 'none', shield: null, offhand: null, ranged: null, back: null } : look;
  const model = makeModel(bust, view.mats);
  const info = model.userData.info;
  const h = info.height || 1;
  model.rotation.y = -0.42; // a three-quarter view, turned towards the key light
  scene.add(model);
  if (info.head) {
    // head and shoulders: from mid-chest to just above the crown
    const [, hy, hz, hr] = info.head;
    const span = hr * 4.6;
    const ty = hy - hr * 0.55;
    const d = (span / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(0, ty + d * 0.17, hz + d);
    cam.lookAt(0, ty, hz);
  } else {
    // beasts: frame the whole creature from a little above
    const ty = h * 0.55;
    cam.position.set(0, ty + h * 0.4, h * 2.6);
    cam.lookAt(0, ty, 0);
  }

  const r = view.renderer;
  const prevTarget = r.getRenderTarget();
  const prevColor = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  const vis = shared.uVisOn.value;
  shared.uVisOn.value = 0;
  try {
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    shared.uVisOn.value = vis;
    scene.remove(model);
  }

  // flip rows into a canvas, then halve it
  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const ctx = big.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  ctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = W / 2; out.height = H / 2;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, W / 2, H / 2);
  return out.toDataURL('image/png');
}
