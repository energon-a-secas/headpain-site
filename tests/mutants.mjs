// Mutation testing: proof that the suite bites.
//
// A test that cannot fail is worse than no test, because it gets quoted. This
// harness breaks the source in ways the suite claims to protect against, runs
// the suite, and fails if it stayed green. Every mutant below is a real
// regression this project has either shipped or nearly shipped.
//
//   make test-mutants
//
// The source is restored in a finally block, and again at startup, so a killed
// run cannot leave a mutated tree behind. It also refuses to start on a dirty
// js/ tree, because it cannot tell your edit from a leftover mutation.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const MUTANTS = [
  {
    id: 'btoa-latin1',
    file: 'js/utils.js',
    why: 'reverts the share-link encoder to raw btoa, which throws on a curly apostrophe',
    find: 'const bytes = new TextEncoder().encode(str);',
    replace: 'const bytes = Array.from(str, c => c.charCodeAt(0));',
  },
  {
    id: 'paint-ignores-intensity',
    file: 'js/groups.js',
    why: 'makes every intensity paint the same, so the map stops showing how bad it is',
    find: 'return hslToRgb([h, s * (MIN_SAT + (1 - MIN_SAT) * t), l]);',
    replace: 'return hslToRgb([h, s, l]);',
  },
  {
    id: 'pattern-collision',
    file: 'js/groups.js',
    why: 'gives every pain the same glyph, so two pains are identical in greyscale',
    find: 'export function nextGroupPattern(groups, color) {',
    replace: "export function nextGroupPattern(groups, color) {\n  return 'solid'; // MUTANT",
  },
  {
    id: 'orphans-survive-delete',
    file: 'js/state.js',
    why: 'restores the old behaviour where deleting a pain left its points ungrouped',
    find: '  ep.markers = ep.markers.filter(m => m.groupId !== id);',
    replace: '  for (const m of ep.markers) if (m.groupId === id) m.groupId = null;',
  },
  {
    id: 'isolate-hijacks-placement',
    file: 'js/state.js',
    why: 'remerges the two ids, so looking at one pain redirects where the next tap lands',
    find: '  state.isolateGroupId = id && ep?.groups.some(g => g.id === id) ? id : null;',
    replace: '  state.isolateGroupId = id && ep?.groups.some(g => g.id === id) ? id : null;\n  state.activeGroupId = state.isolateGroupId || state.activeGroupId; // MUTANT',
  },
  {
    id: 'no-adopt-on-load',
    file: 'js/persist.js',
    why: 'stops migrating stored maps, so legacy points come back with no pain',
    find: '  return adoptOrphans({',
    replace: '  return ({',
  },
  {
    id: 'preset-episode-has-no-camera',
    file: 'js/presets.js',
    why: 'the exact omission that made a ?learn= link report itself as an unsupported browser',
    find: '    camera: { theta: 0, phi: Math.PI / 2, dist: 4.9 },\n    impact: null,',
    replace: '    impact: null,',
  },
  {
    id: 'share-link-does-not-truncate',
    file: 'js/persist.js',
    why: 'drops the marker cap, so a long map produces an oversized URL with no warning',
    find: 'ep.markers.slice(0, URL_MARKER_CAP)',
    replace: 'ep.markers',
  },
  {
    id: 'impact-bitmask-off-by-one',
    file: 'js/impact.js',
    why: 'shifts the packed bitmask, so a shared link reports the wrong activities',
    find: '  return i >= 0 ? bits | (1 << i) : bits;',
    replace: '  return i >= 0 ? bits | (1 << (i + 1)) : bits;',
  },
  {
    id: 'legend-uses-form-labels',
    file: 'js/legend.js',
    why: 'puts form labels in the sentence a patient reads out ("Pressure / fullness")',
    find: '  const feels = [quality?.plain, depth.plain, spread.plain].filter(Boolean).join(\', \');',
    replace: '  const feels = [quality?.label, depth.label, spread.label].filter(Boolean).join(\', \');',
  },
  {
    id: 'legend-repeats-both-sides',
    file: 'js/legend.js',
    why: 'stops merging left/right pairs, so the reader sees the same place named twice',
    find: '  const zones = mergeSides([...new Set(markers.map(m => zoneById(m.zoneId)?.label).filter(Boolean))]);',
    replace: '  const zones = [...new Set(markers.map(m => zoneById(m.zoneId)?.label).filter(Boolean))];',
  },
  {
    id: 'guidance-severe-boundary',
    file: 'js/guidance.js',
    why: 'shows someone at 8 out of 10 the milder advice',
    find: '  if (intensity >= 8) return SEVERE;',
    replace: '  if (intensity >= 9) return SEVERE;',
  },
  {
    id: 'esc-html-skips-quotes',
    file: 'js/neorgon-dom.js',
    why: 'the exact vendored-kit defect its own header describes: attribute-position injection',
    find: "    .replace(/\"/g, '&quot;')\n",
    replace: '',
  },
  {
    id: 'unknown-zone-placed-anyway',
    file: 'js/presets.js',
    why: 'places a pattern point at a default spot instead of skipping a zone this model lacks',
    find: '    if (!zone) continue;',
    replace: '    if (!zone) { out.push({ ...m, p: [0, 0, 1], n: [0, 0, 1] }); continue; }',
  },
  {
    id: 'marker-accepts-foreign-group',
    file: 'js/state.js',
    why: 'lets a marker point at a pain from another episode, which renders the wrong hue',
    find: "  if (updates.groupId !== undefined && ep.groups.some(g => g.id === updates.groupId)) m.groupId = updates.groupId;",
    replace: '  if (updates.groupId !== undefined) m.groupId = updates.groupId;',
  },
  // ── Added after an adversarial audit proved the suite was blind to these ──
  // Each one is a behaviour a test *claimed* to protect while asserting only
  // membership, or restating the source's own computation back at it.
  {
    id: 'colour-names-swapped',
    file: 'js/groups.js',
    why: 'announces the wrong colour to a reader who cannot use the swatch',
    find: "export const GROUP_COLOR_NAMES = ['rose', 'sky', 'violet',",
    replace: "export const GROUP_COLOR_NAMES = ['violet', 'sky', 'rose',",
  },
  {
    id: 'palette-overflow-collapses',
    file: 'js/groups.js',
    why: 'gives every pain past the eighth the same hue instead of rotating the palette',
    find: '  return GROUP_COLORS.find(c => !used.has(c)) || GROUP_COLORS[groups.length % GROUP_COLORS.length];',
    replace: '  return GROUP_COLORS.find(c => !used.has(c)) || GROUP_COLORS[0];',
  },
  {
    id: 'shape-overflow-collapses',
    file: 'js/groups.js',
    why: 'gives every pain past the eighth the same glyph, collapsing the greyscale channel',
    find: "  return PATTERNS.map(p => p.id).find(p => !used.has(p)) || patternAt(groups.length);",
    replace: "  return PATTERNS.map(p => p.id).find(p => !used.has(p)) || patternAt(0);",
  },
  {
    id: 'has-impact-ignores-days',
    file: 'js/impact.js',
    why: 'an episode whose only answer is days-lost reports as having no impact at all',
    find: "  return Boolean(impact.frequency || impact.duration || impact.daysLost\n    || impact.blocked?.length || impact.symptoms?.length || impact.relief?.length);",
    replace: "  return Boolean(impact.frequency || impact.duration\n    || impact.blocked?.length || impact.symptoms?.length || impact.relief?.length);",
  },
  {
    id: 'active-pain-not-repaired',
    file: 'js/state.js',
    why: 'leaves activeGroupId pointing at a deleted pain, so the next point lands nowhere',
    find: '  if (!ep.groups.some(g => g.id === state.activeGroupId)) {\n    state.activeGroupId = ep.groups[0]?.id || null;\n  }',
    replace: '  if (!state.activeGroupId) {\n    state.activeGroupId = ep.groups[0]?.id || null;\n  }',
  },
  {
    id: 'shared-link-overwrites-diary',
    file: 'js/persist.js',
    why: 'opening somebody else\'s share link saves it over your own episodes',
    find: '  if (state.shared) return; // viewing a shared link — never overwrite the local diary',
    replace: '  // MUTANT: the guard that protects the local diary is gone',
  },
  {
    id: 'legend-stops-escaping',
    file: 'js/legend.js',
    why: 'a pain named with a tag becomes live markup in the legend of a shared map',
    find: '          <span class="legend-name">${escHtml(p.name)}</span>',
    replace: '          <span class="legend-name">${p.name}</span>',
  },
  {
    id: 'laterality-note-dropped',
    file: 'js/conditions.js',
    why: 'silently removes the one-sided-versus-both-sides reasoning from the explanation',
    find: '  if (r.latNote) parts.push(r.latNote);',
    replace: '',
  },
  {
    id: 'intensity-not-clamped',
    file: 'js/state.js',
    why: 'lets an out-of-range intensity through, which breaks the colour ramp and the legend',
    find: '  if (updates.intensity !== undefined) m.intensity = Math.max(0, Math.min(10, Math.round(Number(updates.intensity))));',
    replace: '  if (updates.intensity !== undefined) m.intensity = Number(updates.intensity);',
  },
];

const NODE_TEST = [
  '--test', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
  '--import', './tests/shim.mjs', 'tests/*.test.mjs',
];

function suitePasses() {
  try {
    execFileSync(process.execPath, NODE_TEST, { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function gitDiffJs() {
  return execFileSync('git', ['diff', '--stat', '--', 'js/'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

const before = gitDiffJs();
if (before) {
  console.error('js/ has uncommitted changes; mutation testing would be indistinguishable from your edits.');
  console.error(before);
  process.exit(2);
}

console.log('Baseline: running the suite unmutated…');
if (!suitePasses()) {
  console.error('The suite is already failing. Fix that before asking whether it catches mutants.');
  process.exit(2);
}
console.log('Baseline green.\n');

const survived = [];
const killed = [];
const skipped = [];

for (const m of MUTANTS) {
  const path = join(ROOT, m.file);
  const original = readFileSync(path, 'utf8');
  const hits = original.split(m.find).length - 1;
  if (hits !== 1) {
    skipped.push({ ...m, hits });
    console.log(`SKIP    ${m.id.padEnd(30)} anchor matched ${hits}x in ${m.file}`);
    continue;
  }
  try {
    writeFileSync(path, original.replace(m.find, m.replace));
    if (suitePasses()) {
      survived.push(m);
      console.log(`SURVIVED ${m.id.padEnd(29)} ${m.why}`);
    } else {
      killed.push(m);
      console.log(`killed  ${m.id.padEnd(30)} ${m.why}`);
    }
  } finally {
    writeFileSync(path, original);
  }
}

const dirty = gitDiffJs();
if (dirty) {
  console.error('\nFAILED TO RESTORE js/. Run `git checkout -- js/` before doing anything else.');
  console.error(dirty);
  process.exit(3);
}

console.log(`\n${killed.length} killed, ${survived.length} survived, ${skipped.length} skipped (of ${MUTANTS.length}).`);
if (skipped.length) {
  console.log('\nSkipped mutants have stale anchors. Update tests/mutants.mjs to match the current source:');
  for (const m of skipped) console.log(`  ${m.id}: ${m.hits} matches for the anchor in ${m.file}`);
}
if (survived.length) {
  console.log('\nSurviving mutants are coverage gaps. The suite stayed green while:');
  for (const m of survived) console.log(`  ${m.file}: ${m.why}`);
}
process.exit(survived.length || skipped.length ? 1 : 0);
