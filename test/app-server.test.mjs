import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function appServerModule() {
  try {
    return await import("../src/app-server.mjs");
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  }
}

async function withServer(dependencies, run) {
  const { createAppServer } = await appServerModule();
  assert.equal(typeof createAppServer, "function");
  const server = createAppServer(dependencies);
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

test("serves real Zotero connection status and papers to the frontend", async () => {
  await withServer({
    projectDir: process.cwd(),
    listPapers: async () => ({
      provider: "zotero-local",
      access: "read-only",
      library: { type: "group", id: "6568124", name: "isac_project_thesis", paperCount: 2 },
      libraries: [{ type: "group", id: "6568124", name: "isac_project_thesis", paperCount: 2 }],
      paperCount: 2,
      papers: [
        { key: "A", sourceId: "group:6568124:A", itemType: "journalArticle", title: "Paper A", creators: ["Ada Author"], year: "2025", publicationTitle: "Journal", doi: "10.1/a", url: null },
        { key: "B", sourceId: "group:6568124:B", itemType: "preprint", title: "Paper B", creators: [], year: null, publicationTitle: null, doi: null, url: null }
      ]
    }),
    loadSelection: async () => ({ type: "group", id: "6568124" }),
    saveSelection: async () => {}
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/zotero/status`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "connected",
      mode: "local",
      access: "read-only",
      library: { type: "group", id: "6568124", name: "isac_project_thesis", paperCount: 2 },
      libraries: [{ type: "group", id: "6568124", name: "isac_project_thesis", paperCount: 2 }],
      paperCount: 2,
      papers: [
        { key: "A", sourceId: "group:6568124:A", itemType: "journalArticle", title: "Paper A", creators: ["Ada Author"], year: "2025", publicationTitle: "Journal", doi: "10.1/a", url: null },
        { key: "B", sourceId: "group:6568124:B", itemType: "preprint", title: "Paper B", creators: [], year: null, publicationTitle: null, doi: null, url: null }
      ]
    });
  });
});

test("returns a selectable library catalog when automatic selection is ambiguous", async () => {
  const selectionError = Object.assign(new Error("Choose a library"), {
    code: "ZOTERO_LIBRARY_SELECTION_REQUIRED",
    libraries: [
      { type: "user", id: "0", name: "My Library", paperCount: 8 },
      { type: "group", id: "10", name: "Research", paperCount: 40 }
    ]
  });
  await withServer({
    listPapers: async () => { throw selectionError; },
    loadSelection: async () => null,
    saveSelection: async () => {}
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/zotero/status`);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      status: "selection_required",
      code: "ZOTERO_LIBRARY_SELECTION_REQUIRED",
      message: "Choose a library",
      libraries: selectionError.libraries
    });
  });
});

test("selects and persists a Zotero library through the frontend API", async () => {
  let selected;
  let saved;
  await withServer({
    listPapers: async (options) => {
      selected = options.library;
      return {
        provider: "zotero-local",
        access: "read-only",
        library: { type: "group", id: "10", name: "Research", paperCount: 0 },
        libraries: [{ type: "group", id: "10", name: "Research", paperCount: 0 }],
        paperCount: 0,
        papers: []
      };
    },
    loadSelection: async () => null,
    saveSelection: async (_projectDir, library) => { saved = library; }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/zotero/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library: "10" })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "connected");
    assert.equal(selected, "10");
    assert.equal(saved.id, "10");
  });
});

test("frontend copy contains no fictitious project, researcher, feedback, or papers", async () => {
  const source = `${await readFile(resolve("app/app.js"), "utf8")}\n${await readFile(resolve("landing/index.html"), "utf8")}`;
  for (const placeholder of [
    "Avery Kim",
    "Prof. L. Andersson",
    "Smith 2026",
    "MSc Thesis / Learning Sciences",
    "Metacognitive writing strategies",
    "Self-regulated learning and revision",
    "The role of feedback literacy"
  ]) {
    assert.doesNotMatch(source, new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /Connect Zotero Desktop/);
  assert.match(source, /Open Zotero and try again/);
  assert.match(source, /Choose a library/);
  assert.match(source, /Zotero Cloud/);
});

test("website design records the local-first Zotero connection flow", async () => {
  const design = await readFile(resolve("design.md"), "utf8");
  assert.match(design, /## Zotero connection user flow/);
  assert.match(design, /Connect Zotero Desktop/);
  assert.match(design, /selection_required/);
  assert.match(design, /Connect Zotero Cloud/);
  assert.match(design, /never asks for.*Zotero password/i);
});
