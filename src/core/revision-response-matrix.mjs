import { createEvidenceTrail } from "./evidence-trail.mjs";

function tableCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function createRevisionResponseMatrix(state) {
  const rows = createEvidenceTrail(state).flatMap((thread) => thread.tasks.map((task) => ({
    feedbackThreadId: task.feedbackThreadId,
    taskId: task.taskId,
    supervisorComment: task.supervisorComment,
    task: task.task,
    status: task.status,
    evidence: task.evidenceLabels,
    note: task.note
  })));
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
