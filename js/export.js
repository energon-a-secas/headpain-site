// File & link exports — JSON downloads, shareable URL hash, PNG snapshots.

import { episodeToJson, allToJson, serializeForUrl } from './persist.js';
import { base64UrlEncode, clamp } from './utils.js';
import { drawLegendPng, legendPngHeight } from './legend.js';

function slug(s) {
  return (s || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'map';
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportEpisodeJson(ep) {
  download(`headpain-${slug(ep.title)}-${stamp()}.json`, JSON.stringify(episodeToJson(ep), null, 2));
}

export function exportAllJson() {
  download(`headpain-diary-${stamp()}.json`, JSON.stringify(allToJson(), null, 2));
}

// `explain` opens the link straight into the read-only view: a person you send
// a map to wants to read it, not to be handed an editor.
export function buildShareUrl(zoneIndexOf, { explain = false } = {}) {
  const payload = serializeForUrl(zoneIndexOf);
  if (!payload) return null;
  const query = explain ? '?explain=1' : '';
  return `${location.origin}${location.pathname}${query}#m=${base64UrlEncode(JSON.stringify(payload))}`;
}

// The exported picture carries its own key. Without it the file was coloured
// smudges: whoever opened it had no way to learn what a colour or a shape meant.
export function downloadPng(canvas, model, title) {
  const w = canvas.width;
  const h = canvas.height;
  const s = clamp(w / 900, 0.85, 2);
  const legendH = legendPngHeight(model, s, w);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h + legendH;
  const g = out.getContext('2d');
  g.fillStyle = '#070b16';
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(canvas, 0, 0);
  drawLegendPng(g, model, { x: 0, y: h, width: w, scale: s });

  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = `headpain-${slug(title)}-${stamp()}.png`;
  a.click();
}
