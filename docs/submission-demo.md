# ThesisOS submission demo

## One-command setup

```bash
npm run app -- --demo
```

Open `http://127.0.0.1:4173`.

## Under-three-minute recording script

1. **Problem (0:00–0:20):** Supervisor feedback is unstructured, paper titles rarely match its wording, and autonomous research tools can write without a traceable approval boundary.
2. **Feedback and Codex (0:20–0:50):** Paste a realistic supervisor email. Show Codex CLI decomposition into a validated task graph. Mention the visible deterministic fallback for judge machines without Codex.
3. **Refusal (0:50–1:05):** Reject the literature task. Show that no search action is available. Recreate/approve it for the remainder of the demo.
4. **Grounded retrieval (1:05–1:40):** Search the fixture or live Zotero library. Point out semantic/metadata mode, abstract coverage, relevance threshold, match score, source ID, and metadata-only warnings.
5. **Evidence boundary (1:40–2:05):** Select one or two reviewed papers and attach them. Explain that only selected stable source IDs can enter drafting.
6. **GPT-5.6 and fallback (2:05–2:35):** Click “Approve GPT-5.6 draft.” Show the external-processing disclosure, grounded source-ID citations, provider label, and deterministic fallback when no API key is configured.
7. **Write boundary (2:35–2:50):** Show that judge mode stops at preview. In the live path, explain that Obsidian writing requires separate approval and refuses overwrite.
8. **Close (2:50–3:00):** ThesisOS turns feedback into a reviewable, evidence-backed research trail without hiding retrieval quality or write authority.

## Required capture checklist

- [x] README hero GIF showing feedback → approval → retrieval → grounded preview (`docs/assets/thesisos-hero.gif`).
- [ ] Screenshot: Codex task graph from messy supervisor feedback.
- [x] Screenshot: judge retrieval results with abstract coverage, threshold, fallback mode, and match provenance (`docs/assets/judge-retrieval.png`).
- [ ] Screenshot: GPT-5.6 grounded note with stable source-ID citations.
- [ ] Screenshot/video moment: rejected task cannot search (include during the narrated recording).
- [ ] Public YouTube video under three minutes with voiceover.
- [ ] Add the main Codex `/feedback` session ID to the submission.
- [ ] Verify and select the Education track on the live submission form.
- [ ] Confirm repository visibility and final `main` commit.

The unchecked items require the submitter's recording, account, session ID, and Devpost access; they cannot be generated or submitted by the application itself.
