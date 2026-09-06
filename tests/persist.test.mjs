// Getting a diary in and out: localStorage, JSON files, share-link payloads.
//
// The invariant this file protects is that a map survives the trip. Every path
// through persist.js is a place where an episode leaves the process and comes
// back, and each one has its own way of quietly losing something: a note with a
// curly apostrophe (btoa is Latin-1), a marker whose pain went missing (a
// dangling groupId renders the wrong hue), a pain written before patterns
// existed, a share link opened over the top of somebody's real diary. What is
// asserted here is what has to be true on the far side of each trip.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetShim } from './shim.mjs';
import { registry } from './fixtures.mjs';
import {
  URL_MARKER_CAP, shareWouldTruncate, serializeForUrl, episodeFromUrlPayload,
  loadFromUrlPayload, loadLearnEpisode, absorbShared, episodeToJson, allToJson,
  importJson, saveToStorage, loadFromStorage
} from '../js/persist.js';
import {
  state, defaultEpisode, defaultGroup, defaultMarker, STORAGE_KEY, ORPHAN_PAIN_NAME, resetToDefaults
} from '../js/state.js';
import { base64UrlEncode, base64UrlDecode } from '../js/utils.js';
import { GROUP_COLORS } from '../js/groups.js';
import { isPattern, patternAt, patternIndexOf } from '../js/patterns.js';
import { emptyImpact } from '../js/impact.js';

const zoneIndexOf = registry.zoneIndexOf;
const zoneIdAt = registry.zoneIdAt;

// A fresh live model, and nothing else. Built out of state.js's own
// constructors rather than by calling resetToDefaults(), which is itself under
// test at the bottom of this file: a reset that broke would otherwise take
// every test here down through its setup instead of failing on its own line.
// Deliberately does NOT touch localStorage: the point of half these tests is to
// reload a diary the previous lines wrote.
function resetModel() {
  const ep = defaultEpisode('My first map');
  Object.assign(state, {
    v: 2,
    episodes: [ep],
    activeEpisodeId: ep.id,
    selectedMarkerId: null,
    activeGroupId: null,
    isolateGroupId: null,
    view: 'normal',
    explain: false,
    shared: false
  });
  return ep;
}

// Between tests: empty world, empty storage.
function freshState() {
  resetShim();
  return resetModel();
}

// Installs an episode as the active one, the way the UI would have built it.
function install(ep) {
  state.episodes = [ep];
  state.activeEpisodeId = ep.id;
  state.selectedMarkerId = null;
  state.activeGroupId = ep.groups[0]?.id || null;
  return ep;
}

// A two-pain episode with every marker field set to something non-default, so a
// field dropped in transit shows up as a difference rather than as a match
// against the default.
function richEpisode() {
  const migraine = defaultGroup({ name: 'Migraine', color: '#38bdf8', pattern: 'star', conditionId: 'migraine' }, []);
  const sinus = defaultGroup({ name: 'Sinus', color: '#fbbf24', pattern: 'grid' }, [migraine]);
  const ep = defaultEpisode('Bad week', [
    defaultMarker({
      zoneId: 'temple-left', groupId: migraine.id, intensity: 9, quality: 'throbbing',
      depth: 'inside-head', spread: 'regional', note: 'behind the eye', p: [0.125, -0.5, 0.75], n: [0, 1, 0]
    }),
    defaultMarker({
      zoneId: 'sinus-maxillary-left', groupId: sinus.id, intensity: 3, quality: 'fullness',
      depth: 'deep-pressure', spread: 'pinpoint', note: '', p: [-0.25, 0.5, -0.125], n: [1, 0, 0]
    })
  ], [migraine, sinus]);
  ep.camera = { theta: 1.234, phi: 0.876, dist: 3.25 };
  ep.impact = {
    frequency: 'daily', duration: 'days', blocked: ['drive', 'sleep'],
    symptoms: ['aura'], relief: ['dark', 'quiet'], daysLost: 9
  };
  return ep;
}

const linkRoundTrip = ep => episodeFromUrlPayload(
  JSON.parse(base64UrlDecode(base64UrlEncode(JSON.stringify(serializeForUrl(zoneIndexOf))))),
  zoneIdAt
);

beforeEach(freshState);

// ---------------------------------------------------------------------------
// Share links: encoding
// ---------------------------------------------------------------------------

test('a note with a curly apostrophe, an emoji and CJK survives the whole share-link round trip', () => {
  // The regression: btoa speaks Latin-1 only, so this note used to throw
  // InvalidCharacterError out of the click handler and leave "Copy share link"
  // dead with no toast. iOS types that apostrophe by default.
  const note = 'It’s a 9/10 \u{1F92F}\u{1F92F}\u{1F92F} 頭痛がひどい';
  const ep = richEpisode();
  ep.markers[0].note = note;
  ep.title = 'Mañana: “左側” pain';
  install(ep);

  const json = JSON.stringify(serializeForUrl(zoneIndexOf));
  // The url-safe alphabet swap can only be tested by a payload whose plain
  // base64 actually contains the characters it swaps, and that depends on where
  // the emoji bytes land. This fixture forces all three; if a change to the
  // payload format shifts the alignment, THIS line fails rather than the next
  // one quietly checking nothing. (Three of these emoji, not one, for exactly
  // that reason.)
  const plain = Buffer.from(json, 'utf8').toString('base64');
  for (const ch of ['+', '/', '=']) {
    assert.ok(plain.includes(ch), `the fixture no longer produces a "${ch}", so the next assertion is vacuous`);
  }

  const encoded = base64UrlEncode(json);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/,
    'the payload rides in a URL hash; +, / or = would need escaping the app never does');

  const back = episodeFromUrlPayload(JSON.parse(base64UrlDecode(encoded)), zoneIdAt);
  assert.equal(back.markers[0].note, note, 'the note came back mangled or truncated');
  assert.equal(back.title, ep.title);
});

test('base64UrlEncode writes real base64url, and decoding it returns the exact bytes at every padding length', () => {
  // Honest about what this can and cannot catch. Padding is stripped on the way
  // out and reconstructed on the way in, but atob is WHATWG forgiving-base64
  // and accepts unpadded input, so *deleting* the reconstruction is invisible;
  // padding that is wrong (`repeat(pad)` instead of `repeat(4 - pad)`) is not,
  // and that is the off-by-one that corrupts only some notes. Node's own
  // base64url is the reference for the rest of the alphabet, so a lost +// swap
  // or a kept = shows up as a difference rather than as a coincidence.
  for (let len = 0; len < 12; len++) {
    const s = 'é’\u{1F92F}'.repeat(1) + 'a'.repeat(len);
    const reference = Buffer.from(s, 'utf8').toString('base64url');
    assert.equal(base64UrlEncode(s), reference, `length ${len} did not encode to base64url`);
    assert.equal(base64UrlDecode(base64UrlEncode(s)), s, `length ${len} did not survive`);
    assert.equal(base64UrlDecode(reference), s, `length ${len}: a link minted by another base64url writer must open`);
  }
});

// ---------------------------------------------------------------------------
// Share links: the cap
// ---------------------------------------------------------------------------

test('serializeForUrl stops at twelve markers, keeping the first ones in order', () => {
  // Twelve is stated once, here, as what the link actually carried: raising the
  // cap lengthens every share link, and a URL that a chat app or an email
  // client truncates is a map that silently fails to open. Change it
  // deliberately, not by drift. (Asserting URL_MARKER_CAP === 12 as well would
  // only restate the source; the fixture is sized off the constant so the test
  // stays three points over whatever the cap is.)
  const g = defaultGroup({ name: 'Pain' }, []);
  const markers = Array.from({ length: URL_MARKER_CAP + 3 }, (_, i) =>
    defaultMarker({ zoneId: 'temple-left', groupId: g.id, note: `p${i}` }));
  install(defaultEpisode('Many', markers, [g]));

  const payload = serializeForUrl(zoneIndexOf);
  assert.equal(payload.m.length, 12, '15 points went in; the link must carry 12');
  assert.deepEqual(payload.m.map(r => r[11]),
    ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'],
    'the link kept the wrong twelve, or reordered them');
  assert.equal(shareWouldTruncate(), markers.length - payload.m.length,
    'the warning and the serializer must count off the same cap, or the number the user is shown is a lie');
});

test('with no episode open there is nothing to serialize, and serializeForUrl says so rather than throwing', () => {
  state.episodes = [];
  state.activeEpisodeId = null;
  assert.equal(serializeForUrl(zoneIndexOf), null,
    'the share handler reads .m off this; a throw here leaves the button dead with no toast');
});

test('shareWouldTruncate names exactly how many points a link would drop', () => {
  const g = defaultGroup({ name: 'Pain' }, []);
  const withMarkers = n => install(defaultEpisode('N', Array.from({ length: n }, () =>
    defaultMarker({ zoneId: 'temple-left', groupId: g.id })), [g]));

  withMarkers(15);
  assert.equal(shareWouldTruncate(), 3, 'the warning must state the real number left out');
  withMarkers(13);
  assert.equal(shareWouldTruncate(), 1, 'one over the cap is still worth warning about');
  withMarkers(12);
  assert.equal(shareWouldTruncate(), 0, 'exactly at the cap nothing is lost, so no warning');
  withMarkers(1);
  assert.equal(shareWouldTruncate(), 0);

  state.episodes = [];
  state.activeEpisodeId = null;
  assert.equal(shareWouldTruncate(), 0, 'with no episode at all it must answer 0, not throw');
});

// ---------------------------------------------------------------------------
// Share links: round trips
// ---------------------------------------------------------------------------

test('every marker field survives a share link, so a shared map means what it meant', () => {
  const ep = install(richEpisode());
  const back = linkRoundTrip(ep);

  assert.equal(back.markers.length, 2);
  for (let i = 0; i < 2; i++) {
    const before = ep.markers[i];
    const after = back.markers[i];
    for (const field of ['zoneId', 'intensity', 'depth', 'quality', 'spread', 'note']) {
      assert.deepEqual(after[field], before[field], `marker ${i} lost ${field}`);
    }
    assert.deepEqual(after.p, before.p, `marker ${i} lost its position`);
    assert.deepEqual(after.n, before.n, `marker ${i} lost its surface normal`);
  }
  assert.equal(back.markers[1].quality, 'fullness');
  assert.equal(back.markers[0].zoneId, 'temple-left',
    'the zone index is resolved back through the registry, not carried as a string');
});

test('pains keep their name, colour, pattern and condition across a share link', () => {
  const ep = install(richEpisode());
  const payload = serializeForUrl(zoneIndexOf);
  assert.equal(payload.g[0][3], patternIndexOf('star'), 'the pattern rides as its index, not its id');

  const back = linkRoundTrip(ep);
  assert.deepEqual(back.groups.map(g => g.name), ['Migraine', 'Sinus']);
  assert.deepEqual(back.groups.map(g => g.color), ['#38bdf8', '#fbbf24']);
  assert.deepEqual(back.groups.map(g => g.pattern), ['star', 'grid'],
    'pattern is the channel a greyscale or colour-blind reader uses; losing it merges two pains');
  assert.deepEqual(back.groups.map(g => g.conditionId), ['migraine', null]);
});

test('a marker still belongs to the same pain on the far side of a share link', () => {
  const ep = install(richEpisode());
  const back = linkRoundTrip(ep);
  const nameOf = m => back.groups.find(g => g.id === m.groupId)?.name;
  assert.deepEqual(back.markers.map(nameOf), ['Migraine', 'Sinus'],
    'markerColor() resolves through the group with no fallback, so a crossed reference paints the wrong hue');
});

test('camera and impact ride along in the link, so a shared map opens at the angle it was drawn from', () => {
  const ep = install(richEpisode());
  const payload = serializeForUrl(zoneIndexOf);
  assert.equal(payload.i.length, 6, 'impact packs into a fixed 6-element tuple');

  const back = linkRoundTrip(ep);
  assert.equal(back.camera.theta, 1.234);
  assert.equal(back.camera.phi, 0.876);
  assert.equal(back.camera.dist, 3.25);
  assert.deepEqual(back.impact, ep.impact, 'the half of a consultation the map cannot carry was dropped');
});

test('positions are rounded to three decimals, which is what keeps a link inside a URL', () => {
  const g = defaultGroup({ name: 'Pain' }, []);
  install(defaultEpisode('Precise', [defaultMarker({
    zoneId: 'temple-left', groupId: g.id, p: [0.123456789, -0.987654321, 0.5], n: [0.111222333, 0, 0]
  })], [g]));
  const row = serializeForUrl(zoneIndexOf).m[0];
  assert.deepEqual(row.slice(1, 7), [0.123, -0.988, 0.5, 0.111, 0, 0]);
});

test('an episode-shaped object out of persist.js always carries a camera you can point at a head', () => {
  // plainEpisode() once omitted it and the boot reported the failure as an
  // unsupported browser. "Has a camera" is not enough to check: a camera of
  // NaN, or at distance 0, is a black screen with no error either. So this
  // asserts a camera the orbit controls can actually start from, for every way
  // a c[] can arrive broken, which is persist.js's own fallback, not
  // state.js's default.
  const usable = (cam, why) => {
    assert.ok(cam, `${why}: no camera at all`);
    assert.ok([cam.theta, cam.phi, cam.dist].every(Number.isFinite), `${why}: a NaN camera renders nothing`);
    assert.ok(cam.dist > 0, `${why}: distance 0 puts the eye inside the head`);
    assert.ok(cam.phi > 0 && cam.phi < Math.PI, `${why}: phi at a pole degenerates the up vector`);
  };

  for (const c of [undefined, null, 'nope', 42, [], [null, null, null], ['a', 'b', 'c'], [0, 0, 0]]) {
    usable(episodeFromUrlPayload({ v: 2, t: 'Bad camera', c, g: [], m: [] }, zoneIdAt).camera,
      `c: ${JSON.stringify(c) ?? 'undefined'}`);
  }
  // A string indexes like an array, so reading c[0..2] off one yields three
  // characters and an angle nobody ever drew from. Compared against the
  // no-camera default rather than against literals, so this stays a claim about
  // behaviour and not a copy of the numbers in state.js.
  const noCamera = episodeFromUrlPayload({ v: 2, t: 'No c at all', g: [], m: [] }, zoneIdAt).camera;
  assert.deepEqual(episodeFromUrlPayload({ v: 2, t: 'Camera as text', c: '123', g: [], m: [] }, zoneIdAt).camera,
    noCamera, 'a string is not a camera');

  // ...and a c[] that is fine is still honoured, so "ignore it always" is not a
  // way to pass any of this.
  assert.equal(episodeFromUrlPayload({ v: 2, t: 'Good camera', c: [1.5, 1.1, 3.2], g: [], m: [] }, zoneIdAt).camera.dist, 3.2);

  install(richEpisode());
  const json = JSON.parse(JSON.stringify(episodeToJson(state.episodes[0])));
  resetModel();
  importJson(json);
  usable(state.episodes[0].camera, 'a JSON file carries no camera at all');
});

// ---------------------------------------------------------------------------
// Share links: old payloads and bad payloads
// ---------------------------------------------------------------------------

test('a link written before pains carried patterns still gives every pain a distinct pattern', () => {
  // Three-element group tuples: [name, colourIndex, conditionId]. The pattern
  // falls back to the twin of the colour slot so an old link still renders two
  // pains a greyscale reader can tell apart. 'Fourth' is the row that matters:
  // its colour slot (5) and its position (3) disagree, so it is the only row
  // that can tell the colour-slot pairing apart from "just use the position".
  const back = episodeFromUrlPayload({
    v: 2,
    t: 'Old link',
    g: [['Migraine', 0, ''], ['Sinus', 1, ''], ['Third', -1, ''], ['Fourth', 5, '']],
    m: []
  }, zoneIdAt);

  const patterns = back.groups.map(g => g.pattern);
  assert.ok(patterns.every(isPattern), `old link produced a pattern nothing can draw: ${patterns}`);
  assert.equal(new Set(patterns).size, 4, 'two pains ended up with the same shape');
  assert.equal(patterns[0], patternAt(0));
  assert.equal(patterns[1], patternAt(1));
  assert.equal(patterns[2], patternAt(2), 'a colour index of -1 falls back to the position in the list');
  assert.equal(patterns[3], patternAt(5),
    'a pain keeps the shape twinned with its colour, not the one twinned with where it sits in the list');
});

test('episodeFromUrlPayload refuses a payload it cannot trust rather than building half an episode', () => {
  for (const bad of [null, undefined, {}, 'garbage', 42, [], { v: 1, g: [], m: [] }, { v: 3, g: [], m: [] }, { v: '2', g: [], m: [] }]) {
    assert.equal(episodeFromUrlPayload(bad, zoneIdAt), null, `accepted ${JSON.stringify(bad)}`);
  }
});

test('loadFromUrlPayload leaves the live model untouched when the payload is junk', () => {
  const before = state.episodes[0].id;
  assert.equal(loadFromUrlPayload({ v: 1 }, zoneIdAt), false);
  assert.equal(state.episodes[0].id, before, 'a bad hash must not wipe what is on screen');
  assert.equal(state.shared, false, 'nothing was opened, so nothing is being viewed read-only');
});

test('a truncated marker row is dropped rather than restored with NaN coordinates', () => {
  const back = episodeFromUrlPayload({
    v: 2,
    t: 'Half a row',
    g: [['Pain', 0, '', 0]],
    m: [
      [zoneIndexOf('temple-left'), 0],                                           // truncated to nothing
      [zoneIndexOf('temple-left'), 0, 0, 1],                                     // too short
      [zoneIndexOf('temple-left'), 0, 0, 1, 0, 0, 1, 6, 0, -1, 1, 'kept', 0]     // whole
    ]
  }, zoneIdAt);
  assert.equal(back.markers.length, 1, 'a short row produced a marker with NaN in its position');
  assert.equal(back.markers[0].note, 'kept');
  // Across *every* restored marker, not just the one that was never at risk:
  // the two-element row is the one whose p would come back [0, NaN, NaN] if a
  // relaxed filter ever let it through, and a NaN vertex takes the whole 3D
  // scene down, not just its own point.
  assert.ok(back.markers.flatMap(m => [...m.p, ...m.n]).every(Number.isFinite),
    'a restored coordinate is not a number');
});

test('a restored share link leaves no marker without a pain, even when the payload says group -1', () => {
  const back = episodeFromUrlPayload({
    v: 2,
    t: 'Loose points',
    g: [['Migraine', 0, '', 0]],
    m: [
      [zoneIndexOf('temple-left'), 0, 0, 1, 0, 0, 1, 7, 0, -1, 1, 'loose', -1],
      [zoneIndexOf('vertex-center'), 0, 1, 0, 0, 1, 0, 4, 0, -1, 1, 'also loose', -1],
      [zoneIndexOf('temple-right'), 1, 0, 0, 1, 0, 0, 5, 0, -1, 1, 'grouped', 0]
    ]
  }, zoneIdAt);

  assert.deepEqual(back.markers.map(m => m.zoneId), ['temple-left', 'vertex-center', 'temple-right'],
    'the zone index survives the trip through the registry in both directions');

  const ids = new Set(back.groups.map(g => g.id));
  for (const m of back.markers) {
    assert.ok(m.groupId, `"${m.note}" came back with no pain at all`);
    assert.ok(ids.has(m.groupId), `"${m.note}" points at a pain that is not in the episode`);
  }
  assert.ok(back.groups.some(g => g.name === ORPHAN_PAIN_NAME),
    'loose points are adopted into one named pain, not scattered');
  assert.equal(back.markers[0].groupId, back.markers[1].groupId,
    'both loose points belong in one adopted pain, not one new pain each');
  assert.equal(back.markers[2].groupId, back.groups[0].id, 'a point that named its pain must keep it');
});

// ---------------------------------------------------------------------------
// JSON files
// ---------------------------------------------------------------------------

test('a JSON file round-trips an episode including pattern and impact', () => {
  const ep = install(richEpisode());
  // A fixed date in the past, not the fixture's own timestamp: two fresh
  // new Date() reads land in the same millisecond, so comparing against one
  // would hold even if the import stamped today over the file's date.
  ep.createdAt = '2024-03-01T09:15:00.000Z';
  const file = JSON.parse(JSON.stringify(episodeToJson(ep))); // through disk, as a file really goes
  assert.equal(file.kind, 'headmap-episode');
  assert.equal(file.headmapVersion, 2);

  resetModel();
  assert.equal(importJson(file), 1);
  const back = state.episodes[0];

  assert.equal(back.title, 'Bad week');
  assert.equal(back.createdAt, '2024-03-01T09:15:00.000Z',
    'when the episode happened is the point of a diary; re-dating it to today loses the history');
  assert.deepEqual(back.groups.map(g => [g.name, g.color, g.pattern, g.conditionId]),
    [['Migraine', '#38bdf8', 'star', 'migraine'], ['Sinus', '#fbbf24', 'grid', null]]);
  assert.deepEqual(back.impact, ep.impact);
  assert.deepEqual(
    back.markers.map(m => [m.zoneId, m.intensity, m.depth, m.quality, m.spread, m.note]),
    ep.markers.map(m => [m.zoneId, m.intensity, m.depth, m.quality, m.spread, m.note]));
  assert.deepEqual(back.markers.map(m => m.p), ep.markers.map(m => m.p));
});

test('a JSON file carries three-decimal coordinates, not the seventeen a float prints', () => {
  const g = defaultGroup({ name: 'Pain' }, []);
  const ep = install(defaultEpisode('Precise', [defaultMarker({
    zoneId: 'temple-left', groupId: g.id,
    p: [0.1234567890123456, -0.9876543210987654, 0.5], n: [0.1112223334445556, 0, 0]
  })], [g]));

  const file = episodeToJson(ep);
  assert.deepEqual(file.markers[0].position, [0.123, -0.988, 0.5],
    'a whole-diary export is a file someone emails; seventeen digits per axis is noise below the model\'s own precision');
  assert.deepEqual(file.markers[0].normal, [0.111, 0, 0]);
});

test('a file naming a depth, quality or spread the app does not have falls back instead of poisoning the model', () => {
  // A hand-edited file, or one from a future version. depthById() and
  // spreadById() silently substitute their first entry when they cannot find
  // an id, so an unknown value renders as something the model does not say it
  // is, the editor's select shows nothing chosen, and the condition matcher
  // stops seeing the point at all. Cheaper to refuse it at the door.
  assert.equal(importJson({
    kind: 'headmap-episode',
    headmapVersion: 2,
    title: 'Edited by hand',
    groups: [{ id: 'g1', name: 'Pain', color: '#f43f5e', pattern: 'solid', condition: null }],
    markers: [{
      zone: 'temple-left', position: [0, 0, 1], normal: [0, 0, 1], intensity: 6, group: 'g1',
      depth: 'sideways', quality: 'made-up', spread: 'enormous'
    }]
  }), 1);

  const m = state.episodes[0].markers[0];
  assert.equal(m.depth, 'surface', 'an unknown depth must land on the default, not in the model');
  assert.equal(m.quality, null, 'an unknown quality must read as "not said", not as a quality nothing can label');
  assert.equal(m.spread, 'small', 'an unknown spread must land on the default, not in the model');
});

test('imported group ids are remapped, so a marker follows its own pain and not a stranger', () => {
  const ep = install(richEpisode());
  const file = JSON.parse(JSON.stringify(episodeToJson(ep)));
  resetModel();
  importJson(file);
  const back = state.episodes[0];

  assert.ok(back.groups.every(g => !ep.groups.some(o => o.id === g.id)),
    'the file\'s ids were reused, so importing the same file twice would cross-link the two copies');
  assert.equal(back.markers[0].groupId, back.groups[0].id);
  assert.equal(back.markers[1].groupId, back.groups[1].id);
  assert.equal(state.activeGroupId, back.groups[0].id, 'new points must land in a pain that exists');
});

test('an imported marker whose pain is missing from the file is adopted rather than left loose', () => {
  const imported = importJson({
    kind: 'headmap-episode',
    headmapVersion: 2,
    title: 'Dangling',
    groups: [{ id: 'g-known', name: 'Known', color: '#f43f5e', pattern: 'solid', condition: null }],
    markers: [
      { zone: 'temple-left', position: [0, 0, 1], normal: [0, 0, 1], intensity: 8, group: 'g-known' },
      { zone: 'vertex-center', position: [0, 1, 0], normal: [0, 1, 0], intensity: 2, group: 'g-vanished' }
    ]
  });
  assert.equal(imported, 1);
  const ep = state.episodes[0];
  const ids = new Set(ep.groups.map(g => g.id));
  assert.ok(ep.markers.every(m => ids.has(m.groupId)), 'a dangling groupId paints the wrong hue');
  assert.ok(ep.groups.some(g => g.name === ORPHAN_PAIN_NAME));
});

test('importJson returns 0 for a foreign file and for a file with no markers array', () => {
  const before = state.episodes.length;
  const rejected = [
    null,
    undefined,
    {},
    'not a file',
    { kind: 'headmap-export' },                                        // no episodes
    { kind: 'headmap-export', episodes: [] },                          // empty export
    { kind: 'some-other-tool', episodes: [{ markers: [] }] },          // foreign
    { kind: 'headmap-episode', title: 'No points' },                   // no markers array
    { kind: 'headmap-episode', title: 'Wrong shape', markers: 'lots' } // markers not an array
  ];
  for (const payload of rejected) {
    assert.equal(importJson(payload), 0, `imported ${JSON.stringify(payload)}`);
  }
  assert.equal(state.episodes.length, before, 'a rejected file still pushed an episode');
});

test('a whole-diary export re-imports every episode it carried', () => {
  install(richEpisode());
  state.episodes.push(defaultEpisode('Second', [], []));
  const file = JSON.parse(JSON.stringify(allToJson()));
  assert.equal(file.kind, 'headmap-export');
  assert.equal(file.episodes.length, 2);

  resetModel();
  assert.equal(importJson(file), 2);
  assert.deepEqual(state.episodes.slice(0, 2).map(e => e.title).sort(), ['Bad week', 'Second']);
});

test('an episode with nothing filled in writes a null impact and reads back as an empty one', () => {
  const ep = install(defaultEpisode('Blank', [defaultMarker({ zoneId: 'temple-left' })], []));
  assert.equal(episodeToJson(ep).impact, null, 'an untouched impact must not look answered in the file');

  const file = JSON.parse(JSON.stringify(episodeToJson(ep)));
  resetModel();
  importJson(file);
  assert.deepEqual(state.episodes[0].impact, emptyImpact(),
    'a null impact must become the empty record, not undefined');
});

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

test('saveToStorage and loadFromStorage round-trip the diary, the active episode and the view', () => {
  const ep = install(richEpisode());
  state.episodes.push(defaultEpisode('Older', [], []));
  state.view = 'xray';
  saveToStorage();

  resetModel();
  assert.equal(loadFromStorage(), true);
  assert.deepEqual(state.episodes.map(e => e.title), ['Bad week', 'Older']);
  assert.equal(state.activeEpisodeId, ep.id, 'the diary reopened on a different episode than it was left on');
  assert.equal(state.view, 'xray');
  assert.deepEqual(state.episodes[0].impact, ep.impact);
  assert.deepEqual(state.episodes[0].groups.map(g => g.pattern), ['star', 'grid']);
  assert.equal(state.episodes[0].markers[0].note, 'behind the eye');
  assert.equal(state.activeGroupId, state.episodes[0].groups[0].id);
});

test('loadFromStorage refuses absent, corrupt, wrong-version and empty data without touching the live model', () => {
  // Returning false is only half of it. "Refused cleanly" and "assigned the
  // stored rubbish over the live episodes, then threw, and the catch turned
  // that into a false" are the same boolean and very different mornings, so
  // every leg checks what is still on screen afterwards.
  const before = state.episodes[0].id;
  const refuses = why => {
    assert.equal(loadFromStorage(), false, why);
    assert.equal(state.episodes.length, 1, `${why}: the live diary was replaced by a payload that was then rejected`);
    assert.equal(state.episodes[0].id, before, `${why}: what was on screen is gone`);
  };

  refuses('nothing stored');

  localStorage.setItem(STORAGE_KEY, '{ not json at all');
  refuses('corrupt JSON must not throw out of the boot');

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, episodes: [{ id: 'a', title: 't', groups: [], markers: [] }] }));
  refuses('a v1 diary is not readable as v2');

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, episodes: [] }));
  refuses('an empty episode list is nothing to restore');

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, episodes: 'nope' }));
  refuses('an episodes field that is not a list');
});

test('a stored diary with a view the app does not have opens in the normal view, with nothing selected', () => {
  install(richEpisode());
  state.view = 'xray';
  saveToStorage();
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  stored.view = 'x-ray, please';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  resetModel();
  state.view = 'xray';
  state.selectedMarkerId = 'm-from-the-session-before';
  assert.equal(loadFromStorage(), true);
  assert.equal(state.view, 'normal',
    'the view is a two-way switch the UI paints from; a third value leaves the toggle disagreeing with the scene');
  assert.equal(state.selectedMarkerId, null,
    'a selection from before the reload names a marker that is not on screen, so the editor opens on nothing');
});

test('a full or blocked localStorage costs the session its save, not the session', () => {
  install(richEpisode());
  saveToStorage();
  const snapshot = localStorage.getItem(STORAGE_KEY);

  const realSetItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    state.episodes[0].title = 'An edit that cannot be stored';
    assert.doesNotThrow(saveToStorage,
      'every edit calls this; a quota error escaping here takes out the handler that made the edit');
  } finally {
    localStorage.setItem = realSetItem;
  }

  assert.equal(localStorage.getItem(STORAGE_KEY), snapshot,
    'the last diary that did fit must still be there to reload');
});

test('loadFromStorage falls back to the first episode when the stored active id is gone', () => {
  install(richEpisode());
  saveToStorage();
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  stored.activeEpisodeId = 'ep-deleted-long-ago';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  resetModel();
  assert.equal(loadFromStorage(), true);
  assert.equal(state.activeEpisodeId, state.episodes[0].id,
    'a dangling active id leaves activeEpisode() falling through to episodes[0] anyway; make it explicit');
});

test('opening a shared link never overwrites the local diary', () => {
  const mine = install(defaultEpisode('My diary', [], []));
  saveToStorage();
  const snapshot = localStorage.getItem(STORAGE_KEY);

  const opened = loadFromUrlPayload({
    v: 2, t: 'Their map', c: [0.5, 1.2, 4], i: null,
    g: [['Theirs', 0, '', 1]],
    m: [[zoneIndexOf('temple-left'), 0, 0, 1, 0, 0, 1, 6, 0, -1, 1, 'hi', 0]]
  }, zoneIdAt);

  assert.equal(opened, true);
  assert.equal(state.shared, true, 'a shared map is somebody else\'s; saving it over the diary loses episodes');
  assert.deepEqual(state.episodes.map(e => e.title), ['Their map']);
  assert.equal(state.selectedMarkerId, state.episodes[0].markers[0].id);

  saveToStorage();
  assert.equal(localStorage.getItem(STORAGE_KEY), snapshot,
    'saveToStorage wrote while a shared link was open, destroying the diary underneath it');

  resetModel();
  assert.equal(loadFromStorage(), true);
  assert.equal(state.episodes[0].title, 'My diary');
  assert.equal(state.episodes[0].id, mine.id);
});

test('absorbShared puts the stored diary back underneath the shared map, then saving resumes', () => {
  install(defaultEpisode('My diary', [], []));
  saveToStorage();

  loadFromUrlPayload({
    v: 2, t: 'Their map', c: [0.5, 1.2, 4], i: null,
    g: [['Theirs', 0, '', 1]],
    m: [[zoneIndexOf('temple-left'), 0, 0, 1, 0, 0, 1, 6, 0, -1, 1, 'hi', 0]]
  }, zoneIdAt);

  absorbShared();
  assert.equal(state.shared, false, 'the map is now the user\'s to edit, so saving must resume');
  assert.deepEqual(state.episodes.map(e => e.title), ['Their map', 'My diary'],
    'the diary was not restored underneath the shared map');

  saveToStorage();
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.deepEqual(stored.episodes.map(e => e.title), ['Their map', 'My diary']);
});

test('absorbShared does not read storage at all when no shared map is open', () => {
  // The stored diary here is deliberately NOT the one on screen: with the same
  // episode in both places the id dedupe hides a missing guard, and the test
  // can then only fail if the dedupe itself breaks. A second, unrelated
  // episode appearing means storage was read on a normal edit, which would
  // resurrect episodes the user deleted in this very session.
  const mine = install(defaultEpisode('On screen', [], []));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 2,
    activeEpisodeId: 'ep-stored',
    episodes: [{ id: 'ep-stored', title: 'Deleted earlier today', groups: [], markers: [] }]
  }));

  absorbShared();
  assert.deepEqual(state.episodes.map(e => e.title), ['On screen'],
    'absorbShared re-read storage while not shared and merged a diary nobody asked for');
  assert.deepEqual(state.episodes.map(e => e.id), [mine.id]);
});

test('absorbShared keeps the shared map when the stored diary is unreadable', () => {
  // The corrupt-JSON leg is a *double* canary and cannot be made sharper:
  // safeJsonParse and the try/catch around it each swallow the throw on their
  // own, so only losing both turns it red. The v1 leg is the discriminating
  // one: drop the version check and an unmigrated v1 diary gets merged in
  // underneath the shared map.
  const unreadable = [
    ['{{{ not json', 'corrupt JSON'],
    [JSON.stringify({ v: 1, episodes: [{ id: 'ep-v1', title: 'A v1 diary', groups: [], markers: [] }] }), 'a v1 diary'],
    [JSON.stringify({ v: 2, episodes: 'nope' }), 'an episodes field that is not a list']
  ];

  for (const [stored, why] of unreadable) {
    freshState();
    loadFromUrlPayload({
      v: 2, t: 'Their map', c: [0, 1.2, 4], i: null, g: [['Theirs', 0, '', 1]],
      m: [[zoneIndexOf('temple-left'), 0, 0, 1, 0, 0, 1, 6, 0, -1, 1, 'hi', 0]]
    }, zoneIdAt);
    localStorage.setItem(STORAGE_KEY, stored);

    absorbShared();
    assert.equal(state.shared, false, `${why}: saving must resume even when there was no diary to restore`);
    assert.deepEqual(state.episodes.map(e => e.title), ['Their map'],
      `${why}: the shared map on screen was lost, or half a diary was merged into it`);
  }
});

// ---------------------------------------------------------------------------
// Library patterns: the other read-only map
// ---------------------------------------------------------------------------

test('a pattern opened from the library is read-only too, so reading about cluster headache cannot eat the diary', () => {
  const mine = install(defaultEpisode('My diary', [], []));
  saveToStorage();
  const snapshot = localStorage.getItem(STORAGE_KEY);
  state.selectedMarkerId = 'm-from-my-own-map';

  const g = defaultGroup({ name: 'Cluster' }, []);
  const lesson = defaultEpisode('Cluster headache', [
    defaultMarker({ zoneId: 'behind-eye-left', groupId: g.id, intensity: 9 })
  ], [g]);

  assert.equal(loadLearnEpisode(lesson), true);
  assert.equal(state.shared, true,
    'a library pattern is somebody else\'s map; saving it over the diary loses every episode underneath it');
  assert.deepEqual(state.episodes.map(e => e.title), ['Cluster headache']);
  assert.equal(state.selectedMarkerId, null, 'a map opened for reading opens with nothing selected');
  assert.equal(state.activeGroupId, g.id, 'a point added on top of a pattern must land in a pain that exists');

  saveToStorage();
  assert.equal(localStorage.getItem(STORAGE_KEY), snapshot,
    'the library pattern was written over the diary');

  resetModel();
  assert.equal(loadFromStorage(), true);
  assert.equal(state.episodes[0].id, mine.id, 'the diary did not survive a trip to the pattern library');
});

test('loadLearnEpisode refuses an episode that is not there rather than blanking the screen', () => {
  const mine = install(defaultEpisode('My diary', [], []));
  for (const nothing of [null, undefined]) {
    assert.equal(loadLearnEpisode(nothing), false);
  }
  assert.deepEqual(state.episodes.map(e => e.id), [mine.id], 'a missing pattern emptied the workspace');
  assert.equal(state.shared, false, 'nothing was opened, so saving must not be blocked from here on');
});

// ---------------------------------------------------------------------------
// Migration of stored data
// ---------------------------------------------------------------------------

test('a stored diary from before patterns existed comes back with a distinct pattern per pain', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 2,
    activeEpisodeId: 'ep-legacy',
    view: 'normal',
    episodes: [{
      id: 'ep-legacy',
      title: 'Old',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      groups: [
        { id: 'g1', name: 'Migraine', color: '#f43f5e' },
        { id: 'g2', name: 'Sinus', color: '#38bdf8' }
      ],
      markers: [{ id: 'm1', zoneId: 'temple-left', p: [0, 0, 1], n: [0, 0, 1], intensity: 7, groupId: 'g1' }]
    }]
  }));

  assert.equal(loadFromStorage(), true);
  const ep = state.episodes[0];
  const patterns = ep.groups.map(g => g.pattern);
  assert.ok(patterns.every(isPattern), `migration produced a pattern nothing can draw: ${patterns}`);
  assert.equal(new Set(patterns).size, patterns.length, 'two pains migrated to the same shape');
  assert.ok(ep.camera, 'a stored episode from before cameras must still get one');
  assert.deepEqual(ep.impact, emptyImpact());
});

test('a stored marker with no pain is adopted on the way in, so no point renders the fallback hue', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 2,
    activeEpisodeId: 'ep-legacy',
    episodes: [{
      id: 'ep-legacy',
      title: 'Loose points',
      groups: [{ id: 'g1', name: 'Migraine', color: '#f43f5e' }],
      markers: [
        { id: 'm1', zoneId: 'temple-left', p: [0, 0, 1], n: [0, 0, 1], intensity: 7, groupId: null },
        { id: 'm2', zoneId: 'vertex-center', p: [0, 1, 0], n: [0, 1, 0], intensity: 3, groupId: 'g-deleted' },
        { id: 'm3', zoneId: 'temple-right', p: [1, 0, 0], n: [1, 0, 0], intensity: 5, groupId: 'g1' }
      ]
    }]
  }));

  assert.equal(loadFromStorage(), true);
  const ep = state.episodes[0];
  const ids = new Set(ep.groups.map(g => g.id));
  assert.ok(ep.markers.every(m => m.groupId && ids.has(m.groupId)),
    'a marker survived load with no pain; markerColor() would paint it the first palette hue');
  assert.ok(ep.groups.some(g => g.name === ORPHAN_PAIN_NAME));
  assert.equal(ep.markers[2].groupId, 'g1', 'a point that already had a pain must keep it');
  assert.equal(ep.markers[0].groupId, ep.markers[1].groupId,
    'both loose points belong in the same adopted pain, not one each');
});

test('a stored pain whose colour is off-palette is repaired instead of rendering as nothing', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 2,
    activeEpisodeId: 'ep-x',
    episodes: [{
      id: 'ep-x',
      title: 'Odd colours',
      groups: [
        { id: 'g1', name: 'A', color: 'rebeccapurple' },
        { id: 'g2', name: 'B', color: null }
      ],
      markers: [{ id: 'm1', zoneId: 'temple-left', p: [0, 0, 1], n: [0, 0, 1], intensity: 4, groupId: 'g2' }]
    }]
  }));

  assert.equal(loadFromStorage(), true);
  const colors = state.episodes[0].groups.map(g => g.color);
  assert.ok(colors.every(c => GROUP_COLORS.includes(c)),
    `hexToRgb() would choke on ${colors.find(c => !GROUP_COLORS.includes(c))}`);
});

test('a stored group with no id or no name is discarded and its points re-adopted', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: 2,
    activeEpisodeId: 'ep-x',
    episodes: [{
      id: 'ep-x',
      title: 'Broken groups',
      groups: [{ name: 'No id', color: '#f43f5e' }, { id: 'g2', color: '#38bdf8' }],
      markers: [{ id: 'm1', zoneId: 'temple-left', p: [0, 0, 1], n: [0, 0, 1], intensity: 4, groupId: 'g2' }]
    }]
  }));

  assert.equal(loadFromStorage(), true);
  const ep = state.episodes[0];
  assert.ok(ep.groups.every(g => g.id && typeof g.name === 'string' && g.name),
    'a pain with no id cannot be selected, isolated or deleted');
  const ids = new Set(ep.groups.map(g => g.id));
  assert.ok(ep.markers.every(m => ids.has(m.groupId)));
});

// ---------------------------------------------------------------------------
// Fixed defect, kept pinned
// ---------------------------------------------------------------------------

// resetToDefaults() used to live in persist.js and call defaultState(), which
// is module-private to state.js: on the wrong side of the seam every call threw
//   ReferenceError: defaultState is not defined
// It now lives in state.js beside the function it needs. This pins the whole
// reset, not just the fact that it returns without throwing: a reset that
// leaves the previous diary, the shared flag, or a selection behind is the same
// silent failure by another route.
test('resetToDefaults puts the model back to one empty episode with nothing left over', () => {
  install(richEpisode());
  state.shared = true;
  state.selectedMarkerId = 'm-stale';
  state.isolateGroupId = 'g-stale';
  state.view = 'xray';

  resetToDefaults();

  assert.equal(state.episodes.length, 1, 'the old diary is still there');
  assert.equal(state.episodes[0].markers.length, 0, 'the fresh episode came back with somebody\'s points in it');
  assert.equal(state.activeEpisodeId, state.episodes[0].id);
  assert.equal(state.shared, false, 'a reset that stays "shared" can never save again');
  assert.equal(state.selectedMarkerId, null);
  assert.equal(state.isolateGroupId, null);
  assert.equal(state.view, 'normal');
});
