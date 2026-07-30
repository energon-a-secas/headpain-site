// HeadMap entry point — load the zone registry, restore state, wire the app.

import { loadRegistry } from './registry.js';
import { createHead3D } from './head3d.js';
import { state, loadFromStorage, loadFromUrlPayload } from './state.js';
import { initApp } from './events.js';
import { $, base64UrlDecode, safeJsonParse } from './utils.js';

async function boot() {
  const registry = await loadRegistry();

  // State: shared link wins, then localStorage, then a fresh diary.
  let restored = false;
  const m = location.hash.match(/m=([A-Za-z0-9_-]+)/);
  if (m) {
    const payload = safeJsonParse(base64UrlDecode(m[1]), null);
    if (payload) restored = loadFromUrlPayload(payload, registry.zoneIdAt);
  }
  if (!restored) loadFromStorage();

  const head = createHead3D($('#stage'), registry);
  initApp({ state, registry, head });
  window.__headmap = { state, registry, head }; // test/debug handle
}

boot().catch(err => {
  console.error('HeadMap failed to start:', err);
  const loader = $('#stage-loader');
  if (loader) loader.innerHTML = '<span>HeadMap could not load its assets. Check the console.</span>';
});
