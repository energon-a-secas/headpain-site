// Explain view — the read-only half of the app.
//
// It answers the question the tool could not answer before: what does this map
// mean to somebody who did not build it. Same scene, same legend model, no
// editor. A share link with ?explain=1 opens straight into it, so the person you
// send a map to reads it instead of being handed a control panel.

import { escHtml } from './utils.js';
import { CONDITIONS, CARD_DISCLAIMER } from './conditions.js';
import { activeEpisode, isolatedGroup } from './state.js';
import { buildLegend, legendHtml } from './legend.js';
import { patternSvg } from './patterns.js';
import { paint } from './groups.js';
import { intensityBand } from './zones.js';
import { impactCardHtml } from './panel-impact.js';

const READING_NOTE =
  'Colour and shape say which pain. Stronger colour means it hurts more. ' +
  'Press X-ray to see how deep a pain sits under the skin.';

// When a pain came from the published library, the explanation comes with it.
// This is what makes an explain link double as a teaching page.
function patternNote(conditionId) {
  const c = CONDITIONS.find(x => x.id === conditionId);
  if (!c) return '';
  return `
    <details class="explain-pattern">
      <summary class="link-btn">What this pattern is</summary>
      <p><strong>Feels like:</strong> ${escHtml(c.feelsLike)}</p>
      <p><strong>Timing:</strong> ${escHtml(c.time)}</p>
      <p><strong>Told apart by:</strong> ${escHtml(c.differentiators)}</p>
      ${c.redFlags ? `<p class="cond-redflags"><strong>See a doctor promptly if:</strong> ${escHtml(c.redFlags)}</p>` : ''}
      <p class="fine-print">${escHtml(CARD_DISCLAIMER)}</p>
    </details>`;
}

function painCard(p) {
  if (!p.count) return '';
  return `
    <div class="explain-card">
      <div class="explain-card-head">
        ${patternSvg(p.pattern, paint(p.color, Math.max(p.peak, 4)), 22)}
        <span class="explain-card-name">${escHtml(p.name)}</span>
        <span class="explain-card-peak">${p.peak}/10 ${escHtml(intensityBand(p.peak).label.toLowerCase())}</span>
      </div>
      <p class="explain-card-prose">
        <strong>Where:</strong> ${escHtml(p.prose.where)}<br>
        <strong>How bad:</strong> ${escHtml(p.prose.strength)}<br>
        ${p.prose.feels ? `<strong>What it is like:</strong> ${escHtml(p.prose.feels)}` : ''}
      </p>
      ${patternNote(p.conditionId)}
    </div>`;
}

export function renderExplain(el, stageLegendEl, ctx) {
  const ep = activeEpisode();
  if (!ep) return;
  const model = buildLegend(ep, ctx.registry.zoneById);
  const iso = isolatedGroup();

  // The compact key sits on the head itself, so a screenshot of the stage alone
  // is still readable.
  stageLegendEl.innerHTML = ctx.state.explain ? legendHtml(model, { isolateId: iso?.id || null }) : '';
  stageLegendEl.setAttribute('aria-hidden', String(!ctx.state.explain));

  if (!ctx.state.explain) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="explain-inner">
      <h2 class="explain-title">${escHtml(ep.title)}</h2>
      <p class="explain-sub">${model.pointCount} point${model.pointCount === 1 ? '' : 's'}
        across ${model.painCount} pain${model.painCount === 1 ? '' : 's'}</p>
      <p class="explain-note">${escHtml(READING_NOTE)}</p>
      ${impactCardHtml(ep)}
      ${model.pains.length > 1 ? `
        <div class="explain-hint">Click a pain above the head to see it on its own.</div>` : ''}
      ${model.pains.map(painCard).join('') || '<div class="empty-note">This map has no points yet.</div>'}
      <p class="fine-print explain-fine">
        This is a description of pain, not a diagnosis. It was written by the person who feels it.
      </p>
    </div>`;
}
