import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeWorkspace } from "../src/core/workspace-renderer.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "thesisos-workspace-security-"));
  const vault = join(root, "vault");
  const outside = join(root, "outside");
  await Promise.all([mkdir(vault), mkdir(outside)]);
  return { root, vault, outside };
}

async function createSymlinkOrSkip(t, target, path, type) {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      t.skip("creating symbolic links requires Developer Mode or elevated privileges on Windows");
      return false;
    }
    throw error;
  }
}

test("managed workspace rendering rejects paths outside its approved vault", async () => {
  const { vault } = await fixture();
  const options = { approved: true };

  await assert.rejects(
    () => writeWorkspace(vault, { "../outside.md": "outside" }, options),
    /Rendered path escapes workspace/
  );
  await assert.rejects(
    () => writeWorkspace(vault, { "": "workspace root is not a file" }, options),
    /Rendered path must name a file/
  );
  await assert.rejects(
    () => writeWorkspace("relative-vault", { "00-Dashboard.md": "content" }, options),
    /Workspace vault path must be absolute/
  );
});

test("managed workspace rendering refuses symlinked roots, directories, and files", async (t) => {
  const options = { approved: true };

  const rootFixture = await fixture();
  if (!await createSymlinkOrSkip(t, rootFixture.outside, join(rootFixture.vault, "ThesisOS"), "dir")) return;
  await assert.rejects(
    () => writeWorkspace(rootFixture.vault, { "00-Dashboard.md": "dashboard" }, options),
    /managed workspace root cannot be a symbolic link/
  );
  assert.deepEqual(await readdir(rootFixture.outside), []);

  const directoryFixture = await fixture();
  const workspaceRoot = join(directoryFixture.vault, "ThesisOS");
  await mkdir(workspaceRoot);
  if (!await createSymlinkOrSkip(t, directoryFixture.outside, join(workspaceRoot, "02-Literature"), "dir")) return;
  await assert.rejects(
    () => writeWorkspace(directoryFixture.vault, { "02-Literature/source.md": "source" }, options),
    /managed workspace directory cannot be a symbolic link/
  );
  await assert.rejects(() => readFile(join(directoryFixture.outside, "source.md"), "utf8"), { code: "ENOENT" });

  const fileFixture = await fixture();
  const fileDirectory = join(fileFixture.vault, "ThesisOS", "02-Literature");
  const outsideFile = join(fileFixture.outside, "source.md");
  const managedFile = join(fileDirectory, "source.md");
  await mkdir(fileDirectory, { recursive: true });
  await writeFile(outsideFile, "outside content");
  if (!await createSymlinkOrSkip(t, outsideFile, managedFile, "file")) return;
  await assert.rejects(
    () => writeWorkspace(fileFixture.vault, { "02-Literature/source.md": "replacement" }, options),
    /managed workspace file cannot be a symbolic link/
  );
  assert.equal(await readFile(outsideFile, "utf8"), "outside content");
});
