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
