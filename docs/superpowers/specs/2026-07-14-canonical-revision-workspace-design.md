# Canonical Revision Workspace Design

## Goal

Make ThesisOS authoritative for the relationships between supervisor feedback, thesis claims, evidence, and approved changes while leaving Zotero authoritative for bibliography data and a local thesis checkout authoritative for manuscript text.

The hackathon slice must be reproducible and safe: models propose structured links, the researcher approves them, canonical state records the decisions, and deterministic renderers produce an Obsidian-compatible workspace.

## Scope

### Included

- Persistent canonical project state at `.thesisos/thesis-state.json`
- Append-only revision events in canonical state
- Read-only discovery and parsing of a local thesis checkout containing `.tex` and `.bib` files
- Citation-key mapping from the bibliography to Zotero sources through normalized DOI first and normalized title second
- Claim–evidence link proposals with `proposed`, `approved`, and `rejected` states
- Explicit consent before thesis excerpts are sent to Codex or OpenAI
- Deterministic rendering of a dashboard, chapter views, feedback views, selected-evidence notes, and a claim ledger
- Explicit approval before generated workspace files are written
- Protected researcher sections that survive regeneration
- Status summaries embedded in the generated dashboard

### Excluded

- Overleaf authentication, cloning, or write-back
- Automatic thesis edits
- Automatic acceptance of model-proposed claims or evidence links
- Notes for unselected Zotero papers
- Retraction lookup and general drift detection
- Cloud sync and multi-user collaboration

## User Workflow

1. The researcher points ThesisOS at an existing local thesis checkout and an Obsidian vault.
2. ThesisOS scans `.tex` and `.bib` read-only, identifies chapters/sections and citation usage, and maps bibliography entries to Zotero sources where possible.
3. ThesisOS creates or updates canonical project state without discarding prior approvals or events.
4. The researcher may explicitly approve sending bounded thesis excerpts plus selected evidence to a model.
5. The model returns structured claim–evidence proposals. ThesisOS validates every referenced source and stores each proposal as `proposed`.
6. The researcher approves or rejects proposals.
7. After explicit write approval, deterministic renderers produce or update the managed workspace.

## Architecture

### Canonical state store

`src/core/project-state.mjs` owns state creation, loading, validation, atomic persistence, event appends, and state transitions. The server and CLI load state from disk; clients do not submit an authoritative state document.

The state contains:

- project identity and configured local paths
- feedback threads and tasks
- bibliography entries and Zotero mappings
- manuscript chapters and citation occurrences
- selected evidence
- claim–evidence proposals and their approval status
- generated-view metadata
- append-only events

Writes use a temporary sibling file followed by rename. An existing unsupported schema version fails visibly rather than being overwritten.

### Thesis scanner

`src/core/thesis-scan.mjs` recursively reads `.tex` and `.bib` files beneath the configured checkout. It ignores hidden/build directories, refuses paths outside the configured root, and never modifies the checkout.

The scanner extracts:

- bibliography records keyed by citekey
- DOI, title, author, and year where present
- chapter and section headings
- `\\cite`, `\\citep`, `\\citet`, and multi-key citation occurrences
- bounded surrounding text for review and optional model proposals

The scanner reports citation coverage and unresolved keys. It does not label uncited prose as a claim.

### Bibliography-to-Zotero mapping

Mapping is deterministic:

1. exact normalized DOI match
2. exact normalized title match when DOI is absent or unmatched
3. otherwise unresolved

Ambiguous matches remain unresolved. The mapping records the reason and confidence category; it does not silently guess.

### Claim proposal adapter

The adapter receives only explicitly approved manuscript excerpts and selected evidence. Its output schema contains a proposed claim, manuscript location, cited/related source IDs, and rationale.

Validation rejects unknown source IDs, unknown manuscript locations, duplicate proposal IDs, and malformed statuses. New model output always enters state as `proposed`; provider output cannot set `approved`.

### Deterministic workspace renderer

`src/core/workspace-renderer.mjs` converts canonical state into a map of relative Markdown paths to content. Rendering has no model calls and no filesystem side effects.

The initial workspace is:

```text
ThesisOS/
  00-Dashboard.md
  01-Chapters/<chapter-id>.md
  02-Literature/<source-id>.md
  03-Feedback/<feedback-id>.md
  Claims.md
```

Literature notes are rendered only for selected evidence. Every generated file includes `managed_by: thesisos`, the schema version, a stable entity ID, and a generated-content hash.

Researcher-authored content is enclosed by stable markers:

```markdown
<!-- thesisos:researcher:start -->
<!-- thesisos:researcher:end -->
```

On regeneration, content between these markers is copied into the new rendering. Missing or duplicated markers cause a visible conflict instead of destructive replacement.

### Workspace writer

The writer accepts renderer output only with explicit write approval. It writes beneath the configured vault's `ThesisOS/` directory, rejects path traversal, creates new files atomically, and updates only files marked `managed_by: thesisos`.

## Data Model

Canonical state uses schema version 2. A claim link has this minimum shape:

```json
{
  "id": "claim-001",
  "text": "The proposed thesis claim",
  "chapterId": "chapter-3",
  "locationId": "tex:chapters/method.tex:paragraph-12",
  "status": "proposed",
  "sourceIds": ["group:6568124:ABC"],
  "feedbackThreadIds": ["feedback-001"],
  "taskIds": ["task-literature-001"],
  "proposedBy": {
    "provider": "codex",
    "model": "codex-default"
  },
  "createdAt": "2026-07-14T00:00:00.000Z"
}
```

Approval and rejection append events containing actor, timestamp, entity ID, previous status, and next status. Existing events are never edited.

## Interfaces

The implementation adds a project CLI with commands equivalent to:

```text
thesisos init --thesis-dir <path> --vault <path>
thesisos scan
thesisos propose --provider codex
thesisos review --approve <claim-id>
thesisos render --approve-write
```

For the hackathon UI, the server may expose matching endpoints, but canonical persistence and deterministic core modules are the required slice. The generated dashboard is the primary status surface; a separate `status` command is optional.

## Error Handling

- Missing or malformed `.bib` files produce an actionable scan report rather than partial invented mappings.
- Unknown citekeys and unresolved Zotero matches remain visible in state and on the dashboard.
- Ambiguous DOI/title matches require researcher resolution.
- Unsupported state schema versions are never overwritten.
- Model unavailability uses a labelled local/no-proposal result; it does not fabricate proposals.
- Invalid model citations are rejected before state mutation.
- Unmanaged or malformed generated files are never overwritten.
- Filesystem operations remain local and bounded to configured roots.

## Testing Strategy

Implementation follows test-driven development. Unit tests cover:

- state creation, atomic persistence, reload, and append-only events
- preservation of approved/rejected proposals across rescans
- `.bib` parsing and common LaTeX citation forms
- DOI/title mapping, ambiguity, and unresolved entries
- proposal validation and approval transitions
- deterministic rendering
- researcher-section preservation and conflict refusal
- explicit write approval and path containment

Integration tests cover init → scan → proposal recording → approval → render using temporary thesis and vault directories. Existing approval, evidence, Zotero, drafting, and judge-mode tests must remain green.

## Acceptance Criteria

- Restarting ThesisOS preserves canonical project state and claim decisions.
- A fixture checkout produces stable chapter and citation records on repeated scans.
- Bibliography citekeys resolve to Zotero source IDs by DOI/title without requiring Better BibTeX.
- No model proposal becomes approved without an explicit review transition.
- No thesis excerpt reaches a model without explicit consent.
- Repeated rendering is byte-stable when state and researcher sections are unchanged.
- Regeneration preserves valid researcher sections and refuses unsafe overwrites.
- Dashboard output lists pending feedback, proposed links, approved links, unresolved citekeys, and selected evidence.
- The full existing and new automated test suite passes.

