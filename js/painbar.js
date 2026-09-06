// The pain bar — a full-width strip of chips above the head, one per pain.
//
// It exists because grouping used to be a four-step ritual (create a "Group 1",
// rename it through a pencil, click a swatch up to eight times for a colour,
// then click the row again so new points would join it) and none of the steps
// happened at the moment you needed them. Here the pain you are adding to is the
// first thing on the page, and every point lands in it, so grouping costs
// nothing and the map is legible from the first tap.

import { escHtml } from './utils.js';
import { state, activeEpisode } from './state.js';
import { GROUP_COLORS, colorName, PATTERNS, patternLabel } from './groups.js';
import { patternSvg } from './patterns.js';

let openStyleFor = null; // pain id whose colour/shape popover is open

function chipHtml(g, count, ctx) {
  const active = state.explain ? g.id === state.isolateGroupId : g.id === state.activeGroupId;
  const isolated = state.isolateGroupId && state.isolateGroupId !== g.id;
  const desc = `${colorName(g.color)}, ${patternLabel(g.pattern)}`;
  return `
    <div class="pain-chip ${active ? 'active' : ''} ${isolated ? 'faded' : ''}" data-id="${g.id}"
         role="button" tabindex="0" aria-pressed="${active}"
         title="${state.explain
           ? (active ? `Showing “${escHtml(g.name)}” alone: click to show every pain` : `See “${escHtml(g.name)}” on its own`)
           : (active ? 'New points join this pain' : `Add to “${escHtml(g.name)}” instead`)}">
      <button type="button" class="pain-style" data-style="${g.id}"
        aria-label="Colour and shape for ${escHtml(g.name)}: ${desc}" title="Colour and shape (${desc})">
        ${patternSvg(g.pattern, g.color, 16)}
      </button>
      <span class="pain-name" data-name="${g.id}">${escHtml(g.name)}</span>
      <span class="pain-count" aria-label="${count} point${count === 1 ? '' : 's'}">${count}</span>
      <button type="button" class="pain-del" data-del="${g.id}"
        aria-label="Delete pain ${escHtml(g.name)}">&times;</button>
    </div>`;
}

function stylePopoverHtml(g) {
  const colors = GROUP_COLORS.map(c => `
    <button type="button" class="style-swatch ${c === g.color ? 'on' : ''}" data-color="${c}"
      aria-label="${colorName(c)}" title="${colorName(c)}">${patternSvg(g.pattern, c, 20)}</button>`).join('');
  const patterns = PATTERNS.map(p => `
    <button type="button" class="style-swatch ${p.id === g.pattern ? 'on' : ''}" data-pattern="${p.id}"
      aria-label="${p.label}" title="${p.label}">${patternSvg(p.id, g.color, 20)}</button>`).join('');
  return `
    <div class="style-pop" data-pop="${g.id}" role="group" aria-label="Colour and shape for ${escHtml(g.name)}">
      <div class="style-pop-title">Colour</div>
      <div class="style-row">${colors}</div>
      <div class="style-pop-title">Shape <span class="muted">(so it still reads in print and in greyscale)</span></div>
      <div class="style-row">${patterns}</div>
    </div>`;
}

export function renderPainBar(el, ctx) {
  const ep = activeEpisode();
  const groups = ep?.groups || [];
  const counts = new Map(groups.map(g => [g.id, 0]));
  for (const m of ep?.markers || []) counts.set(m.groupId, (counts.get(m.groupId) || 0) + 1);
  if (openStyleFor && !groups.some(g => g.id === openStyleFor)) openStyleFor = null;
  const styled = groups.find(g => g.id === openStyleFor);

  el.innerHTML = `
    <div class="pain-bar-inner">
      <span class="pain-bar-label" id="pain-bar-label">${groups.length ? 'Pains' : 'Pain'}</span>
      <div class="pain-chips" role="group" aria-labelledby="pain-bar-label">
        ${groups.length
          ? groups.map(g => chipHtml(g, counts.get(g.id) || 0, ctx)).join('')
          : '<span class="pain-empty">Tap the head to start. Your first pain is created for you.</span>'}
      </div>
      <button type="button" class="pain-add" data-act="add">+ Add pain</button>
    </div>
    ${styled ? stylePopoverHtml(styled) : ''}`;

  el.querySelector('[data-act="add"]').addEventListener('click', () => ctx.actions.newPain());

  el.querySelectorAll('.pain-chip').forEach(chip => {
    const id = chip.dataset.id;
    chip.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      // Reading a map and building one want opposite things from a chip click:
      // a reader wants to see that pain alone, an author wants to add to it.
      if (state.explain) ctx.actions.isolatePain(id);
      else if (id === state.activeGroupId && e.target.closest('.pain-name')) startRename(el, id, ctx);
      else ctx.actions.setActivePain(id);
    });
    chip.addEventListener('keydown', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state.explain) ctx.actions.isolatePain(id); else ctx.actions.setActivePain(id);
      } else if (e.key === 'F2' && !state.explain) { e.preventDefault(); startRename(el, id, ctx); }
    });
    chip.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      startRename(el, id, ctx);
    });
  });

  el.querySelectorAll('[data-style]').forEach(btn => btn.addEventListener('click', () => {
    openStyleFor = openStyleFor === btn.dataset.style ? null : btn.dataset.style;
    renderPainBar(el, ctx);
  }));
  el.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => ctx.actions.deletePain(btn.dataset.del)));

  const pop = el.querySelector('.style-pop');
  if (pop) {
    pop.addEventListener('click', e => {
      const c = e.target.closest('[data-color]');
      const p = e.target.closest('[data-pattern]');
      if (c) ctx.actions.setPainStyle(openStyleFor, { color: c.dataset.color });
      else if (p) ctx.actions.setPainStyle(openStyleFor, { pattern: p.dataset.pattern });
    });
    pop.querySelector('button')?.focus();
  }
}

export function closeStylePopover() {
  openStyleFor = null;
}

// Rename in place: the chip's label becomes an input, so naming a pain is one
// click on the thing you are naming rather than a trip to a pencil icon.
export function startRename(el, id, ctx) {
  const label = el.querySelector(`[data-name="${id}"]`);
  const group = activeEpisode()?.groups.find(g => g.id === id);
  if (!label || !group) return;
  const input = document.createElement('input');
  input.className = 'pain-rename';
  input.value = group.name;
  input.maxLength = 60;
  input.size = Math.max(6, group.name.length);
  input.setAttribute('aria-label', 'Name this pain');
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = save => {
    if (done) return;
    done = true;
    ctx.actions.renamePain(id, save ? input.value : group.name);
  };
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
}
