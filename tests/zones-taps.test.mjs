// What a tap names, asked the way the site asks it. tests/zones-anatomy.test.mjs
// holds the anchors in place, but a tap never reads an anchor: it reads the
// atlas texel under the hit, and only falls back to the anchors in a gap. So
// these fire rays at assets/head-cropped.glb, keep the nearest front-face hit
// (three's FrontSide, which is what head3d.js gives the skin), read
// assets/zones-atlas.png under it, and hand both to js/zone-lookup.js's zoneAt,
// the call js/picking.js makes. The 64 sites are where a patient points and the
// names a clinician would accept there; before 2026-10-30, 47 of them came back
// wrong ("Behind / around eye" for a cheekbone, "Jaw joint" for the ear canal).
// Rays are written in the scan's raw coordinates, as the review measured them;
// raw to baked is (raw - c) * 0.419345.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT, baked, registry } from './fixtures.mjs';
import { zoneAt } from '../js/zone-lookup.js';

const C = [-0.088544, 1.587877, 0.133085], SC = 0.419345;
const M = -0.0885; // the face's midline in raw x
const toBaked = raw => raw.map((v, i) => (v - C[i]) * SC);

function readHead() {
  const buf = readFileSync(join(ROOT, 'assets/head-cropped.glb'));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = 20 + jsonLen + 8;
  const prim = json.meshes[0].primitives[0];
  const read = (index) => {
    const acc = json.accessors[index], view = json.bufferViews[acc.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[acc.type];
    const base = bin + (view.byteOffset || 0) + (acc.byteOffset || 0);
    const out = new Float64Array(acc.count * width);
    for (let i = 0; i < out.length; i++) {
      out[i] = acc.componentType === 5126 ? dv.getFloat32(base + i * 4, true)
        : acc.componentType === 5125 ? dv.getUint32(base + i * 4, true) : dv.getUint16(base + i * 2, true);
    }
    return out;
  };
  // head3d.js puts the mesh at the origin with no transform, so the file's
  // coordinates are the ones a tap lands in.
  assert.ok(!json.nodes[0].matrix && !json.nodes[0].translation && !json.nodes[0].rotation && !json.nodes[0].scale,
    'the head node carries a transform, so these rays would miss what the site draws');
  return { pos: read(prim.attributes.POSITION), uv: read(prim.attributes.TEXCOORD_0), idx: read(prim.indices) };
}

// An 8-bit greyscale, non-interlaced PNG, which is what the baker writes. The
// browser hands buildLut the same grey in every channel; anything else here
// throws rather than being misread.
function readGreyPng(buf) {
  let o = 8, w = 0, h = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      assert.deepEqual([depth, colour, interlace], [8, 0, 0], 'zones-atlas.png is no longer 8-bit grey, non-interlaced');
    }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (w + 1)], row = raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1));
    assert.ok(filter <= 4, `zones-atlas.png row ${y} has filter ${filter}, which PNG does not define`);
    for (let x = 0; x < w; x++) {
      const a = x ? px[y * w + x - 1] : 0, b = y ? px[(y - 1) * w + x] : 0, c = x && y ? px[(y - 1) * w + x - 1] : 0;
      let predict = 0;
      if (filter === 1) predict = a;
      else if (filter === 2) predict = b;
      else if (filter === 3) predict = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        predict = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * w + x] = (row[x] + predict) & 0xff;
    }
  }
  return { w, h, px };
}

const head = readHead();
const atlas = readGreyPng(readFileSync(join(ROOT, 'assets/zones-atlas.png')));
// buildLut in js/picking.js: the grey value over idScale (5), rounded.
const lut = Uint8Array.from(atlas.px, g => Math.round(g / 5));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vert = (arr, i, n) => Array.from({ length: n }, (_, k) => arr[i * n + k]);

// Per triangle, the corners and the two edges and normal three derives from
// them; computing them once keeps 174 rays over 16,534 triangles to about 50ms.
const tris = [];
for (let t = 0; t < head.idx.length; t += 3) {
  const corners = [head.idx[t], head.idx[t + 1], head.idx[t + 2]];
  const [a, b, c] = corners.map(i => vert(head.pos, i, 3));
  const e1 = sub(b, a), e2 = sub(c, a);
  tris.push({ corners, a, b, c, e1, e2, normal: cross(e1, e2) });
}

// three r160's Ray.intersectTriangle with backface culling on (FrontSide), the
// nearest hit as its Raycaster sorts them, then Triangle.getInterpolation for
// the UV, step for step, so a hit near a texel edge lands where the browser
// puts it.
function raycast(origin, direction) {
  const len = Math.hypot(...direction), d = direction.map(v => v / len);
  let best = null;
  for (const tri of tris) {
    const { a, e1, e2, normal } = tri;
    let DdN = dot(d, normal);
    if (!(DdN < 0)) continue; // a back face, or edge-on
    DdN = -DdN;
    const diff = sub(origin, a);
    const DdQxE2 = -dot(d, cross(diff, e2));
    if (DdQxE2 < 0) continue;
    const DdE1xQ = -dot(d, cross(e1, diff));
    if (DdE1xQ < 0 || DdQxE2 + DdE1xQ > DdN) continue;
    const QdN = dot(diff, normal);
    if (QdN < 0) continue;
    const s = QdN / DdN;
    const point = [origin[0] + d[0] * s, origin[1] + d[1] * s, origin[2] + d[2] * s];
    const gap = sub(point, origin), distance = Math.sqrt(dot(gap, gap));
    if (best && distance >= best.distance) continue; // a tie keeps the earlier face, as three's stable sort does
    best = { distance, point, tri };
  }
  if (!best) return null;
  const { point, tri: { a, b, c, corners } } = best;
  const v0 = sub(c, a), v1 = sub(b, a), v2 = sub(point, a);
  const d00 = dot(v0, v0), d01 = dot(v0, v1), d02 = dot(v0, v2), d11 = dot(v1, v1), d12 = dot(v1, v2);
  const inv = 1 / (d00 * d11 - d01 * d01);
  const bu = (d11 * d02 - d01 * d12) * inv, bv = (d00 * d12 - d01 * d02) * inv;
  const bary = [1 - bu - bv, bv, bu];
  const uv = { x: 0, y: 0 };
  corners.forEach((i, k) => { uv.x += head.uv[i * 2] * bary[k]; uv.y += head.uv[i * 2 + 1] * bary[k]; });
  return { point, uv };
}

// What the site names a tap fired from a raw origin along a direction.
function tap(rawOrigin, direction) {
  const hit = raycast(toBaked(rawOrigin), direction);
  return hit ? zoneAt(lut, baked.atlasSize, registry.zones, hit.uv, hit.point)?.id ?? null : null;
}

const L = (y, z) => [6, y, z], R = (y, z) => [2 * M - 6, y, z]; // from the patient's left, right
const FROM_L = [-1, 0, 0], FROM_R = [1, 0, 0], FROM_FRONT = [0, 0, -1], FROM_BACK = [0, 0, 1], FROM_TOP = [0, -1, 0];

// [where a patient points, ray origin (raw), direction, the names a clinician would accept]
const SITES = [
  ['vertex, top centre', [M, 6, -0.1], FROM_TOP, ['vertex-center']],
  ['crown off-centre L', [M + 0.9, 6, -0.2], FROM_TOP, ['vertex-left']],
  ['mid forehead', [M, 2.8, 6], FROM_FRONT, ['forehead-upper-center']],
  ['forehead L, above brow', [M + 0.6, 2.35, 6], FROM_FRONT, ['forehead-lower-left']],
  ['glabella', [M, 2.15, 6], FROM_FRONT, ['forehead-lower-center', 'sinus-ethmoid', 'sinus-frontal-left', 'sinus-frontal-right']],
  ['medial brow L (frontal sinus)', [M + 0.3, 2.2, 6], FROM_FRONT, ['sinus-frontal-left']],
  ['supraorbital notch L', [M + 0.45, 2.05, 6], FROM_FRONT, ['sinus-frontal-left', 'forehead-lower-left', 'behind-eye-left']],
  ['nasion (between the eyes)', [M, 1.85, 6], FROM_FRONT, ['sinus-ethmoid']],
  ['bridge where glasses sit', [M, 1.65, 6], FROM_FRONT, ['nose-bridge', 'sinus-ethmoid']],
  ['mid nasal bridge', [M, 1.4, 6], FROM_FRONT, ['nose-bridge']],
  ['nose tip', [M, 1.1, 6], FROM_FRONT, ['nose-bridge']],
  ['closed eye L', [M + 0.6, 1.72, 6], FROM_FRONT, ['behind-eye-left']],
  ['closed eye R', [M - 0.65, 1.68, 6], FROM_FRONT, ['behind-eye-right']],
  ['medial canthus L', [M + 0.3, 1.7, 6], FROM_FRONT, ['behind-eye-left', 'sinus-ethmoid']],
  ['under the eye L', [M + 0.5, 1.4, 6], FROM_FRONT, ['sinus-maxillary-left']],
  ['beside the nose L', [M + 0.4, 1.2, 6], FROM_FRONT, ['sinus-maxillary-left']],
  ['cheekbone L', [M + 1.0, 1.35, 6], FROM_FRONT, ['cheek-left', 'sinus-maxillary-left']],
  ['nostril wing (ala) L', [M + 0.3, 1.07, 6], FROM_FRONT, ['nose-bridge', 'sinus-maxillary-left']],
  ['nostril wing (ala) R', [M - 0.3, 1.07, 6], FROM_FRONT, ['nose-bridge', 'sinus-maxillary-right']],
  ['upper lip / upper gum L', [M + 0.3, 0.75, 6], FROM_FRONT, ['upper-teeth-left']],
  ['philtrum (midline)', [M, 0.7, 6], FROM_FRONT, ['upper-teeth-left', 'upper-teeth-right']],
  ['lower lip, midline', [M, 0.33, 6], FROM_FRONT, ['chin']],
  ['lower lip L', [M + 0.3, 0.3, 6], FROM_FRONT, ['chin']],
  ['lower lip R', [M - 0.3, 0.3, 6], FROM_FRONT, ['chin']],
  ['below mouth corner L (lower teeth)', [M + 0.55, 0.15, 6], FROM_FRONT, ['chin', 'cheek-left']],
  ['below mouth corner R (lower teeth)', [M - 0.55, 0.15, 6], FROM_FRONT, ['chin', 'cheek-right']],
  ['labiomental fold', [M, 0.12, 6], FROM_FRONT, ['chin']],
  ['point of chin', [M, -0.15, 6], FROM_FRONT, ['chin']],
  ['temple centre L', L(1.95, 1.15), FROM_L, ['temple-left']],
  ['temple centre R', R(1.95, 1.15), FROM_R, ['temple-right']],
  ['lateral orbital rim L', L(1.65, 1.6), FROM_L, ['behind-eye-left', 'temple-left']],
  ['in front of upper ear L (temporal artery)', L(1.7, 0.55), FROM_L, ['temple-left']],
  ['in front of upper ear R (temporal artery)', R(1.7, 0.55), FROM_R, ['temple-right']],
  ['just in front of tragus L (TMJ)', L(1.15, 0.6), FROM_L, ['tmj-left']],
  ['just in front of tragus R (TMJ)', R(1.15, 0.6), FROM_R, ['tmj-right']],
  ['tragus L', L(1.18, 0.36), FROM_L, ['ear-left', 'tmj-left']],
  ['ear canal opening L', L(1.18, 0.29), FROM_L, ['ear-left']],
  ['ear canal opening R', R(1.18, 0.29), FROM_R, ['ear-right']],
  ['concha L', L(1.3, 0.1), FROM_L, ['ear-left']],
  ['earlobe L', L(0.72, 0.33), FROM_L, ['ear-left']],
  ['earlobe R', R(0.72, 0.33), FROM_R, ['ear-right']],
  ['top of the ear (helix) L', L(1.84, 0.12), FROM_L, ['ear-left']],
  ['above the ear L', L(2.25, 0.1), FROM_L, ['parietal-left', 'temple-left']],
  ['masseter L', L(0.8, 1.0), FROM_L, ['tmj-left', 'cheek-left', 'jaw-angle-left']],
  ['angle of jaw L', L(0.3, 0.45), FROM_L, ['jaw-angle-left']],
  ['angle of jaw R', R(0.3, 0.45), FROM_R, ['jaw-angle-right']],
  ['mastoid process L', L(0.85, -0.4), FROM_L, ['mastoid-left']],
  ['behind ear at canal level L', L(1.2, -0.4), FROM_L, ['mastoid-left', 'ear-left']],
  ['side of neck below mastoid L', L(0.1, -0.3), FROM_L, ['neck-side-left']],
  ['upper side of neck below ear L', L(-0.2, 0.0), FROM_L, ['neck-side-left']],
  ['upper side of neck below ear R', R(-0.2, 0.0), FROM_R, ['neck-side-right']],
  ['side of neck, a third down L', L(-0.5, -0.1), FROM_L, ['neck-side-left']],
  ['mid side of neck L', L(-0.9, 0.0), FROM_L, ['neck-side-left']],
  ['back of head upper, midline', [M, 2.6, -6], FROM_BACK, ['occipital-upper-center']],
  ['back of head, inion level, midline', [M, 1.5, -6], FROM_BACK, ['occipital-lower-center']],
  ['greater occipital nerve point L', [M + 0.45, 1.15, -6], FROM_BACK, ['occipital-lower-left', 'suboccipital-left']],
  ['skull base hollow, midline', [M, 0.75, -6], FROM_BACK, ['suboccipital-left', 'suboccipital-right', 'neck-back-upper']],
  ['skull base L', [M + 0.6, 0.7, -6], FROM_BACK, ['suboccipital-left']],
  ['skull base R', [M - 0.6, 0.7, -6], FROM_BACK, ['suboccipital-right']],
  ['upper back of neck, midline', [M, 0.2, -6], FROM_BACK, ['neck-back-upper']],
  ['middle back of neck, midline', [M, -0.9, -6], FROM_BACK, ['neck-back-mid', 'neck-back-upper']],
  ['base of neck, midline', [M, -1.9, -6], FROM_BACK, ['neck-back-lower']],
  ['side of head above ear, back L', L(2.5, -0.4), FROM_L, ['parietal-left']],
  ['upper trapezius L', [M + 1.6, 6, -0.7], FROM_TOP, ['trap-left']],
];

test('the atlas decodes to whole zone ids, each one a zone the bake carries', () => {
  assert.equal(atlas.w, baked.atlasSize);
  assert.equal(atlas.h, baked.atlasSize);
  const strays = new Set();
  for (const g of atlas.px) if (g % 5 || g / 5 > registry.zones.length) strays.add(g);
  assert.deepEqual([...strays], [], 'grey values that are no zone id: the decoder misread a filter, or the bake changed');
  // A misread row shifts ids rather than inventing them, so also check that
  // every zone owns texels: a decoder that dropped one would lose it here.
  const owners = new Set(lut);
  const missing = registry.zones.filter(z => !owners.has(z.index)).map(z => z.id);
  assert.deepEqual(missing, [], 'zones with no texel in the atlas cannot be tapped at all');
});

test('each of the 64 places a patient points to gets a name a clinician would use there', () => {
  assert.equal(SITES.length, 64);
  const wrong = [];
  for (const [where, origin, direction, accepted] of SITES) {
    const named = tap(origin, direction);
    if (!accepted.includes(named)) wrong.push(`${where}: named ${named}, want ${accepted.join(' or ')}`);
  }
  assert.deepEqual(wrong, []);
});

test('below the mouth reads upper teeth only at the corners of the mouth', () => {
  // 17 columns a tenth apart across the lower lip and chin, at four heights.
  // The corners are where the upper lip turns down past the lower one, so a tap
  // there can fairly be the upper gum; nowhere else below the mouth can.
  const corners = new Set(['-0.7,0.38', '-0.7,0.30', '-0.6,0.38', '+0.5,0.38', '+0.6,0.38']);
  const reads = [];
  for (let i = 0; i <= 16; i++) {
    const dx = -0.8 + i * 0.1;
    for (const y of [0.38, 0.3, 0.2, 0.1]) {
      const named = tap([M + dx, y, 6], FROM_FRONT);
      const at = `${dx < -1e-9 ? '-' : '+'}${Math.abs(dx).toFixed(1)},${y.toFixed(2)}`;
      if (named?.startsWith('upper-teeth') && !corners.has(at)) reads.push(`${at} reads ${named}`);
    }
  }
  assert.deepEqual(reads, []);
});

test('the upper side of the neck reads as the side of the neck, on its own side', () => {
  const off = [];
  for (const [side, at, from] of [['left', L, FROM_L], ['right', R, FROM_R]]) {
    for (const y of [0.1, -0.2, -0.5]) {
      for (const z of [-0.4, -0.2, 0.0]) {
        const named = tap(at(y, z), from);
        if (named !== `neck-side-${side}`) off.push(`${side} y=${y} z=${z} reads ${named}`);
      }
    }
  }
  assert.deepEqual(off, []);
});

test('the strip in front of the upper ear is never the jaw joint', () => {
  // The temporal artery runs here, which is temple pain. The jaw joint sits a
  // finger's width lower, in front of the tragus.
  const joint = [];
  for (const [side, at, from] of [['left', L, FROM_L], ['right', R, FROM_R]]) {
    for (const y of [1.5, 1.6, 1.7, 1.8]) {
      for (const z of [0.55, 0.65, 0.75]) {
        const named = tap(at(y, z), from);
        if (named?.startsWith('tmj')) joint.push(`${side} y=${y} z=${z} reads ${named}`);
      }
    }
  }
  assert.deepEqual(joint, []);
});
