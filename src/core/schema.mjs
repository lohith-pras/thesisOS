const TASK_KINDS = new Set(["literature", "notes", "thesis", "experiment"]);
const TASK_STATUSES = new Set(["ready", "blocked", "in_progress", "completed"]);
const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected"]);

function fail(path, message) {
  throw new Error(`Invalid schema at ${path}: ${message}`);
}

function requireString(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
}

function requireArray(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
}

export function validateTaskGraph(graph) {
  if (!graph || typeof graph !== "object") fail("taskGraph", "expected an object");
  if (graph.schemaVersion !== 1) fail("taskGraph.schemaVersion", "expected version 1");
  requireString(graph.feedback, "taskGraph.feedback");
  requireString(graph.createdAt, "taskGraph.createdAt");
  requireArray(graph.tasks, "taskGraph.tasks");
  requireString(graph.nextAction, "taskGraph.nextAction");

  const ids = new Set();
  for (const [index, task] of graph.tasks.entries()) {
    const path = `taskGraph.tasks[${index}]`;
    if (!task || typeof task !== "object") fail(path, "expected an object");
    requireString(task.id, `${path}.id`);
    if (ids.has(task.id)) fail(`${path}.id`, `duplicate task id '${task.id}'`);
    ids.add(task.id);
    if (!TASK_KINDS.has(task.kind)) fail(`${path}.kind`, "unknown task kind");
    requireString(task.title, `${path}.title`);
    requireString(task.tool, `${path}.tool`);
    if (!TASK_STATUSES.has(task.status)) fail(`${path}.status`, "unknown task status");
    if (!APPROVAL_STATUSES.has(task.approvalStatus)) fail(`${path}.approvalStatus`, "unknown approval status");
    if (task.reviewedAt !== undefined) requireString(task.reviewedAt, `${path}.reviewedAt`);
    requireArray(task.evidence, `${path}.evidence`);
    if (!task.evidence.every((item) => typeof item === "string" && item.trim())) fail(`${path}.evidence`, "expected non-empty strings");
    if (task.dependsOn !== undefined) {
      requireArray(task.dependsOn, `${path}.dependsOn`);
      if (!task.dependsOn.every((id) => typeof id === "string")) fail(`${path}.dependsOn`, "expected task ids");
    }
  }

  for (const [index, task] of graph.tasks.entries()) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) fail(`taskGraph.tasks[${index}].dependsOn`, `unknown task id '${dependency}'`);
      if (dependency === task.id) fail(`taskGraph.tasks[${index}].dependsOn`, "cannot depend on itself");
    }
  }
  return graph;
}

export function validateThesisState(state) {
  if (!state || typeof state !== "object") fail("state", "expected an object");
  if (state.schemaVersion !== 1) fail("state.schemaVersion", "expected version 1");
  requireString(state.project, "state.project");
  if (!state.privacy || state.privacy.mode !== "local-first") fail("state.privacy", "expected local-first privacy mode");
  if (state.privacy.approvalRequiredForWrites !== true) fail("state.privacy.approvalRequiredForWrites", "must be true");
  if (!state.thesis || typeof state.thesis !== "object") fail("state.thesis", "expected an object");
  requireArray(state.thesis.chapters, "state.thesis.chapters");
  requireArray(state.feedbackThreads, "state.feedbackThreads");
  for (const [index, thread] of state.feedbackThreads.entries()) {
    const path = `state.feedbackThreads[${index}]`;
    requireString(thread.id, `${path}.id`);
    requireString(thread.feedback, `${path}.feedback`);
    requireArray(thread.tasks, `${path}.tasks`);
    for (const [taskIndex, task] of thread.tasks.entries()) {
      if (!APPROVAL_STATUSES.has(task.approvalStatus)) {
        fail(`${path}.tasks[${taskIndex}].approvalStatus`, "unknown approval status");
      }
    }
  }
  return state;
}

export function validateArtifacts(taskGraph, state) {
  validateTaskGraph(taskGraph);
  validateThesisState(state);
  return { taskGraph, state };
}
