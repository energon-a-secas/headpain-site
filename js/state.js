// HeadPain state — episodes diary (state v2). Everything stays in localStorage;
// nothing leaves the browser unless the user exports or shares a link.

import { safeJsonParse } from './utils.js';
import { GROUP_COLORS, nextGroupColor, colorIndexOf } from './groups.js';

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
    note: partial.note || '',
    groupId: partial.groupId || null      // pain group this point belongs to
  };
}

function defaultGroup(partial = {}, groups = []) {
  return {
    id: uid('g'),
    name: String(partial.name || `Group ${groups.length + 1}`).slice(0, 60),
    color: GROUP_COLORS.includes(partial.color) ? partial.color : nextGroupColor(groups),
    conditionId: partial.conditionId || null // set when seeded from the pattern library
  };
}

function defaultEpisode(title, markers = [], groups = []) {
  const now = new Date().toISOString();
  return {
    id: uid('ep'),
    title: title || `Episode ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    createdAt: now,
    updatedAt: now,
    camera: { theta: 0, phi: Math.PI / 2, dist: 4.9 },
    groups,
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
    activeGroupId: null,   // focused group: new points join it, others dim on the head
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
  state.activeGroupId = null;
  return ep;
}

export function loadEpisode(id) {
  if (!state.episodes.some(e => e.id === id)) return false;
  state.activeEpisodeId = id;
  state.selectedMarkerId = null;
  state.activeGroupId = null;
  return true;
}

export function deleteEpisode(id) {
  state.episodes = state.episodes.filter(e => e.id !== id);
  if (!state.episodes.length) state.episodes.push(defaultEpisode('My first map'));
  if (state.activeEpisodeId === id) {
    state.activeEpisodeId = state.episodes[0].id;
    state.selectedMarkerId = null;
    state.activeGroupId = null;
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
  if (partial.groupId === undefined && state.activeGroupId) {
    partial = { ...partial, groupId: state.activeGroupId };
  }
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
  if (updates.groupId !== undefined) m.groupId = ep.groups.some(g => g.id === updates.groupId) ? updates.groupId : null;
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

// ---------------------------------------------------------------------------
// Group helpers — one group per concurrent pain type, each with its own color
// ---------------------------------------------------------------------------

export function addGroup(partial = {}) {
  const ep = activeEpisode();
  if (!ep) return null;
  const group = defaultGroup(partial, ep.groups);
  ep.groups.push(group);
  touch();
  return group;
}

export function renameGroup(id, name) {
  const ep = activeEpisode();
  const g = ep?.groups.find(g => g.id === id);
  if (g && name.trim()) {
    g.name = name.trim().slice(0, 60);
    touch();
  }
}

export function setGroupColor(id, color) {
  const ep = activeEpisode();
  const g = ep?.groups.find(g => g.id === id);
  if (g && GROUP_COLORS.includes(color)) {
    g.color = color;
    touch();
  }
}

// Points stay on the map — deleting a group only ungroups them.
export function removeGroup(id) {
  const ep = activeEpisode();
  if (!ep) return;
  ep.groups = ep.groups.filter(g => g.id !== id);
  for (const m of ep.markers) if (m.groupId === id) m.groupId = null;
  if (state.activeGroupId === id) state.activeGroupId = null;
  touch();
}

export function clearGroups() {
  const ep = activeEpisode();
  if (!ep) return;
  ep.groups = [];
  state.activeGroupId = null;
  for (const m of ep.markers) m.groupId = null;
  touch();
}

export function setActiveGroup(id) {
  const ep = activeEpisode();
  state.activeGroupId = id && ep?.groups.some(g => g.id === id) ? id : null;
}

export function activeGroup() {
  const ep = activeEpisode();
  return ep?.groups.find(g => g.id === state.activeGroupId) || null;
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
  const groupIndex = new Map(ep.groups.map((g, i) => [g.id, i]));
  return {
    v: 2,
    t: ep.title,
    c: [round3(ep.camera.theta), round3(ep.camera.phi), round3(ep.camera.dist)],
    g: ep.groups.map(g => [g.name, colorIndexOf(g.color), g.conditionId || '']),
    m: ep.markers.slice(0, URL_MARKER_CAP).map(m => [
      m.zoneId ? zoneIndexOf(m.zoneId) : -1,
      ...m.p.map(round3), ...m.n.map(round3),
      m.intensity,
      DEPTH_IDS.indexOf(m.depth),
      m.quality ? QUALITY_IDS.indexOf(m.quality) : -1,
      SPREAD_IDS.indexOf(m.spread),
      m.note || '',
      m.groupId ? (groupIndex.get(m.groupId) ?? -1) : -1
    ])
  };
}

export function loadFromUrlPayload(payload, zoneIdAt) {
  if (!payload || payload.v !== 2) return false;
  const groups = (Array.isArray(payload.g) ? payload.g : [])
    .filter(r => Array.isArray(r) && typeof r[0] === 'string')
    .map(r => defaultGroup({
      name: r[0],
      color: GROUP_COLORS[r[1]] || null,
      conditionId: typeof r[2] === 'string' && r[2] ? r[2] : null
    }));
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
      note: typeof r[11] === 'string' ? r[11] : '',
      groupId: r[12] >= 0 && groups[r[12]] ? groups[r[12]].id : null
    }));
  const ep = defaultEpisode(typeof payload.t === 'string' ? payload.t : 'Shared map', markers, groups);
  if (Array.isArray(payload.c)) {
    ep.camera = { theta: Number(payload.c[0]) || 0, phi: Number(payload.c[1]) || Math.PI / 2, dist: Number(payload.c[2]) || 4.9 };
  }
  state.episodes = [ep];
  state.activeEpisodeId = ep.id;
  state.selectedMarkerId = markers[0]?.id || null;
  state.activeGroupId = null;
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
      state.episodes.push(...stored.episodes.filter(e => !ids.has(e.id)).map(normalizeEpisode));
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
    groups: ep.groups.map(g => ({ id: g.id, name: g.name, color: g.color, condition: g.conditionId })),
    markers: ep.markers.map(m => ({
      zone: m.zoneId,
      position: m.p.map(round3),
      normal: m.n.map(round3),
      intensity: m.intensity,
      depth: m.depth,
      quality: m.quality,
      spread: m.spread,
      note: m.note,
      group: m.groupId
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
    // Map the file's group ids to fresh ones so marker references survive.
    const groups = [];
    const groupIdMap = new Map();
    for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
      if (!g || typeof g.name !== 'string') continue;
      const fresh = defaultGroup({ name: g.name, color: g.color, conditionId: g.condition || null });
      groups.push(fresh);
      if (g.id) groupIdMap.set(g.id, fresh.id);
    }
    const ep = defaultEpisode(String(raw.title || 'Imported map'), [], groups);
    ep.createdAt = raw.createdAt || ep.createdAt;
    ep.markers = raw.markers.map(m => defaultMarker({
      zoneId: m.zone || null,
      p: Array.isArray(m.position) ? m.position.map(Number) : [0, 0, 1],
      n: Array.isArray(m.normal) ? m.normal.map(Number) : [0, 0, 1],
      intensity: m.intensity,
      depth: DEPTH_IDS.includes(m.depth) ? m.depth : 'surface',
      quality: QUALITY_IDS.includes(m.quality) ? m.quality : null,
      spread: SPREAD_IDS.includes(m.spread) ? m.spread : 'small',
      note: m.note || '',
      groupId: groupIdMap.get(m.group) || null
    }));
    state.episodes.unshift(ep);
    state.activeEpisodeId = ep.id;
    state.activeGroupId = null;
    imported++;
  }
  return imported;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function normalizeEpisode(ep) {
  const groups = (Array.isArray(ep.groups) ? ep.groups : [])
    .filter(g => g && g.id && typeof g.name === 'string')
    .map(g => ({ id: g.id, name: g.name, color: GROUP_COLORS.includes(g.color) ? g.color : GROUP_COLORS[0], conditionId: g.conditionId || null }));
  const groupIds = new Set(groups.map(g => g.id));
  return {
    ...defaultEpisode(ep.title),
    ...ep,
    groups,
    markers: (ep.markers || []).map(m => {
      const marker = defaultMarker(m);
      if (marker.groupId && !groupIds.has(marker.groupId)) marker.groupId = null;
      return marker;
    })
  };
}

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
    state.episodes = payload.episodes.map(normalizeEpisode);
    state.activeEpisodeId = state.episodes.some(e => e.id === payload.activeEpisodeId)
      ? payload.activeEpisodeId : state.episodes[0].id;
    state.view = payload.view === 'xray' ? 'xray' : 'normal';
    state.selectedMarkerId = null;
    state.activeGroupId = null;
    return true;
  } catch {
    return false;
  }
}

export function resetToDefaults() {
  Object.assign(state, defaultState());
}
