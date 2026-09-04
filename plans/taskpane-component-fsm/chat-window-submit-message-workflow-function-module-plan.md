# Chat Window Submit Message Workflow Function Module FIP

Status: proposed for review. This plan does not authorize runtime changes yet.

## Goal

Replace `SubmitMessageWorkflow` with stateless functions in the existing submit-message workflow module.

## Scope

Export this entry point:

```ts
runSubmitMessageWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  message: string,
  workflowId: number,
  showHumanMessage?: boolean
): Promise<void>;
```

Convert `gatherInputs()`, `setupTransition()`, and `performActions()` into unexported functions that receive `ChatWindowState`. Preserve potential-restore-point creation, transcript rendering, streaming, and the final call to `processModelResponse`.

Update `ChatWindow` and continuation modules to import this function instead of constructing or receiving a workflow instance.

## Verification

- Verify the function preserves the current message, workflow ID, and `showHumanMessage` behavior.
- Verify response streaming and potential restore-point creation remain unchanged.
- Verify `processModelResponse` is called once after the working item is removed.
