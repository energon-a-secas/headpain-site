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
const SELECTION_COLOR = new THREE.Color(0x10b981);
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
    this.items = []; // ordered view of the cache, for update() and clear()
    // Marker bodies, keyed by everything that decides their geometry. A
    // DecalGeometry clips the whole head mesh per decal, which measured about
    // 2ms each: rebuilding all of them on every selection cost 484ms at 60
    // points, so a click felt like half a second of nothing happening. Nothing
    // about selecting, hovering or isolating changes geometry, only colour and
    // opacity, so a body survives all three.
    this.bodies = new Map();
    this.selection = null; // { mesh, disposables } — one decal, rebuilt on its own
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
    for (const item of this.bodies.values()) this.disposeBody(item);
    this.bodies.clear();
    this.clearSelection();
    this.items = [];
    this.decalMats = [];
  }

  disposeBody(item) {
    this.group.remove(item.root);
    item.disposables.forEach(d => d.dispose());
  }

  clearSelection() {
    if (!this.selection) return;
    this.group.remove(this.selection.mesh);
    this.selection.disposables.forEach(d => d.dispose());
    this.selection = null;
  }

  addDecal(marker, texture, color, size, opacity, role = 'core', collect = null) {
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
    (collect || this.decalMats).push({ mat, base: opacity, role });
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

  // Everything that decides a body's geometry. Anything NOT in here must be
  // adjustable by repaint() alone, or a stale body will be reused: that is the
  // one way this cache can go wrong, so add to the key rather than to repaint
  // when you are unsure.
  static bodyKey(marker, style) {
    return [
      marker.id,
      marker.p.join(','), marker.n.join(','),
      marker.spread, marker.depth, marker.quality,
      style.pattern,
    ].join('|');
  }

  sync(markers, selectedId, groupStyle = {}, isolateGroupId = null) {
    const capped = markers.slice(0, MAX_MARKERS);
    const live = new Map();

    for (const marker of capped) {
      const style = groupStyle[marker.groupId] || DEFAULT_STYLE;
      const key = MarkerLayer.bodyKey(marker, style);
      const body = this.bodies.get(key) || this.buildBody(marker, style);
      this.repaint(body, marker, style, isolateGroupId);
      live.set(key, body);
    }

    for (const [key, body] of this.bodies) {
      if (live.get(key) !== body) this.disposeBody(body);
    }
    this.bodies = live;
    this.items = [...live.values()];
    this.decalMats = this.items.flatMap(i => i.decalMats);

    this.syncSelection(capped, selectedId);
  }

  // The geometry, built once. Colours here are placeholders: repaint() sets the
  // real ones on this same call, and on every later one.
  buildBody(marker, style) {
    const root = new THREE.Group();
    const disposables = [];
    const decalMats = [];
    const white = new THREE.Color(0xffffff);
    const spreadRadius = spreadById(marker.spread).radius;
    const coreSize = Math.max(0.16, spreadRadius * 0.7);
    const haloSize = spreadRadius * 1.6;

    const halo = this.addDecal(marker, this.tex.halo, white, haloSize, 1, 'halo', decalMats);
    root.add(halo.mesh); disposables.push(...halo.disposables);

    // core: the pain's own glyph, with a jagged rim for stabbing qualities
    const coreTex = this.glyph(style.pattern, SPIKY_QUALITIES.has(marker.quality));
    const core = this.addDecal(marker, coreTex, white, coreSize, 1, 'core', decalMats);
    root.add(core.mesh); disposables.push(...core.disposables);

    let ring = null;
    if (marker.depth === 'muscle') {
      ring = this.addDecal(marker, this.tex.ring, white, coreSize * 1.5, 1, 'ring', decalMats);
      root.add(ring.mesh); disposables.push(...ring.disposables);
    }

    let column = null;
    if (marker.quality === 'ice-pick') {
      // The nail: a long spike driven into the skull, the star of x-ray view.
      column = this.addColumn(marker, white, 1.15, 1, this.spikeGeom);
    } else if (marker.depth === 'deep-pressure') {
      column = this.addColumn(marker, white, 0.35, 1);
    } else if (marker.depth === 'inside-head') {
      column = this.addColumn(marker, white, 0.5, 1);
    }
    if (column) { root.add(column.mesh); disposables.push(...column.disposables); }

    const pulses = marker.depth === 'inside-head' || marker.quality === 'throbbing';

    this.group.add(root);
    return {
      root, disposables, decalMats,
      coreSize,
      haloMat: halo.mesh.material,
      coreMat: core.mesh.material,
      ringMat: ring?.mesh.material || null,
      columnMat: column?.mesh.material || null,
      pulseMat: pulses ? core.mesh.material : null,
      phase: (marker.p[0] * 7 + marker.p[1] * 13) % (Math.PI * 2),
      dim: 1,
    };
  }

  // Colour, intensity and isolation, none of which touch geometry.
  repaint(body, marker, style, isolateGroupId) {
    const color = new THREE.Color(paint(style.color, marker.intensity));
    const dim = isolateGroupId && marker.groupId !== isolateGroupId ? DIM_FACTOR : 1;
    body.dim = dim;

    const set = (rec, mat, base) => {
      if (!mat) return;
      mat.color.copy(color);
      rec.base = base;
      mat.opacity = this.xray ? base * (XRAY_FADE[rec.role] ?? 1) : base;
    };
    const rec = role => body.decalMats.find(d => d.role === role);

    set(rec('halo'), body.haloMat, (0.3 + marker.intensity * 0.04) * dim);
    set(rec('core'), body.coreMat, (0.45 + marker.intensity * 0.05) * dim);
    if (body.ringMat) set(rec('ring'), body.ringMat, 0.5 * dim);
    if (body.columnMat) {
      body.columnMat.color.copy(color);
      body.columnMat.opacity = (marker.quality === 'ice-pick' ? 0.9 : marker.depth === 'deep-pressure' ? 0.8 : 0.85) * dim;
    }
  }

  // One decal, and only this one is rebuilt when the selection moves.
  syncSelection(markers, selectedId) {
    const marker = markers.find(m => m.id === selectedId) || null;
    // Rebuilt only when the selection actually moves, and it is one decal
    // rather than all of them.
    if (this.selectedId === selectedId && (!!this.selection === !!marker)) {
      if (this.selection) this.decalMats.push(this.selection.rec);
      return;
    }
    this.clearSelection();
    this.selectedId = selectedId;
    if (!marker) return;
    const coreSize = Math.max(0.16, spreadById(marker.spread).radius * 0.7);
    const mats = [];
    const sel = this.addDecal(marker, this.tex.ring, SELECTION_COLOR, coreSize * 1.9, 0.95, 'sel', mats);
    this.group.add(sel.mesh);
    this.selection = { mesh: sel.mesh, disposables: sel.disposables, rec: mats[0] };
    this.decalMats.push(mats[0]);
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
