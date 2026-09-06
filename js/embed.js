// The embeddable view.
//
// Same scene, same legend, same pattern vocabulary as the app, in a shell with
// no editor and no diary. It is deliberately *stateless*: an embed never reads
// localStorage, so a HeadPain widget on somebody else's page cannot render the
// visitor's own private headache diary. Everything it shows arrives in the URL
// or through postMessage.
//
// Contract (see embed-builder.html for a form that writes it):
//
//   map=<payload>       a share-link payload (the part after #m= in a HeadPain link)
//   preset=<id>         a condition from the library, e.g. preset=cluster-headache
//   demo=<id>           a demo map, e.g. demo=demo-combo
//   xray=1              start with the skin translucent
//   isolate=<name|n>    show one pain alone, by name or by 0-based index
//   legend=off|compact  legend detail (default: compact; `full` adds the prose)
//   controls=none|view  which buttons the visitor gets (default: view)
//   rotate=auto         slowly turn the head
//   spin=<seconds>      seconds per revolution when rotate=auto (default 24)
//   camera=t,p,d        starting angle: theta, phi, distance
//   title=<text>        caption override; title=off hides it
//   bg=<hex>            page background, to blend with the host (e.g. bg=0b1120)
//
// Host page → embed:  frame.contentWindow.postMessage({ type: 'headpain:xray', on: true }, '*')
// Embed → host page:  window.addEventListener('message', e => e.data.source === 'headpain' && ...)

import { loadRegistry } from './registry.js';
import { createHead3D } from './head3d.js';
import { episodeFromUrlPayload } from './persist.js';
import { episodeFromCondition, episodeFromDemo } from './presets.js';
import { buildLegend, legendHtml } from './legend.js';
import { $, base64UrlDecode, safeJsonParse, escHtml } from './utils.js';

const params = new URLSearchParams(location.search);
const flag = (name, fallback = null) => params.get(name) ?? fallback;
const on = name => ['1', 'true', 'on', 'yes'].includes(String(params.get(name)).toLowerCase());

const view = {
  episode: null,
  isolateId: null,
  xray: on('xray'),
  rotate: flag('rotate') === 'auto',
  spin: Math.max(4, Number(flag('spin', 24)) || 24),
  legend: flag('legend', 'compact'),
  controls: flag('controls', 'view')
};

function post(type, detail = {}) {
  // The host chose to embed this, so it is told what happens inside. Sent to
  // '*' because the embed cannot know its parent's origin; nothing sensitive
  // travels in these events, only what the host already put in the URL.
  parent?.postMessage({ source: 'headpain', type, ...detail }, '*');
}

function episodeFromParams(registry) {
  const raw = flag('map') || (location.hash.match(/m=([A-Za-z0-9_-]+)/) || [])[1];
  if (raw) {
    const payload = safeJsonParse(base64UrlDecode(raw), null);
    const ep = payload && episodeFromUrlPayload(payload, registry.zoneIdAt);
    if (ep) return ep;
  }
  if (flag('demo')) return episodeFromDemo(flag('demo'), registry);
  if (flag('preset')) return episodeFromCondition(flag('preset'), registry);
  return null;
}

function resolveIsolate(ep, raw) {
  if (!raw || !ep) return null;
  const byIndex = ep.groups[Number(raw)];
  if (/^\d+$/.test(raw) && byIndex) return byIndex.id;
  const needle = raw.toLowerCase();
  return ep.groups.find(g => g.name.toLowerCase() === needle)?.id
    || ep.groups.find(g => g.name.toLowerCase().includes(needle))?.id
    || null;
}

function fail(message) {
  $('#embed-loader').innerHTML = `<p class="embed-error">${escHtml(message)}</p>`;
  $('#embed-loader').hidden = false;
  // Controls that steer a head there is no head to steer are worse than none.
  $('#embed-controls').hidden = true;
  post('error', { message });
}

async function boot() {
  const registry = await loadRegistry();
  const ep = episodeFromParams(registry);
  if (!ep) {
    fail('Nothing to show. Pass map=, preset= or demo= in the embed URL.');
    return;
  }
  view.episode = ep;
  view.isolateId = resolveIsolate(ep, flag('isolate'));

  const bg = flag('bg');
  const bgHex = bg && /^#?[0-9a-f]{6}$/i.test(bg) ? (bg.startsWith('#') ? bg : `#${bg}`) : null;
  if (bgHex) document.body.style.background = bgHex;

  const caption = flag('title', ep.title);
  const captionEl = $('#embed-caption');
  if (caption && caption !== 'off') captionEl.textContent = caption;
  else captionEl.hidden = true;

  const head = createHead3D($('#embed-stage'), registry);
  if (!head.supported) { fail('This browser cannot show the 3D head.'); return; }
  if (bgHex) head.setBackground(bgHex);

  const model = buildLegend(ep, registry.zoneById);

  function paint() {
    head.sync(ep.markers, null, null, ep.groups, view.isolateId);
    if (view.legend !== 'off') {
      $('#embed-legend').innerHTML = legendHtml(model, {
        verbose: view.legend === 'full',
        isolateId: view.isolateId
      });
    }
    const btn = $('#embed-xray');
    if (btn) btn.setAttribute('aria-pressed', String(view.xray));
    post('state', { xray: view.xray, isolate: isolateName(), pains: model.pains.map(p => p.name) });
  }

  const isolateName = () => ep.groups.find(g => g.id === view.isolateId)?.name || null;

  function setXray(next) {
    view.xray = Boolean(next);
    head.setXray(view.xray);
    paint();
  }

  function setIsolate(raw) {
    view.isolateId = raw == null ? null : resolveIsolate(ep, String(raw));
    paint();
  }

  await head.ready;
  $('#embed-loader').hidden = true;

  const cam = (flag('camera') || '').split(',').map(Number);
  if (cam.length === 3 && cam.every(Number.isFinite)) head.setCamera(cam[0], cam[1], cam[2]);
  else head.setCamera(ep.camera?.theta ?? 0, ep.camera?.phi ?? Math.PI / 2, ep.camera?.dist ?? 4.9);
  if (view.xray) head.setXray(true);
  paint();

  // ── Controls the visitor gets ─────────────────────────────────────────────
  if (view.controls === 'none') $('#embed-controls').hidden = true;
  else {
    $('#embed-xray').addEventListener('click', () => setXray(!view.xray));
    $('#embed-reset').addEventListener('click', () => head.resetView());
    const pains = $('#embed-pains');
    if (ep.groups.length > 1) {
      pains.innerHTML = ep.groups.map(g =>
        `<button type="button" class="embed-pain" data-pain="${g.id}">${escHtml(g.name)}</button>`).join('');
      pains.addEventListener('click', e => {
        const btn = e.target.closest('[data-pain]');
        if (!btn) return;
        const id = btn.dataset.pain;
        setIsolate(view.isolateId === id ? null : id);
        post('pain', { id, name: ep.groups.find(g => g.id === id)?.name || null });
      });
    } else {
      pains.hidden = true;
    }
  }

  head.onHoverZone = (zoneId, zone) => {
    head.setHoverZone(zoneId);
    if (zone) post('zone', { zoneId, label: zone.label });
  };

  // Auto-rotation, for a page that wants the head turning while someone reads.
  // Stops the moment the visitor touches it, and honours reduced motion.
  const stillOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (view.rotate && stillOk) {
    let theta = cam.length === 3 ? cam[0] : 0;
    const phi = cam.length === 3 ? cam[1] : Math.PI / 2;
    const dist = cam.length === 3 ? cam[2] : 4.9;
    let stopped = false;
    const stop = () => { stopped = true; };
    $('#embed-stage').addEventListener('pointerdown', stop, { once: true });
    $('#embed-stage').addEventListener('wheel', stop, { once: true, passive: true });
    let last = performance.now();
    const step = now => {
      if (stopped) return;
      theta += ((now - last) / 1000) * (Math.PI * 2 / view.spin);
      last = now;
      head.setCamera(theta, phi, dist);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Host page → embed ─────────────────────────────────────────────────────
  // A fixed command set, matched by name. Nothing here evaluates host input or
  // reaches outside the scene.
  window.addEventListener('message', e => {
    const msg = e.data;
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('headpain:')) return;
    switch (msg.type.slice(9)) {
      case 'xray': setXray(msg.on); break;
      case 'isolate': setIsolate(msg.pain ?? null); break;
      case 'camera':
        if (Array.isArray(msg.camera)) head.setCamera(...msg.camera.map(Number));
        break;
      case 'reset': head.resetView(); break;
      case 'state': post('state', { xray: view.xray, isolate: isolateName(), pains: model.pains.map(p => p.name) }); break;
    }
  });

  post('ready', { title: ep.title, pains: model.pains.map(p => p.name), points: ep.markers.length });
}

boot().catch(err => {
  console.error('HeadPain embed failed:', err);
  fail('HeadPain could not load its assets.');
});
