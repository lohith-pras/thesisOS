import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseWorkspaceArgs } from "../src/workspace-cli.mjs";

test("parses canonical workspace commands", () => {
  assert.deepEqual(parseWorkspaceArgs(["review", "--approve", "claim-1", "--project-dir", "/tmp/project"]), {
    command: "review", projectDir: "/tmp/project", decision: "approved", claimId: "claim-1"
  });
  assert.throws(() => parseWorkspaceArgs(["render"]), /--project-dir/);
});

test("initializes, scans, and renders a persistent workspace", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-cli-"));
  const thesisDir = join(projectDir, "thesis");
  const vaultPath = join(projectDir, "vault");
  const sourcesPath = join(projectDir, "sources.json");
  await mkdir(thesisDir);
  await mkdir(vaultPath);
  await writeFile(join(thesisDir, "main.tex"), String.raw`\chapter{Introduction}
The baseline is established \cite{doe2025}.
`);
  await writeFile(join(thesisDir, "references.bib"), "@article{doe2025, title={Distributed Sensing}, doi={10.1/test}}\n");
  await writeFile(sourcesPath, JSON.stringify([{ sourceId: "group:1:A", title: "Distributed Sensing", doi: "10.1/test", selected: false }]));
  const output = [];

  await main(["init", "--project-dir", projectDir, "--project", "CLI thesis", "--thesis-dir", thesisDir, "--vault", vaultPath, "--sources-file", sourcesPath], { log: (line) => output.push(line) });
  await main(["scan", "--project-dir", projectDir], { log: (line) => output.push(line) });
  await main(["init", "--project-dir", projectDir, "--project", "Renamed CLI thesis", "--thesis-dir", thesisDir, "--vault", vaultPath], { log: (line) => output.push(line) });
  await main(["render", "--project-dir", projectDir, "--approve-write"], { log: (line) => output.push(line) });

  const state = JSON.parse(await readFile(join(projectDir, ".thesisos", "thesis-state.json"), "utf8"));
  assert.equal(state.manuscript.citationMappings.doe2025.sourceId, "group:1:A");
  assert.equal(state.project.name, "Renamed CLI thesis");
  assert.deepEqual(state.manuscript.unresolvedCitekeys, []);
  assert.match(await readFile(join(vaultPath, "ThesisOS", "00-Dashboard.md"), "utf8"), /CLI thesis dashboard/);
  assert.ok(output.some((line) => line.includes("Canonical state")));
});
