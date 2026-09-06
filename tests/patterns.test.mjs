// The pattern vocabulary: the non-hue channel that carries pain identity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingContext } from './shim.mjs';
import {
  PATTERNS, patternAt, patternIndexOf, isPattern, patternLabel, patternSvg, drawPattern
} from '../js/patterns.js';
import { GROUP_COLORS } from '../js/groups.js';

test('there is one pattern per palette colour, so a fresh pain always differs on both channels', () => {
  assert.equal(PATTERNS.length, GROUP_COLORS.length,
    'patternAt() pairs a pattern with a colour slot; unequal lengths silently reuse shapes');
});

test('every pattern has a unique id and a spoken label', () => {
  const ids = PATTERNS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PATTERNS) {
    assert.match(p.id, /^[a-z]+$/);
    assert.ok(p.label.length > 2, `${p.id} needs a label a legend can read aloud`);
  }
});

test('patternAt wraps in both directions rather than returning undefined', () => {
  assert.equal(patternAt(0), PATTERNS[0].id);
  assert.equal(patternAt(PATTERNS.length), PATTERNS[0].id);
  assert.equal(patternAt(PATTERNS.length + 2), PATTERNS[2].id);
  assert.equal(patternAt(-1), PATTERNS[PATTERNS.length - 1].id,
    'a negative index arrives from GROUP_COLORS.indexOf() missing; it must not crash');
});

test('patternIndexOf round-trips patternAt', () => {
  for (let i = 0; i < PATTERNS.length; i++) assert.equal(patternIndexOf(patternAt(i)), i);
  assert.equal(patternIndexOf('nonsense'), -1);
});

test('isPattern gates what can be stored', () => {
  assert.ok(PATTERNS.every(p => isPattern(p.id)));
  for (const bad of ['', null, undefined, 'SOLID', 'circle', 0]) assert.equal(isPattern(bad), false);
});

test('patternLabel never returns undefined, so the legend never says "undefined"', () => {
  assert.equal(patternLabel('ring'), 'ringed');
  assert.equal(patternLabel('nonsense'), 'solid');
  assert.equal(patternLabel(undefined), 'solid');
});

test('patternSvg emits a themed, non-empty, aria-hidden glyph for every pattern', () => {
  for (const p of PATTERNS) {
    const svg = patternSvg(p.id, '#38bdf8', 16);
    assert.match(svg, /^<svg /);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /aria-hidden="true"/, 'the swatch is decorative; the name beside it carries the meaning');
    assert.match(svg, /width="16" height="16"/);
    assert.ok(svg.includes('#38bdf8'), `${p.id} ignored its colour`);
    assert.ok(svg.length > 90, `${p.id} rendered an empty glyph`);
  }
});

test('every pattern draws a visibly different glyph', () => {
  const signature = id => {
    const ctx = recordingContext();
    drawPattern(ctx, id, false);
    return JSON.stringify(ctx.calls.map(c => [c.op, c.args.map(a => (typeof a === 'number' ? Math.round(a) : typeof a))]));
  };
  const sigs = PATTERNS.map(p => signature(p.id));
  assert.equal(new Set(sigs).size, PATTERNS.length,
    'two patterns produced identical draw calls, so two pains would look the same');
});

test('the spiky rim is additive: it marks quality without replacing the pain glyph', () => {
  for (const p of PATTERNS) {
    const plain = recordingContext();
    drawPattern(plain, p.id, false);
    const spiky = recordingContext();
    drawPattern(spiky, p.id, true);
    assert.ok(spiky.calls.length > plain.calls.length,
      `${p.id}: the spiky variant drew no more than the plain one`);
  }
});

test('an unknown pattern id falls back to a drawn glyph rather than an empty decal', () => {
  const ctx = recordingContext();
  drawPattern(ctx, 'nonsense', false);
  const solid = recordingContext();
  drawPattern(solid, 'solid', false);
  assert.deepEqual(ctx.calls.map(c => c.op), solid.calls.map(c => c.op));
});
