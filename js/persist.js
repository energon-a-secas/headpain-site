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
import { ZONES_VERSION, isPreFix, migrateEpisode } from './migrate.js';

// Share links carry the whole map in the URL, so they have to stop somewhere.
// The limit is a character budget rather than a point count, because the two do
// not correlate: measured on this model a marker costs about 73 characters bare
// and about 129 with a typical note, so a flat twelve-point cap produced links
// anywhere from 1,055 characters (wasting almost all the headroom) to 9,055
// (well past comfortable) depending only on how much somebody typed.
//
// The payload rides in the fragment, which browsers never send to a server, so
// the 8 KB request-line limits of nginx and friends do not apply: a 7,928-char
// link carrying 60 points was verified to navigate and decode intact. What
// actually binds is the smallest thing people put one of these links into, and
// that is a QR code: roughly 2,300 alphanumeric characters at medium error
// correction, before the modules get too dense to scan from a phone.
export const URL_CHAR_BUDGET = 2000;

// origin + path + '#m=' for the longest host this ships on, plus slack.
const LINK_OVERHEAD = 64;

// base64 is 4 characters per 3 bytes, and base64UrlEncode strips the padding.
// Measuring bytes rather than characters matters: the encoder goes through
// TextEncoder, so one emoji in a note is four bytes, not one.
const encodedLength = json => Math.ceil(new TextEncoder().encode(json).length * 4 / 3);

function fitsBudget(payload) {
  return encodedLength(JSON.stringify(payload)) + LINK_OVERHEAD <= URL_CHAR_BUDGET;
}

// How many points a link would leave behind. Answers from the same fitting the
// encoder uses, so the warning can never disagree with the link.
export function shareWouldTruncate(zoneIndexOf) {
  const ep = activeEpisode();
  if (!ep) return 0;
  const payload = serializeForUrl(zoneIndexOf);
  return payload ? Math.max(0, ep.markers.length - payload.m.length) : 0;
}

// ---------------------------------------------------------------------------
// Serialization — compact for URL hash, verbose for JSON files
// ---------------------------------------------------------------------------

const DEPTH_IDS = ['surface', 'muscle', 'deep-pressure', 'inside-head'];
const SPREAD_IDS = ['pinpoint', 'small', 'regional', 'diffuse'];
const QUALITY_IDS = ['throbbing', 'band-pressure', 'stabbing', 'burning', 'electric', 'dull-ache', 'sharp', 'tender-touch', 'fullness', 'ice-pick'];

const round3 = n => Math.round(n * 1000) / 1000;

// v 3 is v 2 with the zones fixed on 2026-10-30. The rows did not change, the
// frame they were written in did: a v 2 link was minted against the old zones,
// so js/migrate.js moves its points on the way in, and a v 3 link is never
// touched. The app (headpain-ios SiteLink) reads and writes the same versions.
const LINK_VERSION = 3;

export function serializeForUrl(zoneIndexOf) {
  const ep = activeEpisode();
  if (!ep) return null;
  const groupIndex = new Map(ep.groups.map((g, i) => [g.id, i]));
  const payload = {
    v: LINK_VERSION,
    t: ep.title,
    c: [round3(ep.camera.theta), round3(ep.camera.phi), round3(ep.camera.dist)],
    i: packImpact(ep.impact),
    g: ep.groups.map(g => [g.name, colorIndexOf(g.color), g.conditionId || '', patternIndexOf(g.pattern)]),
    m: ep.markers.map(m => [
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

  // Drop points from the end until the link fits. Always keep one: a single
  // 500-character note can exceed the budget on its own, and a link with no
  // points at all is worse than one that is slightly too long.
  while (payload.m.length > 1 && !fitsBudget(payload)) payload.m.pop();
  return payload;
}

// The registry names the zone indices, and moves a v 2 link's points.
export function episodeFromUrlPayload(payload, registry) {
  if (!payload || (payload.v !== 2 && payload.v !== LINK_VERSION)) return null;
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
      zoneId: r[0] >= 0 ? registry.zoneIdAt(r[0]) : null,
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
  return payload.v === 2 ? migrateEpisode(ep, registry) : ep;
}

export function loadFromUrlPayload(payload, registry) {
  const ep = episodeFromUrlPayload(payload, registry);
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
// The migration runs outside the try and before `shared` clears: if it cannot
// run, the edit fails and saving stays blocked, rather than the diary on disk
// reading as no diary and being saved over.
export function absorbShared(registry) {
  if (!state.shared) return;
  let stored = null, restored = [];
  try {
    stored = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
    if (stored?.v === 2 && Array.isArray(stored.episodes)) {
      const ids = new Set(state.episodes.map(e => e.id));
      restored = stored.episodes.filter(e => !ids.has(e.id)).map(normalizeEpisode);
    }
  } catch {
    // no stored diary — the shared episode becomes the diary
  }
  if (restored.length && isPreFix(stored)) restored.forEach(ep => migrateEpisode(ep, registry));
  state.shared = false;
  state.episodes.push(...restored);
}

// Verbose JSON (files): human-readable field names.
// zonesVersion says the positions are in the current zone frame; a file
// without it is from before 2026-10-30 and is migrated on import.
export function episodeToJson(ep) {
  return {
    headmapVersion: 2,
    zonesVersion: ZONES_VERSION,
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
    zonesVersion: ZONES_VERSION,
    kind: 'headmap-export',
    exportedAt: new Date().toISOString(),
    episodes: state.episodes.map(episodeToJson)
  };
}

// The file's root decides its frame: a whole-diary export is one file, written
// at one time.
export function importJson(payload, registry) {
  const list = payload?.kind === 'headmap-export' ? payload.episodes
    : payload?.kind === 'headmap-episode' ? [payload]
    : null;
  if (!Array.isArray(list) || !list.length) return 0;
  const preFix = isPreFix(payload);
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
    if (preFix) migrateEpisode(ep, registry);
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

export let storageStatus = 'idle';

function writeDiary() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 2,
      zonesVersion: ZONES_VERSION,
      episodes: state.episodes,
      activeEpisodeId: state.activeEpisodeId,
      view: state.view
    }));
    storageStatus = 'saved';
  } catch {
    storageStatus = 'error';
  }
}

export function saveToStorage() {
  if (state.shared) return; // viewing a shared link: never overwrite the local diary
  writeDiary();
}

// A diary saved before the zone fix is migrated once, here, and written back
// with zonesVersion so it is never migrated again. The migration runs outside
// the try: one that cannot run must throw out of the boot, not return false,
// because false reads as no diary and the next save would write over it.
export function loadFromStorage(registry) {
  let payload, episodes;
  try {
    payload = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
    if (!payload || payload.v !== 2 || !Array.isArray(payload.episodes) || !payload.episodes.length) return false;
    episodes = payload.episodes.map(normalizeEpisode);
  } catch {
    return false;
  }
  const preFix = isPreFix(payload);
  if (preFix) episodes.forEach(ep => migrateEpisode(ep, registry));
  state.episodes = episodes;
  state.activeEpisodeId = state.episodes.some(e => e.id === payload.activeEpisodeId)
    ? payload.activeEpisodeId : state.episodes[0].id;
  state.view = payload.view === 'xray' ? 'xray' : 'normal';
  state.selectedMarkerId = null;
  state.isolateGroupId = null;
  ensureActivePain();
  if (preFix) writeDiary();
  else storageStatus = 'saved';
  return true;
}

