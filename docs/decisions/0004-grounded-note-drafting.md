# ADR 0004: Consent-gated grounded note drafting

Status: accepted

## Decision

GPT-5.6 drafting is a separate, explicit approval from task approval and filesystem writing. Only selected evidence context—source ID, title, abstract, tags, and DOI—plus supervisor feedback may be sent. Requests use `store: false` and strict structured output.

Every generated source note must cite a selected stable `sourceId`; unknown citations invalidate the response. ThesisOS renders the validated structure into Markdown locally. If GPT-5.6 or API credits are unavailable, a clearly labelled deterministic template uses the same selected evidence and preserves the preview workflow.

Judge mode never performs an Obsidian filesystem write.
