import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TASK_GRAPH_SCHEMA, TASK_DECOMPOSITION_PROMPT } from "./openai.mjs";
import { validateTaskGraph } from "./schema.mjs";

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`Could not start Codex CLI: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Codex CLI failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function invokeCodex({ prompt, schema, model, cwd, command = "codex" }) {
  const temporaryDir = await mkdtemp(join(tmpdir(), "thesisos-codex-"));
  const schemaPath = join(temporaryDir, "task-graph.schema.json");
  const outputPath = join(temporaryDir, "task-graph.json");
  try {
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
    const args = [
      "exec",
      "--ephemeral",
      "--sandbox", "read-only",
      "--ignore-user-config",
      "--ignore-rules",
      "--color", "never",
      "--output-schema", schemaPath,
      "--output-last-message", outputPath,
      "--cd", cwd
    ];
    if (model) args.push("--model", model);
    args.push(prompt);
    await runCommand(command, args, cwd);
    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

export async function decomposeFeedbackWithCodex(feedback, options = {}) {
  const text = feedback.trim();
  if (!text) throw new Error("Supervisor feedback cannot be empty.");
  const prompt = `${TASK_DECOMPOSITION_PROMPT}\n\nSupervisor feedback:\n${text}`;
  const invoke = options.invokeCodex ?? invokeCodex;
  const generated = await invoke({
    prompt,
    schema: TASK_GRAPH_SCHEMA,
    model: options.model,
    cwd: options.cwd ?? process.cwd(),
    command: options.command
  });

  return validateTaskGraph({
    schemaVersion: 1,
    feedback: text,
    createdAt: new Date().toISOString(),
    tasks: generated.tasks.map((task) => ({ ...task, approvalStatus: "pending" })),
    nextAction: generated.nextAction
  });
}
