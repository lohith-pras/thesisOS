# Proofline design system

## Design read

Proofline is a local-first research workflow for researchers and reviewers. Its visual language is editorial, scientific, and quietly technical: a strong Swiss grid, generous white space, black ink typography, hairline rules, and one controlled green accent.

The product should feel like a research desk rather than an AI chatbot or generic SaaS dashboard. The interface gives the user a clear path from feedback to approved task to evidence, with read-only states made visible at every important boundary.

## Design dials

- `DESIGN_VARIANCE: 7` — asymmetric layouts and strong composition, while retaining a usable grid.
- `MOTION_INTENSITY: 4` — restrained transitions and tactile feedback; no ambient animation for its own sake.
- `VISUAL_DENSITY: 4` — enough metadata for research work, with deliberate breathing room.

## Principles

1. **Evidence before action.** Every generated result should expose its source, status, and next safe step.
2. **Local-first is visible.** Show connection mode and read-only status near actions, not buried in settings.
3. **Editorial hierarchy.** Use typography and rules to establish hierarchy before adding cards, shadows, or decoration.
4. **One accent, one intent.** Use green for connected, approved, and safe-to-continue states. Do not introduce a second accent for convenience.
5. **Reviewable by default.** Search results, task graphs, and proposed writes should look like artifacts someone can inspect.

## Color tokens

```css
--ink: #111111;
--paper: #f7f8f5;
--paper-strong: #ffffff;
--line: #c8ccc6;
--muted: #69706a;
--accent: #2f7d5b;
--accent-soft: #e4eee7;
--accent-strong: #b9f23b; /* reserved for high-salience approval actions */
```

Use `--paper` for the page canvas and `--paper-strong` for surfaces that need to separate from it. Use `--ink` for headings and primary controls. Use `--accent` for connection, approved, and local-first labels. Use `--accent-strong` sparingly, only when the user is confirming a safe, explicit action.

Do not use gradients, purple AI glows, colored shadows, or multiple competing accent colors.

## Typography

Use a neutral grotesk/sans display face for product and marketing headings. The current static surface uses a system stack so it has no external font dependency; when the app gets a build pipeline, prefer a self-hosted display sans such as Geist, Satoshi, or PP Neue Montreal with a matching mono face.

- Display: `font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 650–750; letter-spacing: -0.055em;`
- Body: `font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5;`
- Metadata: `font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.14em;`

Headlines are left-aligned, compact, and rarely exceed two lines on desktop. Do not mix a decorative serif into a sans-serif headline.

## Layout

- Desktop content width: `min(1400px, calc(100vw - 64px))`.
- Desktop navigation: 64–72px tall, always one line.
- Use a 12-column grid for marketing composition and a 4–5 column rail/content split for the product.
- Prefer `border-top`, `border-bottom`, and `border-left` rules over card shadows.
- Corners are mostly square. Use a small `6px` radius only for controls and media crops.
- Hero uses a left copy column and a right product preview. Avoid a centered hero by default.
- Mobile collapses to one column: nav actions stack or condense, the product preview follows the copy, and the sidebar becomes a horizontal status strip.

## Spacing

Use a compact 4px base scale:

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`

Use larger gaps to create hierarchy, not larger type alone. Keep hero top padding under `96px` on desktop so the primary action remains in the first viewport.

## Product patterns

### Status

Show a small green dot plus a plain-language label:

`Zotero connected · local`  
`Approved-task-only search is active`  
`Local storage · synced`

Never use color without the text label. Connection and approval states must remain understandable in grayscale.

### Task rows

Task rows use a left status mark, one concise title, and a short timestamp or state line. Approved rows may use the accent; pending rows use a dashed neutral boundary; rejected rows use text, not red decoration, unless there is an actionable error.

### Research cards

Candidate literature shows, in order: item type, title, creators, year/publication, DOI or URL, tags, then the next review action. Keep bibliographic metadata in plain view; do not hide it behind a hover state.

### Actions

Primary labels should be short: `Start research`, `Review candidates`, `Approve task`, `Export JSON`.

Use a single primary CTA per context. Any action that could write to Zotero, notes, manuscript text, or Git must announce the write boundary and require an explicit second approval.

## Zotero connection user flow

The website implements the local-first decision from ADR 0001 as a visible connection sequence:

The primary action is labeled `Connect Zotero Desktop` so local access is never confused with account authorization.

1. On workspace load, show `Checking Zotero Desktop` while the local Proofline server calls the Zotero API on `localhost:23119`.
2. If the API responds and exactly one library contains papers, show `Zotero connected · local`, the selected library name, exact bibliographic paper count, and the `Read-only` boundary.
3. If the connector returns `selection_required`, show `Choose a library` and list every non-empty personal or group library with its type, ID, and paper count. Selecting one saves the choice for this project and reloads its papers.
4. If Zotero cannot be reached, show `Open Zotero and try again`, explain how to enable local API access, and preserve a retry action. Never display a connected state based on cached frontend data.
5. The Library view renders real top-level bibliographic metadata from the selected library. Notes, attachments, and annotations are excluded; every item keeps its stable source ID.
6. A future `Connect Zotero Cloud` control is shown as unavailable rather than simulated. When implemented, it redirects to Zotero OAuth and returns through the same library-choice flow.
7. If Zotero is unavailable, offer `Use demo library` as a secondary, opt-in action. The connection header, library name, and source IDs must all say `demo` or `fixture`; the app must never silently fall back to it.

Proofline never asks for a user's Zotero password. Local connection requires no API key. Manual Web API keys remain an advanced CLI/self-hosting option, not website onboarding.

### Connection states

- `checking`: local detection is in progress; connection actions are temporarily disabled.
- `connected`: the selected library and real paper count are available.
- `selection_required`: multiple non-empty libraries require an explicit choice.
- `unavailable`: Zotero is closed, local access is disabled, or the connector returned an actionable error.
- `connected / demo`: a clearly labelled, read-only fixture is active for reviewer testing.

## Evidence-to-note user flow

1. Feedback is submitted to the chosen offline, Codex CLI, or OpenAI runtime through the local app server.
2. The server validates both the task graph and project state before the browser displays tasks.
3. Approving a literature task updates both validated artifacts; approval does not itself perform a write.
4. The approved task may run a read-only search against the selected Zotero library or the explicitly selected demo fixture.
5. The user selects reviewed candidates. Proofline attaches structured `evidenceRefs` containing source ID, item key, library, title, creators, year, DOI, and URL.
6. Obsidian note generation first returns a preview. Bibliographic metadata is rendered as fact; claim, method, limitation, and relevance remain blank researcher-review fields.
7. The user provides an absolute vault path and separately chooses `Approve and write note`. The adapter creates a Markdown file under the managed evidence directory and refuses to overwrite an existing file.

## Landing page structure

1. Navigation with wordmark, three low-noise links, and one `Open workspace` action.
2. Hero with the promise: `Research that shows its work.`
3. Product preview showing the research desk, local connection, approved task, and candidate paper.
4. A short explanatory section for the feedback → task → evidence flow.
5. Feature sections using varied compositions: one full-width statement, one asymmetric split, one artifact preview.
6. Final CTA that repeats the same intent as the navigation: `Open workspace`.

The hero itself contains only an eyebrow, headline, subtext, and two actions. Trust, feature lists, and integration details belong below it.

## Motion and interaction

- Use the shared strong ease-out curve `cubic-bezier(0.23, 1, 0.32, 1)` with 160–240ms transitions for opacity, border color, and small transforms.
- Buttons compress by `scale(.98)` on press and move up `1px` on hover.
- Gate hover-only movement behind `@media (hover: hover) and (pointer: fine)` so touch and coarse-pointer devices do not inherit desktop hover behavior.
- Occasional modals may enter from `translateY(8px) scale(.98)` to `translateY(0) scale(1)` with opacity; keep the motion under 200ms and centered because the modal is not trigger-anchored.
- Product preview can reveal a subtle shimmer or row highlight on hover, but no looping motion is required.
- Respect `prefers-reduced-motion: reduce` by removing entrance animation and transform movement while preserving state color changes.

## Accessibility

- Maintain WCAG AA contrast for body text, labels, controls, and helper text.
- Every icon-like mark must have adjacent or accessible text.
- Use real buttons and links, visible focus rings, and labels above fields.
- Do not rely on color alone for approval, connection, or error state.
- Mobile layout must remain usable at 320px wide without horizontal scrolling.

## Do / do not

| Do | Do not |
| --- | --- |
| Use rules, whitespace, and type to create hierarchy | Fill every section with rounded cards |
| Make read-only and approval boundaries explicit | Hide safety state in a settings page |
| Use one calm green accent | Add purple gradients or neon data effects |
| Show real-looking evidence artifacts | Use vague AI copy like “unlock your potential” |
| Keep the hero focused | Put feature lists, logos, and pricing in the hero |

## Copy voice

Precise, calm, and slightly editorial. Prefer concrete verbs: `Find`, `Review`, `Trace`, `Approve`, `Keep`. Avoid hype, anthropomorphism, and claims that suggest autonomous writing or library changes.

Good: “Research that shows its work.”
Avoid: “Let AI take over your entire research project.”
