import { extractLiteratureQuery, requireApprovedLiteratureTask } from "./zotero.mjs";
import { rankResearchPapers } from "./retrieval.mjs";

const DEMO_LIBRARY = { type: "fixture", id: "demo", name: "ThesisOS demo library", paperCount: 3 };

const DEMO_PAPERS = [
  {
    key: "DEMO001",
    sourceId: "fixture:demo:DEMO001",
    sourceLibrary: DEMO_LIBRARY,
    itemType: "journalArticle",
    title: "Distributed multisensor ISAC",
    creators: [],
    year: null,
    publicationTitle: null,
    abstract: "Distributed sensing nodes jointly process observations for integrated sensing and communication coverage.",
    tags: ["distributed ISAC", "multisensor"],
    doi: null,
    url: null
  },
  {
    key: "DEMO002",
    sourceId: "fixture:demo:DEMO002",
    sourceLibrary: DEMO_LIBRARY,
    itemType: "journalArticle",
    title: "Integrated Sensing and Communication Channel Modeling: A Survey",
    creators: [],
    year: null,
    publicationTitle: null,
    abstract: "A survey of channel models, propagation effects, and sensing-communication performance tradeoffs.",
    tags: ["channel modeling", "survey"],
    doi: null,
    url: null
  },
  {
    key: "DEMO003",
    sourceId: "fixture:demo:DEMO003",
    sourceLibrary: DEMO_LIBRARY,
    itemType: "journalArticle",
    title: "Cognitive radar: a way of the future",
    creators: [],
    year: null,
    publicationTitle: null,
    abstract: "Cognitive radar adapts sensing actions from observations and learned environmental context.",
    tags: ["cognitive radar", "adaptive sensing"],
    doi: null,
    url: null
  }
];

export function demoLibraryPayload() {
  return {
    status: "connected",
    mode: "demo",
    access: "read-only",
    fixture: true,
    library: DEMO_LIBRARY,
    libraries: [DEMO_LIBRARY],
    paperCount: DEMO_PAPERS.length,
    papers: DEMO_PAPERS
  };
}

export async function searchDemoLibrary(taskGraph, options = {}) {
  const task = requireApprovedLiteratureTask(taskGraph);
  const query = options.query?.trim() || extractLiteratureQuery(taskGraph.feedback);
  const ranked = await rankResearchPapers(query, DEMO_PAPERS, { limit: options.limit ?? 10, embeddingProvider: "none" });
  return {
    schemaVersion: 1,
    provider: "demo-fixture",
    access: "read-only",
    fixture: true,
    library: DEMO_LIBRARY,
    libraries: [DEMO_LIBRARY],
    taskId: task.id,
    query,
    createdAt: new Date().toISOString(),
    totalResults: ranked.candidates.length,
    indexedPaperCount: DEMO_PAPERS.length,
    retrieval: { ...ranked.retrieval, warning: "Judge mode uses deterministic metadata ranking; no Ollama or external model is required." },
    candidates: ranked.candidates
  };
}
