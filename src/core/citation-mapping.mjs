function normalizeDoi(value = "") {
  return String(value).trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
}

function normalizeTitle(value = "") {
  return String(value).toLowerCase().normalize("NFKD").replace(/\\[a-z]+\s*/gi, "").replace(/[{}]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function mapBibliographyToSources(bibliography, sources) {
  const byDoi = new Map();
  const byTitle = new Map();
  for (const source of sources ?? []) {
    const doi = normalizeDoi(source.doi);
    const title = normalizeTitle(source.title);
    if (doi) byDoi.set(doi, [...(byDoi.get(doi) ?? []), source]);
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), source]);
  }
  const entries = {};
  for (const [citekey, entry] of Object.entries(bibliography ?? {})) {
    const doiMatches = entry.doi ? byDoi.get(normalizeDoi(entry.doi)) ?? [] : [];
    const titleMatches = doiMatches.length ? [] : byTitle.get(normalizeTitle(entry.title)) ?? [];
    const matches = doiMatches.length ? doiMatches : titleMatches;
    entries[citekey] = matches.length === 1
      ? { citekey, status: "mapped", sourceId: matches[0].sourceId, matchedBy: doiMatches.length ? "doi" : "title" }
      : { citekey, status: matches.length > 1 ? "ambiguous" : "unresolved", candidates: matches.map(({ sourceId }) => sourceId) };
  }
  return { entries };
}
