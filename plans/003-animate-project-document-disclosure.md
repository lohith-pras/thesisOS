# 003 — Give the project-document disclosure a quiet, accessible reveal

- **Status**: TODO
- **Commit**: a375d45
- **Severity**: MEDIUM
- **Category**: Missed opportunity / physicality
- **Estimated scope**: 3 files, ~80 lines

## Problem

The optional document-import and profile-extraction area in
`app/app.js:321` is a native `<details>` element. Its content appears and
disappears instantly even though it can contain two full forms. That abrupt
layout change is noticeable, but this is a low-frequency, deliberate action,
so it is a good place for a short continuity transition.

```html
<!-- app/app.js:321 — current -->
<details class="profile-secondary"><summary>Project document and extraction …</summary><div class="profile-secondary-content">…</div></details>
```

`app/styles.css:59` styles the visible content, but has no open/close state or
motion. Do not animate routine navigation, task rows, or normal forms: those
are frequent workflow actions and should remain immediate.

## Target

Replace only this disclosure with the transitions.dev accordion pattern. Use a
real `<button type="button">` as the header, retain a single focusable
control, and keep the full panel mounted so CSS can animate it. The button must
use `aria-expanded`; the outer section must use `data-open="true"` or
`data-open="false"`.

```css
/* app/styles.css — target tokens and transition */
:root {
  --acc-expand: 250ms;
  --acc-collapse: 250ms;
  --acc-chevron: 250ms;
  --acc-ease: cubic-bezier(0.22, 1, 0.36, 1);
}

.t-acc-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--acc-collapse) var(--acc-ease);
}
.t-acc[data-open="true"] .t-acc-panel {
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--acc-expand) var(--acc-ease);
}
.t-acc-panel-inner {
  overflow: hidden;
  opacity: 0;
  filter: blur(2px);
  transition: opacity var(--acc-collapse) var(--acc-ease), filter var(--acc-collapse) var(--acc-ease);
}
.t-acc[data-open="true"] .t-acc-panel-inner {
  opacity: 1;
  filter: blur(0);
  transition: opacity var(--acc-expand) var(--acc-ease), filter var(--acc-expand) var(--acc-ease);
}
.t-acc-chevron { transform: scaleY(1); transform-origin: center; transition: transform var(--acc-chevron) var(--acc-ease); }
.t-acc[data-open="true"] .t-acc-chevron { transform: scaleY(-1); }
```

Use an inline SVG chevron with the symmetric path
`M4 6.5L8 10.5L12 6.5` and `vector-effect="non-scaling-stroke"`. The panel
must contain a separate `.t-acc-panel-inner`; its padding and border belong on
that inner element, never on the `0fr` grid track.

```css
@media (prefers-reduced-motion: reduce) {
  .t-acc-panel, .t-acc-panel-inner, .t-acc-chevron { transition: none !important; }
}
```

## Repo conventions to follow

- Keep the vanilla DOM-rendering architecture: `app/app.js` renders markup and
  the existing document-level click handler owns `data-action` behaviour.
- Keep the existing profile styles and responsive breakpoints in
  `app/styles.css:59-60`; migrate `.profile-secondary-content` spacing to the
  inner accordion element without changing the forms' fields or server calls.
- Reuse the existing `prefers-reduced-motion` treatment in `app/styles.css:8`.
  The component-specific guard above is still required so its intent remains
  local and survives future changes to the global rule.
- Do not add a dependency or a motion library.

## Steps

1. In `app/app.js`, replace the native `details.profile-secondary` markup in
   `profile()` with a `section.profile-secondary.t-acc` initially set to
   `data-open="false"`. Add a `button.t-acc-head` with
   `data-action="toggle-profile-secondary"`, `aria-expanded="false"`, the
   existing title/count copy, and the SVG chevron. Wrap the current two-form
   body in `.t-acc-panel > .t-acc-panel-inner`.
2. In the delegated action handling in `app/app.js`, implement
   `toggle-profile-secondary` by finding the closest `.t-acc`, flipping its
   `data-open` value, and synchronizing the header button's `aria-expanded`.
   Do this directly in the DOM; do not call `render()` or persist a UI-only
   state value. This keeps the transition interruptible if the user reopens it
   mid-collapse.
3. In `app/styles.css`, add the four accordion tokens to the existing `:root`
   declaration. Add the transitions.dev rules in the Target section, scoped to
   `.profile-secondary.t-acc` where needed to preserve current spacing, type,
   borders, two-column layout, and mobile collapse. Move current
   `.profile-secondary-content` padding and border-top to
   `.t-acc-panel-inner`; do not put padding on `.t-acc-panel`.
4. Preserve the current breakpoint behaviour by targeting
   `.profile-secondary .t-acc-panel-inner` in the `820px` and `680px` media
   rules. Confirm that the two forms stack at 820px and retain their current
   divider.
5. Add a source-contract test in `test/app-server.test.mjs` that reads both
   frontend files and asserts: `toggle-profile-secondary`, `aria-expanded`,
   `data-open`, `.t-acc-panel`, `grid-template-rows`, and a
   `prefers-reduced-motion` guard are present. It must also assert that
   `profile-secondary` is no longer emitted as `<details`.

## Boundaries

- Do not apply the accordion effect to feedback paragraphs, raw Markdown,
  search details, or routine workspace navigation in this change.
- Do not animate height with JavaScript, `height`, `max-height`, padding, or
  margins; `grid-template-rows` is the only layout property allowed here.
- Do not add persistence for this one transient disclosure.
- Do not alter document upload, profile extraction, approval, or error logic.

## Verification

- **Mechanical**: run `node --test test/app-server.test.mjs`,
  `npm run check:frontend`, and `npm test`; all must pass.
- **Accessibility**: tab to the header, press Space and Enter, and confirm
  each toggles the panel and updates `aria-expanded`. Focus must stay on the
  header; form controls must be unreachable while the panel is collapsed.
- **Feel check**: open then immediately close the panel at 10% playback speed.
  It should expand/collapse smoothly in 250ms, the chevron should flip from
  down to up, and an interrupted reversal must continue from the current
  state rather than snap.
- **Responsive check**: at <=820px and <=680px, verify no clipped content,
  residual collapsed gap, or lost form divider.
- **Reduced-motion check**: enable `prefers-reduced-motion: reduce`; panel
  state and chevron must change immediately while all content remains usable.
- **Done when**: the optional project-document area has a concise, accessible
  reveal with no impact on high-frequency research workflow interactions.
