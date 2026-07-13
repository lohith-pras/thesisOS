const STORAGE_KEY = "thesisos-ui-state-v2";

const defaultState = {
  view: "overview",
  project: "Thesis workspace",
  feedback: "",
  feedbackTitle: "",
  tasks: [],
  taskGraph: null,
  thesisState: null,
  runtime: null,
  workflowProvider: "codex",
  workflowBusy: false,
  workflowError: "",
  searchArtifact: null,
  candidates: [],
  selectedSourceIds: [],
  evidenceSelection: null,
  evidenceRefs: [],
  notePreview: null,
  noteWrite: null,
  obsidianVaultPath: "",
  papers: [],
  connection: { status: "checking", mode: null, access: null, library: null, libraries: [], paperCount: 0, message: "Checking for Zotero Desktop…" }
};

let state = loadState();
const app = document.querySelector("#app");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...structuredClone(defaultState), ...saved, papers: [], connection: structuredClone(defaultState.connection) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  const { papers: _papers, connection: _connection, ...persistent } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
}

function esc(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
function setView(view) { state.view = view; saveState(); location.hash = view; render(); }
function getTask(id) { return state.tasks.find((task) => task.id === id); }
function statusLabel(value = "") { return value.replaceAll("_", " "); }
function icon(name) { return ({ overview: "⌂", feedback: "⌁", tasks: "✓", evidence: "▤", integrations: "⌘", settings: "⚙" })[name] || "·"; }
function button(label, action, kind = "dark", disabled = false) { return `<button class="button button-${kind}" data-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`; }
function eyebrow(text) { return `<p class="eyebrow"><i></i>${text}</p>`; }
function emptyState(title, copy, action = "", label = "") { return `<section class="empty-state panel"><span class="empty-mark">◇</span><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>${action ? button(label, action, "outline") : ""}</section>`; }

function connectionLabel() {
  if (state.connection.status === "connected" && state.connection.mode === "demo") return "Demo data · clearly labelled fixture";
  if (state.connection.status === "connected") return `Zotero connected · ${state.connection.mode}`;
  if (state.connection.status === "checking") return "Checking Zotero Desktop";
  if (state.connection.status === "selection_required") return "Zotero library choice required";
  return "Zotero not connected";
}

function shell(content) {
  const nav = [["overview", "Overview"], ["feedback", "Feedback"], ["tasks", "Tasks"], ["evidence", "Library"], ["integrations", "Connections"]];
  const pending = state.tasks.filter((task) => task.approvalStatus === "pending").length;
  const connected = state.connection.status === "connected";
  return `<aside class="sidebar">
    <a class="brand" href="/">ThesisOS<span>.</span></a>
    <div class="brand-subtitle">LOCAL-FIRST RESEARCH WORKSPACE</div>
    <div class="sidebar-rule"></div>
    <nav class="main-nav" aria-label="Workspace navigation">${nav.map(([id, label]) => `<button class="nav-item ${state.view === id ? "active" : ""}" data-view="${id}"><span class="nav-glyph">${icon(id)}</span>${label}${id === "tasks" && pending ? `<b class="nav-count">${pending}</b>` : ""}</button>`).join("")}</nav>
    <div class="sidebar-rule"></div>
    <div class="sidebar-block"><span class="label">CURRENT PROJECT</span><strong>${esc(state.project)}</strong><span class="project-status"><i></i> Stored on this machine</span></div>
    <div class="sidebar-bottom"><button class="nav-item ${state.view === "settings" ? "active" : ""}" data-view="settings"><span class="nav-glyph">${icon("settings")}</span>Settings</button><div class="profile"><span class="avatar">TS</span><span><strong>Local workspace</strong><small>No account required</small></span></div></div>
  </aside><main class="main-content"><header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${esc(pageTitle())}</strong></div><div class="topbar-actions"><button class="connection connection-button ${connected ? "connected" : state.connection.status}" data-view="integrations"><i></i>${esc(connectionLabel())}</button></div></header><div class="page-content">${content}</div></main>`;
}

function pageTitle() { return ({ overview: "Overview", feedback: "Feedback intake", tasks: "Task review", evidence: "Zotero library", integrations: "Connections", settings: "Settings" })[state.view] || "Overview"; }

function overview() {
  const connected = state.connection.status === "connected";
  const pending = state.tasks.filter((task) => task.approvalStatus === "pending").length;
  const feedbackCard = state.feedback
    ? `<article class="feedback-card panel"><div class="panel-head"><span class="label">CURRENT SUPERVISOR FEEDBACK</span><span class="timestamp">Saved locally</span></div><blockquote>“${esc(state.feedback)}”</blockquote><div class="byline">User-provided feedback <span>Ready for review</span></div><button class="card-link" data-view="feedback">Edit feedback <span>→</span></button></article>`
    : `<article class="feedback-card panel empty-card"><div class="panel-head"><span class="label">SUPERVISOR FEEDBACK</span><span class="timestamp">No entry yet</span></div><h2>Add the comment you need to act on.</h2><p>ThesisOS keeps the original wording beside every proposed task.</p><button class="card-link" data-view="feedback">Add feedback <span>→</span></button></article>`;
  return `<div class="page-intro">${eyebrow("Workspace / baseline")}<h1>Start from what is real.</h1><p>Connect your reference library, add supervisor feedback, and keep every next action traceable to its source.</p><div class="intro-actions">${connected ? button("Open Zotero library →", "open-library") : button("Connect Zotero Desktop", "connect-zotero")}<button class="text-button" data-view="feedback">Add feedback <span>↗</span></button></div></div>
    <section class="overview-grid">${feedbackCard}<article class="status-card panel"><div class="panel-head"><span class="label">WORKSPACE STATUS</span><span class="status-live ${connected ? "" : "neutral"}"><i></i>${connected ? "Connected" : "Setup"}</span></div><div class="status-number">${connected ? state.connection.paperCount : "—"}</div><p>${connected ? "bibliographic papers available from Zotero" : "Connect Zotero to load your papers"}</p><div class="status-rule"></div><div class="status-row"><span>Library</span><strong>${connected ? esc(state.connection.library?.name || state.connection.library?.id) : "Not selected"}</strong></div><div class="status-row"><span>Access boundary</span><strong class="green">${connected ? "Read-only" : "No access"}</strong></div><div class="status-row"><span>Tasks awaiting review</span><strong>${pending}</strong></div></article></section>
    <section class="section-block"><div class="section-heading"><div><span class="label">NEXT ACTIONS</span><h2>Build the workspace in order.</h2></div></div><div class="setup-sequence"><article><b>01</b><strong>Connect Zotero</strong><span>${connected ? `${state.connection.paperCount} papers loaded` : "Use the running desktop app"}</span></article><article><b>02</b><strong>Add feedback</strong><span>${state.feedback ? "Feedback saved locally" : "Paste the exact supervisor note"}</span></article><article><b>03</b><strong>Review tasks</strong><span>${state.tasks.length ? `${state.tasks.length} proposed tasks` : "Nothing runs without approval"}</span></article></div></section>`;
}

function feedback() {
  return `<div class="page-intro compact">${eyebrow("Feedback / source")}<h1>Keep the original wording.</h1><p>Add a real supervisor comment. ThesisOS converts it into a validated task graph before any connector can run.</p></div><section class="feedback-layout"><form class="feedback-form panel" id="feedback-form"><label for="feedback-title">Feedback title</label><input id="feedback-title" name="title" value="${esc(state.feedbackTitle)}" placeholder="For example: Section 3.2 revisions" /><label for="feedback-text">Supervisor feedback</label><textarea id="feedback-text" name="feedback" rows="8" placeholder="Paste the exact feedback here." required>${esc(state.feedback)}</textarea><label for="workflow-provider">Decomposition runtime</label><select id="workflow-provider" name="provider"><option value="codex"${state.workflowProvider === "codex" ? " selected" : ""}>Codex CLI · uses local login</option><option value="offline"${state.workflowProvider === "offline" ? " selected" : ""}>Offline · deterministic fallback</option><option value="openai"${state.workflowProvider === "openai" ? " selected" : ""}>OpenAI · GPT-5.6 API</option></select><p class="helper">Codex and OpenAI receive the feedback text you submit. No workflow writes to Zotero, Obsidian, Overleaf, or Git at this stage.</p>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="form-footer"><span class="read-only-note"><i></i> Validated task artifact</span>${button(state.workflowBusy ? "Creating tasks…" : state.feedback ? "Update review tasks →" : "Create review tasks →", "analyze-feedback", "dark", state.workflowBusy)}</div></form><aside class="side-note"><span class="label">WHAT HAPPENS NEXT</span><ol><li><b>01</b><span>The selected runtime decomposes only the submitted feedback.</span></li><li><b>02</b><span>The server validates the task graph and local thesis state.</span></li><li><b>03</b><span>Every proposed task begins pending your approval.</span></li></ol></aside></section>`;
}

function taskRow(task) { return `<button class="task-row" data-task="${task.id}"><span class="task-mark ${task.approvalStatus}">${task.approvalStatus === "approved" ? "✓" : ""}</span><span class="task-copy"><strong>${esc(task.title)}</strong><small>${esc(task.tool)} · ${statusLabel(task.status)}</small></span><span class="task-state ${task.approvalStatus}">${statusLabel(task.approvalStatus)}</span><span class="arrow">→</span></button>`; }

function tasks() {
  if (!state.tasks.length) return `<div class="page-intro compact">${eyebrow("Review / tasks")}<h1>No inferred work yet.</h1><p>Add supervisor feedback first. Tasks will appear here for approval before an integration can run.</p></div>${emptyState("No tasks to review", "The workspace will not invent tasks without a source comment.", "new-feedback", "Add feedback")}`;
  return `<div class="page-intro compact">${eyebrow("Review / tasks")}<h1>Approve the boundary.</h1><p>These tasks came from the validated ${esc(state.runtime?.provider || "workflow")} artifact. Approval changes their state; it does not yet execute write integrations.</p></div><section class="task-layout"><div class="task-graph panel"><div class="panel-head"><span class="label">SOURCE FEEDBACK</span><span class="timestamp">${state.runtime ? `${esc(state.runtime.provider)} · ${esc(state.runtime.model)}` : "Stored locally"}</span></div><blockquote>“${esc(state.feedback)}”</blockquote><div class="graph-line"></div>${state.tasks.map((task, index) => `<button class="graph-task ${task.approvalStatus}" data-task="${task.id}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(task.title)}</strong><small>${esc(task.tool)} · ${statusLabel(task.approvalStatus)}</small><b>→</b></button>`).join("")}</div><aside class="approval-panel"><span class="label">APPROVAL MODEL</span><h2>Review first.<br />Run second.</h2><p>Zotero library access is read-only. Any future note, thesis, or Git write will require a separate explicit approval.</p><div class="approval-box"><i>✓</i><span>Approved tasks<br /><strong>${state.tasks.filter((task) => task.approvalStatus === "approved").length} of ${state.tasks.length}</strong></span></div></aside></section>`;
}

function paperCard(paper, index) {
  const destination = paper.doi ? `https://doi.org/${encodeURIComponent(paper.doi)}` : paper.url;
  const selectable = state.candidates.some((candidate) => candidate.sourceId === paper.sourceId);
  const selected = state.selectedSourceIds.includes(paper.sourceId);
  return `<article class="candidate panel${selected ? " selected" : ""}"><div class="candidate-number">${String(index + 1).padStart(2, "0")}</div><div class="candidate-main"><span class="label">${esc(statusLabel(paper.itemType || "bibliographic item"))}${paper.year ? ` · ${esc(paper.year)}` : ""}</span><h2>${esc(paper.title)}</h2><p class="authors">${paper.creators?.length ? esc(paper.creators.join("; ")) : "No creator metadata"}</p><p class="publication">${esc(paper.publicationTitle || "No publication venue recorded")}</p><p class="doi">${paper.doi ? `DOI ${esc(paper.doi)}` : `Zotero key ${esc(paper.key)}`}${destination ? ` <a href="${esc(destination)}" target="_blank" rel="noreferrer">Open source ↗</a>` : ""}</p>${selectable ? button(selected ? "Selected as evidence ✓" : "Select as evidence", `toggle-evidence:${paper.sourceId}`, selected ? "dark" : "outline") : ""}</div><div class="candidate-source"><span class="label">SOURCE ID</span><code>${esc(paper.sourceId)}</code><p>Read-only metadata from ${esc(state.connection.library?.name || "the selected Zotero library")}.</p></div></article>`;
}

function evidence() {
  if (state.connection.status !== "connected") return `<div class="page-intro compact">${eyebrow("Library / Zotero")}<h1>Your papers appear after connection.</h1><p>ThesisOS reads top-level bibliographic metadata from Zotero Desktop and leaves the library unchanged.</p></div>${connectionPanel()}`;
  const showingCandidates = state.candidates.length > 0;
  const visiblePapers = showingCandidates ? state.candidates : state.papers;
  const notePanel = state.evidenceSelection ? `<section class="panel note-workflow"><div class="panel-head"><span class="label">OBSIDIAN NOTE</span><span class="timestamp">${state.noteWrite ? "Written with approval" : state.notePreview ? "Preview only" : "No write yet"}</span></div><h2>${state.noteWrite ? "Literature note created." : "Turn selected evidence into a reviewable note."}</h2><p>${state.noteWrite ? `Saved to ${esc(state.noteWrite.path)}` : "The preview contains bibliographic facts and source links only. Claim, method, and limitation fields remain for researcher review."}</p>${state.notePreview ? `<pre class="note-preview">${esc(state.notePreview.markdown)}</pre><label for="obsidian-vault-path">Obsidian vault path</label><input id="obsidian-vault-path" value="${esc(state.obsidianVaultPath)}" placeholder="/absolute/path/to/your/Obsidian vault" /><p class="helper">ThesisOS will create ThesisOS/Literature inside this vault. Existing files are never overwritten.</p>${button(state.noteWrite ? "Note written ✓" : "Approve and write note", "write-obsidian-note", "dark", Boolean(state.noteWrite))}` : button("Preview Obsidian note →", "preview-obsidian-note")}</section>` : "";
  return `<div class="page-intro compact">${eyebrow("Library / Zotero")}<h1>${showingCandidates ? "Review the search results." : "Read the library as evidence."}</h1><p>${showingCandidates ? `${state.candidates.length} candidates returned for “${esc(state.searchArtifact?.query || state.feedback)}”. Select only papers you reviewed and want attached to the task.` : `${state.connection.paperCount} top-level bibliographic papers loaded from ${esc(state.connection.library?.name || "the selected library")}. Attachments, annotations, and notes are excluded.`}</p></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<section class="evidence-toolbar"><div><span class="label">${showingCandidates ? "APPROVED SEARCH" : "SELECTED LIBRARY"}</span><strong>${showingCandidates ? esc(state.searchArtifact?.query) : esc(state.connection.library?.name || state.connection.library?.id)}</strong></div><span class="connection connected"><i></i>${showingCandidates ? `${state.selectedSourceIds.length} selected` : `Read-only · ${state.connection.paperCount} papers`}</span>${showingCandidates ? `${button(`Attach ${state.selectedSourceIds.length} as evidence →`, "attach-evidence", "dark", state.selectedSourceIds.length === 0)}${button("Show all papers", "clear-search", "outline")}` : button("Export library JSON ↗", "export-json", "outline")}</section><section class="evidence-list">${visiblePapers.map(paperCard).join("")}</section><div class="artifact-note"><i>◇</i><span>${state.evidenceSelection ? `<strong>${state.evidenceSelection.selectedCount} evidence references attached</strong> · ready for note preview` : `Live source: <strong>zotero-local</strong> · stable source IDs retained · no Zotero writes`}</span></div>${notePanel}`;
}

function libraryChoices() {
  return `<div class="library-choices">${state.connection.libraries.map((library) => `<button class="library-choice" data-action="select-zotero:${esc(library.id)}"><span><strong>${esc(library.name)}</strong><small>${esc(library.type)} library · ID ${esc(library.id)}</small></span><b>${library.paperCount} papers →</b></button>`).join("")}</div>`;
}

function connectionPanel() {
  const status = state.connection.status;
  if (status === "checking") return `<section class="connection-panel panel is-checking"><span class="connection-index">01</span><div><span class="label">ZOTERO DESKTOP</span><h2>Looking for the local library.</h2><p>Keep Zotero open while ThesisOS checks the read-only API on this machine.</p></div>${button("Checking…", "connect-zotero", "outline", true)}</section>`;
  if (status === "selection_required") return `<section class="connection-panel panel"><span class="connection-index">01</span><div class="connection-copy"><span class="label">CHOOSE A LIBRARY</span><h2>More than one library contains papers.</h2><p>Choose a library for this project. ThesisOS remembers the library ID and will not merge libraries unless you explicitly request it from the CLI.</p>${libraryChoices()}</div></section>`;
  if (status === "connected") {
    const demo = state.connection.mode === "demo";
    return `<section class="connection-panel panel is-connected"><span class="connection-index">✓</span><div><span class="label">${demo ? "DEMO DATA · READ-ONLY FIXTURE" : "ZOTERO DESKTOP · READ-ONLY"}</span><h2>${esc(state.connection.library?.name || "Zotero library")}</h2><p>${demo ? `${state.connection.paperCount} sample papers are active. This data is not your Zotero library.` : `${state.connection.paperCount} bibliographic papers available. ThesisOS has not changed any Zotero item.`}</p></div><div class="connection-actions">${button("Open library →", "open-library")}<button class="text-button" data-action="connect-zotero">${demo ? "Try Zotero again" : "Refresh connection"}</button></div></section>`;
  }
  return `<section class="connection-panel panel is-error"><span class="connection-index">!</span><div><span class="label">ZOTERO DESKTOP NOT AVAILABLE</span><h2>Open Zotero and try again.</h2><p>${esc(state.connection.message || "ThesisOS could not reach Zotero Desktop.")}</p><ol class="connection-checklist"><li>Open Zotero Desktop on this machine.</li><li>In Zotero settings, allow other applications to communicate with Zotero.</li><li>Return here and retry the local connection.</li></ol><p><strong>Demo data is optional and always labelled.</strong> It lets reviewers test the workflow without Zotero.</p></div><div class="connection-actions">${button("Open Zotero and try again", "connect-zotero")}${button("Use demo library", "use-demo-library", "outline")}</div></section>`;
}

function integrations() {
  return `<div class="page-intro compact">${eyebrow("Connections / local-first")}<h1>Connect without handing over a password.</h1><p>ThesisOS first checks Zotero Desktop on this machine. The local API needs no API key and remains read-only.</p></div>${connectionPanel()}<section class="connection-flow"><article><span>01</span><h3>Connect Zotero Desktop</h3><p>ThesisOS checks the local Zotero API. Your Zotero username and password are never requested.</p></article><article><span>02</span><h3>Choose a library</h3><p>If several personal or group libraries contain papers, choose one and remember it for this project.</p></article><article><span>03</span><h3>Review real metadata</h3><p>Load top-level papers into the Library view with source IDs and a visible read-only boundary.</p></article></section><section class="cloud-note panel"><div><span class="label">ZOTERO CLOUD · LATER</span><h2>Cloud authorization is documented, not simulated.</h2><p>A future Connect Zotero Cloud action will redirect to zotero.org using OAuth. Manual API keys and passwords will not be the normal onboarding flow.</p></div><button class="button button-outline" disabled>Connect Zotero Cloud · not available</button></section><section class="integration-list secondary-integrations"><article class="integration panel${state.noteWrite ? "" : " muted"}"><div class="integration-icon">O</div><div><span class="label">LOCAL MARKDOWN ADAPTER</span><h2>Obsidian</h2><p>${state.noteWrite ? `Literature note written to ${esc(state.noteWrite.path)}.` : "Preview evidence-linked Markdown, then explicitly approve a write into a local vault."}</p></div><span class="integration-state">${state.noteWrite ? "Connected" : "Ready"}</span></article><article class="integration panel muted"><div class="integration-icon">G</div><div><span class="label">THESIS REPOSITORY</span><h2>Overleaf / Git</h2><p>Not implemented. It will prepare reviewable patches rather than overwrite thesis text.</p></div><span class="integration-state">Not connected</span></article></section>`;
}

function settings() { return `<div class="page-intro compact">${eyebrow("Workspace / settings")}<h1>Keep the boundaries visible.</h1><p>These settings describe the baseline that is actually running.</p></div><section class="settings-list panel"><div class="setting-row"><div><strong>Local-first workspace</strong><p>Feedback and project labels are stored in this browser. Zotero is read through the local app server.</p></div><span class="toggle on"><i></i> On</span></div><div class="setting-row"><div><strong>Zotero write access</strong><p>This baseline cannot modify library items, notes, attachments, or collections.</p></div><span class="setting-value">Disabled</span></div><div class="setting-row"><div><strong>Project label</strong><p>${esc(state.project)}</p></div><button class="text-button" data-action="rename-project">Rename</button></div></section>`; }

function render() {
  const view = state.view === "overview" ? overview() : state.view === "feedback" ? feedback() : state.view === "tasks" ? tasks() : state.view === "evidence" ? evidence() : state.view === "integrations" ? integrations() : settings();
  app.innerHTML = shell(view);
}

function applyConnection(payload) {
  state.connection = payload;
  state.papers = payload.papers || [];
  render();
}

async function requestConnection(path, options) {
  state.connection = { ...state.connection, status: "checking", message: "Checking for Zotero Desktop…" };
  render();
  try {
    const response = await fetch(path, options);
    const payload = await response.json();
    applyConnection(payload);
  } catch (error) {
    applyConnection({ status: "unavailable", mode: null, access: null, library: null, libraries: [], paperCount: 0, message: `The ThesisOS app server could not complete the connection: ${error.message}` });
  }
}

function connectZotero() { return requestConnection("/api/zotero/status"); }
function connectDemoLibrary() { return requestConnection("/api/demo/library"); }
function selectZotero(library) { return requestConnection("/api/zotero/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ library }) }); }

function openTask(id) {
  const task = getTask(id);
  if (!task) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  const taskAction = task.approvalStatus === "pending"
    ? `${button("Approve task", `approve-task:${task.id}`)}${button("Reject", `reject-task:${task.id}`, "outline")}`
    : task.approvalStatus === "approved" && task.kind === "literature"
      ? button(state.workflowBusy ? "Searching…" : "Search Zotero →", "search-zotero", "dark", state.workflowBusy || state.connection.status !== "connected")
      : `<span class="muted-action">Task ${esc(task.approvalStatus)}</span>`;
  modal.innerHTML = `<section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title"><button class="modal-close" data-close-modal aria-label="Close">×</button><span class="label">${esc(task.kind)} task · ${esc(task.tool)}</span><h2 id="task-title">${esc(task.title)}</h2><p class="modal-copy">This proposed task traces back to the validated feedback artifact. Approval authorizes the named action; write integrations still require a separate approval.</p><div class="modal-detail"><span>Approval</span><strong class="${task.approvalStatus}">${statusLabel(task.approvalStatus)}</strong><span>Execution</span><strong>${task.kind === "literature" ? "Read-only Zotero search" : "Adapter not implemented"}</strong><span>Source</span><strong>User-provided supervisor feedback</strong></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="modal-actions">${taskAction}<button class="text-button" data-close-modal>Close</button></div></section>`;
  document.body.append(modal);
}

async function handleAction(action) {
  if (action === "new-feedback") return setView("feedback");
  if (action === "open-library") return setView("evidence");
  if (action === "connect-zotero") return connectZotero();
  if (action === "use-demo-library") return connectDemoLibrary();
  if (action.startsWith("select-zotero:")) return selectZotero(action.slice("select-zotero:".length));
  if (action === "clear-search") { state.candidates = []; state.searchArtifact = null; state.selectedSourceIds = []; saveState(); return render(); }
  if (action.startsWith("toggle-evidence:")) {
    const sourceId = action.slice("toggle-evidence:".length);
    state.selectedSourceIds = state.selectedSourceIds.includes(sourceId)
      ? state.selectedSourceIds.filter((id) => id !== sourceId)
      : [...state.selectedSourceIds, sourceId];
    saveState();
    return render();
  }
  if (action === "attach-evidence") {
    state.workflowError = "";
    try {
      const response = await fetch("/api/workflow/evidence/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskGraph: state.taskGraph, searchArtifact: state.searchArtifact, sourceIds: state.selectedSourceIds })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The selected evidence could not be attached.");
      state.taskGraph = payload.taskGraph;
      state.tasks = payload.taskGraph.tasks;
      state.evidenceSelection = payload.selection;
      state.evidenceRefs = payload.selection.evidenceRefs;
    } catch (error) {
      state.workflowError = error.message;
    }
    saveState();
    return render();
  }
  if (action === "preview-obsidian-note") {
    state.workflowError = "";
    try {
      const response = await fetch("/api/workflow/notes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: state.project, feedback: state.feedback, evidenceRefs: state.evidenceRefs })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Obsidian note preview could not be created.");
      state.notePreview = payload;
    } catch (error) {
      state.workflowError = error.message;
    }
    saveState();
    return render();
  }
  if (action === "write-obsidian-note") {
    state.obsidianVaultPath = document.querySelector("#obsidian-vault-path")?.value.trim() || "";
    state.workflowError = "";
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
      state.workflowError = error.message;
    }
    saveState();
    return render();
  }
  if (action === "export-json") {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, provider: "zotero-local", access: "read-only", library: state.connection.library, paperCount: state.connection.paperCount, papers: state.papers }, null, 2)], { type: "application/json" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "zotero-library.json" });
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  if (action === "rename-project") {
    const next = window.prompt("Project label", state.project);
    if (next?.trim()) { state.project = next.trim(); saveState(); render(); }
    return;
  }
  if (action.startsWith("approve-task:") || action.startsWith("reject-task:")) {
    const [verb, taskId] = action.split(":");
    state.workflowError = "";
    try {
      const response = await fetch("/api/workflow/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskGraph: state.taskGraph, state: state.thesisState, taskId, decision: verb === "approve-task" ? "approved" : "rejected" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The review decision could not be applied.");
      state.taskGraph = payload.taskGraph;
      state.thesisState = payload.state;
      state.tasks = payload.taskGraph.tasks;
      document.querySelector(".modal-backdrop")?.remove();
      saveState();
      render();
    } catch (error) {
      state.workflowError = error.message;
      document.querySelector(".modal-backdrop")?.remove();
      render();
      openTask(taskId);
    }
    return;
  }
  if (action === "search-zotero") {
    state.workflowBusy = true;
    state.workflowError = "";
    document.querySelector(".modal-backdrop")?.remove();
    render();
    try {
      const response = await fetch("/api/workflow/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskGraph: state.taskGraph, mode: state.connection.mode })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Zotero search failed.");
      state.searchArtifact = payload;
      state.candidates = payload.candidates || [];
      state.view = "evidence";
    } catch (error) {
      state.workflowError = error.message;
    } finally {
      state.workflowBusy = false;
      saveState();
      render();
    }
  }
}

app.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) return setView(view);
  const taskId = event.target.closest("[data-task]")?.dataset.task;
  if (taskId) return openTask(taskId);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action) return handleAction(action);
  if (event.target.closest("[data-close-modal]")) document.querySelector(".modal-backdrop")?.remove();
});

app.addEventListener("submit", async (event) => {
  if (event.target.id !== "feedback-form") return;
  event.preventDefault();
  const data = new FormData(event.target);
  state.feedbackTitle = data.get("title")?.toString().trim() || "Supervisor feedback";
  state.feedback = data.get("feedback")?.toString().trim() || "";
  state.workflowProvider = data.get("provider")?.toString() || "codex";
  if (!state.feedback) return;
  state.workflowBusy = true;
  state.workflowError = "";
  saveState();
  render();
  try {
    const response = await fetch("/api/workflow/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: state.feedback, project: state.project, provider: state.workflowProvider })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "The workflow could not create tasks.");
    state.taskGraph = payload.taskGraph;
    state.thesisState = payload.state;
    state.runtime = payload.runtime;
    state.tasks = payload.taskGraph.tasks;
    state.view = "tasks";
  } catch (error) {
    state.workflowError = error.message;
  } finally {
    state.workflowBusy = false;
    saveState();
    render();
  }
});

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#", "");
  if (["overview", "feedback", "tasks", "evidence", "integrations", "settings"].includes(view) && state.view !== view) { state.view = view; saveState(); render(); }
});
const initialView = location.hash.replace("#", "");
if (["overview", "feedback", "tasks", "evidence", "integrations", "settings"].includes(initialView)) state.view = initialView;
render();
connectZotero();
