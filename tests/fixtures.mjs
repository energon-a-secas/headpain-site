// Shared fixtures.
//
// The registry is built from the *real* baked atlas (assets/zones.baked.json),
// not a hand-written stub. Zone ids are the one thing in this codebase that
// silently disagree: materializeSpots drops a marker whose zone the model does
// not carry, so a test against invented zone ids would pass while the app
// quietly rendered nothing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRegistry } from '../js/registry.js';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const baked = JSON.parse(readFileSync(join(ROOT, 'assets/zones.baked.json'), 'utf8'));
export const registry = buildRegistry(baked, null);

// A zone id that definitely exists on this model, for tests that just need one.
export const SOME_ZONE = registry.zones[0].id;

export function readSource(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

// A marker as the app would place it: enough fields for every consumer.
export function marker(partial = {}) {
  return {
    zoneId: partial.zoneId ?? SOME_ZONE,
    p: partial.p ?? [0, 0, 1],
    n: partial.n ?? [0, 0, 1],
    intensity: partial.intensity ?? 5,
    depth: partial.depth ?? 'surface',
    quality: partial.quality ?? null,
    spread: partial.spread ?? 'small',
    note: partial.note ?? '',
    ...partial
  };
}

// Build a two-pain episode in the live store, the way the UI would.
export async function seedTwoPainEpisode() {
  const s = await import('../js/state.js');
  s.resetToDefaults();
  const a = s.addGroup({ name: 'Migraine' });
  s.setActiveGroup(a.id);
  s.addMarker(marker({ zoneId: 'temple-left', intensity: 9, quality: 'throbbing', depth: 'inside-head' }));
  const b = s.addGroup({ name: 'Sinus' });
  s.setActiveGroup(b.id);
  s.addMarker(marker({ zoneId: 'sinus-maxillary-left', intensity: 4, quality: 'fullness', depth: 'deep-pressure' }));
  return { pains: [a, b], episode: s.activeEpisode() };
}

// Every zone id a piece of content references, so integrity tests can check
// them against the baked atlas in one place.
export function zoneIdsIn(value, out = new Set()) {
  if (typeof value === 'string') { out.add(value); return out; }
  if (Array.isArray(value)) { value.forEach(v => zoneIdsIn(v, out)); return out; }
  return out;
}
