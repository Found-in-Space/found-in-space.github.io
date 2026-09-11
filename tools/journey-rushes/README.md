# Website journey rushes

Captures the actual radio-bubble, Astrophage, star-cluster and HR lesson viewers,
including their app-owned effects and live HR surface. Camera movement is one
continuous authored track for each topic; chapter actions never control its pose. This is a website
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
native 25 fps (one independently captured image per output frame). The text
panel uses shortened English copy from the corresponding lesson; each export
archives the original `.astro` lesson as text alongside its chapter copy. The
radio timeline is pinned to 11 September 2026. Astrophage is explicitly labelled
as fiction using real stellar positions.

## Capture contract

1. Mount with `autoStart: false` and `capture: true`. Interactive pages retain
   their default animation behavior.
2. Evaluate the continuous camera pose at the frame timestamp, then advance
   effects by precisely 0.04 seconds. The camera uses eased position and
   quaternion orientation tracks with continuous velocity and acceleration at
   joins. Moves are retimed to cap angular speed at 24 degrees per second.
   Text/effect changes do not invoke `goTo`, `lockAt`, or orbit navigation.
   Assert the rendered pose equals the authored pose and that the angular step
   stays below 0.961 degrees at 25 fps.
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
provider revision, demand counters, star count, and actual camera motion errors.
`motionAudit` records every camera knot and the maximum planned angular step. Review PNGs and
`progress.json` are emitted during rendering. On failure, `failed.json` records
the error and completed frames; its partial MP4 is not a completed rush.

```sh
node --test tools/journey-rushes/*.test.mjs src/scripts/__tests__/hr-diagram-omega-route.test.js
```

Review every chapter and its travel before using a rush as the basis for a
higher-resolution master. These outputs are staged previews; they do not change
the event daily JSON or published AV masters.


## Motion review

The first chapter-driven rushes were rejected because interactive target locks
could snap camera orientation at chapter changes (up to 141 degrees in one
frame). Successful loading and decoding did not establish smooth camera motion.
The continuous track is now the sole pose owner, while dedicated capture APIs
set the radio shell, Astrophage annotations and HR sampling independently.

The camera eases into each destination, moves gently around it, and eases into
the next transfer without a cut. Route timings may therefore be longer than the
interactive chapter timings. Use `info.chapters`/`capture.json` for actual times.
The four topics remain separate videos, each with an uninterrupted camera path.

Run `verify.py OUTPUT [journey-id ...]` to check loading, actual camera motion,
frame counts and full decode, and extract review frames. Also inspect filmstrips
or playback around every chapter join; contact sheets alone miss abrupt turns.

The export server disables file watching and live reload so a background
dependency update cannot dispose an active viewer. To generate filmstrips around
every arrival and departure, install Pillow and run:

```sh
python3 tools/journey-rushes/motion-review.py OUTPUT [journey-id ...]
```

Each filmstrip row contains frames two seconds before, one second before, at,
one second after, and two seconds after a camera knot.
