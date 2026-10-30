// Zone picking: raycast → UV → zone-atlas LUT, with nearest-patch fallback for gaps.
// The lookup after the raycast is js/zone-lookup.js, which Node can run.

import { zoneAt } from './zone-lookup.js';

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

/**
 * Pick a zone from a pointer position.
 * Returns { zone, point, normal }: point/normal in head-local space (mesh is at origin).
 */
export function pickZone(raycaster, pointer, camera, headMesh, lut, atlasSize, zones) {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(headMesh, false);
  if (!hits.length) return null;
  const hit = hits[0];

  const zone = zoneAt(lut, atlasSize, zones, hit.uv, hit.point);
  if (!zone) return null;

  const normal = hit.face
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    : hit.point.clone().normalize();
  return { zone, point: hit.point.clone(), normal };
}
