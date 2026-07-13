import { validateTaskGraph } from "./schema.mjs";
import { rankResearchPapers } from "./retrieval.mjs";
import { openEmbeddingCache } from "./embedding-cache.mjs";

const NON_BIBLIOGRAPHIC_TYPES = new Set(["attachment", "note", "annotation"]);
const LOCAL_API_ROOT = "http://localhost:23119/api";
const WEB_API_ROOT = "https://api.zotero.org";

export function extractLiteratureQuery(feedback) {
  const citation = feedback.match(/\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+)\s*[,(]?\s*((?:19|20)\d{2}[a-z]?)\b/);
  if (citation) return `${citation[1]} ${citation[2]}`;
  return feedback.trim();
}

export function requireApprovedLiteratureTask(taskGraph) {
  validateTaskGraph(taskGraph);
  const task = taskGraph.tasks.find((item) => item.kind === "literature");
  if (!task) throw new Error("The task graph does not contain a literature task.");
  if (task.approvalStatus !== "approved") {
    throw new Error(`Literature task '${task.id}' must be approved before searching Zotero.`);
  }
  return task;
}

function creatorName(creator) {
  return creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ");
}

function normalizeItem(item, library) {
  const data = item.data ?? item;
  const year = data.date?.match(/(?:19|20)\d{2}/)?.[0] ?? null;
  return {
    key: item.key ?? data.key,
    ...(library ? {
      sourceId: `${library.type}:${library.id}:${item.key ?? data.key}`,
      sourceLibrary: { type: library.type, id: library.id, name: library.name }
    } : {}),
    itemType: data.itemType,
    title: data.title || "Untitled",
    creators: (data.creators ?? []).map(creatorName).filter(Boolean),
    year,
    publicationTitle: data.publicationTitle || data.bookTitle || data.proceedingsTitle || null,
    abstract: data.abstractNote || null,
    tags: (data.tags ?? []).map((tag) => typeof tag === "string" ? tag : tag.tag).filter(Boolean),
    doi: data.DOI || null,
    url: data.url || item.links?.alternate?.href || null
  };
}

function requestHeaders(mode, apiKey) {
  const headers = { Accept: "application/json", "Zotero-API-Version": "3" };
  if (mode === "web" && apiKey) headers["Zotero-API-Key"] = apiKey;
  return headers;
}

async function fetchJson(url, options) {
  let response;
  try {
    response = await options.fetchImpl(url, { method: "GET", headers: options.headers });
  } catch (error) {
    if (options.mode === "local") throw zoteroError("ZOTERO_UNAVAILABLE", `Zotero local API is unavailable. Start Zotero and enable local API access. ${error.message}`);
    throw zoteroError("ZOTERO_UNAVAILABLE", `Zotero Web API request failed: ${error.message}`);
  }
  if (!response.ok) {
    const hint = options.mode === "local" && response.status === 403
      ? " Enable ‘Allow other applications on this computer to communicate with Zotero’ in Zotero settings."
      : "";
    const code = response.status === 401 || response.status === 403 ? "ZOTERO_ACCESS_DENIED" : "ZOTERO_HTTP_ERROR";
    throw zoteroError(code, `Zotero ${options.mode} request failed with HTTP ${response.status}.${hint}`, { status: response.status });
  }
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw zoteroError("ZOTERO_INVALID_RESPONSE", `Zotero returned invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(body)) throw zoteroError("ZOTERO_INVALID_RESPONSE", "Zotero returned an unexpected response shape.");
  return { body, response };
}

function zoteroError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function fetchAllPages(url, options) {
  const pageSize = options.pageSize ?? 100;
  const items = [];
  let start = 0;
  let previousPageSignature = null;
  while (true) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("limit", String(pageSize));
    pageUrl.searchParams.set("start", String(start));
    const { body, response } = await fetchJson(pageUrl, options);
    const pageSignature = JSON.stringify(body.map((item) => item.key ?? item.data?.key ?? [item.data?.itemType, item.data?.title]));
    if (body.length && pageSignature === previousPageSignature) {
      throw zoteroError("ZOTERO_PAGINATION_STALLED", "Zotero returned the same page for consecutive pagination offsets; extraction stopped to avoid duplicate or partial results.", { start });
    }
    previousPageSignature = pageSignature;
    items.push(...body);
    const totalValue = response.headers?.get?.("Total-Results");
    const total = totalValue === null || totalValue === undefined ? null : Number(totalValue);
    if (!body.length || body.length < pageSize || (Number.isFinite(total) && items.length >= total)) break;
    start += body.length;
  }
  return items;
}

function isBibliographic(item) {
  return !NON_BIBLIOGRAPHIC_TYPES.has((item.data ?? item).itemType);
}

async function discoverZoteroLibraries(options, runtime) {
  if (runtime.mode === "web" && !(options.userId ?? process.env.ZOTERO_USER_ID)) {
    throw zoteroError("ZOTERO_USER_ID_REQUIRED", "ZOTERO_USER_ID is required to discover Zotero Web API libraries.");
  }
  const userId = runtime.mode === "local" ? "0" : String(options.userId ?? process.env.ZOTERO_USER_ID);
  const root = runtime.mode === "local" ? LOCAL_API_ROOT : WEB_API_ROOT;
  const groupsUrl = new URL(`${root}/users/${encodeURIComponent(userId)}/groups`);
  groupsUrl.searchParams.set("format", "json");
  const groups = (await fetchJson(groupsUrl, runtime)).body;
  const libraries = [
    { type: "user", id: userId, name: "My Library" },
    ...groups.map((group) => ({
      type: "group",
      id: String(group.id ?? group.data?.id),
      name: group.data?.name ?? group.name ?? "Group Library"
    }))
  ];
  return Promise.all(libraries.map(async (library) => {
    const url = libraryItemsUrl(runtime.mode, library);
    url.searchParams.set("format", "json");
    url.searchParams.set("include", "data");
    const items = await fetchAllPages(url, runtime);
    return { ...library, paperCount: items.filter(isBibliographic).length };
  }));
}

export async function resolveZoteroLibrary(options = {}) {
  const mode = options.mode ?? "local";
  const libraryType = options.libraryType ?? process.env.ZOTERO_LIBRARY_TYPE;
  const libraryId = options.libraryId ?? process.env.ZOTERO_LIBRARY_ID;
  if (libraryType || libraryId) {
    const type = libraryType ?? "user";
    if (!new Set(["user", "group"]).has(type)) throw new Error("Zotero library type must be 'user' or 'group'.");
    if (type === "group" && !libraryId) throw new Error("A Zotero group library requires ZOTERO_LIBRARY_ID or --library-id.");
    return { type, id: String(libraryId ?? (mode === "local" ? "0" : options.userId ?? process.env.ZOTERO_USER_ID)) };
  }

  if (mode === "web") {
    const userId = options.userId ?? process.env.ZOTERO_USER_ID;
    if (!userId && !options.library && !options.savedLibrary) throw new Error("ZOTERO_USER_ID is required for Zotero Web API user-library searches.");
  }

  const runtime = runtimeOptions(options);
  const libraries = await discoverZoteroLibraries(options, runtime);
  if (options.library) {
    const selected = libraries.filter((candidate) => candidate.id === String(options.library) || candidate.name === options.library);
    if (selected.length === 1) return selected[0];
    if (selected.length > 1) {
      throw zoteroError("ZOTERO_LIBRARY_NAME_AMBIGUOUS", `More than one Zotero library is named '${options.library}'. Select by ID.`, { libraries: selected });
    }
    throw zoteroError("ZOTERO_LIBRARY_NOT_FOUND", `Zotero library '${options.library}' was not found.`, { libraries });
  }
  if (options.savedLibrary) {
    const selected = libraries.find((candidate) => candidate.type === options.savedLibrary.type && candidate.id === String(options.savedLibrary.id));
    if (selected?.paperCount > 0) return selected;
    if (selected) {
      throw zoteroError("ZOTERO_LIBRARY_EMPTY", `The saved Zotero library '${selected.name}' no longer contains bibliographic papers.`, { library: selected, libraries });
    }
    throw zoteroError("ZOTERO_SAVED_LIBRARY_STALE", "The saved Zotero library is no longer accessible. Choose another library.", { libraries });
  }
  const nonEmpty = libraries.filter((candidate) => candidate.paperCount > 0);
  if (nonEmpty.length === 1) return nonEmpty[0];
  if (!nonEmpty.length) {
    throw zoteroError("ZOTERO_NO_PAPERS", "No top-level bibliographic papers were found in the accessible Zotero libraries.", { libraries });
  }
  throw zoteroError("ZOTERO_LIBRARY_SELECTION_REQUIRED", "Multiple Zotero libraries contain papers. Select one with --library <name-or-id> or use --all-libraries.", { libraries: nonEmpty });
}

function libraryItemsUrl(mode, library, endpoint = "items/top") {
  const root = mode === "local" ? LOCAL_API_ROOT : WEB_API_ROOT;
  const prefix = library.type === "group" ? "groups" : "users";
  return new URL(`${root}/${prefix}/${encodeURIComponent(library.id)}/${endpoint}`);
}

function duplicateGroups(items, field) {
  const groups = new Map();
  for (const item of items) {
    const value = item[field]?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), item.key]);
  }
  return [...groups.entries()].filter(([, keys]) => keys.length > 1).map(([value, keys]) => ({ value, keys }));
}

function runtimeOptions(options) {
  const mode = options.mode ?? "local";
  const apiKey = options.apiKey ?? process.env.ZOTERO_API_KEY;
  return {
    mode,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    headers: requestHeaders(mode, apiKey)
  };
}

export async function listZoteroPapers(options = {}) {
  const runtime = runtimeOptions(options);
  const libraries = options.allLibraries
    ? (await discoverZoteroLibraries(options, runtime)).filter((candidate) => candidate.paperCount > 0)
    : [await resolveZoteroLibrary({ ...options, ...runtime })];
  if (!libraries.length) {
    throw zoteroError("ZOTERO_NO_PAPERS", "No top-level bibliographic papers were found in the accessible Zotero libraries.");
  }
  const paperSets = await Promise.all(libraries.map(async (library) => {
    const url = options.baseUrl ? new URL(options.baseUrl) : libraryItemsUrl(runtime.mode, library);
    url.searchParams.set("format", "json");
    url.searchParams.set("include", "data");
    url.searchParams.set("sort", "title");
    url.searchParams.set("direction", "asc");
    const items = await fetchAllPages(url, { ...runtime, pageSize: options.pageSize });
    return items.filter(isBibliographic).map((item) => normalizeItem(item, library));
  }));
  const papers = paperSets.flat();
  const library = libraries.length === 1 ? libraries[0] : null;
  return {
    schemaVersion: 1,
    provider: runtime.mode === "local" ? "zotero-local" : "zotero-web",
    access: "read-only",
    library,
    libraries,
    createdAt: new Date().toISOString(),
    paperCount: papers.length,
    duplicateTitles: duplicateGroups(papers, "title"),
    duplicateDois: duplicateGroups(papers, "doi"),
    papers
  };
}

export async function searchZotero(taskGraph, options = {}) {
  const task = requireApprovedLiteratureTask(taskGraph);
  const query = options.query?.trim() || extractLiteratureQuery(taskGraph.feedback);
  if (!query) throw new Error("A Zotero search query is required.");
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Zotero result limit must be between 1 and 100.");

  const runtime = runtimeOptions(options);
  const libraries = options.allLibraries
    ? (await discoverZoteroLibraries(options, runtime)).filter((candidate) => candidate.paperCount > 0)
    : [await resolveZoteroLibrary({ ...options, ...runtime })];
  if (!libraries.length) throw zoteroError("ZOTERO_NO_PAPERS", "No searchable Zotero libraries contain bibliographic papers.");
  const paperSets = await Promise.all(libraries.map(async (selectedLibrary) => {
    const url = options.baseUrl ? new URL(options.baseUrl) : libraryItemsUrl(runtime.mode, selectedLibrary);
    url.searchParams.set("format", "json");
    url.searchParams.set("include", "data");
    const items = await fetchAllPages(url, { ...runtime, pageSize: options.pageSize });
    return items.filter(isBibliographic).map((item) => normalizeItem(item, selectedLibrary));
  }));
  const papers = paperSets.flat();
  const embeddingCache = options.embeddingCache ?? (options.cachePath ? await openEmbeddingCache(options.cachePath) : null);
  const ranked = await rankResearchPapers(query, papers, {
    limit,
    embeddingProvider: options.embeddingProvider ?? process.env.THESISOS_EMBEDDING_PROVIDER ?? "ollama",
    embedTexts: options.embedTexts,
    fetchImpl: options.embeddingFetchImpl,
    baseUrl: options.embeddingBaseUrl,
    model: options.embeddingModel,
    embeddingCache,
    minimumScore: options.minimumScore ?? Number(process.env.THESISOS_RETRIEVAL_MINIMUM_SCORE ?? 0.12)
  });
  const library = libraries.length === 1 ? libraries[0] : null;

  return {
    schemaVersion: 1,
    provider: runtime.mode === "local" ? "zotero-local" : "zotero-web",
    access: "read-only",
    library,
    libraries,
    taskId: task.id,
    query,
    createdAt: new Date().toISOString(),
    totalResults: ranked.candidates.length,
    indexedPaperCount: papers.length,
    retrieval: ranked.retrieval,
    candidates: ranked.candidates
  };
}
