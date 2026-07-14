import { confirmFeedbackPlacement, findFeedbackMatch, profileReadiness, recordFeedback, recordFeedbackTasks, reviewCanonicalTask } from "./project-state.mjs";
import { attachCanonicalEvidence, recordCanonicalDraft, workflowReadModel } from "./workflow.mjs";

function notFound(message) {
  const error = new Error(message);
  error.code = "NOT_FOUND";
  return error;
}

/**
 * Canonical application boundary for one feedback thread's revision lifecycle.
 * HTTP handlers and UI adapters should use this module rather than composing
 * state mutation, persistence, and read-model projection independently.
 */
export function createRevisionWorkflow({ loadState, persistState, previewNote }) {
  const projectView = (state, feedbackThreadId = null) => {
    const thread = feedbackThreadId ? state.feedbackThreads.find(({ id }) => id === feedbackThreadId) : state.feedbackThreads.at(-1);
    if (!thread) return null;
    const workflow = workflowReadModel(state, thread.id);
    const preview = workflow.draft ? previewNote({ project: state.project.name, feedback: workflow.feedback, evidenceRefs: workflow.selectedEvidence, draft: workflow.draft }) : null;
    return { ...workflow, preview };
  };
  const response = (state, feedbackThreadId) => ({ state, readiness: profileReadiness(state), workflow: projectView(state, feedbackThreadId) });

  return {
    async read(feedbackThreadId = null) {
      const state = await loadState();
      const workflow = projectView(state, feedbackThreadId);
      if (!workflow) throw notFound("Feedback thread was not found.");
      return { ...response(state, workflow.feedbackThreadId), workflow };
    },
    async capture(input) {
      const current = await loadState();
      const match = findFeedbackMatch(current, input);
      if (match?.kind === "exact") return { state: current, readiness: profileReadiness(current), feedbackThread: match.thread, deduplication: "already_saved" };
      const state = recordFeedback(current, match ? { ...input, mergeIntoFeedbackThreadId: match.thread.id } : input);
      await persistState(state);
      const feedbackThread = match ? state.feedbackThreads.find(({ id }) => id === match.thread.id) : state.feedbackThreads.at(-1);
      return { state, readiness: profileReadiness(state), feedbackThread, deduplication: match ? "follow_up_merged" : "new" };
    },
    async confirmPlacement(input) {
      const state = confirmFeedbackPlacement(await loadState(), input);
      await persistState(state);
      return response(state, input.feedbackThreadId);
    },
    async persistTaskGraph(input) {
      const state = recordFeedbackTasks(await loadState(), input, { expectedRevision: input.expectedRevision });
      await persistState(state);
      return response(state, input.feedbackThreadId);
    },
    async reviewTask(input) {
      const state = reviewCanonicalTask(await loadState(), input);
      await persistState(state);
      return response(state, input.feedbackThreadId);
    },
    async attachEvidence(input) {
      const state = attachCanonicalEvidence(await loadState(), input, { searchArtifact: input.searchArtifact });
      await persistState(state);
      return response(state, input.feedbackThreadId);
    },
    async recordDraft(input, options) {
      const state = recordCanonicalDraft(await loadState(), input, options);
      await persistState(state);
      return response(state, input.feedbackThreadId);
    }
  };
}
