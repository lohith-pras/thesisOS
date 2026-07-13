# ADR 0003: Semantic retrieval over Zotero metadata

Status: accepted

## Context

Supervisor feedback uses natural research language and usually does not repeat a paper title. Zotero's `titleCreatorYear` query therefore produces false negatives. ThesisOS must remain useful without paid API credits and must not upload private paper context silently.

## Decision

ThesisOS reads the complete selected Zotero library and builds an in-memory retrieval document from each paper's title, creators, venue, abstract, tags, and DOI. It ranks papers using local Ollama embeddings (`nomic-embed-text` by default) combined with weighted metadata matching, with a deterministic metadata-only fallback when the local runtime is unavailable.

The search artifact records the retrieval mode, indexed fields, fallback warning, and per-paper match scores and reasons. Zotero remains read-only; ThesisOS does not add or modify Zotero tags. External GPT reranking is not automatic because abstracts and other paper context would leave the machine.

## Architectural boundary

`core/zotero.mjs` owns library access and normalization. `core/retrieval.mjs` owns ranking. HTTP routes only sequence the approved workflow and return the artifact. This implements the architecture review's Zotero/library seam without blocking the larger workflow-orchestration refactor.

## Consequences

- Natural-language feedback can match concepts found only in abstracts or tags.
- First use requires `ollama pull nomic-embed-text` for semantic ranking.
- Search still works without Ollama, but the UI labels the metadata fallback.
- PDF full-text indexing is deferred; this baseline indexes metadata and abstracts.
