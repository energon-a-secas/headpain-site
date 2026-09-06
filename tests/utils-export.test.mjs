// The two ends of "get this map out of the app": the encoding primitives in
// js/utils.js and the four export paths in js/export.js that use them.
//
// Two regressions live here. base64UrlEncode goes through TextEncoder because
// btoa is Latin-1 only, and a curly apostrophe (the one iOS types by default)
// used to throw InvalidCharacterError out of the click handler, leaving "Copy
// share link" dead with no toast. And escHtml escapes quotes, because five
// sites in the fleet used textContent/innerHTML round-tripping, which escapes
// & < > but not " or ' — every attribute-position call site was injectable.
//
// On the export side the invariant is that a file leaving the app is
// identifiable (slugified, dated, correctly suffixed) and that the PNG carries
// its own key: the output canvas is taller than the source by exactly the
// legend height, so the legend is burned in rather than cropped off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloads, resetShim } from './shim.mjs';
import { registry, marker } from './fixtures.mjs';
import {
  clamp, escHtml, safeJsonParse, base64UrlEncode, base64UrlDecode
} from '../js/utils.js';
import { exportEpisodeJson, exportAllJson, buildShareUrl, downloadPng } from '../js/export.js';
import { episodeFromUrlPayload, URL_MARKER_CAP } from '../js/persist.js';
import {
  state, createEpisode, deleteEpisode, addGroup, addMarker,
  setActiveGroup, updateImpact, renameEpisode
} from '../js/state.js';
import { buildLegend, legendPngHeight } from '../js/legend.js';
import { FREQUENCIES } from '../js/impact.js';

// export.js builds the share link out of location.origin + location.pathname.
// Node has no location, so the test supplies one; nothing else in js/ reads it.
globalThis.location = { origin: 'https://headpain.neorgon.com', pathname: '/' };

const today = () => new Date().toISOString().slice(0, 10);

// A clean world built from the module's own API. persist.resetToDefaults()
// would be the direct route and it throws (see tests/state.test.mjs), and
// deleteEpisode() refuses to leave the diary empty, so the last episode goes by
// hand.
function freshWorld(title = 'Test map') {
  resetShim();
  const ep = createEpisode(title);
  for (const other of [...state.episodes]) if (other.id !== ep.id) deleteEpisode(other.id);
  state.shared = false;
  return ep;
}

function seedTwoPains(title = 'Monday migraine') {
  const ep = freshWorld(title);
  const a = addGroup({ name: 'Migraine' });
  setActiveGroup(a.id);
  addMarker(marker({ zoneId: 'temple-left', intensity: 9, quality: 'throbbing', depth: 'inside-head' }));
  const b = addGroup({ name: 'Sinus' });
  setActiveGroup(b.id);
  addMarker(marker({ zoneId: 'sinus-maxillary-left', intensity: 4, quality: 'fullness', depth: 'deep-pressure' }));
  return { ep, a, b };
}

// download() hands the JSON to a Blob and the Blob to createObjectURL, so the
// anchor stub only ever sees "blob:shim". Subclassing Blob for the duration of
// the call is the only way to read what was actually written to the file.
function captureDownload(fn) {
  const RealBlob = globalThis.Blob;
  let text = null;
  let type = null;
  globalThis.Blob = class CapturingBlob extends RealBlob {
    constructor(parts, opts) { super(parts, opts); text = parts.join(''); type = opts?.type ?? null; }
  };
  try { fn(); } finally { globalThis.Blob = RealBlob; }
  return { text, type, ...downloads[downloads.length - 1] };
}

// downloadPng builds its output canvas with document.createElement, so that is
// where the composited result has to be caught. The output is the only canvas
// created at the source width; the legend glyphs are 256x256 and the metrics
// canvas is the shim default 300x150.
function captureCanvases(fn) {
  const real = document.createElement;
  const made = [];
  document.createElement = tag => {
    const el = real(tag);
    if (el.tagName === 'CANVAS') made.push(el);
    return el;
  };
  try { fn(); } finally { document.createElement = real; }
  return made;
}

// ---------------------------------------------------------------------------
// utils.js — the encoding primitives a share link stands on
// ---------------------------------------------------------------------------

test('base64Url round-trips everything people actually type into a note', () => {
  const cases = {
    ascii: 'Woke up with it again, left temple',
    curlyApostrophe: 'It’s worse when I bend over',           // iOS types this one
    emoji: 'head 🤕 then 🧠💥',
    cjk: '偏頭痛 / 日本語のノート',
    accented: 'douleur à la tempe, côté gauche',
    long: 'pain '.repeat(1200),
    empty: ''
  };
  for (const [name, str] of Object.entries(cases)) {
    assert.equal(base64UrlDecode(base64UrlEncode(str)), str, `${name} did not survive the round trip`);
  }
});

test('base64UrlEncode is URL-safe: no +, / or = to break the hash', () => {
  // These three inputs are chosen because their UTF-8 bytes produce exactly the
  // characters standard base64 emits and a URL fragment cannot carry raw.
  assert.equal(base64UrlEncode('🤕').includes('+'), false, 'a + in the hash is decoded as a space');
  assert.match(base64UrlEncode('🤕'), /-/, 'the + should have been swapped for -, not dropped');
  assert.equal(base64UrlEncode('ÿÿÿ').includes('/'), false, 'a / in the hash reads as a path segment');
  assert.match(base64UrlEncode('ÿÿÿ'), /_/, 'the / should have been swapped for _, not dropped');
  assert.equal(base64UrlEncode('a'), 'YQ', 'padding must be stripped, not encoded');

  const payload = JSON.stringify({ t: 'It’s bad 🤕', m: [[1, 0.5, -0.25]] });
  assert.doesNotMatch(base64UrlEncode(payload), /[+/=]/);
});

test('a share link minted before the UTF-8 fix still opens', () => {
  // Old links hold raw btoa output: Latin-1 bytes, not UTF-8. Plain ASCII is
  // byte-identical either way...
  const ascii = 'Left temple, intensity 8';
  assert.equal(base64UrlDecode(btoa(ascii)), ascii);
  // ...but a high Latin-1 byte is not valid UTF-8, so the fatal TextDecoder
  // throws and the binary fallback is what keeps the old map readable.
  const latin1 = 'douleur à la tempe';
  assert.equal(base64UrlDecode(btoa(latin1)), latin1,
    'the Latin-1 fallback in base64UrlDecode was removed; every pre-fix link now opens as mojibake or nothing');
});

test('base64UrlDecode restores its own padding, so an unpadded hash still decodes', () => {
  for (const s of ['a', 'ab', 'abc', 'abcd']) {
    const encoded = base64UrlEncode(s);
    assert.doesNotMatch(encoded, /=/);
    assert.equal(base64UrlDecode(encoded), s, `length ${s.length} lost its padding`);
  }
});

test('safeJsonParse hands back the fallback instead of throwing, so a corrupt diary boots', () => {
  const fallback = { v: 0 };
  for (const bad of ['{nope', '', 'undefined', '[1,2', '{"a":]', undefined, {}, NaN]) {
    assert.equal(safeJsonParse(bad, fallback), fallback, `${String(bad)} should have fallen back`);
  }
  assert.deepEqual(safeJsonParse('{"v":2}', fallback), { v: 2 });
  // Two inputs that look like failures and are not. `null` is what
  // localStorage.getItem returns for an absent key, and it stringifies to the
  // valid JSON literal "null" — so a first-ever boot gets null, not the
  // fallback, and loadFromStorage's `if (!payload)` guard is what catches it.
  assert.equal(safeJsonParse(null, fallback), null,
    'a first boot returns null from getItem; the guard downstream is !payload, not === fallback');
  assert.equal(safeJsonParse('false', fallback), false,
    'valid JSON false is a parse result, not a parse failure');
});

test('clamp pins a value into the range, including the 0.85..2 window the PNG scale uses', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
  // downloadPng: clamp(width / 900, 0.85, 2)
  assert.equal(clamp(320 / 900, 0.85, 2), 0.85, 'a phone-sized canvas must not shrink the legend below legibility');
  assert.equal(clamp(4000 / 900, 0.85, 2), 2, 'a retina canvas must not blow the legend up past 2x');
  assert.equal(clamp(900 / 900, 0.85, 2), 1);
});

test('escHtml escapes quotes too, so a value in attribute position cannot break out', () => {
  assert.equal(escHtml('&'), '&amp;');
  assert.equal(escHtml('<script>'), '&lt;script&gt;');
  assert.equal(escHtml('"'), '&quot;');
  assert.equal(escHtml("'"), '&#39;');

  const attack = 'x" onerror="alert(1)';
  const escaped = escHtml(attack);
  assert.equal(escaped.includes('"'), false,
    'escHtml is interpolated into alt="..." and title="..."; an unescaped quote is an injection');
  assert.equal(escaped, 'x&quot; onerror=&quot;alert(1)');

  assert.equal(escHtml("it's"), 'it&#39;s', "a single quote closes a single-quoted attribute just as well");
  assert.equal(escHtml('&lt;'), '&amp;lt;', 'the ampersand is escaped first, so an entity is shown, not re-interpreted');
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
  assert.equal(escHtml(0), '0', 'intensity 0 must render as "0", not as an empty cell');
});

// ---------------------------------------------------------------------------
// export.js — share links
// ---------------------------------------------------------------------------

test('buildShareUrl carries the whole map in the hash', () => {
  seedTwoPains();
  const url = buildShareUrl(registry.zoneIndexOf);
  assert.ok(url.startsWith('https://headpain.neorgon.com/'), url);
  assert.ok(url.includes('#m='), 'the map lives in the fragment so it never reaches a server log');
  assert.doesNotMatch(url, /\?/, 'the plain link opens the editor, not the read-only view');
  assert.ok(url.split('#m=')[1].length > 40, 'the hash is empty; the link would open a blank map');
});

test('buildShareUrl({explain:true}) puts ?explain=1 before the hash, not inside it', () => {
  seedTwoPains();
  const url = buildShareUrl(registry.zoneIndexOf, { explain: true });
  assert.ok(url.includes('?explain=1'));
  assert.ok(url.indexOf('?explain=1') < url.indexOf('#m='),
    'a query after the fragment is part of the fragment; the explain view would never open');
  assert.equal(url.split('#m=')[1], buildShareUrl(registry.zoneIndexOf).split('#m=')[1],
    'explain changes the view, not the payload');
});

test('the payload in the hash decodes back to the same episode', () => {
  const { ep } = seedTwoPains('Monday migraine');
  const url = buildShareUrl(registry.zoneIndexOf);
  const payload = JSON.parse(base64UrlDecode(url.split('#m=')[1]));
  const restored = episodeFromUrlPayload(payload, registry.zoneIdAt);

  assert.equal(restored.title, 'Monday migraine');
  assert.deepEqual(restored.groups.map(g => g.name), ['Migraine', 'Sinus']);
  assert.deepEqual(restored.markers.map(m => m.zoneId), ep.markers.map(m => m.zoneId));
  assert.deepEqual(restored.markers.map(m => m.intensity), [9, 4]);
  assert.deepEqual(restored.markers.map(m => m.quality), ['throbbing', 'fullness']);
  assert.deepEqual(restored.markers.map(m => m.depth), ['inside-head', 'deep-pressure']);
  // Every marker still belongs to a pain, and to the right one.
  const nameOf = id => restored.groups.find(g => g.id === id)?.name;
  assert.deepEqual(restored.markers.map(m => nameOf(m.groupId)), ['Migraine', 'Sinus']);
});

test('a note full of curly apostrophes and emoji survives the share link', () => {
  freshWorld('It’s back 🤕');
  const pain = addGroup({ name: 'Migraine' });
  setActiveGroup(pain.id);
  addMarker(marker({ zoneId: 'temple-left', note: 'It’s worse when I bend over: 偏頭痛 🤕 · ± ½' }));

  const url = buildShareUrl(registry.zoneIndexOf);
  const restored = episodeFromUrlPayload(JSON.parse(base64UrlDecode(url.split('#m=')[1])), registry.zoneIdAt);
  assert.equal(restored.title, 'It’s back 🤕');
  assert.equal(restored.markers[0].note, 'It’s worse when I bend over: 偏頭痛 🤕 · ± ½');
});

test('the shared link stops at URL_MARKER_CAP points rather than minting an unusable URL', () => {
  freshWorld('Long day');
  const pain = addGroup({ name: 'Migraine' });
  setActiveGroup(pain.id);
  for (let i = 0; i < URL_MARKER_CAP + 5; i++) addMarker(marker({ zoneId: 'temple-left', intensity: 5 }));

  const payload = JSON.parse(base64UrlDecode(buildShareUrl(registry.zoneIndexOf).split('#m=')[1]));
  assert.equal(payload.m.length, URL_MARKER_CAP);
});

test('buildShareUrl returns null when there is no episode, so the button can stay quiet', () => {
  freshWorld();
  const saved = state.episodes;
  state.episodes = [];
  state.activeEpisodeId = null;
  try {
    assert.equal(buildShareUrl(registry.zoneIndexOf), null);
    assert.equal(buildShareUrl(registry.zoneIndexOf, { explain: true }), null,
      'the explain variant must not build a link around a null payload either');
  } finally {
    state.episodes = saved;
  }
});

// ---------------------------------------------------------------------------
// export.js — JSON downloads
// ---------------------------------------------------------------------------

test('exportEpisodeJson downloads a slugified, dated .json of that episode', () => {
  const { ep } = seedTwoPains();
  renameEpisode(ep.id, 'Monday Migraine! (bad one)');

  const got = captureDownload(() => exportEpisodeJson(ep));
  assert.equal(got.download, `headpain-monday-migraine-bad-one-${today()}.json`);
  assert.equal(got.type, 'application/json');

  const file = JSON.parse(got.text);
  assert.equal(file.kind, 'headmap-episode');
  assert.equal(file.headmapVersion, 2);
  assert.equal(file.title, 'Monday Migraine! (bad one)');
  assert.deepEqual(file.groups.map(g => g.name), ['Migraine', 'Sinus']);
  assert.deepEqual(file.markers.map(m => m.zone), ['temple-left', 'sinus-maxillary-left']);
});

test('the slug never leaves punctuation, a stray dash or an empty name in the filename', () => {
  const ep = freshWorld();
  const nameFor = title => {
    renameEpisode(ep.id, title);
    downloads.length = 0;
    exportEpisodeJson(state.episodes[0]);
    return downloads[0].download;
  };
  const slugOf = filename => filename.match(/^headpain-(.+)-\d{4}-\d{2}-\d{2}\.json$/)[1];

  assert.equal(slugOf(nameFor('  Bad   Head  ')), 'bad-head', 'leading and trailing dashes must be trimmed');
  assert.equal(slugOf(nameFor('!!!')), 'map', 'a title of pure punctuation slugs to nothing; "map" is the floor');
  assert.equal(slugOf(nameFor('Côté gauche')), 'c-t-gauche');
  const long = slugOf(nameFor('a'.repeat(80)));
  assert.equal(long.length, 40, 'the slug is capped at 40 chars so the filename stays openable');
});

test('exportAllJson downloads the whole diary under a dated headpain-diary name', () => {
  seedTwoPains('First map');
  createEpisode('Second map');

  const got = captureDownload(() => exportAllJson());
  assert.equal(got.download, `headpain-diary-${today()}.json`);

  const file = JSON.parse(got.text);
  assert.equal(file.kind, 'headmap-export');
  assert.equal(file.episodes.length, 2, 'the diary export must carry every episode, not just the active one');
  assert.deepEqual(file.episodes.map(e => e.title).sort(), ['First map', 'Second map']);
  assert.match(file.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
});

// ---------------------------------------------------------------------------
// export.js — the PNG, which has to carry its own key
// ---------------------------------------------------------------------------

test('downloadPng grows the canvas by exactly the legend height, so the key is burned in and not cropped', () => {
  const { ep } = seedTwoPains('Monday migraine');
  const model = buildLegend(ep, registry.zoneById);
  // 900 wide makes downloadPng's clamp(w / 900, 0.85, 2) exactly 1, so the
  // expected height comes straight from legend.js with no scale arithmetic here.
  const source = { width: 900, height: 600 };
  const legendH = legendPngHeight(model, 1, 900);
  assert.ok(legendH > 0, 'a legend with two pains cannot be zero pixels tall');

  const made = captureCanvases(() => downloadPng(source, model, 'Monday migraine'));
  const out = made.find(c => c.width === 900);
  assert.ok(out, 'downloadPng built no canvas at the source width');
  assert.equal(out.height, source.height + legendH,
    'the output is not the source plus the legend; the legend is either cropped or floating on empty space');
  assert.equal(out.width, source.width, 'the legend must not widen the picture');
});

test('downloadPng composites the source picture and paints the legend text into the output', () => {
  const { ep } = seedTwoPains('Monday migraine');
  const model = buildLegend(ep, registry.zoneById);
  const source = { width: 900, height: 600 };

  const made = captureCanvases(() => downloadPng(source, model, 'Monday migraine'));
  const out = made.find(c => c.width === 900);
  const ops = out._ctx.calls;

  const drew = ops.find(c => c.op === 'drawImage' && c.args[0] === source);
  assert.ok(drew, 'the source canvas was never drawn into the output; the PNG would be a legend on a blank field');
  assert.deepEqual(drew.args.slice(1), [0, 0], 'the head must sit at the top-left, above the legend strip');

  const text = out._ctx.text();
  assert.ok(text.includes('Monday migraine'), `the title never reached the PNG: ${JSON.stringify(text)}`);
  assert.ok(text.includes('Migraine') && text.includes('Sinus'),
    'both pain names must be named in the burned-in key, or a colour means nothing to the reader');
  assert.ok(text.some(t => /2 points/.test(t)), 'the point/pain stamp is missing from the PNG header');

  // The legend strip is filled below the picture, not over it.
  const strip = ops.find(c => c.op === 'fillRect' && c.args[1] === source.height);
  assert.ok(strip, 'no legend background was painted at y = source height');
  assert.equal(strip.args[2], source.width);
});

test('downloadPng writes a slugified, dated .png and hands the anchor a real image URL', () => {
  const { ep } = seedTwoPains();
  const model = buildLegend(ep, registry.zoneById);
  downloads.length = 0;

  downloadPng({ width: 900, height: 600 }, model, 'Monday Migraine!');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].download, `headpain-monday-migraine-${today()}.png`);
  assert.match(downloads[0].href, /^data:image\/png/,
    'the anchor must point at the composited output, not at the untouched source canvas');
});

test('the burned-in legend carries the impact sentences the person wrote, not just the swatches', () => {
  const { ep } = seedTwoPains('Monday migraine');
  updateImpact({ frequency: FREQUENCIES[0].id, daysLost: 3 });
  const model = buildLegend(ep, registry.zoneById);
  assert.ok(model.impact.length, 'impact was set but produced no sentences');

  const source = { width: 900, height: 600 };
  const withImpact = legendPngHeight(model, 1, 900);
  const withoutImpact = legendPngHeight({ ...model, impact: [] }, 1, 900);
  assert.ok(withImpact > withoutImpact,
    'impact sentences did not reserve any height, so they would be drawn outside the canvas');

  const made = captureCanvases(() => downloadPng(source, model, 'Monday migraine'));
  const out = made.find(c => c.width === 900);
  assert.equal(out.height, source.height + withImpact);
  const text = out._ctx.text().join(' ');
  assert.ok(/cost me about 3 days/.test(text), `the days-lost sentence never reached the PNG: ${text}`);
});
