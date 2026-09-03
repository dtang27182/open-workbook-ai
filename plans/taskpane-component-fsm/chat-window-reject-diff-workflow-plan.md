# Chat Window Reject Diff Workflow FIP

Status: implemented.

## Goal

Move the complete reject-pending-diff call path into `RejectDiffWorkflow`, including diff deletion, transcript updates, state cleanup, and preprocessing continuation.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-reject-diff-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give it the complete shared state and a callback to `SubmitMessageWorkflow.run()`.

Move these methods from `ChatWindow`:

- `rejectPendingDiff()` to public `run()`;
- `setupRejectPendingDiff()`;
- `performRejectPendingDiffActions()`; and
- `finalizeRejectPendingDiff()`.

## Integration

`ChatWindow.updateState()` calls `rejectDiffWorkflow.run()` for `reject_pending_diff`. The workflow removes the review controls, deletes the diff sheet, clears the pending edit and potential restore point, and records the rejection in transcript and LLM history.

When a rejected preprocessing diff must continue the original request, call the supplied submit callback with the existing workflow ID and without duplicating the human message. Keep the dependency one-way.

## Verification

- Verify the diff sheet and potential restore point are removed unchanged.
- Verify the pending edit and FSM state are cleared at the same point.
- Verify rejection messages are appended to transcript and LLM history.
- Verify rejected preprocessing continues into normal submission.
- Run lint, build, unit tests, and `git diff --check`.
