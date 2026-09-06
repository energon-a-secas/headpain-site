// The transparent matcher: what the Conditions tab is allowed to tell a person.
//
// Two invariants live here. First, the arithmetic in scoreConditions must stay
// the arithmetic the copy promises: a bounded, integer "how closely your map
// resembles a published pattern" number, never a probability, never a
// diagnosis, never a crash on a map nobody wrote a pattern for. Second, every
// zone id the library names must be a zone the baked model actually carries,
// because a typo there scores zero forever and nothing reports it.
//
// Numbers below were read off the source, not guessed. The weights are:
// zone overlap 0-70 (primary 1.0, secondary 0.4, whole-head 0.6 only when
// diffuseTolerant), laterality -10..+10, quality -8..+10, depth -3..+5,
// a hard cap of 40 when a strict-unilateral pattern meets a two-sided map,
// then clamp to 0..95, drop below 30, keep the top 5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry, marker } from './fixtures.mjs';
import { CONDITIONS, scoreConditions, presetMarkers } from '../js/conditions.js';

const zoneById = registry.zoneById;
const at = (zoneId, extra = {}) => marker({ zoneId, ...extra });
const score = markers => scoreConditions(markers, zoneById);
const ids = results => results.map(r => r.condition.id);
const byId = id => CONDITIONS.find(c => c.id === id);
const find = (results, id) => results.find(r => r.condition.id === id);
const MAPPABLE = CONDITIONS.filter(c => !c.notMappable && !c.hiddenFromMatcher && c.primary.length);

// ---------------------------------------------------------------------------
// Library integrity
// ---------------------------------------------------------------------------

test('every zone id the condition library names exists on the baked model, so no pattern scores zero by typo', () => {
  const missing = [];
  for (const c of CONDITIONS) {
    for (const id of [...c.primary, ...c.secondary]) {
      if (!zoneById(id)) missing.push(`${c.id} -> ${id}`);
    }
  }
  assert.deepEqual(missing, [],
    'a zone id no zone answers to contributes nothing to the overlap score, silently and forever');
});

// ---------------------------------------------------------------------------
// The two worked examples the tab is judged on
// ---------------------------------------------------------------------------

test('a map drawn exactly on migraine\'s primary zones, throbbing, ranks migraine without aura first', () => {
  // presetMarkers(migraine) IS its primary zone list at mid intensity with its
  // first quality (throbbing) and first depth (inside-head), so this is the
  // textbook map the app itself seeds.
  const results = score(presetMarkers(byId('migraine-no-aura')));
  assert.equal(results[0].condition.id, 'migraine-no-aura');
  // 70 zone (every point primary) + 2 laterality (usually-unilateral on a
  // two-sided map) + 10 quality + 5 depth.
  assert.equal(results[0].score, 87);
  // Migraine with aura shares the identical zone/quality/depth lists, so it
  // ties and library order breaks the tie. If this flips, the two entries
  // stopped being distinguishable by the map alone, which is true and fine,
  // but the ordering is what the numbered list shows a reader.
  assert.equal(results[1].condition.id, 'migraine-aura');
  assert.equal(results[1].score, 87);
});

test('the same migraine zones on one side only still surface migraine, ranked under the strictly one-sided patterns', () => {
  const results = score(['temple-left', 'behind-eye-left', 'forehead-lower-left']
    .map(z => at(z, { intensity: 8, quality: 'throbbing', depth: 'inside-head' })));
  const migraine = find(results, 'migraine-no-aura');
  assert.ok(migraine, 'a one-sided throbbing temple/eye map must still offer migraine');
  // 70 zone + 5 laterality (usually-unilateral, confirmed) + 10 quality + 5 depth.
  assert.equal(migraine.score, 90);
  // Pinning the actual ranking, not a wish: hemicrania continua covers the same
  // zones and is strict-unilateral, which earns +10 where migraine earns +5, so
  // it edges ahead on a one-sided map. The differentiator copy, not the score,
  // is what separates them for a reader.
  assert.equal(results[0].condition.id, 'hemicrania-continua');
  assert.equal(results[0].score, 95);
  assert.ok(results.indexOf(migraine) <= 2, `migraine fell to position ${results.indexOf(migraine)}`);
});

test('a map on the sinuses with fullness ranks acute rhinosinusitis first and keeps migraine out', () => {
  const results = score(['sinus-frontal-left', 'sinus-frontal-right', 'sinus-maxillary-left',
    'sinus-maxillary-right', 'sinus-ethmoid', 'nose-bridge']
    .map(z => at(z, { intensity: 5, quality: 'fullness', depth: 'deep-pressure' })));
  assert.equal(results[0].condition.id, 'acute-rhinosinusitis');
  // 70 zone + 0 laterality ('any' scores nothing) + 10 quality + 5 depth.
  assert.equal(results[0].score, 85);
  // The card's own differentiator says self-diagnosed "sinus headache" is
  // usually migraine. That claim only survives if a map genuinely on the
  // sinuses does NOT hand the reader migraine as well: migraine lists no sinus
  // zone at all, so it must score under threshold and disappear.
  assert.deepEqual(ids(results).filter(id => id.startsWith('migraine')), []);
});

// ---------------------------------------------------------------------------
// The score is bounded, whole, and short
// ---------------------------------------------------------------------------

test('every score is a whole number in the documented 30 to 95 window, and never more than five come back', () => {
  const cases = [];
  for (const c of MAPPABLE) {
    for (const intensity of [1, 5, 10]) {
      cases.push(presetMarkers(c).map(m => ({ ...m, intensity })));
    }
  }
  // Plus every single zone on the model on its own, at both ends of the dial.
  for (const z of registry.zones) {
    cases.push([at(z.id, { intensity: 10, quality: 'throbbing', depth: 'inside-head' })]);
    cases.push([at(z.id, { intensity: 1, quality: null, depth: null })]);
  }
  cases.push([at('whole-head', { intensity: 10, quality: 'dull-ache', depth: 'inside-head' })]);

  let seen = 0;
  for (const markers of cases) {
    const results = score(markers);
    assert.ok(results.length <= 5, `${results.length} matches shown; the list is capped at 5`);
    for (const r of results) {
      seen++;
      assert.ok(Number.isInteger(r.score), `${r.condition.id} scored ${r.score}, not a whole number`);
      assert.ok(r.score >= 30, `${r.condition.id} scored ${r.score}, below the 30 threshold`);
      assert.ok(r.score <= 95, `${r.condition.id} scored ${r.score}, above the 95 cap`);
    }
  }
  assert.ok(seen > 200, `only ${seen} scores exercised; the sweep stopped covering the library`);
});

test('the matcher never returns the safety-banner entry or a congenital pattern as a match', () => {
  const forbidden = CONDITIONS.filter(c => c.hiddenFromMatcher || c.notMappable).map(c => c.id);
  assert.ok(forbidden.includes('secondary-red-flag-pattern'), 'the red-flag entry must stay hidden from the matcher');
  assert.ok(forbidden.includes('chiari-2') && forbidden.includes('chiari-3'));

  for (const z of registry.zones) {
    for (const quality of ['throbbing', 'stabbing', 'fullness', 'electric']) {
      const results = score([at(z.id, { intensity: 10, quality, depth: 'inside-head' })]);
      for (const id of ids(results)) {
        assert.ok(!forbidden.includes(id), `${id} surfaced as a match for ${z.id}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The explanation has to say something true about this map
// ---------------------------------------------------------------------------

test('the explanation names the zone count and the laterality finding, not boilerplate', () => {
  const results = score(['temple-left', 'behind-eye-left', 'forehead-lower-left']
    .map(z => at(z, { intensity: 8, quality: 'throbbing', depth: 'inside-head' })));
  const why = find(results, 'migraine-no-aura').explanation;
  assert.equal(why,
    '3 of your 3 points are in zones typical of this pattern · often one-sided ✓ · "throbbing" fits this pattern ✓');
  assert.ok(!why.includes('undefined'));
});

test('the explanation switches to singular grammar for a single point', () => {
  const results = score([at('temple-left', { intensity: 8, quality: 'throbbing', depth: 'inside-head' })]);
  const why = find(results, 'migraine-no-aura').explanation;
  assert.ok(why.startsWith('1 of your 1 point is in zones typical'), why);
  assert.ok(!why.includes('1 points'), 'plural "points" after the count 1 reads as a bug to the reader');
});

test('a whole-head-only map says the overlap is loose instead of claiming zone hits', () => {
  // whole-head is scored through diffuseTolerant, deliberately without being
  // added to hitZones, so the explanation must not claim a typical zone.
  const results = score([at('whole-head', { intensity: 5, quality: 'dull-ache', depth: 'inside-head' })]);
  const moh = find(results, 'medication-overuse-headache');
  assert.ok(moh, 'whole-head at moderate intensity is exactly the medication-overuse shape');
  assert.equal(moh.explanation,
    'Your points only loosely overlap this pattern · "dull ache" fits this pattern ✓');
  assert.equal(moh.hitZones.length, 0);
});

test('every explanation the matcher produces mentions this map, and none of them says undefined', () => {
  for (const c of MAPPABLE) {
    for (const r of score(presetMarkers(c))) {
      assert.ok(!r.explanation.includes('undefined'), `${c.id} -> ${r.condition.id}: ${r.explanation}`);
      assert.match(r.explanation, /^(\d+ of your \d+ point|Your points only loosely overlap)/,
        `${r.condition.id} opened with boilerplate: ${r.explanation}`);
    }
  }
});

// PRODUCT BUG (not fixed here; js/ is off limits for this file).
// explain() counts r.hitZones, a Set of distinct zone ids, but words it as
// "N of your M points". addMarker() in state.js pushes without deduping by
// zone, so tapping the same temple three times is a reachable state, and the
// tab then tells the reader "1 of your 3 points are in zones typical of this
// pattern" when in truth all three are. The count is only ever an undercount,
// so it reads as the pattern fitting worse than it does.
test('the explanation counts points in typical zones, not distinct zones', () => {
  const thrice = Array.from({ length: 3 }, () =>
    at('temple-left', { intensity: 8, quality: 'throbbing', depth: 'inside-head' }));
  const why = find(score(thrice), 'migraine-no-aura').explanation;
  assert.ok(why.startsWith('3 of your 3 points'), why);
});

test('the point count only ever counts points the pattern actually claims', () => {
  // The counterweight to the test above: counting markers instead of distinct
  // zones must not turn into counting every marker on the map.
  const mixed = [
    at('temple-left', { intensity: 8, quality: 'throbbing', depth: 'inside-head' }),
    at('temple-left', { intensity: 7, quality: 'throbbing', depth: 'inside-head' }),
    at('neck-back-lower', { intensity: 6, quality: 'dull-ache', depth: 'muscle' }),
  ];
  const why = find(score(mixed), 'migraine-no-aura').explanation;
  assert.ok(why.startsWith('2 of your 3 points'), why);
});

// ---------------------------------------------------------------------------
// Laterality
// ---------------------------------------------------------------------------

test('a strictly one-sided pattern is capped at 40 and out-ranked when the map covers both sides', () => {
  const zones = ['behind-eye-left', 'behind-eye-right', 'temple-left', 'temple-right'];
  const both = score(zones.map(z => at(z, { intensity: 9, quality: 'sharp', depth: 'deep-pressure' })));
  const cluster = find(both, 'cluster-headache');
  assert.ok(cluster, 'cluster stays visible, it just stops leading');
  // Every point is primary for cluster (zone 70) and quality and depth both
  // fit, but two sides means -10 and a hard cap at 40.
  assert.equal(cluster.score, 40);
  assert.equal(cluster.latNote, 'usually one side only: less typical');
  assert.notEqual(both[0].condition.id, 'cluster-headache');
  // Migraine tolerates two sides on the same zones and therefore leads.
  assert.equal(both[0].condition.id, 'migraine-no-aura');
  assert.ok(both[0].score > cluster.score, 'the two-sided map must favour the two-sided pattern');
});

test('the same cluster map on one side scores 95 and leads', () => {
  const one = score(['behind-eye-left', 'temple-left']
    .map(z => at(z, { intensity: 9, quality: 'sharp', depth: 'deep-pressure' })));
  const cluster = find(one, 'cluster-headache');
  assert.equal(cluster.score, 95, '70 zone + 10 laterality + 10 quality + 5 depth');
  assert.equal(cluster.latNote, 'strictly one-sided ✓');
  assert.equal(one[0].condition.id, 'cluster-headache');
  // Paroxysmal hemicrania ties at 95 on the identical map; only the library
  // order separates them, which is what the numbered list shows.
  assert.equal(one[1].condition.id, 'paroxysmal-hemicrania');
  assert.equal(one[1].score, 95);
});

test('a centre-line-only map counts as neither side, so bilateral patterns still get their laterality credit', () => {
  // sides is empty, not "one side": the bilateral branch treats size 0 as a
  // pass (+5) while strict-unilateral gets nothing and no cap.
  const results = score(['forehead-upper-center', 'occipital-upper-center', 'neck-back-upper']
    .map(z => at(z, { intensity: 4, quality: 'band-pressure', depth: 'muscle' })));
  const tension = find(results, 'tension-type');
  assert.ok(tension, 'a centre-line band of muscle ache is the tension-type shape');
  assert.equal(tension.latNote, null, 'the bilateral branch scores silently, with no note to show');
  assert.equal(tension.score, 90, '70 zone + 5 laterality + 10 quality + 5 depth');
});

test('a contradicting quality costs a pattern points instead of being ignored', () => {
  const zones = ['forehead-upper-left', 'forehead-upper-right', 'occipital-upper-center', 'neck-back-upper'];
  const fits = score(zones.map(z => at(z, { intensity: 4, quality: 'band-pressure', depth: 'muscle' })));
  const clashes = score(zones.map(z => at(z, { intensity: 4, quality: 'throbbing', depth: 'muscle' })));
  const a = find(fits, 'tension-type').score;
  const b = find(clashes, 'tension-type').score;
  // +10 for a matching quality becomes -8 for a listed contradiction: an 18
  // point swing on an otherwise identical map.
  assert.equal(a - b, 18, `band-pressure ${a} vs throbbing ${b}`);
});

// ---------------------------------------------------------------------------
// Maps nobody wrote a pattern for
// ---------------------------------------------------------------------------

test('an empty marker list returns an empty array rather than dividing by zero', () => {
  const results = scoreConditions([], zoneById);
  assert.deepEqual(results, []);
  // The guard has to come first: totalIntensity would be 0 and every zoneScore NaN.
  assert.ok(Array.isArray(results));
});

test('points on zones no pattern claims produce no matches instead of a crash', () => {
  // throat-front appears in no condition's primary or secondary list.
  assert.ok(!CONDITIONS.some(c => c.primary.includes('throat-front') || c.secondary.includes('throat-front')),
    'this test picked throat-front because no pattern lists it; a library change needs a new zone here');
  assert.deepEqual(score([at('throat-front', { intensity: 7 })]), []);
  assert.deepEqual(score([at('throat-front'), at('neck-back-lower')]), [],
    'a faint secondary hit alone stays under the 30 threshold');
});

test('a marker whose zone the model does not carry scores nothing instead of throwing', () => {
  // Arrives from an old share link naming a retired zone. zoneById returns
  // null, markerSides skips it, and no condition lists it.
  assert.equal(zoneById('zone-that-was-retired'), null);
  assert.deepEqual(score([at('zone-that-was-retired', { intensity: 9, quality: 'sharp' })]), []);
});

test('a zero-intensity point still counts as a point rather than vanishing', () => {
  // Math.max(1, m.intensity) floors the weight, so a slider dragged to 0 does
  // not make totalIntensity 0 and every score NaN.
  const results = score([at('behind-eye-left', { intensity: 0, quality: 'sharp', depth: 'deep-pressure' })]);
  assert.ok(results.length > 0, 'a 0-intensity point produced no matches at all');
  assert.ok(results.every(r => Number.isFinite(r.score)));
});

// ---------------------------------------------------------------------------
// presetMarkers
// ---------------------------------------------------------------------------

test('presetMarkers only emits zone ids the model can actually place', () => {
  for (const c of CONDITIONS) {
    for (const m of presetMarkers(c)) {
      assert.ok(m.zoneId, `${c.id} produced a marker with no zoneId`);
      assert.ok(zoneById(m.zoneId), `${c.id} seeded ${m.zoneId}, which materializeSpots would drop`);
    }
  }
});

test('every preset marker carries the fields the editor and the matcher read', () => {
  for (const c of MAPPABLE) {
    const markers = presetMarkers(c);
    assert.ok(markers.length > 0, `${c.id} is mappable but seeded nothing`);
    for (const m of markers) {
      assert.ok(Number.isInteger(m.intensity) && m.intensity >= 1 && m.intensity <= 10,
        `${c.id} seeded intensity ${m.intensity}`);
      assert.ok(c.depths.includes(m.depth), `${c.id} seeded depth ${m.depth}, not one of its own`);
      assert.ok(m.quality === null || c.qualities.includes(m.quality),
        `${c.id} seeded quality ${m.quality}, not one of its own`);
      assert.equal(m.spread, 'regional');
      assert.equal(m.note, '');
    }
  }
});

test('a strictly one-sided pattern seeds one side only, so the preset teaches the right shape', () => {
  for (const c of MAPPABLE.filter(x => x.laterality === 'strict-unilateral')) {
    const zones = presetMarkers(c).map(m => m.zoneId);
    assert.ok(zones.length > 0, `${c.id} seeded nothing`);
    assert.deepEqual(zones.filter(z => z.endsWith('-right')), [],
      `${c.id} seeded both sides of a strictly one-sided pattern`);
    assert.ok(zones.some(z => z.endsWith('-left')), `${c.id} dropped every side and kept only centre zones`);
  }
  // Centre-line zones survive the filter: trigeminal neuralgia keeps the chin.
  assert.ok(presetMarkers(byId('trigeminal-neuralgia')).some(m => m.zoneId === 'chin'));
  // And a pattern with no laterality restriction keeps both sides.
  assert.ok(presetMarkers(byId('acute-rhinosinusitis')).some(m => m.zoneId.endsWith('-right')));
});

test('a congenital or hidden entry seeds nothing instead of throwing on its empty zone lists', () => {
  for (const id of ['chiari-2', 'chiari-3', 'secondary-red-flag-pattern']) {
    const c = byId(id);
    assert.equal(c.primary.length, 0, `${id} gained primary zones; this test no longer covers the empty case`);
    // intensity [0,0] rounds to 0, depths[0] and qualities[0] are undefined:
    // the fallbacks have to hold even though no marker comes out.
    assert.deepEqual(presetMarkers(c), []);
  }
});

test('each pattern\'s own preset scores that pattern into its own top five', () => {
  for (const c of MAPPABLE) {
    const results = score(presetMarkers(c));
    const self = find(results, c.id);
    assert.ok(self, `${c.id} does not match its own textbook map (results: ${ids(results).join(', ')})`);
    // Medication-overuse is the floor at 62: its only primary zone is
    // whole-head, which scores through the 0.6 diffuse weight rather than 1.0.
    assert.ok(self.score >= 60, `${c.id} scored only ${self.score} against its own preset`);
  }
});
