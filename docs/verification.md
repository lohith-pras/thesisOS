# Verification guide

## Static checks and tests

```bash
npm run check
npm run check:frontend
npm test
```

## Final Codex hardening record

The final hardening pass ran in Codex session `019f6859-ae92-7280-930a-f7d7bf5b11ea` on 2026-07-16. It used six specialised sub-agents for security, correctness and test coverage, revision contracts, UI/XSS hardening, performance and maintainability, and a post-fix review. A separate write-path agent hardened managed workspace rendering.

The verified changes from that pass were:

- serialised, revision-checked canonical writes, including CLI commands and Zotero-library selection;
- read-only `GET` state loading, state-file locking, and safe file permissions;
- judge-mode endpoint isolation from local files, local applications, Zotero, and external model routes;
- server-issued, one-time note-preview tokens before a filesystem write;
- containment, filename, symlink, and temporary-file guards for Obsidian and managed workspace writes;
- escaped dynamic UI attributes, HTTPS-only paper/source links, and safe external-link attributes.

The final post-fix review recorded `npm test` as **184/184 passing**, with `npm run check` and `npm run check:frontend` also passing. This is a historical verification record; rerun the commands above before a new release. The reviewer noted one non-blocking edge case: a severely stalled filesystem could make the 30-second stale-lock reclamation policy conservative. An owner-token heartbeat lock would be a further hardening step for hostile or networked filesystems.

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

Run `npm run app -- --demo` and verify: task approval, rejected-task refusal, semantic retrieval notice, evidence selection, navigation to Evidence notes, Codex drafting or local fallback, preview, and judge-mode write refusal. For a deterministic short path, select **Show completed proof** and verify that Claim Traceback links source note → selected evidence → approved task → feedback. Then select **Test citation boundary** and verify that the preview rejects the deliberately unselected fixture source.
