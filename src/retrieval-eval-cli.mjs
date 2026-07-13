import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateRetrieval } from "./core/retrieval-evaluation.mjs";
import { searchZotero } from "./core/zotero.mjs";
import { loadZoteroSelection } from "./zotero-cli.mjs";

const projectDir = process.cwd();
const fixturePath = resolve(projectDir, process.argv[2] ?? "fixtures/retrieval-eval.json");
const cases = JSON.parse(await readFile(fixturePath, "utf8"));
const savedLibrary = await loadZoteroSelection(projectDir);
const report = await evaluateRetrieval(cases, async (query) => {
  const taskGraph = { schemaVersion: 1, feedback: query, createdAt: new Date().toISOString(), nextAction: "Evaluate retrieval", tasks: [{ id: "task-literature", kind: "literature", title: "Evaluate literature retrieval", tool: "zotero", status: "ready", approvalStatus: "approved", evidence: [] }] };
  const artifact = await searchZotero(taskGraph, { ...(savedLibrary ? { savedLibrary } : {}), query, limit: 5, cachePath: resolve(projectDir, ".thesisos-cache", "zotero-embeddings.json") });
  return artifact.candidates;
});
console.log(JSON.stringify(report, null, 2));
if (report.recallAtK < 0.6) process.exitCode = 1;
