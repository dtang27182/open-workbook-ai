# Chat Window Restore Manager FIP

Status: implemented.

## Goal

Add a `RestoreManager` with exclusive ownership of restore points, potential restore points, and restore-point IDs. Workflows use the manager's operations instead of reading or mutating its collections directly. `RestoreWorkflow` remains responsible for performing the actual Excel and chat-state restoration.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-restore-manager.ts` and remove `chat-window-restore-point-helpers.ts` after moving its cloning functions into the manager.

Move these fields and operations from `ChatWindowState` into `RestoreManager`:

- `restorePoints`;
- `potentialRestorePoints`;
- `nextRestorePointId`;
- `createPotentialRestorePoint()`; and
- the existing `createRestorePoint()`, `copyChatState()`, `copyPendingEdit()`, and
  `copySheetSnapshot()` helpers from `chat-window-restore-point-helpers.ts`.

These four helpers become private implementation details used by `RestoreManager` to construct and copy restore snapshots. They do not give the manager ownership of the active chat state or general sheet operations.

Replace those fields on `ChatWindowState` with one readonly `restoreManager` instance. Do not move the current `chatState` into the manager.

## Interface

The manager exposes lifecycle operations rather than its collections:

```ts
export class RestoreManager {
  createPotentialRestorePoint(
    workflowId: number,
    chatState: ChatState,
    sheet: SheetSnapshot
  ): void;

  promotePotentialRestorePoint(workflowId: number): RestorePoint;
  discardPotentialRestorePoint(workflowId: number): void;

  getRestorePoint(restorePointId: number): RestorePoint;
  finalizeRestore(restorePointId: number): void;

  clearAllRestorePoints(): void;
}
```

Keep `restorePoints`, `potentialRestorePoints`, and `nextRestorePointId` private. Keep `createRestorePoint()`, `copyChatState()`, `copyPendingEdit()`, and `copySheetSnapshot()` private as well.

Copy the chat state and sheet once when creating a potential restore point. Return the stored restore point directly from lookup and promotion operations so long transcripts are not repeatedly copied. Callers treat returned restore points as read-only.

Continue allocating the ID when a potential restore point is created, and do not reset `nextRestorePointId` when restore history is cleared.

`finalizeRestore()` clears all potential restore points and removes the selected committed restore point and every point created after it. Keep this operation separate from `getRestorePoint()` so restore history is changed only after the external Excel restoration succeeds.

`clearAllRestorePoints()` clears committed and potential restore points without resetting `nextRestorePointId`.

## Integration

- `ChatWindow` and `PreprocessWorkflow` call `createPotentialRestorePoint()` with the current chat state and original sheet.
- Submit outcomes that do not retain a restore point call `discardPotentialRestorePoint()`.
- `AcceptDiffWorkflow` calls `promotePotentialRestorePoint()` after applying the edit. The promoted point returned by the manager is used both to add the restore divider and, when needed, to provide the original sheet for update analysis.
- `RejectDiffWorkflow` calls `discardPotentialRestorePoint()`.
- `RestoreWorkflow` calls `getRestorePoint(restorePointId)`, performs the existing diff-sheet deletion and sheet-formula write, replaces `state.chatState` with the saved chat-state snapshot, and then calls `finalizeRestore(restorePointId)`.
- `ChatWindow.reset()` calls `clearAllRestorePoints()`.

Do not move Excel operations or transcript rendering into `RestoreManager`. Those effects remain in their current workflows.

## Verification

- Verify no caller directly accesses restore-point arrays, maps, or the ID counter.
- Verify potential points are created, promoted, and discarded at the same transition points as today.
- Verify accepting a diff still uses the original sheet and inserts the same restore divider.
- Verify restoration still clears all potential points and removes the selected and later committed points.
- Verify a failed Excel restoration does not clear or truncate restore history.
- Verify clearing the chat does not reset the restore-point ID counter.
- Run lint, build, unit tests, and `git diff --check`.
