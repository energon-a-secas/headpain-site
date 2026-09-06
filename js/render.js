// Render orchestrator — syncs the 3D view and re-renders every panel from state.

import { activeEpisode, activeGroup, isolatedGroup } from './state.js';
import { renderEditor, renderPointsList } from './editor.js';
import { renderPainBar } from './painbar.js';
import { renderMatches } from './panel-conditions.js';
import { renderEpisodes } from './panel-episodes.js';
import { renderExplain } from './panel-explain.js';
import { renderImpact } from './panel-impact.js';

export function renderAll(ctx) {
  const ep = activeEpisode();
  if (!ep) return;
  ctx.head.sync(ep.markers, ctx.state.selectedMarkerId, ctx.ui.hoverZoneId, ep.groups, ctx.state.isolateGroupId);
  renderPainBar(ctx.els.painBar, ctx);
  renderEditor(ctx.els.editor, ctx);
  renderPointsList(ctx.els.points, ctx.els.pointsCount, ctx);
  renderMatches(ctx.els.matches, ctx);
  renderEpisodes(ctx.els.episodes, ctx);
  renderImpact(ctx.els.impact, ctx);
  renderExplain(ctx.els.explain, ctx.els.stageLegend, ctx);

  const pain = activeGroup();
  const iso = isolatedGroup();
  ctx.els.stageHint.textContent = pain
    ? `Adding to “${pain.name}”: tap the head`
    : 'Tap the head to drop a pain point';
  ctx.els.stageHint.classList.toggle('dim', ep.markers.length > 0);

  // Isolate only means something once a second pain exists.
  const canIsolate = ep.groups.length > 1;
  ctx.els.btnIsolate.disabled = !canIsolate;
  ctx.els.btnIsolate.setAttribute('aria-pressed', String(Boolean(iso)));
  ctx.els.btnIsolate.textContent = iso ? `Only “${iso.name}”` : 'Isolate';
  ctx.els.btnIsolate.title = canIsolate
    ? 'Show the selected pain on its own (I)'
    : 'Add a second pain to isolate one of them';

  ctx.els.btnExplain.setAttribute('aria-pressed', String(ctx.state.explain));
  ctx.els.btnExplain.textContent = ctx.state.explain ? 'Back to editing' : 'Explain';

  document.title = `HeadPain | ${ep.title}`;
}
