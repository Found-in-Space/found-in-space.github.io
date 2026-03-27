// @ts-check
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

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site,
	base,
});
