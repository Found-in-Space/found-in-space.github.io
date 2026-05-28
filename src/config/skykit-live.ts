export const SKYKIT_LIVE_VERSION = '0.2.0';
export const STAR_OCTREE_PROVIDER_VERSION = '0.2.0';
export const STAR_TREES_VERSION = '0.2.0';
export const META_SIDECAR_PROVIDER_VERSION = '0.2.0';
export const THREE_VERSION = '0.170.0';

export const SKYKIT_BROWSER_ESM_BASE = 'https://esm.sh/';

export function applySkykitLiveVersions(source: string) {
	return source
		.replaceAll('__SKYKIT_BROWSER_ESM_BASE__', SKYKIT_BROWSER_ESM_BASE)
		.replaceAll('__SKYKIT_LIVE_VERSION__', SKYKIT_LIVE_VERSION)
		.replaceAll('__STAR_OCTREE_PROVIDER_VERSION__', STAR_OCTREE_PROVIDER_VERSION)
		.replaceAll('__STAR_TREES_VERSION__', STAR_TREES_VERSION)
		.replaceAll('__META_SIDECAR_PROVIDER_VERSION__', META_SIDECAR_PROVIDER_VERSION)
		.replaceAll('__THREE_VERSION__', THREE_VERSION);
}
