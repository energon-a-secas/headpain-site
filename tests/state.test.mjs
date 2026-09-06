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
  uid, state, activeEpisode, createEpisode, loadEpisode, deleteEpisode, ensureActivePain,
  addMarker, updateMarker, removeMarker, clearMarkers, selectMarker, selectedMarker, replaceMarkers,
  adoptOrphans, ORPHAN_PAIN_NAME,
  addGroup, renameGroup, removeGroup, setGroupStyle, resetMap,
  setActiveGroup, activeGroup, setIsolateGroup, isolatedGroup,
  setView, setExplain, resetToDefaults
} from '../js/state.js';

import { GROUP_COLORS, groupById, markerColor, paint } from '../js/groups.js';
import { isPattern } from '../js/patterns.js';

// A clean world between tests, built out of the module's own exports.
//
// Deliberately hand-rolled rather than a resetToDefaults() call: that function
// is itself under test at the bottom of this file, and a helper every other
// test leans on is the wrong place to exercise it. state.js touches neither
// localStorage nor the canvas, so nothing here needs the shim reset either;
// setExplain(false) below puts the one document touch (the body class) back.
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

test('a second import joins the pain the first import made instead of stacking another "My pain"', () => {
  const ep = freshWorld();
  addMarker(marker({ zoneId: 'temple-left' }));   // no pain exists yet, so it lands loose
  adoptOrphans(ep);
  const home = ep.groups[0];

  // A second share link or JSON file arrives into the same episode.
  ep.markers.push({ ...marker({ zoneId: 'temple-right' }), id: uid('m'), groupId: null });
  adoptOrphans(ep);

  assert.equal(ep.groups.length, 1, 'each import making its own "My pain" gives the legend a row per import');
  assert.equal(ep.groups[0].id, home.id, 'the reused pain must be the same object, not a same-named twin');
  assert.ok(ep.markers.every(m => m.groupId === home.id));
  assert.equal(orphansIn(ep).length, 0);
});

test('addMarker joins the active pain, so a placed point renders in that pain\'s hue and not the fallback', () => {
  const { ep, b, m2 } = seedTwoPains();

  assert.equal(m2.groupId, b.id);
  assert.equal(orphansIn(ep).length, 0);

  // Assert on the pain the point resolves *through*, not on paint()'s output:
  // recomputing the expected string with paint() would move both sides of the
  // equality together, so a broken ramp would still read as equal. paint()'s
  // maths belongs to groups.test.mjs; whose hue gets used belongs here.
  assert.equal(groupById(ep, m2.groupId)?.color, b.color);
  assert.notEqual(b.color, GROUP_COLORS[0], 'the second pain must differ from the fallback or this test proves nothing');
  assert.notEqual(markerColor(ep, m2), paint(GROUP_COLORS[0], 4), 'a point rendering in the fallback hue is a point nobody owns');
});

test('a point placed at intensity 0 stays 0, because the bottom of the slider is an answer and not "unset"', () => {
  const { ep } = seedTwoPains();
  const m = addMarker(marker({ zoneId: 'temple-right', intensity: 0 }));

  assert.equal(m.intensity, 0, 'a || default here turns "it barely hurts" into a 5 nobody typed');
  assert.equal(ep.markers.find(x => x.id === m.id).intensity, 0);
});

test('addMarker keeps the fields placement computed, since a dropped zoneId renders nothing at all', () => {
  seedTwoPains();
  const m = addMarker(marker({
    zoneId: 'occipital-lower-left', p: [0.1, 0.2, 0.3], n: [0, 1, 0],
    depth: 'muscle', spread: 'diffuse', quality: 'stabbing', note: 'wakes me at 4am'
  }));

  assert.equal(m.zoneId, 'occipital-lower-left', 'materializeSpots drops a point whose zone the model does not carry');
  assert.deepEqual(m.p, [0.1, 0.2, 0.3], 'the position is the point; a default here puts it on the tip of the nose');
  assert.deepEqual(m.n, [0, 1, 0]);
  assert.equal(m.depth, 'muscle');
  assert.equal(m.spread, 'diffuse');
  assert.equal(m.quality, 'stabbing');
  assert.equal(m.note, 'wakes me at 4am');
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

test('replaceMarkers is the import path: it swaps the whole list, adopts whatever arrives loose, and leaves the next tap somewhere real', () => {
  const { ep, a, b, m1 } = seedTwoPains();
  setActiveGroup(b.id);
  selectMarker(m1.id);

  replaceMarkers([
    marker({ zoneId: 'temple-left', intensity: 8, groupId: a.id }),                    // a pain this episode owns
    marker({ zoneId: 'temple-right', intensity: 3, groupId: 'g-from-another-map' }),   // a pain it does not
    marker({ zoneId: 'sinus-maxillary-left', intensity: 2 })                           // never had one
  ]);

  assert.equal(ep.markers.length, 3, 'an import replaces the map, it does not append to the one already there');
  assert.ok(!ep.markers.some(m => m.id === m1.id));
  assert.equal(orphansIn(ep).length, 0, 'this is the one path that has to restore the invariant, and it runs on every share link');

  const home = ep.groups.find(g => g.name === ORPHAN_PAIN_NAME);
  assert.ok(home, 'the two points with no pain of their own need one made for them');
  assert.equal(ep.markers[0].groupId, a.id, 'a point naming a pain this episode owns keeps it');
  assert.equal(ep.markers[1].groupId, home.id, 'a groupId from another map is as loose as no groupId at all');
  assert.equal(ep.markers[2].groupId, home.id);

  assert.equal(state.selectedMarkerId, null, 'the editor cannot stay open on a point the import deleted');
  assert.equal(state.activeGroupId, b.id, 'an import must not move where the next tap lands');
  assert.ok(ep.groups.some(g => g.id === state.activeGroupId));
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
  // b, not a: a is groups[0], so "kept the current pain" and "silently snapped
  // back to the first pain" produce the same id and prove nothing apart.
  const { a, b } = seedTwoPains();
  setActiveGroup(b.id);

  setActiveGroup('g-does-not-exist');
  assert.equal(state.activeGroupId, b.id, 'a stale id from a re-rendered list must neither blank the target pain nor move it to the first one');

  setActiveGroup(null);
  assert.equal(state.activeGroupId, b.id, 'null falls through to ensureActivePain, which keeps a valid choice');

  // The other half of the same line: when the current choice is *not* valid,
  // the fallback is the first pain rather than nothing.
  state.activeGroupId = 'g-deleted-elsewhere';
  setActiveGroup('g-does-not-exist');
  assert.equal(state.activeGroupId, a.id);
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
  const wasRendering = markerColor(ep, m1);
  updateMarker(m1.id, { groupId: b.id });

  assert.equal(m1.groupId, b.id, 'without this the refusal test above would pass on a function that never moves anything');
  assert.equal(groupById(ep, m1.groupId)?.color, b.color, 'the point now resolves through the pain it moved to');
  assert.notEqual(markerColor(ep, m1), wasRendering, 'a moved point still drawn in its old pain\'s hue is the bug this guards');
  assert.equal(m1.intensity, 9, 'moving a point between pains must not touch how much it hurts');
});

test('updateMarker writes depth, spread and zoneId, the three fields the editor changes after placement', () => {
  const { m1 } = seedTwoPains();          // placed as inside-head / small / temple-left
  updateMarker(m1.id, { depth: 'deep-pressure', spread: 'regional', zoneId: 'occipital-lower-right' });

  assert.equal(m1.depth, 'deep-pressure', 'the depth chips write through this call and nothing else');
  assert.equal(m1.spread, 'regional', 'spread drives the decal radius, so a dropped write draws the wrong size');
  assert.equal(m1.zoneId, 'occipital-lower-right', 'the zone is what the legend and the condition matcher read');

  updateMarker(m1.id, { intensity: 6 });
  assert.equal(m1.depth, 'deep-pressure', 'an update that names none of them must leave them alone');
  assert.equal(m1.spread, 'regional');
  assert.equal(m1.zoneId, 'occipital-lower-right');
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

test('removeMarker closes the editor on the point it deleted, and only on that one', () => {
  const { ep, m1, m2 } = seedTwoPains();
  selectMarker(m1.id);

  removeMarker(m2.id);
  assert.deepEqual(ep.markers.map(m => m.id), [m1.id]);
  assert.equal(state.selectedMarkerId, m1.id, 'deleting another point must not close the editor you are typing in');
  assert.equal(selectedMarker()?.id, m1.id);

  removeMarker(m1.id);
  assert.equal(state.selectedMarkerId, null, 'the editor would otherwise render a point that no longer exists');
  assert.equal(selectedMarker(), null);
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

test('an unnamed pain is numbered by its place in the episode, and a pasted essay is cut to 60 characters', () => {
  freshWorld();
  const first = addGroup();
  const second = addGroup();

  assert.equal(first.name, 'Pain 1');
  assert.equal(second.name, 'Pain 2', 'the number is the pain\'s position in this episode; "Pain" twice is two rows nobody can tell apart');

  const long = addGroup({ name: 'x'.repeat(200) });
  assert.equal(long.name.length, 60, 'the name rides in the share link and in one legend row, so it cannot be unbounded');
});

test('renameGroup ignores a blank name, so an emptied input does not leave a pain with nothing to call it', () => {
  const { a } = seedTwoPains();
  renameGroup(a.id, '  Cluster  ');
  assert.equal(a.name, 'Cluster', 'the trim is what stops a stray space becoming part of the legend row');

  renameGroup(a.id, '   ');
  assert.equal(a.name, 'Cluster', 'an input cleared mid-edit fires with whitespace and must not land');

  renameGroup(a.id, '');
  assert.equal(a.name, 'Cluster');
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

test('deleting a background episode leaves the user on the map they were reading', () => {
  const { ep, b, m2 } = seedTwoPains();
  const other = createEpisode('Tuesday');
  loadEpisode(ep.id);
  selectMarker(m2.id);
  setActiveGroup(b.id);
  setIsolateGroup(b.id);

  deleteEpisode(other.id);

  assert.equal(activeEpisode().id, ep.id, 'tidying the library must not throw the user onto a different map');
  assert.equal(state.selectedMarkerId, m2.id, 'the open editor stays open: nothing it points at was deleted');
  assert.equal(state.isolateGroupId, b.id, 'the pain being examined stays isolated');
  assert.equal(state.activeGroupId, b.id);
  assert.equal(state.episodes.length, 1);
});

test('activeEpisode falls back to the first map when the id points at one that is gone', () => {
  freshWorld();
  const newest = createEpisode('Tuesday');
  state.activeEpisodeId = 'ep-deleted-in-another-tab';

  const found = activeEpisode();
  assert.ok(found, 'a null episode makes every writer in this module a silent no-op');
  assert.equal(found.id, newest.id, 'newest first, so the recovery lands on the top of the library');
  assert.ok(addMarker(marker({ zoneId: 'temple-left' })), 'and the map stays writable through the recovery');
});

test('createEpisode with no title still names the map, so the library has no blank row to click', () => {
  freshWorld();
  const untitled = createEpisode();
  assert.ok(untitled.title && untitled.title.trim().length, 'an untitled episode renders as an empty button in the library list');
});

test('every episode this module hands out carries a camera, because boot reads it before anything else', () => {
  const assertCamera = ep => {
    assert.ok(ep.camera, `${ep.title} has no camera; a missing one reported itself to a user as an unsupported browser`);
    assert.equal(typeof ep.camera.theta, 'number');
    assert.equal(typeof ep.camera.phi, 'number');
    assert.equal(typeof ep.camera.dist, 'number');
  };

  const first = freshWorld();
  const second = createEpisode('Tuesday');
  assert.equal(state.episodes.length, 2, 'a loop over one episode would prove almost nothing');
  for (const ep of state.episodes) assertCamera(ep);

  // Empty the library: deleteEpisode has to invent the replacement itself, and
  // that call is a different one from createEpisode's.
  deleteEpisode(second.id);
  deleteEpisode(first.id);
  assert.equal(state.episodes.length, 1);
  assert.ok(![first.id, second.id].includes(state.episodes[0].id), 'this one was built by the replacement branch, not carried over');
  assertCamera(state.episodes[0]);
});

// ---------------------------------------------------------------------------
// Reading modes: view and explain
// ---------------------------------------------------------------------------

test('setView stores one of the two views the renderer can draw, whatever a link asks for', () => {
  freshWorld();
  setView('xray');
  assert.equal(state.view, 'xray');

  setView('normal');
  assert.equal(state.view, 'normal');

  setView('wireframe');
  assert.equal(state.view, 'normal', 'an unknown view arrives from ?view= and has to land on the one that draws');

  setView(undefined);
  assert.equal(state.view, 'normal', 'so does a missing one');
});

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
// Ids and the diary stamp
// ---------------------------------------------------------------------------

test('uid does not repeat inside a millisecond, since an id is the only handle a point or a pain has', () => {
  const ids = new Set();
  for (let i = 0; i < 20000; i++) ids.add(uid('m'));

  assert.equal(ids.size, 20000, 'two points sharing an id means selecting one edits the other');
  assert.ok([...ids].every(id => id.startsWith('m-')), 'the prefix is what makes a stray id legible in a share link or a JSON export');
});

test('every edit stamps the episode, because the diary orders and dates maps by updatedAt', () => {
  const { ep, a, m1, m2 } = seedTwoPains();
  const PAST = '2020-01-01T00:00:00.000Z';

  // One row per caller of touch(). A no-op touch() passes every other test in
  // this file, and the library quietly shows the date the map was created.
  const edits = [
    ['addMarker', () => addMarker(marker({ zoneId: 'temple-right' }))],
    ['updateMarker', () => updateMarker(m1.id, { intensity: 3 })],
    ['addGroup', () => addGroup({ name: 'Tension' })],
    ['setGroupStyle', () => setGroupStyle(a.id, { pattern: 'ring' })],
    ['removeMarker', () => removeMarker(m2.id)],
    ['replaceMarkers', () => replaceMarkers([marker({ zoneId: 'temple-left' })])],
    ['removeGroup', () => removeGroup(a.id)],
    ['resetMap', () => resetMap()]
  ];

  for (const [name, edit] of edits) {
    ep.updatedAt = PAST;
    edit();
    assert.notEqual(ep.updatedAt, PAST, `${name} left the episode's timestamp behind, so the diary dates the map wrong`);
  }
});

// ---------------------------------------------------------------------------
// resetToDefaults
// ---------------------------------------------------------------------------

// This one used to live in persist.js, where defaultState() (private to
// state.js) was out of scope, so every call threw ReferenceError. It now sits
// beside the state it resets. The test stays as the guard against it drifting
// back across that seam.
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

// ---------------------------------------------------------------------------
// Gaps the whole-suite mutation harness found: each mutation below left all 328
// tests green.
// ---------------------------------------------------------------------------

test('Clear all actually clears, rather than confirming and doing nothing', () => {
  resetToDefaults();
  const g = addGroup({ name: 'Pain' });
  setActiveGroup(g.id);
  addMarker(marker({ zoneId: 'temple-left' }));
  const m = addMarker(marker({ zoneId: 'vertex-center' }));
  selectMarker(m.id);
  assert.equal(activeEpisode().markers.length, 2);

  clearMarkers();

  assert.equal(activeEpisode().markers.length, 0, 'the points survived Clear all');
  assert.equal(state.selectedMarkerId, null, 'a deleted point is still selected, so the editor reads a ghost');
  assert.equal(activeEpisode().groups.length, 1, 'clearing the points must not delete the pains');
});

test('a new episode arrives with an impact record, so the panel has somewhere to write', () => {
  resetToDefaults();
  const ep = createEpisode('Fresh');
  assert.ok(ep.impact && typeof ep.impact === 'object',
    'defaultEpisode dropped impact; the Impact panel would write into undefined');
  for (const key of ['frequency', 'duration', 'daysLost']) {
    assert.equal(ep.impact[key], null, `impact.${key} should start unanswered`);
  }
  for (const key of ['blocked', 'symptoms', 'relief']) {
    assert.deepEqual(ep.impact[key], [], `impact.${key} should start empty`);
  }
});
