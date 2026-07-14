/**
 * Ports the app server to either the production workspace or the isolated
 * judge/demo workspace. Route handlers ask for capabilities instead of
 * carrying demo-specific conditionals across persistence and generation.
 */
export function createWorkflowRuntime({
  judgeMode = false,
  statePath,
  accessState,
  loadStateFile,
  saveStateFile,
  createDemoState,
  demoLibrary,
  decomposeDemo,
  searchDemo,
  draftDemo
}) {
  if (!judgeMode) return {
    kind: "production",
    capabilities: { restartDemo: false, inspectVault: true, writeVault: true },
    async stateExists() { try { await accessState(statePath); return true; } catch { return false; } },
    loadState: () => loadStateFile(statePath),
    saveState: (state) => saveStateFile(statePath, state),
    library: () => null,
    restart: null,
    decompose: null,
    search: null,
    draft: null
  };

  let state = createDemoState();
  return {
    kind: "judge",
    capabilities: { restartDemo: true, inspectVault: false, writeVault: false },
    async stateExists() { return true; },
    async loadState() { return state; },
    async saveState(next) { state = next; return state; },
    library: () => demoLibrary(),
    async restart() { state = createDemoState(); return state; },
    decompose: (feedback, options) => decomposeDemo(feedback, options),
    search: (taskGraph, options) => searchDemo(taskGraph, options),
    draft: (feedback, evidenceRefs) => draftDemo(feedback, evidenceRefs)
  };
}
