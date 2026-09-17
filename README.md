# Found in Space — Website

Part of [Found in Space](https://foundin.space/), a project that starts with open astronomical measurements and turns them into interactive 3D views people can explore, question, and build on. See all repositories at [github.com/Found-in-Space](https://github.com/Found-in-Space).

This repository is the public-facing website at [foundin.space](https://foundin.space), built with [Astro](https://astro.build/) and hosted on GitHub Pages.

## Site structure

The site is organised around four main routes:

- **Explore** — guided interactive experiences built from catalogue measurements and derived distances. Fly through the solar neighbourhood, feel parallax by moving the observer, and see the depth hiding behind familiar constellations. No prior knowledge needed.
- **Teach** — ready-to-use visualisations, classroom prompts, and inquiry projects that ask what the evidence shows, what remains uncertain, and how a representation shapes what students notice.
- **Learn & Build** — structured lessons, starter data, live coding guides, and routes into the open pipeline for students and curious builders who want to make a chart, visualisation, investigation, or game.
- **About** — the project's educational purpose, open methods, broader direction, and the person behind it.

## Development

```sh
npm install
npm test
npm run dev
```

Astro's dev server will start at `http://localhost:4321/` (or the next available port).

Camera changes and SkyKit upgrades must preserve the
[interactive transition contract](docs/camera-transitions.md). Run `npm test`
and `npm run build` before submitting them. Pull requests and Pages deployment
run the regression checks against the installed runtime.

### Local SkyKit alpha packages

The live site should use released `@found-in-space/*` packages from
`package.json`. Do not deploy with a local package override.

For local development against unreleased alpha package sources, you can point
the Astro dev server at sibling SkyKit and touch-os projects:

```sh
SKYKIT_LOCAL_PATH=../skykit TOUCH_OS_LOCAL_PATH=../touch-os npm run dev
```

With those variables set, `astro.config.mjs` resolves normal package imports
such as `@found-in-space/skykit`, `@found-in-space/skykit/parallax`,
`@found-in-space/star-octree-provider`, and `@found-in-space/three-star-field`
to local workspace source, and `@found-in-space/touch-os` to the sibling
package build.
Page code should still import public package names, not relative paths into
sibling repositories, so it can switch back to released packages once those
versions are published.

The parallax and free-roam pages use
`@found-in-space/stellarium-skycultures-western@0.3.0` from `package.json`
because they need the generated `./anchored-image` subpath. Set
`SKYCULTURES_LOCAL_PATH=../stellarium-skycultures` only when testing local
unreleased skyculture package changes.
