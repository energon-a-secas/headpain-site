// The seam between a published pattern and points on this model.
//
// presets.js turns "a condition described in conditions.js" into an episode the
// 3D view and embed.html can render with no app around them. Three things must
// hold on every path out of it: the episode carries a camera (omitting it once
// threw during boot, and the boot's catch reported a working browser as one that
// cannot do 3D), every marker resolves to a real group (markerColor() has no
// fallback, so a dangling groupId paints the wrong pain), and a zone this model
// does not carry is skipped rather than placed somewhere plausible but wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry } from './fixtures.mjs';
import {
  WHOLE_HEAD_SPOT, materializeSpots, shortName, conditionById, demoById,
  plainEpisode, episodeFromCondition, episodeFromDemo
} from '../js/presets.js';
import { CONDITIONS } from '../js/conditions.js';
import { DEMOS } from '../js/demos.js';
import { GROUP_COLORS } from '../js/groups.js';
import { isPattern } from '../js/patterns.js';

// The conditions the library offers a "map this" button for.
const MAPPABLE = CONDITIONS.filter(c => !c.notMappable && c.primary?.length);

// Two zone ids the model really carries, so a passing test means the app really
// renders something.
const ZONE_A = registry.zones[0].id;
const ZONE_B = registry.zones[1].id;

function assertCamera(ep, label) {
  assert.ok(ep, `${label}: produced no episode at all`);
  assert.ok(ep.camera, `${label}: no camera field; boot reads ep.camera.theta and would throw`);
  for (const k of ['theta', 'phi', 'dist']) {
    assert.equal(typeof ep.camera[k], 'number', `${label}: camera.${k} is not a number`);
    assert.ok(Number.isFinite(ep.camera[k]), `${label}: camera.${k} is ${ep.camera[k]}`);
  }
}

function assertNoOrphans(ep, label) {
  const ids = new Set(ep.groups.map(g => g.id));
  for (const m of ep.markers) {
    assert.ok(ids.has(m.groupId),
      `${label}: marker ${m.id} claims group "${m.groupId}", which this episode has no group for; markerColor() falls through to the first palette hue and the point renders as the wrong pain`);
  }
}

function assertGroupsWellFormed(ep, label) {
  for (const g of ep.groups) {
    assert.ok(g.name && g.name.trim().length > 0, `${label}: group ${g.id} has no name for the legend to print`);
    assert.ok(GROUP_COLORS.includes(g.color), `${label}: group ${g.id} colour ${g.color} is not a palette colour`);
    assert.ok(isPattern(g.pattern), `${label}: group ${g.id} pattern "${g.pattern}" is not in the pattern vocabulary, so greyscale readers get the solid fallback`);
  }
}

// ── camera: the regression that reported itself as an unsupported browser ────

test('plainEpisode always carries a camera with numeric theta/phi/dist', () => {
  const ep = plainEpisode('Direct', [{ name: 'One', markers: [{ zoneId: ZONE_A }] }], registry);
  assertCamera(ep, 'plainEpisode');
  assert.ok('impact' in ep, 'impact packs into the share tuple; an absent key is not the same as null');
});

test('episodeFromCondition carries a camera for every mappable condition', () => {
  assert.ok(MAPPABLE.length > 5, 'the library shrank to nothing; the loop below would be vacuous');
  for (const c of MAPPABLE) assertCamera(episodeFromCondition(c.id, registry), `condition ${c.id}`);
});

test('episodeFromDemo carries a camera for every demo', () => {
  assert.ok(DEMOS.length > 0);
  for (const d of DEMOS) assertCamera(episodeFromDemo(d.id, registry), `demo ${d.id}`);
});

// ── every marker belongs to a pain ──────────────────────────────────────────

test('no episode presets.js builds has an orphan marker', () => {
  let seen = 0;
  for (const c of MAPPABLE) {
    const ep = episodeFromCondition(c.id, registry);
    assertNoOrphans(ep, `condition ${c.id}`);
    seen += ep.markers.length;
  }
  for (const d of DEMOS) {
    const ep = episodeFromDemo(d.id, registry);
    assertNoOrphans(ep, `demo ${d.id}`);
    seen += ep.markers.length;
  }
  assert.ok(seen > 50, `only ${seen} markers checked; the orphan loops were nearly empty`);
});

test('marker and group ids stay unique across a multi-pain episode', () => {
  const ep = plainEpisode('Two', [
    { name: 'A', markers: [{ zoneId: ZONE_A }, { zoneId: ZONE_B }] },
    { name: 'B', markers: [{ zoneId: ZONE_A }, { zoneId: ZONE_B }] }
  ], registry);
  const markerIds = ep.markers.map(m => m.id);
  const groupIds = ep.groups.map(g => g.id);
  assert.equal(ep.markers.length, 4);
  assert.equal(new Set(markerIds).size, 4, 'two markers share an id; selecting one would select both');
  assert.equal(new Set(groupIds).size, 2);
});

// ── hue is identity, pattern is identity again ──────────────────────────────

test('every group presets.js builds has a name, a palette colour and a real pattern', () => {
  for (const c of MAPPABLE) assertGroupsWellFormed(episodeFromCondition(c.id, registry), `condition ${c.id}`);
  for (const d of DEMOS) assertGroupsWellFormed(episodeFromDemo(d.id, registry), `demo ${d.id}`);
});

test('two pains in one episode differ on both colour and pattern, not just hue', () => {
  const ep = plainEpisode('Two', [
    { name: 'A', markers: [{ zoneId: ZONE_A }] },
    { name: 'B', markers: [{ zoneId: ZONE_B }] }
  ], registry);
  assert.notEqual(ep.groups[0].color, ep.groups[1].color, 'both pains took the same hue');
  assert.notEqual(ep.groups[0].pattern, ep.groups[1].pattern,
    'both pains took the same pattern, so a greyscale or colour-blind reader cannot tell them apart');
});

test('the two-pain demo ships two distinguishable pains, since that is the thing it teaches', () => {
  const ep = episodeFromDemo('demo-combo', registry);
  assert.equal(ep.groups.length, 2);
  assert.notEqual(ep.groups[0].color, ep.groups[1].color);
  assert.notEqual(ep.groups[0].pattern, ep.groups[1].pattern);
  assert.ok(ep.markers.some(m => m.groupId === ep.groups[0].id));
  assert.ok(ep.markers.some(m => m.groupId === ep.groups[1].id), 'the second pain contributed no markers');
});

test('a colour outside the palette is replaced rather than stored', () => {
  const ep = plainEpisode('Odd', [{ name: 'A', color: '#123456', markers: [{ zoneId: ZONE_A }] }], registry);
  assert.ok(GROUP_COLORS.includes(ep.groups[0].color),
    'an off-palette colour reached the group; paint() would still render it but the legend swatch names would not match');
});

test('a palette colour a demo asks for is honoured exactly', () => {
  const ep = plainEpisode('Asked', [{ name: 'A', color: GROUP_COLORS[4], pattern: 'grid', markers: [{ zoneId: ZONE_A }] }], registry);
  assert.equal(ep.groups[0].color, GROUP_COLORS[4]);
  assert.equal(ep.groups[0].pattern, 'grid');
});

// ── materializeSpots: the model is the authority on where a zone is ─────────

test('materializeSpots skips a zone this model does not carry instead of placing it at a default', () => {
  const out = materializeSpots(
    [{ zoneId: ZONE_A }, { zoneId: 'zone-that-does-not-exist' }, { zoneId: ZONE_B }],
    registry
  );
  assert.equal(out.length, 2, 'an unknown zone was materialized; it would land at a plausible but wrong spot');
  assert.deepEqual(out.map(m => m.zoneId), [ZONE_A, ZONE_B]);
  assert.deepEqual(out[0].p, registry.zoneById(ZONE_A).anchor, 'a carried zone did not take its own anchor');
  assert.deepEqual(out[0].n, registry.zoneById(ZONE_A).normal);
});

test('materializeSpots sends a virtual whole-head zone to WHOLE_HEAD_SPOT', () => {
  const [spot] = materializeSpots([{ zoneId: 'whole-head', intensity: 7 }], registry);
  assert.ok(spot, 'whole-head is a virtual zone the registry does carry; it must not be skipped');
  assert.deepEqual(spot.p, WHOLE_HEAD_SPOT.p);
  assert.deepEqual(spot.n, WHOLE_HEAD_SPOT.n);
  assert.equal(spot.intensity, 7, 'the rest of the marker must survive the position rewrite');
});

test('materializeSpots copies the anchor, so moving a marker cannot move the zone', () => {
  const before = [...registry.zoneById(ZONE_A).anchor];
  const [spot] = materializeSpots([{ zoneId: ZONE_A }], registry);
  spot.p[0] = 999;
  assert.deepEqual(registry.zoneById(ZONE_A).anchor, before,
    'the marker aliased the registry anchor; dragging one point would move the zone for every episode');
});

test('materializeSpots treats a missing marker list as empty, since a demo group may carry none', () => {
  assert.deepEqual(materializeSpots(undefined, registry), []);
  assert.deepEqual(materializeSpots(null, registry), []);
});

test('plainEpisode fills marker defaults but keeps an intensity of 0', () => {
  const ep = plainEpisode('Defaults', [{
    name: 'A',
    markers: [{ zoneId: ZONE_A }, { zoneId: ZONE_B, intensity: 0 }]
  }], registry);
  const [a, b] = ep.markers;
  assert.equal(a.intensity, 5);
  assert.equal(a.depth, 'surface');
  assert.equal(a.spread, 'small');
  assert.equal(a.quality, null);
  assert.equal(a.note, '');
  assert.equal(b.intensity, 0, 'intensity 0 was coerced to the default; the ?? guard became ||');
});

// ── the null paths: what must NOT produce a half-built episode ──────────────

test('episodeFromCondition returns null rather than an empty map for an unmappable request', () => {
  assert.equal(episodeFromCondition('no-such-condition', registry), null, 'unknown id');
  assert.equal(episodeFromCondition('chiari-2', registry), null, 'notMappable condition');
  assert.equal(episodeFromCondition('secondary-red-flag-pattern', registry), null, 'condition with no primary zones');
  assert.equal(episodeFromCondition(undefined, registry), null);
});

test('the null paths name conditions that still exist, so this test cannot rot into a tautology', () => {
  assert.ok(conditionById('chiari-2')?.notMappable, 'chiari-2 is no longer the notMappable case');
  const noPrimary = conditionById('secondary-red-flag-pattern');
  assert.ok(noPrimary, 'secondary-red-flag-pattern was renamed');
  assert.ok(!noPrimary.primary?.length, 'secondary-red-flag-pattern gained primary zones');
  assert.equal(conditionById('no-such-condition'), null);
});

test('episodeFromDemo returns null for an unknown demo id', () => {
  assert.equal(episodeFromDemo('demo-that-never-shipped', registry), null);
  assert.equal(demoById('demo-that-never-shipped'), null);
  assert.ok(demoById('demo-combo'), 'demoById stopped finding a demo that is in DEMOS');
});

// ── coverage: a renamed condition must not silently empty a demo ────────────

test('every demo id produces an episode with markers, catching a demo pointing at a renamed condition', () => {
  for (const d of DEMOS) {
    const ep = episodeFromDemo(d.id, registry);
    assert.ok(ep, `demo ${d.id} produced nothing`);
    assert.equal(ep.title, d.title);
    assert.equal(ep.groups.length, d.groups.length);
    assert.ok(ep.markers.length > 0,
      `demo ${d.id} rendered an empty head: its condition ids or zone ids no longer resolve`);
  }
});

test('every mappable condition produces an episode with markers on real zones', () => {
  for (const c of MAPPABLE) {
    const ep = episodeFromCondition(c.id, registry);
    assert.ok(ep.markers.length > 0, `condition ${c.id} maps to zero spots; its primary zones are not on this model`);
    assert.equal(ep.title, c.name, 'the episode keeps the full condition name');
    assert.equal(ep.groups[0].conditionId, c.id, 'the pain lost its link back to the library card');
    assert.equal(ep.groups[0].name, shortName(c.name), 'the legend gets the short name, the episode the long one');
    for (const m of ep.markers) assert.ok(registry.zoneById(m.zoneId), `${c.id}: marker on unknown zone ${m.zoneId}`);
  }
});

// ── shortName ───────────────────────────────────────────────────────────────

test('shortName drops a parenthetical or dash suffix so the legend chip fits', () => {
  assert.equal(shortName('Acute rhinosinusitis (true "sinus headache")'), 'Acute rhinosinusitis');
  // \u2014 is the em dash the regex splits on, written as an escape because the
  // repo's copy rules ban the literal character from files.
  assert.equal(shortName('Cluster headache \u2014 the alarm-clock one'), 'Cluster headache');
  assert.equal(shortName('Tension-type headache'), 'Tension-type headache', 'a hyphen inside a word is not a suffix');
  assert.equal(shortName('Migraine'), 'Migraine');
  assert.equal(shortName('Giant cell (temporal) arteritis: pattern'), 'Giant cell',
    'the split takes everything from the first " (" onwards');
});
