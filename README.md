# ThesisOS

ThesisOS is a local-first thesis agent for Master’s and Bachelor’s students. It turns supervisor feedback into a reviewable, evidence-backed change set across literature, notes, thesis text, and experiments.

## Working vertical slice

The local website now closes one complete, approval-gated research loop:

```text
supervisor feedback
  → offline, Codex CLI, or GPT-5.6 decomposition
  → validated task graph and thesis state
  → explicit literature-task approval
  → read-only Zotero search
  → reviewed paper selection with stable evidence references
  → Obsidian Markdown preview
  → explicit write approval
  → non-overwriting note creation in a local vault
```

Zotero remains read-only. The note preview uses bibliographic facts and source links; it leaves claim, method, limitation, and relevance fields for researcher review instead of inferring them from metadata.

## Run it

Requirements: Node.js 22+. The offline demo does not need credentials. The OpenAI path needs `OPENAI_API_KEY`.

Start the local workspace website and its read-only Zotero bridge:

```bash
npm run app
```

For judges or reviewers, start the complete fixture workflow with no Zotero, Ollama, API key, or filesystem writes:

```bash
npm run app -- --demo
```

Judge mode activates the labelled demo library immediately. It tries Codex CLI for decomposition and visibly falls back to the validated deterministic runtime when Codex is unavailable. The workflow stops at note preview so it cannot write to a judge's filesystem.

Open `http://127.0.0.1:4173`. Keep Zotero Desktop running; the website checks the local API automatically, asks for a library choice only when necessary, and loads real bibliographic metadata into the Library view.

The website defaults to the authenticated Codex CLI runtime for feedback decomposition. Choose the deterministic offline runtime when Codex is unavailable, or the GPT-5.6 runtime when `OPENAI_API_KEY` is configured.

### Website walkthrough

1. Connect Zotero Desktop, or start with `--demo`. Demo data is always labelled and never presented as a real connection.
2. Add exact supervisor feedback and choose a decomposition runtime.
3. Review the validated tasks and approve the literature task.
4. Run the approved read-only library search.
5. Select reviewed papers and attach them as structured evidence references.
6. Choose the local template, or explicitly approve sending only the selected evidence to GPT-5.6 for a grounded draft whose citations are restricted to selected source IDs.
7. Enter an absolute Obsidian vault path and choose **Approve and write note**. ThesisOS creates `ThesisOS/Literature/` and refuses to overwrite an existing note.

```bash
npm run check
npm run demo
```

Generated demo artifacts are written to `demo-output/` and are intentionally ignored by Git.

The CLI also accepts real feedback without editing the fixture:

```bash
npm run demo -- --feedback "Strengthen Section 3.2 and rerun the simulation" \
  --project "My thesis" --output-dir ./demo-output/my-run
npm run demo -- --feedback-file ./my-feedback.txt
```

Each generated artifact includes `schemaVersion: 1`. The CLI validates the task graph and thesis state before writing them.

Generated tasks require an explicit approval decision before future tool adapters may execute them. Review individual tasks non-interactively:

```bash
npm run review -- --input-dir ./demo-output/my-run \
  --approve task-literature --reject task-notes
```

Approve every task with `--approve-all`, or omit decision flags to use the interactive reviewer. Approval is tracked separately from execution status as `approvalStatus: pending | approved | rejected`, and both JSON artifacts are updated after validation.

After approving a literature task, search the local Zotero desktop library in read-only mode:

```bash
npm run review -- --input-dir ./demo-output/my-run --approve task-literature
npm run zotero -- --input-dir ./demo-output/my-run
```

List the canonical top-level paper library without requiring a task approval:

```bash
npm run zotero -- --list --input-dir ./demo-output/my-run
```

This writes `zotero-library.json`; searches write `zotero-candidates.json`. Both operations are read-only and never import or change Zotero items. Search ranks the selected library from title, authors, venue, abstract, Zotero tags, and DOI instead of requiring the feedback to match a title.

For private, local semantic ranking, install the default Ollama embedding model:

```bash
ollama pull nomic-embed-text
```

When Ollama is unavailable, ThesisOS continues with weighted metadata matching and labels the fallback in the search artifact and website. Configure another local Ollama model with `THESISOS_EMBEDDING_MODEL`; paper context is not sent to GPT automatically.

Paper embeddings are content-addressed by source ID, indexed text, and model, then stored locally under `.thesisos-cache/`. Queries are embedded on every search; unchanged papers are reused. The website reports abstract coverage, metadata-only candidates, the applied relevance threshold, and the retrieval fallback mode.

Run the five-query retrieval baseline against the selected Zotero library:

```bash
npm run eval:retrieval
```

The report includes recall@5 and mean reciprocal rank and fails below the current recall gate of 0.60. Expected paper keys live in `fixtures/retrieval-eval.json` and should be reviewed when the research corpus changes.

ThesisOS counts bibliographic papers across the personal library and every accessible group library. It automatically selects the library when exactly one is non-empty. If several contain papers, the error prints a catalog with each library's ID, type, name, and paper count.

Choose one library by name or ID; the choice is stored in the project's `.thesisos.json` and reused on later runs:

```bash
npm run zotero -- --list --library isac_project_thesis
```

Intentionally extract or search across every non-empty library with:

```bash
npm run zotero -- --list --all-libraries
npm run zotero -- --input-dir ./demo-output/my-run --all-libraries
```

Cross-library results retain `sourceId`, `sourceLibrary`, and the original Zotero item key, so equal keys in different libraries remain distinct. For unattended scripts, explicit `--library-type group --library-id 6568124` and the matching `ZOTERO_LIBRARY_TYPE` and `ZOTERO_LIBRARY_ID` environment variables remain supported. The local API requires Zotero to be running with **Settings → Advanced → Allow other applications on this computer to communicate with Zotero** enabled.

To use the OpenAI decomposition adapter, set the key in your shell and opt in explicitly:

```bash
export OPENAI_API_KEY="your-key"
npm run demo -- --ai --feedback-file ./my-feedback.txt --output-dir ./demo-output/openai-run
```

`OPENAI_MODEL` defaults to `gpt-5.6`; use `--model <id>` for an override. The adapter requests strict structured JSON, adds local metadata, validates dependencies, and sends `store: false`. If the key is missing or the response fails validation, the command fails without writing artifacts.

For local development without API credits, use an authenticated Codex CLI session:

```bash
codex login status
npm run demo -- --codex --feedback-file ./my-feedback.txt --output-dir ./demo-output/codex-run
```

The Codex adapter runs non-interactively with an ephemeral session, read-only sandbox, ignored user configuration/rules, and the same strict output schema. It uses saved Codex authentication and never reads `OPENAI_API_KEY`. `--ai` and `--codex` are mutually exclusive; the offline fallback remains the default.

## Manual verification

Verify each stage independently:

```bash
# 1. Static checks and unit tests
npm run check && npm test

# 2. Offline input path; no API key or network required
npm run demo -- --feedback "Compare distributed ISAC literature in Section 3.2" --output-dir ./demo-output/manual-offline
cat ./demo-output/manual-offline/task-graph.json
cat ./demo-output/manual-offline/thesis-state.json

# 3. File input path
printf '%s\n' "Rerun the simulation with updated parameters." > /tmp/thesis-feedback.txt
npm run demo -- --feedback-file /tmp/thesis-feedback.txt --output-dir ./demo-output/manual-file

# 4. Error/guardrail path: this must fail and create no new artifacts
npm run demo -- --feedback "one" --feedback-file /tmp/thesis-feedback.txt

# 5. OpenAI path, only after setting a real key
npm run demo -- --ai --feedback "Compare distributed ISAC literature and explain the revision" --output-dir ./demo-output/manual-openai
```

For each successful run, inspect that `schemaVersion` is `1`, every `dependsOn` ID exists, and the state contains `approvalRequiredForWrites: true`. The offline run proves the local contract; the OpenAI run proves the live adapter and model output validation.

Architecture decisions are recorded under `docs/decisions/`: [ADR 0001: Local-first Zotero authentication](docs/decisions/0001-zotero-authentication.md), [ADR 0002: Approval-gated evidence note loop](docs/decisions/0002-approved-evidence-note-loop.md), [ADR 0003: Semantic Zotero retrieval](docs/decisions/0003-semantic-zotero-retrieval.md), and [ADR 0004: Consent-gated grounded drafting](docs/decisions/0004-grounded-note-drafting.md).

## Adapter status

- Zotero: local personal/group library discovery, selection, listing, and approved search are implemented read-only.
- Obsidian: deterministic or GPT-5.6-grounded Markdown preview and explicitly approved, non-overwriting local write are implemented.
- Overleaf: optionally operate through a local Git checkout.
- VS Code/Git: create experiment plans, inspect results, and prepare a reviewable branch or patch.
- arXiv: discover papers from a research question before Zotero import.

## Product guardrails

- Local-first thesis state and file operations.
- Read-only inspection by default.
- Explicit approval before writing notes, thesis text, code, or Git history.
- Structured source references for every selected paper; no generated claim is treated as evidence without researcher review.
- No automatic submission, deployment, or supervisor communication.

## Build Week submission checklist

- Working project built with Codex and GPT-5.6.
- Public or judge-accessible repository with this README.
- Public YouTube demo under 3 minutes with voiceover explaining the project, Codex usage, and GPT-5.6 usage.
- `/feedback` Codex Session ID for the main build session.
- Verify any track/category against the live Devpost page before submission; no track is hardcoded here.
- Test path that works with the clearly labelled demo library when judges do not have Zotero.
