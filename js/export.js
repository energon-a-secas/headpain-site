// File & link exports — JSON downloads, shareable URL hash, PNG snapshots.

import { episodeToJson, allToJson, serializeForUrl } from './state.js';
import { base64UrlEncode } from './utils.js';

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

export function buildShareUrl(zoneIndexOf) {
  const payload = serializeForUrl(zoneIndexOf);
  if (!payload) return null;
  return `${location.origin}${location.pathname}#m=${base64UrlEncode(JSON.stringify(payload))}`;
}

export function downloadPng(dataUrl, title) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `headpain-${slug(title)}-${stamp()}.png`;
  a.click();
}
