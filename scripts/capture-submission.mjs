import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Development helper for macOS; override the Chrome binary with CHROME_PATH if needed.
const ROOT = resolve(import.meta.dirname, "..");
const ASSETS = resolve(ROOT, "docs", "assets");
const PORT = 4191;
const DEBUG_PORT = 9223;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VERIFY_ONLY = process.argv.includes("--verify");

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitFor(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function cdp(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const callId = ++id;
    pending.set(callId, { resolve: resolveCall, reject: rejectCall });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
}

async function evaluate(call, expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitUntil(call, expression, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(call, expression)) return;
    await delay(100);
  }
  const browserText = await evaluate(call, "document.body?.innerText?.slice(-1200) || 'No browser body text'");
  throw new Error(`Browser condition timed out: ${expression}\n${browserText}`);
}

async function screenshot(call, filename) {
  const width = 1440;
  const height = 900;
  const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await writeFile(resolve(ASSETS, filename), Buffer.from(capture.data, "base64"));
}

async function screenshotElement(call, selector, filename) {
  const box = await evaluate(call, `(() => { const element=document.querySelector(${JSON.stringify(selector)}); const rect=element.getBoundingClientRect(); return { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height }; })()`);
  const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true, clip: { ...box, scale: 1 } });
  await writeFile(resolve(ASSETS, filename), Buffer.from(capture.data, "base64"));
}

const profile = await mkdtemp(resolve(tmpdir(), "thesisos-capture-"));
const server = spawn(process.execPath, ["src/app-server.mjs", "--demo"], { cwd: ROOT, env: { ...process.env, THESISOS_PORT: String(PORT) }, stdio: VERIFY_ONLY ? "inherit" : "ignore" });
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: "ignore" });

try {
  if (!VERIFY_ONLY) await mkdir(ASSETS, { recursive: true });
  await waitFor(`http://127.0.0.1:${PORT}/api/zotero/status`);
  await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const page = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://127.0.0.1:${PORT}`, { method: "PUT" })).json();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", rejectOpen, { once: true }); });
  const call = cdp(socket);
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitUntil(call, "document.querySelector('.connection.connected') !== null");
  if (!VERIFY_ONLY) {
    await screenshot(call, "judge-overview.png");
    console.log("Captured overview");
  }

  await evaluate(call, "location.hash='overview'");
  await waitUntil(call, "document.querySelector('#feedback-form') !== null");
  await evaluate(call, `(() => { const form=document.querySelector('#feedback-form'); form.feedback.value='Review distributed ISAC literature, identify evidence for sensing coverage, and revise section 3.2.'; form.provider.value='codex'; form.requestSubmit(); return true; })()`);
  await waitUntil(call, "document.querySelector('[data-task=\"task-literature\"]') !== null");
  await waitUntil(call, "document.body.textContent.includes('offline-fallback')");
  if (!VERIFY_ONLY) {
    await screenshot(call, "judge-task-approval.png");
    console.log("Captured task approval");
  }

  await evaluate(call, "document.querySelector('[data-task=\"task-literature\"]').click()");
  await waitUntil(call, "document.querySelector('[data-action^=\"approve-task:\"]') !== null");
  await evaluate(call, "document.querySelector('[data-action^=\"approve-task:\"]').click()");
  await waitUntil(call, "fetch('/api/project').then(r => r.json()).then(p => p.state.feedbackThreads.at(-1)?.tasks.some(t => t.id === 'task-literature' && t.approvalStatus === 'approved'))");
  await call("Page.reload", { ignoreCache: true });
  await evaluate(call, "location.hash='tasks'");
  await waitUntil(call, "document.querySelector('[data-task=\"task-literature\"].approved') !== null");
  await evaluate(call, "document.querySelector('[data-task=\"task-literature\"].approved').click()");
  await waitUntil(call, "document.querySelector('[data-action=\"search-zotero\"]') !== null");
  await evaluate(call, "document.querySelector('[data-action=\"search-zotero\"]').click()");
  await waitUntil(call, "document.querySelector('.retrieval-notice') !== null");
  await waitUntil(call, "document.querySelector('.modal-backdrop') === null");
  if (!VERIFY_ONLY) {
    await screenshot(call, "judge-retrieval.png");
    console.log("Captured retrieval");
  }

  const selectedSourceId = await evaluate(call, `(() => { const toggle=document.querySelector('[data-action^="toggle-evidence:"]'); const sourceId=toggle.dataset.action.slice('toggle-evidence:'.length); toggle.click(); return sourceId; })()`);
  await waitUntil(call, "document.querySelector('[data-action=\"attach-evidence\"]:not([disabled])') !== null");
  await evaluate(call, "document.querySelector('[data-action=\"attach-evidence\"]').click()");
  await waitUntil(call, "document.querySelector('[data-action=\"draft-evidence-note\"]') !== null");
  await evaluate(call, "document.querySelector('[data-action=\"draft-evidence-note\"]').click()");
  await waitUntil(call, "document.querySelector('.note-preview') !== null");
  await waitUntil(call, `document.querySelector('.note-preview').textContent.includes(${JSON.stringify(selectedSourceId)})`);
  await waitUntil(call, "document.querySelector('.note-preview').textContent.includes('demo-grounded-template')");
  await evaluate(call, "document.querySelector('.note-preview').scrollTop=document.querySelector('.note-preview').scrollHeight");
  if (!VERIFY_ONLY) {
    await screenshotElement(call, ".note-workflow", "judge-grounded-note.png");
    console.log("Captured grounded note");
  }

  await call("Page.reload", { ignoreCache: true });
  await evaluate(call, "location.hash='notes'");
  await waitUntil(call, "document.querySelector('.note-preview') !== null");
  await waitUntil(call, `document.querySelector('.note-preview').textContent.includes(${JSON.stringify(selectedSourceId)})`);
  await waitUntil(call, "document.querySelector('.note-preview').textContent.includes('demo-grounded-template')");
  socket.close();

  if (VERIFY_ONLY) {
    console.log(`Browser happy path passed with ${selectedSourceId}: feedback → approval → retrieval → evidence → grounded draft → reload.`);
  } else {
    const frames = ["judge-overview.png", "judge-task-approval.png", "judge-retrieval.png", "judge-grounded-note.png"].map((name) => resolve(ASSETS, name));
    const normalizedFrames = frames.flatMap((frame) => ["(", frame, "-resize", "1200x675", "-background", "#f7f8f5", "-gravity", "center", "-extent", "1200x675", ")"]);
    const imageMagick = spawnSync("magick", ["-delay", "180", ...normalizedFrames, "-loop", "0", resolve(ASSETS, "thesisos-hero.gif")], { encoding: "utf8" });
    if (imageMagick.status !== 0) throw new Error(imageMagick.stderr || "ImageMagick failed to create the hero GIF.");
    console.log(`Captured submission assets in ${ASSETS}`);
  }
} finally {
  server.kill("SIGTERM");
  chrome.kill("SIGTERM");
  await delay(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(() => {});
}
