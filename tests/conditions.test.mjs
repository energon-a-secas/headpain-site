// The transparent matcher: what the Conditions tab is allowed to tell a person.
//
// Three invariants live here. First, the arithmetic in scoreConditions must
// stay the arithmetic the copy promises: a bounded, integer "how closely your
// map resembles a published pattern" number, never a probability, never a
// diagnosis, never a crash on a map nobody wrote a pattern for. Second, every
// zone id the library names must be a zone the baked model actually carries,
// because a typo there scores zero forever and nothing reports it. Third, the
// guardrail copy is part of the product, not decoration: the never-diagnose
// sentences and the red-flag list have to survive an edit to the module.
//
// Numbers below were read off the source, not guessed. The weights are:
// zone overlap 0-70 (primary 1.0, secondary 0.4, whole-head 0.6 only when
// diffuseTolerant), laterality -10..+10, quality -8..+10, depth -3..+5,
// a hard cap of 40 when a strict-unilateral pattern meets a two-sided map,
// then clamp to 0..95, drop below 30, keep the top 5.
//
// Two techniques recur. Where the real library cannot reach a branch (the
// hidden-entry guard, the intensity clamp, the empty-list fallbacks), the test
// builds a condition-shaped record instead of asserting the branch is
// unreachable: injected entries are pushed onto CONDITIONS and removed in a
// finally, so nothing leaks into the next test. And where a comment names a
// number, the assertion pins that number rather than a floor beneath it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry, marker } from './fixtures.mjs';
import {
  CONDITIONS, scoreConditions, presetMarkers,
  MATCHER_DISCLAIMER, CARD_DISCLAIMER, CONGENITAL_NOTE, MATCH_CAP_NOTE, RED_FLAG_LIST
} from '../js/conditions.js';

const zoneById = registry.zoneById;
const at = (zoneId, extra = {}) => marker({ zoneId, ...extra });
const score = markers => scoreConditions(markers, zoneById);
const ids = results => results.map(r => r.condition.id);
const byId = id => CONDITIONS.find(c => c.id === id);
const find = (results, id) => results.find(r => r.condition.id === id);
const MAPPABLE = CONDITIONS.filter(c => !c.notMappable && !c.hiddenFromMatcher && c.primary.length);

// Run fn with extra condition records temporarily in the library, then put the
// library back exactly as it was, pass or fail.
function withConditions(extra, fn) {
  const n = CONDITIONS.length;
  CONDITIONS.push(...extra);
  try { return fn(); } finally { CONDITIONS.length = n; }
}

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

test('every condition names a laterality the matcher actually branches on, and every mappable one is scoreable', () => {
  // The same failure mode as a typo'd zone id, one field over: the matcher has
  // exactly four laterality branches and no else, so 'unilateral' or
  // 'strict_unilateral' would score 0 laterality forever with nothing reported.
  const LATERALITIES = ['strict-unilateral', 'usually-unilateral', 'bilateral', 'any'];
  const wrong = CONDITIONS.filter(c => !LATERALITIES.includes(c.laterality)).map(c => `${c.id} -> ${c.laterality}`);
  assert.deepEqual(wrong, [], 'a laterality the matcher does not branch on scores nothing, silently');

  for (const c of MAPPABLE) {
    assert.ok(c.qualities.length, `${c.id} is mappable but lists no quality, so it can never earn the +10`);
    assert.ok(c.depths.length, `${c.id} is mappable but lists no depth, so it can never earn the +5`);
    assert.ok(c.intensity[0] <= c.intensity[1],
      `${c.id} has intensity [${c.intensity}] the wrong way round; presetMarkers seeds the midpoint`);
  }
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

test('the same migraine zones on one side only put hemicrania continua first and migraine immediately behind it', () => {
  const results = score(['temple-left', 'behind-eye-left', 'forehead-lower-left']
    .map(z => at(z, { intensity: 8, quality: 'throbbing', depth: 'inside-head' })));
  // Pinning the actual ranking, not a wish: hemicrania continua covers the same
  // zones and is strict-unilateral, which earns +10 where migraine earns +5, so
  // it edges ahead on a one-sided map. The differentiator copy, not the score,
  // is what separates them for a reader. Paroxysmal hemicrania is also
  // strict-unilateral but lists fewer of these zones, so it lands at 81, below
  // both migraine entries: "the one-sided patterns win" is not true in general.
  assert.deepEqual(ids(results).slice(0, 3), ['hemicrania-continua', 'migraine-no-aura', 'migraine-aura']);
  assert.equal(results[0].score, 95);
  // 70 zone + 5 laterality (usually-unilateral, confirmed) + 10 quality + 5 depth.
  assert.equal(find(results, 'migraine-no-aura').score, 90);
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

test('every score is a whole number at or above 30, at most five come back, and the best map on the model tops out at 95', () => {
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
  let best = 0;
  for (const markers of cases) {
    const results = score(markers);
    assert.ok(results.length <= 5, `${results.length} matches shown; the list is capped at 5`);
    for (const r of results) {
      seen++;
      best = Math.max(best, r.score);
      assert.ok(Number.isInteger(r.score), `${r.condition.id} scored ${r.score}, not a whole number`);
      assert.ok(r.score >= 30, `${r.condition.id} scored ${r.score}, below the 30 threshold`);
    }
  }
  assert.ok(seen > 200, `only ${seen} scores exercised; the sweep stopped covering the library`);
  // 70 zone + 10 laterality + 10 quality + 5 depth is the arithmetic ceiling,
  // and a textbook one-sided cluster map reaches it exactly. This pins the
  // ceiling from below, which is the half that can actually fail: a cut weight
  // or a changed gate drops the best score off 95. Asserting score <= 95 pins
  // nothing at all, because Math.min(95, ...) in the source is unreachable
  // (weighted <= totalIntensity, so zoneScore <= 70) and, being unreachable,
  // it can be deleted without a single test noticing.
  assert.equal(best, 95, `the sweep's best score was ${best}, so a weight moved`);
});

test('a hidden or not-mappable entry stays out of the results even when its zones would score 95', () => {
  // The real hidden entries carry no zones at all, so the 30-point threshold
  // alone keeps them out and the guard could be deleted unnoticed. These
  // probes give the guard something to actually stop. throat-front is claimed
  // by no real pattern, so nothing but the probes can score on this map.
  const probe = (id, extra) => ({
    id, name: 'Probe', tier: 'advanced',
    primary: ['throat-front'], secondary: [],
    laterality: 'any', depths: ['surface'], qualities: ['sharp'], intensity: [5, 5],
    time: '', differentiators: '', redFlags: null, feelsLike: '', ...extra
  });
  const map = [at('throat-front', { intensity: 9, quality: 'sharp', depth: 'surface' })];
  const got = withConditions(
    [probe('probe-visible'), probe('probe-hidden', { hiddenFromMatcher: true }), probe('probe-unmappable', { notMappable: true })],
    () => ids(score(map))
  );
  // The unflagged control proves the shape really does clear the threshold, so
  // the other two are absent because of the guard and nothing else.
  assert.deepEqual(got, ['probe-visible']);
  assert.equal(CONDITIONS.at(-1).id, 'secondary-red-flag-pattern', 'the probes leaked into the real library');
});

test('the safety-banner entry and the congenital patterns stay flagged, and carry no zones a map could hit', () => {
  const forbidden = CONDITIONS.filter(c => c.hiddenFromMatcher || c.notMappable).map(c => c.id);
  assert.ok(forbidden.includes('secondary-red-flag-pattern'), 'the red-flag entry must stay hidden from the matcher');
  assert.ok(forbidden.includes('chiari-2') && forbidden.includes('chiari-3'));
  // Belt as well as braces: even without the guard above, an entry with no
  // zones and no qualities cannot reach 30.
  for (const id of forbidden) {
    const c = byId(id);
    assert.deepEqual([...c.primary, ...c.secondary], [], `${id} gained zones a map could score against`);
    assert.deepEqual(c.qualities, [], `${id} gained qualities worth +10`);
  }
});

// ---------------------------------------------------------------------------
// Intensity weighting
// ---------------------------------------------------------------------------

test('a loud point inside a pattern outweighs a quiet one outside it, and swapping the dial drops the pattern', () => {
  // The overlap is intensity-weighted, which only shows on a mixed-intensity
  // map: these two carry the same zones and the same total intensity, so an
  // unweighted count would score them identically (55 each). neck-back-lower
  // appears in no migraine list, so it adds nothing to the numerator and 10
  // units to the denominator.
  const loudTemple = [
    at('temple-left', { intensity: 10, quality: 'throbbing', depth: 'inside-head' }),
    at('neck-back-lower', { intensity: 1, quality: 'throbbing', depth: 'inside-head' })
  ];
  const loudNeck = [
    at('temple-left', { intensity: 1, quality: 'throbbing', depth: 'inside-head' }),
    at('neck-back-lower', { intensity: 10, quality: 'throbbing', depth: 'inside-head' })
  ];
  // 70 x 10/11 + 5 laterality + 10 quality + 5 depth.
  assert.equal(find(score(loudTemple), 'migraine-no-aura').score, 84);
  // 70 x 1/11 is 6, and the same 20 points of laterality/quality/depth leave
  // migraine at 26: under the threshold, gone from the list entirely.
  assert.deepEqual(ids(score(loudNeck)).filter(id => id.startsWith('migraine')), []);
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
});

test('the explanation switches to singular grammar for a single point', () => {
  const results = score([at('temple-left', { intensity: 8, quality: 'throbbing', depth: 'inside-head' })]);
  const why = find(results, 'migraine-no-aura').explanation;
  assert.ok(why.startsWith('1 of your 1 point is in zones typical'), why);
  assert.ok(!why.includes('1 points'), 'plural "points" after the count 1 reads as a bug to the reader');
});

test('when several of the map\'s qualities fit one pattern, the explanation names the first one placed', () => {
  const results = score([
    at('temple-left', { intensity: 5, quality: 'dull-ache', depth: 'muscle' }),
    at('neck-back-upper', { intensity: 5, quality: 'band-pressure', depth: 'muscle' })
  ]);
  const tension = find(results, 'tension-type');
  // Both qualities are tension-type's own; the explanation quotes one, and it
  // has to be the one the reader placed first or the sentence describes a
  // different point than the one they are looking at.
  assert.deepEqual(tension.matchedQ, ['dull-ache', 'band-pressure']);
  assert.equal(tension.explanation,
    '2 of your 2 points are in zones typical of this pattern · "dull ache" fits this pattern ✓');
});

test('a whole-head-only map scores through the 0.6 diffuse weight, and only for patterns that tolerate a diffuse map', () => {
  const results = score([at('whole-head', { intensity: 5, quality: 'dull-ache', depth: 'inside-head' })]);
  const moh = find(results, 'medication-overuse-headache');
  assert.ok(moh, 'whole-head at moderate intensity is exactly the medication-overuse shape');
  // 70 x 0.6 diffuse + 5 laterality (no side at all passes the bilateral
  // branch) + 10 quality + 5 depth. At full weight this map would score 90.
  assert.equal(moh.score, 62);
  // whole-head is scored through diffuseTolerant deliberately without being
  // added to hitZones, so the explanation must not claim a typical zone.
  assert.equal(moh.explanation,
    'Your points only loosely overlap this pattern · "dull ache" fits this pattern ✓');
  assert.equal(moh.hitZones.length, 0);
  // The gate itself: cluster headache and trigeminal neuralgia are not
  // diffuseTolerant, and a person who painted the whole head must not be
  // offered them.
  assert.deepEqual(ids(results).filter(id => !byId(id).diffuseTolerant), []);
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
  // Migraine tolerates two sides on the same zones and therefore leads: 70
  // zone + 2 laterality (usually-unilateral, not confirmed) + 0 quality
  // ('sharp' is not migraine's, and not a listed contradiction either) + 5 depth.
  assert.equal(both[0].condition.id, 'migraine-no-aura');
  assert.equal(both[0].score, 77);
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

// ---------------------------------------------------------------------------
// Contradicting qualities
// ---------------------------------------------------------------------------

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

test('a band of pressure counts against cluster and trigeminal neuralgia, not merely as an unmatched quality', () => {
  // The other two entries in the contradiction table. Without them the swing
  // would be 10 (a lost bonus), not 18 (a lost bonus plus a penalty).
  const at9 = (zones, quality, depth) => zones.map(z => at(z, { intensity: 9, quality, depth }));
  const cluster = ['behind-eye-left', 'temple-left'];
  const trigeminal = ['cheek-left', 'jaw-angle-left', 'chin'];
  assert.equal(find(score(at9(cluster, 'sharp', 'deep-pressure')), 'cluster-headache').score, 95);
  assert.equal(find(score(at9(cluster, 'band-pressure', 'deep-pressure')), 'cluster-headache').score, 77);
  assert.equal(find(score(at9(trigeminal, 'electric', 'surface')), 'trigeminal-neuralgia').score, 95);
  assert.equal(find(score(at9(trigeminal, 'band-pressure', 'surface')), 'trigeminal-neuralgia').score, 77);
});

// ---------------------------------------------------------------------------
// Maps nobody wrote a pattern for
// ---------------------------------------------------------------------------

test('an empty marker list returns an empty array rather than dividing by zero', () => {
  // The guard has to come first: totalIntensity would be 0, every zoneScore
  // NaN, and NaN < 30 is false, so five NaN-scored results would come back.
  assert.deepEqual(scoreConditions([], zoneById), []);
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

test('scoring reads the marker array and never writes to it', () => {
  // The app hands scoreConditions its live state array on every render. A
  // normalisation done in place (defaulting an intensity, say) would edit the
  // person's map behind their back.
  const markers = ['temple-left', 'behind-eye-left', 'whole-head']
    .map(z => at(z, { intensity: 0, quality: 'throbbing', depth: 'inside-head' }));
  const before = JSON.stringify(markers);
  score(markers);
  assert.equal(JSON.stringify(markers), before);
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
      // The pattern's FIRST depth and quality, not merely one of them: the
      // preset is meant to teach the textbook shape, and the lists are ordered.
      assert.equal(m.depth, c.depths[0], `${c.id} seeded depth ${m.depth}`);
      assert.equal(m.quality, c.qualities[0], `${c.id} seeded quality ${m.quality}`);
      assert.equal(m.spread, 'regional');
      assert.equal(m.note, '');
    }
  }
  // Mid-intensity, pinned on three real ranges rather than recomputed from the
  // same expression the source uses: 4..9 -> 7, 1..6 -> 4 (half rounds up),
  // 8..10 -> 9.
  assert.equal(presetMarkers(byId('migraine-no-aura'))[0].intensity, 7);
  assert.equal(presetMarkers(byId('tension-type'))[0].intensity, 4);
  assert.equal(presetMarkers(byId('cluster-headache'))[0].intensity, 9);
});

test('presetMarkers floors, caps, and back-fills what a sparse condition record leaves out', () => {
  // Hand-built records, because the real library cannot reach these branches:
  // every range sits inside 1..10 and every mappable entry lists a depth and a
  // quality, so the clamp and both fallbacks are dead against real data and a
  // loop over CONDITIONS would pass with them deleted.
  const shape = extra => ({
    primary: ['temple-left'], laterality: 'any',
    depths: ['surface'], qualities: ['sharp'], intensity: [5, 5], ...extra
  });
  assert.equal(presetMarkers(shape({ intensity: [0, 0] }))[0].intensity, 1,
    'a 0 midpoint must floor to 1; the editor has no 0 on its dial');
  assert.equal(presetMarkers(shape({ intensity: [11, 13] }))[0].intensity, 10);
  const bare = presetMarkers(shape({ depths: [], qualities: [] }))[0];
  assert.equal(bare.depth, 'surface', 'a condition with no depth must still seed a placeable marker');
  assert.equal(bare.quality, null, 'quality is optional and must be null, not undefined, for the editor');
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

test('a congenital or hidden entry seeds nothing, so the Load-as-map button has nothing to place', () => {
  for (const id of ['chiari-2', 'chiari-3', 'secondary-red-flag-pattern']) {
    const c = byId(id);
    assert.equal(c.primary.length, 0, `${id} gained primary zones; this test no longer covers the empty case`);
    assert.deepEqual(presetMarkers(c), []);
  }
});

test('each pattern\'s own preset scores that pattern into its own top five', () => {
  for (const c of MAPPABLE) {
    const results = score(presetMarkers(c));
    const self = find(results, c.id);
    assert.ok(self, `${c.id} does not match its own textbook map (results: ${ids(results).join(', ')})`);
    assert.ok(self.score >= 60, `${c.id} scored only ${self.score} against its own preset`);
  }
  // The two lowest, pinned exactly, because the >= 60 sweep above has 16+
  // points of slack on every other pattern and none of the arithmetic. Both
  // map partly or wholly to whole-head, which scores at the 0.6 diffuse weight
  // rather than 1.0: 70x0.6 + 5 + 10 + 5 for medication-overuse, and
  // 70x(0.6+1+1)/3 + 0 + 10 + 5 for IIH.
  assert.equal(find(score(presetMarkers(byId('medication-overuse-headache'))), 'medication-overuse-headache').score, 62);
  assert.equal(find(score(presetMarkers(byId('iih'))), 'iih').score, 76);
});

// ---------------------------------------------------------------------------
// Guardrail copy
// ---------------------------------------------------------------------------

test('the guardrail copy still refuses to diagnose and still calls the number a resemblance, not a probability', () => {
  // This is the highest-stakes text in the repo: it is what makes a pattern
  // matcher legal and honest to show a person. The clauses below are pinned
  // verbatim so a rewrite has to be a deliberate act, not a tidy-up.
  assert.ok(MATCHER_DISCLAIMER.includes('It cannot diagnose you.'), MATCHER_DISCLAIMER);
  assert.ok(MATCHER_DISCLAIMER.includes('not to rule anything in or out'), MATCHER_DISCLAIMER);
  assert.equal(CARD_DISCLAIMER, 'Educational pattern only. See a qualified clinician for diagnosis.');
  assert.ok(MATCH_CAP_NOTE.includes('It is not the probability that you have this condition.'), MATCH_CAP_NOTE);
  assert.ok(CONGENITAL_NOTE.includes('not something an adult can self-check with a pain map'), CONGENITAL_NOTE);
});

test('every red-flag item finishes the sentence its heading starts, instead of standing alone', () => {
  // Both surfaces render these as <li> under "…get urgent care if your
  // headache…", so an item written as its own sentence reads as broken
  // grammar to someone deciding whether to go to hospital.
  assert.equal(RED_FLAG_LIST.length, 6);
  for (const item of RED_FLAG_LIST) {
    assert.equal(item, item.trimEnd(), `trailing space: ${item}`);
    assert.notEqual(item[0], item[0].toUpperCase(), `${item} starts as its own sentence`);
    assert.ok(!item.endsWith('.'), `${item} ends as its own sentence`);
    assert.match(item, /^(came|is|comes|started)\b/, `${item} does not continue "your headache…"`);
  }
  assert.ok(RED_FLAG_LIST.some(i => i.includes('thunderclap')), 'the thunderclap line is the one that must never go');
  assert.ok(RED_FLAG_LIST.some(i => i.includes('worst headache of your life')));
});
