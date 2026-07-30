// Render orchestrator — syncs the 3D view and re-renders every panel from state.

import { activeEpisode } from './state.js';
import { renderEditor, renderPointsList } from './editor.js';
import { renderMatches } from './panel-conditions.js';
import { renderEpisodes } from './panel-episodes.js';

export function renderAll(ctx) {
  const ep = activeEpisode();
  if (!ep) return;
  ctx.head.sync(ep.markers, ctx.state.selectedMarkerId, ctx.ui.hoverZoneId);
  renderEditor(ctx.els.editor, ctx);
  renderPointsList(ctx.els.points, ctx.els.pointsCount, ctx);
  renderMatches(ctx.els.matches, ctx);
  renderEpisodes(ctx.els.episodes, ctx);

  const hasMarkers = ep.markers.length > 0;
  ctx.els.stageHint.textContent = hasMarkers
    ? 'Tap the head to add another point'
    : 'Tap the head to drop a pain point';
  ctx.els.stageHint.classList.toggle('dim', hasMarkers);
  document.title = `HeadMap | ${ep.title}`;
}
