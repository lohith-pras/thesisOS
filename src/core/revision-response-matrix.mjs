import { validateProjectState } from "./project-state.mjs";

function tableCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function evidenceLabel(record) {
  return `${record.title?.trim() || "Untitled Zotero item"} (${record.sourceId})`;
}

function rowForTask(thread, task, evidence) {
  const records = evidence.filter((record) => record.feedbackThreadId === thread.id && record.taskId === task.id);
  const drafted = records.find((record) => record.draft);
  const status = task.approvalStatus === "rejected"
    ? "Rejected by researcher"
    : task.approvalStatus === "pending"
      ? "Awaiting researcher approval"
      : drafted
        ? "Grounded note drafted"
        : records.length
          ? "Evidence selected"
          : "Approved · evidence not yet selected";
  return {
    feedbackThreadId: thread.id,
    taskId: task.id,
    supervisorComment: thread.feedback,
    task: task.title,
    status,
    evidence: records.map(evidenceLabel),
    note: drafted ? `Grounded draft available · ${drafted.draft.provider ?? "unknown provider"}` : "—"
  };
}

export function createRevisionResponseMatrix(state) {
  validateProjectState(state);
  const rows = state.feedbackThreads.flatMap((thread) => (thread.tasks ?? []).map((task) => rowForTask(thread, task, state.evidence)));
  const markdown = [
    `# Revision Response Matrix — ${state.project.name}`,
    "",
    "Generated from ThesisOS's canonical approval and evidence trail. It records what the researcher approved; it does not claim manuscript changes that ThesisOS cannot verify.",
    "",
    "| Supervisor comment | Proposed task | Status | Approved evidence | Grounded note |",
    "| --- | --- | --- | --- | --- |",
    ...(rows.length
      ? rows.map((row) => `| ${tableCell(row.supervisorComment)} | ${tableCell(row.task)} | ${tableCell(row.status)} | ${tableCell(row.evidence.join("; "))} | ${tableCell(row.note)} |`)
      : ["| No feedback has been captured yet. | — | — | — | — |"])
  ].join("\n");
  return { schemaVersion: 1, project: state.project.name, generatedAt: new Date().toISOString(), rows, markdown };
}
