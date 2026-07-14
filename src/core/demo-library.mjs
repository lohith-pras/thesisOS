import { extractLiteratureQuery, requireApprovedLiteratureTask } from "./zotero.mjs";
import { rankResearchPapers } from "./retrieval.mjs";
import { createProjectState } from "./project-state.mjs";

const DEMO_LIBRARY = { type: "fixture", id: "demo", name: "Smart EV charging research fixture", paperCount: 8 };

const DEMO_PAPERS = [
  { key: "EV001", sourceId: "fixture:demo:EV001", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "EV smart charging: How tariff selection influences grid stress and carbon reduction", creators: [], year: "2023", publicationTitle: "Applied Energy", abstract: "Compares EV charging tariffs and finds that tariff design can shift demand while still creating local peak-load risks; capacity management can address overload.", tags: ["smart charging", "tariffs", "grid congestion", "carbon"], doi: "10.1016/j.apenergy.2023.121482", url: null },
  { key: "EV002", sourceId: "fixture:demo:EV002", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "Enhancing smart charging in electric vehicles by addressing paused and delayed charging problems", creators: ["Nico Brinkel", "Thijs van Wijk", "Simon Tindemans", "Wilfried van Sark"], year: "2024", publicationTitle: "Nature Communications", abstract: "Technical charging tests identify EV models that cannot reliably pause or delay charging, a constraint that changes the practical potential of smart charging.", tags: ["smart charging", "interoperability", "charging control", "feasibility"], doi: "10.1038/s41467-024-48477-w", url: null },
  { key: "EV003", sourceId: "fixture:demo:EV003", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "Flexibility of Electric Vehicle Charging With Demand Response and Vehicle-to-Grid for Power System Benefit", creators: ["Ilkka Jokinen", "Matti Lehtonen"], year: "2024", publicationTitle: "IEEE Access", abstract: "Models flexibility in EV charging events under unidirectional demand response and bidirectional vehicle-to-grid operation for power-system benefits.", tags: ["demand response", "vehicle-to-grid", "flexibility", "power systems"], doi: "10.1109/ACCESS.2024.3459053", url: null },
  { key: "EV004", sourceId: "fixture:demo:EV004", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "Impact of cost-based smart electric vehicle charging on urban low voltage power distribution networks", creators: ["Tim Unterluggauer", "F. Hipolito", "Jeppe Rich", "Mattia Marinelli", "Peter Bach Andersen"], year: "2023", publicationTitle: "Sustainable Energy, Grids and Networks", abstract: "Evaluates cost-driven EV charging in urban low-voltage networks and highlights synchronization and congestion risks under some optimization strategies.", tags: ["low voltage", "urban grid", "cost-based charging", "congestion"], doi: "10.1016/j.segan.2023.101085", url: null },
  { key: "EV005", sourceId: "fixture:demo:EV005", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "Smart home charging of electric vehicles using a digital platform", creators: [], year: "2023", publicationTitle: "Smart Energy", abstract: "Empirical analysis of a digital smart-charging platform links charging-time shifting with consumer cost and distribution-grid implications.", tags: ["digital platform", "home charging", "empirical", "grid efficiency"], doi: "10.1016/j.segy.2023.100118", url: null },
  { key: "EV006", sourceId: "fixture:demo:EV006", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "A market-based real-time algorithm for congestion alleviation incorporating EV demand response in active distribution networks", creators: [], year: "2024", publicationTitle: "Applied Energy", abstract: "Proposes real-time EV demand-response scheduling to alleviate congestion while considering user preferences and system economics.", tags: ["demand response", "real time", "distribution networks", "congestion management"], doi: "10.1016/j.apenergy.2023.122426", url: null },
  { key: "EV007", sourceId: "fixture:demo:EV007", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "Smart electric vehicles charging with centralised vehicle-to-grid capability for net-load variance minimisation under increasing EV and PV penetration levels", creators: ["M. Secchi", "G. Barchi", "D. Macii", "D. Petri"], year: "2023", publicationTitle: "Sustainable Energy, Grids and Networks", abstract: "Studies centralized smart charging and vehicle-to-grid scheduling under growing EV and photovoltaic penetration, including grid and battery trade-offs.", tags: ["vehicle-to-grid", "photovoltaics", "net load", "optimization"], doi: "10.1016/j.segan.2023.101120", url: null },
  { key: "EV008", sourceId: "fixture:demo:EV008", sourceLibrary: DEMO_LIBRARY, itemType: "journalArticle", title: "Control Strategies, Economic Benefits, and Challenges of Vehicle-to-Grid Applications: Recent Trends Research", creators: ["Guangjie Chen", "Zhaoyun Zhang"], year: "2024", publicationTitle: "World Electric Vehicle Journal", abstract: "Reviews vehicle-to-grid control strategies, economic considerations, and deployment challenges for EV-grid interaction.", tags: ["vehicle-to-grid", "review", "economics", "deployment barriers"], doi: "10.3390/wevj15050190", url: null }
];

export const DEMO_FEEDBACK_OPTIONS = [
  { id: "vague", title: "Vague feedback", text: "The motivation is still too broad. Clarify which distribution-grid problem workplace EV charging creates and ground the framing in recent literature." },
  { id: "claim", title: "Challenge a claim", text: "The claim that smart charging reduces local congestion is too strong. Separate tariff-driven load shifting from network-aware capacity management and support each statement with evidence." },
  { id: "feasibility", title: "Test feasibility", text: "Explain whether EVs that cannot resume delayed charging change the feasibility assumptions in the proposed workplace charging strategy." }
];

export function demoLibraryPayload() {
  return { status: "connected", mode: "demo", access: "read-only", fixture: true, library: DEMO_LIBRARY, libraries: [DEMO_LIBRARY], paperCount: DEMO_PAPERS.length, papers: DEMO_PAPERS };
}

export function createDemoProjectState() {
  const state = createProjectState({ project: "Workplace EV charging flexibility for distribution-grid congestion management" }, { now: "2026-07-14T00:00:00.000Z" });
  state.profile = {
    ...state.profile,
    title: { value: "Workplace EV charging flexibility for distribution-grid congestion management", provenance: { kind: "demo-fixture" } },
    topic: { value: "How network-aware smart charging can use workplace EV flexibility without overstating tariff or vehicle-capability assumptions.", provenance: { kind: "demo-fixture" } },
    objectives: [
      { id: "objective-grid", text: "Assess how workplace EV charging contributes to low-voltage distribution-grid congestion.", provenance: { kind: "demo-fixture" } },
      { id: "objective-control", text: "Compare tariff-driven and network-aware smart-charging strategies under user and vehicle constraints.", provenance: { kind: "demo-fixture" } }
    ],
    problems: [{ id: "scope-workplace-ev", name: "Workplace EV charging and distribution-grid congestion", summary: "A literature-grounded assessment of flexibility, control design, and practical charging constraints.", selected: true, provenance: { kind: "demo-fixture" } }],
    stage: { value: "literature", provenance: { kind: "demo-fixture" } }
  };
  return state;
}

export function decomposeDemoFeedback(feedback, options = {}) {
  const text = feedback.trim();
  const feasibility = /pause|delay|resume|feasib|vehicle.*capabil/i.test(text);
  const claim = /claim|too strong|separate|capacity management|tariff/i.test(text);
  const focus = feasibility ? "vehicle pause, delay, and resumption constraints" : claim ? "tariff-driven load shifting and network-aware congestion management" : "the workplace EV charging congestion problem";
  const objectiveIds = (options.context?.objectives ?? []).map(({ id }) => id);
  const targetLocationIds = (options.context?.targetLocations ?? []).map(({ id }) => id);
  return {
    schemaVersion: 1,
    feedback: text,
    createdAt: new Date().toISOString(),
    tasks: [
      { id: "task-literature", kind: "literature", title: `Find and review evidence on ${focus}`, tool: "zotero", status: "ready", approvalStatus: "pending", dependsOn: [], evidence: ["Select papers that support, qualify, or challenge the feedback", "Record the claim, method, limitation, and relevance"], objectiveIds, targetLocationIds },
      { id: "task-notes", kind: "notes", title: "Draft a grounded evidence note for supervisor review", tool: "obsidian", status: "blocked", approvalStatus: "pending", dependsOn: ["task-literature"], evidence: ["Summarize only selected evidence", "Keep open questions and limitations visible"], objectiveIds, targetLocationIds }
    ],
    nextAction: "Approve the literature task"
  };
}

const DEMO_SOURCE_NOTES = {
  EV001: { summary: "Tariff-led smart charging can lower carbon intensity, but a tariff alone can synchronize vehicles into the same cheap period and create a local peak.", relevance: "This qualifies the thesis claim: price shifting is not the same as relieving a constrained feeder." },
  EV002: { summary: "Some EV models cannot reliably pause or resume delayed charging, so an ideal charging schedule may not be deployable across the real vehicle fleet.", relevance: "This adds a feasibility condition: the strategy must state which vehicle-control capabilities it assumes." },
  EV003: { summary: "The usable flexibility of a charging session depends on connection time, charging power, and whether control is unidirectional or bidirectional.", relevance: "This defines the flexibility variables the thesis must model before making a grid-benefit claim." },
  EV004: { summary: "Cost-minimised charging can concentrate demand in low-price windows, producing cable and transformer congestion in urban low-voltage networks.", relevance: "This is direct counter-evidence to an unconditional claim that smart charging always reduces local congestion." },
  EV005: { summary: "Observed smart-home charging shifted demand away from peak periods, improving both user cost and grid efficiency in the studied digital-platform setting.", relevance: "This is supporting evidence, but only for the platform and network conditions observed in that study." },
  EV006: { summary: "Network-aware, real-time demand response can target congestion while respecting user preferences instead of relying on price signals alone.", relevance: "This supports the distinct network-aware control branch of the thesis argument." },
  EV007: { summary: "Centralised V2G scheduling can reduce net-load variation, but it introduces battery-wear and forecasting trade-offs.", relevance: "This extends the comparison beyond one-way charging and keeps the trade-off visible." },
  EV008: { summary: "Vehicle-to-grid benefits depend on control design, incentives, interoperability, and deployment barriers—not simply on battery availability.", relevance: "This frames the limitations section and prevents overclaiming deployment readiness." }
};

export function createDemoGroundedDraft(feedback, evidenceRefs) {
  const notes = evidenceRefs.map((reference) => DEMO_SOURCE_NOTES[reference.key] ?? {
    summary: reference.abstract || `Review the selected evidence from ${reference.title}.`,
    relevance: "Use this source to support, qualify, or challenge the supervisor feedback."
  });
  return {
    schemaVersion: 1,
    provider: "demo-grounded-template",
    model: "none",
    warning: "Demo mode generates this source-by-source evidence note locally; no external model was called.",
    overview: "The selected evidence does not support an unconditional claim that smart charging reduces congestion. It distinguishes price-led load shifting, network-aware control, and vehicle capability constraints.",
    sourceNotes: evidenceRefs.map((reference, index) => ({ sourceId: reference.sourceId, ...notes[index] }))
  };
}

export async function searchDemoLibrary(taskGraph, options = {}) {
  const task = requireApprovedLiteratureTask(taskGraph);
  const query = options.query?.trim() || extractLiteratureQuery(taskGraph.feedback);
  const ranked = await rankResearchPapers(query, DEMO_PAPERS, { limit: options.limit ?? 10, embeddingProvider: "none" });
  return { schemaVersion: 1, provider: "demo-fixture", access: "read-only", fixture: true, library: DEMO_LIBRARY, libraries: [DEMO_LIBRARY], taskId: task.id, query, createdAt: new Date().toISOString(), totalResults: ranked.candidates.length, indexedPaperCount: DEMO_PAPERS.length, retrieval: { ...ranked.retrieval, warning: "Judge mode uses deterministic metadata ranking over a traceable smart-EV-charging fixture; no external model is required." }, candidates: ranked.candidates };
}
