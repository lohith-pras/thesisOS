const TOOL_BY_KIND = {
  literature: "zotero",
  notes: "obsidian",
  thesis: "overleaf",
  experiment: "vscode"
};

/**
 * Deterministic demo fallback. The future agent adapter will replace the
 * keyword extraction while preserving this output contract.
 */
export function decomposeFeedback(feedback) {
  const text = feedback.trim();
  const tasks = [];

  if (/paper|article|literature|citation|compare|khalili|source/i.test(text)) {
    tasks.push({
      id: "task-literature",
      kind: "literature",
      title: "Find and review the requested literature",
      tool: TOOL_BY_KIND.literature,
      status: "ready",
      approvalStatus: "pending",
      evidence: ["Search Zotero for referenced papers", "Capture claim, method, and limitation"]
    });
  }

  if (/section|chapter|thesis|write|revise|methodology|3\.2/i.test(text)) {
    tasks.push({
      id: "task-notes",
      kind: "notes",
      title: "Draft the supporting literature note",
      tool: TOOL_BY_KIND.notes,
      status: "blocked",
      approvalStatus: "pending",
      dependsOn: tasks.some((task) => task.id === "task-literature") ? ["task-literature"] : [],
      evidence: ["Create a structured Obsidian note", "Link the note to the thesis claim"]
    });
    tasks.push({
      id: "task-thesis",
      kind: "thesis",
      title: "Prepare the proposed thesis section revision",
      tool: TOOL_BY_KIND.thesis,
      status: "blocked",
      approvalStatus: "pending",
      dependsOn: tasks.filter((task) => ["task-literature", "task-notes"].includes(task.id)).map((task) => task.id),
      evidence: ["Patch the relevant .tex section", "Keep the change reviewable"]
    });
  }

  if (/experiment|simulation|sim|rerun|result|code|parameter/i.test(text)) {
    tasks.push({
      id: "task-experiment",
      kind: "experiment",
      title: "Plan and rerun the supporting experiment",
      tool: TOOL_BY_KIND.experiment,
      status: "blocked",
      approvalStatus: "pending",
      dependsOn: tasks.some((task) => task.id === "task-thesis") ? ["task-thesis"] : [],
      evidence: ["Create a reproducible run plan", "Compare output with the drafted claim"]
    });
  }

  return {
    schemaVersion: 1,
    feedback: text,
    createdAt: new Date().toISOString(),
    tasks,
    nextAction: tasks[0]?.title ?? "Ask for a concrete supervisor comment"
  };
}
