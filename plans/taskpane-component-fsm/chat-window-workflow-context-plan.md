# Chat Window Workflow Context FIP

Status: proposed for review. This is the prerequisite for extracting the ChatWindow workflow classes and does not authorize runtime changes yet.

## Goal

Create one mutable `ChatWindowWorkflowContext` shared by every workflow class. The context makes the existing coupling explicit and allows workflow methods to move without large parameter lists or callbacks into `ChatWindow`.

Workflows run sequentially and are not interleaved. Do not add locking, workflow IDs for concurrency control, immutable state snapshots, or narrowed `Pick<ChatWindowWorkflowContext, ...>` types.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-workflow-context.ts` and update `src/taskpane-fsm/pages/chat/chat-window.ts` to use it. Do not move any workflow methods in this FIP.

## Context

Define a class containing the current ChatWindow dependencies and mutable workflow state:

```ts
export class ChatWindowWorkflowContext {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelApi: ExcelApi;

  chatState: ChatState;
  restorePoints: RestorePoint[];
  potentialRestorePoints: Map<number, RestorePoint>;
  nextDiffSheetNumber: number;
  nextScenarioSheetNumber: number;
  nextWorkflowId: number;
  nextRestorePointId: number;
}
```

Preserve the current initial values and reset behavior exactly. In particular, do not reset counters that `ChatWindow.reset()` does not currently reset.

The context may provide common operations used by multiple workflows, including potential-restore-point creation, transcript message lookup, LLM-history appends, and numbered diff-sheet creation. Keep these operations close to the shared state they mutate and continue using the existing transcript and restore-point helper modules.

## ChatWindow Integration

Replace the individual context-backed fields on `ChatWindow` with one private readonly `context` field. Create the DOM handlers in the constructor, construct the context once, and continue routing every input through `ChatWindow.updateState()`.

Update the existing methods to access the same values through `this.context` without changing behavior. `getMount()` returns `this.context.mount`. `ChatWindow` remains the component that owns the context, event handlers, reset behavior, and workflow dispatch.

## Verification

- Verify construction and reset produce the same initial state and DOM.
- Verify all existing workflow behavior remains unchanged before workflow extraction begins.
- Verify every workflow receives the same context instance.
- Verify there are no narrowed context interfaces, synchronization mechanisms, or duplicated state fields.
- Run lint, build, unit tests, and `git diff --check`.

