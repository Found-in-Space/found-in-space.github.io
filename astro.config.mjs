// @ts-check
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER ?? '';
const isUserSite = repository.endsWith('.github.io');
const base =
	process.env.BASE_PATH ??
	(isGitHubActions && repository && !isUserSite ? `/${repository}/` : '/');
const site =
	process.env.SITE_URL ??
	(isGitHubActions && repository && repositoryOwner
		? `https://${repositoryOwner}.github.io${isUserSite ? '/' : base}`
		: undefined);
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const skykitLocalPathEnv = process.env.SKYKIT_LOCAL_PATH?.trim() ?? '';
const skyculturesLocalPathEnv = process.env.SKYCULTURES_LOCAL_PATH?.trim() ?? '';
const resolvedSkykitRoot = skykitLocalPathEnv
	? (isAbsolute(skykitLocalPathEnv)
		? skykitLocalPathEnv
		: resolve(projectRoot, skykitLocalPathEnv))
	: null;
const resolvedSkyculturesRoot = skyculturesLocalPathEnv
	? (isAbsolute(skyculturesLocalPathEnv)
		? skyculturesLocalPathEnv
		: resolve(projectRoot, skyculturesLocalPathEnv))
	: null;
const skykitPackageAliases = resolvedSkykitRoot
	? createFoundInSpaceWorkspaceAliases(resolvedSkykitRoot)
	: [];
const skyculturePackageAliases = resolvedSkyculturesRoot
	? createSkyculturePackageAliases(resolvedSkyculturesRoot)
	: [];
const localPackageAliases = [...skykitPackageAliases, ...skyculturePackageAliases]
	.sort((a, b) => b.find.length - a.find.length);
const legacySkykitEntry = resolvedSkykitRoot
	? resolve(resolvedSkykitRoot, 'src/index.js')
	: null;
const useLocalSkykit = skykitPackageAliases.length > 0 || (legacySkykitEntry != null && existsSync(legacySkykitEntry));
const useLocalSkycultures = skyculturePackageAliases.length > 0;
const useLocalPackages = localPackageAliases.length > 0 || (legacySkykitEntry != null && existsSync(legacySkykitEntry));
const fsAllow = [
	projectRoot,
	...(useLocalSkykit ? [resolvedSkykitRoot] : []),
	...(useLocalSkycultures ? [resolvedSkyculturesRoot] : []),
];

if (skykitLocalPathEnv) {
	if (useLocalSkykit) {
		console.warn(`[astro] Using local skykit override from SKYKIT_LOCAL_PATH: ${resolvedSkykitRoot}`);
	} else {
		console.warn(
			`[astro] SKYKIT_LOCAL_PATH was set to "${skykitLocalPathEnv}", but no SkyKit workspace package source was found. Falling back to installed @found-in-space packages.`,
		);
	}
}
if (skyculturesLocalPathEnv) {
	if (useLocalSkycultures) {
		console.warn(`[astro] Using local skycultures override from SKYCULTURES_LOCAL_PATH: ${resolvedSkyculturesRoot}`);
	} else {
		console.warn(
			`[astro] SKYCULTURES_LOCAL_PATH was set to "${skyculturesLocalPathEnv}", but no skyculture package source was found. Falling back to installed @found-in-space packages.`,
		);
	}
}
// https://astro.build/config
export default defineConfig({
	output: 'static',
	site,
	base,
	server: {
		host: true,
	},
	vite: {
		resolve: useLocalPackages
			? {
				alias: localPackageAliases.length > 0
					? localPackageAliases
					: [{ find: '@found-in-space/skykit', replacement: legacySkykitEntry }],
			}
			: undefined,
		optimizeDeps: {
			exclude: [
				'@found-in-space/stellarium-skycultures-western',
				'@found-in-space/stellarium-skycultures-western/bundled',
			],
		},
		server: {
			host: true,
			fs: {
				allow: fsAllow,
			},
			// Local phone testing through tunnels can present many transient hostnames.
			// Keep this open in dev rather than chasing each forwarded hostname.
			allowedHosts: true,
		},
		preview: {
			host: true,
			allowedHosts: true,
		},
	},
});

function createSkyculturePackageAliases(workspaceRoot) {
	const packageEntries = [
		['@found-in-space/stellarium-skycultures-western/bundled', 'packages/stellarium-skycultures-western/src/bundled.js'],
		['@found-in-space/stellarium-skycultures-western', 'packages/stellarium-skycultures-western/src/index.js'],
	];

	return packageEntries
		.map(([find, relativePath]) => ({
			find,
			replacement: resolve(workspaceRoot, relativePath),
		}))
		.filter((entry) => existsSync(entry.replacement));
}

function createFoundInSpaceWorkspaceAliases(workspaceRoot) {
	const packageEntries = [
		['@found-in-space/anchored-image/three', 'packages/anchored-image/src/three.js'],
		['@found-in-space/anchored-image/canvas', 'packages/anchored-image/src/canvas.js'],
		['@found-in-space/anchored-image', 'packages/anchored-image/src/index.js'],
		['@found-in-space/hr-diagram/touch-os', 'packages/hr-diagram/src/touch-os.js'],
		['@found-in-space/hr-diagram', 'packages/hr-diagram/src/index.js'],
		['@found-in-space/journey-video/editor', 'packages/journey-video/src/editor.js'],
		['@found-in-space/journey-video/export/node', 'packages/journey-video/src/export-node.js'],
		['@found-in-space/journey-video/export', 'packages/journey-video/src/export.js'],
		['@found-in-space/journey-video', 'packages/journey-video/src/index.js'],
		['@found-in-space/journey', 'packages/journey/src/index.js'],
		['@found-in-space/meta-sidecar-provider', 'packages/meta-sidecar-provider/src/index.js'],
		['@found-in-space/product-stream', 'packages/product-stream/src/index.js'],
		['@found-in-space/skykit/parallax', 'packages/skykit/src/parallax.js'],
		['@found-in-space/skykit/xr', 'packages/skykit/src/xr.js'],
		['@found-in-space/skykit', 'packages/skykit/src/index.js'],
		['@found-in-space/spatial', 'packages/spatial/src/index.js'],
		['@found-in-space/star-map-canvas', 'packages/star-map-canvas/src/index.js'],
		['@found-in-space/star-octree-provider', 'packages/star-octree-provider/src/index.js'],
		['@found-in-space/star-products', 'packages/star-products/src/index.js'],
		['@found-in-space/three-star-field', 'packages/three-star-field/src/index.js'],
	];

	return packageEntries
		.map(([find, relativePath]) => ({
			find,
			replacement: resolve(workspaceRoot, relativePath),
		}))
		.filter((entry) => existsSync(entry.replacement))
		.sort((a, b) => b.find.length - a.find.length);
}
