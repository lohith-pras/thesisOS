import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateStructuredJson } from "./core/model-provider.mjs";
import { invokeCodex } from "./core/codex.mjs";
import { CITATION_REVIEW_PROMPT, CITATION_VERDICT_SCHEMA, evaluateCitations } from "./core/citation-evaluation.mjs";

const projectDir = process.cwd();
const fixturePath = resolve(projectDir, process.argv[2] ?? "fixtures/citation-eval.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const cases = Array.isArray(fixture) ? fixture : fixture.cases;
const provider = process.env.CITATION_EVAL_PROVIDER ?? "codex";
const model = process.env.CITATION_EVAL_MODEL ?? (provider === "codex" ? process.env.CODEX_MODEL : provider === "openrouter" ? process.env.OPENROUTER_MODEL : provider === "ollama" ? process.env.OLLAMA_MODEL : process.env.OPENAI_MODEL) ?? null;
const trials = Math.max(1, Number.parseInt(process.env.CITATION_EVAL_TRIALS ?? "3", 10) || 3);

console.error(`Citation eval plan: ${cases.length} cases × ${trials} trials = ${cases.length * trials} sequential ${provider} runs${model ? ` using ${model}` : " using the provider default"}. Review usage limits before continuing.`);
const report = await evaluateCitations(cases, async (item) => {
  const prompt = [
    CITATION_REVIEW_PROMPT,
    "Return only JSON matching the supplied schema.",
    "",
    JSON.stringify({ claim: item.claim, citation: item.citation, sourceEvidence: item.sourceEvidence })
  ].join("\n");
  if (provider === "codex") {
    return invokeCodex({ prompt, schema: CITATION_VERDICT_SCHEMA, model: model ?? undefined, cwd: projectDir });
  }
  const generated = await generateStructuredJson({
    provider,
    model,
    schema: CITATION_VERDICT_SCHEMA,
    schemaName: "citation_verdict",
    messages: [
      { role: "system", content: CITATION_REVIEW_PROMPT },
      { role: "user", content: JSON.stringify({ claim: item.claim, citation: item.citation, sourceEvidence: item.sourceEvidence }) }
    ]
  });
  return generated.value;
}, { trials });

const thresholds = fixture.thresholds ?? { minimumRejectionRecall: 0.8, maximumFalsePositiveRate: 0.1 };
const output = { ...report, fixture: fixturePath, provider, model: model ?? (provider === "codex" ? "codex-default" : null), thresholds };
console.log(JSON.stringify(output, null, 2));
if (report.rejectionRecall < thresholds.minimumRejectionRecall || report.falsePositiveRate > thresholds.maximumFalsePositiveRate) process.exitCode = 1;
