if (!metaProvider) throw new Error('Run step 1 first.');
if (!rows.length) throw new Error('Run step 2 first.');

const candidates = rows.filter((row) => row.ref);
if (!candidates.length) throw new Error('No StarObjectRef was found in the streamed rows.');

let star = null;
let entry = null;
let cellEntries = null;

for (const candidate of candidates) {
  const candidateEntry = await metaProvider.getMeta(candidate.ref);
  const candidateCellEntries = await metaProvider.getMetaCell({
    datasetId: candidate.ref.datasetId,
    level: candidate.ref.level,
    mortonCode: candidate.ref.mortonCode,
  });
  const candidateCellEntry = candidateCellEntries?.[candidate.ref.ordinal] ?? null;
  const namedEntry = hasHumanReadableName(candidateEntry)
    ? candidateEntry
    : hasHumanReadableName(candidateCellEntry)
      ? candidateCellEntry
      : null;

  // Do not stop at any sidecar entry. For this lesson, keep walking the bright
  // candidates until the selected star has a human-readable name or designation.
  if (namedEntry) {
    star = candidate;
    entry = namedEntry;
    cellEntries = candidateCellEntries;
    break;
  }
}

if (!star) {
  throw new Error('No named metadata rows were found for the bright Sun-view stars.');
}

const fallback = `cell ${star.cellKey} / ${star.ordinal}`;
const label = formatLabel(entry, fallback);

const namedCellRows = (cellEntries ?? [])
  .map((meta, ordinal) => ({
    ordinal,
    selected: ordinal === star.ordinal,
    hasMetadata: Boolean(meta),
    hasName: hasHumanReadableName(meta),
    label: formatLabel(meta, `cell ${star.cellKey} / ${ordinal}`),
    nameSource: nameSource(meta),
    properName: meta?.proper_name ?? '',
    bayer: meta?.bayer ?? '',
    flamsteed: meta?.flamsteed ?? '',
    hd: meta?.hd ?? '',
    hip: meta?.hip_id ?? '',
    gaia: meta?.gaia_source_id ?? '',
  }))
  .filter((row) => row.hasMetadata && row.hasName)
  .sort((left, right) => (
    Number(right.selected) - Number(left.selected) ||
    nameSourceRank(left.nameSource) - nameSourceRank(right.nameSource) ||
    left.ordinal - right.ordinal
  ));

metadataRows = namedCellRows.length > 0
  ? namedCellRows.slice(0, 20)
  : [{
    ordinal: star.ordinal,
    selected: true,
    hasMetadata: true,
    hasName: true,
    label,
    nameSource: nameSource(entry),
    properName: entry?.proper_name ?? '',
    bayer: entry?.bayer ?? '',
    flamsteed: entry?.flamsteed ?? '',
    hd: entry?.hd ?? '',
    hip: entry?.hip_id ?? '',
    gaia: entry?.gaia_source_id ?? '',
  }];

renderTable(metadataRows, [
  { key: 'ordinal', label: 'ordinal' },
  { key: 'label', label: 'label' },
  { key: 'selected', label: 'selected', format: (value) => value ? 'yes' : '' },
  { key: 'nameSource', label: 'name source' },
  { key: 'properName', label: 'proper name' },
  { key: 'bayer', label: 'Bayer' },
  { key: 'flamsteed', label: 'Flamsteed' },
  { key: 'hd', label: 'HD' },
  { key: 'hip', label: 'HIP' },
  { key: 'gaia', label: 'Gaia source id' },
]);

return {
  selectedStar: fallback,
  selectedLabel: label,
  selectedNameSource: nameSource(entry),
  cellMetadataRows: cellEntries?.length ?? 0,
  namedRowsShown: metadataRows.length,
};

function hasHumanReadableName(meta) {
  return Boolean(meta?.proper_name || meta?.bayer || meta?.flamsteed);
}

function nameSource(meta) {
  if (meta?.proper_name) return 'proper name';
  if (meta?.bayer) return 'Bayer';
  if (meta?.flamsteed) return 'Flamsteed';
  return '';
}

function nameSourceRank(source) {
  if (source === 'proper name') return 0;
  if (source === 'Bayer') return 1;
  if (source === 'Flamsteed') return 2;
  return 3;
}
