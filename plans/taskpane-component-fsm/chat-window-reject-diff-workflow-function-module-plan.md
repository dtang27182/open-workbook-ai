# Chat Window Reject Diff Workflow Function Module FIP

Status: implemented.

## Goal

Replace `RejectDiffWorkflow` with stateless functions in the existing reject-diff workflow module.

## Scope

Export this entry point:

```ts
runRejectDiffWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse
): Promise<void>;
```

Convert `setup()`, `performActions()`, and `finalize()` into unexported functions that receive `ChatWindowState`. Import `runSubmitMessageWorkflow()` directly for rejected-preprocessing continuation and forward `processModelResponse` to it.

Remove the `RunSubmitMessageWorkflow` constructor callback without changing diff deletion, potential-restore-point disposal, transcript updates, or LLM history.

## Verification

- Verify rejection clears the pending edit and potential restore point at the same time as today.
- Verify rejected preprocessing continues the original request without duplicating its human message.
- Verify rejection transcript and LLM-history messages remain unchanged.
