// Small pictures of heroes for the side panel: each figure is rendered once
// (per look) off-screen with the game's own renderer, then kept as an image.
import * as THREE from 'three';
import { makeModel } from './models.js';
import { shared } from './materials.js';

const W = 176, H = 208; // rendered at twice the stored size, for smooth edges
const cache = new Map();
let rig = null;

function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x4a3c30, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(1.6, 3, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 20);
  const rt = new THREE.WebGLRenderTarget(W, H);
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
  const model = makeModel(look, view.mats);
  const h = model.userData.info.height || 1;
  model.rotation.y = -0.42; // a three-quarter view
  scene.add(model);
  // frame the figure from the knees up, seen from a little above
  const ty = h * 0.58;
  cam.position.set(0, ty + h * 0.26, h * 1.95);
  cam.lookAt(0, ty, 0);

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
