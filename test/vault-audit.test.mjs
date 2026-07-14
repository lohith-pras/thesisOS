import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditObsidianVault } from "../src/core/vault-audit.mjs";

test("audits a vault without modifying any notes", async () => {
  const vault = await mkdtemp(join(tmpdir(), "thesisos-vault-audit-"));
  try {
    await mkdir(join(vault, "Evidence"));
    await writeFile(join(vault, "Evidence", "managed.md"), "---\nmanaged_by: thesisos\nsource_ids:\n  - group:1:ABC\n---\n[[Missing note]]\n");
    await writeFile(join(vault, "plain.md"), "# Plain note\n");
    const report = await auditObsidianVault(vault, { now: "2026-07-14T10:00:00.000Z" });
    assert.equal(report.mode, "read-only");
    assert.equal(report.statistics.noteCount, 2);
    assert.deepEqual(report.proposals, [{ type: "broken-link", path: "Evidence/managed.md", target: "Missing note" }]);
    assert.equal(report.managedNotes[0].sourceIds[0], "group:1:ABC");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
