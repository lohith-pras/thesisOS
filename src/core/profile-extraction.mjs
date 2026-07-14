import { randomUUID } from "node:crypto";
import { invokeCodex } from "./codex.mjs";

const sourcedText = {
  type: "object",
  additionalProperties: false,
  required: ["value", "sourceId", "locator", "excerpt"],
  properties: {
    value: { type: "string" }, sourceId: { type: "string" }, locator: { type: "string" }, excerpt: { type: "string" }
  }
};

const sourcedItem = (valueKey) => ({
  type: "object",
  additionalProperties: false,
  required: ["id", valueKey, "sourceId", "locator", "excerpt"],
  properties: {
    id: { type: "string" }, [valueKey]: { type: "string" }, sourceId: { type: "string" }, locator: { type: "string" }, excerpt: { type: "string" }
  }
});

export const PROFILE_PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "topic", "objectives", "problems", "seedReferences"],
  properties: {
    title: { anyOf: [sourcedText, { type: "null" }] },
    topic: { anyOf: [sourcedText, { type: "null" }] },
    objectives: { type: "array", items: sourcedItem("text") },
    problems: { type: "array", items: { ...sourcedItem("name"), properties: { ...sourcedItem("name").properties, summary: { type: "string" } }, required: [...sourcedItem("name").required, "summary"] } },
    seedReferences: { type: "array", items: sourcedItem("text") }
  }
};

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function sourced(value, document, valueKey) {
  requireText(value[valueKey], `Profile ${valueKey}`);
  if (value.sourceId !== document.id) throw new Error(`Profile field references unknown document '${value.sourceId}'.`);
  if (!document.segments.some(({ locator }) => locator === value.locator)) throw new Error(`Profile field references unknown locator '${value.locator}'.`);
  return { ...value, [valueKey]: value[valueKey].trim(), provenance: { kind: "extracted", sourceId: value.sourceId, locator: value.locator, excerpt: requireText(value.excerpt, "Profile source excerpt") } };
}

export function validateProfileProposal(generated, document) {
  if (!generated || typeof generated !== "object") throw new Error("Profile proposal must be an object.");
  const ids = new Set();
  const list = (values, key) => {
    if (!Array.isArray(values)) throw new Error(`Profile ${key} must be an array.`);
    return values.map((value) => {
      const item = sourced(value, document, key === "problems" ? "name" : "text");
      item.id = requireText(value.id, `Profile ${key} ID`);
      if (ids.has(item.id)) throw new Error(`Duplicate profile item ID '${item.id}'.`);
      ids.add(item.id);
      if (key === "problems") item.summary = requireText(value.summary, "Profile problem summary");
      return item;
    });
  };
  const fields = {
    ...(generated.title ? { title: sourced(generated.title, document, "value") } : {}),
    ...(generated.topic ? { topic: sourced(generated.topic, document, "value") } : {}),
    objectives: list(generated.objectives ?? [], "objectives"),
    problems: list(generated.problems ?? [], "problems"),
    seedReferences: list(generated.seedReferences ?? [], "seedReferences")
  };
  return { id: `profile-proposal-${randomUUID()}`, sourceDocumentIds: [document.id], fields };
}

export async function proposeProfileWithCodex({ document, approvedExternalProcessing }, options = {}) {
  if (approvedExternalProcessing !== true) throw new Error("Explicit approval is required before processing the project document externally.");
  const prompt = [
    "Extract a thesis profile only from the supplied local document text.",
    "Every field must cite the exact supplied sourceId and locator and include a short supporting excerpt.",
    "Do not infer the researcher's selected problem, current stage, deadline, or deliverable.",
    "Return only JSON matching the provided schema.",
    "",
    JSON.stringify({ sourceId: document.id, segments: document.segments })
  ].join("\n");
  const generated = await (options.invoke ?? invokeCodex)({ prompt, schema: PROFILE_PROPOSAL_SCHEMA, model: options.model, cwd: options.cwd ?? process.cwd(), command: options.command });
  return validateProfileProposal(generated, document);
}

export async function proposeProfileWithOpenAI({ document, approvedExternalProcessing }, options = {}) {
  if (approvedExternalProcessing !== true) throw new Error("Explicit approval is required before processing the project document externally.");
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for OpenAI profile extraction.");
  const response = await (options.fetchImpl ?? globalThis.fetch)(options.apiUrl ?? "https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.6",
      store: false,
      input: [
        { role: "system", content: "Extract only supported thesis-profile facts. Every field must cite the supplied sourceId and locator. Do not infer selected scope, stage, deadline, or deliverable." },
        { role: "user", content: JSON.stringify({ sourceId: document.id, segments: document.segments }) }
      ],
      text: { format: { type: "json_schema", name: "thesis_profile_proposal", strict: true, schema: PROFILE_PROPOSAL_SCHEMA } }
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`OpenAI profile extraction failed: ${body.error?.message ?? `HTTP ${response.status}`}`);
  if (body.status && body.status !== "completed") throw new Error(`OpenAI profile extraction was not completed: ${body.status}`);
  const output = body.output_text ?? body.output?.flatMap((item) => item.content ?? []).find(({ text }) => typeof text === "string")?.text;
  if (!output) throw new Error("OpenAI profile extraction returned no structured output.");
  let generated;
  try { generated = JSON.parse(output); }
  catch (error) { throw new Error(`OpenAI profile extraction returned invalid JSON: ${error.message}`); }
  return validateProfileProposal(generated, document);
}
