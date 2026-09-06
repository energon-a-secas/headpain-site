// The advice ladder and the attribute lookups underneath it.
//
// Two invariants live here. First, the intensity thresholds: guidanceFor() is the
// only thing deciding whether someone at 8/10 is told to act now or told nothing
// at all, so every boundary is pinned exactly rather than "roughly". Second, the
// zones.js lookups are total: the editor, the legend and the decal renderer all
// dereference their return value without a null check (`depthById(m.depth).short`,
// `spreadById(marker.spread).radius`), so a lookup that returns undefined for an
// unknown id is a crash, and a spread radius ramp that is not monotonic draws a
// widespread pain smaller than a pinpoint one.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guidanceFor, ROOT_CAUSE_NOTE } from '../js/guidance.js';
import {
  DEPTHS, QUALITIES, SPREADS, INTENSITY_BANDS,
  intensityBand, depthById, qualityById, spreadById
} from '../js/zones.js';

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
  assert.match(g.title, /7/, 'the rising card names the level it is about');
});

test('8, 9 and 10 all get the severe card, so nobody at 8/10 is shown the milder advice', () => {
  const severe = guidanceFor(8);
  assert.notEqual(severe, null);
  assert.equal(severe.severe, true, '8/10 must be flagged severe; editor.js gates ROOT_CAUSE_NOTE on this flag');
  assert.equal(guidanceFor(9), severe, '9/10 fell into a different tier than 8/10');
  assert.equal(guidanceFor(10), severe, '10/10 fell into a different tier than 8/10');
  assert.notEqual(guidanceFor(7), severe, 'the 7 and 8 tiers collapsed into one card');
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

test('ROOT_CAUSE_NOTE names medication-overuse headache, which is the whole reason it exists', () => {
  assert.match(ROOT_CAUSE_NOTE, /medication-overuse/,
    'without this term the note is generic advice and stops warning about the actual failure mode');
  assert.ok(ROOT_CAUSE_NOTE.length > 120, 'the note was trimmed to a slogan');
});

test('guidance stays non-diagnostic: no drug names, no dosing', () => {
  const all = [ROOT_CAUSE_NOTE, guidanceFor(7).title, ...guidanceFor(7).items,
    guidanceFor(8).title, ...guidanceFor(8).items].join(' ').toLowerCase();
  for (const banned of ['ibuprofen', 'paracetamol', 'acetaminophen', 'aspirin', 'sumatriptan', 'triptan', ' mg']) {
    assert.ok(!all.includes(banned), `guidance names a drug or a dose (${banned.trim()}); this app does not prescribe`);
  }
});

// ---------------------------------------------------------------------------
// zones.js: intensityBand
// ---------------------------------------------------------------------------

test('intensityBand covers every integer 0..10 with no gap and no undefined', () => {
  for (let v = 0; v <= 10; v++) {
    const band = intensityBand(v);
    assert.ok(band, `${v}/10 fell through every band`);
    assert.equal(typeof band.label, 'string');
    assert.ok(band.label.length > 0, `${v}/10 got a band with no label`);
    assert.ok(v <= band.max, `${v}/10 was matched to band max ${band.max}`);
  }
});

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

test('intensityBand above the top still returns a band rather than undefined', () => {
  assert.equal(intensityBand(11), INTENSITY_BANDS[INTENSITY_BANDS.length - 1],
    'a value past the slider must clamp to the top band; callers read .label with no guard');
});

// ---------------------------------------------------------------------------
// zones.js: depthById / qualityById / spreadById
// ---------------------------------------------------------------------------

test('depthById falls back to the first depth instead of returning undefined', () => {
  for (const bad of ['nonsense', '', null, undefined]) {
    const d = depthById(bad);
    assert.equal(d, DEPTHS[0], `depthById(${JSON.stringify(bad)}) did not fall back`);
    assert.ok(d.short, 'editor.js reads depthById(...).short with no guard');
    assert.ok(d.plain, 'legend.js builds its sentence from .plain');
  }
});

test('depthById returns the matching depth for every real id', () => {
  for (const d of DEPTHS) assert.equal(depthById(d.id), d);
});

test('qualityById returns null for an unknown id, so "no quality chosen" stays distinguishable', () => {
  for (const bad of ['nonsense', '', null, undefined]) {
    assert.equal(qualityById(bad), null,
      `qualityById(${JSON.stringify(bad)}) must be null; the editor prints q?.label and a fallback would invent a symptom`);
  }
  for (const q of QUALITIES) assert.equal(qualityById(q.id), q);
});

test('spreadById falls back to the small spread rather than undefined', () => {
  for (const bad of ['nonsense', '', null, undefined]) {
    const s = spreadById(bad);
    assert.equal(s, SPREADS[1], `spreadById(${JSON.stringify(bad)}) did not fall back to the documented default`);
    assert.equal(s.id, 'small', 'the fallback spread is deliberately the mid-small one, not the pinpoint');
    assert.equal(typeof s.radius, 'number', 'markers.js reads spreadById(...).radius with no guard');
  }
  for (const s of SPREADS) assert.equal(spreadById(s.id), s);
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
