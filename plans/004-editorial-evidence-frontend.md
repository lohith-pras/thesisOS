# 004 — Reframe ThesisOS as an editorial evidence workspace

- **Status**: TODO
- **Commit**: a375d45
- **Severity**: MEDIUM
- **Category**: Cohesion, missed opportunities, and motion system
- **Estimated scope**: 5 files, ~500 lines across staged visual changes

## Problem

ThesisOS has a sound visual foundation—paper, ink, green approval states, thin
rules, and real workflow content—but the landing page and product frontend do
not yet present one memorable visual system. The marketing page currently
explains a single Zotero-connection state, while the product already contains
the richer feedback → approval → evidence → note lifecycle.

```html
<!-- landing/index.html:34-74 — current hero artifact -->
<div class="hero-visual" id="workspace" aria-label="Preview of the ThesisOS research desk">
  … a Connections / 01 preview …
</div>
```

```js
// app/app.js:81 — current high-frequency navigation behaviour
function setView(view) { state.view = view; saveState(); location.hash = view; render(); }
```

The two reference directions suggest a valuable adaptation: a framed,
editorial “evidence board” with deliberate surface contrast, a clear
four-part story, concise technical labels, and one calm accent wash. They must
not be copied as a lavender/black startup theme, fake productivity statistics,
or decorative device art. ThesisOS remains a serious local research tool;
navigation and task selection must remain immediate.

## Target

Create one coherent visual direction named **Editorial Evidence Board**:

- **Landing page:** an off-white editorial canvas with a framed four-panel
  workflow board. Its panels represent real ThesisOS states: original
  feedback, reviewable task, selected evidence, and grounded note. The primary
  hero interaction is a styled-but-non-submitting feedback prompt that links
  to `../app/index.html#feedback`.
- **Product workspace:** retain the calm paper background and dense reading
  layout. Introduce only two new surface roles: `--surface-ink: #1b1b1b` for
  a small number of final/decision summaries and `--surface-wash: #e4eee7`
  (alias of the existing green wash) for verified, local-first, or
  review-ready states. Green remains semantic—never decorative.
- **Information hierarchy:** use compact monospace labels for provenance and
  workflow stage, a characterful serif only for landing headlines and one
  high-value product summary, and the existing sans-serif for all operational
  UI, forms, lists, and data.
- **No invented claims:** metric cards may show values only when computed from
  current state (for example: number of proposed tasks, selected sources, or
  approved objectives). Do not claim time saved, percentages, or performance
  improvements.

Use these shared CSS tokens in both `landing/styles.css` and `app/styles.css`
with the same values:

```css
:root {
  --surface-ink: #1b1b1b;
  --surface-wash: #e4eee7;
  --border-strong: #1b1b1b;
  --font-editorial: Iowan Old Style, Baskerville, Georgia, serif;
  --motion-fast: 250ms;
  --motion-quick: 150ms;
  --motion-stagger: 40ms;
  --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-distance: 8px;
  --motion-blur: 2px;
}
```

`--motion-fast` is for occasional card/panel entry, `--motion-quick` for
dismissal and text-state feedback, and `--motion-stagger` only for up to four
landing-board panels. Do not use these tokens for route changes, task-row
selection, form typing, or background loops.

## Design specification

### 1. Landing page — tell the real workflow

Replace the large `hero-visual` connection preview with a `.evidence-board`
inside the existing hero. It must have a 1px `--border-strong` frame, 12px
outer radius, 12px internal gutters, and a two-by-two desktop grid. The board
must collapse to one column below 780px.

| Board panel | Real content | Visual treatment |
| --- | --- | --- |
| Feedback | A quoted supervisor comment and “Original wording retained” label | Off-white, generous type, input-like footer with `Start with feedback →` |
| Review | `01 / 02 / 03` task sequence | White, hairline rules, green only on the approved/ready marker |
| Evidence | 2–3 realistic bibliographic source cards | `--surface-ink` with off-white text; no fabricated match score |
| Grounded note | Citation-stamped note excerpt and “Review before write” label | `--surface-wash`, strong border, no dark decorative texture |

Use a low-opacity, CSS-only halftone/noise texture only behind the board—not
inside text or form controls. It must be static and disabled in the
`prefers-reduced-motion` mode only if it is implemented as an animation (the
default is static). The existing molecule, orbs, and bonds are out of scope;
remove them instead of layering a second visual metaphor over them.

Below the hero, keep the existing safety section but replace the generic
two-column `flow` treatment with a numbered “proof rail” that repeats the four
workflow stages and links each stage to a real app route. The existing safety
copy stays factual.

### 2. Product workspace — make the evidence chain visible

In `app/app.js`, evolve only high-level summary surfaces:

- On `overview()`, put the real counts already available in state into a
  four-cell `.evidence-metrics` strip: feedback threads, proposed tasks,
  approved tasks, and attached sources. If no count exists, render a factual
  empty-state label such as `No sources selected` rather than `0% complete`.
- Retain `.lifecycle-grid` and the feedback form. Restyle the adjacent
  “latest feedback” and integration health blocks as aligned, bordered
  evidence-board cells rather than adding a dashboard chart.
- In the Tasks view, restyle the existing `.approval-panel` as the one
  `--surface-ink` decision surface. Its content remains the present approval
  boundary and task count; do not change approval logic.
- In Evidence notes, keep the current note/source content. Give
  `.note-read-model` an editorial document header (source count, writing
  check, and provenance) and preserve its readable, paper-like body.
- Implement [003-animate-project-document-disclosure.md](003-animate-project-document-disclosure.md)
  before applying its accordion treatment to any other low-frequency optional
  disclosure. Do not animate the raw Markdown or source detail disclosures in
  this plan.

### 3. Motion adaptations

Use motion as orientation, never decoration:

```css
/* landing/styles.css — only on the first landing-page view */
@media (prefers-reduced-motion: no-preference) {
  .hero-copy,
  .evidence-board {
    animation: landing-enter var(--motion-fast) var(--motion-ease) both;
  }
  .evidence-board > *:nth-child(2) { animation-delay: var(--motion-stagger); }
  .evidence-board > *:nth-child(3) { animation-delay: calc(var(--motion-stagger) * 2); }
  .evidence-board > *:nth-child(4) { animation-delay: calc(var(--motion-stagger) * 3); }
}
@keyframes landing-enter {
  from { opacity: 0; transform: translateY(var(--motion-distance)); filter: blur(var(--motion-blur)); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
```

The total board stagger is 120ms, under the 300ms cap. The hero copy and board
need separate entry keyframes or delay selectors so the board’s child delays
actually apply; do not put an animation on a parent and expect its children to
stagger automatically.

For the product frontend:

- Keep `setView()` immediate. It is a high-frequency, goal-directed operation.
- Keep the existing `closeTaskModal()` exit and reduced-motion branch. When
  motion tokens are introduced, map modal open to `250ms` and close to `150ms`
  with `cubic-bezier(0.22, 1, 0.36, 1)`, `scale(0.96)` on entry, and an exit no
  larger than `scale(0.99)`.
- Keep async activity markers static; no shimmering board, looping halftone,
  or animated statistics.
- The accordion from plan 003 uses a symmetric 250ms reversible transition;
  it must use `grid-template-rows`, not JavaScript height measurement.
- For the rare first completion of the guided onboarding only, replace the
  final progress mark with a static check after a 150ms icon/text swap. Do not
  add a celebration to subsequent saves, task approvals, or evidence changes.
- All hover transforms remain inside `@media (hover: hover) and (pointer:
  fine)`. Press feedback stays `scale(.98)` over 160ms; no card tilt, parallax,
  scroll reveal, or cursor-follow effect belongs in the research workspace.

```css
@media (prefers-reduced-motion: reduce) {
  .landing-enter-target,
  .evidence-board > * {
    animation: none !important;
    filter: none;
    transform: none;
  }
}
```

## Repo conventions to follow

- This is a vanilla HTML/CSS/DOM-rendering project. Edit `landing/index.html`
  + `landing/styles.css` for marketing and `app/app.js` + `app/styles.css` for
  the live workspace; do not add a framework, canvas, image-generation asset,
  or animation dependency.
- Reuse existing semantic colors from `landing/styles.css:1-13` and
  `app/styles.css:1`. The new wash aliases `--accent-soft`; it does not add a
  lavender product theme.
- Reuse `app/app.js:81` for immediate navigation,
  `app/app.js:501-520` for reduced-motion-aware modal close, and
  `app/styles.css:8` for the global reduced-motion baseline.
- Preserve actual local-first, read-only, approval, Zotero, and Obsidian
  boundaries. Visual changes must not overstate product capability.

## Steps

1. **Establish the shared visual-token contract.** Add the Target tokens to
   the two root blocks, retaining every existing token. Scope
   `--font-editorial` to landing headlines and the single product document
   summary; leave current operational type untouched. Add no external font
   request.
2. **Rebuild the landing hero artifact.** In `landing/index.html`, replace
   `.hero-visual` and its molecule markup with the four semantic evidence-board
   panels described above. Preserve the existing `#workspace` anchor, primary
   CTA route, navigation, and visible local-first language. Add real links to
   `#feedback`, `#tasks`, `#evidence`, and `#notes` in the corresponding
   panels.
3. **Recompose the lower landing sections.** In `landing/index.html` and
   `landing/styles.css`, turn the existing flow section into a proof rail and
   update safety styling so both use the same 1px rules, spacing scale, and
   compact mono labels as the evidence board. Add a static halftone/noise
   pseudo-element behind only the board and ensure its contrast never obscures
   copy.
4. **Apply landing motion with reduced-motion coverage.** Add the exact
   250ms/40ms/8px/2px animation rules from the Target. Use `opacity`,
   `transform`, and a maximum `blur(2px)` only. At reduced motion, show all
   content immediately; no delayed or blank state is allowed.
5. **Introduce truthful product metrics.** In `app/app.js`, derive the four
   overview counts from canonical state rather than hard-coding them. Add the
   `.evidence-metrics` markup below the lifecycle heading and before
   `.lifecycle-grid`. In `app/styles.css`, lay it out as four bordered cells,
   converting to two cells at 960px and one column below 680px. Do not add
   progress rings, percentages, or charts.
6. **Restyle the high-value product surfaces.** Add narrowly-scoped classes to
   the current latest-feedback card, Tasks approval panel, integration health
   cards, and note read model. Give only the approval boundary the dark surface;
   use the sage wash for verified states and the existing white/paper surfaces
   for source reading. Preserve all present HTML attributes, button actions,
   focus behaviour, and responsive layouts.
7. **Finish the selected motion seams.** Execute plan 003 for the project
   document disclosure. Then tokenize the existing modal transition values as
   specified above without changing its event flow. Implement the onboarding
   completion swap only when `finish-onboarding` is triggered, and make it
   immediate under reduced motion.
8. **Add regression coverage.** Extend `test/app-server.test.mjs` source
   contracts to assert the landing evidence-board labels/links, the absence of
   removed molecule markup, the product `evidence-metrics` renderer, and
   reduced-motion CSS. Update existing modal assertions only if their selector
   names change. Do not write visual tests that depend on timing exactness.
9. **Review screen-by-screen.** Inspect landing desktop/mobile, Overview with
   empty and populated state, Tasks with pending and approved work, Evidence
   notes with a note preview, and Profile with the optional disclosure. Remove
   any style that makes prose harder to read or a state less semantically
   clear.

## Boundaries

- Do not import the references’ branding, logo, illustrations, lavender/pink
  palette, pricing cards, invented metrics, or startup copy.
- Do not animate navigation, task rows, forms, source selection, scrolling, or
  persistent background textures.
- Do not make `--surface-ink` a default dashboard background; reserve it for
  the Tasks approval boundary and landing evidence panel.
- Do not add remote fonts, image assets, dependencies, or a motion library.
- Do not modify API contracts, approval semantics, data persistence, Zotero
  read-only behaviour, or Obsidian write safeguards.
- If the current markup differs materially from the commit named above, stop
  and update the plan references before implementation instead of guessing.

## Verification

- **Mechanical:** run `npm test`, `npm run check`, and `npm run check:frontend`.
  All existing tests and new source contracts must pass.
- **Content truth:** compare every displayed metric and safety statement to the
  state/API it derives from; no unsupported productivity or accuracy claim may
  remain.
- **Responsive:** test 1440px, 980px, 820px, and 680px widths. The landing
  board must become one column below 780px; product metric cells must never
  overflow or reduce text below the existing readable sizes.
- **Accessibility:** keyboard-tab through every landing board link and product
  decision action. Verify contrast on the ink panels, visible focus outlines,
  semantic headings, and no loss of information when CSS texture is disabled.
- **Feel check:** at 10% playback speed, reload the landing page. Hero copy and
  board enter once, travel only 8px, settle within 250ms, and the final board
  panel appears no later than 120ms after the first. Navigate repeatedly among
  product views and confirm there is no route animation.
- **Reduced motion:** enable `prefers-reduced-motion: reduce`; landing content
  must appear immediately with no transform/blur, modal closing must be
  immediate, accordions must snap open/closed, and static activity text must
  remain visible.
- **Done when:** ThesisOS presents a single, recognisable editorial evidence
  system from landing page to research workspace, while its operational UI
  stays calmer and more factual than the marketing surface.
