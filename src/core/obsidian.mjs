import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "literature-evidence";
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

export function createObsidianNotePreview({ project, feedback, evidenceRefs }, options = {}) {
  const projectName = requireText(project, "Project name");
  const sourceFeedback = requireText(feedback, "Supervisor feedback");
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) throw new Error("At least one evidence reference is required.");
  const title = `Literature evidence — ${projectName}`;
  const filename = `${slugify(title)}.md`;
  const createdAt = options.now ?? new Date().toISOString();
  const sources = evidenceRefs.map((reference, index) => {
    const sourceId = requireText(reference.sourceId, `Evidence ${index + 1} source ID`);
    const paperTitle = requireText(reference.title, `Evidence ${index + 1} title`);
    const authors = reference.creators?.length ? reference.creators.join(", ") : "Creator metadata unavailable";
    const primaryLink = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
    return `## ${index + 1}. ${paperTitle}\n\n- Authors: ${authors}\n- Year: ${reference.year ?? "Not recorded"}\n- Zotero source ID: \`${sourceId}\`\n- Zotero item key: \`${reference.key ?? "Not recorded"}\`\n- Library: ${reference.library?.name ?? reference.library?.id ?? "Not recorded"}\n- DOI: ${reference.doi ? `[${reference.doi}](https://doi.org/${reference.doi})` : "Not recorded"}\n- Source link: ${primaryLink ? `[Open source](${primaryLink})` : "Not recorded"}\n\n### Researcher review\n\n- Claim:\n- Method:\n- Limitation:\n- Relevance to feedback:\n`;
  }).join("\n");
  const markdown = `---\ntitle: ${yamlString(title)}\nproject: ${yamlString(projectName)}\ncreated: ${yamlString(createdAt)}\nsource_count: ${evidenceRefs.length}\ntags:\n  - thesisos\n  - literature-evidence\n---\n\n# ${title}\n\n## Supervisor feedback\n\n> ${sourceFeedback.replaceAll("\n", "\n> ")}\n\n## Evidence sources\n\n${sources}`;

  return { schemaVersion: 1, title, filename, createdAt, sourceCount: evidenceRefs.length, markdown, writeApproved: false };
}

export async function writeObsidianNote(preview, { vaultPath, approved, mkdirImpl = mkdir, writeFileImpl = writeFile } = {}) {
  if (approved !== true) throw new Error("Explicit write approval is required before creating an Obsidian note.");
  const root = requireText(vaultPath, "Obsidian vault path");
  if (!isAbsolute(root)) throw new Error("Obsidian vault path must be absolute.");
  const filename = requireText(preview?.filename, "Note filename");
  requireText(preview?.markdown, "Note Markdown");
  const markdown = preview.markdown;
  if (filename !== `${slugify(preview.title)}.md`) throw new Error("Note filename does not match the preview title.");
  const directory = resolve(root, "ThesisOS", "Literature");
  const path = resolve(directory, filename);
  await mkdirImpl(directory, { recursive: true });
  try {
    await writeFileImpl(path, markdown, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`An Obsidian note already exists at '${path}'. Rename or remove it before retrying.`);
    throw error;
  }
  return { schemaVersion: 1, adapter: "obsidian-markdown", path, filename, writtenAt: new Date().toISOString(), writeApproved: true };
}
