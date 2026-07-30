// Central wiring — user actions, head callbacks, tabs, toolbar, keyboard.

import {
  state, activeEpisode, absorbShared, saveToStorage,
  addMarker, updateMarker, removeMarker, clearMarkers, selectMarker,
  createEpisode, loadEpisode, deleteEpisode, renameEpisode, replaceMarkers,
  setView, setCamera, importJson
} from './state.js';
import { CONDITIONS, presetMarkers } from './conditions.js';
import { renderAll } from './render.js';
import { renderZoneBrowser } from './editor.js';
import { renderRedFlags, renderLibrary } from './panel-conditions.js';
import { exportEpisodeJson, exportAllJson, buildShareUrl, downloadPng } from './export.js';
import { $, debounce, safeJsonParse } from './utils.js';

const WHOLE_HEAD_SPOT = { p: [0, 0.2, 0.95], n: [0, 0, 1] };

export function initApp(ctx) {
  const { head, registry } = ctx;
  ctx.ui = { hoverZoneId: null };
  ctx.els = {
    editor: $('#editor'), points: $('#points'), pointsCount: $('#points-count'),
    zones: $('#zones'), matches: $('#matches'), redflags: $('#redflags'),
    library: $('#library'), episodes: $('#episodes'),
    stage: $('#stage'), stageLoader: $('#stage-loader'), stageFallback: $('#stage-fallback'),
    tooltip: $('#zone-tooltip'), stageHint: $('#stage-hint'),
    btnXray: $('#btn-xray'), btnResetView: $('#btn-reset-view'), btnPng: $('#btn-png'),
    btnClear: $('#btn-clear-points'), toast: $('#toast'), importFile: $('#import-file')
  };
  const els = ctx.els;

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }
  ctx.toast = toast;

  function mutate(fn) {
    absorbShared();
    fn();
    saveToStorage();
    renderAll(ctx);
  }

  // ── Actions (used by every panel) ─────────────────────────────────────────
  ctx.actions = {
    renderAll: () => renderAll(ctx),

    selectPoint(id) {
      selectMarker(id);
      renderAll(ctx);
    },

    updateSelected(patch, opts = {}) {
      if (!state.selectedMarkerId) return;
      absorbShared();
      updateMarker(state.selectedMarkerId, patch);
      saveToStorage();
      if (opts.render === false) {
        if (!opts.skipHead) {
          const ep = activeEpisode();
          head.sync(ep.markers, state.selectedMarkerId, ctx.ui.hoverZoneId);
        }
      } else {
        renderAll(ctx);
      }
    },

    deletePoint(id) {
      mutate(() => removeMarker(id));
    },

    clearPoints() {
      const ep = activeEpisode();
      if (!ep.markers.length) return;
      if (!confirm(`Remove all ${ep.markers.length} points from "${ep.title}"?`)) return;
      mutate(() => clearMarkers());
      toast('Points cleared');
    },

    addPointForZone(zoneId) {
      const zone = registry.zoneById(zoneId);
      if (!zone) return;
      const spot = zone.virtual ? WHOLE_HEAD_SPOT : { p: [...zone.anchor], n: [...zone.normal] };
      mutate(() => addMarker({
        zoneId, p: spot.p, n: spot.n,
        intensity: 5, spread: zone.virtual ? 'diffuse' : 'regional'
      }));
      toast(`${zone.label} — point added`);
    },

    pickOnHead(hit) {
      mutate(() => addMarker({ zoneId: hit.zone.id, p: hit.p, n: hit.n }));
    },

    applyPreset(conditionId) {
      const condition = CONDITIONS.find(c => c.id === conditionId);
      if (!condition || condition.notMappable) return;
      const markers = [];
      for (const m of presetMarkers(condition)) {
        const zone = registry.zoneById(m.zoneId);
        if (!zone) continue; // zone not on this model — skip rather than misplace
        const spot = zone.virtual || !zone.anchor ? WHOLE_HEAD_SPOT : { p: [...zone.anchor], n: [...zone.normal] };
        markers.push({ ...m, p: spot.p, n: spot.n });
      }
      mutate(() => replaceMarkers(markers));
      ctx.actions.setTab('map');
      toast(`Loaded ${markers.length} starting points — now adjust them to YOUR pain`);
    },

    newEpisode() {
      mutate(() => createEpisode());
      toast('New episode started');
    },

    loadEpisode(id) {
      if (!loadEpisodeState(id)) return;
      absorbShared();
      saveToStorage();
      const ep = activeEpisode();
      head.setCamera(ep.camera.theta, ep.camera.phi, ep.camera.dist);
      renderAll(ctx);
    },

    deleteEpisode(id) {
      const ep = state.episodes.find(e => e.id === id);
      if (!ep || !confirm(`Delete "${ep.title}" and its ${ep.markers.length} points?`)) return;
      mutate(() => deleteEpisode(id));
    },

    renameEpisode(id, title) {
      mutate(() => renameEpisode(id, title));
    },

    exportEpisode() { exportEpisodeJson(activeEpisode()); },
    exportAll() { exportAllJson(); },

    copyShareLink() {
      const url = buildShareUrl(registry.zoneIndexOf);
      if (!url) return;
      navigator.clipboard.writeText(url)
        .then(() => toast('Share link copied — the map travels inside the URL'))
        .catch(() => toast('Could not reach the clipboard'));
    },

    pickImportFile() { els.importFile.click(); },

    importFile(file) {
      file.text().then(text => {
        const payload = safeJsonParse(text, null);
        const count = payload ? importJson(payload) : 0;
        if (!count) { toast('No HeadMap episodes found in that file'); return; }
        absorbShared();
        saveToStorage();
        renderAll(ctx);
        toast(`Imported ${count} episode${count === 1 ? '' : 's'}`);
      });
    },

    toggleXray() {
      const on = state.view !== 'xray';
      absorbShared();
      setView(on ? 'xray' : 'normal');
      saveToStorage();
      head.setXray(on);
      els.btnXray.setAttribute('aria-pressed', String(on));
    },

    resetView() { head.resetView(); },

    snapshot() {
      const dataUrl = head.snapshot();
      if (!dataUrl) { toast('3D view unavailable'); return; }
      downloadPng(dataUrl, activeEpisode().title);
    },

    setTab(name) {
      for (const tab of ['map', 'conditions', 'episodes']) {
        const active = tab === name;
        $(`#tab-${tab}`).classList.toggle('active', active);
        $(`#tab-${tab}`).setAttribute('aria-selected', String(active));
        $(`#panel-${tab}`).classList.toggle('active', active);
      }
    }
  };

  // loadEpisode imported from state clashes with the action name — alias it.
  function loadEpisodeState(id) { return loadEpisode(id); }

  // ── Head callbacks ────────────────────────────────────────────────────────
  head.onPick = hit => ctx.actions.pickOnHead(hit);

  head.onHoverZone = (zoneId, zone) => {
    ctx.ui.hoverZoneId = zoneId;
    head.setHoverZone(zoneId);
    els.tooltip.textContent = zone?.label || '';
    els.tooltip.hidden = !zone;
  };

  head.onCameraChange = debounce((theta, phi, dist) => {
    setCamera(theta, phi, dist);
    saveToStorage();
  }, 400);

  els.stage.addEventListener('pointermove', e => {
    if (els.tooltip.hidden) return;
    const rect = els.stage.getBoundingClientRect();
    els.tooltip.style.left = `${e.clientX - rect.left}px`;
    els.tooltip.style.top = `${e.clientY - rect.top}px`;
  });

  // ── Toolbar / static controls ─────────────────────────────────────────────
  els.btnXray.addEventListener('click', () => ctx.actions.toggleXray());
  els.btnResetView.addEventListener('click', () => ctx.actions.resetView());
  els.btnPng.addEventListener('click', () => ctx.actions.snapshot());
  els.btnClear.addEventListener('click', () => ctx.actions.clearPoints());

  for (const tab of ['map', 'conditions', 'episodes']) {
    $(`#tab-${tab}`).addEventListener('click', () => ctx.actions.setTab(tab));
  }

  els.importFile.addEventListener('change', () => {
    const file = els.importFile.files[0];
    els.importFile.value = '';
    if (file) ctx.actions.importFile(file);
  });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    switch (e.key.toLowerCase()) {
      case 'x': ctx.actions.toggleXray(); break;
      case 'r': ctx.actions.resetView(); break;
      case 'escape': ctx.actions.selectPoint(null); break;
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  if (!head.supported) {
    els.stageLoader.hidden = true;
    els.stageFallback.hidden = false;
  } else {
    head.ready
      .then(() => {
        els.stageLoader.hidden = true;
        const ep = activeEpisode();
        head.setCamera(ep.camera.theta, ep.camera.phi, ep.camera.dist);
        if (state.view === 'xray') head.setXray(true);
        renderAll(ctx);
      })
      .catch(err => {
        els.stageLoader.hidden = true;
        els.stageFallback.hidden = false;
        console.error('HeadMap 3D failed:', err);
      });
  }

  els.btnXray.setAttribute('aria-pressed', String(state.view === 'xray'));
  renderZoneBrowser(els.zones, ctx);
  renderRedFlags(els.redflags);
  renderLibrary(els.library, ctx);
  renderAll(ctx);
}
