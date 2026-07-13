const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6";
const DRAFT_SCHEMA = { type: "object", additionalProperties: false, required: ["overview", "sourceNotes"], properties: { overview: { type: "string" }, sourceNotes: { type: "array", items: { type: "object", additionalProperties: false, required: ["sourceId", "summary", "relevance"], properties: { sourceId: { type: "string" }, summary: { type: "string" }, relevance: { type: "string" } } } } } };

function outputText(body) {
  if (typeof body.output_text === "string") return body.output_text;
  return body.output?.flatMap((item) => item.content ?? []).find((item) => typeof item.text === "string")?.text;
}

export function validateGroundedDraft(draft, evidenceRefs) {
  if (!draft || typeof draft.overview !== "string" || !Array.isArray(draft.sourceNotes)) throw new Error("Draft has an invalid structure.");
  const allowed = new Set(evidenceRefs.map((reference) => reference.sourceId));
  for (const note of draft.sourceNotes) {
    if (!allowed.has(note.sourceId)) throw new Error(`Draft cited unselected source '${note.sourceId}'.`);
    if (typeof note.summary !== "string" || typeof note.relevance !== "string") throw new Error("Draft source notes must contain summary and relevance text.");
  }
  return draft;
}

export function createDeterministicDraft(feedback, evidenceRefs, warning = null) {
  return { schemaVersion: 1, provider: "deterministic-template", model: "none", warning, overview: `Review the selected evidence against the supervisor feedback: ${feedback}`, sourceNotes: evidenceRefs.map((reference) => ({ sourceId: reference.sourceId, summary: reference.abstract || `Abstract unavailable for ${reference.title}.`, relevance: "Researcher review required before making a thesis claim." })) };
}

export async function draftEvidenceNoteWithOpenAI({ feedback, evidenceRefs, approvedExternalProcessing }, options = {}) {
  if (approvedExternalProcessing !== true) throw new Error("Explicit approval is required before sending selected evidence to GPT-5.6.");
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.length) throw new Error("Selected evidence is required for drafting.");
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const context = evidenceRefs.map((reference) => ({ sourceId: reference.sourceId, title: reference.title, abstract: reference.abstract, tags: reference.tags, doi: reference.doi }));
  const response = await fetchImpl(options.apiUrl ?? API_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, input: [{ role: "system", content: "Draft a concise literature synthesis using only the supplied sources. Never cite or infer a source ID not supplied. Distinguish source summaries from researcher interpretation." }, { role: "user", content: JSON.stringify({ feedback, selectedEvidence: context }) }], text: { format: { type: "json_schema", name: "grounded_literature_note", strict: true, schema: DRAFT_SCHEMA } } }) });
  const body = await response.json();
  if (!response.ok) throw new Error(`OpenAI drafting failed: ${body.error?.message ?? `HTTP ${response.status}`}`);
  let generated;
  try { generated = JSON.parse(outputText(body)); } catch (error) { throw new Error(`OpenAI returned invalid draft JSON: ${error.message}`); }
  return { schemaVersion: 1, provider: "openai", model, ...validateGroundedDraft(generated, evidenceRefs) };
}
