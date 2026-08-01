// 3D core — renderer, camera, lights, head model, zone picking, marker layer.
// Render-on-demand: frames are drawn only when something changed or a marker
// is pulsing, keeping the tool idle-cheap on laptops.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildLut, pickZone } from './picking.js';
import { createZoneShader } from './zoneshader.js';
import { MarkerLayer } from './markers.js';
import { intensityRGB } from './utils.js';
import { hexToRgb } from './groups.js';

const CAM_TARGET = new THREE.Vector3(0, -0.55, 0);
const DEFAULT_CAMERA = { theta: 0, phi: Math.PI / 2, dist: 4.9 };
const SKIN_COLOR = 0xd9ac8c;
const HOVER_TINT = [0.07, 0.72, 0.51];
const SELECT_TINT = [0.10, 0.86, 0.61];
const FOCUS_DIM = 0.25; // zone-tint strength multiplier outside the focused group

function unsupportedStub(reason) {
  return {
    supported: false,
    reason,
    ready: Promise.resolve(),
    sync() {}, setXray() {}, resetView() {}, setCamera() {}, resize() {},
    getCanvas: () => null, snapshot: () => null, dispose() {},
    onPick: null, onHoverZone: null, onCameraChange: null
  };
}

export function createHead3D(container, registry, modelUrl = 'assets/head-cropped.glb') {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch (err) {
    return unsupportedStub(err.message);
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.classList.add('head-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b16);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CAM_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2.5;
  controls.maxDistance = 8;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.maxPolarAngle = Math.PI * 0.92;

  scene.add(new THREE.HemisphereLight(0x8a9cc0, 0x3a2a26, 1.1));
  const key = new THREE.DirectionalLight(0xfff1e4, 1.8);
  key.position.set(2.5, 3, 4);
  const fill = new THREE.DirectionalLight(0xc9d7ff, 0.55);
  fill.position.set(-3, 0.5, 2);
  const rim = new THREE.DirectionalLight(0xffe2cf, 0.8);
  rim.position.set(0, 2, -4);
  scene.add(key, fill, rim);

  let headMesh = null;
  let skinMaterial = null;
  let zoneShader = null;
  let markerLayer = null;
  let lut = null;

  const view = { markers: [], selectedId: null, hoverZoneId: null, xray: false, groups: [], activeGroupId: null };
  const api = {
    supported: true,
    ready: null,
    onPick: null,
    onHoverZone: null,
    onCameraChange: null
  };

  function applyZoneStates() {
    if (!zoneShader) return;
    zoneShader.clearAll();
    const groupTint = new Map(); // groupId -> [r,g,b] 0..1
    for (const g of view.groups) groupTint.set(g.id, hexToRgb(g.color).map(v => v / 255));
    const tintOf = m => groupTint.get(m.groupId) || intensityRGB(m.intensity).map(v => v / 255);

    const perZone = new Map(); // index -> {intensity, tint, active, hover, selected, inFocus}
    const entry = i => {
      if (!perZone.has(i)) perZone.set(i, { intensity: 0, tint: null, active: false, hover: false, selected: false, inFocus: false });
      return perZone.get(i);
    };
    for (const m of view.markers) {
      const i = registry.zoneIndexOf(m.zoneId);
      if (i < 1) continue;
      const e = entry(i);
      e.active = true;
      if (m.intensity >= e.intensity) { e.intensity = m.intensity; e.tint = tintOf(m); }
      if (m.id === view.selectedId) e.selected = true;
      if (!view.activeGroupId || m.groupId === view.activeGroupId) e.inFocus = true;
    }
    if (view.hoverZoneId) {
      const i = registry.zoneIndexOf(view.hoverZoneId);
      if (i >= 1) entry(i).hover = true;
    }
    for (const [i, e] of perZone) {
      if (e.selected) zoneShader.setZoneState(i, { color: SELECT_TINT, strength: 0.45 });
      else if (e.hover) zoneShader.setZoneState(i, { color: HOVER_TINT, strength: 0.30 });
      else if (e.active && e.intensity > 0 && e.tint) {
        zoneShader.setZoneState(i, {
          color: e.tint,
          strength: (0.26 + 0.04 * e.intensity) * (e.inFocus ? 1 : FOCUS_DIM)
        });
      }
    }
    requestRender();
  }

  api.sync = (markers, selectedId, hoverZoneId, groups = [], activeGroupId = null) => {
    view.markers = markers || [];
    view.selectedId = selectedId || null;
    view.hoverZoneId = hoverZoneId || null;
    view.groups = groups || [];
    view.activeGroupId = activeGroupId || null;
    const groupColors = {};
    for (const g of view.groups) groupColors[g.id] = g.color;
    if (markerLayer) markerLayer.sync(view.markers, view.selectedId, groupColors, view.activeGroupId);
    applyZoneStates();
  };

  // Hover-only update — skips the (expensive) marker decal rebuild.
  api.setHoverZone = zoneId => {
    if (view.hoverZoneId === zoneId) return;
    view.hoverZoneId = zoneId || null;
    applyZoneStates();
  };

  api.setXray = on => {
    view.xray = !!on;
    if (!skinMaterial) return;
    skinMaterial.transparent = view.xray;
    skinMaterial.opacity = view.xray ? 0.18 : 1;
    skinMaterial.depthWrite = !view.xray;
    skinMaterial.needsUpdate = true;
    markerLayer?.setXray(view.xray);
    requestRender();
  };

  function setCamera(theta, phi, dist) {
    const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist || DEFAULT_CAMERA.dist));
    const p = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, phi ?? DEFAULT_CAMERA.phi));
    const t = theta || 0;
    camera.position.set(
      CAM_TARGET.x + d * Math.sin(p) * Math.sin(t),
      CAM_TARGET.y + d * Math.cos(p),
      CAM_TARGET.z + d * Math.sin(p) * Math.cos(t)
    );
    controls.target.copy(CAM_TARGET);
    controls.update();
    requestRender();
  }
  api.setCamera = setCamera;
  api.resetView = () => setCamera(DEFAULT_CAMERA.theta, DEFAULT_CAMERA.phi, DEFAULT_CAMERA.dist);

  controls.addEventListener('end', () => {
    if (!api.onCameraChange) return;
    const off = camera.position.clone().sub(controls.target);
    const dist = off.length();
    api.onCameraChange(Math.atan2(off.x, off.z), Math.acos(off.y / dist), dist);
  });

  // ── Picking ───────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoverEvent = null;
  let downPos = null;

  function pickAt(clientX, clientY) {
    if (!headMesh || !lut) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return pickZone(raycaster, pointer, camera, headMesh, lut, registry.atlasSize, registry.zones);
  }

  const ac = new AbortController();
  const opts = { signal: ac.signal };
  renderer.domElement.addEventListener('pointerdown', e => {
    downPos = [e.clientX, e.clientY];
  }, opts);
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
    downPos = null;
    if (moved > 6) return; // drag, not a tap
    const hit = pickAt(e.clientX, e.clientY);
    if (hit && api.onPick) {
      api.onPick({ zone: hit.zone, p: hit.point.toArray(), n: hit.normal.toArray() });
    }
  }, opts);
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    hoverEvent = e;
  }, opts);
  renderer.domElement.addEventListener('pointerleave', () => {
    hoverEvent = null;
    if (view.hoverZoneId && api.onHoverZone) api.onHoverZone(null);
    renderer.domElement.style.cursor = '';
  }, opts);

  function processHover() {
    if (!hoverEvent) return;
    const hit = pickAt(hoverEvent.clientX, hoverEvent.clientY);
    hoverEvent = null;
    const zoneId = hit?.zone?.id || null;
    renderer.domElement.style.cursor = hit ? 'pointer' : '';
    if (zoneId !== view.hoverZoneId && api.onHoverZone) api.onHoverZone(zoneId, hit?.zone || null);
  }

  // ── Render-on-demand loop ─────────────────────────────────────────────────
  let dirty = true;
  let rafId = 0;
  function requestRender() { dirty = true; }
  controls.addEventListener('change', requestRender);

  function loop(t) {
    rafId = requestAnimationFrame(loop);
    processHover();
    controls.update(); // damping settles here; fires 'change' while moving
    const animating = markerLayer ? markerLayer.update(t / 1000) : false;
    if (dirty || animating) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  api.resize = resize;
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  api.getCanvas = () => renderer.domElement;
  api.debugPick = pickAt; // exposed for automated tests
  api.debugScene = () => ({ scene, camera, headMesh, lut });
  api.snapshot = () => {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  };

  api.dispose = () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    ac.abort();
    controls.dispose();
    markerLayer?.dispose();
    headMesh?.geometry.dispose();
    skinMaterial?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  // ── Model load ────────────────────────────────────────────────────────────
  api.ready = new GLTFLoader().loadAsync(modelUrl).then(gltf => {
    gltf.scene.traverse(o => {
      if (o.isMesh && !headMesh) headMesh = o;
    });
    if (!headMesh) throw new Error('No mesh in GLB');

    skinMaterial = new THREE.MeshStandardMaterial({
      color: SKIN_COLOR,
      roughness: 0.68,
      metalness: 0.0
    });
    headMesh.material = skinMaterial;
    headMesh.position.set(0, 0, 0);
    headMesh.rotation.set(0, 0, 0);
    scene.add(headMesh);

    lut = buildLut(registry.atlasImage, registry.atlasSize);
    zoneShader = createZoneShader(skinMaterial, registry.atlasImage, registry.atlasSize);
    markerLayer = new MarkerLayer(headMesh, scene);

    api.sync(view.markers, view.selectedId, view.hoverZoneId, view.groups, view.activeGroupId);
    if (view.xray) api.setXray(true);
    setCamera(DEFAULT_CAMERA.theta, DEFAULT_CAMERA.phi, DEFAULT_CAMERA.dist);
  });

  setCamera(DEFAULT_CAMERA.theta, DEFAULT_CAMERA.phi, DEFAULT_CAMERA.dist);
  resize();
  loop(0);
  return api;
}
