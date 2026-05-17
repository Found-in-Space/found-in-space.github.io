# Radio Bubble Video Renderer

## What is validated

The radio bubble export path now treats the browser as a deterministic renderer rather than a screen recorder. Playwright opens an export-only route, advances the SkyKit viewer by exact frame time, waits for star payload readiness, composites the sky canvas and text canvas, and normalizes the resulting video with `ffmpeg`.

The current tests found:

- Playwright screenshots are the main bottleneck. The JavaScript-side camera/readiness work is comparatively fast.
- Canvas compositing preserves acceptable overlay text quality for preview use.
- WebKit is currently the fastest tested browser for the canvas capture path.
- Browser `MediaRecorder` WebM timing metadata is unreliable, so output MP4s must be normalized with `ffmpeg -r <fps>`.
- Each aspect ratio should be rendered as its own browser viewport and SkyKit canvas. Social layouts are not crops of the landscape render.

## Renderer architecture

The implementation is intentionally radio-bubble-first. It can be generalized later, but v1 keeps the moving parts close to the journey being validated.

- Timeline data lives in `src/scripts/radio-bubble-video-timeline.js`.
- Layout presets live in `src/scripts/radio-bubble-video-layouts.js`.
- `/video/radio-bubble-full/` accepts `layout`, `canvasOverlay`, and `preserveDrawingBuffer`.
- `scripts/render-radio-bubble-video.mjs` is the main CLI.
- `video-output/radio-bubble/<layout>/<mode>-<capture>-<fps>fps/` contains local render artifacts and metadata.

The export page exposes `window.__radioBubbleVideoExport` with:

- `getStatus()`
- `getCanvasInfo()`
- `startClip()`
- `captureFrame(...)`
- `captureFrameArtifacts(...)`
- `recordCanvasStream(...)`

Normal preview/final renders use `recordCanvasStream({ source: 'composite' })`, save the raw WebM, then normalize to H.264 MP4. Plate tests use `captureFrameArtifacts()` to write matching `composite`, `sky`, and transparent `overlay` PNG frames.

## Commands

```sh
npm run video:radio-bubble:preview
npm run video:radio-bubble:preview:vertical
npm run video:radio-bubble:plates:test
npm run video:radio-bubble:final:4k -- --frames=24
```

Useful direct options:

```sh
node scripts/render-radio-bubble-video.mjs --mode=preview --layout=square-1080 --frames=24
node scripts/render-radio-bubble-video.mjs --mode=preview --layout=portrait-1080x1350 --plates=all --frames=12
node scripts/render-radio-bubble-video.mjs --mode=final --layout=landscape-4k --capture=frames --frames=24
```

## Waypoint journey editor

The generic waypoint editor for the `fis-journey-v1` JSON format has moved out
of the website and into the SkyKit workspace as the standalone
`@found-in-space/journey-video` package app:

```txt
packages/journey-video/examples/editor/index.html
```

It keeps script sync in seconds, but the location evaluator traverses each
spline segment by arc length so movement speed is stable between timestamped
waypoints.

Camera orientation is authored as one continuous `cameraLookWaypoints` track. Each camera key is either a `direction` key, which looks along an infinite forward vector, or a `target` key, which tracks a fixed `targetPc` from the current observer position. Adjacent look keys are slerped with whole-interval smoothstep easing, so switching from one target to another is part of the gaze interpolation rather than a separate aim overlay.

The package editor has four configurable tiles (`XY`, `XZ`, `YZ`,
`Perspective`, `SkyKit`), a shared zoom for non-SkyKit views, and a single
timeline with draggable location/camera widgets. Static guides live in the
sidebar and render as guide meshes in the SkyKit preview. The website no longer
embeds its own Astro editor route.

The seeded radio bubble journey lives in `src/data/radio-bubble-journey.json`. The editor can import/export JSON, and the renderer can consume an exported journey:

```sh
npm run video:journey:test
node scripts/render-radio-bubble-video.mjs --mode=preview --layout=landscape-1080p --journey=src/data/radio-bubble-journey.json --frames=24
```

## Blender authoring path

The current generated camera path can be exported into a Blender-friendly interchange scene, opened in Blender, edited, and sampled back into a renderer scene JSON.

The intended loop is:

1. Define key features and waypoints in the radio bubble timeline.
2. Export a Blender scene description with landmarks, path samples, targets, cue timings, and the current camera path.
3. Launch Blender with an importer script that builds editable curves, waypoints, a camera, and a look-at target.
4. Edit the camera and target animation in Blender.
5. Export the edited camera motion and orientation back to JSON for the renderer.

Commands:

```sh
npm run video:radio-bubble:blender:export
npm run video:radio-bubble:blender:launch
npm run video:radio-bubble:blender:convert
```

The Blender launcher uses `BLENDER_BIN` when set, otherwise it tries `/Applications/Blender.app/Contents/MacOS/Blender` on macOS and then falls back to `blender` on `PATH`.

Outputs live under `video-output/radio-bubble/blender/`:

- `radio-bubble-blender-scene.json`: interchange input for Blender.
- `radio-bubble-path.blend`: editable Blender scene from the launcher.
- `radio-bubble-camera-scene.json`: sampled camera/target/orientation output from Blender.

## Current limitations

The renderer path is sound, but the radio bubble journey itself still needs authoring work before final production renders:

- Scene boundaries still begin abruptly in places.
- Orbital insertion is less smooth than the scroll-triggered web version.
- The timeline should evolve from hard scene cuts into explicit `hold -> transition -> settle` beats.
- Camera moves should preserve continuity across beat boundaries.
- Text placement and wrapping need manual review per layout.
- Audio/music is out of scope for this renderer milestone.

## Acceptance checks

For each output layout:

- Skyview fills the whole frame.
- No website navigation, status text, or page chrome appears.
- Overlay text is readable and positioned for the target aspect ratio.
- MP4 reports the expected dimensions, frame rate, duration, and frame count via `ffprobe`.
- `render-metadata.json` includes frame count, browser, capture method, layout, `ffmpeg` arguments, readiness stats, and timing summaries.
