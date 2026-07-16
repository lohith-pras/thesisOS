import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  approveClaimProposal,
  createProjectState,
  loadProjectState,
  recordClaimProposals,
  saveProjectState,
  updateProjectScan
} from "../src/core/project-state.mjs";
import { scanThesisCheckout } from "../src/core/thesis-scan.mjs";
import { mapBibliographyToSources } from "../src/core/citation-mapping.mjs";
import { renderWorkspace, writeWorkspace } from "../src/core/workspace-renderer.mjs";
import { proposeClaimEvidenceLinksWithCodex } from "../src/core/claim-proposals.mjs";

async function fixtureProject() {
  const root = await mkdtemp(join(tmpdir(), "thesisos-project-"));
  const thesisDir = join(root, "thesis");
  const vaultPath = join(root, "vault");
  await mkdir(join(thesisDir, "chapters"), { recursive: true });
  await mkdir(vaultPath, { recursive: true });
  await writeFile(join(thesisDir, "main.tex"), String.raw`\chapter{Introduction}
Prior work establishes the baseline \citep{doe2025,missing2024}.
\input{chapters/method}
`);
  await writeFile(join(thesisDir, "chapters", "method.tex"), String.raw`\chapter{Methodology}
Our method follows the reference design \citet{doe2025}.
`);
  await writeFile(join(thesisDir, "references.bib"), `@article{doe2025,
  title = {Distributed Sensing for Integrated Systems},
  author = {Doe, Jane},
  year = {2025},
  doi = {10.1000/example}
}
@article{missing2024,
  title = {A Missing Source},
  year = {2024}
}
`);
  return { root, thesisDir, vaultPath };
}

test("persists canonical state and appends immutable review events", async () => {
  const { root, thesisDir, vaultPath } = await fixtureProject();
  const statePath = join(root, ".thesisos", "thesis-state.json");
  let state = createProjectState({ project: "Test thesis", thesisDir, vaultPath }, { now: "2026-07-14T10:00:00.000Z" });
  state = recordClaimProposals(state, [{
    id: "claim-001",
    text: "Distributed sensing provides the baseline.",
    chapterId: "chapter-introduction",
    locationId: "tex:main.tex:paragraph-1",
    sourceIds: ["group:1:ABC"],
    feedbackThreadIds: [],
    taskIds: []
  }], { provider: "codex", model: "gpt-5", approvedExternalProcessing: true, expectedRevision: 1, now: "2026-07-14T10:01:00.000Z", knownSourceIds: ["group:1:ABC"] });
  state = approveClaimProposal(state, "claim-001", "approved", { expectedRevision: 2, now: "2026-07-14T10:02:00.000Z", actor: "researcher" });

  await saveProjectState(statePath, state, { expectedRevision: 0, expectAbsent: true });
  const loaded = await loadProjectState(statePath);

  assert.equal((await stat(statePath)).mode & 0o077, 0);
  assert.equal((await stat(join(root, ".thesisos"))).mode & 0o077, 0);
  assert.equal(loaded.claims[0].status, "approved");
  assert.equal(loaded.revision, 3);
  assert.deepEqual(loaded.events.map((event) => event.type), ["project.created", "claims.proposed", "claim.reviewed"]);
  assert.equal(loaded.events[2].previousStatus, "proposed");
});

test("scans LaTeX and maps bibliography citekeys to Zotero sources without Better BibTeX", async () => {
  const { thesisDir } = await fixtureProject();
  const scan = await scanThesisCheckout(thesisDir);
  const mapping = mapBibliographyToSources(scan.bibliography, [
    { sourceId: "group:1:ABC", doi: "https://doi.org/10.1000/EXAMPLE", title: "Distributed Sensing for Integrated Systems" }
  ]);

  assert.deepEqual(scan.chapters.map((chapter) => chapter.title), ["Methodology", "Introduction"]);
  assert.equal(scan.citations.length, 2);
  assert.deepEqual(scan.citations[1].citekeys, ["doe2025", "missing2024"]);
  assert.equal(mapping.entries.doe2025.sourceId, "group:1:ABC");
  assert.equal(mapping.entries.doe2025.matchedBy, "doi");
  assert.equal(mapping.entries.missing2024.status, "unresolved");
});

test("revision-guards scans and preserves selected workflow evidence", () => {
  const original = createProjectState({ project: "Test thesis" });
  const workflowEvidence = {
    feedbackThreadId: "feedback-1",
    taskId: "task-literature",
    sourceId: "group:1:WORKFLOW",
    title: "Selected workflow evidence",
    selectedAt: "2026-07-14T10:00:00.000Z"
  };
  const state = { ...original, evidence: [workflowEvidence] };
  const input = {
    scan: { chapters: [], citations: [], bibliography: {}, scannedAt: "2026-07-14T10:01:00.000Z" },
    mapping: { entries: {} },
    sources: [{ sourceId: "group:1:SCANNED", title: "Scanned selection", selected: true }]
  };

  assert.throws(() => updateProjectScan(state, input), /REVISION_REQUIRED/);
  const updated = updateProjectScan(state, input, { expectedRevision: state.revision, now: "2026-07-14T10:02:00.000Z" });

  assert.equal(updated.revision, state.revision + 1);
  assert.deepEqual(updated.evidence.map(({ sourceId }) => sourceId), ["group:1:WORKFLOW", "group:1:SCANNED"]);
  assert.deepEqual(updated.evidence[0], workflowEvidence);
});

test("renders selected evidence deterministically and preserves researcher sections", async () => {
  const { root, thesisDir, vaultPath } = await fixtureProject();
  let state = createProjectState({ project: "Test thesis", thesisDir, vaultPath }, { now: "2026-07-14T10:00:00.000Z" });
  state = {
    ...state,
    manuscript: {
      chapters: [{ id: "chapter-methodology", title: "Methodology", sourcePath: "chapters/method.tex" }],
      citations: [],
      unresolvedCitekeys: ["missing2024"]
    },
    evidence: [{ sourceId: "group:1:ABC", title: "Distributed Sensing", selected: true }],
    claims: [{ id: "claim-001", text: "A supported claim", chapterId: "chapter-methodology", locationId: "tex:chapters/method.tex:paragraph-1", sourceIds: ["group:1:ABC"], status: "approved", feedbackThreadIds: [], taskIds: [] }]
  };
  const first = renderWorkspace(state);
  assert.ok(first["00-Dashboard.md"].includes("1 approved claim"));
  assert.ok(first["00-Profile.md"].includes("Profile incomplete"));
  assert.ok(first["02-Literature/group-1-abc.md"].includes("<!-- thesisos:researcher:start -->"));

  await writeWorkspace(vaultPath, first, { approved: true });
  const notePath = join(vaultPath, "ThesisOS", "02-Literature", "group-1-abc.md");
  const edited = (await readFile(notePath, "utf8")).replace(
    "<!-- thesisos:researcher:start -->\n",
    "<!-- thesisos:researcher:start -->\nMy reviewed observation.\n"
  );
  await writeFile(notePath, edited);
  await writeWorkspace(vaultPath, renderWorkspace(state), { approved: true });

  assert.ok((await readFile(notePath, "utf8")).includes("My reviewed observation."));
  await assert.rejects(() => writeWorkspace(join(root, "other"), first, { approved: false }), /Explicit write approval/);
});

test("renders approved thesis intent with provenance into the managed profile", async () => {
  const { thesisDir, vaultPath } = await fixtureProject();
  const state = createProjectState({ project: "Test thesis", thesisDir, vaultPath });
  state.profile = {
    ...state.profile,
    title: { value: "Cognitive ISAC", provenance: { kind: "extracted-approved", sourceId: "document-1", locator: "page:1" } },
    objectives: [{ id: "o1", text: "Develop online optimization", provenance: { kind: "extracted-approved", sourceId: "document-1", locator: "page:2" } }],
    problems: [{ id: "p2", name: "Interference Mitigation", selected: true, provenance: { kind: "user-stated" } }],
    stage: { value: "experiments", provenance: { kind: "user-stated" } }
  };
  const profile = renderWorkspace(state)["00-Profile.md"];
  assert.match(profile, /Cognitive ISAC/);
  assert.match(profile, /Develop online optimization/);
  assert.match(profile, /Project document · page:1/);
  assert.match(profile, /Researcher stated/);
});

test("claim proposals require consent and cannot self-approve", async () => {
  const { thesisDir, vaultPath } = await fixtureProject();
  const state = createProjectState({ project: "Test thesis", thesisDir, vaultPath });
  assert.throws(() => recordClaimProposals(state, [{ id: "claim-1", text: "Claim", locationId: "tex:main.tex:paragraph-1", chapterId: "chapter-introduction", sourceIds: [], status: "approved" }], {
    provider: "codex",
    approvedExternalProcessing: false,
    expectedRevision: state.revision,
    knownSourceIds: []
  }), /Explicit approval/);
});

test("claim proposal and review mutations require the current revision", async () => {
  const { thesisDir, vaultPath } = await fixtureProject();
  const state = createProjectState({ project: "Test thesis", thesisDir, vaultPath });
  const proposal = [{
    id: "claim-1",
    text: "Claim",
    locationId: "tex:main.tex:paragraph-1",
    chapterId: "chapter-introduction",
    sourceIds: ["group:1:ABC"]
  }];
  const options = {
    provider: "codex",
    approvedExternalProcessing: true,
    knownSourceIds: ["group:1:ABC"]
  };

  assert.throws(() => recordClaimProposals(state, proposal, options), /REVISION_REQUIRED/);
  const proposed = recordClaimProposals(state, proposal, { ...options, expectedRevision: state.revision });
  assert.equal(proposed.revision, state.revision + 1);
  assert.throws(() => approveClaimProposal(proposed, "claim-1", "approved", { expectedRevision: state.revision }), /STATE_STALE/);

  const approved = approveClaimProposal(proposed, "claim-1", "approved", { expectedRevision: proposed.revision });
  assert.equal(approved.revision, proposed.revision + 1);
  assert.equal(approved.claims[0].status, "approved");
});

test("Codex proposes bounded claim links but cannot approve them", async () => {
  const captured = [];
  const result = await proposeClaimEvidenceLinksWithCodex({
    excerpts: [{ chapterId: "chapter-introduction", locationId: "tex:main.tex:paragraph-1", context: "Prior work establishes the baseline [doe2025]." }],
    evidence: [{ sourceId: "group:1:ABC", title: "Distributed Sensing", abstract: "A baseline design." }],
    approvedExternalProcessing: true
  }, {
    invokeCodex: async (request) => {
      captured.push(request);
      return { proposals: [{ id: "claim-001", text: "Prior work establishes the baseline.", chapterId: "chapter-introduction", locationId: "tex:main.tex:paragraph-1", sourceIds: ["group:1:ABC"], rationale: "The selected source describes the baseline.", status: "approved" }] };
    }
  });

  assert.equal(captured.length, 1);
  assert.equal(result[0].status, undefined);
  assert.deepEqual(result[0].sourceIds, ["group:1:ABC"]);
  await assert.rejects(() => proposeClaimEvidenceLinksWithCodex({ excerpts: [], evidence: [], approvedExternalProcessing: false }), /Explicit approval/);
});
