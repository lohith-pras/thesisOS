# Verification guide

## Static checks and tests

```bash
npm run check
npm run check:frontend
npm test
```

## Browser-level judge workflow

```bash
npm run test:browser
```

This launches a real headless Chrome session against isolated judge-mode state and verifies feedback decomposition, approval, fixture retrieval, evidence attachment, deterministic grounded drafting, stable source IDs, and recovery after a page reload. On macOS it uses Google Chrome by default; set `CHROME_PATH` to another Chrome or Chromium binary when needed.

## Offline artifact path

```bash
npm run demo -- --feedback "Compare smart EV charging evidence for distribution-grid congestion" \
  --output-dir ./demo-output/manual-offline
cat ./demo-output/manual-offline/task-graph.json
cat ./demo-output/manual-offline/thesis-state.json
```

Confirm `schemaVersion: 1`, valid `dependsOn` IDs, and `approvalRequiredForWrites: true`.

## File input path

```bash
printf '%s\n' "Rerun the simulation with updated parameters." > /tmp/thesis-feedback.txt
npm run demo -- --feedback-file /tmp/thesis-feedback.txt --output-dir ./demo-output/manual-file
```

## Guardrail path

This conflicting input must fail without creating new artifacts:

```bash
npm run demo -- --feedback "one" --feedback-file /tmp/thesis-feedback.txt
```

## Live adapters

Codex:

```bash
codex login status
npm run demo -- --codex --feedback-file ./my-feedback.txt --output-dir ./demo-output/codex-run
```

OpenAI decomposition, only when intentionally testing the API:

```bash
OPENAI_API_KEY="your-key" npm run demo -- --ai \
  --feedback "Compare the literature" --output-dir ./demo-output/openai-run
```

## Manual website smoke test

Run `npm run app -- --demo` and verify: task approval, rejected-task refusal, semantic retrieval notice, evidence selection, navigation to Evidence notes, Codex drafting or local fallback, preview, and judge-mode write refusal.
