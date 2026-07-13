import { readFile, rename, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { applyReviewDecisions } from "./core/review.mjs";

export function parseReviewArgs(args) {
  const options = { inputDir: resolve(process.cwd(), "demo-output"), decisions: {}, approveAll: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--approve-all") {
      options.approveAll = true;
      continue;
    }
    if (!["--input-dir", "--approve", "--reject"].includes(arg)) {
      throw new Error(`Unknown argument '${arg}'. Use --help for usage.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    index += 1;
    if (arg === "--input-dir") options.inputDir = resolve(process.cwd(), value);
    if (arg === "--approve" || arg === "--reject") {
      const decision = arg === "--approve" ? "approved" : "rejected";
      if (options.decisions[value] && options.decisions[value] !== decision) {
        throw new Error(`Task '${value}' cannot be both approved and rejected.`);
      }
      options.decisions[value] = decision;
    }
  }
  if (options.approveAll && Object.keys(options.decisions).length) {
    throw new Error("Use --approve-all without individual decisions.");
  }
  return options;
}

async function collectInteractiveDecisions(tasks) {
  const terminal = createInterface({ input, output });
  const decisions = {};
  try {
    for (const task of tasks.filter((item) => item.approvalStatus === "pending")) {
      const answer = await terminal.question(`${task.id}: ${task.title}\nApprove, reject, or skip? [a/r/s] `);
      if (answer.trim().toLowerCase() === "a") decisions[task.id] = "approved";
      if (answer.trim().toLowerCase() === "r") decisions[task.id] = "rejected";
    }
  } finally {
    terminal.close();
  }
  return decisions;
}

async function writeJsonSafely(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseReviewArgs(args);
  if (options.help) {
    console.log(`Usage: npm run review -- [options]\n\nOptions:\n  --input-dir <path>  Directory containing task-graph.json and thesis-state.json\n  --approve <task-id> Approve a task; may be repeated\n  --reject <task-id>  Reject a task; may be repeated\n  --approve-all       Approve every task\n  -h, --help          Show this help\n\nWith no decision flags, review runs interactively.`);
    return;
  }

  const taskGraphPath = resolve(options.inputDir, "task-graph.json");
  const statePath = resolve(options.inputDir, "thesis-state.json");
  const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8"));
  const state = JSON.parse(await readFile(statePath, "utf8"));
  let decisions = options.decisions;
  if (options.approveAll) {
    decisions = Object.fromEntries(taskGraph.tasks.map((task) => [task.id, "approved"]));
  } else if (!Object.keys(decisions).length) {
    decisions = await collectInteractiveDecisions(taskGraph.tasks);
  }

  const reviewed = applyReviewDecisions(taskGraph, state, decisions);
  await writeJsonSafely(taskGraphPath, reviewed.taskGraph);
  await writeJsonSafely(statePath, reviewed.state);
  const summary = reviewed.taskGraph.approvalSummary;
  console.log(`Review complete: ${summary.approved} approved, ${summary.rejected} rejected, ${summary.pending} pending.`);
  console.log(`Next action: ${reviewed.taskGraph.nextAction}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
