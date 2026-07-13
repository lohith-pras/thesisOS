import test from "node:test";
import assert from "node:assert/strict";
import { createDeterministicDraft, draftEvidenceNoteWithOpenAI, validateGroundedDraft } from "../src/core/note-drafting.mjs";

const evidenceRefs = [{ sourceId: "group:1:A", title: "Paper A", abstract: "A supported abstract.", tags: ["ISAC"], doi: "10.1/a" }];

test("requires explicit consent before external drafting", async () => {
  await assert.rejects(() => draftEvidenceNoteWithOpenAI({ feedback: "Review it", evidenceRefs, approvedExternalProcessing: false }, { apiKey: "test" }), /Explicit approval/);
});

test("sends only selected evidence context and validates citations", async () => {
  let request;
  const draft = await draftEvidenceNoteWithOpenAI({ feedback: "Review it", evidenceRefs, approvedExternalProcessing: true }, { apiKey: "test", fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ overview: "Grounded overview", sourceNotes: [{ sourceId: "group:1:A", summary: "Supported", relevance: "Relevant" }] }) }) };
  } });
  assert.equal(draft.provider, "openai");
  assert.equal(request.store, false);
  assert.match(request.input[1].content, /A supported abstract/);
  assert.throws(() => validateGroundedDraft({ overview: "x", sourceNotes: [{ sourceId: "invented", summary: "x", relevance: "x" }] }, evidenceRefs), /unselected source/);
});

test("deterministic fallback remains grounded in selected evidence", () => {
  const draft = createDeterministicDraft("Review it", evidenceRefs, "offline");
  assert.equal(draft.sourceNotes[0].sourceId, "group:1:A");
  assert.equal(draft.warning, "offline");
});
