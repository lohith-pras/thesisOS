import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeObsidianNote } from "../src/core/obsidian.mjs";
import { validateVaultName } from "../src/core/obsidian-vault.mjs";

const preview = {
  filename: "literature-evidence--review-paper--0123456789.md",
  markdown: "---\nmanaged_by: proofline\n---\n# Grounded note"
};

test("rejects note filenames that could escape the managed evidence directory", async () => {
  await assert.rejects(
    () => writeObsidianNote({ ...preview, filename: "literature-evidence--x/../../outside--0123456789.md" }, { vaultPath: "/tmp/vault", approved: true }),
    /does not match the preview format/
  );
});

test("accepts only one safe folder name when creating an Obsidian vault", () => {
  assert.equal(validateVaultName("Research vault 2026"), "Research vault 2026");
  assert.throws(() => validateVaultName("../../outside"), /short vault name/);
  assert.throws(() => validateVaultName("nested/vault"), /short vault name/);
});

test("refuses symlinked managed directories and note targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "thesisos-obsidian-security-"));
  const outside = await mkdtemp(join(tmpdir(), "thesisos-obsidian-outside-"));
  try {
    await symlink(outside, join(root, "10_Literature_Notes"));
    await assert.rejects(() => writeObsidianNote(preview, { vaultPath: root, approved: true }), /cannot be a symbolic link/);

    await rm(join(root, "10_Literature_Notes"));
    await mkdir(join(root, "10_Literature_Notes"));
    const outsideNote = join(outside, preview.filename);
    await writeFile(outsideNote, "private content");
    await symlink(outsideNote, join(root, "10_Literature_Notes", preview.filename));
    await assert.rejects(() => writeObsidianNote(preview, { vaultPath: root, approved: true }), /cannot be a symbolic link/);
    assert.equal(await readFile(outsideNote, "utf8"), "private content");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
