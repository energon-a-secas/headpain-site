// The picker's lookup, with no three.js in it: a hit's UV → zone-atlas texel →
// zone, with a 3×3 majority to de-speckle seams and the nearest-patch fallback
// for gaps. js/picking.js raycasts and hands its hit here; tests/zones-taps
// raycasts in Node and hands its hit to the same zoneAt, so a tap the tests pin
// names the zone the site names.

export function texel(lut, atlasSize, u, v) {
  const x = Math.min(atlasSize - 1, Math.max(0, Math.floor(u * atlasSize)));
  const y = Math.min(atlasSize - 1, Math.max(0, Math.floor(v * atlasSize)));
  return lut[y * atlasSize + x];
}

// 3×3 majority filter to de-speckle seam texels. A tie goes to the id seen
// first, which is the Map's insertion order.
export function majoritySample(lut, atlasSize, u, v) {
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

// Nearest-patch fallback for atlas gaps (clicking between zones, e.g. the lips).
// A point inside a patch's ellipse picks that patch; otherwise the closest
// anchor wins: "which zone center is nearest to where I tapped". The point is
// anything with x, y and z (a THREE.Vector3) or a 3-array.
export function nearestPatch(point, zones, maxDist = 0.6) {
  const px = point.x ?? point[0], py = point.y ?? point[1], pz = point.z ?? point[2];
  let inside = null, insideScore = 1.0;
  let near = null, nearDist = maxDist;
  for (const z of zones) {
    const dx = px - z.anchor[0], dy = py - z.anchor[1], dz = pz - z.anchor[2];
    const dn = Math.abs(dx * z.normal[0] + dy * z.normal[1] + dz * z.normal[2]);
    if (dn > 0.35) continue; // off the patch's plane (other side of the head)
    const du = (dx * z.u[0] + dy * z.u[1] + dz * z.u[2]) / z.ru;
    const dv = (dx * z.v[0] + dy * z.v[1] + dz * z.v[2]) / z.rv;
    const score = du * du + dv * dv;
    if (score <= insideScore) { insideScore = score; inside = z; }
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < nearDist) { nearDist = dist; near = z; }
  }
  return inside || near;
}

// The zone a hit names: the atlas under its UV when that is a zone, else the
// nearest patch to its point, else null. zones is the registry's, in index
// order, so atlas index i is zones[i - 1].
export function zoneAt(lut, atlasSize, zones, uv, point) {
  let zone = null;
  if (uv) {
    const index = majoritySample(lut, atlasSize, uv.x, uv.y);
    if (index > 0) zone = zones[index - 1] || null;
  }
  return zone || nearestPatch(point, zones);
}
