provider?.dispose?.();
metaProvider?.dispose?.();

provider = createStarOctreeProviderService({
  id: 'learn-skykit-sidecar-render',
  url: OCTREE_DEFAULT,
});

const bootstrap = await provider.ensureBootstrap();
if (!bootstrap.datasetId) {
  throw new Error('This render octree did not report a dataset id.');
}

datasetId = bootstrap.datasetId;
const metaUrl = deriveMetaSidecarUrlFromRenderUrl(OCTREE_DEFAULT);
metaProvider = createMetaSidecarProviderService({
  id: 'learn-skykit-sidecar-meta',
  parentDatasetId: datasetId,
  url: metaUrl,
});

renderKeyValue({
  datasetId,
  renderUrl: OCTREE_DEFAULT,
  metaSidecarUrl: metaUrl,
});

return metaProvider.describe();
