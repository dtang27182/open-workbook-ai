# Chat Window Restore Workflow Function Module FIP

Status: proposed for review. This plan does not authorize runtime changes yet.

## Goal

Replace `RestoreWorkflow` with a module-level function in the existing restore workflow module.

## Scope

Export this entry point:

```ts
runRestoreWorkflow(state: ChatWindowState, restorePointId: number): Promise<void>;
```

Remove the class and constructor. Keep restore-point retrieval and finalization in `RestoreManager`, and preserve pending-diff deletion, formula restoration, and `state.chatState` replacement in the workflow function.

## Verification

- Verify pending diff sheets are deleted before formulas are restored.
- Verify the saved chat state and formulas are restored unchanged.
- Verify restore history is finalized only after Excel restoration succeeds.
