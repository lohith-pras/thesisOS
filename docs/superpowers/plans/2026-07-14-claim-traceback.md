# Claim Traceback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a researcher inspect the provenance of each grounded draft source note: selected Zotero evidence, approved task, originating supervisor feedback, and its revision-response status.

**Architecture:** Add a pure read-model builder over canonical project state, expose it as a read-only API, and render a source-note selector alongside the note preview. The feature intentionally traces source-backed draft notes rather than claiming to identify arbitrary sentences in a manuscript.

**Tech Stack:** Node.js ESM, native `node:test`, HTTP API, vanilla JavaScript, CSS.

## Global Constraints

- Preserve the existing explicit approval boundaries; this feature is read-only.
- Use only state already persisted by the canonical evidence and drafting workflow.
- Clearly label the traced unit as a grounded source note, not an unverified manuscript claim.

---

### Task 1: Create the canonical traceback read model

**Files:** `src/core/claim-traceback.mjs`, `test/claim-traceback.test.mjs`

- [x] Build `createClaimTraceback(state, { feedbackThreadId, sourceId })` to join the source note, evidence, task, feedback, and matrix status.
- [x] Test the full payload and the missing-source error.

### Task 2: Make traceback available to the app

**Files:** `src/app-server.mjs`, `test/app-server.test.mjs`

- [x] Add the read-only `GET /api/workflow/claim-traceback` endpoint with required-parameter and canonical-state errors.

### Task 3: Add the researcher-facing Claim Traceback panel

**Files:** `app/app.js`, `app/styles.css`

- [x] Render one trace button for each grounded source note after a preview is available.
- [x] Render feedback → task → evidence → revision-status and reset stale trace data when the workflow changes.

### Task 4: Document and verify the submission slice

**Files:** `README.md`, `docs/devpost-submission.md`, `docs/submission-demo.md`

- [x] Describe source-note provenance, not arbitrary claim verification, and add a short demo beat.
- [x] Run `npm run check && npm run check:frontend && npm test && npm run test:browser && git diff --check`.
