import test from "node:test";
import assert from "node:assert/strict";
import { createProjectState } from "../src/core/project-state.mjs";
import { createClaimTraceback } from "../src/core/claim-traceback.mjs";

function stateWithGroundedNote() {
  const state = createProjectState({ project: "Traceable thesis" });
  state.feedbackThreads = [{ id: "feedback-1", title: "Chapter three feedback", feedback: "Support the central argument with literature.", tasks: [{ id: "task-literature", title: "Find supporting literature", approvalStatus: "approved", tool: "zotero", kind: "literature" }] }];
  state.evidence = [{ feedbackThreadId: "feedback-1", taskId: "task-literature", sourceId: "group:123:ABCD", title: "Evidence-backed revision", abstract: "The paper documents a transparent revision trail.", doi: "10.1000/example", selectedAt: "2026-07-14T00:00:00.000Z", draft: { provider: "deterministic-template", sourceNotes: [{ sourceId: "group:123:ABCD", summary: "The paper supports a transparent revision trail.", relevance: "Use it to ground the chapter revision." }] } }];
  return state;
}

test("traces a grounded source note to evidence, approval, feedback, and response status", () => {
  const trace = createClaimTraceback(stateWithGroundedNote(), { feedbackThreadId: "feedback-1", sourceId: "group:123:ABCD" });
  assert.equal(trace.tracedUnit, "grounded-draft-source-note");
  assert.equal(trace.claim.summary, "The paper supports a transparent revision trail.");
  assert.equal(trace.source.abstract, "The paper documents a transparent revision trail.");
  assert.equal(trace.feedback.comment, "Support the central argument with literature.");
  assert.equal(trace.task.approvalStatus, "approved");
  assert.equal(trace.responseMatrix.status, "Grounded note drafted");
});

test("rejects a source that was not selected for the feedback thread", () => {
  assert.throws(() => createClaimTraceback(stateWithGroundedNote(), { feedbackThreadId: "feedback-1", sourceId: "missing" }), /No selected evidence/);
});
