import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { profileReadiness } from "./project-state.mjs";

const START = "<!-- thesisos:researcher:start -->";
const END = "<!-- thesisos:researcher:end -->";

function slug(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function managed(title, entityId, body, researcher = "") {
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
  return `---\ntitle: ${JSON.stringify(title)}\nmanaged_by: thesisos\nschema_version: 2\nentity_id: ${JSON.stringify(entityId)}\ngenerated_hash: ${hash}\n---\n\n# ${title}\n\n${body.trim()}\n\n${START}\n${researcher}${END}\n`;
}

function count(state, status) {
  return state.claims.filter((claim) => claim.status === status).length;
}

export function renderWorkspace(state) {
  const views = {};
  const selected = state.evidence.filter((source) => source.selected !== false);
  const unresolved = state.manuscript?.unresolvedCitekeys ?? [];
  const readiness = profileReadiness(state);
  const dashboard = [
    `- Profile: ${readiness.ready ? "ready" : `incomplete (${readiness.missing.join(", ")})`}`,
    `- ${count(state, "approved")} approved claim${count(state, "approved") === 1 ? "" : "s"}`,
    `- ${count(state, "proposed")} proposed claim${count(state, "proposed") === 1 ? "" : "s"} awaiting review`,
    `- ${unresolved.length} unresolved citekey${unresolved.length === 1 ? "" : "s"}`,
    `- ${selected.length} selected evidence source${selected.length === 1 ? "" : "s"}`
  ].join("\n");
  views["00-Dashboard.md"] = managed(`${state.project.name} dashboard`, "dashboard", dashboard);
  const provenance = (item) => item?.provenance?.kind === "user-stated"
    ? "Researcher stated"
    : item?.provenance?.sourceId ? `Project document · ${item.provenance.locator ?? item.provenance.sourceId}` : "Not recorded";
  const profile = state.profile ?? {};
  const selectedScope = (profile.problems ?? []).find(({ selected }) => selected === true);
  const profileBody = [
    `**${readiness.ready ? "Profile ready" : "Profile incomplete"}**${readiness.missing.length ? ` — missing: ${readiness.missing.join(", ")}` : ""}`,
    "",
    `## Title`,
    profile.title ? `${profile.title.value}\n\n_Source: ${provenance(profile.title)}_` : "Not approved yet.",
    "",
    "## Topic",
    profile.topic ? `${profile.topic.value}\n\n_Source: ${provenance(profile.topic)}_` : "Not approved yet.",
    "",
    "## Objectives",
    (profile.objectives ?? []).length ? profile.objectives.map((objective) => `- ${objective.text} _(Source: ${provenance(objective)})_`).join("\n") : "No approved objectives.",
    "",
    "## Selected scope",
    selectedScope ? `${selectedScope.name}${selectedScope.summary ? ` — ${selectedScope.summary}` : ""}\n\n_Source: ${provenance(selectedScope)}_` : "No scope selected.",
    "",
    "## Current stage",
    profile.stage ? `${profile.stage.value}\n\n_Source: ${provenance(profile.stage)}_` : "Not recorded.",
    "",
    "## Manuscript map",
    (state.manuscript?.chapters ?? []).length ? state.manuscript.chapters.map((chapter) => `- ${chapter.number ? `${chapter.number} ` : ""}${chapter.title}`).join("\n") : "No manuscript headings scanned."
  ].join("\n");
  views["00-Profile.md"] = managed(`${state.project.name} profile`, "profile", profileBody);
  views["Claims.md"] = managed("Claim–evidence ledger", "claims", state.claims.length
    ? state.claims.map((claim) => `- **${claim.status}** [${claim.id}] ${claim.text} — ${claim.sourceIds.join(", ") || "no evidence"}`).join("\n")
    : "No claim–evidence links recorded.");
  for (const chapter of state.manuscript?.chapters ?? []) {
    const claims = state.claims.filter((claim) => claim.chapterId === chapter.id);
    views[`01-Chapters/${slug(chapter.id)}.md`] = managed(chapter.title, chapter.id, claims.length
      ? claims.map((claim) => `- [${claim.id}] **${claim.status}** — ${claim.text}`).join("\n")
      : "No claim links recorded for this chapter.");
  }
  for (const source of selected) {
    views[`02-Literature/${slug(source.sourceId)}.md`] = managed(source.title, source.sourceId, `- Source ID: \`${source.sourceId}\`\n- Selected evidence: yes`);
  }
  for (const feedback of state.feedbackThreads ?? []) {
    views[`03-Feedback/${slug(feedback.id)}.md`] = managed(feedback.title ?? "Supervisor feedback", feedback.id, feedback.feedback ?? "");
  }
  return views;
}

function researcherContent(existing) {
  const starts = existing.split(START).length - 1;
  const ends = existing.split(END).length - 1;
  if (starts !== 1 || ends !== 1) throw new Error("Managed file has missing or duplicated researcher-section markers.");
  return existing.slice(existing.indexOf(START) + START.length, existing.indexOf(END));
}

export async function writeWorkspace(vaultPath, views, options = {}) {
  if (options.approved !== true) throw new Error("Explicit write approval is required before rendering the workspace.");
  const workspaceRoot = resolve(vaultPath, "ThesisOS");
  for (const [relativePath, proposed] of Object.entries(views)) {
    const path = resolve(workspaceRoot, relativePath);
    if (path !== workspaceRoot && !path.startsWith(`${workspaceRoot}${sep}`)) throw new Error(`Rendered path escapes workspace: ${relativePath}`);
    let content = proposed;
    try {
      const existing = await readFile(path, "utf8");
      if (!existing.includes("managed_by: thesisos")) throw new Error(`Refusing to overwrite unmanaged file '${path}'.`);
      content = proposed.replace(`${START}\n${END}`, `${START}${researcherContent(existing)}${END}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  }
  return { written: Object.keys(views).length, root: workspaceRoot };
}
