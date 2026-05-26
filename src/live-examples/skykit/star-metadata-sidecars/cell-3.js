if (!metaProvider) throw new Error('Run cell 1 first.');
if (!rows.length) throw new Error('Run cell 2 first.');

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

  if (candidateEntry || candidateCellEntries?.some(Boolean)) {
    star = candidate;
    entry = candidateEntry;
    cellEntries = candidateCellEntries;
    break;
  }
}

if (!star) {
  throw new Error('No metadata rows were found for the streamed visible stars.');
}

const fallback = `cell ${star.cellKey} / ${star.ordinal}`;
const label = formatLabel(entry, fallback);

metadataRows = (cellEntries ?? [])
  .map((meta, ordinal) => ({
    ordinal,
    label: formatLabel(meta, `cell ${star.cellKey} / ${ordinal}`),
    properName: meta?.proper_name ?? '',
    bayer: meta?.bayer ?? '',
    flamsteed: meta?.flamsteed ?? '',
    hd: meta?.hd ?? '',
    hip: meta?.hip_id ?? '',
    gaia: meta?.gaia_source_id ?? '',
  }))
  .filter((row) => row.label)
  .slice(0, 20);

renderTable(metadataRows, [
  { key: 'ordinal', label: 'ordinal' },
  { key: 'label', label: 'label' },
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
  cellMetadataRows: cellEntries?.length ?? 0,
};
