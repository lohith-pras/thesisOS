import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  approveClaimProposal,
  createProjectState,
  loadProjectState,
  recordClaimProposals,
  saveProjectState,
  updateProjectScan
} from "./core/project-state.mjs";
import { scanThesisCheckout } from "./core/thesis-scan.mjs";
import { mapBibliographyToSources } from "./core/citation-mapping.mjs";
import { renderWorkspace, writeWorkspace } from "./core/workspace-renderer.mjs";
import { proposeClaimEvidenceLinksWithCodex } from "./core/claim-proposals.mjs";

const COMMANDS = new Set(["init", "scan", "propose", "review", "render", "status"]);
const REVISION_GUARDED_COMMANDS = new Set(["scan", "propose", "review"]);

function absolute(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return resolve(value);
}

function revision(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("--expected-revision must be a positive integer.");
  }
  return parsed;
}

export function parseWorkspaceArgs(args) {
  const command = args[0];
  if (!COMMANDS.has(command)) throw new Error("Use one of: init, scan, propose, review, render, status.");
  const options = { command };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--approve-write") { options.approveWrite = true; continue; }
    if (arg === "--approve-external-processing") { options.approvedExternalProcessing = true; continue; }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    index += 1;
    if (arg === "--project-dir") options.projectDir = resolve(value);
    else if (arg === "--project") options.project = value;
    else if (arg === "--thesis-dir") options.thesisDir = resolve(value);
    else if (arg === "--vault") options.vaultPath = resolve(value);
    else if (arg === "--sources-file") options.sourcesFile = resolve(value);
    else if (arg === "--model") options.model = value;
    else if (arg === "--expected-revision") options.expectedRevision = revision(value);
    else if (arg === "--approve") { options.claimId = value; options.decision = "approved"; }
    else if (arg === "--reject") { options.claimId = value; options.decision = "rejected"; }
    else throw new Error(`Unknown option '${arg}'.`);
  }
  if (!options.projectDir) throw new Error("--project-dir is required.");
  if (command === "init") {
    if (!options.project?.trim()) throw new Error("--project is required for init.");
    options.thesisDir = absolute(options.thesisDir, "--thesis-dir");
    options.vaultPath = absolute(options.vaultPath, "--vault");
  }
  if (command === "review" && (!options.claimId || !options.decision)) throw new Error("review requires --approve or --reject.");
  if (REVISION_GUARDED_COMMANDS.has(command) && options.expectedRevision === undefined) {
    throw new Error(`${command} requires --expected-revision from the current canonical state.`);
  }
  return options;
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function readSources(path, fallback = []) {
  if (!path) return fallback;
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value)) throw new Error("Sources file must contain a JSON array.");
  return value;
}

function statePath(options) {
  return resolve(options.projectDir, ".thesisos", "thesis-state.json");
}

async function scanAndSave(state, path, sources, expectedRevision, persistOptions = { expectedRevision }) {
  const scan = await scanThesisCheckout(state.project.thesisDir);
  const mapping = mapBibliographyToSources(scan.bibliography, sources);
  const updated = updateProjectScan(state, { scan, mapping, sources }, { expectedRevision });
  await saveProjectState(path, updated, persistOptions);
  return updated;
}

function assertCurrentRevision(state, expectedRevision) {
  if (expectedRevision === state.revision) return;
  const error = new Error(`STATE_STALE: expected revision ${expectedRevision}, current revision is ${state.revision}.`);
  error.code = "STATE_STALE";
  throw error;
}

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseWorkspaceArgs(args);
  const log = dependencies.log ?? console.log;
  const path = statePath(options);
  if (options.command === "init") {
    if (await exists(path)) {
      throw new Error(`Canonical state already exists at ${path}. Use a revision-guarded command to change it.`);
    }
    let state = createProjectState({ project: options.project, thesisDir: options.thesisDir, vaultPath: options.vaultPath });
    const sources = await readSources(options.sourcesFile, state.sources ?? []);
    state = await scanAndSave(state, path, sources, state.revision, { expectedRevision: 0, expectAbsent: true });
    log(`Canonical state initialized: ${path}`);
    log(`${state.manuscript.chapters.length} chapters · ${state.manuscript.citations.length} citations · ${state.manuscript.unresolvedCitekeys.length} unresolved citekeys`);
    return state;
  }

  let state = await loadProjectState(path);
  if (REVISION_GUARDED_COMMANDS.has(options.command)) {
    assertCurrentRevision(state, options.expectedRevision);
  }
  if (options.command === "scan") {
    const sources = await readSources(options.sourcesFile, state.sources ?? state.evidence);
    state = await scanAndSave(state, path, sources, options.expectedRevision);
    log(`Canonical state updated: ${path}`);
    return state;
  }
  if (options.command === "propose") {
    const proposer = dependencies.propose ?? proposeClaimEvidenceLinksWithCodex;
    const proposals = await proposer({
      excerpts: state.manuscript.citations.map(({ locationId, context }) => {
        const chapter = state.manuscript.chapters.find(({ sourcePath }) => locationId.startsWith(`tex:${sourcePath}:`));
        return { chapterId: chapter?.id ?? state.manuscript.chapters[0]?.id, locationId, context };
      }),
      evidence: state.evidence,
      approvedExternalProcessing: options.approvedExternalProcessing
    }, { model: options.model, cwd: state.project.thesisDir });
    state = recordClaimProposals(state, proposals, {
      provider: "codex",
      model: options.model ?? "codex-default",
      approvedExternalProcessing: options.approvedExternalProcessing,
      expectedRevision: options.expectedRevision,
      knownSourceIds: state.evidence.map(({ sourceId }) => sourceId)
    });
    await saveProjectState(path, state, { expectedRevision: options.expectedRevision });
    log(`${proposals.length} claim–evidence proposals recorded for review.`);
    return state;
  }
  if (options.command === "review") {
    state = approveClaimProposal(state, options.claimId, options.decision, { expectedRevision: options.expectedRevision });
    await saveProjectState(path, state, { expectedRevision: options.expectedRevision });
    log(`Claim ${options.claimId}: ${options.decision}`);
    return state;
  }
  if (options.command === "render") {
    const result = await writeWorkspace(state.project.vaultPath, renderWorkspace(state), { approved: options.approveWrite });
    log(`Rendered ${result.written} managed views: ${result.root}`);
    return result;
  }
  const summary = {
    revision: state.revision,
    approved: state.claims.filter(({ status }) => status === "approved").length,
    proposed: state.claims.filter(({ status }) => status === "proposed").length,
    rejected: state.claims.filter(({ status }) => status === "rejected").length,
    unresolvedCitekeys: state.manuscript.unresolvedCitekeys.length,
    selectedEvidence: state.evidence.length
  };
  log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
