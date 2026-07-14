import { createServer } from "node:http";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { listZoteroPapers, searchZotero } from "./core/zotero.mjs";
import { decomposeFeedback } from "./core/decompose.mjs";
import { decomposeFeedbackWithCodex } from "./core/codex.mjs";
import { draftEvidenceNoteWithCodex } from "./core/codex.mjs";
import { DEFAULT_MODEL, decomposeFeedbackWithModelProvider, decomposeFeedbackWithOpenAI } from "./core/openai.mjs";
import { createThesisState } from "./core/state.mjs";
import { validateArtifacts } from "./core/schema.mjs";
import { applyReviewDecisions } from "./core/review.mjs";
import { selectEvidenceReferences } from "./core/evidence.mjs";
import { createObsidianNotePreview, writeObsidianNote } from "./core/obsidian.mjs";
import { createDeterministicDraft, draftEvidenceNoteWithOpenAI } from "./core/note-drafting.mjs";
import { createDemoProjectState, demoLibraryPayload, searchDemoLibrary } from "./core/demo-library.mjs";
import { loadZoteroSelection, saveZoteroSelection } from "./zotero-cli.mjs";
import { chooseObsidianVault, inspectObsidianVault, loadObsidianVault } from "./core/obsidian-vault.mjs";
import { acceptProfileProposal, answerProfileQuestions, createProfileProposal, createProjectState, loadProjectState, profileReadiness, recordFeedback, recordFeedbackTasks, recordProjectDocument, reviewCanonicalTask, saveProjectState, updateProjectPaths, updateProjectScan } from "./core/project-state.mjs";
import { scanThesisCheckout } from "./core/thesis-scan.mjs";
import { extractProjectDocument } from "./core/project-document.mjs";
import { proposeProfileWithCodex, proposeProfileWithOpenAI } from "./core/profile-extraction.mjs";
import { buildThesisContext } from "./core/thesis-context.mjs";
import { mapBibliographyToSources } from "./core/citation-mapping.mjs";
import { createPaperCard, paperMap } from "./core/paper-map.mjs";
import { auditObsidianVault } from "./core/vault-audit.mjs";
import { attachCanonicalEvidence, recordCanonicalDraft, workflowReadModel } from "./core/workflow.mjs";

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = resolve(SOURCE_DIR, "..");
const APP_DIR = resolve(WORKSPACE_DIR, "app");
const MAX_REQUEST_BODY_SIZE = 1 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_BODY_SIZE = 28 * 1024 * 1024;
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function connectionPayload(artifact) {
  return {
    status: "connected",
    mode: artifact.provider === "zotero-web" ? "cloud" : "local",
    access: artifact.access,
    library: artifact.library,
    libraries: artifact.libraries,
    paperCount: artifact.paperCount,
    papers: artifact.papers
  };
}

function connectionError(error) {
  if (error.code === "ZOTERO_LIBRARY_SELECTION_REQUIRED") {
    return { statusCode: 409, body: { status: "selection_required", code: error.code, message: error.message, libraries: error.libraries } };
  }
  const statusCode = error.code === "ZOTERO_ACCESS_DENIED" ? 403
    : new Set(["ZOTERO_SAVED_LIBRARY_STALE", "ZOTERO_LIBRARY_EMPTY", "ZOTERO_NO_PAPERS"]).has(error.code) ? 409
      : error.code === "ZOTERO_INVALID_RESPONSE" ? 502
        : 503;
  return {
    statusCode,
    body: {
      status: "unavailable",
      code: error.code ?? "ZOTERO_CONNECTION_FAILED",
      message: error.message,
      ...(error.libraries ? { libraries: error.libraries } : {})
    }
  };
}

async function readJsonBody(request, maxSize = MAX_REQUEST_BODY_SIZE) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

async function serveApp(pathname, response) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const filePath = resolve(APP_DIR, relativePath);
  if (!filePath.startsWith(`${APP_DIR}/`) && filePath !== resolve(APP_DIR, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

export function createAppServer(dependencies = {}) {
  const projectDir = dependencies.projectDir ?? WORKSPACE_DIR;
  const listPapers = dependencies.listPapers ?? listZoteroPapers;
  const loadSelection = dependencies.loadSelection ?? loadZoteroSelection;
  const saveSelection = dependencies.saveSelection ?? saveZoteroSelection;
  const decomposeOffline = dependencies.decomposeOffline ?? decomposeFeedback;
  const decomposeCodex = dependencies.decomposeCodex ?? decomposeFeedbackWithCodex;
  const decomposeOpenAI = dependencies.decomposeOpenAI ?? decomposeFeedbackWithOpenAI;
  const decomposeModel = dependencies.decomposeModel ?? decomposeFeedbackWithModelProvider;
  const reviewTasks = dependencies.reviewTasks ?? applyReviewDecisions;
  const searchPapers = dependencies.searchPapers ?? searchZotero;
  const selectEvidence = dependencies.selectEvidence ?? selectEvidenceReferences;
  const previewNote = dependencies.previewNote ?? createObsidianNotePreview;
  const writeNote = dependencies.writeNote ?? writeObsidianNote;
  const loadDemoLibrary = dependencies.loadDemoLibrary ?? demoLibraryPayload;
  const searchDemo = dependencies.searchDemo ?? searchDemoLibrary;
  const draftOpenAI = dependencies.draftOpenAI ?? draftEvidenceNoteWithOpenAI;
  const draftCodex = dependencies.draftCodex ?? draftEvidenceNoteWithCodex;
  const draftFallback = dependencies.draftFallback ?? createDeterministicDraft;
  const judgeMode = dependencies.judgeMode === true;
  const extractDocument = dependencies.extractDocument ?? extractProjectDocument;
  const proposeProfile = dependencies.proposeProfile ?? proposeProfileWithCodex;
  const proposeProfileOpenAI = dependencies.proposeProfileOpenAI ?? proposeProfileWithOpenAI;
  const createCard = dependencies.createPaperCard ?? createPaperCard;
  const buildPaperMap = dependencies.paperMap ?? paperMap;
  const auditVault = dependencies.auditVault ?? auditObsidianVault;
  const canonicalStatePath = resolve(projectDir, ".thesisos", "thesis-state.json");
  let judgeState = judgeMode ? createDemoProjectState() : null;
  const stateExists = async () => {
    if (judgeState) return true;
    try { await access(canonicalStatePath); return true; } catch { return false; }
  };
  const loadCanonicalState = async () => judgeState ?? loadProjectState(canonicalStatePath);
  const persistCanonicalState = async (state) => {
    if (judgeMode) { judgeState = state; return state; }
    return saveProjectState(canonicalStatePath, state);
  };
  const loadConfiguredVaultRoot = async () => {
    if (await stateExists()) {
      const state = await loadCanonicalState();
      if (state.project.vaultPath) return resolve(state.project.vaultPath);
    }
    const legacyPath = await loadObsidianVault(projectDir);
    return legacyPath ? resolve(legacyPath) : null;
  };
  const requireConfiguredVaultRoot = async (requestedPath) => {
    const configuredRoot = await loadConfiguredVaultRoot();
    if (!configuredRoot) throw httpError(409, "Configure an Obsidian vault before using vault operations.");
    if (typeof requestedPath === "string" && requestedPath.trim() && resolve(requestedPath) !== configuredRoot) {
      throw httpError(403, "Vault operations are restricted to the configured vault root.");
    }
    return configuredRoot;
  };
  const canonicalWorkflow = (state) => {
    const thread = state.feedbackThreads.at(-1);
    if (!thread) return null;
    const workflow = workflowReadModel(state, thread.id);
    const preview = workflow.draft ? previewNote({
      project: state.project.name,
      feedback: workflow.feedback,
      evidenceRefs: workflow.selectedEvidence,
      draft: workflow.draft
    }) : null;
    return { ...workflow, preview };
  };

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/api/project") {
        if (!await stateExists()) { sendJson(response, 200, { initialized: false }); return; }
        const state = await loadCanonicalState();
        sendJson(response, 200, { initialized: true, state, readiness: profileReadiness(state), workflow: canonicalWorkflow(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/init") {
        const body = await readJsonBody(request);
        if (!body.project?.trim()) throw httpError(400, "Project name is required.");
        const thesisDir = typeof body.thesisDir === "string" && body.thesisDir.trim() ? resolve(body.thesisDir) : null;
        const vaultPath = typeof body.vaultPath === "string" && body.vaultPath.trim() ? resolve(body.vaultPath) : null;
        let state = createProjectState({ project: body.project, thesisDir, vaultPath });
        if (thesisDir) {
          const scan = await scanThesisCheckout(thesisDir);
          state = updateProjectScan(state, { scan, mapping: mapBibliographyToSources(scan.bibliography, []), sources: [] });
        }
        await persistCanonicalState(state);
        sendJson(response, 201, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/feedback") {
        const body = await readJsonBody(request);
        const state = recordFeedback(await loadCanonicalState(), body);
        await persistCanonicalState(state);
        sendJson(response, 201, { state, readiness: profileReadiness(state), feedbackThread: state.feedbackThreads.at(-1) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/paths") {
        const body = await readJsonBody(request);
        const thesisDir = typeof body.thesisDir === "string" && body.thesisDir.trim() ? resolve(body.thesisDir) : body.thesisDir === null ? null : undefined;
        const vaultPath = typeof body.vaultPath === "string" && body.vaultPath.trim() ? resolve(body.vaultPath) : body.vaultPath === null ? null : undefined;
        let state = updateProjectPaths(await loadCanonicalState(), { thesisDir, vaultPath, expectedRevision: body.expectedRevision });
        if (thesisDir) {
          const scan = await scanThesisCheckout(thesisDir);
          state = updateProjectScan(state, { scan, mapping: mapBibliographyToSources(scan.bibliography, []), sources: [] });
        }
        await persistCanonicalState(state);
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/documents/import") {
        const body = await readJsonBody(request);
        let state = await loadCanonicalState();
        const extracted = await extractDocument(resolve(body.path));
        const id = `document-${extracted.metadata.sha256.slice(0, 12)}`;
        state = recordProjectDocument(state, { id, ...extracted.metadata, localPath: resolve(body.path) }, { expectedRevision: body.expectedRevision });
        await persistCanonicalState(state);
        sendJson(response, 200, { state, readiness: profileReadiness(state), document: state.documents.find((item) => item.id === id) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/documents/upload") {
        const body = await readJsonBody(request, MAX_DOCUMENT_UPLOAD_BODY_SIZE);
        if (typeof body.filename !== "string" || !body.filename.trim()) throw httpError(400, "Document filename is required.");
        if (typeof body.contentBase64 !== "string" || !body.contentBase64) throw httpError(400, "Document content is required.");
        const filename = basename(body.filename.trim());
        if (!new Set([".pdf", ".md", ".txt"]).has(extname(filename).toLowerCase())) throw httpError(400, "Use a PDF, Markdown, or plain-text project document.");
        const data = Buffer.from(body.contentBase64, "base64");
        if (!data.length || data.length > 20 * 1024 * 1024) throw httpError(data.length ? 413 : 400, data.length ? "The project document is larger than 20 MB." : "Document content is empty.");
        const uploadDir = resolve(projectDir, ".thesisos", "uploads", randomUUID());
        await mkdir(uploadDir, { recursive: true });
        const path = resolve(uploadDir, filename);
        await writeFile(path, data, { flag: "wx" });
        let state = await loadCanonicalState();
        const extracted = await extractDocument(path);
        const id = `document-${extracted.metadata.sha256.slice(0, 12)}`;
        state = recordProjectDocument(state, { id, ...extracted.metadata, localPath: path }, { expectedRevision: body.expectedRevision });
        await persistCanonicalState(state);
        sendJson(response, 200, { state, readiness: profileReadiness(state), document: state.documents.find((item) => item.id === id) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/profile/propose") {
        const body = await readJsonBody(request);
        let state = await loadCanonicalState();
        if (body.expectedRevision !== state.revision) throw Object.assign(new Error(`STATE_STALE: expected revision ${body.expectedRevision}, current revision is ${state.revision}.`), { code: "STATE_STALE" });
        const metadata = state.documents.find(({ id }) => id === body.documentId);
        if (!metadata) throw httpError(404, "Project document was not found.");
        const extracted = await extractDocument(metadata.localPath);
        const provider = body.provider ?? "codex";
        if (!new Set(["codex", "openai"]).has(provider)) throw httpError(400, "Profile provider must be 'codex' or 'openai'.");
        const proposer = provider === "openai" ? proposeProfileOpenAI : proposeProfile;
        const proposal = await proposer({ document: { id: metadata.id, ...extracted }, approvedExternalProcessing: body.approvedExternalProcessing }, { cwd: state.project.thesisDir ?? projectDir, model: body.model });
        state = createProfileProposal(state, proposal, { provider, model: body.model, expectedRevision: body.expectedRevision });
        await persistCanonicalState(state);
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/profile/review") {
        const body = await readJsonBody(request);
        let state = acceptProfileProposal(await loadCanonicalState(), body);
        await persistCanonicalState(state);
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/profile/answers") {
        const body = await readJsonBody(request);
        let state = answerProfileQuestions(await loadCanonicalState(), body);
        await persistCanonicalState(state);
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/zotero/status") {
        if (judgeMode) {
          sendJson(response, 200, loadDemoLibrary());
          return;
        }
        const savedLibrary = await loadSelection(projectDir);
        const artifact = await listPapers(savedLibrary ? { savedLibrary } : {});
        sendJson(response, 200, connectionPayload(artifact));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/demo/library") {
        sendJson(response, 200, loadDemoLibrary());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/obsidian/status") {
        const vaultPath = await loadConfiguredVaultRoot();
        sendJson(response, 200, { configured: Boolean(vaultPath), ...(vaultPath ? { vault: await inspectObsidianVault(vaultPath) } : {}) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/papers/card") {
        const body = await readJsonBody(request);
        try {
          const card = createCard(body.source);
          sendJson(response, 200, { card, map: buildPaperMap(card) });
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/obsidian/audit") {
        const body = await readJsonBody(request);
        if (judgeMode) throw httpError(403, "Judge mode cannot inspect a local vault.");
        const vaultRoot = await requireConfiguredVaultRoot(body.vaultPath);
        try {
          sendJson(response, 200, await auditVault(vaultRoot));
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/obsidian/pick") {
        const body = await readJsonBody(request);
        if (!new Set(["existing", "create"]).has(body.mode)) throw httpError(400, "Vault mode must be 'existing' or 'create'.");
        const vault = await chooseObsidianVault(projectDir, { mode: body.mode, name: body.name });
        if (await stateExists()) {
          const current = await loadCanonicalState();
          const state = updateProjectPaths(current, { vaultPath: vault.path, expectedRevision: current.revision });
          await persistCanonicalState(state);
        }
        sendJson(response, 200, { configured: true, vault });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/zotero/select") {
        const body = await readJsonBody(request);
        if (typeof body.library !== "string" || !body.library.trim()) {
          sendJson(response, 400, { status: "invalid_request", message: "A Zotero library name or ID is required." });
          return;
        }
        const artifact = await listPapers({ library: body.library.trim() });
        await saveSelection(projectDir, artifact.library);
        sendJson(response, 200, connectionPayload(artifact));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/decompose") {
        const body = await readJsonBody(request);
        const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
        const project = typeof body.project === "string" && body.project.trim() ? body.project.trim() : "Thesis workspace";
        const provider = body.provider ?? "offline";
        if (!feedback) throw httpError(400, "Supervisor feedback is required.");
        if (!new Set(["offline", "codex", "openai", "openrouter", "ollama"]).has(provider)) {
          throw httpError(400, "Decomposition provider must be 'offline', 'codex', 'openai', 'openrouter', or 'ollama'.");
        }

        const canonical = await stateExists() ? await loadCanonicalState() : null;
        const context = canonical ? buildThesisContext(canonical, "decomposition", { feedback }) : null;
        let runtimeProvider = provider;
        let runtimeWarning;
        let taskGraph;
        if (judgeMode) {
          taskGraph = await decomposeOffline(feedback, context ? { context } : undefined);
          runtimeProvider = "offline-fallback";
          runtimeWarning = "Judge mode uses deterministic task decomposition and does not call an external model.";
        } else if (provider === "codex") {
          try {
            taskGraph = await decomposeCodex(feedback, { model: body.model, cwd: projectDir, ...(context ? { context } : {}) });
          } catch (error) {
            throw error;
          }
        } else taskGraph = provider === "openai"
          ? await decomposeOpenAI(feedback, { model: body.model, ...(context ? { context } : {}) })
          : provider === "openrouter" || provider === "ollama"
            ? await decomposeModel(feedback, { provider, model: body.model, ...(context ? { context } : {}) })
            : await decomposeOffline(feedback, context ? { context } : undefined);
        if (canonical) {
          const knownObjectives = new Set(canonical.profile.objectives.map(({ id }) => id));
          const knownLocations = new Set((canonical.manuscript.chapters ?? []).map(({ id }) => id));
          taskGraph = { ...taskGraph, tasks: taskGraph.tasks.map((task) => {
            const objectiveIds = task.objectiveIds ?? context.objectives.map(({ id }) => id);
            const targetLocationIds = task.targetLocationIds ?? context.targetLocations.map(({ id }) => id);
            for (const id of objectiveIds) if (!knownObjectives.has(id)) throw httpError(422, `Task '${task.id}' references unknown objective '${id}'.`);
            for (const id of targetLocationIds) if (!knownLocations.has(id)) throw httpError(422, `Task '${task.id}' references unknown manuscript location '${id}'.`);
            return { ...task, objectiveIds, targetLocationIds };
          }) };
          const persisted = recordFeedbackTasks(canonical, { feedback, title: body.title, taskGraph, context }, { expectedRevision: body.expectedRevision });
          await persistCanonicalState(persisted);
          sendJson(response, 200, { taskGraph, state: persisted, context, readiness: profileReadiness(persisted), runtime: { provider: runtimeProvider, model: body.model || (provider === "openai" ? DEFAULT_MODEL : provider === "offline" ? "deterministic-v1" : "codex-default"), validated: true, ...(runtimeWarning ? { warning: runtimeWarning } : {}) } });
          return;
        }
        const state = createThesisState({ project, feedback, taskGraph });
        validateArtifacts(taskGraph, state);
        sendJson(response, 200, {
          taskGraph,
          state,
          runtime: {
            provider: runtimeProvider,
            model: body.model || (provider === "openai" ? DEFAULT_MODEL : provider === "offline" ? "deterministic-v1" : "codex-default"),
            validated: true,
            ...(runtimeWarning ? { warning: runtimeWarning } : {})
          }
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/review") {
        const body = await readJsonBody(request);
        if (body.feedbackThreadId && await stateExists()) {
          try {
            const state = reviewCanonicalTask(await loadCanonicalState(), body);
            await persistCanonicalState(state);
            const thread = state.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
            sendJson(response, 200, { state, taskGraph: { schemaVersion: 1, feedback: thread.feedback, tasks: thread.tasks, nextAction: "Run approved work" } });
          } catch (error) { throw httpError(error.code === "STATE_STALE" ? 409 : 400, error.message); }
          return;
        }
        if (typeof body.taskId !== "string" || !body.taskId.trim()) throw httpError(400, "A task ID is required.");
        if (!new Set(["approved", "rejected"]).has(body.decision)) throw httpError(400, "Decision must be 'approved' or 'rejected'.");
        try {
          const reviewed = reviewTasks(body.taskGraph, body.state, { [body.taskId]: body.decision });
          sendJson(response, 200, reviewed);
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/search") {
        const body = await readJsonBody(request);
        if (body.feedbackThreadId && await stateExists()) {
          const state = await loadCanonicalState();
          const thread = state.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
          if (!thread) throw httpError(404, "Feedback thread was not found.");
          const context = buildThesisContext(state, "retrieval", { feedback: thread.feedback });
          const taskGraph = { schemaVersion: 1, feedback: thread.feedback, tasks: thread.tasks, nextAction: "Search approved evidence" };
          const query = typeof body.query === "string" && body.query.trim() ? body.query.trim() : context.query;
          if (body.mode === "demo") sendJson(response, 200, await searchDemo(taskGraph, { query }));
          else {
            const savedLibrary = await loadSelection(projectDir);
            sendJson(response, 200, await searchPapers(taskGraph, { ...(savedLibrary ? { savedLibrary } : {}), query, cachePath: resolve(projectDir, ".thesisos-cache", "zotero-embeddings.json") }));
          }
          return;
        }
        if (body.mode === "demo") {
          try {
            sendJson(response, 200, await searchDemo(body.taskGraph, { query: body.query }));
          } catch (error) {
            throw httpError(409, error.message);
          }
          return;
        }
        const savedLibrary = await loadSelection(projectDir);
        try {
          const artifact = await searchPapers(body.taskGraph, {
            ...(savedLibrary ? { savedLibrary } : {}),
            ...(typeof body.query === "string" && body.query.trim() ? { query: body.query.trim() } : {}),
            cachePath: resolve(projectDir, ".thesisos-cache", "zotero-embeddings.json")
          });
          sendJson(response, 200, artifact);
        } catch (error) {
          if (error.code) throw error;
          throw httpError(409, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/evidence/select") {
        const body = await readJsonBody(request);
        if (body.feedbackThreadId && await stateExists()) {
          try {
            const state = attachCanonicalEvidence(await loadCanonicalState(), body, { searchArtifact: body.searchArtifact });
            await persistCanonicalState(state);
            const workflow = canonicalWorkflow(state);
            sendJson(response, 200, { state, workflow, taskGraph: workflow.taskGraph, selection: workflow.evidenceSelection });
          } catch (error) { throw httpError(error.code === "STATE_STALE" ? 409 : 400, error.message); }
          return;
        }
        try {
          sendJson(response, 200, selectEvidence(body.taskGraph, body.searchArtifact, body.sourceIds));
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/notes/preview") {
        const body = await readJsonBody(request);
        try {
          sendJson(response, 200, previewNote(body));
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/notes/draft") {
        const body = await readJsonBody(request);
        if (body.approvedExternalProcessing !== true) throw httpError(400, "Explicit approval is required before sending selected evidence to the drafting provider.");
        const canonical = body.feedbackThreadId && await stateExists() ? await loadCanonicalState() : null;
        const thread = canonical?.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
        if (canonical && !thread) throw httpError(404, "Feedback thread was not found.");
        const selectedEvidence = canonical
          ? canonical.evidence.filter((record) => record.feedbackThreadId === body.feedbackThreadId && record.taskId === body.taskId)
          : body.evidenceRefs;
        const draftInput = canonical ? { ...body, feedback: thread.feedback, evidenceRefs: selectedEvidence } : body;
        let draft;
        try {
          if (judgeMode) draft = draftFallback(draftInput.feedback, draftInput.evidenceRefs, "Judge mode uses the deterministic grounded template and does not call an external drafting API.");
          else if (body.provider === "codex") draft = await draftCodex(draftInput, { model: body.model, cwd: projectDir });
          else draft = await draftOpenAI(draftInput, { model: body.model });
        } catch (error) {
          const providerLabel = body.provider === "codex" ? "Codex CLI drafting unavailable" : "GPT-5.6 drafting unavailable";
          draft = draftFallback(draftInput.feedback, draftInput.evidenceRefs, `${providerLabel}; deterministic template used. ${error.message}`);
        }
        if (canonical) {
          try {
            const state = recordCanonicalDraft(canonical, { ...body, draft }, { provider: draft.provider ?? body.provider, model: draft.model ?? body.model });
            await persistCanonicalState(state);
            sendJson(response, 200, { ...draft, state, workflow: canonicalWorkflow(state) });
          } catch (error) { throw httpError(error.code === "STATE_STALE" ? 409 : 400, error.message); }
          return;
        }
        sendJson(response, 200, draft);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/notes/write") {
        if (judgeMode) throw httpError(403, "Judge mode is preview-only and cannot write to the filesystem.");
        const body = await readJsonBody(request);
        const vaultRoot = await requireConfiguredVaultRoot(body.vaultPath);
        try {
          const artifact = await writeNote(body.preview, { vaultPath: vaultRoot, approved: body.approved });
          sendJson(response, 201, artifact);
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { status: "not_found", message: "API endpoint not found." });
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      await serveApp(url.pathname, response);
    } catch (error) {
      if (error.code === "PROFILE_INCOMPLETE" || error.code === "STATE_STALE") {
        sendJson(response, 409, { status: "conflict", code: error.code, message: error.message, ...(error.missing ? { missing: error.missing } : {}) });
        return;
      }
      if (error.code?.startsWith("DOCUMENT_")) {
        sendJson(response, 422, { status: "invalid_document", code: error.code, message: error.message });
        return;
      }
      if (error.statusCode) {
        sendJson(response, error.statusCode, { status: "invalid_request", message: error.message });
        return;
      }
      const mapped = connectionError(error);
      sendJson(response, mapped.statusCode, mapped.body);
    }
  });
}

export function startAppServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.THESISOS_PORT ?? 4173);
  const server = createAppServer({ ...options.dependencies, judgeMode: options.judgeMode ?? options.dependencies?.judgeMode });
  server.listen(port, host, () => {
    console.log(`ThesisOS workspace: http://${host}:${port}`);
    console.log("Zotero access: local, read-only, no API key required");
    if (options.judgeMode) console.log("Judge mode: demo library active; no Zotero or Ollama required");
  });
  return server;
}

export function parseAppArgs(args = []) {
  const unknown = args.filter((arg) => arg !== "--demo");
  if (unknown.length) throw new Error(`Unknown app option: ${unknown[0]}`);
  return { judgeMode: args.includes("--demo") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startAppServer(parseAppArgs(process.argv.slice(2)));
