// Central wiring — user actions, head callbacks, tabs, toolbar, keyboard.

import {
  state, activeEpisode, ORPHAN_PAIN_NAME,
  addMarker, updateMarker, removeMarker, clearMarkers, selectMarker,
  createEpisode, loadEpisode, deleteEpisode, renameEpisode,
  addGroup, renameGroup, setGroupStyle, removeGroup, resetMap, setActiveGroup,
  setIsolateGroup, isolatedGroup, ensureActivePain,
  setView, setExplain, setCamera, updateImpact, toggleImpactOption
} from './state.js';
import {
  absorbShared, saveToStorage, importJson, loadLearnEpisode,
  shareWouldTruncate, URL_MARKER_CAP
} from './persist.js';
import { CONDITIONS, presetMarkers } from './conditions.js';
import { DEMOS } from './demos.js';
import { WHOLE_HEAD_SPOT, materializeSpots as spotsFor, shortName,
  episodeFromCondition, episodeFromDemo } from './presets.js';
import { renderAll } from './render.js';
import { renderZoneBrowser } from './editor.js';
import { startRename, closeStylePopover } from './painbar.js';
import { renderRedFlags, renderLibrary } from './panel-conditions.js';
import { renderDemos } from './panel-demos.js';
import { exportEpisodeJson, exportAllJson, buildShareUrl, downloadPng } from './export.js';
import { buildLegend } from './legend.js';
import { $, debounce, safeJsonParse } from './utils.js';

const TABS = ['map', 'impact', 'conditions', 'episodes'];

export function initApp(ctx) {
  const { head, registry } = ctx;
  ctx.ui = { hoverZoneId: null };
  ctx.els = {
    editor: $('#editor'), points: $('#points'), pointsCount: $('#points-count'),
    zones: $('#zones'), matches: $('#matches'), redflags: $('#redflags'),
    library: $('#library'), demos: $('#demos'), episodes: $('#episodes'),
    impact: $('#impact'),
    stage: $('#stage'), stageLoader: $('#stage-loader'), stageFallback: $('#stage-fallback'),
    tooltip: $('#zone-tooltip'), stageHint: $('#stage-hint'), painBar: $('#pain-bar'),
    explain: $('#explain-panel'), stageLegend: $('#stage-legend'), btnExplain: $('#btn-explain'),
    btnXray: $('#btn-xray'), btnResetView: $('#btn-reset-view'), btnPng: $('#btn-png'),
    btnIsolate: $('#btn-isolate'), btnClear: $('#btn-clear-points'),
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

  const materializeSpots = list => spotsFor(list, registry);

  // A map with no pain yet gets one on the first tap, rather than making
  // someone visit a "new group" button before they can say where it hurts.
  function ensurePainForPlacement() {
    const id = ensureActivePain();
    if (id) return id;
    const g = addGroup({ name: ORPHAN_PAIN_NAME });
    setActiveGroup(g.id);
    return g.id;
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
          head.sync(ep.markers, state.selectedMarkerId, ctx.ui.hoverZoneId, ep.groups, state.isolateGroupId);
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
      mutate(() => {
        ensurePainForPlacement();
        addMarker({
          zoneId, p: spot.p, n: spot.n,
          intensity: 5, spread: zone.virtual ? 'diffuse' : 'regional'
        });
      });
      toast(`${zone.label}: point added`);
    },

    pickOnHead(hit) {
      const firstPain = !activeEpisode()?.groups.length;
      mutate(() => {
        ensurePainForPlacement();
        addMarker({ zoneId: hit.zone.id, p: hit.p, n: hit.n });
      });
      if (firstPain) toast(`Started “${ORPHAN_PAIN_NAME}”: click its name above the head to rename it`);
    },

    // ── Pains ───────────────────────────────────────────────────────────────
    newPain() {
      let g;
      mutate(() => {
        g = addGroup({});
        setActiveGroup(g.id);
      });
      // Straight into the name field: naming is the whole point of a new pain.
      startRename(els.painBar, g.id, ctx);
    },

    setActivePain(id) {
      closeStylePopover();
      setActiveGroup(id);
      renderAll(ctx);
    },

    renamePain(id, name) {
      mutate(() => renameGroup(id, name));
    },

    setPainStyle(id, patch) {
      mutate(() => setGroupStyle(id, patch));
    },

    deletePain(id) {
      const ep = activeEpisode();
      const g = ep?.groups.find(g => g.id === id);
      if (!g) return;
      const count = ep.markers.filter(m => m.groupId === id).length;
      if (count && !confirm(`Delete “${g.name}” and its ${count} point${count === 1 ? '' : 's'}?`)) return;
      closeStylePopover();
      mutate(() => removeGroup(id));
      toast(count ? `“${g.name}” deleted with its ${count} point${count === 1 ? '' : 's'}` : `“${g.name}” deleted`);
    },

    // Isolation is a viewing choice and stays separate from which pain new
    // points join, so looking at one pain never redirects the next tap.
    toggleIsolate() {
      const ep = activeEpisode();
      if (!ep || ep.groups.length < 2) return;
      setIsolateGroup(state.isolateGroupId ? null : state.activeGroupId);
      renderAll(ctx);
      const iso = isolatedGroup();
      toast(iso ? `Showing “${iso.name}” alone` : 'Showing every pain');
    },

    isolatePain(id) {
      setIsolateGroup(state.isolateGroupId === id ? null : id);
      renderAll(ctx);
    },

    // Open a published pattern on the head, read-only, with its explanation.
    // Used by ?learn= and by the library's own "Show me on the head".
    learn(id) {
      const ep = episodeFromCondition(id, registry) || episodeFromDemo(id, registry);
      if (!ep) { toast('No pattern with that name'); return; }
      loadLearnEpisode(ep);
      setExplain(true);
      renderAll(ctx);
      head.resize();
      head.setCamera(ep.camera?.theta ?? 0, ep.camera?.phi ?? Math.PI / 2, ep.camera?.dist ?? 4.9);
      toast('Reading a published pattern. Your own maps are untouched.');
    },

    toggleExplain() {
      setExplain(!state.explain);
      if (state.explain) selectMarker(null);
      renderAll(ctx);
      head.resize(); // the stage widens when the editor panel leaves
    },

    applyPreset(conditionId) {
      const condition = CONDITIONS.find(c => c.id === conditionId);
      if (!condition || condition.notMappable) return;
      const spots = materializeSpots(presetMarkers(condition));
      let g;
      mutate(() => {
        resetMap();
        g = addGroup({ name: shortName(condition.name), conditionId: condition.id });
        setActiveGroup(g.id);
        for (const m of spots) addMarker({ ...m, groupId: g.id });
        state.selectedMarkerId = null;
      });
      ctx.actions.setTab('map');
      toast(`Loaded ${spots.length} starting points: now adjust them to YOUR pain`);
    },

    addPatternAsPain(conditionId) {
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
      toast(`“${g.name}” added as a pain: ${spots.length} points; now adjust them to YOUR pain`);
    },

    loadDemo(demoId) {
      const demo = DEMOS.find(d => d.id === demoId);
      if (!demo) return;
      mutate(() => {
        const ep = createEpisode(demo.title);
        for (const gd of demo.groups) {
          const g = addGroup({ name: gd.name, color: gd.color, pattern: gd.pattern, conditionId: gd.conditionId || null });
          const condition = gd.conditionId ? CONDITIONS.find(c => c.id === gd.conditionId) : null;
          const spots = materializeSpots(condition ? presetMarkers(condition) : gd.markers);
          for (const m of spots) addMarker({ ...m, groupId: g.id });
        }
        state.selectedMarkerId = null;
        setActiveGroup(ep.groups[0]?.id || null);
      });
      ctx.actions.setTab('map');
      toast('Demo loaded as a new episode: click a pain above the head to work on it');
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

    setImpact(patch) {
      mutate(() => updateImpact(patch));
    },

    toggleImpact(key, id) {
      mutate(() => toggleImpactOption(key, id));
    },

    exportEpisode() { exportEpisodeJson(activeEpisode()); },
    exportAll() { exportAllJson(); },

    copyShareLink(opts = {}) {
      let url;
      try {
        url = buildShareUrl(registry.zoneIndexOf, opts);
      } catch (err) {
        console.error('HeadPain share link failed:', err);
        toast('Could not build a share link. Export JSON instead.');
        return;
      }
      if (!url) return;
      // A link holds a fixed number of points; saying so beats handing someone
      // a URL that quietly dropped half the map.
      const dropped = shareWouldTruncate();
      const what = opts.explain ? 'Explain link copied' : 'Share link copied';
      navigator.clipboard.writeText(url)
        .then(() => toast(dropped
          ? `${what}, but it carries only the first ${URL_MARKER_CAP} points (${dropped} left out). Export JSON for the full map.`
          : opts.explain
            ? 'Explain link copied: it opens as a read-only page with the legend'
            : 'Share link copied: the map travels inside the URL'))
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
      const canvas = head.getCanvas();
      if (!canvas) { toast('3D view unavailable'); return; }
      head.renderNow(); // preserveDrawingBuffer is on, but read a fresh frame
      const ep = activeEpisode();
      downloadPng(canvas, buildLegend(ep, registry.zoneById), ep.title);
      toast('PNG saved with its legend');
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
  els.btnIsolate.addEventListener('click', () => ctx.actions.toggleIsolate());
  els.btnExplain.addEventListener('click', () => ctx.actions.toggleExplain());

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
      case 'i': ctx.actions.toggleIsolate(); break;
      case 'e': ctx.actions.toggleExplain(); break;
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
        const cam = activeEpisode()?.camera || {};
        head.setCamera(cam.theta, cam.phi, cam.dist);
        if (state.view === 'xray') head.setXray(true);
        renderAll(ctx);
      })
      .catch(err => {
        els.stageLoader.hidden = true;
        els.stageFallback.hidden = false;
        // The fallback copy says "this browser can't"; say the truthful thing
        // when the browser was fine and the assets or our own code were not.
        els.stageFallback.firstElementChild.textContent = 'The 3D head could not load.';
        console.error('HeadPain 3D failed:', err);
      });
  }

  // ?explain=1 opens straight into the read-only view, which is what a shared
  // link should do: the recipient wants to read the map, not edit it.
  // ?learn=<pattern id> is the same view fed from the published library, so a
  // page elsewhere can deep-link "this is what a cluster headache looks like".
  const query = new URLSearchParams(location.search);
  if (query.get('explain') === '1') setExplain(true);
  const learn = query.get('learn');
  if (learn) {
    const learnEp = episodeFromCondition(learn, registry) || episodeFromDemo(learn, registry);
    if (learnEp) { loadLearnEpisode(learnEp); setExplain(true); }
  }

  els.btnXray.setAttribute('aria-pressed', String(state.view === 'xray'));
  renderZoneBrowser(els.zones, ctx);
  renderRedFlags(els.redflags);
  renderLibrary(els.library, ctx);
  renderDemos(els.demos, ctx);
  renderAll(ctx);
}
