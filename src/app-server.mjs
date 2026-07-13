import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listZoteroPapers } from "./core/zotero.mjs";
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
    if (size > 16_384) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/api/zotero/status") {
        const savedLibrary = await loadSelection(projectDir);
        const artifact = await listPapers(savedLibrary ? { savedLibrary } : {});
        sendJson(response, 200, connectionPayload(artifact));
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
      const mapped = connectionError(error);
      sendJson(response, mapped.statusCode, mapped.body);
    }
  });
}

export function startAppServer(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.THESISOS_PORT ?? 4173);
  const server = createAppServer(options.dependencies);
  server.listen(port, host, () => {
    console.log(`ThesisOS workspace: http://${host}:${port}`);
    console.log("Zotero access: local, read-only, no API key required");
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startAppServer();
