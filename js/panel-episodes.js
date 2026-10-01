// The local diary: recognisable episodes first, backup and maintenance below.
import { state, activeEpisode } from './state.js';
import { escHtml } from './utils.js';
import { intensityBand } from './zones.js';
import { patternSvg } from './patterns.js';
import { trendHtml } from './panel-impact.js';

function fmtDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function episodeRow(ep, ctx) {
  const date = new Date(ep.createdAt);
  const validDate = !Number.isNaN(date.getTime());
  const peak = ep.markers.length ? Math.max(...ep.markers.map(m => m.intensity)) : null;
  const locations = [...new Set(ep.markers.map(m => ctx.registry.zoneById(m.zoneId)?.label || 'Free point'))];
  const where = locations.slice(0, 2).join(' · ') + (locations.length > 2 ? ` +${locations.length - 2}` : '');
  return `
    <button type="button" class="episode-row ${ep.id === state.activeEpisodeId ? 'active' : ''}"
      data-id="${escHtml(ep.id)}" aria-pressed="${ep.id === state.activeEpisodeId}">
      <span class="episode-date"><strong>${validDate ? date.getDate() : '·'}</strong><span>${validDate ? date.toLocaleDateString(undefined, { month: 'short' }) : ''}</span></span>
      <span class="episode-main">
        <span class="episode-title">${escHtml(ep.title)}</span>
        <span class="episode-meta">${escHtml(where || 'No pain points yet')}</span>
        <span class="episode-pains">${ep.groups.slice(0, 4).map(g => patternSvg(g.pattern, g.color, 11)).join('')}
          <span>${ep.markers.length} point${ep.markers.length === 1 ? '' : 's'}${ep.id === state.activeEpisodeId ? ' · Current' : ''}</span>
        </span>
      </span>
      <span class="episode-severity"><strong>${peak === null ? 'Draft' : `${peak}/10`}</strong><span>${peak === null ? 'Add a point' : escHtml(intensityBand(peak).label)}</span></span>
    </button>`;
}

export function renderEpisodes(el, ctx) {
  const ep = activeEpisode();
  el.innerHTML = `
    <div class="diary-heading"><h2>Your pain diary</h2><button type="button" class="btn btn--secondary btn--sm" data-act="new">+ New episode</button></div>
    <p class="fine-print">A little detail today makes the next conversation easier. Start a new episode each time the pain comes back.</p>

    <div class="diary-current">
      <label for="episode-title">Name this episode</label>
      <input id="episode-title" class="episode-rename" data-ref="rename" value="${escHtml(ep.title)}" maxlength="80" placeholder="For example, Monday morning headache">
      <p class="fine-print">Last updated ${fmtDate(ep.updatedAt)}</p>
    </div>

    <div class="diary-list">
      <div class="panel-block-head"><h2>Episodes <span class="pill">${state.episodes.length}</span></h2></div>
      ${state.episodes.map(e => episodeRow(e, ctx)).join('')}
    </div>

    <div class="diary-trend">
      <div class="panel-block-head"><h2>Pain over time</h2></div>
      ${trendHtml(state.episodes)}
    </div>

    <details class="diary-tools">
      <summary>Share or back up your diary</summary>
      <p class="fine-print">A read-only link lets someone see this map and its description. An editable link lets you continue on another device.</p>
      <div class="btn-row">
        <button type="button" class="btn btn--primary btn--sm" data-act="explain-link" ${ep.markers.length ? '' : 'disabled'}>Copy read-only link</button>
        <button type="button" class="btn btn--secondary btn--sm" data-act="share" ${ep.markers.length ? '' : 'disabled'}>Copy editable link</button>
      </div>
      <p class="fine-print">Download a backup to keep your episodes if you clear this browser or change devices.</p>
      <div class="btn-row">
        <button type="button" class="btn btn--secondary btn--sm" data-act="export-all">Back up all episodes</button>
        <button type="button" class="btn btn--secondary btn--sm" data-act="import">Restore a backup</button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn--ghost btn--sm" data-act="export-one">Export this episode</button>
      </div>
      <p class="fine-print">For your own website: <a class="link-btn" href="embed-builder.html">embed a pain map</a>.</p>
    </details>

    <details class="diary-tools">
      <summary>Manage this episode</summary>
      <div class="btn-row"><button type="button" class="btn btn--danger btn--sm" data-act="delete">Delete this episode</button></div>
    </details>
    <p class="diary-retention">Your diary stays in this browser. No account, no uploads. Back it up to keep a copy.</p>`;

  const act = name => el.querySelector(`[data-act="${name}"]`);
  act('new').addEventListener('click', () => ctx.actions.newEpisode());
  act('share').addEventListener('click', () => ctx.actions.copyShareLink());
  act('explain-link').addEventListener('click', () => ctx.actions.copyShareLink({ explain: true }));
  act('export-one').addEventListener('click', () => ctx.actions.exportEpisode());
  act('export-all').addEventListener('click', () => ctx.actions.exportAll());
  act('import').addEventListener('click', () => ctx.actions.pickImportFile());
  act('delete').addEventListener('click', () => ctx.actions.deleteEpisode(ep.id));
  const rename = el.querySelector('[data-ref="rename"]');
  rename.addEventListener('change', () => {
    // Keep the clicked diary control in the DOM when the title field blurs.
    ctx.actions.renameEpisode(ep.id, rename.value, { render: false });
    rename.value = ep.title;
    el.querySelector('.episode-row.active .episode-title').textContent = ep.title;
    document.title = `HeadPain | ${ep.title}`;
  });
  el.querySelectorAll('.episode-row').forEach(row => {
    row.addEventListener('click', () => ctx.actions.loadEpisode(row.dataset.id));
  });
}
