import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decomposeFeedback } from "../src/core/decompose.mjs";
import { validateTaskGraph, validateThesisState } from "../src/core/schema.mjs";
import { createThesisState } from "../src/core/state.mjs";
import { parseCliArgs } from "../src/cli.mjs";
import { decomposeFeedbackWithOpenAI } from "../src/core/openai.mjs";
import { applyReviewDecisions } from "../src/core/review.mjs";
import { parseReviewArgs } from "../src/review-cli.mjs";
import { decomposeFeedbackWithCodex } from "../src/core/codex.mjs";
import { extractLiteratureQuery, listZoteroPapers, resolveZoteroLibrary, searchZotero } from "../src/core/zotero.mjs";
import { parseZoteroArgs } from "../src/zotero-cli.mjs";

test("decomposes supervisor feedback into a cross-tool task graph", () => {
  const graph = decomposeFeedback(
    "Compare Khalili 2025 in Section 3.2 and rerun the RCS simulation."
  );

  assert.deepEqual(
    graph.tasks.map((task) => task.tool),
    ["zotero", "obsidian", "overleaf", "vscode"]
  );
  assert.deepEqual(graph.tasks[3].dependsOn, ["task-thesis"]);
  assert.equal(graph.schemaVersion, 1);
  assert.equal(validateTaskGraph(graph), graph);
});

test("validates the generated thesis state", () => {
  const graph = decomposeFeedback("Compare a paper in Section 3.2.");
  const state = createThesisState({ project: "Demo thesis", feedback: graph.feedback, taskGraph: graph });

  assert.equal(validateThesisState(state), state);
});

test("rejects task graphs with unknown dependencies", () => {
  const graph = decomposeFeedback("Review the literature.");
  graph.tasks[0].dependsOn = ["missing-task"];

  assert.throws(() => validateTaskGraph(graph), /unknown task id 'missing-task'/);
});

test("parses direct feedback and rejects conflicting inputs", () => {
  const options = parseCliArgs(["--feedback", "Review chapter 3", "--project", "New thesis", "--output-dir", "tmp/run"]);

  assert.equal(options.feedback, "Review chapter 3");
  assert.equal(options.project, "New thesis");
  assert.match(options.outputDir, /tmp\/run$/);
  assert.throws(() => parseCliArgs(["--feedback", "one", "--feedback-file", "two.txt"]), /either --feedback or --feedback-file/);
  assert.throws(() => parseCliArgs(["--ai", "--codex"]), /either --ai or --codex/);
});

test("normalizes and validates OpenAI structured output", async () => {
  let request;
  const graph = await decomposeFeedbackWithOpenAI("Compare a paper in Section 3.2.", {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          output_text: JSON.stringify({
            tasks: [{
              id: "task-literature",
              kind: "literature",
              title: "Review the paper",
              tool: "zotero",
              status: "ready",
              dependsOn: [],
              evidence: ["Capture the paper's claim"]
            }],
            nextAction: "Review the paper"
          })
        })
      };
    }
  });

  assert.equal(graph.schemaVersion, 1);
  assert.equal(graph.tasks[0].tool, "zotero");
  assert.equal(request.model, "test-model");
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
});

test("normalizes and validates Codex CLI structured output", async () => {
  let invocation;
  const graph = await decomposeFeedbackWithCodex("Review a paper and revise Section 3.2.", {
    model: "test-model",
    cwd: "/tmp/test-project",
    invokeCodex: async (options) => {
      invocation = options;
      return {
        tasks: [{
          id: "task-literature",
          kind: "literature",
          title: "Review the paper",
          tool: "zotero",
          status: "ready",
          dependsOn: [],
          evidence: ["Capture its method and limitation"]
        }],
        nextAction: "Review the paper"
      };
    }
  });

  assert.equal(graph.tasks[0].approvalStatus, "pending");
  assert.equal(invocation.model, "test-model");
  assert.equal(invocation.cwd, "/tmp/test-project");
  assert.equal(invocation.schema.additionalProperties, false);
  assert.match(invocation.prompt, /Supervisor feedback:/);
});

test("applies review decisions to both artifacts", () => {
  const graph = decomposeFeedback("Compare Khalili 2025 in Section 3.2 and rerun the simulation.");
  const state = createThesisState({ project: "Demo thesis", feedback: graph.feedback, taskGraph: graph });
  const reviewed = applyReviewDecisions(graph, state, {
    "task-literature": "approved",
    "task-notes": "rejected"
  }, { now: "2026-07-13T20:00:00.000Z" });

  assert.deepEqual(reviewed.taskGraph.approvalSummary, { pending: 2, approved: 1, rejected: 1 });
  assert.equal(reviewed.taskGraph.tasks[0].approvalStatus, "approved");
  assert.equal(reviewed.state.feedbackThreads[0].tasks[1].approvalStatus, "rejected");
  assert.match(reviewed.taskGraph.nextAction, /^Review:/);
});

test("rejects decisions for unknown tasks", () => {
  const graph = decomposeFeedback("Review the literature.");
  const state = createThesisState({ project: "Demo thesis", feedback: graph.feedback, taskGraph: graph });

  assert.throws(() => applyReviewDecisions(graph, state, { missing: "approved" }), /Unknown task id 'missing'/);
});

test("parses non-interactive review decisions", () => {
  const options = parseReviewArgs(["--input-dir", "demo-output/run", "--approve", "task-literature", "--reject", "task-thesis"]);

  assert.equal(options.decisions["task-literature"], "approved");
  assert.equal(options.decisions["task-thesis"], "rejected");
  assert.throws(() => parseReviewArgs(["--approve-all", "--reject", "task-thesis"]), /without individual decisions/);
});

test("requires approval before searching Zotero", async () => {
  const graph = decomposeFeedback("Compare Khalili 2025 with related literature.");

  await assert.rejects(() => searchZotero(graph, { fetchImpl: async () => { throw new Error("should not run"); } }), /must be approved/);
});

test("searches Zotero read-only and normalizes candidates", async () => {
  const graph = decomposeFeedback("Compare Khalili 2025 with related literature.");
  graph.tasks[0].approvalStatus = "approved";
  let request;
  const artifact = await searchZotero(graph, {
    libraryType: "user",
    libraryId: "0",
    embeddingProvider: "none",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === "Total-Results" ? "1" : null },
        json: async () => [{
          key: "ABC12345",
          data: {
            itemType: "journalArticle",
            title: "A Study of Radar Cross Sections",
            creators: [{ firstName: "Ada", lastName: "Khalili", creatorType: "author" }],
            date: "2025-03-01",
            publicationTitle: "Journal of Radar Research",
            abstractNote: "A constrained sensing optimization method.",
            tags: [{ tag: "optimization" }],
            DOI: "10.1000/example",
            url: "https://example.test/paper"
          }
        }]
      };
    }
  });

  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers["Zotero-API-Version"], "3");
  assert.equal(request.url.searchParams.get("q"), null);
  assert.equal(artifact.access, "read-only");
  assert.equal(artifact.retrieval.mode, "hybrid-lexical");
  assert.equal(artifact.indexedPaperCount, 1);
  assert.equal(artifact.candidates[0].creators[0], "Ada Khalili");
  assert.equal(artifact.candidates[0].year, "2025");
  assert.equal(artifact.candidates[0].abstract, "A constrained sensing optimization method.");
  assert.deepEqual(artifact.candidates[0].tags, ["optimization"]);
});

test("extracts citation queries and parses Zotero CLI options", () => {
  assert.equal(extractLiteratureQuery("Please compare Khalili 2025 in Section 3.2."), "Khalili 2025");
  const options = parseZoteroArgs(["--input-dir", "demo-output/run", "--query", "radar", "--limit", "5", "--web", "--library-type", "group", "--library-id", "6568124"]);
  assert.equal(options.query, "radar");
  assert.equal(options.limit, 5);
  assert.equal(options.mode, "web");
  assert.equal(options.libraryType, "group");
  assert.equal(options.libraryId, "6568124");

  const selection = parseZoteroArgs(["--list", "--library", "Research"]);
  assert.equal(selection.library, "Research");
  assert.equal(parseZoteroArgs(["--list", "--all-libraries"]).allLibraries, true);
  assert.throws(() => parseZoteroArgs(["--library", "Research", "--all-libraries"]), /cannot be combined/);
});

test("discovers the sole group when the personal Zotero library is empty", async () => {
  const requested = [];
  const library = await resolveZoteroLibrary({
    fetchImpl: async (url) => {
      requested.push(url.pathname);
      const body = url.pathname.endsWith("/groups")
        ? [{ id: 6568124, data: { name: "isac_project_thesis" } }]
        : url.pathname.includes("/groups/6568124/items/top")
          ? [{ key: "PAPER1", data: { itemType: "journalArticle", title: "Paper" } }]
          : [];
      return { ok: true, status: 200, json: async () => body };
    }
  });

  assert.deepEqual(library, { type: "group", id: "6568124", name: "isac_project_thesis", paperCount: 1 });
  assert.deepEqual(requested, ["/api/users/0/groups", "/api/users/0/items/top", "/api/groups/6568124/items/top"]);
});

function zoteroResponse(body, total = body.length) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name === "Total-Results" ? String(total) : null },
    json: async () => body
  };
}

function zoteroPapers(count, prefix = "P") {
  return Array.from({ length: count }, (_, index) => ({
    key: `${prefix}${index + 1}`,
    data: { itemType: "journalArticle", title: `${prefix} paper ${index + 1}` }
  }));
}

test("reports a catalog instead of guessing when multiple libraries contain papers", async () => {
  await assert.rejects(
    () => resolveZoteroLibrary({
      fetchImpl: async (url) => {
        if (url.pathname.endsWith("/groups")) {
          return zoteroResponse([
            { id: 10, data: { name: "Research" } },
            { id: 20, data: { name: "Teaching" } }
          ]);
        }
        if (url.pathname.includes("/users/0/items/top")) return zoteroResponse(zoteroPapers(3, "U"));
        if (url.pathname.includes("/groups/10/items/top")) return zoteroResponse(zoteroPapers(40, "G"));
        return zoteroResponse([], 0);
      }
    }),
    (error) => {
      assert.equal(error.code, "ZOTERO_LIBRARY_SELECTION_REQUIRED");
      assert.deepEqual(error.libraries.map(({ name, paperCount }) => [name, paperCount]), [
        ["My Library", 3],
        ["Research", 40]
      ]);
      return true;
    }
  );
});

test("selects the sole non-empty group when several groups are available", async () => {
  const library = await resolveZoteroLibrary({
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/groups")) {
        return zoteroResponse([
          { id: 10, data: { name: "Empty Group" } },
          { id: 20, data: { name: "isac_project_thesis" } }
        ]);
      }
      if (url.pathname.includes("/groups/20/items/top")) return zoteroResponse(zoteroPapers(40, "G"));
      return zoteroResponse([], 0);
    }
  });

  assert.deepEqual(library, { type: "group", id: "20", name: "isac_project_thesis", paperCount: 40 });
});

test("resolves an unambiguous library name and a saved library ID", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/groups")) {
      return zoteroResponse([
        { id: 10, data: { name: "Research" } },
        { id: 20, data: { name: "Teaching" } }
      ]);
    }
    if (url.pathname.includes("/groups/10/items/top")) return zoteroResponse(zoteroPapers(40, "R"));
    if (url.pathname.includes("/groups/20/items/top")) return zoteroResponse(zoteroPapers(12, "T"));
    return zoteroResponse([], 0);
  };

  assert.equal((await resolveZoteroLibrary({ library: "Research", fetchImpl })).id, "10");
  assert.equal((await resolveZoteroLibrary({ savedLibrary: { type: "group", id: "20" }, fetchImpl })).name, "Teaching");
});

test("paginates through every top-level paper", async () => {
  const starts = [];
  const artifact = await listZoteroPapers({
    libraryType: "group",
    libraryId: "6568124",
    pageSize: 2,
    fetchImpl: async (url) => {
      const start = Number(url.searchParams.get("start") ?? 0);
      starts.push(start);
      const all = [
        { key: "P1", data: { itemType: "journalArticle", title: "One" } },
        { key: "P2", data: { itemType: "conferencePaper", title: "Two" } },
        { key: "P3", data: { itemType: "preprint", title: "Three" } }
      ];
      return zoteroResponse(all.slice(start, start + 2), all.length);
    }
  });

  assert.equal(artifact.paperCount, 3);
  assert.deepEqual(starts, [0, 2]);
});

test("extracts all non-empty libraries with stable source identities", async () => {
  const artifact = await listZoteroPapers({
    allLibraries: true,
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/groups")) return zoteroResponse([{ id: 10, data: { name: "Research" } }]);
      if (!url.searchParams.has("sort")) {
        if (url.pathname.includes("/users/0/")) return zoteroResponse([{ key: "SAME", data: { itemType: "journalArticle" } }], 1);
        return zoteroResponse([{ key: "SAME", data: { itemType: "journalArticle" } }], 1);
      }
      const title = url.pathname.includes("/users/0/") ? "Personal copy" : "Group copy";
      return zoteroResponse([{ key: "SAME", data: { itemType: "journalArticle", title } }], 1);
    }
  });

  assert.equal(artifact.paperCount, 2);
  assert.deepEqual(artifact.papers.map((paper) => paper.sourceId), ["user:0:SAME", "group:10:SAME"]);
  assert.deepEqual(artifact.libraries.map((library) => library.name), ["My Library", "Research"]);
});

test("rejects duplicate library names and stale saved selections with catalogs", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/groups")) {
      return zoteroResponse([
        { id: 10, data: { name: "Research" } },
        { id: 20, data: { name: "Research" } }
      ]);
    }
    if (url.pathname.includes("/groups/")) return zoteroResponse(zoteroPapers(1));
    return zoteroResponse([]);
  };

  await assert.rejects(
    () => resolveZoteroLibrary({ library: "Research", fetchImpl }),
    (error) => error.code === "ZOTERO_LIBRARY_NAME_AMBIGUOUS" && error.libraries.length === 2
  );
  await assert.rejects(
    () => resolveZoteroLibrary({ savedLibrary: { type: "group", id: "999" }, fetchImpl }),
    (error) => error.code === "ZOTERO_SAVED_LIBRARY_STALE" && error.libraries.length === 3
  );
});

test("rejects a saved library that no longer contains papers", async () => {
  await assert.rejects(
    () => resolveZoteroLibrary({
      savedLibrary: { type: "group", id: "10" },
      fetchImpl: async (url) => url.pathname.endsWith("/groups")
        ? zoteroResponse([{ id: 10, data: { name: "Former research" } }])
        : zoteroResponse([])
    }),
    (error) => error.code === "ZOTERO_LIBRARY_EMPTY" && error.library.id === "10"
  );
});

test("searches all selected libraries without collapsing equal Zotero item keys", async () => {
  const graph = decomposeFeedback("Compare Khalili 2025 with related literature.");
  graph.tasks[0].approvalStatus = "approved";
  const artifact = await searchZotero(graph, {
    allLibraries: true,
    embeddingProvider: "none",
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/groups")) return zoteroResponse([{ id: 10, data: { name: "Research" } }]);
      const title = url.pathname.includes("/users/0/") ? "Personal result" : "Group result";
      return zoteroResponse([{ key: "SAME", data: { itemType: "journalArticle", title } }]);
    }
  });

  assert.equal(artifact.candidates.length, 2);
  assert.deepEqual(new Set(artifact.candidates.map((paper) => paper.sourceId)), new Set(["user:0:SAME", "group:10:SAME"]));
  assert.deepEqual(artifact.libraries.map((library) => library.name), ["My Library", "Research"]);
});

test("uses stable codes for unavailable and malformed Zotero responses", async () => {
  await assert.rejects(
    () => listZoteroPapers({ libraryType: "user", libraryId: "0", fetchImpl: async () => { throw new Error("offline"); } }),
    (error) => error.code === "ZOTERO_UNAVAILABLE"
  );
  await assert.rejects(
    () => listZoteroPapers({
      libraryType: "user",
      libraryId: "0",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })
    }),
    (error) => error.code === "ZOTERO_INVALID_RESPONSE"
  );
});

test("does not count notes, attachments, or annotations as papers during discovery", async () => {
  await assert.rejects(
    () => resolveZoteroLibrary({
      fetchImpl: async (url) => {
        if (url.pathname.endsWith("/groups")) return zoteroResponse([]);
        return zoteroResponse([
          { key: "N1", data: { itemType: "note" } },
          { key: "A1", data: { itemType: "attachment" } },
          { key: "X1", data: { itemType: "annotation" } }
        ]);
      }
    }),
    (error) => error.code === "ZOTERO_NO_PAPERS" && error.libraries[0].paperCount === 0
  );
});

test("surfaces interrupted pagination instead of returning a partial library", async () => {
  let requestCount = 0;
  await assert.rejects(
    () => listZoteroPapers({
      libraryType: "user",
      libraryId: "0",
      pageSize: 2,
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 2) throw new Error("connection reset");
        return zoteroResponse(zoteroPapers(2), 3);
      }
    }),
    /Zotero local API is unavailable.*connection reset/
  );
});

test("detects a Zotero endpoint that ignores pagination offsets", async () => {
  let requestCount = 0;
  await assert.rejects(
    () => listZoteroPapers({
      libraryType: "user",
      libraryId: "0",
      pageSize: 2,
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount > 2) throw new Error("test safety stop");
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => zoteroPapers(2)
        };
      }
    }),
    (error) => error.code === "ZOTERO_PAGINATION_STALLED"
  );
  assert.equal(requestCount, 2);
});

test("persists a selected Zotero library without overwriting other project settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "thesisos-zotero-"));
  try {
    await writeFile(join(directory, ".thesisos.json"), JSON.stringify({ project: "demo" }));
    const cli = await import("../src/zotero-cli.mjs");
    assert.equal(typeof cli.saveZoteroSelection, "function");
    assert.equal(typeof cli.loadZoteroSelection, "function");

    await cli.saveZoteroSelection(directory, { type: "group", id: "6568124", name: "isac_project_thesis" });
    assert.deepEqual(await cli.loadZoteroSelection(directory), { type: "group", id: "6568124", name: "isac_project_thesis" });
    assert.deepEqual(JSON.parse(await readFile(join(directory, ".thesisos.json"), "utf8")), {
      project: "demo",
      zotero: { library: { type: "group", id: "6568124", name: "isac_project_thesis" } }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("formats a multi-library CLI result without assuming one selected library", async () => {
  const cli = await import("../src/zotero-cli.mjs");
  assert.equal(typeof cli.formatLibrarySummary, "function");
  assert.equal(cli.formatLibrarySummary({
    library: null,
    libraries: [
      { type: "user", id: "0", name: "My Library" },
      { type: "group", id: "10", name: "Research" }
    ]
  }), "Libraries: My Library (user), Research (group)");
});

test("lists only bibliographic Zotero items and reports duplicates", async () => {
  const artifact = await listZoteroPapers({
    libraryType: "group",
    libraryId: "6568124",
    fetchImpl: async (url) => {
      assert.match(url.pathname, /\/api\/groups\/6568124\/items\/top$/);
      return {
        ok: true,
        status: 200,
        json: async () => [
          { key: "PAPER001", data: { itemType: "journalArticle", title: "Paper One", creators: [], date: "2025", DOI: "10.1/one" } },
          { key: "PDF00001", data: { itemType: "attachment", title: "Full Text PDF", creators: [] } },
          { key: "PAPER002", data: { itemType: "preprint", title: "Paper Two", creators: [], date: "2026", DOI: "10.1/two" } },
          { key: "NOTE0001", data: { itemType: "note", title: "Reading note", creators: [] } }
        ]
      };
    }
  });

  assert.equal(artifact.paperCount, 2);
  assert.deepEqual(artifact.papers.map((paper) => paper.key), ["PAPER001", "PAPER002"]);
  assert.deepEqual(artifact.duplicateTitles, []);
  assert.deepEqual(artifact.duplicateDois, []);
});
