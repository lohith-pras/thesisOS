import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function openEmbeddingCache(path) {
  let entries = {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed.schemaVersion === 1 && parsed.entries && typeof parsed.entries === "object") entries = parsed.entries;
  } catch (error) {
    if (error.code !== "ENOENT") entries = {};
  }
  let dirty = false;
  return {
    get(key) { return entries[key] ?? null; },
    set(key, embedding) { entries[key] = embedding; dirty = true; },
    async save() {
      if (!dirty) return;
      await mkdir(dirname(path), { recursive: true });
      const temporaryPath = `${path}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: 1, entries })}\n`, { mode: 0o600 });
      await rename(temporaryPath, path);
      dirty = false;
    }
  };
}
