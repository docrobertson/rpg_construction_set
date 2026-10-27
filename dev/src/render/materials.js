// Shared materials. All of them sample a per-map "visibility" texture so that
// tiles outside the party's line of sight are darkened (Ultima-style).
import * as THREE from 'three';

export const shared = {
  uTime: { value: 0 },
  uVisTex: { value: null },
  uVisSize: { value: new THREE.Vector2(1, 1) },
  uVisOn: { value: 0 },
};

function injectVisibility(material, extra = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uVisTex = shared.uVisTex;
    shader.uniforms.uVisSize = shared.uVisSize;
    shader.uniforms.uVisOn = shared.uVisOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec2 vVisPos;
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
          ${extra.vertexBody || ''}
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform sampler2D uVisTex;
        uniform vec2 uVisSize;
        uniform float uVisOn;
        varying vec2 vVisPos;
        ${extra.fragmentHead || ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${extra.fragmentColor || ''}`)
      .replace('#include <tonemapping_fragment>', `
        {
          // a few taps soften the tile-sized steps of the line-of-sight map
          vec2 uv = vVisPos / uVisSize, o = 0.5 / uVisSize;
          float vis = (2.0 * texture2D(uVisTex, uv).r
            + texture2D(uVisTex, uv + vec2(o.x, o.y)).r + texture2D(uVisTex, uv + vec2(-o.x, o.y)).r
            + texture2D(uVisTex, uv + vec2(o.x, -o.y)).r + texture2D(uVisTex, uv - o).r) / 6.0;
          vis = mix(1.0, vis, uVisOn);
          gl_FragColor.rgb *= vis;
        }
        #include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => 'vis_' + (extra.key || 'base');
  return material;
}

export function createMaterials() {
  // 1x1 white placeholder visibility texture
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  shared.uVisTex.value = blank;

  const land = injectVisibility(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'land' });

  const water = injectVisibility(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'water',
    vertexBody: `
      transformed.y += sin(wp0.x * 1.9 + uTime * 1.4) * 0.018 + cos(wp0.z * 2.3 + uTime * 1.1) * 0.018;
    `,
    fragmentColor: `
      {
        float w = sin(vVisPos.x * 3.1 + uTime * 1.2 + sin(vVisPos.y * 2.7 + uTime * 0.7) * 1.5);
        float w2 = cos(vVisPos.y * 3.7 - uTime * 0.9 + sin(vVisPos.x * 1.3) * 1.2);
        diffuseColor.rgb *= 0.93 + 0.07 * w * w2;
        diffuseColor.rgb += vec3(0.05, 0.07, 0.08) * smoothstep(0.85, 1.0, w * w2);
      }
    `,
  });

  const glow = injectVisibility(new THREE.MeshBasicMaterial({ vertexColors: true }), {
    key: 'glow',
    fragmentColor: `
      diffuseColor.rgb *= 0.85 + 0.15 * sin(uTime * 3.0 + vVisPos.x * 4.1 + vVisPos.y * 3.3);
    `,
  });

  // Figures are cel-shaded in a few soft bands and drawn with an ink outline
  // (the back faces, pushed out along their normals), so they read like
  // painted miniatures against the softer-lit land.
  const ramp = new THREE.DataTexture(new Uint8Array([92, 150, 205, 255]), 4, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const entity = injectVisibility(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp }), { key: 'entity' });
  const outline = injectVisibility(new THREE.MeshBasicMaterial({ color: 0x20150e, side: THREE.BackSide }), {
    key: 'outline',
    vertexPre: 'transformed += normalize(normal) * 0.013;',
  });
  const entityGlow = injectVisibility(new THREE.MeshBasicMaterial({ vertexColors: true }), { key: 'eglow' });

  const shadowBlob = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
  });

  return { land, water, glow, entity, entityGlow, outline, shadowBlob };
}

// Silhouette shown where a unit is hidden behind trees or walls.
export function silhouetteMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.45, depthFunc: THREE.GreaterDepth, depthWrite: false,
  });
}
