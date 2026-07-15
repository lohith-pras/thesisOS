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
  const page = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://127.0.0.1:${PORT}/app/`, { method: "PUT" })).json();
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

  await waitUntil(call, "document.querySelector('[data-action=\"show-demo-proof\"]') !== null");
  await evaluate(call, "document.querySelector('[data-action=\"show-demo-proof\"]').click()");
  await waitUntil(call, "document.querySelector('.note-preview') !== null");
  await waitUntil(call, "document.querySelector('.claim-traceback-result') !== null");
  await waitUntil(call, "document.querySelector('.claim-traceback-result').textContent.includes('Supervisor asked:')");
  await waitUntil(call, "document.querySelector('.demo-guide-head .label')?.textContent.includes('4 OF 5')");
  const selectedSourceId = await evaluate(call, "document.querySelector('.claim-traceback-result code').textContent");
  if (!VERIFY_ONLY) {
    await screenshotElement(call, ".note-workflow", "judge-grounded-note.png");
    await screenshotElement(call, ".claim-traceback", "judge-claim-traceback.png");
    console.log("Captured grounded note and Claim Traceback");
  }

  await waitUntil(call, "document.querySelector('[data-action=\"test-citation-boundary\"]') !== null");
  await evaluate(call, "document.querySelector('[data-action=\"test-citation-boundary\"]').click()");
  await waitUntil(call, "document.querySelector('.page-content > .citation-boundary-proof')?.textContent.includes('Proofline blocked a citation outside this note’s selected evidence') && document.querySelector('.page-content > .citation-boundary-proof')?.textContent.includes('Existing valid preview is unchanged. No file write was attempted')");
  if (!VERIFY_ONLY) {
    await screenshotElement(call, ".page-content > .citation-boundary-proof", "judge-citation-rejection.png");
    console.log("Captured citation rejection");
  }

  await call("Page.reload", { ignoreCache: true });
  await evaluate(call, "location.hash='notes'");
  await waitUntil(call, "document.querySelector('.note-preview') !== null");
  await waitUntil(call, "document.querySelector('.claim-traceback') !== null");
  socket.close();

  if (VERIFY_ONLY) {
    console.log(`Browser proof replay passed with ${selectedSourceId}: feedback → approval → selected evidence → grounded draft → Claim Traceback → citation rejection → reload.`);
  } else {
    const frames = ["judge-overview.png", "judge-grounded-note.png", "judge-claim-traceback.png", "judge-citation-rejection.png"].map((name) => resolve(ASSETS, name));
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
