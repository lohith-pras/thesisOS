import { validateArtifacts } from "./schema.mjs";

const DECISIONS = new Set(["approved", "rejected"]);

export function summarizeApprovals(tasks) {
  return tasks.reduce((summary, task) => {
    summary[task.approvalStatus] += 1;
    return summary;
  }, { pending: 0, approved: 0, rejected: 0 });
}

function nextActionFor(tasks) {
  const pending = tasks.find((task) => task.approvalStatus === "pending");
  if (pending) return `Review: ${pending.title}`;
  const ready = tasks.find((task) => task.approvalStatus === "approved" && task.status === "ready");
  if (ready) return ready.title;
  const blocked = tasks.find((task) => task.approvalStatus === "approved");
  if (blocked) return `Complete prerequisite tasks for: ${blocked.title}`;
  return "No approved tasks remain";
}

export function applyReviewDecisions(taskGraph, state, decisions, options = {}) {
  validateArtifacts(taskGraph, state);
  const taskIds = new Set(taskGraph.tasks.map((task) => task.id));

  for (const [taskId, decision] of Object.entries(decisions)) {
    if (!taskIds.has(taskId)) throw new Error(`Unknown task id '${taskId}'`);
    if (!DECISIONS.has(decision)) throw new Error(`Invalid decision '${decision}' for task '${taskId}'`);
  }

  const reviewedAt = options.now ?? new Date().toISOString();
  const tasks = taskGraph.tasks.map((task) => {
    const decision = decisions[task.id];
    return decision ? { ...task, approvalStatus: decision, reviewedAt } : { ...task };
  });
  const approvalSummary = summarizeApprovals(tasks);
  const reviewedGraph = {
    ...taskGraph,
    tasks,
    nextAction: nextActionFor(tasks),
    approvalSummary,
    reviewedAt
  };

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const reviewedState = {
    ...state,
    feedbackThreads: state.feedbackThreads.map((thread) => ({
      ...thread,
      tasks: thread.tasks.map((task) => {
        const reviewedTask = taskById.get(task.id);
        if (!reviewedTask) throw new Error(`State contains unknown task id '${task.id}'`);
        return {
          ...task,
          approvalStatus: reviewedTask.approvalStatus,
          ...(reviewedTask.reviewedAt ? { reviewedAt: reviewedTask.reviewedAt } : {})
        };
      })
    }))
  };

  validateArtifacts(reviewedGraph, reviewedState);
  return { taskGraph: reviewedGraph, state: reviewedState };
}
