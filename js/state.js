// HeadMap state — episodes diary (state v2). Everything stays in localStorage;
// nothing leaves the browser unless the user exports or shares a link.

import { safeJsonParse } from './utils.js';

const STORAGE_KEY = 'headmap-v2';
const URL_MARKER_CAP = 12; // keep share links a sane length; JSON export for dense maps

let uidCounter = 0;
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function defaultMarker(partial = {}) {
  return {
    id: uid('m'),
    zoneId: partial.zoneId || null,       // derived at placement; informational
    p: partial.p || [0, 0, 1],            // head-local position
    n: partial.n || [0, 0, 1],            // head-local surface normal
    intensity: partial.intensity ?? 5,
    depth: partial.depth || 'surface',
    quality: partial.quality || null,
    spread: partial.spread || 'small',
    note: partial.note || ''
  };
}

function defaultEpisode(title, markers = []) {
  const now = new Date().toISOString();
  return {
    id: uid('ep'),
    title: title || `Episode ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    createdAt: now,
    updatedAt: now,
    camera: { theta: 0, phi: Math.PI / 2, dist: 4.9 },
    markers
  };
}

function defaultState() {
  const ep = defaultEpisode('My first map');
  return {
    v: 2,
    episodes: [ep],
    activeEpisodeId: ep.id,
    selectedMarkerId: null,
    view: 'normal',
    shared: false
  };
}

export const state = defaultState();

// ---------------------------------------------------------------------------
// Episode helpers
// ---------------------------------------------------------------------------

export function activeEpisode() {
  return state.episodes.find(e => e.id === state.activeEpisodeId) || state.episodes[0] || null;
}

export function createEpisode(title) {
  const ep = defaultEpisode(title);
  state.episodes.unshift(ep);
  state.activeEpisodeId = ep.id;
  state.selectedMarkerId = null;
  return ep;
}

export function loadEpisode(id) {
  if (!state.episodes.some(e => e.id === id)) return false;
  state.activeEpisodeId = id;
  state.selectedMarkerId = null;
  return true;
}

export function deleteEpisode(id) {
  state.episodes = state.episodes.filter(e => e.id !== id);
  if (!state.episodes.length) state.episodes.push(defaultEpisode('My first map'));
  if (state.activeEpisodeId === id) {
    state.activeEpisodeId = state.episodes[0].id;
    state.selectedMarkerId = null;
  }
}

export function renameEpisode(id, title) {
  const ep = state.episodes.find(e => e.id === id);
  if (ep && title.trim()) {
    ep.title = title.trim().slice(0, 80);
    ep.updatedAt = new Date().toISOString();
  }
}

// ---------------------------------------------------------------------------
// Marker helpers
// ---------------------------------------------------------------------------

function touch() {
  const ep = activeEpisode();
  if (ep) ep.updatedAt = new Date().toISOString();
}

export function addMarker(partial) {
  const ep = activeEpisode();
  if (!ep) return null;
  const marker = defaultMarker(partial);
  ep.markers.push(marker);
  state.selectedMarkerId = marker.id;
  touch();
  return marker;
}

export function updateMarker(id, updates) {
  const ep = activeEpisode();
  const m = ep?.markers.find(m => m.id === id);
  if (!m) return;
  if (updates.intensity !== undefined) m.intensity = Math.max(0, Math.min(10, Math.round(Number(updates.intensity))));
  if (updates.depth !== undefined) m.depth = updates.depth;
  if (updates.quality !== undefined) m.quality = updates.quality || null;
  if (updates.spread !== undefined) m.spread = updates.spread;
  if (updates.note !== undefined) m.note = String(updates.note).slice(0, 500);
  if (updates.zoneId !== undefined) m.zoneId = updates.zoneId;
  touch();
}

export function removeMarker(id) {
  const ep = activeEpisode();
  if (!ep) return;
  ep.markers = ep.markers.filter(m => m.id !== id);
  if (state.selectedMarkerId === id) state.selectedMarkerId = null;
  touch();
}

export function clearMarkers() {
  const ep = activeEpisode();
  if (!ep) return;
  ep.markers = [];
  state.selectedMarkerId = null;
  touch();
}

export function selectMarker(id) {
  state.selectedMarkerId = id;
}

export function selectedMarker() {
  const ep = activeEpisode();
  return ep?.markers.find(m => m.id === state.selectedMarkerId) || null;
}

export function setView(view) {
  state.view = view === 'xray' ? 'xray' : 'normal';
}

export function setCamera(theta, phi, dist) {
  const ep = activeEpisode();
  if (ep) ep.camera = { theta, phi, dist };
}

export function replaceMarkers(markerList) {
  const ep = activeEpisode();
  if (!ep) return;
  ep.markers = markerList.map(m => defaultMarker(m));
  state.selectedMarkerId = ep.markers[0]?.id || null;
  touch();
}

// ---------------------------------------------------------------------------
// Serialization — compact for URL hash, verbose for JSON files
// ---------------------------------------------------------------------------

const DEPTH_IDS = ['surface', 'muscle', 'deep-pressure', 'inside-head'];
const SPREAD_IDS = ['pinpoint', 'small', 'regional', 'diffuse'];
const QUALITY_IDS = ['throbbing', 'band-pressure', 'stabbing', 'burning', 'electric', 'dull-ache', 'sharp', 'tender-touch', 'fullness', 'ice-pick'];

const round3 = n => Math.round(n * 1000) / 1000;

export function serializeForUrl(zoneIndexOf) {
  const ep = activeEpisode();
  if (!ep) return null;
  return {
    v: 2,
    t: ep.title,
    c: [round3(ep.camera.theta), round3(ep.camera.phi), round3(ep.camera.dist)],
    m: ep.markers.slice(0, URL_MARKER_CAP).map(m => [
      m.zoneId ? zoneIndexOf(m.zoneId) : -1,
      ...m.p.map(round3), ...m.n.map(round3),
      m.intensity,
      DEPTH_IDS.indexOf(m.depth),
      m.quality ? QUALITY_IDS.indexOf(m.quality) : -1,
      SPREAD_IDS.indexOf(m.spread),
      m.note || ''
    ])
  };
}

export function loadFromUrlPayload(payload, zoneIdAt) {
  if (!payload || payload.v !== 2) return false;
  const markers = (Array.isArray(payload.m) ? payload.m : [])
    .filter(r => Array.isArray(r) && r.length >= 10)
    .map(r => defaultMarker({
      zoneId: r[0] >= 0 ? zoneIdAt(r[0]) : null,
      p: [r[1], r[2], r[3]].map(Number),
      n: [r[4], r[5], r[6]].map(Number),
      intensity: Number(r[7]) || 0,
      depth: DEPTH_IDS[r[8]] || 'surface',
      quality: r[9] >= 0 ? QUALITY_IDS[r[9]] : null,
      spread: SPREAD_IDS[r[10]] || 'small',
      note: typeof r[11] === 'string' ? r[11] : ''
    }));
  const ep = defaultEpisode(typeof payload.t === 'string' ? payload.t : 'Shared map', markers);
  if (Array.isArray(payload.c)) {
    ep.camera = { theta: Number(payload.c[0]) || 0, phi: Number(payload.c[1]) || Math.PI / 2, dist: Number(payload.c[2]) || 4.9 };
  }
  state.episodes = [ep];
  state.activeEpisodeId = ep.id;
  state.selectedMarkerId = markers[0]?.id || null;
  state.shared = true; // don't persist until absorbShared() merges the diary back
  return true;
}

// Called before the first mutation after opening a shared link: restores any
// locally stored episodes underneath the shared one, then normal saving resumes.
export function absorbShared() {
  if (!state.shared) return;
  state.shared = false;
  try {
    const stored = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
    if (stored?.v === 2 && Array.isArray(stored.episodes)) {
      const ids = new Set(state.episodes.map(e => e.id));
      state.episodes.push(...stored.episodes.filter(e => !ids.has(e.id)));
    }
  } catch {
    // no stored diary — the shared episode becomes the diary
  }
}

// Verbose JSON (files): human-readable field names.
export function episodeToJson(ep) {
  return {
    headmapVersion: 2,
    kind: 'headmap-episode',
    title: ep.title,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
    markers: ep.markers.map(m => ({
      zone: m.zoneId,
      position: m.p.map(round3),
      normal: m.n.map(round3),
      intensity: m.intensity,
      depth: m.depth,
      quality: m.quality,
      spread: m.spread,
      note: m.note
    }))
  };
}

export function allToJson() {
  return {
    headmapVersion: 2,
    kind: 'headmap-export',
    exportedAt: new Date().toISOString(),
    episodes: state.episodes.map(episodeToJson)
  };
}

export function importJson(payload) {
  const list = payload?.kind === 'headmap-export' ? payload.episodes
    : payload?.kind === 'headmap-episode' ? [payload]
    : null;
  if (!Array.isArray(list) || !list.length) return 0;
  let imported = 0;
  for (const raw of list) {
    if (!raw || !Array.isArray(raw.markers)) continue;
    const ep = defaultEpisode(String(raw.title || 'Imported map'));
    ep.createdAt = raw.createdAt || ep.createdAt;
    ep.markers = raw.markers.map(m => defaultMarker({
      zoneId: m.zone || null,
      p: Array.isArray(m.position) ? m.position.map(Number) : [0, 0, 1],
      n: Array.isArray(m.normal) ? m.normal.map(Number) : [0, 0, 1],
      intensity: m.intensity,
      depth: DEPTH_IDS.includes(m.depth) ? m.depth : 'surface',
      quality: QUALITY_IDS.includes(m.quality) ? m.quality : null,
      spread: SPREAD_IDS.includes(m.spread) ? m.spread : 'small',
      note: m.note || ''
    }));
    state.episodes.unshift(ep);
    state.activeEpisodeId = ep.id;
    imported++;
  }
  return imported;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveToStorage() {
  if (state.shared) return; // viewing a shared link — never overwrite the local diary
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 2,
      episodes: state.episodes,
      activeEpisodeId: state.activeEpisodeId,
      view: state.view
    }));
  } catch {
    // storage full or unavailable — session continues without persistence
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const payload = safeJsonParse(raw, null);
    if (!payload || payload.v !== 2 || !Array.isArray(payload.episodes) || !payload.episodes.length) return false;
    state.episodes = payload.episodes.map(ep => ({
      ...defaultEpisode(ep.title),
      ...ep,
      markers: (ep.markers || []).map(m => defaultMarker(m))
    }));
    state.activeEpisodeId = state.episodes.some(e => e.id === payload.activeEpisodeId)
      ? payload.activeEpisodeId : state.episodes[0].id;
    state.view = payload.view === 'xray' ? 'xray' : 'normal';
    state.selectedMarkerId = null;
    return true;
  } catch {
    return false;
  }
}

export function resetToDefaults() {
  Object.assign(state, defaultState());
}
