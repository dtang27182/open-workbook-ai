# Application Architecture

The component contract is defined in [Component Architecture](./component-architecture.md), with structural recommendations in its [implementation guide](./component-architecture-implementation-guide.md).

## Module Responsibilities

- `src/taskpane/taskpane.ts` initializes `TaskpaneComponent`, which owns page selection and sign-in/sign-out. `pages/openrouter-auth/` owns the sign-in UI, key storage, and authorization exchange; `src/auth-dialog/` handles the authorization callback.
- `pages/chat/chat-page.ts` composes `ChatHeader` and `ChatWindow`. The header displays provider details and the sign-out control.
- `pages/chat/chat-window/chat-window.ts` owns chat events and applies model responses. Its `workflows/` functions coordinate actions, and `dom/` helpers update the UI.
- `ChatWindowState` holds dependencies and `ChatState`: transcript, LLM history, workflow state, pending edit, preprocessed sheet names, and the next workflow ID.
- `LLMManager` handles model operations through `OpenRouterClient`, which owns HTTP and streaming. The other `llm/` helpers format worksheet context and formula-inference results.
- `ExcelManager` owns worksheet reads, writes, diff/scenario creation, and generated sheet counters. `RestoreManager` owns potential and accepted restore checkpoints.

## Workflow State Transitions

New requests start from `answered` or `errored`. Submit and clarification workflows share `processModelResponse()` to choose the next state. Controls are disabled while an action runs; there is no separate busy or scenario state.

| Outcome or action               | Next state               | Effect                                                                                                      |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Model asks for clarification    | `awaiting_clarification` | The next submission answers the question within the same workflow; another clarification is possible.       |
| Model answers without edits     | `answered`               | Append the response without changing the worksheet.                                                         |
| Model proposes an in-place edit | `pending_edit`           | Create and activate a `Diff N` sheet; leave the source unchanged until review.                              |
| Accept a regular diff           | `answered`               | Write the diff back to the source, delete the diff, save a restore checkpoint, and request impact analysis. |
| Reject a regular diff           | `answered`               | Delete the diff without changing the source or saving a restore checkpoint.                                 |
| Model requests a scenario       | `answered`               | Create `Scenario N`, apply edits and a comparison, and append analysis; no Accept/Reject step.              |
| Action fails                    | `errored`                | Show an error; this does not imply workbook changes have been rolled back.                                  |

On the first request for a sheet, formula inference runs before the main query. Proposed formulas enter `pending_edit_preprocessed`. Accept applies them and saves a restore checkpoint; reject discards them. Either decision continues the original query, which can reach any model-response outcome above. If no formulas are proposed, the query continues immediately. The sheet is marked preprocessed whether its proposal is accepted or rejected.

## Restore Semantics

- Before preprocessing or a main query, capture a potential checkpoint containing the current chat state and one worksheet snapshot. Accepting its diff promotes it to a usable restore point; rejection, an answer without edits, or scenario completion discards the potential checkpoint.
- Restore deletes any current pending diff, writes the selected worksheet snapshot back, and replaces chat state with the saved snapshot, including transcript, LLM history, preprocessing status, and next workflow ID.
- The selected restore point and all newer points are removed; older points remain. All potential checkpoints are cleared.
- Restore is not a whole-workbook rollback: it does not revert other worksheets or delete scenario sheets. Excel's generated sheet counters are not restored.
- Checkpoints exist only in memory. Clearing chat removes them without changing workbook contents; reloading the task pane also loses them.
