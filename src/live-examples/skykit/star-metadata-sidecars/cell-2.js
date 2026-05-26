if (!provider || !metaProvider) throw new Error('Run cell 1 first.');

cells = [];
rows = [];
showProgress(cells);

const stream = provider.streamCells({
  strategy: createObserverShellStrategy(),
  view: {
    observerPc: { x: 0, y: 0, z: 0 },
    limitingMagnitude: 5.5,
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
  .filter((row) => row.ref)
  .sort((left, right) => left.magAbs - right.magAbs)
  .slice(0, 20);

renderTable(rows);

return `Ready to look up metadata for ${rows.length} visible star refs.`;
