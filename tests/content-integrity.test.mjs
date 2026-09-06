// Content vs model integrity: every zone id the content names must exist on the
// baked head. This is the failure mode with no error message anywhere —
// materializeSpots() silently skips a marker whose zone the model does not
// carry, so one mistyped id makes a published pattern render fewer points and
// nothing complains. The same goes for the vocabularies the prose is built
// from: a missing `plain` string puts the word "undefined" in a sentence a
// patient hands to a doctor.
//
// Second invariant, same silence: assets/zones.baked.json is generated from
// js/zones.js by `node tools/bake-zones.mjs`, and nothing at runtime notices a
// stale bake. Labels, priorities and extents are compared here against the
// authored source, not just ids, because an unrebaked label edit is invisible
// everywhere else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry, baked, readSource, SOME_ZONE } from './fixtures.mjs';
import { CONDITIONS } from '../js/conditions.js';
import { DEMOS } from '../js/demos.js';
import { ZONES, VIRTUAL_ZONES, ZONE_GROUPS, DEPTHS, QUALITIES, SPREADS } from '../js/zones.js';
import { GROUP_COLOR_NAMES, colorName } from '../js/groups.js';
import { PATTERNS, isPattern, patternLabel } from '../js/patterns.js';
import { episodeFromCondition, episodeFromDemo, conditionById } from '../js/presets.js';

// The bake contract (tools/bake-zones.mjs:227-234): a mirror:true entry becomes
// a -left/-right pair whose label gains an (L)/(R) suffix, anything else keeps
// its authored id and label verbatim, which is why the authored id already
// carries "-center" where the author wanted one. Restated here so the expected
// values come from the contract rather than from the generated file.
const bakedVariants = z => (z.mirror
  ? [{ id: `${z.id}-left`, label: `${z.label} (L)`, side: 'left' },
     { id: `${z.id}-right`, label: `${z.label} (R)`, side: 'right' }]
  : [{ id: z.id, label: z.label, side: 'center' }]);
const bakedIdsFor = z => bakedVariants(z).map(v => v.id);

// The seeding rule presetMarkers() documents, restated from the *authored*
// content so an expected marker count comes from the condition rather than from
// the function under test. A change to the rule in js/conditions.js has to be
// made here too, deliberately, which is the point.
const seedZonesFor = c => (c.laterality === 'strict-unilateral'
  ? c.primary.filter(z => !z.endsWith('-right'))
  : c.primary);

test('every zone a condition names exists on the model, so no published pattern silently loses points', () => {
  const missing = [];
  for (const c of CONDITIONS) {
    for (const key of ['primary', 'secondary']) {
      for (const zoneId of c[key]) {
        if (!registry.zoneById(zoneId)) missing.push(`${c.id}.${key}: ${zoneId}`);
      }
    }
  }
  assert.deepEqual(missing, [],
    'materializeSpots() drops these markers; the condition renders short with no error');
});

test('a demo that hand-writes a marker names a zone the model carries, and at least one demo still does', () => {
  // Only one demo pain hand-writes markers today; the rest seed from a
  // condition and contribute nothing here. Without the guard, converting that
  // last one to a conditionId would leave this test passing on an empty loop.
  const hand = DEMOS.flatMap(d => d.groups.flatMap(g => (g.markers || []).map(m => [`${d.id}/${g.name}`, m.zoneId])));
  assert.ok(hand.length > 0,
    'no demo hand-writes a marker any more; this test now checks nothing and should be retired or re-aimed');
  const missing = hand.filter(([, id]) => !registry.zoneById(id)).map(([where, id]) => `${where}: ${id}`);
  assert.deepEqual(missing, [],
    'materializeSpots() drops these; the gallery card renders fewer points than its blurb promises');
});

test('every demo pain that cites a condition cites one that exists, or the demo loads empty', () => {
  const dangling = DEMOS.flatMap(d => d.groups
    .filter(g => g.conditionId && !conditionById(g.conditionId))
    .map(g => `${d.id}: ${g.conditionId}`));
  assert.deepEqual(dangling, [],
    'episodeFromDemo() calls presetMarkers(null) on a dangling id');
});

test('the baked atlas carries exactly the zone ids js/zones.js authors, mirrored pairs included', () => {
  const expected = new Set(ZONES.flatMap(bakedIdsFor));
  const actual = new Set(baked.zones.map(z => z.id));
  const missing = [...expected].filter(id => !actual.has(id));
  const extra = [...actual].filter(id => !expected.has(id));
  assert.deepEqual(missing, [], 'authored zones with no baked geometry: unclickable and unpickable');
  assert.deepEqual(extra, [], 'baked zones nothing authors: no label, no group, no description');
});

test('the baked atlas carries the labels, priorities and extents js/zones.js authors, so a stale bake cannot pass unnoticed', () => {
  const wrong = [];
  const factors = [];
  for (const z of ZONES) {
    for (const v of bakedVariants(z)) {
      const b = registry.zoneById(v.id);
      if (b.label !== v.label) wrong.push(`${v.id}: label "${b.label}" != "${v.label}"`);
      if (b.priority !== (z.priority || 0)) wrong.push(`${v.id}: priority ${b.priority} != ${z.priority || 0}`);
      // The baker multiplies every extent by ONE model-normalisation factor
      // (z.ru *= scale), so each zone must recover the same factor. A zone that
      // recovers a different one had its extents edited without a rebake.
      factors.push([`${v.id}.ru`, b.ru / z.extents[0]], [`${v.id}.rv`, b.rv / z.extents[1]]);
    }
  }
  assert.deepEqual(wrong, [],
    'the zone browser and the picking tie-break read these; the bake is stale, run node tools/bake-zones.mjs');
  const ref = factors.map(f => f[1]).sort((a, b) => a - b)[Math.floor(factors.length / 2)];
  const off = factors.filter(([, f]) => Math.abs(f - ref) > 1e-9).map(([name]) => name);
  assert.deepEqual(off, [],
    'these extents changed in js/zones.js without a rebake, so the patch on the model is the wrong size');
});

test('each baked zone reports the base id and side its authoring entry implies', () => {
  assert.deepEqual(ZONES.filter(z => z.side).map(z => z.id), [],
    'no authored zone declares its own side today; one that did would need this rule taught here and in the baker');
  const wrong = [];
  for (const z of ZONES) {
    for (const v of bakedVariants(z)) {
      const b = registry.zoneById(v.id);
      if (b.baseId !== z.id) wrong.push(`${v.id}: baseId ${b.baseId} != ${z.id}`);
      if (b.side !== v.side) wrong.push(`${v.id}: side ${b.side} != ${v.side}`);
      if (b.group !== z.group) wrong.push(`${v.id}: group ${b.group} != ${z.group}`);
    }
  }
  assert.deepEqual(wrong, [],
    'scoreConditions() reads zone.side for laterality; a wrong side flips one-sided into bilateral');
});

// Half-width of the centre band. The nearest off-centre anchor sits at |x|≈0.09
// and the furthest centre anchor at |x|≈0.03, so 0.05 separates them cleanly.
const MIDLINE = 0.05;

test('a baked zone sits on the side of the model it claims, so laterality is read off real geometry', () => {
  // js/zones.js states the convention: +x is the patient's LEFT. The side label
  // and the anchor are written by different halves of the baker (the suffix
  // loop and the vertex snap), so their agreement is a fact worth checking: a
  // sign flip in the mirroring would anchor "temple-left" on the patient's
  // right while every side string stayed perfectly consistent.
  const wrong = [];
  for (const b of baked.zones) {
    const x = b.anchor[0];
    if (b.side === 'left' && !(x > MIDLINE)) wrong.push(`${b.id}: side left but x=${x.toFixed(3)}`);
    if (b.side === 'right' && !(x < -MIDLINE)) wrong.push(`${b.id}: side right but x=${x.toFixed(3)}`);
    if (b.side === 'center' && Math.abs(x) > MIDLINE) wrong.push(`${b.id}: side center but x=${x.toFixed(3)}`);
  }
  assert.deepEqual(wrong, [],
    'a zone labelled one side and anchored on the other makes every laterality score a lie');
});

test('every virtual zone resolves through the registry, so "whole head" stays selectable', () => {
  assert.ok(VIRTUAL_ZONES.length > 0, 'the whole-head escape hatch is the only way to record diffuse pain');
  for (const v of VIRTUAL_ZONES) {
    const z = registry.zoneById(v.id);
    assert.ok(z, `${v.id} does not resolve; the zone list offers a row that places nothing`);
    assert.equal(z.virtual, true);
    assert.equal(z.baseId, v.id);
    assert.ok(z.index > baked.zones.length,
      `${v.id} took a slot inside the baked range and will be sampled from the atlas`);
  }
  assert.deepEqual(baked.virtualZones.map(v => v.id), VIRTUAL_ZONES.map(v => v.id),
    'the baked file and js/zones.js disagree about the pseudo-zones; the bake is stale');
});

test('the zone id the matcher hardcodes for diffuse pain is a zone that actually exists', () => {
  // scoreConditions() special-cases one literal id for "pain everywhere".
  // Renaming the virtual zone without renaming the literal makes every
  // diffuse-tolerant condition quietly score the whole-head marker at zero.
  const literals = [...readSource('js/conditions.js').matchAll(/m\.zoneId === '([^']+)'/g)].map(m => m[1]);
  assert.ok(literals.length > 0, 'the diffuse-pain branch of scoreConditions() disappeared');
  for (const id of literals) {
    const z = registry.zoneById(id);
    assert.ok(z, `conditions.js scores against "${id}", which no zone resolves to`);
    assert.equal(z.virtual, true, `"${id}" is the diffuse escape hatch and must stay a virtual zone`);
  }
});

test('ZONE_GROUPS labels every group the catalog uses, and carries no group nothing uses', () => {
  const used = new Set([...ZONES, ...VIRTUAL_ZONES].map(z => z.group));
  const unlabelled = [...used].filter(g => !ZONE_GROUPS[g]);
  assert.deepEqual(unlabelled, [], 'the zone browser renders these under an undefined heading');
  const unused = Object.keys(ZONE_GROUPS).filter(g => !used.has(g));
  assert.deepEqual(unused, [], 'an empty heading in the zone browser');
});

test('every ZONE_GROUPS order is unique, so the zone browser has one stable head-to-toe sequence', () => {
  const orders = Object.values(ZONE_GROUPS).map(g => g.order);
  assert.equal(new Set(orders).size, orders.length,
    'two groups sharing an order sort arbitrarily between reloads');
  for (const [id, g] of Object.entries(ZONE_GROUPS)) {
    assert.equal(typeof g.order, 'number', `${id} has a non-numeric order`);
    assert.ok(g.label && g.label.trim().length > 1, `${id} needs a heading a reader can read`);
  }
});

test('every depth, quality and spread has a plain phrase, so the legend never writes "undefined"', () => {
  for (const [name, list] of [['DEPTHS', DEPTHS], ['QUALITIES', QUALITIES], ['SPREADS', SPREADS]]) {
    assert.ok(list.length > 0, `${name} is empty`);
    const ids = list.map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, `${name} has a duplicate id`);
    for (const item of list) {
      assert.equal(typeof item.plain, 'string', `${name}.${item.id} has no plain phrase`);
      assert.ok(item.plain.trim().length > 2,
        `${name}.${item.id}: the explain sentence would read "...undefined"`);
      assert.ok(item.label && item.label.trim(), `${name}.${item.id} has no form label`);
    }
  }
});

test('every demo pain renders in the colour and glyph it declares, so an off-palette hex cannot silently become another hue', () => {
  // plainEpisode() falls back to nextGroupColor() for a colour outside the
  // palette, so the declared value surviving into the episode is the real
  // assertion: GROUP_COLORS.includes(g.color) only ever compares the palette
  // against its own elements, since demos.js indexes into it.
  const bad = [];
  for (const d of DEMOS) {
    const ep = episodeFromDemo(d.id, registry);
    d.groups.forEach((g, i) => {
      if (!isPattern(g.pattern)) bad.push(`${d.id}/${g.name}: pattern ${g.pattern} has no glyph`);
      if (ep.groups[i].color !== g.color) bad.push(`${d.id}/${g.name}: declared ${g.color}, rendered ${ep.groups[i].color}`);
      if (ep.groups[i].pattern !== g.pattern) bad.push(`${d.id}/${g.name}: declared ${g.pattern}, rendered ${ep.groups[i].pattern}`);
    });
  }
  assert.deepEqual(bad, [],
    'an off-palette colour is quietly swapped for the next free one, so the card no longer matches its blurb');
});

test('two pains in one demo differ in both channels, so a greyscale reader can still tell them apart', () => {
  const multi = DEMOS.filter(d => d.groups.length > 1);
  assert.ok(multi.length > 0,
    'no demo teaches the multi-pain workflow any more; this rule guards nothing and the gallery lost its point');
  for (const d of multi) {
    // Compare the rendered channel, not the raw hex: the legend reads colours
    // out by name and draws glyphs by label, and both fall back on bad input.
    const names = d.groups.map(g => colorName(g.color));
    const glyphs = d.groups.map(g => patternLabel(g.pattern));
    assert.ok(!names.includes('custom'), `${d.id}: the legend can only call one of these pains "custom"`);
    assert.equal(new Set(names).size, names.length, `${d.id}: the legend reads two pains out as the same colour`);
    assert.equal(new Set(glyphs).size, glyphs.length,
      `${d.id}: two pains render the same glyph, so a greyscale reader cannot tell them apart`);
  }
});

test('every demo has a unique id and the title and blurb its card prints', () => {
  const ids = DEMOS.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DEMOS) {
    assert.ok(d.title && d.title.trim(), `${d.id} has no title`);
    assert.ok(d.blurb && d.blurb.trim().length > 10, `${d.id} has no blurb`);
    assert.ok(d.groups.length > 0, `${d.id} declares no pains and would load an empty episode`);
  }
});

test('a demo blurb never names a colour or a glyph its own map does not show', () => {
  // demo-combo promises "sinus pressure as sky rings" and "a rose star", which
  // is colorName() and the pattern vocabulary written out in prose. Recolour
  // the demo and the card describes something the model no longer renders.
  const words = text => pairs => [...new Set(pairs
    .filter(([w]) => new RegExp(`\\b${w}s?\\b`, 'i').test(text))
    .map(([, id]) => id))];
  const colourPairs = GROUP_COLOR_NAMES.map(n => [n, n]);
  const patternPairs = PATTERNS.flatMap(p => [[p.id, p.id], [p.label, p.id]]);
  const stray = [];
  let described = 0;
  for (const d of DEMOS) {
    const named = words(d.blurb);
    const ownColours = new Set(d.groups.map(g => colorName(g.color)));
    const ownPatterns = new Set(d.groups.map(g => g.pattern));
    const claimedColours = named(colourPairs);
    const claimedPatterns = named(patternPairs);
    described += claimedColours.length + claimedPatterns.length;
    for (const c of claimedColours) if (!ownColours.has(c)) stray.push(`${d.id}: blurb says ${c}, map shows ${[...ownColours].join('/')}`);
    for (const p of claimedPatterns) if (!ownPatterns.has(p)) stray.push(`${d.id}: blurb says ${p}, map draws ${[...ownPatterns].join('/')}`);
  }
  assert.ok(described > 0,
    'no demo blurb describes its own rendering any more; this test now checks nothing');
  assert.deepEqual(stray, [], 'the gallery card describes a map the app does not draw');
});

test('every condition has a unique id, a known tier, and the prose fields its card prints', () => {
  const ids = CONDITIONS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'conditionById() would return the first of a duplicate pair');
  for (const c of CONDITIONS) {
    assert.ok(['common', 'advanced'].includes(c.tier),
      `${c.id}: tier "${c.tier}" falls outside both library sections, so the card is never listed`);
    for (const field of ['feelsLike', 'time', 'differentiators']) {
      assert.equal(typeof c[field], 'string', `${c.id}.${field} is not a string`);
      assert.ok(c[field].trim().length > 10, `${c.id}.${field} is empty on the card`);
    }
    // redFlags is the one prose field with a legitimate absence: null means the
    // card prints no warning block. Anything else (undefined, '', a stub) is a
    // card printing "undefined" or an empty red box at a patient.
    assert.ok(c.redFlags === null || (typeof c.redFlags === 'string' && c.redFlags.trim().length > 10),
      `${c.id}.redFlags is neither null nor a sentence; renderRedFlags prints it verbatim`);
    assert.ok(c.name && c.name.trim(), `${c.id} has no display name`);
  }
});

test('every condition names depths and qualities from the shared vocabulary, or the matcher can never score them', () => {
  const depthIds = new Set(DEPTHS.map(d => d.id));
  const qualityIds = new Set(QUALITIES.map(q => q.id));
  const bad = [];
  for (const c of CONDITIONS) {
    for (const d of c.depths) if (!depthIds.has(d)) bad.push(`${c.id}.depths: ${d}`);
    for (const q of c.qualities) if (!qualityIds.has(q)) bad.push(`${c.id}.qualities: ${q}`);
  }
  assert.deepEqual(bad, [],
    'scoreConditions() compares these against the marker values; an unknown id can only ever miss');
});

test('every condition names a laterality the matcher branches on, so a typo cannot silently zero the term', () => {
  // The three scored values are read out of the matcher itself; 'any' is the
  // unscored default and the one value with no branch of its own. A typo on
  // either side (content or branch) leaves one of the two lists non-empty.
  const scored = [...new Set([...readSource('js/conditions.js')
    .matchAll(/c\.laterality === '([^']+)'/g)].map(m => m[1]))];
  assert.ok(scored.length >= 3, 'the laterality branches of scoreConditions() disappeared');
  const vocabulary = new Set([...scored, 'any']);
  const used = new Set(CONDITIONS.map(c => c.laterality));
  const unknown = [...used].filter(l => !vocabulary.has(l));
  assert.deepEqual(unknown, [],
    'this condition scores 0 for laterality forever; the matcher has no branch for that string');
  const dead = scored.filter(l => !used.has(l));
  assert.deepEqual(dead, [],
    'scoreConditions() branches on a laterality no condition declares; one side of the pair was renamed');
});

test('every quality contradiction names a condition and a quality that exist, or the penalty never fires', () => {
  // QUALITY_CONTRADICTIONS is keyed by condition id and is not exported, so it
  // is read from source. A renamed condition leaves the key dangling and the
  // -8 penalty silently stops applying, with nothing else in the suite red.
  const block = readSource('js/conditions.js').match(/const QUALITY_CONTRADICTIONS = \{([\s\S]*?)\};/);
  assert.ok(block, 'the contradiction table moved or changed shape; this test can no longer read it');
  const entries = [...block[1].matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)]
    .map(m => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map(q => q[1])]);
  assert.ok(entries.length > 0, 'the contradiction table is empty; the -8 penalty can never fire');
  const qualityIds = new Set(QUALITIES.map(q => q.id));
  const bad = [];
  for (const [conditionId, qualities] of entries) {
    const c = conditionById(conditionId);
    if (!c) { bad.push(`no condition "${conditionId}"`); continue; }
    for (const q of qualities) {
      if (!qualityIds.has(q)) bad.push(`${conditionId}: no quality "${q}"`);
      if (c.qualities.includes(q)) bad.push(`${conditionId}: contradicts "${q}", which it also claims to feel like`);
    }
  }
  assert.deepEqual(bad, [], 'a contradiction nothing resolves is a penalty that never applies');
});

test('every condition intensity is an ordered pair inside the 0-10 scale presetMarkers averages', () => {
  for (const c of CONDITIONS) {
    assert.ok(Array.isArray(c.intensity) && c.intensity.length === 2, `${c.id}: intensity is not a pair`);
    const [lo, hi] = c.intensity;
    assert.ok(lo >= 0 && hi <= 10, `${c.id}: intensity ${lo}-${hi} leaves the slider's range`);
    assert.ok(lo <= hi, `${c.id}: intensity pair is reversed, so the preset midpoint is meaningless`);
  }
});

test('every mappable condition seeds exactly the primary zones it authors, at the intensity, depth and quality it claims', () => {
  for (const c of CONDITIONS) {
    if (c.notMappable || !c.primary.length) continue; // the refusal path has its own test below
    const ep = episodeFromCondition(c.id, registry);
    assert.ok(ep, `${c.id} produced no episode`);
    assert.equal(ep.groups.length, 1, `${c.id}: a condition loads as exactly one pain`);
    assert.equal(ep.groups[0].conditionId, c.id,
      `${c.id}: the episode does not remember which pattern seeded it, so the card link is lost`);

    const expected = seedZonesFor(c);
    assert.ok(expected.length > 0, `${c.id} seeds zero markers`);
    assert.deepEqual(ep.markers.map(m => m.zoneId), expected,
      `${c.id}: the seeded points are not the primary zones this condition authors`);

    const [lo, hi] = c.intensity;
    for (const m of ep.markers) {
      assert.ok(m.intensity >= lo && m.intensity <= hi,
        `${c.id}: seeded at ${m.intensity}, outside the ${lo}-${hi} band the card prints`);
      if (c.depths.length) {
        assert.ok(c.depths.includes(m.depth),
          `${c.id}: seeded at depth "${m.depth}", which this condition does not list`);
      }
      if (c.qualities.length) {
        assert.ok(c.qualities.includes(m.quality),
          `${c.id}: seeded with quality "${m.quality}", which this condition does not list`);
      } else {
        assert.equal(m.quality, null, `${c.id}: seeded a quality it never claims`);
      }
      const zone = registry.zoneById(m.zoneId);
      assert.ok(zone, `${c.id}: ${m.zoneId} survived materialization without resolving`);
      if (!zone.virtual) {
        assert.deepEqual(m.p, zone.anchor,
          `${c.id}/${m.zoneId}: placed somewhere other than its own zone's anchor`);
      }
    }
  }
});

test('a notMappable condition refuses to map even when it names zones, so a congenital entry can never become a preset', () => {
  // Both authored notMappable conditions also declare no primary zones, which
  // makes the notMappable guard in episodeFromCondition() unreachable through
  // the real library: asserting null for them proves nothing about the guard.
  // So pin the content fact, then exercise the guard on a fixture that has the
  // zones the real entries lack.
  assert.deepEqual(CONDITIONS.filter(c => c.notMappable && c.primary.length).map(c => c.id), [],
    'a notMappable condition now names zones; the guard below is the only thing keeping it out of the map');

  const fake = {
    id: '__test-congenital', name: 'Test congenital', tier: 'advanced', notMappable: true,
    primary: [SOME_ZONE], secondary: [], laterality: 'any',
    depths: ['surface'], qualities: [], intensity: [1, 2]
  };
  CONDITIONS.push(fake);
  try {
    assert.equal(episodeFromCondition(fake.id, registry), null,
      'a notMappable condition produced a mappable episode; CONGENITAL_NOTE says it cannot be self-checked');
    delete fake.notMappable;
    assert.ok(episodeFromCondition(fake.id, registry),
      'the control failed: this fixture refuses to map for some reason other than notMappable, so the test above proves nothing');
  } finally {
    CONDITIONS.pop();
  }
});

test('every demo materializes exactly the markers each of its pains declares, pain by pain', () => {
  for (const d of DEMOS) {
    const ep = episodeFromDemo(d.id, registry);
    assert.ok(ep, `${d.id} produced no episode`);
    assert.equal(ep.groups.length, d.groups.length, `${d.id}: a declared pain vanished`);
    d.groups.forEach((g, i) => {
      // Expected zones come from the demo's own declaration, or from the
      // condition it cites, never from presetMarkers(): otherwise a change to
      // seeding moves both sides of the comparison at once.
      const expected = g.conditionId
        ? seedZonesFor(conditionById(g.conditionId))
        : (g.markers || []).map(m => m.zoneId);
      assert.ok(expected.length > 0, `${d.id}/${g.name} declares no markers`);
      const got = ep.markers.filter(m => m.groupId === ep.groups[i].id).map(m => m.zoneId);
      assert.deepEqual(got, expected,
        `${d.id}/${g.name}: the card renders different points from the ones it declares`);
    });
  }
});

test('every demo marker, hand-written or seeded, uses depth, quality and spread ids the editor can select back', () => {
  const depthIds = new Set(DEPTHS.map(d => d.id));
  const qualityIds = new Set(QUALITIES.map(q => q.id));
  const spreadIds = new Set(SPREADS.map(s => s.id));
  const bad = [];

  // Hand-written markers, checked unconditionally: plainEpisode() fills a
  // missing depth with 'surface' and a missing spread with 'small', so an
  // omission has to be as loud as a typo. A null quality is legitimate.
  const declared = DEMOS.flatMap(d => d.groups.flatMap(g => (g.markers || []).map(m => [`${d.id}/${g.name}`, m])));
  assert.ok(declared.length > 0, 'no demo hand-writes a marker any more; this half now checks nothing');
  for (const [where, m] of declared) {
    if (!depthIds.has(m.depth)) bad.push(`${where}: depth ${m.depth}`);
    if (!spreadIds.has(m.spread)) bad.push(`${where}: spread ${m.spread}`);
    if (m.quality != null && !qualityIds.has(m.quality)) bad.push(`${where}: quality ${m.quality}`);
  }

  // And the seeded ones, which are seven of the eight demo pains and never
  // appear above.
  for (const d of DEMOS) {
    for (const m of episodeFromDemo(d.id, registry).markers) {
      if (!depthIds.has(m.depth)) bad.push(`${d.id} (seeded): depth ${m.depth}`);
      if (!spreadIds.has(m.spread)) bad.push(`${d.id} (seeded): spread ${m.spread}`);
      if (m.quality !== null && !qualityIds.has(m.quality)) bad.push(`${d.id} (seeded): quality ${m.quality}`);
    }
  }
  assert.deepEqual(bad, [],
    'depthById()/spreadById() fall back to a default, so the editor would show a value the demo never set');
});

// PRODUCT BUG, pinned rather than fixed (js/ is out of scope for this pass).
// tools/bake-zones.mjs never copies `desc` into assets/zones.baked.json, so 0
// of 50 baked zones carry one while js/zones.js authors 31. js/editor.js:50
// prints `zone?.desc` as the editor blurb and js/editor.js:206 as the
// zone-browser tooltip, and both are empty for every real zone: only the
// virtual whole-head zone, which comes from VIRTUAL_ZONES and not from the
// bake, has a description at runtime. Fixing it means adding `desc: z.desc` to
// the baker's zone object and rebaking; this test then passes as written.
test('every zone the editor blurbs has a description at runtime, not only in the authoring file', () => {
  const undescribed = ZONES.filter(z => z.desc)
    .flatMap(bakedIdsFor)
    .filter(id => !registry.zoneById(id).desc);
  assert.deepEqual(undescribed, [],
    'the editor blurb and the zone-browser tooltip render empty for these; the baker drops desc');
});
