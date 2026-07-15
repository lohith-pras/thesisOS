const VERDICTS = new Set(["ACCEPT", "REJECT", "FLAG"]);

export const CITATION_VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason"],
  properties: {
    verdict: { type: "string", enum: ["ACCEPT", "REJECT", "FLAG"] },
    reason: { type: "string" }
  }
};

export const CITATION_REVIEW_PROMPT = `You check whether a citation supports a research claim using only the supplied citation record and source evidence.
Return ACCEPT only when the record is internally consistent and the supplied evidence directly supports the claim.
Return REJECT for fabricated, corrupted, or unsupported/mismatched citations. Return FLAG only when the supplied evidence is insufficient to decide safely.
Never use outside knowledge or repair a citation from memory.`;

function requireCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error("Citation evaluation requires at least one case.");
  for (const item of cases) {
    if (!item?.id || !item.bucket || !VERDICTS.has(item.expectedVerdict)) throw new Error("Each citation case requires id, bucket, and expectedVerdict.");
  }
}

function isRejected(verdict) {
  return verdict === "REJECT" || verdict === "FLAG";
}

function rate(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

export function scoreCitationEvaluations(cases, trials) {
  requireCases(cases);
  if (!Array.isArray(trials)) throw new Error("Citation evaluation trials must be an array.");
  const results = cases.map((item) => {
    const caseTrials = trials.filter((trial) => trial.id === item.id);
    if (!caseTrials.length) throw new Error(`Citation case '${item.id}' has no trials.`);
    const verdicts = caseTrials.map((trial) => trial.verdict);
    if (verdicts.some((verdict) => !VERDICTS.has(verdict))) throw new Error(`Citation case '${item.id}' returned an invalid verdict.`);
    const expectedReject = item.expectedVerdict !== "ACCEPT";
    const rejected = verdicts.filter(isRejected).length;
    return {
      id: item.id,
      bucket: item.bucket,
      expectedVerdict: item.expectedVerdict,
      trialCount: verdicts.length,
      verdicts,
      rejectedCount: rejected,
      rejectionRate: rejected / verdicts.length,
      acceptedCount: verdicts.filter((verdict) => verdict === "ACCEPT").length,
      expectedReject
    };
  });
  const bad = results.filter((item) => item.expectedReject);
  const valid = results.filter((item) => !item.expectedReject);
  const byBucket = Object.fromEntries([...new Set(results.map((item) => item.bucket))].map((bucket) => {
    const items = results.filter((item) => item.bucket === bucket);
    return [bucket, {
      caseCount: items.length,
      trialCount: items.reduce((sum, item) => sum + item.trialCount, 0),
      rejectionRate: rate(items.reduce((sum, item) => sum + item.rejectedCount, 0), items.reduce((sum, item) => sum + item.trialCount, 0))
    }];
  }));
  const badTrials = bad.reduce((sum, item) => sum + item.trialCount, 0);
  const validTrials = valid.reduce((sum, item) => sum + item.trialCount, 0);
  const badRejections = bad.reduce((sum, item) => sum + item.rejectedCount, 0);
  const validRejections = valid.reduce((sum, item) => sum + item.rejectedCount, 0);
  return {
    schemaVersion: 1,
    caseCount: results.length,
    trialCount: results.reduce((sum, item) => sum + item.trialCount, 0),
    rejectionRecall: rate(badRejections, badTrials),
    falsePositiveRate: rate(validRejections, validTrials),
    byBucket,
    results
  };
}

export async function evaluateCitations(cases, classify, options = {}) {
  requireCases(cases);
  if (typeof classify !== "function") throw new Error("Citation evaluation requires a classifier.");
  const trials = Math.max(1, Number.parseInt(options.trials ?? 3, 10) || 3);
  const results = [];
  for (const item of cases) {
    for (let trial = 1; trial <= trials; trial += 1) {
      const outcome = await classify(item, trial);
      results.push({ id: item.id, trial, verdict: outcome?.verdict, reason: outcome?.reason ?? "" });
    }
  }
  return { ...scoreCitationEvaluations(cases, results), requestedTrialsPerCase: trials };
}
