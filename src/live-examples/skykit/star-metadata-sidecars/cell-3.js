if (!metaProvider) throw new Error('Run cell 1 first.');
if (!rows.length) throw new Error('Run cell 2 first.');

const star = rows.find((row) => row.ref);
if (!star) throw new Error('No StarObjectRef was found in the streamed rows.');

const fallback = `cell ${star.cellKey} / ${star.ordinal}`;
const entry = await metaProvider.getMeta(star.ref);
const label = formatLabel(entry, fallback);
const cellEntries = await metaProvider.getMetaCell({
  datasetId: star.ref.datasetId,
  level: star.ref.level,
  mortonCode: star.ref.mortonCode,
});

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
