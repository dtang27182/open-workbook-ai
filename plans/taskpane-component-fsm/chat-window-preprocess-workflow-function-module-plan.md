# Chat Window Preprocess Workflow Function Module FIP

Status: implemented.

## Goal

Replace `PreprocessWorkflow` with stateless functions in the existing preprocessing workflow module.

## Scope

Export this entry point:

```ts
runPreprocessWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  message: string,
  workflowId: number
): Promise<void>;
```

Convert `setupTransition()` and `finalizeTransition()` into unexported functions that receive `ChatWindowState`. Import `runSubmitMessageWorkflow()` directly for the no-edit continuation path and forward `processModelResponse` to it.

Remove the `RunSubmitMessageWorkflow` constructor callback without changing preprocessing, diff creation, or transcript behavior.

## Verification

- Verify inferred edits still transition to `pending_edit_preprocessed`.
- Verify the no-edit path continues submission with the same workflow ID and without duplicating the human message.
- Verify restore-point and preprocessed-sheet tracking remain unchanged.
