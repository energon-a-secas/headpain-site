// Pattern vocabulary — the non-hue channel that carries pain identity.
//
// Colour alone cannot tell two pains apart: it is invisible in greyscale, on a
// printed handout, and to a red-green colour-blind reader, and this app already
// spends colour on intensity as well. So every pain owns a *shape* too, and the
// same eight shapes are drawn twice here: once onto a canvas for the 3D decals,
// once as SVG for chips, lists and the legend. One vocabulary, two renderers.
//
// Shapes are drawn white and tinted by the caller (THREE material colour, or the
// SVG `fill`), so a pattern texture is cached once and reused by every pain.

export const PATTERNS = [
  { id: 'solid', label: 'solid' },
  { id: 'ring',  label: 'ringed' },
  { id: 'dots',  label: 'dotted' },
  { id: 'bars',  label: 'barred' },
  { id: 'cross', label: 'crossed' },
  { id: 'arcs',  label: 'arced' },
  { id: 'grid',  label: 'gridded' },
  { id: 'star',  label: 'starred' }
];

const PATTERN_IDS = PATTERNS.map(p => p.id);

export function patternAt(index) {
  return PATTERN_IDS[((index % PATTERN_IDS.length) + PATTERN_IDS.length) % PATTERN_IDS.length];
}

export function patternIndexOf(id) {
  return PATTERN_IDS.indexOf(id);
}

export function isPattern(id) {
  return PATTERN_IDS.includes(id);
}

export function patternLabel(id) {
  return PATTERNS.find(p => p.id === id)?.label || 'solid';
}

// ---------------------------------------------------------------------------
// Canvas: 256×256, glyph centred at (128,128), soft-masked so decals blend into
// the skin instead of ending in a hard cut.
// ---------------------------------------------------------------------------

const C = 128;   // centre
const R = 118;   // outer radius of the glyph

function ring(ctx, radius, width) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(C, C, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function starPath(ctx, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](C + Math.cos(a) * r, C + Math.sin(a) * r);
  }
  ctx.closePath();
}

const GLYPH = {
  solid(ctx) {
    const g = ctx.createRadialGradient(C, C, 8, C, C, R);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.88)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  },
  ring(ctx) {
    dot(ctx, C, C, 34);
    ring(ctx, 84, 24);
  },
  dots(ctx) {
    dot(ctx, C, C, 26);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      dot(ctx, C + Math.cos(a) * 82, C + Math.sin(a) * 82, 21);
    }
  },
  bars(ctx) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 26;
    for (const dy of [-58, 0, 58]) {
      const half = Math.sqrt(Math.max(0, R * R - dy * dy)) * 0.82;
      ctx.beginPath();
      ctx.moveTo(C - half, C + dy);
      ctx.lineTo(C + half, C + dy);
      ctx.stroke();
    }
  },
  cross(ctx) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.moveTo(C, C - 94); ctx.lineTo(C, C + 94);
    ctx.moveTo(C - 94, C); ctx.lineTo(C + 94, C);
    ctx.stroke();
  },
  arcs(ctx) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 22;
    dot(ctx, C, C + 62, 20);
    for (const r of [56, 96]) {
      ctx.beginPath();
      ctx.arc(C, C + 62, r, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();
    }
  },
  grid(ctx) {
    ctx.lineWidth = 18;
    for (const d of [-62, 0, 62]) {
      const half = Math.sqrt(Math.max(0, R * R - d * d)) * 0.84;
      ctx.beginPath();
      ctx.moveTo(C - half, C + d); ctx.lineTo(C + half, C + d);
      ctx.moveTo(C + d, C - half); ctx.lineTo(C + d, C + half);
      ctx.stroke();
    }
  },
  star(ctx) {
    starPath(ctx, 8, R * 0.98, R * 0.42);
    ctx.fill();
  }
};

// A jagged rim, added for stabbing / electric / ice-pick qualities. It rides on
// top of whichever glyph the pain owns, so quality and identity stay separable.
function spikyRim(ctx) {
  ctx.save();
  ctx.lineWidth = 10;
  ctx.lineJoin = 'miter';
  starPath(ctx, 14, R * 1.0, R * 0.7);
  ctx.stroke();
  ctx.restore();
}

export function drawPattern(ctx, patternId, spiky = false) {
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  (GLYPH[patternId] || GLYPH.solid)(ctx);
  if (spiky) spikyRim(ctx);

  // Soft radial mask: hard-edged decals read as stickers, not as pain.
  const mask = ctx.createRadialGradient(C, C, R * 0.55, C, C, R * 1.02);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.82, 'rgba(0,0,0,0.85)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 256, 256);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// SVG: the same eight glyphs at 24×24, for chips, point rows and the legend.
// Returned as markup so callers can drop it straight into a template string.
// ---------------------------------------------------------------------------

const SVG_BODY = {
  solid: '<circle cx="12" cy="12" r="9"/>',
  ring:  '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  dots:  '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="4.6" r="2.1"/><circle cx="18.4" cy="8.3" r="2.1"/><circle cx="18.4" cy="15.7" r="2.1"/><circle cx="12" cy="19.4" r="2.1"/><circle cx="5.6" cy="15.7" r="2.1"/><circle cx="5.6" cy="8.3" r="2.1"/>',
  bars:  '<g stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M5 7h14"/><path d="M3.5 12h17"/><path d="M5 17h14"/></g>',
  cross: '<g stroke="currentColor" stroke-width="3.6" stroke-linecap="round"><path d="M12 3.5v17"/><path d="M3.5 12h17"/></g>',
  arcs:  '<circle cx="12" cy="18.5" r="2.1"/><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7.2 14.6a6.4 6.4 0 0 1 9.6 0"/><path d="M4 10.6a10.8 10.8 0 0 1 16 0"/></g>',
  grid:  '<g stroke="currentColor" stroke-width="2.1"><path d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16"/></g>',
  star:  '<path d="M12 2.2l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 14.8l-5 2.7 1.1-5.6L4 8l5.6-.7z"/>'
};

export function patternSvg(patternId, color, size = 14, title = '') {
  const body = SVG_BODY[patternId] || SVG_BODY.solid;
  return `<svg class="pat" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"
    focusable="false" style="color:${color};fill:${color}">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}
