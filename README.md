# ThesisOS

![ThesisOS judge-mode workflow](docs/assets/thesisos-hero.gif)

ThesisOS turns supervisor feedback into an approval-gated, evidence-backed research trail. It connects Codex CLI, Zotero, semantic retrieval, grounded drafting, and Obsidian without letting an agent silently change the thesis workspace.

## Working vertical slice

```text
supervisor feedback
  → Codex CLI task graph
  → researcher approves literature task
  → read-only Zotero search
  → researcher selects evidence
  → Codex CLI grounded draft
  → researcher previews note
  → explicit Obsidian write approval
```

The researcher remains the decision-maker: rejected tasks cannot run, only selected source IDs can enter drafting, and filesystem writes are separate approvals.

ThesisOS can also maintain `.thesisos/thesis-state.json` as the canonical record of links between feedback, manuscript citations, selected evidence, model-proposed claims, and researcher approvals. Zotero and the local thesis checkout remain authoritative for their native data; generated Obsidian views are deterministic and regenerable. See the [canonical workspace commands](docs/cli.md#canonical-revision-workspace).

## Paper maps and vault maintenance

ThesisOS now exposes two safe building blocks for the next research workflow:

- `POST /api/papers/card` turns one selected Zotero source into a provenance-aware paper card and hierarchical Paper Map. Metadata and abstracts are marked as grounded; research question, method, data, findings, limitations, and thesis relevance remain `needs-review` until a researcher supplies verified content.
- `POST /api/obsidian/audit` performs a read-only vault audit. It reports broken wiki links and ThesisOS-managed notes missing source IDs, but never writes, deletes, merges, or moves a note.

These endpoints are deliberately separated from any future full-text extraction agent. The default runtime remains Codex CLI through the authenticated local session; an `OPENAI_API_KEY` is optional and only needed when choosing the explicit OpenAI adapter.

## Quick start

For judges and reviewers, start the complete credential-free fixture workflow:

```bash
npm install
npm run app -- --demo
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Demo mode uses a clearly labelled fixture library, falls back safely when Codex is unavailable, and never writes to the filesystem.

For a real project, choose **Set up my thesis** and enter a name. Every other step is optional: import a PDF/Markdown/text project description, connect Zotero, link a local or Overleaf Git manuscript folder, initialize an Obsidian vault, and record the selected scope or stage. Feedback can be captured immediately; task decomposition remains locked until the minimum profile is approved so generated work always has thesis context.

For the real local workflow, keep Zotero Desktop running and use:

```bash
npm run app
```

The live path uses the read-only Zotero Desktop API and your authenticated Codex CLI session. Check authentication with `codex login status`.

ThesisOS runs on macOS, Windows, and Linux with Node.js 22+. The optional submission-media helpers (`npm run render:video` and `npm run capture:submission`) are macOS development scripts: they use macOS `say`, the default macOS Chrome path, and external `ffmpeg`/ImageMagick tooling.

## Website walkthrough

1. Connect Zotero Desktop, or start with the labelled demo library.
2. Paste the exact supervisor feedback.
3. Review the validated task graph and approve the literature task.
4. Run the approved read-only Zotero search.
5. Select reviewed papers and attach them as structured evidence.
6. Continue to the dedicated Evidence notes step and draft with Codex CLI or the local template.
7. Preview the note, then explicitly approve saving it to the configured Obsidian vault.

## How Codex and GPT-5.6 are used

Codex CLI is the primary runtime. It decomposes messy feedback and drafts grounded notes through the authenticated local CLI, using strict JSON schemas and read-only ephemeral sessions. It does not require `OPENAI_API_KEY`.

GPT-5.6 remains an optional API adapter for users who explicitly configure `OPENAI_API_KEY`. It receives only supervisor feedback and selected evidence, uses `store: false`, and its output is checked against the selected source IDs. If a model is unavailable, ThesisOS labels the deterministic local fallback instead of hiding the failure.

Codex helped build the architecture, Zotero connector, retrieval evaluation, approval state, tests, and judge-mode capture. The primary build session is recorded in the [submission notes](docs/devpost-submission.md).

## Product guardrails

- Zotero access is read-only.
- Every task begins pending approval.
- Search requires an approved literature task.
- Drafting receives only researcher-selected evidence.
- Unknown source IDs are rejected.
- Notes are previewed before writing.
- ThesisOS-managed notes can be updated; unrelated notes are never overwritten.
- Judge mode cannot write to the filesystem.

## Documentation

- [CLI reference](docs/cli.md)
- [Zotero setup and library selection](docs/zotero.md)
- [Semantic retrieval and evaluation](docs/retrieval.md)
- [Verification guide](docs/verification.md)
- [Adapter roadmap](docs/roadmap.md)
- [Submission demo script](docs/submission-demo.md)
- [Devpost submission copy](docs/devpost-submission.md)
- [Architecture decisions](docs/decisions/)

## Submission

Codex build session: `019f5cc1-08be-7071-a5ea-220a8de0f313`

See the [submission copy and checklist](docs/devpost-submission.md) for the demo, category, and remaining manual submission steps.

## Common commands

```bash
npm test
npm run check && npm run check:frontend
npm run demo -- --codex --feedback-file ./my-feedback.txt --output-dir ./demo-output/codex-run
```

See [docs/cli.md](docs/cli.md) for all flags and operational details.

## License

[MIT](LICENSE)
