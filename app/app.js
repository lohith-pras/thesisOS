const STORAGE_KEY = "thesisos-ui-state-v2";

const defaultState = {
  view: "overview",
  onboardingStep: 0,
  setupCollapsed: false,
  activeProfileForm: null,
  project: "Thesis workspace",
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
  noteWrite: null,
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
function setView(view) { state.view = view; saveState(); location.hash = view; render(); }
function getTask(id) { return state.tasks.find((task) => task.id === id); }
function statusLabel(value = "") { return value.replaceAll("_", " "); }
function icon(name) { return ({ overview: "⌂", profile: "◎", tasks: "✓", evidence: "▤", notes: "▧", integrations: "⌘", settings: "⚙", about: "ⓘ" })[name] || "·"; }
function button(label, action, kind = "dark", disabled = false) { return `<button class="button button-${kind}" data-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`; }
function selectedWorkflowProvider() { return state.connection.mode === "demo" ? "offline" : state.workflowProvider; }
function workflowProviderOptions() {
  const selected = selectedWorkflowProvider();
  return `<option value="codex"${selected === "codex" ? " selected" : ""}>Codex CLI · local login</option><option value="offline"${selected === "offline" ? " selected" : ""}>Offline · deterministic</option><option value="openai"${selected === "openai" ? " selected" : ""}>OpenAI · GPT-5.6 API</option>`;
}
function eyebrow(text) { return `<p class="eyebrow"><i></i>${text}</p>`; }
function emptyState(title, copy, action = "", label = "") { return `<section class="empty-state panel"><span class="empty-mark">◇</span><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div>${action ? button(label, action, "outline") : ""}</section>`; }
function activityMarker() { return '<span class="activity-marker" aria-hidden="true"></span>'; }
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
  if (activity.status === "idle") return "";
  const marker = activity.status === "active"
    ? activityMarker()
    : `<span class="activity-mark" aria-hidden="true">${activity.status === "success" ? "✓" : "!"}</span>`;
  const recovery = activity.status === "error" && activity.recoveryAction ? button("Try again", activity.recoveryAction, "outline") : "";
  return `<div class="global-activity ${activity.status}" role="status" aria-live="polite"><div class="activity-copy">${marker}<span><strong>${esc(activity.label)}</strong>${activity.detail ? `<small>${esc(activity.detail)}</small>` : ""}</span></div>${recovery}</div>`;
}

function sectionActivity(kinds = []) {
  const activity = state.activity || defaultState.activity;
  if (activity.status === "idle" || !kinds.includes(activity.kind)) return "";
  const marker = activity.status === "active"
    ? activityMarker()
    : `<span class="activity-mark" aria-hidden="true">${activity.status === "success" ? "✓" : "!"}</span>`;
  return `<div class="section-activity ${activity.status}" aria-hidden="true"><div class="activity-copy">${marker}<span><strong>${esc(activity.label)}</strong>${activity.detail ? `<small>${esc(activity.detail)}</small>` : ""}</span></div></div>`;
}

function connectionLabel() {
  if (state.connection.status === "connected" && state.connection.mode === "demo") return "Demo data · clearly labelled fixture";
  if (state.connection.status === "connected") return `Zotero connected · ${state.connection.mode}`;
  if (state.connection.status === "checking") return "Checking Zotero Desktop";
  if (state.connection.status === "selection_required") return "Zotero library choice required";
  return "Zotero not connected";
}

function shell(content) {
  const nav = [["overview", "Overview"], ["profile", "Thesis profile"], ["tasks", "Tasks"], ["evidence", "Library"], ["notes", "Evidence notes"], ["integrations", "Connections"]];
  const pending = state.tasks.filter((task) => task.approvalStatus === "pending").length;
  const connected = state.connection.status === "connected";
  return `<aside class="sidebar">
    <a class="brand" href="/">ThesisOS<span>.</span></a>
    <div class="brand-subtitle">LOCAL-FIRST RESEARCH WORKSPACE</div>
    <div class="sidebar-rule"></div>
    <nav class="main-nav" aria-label="Workspace navigation">${nav.map(([id, label]) => `<button class="nav-item ${state.view === id ? "active" : ""}" data-view="${id}"><span class="nav-glyph">${icon(id)}</span>${label}${id === "tasks" && pending ? `<b class="nav-count">${pending}</b>` : ""}</button>`).join("")}</nav>
    <div class="sidebar-rule"></div>
    <div class="sidebar-block"><span class="label">CURRENT PROJECT</span><strong>${esc(state.project)}</strong><span class="project-status"><i></i> Stored on this machine</span></div>
    <div class="sidebar-bottom"><button class="nav-item ${state.view === "settings" ? "active" : ""}" data-view="settings"><span class="nav-glyph">${icon("settings")}</span>Settings</button><button class="nav-item ${state.view === "about" ? "active" : ""}" data-view="about"><span class="nav-glyph">${icon("about")}</span>About ThesisOS</button></div>
  </aside><main class="main-content"><header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${esc(pageTitle())}</strong></div><div class="topbar-actions"><button class="connection connection-button ${connected ? "connected" : state.connection.status}" data-view="integrations"><i></i>${esc(connectionLabel())}</button></div></header>${activityStrip()}<div class="page-content">${content}</div></main>`;
}

function pageTitle() { return ({ overview: "Overview", profile: "Thesis profile", tasks: "Task review", evidence: "Zotero library", notes: "Evidence notes", integrations: "Connections", settings: "Settings", about: "About ThesisOS" })[state.view] || "Overview"; }

function landing() {
  return `<main class="first-run"><header class="first-run-nav"><a class="brand" href="/">ThesisOS<span>.</span></a><span>Local-first · reviewable by design</span></header><section class="first-run-hero"><div>${eyebrow("A guided lifecycle for thesis work")}<h1>Know what<br>comes next.</h1><p>ThesisOS reads the intent behind your thesis, keeps supervisor feedback intact, and turns it into evidence-backed work you approve.</p><div class="intro-actions">${button("Set up my thesis →", "start-onboarding")} ${button("Explore with demo data", "use-demo-library", "outline")}</div><small>Only the thesis name is required. Every connection can be added later.</small></div><aside class="outcome-preview"><span class="label">THE OUTCOME</span><ol><li><b>01</b><span>Establish what the thesis is trying to prove.</span></li><li><b>02</b><span>Capture feedback in the supervisor's own words.</span></li><li><b>03</b><span>Approve tasks and attach evidence from Zotero.</span></li></ol><p>Nothing writes to your thesis or vault without approval.</p></aside></section></main>`;
}

function onboardingFrame(content, step, options = {}) {
  const progress = `${Math.max(1, step)} of 7`;
  return `<main class="onboarding-shell"><header class="first-run-nav"><a class="brand" href="/">ThesisOS<span>.</span></a><span>Setup · ${progress}</span></header><section class="onboarding-card"><div class="onboarding-progress" aria-label="Onboarding progress">${Array.from({ length: 7 }, (_, index) => `<i class="${index < step ? "complete" : ""}"></i>`).join("")}</div>${content}${options.optional ? `<button class="text-button onboarding-skip" data-action="onboarding-next:${step + 1}">Skip for now →</button>` : ""}</section></main>`;
}

function onboarding() {
  const step = Math.max(1, state.onboardingStep || 1);
  if (step === 1) return onboardingFrame(`<span class="label">FIRST, THE DESTINATION</span><h1>Feedback becomes reviewable work—not a black-box answer.</h1><p>We will establish thesis intent, offer useful local connections, and preview your real workspace before you enter it.</p>${button("Begin with my thesis →", "onboarding-next:2")}`, step);
  if (step === 2) return onboardingFrame(`<span class="label">NAME THE WORK</span><h1>What should we call your thesis?</h1><p>This is the only required step. Everything else remains optional and editable.</p><form class="profile-form onboarding-form" id="project-init-form"><label>Thesis name</label><input name="project" value="${state.project === "Thesis workspace" ? "" : esc(state.project)}" placeholder="Your working thesis title" required autofocus /><button class="button button-dark" type="submit">Create my workspace →</button></form>`, step);
  if (step === 3) return onboardingFrame(`<span class="label">UNDERSTAND THE WORK</span><h1>Let ThesisOS read the project intent.</h1><p>Add a PDF, Markdown, or text project description. It will propose objectives for your approval; it never makes them canonical automatically.</p><form class="profile-form onboarding-form" id="document-import-form" aria-busy="${state.activeProfileForm === "document-import-form"}">${documentDropZone()}${profileCardLoading("document-import-form", "Importing and reading the document…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Import document →</button></form>`, step, { optional: true });
  if (step === 4) return onboardingFrame(`<span class="label">BUILD THE RESEARCH BASE</span><h1>Connect the papers you already trust.</h1><p>Zotero stays read-only. ThesisOS uses its metadata to find evidence relevant to approved tasks.</p>${connectionPanel()}<div class="onboarding-actions">${button("Continue →", "onboarding-next:5", "dark")}</div>`, step, { optional: true });
  if (step === 5) return onboardingFrame(`<span class="label">CHOOSE WORKING OUTPUTS</span><h1>Link files only when they exist.</h1><p>A manuscript folder can be a local LaTeX checkout or an Overleaf Git checkout. An Obsidian vault is where approved evidence notes can be written.</p><form class="profile-form onboarding-form" id="manuscript-link-form"><label>Optional manuscript folder</label><input name="thesisDir" placeholder="Leave blank if you do not have a .tex thesis yet" /><button class="button button-outline" type="submit">Link manuscript folder</button></form><div class="onboarding-actions">${button(state.obsidianVaultPath ? "Obsidian initialized ✓" : "Choose Obsidian vault", "choose-existing-vault", "outline")}${button("Continue →", "onboarding-next:6", "dark")}</div>`, step, { optional: true });
  if (step === 6) return onboardingFrame(`<span class="label">PERSONALIZE THE WORK</span><h1>Where are you in the thesis?</h1><p>Stage and current scope make feedback more specific. Add them now or return from Thesis Profile.</p><form class="profile-form onboarding-form" id="profile-form"><label>Current focus or selected problem</label><input name="scopeName" placeholder="For example: interference mitigation" required /><label>Short scope summary</label><textarea name="scopeSummary" rows="3"></textarea><label>Current stage</label><select name="stage"><option value="proposal">Proposal</option><option value="literature">Literature review</option><option value="experiments">Experiments</option><option value="writing">Writing</option><option value="revision">Revision</option></select><button class="button button-dark" type="submit">Save and preview →</button></form>`, step, { optional: true });
  const selected = state.projectState?.profile?.problems?.find((item) => item.selected);
  return onboardingFrame(`<span class="label">YOUR WORKSPACE PREVIEW</span><h1>${esc(state.project)}</h1><p>${state.projectState?.profile?.stage?.value ? `${esc(statusLabel(state.projectState.profile.stage.value))} · ` : ""}${selected ? esc(selected.name) : "Ready to add context when you have it"}</p><div class="preview-status-grid"><article><b>${state.connection.status === "connected" ? state.connection.paperCount : "—"}</b><span>Zotero papers</span></article><article><b>${state.projectState?.profile?.objectives?.length || 0}</b><span>Objectives</span></article><article><b>${state.projectState?.project?.thesisDir ? "Linked" : "Optional"}</b><span>Manuscript</span></article></div><p class="helper">Incomplete setup will appear as quiet next steps, never as a blocker.</p>${button("Enter workspace →", "finish-onboarding")}`, step);
}

function overview() {
  const connected = state.connection.status === "connected";
  const canonical = state.projectState;
  const profile = canonical?.profile ?? {};
  const selected = profile.problems?.find((item) => item.selected);
  const threads = canonical?.feedbackThreads ?? [];
  const latest = threads.at(-1);
  const allTasks = threads.flatMap((thread) => thread.tasks ?? []);
  const openTasks = allTasks.filter((task) => task.approvalStatus !== "rejected" && task.status !== "completed").length;
  const configured = [state.profileReadiness.ready, connected, Boolean(canonical?.project?.thesisDir), Boolean(state.obsidianVaultPath), Boolean(profile.stage?.value && selected)].filter(Boolean).length;
  const setupLabel = `Setup · ${configured} of 5 configured`;
  const nextAction = !state.profileReadiness.ready ? { label: "Complete thesis context", view: "profile" } : !connected ? { label: "Connect Zotero", view: "integrations" } : { label: "Add supervisor feedback", view: "overview" };
  const stage = profile.stage?.value ? statusLabel(profile.stage.value) : "Context not complete";
  const setupItems = [
    [true, "Thesis named", "profile"],
    [state.profileReadiness.ready, "Thesis context approved", "profile"],
    [connected, "Zotero connected", "integrations"],
    [Boolean(canonical?.project?.thesisDir), "Manuscript linked", "profile"],
    [Boolean(state.obsidianVaultPath), "Obsidian initialized", "integrations"]
  ];
  const setupPanel = `<aside class="setup-path panel ${state.setupCollapsed ? "collapsed" : ""}"><button class="setup-toggle" data-action="toggle-setup" aria-expanded="${state.setupCollapsed ? "false" : "true"}" aria-controls="setup-path-details"><span><b>${setupLabel}</b><small>Optional · resumable</small></span><span>${state.setupCollapsed ? "Show ↓" : "Hide ↑"}</span></button><div id="setup-path-details" ${state.setupCollapsed ? "hidden" : ""}>${setupItems.map(([done, label, view]) => `<button data-view="${view}"><i>${done ? "✓" : "→"}</i><span>${label}</span></button>`).join("")}</div></aside>`;
  const feedbackStatus = !state.profileReadiness.ready ? `<p class="context-notice">Feedback can be saved now. Add thesis context before generating specific tasks.</p>` : `<p class="helper">Only approved thesis context and this exact feedback go to the selected runtime.</p>`;
  return `<section class="lifecycle-head"><div>${eyebrow("Guided lifecycle / overview")}<h1>${esc(canonical?.project?.name || state.project)}</h1><p><span class="status-dot"></span>${esc(stage)}${selected ? ` · Focused on ${esc(selected.name)}` : ""}</p></div><button class="button button-outline" data-view="${nextAction.view}">${esc(nextAction.label)} →</button></section>
    <section class="metric-grid"><article><b>${connected ? state.connection.paperCount : "—"}</b><span>Zotero papers</span></article><article><b>${profile.objectives?.length ?? 0}</b><span>Objectives</span></article><article><b>${openTasks}</b><span>Open tasks</span></article><article><b>${threads.length}</b><span>Feedback threads</span></article></section>
    <section class="lifecycle-grid"><div><form class="feedback-form panel overview-feedback" id="feedback-form"><div class="panel-head"><span class="label">ADD SUPERVISOR FEEDBACK</span><span class="timestamp">Saved canonically</span></div><label for="feedback-title">Feedback title <small>optional</small></label><input id="feedback-title" name="title" value="${esc(state.feedbackTitle)}" placeholder="For example: Section 3.2 revisions" /><label for="feedback-text">Supervisor feedback</label><textarea id="feedback-text" name="feedback" rows="6" placeholder="Paste or type the exact feedback here." required>${esc(state.feedback)}</textarea><label for="workflow-provider">Task runtime</label><select id="workflow-provider" name="provider">${workflowProviderOptions()}</select>${feedbackStatus}${sectionActivity(["task-graph", "feedback-capture"])}${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="form-footer"><span class="read-only-note"><i></i>${state.profileReadiness.ready ? "Validated task artifact" : "Capture now · decompose later"}</span>${button(state.profileReadiness.ready ? "Turn into proposed tasks →" : "Save feedback →", "analyze-feedback", "dark", state.workflowBusy)}</div></form>${latest ? `<article class="latest-feedback panel"><div class="panel-head"><span class="label">LATEST FEEDBACK</span><span class="timestamp">${esc(statusLabel(latest.status))}</span></div><blockquote>“${esc(latest.feedback)}”</blockquote><div class="byline">${latest.tasks?.length || 0} proposed tasks <span>${latest.tasks?.length ? "Review required" : "Waiting for thesis context"}</span></div>${latest.tasks?.length ? `<button class="card-link" data-view="tasks">Review tasks <span>→</span></button>` : `<button class="card-link" data-view="profile">Add thesis context <span>→</span></button>`}</article>` : ""}</div><div>${setupPanel}<section class="integration-health"><button class="panel" data-view="integrations"><i class="${connected ? "live" : ""}"></i><span><b>Zotero</b><small>${connected ? `Connected locally · ${state.connection.paperCount} papers` : "Not connected"}</small></span><em>→</em></button><button class="panel" data-view="profile"><i class="${canonical?.project?.thesisDir ? "live" : ""}"></i><span><b>Manuscript</b><small>${canonical?.project?.thesisDir ? `Linked · ${esc(canonical.project.thesisDir)}` : "Not linked · Overleaf Git or local folder"}</small></span><em>→</em></button><button class="panel" data-view="integrations"><i class="${state.obsidianVaultPath ? "live" : ""}"></i><span><b>Obsidian</b><small>${state.obsidianVaultPath ? `Initialized · ${esc(state.obsidianVaultPath)}` : "Not initialized"}</small></span><em>→</em></button></section></div></section>`;
}

function provenanceLabel(value) {
  const source = value?.provenance;
  if (source?.kind === "user-stated") return "You stated";
  if (source?.sourceId) return `Project document${source.locator ? ` · ${source.locator}` : ""}`;
  return "Not approved";
}

function profile() {
  if (!state.projectState) return `<div class="page-intro compact">${eyebrow("Onboarding / thesis intent")}<h1>Start with your project document.</h1><p>Use your project PDF, description, or proposal to establish the thesis objectives. If you already have an editable LaTeX manuscript, you can attach its folder now; otherwise leave it blank.</p></div>
    <form class="panel profile-form" id="project-init-form"><label>Project name</label><input name="project" value="${esc(state.project)}" required /><label>Optional manuscript folder</label><input name="thesisDir" placeholder="Leave blank if you do not have a .tex thesis yet" /><label>Obsidian vault</label><input name="vaultPath" value="${esc(state.obsidianVaultPath)}" placeholder="/absolute/path/to/vault" required /><div class="form-footer">${button("Initialize thesis profile →", "submit-init", "dark", state.workflowBusy)}</div></form>`;

  const canonical = state.projectState;
  const approved = canonical.profile || {};
  const proposal = canonical.profileProposal?.status === "pending" ? canonical.profileProposal : null;
  const missing = state.profileReadiness.missing || [];
  const proposalFields = proposal ? Object.entries(proposal.fields).map(([name, value]) => {
    const display = Array.isArray(value) ? value.map((item) => item.text || item.name).join("; ") : value.value;
    return `<label class="profile-proposal-field"><input type="checkbox" name="field" value="${esc(name)}" checked /><span><strong>${esc(name)}</strong><small>${esc(display)}</small></span></label>`;
  }).join("") : "";
  const objectives = (approved.objectives || []).map((item) => `<li>${esc(item.text)} <small>${esc(provenanceLabel(item))}</small></li>`).join("");
  const selected = (approved.problems || []).find((item) => item.selected);
  return `<div class="page-intro compact">${eyebrow("Onboarding / source of truth")}<h1>${state.profileReadiness.ready ? "Thesis context approved." : "Profile incomplete."}</h1><p>${state.profileReadiness.ready ? "Feedback and retrieval now use only this approved context." : `Complete: ${missing.join(", ") || "review the pending proposal"}.`}</p></div>
    <section class="profile-grid">
      <article class="panel profile-summary"><div class="panel-head"><span class="label">APPROVED PROFILE</span><span class="timestamp">Revision ${canonical.revision}</span></div><h2>${esc(approved.title?.value || approved.topic?.value || "No approved title yet")}</h2><p>${esc(approved.topic?.value || "")}</p><h3>Objectives</h3><ul>${objectives || "<li>None approved</li>"}</ul><h3>Selected scope</h3><p>${selected ? `${esc(selected.name)} · ${esc(provenanceLabel(selected))}` : "Not selected"}</p><h3>Stage</h3><p>${approved.stage ? `${esc(approved.stage.value)} · ${esc(provenanceLabel(approved.stage))}` : "Not recorded"}</p></article>
      <div class="profile-actions">
        <form class="panel profile-form" id="document-import-form" aria-busy="${state.activeProfileForm === "document-import-form"}"><span class="label">PROJECT DOCUMENT</span><h2>Import PDF, Markdown, or text.</h2>${documentDropZone()}${profileCardLoading("document-import-form", "Importing and reading the document…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Upload document</button></form>
        ${canonical.documents?.length && !proposal ? `<form class="panel profile-form" id="profile-propose-form" aria-busy="${state.activeProfileForm === "profile-propose-form"}"><span class="label">EXTRACT PROFILE</span><p>The selected runtime receives only locally extracted text after this explicit approval.</p><select name="documentId">${canonical.documents.map((item) => `<option value="${esc(item.id)}">${esc(item.filename)}</option>`).join("")}</select><label>Extraction runtime</label><select name="provider"><option value="codex">Codex CLI · local login</option><option value="openai">OpenAI · GPT-5.6 API</option></select>${profileCardLoading("profile-propose-form", "Extracting thesis context…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Approve profile extraction</button></form>` : ""}
        ${proposal ? `<form class="panel profile-form" id="profile-review-form" aria-busy="${state.activeProfileForm === "profile-review-form"}"><span class="label">REVIEW PROPOSAL</span><p>Checked fields become canonical. Unchecked fields are rejected.</p>${proposalFields}${profileCardLoading("profile-review-form", "Saving approved profile fields…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Accept checked fields</button></form>` : ""}
        <form class="panel profile-form" id="profile-form" aria-busy="${state.activeProfileForm === "profile-form"}"><span class="label">RESEARCHER DECISIONS</span><label>Selected problem or scope</label><input name="scopeName" value="${esc(selected?.name || "")}" required /><label>Scope summary</label><textarea name="scopeSummary" rows="3">${esc(selected?.summary || "")}</textarea><label>Current stage</label><select name="stage">${["proposal", "literature", "experiments", "writing", "revision"].map((stage) => `<option value="${stage}"${approved.stage?.value === stage ? " selected" : ""}>${stage}</option>`).join("")}</select>${profileCardLoading("profile-form", "Saving thesis decisions…")}<button class="button button-dark" type="submit"${state.activeProfileForm ? " disabled" : ""}>Save thesis decisions</button></form>
      </div>
    </section>`;
}

function feedback() {
  if (state.projectState && !state.profileReadiness.ready) return `<div class="page-intro compact">${eyebrow("Feedback / context required")}<h1>Complete the thesis profile first.</h1><p>Feedback without approved objectives and scope produces generic work. Missing: ${esc(state.profileReadiness.missing.join(", "))}.</p>${button("Complete thesis profile →", "open-profile")}</div>`;
  return `<div class="page-intro compact">${eyebrow("Feedback / source")}<h1>Keep the original wording.</h1><p>Add a real supervisor comment. ThesisOS interprets it against the approved thesis profile and manuscript map.</p></div><section class="feedback-layout"><form class="feedback-form panel" id="feedback-form"><label for="feedback-title">Feedback title</label><input id="feedback-title" name="title" value="${esc(state.feedbackTitle)}" placeholder="For example: Section 3.2 revisions" /><label for="feedback-text">Supervisor feedback</label><textarea id="feedback-text" name="feedback" rows="8" placeholder="Paste the exact feedback here." required>${esc(state.feedback)}</textarea><label for="workflow-provider">Decomposition runtime</label><select id="workflow-provider" name="provider">${workflowProviderOptions()}</select><p class="helper">Only approved thesis context and this feedback are sent to the selected runtime.</p>${sectionActivity(["task-graph"])}${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="form-footer"><span class="read-only-note"><i></i> Validated task artifact</span>${button(state.workflowBusy ? "Creating tasks…" : state.feedback ? "Update review tasks →" : "Create review tasks →", "analyze-feedback", "dark", state.workflowBusy)}</div></form><aside class="side-note"><span class="label">WHAT HAPPENS NEXT</span><ol><li><b>01</b><span>The runtime receives approved thesis context plus exact feedback.</span></li><li><b>02</b><span>The server validates the task graph and persists it canonically.</span></li><li><b>03</b><span>Every proposed task begins pending your approval.</span></li></ol></aside></section>`;
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
  return `<article class="candidate panel${selected ? " selected" : ""}"><div class="candidate-number">${String(index + 1).padStart(2, "0")}</div><div class="candidate-main"><span class="label">${esc(statusLabel(paper.itemType || "bibliographic item"))}${paper.year ? ` · ${esc(paper.year)}` : ""}</span><h2>${esc(paper.title)}</h2><p class="authors">${paper.creators?.length ? esc(paper.creators.join("; ")) : "No creator metadata"}</p><p class="publication">${esc(paper.publicationTitle || "No publication venue recorded")}</p><p class="doi">${paper.doi ? `DOI ${esc(paper.doi)}` : `Zotero key ${esc(paper.key)}`}${destination ? ` <a href="${esc(destination)}" target="_blank" rel="noreferrer">Open source ↗</a>` : ""}</p>${selectable ? button(selected ? "Selected as evidence ✓" : "Select as evidence", `toggle-evidence:${paper.sourceId}`, selected ? "dark" : "outline") : ""}</div><div class="candidate-source"><span class="label">${paper.matchScore !== undefined ? `MATCH ${Math.round(paper.matchScore * 100)}%` : "SOURCE ID"}</span><code>${esc(paper.sourceId)}</code><p>${paper.matchReasons?.length ? esc(paper.matchReasons.join(" · ")) : `Read-only metadata from ${esc(state.connection.library?.name || "the selected Zotero library")}.`}</p></div></article>`;
}

function noteWorkflowPanel() {
  if (!state.evidenceSelection) return "";
  const isDemo = state.connection.mode === "demo";
  const draftWarning = state.noteDraft?.warning ? `<p class="form-error" role="status">${esc(state.noteDraft.warning)}</p>` : "";
  const draftControls = !state.notePreview ? `<div class="note-actions">${button(state.workflowBusy ? "Drafting with Codex CLI…" : "Draft with Codex CLI →", "draft-evidence-note", "dark", state.workflowBusy)} ${button("Use local template", "preview-obsidian-note", "outline", state.workflowBusy)}</div><p class="helper">Codex CLI uses your authenticated local Codex session and receives only the selected papers plus supervisor feedback. Clicking approval consents to that processing.</p>` : "";
  const writeControls = state.notePreview ? (isDemo
    ? `<p class="demo-boundary">Judge mode stops at preview. No filesystem write is performed.</p>`
    : state.obsidianVaultPath
      ? `<div class="vault-connected"><span class="label">OBSIDIAN VAULT CONNECTED</span><code>${esc(state.obsidianVaultPath)}</code><button class="text-button" data-action="change-obsidian-vault">Change vault</button></div><p class="helper">Notes go into <code>Evidence/</code> inside this vault. ThesisOS updates only notes it previously created.</p>${button(state.noteWrite ? (state.noteWrite.updated ? "Note updated ✓" : "Note written ✓") : "Approve and write note", "write-obsidian-note", "dark", Boolean(state.noteWrite))}`
      : `<div class="vault-setup"><h3>Where should this note live?</h3><p>Choose an existing Obsidian vault, or create a new project vault. ThesisOS remembers your choice for this project.</p><div class="note-actions">${button("Choose existing vault", "choose-existing-vault", "dark")} ${button("Create new vault", "create-obsidian-vault", "outline")}</div></div>`) : "";
  return `<section class="panel note-workflow"><div class="panel-head"><span class="label">OBSIDIAN NOTE</span><span class="timestamp">${state.noteWrite ? (state.noteWrite.updated ? "Updated with approval" : "Written with approval") : state.notePreview ? "Preview only" : "No write yet"}</span></div><h2>${state.noteWrite ? (state.noteWrite.updated ? "Literature note updated." : "Literature note created.") : "Turn selected evidence into a grounded note."}</h2><p>${state.noteWrite ? `Saved to ${esc(state.noteWrite.path)}` : "Drafting and filesystem writing are separate approval boundaries."}</p>${sectionActivity(["evidence-attach", "codex-draft", "note-preview", "vault-picker", "vault-write"])}${draftWarning}${draftControls}${state.notePreview ? `<pre class="note-preview">${esc(state.notePreview.markdown)}</pre>` : ""}${writeControls}</section>`;
}

function evidence() {
  if (state.connection.status !== "connected") return `<div class="page-intro compact">${eyebrow("Library / Zotero")}<h1>Your papers appear after connection.</h1><p>ThesisOS reads top-level bibliographic metadata from Zotero Desktop and leaves the library unchanged.</p></div>${connectionPanel()}`;
  const showingSearchResults = state.searchArtifact !== null;
  const visiblePapers = showingSearchResults ? state.candidates : state.papers;
  const literatureTask = state.tasks.find((task) => task.kind === "literature");
  const approvedLiteratureTask = literatureTask?.approvalStatus === "approved" ? literatureTask : null;
  const libraryAction = showingSearchResults
    ? `${state.candidates.length ? button(state.workflowBusy ? "Attaching evidence…" : `Attach ${state.selectedSourceIds.length} as evidence →`, "attach-evidence", "dark", state.workflowBusy || state.selectedSourceIds.length === 0) : ""}${button("Show all papers", "clear-search", "outline", state.workflowBusy)}`
    : approvedLiteratureTask
      ? `${button("Search approved literature →", "search-zotero")}${button("Export library JSON ↗", "export-json", "outline")}`
      : literatureTask
        ? button("Review literature task →", "open-literature-task")
        : button("Add feedback to create a literature task →", "new-feedback", "outline");
  const notePanel = `${sectionActivity(["zotero", "zotero-search", "evidence-attach"])}${noteWorkflowPanel()}`;
  const searchForm = showingSearchResults ? `<form class="literature-search panel" id="literature-search-form"><div><label for="literature-search-query">Refine Zotero search</label><p>Use a title, author surname, DOI, or broader topic from your library.</p></div><input id="literature-search-query" name="query" value="${esc(state.searchQuery || state.searchArtifact?.query || "")}" required /><button class="button button-dark" type="submit"${state.workflowBusy ? " disabled" : ""}>${state.workflowBusy ? "Searching…" : "Search again"}</button></form>` : "";
  const retrievalNotice = showingSearchResults && state.searchArtifact?.retrieval ? `<p class="retrieval-notice"><strong>${state.searchArtifact.retrieval.mode === "hybrid-semantic" ? "Semantic + metadata ranking" : "Metadata ranking fallback"}</strong> · indexed ${state.searchArtifact.indexedPaperCount ?? state.connection.paperCount} papers. ${state.searchArtifact.retrieval.coverage ? `${state.searchArtifact.retrieval.coverage.withAbstract}/${state.searchArtifact.retrieval.coverage.total} have abstracts; ${state.searchArtifact.retrieval.coverage.metadataOnly} ranked from metadata only.` : ""} Minimum score ${state.searchArtifact.retrieval.minimumScore ?? "not applied"}.${state.searchArtifact.retrieval.warning ? ` ${esc(state.searchArtifact.retrieval.warning)}` : ""}</p>` : "";
  const results = showingSearchResults && !visiblePapers.length
    ? emptyState("No papers matched", `Zotero found no papers for “${state.searchArtifact?.query || state.searchQuery}”. Refine the query and search again.`)
    : `<section class="evidence-list">${visiblePapers.map(paperCard).join("")}</section>`;
  return `<div class="page-intro compact">${eyebrow("Library / Zotero")}<h1>${showingSearchResults ? "Review the search results." : "Read the library as evidence."}</h1><p>${showingSearchResults ? `${state.candidates.length} candidates returned for “${esc(state.searchArtifact?.query || state.feedback)}”. ${state.candidates.length ? "Select only papers you reviewed and want attached to the task." : "Try a broader or more specific library query below."}` : `${state.connection.paperCount} top-level bibliographic papers loaded from ${esc(state.connection.library?.name || "the selected library")}. These full-library cards are read-only; approve and run a literature search to select evidence.`}</p></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<section class="evidence-toolbar"><div><span class="label">${showingSearchResults ? "APPROVED SEARCH" : "SELECTED LIBRARY"}</span><strong>${showingSearchResults ? esc(state.searchArtifact?.query) : esc(state.connection.library?.name || state.connection.library?.id)}</strong></div><span class="connection connected"><i></i>${showingSearchResults ? `${state.candidates.length} matches · ${state.selectedSourceIds.length} selected` : `Read-only · ${state.connection.paperCount} papers`}</span>${libraryAction}</section>${retrievalNotice}${searchForm}${results}<div class="artifact-note"><i>◇</i><span>${state.evidenceSelection ? `<strong>${state.evidenceSelection.selectedCount} evidence references attached</strong> · ready for note preview` : `Live source: <strong>${state.connection.mode === "demo" ? "demo-fixture" : "zotero-local"}</strong> · stable source IDs retained · no Zotero writes`}</span></div>${notePanel}`;
}

function notes() {
  if (!state.evidenceSelection) return `<div class="page-intro compact">${eyebrow("Evidence notes / next step")}<h1>Attach evidence before drafting.</h1><p>Select and attach reviewed papers from the Library first. They will appear here as the next step.</p></div>${emptyState("No evidence attached yet", "The note workflow begins after you attach selected Zotero papers.", "open-library", "Open library")}`;
  return `<div class="page-intro compact">${eyebrow("Evidence notes / next step")}<h1>Turn evidence into a note.</h1><p>Your selected sources are attached. Draft, review, and save them into the configured Obsidian vault.</p><div class="workflow-steps"><span class="complete">01 Evidence attached</span><span class="active">02 Draft note</span><span>03 Preview</span><span>04 Save to vault</span></div></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<section class="selected-evidence-summary panel"><div><span class="label">SELECTED EVIDENCE</span><h2>${state.evidenceSelection.selectedCount} source${state.evidenceSelection.selectedCount === 1 ? "" : "s"} ready</h2><p>Stable Zotero source IDs are preserved in the note.</p></div><button class="text-button" data-view="evidence">Review selection ↗</button></section>${noteWorkflowPanel()}`;
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
  return `<div class="page-intro compact">${eyebrow("Connections / local-first")}<h1>Connect without handing over a password.</h1><p>ThesisOS first checks Zotero Desktop on this machine. The local API needs no API key and remains read-only.</p></div>${sectionActivity(["zotero"])}${connectionPanel()}<section class="connection-flow"><article><span>01</span><h3>Connect Zotero Desktop</h3><p>ThesisOS checks the local Zotero API. Your Zotero username and password are never requested.</p></article><article><span>02</span><h3>Choose a library</h3><p>If several personal or group libraries contain papers, choose one and remember it for this project.</p></article><article><span>03</span><h3>Review real metadata</h3><p>Load top-level papers into the Library view with source IDs and a visible read-only boundary.</p></article></section><section class="cloud-note panel"><div><span class="label">ZOTERO CLOUD · LATER</span><h2>Cloud authorization is documented, not simulated.</h2><p>A future Connect Zotero Cloud action will redirect to zotero.org using OAuth. Manual API keys and passwords will not be the normal onboarding flow.</p></div><button class="button button-outline" disabled>Connect Zotero Cloud · not available</button></section><section class="integration-list secondary-integrations"><article class="integration panel${state.noteWrite ? "" : " muted"}"><div class="integration-icon">O</div><div><span class="label">LOCAL MARKDOWN ADAPTER</span><h2>Obsidian</h2><p>${state.noteWrite ? `Literature note written to ${esc(state.noteWrite.path)}.` : "Preview evidence-linked Markdown, then explicitly approve a write into a local vault."}</p></div><span class="integration-state">${state.noteWrite ? "Connected" : "Ready"}</span></article><article class="integration panel muted"><div class="integration-icon">G</div><div><span class="label">THESIS REPOSITORY</span><h2>Overleaf / Git</h2><p>Not implemented. It will prepare reviewable patches rather than overwrite thesis text.</p></div><span class="integration-state">Not connected</span></article></section>`;
}

function settings() { return `<div class="page-intro compact">${eyebrow("Workspace / settings")}<h1>Keep the boundaries visible.</h1><p>These settings describe the baseline that is actually running.</p></div><section class="settings-list panel"><div class="setting-row"><div><strong>Local-first workspace</strong><p>Feedback and project labels are stored in this browser. Zotero is read through the local app server.</p></div><span class="toggle on"><i></i> On</span></div><div class="setting-row"><div><strong>Zotero write access</strong><p>This baseline cannot modify library items, notes, attachments, or collections.</p></div><span class="setting-value">Disabled</span></div><div class="setting-row"><div><strong>Project label</strong><p>${esc(state.project)}</p></div><button class="text-button" data-action="rename-project">Rename</button></div></section>`; }

function about() { return `<div class="page-intro">${eyebrow("About / product promise")}<h1>Research without the black box.</h1><p>ThesisOS keeps thesis intent, supervisor feedback, proposed work, and selected evidence in one reviewable local trail.</p></div><section class="about-grid"><article class="panel"><span>01</span><h2>Understand the thesis</h2><p>Project documents and manuscript structure propose context for your approval.</p></article><article class="panel"><span>02</span><h2>Keep feedback intact</h2><p>The original comment stays beside every task created from it.</p></article><article class="panel"><span>03</span><h2>Approve every boundary</h2><p>Search is read-only. Writes require a separate, explicit decision.</p></article></section>`; }

function render() {
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
  const view = state.view === "overview" ? overview() : state.view === "profile" ? profile() : state.view === "tasks" ? tasks() : state.view === "evidence" ? evidence() : state.view === "notes" ? notes() : state.view === "integrations" ? integrations() : state.view === "about" ? about() : settings();
  app.innerHTML = shell(view);
}

function applyConnection(payload) {
  state.connection = payload;
  state.papers = payload.papers || [];
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
    else if (payload.status === "selection_required") completeActivity("Choose a Zotero library.", "ThesisOS found more than one available library.");
    else failActivity(new Error(payload.message || "Zotero Desktop is not available."), "connect-zotero");
  } catch (error) {
    const message = `The ThesisOS app server could not complete the connection: ${error.message}`;
    applyConnection({ status: "unavailable", mode: null, access: null, library: null, libraries: [], paperCount: 0, message });
    failActivity(new Error(message), "connect-zotero");
  }
}

function connectZotero() { return requestConnection("/api/zotero/status"); }
function connectDemoLibrary() { return requestConnection("/api/demo/library"); }
function selectZotero(library) { return requestConnection("/api/zotero/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ library }) }); }

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
    ? "Approve this read-only literature task and ThesisOS will immediately search Zotero and open the results."
    : "This proposed task traces back to the validated feedback artifact. Approval changes the task state; write integrations still require a separate approval.";
  const taskAction = task.approvalStatus === "pending"
    ? `${button(canLaunchLiterature ? "Approve & search Zotero →" : "Approve task", `approve-task:${task.id}`, "dark", state.workflowBusy)}${button("Reject", `reject-task:${task.id}`, "outline", state.workflowBusy)}`
    : task.approvalStatus === "approved" && task.kind === "literature"
      ? button(state.workflowBusy ? "Searching…" : "Search Zotero →", "search-zotero", "dark", state.workflowBusy || state.connection.status !== "connected")
      : `<span class="muted-action">Task ${esc(task.approvalStatus)}</span>`;
  modal.innerHTML = `<section class="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-title"><button class="modal-close" data-close-modal aria-label="Close">×</button><span class="label">${esc(task.kind)} task · ${esc(task.tool)}</span><h2 id="task-title">${esc(task.title)}</h2><p class="modal-copy">${modalCopy}</p>${sectionActivity(["task-review", "zotero-search"])}<div class="modal-detail"><span>Approval</span><strong class="${task.approvalStatus}">${statusLabel(task.approvalStatus)}</strong><span>Execution</span><strong>${task.kind === "literature" ? "Read-only Zotero search" : "Adapter not implemented"}</strong><span>Source</span><strong>User-provided supervisor feedback</strong></div>${state.workflowError ? `<p class="form-error" role="alert">${esc(state.workflowError)}</p>` : ""}<div class="modal-actions">${taskAction}<button class="text-button" data-close-modal>Close</button></div></section>`;
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

async function handleAction(action) {
  if (action === "start-onboarding") { state.onboardingStep = 1; saveState(); return render(); }
  if (action.startsWith("onboarding-next:")) { state.onboardingStep = Number(action.split(":")[1]); saveState(); return render(); }
  if (action === "finish-onboarding") { state.onboardingStep = 0; state.view = "overview"; state.setupCollapsed = false; saveState(); location.hash = "overview"; return render(); }
  if (action === "toggle-setup") { state.setupCollapsed = !state.setupCollapsed; saveState(); return render(); }
  if (action === "open-profile") return setView("profile");
  if (action === "new-feedback") return setView("overview");
  if (action === "open-library") return setView("evidence");
  if (action === "open-literature-task") {
    const literatureTask = state.tasks.find((task) => task.kind === "literature");
    if (literatureTask) return openTask(literatureTask.id);
    return setView("overview");
  }
  if (action === "connect-zotero") return connectZotero();
  if (action === "use-demo-library") return connectDemoLibrary();
  if (action === "choose-existing-vault" || action === "create-obsidian-vault" || action === "change-obsidian-vault") {
    const mode = action === "create-obsidian-vault" ? "create" : "existing";
    const name = mode === "create" ? window.prompt("New vault name", state.project || "ThesisOS") : undefined;
    if (mode === "create" && !name?.trim()) return;
    beginActivity("vault-picker", "Opening the Obsidian vault picker…", "Choose an existing folder or create a new project vault.", action);
    try {
      const response = await fetch("/api/obsidian/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, ...(name ? { name: name.trim() } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Obsidian vault could not be configured.");
      state.obsidianVaultPath = payload.vault.path;
      state.noteWrite = null;
      completeActivity("Obsidian vault connected.", "Notes will be saved inside its Evidence folder.");
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
          searchArtifact: selectedSearchArtifact,
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
    try {
      const response = await fetch("/api/workflow/notes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: state.project, feedback: state.feedback, evidenceRefs: state.evidenceRefs, draft: null })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The Obsidian note preview could not be created.");
      state.notePreview = payload;
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
  if (action === "rename-project") {
    const next = window.prompt("Project label", state.project);
    if (next?.trim()) { state.project = next.trim(); saveState(); render(); }
    return;
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
      if (shouldSearchLiterature) return handleAction("search-zotero");
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
      state.searchQuery = payload.query || state.searchQuery;
      state.candidates = payload.candidates || [];
      state.selectedSourceIds = [];
      state.evidenceSelection = null;
      state.evidenceRefs = [];
      state.noteDraft = null;
      state.notePreview = null;
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
    const response = await fetch("/api/workflow/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: state.feedback, title: state.feedbackTitle, project: state.project, provider: state.workflowProvider, ...(state.projectState ? { expectedRevision: state.projectState.revision } : {}) })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "The workflow could not create tasks.");
    state.taskGraph = payload.taskGraph;
    state.thesisState = payload.state;
    if (payload.state?.schemaVersion === 3) {
      state.projectState = payload.state;
      state.profileReadiness = payload.readiness;
      state.feedbackThreadId = payload.state.feedbackThreads.at(-1)?.id || null;
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
  if (["overview", "profile", "tasks", "evidence", "notes", "integrations", "settings", "about"].includes(view) && state.view !== view) { state.view = view; saveState(); render(); }
});
const initialView = location.hash.replace("#", "");
if (["overview", "profile", "tasks", "evidence", "notes", "integrations", "settings", "about"].includes(initialView)) state.view = initialView;
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
