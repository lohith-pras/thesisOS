import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { createDemoGroundedDraft, createDemoProjectState, DEMO_FEEDBACK_OPTIONS, decomposeDemoFeedback, demoLibraryPayload, searchDemoLibrary } from "./core/demo-library.mjs";
import { loadZoteroSelection } from "./zotero-cli.mjs";
import { chooseObsidianVault, inspectObsidianVault, loadObsidianVault, pickFolder, validateVaultName } from "./core/obsidian-vault.mjs";
import { acceptProfileProposal, answerProfileQuestions, createProfileProposal, createProjectState, loadProjectState, profileReadiness, recordProjectDocument, renameProject, saveProjectState, updateProjectPaths, updateProjectScan, updateZoteroLibrary } from "./core/project-state.mjs";
import { scanThesisCheckout } from "./core/thesis-scan.mjs";
import { extractProjectDocument } from "./core/project-document.mjs";
import { proposeProfileWithCodex, proposeProfileWithOpenAI } from "./core/profile-extraction.mjs";
import { buildThesisContext } from "./core/thesis-context.mjs";
import { mapBibliographyToSources } from "./core/citation-mapping.mjs";
import { createPaperCard, paperMap } from "./core/paper-map.mjs";
import { auditObsidianVault } from "./core/vault-audit.mjs";
import { workflowReadModel } from "./core/workflow.mjs";
import { createRevisionWorkflow } from "./core/revision-workflow.mjs";
import { createWorkflowRuntime } from "./core/workflow-runtime.mjs";
import { createRevisionResponseMatrix } from "./core/revision-response-matrix.mjs";
import { createClaimTraceback } from "./core/claim-traceback.mjs";
import { reconcileSeedReferences } from "./core/seed-reference-reconciliation.mjs";

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = resolve(SOURCE_DIR, "..");
const APP_DIR = resolve(WORKSPACE_DIR, "app");
const LANDING_DIR = resolve(WORKSPACE_DIR, "landing");
const MAX_REQUEST_BODY_SIZE = 1 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_BODY_SIZE = 28 * 1024 * 1024;
const NOTE_PREVIEW_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_NOTE_PREVIEWS = 256;
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:"
};
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS
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

function openLocalApp(application, path) {
  return new Promise((resolveOpen, rejectOpen) => {
    let command;
    let args;
    if (process.platform === "darwin") {
      command = "open";
      args = application === "Obsidian" ? [`obsidian://open?path=${encodeURIComponent(path)}`] : ["-a", application, path];
    } else if (process.platform === "win32") {
      // Do not route a user-selected path through cmd.exe: shell metacharacters in
      // a folder name must remain data, never become a second command.
      command = application === "Visual Studio Code" ? "code" : "obsidian";
      args = application === "Obsidian" ? [`obsidian://open?path=${encodeURIComponent(path)}`] : [path];
    } else {
      command = application === "Visual Studio Code" ? "code" : "obsidian";
      args = [path];
    }
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", (error) => rejectOpen(new Error(`Could not open ${application}: ${error.message}`)));
    child.once("close", (code) => code === 0
      ? resolveOpen()
      : rejectOpen(new Error(`Could not open ${application}.`)));
  });
}

function openExternalUrl(url) {
  return new Promise((resolveOpen, rejectOpen) => {
    const [command, args] = process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["explorer.exe", [url]]
        : ["xdg-open", [url]];
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", (error) => rejectOpen(new Error(`Could not open Overleaf: ${error.message}`)));
    child.once("close", (code) => code === 0 ? resolveOpen() : rejectOpen(new Error("Could not open Overleaf.")));
  });
}

async function readJsonBody(request, maxSize = MAX_REQUEST_BODY_SIZE) {
  const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw httpError(415, "API requests with a body must use application/json.");
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

function requireExpectedRevision(state, expectedRevision) {
  if (expectedRevision === undefined || expectedRevision === null) {
    const error = new Error("REVISION_REQUIRED: include expectedRevision from GET /api/project before changing this workspace.");
    error.code = "REVISION_REQUIRED";
    throw error;
  }
  if (expectedRevision !== state.revision) {
    const error = new Error(`STATE_STALE: expected revision ${expectedRevision}, current revision is ${state.revision}.`);
    error.code = "STATE_STALE";
    throw error;
  }
}

function requireTrustedMutationOrigin(request) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(request.method)) return;
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}`) {
    throw httpError(403, "Cross-origin mutation requests are not allowed.");
  }
  if (!origin && request.headers["sec-fetch-site"] === "cross-site") {
    throw httpError(403, "Cross-origin mutation requests are not allowed.");
  }
}

function mutationRequestError(error) {
  return new Set(["REVISION_REQUIRED", "STATE_STALE", "PROFILE_INCOMPLETE"]).has(error.code)
    ? error
    : httpError(400, error.message);
}

async function serveStatic(rootDir, relativePath, response) {
  const filePath = resolve(rootDir, relativePath);
  if (!filePath.startsWith(`${rootDir}/`) && filePath !== resolve(rootDir, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS
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
  const decomposeDemo = dependencies.decomposeDemo ?? decomposeDemoFeedback;
  const draftDemo = dependencies.draftDemo ?? createDemoGroundedDraft;
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
  const launchWorkspaceApp = dependencies.launchWorkspaceApp ?? openLocalApp;
  const launchExternalUrl = dependencies.launchExternalUrl ?? openExternalUrl;
  const pickWorkspaceFolder = dependencies.pickWorkspaceFolder ?? pickFolder;
  const chooseVault = dependencies.chooseObsidianVault ?? chooseObsidianVault;
  const canonicalStatePath = resolve(projectDir, ".thesisos", "thesis-state.json");
  const runtime = createWorkflowRuntime({
    judgeMode,
    statePath: canonicalStatePath,
    accessState: access,
    loadStateFile: loadProjectState,
    saveStateFile: saveProjectState,
    createDemoState: createDemoProjectState,
    demoLibrary: loadDemoLibrary,
    decomposeDemo,
    searchDemo,
    draftDemo
  });
  const stateExists = () => runtime.stateExists();
  let mutationTail = Promise.resolve();
  const serializeCanonicalMutation = (operation) => {
    const run = mutationTail.then(operation, operation);
    mutationTail = run.catch(() => {});
    return run;
  };
  const loadCanonicalState = () => runtime.loadState();
  const persistCanonicalState = (state, options = {}) => runtime.saveState(state, typeof options === "number" ? { expectedRevision: options } : options);
  const pendingNotePreviews = new Map();
  const issueNotePreview = (preview) => {
    const now = Date.now();
    for (const [token, pending] of pendingNotePreviews) if (pending.expiresAt <= now) pendingNotePreviews.delete(token);
    while (pendingNotePreviews.size >= MAX_PENDING_NOTE_PREVIEWS) pendingNotePreviews.delete(pendingNotePreviews.keys().next().value);
    const writeToken = randomUUID();
    pendingNotePreviews.set(writeToken, { preview, expiresAt: now + NOTE_PREVIEW_TTL_MS });
    return { ...preview, writeToken };
  };
  const consumeNotePreview = (candidate) => {
    const writeToken = candidate?.writeToken;
    const pending = typeof writeToken === "string" ? pendingNotePreviews.get(writeToken) : null;
    if (!pending || pending.expiresAt <= Date.now()) {
      if (writeToken) pendingNotePreviews.delete(writeToken);
      throw httpError(400, "Create a fresh note preview before approving a filesystem write.");
    }
    pendingNotePreviews.delete(writeToken);
    return pending.preview;
  };
  const loadConfiguredVaultRoot = async () => {
    if (await stateExists()) {
      const state = await loadCanonicalState();
      return state.project.vaultPath ? resolve(state.project.vaultPath) : null;
    }
    if (runtime.kind === "judge") return null;
    const legacyPath = await loadObsidianVault(projectDir);
    return legacyPath ? resolve(legacyPath) : null;
  };
  const selectedZoteroLibrary = async () => {
    if (runtime.kind === "judge") return null;
    if (await stateExists()) return (await loadCanonicalState()).project.zoteroLibrary ?? null;
    return loadSelection(projectDir);
  };
  const requireConfiguredVaultRoot = async (requestedPath) => {
    const configuredRoot = await loadConfiguredVaultRoot();
    if (!configuredRoot) throw httpError(409, "Configure an Obsidian vault before using vault operations.");
    if (typeof requestedPath === "string" && requestedPath.trim() && resolve(requestedPath) !== configuredRoot) {
      throw httpError(403, "Vault operations are restricted to the configured vault root.");
    }
    return configuredRoot;
  };
  const revisionWorkflow = createRevisionWorkflow({ loadState: loadCanonicalState, persistState: persistCanonicalState, previewNote, serialize: serializeCanonicalMutation });
  const canonicalWorkflow = (state, feedbackThreadId = null) => {
    const thread = feedbackThreadId ? state.feedbackThreads.find(({ id }) => id === feedbackThreadId) : state.feedbackThreads.at(-1);
    if (!thread) return null;
    const workflow = workflowReadModel(state, thread.id);
    const preview = workflow.draft ? previewNote({ project: state.project.name, feedback: workflow.feedback, evidenceRefs: workflow.selectedEvidence, draft: workflow.draft }) : null;
    return { ...workflow, preview: preview ? issueNotePreview(preview) : null };
  };
  const canonicalNoteInput = async (body) => {
    if (!body.feedbackThreadId || !body.taskId) {
      throw httpError(400, "A canonical feedback thread and task are required before preparing a note in this workspace.");
    }
    const state = await loadCanonicalState();
    const thread = state.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
    if (!thread) throw httpError(404, "Feedback thread was not found.");
    const task = thread.tasks?.find(({ id }) => id === body.taskId);
    if (!task) throw httpError(404, "Task was not found.");
    const evidenceRefs = state.evidence.filter((record) => record.feedbackThreadId === thread.id && record.taskId === task.id);
    if (!evidenceRefs.length) throw httpError(409, "Selected canonical evidence is required before preparing a note.");
    const draft = evidenceRefs.find((record) => record.draft)?.draft ?? null;
    return { project: state.project.name, feedback: thread.feedback, evidenceRefs, draft };
  };
  const issueWorkflowPreview = (result) => result?.workflow?.preview
    ? { ...result, workflow: { ...result.workflow, preview: issueNotePreview(result.workflow.preview) } }
    : result;
  const judgeBlockedRoutes = new Set([
    "/api/project/init",
    "/api/project/paths",
    "/api/project/documents/import",
    "/api/project/documents/upload",
    "/api/project/profile/propose",
    "/api/obsidian/pick",
    "/api/workspace/pick",
    "/api/workspace/open",
    "/api/zotero/select"
  ]);

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      requireTrustedMutationOrigin(request);
      if (runtime.kind === "judge" && judgeBlockedRoutes.has(url.pathname)) {
        throw httpError(403, "Judge mode is isolated and cannot access local files, applications, Zotero, or external models.");
      }
      if (request.method === "GET" && url.pathname === "/api/project") {
        if (!await stateExists()) { sendJson(response, 200, { initialized: false }); return; }
        const state = await loadCanonicalState();
        sendJson(response, 200, { initialized: true, state, readiness: profileReadiness(state), workflow: canonicalWorkflow(state) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workflow") {
        if (!await stateExists()) throw httpError(409, "Create a research workspace before opening feedback history.");
        try { sendJson(response, 200, issueWorkflowPreview(await revisionWorkflow.read(url.searchParams.get("feedbackThreadId")))); }
        catch (error) { throw httpError(error.code === "NOT_FOUND" ? 404 : 400, error.message); }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/revision-response-matrix") {
        if (!await stateExists()) throw httpError(409, "Create a research workspace before exporting a revision response matrix.");
        sendJson(response, 200, createRevisionResponseMatrix(await loadCanonicalState()));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workflow/claim-traceback") {
        if (!await stateExists()) throw httpError(409, "Create a research workspace before tracing a grounded source note.");
        const feedbackThreadId = url.searchParams.get("feedbackThreadId");
        const sourceId = url.searchParams.get("sourceId");
        if (!feedbackThreadId || !sourceId) throw httpError(400, "Feedback thread ID and source ID are required.");
        try {
          sendJson(response, 200, createClaimTraceback(await loadCanonicalState(), { feedbackThreadId, sourceId }));
        } catch (error) {
          throw httpError(404, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/init") {
        const body = await readJsonBody(request);
        if (!body.project?.trim()) throw httpError(400, "Project name is required.");
        const thesisDir = typeof body.thesisDir === "string" && body.thesisDir.trim() ? resolve(body.thesisDir) : null;
        const vaultPath = typeof body.vaultPath === "string" && body.vaultPath.trim() ? resolve(body.vaultPath) : null;
        const state = await serializeCanonicalMutation(async () => {
          if (await stateExists()) throw httpError(409, "A research workspace already exists. Update it through the revisioned project settings instead.");
          let nextState = createProjectState({ project: body.project, thesisDir, vaultPath });
          if (thesisDir) {
            const scan = await scanThesisCheckout(thesisDir);
            nextState = updateProjectScan(nextState, { scan, mapping: mapBibliographyToSources(scan.bibliography, []), sources: [] }, { expectedRevision: nextState.revision });
          }
          await persistCanonicalState(nextState, { expectedRevision: 0, expectAbsent: true });
          return nextState;
        });
        sendJson(response, 201, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/feedback") {
        const body = await readJsonBody(request);
        const result = await revisionWorkflow.capture(body);
        sendJson(response, result.deduplication === "already_saved" ? 200 : 201, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/feedback/placement") {
        const body = await readJsonBody(request);
        try {
          sendJson(response, 200, await revisionWorkflow.confirmPlacement(body));
        } catch (error) { throw mutationRequestError(error); }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/paths") {
        const body = await readJsonBody(request);
        const thesisDir = typeof body.thesisDir === "string" && body.thesisDir.trim() ? resolve(body.thesisDir) : body.thesisDir === null ? null : undefined;
        const vaultPath = typeof body.vaultPath === "string" && body.vaultPath.trim() ? resolve(body.vaultPath) : body.vaultPath === null ? null : undefined;
        let overleafUrl;
        if (body.overleafUrl !== undefined) {
          if (body.overleafUrl === null || !String(body.overleafUrl).trim()) overleafUrl = null;
          else {
            try {
              const url = new URL(String(body.overleafUrl).trim());
              if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)overleaf\.com$/i.test(url.hostname)) throw new Error();
              overleafUrl = url.toString();
            } catch { throw httpError(400, "Use a valid https://www.overleaf.com project URL."); }
          }
        }
        const state = await serializeCanonicalMutation(async () => {
          let nextState = updateProjectPaths(await loadCanonicalState(), { thesisDir, vaultPath, overleafUrl, expectedRevision: body.expectedRevision });
          if (thesisDir) {
            const scan = await scanThesisCheckout(thesisDir);
            nextState = updateProjectScan(nextState, { scan, mapping: mapBibliographyToSources(scan.bibliography, nextState.sources), sources: nextState.sources }, { expectedRevision: nextState.revision });
          }
          await persistCanonicalState(nextState, body.expectedRevision);
          return nextState;
        });
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/settings") {
        const body = await readJsonBody(request);
        try {
          const state = await serializeCanonicalMutation(async () => {
            const nextState = renameProject(await loadCanonicalState(), { name: body.project, expectedRevision: body.expectedRevision });
            await persistCanonicalState(nextState, body.expectedRevision);
            return nextState;
          });
          sendJson(response, 200, { state, readiness: profileReadiness(state) });
        } catch (error) { throw mutationRequestError(error); }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/documents/import") {
        const body = await readJsonBody(request);
        if (typeof body.path !== "string" || !body.path.trim()) throw httpError(400, "Project document path is required.");
        const state = await serializeCanonicalMutation(async () => {
          const current = await loadCanonicalState();
          requireExpectedRevision(current, body.expectedRevision);
          const localPath = resolve(body.path);
          const extracted = await extractDocument(localPath);
          const id = `document-${extracted.metadata.sha256.slice(0, 12)}`;
          const nextState = recordProjectDocument(current, { id, ...extracted.metadata, localPath }, { expectedRevision: body.expectedRevision });
          await persistCanonicalState(nextState, body.expectedRevision);
          return nextState;
        });
        const id = state.documents.at(-1)?.id;
        sendJson(response, 200, { state, readiness: profileReadiness(state), document: state.documents.find((item) => item.id === id) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/documents/upload") {
        const body = await readJsonBody(request, MAX_DOCUMENT_UPLOAD_BODY_SIZE);
        if (typeof body.filename !== "string" || !body.filename.trim()) throw httpError(400, "Document filename is required.");
        if (typeof body.contentBase64 !== "string" || !body.contentBase64) throw httpError(400, "Document content is required.");
        const filename = basename(body.filename.trim());
        if (!new Set([".pdf", ".md", ".txt"]).has(extname(filename).toLowerCase())) throw httpError(400, "Use a PDF, Markdown, or plain-text project document.");
        const base64 = body.contentBase64.replace(/\s/g, "");
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw httpError(400, "Document content must be valid base64.");
        const data = Buffer.from(base64, "base64");
        if (!data.length || data.length > 20 * 1024 * 1024) throw httpError(data.length ? 413 : 400, data.length ? "The project document is larger than 20 MB." : "Document content is empty.");
        await serializeCanonicalMutation(async () => requireExpectedRevision(await loadCanonicalState(), body.expectedRevision));
        const uploadDir = resolve(projectDir, ".thesisos", "uploads", randomUUID());
        await mkdir(uploadDir, { recursive: true, mode: 0o700 });
        const path = resolve(uploadDir, filename);
        await writeFile(path, data, { flag: "wx", mode: 0o600 });
        let state;
        let id;
        try {
          const extracted = await extractDocument(path);
          id = `document-${extracted.metadata.sha256.slice(0, 12)}`;
          state = await serializeCanonicalMutation(async () => {
            const current = await loadCanonicalState();
            const nextState = recordProjectDocument(current, { id, ...extracted.metadata, localPath: path }, { expectedRevision: body.expectedRevision });
            await persistCanonicalState(nextState, body.expectedRevision);
            return nextState;
          });
        } catch (error) {
          await rm(uploadDir, { recursive: true, force: true });
          throw error;
        }
        sendJson(response, 200, { state, readiness: profileReadiness(state), document: state.documents.find((item) => item.id === id) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/profile/propose") {
        const body = await readJsonBody(request);
        const current = await loadCanonicalState();
        requireExpectedRevision(current, body.expectedRevision);
        const metadata = current.documents.find(({ id }) => id === body.documentId);
        if (!metadata) throw httpError(404, "Project document was not found.");
        const extracted = await extractDocument(metadata.localPath);
        const provider = body.provider ?? "codex";
        if (!new Set(["codex", "openai"]).has(provider)) throw httpError(400, "Profile provider must be 'codex' or 'openai'.");
        const proposer = provider === "openai" ? proposeProfileOpenAI : proposeProfile;
        const proposal = await proposer({ document: { id: metadata.id, ...extracted }, approvedExternalProcessing: body.approvedExternalProcessing }, { cwd: current.project.thesisDir ?? projectDir, model: body.model });
        const state = await serializeCanonicalMutation(async () => {
          const nextState = createProfileProposal(await loadCanonicalState(), proposal, { provider, model: body.model, expectedRevision: body.expectedRevision });
          await persistCanonicalState(nextState, body.expectedRevision);
          return nextState;
        });
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/profile/review") {
        const body = await readJsonBody(request);
        const state = await serializeCanonicalMutation(async () => {
          const nextState = acceptProfileProposal(await loadCanonicalState(), body);
          await persistCanonicalState(nextState, body.expectedRevision);
          return nextState;
        });
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/profile/answers") {
        const body = await readJsonBody(request);
        const state = await serializeCanonicalMutation(async () => {
          const nextState = answerProfileQuestions(await loadCanonicalState(), body);
          await persistCanonicalState(nextState, body.expectedRevision);
          return nextState;
        });
        sendJson(response, 200, { state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/zotero/status") {
        if (runtime.kind === "judge") {
          sendJson(response, 200, runtime.library());
          return;
        }
        const savedLibrary = await selectedZoteroLibrary();
        const artifact = await listPapers(savedLibrary ? { savedLibrary } : {});
        sendJson(response, 200, connectionPayload(artifact));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/project/seed-references/reconcile") {
        const state = await loadCanonicalState();
        const library = runtime.kind === "judge"
          ? runtime.library()
          : connectionPayload(await listPapers(state.project.zoteroLibrary ? { savedLibrary: state.project.zoteroLibrary } : {}));
        sendJson(response, 200, { report: reconcileSeedReferences(state.profile?.seedReferences, library.papers ?? []), advisory: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/demo/library") {
        sendJson(response, 200, runtime.library() ?? loadDemoLibrary());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/demo/restart") {
        if (!runtime.capabilities.restartDemo) throw httpError(403, "Demo restart is only available in judge mode.");
        const state = await runtime.restart();
        sendJson(response, 200, { state, readiness: profileReadiness(state), connection: runtime.library() });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/demo/proof") {
        if (!runtime.capabilities.restartDemo) throw httpError(403, "The completed proof replay is only available in judge mode.");
        let state = await runtime.restart();
        const feedback = DEMO_FEEDBACK_OPTIONS[0];
        const captured = await revisionWorkflow.capture({ title: feedback.title, feedback: feedback.text, expectedRevision: state.revision });
        state = captured.state;
        const feedbackThreadId = captured.feedbackThread.id;
        const context = buildThesisContext(state, "decomposition", { feedback: feedback.text, placement: captured.feedbackThread.placement });
        const taskGraph = await runtime.decompose(feedback.text, { context });
        const persisted = await revisionWorkflow.persistTaskGraph({ feedback: feedback.text, title: feedback.title, taskGraph, context, feedbackThreadId, expectedRevision: state.revision });
        state = persisted.state;
        const approved = await revisionWorkflow.reviewTask({ feedbackThreadId, taskId: "task-literature", decision: "approved", expectedRevision: state.revision });
        state = approved.state;
        const searchArtifact = await runtime.search(approved.workflow.taskGraph, { query: context.query });
        const sourceIds = searchArtifact.candidates.slice(0, 3).map(({ sourceId }) => sourceId);
        const attached = await revisionWorkflow.attachEvidence({ feedbackThreadId, taskId: "task-literature", expectedRevision: state.revision, searchArtifact, sourceIds });
        state = attached.state;
        const draft = await runtime.draft(feedback.text, attached.workflow.selectedEvidence);
        const drafted = await revisionWorkflow.recordDraft({ feedbackThreadId, taskId: "task-literature", expectedRevision: state.revision, draft }, { provider: draft.provider, model: draft.model });
        state = drafted.state;
        const sourceId = drafted.workflow.selectedEvidence[0].sourceId;
        sendJson(response, 200, { state, readiness: profileReadiness(state), connection: runtime.library(), workflow: drafted.workflow, claimTraceback: createClaimTraceback(state, { feedbackThreadId, sourceId }), proof: { feedbackThreadId, sourceId } });
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
        if (!runtime.capabilities.inspectVault) throw httpError(403, "Judge mode cannot inspect a local vault.");
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
        if (body.mode === "create") {
          try { validateVaultName(body.name); }
          catch (error) { throw httpError(400, error.message); }
        }
        const selection = await serializeCanonicalMutation(async () => {
          if (await stateExists()) {
            const current = await loadCanonicalState();
            requireExpectedRevision(current, body.expectedRevision);
            const selectedVault = await chooseVault(projectDir, { mode: body.mode, name: body.name, persist: false });
            const nextState = updateProjectPaths(current, { vaultPath: selectedVault.path, expectedRevision: body.expectedRevision });
            await persistCanonicalState(nextState, body.expectedRevision);
            return { vault: selectedVault, state: nextState };
          }
          return { vault: await chooseVault(projectDir, { mode: body.mode, name: body.name }), state: null };
        });
        if (selection.state) {
          const { vault, state } = selection;
          sendJson(response, 200, { configured: true, vault, state, readiness: profileReadiness(state) });
          return;
        }
        sendJson(response, 200, { configured: true, vault: selection.vault });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workspace/pick") {
        const body = await readJsonBody(request);
        if (body.tool !== "vscode") throw httpError(400, "Only a VS Code folder can be selected here.");
        if (!new Set(["existing", "create"]).has(body.mode ?? "existing")) throw httpError(400, "Workspace folder mode must be 'existing' or 'create'.");
        const mode = body.mode ?? "existing";
        const name = mode === "create" && typeof body.name === "string" ? body.name.trim() : "";
        if (mode === "create" && !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,100}$/.test(name)) throw httpError(400, "Use a short folder name containing letters, numbers, spaces, dots, dashes, or underscores.");
        const { state, thesisDir } = await serializeCanonicalMutation(async () => {
          const current = await loadCanonicalState();
          requireExpectedRevision(current, body.expectedRevision);
          let selectedDir = await pickWorkspaceFolder(mode === "create" ? "code-create" : "vscode");
          if (mode === "create") {
            selectedDir = resolve(selectedDir, name);
            try { await mkdir(selectedDir); }
            catch (error) { if (error.code === "EEXIST") throw httpError(409, "A folder with that name already exists. Choose another name."); throw error; }
            await writeFile(resolve(selectedDir, "README.md"), `# ${name}\n\nCreated by Proofline as a local code workspace.\n`, { encoding: "utf8", flag: "wx" });
          }
          const scan = await scanThesisCheckout(selectedDir);
          let nextState = updateProjectPaths(current, { thesisDir: selectedDir, expectedRevision: body.expectedRevision });
          nextState = updateProjectScan(nextState, { scan, mapping: mapBibliographyToSources(scan.bibliography, nextState.sources), sources: nextState.sources }, { expectedRevision: nextState.revision });
          await persistCanonicalState(nextState, body.expectedRevision);
          return { state: nextState, thesisDir: selectedDir };
        });
        sendJson(response, 200, { state, readiness: profileReadiness(state), path: thesisDir });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workspace/open") {
        if (runtime.kind === "judge") throw httpError(403, "Demo mode cannot open local applications.");
        const body = await readJsonBody(request);
        if (!new Set(["obsidian", "vscode", "overleaf"]).has(body.tool)) throw httpError(400, "Only Obsidian, VS Code, and Overleaf can be opened from a task.");
        const state = await loadCanonicalState();
        if (body.tool === "overleaf") {
          if (!state.project.overleafUrl) throw httpError(409, "Add an Overleaf project URL before opening Overleaf.");
          await launchExternalUrl(state.project.overleafUrl);
          sendJson(response, 200, { opened: true, tool: "overleaf", application: "Overleaf", path: state.project.overleafUrl });
          return;
        }
        const path = body.tool === "obsidian" ? state.project.vaultPath : state.project.thesisDir;
        if (!path) throw httpError(409, body.tool === "obsidian" ? "Choose an Obsidian vault before opening Obsidian." : "Link a manuscript folder before opening VS Code.");
        try { await access(path); } catch { throw httpError(409, `The configured ${body.tool === "obsidian" ? "Obsidian vault" : "manuscript folder"} is no longer available.`); }
        const application = body.tool === "obsidian" ? "Obsidian" : "Visual Studio Code";
        await launchWorkspaceApp(application, path);
        sendJson(response, 200, { opened: true, tool: body.tool, application, path });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/zotero/select") {
        const body = await readJsonBody(request);
        if (typeof body.library !== "string" || !body.library.trim()) {
          sendJson(response, 400, { status: "invalid_request", message: "A Zotero library name or ID is required." });
          return;
        }
        if (!await stateExists()) throw httpError(409, "Create a research workspace before selecting its Zotero library.");
        requireExpectedRevision(await loadCanonicalState(), body.expectedRevision);
        const artifact = await listPapers({ library: body.library.trim() });
        const state = await serializeCanonicalMutation(async () => {
          const current = await loadCanonicalState();
          const nextState = updateZoteroLibrary(current, artifact.library, { expectedRevision: body.expectedRevision });
          await persistCanonicalState(nextState, body.expectedRevision);
          return nextState;
        });
        sendJson(response, 200, { ...connectionPayload(artifact), state, readiness: profileReadiness(state) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/decompose") {
        const body = await readJsonBody(request);
        const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
        const project = typeof body.project === "string" && body.project.trim() ? body.project.trim() : "Research workspace";
        const provider = body.provider ?? "offline";
        if (!feedback) throw httpError(400, "Supervisor feedback is required.");
        if (!new Set(["offline", "codex", "openai", "openrouter", "ollama"]).has(provider)) {
          throw httpError(400, "Decomposition provider must be 'offline', 'codex', 'openai', 'openrouter', or 'ollama'.");
        }

        const canonical = await stateExists() ? await loadCanonicalState() : null;
        const feedbackThread = canonical && body.feedbackThreadId ? canonical.feedbackThreads.find(({ id }) => id === body.feedbackThreadId) : null;
        const context = canonical ? buildThesisContext(canonical, "decomposition", { feedback, placement: feedbackThread?.placement }) : null;
        let runtimeProvider = provider;
        let runtimeWarning;
        let taskGraph;
        if (runtime.decompose) {
          taskGraph = await runtime.decompose(feedback, context ? { context } : undefined);
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
          const persisted = await revisionWorkflow.persistTaskGraph({ feedback, title: body.title, taskGraph, context, feedbackThreadId: body.feedbackThreadId ?? null, expectedRevision: body.expectedRevision });
          sendJson(response, 200, { taskGraph, ...persisted, context, runtime: { provider: runtimeProvider, model: body.model || (provider === "openai" ? DEFAULT_MODEL : provider === "offline" ? "deterministic-v1" : "codex-default"), validated: true, ...(runtimeWarning ? { warning: runtimeWarning } : {}) } });
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
            const result = await revisionWorkflow.reviewTask(body);
            sendJson(response, 200, { ...result, taskGraph: result.workflow.taskGraph });
          } catch (error) { throw mutationRequestError(error); }
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
        const hasCanonicalState = await stateExists();
        if (hasCanonicalState && !body.feedbackThreadId) {
          throw httpError(400, "A canonical feedback thread is required before searching from this workspace.");
        }
        if (body.feedbackThreadId && hasCanonicalState) {
          const state = await loadCanonicalState();
          const thread = state.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
          if (!thread) throw httpError(404, "Feedback thread was not found.");
          const context = buildThesisContext(state, "retrieval", { feedback: thread.feedback, placement: thread.placement });
          const taskGraph = workflowReadModel(state, thread.id).taskGraph;
          const query = typeof body.query === "string" && body.query.trim() ? body.query.trim() : context.query;
          const useDemoFixture = body.mode === "demo" || runtime.search;
          let artifact;
          if (useDemoFixture) artifact = await (runtime.search ? runtime.search(taskGraph, { query }) : searchDemo(taskGraph, { query }));
          else {
            const savedLibrary = state.project.zoteroLibrary ?? null;
            artifact = await searchPapers(taskGraph, { ...(savedLibrary ? { savedLibrary } : {}), query, cachePath: resolve(projectDir, ".thesisos-cache", "zotero-embeddings.json") });
          }
          sendJson(response, 200, { ...artifact, retrievalAudit: { query, projection: context } });
          return;
        }
        if (body.mode === "demo" || runtime.search) {
          try {
            sendJson(response, 200, await (runtime.search ? runtime.search(body.taskGraph, { query: body.query }) : searchDemo(body.taskGraph, { query: body.query })));
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
        const hasCanonicalState = await stateExists();
        if (hasCanonicalState && !body.feedbackThreadId) {
          throw httpError(400, "A canonical feedback thread is required before selecting evidence in this workspace.");
        }
        if (body.feedbackThreadId && hasCanonicalState) {
          try {
            const state = await loadCanonicalState();
            const thread = state.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
            if (!thread) throw httpError(404, "Feedback thread was not found.");
            const context = buildThesisContext(state, "retrieval", { feedback: thread.feedback, placement: thread.placement });
            const taskGraph = workflowReadModel(state, thread.id).taskGraph;
            const query = typeof body.query === "string" && body.query.trim() ? body.query.trim() : context.query;
            const useDemoFixture = body.mode === "demo" || runtime.search;
            const savedLibrary = useDemoFixture ? null : state.project.zoteroLibrary ?? null;
            const searchArtifact = useDemoFixture
              ? await (runtime.search ? runtime.search(taskGraph, { query }) : searchDemo(taskGraph, { query }))
              : await searchPapers(taskGraph, {
                ...(savedLibrary ? { savedLibrary } : {}),
                query,
                cachePath: resolve(projectDir, ".thesisos-cache", "zotero-embeddings.json")
              });
            const result = issueWorkflowPreview(await revisionWorkflow.attachEvidence({ ...body, searchArtifact }));
            sendJson(response, 200, { ...result, taskGraph: result.workflow.taskGraph, selection: result.workflow.evidenceSelection });
          } catch (error) { throw mutationRequestError(error); }
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
          const input = await stateExists() ? await canonicalNoteInput(body) : body;
          if (body.citationBoundaryTest === true) {
            const attemptedSourceId = typeof body.attemptedSourceId === "string" && body.attemptedSourceId.trim()
              ? body.attemptedSourceId.trim()
              : "proofline:test:UNSELECTED";
            input.draft = {
              overview: "Intentional citation-boundary check.",
              sourceNotes: [{ sourceId: attemptedSourceId, summary: "This source was never selected.", relevance: "It must be rejected." }]
            };
          }
          sendJson(response, 200, issueNotePreview(previewNote(input)));
        } catch (error) {
          throw httpError(400, error.message);
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/notes/draft") {
        const body = await readJsonBody(request);
        if (body.approvedExternalProcessing !== true) throw httpError(400, "Explicit approval is required before sending selected evidence to the drafting provider.");
        const hasCanonicalState = await stateExists();
        if (hasCanonicalState && (!body.feedbackThreadId || !body.taskId)) {
          throw httpError(400, "A canonical feedback thread and task are required before drafting in this workspace.");
        }
        const canonical = hasCanonicalState ? await loadCanonicalState() : null;
        const thread = canonical?.feedbackThreads.find(({ id }) => id === body.feedbackThreadId);
        if (canonical && !thread) throw httpError(404, "Feedback thread was not found.");
        const selectedEvidence = canonical
          ? canonical.evidence.filter((record) => record.feedbackThreadId === body.feedbackThreadId && record.taskId === body.taskId)
          : body.evidenceRefs;
        const draftingContext = canonical && profileReadiness(canonical).ready
          ? buildThesisContext(canonical, "drafting", { feedback: thread.feedback, placement: thread.placement, selectedEvidenceIds: selectedEvidence.map(({ sourceId }) => sourceId) })
          : null;
        const draftInput = canonical ? { ...body, feedback: thread.feedback, evidenceRefs: selectedEvidence, thesisContext: draftingContext } : body;
        let draft;
        try {
          if (runtime.draft) draft = await runtime.draft(draftInput.feedback, draftInput.evidenceRefs);
          else if (body.provider === "codex") draft = await draftCodex(draftInput, { model: body.model, cwd: projectDir });
          else draft = await draftOpenAI(draftInput, { model: body.model });
        } catch (error) {
          const providerLabel = body.provider === "codex" ? "Codex CLI drafting unavailable" : "GPT-5.6 drafting unavailable";
          draft = draftFallback(draftInput.feedback, draftInput.evidenceRefs, `${providerLabel}; deterministic template used. ${error.message}`);
        }
        if (canonical) {
          try {
            const result = issueWorkflowPreview(await revisionWorkflow.recordDraft({ ...body, draft }, { provider: draft.provider ?? body.provider, model: draft.model ?? body.model }));
            sendJson(response, 200, { ...draft, ...result });
          } catch (error) { throw mutationRequestError(error); }
          return;
        }
        sendJson(response, 200, draft);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/notes/write") {
        if (!runtime.capabilities.writeVault) throw httpError(403, "Judge mode is preview-only and cannot write to the filesystem.");
        const body = await readJsonBody(request);
        const vaultRoot = await requireConfiguredVaultRoot(body.vaultPath);
        try {
          if (body.approved !== true) throw httpError(400, "Explicit approval is required before writing a note.");
          const preview = consumeNotePreview(body.preview);
          const artifact = await writeNote(preview, { vaultPath: vaultRoot, approved: true });
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
      if (url.pathname === "/" || url.pathname === "/index.html") {
        await serveStatic(LANDING_DIR, "index.html", response);
        return;
      }
      if (url.pathname === "/app") {
        response.writeHead(302, { Location: "/app/" }).end();
        return;
      }
      if (url.pathname.startsWith("/app/")) {
        await serveStatic(APP_DIR, url.pathname.slice("/app/".length) || "index.html", response);
        return;
      }
      if (url.pathname.startsWith("/landing/")) {
        await serveStatic(LANDING_DIR, url.pathname.slice("/landing/".length), response);
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    } catch (error) {
      if (error.code === "REVISION_REQUIRED") {
        sendJson(response, 400, { status: "invalid_request", code: error.code, message: error.message });
        return;
      }
      if (error.code === "PROFILE_INCOMPLETE" || error.code === "STATE_STALE" || error.code === "STATE_LOCK_TIMEOUT") {
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
    console.log(`Proofline workspace: http://${host}:${port}`);
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
