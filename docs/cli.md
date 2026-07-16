# CLI reference

Proofline exposes small Node.js CLIs for offline artifacts, review decisions, Zotero access, and retrieval evaluation.

## Canonical revision workspace

Initialize persistent state from an existing local research checkout. The optional sources file is a JSON array of Zotero records and may mark reviewed records with `"selected": true`:

```bash
npm run workspace -- init \
  --project-dir . \
  --project "My thesis" \
  --thesis-dir /absolute/path/to/overleaf-checkout \
  --vault /absolute/path/to/obsidian-vault \
  --sources-file ./selected-zotero-sources.json
```

This writes canonical state to `.thesisos/thesis-state.json`, scans `.tex` and `.bib` read-only, and maps bibliography citekeys to Zotero source IDs by DOI and then exact normalized title. Ambiguous and unresolved keys remain visible.

```bash
npm run workspace -- status --project-dir .
npm run workspace -- scan --project-dir . --expected-revision <current-revision> --sources-file ./selected-zotero-sources.json
npm run workspace -- propose --project-dir . --expected-revision <current-revision> --approve-external-processing
npm run workspace -- review --project-dir . --expected-revision <current-revision> --approve claim-001
npm run workspace -- render --project-dir . --approve-write
```

`status` prints the current canonical `revision`. Every existing-state mutation (`scan`, `propose`, and `review`) requires that value through `--expected-revision`; rerun `status` after each successful mutation. `init` creates a new state only and refuses to overwrite an existing one.

`propose` sends only bounded citation contexts and selected evidence to the authenticated Codex CLI. All returned links enter state as `proposed`; only `review` can approve or reject them. `render` deterministically writes managed dashboard, chapter, selected-literature, feedback, and claim-ledger views while preserving marked researcher sections.

## App server

```bash
npm run app
npm run app -- --demo
```

`--demo` activates the labelled fixture library, falls back visibly when Codex is unavailable, and disables filesystem writes.

## Demo artifacts

```bash
npm run demo -- --feedback "Compare the literature in Section 3.2" \
  --project "My thesis" --output-dir ./demo-output/run
npm run demo -- --feedback-file ./my-feedback.txt
npm run demo -- --codex --feedback-file ./my-feedback.txt --output-dir ./demo-output/codex-run
npm run demo -- --ai --feedback-file ./my-feedback.txt --output-dir ./demo-output/openai-run
```

Important options:

| Option | Purpose |
|---|---|
| `--feedback <text>` | Provide supervisor feedback directly |
| `--feedback-file <path>` | Read feedback from a file |
| `--project <name>` | Set the project label |
| `--output-dir <path>` | Choose the artifact directory |
| `--ai` | Use the OpenAI decomposition adapter |
| `--codex` | Use the authenticated Codex CLI adapter |
| `--model <id>` | Override the selected model |
| `-h`, `--help` | Show usage |

`--ai` and `--codex` are mutually exclusive. The offline fallback remains available without credentials.

## Review decisions

```bash
npm run review -- --input-dir ./demo-output/run --approve task-literature
npm run review -- --input-dir ./demo-output/run --approve-all
npm run review -- --input-dir ./demo-output/run --approve task-literature --reject task-notes
```

Approvals are stored separately from execution status as `approvalStatus: pending | approved | rejected`.

## Zotero CLI

```bash
npm run zotero -- --list --input-dir ./demo-output/run --expected-revision <current-revision>
npm run zotero -- --input-dir ./demo-output/run --query "distributed sensing"
npm run zotero -- --input-dir ./demo-output/run --all-libraries
```

See [zotero.md](zotero.md) for library selection, environment variables, and local API setup.

## Retrieval evaluation

```bash
npm run eval:retrieval
```

See [retrieval.md](retrieval.md) for Ollama setup, caching, and the recall gate.
