// HeadPain entry point — load the zone registry, restore state, wire the app.

import { loadRegistry } from './registry.js';
import { createHead3D } from './head3d.js';
import { state } from './state.js';
import { loadFromStorage, loadFromUrlPayload } from './persist.js';
import { initApp } from './events.js';
import { $, base64UrlDecode, safeJsonParse } from './utils.js';

async function boot() {
  const registry = await loadRegistry();

  // State: shared link wins, then localStorage, then a fresh diary.
  let restored = false;
  const m = location.hash.match(/m=([A-Za-z0-9_-]+)/);
  if (m) {
    const payload = safeJsonParse(base64UrlDecode(m[1]), null);
    if (payload) restored = loadFromUrlPayload(payload, registry);
  }
  if (!restored) loadFromStorage(registry);

  const head = createHead3D($('#stage'), registry);
  const ctx = { state, registry, head };
  initApp(ctx);
  window.__headmap = ctx; // test/debug handle: also carries els and actions
}

boot().catch(err => {
  console.error('HeadPain failed to start:', err);
  const loader = $('#stage-loader');
  if (loader) {
    loader.innerHTML = '<strong>The pain map could not load.</strong><span>Check your connection and try again.</span><button type="button" class="btn btn--secondary">Try again</button>';
    loader.style.pointerEvents = 'auto';
    loader.querySelector('button').addEventListener('click', () => location.reload());
  }
});
