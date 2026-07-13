export function createThesisState({ project, feedback, taskGraph }) {
  return {
    schemaVersion: 1,
    project,
    privacy: {
      mode: "local-first",
      approvalRequiredForWrites: true,
      note: "Only user-approved excerpts should be sent to model providers."
    },
    thesis: {
      chapters: [
        { id: "chapter-3", title: "Methodology", status: "needs_revision" }
      ],
      literature: { read: 0, unread: 1 },
      experiments: { pending: 1, completed: 0 }
    },
    feedbackThreads: [
      {
        id: "thread-001",
        title: "Supervisor feedback thread",
        status: "in_progress",
        feedback,
        tasks: taskGraph.tasks.map(({ id, title, tool, status, approvalStatus, reviewedAt, dependsOn = [] }) => ({
          id, title, tool, status, approvalStatus, ...(reviewedAt ? { reviewedAt } : {}), dependsOn
        }))
      }
    ]
  };
}
