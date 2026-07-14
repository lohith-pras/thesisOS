# 001 — Make every asynchronous workflow legible

- **Status**: DONE
- **Commit**: b514756
- **Severity**: HIGH
- **Category**: Purpose, accessibility, cohesion, and missed opportunities
- **Estimated scope**: 3 files, medium frontend change, 1 test file

## Problem

ThesisOS already sets `workflowBusy` and `workflowStatus` for decomposition, Zotero search, evidence attachment, note drafting, preview generation, and vault writing, but the feedback is not consistent or persistent across the shell:

```js
// app/app.js:13-15 — current state is a single page-local busy flag
workflowBusy: false,
workflowStatus: "",
workflowError: "",
```

```js
// app/app.js:183-192 — Zotero connection checks use a separate state path
async function requestConnection(path, options) {
  state.connection = { ...state.connection, status: "checking", message: "Checking for Zotero Desktop…" };
  render();
  try {
    const response = await fetch(path, options);
```

```js
// app/app.js:223-239 — vault picker waits silently while the native picker/server call runs
if (action === "choose-existing-vault" || action === "create-obsidian-vault" || action === "change-obsidian-vault") {
  ...
  const response = await fetch("/api/obsidian/pick", ...);
```

```js
// app/app.js:110-113 — status is only rendered inside the Evidence Notes panel
const busyNotice = state.workflowBusy ? `<div class="workflow-status" role="status" aria-live="polite"><i></i><span>${esc(state.workflowStatus || "Working…")}</span></div>` : "";
```

As a result, a user can navigate away from the active panel or wait through a task approval, Zotero connection, vault picker, or server response without knowing whether the app is working, what it is doing, or what they should do next.

## Target

Add one shell-level activity strip immediately below the top bar. It must remain visible regardless of the current view and must answer three questions:

1. **What is happening?** A plain-language phase label.
2. **What is the app waiting on?** Zotero Desktop, Codex CLI, the local server, a native folder picker, or the user.
3. **What happens next?** A completion message or a recovery action when the operation fails.

Use one shared operation shape in `app/app.js`:

```js
activity: {
  active: false,
  kind: null,
  label: "",
  detail: "",
  startedAt: null,
  outcome: null, // null | "success" | "error"
  recoveryAction: null
}
```

The activity strip should use `role="status"` and `aria-live="polite"`. While active, show an indeterminate spinner and the current label; never show a fabricated percentage. Keep operation-specific controls disabled while their request is active, but allow safe navigation unless the current action would be lost.

Required phase language:

| Operation | Label | Detail / next step |
| --- | --- | --- |
| Initial Zotero check | `Checking Zotero Desktop…` | `Looking for the running local connector.` |
| Library selection | `Loading the selected Zotero library…` | `Reading bibliographic metadata only.` |
| Task graph | `Codex CLI is building your task graph…` | `Validating proposed tasks before review.` |
| Task approval | `Saving your review decision…` | `Updating the local task state.` |
| Zotero search | `Searching Zotero for the approved task…` | `Ranking read-only library metadata.` |
| Evidence attachment | `Attaching the selected evidence…` | `Preparing the note workflow.` |
| Codex draft | `Codex CLI is drafting from the selected evidence…` | `Only the selected papers and feedback are being used.` |
| Preview | `Building the grounded note preview…` | `No filesystem write has happened.` |
| Vault picker | `Opening the Obsidian vault picker…` | `Choose an existing folder or create a new project vault.` |
| Vault write | `Saving the approved note to Obsidian…` | `Writing only inside the configured Evidence folder.` |

On success, replace the spinner with a check and a short confirmation for 2–4 seconds, then clear it. On error, replace the spinner with an error marker, preserve the error message, and show a specific action such as `Try again`, `Choose another vault`, or `Reconnect Zotero`. The existing inline error remains the detailed source of truth; the global strip is the orientation layer.

### Visual direction: restrained dot-matrix activity marker

The [Dot Matrix Animator](https://dot-matrix-animation.vercel.app/) reference is a good fit for a branded activity marker: its core treatment is a small grid of dots whose active cells change with configurable timing, opacity, color, glow, spacing, easing, and scale. Use the idea, not a full-screen clone:

- Place a 3×3 or 4×4 dot matrix at the left edge of the global activity strip.
- Animate only dot opacity and scale; keep the strip's text as the primary status channel.
- Use ThesisOS green for active dots, muted gray for inactive dots, and the existing paper/ink palette.
- Use a short, calm stepped sequence while active; do not make it look like a progress percentage.
- Keep it static or show a final checkmark on success and a stable error mark on failure.
- Respect `prefers-reduced-motion`: freeze the dots in a readable active state while the text continues to explain the operation.
- Do not use the reference's display font or neon/glow-heavy presentation in the main product UI; the existing editorial/mono system should remain coherent.

This gives the product a memorable “ThesisOS is thinking” signature without making a user decode animation to understand what is happening.

### SVG-Loaders review

The [SamHerbert/SVG-Loaders collection](https://github.com/SamHerbert/SVG-Loaders) is MIT-licensed and provides small pure-SVG loaders. The repository documents direct SVG usage and color customization, but also notes that animated SVG/SMIL support should be checked per browser.[SVG-Loaders README](https://github.com/SamHerbert/SVG-Loaders#usage)

Recommended choices:

- **`grid.svg` — first choice**: closest to the dot-matrix direction, calm enough for the global activity strip, and communicates ongoing work without implying percentage progress.
- **`three-dots.svg` — secondary choice**: useful for compact button-level states such as `Searching…` or `Drafting…`, but less distinctive than the grid.
- **`oval.svg` — limited fallback**: familiar and compact, but visually generic and less aligned with the ThesisOS identity.

Avoid `bars.svg`, `tail-spin.svg`, and `puff.svg` for the primary global indicator: their height changes, rotation, or expanding rings are more attention-seeking and less consistent with a calm research workflow. If an SVG asset is adopted, copy the selected MIT-licensed asset into the repository, recolor it to ThesisOS tokens, add an accessible text label outside the image, and provide a CSS/static fallback plus reduced-motion behavior. Prefer an inline or CSS-controlled adaptation over an opaque `<img>` when we need reliable theming and motion reduction.

## Repo conventions to follow

- Preserve the current vanilla HTML/CSS architecture in `app/app.js` and `app/styles.css`; do not add a framework or dependency.
- Reuse the existing `state.workflowBusy`, `state.workflowStatus`, `state.workflowError`, and `state.connection` data during migration rather than creating competing flags.
- Reuse `var(--accent)`, `var(--accent-soft)`, `var(--line)`, `var(--muted)`, and the existing `.button` styles.
- Reuse the existing `.workflow-status` spinner recipe from `app/styles.css:17`, but move the authoritative indicator to the shell and keep the animation restrained for this productivity interface.
- Preserve the existing reduced-motion rule in `app/styles.css:8`; ensure the new activity animation also works when animation is disabled.

## Steps

1. **Create one activity renderer in `app/app.js`.** Add `activityStrip()` near `shell()`. It should render nothing when idle, an indeterminate status strip while active, a success strip for the short confirmation window, and an error strip with an action when recovery is available. Escape all dynamic text.
2. **Render the strip from `shell()`.** Insert it immediately after the top bar and before `.page-content`, so it survives navigation and is visible on Overview, Feedback, Tasks, Library, Evidence notes, Connections, and Settings.
3. **Add small state helpers.** Add helpers equivalent to `beginActivity(kind, label, detail, recoveryAction)`, `updateActivity(label, detail)`, `completeActivity(label, detail)`, and `failActivity(error, recoveryAction)`. Keep `workflowBusy` synchronized for existing button disabling until all callers are migrated.
4. **Migrate every async path.** Set activity before the first `fetch()` and clear/update it in `finally` for: `requestConnection`, `selectZotero`, vault picker actions, evidence attachment, Codex note draft, local preview, Obsidian write, task review approval/rejection, Zotero search, and feedback decomposition. Add an immediate `render()` after starting each activity so there is no blank frame after a click.
5. **Make multi-phase operations explicit.** For Codex drafting, update the same activity from `drafting` to `Building the grounded note preview…`; for Zotero connection, update from checking to library selection/loading when applicable. Do not reset the strip between phases.
6. **Handle native picker cancellation separately.** A cancelled picker is not a server error. Return to idle or show `No vault selected` with `Choose existing vault` / `Create new vault`; do not leave a permanent error state.
7. **Cover the silent approval path.** Disable the modal action while review approval is in flight, show `Saving your review decision…`, and only close the modal after the server confirms the decision. If it fails, keep the modal open with `Try again`.
8. **Improve copy around waiting.** Add a short `detail` line to the strip and keep the active button label specific, e.g. `Drafting with Codex CLI…`, `Searching Zotero…`, or `Saving note…`. Avoid generic `Working…` except as an unreachable fallback.
9. **Add motion tokens and restrained motion in `app/styles.css`.** Use a compact enter transition under 300ms with opacity and `translateY`, and no layout-property animation. Prototype the `grid.svg` visual first, then implement the chosen marker inline or as CSS-controlled dots with opacity/scale only; keep the sequence calm and finite per cycle. Add a success icon transition only if it remains legible without motion.
10. **Add accessibility coverage.** Ensure status changes are announced once through the global live region, the dot matrix is `aria-hidden="true"`, buttons have accessible names, and `prefers-reduced-motion: reduce` freezes the dot matrix while preserving text, color, and outcome states.
11. **Add frontend contract tests.** Extend the existing source/UI assertions in `test/app-server.test.mjs` or the appropriate frontend test to verify the shell contains the global activity region, `aria-live="polite"`, the dot-matrix marker, the phase strings, and reduced-motion CSS. Add an interaction-level test if the current test harness supports it.

## Boundaries

- Do **not** add fake progress percentages, countdowns, or indefinite “almost done” language.
- Do **not** add a full-screen blocking overlay for normal requests; the user should be able to inspect safe parts of the workspace.
- Do **not** hide errors after a timeout; success may auto-clear, errors must remain until resolved or dismissed.
- Do **not** animate layout properties (`width`, `height`, `margin`, `padding`, `top`, `left`) or use `transition: all`.
- Do **not** add a new dependency or change the server API unless needed to distinguish picker cancellation from a real error.
- Do **not** remove the existing inline workflow errors; the global strip and local error copy have different jobs.
- Do **not** change approval boundaries, data sent to Codex, Zotero read-only behavior, or Obsidian overwrite rules.

## Verification

- **Mechanical**: run `npm test`, `npm run check`, and `npm run check:frontend`; all existing tests and the new activity assertions must pass.
- **Manual workflow**: run `npm run app -- --demo` and exercise decomposition, task approval, Zotero search, evidence attachment, Codex drafting, local preview, vault selection, and note writing.
- **Orientation check**: during every operation, navigate to another safe page and confirm the activity strip remains visible and still names the current phase.
- **Failure check**: stop Zotero, make Codex unavailable, cancel the native folder picker, and use an invalid vault path. Each case must explain what failed and expose the next action.
- **Race check**: click the active button repeatedly and confirm only one request begins; the label and spinner must not restart or duplicate.
- **Motion check**: inspect the activity strip at 10% playback speed. It should enter quickly, use opacity/transform only, and never distract from the phase text.
- **Reduced-motion check**: enable `prefers-reduced-motion: reduce`. Spinner rotation and movement must stop while the visible status text, success state, and error state remain.
- **Done when**: no supported async operation can leave the user staring at an unchanged page without a visible status, a completion outcome, or a recoverable error.
