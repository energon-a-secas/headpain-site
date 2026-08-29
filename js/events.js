// Central wiring — user actions, head callbacks, tabs, toolbar, keyboard.

import {
  state, activeEpisode, absorbShared, saveToStorage,
  addMarker, updateMarker, removeMarker, clearMarkers, selectMarker,
  createEpisode, loadEpisode, deleteEpisode, renameEpisode, replaceMarkers,
  addGroup, renameGroup, setGroupColor, removeGroup, clearGroups, setActiveGroup,
  setView, setCamera, importJson
} from './state.js';
import { CONDITIONS, presetMarkers } from './conditions.js';
import { DEMOS } from './demos.js';
import { cycleColor } from './groups.js';
import { renderAll } from './render.js';
import { renderZoneBrowser } from './editor.js';
import { renderRedFlags, renderLibrary } from './panel-conditions.js';
import { renderDemos } from './panel-demos.js';
import { exportEpisodeJson, exportAllJson, buildShareUrl, downloadPng } from './export.js';
import { $, debounce, safeJsonParse } from './utils.js';

const WHOLE_HEAD_SPOT = { p: [0, 0.2, 0.95], n: [0, 0, 1] };
const TABS = ['map', 'conditions', 'demos', 'episodes'];

export function initApp(ctx) {
  const { head, registry } = ctx;
  ctx.ui = { hoverZoneId: null };
  ctx.els = {
    editor: $('#editor'), groups: $('#groups'), groupsCount: $('#groups-count'),
    points: $('#points'), pointsCount: $('#points-count'),
    zones: $('#zones'), matches: $('#matches'), redflags: $('#redflags'),
    library: $('#library'), demos: $('#demos'), episodes: $('#episodes'),
    stage: $('#stage'), stageLoader: $('#stage-loader'), stageFallback: $('#stage-fallback'),
    tooltip: $('#zone-tooltip'), stageHint: $('#stage-hint'),
    btnXray: $('#btn-xray'), btnResetView: $('#btn-reset-view'), btnPng: $('#btn-png'),
    btnClear: $('#btn-clear-points'), btnNewGroup: $('#btn-new-group'),
    toast: $('#toast'), importFile: $('#import-file')
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

  // Resolve zone-based partial markers to 3D spots on this model.
  function materializeSpots(list) {
    const out = [];
    for (const m of list || []) {
      const zone = registry.zoneById(m.zoneId);
      if (!zone) continue; // zone not on this model — skip rather than misplace
      const spot = zone.virtual || !zone.anchor ? WHOLE_HEAD_SPOT : { p: [...zone.anchor], n: [...zone.normal] };
      out.push({ ...m, p: spot.p, n: spot.n });
    }
    return out;
  }

  const shortName = name => name.split(/ [—(]/)[0];

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
          head.sync(ep.markers, state.selectedMarkerId, ctx.ui.hoverZoneId, ep.groups, state.activeGroupId);
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
      toast(`${zone.label}: point added`);
    },

    pickOnHead(hit) {
      mutate(() => addMarker({ zoneId: hit.zone.id, p: hit.p, n: hit.n }));
    },

    // ── Groups ──────────────────────────────────────────────────────────────
    newGroup() {
      let g;
      mutate(() => {
        g = addGroup({});
        setActiveGroup(g.id);
      });
      toast(`“${g.name}” created: new points join it while it's focused`);
    },

    toggleGroupFocus(id) {
      setActiveGroup(state.activeGroupId === id ? null : id);
      renderAll(ctx);
    },

    renameGroup(id, name) {
      mutate(() => renameGroup(id, name));
    },

    cycleGroupColor(id) {
      const g = activeEpisode()?.groups.find(g => g.id === id);
      if (!g) return;
      mutate(() => setGroupColor(id, cycleColor(g.color)));
    },

    deleteGroup(id) {
      const ep = activeEpisode();
      const g = ep?.groups.find(g => g.id === id);
      if (!g) return;
      const count = ep.markers.filter(m => m.groupId === id).length;
      if (count && !confirm(`Delete group "${g.name}"? Its ${count} point${count === 1 ? '' : 's'} stay on the map, ungrouped.`)) return;
      mutate(() => removeGroup(id));
      toast('Group deleted: points kept');
    },

    applyPreset(conditionId) {
      const condition = CONDITIONS.find(c => c.id === conditionId);
      if (!condition || condition.notMappable) return;
      const markers = materializeSpots(presetMarkers(condition));
      mutate(() => {
        clearGroups();
        replaceMarkers(markers);
      });
      ctx.actions.setTab('map');
      toast(`Loaded ${markers.length} starting points: now adjust them to YOUR pain`);
    },

    applyPresetAsGroup(conditionId) {
      const condition = CONDITIONS.find(c => c.id === conditionId);
      if (!condition || condition.notMappable) return;
      const spots = materializeSpots(presetMarkers(condition));
      if (!spots.length) return;
      let g;
      mutate(() => {
        g = addGroup({ name: shortName(condition.name), conditionId: condition.id });
        for (const m of spots) addMarker({ ...m, groupId: g.id });
        state.selectedMarkerId = null;
        setActiveGroup(g.id);
      });
      ctx.actions.setTab('map');
      toast(`“${g.name}” group added: ${spots.length} points; now adjust them to YOUR pain`);
    },

    loadDemo(demoId) {
      const demo = DEMOS.find(d => d.id === demoId);
      if (!demo) return;
      mutate(() => {
        const ep = createEpisode(demo.title);
        for (const gd of demo.groups) {
          const g = addGroup({ name: gd.name, color: gd.color, conditionId: gd.conditionId || null });
          const condition = gd.conditionId ? CONDITIONS.find(c => c.id === gd.conditionId) : null;
          const spots = materializeSpots(condition ? presetMarkers(condition) : gd.markers);
          for (const m of spots) addMarker({ ...m, groupId: g.id });
        }
        state.selectedMarkerId = null;
        setActiveGroup(ep.groups[0]?.id || null);
      });
      ctx.actions.setTab('map');
      toast('Demo loaded as a new episode: click a group to focus it');
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
        .then(() => toast('Share link copied: the map travels inside the URL'))
        .catch(() => toast('Could not reach the clipboard'));
    },

    pickImportFile() { els.importFile.click(); },

    importFile(file) {
      file.text().then(text => {
        const payload = safeJsonParse(text, null);
        const count = payload ? importJson(payload) : 0;
        if (!count) { toast('No HeadPain episodes found in that file'); return; }
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
      for (const tab of TABS) {
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
  els.btnNewGroup.addEventListener('click', () => ctx.actions.newGroup());

  for (const tab of TABS) {
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
        console.error('HeadPain 3D failed:', err);
      });
  }

  els.btnXray.setAttribute('aria-pressed', String(state.view === 'xray'));
  renderZoneBrowser(els.zones, ctx);
  renderRedFlags(els.redflags);
  renderLibrary(els.library, ctx);
  renderDemos(els.demos, ctx);
  renderAll(ctx);
}
