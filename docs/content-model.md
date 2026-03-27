# Found in Space Content Model

## Editorial stance

The site should move between three modes without becoming fragmented:

- `Exhibit`: public-facing, visual, invitational
- `Classroom`: structured, clear, reusable
- `Lab`: technically transparent, inspectable, extensible

Every major section should clearly favor one mode, but the whole site should let visitors move between them.

## Core content types

### Journey

Definition:

A guided route through the interactive experience, focused on one idea or question.

Purpose:

- give structure to exploration
- reduce intimidation for first-time visitors
- connect interaction to learning

Suggested fields:

- title
- slug
- audience level
- summary
- key question
- estimated duration
- related concepts
- viewer deep link
- prompts
- next steps

Examples:

- `How close are our nearest stellar neighbours?`
- `Why bright stars are not always the nearest stars`
- `What constellations hide about 3D space`

### Concept

Definition:

A concise explanatory page for one key astronomical or data concept.

Purpose:

- support self-directed learning
- give teachers trustworthy explainers
- provide context for journeys and activities

Suggested fields:

- title
- slug
- summary
- one-sentence takeaway
- body
- diagrams or visual cues
- related journeys
- related activities

Examples:

- `Parallax`
- `Absolute Magnitude`
- `Gaia and Measurement`

### Activity

Definition:

A reusable learning task for classroom or independent use.

Purpose:

- convert content into action
- support teachers directly
- give the site practical educational value

Suggested fields:

- title
- slug
- audience level
- format
- duration
- learning goals
- materials needed
- instructions
- reflection questions
- extension ideas

Examples:

- `Compare the Sun's neighbourhood to Orion`
- `Map visible stars against distance`
- `Investigate uncertainty in stellar distances`

### Build guide

Definition:

A technical page that explains part of the stack in accessible language.

Purpose:

- support contributors and advanced users
- keep architecture comprehensible
- connect the code to the educational mission

Suggested fields:

- title
- slug
- component
- summary
- prerequisites
- explanation
- related repositories
- next technical steps

Examples:

- `From Gaia catalogue to cleaned Parquet`
- `Why the octree exists`
- `How the viewer streams stars`

### Project note

Definition:

A dated post about progress, experiments, releases, pilots, or reflections.

Purpose:

- demonstrate momentum
- capture learning over time
- make the project feel alive

Suggested fields:

- title
- slug
- date
- category
- summary
- body

## Page-by-page content brief

### Home

Primary job:

- orient visitors and route them onward

Core sections:

- hero
- short project definition
- three-layer architecture strip
- choose-your-path routing
- featured journey
- credibility/about teaser

### Explore landing

Primary job:

- help visitors begin with curiosity, not confusion

Core sections:

- why explore
- featured guided journeys
- launch viewer
- suggested first-time route

### Learn landing

Primary job:

- organize educational material by concept and audience

Core sections:

- what you can learn here
- pathways by audience or level
- featured concepts
- featured activities

### Build landing

Primary job:

- explain the architecture simply and direct people to deeper material

Core sections:

- overview diagram
- three project layers
- source and provenance
- start here for developers or collaborators

### About landing

Primary job:

- explain intent, authorship, and values

Core sections:

- why this project exists
- educational rationale
- authorship and partnership
- credits and licensing

## Launch-phase recommendations

For a first meaningful launch, the site probably does not need everything.

Recommended launch set:

- `Home`
- `Explore`
- `Learn`
- `Build`
- `About`
- 3 journeys
- 4 concepts
- 2 activities
- 3 build guides

That is enough to feel like a platform, not a placeholder.

## Sequencing recommendation

Best order for implementation:

1. Create navigation and section landing pages.
2. Write homepage messaging.
3. Define the first three journeys.
4. Write the first concept pages that support those journeys.
5. Add build guides once the public-facing proposition is clear.

## Notes for Astro implementation

This content model will fit well with Astro content collections later, for example:

- `src/content/journeys`
- `src/content/concepts`
- `src/content/activities`
- `src/content/build-guides`
- `src/content/notes`

That will allow pages to stay simple while content remains structured and reusable.
