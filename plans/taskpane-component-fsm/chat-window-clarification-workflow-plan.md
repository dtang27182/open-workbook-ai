# Chat Window Clarification Workflow FIP

Status: proposed for review. Depends on the Chat Window State and Submit Message Workflow FIPs and does not authorize runtime changes yet.

## Goal

Move the clarification-response call path into `ClarificationWorkflow` while retaining the shared submit-response finalization behavior.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-clarification-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give the workflow the complete shared state and the existing `SubmitMessageWorkflow` instance.

Move these methods from `ChatWindow`:

- `continueClarification()` to public `run()`;
- `setupClarificationResponseTransition()`; and
- `performClarificationResponseActions()`.

## Integration

When `ChatWindow.submitMessage()` sees `awaiting_clarification`, it calls `clarificationWorkflow.run(message)`. The workflow reads the pending clarification call, captures the active sheet, streams the response, and delegates final response handling to `SubmitMessageWorkflow`.

Do not duplicate submit finalization or make `SubmitMessageWorkflow` depend on `ClarificationWorkflow`. This keeps the dependency one-way and avoids a workflow-construction cycle.

## Verification

- Verify clarification answers reuse the existing workflow ID and conversation history.
- Verify streamed clarification responses and working-state changes remain unchanged.
- Verify clarification can produce another question, a direct answer, a diff, or a scenario.
- Run lint, build, unit tests, and `git diff --check`.
