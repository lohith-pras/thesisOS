# Proofline submission demo

## One-command setup

```bash
npm run app -- --demo
```

Open `http://127.0.0.1:4173`.

## Under-three-minute recording script

1. **Hook (0:00–0:13):** On Overview, show the **DEMO SESSION · ISOLATED DATA** label and say that supervisor feedback identifies a problem, not the paper that proves it.
2. **Repeatable proof (0:13–0:25):** Click **Show completed proof**. State that the labelled deterministic fixture requires no credentials and cannot write files.
3. **Grounded evidence note (0:25–0:46):** Show the Evidence Brief, synthesis, and selected fixture source cards. State that the real workflow admits only researcher-selected Zotero evidence, and that a real vault write needs separate approval.
4. **Claim Traceback (0:46–1:10):** Click **Trace source 1**. Show its draft statement → selected paper → approved task → original feedback path.
5. **Visible citation rejection (1:10–1:38):** Click **Test an unselected citation** and hold on the full **DEMO PROOF · CITATION CHECK** panel. State precisely: “The invalid draft is rejected; the existing valid preview is unchanged; no file write is attempted.”
6. **Authority boundary (1:38–1:55):** Show that judge mode stops at preview. Explain that the check verifies selected-source enforcement, not the truth of a paper’s findings.
7. **Reviewer outcome (1:55–2:12):** Open the Revision Response Matrix from Overview and show comment → approved task → selected evidence → grounded-note status.
8. **Local-first integrations (2:12–2:23):** Briefly show Connections: Zotero is read-only, Obsidian needs write approval, and Overleaf is URL-only.
9. **Build proof and close (2:23–2:40):** Show the GPT-5.6 Codex feedback receipt and passing test result, then return to the citation-proof panel. Close: “Chat tools generate text. Proofline generates proof: evidence before AI writing.”

## Required capture checklist

- [x] README hero GIF showing feedback → approval → retrieval → grounded preview (`docs/assets/thesisos-hero.gif`).
- [x] Screenshot: task graph from messy supervisor feedback (`docs/assets/judge-task-approval.png`).
- [x] Screenshot: judge retrieval results with abstract coverage, threshold, fallback mode, and match provenance (`docs/assets/judge-retrieval.png`).
- [x] Screenshot: grounded note with stable source-ID citations (`docs/assets/judge-grounded-note.png`).
- [x] Screenshot: Claim Traceback showing a source note → evidence → task → feedback (`docs/assets/judge-claim-traceback.png`).
- [ ] Screenshot/video moment: Revision Response Matrix downloaded from the canonical workflow.
- [x] Screenshot: unselected citation refused before preview (`docs/assets/judge-citation-rejection.png`).
- [x] GPT-5.6 build feedback receipt preserved (`docs/assets/codex-feedback-receipt.png`).
- [ ] Upload `docs/assets/thesisos-demo.mp4` as a public YouTube video under three minutes.
- [x] Main Codex GPT-5.6 build and `/feedback` ID verified: `019f5cc1-08be-7071-a5ea-220a8de0f313`.
- [x] Real Chrome judge workflow verified with `npm run test:browser`, including canonical reload recovery.
- [x] Education track verified on the [official Build Week page](https://openai.devpost.com/); select it on the authenticated submission form.
- [ ] Confirm repository visibility and final `main` commit.

The unchecked items require the submitter's recording, account, session ID, and Devpost access; they cannot be generated or submitted by the application itself.
