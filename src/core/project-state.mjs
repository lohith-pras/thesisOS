import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const CLAIM_STATUSES = new Set(["proposed", "approved", "rejected"]);
const PROFILE_STAGES = new Set([
  "literature-review",
  "introduction",
  "system-model",
  "problem-formulation",
  "experiments",
  "results",
  "future-work",
  "references",
  // Retained so existing workspaces created before the guided stage path remain valid.
  "proposal",
  "literature",
  "writing",
  "revision"
]);

const STAGE_SIGNALS = [
  ["literature-review", ["literature", "review", "paper", "evidence", "citation"]],
  ["introduction", ["introduction", "intro", "motivation", "background", "contribution"]],
  ["system-model", ["system model", "channel", "target model", "orientation", "geometry", "scattering", "assumption"]],
  ["problem-formulation", ["problem formulation", "formulation", "constraint", "objective", "optimization", "minimize", "maximize"]],
  ["experiments", ["experiment", "simulation", "benchmark", "evaluation", "evaluate", "setup"]],
  ["results", ["result", "figure", "table", "ablation", "performance", "finding"]],
  ["future-work", ["future work", "limitation", "extension"]],
  ["references", ["reference", "bibliography"]]
];

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function event(type, now, details = {}) {
  return { id: randomUUID(), type, at: now ?? new Date().toISOString(), ...details };
}

function normalizedFeedback(value) {
  return String(value ?? "").replace(/^[\t ]*>+[\t ]?/gm, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function feedbackSimilarity(left, right) {
  const a = new Set(normalizedFeedback(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(normalizedFeedback(right).split(" ").filter((word) => word.length > 2));
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.max(1, new Set([...a, ...b]).size);
}

function feedbackDelta(existing, incoming) {
  const known = new Set(normalizedFeedback(existing).split(" ").filter(Boolean));
  const sentences = String(incoming).replace(/^[\t ]*>+[\t ]?/gm, "").split(/(?<=[.!?])\s+|\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return sentences.filter((sentence) => {
    const words = normalizedFeedback(sentence).split(" ").filter((word) => word.length > 2);
    return words.length && words.filter((word) => !known.has(word)).length / words.length > 0.25;
  }).join("\n\n");
}

export function findFeedbackMatch(state, input) {
  const feedback = requireText(input.feedback, "Supervisor feedback");
  const title = String(input.title ?? "Supervisor feedback").trim().toLowerCase();
  for (const thread of state.feedbackThreads) {
    const versions = [thread.feedback, ...(thread.feedbackVersions ?? []).map(({ feedback: version }) => version)];
    if (versions.some((version) => normalizedFeedback(version) === normalizedFeedback(feedback))) return { kind: "exact", thread };
  }
  const related = state.feedbackThreads
    .filter((thread) => String(thread.title ?? "").trim().toLowerCase() === title)
    .map((thread) => ({ thread, similarity: feedbackSimilarity(thread.feedback, feedback) }))
    .sort((a, b) => b.similarity - a.similarity)[0];
  return related?.similarity >= 0.78 ? { kind: "follow_up", thread: related.thread } : null;
}

export function consolidateFeedbackThreads(state, options = {}) {
  validateProjectState(state);
  const retained = [];
  const remappedThreadIds = new Map();
  for (const thread of state.feedbackThreads) {
    const match = findFeedbackMatch({ ...state, feedbackThreads: retained }, { title: thread.title, feedback: thread.feedback });
    if (!match) {
      retained.push(thread);
      continue;
    }
    const primary = match.thread;
    const delta = feedbackDelta(primary.feedback, thread.feedback);
    const versions = [...(primary.feedbackVersions ?? [{ feedback: primary.feedback, capturedAt: primary.createdAt }]), ...(thread.feedbackVersions ?? [{ feedback: thread.feedback, capturedAt: thread.createdAt }])];
    const taskIds = new Set(primary.tasks?.map(({ id }) => id) ?? []);
    const merged = {
      ...primary,
      feedback: delta ? `${primary.feedback}\n\nSupervisor follow-up:\n${delta}` : primary.feedback,
      feedbackVersions: versions,
      tasks: [...(primary.tasks ?? []), ...(thread.tasks ?? []).filter((task) => !taskIds.has(task.id))],
      placement: primary.placement?.status === "confirmed" ? primary.placement : thread.placement ?? primary.placement,
      updatedAt: options.now ?? new Date().toISOString()
    };
    retained[retained.findIndex(({ id }) => id === primary.id)] = merged;
    remappedThreadIds.set(thread.id, primary.id);
  }
  if (!remappedThreadIds.size) return state;
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    feedbackThreads: retained,
    evidence: state.evidence.map((record) => remappedThreadIds.has(record.feedbackThreadId) ? { ...record, feedbackThreadId: remappedThreadIds.get(record.feedbackThreadId) } : record),
    events: [...state.events, event("feedback.duplicates.consolidated", now, { mergedThreadCount: remappedThreadIds.size })]
  });
}

export function suggestFeedbackPlacement(state, feedback) {
  const text = String(feedback ?? "").toLowerCase();
  const chapters = state.manuscript?.chapters ?? [];
  const explicit = text.match(/\b(?:chapter|section)\s+([0-9]+(?:\.[0-9]+)*)\b/i)?.[1];
  const targetLocationIds = explicit
    ? chapters.filter((chapter) => chapter.number === explicit).map(({ id }) => id)
    : chapters.filter((chapter) => text.includes(String(chapter.title ?? "").toLowerCase()) && String(chapter.title ?? "").length > 3).slice(0, 1).map(({ id }) => id);
  const scored = STAGE_SIGNALS.map(([stage, signals]) => [stage, signals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0)]);
  const [matchedStage, score] = scored.sort((a, b) => b[1] - a[1])[0];
  const stage = score ? matchedStage : state.profile?.stage?.value ?? null;
  const confidence = score >= 2 || targetLocationIds.length ? "high" : score ? "medium" : "low";
  const rationale = targetLocationIds.length
    ? "Matches a section named in the feedback."
    : score ? "Matches language commonly used for this thesis stage."
      : "No direct stage cue was found; this uses the current thesis profile stage as a starting point.";
  return { status: "suggested", stage, targetLocationIds, confidence, rationale, suggestedAt: new Date().toISOString() };
}

export function validateProjectState(state) {
  if (!state || typeof state !== "object") throw new Error("Project state must be an object.");
  if (state.schemaVersion !== 3) throw new Error(`Unsupported project state schema version '${state.schemaVersion}'.`);
  if (!Number.isInteger(state.revision) || state.revision < 1) throw new Error("Project revision must be a positive integer.");
  requireText(state.project?.name, "Project name");
  if (state.project?.thesisDir !== null) requireText(state.project?.thesisDir, "Thesis directory");
  if (state.project?.vaultPath !== null) requireText(state.project?.vaultPath, "Vault path");
  if (!Array.isArray(state.claims) || !Array.isArray(state.events)) throw new Error("Project claims and events must be arrays.");
  if (!state.profile || typeof state.profile !== "object") throw new Error("Project profile must be an object.");
  if (!Array.isArray(state.documents)) throw new Error("Project documents must be an array.");
  if (!Array.isArray(state.evidence)) throw new Error("Project evidence must be an array.");
  const claimIds = new Set();
  for (const claim of state.claims) {
    requireText(claim.id, "Claim ID");
    if (claimIds.has(claim.id)) throw new Error(`Duplicate claim ID '${claim.id}'.`);
    claimIds.add(claim.id);
    requireText(claim.text, `Claim '${claim.id}' text`);
    requireText(claim.locationId, `Claim '${claim.id}' location`);
    if (!CLAIM_STATUSES.has(claim.status)) throw new Error(`Invalid claim status '${claim.status}'.`);
    if (!Array.isArray(claim.sourceIds)) throw new Error(`Claim '${claim.id}' sourceIds must be an array.`);
  }
  for (const evidence of state.evidence) {
    if (!evidence || typeof evidence !== "object") throw new Error("Evidence records must be objects.");
    requireText(evidence.sourceId, "Evidence source ID");
    if (evidence.feedbackThreadId !== undefined) requireText(evidence.feedbackThreadId, "Evidence feedback thread ID");
    if (evidence.taskId !== undefined) requireText(evidence.taskId, "Evidence task ID");
    if (evidence.selectedAt !== undefined) requireText(evidence.selectedAt, "Evidence selected time");
  }
  return state;
}

export function createProjectState({ project, thesisDir, vaultPath }, options = {}) {
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    schemaVersion: 3,
    revision: 1,
    project: {
      name: requireText(project, "Project name"),
      thesisDir: thesisDir ? requireText(thesisDir, "Thesis directory") : null,
      vaultPath: vaultPath ? requireText(vaultPath, "Vault path") : null
    },
    feedbackThreads: [],
    profile: { objectives: [], problems: [], deliverables: [], deadlines: [], supervisorExpectations: [], seedReferences: [] },
    profileProposal: null,
    documents: [],
    manuscript: { chapters: [], citations: [], bibliography: {}, unresolvedCitekeys: [] },
    sources: [],
    evidence: [],
    claims: [],
    generatedViews: {},
    events: [event("project.created", now)]
  });
}

export function migrateProjectState(state, options = {}) {
  if (state?.schemaVersion === 3) return validateProjectState({ ...state, evidence: state.evidence ?? [] });
  if (state?.schemaVersion !== 2) throw new Error(`Unsupported project state schema version '${state?.schemaVersion}'.`);
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    ...state,
    schemaVersion: 3,
    revision: 1,
    profile: { objectives: [], problems: [], deliverables: [], deadlines: [], supervisorExpectations: [], seedReferences: [] },
    profileProposal: null,
    documents: [],
    evidence: [],
    events: [...(state.events ?? []), event("state.migrated", now, { previousVersion: 2, nextVersion: 3 })]
  });
}

export async function loadProjectState(path) {
  return migrateProjectState(JSON.parse(await readFile(path, "utf8")));
}

export async function saveProjectState(path, state) {
  validateProjectState(state);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, path);
  return state;
}

function expectRevision(state, expectedRevision) {
  if (expectedRevision !== state.revision) {
    const error = new Error(`STATE_STALE: expected revision ${expectedRevision}, current revision is ${state.revision}.`);
    error.code = "STATE_STALE";
    throw error;
  }
}

function approvedProvenance(provenance) {
  return { ...provenance, kind: "extracted-approved" };
}

function approveValue(value) {
  if (Array.isArray(value)) return value.map((item) => ({ ...item, provenance: approvedProvenance(item.provenance ?? {}) }));
  return { ...value, provenance: approvedProvenance(value.provenance ?? {}) };
}

export function profileReadiness(state) {
  const profile = state.profile ?? {};
  const selected = (profile.problems ?? []).filter((problem) => problem.selected === true);
  const missing = [];
  if (!profile.title?.value?.trim() && !profile.topic?.value?.trim()) missing.push("titleOrTopic");
  if (!(profile.objectives ?? []).length) missing.push("objectives");
  if (selected.length !== 1) missing.push("selectedScope");
  if (!PROFILE_STAGES.has(profile.stage?.value)) missing.push("stage");
  return { ready: missing.length === 0, missing };
}

export function projectLifecycle(state, integrations = {}) {
  validateProjectState(state);
  const readiness = profileReadiness(state);
  const tasks = state.feedbackThreads.flatMap((thread) => thread.tasks ?? []);
  const openTasks = tasks.filter((task) => !new Set(["completed", "rejected"]).has(task.status) && task.approvalStatus !== "rejected").length;
  const zotero = integrations.zotero ?? { status: "unavailable" };
  const obsidianPath = integrations.obsidianPath ?? state.project.vaultPath;
  const capabilities = {
    context: { status: readiness.ready ? "sufficient" : "insufficient", missing: readiness.missing },
    manuscript: { status: state.project.thesisDir ? "linked" : "not_linked", path: state.project.thesisDir },
    zotero: { status: zotero.status ?? "unavailable", paperCount: Number.isInteger(zotero.paperCount) ? zotero.paperCount : null },
    obsidian: { status: obsidianPath ? "initialized" : "not_initialized", path: obsidianPath },
    stageAndScope: { status: state.profile.stage?.value && state.profile.problems?.some((item) => item.selected) ? "provided" : "absent" }
  };
  const configured = [capabilities.context.status === "sufficient", capabilities.manuscript.status === "linked", capabilities.zotero.status === "connected", capabilities.obsidian.status === "initialized", capabilities.stageAndScope.status === "provided"].filter(Boolean).length;
  const nextAction = !readiness.ready ? { id: "add-context", label: "Complete thesis context", view: "profile" }
    : capabilities.zotero.status !== "connected" ? { id: "connect-zotero", label: "Connect Zotero", view: "integrations" }
      : { id: "add-feedback", label: "Add supervisor feedback", view: "overview" };
  return {
    statistics: {
      papers: capabilities.zotero.paperCount,
      objectives: state.profile.objectives?.length ?? 0,
      openTasks,
      feedbackThreads: state.feedbackThreads.length
    },
    capabilities,
    setup: { configured, total: 5, complete: configured === 5 },
    nextAction
  };
}

export function recordFeedback(state, input, options = {}) {
  validateProjectState(state);
  expectRevision(state, input.expectedRevision);
  const now = options.now ?? new Date().toISOString();
  const feedback = requireText(input.feedback, "Supervisor feedback");
  const existing = input.mergeIntoFeedbackThreadId ? state.feedbackThreads.find(({ id }) => id === input.mergeIntoFeedbackThreadId) : null;
  if (input.mergeIntoFeedbackThreadId && !existing) throw new Error(`Unknown feedback thread '${input.mergeIntoFeedbackThreadId}'.`);
  if (existing) {
    const delta = feedbackDelta(existing.feedback, feedback);
    const updated = {
      ...existing,
      feedback: delta ? `${existing.feedback}\n\nSupervisor follow-up:\n${delta}` : existing.feedback,
      feedbackVersions: [...(existing.feedbackVersions ?? [{ feedback: existing.feedback, capturedAt: existing.createdAt }]), { feedback, capturedAt: now }],
      updatedAt: now
    };
    return validateProjectState({
      ...state,
      revision: state.revision + 1,
      feedbackThreads: state.feedbackThreads.map((thread) => thread.id === existing.id ? updated : thread),
      events: [...state.events, event("feedback.follow_up.merged", now, { feedbackThreadId: existing.id })]
    });
  }
  const id = `feedback-${randomUUID()}`;
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    feedbackThreads: [...state.feedbackThreads, {
      id,
      title: input.title?.trim() || "Supervisor feedback",
      feedback,
      status: "captured",
      tasks: [],
      placement: input.placement ?? suggestFeedbackPlacement(state, input.feedback),
      feedbackVersions: [{ feedback, capturedAt: now }],
      createdAt: now
    }],
    events: [...state.events, event("feedback.captured", now, { feedbackThreadId: id })]
  });
}

export function confirmFeedbackPlacement(state, input, options = {}) {
  validateProjectState(state);
  expectRevision(state, input.expectedRevision);
  const thread = state.feedbackThreads.find((candidate) => candidate.id === input.feedbackThreadId);
  if (!thread) throw new Error(`Unknown feedback thread '${input.feedbackThreadId}'.`);
  const now = options.now ?? new Date().toISOString();
  const status = input.status === "unassigned" ? "unassigned" : "confirmed";
  const stage = status === "unassigned" ? null : input.stage;
  if (stage && !PROFILE_STAGES.has(stage)) throw new Error(`Invalid thesis stage '${stage}'.`);
  const targetLocationIds = status === "unassigned" ? [] : [...new Set(input.targetLocationIds ?? [])];
  const knownLocations = new Set((state.manuscript?.chapters ?? []).map(({ id }) => id));
  for (const id of targetLocationIds) if (!knownLocations.has(id)) throw new Error(`Unknown manuscript location '${id}'.`);
  const placement = {
    ...(thread.placement ?? {}),
    status,
    stage,
    targetLocationIds,
    confirmedAt: now
  };
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    feedbackThreads: state.feedbackThreads.map((candidate) => candidate.id === thread.id ? { ...candidate, placement } : candidate),
    events: [...state.events, event("feedback.placement.confirmed", now, { feedbackThreadId: thread.id, status, stage, targetLocationIds })]
  });
}

export function updateProjectPaths(state, input, options = {}) {
  validateProjectState(state);
  expectRevision(state, input.expectedRevision);
  const now = options.now ?? new Date().toISOString();
  const project = {
    ...state.project,
    ...(input.thesisDir !== undefined ? { thesisDir: input.thesisDir ? requireText(input.thesisDir, "Thesis directory") : null } : {}),
    ...(input.vaultPath !== undefined ? { vaultPath: input.vaultPath ? requireText(input.vaultPath, "Vault path") : null } : {})
  };
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    project,
    events: [...state.events, event("project.paths.updated", now)]
  });
}

export function createProfileProposal(state, proposal, options = {}) {
  validateProjectState(state);
  expectRevision(state, options.expectedRevision);
  const now = options.now ?? new Date().toISOString();
  const id = requireText(proposal.id, "Profile proposal ID");
  const fields = proposal.fields && typeof proposal.fields === "object" ? proposal.fields : {};
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    profileProposal: {
      id,
      status: "pending",
      sourceDocumentIds: proposal.sourceDocumentIds ?? [],
      fields,
      proposedBy: { provider: options.provider ?? "unknown", model: options.model ?? "default" },
      createdAt: now
    },
    events: [...state.events, event("profile.proposed", now, { profileProposalId: id })]
  });
}

export function acceptProfileProposal(state, review, options = {}) {
  validateProjectState(state);
  expectRevision(state, review.expectedRevision);
  if (state.profileProposal?.status !== "pending") throw new Error("A pending profile proposal is required.");
  const now = options.now ?? new Date().toISOString();
  const profile = { ...state.profile };
  const reviewedFields = [];
  for (const [field, decision] of Object.entries(review.decisions ?? {})) {
    if (!Object.hasOwn(state.profileProposal.fields, field)) throw new Error(`Unknown proposed profile field '${field}'.`);
    if (!new Set(["accept", "edit", "reject"]).has(decision.action)) throw new Error(`Invalid profile decision '${decision.action}'.`);
    reviewedFields.push(field);
    if (decision.action === "reject") continue;
    profile[field] = decision.action === "edit"
      ? { ...decision.value, provenance: { kind: "user-stated" } }
      : approveValue(state.profileProposal.fields[field]);
  }
  profile.revision = (profile.revision ?? 0) + 1;
  profile.approvedAt = now;
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    profile,
    profileProposal: { ...state.profileProposal, status: "reviewed", reviewedAt: now },
    events: [...state.events, event("profile.approved", now, { profileProposalId: state.profileProposal.id, fields: reviewedFields })]
  });
}

export function answerProfileQuestions(state, answers, options = {}) {
  validateProjectState(state);
  expectRevision(state, answers.expectedRevision);
  const now = options.now ?? new Date().toISOString();
  if (!answers.selectedScope?.id || !answers.selectedScope?.name) throw new Error("A selected thesis scope is required.");
  if (!PROFILE_STAGES.has(answers.stage)) throw new Error("A valid thesis stage is required.");
  const stated = { kind: "user-stated" };
  const profile = {
    ...state.profile,
    revision: (state.profile.revision ?? 0) + 1,
    problems: [{ ...answers.selectedScope, selected: true, provenance: stated }],
    stage: { value: answers.stage, provenance: stated },
    ...(answers.deliverables ? { deliverables: answers.deliverables.map((text, index) => ({ id: `deliverable-${index + 1}`, text, provenance: stated })) } : {}),
    ...(answers.deadline ? { deadlines: [{ id: "deadline-next", value: answers.deadline, provenance: stated }] } : {}),
    approvedAt: now
  };
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    profile,
    events: [...state.events, event("profile.answers.recorded", now)]
  });
}

export function recordProjectDocument(state, document, options = {}) {
  validateProjectState(state);
  expectRevision(state, options.expectedRevision);
  const now = options.now ?? new Date().toISOString();
  const id = requireText(document.id, "Document ID");
  const entry = {
    id,
    kind: document.kind ?? "project-description",
    filename: requireText(document.filename, "Document filename"),
    mediaType: requireText(document.mediaType, "Document media type"),
    sha256: requireText(document.sha256, "Document digest"),
    byteCount: document.byteCount,
    characterCount: document.characterCount,
    pageCount: document.pageCount ?? null,
    localPath: requireText(document.localPath, "Document local path"),
    importedAt: now
  };
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    documents: [...state.documents.filter((item) => item.id !== id), entry],
    events: [...state.events, event("document.imported", now, { documentId: id })]
  });
}

export function recordFeedbackTasks(state, { feedback, title, taskGraph, context, feedbackThreadId = null }, options = {}) {
  validateProjectState(state);
  expectRevision(state, options.expectedRevision);
  const readiness = profileReadiness(state);
  if (!readiness.ready) {
    const error = new Error(`PROFILE_INCOMPLETE: complete ${readiness.missing.join(", ")} before adding feedback.`);
    error.code = "PROFILE_INCOMPLETE";
    error.missing = readiness.missing;
    throw error;
  }
  const now = options.now ?? new Date().toISOString();
  const existing = feedbackThreadId ? state.feedbackThreads.find(({ id }) => id === feedbackThreadId) : null;
  if (feedbackThreadId && !existing) throw new Error(`Unknown feedback thread '${feedbackThreadId}'.`);
  if (existing?.tasks?.length) throw new Error("This feedback already has proposed tasks.");
  const id = existing?.id ?? `feedback-${randomUUID()}`;
  const thread = {
    id,
    title: (existing?.title ?? title?.trim()) || "Supervisor feedback",
    feedback: existing?.feedback ?? requireText(feedback, "Supervisor feedback"),
    status: "in_progress",
    tasks: taskGraph.tasks,
    context,
    createdAt: existing?.createdAt ?? now
  };
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    feedbackThreads: existing ? state.feedbackThreads.map((item) => item.id === id ? thread : item) : [...state.feedbackThreads, thread],
    events: [...state.events, event("feedback.decomposed", now, { feedbackThreadId: id, taskIds: taskGraph.tasks.map(({ id: taskId }) => taskId) })]
  });
}

export function reviewCanonicalTask(state, review, options = {}) {
  validateProjectState(state);
  expectRevision(state, review.expectedRevision);
  if (!new Set(["approved", "rejected"]).has(review.decision)) throw new Error("Task decision must be approved or rejected.");
  const thread = state.feedbackThreads.find(({ id }) => id === review.feedbackThreadId);
  if (!thread) throw new Error(`Unknown feedback thread '${review.feedbackThreadId}'.`);
  const task = thread.tasks.find(({ id }) => id === review.taskId);
  if (!task) throw new Error(`Unknown task '${review.taskId}'.`);
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    ...state,
    revision: state.revision + 1,
    feedbackThreads: state.feedbackThreads.map((item) => item.id !== thread.id ? item : {
      ...item,
      tasks: item.tasks.map((candidate) => candidate.id !== task.id ? candidate : { ...candidate, approvalStatus: review.decision, reviewedAt: now })
    }),
    events: [...state.events, event("task.reviewed", now, { feedbackThreadId: thread.id, taskId: task.id, decision: review.decision })]
  });
}

export function recordClaimProposals(state, proposals, options = {}) {
  validateProjectState(state);
  if (options.approvedExternalProcessing !== true) throw new Error("Explicit approval is required before processing thesis excerpts externally.");
  if (!Array.isArray(proposals) || proposals.length === 0) throw new Error("At least one claim proposal is required.");
  const knownSources = new Set(options.knownSourceIds ?? []);
  const existingIds = new Set(state.claims.map((claim) => claim.id));
  const now = options.now ?? new Date().toISOString();
  const additions = proposals.map((proposal) => {
    const id = requireText(proposal.id, "Claim ID");
    if (existingIds.has(id)) throw new Error(`Duplicate claim ID '${id}'.`);
    existingIds.add(id);
    const sourceIds = proposal.sourceIds ?? [];
    if (!Array.isArray(sourceIds)) throw new Error(`Claim '${id}' sourceIds must be an array.`);
    for (const sourceId of sourceIds) {
      if (!knownSources.has(sourceId)) throw new Error(`Claim '${id}' references unknown source '${sourceId}'.`);
    }
    return {
      id,
      text: requireText(proposal.text, `Claim '${id}' text`),
      chapterId: requireText(proposal.chapterId, `Claim '${id}' chapter`),
      locationId: requireText(proposal.locationId, `Claim '${id}' location`),
      sourceIds: [...new Set(sourceIds)],
      feedbackThreadIds: proposal.feedbackThreadIds ?? [],
      taskIds: proposal.taskIds ?? [],
      status: "proposed",
      proposedBy: { provider: requireText(options.provider, "Proposal provider"), model: options.model ?? "default" },
      createdAt: now
    };
  });
  return validateProjectState({
    ...state,
    claims: [...state.claims, ...additions],
    events: [...state.events, event("claims.proposed", now, { claimIds: additions.map(({ id }) => id) })]
  });
}

export function approveClaimProposal(state, claimId, decision, options = {}) {
  validateProjectState(state);
  if (!new Set(["approved", "rejected"]).has(decision)) throw new Error("Claim decision must be approved or rejected.");
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Unknown claim ID '${claimId}'.`);
  if (claim.status !== "proposed") throw new Error(`Claim '${claimId}' has already been reviewed.`);
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    ...state,
    claims: state.claims.map((item) => item.id === claimId ? { ...item, status: decision, reviewedAt: now } : item),
    events: [...state.events, event("claim.reviewed", now, {
      claimId,
      actor: options.actor ?? "researcher",
      previousStatus: "proposed",
      nextStatus: decision
    })]
  });
}

export function updateProjectScan(state, { scan, mapping, sources }, options = {}) {
  validateProjectState(state);
  const citedKeys = new Set(scan.citations.flatMap(({ citekeys }) => citekeys));
  const unresolvedCitekeys = [...citedKeys].filter((citekey) => mapping.entries[citekey]?.status !== "mapped").sort();
  const now = options.now ?? new Date().toISOString();
  return validateProjectState({
    ...state,
    manuscript: {
      chapters: scan.chapters,
      citations: scan.citations,
      bibliography: scan.bibliography,
      citationMappings: mapping.entries,
      unresolvedCitekeys,
      scannedAt: scan.scannedAt
    },
    sources: sources ?? [],
    evidence: (sources ?? []).filter((source) => source.selected === true),
    events: [...state.events, event("manuscript.scanned", now, {
      chapterCount: scan.chapters.length,
      citationCount: scan.citations.length,
      unresolvedCitekeyCount: unresolvedCitekeys.length
    })]
  });
}
