import { validateTaskGraph } from "./schema.mjs";

export function selectEvidenceReferences(taskGraph, searchArtifact, sourceIds, options = {}) {
  validateTaskGraph(taskGraph);
  const literatureTask = taskGraph.tasks.find((task) => task.kind === "literature");
  if (!literatureTask || literatureTask.approvalStatus !== "approved") {
    throw new Error("An approved literature task is required before selecting evidence.");
  }
  if (!searchArtifact || searchArtifact.taskId !== literatureTask.id || !Array.isArray(searchArtifact.candidates)) {
    throw new Error("A matching Zotero search artifact is required.");
  }
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) throw new Error("Select at least one paper as evidence.");
  const uniqueIds = [...new Set(sourceIds)];
  if (uniqueIds.length !== sourceIds.length) throw new Error("Evidence source IDs must be unique.");

  const candidates = new Map(searchArtifact.candidates.map((candidate) => [candidate.sourceId, candidate]));
  const evidenceRefs = uniqueIds.map((sourceId) => {
    const candidate = candidates.get(sourceId);
    if (!candidate) throw new Error(`Selected source '${sourceId}' is not present in the search artifact.`);
    return {
      sourceId: candidate.sourceId,
      key: candidate.key,
      library: candidate.sourceLibrary,
      title: candidate.title,
      creators: candidate.creators ?? [],
      year: candidate.year ?? null,
      doi: candidate.doi ?? null,
      url: candidate.url ?? null
    };
  });
  const selectedAt = options.now ?? new Date().toISOString();
  const tasks = taskGraph.tasks.map((task) => task.id === literatureTask.id ? { ...task, evidenceRefs } : task);
  const updatedGraph = { ...taskGraph, tasks };
  validateTaskGraph(updatedGraph);

  return {
    taskGraph: updatedGraph,
    selection: {
      schemaVersion: 1,
      taskId: literatureTask.id,
      query: searchArtifact.query,
      selectedAt,
      selectedCount: evidenceRefs.length,
      evidenceRefs
    }
  };
}
