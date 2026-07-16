import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { listZoteroPapers, searchZotero } from "./core/zotero.mjs";
import { loadProjectState, saveProjectState, updateZoteroLibrary } from "./core/project-state.mjs";

export function parseZoteroArgs(args) {
  const options = {
    inputDir: resolve(process.cwd(), "demo-output"),
    output: null,
    mode: "local",
    limit: 10,
    list: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--web") {
      options.mode = "web";
      continue;
    }
    if (arg === "--list") {
      options.list = true;
      continue;
    }
    if (arg === "--all-libraries") {
      options.allLibraries = true;
      continue;
    }
    if (!["--input-dir", "--output", "--query", "--limit", "--user-id", "--library-type", "--library-id", "--library", "--expected-revision"].includes(arg)) {
      throw new Error(`Unknown argument '${arg}'. Use --help for usage.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    index += 1;
    if (arg === "--input-dir") options.inputDir = resolve(process.cwd(), value);
    if (arg === "--output") options.output = value;
    if (arg === "--query") options.query = value;
    if (arg === "--limit") options.limit = Number(value);
    if (arg === "--user-id") options.userId = value;
    if (arg === "--library-type") options.libraryType = value;
    if (arg === "--library-id") options.libraryId = value;
    if (arg === "--library") options.library = value;
    if (arg === "--expected-revision") {
      const expectedRevision = Number(value);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("--expected-revision must be a positive integer.");
      options.expectedRevision = expectedRevision;
    }
  }
  if (options.allLibraries && (options.library || options.libraryType || options.libraryId)) {
    throw new Error("--all-libraries cannot be combined with --library, --library-type, or --library-id.");
  }
  return options;
}

async function writeJsonSafely(path, value) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporaryPath, path);
}

async function loadCanonicalProjectState(projectDir) {
  try { return await loadProjectState(resolve(projectDir, ".thesisos", "thesis-state.json")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function loadZoteroSelection(projectDir = process.cwd()) {
  const canonical = await loadCanonicalProjectState(projectDir);
  if (canonical) return canonical.project.zoteroLibrary ?? null;
  try {
    const config = JSON.parse(await readFile(resolve(projectDir, ".thesisos.json"), "utf8"));
    return config.zotero?.library ?? null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) throw new Error(`Invalid Proofline project configuration: ${error.message}`);
    throw error;
  }
}

export async function saveZoteroSelection(projectDir = process.cwd(), library, options = {}) {
  const canonical = await loadCanonicalProjectState(projectDir);
  if (canonical) {
    const nextState = updateZoteroLibrary(canonical, library, { expectedRevision: options.expectedRevision });
    await saveProjectState(resolve(projectDir, ".thesisos", "thesis-state.json"), nextState, { expectedRevision: options.expectedRevision });
    return nextState.project.zoteroLibrary;
  }
  const path = resolve(projectDir, ".thesisos.json");
  let config = {};
  try {
    config = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  config.zotero = { ...(config.zotero ?? {}), library: {
    type: library.type,
    id: String(library.id),
    ...(library.name ? { name: library.name } : {})
  } };
  await writeJsonSafely(path, config);
  return config.zotero.library;
}

export function formatLibrarySummary(artifact) {
  if (artifact.library) return `Library: ${artifact.library.name ?? artifact.library.id} (${artifact.library.type})`;
  return `Libraries: ${artifact.libraries.map((library) => `${library.name ?? library.id} (${library.type})`).join(", ")}`;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseZoteroArgs(args);
  if (options.help) {
    console.log(`Usage: npm run zotero -- [options]\n\nOptions:\n  --list               List top-level bibliographic papers; no approval needed\n  --input-dir <path>   Directory containing an approved task-graph.json\n  --query <text>       Override the query inferred from supervisor feedback\n  --limit <1-100>      Maximum candidates to return; default 10\n  --output <name>      Output artifact filename\n  --library <name|id> Select one discovered library and remember it for this project\n  --expected-revision <n> Required when remembering a library in a canonical workspace\n  --all-libraries      Intentionally extract from every non-empty library\n  --library-type <t>  user or group (script-compatible explicit selection)\n  --library-id <id>    User or group library ID\n  --web                Use Zotero Web API instead of the local desktop API\n  --user-id <id>       Override ZOTERO_USER_ID for web mode\n  -h, --help           Show this help`);
    return;
  }

  const projectDir = process.cwd();
  if (!options.library && !options.allLibraries && !options.libraryType && !options.libraryId && !process.env.ZOTERO_LIBRARY_TYPE && !process.env.ZOTERO_LIBRARY_ID) {
    options.savedLibrary = await loadZoteroSelection(projectDir);
  }

  let artifact;
  if (options.list) {
    artifact = await listZoteroPapers(options);
  } else {
    const graphPath = resolve(options.inputDir, "task-graph.json");
    const taskGraph = JSON.parse(await readFile(graphPath, "utf8"));
    artifact = await searchZotero(taskGraph, options);
  }
  if (artifact.library && !options.allLibraries) await saveZoteroSelection(projectDir, artifact.library, { expectedRevision: options.expectedRevision });
  const outputName = options.output ?? (options.list ? "zotero-library.json" : "zotero-candidates.json");
  const outputPath = resolve(options.inputDir, outputName);
  await writeJsonSafely(outputPath, artifact);
  if (options.list) console.log(`Zotero library complete: ${artifact.paperCount} top-level paper(s).`);
  else console.log(`Zotero search complete: ${artifact.candidates.length} candidate(s) for “${artifact.query}”.`);
  console.log(formatLibrarySummary(artifact));
  console.log(`Access mode: ${artifact.provider} (${artifact.access})`);
  console.log(`Output: ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    if (error.libraries?.length) {
      console.error("Available Zotero libraries:");
      for (const library of error.libraries) {
        console.error(`  ${library.id}\t${library.type}\t${library.paperCount} paper(s)\t${library.name}`);
      }
    }
    process.exitCode = 1;
  });
}
