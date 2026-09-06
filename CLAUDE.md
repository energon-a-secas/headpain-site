# CLAUDE.md: Headpain

HeadPain: 3D head pain mapper. Colour-and-shape coded pains, a legend that
travels with every artifact, life-impact capture, an embeddable read-only view,
and a browsable library of published headache patterns (headpain.neorgon.com)

**Live:** headpain.neorgon.com · **Port:** 8846

## Run

```bash
make serve
```

Then open http://localhost:8846. It must be served over HTTP. The app is ES modules, and `file://` blocks them.

## Pages

| Page | What it is |
|---|---|
| `index.html` | The app. `?explain=1` opens read-only, `?learn=<pattern>` opens one library pattern read-only, `?compare=a,b` opens two of them as two pains on one head. |
| `embed.html` | The embeddable widget. Never reads localStorage; renders only what its URL carries. |
| `embed-builder.html` | A form that writes the iframe snippet, with a live preview and a working postMessage console. |
| `headache-patterns.html` | The reading index over the condition library, built at runtime from `CONDITIONS` so it cannot drift from what the matcher scores. Each card deep-links to `?learn=`. |
| `tests/browser.html` | The browser integration suite. Not linked, `noindex`. |

## Architecture

| Module | Lines | Owns |
|---|---:|---|
| `js/events.js` | 473 | `initApp`, every action the UI calls |
| `js/conditions.js` | 379 | `CONDITIONS`, `scoreConditions`, the disclaimers |
| `js/state.js` | 343 | the live model: `state`, episodes, pains, markers, impact |
| `js/head3d.js` | 313 | `createHead3D`: renderer, camera, picking, zone tint |
| `js/persist.js` | 271 | localStorage, JSON files, share-link payloads |
| `js/legend.js` | 255 | `buildLegend`, `legendHtml`, `drawLegendPng` |
| `js/embed.js` | 216 | the embed's boot, URL contract and postMessage API |
| `js/editor.js` | 214 | `renderEditor`, `renderPointsList`, `renderZoneBrowser` |
| `js/markers.js` | 213 | `MarkerLayer`: decals, depth geometry, pattern textures |
| `js/zones.js` | 202 | `ZONES`, `DEPTHS`, `QUALITIES`, `SPREADS`, intensity bands |
| `js/patterns.js` | 188 | `PATTERNS`, `drawPattern` (canvas), `patternSvg` (DOM) |
| `js/impact.js` | 172 | the impact vocabulary and `impactSentences` |
| `js/panel-impact.js` | 171 | the impact form, the prose summary, the trend strip |
| `js/painbar.js` | 150 | `renderPainBar`, inline rename, the colour/shape popover |
| `js/panel-conditions.js` | 142 | `renderMatches`, `renderRedFlags`, `renderLibrary` |
| `js/groups.js` | 137 | `GROUP_COLORS`, `paint`, `markerColor`, `markerPattern` |
| `js/embed-builder.js` | 104 | the builder form and its postMessage console |
| `js/presets.js` | 115 | `materializeSpots`, `plainEpisode`, `episodeFrom*` |
| `js/panel-episodes.js` | 88 | `renderEpisodes` |
| `js/picking.js` | 85 | `buildLut`, `nearestPatch`, `pickZone` |
| `js/panel-explain.js` | 110 | `renderExplain` |
| `js/zoneshader.js` | 72 | `createZoneShader` |
| `js/export.js` | 63 | JSON downloads, share URLs, the composited PNG |
| `js/demos.js` | 53 | `DEMOS` |
| `js/utils.js` | 53 | `$`, `$$`, `clamp`, `escHtml`, base64url helpers |
| `js/registry.js` | 57 | `loadRegistry` |
| `js/render.js` | 43 | `renderAll` |
| `js/guidance.js` | 36 | `ROOT_CAUSE_NOTE`, `guidanceFor` |
| `js/panel-demos.js` | 41 | `renderDemos` (rendered inside the Patterns tab) |
| `js/page-library.js` | 110 | `renderLibraryPage`: the headache-patterns page |
| `js/app.js` | 32 | boot |

Vendored from `packages/neorgon-ui/`: never edit in place, run the sync script instead: `js/neorgon-footer.js`, `js/neorgon-header.js`, `js/neorgon-dom.js`.

## The visual grammar

Three channels, three meanings. Breaking this is the fastest way to make a map
unreadable, and it is exactly what was wrong before 2026-09-05.

| Channel | Meaning | Where |
|---|---|---|
| hue **and** pattern glyph | which pain this is | `groups.js`, `patterns.js` |
| saturation, decal size, opacity | how intense | `paint()` in `groups.js` |
| sub-surface geometry (ring, column, nail-spike) | how deep | `markers.js` |
| jagged rim on the glyph | a stabbing quality | `drawPattern(id, spiky)` |

Colour alone is not enough: it is gone in greyscale, on a printout, and for a
red-green colour-blind reader. That is why every pain owns a shape too, and why
the legend spells both out in words ("sky, ringed").

## Tests

```bash
make test           # unit suite, Node's own runner, no npm install
make test-mutants   # proof the unit suite catches real breakage
make test-browser   # serves the site; open /tests/browser.html
```

Three layers, described in `tests/README.md`. The short version:

- **Unit** (`tests/*.test.mjs`): every module that does not import `three` runs
  under Node unmodified. `tests/shim.mjs` supplies the call-time browser globals
  and a *recording* canvas context, so PNG tests assert on the text drawn rather
  than on pixels. `tests/fixtures.mjs` builds the registry from the real
  `assets/zones.baked.json`, because a test against an invented zone id passes
  while the app renders nothing.
- **Browser** (`tests/browser.html`): WebGL, the boot path, DOM overlap, the
  iframe embed and its postMessage contract. Console errors are failures.
- **Mutation** (`tests/mutants.mjs`): breaks `js/` in ways the suite claims to
  catch and fails if it stays green. A surviving mutant is a coverage gap; a
  skipped one means its anchor text drifted and needs updating.

Node 22 and later already define `globalThis.localStorage`, but it is inert
without `--localstorage-file`. The shim overwrites it rather than deferring to
it, and probes it at import time, because the obvious
`if (!globalThis.localStorage)` guard silently leaves every storage test running
against a stub.

## Data

- `localStorage['headmap-v2']`

## Conventions

- Zero build step. Plain ES modules loaded by `js/app.js`.
- Header and footer come from the shared kits. Do not add site-local `.neo-footer` or `.header-bar` CSS.
- No single JS file over ~500 lines. `state.js` broke it once and `persist.js` is the split that fixed it.
- `state.js` is the live model; `persist.js` is every path in or out. persist imports state, never the reverse.

## Gotchas

- **Every marker belongs to a pain. Keep it that way.** `markerColor()` resolves
  through the group with no fallback, so a marker with a dangling `groupId`
  renders in the wrong hue rather than a neutral one. `adoptOrphans()` in
  `state.js` enforces it on every way in (localStorage, JSON import, share link,
  preset), and the intensity colour ramp was deleted from `utils.js` so nobody
  can reintroduce the old "grouped means group colour, ungrouped means intensity"
  ambiguity by reaching for it.
- **`activeGroupId` and `isolateGroupId` are different things.** The first is
  where new points land, the second is what you are looking at. They used to be
  one field, which meant looking at one pain silently redirected the next tap.
- **`btoa` is Latin-1 only.** `base64UrlEncode` goes through `TextEncoder` for
  exactly this reason: one curly apostrophe in a note used to throw
  `InvalidCharacterError` out of the click handler and leave "Copy share link" a
  dead button with no toast. iOS types that apostrophe by default. The decoder
  falls back to the raw binary string so links minted before the fix still open.
- **Share links truncate at `URL_MARKER_CAP` (12).** `shareWouldTruncate()` exists
  so the toast can say so. Do not raise the cap without measuring the URL length.
- **Any episode-shaped object needs `camera`.** `plainEpisode()` in `presets.js`
  omitted it once, and the boot threw inside `head.ready.then`, which the catch
  reported to the user as a browser that cannot do 3D.
- **Panels re-render on every `renderAll`.** A listener bound to a container that
  survives re-render (rather than to the freshly written innerHTML) stacks up one
  per past render. `panel-impact.js` guards with `el.dataset.wired`; copy that
  pattern, do not invent a new one.
- **The embed must never read localStorage.** A HeadPain widget on a third-party
  page that could render the visitor's own diary is a privacy leak. `embed.js`
  builds a plain episode from its URL and nothing else.
- **The x-ray depth columns read poorly head-on.** A column pointing at the camera
  projects to almost nothing. It is a known weakness of the depth encoding, not a
  regression.
- **Zone descriptions are merged at runtime, not baked.** `tools/bake-zones.mjs`
  carries geometry only, so `assets/zones.baked.json` has no `desc` field.
  `buildRegistry` merges the 55 authored descriptions from `js/zones.js` onto the
  baked zones by `baseId`. Without that merge the plain-language line under the
  point editor and every zone-browser tooltip render empty, which is how they
  shipped until 2026-09-05. If you add a zone description, put it in `js/zones.js`
  and do not re-bake expecting it to appear.
- **`base64UrlDecode` returns `null` on malformed input, it does not throw.**
  `atob` refuses any base64 whose length is 1 mod 4, which is what a share link
  losing a character to a chat client's line wrap looks like. Callers pass the
  result straight to `safeJsonParse` and fall through to the local diary. Do not
  "simplify" the try/catch away: the throw used to escape `boot()` and cost the
  reader their own diary along with the link.
- **Anything handed out as a marker position must be a copy.** `WHOLE_HEAD_SPOT`
  in `presets.js` is a module constant; handing out its arrays by reference made
  every whole-head marker in every episode share one pair.

## Do not touch

- `js/neorgon-*.js` and `css/neorgon-*.css`: vendored kits, regenerated by `packages/neorgon-ui/sync-*.sh`.
