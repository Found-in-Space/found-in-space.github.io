// This notebook keeps variables between step runs, so an older provider may still exist.
// The first ?. means "only continue if provider is not null or undefined".
// The second ?. means "only call dispose if this provider exposes a dispose method".
// Calling dispose before replacing the provider prevents duplicate streams and caches.
provider?.dispose?.();

// Create a data provider. This is the data-only equivalent of the viewer's star source.
provider = createStarOctreeProviderService({
  // Give the provider a stable id so diagnostics can identify this lesson instance.
  id: 'learn-skykit-star-query',
  // Use the public default render octree published by the data package.
  url: OCTREE_DEFAULT,
});

// Some provider versions need an explicit bootstrap step before metadata is complete.
const bootstrap = await provider.ensureBootstrap?.();

// Store the dataset id in notebook state so the summary panel can show it later.
datasetId = bootstrap?.datasetId ?? provider.describe().datasetId ?? null;

// Return a small provider description so the step output confirms what opened.
return provider.describe();
