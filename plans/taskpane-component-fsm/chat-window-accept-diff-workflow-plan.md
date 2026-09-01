# Chat Window Accept Diff Workflow FIP

Status: proposed for review. Depends on the Workflow Context and Submit Message Workflow FIPs and does not authorize runtime changes yet.

## Goal

Move the complete accept-pending-diff call path into `AcceptDiffWorkflow`, including applying formulas, promoting the restore point, optional update analysis, and preprocessing continuation.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-accept-diff-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give it the complete shared context and the existing `SubmitMessageWorkflow` instance.

Move these methods from `ChatWindow`:

- `acceptPendingDiff()` to public `run()`;
- `setupAcceptPendingDiff()`;
- `performAcceptPendingDiffActions()`;
- `finalizeAcceptPendingDiff()`; and
- `appendUpdateAnalysis()`.

## Integration

`ChatWindow.updateState()` calls `acceptDiffWorkflow.run()` for `accept_pending_diff`. The workflow reads the pending edit from the shared context, updates the transcript, applies and deletes the diff sheet, promotes the potential restore point, and updates the FSM state.

Keep update analysis as a private part of this workflow because it only follows accepted normal edits. When an accepted preprocessing diff must continue the original request, call `SubmitMessageWorkflow.run()` with the existing workflow ID and without duplicating the human message.

## Verification

- Verify formulas are applied and the diff sheet is deleted in the same order.
- Verify the potential restore point is promoted and its restore divider is inserted unchanged.
- Verify accepted preprocessing continues into normal submission.
- Verify normal accepted edits still run update analysis and append it to transcript and LLM history.
- Run lint, build, unit tests, and `git diff --check`.

