# Canonical Workflow and Provider Seams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canonical project state the single authority for the feedback-to-evidence-to-note lifecycle, while retaining swappable model providers and separating the Zotero snapshot boundary from retrieval ranking.

**Architecture:** Introduce a deep `workflow` core module that receives only canonical entity IDs plus an expected revision, performs allowed state transitions, records provenance, and returns a browser/CLI read model. The HTTP server becomes a thin adapter; `app/app.js` stores view state only. Keep model-provider transport separate from workflow policy, and make Zotero snapshot creation independent of ranking.

**Tech Stack:** Node.js 22 ESM, `node:test`, local Zotero Desktop API, Codex CLI, OpenAI Responses API, OpenRouter chat completions, Ollama `/api/chat`, Markdown/Obsidian.

## Global Constraints

- Preserve ADR 0002: evidence is selected by the researcher before drafting; filesystem writes are separately approved.
- Preserve ADR 0004: generated drafts may reference only selected stable source IDs.
- Every mutation receives `expectedRevision` and rejects stale requests with `STATE_STALE`.
- Zotero stays read-only; vault audit remains read-only until an explicitly approved future mutation API exists.
- GPT-5.6 remains an explicit OpenAI provider option; alternatives must be visibly labelled.
- Follow red-green-refactor and commit each task independently.

---

### Task 1: Define canonical workflow state and read model

**Files:**
- Create: `src/core/workflow.mjs`
- Modify: `src/core/project-state.mjs`
- Create: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: `ProjectState`, `taskGraph`, selected Zotero candidates, `expectedRevision`.
- Produces: `attachCanonicalEvidence(state, input, options)` and `workflowReadModel(state, feedbackThreadId)`.

- [ ] **Step 1: Write the failing tests**

```js
test("attaches evidence to an approved canonical literature task", () => {
  const next = attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision
  }, { searchArtifact });
  assert.equal(next.evidence[0].sourceId, "group:1:A");
  assert.equal(next.revision, state.revision + 1);
});

test("rejects evidence attachment when the revision is stale", () => {
  assert.throws(() => attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision - 1
  }, { searchArtifact }), /STATE_STALE/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/workflow.test.mjs`
Expected: FAIL because `workflow.mjs` and `attachCanonicalEvidence` do not exist.

- [ ] **Step 3: Implement the minimal transition module**

```js
export function attachCanonicalEvidence(state, input, { searchArtifact, now }) {
  // validate state and revision; require approved literature task
  // reuse selectEvidenceReferences; persist records under state.evidence
  // append event("evidence.attached", now, { feedbackThreadId, taskId, sourceIds })
  // increment revision and return validateProjectState(next)
}

export function workflowReadModel(state, feedbackThreadId) {
  // return feedback, tasks, selected evidence, draft/preview status, and next allowed action
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/workflow.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow.mjs src/core/project-state.mjs test/workflow.test.mjs
git commit -m "feat: centralize canonical evidence transitions"
```

### Task 2: Move note draft/preview provenance into canonical state

**Files:**
- Modify: `src/core/workflow.mjs`
- Modify: `src/core/project-state.mjs`
- Modify: `src/core/obsidian.mjs`
- Modify: `test/workflow.test.mjs`

**Interfaces:**
- Consumes: an attached evidence record and a validated grounded draft.
- Produces: `recordCanonicalDraft`, `createCanonicalNotePreview`, and a read model containing `draftStatus` and `preview`.

- [ ] **Step 1: Write the failing test**

```js
test("stores a validated draft against selected canonical evidence", () => {
  const next = recordCanonicalDraft(stateWithEvidence, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    draft: { overview: "Grounded", sourceNotes: [{ sourceId: "group:1:A", summary: "x", relevance: "y" }] },
    expectedRevision: stateWithEvidence.revision
  });
  assert.equal(next.evidence[0].draft.sourceNotes[0].sourceId, "group:1:A");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/workflow.test.mjs`
Expected: FAIL because `recordCanonicalDraft` does not exist.

- [ ] **Step 3: Implement the transition and preview projection**

```js
export function recordCanonicalDraft(state, input, options = {}) {
  // validateGroundedDraft(input.draft, selectedEvidence)
  // save provider/model/createdAt alongside the evidence record, append event, increment revision
}

export function createCanonicalNotePreview(state, input) {
  // render from the canonical evidence record only; return preview without writing
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/workflow.test.mjs test/note-drafting.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow.mjs src/core/project-state.mjs src/core/obsidian.mjs test/workflow.test.mjs
git commit -m "feat: persist canonical grounded note lifecycle"
```

### Task 3: Make the HTTP server a thin workflow adapter

**Files:**
- Modify: `src/app-server.mjs`
- Modify: `test/app-server.test.mjs`

**Interfaces:**
- Consumes: `/api/workflow/*` bodies containing canonical IDs and `expectedRevision`.
- Produces: `{ state, workflow: workflowReadModel(...) }` from every canonical workflow mutation.

- [ ] **Step 1: Write the failing API test**

```js
test("attaches evidence through canonical IDs rather than browser task artifacts", async () => {
  const response = await fetch(`${baseUrl}/api/workflow/evidence/attach`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedbackThreadId, taskId, sourceIds: ["group:1:A"], expectedRevision })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.workflow.selectedEvidence[0].sourceId, "group:1:A");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/app-server.test.mjs`
Expected: FAIL with `404` for `/api/workflow/evidence/attach`.

- [ ] **Step 3: Replace the legacy route sequencing**

```js
// Load canonical state, obtain the saved search artifact by task ID,
// call attachCanonicalEvidence, persist with saveProjectState,
// return workflowReadModel. Do not accept taskGraph, searchArtifact,
// evidenceRefs, draft, or preview objects from the browser for mutations.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/app-server.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app-server.mjs test/app-server.test.mjs
git commit -m "refactor: route workflow through canonical state"
```

### Task 4: Reduce the browser to a workflow read-model adapter

**Files:**
- Modify: `app/app.js`
- Modify: `test/app-server.test.mjs`

**Interfaces:**
- Consumes: server-returned `workflow` read model.
- Produces: requests with IDs, source IDs, and expected revision only.

- [ ] **Step 1: Write the failing source-level regression test**

```js
test("browser does not post client-carried workflow artifacts", async () => {
  const source = await readFile("app/app.js", "utf8");
  assert.doesNotMatch(source, /body: JSON\.stringify\(\{[^}]*taskGraph/);
  assert.doesNotMatch(source, /body: JSON\.stringify\(\{[^}]*searchArtifact/);
  assert.match(source, /feedbackThreadId/);
  assert.match(source, /expectedRevision/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/app-server.test.mjs`
Expected: FAIL because evidence and note actions still post browser-held artifacts.

- [ ] **Step 3: Replace client-held workflow state**

```js
// Keep only view selection, form state, and the latest server read model.
// On every mutation: post IDs + expectedRevision; replace state.projectState
// and state.workflow with the server response; render from state.workflow.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/app-server.test.mjs && npm run check:frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/app.js test/app-server.test.mjs
git commit -m "refactor: render workflow from canonical read model"
```

### Task 5: Deepen the Zotero library snapshot adapter

**Files:**
- Create: `src/core/zotero-snapshot.mjs`
- Modify: `src/core/zotero.mjs`
- Modify: `src/core/retrieval.mjs`
- Create: `test/zotero-snapshot.test.mjs`

**Interfaces:**
- Produces: `loadZoteroSnapshot(options) -> { library, libraries, papers, diagnostics }`.
- Consumes: snapshot papers in retrieval; ranking receives no Zotero transport functions.

- [ ] **Step 1: Write the failing snapshot test**

```js
test("returns normalized library papers and selection diagnostics once", async () => {
  const snapshot = await loadZoteroSnapshot({ library: "10", fetchImpl });
  assert.equal(snapshot.library.id, "10");
  assert.equal(snapshot.papers[0].sourceId, "group:10:A");
  assert.equal(snapshot.diagnostics.pageCount, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/zotero-snapshot.test.mjs`
Expected: FAIL because `loadZoteroSnapshot` does not exist.

- [ ] **Step 3: Extract selection, pagination, normalization, and diagnostics**

```js
export async function loadZoteroSnapshot(options = {}) {
  // resolve library once, fetch all pages, filter bibliographic records,
  // normalize stable source IDs, and return diagnostics.
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/zotero-snapshot.test.mjs test/retrieval.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/zotero-snapshot.mjs src/core/zotero.mjs src/core/retrieval.mjs test/zotero-snapshot.test.mjs
git commit -m "refactor: isolate Zotero library snapshots"
```

### Task 6: Complete the model-provider seam across drafting and profile extraction

**Files:**
- Modify: `src/core/model-provider.mjs`
- Modify: `src/core/note-drafting.mjs`
- Modify: `src/core/profile-extraction.mjs`
- Modify: `src/app-server.mjs`
- Modify: `test/model-provider.test.mjs`
- Modify: `test/note-drafting.test.mjs`
- Modify: `test/profile-extraction.test.mjs`

**Interfaces:**
- Consumes: `{ provider: "openai"|"openrouter"|"ollama", model, messages, schema }`.
- Produces: `{ provider, model, value }` and preserves consent plus source/locator validation in domain modules.

- [ ] **Step 1: Write failing domain tests**

```js
test("drafts through Ollama while retaining selected-source validation", async () => {
  const draft = await draftEvidenceNoteWithProvider(input, {
    provider: "ollama", model: "qwen3", fetchImpl
  });
  assert.equal(draft.provider, "ollama");
  assert.equal(draft.sourceNotes[0].sourceId, "group:1:A");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/note-drafting.test.mjs test/profile-extraction.test.mjs`
Expected: FAIL because provider-neutral drafting/profile functions do not exist.

- [ ] **Step 3: Delegate transport only**

```js
// `draftEvidenceNoteWithProvider` calls generateStructuredJson then
// validateGroundedDraft. `proposeProfileWithProvider` calls the same runtime
// then validateProfileProposal. Consent checks remain before transport.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/model-provider.test.mjs test/note-drafting.test.mjs test/profile-extraction.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/model-provider.mjs src/core/note-drafting.mjs src/core/profile-extraction.mjs src/app-server.mjs test/model-provider.test.mjs test/note-drafting.test.mjs test/profile-extraction.test.mjs
git commit -m "feat: share model providers across grounded workflows"
```

### Task 7: Add Paper Map and safe vault-audit actions to the canonical read model

**Files:**
- Modify: `src/core/workflow.mjs`
- Modify: `src/core/paper-map.mjs`
- Modify: `src/core/vault-audit.mjs`
- Modify: `src/app-server.mjs`
- Modify: `app/app.js`
- Modify: `test/workflow.test.mjs`
- Modify: `test/vault-audit.test.mjs`

**Interfaces:**
- Produces: a Paper Map from canonical selected evidence; audit accepts only the configured canonical vault path.

- [ ] **Step 1: Write failing safety and read-model tests**

```js
test("refuses audit paths that differ from the configured vault", async () => {
  await assert.rejects(() => auditConfiguredVault(state, "/tmp/other"), /configured vault/);
});

test("read model exposes a map only for selected evidence", () => {
  assert.equal(workflowReadModel(state, "feedback-1").paperMaps[0].root.id, "paper:group:1:A");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/workflow.test.mjs test/vault-audit.test.mjs`
Expected: FAIL because audit accepts arbitrary paths and the read model has no Paper Maps.

- [ ] **Step 3: Implement canonical map projection and vault-path guard**

```js
// Build cards/maps only from state.evidence selected for the feedback thread.
// Compare requested audit path to resolve(state.project.vaultPath); reject
// any mismatch before auditObsidianVault is called.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/workflow.test.mjs test/vault-audit.test.mjs test/app-server.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow.mjs src/core/paper-map.mjs src/core/vault-audit.mjs src/app-server.mjs app/app.js test/workflow.test.mjs test/vault-audit.test.mjs
git commit -m "feat: project canonical paper maps and vault audit"
```

## Final verification

- [ ] Run `npm test` — expected: all tests pass.
- [ ] Run `npm run check && npm run check:frontend` — expected: exit 0.
- [ ] Run `git diff --check` — expected: no output.
- [ ] Verify the browser can reload a persisted project and render the same workflow read model without recreating evidence, draft, or preview artifacts in client state.
- [ ] Verify GPT‑5.6, OpenRouter, and Ollama provider options are clearly labelled and only selected evidence is sent to drafting.

## Plan self-review

- Review candidate 01 is covered by Tasks 1–4: canonical workflow transitions, provenance, read model, and adapter thinning.
- Review candidate 02 is covered by Task 4: browser state is reduced to UI state and server read-model rendering.
- Review candidate 03 is covered by Task 5: snapshot access is separated from ranking.
- Current provider requirement is covered by Task 6 without weakening consent or source validation.
- Paper Map and the vault-audit path review finding are covered by Task 7.

Plan complete and saved to `docs/superpowers/plans/2026-07-14-canonical-workflow-and-provider-seams.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
