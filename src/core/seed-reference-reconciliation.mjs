import { mapBibliographyToSources } from "./citation-mapping.mjs";

function entry(item, index) {
  const text = String(item?.text ?? item?.value ?? item ?? "").trim();
  const doi = text.match(/10\.\d{4,9}\/[\w.()/:;-]+/i)?.[0] ?? null;
  return { citekey: `seed-${index + 1}`, title: doi ? text.replace(doi, "").replace(/[()[\],.;]+/g, " ").trim() : text, doi };
}

export function reconcileSeedReferences(seedReferences, sources) {
  const references = Object.fromEntries((seedReferences ?? []).map(entry).filter(({ title, doi }) => title || doi).map((item) => [item.citekey, item]));
  const entries = Object.values(mapBibliographyToSources(references, sources).entries).map((item) => ({ ...item, reference: references[item.citekey], status: item.status === "mapped" ? "present" : item.status === "ambiguous" ? "ambiguous" : "missing" }));
  return { schemaVersion: 1, total: entries.length, present: entries.filter(({ status }) => status === "present"), missing: entries.filter(({ status }) => status === "missing"), ambiguous: entries.filter(({ status }) => status === "ambiguous"), entries };
}
