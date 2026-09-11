# Website journey rushes

Captures the actual radio-bubble, Astrophage, star-cluster and HR lesson viewers,
including their app-owned animation and live HR surface. This is a website
adapter; general authored-timeline export remains in the sibling SkyKit Studio.

```sh
PATH=/opt/homebrew/bin:$PATH node tools/journey-rushes/render.mjs /absolute/output/directory all
```

Use a journey ID instead of `all` to render one lesson. An optional final integer
limits the number of frames for a smoke test. Output files with the same names
are replaced, so use a new output directory for a new revision.

Requires the website's existing Node dependencies, external FFmpeg, and
Playwright plus Chromium from the sibling `skykit-studio` checkout. Set
`PLAYWRIGHT_MODULE` to another installed Playwright ES module when needed. The
runner serves only on loopback, using port 5197 and a temporary Vite cache. No
site deployment is involved.

The rush format is 960×540, silent H.264/yuv420p MP4. Simulation and capture run at
12.5 fps; FFmpeg repeats each captured frame twice for 25 fps playback. The text
panel uses shortened English copy from the corresponding lesson; each export
archives the original `.astro` lesson as text alongside its chapter copy. The
radio timeline is pinned to 11 September 2026. Astrophage is explicitly labelled
as fiction using real stellar positions.

## Capture contract

1. Mount with `autoStart: false` and `capture: true`. Interactive pages retain
   their default animation behavior.
2. Advance simulation by precisely 0.08 seconds and flush pending camera state.
3. Force the star demand to be planned for each changed view. Do not rely on the
   normal interactive movement threshold or an old layer's `current` flag.
4. During loading, call `viewer.render()`, never `viewer.frame(0)`: the radio
   animation requests camera updates even with zero delta, and those updates
   would repeatedly restart demand planning.
5. Capture only when the provider says current, the renderer has received that
   exact view/demand revision, its cell and star counts match the provider,
   active and in-flight work are zero, and the state remains stable through two
   further render checks. HR session cleanup can mark a layer as streaming after
   delivering `stars/current`; the delivered revision and exact counts avoid
   both stale readiness and this false-negative case. Errors and timeouts abort.
6. Composite the scene and any separate HUD canvases into the output canvas,
   then add the text. The HR surface is generated from the same star source.

“Loaded” means all catalogue cells requested by the lesson's current viewing
and sampling settings, not every star in the complete catalogue. Physical
catalogue incompleteness and intentional changes in the selected sample remain.

`capture.json` records every captured camera pose, chapter, loading wait,
provider revision, demand counters and star count. Review PNGs and
`progress.json` are emitted during rendering. On failure, `failed.json` records
the error and completed frames; its partial MP4 is not a completed rush.

```sh
node --test tools/journey-rushes/readiness.test.mjs src/scripts/__tests__/hr-diagram-omega-route.test.js
```

Review every chapter and its travel before using a rush as the basis for a
higher-resolution master. These outputs are staged previews; they do not change
the event daily JSON or published AV masters.
