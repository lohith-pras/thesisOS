import { validateProjectState } from "./project-state.mjs";
import { createFeedbackThreadTrail } from "./evidence-trail.mjs";

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function createClaimTraceback(state, input) {
  validateProjectState(state);
  const feedbackThreadId = requireText(input?.feedbackThreadId, "Feedback thread ID");
  const sourceId = requireText(input?.sourceId, "Source ID");
  const thread = state.feedbackThreads.find((candidate) => candidate.id === feedbackThreadId);
  if (!thread) throw new Error(`Unknown feedback thread '${feedbackThreadId}'.`);
  const evidence = state.evidence.find((record) => record.feedbackThreadId === feedbackThreadId && record.sourceId === sourceId);
  if (!evidence) throw new Error(`No selected evidence for source '${sourceId}' in this feedback thread.`);
  const trail = createFeedbackThreadTrail(state, feedbackThreadId);
  const task = trail.tasks.find((candidate) => candidate.taskId === evidence.taskId);
  if (!task) throw new Error(`The selected evidence references unknown task '${evidence.taskId}'.`);
  const sourceNote = evidence.draft?.sourceNotes?.find((note) => note.sourceId === sourceId) ?? null;

  return {
    schemaVersion: 1,
    tracedUnit: sourceNote ? "grounded-draft-source-note" : "selected-evidence",
    source: { sourceId, title: evidence.title?.trim() || "Untitled Zotero item", abstract: evidence.abstract ?? null, doi: evidence.doi ?? null, selectedAt: evidence.selectedAt ?? null },
    claim: sourceNote ? { summary: sourceNote.summary, relevance: sourceNote.relevance } : null,
    feedback: { id: thread.id, title: thread.title?.trim() || "Supervisor feedback", comment: thread.feedback },
    task: { id: task.taskId, title: task.task, approvalStatus: task.approvalStatus, tool: task.tool },
    responseMatrix: { status: task.status, note: task.note }
  };
}
