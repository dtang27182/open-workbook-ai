# Architecture Overview

This repo is an Excel Office Add-in task pane for a spreadsheet assistant. The assistant reads the active worksheet, asks an OpenRouter model for analysis or proposed cell edits, previews edits on a temporary diff sheet, and lets the user accept, reject, or restore accepted changes.

## Main Modules

- `taskpane.html` and `openrouter-auth-dialog.html` are the Vite HTML entry points that Office opens.
- `src/taskpane/taskpane.ts` is the browser entry point. It defines the page contract and manager, constructs the shared credential store and fixed page set, and owns initialization and navigation.
- `src/taskpane/pages/openrouter-auth/openrouter-auth-page.ts` owns the provider-auth DOM rendering and Sign In behavior.
- `src/taskpane/pages/chat/chat-page.ts` owns chat DOM rendering, UI event handlers, and its `ChatStateMachine` instance.
- `src/taskpane/pages/chat/chat-state-machine/chat-state-machine.ts` owns conversation state and the UI state machine.
- `src/taskpane/pages/chat/chat-state-machine/llm-model-workflow.ts` owns assistant workflow effects such as OpenRouter calls and Excel sheet edits. It does not depend on the DOM.
- `src/taskpane/pages/chat/chat-state-machine/openrouter-client.ts` owns OpenRouter HTTP and streaming response handling.
- `src/taskpane/pages/chat/chat-state-machine/excel-sheet-utils.ts` owns pure spreadsheet helpers.
- `src/taskpane/pages/chat/chat-state-machine/chat-types.ts` owns chat assistant TypeScript types.

## State Model

The task pane stores conversation state as `ConversationTurn` objects. A turn is the lifecycle unit for visible transcript entries, LLM conversation messages, proposed sheet edits, and restore state.

The rendered `chatTranscript` is derived from turns. UI markers such as restore controls and pending diff controls are derived from turn state rather than stored as independent state.

## Event Flow

`chat-state-machine.ts` owns `updateState()`. The chat submit button, accept button, reject button, and restore button all send UI input events to this single state-machine entry point. The UI disables controls while an input action is running, mutates the current conversation turn as workflow effects complete, then reads the current turn state to derive enabled controls.

OpenRouter streaming is generator-based. Low-level streamed text events are converted into assistant-level workflow events by `llm-model-workflow.ts`; `chat-state-machine.ts` applies those events to the visible transcript and current turn state.

## Edit Lifecycle

Proposed edits are previewed on a temporary diff sheet first. The original worksheet is modified only when the user accepts.

- Accept writes the proposed sheet formulas to the original sheet and removes the diff sheet.
- Reject removes the diff sheet without editing the original sheet.
- Restore writes a saved pre-edit sheet snapshot back to Excel and removes that edit turn and later turns from conversation state.

## Tests

- Unit tests use `tests/excel-test-double.ts` and mocked OpenRouter calls.
- Live integration tests use real OpenRouter calls and verify high-level user-visible assistant behavior.
- Before changing tests, read `tests/unit-test-strategy.md` or `tests/integration-test-strategy.md`.
- When changing integration tests, run the live tests.

## Conventions

- Visible chat transcript entries use `source`: `human` or `system`.
- LLM conversation history uses `role`: `user` or `assistant`.
- Keep chat assistant types in `src/taskpane/pages/chat/chat-state-machine/chat-types.ts`, not `llm-model-workflow.ts`.
