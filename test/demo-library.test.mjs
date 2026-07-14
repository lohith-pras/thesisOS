import test from "node:test";
import assert from "node:assert/strict";
import { createDemoProjectState, decomposeDemoFeedback, demoLibraryPayload } from "../src/core/demo-library.mjs";
import { createObsidianNotePreview } from "../src/core/obsidian.mjs";

test("demo fixture supplies a ready industry thesis profile and a multi-paper library", () => {
  const state = createDemoProjectState();
  const library = demoLibraryPayload();
  assert.match(state.project.name, /Workplace EV charging/);
  assert.equal(state.profile.objectives.length, 2);
  assert.equal(library.paperCount, 8);
  assert.match(library.papers[0].doi, /^10\./);
});

test("demo feedback only creates workflows backed by available integrations", () => {
  const graph = decomposeDemoFeedback("The claim that smart charging reduces local congestion is too strong.");
  assert.deepEqual(graph.tasks.map((task) => task.tool), ["zotero", "obsidian"]);
  assert.doesNotMatch(JSON.stringify(graph), /overleaf/i);
});

test("generated evidence notes include a structured read model alongside Markdown", () => {
  const reference = demoLibraryPayload().papers[0];
  const preview = createObsidianNotePreview({ project: "EV flexibility", feedback: "Support the congestion claim.", evidenceRefs: [reference], draft: { overview: "Compare tariff and capacity-management evidence.", sourceNotes: [{ sourceId: reference.sourceId, summary: "Tariff design can create local peaks.", relevance: "Qualifies the congestion claim." }] } });
  assert.equal(preview.readModel.sources[0].sourceId, reference.sourceId);
  assert.equal(preview.readModel.sources[0].summary, "Tariff design can create local peaks.");
});
