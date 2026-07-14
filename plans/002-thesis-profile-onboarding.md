# Thesis Profile Onboarding Integration Plan

## Outcome

ThesisOS must understand the thesis before it interprets supervisor feedback. A researcher initializes a project from a local manuscript and an optional project document (PDF, Markdown, or text), reviews a proposed profile, supplies only missing decisions, and approves a minimum profile. Feedback decomposition is blocked until that minimum exists. The approved profile then improves task decomposition, Zotero retrieval, evidence drafting, and the generated workspace.

## Product rule

Model output is a proposal, never canonical truth. Canonical profile fields are either researcher-stated or explicitly accepted from an extracted proposal. Rescans and re-imports create new proposals and never overwrite approved values.

## What already exists

- `src/core/project-state.mjs`: schema-v2 canonical state, atomic writes, events, and propose/review transitions. Reuse and extend it.
- `src/core/thesis-scan.mjs`: read-only `.tex`/`.bib` scan with chapter headings and citation context. Enrich its output; do not build another manuscript scanner.
- `src/workspace-cli.mjs`: `init`, `scan`, `propose`, `review`, `render`, and `status`. Extend `init`; retain these commands.
- `src/core/workspace-renderer.mjs`: deterministic managed Markdown with protected researcher sections. Add `00-Profile.md` and profile readiness to the dashboard.
- `src/core/openai.mjs` and `src/core/codex.mjs`: strict structured-output adapters. Reuse their invocation boundaries with a new profile schema.
- `src/core/zotero.mjs` and `src/core/retrieval.mjs`: hybrid ranking and explicit query override. Supply an approved retrieval projection rather than changing the ranking engine first.
- `src/app-server.mjs`: existing local HTTP boundary and judge mode. Move it onto canonical state rather than extending disposable schema-v1 state.
- Existing approval, judge-mode, retrieval, and workspace tests provide regression coverage.

## Decisions

1. Parse PDFs locally with Mozilla PDF.js (`pdfjs-dist`). Do not upload raw project documents.
2. Accept `.pdf`, `.md`, and `.txt`. Image-only PDFs fail with a paste-text/OCR-output recovery message; OCR is not part of this slice.
3. Enforce 20 MiB, 100-page, and 150,000-character limits. Parse pages sequentially and retain page provenance.
4. Store `profileProposal` separately from the approved `profile`.
5. Approve or edit fields individually. Approval copies accepted values into canonical `profile` and records an event.
6. Require a minimum approved profile before decomposition: title/topic, at least one objective, selected scope/problem, and current stage.
7. Make schema-v2 project state canonical for the web app. Browser requests carry commands and entity IDs, not authoritative state documents.
8. Use one deterministic context builder with purpose-specific `decomposition`, `retrieval`, and `drafting` projections.
9. Add deterministic tests plus an 8–12-case context-resolution evaluation corpus.

## Canonical data model

Increment project state to schema version 3 with an explicit v2-to-v3 migration. Never silently reinterpret an unknown version.

```json
{
  "schemaVersion": 3,
  "project": {
    "name": "...",
    "thesisDir": "...",
    "vaultPath": "..."
  },
  "profile": {
    "revision": 1,
    "title": { "value": "...", "provenance": { "kind": "extracted-approved", "sourceId": "document-001", "locator": "page:1" } },
    "topic": { "value": "...", "provenance": { "kind": "extracted-approved", "sourceId": "document-001" } },
    "objectives": [{ "id": "objective-001", "text": "...", "provenance": { "kind": "extracted-approved", "sourceId": "document-001", "locator": "page:2" } }],
    "problems": [{ "id": "problem-p2", "name": "Interference Mitigation", "summary": "...", "selected": true, "provenance": { "kind": "user-stated" } }],
    "stage": { "value": "experiments", "provenance": { "kind": "user-stated" } },
    "deliverables": [],
    "deadlines": [],
    "supervisorExpectations": [],
    "seedReferences": [],
    "approvedAt": "..."
  },
  "profileProposal": {
    "id": "profile-proposal-001",
    "status": "pending",
    "sourceDocumentIds": ["document-001"],
    "fields": {},
    "proposedBy": { "provider": "codex", "model": "..." },
    "createdAt": "..."
  },
  "documents": [{
    "id": "document-001",
    "kind": "project-description",
    "filename": "project.pdf",
    "mediaType": "application/pdf",
    "sha256": "...",
    "pageCount": 4,
    "characterCount": 12410,
    "importedAt": "..."
  }]
}
```

Do not persist raw imported document text by default. Persist its digest, metadata, and approved field-level excerpts/locators. This minimizes sensitive duplication while keeping approval provenance auditable.

Profile readiness is a pure derived result:

```text
ready = nonempty(title or topic)
     && objectives.length >= 1
     && exactly one selected problem/scope anchor
     && stage is valid
```

## State transitions

```text
                  local parse                    model proposal
[document chosen] ----------> [normalized text] ----------------> [pending proposal]
       |                            |                                      |
       | parse/limit error          | explicit external consent missing   | field review
       v                            v                                      v
[recoverable error]         [consent required]                  [approved canonical profile]
                                                                         |
                                                   missing minimum fields | complete
                                                                         v
                                                               [feedback unlocked]

Re-import/rescan ------------------------------------------------> [new pending proposal]
                                                                    (approved profile unchanged)
```

Events: `document.imported`, `profile.proposed`, `profile.field.accepted`, `profile.field.edited`, `profile.field.rejected`, `profile.approved`, and `profile.readiness.changed`.

## Ingestion pipeline

Add `src/core/project-document.mjs` as the only document normalization boundary:

```text
path
 ├─ extension/media validation
 ├─ pre-read byte limit
 ├─ PDF: PDF.js sequential pages -> [{ locator: "page:N", text }]
 ├─ MD/TXT: UTF-8 decode -> [{ locator: "line:A-B", text }]
 ├─ normalize whitespace without destroying paragraph boundaries
 ├─ reject empty/image-only/over-limit extraction with stable error code
 └─ return { metadata, segments, combinedText }
```

The parser does no model calls and no state writes. `workspace init` or the server imports the metadata, requests explicit approval for external processing, then passes bounded normalized text to a profile proposal adapter. Raw PDFs never leave the machine.

Stable errors: `DOCUMENT_TYPE_UNSUPPORTED`, `DOCUMENT_TOO_LARGE`, `DOCUMENT_PAGE_LIMIT`, `DOCUMENT_TEXT_LIMIT`, `DOCUMENT_ENCRYPTED`, `DOCUMENT_PARSE_FAILED`, and `DOCUMENT_NO_TEXT`.

## Profile proposal and interview

Add a strict `PROFILE_PROPOSAL_SCHEMA`. Extract only facts supported by project-document or manuscript text. Each proposed field carries `sourceId`, `locator`, and a short supporting excerpt. Reject unknown fields, invalid stages, duplicate IDs, and locators outside imported segments.

After the proposal, ask only for missing or decision-dependent context:

1. Which proposed problem or scope did you choose?
2. What is the current stage: proposal, literature, experiments, writing, or revision?
3. What deliverable was agreed beyond the manuscript?
4. What deadline or next milestone matters now?

Chapter structure comes from `thesis-scan.mjs`; do not ask when it is available. All user answers use `user-stated` provenance and can be edited later.

## Context projections

Add `src/core/thesis-context.mjs`. It accepts validated canonical state and returns approved-only, bounded JSON.

- `decomposition`: title/topic, selected scope, objectives, stage, chapter/section map, and relevant section excerpts.
- `retrieval`: selected scope, relevant objective, chapter keywords, and the approved literature task. Exclude deadlines and supervisor identity.
- `drafting`: relevant objective, chapter intent, feedback, and selected evidence IDs. Exclude unrelated profile fields.

Section selection is deterministic first: explicit section/chapter reference, normalized heading match, then bounded keyword overlap. The model may interpret supplied context but may not invent a manuscript location. Every task gains optional `targetLocationIds` and `objectiveIds`, validated against canonical state.

## Server and browser integration

The server owns `.thesisos/thesis-state.json` through a small repository wrapper around `loadProjectState`/`saveProjectState`. Serialize mutations per process to avoid lost updates; every mutating request supplies `expectedRevision`, returning `409 STATE_STALE` on mismatch.

Endpoints:

```text
GET  /api/project                         current canonical state summary
POST /api/project/init                    configure paths and scan manuscript
POST /api/project/documents/import        local path import; metadata/extraction only
POST /api/project/profile/propose         explicit model-processing consent
POST /api/project/profile/review          accept/edit/reject fields + expectedRevision
POST /api/project/profile/answers         store user-stated missing fields
POST /api/workflow/decompose              feedback + provider + expectedRevision
```

`/api/workflow/decompose` loads canonical state server-side, checks profile readiness, builds the decomposition projection, validates returned location/objective IDs, persists the feedback thread/tasks, and returns the new revision. It no longer accepts a client-authored task graph or thesis state for review/search mutations.

Judge mode initializes an in-memory schema-v3 fixture profile and remains filesystem-write disabled. Its feedback flow exercises the same readiness gate and context builder.

Browser onboarding order:

```text
01 Thesis checkout -> 02 Project document -> 03 Review extracted profile
        -> 04 Answer missing decisions -> 05 Connect Zotero -> 06 Add feedback
```

The profile page shows source badges (`Project PDF p.2`, `Manuscript heading`, `You stated`), pending/approved status, missing required fields, and edit controls. Feedback remains visible but disabled until minimum readiness, with a link to the missing profile fields.

## Retrieval integration

Do not concatenate the full profile into one opaque query. `thesis-context.mjs` returns a bounded retrieval query containing:

```text
feedback terms + target chapter heading + selected problem + relevant objective
```

Persist the exact projection and query with the search artifact for explainability. Compare profile-aware and feedback-only retrieval in evaluation fixtures before changing ranking weights. Seed-reference reconciliation is a second-phase command that maps extracted reference metadata using existing DOI/title mapping; it must not block profile readiness.

## Workspace rendering

Add `00-Profile.md` with approved profile, provenance, readiness, objectives, selected scope, stage, milestones, and manuscript chapter map. The dashboard shows profile readiness and objective-to-chapter coverage. Pending proposals appear as pending review; they are never rendered as approved facts.

## Implementation phases

### Phase 1: Canonical profile foundation

- Add schema-v3 migration, profile validation, revision counter, readiness calculation, proposal review transitions, and events to `project-state.mjs`.
- Add pure context projections in `thesis-context.mjs`.
- Add profile and state-transition unit tests.

### Phase 2: Local document ingestion

- Add `pdfjs-dist` and `project-document.mjs` with PDF/Markdown/text extraction, limits, provenance segments, and stable errors.
- Add strict profile proposal schema and Codex/OpenAI adapters using normalized text only after consent.
- Extend `workspace init` with `--project-document` and proposal/review commands.

### Phase 3: Server convergence and onboarding UI

- Move app-server workflow mutations to canonical state with revisions and stale-write rejection.
- Add project/profile endpoints and judge fixture profile.
- Add onboarding/profile UI and gate feedback on minimum readiness.
- Keep legacy schema-v1 demo CLI artifacts behind an adapter until their callers migrate.

### Phase 4: Context threading

- Pass decomposition projection to offline, Codex, and OpenAI adapters.
- Validate task `targetLocationIds` and `objectiveIds`.
- Supply retrieval projection to Zotero/demo search and drafting projection to note adapters.
- Render the profile and objective/chapter coverage.

### Phase 5: Seed-reference reconciliation

- Parse proposed seed references from approved profile fields.
- Reuse DOI/title mapping to report present, missing, and ambiguous Zotero matches.
- Keep this report advisory and non-blocking.

## Test coverage diagram

```text
CODE PATHS                                             USER FLOWS
[+] project-document.mjs                              [+] First-time onboarding [->E2E]
 ├─ PDF within limits -> segmented text                 ├─ checkout + PDF + proposal + approve
 ├─ MD/TXT -> segmented text                            ├─ no project document -> manuscript + answers
 ├─ unsupported/large/encrypted/malformed               ├─ image-only PDF -> recovery instruction
 └─ empty/image-only -> DOCUMENT_NO_TEXT                 └─ resume after restart

[+] project-state.mjs                                 [+] Profile review [->E2E]
 ├─ v2 -> v3 migration                                  ├─ accept/edit/reject individual fields
 ├─ pending proposal does not change profile             ├─ stale tab -> 409 then reload
 ├─ accept/edit/reject + provenance events               └─ re-import preserves approved profile
 ├─ readiness false/true transitions
 └─ atomic save/reload preserves decisions

[+] thesis-context.mjs                                [+] Feedback [->E2E] [->EVAL]
 ├─ approved-only projections                           ├─ blocked before minimum profile
 ├─ relevant explicit section found                     ├─ ambiguous 3.2 resolves with context
 ├─ no section -> bounded project context                └─ task points to real objective/location
 └─ truncation excludes irrelevant/sensitive fields

[+] app-server + adapters                             [+] Retrieval [->EVAL]
 ├─ expectedRevision accepted/stale                      ├─ profile-aware query recorded
 ├─ provider success/failure/fallback                    ├─ relevant paper ranking comparison
 ├─ invalid location/objective rejected                  └─ seed papers present/missing/ambiguous
 └─ judge fixture follows identical readiness path
```

Every branch above requires a behavior test. Use Node's built-in `node:test`; no new test framework.

Specific test files:

- `test/project-document.test.mjs`: formats, limits, encrypted/malformed/image-only PDFs, page provenance, deterministic normalization.
- `test/project-profile.test.mjs`: migration, validation, field transitions, provenance, readiness, rescan preservation, immutable events, stale revision.
- `test/thesis-context.test.mjs`: purpose projections, approved-only filtering, section resolution, truncation, sensitive-field exclusion.
- `test/app-server.test.mjs`: canonical state endpoints, restart persistence, stale browser mutation, profile gate, judge fixture, recoverable errors.
- `test/decompose.test.mjs`: context included for every provider, invalid references rejected, legacy compatibility.
- `test/retrieval.test.mjs`: exact profile-aware query and feedback-only fallback.
- `test/profile-evaluation.test.mjs` plus `fixtures/profile-eval.json`: 8–12 context-resolution cases. Measure target-location accuracy, objective alignment, required literature-task recall, and unsupported-reference rate. Record model/provider and compare against the context-free baseline.

Acceptance gates:

- `npm run check && npm test && npm run check:frontend`
- 100% of new state/parser/context branches covered by behavior tests.
- Context-resolution eval: at least 90% target-location accuracy, 90% objective alignment, 100% unknown-ID rejection, and no regression versus baseline retrieval recall@5.
- Full judge workflow remains credential-free and write-disabled.

## Failure modes

| Path | Production failure | Handling and user result | Required test |
|---|---|---|---|
| PDF import | malformed/encrypted/too large | Stable 4xx code; preserve prior state; show paste-text recovery | Yes |
| PDF import | image-only document | `DOCUMENT_NO_TEXT`; explain OCR/paste fallback | Yes |
| Model proposal | timeout/unavailable | Keep normalized local import metadata; no proposal/state corruption; retry action | Yes |
| Model proposal | invented field or bad locator | Reject entire proposal before persistence; visible validation error | Yes |
| Profile review | two tabs edit same revision | `409 STATE_STALE`; reload and preserve first accepted mutation | Yes |
| Re-import | new extraction conflicts with approved profile | Create pending proposal; show diff; never overwrite approved field | Yes |
| Decomposition | minimum profile missing | `409 PROFILE_INCOMPLETE` with missing field IDs and onboarding link | Yes |
| Decomposition | model returns unknown objective/location | Reject output; no task mutation; clear retry/fallback message | Yes |
| Retrieval | projection produces empty query | Fall back to approved task/feedback terms and label fallback | Yes |
| Migration | malformed/unknown state version | Backup remains untouched; refuse startup mutation with recovery guidance | Yes |

No planned failure is silent. No state mutation occurs before complete validation.

## Parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Profile state and migration | core state, tests | — |
| Document parser | core ingestion, parser tests, dependencies | — |
| Profile proposal adapters | model adapters, schemas, tests | profile state; document parser contract |
| Server convergence | server, canonical repository, API tests | profile state |
| Onboarding UI | app, frontend tests | server endpoint contract |
| Context threading | model/retrieval/drafting adapters, evals | profile state; context builder |
| Workspace rendering | renderer, CLI, renderer tests | profile state |

Lane A: profile state -> context builder -> context threading.

Lane B: document parser -> profile proposal adapters.

Lane C: server convergence -> onboarding UI.

Lane D: workspace rendering and CLI after the schema contract stabilizes.

Launch A and B in parallel. Merge the schema/parser contracts, then launch C and D. Context threading follows the stable server/state merge. Avoid parallel edits to `project-state.mjs`, `app-server.mjs`, `openai.mjs`, and `codex.mjs` across lanes.

## NOT in scope

- OCR for scanned PDFs: image-only PDFs receive a clear paste-text/OCR-output fallback.
- Raw PDF upload to OpenAI/Codex: violates the chosen local extraction boundary and creates remote file lifecycle work.
- Automatic profile approval: conflicts with the canonical propose/review model.
- Automatic manuscript edits or Overleaf write-back: unrelated to establishing thesis intent.
- Retraction checks: useful later, but does not close the context hole.
- General objective/manuscript drift engine: profile and chapter coverage make this possible, but it is a separate feature.
- Arbitrary Word/PowerPoint ingestion: PDF, Markdown, and text cover the current onboarding source.
- Changing retrieval weights: first measure the benefit of the richer query using existing ranking.
- Seed-reference auto-import into Zotero: report only; Zotero remains read-only.

## Implementation Tasks

- [ ] **T1 (P1, human: ~1 day / Codex: ~90 min)** — Canonical state — Add schema-v3 profile, proposal lifecycle, migration, revisions, readiness, and events.
  - Surfaced by: Architecture and code-quality review; profile output must not self-approve and web state must persist.
  - Files: `src/core/project-state.mjs`, profile state tests.
  - Verify: migration, reload, proposal review, stale revision, and readiness tests.
- [ ] **T2 (P1, human: ~1 day / Codex: ~60 min)** — Document ingestion — Add bounded local PDF/Markdown/text normalization with PDF.js.
  - Surfaced by: Architecture and performance review; raw documents stay local and inputs must be bounded.
  - Files: `package.json`, `src/core/project-document.mjs`, parser tests/fixtures.
  - Verify: every stable error and successful provenance path.
- [ ] **T3 (P1, human: ~1 day / Codex: ~90 min)** — Profile proposal — Add strict structured extraction and field-level review with consent.
  - Surfaced by: Architecture review; extracted facts require provenance and explicit acceptance.
  - Files: profile schema/adapter modules, `src/core/openai.mjs`, `src/core/codex.mjs`, tests.
  - Verify: unknown fields/locators fail and accepted fields retain provenance.
- [ ] **T4 (P1, human: ~1.5 days / Codex: ~2 h)** — Server convergence — Move browser workflow mutations onto canonical state with revision checks.
  - Surfaced by: Code-quality review; schema-v1 and schema-v2 are competing sources of truth.
  - Files: `src/app-server.mjs`, canonical state repository, server tests.
  - Verify: restart persistence, stale-write conflicts, no client-authored authoritative state.
- [ ] **T5 (P1, human: ~1 day / Codex: ~90 min)** — Onboarding UI — Add document import, profile review/interview, readiness, and feedback gate.
  - Surfaced by: Architecture review; the product must collect context before feedback.
  - Files: `app/app.js`, `app/styles.css`, frontend/server tests.
  - Verify: full onboarding, recovery, editing, and judge fixture flows.
- [ ] **T6 (P1, human: ~1 day / Codex: ~75 min)** — Context projections — Thread approved, purpose-specific context through decomposition, retrieval, and drafting.
  - Surfaced by: Code-quality review; consumers need one consistent approved-only projection.
  - Files: `src/core/thesis-context.mjs`, model/retrieval/drafting adapters, tests.
  - Verify: no unapproved/sensitive fields escape and returned IDs exist in canonical state.
- [ ] **T7 (P1, human: ~1 day / Codex: ~90 min)** — Quality eval — Add context-resolution corpus and regression thresholds.
  - Surfaced by: Test review; schema validation cannot prove contextual task quality.
  - Files: `fixtures/profile-eval.json`, eval runner/test, package scripts, docs.
  - Verify: target/objective thresholds and retrieval recall@5 baseline.
- [ ] **T8 (P2, human: ~5 h / Codex: ~45 min)** — Workspace views — Render approved profile, readiness, provenance, and objective/chapter coverage.
  - Surfaced by: Product integration; canonical context must be visible and inspectable.
  - Files: `src/core/workspace-renderer.mjs`, `src/workspace-cli.mjs`, tests.
  - Verify: deterministic render and researcher-section preservation.
- [ ] **T9 (P2, human: ~5 h / Codex: ~45 min)** — Seed references — Report present/missing/ambiguous Zotero matches using existing mapping.
  - Surfaced by: Project-document integration; seed bibliography gives immediate onboarding value.
  - Files: citation mapping/profile report modules and tests.
  - Verify: DOI/title matching, ambiguity, and read-only behavior.

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---:|---|---|
| 1 | Scope reduced and decisions resolved | 8 review issues folded into the plan; 0 known silent failure paths; outside voice unavailable because the installed Codex CLI cannot run the configured model |

VERDICT: READY FOR IMPLEMENTATION; OUTSIDE VOICE UNAVAILABLE, NON-BLOCKING

NO UNRESOLVED DECISIONS
