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
  assert.match(request.input[0].content, /Avoid generic significance claims/);
  assert.equal(draft.styleReview.passed, true);
  assert.throws(() => validateGroundedDraft({ overview: "x", sourceNotes: [{ sourceId: "invented", summary: "x", relevance: "x" }] }, evidenceRefs), /unselected source/);
});

test("rejects clear canned AI-writing tells in an evidence note", () => {
  assert.throws(() => validateGroundedDraft({
    overview: "In conclusion, this paper makes a pivotal contribution.",
    sourceNotes: [{ sourceId: "group:1:A", summary: "The study reports a measured finding.", relevance: "Use it to assess the feedback." }]
  }, evidenceRefs), /evidence writing check: canned-closure, generic-significance/);
});

test("deterministic fallback remains grounded in selected evidence", () => {
  const draft = createDeterministicDraft("Review it", evidenceRefs, "offline");
  assert.equal(draft.sourceNotes[0].sourceId, "group:1:A");
  assert.equal(draft.warning, "offline");
  assert.equal(draft.styleReview.passed, true);
});

test("compacts evidence notes into a readable brief without source IDs in the overview", () => {
  const draft = validateGroundedDraft({
    overview: "group:1:A reports a detailed finding about channel modelling, target geometry, scattering, and estimation. A second sentence adds more detail about evaluation conditions and model limitations. A third sentence should not reach the reader.",
    sourceNotes: [{ sourceId: "group:1:A", summary: "This source reports a long technical finding with many implementation details, assumptions, variables, scenarios, and evaluation conditions that should be shortened for a quick evidence decision.", relevance: "Use this source when deciding whether the system model needs a target representation that goes beyond deterministic geometry and includes a reviewable limitation." }]
  }, evidenceRefs);
  assert.doesNotMatch(draft.overview, /group:1:A/);
  assert.ok(draft.overview.split(/\s+/).length <= 60);
  assert.ok(draft.sourceNotes[0].summary.split(/\s+/).length <= 32);
  assert.ok(draft.sourceNotes[0].relevance.split(/\s+/).length <= 20);
});
