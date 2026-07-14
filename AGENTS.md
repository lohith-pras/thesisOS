# Proofline development guide

This file is the source of truth for anyone extending Proofline. Read it before changing product behavior, APIs, integrations, or submission material.

## Product contract

Proofline is a local-first research workspace. Its core loop is:

```text
reviewer feedback
  → validated task graph
  → researcher approval
  → read-only Zotero retrieval
  → researcher-selected evidence
  → grounded note preview
  → Claim Traceback and revision-response trail
  → separately approved local write
```

The product must never imply that a planned adapter is implemented. Preserve clear labels for fixture/demo data, local fallbacks, read-only access, and approval requirements.

## Non-negotiable boundaries

- Zotero is read-only. Never add, edit, delete, move, or annotate Zotero items.
- Only researcher-selected stable source IDs may enter a grounded draft. Unknown or unselected source IDs must be rejected.
- Every canonical mutation requires the current `expectedRevision`; do not weaken this by silently defaulting it. Missing revisions return `REVISION_REQUIRED`; stale revisions return `STATE_STALE`.
- Notes are previewed before a filesystem write, and every write needs a separate explicit approval.
- Judge mode (`npm run app -- --demo`) is isolated, deterministic, credential-free, and cannot write files or open local applications.
- VS Code opens only the configured local code folder. Obsidian opens only the configured vault. Overleaf is a saved project URL opened in the browser—never authenticate, sync, or edit remote Overleaf files.
- Do not commit real-library captures, credentials, private Zotero metadata, `.thesisos` state, or `demo-output/` artifacts.

## Architecture

- `app/` — dependency-free browser UI; `app/app.js` is the current view/state adapter and `app/styles.css` owns the visual system.
- `src/app-server.mjs` — local HTTP boundary; keep handlers thin and delegate business rules to `src/core/`.
- `src/core/project-state.mjs` — canonical project state and revision-guarded state transitions.
- `src/core/revision-workflow.mjs` and `src/core/workflow.mjs` — canonical feedback → task → evidence → draft workflow.
- `src/core/demo-library.mjs` and `src/core/workflow-runtime.mjs` — deterministic judge fixture and isolated runtime.
- `src/core/obsidian*.mjs` — vault selection/scaffolding, preview, and approval-gated Markdown writing.
- `test/` — Node test suite; add or update focused tests whenever a boundary, route, or state transition changes.
- `docs/` — reviewer-facing operational and submission documentation. Keep README, Devpost copy, and demo narration consistent with implemented behavior.

Canonical persistent state lives at `.thesisos/thesis-state.json` in a real workspace. Do not treat browser local storage as authoritative.

## Local integrations

### Zotero

Use the local Zotero Desktop API and retain library identity in the canonical project state. Support library selection rather than guessing when multiple populated libraries exist.

### VS Code

Use the native folder picker for an existing workspace or a parent folder for a newly created code workspace. Store only the selected path for the current project.

### Obsidian

An existing vault can be selected, or a new one can be scaffolded with the research structure. Managed literature notes live in `10_Literature_Notes/`; preserve user-authored content and update only notes marked as Proofline-managed.

### Overleaf

Validate and store only an `https://*.overleaf.com` project URL. The user creates and owns the project in Overleaf; Proofline only opens the URL.

## Development commands

```bash
npm install
npm test
npm run check
npm run check:frontend
npm run eval:retrieval
npm run app -- --demo
npm run test:browser
```

Run the narrowest relevant test while iterating, then run `npm test`, `npm run check`, and `npm run test:browser` before a submission-facing merge. `npm run eval:retrieval` reports the fixture regression metric; do not present it as a general benchmark.

## Implementation conventions

- Prefer small core functions with explicit inputs and stable error codes.
- Escape user-provided text before inserting it into UI HTML.
- Validate all API input at the server boundary.
- Keep demo behavior deterministic and visibly labelled; never depend on an API key, Zotero installation, or external model in judge mode.
- Use `apply_patch` for source edits. Preserve unrelated working-tree changes.
- Avoid broad refactors in `app/app.js` during submission work unless tests cover the affected workflow.
- Maintain the visual language: restrained, editorial, local-first, and clear about state and authority.

## Submission checklist

Before release, confirm:

1. `npm test`, syntax checks, retrieval evaluation, and browser verification are green.
2. README and Devpost copy accurately describe the current vertical slice and all four integrations.
3. Demo media shows the labelled fixture, Claim Traceback, and citation-boundary rejection.
4. No real-library metadata or local artifacts are tracked by Git.
5. Judge mode remains preview-only and filesystem-safe.
