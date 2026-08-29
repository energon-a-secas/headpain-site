// HeadPain zone catalog — single source of truth for surface zones and pain attributes.
//
// Authoring format (consumed by tools/bake-zones.mjs):
//   hint     — rough 3D point in RAW GLB coordinates, snapped onto the mesh at bake time
//   tangent  — preferred along-surface direction for the patch's U axis
//   extents  — [ru, rv] ellipse radii in raw units (bake scales them with the model)
//   mirror   — auto-generate the -right twin by negating x (+x = patient LEFT)
//   priority — tie-break when patches overlap (higher wins)
//
// Runtime geometry (anchors/normals/tangent frames) lives in assets/zones.baked.json;
// this file provides ids, labels, groups, descriptions, and attribute metadata.

export const ZONES = [
  // ── Forehead (3 cols × 2 rows) ──────────────────────────────────────────
  { id: 'forehead-upper', label: 'Upper forehead', group: 'forehead', mirror: true,
    hint: [0.75, 1.95, 2.1], tangent: [1, 0, 0], extents: [0.55, 0.5],
    desc: 'Top of the forehead, below the hairline.' },
  { id: 'forehead-upper-center', label: 'Upper forehead (center)', group: 'forehead',
    hint: [-0.1, 1.95, 2.15], tangent: [1, 0, 0], extents: [0.5, 0.5],
    desc: 'Top-middle of the forehead.' },
  { id: 'forehead-lower', label: 'Lower forehead', group: 'forehead', mirror: true,
    hint: [0.75, 1.35, 2.4], tangent: [1, 0, 0], extents: [0.5, 0.38],
    desc: 'Just above the eyebrow.' },
  { id: 'forehead-lower-center', label: 'Lower forehead (center)', group: 'forehead',
    hint: [-0.1, 1.35, 2.45], tangent: [1, 0, 0], extents: [0.42, 0.38],
    desc: 'Between / just above the eyebrows.' },

  // ── Temples & eyes ──────────────────────────────────────────────────────
  { id: 'temple', label: 'Temple', group: 'eye', mirror: true,
    hint: [1.7, 1.0, 0.85], tangent: [0, 1, 0], extents: [0.42, 0.5],
    desc: 'The flat soft spot beside the eye.' },
  { id: 'behind-eye', label: 'Behind / around eye', group: 'eye', mirror: true,
    hint: [0.65, 0.85, 2.25], tangent: [1, 0, 0], extents: [0.32, 0.3],
    desc: 'Pain felt deep inside or behind the eyeball.' },

  // ── Nose & sinuses ──────────────────────────────────────────────────────
  { id: 'sinus-frontal', label: 'Frontal sinus', group: 'nose-sinus', mirror: true, priority: 2,
    hint: [0.45, 1.3, 2.35], tangent: [1, 0, 0], extents: [0.28, 0.24],
    desc: 'Above the inner part of the eyebrow.' },
  { id: 'sinus-ethmoid', label: 'Between the eyes', group: 'nose-sinus', priority: 3,
    hint: [-0.1, 0.9, 2.25], tangent: [1, 0, 0], extents: [0.2, 0.22],
    desc: 'The narrow gap between the eyes.' },
  { id: 'nose-bridge', label: 'Bridge of nose', group: 'nose-sinus', priority: 1,
    hint: [-0.1, 0.55, 2.35], tangent: [0, 1, 0], extents: [0.2, 0.3],
    desc: 'The bony ridge of the nose.' },
  { id: 'sinus-maxillary', label: 'Maxillary sinus', group: 'nose-sinus', mirror: true, priority: 1,
    hint: [0.75, 0.1, 1.85], tangent: [1, 0, 0], extents: [0.35, 0.3],
    desc: 'Under the eye, beside the nose, over the cheekbone hollow.' },

  // ── Face & jaw ──────────────────────────────────────────────────────────
  { id: 'cheek', label: 'Cheek', group: 'face-jaw', mirror: true,
    hint: [1.25, 0.0, 1.35], tangent: [1, 0, 0], extents: [0.42, 0.4],
    desc: 'The fleshy part of the cheek.' },
  { id: 'tmj', label: 'Jaw joint (TMJ)', group: 'face-jaw', mirror: true, priority: 1,
    hint: [1.45, 0.45, 0.45], tangent: [0, 1, 0], extents: [0.3, 0.3],
    desc: 'Right in front of the ear, where the jaw hinges.' },
  { id: 'jaw-angle', label: 'Angle of jaw', group: 'face-jaw', mirror: true,
    hint: [1.15, -0.6, 0.35], tangent: [1, 0, 0], extents: [0.38, 0.35],
    desc: 'The back-bottom corner of the jaw.' },
  { id: 'chin', label: 'Chin', group: 'face-jaw',
    hint: [-0.1, -0.7, 2.0], tangent: [1, 0, 0], extents: [0.35, 0.3],
    desc: 'The point of the chin.' },
  { id: 'upper-teeth', label: 'Upper teeth / gums', group: 'face-jaw', mirror: true, priority: 1,
    hint: [0.35, -0.25, 2.15], tangent: [1, 0, 0], extents: [0.28, 0.18],
    desc: 'Upper teeth or the gum above them.' },

  // ── Ears ────────────────────────────────────────────────────────────────
  { id: 'ear', label: 'In / around ear', group: 'ear', mirror: true, priority: 2,
    hint: [1.65, 0.85, 0.05], tangent: [0, 1, 0], extents: [0.3, 0.4],
    desc: 'Inside the ear canal or the ear itself.' },
  { id: 'mastoid', label: 'Behind ear (mastoid)', group: 'ear', mirror: true, priority: 1,
    hint: [1.5, 0.3, -0.6], tangent: [0, 1, 0], extents: [0.3, 0.3],
    desc: 'The hard bump of bone just behind the ear.' },

  // ── Top of head ─────────────────────────────────────────────────────────
  { id: 'vertex-center', label: 'Crown (center)', group: 'scalp-top',
    hint: [-0.1, 3.8, -0.1], tangent: [1, 0, 0], extents: [0.55, 0.55],
    desc: 'The very top of the head.' },
  { id: 'vertex', label: 'Crown', group: 'scalp-top', mirror: true,
    hint: [1.0, 3.55, -0.1], tangent: [1, 0, 0], extents: [0.45, 0.45],
    desc: 'Top of the head, off-center.' },
  { id: 'parietal', label: 'Upper side of head', group: 'scalp-top', mirror: true,
    hint: [1.6, 2.2, -0.2], tangent: [0, 1, 0], extents: [0.5, 0.55],
    desc: 'The upper side wall of the head, above the ear.' },

  // ── Back of head ────────────────────────────────────────────────────────
  { id: 'occipital-upper', label: 'Back of head, upper', group: 'scalp-back', mirror: true,
    hint: [0.85, 1.8, -1.7], tangent: [1, 0, 0], extents: [0.55, 0.5],
    desc: 'Back of the head, upper quarter.' },
  { id: 'occipital-upper-center', label: 'Back of head, upper (center)', group: 'scalp-back',
    hint: [-0.1, 1.8, -1.95], tangent: [1, 0, 0], extents: [0.5, 0.5],
    desc: 'Back of the head, upper middle.' },
  { id: 'occipital-lower', label: 'Back of head, lower', group: 'scalp-back', mirror: true,
    hint: [0.8, 0.8, -1.55], tangent: [1, 0, 0], extents: [0.5, 0.45],
    desc: 'Back of the head, lower, just above the neck.' },
  { id: 'occipital-lower-center', label: 'Back of head, lower (center)', group: 'scalp-back',
    hint: [-0.1, 0.85, -1.75], tangent: [1, 0, 0], extents: [0.45, 0.45],
    desc: 'Back of the head, lower middle, just above the neck.' },
  { id: 'suboccipital', label: 'Where skull meets neck', group: 'scalp-back', mirror: true, priority: 1,
    hint: [0.7, -0.2, -1.3], tangent: [1, 0, 0], extents: [0.4, 0.35],
    desc: 'The hollow where the back of the skull joins the neck.' },

  // ── Neck ────────────────────────────────────────────────────────────────
  { id: 'neck-back-upper', label: 'Back of neck, upper', group: 'neck',
    hint: [-0.1, -1.1, -1.6], tangent: [1, 0, 0], extents: [0.5, 0.4],
    desc: 'The upper back of the neck, just below the skull.' },
  { id: 'neck-back-mid', label: 'Back of neck, middle', group: 'neck',
    hint: [-0.1, -1.6, -1.85], tangent: [1, 0, 0], extents: [0.45, 0.38],
    desc: 'The middle of the back of the neck.' },
  { id: 'neck-back-lower', label: 'Base of neck', group: 'neck',
    hint: [-0.1, -2.0, -1.95], tangent: [1, 0, 0], extents: [0.5, 0.32],
    desc: 'Where the neck meets the upper back.' },
  { id: 'neck-side', label: 'Side of neck', group: 'neck', mirror: true,
    hint: [1.3, -1.5, 0.2], tangent: [0, 1, 0], extents: [0.4, 0.45],
    desc: 'The rope-like muscle (SCM) running from behind the ear to the collarbone.' },
  { id: 'throat-front', label: 'Front of throat', group: 'neck',
    hint: [-0.1, -1.3, 1.1], tangent: [1, 0, 0], extents: [0.35, 0.4],
    desc: 'The front of the throat.' },
  { id: 'trap', label: 'Shoulder muscle (trapezius)', group: 'neck', mirror: true,
    hint: [2.0, -1.95, -0.5], tangent: [1, 0, 0], extents: [0.5, 0.4],
    desc: 'The muscle ridge between the neck and shoulder.' }
];

// Pseudo-zones: not clickable on the surface, selectable from the zone list.
export const VIRTUAL_ZONES = [
  { id: 'whole-head', label: 'Whole head / everywhere', group: 'whole', side: 'center',
    desc: 'Pain everywhere at once, no single spot.' }
];

export const ZONE_GROUPS = {
  forehead: { label: 'Forehead', order: 1 },
  eye: { label: 'Temples & eyes', order: 2 },
  'nose-sinus': { label: 'Nose & sinuses', order: 3 },
  'face-jaw': { label: 'Face & jaw', order: 4 },
  ear: { label: 'Ears', order: 5 },
  'scalp-top': { label: 'Top of head', order: 6 },
  'scalp-back': { label: 'Back of head', order: 7 },
  neck: { label: 'Neck', order: 8 },
  whole: { label: 'Whole head', order: 9 }
};

// ---------------------------------------------------------------------------
// Pain attribute metadata (labels + plain-language descriptions)
// ---------------------------------------------------------------------------

export const DEPTHS = [
  { id: 'surface', label: 'On the skin', short: 'Surface',
    desc: 'Feels like it\'s on the scalp or skin: touching or brushing hair can set it off.' },
  { id: 'muscle', label: 'In the muscle', short: 'Muscle',
    desc: 'Feels like a sore, tight muscle: a knot or clenched band.' },
  { id: 'deep-pressure', label: 'Deep / on bone', short: 'Deep',
    desc: 'Feels deep, like pressure pushing against the bone or from behind the face.' },
  { id: 'inside-head', label: 'Inside the head', short: 'Inside',
    desc: 'Feels like it\'s coming from deep inside the skull. Many common headaches feel this way too.' }
];

export const QUALITIES = [
  { id: 'throbbing', label: 'Throbbing', desc: 'Beats or pulses with the heartbeat' },
  { id: 'band-pressure', label: 'Tight band', desc: 'Like a band or vice squeezing the head' },
  { id: 'stabbing', label: 'Stabbing', desc: 'Sudden jabs, like being poked hard' },
  { id: 'burning', label: 'Burning', desc: 'Hot, searing, or sunburn-like' },
  { id: 'electric', label: 'Electric shock', desc: 'Like a lightning bolt or live wire' },
  { id: 'dull-ache', label: 'Dull ache', desc: 'A constant, heavy, background ache' },
  { id: 'sharp', label: 'Sharp', desc: 'Knife-like, cuts through' },
  { id: 'tender-touch', label: 'Tender to touch', desc: 'Hurts when touched, pressed, or laid on' },
  { id: 'fullness', label: 'Pressure / fullness', desc: 'Stuffed, swollen, about-to-burst feeling' },
  { id: 'ice-pick', label: 'Ice-pick', desc: 'A split-second stab, gone before you react' }
];

export const SPREADS = [
  { id: 'pinpoint', label: 'Pinpoint', desc: 'Smaller than a coin: one finger covers it', radius: 0.14 },
  { id: 'small', label: 'Small area', desc: 'About the size of a palm', radius: 0.28 },
  { id: 'regional', label: 'One region', desc: 'Covers a whole region (e.g. the whole temple)', radius: 0.5 },
  { id: 'diffuse', label: 'Widespread', desc: 'Spreads across several regions', radius: 0.85 }
];

export const INTENSITY_BANDS = [
  { max: 0, label: 'None', desc: 'No pain' },
  { max: 3, label: 'Mild', desc: 'Annoying, easy to ignore' },
  { max: 6, label: 'Moderate', desc: 'Interferes with what I\'m doing' },
  { max: 9, label: 'Severe', desc: 'Hard to think about anything else' },
  { max: 10, label: 'Worst possible', desc: 'The worst pain I can imagine' }
];

export function intensityBand(value) {
  return INTENSITY_BANDS.find(b => value <= b.max) || INTENSITY_BANDS[INTENSITY_BANDS.length - 1];
}

export function depthById(id) {
  return DEPTHS.find(d => d.id === id) || DEPTHS[0];
}

export function qualityById(id) {
  return QUALITIES.find(q => q.id === id) || null;
}

export function spreadById(id) {
  return SPREADS.find(s => s.id === id) || SPREADS[1];
}
