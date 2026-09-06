// Example maps, rendered at the foot of the Patterns tab.
//
// They used to own a whole tab, which spent a quarter of the panel on content
// you read once. A demo is an example pattern, so it lives with the patterns.
// Rendered once at boot; loading one creates a new episode via ctx.actions.loadDemo.

import { DEMOS } from './demos.js';
import { escHtml } from './utils.js';
import { patternSvg } from './patterns.js';
import { patternAt } from './groups.js';

export function renderDemos(el, ctx) {
  el.innerHTML = `
    <h2 class="section-title" style="margin-top:24px">Example maps</h2>
    <p class="fine-print">
      Ready-made maps to look at or take apart. Each loads as a <strong>new episode</strong> in
      your diary, so nothing you built is touched. The combo at the bottom shows two pains at
      once, each with its own colour and shape.
    </p>
    <div style="margin-top:12px">
      ${DEMOS.map(d => `
        <div class="library-card">
          <div class="match-head"><span class="match-name">${escHtml(d.title)}</span></div>
          <p class="match-why" style="margin-top:6px">${escHtml(d.blurb)}</p>
          <div class="demo-legend">
            ${d.groups.map((g, i) => `<span class="demo-tag">${patternSvg(g.pattern || patternAt(i), g.color, 13)}${escHtml(g.name)}</span>`).join('')}
          </div>
          <div class="cond-actions btn-row">
            <button type="button" class="btn btn--primary btn--sm" data-learn="${d.id}">Show me on the head</button>
            <button type="button" class="btn btn--secondary btn--sm" data-demo="${d.id}">Copy into my diary</button>
          </div>
        </div>`).join('')}
    </div>`;

  el.querySelectorAll('[data-demo]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.loadDemo(btn.dataset.demo));
  });
  el.querySelectorAll('[data-learn]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.learn(btn.dataset.learn));
  });
}
