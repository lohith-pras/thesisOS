# ThesisOS submission demo

## One-command setup

```bash
npm run app -- --demo
```

Open `http://127.0.0.1:4173`.

## Under-three-minute recording script

1. **Problem and thesis context (0:00–0:25):** Open the Profile view. Show the demo thesis: workplace EV charging flexibility for distribution-grid congestion management, its two objectives, focused scope, and literature stage. State that the demo library contains real publication metadata, but is clearly labelled fixture data.
2. **Feedback choices (0:25–0:45):** On Overview, show the three demo choices: vague framing, challenge a claim, and test feasibility. Choose **Challenge a claim** to demonstrate a reviewer asking the student to qualify an over-strong statement.
3. **Bounded tasks (0:45–1:05):** Generate tasks. Show that judge mode proposes only the two available workflow steps: read-only Zotero evidence review and an Obsidian evidence note—no simulated thesis-repository task.
4. **Grounded retrieval (1:05–1:30):** Approve the literature task and search the smart-EV-charging fixture. Point out the match reason, DOI, and stable source ID.
5. **Evidence boundary (1:30–1:50):** Select two papers with contrasting evidence and attach them. Explain that only selected stable source IDs can enter drafting.
6. **Readable evidence note and Claim Traceback (1:50–2:20):** Draft the note. Show the evidence-note review view: original feedback, synthesis, individual source cards, and expandable raw Markdown. Click Claim Traceback and show source note → selected Zotero evidence → approved task → original feedback.
7. **Trust payoff and matrix (2:20–2:40):** Mention that judge mode stops before filesystem writing, then download the Revision Response Matrix. Show comment → task → selected source IDs → grounded-note status.
8. **GPT-5.6 build proof (2:30–2:50):** Show the primary Codex task, feedback receipt, one implementation diff, and the passing test result. State that Codex with GPT-5.6 built the submitted project; the optional runtime API adapter is separate.
9. **Close (2:50–3:00):** “ChatGPT gives you text. ThesisOS gives you proof: every comment traceable, every citation from a paper you approved.”

## Required capture checklist

- [x] README hero GIF showing feedback → approval → retrieval → grounded preview (`docs/assets/thesisos-hero.gif`).
- [x] Screenshot: task graph from messy supervisor feedback (`docs/assets/judge-task-approval.png`).
- [x] Screenshot: judge retrieval results with abstract coverage, threshold, fallback mode, and match provenance (`docs/assets/judge-retrieval.png`).
- [x] Screenshot: grounded note with stable source-ID citations (`docs/assets/judge-grounded-note.png`).
- [ ] Screenshot/video moment: Claim Traceback showing a source note → evidence → task → feedback.
- [ ] Screenshot/video moment: Revision Response Matrix downloaded from the canonical workflow.
- [ ] Screenshot/video moment: rejected task cannot search (include during the narrated recording).
- [x] GPT-5.6 build feedback receipt preserved (`docs/assets/codex-feedback-receipt.png`).
- [ ] Upload `docs/assets/thesisos-demo.mp4` as a public YouTube video under three minutes.
- [x] Main Codex GPT-5.6 build and `/feedback` ID verified: `019f5cc1-08be-7071-a5ea-220a8de0f313`.
- [x] Real Chrome judge workflow verified with `npm run test:browser`, including canonical reload recovery.
- [x] Education track verified on the [official Build Week page](https://openai.devpost.com/); select it on the authenticated submission form.
- [ ] Confirm repository visibility and final `main` commit.

The unchecked items require the submitter's recording, account, session ID, and Devpost access; they cannot be generated or submitted by the application itself.
