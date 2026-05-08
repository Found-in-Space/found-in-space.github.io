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
