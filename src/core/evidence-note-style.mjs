export const EVIDENCE_NOTE_STYLE_POLICY = Object.freeze({
  id: "evidence-note-writing-v1",
  label: "Evidence writing check",
  checks: [
    "Use source-specific, neutral prose.",
    "Avoid canned conclusions and stock transitions.",
    "Avoid generic claims about importance or the wider field."
  ]
});

export const EVIDENCE_NOTE_WRITING_INSTRUCTIONS = [
  "Writing quality requirements:",
  "- Use precise, neutral, source-specific prose. Each statement must report a supplied finding, scope, method, limitation, or uncertainty.",
  "- Do not fill evidence gaps with plausible generalisations. Say that researcher review is needed when the supplied context is insufficient.",
  "- Avoid generic significance claims and canned language, including pivotal, crucial, testament, evolving landscape, broader debate, in conclusion, in summary, it is important to note, moreover, and furthermore.",
  "- Do not add a standalone conclusion, a recap of the prompt, decorative false contrasts, or repetitive three-part lists."
].join("\n");

const STYLE_TELLS = [
  { id: "canned-closure", pattern: /\b(?:in conclusion|in summary|to summarize)\b/i },
  { id: "stock-transition", pattern: /\b(?:it is important to note|it should be noted|moreover|furthermore)\b/i },
  { id: "generic-significance", pattern: /\b(?:pivotal|crucial|transformative|testament|indelible mark|evolving landscape|broader (?:debate|conversation))\b/i },
  { id: "false-contrast", pattern: /\bnot (?:only|just)\b[^.!?]{1,100}\bbut (?:also|rather)\b/i }
];

function draftText(draft) {
  return [
    draft.overview,
    ...draft.sourceNotes.flatMap((note) => [note.summary, note.relevance])
  ].join("\n");
}

export function reviewEvidenceNoteStyle(draft) {
  const text = draftText(draft);
  const violations = STYLE_TELLS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ id }) => id);
  return {
    policy: EVIDENCE_NOTE_STYLE_POLICY.id,
    passed: violations.length === 0,
    checks: EVIDENCE_NOTE_STYLE_POLICY.checks,
    violations
  };
}

export function assertEvidenceNoteStyle(draft) {
  const review = reviewEvidenceNoteStyle(draft);
  if (!review.passed) throw new Error(`Draft failed the evidence writing check: ${review.violations.join(", ")}.`);
  return review;
}
