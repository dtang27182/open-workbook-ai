# Chat Window Accept Diff Workflow Function Module FIP

Status: implemented.

## Goal

Replace `AcceptDiffWorkflow` with stateless functions in the existing accept-diff workflow module.

## Scope

Export this entry point:

```ts
runAcceptDiffWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse
): Promise<void>;
```

Convert `setup()`, `performActions()`, `finalize()`, and `appendUpdateAnalysis()` into unexported functions that receive `ChatWindowState`. Import `runSubmitMessageWorkflow()` directly for accepted-preprocessing continuation and forward `processModelResponse` to it.

Preserve diff application and deletion, restore-point promotion, restore-divider insertion, update analysis, and continuation ordering.

## Verification

- Verify normal accepted edits still run update analysis.
- Verify accepted preprocessing continues the original request without duplicating its human message.
- Verify the promoted restore point and transcript divider remain unchanged.
