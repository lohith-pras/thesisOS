import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { decomposeFeedback } from "../src/core/decompose.mjs";

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

test("decomposes feedback through the selected runtime and returns validated artifacts", async () => {
  let invocation;
  await withServer({
    decomposeCodex: async (feedback, options) => {
      invocation = { feedback, options };
      return decomposeFeedback(feedback);
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/decompose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback: "Compare the cited paper in Section 3.2.",
        project: "ISAC thesis",
        provider: "codex",
        model: "test-model"
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(invocation, {
      feedback: "Compare the cited paper in Section 3.2.",
      options: { model: "test-model", cwd: process.cwd() }
    });
    assert.equal(payload.runtime.provider, "codex");
    assert.equal(payload.runtime.model, "test-model");
    assert.equal(payload.runtime.validated, true);
    assert.equal(payload.taskGraph.tasks[0].approvalStatus, "pending");
    assert.equal(payload.state.project, "ISAC thesis");
    assert.equal(payload.state.privacy.approvalRequiredForWrites, true);
  });
});

test("rejects unsupported decomposition providers before invoking a model", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/decompose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "Review this paper.", provider: "unknown" })
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /provider/i);
  });
});

test("applies a task review decision to both workflow artifacts", async () => {
  const taskGraph = decomposeFeedback("Compare a paper in Section 3.2.");
  const { createThesisState } = await import("../src/core/state.mjs");
  const state = createThesisState({ project: "ISAC thesis", feedback: taskGraph.feedback, taskGraph });

  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskGraph, state, taskId: "task-literature", decision: "approved" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.taskGraph.tasks[0].approvalStatus, "approved");
    assert.equal(payload.state.feedbackThreads[0].tasks[0].approvalStatus, "approved");
  });
});

test("searches the saved Zotero library only after receiving an approved graph", async () => {
  const taskGraph = decomposeFeedback("Compare Khalili 2025 with related papers.");
  taskGraph.tasks[0].approvalStatus = "approved";
  let invocation;

  await withServer({
    loadSelection: async () => ({ type: "group", id: "6568124", name: "isac_project_thesis" }),
    searchPapers: async (graph, options) => {
      invocation = { graph, options };
      return { schemaVersion: 1, taskId: "task-literature", query: options.query, totalResults: 1, candidates: [{ key: "A", sourceId: "group:6568124:A", title: "Paper A" }] };
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskGraph, query: "distributed ISAC" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.candidates[0].sourceId, "group:6568124:A");
    assert.equal(invocation.graph.tasks[0].approvalStatus, "approved");
    assert.deepEqual(invocation.options.savedLibrary, { type: "group", id: "6568124", name: "isac_project_thesis" });
    assert.equal(invocation.options.query, "distributed ISAC");
  });
});

test("attaches selected Zotero candidates as structured evidence references", async () => {
  const taskGraph = decomposeFeedback("Compare Khalili 2025 with related papers.");
  taskGraph.tasks[0].approvalStatus = "approved";
  const searchArtifact = {
    schemaVersion: 1,
    taskId: "task-literature",
    query: "Khalili 2025",
    candidates: [{
      key: "ABC123",
      sourceId: "group:6568124:ABC123",
      sourceLibrary: { type: "group", id: "6568124", name: "isac_project_thesis" },
      title: "Distributed ISAC",
      creators: ["Ada Khalili"],
      year: "2025",
      doi: "10.1000/isac",
      url: "https://example.test/isac"
    }]
  };

  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/evidence/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskGraph, searchArtifact, sourceIds: ["group:6568124:ABC123"] })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.selection.selectedCount, 1);
    assert.deepEqual(payload.taskGraph.tasks[0].evidenceRefs[0], {
      sourceId: "group:6568124:ABC123",
      key: "ABC123",
      library: { type: "group", id: "6568124", name: "isac_project_thesis" },
      title: "Distributed ISAC",
      creators: ["Ada Khalili"],
      year: "2025",
      doi: "10.1000/isac",
      url: "https://example.test/isac"
    });
  });
});

test("previews an evidence-linked Obsidian note without writing a file", async () => {
  const evidenceRefs = [{
    sourceId: "group:6568124:ABC123",
    key: "ABC123",
    library: { type: "group", id: "6568124", name: "isac_project_thesis" },
    title: "Distributed ISAC",
    creators: ["Ada Khalili"],
    year: "2025",
    doi: "10.1000/isac",
    url: "https://example.test/isac"
  }];

  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/notes/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: "ISAC thesis", feedback: "Compare the paper.", evidenceRefs })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.match(payload.markdown, /# Literature evidence — ISAC thesis/);
    assert.match(payload.markdown, /group:6568124:ABC123/);
    assert.match(payload.markdown, /https:\/\/doi\.org\/10\.1000\/isac/);
    assert.equal(payload.writeApproved, false);
  });
});

test("writes an Obsidian note only with explicit approval", async () => {
  const vaultPath = await mkdtemp(join(tmpdir(), "thesisos-vault-"));
  try {
    await withServer({}, async (baseUrl) => {
      const previewResponse = await fetch(`${baseUrl}/api/workflow/notes/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "ISAC thesis",
          feedback: "Compare the paper.",
          evidenceRefs: [{ sourceId: "group:1:A", key: "A", title: "Paper A", creators: [], year: null, doi: null, url: null, library: { type: "group", id: "1", name: "Research" } }]
        })
      });
      const preview = await previewResponse.json();

      const denied = await fetch(`${baseUrl}/api/workflow/notes/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath, preview, approved: false })
      });
      assert.equal(denied.status, 400);

      const response = await fetch(`${baseUrl}/api/workflow/notes/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath, preview, approved: true })
      });
      const artifact = await response.json();

      assert.equal(response.status, 201);
      assert.equal(artifact.writeApproved, true);
      assert.match(artifact.path, /ThesisOS\/Literature\/literature-evidence-isac-thesis\.md$/);
      assert.equal(await readFile(artifact.path, "utf8"), preview.markdown);
    });
  } finally {
    await rm(vaultPath, { recursive: true, force: true });
  }
});

test("serves an explicitly labelled demo library without Zotero", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/demo/library`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "connected");
    assert.equal(payload.mode, "demo");
    assert.equal(payload.fixture, true);
    assert.ok(payload.paperCount >= 3);
    assert.match(payload.papers[0].sourceId, /^fixture:demo:/);
  });
});

test("searches the demo fixture through the approved workflow path", async () => {
  const taskGraph = decomposeFeedback("Compare distributed ISAC literature.");
  taskGraph.tasks[0].approvalStatus = "approved";

  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskGraph, mode: "demo", query: "distributed" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, "demo-fixture");
    assert.equal(payload.fixture, true);
    assert.ok(payload.candidates.some((paper) => /distributed/i.test(paper.title)));
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

test("frontend submits feedback to the validated workflow API instead of creating placeholder tasks", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/workflow\/decompose/);
  assert.match(source, /taskGraph/);
  assert.doesNotMatch(source, /state\.tasks\s*=\s*\[/);
});

test("frontend sends approval and literature search through workflow APIs", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/workflow\/review/);
  assert.match(source, /\/api\/workflow\/search/);
  assert.doesNotMatch(source, /task\.approvalStatus\s*=\s*"approved"/);
});

test("frontend delegates clicks from a boundary that includes body-level task modals", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /document\.addEventListener\("click"/);
  assert.doesNotMatch(source, /app\.addEventListener\("click"/);
});

test("frontend records selected papers through the evidence selection API", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/workflow\/evidence\/select/);
  assert.match(source, /selectedSourceIds/);
  assert.match(source, /evidenceRefs/);
});

test("full library exposes the next literature action instead of presenting inert cards as selectable", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /approvedLiteratureTask/);
  assert.match(source, /Search approved literature/);
  assert.match(source, /Review literature task/);
});

test("frontend previews and explicitly approves Obsidian note writes", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/workflow\/notes\/preview/);
  assert.match(source, /\/api\/workflow\/notes\/write/);
  assert.match(source, /approved:\s*true/);
  assert.match(source, /Obsidian vault path/);
});

test("frontend offers a clearly labelled opt-in demo library", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/demo\/library/);
  assert.match(source, /Use demo library/);
  assert.match(source, /Demo data/);
});

test("website design records the local-first Zotero connection flow", async () => {
  const design = await readFile(resolve("design.md"), "utf8");
  assert.match(design, /## Zotero connection user flow/);
  assert.match(design, /Connect Zotero Desktop/);
  assert.match(design, /selection_required/);
  assert.match(design, /Connect Zotero Cloud/);
  assert.match(design, /never asks for.*Zotero password/i);
});
