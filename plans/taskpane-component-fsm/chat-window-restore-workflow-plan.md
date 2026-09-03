# Chat Window Restore Workflow FIP

Status: implemented.

## Goal

Move restoration to a saved point into `RestoreWorkflow` while preserving sheet restoration, pending-diff cleanup, chat-state replacement, and restore-history truncation.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-restore-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give it the complete shared state. It does not depend on another workflow class.

Move `restoreToPoint()` from `ChatWindow` to public `RestoreWorkflow.run(restorePointId)`.

## Integration

`ChatWindow.updateState()` calls `restoreWorkflow.run(event.restorePointId)` for `restore_to_point`. The workflow gets the selected restore point from `RestoreManager`, deletes an outstanding diff sheet when necessary, restores the saved sheet formulas, replaces `state.chatState` with the saved chat-state snapshot, and asks the manager to finalize the restore. Finalization clears potential restore points and removes the selected and later committed restore points.

Because every workflow holds the same state object, replacing `state.chatState` remains visible to all workflow instances. Do not replace the state object itself.

## Verification

- Verify pending diff sheets are deleted before restoration.
- Verify the saved sheet formulas and copied chat state are restored unchanged.
- Verify potential and later restore points are cleared exactly as today.
- Verify all workflow instances observe the replacement `state.chatState`.
- Run lint, build, unit tests, and `git diff --check`.
