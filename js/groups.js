// Pains — one per concurrent pain type in an episode (e.g. sinus pressure, an
// ice-pick behind the left eye). A pain owns a colour *and* a pattern, and both
// travel together through the 3D decals, the zone tint, every panel list, and
// the legend.
//
// Why both: colour on its own was doing two jobs at once. A grouped point took
// its group's hue while an ungrouped one took the intensity ramp, so a red blob
// meant either "this is group one" or "this hurts a lot" and nothing separated
// them. Now hue is identity and only identity; intensity rides on saturation,
// through paint(); and pattern carries identity again for anyone reading in
// greyscale, on paper, or with red-green colour blindness.

import { PATTERNS, patternAt, patternIndexOf, isPattern, patternLabel } from './patterns.js';

export const GROUP_COLORS = [
  '#f43f5e', // rose
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#fbbf24', // amber
  '#34d399', // emerald
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#e879f9'  // fuchsia
];

// Spoken names, so the legend can say "rose, dotted" for a reader who cannot
// use the swatch at all.
export const GROUP_COLOR_NAMES = ['rose', 'sky', 'violet', 'amber', 'emerald', 'orange', 'cyan', 'fuchsia'];

export function nextGroupColor(groups) {
  const used = new Set(groups.map(g => g.color));
  return GROUP_COLORS.find(c => !used.has(c)) || GROUP_COLORS[groups.length % GROUP_COLORS.length];
}

// Pattern defaults to the twin of the colour slot, so a fresh pain differs from
// its siblings on both channels without anyone choosing twice.
export function nextGroupPattern(groups, color) {
  const used = new Set(groups.map(g => g.pattern));
  const paired = patternAt(GROUP_COLORS.indexOf(color));
  if (!used.has(paired)) return paired;
  return PATTERNS.map(p => p.id).find(p => !used.has(p)) || patternAt(groups.length);
}

export function cycleColor(current) {
  const i = GROUP_COLORS.indexOf(current);
  return GROUP_COLORS[(i + 1) % GROUP_COLORS.length]; // unknown → first palette colour
}

export function colorIndexOf(hex) {
  return GROUP_COLORS.indexOf(hex);
}

export function colorName(hex) {
  return GROUP_COLOR_NAMES[GROUP_COLORS.indexOf(hex)] || 'custom';
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function groupById(ep, id) {
  return ep?.groups.find(g => g.id === id) || null;
}

// ---------------------------------------------------------------------------
// paint() — hue is identity, saturation is intensity.
//
// A pain keeps one hue at every intensity, so "the rose one" stays the rose one
// across the whole map. Intensity rides on saturation instead: a 2/10 point is
// washed out towards grey, a 9/10 point is fully vivid. Two channels, two
// meanings, no collision.
// ---------------------------------------------------------------------------

const MIN_SAT = 0.30; // saturation multiplier at intensity 0

function rgbToHsl([r, g, b]) {
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

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb([h, s, l]) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}

// [r, g, b] 0–255 for a pain's colour at a given intensity.
export function paintRgb(hex, intensity = 10) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex || GROUP_COLORS[0]));
  const t = Math.max(0, Math.min(10, Number(intensity) || 0)) / 10;
  return hslToRgb([h, s * (MIN_SAT + (1 - MIN_SAT) * t), l]);
}

export function paint(hex, intensity = 10) {
  const [r, g, b] = paintRgb(hex, intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

// Every marker belongs to a pain (state.js migrates legacy ungrouped points),
// so this resolves through the group and never falls back to an intensity ramp.
export function markerColor(ep, marker) {
  const g = groupById(ep, marker.groupId);
  return paint(g?.color || GROUP_COLORS[0], marker.intensity);
}

export function markerPattern(ep, marker) {
  return groupById(ep, marker.groupId)?.pattern || 'solid';
}

export { PATTERNS, patternAt, patternIndexOf, isPattern, patternLabel };
