// Zone highlight shader — patches the head's skin material so whole zone patches
// can glow with zero extra geometry. The CPU decides the final tint color and
// strength per zone (group colors, intensity ramp, hover/selected overrides);
// the shader just mixes them in.

import * as THREE from 'three';

const MAX_ZONES = 64;

export function createZoneShader(skinMaterial, atlasImage, atlasSize) {
  const atlasTex = new THREE.Texture(atlasImage);
  atlasTex.flipY = false; // GLB UV convention
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.needsUpdate = true;

  const zoneData = new Uint8Array(MAX_ZONES * 4); // RGB tint color, A mix strength
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
      'uniform sampler2D zoneAtlas;\nuniform sampler2D zoneData;\n'
    ) + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float zoneGray = texture2D(zoneAtlas, vZoneUv).r;
        float zoneIndex = floor(zoneGray * 51.0 + 0.5);
        if (zoneIndex > 0.5) {
          vec4 zd = texture2D(zoneData, vec2((zoneIndex + 0.5) / ${MAX_ZONES}.0, 0.5));
          if (zd.a > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, zd.rgb, zd.a);
        }
      }`
    );
  };
  skinMaterial.customProgramCacheKey = () => 'headmap-zone-shader';
  skinMaterial.needsUpdate = true;

  function commit() { dataTex.needsUpdate = true; }

  return {
    // index: 1-based zone index from zones.baked.json; color/strength are 0..1.
    // strength 0 clears the zone.
    setZoneState(index, { color = [1, 1, 1], strength = 0 } = {}) {
      if (index <= 0 || index >= MAX_ZONES) return;
      const o = index * 4;
      zoneData[o] = Math.round(Math.max(0, Math.min(1, color[0])) * 255);
      zoneData[o + 1] = Math.round(Math.max(0, Math.min(1, color[1])) * 255);
      zoneData[o + 2] = Math.round(Math.max(0, Math.min(1, color[2])) * 255);
      zoneData[o + 3] = Math.round(Math.max(0, Math.min(1, strength)) * 255);
      commit();
    },
    clearAll() {
      zoneData.fill(0);
      commit();
    }
  };
}
