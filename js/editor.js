// Map tab — selected-point editor, points list, and the zone browser.
// The pains themselves live in the pain bar above the head (painbar.js).

import { DEPTHS, QUALITIES, SPREADS, ZONE_GROUPS, intensityBand, depthById, qualityById } from './zones.js';
import { escHtml } from './utils.js';
import { selectedMarker, activeEpisode } from './state.js';
import { groupById, markerColor, markerPattern, paint } from './groups.js';
import { patternSvg } from './patterns.js';
import { guidanceFor, ROOT_CAUSE_NOTE } from './guidance.js';

function guidanceHtml(intensity) {
  const g = guidanceFor(intensity);
  if (!g) return '';
  return `
    <details class="guidance-card ${g.severe ? 'guidance-card--severe' : ''}" ${g.severe ? 'open' : ''}>
      <summary>${escHtml(g.title)}</summary>
      <ul>${g.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>
      ${g.severe ? `<p class="guidance-root">${escHtml(ROOT_CAUSE_NOTE)}</p>` : ''}
    </details>`;
}

export function renderEditor(el, ctx) {
  const marker = selectedMarker();
  if (!marker) {
    const hasPoints = activeEpisode()?.markers.length > 0;
    const areas = [
      ['temple-left', 'Left temple'], ['temple-right', 'Right temple'],
      ['forehead-upper-center', 'Forehead'], ['occipital-upper-center', 'Back of head'],
      ['neck-back-upper', 'Neck'], ['whole-head', 'Whole head']
    ].filter(([id]) => ctx.registry.zoneById(id));
    el.innerHTML = `
      <div class="welcome-note">
        <h2>${hasPoints ? 'Your pain, mapped.' : 'Where does it hurt?'}</h2>
        <p>${hasPoints
          ? 'Select a point below to adjust it, or tap the head to add another spot.'
          : 'Tap a spot on the head, or choose an area below. You can change every detail as you go.'}</p>
        ${hasPoints ? '' : `
        <ol class="welcome-steps">
          <li><span class="step-number" aria-hidden="true">1</span><div><strong>Mark the spot</strong><p>Rotate the head to reach any area.</p></div></li>
          <li><span class="step-number" aria-hidden="true">2</span><div><strong>Make it yours</strong><p>Add the intensity, depth, and feeling.</p></div></li>
          <li><span class="step-number" aria-hidden="true">3</span><div><strong>Keep it. Share it.</strong><p>Build your diary and show someone your map.</p></div></li>
        </ol>
        <div class="quick-areas-label"><h3>Start with an area</h3><span>Left and right are yours</span></div>
        <div class="quick-areas">${areas.map(([id, label]) => `<button type="button" data-quick-zone="${id}">${label}<span aria-hidden="true">+</span></button>`).join('')}</div>
        <p class="welcome-example">Want to see how it works? <button type="button" class="link-btn" data-example>Explore an example</button></p>`}
      </div>`;
    el.querySelectorAll('[data-quick-zone]').forEach(btn => {
      btn.addEventListener('click', () => ctx.actions.addPointForZone(btn.dataset.quickZone));
    });
    el.querySelector('[data-example]')?.addEventListener('click', () => ctx.actions.learn('migraine-no-aura'));
    return;
  }

  const ep = activeEpisode();
  const zone = ctx.registry.zoneById(marker.zoneId);
  const band = intensityBand(marker.intensity);
  const depth = depthById(marker.depth);
  const color = markerColor(ep, marker);
  const pain = groupById(ep, marker.groupId);

  el.innerHTML = `
    <div class="editor-card">
      <div class="editor-head">
        <div class="editor-zone">
          <span class="swatch" data-ref="swatch">${patternSvg(markerPattern(ep, marker), color, 15)}</span>
          <span>${escHtml(zone?.label || 'Free point')}</span>
          ${pain ? `<span class="editor-pain">in ${escHtml(pain.name)}</span>` : ''}
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-act="done">Done</button>
      </div>
      ${zone?.desc ? `<p class="editor-desc">${escHtml(zone.desc)}</p>` : ''}

      <div class="field">
        <div class="field-label">
          <label for="pain-intensity">How much does it hurt?</label>
          <span class="field-value intensity-value" data-ref="readout">${marker.intensity}/10 · ${band.label}</span>
        </div>
        <input id="pain-intensity" type="range" min="0" max="10" step="1" value="${marker.intensity}"
               data-ref="intensity" aria-label="Pain intensity from 0 to 10" aria-valuetext="${marker.intensity} out of 10, ${band.label}" aria-describedby="intensity-description">
        <div class="range-endpoints" aria-hidden="true"><span>0 · No pain</span><span>10 · Worst imaginable</span></div>
        <div class="field-desc" id="intensity-description">${escHtml(band.desc)}</div>
        <div data-ref="guidance">${guidanceHtml(marker.intensity)}</div>
      </div>

      <div class="field">
        <div class="field-label"><span>How deep does it feel?</span></div>
        <div class="chip-row" data-ref="depths">
          ${DEPTHS.map(d => `<button type="button" class="chip ${d.id === marker.depth ? 'active' : ''}"
            data-depth="${d.id}" aria-pressed="${d.id === marker.depth}">${d.short}</button>`).join('')}
        </div>
        <div class="field-desc" data-ref="depth-desc">${escHtml(depth.desc)}</div>
      </div>

      <div class="field">
        <div class="field-label"><span>What does it feel like?</span></div>
        <div class="chip-row" data-ref="qualities">
          ${QUALITIES.map(q => `<button type="button" class="chip ${q.id === marker.quality ? 'active' : ''}"
            data-quality="${q.id}" aria-pressed="${q.id === marker.quality}" title="${escHtml(q.desc)}">${q.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <div class="field-label"><span>How wide does it spread?</span></div>
        <div class="chip-row" data-ref="spreads">
          ${SPREADS.map(s => `<button type="button" class="chip ${s.id === marker.spread ? 'active' : ''}"
            data-spread="${s.id}" aria-pressed="${s.id === marker.spread}" title="${escHtml(s.desc)}">${s.label}</button>`).join('')}
        </div>
      </div>

      ${ep.groups.length > 1 ? `
      <div class="field">
        <div class="field-label"><span>Which pain is this?</span></div>
        <div class="chip-row" data-ref="groups">
          ${ep.groups.map(g => `<button type="button" class="chip chip--group ${g.id === marker.groupId ? 'active' : ''}"
            data-group="${g.id}" aria-pressed="${g.id === marker.groupId}">${patternSvg(g.pattern, g.color, 13)}${escHtml(g.name)}</button>`).join('')}
        </div>
      </div>` : ''}

      <div class="field">
        <div class="field-label"><label for="point-note">Anything else? <span class="muted">(optional)</span></label><span class="note-counter" data-ref="counter">${marker.note.length}/500</span></div>
        <textarea id="point-note" class="note-input" data-ref="note" maxlength="500"
          placeholder="Triggers, timing, what helped…">${escHtml(marker.note)}</textarea>
      </div>

      <div class="editor-actions">
        <button type="button" class="btn btn--danger" data-act="delete">Delete point</button>
        <button type="button" class="btn btn--primary" data-act="finish">Done with this point</button>
      </div>
    </div>`;

  const ref = name => el.querySelector(`[data-ref="${name}"]`);

  ref('intensity').addEventListener('input', e => {
    const v = +e.target.value;
    ctx.actions.updateSelected({ intensity: v }, { render: false });
    const b = intensityBand(v);
    ref('readout').textContent = `${v}/10 · ${b.label}`;
    e.target.setAttribute('aria-valuetext', `${v} out of 10, ${b.label}`);
    el.querySelector('#intensity-description').textContent = b.desc;
    // Same grammar as the head: the pain keeps its hue, saturation tracks intensity.
    const c = paint(groupById(activeEpisode(), marker.groupId)?.color, v);
    const svg = ref('swatch').querySelector('svg');
    if (svg) { svg.style.color = c; svg.style.fill = c; }
    ref('guidance').innerHTML = guidanceHtml(v);
  });
  ref('intensity').addEventListener('change', () => ctx.actions.renderAll());

  ref('depths').addEventListener('click', e => {
    const btn = e.target.closest('[data-depth]');
    if (btn) ctx.actions.updateSelected({ depth: btn.dataset.depth });
  });
  ref('qualities').addEventListener('click', e => {
    const btn = e.target.closest('[data-quality]');
    if (!btn) return;
    const q = btn.dataset.quality;
    ctx.actions.updateSelected({ quality: q === marker.quality ? null : q });
  });
  ref('spreads').addEventListener('click', e => {
    const btn = e.target.closest('[data-spread]');
    if (btn) ctx.actions.updateSelected({ spread: btn.dataset.spread });
  });
  ref('groups')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-group]');
    if (btn) ctx.actions.updateSelected({ groupId: btn.dataset.group || null });
  });
  ref('note').addEventListener('input', e => {
    ref('counter').textContent = `${e.target.value.length}/500`;
    ctx.actions.updateSelected({ note: e.target.value }, { render: false, skipHead: true });
  });

  el.querySelector('[data-act="done"]').addEventListener('click', () => ctx.actions.selectPoint(null));
  el.querySelector('[data-act="finish"]').addEventListener('click', () => ctx.actions.selectPoint(null));
  el.querySelector('[data-act="delete"]').addEventListener('click', () => ctx.actions.deletePoint(marker.id));
}

export function renderPointsList(el, countEl, ctx) {
  const ep = activeEpisode();
  const markers = ep?.markers || [];
  countEl.textContent = markers.length;

  if (!markers.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = markers.map(m => {
    const zone = ctx.registry.zoneById(m.zoneId);
    const band = intensityBand(m.intensity);
    const q = qualityById(m.quality);
    const color = markerColor(ep, m);
    const group = groupById(ep, m.groupId);
    const meta = [group?.name, depthById(m.depth).short, q?.label, m.note ? 'Has a note' : '']
      .filter(Boolean).join(' · ');
    return `
      <div class="point-row ${m.id === ctx.state.selectedMarkerId ? 'selected' : ''}" data-id="${m.id}"
           role="group" aria-label="${escHtml(zone?.label || 'Free point')}">
        <button type="button" class="point-select" data-select-point="${m.id}" aria-label="Edit ${escHtml(zone?.label || 'Free point')}, ${m.intensity} out of 10, ${band.label}">
        <span class="swatch">${patternSvg(markerPattern(ep, m), color, 14)}</span>
        <span class="point-main">
          <span class="point-title">${escHtml(zone?.label || 'Free point')}</span>
          <span class="point-meta">${escHtml(meta)}</span>
        </span>
        <span class="point-level">${m.intensity}<span class="muted">/10</span></span>
        </button>
        <button type="button" class="point-del" data-del="${m.id}" aria-label="Delete ${escHtml(zone?.label || 'free point')}">×</button>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-select-point]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.selectPoint(btn.dataset.selectPoint));
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.deletePoint(btn.dataset.del));
  });
}

export function renderZoneBrowser(el, ctx) {
  const groups = Object.entries(ZONE_GROUPS).sort((a, b) => a[1].order - b[1].order);
  el.innerHTML = groups.map(([gid, g]) => {
    const zones = ctx.registry.zones.filter(z => z.group === gid);
    const virtuals = gid === 'whole' ? [ctx.registry.zoneById('whole-head')].filter(Boolean) : [];
    const all = [...zones, ...virtuals];
    if (!all.length) return '';
    return `
      <div class="zone-group">
        <div class="zone-group-name">${escHtml(g.label)}</div>
        <div class="zone-grid">
          ${all.map(z => `<button type="button" class="zone-btn" data-zone="${z.id}"
            title="${escHtml(z.desc || '')}">${escHtml(z.label)}</button>`).join('')}
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-zone]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.addPointForZone(btn.dataset.zone));
  });
}
