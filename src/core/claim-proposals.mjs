import { invokeCodex } from "./codex.mjs";

const CLAIM_PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "chapterId", "locationId", "sourceIds", "rationale"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          chapterId: { type: "string" },
          locationId: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" }, uniqueItems: true },
          rationale: { type: "string" }
        }
      }
    }
  }
};

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export async function proposeClaimEvidenceLinksWithCodex(input, options = {}) {
  if (input?.approvedExternalProcessing !== true) throw new Error("Explicit approval is required before sending thesis excerpts to Codex CLI.");
  if (!Array.isArray(input.excerpts) || input.excerpts.length === 0) throw new Error("At least one thesis excerpt is required.");
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new Error("Selected evidence is required.");
  const locations = new Set(input.excerpts.map(({ locationId }) => locationId));
  const sourceIds = new Set(input.evidence.map(({ sourceId }) => sourceId));
  const prompt = [
    "Propose reviewable links between claims present in the supplied thesis excerpts and the selected evidence.",
    "Use only supplied location IDs and source IDs. Do not invent claims, results, or citations.",
    "A proposal is not an approval. Return only JSON matching the schema.",
    "",
    JSON.stringify({ thesisExcerpts: input.excerpts, selectedEvidence: input.evidence })
  ].join("\n");
  const generated = await (options.invokeCodex ?? invokeCodex)({
    prompt,
    schema: CLAIM_PROPOSAL_SCHEMA,
    model: options.model,
    cwd: options.cwd ?? process.cwd(),
    command: options.command
  });
  if (!Array.isArray(generated?.proposals)) throw new Error("Codex returned an invalid claim proposal collection.");
  const ids = new Set();
  return generated.proposals.map((proposal) => {
    const id = requireText(proposal.id, "Proposal ID");
    if (ids.has(id)) throw new Error(`Codex returned duplicate proposal ID '${id}'.`);
    ids.add(id);
    const locationId = requireText(proposal.locationId, `Proposal '${id}' location`);
    if (!locations.has(locationId)) throw new Error(`Proposal '${id}' references unknown location '${locationId}'.`);
    if (!Array.isArray(proposal.sourceIds)) throw new Error(`Proposal '${id}' sourceIds must be an array.`);
    for (const sourceId of proposal.sourceIds) {
      if (!sourceIds.has(sourceId)) throw new Error(`Proposal '${id}' references unknown source '${sourceId}'.`);
    }
    return {
      id,
      text: requireText(proposal.text, `Proposal '${id}' text`),
      chapterId: requireText(proposal.chapterId, `Proposal '${id}' chapter`),
      locationId,
      sourceIds: [...new Set(proposal.sourceIds)],
      rationale: requireText(proposal.rationale, `Proposal '${id}' rationale`),
      feedbackThreadIds: [],
      taskIds: []
    };
  });
}

export { CLAIM_PROPOSAL_SCHEMA };
