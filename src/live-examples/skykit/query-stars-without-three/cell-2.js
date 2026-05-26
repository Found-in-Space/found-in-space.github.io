if (!provider) throw new Error('Run cell 1 first.');

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
  console.log(delta.type);

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

return summarizeCells(cells);
