// A layer can still say "current" while the provider is planning the next view.
// Require the provider's current demand and every pending work counter as well.
export function inspectReadiness(snapshot) {
  const stars = snapshot.parts.map(p => p.snapshot).filter(s => s?.session?.demand && s?.renderer);
  if (!stars.length) return { ready: false, reason: 'No streamed star layer' };
  const reports = stars.map(s => {
    const d = s.session.demand;
    if (s.lastError || s.session.lastError || s.status === 'failed' || d.status === 'failed') {
      throw new Error(JSON.stringify(s.lastError || s.session.lastError || d));
    }
    const revision = s.renderer.lastCurrentRevision;
    const currentDelivered = revision?.demandRevision === d.revision
      && revision?.viewRevision === s.session.view.revision;
    const sessionStarCount = s.session.cells.reduce((sum, cell) => sum + cell.starCount, 0);
    // HR restart retention emits cells-remove AFTER stars/current, leaving the
    // layer flag at streaming. Check delivered revision and renderer contents
    // against the provider, rather than rejecting a completed cleanup.
    const ready = currentDelivered && d.status === 'current'
      && d.activeWorkItemCount === 0 && d.inFlightCellCount === 0
      && d.currentCellCount >= d.desiredCellCount
      && s.renderer.cellCount === d.currentCellCount
      && s.renderer.starCount === sessionStarCount;
    return { ready, currentDelivered, renderedRevision: revision, sessionStarCount, id: s.id, status: s.status, demand: d,
      sessionViewRevision: s.session.view.revision,
      starCount: s.renderer.starCount, cellCount: s.renderer.cellCount };
  });
  return { ready: reports.every(r => r.ready), stars: reports };
}


export async function waitForStarsReady(viewer, { timeoutMs = 180000, pollMs = 20 } = {}) {
  const started = performance.now();
  const initialView = JSON.stringify(viewer.getViewState?.());
  let stable = 0, readiness, previousKey = '';
  while (performance.now() - started < timeoutMs) {
    // Rendering refreshes GPU buffers and the HR surface, without advancing
    // navigation or triggering the radio camera's zero-delta update behavior.
    viewer.render();
    readiness = inspectReadiness(viewer.getSnapshot());
    const key = JSON.stringify(readiness.stars?.map(s => [s.sessionViewRevision, s.demand.revision, s.starCount]));
    stable = readiness.ready && key === previousKey ? stable + 1 : 0;
    previousKey = key;
    if (stable >= 2) {
      if (JSON.stringify(viewer.getViewState?.()) !== initialView) {
        throw new Error('Camera state changed while waiting for star loading');
      }
      return { readiness, waitMs: performance.now() - started };
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error(`Stars not ready after ${timeoutMs}ms: ${JSON.stringify(readiness)}`);
}
