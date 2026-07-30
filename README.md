<div align="center">

# HeadMap

Map head pain on a 3D head-and-neck model — where it hurts, how deep, how wide, what it feels like — and compare it against published headache patterns.

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

[url-site]:   https://headmap.neorgon.com/
[url-html]:   #
[url-css]:    #
[url-js]:     #
[url-claude]: https://claude.ai/code

</div>

---

## Overview

HeadMap helps people describe head pain precisely enough to stop guessing — so a sinus infection isn't treated like a migraine. Rotate a realistic 3D head and neck, tap exactly where it hurts, and describe each point: intensity (1–10), depth (surface, muscle, deep pressure, inside the head), quality (throbbing, electric, tight band…), spread (pinpoint to diffuse), and a free-text note.

The app compares the map against 21 published headache patterns — from tension-type and cluster to Chiari malformations, SUNCT/SUNA, and trigeminal neuralgia — and explains which zones, qualities, and laterality drove each score, so the user can walk into a consultation with a clear description.

HeadMap is a communication aid, not a diagnosis. Everything stays in the browser (localStorage); there is no account and no server. Share links encode the map in the URL itself, and JSON export/import backs up the whole diary.

**Live:** headmap.neorgon.com

---

## Features

- **Realistic 3D head + neck** — Lee Perry-Smith scan, rotate/zoom, tap-to-drop pain points anywhere on the skin.
- **50 named anatomical zones** — forehead in a 3×2 grid, temples, sinuses, occiput, neck, and more; zones light up on hover with a tooltip, and free points auto-name to the nearest zone.
- **Rich point descriptors** — intensity slider with severity bands, 4 depth levels rendered in 3D (surface decal, muscle ring, deep column, pulsing inside-the-head core), 10 pain qualities (spiky decals for electric/stabbing), 4 spread sizes, per-point notes.
- **Condition matcher** — transparent scoring (zone overlap + laterality + quality + depth) against 21 common and advanced patterns, with differentiators, red flags, and "load as starting points" presets that teach the textbook shape.
- **Safety first** — persistent "cannot diagnose" banner, red-flag list (thunderclap, worst-ever, neuro signs…), and capped match percentages that are explained as resemblance, not probability.
- **Episodes diary** — multiple dated episodes in localStorage, camera position restored per episode, rename/delete, compare over time.
- **Share & export** — compact share links (`#m=` in the URL, no server), JSON export of one episode or the whole diary, JSON import, PNG snapshot of the 3D view.
- **X-ray mode** — translucent skin that fades surface decals so deep-pressure columns read clearly.
- **Private by design** — no backend, no analytics on the map; opening a share link never overwrites the local diary.

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

---

## Architecture

```
headmap-site/
├── index.html            # HTML shell: header, stage, tabs (Map / Conditions / Episodes)
├── css/
│   └── style.css         # Emerald dark theme, app layout, panels, mobile breakpoints
├── js/
│   ├── app.js            # Entry point: registry load, boot, debug handle
│   ├── state.js          # Episodes + markers state, localStorage, URL payload, shared-link guard
│   ├── head3d.js         # Three.js scene, camera, lights, picking, render-on-demand
│   ├── picking.js        # Raycast → UV → zone-atlas LUT, nearest-patch fallback
│   ├── zoneshader.js     # onBeforeCompile patch: per-zone hover/active tint via 64×1 DataTexture
│   ├── markers.js        # DecalGeometry markers: halo/core/spiky, depth columns, x-ray fade
│   ├── registry.js       # zones.baked.json + atlas loader, zone lookup helpers
│   ├── zones.js          # Zone groups, depths, qualities, spreads, intensity bands
│   ├── conditions.js     # 21-condition library, matcher scoring, preset generator
│   ├── editor.js         # Selected-point editor, points list, zone browser
│   ├── panel-conditions.js # Match cards, red-flag list, condition library
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
