// The advice ladder and the attribute lookups underneath it.
//
// Three invariants live here. First, the intensity thresholds: guidanceFor() is
// the only thing deciding whether someone at 8/10 is told to act now or told
// nothing at all, so every boundary is pinned exactly rather than "roughly".
// Second, the zones.js lookups are total: the editor, the legend and the decal
// renderer all dereference their return value without a null check
// (`depthById(m.depth).short`, `spreadById(marker.spread).radius`), so a lookup
// that returns undefined for an unknown id is a crash, and a spread radius ramp
// that is not monotonic draws a widespread pain smaller than a pinpoint one.
// Third, the fallbacks are pinned by *id*, never by array index: the default
// depth and spread are written down in three places (here, state.js's
// defaultMarker, presets.js) and a reorder of DEPTHS or SPREADS would split
// them silently if the tests only compared against DEPTHS[0] / SPREADS[1].

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guidanceFor, ROOT_CAUSE_NOTE } from '../js/guidance.js';
import {
  DEPTHS, QUALITIES, SPREADS, INTENSITY_BANDS,
  intensityBand, depthById, qualityById, spreadById
} from '../js/zones.js';
import { defaultMarker } from '../js/state.js';

// ---------------------------------------------------------------------------
// guidance.js
// ---------------------------------------------------------------------------

test('guidanceFor stays silent below 7, so ordinary pain does not get an alarm card', () => {
  for (const v of [0, 1, 2, 3, 4, 5, 6]) {
    assert.equal(guidanceFor(v), null, `${v}/10 rendered a guidance card`);
  }
  assert.equal(guidanceFor(6.9), null, 'the slider is integral, but a fractional value must not cross early');
});

test('7 is exactly where the rising card appears, and it is not the severe one', () => {
  const g = guidanceFor(7);
  assert.notEqual(g, null, '7/10 is the "stop it reaching 8" moment; a null here loses the whole message');
  assert.equal(g.severe, false, 'flagging 7 as severe would show the root-cause note one step too early');
  // Anchored, not /7/: a title that merely contains a 7 anywhere can be one
  // step off ("Level 6: ... reaching 7") and still show the wrong number to
  // the person reading the card.
  assert.match(g.title, /^Level 7\b/, `the rising card must open by naming its own level, not another: ${JSON.stringify(g.title)}`);
});

test('8, 9 and 10 all get the severe card, so nobody at 8/10 is shown the milder advice', () => {
  const severe = guidanceFor(8);
  assert.notEqual(severe, null);
  assert.equal(severe.severe, true, '8/10 must be flagged severe; editor.js gates ROOT_CAUSE_NOTE on this flag');
  assert.match(severe.title, /^Level 8\b/, `the severe card must open at the level it starts at: ${JSON.stringify(severe.title)}`);
  assert.equal(guidanceFor(9), severe, '9/10 fell into a different tier than 8/10');
  assert.equal(guidanceFor(10), severe, '10/10 fell into a different tier than 8/10');
  assert.notEqual(guidanceFor(7), severe, 'the 7 and 8 tiers collapsed into one card');
});

test('a marker with no usable intensity gets no card at all, while a numeric string still gets the right one', () => {
  // guidanceFor is written as two `>=` comparisons, which is why this holds:
  // every comparison against undefined/null/NaN is false, so the function
  // falls through to null. A rewrite to a single `if (intensity < 7) return
  // null` inverts exactly this and hands an alarm card to a marker whose
  // intensity never loaded. Pinned so that rewrite cannot land quietly.
  for (const bad of [undefined, null, NaN, '', 'abc']) {
    assert.equal(guidanceFor(bad), null,
      `guidanceFor(${JSON.stringify(bad)}) invented a guidance card out of a missing intensity`);
  }
  // The other half of the coercion is deliberate and load-bearing: a value that
  // arrived from a form or from imported JSON as a string must still reach the
  // tier it names rather than silently dropping the escalation.
  assert.equal(guidanceFor('9'), guidanceFor(9), 'a string "9" lost the severe card');
  assert.equal(guidanceFor('7'), guidanceFor(7), 'a string "7" lost the rising card');
});

test('both guidance cards carry a title and at least two things to actually do', () => {
  for (const v of [7, 8]) {
    const g = guidanceFor(v);
    assert.equal(typeof g.title, 'string');
    assert.ok(g.title.trim().length > 10, `${v}/10 card has a stub title: ${JSON.stringify(g.title)}`);
    assert.ok(Array.isArray(g.items));
    assert.ok(g.items.length >= 2, `${v}/10 card offers ${g.items.length} item(s); a single line is not guidance`);
    for (const item of g.items) {
      assert.equal(typeof item, 'string');
      assert.ok(item.trim().length > 20, `${v}/10 card has an empty-ish item: ${JSON.stringify(item)}`);
    }
  }
});

test('the severe card keeps the emergency escalation, the one line that outranks the map', () => {
  const text = guidanceFor(10).items.join(' ').toLowerCase();
  assert.ok(text.includes('emergency'), 'the thunderclap / worst-headache-of-your-life escalation vanished');
});

test('ROOT_CAUSE_NOTE keeps all three things it exists to say, not just the phrase', () => {
  // A length floor alone is a bad guard: the real note is 283 characters and a
  // 130-character slogan that keeps the term "medication-overuse" used to pass.
  // Each clause is asserted on its own, because each is doing separate work:
  // the failure mode, what to watch, and who to take it to.
  assert.match(ROOT_CAUSE_NOTE, /medication-overuse/,
    'without this term the note is generic advice and stops warning about the actual failure mode');
  assert.match(ROOT_CAUSE_NOTE, /triggers?/i,
    'the note tells people what to track; without it there is nothing to act on');
  assert.match(ROOT_CAUSE_NOTE, /clinician/i,
    'the note must hand the root cause to a professional, not leave the reader to self-manage it');
  assert.ok(ROOT_CAUSE_NOTE.length > 200,
    `the note was trimmed to ${ROOT_CAUSE_NOTE.length} characters; the trigger list is the substance of it`);
});

test('guidance stays non-diagnostic: no drug names, no dosing', () => {
  // A policy tripwire rather than a behaviour test: it cannot go red for any
  // regression of today's copy, only for a future edit that starts prescribing.
  // Kept here with the guidance strings it guards, and widened past the name
  // list so a dose written with a drug nobody enumerated is still caught.
  const all = [ROOT_CAUSE_NOTE, guidanceFor(7).title, ...guidanceFor(7).items,
    guidanceFor(8).title, ...guidanceFor(8).items].join(' ').toLowerCase();
  for (const banned of ['ibuprofen', 'paracetamol', 'acetaminophen', 'aspirin', 'sumatriptan', 'triptan']) {
    assert.ok(!all.includes(banned), `guidance names a drug (${banned}); this app does not prescribe`);
  }
  assert.doesNotMatch(all, /\b\d+\s?(mg|ml|mcg|g)\b/,
    'guidance states a dose; this app does not prescribe, whatever the substance is called');
});

// ---------------------------------------------------------------------------
// zones.js: intensityBand
// ---------------------------------------------------------------------------

test('intensityBand returns the documented label at every boundary', () => {
  const expected = {
    0: 'None',
    1: 'Mild', 2: 'Mild', 3: 'Mild',
    4: 'Moderate', 5: 'Moderate', 6: 'Moderate',
    7: 'Severe', 8: 'Severe', 9: 'Severe',
    10: 'Worst possible'
  };
  for (const [v, label] of Object.entries(expected)) {
    assert.equal(intensityBand(Number(v)).label, label, `${v}/10 is no longer "${label}"`);
  }
});

test('INTENSITY_BANDS ascends and ends at 10, which is what makes find() correct', () => {
  const maxes = INTENSITY_BANDS.map(b => b.max);
  for (let i = 1; i < maxes.length; i++) {
    assert.ok(maxes[i] > maxes[i - 1],
      `band maxes are not ascending (${maxes.join(', ')}); find() would return the wrong band`);
  }
  assert.equal(maxes[maxes.length - 1], 10, 'the top band must reach the top of the 0-10 slider');
  assert.equal(maxes[0], 0, 'the first band must be the zero-pain band');
  for (const b of INTENSITY_BANDS) {
    assert.ok(b.desc && b.desc.length > 3, `${b.label} lost its plain-language description`);
  }
});

test('intensityBand above the top, or on a value that is not a number, still returns a band rather than undefined', () => {
  const top = INTENSITY_BANDS[INTENSITY_BANDS.length - 1];
  assert.equal(intensityBand(11), top,
    'a value past the slider must clamp to the top band; callers read .label with no guard');
  // Every comparison against a non-number is false, so these take the `|| last`
  // branch. editor.js:35 and panel-explain.js:44 read .label straight off the
  // result, so the branch existing at all is what keeps a corrupt imported
  // marker from throwing mid-render.
  for (const bad of [NaN, undefined]) {
    assert.equal(intensityBand(bad), top, `intensityBand(${String(bad)}) returned no band; .label would throw`);
  }
});

// ---------------------------------------------------------------------------
// zones.js: depthById / qualityById / spreadById
// ---------------------------------------------------------------------------

test('depthById falls back to the on-the-skin depth instead of returning undefined', () => {
  for (const bad of ['nonsense', '', null, undefined]) {
    const d = depthById(bad);
    assert.ok(d, `depthById(${JSON.stringify(bad)}) returned nothing; every caller dereferences it`);
    // By id, not by DEPTHS[0]: comparing against the index restates the source
    // expression, so a reorder of DEPTHS would change which depth an unknown id
    // resolves to and this test would not notice.
    assert.equal(d.id, 'surface', `depthById(${JSON.stringify(bad)}) fell back to "${d.id}", not the documented "surface"`);
    assert.ok(d.short, 'editor.js reads depthById(...).short with no guard');
    assert.ok(d.plain, 'legend.js builds its sentence from .plain');
  }
});

test('every real depth id resolves to its own entry, and each carries the short chip the points list prints', () => {
  assert.equal(DEPTHS.length, 4, 'the depth vocabulary changed size; the editor radio group is authored against it');
  const shorts = new Set();
  for (const d of DEPTHS) {
    assert.equal(depthById(d.id), d, `depthById("${d.id}") resolved to another depth`);
    // editor.js:166 puts `depthById(m.depth).short` straight into the points-list
    // meta line, so a depth missing one renders the literal word "undefined"
    // next to every marker at that depth. Nothing else in tests/ reads .short.
    assert.equal(typeof d.short, 'string', `${d.id} has no short chip; the points list would read "undefined"`);
    assert.ok(d.short.trim().length > 0, `${d.id} has an empty short chip`);
    shorts.add(d.short);
  }
  assert.equal(shorts.size, DEPTHS.length,
    `two depths share a short chip (${[...shorts].join(', ')}); the points list could not tell them apart`);
});

test('an unset attribute and a corrupt one resolve to the same defaults a fresh marker is created with', () => {
  // The default depth and spread are written down twice over: state.js's
  // defaultMarker hard-codes 'surface'/'small' (presets.js:59 repeats it), and
  // depthById/spreadById fall back to an array index. Nothing else makes those
  // two agree, so a reorder of DEPTHS or SPREADS would leave a marker saved
  // without a depth rendering one word and a marker with a corrupt depth
  // rendering another.
  const fresh = defaultMarker();
  assert.equal(depthById('nonsense'), depthById(fresh.depth),
    `a corrupt depth resolves to "${depthById('nonsense').id}" but a fresh marker is created as "${fresh.depth}"`);
  assert.equal(spreadById('nonsense'), spreadById(fresh.spread),
    `a corrupt spread resolves to "${spreadById('nonsense').id}" but a fresh marker is created as "${fresh.spread}"`);
});

test('qualityById returns null for an unknown id, so "no quality chosen" stays distinguishable', () => {
  for (const bad of ['nonsense', '', null, undefined]) {
    assert.equal(qualityById(bad), null,
      `qualityById(${JSON.stringify(bad)}) must be null; the editor prints q?.label and a fallback would invent a symptom`);
  }
  // The loop below asserts nothing at all if QUALITIES is ever emptied, so its
  // size is pinned first: deleting every pain-quality option in the app used to
  // leave this test green.
  assert.ok(QUALITIES.length >= 8,
    `only ${QUALITIES.length} qualities left; the vocabulary was gutted and the lookup below proves nothing`);
  for (const q of QUALITIES) {
    const hit = qualityById(q.id);
    assert.equal(hit, q, `qualityById("${q.id}") resolved to another quality`);
    assert.ok(hit.label && hit.label.trim(), `${q.id} has no label; editor.js:166 prints q?.label into the points list`);
  }
});

test('spreadById falls back to the small spread rather than undefined', () => {
  for (const bad of ['nonsense', '', null, undefined]) {
    const s = spreadById(bad);
    assert.ok(s, `spreadById(${JSON.stringify(bad)}) returned nothing; markers.js dereferences it`);
    // Again by id: `assert.equal(s, SPREADS[1])` would be a restatement of the
    // source and could not catch a reorder.
    assert.equal(s.id, 'small', `the fallback spread is deliberately the mid-small one, not "${s.id}"`);
    assert.equal(typeof s.radius, 'number', 'markers.js reads spreadById(...).radius with no guard');
  }
  for (const s of SPREADS) assert.equal(spreadById(s.id), s, `spreadById("${s.id}") resolved to another spread`);
});

test('every spread radius is a positive number that grows from pinpoint to diffuse', () => {
  assert.equal(SPREADS[0].id, 'pinpoint', 'the ramp is ordered smallest-first; reordering breaks the decal sizes');
  assert.equal(SPREADS[SPREADS.length - 1].id, 'diffuse');
  for (const s of SPREADS) {
    assert.equal(typeof s.radius, 'number', `${s.id} has a non-numeric radius`);
    assert.ok(Number.isFinite(s.radius) && s.radius > 0, `${s.id} has radius ${s.radius}; a decal cannot be drawn at that size`);
  }
  for (let i = 1; i < SPREADS.length; i++) {
    assert.ok(SPREADS[i].radius > SPREADS[i - 1].radius,
      `${SPREADS[i].id} (${SPREADS[i].radius}) is not larger than ${SPREADS[i - 1].id} (${SPREADS[i - 1].radius}); a widespread pain would render smaller than a pinpoint one`);
  }
});
