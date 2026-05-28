// This notebook step depends on the provider object created by step 1.
if (!provider) throw new Error('Run step 1 first.');

// Start this run with an empty list of streamed star cells.
cells = [];

// Clear any rows rendered by a previous run of step 3.
rows = [];

// Update the notebook summary immediately so the user sees the reset state.
showProgress(cells);

// Ask the provider for the star cells needed by one view of the sky.
const stream = provider.streamCells({
  // The observer-shell strategy loads octree cells around the observer position.
  strategy: createObserverShellStrategy(),
  // The view describes where the observer is and how faint the query should go.
  view: {
    // Start at the Sun, measured in parsecs in the same coordinate frame as the data.
    observerPc: { x: 0, y: 0, z: 0 },
    // Keep only stars bright enough for a compact lesson-sized result.
    limitingMagnitude: 6.5,
  },
  // Request only the star attributes this notebook needs to build table rows.
  attributes: ['position', 'magAbs', 'teffLog8', 'objectRef'],
});

// streamCells returns an async iterator, so each delta arrives as the provider works.
for await (const delta of stream) {
  // Log the delta type so the step output shows the provider lifecycle.
  console.log(delta.type);

  // Upsert deltas carry new or replacement star cells.
  if (delta.type === 'stars/cells-upsert') {
    // Append the streamed star cells to notebook state.
    cells.push(...delta.cells);
    // Refresh the live summary after each batch.
    showProgress(cells);
    // This delta is handled, so move on to the next provider message.
    continue;
  }

  // Error deltas mean the provider could not finish the stream.
  if (delta.type === 'stars/error') {
    // Surface the provider's message when it exists; otherwise use a lesson-friendly fallback.
    throw new Error(delta.error?.message ?? 'Provider stream failed.');
  }

  // The current delta means the provider has reached a complete result for this view.
  if (delta.type === 'stars/current') {
    // Stop reading once the first complete result is available.
    break;
  }
}

// Return the same summary object that appears above the table.
return summarizeCells(cells);
