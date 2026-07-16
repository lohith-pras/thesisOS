const STORAGE_KEY = "thesisos-ui-state-v2";
const thesisStages = [
  ["literature-review", "Literature review"],
  ["introduction", "Introduction"],
  ["system-model", "System model"],
  ["problem-formulation", "Problem formulation"],
  ["experiments", "Experiments"],
  ["results", "Results"],
  ["future-work", "Future work"],
  ["references", "References"]
];

const defaultState = {
  view: "overview",
  theme: "light",
  onboardingStep: 0,
  setupCollapsed: false,
  activeProfileForm: null,
  userName: "Researcher",
  project: "Research workspace",
  projectState: null,
  profileReadiness: { ready: false, missing: [] },
  feedback: "",
  feedbackTitle: "",
  feedbackThreadId: null,
  tasks: [],
  taskGraph: null,
  thesisState: null,
  runtime: null,
  workflowProvider: "codex",
  workflowBusy: false,
  workflowStatus: "",
  workflowError: "",
  activity: { status: "idle", kind: null, label: "", detail: "", recoveryAction: null },
  searchArtifact: null,
  searchQuery: "",
  candidates: [],
  selectedSourceIds: [],
  evidenceSelection: null,
  evidenceRefs: [],
  noteDraft: null,
  notePreview: null,
  claimTraceback: null,
  seedReferenceReport: null,
  noteWrite: null,
  responseMatrix: null,
  demoRejectionProof: null,
  demoGuideHidden: false,
  obsidianVaultPath: "",
  papers: [],
  connection: { status: "checking", mode: null, access: null, library: null, libraries: [], paperCount: 0, message: "Checking for Zotero Desktop…" }
};

let state = loadState();
const app = document.querySelector("#app");
let activityClearTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...structuredClone(defaultState), ...saved, activity: structuredClone(defaultState.activity), papers: [], connection: structuredClone(defaultState.connection) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  const { papers: _papers, connection: _connection, activity: _activity, activeProfileForm: _activeProfileForm, ...persistent } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
}

function esc(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
function httpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
function initials(value = "") { return String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "R"; }
function shortCopy(value = "", maxWords = 32, maxSentences = 1) {
  const sentences = String(value).replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const words = sentences.slice(0, maxSentences).join(" ").trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ").replace(/[,:;]$/, "")}…`;
}
function readableFeedback(value = "") {
  return String(value)
    .replace(/^[\t ]*>+[\t ]?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]{2,}/g, " ")
    .trim();
}
function setView(view) { state.view = view; saveState(); location.hash = view; render(); }
function getTask(id) { return state.tasks.find((task) => task.id === id); }
function statusLabel(value = "") {
  const label = String(value).replaceAll(/[-_]/g, " ").trim();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : "";
}
function thesisStageOptions(selected = "") { return thesisStages.map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join(""); }
function icon(name) { return ({ overview: "⌂", profile: "◎", tasks: "✓", evidence: "▤", notes: "▧", integrations: "⌘", settings: "⚙", about: "ⓘ" })[name] || "·"; }
function button(label, action, kind = "dark", disabled = false) { return `<button class="button button-${esc(kind)}" data-action="${esc(action)}"${disabled ? " disabled" : ""}>${esc(label)}</button>`; }
function selectedWorkflowProvider() { return state.connection.mode === "demo" ? "offline" : state.workflowProvider; }
function workflowProviderOptions() {
  const selected = selectedWorkflowProvider();
  return `<option value="codex"${selected === "codex" ? " selected" : ""}>Codex CLI · local login</option><option value="offline"${selected === "offline" ? " selected" : ""}>Offline · deterministic</option><option value="openai"${selected === "openai" ? " selected" : ""}>OpenAI · GPT-5.6 API</option>`;
}
function eyebrow(text) { return `<p class="eyebrow"><i></i>${text}</p>`; }
function emptyState(title, copy, action = "", label = "") { return `<section class="empty-state panel"><span class="empty-mark">◇</span><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>${action ? button(label, action, "outline") : ""}</section>`; }
function activityMarker() { return '<span class="activity-marker" aria-hidden="true"><i></i><i></i><i></i></span>'; }
function profileCardLoading(formId, label) { return state.activeProfileForm === formId ? `<div class="profile-card-loading" role="status" aria-live="polite">${activityMarker()}<strong>${esc(label)}</strong></div>` : ""; }
function documentDropZone() { return `<label class="drop-zone" data-drop-zone><input name="document" type="file" accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain" required /><span class="drop-icon">⇧</span><strong>Choose a project document</strong><small data-file-label>PDF, Markdown, or text · up to 20 MB</small></label>`; }
async function fileToBase64(file) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }

function beginActivity(kind, label, detail = "", recoveryAction = null) {
  window.clearTimeout(activityClearTimer);
  state.activity = { status: "active", kind, label, detail, recoveryAction };
  state.workflowBusy = true;
  state.workflowStatus = label;
  state.workflowError = "";
  render();
}

function updateActivity(label, detail = "") {
  state.activity = { ...state.activity, status: "active", label, detail };
  state.workflowStatus = label;
  render();
}

function completeActivity(label, detail = "") {
  state.activity = { ...state.activity, status: "success", label, detail, recoveryAction: null };
  state.workflowBusy = false;
  state.workflowStatus = "";
  render();
  activityClearTimer = window.setTimeout(() => {
    state.activity = { ...defaultState.activity };
    render();
  }, 2800);
}

function failActivity(error, recoveryAction = null) {
  const message = error instanceof Error ? error.message : String(error);
  state.activity = { ...state.activity, status: "error", label: "Something needs your attention.", detail: message, recoveryAction };
  state.workflowBusy = false;
  state.workflowStatus = "";
  state.workflowError = message;
  render();
}

function activityStrip() {
  const activity = state.activity || defaultState.activity;
  if (activity.status === "idle" || activity.kind === "citation-boundary") return "";
  const marker = activity.status === "active"
    ? activityMarker()
    : `<span class="activity-mark" aria-hidden="true">${activity.status === "success" ? "✓" : "!"}</span>`;
  const recovery = activity.status === "error" && activity.recoveryAction ? button("Try again", activity.recoveryAction, "outline") : "";
  return `<div class="global-activity ${esc(activity.status)}" role="status" aria-live="polite"><div class="activity-copy">${marker}<span><strong>${esc(activity.label)}</strong>${activity.detail ? `<small>${esc(activity.detail)}</small>` : ""}</span></div>${recovery}</div>`;
}

function sectionActivity(kinds = []) {
  const activity = state.activity || defaultState.activity;
  if (activity.status === "idle" || !kinds.includes(activity.kind)) return "";
  const marker = activity.status === "active"
    ? activityMarker()
    : `<span class="activity-mark" aria-hidden="true">${activity.status === "success" ? "✓" : "!"}</span>`;
  return `<div class="section-activity ${esc(activity.status)}" aria-hidden="true"><div class="activity-copy">${marker}<span><strong>${esc(activity.label)}</strong>${activity.detail ? `<small>${esc(activity.detail)}</small>` : ""}</span></div></div>`;
}

function connectionLabel() {
  if (state.connection.status === "connected" && state.connection.mode === "demo") return "Demo data · clearly labelled fixture";
  if (state.connection.status === "connected") return `Zotero connected · ${state.connection.mode}`;
  if (state.connection.status === "checking") return "Checking Zotero Desktop";
  if (state.connection.status === "selection_required") return "Zotero library choice required";
  return "Zotero not connected";
}

function demoGuide() {
  if (state.connection.mode !== "demo") return "";
  const literatureTask = state.tasks.find((task) => task.kind === "literature");
  const completed = [Boolean(state.feedbackThreadId && state.tasks.length), literatureTask?.approvalStatus === "approved", Boolean(state.evidenceSelection), Boolean(state.notePreview), Boolean(state.noteWrite)];
  const current = completed.findIndex((done) => !done);
  const step = current === -1 ? 4 : current;
  if (state.demoGuideHidden) return `<button class="demo-guide-pill" data-action="show-demo-guide" aria-label="Show demo guide">Show demo steps · ${completed.filter(Boolean).length}/5</button>`;
  const steps = [
    { view: "feedback", title: "Add feedback", copy: "Choose a review prompt or paste a supervisor comment." },
    { view: "tasks", title: "Approve a research task", copy: "Approval unlocks a read-only literature search." },
    { view: "evidence", title: "Select evidence", copy: "Only papers you review can be used in a note." },
    { view: "notes", title: "Review the note", copy: "Inspect the selected sources and their trace back to feedback." },
    { view: "notes", title: "Choose whether to save", copy: "A vault write always needs a separate approval." }
  ];
  const active = steps[step];
  return `<aside class="demo-guide panel" aria-label="Demo steps"><div class="demo-guide-head"><span class="label">DEMO STEPS · ${completed.filter(Boolean).length} OF 5</span><span><button class="text-button" data-action="restart-demo">Restart</button><button class="text-button" data-action="hide-demo-guide">Hide</button></span></div><div class="demo-guide-current"><i>${completed[step] ? "✓" : String(step + 1)}</i><div><strong>${esc(active.title)}</strong><p>${esc(active.copy)}</p></div>${step < 4 ? button(`Continue →`, `demo-guide-step:${active.view}`, "outline", state.workflowBusy) : ""}</div><div class="demo-guide-actions">${button("Show completed proof", "show-demo-proof", "dark", state.workflowBusy)}${state.notePreview ? button("Test an unselected citation", "test-citation-boundary", "outline", state.workflowBusy) : ""}</div><ol aria-label="All demo steps">${steps.map((item, index) => `<li class="${completed[index] ? "complete" : index === step ? "active" : ""}"><i>${completed[index] ? "✓" : String(index + 1)}</i><span>${esc(item.title)}</span></li>`).join("")}</ol></aside>`;
}

function citationBoundaryProofPanel(variant = "full") {
  const proof = state.demoRejectionProof;
  if (!proof) return "";
  if (typeof proof === "string") return `<p class="demo-proof-status">✓ ${esc(proof)}</p>`;
  const selectedTitles = proof.allowedSources.map((source) => `<li>${esc(source.title)}</li>`).join("");
  const isDemoProof = proof.mode === "demo";
  return `<section class="citation-boundary-proof ${variant}" aria-label="Citation boundary proof"><div class="citation-proof-intro"><span class="label">${isDemoProof ? "DEMO PROOF" : "LOCAL CHECK"} · CITATION CHECK</span><h3>Proofline blocked a citation outside this note’s selected evidence.</h3><p>The papers at left came from Zotero and were selected for this note. We separately tried to add a synthetic ${isDemoProof ? "demo" : "local test"} ID that was not in that selected set, so the attempted draft was rejected before it could replace the valid preview or request a file write.</p></div><ol class="citation-proof-steps"><li><i>1</i><div><strong>You selected ${proof.allowedSources.length} Zotero paper${proof.allowedSources.length === 1 ? "" : "s"} for this note</strong><p>These are the real Zotero sources this draft is allowed to cite.</p><ul>${selectedTitles}</ul></div></li><li><i>2</i><div><strong>The check used a synthetic source ID</strong><p>This ID is deliberately not part of the evidence selected for this note.</p><details><summary>Show technical ID</summary><code>${esc(proof.attemptedSourceId)}</code></details></div></li><li><i>3</i><div><strong>The attempt was blocked</strong><p>Existing valid preview is unchanged. No file write was attempted.</p><small>${esc(proof.rejection)}</small></div></li></ol><p class="citation-proof-limit">This confirms that a note can cite only the Zotero evidence selected for that note. It does not judge whether a paper’s findings are true.</p></section>`;
}

function shell(content) {
  const nav = [["overview", "Overview"], ["profile", "Research brief"], ["feedback", "Reviewer feedback"], ["tasks", "Tasks"], ["evidence", "Library"], ["notes", "Evidence notes"], ["integrations", "Connections"]];
  const pending = state.tasks.filter((task) => task.approvalStatus === "pending").length;
  const connected = state.connection.status === "connected";
  return `<aside class="sidebar">
    <button class="brand brand-home" data-view="overview" aria-label="Go to Overview">Proofline<span>.</span></button>
    <div class="brand-subtitle">LOCAL-FIRST RESEARCH WORKSPACE</div>
    <div class="sidebar-rule"></div>
    <nav class="main-nav" aria-label="Workspace navigation">${nav.map(([id, label]) => `<button class="nav-item ${state.view === id ? "active" : ""}" data-view="${id}"><span class="nav-glyph">${icon(id)}</span>${label}${id === "tasks" && pending ? `<b class="nav-count">${pending}</b>` : ""}</button>`).join("")}</nav>
    <div class="sidebar-rule"></div>
    <div class="sidebar-block"><span class="label">CURRENT PROJECT</span><strong>${esc(state.project)}</strong><span class="project-status"><i></i> Stored on this machine</span></div>
    <div class="sidebar-bottom"><div class="profile local-profile"><span class="avatar" aria-hidden="true">${esc(initials(state.userName))}</span><span><strong>${esc(state.userName)}</strong><small>Local profile</small></span></div><button class="nav-item ${state.view === "settings" ? "active" : ""}" data-view="settings"><span class="nav-glyph">${icon("settings")}</span>Settings</button><button class="nav-item ${state.view === "about" ? "active" : ""}" data-view="about"><span class="nav-glyph">${icon("about")}</span>About Proofline</button></div>
  </aside><main class="main-content"><header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${esc(pageTitle())}</strong></div><div class="topbar-actions">${state.connection.mode === "demo" ? `<span class="runtime-badge">DEMO SESSION · ISOLATED DATA</span>` : ""}<button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${state.theme === "dark" ? "Light mode" : "Dark mode"}" title="Switch to ${state.theme === "dark" ? "Light mode" : "Dark mode"}"><span aria-hidden="true">${state.theme === "dark" ? "☼" : "◐"}</span>${state.theme === "dark" ? "Light mode" : "Dark mode"}</button><button class="connection connection-button ${connected ? "connected" : esc(state.connection.status)}" data-view="integrations"><i></i>${esc(connectionLabel())}</button></div></header>${activityStrip()}<div class="page-content">${demoGuide()}${content}${state.view === "overview" ? responseMatrixPanel() : ""}</div></main>`;
}

function pageTitle() { return ({ overview: "Overview", profile: "Research brief", feedback: "Reviewer feedback", tasks: "Task review", evidence: "Zotero library", notes: "Evidence notes", integrations: "Connections", settings: "Settings", about: "About Proofline" })[state.view] || "Overview"; }

function legacyResponseMatrixPanel() {
  const count = state.projectState?.feedbackThreads?.length ?? 0;
  if (!count) return "";
  const matrix = state.responseMatrix;
  const rows = matrix?.rows ?? [];
  const preview = matrix ? `<div class="matrix-preview" aria-live="polite"><div class="matrix-preview-head"><div><span class="label">LIVE PREVIEW</span><h3>${rows.length ? `${rows.length} task${rows.length === 1 ? "" : "s"} in the review trail` : "No approved tasks yet"}</h3><p>This is a read-only summary. It does not claim that your manuscript has already changed.</p></div>${button("Download .md", "export-response-matrix", "outline")}</div>${rows.length ? `<div class="matrix-table-wrap"><table><thead><tr><th>Supervisor feedback</th><th>Proposed task</th><th>Review status</th><th>Evidence</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(shortCopy(row.supervisorComment, 18))}</td><td>${esc(row.task)}</td><td><span class="matrix-status">${esc(row.status)}</span></td><td>${row.evidence.length ? esc(row.evidence.map((item) => shortCopy(item, 8)).join("; ")) : "No evidence attached"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="matrix-empty">Approve a proposed task to make it appear here. Add evidence and a grounded note as the work progresses.</p>`}</div>` : "";
  return `<section class="response-matrix panel"><div><span class="label">REVISION RESPONSE MATRIX · SUPERVISOR REVIEW TRAIL</span><h2>See the feedback-to-evidence trail before you share it.</h2><p>Use this to discuss what a comment led to: the proposed task, its approval status, and any evidence attached. It helps you and your supervisor spot what is still waiting for review.</p></div><div class="matrix-actions">${button(matrix ? "Refresh preview" : "Preview review trail", "preview-response-matrix", "dark")}<button class="text-button" data-action="export-response-matrix">Download Markdown <span>↗</span></button></div>${preview}</section>`;
}

function legacyGroupedResponseMatrixPanel() {
  const count = state.projectState?.feedbackThreads?.length ?? 0;
  if (!count) return "";
  const matrix = state.responseMatrix;
  const rows = matrix?.rows ?? [];
  const preview = matrix ? `<div class="matrix-preview" aria-live="polite"><div class="matrix-preview-head"><div><span class="label">LIVE PREVIEW</span><h3>${rows.length ? `${rows.length} task${rows.length === 1 ? "" : "s"} in the review trail` : "No approved tasks yet"}</h3><p>This is a read-only summary. It does not claim that your manuscript has already changed.</p></div>${button("Download .md", "export-response-matrix", "outline")}</div>${rows.length ? `<div class="matrix-table-wrap"><table><thead><tr><th>Supervisor feedback</th><th>Proposed task</th><th>Review status</th><th>Evidence</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(shortCopy(row.supervisorComment, 18))}</td><td>${esc(row.task)}</td><td><span class="matrix-status">${esc(row.status)}</span></td><td>${row.evidence.length ? esc(row.evidence.map((item) => shortCopy(item, 8)).join("; ")) : "No evidence attached"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="matrix-empty">Approve a proposed task to make it appear here. Add evidence and a grounded note as the work progresses.</p>`}</div>` : "";
  return `<details class="response-matrix panel"${matrix ? " open" : ""}><summary><span><span class="label">REVISION RESPONSE MATRIX · SUPERVISOR REVIEW TRAIL</span><strong>See the feedback-to-evidence trail before you share it.</strong><small>Track what a comment led to: task, approval, and evidence.</small></span><em>Show review trail ↓</em></summary><div class="response-matrix-content"><div class="matrix-actions">${button(matrix ? "Refresh preview" : "Preview review trail", "preview-response-matrix", "dark")}<button class="text-button" data-action="export-response-matrix">Download Markdown <span>↗</span></button></div>${preview}</div></details>`;
}

function responseMatrixPanel() {
  const matrix = state.responseMatrix;
  const rows = matrix?.rows ?? [];
  const groups = [...rows.reduce((map, row) => {
    const group = map.get(row.feedbackThreadId) ?? { feedback: row.supervisorComment, rows: [] };
    group.rows.push(row);
    map.set(row.feedbackThreadId, group);
    return map;
  }, new Map()).values()];
  if (!(state.projectState?.feedbackThreads?.length ?? 0)) return "";
  const groupedPreview = matrix ? `<div class="matrix-preview" aria-live="polite"><div class="matrix-preview-head"><div><span class="label">LIVE PREVIEW</span><h3>${groups.length} feedback thread${groups.length === 1 ? "" : "s"} · ${rows.length} distinct task${rows.length === 1 ? "" : "s"}</h3><p>Tasks are grouped under the feedback that created them. Different tasks remain visible even when they share the same feedback.</p></div>${button("Download .md", "export-response-matrix", "outline")}</div>${groups.length ? `<div class="matrix-feedback-groups">${groups.map((group) => `<details><summary><span>${esc(shortCopy(group.feedback, 20, 1))}</span><em>${group.rows.length} task${group.rows.length === 1 ? "" : "s"} ↓</em></summary><div class="matrix-table-wrap"><table><thead><tr><th>Proposed task</th><th>Review status</th><th>Evidence</th></tr></thead><tbody>${group.rows.map((row) => `<tr><td>${esc(row.task)}</td><td><span class="matrix-status">${esc(row.status)}</span></td><td>${row.evidence.length ? esc(row.evidence.map((item) => shortCopy(item, 8)).join("; ")) : "No evidence attached"}</td></tr>`).join("")}</tbody></table></div></details>`).join("")}</div>` : `<p class="matrix-empty">Approve a proposed task to make it appear here. Add evidence and a grounded note as the work progresses.</p>`}</div>` : "";
  return `<details class="response-matrix panel"${matrix ? " open" : ""}><summary><span><span class="label">REVISION RESPONSE MATRIX · SUPERVISOR REVIEW TRAIL</span><strong>See the feedback-to-evidence trail before you share it.</strong><small>Track what a comment led to: task, approval, and evidence.</small></span><em>Show review trail ↓</em></summary><div class="response-matrix-content"><div class="matrix-actions">${button(matrix ? "Refresh preview" : "Preview review trail", "preview-response-matrix", "dark")}<button class="text-button" data-action="export-response-matrix">Download Markdown <span>↗</span></button></div>${groupedPreview}</div></details>`;
}

function landing() {
  return `<main class="first-run"><header class="first-run-nav"><a class="brand" href="/">Proofline<span>.</span></a><span>Local-first · reviewable by design</span></header><section class="first-run-hero"><div>${eyebrow("A guided lifecycle for research work")}<h1>Know what<br>comes next.</h1><p>Proofline reads your research intent, keeps reviewer feedback intact, and turns it into evidence-backed work you approve.</p><div class="intro-actions">${button("Set up my research →", "start-onboarding")} ${button("Explore with demo data", "use-demo-library", "outline")}</div><small>Only a project name is required. Every connection can be added later.</small></div><aside class="outcome-preview"><span class="label">THE OUTCOME</span><ol><li><b>01</b><span>Establish what the research is trying to prove.</span></li><li><b>02</b><span>Capture feedback in the reviewer’s own words.</span></li><li><b>03</b><span>Approve tasks and attach evidence from Zotero.</span></li></ol><p>Nothing writes to your project or vault without approval.</p></aside></section></main>`;
}

function onboardingFrame(content, step, options = {}) {
  const progress = `${Math.max(1, step)} of 7`;
  return `<main class="onboarding-shell"><header class="first-run-nav"><a class="brand" href="/">Proofline<span>.</span></a><span>Setup · ${progress}</span></header><section class="onboarding-card"><div class="onboarding-progress" aria-label="Onboarding progress">${Array.from({ length: 7 }, (_, index) => `<i class="${index < step ? "complete" : ""}"></i>`).join("")}</div>${content}${options.optional ? `<button class="text-button onboarding-skip" data-action="onboarding-next:${esc(step + 1)}">Skip for now →</button>` : ""}</section></main>`;
}

function onboarding() {
  const step = Math.max(1, state.onboardingStep || 1);
  if (step === 1) return onboardingFrame(`<span class="label">FIRST, THE DESTINATION</span><h1>Feedback becomes reviewable work—not a black-box answer.</h1><p>We will establish research intent, offer useful local connections, and preview your real workspace before you enter it.</p>${button("Begin with my research →", "onboarding-next:2")}`, step);
  if (step === 2) return onboardingFrame(`<span class="label">NAME THE WORK</span><h1>What should we call this research?</h1><p>This is the only required step. Everything else remains optional and editable.</p><form class="profile-form onboarding-form" id="project-init-form"><label>Project name</label><input name="project" value="${state.project === "Research workspace" ? "" : esc(state.project)}" placeholder="Your working research title" required autofocus /><button class="button button-dark" type="submit">Create my workspace →</button></form>`, step);
  if (step === 3) return onboardingFrame(`<span class="label">UNDERSTAND THE WORK</span><h1>Let Proofline read the project intent.</h1><p>Add a PDF, Markdown, or text project description. It will propose objectives for your approval; it never makes them canonical automatically.</p><form class="profile-form onboarding-form" id="document-import-form" aria-busy="${state.activeProfileForm === "document-import-form"}">${documentDropZone()}${profileCardLoading("document-import-form", "Importing and reading the document…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Import document →</button></form>`, step, { optional: true });
  if (step === 4) return onboardingFrame(`<span class="label">BUILD THE RESEARCH BASE</span><h1>Connect the papers you already trust.</h1><p>Zotero stays read-only. Proofline uses its metadata to find evidence relevant to approved tasks.</p>${connectionPanel()}<div class="onboarding-actions">${button("Continue →", "onboarding-next:5", "dark")}</div>`, step, { optional: true });
  if (step === 5) return onboardingFrame(`<span class="label">CHOOSE WORKING OUTPUTS</span><h1>Link files only when they exist.</h1><p>Choose a local folder for VS Code and an existing vault for Obsidian. You can add an Overleaf project URL later.</p><div class="onboarding-actions">${button(state.projectState?.project?.thesisDir ? "VS Code folder linked ✓" : "Choose VS Code folder", "choose-vscode-folder", "outline")}${button(state.obsidianVaultPath ? "Obsidian initialized ✓" : "Choose Obsidian vault", "choose-existing-vault", "outline")}${button("Continue →", "onboarding-next:6", "dark")}</div>`, step, { optional: true });
  if (step === 6) return onboardingFrame(`<span class="label">PERSONALIZE THE WORK</span><h1>Where are you in the research?</h1><p>Stage and current scope make feedback more specific. Add them now or return from Research brief.</p><form class="profile-form onboarding-form" id="profile-form"><label>Current focus or selected problem</label><input name="scopeName" placeholder="For example: interference mitigation" required /><label>Short scope summary</label><textarea name="scopeSummary" rows="3"></textarea><label>Current stage</label><select name="stage"><option value="proposal">Proposal</option><option value="literature">Literature review</option><option value="experiments">Experiments</option><option value="writing">Writing</option><option value="revision">Revision</option></select><button class="button button-dark" type="submit">Save and preview →</button></form>`, step, { optional: true });
  const selected = state.projectState?.profile?.problems?.find((item) => item.selected);
  return onboardingFrame(`<span class="label">YOUR WORKSPACE PREVIEW</span><h1>${esc(state.project)}</h1><p>${state.projectState?.profile?.stage?.value ? `${esc(statusLabel(state.projectState.profile.stage.value))} · ` : ""}${selected ? esc(selected.name) : "Ready to add context when you have it"}</p><div class="preview-status-grid"><article><b>${state.connection.status === "connected" ? state.connection.paperCount : "—"}</b><span>Zotero papers</span></article><article><b>${state.projectState?.profile?.objectives?.length || 0}</b><span>Objectives</span></article><article><b>${state.projectState?.project?.thesisDir ? "Linked" : "Optional"}</b><span>Manuscript</span></article></div><p class="helper">Incomplete setup will appear as quiet next steps, never as a blocker.</p>${button("Enter workspace →", "finish-onboarding")}`, step);
}

function legacyOverview() {
  const connected = state.connection.status === "connected";
  const canonical = state.projectState;
  const profile = canonical?.profile ?? {};
  const selected = profile.problems?.find((item) => item.selected);
  const threads = canonical?.feedbackThreads ?? [];
  const latest = threads.at(-1);
  const activeThread = threads.find(({ id }) => id === state.feedbackThreadId) ?? latest;
  const allTasks = threads.flatMap((thread) => thread.tasks ?? []);
  const openTasks = allTasks.filter((task) => task.approvalStatus !== "rejected" && task.status !== "completed").length;
  const configured = [state.profileReadiness.ready, connected, Boolean(canonical?.project?.thesisDir), Boolean(state.obsidianVaultPath), Boolean(profile.stage?.value && selected)].filter(Boolean).length;
  const setupLabel = `Setup · ${configured} of 5 configured`;
  const nextAction = !state.profileReadiness.ready ? { label: "Complete research context", view: "profile" } : !connected ? { label: "Connect Zotero", view: "integrations" } : { label: "Add reviewer feedback", action: "focus-feedback" };
  const stage = profile.stage?.value ? statusLabel(profile.stage.value) : "Context not complete";
  const setupItems = [
    [true, "Research named", "profile"],
    [state.profileReadiness.ready, "Research context approved", "profile"],
    [connected, "Zotero connected", "integrations"],
    [Boolean(canonical?.project?.thesisDir), "Manuscript linked", "profile"],
    [Boolean(state.obsidianVaultPath), "Obsidian initialized", "integrations"]
  ];
  const setupPanel = `<aside class="setup-path panel ${state.setupCollapsed ? "collapsed" : ""}"><button class="setup-toggle" data-action="toggle-setup" aria-expanded="${state.setupCollapsed ? "false" : "true"}" aria-controls="setup-path-details"><span><b>${setupLabel}</b><small>Optional · resumable</small></span><span>${state.setupCollapsed ? "Show ↓" : "Hide ↑"}</span></button><div id="setup-path-details" ${state.setupCollapsed ? "hidden" : ""}>${setupItems.map(([done, label, view]) => `<button data-view="${view}"><i>${done ? "✓" : "→"}</i><span>${label}</span></button>`).join("")}</div></aside>`;
  const feedbackStatus = !state.profileReadiness.ready ? `<p class="context-notice">You can save feedback now. Add research context before creating focused tasks.</p>` : `<p class="helper">Only the research context you approved and this exact feedback are sent to the task assistant.</p>`;
  const demoFeedbackChoices = state.connection.mode === "demo" ? `<div class="demo-feedback-choices"><span class="label">TRY A DEMO REVIEW</span><p>Choose a vague comment, challenge a claim, or test a feasibility assumption.</p><div>${demoFeedbackOptions.map((option) => button(option.title, `seed-demo-feedback:${option.id}`, "outline", state.workflowBusy)).join("")}</div></div>` : "";
  const latestFeedbackAction = !activeThread?.tasks?.length
    ? state.profileReadiness.ready
      ? `<button class="card-link" data-action="resume-feedback:${esc(activeThread.id)}">Create tasks from this feedback <span>→</span></button>`
      : `<button class="card-link" data-view="profile">Choose a research scope <span>→</span></button>`
    : `<button class="card-link" data-view="tasks">Review tasks <span>→</span></button>`;
  const placement = activeThread?.placement;
  const placementLabel = placement?.stage ? thesisStages.find(([id]) => id === placement.stage)?.[1] ?? statusLabel(placement.stage) : "No stage selected";
  const chapterOptions = (canonical?.manuscript?.chapters ?? []).map((chapter) => `<option value="${esc(chapter.id)}"${placement?.targetLocationIds?.includes(chapter.id) ? " selected" : ""}>${esc(`${chapter.number ? `${chapter.number} · ` : ""}${chapter.title}`)}</option>`).join("");
  const placementPanel = activeThread ? `<section class="feedback-placement panel"><div><span class="label">FEEDBACK PLACEMENT</span><h3>${placement?.status === "confirmed" ? "Placement confirmed" : "Review suggested placement"}</h3><p>${esc(placement?.rationale ?? "Choose the research phase this feedback should guide.")}</p></div><form id="feedback-placement-form"><input type="hidden" name="feedbackThreadId" value="${esc(activeThread.id)}" /><label>Research phase</label><select name="stage">${thesisStageOptions(placement?.stage ?? profile.stage?.value ?? "")}</select>${chapterOptions ? `<label>Related manuscript section <small>optional</small></label><select name="targetLocationId"><option value="">No section selected</option>${chapterOptions}</select>` : ""}<div class="form-footer">${button("Confirm placement", "confirm-feedback-placement", "outline", state.workflowBusy)}<button class="text-button" type="button" data-action="unassign-feedback-placement">Leave unassigned</button></div></form></section>` : "";
  const feedbackHistory = threads.length ? `<section class="feedback-history panel"><div class="panel-head"><span class="label">FEEDBACK HISTORY</span><span class="timestamp">${threads.length} saved</span></div>${[...threads].reverse().map((thread) => { const threadPlacement = thread.placement; const threadStage = threadPlacement?.stage ? thesisStages.find(([id]) => id === threadPlacement.stage)?.[1] ?? statusLabel(threadPlacement.stage) : "Needs placement"; return `<button class="feedback-history-item ${thread.id === activeThread?.id ? "selected" : ""}" data-action="select-feedback:${esc(thread.id)}"><span><b>${esc(thread.title)}</b><small>${esc(shortCopy(thread.feedback, 15))}</small></span><em>${esc(threadPlacement?.status === "confirmed" ? threadStage : `Suggested · ${threadStage}`)}</em></button>`; }).join("")}</section>` : "";
  return `<section class="lifecycle-head"><div>${eyebrow("Your research workspace")}<h1>${esc(state.project || canonical?.project?.name)}</h1><p><span class="status-dot"></span>${esc(stage)}${selected ? ` · Focused on ${esc(selected.name)}` : ""}</p></div><button class="button button-outline" ${nextAction.action ? `data-action="${esc(nextAction.action)}"` : `data-view="${nextAction.view}"`}>${esc(nextAction.label)} →</button></section>
    <section class="metric-grid"><article><b>${connected ? state.connection.paperCount : "—"}</b><span>Zotero papers</span></article><article><b>${profile.objectives?.length ?? 0}</b><span>Objectives</span></article><article><b>${openTasks}</b><span>Open tasks</span></article><article><b>${threads.length}</b><span>Feedback threads</span></article></section>
    <section class="lifecycle-grid"><div>${demoFeedbackChoices}<form class="feedback-form panel overview-feedback" id="feedback-form"><div class="panel-head"><span class="label">ADD SUPERVISOR FEEDBACK</span><span class="timestamp">Saved in this project</span></div><label for="feedback-title">Feedback title <small>optional</small></label><input id="feedback-title" name="title" value="${esc(state.feedbackTitle)}" placeholder="For example: Section 3.2 revisions" /><label for="feedback-text">Supervisor feedback</label><textarea id="feedback-text" name="feedback" rows="6" placeholder="Paste or type the exact feedback here." required>${esc(state.feedback)}</textarea><label for="workflow-provider">Task assistant</label><select id="workflow-provider" name="provider">${workflowProviderOptions()}</select>${feedbackStatus}${sectionActivity(["task-graph", "feedback-capture"])}${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="form-footer"><span class="read-only-note"><i></i>${state.profileReadiness.ready ? "Reviewable task plan" : "Save now · plan work later"}</span>${button(state.profileReadiness.ready ? "Create proposed tasks →" : "Save feedback →", "analyze-feedback", "dark", state.workflowBusy)}</div></form>${latest ? `<article class="latest-feedback panel"><div class="panel-head"><span class="label">LATEST FEEDBACK</span><span class="timestamp">${esc(statusLabel(latest.status))}</span></div><blockquote>“${esc(latest.feedback)}”</blockquote><div class="byline">${latest.tasks?.length || 0} proposed tasks <span>${latest.tasks?.length ? "Review required" : state.profileReadiness.ready ? "Ready to turn into tasks" : "Choose a thesis scope first"}</span></div>${latestFeedbackAction}</article>` : ""}</div><div>${setupPanel}<section class="integration-health"><button class="panel" data-view="integrations"><i class="${connected ? "live" : ""}"></i><span><b>Zotero</b><small>${connected ? `Connected locally · ${state.connection.paperCount} papers` : "Not connected"}</small></span><em>→</em></button><button class="panel" data-view="integrations"><i class="${state.obsidianVaultPath ? "live" : ""}"></i><span><b>Obsidian</b><small>${state.obsidianVaultPath ? `Initialized · ${esc(state.obsidianVaultPath)}` : "Not initialized"}</small></span><em>→</em></button></section></div></section>`;
}

function supervisorReview() {
  const canonical = state.projectState;
  const profile = canonical?.profile ?? {};
  const threads = canonical?.feedbackThreads ?? [];
  const active = threads.find(({ id }) => id === state.feedbackThreadId) ?? threads.at(-1);
  const connected = state.connection.status === "connected";
  const placement = active?.placement;
  const stageName = (stage) => thesisStages.find(([id]) => id === stage)?.[1] ?? statusLabel(stage ?? "needs placement");
  const chapterOptions = (canonical?.manuscript?.chapters ?? []).map((chapter) => `<option value="${esc(chapter.id)}"${placement?.targetLocationIds?.includes(chapter.id) ? " selected" : ""}>${esc(`${chapter.number ? `${chapter.number} · ` : ""}${chapter.title}`)}</option>`).join("");
  const activeStage = placement?.status === "confirmed" ? placement.stage : profile.stage?.value ?? "";
  const phaseControl = active ? `<form class="thread-phase-control" id="feedback-placement-form"><input type="hidden" name="feedbackThreadId" value="${esc(active.id)}" /><div><span class="label">THESIS PHASE</span><strong>${placement?.status === "confirmed" ? "Phase set for this thread" : `Following your current phase · ${stageName(activeStage)}`}</strong><p>${placement?.status === "confirmed" ? "Change this only when this note belongs to another part of the thesis." : "This thread starts in the phase you are working on. Set a different phase only when needed."}</p></div><label><span>Place in</span><select name="stage">${thesisStageOptions(activeStage)}</select></label>${chapterOptions ? `<label><span>Section <small>optional</small></span><select name="targetLocationId"><option value="">No section selected</option>${chapterOptions}</select></label>` : ""}<button class="button button-outline" type="submit">Set phase</button></form>` : "";
  const history = threads.length ? `<section class="feedback-history panel"><div class="panel-head"><span class="label">WORK THREADS</span><span class="timestamp">${threads.length} saved</span></div><p class="thread-history-intro">Each note becomes one reviewable thread. Select one to see its tasks and phase.</p>${[...threads].reverse().map((thread) => { const threadStage = thread.placement?.status === "confirmed" ? thread.placement.stage : profile.stage?.value; const phaseLabel = thread.placement?.status === "confirmed" ? stageName(threadStage) : `Follows · ${stageName(threadStage)}`; return `<button class="feedback-history-item ${thread.id === active?.id ? "selected" : ""}" data-action="select-feedback:${esc(thread.id)}"><span><b>${esc(thread.title)}</b><small>${esc(shortCopy(thread.feedback, 16))}</small></span><em>${esc(phaseLabel)}</em></button>`; }).join("")}${phaseControl}</section>` : "";
  const feedbackStatus = !state.profileReadiness.ready ? `<p class="context-notice">Save feedback now. Add a title/topic, objective, scope, and stage before creating focused tasks.</p>` : `<p class="helper">The task assistant receives only approved thesis context and this exact feedback.</p>`;
  const selected = profile.problems?.find((item) => item.selected);
  const stage = profile.stage?.value ? stageName(profile.stage.value) : "Thesis context incomplete";
  const next = !state.profileReadiness.ready ? `<button class="button button-outline" data-view="profile">Complete thesis context →</button>` : !connected ? `<button class="button button-outline" data-view="integrations">Connect Zotero →</button>` : "";
  const feedbackPrompts = `<section class="feedback-prompts panel"><span class="label">TRY THE REVIEWABLE WORKFLOW</span><h2>Use a comment that exposes the trail.</h2><p>Each starter shows a different Proofline strength: preserving a reviewer’s wording, turning it into bounded work, and linking that work to evidence for review.</p><div>${demoFeedbackOptions.map((option) => `<button type="button" class="feedback-prompt" data-action="use-feedback-prompt:${esc(option.id)}"><strong>${esc(option.title)}</strong><span>${esc(option.outcome)}</span><b>Use this →</b></button>`).join("")}</div></section>`;
  return `<section class="lifecycle-head"><div>${eyebrow("Your thesis workspace")}<h1>${esc(state.project || canonical?.project?.name)}</h1><p><span class="status-dot"></span>${esc(stage)}${selected ? ` · Focused on ${esc(selected.name)}` : ""}</p></div>${next}</section><section class="lifecycle-grid"><div>${feedbackPrompts}<form class="feedback-form panel overview-feedback" id="feedback-form"><div class="panel-head"><span class="label">CAPTURE A SUPERVISOR NOTE</span><span class="timestamp">Original wording is saved</span></div><label for="feedback-title">Short label <small>optional</small></label><input id="feedback-title" name="title" value="${esc(state.feedbackTitle)}" placeholder="For example: Scope of Section 3.2" /><label for="feedback-text">What did your supervisor say?</label><textarea id="feedback-text" name="feedback" rows="6" placeholder="Paste or type their exact comment here." required>${esc(state.feedback)}</textarea><label for="workflow-provider">Task assistant</label><select id="workflow-provider" name="provider">${workflowProviderOptions()}</select>${feedbackStatus}${sectionActivity(["task-graph", "feedback-capture"])}<div class="form-footer"><span class="read-only-note"><i></i>${state.profileReadiness.ready ? "Creates a reviewable work thread" : "Saves the original note"}</span>${button(state.profileReadiness.ready ? "Create work thread →" : "Save note →", "analyze-feedback", "dark", state.workflowBusy)}</div></form>${active ? `<article class="latest-feedback panel"><div class="panel-head"><span class="label">ACTIVE WORK THREAD</span><span class="timestamp">${esc(active.tasks?.length ? `${active.tasks.length} tasks` : "Ready to plan")}</span></div><blockquote>“${esc(shortCopy(active.feedback, 38, 2))}”</blockquote>${active.tasks?.length ? `<button class="card-link" data-view="tasks">Review this thread’s tasks <span>→</span></button>` : `<button class="card-link" data-action="resume-feedback:${esc(active.id)}">Turn this note into tasks <span>→</span></button>`}</article>` : ""}</div><div>${history}<section class="integration-health"><button class="panel" data-view="integrations"><i class="${connected ? "live" : ""}"></i><span><b>Zotero</b><small>${connected ? `Connected locally · ${state.connection.paperCount} papers` : "Not connected"}</small></span><em>→</em></button></section></div></section>`;
}

function overview() {
  const canonical = state.projectState;
  const profile = canonical?.profile ?? {};
  const threads = canonical?.feedbackThreads ?? [];
  const openTasks = threads.flatMap((thread) => thread.tasks ?? []).filter((task) => task.approvalStatus !== "rejected" && task.status !== "completed").length;
  const active = threads.find(({ id }) => id === state.feedbackThreadId) ?? threads.at(-1);
  const stage = profile.stage?.value ? thesisStages.find(([id]) => id === profile.stage.value)?.[1] ?? statusLabel(profile.stage.value) : "Set your research phase";
  const reviewSummary = active ? `<article class="overview-review panel"><span class="label">SUPERVISOR REVIEW</span><h2>${esc(active.title)}</h2><p>${esc(shortCopy(active.feedback, 26, 2))}</p><div><span>${active.tasks?.length || 0} task${active.tasks?.length === 1 ? "" : "s"} in this thread</span><button class="text-button" data-view="feedback">Open review workspace <span>→</span></button></div></article>` : `<article class="overview-review panel"><span class="label">SUPERVISOR REVIEW</span><h2>No note captured yet.</h2><p>Keep comments, resulting tasks, phase placement, and evidence in one reviewable thread.</p><button class="button button-dark" data-view="feedback">Capture a supervisor note →</button></article>`;
  return `<section class="lifecycle-head overview-head"><div>${eyebrow("Your research workspace")}<h1>${esc(state.project || canonical?.project?.name)}</h1><p><span class="status-dot"></span>${esc(stage)}</p></div><button class="button button-outline" data-view="feedback">Open reviewer feedback →</button></section><section class="overview-at-a-glance"><article class="panel"><span class="label">CURRENT PHASE</span><strong>${esc(stage)}</strong><small>Set from your approved research brief</small></article><article class="panel"><span class="label">OPEN WORK</span><strong>${openTasks}</strong><small>Tasks awaiting review or completion</small></article><article class="panel"><span class="label">REVIEW THREADS</span><strong>${threads.length}</strong><small>Reviewer notes kept with their outcomes</small></article></section><section class="overview-clean-grid">${reviewSummary}<article class="overview-next panel"><span class="label">WHAT MAKES THIS DIFFERENT</span><h2>Every task keeps its reason.</h2><p>Proofline preserves the original note, the research phase it belongs to, the task it created, and the evidence selected to address it.</p><button class="text-button" data-view="feedback">See the review trail <span>→</span></button></article></section>`;
}

function provenanceLabel(value) {
  const source = value?.provenance;
  if (source?.kind === "user-stated") return "You stated";
  if (source?.sourceId) return `Project document${source.locator ? ` · ${source.locator}` : ""}`;
  return "Not approved";
}

function profile() {
  if (!state.projectState) return `<div class="page-intro compact">${eyebrow("Onboarding / research intent")}<h1>Start with your project document.</h1><p>Use your project PDF, description, or proposal to establish the research objectives. If you already have an editable LaTeX manuscript, you can attach its folder now; otherwise leave it blank.</p></div>
    <form class="panel profile-form" id="project-init-form"><label>Project name</label><input name="project" value="${esc(state.project)}" required /><label>Optional manuscript folder</label><input name="thesisDir" placeholder="Leave blank if you do not have a .tex manuscript yet" /><label>Obsidian vault</label><input name="vaultPath" value="${esc(state.obsidianVaultPath)}" placeholder="/absolute/path/to/vault" required /><div class="form-footer">${button("Initialize research brief →", "submit-init", "dark", state.workflowBusy)}</div></form>`;

  const canonical = state.projectState;
  const approved = canonical.profile || {};
  const proposal = canonical.profileProposal?.status === "pending" ? canonical.profileProposal : null;
  const missing = state.profileReadiness.missing || [];
  const missingLabels = {
    titleOrTopic: "a research title or topic",
    objectives: "at least one objective",
    selectedScope: "a selected scope",
    stage: "the current research phase"
  };
  const missingSummary = missing.map((field) => missingLabels[field] || field).join(", ");
  const proposalFields = proposal ? Object.entries(proposal.fields).map(([name, value]) => {
    const display = Array.isArray(value) ? value.map((item) => item.text || item.name).join("; ") : value.value;
    return `<label class="profile-proposal-field"><input type="checkbox" name="field" value="${esc(name)}" checked /><span><strong>${esc(name)}</strong><small>${esc(display)}</small></span></label>`;
  }).join("") : "";
  const objectives = (approved.objectives || []).map((item) => `<li>${esc(item.text)} <small>${esc(provenanceLabel(item))}</small></li>`).join("");
  const objectiveCoverage = (approved.objectives || []).map((objective) => {
    const linkedTasks = (canonical.feedbackThreads ?? []).flatMap((thread) => thread.tasks ?? []).filter((task) => task.objectiveIds?.includes(objective.id));
    const chapterIds = [...new Set(linkedTasks.flatMap((task) => task.targetLocationIds ?? []))];
    const chapters = (canonical.manuscript?.chapters ?? []).filter((chapter) => chapterIds.includes(chapter.id)).map((chapter) => `${chapter.number ? `${chapter.number} · ` : ""}${chapter.title}`);
    return `<li><strong>${esc(objective.text)}</strong><small>${chapters.length ? `Covered in ${esc(chapters.join(", "))}` : linkedTasks.length ? "Linked to a review task; no manuscript section selected" : "Not yet linked to a review task"}</small></li>`;
  }).join("");
  const selected = (approved.problems || []).find((item) => item.selected);
  const profileStatus = state.profileReadiness.ready ? "Ready for feedback tasks" : `Still needed: ${missingSummary || "review the proposed profile"}`;
  const documentTools = `<details class="profile-secondary"><summary>Project document and extraction <span>${canonical.documents?.length || 0} document${canonical.documents?.length === 1 ? "" : "s"}</span></summary><div class="profile-secondary-content"><form class="profile-form" id="document-import-form" aria-busy="${state.activeProfileForm === "document-import-form"}"><h3>Add or replace a project document</h3><p>Use this only when you want Proofline to read additional project material.</p>${documentDropZone()}${profileCardLoading("document-import-form", "Importing and reading the document…")}<button class="button button-outline" type="submit"${state.activeProfileForm ? " disabled" : ""}>Upload document</button></form>${canonical.documents?.length && !proposal ? `<form class="profile-form profile-extraction" id="profile-propose-form" aria-busy="${state.activeProfileForm === "profile-propose-form"}"><h3>Suggest updates from a document</h3><p>Proofline proposes changes for your review; it never replaces your brief automatically.</p><select name="documentId">${canonical.documents.map((item) => `<option value="${esc(item.id)}">${esc(item.filename)}</option>`).join("")}</select><label>Assistant</label><select name="provider"><option value="codex">Codex CLI · local login</option><option value="openai">OpenAI · GPT-5.6 API</option></select>${profileCardLoading("profile-propose-form", "Reading project material…")}<button class="button button-outline" type="submit"${state.activeProfileForm ? " disabled" : ""}>Suggest brief updates</button></form>` : ""}</div></details>`;
  return `<div class="page-intro compact profile-intro">${eyebrow("Research brief")}<h1>${state.profileReadiness.ready ? "Your research brief is ready." : "Set up your research brief."}</h1><p>${state.profileReadiness.ready ? "Proofline will use this approved information when it turns feedback into research tasks." : `To create focused tasks, add ${esc(missingSummary || "the remaining brief details")}.`}</p></div>
    <section class="profile-status panel"><span class="status-dot"></span><div><strong>${esc(profileStatus)}</strong><p>${state.profileReadiness.ready ? "You can now create tasks from supervisor feedback." : "Complete the short form below, then return to your feedback."}</p></div></section>
    <section class="profile-workspace">
      <form class="panel profile-form profile-focus-form" id="profile-form" aria-busy="${state.activeProfileForm === "profile-form"}"><span class="label">STEP 1 · YOUR CURRENT FOCUS</span><h2>Where are you in the research?</h2><p>Choose the phase you are working on now, then name the part your feedback is about.</p><label for="thesis-stage">Current research phase</label><select id="thesis-stage" name="stage">${thesisStageOptions(approved.stage?.value)}</select><ol class="thesis-stage-path">${thesisStages.map(([value, label], index) => `<li class="${approved.stage?.value === value ? "current" : ""}"><span>${String(index + 1).padStart(2, "0")}</span>${esc(label)}</li>`).join("")}</ol><label for="scope-name">What part are you working on?</label><input id="scope-name" name="scopeName" value="${esc(selected?.name || "")}" placeholder="For example: System model" required /><label for="scope-summary">Optional note</label><textarea id="scope-summary" name="scopeSummary" rows="2" placeholder="What are you trying to clarify or improve?">${esc(selected?.summary || "")}</textarea>${profileCardLoading("profile-form", "Saving your research brief…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Save my focus</button></form>
      <article class="panel profile-summary"><div class="panel-head"><span class="label">WHAT PROOFLINE KNOWS</span><span class="timestamp">Updated revision ${canonical.revision}</span></div><h2>${esc(approved.title?.value || approved.topic?.value || "Your research title")}</h2>${approved.topic?.value && approved.title?.value ? `<p>${esc(approved.topic.value)}</p>` : ""}<div class="profile-facts"><div><span>Current focus</span><strong>${esc(selected?.name || "Not chosen yet")}</strong></div><div><span>Current phase</span><strong>${esc(approved.stage ? statusLabel(approved.stage.value) : "Not chosen yet")}</strong></div></div><h3>Approved objectives</h3><ul>${objectives || "<li>No objectives have been approved yet.</li>"}</ul><h3>Objective coverage</h3><ul class="objective-coverage">${objectiveCoverage || "<li>No objectives have been approved yet.</li>"}</ul>${(approved.seedReferences ?? []).length ? `<div class="seed-reference-check"><span>${approved.seedReferences.length} proposed reference${approved.seedReferences.length === 1 ? "" : "s"}</span><button class="text-button" data-action="reconcile-seed-references">Check Zotero matches →</button>${state.seedReferenceReport ? `<small>${state.seedReferenceReport.present.length} present · ${state.seedReferenceReport.missing.length} missing · ${state.seedReferenceReport.ambiguous.length} ambiguous</small>` : ""}</div>` : ""}</article>
    </section>
    ${proposal ? `<form class="panel profile-form profile-review" id="profile-review-form" aria-busy="${state.activeProfileForm === "profile-review-form"}"><span class="label">PROFILE UPDATES TO REVIEW</span><h2>Choose what to keep</h2><p>Checked items will update your profile. Unchecked items will be ignored.</p>${proposalFields}${profileCardLoading("profile-review-form", "Saving approved profile fields…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Save selected updates</button></form>` : documentTools}`;
}

function legacyFeedback() {
  if (state.projectState && !state.profileReadiness.ready) return `<div class="page-intro compact">${eyebrow("Feedback / context required")}<h1>Complete the research brief first.</h1><p>Feedback without approved objectives and scope produces generic work. Missing: ${esc(state.profileReadiness.missing.join(", "))}.</p>${button("Complete research brief →", "open-profile")}</div>`;
  return `<div class="page-intro compact">${eyebrow("Feedback / source")}<h1>Keep the original wording.</h1><p>Add a real reviewer comment. Proofline interprets it against the approved research brief and manuscript map.</p></div><section class="feedback-layout"><form class="feedback-form panel" id="feedback-form"><label for="feedback-title">Feedback title</label><input id="feedback-title" name="title" value="${esc(state.feedbackTitle)}" placeholder="For example: Section 3.2 revisions" /><label for="feedback-text">Reviewer feedback</label><textarea id="feedback-text" name="feedback" rows="8" placeholder="Paste the exact feedback here." required>${esc(state.feedback)}</textarea><label for="workflow-provider">Decomposition runtime</label><select id="workflow-provider" name="provider">${workflowProviderOptions()}</select><p class="helper">Only approved research context and this feedback are sent to the selected runtime.</p>${sectionActivity(["task-graph"])}${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="form-footer"><span class="read-only-note"><i></i> Validated task artifact</span>${button(state.workflowBusy ? "Creating tasks…" : state.feedback ? "Update review tasks →" : "Create review tasks →", "analyze-feedback", "dark", state.workflowBusy)}</div></form><aside class="side-note"><span class="label">WHAT HAPPENS NEXT</span><ol><li><b>01</b><span>The runtime receives approved research context plus exact feedback.</span></li><li><b>02</b><span>The server validates the task graph and persists it canonically.</span></li><li><b>03</b><span>Every proposed task begins pending your approval.</span></li></ol></aside></section>`;
}

function taskRow(task) { return `<button class="task-row" data-task="${esc(task.id)}"><span class="task-mark ${esc(task.approvalStatus)}">${task.approvalStatus === "approved" ? "✓" : ""}</span><span class="task-copy"><strong>${esc(task.title)}</strong><small>${esc(task.tool)} · ${esc(statusLabel(task.status))}</small></span><span class="task-state ${esc(task.approvalStatus)}">${esc(statusLabel(task.approvalStatus))}</span><span class="arrow">→</span></button>`; }

function tasks() {
  if (!state.tasks.length) return `<div class="page-intro compact">${eyebrow("Review / tasks")}<h1>No inferred work yet.</h1><p>Add supervisor feedback first. Tasks will appear here for approval before an integration can run.</p></div>${emptyState("No tasks to review", "The workspace will not invent tasks without a source comment.", "new-feedback", "Add feedback")}`;
  const feedback = readableFeedback(state.feedback);
  const paragraphs = feedback.split(/\n\s*\n/).filter(Boolean);
  return `<div class="page-intro compact">${eyebrow("Review / tasks")}<h1>Approve, then continue in the right place.</h1><p>Obsidian, VS Code, and Overleaf tasks approve the task and open the linked workspace in one deliberate handoff. Other tasks still open for review first.</p></div><section class="task-layout"><div class="task-graph panel"><div class="panel-head"><span class="label">SOURCE FEEDBACK</span><span class="timestamp">${state.runtime ? `${esc(state.runtime.provider)} · ${esc(state.runtime.model)}` : "Stored locally"}</span></div><div class="feedback-reading"><p class="feedback-reading-note">Cleaned for reading. The original feedback is retained unchanged.</p>${paragraphs.slice(0, 2).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}${paragraphs.length > 2 ? `<details><summary>Read the remaining ${paragraphs.length - 2} paragraph${paragraphs.length === 3 ? "" : "s"}</summary>${paragraphs.slice(2).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</details>` : ""}</div><div class="graph-line"></div>${state.tasks.map((task, index) => {
    const handoff = ["obsidian", "vscode", "overleaf"].includes(task.tool);
    const action = handoff ? (task.approvalStatus === "pending" ? `approve-and-open:${task.id}` : `open-task-tool:${task.id}`) : `open-task:${task.id}`;
    const detail = handoff && task.approvalStatus === "pending" ? `Approve & open ${task.tool}` : `${task.tool} · ${statusLabel(task.approvalStatus)}`;
    return `<button class="graph-task ${esc(task.approvalStatus)}" data-action="${esc(action)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(task.title)}</strong><small>${esc(detail)}</small><b>→</b></button>`;
  }).join("")}</div><aside class="approval-panel"><span class="label">APPROVAL MODEL</span><h2>Approve here.<br />Continue there.</h2><p>Opening a linked workspace never makes a write on your behalf.</p><div class="approval-box"><i>✓</i><span>Approved tasks<br /><strong>${state.tasks.filter((task) => task.approvalStatus === "approved").length} of ${state.tasks.length}</strong></span></div></aside></section>`;
}

function paperCard(paper, index) {
  const destination = paper.doi ? `https://doi.org/${encodeURIComponent(paper.doi)}` : httpsUrl(paper.url);
  const selectable = state.candidates.some((candidate) => candidate.sourceId === paper.sourceId);
  const selected = state.selectedSourceIds.includes(paper.sourceId);
  return `<article class="candidate panel${selected ? " selected" : ""}"><div class="candidate-number">${String(index + 1).padStart(2, "0")}</div><div class="candidate-main"><span class="label">${esc(statusLabel(paper.itemType || "bibliographic item"))}${paper.year ? ` · ${esc(paper.year)}` : ""}</span><h2>${esc(paper.title)}</h2><p class="authors">${paper.creators?.length ? esc(paper.creators.join("; ")) : "No creator metadata"}</p><p class="publication">${esc(paper.publicationTitle || "No publication venue recorded")}</p><p class="doi">${paper.doi ? `DOI ${esc(paper.doi)}` : `Zotero key ${esc(paper.key)}`}${destination ? ` <a href="${esc(destination)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ""}</p>${selectable ? button(selected ? "Selected as evidence ✓" : "Select as evidence", `toggle-evidence:${paper.sourceId}`, selected ? "dark" : "outline") : ""}</div><div class="candidate-source"><span class="label">${paper.matchScore !== undefined ? `MATCH ${Math.round(paper.matchScore * 100)}%` : "SOURCE ID"}</span><code>${esc(paper.sourceId)}</code><p>${paper.matchReasons?.length ? esc(paper.matchReasons.join(" · ")) : `Read-only metadata from ${esc(state.connection.library?.name || "the selected Zotero library")}.`}</p></div></article>`;
}

const demoFeedbackOptions = [
  { id: "framing", title: "Qualify an overclaim", text: "The claim that smart charging reduces local congestion is too strong. Separate tariff-driven load shifting from network-aware capacity management, and show which evidence supports or qualifies each statement.", outcome: "Shows counter-evidence, bounded claims, and a traceable evidence note." },
  { id: "boundary", title: "Protect a model boundary", text: "For the system model, do not imply that a tariff alone solves congestion. State the network constraint, the control decision, and the assumptions that must hold before making that claim.", outcome: "Turns an ambiguous comment into a scoped, reviewable model decision." },
  { id: "feasibility", title: "Expose a real-world constraint", text: "Before treating delayed charging as available flexibility, explain whether vehicles can reliably pause and resume. Keep this deployment limitation visible in the feasibility assumptions.", outcome: "Connects a practical limitation to literature, tasks, and the final trail." }
];

function noteReadModelPanel() {
  const model = state.notePreview?.readModel;
  if (!model) return state.notePreview ? `<pre class="note-preview">${esc(state.notePreview.markdown)}</pre>` : "";
  const sources = model.sources.map((source) => {
    const sourceUrl = httpsUrl(source.sourceUrl);
    return `<article class="note-source-card"><span class="label">SOURCE ${source.ordinal}</span><h3>${esc(source.title)}</h3><p><strong>Finding</strong>${esc(shortCopy(source.summary || "Selected evidence awaiting a grounded source-note summary."))}</p>${source.relevance ? `<p><strong>Use it for</strong>${esc(shortCopy(source.relevance, 20))}</p>` : ""}<small>${esc([source.year, source.venue].filter(Boolean).join(" · ") || "Bibliographic metadata")}${sourceUrl ? ` · <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ""}</small></article>`;
  }).join("");
  const styleCheck = model.synthesis?.styleReview?.passed ? " · writing check passed" : "";
  return `<section class="note-read-model"><div class="panel-head"><span class="label">EVIDENCE BRIEF</span><span class="timestamp">${esc(model.sources.length)} sources${styleCheck}</span></div><h3>${esc(model.title)}</h3><blockquote>“${esc(shortCopy(model.feedback, 28))}”</blockquote>${model.synthesis ? `<p class="note-overview">${esc(shortCopy(model.synthesis.overview, 60, 2))}</p>` : ""}<div class="note-source-grid">${sources}</div><details class="raw-markdown"><summary>Show full Markdown note</summary><pre class="note-preview">${esc(state.notePreview.markdown)}</pre></details></section>`;
}

function noteWorkflowPanel() {
  if (!state.evidenceSelection) return "";
  const isDemo = state.connection.mode === "demo";
  const draftWarning = state.noteDraft?.warning ? `<p class="form-error" role="status">${esc(state.noteDraft.warning)}</p>` : "";
  const draftControls = !state.notePreview ? `<div class="note-actions">${button(state.workflowBusy ? "Drafting with Codex CLI…" : "Draft with Codex CLI →", "draft-evidence-note", "dark", state.workflowBusy)} ${button("Use local template", "preview-obsidian-note", "outline", state.workflowBusy)}</div><p class="helper">Codex CLI uses your authenticated local Codex session and receives only the selected papers plus supervisor feedback. Clicking approval consents to that processing.</p>` : "";
  const boundaryCheck = state.notePreview && state.evidenceRefs.length && !isDemo ? `<div class="note-actions"><button class="button button-outline" data-action="test-citation-boundary"${state.workflowBusy ? " disabled" : ""}>Verify citation boundary</button></div><p class="helper">Uses a deliberately invalid local test ID. It does not change Zotero, create a note preview, or write any file.</p>` : "";
  const boundaryStatus = !isDemo ? sectionActivity(["citation-boundary"]) : "";
  const boundaryProof = !isDemo ? citationBoundaryProofPanel() : "";
  const writeControls = state.notePreview ? (isDemo
    ? `<p class="demo-boundary">Judge mode stops at preview. No filesystem write is performed.</p>`
    : state.obsidianVaultPath
      ? `<div class="vault-connected"><span class="label">OBSIDIAN VAULT CONNECTED</span><code>${esc(state.obsidianVaultPath)}</code><button class="text-button" data-action="change-obsidian-vault">Change vault</button></div><p class="helper">Notes go into <code>10_Literature_Notes/</code> inside this vault. Each feedback thread has its own note; Proofline updates only notes it previously created.</p>${button(state.noteWrite ? (state.noteWrite.updated ? "Note updated ✓" : "Note written ✓") : "Approve and write note", "write-obsidian-note", "dark", Boolean(state.noteWrite))}`
      : `<div class="vault-setup"><h3>Where should this note live?</h3><p>Choose an existing Obsidian vault, or create a new project vault. Proofline remembers your choice for this project.</p><div class="note-actions">${button("Choose existing vault", "choose-existing-vault", "dark")} ${button("Create new vault", "create-obsidian-vault", "outline")}</div></div>`) : "";
  const traceableNotes = state.noteDraft?.sourceNotes ?? [];
  const traceback = state.claimTraceback ? `<article class="claim-traceback-result"><span class="label">TRACE COMPLETE</span><h3>${esc(state.claimTraceback.source.title)}</h3><div class="trace-explanation"><section><span>01</span><div><strong>Draft statement</strong><p>${esc(state.claimTraceback.claim?.summary || "No grounded source-note text was recorded.")}</p></div></section><section><span>02</span><div><strong>What this paper contributes</strong><p>${esc(state.claimTraceback.source.abstract || "The selected source has no abstract in this fixture.")}</p></div></section><section><span>03</span><div><strong>Why it matters here</strong><p>${esc(state.claimTraceback.claim?.relevance || "Researcher review is required before using this statement in the thesis.")}</p></div></section><section><span>04</span><div><strong>Review trail</strong><p><b>Supervisor asked:</b> ${esc(state.claimTraceback.feedback.comment)}</p><p><b>You approved:</b> ${esc(state.claimTraceback.task.title)}</p><small>Evidence ID: <code>${esc(state.claimTraceback.source.sourceId)}</code>${state.claimTraceback.responseMatrix ? ` · ${esc(state.claimTraceback.responseMatrix.status)}` : ""}</small></div></section></div></article>` : "";
  const tracePanel = state.notePreview && traceableNotes.length && state.feedbackThreadId ? `<section class="claim-traceback"><div><span class="label">CLAIM TRACEBACK</span><h3>Can this draft statement be defended?</h3><p>Choose a source to see its evidence and the feedback it addresses.</p></div><div class="trace-buttons">${traceableNotes.map((note, index) => button(`Trace source ${index + 1} →`, `trace-claim:${note.sourceId}`, "outline", state.workflowBusy)).join("")}</div>${traceback}</section>` : "";
  return `<section class="panel note-workflow"><div class="panel-head"><span class="label">OBSIDIAN NOTE</span><span class="timestamp">${state.noteWrite ? (state.noteWrite.updated ? "Updated with approval" : "Written with approval") : state.notePreview ? "Preview only" : "No write yet"}</span></div><h2>${state.noteWrite ? (state.noteWrite.updated ? "Literature note updated." : "Literature note created.") : "Turn selected evidence into a grounded note."}</h2><p>${state.noteWrite ? `Saved to ${esc(state.noteWrite.path)}` : "Drafting and filesystem writing are separate approval boundaries."}</p>${sectionActivity(["evidence-attach", "codex-draft", "note-preview", "claim-traceback", "vault-picker", "vault-write"])}${draftWarning}${draftControls}${noteReadModelPanel()}${tracePanel}${boundaryCheck}${boundaryStatus}${boundaryProof}${writeControls}</section>`;
}

function evidence() {
  if (state.connection.status !== "connected") return `<div class="page-intro compact">${eyebrow("Library / Zotero")}<h1>Your papers appear after connection.</h1><p>Proofline reads top-level bibliographic metadata from Zotero Desktop and leaves the library unchanged.</p></div>${connectionPanel()}`;
  const showingSearchResults = state.searchArtifact !== null;
  const visiblePapers = showingSearchResults ? state.candidates : state.papers;
  const literatureTask = state.tasks.find((task) => task.kind === "literature");
  const approvedLiteratureTask = literatureTask?.approvalStatus === "approved" ? literatureTask : null;
  const searchLabel = state.searchQuery?.trim() || literatureTask?.title || "Approved literature task";
  const libraryAction = showingSearchResults
    ? `${state.candidates.length ? button(state.workflowBusy ? "Attaching evidence…" : `Attach ${state.selectedSourceIds.length} as evidence →`, "attach-evidence", "dark", state.workflowBusy || state.selectedSourceIds.length === 0) : ""}${button("Show all papers", "clear-search", "outline", state.workflowBusy)}`
    : approvedLiteratureTask
      ? `${button("Search approved literature →", "search-zotero")}${button("Export library JSON ↗", "export-json", "outline")}`
      : literatureTask
        ? button("Review literature task →", "open-literature-task")
        : button("Add feedback to create a literature task →", "new-feedback", "outline");
  const evidenceHandoff = `${sectionActivity(["zotero", "zotero-search", "evidence-attach"])}${state.evidenceSelection ? `<section class="evidence-handoff panel"><div><span class="label">NEXT STEP</span><h2>Evidence attached.</h2><p>Your selected sources are ready for a grounded note. Drafting, previewing, and saving notes happen in Evidence notes.</p></div>${button("Open Evidence notes →", "open-evidence-notes", "dark")}</section>` : ""}`;
  const searchForm = showingSearchResults ? `<form class="literature-search panel" id="literature-search-form"><div><label for="literature-search-query">Search within your Zotero library</label><p>Try a topic, title, author surname, or DOI.</p></div><input id="literature-search-query" name="query" value="${esc(state.searchQuery || "")}" placeholder="For example: target orientation" required /><button class="button button-dark" type="submit"${state.workflowBusy ? " disabled" : ""}>${state.workflowBusy ? "Searching…" : "Search"}</button></form>` : "";
  const retrievalNotice = showingSearchResults && state.searchArtifact?.retrieval ? `<details class="retrieval-notice"><summary>Search details</summary><p>${state.searchArtifact.retrieval.mode === "hybrid-semantic" ? "Matched titles, abstracts, and metadata." : "Matched available bibliographic metadata."} ${state.searchArtifact.retrieval.warning ? esc(state.searchArtifact.retrieval.warning) : ""}</p></details>` : "";
  const results = showingSearchResults && !visiblePapers.length
    ? emptyState("No papers matched", `Zotero found no papers for “${state.searchArtifact?.query || state.searchQuery}”. Refine the query and search again.`)
    : `<section class="evidence-list">${visiblePapers.map(paperCard).join("")}</section>`;
  return `<div class="page-intro compact">${eyebrow("Library / Zotero")}<h1>${showingSearchResults ? "Choose the papers to use." : "Find evidence in your library."}</h1><p>${showingSearchResults ? `${state.candidates.length} papers found for this approved task. ${state.candidates.length ? "Select the papers you have reviewed and want to use." : "Try a broader search below."}` : `${state.connection.paperCount} papers are available from ${esc(state.connection.library?.name || "your selected library")}. Your Zotero library stays read-only.`}</p></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<section class="evidence-toolbar"><div><span class="label">${showingSearchResults ? "SEARCHING FOR" : "SELECTED LIBRARY"}</span><strong>${showingSearchResults ? esc(searchLabel) : esc(state.connection.library?.name || state.connection.library?.id)}</strong></div><span class="connection connected"><i></i>${showingSearchResults ? `${state.candidates.length} found · ${state.selectedSourceIds.length} selected` : `Read-only · ${state.connection.paperCount} papers`}</span>${libraryAction}</section>${retrievalNotice}${searchForm}${results}<div class="artifact-note"><i>◇</i><span>${state.evidenceSelection ? `<strong>${state.evidenceSelection.selectedCount} papers selected</strong> · continue in Evidence notes` : "Your Zotero library is read-only. Selecting a paper never changes Zotero."}</span></div>${evidenceHandoff}`;
}

function noteProgress() {
  const activeStep = state.noteWrite ? 4 : state.notePreview ? 3 : 2;
  const steps = ["Evidence attached", "Prepare note", "Review preview", state.noteWrite ? "Saved to vault ✓" : "Save to vault"];
  return `<div class="workflow-steps" aria-label="Evidence note progress">${steps.map((label, index) => {
    const step = index + 1;
    const status = state.noteWrite && step === 4 ? "saved" : step < activeStep ? "complete" : step === activeStep ? "active" : "";
    return `<span class="${status}"${step === activeStep ? ' aria-current="step"' : ""}>${String(step).padStart(2, "0")} ${esc(label)}</span>`;
  }).join("")}</div>`;
}

function notes() {
  if (!state.evidenceSelection) return `<div class="page-intro compact">${eyebrow("Evidence notes / next step")}<h1>Attach evidence before drafting.</h1><p>Select and attach reviewed papers from the Library first. They will appear here as the next step.</p></div>${emptyState("No evidence attached yet", "The note workflow begins after you attach selected Zotero papers.", "open-library", "Open library")}`;
  const proofPanel = state.connection.mode === "demo" ? citationBoundaryProofPanel() : "";
  return `<div class="page-intro compact">${eyebrow("Evidence notes / next step")}<h1>Turn evidence into a note.</h1><p>Your selected sources are attached. Prepare a note, review the preview, then choose whether to save it.</p>${noteProgress()}</div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<section class="selected-evidence-summary panel"><div><span class="label">SELECTED EVIDENCE</span><h2>${state.evidenceSelection.selectedCount} source${state.evidenceSelection.selectedCount === 1 ? "" : "s"} ready</h2><p>Stable Zotero source IDs are preserved in the note.</p></div><button class="text-button" data-view="evidence">Review selection ↗</button></section>${proofPanel}${noteWorkflowPanel()}`;
}

function libraryChoices() {
  return `<div class="library-choices">${state.connection.libraries.map((library) => `<button class="library-choice" data-action="select-zotero:${esc(library.id)}"><span><strong>${esc(library.name)}</strong><small>${esc(library.type)} library · ID ${esc(library.id)}</small></span><b>${library.paperCount} papers →</b></button>`).join("")}</div>`;
}

function connectionPanel() {
  const status = state.connection.status;
  if (status === "checking") return `<section class="connection-panel panel is-checking"><span class="connection-index">01</span><div><span class="label">ZOTERO DESKTOP</span><h2>Looking for the local library.</h2><p>Keep Zotero open while Proofline checks the read-only API on this machine.</p></div>${button("Checking…", "connect-zotero", "outline", true)}</section>`;
  if (status === "selection_required") return `<section class="connection-panel panel"><span class="connection-index">01</span><div class="connection-copy"><span class="label">CHOOSE A LIBRARY</span><h2>More than one library contains papers.</h2><p>Choose a library for this project. Proofline remembers the library ID and will not merge libraries unless you explicitly request it from the CLI.</p>${libraryChoices()}</div></section>`;
  if (status === "connected") {
    const demo = state.connection.mode === "demo";
    return `<section class="connection-panel panel is-connected"><span class="connection-index">✓</span><div><span class="label">${demo ? "DEMO DATA · READ-ONLY FIXTURE" : "ZOTERO DESKTOP · READ-ONLY"}</span><h2>${esc(state.connection.library?.name || "Zotero library")}</h2><p>${demo ? `${state.connection.paperCount} sample papers are active. This data is not your Zotero library.` : `${state.connection.paperCount} bibliographic papers available. Proofline has not changed any Zotero item.`}</p></div><div class="connection-actions">${button("Open library →", "open-library")}<button class="text-button" data-action="connect-zotero">${demo ? "Try Zotero again" : "Refresh connection"}</button></div></section>`;
  }
  return `<section class="connection-panel panel is-error"><span class="connection-index">!</span><div><span class="label">ZOTERO DESKTOP NOT AVAILABLE</span><h2>Open Zotero and try again.</h2><p>${esc(state.connection.message || "Proofline could not reach Zotero Desktop.")}</p><ol class="connection-checklist"><li>Open Zotero Desktop on this machine.</li><li>In Zotero settings, allow other applications to communicate with Zotero.</li><li>Return here and retry the local connection.</li></ol><p><strong>Demo data is optional and always labelled.</strong> It lets reviewers test the workflow without Zotero.</p></div><div class="connection-actions">${button("Open Zotero and try again", "connect-zotero")}${button("Use demo library", "use-demo-library", "outline")}</div></section>`;
}

function integrations() {
  const project = state.projectState?.project ?? {};
  const workspace = [
    project.thesisDir && { tool: "vscode", icon: "⌘", title: "VS Code", path: project.thesisDir, copy: "Opens this selected local folder." },
    project.vaultPath && { tool: "obsidian", icon: "O", title: "Obsidian", path: project.vaultPath, copy: "Opens this configured vault." },
    project.overleafUrl && { tool: "overleaf", icon: "↗", title: "Overleaf", path: project.overleafUrl, copy: "Opens this project in your browser." }
  ].filter(Boolean);
  const linkedTools = workspace.length ? `<section class="integration-list secondary-integrations">${workspace.map((item) => `<article class="integration panel"><div class="integration-icon">${item.icon}</div><div><span class="label">LINKED WORKSPACE</span><h2>${item.title}</h2><p>${esc(item.copy)} <code>${esc(item.path)}</code></p></div><button class="text-button" data-action="open-workspace-tool:${esc(item.tool)}">Open ${item.title} ↗</button></article>`).join("")}</section>` : "";
  return `<div class="page-intro compact">${eyebrow("Connections / local-first")}<h1>Connect only what you use.</h1><p>Zotero remains read-only. Local folders and an optional Overleaf URL are saved only for this project.</p></div>${sectionActivity(["zotero", "workspace-handoff", "workspace-picker", "vault-picker"])}${connectionPanel()}<section class="connection-flow"><article><span>01</span><h3>Connect Zotero Desktop</h3><p>Proofline checks the local Zotero API. Your Zotero username and password are never requested.</p></article><article><span>02</span><h3>Choose a library</h3><p>If several personal or group libraries contain papers, choose one and remember it for this project.</p></article><article><span>03</span><h3>Review real metadata</h3><p>Load top-level papers into the Library view with source IDs and a visible read-only boundary.</p></article></section>${linkedTools}<section class="workspace-setup"><div class="workspace-setup-head">${eyebrow("Working locations")}<h2>Start where your work lives.</h2><p>Choose an existing location or create one from here. Each connection stays local to this project.</p></div><div class="workspace-setup-grid"><article class="workspace-setup-card panel"><span class="workspace-setup-index">01</span><div class="integration-icon">⌘</div><span class="label">LOCAL CODE</span><h3>VS Code</h3><p>Open an existing project folder, or begin with a clean workspace for code and experiments.</p><div class="workspace-setup-actions">${button("Choose folder", "choose-vscode-folder", "dark")}${button("Create folder", "create-vscode-folder", "outline")}</div></article><article class="workspace-setup-card panel"><span class="workspace-setup-index">02</span><div class="integration-icon">O</div><span class="label">RESEARCH VAULT</span><h3>Obsidian</h3><p>Use an existing vault, or create a research structure with notes, implementation, and resources ready.</p><div class="workspace-setup-actions">${button("Choose vault", "choose-existing-vault", "dark")}${button("Create vault", "create-obsidian-vault", "outline")}</div></article><article class="workspace-setup-card panel"><span class="workspace-setup-index">03</span><div class="integration-icon">↗</div><span class="label">WRITING PROJECT</span><h3>Overleaf</h3><p>Create the project in Overleaf, then save its URL here. Proofline never signs in or syncs your files.</p><div class="workspace-setup-actions"><a class="button button-dark" href="https://www.overleaf.com/project" target="_blank" rel="noreferrer">Create ↗</a>${button("Add URL", "set-overleaf-url", "outline")}</div></article></div></section>`;
}

function settings() { return `<div class="page-intro compact">${eyebrow("Workspace / settings")}<h1>Make this workspace yours.</h1><p>Profile details stay on this machine. Research data and integrations keep their existing approval boundaries.</p></div><div class="settings-grid"><form class="settings-list panel settings-form" id="workspace-settings-form"><div class="settings-section-head"><span class="label">LOCAL PROFILE</span><p>There is no account or authentication in Proofline. This name is saved only in this browser and appears in the workspace sidebar.</p></div><label for="settings-user-name">Your display name</label><input id="settings-user-name" name="userName" value="${esc(state.userName)}" autocomplete="name" maxlength="80" required /><div class="settings-section-head workspace-name-head"><span class="label">WORKSPACE</span><p>This updates the saved local project name wherever it appears in Proofline.</p></div><label for="settings-project-name">Workspace name</label><input id="settings-project-name" name="project" value="${esc(state.project)}" maxlength="140" required /><div class="settings-form-actions"><button class="button button-dark" type="submit">Save settings</button><span class="read-only-note"><i></i>Zotero remains read-only</span></div></form><section class="settings-list panel settings-boundaries"><div class="setting-row"><div><strong>Appearance</strong><p>Choose the workspace contrast that is most comfortable for reading.</p></div><button class="text-button" data-action="toggle-theme">Use ${state.theme === "dark" ? "light" : "dark"} mode</button></div><div class="setting-row"><div><strong>Zotero write access</strong><p>This workspace cannot modify library items, notes, attachments, or collections.</p></div><span class="setting-value">Disabled</span></div><div class="setting-row"><div><strong>Local-first workspace</strong><p>Your browser stores interface preferences; the local app server reads Zotero metadata only.</p></div><span class="toggle on"><i></i> On</span></div></section></div><section class="settings-sign-out panel"><div><span class="label">LOCAL SESSION</span><h2>Leave this browser session</h2><p>Sign out returns to the landing page and clears only this browser’s Proofline preferences. It does not delete your saved workspace, Zotero data, or local files.</p></div><button class="button button-outline" data-action="sign-out">Sign out</button></section>`; }

function about() { return `<div class="page-intro">${eyebrow("About / product promise")}<h1>Research that shows its work.</h1><p>Proofline keeps research intent, reviewer feedback, proposed work, and selected evidence in one reviewable local trail.</p></div><section class="about-grid"><article class="panel"><span>01</span><h2>Understand the research</h2><p>Project documents and manuscript structure propose context for your approval.</p></article><article class="panel"><span>02</span><h2>Keep feedback intact</h2><p>The original comment stays beside every task created from it.</p></article><article class="panel"><span>03</span><h2>Approve every boundary</h2><p>Search is read-only. Writes require a separate, explicit decision.</p></article></section>`; }

function render() {
  document.documentElement.dataset.theme = state.theme === "dark" ? "dark" : "light";
  if (!state.projectState) {
    app.className = "first-run-root";
    app.innerHTML = state.onboardingStep > 0 ? onboarding() : landing();
    return;
  }
  if (state.onboardingStep > 0) {
    app.className = "first-run-root";
    app.innerHTML = onboarding();
    return;
  }
  app.className = "app-shell";
  const view = state.view === "overview" ? overview() : state.view === "profile" ? profile() : state.view === "feedback" ? supervisorReview() : state.view === "tasks" ? tasks() : state.view === "evidence" ? evidence() : state.view === "notes" ? notes() : state.view === "integrations" ? integrations() : state.view === "about" ? about() : settings();
  app.innerHTML = shell(view);
}

function applyConnection(payload) {
  state.connection = payload;
  state.papers = payload.papers || [];
  if (payload.state?.schemaVersion === 3) {
    state.projectState = payload.state;
    state.project = payload.state.project.name;
  }
  if (payload.readiness) state.profileReadiness = payload.readiness;
}

function applyCanonicalWorkflow(workflow) {
  state.feedbackThreadId = workflow.feedbackThreadId;
  state.feedback = workflow.feedback;
  state.tasks = workflow.tasks;
  state.taskGraph = workflow.taskGraph;
  state.evidenceSelection = workflow.evidenceSelection;
  state.evidenceRefs = workflow.selectedEvidence;
  state.selectedSourceIds = workflow.selectedEvidence.map(({ sourceId }) => sourceId);
  state.noteDraft = workflow.draft;
  state.notePreview = workflow.preview;
  state.claimTraceback = null;
  state.noteWrite = null;
}

async function requestConnection(path, options) {
  const isLibrarySelection = path === "/api/zotero/select";
  beginActivity("zotero", isLibrarySelection ? "Loading the selected Zotero library…" : "Checking Zotero Desktop…", isLibrarySelection ? "Reading bibliographic metadata only." : "Looking for the running local connector.", "connect-zotero");
  state.connection = { ...state.connection, status: "checking", message: "Checking for Zotero Desktop…" };
  try {
    const response = await fetch(path, options);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "The Zotero connection could not be completed.");
    applyConnection(payload);
    if (payload.status === "connected") completeActivity("Zotero is connected.", `${payload.paperCount || 0} bibliographic papers are available read-only.`);
    else if (payload.status === "selection_required") completeActivity("Choose a Zotero library.", "Proofline found more than one available library.");
    else failActivity(new Error(payload.message || "Zotero Desktop is not available."), "connect-zotero");
  } catch (error) {
    const message = `The Proofline app server could not complete the connection: ${error.message}`;
    applyConnection({ status: "unavailable", mode: null, access: null, library: null, libraries: [], paperCount: 0, message });
    failActivity(new Error(message), "connect-zotero");
  }
}

function connectZotero() { return requestConnection("/api/zotero/status"); }
function connectDemoLibrary() { return requestConnection("/api/demo/library"); }
function selectZotero(library) { return requestConnection("/api/zotero/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ library, expectedRevision: state.projectState?.revision }) }); }

function closeTaskModal() {
  const modal = document.querySelector(".modal-backdrop");
  if (!modal || modal.dataset.closing === "true") return;
  const returnFocus = modal.returnFocus;
  const remove = () => {
    modal.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    remove();
    return;
  }

  modal.dataset.closing = "true";
  modal.classList.add("is-closing");
  modal.addEventListener("transitionend", (event) => {
    if (event.target === modal) remove();
  }, { once: true });
  window.setTimeout(remove, 180);
}

function openTask(id) {
  const task = getTask(id);
  if (!task) return;
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.returnFocus = returnFocus;
  const canLaunchLiterature = task.kind === "literature" && state.connection.status === "connected";
  const modalCopy = canLaunchLiterature
    ? "Approve this read-only literature task and Proofline will immediately search Zotero and open the results."
    : "This proposed task traces back to the validated feedback artifact. Approval changes the task state; write integrations still require a separate approval.";
  const taskAction = task.approvalStatus === "pending"
    ? `${button(canLaunchLiterature ? "Approve & search Zotero →" : "Approve task", `approve-task:${task.id}`, "dark", state.workflowBusy)}${button("Reject", `reject-task:${task.id}`, "outline", state.workflowBusy)}`
    : task.approvalStatus === "approved" && task.kind === "literature"
      ? button(state.workflowBusy ? "Searching…" : "Search Zotero →", "search-zotero", "dark", state.workflowBusy || state.connection.status !== "connected")
      : `<span class="muted-action">Task ${esc(task.approvalStatus)}</span>`;
  modal.innerHTML = `<section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title"><button class="modal-close" data-close-modal aria-label="Close">×</button><span class="label">${esc(task.kind)} task · ${esc(task.tool)}</span><h2 id="task-title">${esc(task.title)}</h2><p class="modal-copy">${modalCopy}</p>${sectionActivity(["task-review", "zotero-search"])}<div class="modal-detail"><span>Approval</span><strong class="${esc(task.approvalStatus)}">${esc(statusLabel(task.approvalStatus))}</strong><span>Execution</span><strong>${task.kind === "literature" ? "Read-only Zotero search" : "Planned adapter · literature evidence is the submitted slice"}</strong><span>Source</span><strong>User-provided supervisor feedback</strong></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="modal-actions">${taskAction}<button class="text-button" data-close-modal>Close</button></div></section>`;
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.body.append(modal);
  modal.querySelector("[data-close-modal]")?.focus();
}

async function openTaskTool(taskOrTool) {
  const tool = typeof taskOrTool === "string" ? taskOrTool : taskOrTool?.tool;
  if (!["obsidian", "vscode", "overleaf"].includes(tool)) return;
  const response = await fetch("/api/workspace/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Could not open ${tool}.`);
  return payload;
}

async function handleAction(action) {
  if (action === "toggle-theme") { state.theme = state.theme === "dark" ? "light" : "dark"; saveState(); return render(); }
  if (action === "sign-out") {
    localStorage.removeItem(STORAGE_KEY);
    window.location.assign("/");
    return;
  }
  if (action === "hide-demo-guide") { state.demoGuideHidden = true; saveState(); return render(); }
  if (action === "show-demo-guide") { state.demoGuideHidden = false; saveState(); return render(); }
  if (action.startsWith("demo-guide-step:")) return setView(action.slice("demo-guide-step:".length));
  if (action.startsWith("demo-guide-guardrail:")) {
    state.workflowError = "Guardrail to test: reject the proposed literature task and its Zotero search remains unavailable; in Evidence notes, judge mode refuses filesystem writes.";
    return setView(action.slice("demo-guide-guardrail:".length));
  }
  if (action === "restart-demo") {
    beginActivity("demo-restart", "Restarting the demo…", "Restoring the smart-EV-charging fixture without touching a real workspace.");
    try {
      const response = await fetch("/api/demo/restart", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The demo could not be restarted.");
      state = { ...structuredClone(defaultState), project: payload.state.project.name, projectState: payload.state, profileReadiness: payload.readiness, connection: payload.connection, papers: payload.connection.papers, view: "overview" };
      completeActivity("Demo restarted.", "Choose a feedback prompt to begin the guided workflow.");
    } catch (error) { failActivity(error, "restart-demo"); }
    saveState();
    return render();
  }
  if (action === "show-demo-proof") {
    if (state.workflowBusy) return;
    beginActivity("demo-proof", "Preparing the completed proof replay…", "Replaying the same approval-gated fixture workflow; no filesystem write occurs.", action);
    try {
      const response = await fetch("/api/demo/proof", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The completed proof replay could not be prepared.");
      state.project = payload.state.project.name;
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      state.connection = payload.connection;
      state.papers = payload.connection.papers;
      state.feedbackThreadId = payload.proof.feedbackThreadId;
      state.feedbackTitle = payload.state.feedbackThreads.find(({ id }) => id === payload.proof.feedbackThreadId)?.title || "Supervisor feedback";
      state.feedback = payload.workflow.feedback;
      applyCanonicalWorkflow(payload.workflow);
      state.claimTraceback = payload.claimTraceback;
      state.demoRejectionProof = null;
      state.view = "notes";
      completeActivity("Completed proof ready.", "Traceback now shows feedback → approval → selected evidence → grounded source note.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "test-citation-boundary" || action === "test-demo-rejection") {
    if (!state.notePreview || !state.evidenceRefs.length || state.workflowBusy) return;
    const isDemo = state.connection.mode === "demo";
    const attemptedSourceId = isDemo ? "fixture:demo:UNSELECTED" : "proofline:test:UNSELECTED";
    const literatureTask = state.tasks.find((task) => task.kind === "literature" && task.approvalStatus === "approved");
    if (state.feedbackThreadId && !literatureTask) return;
    beginActivity("citation-boundary", "Testing the citation boundary…", "Attempting to preview a draft with a source that was never selected. No write is attempted.", action);
    try {
      const response = await fetch("/api/workflow/notes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.feedbackThreadId
          ? { feedbackThreadId: state.feedbackThreadId, taskId: literatureTask.id, citationBoundaryTest: true, attemptedSourceId }
          : { project: state.project, feedback: state.feedback, evidenceRefs: state.evidenceRefs, draft: { overview: "Intentional boundary-check draft", sourceNotes: [{ sourceId: attemptedSourceId, summary: "This source was never selected.", relevance: "It must be rejected." }] } })
      });
      const payload = await response.json();
      if (response.ok || !/unselected source/i.test(payload.message || "")) throw new Error("The citation-boundary proof did not reject the unselected source as expected.");
      state.demoRejectionProof = {
        allowedSources: state.evidenceRefs.map(({ sourceId, title }) => ({ sourceId, title })),
        attemptedSourceId,
        rejection: payload.message || "Draft cited an unselected source.",
        writeAttempted: false,
        mode: isDemo ? "demo" : "local"
      };
      completeActivity("Citation boundary held.", "The proof below shows the selected source IDs, the rejected fixture ID, and that no preview or write occurred.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action.startsWith("seed-demo-feedback:") || action.startsWith("use-feedback-prompt:")) {
    const prefix = action.startsWith("seed-demo-feedback:") ? "seed-demo-feedback:" : "use-feedback-prompt:";
    const option = demoFeedbackOptions.find((candidate) => candidate.id === action.slice(prefix.length));
    if (!option) return;
    state.feedbackTitle = option.title;
    state.feedback = option.text;
    state.workflowError = "";
    saveState();
    render();
    queueMicrotask(() => document.querySelector("#feedback-text")?.focus({ preventScroll: true }));
    return;
  }
  if (action.startsWith("resume-feedback:")) {
    const thread = state.projectState?.feedbackThreads?.find(({ id }) => id === action.slice("resume-feedback:".length));
    if (!thread || thread.tasks?.length) return;
    state.feedbackThreadId = thread.id;
    state.feedbackTitle = thread.title;
    state.feedback = thread.feedback;
    state.workflowError = "";
    saveState();
    render();
    queueMicrotask(() => document.querySelector("#feedback-form")?.requestSubmit());
    return;
  }
  if (action.startsWith("select-feedback:")) {
    const feedbackThreadId = action.slice("select-feedback:".length);
    beginActivity("feedback-history", "Opening saved feedback…", "Restoring its tasks, evidence, and note state.", action);
    try {
      const response = await fetch(`/api/workflow?feedbackThreadId=${encodeURIComponent(feedbackThreadId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The saved feedback could not be opened.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      applyCanonicalWorkflow(payload.workflow);
      state.feedbackTitle = payload.state.feedbackThreads.find(({ id }) => id === feedbackThreadId)?.title || "Supervisor feedback";
      completeActivity("Saved feedback opened.", "Its work stays separate from your other supervisor comments.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action.startsWith("trace-claim:")) {
    if (!state.feedbackThreadId) return;
    const sourceId = action.slice("trace-claim:".length);
    beginActivity("claim-traceback", "Tracing the grounded source note…", "Reading its canonical evidence, approval, and feedback trail.", action);
    try {
      const response = await fetch(`/api/workflow/claim-traceback?feedbackThreadId=${encodeURIComponent(state.feedbackThreadId)}&sourceId=${encodeURIComponent(sourceId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The source-note traceback could not be created.");
      state.claimTraceback = payload;
      completeActivity("Claim traceback ready.", "The source note is linked to its evidence, task approval, and feedback.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "start-onboarding") { state.onboardingStep = 1; saveState(); return render(); }
  if (action.startsWith("onboarding-next:")) { state.onboardingStep = Number(action.split(":")[1]); saveState(); return render(); }
  if (action === "finish-onboarding") { state.onboardingStep = 0; state.view = "overview"; state.setupCollapsed = false; saveState(); location.hash = "overview"; return render(); }
  if (action === "toggle-setup") { state.setupCollapsed = !state.setupCollapsed; saveState(); return render(); }
  if (action === "open-profile") return setView("profile");
  if (action === "reconcile-seed-references") {
    if (state.workflowBusy) return;
    beginActivity("seed-references", "Checking proposed references in Zotero…", "This is advisory and does not change your profile or library.", action);
    try {
      const response = await fetch("/api/project/seed-references/reconcile", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Reference reconciliation could not be completed.");
      state.seedReferenceReport = payload.report;
      completeActivity("Reference check ready.", `${payload.report.present.length} present, ${payload.report.missing.length} missing, ${payload.report.ambiguous.length} ambiguous.`);
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "new-feedback" || action === "focus-feedback") {
    state.feedbackThreadId = null;
    state.feedbackTitle = "";
    state.feedback = "";
    state.workflowError = "";
    state.view = "feedback";
    saveState();
    location.hash = "feedback";
    render();
    queueMicrotask(() => document.querySelector("#feedback-text")?.focus({ preventScroll: true }));
    document.querySelector("#feedback-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (action === "unassign-feedback-placement") {
    const feedbackThreadId = state.feedbackThreadId;
    if (!feedbackThreadId || !state.projectState) return;
    beginActivity("feedback-placement", "Removing feedback placement…", "This does not change your thesis profile stage.", action);
    try {
      const response = await fetch("/api/project/feedback/placement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackThreadId, status: "unassigned", expectedRevision: state.projectState.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The placement could not be updated.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      applyCanonicalWorkflow(payload.workflow);
      completeActivity("Placement left unassigned.", "The feedback remains saved and can be placed later.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "open-library") return setView("evidence");
  if (action === "open-evidence-notes") return setView("notes");
  if (action.startsWith("open-workspace-tool:")) {
    const tool = action.slice("open-workspace-tool:".length);
    if (state.workflowBusy) return;
    beginActivity("workspace-handoff", `Opening ${tool}…`, "Opening the configured workspace; Proofline is not writing any files.", action);
    try {
      const launched = await openTaskTool(tool);
      completeActivity(`${launched.application} opened.`, "The linked workspace remains unchanged.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action.startsWith("open-task:")) return openTask(action.slice("open-task:".length));
  if (action.startsWith("open-task-tool:")) {
    const task = getTask(action.slice("open-task-tool:".length));
    if (!task || state.workflowBusy) return;
    beginActivity("workspace-handoff", `Opening ${task.tool}…`, "Opening the linked local workspace; Proofline is not writing any files.", action);
    try {
      const launched = await openTaskTool(task);
      completeActivity(`${launched.application} opened.`, "The task remains approved in Proofline.");
    } catch (error) {
      failActivity(error, action);
    }
    saveState();
    return render();
  }
  if (action.startsWith("approve-and-open:")) {
    const taskId = action.slice("approve-and-open:".length);
    const task = getTask(taskId);
    if (!task || state.workflowBusy) return;
    beginActivity("workspace-handoff", `Approving and opening ${task.tool}…`, "Saving your approval first, then opening the linked local workspace.", action);
    try {
      const response = await fetch("/api/workflow/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.feedbackThreadId
          ? { feedbackThreadId: state.feedbackThreadId, taskId, decision: "approved", expectedRevision: state.projectState.revision }
          : { taskGraph: state.taskGraph, state: state.thesisState, taskId, decision: "approved" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The task could not be approved.");
      state.taskGraph = payload.taskGraph;
      state.thesisState = payload.state;
      if (payload.state?.schemaVersion === 3) state.projectState = payload.state;
      state.tasks = payload.taskGraph.tasks;
      const launched = await openTaskTool(getTask(taskId));
      completeActivity(`Approved and opened ${launched.application}.`, "No files were changed by Proofline.");
    } catch (error) {
      failActivity(error, action);
    }
    saveState();
    return render();
  }
  if (action === "open-literature-task") {
    const literatureTask = state.tasks.find((task) => task.kind === "literature");
    if (literatureTask) return openTask(literatureTask.id);
    return setView("overview");
  }
  if (action === "connect-zotero") return connectZotero();
  if (action === "use-demo-library") return connectDemoLibrary();
  if (action === "choose-vscode-folder") {
    if (state.workflowBusy) return;
    beginActivity("workspace-picker", "Opening the VS Code folder picker…", "Choose the local folder you want VS Code to open for this project.", action);
    try {
      const response = await fetch("/api/workspace/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "vscode", mode: "existing", expectedRevision: state.projectState?.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The VS Code folder could not be configured.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      completeActivity("VS Code folder linked.", "It will open when you continue a VS Code task.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "create-vscode-folder") {
    const name = window.prompt("New code folder name", `${state.project || "research"}-code`);
    if (!name?.trim() || state.workflowBusy) return;
    beginActivity("workspace-picker", "Opening the code workspace picker…", "Choose a parent folder; Proofline will create the named code folder inside it.", action);
    try {
      const response = await fetch("/api/workspace/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "vscode", mode: "create", name: name.trim(), expectedRevision: state.projectState?.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The code folder could not be created.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      completeActivity("Code workspace created.", "A README was added and VS Code now opens this folder for the project.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "set-overleaf-url") {
    const current = state.projectState?.project?.overleafUrl || "";
    const overleafUrl = window.prompt("Overleaf project URL", current);
    if (overleafUrl === null || state.workflowBusy || !state.projectState) return;
    beginActivity("workspace-handoff", "Saving the Overleaf project URL…", "This stores a link only; it does not connect or sync Overleaf.", action);
    try {
      const response = await fetch("/api/project/paths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overleafUrl: overleafUrl.trim() || null, expectedRevision: state.projectState.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Overleaf project URL could not be saved.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      completeActivity(overleafUrl.trim() ? "Overleaf URL saved." : "Overleaf URL removed.", "Proofline will open it in your browser when requested.");
    } catch (error) { failActivity(error, action); }
    saveState();
    return render();
  }
  if (action === "choose-existing-vault" || action === "create-obsidian-vault" || action === "change-obsidian-vault") {
    const mode = action === "create-obsidian-vault" ? "create" : "existing";
    const name = mode === "create" ? window.prompt("New vault name", state.project || "Proofline") : undefined;
    if (mode === "create" && !name?.trim()) return;
    beginActivity("vault-picker", "Opening the Obsidian vault picker…", "Choose an existing folder or create a new project vault.", action);
    try {
      const response = await fetch("/api/obsidian/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, ...(name ? { name: name.trim() } : {}), ...(state.projectState ? { expectedRevision: state.projectState.revision } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Obsidian vault could not be configured.");
      state.obsidianVaultPath = payload.vault.path;
      if (payload.state?.schemaVersion === 3) state.projectState = payload.state;
      if (payload.readiness) state.profileReadiness = payload.readiness;
      state.noteWrite = null;
      completeActivity(mode === "create" ? "Research vault created." : "Obsidian vault connected.", "Notes will be saved in its 10_Literature_Notes folder.");
    } catch (error) {
      failActivity(error, action);
    }
    saveState();
    return render();
  }
  if (action.startsWith("select-zotero:")) return selectZotero(action.slice("select-zotero:".length));
  if (action === "clear-search") { state.candidates = []; state.searchArtifact = null; state.searchQuery = ""; state.selectedSourceIds = []; saveState(); return render(); }
  if (action.startsWith("toggle-evidence:")) {
    const sourceId = action.slice("toggle-evidence:".length);
    state.selectedSourceIds = state.selectedSourceIds.includes(sourceId)
      ? state.selectedSourceIds.filter((id) => id !== sourceId)
      : [...state.selectedSourceIds, sourceId];
    saveState();
    return render();
  }
  if (action === "attach-evidence") {
    if (state.workflowBusy) return;
    beginActivity("evidence-attach", "Attaching the selected evidence…", "Preparing the note workflow.", "search-zotero");
    try {
      const selectedIds = new Set(state.selectedSourceIds);
      const selectedSearchArtifact = {
        ...state.searchArtifact,
        candidates: state.searchArtifact.candidates.filter((candidate) => selectedIds.has(candidate.sourceId))
      };
      const literatureTask = state.tasks.find((task) => task.id === selectedSearchArtifact.taskId)
        ?? state.tasks.find((task) => task.kind === "literature" && task.approvalStatus === "approved");
      if (!literatureTask) throw new Error("An approved literature task is required before attaching evidence.");
      const response = await fetch("/api/workflow/evidence/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.feedbackThreadId ? {
          feedbackThreadId: state.feedbackThreadId,
          taskId: literatureTask.id,
          expectedRevision: state.projectState.revision,
          ...(state.connection.mode === "demo" ? { mode: "demo" } : {}),
          ...(state.searchArtifact?.query || state.searchQuery ? { query: state.searchArtifact?.query ?? state.searchQuery } : {}),
          sourceIds: state.selectedSourceIds
        } : { taskGraph: state.taskGraph, searchArtifact: selectedSearchArtifact, sourceIds: state.selectedSourceIds })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The selected evidence could not be attached.");
      if (payload.state?.schemaVersion === 3) state.projectState = payload.state;
      if (payload.workflow) applyCanonicalWorkflow(payload.workflow);
      else {
        state.taskGraph = payload.taskGraph;
        state.tasks = payload.taskGraph.tasks;
        state.evidenceSelection = payload.selection;
        state.evidenceRefs = payload.selection.evidenceRefs;
        state.noteDraft = null;
        state.notePreview = null;
        state.claimTraceback = null;
      }
      state.noteWrite = null;
      state.view = "notes";
      state.activity = { ...state.activity, recoveryAction: null };
    } catch (error) {
      failActivity(error, "search-zotero");
    } finally {
      saveState();
      if (state.activity.status === "active") completeActivity("Evidence attached.", "Review the selected sources, then draft or preview the note.");
    }
    return;
  }
  if (action === "draft-evidence-note") {
    if (state.workflowBusy) return;
    beginActivity("codex-draft", "Codex CLI is drafting from the selected evidence…", "Only the selected papers and feedback are being used.", "draft-evidence-note");
    try {
      const literatureTask = state.tasks.find((task) => task.kind === "literature" && task.approvalStatus === "approved");
      if (!literatureTask) throw new Error("An approved literature task is required before drafting.");
      const draftResponse = await fetch("/api/workflow/notes/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.feedbackThreadId ? {
          feedbackThreadId: state.feedbackThreadId,
          taskId: literatureTask.id,
          expectedRevision: state.projectState.revision,
          approvedExternalProcessing: true,
          provider: "codex"
        } : { feedback: state.feedback, evidenceRefs: state.evidenceRefs, approvedExternalProcessing: true, provider: "codex" })
      });
      const draft = await draftResponse.json();
      if (!draftResponse.ok) throw new Error(draft.message || "The grounded draft could not be created.");
      if (draft.state?.schemaVersion === 3 && draft.workflow) {
        state.projectState = draft.state;
        applyCanonicalWorkflow(draft.workflow);
      } else {
        updateActivity("Building the grounded note preview…", "No filesystem write has happened.");
        const previewResponse = await fetch("/api/workflow/notes/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: state.project, feedback: state.feedback, evidenceRefs: state.evidenceRefs, draft })
        });
        const preview = await previewResponse.json();
        if (!previewResponse.ok) throw new Error(preview.message || "The grounded note preview could not be created.");
        state.noteDraft = draft;
        state.notePreview = preview;
        state.claimTraceback = null;
      }
    } catch (error) {
      failActivity(error, "draft-evidence-note");
    } finally {
      saveState();
      if (state.activity.status === "active") completeActivity("Grounded note ready.", "Review the Markdown preview before approving any write.");
    }
    return;
  }
  if (action === "preview-obsidian-note") {
    if (state.workflowBusy) return;
    beginActivity("note-preview", "Building the grounded note preview…", "No filesystem write has happened.", "preview-obsidian-note");
    state.noteDraft = null;
    state.claimTraceback = null;
    try {
      const literatureTask = state.tasks.find((task) => task.kind === "literature" && task.approvalStatus === "approved");
      if (state.feedbackThreadId && !literatureTask) throw new Error("An approved literature task is required before previewing a note.");
      const response = await fetch("/api/workflow/notes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.feedbackThreadId
          ? { feedbackThreadId: state.feedbackThreadId, taskId: literatureTask.id }
          : { project: state.project, feedback: state.feedback, evidenceRefs: state.evidenceRefs, draft: null })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Obsidian note preview could not be created.");
      state.notePreview = payload;
      state.claimTraceback = null;
    } catch (error) {
      failActivity(error, "preview-obsidian-note");
    }
    saveState();
    if (state.activity.status === "active") completeActivity("Preview ready.", "Review the Markdown before choosing a vault and approving the write.");
    return render();
  }
  if (action === "write-obsidian-note") {
    if (state.workflowBusy) return;
    beginActivity("vault-write", "Saving the approved note to Obsidian…", "Writing only inside the configured Evidence folder.", "write-obsidian-note");
    try {
      const response = await fetch("/api/workflow/notes/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath: state.obsidianVaultPath, preview: state.notePreview, approved: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Obsidian note could not be written.");
      state.noteWrite = payload;
    } catch (error) {
      failActivity(error, "write-obsidian-note");
    }
    saveState();
    if (state.activity.status === "active") completeActivity("Note saved to Obsidian.", state.noteWrite?.path ? `Saved to ${state.noteWrite.path}` : "The approved note is now in your vault.");
    return render();
  }
  if (action === "export-json") {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, provider: "zotero-local", access: "read-only", library: state.connection.library, paperCount: state.connection.paperCount, papers: state.papers }, null, 2)], { type: "application/json" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "zotero-library.json" });
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  if (action === "preview-response-matrix" || action === "export-response-matrix") {
    if (state.workflowBusy) return;
    const download = action === "export-response-matrix";
    beginActivity("response-matrix", download ? "Preparing the Markdown file…" : "Preparing the review-trail preview…", "Reading the canonical approval and evidence trail.", action);
    try {
      const response = await fetch("/api/revision-response-matrix");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The revision response matrix could not be created.");
      state.responseMatrix = payload;
      if (download) {
        const blob = new Blob([payload.markdown], { type: "text/markdown;charset=utf-8" });
        const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "thesisos-revision-response-matrix.md" });
        link.click();
        URL.revokeObjectURL(link.href);
        completeActivity("Markdown file downloaded.", "You can share it when your supervisor needs a portable copy.");
      } else completeActivity("Review trail preview ready.", `${payload.rows.length} task${payload.rows.length === 1 ? "" : "s"} shown from the saved approval trail.`);
    } catch (error) {
      failActivity(error, action);
    }
    saveState();
    return render();
  }
  if (action.startsWith("approve-task:") || action.startsWith("reject-task:")) {
    const [verb, taskId] = action.split(":");
    if (state.workflowBusy) return;
    beginActivity("task-review", "Saving your review decision…", "Updating the local task state.", `open-literature-task`);
    try {
      const response = await fetch("/api/workflow/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.feedbackThreadId ? { feedbackThreadId: state.feedbackThreadId, taskId, decision: verb === "approve-task" ? "approved" : "rejected", expectedRevision: state.projectState.revision } : { taskGraph: state.taskGraph, state: state.thesisState, taskId, decision: verb === "approve-task" ? "approved" : "rejected" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The review decision could not be applied.");
      state.taskGraph = payload.taskGraph;
      state.thesisState = payload.state;
      if (payload.state?.schemaVersion === 3) state.projectState = payload.state;
      state.tasks = payload.taskGraph.tasks;
      const shouldSearchLiterature = verb === "approve-task" && state.tasks.find((task) => task.id === taskId)?.kind === "literature" && state.connection.status === "connected";
      closeTaskModal();
      saveState();
      if (shouldSearchLiterature) {
        // The approval request owns the busy flag until its response arrives. Release it before
        // handing off to the search action, which correctly refuses to start while busy.
        state.workflowBusy = false;
        state.workflowStatus = "";
        return handleAction("search-zotero");
      }
      completeActivity("Review decision saved.", "The task graph now reflects your approval boundary.");
      render();
    } catch (error) {
      failActivity(error, `open-literature-task`);
      closeTaskModal();
      openTask(taskId);
    }
    return;
  }
  if (action === "search-zotero") {
    if (state.workflowBusy) return;
    beginActivity("zotero-search", "Searching Zotero for the approved task…", "Ranking read-only library metadata.", "search-zotero");
    closeTaskModal();
    try {
      const response = await fetch("/api/workflow/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskGraph: state.taskGraph, mode: state.connection.mode, ...(state.feedbackThreadId ? { feedbackThreadId: state.feedbackThreadId } : {}), ...(state.searchQuery ? { query: state.searchQuery } : {}) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Zotero search failed.");
      state.searchArtifact = payload;
      state.candidates = payload.candidates || [];
      state.selectedSourceIds = [];
      state.evidenceSelection = null;
      state.evidenceRefs = [];
      state.noteDraft = null;
      state.notePreview = null;
      state.claimTraceback = null;
      state.noteWrite = null;
      state.view = "evidence";
    } catch (error) {
      failActivity(error, "search-zotero");
    } finally {
      saveState();
      if (state.activity.status === "active") completeActivity("Zotero search complete.", `${state.candidates.length} candidate papers are ready for review.`);
    }
  }
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) return setView(view);
  const taskId = event.target.closest("[data-task]")?.dataset.task;
  if (taskId) return openTask(taskId);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action) return handleAction(action);
  if (event.target.closest("[data-close-modal]")) closeTaskModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !document.querySelector(".modal-backdrop")) return;
  event.preventDefault();
  closeTaskModal();
});

document.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-drop-zone]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.add("is-dragging");
});

document.addEventListener("dragleave", (event) => event.target.closest("[data-drop-zone]")?.classList.remove("is-dragging"));

document.addEventListener("drop", (event) => {
  const zone = event.target.closest("[data-drop-zone]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("is-dragging");
  const file = event.dataTransfer?.files?.[0];
  const input = zone.querySelector('input[type="file"]');
  if (!file || !input) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  zone.querySelector("[data-file-label]").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
});

document.addEventListener("change", (event) => {
  if (!event.target.matches('input[type="file"][name="document"]')) return;
  const file = event.target.files?.[0];
  if (file) event.target.closest("[data-drop-zone]").querySelector("[data-file-label]").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
});

app.addEventListener("submit", async (event) => {
  if (event.target.id === "workspace-settings-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    const userName = data.get("userName")?.toString().trim();
    const project = data.get("project")?.toString().trim();
    if (!userName || !project || !state.projectState) return;
    beginActivity("settings", "Saving workspace settings…", "Updating your local profile and workspace name.");
    try {
      const response = await fetch("/api/project/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, expectedRevision: state.projectState.revision })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The workspace name could not be updated.");
      state.userName = userName;
      state.project = payload.state.project.name;
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      saveState();
      completeActivity("Settings saved.", "Your display name and workspace name are now updated across Proofline.");
    } catch (error) { failActivity(error); }
    return render();
  }
  const profileForms = new Set(["project-init-form", "document-import-form", "profile-propose-form", "profile-review-form", "profile-form", "manuscript-link-form"]);
  if (profileForms.has(event.target.id)) {
    event.preventDefault();
    const data = new FormData(event.target);
    const expectedRevision = state.projectState?.revision;
    let endpoint;
    let body;
    if (event.target.id === "project-init-form") {
      endpoint = "/api/project/init";
      body = { project: data.get("project")?.toString().trim(), thesisDir: data.get("thesisDir")?.toString().trim(), vaultPath: data.get("vaultPath")?.toString().trim() };
    } else if (event.target.id === "document-import-form") {
      const file = data.get("document");
      if (!(file instanceof File) || !file.size) return;
      endpoint = "/api/project/documents/upload";
      body = { filename: file.name, contentBase64: await fileToBase64(file), expectedRevision };
    } else if (event.target.id === "profile-propose-form") {
      endpoint = "/api/project/profile/propose";
      body = { documentId: data.get("documentId"), provider: data.get("provider") || "codex", approvedExternalProcessing: true, expectedRevision };
    } else if (event.target.id === "profile-review-form") {
      endpoint = "/api/project/profile/review";
      const accepted = new Set(data.getAll("field").map(String));
      body = { expectedRevision, decisions: Object.fromEntries(Object.keys(state.projectState.profileProposal.fields).map((field) => [field, { action: accepted.has(field) ? "accept" : "reject" }])) };
    } else if (event.target.id === "manuscript-link-form") {
      endpoint = "/api/project/paths";
      body = { thesisDir: data.get("thesisDir")?.toString().trim() || null, expectedRevision };
    } else {
      endpoint = "/api/project/profile/answers";
      const scopeName = data.get("scopeName")?.toString().trim();
      body = { expectedRevision, selectedScope: { id: `scope-${scopeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, name: scopeName, summary: data.get("scopeSummary")?.toString().trim() || "" }, stage: data.get("stage") };
    }
    state.activeProfileForm = event.target.id;
    beginActivity("profile", "Updating the thesis profile…", "Validating canonical project context.");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The thesis profile could not be updated.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      state.project = payload.state.project.name;
      if (event.target.id === "project-init-form") state.onboardingStep = 3;
      if (event.target.id === "document-import-form" && state.onboardingStep) state.onboardingStep = 4;
      if (event.target.id === "manuscript-link-form" && state.onboardingStep) state.onboardingStep = 6;
      if (event.target.id === "profile-form" && state.onboardingStep) state.onboardingStep = 7;
      saveState();
      completeActivity(state.profileReadiness.ready ? "Thesis profile ready." : "Profile progress saved.", state.profileReadiness.ready ? "Context-aware feedback is unlocked." : "Continue with the missing profile fields.");
    } catch (error) { failActivity(error, "open-profile"); }
    state.activeProfileForm = null;
    return render();
  }
  if (event.target.id === "literature-search-form") {
    event.preventDefault();
    const data = new FormData(event.target);
    state.searchQuery = data.get("query")?.toString().trim() || "";
    if (state.searchQuery) return handleAction("search-zotero");
    return;
  }
  if (event.target.id === "feedback-placement-form") {
    event.preventDefault();
    if (!state.projectState || state.workflowBusy) return;
    const data = new FormData(event.target);
    const feedbackThreadId = data.get("feedbackThreadId")?.toString();
    const targetLocationId = data.get("targetLocationId")?.toString();
    beginActivity("feedback-placement", "Saving feedback placement…", "This placement guides this feedback only; your thesis profile remains unchanged.");
    try {
      const response = await fetch("/api/project/feedback/placement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedbackThreadId, stage: data.get("stage")?.toString(), targetLocationIds: targetLocationId ? [targetLocationId] : [], expectedRevision: state.projectState.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The placement could not be saved.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      applyCanonicalWorkflow(payload.workflow);
      completeActivity("Feedback placement confirmed.", "Future task and literature work for this feedback can use the confirmed stage and section.");
    } catch (error) { failActivity(error); }
    saveState();
    return render();
  }
  if (event.target.id !== "feedback-form") return;
  event.preventDefault();
  const data = new FormData(event.target);
  state.feedbackTitle = data.get("title")?.toString().trim() || "Supervisor feedback";
  state.feedback = data.get("feedback")?.toString().trim() || "";
  state.workflowProvider = state.connection.mode === "demo" ? "offline" : data.get("provider")?.toString() || "codex";
  if (!state.feedback) return;
  if (state.workflowBusy) return;
  if (state.projectState && !state.profileReadiness.ready) {
    beginActivity("feedback-capture", "Saving the original feedback…", "Task generation waits for approved thesis context.");
    try {
      const response = await fetch("/api/project/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: state.feedbackTitle, feedback: state.feedback, expectedRevision: state.projectState.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The feedback could not be saved.");
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      state.feedbackThreadId = payload.feedbackThread.id;
      saveState();
      completeActivity("Feedback saved.", "Add thesis context when you are ready to generate specific tasks.");
    } catch (error) { failActivity(error); }
    return render();
  }
  beginActivity("task-graph", state.workflowProvider === "offline" ? "Building your deterministic task graph…" : "Codex CLI is building your task graph…", "Validating proposed tasks before review.");
  saveState();
  try {
    let capturedThread = state.projectState?.feedbackThreads?.find((thread) => thread.id === state.feedbackThreadId && !thread.tasks?.length);
    if (state.projectState && !capturedThread) {
      const captureResponse = await fetch("/api/project/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: state.feedbackTitle, feedback: state.feedback, expectedRevision: state.projectState.revision }) });
      const capturePayload = await captureResponse.json();
      if (!captureResponse.ok) throw new Error(capturePayload.message || "The feedback could not be saved.");
      state.projectState = capturePayload.state;
      state.profileReadiness = capturePayload.readiness;
      state.feedbackThreadId = capturePayload.feedbackThread.id;
      capturedThread = capturePayload.feedbackThread;
      if (capturePayload.deduplication !== "new" && capturedThread.tasks?.length) {
        const workflowResponse = await fetch(`/api/workflow?feedbackThreadId=${encodeURIComponent(capturedThread.id)}`);
        const workflowPayload = await workflowResponse.json();
        if (!workflowResponse.ok) throw new Error(workflowPayload.message || "The existing feedback could not be opened.");
        state.projectState = workflowPayload.state;
        state.profileReadiness = workflowPayload.readiness;
        applyCanonicalWorkflow(workflowPayload.workflow);
        state.view = "tasks";
        completeActivity(capturePayload.deduplication === "already_saved" ? "That feedback is already saved." : "Follow-up merged into the original feedback.", "Showing the existing task plan instead of creating a duplicate.");
        return;
      }
    }
    const response = await fetch("/api/workflow/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: state.feedback, title: state.feedbackTitle, project: state.project, provider: state.workflowProvider, ...(capturedThread ? { feedbackThreadId: capturedThread.id } : {}), ...(state.projectState ? { expectedRevision: state.projectState.revision } : {}) })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "The workflow could not create tasks.");
    state.taskGraph = payload.taskGraph;
    state.thesisState = payload.state;
    if (payload.state?.schemaVersion === 3) {
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      state.feedbackThreadId = capturedThread?.id || payload.state.feedbackThreads.at(-1)?.id || null;
    }
    state.runtime = payload.runtime;
    state.tasks = payload.taskGraph.tasks;
    state.searchArtifact = null;
    state.searchQuery = "";
    state.candidates = [];
    state.selectedSourceIds = [];
    state.evidenceSelection = null;
    state.evidenceRefs = [];
    state.noteDraft = null;
    state.notePreview = null;
    state.claimTraceback = null;
    state.noteWrite = null;
    state.view = "tasks";
  } catch (error) {
    failActivity(error);
  } finally {
    saveState();
    if (state.activity.status === "active") completeActivity("Task graph ready for review.", `${state.tasks.length} proposed task${state.tasks.length === 1 ? "" : "s"} await your approval.`);
  }
});

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#", "");
  if (["overview", "profile", "feedback", "tasks", "evidence", "notes", "integrations", "settings", "about"].includes(view) && state.view !== view) { state.view = view; saveState(); render(); }
});
const initialView = location.hash.replace("#", "");
if (["overview", "profile", "feedback", "tasks", "evidence", "notes", "integrations", "settings", "about"].includes(initialView)) state.view = initialView;
render();
fetch("/api/project").then((response) => response.json()).then((payload) => {
  if (payload.initialized) {
    state.projectState = payload.state;
    state.profileReadiness = payload.readiness;
    state.project = payload.state.project.name;
    state.feedbackTitle = payload.state.feedbackThreads.at(-1)?.title || state.feedbackTitle;
    if (payload.workflow) applyCanonicalWorkflow(payload.workflow);
    saveState();
    render();
  } else { state.projectState = null; render(); }
}).catch(() => {});
fetch("/api/obsidian/status").then((response) => response.json()).then((payload) => {
  if (payload.vault?.path) { state.obsidianVaultPath = payload.vault.path; saveState(); if (state.view === "notes") render(); }
}).catch(() => {});
connectZotero();
