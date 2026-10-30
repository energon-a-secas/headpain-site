// Where the face zones sit, checked against the head itself. The face hints in
// js/zones.js were authored from landmarks the baker's probe printed, and until
// 2026-10-30 each probe window caught the feature below the one it named:
// "Behind / around eye" sat below the nose tip, "Bridge of nose" on the upper
// lip, "Upper teeth" on the chin, and every id, label and side still agreed, so
// no other test noticed. These read the nose tip, the chin and the ear off the
// baked mesh and hold each zone on the right side of them. Coordinates are the
// baked ones: chin -1, crown +1, the face's midline at x = 0, +x the patient's
// left.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, baked } from './fixtures.mjs';

function readMesh() {
  const buf = readFileSync(join(ROOT, 'assets/head-cropped.glb'));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = 20 + jsonLen + 8;
  const prim = json.meshes[0].primitives[0];
  const read = (index) => {
    const acc = json.accessors[index], view = json.bufferViews[acc.bufferView];
    const width = { SCALAR: 1, VEC3: 3 }[acc.type];
    const base = bin + (view.byteOffset || 0) + (acc.byteOffset || 0);
    const out = new Float64Array(acc.count * width);
    for (let i = 0; i < out.length; i++) {
      out[i] = acc.componentType === 5126 ? dv.getFloat32(base + i * 4, true)
        : acc.componentType === 5125 ? dv.getUint32(base + i * 4, true) : dv.getUint16(base + i * 2, true);
    }
    return out;
  };
  const pos = read(prim.attributes.POSITION), idx = read(prim.indices);
  // The file keeps the vertices the crop dropped; only the drawn ones count.
  const drawn = [...new Set(idx)].map(i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  return drawn;
}

const verts = readMesh();
const most = (pred, score) => verts.filter(pred).reduce((a, b) => (score(b) > score(a) ? b : a));
const midline = p => Math.abs(p[0]) < 0.06;
const noseTip = most(p => midline(p) && p[1] > -0.8 && p[1] < 0.6, p => p[2]);
const chinPoint = most(p => midline(p) && p[1] > noseTip[1] - 0.7 && p[1] < noseTip[1] - 0.4, p => p[2]);
const earLeft = most(p => p[1] > noseTip[1] - 0.3 && p[1] < noseTip[1] + 0.5 && Math.abs(p[2]) < 0.3, p => p[0]);
const y = id => {
  const z = baked.zones.find(zone => zone.id === id);
  assert.ok(z, `${id} is not in the bake`);
  return z.anchor[1];
};

test('the landmarks are where a face has them, so the checks below mean something', () => {
  assert.ok(noseTip[2] > 0.9, `the nose tip should be the face's most forward point, found z=${noseTip[2].toFixed(3)}`);
  assert.ok(chinPoint[1] < noseTip[1] - 0.4, 'the chin point should sit well below the nose tip');
  assert.ok(earLeft[0] > 0.65, `the left ear should be the head's widest point at its height, found x=${earLeft[0].toFixed(3)}`);
});

test('the eye, temple, bridge and forehead zones sit above the nose tip', () => {
  const above = ['behind-eye-left', 'behind-eye-right', 'sinus-ethmoid', 'nose-bridge', 'temple-left', 'temple-right',
    'sinus-frontal-left', 'sinus-frontal-right', 'forehead-lower-left', 'forehead-lower-right', 'forehead-lower-center',
    'forehead-upper-left', 'forehead-upper-right', 'forehead-upper-center'];
  const low = above.filter(id => !(y(id) > noseTip[1])).map(id => `${id} at y=${y(id).toFixed(3)}`);
  assert.deepEqual(low, [], `these sit at or below the nose tip (y=${noseTip[1].toFixed(3)})`);
});

test('the face reads top to bottom in the order the names say', () => {
  const order = [
    ['forehead-upper-center', 'forehead-lower-center', 'sinus-ethmoid', 'nose-bridge'],
    ['forehead-upper-left', 'forehead-lower-left', 'behind-eye-left', 'sinus-maxillary-left', 'upper-teeth-left'],
    ['forehead-upper-right', 'forehead-lower-right', 'behind-eye-right', 'sinus-maxillary-right', 'upper-teeth-right'],
  ];
  for (const column of order) {
    for (let i = 1; i < column.length; i++) {
      assert.ok(y(column[i - 1]) > y(column[i]), `${column[i - 1]} should sit above ${column[i]}`);
    }
  }
});

test('the upper teeth sit between the nose tip and the chin, and the chin on the chin', () => {
  for (const id of ['upper-teeth-left', 'upper-teeth-right']) {
    assert.ok(y(id) < noseTip[1] && y(id) > chinPoint[1], `${id} at y=${y(id).toFixed(3)} is outside the mouth`);
  }
  assert.ok(Math.abs(y('chin') - chinPoint[1]) < 0.1,
    `the chin zone at y=${y('chin').toFixed(3)} is off the point of the chin at y=${chinPoint[1].toFixed(3)}`);
});

test('the ear and jaw-joint zones sit at the ear, not below it', () => {
  for (const id of ['ear-left', 'ear-right', 'tmj-left', 'tmj-right']) {
    assert.ok(Math.abs(y(id) - earLeft[1]) < 0.15,
      `${id} at y=${y(id).toFixed(3)} is off the ear at y=${earLeft[1].toFixed(3)}`);
  }
});

test('every left zone and its right twin mirror each other across the midline', () => {
  const off = [];
  for (const left of baked.zones.filter(z => z.side === 'left')) {
    const right = baked.zones.find(z => z.id === left.id.replace(/-left$/, '-right'));
    const dx = Math.abs(left.anchor[0] + right.anchor[0]), dy = Math.abs(left.anchor[1] - right.anchor[1]);
    if (dx > 0.05 || dy > 0.05) off.push(`${left.baseId}: x off by ${dx.toFixed(3)}, y by ${dy.toFixed(3)}`);
  }
  assert.deepEqual(off, [], 'twins mirrored across x = 0 rather than the face midline land beside each other');
});

test('every right twin takes its left twin\'s frame, mirrored, so a tap and its mirror get mirrored names', () => {
  // Each twin used to take the normal of its own snapped vertex. The two ears'
  // normals differed enough that the left canal read "Jaw joint" and the right
  // one "In / around ear".
  const mirrored = a => [-a[0], a[1], a[2]];
  const off = [];
  for (const left of baked.zones.filter(z => z.side === 'left')) {
    const right = baked.zones.find(z => z.id === left.id.replace(/-left$/, '-right'));
    for (const key of ['normal', 'u']) {
      const gap = Math.max(...mirrored(left[key]).map((c, i) => Math.abs(c - right[key][i])));
      if (gap > 1e-9) off.push(`${left.baseId}.${key} differs by ${gap.toExponential(2)}`);
    }
  }
  assert.deepEqual(off, []);
});
