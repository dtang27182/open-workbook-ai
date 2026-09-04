# Chat Window Clarification Workflow FIP

Status: implemented.

## Goal

Move clarification prompt setup and streaming into `ClarificationWorkflow` while handing the completed model response back to `ChatWindow` for processing.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-clarification-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give the workflow the complete shared state and the same callback to `ChatWindow.processModelResponse()` used by `SubmitMessageWorkflow`.

Move these methods from `ChatWindow`:

- `continueClarification()` to public `run()`;
- `setupClarificationResponseTransition()`; and
- `performClarificationResponseActions()`.

## Integration

When `ChatWindow.submitMessage()` sees `awaiting_clarification`, it calls `clarificationWorkflow.run(message)`. The workflow reads the pending clarification call, captures the active sheet, streams the response, and calls the supplied model-response callback.

Pass the original workflow's human message from `getWorkflowHumanMessage()`, not the clarification answer, into model-response processing. Scenario comparison uses that original request. Reuse the potential restore point created by the original submission; clarification must not create another restore point. `ChatWindow.processModelResponse()` retains or discards that point according to the response branch.

Do not duplicate model-response processing in this workflow. `SubmitMessageWorkflow` and `ClarificationWorkflow` do not depend on each other.

## Verification

- Verify clarification answers reuse the existing workflow ID and conversation history.
- Verify model-response processing receives the original workflow's human message.
- Verify clarification reuses the existing potential restore point without allocating another one.
- Verify streamed clarification responses and working-state changes remain unchanged.
- Verify clarification can produce another question, a direct answer, a diff, or a scenario.
- Run lint, build, unit tests, and `git diff --check`.
