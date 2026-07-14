import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TASK_GRAPH_SCHEMA, TASK_DECOMPOSITION_PROMPT } from "./openai.mjs";
import { validateTaskGraph } from "./schema.mjs";
import { DRAFT_SCHEMA, validateGroundedDraft } from "./note-drafting.mjs";
import { ensureLiteratureTask } from "./decompose.mjs";

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    // npm exposes CLIs as .cmd shims on Windows, which require a shell to launch.
    const child = spawn(command, args, { cwd, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
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

export async function invokeCodex({ prompt, schema, model, cwd, command = "codex" }) {
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
  const context = options.context ? `\n\nApproved thesis context:\n${JSON.stringify(options.context)}` : "";
  const prompt = `${TASK_DECOMPOSITION_PROMPT}${context}\n\nSupervisor feedback:\n${text}`;
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
    tasks: ensureLiteratureTask(generated.tasks.map((task) => ({ ...task, approvalStatus: "pending" }))),
    nextAction: generated.nextAction
  });
}

export async function draftEvidenceNoteWithCodex({ feedback, evidenceRefs, approvedExternalProcessing }, options = {}) {
  if (approvedExternalProcessing !== true) throw new Error("Explicit approval is required before sending selected evidence to Codex CLI.");
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.length) throw new Error("Selected evidence is required for drafting.");
  const model = options.model ?? process.env.CODEX_MODEL;
  const context = evidenceRefs.map((reference) => ({ sourceId: reference.sourceId, title: reference.title, abstract: reference.abstract, tags: reference.tags, doi: reference.doi }));
  const prompt = [
    "Draft a concise literature synthesis using only the supplied selected evidence.",
    "Never cite or infer a source ID that is not supplied.",
    "Return only JSON matching the provided schema.",
    "Distinguish source summaries from researcher interpretation.",
    "",
    JSON.stringify({ feedback, selectedEvidence: context })
  ].join("\n");
  const invoke = options.invokeCodex ?? invokeCodex;
  const generated = await invoke({
    prompt,
    schema: DRAFT_SCHEMA,
    model,
    cwd: options.cwd ?? process.cwd(),
    command: options.command
  });
  return { schemaVersion: 1, provider: "codex", model: model ?? "codex-default", ...validateGroundedDraft(generated, evidenceRefs) };
}
