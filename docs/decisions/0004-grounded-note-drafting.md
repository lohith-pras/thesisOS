# ADR 0004: Consent-gated grounded note drafting

Status: accepted

## Decision

Codex CLI drafting is the primary separate approval from task approval and filesystem writing. Only selected evidence context—source ID, title, abstract, tags, and DOI—plus supervisor feedback may be sent. The optional GPT-5.6 adapter uses `store: false`; both adapters use strict structured output.

Every generated source note must cite a selected stable `sourceId`; unknown citations invalidate the response. ThesisOS renders the validated structure into Markdown locally. If Codex CLI or GPT-5.6 is unavailable, a clearly labelled deterministic template uses the same selected evidence and preserves the preview workflow.

Judge mode never performs an Obsidian filesystem write.
