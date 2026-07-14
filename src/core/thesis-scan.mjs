import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".thesisos", "node_modules", "build", "dist", "out"]);

function slug(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name))) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(root, path));
    else if (/\.(?:tex|bib)$/i.test(entry.name)) files.push(path);
  }
  return files.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
}

function parseBibEntries(text) {
  const entries = {};
  const header = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  for (let match; (match = header.exec(text));) {
    let depth = 1;
    let index = header.lastIndex;
    while (index < text.length && depth > 0) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") depth -= 1;
      index += 1;
    }
    const body = text.slice(header.lastIndex, index - 1);
    const fields = {};
    const fieldPattern = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)")\s*,?/g;
    for (let field; (field = fieldPattern.exec(body));) fields[field[1].toLowerCase()] = (field[2] ?? field[3] ?? "").trim();
    entries[match[2]] = { citekey: match[2], type: match[1].toLowerCase(), ...fields };
    header.lastIndex = index;
  }
  return entries;
}

export async function scanThesisCheckout(thesisDir) {
  const root = await realpath(thesisDir);
  const files = await collectFiles(root);
  const chapters = [];
  const citations = [];
  const bibliography = {};
  for (const file of files) {
    const canonical = await realpath(file);
    if (canonical !== root && !canonical.startsWith(`${root}${sep}`)) throw new Error(`Thesis file escapes configured checkout: ${file}`);
    const sourcePath = relative(root, canonical);
    const text = await readFile(canonical, "utf8");
    if (canonical.toLowerCase().endsWith(".bib")) {
      Object.assign(bibliography, parseBibEntries(text));
      continue;
    }
    for (const match of text.matchAll(/\\(?:chapter|section)\*?\{([^}]+)\}/g)) {
      chapters.push({ id: `chapter-${slug(match[1])}`, title: match[1].trim(), sourcePath });
    }
    for (const match of text.matchAll(/\\cite(?:t|p|alp|author|year)?\*?(?:\[[^\]]*\]){0,2}\{([^}]+)\}/g)) {
      const before = text.slice(0, match.index);
      const line = before.split("\n").length;
      const paragraph = text.slice(0, match.index).split(/\n\s*\n/).length;
      citations.push({
        id: `citation-${slug(sourcePath)}-${line}`,
        sourcePath,
        line,
        locationId: `tex:${sourcePath}:paragraph-${paragraph}`,
        citekeys: match[1].split(",").map((key) => key.trim()).filter(Boolean),
        context: text.slice(Math.max(0, match.index - 240), Math.min(text.length, match.index + match[0].length + 240)).trim()
      });
    }
  }
  return {
    scannedAt: new Date().toISOString(),
    thesisDir: root,
    files: files.map((file) => relative(root, file)),
    chapters: chapters.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    citations: citations.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line),
    bibliography
  };
}
