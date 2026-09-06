// Colour means one thing. Hue is pain identity and never anything else;
// intensity rides on saturation; pattern carries identity a second time for a
// greyscale or colour-blind reader. These tests pin that separation: that
// paint() cannot shift a hue while intensity moves, that markerColor() always
// resolves through the pain rather than through an intensity ramp, and that a
// fresh pain gets a colour and a pattern nobody else already has.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, marker } from './fixtures.mjs';
import {
  GROUP_COLORS, GROUP_COLOR_NAMES,
  nextGroupColor, nextGroupPattern, cycleColor, colorIndexOf, colorName,
  hexToRgb, groupById, paint, paintRgb, markerColor, markerPattern,
  patternAt, isPattern, patternLabel
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

test('intensity 0 keeps roughly a third of the saturation, so a faint point is still tinted and not grey', () => {
  for (const hex of GROUP_COLORS) {
    const ratio = satOf(paintRgb(hex, 0)) / satOf(paintRgb(hex, 10));
    assert.ok(Math.abs(ratio - 0.30) < 0.02,
      `${hex}: MIN_SAT moved, intensity 0 now sits at ${ratio.toFixed(3)} of full saturation`);
  }
});

test('intensity 10 paints the palette colour itself, unmodified', () => {
  for (const hex of GROUP_COLORS) {
    assert.deepEqual(paintRgb(hex, 10), hexToRgb(hex),
      `${hex} at full intensity should be the swatch the chip and the legend show`);
  }
});

test('paint returns an rgb() string of three integer channels the DOM can use', () => {
  const css = paint(SKY, 5);
  const m = css.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  assert.ok(m, `paint returned ${css}, which is not an rgb() string`);
  for (const part of m.slice(1)) {
    const n = Number(part);
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 255, `channel ${part} out of range`);
  }
  assert.deepEqual(paintRgb(SKY, 5), m.slice(1).map(Number), 'paint and paintRgb disagree');
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

  const hueHigh = hueOf(paintRgb(SKY, 9));
  const hueLow = hueOf(paintRgb(SKY, 2));
  assert.ok(Math.abs(hueHigh - hueLow) < 0.005,
    'the same pain changed hue with intensity, which is exactly the old ambiguity');
});

test('markerColor falls back to a palette colour, not an intensity ramp, when the groupId dangles', () => {
  const { episode } = episodeWith([SKY]);
  const roseHue = hueOf(hexToRgb(ROSE));
  for (const i of INTENSITIES) {
    const m = defaultMarker(marker({ groupId: 'no-such-pain', intensity: i }));
    assert.equal(markerColor(episode, m), paint(ROSE, i));
    assert.ok(Math.abs(hueOf(paintRgb(ROSE, i)) - roseHue) < 0.005,
      `the fallback shifted hue at intensity ${i}, so it is behaving like a ramp`);
  }
  const noGroup = defaultMarker(marker({ intensity: 3 }));
  assert.equal(noGroup.groupId, null);
  assert.equal(markerColor(episode, noGroup), paint(ROSE, 3),
    'a marker adoptOrphans has not reached yet must still paint, not throw');
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
  assert.ok(isPattern(markerPattern(episode, { groupId: 'nope' })));
  assert.equal(patternLabel(markerPattern(episode, { groupId: 'nope' })), 'solid',
    'groups.js re-exports the pattern helpers so consumers import one module');
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

test('a ninth pain still gets a real palette colour rather than undefined', () => {
  const exhausted = GROUP_COLORS.map(color => ({ color }));
  for (let extra = 0; extra < 5; extra++) {
    const color = nextGroupColor(exhausted);
    assert.ok(GROUP_COLORS.includes(color),
      `with the palette exhausted, pain ${exhausted.length + 1} was handed ${color}`);
    exhausted.push({ color });
  }
});

test('nextGroupPattern pairs with the colour slot, so a new pain differs on both channels at once', () => {
  for (let i = 0; i < GROUP_COLORS.length; i++) {
    assert.equal(nextGroupPattern([], GROUP_COLORS[i]), patternAt(i),
      `slot ${i} did not get its twin pattern`);
  }
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

test('a ninth pain still gets a real pattern rather than undefined', () => {
  const groups = [];
  for (let i = 0; i < GROUP_COLORS.length; i++) groups.push(defaultGroup({}, groups));
  for (let extra = 0; extra < 5; extra++) {
    const color = nextGroupColor(groups);
    const pattern = nextGroupPattern(groups, color);
    assert.ok(isPattern(pattern),
      `with the shapes exhausted, pain ${groups.length + 1} was handed ${pattern}`);
    groups.push({ color, pattern });
  }
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

test('colorIndexOf and colorName agree with the palette, and say "custom" off it', () => {
  GROUP_COLORS.forEach((hex, i) => {
    assert.equal(colorIndexOf(hex), i);
    assert.equal(colorName(hex), GROUP_COLOR_NAMES[i]);
  });
  assert.equal(colorName(SKY), 'sky');
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

test('js/utils.js no longer exports an intensity ramp, so hue cannot go back to meaning two things', () => {
  const src = readSource('js/utils.js');
  assert.doesNotMatch(src, /intensityColor/,
    're-adding intensityColor is exactly how a red blob starts meaning "hurts a lot" again instead of "pain one"');
  assert.doesNotMatch(src, /intensityRGB/i,
    'the RGB twin of the old ramp is the same ambiguity by another name');
});
