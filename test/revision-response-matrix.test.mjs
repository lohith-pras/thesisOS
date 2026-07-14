import test from "node:test";
import assert from "node:assert/strict";
import { createProjectState } from "../src/core/project-state.mjs";
import { createRevisionResponseMatrix } from "../src/core/revision-response-matrix.mjs";

test("renders a revision response matrix from approvals, selected evidence, and grounded drafts", () => {
  const state = createProjectState({ project: "Evidence thesis" });
  state.feedbackThreads = [{
    id: "feedback-1",
    feedback: "Strengthen the evidence in section 3.2.",
    tasks: [
      { id: "task-literature", title: "Find supporting literature", approvalStatus: "approved" },
      { id: "task-thesis", title: "Rewrite section 3.2", approvalStatus: "rejected" }
    ]
  }];
  state.evidence = [{
    feedbackThreadId: "feedback-1",
    taskId: "task-literature",
    sourceId: "group:123:ABCD",
    title: "Evidence-backed revision",
    selectedAt: "2026-07-14T00:00:00.000Z",
    draft: { provider: "deterministic-template" }
  }];

  const matrix = createRevisionResponseMatrix(state);

  assert.equal(matrix.rows.length, 2);
  assert.equal(matrix.rows[0].status, "Grounded note drafted");
  assert.deepEqual(matrix.rows[0].evidence, ["Evidence-backed revision (group:123:ABCD)"]);
  assert.equal(matrix.rows[1].status, "Rejected by researcher");
  assert.match(matrix.markdown, /Supervisor comment \| Proposed task/);
  assert.match(matrix.markdown, /group:123:ABCD/);
  assert.match(matrix.markdown, /does not claim manuscript changes/);
});
