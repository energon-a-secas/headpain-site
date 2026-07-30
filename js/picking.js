// Zone picking: raycast → UV → zone-atlas LUT, with nearest-patch fallback for gaps.

import * as THREE from 'three';

// Build a Uint8Array LUT from the atlas image (drawn into an offscreen canvas).
// glTF UV origin == canvas origin (both top-left), so no flip is needed.
export function buildLut(image, atlasSize) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = atlasSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, atlasSize, atlasSize).data;
  const lut = new Uint8Array(atlasSize * atlasSize);
  for (let i = 0; i < lut.length; i++) {
    lut[i] = Math.round(data[i * 4] / 5); // gray = zoneIndex * idScale(5)
  }
  return lut;
}

function texel(lut, atlasSize, u, v) {
  const x = Math.min(atlasSize - 1, Math.max(0, Math.floor(u * atlasSize)));
  const y = Math.min(atlasSize - 1, Math.max(0, Math.floor(v * atlasSize)));
  return lut[y * atlasSize + x];
}

// 3×3 majority filter to de-speckle seam texels.
function majoritySample(lut, atlasSize, u, v) {
  const counts = new Map();
  const step = 1 / atlasSize;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const id = texel(lut, atlasSize, u + dx * step, v + dy * step);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  let best = 0, bestCount = 0;
  for (const [id, c] of counts) if (c > bestCount) { best = id; bestCount = c; }
  return best;
}

const _d = new THREE.Vector3();

// Nearest-patch fallback for atlas gaps (clicking between zones, e.g. the lips).
// A point inside a patch's ellipse picks that patch; otherwise the closest
// anchor wins — "which zone center is nearest to where I tapped".
export function nearestPatch(point, zones, maxDist = 0.6) {
  let inside = null, insideScore = 1.0;
  let near = null, nearDist = maxDist;
  for (const z of zones) {
    _d.set(point.x - z.anchor[0], point.y - z.anchor[1], point.z - z.anchor[2]);
    const dn = Math.abs(_d.x * z.normal[0] + _d.y * z.normal[1] + _d.z * z.normal[2]);
    if (dn > 0.35) continue; // off the patch's plane (other side of the head)
    const du = (_d.x * z.u[0] + _d.y * z.u[1] + _d.z * z.u[2]) / z.ru;
    const dv = (_d.x * z.v[0] + _d.y * z.v[1] + _d.z * z.v[2]) / z.rv;
    const score = du * du + dv * dv;
    if (score <= insideScore) { insideScore = score; inside = z; }
    const dist = _d.length();
    if (dist < nearDist) { nearDist = dist; near = z; }
  }
  return inside || near;
}

/**
 * Pick a zone from a pointer position.
 * Returns { zone, point, normal } — point/normal in head-local space (mesh is at origin).
 */
export function pickZone(raycaster, pointer, camera, headMesh, lut, atlasSize, zones) {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(headMesh, false);
  if (!hits.length) return null;
  const hit = hits[0];

  let zone = null;
  if (hit.uv) {
    const index = majoritySample(lut, atlasSize, hit.uv.x, hit.uv.y);
    if (index > 0) zone = zones[index - 1] || null;
  }
  if (!zone) zone = nearestPatch(hit.point, zones);
  if (!zone) return null;

  const normal = hit.face
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    : hit.point.clone().normalize();
  return { zone, point: hit.point.clone(), normal };
}
