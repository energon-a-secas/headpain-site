// Getting a diary in and out: localStorage, JSON files, and share links.
//
// Split out of state.js when that file passed the project's ~500 line ceiling.
// The seam is real, not arbitrary: state.js is the live model that the UI reads
// and mutates, and this file is every path by which a model arrives from
// somewhere else or leaves for somewhere else. Everything here imports from
// state.js and nothing there imports from here.

import { safeJsonParse } from './utils.js';
import { GROUP_COLORS, colorIndexOf } from './groups.js';
import { patternAt, patternIndexOf, isPattern } from './patterns.js';
import { normalizeImpact, packImpact, unpackImpact, hasImpact } from './impact.js';
import {
  state, activeEpisode, ensureActivePain,
  defaultMarker, defaultGroup, defaultEpisode, adoptOrphans, STORAGE_KEY
} from './state.js';

// Share links carry the whole map in the URL, so they have to stop somewhere.
// Exported so the UI can warn *before* someone hands out a link that quietly
// dropped half their points.
export const URL_MARKER_CAP = 12;

export function shareWouldTruncate() {
  const ep = activeEpisode();
  return ep ? Math.max(0, ep.markers.length - URL_MARKER_CAP) : 0;
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
    i: packImpact(ep.impact),
    g: ep.groups.map(g => [g.name, colorIndexOf(g.color), g.conditionId || '', patternIndexOf(g.pattern)]),
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

export function episodeFromUrlPayload(payload, zoneIdAt) {
  if (!payload || payload.v !== 2) return null;
  const groups = (Array.isArray(payload.g) ? payload.g : [])
    .filter(r => Array.isArray(r) && typeof r[0] === 'string')
    .map((r, i, all) => defaultGroup({
      name: r[0],
      color: GROUP_COLORS[r[1]] || null,
      conditionId: typeof r[2] === 'string' && r[2] ? r[2] : null,
      // Links written before pains carried a pattern get the twin of their
      // colour slot, so an old link still renders two distinguishable pains.
      pattern: r[3] >= 0 ? patternAt(r[3]) : patternAt(r[1] >= 0 ? r[1] : i)
    }, all.slice(0, i)));
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
  const ep = adoptOrphans(defaultEpisode(typeof payload.t === 'string' ? payload.t : 'Shared map', markers, groups));
  if (Array.isArray(payload.c)) {
    ep.camera = { theta: Number(payload.c[0]) || 0, phi: Number(payload.c[1]) || Math.PI / 2, dist: Number(payload.c[2]) || 4.9 };
  }
  ep.impact = unpackImpact(payload.i);
  return ep;
}

export function loadFromUrlPayload(payload, zoneIdAt) {
  const ep = episodeFromUrlPayload(payload, zoneIdAt);
  if (!ep) return false;
  const markers = ep.markers;
  state.episodes = [ep];
  state.activeEpisodeId = ep.id;
  state.selectedMarkerId = markers[0]?.id || null;
  state.isolateGroupId = null;
  ensureActivePain();
  state.shared = true; // don't persist until absorbShared() merges the diary back
  return true;
}

// A pattern from the library, opened for reading. Marked `shared` for the same
// reason a share link is: it is somebody else's map on screen, and saving it
// over the diary would lose the user's own episodes.
export function loadLearnEpisode(ep) {
  if (!ep) return false;
  state.episodes = [ep];
  state.activeEpisodeId = ep.id;
  state.selectedMarkerId = null;
  state.isolateGroupId = null;
  ensureActivePain();
  state.shared = true;
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
    impact: hasImpact(ep.impact) ? ep.impact : null,
    groups: ep.groups.map(g => ({ id: g.id, name: g.name, color: g.color, pattern: g.pattern, condition: g.conditionId })),
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
      const fresh = defaultGroup({ name: g.name, color: g.color, pattern: g.pattern, conditionId: g.condition || null }, groups);
      groups.push(fresh);
      if (g.id) groupIdMap.set(g.id, fresh.id);
    }
    const ep = defaultEpisode(String(raw.title || 'Imported map'), [], groups);
    ep.createdAt = raw.createdAt || ep.createdAt;
    ep.impact = normalizeImpact(raw.impact);
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
    adoptOrphans(ep);
    state.episodes.unshift(ep);
    state.activeEpisodeId = ep.id;
    state.isolateGroupId = null;
    ensureActivePain();
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
    .map((g, i) => ({
      id: g.id,
      name: g.name,
      color: GROUP_COLORS.includes(g.color) ? g.color : GROUP_COLORS[i % GROUP_COLORS.length],
      pattern: isPattern(g.pattern) ? g.pattern : patternAt(i),
      conditionId: g.conditionId || null
    }));
  const groupIds = new Set(groups.map(g => g.id));
  return adoptOrphans({
    ...defaultEpisode(ep.title),
    ...ep,
    impact: normalizeImpact(ep.impact),
    groups,
    markers: (ep.markers || []).map(m => {
      const marker = defaultMarker(m);
      if (marker.groupId && !groupIds.has(marker.groupId)) marker.groupId = null;
      return marker;
    })
  });
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
    state.isolateGroupId = null;
    ensureActivePain();
    return true;
  } catch {
    return false;
  }
}

export function resetToDefaults() {
  Object.assign(state, defaultState());
}
