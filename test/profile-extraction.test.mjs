import test from "node:test";
import assert from "node:assert/strict";

const module = await import("../src/core/profile-extraction.mjs").catch(() => ({}));

const document = {
  id: "document-1",
  combinedText: "Cognitive ISAC. Develop an online optimization framework.",
  segments: [{ locator: "page:1", text: "Cognitive ISAC. Develop an online optimization framework." }]
};

test("exports strict profile extraction", () => {
  assert.equal(typeof module.proposeProfileWithCodex, "function");
  assert.equal(typeof module.proposeProfileWithOpenAI, "function");
  assert.equal(typeof module.validateProfileProposal, "function");
});

test("extracts the same validated profile through the OpenAI structured-output boundary", async () => {
  let request;
  const proposal = await module.proposeProfileWithOpenAI({ document, approvedExternalProcessing: true }, {
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return { ok: true, json: async () => ({ status: "completed", output_text: JSON.stringify({ title: { value: "Cognitive ISAC", sourceId: "document-1", locator: "page:1", excerpt: "Cognitive ISAC" }, topic: null, objectives: [], problems: [], seedReferences: [] }) }) };
    }
  });
  assert.equal(request.store, false);
  assert.equal(proposal.fields.title.value, "Cognitive ISAC");
});

test("requires consent before sending normalized document text", async () => {
  await assert.rejects(() => module.proposeProfileWithCodex({ document, approvedExternalProcessing: false }), /Explicit approval/);
});

test("validates locator provenance and strips provider status", async () => {
  const proposal = await module.proposeProfileWithCodex({ document, approvedExternalProcessing: true }, {
    invoke: async () => ({
      title: { value: "Cognitive ISAC", sourceId: "document-1", locator: "page:1", excerpt: "Cognitive ISAC" },
      topic: { value: "Intelligent decision-making for ISAC", sourceId: "document-1", locator: "page:1", excerpt: "Cognitive ISAC" },
      objectives: [{ id: "objective-1", text: "Develop online optimization", sourceId: "document-1", locator: "page:1", excerpt: "Develop an online optimization framework" }],
      problems: [],
      seedReferences: [],
      status: "approved"
    })
  });
  assert.equal(proposal.fields.title.provenance.kind, "extracted");
  assert.equal(proposal.status, undefined);
});

test("rejects invented document locators", async () => {
  await assert.rejects(() => module.proposeProfileWithCodex({ document, approvedExternalProcessing: true }, {
    invoke: async () => ({ title: { value: "Invented", sourceId: "document-1", locator: "page:99", excerpt: "Invented" }, objectives: [], problems: [], seedReferences: [] })
  }), /unknown locator/);
});
