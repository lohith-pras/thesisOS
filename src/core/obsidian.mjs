import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { createHash } from "node:crypto";
import { compactEvidenceText, validateGroundedDraft } from "./note-drafting.mjs";

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

function noteIdentity(feedback) {
  return createHash("sha256").update(String(feedback).trim()).digest("hex").slice(0, 10);
}

const EVIDENCE_NOTE_FILENAME = /^literature-evidence--[a-z0-9]+(?:-[a-z0-9]+)*--[a-f0-9]{10}\.md$/;

function feedbackLabel(feedback) {
  const words = String(feedback).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, 9).join(" ").replace(/[,:;.]$/, "") || "research feedback";
}

export function createEvidenceNoteReadModel({ project, feedback, evidenceRefs, draft }, preview) {
  return {
    schemaVersion: 1,
    title: preview.title,
    feedback: requireText(feedback, "Supervisor feedback"),
    synthesis: draft ? { overview: compactEvidenceText(draft.overview, 60, 2), provider: draft.provider, model: draft.model ?? null, styleReview: draft.styleReview ?? null } : null,
    sources: evidenceRefs.map((reference, index) => {
      const sourceNote = draft?.sourceNotes?.find((note) => note.sourceId === reference.sourceId) ?? null;
      return {
        ordinal: index + 1,
        sourceId: reference.sourceId,
        title: reference.title,
        year: reference.year ?? null,
        venue: reference.publicationTitle ?? null,
        doi: reference.doi ?? null,
        sourceUrl: reference.doi ? `https://doi.org/${reference.doi}` : reference.url ?? null,
        summary: sourceNote?.summary ? compactEvidenceText(sourceNote.summary, 32) : null,
        relevance: sourceNote?.relevance ? compactEvidenceText(sourceNote.relevance, 20) : null
      };
    })
  };
}

export function createObsidianNotePreview({ project, feedback, evidenceRefs, draft }, options = {}) {
  const projectName = requireText(project, "Project name");
  const sourceFeedback = requireText(feedback, "Supervisor feedback");
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) throw new Error("At least one evidence reference is required.");
  const groundedDraft = draft ? validateGroundedDraft(draft, evidenceRefs) : null;
  const identity = noteIdentity(sourceFeedback);
  const title = `Literature evidence — ${feedbackLabel(sourceFeedback)}`;
  const filename = `literature-evidence--${slugify(feedbackLabel(sourceFeedback)).slice(0, 72)}--${identity}.md`;
  const createdAt = options.now ?? new Date().toISOString();
  const sources = evidenceRefs.map((reference, index) => {
    const sourceId = requireText(reference.sourceId, `Evidence ${index + 1} source ID`);
    const paperTitle = requireText(reference.title, `Evidence ${index + 1} title`);
    const authors = reference.creators?.length ? reference.creators.join(", ") : "Creator metadata unavailable";
    const primaryLink = reference.doi ? `https://doi.org/${reference.doi}` : reference.url;
    return `## ${index + 1}. ${paperTitle}\n\n- Authors: ${authors}\n- Year: ${reference.year ?? "Not recorded"}\n- Zotero source ID: \`${sourceId}\`\n- Zotero item key: \`${reference.key ?? "Not recorded"}\`\n- Library: ${reference.library?.name ?? reference.library?.id ?? "Not recorded"}\n- DOI: ${reference.doi ? `[${reference.doi}](https://doi.org/${reference.doi})` : "Not recorded"}\n- Source link: ${primaryLink ? `[Open source](${primaryLink})` : "Not recorded"}\n\n### Researcher review\n\n- Claim:\n- Method:\n- Limitation:\n- Relevance to feedback:\n`;
  }).join("\n");
  const synthesis = groundedDraft ? `## Grounded synthesis\n\n${groundedDraft.overview}\n\n${groundedDraft.sourceNotes.map((note) => `### [${note.sourceId}]\n\n${note.summary}\n\n**Relevance:** ${note.relevance}`).join("\n\n")}\n\n> Draft provider: ${groundedDraft.provider}${groundedDraft.model && groundedDraft.model !== "none" ? ` · ${groundedDraft.model}` : ""}. Verify every statement before thesis use.\n\n` : "";
  const markdown = `---\ntitle: ${yamlString(title)}\nproject: ${yamlString(projectName)}\ncreated: ${yamlString(createdAt)}\nnote_identity: ${yamlString(identity)}\nsource_count: ${evidenceRefs.length}\nmanaged_by: proofline\ntags:\n  - proofline\n  - literature-evidence\n---\n\n# ${title}\n\n## Supervisor feedback\n\n> ${sourceFeedback.replaceAll("\n", "\n> ")}\n\n${synthesis}## Evidence sources\n\n${sources}`;

  const preview = { schemaVersion: 1, title, filename, createdAt, sourceCount: evidenceRefs.length, markdown, writeApproved: false };
  return { ...preview, readModel: createEvidenceNoteReadModel({ project: projectName, feedback: sourceFeedback, evidenceRefs, draft: groundedDraft }, preview) };
}

export async function writeObsidianNote(preview, { vaultPath, approved, mkdirImpl = mkdir, readFileImpl = readFile, writeFileImpl = writeFile } = {}) {
  if (approved !== true) throw new Error("Explicit write approval is required before creating an Obsidian note.");
  const root = requireText(vaultPath, "Obsidian vault path");
  if (!isAbsolute(root)) throw new Error("Obsidian vault path must be absolute.");
  const filename = requireText(preview?.filename, "Note filename");
  requireText(preview?.markdown, "Note Markdown");
  const markdown = preview.markdown;
  if (!EVIDENCE_NOTE_FILENAME.test(filename)) throw new Error("Note filename does not match the preview format.");
  const directory = resolve(root, "10_Literature_Notes");
  const path = resolve(directory, filename);
  await mkdirImpl(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("The managed Obsidian notes directory cannot be a symbolic link.");
  try {
    await writeFileImpl(path, markdown, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") {
      if ((await lstat(path)).isSymbolicLink()) throw new Error("The managed Obsidian note cannot be a symbolic link.");
      let existing;
      try { existing = await readFileImpl(path, "utf8"); } catch { existing = ""; }
      if (!existing.includes("managed_by: proofline") && !existing.includes("managed_by: thesisos")) throw new Error(`An unmanaged Obsidian note already exists at '${path}'. Choose a different feedback note.`);
      await writeFileImpl(path, markdown, { encoding: "utf8", flag: "w" });
      return { schemaVersion: 1, adapter: "obsidian-markdown", path, filename, writtenAt: new Date().toISOString(), writeApproved: true, updated: true };
    }
    throw error;
  }
  return { schemaVersion: 1, adapter: "obsidian-markdown", path, filename, writtenAt: new Date().toISOString(), writeApproved: true, updated: false };
}
