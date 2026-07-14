import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";

function runPicker(command, args) {
  return new Promise((resolvePicker, rejectPicker) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => rejectPicker(new Error(`Could not open the folder picker: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) return rejectPicker(Object.assign(new Error("Folder selection was cancelled."), { code: "OBSIDIAN_PICKER_CANCELLED" }));
      const path = stdout.trim();
      if (!path) return rejectPicker(Object.assign(new Error("Folder selection was cancelled."), { code: "OBSIDIAN_PICKER_CANCELLED" }));
      resolvePicker(path);
    });
  });
}

export async function pickFolder(mode = "existing") {
  const prompt = mode === "create" ? "Choose where to create the ThesisOS vault" : "Choose an Obsidian vault";
  if (process.platform === "darwin") return runPicker("osascript", ["-e", `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`]);
  if (process.platform === "linux") return runPicker("zenity", ["--file-selection", "--directory", `--title=${prompt}`]);
  if (process.platform === "win32") {
    const escapedPrompt = prompt.replaceAll("'", "''");
    return runPicker("powershell", ["-NoProfile", "-Command", `$dialog = New-Object -ComObject Shell.Application; $folder = $dialog.BrowseForFolder(0, '${escapedPrompt}', 0); if ($folder) { $folder.Self.Path }`]);
  }
  throw new Error(`Native folder picking is not supported on ${process.platform}.`);
}

export async function inspectObsidianVault(vaultPath) {
  if (typeof vaultPath !== "string" || !vaultPath.trim() || !isAbsolute(vaultPath)) return { path: vaultPath ?? null, exists: false, isVault: false };
  const path = resolve(vaultPath);
  try {
    const entry = await stat(path);
    if (!entry.isDirectory()) return { path, exists: false, isVault: false };
    let hasMarkdown = false;
    try { hasMarkdown = (await readdir(path, { withFileTypes: true })).some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")); } catch { hasMarkdown = false; }
    let hasObsidianConfig = false;
    try { hasObsidianConfig = (await stat(join(path, ".obsidian"))).isDirectory(); } catch { hasObsidianConfig = false; }
    return { path, exists: true, isVault: hasObsidianConfig || hasMarkdown, hasObsidianConfig, hasMarkdown };
  } catch (error) {
    if (error.code === "ENOENT") return { path, exists: false, isVault: false };
    throw error;
  }
}

async function readProjectConfig(projectDir) {
  try { return JSON.parse(await readFile(resolve(projectDir, ".thesisos.json"), "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function loadObsidianVault(projectDir) {
  const config = await readProjectConfig(projectDir);
  return config.obsidian?.vaultPath ?? null;
}

export async function saveObsidianVault(projectDir, vaultPath) {
  const path = resolve(projectDir, ".thesisos.json");
  const config = await readProjectConfig(projectDir);
  config.obsidian = { ...(config.obsidian ?? {}), vaultPath };
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
  await rename(temporaryPath, path);
  return vaultPath;
}

export async function chooseObsidianVault(projectDir, { mode = "existing", name } = {}) {
  const selected = await pickFolder(mode);
  let vaultPath = selected;
  if (mode === "create") {
    const vaultName = typeof name === "string" && name.trim() ? name.trim() : "ThesisOS";
    vaultPath = resolve(selected, vaultName);
    await mkdir(join(vaultPath, ".obsidian"), { recursive: true });
  }
  const status = await inspectObsidianVault(vaultPath);
  if (!status.exists) throw new Error("The selected folder does not exist.");
  if (mode === "existing" && !status.isVault) throw new Error("The selected folder does not contain an Obsidian configuration or Markdown file. Choose a folder with notes or create a new vault.");
  await saveObsidianVault(projectDir, vaultPath);
  return status;
}
