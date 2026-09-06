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
      assert.match(o.phrase, /^[a-z]/,
        `${name}/${o.id} phrase does not open with a lowercase letter; it is spliced into the middle of a sentence`);
      assert.ok(!o.phrase.endsWith('.'), `${name}/${o.id} phrase ends a sentence the builder also ends`);
    }
  }
});

// A share link carries indices and bitmask bits, never ids: position N in these
// arrays IS the wire format. Pinned once, here, as literals. Reordering a list
// or inserting an option anywhere but the end then fails on the line that says
// why, instead of silently rewriting every link ever sent.
test('the option id order is the wire format, so no list may be reordered or inserted into', () => {
  assert.deepEqual(FREQUENCIES.map(o => o.id),
    ['rare', 'monthly', 'few-monthly', 'weekly', 'most-days', 'daily', 'constant']);
  assert.deepEqual(DURATIONS.map(o => o.id),
    ['seconds', 'under-1h', 'few-hours', 'most-of-day', 'days', 'ongoing']);
  assert.deepEqual(BLOCKED.map(o => o.id),
    ['work', 'screens', 'drive', 'sleep', 'care', 'social', 'exercise', 'chores', 'lie-down']);
  assert.deepEqual(SYMPTOMS.map(o => o.id),
    ['nausea', 'vomiting', 'light', 'sound', 'smell', 'aura', 'tearing', 'congestion', 'dizzy', 'neck']);
  assert.deepEqual(RELIEF.map(o => o.id),
    ['dark', 'quiet', 'sleep', 'cold', 'heat', 'caffeine', 'air', 'massage', 'still']);
});

test('every checkbox group in IMPACT_FIELDS carries its own question and its own option list', () => {
  // The pairing, not membership in the set of exported lists: a group wired to
  // the wrong list renders symptom checkboxes under "What does it stop you
  // doing?", and normalizeImpact then discards every tick made there, because
  // it filters blocked against BLOCKED.
  const OPTIONS_FOR = { blocked: BLOCKED, symptoms: SYMPTOMS, relief: RELIEF };
  const TITLE_FOR = {
    blocked: 'What does it stop you doing?',
    symptoms: 'What comes with it?',
    relief: 'What helps?'
  };
  const empty = emptyImpact();
  for (const field of IMPACT_FIELDS) {
    assert.ok(Array.isArray(empty[field.key]), `IMPACT_FIELDS key "${field.key}" is not an array field of an impact`);
    assert.equal(field.options, OPTIONS_FOR[field.key], `${field.key} renders the wrong option list`);
    assert.equal(field.title, TITLE_FOR[field.key], `${field.key} asks the wrong question above its checkboxes`);
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

test('the one id two lists share, "sleep", stays in the list it was ticked in', () => {
  // BLOCKED and RELIEF both define 'sleep' (it stops me sleeping / sleep helps)
  // and that collision is deliberate. The cross-leak test above picks ids that
  // do not collide, so it cannot see a list cross-wired to a colliding id;
  // this one can, because 'sleep' sits at a different index in each list.
  const shared = BLOCKED.map(o => o.id).filter(id => RELIEF.some(o => o.id === id));
  assert.deepEqual(shared, ['sleep'], 'a newly duplicated id needs a decision, not a silent collision');
  assert.ok(!SYMPTOMS.some(o => o.id === 'sleep'), 'sleep is not a symptom');

  const got = normalizeImpact({ blocked: ['sleep'], symptoms: ['sleep'], relief: ['sleep'] });
  assert.deepEqual(got.blocked, ['sleep']);
  assert.deepEqual(got.symptoms, [], 'the shared id is not a symptom and must not be kept as one');
  assert.deepEqual(got.relief, ['sleep']);

  // BLOCKED index 3 against RELIEF index 2: a cross-wired mask decodes to a
  // different word rather than to nothing, which is the failure that reads as
  // plausible output.
  const packed = packImpact(normalizeImpact({ blocked: ['sleep'] }));
  assert.deepEqual(packed, [-1, -1, 8, 0, 0, 0], 'sleep is bit 3 of the blocked mask and nothing else');
  const decoded = unpackImpact(packed);
  assert.deepEqual(decoded.blocked, ['sleep']);
  assert.deepEqual(decoded.relief, [], 'the blocked mask leaked into relief');
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

// The hole this test opened, since closed in js/impact.js: normalizeImpact
// decided before it rounded, so every other reject path yielded null but a
// value in (0, 0.5) yielded 0, and the field was neither null nor an integer in
// 1..31. Harmless in the app (0 is falsy, so hasImpact stayed false and no
// sentence was emitted) but it was the one input that could put a non-null,
// non-answer into a stored episode. Kept as the regression pin.
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
    'normalizeImpact clamps before the builder sees the number, so the sentence reports 31'
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

  // The builder does no clamping and no coercion of its own: normalizeImpact is
  // the only thing that clamps, and legend.js hands the builder whatever the
  // episode holds. Both lines below are characterisation, not a requirement.
  assert.deepEqual(impactSentences({ daysLost: 40 }),
    ['In the last month it cost me about 40 days.'],
    'the clamp lives in normalizeImpact; moving it here would hide an unclamped stored value');
  // The guard coerces, so a value that skipped normalizeImpact still reads as
  // English. This used to be pinned as "1 days" with the label "characterisation,
  // not a requirement", which locked the defect in place: fixing it turned the
  // suite red.
  assert.deepEqual(impactSentences({ daysLost: '1' }),
    ['In the last month it cost me about 1 day.'],
    'the plural guard stopped coercing, so an unnormalised value pluralises wrongly again');
  assert.deepEqual(impactSentences({ daysLost: 1 }),
    ['In the last month it cost me about 1 day.']);
  assert.deepEqual(impactSentences({ daysLost: 2 }),
    ['In the last month it cost me about 2 days.']);
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
  // One strict deepEqual covers width, slot types and the index: a dropped
  // slot, a null where a 0 belongs, or a reordered DURATIONS all land here.
  assert.deepEqual(packed, [-1, 4, 0, 0, 0, 0],
    'the option index IS the wire format: reordering DURATIONS silently rewrites every share link ever sent');
});

test('a null payload and an all-minus-one tuple decode to empty, but a tuple of zeros does not', () => {
  // packImpact(emptyImpact()) is null, so the first line is the null path.
  assert.equal(packImpact(emptyImpact()), null);
  assert.deepEqual(unpackImpact(null), emptyImpact());
  assert.deepEqual(unpackImpact([-1, -1, 0, 0, 0, 0]), emptyImpact(), 'the "no answer" tuple');
  // A genuine tuple of zeros is not empty: 0 is a valid index into both lists,
  // which is what pins their first entry.
  assert.deepEqual(unpackImpact([0, 0, 0, 0, 0, 0]),
    { ...emptyImpact(), frequency: 'rare', duration: 'seconds' },
    'index 0 of FREQUENCIES and of DURATIONS, decoded');
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
  // Widths as literals, because a mask recomputed from the list it encodes
  // moves with it: deleting an option shifts every later bit (a share-link
  // break) and shortens a checkbox group (a content loss), and both would pass.
  assert.deepEqual(
    [FREQUENCIES.length, DURATIONS.length, BLOCKED.length, SYMPTOMS.length, RELIEF.length],
    [7, 6, 9, 10, 9],
    'an option was added or removed; the tuple below is the wire format that changed with it'
  );
  const impact = normalizeImpact({
    frequency: 'constant',
    duration: 'ongoing',
    blocked: BLOCKED.map(o => o.id),
    symptoms: SYMPTOMS.map(o => o.id),
    relief: RELIEF.map(o => o.id),
    daysLost: 31
  });
  assert.equal(impact.blocked.length, 9, 'a ticked activity was dropped on the way in');
  assert.deepEqual(packImpact(impact), [6, 5, 511, 1023, 511, 31],
    'the last index of each list, then every bit of each mask, then the day cap');
  assert.deepEqual(unpackImpact(packImpact(impact)), impact);
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
  // Per list, never against the union of all three: an id decoded from the
  // wrong list is a real break (a cross-wired unmask) and a union check cannot
  // see it. The decoded arrays are asserted outright as well, so a list that
  // decoded empty cannot leave its loop asserting nothing.
  assert.deepEqual(got.blocked, ['work', 'screens', 'drive', 'sleep', 'care', 'chores'],
    'the low nine bits of 99999, read in BLOCKED order');
  assert.equal(got.symptoms.length, 10, 'an all-bits mask decodes to every symptom, not to extras');
  assert.deepEqual(got.symptoms, SYMPTOMS.map(o => o.id));
  assert.deepEqual(got.relief, ['dark'], 'a fractional mask truncates to its integer bits');
  for (const [name, list, ids] of [
    ['BLOCKED', BLOCKED, got.blocked], ['SYMPTOMS', SYMPTOMS, got.symptoms], ['RELIEF', RELIEF, got.relief]
  ]) {
    assert.ok(ids.length > 0, `${name} decoded to nothing, so the check below asserts nothing`);
    for (const id of ids) {
      assert.ok(list.some(o => o.id === id), `${name} decoded an id it does not define: ${id}`);
    }
  }
});

// ---------------------------------------------------------------------------
// One gap, pinned rather than fixed
// ---------------------------------------------------------------------------

// A wrongly-typed list kills both public entry points outright:
//
//   impactSentences({ blocked: 'work' })  -> TypeError: (ids || []).map is not a function
//   packImpact({ blocked: 'work' })       -> TypeError: (ids || []).reduce is not a function
//
// hasImpact returns true on the string's own .length, and phrasesOf / mask then
// call .map / .reduce on it. normalizeImpact guards this exact case with
// Array.isArray (tested above) and every writer in js/ goes through it:
// state.js:300 on each patch, persist.js:189 on load, persist.js:229 on import.
// Nothing in the app can reach the throw today, so this is a robustness gap and
// not a live bug. It is worth pinning because the two callers that would hit it
// have no fallback: legend.js:104 builds the PNG legend and persist.js:46
// builds the share link, and a throw there loses the export instead of
// degrading it. Left as todo per the no-product-edits rule; the fix is one
// Array.isArray in js/impact.js.
test('a wrongly-typed list degrades to no selections instead of killing the PNG and the share link', () => {
  const raw = { ...emptyImpact(), blocked: 'work', daysLost: 2 };
  assert.deepEqual(impactSentences(raw), ['In the last month it cost me about 2 days.'],
    'the typed field is lost, the rest of the sentence survives');
  assert.deepEqual(packImpact(raw), [-1, -1, 0, 0, 0, 2]);
});
