# ADR 0002: Approval-gated evidence note loop

- Status: Accepted
- Date: 2026-07-13

## Context

Listing a Zotero library proves connector access but does not complete the product promise. ThesisOS needs one useful output while preserving the local-first, review-before-write boundary. Zotero metadata alone is not sufficient to generate reliable paper claims, methods, or limitations.

## Decision

The first complete website loop is feedback decomposition, validated task review, approved read-only literature search, explicit paper selection, structured evidence references, Obsidian Markdown preview, and a separately approved local write.

Zotero remains read-only. Selected papers retain their stable source ID, original item key, library identity, title, creators, year, DOI, and URL. The note may render those bibliographic facts, but claim, method, limitation, and relevance fields remain blank until a researcher reviews the paper.

The Obsidian adapter accepts an absolute local vault path only after preview. A write request must include explicit approval, writes into a predictable `Evidence/` directory, updates only notes marked `managed_by: thesisos`, and refuses to overwrite unrelated notes.

For reviewers without Zotero, the website may expose an opt-in fixture library. Every fixture response, connection state, and source ID is visibly labelled demo data. There is no automatic fallback from a failed Zotero connection.

## Consequences

- The demo now produces a useful, inspectable artifact instead of stopping at JSON or a paper list.
- Evidence provenance remains machine-readable across Zotero, task artifacts, and Markdown notes.
- Users retain control over both source selection and filesystem writes.
- Paper-content extraction and claim generation remain future work and must not be simulated from bibliographic metadata.
- Overleaf, Git, arXiv, Zotero writes, and cloud OAuth remain out of scope until this loop is stable.
