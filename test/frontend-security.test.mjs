import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("frontend escapes dynamic actions and limits bibliographic links to HTTPS", async () => {
  const source = await readFile(resolve("app/app.js"), "utf8");

  assert.match(source, /function httpsUrl\(value\)[\s\S]*url\.protocol === "https:"/);
  assert.match(source, /const destination = paper\.doi \? `https:\/\/doi\.org\/\$\{encodeURIComponent\(paper\.doi\)\}` : httpsUrl\(paper\.url\)/);
  assert.match(source, /const sourceUrl = httpsUrl\(source\.sourceUrl\)/);
  assert.match(source, /data-action="\$\{esc\(action\)\}"/);
  assert.match(source, /data-task="\$\{esc\(task\.id\)\}"/);
  assert.match(source, /Covered in \$\{esc\(chapters\.join\(", "\)\)\}/);
  assert.doesNotMatch(source, /href="\$\{esc\(paper\.url\)\}/);
  assert.doesNotMatch(source, /href="\$\{esc\(source\.sourceUrl\)\}/);
});
