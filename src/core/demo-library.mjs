import { extractLiteratureQuery, requireApprovedLiteratureTask } from "./zotero.mjs";

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

export function searchDemoLibrary(taskGraph, options = {}) {
  const task = requireApprovedLiteratureTask(taskGraph);
  const query = options.query?.trim() || extractLiteratureQuery(taskGraph.feedback);
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
  const matches = DEMO_PAPERS.filter((paper) => terms.some((term) => paper.title.toLowerCase().includes(term)));
  const candidates = matches.length ? matches : DEMO_PAPERS;
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
    totalResults: candidates.length,
    candidates
  };
}
