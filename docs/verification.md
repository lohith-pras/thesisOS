# Verification guide

## Static checks and tests

```bash
npm run check
npm run check:frontend
npm test
```

## Offline artifact path

```bash
npm run demo -- --feedback "Compare distributed ISAC literature in Section 3.2" \
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

## Website smoke test

Run `npm run app -- --demo` and verify: task approval, rejected-task refusal, semantic retrieval notice, evidence selection, navigation to Evidence notes, Codex drafting or local fallback, preview, and judge-mode write refusal.
