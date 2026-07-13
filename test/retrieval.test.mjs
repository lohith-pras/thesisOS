import test from "node:test";
import assert from "node:assert/strict";
import { rankResearchPapers } from "../src/core/retrieval.mjs";

const papers = [
  { sourceId: "p1", title: "Coordinated resource control", abstract: "We minimize transmit power while satisfying sensing and communication constraints in an ISAC network.", tags: ["optimization", "ISAC"], creators: ["Ada Author"] },
  { sourceId: "p2", title: "Channel modeling survey", abstract: "A survey of propagation and channel models for integrated sensing and communications.", tags: ["channel model"], creators: ["Ben Author"] }
];

test("ranks papers from abstract and tags instead of requiring title matches", async () => {
  const result = await rankResearchPapers("reduce energy use under radar and communication constraints", papers, {
    embeddingProvider: "none",
    limit: 2
  });

  assert.equal(result.candidates[0].sourceId, "p1");
  assert.equal(result.retrieval.mode, "hybrid-lexical");
  assert.ok(result.candidates[0].matchReasons.some((reason) => /abstract|tag/i.test(reason)));
});

test("combines local embedding similarity with lexical evidence", async () => {
  const result = await rankResearchPapers("semantic query", papers, {
    limit: 2,
    embedTexts: async (texts) => texts.map((_, index) => index === 0 ? [1, 0] : index === 1 ? [0.9, 0.1] : [0, 1])
  });

  assert.equal(result.candidates[0].sourceId, "p1");
  assert.equal(result.retrieval.mode, "hybrid-semantic");
  assert.equal(result.retrieval.embeddingProvider, "local");
});

test("falls back safely when the local embedding runtime is unavailable", async () => {
  const result = await rankResearchPapers("power optimization", papers, {
    embedTexts: async () => { throw new Error("Ollama is offline"); }
  });

  assert.equal(result.retrieval.mode, "hybrid-lexical");
  assert.match(result.retrieval.warning, /Ollama is offline/);
  assert.equal(result.candidates.length, 2);
});
