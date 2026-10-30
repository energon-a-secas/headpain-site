// Maps saved before the 2026-10-30 zone fix, opened after it.
//
// The invariant: a point means on the far side of the fix what it meant when it
// was saved. A point placed by name ("Behind / around eye") lands on that zone's
// current anchor, where the zone tint is; a tapped point stays where the finger
// was and takes the name the current zones give that spot; and anything written
// after the fix (a diary or a file with zonesVersion, a v 3 link) is never
// touched, because a second migration would move a point the person put there.
// "On its zone" is asked of the head itself: a ray onto assets/head-cropped.glb
// and the atlas texel under it, the lookup a tap makes (tests/head-mesh.mjs).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetShim } from './shim.mjs';
import { baked, registry } from './fixtures.mjs';
import { lut, raycast } from './head-mesh.mjs';
import { PRE_FIX_LINKS } from './prefix-links.mjs';
import { sphereTaps } from './prefix-taps.mjs';
import { zoneAt, majoritySample, patchScore, PRIORITY_STEP } from '../js/zone-lookup.js';
import { ZONES_VERSION, isPreFix, migrateEpisode } from '../js/migrate.js';
import { PRE_FIX_ANCHORS, PRE_FIX_WHOLE_HEAD_SPOT } from '../js/zones-legacy.js';
import { wholeHeadSpot } from '../js/presets.js';
import {
  serializeForUrl, episodeFromUrlPayload, loadFromUrlPayload, absorbShared,
  episodeToJson, allToJson, importJson, saveToStorage, loadFromStorage
} from '../js/persist.js';
import { state, defaultEpisode, defaultGroup, defaultMarker, STORAGE_KEY } from '../js/state.js';
import { base64UrlDecode } from '../js/utils.js';

const round3 = n => Math.round(n * 1000) / 1000;
const decode = link => JSON.parse(base64UrlDecode(link));
const zone = id => registry.zoneById(id);

// A ray onto the head from just off the surface along -n. Close, because a
// longer one from the ear canal lands on the helix.
const hitAt = (p, n) => raycast(p.map((v, i) => v + n[i] * 0.05), n.map(v => -v));

// The zone index the shader tints under a point: the atlas under the hit. Gaps
// read 0, and about half the surface is gap, which is fine for a tap (zoneAt
// falls back to the nearest patch) and wrong for a point placed by name.
function tintUnder(p, n) {
  const hit = hitAt(p, n);
  return hit ? majoritySample(lut, baked.atlasSize, hit.uv.x, hit.uv.y) : 0;
}

// The zone a tap at a point is named today: zoneAt, as js/picking.js asks it.
function tapNames(p, n) {
  const hit = hitAt(p, n);
  return hit ? zoneAt(lut, baked.atlasSize, registry.zones, hit.uv, hit.point)?.id ?? null : null;
}

// f8a39c1's anchors at full precision, as a diary stored them (the table and a
// link carry them rounded to three decimals).
const BEFORE = {
  'behind-eye-left': {
    p: [0.2636006658728292, -0.2919474581140325, 0.7820591713154419],
    n: [0.3744081157943613, 0.12494513324652377, 0.9188075296302946]
  },
  'temple-right': {
    p: [-0.5713711661567125, -0.24206905655910813, 0.2942973436753843],
    n: [-0.9857080348312245, -0.1180481367204056, 0.12018447273257037]
  }
};

// The cheekbone tap from PRE_FIX_LINKS.taps: f8a39c1 named it Lower forehead.
const CHEEKBONE = { p: [0.419, -0.1, 0.639], n: [0.612, 0.283, 0.738] };

// One episode with each kind of point a pre-fix map holds.
function preFixEpisode() {
  const g = defaultGroup({ name: 'Migraine' }, []);
  return defaultEpisode('Before the fix', [
    defaultMarker({ zoneId: 'behind-eye-left', groupId: g.id, ...BEFORE['behind-eye-left'], note: 'by name' }),
    defaultMarker({ zoneId: 'forehead-lower-left', groupId: g.id, ...CHEEKBONE, note: 'tapped' }),
    defaultMarker({ zoneId: 'whole-head', groupId: g.id, ...PRE_FIX_WHOLE_HEAD_SPOT, note: 'everywhere' })
  ], [g]);
}

const storedDiary = (episodes, extra = {}) => JSON.stringify({
  v: 2, episodes, activeEpisodeId: episodes[0].id, view: 'normal', ...extra
});

const install = ep => {
  state.episodes = [ep];
  state.activeEpisodeId = ep.id;
  state.shared = false;
  return ep;
};

beforeEach(() => {
  resetShim();
  install(defaultEpisode('Fresh'));
});

// ---------------------------------------------------------------------------
// The frozen table
// ---------------------------------------------------------------------------

test('the pre-fix table is the frame f8a39c1 wrote links in, not a copy of the current bake', () => {
  const ids = Object.keys(PRE_FIX_ANCHORS);
  assert.equal(ids.length, 50);
  assert.deepEqual(ids.filter(id => !zone(id) || zone(id).virtual), [],
    'a table key that names no baked zone can never match a marker, so its points are treated as taps');
  for (const [id, { p, n }] of Object.entries(PRE_FIX_ANCHORS)) {
    assert.deepEqual([...p, ...n].map(round3), [...p, ...n], `${id} is not rounded the way a share link rounds`);
  }
  // Provenance from a real artifact: every row of the link f8a39c1 minted for
  // the demo migraine is a point placed by name, so it must be the table's entry.
  for (const r of decode(PRE_FIX_LINKS.demoMigraine).m) {
    const id = registry.zoneIdAt(r[0]);
    assert.deepEqual([r.slice(1, 4), r.slice(4, 7)], [PRE_FIX_ANCHORS[id].p, PRE_FIX_ANCHORS[id].n],
      `${id} in the table is not where f8a39c1 placed it`);
  }
  const whole = decode(PRE_FIX_LINKS.taps).m.find(r => registry.zoneIdAt(r[0]) === 'whole-head');
  assert.deepEqual([whole.slice(1, 4), whole.slice(4, 7)], [PRE_FIX_WHOLE_HEAD_SPOT.p, PRE_FIX_WHOLE_HEAD_SPOT.n]);
  assert.ok(Object.isFrozen(PRE_FIX_ANCHORS['chin'].p), 'a migrated marker that aliased the table could rewrite it');
});

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

test('the demo migraine shared before the fix opens with every point on its zone', () => {
  const raw = decode(PRE_FIX_LINKS.demoMigraine);
  assert.equal(raw.v, 2);
  // Not vacuous: where f8a39c1 put them, these points sit on other zones'
  // tints (the eye's point on the maxillary sinus, the temple's on the jaw joint).
  const offBefore = raw.m.filter(r => tintUnder(r.slice(1, 4), r.slice(4, 7)) !== r[0]);
  assert.ok(offBefore.length >= 5, `only ${offBefore.length} of 7 pre-fix points were off their tint, so this proves little`);

  const ep = episodeFromUrlPayload(raw, registry);
  assert.deepEqual(ep.markers.map(m => m.zoneId), raw.m.map(r => registry.zoneIdAt(r[0])),
    'a point placed by name keeps its name; only where it sits was wrong');
  for (const m of ep.markers) {
    assert.deepEqual([m.p, m.n], [zone(m.zoneId).anchor, zone(m.zoneId).normal],
      `${m.zoneId} did not move to its current anchor`);
    assert.equal(tintUnder(m.p, m.n), registry.zoneIndexOf(m.zoneId), `${m.zoneId}'s decal is not on its zone's tint`);
  }
});

test('a pre-fix tap stays where the finger was and takes the name the current zones give it', () => {
  const raw = decode(PRE_FIX_LINKS.taps);
  const ep = episodeFromUrlPayload(raw, registry);
  const taps = ep.markers.filter(m => m.zoneId !== 'whole-head');
  assert.deepEqual(raw.m.slice(0, 4).map(r => registry.zoneIdAt(r[0])),
    ['forehead-lower-left', 'tmj-left', 'forehead-lower-center', 'suboccipital-right'], 'the fixture is not the pre-fix taps');
  assert.deepEqual(taps.map(m => m.zoneId), ['cheek-left', 'ear-left', 'nose-bridge', 'neck-back-upper']);
  taps.forEach((m, i) => {
    assert.deepEqual([m.p, m.n], [raw.m[i].slice(1, 4), raw.m[i].slice(4, 7)], `"${m.note}" moved; a tap is where it hurt`);
    assert.equal(tapNames(m.p, m.n), m.zoneId, `"${m.note}" took a name a tap there does not get today`);
  });
});

// Every tap f8a39c1's picker could have stored, from a sphere of rays round the
// head (tests/prefix-taps.mjs), migrated, and asked again the way a tap is.
function migratedSphere() {
  const taps = sphereTaps(registry).map(t => ({ ...t, hit: raycast(t.origin, t.direction) }));
  const ep = migrateEpisode(defaultEpisode('Sphere', taps.map(t =>
    defaultMarker({ zoneId: t.zoneId, p: t.hit.point, n: t.direction.map(v => -v) }))), registry);
  return taps.map((t, i) => ({
    before: t.zoneId,
    after: ep.markers[i].zoneId,
    today: zoneAt(lut, baked.atlasSize, registry.zones, t.hit.uv, t.hit.point)?.id ?? null,
    at: t.hit.point
  }));
}

test('a pre-fix tap the atlas still names the same way keeps that name', () => {
  // Renaming with the nearest patch, a fallback for atlas gaps, turned three of
  // these into a neighbour: an ear into the jaw joint, two midline points of
  // the back of the head into their left twins.
  const taps = migratedSphere();
  assert.equal(taps.length, 2212, 'the sphere fixture lost taps');
  const kept = taps.filter(t => t.before === t.today);
  assert.ok(kept.length > 1000, `only ${kept.length} pre-fix taps still read the same, so this proves little`);
  const renamed = kept.filter(t => t.after !== t.today)
    .map(t => `${t.today} -> ${t.after} at [${t.at.map(v => v.toFixed(3))}]`);
  assert.deepEqual(renamed, [], 'the migration renamed a tap that was already named right');
});

test('a migrated tap reads what a tap there reads today, but on a border the atlas decides', () => {
  // The migration has no UV, so it asks the bake's rule at the point where the
  // atlas asked it at a texel centre. They can differ only where two patches
  // score within a priority step of each other and both claim the point.
  const taps = migratedSphere();
  const off = taps.filter(t => t.after !== t.today);
  assert.ok(off.length <= taps.length / 200, `${off.length} of ${taps.length} migrated taps read something else`);
  const notATie = off.filter(t => {
    const a = patchScore(t.at, zone(t.after)), b = patchScore(t.at, zone(t.today));
    return !(a < 1 && b < 1 && Math.abs(a - b) < PRIORITY_STEP);
  }).map(t => `${t.before} -> ${t.after}, a tap reads ${t.today} at [${t.at.map(v => v.toFixed(3))}]`);
  assert.deepEqual(notATie, []);
});

test('a pre-fix whole-head point moves to the whole-head spot the registry gives today', () => {
  const ep = episodeFromUrlPayload(decode(PRE_FIX_LINKS.taps), registry);
  const whole = ep.markers.find(m => m.note === 'everywhere');
  assert.equal(whole.zoneId, 'whole-head', 'no tap names a virtual zone, so a whole-head point is never renamed');
  assert.deepEqual([whole.p, whole.n], [wholeHeadSpot(registry).p, wholeHeadSpot(registry).n]);

  // Off both spots it is still not a tap: it keeps its name and its place.
  const elsewhere = migrateEpisode(defaultEpisode('Odd', [defaultMarker({ zoneId: 'whole-head', p: [0, 0, 1] })]), registry);
  assert.deepEqual([elsewhere.markers[0].zoneId, elsewhere.markers[0].p], ['whole-head', [0, 0, 1]]);
});

test('a link written today is v 3, and a v 3 link is never migrated', () => {
  // Points a migration would move: one on behind-eye-left's pre-fix anchor and
  // the cheekbone tap under its pre-fix name. Written after the fix, they are
  // where the person put them.
  const ep = install(preFixEpisode());
  const payload = JSON.parse(JSON.stringify(serializeForUrl(registry.zoneIndexOf)));
  assert.equal(payload.v, 3, 'a link written today read as v 2 would be migrated on the way in');
  const back = episodeFromUrlPayload(payload, registry);
  assert.deepEqual(back.markers.map(m => [m.zoneId, m.p, m.n]),
    ep.markers.map(m => [m.zoneId, m.p.map(round3), m.n.map(round3)]));
});

test('opening a pre-fix link leaves the stored diary alone', () => {
  saveToStorage();
  const snapshot = localStorage.getItem(STORAGE_KEY);
  assert.equal(loadFromUrlPayload(decode(PRE_FIX_LINKS.taps), registry), true);
  assert.equal(state.episodes[0].markers[0].zoneId, 'cheek-left');
  saveToStorage();
  assert.equal(localStorage.getItem(STORAGE_KEY), snapshot, 'migrating a link wrote over the diary');
});

// ---------------------------------------------------------------------------
// The stored diary
// ---------------------------------------------------------------------------

test('a diary stored before the fix is migrated once and saved with zonesVersion', () => {
  localStorage.setItem(STORAGE_KEY, storedDiary([preFixEpisode()]));
  assert.equal(loadFromStorage(registry), true);
  const [byName, tapped, whole] = state.episodes[0].markers;
  assert.deepEqual([byName.zoneId, byName.p, byName.n],
    ['behind-eye-left', zone('behind-eye-left').anchor, zone('behind-eye-left').normal]);
  assert.deepEqual([tapped.zoneId, tapped.p, tapped.n], ['cheek-left', CHEEKBONE.p, CHEEKBONE.n]);
  assert.deepEqual([whole.p, whole.n], [wholeHeadSpot(registry).p, wholeHeadSpot(registry).n]);

  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.zonesVersion, ZONES_VERSION, 'not stamped, so the next load migrates it again');
  assert.deepEqual(stored.episodes[0].markers.map(m => [m.zoneId, m.p]),
    state.episodes[0].markers.map(m => [m.zoneId, m.p]), 'the migration was not written back');

  // Marker ids are minted afresh on every load, so compare what they say.
  const after = localStorage.getItem(STORAGE_KEY);
  const said = () => state.episodes[0].markers.map(m => [m.zoneId, m.p, m.n]);
  const first = said();
  assert.equal(loadFromStorage(registry), true);
  assert.deepEqual(said(), first, 'the second load changed a point');
  assert.equal(localStorage.getItem(STORAGE_KEY), after);
});

test('a diary with zonesVersion is never migrated, even where its points sit on pre-fix anchors', () => {
  const ep = preFixEpisode();
  const raw = storedDiary([ep], { zonesVersion: ZONES_VERSION });
  localStorage.setItem(STORAGE_KEY, raw);
  assert.equal(loadFromStorage(registry), true);
  assert.deepEqual(state.episodes[0].markers.map(m => [m.zoneId, m.p, m.n]), ep.markers.map(m => [m.zoneId, m.p, m.n]),
    'a point saved after the fix is where the person put it; migrating it moves it');
  assert.equal(localStorage.getItem(STORAGE_KEY), raw, 'loading a current diary rewrote it');
});

test('absorbShared migrates a pre-fix diary it puts back under a shared map', () => {
  const mine = preFixEpisode();
  localStorage.setItem(STORAGE_KEY, storedDiary([mine]));
  loadFromUrlPayload(decode(PRE_FIX_LINKS.demoMigraine), registry);
  absorbShared(registry);
  const back = state.episodes.find(e => e.id === mine.id);
  assert.ok(back, 'the diary did not come back under the shared map');
  assert.deepEqual(back.markers.map(m => m.zoneId), ['behind-eye-left', 'cheek-left', 'whole-head']);
  assert.deepEqual(back.markers[0].p, zone('behind-eye-left').anchor);
  saveToStorage();
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).zonesVersion, ZONES_VERSION);
});

test('a pre-fix map with no registry to migrate it throws, and the diary on disk survives', () => {
  // Returning false would read as "no diary", and the first edit would save a
  // fresh one over it; returning it unmigrated would save it stamped as current.
  const raw = storedDiary([preFixEpisode()]);
  localStorage.setItem(STORAGE_KEY, raw);
  const before = state.episodes[0].id;
  assert.throws(() => loadFromStorage(), /registry/);
  assert.equal(state.episodes[0].id, before, 'the live model was replaced by a diary that was then not migrated');
  assert.equal(localStorage.getItem(STORAGE_KEY), raw);

  loadFromUrlPayload(decode(PRE_FIX_LINKS.demoMigraine), registry);
  assert.throws(() => absorbShared(), /registry/);
  assert.equal(state.shared, true, 'saving resumed with the diary still on disk and not merged back');
  saveToStorage();
  assert.equal(localStorage.getItem(STORAGE_KEY), raw, 'the shared map was saved over the diary');

  const count = state.episodes.length;
  assert.throws(() => importJson({ ...episodeToJson(preFixEpisode()), zonesVersion: undefined }), /registry/);
  assert.equal(state.episodes.length, count, 'half an import landed before the throw');
});

// ---------------------------------------------------------------------------
// JSON files
// ---------------------------------------------------------------------------

test('exports carry zonesVersion, and only a file without it is migrated on import', () => {
  const ep = preFixEpisode();
  const file = JSON.parse(JSON.stringify(episodeToJson(ep)));
  assert.equal(file.zonesVersion, ZONES_VERSION);
  install(ep);
  assert.equal(JSON.parse(JSON.stringify(allToJson())).zonesVersion, ZONES_VERSION);

  assert.equal(importJson(file, registry), 1);
  assert.deepEqual(state.episodes[0].markers.map(m => [m.zoneId, m.p]), ep.markers.map(m => [m.zoneId, m.p.map(round3)]),
    'a file written after the fix was migrated on import');

  const { zonesVersion, ...old } = file;
  assert.equal(importJson(old, registry), 1);
  assert.deepEqual(state.episodes[0].markers.map(m => m.zoneId), ['behind-eye-left', 'cheek-left', 'whole-head']);
  assert.deepEqual(state.episodes[0].markers[0].p, zone('behind-eye-left').anchor, 'a pre-fix file kept its by-name point on the old anchor');

  // A whole-diary export is one file: its root decides for every episode in it.
  const diary = { kind: 'headmap-export', headmapVersion: 2, episodes: [old, { ...old, title: 'Second' }] };
  assert.equal(importJson(diary, registry), 2);
  assert.ok(state.episodes.slice(0, 2).every(e => e.markers[1].zoneId === 'cheek-left'));
});

test('a file marker with a zone and no position is placed by name, on its zone', () => {
  // Hand-written, or from another tool: the zone is all the marker says. Read
  // as a point at a [0, 0, 1] default, a pre-fix file had both renamed the
  // bridge of the nose.
  const markers = [
    { zone: 'temple-left', intensity: 7, note: 'left temple', group: 'g' },
    { zone: 'occipital-lower-center', intensity: 5, note: 'back of head', group: 'g' },
    { zone: 'whole-head', intensity: 3, note: 'everywhere', group: 'g' }
  ];
  const file = { headmapVersion: 2, kind: 'headmap-episode', title: 'Hand written', groups: [{ id: 'g', name: 'Migraine' }], markers };
  for (const f of [file, { ...file, zonesVersion: ZONES_VERSION }]) {
    assert.equal(importJson(f, registry), 1);
    const [temple, back, whole] = state.episodes[0].markers;
    assert.deepEqual(state.episodes[0].markers.map(m => m.zoneId), ['temple-left', 'occipital-lower-center', 'whole-head']);
    assert.deepEqual([temple.p, temple.n], [zone('temple-left').anchor, zone('temple-left').normal]);
    assert.deepEqual([back.p, back.n], [zone('occipital-lower-center').anchor, zone('occipital-lower-center').normal]);
    assert.deepEqual([whole.p, whole.n], [wholeHeadSpot(registry).p, wholeHeadSpot(registry).n]);
    assert.notEqual(temple.p, zone('temple-left').anchor, 'the marker aliases the zone\'s own anchor');
  }
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

test('migrating twice changes nothing the first run did not', () => {
  const ids = Object.keys(PRE_FIX_ANCHORS);
  const markers = [];
  ids.forEach((id, i) => {
    const before = PRE_FIX_ANCHORS[id];
    markers.push(defaultMarker({ zoneId: id, p: before.p, n: before.n }));
    // A tap on another zone's pre-fix anchor: no code path writes one, and it
    // is the case a second run would read differently if the first left it.
    markers.push(defaultMarker({ zoneId: ids[(i + 1) % ids.length], p: before.p, n: before.n }));
  });
  for (const r of decode(PRE_FIX_LINKS.taps).m) {
    markers.push(defaultMarker({ zoneId: registry.zoneIdAt(r[0]), p: r.slice(1, 4), n: r.slice(4, 7) }));
  }
  for (let i = 0; i < 12; i++) {
    for (let j = 1; j < 8; j++) {
      const th = i / 12 * 2 * Math.PI, ph = j / 8 * Math.PI;
      const d = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
      const hit = raycast(d.map(v => v * 4), d.map(v => -v));
      if (hit) markers.push(defaultMarker({ zoneId: 'temple-left', p: hit.point, n: d }));
    }
  }
  markers.push(defaultMarker({ zoneId: 'whole-head', p: [0, 0, 1] }));
  markers.push(defaultMarker({ zoneId: null, ...PRE_FIX_WHOLE_HEAD_SPOT }));
  markers.push(defaultMarker({ zoneId: 'temple-left', p: ['a', 'b', 'c'] }));
  const ep = defaultEpisode('Everything', markers, []);

  const input = structuredClone(ep);
  const once = migrateEpisode(structuredClone(ep), registry);
  const twice = migrateEpisode(structuredClone(once), registry);
  assert.deepEqual(twice, once);
  const changed = once.markers.filter((m, i) => JSON.stringify(m) !== JSON.stringify(input.markers[i])).length;
  assert.ok(changed > 100, `the first run changed only ${changed} points, so a second run changing none proves little`);
});

test('isPreFix reads the field, never the points', () => {
  assert.equal(isPreFix({ v: 2, episodes: [] }), true);
  assert.equal(isPreFix({ v: 2, zonesVersion: 2, episodes: [] }), false);
  assert.equal(isPreFix(null), true);
});
