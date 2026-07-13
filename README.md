# ThesisOS

ThesisOS is a local-first thesis agent for Master’s and Bachelor’s students. It turns supervisor feedback into a reviewable, evidence-backed change set across literature, notes, thesis text, and experiments.

## Current vertical slice

The scaffold currently demonstrates the core product contract without external credentials:

```text
supervisor feedback
  → linked task graph
  → thesis state model
  → reviewable JSON artifacts
```

The offline fallback, local Codex CLI adapter, and optional GPT-5.6 API adapter decompose supervisor comments into work for Zotero, Obsidian, Overleaf, and VS Code while preserving the same validated task/state contract.

## Run it

Requirements: Node.js 22+. The offline demo does not need credentials. The OpenAI path needs `OPENAI_API_KEY`.

Start the local workspace website and its read-only Zotero bridge:

```bash
npm run app
```

Open `http://127.0.0.1:4173`. Keep Zotero Desktop running; the website checks the local API automatically, asks for a library choice only when necessary, and loads real bibliographic metadata into the Library view.

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

This writes `zotero-library.json`; searches write `zotero-candidates.json`. Both operations are read-only and never import or change Zotero items. ThesisOS counts bibliographic papers across the personal library and every accessible group library. It automatically selects the library when exactly one is non-empty. If several contain papers, the error prints a catalog with each library's ID, type, name, and paper count.

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
npm run demo -- --feedback "Compare Smith 2026 in Section 3.2" --output-dir ./demo-output/manual-offline
cat ./demo-output/manual-offline/task-graph.json
cat ./demo-output/manual-offline/thesis-state.json

# 3. File input path
printf '%s\n' "Rerun the simulation with updated parameters." > /tmp/thesis-feedback.txt
npm run demo -- --feedback-file /tmp/thesis-feedback.txt --output-dir ./demo-output/manual-file

# 4. Error/guardrail path: this must fail and create no new artifacts
npm run demo -- --feedback "one" --feedback-file /tmp/thesis-feedback.txt

# 5. OpenAI path, only after setting a real key
npm run demo -- --ai --feedback "Compare Smith 2026 and explain the result" --output-dir ./demo-output/manual-openai
```

For each successful run, inspect that `schemaVersion` is `1`, every `dependsOn` ID exists, and the state contains `approvalRequiredForWrites: true`. The offline run proves the local contract; the OpenAI run proves the live adapter and model output validation.

Architecture decisions are recorded under `docs/decisions/`, beginning with [ADR 0001: Local-first Zotero authentication](docs/decisions/0001-zotero-authentication.md).

## Planned adapters

- Zotero: importing selected candidate metadata after a second approval.
- Obsidian: create linked Markdown literature notes.
- Overleaf: optionally operate through a local Git checkout.
- VS Code/Git: create experiment plans, inspect results, and prepare a reviewable branch or patch.
- arXiv: discover papers from a research question before Zotero import.

## Product guardrails

- Local-first thesis state and file operations.
- Read-only inspection by default.
- Explicit approval before writing notes, thesis text, code, or Git history.
- Evidence links for every generated claim.
- No automatic submission, deployment, or supervisor communication.

## Build Week submission checklist

- Track: Developer Tools (alternative: Work & Productivity).
- Working project built with Codex and GPT-5.6.
- Public or judge-accessible repository with this README.
- Public YouTube demo under 3 minutes with voiceover explaining the project, Codex usage, and GPT-5.6 usage.
- `/feedback` Codex Session ID for the main build session.
- If submitted as a developer tool: installation instructions, supported platforms, and a test path that does not require judges to rebuild it from scratch.
