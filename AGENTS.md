# Agent Instructions

## Framework

Astro 6.x static site. No Tailwind or utility CSS framework.

## Styling: Use the shared design system

Before adding a `<style>` block or inline `style=""` attribute to any `.astro` file,
check whether an existing shared class already covers the need.

### Where to look

| File | Contains |
|------|----------|
| `src/styles/theme.css` | Design tokens (`--fis-*` custom properties), resets, global body styles |
| `src/styles/components.css` | Shared UI primitives (see list below) |
| `src/styles/prose.css` | Article body typography inside a `.prose` wrapper |
| `src/pages/dev/style-guide` | Visual reference with live examples of every shared component |

All three CSS files are imported globally via `src/layouts/Layout.astro`.

### Available shared classes

**Layout**
- `.page` / `.page--narrow` — centred page container (72 rem / 48 rem)
- `.hero` — page header padding
- `.section-grid` — base grid with gap + margin (add `grid-template-columns` per page)

**Typography**
- `.eyebrow` / `.panel__eyebrow` — uppercase gold label
- `.lede` — introductory paragraph
- `.link--gold` — gold link with subtle underline

**Navigation**
- `.breadcrumb` / `.breadcrumb__sep` — breadcrumb trail
- `.page-nav` — prev / next article links

**Components**
- `.button` / `.button--primary` / `.button--ghost` — pill buttons
- `.panel` / `.panel--accent` / `.panel--featured` / `.panel--wide` — glassy cards
- `.callout` — highlighted aside (combine with `.panel`)
- `.tag` — pill label

**Article prose** (`prose.css`)
- `.prose` — wrap an article body container to get consistent h2/h3, paragraph,
  link, code, pre, table, list, and callout styles without page-level overrides.

### Design tokens (most used)

| Token | Purpose |
|-------|---------|
| `--fis-gold` | Primary accent colour |
| `--fis-gold-subtle` | Link underlines, subtle gold borders |
| `--fis-blue` | Secondary accent / code colour |
| `--fis-blue-subtle` | Tag borders, subtle blue borders |
| `--fis-text` | Primary text (headings, emphasis) |
| `--fis-text-soft` | Body text |
| `--fis-text-muted` | Secondary / meta text |
| `--fis-panel` | Card background |
| `--fis-line` / `--fis-line-strong` | Border colours |
| `--fis-radius` | Card border-radius (1.4 rem) |
| `--fis-shadow` | Card box-shadow |
| `--fis-font-body` | Georgia serif stack |
| `--fis-font-ui` | Avenir sans stack |

### Rules

1. **Check shared CSS first.** Do not redefine a class that already exists in `components.css` or `prose.css`.
2. **Use tokens, not raw values.** Never hard-code gold (`#f2c879`), blue (`#8db7ff`), or their rgba variants — use the `--fis-*` custom properties.
3. **Scope new patterns correctly.** If a style is genuinely page-specific (e.g. a viewer layout), keep it in the page's scoped `<style>` block. If it could apply to two or more pages, add it to `components.css` first, update the style guide, then use it.
4. **Prefer `.prose` for article content.** Long-form article sections should use `class="prose"` on their body container rather than re-implementing heading, paragraph, and table styles.

## Running the site

```bash
npm run dev          # development server
npm run build        # production build
npm run preview      # preview production build
```
