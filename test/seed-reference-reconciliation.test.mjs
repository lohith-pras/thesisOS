import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSeedReferences } from "../src/core/seed-reference-reconciliation.mjs";

test("reconciles approved seed references as advisory present, missing, and ambiguous Zotero matches", () => {
  const report = reconcileSeedReferences([
    { text: "A known paper 10.1000/known" },
    { text: "Unmatched source 10.1000/missing" },
    { text: "Repeated title" }
  ], [
    { sourceId: "group:1:A", title: "Known paper", doi: "10.1000/known" },
    { sourceId: "group:1:B", title: "Repeated title" },
    { sourceId: "group:1:C", title: "Repeated title" }
  ]);
  assert.equal(report.present.length, 1);
  assert.equal(report.missing.length, 1);
  assert.equal(report.ambiguous.length, 1);
  assert.equal(report.present[0].matchedBy, "doi");
});
