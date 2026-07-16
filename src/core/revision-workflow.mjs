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
export function createRevisionWorkflow({ loadState, persistState, previewNote, serialize = (operation) => operation() }) {
  const projectView = (state, feedbackThreadId = null) => {
    const thread = feedbackThreadId ? state.feedbackThreads.find(({ id }) => id === feedbackThreadId) : state.feedbackThreads.at(-1);
    if (!thread) return null;
    const workflow = workflowReadModel(state, thread.id);
    const preview = workflow.draft ? previewNote({ project: state.project.name, feedback: workflow.feedback, evidenceRefs: workflow.selectedEvidence, draft: workflow.draft }) : null;
    return { ...workflow, preview };
  };
  const response = (state, feedbackThreadId) => ({ state, readiness: profileReadiness(state), workflow: projectView(state, feedbackThreadId) });
  const mutate = (transition) => serialize(async () => {
    const current = await loadState();
    const result = await transition(current);
    if (result.state !== current) await persistState(result.state, { expectedRevision: current.revision });
    return result;
  });

  return {
    async read(feedbackThreadId = null) {
      const state = await loadState();
      const workflow = projectView(state, feedbackThreadId);
      if (!workflow) throw notFound("Feedback thread was not found.");
      return { ...response(state, workflow.feedbackThreadId), workflow };
    },
    async capture(input) {
      return mutate((current) => {
        const match = findFeedbackMatch(current, input);
        if (match?.kind === "exact") return { state: current, readiness: profileReadiness(current), feedbackThread: match.thread, deduplication: "already_saved" };
        const state = recordFeedback(current, match ? { ...input, mergeIntoFeedbackThreadId: match.thread.id } : input);
        const feedbackThread = match ? state.feedbackThreads.find(({ id }) => id === match.thread.id) : state.feedbackThreads.at(-1);
        return { state, readiness: profileReadiness(state), feedbackThread, deduplication: match ? "follow_up_merged" : "new" };
      });
    },
    async confirmPlacement(input) {
      return mutate((current) => {
        const state = confirmFeedbackPlacement(current, input);
        return response(state, input.feedbackThreadId);
      });
    },
    async persistTaskGraph(input) {
      return mutate((current) => {
        const state = recordFeedbackTasks(current, input, { expectedRevision: input.expectedRevision });
        return response(state, input.feedbackThreadId);
      });
    },
    async reviewTask(input) {
      return mutate((current) => {
        const state = reviewCanonicalTask(current, input);
        return response(state, input.feedbackThreadId);
      });
    },
    async attachEvidence(input) {
      return mutate((current) => {
        const state = attachCanonicalEvidence(current, input, { searchArtifact: input.searchArtifact });
        return response(state, input.feedbackThreadId);
      });
    },
    async recordDraft(input, options) {
      return mutate((current) => {
        const state = recordCanonicalDraft(current, input, options);
        return response(state, input.feedbackThreadId);
      });
    }
  };
}
