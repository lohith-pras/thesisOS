import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

async function markdownPaths(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.name === ".obsidian") continue;
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) paths.push(...await markdownPaths(root, path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) paths.push(path);
  }
  return paths;
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return match?.[1] ?? "";
}

function sourceIds(markdown) {
  const block = frontmatter(markdown).match(/^source_ids:\n((?:\s+-\s+.+\n?)*)/m)?.[1] ?? "";
  return [...block.matchAll(/^\s+-\s+(.+)$/gm)].map((match) => match[1].trim());
}

function links(markdown) {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((match) => match[1].trim()).filter(Boolean);
}

export async function auditObsidianVault(vaultPath, options = {}) {
  const root = resolve(vaultPath);
  const paths = await markdownPaths(root);
  const notes = await Promise.all(paths.map(async (path) => ({ path, markdown: await readFile(path, "utf8") })));
  const names = new Set(notes.map(({ path }) => relative(root, path).replace(/\.md$/i, "").split(sep).at(-1)));
  const managedNotes = notes.filter(({ markdown }) => /^managed_by:\s*thesisos\s*$/m.test(frontmatter(markdown))).map(({ path, markdown }) => ({
    path: relative(root, path), sourceIds: sourceIds(markdown)
  }));
  const proposals = notes.flatMap(({ path, markdown }) => links(markdown)
    .filter((target) => !names.has(target))
    .map((target) => ({ type: "broken-link", path: relative(root, path), target })));
  for (const note of managedNotes.filter((note) => note.sourceIds.length === 0)) proposals.push({ type: "missing-source-id", path: note.path });
  return {
    schemaVersion: 1,
    mode: "read-only",
    auditedAt: options.now ?? new Date().toISOString(),
    vaultPath: root,
    statistics: { noteCount: notes.length, managedNoteCount: managedNotes.length, proposalCount: proposals.length },
    managedNotes,
    proposals
  };
}
