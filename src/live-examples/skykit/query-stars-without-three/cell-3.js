// This notebook step needs the streamed star cells collected by step 2.
if (!cells.length) throw new Error('Run step 2 first.');

// Convert streamed star cells into app-owned row objects, then choose what to display.
rows = rowsFromCells(cells)
  // Keep rows whose packed temperature value decoded into a finite Kelvin value.
  .filter((row) => Number.isFinite(row.temperatureK))
  // Absolute magnitude is lower for brighter stars, so this puts bright stars first.
  .sort((left, right) => left.magAbs - right.magAbs)
  // Keep the table readable by showing only the first forty rows.
  .slice(0, 40);

// Draw the selected rows into the notebook's table.
renderTable(rows);

// Return a short sentence so the step output records what happened.
return `Rendered ${rows.length} app-owned rows from ${cells.length} streamed star cells.`;
