# Motion Feedback Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ThesisOS async feedback calm and singular, and let task modals close with a short, accessible reciprocal transition.

**Architecture:** Replace the shared nine-dot animated indicator with a static status marker while retaining the existing global activity strip and its live-region copy. Centralize modal dismissal in one helper that immediately removes the dialog for reduced-motion users and otherwise applies a closing class before removing it after the exit transition completes.

**Tech Stack:** Vanilla ES modules, DOM rendering with `innerHTML`, CSS custom properties/media queries, Node’s built-in test runner.

## Global Constraints

- Preserve the current `prefers-reduced-motion: reduce` behavior; modal close must be immediate for that preference.
- Do not add dependencies or a JavaScript animation library.
- Keep routine workspace navigation and task-row changes instantaneous.
- Do not create a new audit artifact or change the landing page.
- Update the existing source-contract tests in `test/app-server.test.mjs` when their asserted implementation markers change.
- Make one focused commit per task; stage only the files named in that task.

---

## File Structure

- `app/app.js`: Owns activity-strip markup, profile-card loading markup, modal creation, and all modal dismissal call sites.
- `app/styles.css`: Owns the static activity marker and the modal’s closing-state transition; it already owns the reduced-motion rule.
- `test/app-server.test.mjs`: Contains static frontend contracts that assert the activity and modal implementation markers used by the app shell.

### Task 1: Replace animated waiting dots with a quiet static marker

**Files:**

- Modify: `app/app.js:63, 102–119` (current profile-card, global, and section activity markup)
- Modify: `app/styles.css:19–20` (current `.activity-dots`, `@keyframes activity-dot`, and activity layouts)
- Test: `test/app-server.test.mjs:547–572`

**Interfaces:**

- Consumes: `state.activity.status`, `state.activity.label`, and `state.activity.detail` from the existing activity state.
- Produces: `<span class="activity-marker" aria-hidden="true"></span>` for all active async-status renderers.
- Removes: `.activity-dots`, inline `--dot-index` styles, and `@keyframes activity-dot`.

- [ ] **Step 1: Write the failing source-contract test**

  Replace the activity-indicator assertions with the exact expected contract:

  ```js
  test("frontend uses a single quiet marker for async activity", async () => {
    const source = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
    const styles = await readFile(new URL("../app/styles.css", import.meta.url), "utf8");

    assert.match(source, /activity-marker/);
    assert.doesNotMatch(source, /activity-dots/);
    assert.doesNotMatch(styles, /@keyframes activity-dot/);
    assert.doesNotMatch(styles, /animation:activity-dot/);
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  node --test test/app-server.test.mjs --test-name-pattern="quiet marker"
  ```

  Expected: FAIL because `activity-marker` is not yet rendered and `activity-dots` still exists.

- [ ] **Step 3: Make the minimal markup changes**

  In `app/app.js`, add this helper alongside the existing rendering helpers:

  ```js
  function activityMarker() {
    return '<span class="activity-marker" aria-hidden="true"></span>';
  }
  ```

  In `profileCardLoading()`, `activityStrip()`, and `sectionActivity()`, replace every active-state nine-dot template with:

  ```js
  activityMarker()
  ```

  Keep the existing success and error `.activity-mark` output, live-region attributes, labels, and detail text unchanged.

- [ ] **Step 4: Make the minimal CSS changes**

  Replace the animated-dot rules with this static marker rule and preserve the surrounding layout rules:

  ```css
  .activity-marker {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    border: 1.5px solid var(--accent);
    border-radius: 50%;
  }
  ```

  Delete `@keyframes activity-dot` and the `.activity-dots`, `.activity-dots i`, and `.section-activity .activity-dots` declarations. Do not add a replacement animation.

- [ ] **Step 5: Run focused verification**

  Run:

  ```bash
  node --test test/app-server.test.mjs --test-name-pattern="quiet marker"
  npm run check:frontend
  ```

  Expected: both commands pass.

- [ ] **Step 6: Commit the focused change**

  ```bash
  git add app/app.js app/styles.css test/app-server.test.mjs
  git commit -m "style: simplify async activity feedback"
  ```

### Task 2: Centralize accessible task-modal dismissal and animate the exit

**Files:**

- Modify: `app/app.js:356–368, 544–561, 594` (task modal and current direct removal paths)
- Modify: `app/styles.css:2, 6–8` (modal visual rules, `modal-in`, and reduced-motion handling)
- Test: `test/app-server.test.mjs:517–536`

**Interfaces:**

- Consumes: `.modal-backdrop` DOM node and the browser’s `prefers-reduced-motion` media query.
- Produces: `closeTaskModal()` that is safe to call repeatedly and removes the dialog after its ordinary-motion exit completes.
- CSS contract: `.modal-backdrop.is-closing` and `.modal-backdrop.is-closing .task-modal` encode the final exit state.

- [ ] **Step 1: Write the failing source-contract test**

  Add this test beside the existing body-level modal delegation contract:

  ```js
  test("frontend closes task modals through one reduced-motion-aware helper", async () => {
    const source = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
    const styles = await readFile(new URL("../app/styles.css", import.meta.url), "utf8");

    assert.match(source, /function closeTaskModal\(\)/);
    assert.match(source, /prefers-reduced-motion: reduce/);
    assert.match(source, /closeTaskModal\(\)/);
    assert.match(styles, /\.modal-backdrop\.is-closing/);
    assert.match(styles, /\.modal-backdrop\.is-closing \.task-modal/);
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  node --test test/app-server.test.mjs --test-name-pattern="reduced-motion-aware helper"
  ```

  Expected: FAIL because neither `closeTaskModal()` nor the closing CSS state exists.

- [ ] **Step 3: Add the modal helper**

  Add this function directly before `openTask()` in `app/app.js`:

  ```js
  function closeTaskModal() {
    const modal = document.querySelector(".modal-backdrop");
    if (!modal || modal.dataset.closing === "true") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      modal.remove();
      return;
    }

    modal.dataset.closing = "true";
    modal.classList.add("is-closing");
    const remove = () => modal.remove();
    modal.addEventListener("transitionend", (event) => {
      if (event.target === modal) remove();
    }, { once: true });
    window.setTimeout(remove, 180);
  }
  ```

  Replace each direct `document.querySelector(".modal-backdrop")?.remove()` in approval success, approval failure, search start, and `[data-close-modal]` click handling with `closeTaskModal()`.

- [ ] **Step 4: Add the modal exit CSS**

  Preserve the current 180ms `modal-in` entry animation. Add a closing transition whose duration is shorter than the enter:

  ```css
  .modal-backdrop {
    transition: opacity 140ms var(--ease-out);
  }

  .task-modal {
    transition: transform 140ms var(--ease-out), opacity 140ms var(--ease-out);
  }

  .modal-backdrop.is-closing {
    opacity: 0;
  }

  .modal-backdrop.is-closing .task-modal {
    opacity: 0;
    transform: translateY(-3px) scale(.99);
  }
  ```

  Keep the existing `@media (prefers-reduced-motion: reduce)` global transition override. The JavaScript media-query branch guarantees that no delayed removal occurs for reduced-motion users.

- [ ] **Step 5: Run focused verification**

  Run:

  ```bash
  node --test test/app-server.test.mjs --test-name-pattern="modal"
  npm run check:frontend
  ```

  Expected: both commands pass. The modal test proves every close trigger routes through the helper; `check:frontend` confirms the browser script parses.

- [ ] **Step 6: Run the complete regression suite**

  Run:

  ```bash
  npm test
  npm run check
  ```

  Expected: all existing tests and syntax checks pass.

- [ ] **Step 7: Commit the focused change**

  ```bash
  git add app/app.js app/styles.css test/app-server.test.mjs
  git commit -m "style: add accessible task modal exit"
  ```

## Self-Review

- **Spec coverage:** Task 1 removes the repeated continuous loading animation in every current renderer, including profile-card loading; Task 2 handles every direct task-modal removal path with a shorter reciprocal exit and an immediate reduced-motion fallback.
- **No-change scope:** The plan deliberately leaves landing-page motion and high-frequency navigation instant. It does not add a library, change workflow semantics, or produce another audit HTML file.
- **Plan completeness:** The helper name, CSS selectors, tests, commands, and expected outcomes are specified in the tasks.
- **Consistency:** Tests reference the exact `activity-marker`, `closeTaskModal()`, and `.is-closing` identifiers introduced by the implementation tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-motion-feedback-polish.md`.

Two execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh subagent for each task and review between tasks.
2. **Inline Execution:** execute the tasks in this session with checkpoints.
