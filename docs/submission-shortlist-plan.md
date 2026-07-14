# ThesisOS Shortlist Plan

Status: active submission-hardening plan.

## Decision on GPT-5.6

The submission requirement is best read as: build the project **using Codex with GPT-5.6**, then show and document that build process. It does not clearly require ThesisOS to call GPT-5.6 at runtime.

The primary build session is verified as GPT-5.6 and its feedback was submitted. The build and feedback ID is `019f5cc1-08be-7071-a5ea-220a8de0f313`; the receipt is preserved at [`docs/assets/codex-feedback-receipt.png`](assets/codex-feedback-receipt.png). The submission should show concrete contributions from that session: the Zotero-to-evidence workflow, semantic retrieval and evaluation, grounded drafting, judge mode, and automated verification.

Keep these two claims separate:

- Build-time: ThesisOS was designed and implemented with Codex using GPT-5.6.
- Runtime: ThesisOS uses a swappable provider seam; Codex CLI is the default path and other providers are optional.

Do not present an optional GPT-5.6 API adapter as the main evidence for eligibility.

## Stress-test verdict

The concern about an automated rejection pass is justified, but keyword stuffing is not the answer. The official rules allow automated AI-driven analysis and define a Stage One pass/fail viability screen before the scored judging round. Stage One checks theme fit and reasonable use of the required technology. Judges are also not required to run the project and may judge from the submitted text, images, and video alone.

Therefore the submission must be understandable, compliant, and internally consistent without requiring a judge to explore the repository.

Official references:

- [Hackathon overview and requirements](https://openai.devpost.com/)
- [Official rules and judging process](https://openai.devpost.com/rules)

## Shortlist positioning

### One memorable idea

**ThesisOS is AI that is not allowed to write until the researcher approves both the task and the evidence.**

That is stronger than positioning ThesisOS as a generic AI research assistant, multi-agent system, paper summarizer, or thesis-writing tool.

Suggested title and tagline:

- Title: **ThesisOS**
- Tagline: **Evidence before AI writing.**
- Descriptive alternative: **Turn supervisor feedback into source-locked thesis revisions.**

Suggested opening:

> ThesisOS is research change control for thesis students. It turns supervisor feedback into a reviewable task, retrieves candidate papers from the student's own Zotero library, and refuses to draft until the researcher approves both the task and the evidence.

### Why this can differentiate

Most research assistants optimize for producing more text. ThesisOS should be framed as optimizing for evidence custody, explicit approval, and traceable revision. The refusal state is not an error; it is the product demonstration.

The strongest competitive contrast is:

- Generic tools: prompt -> generated answer.
- ThesisOS: feedback -> approved task -> reviewed evidence -> grounded draft -> vault artifact.

## Stage One: survive the viability screen

The first two sentences of the Devpost description should explicitly establish:

1. Who it is for: thesis students responding to supervisor feedback.
2. What it does: creates an approval-gated, evidence-backed revision trail.
3. What is working: Zotero retrieval, evidence selection, grounded drafting, and vault output.
4. How the required technology was used: built with Codex using GPT-5.6.

Blocking checklist:

- [x] Confirm the qualifying Codex session used GPT-5.6.
- [x] Include the `/feedback` session ID.
- [ ] Public repository opens without permission requests.
- [x] README contains exact setup and demo instructions.
- [ ] Public YouTube demo is under three minutes and includes audio.
- [ ] Video explicitly covers both what was built and how Codex with GPT-5.6 was used.
- [ ] Product behavior, README claims, screenshots, and video agree.
- [ ] Clearly distinguish pre-existing work from work created during the submission period if applicable.
- [ ] Remove placeholders, dead links, and unsupported claims.

## Stage Two: score against the four criteria

The four published criteria are equally weighted. Build the submission around direct evidence for each.

### 1. Technological implementation

Show non-trivial working code, not a list of models or providers:

- Real Zotero retrieval adapter.
- Stable source identifiers and structured evidence records.
- Approval-state transitions and refusal behavior.
- Grounded note generation tied to selected sources.
- Current automated test result: 137 passing tests; re-run and update before submission.

### 2. Design

Demonstrate one coherent workflow with minimal setup:

- Start at supervisor feedback.
- Reject drafting before approval.
- Approve the task and select evidence.
- Produce and inspect a grounded note.
- Preview or write the artifact to the vault.

Do not make judges navigate unfinished Paper Map, multi-agent, provider, or maintenance features.

### 3. Potential impact

Use a specific scenario instead of a broad promise:

> A supervisor asks a student to strengthen section 3.2. ThesisOS turns that comment into a task, finds relevant sources already in the student's library, records which sources the student approved, and creates a revision artifact that can be audited later.

Do not invent market statistics or time savings. If impact metrics are added, collect and document them.

### 4. Quality of idea

Name the category clearly: **research change control**. The novelty claim is the approval and provenance boundary around AI-assisted academic writing, not autonomous writing itself.

## Three-minute video plan

The video is the primary judging surface because judges may not run the project.

### First 10 seconds

Show the result and conflict immediately:

> A supervisor says, "Strengthen section 3.2." Most AI tools draft immediately. ThesisOS refuses until I approve the task and the evidence.

### Suggested sequence

1. **0:00-0:15 — Hook:** show the refusal state and the final grounded artifact.
2. **0:15-1:35 — Workflow:** feedback, task approval, Zotero candidates, evidence approval, grounded note.
3. **1:35-2:05 — Trust proof:** show source IDs, approval history, and vault output.
4. **2:05-2:35 — Build proof:** show the qualifying Codex/GPT-5.6 session ID plus one architecture decision, implementation diff, and test result.
5. **2:35-2:55 — Why it matters:** research change control, not another text generator.
6. **2:55-3:00 — Close:** "Evidence before AI writing."

Thumbnail text should be no more than five words. Preferred: **Evidence Before AI Writing**.

## Submission evidence pack

Prepare these assets so each claim is visible without running the app:

- Screenshot: unapproved task blocks progress.
- Screenshot: candidate evidence with stable source IDs.
- Screenshot: approved evidence and grounded note.
- Screenshot: final vault artifact and provenance metadata.
- Small architecture diagram of the canonical workflow.
- Screenshot or clip proving Codex with GPT-5.6 build use and the session ID.
- Fresh test output captured immediately before recording.

## Product work before submission

Only fix issues that protect the core demo:

1. [x] Persist the canonical workflow across reloads.
2. [x] Restrict vault operations to the configured vault root.
3. [ ] Add and record one real browser-level happy-path test.
4. [x] Create deterministic demo fixtures or a safe fallback for external-service failure.

Paper Map should appear only if it is polished, reliable, and reinforces evidence provenance. Otherwise keep it out of the submission narrative. Do not implement multi-agent research, Overleaf automation, scheduled vault pruning, or additional provider integrations before the core submission is finished.

## Claims to avoid

- "Multi-agent research operating system" unless separate agents genuinely run and are demonstrated.
- "Autonomous literature screening" without a validated screening workflow.
- Broad retrieval-quality claims based on the current small evaluation set.
- Runtime GPT-5.6 use unless the app actually calls it.
- Provider flexibility as a headline; it is architecture hygiene, not the user value.
- Any feature that cannot be shown working in the recorded demo.

## Order of work

1. Verify eligibility evidence and the exact GPT-5.6 session.
2. Fix the three core reliability and safety gaps.
3. Freeze the demo workflow and claims.
4. Rewrite README and Devpost copy around research change control.
5. Capture the evidence pack.
6. Record and trim the video to under three minutes.
7. Have a fresh reviewer perform a Stage One pass/fail check, then score all four Stage Two criteria.
8. Submit at least one hour before the deadline and verify every public link in an incognito window.

## Final go/no-go test

The submission is shortlist-ready only if a reviewer can answer these questions in 30 seconds without opening the repository:

- What painful, specific problem does ThesisOS solve?
- What is the one behavior competitors do not foreground?
- Is there a working end-to-end demonstration?
- Where is the proof that Codex with GPT-5.6 built it?
- Can every visible claim be verified in the video or repository?

If any answer is unclear, improve the submission surface before adding another feature.
