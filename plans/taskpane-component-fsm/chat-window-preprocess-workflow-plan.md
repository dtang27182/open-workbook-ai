# Chat Window Preprocess Workflow FIP

Status: implemented. The submit-message logic remains in `ChatWindow`.

## Goal

Move formula-preprocessing into `PreprocessWorkflow`, including its setup, streamed inference results, pending-diff transition, and continuation into normal submission.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-preprocess-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give the workflow the complete shared state and a callback to the existing `ChatWindow.runSubmitMessageWorkflow()` method.

Move these methods from `ChatWindow`:

- `runPreprocessWorkflow()` to public `run()`;
- `setupPreprocessTransition()`; and
- `finalizePreprocessTransition()`.

Continue using the existing formula-inference formatting functions and transcript helpers. Use the shared state operation for potential restore points, transcript lookup, and numbered diff-sheet creation.

## Integration

`ChatWindow.submitMessage()` continues deciding whether the active sheet requires preprocessing. It calls `preprocessWorkflow.run(message, workflowId)` when required.

When preprocessing produces edits, the workflow creates the pending diff and stops. When it produces no edits, it calls the supplied submit callback with the original human message, existing workflow ID, and `showHumanMessage` disabled.

The dependency remains one-way: preprocessing may call the submit logic retained by `ChatWindow`, while that submit logic does not call the preprocessing workflow.

## Verification

- Verify each sheet is marked preprocessed at the same point as today.
- Verify inference progress messages and formatted results render unchanged.
- Verify inferred edits create the same pending-diff state.
- Verify the no-edit path continues into normal submission without duplicating the human message.
- Run lint, build, unit tests, and `git diff --check`.
