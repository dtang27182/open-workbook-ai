# Chat Window Submit Message Workflow FIP

Status: implemented.

## Goal

Move the normal submit-message call path into `SubmitMessageWorkflow` while preserving its streaming UI, state transitions, restore-point behavior, diff creation, and scenario comparison behavior.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-submit-message-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Use the complete `ChatWindowState`; do not define a narrower state type.

Move these methods from `ChatWindow`:

- `runSubmitMessageWorkflow()` to public `run()`;
- `gatherSubmitInputs()`;
- `setupSubmitTransition()`;
- `performSubmitActions()`;
- `finalizeSubmitTransition()` to a method callable by `ClarificationWorkflow`;
- `createNextScenarioSheet()`; and
- `createScenarioWithComparison()`.

Continue using `ChatWindowState.createNextDiffSheet()` because submit and preprocessing share numbered diff-sheet creation. Keep the scenario-sheet creation method in this workflow; it updates `nextScenarioSheetNumber` through the shared state.

## Integration

Construct one `SubmitMessageWorkflow` with the shared state before constructing `PreprocessWorkflow`, `AcceptDiffWorkflow`, `RejectDiffWorkflow`, or `ClarificationWorkflow`. `ChatWindow.submitMessage()` retains top-level routing between clarification, preprocessing, and normal submission, then calls `submitMessageWorkflow.run()` for the normal path.

Give `SubmitMessageWorkflow.run()` the existing `(message, workflowId, showHumanMessage)` parameters. Replace the callback that currently delegates to `ChatWindow.runSubmitMessageWorkflow()` with one that delegates to `submitMessageWorkflow.run()`, and continue supplying that callback to preprocessing and the accept/reject continuation paths.

The workflow directly mutates the shared state and calls the existing transcript/DOM helpers. It must not call `ChatWindow.updateState()` or retain per-run data after `run()` completes.

Use `state.restoreManager` to create and discard potential restore points at the same transition points as the current implementation. Expose the existing response-finalization operation to `ClarificationWorkflow` without duplicating it. Preserve the current branches for clarification requests, answers, scenario creation, and pending diffs.

## Verification

- Verify streamed partial responses and working messages render in the same order.
- Verify answer, clarification, diff, and scenario branches produce the same state.
- Verify restore points and numbered sheets use the same IDs and names.
- Verify preprocessing and accept/reject continuation callbacks invoke `SubmitMessageWorkflow.run()` with the same message, workflow ID, and `showHumanMessage` value as today.
- Run lint, build, unit tests, and `git diff --check`.
