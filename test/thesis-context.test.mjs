import test from "node:test";
import assert from "node:assert/strict";

const module = await import("../src/core/thesis-context.mjs").catch(() => ({}));

function state() {
  return {
    profile: {
      title: { value: "Cognitive ISAC" },
      topic: { value: "Intelligent decision-making for ISAC networks" },
      objectives: [{ id: "objective-1", text: "Develop interference-aware online optimization" }],
      problems: [{ id: "problem-p2", name: "Interference Mitigation", summary: "Mitigate mutual interference", selected: true }],
      stage: { value: "experiments" },
      deadlines: [{ id: "d1", value: "2026-09-01" }],
      supervisorExpectations: [{ id: "s1", text: "Private expectation" }]
    },
    profileProposal: { status: "pending", fields: { title: { value: "Unapproved title" } } },
    manuscript: {
      chapters: [
        { id: "chapter-3", level: "chapter", number: "3", title: "Methodology", sourcePath: "method.tex" },
        { id: "section-3-2", level: "section", number: "3.2", title: "Distributed ISAC comparison", sourcePath: "method.tex", context: "We compare distributed sensing coverage baselines." }
      ]
    }
  };
}

test("exports purpose-specific thesis context projections", () => {
  assert.equal(typeof module.buildThesisContext, "function");
});

test("resolves an explicit section and includes only approved decomposition context", () => {
  const context = module.buildThesisContext(state(), "decomposition", { feedback: "Strengthen Section 3.2." });
  assert.equal(context.targetLocations[0].id, "section-3-2");
  assert.equal(context.objectives[0].id, "objective-1");
  assert.doesNotMatch(JSON.stringify(context), /Unapproved title|Private expectation/);
});

test("builds a bounded retrieval query without deadlines or supervisor metadata", () => {
  const context = module.buildThesisContext(state(), "retrieval", { feedback: "Improve the interference model." });
  assert.match(context.query, /interference model/i);
  assert.match(context.query, /Interference Mitigation/);
  assert.doesNotMatch(JSON.stringify(context), /2026-09-01|Private expectation/);
});

test("rejects context use until the minimum canonical profile is ready", () => {
  const incomplete = state();
  incomplete.profile.problems = [];
  assert.throws(() => module.buildThesisContext(incomplete, "decomposition", { feedback: "Review 3.2" }), (error) => error.code === "PROFILE_INCOMPLETE" && error.missing.includes("selectedScope"));
});
