import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProjectState, loadProjectState, saveProjectState } from "../src/core/project-state.mjs";
import { loadZoteroSelection, saveZoteroSelection } from "../src/zotero-cli.mjs";

test("Zotero CLI selection uses canonical revisioned state when a workspace exists", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "thesisos-zotero-state-"));
  const statePath = join(projectDir, ".thesisos", "thesis-state.json");
  const library = { type: "group", id: "6568124", name: "Research" };
  try {
    await saveProjectState(statePath, createProjectState({ project: "Canonical Zotero" }), { expectedRevision: 0, expectAbsent: true });
    await assert.rejects(() => saveZoteroSelection(projectDir, library), /REVISION_REQUIRED/);
    await saveZoteroSelection(projectDir, library, { expectedRevision: 1 });
    const state = await loadProjectState(statePath);
    assert.equal(state.revision, 2);
    assert.deepEqual(state.project.zoteroLibrary, library);
    assert.deepEqual(await loadZoteroSelection(projectDir), library);
    assert.equal(state.events.at(-1).type, "zotero.library.selected");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});
