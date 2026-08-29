// Demos tab — ready-made episodes that teach the multi-group workflow.
// Rendered once at boot; loading a demo creates a new episode via ctx.actions.loadDemo.

import { DEMOS } from './demos.js';
import { escHtml } from './utils.js';

export function renderDemos(el, ctx) {
  el.innerHTML = `
    <h2 class="section-title">Demo maps</h2>
    <p class="fine-print">
      Each demo loads as a <strong>new episode</strong> in your diary, edit or delete it freely.
      The combo demo at the bottom shows two pain groups in two colors on one head.
    </p>
    <div style="margin-top:12px">
      ${DEMOS.map(d => `
        <div class="library-card">
          <div class="match-head"><span class="match-name">${escHtml(d.title)}</span></div>
          <p class="match-why" style="margin-top:6px">${escHtml(d.blurb)}</p>
          <div class="demo-legend">
            ${d.groups.map(g => `<span class="demo-tag"><span class="dot dot--sm"
              style="background:${g.color};color:${g.color}"></span>${escHtml(g.name)}</span>`).join('')}
          </div>
          <div class="cond-actions">
            <button type="button" class="btn btn--secondary btn--sm" data-demo="${d.id}">Load demo</button>
          </div>
        </div>`).join('')}
    </div>`;

  el.querySelectorAll('[data-demo]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.loadDemo(btn.dataset.demo));
  });
}
