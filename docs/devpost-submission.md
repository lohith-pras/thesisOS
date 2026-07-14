# Devpost submission copy

## Project name

ThesisOS

## Tagline

Turn supervisor feedback into an approval-gated, evidence-backed research trail.

## Category

Education

## Codex GPT-5.6 build and feedback ID

`019f5cc1-08be-7071-a5ea-220a8de0f313`

The submitted feedback receipt is preserved at [`docs/assets/codex-feedback-receipt.png`](assets/codex-feedback-receipt.png).

## What it does

ThesisOS helps thesis students act on ordinary supervisor feedback without losing the research trail. It decomposes the original comment into reviewable tasks, searches a selected Zotero library semantically across titles, abstracts, tags, authors, venues, and DOI, and asks the researcher to select the papers that truly count as evidence. It can then draft a grounded literature note whose citations are restricted to those selected Zotero source IDs. Every write remains a separate approval.

## How we built it

The project is a Node.js local-first application. Codex CLI turns messy feedback into a validated task graph and drafts grounded notes without requiring API credits. Zotero Desktop is accessed through its read-only local API, including personal and group-library discovery. Local Ollama embeddings provide semantic retrieval, with content-addressed caching and a visible metadata fallback. Codex uses strict structured output to draft only from selected evidence; unknown source IDs invalidate the draft. GPT-5.6 remains an optional API adapter. Obsidian notes are previewed before an explicit filesystem write.

## How Codex helped

ThesisOS was designed and implemented with Codex using GPT-5.6. In the primary build session, Codex implemented and debugged the Zotero-to-evidence workflow, separated semantic retrieval from the Zotero transport, added local fallback and retrieval evaluation, built approval-gated grounded drafting with citation validation, created deterministic judge mode, and verified the result through automated tests. The semantic-retrieval work from this session was merged in commit `85067b1`. The verified build and feedback ID is included above for judging.

## How Codex and GPT-5.6 are used

Build-time and runtime use are intentionally separate. Codex with GPT-5.6 built the submitted project and is evidenced by the verified session above. At runtime, Codex CLI is the default for decomposition and grounded drafting; it uses an authenticated local session, ephemeral read-only execution, and strict structured output. GPT-5.6 is also available as an explicitly configured API adapter with `store: false`, but that optional adapter is not the project's hackathon eligibility claim. Every runtime citation must match a researcher-selected stable Zotero source ID, and unavailable models produce a labelled deterministic fallback.

## Challenges

Natural supervisor language rarely matches paper titles, and Zotero libraries may be personal, shared, duplicated, partially populated, or missing abstracts. The implementation therefore separates library normalization from retrieval, measures recall@5 against a small ground-truth fixture, reports abstract coverage, caches unchanged paper embeddings, and applies a relevance threshold instead of silently returning every paper.

## Accomplishments

- One-command judge mode with no Zotero, Ollama, API key, or filesystem writes.
- Real 40-paper group-library integration.
- Recall@5 of 0.83 and mean reciprocal rank of 1.0 on five supervisor-style queries.
- Stable evidence provenance from Zotero through grounded note preview.
- Explicit refusal paths for rejected tasks, external drafting consent, unknown citations, filesystem writes, and file overwrite.

## What we learned

The strongest research agent is not the one that acts most autonomously. It is the one that makes retrieval quality, evidence provenance, model boundaries, and write authority inspectable by the researcher.

## What's next

After the submission baseline, ThesisOS can add PDF full-text extraction for missing abstracts, user-maintained relevance judgments, reviewable thesis-state diffs, and local Git/Overleaf patch adapters.

## Testing instructions

```bash
npm run app -- --demo
```

Open `http://127.0.0.1:4173`. The demo is clearly labelled and stops at preview. For the full local path, run `npm run app` with Zotero Desktop open. Run `npm test` for the current test suite and `npm run eval:retrieval` for the live retrieval report.
