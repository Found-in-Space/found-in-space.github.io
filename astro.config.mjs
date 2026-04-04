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
const resolvedSkykitRoot = skykitLocalPathEnv
	? (isAbsolute(skykitLocalPathEnv)
		? skykitLocalPathEnv
		: resolve(projectRoot, skykitLocalPathEnv))
	: null;
const resolvedSkykitEntry = resolvedSkykitRoot
	? resolve(resolvedSkykitRoot, 'src/index.js')
	: null;
const useLocalSkykit = resolvedSkykitEntry != null && existsSync(resolvedSkykitEntry);
const fsAllow = [projectRoot, ...(useLocalSkykit ? [resolvedSkykitRoot] : [])];

if (skykitLocalPathEnv) {
	if (useLocalSkykit) {
		console.warn(`[astro] Using local skykit override from SKYKIT_LOCAL_PATH: ${resolvedSkykitRoot}`);
	} else {
		console.warn(
			`[astro] SKYKIT_LOCAL_PATH was set to "${skykitLocalPathEnv}", but "${resolvedSkykitEntry}" was not found. Falling back to installed @found-in-space/skykit.`,
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
		resolve: useLocalSkykit
			? {
				alias: {
					'@found-in-space/skykit': resolvedSkykitEntry,
				},
			}
			: undefined,
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
