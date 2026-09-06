// Pain markers — DecalGeometry core+halo that hug the head surface, plus depth
// encodings (ring for muscle, inward column for deep, pulsing core for inside)
// and a long nail-spike for ice-pick stabs that reads best in x-ray view.
// The head mesh sits at the origin with identity transform, so head-local == world.
//
// Three visual channels, three meanings, no overlap:
//   identity  → the pain's hue *and* its pattern glyph (patterns.js)
//   intensity → saturation (paint()) plus decal size and opacity
//   depth     → the sub-surface geometry: ring, column, nail-spike
// Quality adds a jagged rim on top of whichever glyph the pain owns, so a
// stabbing point in the sky pain still reads as the sky pain.

import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { drawPattern } from './patterns.js';
import { paint, GROUP_COLORS } from './groups.js';
import { spreadById } from './zones.js';

const MAX_MARKERS = 60;
const DIM_FACTOR = 0.22; // opacity multiplier for markers outside the focused group

function gradientCanvas(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  return tex;
}

function haloTexture() {
  return gradientCanvas(ctx => {
    const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

function ringTexture() {
  return gradientCanvas(ctx => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 14;
    ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, Math.PI * 2);
    ctx.stroke();
  });
}

const SPIKY_QUALITIES = new Set(['electric', 'stabbing', 'ice-pick', 'sharp']);
const DEFAULT_STYLE = { color: GROUP_COLORS[0], pattern: 'solid' };
const XRAY_FADE = { halo: 0.2, ring: 0.2, core: 0.5, sel: 0.4 };
const _zAxis = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class MarkerLayer {
  constructor(headMesh, parent) {
    this.headMesh = headMesh;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.tex = { halo: haloTexture(), ring: ringTexture() };
    // Pattern textures are white glyphs tinted per marker, so eight shapes plus
    // their spiked variants are the whole cache no matter how many pains exist.
    this.patternTex = new Map();
    this.columnGeom = new THREE.CylinderGeometry(0.045, 0.045, 1, 12, 1, true);
    this.columnGeom.translate(0, -0.5, 0); // origin at skin, extends down -y before orientation
    // Nail-spike for ice-pick: wide at the skin, tip driven deep inside.
    this.spikeGeom = new THREE.ConeGeometry(0.06, 1, 12, 1, true);
    this.spikeGeom.rotateX(Math.PI);      // apex now points -y
    this.spikeGeom.translate(0, -0.5, 0); // base at origin (skin), tip extends inward
    this.items = []; // { root, disposables, pulseMat, phase, dim }
    this.decalMats = []; // { mat, base, role } — faded in x-ray so deep columns read clearly
    this.xray = false;
  }

  // Lazily built and cached: at most 16 textures for the life of the layer.
  glyph(patternId, spiky) {
    const key = `${patternId}${spiky ? '+s' : ''}`;
    let tex = this.patternTex.get(key);
    if (!tex) {
      tex = gradientCanvas(ctx => drawPattern(ctx, patternId, spiky));
      this.patternTex.set(key, tex);
    }
    return tex;
  }

  clear() {
    for (const item of this.items) {
      this.group.remove(item.root);
      item.disposables.forEach(d => d.dispose());
    }
    this.items = [];
    this.decalMats = [];
  }

  addDecal(marker, texture, color, size, opacity, role = 'core') {
    const p = new THREE.Vector3(...marker.p);
    const n = new THREE.Vector3(...marker.n);
    _q.setFromUnitVectors(_zAxis, n);
    _e.setFromQuaternion(_q);
    const geom = new DecalGeometry(this.headMesh, p, _e.clone(), new THREE.Vector3(size, size, size));
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: this.xray ? opacity * (XRAY_FADE[role] ?? 1) : opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    this.decalMats.push({ mat, base: opacity, role });
    const mesh = new THREE.Mesh(geom, mat);
    return { mesh, disposables: [geom, mat] };
  }

  // X-ray: quiet the surface decals so interior columns become the focus.
  setXray(on) {
    this.xray = !!on;
    for (const d of this.decalMats) {
      d.mat.opacity = this.xray ? d.base * (XRAY_FADE[d.role] ?? 1) : d.base;
    }
  }

  addColumn(marker, color, length, opacity, geom = this.columnGeom) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const mesh = new THREE.Mesh(geom, mat);
    const p = new THREE.Vector3(...marker.p);
    const n = new THREE.Vector3(...marker.n);
    mesh.position.copy(p);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), n.clone().negate());
    mesh.scale.set(1, length, 1);
    return { mesh, disposables: [mat] };
  }

  sync(markers, selectedId, groupStyle = {}, isolateGroupId = null) {
    this.clear();
    const capped = markers.slice(0, MAX_MARKERS);
    for (const marker of capped) {
      const root = new THREE.Group();
      const disposables = [];
      const style = groupStyle[marker.groupId] || DEFAULT_STYLE;
      const color = new THREE.Color(paint(style.color, marker.intensity));
      const dim = isolateGroupId && marker.groupId !== isolateGroupId ? DIM_FACTOR : 1;
      const spreadRadius = spreadById(marker.spread).radius;
      const coreSize = Math.max(0.16, spreadRadius * 0.7);
      const haloSize = spreadRadius * 1.6;
      const baseOpacity = (0.45 + marker.intensity * 0.05) * dim;

      // halo (all markers)
      const halo = this.addDecal(marker, this.tex.halo, color, haloSize, (0.3 + marker.intensity * 0.04) * dim, 'halo');
      root.add(halo.mesh); disposables.push(...halo.disposables);

      // core: the pain's own glyph, with a jagged rim for stabbing qualities
      const coreTex = this.glyph(style.pattern, SPIKY_QUALITIES.has(marker.quality));
      const core = this.addDecal(marker, coreTex, color, coreSize, baseOpacity);
      root.add(core.mesh); disposables.push(...core.disposables);

      let pulseMat = null;
      if (marker.depth === 'muscle') {
        const ring = this.addDecal(marker, this.tex.ring, color, coreSize * 1.5, 0.5 * dim, 'ring');
        root.add(ring.mesh); disposables.push(...ring.disposables);
      }
      if (marker.quality === 'ice-pick') {
        // The nail: a long spike driven into the skull, the star of x-ray view.
        const spike = this.addColumn(marker, color, 1.15, 0.9 * dim, this.spikeGeom);
        root.add(spike.mesh); disposables.push(...spike.disposables);
      } else if (marker.depth === 'deep-pressure') {
        const col = this.addColumn(marker, color, 0.35, 0.8 * dim);
        root.add(col.mesh); disposables.push(...col.disposables);
      } else if (marker.depth === 'inside-head') {
        const col = this.addColumn(marker, color, 0.5, 0.85 * dim);
        root.add(col.mesh); disposables.push(...col.disposables);
        pulseMat = core.mesh.material;
      }
      if (marker.quality === 'throbbing') pulseMat = core.mesh.material;

      // selection ring
      if (marker.id === selectedId) {
        const sel = this.addDecal(marker, this.tex.ring, new THREE.Color(0x10b981), coreSize * 1.9, 0.95, 'sel');
        root.add(sel.mesh); disposables.push(...sel.disposables);
      }

      this.group.add(root);
      this.items.push({ root, disposables, pulseMat, phase: (marker.p[0] * 7 + marker.p[1] * 13) % (Math.PI * 2), dim });
    }
  }

  // Returns true while any marker is animating (keeps render-on-demand alive).
  update(t) {
    let animating = false;
    const fade = this.xray ? (XRAY_FADE.core ?? 1) : 1;
    for (const item of this.items) {
      if (!item.pulseMat) continue;
      animating = true;
      item.pulseMat.opacity = (0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3 + item.phase))) * fade * item.dim;
    }
    return animating;
  }

  dispose() {
    this.clear();
    this.columnGeom.dispose();
    this.spikeGeom.dispose();
    Object.values(this.tex).forEach(t => t.dispose());
    this.patternTex.forEach(t => t.dispose());
    this.patternTex.clear();
  }
}
