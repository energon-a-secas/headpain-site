// Content vs model integrity: every zone id the content names must exist on the
// baked head. This is the failure mode with no error message anywhere —
// materializeSpots() silently skips a marker whose zone the model does not
// carry, so one mistyped id makes a published pattern render fewer points and
// nothing complains. The same goes for the vocabularies the prose is built
// from: a missing `plain` string puts the word "undefined" in a sentence a
// patient hands to a doctor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registry, baked, readSource } from './fixtures.mjs';
import { CONDITIONS, presetMarkers } from '../js/conditions.js';
import { DEMOS } from '../js/demos.js';
import { ZONES, VIRTUAL_ZONES, ZONE_GROUPS, DEPTHS, QUALITIES, SPREADS } from '../js/zones.js';
import { GROUP_COLORS } from '../js/groups.js';
import { isPattern } from '../js/patterns.js';
import { episodeFromCondition, episodeFromDemo, conditionById } from '../js/presets.js';

// The bake contract (tools/bake-zones.mjs): a mirror:true entry becomes a
// -left/-right pair, anything else keeps its authored id verbatim — which is
// why the authored id already carries "-center" where the author wanted one.
const bakedIdsFor = z => (z.mirror ? [`${z.id}-left`, `${z.id}-right`] : [z.id]);

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

test('every zone a demo marker names exists on the model', () => {
  const missing = [];
  for (const d of DEMOS) {
    for (const g of d.groups) {
      for (const m of g.markers || []) {
        if (!registry.zoneById(m.zoneId)) missing.push(`${d.id}/${g.name}: ${m.zoneId}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('every demo pain that cites a condition cites one that exists, or the demo loads empty', () => {
  const dangling = DEMOS.flatMap(d => d.groups
    .filter(g => g.conditionId && !conditionById(g.conditionId))
    .map(g => `${d.id}: ${g.conditionId}`));
  assert.deepEqual(dangling, [],
    'episodeFromDemo() calls presetMarkers(null) on a dangling id');
});

test('the baked atlas carries exactly the zones js/zones.js authors, mirrored pairs included', () => {
  const expected = new Set(ZONES.flatMap(bakedIdsFor));
  const actual = new Set(baked.zones.map(z => z.id));
  const missing = [...expected].filter(id => !actual.has(id));
  const extra = [...actual].filter(id => !expected.has(id));
  assert.deepEqual(missing, [], 'authored zones with no baked geometry: unclickable and unpickable');
  assert.deepEqual(extra, [], 'baked zones nothing authors: no label, no group, no description');
});

test('each baked zone reports the base id and side its authoring entry implies', () => {
  const wrong = [];
  for (const z of ZONES) {
    for (const id of bakedIdsFor(z)) {
      const b = registry.zoneById(id);
      const side = z.mirror ? id.slice(z.id.length + 1) : (z.side || 'center');
      if (b.baseId !== z.id) wrong.push(`${id}: baseId ${b.baseId} != ${z.id}`);
      if (b.side !== side) wrong.push(`${id}: side ${b.side} != ${side}`);
      if (b.group !== z.group) wrong.push(`${id}: group ${b.group} != ${z.group}`);
    }
  }
  assert.deepEqual(wrong, [],
    'scoreConditions() reads zone.side for laterality; a wrong side flips one-sided into bilateral');
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

test('every demo pain carries a real pattern and a palette colour', () => {
  const bad = [];
  for (const d of DEMOS) {
    for (const g of d.groups) {
      if (!isPattern(g.pattern)) bad.push(`${d.id}/${g.name}: pattern ${g.pattern}`);
      if (!GROUP_COLORS.includes(g.color)) bad.push(`${d.id}/${g.name}: colour ${g.color}`);
    }
  }
  assert.deepEqual(bad, [],
    'an off-palette colour makes colorIndexOf() return -1 and the share link loses the pain');
});

test('no two pains inside one demo share a colour or a pattern', () => {
  for (const d of DEMOS) {
    const colors = d.groups.map(g => g.color);
    const patterns = d.groups.map(g => g.pattern);
    assert.equal(new Set(colors).size, colors.length, `${d.id}: two pains render in the same hue`);
    assert.equal(new Set(patterns).size, patterns.length,
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

test('every condition has a unique id, a known tier, and the three prose fields its card prints', () => {
  const ids = CONDITIONS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'conditionById() would return the first of a duplicate pair');
  for (const c of CONDITIONS) {
    assert.ok(['common', 'advanced'].includes(c.tier),
      `${c.id}: tier "${c.tier}" falls outside both library sections, so the card is never listed`);
    for (const field of ['feelsLike', 'time', 'differentiators']) {
      assert.equal(typeof c[field], 'string', `${c.id}.${field} is not a string`);
      assert.ok(c[field].trim().length > 10, `${c.id}.${field} is empty on the card`);
    }
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

test('every condition intensity is an ordered pair inside the 0-10 scale presetMarkers averages', () => {
  for (const c of CONDITIONS) {
    assert.ok(Array.isArray(c.intensity) && c.intensity.length === 2, `${c.id}: intensity is not a pair`);
    const [lo, hi] = c.intensity;
    assert.ok(lo >= 0 && hi <= 10, `${c.id}: intensity ${lo}-${hi} leaves the slider's range`);
    assert.ok(lo <= hi, `${c.id}: intensity pair is reversed, so the preset midpoint is meaningless`);
  }
});

test('every mappable condition materializes all of its preset markers, none dropped by the model', () => {
  const short = [];
  for (const c of CONDITIONS) {
    if (c.notMappable || !c.primary.length) {
      assert.equal(episodeFromCondition(c.id, registry), null,
        `${c.id} is not mappable and must not produce an episode`);
      continue;
    }
    const expected = presetMarkers(c).length;
    const ep = episodeFromCondition(c.id, registry);
    assert.ok(ep, `${c.id} produced no episode`);
    assert.ok(expected > 0, `${c.id} seeds zero markers`);
    if (ep.markers.length !== expected) short.push(`${c.id}: ${ep.markers.length} of ${expected}`);
    for (const m of ep.markers) {
      assert.ok(Array.isArray(m.p) && m.p.length === 3, `${c.id}: a marker has no 3D position`);
      assert.ok(m.groupId, `${c.id}: a marker with no pain renders the wrong hue`);
    }
  }
  assert.deepEqual(short, [], 'materializeSpots() dropped these; the library card renders fewer points than it claims');
});

test('every demo materializes every marker it declares, so the gallery matches its blurb', () => {
  const short = [];
  for (const d of DEMOS) {
    const expected = d.groups.reduce((sum, g) => sum +
      (g.conditionId ? presetMarkers(conditionById(g.conditionId)).length : (g.markers || []).length), 0);
    const ep = episodeFromDemo(d.id, registry);
    assert.ok(ep, `${d.id} produced no episode`);
    assert.equal(ep.groups.length, d.groups.length, `${d.id}: a declared pain vanished`);
    assert.ok(expected > 0, `${d.id} declares zero markers`);
    if (ep.markers.length !== expected) short.push(`${d.id}: ${ep.markers.length} of ${expected}`);
    for (const g of ep.groups) {
      assert.ok(ep.markers.some(m => m.groupId === g.id), `${d.id}/${g.name}: a pain with no points`);
    }
  }
  assert.deepEqual(short, [], 'a demo rendering fewer points than it declares, with no error anywhere');
});

test('every demo marker uses depth, quality and spread ids the editor can select back', () => {
  const depthIds = new Set(DEPTHS.map(d => d.id));
  const qualityIds = new Set(QUALITIES.map(q => q.id));
  const spreadIds = new Set(SPREADS.map(s => s.id));
  const bad = [];
  for (const d of DEMOS) {
    for (const g of d.groups) {
      for (const m of g.markers || []) {
        if (m.depth && !depthIds.has(m.depth)) bad.push(`${d.id}: depth ${m.depth}`);
        if (m.quality && !qualityIds.has(m.quality)) bad.push(`${d.id}: quality ${m.quality}`);
        if (m.spread && !spreadIds.has(m.spread)) bad.push(`${d.id}: spread ${m.spread}`);
      }
    }
  }
  assert.deepEqual(bad, [],
    'depthById()/spreadById() fall back to a default, so the editor would show a value the demo never set');
});
