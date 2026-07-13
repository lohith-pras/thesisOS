const STOP_WORDS = new Set(["about", "after", "again", "also", "been", "before", "being", "between", "could", "from", "have", "into", "more", "most", "other", "paper", "papers", "should", "than", "that", "their", "there", "these", "this", "those", "under", "using", "with", "would"]);

function tokens(value) {
  return String(value ?? "").toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? [];
}

function paperText(paper) {
  return [paper.title, ...(paper.creators ?? []), paper.publicationTitle, paper.abstract, ...(paper.tags ?? []), paper.doi].filter(Boolean).join("\n");
}

function lexicalScore(query, paper) {
  const queryTokens = [...new Set(tokens(query))];
  if (!queryTokens.length) return { score: 0, reasons: [] };
  const fields = [
    ["title", paper.title, 4],
    ["abstract", paper.abstract, 2],
    ["tag", (paper.tags ?? []).join(" "), 3],
    ["author", (paper.creators ?? []).join(" "), 2],
    ["venue", paper.publicationTitle, 1],
    ["DOI", paper.doi, 4]
  ];
  let matchedWeight = 0;
  let totalWeight = 0;
  const reasons = [];
  for (const term of queryTokens) {
    let best = 0;
    let bestField = "";
    for (const [name, value, weight] of fields) {
      if (tokens(value).some((candidate) => candidate === term || candidate.startsWith(term) || term.startsWith(candidate))) {
        if (weight > best) { best = weight; bestField = name; }
      }
    }
    totalWeight += 4;
    matchedWeight += best;
    if (bestField && !reasons.includes(bestField)) reasons.push(bestField);
  }
  return { score: totalWeight ? matchedWeight / totalWeight : 0, reasons: reasons.map((field) => `Matched ${field} metadata`) };
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0; let left = 0; let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; left += a[index] ** 2; right += b[index] ** 2;
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}

export async function embedWithOllama(texts, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = options.model ?? process.env.THESISOS_EMBEDDING_MODEL ?? "nomic-embed-text";
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts })
  });
  if (!response.ok) throw new Error(`Local embedding request failed with HTTP ${response.status}. Start Ollama and install ${model}.`);
  const payload = await response.json();
  if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== texts.length) throw new Error("Local embedding runtime returned an invalid response.");
  return payload.embeddings;
}

export async function rankResearchPapers(query, papers, options = {}) {
  const limit = options.limit ?? 10;
  const lexical = papers.map((paper) => ({ paper, ...lexicalScore(query, paper) }));
  let embeddings = null;
  let warning = null;
  if (options.embeddingProvider !== "none") {
    try {
      const embedTexts = options.embedTexts ?? ((texts) => embedWithOllama(texts, options));
      embeddings = await embedTexts([query, ...papers.map(paperText)]);
    } catch (error) {
      warning = `Semantic embeddings unavailable: ${error.message}`;
    }
  }
  const ranked = lexical.map((entry, index) => {
    const semanticScore = embeddings ? Math.max(0, cosine(embeddings[0], embeddings[index + 1])) : 0;
    const matchScore = embeddings ? (semanticScore * 0.75) + (entry.score * 0.25) : entry.score;
    const matchReasons = [...entry.reasons];
    if (embeddings && semanticScore > 0.45) matchReasons.unshift("Semantically similar to the approved feedback");
    return { ...entry.paper, matchScore: Number(matchScore.toFixed(4)), semanticScore: Number(semanticScore.toFixed(4)), lexicalScore: Number(entry.score.toFixed(4)), matchReasons };
  }).sort((a, b) => b.matchScore - a.matchScore || a.title.localeCompare(b.title));
  return {
    candidates: ranked.slice(0, limit),
    retrieval: {
      mode: embeddings ? "hybrid-semantic" : "hybrid-lexical",
      embeddingProvider: embeddings ? "local" : null,
      indexedFields: ["title", "creators", "publicationTitle", "abstract", "tags", "doi"],
      ...(warning ? { warning } : {})
    }
  };
}
