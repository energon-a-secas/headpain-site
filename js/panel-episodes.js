// Episodes tab — the local diary: list, rename, delete, export/import, share.

import { state, activeEpisode } from './state.js';
import { escHtml } from './utils.js';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '';
  }
}

export function renderEpisodes(el, ctx) {
  const ep = activeEpisode();

  el.innerHTML = `
    <div class="privacy-card">
      Everything stays in <strong>this browser</strong> (localStorage) — no account, no server.
      Export JSON to back up or move devices. Share links encode the map in the URL itself.
    </div>

    <div>
      <div class="panel-block-head"><h2>Current episode</h2></div>
      <input class="episode-rename" data-ref="rename" value="${escHtml(ep.title)}"
             maxlength="80" aria-label="Episode title">
      <p class="fine-print" style="margin-top:6px">
        ${ep.markers.length} point${ep.markers.length === 1 ? '' : 's'} · updated ${fmtDate(ep.updatedAt)}
      </p>
      <div class="btn-row" style="margin-top:10px">
        <button type="button" class="btn btn--primary btn--sm" data-act="new">New episode</button>
        <button type="button" class="btn btn--secondary btn--sm" data-act="share">Copy share link</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn btn--secondary btn--sm" data-act="export-one">Export episode JSON</button>
        <button type="button" class="btn btn--secondary btn--sm" data-act="export-all">Export all JSON</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn btn--ghost btn--sm" data-act="import">Import JSON…</button>
        <button type="button" class="btn btn--danger btn--sm" data-act="delete">Delete episode</button>
      </div>
    </div>

    <div>
      <div class="panel-block-head"><h2>Diary <span class="pill">${state.episodes.length}</span></h2></div>
      ${state.episodes.map(e => `
        <div class="episode-row ${e.id === state.activeEpisodeId ? 'active' : ''}" data-id="${e.id}"
             role="button" tabindex="0">
          <div class="episode-main">
            <div class="episode-title">${escHtml(e.title)}</div>
            <div class="episode-meta">${e.markers.length} pts · ${fmtDate(e.updatedAt)}</div>
          </div>
        </div>`).join('')}
    </div>`;

  const act = name => el.querySelector(`[data-act="${name}"]`);
  act('new').addEventListener('click', () => ctx.actions.newEpisode());
  act('share').addEventListener('click', () => ctx.actions.copyShareLink());
  act('export-one').addEventListener('click', () => ctx.actions.exportEpisode());
  act('export-all').addEventListener('click', () => ctx.actions.exportAll());
  act('import').addEventListener('click', () => ctx.actions.pickImportFile());
  act('delete').addEventListener('click', () => ctx.actions.deleteEpisode(ep.id));

  const rename = el.querySelector('[data-ref="rename"]');
  rename.addEventListener('change', () => ctx.actions.renameEpisode(ep.id, rename.value));

  el.querySelectorAll('.episode-row').forEach(row => {
    row.addEventListener('click', () => ctx.actions.loadEpisode(row.dataset.id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.actions.loadEpisode(row.dataset.id); }
    });
  });
}
