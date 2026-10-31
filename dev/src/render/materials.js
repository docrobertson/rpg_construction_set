// Shared materials. All of them sample a per-map "visibility" texture so that
// tiles outside the party's line of sight are darkened (Ultima-style), a
// per-map light texture (torches, braziers, lava) and a gentle colour grade.
// World materials also dither away around the party ("cutaway") so walls,
// trees and mountains between the camera and the heroes never hide them.
import * as THREE from 'three';
import { faceAtlas } from './faces.js';

export const shared = {
  uTime: { value: 0 },
  uVisTex: { value: null },
  uVisSize: { value: new THREE.Vector2(1, 1) },
  uVisOn: { value: 0 },
  // never-explored ground on outdoor maps is drawn as blank map vellum:
  // x = on (outdoor maps) / off (dungeons stay black), y = paper brightness
  uVellum: { value: new THREE.Vector2(0, 1) },
  // scene effects are only switched on while the main view renders, so
  // off-screen renders (portraits) are never tinted by the map's lights
  uFx: { value: 0 },
  uLightTex: { value: null },
  uLightRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uLightOn: { value: 0 },
  // carried light around the party: x, z, radius, strength
  uParty: { value: new THREE.Vector4(0, 0, 0, 0) },
  // cutaway circles: frag x, frag y, radius (px), world z of the focus (up to
  // 12: in battle every combatant gets one, so no tree hides a fighter)
  uCut: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
  uCutY: { value: new Float32Array(12) },
  uCutN: { value: 0 },
  // extra rim light on figures (rgb, strength): lifts dark monsters off a dark battlefield
  uRim: { value: new THREE.Vector4(0, 0, 0, 0) },
  // reflected sky colour on water
  uSky: { value: new THREE.Color(0x9cc8ec) },
  uGrade: { value: 1 },
};

const COMMON_FRAG = `
  uniform float uTime;
  uniform sampler2D uVisTex;
  uniform vec2 uVisSize;
  uniform float uVisOn;
  uniform vec2 uVellum;
  uniform float uFx;
  uniform sampler2D uLightTex;
  uniform vec4 uLightRect;
  uniform float uLightOn;
  uniform vec4 uParty;
  uniform vec4 uCut[12];
  uniform float uCutY[12];
  uniform int uCutN;
  uniform vec4 uRim;
  uniform vec3 uSky;
  uniform float uGrade;
  varying vec2 vVisPos;
  varying vec3 vWorldPos;
  float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fxNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fxBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float fxBayer(vec2 a) { return fxBayer2(0.5 * a) * 0.25 + fxBayer2(a) + 0.03; }
  // warm light pools: the map's light texture plus the party's own torch
  vec3 fxLight() {
    if (uFx < 0.5 || (uLightOn <= 0.0 && uParty.w <= 0.0)) return vec3(0.0);
    float fl = 0.86 + 0.08 * sin(uTime * 9.3 + vWorldPos.x * 2.1) + 0.06 * sin(uTime * 6.1 + vWorldPos.z * 2.7);
    vec3 L = texture2D(uLightTex, (vWorldPos.xz - uLightRect.xy) / uLightRect.zw).rgb * uLightOn;
    float pd = length(vWorldPos.xz - uParty.xy);
    float pl = uParty.w * smoothstep(uParty.z, uParty.z * 0.15, pd);
    return (L * 2.0 + vec3(1.0, 0.66, 0.36) * pl) * fl;
  }
`;

function injectVisibility(material, extra = {}) {
  material.onBeforeCompile = (shader) => {
    for (const k of Object.keys(shared)) shader.uniforms[k] = shared[k];
    const defs = [
      extra.cut ? '#define FX_CUT' : '',
      extra.slope ? '#define FX_SLOPE' : '',
      extra.paint ? '#define FX_PAINT' : '',
      extra.sway ? '#define FX_SWAY' : '',
      extra.water ? '#define FX_WATER' : '',
      extra.vellum ? '#define FX_VELLUM' : '',
      extra.vellum === 'hide' ? '#define FX_VELLUM_HIDE' : '',
      extra.unlit || material.isMeshBasicMaterial ? '#define FX_UNLIT' : '',
    ].join('\n');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${defs}
        uniform float uTime;
        varying vec2 vVisPos;
        varying vec3 vWorldPos;
        #if defined(FX_SWAY) || defined(FX_WATER)
          attribute float aux;
          varying float vAux;
        #endif
        #ifdef FX_SLOPE
          varying float vWorldNY;
        #endif
        ${extra.vertexHead || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${extra.vertexPre || ''}
        {
          vec4 wp0 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp0 = instanceMatrix * wp0;
          #endif
          wp0 = modelMatrix * wp0;
          vVisPos = wp0.xz;
          vWorldPos = wp0.xyz;
          #if defined(FX_SWAY) || defined(FX_WATER)
            vAux = aux;
          #endif
          #ifdef FX_SLOPE
            vWorldNY = normalize(mat3(modelMatrix) * objectNormal).y;
          #endif
          #ifdef FX_SWAY
            // foliage leans with a slow gust that rolls across the land
            float gust = sin(uTime * 1.3 + wp0.x * 0.35 + wp0.z * 0.2) * 0.6 + 0.4;
            transformed.x += (sin(uTime * 2.1 + wp0.x * 1.7 + wp0.z * 0.9) * 0.5 + gust) * 0.035 * aux;
            transformed.z += cos(uTime * 1.7 + wp0.z * 1.3 + wp0.x * 0.7) * 0.022 * aux;
          #endif
          ${extra.vertexBody || ''}
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${defs}
        ${COMMON_FRAG}
        #if defined(FX_SWAY) || defined(FX_WATER)
          varying float vAux;
        #endif
        #ifdef FX_SLOPE
          varying float vWorldNY;
        #endif
        ${extra.fragmentHead || ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        #ifdef FX_CUT
        if (uFx > 0.5) {
          // screen-door dither through anything tall standing in front of a focus
          for (int i = 0; i < 12; i++) {
            if (i >= uCutN) break;
            vec4 c = uCut[i];
            float d = length(gl_FragCoord.xy - c.xy);
            if (d > c.z || vWorldPos.z < c.w) continue;
            // the middle clears completely; only a thin rim dithers, so the
            // hole reads as a clean window rather than a speckled patch
            float k = smoothstep(c.z, c.z * 0.9, d) * smoothstep(0.0, 0.1, vWorldPos.y - uCutY[i]) * smoothstep(0.0, 0.12, vWorldPos.z - c.w);
            if (fxBayer(gl_FragCoord.xy) < k * 1.08) discard;
          }
        }
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef FX_PAINT
        {
          // soft, hand-painted variation: broad washes plus a finer brush texture
          float n1 = fxNoise(vWorldPos.xz * 0.31 + 3.7);
          float n2 = fxNoise(vWorldPos.xz * 1.6 + vec2(n1 * 2.0, -11.3));
          float n3 = 1.0 - n2;
          diffuseColor.rgb *= 0.9 + 0.17 * n1 + 0.1 * (n2 - 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.05, 0.82), smoothstep(0.55, 0.85, n1) * 0.5);
          #ifdef FX_SLOPE
            // steep ground weathers to banded rock
            float steep = 1.0 - vWorldNY;
            float rk = smoothstep(0.2, 0.42, steep + (n2 - 0.5) * 0.12);
            vec3 rock = mix(vec3(0.2, 0.18, 0.16), diffuseColor.rgb * 0.62, 0.4);
            rock *= 0.82 + 0.22 * n3 + 0.12 * sin(vWorldPos.y * 22.0 + n2 * 5.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, rock, rk);
          #endif
        }
        #endif
        ${extra.fragmentColor || ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${extra.fragmentNormal || ''}`)
      .replace('#include <opaque_fragment>', `
        #ifndef FX_UNLIT
          outgoingLight += diffuseColor.rgb * fxLight();
        #endif
        ${extra.fragmentLight || ''}
        #include <opaque_fragment>`)
      .replace('#include <tonemapping_fragment>', `
        {
          // gentle grade: richer colour, cool shadows, warm highlights
          vec3 c = gl_FragColor.rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 g = mix(vec3(l), c, 1.1);
          g *= mix(vec3(0.9, 0.95, 1.08), vec3(1.05, 1.0, 0.93), smoothstep(0.02, 0.45, l));
          gl_FragColor.rgb = mix(c, max(g, 0.0), uGrade);
          float vis = 1.0;
          // explored (1) or never seen (0): the green channel
          float expl = 1.0;
          if (uVisOn > 0.5) {
            // a few taps soften the tile-sized steps of the line-of-sight map
            vec2 uv = vVisPos / uVisSize, o = 0.5 / uVisSize;
            vec2 vs = (2.0 * texture2D(uVisTex, uv).rg
              + texture2D(uVisTex, uv + vec2(o.x, o.y)).rg + texture2D(uVisTex, uv + vec2(-o.x, o.y)).rg
              + texture2D(uVisTex, uv + vec2(o.x, -o.y)).rg + texture2D(uVisTex, uv - o).rg) / 6.0;
            vis = vs.r;
            expl = vs.g;
          }
          ${extra.fragmentFinal || ''}
          gl_FragColor.rgb *= vis;
          #ifdef FX_VELLUM
          if (uVisOn > 0.5 && uVellum.x > 0.5 && expl < 0.995) {
            // Unknown land is blank parchment. The edge wanders (two octaves
            // of noise), is drawn with a faint brown ink line and the known
            // land just inside it fades to a sepia wash, like a hand-drawn map.
            vec2 q = vWorldPos.xz;
            float w1 = fxNoise(q * 0.9 + 17.3), w2 = fxNoise(q * 3.1 - 5.1);
            float e = expl + ((w1 - 0.5) * 0.34 + (w2 - 0.5) * 0.12) * min(1.0, (1.0 - expl) * 5.0);
            float paper = 1.0 - smoothstep(0.4, 0.5, e);
            #ifdef FX_VELLUM_HIDE
              // trees, walls and rocks on unknown land are not drawn at all
              if (e < 0.5) discard;
            #endif
            float stain = fxNoise(q * 0.13 + 41.0) * 0.6 + fxNoise(q * 0.37 - 7.0) * 0.4;
            float grain = fxNoise(q * 11.0) * 0.5 + fxNoise(q * vec2(31.0, 5.0) + 3.0) * 0.5;
            vec3 vel = vec3(0.62, 0.48, 0.26); // (linear) warm parchment
            vel *= 0.9 + 0.12 * stain;
            vel = mix(vel, vel * vec3(0.9, 0.78, 0.6), smoothstep(0.55, 0.85, stain) * 0.6);
            vel *= 0.93 + 0.1 * grain;
            vel *= uVellum.y;
            float l = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11));
            vec3 sepia = vec3(l) * vec3(1.2, 0.98, 0.66) + vel * 0.25;
            float wash = 1.0 - smoothstep(0.5, 0.95, e);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, sepia, wash * 0.55);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vel, paper);
            float ink = 1.0 - smoothstep(0.02, 0.075, abs(e - 0.45));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.11, 0.05, 0.016) * uVellum.y, ink * 0.55);
          }
          #endif
        }
        #include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => 'vis3_' + (extra.key || 'base');
  return material;
}

export function createMaterials() {
  // 1x1 placeholder visibility / light textures
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  shared.uVisTex.value = blank;
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  shared.uLightTex.value = black;

  // the ground: painted variation and rocky slopes
  const land = injectVisibility(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'land', paint: true, slope: true, vellum: 'paint' });
  // walls, rocks, buildings and plants standing on it: sway and cutaway
  const props = injectVisibility(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'props', cut: true, sway: true, vellum: 'hide' });

  const water = injectVisibility(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x8c9aa8 }), {
    key: 'water',
    water: true,
    vellum: 'paint',
    vertexBody: `
      transformed.y += sin(wp0.x * 1.9 + uTime * 1.4) * 0.014 + cos(wp0.z * 2.3 + uTime * 1.1) * 0.014;
    `,
    fragmentColor: `
      {
        // aux: 1 at the shore, 0 in open water
        vec2 p = vWorldPos.xz;
        float n = fxNoise(p * 1.7 + vec2(uTime * 0.15, -uTime * 0.1));
        float n2 = fxNoise(p * 0.45 - vec2(uTime * 0.05, 0.0));
        diffuseColor.rgb *= 0.92 + 0.14 * n2;
        float shore = vAux;
        float band = smoothstep(0.55, 0.95, sin(shore * 9.0 - uTime * 1.6 + n * 2.5) * 0.5 + 0.5) * smoothstep(0.15, 0.5, shore);
        float foam = max(smoothstep(0.72, 0.96, shore + (n - 0.5) * 0.3), band * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.93, 0.95), foam * 0.9);
      }
    `,
    fragmentNormal: `
      {
        vec2 p = vWorldPos.xz;
        float t = uTime;
        vec2 g = vec2(cos(p.x * 2.1 + t * 1.3 + sin(p.y * 1.7)), cos(p.y * 2.6 - t * 1.1 + sin(p.x * 1.3))) * 0.16
          + vec2(sin(p.x * 5.3 + p.y * 3.1 + t * 2.3), cos(p.y * 6.1 - p.x * 2.3 + t * 1.9)) * 0.07;
        normal = normalize((viewMatrix * vec4(normalize(vec3(-g.x, 1.0, -g.y)), 0.0)).xyz);
      }
    `,
    fragmentLight: `
      {
        // the sky's colour mirrored in the water, stronger at grazing angles
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        float streak = fxNoise(vWorldPos.xz * vec2(0.6, 1.8) + vec2(uTime * 0.07, 0.0));
        outgoingLight = mix(outgoingLight, uSky * (0.75 + 0.35 * streak), clamp(0.12 + fres * 0.9, 0.0, 0.6) * (1.0 - vAux * 0.6));
      }
    `,
  });

  const glow = injectVisibility(new THREE.MeshBasicMaterial({ vertexColors: true }), {
    key: 'glow',
    cut: true,
    vellum: 'hide',
    unlit: true,
    fragmentColor: `
      diffuseColor.rgb *= 0.85 + 0.15 * sin(uTime * 3.0 + vVisPos.x * 4.1 + vVisPos.y * 3.3);
    `,
  });

  // molten rock: a dark crust drifting over glowing veins
  const lava = injectVisibility(new THREE.MeshBasicMaterial({ vertexColors: true }), {
    key: 'lava',
    unlit: true,
    vellum: 'paint',
    fragmentColor: `
      {
        vec2 p = vWorldPos.xz;
        float n = fxNoise(p * 1.9 + vec2(uTime * 0.11, uTime * 0.07));
        float n2 = fxNoise(p * 4.7 - vec2(uTime * 0.17, -uTime * 0.05));
        float m = n * 0.65 + n2 * 0.35;
        float crust = smoothstep(0.5, 0.6, m);
        float vein = 1.0 - smoothstep(0.0, 0.05, abs(m - 0.5));
        vec3 hot = diffuseColor.rgb * (0.9 + 0.2 * sin(uTime * 2.3 + n * 7.0));
        hot = mix(hot, vec3(1.0, 0.85, 0.35), vein * 0.7);
        diffuseColor.rgb = mix(hot * 1.2, vec3(0.05, 0.018, 0.012), crust * 0.92);
      }
    `,
  });

  // Figures are painted miniatures: a soft cel ramp from the sun, the sky's
  // fill, a rim of sky light around the silhouette and a dark, colour-matched
  // outline (back faces pushed out along smoothed normals). The face atlas
  // supplies painted eyes and mouths; everything else samples its white corner.
  const entity = injectVisibility(new THREE.MeshToonMaterial({
    vertexColors: true, map: faceAtlas(), gradientMap: toonRamp(), alphaTest: 0.5, alphaToCoverage: true,
  }), {
    key: 'entity',
    fragmentFinal: `
      {
        vec3 rimSky = vec3(0.7, 0.75, 0.85);
        #if NUM_HEMI_LIGHTS > 0
          rimSky = hemisphereLights[0].skyColor;
        #endif
        vec3 V = normalize(vViewPosition);
        float rim = 1.0 - clamp(dot(normal, V), 0.0, 1.0);
        rim = smoothstep(0.55, 1.0, rim);
        gl_FragColor.rgb += rimSky * rim * (0.1 + 0.3 * diffuseColor.rgb);
        // a battle in the dark: a broader, stronger rim so black fur and bone stand off the floor
        gl_FragColor.rgb += uRim.rgb * smoothstep(0.35, 1.0, 1.0 - clamp(dot(normal, V), 0.0, 1.0)) * uRim.w;
        #ifdef USE_MAP
          // skin and painted faces (tagged through the uvs) never sink into
          // shadow: a hood, a brim or a turn from the sun only softens them
          float skin = step(0.875, vMapUv.x) * step(0.75, vMapUv.y) * (1.0 - step(0.875, vMapUv.y));
          float face = (1.0 - step(0.875, vMapUv.y)) * (1.0 - step(0.75, vMapUv.x)) * step(0.125, vMapUv.y);
          float amb = clamp(dot(rimSky, vec3(0.3, 0.5, 0.2)), 0.0, 1.0);
          gl_FragColor.rgb = max(gl_FragColor.rgb, diffuseColor.rgb * 0.84 * amb * max(skin, face));
        #endif
        // metal (tagged through the uvs): a small, crisp painted glint from the
        // sun, so steel reads as steel rather than a white blob
        #if defined( USE_MAP ) && NUM_DIR_LIGHTS > 0
          float metal = step(0.875, vMapUv.x) * step(0.875, vMapUv.y);
          vec3 Hh = normalize(directionalLights[0].direction + V);
          float sp = max(dot(normal, Hh), 0.0);
          float glint = smoothstep(0.972, 0.99, sp) * 0.85 + pow(sp, 48.0) * 0.12;
          // steel and gold sit a shade darker than cloth, with a deeper turn
          // away from the sun, so domes keep their form
          gl_FragColor.rgb *= 1.0 - metal * (0.16 + 0.14 * (1.0 - smoothstep(0.35, 0.85, sp)));
          // and never burns out to white under a strong key: only the glint may
          gl_FragColor.rgb = mix(gl_FragColor.rgb, min(gl_FragColor.rgb, diffuseColor.rgb * 1.3), metal);
          gl_FragColor.rgb += metal * glint * directionalLights[0].color * 0.28 * (0.45 + diffuseColor.rgb);
        #endif
      }
    `,
  });
  // The ink line keeps a steady width on screen (about 1.7 px), so it stays
  // crisp both in close-ups and on a zoomed-out map.
  const outline = injectVisibility(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, color: new THREE.Color().setRGB(0.075, 0.06, 0.055) }), {
    key: 'outline',
    vertexPre: `{
      vec4 mvp0 = modelViewMatrix * vec4(transformed, 1.0);
      float sc = max(1e-4, length((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz));
      float w = 0.0043 * -mvp0.z / projectionMatrix[1][1];
      transformed += normalize(normal) * clamp(w / sc, 0.0045, 0.02);
    }`,
  });
  const entityGlow = injectVisibility(new THREE.MeshBasicMaterial({ vertexColors: true }), { key: 'eglow' });

  const shadowBlob = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
  });

  return { land, props, water, glow, lava, entity, entityGlow, outline, shadowBlob };
}

// A soft cel ramp for figures: shadowed side, a quick but smooth terminator,
// then the lit side.
function toonRamp() {
  const n = 32;
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const t = Math.min(1, Math.max(0, (x - 0.4) / 0.2));
    const v = 0.58 + 0.42 * t * t * (3 - 2 * t);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255);
    d[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(d, n, 1);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Silhouette shown where a unit is hidden behind trees or walls.
export function silhouetteMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.45, depthFunc: THREE.GreaterDepth, depthWrite: false,
  });
}
