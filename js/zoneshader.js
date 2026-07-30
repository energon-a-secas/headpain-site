// Zone highlight shader — patches the head's skin material so whole zone patches
// can glow (hover / selected / has-markers) with zero extra geometry.

import * as THREE from 'three';

const MAX_ZONES = 64;

export function createZoneShader(skinMaterial, atlasImage, atlasSize) {
  const atlasTex = new THREE.Texture(atlasImage);
  atlasTex.flipY = false; // GLB UV convention
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.needsUpdate = true;

  const zoneData = new Uint8Array(MAX_ZONES * 4); // R intensity, G hover, B selected, A active
  const dataTex = new THREE.DataTexture(zoneData, MAX_ZONES, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  dataTex.minFilter = THREE.NearestFilter;
  dataTex.magFilter = THREE.NearestFilter;
  dataTex.needsUpdate = true;

  skinMaterial.defines = { ...(skinMaterial.defines || {}), USE_UV: '' };
  skinMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.zoneAtlas = { value: atlasTex };
    shader.uniforms.zoneData = { value: dataTex };

    shader.vertexShader = 'varying vec2 vZoneUv;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\n  vZoneUv = uv;'
    );

    shader.fragmentShader = (
      'varying vec2 vZoneUv;\n' +
      'uniform sampler2D zoneAtlas;\nuniform sampler2D zoneData;\n' +
      'vec3 zoneRamp(float i) {\n' +
      '  vec3 c1 = vec3(1.0, 0.8, 0.8);\n' +
      '  vec3 c3 = vec3(1.0, 0.4, 0.4);\n' +
      '  vec3 c6 = vec3(0.8, 0.0, 0.0);\n' +
      '  vec3 c9 = vec3(0.5, 0.0, 0.0);\n' +
      '  if (i < 3.0) return mix(c1, c3, clamp((i - 1.0) / 2.0, 0.0, 1.0));\n' +
      '  if (i < 6.0) return mix(c3, c6, (i - 3.0) / 3.0);\n' +
      '  return mix(c6, c9, min((i - 6.0) / 3.0, 1.0));\n' +
      '}\n'
    ) + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float zoneGray = texture2D(zoneAtlas, vZoneUv).r;
        float zoneIndex = floor(zoneGray * 51.0 + 0.5);
        if (zoneIndex > 0.5) {
          vec4 zd = texture2D(zoneData, vec2((zoneIndex + 0.5) / ${MAX_ZONES}.0, 0.5));
          float zi = zd.r * 10.0;
          if (zd.a > 0.01 && zi > 0.0) {
            diffuseColor.rgb = mix(diffuseColor.rgb, zoneRamp(zi), 0.26 + 0.04 * zi);
          }
          if (zd.g > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.72, 0.51), 0.30);
          if (zd.b > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.86, 0.61), 0.45);
        }
      }`
    );
  };
  skinMaterial.customProgramCacheKey = () => 'headmap-zone-shader';
  skinMaterial.needsUpdate = true;

  function commit() { dataTex.needsUpdate = true; }

  return {
    // index: 1-based zone index from zones.baked.json; 0 clears nothing (no-op)
    setZoneState(index, { intensity = 0, hover = false, selected = false, active = false } = {}) {
      if (index <= 0 || index >= MAX_ZONES) return;
      const o = index * 4;
      zoneData[o] = Math.round(Math.max(0, Math.min(10, intensity)) * 25.5);
      zoneData[o + 1] = hover ? 255 : 0;
      zoneData[o + 2] = selected ? 255 : 0;
      zoneData[o + 3] = active ? 255 : 0;
      commit();
    },
    clearAll() {
      zoneData.fill(0);
      commit();
    }
  };
}
