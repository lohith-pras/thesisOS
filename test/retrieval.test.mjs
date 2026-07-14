import test from "node:test";
import assert from "node:assert/strict";
import { rankResearchPapers } from "../src/core/retrieval.mjs";
import { buildThesisContext } from "../src/core/thesis-context.mjs";

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

test("profile-aware retrieval projection adds the selected scope without sensitive profile fields", () => {
  const context = buildThesisContext({ profile: {
    title: { value: "Cognitive ISAC" }, objectives: [{ id: "o1", text: "Develop online optimization" }],
    problems: [{ id: "p2", name: "Interference Mitigation", selected: true }], stage: { value: "experiments" },
    supervisorExpectations: [{ text: "private" }]
  }, manuscript: { chapters: [] } }, "retrieval", { feedback: "Improve the model" });
  assert.match(context.query, /Interference Mitigation/);
  assert.doesNotMatch(context.query, /private/);
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
  assert.equal(result.candidates.length, 1);
});

test("reuses cached paper embeddings while embedding each new query", async () => {
  const entries = new Map();
  const embeddingCache = { get: (key) => entries.get(key), set: (key, value) => entries.set(key, value), save: async () => {} };
  const batches = [];
  const embedTexts = async (texts) => {
    batches.push(texts);
    return texts.map((_, index) => [1, index / 10]);
  };
  await rankResearchPapers("first query", papers, { embedTexts, embeddingCache, minimumScore: 0 });
  const second = await rankResearchPapers("second query", papers, { embedTexts, embeddingCache, minimumScore: 0 });

  assert.equal(batches[0].length, 3);
  assert.equal(batches[1].length, 1);
  assert.deepEqual(second.retrieval.cache, { hits: 2, misses: 0 });
  assert.deepEqual(second.retrieval.coverage, { total: 2, withAbstract: 2, metadataOnly: 0, abstractPercent: 100 });
});
