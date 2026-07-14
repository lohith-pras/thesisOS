# Devpost submission copy

## Project name

ThesisOS

## Tagline

Turn supervisor feedback into reviewed evidence and citation-checked thesis notes.

## Category

Education

## Codex GPT-5.6 build and feedback ID

`019f5cc1-08be-7071-a5ea-220a8de0f313`

The submitted feedback receipt is preserved at [`docs/assets/codex-feedback-receipt.png`](assets/codex-feedback-receipt.png).

## What it does

A supervisor says, “Section 3.2 needs stronger evidence,” but the relevant papers rarely use the same wording. ThesisOS turns that comment into reviewable tasks, searches the student's selected Zotero library, and asks the researcher which papers truly count as evidence. It then drafts a grounded literature note whose citations must match those selected Zotero source IDs; a draft containing an unknown source ID is rejected. Every write remains a separate approval.

## How we built it

The project is a Node.js local-first application. Codex CLI turns messy feedback into a validated task graph and drafts grounded notes without requiring API credits. Zotero Desktop is accessed through its read-only local API, including personal and group-library discovery. Local Ollama embeddings provide semantic retrieval, with content-addressed caching and a visible metadata fallback. Codex uses strict structured output to draft only from selected evidence; unknown source IDs invalidate the draft. GPT-5.6 remains an optional API adapter. Obsidian notes are previewed before an explicit filesystem write.

## How Codex helped

ThesisOS was designed and implemented with Codex using GPT-5.6. In the primary build session, Codex implemented and debugged the Zotero-to-evidence workflow, separated semantic retrieval from the Zotero transport, added local fallback and retrieval evaluation, built approval-gated grounded drafting with citation validation, created deterministic judge mode, and verified the result through automated tests. The semantic-retrieval work from this session was merged in commit `85067b1`. The verified build and feedback ID is included above for judging.

## How Codex and GPT-5.6 are used

Codex with GPT-5.6 built the submitted project, as evidenced by the verified session above. At runtime, users can choose Codex CLI, an explicitly configured OpenAI adapter with `store: false`, or a labelled deterministic fallback; every citation must still match a researcher-selected stable Zotero source ID.

## Challenges

Natural supervisor language rarely matches paper titles, and Zotero libraries may be personal, shared, duplicated, partially populated, or missing abstracts. The implementation therefore separates library normalization from retrieval, measures recall@5 against a small ground-truth fixture, reports abstract coverage, caches unchanged paper embeddings, and applies a relevance threshold instead of silently returning every paper.

## Accomplishments

- One-command judge mode with no Zotero, Ollama, API key, or filesystem writes.
- Real 40-paper group-library integration.
- Recall@5 of 0.83 on a small five-query, hand-labelled regression fixture; this is not presented as a general performance claim.
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
