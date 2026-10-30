// Maps saved before the 2026-10-30 zone fix, moved into the current frame.
//
// Until that fix every face and ear zone sat one feature low (CLAUDE.md,
// Gotchas), and a saved marker carries its own p and n. Opened as saved, a
// point placed by name drew its decal at the old anchor (the eye's point on the
// cheek) while the zone tint, which follows zoneId, lit the new one; and a
// tapped point kept the name the old atlas gave it ("Lower forehead" for a
// cheekbone). js/persist.js sends every way in through migrateEpisode: the
// stored diary, JSON files and share links. What marks data as post-fix is the
// field it carries (zonesVersion on a diary or a file, v: 3 on a link), never
// what its points look like.

import { nearestPatch } from './zone-lookup.js';
import { wholeHeadSpot } from './presets.js';
import { PRE_FIX_ANCHORS, PRE_FIX_WHOLE_HEAD_SPOT } from './zones-legacy.js';

// Written at the root of every diary and file since the fix, absent before it.
export const ZONES_VERSION = 2;
export const isPreFix = root => root?.zonesVersion == null;

// A point placed by name sits on its anchor: exactly in a diary, within 8.7e-4
// after a link's round3. A tap lands that close only by accident.
const NEAR = 2e-3;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= NEAR;

const place = (m, spot) => { m.p = [...spot.p]; m.n = [...spot.n]; };

function migrateMarker(m, registry, spot) {
  const p = Array.isArray(m.p) && m.p.length === 3 ? m.p.map(Number) : null;
  if (!p || !p.every(Number.isFinite)) return; // nothing to place; normalizing it is not this file's job
  const zone = registry.zoneById(m.zoneId);
  // Already in the current frame. Checked first so a second run is a no-op.
  if (near(p, spot.p) || (zone?.anchor && near(p, zone.anchor))) return;
  if (near(p, PRE_FIX_WHOLE_HEAD_SPOT.p)) { place(m, spot); return; }
  // No tap ever names a virtual zone, so a whole-head point was placed by name.
  if (zone?.virtual) return;
  const before = PRE_FIX_ANCHORS[m.zoneId];
  if (zone && before && near(p, before.p)) { place(m, { p: zone.anchor, n: zone.normal }); return; }
  // Tapped: the point stays where the finger was, and takes the name the
  // current zones give it there (or keeps its own where they give none).
  const named = nearestPatch(p, registry.zones);
  if (!named) return;
  m.zoneId = named.id;
  // A tap on the old anchor of the zone it is now named for reads as placed by
  // name on the next run, so it is placed that way now.
  if (PRE_FIX_ANCHORS[named.id] && near(p, PRE_FIX_ANCHORS[named.id].p)) {
    place(m, { p: named.anchor, n: named.normal });
  }
}

// In place, and returns the episode. Throws without a registry rather than
// returning the map unmigrated: callers run it where a throw keeps the diary
// on disk, and a map that silently skipped this is saved as post-fix.
export function migrateEpisode(ep, registry) {
  if (!registry?.zoneById) throw new TypeError('a map saved before the zone fix needs the zone registry to open');
  const spot = wholeHeadSpot(registry);
  for (const m of ep.markers || []) migrateMarker(m, registry, spot);
  return ep;
}
