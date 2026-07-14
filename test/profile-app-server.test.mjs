import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../src/app-server.mjs";

async function withServer(dependencies, run) {
  const server = createAppServer(dependencies);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { response, body: await response.json() };
}

test("initializes a canonical project and blocks feedback until its profile is ready", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-profile-server-"));
  const thesisDir = join(projectDir, "thesis");
  const vaultPath = join(projectDir, "vault");
  await mkdir(thesisDir);
  await mkdir(vaultPath);
  await writeFile(join(thesisDir, "main.tex"), "\\chapter{Methodology}\n");

  await withServer({ projectDir, listPapers: async () => { throw new Error("unused"); } }, async (base) => {
    const initialized = await post(base, "/api/project/init", { project: "ISAC thesis", thesisDir, vaultPath });
    assert.equal(initialized.response.status, 201);
    assert.equal(initialized.body.state.schemaVersion, 3);
    assert.equal(initialized.body.readiness.ready, false);

    const blocked = await post(base, "/api/workflow/decompose", { feedback: "Strengthen Section 3.2", provider: "offline", expectedRevision: initialized.body.state.revision });
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.body.code, "PROFILE_INCOMPLETE");
  });
});

test("initializes from a project PDF first when no LaTeX checkout exists", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-pdf-first-"));
  const vaultPath = join(projectDir, "vault");
  await mkdir(vaultPath);
  await withServer({ projectDir }, async (base) => {
    const initialized = await post(base, "/api/project/init", { project: "ISAC thesis", vaultPath });
    assert.equal(initialized.response.status, 201);
    assert.equal(initialized.body.state.project.thesisDir, null);
    assert.deepEqual(initialized.body.state.manuscript.chapters, []);
  });
});

test("initializes with only a thesis name and captures feedback without decomposition", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-name-only-"));
  await withServer({ projectDir }, async (base) => {
    let result = await post(base, "/api/project/init", { project: "ISAC thesis" });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.state.project.vaultPath, null);
    result = await post(base, "/api/project/feedback", { title: "Section 3.2", feedback: "Strengthen the model", expectedRevision: result.body.state.revision });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.state.feedbackThreads[0].status, "captured");
    assert.equal(result.body.readiness.ready, false);
  });
});

test("links and scans an optional manuscript after project creation", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-link-manuscript-"));
  const thesisDir = join(projectDir, "thesis");
  await mkdir(thesisDir);
  await writeFile(join(thesisDir, "main.tex"), "\\chapter{Methods}\n");
  await withServer({ projectDir }, async (base) => {
    let result = await post(base, "/api/project/init", { project: "ISAC thesis" });
    result = await post(base, "/api/project/paths", { thesisDir, expectedRevision: result.body.state.revision });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.project.thesisDir, thesisDir);
    assert.equal(result.body.state.manuscript.chapters[0].title, "Methods");
  });
});

test("opens only the configured Obsidian vault or VS Code manuscript folder", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-workspace-launch-"));
  const thesisDir = join(projectDir, "thesis");
  const vaultPath = join(projectDir, "vault");
  await mkdir(thesisDir);
  await mkdir(vaultPath);
  const launches = [];
  const urls = [];
  await withServer({
    projectDir,
    launchWorkspaceApp: async (application, path) => launches.push({ application, path }),
    launchExternalUrl: async (url) => urls.push(url)
  }, async (base) => {
    let project = await post(base, "/api/project/init", { project: "ISAC thesis", thesisDir, vaultPath });
    project = await post(base, "/api/project/paths", { overleafUrl: "https://www.overleaf.com/project/example", expectedRevision: project.body.state.revision });
    const obsidian = await post(base, "/api/workspace/open", { tool: "obsidian" });
    const vscode = await post(base, "/api/workspace/open", { tool: "vscode" });
    const overleaf = await post(base, "/api/workspace/open", { tool: "overleaf" });
    assert.equal(obsidian.response.status, 200);
    assert.equal(vscode.response.status, 200);
    assert.equal(overleaf.response.status, 200);
    assert.deepEqual(launches, [
      { application: "Obsidian", path: vaultPath },
      { application: "Visual Studio Code", path: thesisDir }
    ]);
    assert.deepEqual(urls, ["https://www.overleaf.com/project/example"]);
  });
});

test("uploads a project document selected from the browser", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-upload-document-"));
  await withServer({ projectDir }, async (base) => {
    let result = await post(base, "/api/project/init", { project: "ISAC thesis" });
    result = await post(base, "/api/project/documents/upload", {
      filename: "project.txt",
      contentBase64: Buffer.from("Develop an evidence-backed optimization framework.").toString("base64"),
      expectedRevision: result.body.state.revision
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.document.filename, "project.txt");
    assert.equal(result.body.document.mediaType, "text/plain");
  });
});

test("imports a document, reviews extracted fields, records answers, and unlocks contextual decomposition", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-profile-server-"));
  const thesisDir = join(projectDir, "thesis");
  const vaultPath = join(projectDir, "vault");
  const documentPath = join(projectDir, "project.txt");
  await mkdir(thesisDir);
  await mkdir(vaultPath);
  await writeFile(join(thesisDir, "main.tex"), "\\chapter{Methodology}\n\\section{Interference model}\n");
  await writeFile(documentPath, "Cognitive ISAC. Develop online optimization.");

  await withServer({
    projectDir,
    proposeProfile: async ({ document }) => ({ id: "proposal-1", sourceDocumentIds: [document.id], fields: {
      title: { value: "Cognitive ISAC", provenance: { kind: "extracted", sourceId: document.id, locator: "line:1-1" } },
      objectives: [{ id: "objective-1", text: "Develop online optimization", provenance: { kind: "extracted", sourceId: document.id, locator: "line:1-1" } }]
    } }),
    decomposeOffline: (feedback) => ({ schemaVersion: 1, feedback, createdAt: new Date().toISOString(), tasks: [{ id: "task-literature", kind: "literature", title: "Review evidence", tool: "zotero", status: "ready", approvalStatus: "pending", dependsOn: [], evidence: [] }], nextAction: "Review" })
  }, async (base) => {
    let result = await post(base, "/api/project/init", { project: "ISAC thesis", thesisDir, vaultPath });
    result = await post(base, "/api/project/documents/import", { path: documentPath, expectedRevision: result.body.state.revision });
    assert.equal(result.body.document.mediaType, "text/plain");
    result = await post(base, "/api/project/profile/propose", { documentId: result.body.document.id, approvedExternalProcessing: true, expectedRevision: result.body.state.revision });
    result = await post(base, "/api/project/profile/review", { decisions: { title: { action: "accept" }, objectives: { action: "accept" } }, expectedRevision: result.body.state.revision });
    result = await post(base, "/api/project/profile/answers", { selectedScope: { id: "p2", name: "Interference Mitigation", summary: "Mitigate mutual interference" }, stage: "experiments", expectedRevision: result.body.state.revision });
    assert.equal(result.body.readiness.ready, true);
    const decomposed = await post(base, "/api/workflow/decompose", { feedback: "Strengthen the interference model", provider: "offline", expectedRevision: result.body.state.revision });
    assert.equal(decomposed.response.status, 200);
    assert.match(decomposed.body.context.selectedScope.name, /Interference/);
    const feedbackThread = decomposed.body.state.feedbackThreads.at(-1);
    const reviewed = await post(base, "/api/workflow/review", { feedbackThreadId: feedbackThread.id, taskId: "task-literature", decision: "approved", expectedRevision: decomposed.body.state.revision });
    assert.equal(reviewed.body.state.feedbackThreads.at(-1).tasks[0].approvalStatus, "approved");
  });
});
