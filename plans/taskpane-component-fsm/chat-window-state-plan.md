# Chat Window State FIP

Status: implemented.

## Goal

Create one mutable `ChatWindowState` shared by every workflow class. The state makes the existing coupling explicit and allows workflow methods to move without large parameter lists. While submit logic remains in `ChatWindow`, workflows that continue into submission receive one shared callback for that operation.

Workflows run sequentially and are not interleaved. Do not add locking, workflow IDs for concurrency control, immutable state snapshots, or narrowed `Pick<ChatWindowState, ...>` types.

## Scope

Add `src/taskpane-fsm/pages/chat/chat-window-state.ts` and update `src/taskpane-fsm/pages/chat/chat-window.ts` to use it.

## State

Define a class containing the current ChatWindow dependencies and mutable workflow state:

```ts
export class ChatWindowState {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelApi: ExcelApi;
  readonly restoreManager: RestoreManager;

  chatState: ChatState;
  nextDiffSheetNumber: number;
  nextScenarioSheetNumber: number;
  nextWorkflowId: number;
}
```

Preserve the current initial values and reset behavior exactly. In particular, do not reset counters that `ChatWindow.reset()` does not currently reset.

The state may provide common operations used by multiple workflows, including LLM-history appends and numbered diff-sheet creation. Its `RestoreManager` owns restore history and the operations that mutate it.

## ChatWindow Integration

Replace the individual state-backed fields on `ChatWindow` with one private readonly `state` field. Create the DOM handlers in the constructor, construct the state once, and continue routing every input through `ChatWindow.updateState()`.

Update the existing methods to access the same values through `this.state` without changing behavior. `getMount()` returns `this.state.mount`. `ChatWindow` remains the component that owns the state, event handlers, reset behavior, and workflow dispatch.

## Verification

- Verify construction and reset produce the same initial state and DOM.
- Verify all existing workflow behavior remains unchanged before workflow extraction begins.
- Verify every workflow receives the same state instance.
- Verify there are no narrowed state interfaces, synchronization mechanisms, or duplicated state fields.
- Run lint, build, unit tests, and `git diff --check`.
