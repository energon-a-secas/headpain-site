// The live model: episodes, the pains inside them, the points inside those.
//
// The invariant this file exists to protect is "every marker belongs to a
// pain". A point with a dangling groupId is not a cosmetic problem: markerColor
// falls back to the first palette colour, so the point renders as somebody
// else's pain and the legend has no row for it. The second invariant is that
// activeGroupId (where the next tap lands) and isolateGroupId (what you are
// looking at) stay two fields. They were one field once, and looking at a pain
// silently redirected the next tap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marker } from './fixtures.mjs';
import {
  state, activeEpisode, createEpisode, loadEpisode, deleteEpisode, ensureActivePain,
  addMarker, updateMarker, selectMarker, adoptOrphans, ORPHAN_PAIN_NAME,
  addGroup, removeGroup, setGroupStyle, resetMap,
  setActiveGroup, activeGroup, setIsolateGroup, isolatedGroup,
  setView, setExplain, resetToDefaults
} from '../js/state.js';

import { GROUP_COLORS, markerColor, paint } from '../js/groups.js';
import { isPattern } from '../js/patterns.js';

// A clean world between tests, built out of the module's own exports.
//
// Two reasons this is hand-rolled rather than a resetToDefaults() call:
// persist.resetToDefaults() throws (see the test.todo at the bottom of this
// file), and resetShim() throws on Node >= 24, where globalThis.localStorage is
// already defined as a stub so the shim's `if (!globalThis.localStorage)` guard
// never installs the working one. state.js touches neither localStorage nor the
// canvas, so nothing here needs the shim reset; setExplain(false) below puts
// the one document touch (the body class) back.
function freshWorld() {
  const ep = createEpisode('Test map');
  for (const other of [...state.episodes]) if (other.id !== ep.id) deleteEpisode(other.id);
  setView('normal');
  setExplain(false);
  state.shared = false;
  return ep;
}

// Two pains with a point each, the way the UI builds them: make the pain, make
// it active, then place. Real zone ids, so nothing downstream silently drops.
function seedTwoPains() {
  const ep = freshWorld();
  const a = addGroup({ name: 'Migraine' });
  setActiveGroup(a.id);
  const m1 = addMarker(marker({ zoneId: 'temple-left', intensity: 9, quality: 'throbbing', depth: 'inside-head' }));
  const b = addGroup({ name: 'Sinus' });
  setActiveGroup(b.id);
  const m2 = addMarker(marker({ zoneId: 'sinus-maxillary-left', intensity: 4, quality: 'fullness', depth: 'deep-pressure' }));
  return { ep, a, b, m1, m2 };
}

const orphansIn = ep => ep.markers.filter(m => !m.groupId || !ep.groups.some(g => g.id === m.groupId));

// ---------------------------------------------------------------------------
// Every marker belongs to a pain
// ---------------------------------------------------------------------------

test('a fresh episode has no pains, so ensureActivePain has nothing to point at', () => {
  const ep = freshWorld();
  assert.deepEqual(ep.groups, []);
  assert.equal(state.activeGroupId, null);
  assert.equal(ensureActivePain(), null);
  assert.equal(activeGroup(), null);
});

test('addMarker on a painless episode leaves groupId null and invents no pain: the "start a pain first" guard lives in events.js, not here', () => {
  const ep = freshWorld();
  const m = addMarker(marker({ zoneId: 'temple-left', intensity: 7 }));

  assert.equal(m.groupId, null, 'addMarker must not fabricate a group id nobody owns');
  assert.equal(ep.groups.length, 0, 'a bare addMarker is not allowed to create a pain behind the caller');
  assert.equal(orphansIn(ep).length, 1, 'this is the one state the invariant forbids, and only adoptOrphans repairs it');

  // markerColor has to guess, and it guesses the first palette colour: exactly
  // the "whose pain is this?" ambiguity the pain groups were added to end.
  assert.equal(markerColor(ep, m), paint(GROUP_COLORS[0], 7));

  // adoptOrphans is the repair, and it is what every import path runs.
  adoptOrphans(ep);
  assert.equal(orphansIn(ep).length, 0);
  assert.equal(ep.groups.length, 1);
  assert.equal(ep.groups[0].name, ORPHAN_PAIN_NAME);
  assert.equal(m.groupId, ep.groups[0].id);
});

test('addMarker joins the active pain, so a placed point renders in that pain\'s hue and not the fallback', () => {
  const { ep, b, m2 } = seedTwoPains();

  assert.equal(m2.groupId, b.id);
  assert.equal(orphansIn(ep).length, 0);
  assert.equal(markerColor(ep, m2), paint(b.color, 4));
  assert.notEqual(b.color, GROUP_COLORS[0], 'the second pain must differ from the fallback or this test proves nothing');
  assert.notEqual(markerColor(ep, m2), paint(GROUP_COLORS[0], 4));
});

test('addMarker selects the point it just placed, so the editor opens on it', () => {
  const { m2 } = seedTwoPains();
  assert.equal(state.selectedMarkerId, m2.id);
});

test('an explicit groupId of null is respected rather than quietly reassigned', () => {
  const { ep, a } = seedTwoPains();
  const m = addMarker(marker({ zoneId: 'temple-right', groupId: null }));
  assert.equal(m.groupId, null, 'addMarker only fills in a groupId when the caller omitted the key entirely');
  assert.notEqual(m.groupId, a.id);
  assert.equal(orphansIn(ep).length, 1);
});

// ---------------------------------------------------------------------------
// activeGroupId and isolateGroupId are two fields
// ---------------------------------------------------------------------------

test('setIsolateGroup does not move where the next point lands', () => {
  const { a, b } = seedTwoPains();
  setActiveGroup(a.id);
  setIsolateGroup(b.id);

  assert.equal(state.activeGroupId, a.id, 'looking at one pain must not redirect the next tap into it');
  assert.equal(state.isolateGroupId, b.id);
  assert.equal(activeGroup().id, a.id);
  assert.equal(isolatedGroup().id, b.id);

  const m = addMarker(marker({ zoneId: 'forehead-upper-left' }));
  assert.equal(m.groupId, a.id, 'the new point joined the isolated pain instead of the active one');
});

test('setActiveGroup does not change what is isolated', () => {
  const { a, b } = seedTwoPains();
  setIsolateGroup(a.id);
  setActiveGroup(b.id);

  assert.equal(state.isolateGroupId, a.id, 'choosing where points land must not change what you are looking at');
  assert.equal(state.activeGroupId, b.id);
});

test('setActiveGroup ignores an id no pain owns and keeps the current pain', () => {
  const { a } = seedTwoPains();
  setActiveGroup(a.id);
  setActiveGroup('g-does-not-exist');
  assert.equal(state.activeGroupId, a.id, 'a stale id from a re-rendered list must not blank the target pain');

  setActiveGroup(null);
  assert.equal(state.activeGroupId, a.id, 'null falls through to ensureActivePain, which keeps a valid choice');
});

test('setIsolateGroup releases isolation for null and for an id no pain owns', () => {
  const { a } = seedTwoPains();
  setIsolateGroup(a.id);
  setIsolateGroup(null);
  assert.equal(state.isolateGroupId, null, 'null is how the UI releases isolation');
  assert.equal(isolatedGroup(), null);

  setIsolateGroup(a.id);
  setIsolateGroup('g-does-not-exist');
  assert.equal(state.isolateGroupId, null, 'a stale id must show every pain, never hide all of them');
});

test('ensureActivePain repairs a dangling activeGroupId by falling back to the first pain', () => {
  const { a } = seedTwoPains();
  state.activeGroupId = 'g-deleted-elsewhere';

  assert.equal(ensureActivePain(), a.id);
  assert.equal(state.activeGroupId, a.id);
  assert.equal(activeGroup().id, a.id);
});

test('ensureActivePain returns null on an empty episode and nulls the field with it', () => {
  freshWorld();
  state.activeGroupId = 'g-left-over-from-the-last-episode';

  assert.equal(ensureActivePain(), null);
  assert.equal(state.activeGroupId, null, 'a leftover id would send the next point into a pain that does not exist');
});

// ---------------------------------------------------------------------------
// removeGroup
// ---------------------------------------------------------------------------

test('removeGroup deletes the pain and its points together, leaving no orphan behind', () => {
  const { ep, a, b, m1, m2 } = seedTwoPains();
  removeGroup(b.id);

  assert.deepEqual(ep.groups.map(g => g.id), [a.id]);
  assert.deepEqual(ep.markers.map(m => m.id), [m1.id], 'the deleted pain\'s point must go with it, not survive uncoloured');
  assert.equal(orphansIn(ep).length, 0);
  assert.ok(!ep.markers.some(m => m.id === m2.id));
});

test('removeGroup clears a selection that pointed into the deleted pain', () => {
  const { b, m2 } = seedTwoPains();
  selectMarker(m2.id);
  removeGroup(b.id);
  assert.equal(state.selectedMarkerId, null, 'the editor would otherwise render a point that no longer exists');
});

test('removeGroup keeps a selection that survived the delete', () => {
  const { b, m1 } = seedTwoPains();
  selectMarker(m1.id);
  removeGroup(b.id);
  assert.equal(state.selectedMarkerId, m1.id, 'deleting one pain must not close the editor on another pain\'s point');
});

test('removeGroup releases isolation only when the deleted pain was the isolated one', () => {
  const seeded = seedTwoPains();
  setIsolateGroup(seeded.b.id);
  removeGroup(seeded.b.id);
  assert.equal(state.isolateGroupId, null, 'isolating a deleted pain would hide the whole map');

  const again = seedTwoPains();
  setIsolateGroup(again.a.id);
  removeGroup(again.b.id);
  assert.equal(state.isolateGroupId, again.a.id, 'deleting an unrelated pain must not drop the view you chose');
});

test('removeGroup leaves activeGroupId pointing at a pain that still exists', () => {
  const { ep, a, b } = seedTwoPains();
  setActiveGroup(b.id);
  removeGroup(b.id);

  assert.equal(state.activeGroupId, a.id);
  assert.ok(ep.groups.some(g => g.id === state.activeGroupId));

  removeGroup(a.id);
  assert.equal(state.activeGroupId, null, 'with no pains left there is nothing to point at, and the next tap makes one');
});

test('removeGroup with an id no pain owns changes nothing', () => {
  const { ep, a, b } = seedTwoPains();
  setActiveGroup(a.id);
  removeGroup('g-does-not-exist');
  assert.deepEqual(ep.groups.map(g => g.id), [a.id, b.id]);
  assert.equal(ep.markers.length, 2);
  assert.equal(state.activeGroupId, a.id);
});

// ---------------------------------------------------------------------------
// updateMarker
// ---------------------------------------------------------------------------

test('updateMarker clamps intensity into 0..10 and rounds it to a whole step', () => {
  const { m1 } = seedTwoPains();

  updateMarker(m1.id, { intensity: 99 });
  assert.equal(m1.intensity, 10);

  updateMarker(m1.id, { intensity: -4 });
  assert.equal(m1.intensity, 0, 'intensity 0 must survive: a falsy guard here would silently keep the old value');

  updateMarker(m1.id, { intensity: 4.6 });
  assert.equal(m1.intensity, 5, 'the guidance bands and the share-link tuple both assume whole steps');

  updateMarker(m1.id, { intensity: '7' });
  assert.equal(m1.intensity, 7, 'values arrive from an <input type=range>, so a numeric string must coerce');
});

test('updateMarker truncates a note at 500 characters rather than storing an unbounded string in the URL', () => {
  const { m1 } = seedTwoPains();
  updateMarker(m1.id, { note: 'x'.repeat(900) });
  assert.equal(m1.note.length, 500);

  updateMarker(m1.id, { note: 'behind the left eye' });
  assert.equal(m1.note, 'behind the left eye');

  updateMarker(m1.id, { note: '' });
  assert.equal(m1.note, '', 'clearing a note must clear it, not fall through to the previous text');
});

test('updateMarker refuses a groupId no pain in this episode owns, rather than nulling the point out', () => {
  const { ep, m1, a } = seedTwoPains();
  updateMarker(m1.id, { groupId: 'g-from-another-map' });

  assert.equal(m1.groupId, a.id, 'a rejected move must leave the point where it was, never orphan it');
  assert.equal(orphansIn(ep).length, 0);

  updateMarker(m1.id, { groupId: null });
  assert.equal(m1.groupId, a.id, 'null is not a pain either');
});

test('updateMarker does move a point between two pains that both exist', () => {
  const { ep, m1, b } = seedTwoPains();
  updateMarker(m1.id, { groupId: b.id });

  assert.equal(m1.groupId, b.id, 'without this the refusal test above would pass on a function that never moves anything');
  assert.equal(markerColor(ep, m1), paint(b.color, m1.intensity));
});

test('updateMarker normalises an empty quality to null, so the editor and the legend agree on "not set"', () => {
  const { m1 } = seedTwoPains();
  updateMarker(m1.id, { quality: '' });
  assert.equal(m1.quality, null);
});

test('updateMarker on an id that is gone is a no-op instead of a throw', () => {
  const { ep } = seedTwoPains();
  const before = JSON.stringify(ep.markers);
  updateMarker('m-deleted', { intensity: 3 });
  assert.equal(JSON.stringify(ep.markers), before, 'a stale id from a re-rendered list must not edit whatever is first');
});

// ---------------------------------------------------------------------------
// Pain styling
// ---------------------------------------------------------------------------

test('setGroupStyle accepts only palette colours, so no pain gets a hue the legend cannot name', () => {
  const { a } = seedTwoPains();
  const original = a.color;
  const other = GROUP_COLORS.find(c => c !== original);

  setGroupStyle(a.id, { color: other });
  assert.equal(a.color, other);

  setGroupStyle(a.id, { color: '#123456' });
  assert.equal(a.color, other, 'an off-palette hex has no colour name and no paired pattern');

  setGroupStyle(a.id, { color: 'rose' });
  assert.equal(a.color, other, 'the palette is stored as hex; a name is not a colour here');
});

test('setGroupStyle accepts only real patterns, so no pain gets a decal nothing can draw', () => {
  const { a } = seedTwoPains();
  const original = a.pattern;

  setGroupStyle(a.id, { pattern: 'ring' });
  assert.equal(a.pattern, 'ring');
  assert.ok(isPattern(a.pattern));

  setGroupStyle(a.id, { pattern: 'nonsense' });
  assert.equal(a.pattern, 'ring');

  setGroupStyle(a.id, { pattern: null });
  assert.equal(a.pattern, 'ring', 'null is not a pattern; it must not blank the decal');
  assert.notEqual(original, 'ring', 'the first pain is not born ringed, so the accepted case above proves a real change');
});

test('setGroupStyle with no style at all leaves the pain untouched', () => {
  const { a } = seedTwoPains();
  const before = { color: a.color, pattern: a.pattern };
  setGroupStyle(a.id);
  assert.deepEqual({ color: a.color, pattern: a.pattern }, before);
});

test('every fresh pain gets a distinct colour AND a distinct pattern, so two pains never read the same in greyscale', () => {
  const ep = freshWorld();
  for (let i = 0; i < GROUP_COLORS.length; i++) addGroup({ name: `Pain ${i + 1}` });

  const colors = ep.groups.map(g => g.color);
  const patterns = ep.groups.map(g => g.pattern);

  assert.equal(ep.groups.length, GROUP_COLORS.length);
  assert.equal(new Set(colors).size, colors.length, 'two pains share a hue, so identity collides');
  assert.equal(new Set(patterns).size, patterns.length, 'two pains share a decal, so a greyscale reader cannot tell them apart');
  assert.ok(colors.every(c => GROUP_COLORS.includes(c)));
  assert.ok(patterns.every(p => isPattern(p)));
});

// ---------------------------------------------------------------------------
// resetMap
// ---------------------------------------------------------------------------

test('resetMap empties both pains and points and clears all three selection fields', () => {
  const { ep, a, b, m2 } = seedTwoPains();
  selectMarker(m2.id);
  setActiveGroup(a.id);
  setIsolateGroup(b.id);

  resetMap();

  assert.deepEqual(ep.groups, []);
  assert.deepEqual(ep.markers, []);
  assert.equal(state.selectedMarkerId, null);
  assert.equal(state.activeGroupId, null, 'a leftover active pain would send the first point of the new map into a deleted group');
  assert.equal(state.isolateGroupId, null, 'a leftover isolation would render the replacement map as empty');
});

test('resetMap keeps the episode itself, so the title and the diary entry survive a library swap', () => {
  const { ep } = seedTwoPains();
  const id = ep.id;
  resetMap();
  assert.equal(state.episodes.length, 1);
  assert.equal(activeEpisode().id, id);
});

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

test('createEpisode activates an empty map and leaves nothing pointing at the old one\'s pains', () => {
  const { a, m2 } = seedTwoPains();
  selectMarker(m2.id);
  setIsolateGroup(a.id);

  const fresh = createEpisode('Tuesday');

  assert.equal(activeEpisode().id, fresh.id);
  assert.equal(state.selectedMarkerId, null);
  assert.equal(state.isolateGroupId, null);
  assert.equal(state.activeGroupId, null, 'the previous episode\'s pain id would be dangling in the new one');
  assert.equal(state.episodes.length, 2);
  assert.equal(state.episodes[0].id, fresh.id, 'newest first: the episode list is read top-down');
});

test('loadEpisode restores that episode\'s own active pain and refuses an id that is not there', () => {
  const { ep, a } = seedTwoPains();
  const fresh = createEpisode('Tuesday');
  assert.equal(state.activeGroupId, null);

  assert.equal(loadEpisode(ep.id), true);
  assert.equal(state.activeGroupId, a.id, 'switching back must land on a pain this episode actually owns');
  assert.equal(state.selectedMarkerId, null);
  assert.equal(state.isolateGroupId, null);

  assert.equal(loadEpisode('ep-does-not-exist'), false);
  assert.equal(activeEpisode().id, ep.id, 'a refused load must not move the user off their map');
  assert.ok(state.episodes.some(e => e.id === fresh.id));
});

test('deleting the active episode moves to a survivor and re-points activeGroupId at its pains', () => {
  const { ep, a } = seedTwoPains();
  const fresh = createEpisode('Tuesday');

  deleteEpisode(fresh.id);

  assert.equal(activeEpisode().id, ep.id);
  assert.equal(state.activeGroupId, a.id);
  assert.ok(ep.groups.some(g => g.id === state.activeGroupId));
});

test('deleting the last episode leaves one usable empty episode rather than no map at all', () => {
  const { ep } = seedTwoPains();
  deleteEpisode(ep.id);

  assert.equal(state.episodes.length, 1, 'the app has no rendering path for zero episodes');
  assert.notEqual(state.episodes[0].id, ep.id);
  assert.deepEqual(state.episodes[0].markers, []);
  assert.deepEqual(state.episodes[0].groups, []);
  assert.equal(activeEpisode().id, state.episodes[0].id);
  assert.equal(state.activeGroupId, null);
});

test('every episode this module hands out carries a camera, because boot reads it before anything else', () => {
  const fresh = createEpisode('Tuesday');
  deleteEpisode(fresh.id); // the replacement episode is built the same way
  for (const ep of state.episodes) {
    assert.ok(ep.camera, `${ep.title} has no camera; a missing one reported itself as an unsupported browser`);
    assert.equal(typeof ep.camera.dist, 'number');
  }
});

// ---------------------------------------------------------------------------
// Explain mode
// ---------------------------------------------------------------------------

test('setExplain drives the body class both ways, since the read-only layout is CSS-only', () => {
  freshWorld();
  assert.equal(document.body.classList.contains('explain-mode'), false);

  setExplain(true);
  assert.equal(state.explain, true);
  assert.equal(document.body.classList.contains('explain-mode'), true);

  setExplain(false);
  assert.equal(state.explain, false);
  assert.equal(document.body.classList.contains('explain-mode'), false, 'leaving explain mode must give the editor back');
});

test('setExplain coerces to a boolean, so state.explain is never a truthy string a link put there', () => {
  freshWorld();
  setExplain('1');
  assert.equal(state.explain, true);
  assert.equal(document.body.classList.contains('explain-mode'), true);

  setExplain(0);
  assert.equal(state.explain, false);
});

// ---------------------------------------------------------------------------
// Known bug
// ---------------------------------------------------------------------------

// PRODUCT BUG, js/persist.js:272. resetToDefaults() is:
//
//   export function resetToDefaults() { Object.assign(state, defaultState()); }
//
// but defaultState() is module-private to js/state.js (declared at state.js:77,
// not exported) and persist.js never imports it. Every call therefore throws
// ReferenceError: defaultState is not defined. Nothing in js/ or index.html
// calls it today, so the app does not hit it, but it is a public export of the
// persistence module and it cannot work. The fix is to export defaultState from
// state.js and import it here (or move resetToDefaults into state.js).
//
// Left as todo per the no-product-edits rule; freshWorld() above is the
// workaround this file uses.
test('resetToDefaults restores a clean world', () => {
  seedTwoPains();
  resetToDefaults();

  assert.equal(state.episodes.length, 1);
  assert.deepEqual(state.episodes[0].groups, []);
  assert.deepEqual(state.episodes[0].markers, []);
  assert.equal(state.activeGroupId, null);
  assert.equal(state.isolateGroupId, null);
  assert.equal(state.selectedMarkerId, null);
});
