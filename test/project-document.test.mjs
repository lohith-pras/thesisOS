import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const module = await import("../src/core/project-document.mjs").catch(() => ({}));

test("exports the local project-document extractor", () => {
  assert.equal(typeof module.extractProjectDocument, "function");
});

test("extracts Markdown locally with line provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "thesisos-document-"));
  const path = join(root, "project.md");
  await writeFile(path, "# Cognitive ISAC\n\nDevelop an online optimization framework.\n");
  const result = await module.extractProjectDocument(path);
  assert.equal(result.metadata.mediaType, "text/markdown");
  assert.match(result.combinedText, /online optimization/);
  assert.equal(result.segments[0].locator, "line:1-3");
  assert.equal(result.metadata.sha256.length, 64);
});

test("extracts PDF pages sequentially with page provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "thesisos-document-"));
  const path = join(root, "project.pdf");
  await writeFile(path, "%PDF-test");
  const visited = [];
  const result = await module.extractProjectDocument(path, {
    pdfLoader: async () => ({
      numPages: 2,
      async getPage(number) {
        visited.push(number);
        return { getTextContent: async () => ({ items: [{ str: number === 1 ? "Project title" : "Objective" }] }) };
      }
    })
  });
  assert.deepEqual(visited, [1, 2]);
  assert.deepEqual(result.segments.map(({ locator }) => locator), ["page:1", "page:2"]);
  assert.equal(result.metadata.pageCount, 2);
});

test("rejects unsupported, oversized, image-only, and over-page-limit documents with stable codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "thesisos-document-"));
  const unsupported = join(root, "project.docx");
  await writeFile(unsupported, "unsupported");
  await assert.rejects(() => module.extractProjectDocument(unsupported), (error) => error.code === "DOCUMENT_TYPE_UNSUPPORTED");

  const text = join(root, "large.txt");
  await writeFile(text, "12345");
  await assert.rejects(() => module.extractProjectDocument(text, { maxBytes: 4 }), (error) => error.code === "DOCUMENT_TOO_LARGE");

  const pdf = join(root, "empty.pdf");
  await writeFile(pdf, "%PDF-test");
  await assert.rejects(() => module.extractProjectDocument(pdf, { pdfLoader: async () => ({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }) }), (error) => error.code === "DOCUMENT_NO_TEXT");
  await assert.rejects(() => module.extractProjectDocument(pdf, { maxPages: 1, pdfLoader: async () => ({ numPages: 2 }) }), (error) => error.code === "DOCUMENT_PAGE_LIMIT");
});
