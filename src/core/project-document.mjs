import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";

const DEFAULT_LIMITS = { maxBytes: 20 * 1024 * 1024, maxPages: 100, maxCharacters: 150_000 };
const MEDIA_TYPES = new Map([[".pdf", "application/pdf"], [".md", "text/markdown"], [".txt", "text/plain"]]);

function documentError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function normalize(text) {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function defaultPdfLoader(data) {
  let pdfjs;
  try { pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); }
  catch (error) { throw documentError("DOCUMENT_PDF_RUNTIME_MISSING", "PDF support is unavailable. Install project dependencies and retry.", error); }
  return pdfjs.getDocument({ data: new Uint8Array(data), useWorkerFetch: false, isEvalSupported: false }).promise;
}

async function extractPdf(data, options) {
  let document;
  try { document = await (options.pdfLoader ?? defaultPdfLoader)(data); }
  catch (error) {
    if (error.code) throw error;
    const encrypted = /password|encrypted/i.test(error.message ?? "");
    throw documentError(encrypted ? "DOCUMENT_ENCRYPTED" : "DOCUMENT_PARSE_FAILED", encrypted ? "The PDF is encrypted. Provide an unlocked copy." : `The PDF could not be parsed: ${error.message}`, error);
  }
  if (document.numPages > options.maxPages) throw documentError("DOCUMENT_PAGE_LIMIT", `The document has ${document.numPages} pages; the limit is ${options.maxPages}.`);
  const segments = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = normalize(content.items.map((item) => item.str ?? "").join(" "));
    if (text) segments.push({ locator: `page:${number}`, text });
  }
  if (!segments.length) throw documentError("DOCUMENT_NO_TEXT", "No selectable text was found. Paste the text or provide OCR output.");
  return { segments, pageCount: document.numPages };
}

export async function extractProjectDocument(path, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const extension = extname(path).toLowerCase();
  const mediaType = MEDIA_TYPES.get(extension);
  if (!mediaType) throw documentError("DOCUMENT_TYPE_UNSUPPORTED", "Use a PDF, Markdown, or plain-text project document.");
  const metadata = await stat(path);
  if (metadata.size > limits.maxBytes) throw documentError("DOCUMENT_TOO_LARGE", `The document is ${metadata.size} bytes; the limit is ${limits.maxBytes}.`);
  const data = await readFile(path);
  let extracted;
  if (extension === ".pdf") extracted = await extractPdf(data, limits);
  else {
    const text = normalize(data.toString("utf8"));
    if (!text) throw documentError("DOCUMENT_NO_TEXT", "The project document is empty.");
    const lineCount = data.toString("utf8").replace(/\r\n?/g, "\n").split("\n").length - (data.at(-1) === 10 ? 1 : 0);
    extracted = { segments: [{ locator: `line:1-${Math.max(1, lineCount)}`, text }], pageCount: null };
  }
  const combinedText = extracted.segments.map(({ text }) => text).join("\n\n");
  if (combinedText.length > limits.maxCharacters) throw documentError("DOCUMENT_TEXT_LIMIT", `The extracted text has ${combinedText.length} characters; the limit is ${limits.maxCharacters}.`);
  return {
    metadata: {
      filename: basename(path),
      mediaType,
      byteCount: metadata.size,
      characterCount: combinedText.length,
      pageCount: extracted.pageCount,
      sha256: createHash("sha256").update(data).digest("hex")
    },
    segments: extracted.segments,
    combinedText
  };
}
