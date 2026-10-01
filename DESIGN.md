# HeadPain workspace

## Scene and direction

A person uses their phone in a dim room during a headache, trying to describe what they feel with little effort. Keep the dark canvas, soften the contrast between surfaces, and make the next action clear. The user confirmed a calm, approachable feel and prioritised easy mapping, sharing, and a useful diary.

## Colour

The mapper uses restrained, lightly tinted charcoal surfaces and a mint action colour. Tokens live in `css/workspace.css`, scoped to `.headpain-app`. The shared Neorgon header and footer remain managed by their vendored kits.

- Background: `oklch(19% 0.012 235)`.
- Map surface: `oklch(22% 0.016 235)`.
- Panel surface: `oklch(23% 0.012 235)`.
- Primary text: `oklch(94% 0.009 180)`.
- Secondary text: `oklch(82% 0.012 210)`.
- Muted text: `oklch(70% 0.018 220)`.
- Primary action: `oklch(77% 0.11 166)`.

Pain colours and glyphs retain their separate meaning. Hue and shape identify a pain, saturation conveys intensity, and geometry conveys depth. Controls must not introduce a competing intensity colour ramp.

## Typography

Use the existing Avenir Next and system sans stack. The workspace heading is 2rem on desktop and 1.75rem on phones. Panel headings use 1.2–1.45rem; body and control text use a compact hierarchy. Form inputs use at least 16px on phones to avoid automatic zoom.

## Layout

Desktop: a map beside the editing panel, with episode and sharing actions above. Keep the anatomy free of forms and position camera presets beneath it. Use one continuous surface per workspace, with borders for internal structure.

Tablet and phone: stack the panel below the map, keeping the map visible while editing. Selecting a point brings its editor into view. The selected tab and the point heading remain visible below the map.

## Interaction

- Empty maps offer brief guidance and six common named areas.
- A first point creates its pain automatically. A named area turns the camera toward that area.
- Optional impact details follow the point editor.
- Sharing opens an inline explanation with link and image actions.
- Diary rows show date, location, peak intensity, and pain glyphs. Backup and deletion controls live in separate disclosure sections.
- Keyboard tabs support arrows, Home, and End. Edits preserve focus.
- Reduced motion disables decorative transitions and pulsing inside the 3D map.
- Save status reports a storage failure instead of promising that an unsaved map is safe.

## Implementation boundaries

No build step, additional runtime dependencies, accounts, or server storage. Workspace behaviour lives in `js/workspace.js`; the model and storage boundaries remain in `state.js` and `persist.js`. Shared links and library examples stay read-only until the user chooses to edit.
