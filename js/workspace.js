// Guidance and navigation around the map. The episode model stays in state.js.
import { activeEpisode, selectedMarker, setCamera, setExplain, state, createEpisode, ensureActivePain } from './state.js';
import { hasImpact } from './impact.js';
import { loadFromStorage, saveToStorage, storageStatus } from './persist.js';
import { $ } from './utils.js';

const VIEWS = { front: 0, left: Math.PI / 2, back: Math.PI, right: -Math.PI / 2 };
const smallScreen = () => matchMedia('(max-width: 980px)').matches;

function scrollToPanel() {
  if (smallScreen()) {
    const panel = $(state.explain ? '#explain-panel' : '.panel');
    panel.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

export function syncViewButtons(theta = 0, phi = Math.PI / 2) {
  document.querySelectorAll('[data-camera]').forEach(btn => {
    const delta = Math.atan2(Math.sin(theta - VIEWS[btn.dataset.camera]), Math.cos(theta - VIEWS[btn.dataset.camera]));
    btn.setAttribute('aria-pressed', String(Math.abs(delta) < 0.12 && Math.abs(phi - Math.PI / 2) < 0.15));
  });
}

export function renderStorageStatus() {
  const el = $('#storage-status');
  if (!el) return;
  const status = state.shared ? 'shared' : storageStatus;
  const labels = {
    idle: 'No account. Private to this browser.',
    saved: 'Saved in this browser · No account needed',
    error: 'Could not save. Back up your diary before leaving.',
    shared: 'Viewing a map · Your diary is unchanged'
  };
  if (el.dataset.status === status) return;
  el.dataset.status = status;
  el.innerHTML = '<span class="status-dot" aria-hidden="true"></span>';
  el.append(document.createTextNode(labels[status]));
}

export function renderWorkspace(ctx) {
  const ep = activeEpisode();
  if (!ep) return;
  const count = ep.markers.length;
  $('#map-episode-title').textContent = ep.title;
  $('#map-title').textContent = state.explain ? 'A picture of the pain' : 'Your pain map';
  ctx.head.getCanvas()?.setAttribute('aria-label', state.explain
    ? 'Read-only 3D pain map. Drag to rotate. A written description follows the map.'
    : '3D pain map. Drag to rotate and tap to mark pain. Named areas are also available in the Map pain tab.');
  $('#map-point-count').textContent = count ? `${count} point${count === 1 ? '' : 's'} mapped` : 'No points yet';
  $('#points-block').hidden = count === 0;
  $('#map-next-step').hidden = count === 0 || Boolean(selectedMarker());
  $('#btn-share').disabled = count === 0;
  $('#btn-explain').disabled = count === 0 && !state.explain;
  $('#btn-png').disabled = count === 0;
  $('#btn-clear-points').disabled = count === 0;
  if (!count) {
    $('#share-panel').hidden = true;
    $('#btn-share').setAttribute('aria-expanded', 'false');
  }
  $('#btn-new-episode').textContent = state.shared ? 'Back to my diary' : '+ New episode';
  renderStorageStatus();
}

// Replacing panel HTML must not strand keyboard users at the top of the page.
export function rememberFocus() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.closest('main')) return () => {};
  const root = el.parentElement?.closest('[id]');
  const attr = [...el.attributes].find(a => a.name.startsWith('data-'));
  const selector = el.id ? `#${CSS.escape(el.id)}`
    : root && attr ? `#${CSS.escape(root.id)} [${attr.name}="${CSS.escape(attr.value)}"]` : null;
  return () => {
    if (!el.isConnected && selector) document.querySelector(selector)?.focus({ preventScroll: true });
  };
}

export function initWorkspace(ctx) {
  const { actions, head } = ctx;
  let previousDiary = null;
  head.setBackground(0x192126);
  const share = $('#share-panel');
  const shareButton = $('#btn-share');
  shareButton.setAttribute('aria-controls', 'share-panel');
  shareButton.setAttribute('aria-expanded', 'false');
  shareButton.addEventListener('click', () => {
    share.hidden = !share.hidden;
    shareButton.setAttribute('aria-expanded', String(!share.hidden));
    if (!share.hidden) share.querySelector('button').focus({ preventScroll: true });
  });
  $('[data-close-share]').addEventListener('click', () => {
    share.hidden = true;
    shareButton.setAttribute('aria-expanded', 'false');
    shareButton.focus();
  });
  share.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    $('[data-close-share]').click();
  });
  $('[data-share-link]').addEventListener('click', () => actions.copyShareLink({ explain: true }));
  $('[data-share-image]').addEventListener('click', () => actions.snapshot());
  $('[data-preview-summary]').addEventListener('click', () => actions.toggleExplain());
  $('[data-go-impact]').addEventListener('click', () => {
    actions.setTab('impact');
    $('#tab-impact').focus({ preventScroll: true });
    scrollToPanel();
  });

  const setTab = actions.setTab;
  actions.setTab = name => {
    const changed = !$(`#tab-${name}`).classList.contains('active');
    setTab(name);
    if (changed) {
      $(`#panel-${name}`).scrollTop = 0;
      if (smallScreen() && window.scrollY > 200) scrollToPanel();
    }
  };

  function returnToDiary() {
    if (previousDiary) {
      Object.assign(state, previousDiary);
      previousDiary = null;
      ensureActivePain();
    } else if (!loadFromStorage(ctx.registry)) {
      state.episodes = [];
      createEpisode('My first map');
    }
    state.shared = false;
    setExplain(false);
    head.setXray(state.view === 'xray');
    $('#btn-xray').setAttribute('aria-pressed', String(state.view === 'xray'));
    actions.renderAll();
    const cam = activeEpisode().camera;
    head.setCamera(cam.theta, cam.phi, cam.dist);
    syncViewButtons(cam.theta, cam.phi);
    actions.setTab('episodes');
    scrollToPanel();
  }

  for (const name of ['learn', 'compare']) {
    const original = actions[name];
    actions[name] = (...args) => {
      if (!state.shared) {
        previousDiary = structuredClone({ episodes: state.episodes, activeEpisodeId: state.activeEpisodeId, activeGroupId: state.activeGroupId, selectedMarkerId: null, isolateGroupId: null, view: state.view });
      }
      original(...args);
    };
  }

  const create = actions.newEpisode;
  actions.newEpisode = () => {
    if (state.shared) returnToDiary();
    const ep = activeEpisode();
    if (ep.markers.length || ep.groups.length || hasImpact(ep.impact)) create();
    setExplain(false);
    head.resetView();
    actions.setTab('map');
    actions.renderAll();
    syncViewButtons();
    scrollToPanel();
  };
  $('#btn-new-episode').addEventListener('click', () => state.shared ? returnToDiary() : actions.newEpisode());

  document.querySelectorAll('[data-camera]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theta = VIEWS[btn.dataset.camera];
      head.setCamera(theta, Math.PI / 2, 4.9);
      setCamera(theta, Math.PI / 2, 4.9);
      saveToStorage();
      renderStorageStatus();
      syncViewButtons(theta);
    });
  });
  const cameraChanged = head.onCameraChange;
  head.onCameraChange = (theta, phi, dist) => {
    syncViewButtons(theta, phi);
    cameraChanged(theta, phi, dist);
  };
  const resetView = actions.resetView;
  actions.resetView = () => {
    resetView();
    setCamera(0, Math.PI / 2, 4.9);
    saveToStorage();
    syncViewButtons();
    renderStorageStatus();
  };

  function revealEditor() {
    actions.setTab('map');
    $('#zone-browser').open = false;
    $('#panel-map').scrollTop = 0;
    const heading = $('#editor .editor-zone');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    scrollToPanel();
  }
  const selectPoint = actions.selectPoint;
  actions.selectPoint = id => {
    const wasEditing = Boolean(selectedMarker());
    selectPoint(id);
    if (id) revealEditor();
    else if (wasEditing) {
      $('#panel-map').scrollTop = 0;
      const heading = $('#editor h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      scrollToPanel();
    }
  };
  for (const name of ['addPointForZone', 'pickOnHead']) {
    const original = actions[name];
    actions[name] = (...args) => {
      if (state.explain) return;
      original(...args);
      if (name === 'addPointForZone') {
        const zone = ctx.registry.zoneById(args[0]);
        if (zone && !zone.virtual) {
          const theta = Math.atan2(zone.anchor[0], zone.anchor[2]);
          head.setCamera(theta, Math.PI / 2, 4.9);
          setCamera(theta, Math.PI / 2, 4.9);
          saveToStorage();
          syncViewButtons(theta);
        }
      }
      revealEditor();
    };
  }

  const explain = actions.toggleExplain;
  actions.toggleExplain = () => { explain(); scrollToPanel(); };

  document.querySelectorAll('[data-open-zones]').forEach(btn => {
    btn.addEventListener('click', () => {
      actions.setTab('map');
      $('#zone-browser').open = true;
      $('#zone-search').focus();
    });
  });
  $('#zone-search').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase();
    let count = 0;
    document.querySelectorAll('#zones .zone-group').forEach(group => {
      let visible = 0;
      group.querySelectorAll('[data-zone]').forEach(btn => {
        const haystack = `${btn.textContent} ${btn.title}`.toLocaleLowerCase();
        btn.hidden = !haystack.includes(query);
        if (!btn.hidden) visible++;
      });
      group.hidden = visible === 0;
      count += visible;
    });
    $('#zone-no-results').hidden = count > 0;
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) {
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      actions.setTab(tabs[next].id.slice(4));
      tabs[next].focus();
    });
  }
  const camera = activeEpisode()?.camera;
  if (camera) syncViewButtons(camera.theta, camera.phi);
}
