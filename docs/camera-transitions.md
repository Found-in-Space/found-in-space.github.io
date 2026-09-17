# Interactive camera transitions

## Required behavior

Every interactive transition MUST begin at the camera position and orientation
currently displayed to the visitor. The source is the live viewer, including
manual looking and partially completed travel. The previous chapter's authored
pose is not the source. Forward, backward, skipped, repeated, and rapid chapter
changes obey the same rule.

At zero elapsed transition time the displayed pose MUST be unchanged. As
elapsed time approaches zero, position and orientation changes MUST approach
zero too. There must be no single-frame flash, teleport to a path anchor, or
reset to an introductory camera before interpolation begins. A transition must
still reach its intended destination and enter its intended orbit or hold.

## Ownership and API rules

1. `createSkykitViewer({ view })` places the camera for the first render.
   `activateChapterCamera()` owns later chapter navigation, including returns to
   the initial chapter. A chapter's `view`, `camera`, or `transitionTo` describes
   destination intent, not a state to install before travel.
2. `requestViewState({ lookAt })`, `requestViewState({ targetPc })`, and pose
   patches are immediate camera operations. NEVER preapply the destination
   with one of these and then invoke `lookAt`, `lockAt`, or `transitionTo`.
   Pass the destination to navigation and let it interpolate from the live pose.
   Non-camera settings, such as limiting magnitude, can be applied separately.
3. SkyKit 0.2 queues a navigation sample for the next viewer update. Cancelling
   automation alone does not discard that sample. The chapter helper cancels
   the old operation and queues the **unchanged displayed pose** to supersede
   its pending write. This source hold must never be replaced with the new
   chapter's destination. It prevents an interrupted transition from rendering
   one more stale frame.
4. `flyPolyline` starts at its first point; it does not first fly there. The
   chapter helper joins authored corridor waypoints from the live observer
   position. Keep the authored corridor immutable. For generated orbit
   transfers, pass the live navigation snapshot's velocity and source orbit,
   including its angular speed, rather than assuming a canonical orbit phase.
5. Navigation is the sole camera writer during chapter transitions. Radio
   Bubble's model plugin animates the sphere and date; its chapter navigation
   moves the camera. A model plugin must not reset the camera at chapter entry
   or overwrite manual orientation every frame.
6. A newer activation supersedes older asynchronous work and arrival callbacks.
   Recheck activation identity after awaiting preparation and before issuing
   further camera commands. `actions.invoke()` means a command was accepted;
   it does not mean the camera has arrived.

These rules also apply when upgrading SkyKit. Do not restore removed journey
internals or deploy unreleased local packages to repair application navigation.

## Regression origin

The older Astrophage controller used `lockAt` and `orbitalInsert` directly from
the live camera. During the alpha migration, website commit `1712acb` introduced
authored chapter views, fixed Omega corridor anchors, and direct Marconi camera
writes. Those introduced assumptions about initial chapter entry that do not
hold on revisits or at arbitrary orbit phases.

Website commit `50addbb` replaced the journey plugin with
`src/scripts/chapter-navigation.js` and adopted the new `lookAt` API. SkyKit
commit `7b4ceff` had changed view targets from passive target metadata into
orientation-resolving camera input. The replacement helper copied the
set-target-before-navigation sequence: it applied `chapter.view` and patched
`targetPc` before starting navigation. Under the new API these writes snap the
camera. The correction belongs at this shared activation boundary, rather than
in scene-specific delays or visual fades.

Website commit `f45c592` removed the same preapplication from constellation
selection. Commits `f77a8a5` and `387d6d0` improved deterministic video paths;
those bypass interactive chapter activation, so their passing tests cannot
establish that interactive navigation is continuous.

## Required verification

Run:

```sh
npm test
npm run build
```

`src/scripts/__tests__/chapter-navigation.test.js` imports the real topic
definitions and runs them against the installed SkyKit viewer/navigation code
with a renderer stub. It inspects rendered updates, not just action payloads or
the state before queued view changes are applied. The original 30 continuity
cases all failed before the correction.

Coverage must include each chapter entered from an arbitrary pose, introductory
chapter revisits, actual Omega corridor transfers from noncanonical orbit
positions, Marconi reentry, manual looking, interrupted/reversed transitions,
rapid activation, delayed preparation, and final orbit/arrival behavior.
Retain the independent video-path tests as well. Pull requests run these checks;
the Pages workflow runs them before building and uploading a deployment.

For visual review, traverse Astrophage in both directions, drag during travel,
and select another chapter before arrival. Repeat around the Omega Centauri
and Marconi transitions. A fade or a loading screen is not a continuity fix.
