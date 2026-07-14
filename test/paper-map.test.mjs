import test from "node:test";
import assert from "node:assert/strict";
import { createPaperCard, paperMap } from "../src/core/paper-map.mjs";

const source = {
  sourceId: "group:1:ABC",
  title: "Trustworthy Retrieval for Thesis Writing",
  creators: ["Ada Author"],
  year: "2026",
  abstract: "We evaluate grounded retrieval for thesis writing.",
  doi: "10.1000/example",
  url: "https://example.test/paper"
};

test("creates a provenance-aware paper card without inventing paper claims", () => {
  const card = createPaperCard(source, { createdAt: "2026-07-14T10:00:00.000Z" });
  assert.equal(card.sourceId, source.sourceId);
  assert.equal(card.summary.value, source.abstract);
  assert.equal(card.summary.provenance.kind, "zotero-abstract");
  assert.equal(card.researchQuestion.value, null);
  assert.equal(card.researchQuestion.provenance.kind, "needs-review");
});

test("builds a stable hierarchical map from a paper card", () => {
  const map = paperMap(createPaperCard(source));
  assert.equal(map.root.id, "paper:group:1:ABC");
  assert.deepEqual(map.root.children.map(({ id }) => id), [
    "summary", "research-question", "method", "data", "findings", "limitations", "thesis-relevance"
  ]);
  assert.equal(map.root.children[0].status, "grounded");
  assert.equal(map.root.children[1].status, "needs-review");
});
