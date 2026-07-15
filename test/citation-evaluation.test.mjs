import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCitations, scoreCitationEvaluations } from "../src/core/citation-evaluation.mjs";

const cases = [
  { id: "valid", bucket: "valid", expectedVerdict: "ACCEPT" },
  { id: "fake", bucket: "fabricated", expectedVerdict: "REJECT" },
  { id: "mismatch", bucket: "mismatched", expectedVerdict: "REJECT" }
];

test("reports rejection recall, false-positive rate, and bucket results across trials", () => {
  const report = scoreCitationEvaluations(cases, [
    { id: "valid", verdict: "ACCEPT" }, { id: "valid", verdict: "REJECT" },
    { id: "fake", verdict: "REJECT" }, { id: "fake", verdict: "FLAG" },
    { id: "mismatch", verdict: "ACCEPT" }, { id: "mismatch", verdict: "REJECT" }
  ]);
  assert.equal(report.rejectionRecall, 0.75);
  assert.equal(report.falsePositiveRate, 0.5);
  assert.equal(report.byBucket.fabricated.rejectionRate, 1);
  assert.deepEqual(report.results[2].verdicts, ["ACCEPT", "REJECT"]);
});

test("runs every case repeatedly instead of treating one temperature-zero response as deterministic", async () => {
  const report = await evaluateCitations(cases, async (item, trial) => ({ verdict: item.id === "valid" ? "ACCEPT" : trial === 1 ? "REJECT" : "FLAG" }), { trials: 3 });
  assert.equal(report.trialCount, 9);
  assert.equal(report.rejectionRecall, 1);
  assert.equal(report.falsePositiveRate, 0);
});
