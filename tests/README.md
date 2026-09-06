# Tests

Two layers, no npm. There is no `package.json`, no `node_modules`, and nothing to
install: the unit layer is Node's own test runner and the browser layer is a page
you open.

```bash
make test           # the unit suite
make test-mutants   # proof the unit suite actually catches breakage
make test-browser   # serves the site; open /tests/browser.html
make test-watch     # re-run on save
```

## Layer 1: unit (`tests/*.test.mjs`)

Every module in `js/` that does not import `three` runs unmodified under Node.
The DOM touches in those modules are inside functions, not at module top level,
so `tests/shim.mjs` supplies only the call-time globals: `localStorage`, a small
`document`, `Blob`/`URL`, and a **recording** canvas 2D context.

The canvas is a recorder rather than a renderer on purpose. Asserting on pixels
would test the browser; asserting on the draw calls tests what this repo decides,
which is *which text lands in the PNG legend, in what order, at what size*. Use
`recordingContext()` and read `ctx.text()`.

`tests/fixtures.mjs` builds the registry from the **real** `assets/zones.baked.json`
through `buildRegistry`. Zone ids are the one thing here that fails silently:
`materializeSpots` drops a marker whose zone the model does not carry, so a test
written against an invented zone id passes while the app renders nothing.

One gotcha worth knowing: Node 22 and later already define `globalThis.localStorage`,
but it is inert without `--localstorage-file` (`setItem is not a function`). The
shim therefore *overwrites* it rather than deferring to it, and probes it at import
time so a suite can never quietly run against the stub.

## Layer 2: browser (`tests/browser.html`)

What layer 1 structurally cannot reach: WebGL, the boot path, DOM layout and
overlap, the iframe embed, and the `postMessage` contract. It boots the real pages
in iframes, waits for real load events, and treats **console errors as failures**,
because "it rendered" is not the same as "it worked".

Both defects this project shipped and then fixed live here as regressions, and
neither was visible to a unit test or to a screenshot:

- a `?learn=` episode with no `camera` threw during boot and reported itself to
  the user as a browser that could not do 3D
- the mobile stage toolbar sat under the kit header at z-index 200, so five
  controls could not be tapped (pinned with `elementFromPoint`, not by eye)

The page borrows this origin's `localStorage` and puts it back when it finishes.
Results are also on `window.__results` so a script can read them without looking.

## Layer 3: mutation (`tests/mutants.mjs`)

A test that cannot fail is worse than no test, because it gets quoted. This
harness breaks `js/` in ways the suite claims to protect against, runs the suite,
and fails if it stayed green. Every mutant is a regression this project has either
shipped or nearly shipped: reverting the share-link encoder to raw `btoa`, letting
`paint()` ignore intensity, dropping `adoptOrphans` from the load path, removing
the `camera` from a preset episode, and so on.

It refuses to start on a dirty `js/` tree, restores in a `finally`, and verifies
`git diff --stat js/` is empty before exiting. A **surviving** mutant is a coverage
gap, not a pass. A **skipped** mutant means its anchor text no longer matches the
source: update `tests/mutants.mjs` rather than ignoring it.

## Why the tests are worded the way they are

The suite was written, then adversarially audited: every test was checked by
asking "if I broke the source in the way this test claims to protect against,
would it go red?", and where the answer was unclear, by actually making that
break and re-running. The audit found 73 tests that could not fail. The usual
shapes were:

- an assertion that restates a literal from the source rather than testing
  behaviour
- a loop whose expectation is computed the same way the source computes it
  (`GROUP_COLOR_NAMES[i]` checked against `colorName(GROUP_COLORS[i])` passes
  even after the names are shuffled)
- a membership check where the real behaviour is an ordering
  (`GROUP_COLORS.includes(c)` passes even if every overflow pain comes out the
  same colour)
- a name that promises more than the body checks

That is why assertions here tend to name expected values outright instead of
deriving them, and why several tests assert a *sequence* rather than
set membership. If a change makes one of them feel over-specified, check
`tests/mutants.mjs` first: the strictness is usually load-bearing.

## Writing a new test

Read `tests/patterns.test.mjs`. It is the exemplar. The rules the suite is held to:

1. Import the real module. Never re-implement the logic in the test.
2. Use real zone ids from the fixtures registry.
3. No assertion that cannot fail. No `assert.ok(true)`, no asserting a value
   against something the test itself computed the same way.
4. Test names are sentences that say what breaks:
   *"patternLabel never returns undefined, so the legend never says undefined"*
   beats *"patternLabel works"*.
5. If you find a product bug, pin it as `test.todo` with an explanation rather
   than deleting the assertion.
