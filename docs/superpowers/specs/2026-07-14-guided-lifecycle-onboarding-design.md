# Guided Lifecycle Onboarding and Overview Design

Date: 2026-07-14
Status: Approved

## Purpose

ThesisOS currently exposes useful capabilities as disconnected pages and asks for implementation-specific paths before explaining the result. The redesign must create one coherent path from product introduction to a personalized thesis workspace. It must preserve the product's core integrity rule: feedback may be captured without setup, but AI task decomposition must not run without sufficient approved thesis context.

## Product principles

1. Show the outcome before asking setup questions.
2. Require only a thesis name; every other onboarding step is optional and skippable.
3. Ask about the research before asking about integrations.
4. Explain an integration's benefit before requesting access or a filesystem path.
5. Make onboarding answers visibly change the resulting workspace.
6. Treat incomplete setup as a recommended next action, not an error.
7. Use truthful integration language. A local folder or Overleaf Git checkout is a linked manuscript, not a live Overleaf connection.
8. Derive displayed status and statistics from canonical project state.

## Information architecture

### First run

When no project exists, ThesisOS opens a product landing page. It describes the actual lifecycle: establish thesis intent, connect research tools, capture feedback, approve tasks, attach evidence, and write evidence notes. The primary action is **Set up my thesis**. A secondary **Explore with demo data** action remains explicitly labelled as demo behavior.

After project creation, returning users open Overview. The product explanation remains available through **About ThesisOS** near the bottom of the sidebar.

### Workspace navigation

The workspace sidebar contains:

- Overview
- Thesis profile
- Tasks
- Library
- Evidence notes
- Connections
- Settings
- About ThesisOS

The standalone Feedback navigation item is removed. Feedback capture and the latest feedback state live on Overview.

## Onboarding flow

Onboarding is a guided conversation rather than an adapter configuration form. It persists progress after every step and supports Back, Continue, and Skip for now where applicable.

1. **Outcome preview.** Demonstrate the result in one short sequence: thesis intent and supervisor feedback become reviewable, evidence-backed next actions.
2. **Thesis name.** Ask “What should we call your thesis?” This is the only required answer and creates the canonical project.
3. **Understand the work.** Offer project PDF, Markdown, or text import; thesis stage; and current scope or selected problem. All are optional. Imported profile fields remain proposed until approved.
4. **Build the research base.** Offer the local, read-only Zotero connection after explaining that it enables evidence retrieval and seed-reference matching.
5. **Choose working outputs.** Offer a local manuscript folder or Overleaf Git checkout and an Obsidian vault. Explain both paths in plain language before opening a folder picker. Both are optional.
6. **Personalized preview.** Show the actual thesis title, stage, scope, integration state, setup gaps, and next recommended action that will appear on Overview.
7. **Enter workspace.** Confirm that the workspace is ready enough to begin. Missing optional setup remains resumable from Overview, Thesis Profile, or Connections.

Closing onboarding does not lose completed answers. Reopening it resumes at the first unfinished relevant step, while users can also edit individual values outside the wizard.

## Guided lifecycle Overview

Overview is the control center and default post-onboarding route.

### Current thesis state

The page header shows:

- canonical thesis name;
- current stage, when known;
- selected scope or problem, when known;
- one recommended next action;
- a **Continue setup** action only when useful.

Unknown optional values are omitted rather than replaced with generic claims.

### Basic statistics

Four compact statistics are derived at render time:

- Zotero bibliographic paper count;
- approved objective count;
- open task count;
- feedback thread count.

Unavailable values display an em dash. Zero is displayed only when canonical state confirms a genuine zero.

### Feedback workspace

Overview contains the complete supervisor-feedback form, not merely a shortcut. It includes an optional title, feedback body, and a **Turn into proposed tasks** action.

The latest feedback card appears below the form and links to its proposed tasks or review state. Feedback can always be saved once a named project exists. If approved thesis context is insufficient, ThesisOS saves the feedback and shows **Feedback saved — add thesis context to generate specific tasks**. It does not invoke a generic decomposition fallback.

### Setup path

The setup path summarizes optional capabilities and links every incomplete item to the exact configuration section. It is not a permanent large checklist.

- It begins expanded while onboarding is active or setup is incomplete.
- The user can select **Hide setup path** at any time.
- When collapsed, it reads **Setup · N of M configured · Show**.
- When all selected setup items are complete, it automatically collapses to **Setup complete · Show details**.
- The expanded/collapsed preference persists locally.
- A newly unavailable integration does not force the panel open; a compact warning appears in its status instead.

Completion counts only configured capabilities the product can actually verify. Skipped optional items do not prevent workspace use.

### Integration health

Three compact cards show capability state and lead to Connections or Thesis Profile:

- **Zotero:** unavailable, selection required, or connected locally; include selected library and paper count when available.
- **Manuscript:** not linked, linked as local folder, or linked as Overleaf Git checkout; include the path when linked.
- **Obsidian:** not initialized or initialized; include the vault path when initialized.

The interface must never display **Overleaf connected** until ThesisOS implements and verifies a live Overleaf integration.

## State and readiness model

The UI distinguishes project existence, setup completeness, and workflow readiness.

### Project existence

A project exists as soon as a valid name is saved. No integration is required to enter the workspace.

### Capability state

Canonical state exposes or derives these statuses:

- project document: not added, proposed, or approved;
- thesis context: insufficient or sufficient;
- manuscript: not linked, local folder, or Overleaf Git checkout;
- Zotero: unavailable, selection required, or connected;
- Obsidian: not initialized or initialized;
- thesis stage and scope: absent or provided.

One shared status projection supplies onboarding, Overview, Thesis Profile, and Connections. Individual views must not independently guess capability state.

### Workflow readiness

- Feedback capture requires only a named project.
- Task decomposition requires sufficient approved thesis context.
- Literature search requires approved literature work and an available Zotero library.
- Evidence-note writing requires selected evidence and an initialized Obsidian vault.
- Manuscript-aware section targeting requires a linked, successfully scanned manuscript.

When a dependency is missing, the initiating work is preserved where possible and the response identifies the exact recovery action.

## Data flow and component boundaries

1. A project-readiness projection derives capability and workflow states from canonical project state plus live Zotero availability.
2. Onboarding reads that projection, saves one bounded mutation per step, and never creates a second onboarding-only project model.
3. Overview reads the same projection and canonical entity collections to render statistics, recommended action, setup path, feedback, and integrations.
4. Feedback capture persists a feedback thread before attempting decomposition. Decomposition is a separate readiness-gated transition.
5. Browser-local storage contains presentation preferences only, including setup-path collapse state and the last active view. Canonical thesis facts never live only in browser storage.

The existing monolithic frontend may be split into focused render and transition helpers for landing, onboarding, readiness projection consumption, Overview, and feedback. This refactoring is in scope only where needed to prevent the new lifecycle logic from becoming duplicated conditionals.

## Failure and recovery behavior

- Skipped setup is neutral and never styled as failure.
- A folder-picker cancellation returns to the current step without discarding prior progress.
- Invalid manuscript or vault paths show an inline error and do not invalidate the project.
- Zotero unavailability preserves the skipped or previous selection state and offers Retry or Skip for now.
- Document extraction failure preserves the imported-file step state and offers another document or Skip for now.
- Feedback remains saved if decomposition is unavailable or blocked.
- Statistics with unknown inputs show an em dash rather than an invented count.
- Broken integrations show compact warnings and direct recovery actions without reopening the setup path automatically.

## Accessibility and responsive behavior

- The wizard supports keyboard navigation, visible focus, labelled controls, and announced validation errors.
- Progress is expressed in text as well as visually.
- Skip actions are explicit buttons, not low-contrast links.
- Connection state never depends on color alone.
- On narrow screens, statistics become a two-column grid, feedback precedes setup, and integration cards stack vertically.
- Setup-path collapse controls expose `aria-expanded` and identify the controlled region.

## Verification

Automated coverage must include:

1. First-run landing visibility and transition into onboarding.
2. Name-only onboarding through workspace entry.
3. Every optional step skipped independently and collectively.
4. Onboarding persistence and resume behavior.
5. Imported profile proposal review within onboarding.
6. Zotero unavailable, ambiguous-library, and connected states.
7. Manuscript and Obsidian folder cancellation, invalid path, and success states.
8. Canonical readiness projection for every capability and workflow gate.
9. Feedback persistence without sufficient context and later decomposition after context becomes sufficient.
10. Overview statistics derived from canonical state, including unknown versus genuine zero.
11. Setup-path collapse, automatic completion collapse, and locally persisted preference.
12. Honest manuscript labels for local and Overleaf Git folders.
13. Responsive layout and essential accessibility attributes.
14. Regression coverage for the existing judge demo and complete thesis-profile workflow.

## Out of scope

- Live Overleaf API authentication or synchronization.
- Cloud accounts or cross-device onboarding state.
- Fabricated analytics or progress scoring.
- Mandatory integrations beyond the project name.
- Automatic AI decomposition without sufficient approved thesis context.
