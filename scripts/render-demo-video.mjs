import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Development helper for macOS: requires the built-in `say` command and ffmpeg.
const root = resolve(import.meta.dirname, "..");
const assets = resolve(root, "docs", "assets");
const narration = resolve(root, "docs", "video-narration.txt");
const audio = resolve(assets, "thesisos-narration.aiff");
const output = resolve(assets, "thesisos-demo.mp4");

await mkdir(assets, { recursive: true });
const voice = process.env.THESISOS_DEMO_VOICE ?? "Samantha";
const speech = spawnSync("say", ["-v", voice, "-r", "175", "-f", narration, "-o", audio], { encoding: "utf8" });
if (speech.status !== 0) throw new Error(speech.stderr || "macOS speech synthesis failed.");

const render = spawnSync("ffmpeg", ["-y", "-stream_loop", "-1", "-i", resolve(assets, "thesisos-hero.gif"), "-i", audio, "-shortest", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2:color=#f7f8f5,fps=30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output], { encoding: "utf8" });
await rm(audio, { force: true });
if (render.status !== 0) throw new Error(render.stderr || "FFmpeg failed to render the demo video.");
console.log(`Rendered narrated demo video: ${output}`);
