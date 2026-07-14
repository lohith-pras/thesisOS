import { validateTaskGraph } from "./schema.mjs";
import { ensureLiteratureTask } from "./decompose.mjs";

const DEFAULT_MODEL = "gpt-5.6";
const API_URL = "https://api.openai.com/v1/responses";

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

function getOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  const text = response.output?.flatMap((item) => item.content ?? [])?.find((content) => typeof content.text === "string")?.text;
  if (text?.trim()) return text;
  throw new Error("OpenAI response did not contain structured output text.");
}

export async function decomposeFeedbackWithOpenAI(feedback, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for --ai. Keep it in your local environment.");

  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(options.apiUrl ?? API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: "system", content: TASK_DECOMPOSITION_PROMPT },
        { role: "user", content: `${options.context ? `Approved thesis context:\n${JSON.stringify(options.context)}\n\n` : ""}Supervisor feedback:\n${feedback.trim()}` }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "thesis_task_graph",
          strict: true,
          schema: TASK_GRAPH_SCHEMA
        }
      }
    })
  });

  const body = await response.json();
  if (!response.ok) throw new Error(`OpenAI request failed: ${body.error?.message ?? `HTTP ${response.status}`}`);
  if (body.status && body.status !== "completed") throw new Error(`OpenAI response was not completed: ${body.status}`);

  let generated;
  try {
    generated = JSON.parse(getOutputText(body));
  } catch (error) {
    throw new Error(`OpenAI returned invalid task graph JSON: ${error.message}`);
  }

  return validateTaskGraph({
    schemaVersion: 1,
    feedback: feedback.trim(),
    createdAt: new Date().toISOString(),
    tasks: ensureLiteratureTask(generated.tasks.map((task) => ({ ...task, approvalStatus: "pending" }))),
    nextAction: generated.nextAction
  });
}

export { DEFAULT_MODEL, TASK_GRAPH_SCHEMA, TASK_DECOMPOSITION_PROMPT };
