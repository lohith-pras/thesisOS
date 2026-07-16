# Devpost submission copy

## Project name

Proofline

## Tagline

Turn supervisor feedback into reviewed evidence and citation-checked thesis notes.

## Category

Education

## Codex GPT-5.6 build and feedback ID

`019f5cc1-08be-7071-a5ea-220a8de0f313`

The submitted feedback receipt is preserved at [`docs/assets/codex-feedback-receipt.png`](assets/codex-feedback-receipt.png).

## What it does

I started Proofline for my own thesis at FAU Erlangen. My work was split between Zotero, Obsidian, Overleaf, VS Code, and supervisor comments. Each tool handled one part of the process, but I did not have a single source of truth for the link between feedback, the papers I selected, the decisions I made, and the notes I needed later.

I sometimes pasted supervisor feedback into AI to understand what it was asking of me. It helped, but it could feel as if the AI knew more about my thesis than I did. Proofline moves that authority back to the researcher. It turns a comment into a reviewable task, searches the researcher's selected Zotero library, lets them choose the papers that count as evidence, and creates a grounded note preview for Obsidian.

A draft can cite only the stable source IDs selected by the researcher. If it contains another citation, Proofline rejects it before preview. Claim Traceback links a grounded note to its selected evidence, approved task, and original feedback. The Revision Response Matrix records the resulting review trail. A local write still requires a separate approval.

## How we built it

Proofline is a local-first Node.js application with a browser UI and a workflow core that records approvals, selected evidence, and revision state. Zotero is accessed through its local Desktop API in read-only mode. Local Ollama embeddings can improve retrieval when available, with a visible metadata fallback when they are not. Codex CLI turns feedback into a validated task graph and drafts from selected evidence using structured output. A clearly labelled deterministic fallback keeps the same approval and citation boundaries when Codex is unavailable.

I built and debugged the project with Codex using GPT-5.6. The verified build feedback ID is `019f5cc1-08be-7071-a5ea-220a8de0f313`. Codex helped implement the Zotero-to-evidence workflow, retrieval evaluation, citation validation, deterministic judge mode, and automated checks. Build-time GPT-5.6 usage and runtime model choice are separate: at runtime, users can choose Codex CLI, an explicitly configured OpenAI adapter with `store: false`, or the deterministic fallback.

The final hardening pass ran in Codex session `019f6859-ae92-7280-930a-f7d7bf5b11ea`. It coordinated six specialised review sub-agents across security, correctness and test coverage, revision contracts, UI/XSS hardening, performance and maintainability, and post-fix review, plus a dedicated workspace write-path agent. That pass added serialised revision-safe writes, isolated judge-mode routes, server-issued one-time note previews, safe workspace and vault write paths, and frontend URL and attribute hardening. Its final verification reported `npm test` passing 184 of 184 tests, plus passing syntax and frontend checks.

Codex also helped me finish the demo. I had never edited a video before. After I recorded a screen walkthrough, Codex reviewed the flow, identified redundant sections, and created a clean 2:55 cut with the narration intact.

## Challenges we ran into

Supervisor feedback rarely uses the same language as paper titles or abstracts. Zotero libraries can also have missing abstracts, duplicate records, personal libraries, and shared group libraries. I needed retrieval that narrowed the search without pretending it knew which paper was correct.

The trust boundary was another challenge. A draft should not introduce a citation the researcher never selected, and Proofline should never modify the Zotero library. The app validates citations before preview, keeps Zotero read-only, and requires separate approval before writing a note to the filesystem.

I also needed a demo that judges could run without my thesis files, credentials, or local Zotero installation. Judge mode uses clearly labelled fixture data and stops at preview.

## Accomplishments that we're proud of

- A citation firewall that visibly rejects an unselected source before it can replace the grounded preview.
- Claim Traceback, which links a grounded note to its selected evidence, approved task, and original reviewer feedback.
- A Revision Response Matrix that records feedback, task decisions, selected sources, and note status.
- Read-only Zotero access and approval-gated local writing.
- A deterministic, credential-free judge mode.
- A final multi-agent hardening pass across security, correctness, revision safety, UI safety, and maintainability.

## What we learned

I learned that the useful part of a research assistant is not simply producing text. It is helping the researcher keep track of why a change was made, which evidence they trusted, and where a note came from.

Clear boundaries made the product stronger. Researchers need to inspect retrieval quality, choose their evidence, and decide when a draft becomes a real file.

## What's next for Proofline

Next, I want to add PDF full-text extraction for papers with missing abstracts, researcher-maintained relevance judgements, and reviewable project-state diffs. I also want to explore local Git and Overleaf patch adapters while preserving the same approval model.

The core principle will stay the same: evidence before AI writing.

## Testing instructions

```bash
npm run app -- --demo
```

Open `http://127.0.0.1:4173`. The demo is clearly labelled and stops at preview. Select **Show completed proof** to open a deterministic completed trail, then **Test citation boundary** to see an unselected source rejected before note preview. For the full local path, run `npm run app` with Zotero Desktop open. Run `npm test` for the current test suite and `npm run eval:retrieval` for the live retrieval report.
