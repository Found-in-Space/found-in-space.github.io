# Found in Space Information Architecture

## Platform promise

`foundin.space` starts with open astronomical measurements and the nearby stars. It should help people encounter a compelling view, question the evidence and choices behind it, and build with the same data and code.

This site is not a personal portfolio and not only a project documentation site. It should work as a focused educational platform with a public-facing identity of its own while still linking back to `k-si.com`.

## Relationship to k-si.com

- `k-si.com` explains Kaj Siebert, the wider practice, and the broader body of work.
- `foundin.space` explains and delivers this specific project.
- Cross-linking should be light and clear:
  - `foundin.space` can say "A project by Kaj Siebert / K-SI"
  - `k-si.com` can point to Found in Space as a dedicated platform

The two should feel related, but not nested.

## Strategic goals

The site should:

1. Introduce the project clearly in under a minute.
2. Offer a compelling exploratory entry point into the solar neighbourhood.
3. Teach core concepts needed to understand the data and the visualisations.
4. Support educators with reusable, structured material.
5. Support technically curious visitors who want to inspect or extend the stack.
6. Make the project legible to collaborators, institutions, and funders.

## Primary audiences

### 1. Curious public visitors

They want:

- a clear explanation of what the project is
- a reason to care
- a quick way into the interactive experience

They do not want:

- deep technical detail up front
- repository-first navigation

### 2. Educators

They want:

- reliable explanations
- classroom-ready activities
- age-appropriate framing
- confidence about what students will learn

They do not want:

- to reverse-engineer teaching use from technical docs

### 3. Students and independent learners

They want:

- guided explorations
- concept pages
- manageable challenges and projects
- a bridge from wonder to understanding

### 4. Technical users and collaborators

They want:

- a clear model of the stack
- access to the pipeline, octree, and viewer layers
- enough explanation to build on the work responsibly

### 5. Institutional and partnership audiences

They want:

- a concise explanation of the project's educational value
- credibility, clarity, and evidence of direction
- a sense of why this matters beyond a demo

## Top-level navigation

Recommended primary navigation:

- `Home`
- `Explore`
- `Teach`
- `Learn & Build`
- `About`

Recommended utility links:

- `Launch viewer`
- `Updates` or `Journal` when there is enough material
- `k-si.com`

## Sitemap

### Home

Purpose:

- define the project
- establish its educational ambition
- route visitors toward the right next step

Include:

- hero statement with plain-language promise
- one short explanation of Found in Space as part planetarium, classroom, and open science lab
- three audience routes:
  - explore the stars
  - teach through inquiry
  - learn and build with the data
- minimal proof points: open measurements and derived data, 3D visualisations, explanations of sources and limitations, guided investigations, open pipeline and reusable code
- a few suggested first steps

### Explore

Purpose:

- provide the project's experiential front door
- turn the viewer into a meaningful exhibit rather than a standalone demo

Include:

- launch points into the viewer
- guided journeys
- short contextual text around each journey
- deep links into particular scenes or topics
- suggested sequences for first-time visitors

Possible child pages:

- `Explore/Nearest Stars`
- `Explore/Brightness and Distance`
- `Explore/Constellations and 3D Space`
- `Explore/Scale of the Solar Neighbourhood`

### Learn

Purpose:

- provide structured self-directed educational material
- help learners connect astronomy ideas to data ideas

Include:

- concise concept explainers
- learning pathways by level or audience
- metadata for each lesson: level, time, astronomy idea, data idea, classroom use, build extension
- prompts for investigation and further building

Possible child pages:

- `Learn/What Is Gaia?`
- `Learn/Parallax`
- `Learn/Absolute Magnitude`
- `Learn/Stellar Temperature and Colour`
- `Learn/Coordinates and Reference Frames`
- `Learn/Uncertainty and Data Limits`
- `Learn/Classroom Activities`

### Teach

Purpose:

- support educators directly with classroom-ready routes through the material
- make activity fit, timing, level, and learning outcomes clear

Include:

- ready-to-use activities
- suggested levels and timings
- classroom prompts
- inquiry questions
- routes into starter data and build extensions

### Build

Purpose:

- explain how the platform is made
- support extension, reuse, and technical understanding

Include:

- three doors:
  - use a small bright-star data guide
  - run the full pipeline
  - understand the technical machinery
- data flow from source catalogues to browser
- architectural explanation in human language
- links to source repositories and deeper docs
- practical build guides or recipes

### Learn & Build

Purpose:

- give students, pupils, curious coders, and independent learners a gentler route into data work
- connect the lesson catalogue to starter data guides and the open pipeline

Include:

- astronomy idea / data idea map
- starter data route
- pipeline route
- technical-note route
- research questions and extensions

Possible child pages:

- `Build/Architecture`
- `Build/Pipeline`
- `Build/Octree`
- `Build/Viewer`
- `Build/Data Provenance`
- `Build/Get Started`

### About

Purpose:

- establish authorship, intent, and institutional seriousness
- explain why the project exists

Include:

- project origin and motivation
- educational and public-engagement rationale
- principles or methods
- credits, acknowledgements, licensing, and contact
- a light bridge back to `k-si.com`

Possible child pages:

- `About/The Project`
- `About/Why This Matters`
- `About/Credits and Licensing`
- `About/Contact`

### Updates

Purpose:

- show movement and continuity
- publish new journeys, teaching pilots, releases, reflections, or data notes

This section is optional at launch.

## User journeys

### Public visitor journey

1. Land on `Home`
2. Understand the premise quickly
3. Launch a guided exploration
4. Read one or two short concept explainers
5. Leave with a sense of scale, method, and possibility

### Educator journey

1. Land on `Home` or `Teach`
2. Identify age level or teaching context
3. Pick a ready-to-use activity or guided exploration
4. Use classroom prompts or an investigation
5. Optionally consult background material in `Learn & Build`, `Build`, or `About`

### Student or curious builder journey

1. Land on `Home` or `Learn & Build`
2. Start with a lesson or visual experience
3. Create a small bright-star dataset from the starter guide
4. Build a chart, notebook, visualisation, or game-like experience
5. Move into the full pipeline only when ready

### Technical journey

1. Land on `Home`, `Learn & Build`, or `Build`
2. Understand the three-part architecture
3. Follow links to the pipeline, octree, and viewer
4. Use build guides and provenance notes
5. Move from overview to source code

## Content principles

- Lead with meaning before mechanics.
- Start from the solar neighbourhood and the learner's question, not from the repositories.
- Let visitors move from seeing a representation, to questioning its evidence and assumptions, to building with its materials.
- Treat observations, derived quantities, model or simulation outputs, and illustration as valuable but not interchangeable.
- Keep educational and technical material connected, but not collapsed into one voice.
- Use short pages with strong onward paths rather than dense all-in-one explanations.
- Treat the viewer as one tool inside a larger learning experience.
- Make sources, assumptions, uncertainty, and limitations visible. The site should not imply that data is complete, that a simulation is a measurement, or that a visualisation is a direct image of reality.

## Success criteria

The IA is working if:

- a first-time visitor can explain the project after one minute
- an educator can find a usable teaching entry point without reading code docs
- a technically curious visitor can understand the stack without guesswork
- the site feels like a platform with a point of view, not a dev dump or a personal portfolio
