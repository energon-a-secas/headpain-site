// Pain groups — one color per concurrent pain type in an episode (e.g. sinus
// pressure in sky, ice-pick in rose). Colors are shared by the 3D decals, the
// zone tint, and every panel list.

import { intensityColor } from './utils.js';

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

export function nextGroupColor(groups) {
  const used = new Set(groups.map(g => g.color));
  return GROUP_COLORS.find(c => !used.has(c)) || GROUP_COLORS[groups.length % GROUP_COLORS.length];
}

export function cycleColor(current) {
  const i = GROUP_COLORS.indexOf(current);
  return GROUP_COLORS[(i + 1) % GROUP_COLORS.length]; // unknown → first palette color
}

export function colorIndexOf(hex) {
  return GROUP_COLORS.indexOf(hex);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function groupById(ep, id) {
  return ep?.groups.find(g => g.id === id) || null;
}

// A grouped marker shows its group's color everywhere; ungrouped keeps the red ramp.
export function markerColor(ep, marker) {
  return groupById(ep, marker.groupId)?.color || intensityColor(marker.intensity);
}
