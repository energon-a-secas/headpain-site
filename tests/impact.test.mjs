// The impact model: how often, how long, and what the pain costs you.
//
// Two invariants live here. First, nothing a user or a share link can supply
// may reach a sentence unvalidated: an unknown id must vanish rather than
// render "It stops me undefined." Second, the packed tuple is a wire format —
// a share link written today has to decode to the same impact tomorrow, so the
// index/bitmask encoding is pinned, not merely round-tripped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREQUENCIES, DURATIONS, BLOCKED, SYMPTOMS, RELIEF, IMPACT_FIELDS,
  emptyImpact, normalizeImpact, hasImpact, impactSentences, packImpact, unpackImpact
} from '../js/impact.js';

const LISTS = { FREQUENCIES, DURATIONS, BLOCKED, SYMPTOMS, RELIEF };

// ---------------------------------------------------------------------------
// The option vocabulary
// ---------------------------------------------------------------------------

test('every option list has unique ids, so one bitmask bit means exactly one thing', () => {
  for (const [name, list] of Object.entries(LISTS)) {
    const ids = list.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length, `${name} repeats an id; a toggle would set two checkboxes`);
    assert.ok(list.length > 0, `${name} is empty`);
  }
});

test('every option carries both a label and a phrase, so no sentence can say "undefined"', () => {
  for (const [name, list] of Object.entries(LISTS)) {
    for (const o of list) {
      assert.equal(typeof o.label, 'string', `${name}/${o.id} has no label for the form control`);
      assert.ok(o.label.trim().length > 1, `${name}/${o.id} has an unreadable label`);
      assert.equal(typeof o.phrase, 'string', `${name}/${o.id} has no phrase; impactSentences would print undefined`);
      assert.ok(o.phrase.trim().length > 1, `${name}/${o.id} has an unreadable phrase`);
    }
  }
});

test('phrases are mid-sentence fragments, so none of them starts with a capital or ends in a full stop', () => {
  for (const [name, list] of Object.entries(LISTS)) {
    for (const o of list) {
      assert.equal(o.phrase[0], o.phrase[0].toLowerCase(),
        `${name}/${o.id} phrase is capitalised; it is spliced into the middle of a sentence`);
      assert.ok(!o.phrase.endsWith('.'), `${name}/${o.id} phrase ends a sentence the builder also ends`);
    }
  }
});

test('every checkbox group in IMPACT_FIELDS names a real array field on an impact', () => {
  const empty = emptyImpact();
  for (const field of IMPACT_FIELDS) {
    assert.ok(Array.isArray(empty[field.key]), `IMPACT_FIELDS key "${field.key}" is not an array field of an impact`);
    assert.ok(field.title.length > 4, `${field.key} has no question to show above the checkboxes`);
    assert.ok(Object.values(LISTS).includes(field.options), `${field.key} points at an option list nothing else exports`);
  }
  assert.deepEqual(IMPACT_FIELDS.map(f => f.key), ['blocked', 'symptoms', 'relief']);
});

// ---------------------------------------------------------------------------
// emptyImpact / hasImpact
// ---------------------------------------------------------------------------

test('emptyImpact is genuinely empty, in every field', () => {
  assert.deepEqual(emptyImpact(), {
    frequency: null, duration: null, blocked: [], symptoms: [], relief: [], daysLost: null
  });
});

test('emptyImpact hands out fresh arrays, so two episodes cannot share one checkbox list', () => {
  const a = emptyImpact();
  const b = emptyImpact();
  a.blocked.push('work');
  a.frequency = 'daily';
  assert.deepEqual(b.blocked, [], 'the blocked array is shared between episodes');
  assert.equal(b.frequency, null);
});

test('hasImpact is false for nothing at all', () => {
  assert.equal(hasImpact(emptyImpact()), false);
  assert.equal(hasImpact(null), false);
  assert.equal(hasImpact(undefined), false);
  assert.equal(hasImpact({}), false, 'a legacy episode with no impact key must not claim to have one');
  assert.equal(hasImpact({ frequency: null, blocked: [] }), false);
});

test('hasImpact turns true on any single field on its own', () => {
  const only = patch => hasImpact({ ...emptyImpact(), ...patch });
  assert.equal(only({ frequency: 'daily' }), true, 'frequency alone');
  assert.equal(only({ duration: 'few-hours' }), true, 'duration alone');
  assert.equal(only({ blocked: ['work'] }), true, 'blocked alone');
  assert.equal(only({ symptoms: ['nausea'] }), true, 'symptoms alone');
  assert.equal(only({ relief: ['dark'] }), true, 'relief alone');
  assert.equal(only({ daysLost: 1 }), true, 'a single lost day alone');
});

// ---------------------------------------------------------------------------
// normalizeImpact
// ---------------------------------------------------------------------------

test('normalizeImpact drops an unknown id from every list rather than storing it', () => {
  const got = normalizeImpact({
    frequency: 'hourly',
    duration: 'forever',
    blocked: ['work', 'no-such-thing'],
    symptoms: ['nausea', 'zzz'],
    relief: ['dark', '']
  });
  assert.equal(got.frequency, null, 'an unknown frequency id must not survive into storage');
  assert.equal(got.duration, null);
  assert.deepEqual(got.blocked, ['work']);
  assert.deepEqual(got.symptoms, ['nausea']);
  assert.deepEqual(got.relief, ['dark']);
});

test('normalizeImpact does not let an id from one list leak into another', () => {
  const got = normalizeImpact({ blocked: ['nausea'], symptoms: ['drive'], relief: ['vomiting'] });
  assert.deepEqual(got.blocked, [], 'a symptom id was accepted as an activity');
  assert.deepEqual(got.symptoms, [], 'an activity id was accepted as a symptom');
  assert.deepEqual(got.relief, [], 'a symptom id was accepted as relief');
});

test('normalizeImpact returns an empty impact for null, undefined and non-objects', () => {
  for (const junk of [null, undefined, 'nonsense', 42, true, NaN]) {
    assert.deepEqual(normalizeImpact(junk), emptyImpact(), `normalizeImpact(${String(junk)}) was not empty`);
  }
});

test('normalizeImpact treats a non-array list as no selections instead of iterating it', () => {
  assert.deepEqual(normalizeImpact({ blocked: 'work' }).blocked, [],
    'a string list would otherwise be filtered character by character');
  assert.deepEqual(normalizeImpact({ symptoms: null }).symptoms, []);
  assert.deepEqual(normalizeImpact({ relief: { 0: 'dark' } }).relief, []);
  assert.deepEqual(normalizeImpact([]), emptyImpact(), 'an array is an object; it still carries no fields');
});

test('normalizeImpact emits exactly the persisted shape, dropping unknown keys', () => {
  const got = normalizeImpact({ frequency: 'daily', bogus: 1, notes: 'hello' });
  assert.deepEqual(Object.keys(got).sort(), Object.keys(emptyImpact()).sort(),
    'an extra key would be written to localStorage and to share links forever');
  assert.equal(got.frequency, 'daily');
});

test('normalizeImpact clamps daysLost to a sane month', () => {
  const days = raw => normalizeImpact({ daysLost: raw }).daysLost;
  assert.equal(days(-3), null, 'a negative day count is not a day count');
  assert.equal(days(0), null, 'zero lost days is "no answer", not an answer');
  assert.equal(days(1), 1);
  assert.equal(days(31), 31);
  assert.equal(days(32), 31, 'a month has no 32nd day');
  assert.equal(days(9999), 31);
  assert.equal(days(2.4), 2, 'a fractional day rounds down');
  assert.equal(days(2.6), 3, 'a fractional day rounds up');
  assert.equal(days(31.6), 31, 'rounding must not push past the cap');
});

test('normalizeImpact reads daysLost from a form control string but refuses text', () => {
  assert.equal(normalizeImpact({ daysLost: '5' }).daysLost, 5, 'input.value is a string, not a number');
  for (const junk of ['', 'lots', null, undefined, NaN, Infinity, [], {}, 'x5']) {
    assert.equal(normalizeImpact({ daysLost: junk }).daysLost, null,
      `daysLost accepted ${JSON.stringify(junk)}`);
  }
});

// A hole in the daysLost contract, left failing on purpose: every other reject
// path yields null, but a value in (0, 0.5) yields 0, so the field is neither
// null nor an integer in 1..31. Harmless today (0 is falsy, so hasImpact stays
// false and no sentence is emitted), but it is the one input that can put a
// non-null, non-answer into a stored episode. Fixing it is a one-word change in
// js/impact.js, which this task may not touch.
test('normalizeImpact rounds daysLost before deciding, so a fractional day is not stored as 0', () => {
  // Every reject path yields null. Before the fix, a value in (0, 0.5) yielded
  // 0, so the field was neither null nor an integer in 1..31.
  assert.equal(normalizeImpact({ daysLost: 0.4 }).daysLost, null);
  assert.equal(normalizeImpact({ daysLost: 0.5 }).daysLost, 1, 'rounds up at the halfway point');
  assert.equal(normalizeImpact({ daysLost: 0.6 }).daysLost, 1);
  assert.equal(normalizeImpact({ daysLost: 31.4 }).daysLost, 31, 'still clamped after rounding');
});

// ---------------------------------------------------------------------------
// impactSentences
// ---------------------------------------------------------------------------

test('impactSentences says nothing when there is nothing to say', () => {
  assert.deepEqual(impactSentences(emptyImpact()), []);
  assert.deepEqual(impactSentences(null), []);
  assert.deepEqual(impactSentences(undefined), []);
  assert.deepEqual(impactSentences({}), []);
});

test('frequency and duration collapse into one sentence, and each stands alone without the other', () => {
  assert.deepEqual(
    impactSentences(normalizeImpact({ frequency: 'weekly', duration: 'few-hours' })),
    ['It happens about once a week, and lasts for a few hours.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ frequency: 'weekly' })),
    ['It happens about once a week.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ duration: 'few-hours' })),
    ['It lasts for a few hours.']
  );
});

test('one blocked activity reads without a joiner; two take "and"; three take a comma then "and"', () => {
  assert.deepEqual(
    impactSentences(normalizeImpact({ blocked: ['work'] })),
    ['It stops me working.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ blocked: ['work', 'sleep'] })),
    ['It stops me working and sleeping.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ blocked: ['work', 'screens', 'drive'] })),
    ['It stops me working, using a screen and driving.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ blocked: ['work', 'screens', 'drive', 'sleep'] })),
    ['It stops me working, using a screen, driving and sleeping.']
  );
});

test('one lost day is a day, not "1 days"', () => {
  assert.deepEqual(
    impactSentences(normalizeImpact({ daysLost: 1 })),
    ['In the last month it cost me about 1 day.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ daysLost: 4 })),
    ['In the last month it cost me about 4 days.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ daysLost: 40 })),
    ['In the last month it cost me about 31 days.'],
    'the sentence must report the clamped figure, not the one that was typed'
  );
});

test('symptoms and relief each get their own lead-in', () => {
  assert.deepEqual(
    impactSentences(normalizeImpact({ symptoms: ['nausea', 'light'] })),
    ['It comes with nausea and light hurting.']
  );
  assert.deepEqual(
    impactSentences(normalizeImpact({ relief: ['dark', 'quiet', 'sleep'] })),
    ['What helps: a dark room, quiet and sleep.']
  );
});

test('a full impact reads as five sentences in consultation order', () => {
  const impact = normalizeImpact({
    frequency: 'most-days',
    duration: 'most-of-day',
    blocked: ['work', 'screens'],
    symptoms: ['nausea'],
    relief: ['dark', 'quiet'],
    daysLost: 3
  });
  assert.deepEqual(impactSentences(impact), [
    'It happens most days, and lasts for most of a day.',
    'It stops me working and using a screen.',
    'In the last month it cost me about 3 days.',
    'It comes with nausea.',
    'What helps: a dark room and quiet.'
  ]);
});

test('an impact that was never normalized still cannot print "undefined" into the PNG legend', () => {
  const raw = {
    frequency: 'hourly',
    duration: 'forever',
    blocked: ['work', 'ghost'],
    symptoms: ['ghost'],
    relief: ['ghost', 'quiet'],
    daysLost: 2
  };
  const out = impactSentences(raw);
  for (const line of out) {
    assert.ok(!line.includes('undefined'), `sentence leaked an unknown id: ${line}`);
    assert.match(line, /\.$/, `sentence is unterminated: ${line}`);
  }
  assert.deepEqual(out, [
    'It stops me working.',
    'In the last month it cost me about 2 days.',
    'What helps: quiet.'
  ], 'unknown ids must drop out of the list without leaving an empty slot in the joiner');
});

// ---------------------------------------------------------------------------
// packImpact / unpackImpact — the share-link wire format
// ---------------------------------------------------------------------------

test('packImpact returns null when there is nothing to pack, so an empty share link stays short', () => {
  assert.equal(packImpact(emptyImpact()), null);
  assert.equal(packImpact(null), null);
  assert.equal(packImpact(undefined), null);
  assert.equal(packImpact({}), null);
});

test('the packed form is six numbers, with -1 for an unanswered frequency or duration', () => {
  const packed = packImpact(normalizeImpact({ duration: 'days' }));
  assert.equal(packed.length, 6, 'the tuple width is part of the share-link format');
  assert.ok(packed.every(n => typeof n === 'number' && Number.isFinite(n)),
    'a non-number would survive JSON but decode as garbage');
  assert.deepEqual(packed, [-1, 4, 0, 0, 0, 0],
    'the option index IS the wire format: reordering DURATIONS silently rewrites every share link ever sent');
});

test('an empty impact decodes back to an empty impact, from null or from a tuple of zeros', () => {
  assert.deepEqual(unpackImpact(packImpact(emptyImpact())), emptyImpact());
  assert.deepEqual(unpackImpact([-1, -1, 0, 0, 0, 0]), emptyImpact());
});

test('a single field round-trips through pack/unpack unchanged', () => {
  for (const patch of [
    { frequency: 'rare' },
    { frequency: 'constant' },
    { duration: 'seconds' },
    { duration: 'ongoing' },
    { blocked: ['lie-down'] },
    { symptoms: ['neck'] },
    { relief: ['still'] },
    { daysLost: 12 }
  ]) {
    const impact = normalizeImpact(patch);
    assert.deepEqual(unpackImpact(packImpact(impact)), impact, `lost ${JSON.stringify(patch)} in transit`);
  }
});

test('an impact with every option ticked round-trips, so no bitmask bit falls off the end', () => {
  const impact = normalizeImpact({
    frequency: FREQUENCIES[FREQUENCIES.length - 1].id,
    duration: DURATIONS[DURATIONS.length - 1].id,
    blocked: BLOCKED.map(o => o.id),
    symptoms: SYMPTOMS.map(o => o.id),
    relief: RELIEF.map(o => o.id),
    daysLost: 31
  });
  const packed = packImpact(impact);
  assert.equal(packed[0], FREQUENCIES.length - 1);
  assert.equal(packed[1], DURATIONS.length - 1);
  assert.equal(packed[2], (1 << BLOCKED.length) - 1, 'the blocked mask is missing a bit (off-by-one in the shift)');
  assert.equal(packed[3], (1 << SYMPTOMS.length) - 1, 'the symptom mask is missing a bit');
  assert.equal(packed[4], (1 << RELIEF.length) - 1, 'the relief mask is missing a bit');
  assert.equal(packed[5], 31);
  assert.deepEqual(unpackImpact(packed), impact);
  assert.equal(unpackImpact(packed).blocked.length, BLOCKED.length);
});

test('unpacking sorts selections into option order, so a share link does not depend on click order', () => {
  const clicked = normalizeImpact({ blocked: ['sleep', 'work'], relief: ['quiet', 'dark'] });
  const decoded = unpackImpact(packImpact(clicked));
  assert.deepEqual(decoded.blocked, ['work', 'sleep']);
  assert.deepEqual(decoded.relief, ['dark', 'quiet']);
});

test('an unknown id contributes no bit rather than corrupting the mask', () => {
  const packed = packImpact({ ...emptyImpact(), blocked: ['ghost', 'sleep'] });
  assert.equal(packed[2], 1 << 3, 'the ghost id shifted the real selection');
  assert.deepEqual(unpackImpact(packed).blocked, ['sleep']);
});

test('unpackImpact survives a malformed tuple instead of throwing on the boot path', () => {
  for (const junk of [null, undefined, 'abc', 42, {}, { 0: 1 }]) {
    assert.deepEqual(unpackImpact(junk), emptyImpact(), `unpackImpact(${JSON.stringify(junk)}) was not empty`);
  }
  assert.deepEqual(unpackImpact([]), emptyImpact(), 'a zero-length tuple');
  assert.deepEqual(unpackImpact([null, null, null, null, null, null]), emptyImpact(), 'a tuple of nulls');
  assert.deepEqual(unpackImpact(['a', 'b', 'c', 'd', 'e', 'f']), emptyImpact(), 'a tuple of strings');
  assert.deepEqual(unpackImpact([0]), { ...emptyImpact(), frequency: FREQUENCIES[0].id },
    'a short tuple keeps the fields it does carry');
});

test('a hostile share link cannot inject an unknown id or an impossible day count', () => {
  const got = unpackImpact([99, -7, 99999, -1, 1.5, 999]);
  assert.equal(got.frequency, null, 'an out-of-range index must decode to no answer');
  assert.equal(got.duration, null);
  assert.equal(got.daysLost, 31, 'a decoded day count goes through the same clamp as a typed one');
  const known = new Set([...BLOCKED, ...SYMPTOMS, ...RELIEF].map(o => o.id));
  for (const id of [...got.blocked, ...got.symptoms, ...got.relief]) {
    assert.ok(known.has(id), `decoded an id no option list defines: ${id}`);
  }
  assert.equal(got.symptoms.length, SYMPTOMS.length, 'an all-bits mask decodes to every symptom, not to extras');
});
