import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listZoteroPapers, searchZotero } from "./core/zotero.mjs";
import { decomposeFeedback } from "./core/decompose.mjs";
import { decomposeFeedbackWithCodex } from "./core/codex.mjs";
import { DEFAULT_MODEL, decomposeFeedbackWithOpenAI } from "./core/openai.mjs";
import { createThesisState } from "./core/state.mjs";
import { validateArtifacts } from "./core/schema.mjs";
import { applyReviewDecisions } from "./core/review.mjs";
import { selectEvidenceReferences } from "./core/evidence.mjs";
import { createObsidianNotePreview, writeObsidianNote } from "./core/obsidian.mjs";
import { createDeterministicDraft, draftEvidenceNoteWithOpenAI } from "./core/note-drafting.mjs";
import { demoLibraryPayload, searchDemoLibrary } from "./core/demo-library.mjs";
import { loadZoteroSelection, saveZoteroSelection } from "./zotero-cli.mjs";

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = resolve(SOURCE_DIR, "..");
const APP_DIR = resolve(WORKSPACE_DIR, "app");
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

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw httpError(413, "Request body is too large.");
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
  const reviewTasks = dependencies.reviewTasks ?? applyReviewDecisions;
  const searchPapers = dependencies.searchPapers ?? searchZotero;
  const selectEvidence = dependencies.selectEvidence ?? selectEvidenceReferences;
  const previewNote = dependencies.previewNote ?? createObsidianNotePreview;
  const writeNote = dependencies.writeNote ?? writeObsidianNote;
  const loadDemoLibrary = dependencies.loadDemoLibrary ?? demoLibraryPayload;
  const searchDemo = dependencies.searchDemo ?? searchDemoLibrary;
  const draftOpenAI = dependencies.draftOpenAI ?? draftEvidenceNoteWithOpenAI;
  const draftFallback = dependencies.draftFallback ?? createDeterministicDraft;
  const judgeMode = dependencies.judgeMode === true;

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
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
        if (!new Set(["offline", "codex", "openai"]).has(provider)) {
          throw httpError(400, "Decomposition provider must be 'offline', 'codex', or 'openai'.");
        }

        let runtimeProvider = provider;
        let runtimeWarning;
        let taskGraph;
        if (provider === "codex") {
          try {
            taskGraph = await decomposeCodex(feedback, { model: body.model, cwd: projectDir });
          } catch (error) {
            if (!judgeMode) throw error;
            taskGraph = await decomposeOffline(feedback);
            runtimeProvider = "offline-fallback";
            runtimeWarning = `Codex CLI unavailable in judge mode; deterministic fallback used. ${error.message}`;
          }
        } else taskGraph = provider === "openai"
          ? await decomposeOpenAI(feedback, { model: body.model })
          : await decomposeOffline(feedback);
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
        if (body.approvedExternalProcessing !== true) throw httpError(400, "Explicit approval is required before sending selected evidence to GPT-5.6.");
        if (judgeMode) {
          sendJson(response, 200, draftFallback(body.feedback, body.evidenceRefs, "Judge mode uses the deterministic grounded template and does not call an external drafting API."));
          return;
        }
        try {
          sendJson(response, 200, await draftOpenAI(body, { model: body.model }));
        } catch (error) {
          sendJson(response, 200, draftFallback(body.feedback, body.evidenceRefs, `GPT-5.6 drafting unavailable; deterministic template used. ${error.message}`));
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/workflow/notes/write") {
        if (judgeMode) throw httpError(403, "Judge mode is preview-only and cannot write to the filesystem.");
        const body = await readJsonBody(request);
        try {
          const artifact = await writeNote(body.preview, { vaultPath: body.vaultPath, approved: body.approved });
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
