import { validateTaskGraph } from "./schema.mjs";
import { ensureLiteratureTask } from "./decompose.mjs";
import { generateStructuredJson } from "./model-provider.mjs";

// Pin the flagship tier so API responses and operational telemetry identify the
// intended GPT-5.6 family member rather than the moving family alias.
const DEFAULT_MODEL = "gpt-5.6-sol";

const TASK_GRAPH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks", "nextAction"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "title", "tool", "status", "dependsOn", "evidence", "objectiveIds", "targetLocationIds"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["literature", "notes", "thesis", "experiment"] },
          title: { type: "string" },
          tool: { type: "string", enum: ["zotero", "obsidian", "overleaf", "vscode"] },
          status: { type: "string", enum: ["ready", "blocked", "in_progress", "completed"] },
          dependsOn: { type: "array", items: { type: "string" } },
          evidence: { type: "array", items: { type: "string" } }
          ,objectiveIds: { type: "array", items: { type: "string" } }
          ,targetLocationIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    nextAction: { type: "string" }
  }
};

const TASK_DECOMPOSITION_PROMPT = `You decompose supervisor feedback for a thesis into a reviewable task graph.
Create only tasks directly supported by the feedback. Use these mappings exactly: literature=zotero, notes=obsidian, thesis=overleaf, experiment=vscode.
Use stable ids: task-literature, task-notes, task-thesis, task-experiment. A task may depend only on tasks that exist in your returned array. Keep evidence concrete and reviewable. Return objectiveIds and targetLocationIds from the approved context for every task, using empty arrays when none apply. Do not invent papers, claims, manuscript locations, objectives, results, or tool actions.`;

export async function decomposeFeedbackWithOpenAI(feedback, options = {}) {
  return decomposeFeedbackWithModelProvider(feedback, { ...options, provider: "openai" });
}

export async function decomposeFeedbackWithModelProvider(feedback, options = {}) {
  const provider = options.provider ?? "openai";
  const model = options.model ?? (provider === "openrouter" ? process.env.OPENROUTER_MODEL : provider === "ollama" ? process.env.OLLAMA_MODEL : process.env.OPENAI_MODEL) ?? DEFAULT_MODEL;
  const generated = await generateStructuredJson({
    provider, model, schema: TASK_GRAPH_SCHEMA, schemaName: "thesis_task_graph",
    messages: [
      { role: "system", content: TASK_DECOMPOSITION_PROMPT },
      { role: "user", content: `${options.context ? `Approved thesis context:\n${JSON.stringify(options.context)}\n\n` : ""}Supervisor feedback:\n${feedback.trim()}` }
    ]
  }, options);
  return validateTaskGraph({
    schemaVersion: 1, feedback: feedback.trim(), createdAt: new Date().toISOString(),
    tasks: ensureLiteratureTask(generated.value.tasks.map((task) => ({ ...task, approvalStatus: "pending" }))), nextAction: generated.value.nextAction
  });
}

export { DEFAULT_MODEL, TASK_GRAPH_SCHEMA, TASK_DECOMPOSITION_PROMPT };
