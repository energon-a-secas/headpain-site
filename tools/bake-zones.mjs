#!/usr/bin/env node
// HeadMap zone baker — one-time offline tool (plain Node, zero deps).
//
//   node tools/bake-zones.mjs probe   → print mesh landmark/profile stats
//   node tools/bake-zones.mjs bake    → write assets/head-cropped.glb,
//                                        assets/zones-atlas.png,
//                                        assets/zones.baked.json
//
// Pipeline (bake):
//   1. parse assets/head-leeperrysmith.glb (glTF 2.0 binary)
//   2. drop Camera/Lamp nodes, crop triangles below CROP_Y (shoulder flare)
//   3. snap authored zone hints (raw coords, from js/zones.js) onto kept verts
//   4. normalize: recentre + scale so crown = +1 / chin = -1
//   5. rasterize a 1024² zone-ID atlas through the mesh's UV unwrap
//   6. write outputs + coverage report

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ZONES, VIRTUAL_ZONES } from '../js/zones.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_GLB = join(ROOT, 'assets/head-leeperrysmith.glb');
const OUT_GLB = join(ROOT, 'assets/head-cropped.glb');
const OUT_PNG = join(ROOT, 'assets/zones-atlas.png');
const OUT_JSON = join(ROOT, 'assets/zones.baked.json');

const CROP_Y = -2.2;        // raw coords: below neck-back/SCM, above shoulder flare
const ATLAS = 1024;

// ---------------------------------------------------------------------------
// Small vec3 helpers (arrays)
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------------------
// GLB parsing
// ---------------------------------------------------------------------------
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen;
  const binLen = dv.getUint32(off, true);
  const bin = buf.subarray(off + 8, off + 8 + binLen);
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const T = COMP[acc.componentType];
  const n = NCOMP[acc.type];
  const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new T(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    for (let c = 0; c < n; c++) out[i * n + c] = T === Float32Array
      ? new DataView(bin.buffer, bin.byteOffset + o + c * 4).getFloat32(0, true)
      : new T(bin.buffer, bin.byteOffset, bin.byteLength / T.BYTES_PER_ELEMENT)[(o / T.BYTES_PER_ELEMENT) + c];
  }
  return { data: out, count: acc.count, n, componentType: acc.componentType };
}

function loadMesh() {
  const { json, bin } = parseGlb(readFileSync(SRC_GLB));
  const prim = json.meshes.find(m => m.name === 'LeePerrySmith' || true).primitives[0];
  const pos = readAccessor(json, bin, prim.attributes.POSITION);
  const nrm = readAccessor(json, bin, prim.attributes.NORMAL);
  const uv = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
  const idx = readAccessor(json, bin, prim.indices);
  return { json, bin, pos: pos.data, nrm: nrm.data, uv: uv.data, idx: idx.data, prim };
}

// ---------------------------------------------------------------------------
// probe mode — landmark report for authoring zone hints in raw coords
// ---------------------------------------------------------------------------
function probe() {
  const { pos, idx } = loadMesh();
  const nv = pos.length / 3;
  console.log(`verts ${nv}  tris ${idx.length / 3}`);
  let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) {
    for (let c = 0; c < 3; c++) {
      bb[c] = Math.min(bb[c], pos[i * 3 + c]);
      bb[3 + c] = Math.max(bb[3 + c], pos[i * 3 + c]);
    }
  }
  console.log(`bbox x [${bb[0].toFixed(2)}, ${bb[3].toFixed(2)}]  y [${bb[1].toFixed(2)}, ${bb[4].toFixed(2)}]  z [${bb[2].toFixed(2)}, ${bb[5].toFixed(2)}]`);

  console.log('\ny-band  count  maxR   avgR   frontZ(x@)    backZ   sideX');
  for (let y0 = Math.floor(bb[1] * 2) / 2; y0 < bb[4]; y0 += 0.25) {
    let count = 0, maxR = 0, sumR = 0, fz = -1e9, fzx = 0, bz = 1e9, sx = 0;
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (y < y0 || y >= y0 + 0.25) continue;
      count++;
      const r = Math.hypot(x, z);
      maxR = Math.max(maxR, r); sumR += r;
      if (z > fz) { fz = z; fzx = x; }
      bz = Math.min(bz, z);
      sx = Math.max(sx, Math.abs(x));
    }
    if (!count) continue;
    console.log(`${y0.toFixed(2).padStart(6)} ${String(count).padStart(6)} ${maxR.toFixed(2)}  ${(sumR / count).toFixed(2)}   ${fz.toFixed(2)} (${fzx.toFixed(2)})  ${bz.toFixed(2)}  ${sx.toFixed(2)}`);
  }

  const pick = (label, pred, score) => {
    let best = null, bs = -1e9;
    for (let i = 0; i < nv; i++) {
      const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      if (!pred(p)) continue;
      const s = score(p);
      if (s > bs) { bs = s; best = p; }
    }
    console.log(`${label.padStart(14)} [${best.map(v => v.toFixed(2)).join(', ')}]`);
  };
  console.log('\nlandmarks:');
  pick('nose tip', p => Math.abs(p[0]) < 0.4 && p[1] > -0.6 && p[1] < 0.9, p => p[2]);
  pick('brow', p => Math.abs(p[0]) < 0.6 && p[1] > 0.8 && p[1] < 1.6, p => p[2]);
  pick('crown', () => true, p => p[1]);
  pick('chin', p => p[2] > 0.5 && Math.abs(p[0]) < 0.6, p => -p[1]);
  pick('ear L (+x)', p => p[1] > -0.4 && p[1] < 0.9 && p[2] > -0.6 && p[2] < 0.6, p => p[0]);
  pick('ear R (-x)', p => p[1] > -0.4 && p[1] < 0.9 && p[2] > -0.6 && p[2] < 0.6, p => -p[0]);
  pick('back skull', p => p[1] > 0.5 && p[1] < 1.8, p => -p[2]);
  pick('lips', p => Math.abs(p[0]) < 0.35 && p[1] > -0.7 && p[1] < -0.1, p => p[2]);
}

// ---------------------------------------------------------------------------
// PNG writer (8-bit grayscale)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function writePng(path, w, h, gray) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    Buffer.from(gray.buffer, gray.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]));
}

// ---------------------------------------------------------------------------
// bake mode
// ---------------------------------------------------------------------------
function bake() {
  const { json, pos, nrm, uv, idx, prim } = loadMesh();
  const nv = pos.length / 3;

  // 1. crop: keep triangles whose centroid is above CROP_Y
  const keptTris = [];
  const usedVert = new Uint8Array(nv);
  for (let t = 0; t < idx.length; t += 3) {
    const cy = (pos[idx[t] * 3 + 1] + pos[idx[t + 1] * 3 + 1] + pos[idx[t + 2] * 3 + 1]) / 3;
    if (cy >= CROP_Y) {
      keptTris.push(idx[t], idx[t + 1], idx[t + 2]);
      usedVert[idx[t]] = usedVert[idx[t + 1]] = usedVert[idx[t + 2]] = 1;
    }
  }
  console.log(`crop @ y=${CROP_Y}: ${idx.length / 3} → ${keptTris.length / 3} tris`);

  // 2. snap authored hints onto kept verts (raw space), build final zone list
  //    (+x = patient left; mirror twins get x negated)
  const zones = [];
  for (const z of ZONES) {
    const variants = z.mirror
      ? [{ suffix: 'left', sx: 1 }, { suffix: 'right', sx: -1 }]
      : [{ suffix: null, sx: 1 }];
    for (const v of variants) {
      const hint = [z.hint[0] * v.sx, z.hint[1], z.hint[2]];
      let best = -1, bd = Infinity;
      for (let i = 0; i < nv; i++) {
        if (!usedVert[i]) continue;
        const d = (pos[i * 3] - hint[0]) ** 2 + (pos[i * 3 + 1] - hint[1]) ** 2 + (pos[i * 3 + 2] - hint[2]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) throw new Error(`no kept vertex near hint for ${z.id}`);
      const anchor = [pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]];
      const n = norm([nrm[best * 3], nrm[best * 3 + 1], nrm[best * 3 + 2]]);
      const tHint = norm([z.tangent[0] * v.sx, z.tangent[1], z.tangent[2]]);
      let u = sub(tHint, n.map(c => c * dot(tHint, n)));
      u = len(u) < 1e-4 ? norm(cross(n, [0, 1, 0])) : norm(u);
      const w = norm(cross(n, u));
      zones.push({
        id: v.suffix ? `${z.id}-${v.suffix}` : z.id,
        baseId: z.id,
        label: v.suffix ? `${z.label} (${v.suffix === 'left' ? 'L' : 'R'})` : z.label,
        group: z.group,
        side: v.suffix || z.side || 'center',
        anchor, normal: n, u, v: w,
        ru: z.extents[0], rv: z.extents[1],
        priority: z.priority || 0,
        snapDist: Math.sqrt(bd)
      });
    }
  }

  // 3. normalize: crown → +1, chin → −1 (chin = lowest vert on the face front)
  let crown = -1e9, chin = 1e9, cx = 0, cn = 0, zMin = 1e9, zMax = -1e9;
  for (let i = 0; i < nv; i++) {
    if (!usedVert[i]) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    crown = Math.max(crown, y);
    if (z > 1.3) chin = Math.min(chin, y); // face front only — chest cut stays below z≈1.05
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    cx += x; cn++;
  }
  cx /= cn;                    // mean x tracks the facial midline (x≈-0.1)
  const cz = (zMin + zMax) / 2; // bbox mid z tracks the skull's rotational axis
  const scale = 2 / (crown - chin);
  const cy = (crown + chin) / 2;
  const xf = p => [(p[0] - cx) * scale, (p[1] - cy) * scale, (p[2] - cz) * scale];

  const npos = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const p = xf([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    npos[i * 3] = p[0]; npos[i * 3 + 1] = p[1]; npos[i * 3 + 2] = p[2];
  }
  for (const z of zones) {
    z.anchor = xf(z.anchor);
    z.ru *= scale; z.rv *= scale;
    delete z.snapDist;
  }
  console.log(`normalize: crown ${crown.toFixed(2)} chin ${chin.toFixed(2)} scale ${scale.toFixed(3)} centre [${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}]`);

  // 4. rasterize zone atlas
  const idTex = new Uint8Array(ATLAS * ATLAS);
  let covered = 0, conflicts = 0;
  const zoneTexels = new Array(zones.length).fill(0);
  const IdxT = idx.constructor;
  const kept = new IdxT(keptTris);
  for (let t = 0; t < kept.length; t += 3) {
    const i0 = kept[t], i1 = kept[t + 1], i2 = kept[t + 2];
    const u0 = uv[i0 * 2] * ATLAS, v0 = uv[i0 * 2 + 1] * ATLAS;
    const u1 = uv[i1 * 2] * ATLAS, v1 = uv[i1 * 2 + 1] * ATLAS;
    const u2 = uv[i2 * 2] * ATLAS, v2 = uv[i2 * 2 + 1] * ATLAS;
    const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)));
    const maxX = Math.min(ATLAS - 1, Math.ceil(Math.max(u0, u1, u2)));
    const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)));
    const maxY = Math.min(ATLAS - 1, Math.ceil(Math.max(v0, v1, v2)));
    const d = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
    if (Math.abs(d) < 1e-9) continue;
    const P0 = [npos[i0 * 3], npos[i0 * 3 + 1], npos[i0 * 3 + 2]];
    const P1 = [npos[i1 * 3], npos[i1 * 3 + 1], npos[i1 * 3 + 2]];
    const P2 = [npos[i2 * 3], npos[i2 * 3 + 1], npos[i2 * 3 + 2]];
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const tx = px + 0.5, ty = py + 0.5;
        const w0 = ((v1 - v2) * (tx - u2) + (u2 - u1) * (ty - v2)) / d;
        const w1 = ((v2 - v0) * (tx - u2) + (u0 - u2) * (ty - v2)) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const P = [
          w0 * P0[0] + w1 * P1[0] + w2 * P2[0],
          w0 * P0[1] + w1 * P1[1] + w2 * P2[1],
          w0 * P0[2] + w1 * P1[2] + w2 * P2[2]
        ];
        let best = -1, bs = 1.0;
        for (let zi = 0; zi < zones.length; zi++) {
          const z = zones[zi];
          const dd = sub(P, z.anchor);
          if (Math.abs(dot(dd, z.normal)) > 0.20) continue;
          const du = dot(dd, z.u) / z.ru, dv = dot(dd, z.v) / z.rv;
          const s = du * du + dv * dv - z.priority * 0.05;
          if (s < bs) { bs = s; best = zi; }
        }
        const o = py * ATLAS + px;
        if (best >= 0) {
          if (idTex[o] !== 0 && idTex[o] !== best + 1) conflicts++;
          idTex[o] = best + 1;
        } else if (idTex[o] === 0) {
          covered++; // mesh texel with no zone claim (gap)
        }
      }
    }
  }
  for (let i = 0; i < idTex.length; i++) if (idTex[i] > 0) zoneTexels[idTex[i] - 1]++;

  // 5. coverage report
  console.log('\nzone coverage (texels):');
  let fail = 0;
  for (let i = 0; i < zones.length; i++) {
    const flag = zoneTexels[i] < 100 ? '  ← LOW' : '';
    if (zoneTexels[i] < 100) fail++;
    console.log(`  ${zones[i].id.padEnd(26)} ${String(zoneTexels[i]).padStart(7)}${flag}`);
  }
  console.log(`\nunclaimed mesh texels (first-visit gaps): ${covered}, uv conflicts: ${conflicts}, low-coverage zones: ${fail}`);

  // 6. write GLB (single node, repacked buffers)
  const outIdx = kept;
  const binParts = [Buffer.from(npos.buffer), Buffer.from(nrm.buffer, 0, nrm.byteLength), Buffer.from(uv.buffer, 0, uv.byteLength), Buffer.from(outIdx.buffer, 0, outIdx.byteLength)];
  const offsets = [];
  let total = 0;
  for (const b of binParts) { offsets.push(total); total += b.length; total = (total + 3) & ~3; }
  const binBuf = Buffer.alloc(total);
  let off = 0;
  for (const b of binParts) { b.copy(binBuf, off); off += b.length; off = (off + 3) & ~3; }

  const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let c = 0; c < 3; c++) {
    mins[c] = Math.min(mins[c], npos[i * 3 + c]);
    maxs[c] = Math.max(maxs[c], npos[i * 3 + c]);
  }
  const idxComp = outIdx.constructor === Uint16Array ? 5123 : 5125;
  const gltf = {
    asset: { version: '2.0', generator: 'headmap bake-zones.mjs (adapted from Lee Perry-Smith Infinite 3D Head Scan, CC-BY 3.0)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'LeePerrySmith' }],
    meshes: [{ name: 'LeePerrySmith', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: json.materials || [{ pbrMetallicRoughness: { baseColorFactor: [0.87, 0.72, 0.6, 1], metallicFactor: 0 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: mins, max: maxs },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' },
      { bufferView: 3, componentType: idxComp, count: outIdx.length, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: npos.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: nrm.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: uv.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: outIdx.byteLength }
    ],
    buffers: [{ byteLength: binBuf.length }]
  };
  let jsonStr = JSON.stringify(gltf);
  while (jsonStr.length % 4) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const glb = Buffer.alloc(12 + 8 + jsonBuf.length + 8 + binBuf.length);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonBuf.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); jsonBuf.copy(glb, 20);
  const binOff = 20 + jsonBuf.length;
  glb.writeUInt32LE(binBuf.length, binOff); glb.writeUInt32LE(0x004e4942, binOff + 4); binBuf.copy(glb, binOff + 8);
  writeFileSync(OUT_GLB, glb);

  // 7. write atlas + baked zones
  writePng(OUT_PNG, ATLAS, ATLAS, idTex.map(v => v * 5)); // scale ids into visible range (max ~51*5=255)
  writeFileSync(OUT_JSON, JSON.stringify({
    generated: 'bake-zones.mjs',
    atlasSize: ATLAS,
    idScale: 5,
    zones: zones.map((z, i) => ({ ...z, texels: zoneTexels[i], index: i + 1 })),
    virtualZones: VIRTUAL_ZONES
  }, null, 2));
  console.log(`\nwrote ${OUT_GLB} (${glb.length} B), ${OUT_PNG}, ${OUT_JSON}`);
}

const mode = process.argv[2] || 'bake';
if (mode === 'probe') probe();
else bake();
