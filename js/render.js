// Render orchestrator — syncs the 3D view and re-renders every panel from state.

import { activeEpisode, activeGroup } from './state.js';
import { renderEditor, renderPointsList, renderGroups } from './editor.js';
import { renderMatches } from './panel-conditions.js';
import { renderEpisodes } from './panel-episodes.js';

export function renderAll(ctx) {
  const ep = activeEpisode();
  if (!ep) return;
  ctx.head.sync(ep.markers, ctx.state.selectedMarkerId, ctx.ui.hoverZoneId, ep.groups, ctx.state.activeGroupId);
  renderEditor(ctx.els.editor, ctx);
  renderGroups(ctx.els.groups, ctx.els.groupsCount, ctx);
  renderPointsList(ctx.els.points, ctx.els.pointsCount, ctx);
  renderMatches(ctx.els.matches, ctx);
  renderEpisodes(ctx.els.episodes, ctx);

  const group = activeGroup();
  const hasMarkers = ep.markers.length > 0;
  ctx.els.stageHint.textContent = group
    ? `Adding to “${group.name}” — tap the head`
    : hasMarkers
      ? 'Tap the head to add another point'
      : 'Tap the head to drop a pain point';
  ctx.els.stageHint.classList.toggle('dim', hasMarkers && !group);
  document.title = `HeadPain | ${ep.title}`;
}
