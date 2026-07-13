export async function evaluateRetrieval(cases, search, options = {}) {
  const k = options.k ?? 5;
  const results = [];
  for (const item of cases) {
    const candidates = await search(item.query);
    const keys = candidates.slice(0, k).map((paper) => paper.key);
    const expected = new Set(item.expectedKeys);
    const hits = keys.filter((key) => expected.has(key));
    const firstRelevantRank = keys.findIndex((key) => expected.has(key)) + 1;
    results.push({ id: item.id, query: item.query, expectedKeys: item.expectedKeys, returnedKeys: keys, hits, recallAtK: expected.size ? hits.length / expected.size : 0, reciprocalRank: firstRelevantRank ? 1 / firstRelevantRank : 0 });
  }
  return { schemaVersion: 1, k, caseCount: results.length, recallAtK: results.length ? results.reduce((sum, item) => sum + item.recallAtK, 0) / results.length : 0, meanReciprocalRank: results.length ? results.reduce((sum, item) => sum + item.reciprocalRank, 0) / results.length : 0, results };
}
