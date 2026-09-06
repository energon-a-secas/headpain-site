// Turning a published pattern into placeable points.
//
// This used to be a closure inside events.js, which meant the embed could not
// render a library pattern without the whole app around it. It is the seam
// between "a condition described in conditions.js" and "markers on this model",
// and both the app and embed.html need it.

import { CONDITIONS, presetMarkers } from './conditions.js';
import { DEMOS } from './demos.js';
import { GROUP_COLORS, nextGroupColor, nextGroupPattern } from './groups.js';

// Where a pain with no single spot goes: high on the forehead, facing forward.
export const WHOLE_HEAD_SPOT = { p: [0, 0.2, 0.95], n: [0, 0, 1] };

// Zone-based partial markers become 3D spots on this model. A zone the model
// does not carry is skipped rather than placed somewhere plausible but wrong.
export function materializeSpots(list, registry) {
  const out = [];
  for (const m of list || []) {
    const zone = registry.zoneById(m.zoneId);
    if (!zone) continue;
    const spot = zone.virtual || !zone.anchor ? WHOLE_HEAD_SPOT : { p: [...zone.anchor], n: [...zone.normal] };
    out.push({ ...m, p: spot.p, n: spot.n });
  }
  return out;
}

export const shortName = name => name.split(/ [—(]/)[0];

export function conditionById(id) {
  return CONDITIONS.find(c => c.id === id) || null;
}

export function demoById(id) {
  return DEMOS.find(d => d.id === id) || null;
}

// A plain episode object (no global state, no localStorage), which is what the
// embed renders and what buildLegend reads.
export function plainEpisode(title, painSpecs, registry) {
  const groups = [];
  const markers = [];
  painSpecs.forEach((spec, i) => {
    const color = GROUP_COLORS.includes(spec.color) ? spec.color : nextGroupColor(groups);
    const group = {
      id: `p${i}`,
      name: spec.name,
      color,
      pattern: spec.pattern || nextGroupPattern(groups, color),
      conditionId: spec.conditionId || null
    };
    groups.push(group);
    materializeSpots(spec.markers, registry).forEach((m, j) => {
      markers.push({
        id: `p${i}m${j}`,
        zoneId: m.zoneId || null,
        p: m.p, n: m.n,
        intensity: m.intensity ?? 5,
        depth: m.depth || 'surface',
        quality: m.quality || null,
        spread: m.spread || 'small',
        note: m.note || '',
        groupId: group.id
      });
    });
  });
  const now = new Date().toISOString();
  return {
    id: 'embed',
    title,
    createdAt: now,
    updatedAt: now,
    // Every consumer of an episode reads camera. Omitting it here threw during
    // boot on a ?learn= link, and the boot's catch reported it as a browser
    // that cannot do 3D.
    camera: { theta: 0, phi: Math.PI / 2, dist: 4.9 },
    impact: null,
    groups,
    markers
  };
}

export function episodeFromCondition(id, registry) {
  const c = conditionById(id);
  if (!c || c.notMappable || !c.primary?.length) return null;
  return plainEpisode(c.name, [{
    name: shortName(c.name), conditionId: c.id, markers: presetMarkers(c)
  }], registry);
}

export function episodeFromDemo(id, registry) {
  const d = demoById(id);
  if (!d) return null;
  return plainEpisode(d.title, d.groups.map(g => ({
    name: g.name, color: g.color, pattern: g.pattern, conditionId: g.conditionId || null,
    markers: g.conditionId ? presetMarkers(conditionById(g.conditionId)) : g.markers
  })), registry);
}
