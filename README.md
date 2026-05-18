# Found in Space — Website

Part of [Found in Space](https://foundin.space/), a project that turns real astronomical measurements into interactive explorations of the solar neighbourhood. See all repositories at [github.com/Found-in-Space](https://github.com/Found-in-Space).

This repository is the public-facing website at [foundin.space](https://foundin.space), built with [Astro](https://astro.build/) and hosted on GitHub Pages.

## Site structure

The site is organised around four main sections:

- **Explore** — guided interactive experiences using real Gaia data. Fly through the solar neighbourhood, feel parallax by moving the observer, and see the depth hiding behind familiar constellations. No prior knowledge needed.
- **Learn** — structured lessons built on the 3D viewer and real measurements. The first lesson covers the Hertzsprung–Russell diagram. A **Next Steps** subsection poses open research questions for students — starting points for genuine investigation, not exercises with known answers.
- **Build** — technical documentation for the open data pipeline: how the Gaia and Hipparcos catalogues are merged, how the spatial index works, and how to download and run the pipeline yourself.
- **About** — project background, motivation, and the person behind it.

## Development

```sh
npm install
npm run dev
```

Astro's dev server will start at `http://localhost:4321/` (or the next available port).

### Local SkyKit alpha packages

The live site should use released `@found-in-space/*` packages from
`package.json`. Do not deploy with a local package override.

While migrating pages to the alpha SkyKit packages, you can point the Astro dev
server at sibling SkyKit and skyculture monorepos:

```sh
SKYKIT_LOCAL_PATH=../skykit SKYCULTURES_LOCAL_PATH=../stellarium-skycultures npm run dev
```

With those variables set, `astro.config.mjs` resolves normal package imports
such as `@found-in-space/skykit`, `@found-in-space/skykit/parallax`,
`@found-in-space/star-octree-provider`, `@found-in-space/three-star-field`, and
`@found-in-space/stellarium-skycultures-western/anchored-image` to local
workspace source. Page code should still import public package names, not
relative paths into sibling repositories, so it can switch back to released
packages once those versions are published.

The parallax page currently needs
`@found-in-space/stellarium-skycultures-western@0.3.0` or newer because it uses
the generated `./anchored-image` subpath.
