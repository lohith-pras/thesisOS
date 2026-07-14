# ThesisOS submission demo

## One-command setup

```bash
npm run app -- --demo
```

Open `http://127.0.0.1:4173`.

## Under-three-minute recording script

1. **Problem (0:00–0:20):** Supervisor feedback is unstructured, paper titles rarely match its wording, and autonomous research tools can write without a traceable approval boundary.
2. **Feedback and Codex (0:20–0:50):** Paste a realistic supervisor email. Show Codex CLI decomposition into a validated task graph. Mention the visible deterministic fallback for judge machines without Codex.
3. **Grounded retrieval (0:50–1:20):** Approve the literature task and search the fixture or live Zotero library. Point out retrieval mode, match score, and stable source ID.
4. **Evidence boundary (1:20–1:45):** Select one or two reviewed papers and attach them. Explain that only selected stable source IDs can enter drafting.
5. **Grounded drafting (1:45–2:05):** Draft the note and show its source-ID citations and provider label.
6. **Trust payoff (2:05–2:20):** Show that an unapproved task cannot search and an unknown citation invalidates a draft. Judge mode also stops before filesystem writing.
7. **GPT-5.6 build proof (2:20–2:45):** Show the primary Codex task, feedback receipt, one implementation diff, and the passing test result. State that Codex with GPT-5.6 built the submitted project; the optional runtime API adapter is separate.
8. **Why it matters (2:45–2:55):** Name the category: research change control, not another text generator.
9. **Close (2:55–3:00):** “ThesisOS: evidence before AI writing.”

## Required capture checklist

- [x] README hero GIF showing feedback → approval → retrieval → grounded preview (`docs/assets/thesisos-hero.gif`).
- [x] Screenshot: task graph from messy supervisor feedback (`docs/assets/judge-task-approval.png`).
- [x] Screenshot: judge retrieval results with abstract coverage, threshold, fallback mode, and match provenance (`docs/assets/judge-retrieval.png`).
- [x] Screenshot: grounded note with stable source-ID citations (`docs/assets/judge-grounded-note.png`).
- [ ] Screenshot/video moment: rejected task cannot search (include during the narrated recording).
- [x] GPT-5.6 build feedback receipt preserved (`docs/assets/codex-feedback-receipt.png`).
- [ ] Upload `docs/assets/thesisos-demo.mp4` as a public YouTube video under three minutes.
- [x] Main Codex GPT-5.6 build and `/feedback` ID verified: `019f5cc1-08be-7071-a5ea-220a8de0f313`.
- [x] Real Chrome judge workflow verified with `npm run test:browser`, including canonical reload recovery.
- [x] Education track verified on the [official Build Week page](https://openai.devpost.com/); select it on the authenticated submission form.
- [ ] Confirm repository visibility and final `main` commit.

The unchecked items require the submitter's recording, account, session ID, and Devpost access; they cannot be generated or submitted by the application itself.
