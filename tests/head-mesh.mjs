// The head a tap lands on and the atlas it reads, decoded in Node the way the
// browser does it, plus three r160's raycast. Shared by tests/zones-taps (what a
// tap names) and tests/migrate (where a migrated point sits), so both ask the
// same mesh the same way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from './fixtures.mjs';

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

export const head = readHead();
export const atlas = readGreyPng(readFileSync(join(ROOT, 'assets/zones-atlas.png')));
// buildLut in js/picking.js: the grey value over idScale (5), rounded.
export const lut = Uint8Array.from(atlas.px, g => Math.round(g / 5));

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
export function raycast(origin, direction) {
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
