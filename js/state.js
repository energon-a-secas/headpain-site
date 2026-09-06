// HeadPain state — the live model: episodes, the pains inside them, and the
// points inside those. Everything stays in localStorage; nothing leaves the
// browser unless the user exports or shares a link.
//
// Reading a diary in and writing one out lives in persist.js, which imports
// from here. Nothing here imports from there.

import { GROUP_COLORS, nextGroupColor, nextGroupPattern } from './groups.js';
import { isPattern } from './patterns.js';
import { emptyImpact, normalizeImpact } from './impact.js';

export const STORAGE_KEY = 'headmap-v2';

let uidCounter = 0;
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function defaultMarker(partial = {}) {
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

export function defaultGroup(partial = {}, groups = []) {
  const color = GROUP_COLORS.includes(partial.color) ? partial.color : nextGroupColor(groups);
  return {
    id: uid('g'),
    name: String(partial.name || `Pain ${groups.length + 1}`).slice(0, 60),
    color,
    pattern: isPattern(partial.pattern) ? partial.pattern : nextGroupPattern(groups, color),
    conditionId: partial.conditionId || null // set when seeded from the pattern library
  };
}

// Every marker belongs to a pain. Maps written before pains existed (and any
// share link or JSON file from that era) carry loose markers, so they are
// adopted into one pain on the way in rather than left in a state the renderer
// and the legend have no colour for.
export const ORPHAN_PAIN_NAME = 'My pain';

export function adoptOrphans(ep) {
  const orphans = ep.markers.filter(m => !m.groupId || !ep.groups.some(g => g.id === m.groupId));
  if (!orphans.length) return ep;
  let home = ep.groups.find(g => g.name === ORPHAN_PAIN_NAME);
  if (!home) {
    home = defaultGroup({ name: ORPHAN_PAIN_NAME }, ep.groups);
    ep.groups.push(home);
  }
  for (const m of orphans) m.groupId = home.id;
  return ep;
}

export function defaultEpisode(title, markers = [], groups = []) {
  const now = new Date().toISOString();
  return {
    id: uid('ep'),
    title: title || `Episode ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    createdAt: now,
    updatedAt: now,
    camera: { theta: 0, phi: Math.PI / 2, dist: 4.9 },
    impact: emptyImpact(),   // how often, how long, what it stops you doing
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
    activeGroupId: null,   // the pain new points join; always set once a pain exists
    isolateGroupId: null,  // show this pain alone; null shows every pain
    view: 'normal',
    explain: false,        // read-only presentation: the map, its legend, no editor
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
  state.isolateGroupId = null;
  ensureActivePain();
  return ep;
}

export function loadEpisode(id) {
  if (!state.episodes.some(e => e.id === id)) return false;
  state.activeEpisodeId = id;
  state.selectedMarkerId = null;
  state.isolateGroupId = null;
  ensureActivePain();
  return true;
}

// Keeps "which pain do new points join" pointing at something real: the current
// choice if it still exists, otherwise the first pain, otherwise nothing (an
// empty episode, where the first tap creates one).
export function ensureActivePain() {
  const ep = activeEpisode();
  if (!ep) { state.activeGroupId = null; return null; }
  if (!ep.groups.some(g => g.id === state.activeGroupId)) {
    state.activeGroupId = ep.groups[0]?.id || null;
  }
  return state.activeGroupId;
}

export function deleteEpisode(id) {
  state.episodes = state.episodes.filter(e => e.id !== id);
  if (!state.episodes.length) state.episodes.push(defaultEpisode('My first map'));
  if (state.activeEpisodeId === id) {
    state.activeEpisodeId = state.episodes[0].id;
    state.selectedMarkerId = null;
    state.isolateGroupId = null;
    ensureActivePain();
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
  if (partial.groupId === undefined) {
    partial = { ...partial, groupId: ensureActivePain() };
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
  if (updates.groupId !== undefined && ep.groups.some(g => g.id === updates.groupId)) m.groupId = updates.groupId;
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

export function setGroupStyle(id, { color, pattern } = {}) {
  const ep = activeEpisode();
  const g = ep?.groups.find(g => g.id === id);
  if (!g) return;
  if (GROUP_COLORS.includes(color)) g.color = color;
  if (isPattern(pattern)) g.pattern = pattern;
  touch();
}

// Deleting a pain deletes its points with it. Keeping them would leave markers
// with no pain, which is exactly the state that made a red blob ambiguous; the
// confirm in events.js names the count before this runs.
export function removeGroup(id) {
  const ep = activeEpisode();
  if (!ep) return;
  ep.groups = ep.groups.filter(g => g.id !== id);
  ep.markers = ep.markers.filter(m => m.groupId !== id);
  if (state.selectedMarkerId && !ep.markers.some(m => m.id === state.selectedMarkerId)) {
    state.selectedMarkerId = null;
  }
  if (state.isolateGroupId === id) state.isolateGroupId = null;
  ensureActivePain();
  touch();
}

// Wipes the map back to empty: used when a library pattern replaces it.
export function resetMap() {
  const ep = activeEpisode();
  if (!ep) return;
  ep.groups = [];
  ep.markers = [];
  state.selectedMarkerId = null;
  state.activeGroupId = null;
  state.isolateGroupId = null;
  touch();
}

export function setActiveGroup(id) {
  const ep = activeEpisode();
  if (id && ep?.groups.some(g => g.id === id)) state.activeGroupId = id;
  else ensureActivePain();
}

export function activeGroup() {
  const ep = activeEpisode();
  return ep?.groups.find(g => g.id === state.activeGroupId) || null;
}

// Isolation is a *viewing* choice, kept apart from which pain new points join.
// Conflating the two was why "click the group again to release" also silently
// moved where the next tap would land.
export function setIsolateGroup(id) {
  const ep = activeEpisode();
  state.isolateGroupId = id && ep?.groups.some(g => g.id === id) ? id : null;
}

export function isolatedGroup() {
  const ep = activeEpisode();
  return ep?.groups.find(g => g.id === state.isolateGroupId) || null;
}

// One impact record per episode: it describes the pain as a whole, not a point.
export function updateImpact(patch) {
  const ep = activeEpisode();
  if (!ep) return;
  ep.impact = normalizeImpact({ ...ep.impact, ...patch });
  touch();
}

// Checkbox-style fields: the same click adds or removes.
export function toggleImpactOption(key, id) {
  const ep = activeEpisode();
  if (!ep) return;
  const current = ep.impact?.[key] || [];
  updateImpact({ [key]: current.includes(id) ? current.filter(v => v !== id) : [...current, id] });
}

// Back to a single empty episode. Lives here rather than in persist.js because
// it resets the live model and needs defaultState(), which is private to this
// file: on the wrong side of the seam it threw ReferenceError on every call.
export function resetToDefaults() {
  Object.assign(state, defaultState());
}

export function setView(view) {
  state.view = view === 'xray' ? 'xray' : 'normal';
}

// Explain mode is a way of *reading* a map, so it is deliberately not persisted
// and not part of an episode: a link carries it, the diary does not.
export function setExplain(on) {
  state.explain = Boolean(on);
  document.body.classList.toggle('explain-mode', state.explain);
}

export function setCamera(theta, phi, dist) {
  const ep = activeEpisode();
  if (ep) ep.camera = { theta, phi, dist };
}

export function replaceMarkers(markerList) {
  const ep = activeEpisode();
  if (!ep) return;
  ep.markers = markerList.map(m => defaultMarker(m));
  adoptOrphans(ep);
  state.selectedMarkerId = null;
  ensureActivePain();
  touch();
}
