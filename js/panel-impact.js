// Impact tab — how often, how long, what it stops you doing, and the trend.
//
// The form is deliberately chips-and-a-slider rather than a questionnaire: the
// person filling it in has a headache. Everything it collects is shown back
// immediately as sentences, so the answer to "why am I ticking these boxes" is
// on screen while they tick them.

import { escHtml } from './utils.js';
import { state, activeEpisode } from './state.js';
import {
  FREQUENCIES, DURATIONS, IMPACT_FIELDS,
  emptyImpact, impactSentences, hasImpact
} from './impact.js';
import { paint } from './groups.js';
import { patternSvg } from './patterns.js';

function chipRow(options, selected, attr) {
  const chosen = Array.isArray(selected) ? selected : [selected];
  return `<div class="chip-row">${options.map(o => `
    <button type="button" class="chip ${chosen.includes(o.id) ? 'active' : ''}"
      data-${attr}="${o.id}">${escHtml(o.label)}</button>`).join('')}</div>`;
}

// One bar per episode, tallest = worst point in it, coloured by the pain that
// peaked. A diary is only useful over time, and a list of filenames does not
// show time.
function trendHtml(episodes) {
  const dated = episodes
    .map(ep => {
      if (!ep.markers.length) return null;
      const worst = ep.markers.reduce((a, m) => (m.intensity > a.intensity ? m : a));
      const pain = ep.groups.find(g => g.id === worst.groupId);
      return {
        id: ep.id,
        title: ep.title,
        when: new Date(ep.createdAt),
        peak: worst.intensity,
        color: pain?.color,
        pattern: pain?.pattern || 'solid',
        days: ep.impact?.daysLost || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.when - b.when)
    .slice(-24);

  if (dated.length < 2) {
    return `<div class="empty-note">
      Start a new episode each time it comes back, and this becomes a picture of the last few months.
    </div>`;
  }

  const totalDays = dated.reduce((sum, d) => sum + d.days, 0);
  const avg = (dated.reduce((sum, d) => sum + d.peak, 0) / dated.length).toFixed(1);
  const fmt = d => d.when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return `
    <div class="trend">
      <div class="trend-bars" role="img"
        aria-label="Worst pain level across ${dated.length} episodes, from ${fmt(dated[0])} to ${fmt(dated[dated.length - 1])}">
        ${dated.map(d => `
          <span class="trend-bar" style="height:${Math.max(6, d.peak * 10)}%;
            background:${paint(d.color, d.peak)}"
            title="${escHtml(d.title)}: worst ${d.peak}/10 on ${fmt(d)}"></span>`).join('')}
      </div>
      <div class="trend-axis"><span>${fmt(dated[0])}</span><span>${fmt(dated[dated.length - 1])}</span></div>
      <div class="trend-stats">
        <span><strong>${dated.length}</strong> episodes recorded</span>
        <span><strong>${avg}</strong> average worst level</span>
        ${totalDays ? `<span><strong>${totalDays}</strong> days lost in total</span>` : ''}
      </div>
    </div>`;
}

export function renderImpact(el, ctx) {
  const ep = activeEpisode();
  if (!ep) return;
  const impact = ep.impact || emptyImpact();
  const sentences = impactSentences(impact);

  el.innerHTML = `
    <h2 class="section-title">What this pain costs you</h2>
    <p class="fine-print">
      A map says where it hurts. This says what it does to your week, which is the part
      a doctor, a partner or a manager actually needs. It travels with the map: into the
      explain view, the shared link and the exported picture.
    </p>

    <div class="impact-summary ${sentences.length ? '' : 'impact-summary--empty'}">
      ${sentences.length
        ? sentences.map(s => `<p>${escHtml(s)}</p>`).join('')
        : '<p class="muted">Answer anything below and it becomes a sentence here.</p>'}
    </div>

    <div class="panel-block">
      <div class="panel-block-head"><h2>How often does it come?</h2></div>
      ${chipRow(FREQUENCIES, impact.frequency, 'freq')}
    </div>

    <div class="panel-block">
      <div class="panel-block-head"><h2>How long does it last?</h2></div>
      ${chipRow(DURATIONS, impact.duration, 'dur')}
    </div>

    ${IMPACT_FIELDS.map(f => `
      <div class="panel-block">
        <div class="panel-block-head"><h2>${escHtml(f.title)}</h2></div>
        ${chipRow(f.options, impact[f.key], f.key)}
      </div>`).join('')}

    <div class="panel-block">
      <div class="panel-block-head">
        <h2>Days it cost you last month</h2>
        <span class="field-value" data-ref="days">${impact.daysLost ?? 'not said'}</span>
      </div>
      <input type="range" min="0" max="31" step="1" value="${impact.daysLost ?? 0}"
             data-ref="days-input" aria-label="Days lost in the last month, 0 to 31">
      <div class="field-desc">Days you could not do what you normally do. Zero means you would rather not say.</div>
    </div>

    <div class="panel-block">
      <div class="panel-block-head"><h2>Across your diary</h2></div>
      ${trendHtml(state.episodes)}
    </div>

    <p class="fine-print">
      These are your own words about your own week, not a clinical score. Nothing here is
      a validated disability questionnaire, and no number from it means anything on its own.
    </p>`;

  // The container survives every render, so its listener is bound once. Bound
  // per render it would stack up and fire the toggle once per past render.
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-freq], [data-dur], [data-blocked], [data-symptoms], [data-relief]');
      if (!btn) return;
      const now = activeEpisode()?.impact || emptyImpact();
      const { freq, dur, blocked, symptoms, relief } = btn.dataset;
      if (freq !== undefined) ctx.actions.setImpact({ frequency: now.frequency === freq ? null : freq });
      else if (dur !== undefined) ctx.actions.setImpact({ duration: now.duration === dur ? null : dur });
      else if (blocked !== undefined) ctx.actions.toggleImpact('blocked', blocked);
      else if (symptoms !== undefined) ctx.actions.toggleImpact('symptoms', symptoms);
      else if (relief !== undefined) ctx.actions.toggleImpact('relief', relief);
    });
  }

  const days = el.querySelector('[data-ref="days-input"]');
  const readout = el.querySelector('[data-ref="days"]');
  // Live readout while dragging, one state write on release: the whole panel
  // re-renders on change, and re-rendering under the thumb loses the drag.
  days.addEventListener('input', () => {
    readout.textContent = days.value === '0' ? 'not said' : days.value;
  });
  days.addEventListener('change', () => ctx.actions.setImpact({ daysLost: Number(days.value) || null }));
}

// Used by the explain view and the exported PNG.
export function impactCardHtml(ep) {
  const sentences = impactSentences(ep.impact);
  if (!sentences.length) return '';
  return `
    <div class="explain-card explain-card--impact">
      <div class="explain-card-head">
        <span class="explain-card-name">What it costs</span>
      </div>
      <p class="explain-card-prose">${sentences.map(escHtml).join('<br>')}</p>
    </div>`;
}

export { hasImpact, patternSvg };
