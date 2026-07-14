import { validateProjectState } from "./project-state.mjs";

function requireThread(state, feedbackThreadId) {
  const thread = state.feedbackThreads.find((candidate) => candidate.id === feedbackThreadId);
  if (!thread) throw new Error(`Unknown feedback thread '${feedbackThreadId}'.`);
  return thread;
}

export function evidenceLabel(record) {
  return `${record.title?.trim() || "Untitled Zotero item"} (${record.sourceId})`;
}

export function evidenceTrailStatus(task, evidence) {
  const drafted = evidence.find((record) => record.draft);
  if (task.approvalStatus === "rejected") return { status: "Rejected by researcher", note: "—", drafted: null };
  if (task.approvalStatus === "pending") return { status: "Awaiting researcher approval", note: "—", drafted: null };
  if (drafted) return { status: "Grounded note drafted", note: `Grounded draft available · ${drafted.draft.provider ?? "unknown provider"}`, drafted };
  if (evidence.length) return { status: "Evidence selected", note: "—", drafted: null };
  return { status: "Approved · evidence not yet selected", note: "—", drafted: null };
}

function taskTrail(thread, task, allEvidence) {
  const evidence = allEvidence.filter((record) => record.feedbackThreadId === thread.id && record.taskId === task.id);
  const progress = evidenceTrailStatus(task, evidence);
  return {
    feedbackThreadId: thread.id,
    taskId: task.id,
    supervisorComment: thread.feedback,
    feedbackTitle: thread.title?.trim() || "Supervisor feedback",
    task: task.title,
    taskKind: task.kind,
    approvalStatus: task.approvalStatus,
    tool: task.tool ?? null,
    status: progress.status,
    evidence,
    evidenceLabels: evidence.map(evidenceLabel),
    note: progress.note,
    draft: progress.drafted?.draft ?? null
  };
}

export function createFeedbackThreadTrail(state, feedbackThreadId) {
  validateProjectState(state);
  const thread = requireThread(state, feedbackThreadId);
  return {
    feedbackThreadId: thread.id,
    title: thread.title?.trim() || "Supervisor feedback",
    feedback: thread.feedback,
    placement: thread.placement ?? null,
    tasks: (thread.tasks ?? []).map((task) => taskTrail(thread, task, state.evidence))
  };
}

export function createEvidenceTrail(state) {
  validateProjectState(state);
  return state.feedbackThreads.map((thread) => createFeedbackThreadTrail(state, thread.id));
}
