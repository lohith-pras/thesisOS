import { randomUUID } from "node:crypto";
import { selectEvidenceReferences } from "./evidence.mjs";
import { createFeedbackThreadTrail } from "./evidence-trail.mjs";
import { validateProjectState } from "./project-state.mjs";
import { validateGroundedDraft } from "./note-drafting.mjs";

function expectRevision(state, expectedRevision) {
  if (expectedRevision !== state.revision) {
    const error = new Error(`STATE_STALE: expected revision ${expectedRevision}, current revision is ${state.revision}.`);
    error.code = "STATE_STALE";
    throw error;
  }
}

function requireThread(state, feedbackThreadId) {
  const thread = state.feedbackThreads.find((candidate) => candidate.id === feedbackThreadId);
  if (!thread) throw new Error(`Unknown feedback thread '${feedbackThreadId}'.`);
  return thread;
}

function requireThreadAndTask(state, feedbackThreadId, taskId) {
  const thread = requireThread(state, feedbackThreadId);
  const task = thread.tasks?.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Unknown task '${taskId}'.`);
  return { thread, task };
}

function taskGraphForThread(thread) {
  return {
    schemaVersion: 1,
    feedback: thread.feedback,
    createdAt: thread.createdAt ?? new Date(0).toISOString(),
    tasks: thread.tasks,
    nextAction: "Review tasks"
  };
}

function transitionEvent(type, at, details) {
  return { id: randomUUID(), type, at, ...details };
}

export function attachCanonicalEvidence(state, input, options = {}) {
  validateProjectState(state);
  expectRevision(state, input.expectedRevision);
  const { thread, task } = requireThreadAndTask(state, input.feedbackThreadId, input.taskId);
  if (task.kind !== "literature" || task.approvalStatus !== "approved") {
    throw new Error("An approved literature task is required before selecting evidence.");
  }

  const now = options.now ?? new Date().toISOString();
  const { taskGraph, selection } = selectEvidenceReferences(
    taskGraphForThread(thread), options.searchArtifact, input.sourceIds, { now, taskId: task.id }
  );
  const updatedTask = taskGraph.tasks.find((candidate) => candidate.id === task.id);
  const selectedEvidence = selection.evidenceRefs.map((reference) => ({
    ...reference,
    feedbackThreadId: thread.id,
    taskId: task.id,
    selectedAt: selection.selectedAt
  }));
  const evidence = state.evidence
    .filter((record) => record.feedbackThreadId !== thread.id || record.taskId !== task.id)
    .concat(selectedEvidence);

  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    evidence,
    feedbackThreads: state.feedbackThreads.map((candidate) => candidate.id !== thread.id ? candidate : {
      ...candidate,
      tasks: candidate.tasks.map((candidateTask) => candidateTask.id === task.id ? updatedTask : candidateTask)
    }),
    events: [...state.events, transitionEvent("evidence.attached", now, {
      feedbackThreadId: thread.id,
      taskId: task.id,
      sourceIds: [...input.sourceIds]
    })]
  });
}

export function workflowReadModel(state, feedbackThreadId) {
  validateProjectState(state);
  const thread = requireThread(state, feedbackThreadId);
  const trail = createFeedbackThreadTrail(state, feedbackThreadId);
  const selectedEvidence = trail.tasks.flatMap((task) => task.evidence);
  const draft = trail.tasks.find((task) => task.draft)?.draft ?? null;
  const approvedLiteratureTask = thread.tasks.find((task) => task.kind === "literature" && task.approvalStatus === "approved");
  const nextAllowedAction = !approvedLiteratureTask
    ? { id: "review-tasks", label: "Review the literature task before selecting evidence" }
    : selectedEvidence.length === 0
      ? { id: "select-evidence", label: "Select Zotero evidence" }
      : draft
        ? { id: "preview-evidence-note", label: "Review the grounded evidence note" }
        : { id: "draft-evidence-note", label: "Draft a grounded evidence note" };
  return {
    feedbackThreadId: thread.id,
    feedback: thread.feedback,
    placement: trail.placement,
    tasks: thread.tasks,
    taskGraph: taskGraphForThread(thread),
    selectedEvidence,
    evidenceSelection: selectedEvidence.length ? {
      taskId: selectedEvidence[0].taskId,
      selectedAt: selectedEvidence[0].selectedAt,
      selectedCount: selectedEvidence.length,
      evidenceRefs: selectedEvidence
    } : null,
    draft,
    trail,
    draftStatus: draft ? "available" : "not_started",
    previewStatus: selectedEvidence.some((record) => record.preview) ? "available" : "not_started",
    nextAllowedAction
  };
}

export function recordCanonicalDraft(state, input, options = {}) {
  validateProjectState(state);
  expectRevision(state, input.expectedRevision);
  const { thread, task } = requireThreadAndTask(state, input.feedbackThreadId, input.taskId);
  const selectedEvidence = state.evidence.filter((record) => record.feedbackThreadId === thread.id && record.taskId === task.id);
  if (!selectedEvidence.length) throw new Error("Selected evidence is required before drafting.");
  const draft = validateGroundedDraft(input.draft, selectedEvidence);
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    evidence: state.evidence.map((record) => record.feedbackThreadId === thread.id && record.taskId === task.id
      ? { ...record, draft: { ...draft, provider: options.provider ?? "unknown", model: options.model ?? "default", createdAt: now } }
      : record),
    events: [...state.events, transitionEvent("evidence.draft.recorded", now, { feedbackThreadId: thread.id, taskId: task.id })]
  });
}
