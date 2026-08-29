// Map tab — selected-point editor, points list, groups list, and the zone browser.

import { DEPTHS, QUALITIES, SPREADS, ZONE_GROUPS, intensityBand, depthById, qualityById } from './zones.js';
import { escHtml, intensityColor } from './utils.js';
import { selectedMarker, activeEpisode } from './state.js';
import { groupById, markerColor } from './groups.js';
import { guidanceFor, ROOT_CAUSE_NOTE } from './guidance.js';

function guidanceHtml(intensity) {
  const g = guidanceFor(intensity);
  if (!g) return '';
  return `
    <div class="guidance-card ${g.severe ? 'guidance-card--severe' : ''}">
      <div class="guidance-title">${escHtml(g.title)}</div>
      <ul>${g.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>
      ${g.severe ? `<p class="guidance-root">${escHtml(ROOT_CAUSE_NOTE)}</p>` : ''}
    </div>`;
}

export function renderEditor(el, ctx) {
  const marker = selectedMarker();
  if (!marker) {
    el.innerHTML = `
      <div class="empty-note">
        Tap the head to drop a pain point.<br>
        <span class="muted">Or use <strong>Add by zone name</strong> below, handy for the neck and back of the head.</span>
      </div>`;
    return;
  }

  const ep = activeEpisode();
  const zone = ctx.registry.zoneById(marker.zoneId);
  const band = intensityBand(marker.intensity);
  const depth = depthById(marker.depth);
  const color = markerColor(ep, marker);

  el.innerHTML = `
    <div class="editor-card">
      <div class="editor-head">
        <div class="editor-zone">
          <span class="dot" style="background:${color};color:${color}"></span>
          <span>${escHtml(zone?.label || 'Free point')}</span>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-act="done">Done</button>
      </div>
      ${zone?.desc ? `<p class="editor-desc">${escHtml(zone.desc)}</p>` : ''}

      <div class="field">
        <div class="field-label">
          <span>Intensity</span>
          <span class="field-value" data-ref="readout">${marker.intensity}, ${band.label}</span>
        </div>
        <input type="range" min="0" max="10" step="1" value="${marker.intensity}"
               data-ref="intensity" aria-label="Pain intensity from 0 to 10">
        <div class="field-desc">${escHtml(band.desc)}</div>
        <div data-ref="guidance">${guidanceHtml(marker.intensity)}</div>
      </div>

      <div class="field">
        <div class="field-label"><span>How deep does it feel?</span></div>
        <div class="chip-row" data-ref="depths">
          ${DEPTHS.map(d => `<button type="button" class="chip ${d.id === marker.depth ? 'active' : ''}"
            data-depth="${d.id}">${d.short}</button>`).join('')}
        </div>
        <div class="field-desc" data-ref="depth-desc">${escHtml(depth.desc)}</div>
      </div>

      <div class="field">
        <div class="field-label"><span>What does it feel like?</span></div>
        <div class="chip-row" data-ref="qualities">
          ${QUALITIES.map(q => `<button type="button" class="chip ${q.id === marker.quality ? 'active' : ''}"
            data-quality="${q.id}" title="${escHtml(q.desc)}">${q.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <div class="field-label"><span>How wide does it spread?</span></div>
        <div class="chip-row" data-ref="spreads">
          ${SPREADS.map(s => `<button type="button" class="chip ${s.id === marker.spread ? 'active' : ''}"
            data-spread="${s.id}" title="${escHtml(s.desc)}">${s.label}</button>`).join('')}
        </div>
      </div>

      ${ep.groups.length ? `
      <div class="field">
        <div class="field-label"><span>Group</span></div>
        <div class="chip-row" data-ref="groups">
          <button type="button" class="chip ${!marker.groupId ? 'active' : ''}" data-group="">None</button>
          ${ep.groups.map(g => `<button type="button" class="chip chip--group ${g.id === marker.groupId ? 'active' : ''}"
            data-group="${g.id}"><span class="dot dot--sm" style="background:${g.color};color:${g.color}"></span>${escHtml(g.name)}</button>`).join('')}
        </div>
      </div>` : ''}

      <div class="field">
        <div class="field-label"><span>Notes</span><span class="note-counter" data-ref="counter">${marker.note.length}/500</span></div>
        <textarea class="note-input" data-ref="note" maxlength="500"
          placeholder="Triggers, timing, what helped…">${escHtml(marker.note)}</textarea>
      </div>

      <div class="editor-actions">
        <button type="button" class="btn btn--danger" data-act="delete">Delete point</button>
      </div>
    </div>`;

  const ref = name => el.querySelector(`[data-ref="${name}"]`);
  const dot = el.querySelector('.dot');

  ref('intensity').addEventListener('input', e => {
    const v = +e.target.value;
    ctx.actions.updateSelected({ intensity: v }, { render: false });
    const b = intensityBand(v);
    ref('readout').textContent = `${v}: ${b.label}`;
    const c = groupById(activeEpisode(), marker.groupId)?.color || intensityColor(v);
    dot.style.background = c;
    dot.style.color = c;
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
  el.querySelector('[data-act="delete"]').addEventListener('click', () => ctx.actions.deletePoint(marker.id));
}

export function renderPointsList(el, countEl, ctx) {
  const ep = activeEpisode();
  const markers = ep?.markers || [];
  countEl.textContent = markers.length;

  if (!markers.length) {
    el.innerHTML = '<div class="empty-note">No points yet in this episode.</div>';
    return;
  }

  el.innerHTML = markers.map(m => {
    const zone = ctx.registry.zoneById(m.zoneId);
    const band = intensityBand(m.intensity);
    const q = qualityById(m.quality);
    const color = markerColor(ep, m);
    const group = groupById(ep, m.groupId);
    const meta = [group?.name, band.label, depthById(m.depth).short, q?.label, m.note ? '📝' : '']
      .filter(Boolean).join(' · ');
    return `
      <div class="point-row ${m.id === ctx.state.selectedMarkerId ? 'selected' : ''}" data-id="${m.id}"
           role="button" tabindex="0">
        <span class="dot" style="background:${color};color:${color}"></span>
        <div class="point-main">
          <div class="point-title">${escHtml(zone?.label || 'Free point')}</div>
          <div class="point-meta">${escHtml(meta)}</div>
        </div>
        <button type="button" class="point-del" data-del="${m.id}" aria-label="Delete point">×</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.point-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-del]')) return;
      ctx.actions.selectPoint(row.dataset.id);
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.actions.selectPoint(row.dataset.id); }
    });
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.deletePoint(btn.dataset.del));
  });
}

export function renderGroups(el, countEl, ctx) {
  const ep = activeEpisode();
  const groups = ep?.groups || [];
  countEl.textContent = groups.length;

  if (!groups.length) {
    el.innerHTML = `<div class="empty-note">
      One group per pain type: e.g. <em>migraine</em> vs <em>sinus</em>.<br>
      <span class="muted">Each group gets its own color on the head; click one to focus it.</span>
    </div>`;
    return;
  }

  el.innerHTML = groups.map(g => {
    const count = ep.markers.filter(m => m.groupId === g.id).length;
    const active = g.id === ctx.state.activeGroupId;
    return `
      <div class="group-row ${active ? 'active' : ''}" data-id="${g.id}" role="button" tabindex="0"
           title="${active ? 'Focused: click to release' : 'Click to focus this group'}">
        <button type="button" class="group-swatch" data-swatch="${g.id}"
          style="background:${g.color};color:${g.color}"
          title="Cycle color" aria-label="Cycle color for ${escHtml(g.name)}"></button>
        <div class="point-main">
          <div class="point-title" data-title="${g.id}">${escHtml(g.name)}</div>
          <div class="point-meta">${count} point${count === 1 ? '' : 's'}${active ? ' · adding points here' : ''}</div>
        </div>
        <button type="button" class="point-del" data-rename="${g.id}" aria-label="Rename group">✎</button>
        <button type="button" class="point-del" data-del="${g.id}" aria-label="Delete group">×</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.group-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      ctx.actions.toggleGroupFocus(row.dataset.id);
    });
    row.addEventListener('keydown', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.actions.toggleGroupFocus(row.dataset.id); }
    });
  });
  el.querySelectorAll('[data-swatch]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.cycleGroupColor(btn.dataset.swatch));
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => ctx.actions.deleteGroup(btn.dataset.del));
  });
  el.querySelectorAll('[data-rename]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.rename;
      const title = el.querySelector(`[data-title="${id}"]`);
      const group = groups.find(g => g.id === id);
      if (!title || !group) return;
      const input = document.createElement('input');
      input.className = 'group-rename';
      input.value = group.name;
      input.maxLength = 60;
      input.setAttribute('aria-label', 'Group name');
      title.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const commit = save => {
        if (done) return;
        done = true;
        ctx.actions.renameGroup(id, save ? input.value : group.name);
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(true); }
        else if (e.key === 'Escape') { commit(false); }
      });
      input.addEventListener('blur', () => commit(true));
    });
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
