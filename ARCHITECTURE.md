# Architecture Overview

This repo is an Excel Office Add-in task pane for a spreadsheet assistant. The assistant reads the active worksheet, asks an OpenRouter model for analysis or proposed cell edits, previews edits on a temporary diff sheet, and lets the user accept, reject, or restore accepted changes.

## Main Modules

- `src/taskpane-fsm/taskpane.html` and `src/auth-dialog/openrouter-auth-dialog.html` are the Vite HTML entry points that Office opens.
- `src/taskpane-fsm/taskpane.ts` initializes `TaskpaneComponent`, which owns page selection, shared credentials, and sign-in/sign-out handling.
- `src/taskpane-fsm/pages/openrouter-auth/` contains the authentication component, key store, and authorization exchange.
- `src/taskpane-fsm/pages/chat/chat-page.ts` composes `ChatHeader` and `ChatWindow`.
- `src/taskpane-fsm/pages/chat/chat-window/chat-window.ts` owns chat input handling and state transitions, delegating to the modules in `workflows/` and DOM helpers in `dom/`.
- `chat-window-state.ts` holds component dependencies and restorable chat state; `restore-manager.ts` owns restore checkpoints.
- `llm-manager.ts` owns model operations through its `OpenRouterClient`; `openrouter-client.ts` handles HTTP and streaming responses.
- `excel-manager.ts` owns workbook operations and generated sheet counters; `sheet-markdown.ts` formats sheet context.

The original taskpane implementation and its runtime selector have been removed. The component contract and implementation guidance are in [Component FSM Architecture V2](docs/taskpane-component-fsm-architecture-v2.md) and its [implementation guide](docs/component-fsm-architecture-v2-implementation-guide.md).

## State Model

`ChatWindowState` holds stable dependencies and a restorable `ChatState`: transcript entries, LLM conversation history, workflow state, a pending edit, preprocessed sheet names, and the next workflow ID.

Transcript messages, working indicators, diff-review controls, and restore controls are explicit entries linked by workflow IDs. `RestoreManager` owns saved chat and sheet snapshots. Excel sheet counters belong to `ExcelManager` and are not restored.

## Event Flow

Chat handlers call `ChatWindow.updateState()`. It disables controls during an action, delegates workflow operations, and updates state and DOM through its helpers. Components keep their constructor-provided mounts for their lifetime.

OpenRouter streaming is generator-based. `LLMManager` converts client events into model-workflow events; submit and clarification workflows update the transcript and call `processModelResponse()` to apply completion results.

## Edit Lifecycle

Proposed edits are previewed on a temporary diff sheet first. The original worksheet is modified only when the user accepts.

- Accept writes the proposed sheet formulas to the original sheet and removes the diff sheet.
- Reject removes the diff sheet without editing the original sheet.
- Restore writes a saved pre-edit sheet snapshot back to Excel and restores the corresponding chat-state snapshot.
- Separate scenarios are created directly without modifying the baseline sheet or using the diff accept/reject flow.

## Tests

- Unit tests use `tests/excel-test-double.ts` and mocked OpenRouter calls.
- Component tests exercise the real `ChatWindow` with jsdom. `tests/run-tests.mjs` uses Vite to load TypeScript and raw HTML templates without starting a listening server.
- Live integration tests exercise the same component with real OpenRouter calls and verify high-level user-visible assistant behavior.
- Before changing tests, read `tests/implementation-spec.md` or `tests/integration-product-spec.md`.
- When changing integration tests, run the live tests.

## Conventions

- Visible chat transcript entries use `source`: `human` or `system`.
- LLM conversation history uses `role`: `user` or `assistant`.
- Keep types beside the FSM component, manager, or helper module responsible for their concepts; use type-only imports where appropriate.
