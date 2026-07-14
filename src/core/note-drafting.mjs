const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6";
import { assertEvidenceNoteStyle, EVIDENCE_NOTE_WRITING_INSTRUCTIONS } from "./evidence-note-style.mjs";
export const DRAFT_SCHEMA = { type: "object", additionalProperties: false, required: ["overview", "sourceNotes"], properties: { overview: { type: "string" }, sourceNotes: { type: "array", items: { type: "object", additionalProperties: false, required: ["sourceId", "summary", "relevance"], properties: { sourceId: { type: "string" }, summary: { type: "string" }, relevance: { type: "string" } } } } } };

function sentenceParts(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
}

export function compactEvidenceText(value, maxWords, maxSentences = 1) {
  const sentence = sentenceParts(value).slice(0, maxSentences).join(" ").trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return sentence;
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;]$/, "")}…`;
}

function compactDraft(draft) {
  return {
    ...draft,
    overview: compactEvidenceText(String(draft.overview).replace(/\b(?:group|library):[A-Za-z0-9:_-]+\b/gi, "the selected evidence"), 60, 2),
    sourceNotes: draft.sourceNotes.map((note) => ({
      ...note,
      summary: compactEvidenceText(note.summary, 32),
      relevance: compactEvidenceText(note.relevance, 20)
    }))
  };
}

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
  const conciseDraft = compactDraft(draft);
  return { ...conciseDraft, styleReview: assertEvidenceNoteStyle(conciseDraft) };
}

export function createDeterministicDraft(feedback, evidenceRefs, warning = null) {
  const draft = validateGroundedDraft({ overview: "Selected papers provide context for the feedback, but the abstracts alone do not settle the required thesis revision. Review the most relevant source before changing the manuscript.", sourceNotes: evidenceRefs.map((reference) => ({ sourceId: reference.sourceId, summary: reference.abstract || `Abstract unavailable for ${reference.title}.`, relevance: "Check this source against the feedback before using it in the thesis." })) }, evidenceRefs);
  return { schemaVersion: 1, provider: "deterministic-template", model: "none", warning, ...draft };
}

export async function draftEvidenceNoteWithOpenAI({ feedback, evidenceRefs, approvedExternalProcessing, thesisContext = null }, options = {}) {
  if (approvedExternalProcessing !== true) throw new Error("Explicit approval is required before sending selected evidence to GPT-5.6.");
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.length) throw new Error("Selected evidence is required for drafting.");
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const context = evidenceRefs.map((reference) => ({ sourceId: reference.sourceId, title: reference.title, abstract: reference.abstract, tags: reference.tags, doi: reference.doi }));
  const systemPrompt = [
    "Draft a short decision brief using only the supplied sources. Overview: at most two sentences and 60 words. Each source summary: one sentence and at most 32 words. Each relevance note: one sentence and at most 20 words. Never expose source IDs in prose; the interface links sources separately. Distinguish source reporting from researcher interpretation.",
    EVIDENCE_NOTE_WRITING_INSTRUCTIONS
  ].join("\n\n");
  const response = await fetchImpl(options.apiUrl ?? API_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, input: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify({ feedback, thesisContext, selectedEvidence: context }) }], text: { format: { type: "json_schema", name: "grounded_literature_note", strict: true, schema: DRAFT_SCHEMA } } }) });
  const body = await response.json();
  if (!response.ok) throw new Error(`OpenAI drafting failed: ${body.error?.message ?? `HTTP ${response.status}`}`);
  let generated;
  try { generated = JSON.parse(outputText(body)); } catch (error) { throw new Error(`OpenAI returned invalid draft JSON: ${error.message}`); }
  return { schemaVersion: 1, provider: "openai", model, ...validateGroundedDraft(generated, evidenceRefs) };
}
