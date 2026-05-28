if (!provider || !metaProvider) throw new Error('Run step 1 first.');

cells = [];
rows = [];
showProgress(cells);

const stream = provider.streamCells({
  strategy: createObserverShellStrategy(),
  view: {
    observerPc: { x: 0, y: 0, z: 0 },
    limitingMagnitude: 6.5,
  },
  attributes: ['position', 'magAbs', 'teffLog8', 'objectRef'],
});

for await (const delta of stream) {
  if (delta.type === 'stars/cells-upsert') {
    cells.push(...delta.cells);
    showProgress(cells);
    continue;
  }

  if (delta.type === 'stars/error') {
    throw new Error(delta.error?.message ?? 'Provider stream failed.');
  }

  if (delta.type === 'stars/current') {
    break;
  }
}

rows = rowsFromCells(cells)
  // Familiar naked-eye stars are much more likely to have real names.
  // Keep only rows with public refs, because refs are what sidecars use for lookup.
  .filter((row) => row.ref)
  // Compute Sun-view distance and apparent magnitude from position plus absolute magnitude.
  .map((row) => {
    const distancePc = Math.hypot(row.xPc, row.yPc, row.zPc);
    const apparentMagnitude = distancePc > 0
      ? row.magAbs + 5 * Math.log10(distancePc / 10)
      : Number.POSITIVE_INFINITY;
    return { ...row, distancePc, apparentMagnitude };
  })
  // Drop malformed rows before sorting.
  .filter((row) => Number.isFinite(row.apparentMagnitude))
  // Lower apparent magnitude means brighter as seen from the Sun.
  // This is a visible-star example, not a true nearest-star query.
  .sort((left, right) => (
    left.apparentMagnitude - right.apparentMagnitude ||
    left.distancePc - right.distancePc
  ))
  // Keep enough candidates for metadata lookup without making the table noisy.
  .slice(0, 40);

renderTable(rows, [
  { key: 'rowNumber', label: '#' },
  { key: 'cellKey', label: 'cell key' },
  { key: 'ordinal', label: 'ordinal' },
  { key: 'apparentMagnitude', label: 'apparent mag', format: (value) => Number.isFinite(value) ? value.toFixed(2) : '' },
  { key: 'distancePc', label: 'distance pc', format: (value) => Number.isFinite(value) ? value.toFixed(2) : '' },
  { key: 'magAbs', label: 'absolute magnitude', format: (value) => Number.isFinite(value) ? value.toFixed(2) : '' },
  { key: 'temperatureK', label: 'temperature K', format: (value) => Number.isFinite(value) ? `${Math.round(value).toLocaleString()} K` : '' },
]);

return `Ready to look up metadata for ${rows.length} bright Sun-view star refs.`;
