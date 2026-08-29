// Conditions tab — pattern matches for the current map, red-flag safety card,
// the root-cause reminder, and the full browsable condition library.

import {
  CONDITIONS, MATCHER_DISCLAIMER, CARD_DISCLAIMER, CONGENITAL_NOTE,
  MATCH_CAP_NOTE, RED_FLAG_LIST, scoreConditions
} from './conditions.js';
import { ROOT_CAUSE_NOTE } from './guidance.js';
import { escHtml } from './utils.js';
import { activeEpisode, activeGroup } from './state.js';

function detailBlock(c) {
  return `
    <div class="cond-detail">
      <p><span class="k">Feels like</span><br>${escHtml(c.feelsLike)}</p>
      <p><span class="k">Timing & pattern</span><br>${escHtml(c.time)}</p>
      <p><span class="k">How it's told apart</span><br>${escHtml(c.differentiators)}</p>
      ${c.redFlags ? `<p class="cond-redflags"><span class="k">See a doctor promptly if</span><br>${escHtml(c.redFlags)}</p>` : ''}
      ${c.congenital ? `<p class="muted">${escHtml(CONGENITAL_NOTE)}</p>` : ''}
      <p class="fine-print">${escHtml(CARD_DISCLAIMER)}</p>
    </div>`;
}

function condActions(c) {
  return `
    <div class="cond-actions btn-row">
      <button type="button" class="btn btn--primary btn--sm" data-addgroup="${c.id}">
        + Add as group
      </button>
      <button type="button" class="btn btn--secondary btn--sm" data-preset="${c.id}">
        Replace map with pattern
      </button>
    </div>`;
}

export function renderMatches(el, ctx) {
  const ep = activeEpisode();
  const group = activeGroup();
  const all = ep?.markers || [];
  const markers = group ? all.filter(m => m.groupId === group.id) : all;

  let body;
  if (!markers.length) {
    body = `<div class="empty-note">${group
      ? `No points in the “${escHtml(group.name)}” group yet — tap the head to add some.`
      : 'Add points on the Map tab to see which published patterns your map resembles.'}</div>`;
  } else {
    const matches = scoreConditions(markers, ctx.registry.zoneById);
    if (!matches.length) {
      body = '<div class="empty-note">No close pattern match. That\'s common and completely fine. Real pain rarely follows a textbook.</div>';
    } else {
      body = matches.map((m, i) => `
        <div class="match-card">
          <div class="match-head">
            <span class="match-name">${i + 1}. ${escHtml(m.condition.name)}</span>
            <span class="match-score">${m.score}%</span>
          </div>
          <div class="score-bar"><div class="score-fill" style="width:${m.score}%"></div></div>
          <p class="match-why">${escHtml(m.explanation)}</p>
          <details>
            <summary class="link-btn">About this pattern</summary>
            ${detailBlock(m.condition)}
          </details>
          ${condActions(m.condition)}
        </div>`).join('');
    }
  }

  el.innerHTML = `
    <h2 class="section-title">Closest patterns for this map</h2>
    <p class="fine-print">${escHtml(MATCHER_DISCLAIMER)}</p>
    <p class="fine-print" style="margin-top:6px">${escHtml(MATCH_CAP_NOTE)}</p>
    ${group ? `<p class="fine-print scope-note" style="margin-top:6px">Matching only the
      <strong>${escHtml(group.name)}</strong> group — click it again on the Map tab to match the whole map.</p>` : ''}
    <div style="margin-top:12px">${body}</div>`;

  el.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.applyPreset(btn.dataset.preset));
  });
  el.querySelectorAll('[data-addgroup]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.applyPresetAsGroup(btn.dataset.addgroup));
  });
}

export function renderRedFlags(el) {
  el.innerHTML = `
    <div class="redflag-card">
      <h3>Skip the map: get urgent care if your headache…</h3>
      <ul>${RED_FLAG_LIST.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>
    </div>
    <div class="rootcause-card">
      <h3>Chase the root cause, not just the pain</h3>
      <p>${escHtml(ROOT_CAUSE_NOTE)}</p>
    </div>`;
}

export function renderLibrary(el, ctx) {
  const tiers = [
    ['common', 'Common patterns'],
    ['advanced', 'Advanced & structural']
  ];
  el.innerHTML = '<h2 class="section-title">Browse the library</h2>' + tiers.map(([tier, title]) => {
    const cards = CONDITIONS.filter(c => c.tier === tier).map(c => `
      <div class="library-card">
        <div class="match-head">
          <span class="match-name">${escHtml(c.name)}</span>
          <span class="tier-pill ${tier}">${tier}</span>
        </div>
        <p class="match-why" style="margin-top:6px">${escHtml(c.feelsLike)}</p>
        <details>
          <summary class="link-btn">Details</summary>
          ${detailBlock(c)}
        </details>
        ${c.notMappable || !c.primary.length ? '' : condActions(c)}
      </div>`).join('');
    return `<h3 class="section-title" style="margin-top:16px;font-size:0.85rem;color:var(--text-muted)">${title}</h3>${cards}`;
  }).join('');

  el.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.applyPreset(btn.dataset.preset));
  });
  el.querySelectorAll('[data-addgroup]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.applyPresetAsGroup(btn.dataset.addgroup));
  });
}
