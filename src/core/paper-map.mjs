function bibliography(source) {
  return {
    title: source.title ?? null,
    creators: source.creators ?? [],
    year: source.year ?? null,
    doi: source.doi ?? null,
    url: source.url ?? null
  };
}

function field(value, provenance) {
  return { value, provenance };
}

const reviewField = () => field(null, { kind: "needs-review" });

export function createPaperCard(source, options = {}) {
  if (!source?.sourceId || !source?.title) throw new Error("A selected source with a stable source ID and title is required.");
  const abstract = typeof source.abstract === "string" && source.abstract.trim() ? source.abstract.trim() : null;
  return {
    schemaVersion: 1,
    sourceId: source.sourceId,
    bibliography: bibliography(source),
    createdAt: options.createdAt ?? new Date().toISOString(),
    summary: abstract ? field(abstract, { kind: "zotero-abstract" }) : reviewField(),
    researchQuestion: reviewField(),
    method: reviewField(),
    data: reviewField(),
    findings: reviewField(),
    limitations: reviewField(),
    thesisRelevance: reviewField()
  };
}

const mapFields = [
  ["summary", "Summary"],
  ["researchQuestion", "Research question"],
  ["method", "Method"],
  ["data", "Data"],
  ["findings", "Findings"],
  ["limitations", "Limitations"],
  ["thesisRelevance", "Thesis relevance"]
];

export function paperMap(card) {
  if (!card?.sourceId || !card?.bibliography?.title) throw new Error("A valid paper card is required.");
  return {
    root: {
      id: `paper:${card.sourceId}`,
      label: card.bibliography.title,
      children: mapFields.map(([key, label]) => ({
        id: key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        label,
        value: card[key]?.value ?? null,
        status: card[key]?.provenance?.kind === "needs-review" ? "needs-review" : "grounded",
        provenance: card[key]?.provenance ?? { kind: "needs-review" }
      }))
    }
  };
}
