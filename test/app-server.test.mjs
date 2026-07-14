import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { decomposeFeedback } from "../src/core/decompose.mjs";
import { createProjectState, saveProjectState } from "../src/core/project-state.mjs";

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
  const temporaryProjectDir = dependencies.projectDir ? null : await mkdtemp(join(tmpdir(), "thesisos-app-server-test-"));
  const server = createAppServer({ ...dependencies, ...(temporaryProjectDir ? { projectDir: temporaryProjectDir } : {}) });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    if (temporaryProjectDir) await rm(temporaryProjectDir, { recursive: true, force: true });
  }
}

test("parses the one-command judge mode flag", async () => {
  const { parseAppArgs } = await appServerModule();
  assert.deepEqual(parseAppArgs(["--demo"]), { judgeMode: true });
  assert.deepEqual(parseAppArgs([]), { judgeMode: false });
  assert.throws(() => parseAppArgs(["--unknown"]), /Unknown app option/);
});

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

test("judge mode starts directly with the labelled demo library", async () => {
  await withServer({
    judgeMode: true,
    loadDemoLibrary: () => ({ status: "connected", mode: "demo", access: "read-only", fixture: true, library: { id: "demo", name: "ThesisOS demo library" }, libraries: [], paperCount: 3, papers: [] })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/zotero/status`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.mode, "demo");
    assert.equal(payload.fixture, true);
  });
});

test("exports a read-only revision response matrix from canonical state", async () => {
  await withServer({ judgeMode: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/revision-response-matrix`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.schemaVersion, 1);
    assert.deepEqual(payload.rows, []);
    assert.match(payload.markdown, /Revision Response Matrix/);
    assert.match(payload.markdown, /No feedback has been captured yet/);
  });
});

test("judge mode uses isolated deterministic project state without mutating the repository project", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-judge-state-test-"));
  try {
    const diskState = createProjectState({ project: "Private repository thesis" });
    const statePath = join(projectDir, ".thesisos", "thesis-state.json");
    await saveProjectState(statePath, diskState);
    const before = await readFile(statePath, "utf8");

    await withServer({ judgeMode: true, projectDir }, async (baseUrl) => {
      const projectResponse = await fetch(`${baseUrl}/api/project`);
      const project = await projectResponse.json();
      assert.equal(projectResponse.status, 200);
      assert.equal(project.state.project.name, "Workplace EV charging flexibility for distribution-grid congestion management");
      assert.equal(project.readiness.ready, true);

      const decomposition = await fetch(`${baseUrl}/api/workflow/decompose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: "Strengthen the evidence in section 3.2.",
          provider: "codex",
          expectedRevision: project.state.revision
        })
      });
      const result = await decomposition.json();
      assert.equal(decomposition.status, 200);
      assert.equal(result.runtime.provider, "offline-fallback");
      assert.equal(result.state.feedbackThreads.length, 1);
      assert.deepEqual(result.taskGraph.tasks.map((task) => task.tool), ["zotero", "obsidian"]);
      assert.doesNotMatch(JSON.stringify(result.taskGraph), /overleaf/i);
    });

    assert.equal(await readFile(statePath, "utf8"), before);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("judge mode labels deterministic decomposition without invoking Codex CLI", async () => {
  let codexInvoked = false;
  await withServer({
    judgeMode: true,
    decomposeCodex: async () => { codexInvoked = true; throw new Error("Codex should not run in judge mode"); }
  }, async (baseUrl) => {
    const project = await (await fetch(`${baseUrl}/api/project`)).json();
    const response = await fetch(`${baseUrl}/api/workflow/decompose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: "Review literature and revise section 3.2.", provider: "codex", expectedRevision: project.state.revision })
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.runtime.provider, "offline-fallback");
    assert.match(payload.runtime.warning, /does not call an external model/);
    assert.equal(codexInvoked, false);
    assert.ok(payload.taskGraph.tasks.length > 0);
  });
});

test("judge mode blocks filesystem writes", async () => {
  await withServer({ judgeMode: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/notes/write`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true, vaultPath: "/tmp", preview: {} }) });
    assert.equal(response.status, 403);
    assert.match((await response.json()).message, /preview-only/);
  });
});

test("creates a paper map and returns a read-only vault audit", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-vault-audit-test-"));
  const vaultPath = join(projectDir, "vault");
  let auditedPath;
  try {
    const state = createProjectState({ project: "Audit thesis", vaultPath });
    await saveProjectState(join(projectDir, ".thesisos", "thesis-state.json"), state);
    await withServer({
      projectDir,
      auditVault: async (path) => { auditedPath = path; return { mode: "read-only", statistics: { noteCount: 2 }, proposals: [] }; }
    }, async (baseUrl) => {
      const paper = await fetch(`${baseUrl}/api/papers/card`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { sourceId: "group:1:A", title: "Paper A", abstract: "Grounded abstract" } })
      });
      const paperPayload = await paper.json();
      assert.equal(paper.status, 200);
      assert.equal(paperPayload.map.root.children[0].status, "grounded");

      const audit = await fetch(`${baseUrl}/api/obsidian/audit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vaultPath })
      });
      assert.equal(audit.status, 200);
      assert.equal((await audit.json()).mode, "read-only");
      assert.equal(auditedPath, vaultPath);
    });
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("rejects vault audit and note writes outside the configured canonical vault root", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-vault-boundary-test-"));
  const configuredVault = join(projectDir, "configured-vault");
  const outsideVault = join(projectDir, "outside-vault");
  let auditInvoked = false;
  let writeInvoked = false;
  try {
    const state = createProjectState({ project: "Boundary thesis", vaultPath: configuredVault });
    await saveProjectState(join(projectDir, ".thesisos", "thesis-state.json"), state);
    await withServer({
      projectDir,
      auditVault: async () => { auditInvoked = true; return {}; },
      writeNote: async () => { writeInvoked = true; return {}; }
    }, async (baseUrl) => {
      const audit = await fetch(`${baseUrl}/api/obsidian/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath: outsideVault })
      });
      const auditBody = await audit.json();
      assert.equal(audit.status, 403);
      assert.match(auditBody.message, /configured vault root/i);

      const write = await fetch(`${baseUrl}/api/workflow/notes/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath: outsideVault, approved: true, preview: { filename: "note.md", markdown: "# Note" } })
      });
      const writeBody = await write.json();
      assert.equal(write.status, 403);
      assert.match(writeBody.message, /configured vault root/i);
      assert.equal(auditInvoked, false);
      assert.equal(writeInvoked, false);
    });
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
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

test("accepts realistic workflow payloads while retaining a bounded request limit", async () => {
  await withServer({
    listPapers: async () => ({
      provider: "zotero-local",
      access: "read-only",
      library: { type: "group", id: "10", name: "Research", paperCount: 0 },
      libraries: [],
      paperCount: 0,
      papers: []
    }),
    saveSelection: async () => {}
  }, async (baseUrl) => {
    const realisticPayload = JSON.stringify({ library: "x".repeat(32 * 1024) });
    const accepted = await fetch(`${baseUrl}/api/zotero/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: realisticPayload
    });
    assert.equal(accepted.status, 200);

    const oversizedPayload = JSON.stringify({ library: "x".repeat(1024 * 1024) });
    const rejected = await fetch(`${baseUrl}/api/zotero/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedPayload
    });
    assert.equal(rejected.status, 413);
    assert.match((await rejected.json()).message, /too large/i);
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
    assert.equal(invocation.feedback, "Compare the cited paper in Section 3.2.");
    assert.equal(invocation.options.model, "test-model");
    assert.match(invocation.options.cwd, /thesisos-app-server-test-/);
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
    retrieval: { mode: "hybrid-semantic" },
    candidates: [{
      key: "ABC123",
      sourceId: "group:6568124:ABC123",
      sourceLibrary: { type: "group", id: "6568124", name: "isac_project_thesis" },
      title: "Distributed ISAC",
      creators: ["Ada Khalili"],
      year: "2025",
      abstract: "A distributed sensing abstract.",
      tags: ["ISAC"],
      doi: "10.1000/isac",
      url: "https://example.test/isac",
      matchScore: 0.82,
      matchReasons: ["Semantically similar"],
      indexedFrom: "abstract-backed"
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
      abstract: "A distributed sensing abstract.",
      tags: ["ISAC"],
      doi: "10.1000/isac",
      url: "https://example.test/isac",
      matchScore: 0.82,
      matchReasons: ["Semantically similar"],
      indexedFrom: "abstract-backed",
      retrievalMode: "hybrid-semantic"
    });
  });
});

test("recovers approved tasks, selected evidence, and grounded draft from canonical state after restart", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-reload-test-"));
  try {
    const state = createProjectState({ project: "ISAC thesis" }, { now: "2026-07-14T00:00:00.000Z" });
    state.feedbackThreads = [{
      id: "feedback-1",
      title: "Section 3.2",
      feedback: "Strengthen the evidence in section 3.2.",
      status: "in_progress",
      createdAt: "2026-07-14T00:00:00.000Z",
      tasks: [{
        id: "task-literature",
        kind: "literature",
        title: "Review supporting literature",
        tool: "zotero",
        status: "ready",
        approvalStatus: "pending",
        dependsOn: [],
        evidence: ["Identify supporting evidence"]
      }]
    }];
    await saveProjectState(join(projectDir, ".thesisos", "thesis-state.json"), state);

    const searchArtifact = {
      schemaVersion: 1,
      taskId: "task-literature",
      query: "supporting evidence",
      retrieval: { mode: "hybrid-semantic" },
      candidates: [{
        key: "ABC123",
        sourceId: "group:6568124:ABC123",
        sourceLibrary: { type: "group", id: "6568124", name: "Research" },
        title: "Distributed ISAC",
        creators: ["Ada Author"],
        year: "2025",
        abstract: "Grounded evidence.",
        tags: ["ISAC"],
        doi: "10.1000/isac",
        url: "https://example.test/isac",
        matchScore: 0.9,
        matchReasons: ["Semantic match"],
        indexedFrom: "abstract-backed"
      }]
    };

    await withServer({
      projectDir,
      draftCodex: async () => ({
        overview: "Grounded overview",
        sourceNotes: [{ sourceId: "group:6568124:ABC123", summary: "Supported", relevance: "Direct" }]
      })
    }, async (baseUrl) => {
      const reviewResponse = await fetch(`${baseUrl}/api/workflow/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackThreadId: "feedback-1", taskId: "task-literature", decision: "approved", expectedRevision: 1 })
      });
      const reviewed = await reviewResponse.json();
      assert.equal(reviewResponse.status, 200);

      const evidenceResponse = await fetch(`${baseUrl}/api/workflow/evidence/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackThreadId: "feedback-1",
          taskId: "task-literature",
          expectedRevision: reviewed.state.revision,
          searchArtifact,
          sourceIds: ["group:6568124:ABC123"]
        })
      });
      const evidence = await evidenceResponse.json();
      assert.equal(evidenceResponse.status, 200);

      const draftResponse = await fetch(`${baseUrl}/api/workflow/notes/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackThreadId: "feedback-1",
          taskId: "task-literature",
          expectedRevision: evidence.state.revision,
          approvedExternalProcessing: true,
          provider: "codex"
        })
      });
      assert.equal(draftResponse.status, 200);
    });

    await withServer({ projectDir }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/project`);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.workflow.feedbackThreadId, "feedback-1");
      assert.equal(payload.workflow.tasks[0].approvalStatus, "approved");
      assert.equal(payload.workflow.selectedEvidence[0].sourceId, "group:6568124:ABC123");
      assert.equal(payload.workflow.draft.overview, "Grounded overview");
      assert.match(payload.workflow.preview.markdown, /Grounded overview/);
      assert.match(payload.workflow.preview.markdown, /group:6568124:ABC123/);
      assert.equal(payload.workflow.nextAllowedAction.id, "preview-evidence-note");
    });
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
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

test("drafting requires consent and falls back without inventing citations", async () => {
  const evidenceRefs = [{ sourceId: "group:1:A", title: "Paper A", abstract: "Evidence abstract" }];
  await withServer({ draftOpenAI: async () => { throw new Error("No API credits"); } }, async (baseUrl) => {
    const refused = await fetch(`${baseUrl}/api/workflow/notes/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: "Review", evidenceRefs }) });
    assert.equal(refused.status, 400);
    const response = await fetch(`${baseUrl}/api/workflow/notes/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: "Review", evidenceRefs, approvedExternalProcessing: true }) });
    const payload = await response.json();
    assert.equal(payload.provider, "deterministic-template");
    assert.equal(payload.sourceNotes[0].sourceId, "group:1:A");
    assert.match(payload.warning, /No API credits/);
  });
});

test("note preview rejects a draft that cites evidence the user did not select", async () => {
  const evidenceRefs = [{ sourceId: "group:1:A", title: "Paper A" }];
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/notes/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: "Test", feedback: "Review", evidenceRefs, draft: { overview: "Unsafe", sourceNotes: [{ sourceId: "group:1:B", summary: "Invented", relevance: "Unknown" }] } }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /unselected source/);
  });
});

test("writes an Obsidian note only with explicit approval", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-note-write-test-"));
  const vaultPath = join(projectDir, "vault");
  try {
    const state = createProjectState({ project: "ISAC thesis", vaultPath });
    await saveProjectState(join(projectDir, ".thesisos", "thesis-state.json"), state);
    await withServer({ projectDir }, async (baseUrl) => {
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
      assert.match(artifact.path, /ThesisOS\/Evidence\/literature-evidence-isac-thesis\.md$/);
      assert.equal(await readFile(artifact.path, "utf8"), preview.markdown);
    });
  } finally {
    await rm(projectDir, { recursive: true, force: true });
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
  const taskGraph = decomposeFeedback("Compare smart EV charging literature.");
  taskGraph.tasks[0].approvalStatus = "approved";

  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflow/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskGraph, mode: "demo", query: "smart charging" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, "demo-fixture");
    assert.equal(payload.fixture, true);
    assert.ok(payload.candidates.some((paper) => /smart charging/i.test(paper.title)));
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
  assert.match(source, /state\.searchArtifact = null/);
  assert.match(source, /state\.searchQuery = ""/);
  assert.doesNotMatch(source, /state\.tasks\s*=\s*\[/);
});

test("frontend sends approval and literature search through workflow APIs", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/workflow\/review/);
  assert.match(source, /\/api\/workflow\/search/);
  assert.match(source, /Approve & search Zotero/);
  assert.match(source, /shouldSearchLiterature/);
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
  assert.match(source, /candidates\.filter\(\(candidate\) => selectedIds\.has\(candidate\.sourceId\)\)/);
  assert.match(source, /evidenceRefs/);
});

test("frontend rehydrates the canonical workflow and sends revisioned evidence and draft mutations", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /function applyCanonicalWorkflow\(workflow\)/);
  assert.match(source, /if \(payload\.workflow\) applyCanonicalWorkflow\(payload\.workflow\)/);
  assert.match(source, /feedbackThreadId: state\.feedbackThreadId/);
  assert.match(source, /taskId: literatureTask\.id/);
  assert.match(source, /expectedRevision: state\.projectState\.revision/);
  assert.match(source, /state\.notePreview = workflow\.preview/);
});

test("frontend promotes attached evidence to a dedicated Codex notes step", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /state\.view = "notes"/);
  assert.match(source, /Evidence notes \/ next step/);
  assert.match(source, /Draft with Codex CLI/);
  assert.match(source, /provider: "codex"/);
  assert.match(source, /Codex CLI is drafting from the selected evidence/);
  assert.match(source, /global-activity/);
  assert.match(source, /section-activity/);
  assert.match(source, /activity-marker/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Building the grounded note preview/);
});

test("frontend uses a quiet marker for async activity", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");
  const styles = await readFile(resolve("app/styles.css"), "utf8");

  assert.match(source, /function beginActivity/);
  assert.match(source, /function completeActivity/);
  assert.match(source, /function failActivity/);
  assert.match(source, /Checking Zotero Desktop/);
  assert.match(source, /Opening the Obsidian vault picker/);
  assert.match(source, /Saving your review decision/);
  assert.match(source, /Saving the approved note to Obsidian/);
  assert.match(source, /activity-marker/);
  assert.doesNotMatch(source, /activity-dots/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(styles, /@keyframes activity-dot/);
  assert.doesNotMatch(styles, /animation:activity-dot/);
});

test("frontend closes task modals with keyboard support and restores focus", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");
  const styles = await readFile(resolve("app/styles.css"), "utf8");

  assert.match(source, /function closeTaskModal\(\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /modal\.returnFocus/);
  assert.match(source, /returnFocus\?\.isConnected/);
  assert.match(source, /closeTaskModal\(\)/);
  assert.doesNotMatch(source, /document\.querySelector\("\.modal-backdrop"\)\?\.remove\(\)/);
  assert.match(styles, /\.modal-backdrop\.is-closing/);
  assert.match(styles, /\.modal-backdrop\.is-closing \.task-modal/);
});

test("frontend selects the deterministic runtime in judge mode", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /function selectedWorkflowProvider\(\) \{ return state\.connection\.mode === "demo" \? "offline"/);
  assert.match(source, /state\.connection\.mode === "demo" \? "offline" : data\.get\("provider"\)/);
  assert.match(source, /Building your deterministic task graph/);
});

test("frontend configures an existing or new Obsidian vault without path pasting", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/obsidian\/status/);
  assert.match(source, /\/api\/obsidian\/pick/);
  assert.match(source, /Choose existing vault/);
  assert.match(source, /Create new vault/);
  assert.match(source, /ThesisOS remembers your choice for this project/);
});

test("full library exposes the next literature action instead of presenting inert cards as selectable", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /approvedLiteratureTask/);
  assert.match(source, /Search approved literature/);
  assert.match(source, /Review literature task/);
});

test("frontend distinguishes a completed zero-result search and offers query refinement", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /state\.searchArtifact !== null/);
  assert.match(source, /No papers matched/);
  assert.match(source, /literature-search-form/);
  assert.match(source, /Search again/);
});

test("frontend previews and explicitly approves Obsidian note writes", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/workflow\/notes\/preview/);
  assert.match(source, /\/api\/workflow\/notes\/write/);
  assert.match(source, /approved:\s*true/);
  assert.match(source, /Choose existing vault/);
  assert.match(source, /OBSIDIAN VAULT CONNECTED/);
});

test("frontend offers a clearly labelled opt-in demo library", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/demo\/library/);
  assert.match(source, /Use demo library/);
  assert.match(source, /Demo data/);
});

test("frontend downloads the revision response matrix from the canonical API", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /\/api\/revision-response-matrix/);
  assert.match(source, /thesisos-revision-response-matrix\.md/);
  assert.match(source, /REVISION RESPONSE MATRIX/);
});

test("frontend exposes Claim Traceback through the canonical workflow API", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");
  const server = await readFile(resolve("src/app-server.mjs"), "utf8");
  assert.match(source, /CLAIM TRACEBACK/);
  assert.match(source, /trace-claim:/);
  assert.match(server, /\/api\/workflow\/claim-traceback/);
});

test("website design records the local-first Zotero connection flow", async () => {
  const design = await readFile(resolve("design.md"), "utf8");
  assert.match(design, /## Zotero connection user flow/);
  assert.match(design, /Connect Zotero Desktop/);
  assert.match(design, /selection_required/);
  assert.match(design, /Connect Zotero Cloud/);
  assert.match(design, /never asks for.*Zotero password/i);
});

test("frontend implements profile onboarding before feedback", async () => {
  const source = await readFile(resolve(process.cwd(), "app", "app.js"), "utf8");
  assert.match(source, /\/api\/project/);
  assert.match(source, /\/api\/project\/init/);
  assert.match(source, /\/api\/project\/documents\/upload/);
  assert.match(source, /\/api\/project\/profile\/propose/);
  assert.match(source, /\/api\/project\/profile\/review/);
  assert.match(source, /\/api\/project\/profile\/answers/);
  assert.match(source, /Profile incomplete/);
  assert.match(source, /profile-form/);
  assert.match(source, /expectedRevision/);
  assert.match(source, /Optional manuscript folder/);
  assert.doesNotMatch(source, /name="thesisDir"[^>]*required/);
});

test("frontend implements the approved guided lifecycle", async () => {
  const source = await readFile(resolve(process.cwd(), "app", "app.js"), "utf8");
  assert.match(source, /Set up my thesis/);
  assert.match(source, /Only the thesis name is required/);
  assert.match(source, /Skip for now/);
  assert.match(source, /Add supervisor feedback/);
  assert.match(source, /Setup · .*configured/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /\/api\/project\/feedback/);
  assert.match(source, /About ThesisOS/);
  assert.doesNotMatch(source, /\["feedback", "Feedback"\]/);
  assert.doesNotMatch(source, /Overleaf connected/i);
});

test("first-run and onboarding screens replace the workspace grid", async () => {
  const source = await readFile(resolve(process.cwd(), "app", "app.js"), "utf8");
  assert.match(source, /app\.className = "first-run-root"/);
  assert.match(source, /app\.className = "app-shell"/);
});

test("profile documents use a Finder picker and card-local loading states", async () => {
  const source = await readFile(resolve(process.cwd(), "app", "app.js"), "utf8");
  assert.match(source, /type="file"/);
  assert.match(source, /accept="\.pdf,\.md,\.txt/);
  assert.match(source, /drop-zone/);
  assert.match(source, /contentBase64/);
  assert.match(source, /\/api\/project\/documents\/upload/);
  assert.match(source, /activeProfileForm/);
  assert.match(source, /profile-card-loading/);
  assert.doesNotMatch(source, /Project document path/);
  assert.doesNotMatch(source, /Local document path/);
});
