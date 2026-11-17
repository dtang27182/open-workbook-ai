# Application Architecture

The component contract is defined in [UI Component Architecture](./ui-component-architecture.md), with structural recommendations in its [implementation guide](./ui-component-architecture-implementation-guide.md).

## Module Responsibilities

- `src/taskpane/taskpane.ts` initializes `TaskpaneComponent`, which owns auth/chat mounting, UI provider status, and sign-in/sign-out event handling. It constructs one `ChatSession`, passes it through `ChatPage` to `ChatWindow`, and updates its UI provider status after session credential changes succeed. `pages/auth/auth-pages-component.ts` owns navigation among Welcome, the provider picker, OpenAI key entry, and OpenRouter auth. It attaches only the active child's existing mount and retains inactive child instances. `pages/auth/add-api-key/` owns key entry. `pages/auth/openrouter-auth/` owns the OpenRouter sign-in UI and authorization exchange. `src/auth-dialog/` handles the authorization callback.
- `pages/chat/chat-page.ts` composes `ChatHeader` and `ChatWindow`. The header displays the mark and title; `ChatWindow` displays the worksheet scope/review strip and Clear chat above the transcript, with the composer or review controls below it.
- `pages/chat/chat-window/chat-window.ts` owns chat UI events, its mount, the retained `ChatInput`, and panel sizing. It calls session commands and consumes `AsyncIterable<ChatSessionSnapshot>` updates inside `updateState()`. Its `dom/` helpers only render snapshot data.
- `src/backend/chat-session.ts` is the taskpane's entry point for backend commands and types. It owns conversation actions and exposes sign-in, sign-out, and provider-status methods. It owns a `ProviderManager` for the key stores in `src/backend/auth`, model selection, preprocessing models, and request endpoints. `TaskpaneComponent` retains a separate provider status for UI navigation and account display. Sign-out removes the active credential while retaining chat history and model selection.
- `src/backend/chat-session.ts` also defines the deeply read-only display contract, including the transcript, workflow and execution status, action availability, review details, restore summaries, and model choices. `getSessionSnapshot()` returns detached values without credentials, LLM history, or worksheet checkpoints. Internal workflow generators yield progress signals, and the session turns each signal into a snapshot.
- `pages/chat/chat-window/chat-input/chat-input.ts` owns the input form, textarea, Send button, and autosizing. `ChatWindow` supplies half the panel height as its height limit and owns the separate Clear button.
- `ChatSessionState` holds the session managers and restorable `ChatState`: transcript, LLM history, workflow state, pending edit, preprocessed sheet names, and the next workflow ID.
- `src/backend/workflows/` implements domain transitions and response processing. `src/backend/transcript-helpers.ts` contains the transcript mutation helpers. Transcript rendering belongs to the taskpane.
- `LLMManager` handles model operations through `InferenceClient`, which owns HTTP and streaming. Both use the shared `ProviderManager` for provider settings. The other `llm/` helpers format worksheet context and formula-inference results.
- `ExcelManager` owns worksheet reads, writes, diff/scenario creation, and generated sheet counters. `RestoreManager` owns potential and accepted restore checkpoints.

## Workflow State Transitions

New requests start from `answered` or `errored`. Submit and clarification workflows share `processModelResponse()` to choose the next state. The session tracks transient `actionRunning` status separately from restorable workflow state. Snapshots disable submission, review, and Restore while an action runs, including acceptance analysis and preprocessing continuation. On completion or handled failure, the final snapshot restores action availability.

Accept/Reject buttons are constructed once outside the transcript. `configChatControls()` applies snapshot availability to the composer and review footer. `renderChatTranscript()` receives Restore availability separately and never mutates transcript entries. The review warning derives from pending workflow state independently of execution status: starting an action retains the warning while the edit is pending, and leaving pending review clears it even if failure cleanup retains pending-edit data. Review buttons and execution status are not part of transcript history or restore checkpoints.

| Outcome or action               | Next state               | Effect                                                                                                      |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Model asks for clarification    | `awaiting_clarification` | The next submission answers the question within the same workflow; another clarification is possible.       |
| Model answers without edits     | `answered`               | Append the response without changing the worksheet.                                                         |
| Model proposes an in-place edit | `pending_edit`           | Create and activate a `Diff N` sheet; leave the source unchanged until review.                              |
| Accept a regular diff           | `answered`               | Write the diff back to the source, delete the diff, save a restore checkpoint, and request impact analysis. |
| Reject a regular diff           | `answered`               | Delete the diff without changing the source or saving a restore checkpoint.                                 |
| Model requests a scenario       | `answered`               | Create `Scenario N`, apply edits and a comparison, and append analysis; no Accept/Reject step.              |
| Action fails                    | `errored`                | Show an error; this does not imply workbook changes have been rolled back.                                  |

Formula inference is currently disabled for chat submissions. When enabled, it runs before the main query on the first request for a sheet. Proposed formulas enter `pending_edit_preprocessed`. Accept applies them and saves a restore checkpoint; reject discards them. Either decision continues the original query, which can reach any model-response outcome above. If no formulas are proposed, the query continues immediately. The sheet is marked preprocessed whether its proposal is accepted or rejected.

## Restore Semantics

- Before preprocessing or a main query, capture a potential checkpoint containing the current chat state and one worksheet snapshot. Accepting its diff promotes it to a usable restore point; rejection, an answer without edits, or scenario completion discards the potential checkpoint.
- Restore deletes any current pending diff, writes the selected worksheet snapshot back, and replaces chat state with the saved snapshot, including transcript, LLM history, preprocessing status, and next workflow ID.
- The selected restore point and all newer points are removed; older points remain. All potential checkpoints are cleared.
- Restore is not a whole-workbook rollback: it does not revert other worksheets or delete scenario sheets. Excel's generated sheet counters are not restored.
- Checkpoints exist only in memory. Clearing chat removes them without changing workbook contents; reloading the task pane also loses them.
