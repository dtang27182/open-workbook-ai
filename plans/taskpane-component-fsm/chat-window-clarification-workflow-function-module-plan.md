# Chat Window Clarification Workflow Function Module FIP

Status: implemented.

## Goal

Replace `ClarificationWorkflow` with stateless functions in the existing clarification workflow module.

## Scope

Export this entry point:

```ts
runClarificationWorkflow(
  state: ChatWindowState,
  processModelResponse: ProcessModelResponse,
  answer: string
): Promise<void>;
```

Convert `setupTransition()` and `performActions()` into unexported functions that receive `ChatWindowState`. Preserve pending-clarification lookup, active-sheet capture, transcript rendering, and response streaming.

Call `processModelResponse` with the original workflow's human message, existing workflow ID, and existing potential restore point. Do not depend on the submit workflow module.

## Verification

- Verify clarification reuses the current workflow ID and LLM history.
- Verify it passes the original request rather than the clarification answer to model-response processing.
- Verify another clarification, an answer, a diff, and a scenario remain supported.
