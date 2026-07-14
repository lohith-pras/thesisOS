# Semantic retrieval

The retrieval layer ranks Zotero papers using title, authors, venue, abstract, tags, DOI, and the query. When available, local Ollama embeddings add semantic similarity; metadata ranking remains the explicit fallback.

## Local embeddings

Install and start Ollama, then pull the default model:

```bash
ollama pull nomic-embed-text
```

Override the model with `THESISOS_EMBEDDING_MODEL`.

Paper embeddings are cached locally under `.thesisos-cache/` and are content-addressed by source ID, indexed text, and model. Unchanged papers are reused; each new query is embedded again.

The website reports abstract coverage, metadata-only candidates, relevance thresholds, and fallback mode instead of hiding retrieval limitations.

## Evaluation

```bash
npm run eval:retrieval
```

The five-query baseline in `fixtures/retrieval-eval.json` reports recall@5 and mean reciprocal rank. The current recall gate is 0.60. Review expected paper keys when the research corpus changes.
