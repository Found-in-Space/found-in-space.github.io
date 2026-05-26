provider?.dispose?.();

provider = createStarOctreeProviderService({
  id: 'learn-skykit-star-query',
  url: OCTREE_DEFAULT,
});

const bootstrap = await provider.ensureBootstrap?.();
datasetId = bootstrap?.datasetId ?? provider.describe().datasetId ?? null;

return provider.describe();
