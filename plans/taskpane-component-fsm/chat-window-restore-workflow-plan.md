# Chat Window Restore Workflow FIP

Status: proposed for review. Depends on the Chat Window Workflow Context FIP and does not authorize runtime changes yet.

## Goal

Move restoration to a saved point into `RestoreWorkflow` while preserving sheet restoration, pending-diff cleanup, chat-state replacement, and restore-history truncation.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-restore-workflow.ts` and update `chat-window.ts` to construct and call the workflow. Give it the complete shared context. It does not depend on another workflow class.

Move `restoreToPoint()` from `ChatWindow` to public `RestoreWorkflow.run(restorePointId)`.

## Integration

`ChatWindow.updateState()` calls `restoreWorkflow.run(event.restorePointId)` for `restore_to_point`. The workflow finds the selected restore point, deletes an outstanding diff sheet when necessary, restores the saved sheet formulas, clears potential restore points, replaces `context.chatState` with a copied snapshot, and truncates later restore points.

Because every workflow holds the same context object, replacing `context.chatState` remains visible to all workflow instances. Do not replace the context object itself.

## Verification

- Verify pending diff sheets are deleted before restoration.
- Verify the saved sheet formulas and copied chat state are restored unchanged.
- Verify potential and later restore points are cleared exactly as today.
- Verify all workflow instances observe the replacement `context.chatState`.
- Run lint, build, unit tests, and `git diff --check`.

