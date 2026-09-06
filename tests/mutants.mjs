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

// Deliberately NOT in this list, because each was tried and proved unkillable:
//
//   normalizeEpisode's dangling-groupId cleanup: adoptOrphans, two lines later,
//   catches exactly the same markers and sends them to the same pain. Verified
//   by running the mutation: identical output.
//
//   the 0 and 95 clamps on a match score: the highest score any condition can
//   reach with its own ideal map is 90 (measured across the whole library), and
//   `if (score < 30) continue` discards everything the floor could touch.
//
//   commaList's two-item branch: the general path builds the identical string
//   for two items. Removed from js/legend.js as dead code rather than mutated.
//
// An unkillable mutant is worse than no mutant: the gate goes permanently red
// and people learn to ignore it. If you add one, prove it can fail first.

const MUTANTS = [

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
    // Anchored on the statement, not on the comment beside it: quoting the
    // comment verbatim would drag its em dash into this file and trip the
    // repo's own copy linter.
    find: '  if (state.shared) return; //',
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
