import { profileReadiness } from "./project-state.mjs";

const PURPOSES = new Set(["decomposition", "retrieval", "drafting"]);

function profileError(missing) {
  const error = new Error(`PROFILE_INCOMPLETE: complete ${missing.join(", ")} before adding feedback.`);
  error.code = "PROFILE_INCOMPLETE";
  error.missing = missing;
  return error;
}

function selectedScope(profile) {
  return (profile.problems ?? []).find((problem) => problem.selected === true);
}

function targetLocations(chapters, feedback) {
  const explicit = feedback.match(/\b(?:chapter|section)\s+([0-9]+(?:\.[0-9]+)*)\b/i)?.[1];
  if (explicit) {
    const matches = chapters.filter((location) => location.number === explicit);
    if (matches.length) return matches;
  }
  const terms = new Set(feedback.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  return chapters
    .map((location) => ({ location, score: (location.title.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((term) => terms.has(term)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ location }) => location);
}

function boundedLocations(locations) {
  return locations.map(({ id, level, number, title, sourcePath, context }) => ({
    id, level, number, title, sourcePath,
    ...(context ? { context: context.slice(0, 2_000) } : {})
  }));
}

export function buildThesisContext(state, purpose, options = {}) {
  if (!PURPOSES.has(purpose)) throw new Error(`Unknown thesis context purpose '${purpose}'.`);
  const readiness = profileReadiness(state);
  if (!readiness.ready) throw profileError(readiness.missing);
  const profile = state.profile;
  const scope = selectedScope(profile);
  const feedback = String(options.feedback ?? "").trim();
  const locations = boundedLocations(targetLocations(state.manuscript?.chapters ?? [], feedback));
  const base = {
    title: profile.title?.value ?? null,
    topic: profile.topic?.value ?? null,
    selectedScope: { id: scope.id, name: scope.name, summary: scope.summary ?? "" },
    objectives: (profile.objectives ?? []).map(({ id, text }) => ({ id, text })),
    stage: profile.stage.value
  };
  if (purpose === "decomposition") return { ...base, targetLocations: locations, feedback };
  if (purpose === "retrieval") {
    const pieces = [feedback, scope.name, scope.summary, ...base.objectives.map(({ text }) => text), ...locations.map(({ title }) => title)].filter(Boolean);
    return { selectedScope: base.selectedScope, objectiveIds: base.objectives.map(({ id }) => id), targetLocationIds: locations.map(({ id }) => id), query: [...new Set(pieces)].join(" · ").slice(0, 4_000) };
  }
  return { ...base, targetLocations: locations, feedback, selectedEvidenceIds: [...new Set(options.selectedEvidenceIds ?? [])] };
}
