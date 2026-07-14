import assert from "node:assert/strict";
import test from "node:test";
import { createProjectState, migrateProjectState } from "../src/core/project-state.mjs";
import { attachCanonicalEvidence, recordCanonicalDraft, workflowReadModel } from "../src/core/workflow.mjs";

function canonicalState() {
  const state = createProjectState({ project: "ISAC thesis" }, { now: "2026-07-14T00:00:00.000Z" });
  state.feedbackThreads = [{
    id: "feedback-1",
    feedback: "Review the literature evidence.",
    createdAt: "2026-07-14T00:00:00.000Z",
    tasks: [{
      id: "task-literature",
      kind: "literature",
      title: "Review literature",
      tool: "zotero",
      status: "ready",
      approvalStatus: "approved",
      dependsOn: [],
      evidence: ["Capture claim, method, and limitation"]
    }]
  }];
  return state;
}

const searchArtifact = {
  taskId: "task-literature",
  query: "ISAC",
  retrieval: { mode: "zotero" },
  candidates: [{
    sourceId: "group:1:A",
    key: "A",
    sourceLibrary: { type: "group", id: "1", name: "Research" },
    title: "Paper A",
    creators: [],
    year: 2025,
    abstract: "Evidence",
    tags: [],
    doi: null,
    url: null
  }]
};

test("attaches evidence to an approved canonical literature task", () => {
  const state = canonicalState();
  const next = attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision
  }, { searchArtifact, now: "2026-07-14T01:00:00.000Z" });
  assert.equal(next.evidence[0].sourceId, "group:1:A");
  assert.equal(next.revision, state.revision + 1);
  assert.equal(next.events.at(-1).type, "evidence.attached");
});

test("rejects evidence attachment when the revision is stale", () => {
  const state = canonicalState();
  assert.throws(() => attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision - 1
  }, { searchArtifact }), /STATE_STALE/);
});

test("projects the canonical workflow read model for a feedback thread", () => {
  const state = canonicalState();
  const attached = attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision
  }, { searchArtifact });
  const workflow = workflowReadModel(attached, "feedback-1");
  assert.equal(workflow.feedback, "Review the literature evidence.");
  assert.equal(workflow.selectedEvidence[0].sourceId, "group:1:A");
  assert.equal(workflow.nextAllowedAction.id, "draft-evidence-note");
});

test("attaches evidence to the requested literature task when a thread has several", () => {
  const state = canonicalState();
  state.feedbackThreads[0].tasks.unshift({ ...state.feedbackThreads[0].tasks[0], id: "task-literature-first" });
  const next = attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision
  }, { searchArtifact });
  assert.equal(next.feedbackThreads[0].tasks[0].evidenceRefs, undefined);
  assert.equal(next.feedbackThreads[0].tasks[1].evidenceRefs[0].sourceId, "group:1:A");
});

test("loads schema-v3 project state saved before evidence existed", () => {
  const legacy = createProjectState({ project: "ISAC thesis" });
  delete legacy.evidence;
  assert.deepEqual(migrateProjectState(legacy).evidence, []);
});

test("stores a validated draft against canonical selected evidence", () => {
  const state = canonicalState();
  const attached = attachCanonicalEvidence(state, {
    feedbackThreadId: "feedback-1", taskId: "task-literature",
    sourceIds: ["group:1:A"], expectedRevision: state.revision
  }, { searchArtifact });
  const next = recordCanonicalDraft(attached, {
    feedbackThreadId: "feedback-1", taskId: "task-literature", expectedRevision: attached.revision,
    draft: { overview: "Grounded", sourceNotes: [{ sourceId: "group:1:A", summary: "Supported", relevance: "Relevant" }] }
  }, { provider: "codex", model: "test" });
  assert.equal(next.evidence[0].draft.sourceNotes[0].sourceId, "group:1:A");
  assert.equal(workflowReadModel(next, "feedback-1").draftStatus, "available");
});
