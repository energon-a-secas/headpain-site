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
// legend height, so the legend is burned in rather than cropped off, and every
// glyph and sentence lands inside that height, at the scale the export width
// earns, not somewhere below the bottom edge of the file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloads, resetShim } from './shim.mjs';
import { registry, marker } from './fixtures.mjs';
import {
  clamp, debounce, escHtml, safeJsonParse, base64UrlEncode, base64UrlDecode
} from '../js/utils.js';
import { exportEpisodeJson, exportAllJson, buildShareUrl, downloadPng } from '../js/export.js';
import { episodeFromUrlPayload, URL_MARKER_CAP } from '../js/persist.js';
import {
  state, createEpisode, deleteEpisode, addGroup, addMarker,
  setActiveGroup, setCamera, updateImpact, renameEpisode
} from '../js/state.js';
import { buildLegend, legendPngHeight } from '../js/legend.js';
import { BLOCKED, FREQUENCIES } from '../js/impact.js';

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
//
// Each captured canvas also gets a toDataURL that names itself. The shim hands
// every canvas the same constant data URL, so without this an anchor pointed at
// a blank, never-drawn canvas is indistinguishable from one pointed at the
// composited output, which is exactly what the .png download has to prove.
function captureCanvases(fn) {
  const real = document.createElement;
  const made = [];
  document.createElement = tag => {
    const el = real(tag);
    if (el.tagName === 'CANVAS') {
      made.push(el);
      el.toDataURL = () => `data:image/png;base64,${el.width}x${el.height}/${el._ctx.calls.length}`;
    }
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

test('a hash mangled in transit degrades to null instead of taking the app down', () => {
  // Both call sites (js/app.js, js/embed.js) pull the hash with
  // /m=([A-Za-z0-9_-]+)/, so the *alphabet* is safe by construction. The length
  // is not: atob refuses any base64 whose length is 1 mod 4, which is what a
  // link that lost a character to a chat client's line wrap looks like. That
  // used to throw out of boot(), so a truncated link cost the reader their own
  // diary as well as the shared map.
  for (const mangled of ['Y', 'YWJjZ']) {
    assert.equal(base64UrlDecode(mangled), null,
      `base64UrlDecode('${mangled}') (length ${mangled.length}, 1 mod 4) must not throw`);
    assert.equal(safeJsonParse(base64UrlDecode(mangled), null), null,
      'the caller has to be able to fall through to the local diary');
  }
  // A hash mangled without hitting that length was always harmless: bytes come
  // back as a string and safeJsonParse turns them into null.
  assert.equal(base64UrlDecode('YWJjZGVm'), 'abcdef');
  assert.equal(safeJsonParse(base64UrlDecode('YWJjZGVm'), null), null);
});

// Product bug, not a test gap: js/app.js does
// `safeJsonParse(base64UrlDecode(m[1]), null)`, and safeJsonParse only catches
// JSON errors. The InvalidCharacterError above escapes boot(), so a share link
// that lost one character replaces the person's own diary with "HeadPain could
// not load its assets". The graceful path is to ignore the unreadable hash and
// carry on to loadFromStorage(). Left unfixed on purpose: js/ is out of scope
// for this pass.
test('a share link truncated in transit still leaves the local diary loadable');

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

test('clamp pins a value into the range, both edges included', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
  // The 0.85..2 window downloadPng clamps its export scale into is not asserted
  // here: repeating the two literals from export.js proves nothing about the
  // export. It is driven through downloadPng itself, further down the file.
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

test('debounce still collapses a burst into one trailing call, arguments and all', async () => {
  // utils.js re-exports it from the vendored DOM kit, and events.js debounces
  // head.onCameraChange with it. A kit resync that made it leading-edge would
  // write the diary on every frame of a drag; one that made it a pass-through
  // would do the same and lose nothing visibly, which is why it is asserted
  // here rather than left to the kit's own repo.
  const seen = [];
  const save = debounce((...args) => seen.push(args), 10);
  save(1); save(2); save(3);
  assert.deepEqual(seen, [], 'debounce fired on the leading edge; every drag frame would reach localStorage');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(seen, [[3]], 'the burst should collapse into one trailing call carrying the last arguments');
});

// $ and $$ have no test: they are one-line delegations to querySelector /
// querySelectorAll, and the shim's document answers null and [] to everything,
// so any assertion here would restate the source against a stub.

// ---------------------------------------------------------------------------
// export.js — share links
// ---------------------------------------------------------------------------

test('buildShareUrl carries the whole map in the hash', () => {
  seedTwoPains();
  const url = buildShareUrl(registry.zoneIndexOf);
  assert.ok(url.startsWith('https://headpain.neorgon.com/'), url);
  assert.ok(url.includes('#m='), 'the map lives in the fragment so it never reaches a server log');

  // Not a length floor. An empty map still encodes to ~94 characters of title
  // and camera, so "the hash is long enough" passes on a link carrying no pains
  // and no points at all. Read the payload instead.
  const payload = JSON.parse(base64UrlDecode(url.split('#m=')[1]));
  assert.equal(payload.t, 'Monday migraine');
  assert.equal(payload.g.length, 2, 'the hash carries no pains; the link opens a blank map');
  assert.equal(payload.m.length, 2, 'the hash carries no points; the link opens a blank map');
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
  // A viewing angle nobody would land on by accident, with more precision than
  // the payload keeps: the recipient must open the map facing the same way.
  setCamera(1.2345678, 0.5, 4.2);
  const url = buildShareUrl(registry.zoneIndexOf);
  const payload = JSON.parse(base64UrlDecode(url.split('#m=')[1]));
  const restored = episodeFromUrlPayload(payload, registry.zoneIdAt);

  assert.equal(restored.title, 'Monday migraine');
  assert.deepEqual(payload.c, [1.235, 0.5, 4.2],
    'the camera is rounded to 3 decimals in the hash; full float precision is ~8 wasted characters per axis');
  assert.deepEqual(restored.camera, { theta: 1.235, phi: 0.5, dist: 4.2 },
    'the shared link opened on a different angle from the one the sender was looking at');
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

  const url = buildShareUrl(registry.zoneIndexOf);
  const payload = JSON.parse(base64UrlDecode(url.split('#m=')[1]));
  assert.equal(URL_MARKER_CAP, 12,
    'the cap is a promise the UI makes (shareWouldTruncate warns against this number); moving it is a deliberate edit');
  assert.equal(payload.m.length, URL_MARKER_CAP);

  // "Unusable" is a length, so measure the length. 2000 is the practical floor
  // among the things that carry these links: old IE stopped at 2083, and chat
  // clients and QR encoders start truncating in the same neighbourhood.
  assert.ok(url.length < 2000, `the capped link is already ${url.length} characters long`);

  // And it is the cap holding it there, not the fixture: 30 more points must
  // not move the URL by a single character.
  for (let i = 0; i < 30; i++) addMarker(marker({ zoneId: 'temple-left', intensity: 5 }));
  assert.equal(buildShareUrl(registry.zoneIndexOf), url, 'points past the cap reached the URL after all');
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

test('exportEpisodeJson carries the impact answers, and writes null rather than an empty form', () => {
  const { ep } = seedTwoPains('Monday migraine');
  const bare = JSON.parse(captureDownload(() => exportEpisodeJson(ep)).text);
  assert.equal(bare.impact, null,
    'an untouched impact form must export as null; a shell of empty arrays reimports as answered');

  updateImpact({ frequency: FREQUENCIES[0].id, blocked: [BLOCKED[0].id], daysLost: 3 });
  const file = JSON.parse(captureDownload(() => exportEpisodeJson(ep)).text);
  assert.equal(file.impact.frequency, 'rare');
  assert.deepEqual(file.impact.blocked, ['work']);
  assert.equal(file.impact.daysLost, 3,
    'the days-lost answer is half of what the file is for; a JSON export that dropped it would look complete');
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
  assert.equal(got.type, 'application/json',
    'the diary must leave as JSON; text/plain opens in a browser tab instead of saving');

  const file = JSON.parse(got.text);
  assert.equal(file.kind, 'headmap-export');
  assert.equal(file.headmapVersion, 2,
    'the diary export must stamp the same schema version as a single-episode file');
  assert.equal(file.episodes.length, 2, 'the diary export must carry every episode, not just the active one');
  assert.deepEqual(file.episodes.map(e => e.title).sort(), ['First map', 'Second map']);
  assert.match(file.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
});

// ---------------------------------------------------------------------------
// export.js — the PNG, which has to carry its own key
// ---------------------------------------------------------------------------

// The legend block for two pains and no impact, at 1x: 54 of header, two rows
// of 34, and 42 of footer for the safety line. An absolute number on purpose.
// Asking legendPngHeight for the expectation only proves downloadPng adds
// whatever legend.js hands it, which stays true when legend.js reserves half
// the room its own rows need: the cropping this test is named for.
const LEGEND_2PAINS = 54 + 2 * 34 + 42;

test('downloadPng grows the canvas by exactly the legend height, so the key is burned in and not cropped', () => {
  const { ep } = seedTwoPains('Monday migraine');
  const model = buildLegend(ep, registry.zoneById);
  // 900 wide makes downloadPng's clamp(w / 900, 0.85, 2) exactly 1, so there is
  // no scale arithmetic between the number above and the canvas below.
  const source = { width: 900, height: 600 };
  assert.equal(legendPngHeight(model, 1, 900), LEGEND_2PAINS,
    'legend.js changed the room it reserves for a two-pain key; the PNG is sized from this number');

  const made = captureCanvases(() => downloadPng(source, model, 'Monday migraine'));
  const out = made.find(c => c.width === 900);
  assert.ok(out, 'downloadPng built no canvas at the source width');
  assert.equal(out.height, source.height + LEGEND_2PAINS,
    'the output is not the source plus the legend; the legend is either cropped or floating on empty space');
  assert.equal(out.width, source.width, 'the legend must not widen the picture');
});

test('downloadPng holds the legend scale inside 0.85..2, so a phone export stays legible and a huge one is not blown up', () => {
  const { ep } = seedTwoPains('Monday migraine');
  const model = buildLegend(ep, registry.zoneById);
  const heightAt = width => {
    const made = captureCanvases(() => downloadPng({ width, height: 600 }, model, 'Monday migraine'));
    return made.find(c => c.width === width).height;
  };
  // Unclamped, 320 wide would scale the legend to 0.36 (six-pixel text) and
  // 4000 wide to 4.4 (a key taller than the head it explains). The expected
  // heights are the 1x block scaled by the two bounds, written out, so widening
  // the window to 0.5..3 cannot pass by agreeing with the source.
  assert.equal(heightAt(320), 600 + Math.round(LEGEND_2PAINS * 0.85),
    'a phone-sized export shrank the legend below the 0.85 floor');
  assert.equal(heightAt(4000), 600 + LEGEND_2PAINS * 2,
    'a wall-sized export blew the legend past the 2x ceiling');
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

test('downloadPng writes a slugified, dated .png and hands the anchor the composited canvas', () => {
  const { ep } = seedTwoPains();
  const model = buildLegend(ep, registry.zoneById);
  downloads.length = 0;

  // captureCanvases gives each canvas a data URL that names its size and how
  // many draw calls it took: `/^data:image\/png/` alone matches a blank canvas
  // nobody ever drew on, which is what the shim hands back by default.
  captureCanvases(() => downloadPng({ width: 900, height: 600 }, model, 'Monday Migraine!'));
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].download, `headpain-monday-migraine-${today()}.png`);

  const seen = downloads[0].href.match(/^data:image\/png;base64,(\d+)x(\d+)\/(\d+)$/);
  assert.ok(seen, `the anchor href did not come from a canvas this test built: ${downloads[0].href}`);
  assert.deepEqual([Number(seen[1]), Number(seen[2])], [900, 600 + LEGEND_2PAINS],
    'the anchor points at some other canvas than the composited output; the saved file is the wrong picture');
  assert.ok(Number(seen[3]) > 0, 'the canvas behind the href was never drawn on: the .png saves blank');
});

test('the burned-in legend carries the impact sentences the person wrote, not just the swatches', () => {
  const { ep } = seedTwoPains('Monday migraine');
  updateImpact({ frequency: FREQUENCIES[0].id, daysLost: 3 });
  const model = buildLegend(ep, registry.zoneById);
  assert.ok(model.impact.length, 'impact was set but produced no sentences');

  const source = { width: 900, height: 600 };
  const withImpact = legendPngHeight(model, 1, 900);
  assert.ok(withImpact > LEGEND_2PAINS, 'impact sentences reserved no extra height at all');

  const made = captureCanvases(() => downloadPng(source, model, 'Monday migraine'));
  const out = made.find(c => c.width === 900);
  assert.equal(out.height, source.height + withImpact);
  const text = out._ctx.text().join(' ');
  assert.ok(/cost me about 3 days/.test(text), `the days-lost sentence never reached the PNG: ${text}`);

  // Reserving the height is not the same as drawing inside it. This is the only
  // test that sees the composed canvas, so it is the only place that can check
  // the two against each other: a sentence painted below out.height is simply
  // absent from the file the person sends their doctor, and every earlier
  // assertion here would still pass.
  const ys = out._ctx.calls.filter(c => c.op === 'fillText').map(c => c.args[2]);
  assert.ok(ys.length >= model.impact.length + 2, `only ${ys.length} lines of text were painted`);
  assert.ok(Math.max(...ys) < out.height,
    `text was painted at y=${Math.max(...ys)} on a canvas ${out.height} tall: it falls off the bottom of the PNG`);
  assert.ok(Math.min(...ys) >= source.height,
    `text was painted at y=${Math.min(...ys)}, above the legend strip at y=${source.height}: it lands on the head`);
});
