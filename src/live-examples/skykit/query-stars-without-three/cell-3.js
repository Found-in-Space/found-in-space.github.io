if (!cells.length) throw new Error('Run cell 2 first.');

rows = rowsFromCells(cells)
  .filter((row) => Number.isFinite(row.temperatureK))
  .sort((left, right) => left.magAbs - right.magAbs)
  .slice(0, 40);

renderTable(rows);

return `Rendered ${rows.length} app-owned rows from ${cells.length} streamed cells.`;
