import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseWorkspaceArgs } from "../src/workspace-cli.mjs";

test("parses canonical workspace commands", () => {
  assert.deepEqual(parseWorkspaceArgs(["review", "--approve", "claim-1", "--expected-revision", "4", "--project-dir", "/tmp/project"]), {
    command: "review", projectDir: "/tmp/project", decision: "approved", claimId: "claim-1", expectedRevision: 4
  });
  assert.throws(() => parseWorkspaceArgs(["render"]), /--project-dir/);
  assert.throws(() => parseWorkspaceArgs(["scan", "--project-dir", "/tmp/project"]), /scan requires --expected-revision/);
  assert.throws(() => parseWorkspaceArgs(["review", "--approve", "claim-1", "--expected-revision", "0", "--project-dir", "/tmp/project"]), /positive integer/);
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

  const initialized = await main(["init", "--project-dir", projectDir, "--project", "CLI thesis", "--thesis-dir", thesisDir, "--vault", vaultPath, "--sources-file", sourcesPath], { log: (line) => output.push(line) });
  await assert.rejects(() => main(["scan", "--project-dir", projectDir], { log: (line) => output.push(line) }), /scan requires --expected-revision/);
  const scanned = await main(["scan", "--project-dir", projectDir, "--expected-revision", String(initialized.revision)], { log: (line) => output.push(line) });
  await assert.rejects(() => main(["init", "--project-dir", projectDir, "--project", "Renamed CLI thesis", "--thesis-dir", thesisDir, "--vault", vaultPath], { log: (line) => output.push(line) }), /Canonical state already exists/);
  await main(["render", "--project-dir", projectDir, "--approve-write"], { log: (line) => output.push(line) });

  const state = JSON.parse(await readFile(join(projectDir, ".thesisos", "thesis-state.json"), "utf8"));
  assert.equal(state.manuscript.citationMappings.doe2025.sourceId, "group:1:A");
  assert.equal(initialized.revision, 2);
  assert.equal(scanned.revision, 3);
  assert.equal(state.project.name, "CLI thesis");
  assert.deepEqual(state.manuscript.unresolvedCitekeys, []);
  assert.match(await readFile(join(vaultPath, "ThesisOS", "00-Dashboard.md"), "utf8"), /CLI thesis dashboard/);
  assert.ok(output.some((line) => line.includes("Canonical state")));
});

test("records and reviews claims only at the caller-supplied revision", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-cli-revision-"));
  const thesisDir = join(projectDir, "thesis");
  const vaultPath = join(projectDir, "vault");
  const sourcesPath = join(projectDir, "sources.json");
  await mkdir(thesisDir);
  await mkdir(vaultPath);
  await writeFile(join(thesisDir, "main.tex"), String.raw`\chapter{Introduction}
The baseline is established \cite{doe2025}.
`);
  await writeFile(join(thesisDir, "references.bib"), "@article{doe2025, title={Distributed Sensing}, doi={10.1/test}}\n");
  await writeFile(sourcesPath, JSON.stringify([{ sourceId: "group:1:A", title: "Distributed Sensing", doi: "10.1/test", selected: true }]));
  const log = () => {};
  const initialized = await main(["init", "--project-dir", projectDir, "--project", "CLI thesis", "--thesis-dir", thesisDir, "--vault", vaultPath, "--sources-file", sourcesPath], { log });
  let proposerCalls = 0;

  await assert.rejects(() => main([
    "propose", "--project-dir", projectDir, "--expected-revision", String(initialized.revision - 1), "--approve-external-processing"
  ], {
    log,
    propose: async () => {
      proposerCalls += 1;
      return [];
    }
  }), /STATE_STALE/);
  assert.equal(proposerCalls, 0);

  const proposed = await main([
    "propose", "--project-dir", projectDir, "--expected-revision", String(initialized.revision), "--approve-external-processing"
  ], {
    log,
    propose: async ({ excerpts }) => [{
      id: "claim-001",
      text: "Distributed sensing establishes the baseline.",
      chapterId: excerpts[0].chapterId,
      locationId: excerpts[0].locationId,
      sourceIds: ["group:1:A"]
    }]
  });
  const reviewed = await main([
    "review", "--project-dir", projectDir, "--expected-revision", String(proposed.revision), "--approve", "claim-001"
  ], { log });

  assert.equal(proposed.revision, initialized.revision + 1);
  assert.equal(reviewed.revision, proposed.revision + 1);
  assert.equal(reviewed.claims[0].status, "approved");
});
