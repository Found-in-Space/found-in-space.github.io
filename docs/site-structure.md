# Public routes and content responsibilities

Found in Space makes scientific data and models into materials people can
explore, question, and build with. The website helps visitors find a useful
starting point without first understanding the repository structure.

## Route map

| Route | Responsibility |
| --- | --- |
| `/` | State the mission, offer three equal ways in, and show the breadth of the work. |
| `/explore/` | Find an experience; explain availability before someone follows a link. |
| `/question/` | Find an investigable question, an explanation, or a guided activity. |
| `/build/` | Find materials and tools for adapting, composing, analysing, or coding. |
| `/teach/` | Help educators choose and adapt current material. |
| `/about/` | Explain the purpose, educational ambition, openness, and ownership. |
| `/projects/<topic>/` | Connect one project’s experience, material, question, access, and reuse routes. |
| `/learn/` and `/learn/topic/` | Existing astronomy lesson collection. |
| `/learn/next-steps/` | Existing research briefs. |
| `/learn-build/` and `/learn-build/skykit/` | Existing star-data learning path and live SkyKit lessons. |
| `/build/star-data/` | The stellar processing overview previously at `/build/`. |
| `/build/download-the-star-data/` and `/build/gaia-and-hipparcos-star-catalogues/` | Existing detailed star-data guides. |

Explore, Question, and Build are choices, not a curriculum sequence. Teach is
an audience-specific route into the same materials. Learning is possible
through all of them, including play and making without writing code.

The main navigation highlights Explore for project pages, Question for existing
learning pages, and Build for the SkyKit learning path. The wordmark returns home.
Preserve deep links to existing activities, examples, and articles.

## Adding and maintaining projects

`src/data/projects.ts` is the shared source for the homepage, Explore, Question,
and generated project pages. `ProjectCard.astro` displays the same public status
on the homepage and Explore. Topic slugs describe the subject; project names
remain visible without requiring visitors to recognise them first.

For each project, supply:

- a plain-language invitation and an accurate description of its material;
- current access and availability;
- a question and an optional way to investigate it;
- public experience, explanation, setup, and source links where available.

Use `null` for unavailable destinations. Do not add a launch button pointing to
a private repository, local server, placeholder, or undocumented deployment.
Local website paths go through `siteHref` with `BASE_URL`; independent apps keep
their absolute deployment URLs. When access changes, update any related
teaching prompt and Build card as well as the shared project record.

Availability reviewed on 17 September 2026:

- SkyKit: existing browser activities and public lessons/packages.
- Pas de Géant: the detailed application guide documents Sun, Moon, planets,
  satellite layers, and desktop fallback. The public WebXR experience is at
  `https://foundin.space/pas-de-geant/`; its setup guide documents desktop
  controls and local development. The root README may lag the application guide.
- Shadowline: public browser explorer and tracker, with an early-alpha model
  and validation notes. Keep those limits visible.
- Aeolian Measure: private development. Mention its purpose without linking
  private source or presenting an available public player or teaching activity.

The [public project guide](https://github.com/Found-in-Space/.github/blob/main/docs/projects.md)
and each project’s own documentation are references for current capabilities.
Verify changes against the project implementation and public destination.

## Editorial boundaries

The homepage presents the purpose and breadth. It should not become a single
project’s product page with unrelated announcements appended to it. A featured
event can sit within its project or experience route.

Reusable data, models, tools, and authoring have equal standing with finished
experiences. The Build page curates routes by what someone wants to make;
the [GitHub developer guide](https://github.com/Found-in-Space/.github/blob/main/docs/projects.md)
maintains the complete technical inventory and contribution routes.

Distinguish observations, inferred quantities, predictions, simplified models,
and artistic mappings. Let sources, units, assumptions, uncertainty, and
representation choices accompany reusable material at an appropriate depth.

Data and model literacy is an educational ambition. Suggested questions,
levels, and timings do not establish classroom evaluation or learning outcomes.
New project prompts need not pretend to be finished lesson packs. AI can help
explain the relevance of this work, but the purpose stands independently of
predictions about its capabilities.

Galaxy-JS and CERN map overlays are related, separately maintained projects.
Do not imply that they are Found in Space repositories. Public pages must stand
on their own and must not link to private coordination documents.

## Verification

Run `npm run build` with released dependencies. Check internal links and
fragments in generated HTML, inspect the main routes at desktop and mobile
widths, and exercise the mobile menu and active navigation. Verify changed
external destinations, especially app launch links. For hosting changes,
also build with a non-root `BASE_PATH` so internal routes remain portable.
