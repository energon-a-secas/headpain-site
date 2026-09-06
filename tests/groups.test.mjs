// Colour means one thing. Hue is pain identity and never anything else;
// intensity rides on saturation; pattern carries identity a second time for a
// greyscale or colour-blind reader. These tests pin that separation: that
// paint() cannot shift a hue while intensity moves, that markerColor() always
// resolves through the pain rather than through an intensity ramp, and that a
// fresh pain gets a colour and a pattern nobody else already has.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readSource, marker } from './fixtures.mjs';
import {
  GROUP_COLORS, GROUP_COLOR_NAMES,
  nextGroupColor, nextGroupPattern, cycleColor, colorIndexOf, colorName,
  hexToRgb, groupById, paint, paintRgb, markerColor, markerPattern,
  patternAt, isPattern, patternLabel,
  PATTERNS as REEXPORTED_PATTERNS, patternIndexOf
} from '../js/groups.js';
import { PATTERNS } from '../js/patterns.js';
import { defaultEpisode, defaultGroup, defaultMarker } from '../js/state.js';

const ROSE = GROUP_COLORS[0];
const SKY = GROUP_COLORS[1];
const INTENSITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// A measuring instrument, not a copy of the module's logic: paint() decides
// *what* to scale, this only reads the result back out in hue/sat/lightness so
// a test can say "the hue did not move".
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2
    : (r - g) / d + 4;
  return [h / 6, s, l];
}

const hueOf = rgb => toHsl(rgb)[0];
const satOf = rgb => toHsl(rgb)[1];

// Read channels back out of what paint()/markerColor() actually returned, so an
// assertion about hue sits downstream of the function under test rather than
// beside it.
function rgbOf(css) {
  const m = String(css).match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  assert.ok(m, `expected an rgb() string the DOM can use, got ${css}`);
  return m.slice(1).map(Number);
}

// An episode-shaped object built by the real state.js factories, so groupById
// walks the same structure the app stores.
function episodeWith(colors) {
  const groups = [];
  for (const color of colors) groups.push(defaultGroup({ color }, groups));
  return { episode: defaultEpisode('t', [], groups), groups };
}

test('GROUP_COLORS and GROUP_COLOR_NAMES stay the same length, so colorName never says "custom" for a palette colour', () => {
  assert.equal(GROUP_COLORS.length, GROUP_COLOR_NAMES.length,
    'a colour with no spoken name reaches the legend as "custom" and stops being sayable');
  assert.equal(new Set(GROUP_COLORS).size, GROUP_COLORS.length, 'two pains would share a hue');
  assert.equal(new Set(GROUP_COLOR_NAMES).size, GROUP_COLOR_NAMES.length);
  for (const hex of GROUP_COLORS) {
    assert.match(hex, /^#[0-9a-f]{6}$/,
      `${hex} is not 6-digit hex; hexToRgb slices and parses blind and would yield NaN channels`);
  }
  for (const name of GROUP_COLOR_NAMES) assert.match(name, /^[a-z]+$/);
});

test('paint keeps one hue at every intensity, so "the rose one" is still rose at 1/10 and at 10/10', () => {
  for (const hex of GROUP_COLORS) {
    const base = hueOf(hexToRgb(hex));
    for (const i of INTENSITIES) {
      const h = hueOf(paintRgb(hex, i));
      assert.ok(Math.abs(h - base) < 0.005,
        `${hex} at intensity ${i} drifted to hue ${h.toFixed(4)} from ${base.toFixed(4)}: intensity must not move hue`);
    }
  }
});

test('saturation rises at every single step of intensity, so 2/10 reads washed out and 9/10 vivid', () => {
  for (const hex of GROUP_COLORS) {
    const sats = INTENSITIES.map(i => satOf(paintRgb(hex, i)));
    for (let i = 1; i < sats.length; i++) {
      assert.ok(sats[i] > sats[i - 1],
        `${hex}: intensity ${i} is no more saturated than ${i - 1} (${sats[i].toFixed(3)} vs ${sats[i - 1].toFixed(3)}), so those two intensities look identical`);
    }
  }
});

test('intensity 0 stays visibly tinted and visibly weaker, so a faint point is neither grey nor mistakable for a strong one', () => {
  for (const hex of GROUP_COLORS) {
    const ratio = satOf(paintRgb(hex, 0)) / satOf(paintRgb(hex, 10));
    assert.ok(ratio > 0.15,
      `${hex}: intensity 0 keeps only ${ratio.toFixed(3)} of full saturation, close enough to grey that the pain loses its hue identity`);
    assert.ok(ratio < 0.6,
      `${hex}: intensity 0 keeps ${ratio.toFixed(3)} of full saturation, so the faint end no longer reads as faint`);
  }
});

test('MIN_SAT is pinned at 0.30: a deliberate retune should have to change this one test and nothing else', () => {
  const ratio = satOf(paintRgb(SKY, 0)) / satOf(paintRgb(SKY, 10));
  assert.ok(Math.abs(ratio - 0.30) < 0.02,
    `the intensity-0 saturation multiplier now reads ${ratio.toFixed(3)}; if that was intentional, move this pin`);
});

test('intensity 10 paints the palette colour itself, unmodified', () => {
  for (const hex of GROUP_COLORS) {
    assert.deepEqual(paintRgb(hex, 10), hexToRgb(hex),
      `${hex} at full intensity should be the swatch the chip and the legend show`);
  }
});

test('paint returns an rgb() string of three integer channels the DOM can use', () => {
  const css = paint(SKY, 5);
  const channels = rgbOf(css);
  for (const n of channels) {
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 255, `channel ${n} out of range`);
  }
  assert.deepEqual(paintRgb(SKY, 5), channels, 'paint and paintRgb disagree');
});

test('paintRgb clamps an intensity outside 0..10 instead of over- or under-saturating', () => {
  for (const over of [10.5, 11, 99, Infinity]) {
    assert.deepEqual(paintRgb(SKY, over), paintRgb(SKY, 10), `intensity ${over} escaped the top of the scale`);
  }
  for (const under of [-0.5, -5, -Infinity]) {
    assert.deepEqual(paintRgb(SKY, under), paintRgb(SKY, 0), `intensity ${under} escaped the bottom of the scale`);
  }
});

test('paintRgb treats a non-numeric intensity as 0 rather than emitting NaN channels', () => {
  for (const bad of [NaN, null, 'abc', {}, [], '']) {
    const rgb = paintRgb(SKY, bad);
    assert.ok(rgb.every(c => Number.isInteger(c) && c >= 0 && c <= 255),
      `intensity ${JSON.stringify(bad)} produced ${JSON.stringify(rgb)}`);
    assert.deepEqual(rgb, paintRgb(SKY, 0), `intensity ${JSON.stringify(bad)} should read as the faintest end`);
  }
  assert.deepEqual(paintRgb(SKY, '7'), paintRgb(SKY, 7),
    'a numeric string arrives from a range input and must not collapse to 0');
});

test('an omitted intensity means full, not blank, so a swatch drawn with no intensity is the palette colour', () => {
  assert.deepEqual(paintRgb(SKY), hexToRgb(SKY));
  assert.equal(paint(SKY), `rgb(${hexToRgb(SKY).join(', ')})`);
});

test('paintRgb falls back to the first palette colour when the hex is missing', () => {
  for (const missing of [null, undefined, '']) {
    assert.deepEqual(paintRgb(missing, 6), paintRgb(ROSE, 6),
      `a group with ${JSON.stringify(missing)} for a colour must still paint something in the palette`);
  }
});

test('markerColor resolves through the pain at every intensity, so a point in the sky pain never comes back reddish', () => {
  const { episode, groups } = episodeWith([ROSE, SKY]);
  const skyHue = hueOf(hexToRgb(SKY));
  for (const i of INTENSITIES) {
    const m = defaultMarker(marker({ groupId: groups[1].id, intensity: i }));
    const rgb = paintRgb(SKY, i);
    assert.equal(markerColor(episode, m), `rgb(${rgb.join(', ')})`,
      `intensity ${i} did not go through the group's colour`);
    const [r, g, b] = rgb;
    assert.ok(b > r, `sky pain at intensity ${i} rendered ${rgb} with red at or above blue`);
    assert.ok(b >= g, `sky pain at intensity ${i} rendered ${rgb}, which is no longer blue-dominant`);
    assert.ok(Math.abs(hueOf(rgb) - skyHue) < 0.005, `sky pain at intensity ${i} drifted off its hue`);
  }
});

test('two pains at the same intensity differ, and one pain at two intensities keeps its hue: identity is hue, not brightness', () => {
  const { episode, groups } = episodeWith([ROSE, SKY]);
  const roseHigh = defaultMarker(marker({ groupId: groups[0].id, intensity: 9 }));
  const skyHigh = defaultMarker(marker({ groupId: groups[1].id, intensity: 9 }));
  const skyLow = defaultMarker(marker({ groupId: groups[1].id, intensity: 2 }));

  assert.notEqual(markerColor(episode, roseHigh), markerColor(episode, skyHigh),
    'two different pains at the same intensity painted the same colour');
  assert.notEqual(markerColor(episode, skyHigh), markerColor(episode, skyLow),
    'intensity stopped showing at all');

  const hueHigh = hueOf(rgbOf(markerColor(episode, skyHigh)));
  const hueLow = hueOf(rgbOf(markerColor(episode, skyLow)));
  assert.ok(Math.abs(hueHigh - hueLow) < 0.005,
    'the same pain changed hue with intensity, which is exactly the old ambiguity');
});

test('markerColor falls back to a palette colour, not an intensity ramp, when the groupId dangles', () => {
  const { episode } = episodeWith([SKY]);
  const roseHue = hueOf(hexToRgb(ROSE));
  for (const i of INTENSITIES) {
    const m = defaultMarker(marker({ groupId: 'no-such-pain', intensity: i }));
    const css = markerColor(episode, m);
    // Hue first: "not a ramp" is the claim, and it is measured on what
    // markerColor itself returned. The equality below only corroborates it.
    assert.ok(Math.abs(hueOf(rgbOf(css)) - roseHue) < 0.005,
      `the fallback painted ${css} at intensity ${i}, off the rose hue: it is behaving like a ramp`);
    assert.equal(css, paint(ROSE, i), `the dangling groupId at intensity ${i} did not land on the first palette colour`);
  }
  const noGroup = defaultMarker(marker({ intensity: 3 }));
  assert.equal(noGroup.groupId, null);
  assert.equal(markerColor(episode, noGroup), paint(ROSE, 3),
    'a marker adoptOrphans has not reached yet must still paint, not throw');
  assert.equal(markerColor(null, noGroup), paint(ROSE, 3),
    'a share link decoded before the episode exists must not throw here, the way its sibling markerPattern does not');
});

test('markerPattern returns the pattern of the pain that owns the marker, and falls back to solid rather than leaving a decal blank', () => {
  const { episode, groups } = episodeWith([ROSE, SKY]);
  assert.equal(markerPattern(episode, defaultMarker(marker({ groupId: groups[0].id }))), groups[0].pattern);
  assert.equal(markerPattern(episode, defaultMarker(marker({ groupId: groups[1].id }))), groups[1].pattern);
  assert.notEqual(groups[0].pattern, groups[1].pattern, 'two pains were handed the same shape');

  assert.equal(markerPattern(episode, { groupId: 'no-such-pain' }), 'solid');
  assert.equal(markerPattern(episode, { groupId: null }), 'solid');
  assert.equal(markerPattern(null, { groupId: groups[0].id }), 'solid',
    'a share link decoded before the episode exists must not throw here');

  // Through a pattern whose spoken label differs from its id, so a patternLabel
  // that merely echoes its argument cannot satisfy this.
  assert.equal(groups[1].pattern, 'ring', 'the label check below reads through the second pain, which owns the ring glyph');
  assert.equal(patternLabel(markerPattern(episode, defaultMarker(marker({ groupId: groups[1].id })))), 'ringed',
    'groups.js must re-export the real patternLabel, which maps an id to a different spoken word');
});

test('groups.js re-exports the whole pattern vocabulary, because persist.js reads colorIndexOf and patternIndexOf from one module', () => {
  assert.equal(REEXPORTED_PATTERNS, PATTERNS, 'the re-export must be the live table, not a copy that can drift');
  assert.equal(patternIndexOf(patternAt(3)), 3, 'patternIndexOf and patternAt must be inverses; serializeForUrl round-trips through both');
  assert.equal(patternIndexOf('no-such-shape'), -1);
  assert.ok(isPattern(patternAt(0)) && !isPattern('no-such-shape'));
});

test('groupById answers null instead of throwing when there is no episode', () => {
  assert.equal(groupById(null, 'g1'), null);
  assert.equal(groupById(undefined, 'g1'), null);
  assert.equal(groupById(defaultEpisode('t', [], []), 'g1'), null);
  const { episode, groups } = episodeWith([ROSE]);
  assert.equal(groupById(episode, groups[0].id), groups[0]);
});

test('nextGroupColor hands out every palette colour before it is forced to repeat one', () => {
  const groups = [];
  for (let i = 0; i < GROUP_COLORS.length; i++) {
    const color = nextGroupColor(groups);
    assert.ok(GROUP_COLORS.includes(color), `handed out ${color}, which is off the palette`);
    assert.ok(!groups.some(g => g.color === color), `pain ${i + 1} was handed a colour already in use`);
    groups.push({ color, pattern: nextGroupPattern(groups, color) });
  }
  assert.equal(new Set(groups.map(g => g.color)).size, GROUP_COLORS.length);
});

test('nextGroupColor skips a taken colour even when it is not the next slot', () => {
  assert.equal(nextGroupColor([{ color: ROSE }]), SKY);
  assert.equal(nextGroupColor([{ color: SKY }]), ROSE, 'the first free slot is rose, not the slot after sky');
  assert.equal(nextGroupColor([]), ROSE);
  assert.equal(nextGroupColor([{ color: '#123456' }]), ROSE, 'an off-palette colour occupies no slot');
});

test('past the eighth pain nextGroupColor walks the palette again instead of collapsing onto one colour', () => {
  const exhausted = GROUP_COLORS.map(color => ({ color }));
  const overflow = [];
  for (let extra = 0; extra < 5; extra++) {
    const color = nextGroupColor(exhausted);
    overflow.push(color);
    exhausted.push({ color });
  }
  assert.deepEqual(overflow, GROUP_COLORS.slice(0, 5),
    'pains 9 to 13 must restart at the top of the palette, one slot each');
  assert.equal(new Set(overflow).size, 5,
    'the overflow pains all came out the same hue and are now indistinguishable from each other');
});

test('nextGroupPattern pairs slot for slot with the colour, so a new pain differs on both channels at once', () => {
  assert.deepEqual(GROUP_COLORS.map(c => nextGroupPattern([], c)), PATTERNS.map(p => p.id),
    'the colour slots and the shape slots came apart, so two pains can differ in hue while sharing a glyph');
});

test('nextGroupPattern picks a free shape when the paired one is already taken', () => {
  const paired = nextGroupPattern([], SKY);
  const chosen = nextGroupPattern([{ pattern: paired }], SKY);
  assert.notEqual(chosen, paired, 'two pains were handed the same shape');
  assert.ok(isPattern(chosen));
});

test('eight pains get eight distinct colours and eight distinct patterns', () => {
  const groups = [];
  for (let i = 0; i < GROUP_COLORS.length; i++) groups.push(defaultGroup({}, groups));
  assert.equal(new Set(groups.map(g => g.color)).size, GROUP_COLORS.length);
  assert.equal(new Set(groups.map(g => g.pattern)).size, PATTERNS.length,
    'two pains share a shape, so a greyscale reader cannot tell them apart');
});

test('past the eighth pain nextGroupPattern walks the shapes again instead of collapsing onto one glyph', () => {
  const groups = [];
  for (let i = 0; i < GROUP_COLORS.length; i++) groups.push(defaultGroup({}, groups));
  const overflow = [];
  for (let extra = 0; extra < 5; extra++) {
    const color = nextGroupColor(groups);
    const pattern = nextGroupPattern(groups, color);
    overflow.push(pattern);
    groups.push({ color, pattern });
  }
  assert.deepEqual(overflow, PATTERNS.slice(0, 5).map(p => p.id),
    'pains 9 to 13 must restart at the top of the shape list, one glyph each');
  assert.equal(new Set(overflow).size, 5,
    'the greyscale channel collapsed: every pain past the eighth is drawn with the same glyph, for exactly the readers it exists for');
});

test('nextGroupPattern survives a colour that is not on the palette', () => {
  const chosen = nextGroupPattern([], '#123456');
  assert.ok(isPattern(chosen),
    'GROUP_COLORS.indexOf() returns -1 for a custom colour; patternAt(-1) must wrap, not return undefined');
});

test('cycleColor walks the palette and wraps, and an unknown colour lands on the first slot', () => {
  for (let i = 0; i < GROUP_COLORS.length - 1; i++) {
    assert.equal(cycleColor(GROUP_COLORS[i]), GROUP_COLORS[i + 1]);
  }
  assert.equal(cycleColor(GROUP_COLORS[GROUP_COLORS.length - 1]), GROUP_COLORS[0], 'the palette must be a ring');
  assert.equal(cycleColor('#123456'), GROUP_COLORS[0]);
  assert.equal(cycleColor(undefined), GROUP_COLORS[0]);
});

test('every palette hex keeps the spoken name the legend reads aloud, and an off-palette one is "custom"', () => {
  // Literal, not GROUP_COLOR_NAMES[i]: legend.js and painbar.js speak
  // colorName(g.color) to a reader who cannot use the swatch, so a hex and its
  // name drifting apart has to be visible here.
  assert.deepEqual(GROUP_COLORS.map(colorName),
    ['rose', 'sky', 'violet', 'amber', 'emerald', 'orange', 'cyan', 'fuchsia'],
    'a palette hex is now announced by the wrong name');
  GROUP_COLORS.forEach((hex, i) => assert.equal(colorIndexOf(hex), i));
  assert.equal(colorIndexOf('#123456'), -1);
  assert.equal(colorName('#123456'), 'custom');
  assert.equal(colorName(undefined), 'custom', 'the legend must never read "undefined" aloud');
});

test('hexToRgb decodes six-digit hex in both cases and round-trips the palette', () => {
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#f43f5e'), [244, 63, 94]);
  assert.deepEqual(hexToRgb('#FFFFFF'), [255, 255, 255], 'a pasted hex may arrive uppercase');
  for (const hex of GROUP_COLORS) {
    const back = '#' + hexToRgb(hex).map(c => c.toString(16).padStart(2, '0')).join('');
    assert.equal(back, hex);
  }
});

test('no module in js/ exports an intensity ramp, so hue cannot go back to meaning two things', () => {
  // The whole tree, case-insensitively, on the family of names rather than the
  // one spelling that was removed: moving the ramp into another module or
  // renaming it is the same regression. Comments are stripped first, because
  // groups.js and patterns.js legitimately describe the old ramp in prose.
  const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const RAMP = /intensity[_-]?(colou?rs?|rgb|ramp|scale)|(colou?r|rgb|ramp|scale)[_-]?(for|by|from)[_-]?intensity/i;
  const files = readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js') && !f.startsWith('neorgon-'));
  assert.ok(files.length > 20, `only ${files.length} modules found in js/; this scan is checking air`);
  for (const f of files) {
    assert.doesNotMatch(strip(readSource(`js/${f}`)), RAMP,
      `js/${f} names an intensity ramp again: that is exactly how a red blob starts meaning "hurts a lot" instead of "pain one"`);
  }
});
