# Found in Space — Website

Part of [Found in Space](https://foundin.space/): tools for thinking and creating
with scientific data and models. **Explore. Question. Build.**

This repository is the public-facing website at [foundin.space](https://foundin.space), built with [Astro](https://astro.build/) and hosted on GitHub Pages.

## Site structure

The public navigation follows what visitors want to do:

- **Explore** (`/explore/`) — experiences across stars, worlds, eclipses, and
  musical experiments, with availability and setup made clear.
- **Question** (`/question/`) — questions across the projects, routes to guided
  investigations, and distinctions between evidence, models, and representation.
- **Build** (`/build/`) — reusable data, models, components, and authoring tools,
  with ways to adapt materials both with and without coding.
- **Teach** (`/teach/`) — current astronomy activities and suggestions to adapt
  across the projects; levels and timings are planning estimates.
- **About** (`/about/`) — the mission, data and model literacy ambition, and the
  person behind the work.

Project pages (`/projects/<topic>/`) connect an experience to its inputs,
questions, and reusable materials. SkyKit, Pas de Géant, Shadowline, and Aeolian
Measure share this structure, with their different availability stated explicitly.

Existing lessons and live examples retain their URLs under `/learn/` and
`/learn-build/`. The latter is a star-specific learning path. The former Build
pipeline overview now lives at `/build/star-data/`; the detailed data guides
retain their existing URLs.

See [site structure and content guidance](docs/site-structure.md) before adding
another project, route, or public capability claim. The
[developer project map](https://github.com/Found-in-Space/.github/blob/main/docs/projects.md)
owns the full technical inventory; this website helps the public find a useful
starting point.

## Development

```sh
npm install
npm run dev
```

Astro's dev server will start at `http://localhost:4321/` (or the next available port).

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
