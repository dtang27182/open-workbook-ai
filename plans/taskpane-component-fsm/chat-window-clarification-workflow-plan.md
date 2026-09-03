# Chat Window Clarification Workflow FIP

Status: implemented.

## Goal

Move the clarification-response call path into `ClarificationWorkflow` while retaining the shared submit-response finalization behavior.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-clarification-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give the workflow the complete shared state and the existing `SubmitMessageWorkflow` instance. Construct `SubmitMessageWorkflow` first so the dependency remains one-way.

Move these methods from `ChatWindow`:

- `continueClarification()` to public `run()`;
- `setupClarificationResponseTransition()`; and
- `performClarificationResponseActions()`.

## Integration

When `ChatWindow.submitMessage()` sees `awaiting_clarification`, it calls `clarificationWorkflow.run(message)`. The workflow reads the pending clarification call, captures the active sheet, streams the response, and calls the public `SubmitMessageWorkflow.finalizeSubmitTransition()` method.

Pass the original workflow's human message from `getWorkflowHumanMessage()`, not the clarification answer, into submit finalization. Scenario comparison uses that original request. Reuse the potential restore point created by the original submission; clarification must not create another restore point. Submit finalization continues to retain or discard that point according to the response branch.

Do not duplicate submit finalization or make `SubmitMessageWorkflow` depend on `ClarificationWorkflow`. This keeps the dependency one-way and avoids a workflow-construction cycle.

## Verification

- Verify clarification answers reuse the existing workflow ID and conversation history.
- Verify finalization receives the original workflow's human message.
- Verify clarification reuses the existing potential restore point without allocating another one.
- Verify streamed clarification responses and working-state changes remain unchanged.
- Verify clarification can produce another question, a direct answer, a diff, or a scenario.
- Run lint, build, unit tests, and `git diff --check`.
