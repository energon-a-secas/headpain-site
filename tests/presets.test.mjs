// The seam between a published pattern and points on this model.
//
// presets.js turns "a condition described in conditions.js" into an episode the
// 3D view and embed.html can render with no app around them. Three things must
// hold on every path out of it: the episode carries a camera (omitting it once
// threw during boot, and the boot's catch reported a working browser as one that
// cannot do 3D), every marker resolves to a real group (markerColor() falls back
// to GROUP_COLORS[0] rather than throwing, so a dangling groupId paints the
// wrong pain in silence), and a zone this model does not carry is skipped rather
// than placed somewhere plausible but wrong.

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

// One camera literal in plainEpisode feeds both doors, so this loop re-checks a
// single fact 25 times. It stays a loop only so a future entry point that builds
// its own episode object is covered the day it is added; the per-condition and
// per-demo facts that actually vary are asserted further down.
test('every episode presets.js hands the embed carries a camera, whichever door it came through', () => {
  assert.ok(MAPPABLE.length > 5, 'the library shrank to nothing; the loop below would be vacuous');
  assert.ok(DEMOS.length > 0, 'the demo shelf is empty; the loop below would be vacuous');
  for (const c of MAPPABLE) assertCamera(episodeFromCondition(c.id, registry), `condition ${c.id}`);
  for (const d of DEMOS) assertCamera(episodeFromDemo(d.id, registry), `demo ${d.id}`);
});

test('plainEpisode stamps createdAt and updatedAt, which the legend prints and the impact chart bins', () => {
  const before = Date.now();
  const ep = plainEpisode('Stamped', [{ name: 'A', markers: [{ zoneId: ZONE_A }] }], registry);
  for (const k of ['createdAt', 'updatedAt']) {
    assert.equal(typeof ep[k], 'string',
      `${k} is ${ep[k]}; legend.js prints it into the exported PNG and panel-impact.js feeds it to new Date()`);
    const t = Date.parse(ep[k]);
    assert.ok(Number.isFinite(t), `${k} "${ep[k]}" does not parse as a date, so the episode list prints "Invalid Date"`);
    assert.ok(t >= before - 1000 && t <= Date.now() + 1000, `${k} is ${ep[k]}, which is not now`);
  }
  assert.equal(ep.createdAt, ep.updatedAt, 'a freshly built preset episode has never been edited; the two stamps must agree');
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

test('materializeSpots sends a virtual whole-head zone to the forehead spot, not to a missing anchor', () => {
  const [spot] = materializeSpots([{ zoneId: 'whole-head', intensity: 7 }], registry);
  assert.ok(spot, 'whole-head is a virtual zone the registry does carry; it must not be skipped');
  // Literals rather than WHOLE_HEAD_SPOT: presets.js pushes that constant's own
  // arrays, so comparing the spot to it compares a value with itself and moving
  // the whole-head spot off the head entirely would still pass.
  assert.deepEqual(spot.p, [0, 0.2, 0.95],
    'the whole-head spot moved; a diffuse pain now renders somewhere else on the model');
  assert.deepEqual(spot.n, [0, 0, 1], 'the whole-head normal no longer faces the viewer, so its decal renders edge-on');
  assert.deepEqual(WHOLE_HEAD_SPOT.p, [0, 0.2, 0.95],
    'the exported constant and the spot materializeSpots places have drifted apart; events.js places its own points from the constant');
  assert.equal(spot.intensity, 7, 'the rest of the marker must survive the position rewrite');
  assert.equal(registry.zoneById('whole-head').anchor, undefined,
    'whole-head gained an anchor, so this test no longer exercises the virtual branch it is named for');
});

test('materializeSpots copies both anchor and normal, so editing a marker cannot move the zone', () => {
  const zone = registry.zoneById(ZONE_A);
  const anchor = [...zone.anchor];
  const normal = [...zone.normal];
  const [spot] = materializeSpots([{ zoneId: ZONE_A }], registry);
  assert.notEqual(spot.p, zone.anchor, 'the marker holds the registry anchor array itself, not a copy of it');
  assert.notEqual(spot.n, zone.normal, 'the marker holds the registry normal array itself, not a copy of it');
  spot.p[0] = 999;
  spot.n[0] = -999;
  assert.deepEqual(registry.zoneById(ZONE_A).anchor, anchor,
    'the marker aliased the registry anchor; dragging one point would move the zone for every episode');
  assert.deepEqual(registry.zoneById(ZONE_A).normal, normal,
    'the marker aliased the registry normal; re-orienting one point would tilt the zone for every episode');
});

// Pinned, not fixed: js/presets.js line 22 pushes the module constant itself for
// a virtual zone (`? WHOLE_HEAD_SPOT :` where the real-zone branch spreads into
// fresh arrays), so every whole-head marker in every episode shares one position
// array with WHOLE_HEAD_SPOT, and events.js hands the same array to addMarker().
// Nothing in js/ writes into marker.p today, which is why it has never shown.
// The fix is `{ p: [...WHOLE_HEAD_SPOT.p], n: [...WHOLE_HEAD_SPOT.n] }`; this
// test goes green the moment that lands.
test('materializeSpots copies the whole-head spot too, so one whole-head marker cannot move every other', () => {
  const saved = [...WHOLE_HEAD_SPOT.p];
  try {
    const [a] = materializeSpots([{ zoneId: 'whole-head' }], registry);
    const [b] = materializeSpots([{ zoneId: 'whole-head' }], registry);
    assert.notEqual(a.p, b.p, 'two separately materialized whole-head markers share one position array');
    a.p[0] = 42;
    assert.deepEqual(b.p, saved, 'writing to one whole-head marker moved another one');
    assert.deepEqual(WHOLE_HEAD_SPOT.p, saved, 'writing to a marker rewrote the module constant every later marker reads');
  } finally {
    WHOLE_HEAD_SPOT.p.splice(0, WHOLE_HEAD_SPOT.p.length, ...saved);
  }
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

test('a condition flagged notMappable is refused even when it does carry mappable zones', () => {
  // Both conditions the library flags notMappable today also carry `primary: []`,
  // so the guard's `!c.primary?.length` clause already refuses them and the
  // notMappable clause is invisible from outside: dropping it leaves every test
  // above green. This pushes a condition that separates the two clauses, then
  // takes it straight back out.
  const synthetic = {
    id: 'synthetic-notmappable', name: 'Synthetic notMappable', tier: 'common',
    notMappable: true, primary: [ZONE_A, ZONE_B], laterality: 'any',
    depths: ['surface'], qualities: ['dull-ache'], intensity: [3, 5]
  };
  CONDITIONS.push(synthetic);
  try {
    assert.ok(conditionById(synthetic.id), 'the fixture never reached conditionById; this test proves nothing');
    assert.equal(episodeFromCondition(synthetic.id, registry), null,
      'a condition the library says must not be mapped was mapped anyway; the card explains why it has no shape and the head would contradict it');
  } finally {
    CONDITIONS.splice(CONDITIONS.indexOf(synthetic), 1);
  }
  assert.equal(conditionById(synthetic.id), null, 'the fixture leaked into the real library');
});

test('the null paths name conditions that still exist, so this test cannot rot into a tautology', () => {
  const unmappable = conditionById('chiari-2');
  assert.ok(unmappable?.notMappable, 'chiari-2 is no longer the notMappable case');
  // Also empty, which is why the notMappable clause is defence in depth here and
  // is proved separately above rather than through chiari-2.
  assert.equal(unmappable.primary.length, 0,
    'chiari-2 gained primary zones; the line above now covers the notMappable clause on its own, so say so');
  const noPrimary = conditionById('secondary-red-flag-pattern');
  assert.ok(noPrimary, 'secondary-red-flag-pattern was renamed');
  assert.ok(!noPrimary.notMappable, 'secondary-red-flag-pattern is now notMappable too, so it no longer isolates the empty-zones clause');
  assert.ok(!noPrimary.primary?.length, 'secondary-red-flag-pattern gained primary zones');
  assert.equal(conditionById('no-such-condition'), null);
});

test('episodeFromDemo returns null for an unknown demo id', () => {
  assert.equal(episodeFromDemo('demo-that-never-shipped', registry), null);
  assert.equal(demoById('demo-that-never-shipped'), null);
  assert.ok(demoById('demo-combo'), 'demoById stopped finding a demo that is in DEMOS');
});

// ── coverage: a renamed condition must not silently empty a demo ────────────

test('every demo group names a condition the library still carries, since presetMarkers(null) throws', () => {
  const ids = DEMOS.flatMap(d => d.groups.map(g => [d.id, g.conditionId])).filter(([, id]) => id);
  assert.ok(ids.length > 0, 'no demo group points at a condition any more; the check below is vacuous');
  for (const [demoId, conditionId] of ids) {
    assert.ok(conditionById(conditionId),
      `demo ${demoId} points at condition "${conditionId}", which the library no longer has; opening it throws inside presetMarkers instead of showing anything`);
  }
});

test('a demo whose condition was renamed fails loudly rather than rendering an empty head', () => {
  const synthetic = {
    id: 'synthetic-demo', title: 'Synthetic demo',
    groups: [{ conditionId: 'condition-renamed-away', name: 'Gone' }]
  };
  DEMOS.push(synthetic);
  try {
    // The requirement is that it does not sail on and put an empty pain on the
    // shelf. Throwing satisfies that, and so would returning null or skipping
    // the group, so none of those is pinned here: content-integrity.test.mjs
    // already fails if a real demo's conditionId dangles, and this only has to
    // stop the failure being silent.
    let built = null;
    let threw = false;
    try { built = episodeFromDemo(synthetic.id, registry); } catch { threw = true; }
    assert.ok(threw || !built || built.markers.length > 0,
      'a dangling conditionId produced an episode whose pain has no points, so the demo shelf would offer an empty head with no error anywhere');
  } finally {
    DEMOS.splice(DEMOS.indexOf(synthetic), 1);
  }
  assert.equal(demoById(synthetic.id), null, 'the fixture leaked into the real demo shelf');
});

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

// The loop above recomputes the expected name with shortName itself, so it only
// notices shortName not being applied at all. These two spell the long/short
// contrast out, so a change to the trimming rule is visible here as well.
test('the legend chip for a long condition name is the trimmed one, the episode title the full one', () => {
  const sinus = episodeFromCondition('acute-rhinosinusitis', registry);
  assert.equal(sinus.title, 'Acute rhinosinusitis (true "sinus headache")');
  assert.equal(sinus.groups[0].name, 'Acute rhinosinusitis');
  const gca = episodeFromCondition('giant-cell-arteritis', registry);
  assert.equal(gca.title, 'Giant cell (temporal) arteritis: pattern');
  assert.equal(gca.groups[0].name, 'Giant cell', 'the split takes everything from the first " (" onwards, mid-name included');
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
