import test from "node:test";
import assert from "node:assert/strict";
import * as projectState from "../src/core/project-state.mjs";

const {
  acceptProfileProposal,
  answerProfileQuestions,
  createProjectState,
  createProfileProposal,
  migrateProjectState,
  profileReadiness,
  projectLifecycle,
  recordFeedback,
  updateProjectPaths
} = projectState;

test("exports canonical profile transitions", () => {
  for (const name of ["acceptProfileProposal", "answerProfileQuestions", "createProfileProposal", "migrateProjectState", "profileReadiness"]) {
    assert.equal(typeof projectState[name], "function", `${name} must be exported`);
  }
});

function project() {
  return createProjectState({ project: "ISAC thesis", thesisDir: "/tmp/thesis", vaultPath: "/tmp/vault" }, { now: "2026-07-14T00:00:00.000Z" });
}

test("creates schema-v3 state with an incomplete canonical profile", () => {
  const state = project();
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.revision, 1);
  assert.deepEqual(profileReadiness(state), {
    ready: false,
    missing: ["titleOrTopic", "objectives", "selectedScope", "stage"]
  });
});

test("creates a PDF-first project without a manuscript checkout", () => {
  const state = createProjectState({ project: "ISAC thesis", vaultPath: "/tmp/vault" });
  assert.equal(state.project.thesisDir, null);
  assert.deepEqual(state.manuscript.chapters, []);
});

test("creates a name-only project with every integration optional", () => {
  const state = createProjectState({ project: "ISAC thesis" });
  assert.equal(state.project.thesisDir, null);
  assert.equal(state.project.vaultPath, null);
  assert.equal(state.project.name, "ISAC thesis");
});

test("derives one guided lifecycle projection from canonical state", () => {
  const state = createProjectState({ project: "ISAC thesis" });
  const lifecycle = projectLifecycle(state, { zotero: { status: "connected", paperCount: 40 }, obsidianPath: "/tmp/vault" });
  assert.deepEqual(lifecycle.statistics, { papers: 40, objectives: 0, openTasks: 0, feedbackThreads: 0 });
  assert.equal(lifecycle.capabilities.manuscript.status, "not_linked");
  assert.equal(lifecycle.capabilities.zotero.status, "connected");
  assert.equal(lifecycle.capabilities.obsidian.status, "initialized");
  assert.equal(lifecycle.nextAction.id, "add-context");
});

test("captures feedback before thesis context is sufficient", () => {
  const state = createProjectState({ project: "ISAC thesis" });
  const captured = recordFeedback(state, { title: "Section 3.2", feedback: "Strengthen the interference model", expectedRevision: 1 });
  assert.equal(captured.feedbackThreads[0].status, "captured");
  assert.deepEqual(captured.feedbackThreads[0].tasks, []);
  assert.equal(captured.revision, 2);
  assert.equal(captured.events.at(-1).type, "feedback.captured");
});

test("turns captured feedback into tasks once the profile becomes ready", () => {
  let state = createProjectState({ project: "ISAC thesis" });
  state = {
    ...state,
    profile: {
      title: { value: "Cognitive ISAC" },
      objectives: [{ id: "objective-1", text: "Improve the target model" }],
      problems: [{ id: "scope-system", name: "System Model", selected: true }],
      stage: { value: "experiments" }
    }
  };
  const captured = recordFeedback(state, { title: "Target model", feedback: "Use orientation in the target model.", expectedRevision: 1 });
  const resumed = projectState.recordFeedbackTasks(captured, {
    feedbackThreadId: captured.feedbackThreads[0].id,
    feedback: captured.feedbackThreads[0].feedback,
    title: captured.feedbackThreads[0].title,
    context: { title: "Cognitive ISAC", objectives: [], selectedScope: { id: "scope-system", name: "System Model" }, targetLocations: [] },
    taskGraph: { tasks: [{ id: "task-model", title: "Revise the target model" }] }
  }, { expectedRevision: 2 });
  assert.equal(resumed.feedbackThreads.length, 1);
  assert.equal(resumed.feedbackThreads[0].id, captured.feedbackThreads[0].id);
  assert.equal(resumed.feedbackThreads[0].tasks[0].id, "task-model");
  assert.equal(resumed.events.at(-1).type, "feedback.decomposed");
});

test("links optional manuscript and vault paths after name-only onboarding", () => {
  const state = createProjectState({ project: "ISAC thesis" });
  const updated = updateProjectPaths(state, { thesisDir: "/tmp/thesis", vaultPath: "/tmp/vault", expectedRevision: 1 });
  assert.equal(updated.project.thesisDir, "/tmp/thesis");
  assert.equal(updated.project.vaultPath, "/tmp/vault");
  assert.equal(updated.revision, 2);
});

test("migrates schema-v2 state without discarding canonical workspace data", () => {
  const state = project();
  const legacy = { ...state, schemaVersion: 2 };
  delete legacy.profile;
  delete legacy.profileProposal;
  delete legacy.documents;
  delete legacy.revision;
  const migrated = migrateProjectState(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.project.name, "ISAC thesis");
  assert.deepEqual(migrated.claims, []);
  assert.equal(migrated.events.at(-1).type, "state.migrated");
});

test("keeps extracted fields pending until the researcher accepts them", () => {
  const proposed = createProfileProposal(project(), {
    id: "profile-proposal-1",
    sourceDocumentIds: ["document-1"],
    fields: {
      title: { value: "Cognitive ISAC", provenance: { kind: "extracted", sourceId: "document-1", locator: "page:1" } },
      objectives: [{ id: "objective-1", text: "Develop an online optimization framework", provenance: { kind: "extracted", sourceId: "document-1", locator: "page:2" } }]
    }
  }, { provider: "codex", model: "test-model", expectedRevision: 1, now: "2026-07-14T01:00:00.000Z" });
  assert.equal(proposed.profile.title, undefined);
  assert.equal(proposed.profileProposal.status, "pending");

  const accepted = acceptProfileProposal(proposed, {
    decisions: { title: { action: "accept" }, objectives: { action: "accept" } },
    expectedRevision: 2
  }, { now: "2026-07-14T02:00:00.000Z" });
  assert.equal(accepted.profile.title.value, "Cognitive ISAC");
  assert.equal(accepted.profile.title.provenance.kind, "extracted-approved");
  assert.equal(accepted.profileProposal.status, "reviewed");
});

test("combines accepted extraction with user-stated scope and stage to unlock feedback", () => {
  let state = createProfileProposal(project(), {
    id: "profile-proposal-1",
    sourceDocumentIds: ["document-1"],
    fields: {
      topic: { value: "Cognitive ISAC networks", provenance: { kind: "extracted", sourceId: "document-1", locator: "page:1" } },
      objectives: [{ id: "objective-1", text: "Evaluate against benchmark schemes", provenance: { kind: "extracted", sourceId: "document-1", locator: "page:2" } }]
    }
  }, { provider: "codex", expectedRevision: 1 });
  state = acceptProfileProposal(state, { decisions: { topic: { action: "accept" }, objectives: { action: "accept" } }, expectedRevision: 2 });
  state = answerProfileQuestions(state, {
    selectedScope: { id: "problem-p2", name: "Interference Mitigation", summary: "Mitigate mutual interference" },
    stage: "experiments",
    expectedRevision: 3
  });
  assert.deepEqual(profileReadiness(state), { ready: true, missing: [] });
  assert.equal(state.profile.problems[0].provenance.kind, "user-stated");
});

test("rejects stale profile mutations", () => {
  assert.throws(() => answerProfileQuestions(project(), {
    selectedScope: { id: "p1", name: "Coverage" }, stage: "writing", expectedRevision: 99
  }), /STATE_STALE/);
});

test("reviews a persisted canonical feedback task by entity ID", () => {
  let state = project();
  state.feedbackThreads = [{ id: "feedback-1", feedback: "Review evidence", tasks: [{ id: "task-literature", kind: "literature", approvalStatus: "pending" }] }];
  const reviewed = projectState.reviewCanonicalTask(state, { feedbackThreadId: "feedback-1", taskId: "task-literature", decision: "approved", expectedRevision: 1 });
  assert.equal(reviewed.feedbackThreads[0].tasks[0].approvalStatus, "approved");
  assert.equal(reviewed.revision, 2);
  assert.equal(reviewed.events.at(-1).type, "task.reviewed");
});
