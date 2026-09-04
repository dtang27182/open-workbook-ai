# Chat Window Workflow Function Modules Plan

Status: implemented.

## Goal

Replace the six workflow classes with module-level functions. The functions keep no instance or module state; all mutable state is supplied explicitly through `ChatWindowState`.

These functions remain intentionally effectful: they update the supplied state and DOM and call Excel and LLM services.

## Target API

```ts
runSubmitMessageWorkflow(state, processModelResponse, message, workflowId, showHumanMessage);
runClarificationWorkflow(state, processModelResponse, answer);
runPreprocessWorkflow(state, processModelResponse, message, workflowId);
runAcceptDiffWorkflow(state, processModelResponse);
runRejectDiffWorkflow(state, processModelResponse);
runRestoreWorkflow(state, restorePointId);
```

Each workflow file exports only its main function. Existing private methods become unexported functions in the same file and receive `ChatWindowState` as their first argument.

## Integration

Remove all workflow instance fields and constructor calls from `ChatWindow`. Keep `processModelResponse` as a bound private function and pass it directly to workflows that can produce or continue a model response.

Preprocess, accept, and reject import `runSubmitMessageWorkflow()` directly for their continuation paths. Remove `RunSubmitMessageWorkflow` from `chat-window-state.ts`; `ProcessModelResponse` remains defined in `chat-window.ts`.

Implement the Submit Message FIP first, then Preprocess, Accept, and Reject, followed by Clarification and Restore. Preserve all current effect ordering and run lint, build, unit tests, and `git diff --check` after the full migration.
