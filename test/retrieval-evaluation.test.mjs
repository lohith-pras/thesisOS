import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRetrieval } from "../src/core/retrieval-evaluation.mjs";

test("computes recall at k and mean reciprocal rank", async () => {
  const report = await evaluateRetrieval([
    { id: "one", query: "q1", expectedKeys: ["A", "B"] },
    { id: "two", query: "q2", expectedKeys: ["C"] }
  ], async (query) => query === "q1" ? [{ key: "X" }, { key: "A" }, { key: "B" }] : [{ key: "C" }], { k: 2 });
  assert.equal(report.recallAtK, 0.75);
  assert.equal(report.meanReciprocalRank, 0.75);
});
