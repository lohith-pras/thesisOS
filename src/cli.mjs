import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { decomposeFeedback } from "./core/decompose.mjs";
import { createThesisState } from "./core/state.mjs";
import { validateArtifacts } from "./core/schema.mjs";
import { decomposeFeedbackWithOpenAI } from "./core/openai.mjs";
import { decomposeFeedbackWithCodex } from "./core/codex.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const feedbackPath = resolve(root, "fixtures/supervisor-feedback.txt");

export function parseCliArgs(args) {
  const options = {
    project: "RCS simulation thesis",
    outputDir: resolve(root, "demo-output"),
    ai: false,
    codex: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--ai") {
      options.ai = true;
      continue;
    }
    if (arg === "--codex") {
      options.codex = true;
      continue;
    }
    if (!["--feedback", "--feedback-file", "--project", "--output-dir", "--model"].includes(arg)) {
      throw new Error(`Unknown argument '${arg}'. Use --help for usage.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    index += 1;
    if (arg === "--feedback") options.feedback = value;
    if (arg === "--feedback-file") options.feedbackFile = resolve(process.cwd(), value);
    if (arg === "--project") options.project = value;
    if (arg === "--output-dir") options.outputDir = resolve(process.cwd(), value);
    if (arg === "--model") options.model = value;
  }

  if (options.feedback !== undefined && options.feedbackFile !== undefined) {
    throw new Error("Use either --feedback or --feedback-file, not both.");
  }
  if (options.ai && options.codex) throw new Error("Use either --ai or --codex, not both.");
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseCliArgs(args);
  if (options.help) {
    console.log(`Usage: npm run demo -- [options]\n\nOptions:\n  --feedback <text>       Use feedback provided on the command line\n  --feedback-file <path>  Read feedback from a text file\n  --project <name>        Set the thesis project name\n  --output-dir <path>     Write artifacts to this directory\n  --ai                    Use the OpenAI API instead of the offline fallback\n  --codex                 Use the authenticated local Codex CLI\n  --model <id>            Override the selected AI or Codex model\n  -h, --help              Show this help`);
    return;
  }

  const feedback = options.feedback ?? await readFile(options.feedbackFile ?? feedbackPath, "utf8");
  let taskGraph;
  if (options.ai) taskGraph = await decomposeFeedbackWithOpenAI(feedback, { model: options.model });
  else if (options.codex) taskGraph = await decomposeFeedbackWithCodex(feedback, { model: options.model, cwd: root });
  else taskGraph = decomposeFeedback(feedback);
  const state = createThesisState({
    project: options.project,
    feedback: feedback.trim(),
    taskGraph
  });
  validateArtifacts(taskGraph, state);

  await mkdir(options.outputDir, { recursive: true });
  await writeFile(resolve(options.outputDir, "task-graph.json"), `${JSON.stringify(taskGraph, null, 2)}\n`);
  await writeFile(resolve(options.outputDir, "thesis-state.json"), `${JSON.stringify(state, null, 2)}\n`);

  console.log("ThesisOS demo complete");
  console.log(`Feedback decomposed into ${taskGraph.tasks.length} linked tasks.`);
  console.log(`Next action: ${taskGraph.nextAction}`);
  console.log(`Outputs: ${options.outputDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
