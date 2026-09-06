// The legend — what a map means, in a form someone who did not build it can read.
//
// This is the piece the app never had. A map was legible only to the person who
// placed the points: the PNG export was the bare canvas, and a share link
// dropped the recipient into the full editor. Everything downstream reads the
// same model built here: the on-screen key, the explain view, the burned-in PNG
// legend and the embed.
//
// Two renderers, one model. DOM for the screen, 2D canvas for the PNG, because
// a picture handed to a doctor has to carry its own key.

import { escHtml } from './utils.js';
import { intensityBand, depthById, qualityById, spreadById } from './zones.js';
import { colorName, paint, patternLabel } from './groups.js';
import { impactSentences } from './impact.js';
import { patternSvg, drawPattern } from './patterns.js';

const MAX_ZONES_LISTED = 4;

function commaList(items, joiner = 'and') {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  // No two-item special case: the general form already builds "a and b" for
  // two, because slice(0, -1).join(', ') is just "a".
  return `${list.slice(0, -1).join(', ')} ${joiner} ${list[list.length - 1]}`;
}

// Named only when it is not the default. "On the skin" on every row is noise;
// "deep against the bone" on the one row that is deep is the whole point.
function depthWord(markers) {
  const deep = markers.filter(m => m.depth && m.depth !== 'surface');
  if (!deep.length) return null;
  const id = commonest(deep.map(m => m.depth));
  return id ? depthById(id).plain : null;
}

function commonest(values) {
  const tally = new Map();
  for (const v of values) if (v) tally.set(v, (tally.get(v) || 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// A left/right pair is one place to a reader, not two. "Frontal sinus (L),
// Frontal sinus (R)" is how the data is stored; "Frontal sinus (both sides)" is
// what a person says, and it buys room to name more of the map before the
// "and N more" cutoff.
function mergeSides(labels) {
  const seen = [];
  const sides = new Map();
  for (const label of labels) {
    const m = label.match(/^(.*) \((L|R)\)$/);
    const base = m ? m[1] : label;
    if (!sides.has(base)) { sides.set(base, new Set()); seen.push(base); }
    if (m) sides.get(base).add(m[2]);
  }
  return seen.map(base => {
    const s = sides.get(base);
    if (s.size === 2) return `${base} (both sides)`;
    if (s.size === 1) return `${base} (${s.has('L') ? 'left' : 'right'})`;
    return base;
  });
}

// One pain, in a sentence a non-clinician can read out loud.
function describe(pain, markers, zoneById) {
  const peak = Math.max(...markers.map(m => m.intensity));
  const zones = mergeSides([...new Set(markers.map(m => zoneById(m.zoneId)?.label).filter(Boolean))]);
  const shown = zones.slice(0, MAX_ZONES_LISTED);
  const extra = zones.length - shown.length;
  const where = shown.length
    ? commaList(shown) + (extra ? `, and ${extra} more place${extra === 1 ? '' : 's'}` : '')
    : 'across the head';
  const quality = qualityById(commonest(markers.map(m => m.quality)));
  const depth = depthById(commonest(markers.map(m => m.depth)) || 'surface');
  const spread = spreadById(commonest(markers.map(m => m.spread)));
  // `plain` phrasings, not the form labels: this sentence gets read aloud.
  const feels = [quality?.plain, depth.plain, spread.plain].filter(Boolean).join(', ');

  return {
    where: `${where}.`,
    strength: `Worst ${peak} out of 10, ${intensityBand(peak).label.toLowerCase()}.`,
    feels: feels ? `${feels[0].toUpperCase()}${feels.slice(1)}.` : '',
    peak
  };
}

export function buildLegend(ep, zoneById) {
  const byPain = new Map(ep.groups.map(g => [g.id, []]));
  for (const m of ep.markers) if (byPain.has(m.groupId)) byPain.get(m.groupId).push(m);

  const pains = ep.groups.map(g => {
    const markers = byPain.get(g.id) || [];
    const prose = markers.length ? describe(g, markers, zoneById) : null;
    return {
      id: g.id,
      name: g.name,
      color: g.color,
      pattern: g.pattern,
      conditionId: g.conditionId || null,
      depthWord: markers.length ? depthWord(markers) : null,
      // Spoken, for anyone who cannot use the swatch: "sky, ringed".
      styleWords: `${colorName(g.color)}, ${patternLabel(g.pattern)}`,
      count: markers.length,
      peak: prose ? prose.peak : 0,
      prose
    };
  });

  return {
    title: ep.title,
    updatedAt: ep.updatedAt,
    pains,
    painCount: pains.length,
    pointCount: ep.markers.length,
    impact: impactSentences(ep.impact)
  };
}

// ---------------------------------------------------------------------------
// DOM: the on-screen key and the explain card
// ---------------------------------------------------------------------------

export function legendHtml(model, { verbose = false, isolateId = null } = {}) {
  if (!model.pains.length) return '';
  const rows = model.pains.map(p => {
    const dimmed = isolateId && isolateId !== p.id;
    const meta = p.count
      ? [`${p.count} point${p.count === 1 ? '' : 's'}`, `worst ${p.peak}/10`, p.depthWord, p.styleWords]
        .filter(Boolean).join(' · ')
      : `no points yet · ${p.styleWords}`;
    return `
      <li class="legend-row ${dimmed ? 'faded' : ''}">
        <span class="legend-glyph">${patternSvg(p.pattern, paint(p.color, Math.max(p.peak, 4)), verbose ? 20 : 15)}</span>
        <span class="legend-text">
          <span class="legend-name">${escHtml(p.name)}</span>
          <span class="legend-meta">${escHtml(meta)}</span>
          ${verbose && p.prose ? `<span class="legend-prose">${escHtml(
            [p.prose.where, p.prose.strength, p.prose.feels].filter(Boolean).join(' ')
          )}</span>` : ''}
        </span>
      </li>`;
  }).join('');

  return `
    <div class="legend ${verbose ? 'legend--verbose' : ''}">
      <div class="legend-head">
        <span class="legend-title">${escHtml(model.title)}</span>
        <span class="legend-count">${model.pointCount} point${model.pointCount === 1 ? '' : 's'}</span>
      </div>
      <ul class="legend-list">${rows}</ul>
      <div class="legend-scale">
        <span>mild</span><span class="legend-ramp" aria-hidden="true"></span><span>worst</span>
        <span class="legend-scale-note">stronger colour means more intense${
          model.pains.some(p => p.depthWord) ? '; turn the head to see how deep' : ''}</span>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// 2D canvas: the same key, burned into the exported PNG
// ---------------------------------------------------------------------------

const glyphCache = new Map();

function glyphCanvas(pattern, color) {
  const key = `${pattern}|${color}`;
  let c = glyphCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    drawPattern(g, pattern, false);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    glyphCache.set(key, c);
  }
  return c;
}

const PNG_FONT = "600 {size}px 'Avenir Next', -apple-system, 'Segoe UI', Roboto, sans-serif";
const font = (size, weight = 600) => PNG_FONT.replace('600', String(weight)).replace('{size}', String(size));

// Wraps text to a pixel width and returns the lines. The canvas API has no
// wrapping of its own, and an impact sentence is a whole sentence.
function wrap(g, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Height the legend block needs at a given scale, so the caller can size the
// output canvas before anything is drawn. Impact sentences are measured with a
// scratch context, because their wrapped height depends on the output width.
export function legendPngHeight(model, s = 1, width = 900) {
  const base = 54 + model.pains.length * 34 + 42;
  if (!model.impact?.length) return Math.round(base * s);
  const g = document.createElement('canvas').getContext('2d');
  g.font = font(13 * s);
  const lines = model.impact.reduce((n, line) => n + wrap(g, line, width - 44 * s).length, 0);
  return Math.round(base * s + 14 * s + lines * 19 * s);
}

export function drawLegendPng(g, model, { x, y, width, scale: s = 1 }) {
  g.save();
  g.textBaseline = 'middle';

  g.fillStyle = '#0b1120';
  g.fillRect(x, y, width, legendPngHeight(model, s, width));
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, width, Math.max(1, s));

  const pad = 22 * s;
  let cursor = y + 26 * s;

  g.font = font(17 * s, 700);
  g.fillStyle = '#f9f9f9';
  g.fillText(model.title, x + pad, cursor);
  g.font = font(13 * s, 400);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  const stamp = `${model.pointCount} point${model.pointCount === 1 ? '' : 's'} · ${model.painCount} pain${model.painCount === 1 ? '' : 's'}`;
  g.textAlign = 'right';
  g.fillText(stamp, x + width - pad, cursor);
  g.textAlign = 'left';

  cursor += 30 * s;
  for (const p of model.pains) {
    const size = 20 * s;
    g.drawImage(glyphCanvas(p.pattern, paint(p.color, Math.max(p.peak, 4))), x + pad, cursor - size / 2, size, size);
    g.font = font(14 * s, 700);
    g.fillStyle = '#f9f9f9';
    g.fillText(p.name, x + pad + size + 10 * s, cursor);
    const nameWidth = g.measureText(p.name).width;
    g.font = font(13 * s, 400);
    g.fillStyle = 'rgba(255,255,255,0.62)';
    const meta = p.count
      ? [`${p.count} point${p.count === 1 ? '' : 's'}`, `worst ${p.peak}/10`, p.depthWord, p.styleWords]
        .filter(Boolean).join(' · ')
      : `no points · ${p.styleWords}`;
    g.fillText(meta, x + pad + size + 20 * s + nameWidth, cursor);
    cursor += 34 * s;
  }

  if (model.impact?.length) {
    cursor += 2 * s;
    g.font = font(13 * s, 400);
    g.fillStyle = 'rgba(255,255,255,0.78)';
    for (const sentence of model.impact) {
      for (const line of wrap(g, sentence, width - 2 * pad)) {
        g.fillText(line, x + pad, cursor);
        cursor += 19 * s;
      }
    }
  }

  // The safety line travels with the picture: a PNG outlives the page it came
  // from, and this one is going to land in a message thread.
  g.font = font(12 * s, 400);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillText('HeadPain · headpain.neorgon.com · a description of pain, not a diagnosis',
    x + pad, y + legendPngHeight(model, s, width) - 18 * s);
  g.restore();
}
