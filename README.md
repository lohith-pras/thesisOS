# ThesisOS

Your supervisor says, “Section 3.2 needs stronger evidence.” ThesisOS turns that comment into reviewed papers from your Zotero library and a grounded thesis note whose citations must match sources you selected.

If a generated draft cites a source ID you did not select, ThesisOS rejects it.

![ThesisOS judge-mode workflow](docs/assets/thesisos-hero.gif)

```bash
npm install
npm run app -- --demo
```

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

After a workflow runs, ThesisOS can export a **Revision Response Matrix**: a supervisor-readable Markdown table of each comment, proposed task, researcher decision, selected Zotero sources, and grounded-note status. It reports only the approval and evidence trail ThesisOS can verify; it never claims an unverified manuscript change.

ThesisOS can also maintain `.thesisos/thesis-state.json` as the canonical record of links between feedback, manuscript citations, selected evidence, model-proposed claims, and researcher approvals. Zotero and the local thesis checkout remain authoritative for their native data; generated Obsidian views are deterministic and regenerable. See the [canonical workspace commands](docs/cli.md#canonical-revision-workspace).

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

ThesisOS was built with Codex using GPT-5.6; the verified build and feedback ID is `019f5cc1-08be-7071-a5ea-220a8de0f313` ([feedback receipt](docs/assets/codex-feedback-receipt.png)). At runtime, users can choose Codex CLI, the optional OpenAI adapter, or a labelled deterministic fallback.

Build-time GPT-5.6 usage and runtime model selection are separate. The detailed implementation record and model boundaries are documented in the [submission notes](docs/devpost-submission.md).

## Why you can use it on a real thesis

- **Search boundary:** ThesisOS reads Zotero metadata but cannot alter the library.
- **Evidence boundary:** drafting receives only reviewed evidence, and drafts containing unselected source IDs are rejected.
- **Write boundary:** notes are previewed before a separate filesystem approval; judge mode cannot write at all.
- **Revision boundary:** response-matrix exports are read-only views of the canonical approval and evidence trail.

## Paper maps and vault maintenance

The core submission stops at the evidence-backed note. Two additional endpoints provide safe building blocks for later workflows:

- `POST /api/papers/card` creates provenance-aware paper cards while leaving unverified research fields marked `needs-review`.
- `POST /api/obsidian/audit` reports broken wiki links and managed notes missing source IDs without changing the vault.

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

Verified Codex GPT-5.6 build and `/feedback` ID: `019f5cc1-08be-7071-a5ea-220a8de0f313`

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
