<div align="center">

# HeadPain

Map head pain on a 3D head-and-neck model, where it hurts, how deep, how wide, what it feels like, and compare it against published headache patterns.

[![Live][badge-site]][url-site]
[![HTML5][badge-html]][url-html]
[![CSS3][badge-css]][url-css]
[![JavaScript][badge-js]][url-js]
[![Claude Code][badge-claude]][url-claude]
[![License][badge-license]](LICENSE)

[badge-site]:    https://img.shields.io/badge/live_site-0063e5?style=for-the-badge&logo=googlechrome&logoColor=white
[badge-html]:    https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[badge-css]:     https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white
[badge-js]:      https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[badge-claude]:  https://img.shields.io/badge/Claude_Code-CC785C?style=for-the-badge&logo=anthropic&logoColor=white
[badge-license]: https://img.shields.io/badge/license-MIT-404040?style=for-the-badge

[url-site]:   https://headpain.neorgon.com/
[url-html]:   #
[url-css]:    #
[url-js]:     #
[url-claude]: https://claude.ai/code

</div>

---

## Overview

HeadPain helps people describe head pain precisely enough to stop guessing, so a sinus infection isn't treated like a migraine. Rotate a realistic 3D head and neck, tap exactly where it hurts, and describe each point: intensity (1–10), depth (surface, muscle, deep pressure, inside the head), quality (throbbing, electric, tight band…), spread (pinpoint to diffuse), and a free-text note.

Two things make a map readable by somebody who did not build it. Each concurrent pain owns a **colour and a shape**, so two pains stay apart in greyscale, on a printout, and for a colour-blind reader; and every artifact carries a **legend**, on screen, burned into the exported PNG, and inside the embed. Beside the map, the app records what the pain **costs**: how often, how long, what it stops you doing, what comes with it, what helps, and how many days it took last month, rendered as sentences rather than ticked boxes.

The app compares the map against 21 published headache patterns, from tension-type and cluster to Chiari malformations, SUNCT/SUNA, and trigeminal neuralgia, and explains which zones, qualities, and laterality drove each score, so the user can walk into a consultation with a clear description.

HeadPain is a communication aid, not a diagnosis. Everything stays in the browser (localStorage); there is no account and no server. Share links encode the map in the URL itself, and JSON export/import backs up the whole diary.

**Live:** headpain.neorgon.com

---

## Features

- **Realistic 3D head + neck**: Lee Perry-Smith scan, rotate/zoom, tap-to-drop pain points anywhere on the skin.
- **50 named anatomical zones**: forehead in a 3×2 grid, temples, sinuses, occiput, neck, and more; zones light up on hover with a tooltip, and free points auto-name to the nearest zone.
- **Rich point descriptors**: intensity slider with severity bands, 4 depth levels rendered in 3D (surface decal, muscle ring, deep column, pulsing inside-the-head core), 10 pain qualities (spiky decals for electric/stabbing, an inward nail-spike for ice-pick), 4 spread sizes, per-point notes.
- **Pains, not point soup**: the pain you are adding to is a chip above the head, and every point lands in it, so grouping costs nothing. Name it by clicking the name; colour and shape are one click each. Isolate shows one pain alone, and the matcher scores one pain at a time.
- **A shape as well as a colour**: eight glyphs (solid, ringed, dotted, barred, crossed, arced, gridded, starred) rendered onto the 3D decals and as SVG in every list, so a map survives greyscale, print, and red-green colour blindness. Hue is identity, saturation is intensity, sub-surface geometry is depth.
- **A legend that travels**: on screen in the explain view, burned into the exported PNG, and shown inside the embed. Left/right zone pairs merge ("Frontal sinus (both sides)"), and every pain is described in a sentence rather than a form.
- **Explain view**: `?explain=1`, or the Explain button, opens the map read-only with plain-English cards for a doctor, a partner, or work. "Copy link to show someone" produces exactly that link.
- **Life impact**: how often it comes, how long it lasts, what it stops you doing, what comes with it, what helps, and days lost last month, shown back as sentences and carried into the explain view, the share link and the PNG. A trend strip charts the worst level across the diary.
- **Embeddable**: `embed.html` with a documented URL contract (`map`, `preset`, `demo`, `xray`, `isolate`, `legend`, `controls`, `rotate`, `camera`, `title`, `bg`) and a `postMessage` API so a host page can drive it. `embed-builder.html` writes the snippet. An embed never reads the visitor's saved diary.
- **Learning resource**: [headache-patterns.html](https://headpain.neorgon.com/headache-patterns.html) is a reading index over the whole library, built at runtime from the same data the matcher scores, so it cannot drift. Every pattern has `?learn=<pattern>`, which opens it on the head read-only with its own explanation (what it feels like, its timing, how it is told apart, its red flags), without touching the reader's own maps. Seven example maps sit at the foot of the Patterns tab.
- **Tested**: a unit suite on Node's own runner (no npm install, no `node_modules`), a browser suite for WebGL, layout overlap and the embed's postMessage contract, and a mutation harness that breaks the source on purpose and fails if the suite stays green. `make test`, `make test-browser`, `make test-mutants`.
- **Intensity guidance**: at 7/10 a "stop it reaching 8" card, at 8–10 a treat-early card (dark quiet room, cold pack, no screens) plus a root-cause note about medication-overuse. Educational, non-drug, non-diagnostic.
- **Condition matcher**: transparent scoring (zone overlap + laterality + quality + depth) against 21 common and advanced patterns, with differentiators, red flags, and presets that load either as a fresh map or as a new group alongside existing points.
- **Safety first**: persistent "cannot diagnose" banner, red-flag list (thunderclap, worst-ever, neuro signs…), and capped match percentages that are explained as resemblance, not probability.
- **Episodes diary**: multiple dated episodes in localStorage, camera position restored per episode, rename/delete, compare over time.
- **Share & export**: compact share links (`#m=` in the URL, no server), JSON export of one episode or the whole diary, JSON import, PNG snapshot of the 3D view.
- **X-ray mode**: translucent skin that fades surface decals so deep-pressure columns read clearly.
- **Private by design**: no backend, no analytics on the map; opening a share link never overwrites the local diary.

---

## Running locally

ES modules require an HTTP server (not `file://`):

```bash
make serve
```

Or manually:

```bash
python3 -m http.server 8846
```

## Tests

No npm install, no `node_modules`, nothing to set up. Node's own test runner and
a page you open.

```bash
make test           # unit suite over every module that does not import three
make test-browser   # serves the site; open /tests/browser.html
make test-mutants   # breaks the source on purpose; fails if the suite stays green
```

The mutation layer is the one worth explaining. A test that cannot fail is worse
than no test, because it gets quoted, so `tests/mutants.mjs` reverts the
share-link encoder to raw `btoa`, makes `paint()` ignore intensity, drops
`adoptOrphans` from the load path, removes the `camera` from a preset episode,
and a dozen more, then fails if the suite stayed green. Every mutant is a
regression this project has either shipped or nearly shipped.

See [tests/README.md](tests/README.md) for the layer boundaries and how to add to them.

---

## Architecture

```
headpain-site/
├── index.html            # HTML shell: header, stage, tabs (Map / Conditions / Demos / Episodes)
├── css/
│   └── style.css         # Emerald dark theme, app layout, panels, mobile breakpoints
├── js/
│   ├── app.js            # Entry point: registry load, boot, debug handle
│   ├── state.js          # Episodes + groups + markers state, localStorage, URL payload, shared-link guard
│   ├── groups.js         # Group color palette and per-marker color resolution
│   ├── guidance.js       # Non-drug intensity guidance (rising / severe) + root-cause note
│   ├── demos.js          # 7 demo definitions (5 common, ice-pick, mixed combo)
│   ├── head3d.js         # Three.js scene, camera, lights, picking, render-on-demand
│   ├── picking.js        # Raycast → UV → zone-atlas LUT, nearest-patch fallback
│   ├── zoneshader.js     # onBeforeCompile patch: per-zone color+strength tint via 64×1 DataTexture
│   ├── markers.js        # DecalGeometry markers: halo/core/spiky/spike, depth columns, x-ray fade
│   ├── registry.js       # zones.baked.json + atlas loader, zone lookup helpers
│   ├── zones.js          # Zone groups, depths, qualities, spreads, intensity bands
│   ├── conditions.js     # 21-condition library, matcher scoring, preset generator
│   ├── editor.js         # Selected-point editor, groups panel, points list, zone browser
│   ├── panel-conditions.js # Match cards, red-flag list, condition library
│   ├── panel-demos.js    # Demo gallery cards
│   ├── panel-episodes.js # Diary UI: rename, share, export, import
│   ├── render.js         # renderAll orchestration
│   ├── events.js         # Actions, head callbacks, tabs, toolbar, keyboard (x / r / Esc)
│   ├── export.js         # Share URL (#m= base64url), JSON downloads, PNG snapshot
│   └── utils.js          # DOM and formatting helpers
├── vendor/three/         # Vendored Three.js 0.160 + addons (OrbitControls, GLTFLoader, DecalGeometry)
├── assets/
│   ├── head-cropped.glb  # Normalized head+neck mesh (crown +1, chin −1)
│   ├── zones.baked.json  # 50 zone patches: anchor, normal, tangent frame, atlas index
│   └── zones-atlas.png   # 1024² zone-ID texture for GPU picking + shader tint
├── favicon.ico
├── energon-classic-logo.png
├── CNAME
├── robots.txt
├── sitemap.xml
├── Makefile
└── README.md
```

**Zone picking:** zone patches are baked offline into a UV atlas; at runtime a raycast yields `hit.uv`, a 3×3 majority filter reads the zone ID from the atlas, and a tangent-frame nearest-patch fallback covers atlas gaps (e.g. lips). Anatomical convention: +x is the patient's left.

**Privacy model:** share links set a `shared` flag that freezes localStorage writes; the local diary is merged back only when the user makes their first edit, so received links never clobber existing episodes.

---

<div align="center">
<sub>Part of <a href="https://neorgon.com/">Neorgon</a> · Head model © Lee Perry-Smith / Infinite 3D Head Scan, CC-BY 3.0</sub>
</div>
