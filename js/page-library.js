// The headache-patterns page: a reading index over the same condition library
// the app matches against.
//
// Built at runtime from CONDITIONS so it cannot drift from what the matcher
// scores. Note the module name: js/patterns.js is the *glyph* vocabulary, this
// is the page that lists headache *patterns*.

import { CONDITIONS, CARD_DISCLAIMER, MATCHER_DISCLAIMER, RED_FLAG_LIST, CONGENITAL_NOTE } from './conditions.js';
import { ROOT_CAUSE_NOTE } from './guidance.js';
import { escHtml, $ } from './utils.js';

const mappable = c => !c.notMappable && Array.isArray(c.primary) && c.primary.length > 0;

// The pattern a reader is most likely to be confusing this one with. Migraine
// is the honest default: one large study of self-diagnosed "sinus headache"
// found 88% met migraine criteria, and it is the pattern most others get
// mistaken for. A card never offers to compare a pattern with itself.
const CONFUSED_WITH = {
  'migraine-no-aura': 'tension-type',
  'migraine-aura': 'migraine-no-aura',
  'tension-type': 'migraine-no-aura',
  'cluster-headache': 'paroxysmal-hemicrania',
  'acute-rhinosinusitis': 'migraine-no-aura',
  'cervicogenic-headache': 'occipital-neuralgia',
  'occipital-neuralgia': 'cervicogenic-headache',
};

function compareTarget(c) {
  const preferred = CONFUSED_WITH[c.id];
  if (preferred && preferred !== c.id) return preferred;
  return c.id === 'migraine-no-aura' ? 'tension-type' : 'migraine-no-aura';
}

const TIERS = [
  ['common', 'Common patterns', 'The ones most head pain turns out to be.'],
  ['advanced', 'Less common and structural', 'Rarer, and the ones most often mistaken for the common patterns.'],
];

function card(c) {
  const canShow = mappable(c);
  return `
    <article class="lib-card" id="${escHtml(c.id)}">
      <header class="lib-card-head">
        <h3>${escHtml(c.name)}</h3>
        <span class="tier-pill ${escHtml(c.tier)}">${escHtml(c.tier)}</span>
      </header>
      <p class="lib-feels">${escHtml(c.feelsLike)}</p>
      <dl class="lib-facts">
        <dt>Timing and pattern</dt><dd>${escHtml(c.time)}</dd>
        <dt>How it is told apart</dt><dd>${escHtml(c.differentiators)}</dd>
        ${c.redFlags ? `<dt class="danger">See a doctor promptly if</dt><dd class="danger">${escHtml(c.redFlags)}</dd>` : ''}
      </dl>
      ${c.congenital ? `<p class="fine-print">${escHtml(CONGENITAL_NOTE)}</p>` : ''}
      <div class="lib-actions">
        ${canShow
          ? `<a class="btn btn--primary btn--sm" href="./?learn=${encodeURIComponent(c.id)}">See it on the head</a>
             <a class="btn btn--secondary btn--sm" href="./?compare=${encodeURIComponent(c.id)},${encodeURIComponent(compareTarget(c))}">Compare</a>
             <a class="btn btn--secondary btn--sm" href="embed-builder.html?preset=${encodeURIComponent(c.id)}">Embed this</a>`
          : '<span class="fine-print">This one has no single place on the head to show.</span>'}
      </div>
      <p class="fine-print">${escHtml(CARD_DISCLAIMER)}</p>
    </article>`;
}

export function renderLibraryPage(root) {
  const shown = CONDITIONS.filter(c => c.tier === 'common' || c.tier === 'advanced');

  root.innerHTML = `
    <section class="lib-intro">
      <h2>Head pain, pattern by pattern</h2>
      <p>
        ${shown.length} patterns from the published headache literature, each one you can put on a
        3D head and turn around. They are here to help you describe what you feel, and to show how
        two things that both read as "a bad headache" are told apart. None of this diagnoses
        anything.
      </p>
      <p class="fine-print">${escHtml(MATCHER_DISCLAIMER)}</p>
      <div class="lib-jump">
        <a class="btn btn--secondary btn--sm" href="./">Map your own pain</a>
        <a class="btn btn--secondary btn--sm" href="embed-builder.html">Put one in your page</a>
      </div>
    </section>

    <section class="redflag-card lib-redflags">
      <h3>Skip all of this and get urgent care if your headache…</h3>
      <ul>${RED_FLAG_LIST.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>
    </section>

    ${TIERS.map(([tier, title, blurb]) => {
      const cards = shown.filter(c => c.tier === tier);
      if (!cards.length) return '';
      return `
        <section class="lib-tier">
          <h2 class="lib-tier-title">${escHtml(title)}</h2>
          <p class="lib-tier-blurb">${escHtml(blurb)}</p>
          <div class="lib-grid">${cards.map(card).join('')}</div>
        </section>`;
    }).join('')}

    <section class="rootcause-card lib-rootcause">
      <h3>Chase the root cause, not just the pain</h3>
      <p>${escHtml(ROOT_CAUSE_NOTE)}</p>
    </section>`;

  // A deep link straight to one pattern should land on it, opened.
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) root.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' });
}

renderLibraryPage($('#library-root'));
